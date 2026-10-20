import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { MemoryStore } from '../storage/object-store';
import { adminUrl, freshDb } from '../test/db';
import { caller, setupTeam } from '../test/team';

const TOKEN = 'r'.repeat(40);

describe.skipIf(!adminUrl)('render token (export worker read access)', () => {
  let app: FastifyInstance;
  let drop: () => Promise<void>;
  let teamId = '';
  let projectId = '';
  const as = (token: string | undefined, method: 'GET' | 'PUT' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: token ? { 'x-render-token': token } : {} });

  beforeAll(async () => {
    const fresh = await freshDb();
    drop = fresh.drop;
    app = await buildApp({ db: fresh.db, store: new MemoryStore(), secureCookie: false, logger: false, renderToken: TOKEN });
    const team = await setupTeam(app);
    teamId = team.teamId;
    projectId = (await caller(app)('POST', `/teams/${teamId}/projects`, team.admin, { name: 'P' })).json().id;
  });
  afterAll(async () => {
    await app?.close();
    await drop?.();
  });

  it('reads project, fonts, assets and presets of any team', async () => {
    for (const path of [`projects/${projectId}`, 'fonts', 'assets', 'presets']) {
      expect((await as(TOKEN, 'GET', `/teams/${teamId}/${path}`)).statusCode, path).toBe(200);
    }
  });

  it('never writes, never reaches admin routes, and needs the exact token', async () => {
    const { rev, doc } = (await as(TOKEN, 'GET', `/teams/${teamId}/projects/${projectId}`)).json();
    expect((await as(TOKEN, 'PUT', `/teams/${teamId}/projects/${projectId}`, { rev, doc })).statusCode).toBe(403);
    expect((await as(TOKEN, 'POST', `/teams/${teamId}/projects`, { name: 'x' })).statusCode).toBe(403);
    expect((await as(TOKEN, 'GET', `/teams/${teamId}/invites`)).statusCode).toBe(403);
    expect((await as(TOKEN.slice(1), 'GET', `/teams/${teamId}/fonts`)).statusCode).toBe(401);
    expect((await as(undefined, 'GET', `/teams/${teamId}/fonts`)).statusCode).toBe(401);
    expect((await as(TOKEN, 'GET', '/auth/me')).statusCode).toBe(401);
  });

  it('is off when no token (or a short one) is configured', async () => {
    const fresh = await freshDb();
    const off = await buildApp({ db: fresh.db, store: new MemoryStore(), secureCookie: false, logger: false, renderToken: 'short' });
    expect((await off.inject({ method: 'GET', url: `/teams/${teamId}/fonts`, headers: { 'x-render-token': 'short' } })).statusCode).toBe(401);
    await off.close();
    await fresh.drop();
  });
});
