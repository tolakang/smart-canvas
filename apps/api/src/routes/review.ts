/**
 * D63 review of Previews: comments (pinned to a point or not, with replies) and an approval per Preview. Kept outside
 * the ProjectDoc: viewers comment (they can't save the doc), and undo / restore / save conflicts never touch them.
 * - Members read. Anyone in the team comments and replies (viewers too).
 * - A comment's text is edited by its author; a thread is resolved or reopened by its author or an editor;
 *   a comment is deleted by its author or an admin (its replies go with it).
 * - Editors approve a Preview (with the fingerprint of what it looked like) and withdraw an approval.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { currentUser, requireTeam } from '../auth/plugin';
import { hasRole } from '../auth/roles';
import { outputApprovals, projects, reviewComments, users } from '../db/schema';

/** Comments a project can hold (threads and replies together). */
export const MAX_COMMENTS = 2000;

type Params = { teamId: string; projectId: string };
type CommentParams = Params & { commentId: string };
type OutputParams = Params & { outputId: string };
const uuid = { type: 'string', format: 'uuid' } as const;
const outputId = { type: 'string', minLength: 1, maxLength: 100 } as const;
const projectParams = { type: 'object', required: ['teamId', 'projectId'], properties: { teamId: { type: 'string' }, projectId: uuid } } as const;
const commentParams = {
  type: 'object',
  required: ['teamId', 'projectId', 'commentId'],
  properties: { teamId: { type: 'string' }, projectId: uuid, commentId: uuid },
} as const;
const outputParams = {
  type: 'object',
  required: ['teamId', 'projectId', 'outputId'],
  properties: { teamId: { type: 'string' }, projectId: uuid, outputId },
} as const;
const text = { type: 'string', minLength: 1, maxLength: 2000 } as const;
const fraction = { type: 'number', minimum: 0, maximum: 1 } as const;

const resolver = alias(users, 'resolver');

export const reviewRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;
  const member = requireTeam();
  const anyMember = requireTeam('viewer'); // writes viewers may make: comments
  const base = '/teams/:teamId/projects/:projectId/review';
  const inTeam = (p: Params) => and(eq(projects.id, p.projectId), eq(projects.teamId, p.teamId));
  const exists = async (p: Params) => (await db.select({ id: projects.id }).from(projects).where(inTeam(p))).length > 0;
  /** True when the project's doc has that output (a comment or approval is for a Preview that exists now). */
  const hasOutput = async (p: Params, id: string) =>
    (
      await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(inTeam(p), sql`exists (select 1 from jsonb_array_elements(${projects.doc} -> 'outputs') o where o ->> 'id' = ${id})`))
    ).length > 0;
  const role = (req: FastifyRequest) => req.membership?.role ?? 'viewer';
  const comment = async (p: CommentParams) =>
    (await db.select().from(reviewComments).where(and(eq(reviewComments.id, p.commentId), eq(reviewComments.projectId, p.projectId))))[0];
  const notFound = (reply: FastifyReply) => reply.code(404).send({ error: 'not_found' });

  app.get<{ Params: Params }>(base, { preHandler: member, schema: { params: projectParams } }, async (req, reply) => {
    if (!(await exists(req.params))) return notFound(reply);
    const comments = await db
      .select({
        id: reviewComments.id,
        outputId: reviewComments.outputId,
        parentId: reviewComments.parentId,
        text: reviewComments.text,
        pinX: reviewComments.pinX,
        pinY: reviewComments.pinY,
        authorId: reviewComments.authorId,
        author: users.name,
        resolvedAt: reviewComments.resolvedAt,
        resolvedBy: resolver.name,
        createdAt: reviewComments.createdAt,
        updatedAt: reviewComments.updatedAt,
      })
      .from(reviewComments)
      .leftJoin(users, eq(users.id, reviewComments.authorId))
      .leftJoin(resolver, eq(resolver.id, reviewComments.resolvedBy))
      .where(eq(reviewComments.projectId, req.params.projectId))
      .orderBy(asc(reviewComments.createdAt));
    const approvals = await db
      .select({ outputId: outputApprovals.outputId, fingerprint: outputApprovals.fingerprint, approvedBy: users.name, approvedAt: outputApprovals.approvedAt })
      .from(outputApprovals)
      .leftJoin(users, eq(users.id, outputApprovals.approvedBy))
      .where(eq(outputApprovals.projectId, req.params.projectId));
    return { comments, approvals };
  });

  app.post<{ Params: Params; Body: { outputId: string; text: string; parentId?: string; pin?: { x: number; y: number } } }>(
    `${base}/comments`,
    {
      preHandler: anyMember,
      schema: {
        params: projectParams,
        body: {
          type: 'object',
          required: ['outputId', 'text'],
          additionalProperties: false,
          properties: {
            outputId,
            text,
            parentId: uuid,
            pin: { type: 'object', required: ['x', 'y'], additionalProperties: false, properties: { x: fraction, y: fraction } },
          },
        },
      },
    },
    async (req, reply) => {
      const body = req.body.text.trim();
      if (!body) return reply.code(400).send({ error: 'invalid' });
      if (!(await hasOutput(req.params, req.body.outputId))) return notFound(reply);
      if (req.body.parentId) {
        const parent = await comment({ ...req.params, commentId: req.body.parentId });
        // Replies go under a thread of the same Preview, one level deep, and carry no pin.
        if (!parent || parent.parentId || parent.outputId !== req.body.outputId || req.body.pin) return reply.code(400).send({ error: 'invalid_parent' });
      }
      const [{ n } = { n: 0 }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(reviewComments)
        .where(eq(reviewComments.projectId, req.params.projectId));
      if (n >= MAX_COMMENTS) return reply.code(409).send({ error: 'comment_limit', max: MAX_COMMENTS });
      const [row] = await db
        .insert(reviewComments)
        .values({
          projectId: req.params.projectId,
          outputId: req.body.outputId,
          parentId: req.body.parentId ?? null,
          authorId: currentUser(req).id,
          text: body,
          pinX: req.body.pin?.x ?? null,
          pinY: req.body.pin?.y ?? null,
        })
        .returning({ id: reviewComments.id, createdAt: reviewComments.createdAt });
      return reply.code(201).send(row);
    },
  );

  /** `text`: the author edits it. `resolved`: the author or an editor resolves or reopens a thread. */
  app.patch<{ Params: CommentParams; Body: { text?: string; resolved?: boolean } }>(
    `${base}/comments/:commentId`,
    {
      preHandler: anyMember,
      schema: {
        params: commentParams,
        body: { type: 'object', minProperties: 1, additionalProperties: false, properties: { text, resolved: { type: 'boolean' } } },
      },
    },
    async (req, reply) => {
      if (!(await exists(req.params))) return notFound(reply);
      const c = await comment(req.params);
      if (!c) return notFound(reply);
      const me = currentUser(req).id;
      const mine = c.authorId === me;
      const set: Partial<typeof reviewComments.$inferInsert> = {};
      if (req.body.text !== undefined) {
        if (!mine) return reply.code(403).send({ error: 'forbidden' });
        const body = req.body.text.trim();
        if (!body) return reply.code(400).send({ error: 'invalid' });
        set.text = body;
      }
      if (req.body.resolved !== undefined) {
        if (c.parentId) return reply.code(400).send({ error: 'reply_not_resolvable' });
        if (!mine && !hasRole(role(req), 'editor')) return reply.code(403).send({ error: 'forbidden' });
        set.resolvedAt = req.body.resolved ? new Date() : null;
        set.resolvedBy = req.body.resolved ? me : null;
      }
      const [row] = await db
        .update(reviewComments)
        .set({ ...set, updatedAt: sql`now()` })
        .where(eq(reviewComments.id, c.id))
        .returning({ id: reviewComments.id, text: reviewComments.text, resolvedAt: reviewComments.resolvedAt });
      return row;
    },
  );

  app.delete<{ Params: CommentParams }>(`${base}/comments/:commentId`, { preHandler: anyMember, schema: { params: commentParams } }, async (req, reply) => {
    if (!(await exists(req.params))) return notFound(reply);
    const c = await comment(req.params);
    if (!c) return notFound(reply);
    if (c.authorId !== currentUser(req).id && !hasRole(role(req), 'admin')) return reply.code(403).send({ error: 'forbidden' });
    await db.delete(reviewComments).where(eq(reviewComments.id, c.id));
    return reply.code(204).send();
  });

  app.put<{ Params: OutputParams; Body: { fingerprint: string } }>(
    `${base}/approvals/:outputId`,
    {
      preHandler: member,
      schema: {
        params: outputParams,
        body: { type: 'object', required: ['fingerprint'], additionalProperties: false, properties: { fingerprint: { type: 'string', minLength: 1, maxLength: 64 } } },
      },
    },
    async (req, reply) => {
      if (!(await hasOutput(req.params, req.params.outputId))) return notFound(reply);
      const values = { fingerprint: req.body.fingerprint, approvedBy: currentUser(req).id, approvedAt: new Date() };
      const [row] = await db
        .insert(outputApprovals)
        .values({ projectId: req.params.projectId, outputId: req.params.outputId, ...values })
        .onConflictDoUpdate({ target: [outputApprovals.projectId, outputApprovals.outputId], set: values })
        .returning({ outputId: outputApprovals.outputId, fingerprint: outputApprovals.fingerprint, approvedAt: outputApprovals.approvedAt });
      return row;
    },
  );

  app.delete<{ Params: OutputParams }>(`${base}/approvals/:outputId`, { preHandler: member, schema: { params: outputParams } }, async (req, reply) => {
    if (!(await exists(req.params))) return notFound(reply);
    const gone = await db
      .delete(outputApprovals)
      .where(and(eq(outputApprovals.projectId, req.params.projectId), eq(outputApprovals.outputId, req.params.outputId)))
      .returning({ outputId: outputApprovals.outputId });
    return gone.length ? reply.code(204).send() : notFound(reply);
  });
};
