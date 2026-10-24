import Fastify, { type FastifyInstance } from 'fastify';
import { authPlugin } from './auth/plugin';
import type { Db } from './db/client';
import type { ExportQueue } from './exports/queue';
import { assetRoutes } from './routes/assets';
import { authRoutes } from './routes/auth';
import { exportRoutes } from './routes/exports';
import { inviteRoutes } from './routes/invites';
import { libraryRoutes } from './routes/library';
import { memberRoutes } from './routes/members';
import { presetRoutes } from './routes/presets';
import { projectRoutes } from './routes/projects';
import { reviewRoutes } from './routes/review';
import { thumbnailRoutes } from './routes/thumbnails';
import { versionRoutes } from './routes/versions';
import type { ObjectStore } from './storage/object-store';

export interface AppOptions {
  db: Db;
  store: ObjectStore;
  /** Defaults to true; turn off only for plain-http local dev and tests. */
  secureCookie?: boolean;
  /** Export worker's read-only token (RENDER_TOKEN). */
  renderToken?: string;
  /** Export job queue (pg-boss); without it exports answer 503. */
  queue?: ExportQueue;
  logger?: boolean;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? process.env.NODE_ENV !== 'test' });

  app.get('/health', async () => ({ ok: true }));

  await app.register(authPlugin, { db: opts.db, secureCookie: opts.secureCookie, renderToken: opts.renderToken });
  await app.register(authRoutes);
  await app.register(inviteRoutes);
  await app.register(memberRoutes);
  await app.register(projectRoutes, { store: opts.store });
  await app.register(versionRoutes);
  await app.register(reviewRoutes);
  await app.register(presetRoutes);
  await app.register(libraryRoutes);
  await app.register(assetRoutes, { store: opts.store });
  await app.register(thumbnailRoutes, { store: opts.store });
  await app.register(exportRoutes, { queue: opts.queue, store: opts.store });

  return app;
}
