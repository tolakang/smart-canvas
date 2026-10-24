import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { MemoryStore } from '../storage/object-store';
import { adminUrl, freshDb } from '../test/db';
import { caller, setupTeam } from '../test/team';
import { MAX_THUMB_BYTES, thumbKey } from './thumbnails';

// A 1 × 1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

describe.skipIf(!adminUrl)('project thumbnails API (Postgres, D64)', () => {
  let app: FastifyInstance;
  let drop: () => Promise<void>;
  let call: ReturnType<typeof caller>;
  let teamId = '';
  let editor = '';
  let viewer = '';
  let projectId = '';
  const store = new MemoryStore();
  const url = () => `/teams/${teamId}/projects/${projectId}/thumbnail`;
  const put = (cookie: string, body: Buffer, type = 'image/png') =>
    app.inject({ method: 'PUT', url: url(), payload: body, headers: { cookie, 'content-type': type } });

  beforeAll(async () => {
    const fresh = await freshDb();
    drop = fresh.drop;
    app = await buildApp({ db: fresh.db, store, secureCookie: false, logger: false });
    call = caller(app);
    const team = await setupTeam(app);
    teamId = team.teamId;
    editor = await team.member('editor');
    viewer = await team.member('viewer');
    projectId = (await call('POST', `/teams/${teamId}/projects`, editor, { name: 'Thumbs' })).json().id;
  });
  afterAll(async () => {
    await app?.close();
    await drop?.();
  });

  const listed = async () => (await call('GET', `/teams/${teamId}/projects`, viewer)).json().find((p: { id: string }) => p.id === projectId);

  it('a new project has none', async () => {
    expect((await listed()).thumbAt).toBeNull();
    expect((await call('GET', url(), viewer)).statusCode).toBe(404);
  });

  it('an editor stores one; members get it back; the project is not re-dated', async () => {
    const before = await listed();
    const res = await put(editor, PNG);
    expect(res.statusCode).toBe(200);
    expect(res.json().thumbAt).toEqual(expect.any(String));
    const after = await listed();
    expect(after.thumbAt).toBe(res.json().thumbAt);
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(after.rev).toBe(before.rev);
    const got = await call('GET', url(), viewer);
    expect(got.statusCode).toBe(200);
    expect(got.headers['content-type']).toBe('image/png');
    expect(got.rawPayload.equals(PNG)).toBe(true);
  });

  it('the bytes decide: anything but PNG, JPEG or WebP is refused, whatever its Content-Type', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect((await put(editor, svg)).statusCode).toBe(415);
    expect((await put(editor, svg, 'image/svg+xml')).statusCode).toBe(415);
  });

  it('too large is refused', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_THUMB_BYTES)]);
    expect((await put(editor, big)).statusCode).toBe(413);
  });

  it('viewers cannot store one; other teams see nothing', async () => {
    expect((await put(viewer, PNG)).statusCode).toBe(403);
    expect((await call('GET', `/teams/00000000-0000-4000-8000-000000000000/projects/${projectId}/thumbnail`, editor)).statusCode).toBe(404);
  });

  it('deleting the project deletes its thumbnail from storage', async () => {
    expect(store.objects.has(thumbKey(projectId))).toBe(true);
    expect((await call('DELETE', `/teams/${teamId}/projects/${projectId}`, editor)).statusCode).toBe(204);
    expect(store.objects.has(thumbKey(projectId))).toBe(false);
  });
});
