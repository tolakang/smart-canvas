import type { SizePreset } from '@smart-canvas/core';
import { presets as builtIns } from '@smart-canvas/presets';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { runMigrations } from '../db/migrate';
import { MemoryStore } from '../storage/object-store';
import { adminUrl, freshDb } from '../test/db';
import { caller, setupTeam } from '../test/team';

describe.skipIf(!adminUrl)('presets API (Postgres)', () => {
  let app: FastifyInstance;
  let url = '';
  let drop: () => Promise<void>;
  let call: ReturnType<typeof caller>;
  let teamId = '';
  let admin = '';
  let editor = '';
  let viewer = '';
  const base = () => `/teams/${teamId}/presets`;
  const poster = { group: 'print', name: 'Shop poster', size: { width: 500, height: 700, unit: 'mm' }, dpi: 150, bleedMm: 5 };

  beforeAll(async () => {
    const fresh = await freshDb();
    drop = fresh.drop;
    url = fresh.url;
    app = await buildApp({ db: fresh.db, store: new MemoryStore(), secureCookie: false, logger: false });
    call = caller(app);
    const team = await setupTeam(app);
    teamId = team.teamId;
    admin = team.admin;
    editor = await team.member('editor');
    viewer = await team.member('viewer');
  });
  afterAll(async () => {
    await app?.close();
    await drop?.();
  });

  it('lists the seeded built-ins to every member', async () => {
    const list = (await call('GET', base(), viewer)).json<SizePreset[]>();
    expect(list).toHaveLength(builtIns.length);
    expect(list.find((p) => p.name === 'A4')).toEqual(builtIns.find((p) => p.name === 'A4'));
    expect(list.find((p) => p.name === 'Instagram portrait 4:5')).toEqual(builtIns.find((p) => p.name === 'Instagram portrait 4:5'));
  });

  it('re-running migrations keeps one row per built-in', async () => {
    await runMigrations(url);
    expect((await call('GET', base(), viewer)).json<SizePreset[]>()).toHaveLength(builtIns.length);
  });

  it('admins add, edit and delete team presets; editors and viewers cannot', async () => {
    expect((await call('POST', base(), editor, poster)).statusCode).toBe(403);
    expect((await call('POST', base(), viewer, poster)).statusCode).toBe(403);
    const created = await call('POST', base(), admin, poster);
    expect(created.statusCode).toBe(201);
    const p = created.json<SizePreset>();
    expect(p).toMatchObject({ teamId, group: 'print', name: 'Shop poster', size: { width: 500, height: 700, unit: 'mm' }, dpi: 150, bleedMm: 5 });
    expect((await call('GET', base(), viewer)).json<SizePreset[]>().some((x) => x.id === p.id)).toBe(true);

    expect((await call('PUT', `${base()}/${p.id}`, editor, poster)).statusCode).toBe(403);
    const edited = await call('PUT', `${base()}/${p.id}`, admin, { ...poster, name: 'Window poster', dpi: null });
    expect(edited.json()).toMatchObject({ name: 'Window poster', bleedMm: 5 });
    expect(edited.json()).not.toHaveProperty('dpi');

    expect((await call('DELETE', `${base()}/${p.id}`, editor)).statusCode).toBe(403);
    expect((await call('DELETE', `${base()}/${p.id}`, admin)).statusCode).toBe(204);
    expect((await call('DELETE', `${base()}/${p.id}`, admin)).statusCode).toBe(404);
  });

  it('built-ins are read-only and bad input is rejected', async () => {
    const a4 = builtIns.find((p) => p.name === 'A4');
    expect((await call('PUT', `${base()}/${a4?.id}`, admin, poster)).statusCode).toBe(404);
    expect((await call('DELETE', `${base()}/${a4?.id}`, admin)).statusCode).toBe(404);
    expect((await call('POST', base(), admin, { ...poster, size: { width: 0, height: 1, unit: 'mm' } })).statusCode).toBe(400);
    expect((await call('POST', base(), admin, { ...poster, group: 'billboard' })).statusCode).toBe(400);
    expect((await call('POST', base(), admin, { ...poster, name: '' })).statusCode).toBe(400);
  });

  it('other teams never see a team preset', async () => {
    const created = (await call('POST', base(), admin, poster)).json<SizePreset>();
    expect((await call('GET', `/teams/00000000-0000-4000-8000-000000000000/presets`, admin)).statusCode).toBe(404);
    expect(created.teamId).toBe(teamId);
  });
});
