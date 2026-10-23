/**
 * Size presets (T4.8, D16): built-ins (team_id null, seeded from @smart-canvas/presets) plus the team's own.
 * Everyone in the team reads them; admins add, edit and delete the team's presets. Built-ins are read-only.
 * M4: a team family (its presets with one `family`) is renamed or deleted as a whole.
 */
import type { SizePreset } from '@smart-canvas/core';
import { and, asc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { requireTeam } from '../auth/plugin';
import { presets } from '../db/schema';

type Row = typeof presets.$inferSelect;
type Params = { teamId: string; presetId: string };
type Body = { group: 'print' | 'social'; name: string; family?: string | null; size: { width: number; height: number; unit: 'px' | 'mm' }; dpi?: number | null; bleedMm?: number | null };

const body = {
  type: 'object',
  required: ['group', 'name', 'size'],
  additionalProperties: false,
  properties: {
    group: { enum: ['print', 'social'] },
    name: { type: 'string', minLength: 1, maxLength: 120 },
    // N5: the Preset node family; null / absent = a single size.
    family: { type: ['string', 'null'], maxLength: 60 },
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

const familyParams = {
  type: 'object',
  required: ['teamId', 'family'],
  properties: { teamId: { type: 'string' }, family: { type: 'string', minLength: 1, maxLength: 60 } },
} as const;
const familyBody = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: { name: { type: 'string', minLength: 1, maxLength: 60 } },
} as const;

export function toPreset(r: Row): SizePreset {
  return {
    id: r.id,
    teamId: r.teamId,
    group: r.group,
    name: r.name,
    ...(r.family !== null ? { family: r.family } : {}),
    size: { width: r.width, height: r.height, unit: r.unit },
    ...(r.dpi !== null ? { dpi: r.dpi } : {}),
    ...(r.bleedMm !== null ? { bleedMm: r.bleedMm } : {}),
  };
}

const columns = (b: Body) => ({
  group: b.group,
  name: b.name.trim(),
  family: b.family?.trim() || null,
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

  type FamilyParams = { teamId: string; family: string };
  const familyRows = (p: FamilyParams) => and(eq(presets.teamId, p.teamId), eq(presets.family, p.family));

  /** M4: rename a team family. Refused: a blank name, a built-in family's name, another team family's name. */
  app.put<{ Params: FamilyParams; Body: { name: string } }>(
    '/teams/:teamId/preset-families/:family',
    { preHandler: admin, schema: { params: familyParams, body: familyBody } },
    async (req, reply) => {
      const name = req.body.name.trim();
      if (!name) return reply.code(400).send({ error: 'name_required' });
      const taken = await db
        .select({ teamId: presets.teamId })
        .from(presets)
        .where(and(isNotNull(presets.family), sql`lower(${presets.family}) = lower(${name})`, or(isNull(presets.teamId), eq(presets.teamId, req.params.teamId))));
      if (taken.some((r) => r.teamId === null)) return reply.code(409).send({ error: 'builtin_family' });
      if (taken.length && name.toLowerCase() !== req.params.family.toLowerCase()) return reply.code(409).send({ error: 'family_exists' });
      const rows = await db.update(presets).set({ family: name }).where(familyRows(req.params)).returning({ id: presets.id });
      return rows.length ? { family: name, count: rows.length } : reply.code(404).send({ error: 'not_found' });
    },
  );

  /** M4: delete a team family: every team preset in it. */
  app.delete<{ Params: FamilyParams }>('/teams/:teamId/preset-families/:family', { preHandler: admin, schema: { params: familyParams } }, async (req, reply) => {
    const rows = await db.delete(presets).where(familyRows(req.params)).returning({ id: presets.id });
    return rows.length ? reply.code(204).send() : reply.code(404).send({ error: 'not_found' });
  });
};
