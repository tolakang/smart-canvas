/**
 * Projects: the whole ProjectDoc lives in `projects.doc` (JSONB). Templates (T7.3) are projects with
 * `is_template`: listed apart, and "New from template" / "Duplicate" copy a doc into a new project.
 * Saves are optimistic: the client sends the `rev` it loaded; a save against an older rev gets 409
 * with the current rev so the UI can offer "reload latest". The server owns `rev` (and mirrors it into doc.rev).
 * A save may keep the doc it replaces as a history version first (D62, routes/versions.ts).
 */
import { copyProjectDoc, createBoardProject, migrateProjectDoc, type ProjectDoc } from '@smart-canvas/core';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { currentUser, requireTeam } from '../auth/plugin';
import { projects } from '../db/schema';
import { keepBeforeSave, storedPanels } from './versions';
import { projectDocSchema } from './project-doc.schema';

type Params = { teamId: string; projectId: string };
const projectParams = {
  type: 'object',
  required: ['teamId', 'projectId'],
  properties: { teamId: { type: 'string' }, projectId: { type: 'string', format: 'uuid' } },
} as const;
const nameSchema = { type: 'string', minLength: 1, maxLength: 200 } as const;

export const projectRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;
  const member = requireTeam(); // viewers read, editors and admins write
  const inTeam = (p: Params) => and(eq(projects.id, p.projectId), eq(projects.teamId, p.teamId));

  app.get<{ Params: { teamId: string } }>('/teams/:teamId/projects', { preHandler: member }, async (req) => {
    return db
      .select({ id: projects.id, name: projects.name, rev: projects.rev, isTemplate: projects.isTemplate, createdAt: projects.createdAt, updatedAt: projects.updatedAt })
      .from(projects)
      .where(eq(projects.teamId, req.params.teamId))
      .orderBy(desc(projects.updatedAt));
  });

  app.post<{ Params: { teamId: string }; Body: { name: string; templateId?: string; isTemplate?: boolean } }>(
    '/teams/:teamId/projects',
    {
      preHandler: member,
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: { name: nameSchema, templateId: { type: 'string', format: 'uuid' }, isTemplate: { type: 'boolean' } },
        },
      },
    },
    async (req, reply) => {
      let doc = createBoardProject(req.body.name); // D49: the page-3 board
      if (req.body.templateId) {
        const [template] = await db
          .select({ doc: projects.doc })
          .from(projects)
          .where(and(inTeam({ teamId: req.params.teamId, projectId: req.body.templateId }), eq(projects.isTemplate, true)));
        if (!template) return reply.code(404).send({ error: 'template_not_found' });
        doc = copyProjectDoc(migrateProjectDoc(template.doc), req.body.name);
      }
      const [row] = await db
        .insert(projects)
        .values({ teamId: req.params.teamId, name: doc.name, doc, rev: doc.rev, isTemplate: req.body.isTemplate ?? false, createdBy: currentUser(req).id, updatedBy: currentUser(req).id })
        .returning({ id: projects.id, rev: projects.rev, doc: projects.doc, isTemplate: projects.isTemplate });
      return reply.code(201).send(row);
    },
  );

  /** Duplicate a project (or save it as a template, or turn a template into a project): a full copy. */
  app.post<{ Params: Params; Body: { name?: string; isTemplate?: boolean } }>(
    '/teams/:teamId/projects/:projectId/duplicate',
    {
      preHandler: member,
      schema: {
        params: projectParams,
        body: { type: 'object', additionalProperties: false, properties: { name: nameSchema, isTemplate: { type: 'boolean' } } },
      },
    },
    async (req, reply) => {
      const [source] = await db.select({ doc: projects.doc, isTemplate: projects.isTemplate }).from(projects).where(inTeam(req.params));
      if (!source) return reply.code(404).send({ error: 'not_found' });
      const isTemplate = req.body.isTemplate ?? source.isTemplate;
      const doc = copyProjectDoc(migrateProjectDoc(source.doc), req.body.name ?? `${source.doc.name} (copy)`.slice(0, 200));
      const [row] = await db
        .insert(projects)
        .values({ teamId: req.params.teamId, name: doc.name, doc, rev: 0, isTemplate, createdBy: currentUser(req).id, updatedBy: currentUser(req).id })
        .returning({ id: projects.id, rev: projects.rev, doc: projects.doc, isTemplate: projects.isTemplate });
      return reply.code(201).send(row);
    },
  );

  app.get<{ Params: Params }>(
    '/teams/:teamId/projects/:projectId',
    { preHandler: member, schema: { params: projectParams } },
    async (req, reply) => {
      const [row] = await db
        .select({ id: projects.id, rev: projects.rev, doc: projects.doc, updatedAt: projects.updatedAt })
        .from(projects)
        .where(inTeam(req.params));
      if (!row) return reply.code(404).send({ error: 'not_found' });
      // Stored v1 / v2 documents are upgraded on read (D32, D56); the next save stores v3.
      return { ...row, doc: migrateProjectDoc(row.doc) };
    },
  );

  app.put<{ Params: Params; Body: { rev: number; doc: ProjectDoc } }>(
    '/teams/:teamId/projects/:projectId',
    {
      preHandler: member,
      schema: {
        params: projectParams,
        body: {
          type: 'object',
          required: ['rev', 'doc'],
          additionalProperties: false,
          properties: { rev: { type: 'integer', minimum: 0 }, doc: projectDocSchema },
        },
      },
    },
    async (req, reply) => {
      const { rev } = req.body;
      const doc = migrateProjectDoc(req.body.doc);
      const next = rev + 1;
      // The row is locked for the save, so the version kept from it (D62) is the doc this save replaces.
      const out = await db.transaction(async (tx) => {
        const [current] = await tx
          .select({ rev: projects.rev, updatedBy: projects.updatedBy, panels: storedPanels })
          .from(projects)
          .where(inTeam(req.params))
          .for('update');
        if (!current) return { error: 'not_found' as const };
        if (current.rev !== rev) return { error: 'stale_rev' as const, rev: current.rev };
        await keepBeforeSave(tx, req.params.projectId, current, doc);
        const [row] = await tx
          .update(projects)
          .set({ doc: { ...doc, rev: next }, rev: next, name: doc.name, updatedBy: currentUser(req).id, updatedAt: sql`now()` })
          .where(eq(projects.id, req.params.projectId))
          .returning({ rev: projects.rev, updatedAt: projects.updatedAt });
        return row;
      });
      if (out && 'error' in out) return reply.code(out.error === 'not_found' ? 404 : 409).send(out);
      return out;
    },
  );

  /** Rename a project or template (the Projects screen's ⋯ menu): the name and doc.name; the rev moves on, so an open board reloads rather than saving the old name back. */
  app.patch<{ Params: Params; Body: { name: string } }>(
    '/teams/:teamId/projects/:projectId',
    {
      preHandler: member,
      schema: { params: projectParams, body: { type: 'object', required: ['name'], additionalProperties: false, properties: { name: nameSchema } } },
    },
    async (req, reply) => {
      const name = req.body.name.trim();
      if (!name) return reply.code(400).send({ error: 'invalid' });
      const [row] = await db
        .update(projects)
        .set({
          name,
          rev: sql`${projects.rev} + 1`,
          doc: sql`jsonb_set(jsonb_set(${projects.doc}, '{name}', to_jsonb(${name}::text)), '{rev}', to_jsonb(${projects.rev} + 1))`,
          updatedAt: sql`now()`,
        })
        .where(inTeam(req.params))
        .returning({ id: projects.id, name: projects.name, rev: projects.rev, updatedAt: projects.updatedAt });
      return row ?? reply.code(404).send({ error: 'not_found' });
    },
  );

  app.delete<{ Params: Params }>(
    '/teams/:teamId/projects/:projectId',
    { preHandler: member, schema: { params: projectParams } },
    async (req, reply) => {
      const deleted = await db.delete(projects).where(inTeam(req.params)).returning({ id: projects.id });
      if (deleted.length === 0) return reply.code(404).send({ error: 'not_found' });
      return reply.code(204).send();
    },
  );
};
