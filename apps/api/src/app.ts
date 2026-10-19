import Fastify, { type FastifyInstance } from 'fastify';
import { authPlugin } from './auth/plugin';
import type { Db } from './db/client';
import { authRoutes } from './routes/auth';
import { inviteRoutes } from './routes/invites';
import { memberRoutes } from './routes/members';
import { projectRoutes } from './routes/projects';

export interface AppOptions {
  db: Db;
  /** Defaults to true; turn off only for plain-http local dev and tests. */
  secureCookie?: boolean;
  logger?: boolean;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? process.env.NODE_ENV !== 'test' });

  app.get('/health', async () => ({ ok: true }));

  await app.register(authPlugin, { db: opts.db, secureCookie: opts.secureCookie });
  await app.register(authRoutes);
  await app.register(inviteRoutes);
  await app.register(memberRoutes);
  await app.register(projectRoutes);

  return app;
}
