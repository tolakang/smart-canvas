/**
 * Exports (D22, T6.5): POST creates one export job per output (status, progress and errors are per
 * output) and queues it; the worker renders it. Editors and admins export; every member can watch.
 * Raster exports over LIMITS.maxExportEdgePx are refused up front (T6.7).
 */
import { EXPORT_FORMATS, exportCapError, LIMITS, type ExportFormat, type ExportJob, type ExportOptions, type ProjectDoc } from '@smart-canvas/core';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { currentUser, requireTeam } from '../auth/plugin';
import { exportJobs, projects } from '../db/schema';
import type { ExportQueue } from '../exports/queue';

type Params = { teamId: string; projectId: string };
type Body = { outputIds: string[]; format: ExportFormat; options?: ExportOptions };

const projectParams = {
  type: 'object',
  required: ['teamId', 'projectId'],
  properties: { teamId: { type: 'string' }, projectId: { type: 'string', format: 'uuid' } },
} as const;
const body = {
  type: 'object',
  required: ['outputIds', 'format'],
  additionalProperties: false,
  properties: {
    outputIds: { type: 'array', minItems: 1, maxItems: LIMITS.maxOutputs, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 100 } },
    format: { enum: [...EXPORT_FORMATS] },
    options: {
      type: 'object',
      additionalProperties: false,
      properties: {
        scale: { type: 'number', minimum: 1, maximum: 4 },
        dpi: { type: 'integer', minimum: 72, maximum: 1200 },
        withBleed: { type: 'boolean' },
        cropMarks: { type: 'boolean' },
        outlineText: { type: 'boolean' },
        quality: { type: 'integer', minimum: 1, maximum: 100 },
      },
    },
  },
} as const;

type Row = typeof exportJobs.$inferSelect;
export function toJob(r: Row): ExportJob {
  return {
    id: r.id,
    projectId: r.projectId,
    outputIds: r.outputIds,
    format: r.format,
    options: r.options,
    status: r.status,
    progress: r.progress,
    ...(r.resultAssetId ? { resultAssetId: r.resultAssetId } : {}),
    ...(r.error ? { error: r.error } : {}),
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
  };
}

export const exportRoutes: FastifyPluginAsync<{ queue?: ExportQueue }> = async (app, opts) => {
  const { db } = app;
  const member = requireTeam();

  app.post<{ Params: Params; Body: Body }>(
    '/teams/:teamId/projects/:projectId/exports',
    { preHandler: member, schema: { params: projectParams, body } },
    async (req, reply) => {
      if (!opts.queue) return reply.code(503).send({ error: 'export_unavailable' });
      const [project] = await db
        .select({ doc: projects.doc })
        .from(projects)
        .where(and(eq(projects.id, req.params.projectId), eq(projects.teamId, req.params.teamId)));
      if (!project) return reply.code(404).send({ error: 'not_found' });
      const doc = project.doc as ProjectDoc;
      const { format } = req.body;
      const options = req.body.options ?? {};
      // D23 outlined SVG text needs spike S3 (O5); refuse it rather than silently export live text.
      if (options.outlineText) return reply.code(422).send({ error: 'outline_text_unavailable', messages: ['Outlined text is not available yet.'] });
      const outputs = req.body.outputIds.map((id) => doc.outputs.find((o) => o.id === id));
      if (outputs.some((o) => !o)) return reply.code(400).send({ error: 'unknown_output' });
      const tooLarge = outputs.flatMap((o) => (o ? [exportCapError(o, format, options)] : [])).filter((e): e is string => !!e);
      if (tooLarge.length) return reply.code(422).send({ error: 'export_too_large', messages: tooLarge });

      const rows = await db
        .insert(exportJobs)
        .values(req.body.outputIds.map((id) => ({ projectId: req.params.projectId, outputIds: [id], format, options, createdBy: currentUser(req).id })))
        .returning();
      for (const r of rows) await opts.queue.send(r.id);
      return reply.code(202).send(rows.map(toJob));
    },
  );

  /** Jobs of a project: `?ids=a,b` for specific ones, otherwise the latest 50. */
  app.get<{ Params: Params; Querystring: { ids?: string } }>(
    '/teams/:teamId/projects/:projectId/exports',
    { preHandler: member, schema: { params: projectParams } },
    async (req, reply) => {
      const [project] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, req.params.projectId), eq(projects.teamId, req.params.teamId)));
      if (!project) return reply.code(404).send({ error: 'not_found' });
      const ids = (req.query.ids ?? '').split(',').filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100);
      const rows = await db
        .select()
        .from(exportJobs)
        .where(and(eq(exportJobs.projectId, project.id), ...(ids.length ? [inArray(exportJobs.id, ids)] : [])))
        .orderBy(desc(exportJobs.createdAt))
        .limit(50);
      return rows.map(toJob);
    },
  );
};
