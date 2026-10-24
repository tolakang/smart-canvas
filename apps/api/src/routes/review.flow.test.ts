import type { ProjectDoc } from '@smart-canvas/core';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import type { Db } from '../db/client';
import { outputApprovals, reviewComments } from '../db/schema';
import { MemoryStore } from '../storage/object-store';
import { adminUrl, freshDb } from '../test/db';
import { caller, setupTeam } from '../test/team';

interface Comment {
  id: string;
  outputId: string;
  parentId: string | null;
  text: string;
  pinX: number | null;
  pinY: number | null;
  author: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
}
interface Review {
  comments: Comment[];
  approvals: { outputId: string; fingerprint: string; approvedBy: string | null }[];
}

describe.skipIf(!adminUrl)('review API (Postgres, D63)', () => {
  let app: FastifyInstance;
  let db: Db;
  let drop: () => Promise<void>;
  let call: ReturnType<typeof caller>;
  let teamId = '';
  let admin = '';
  let editor = '';
  let editor2 = '';
  let viewer = '';
  const base = () => `/teams/${teamId}/projects`;

  beforeAll(async () => {
    const fresh = await freshDb();
    drop = fresh.drop;
    db = fresh.db;
    app = await buildApp({ db, store: new MemoryStore(), secureCookie: false, logger: false });
    call = caller(app);
    const team = await setupTeam(app);
    teamId = team.teamId;
    admin = team.admin;
    editor = await team.member('editor');
    editor2 = await team.member('editor');
    viewer = await team.member('viewer');
  });
  afterAll(async () => {
    await app?.close();
    await drop?.();
  });

  /** A project with two Previews, o1 and o2. */
  async function create() {
    const res = await call('POST', base(), editor, { name: 'Review' });
    const p = res.json<{ id: string; doc: ProjectDoc }>();
    const out = (id: string) => ({ id, label: id, size: { width: 1080, height: 1080, unit: 'px' as const }, overrides: [], board: { x: 0, y: 0 } });
    expect((await call('PUT', `${base()}/${p.id}`, editor, { rev: 0, doc: { ...p.doc, outputs: [out('o1'), out('o2')] } })).statusCode).toBe(200);
    return p.id;
  }
  const review = async (id: string, who = viewer) => (await call('GET', `${base()}/${id}/review`, who)).json<Review>();
  async function post(id: string, who: string, body: object) {
    const res = await call('POST', `${base()}/${id}/review/comments`, who, body);
    expect(res.statusCode, res.body).toBe(201);
    return res.json<{ id: string }>().id;
  }

  it('anyone in the team comments (viewers too): pinned or not, with replies under a thread', async () => {
    const id = await create();
    const pinned = await post(id, viewer, { outputId: 'o1', text: '  Logo too close to the edge ', pin: { x: 0.9, y: 0.1 } });
    await post(id, editor, { outputId: 'o1', text: 'Moved it', parentId: pinned });
    await post(id, editor, { outputId: 'o2', text: 'Looks good' });
    const r = await review(id);
    expect(r.comments.map((c) => [c.outputId, c.text, c.author, c.parentId === pinned])).toEqual([
      ['o1', 'Logo too close to the edge', 'viewer', false],
      ['o1', 'Moved it', 'editor', true],
      ['o2', 'Looks good', 'editor', false],
    ]);
    expect(r.comments[0]).toMatchObject({ pinX: 0.9, pinY: 0.1, resolvedAt: null });
    expect(r.comments[2]).toMatchObject({ pinX: null, pinY: null });
  });

  it('refuses comments on Previews that do not exist, bad replies, empty text and pins off the Preview', async () => {
    const id = await create();
    const thread = await post(id, editor, { outputId: 'o1', text: 'a' });
    const reply = await post(id, editor, { outputId: 'o1', text: 'b', parentId: thread });
    const url = `${base()}/${id}/review/comments`;
    expect((await call('POST', url, editor, { outputId: 'gone', text: 'x' })).statusCode).toBe(404);
    expect((await call('POST', url, editor, { outputId: 'o1', text: 'x', parentId: reply })).statusCode).toBe(400); // one level deep
    expect((await call('POST', url, editor, { outputId: 'o2', text: 'x', parentId: thread })).statusCode).toBe(400); // another Preview's thread
    expect((await call('POST', url, editor, { outputId: 'o1', text: 'x', parentId: thread, pin: { x: 0, y: 0 } })).statusCode).toBe(400);
    expect((await call('POST', url, editor, { outputId: 'o1', text: '   ' })).statusCode).toBe(400);
    expect((await call('POST', url, editor, { outputId: 'o1', text: 'x', pin: { x: 1.2, y: 0 } })).statusCode).toBe(400);
    expect((await call('POST', url, editor, { outputId: 'o1', text: 'x'.repeat(2001) })).statusCode).toBe(400);
  });

  it('the author edits the text; the author or an editor resolves and reopens; replies are not resolved', async () => {
    const id = await create();
    const mine = await post(id, viewer, { outputId: 'o1', text: 'Typo' });
    const theirs = await post(id, editor, { outputId: 'o1', text: 'Darker?' });
    const reply = await post(id, viewer, { outputId: 'o1', text: 'Yes', parentId: theirs });
    const url = (c: string) => `${base()}/${id}/review/comments/${c}`;
    expect((await call('PATCH', url(mine), viewer, { text: 'Typo in the headline' })).statusCode).toBe(200);
    expect((await call('PATCH', url(mine), editor, { text: 'hijack' })).statusCode).toBe(403);
    expect((await call('PATCH', url(theirs), viewer, { resolved: true })).statusCode).toBe(403); // a viewer resolves only their own
    expect((await call('PATCH', url(mine), viewer, { resolved: true })).statusCode).toBe(200);
    expect((await call('PATCH', url(theirs), editor2, { resolved: true })).statusCode).toBe(200); // any editor
    expect((await call('PATCH', url(reply), viewer, { resolved: true })).statusCode).toBe(400);
    let r = await review(id);
    expect(r.comments.find((c) => c.id === mine)).toMatchObject({ text: 'Typo in the headline', resolvedBy: 'viewer' });
    expect(r.comments.find((c) => c.id === theirs)?.resolvedBy).toBe('editor');
    expect((await call('PATCH', url(theirs), editor, { resolved: false })).statusCode).toBe(200);
    r = await review(id);
    expect(r.comments.find((c) => c.id === theirs)).toMatchObject({ resolvedAt: null, resolvedBy: null });
  });

  it('the author or an admin deletes a comment; its replies go with it', async () => {
    const id = await create();
    const thread = await post(id, editor, { outputId: 'o1', text: 'a' });
    await post(id, viewer, { outputId: 'o1', text: 'b', parentId: thread });
    const other = await post(id, viewer, { outputId: 'o2', text: 'c' });
    const url = (c: string) => `${base()}/${id}/review/comments/${c}`;
    expect((await call('DELETE', url(thread), editor2)).statusCode).toBe(403);
    expect((await call('DELETE', url(other), editor)).statusCode).toBe(403);
    expect((await call('DELETE', url(thread), editor)).statusCode).toBe(204);
    expect((await call('DELETE', url(other), admin)).statusCode).toBe(204);
    expect((await review(id)).comments).toEqual([]);
    expect((await call('DELETE', url(other), admin)).statusCode).toBe(404);
  });

  it('editors approve a Preview with its fingerprint, approve again, and withdraw; viewers cannot', async () => {
    const id = await create();
    const url = (o: string) => `${base()}/${id}/review/approvals/${o}`;
    expect((await call('PUT', url('o1'), viewer, { fingerprint: 'abc' })).statusCode).toBe(403);
    expect((await call('PUT', url('gone'), editor, { fingerprint: 'abc' })).statusCode).toBe(404);
    expect((await call('PUT', url('o1'), editor, { fingerprint: '' })).statusCode).toBe(400);
    expect((await call('PUT', url('o1'), editor, { fingerprint: 'abc' })).statusCode).toBe(200);
    expect((await review(id)).approvals).toMatchObject([{ outputId: 'o1', fingerprint: 'abc', approvedBy: 'editor' }]);
    expect((await call('PUT', url('o1'), editor2, { fingerprint: 'def' })).statusCode).toBe(200); // re-approved after a change
    expect((await review(id)).approvals).toMatchObject([{ outputId: 'o1', fingerprint: 'def', approvedBy: 'editor' }]);
    expect((await call('DELETE', url('o1'), viewer)).statusCode).toBe(403);
    expect((await call('DELETE', url('o1'), editor)).statusCode).toBe(204);
    expect((await review(id)).approvals).toEqual([]);
    expect((await call('DELETE', url('o1'), editor)).statusCode).toBe(404);
  });

  it('other teams, other projects and signed-out callers get nothing; a deleted project takes its review with it', async () => {
    const id = await create();
    const thread = await post(id, editor, { outputId: 'o1', text: 'a' });
    expect((await call('PUT', `${base()}/${id}/review/approvals/o1`, editor, { fingerprint: 'x' })).statusCode).toBe(200);
    const otherTeam = '00000000-0000-4000-8000-000000000000';
    expect((await call('GET', `/teams/${otherTeam}/projects/${id}/review`, editor)).statusCode).toBe(404);
    expect((await call('POST', `/teams/${otherTeam}/projects/${id}/review/comments`, editor, { outputId: 'o1', text: 'x' })).statusCode).toBe(404);
    expect((await call('GET', `${base()}/${id}/review`)).statusCode).toBe(401);
    const other = await create();
    expect((await call('PATCH', `${base()}/${other}/review/comments/${thread}`, editor, { text: 'x' })).statusCode).toBe(404);
    expect((await call('DELETE', `${base()}/${other}/review/comments/${thread}`, admin)).statusCode).toBe(404);

    expect((await call('DELETE', `${base()}/${id}`, editor)).statusCode).toBe(204);
    expect(await db.select().from(reviewComments).where(eq(reviewComments.projectId, id))).toEqual([]);
    expect(await db.select().from(outputApprovals).where(eq(outputApprovals.projectId, id))).toEqual([]);
  });
});
