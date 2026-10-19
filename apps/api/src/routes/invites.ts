import type { TeamRole } from '@smart-canvas/core';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { hashPassword } from '../auth/password';
import { type AuthUser, currentUser, requireTeam } from '../auth/plugin';
import { hashToken, newToken } from '../auth/tokens';
import { invites, memberships, teams, users } from '../db/schema';
import { emailSchema, nameSchema, normalizeEmail, passwordSchema } from './auth';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const roleSchema = { type: 'string', enum: ['admin', 'editor', 'viewer'] } as const;
const tokenParams = {
  type: 'object',
  required: ['token'],
  properties: { token: { type: 'string', minLength: 20, maxLength: 100 } },
} as const;

export const inviteRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;
  const admin = requireTeam('admin');

  app.post<{ Params: { teamId: string }; Body: { role: TeamRole; email?: string } }>(
    '/teams/:teamId/invites',
    {
      preHandler: admin,
      schema: {
        body: {
          type: 'object',
          required: ['role'],
          additionalProperties: false,
          properties: { role: roleSchema, email: emailSchema },
        },
      },
    },
    async (req, reply) => {
      const token = newToken();
      const [row] = await db
        .insert(invites)
        .values({
          teamId: req.params.teamId,
          role: req.body.role,
          email: req.body.email ? normalizeEmail(req.body.email) : null,
          tokenHash: hashToken(token),
          createdBy: currentUser(req).id,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        })
        .returning({ id: invites.id, role: invites.role, email: invites.email, expiresAt: invites.expiresAt });
      // The token is only ever returned here; the link is `/invite/<token>` on the web app.
      return reply.code(201).send({ ...row, token });
    },
  );

  app.get<{ Params: { teamId: string } }>('/teams/:teamId/invites', { preHandler: admin }, async (req) => {
    return db
      .select({ id: invites.id, role: invites.role, email: invites.email, expiresAt: invites.expiresAt })
      .from(invites)
      .where(and(eq(invites.teamId, req.params.teamId), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())))
      .orderBy(desc(invites.createdAt));
  });

  app.delete<{ Params: { teamId: string; inviteId: string } }>(
    '/teams/:teamId/invites/:inviteId',
    { preHandler: admin, schema: { params: { type: 'object', properties: { inviteId: { type: 'string', format: 'uuid' } } } } },
    async (req, reply) => {
      const deleted = await db
        .delete(invites)
        .where(and(eq(invites.id, req.params.inviteId), eq(invites.teamId, req.params.teamId)))
        .returning({ id: invites.id });
      if (deleted.length === 0) return reply.code(404).send({ error: 'not_found' });
      return reply.code(204).send();
    },
  );

  /** Public: what the accept screen shows. */
  app.get<{ Params: { token: string } }>('/invites/:token', { schema: { params: tokenParams } }, async (req, reply) => {
    const [row] = await db
      .select({ teamName: teams.name, role: invites.role, email: invites.email, expiresAt: invites.expiresAt })
      .from(invites)
      .innerJoin(teams, eq(teams.id, invites.teamId))
      .where(
        and(eq(invites.tokenHash, hashToken(req.params.token)), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())),
      )
      .limit(1);
    if (!row) return reply.code(404).send({ error: 'invite_invalid' });
    return row;
  });

  /**
   * Accept. Signed in → join the team as the current user.
   * Signed out → create the account (email must be new; bound invites fix the email) and sign in.
   */
  app.post<{ Params: { token: string }; Body: { email?: string; password?: string; name?: string } }>(
    '/invites/:token/accept',
    {
      schema: {
        params: tokenParams,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: { email: emailSchema, password: passwordSchema, name: nameSchema },
        },
      },
    },
    async (req, reply) => {
      const body = req.body;
      let who: { existing: AuthUser } | { name: string; passwordHash: string };
      if (req.user) who = { existing: req.user };
      else if (body.password && body.name) who = { name: body.name, passwordHash: await hashPassword(body.password) };
      else return reply.code(400).send({ error: 'password_and_name_required' });

      type Accepted = { userId: string; teamId: string; role: TeamRole };
      type Refused = { error: string; code: 400 | 403 | 404 | 409 };
      const result = await db.transaction(async (tx): Promise<Accepted | Refused> => {
        const [invite] = await tx
          .select()
          .from(invites)
          .where(
            and(
              eq(invites.tokenHash, hashToken(req.params.token)),
              isNull(invites.acceptedAt),
              gt(invites.expiresAt, new Date()),
            ),
          )
          .for('update')
          .limit(1);
        if (!invite) return { error: 'invite_invalid', code: 404 };

        let userId: string;
        if ('existing' in who) {
          if (invite.email && invite.email !== normalizeEmail(who.existing.email)) {
            return { error: 'invite_email_mismatch', code: 403 };
          }
          userId = who.existing.id;
        } else {
          const email = invite.email ?? (body.email ? normalizeEmail(body.email) : null);
          if (!email) return { error: 'email_required', code: 400 };
          if (invite.email && body.email && normalizeEmail(body.email) !== invite.email) {
            return { error: 'invite_email_mismatch', code: 403 };
          }
          const [exists] = await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(sql`lower(${users.email})`, email))
            .limit(1);
          if (exists) return { error: 'account_exists_sign_in_first', code: 409 };
          const [created] = await tx
            .insert(users)
            .values({ email, name: who.name, passwordHash: who.passwordHash })
            .returning({ id: users.id });
          if (!created) throw new Error('insert failed');
          userId = created.id;
        }

        const added = await tx
          .insert(memberships)
          .values({ teamId: invite.teamId, userId, role: invite.role })
          .onConflictDoNothing()
          .returning({ userId: memberships.userId });
        if (added.length === 0) return { error: 'already_member', code: 409 };
        await tx.update(invites).set({ acceptedAt: new Date(), acceptedBy: userId }).where(eq(invites.id, invite.id));
        return { userId, teamId: invite.teamId, role: invite.role };
      });

      if ('error' in result) return reply.code(result.code).send({ error: result.error });
      if (!('existing' in who)) await app.startSession(reply, result.userId);
      return { teamId: result.teamId, role: result.role };
    },
  );
};
