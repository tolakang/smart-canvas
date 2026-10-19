/**
 * Asset upload (images and SVG). The file type comes from magic bytes only; SVGs are sanitized before
 * storage; identical content within a team is stored once (sha256 of the stored bytes).
 */
import { createHash } from 'node:crypto';
import multipart from '@fastify/multipart';
import { LIMITS } from '@smart-canvas/core';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { dimensions } from '../assets/dimensions';
import { readFontFamily } from '../assets/font';
import { sniff } from '../assets/sniff';
import { sanitizeSvg, SvgRejected } from '../assets/svg-sanitize';
import { currentUser, requireTeam } from '../auth/plugin';
import { assets } from '../db/schema';
import type { ObjectStore } from '../storage/object-store';

export const MAX_UPLOAD_BYTES = LIMITS.maxUploadMB * 1024 * 1024;

const assetColumns = {
  id: assets.id,
  kind: assets.kind,
  mime: assets.mime,
  bytes: assets.bytes,
  sha256: assets.sha256,
  width: assets.width,
  height: assets.height,
  fontFamily: assets.fontFamily,
  createdAt: assets.createdAt,
};
type Params = { teamId: string; assetId: string };
const assetParams = {
  type: 'object',
  required: ['teamId', 'assetId'],
  properties: { teamId: { type: 'string' }, assetId: { type: 'string', format: 'uuid' } },
} as const;

export const assetRoutes: FastifyPluginAsync<{ store: ObjectStore }> = async (app, { store }) => {
  const { db } = app;
  const member = requireTeam();
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0, parts: 1 } });

  app.post<{ Params: { teamId: string } }>('/teams/:teamId/assets', { preHandler: member }, async (req, reply) => {
    if (!req.isMultipart()) return reply.code(415).send({ error: 'multipart_required' });
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'file_required' });
    let body: Uint8Array = await file.toBuffer(); // throws 413 past MAX_UPLOAD_BYTES

    const type = sniff(body);
    if (!type) {
      return reply.code(415).send({ error: 'unsupported_type', accepted: ['png', 'jpg', 'webp', 'svg', 'ttf', 'otf', 'woff2'] });
    }
    let fontFamily: string | null = null;
    if (type.kind === 'font') {
      fontFamily = readFontFamily(body);
      if (!fontFamily) return reply.code(422).send({ error: 'font_rejected' });
    }
    if (type.kind === 'vector') {
      try {
        body = new TextEncoder().encode(sanitizeSvg(new TextDecoder().decode(body)));
      } catch (err) {
        if (err instanceof SvgRejected) return reply.code(422).send({ error: 'svg_rejected', reason: err.message });
        throw err;
      }
    }
    const dims = type.kind === 'font' ? null : dimensions(body);
    if (type.kind === 'image' && !dims) return reply.code(422).send({ error: 'unreadable_image' });

    const { teamId } = req.params;
    const sha256 = createHash('sha256').update(body).digest('hex');
    const storageKey = `teams/${teamId}/assets/${sha256}.${type.ext}`;
    const [existing] = await db
      .select(assetColumns)
      .from(assets)
      .where(and(eq(assets.teamId, teamId), eq(assets.sha256, sha256)));
    if (existing) return reply.code(200).send(existing);

    await store.put(storageKey, body, type.mime); // content-addressed: re-putting the same key is harmless
    const [created] = await db
      .insert(assets)
      .values({
        teamId,
        kind: type.kind,
        mime: type.mime,
        bytes: body.byteLength,
        sha256,
        storageKey,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
        fontFamily,
        createdBy: currentUser(req).id,
      })
      .onConflictDoNothing({ target: [assets.teamId, assets.sha256] })
      .returning(assetColumns);
    if (created) return reply.code(201).send(created);
    // Lost a race with an identical upload.
    const [winner] = await db
      .select(assetColumns)
      .from(assets)
      .where(and(eq(assets.teamId, teamId), eq(assets.sha256, sha256)));
    return reply.code(200).send(winner);
  });

  /** Team fonts (T2.5), for the font list and for registering FontFaces in the browser and the export worker. */
  app.get<{ Params: { teamId: string } }>('/teams/:teamId/fonts', { preHandler: member }, async (req) => {
    return db
      .select({ id: assets.id, family: assets.fontFamily, mime: assets.mime, createdAt: assets.createdAt })
      .from(assets)
      .where(and(eq(assets.teamId, req.params.teamId), eq(assets.kind, 'font')))
      .orderBy(assets.fontFamily);
  });

  app.get<{ Params: { teamId: string } }>('/teams/:teamId/assets', { preHandler: member }, async (req) => {
    return db.select(assetColumns).from(assets).where(eq(assets.teamId, req.params.teamId)).orderBy(desc(assets.createdAt));
  });

  app.get<{ Params: Params }>(
    '/teams/:teamId/assets/:assetId',
    { preHandler: member, schema: { params: assetParams } },
    async (req, reply) => {
      const [row] = await db
        .select(assetColumns)
        .from(assets)
        .where(and(eq(assets.id, req.params.assetId), eq(assets.teamId, req.params.teamId)));
      return row ?? reply.code(404).send({ error: 'not_found' });
    },
  );

  app.get<{ Params: Params }>(
    '/teams/:teamId/assets/:assetId/content',
    { preHandler: member, schema: { params: assetParams } },
    async (req, reply) => {
      const [row] = await db
        .select({ mime: assets.mime, storageKey: assets.storageKey })
        .from(assets)
        .where(and(eq(assets.id, req.params.assetId), eq(assets.teamId, req.params.teamId)));
      if (!row) return reply.code(404).send({ error: 'not_found' });
      const body = await store.get(row.storageKey);
      if (!body) return reply.code(404).send({ error: 'not_found' });
      return reply
        .header('content-type', row.mime)
        .header('x-content-type-options', 'nosniff')
        // Defense in depth for SVG opened directly: no script, no external loads.
        .header('content-security-policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox")
        .header('cache-control', 'private, max-age=31536000, immutable') // content-addressed
        .send(Buffer.from(body));
    },
  );
};
