/**
 * Projects: the whole ProjectDoc lives in `projects.doc` (JSONB).
 * Saves are optimistic: the client sends the `rev` it loaded; a save against an older rev gets 409
 * with the current rev so the UI can offer "reload latest". The server owns `rev` (and mirrors it into doc.rev).
 */
import { createProjectDoc, type ProjectDoc } from '@smart-canvas/core';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { currentUser, requireTeam } from '../auth/plugin';
import { projects } from '../db/schema';
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
      .select({ id: projects.id, name: projects.name, rev: projects.rev, createdAt: projects.createdAt, updatedAt: projects.updatedAt })
      .from(projects)
      .where(eq(projects.teamId, req.params.teamId))
      .orderBy(desc(projects.updatedAt));
  });

  app.post<{ Params: { teamId: string }; Body: { name: string } }>(
    '/teams/:teamId/projects',
    {
      preHandler: member,
      schema: { body: { type: 'object', required: ['name'], additionalProperties: false, properties: { name: nameSchema } } },
    },
    async (req, reply) => {
      const doc = createProjectDoc(req.body.name);
      const [row] = await db
        .insert(projects)
        .values({ teamId: req.params.teamId, name: doc.name, doc, rev: doc.rev, createdBy: currentUser(req).id })
        .returning({ id: projects.id, rev: projects.rev, doc: projects.doc });
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
      return row;
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
      const { rev, doc } = req.body;
      const next = rev + 1;
      const updated = await db
        .update(projects)
        .set({ doc: { ...doc, rev: next }, rev: next, name: doc.name, updatedAt: sql`now()` })
        .where(and(inTeam(req.params), eq(projects.rev, rev)))
        .returning({ rev: projects.rev, updatedAt: projects.updatedAt });
      if (updated[0]) return updated[0];

      const [current] = await db.select({ rev: projects.rev }).from(projects).where(inTeam(req.params));
      if (!current) return reply.code(404).send({ error: 'not_found' });
      return reply.code(409).send({ error: 'stale_rev', rev: current.rev });
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
