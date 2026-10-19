import Fastify, { type FastifyInstance } from 'fastify';
import { authPlugin } from './auth/plugin';
import type { Db } from './db/client';
import { assetRoutes } from './routes/assets';
import { authRoutes } from './routes/auth';
import { inviteRoutes } from './routes/invites';
import { memberRoutes } from './routes/members';
import { projectRoutes } from './routes/projects';
import type { ObjectStore } from './storage/object-store';

export interface AppOptions {
  db: Db;
  store: ObjectStore;
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
  await app.register(assetRoutes, { store: opts.store });

  return app;
}
