import type { ProjectDoc } from '@smart-canvas/core';
import { createProjectDoc } from '@smart-canvas/core';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { adminUrl, freshDb } from '../test/db';
import { caller, setupTeam } from '../test/team';

describe.skipIf(!adminUrl)('projects API (Postgres)', () => {
  let app: FastifyInstance;
  let drop: () => Promise<void>;
  let call: ReturnType<typeof caller>;
  let teamId = '';
  let editor = '';
  let viewer = '';
  const base = () => `/teams/${teamId}/projects`;

  beforeAll(async () => {
    const fresh = await freshDb();
    drop = fresh.drop;
    app = await buildApp({ db: fresh.db, secureCookie: false, logger: false });
    call = caller(app);
    const team = await setupTeam(app);
    teamId = team.teamId;
    editor = await team.member('editor');
    viewer = await team.member('viewer');
  });
  afterAll(async () => {
    await app?.close();
    await drop?.();
  });

  async function create(name = 'Poster') {
    const res = await call('POST', base(), editor, { name });
    expect(res.statusCode).toBe(201);
    return res.json<{ id: string; rev: number; doc: ProjectDoc }>();
  }

  it('creates a project with an empty document at rev 0', async () => {
    const p = await create('Launch poster');
    expect(p.rev).toBe(0);
    expect(p.doc).toEqual(createProjectDoc('Launch poster'));

    const list = (await call('GET', base(), viewer)).json<{ id: string; name: string; rev: number }[]>();
    expect(list.find((x) => x.id === p.id)).toMatchObject({ name: 'Launch poster', rev: 0 });

    const got = await call('GET', `${base()}/${p.id}`, viewer);
    expect(got.json()).toMatchObject({ id: p.id, rev: 0, doc: p.doc });
  });

  it('saves with the current rev, bumps it, and stores the doc', async () => {
    const p = await create();
    const doc = { ...p.doc, name: 'Renamed', master: { ...p.doc.master, size: { width: 210, height: 297, unit: 'mm' } } };
    const res = await call('PUT', `${base()}/${p.id}`, editor, { rev: 0, doc });
    expect(res.statusCode).toBe(200);
    expect(res.json().rev).toBe(1);

    const got = (await call('GET', `${base()}/${p.id}`, editor)).json();
    expect(got.rev).toBe(1);
    expect(got.doc).toEqual({ ...doc, rev: 1 }); // server mirrors rev into the doc
    const listed = (await call('GET', base(), editor)).json<{ id: string; name: string }[]>();
    expect(listed.find((x) => x.id === p.id)?.name).toBe('Renamed');
  });

  it('rejects a stale write with 409 and the current rev', async () => {
    const p = await create();
    expect((await call('PUT', `${base()}/${p.id}`, editor, { rev: 0, doc: p.doc })).statusCode).toBe(200);
    // A second client still holding rev 0:
    const stale = await call('PUT', `${base()}/${p.id}`, editor, { rev: 0, doc: { ...p.doc, name: 'Lost update' } });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ error: 'stale_rev', rev: 1 });
    expect((await call('GET', `${base()}/${p.id}`, editor)).json().doc.name).toBe('Poster');
  });

  it('lets exactly one of two concurrent saves on the same rev win', async () => {
    const p = await create();
    const results = await Promise.all(
      [1, 2, 3].map((i) => call('PUT', `${base()}/${p.id}`, editor, { rev: 0, doc: { ...p.doc, name: `v${i}` } })),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409, 409]);
    expect((await call('GET', `${base()}/${p.id}`, editor)).json().rev).toBe(1);
  });

  it('validates the document shape and caps', async () => {
    const p = await create();
    const tooMany = Array.from({ length: 11 }, (_, i) => ({
      id: `s${i}`,
      label: 'x',
      kind: 'fill',
      behavesLike: 'background',
      port: i % 10,
      visible: true,
      content: { kind: 'fill', fill: { type: 'solid', color: '#000' } },
      board: { x: 0, y: 0 },
    }));
    for (const doc of [
      { ...p.doc, sources: tooMany },
      { ...p.doc, schema: 2 },
      { ...p.doc, name: '' },
      { ...p.doc, master: { ...p.doc.master, size: { width: 0, height: 10, unit: 'px' } } },
    ]) {
      expect((await call('PUT', `${base()}/${p.id}`, editor, { rev: 0, doc })).statusCode).toBe(400);
    }
    expect((await call('PUT', `${base()}/${p.id}`, editor, { rev: 0, doc: { ...p.doc, sources: tooMany.slice(0, 10) } })).statusCode).toBe(
      200,
    );
  });

  it('deletes', async () => {
    const p = await create();
    expect((await call('DELETE', `${base()}/${p.id}`, editor)).statusCode).toBe(204);
    expect((await call('GET', `${base()}/${p.id}`, editor)).statusCode).toBe(404);
    expect((await call('PUT', `${base()}/${p.id}`, editor, { rev: 0, doc: p.doc })).statusCode).toBe(404);
    expect((await call('DELETE', `${base()}/${p.id}`, editor)).statusCode).toBe(404);
  });

  it('viewers read only; other teams and signed-out users get nothing', async () => {
    const p = await create();
    expect((await call('GET', `${base()}/${p.id}`, viewer)).statusCode).toBe(200);
    expect((await call('POST', base(), viewer, { name: 'x' })).statusCode).toBe(403);
    expect((await call('PUT', `${base()}/${p.id}`, viewer, { rev: 0, doc: p.doc })).statusCode).toBe(403);
    expect((await call('DELETE', `${base()}/${p.id}`, viewer)).statusCode).toBe(403);
    expect((await call('GET', base())).statusCode).toBe(401);

    // Same project id under a team the caller isn't in → 404, never the project.
    const otherTeam = '00000000-0000-4000-8000-000000000000';
    expect((await call('GET', `/teams/${otherTeam}/projects/${p.id}`, editor)).statusCode).toBe(404);
    expect((await call('GET', `${base()}/not-a-uuid`, editor)).statusCode).toBe(400);
  });
});
