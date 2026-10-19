import type { TeamRole } from '@smart-canvas/core';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { requireTeam } from '../auth/plugin';
import { memberships, teams, users } from '../db/schema';

type Params = { teamId: string; userId: string };
const memberParams = {
  type: 'object',
  required: ['teamId', 'userId'],
  properties: { teamId: { type: 'string' }, userId: { type: 'string', format: 'uuid' } },
} as const;

export const memberRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;
  const admin = requireTeam('admin');

  app.get<{ Params: { teamId: string } }>('/teams/:teamId/members', { preHandler: requireTeam() }, async (req) => {
    return db
      .select({ userId: users.id, email: users.email, name: users.name, role: memberships.role })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.teamId, req.params.teamId))
      .orderBy(users.email);
  });

  /** Change a role or remove a member, never leaving the team without an admin. */
  async function changeMember(teamId: string, userId: string, role: TeamRole | null) {
    return db.transaction(async (tx) => {
      await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).for('update'); // serialize per team
      const where = and(eq(memberships.teamId, teamId), eq(memberships.userId, userId));
      const [current] = await tx.select({ role: memberships.role }).from(memberships).where(where);
      if (!current) return 'not_found' as const;
      if (current.role === 'admin' && role !== 'admin') {
        const [{ admins } = { admins: 0 }] = await tx
          .select({ admins: sql<number>`count(*)::int` })
          .from(memberships)
          .where(and(eq(memberships.teamId, teamId), eq(memberships.role, 'admin')));
        if (admins <= 1) return 'last_admin' as const;
      }
      if (role) await tx.update(memberships).set({ role }).where(where);
      else await tx.delete(memberships).where(where);
      return 'ok' as const;
    });
  }

  const send = (result: 'ok' | 'not_found' | 'last_admin', reply: FastifyReply) => {
    if (result === 'not_found') return reply.code(404).send({ error: 'not_found' });
    if (result === 'last_admin') return reply.code(409).send({ error: 'last_admin' });
    return reply.code(204).send();
  };

  app.patch<{ Params: Params; Body: { role: TeamRole } }>(
    '/teams/:teamId/members/:userId',
    {
      preHandler: admin,
      schema: {
        params: memberParams,
        body: {
          type: 'object',
          required: ['role'],
          additionalProperties: false,
          properties: { role: { type: 'string', enum: ['admin', 'editor', 'viewer'] } },
        },
      },
    },
    async (req, reply) => send(await changeMember(req.params.teamId, req.params.userId, req.body.role), reply),
  );

  app.delete<{ Params: Params }>(
    '/teams/:teamId/members/:userId',
    { preHandler: admin, schema: { params: memberParams } },
    async (req, reply) => send(await changeMember(req.params.teamId, req.params.userId, null), reply),
  );
};
