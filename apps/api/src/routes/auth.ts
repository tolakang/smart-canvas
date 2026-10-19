import { eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { PASSWORD_MAX, PASSWORD_MIN, hashPassword, verifyPassword } from '../auth/password';
import { currentUser, requireUser } from '../auth/plugin';
import { memberships, teams, users } from '../db/schema';

export const emailSchema = { type: 'string', format: 'email', maxLength: 320 } as const;
export const passwordSchema = { type: 'string', minLength: PASSWORD_MIN, maxLength: PASSWORD_MAX } as const;
export const nameSchema = { type: 'string', minLength: 1, maxLength: 200 } as const;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const authRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;

  /** First run only: creates the first user as admin of a new team. Refused once any user exists. */
  app.post<{ Body: { email: string; password: string; name: string; teamName: string } }>(
    '/auth/setup',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password', 'name', 'teamName'],
          additionalProperties: false,
          properties: { email: emailSchema, password: passwordSchema, name: nameSchema, teamName: nameSchema },
        },
      },
    },
    async (req, reply) => {
      const { email, password, name, teamName } = req.body;
      const passwordHash = await hashPassword(password);
      const userId = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('auth_setup'))`);
        const [existing] = await tx.select({ id: users.id }).from(users).limit(1);
        if (existing) return null;
        const [user] = await tx
          .insert(users)
          .values({ email: normalizeEmail(email), name, passwordHash })
          .returning({ id: users.id });
        const [team] = await tx.insert(teams).values({ name: teamName }).returning({ id: teams.id });
        if (!user || !team) throw new Error('insert failed');
        await tx.insert(memberships).values({ teamId: team.id, userId: user.id, role: 'admin' });
        return user.id;
      });
      if (!userId) return reply.code(409).send({ error: 'already_set_up' });
      await app.startSession(reply, userId);
      return reply.code(201).send({ ok: true });
    },
  );

  app.post<{ Body: { email: string; password: string } }>(
    '/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          additionalProperties: false,
          properties: { email: { type: 'string', maxLength: 320 }, password: { type: 'string', maxLength: PASSWORD_MAX } },
        },
      },
    },
    async (req, reply) => {
      const [user] = await db
        .select({ id: users.id, passwordHash: users.passwordHash })
        .from(users)
        .where(eq(sql`lower(${users.email})`, normalizeEmail(req.body.email)))
        .limit(1);
      const ok = await verifyPassword(user?.passwordHash ?? null, req.body.password);
      if (!user || !ok) return reply.code(401).send({ error: 'invalid_credentials' });
      await app.startSession(reply, user.id);
      return { ok: true };
    },
  );

  app.post('/auth/logout', async (req, reply) => {
    await app.endSession(req, reply);
    return { ok: true };
  });

  app.get('/auth/me', { preHandler: requireUser }, async (req) => {
    const user = currentUser(req);
    const rows = await db
      .select({ id: teams.id, name: teams.name, role: memberships.role })
      .from(memberships)
      .innerJoin(teams, eq(teams.id, memberships.teamId))
      .where(eq(memberships.userId, user.id))
      .orderBy(teams.name);
    return { user, teams: rows };
  });
};
