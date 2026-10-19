import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { MemoryStore } from '../storage/object-store';
import { requireTeam, SESSION_COOKIE } from '../auth/plugin';
import type { Db } from '../db/client';
import { invites } from '../db/schema';
import { adminUrl, freshDb } from '../test/db';

describe.skipIf(!adminUrl)('auth, invites and roles (Postgres)', () => {
  let app: FastifyInstance;
  let db: Db;
  let drop: () => Promise<void>;
  let teamId = '';
  let adminCookie = '';

  const cookieOf = (res: LightMyRequestResponse) => {
    const c = res.cookies.find((c) => c.name === SESSION_COOKIE);
    if (!c) throw new Error('no session cookie');
    return `${SESSION_COOKIE}=${c.value}`;
  };
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, cookie?: string, payload?: object) =>
    app.inject({ method, url, payload, headers: cookie ? { cookie } : {} });

  async function invite(role: string, email?: string) {
    const res = await call('POST', `/teams/${teamId}/invites`, adminCookie, { role, ...(email ? { email } : {}) });
    expect(res.statusCode).toBe(201);
    return res.json<{ id: string; token: string }>();
  }
  async function join(role: string, email: string) {
    const { token } = await invite(role);
    const res = await call('POST', `/invites/${token}/accept`, undefined, { email, password: 'password123', name: role });
    expect(res.statusCode).toBe(200);
    return { cookie: cookieOf(res), userId: (await call('GET', '/auth/me', cookieOf(res))).json().user.id as string };
  }

  beforeAll(async () => {
    ({ db, drop } = await freshDb());
    app = await buildApp({ db, store: new MemoryStore(), secureCookie: false, logger: false });
    // A non-admin team route, to prove the generic viewer-is-read-only rule.
    app.post('/teams/:teamId/probe', { preHandler: requireTeam() }, async () => ({ ok: true }));
    app.get('/teams/:teamId/probe', { preHandler: requireTeam() }, async () => ({ ok: true }));
  });
  afterAll(async () => {
    await app?.close();
    await drop?.();
  });

  it('setup creates the first admin and a team, only once', async () => {
    const body = { email: 'Admin@Example.com', password: 'password123', name: 'Ada', teamName: 'Studio' };
    const res = await call('POST', '/auth/setup', undefined, body);
    expect(res.statusCode).toBe(201);
    const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
    adminCookie = cookieOf(res);

    const me = await call('GET', '/auth/me', adminCookie);
    expect(me.json().user.email).toBe('admin@example.com');
    expect(me.json().teams).toMatchObject([{ name: 'Studio', role: 'admin' }]);
    teamId = me.json().teams[0].id;

    expect((await call('POST', '/auth/setup', undefined, { ...body, email: 'x@example.com' })).statusCode).toBe(409);
  });

  it('login checks the password and logout kills the session', async () => {
    expect((await call('POST', '/auth/login', undefined, { email: 'admin@example.com', password: 'nope' })).statusCode).toBe(
      401,
    );
    expect((await call('POST', '/auth/login', undefined, { email: 'ghost@example.com', password: 'password123' })).statusCode).toBe(
      401,
    );
    const res = await call('POST', '/auth/login', undefined, { email: 'ADMIN@example.com', password: 'password123' });
    expect(res.statusCode).toBe(200);
    const cookie = cookieOf(res);
    expect((await call('GET', '/auth/me', cookie)).statusCode).toBe(200);
    await call('POST', '/auth/logout', cookie);
    expect((await call('GET', '/auth/me', cookie)).statusCode).toBe(401);
    expect((await call('GET', '/auth/me')).statusCode).toBe(401);
  });

  it('invite link: preview, accept once, then dead', async () => {
    const { token } = await invite('editor');
    const preview = await call('GET', `/invites/${token}`);
    expect(preview.json()).toMatchObject({ teamName: 'Studio', role: 'editor' });

    const accept = await call('POST', `/invites/${token}/accept`, undefined, {
      email: 'ed@example.com',
      password: 'password123',
      name: 'Ed',
    });
    expect(accept.statusCode).toBe(200);
    const me = await call('GET', '/auth/me', cookieOf(accept));
    expect(me.json().teams).toMatchObject([{ id: teamId, role: 'editor' }]);

    expect((await call('GET', `/invites/${token}`)).statusCode).toBe(404);
    const again = await call('POST', `/invites/${token}/accept`, undefined, {
      email: 'ed2@example.com',
      password: 'password123',
      name: 'Ed2',
    });
    expect(again.statusCode).toBe(404);
  });

  it('rejects expired, revoked and email-bound mismatches; existing accounts must sign in', async () => {
    const expired = await invite('viewer');
    await db.update(invites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invites.id, expired.id));
    expect((await call('GET', `/invites/${expired.token}`)).statusCode).toBe(404);

    const revoked = await invite('viewer');
    expect((await call('DELETE', `/teams/${teamId}/invites/${revoked.id}`, adminCookie)).statusCode).toBe(204);
    expect((await call('GET', `/invites/${revoked.token}`)).statusCode).toBe(404);

    const bound = await invite('viewer', 'bound@example.com');
    const wrong = await call('POST', `/invites/${bound.token}/accept`, undefined, {
      email: 'other@example.com',
      password: 'password123',
      name: 'O',
    });
    expect(wrong.statusCode).toBe(403);

    const existing = await invite('viewer');
    const res = await call('POST', `/invites/${existing.token}/accept`, undefined, {
      email: 'ed@example.com',
      password: 'password123',
      name: 'Ed',
    });
    expect(res.statusCode).toBe(409);
  });

  it('enforces roles: viewer read-only, admin-only management, non-members see nothing', async () => {
    const viewer = await join('viewer', 'vi@example.com');
    const editor = await join('editor', 'ed3@example.com');

    expect((await call('GET', `/teams/${teamId}/probe`, viewer.cookie)).statusCode).toBe(200);
    expect((await call('POST', `/teams/${teamId}/probe`, viewer.cookie)).statusCode).toBe(403);
    expect((await call('POST', `/teams/${teamId}/probe`, editor.cookie)).statusCode).toBe(200);

    expect((await call('GET', `/teams/${teamId}/members`, viewer.cookie)).statusCode).toBe(200);
    expect((await call('POST', `/teams/${teamId}/invites`, editor.cookie, { role: 'viewer' })).statusCode).toBe(403);
    expect((await call('GET', `/teams/${teamId}/invites`, viewer.cookie)).statusCode).toBe(403);
    expect(
      (await call('PATCH', `/teams/${teamId}/members/${viewer.userId}`, editor.cookie, { role: 'admin' })).statusCode,
    ).toBe(403);

    // Someone with an account but no membership.
    const otherTeam = await join('viewer', 'outsider@example.com');
    await call('DELETE', `/teams/${teamId}/members/${otherTeam.userId}`, adminCookie);
    expect((await call('GET', `/teams/${teamId}/members`, otherTeam.cookie)).statusCode).toBe(404);
    expect((await call('GET', `/teams/not-a-uuid/members`, adminCookie)).statusCode).toBe(404);
    expect((await call('GET', `/teams/${teamId}/members`)).statusCode).toBe(401);
  });

  it('a signed-in user can accept an invite to join', async () => {
    const outsider = await call('POST', '/auth/login', undefined, { email: 'outsider@example.com', password: 'password123' });
    const { token } = await invite('editor');
    const res = await call('POST', `/invites/${token}/accept`, cookieOf(outsider), {});
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ teamId, role: 'editor' });
  });

  it('never leaves a team without an admin', async () => {
    const me = (await call('GET', '/auth/me', adminCookie)).json().user.id as string;
    expect((await call('PATCH', `/teams/${teamId}/members/${me}`, adminCookie, { role: 'editor' })).statusCode).toBe(409);
    expect((await call('DELETE', `/teams/${teamId}/members/${me}`, adminCookie)).statusCode).toBe(409);

    const second = await join('editor', 'second@example.com');
    expect((await call('PATCH', `/teams/${teamId}/members/${second.userId}`, adminCookie, { role: 'admin' })).statusCode).toBe(
      204,
    );
    expect((await call('PATCH', `/teams/${teamId}/members/${me}`, adminCookie, { role: 'editor' })).statusCode).toBe(204);
    // Now an editor: management is closed to them.
    expect((await call('GET', `/teams/${teamId}/invites`, adminCookie)).statusCode).toBe(403);
  });
});
