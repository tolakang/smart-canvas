import type { LibraryItem } from '@smart-canvas/core';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { MemoryStore } from '../storage/object-store';
import { adminUrl, freshDb } from '../test/db';
import { caller, setupTeam } from '../test/team';

describe.skipIf(!adminUrl)('team library API (Postgres)', () => {
  let app: FastifyInstance;
  let drop: () => Promise<void>;
  let call: ReturnType<typeof caller>;
  let teamId = '';
  let editor = '';
  let viewer = '';
  const base = () => `/teams/${teamId}/library`;
  const fill = { name: 'Brand red', tags: ['Brand', 'brand', ' colour '], kind: 'fill', behavesLike: 'background', content: { kind: 'fill', fill: { type: 'solid', color: '#cc0000' } } };

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

  it('editors save items, everyone in the team lists them', async () => {
    const res = await call('POST', base(), editor, fill);
    expect(res.statusCode).toBe(201);
    expect(res.json<LibraryItem>()).toMatchObject({ name: 'Brand red', tags: ['brand', 'colour'], kind: 'fill', behavesLike: 'background', content: fill.content });
    expect((await call('GET', base(), viewer)).json<LibraryItem[]>().map((i) => i.name)).toEqual(['Brand red']);
    expect((await call('POST', base(), viewer, fill)).statusCode).toBe(403);
  });

  it('rejects bad kind/behaviour pairs and assets of other teams', async () => {
    expect((await call('POST', base(), editor, { ...fill, behavesLike: 'logo' })).json()).toEqual({ error: 'bad_behavior' });
    expect((await call('POST', base(), editor, { ...fill, kind: 'text' })).json()).toEqual({ error: 'bad_behavior' });
    const foreign = { name: 'Logo', kind: 'vector', behavesLike: 'logo', content: { kind: 'vector', assetId: '00000000-0000-4000-8000-000000000000', focal: { x: 0.5, y: 0.5 } } };
    expect((await call('POST', base(), editor, foreign)).json()).toEqual({ error: 'unknown_asset' });
  });

  it('renames, retags and deletes', async () => {
    const item = (await call('POST', base(), editor, { ...fill, name: 'Temp' })).json<LibraryItem>();
    expect((await call('PATCH', `${base()}/${item.id}`, editor, { name: 'Sale red', tags: ['sale'] })).json()).toMatchObject({ name: 'Sale red', tags: ['sale'] });
    expect((await call('PATCH', `${base()}/${item.id}`, viewer, { name: 'x' })).statusCode).toBe(403);
    expect((await call('DELETE', `${base()}/${item.id}`, editor)).statusCode).toBe(204);
    expect((await call('DELETE', `${base()}/${item.id}`, editor)).statusCode).toBe(404);
  });
});
