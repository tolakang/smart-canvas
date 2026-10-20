/**
 * Team library (D14, T7.1): sources saved for reuse across the team's projects. Everyone in the team
 * reads it; editors and admins add, rename and delete. Items may only point at the team's own assets.
 */
import { isValidLibraryEntry, type Behavior, type LibraryItem, type SourceContent, type SourceKind } from '@smart-canvas/core';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { currentUser, requireTeam } from '../auth/plugin';
import { assets, libraryItems } from '../db/schema';

type Params = { teamId: string; itemId: string };
type Body = { name: string; tags?: string[]; kind: SourceKind; behavesLike: Behavior; content: SourceContent };

const tags = { type: 'array', maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 40 } } as const;
const name = { type: 'string', minLength: 1, maxLength: 200 } as const;
const createBody = {
  type: 'object',
  required: ['name', 'kind', 'behavesLike', 'content'],
  additionalProperties: false,
  properties: {
    name,
    tags,
    kind: { enum: ['image', 'vector', 'text', 'fill'] },
    behavesLike: { enum: ['background', 'subject', 'text', 'logo', 'decoration'] },
    content: { type: 'object', required: ['kind'], properties: { kind: { enum: ['image', 'vector', 'text', 'fill'] } } },
  },
} as const;
const patchBody = { type: 'object', additionalProperties: false, minProperties: 1, properties: { name, tags } } as const;
const itemParams = {
  type: 'object',
  required: ['teamId', 'itemId'],
  properties: { teamId: { type: 'string' }, itemId: { type: 'string', format: 'uuid' } },
} as const;

type Row = typeof libraryItems.$inferSelect;
const toItem = (r: Row): LibraryItem & { createdAt: string } => ({
  id: r.id,
  teamId: r.teamId,
  name: r.name,
  tags: r.tags,
  kind: r.kind,
  behavesLike: r.behavesLike,
  content: r.content,
  createdAt: r.createdAt.toISOString(),
});

const cleanTags = (t: string[] = []) => [...new Set(t.map((x) => x.trim().toLowerCase()).filter(Boolean))];

export const libraryRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;
  const member = requireTeam(); // viewers read, editors and admins write
  const own = (p: Params) => and(eq(libraryItems.id, p.itemId), eq(libraryItems.teamId, p.teamId));

  app.get<{ Params: { teamId: string } }>('/teams/:teamId/library', { preHandler: member }, async (req) => {
    const rows = await db.select().from(libraryItems).where(eq(libraryItems.teamId, req.params.teamId)).orderBy(desc(libraryItems.createdAt));
    return rows.map(toItem);
  });

  app.post<{ Params: { teamId: string }; Body: Body }>(
    '/teams/:teamId/library',
    { preHandler: member, schema: { body: createBody } },
    async (req, reply) => {
      const { content } = req.body;
      if (!isValidLibraryEntry(req.body)) return reply.code(400).send({ error: 'bad_behavior' });
      // An image/vector item may only reference an asset of this team.
      if ((content.kind === 'image' || content.kind === 'vector') && content.assetId) {
        const [asset] = await db
          .select({ id: assets.id })
          .from(assets)
          .where(and(eq(assets.id, content.assetId), eq(assets.teamId, req.params.teamId)));
        if (!asset) return reply.code(400).send({ error: 'unknown_asset' });
      }
      const [row] = await db
        .insert(libraryItems)
        .values({
          teamId: req.params.teamId,
          name: req.body.name.trim(),
          tags: cleanTags(req.body.tags),
          kind: req.body.kind,
          behavesLike: req.body.behavesLike,
          content,
          createdBy: currentUser(req).id,
        })
        .returning();
      return reply.code(201).send(row && toItem(row));
    },
  );

  app.patch<{ Params: Params; Body: { name?: string; tags?: string[] } }>(
    '/teams/:teamId/library/:itemId',
    { preHandler: member, schema: { params: itemParams, body: patchBody } },
    async (req, reply) => {
      const [row] = await db
        .update(libraryItems)
        .set({
          ...(req.body.name !== undefined ? { name: req.body.name.trim() } : {}),
          ...(req.body.tags !== undefined ? { tags: cleanTags(req.body.tags) } : {}),
          updatedAt: new Date(),
        })
        .where(own(req.params))
        .returning();
      return row ? toItem(row) : reply.code(404).send({ error: 'not_found' });
    },
  );

  app.delete<{ Params: Params }>('/teams/:teamId/library/:itemId', { preHandler: member, schema: { params: itemParams } }, async (req, reply) => {
    const [row] = await db.delete(libraryItems).where(own(req.params)).returning({ id: libraryItems.id });
    return row ? reply.code(204).send() : reply.code(404).send({ error: 'not_found' });
  });
};
