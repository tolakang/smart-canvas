import type { ProjectDoc } from '@smart-canvas/core';
import { createBoardProject, createProjectDoc, LIMITS } from '@smart-canvas/core';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { MemoryStore } from '../storage/object-store';
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
    app = await buildApp({ db: fresh.db, store: new MemoryStore(), secureCookie: false, logger: false });
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

  it('creates a project with the page-3 board (D49) at rev 0', async () => {
    const p = await create('Launch poster');
    expect(p.rev).toBe(0);
    expect(p.doc).toEqual(createBoardProject('Launch poster'));

    const list = (await call('GET', base(), viewer)).json<{ id: string; name: string; rev: number }[]>();
    expect(list.find((x) => x.id === p.id)).toMatchObject({ name: 'Launch poster', rev: 0 });

    const got = await call('GET', `${base()}/${p.id}`, viewer);
    expect(got.json()).toMatchObject({ id: p.id, rev: 0, doc: p.doc });
  });

  it('saves with the current rev, bumps it, and stores the doc', async () => {
    const p = await create();
    const doc = { ...p.doc, name: 'Renamed', compositions: p.doc.compositions.map((c) => ({ ...c, size: { width: 210, height: 297, unit: 'mm' as const } })) };
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
    const tooMany = Array.from({ length: LIMITS.maxSources + 1 }, (_, i) => ({
      id: `s${i}`,
      label: 'x',
      kind: 'fill',
      behavesLike: 'background',
      visible: true,
      content: { kind: 'fill', fill: { type: 'solid', color: '#000' } },
      board: { x: 0, y: 0 },
    }));
    for (const doc of [
      { ...p.doc, sources: tooMany },
      { ...p.doc, schema: 3 },
      { ...p.doc, name: '' },
      { ...p.doc, compositions: p.doc.compositions.map((c) => ({ ...c, size: { width: 0, height: 10, unit: 'px' } })) },
      { ...p.doc, compositions: [] },
      { ...p.doc, edges: [{ id: 'x', from: 'a', to: 'b', kind: 'pipe' }] },
    ]) {
      expect((await call('PUT', `${base()}/${p.id}`, editor, { rev: 0, doc })).statusCode).toBe(400);
    }
    // D39: past the old 10-input cap.
    expect((await call('PUT', `${base()}/${p.id}`, editor, { rev: 0, doc: { ...p.doc, sources: tooMany.slice(0, 12) } })).statusCode).toBe(
      200,
    );
  });

  it('upgrades a v1 document (D32): accepted on save, stored and served as v2', async () => {
    const p = await create();
    const v1 = {
      schema: 1,
      rev: 0,
      name: 'Old client',
      master: { size: { width: 2000, height: 1000, unit: 'px' }, placements: { subject: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } }, board: { x: 0, y: 0 } },
      sources: createProjectDoc('Old client').sources.map((s, i) => ({ ...s, port: 3 - i })),
      outputs: [],
      wires: [{ id: 'in:subject', from: 'subject', to: 'main', port: 2 }],
    };
    expect((await call('PUT', `${base()}/${p.id}`, editor, { rev: 0, doc: v1 })).statusCode).toBe(200);
    const got = (await call('GET', `${base()}/${p.id}`, editor)).json<{ doc: ProjectDoc }>().doc;
    expect(got.schema).toBe(2);
    expect(got.compositions[0]).toMatchObject({ id: 'main', size: { width: 2000, height: 1000, unit: 'px' }, layers: ['logo', 'headline', 'subject', 'background'] });
    expect(got.edges).toEqual([{ id: 'in:subject', from: 'subject', to: 'main', kind: 'layer' }]);
  });

  it('deletes', async () => {
    const p = await create();
    expect((await call('DELETE', `${base()}/${p.id}`, editor)).statusCode).toBe(204);
    expect((await call('GET', `${base()}/${p.id}`, editor)).statusCode).toBe(404);
    expect((await call('PUT', `${base()}/${p.id}`, editor, { rev: 0, doc: p.doc })).statusCode).toBe(404);
    expect((await call('DELETE', `${base()}/${p.id}`, editor)).statusCode).toBe(404);
  });

  it('renames a project: the name, doc.name and a new rev (an open board reloads instead of saving the old name back)', async () => {
    const p = await create('Spring');
    const res = await call('PATCH', `${base()}/${p.id}`, editor, { name: '  Summer sale ' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: p.id, name: 'Summer sale', rev: p.rev + 1 });
    const got = (await call('GET', `${base()}/${p.id}`, editor)).json<{ rev: number; doc: ProjectDoc }>();
    expect(got).toMatchObject({ rev: p.rev + 1, doc: { name: 'Summer sale', rev: p.rev + 1 } });
    expect((await call('PUT', `${base()}/${p.id}`, editor, { rev: p.rev, doc: p.doc })).statusCode).toBe(409);
    expect((await call('PATCH', `${base()}/${p.id}`, editor, { name: '   ' })).statusCode).toBe(400);
    expect((await call('PATCH', `${base()}/${p.id}`, viewer, { name: 'x' })).statusCode).toBe(403);
    expect((await call('PATCH', `${base()}/00000000-0000-4000-8000-000000000000`, editor, { name: 'x' })).statusCode).toBe(404);
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

  it('duplicates a project as a full detached copy (T7.3)', async () => {
    const p = await create('Spring');
    const doc = { ...p.doc, sources: p.doc.sources.map((x) => (x.id === 'subject' ? { ...x, label: 'Title' } : x)) };
    expect((await call('PUT', `${base()}/${p.id}`, editor, { rev: p.rev, doc })).statusCode).toBe(200);
    const res = await call('POST', `${base()}/${p.id}/duplicate`, editor, {});
    expect(res.statusCode).toBe(201);
    const copy = res.json<{ id: string; rev: number; doc: ProjectDoc; isTemplate: boolean }>();
    expect(copy).toMatchObject({ rev: 0, isTemplate: false, doc: { name: 'Spring (copy)', rev: 0 } });
    expect(copy.doc.sources.find((x) => x.id === 'subject')?.label).toBe('Title');
    expect(copy.id).not.toBe(p.id);
    expect((await call('POST', `${base()}/${p.id}/duplicate`, viewer, {})).statusCode).toBe(403);
  });

  it('templates: save as template, list apart, new project from a template (T7.3)', async () => {
    const p = await create('Brand kit');
    const tpl = (await call('POST', `${base()}/${p.id}/duplicate`, editor, { name: 'Brand template', isTemplate: true })).json<{ id: string; isTemplate: boolean }>();
    expect(tpl.isTemplate).toBe(true);
    const list = (await call('GET', base(), viewer)).json<{ id: string; isTemplate: boolean }[]>();
    expect(list.find((x) => x.id === tpl.id)?.isTemplate).toBe(true);
    const fromTpl = await call('POST', base(), editor, { name: 'Autumn', templateId: tpl.id });
    expect(fromTpl.statusCode).toBe(201);
    expect(fromTpl.json()).toMatchObject({ isTemplate: false, doc: { name: 'Autumn', rev: 0 } });
    // Only templates can seed a project, and only from this team.
    expect((await call('POST', base(), editor, { name: 'X', templateId: p.id })).json()).toEqual({ error: 'template_not_found' });
  });
});
