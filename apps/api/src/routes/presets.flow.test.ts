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

  it('N5: built-in campaign sizes carry their family; a team preset keeps the family it is given (blank = none)', async () => {
    const list = (await call('GET', base(), viewer)).json<SizePreset[]>();
    expect(list.filter((p) => p.family === 'GDN')).toHaveLength(7);
    expect(list.find((p) => p.name === 'A4')).not.toHaveProperty('family');
    const promo = (await call('POST', base(), admin, { group: 'social', name: 'Promo 300×250', family: ' Promo ', size: { width: 300, height: 250, unit: 'px' } })).json<SizePreset>();
    expect(promo.family).toBe('Promo');
    const single = (await call('PUT', `${base()}/${promo.id}`, admin, { group: 'social', name: 'Promo 300×250', family: '  ', size: { width: 300, height: 250, unit: 'px' } })).json<SizePreset>();
    expect(single).not.toHaveProperty('family');
    expect((await call('POST', base(), admin, { ...poster, family: 'x'.repeat(61) })).statusCode).toBe(400);
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

  it('M4: admins rename or delete a whole team family; built-in families and names are refused', async () => {
    const fam = (family: string) => `/teams/${teamId}/preset-families/${encodeURIComponent(family)}`;
    const add = (name: string, family: string, width: number) =>
      call('POST', base(), admin, { group: 'social', name, family, size: { width, height: 250, unit: 'px' } });
    await add('Shop A', 'Shop / web', 300);
    await add('Shop B', 'Shop / web', 728);
    await add('Other', 'Other', 160);
    const families = async () => (await call('GET', base(), viewer)).json<SizePreset[]>().filter((p) => p.teamId === teamId && p.family);

    expect((await call('PUT', fam('Shop / web'), editor, { name: 'Shop' })).statusCode).toBe(403);
    expect((await call('PUT', fam('Shop / web'), admin, { name: '  ' })).statusCode).toBe(400);
    expect((await call('PUT', fam('Shop / web'), admin, { name: 'gdn' })).json()).toEqual({ error: 'builtin_family' });
    expect((await call('PUT', fam('Shop / web'), admin, { name: 'Other' })).json()).toEqual({ error: 'family_exists' });
    expect((await call('PUT', fam('GDN'), admin, { name: 'Mine' })).statusCode).toBe(404); // built-ins are read-only
    const renamed = await call('PUT', fam('Shop / web'), admin, { name: ' Shop ' });
    expect(renamed.json()).toEqual({ family: 'Shop', count: 2 });
    expect((await families()).filter((p) => p.family === 'Shop').map((p) => p.name).sort()).toEqual(['Shop A', 'Shop B']);
    // A change of case is a rename of the same family.
    expect((await call('PUT', fam('Shop'), admin, { name: 'SHOP' })).json()).toEqual({ family: 'SHOP', count: 2 });

    expect((await call('DELETE', fam('SHOP'), editor)).statusCode).toBe(403);
    expect((await call('DELETE', fam('GDN'), admin)).statusCode).toBe(404);
    expect((await call('DELETE', fam('SHOP'), admin)).statusCode).toBe(204);
    expect((await families()).map((p) => p.family)).toEqual(['Other']);
    expect((await call('DELETE', fam('SHOP'), admin)).statusCode).toBe(404);
  });
});
