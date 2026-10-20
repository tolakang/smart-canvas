/**
 * Session + authorization middleware. All auth checks live here (CLAUDE.md):
 * - every request gets `req.user` (or null) from the session cookie;
 * - `requireUser` → 401 when signed out;
 * - `requireTeam(min?)` → for routes with `:teamId`: 404 if not a member, 403 if the role is too low.
 *   Without `min`, viewers may only read (GET/HEAD/OPTIONS).
 * - the export worker (D27) reads with `x-render-token` = RENDER_TOKEN: viewer access to any team's
 *   viewer routes, GET/HEAD only, never a user session.
 */
import cookie from '@fastify/cookie';
import type { TeamRole } from '@smart-canvas/core';
import { and, eq, gt } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import fp from 'fastify-plugin';
import type { Db } from '../db/client';
import { memberships, sessions, users } from '../db/schema';
import { hasRole, minRoleForMethod } from './roles';
import { timingSafeEqual } from 'node:crypto';
import { hashToken, newToken } from './tokens';

export const SESSION_COOKIE = 'sc_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
    sessionId: string | null;
    membership: { teamId: string; role: TeamRole } | null;
  }
  interface FastifyInstance {
    db: Db;
    startSession(reply: FastifyReply, userId: string): Promise<void>;
    endSession(req: FastifyRequest, reply: FastifyReply): Promise<void>;
    /** True when the request carries the export worker's render token. */
    isRenderer(req: FastifyRequest): boolean;
  }
}

export interface AuthOptions {
  db: Db;
  /** Secure cookie flag; on unless explicitly disabled (local http dev, tests). */
  secureCookie?: boolean;
  /** Shared secret of the export worker (≥ 32 chars); unset = no renderer access. */
  renderToken?: string;
}

export const RENDER_TOKEN_HEADER = 'x-render-token';
export const MIN_RENDER_TOKEN = 32;

export const authPlugin = fp<AuthOptions>(async (app, opts) => {
  const { db } = opts;
  const secure = opts.secureCookie ?? true;

  await app.register(cookie);
  app.decorate('db', db);
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);
  app.decorateRequest('membership', null);

  const expected = opts.renderToken && opts.renderToken.length >= MIN_RENDER_TOKEN ? Buffer.from(opts.renderToken) : null;
  app.decorate('isRenderer', (req: FastifyRequest) => {
    const given = req.headers[RENDER_TOKEN_HEADER];
    if (!expected || typeof given !== 'string') return false;
    const buf = Buffer.from(given);
    return buf.length === expected.length && timingSafeEqual(buf, expected);
  });

  app.addHook('onRequest', async (req) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return;
    const id = hashToken(token);
    const [row] = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
      .limit(1);
    if (row) {
      req.user = row;
      req.sessionId = id;
    }
  });

  app.decorate('startSession', async (reply: FastifyReply, userId: string) => {
    const token = newToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      expires: expiresAt,
    });
  });

  app.decorate('endSession', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.sessionId) await db.delete(sessions).where(eq(sessions.id, req.sessionId));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
  });
});

/** The signed-in user on a route guarded by requireUser/requireTeam. */
export function currentUser(req: FastifyRequest): AuthUser {
  if (!req.user) throw new Error('route is missing an auth guard');
  return req.user;
}

export const requireUser: preHandlerAsyncHookHandler = async (req, reply) => {
  if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
};

export function requireTeam(min?: TeamRole): preHandlerAsyncHookHandler {
  return async function (req, reply) {
    const { teamId } = req.params as { teamId?: string };
    if (!req.user && this.isRenderer(req)) {
      // The export worker: read-only, and only on routes a viewer may use.
      if (!teamId || !UUID.test(teamId)) return reply.code(404).send({ error: 'not_found' });
      if (!(req.method === 'GET' || req.method === 'HEAD') || !hasRole('viewer', min ?? minRoleForMethod(req.method))) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      req.membership = { teamId, role: 'viewer' };
      return;
    }
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
    if (!teamId || !UUID.test(teamId)) return reply.code(404).send({ error: 'not_found' });
    const [m] = await this.db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.teamId, teamId), eq(memberships.userId, req.user.id)))
      .limit(1);
    if (!m) return reply.code(404).send({ error: 'not_found' }); // don't reveal other teams
    if (!hasRole(m.role, min ?? minRoleForMethod(req.method))) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    req.membership = { teamId, role: m.role };
  };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
