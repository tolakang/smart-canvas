import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { SESSION_COOKIE } from '../auth/plugin';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export function cookieOf(res: LightMyRequestResponse): string {
  const c = res.cookies.find((c) => c.name === SESSION_COOKIE);
  if (!c) throw new Error(`no session cookie (status ${res.statusCode})`);
  return `${SESSION_COOKIE}=${c.value}`;
}

export function caller(app: FastifyInstance) {
  return (method: Method, url: string, cookie?: string, payload?: object) =>
    app.inject({ method, url, payload, headers: cookie ? { cookie } : {} });
}

/** Signs up a team admin (via setup or, if setup is taken, an existing admin cookie) and returns helpers to add members. */
export async function setupTeam(app: FastifyInstance) {
  const call = caller(app);
  const setup = await call('POST', '/auth/setup', undefined, {
    email: 'admin@example.com',
    password: 'password123',
    name: 'Admin',
    teamName: 'Studio',
  });
  const admin = cookieOf(setup);
  const teamId = (await call('GET', '/auth/me', admin)).json().teams[0].id as string;

  let n = 0;
  async function member(role: 'admin' | 'editor' | 'viewer') {
    const { token } = (await call('POST', `/teams/${teamId}/invites`, admin, { role })).json();
    const res = await call('POST', `/invites/${token}/accept`, undefined, {
      email: `${role}${++n}@example.com`,
      password: 'password123',
      name: role,
    });
    return cookieOf(res);
  }
  return { teamId, admin, member };
}
