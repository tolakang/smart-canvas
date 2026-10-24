/**
 * D62 project history: earlier docs of a project, kept in `project_versions`.
 * - A save keeps the doc it replaces when the last version is VERSION_EVERY_MS old, or when the save removes inputs
 *   or sizes ("before-delete", labelled with what went: "1 input", "2 sizes"). The server decides, so autosave needs nothing and no client can skip a version.
 * - Restoring keeps the current doc first ("before-restore"), then stores the version as the next rev: open boards
 *   get 409 on their next save and offer "Reload latest".
 * - Named versions are kept until deleted (MAX_NAMED per project); the others are pruned to the newest KEEP_AUTO.
 * Members read; editors name, delete and restore (viewers are read-only, as everywhere).
 */
import { migrateProjectDoc, type ProjectDoc } from '@smart-canvas/core';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { currentUser, requireTeam } from '../auth/plugin';
import type { Db } from '../db/client';
import { projects, projectVersions, users } from '../db/schema';

export const VERSION_EVERY_MS = 10 * 60_000;
export const KEEP_AUTO = 50;
export const MAX_NAMED = 50;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** What a save removed, in the board's words: inputs (layers) and sizes (outputs). A card can hold several inputs. */
export function removedLabel(stored: { inputs: number; sizes: number }, next: ProjectDoc): string {
  const n = (count: number, one: string) => (count > 0 ? `${count} ${one}${count === 1 ? '' : 's'}` : '');
  return [n(stored.inputs - next.sources.length, 'input'), n(stored.sizes - next.outputs.length, 'size')].filter(Boolean).join(' and ');
}

/** The stored doc's input and size counts, counted in Postgres so a save doesn't read the whole doc back. */
export const storedCounts = {
  inputs: sql<number>`coalesce(jsonb_array_length(${projects.doc} -> 'sources'), 0)::int`,
  sizes: sql<number>`coalesce(jsonb_array_length(${projects.doc} -> 'outputs'), 0)::int`,
};

/** Copies the project's stored doc into a version (in SQL, so the doc isn't read back), then prunes. */
async function keep(tx: Tx, projectId: string, kind: 'auto' | 'before-delete' | 'before-restore' | 'named', label: string, by: string | null) {
  await tx.execute(sql`
    INSERT INTO ${projectVersions} (project_id, rev, kind, label, doc, created_by)
    SELECT ${projects.id}, ${projects.rev}, ${kind}, ${label}, ${projects.doc}, ${by}::uuid FROM ${projects} WHERE ${projects.id} = ${projectId}`);
  if (kind === 'named') return;
  const keepIds = tx
    .select({ id: projectVersions.id })
    .from(projectVersions)
    .where(and(eq(projectVersions.projectId, projectId), ne(projectVersions.kind, 'named')))
    .orderBy(desc(projectVersions.createdAt), desc(projectVersions.rev))
    .limit(KEEP_AUTO);
  await tx
    .delete(projectVersions)
    .where(and(eq(projectVersions.projectId, projectId), ne(projectVersions.kind, 'named'), sql`${projectVersions.id} NOT IN ${keepIds}`));
}

/**
 * Called by a save, inside its transaction with the project row locked, before the row is overwritten by `next`.
 * `current` is the stored row: its rev, who saved it, and its input and size counts.
 */
export async function keepBeforeSave(tx: Tx, projectId: string, current: { rev: number; updatedBy: string | null; inputs: number; sizes: number }, next: ProjectDoc) {
  const [last] = await tx
    .select({ rev: projectVersions.rev, old: sql<boolean>`${projectVersions.createdAt} <= now() - ${`${VERSION_EVERY_MS} milliseconds`}::interval` })
    .from(projectVersions)
    .where(eq(projectVersions.projectId, projectId))
    .orderBy(desc(projectVersions.createdAt), desc(projectVersions.rev))
    .limit(1);
  if (last?.rev === current.rev) return; // this state is kept already
  const removed = removedLabel(current, next);
  if (removed) await keep(tx, projectId, 'before-delete', removed, current.updatedBy);
  else if (!last || last.old) await keep(tx, projectId, 'auto', '', current.updatedBy);
}

type Params = { teamId: string; projectId: string };
type VersionParams = Params & { versionId: string };
const uuid = { type: 'string', format: 'uuid' } as const;
const projectParams = { type: 'object', required: ['teamId', 'projectId'], properties: { teamId: { type: 'string' }, projectId: uuid } } as const;
const versionParams = {
  type: 'object',
  required: ['teamId', 'projectId', 'versionId'],
  properties: { teamId: { type: 'string' }, projectId: uuid, versionId: uuid },
} as const;

/** A list row: no doc. `by` is the name of who made that state (null when they left). */
const listFields = {
  id: projectVersions.id,
  rev: projectVersions.rev,
  kind: projectVersions.kind,
  label: projectVersions.label,
  createdAt: projectVersions.createdAt,
  by: users.name,
};

export const versionRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;
  const member = requireTeam();
  const inTeam = (p: Params) => and(eq(projects.id, p.projectId), eq(projects.teamId, p.teamId));
  const exists = async (p: Params) => (await db.select({ id: projects.id }).from(projects).where(inTeam(p))).length > 0;
  const base = '/teams/:teamId/projects/:projectId/versions';

  app.get<{ Params: Params }>(base, { preHandler: member, schema: { params: projectParams } }, async (req, reply) => {
    if (!(await exists(req.params))) return reply.code(404).send({ error: 'not_found' });
    return db
      .select(listFields)
      .from(projectVersions)
      .leftJoin(users, eq(users.id, projectVersions.createdBy))
      .where(eq(projectVersions.projectId, req.params.projectId))
      .orderBy(desc(projectVersions.createdAt), desc(projectVersions.rev));
  });

  app.get<{ Params: VersionParams }>(`${base}/:versionId`, { preHandler: member, schema: { params: versionParams } }, async (req, reply) => {
    if (!(await exists(req.params))) return reply.code(404).send({ error: 'not_found' });
    const [row] = await db
      .select({ ...listFields, doc: projectVersions.doc })
      .from(projectVersions)
      .leftJoin(users, eq(users.id, projectVersions.createdBy))
      .where(and(eq(projectVersions.id, req.params.versionId), eq(projectVersions.projectId, req.params.projectId)));
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return { ...row, doc: migrateProjectDoc(row.doc) }; // a version from before a schema change opens as the current one
  });

  /** Name the project as it is now. */
  app.post<{ Params: Params; Body: { label: string } }>(
    base,
    {
      preHandler: member,
      schema: {
        params: projectParams,
        body: { type: 'object', required: ['label'], additionalProperties: false, properties: { label: { type: 'string', minLength: 1, maxLength: 100 } } },
      },
    },
    async (req, reply) => {
      const label = req.body.label.trim();
      if (!label) return reply.code(400).send({ error: 'invalid' });
      const by = currentUser(req).id;
      const out = await db.transaction(async (tx) => {
        const [p] = await tx.select({ id: projects.id }).from(projects).where(inTeam(req.params)).for('update');
        if (!p) return 'not_found' as const;
        const [{ n } = { n: 0 }] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(projectVersions)
          .where(and(eq(projectVersions.projectId, p.id), eq(projectVersions.kind, 'named')));
        if (n >= MAX_NAMED) return 'named_limit' as const;
        await keep(tx, p.id, 'named', label, by);
        return 'ok' as const;
      });
      if (out === 'not_found') return reply.code(404).send({ error: out });
      if (out === 'named_limit') return reply.code(409).send({ error: out, max: MAX_NAMED });
      const [row] = await db
        .select(listFields)
        .from(projectVersions)
        .leftJoin(users, eq(users.id, projectVersions.createdBy))
        .where(and(eq(projectVersions.projectId, req.params.projectId), eq(projectVersions.kind, 'named')))
        .orderBy(desc(projectVersions.createdAt))
        .limit(1);
      return reply.code(201).send(row);
    },
  );

  app.delete<{ Params: VersionParams }>(`${base}/:versionId`, { preHandler: member, schema: { params: versionParams } }, async (req, reply) => {
    if (!(await exists(req.params))) return reply.code(404).send({ error: 'not_found' });
    const gone = await db
      .delete(projectVersions)
      .where(and(eq(projectVersions.id, req.params.versionId), eq(projectVersions.projectId, req.params.projectId)))
      .returning({ id: projectVersions.id });
    return gone.length ? reply.code(204).send() : reply.code(404).send({ error: 'not_found' });
  });

  /**
   * Restore: the current doc is kept as "before-restore", then the version becomes the next rev. The project keeps
   * its current name (renaming is its own action). Returns the new rev and doc, like a load.
   */
  app.post<{ Params: VersionParams }>(`${base}/:versionId/restore`, { preHandler: member, schema: { params: versionParams } }, async (req, reply) => {
    const by = currentUser(req).id;
    const out = await db.transaction(async (tx) => {
      const [p] = await tx.select({ rev: projects.rev, name: projects.name, updatedBy: projects.updatedBy }).from(projects).where(inTeam(req.params)).for('update');
      if (!p) return null;
      const [v] = await tx
        .select({ doc: projectVersions.doc })
        .from(projectVersions)
        .where(and(eq(projectVersions.id, req.params.versionId), eq(projectVersions.projectId, req.params.projectId)));
      if (!v) return null;
      await keep(tx, req.params.projectId, 'before-restore', '', p.updatedBy);
      const next = p.rev + 1;
      const doc: ProjectDoc = { ...migrateProjectDoc(v.doc), name: p.name, rev: next };
      const [row] = await tx
        .update(projects)
        .set({ doc, rev: next, updatedBy: by, updatedAt: sql`now()` })
        .where(eq(projects.id, req.params.projectId))
        .returning({ id: projects.id, rev: projects.rev, doc: projects.doc, updatedAt: projects.updatedAt });
      return row;
    });
    return out ?? reply.code(404).send({ error: 'not_found' });
  });
};
