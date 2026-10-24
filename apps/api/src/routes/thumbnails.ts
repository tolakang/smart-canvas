/**
 * D64 (U5b): a small picture of each project for the Projects home. The board draws one of the project's Previews
 * in the browser after a save and PUTs it here; the image sits in the object store under `thumbs/<projectId>`, and
 * `projects.thumb_at` says when (the list sends it, so a card asks for a fresh picture only when there is one).
 * Only PNG, JPEG and WebP, checked by magic bytes; not part of the doc, history or review.
 */
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { requireTeam } from '../auth/plugin';
import { sniff } from '../assets/sniff';
import { projects } from '../db/schema';
import type { ObjectStore } from '../storage/object-store';

/** A thumbnail is at most this many bytes (a 640 px WebP is ~30 KB). */
export const MAX_THUMB_BYTES = 512 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

type Params = { teamId: string; projectId: string };
const params = {
  type: 'object',
  required: ['teamId', 'projectId'],
  properties: { teamId: { type: 'string' }, projectId: { type: 'string', format: 'uuid' } },
} as const;

export const thumbKey = (projectId: string) => `thumbs/${projectId}`;

export const thumbnailRoutes: FastifyPluginAsync<{ store: ObjectStore }> = async (app, { store }) => {
  const { db } = app;
  const member = requireTeam(); // viewers see, editors and admins store
  const inTeam = (p: Params) => and(eq(projects.id, p.projectId), eq(projects.teamId, p.teamId));

  // The image comes as the raw body (Content-Type is only a hint; the bytes decide).
  app.addContentTypeParser(IMAGE_TYPES, { parseAs: 'buffer', bodyLimit: MAX_THUMB_BYTES }, (_req, body, done) => done(null, body));

  app.put<{ Params: Params; Body: Buffer }>('/teams/:teamId/projects/:projectId/thumbnail', { preHandler: member, schema: { params } }, async (req, reply) => {
    const body = req.body;
    if (!Buffer.isBuffer(body)) return reply.code(415).send({ error: 'image_required' });
    const type = sniff(body);
    if (type?.kind !== 'image') return reply.code(415).send({ error: 'image_required' });
    const [row] = await db.select({ id: projects.id }).from(projects).where(inTeam(req.params));
    if (!row) return reply.code(404).send({ error: 'not_found' });
    await store.put(thumbKey(row.id), new Uint8Array(body), type.mime);
    // Not a save: rev, updated_at and the project's place in "Recent" stay as they are.
    const [out] = await db.update(projects).set({ thumbAt: sql`now()` }).where(eq(projects.id, row.id)).returning({ thumbAt: projects.thumbAt });
    return out;
  });

  app.get<{ Params: Params }>('/teams/:teamId/projects/:projectId/thumbnail', { preHandler: member, schema: { params } }, async (req, reply) => {
    const [row] = await db.select({ id: projects.id, thumbAt: projects.thumbAt }).from(projects).where(inTeam(req.params));
    if (!row?.thumbAt) return reply.code(404).send({ error: 'not_found' });
    const body = await store.get(thumbKey(row.id));
    const type = body && sniff(body);
    if (!body || type?.kind !== 'image') return reply.code(404).send({ error: 'not_found' });
    return reply
      .header('content-type', type.mime)
      .header('x-content-type-options', 'nosniff')
      // The list's thumbAt goes in the URL, so a new picture is a new URL.
      .header('cache-control', 'private, max-age=86400')
      .send(Buffer.from(body));
  });
};
