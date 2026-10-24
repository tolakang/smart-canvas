import type { ProjectDoc } from '@smart-canvas/core';
import { createProjectDoc } from '@smart-canvas/core';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import type { Db } from '../db/client';
import { projectVersions } from '../db/schema';
import { MemoryStore } from '../storage/object-store';
import { adminUrl, freshDb } from '../test/db';
import { caller, setupTeam } from '../test/team';
import { KEEP_AUTO, MAX_NAMED } from './versions';

interface Version {
  id: string;
  rev: number;
  kind: string;
  label: string;
  by: string | null;
}

describe.skipIf(!adminUrl)('project history API (Postgres, D62)', () => {
  let app: FastifyInstance;
  let db: Db;
  let drop: () => Promise<void>;
  let call: ReturnType<typeof caller>;
  let teamId = '';
  let editor = '';
  let viewer = '';
  const base = () => `/teams/${teamId}/projects`;

  beforeAll(async () => {
    const fresh = await freshDb();
    drop = fresh.drop;
    db = fresh.db;
    app = await buildApp({ db, store: new MemoryStore(), secureCookie: false, logger: false });
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
  const versions = async (id: string, who = editor) => (await call('GET', `${base()}/${id}/versions`, who)).json<Version[]>();
  /** Saves `doc` on top of `rev`; returns the new rev. */
  async function save(id: string, rev: number, doc: ProjectDoc) {
    const res = await call('PUT', `${base()}/${id}`, editor, { rev, doc });
    expect(res.statusCode).toBe(200);
    return res.json<{ rev: number }>().rev;
  }
  /** As if the project's versions were all kept `minutes` ago. */
  const age = (id: string, minutes: number) =>
    db.update(projectVersions).set({ createdAt: sql`created_at - ${`${minutes} minutes`}::interval` }).where(eq(projectVersions.projectId, id));

  it('keeps the doc a save replaces once, then again only after 10 minutes of editing', async () => {
    const p = await create();
    let rev = await save(p.id, 0, { ...p.doc, name: 'A' }); // the first save keeps the doc as created
    expect(await versions(p.id)).toMatchObject([{ rev: 0, kind: 'auto', label: '', by: 'editor' }]);
    rev = await save(p.id, rev, { ...p.doc, name: 'B' });
    rev = await save(p.id, rev, { ...p.doc, name: 'C' });
    expect(await versions(p.id)).toHaveLength(1); // saves a few seconds apart keep nothing more
    await age(p.id, 11);
    await save(p.id, rev, { ...p.doc, name: 'D' });
    const list = await versions(p.id);
    expect(list.map((v) => [v.rev, v.kind])).toEqual([
      [3, 'auto'],
      [0, 'auto'],
    ]);
    const got = (await call('GET', `${base()}/${p.id}/versions/${list[0]?.id}`, viewer)).json<{ doc: ProjectDoc }>();
    expect(got.doc).toMatchObject({ name: 'C', rev: 3 }); // the doc as it was before the save that kept it
  });

  it('keeps the doc before a save that removes panels, even right after another version', async () => {
    const p = await create();
    let rev = await save(p.id, 0, p.doc);
    const fewer = { ...p.doc, sources: p.doc.sources.slice(1), edges: p.doc.edges.filter((e) => e.from !== p.doc.sources[0]?.id) };
    rev = await save(p.id, rev, fewer);
    expect((await versions(p.id)).map((v) => [v.rev, v.kind, v.label])).toEqual([
      [1, 'before-delete', '1 panel'],
      [0, 'auto', ''],
    ]);
    const none = { ...fewer, sources: [], edges: [] };
    await save(p.id, rev, none);
    expect((await versions(p.id))[0]).toMatchObject({ rev: 2, kind: 'before-delete', label: `${fewer.sources.length} panels` });
  });

  it(`prunes to the newest ${KEEP_AUTO} kept versions; named ones stay`, async () => {
    const p = await create();
    let rev = await save(p.id, 0, p.doc);
    expect((await call('POST', `${base()}/${p.id}/versions`, editor, { label: '  Sent to client ' })).statusCode).toBe(201);
    for (let i = 0; i < KEEP_AUTO + 2; i++) {
      await age(p.id, 11);
      rev = await save(p.id, rev, { ...p.doc, name: `v${i}` });
    }
    const list = await versions(p.id);
    expect(list.filter((v) => v.kind === 'auto')).toHaveLength(KEEP_AUTO);
    expect(list.filter((v) => v.kind === 'named')).toMatchObject([{ rev: 1, label: 'Sent to client', by: 'editor' }]);
    expect(Math.min(...list.filter((v) => v.kind === 'auto').map((v) => v.rev))).toBe(rev - KEEP_AUTO);
  });

  it('restores: the current doc is kept first, the version becomes the next rev, and an open board gets 409', async () => {
    const p = await create('Spring');
    let rev = await save(p.id, 0, p.doc);
    const fewer = { ...p.doc, outputs: [], sources: p.doc.sources.slice(0, 2), edges: [] };
    rev = await save(p.id, rev, fewer); // kept rev 1 as before-delete
    const target = (await versions(p.id)).find((v) => v.kind === 'before-delete');
    expect(target?.rev).toBe(1);
    expect((await call('PATCH', `${base()}/${p.id}`, editor, { name: 'Summer' })).statusCode).toBe(200);
    rev += 1;

    const res = await call('POST', `${base()}/${p.id}/versions/${target?.id}/restore`, editor);
    expect(res.statusCode).toBe(200);
    const restored = res.json<{ rev: number; doc: ProjectDoc }>();
    expect(restored.rev).toBe(rev + 1);
    expect(restored.doc).toEqual({ ...p.doc, name: 'Summer', rev: rev + 1 }); // the project keeps its current name
    expect((await call('GET', `${base()}/${p.id}`, viewer)).json()).toMatchObject({ rev: rev + 1, doc: restored.doc });
    expect((await versions(p.id))[0]).toMatchObject({ rev, kind: 'before-restore' });
    // A board still holding the old rev:
    expect((await call('PUT', `${base()}/${p.id}`, editor, { rev, doc: fewer })).statusCode).toBe(409);
  });

  it('opens a version saved before a schema change as the current schema', async () => {
    const p = await create();
    await save(p.id, 0, p.doc);
    const [v] = await versions(p.id);
    const out = { id: 'o1', label: 'IG', size: { width: 1080, height: 1080, unit: 'px' }, overrides: [], board: { x: 0, y: 0 } };
    const v3 = { ...createProjectDoc('Old'), schema: 3, outputs: [{ ...out, family: 'side' }] };
    await db.update(projectVersions).set({ doc: v3 as unknown as ProjectDoc }).where(eq(projectVersions.id, v?.id ?? ''));
    const got = (await call('GET', `${base()}/${p.id}/versions/${v?.id}`, editor)).json<{ doc: ProjectDoc }>().doc;
    expect(got.schema).toBe(4);
    expect(got.outputs).toEqual([out]);
  });

  it(`names up to ${MAX_NAMED} versions; deletes one`, async () => {
    const p = await create();
    expect((await call('POST', `${base()}/${p.id}/versions`, editor, { label: '   ' })).statusCode).toBe(400);
    for (let i = 0; i < MAX_NAMED; i++) expect((await call('POST', `${base()}/${p.id}/versions`, editor, { label: `n${i}` })).statusCode).toBe(201);
    const over = await call('POST', `${base()}/${p.id}/versions`, editor, { label: 'one more' });
    expect(over.statusCode).toBe(409);
    expect(over.json()).toEqual({ error: 'named_limit', max: MAX_NAMED });
    const [first] = await versions(p.id);
    expect((await call('DELETE', `${base()}/${p.id}/versions/${first?.id}`, editor)).statusCode).toBe(204);
    expect((await call('DELETE', `${base()}/${p.id}/versions/${first?.id}`, editor)).statusCode).toBe(404);
    expect((await call('POST', `${base()}/${p.id}/versions`, editor, { label: 'one more' })).statusCode).toBe(201);
  });

  it('viewers read history only; other teams and other projects get nothing', async () => {
    const p = await create();
    await save(p.id, 0, p.doc);
    const [v] = await versions(p.id, viewer);
    expect(v).toBeDefined();
    expect((await call('GET', `${base()}/${p.id}/versions/${v?.id}`, viewer)).statusCode).toBe(200);
    expect((await call('POST', `${base()}/${p.id}/versions`, viewer, { label: 'x' })).statusCode).toBe(403);
    expect((await call('POST', `${base()}/${p.id}/versions/${v?.id}/restore`, viewer)).statusCode).toBe(403);
    expect((await call('DELETE', `${base()}/${p.id}/versions/${v?.id}`, viewer)).statusCode).toBe(403);
    expect((await call('GET', `${base()}/${p.id}/versions`)).statusCode).toBe(401);

    const other = await create('Other');
    expect((await call('GET', `${base()}/${other.id}/versions/${v?.id}`, editor)).statusCode).toBe(404);
    expect((await call('POST', `${base()}/${other.id}/versions/${v?.id}/restore`, editor)).statusCode).toBe(404);
    const otherTeam = '00000000-0000-4000-8000-000000000000';
    expect((await call('GET', `/teams/${otherTeam}/projects/${p.id}/versions`, editor)).statusCode).toBe(404);
    expect((await call('GET', `${base()}/${p.id}/versions/not-a-uuid`, editor)).statusCode).toBe(400);
  });

  it('a project deleted takes its history with it', async () => {
    const p = await create();
    await save(p.id, 0, p.doc);
    expect((await call('DELETE', `${base()}/${p.id}`, editor)).statusCode).toBe(204);
    expect(await db.select().from(projectVersions).where(eq(projectVersions.projectId, p.id))).toEqual([]);
  });
});
