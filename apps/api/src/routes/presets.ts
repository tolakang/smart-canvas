/**
 * Size presets (T4.8, D16): built-ins (team_id null, seeded from @smart-canvas/presets) plus the team's own.
 * Everyone in the team reads them; admins add, edit and delete the team's presets. Built-ins are read-only.
 */
import type { SizePreset } from '@smart-canvas/core';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { requireTeam } from '../auth/plugin';
import { presets } from '../db/schema';

type Row = typeof presets.$inferSelect;
type Params = { teamId: string; presetId: string };
type Body = { group: 'print' | 'social'; name: string; size: { width: number; height: number; unit: 'px' | 'mm' }; dpi?: number | null; bleedMm?: number | null };

const body = {
  type: 'object',
  required: ['group', 'name', 'size'],
  additionalProperties: false,
  properties: {
    group: { enum: ['print', 'social'] },
    name: { type: 'string', minLength: 1, maxLength: 120 },
    size: {
      type: 'object',
      required: ['width', 'height', 'unit'],
      additionalProperties: false,
      properties: {
        width: { type: 'number', exclusiveMinimum: 0, maximum: 100000 },
        height: { type: 'number', exclusiveMinimum: 0, maximum: 100000 },
        unit: { enum: ['px', 'mm'] },
      },
    },
    dpi: { type: ['integer', 'null'], minimum: 72, maximum: 1200 },
    bleedMm: { type: ['number', 'null'], minimum: 0, maximum: 50 },
  },
} as const;
const presetParams = {
  type: 'object',
  required: ['teamId', 'presetId'],
  properties: { teamId: { type: 'string' }, presetId: { type: 'string', format: 'uuid' } },
} as const;

export function toPreset(r: Row): SizePreset {
  return {
    id: r.id,
    teamId: r.teamId,
    group: r.group,
    name: r.name,
    size: { width: r.width, height: r.height, unit: r.unit },
    ...(r.dpi !== null ? { dpi: r.dpi } : {}),
    ...(r.bleedMm !== null ? { bleedMm: r.bleedMm } : {}),
  };
}

const columns = (b: Body) => ({
  group: b.group,
  name: b.name.trim(),
  width: b.size.width,
  height: b.size.height,
  unit: b.size.unit,
  dpi: b.dpi ?? null,
  bleedMm: b.bleedMm ?? null,
});

export const presetRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;
  const admin = requireTeam('admin');
  const own = (p: Params) => and(eq(presets.id, p.presetId), eq(presets.teamId, p.teamId));

  app.get<{ Params: { teamId: string } }>('/teams/:teamId/presets', { preHandler: requireTeam() }, async (req) => {
    const rows = await db
      .select()
      .from(presets)
      .where(or(isNull(presets.teamId), eq(presets.teamId, req.params.teamId)))
      .orderBy(asc(presets.group), sql`${presets.teamId} nulls first`, asc(presets.createdAt), asc(presets.name));
    return rows.map(toPreset);
  });

  app.post<{ Params: { teamId: string }; Body: Body }>('/teams/:teamId/presets', { preHandler: admin, schema: { body } }, async (req, reply) => {
    const [row] = await db
      .insert(presets)
      .values({ teamId: req.params.teamId, ...columns(req.body) })
      .returning();
    return reply.code(201).send(row && toPreset(row));
  });

  app.put<{ Params: Params; Body: Body }>(
    '/teams/:teamId/presets/:presetId',
    { preHandler: admin, schema: { params: presetParams, body } },
    async (req, reply) => {
      const [row] = await db.update(presets).set(columns(req.body)).where(own(req.params)).returning();
      return row ? toPreset(row) : reply.code(404).send({ error: 'not_found' });
    },
  );

  app.delete<{ Params: Params }>('/teams/:teamId/presets/:presetId', { preHandler: admin, schema: { params: presetParams } }, async (req, reply) => {
    const [row] = await db.delete(presets).where(own(req.params)).returning({ id: presets.id });
    return row ? reply.code(204).send() : reply.code(404).send({ error: 'not_found' });
  });
};
