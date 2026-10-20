/**
 * Exports (D22, T6.5): POST creates one export job per output (status, progress and errors are per
 * output) and queues it; the worker renders it. Editors and admins export; every member can watch and
 * download (T6.6: one file, or a ZIP of several, named `{project}_{output}_{WxH}.{ext}`).
 * Raster exports over LIMITS.maxExportEdgePx are refused up front (T6.7).
 */
import {
  EXPORT_FORMATS,
  EXPORT_MIME,
  exportCapError,
  exportFileName,
  exportStorageKey,
  LIMITS,
  type ExportFormat,
  type ExportJob,
  type ExportOptions,
  type ProjectDoc,
} from '@smart-canvas/core';
import { ZipFile } from 'yazl';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { currentUser, requireTeam } from '../auth/plugin';
import { exportJobs, projects } from '../db/schema';
import type { ExportQueue } from '../exports/queue';
import type { ObjectStore } from '../storage/object-store';

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

/** `attachment` with an ASCII fallback and the UTF-8 name (Khmer labels survive). */
export function attachment(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Unique names inside one ZIP: `name.png`, `name-2.png`, … */
function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const count = (seen.get(n) ?? 0) + 1;
    seen.set(n, count);
    return count === 1 ? n : n.replace(/(\.[a-z0-9]+)$/, `-${count}$1`);
  });
}

export const exportRoutes: FastifyPluginAsync<{ queue?: ExportQueue; store: ObjectStore }> = async (app, opts) => {
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

  /** Finished jobs of one team (with their project), for downloads. */
  async function doneJobs(teamId: string, ids: string[], projectId?: string) {
    const rows = await db
      .select({ job: exportJobs, doc: projects.doc, name: projects.name })
      .from(exportJobs)
      .innerJoin(projects, eq(projects.id, exportJobs.projectId))
      .where(and(eq(projects.teamId, teamId), inArray(exportJobs.id, ids), eq(exportJobs.status, 'done'), ...(projectId ? [eq(projects.id, projectId)] : [])));
    return rows.flatMap(({ job, doc, name }) => {
      const output = (doc as ProjectDoc).outputs.find((o) => o.id === job.outputIds[0]);
      return output ? [{ job, fileName: exportFileName(name, output, job.format, job.options), key: exportStorageKey(teamId, job.id, job.format) }] : [];
    });
  }

  app.get<{ Params: { teamId: string; jobId: string } }>(
    '/teams/:teamId/exports/:jobId/file',
    {
      preHandler: member,
      schema: { params: { type: 'object', required: ['teamId', 'jobId'], properties: { teamId: { type: 'string' }, jobId: { type: 'string', format: 'uuid' } } } },
    },
    async (req, reply) => {
      const [found] = await doneJobs(req.params.teamId, [req.params.jobId]);
      const body = found ? await opts.store.get(found.key) : null;
      if (!found || !body) return reply.code(404).send({ error: 'not_found' });
      return reply
        .header('content-type', EXPORT_MIME[found.job.format])
        .header('content-disposition', attachment(found.fileName))
        .header('x-content-type-options', 'nosniff')
        .header('cache-control', 'private, no-store')
        .send(Buffer.from(body));
    },
  );

  /** ZIP of finished jobs: `?ids=a,b` (all done jobs of the request that belong to this project). */
  app.get<{ Params: Params; Querystring: { ids?: string } }>(
    '/teams/:teamId/projects/:projectId/exports/zip',
    { preHandler: member, schema: { params: projectParams } },
    async (req, reply) => {
      const ids = (req.query.ids ?? '').split(',').filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100);
      const found = ids.length ? await doneJobs(req.params.teamId, ids, req.params.projectId) : [];
      if (found.length === 0) return reply.code(404).send({ error: 'not_found' });
      const zip = new ZipFile();
      const names = uniqueNames(found.map((f) => f.fileName));
      let added = 0;
      for (const [i, f] of found.entries()) {
        const body = await opts.store.get(f.key);
        if (!body) continue;
        zip.addBuffer(Buffer.from(body), names[i] ?? f.fileName, { compress: f.job.format === 'svg' || f.job.format === 'pdf' });
        added++;
      }
      if (added === 0) return reply.code(404).send({ error: 'not_found' });
      zip.end();
      const project = found[0]?.fileName.split('_')[0] ?? 'export';
      return reply
        .header('content-type', 'application/zip')
        .header('content-disposition', attachment(`${project}_exports.zip`))
        .header('cache-control', 'private, no-store')
        .send(zip.outputStream);
    },
  );
};
