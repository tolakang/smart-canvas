import { addOutput, type ExportJob, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { MemoryStore } from '../storage/object-store';
import { adminUrl, freshDb } from '../test/db';
import { caller, setupTeam } from '../test/team';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe.skipIf(!adminUrl)('exports API (Postgres)', () => {
  let app: FastifyInstance;
  let drop: () => Promise<void>;
  let call: ReturnType<typeof caller>;
  let teamId = '';
  let projectId = '';
  let editor = '';
  let viewer = '';
  const sent: string[] = [];
  const base = () => `/teams/${teamId}/projects/${projectId}/exports`;

  beforeAll(async () => {
    const fresh = await freshDb();
    drop = fresh.drop;
    app = await buildApp({ db: fresh.db, store: new MemoryStore(), secureCookie: false, logger: false, queue: { send: async (id) => void sent.push(id) } });
    call = caller(app);
    const team = await setupTeam(app);
    teamId = team.teamId;
    editor = await team.member('editor');
    viewer = await team.member('viewer');
    const p = (await call('POST', `/teams/${teamId}/projects`, editor, { name: 'Poster' })).json<{ id: string; rev: number; doc: ProjectDoc }>();
    projectId = p.id;
    let doc = ok(addOutput(p.doc, { id: 'ig', label: 'Instagram', size: { width: 1080, height: 1350, unit: 'px' } }));
    doc = ok(addOutput(doc, { id: 'a4', label: 'A4', size: { width: 210, height: 297, unit: 'mm' }, dpi: 300, bleedMm: 3 }));
    doc = ok(addOutput(doc, { id: 'huge', label: 'Huge', size: { width: 6001, height: 100, unit: 'px' } }));
    expect((await call('PUT', `/teams/${teamId}/projects/${projectId}`, editor, { rev: p.rev, doc })).statusCode).toBe(200);
  });
  afterAll(async () => {
    await app?.close();
    await drop?.();
  });

  it('creates one queued job per output and queues each', async () => {
    const res = await call('POST', base(), editor, { outputIds: ['ig', 'a4'], format: 'png', options: { quality: 80 } });
    expect(res.statusCode).toBe(202);
    const jobs = res.json<ExportJob[]>();
    expect(jobs.map((j) => [j.outputIds, j.format, j.status, j.progress])).toEqual([
      [['ig'], 'png', 'queued', 0],
      [['a4'], 'png', 'queued', 0],
    ]);
    expect(sent.slice(-2)).toEqual(jobs.map((j) => j.id));
  });

  it('lists jobs for every member, or the ones asked for', async () => {
    const all = (await call('GET', base(), viewer)).json<ExportJob[]>();
    expect(all.length).toBeGreaterThanOrEqual(2);
    const one = (await call('GET', `${base()}?ids=${all[0]?.id}`, viewer)).json<ExportJob[]>();
    expect(one.map((j) => j.id)).toEqual([all[0]?.id]);
  });

  it('refuses viewers, unknown outputs, bad formats and over-cap rasters (T6.7)', async () => {
    expect((await call('POST', base(), viewer, { outputIds: ['ig'], format: 'png' })).statusCode).toBe(403);
    expect((await call('POST', base(), editor, { outputIds: ['nope'], format: 'png' })).json()).toEqual({ error: 'unknown_output' });
    expect((await call('POST', base(), editor, { outputIds: ['ig'], format: 'gif' })).statusCode).toBe(400);
    const huge = await call('POST', base(), editor, { outputIds: ['huge'], format: 'png', options: { scale: 2 } });
    expect(huge.statusCode).toBe(422);
    expect(huge.json()).toEqual({ error: 'export_too_large', messages: ['Huge: 12002 × 200 px is over the 12000 px limit'] });
    expect((await call('POST', base(), editor, { outputIds: ['huge'], format: 'pdf' })).statusCode).toBe(202); // vector: no pixel cap
    expect((await call('POST', base(), editor, { outputIds: ['ig'], format: 'svg', options: { outlineText: true } })).json()).toMatchObject({ error: 'outline_text_unavailable' });
  });

  it('404s other projects and answers 503 without a queue', async () => {
    expect((await call('GET', `/teams/${teamId}/projects/00000000-0000-4000-8000-000000000000/exports`, editor)).statusCode).toBe(404);
    const fresh = await freshDb();
    const noQueue = await buildApp({ db: fresh.db, store: new MemoryStore(), secureCookie: false, logger: false });
    const t = await setupTeam(noQueue);
    const p = (await caller(noQueue)('POST', `/teams/${t.teamId}/projects`, t.admin, { name: 'P' })).json<{ id: string }>();
    expect((await caller(noQueue)('POST', `/teams/${t.teamId}/projects/${p.id}/exports`, t.admin, { outputIds: ['x'], format: 'png' })).statusCode).toBe(503);
    await noQueue.close();
    await fresh.drop();
  });
});
