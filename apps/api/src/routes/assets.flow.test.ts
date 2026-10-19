import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { MemoryStore } from '../storage/object-store';
import { adminUrl, freshDb } from '../test/db';
import { setupTeam } from '../test/team';
import { MAX_UPLOAD_BYTES } from './assets';

const fixture = (name: string) => readFileSync(new URL(`../assets/fixtures/${name}`, import.meta.url));

/** Builds a multipart/form-data body with one file part. */
function multipart(data: Uint8Array, filename: string, contentType: string) {
  const boundary = '----sc-test-boundary';
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { payload: Buffer.concat([head, data, tail]), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

describe.skipIf(!adminUrl)('asset upload (Postgres)', () => {
  let app: FastifyInstance;
  let drop: () => Promise<void>;
  const store = new MemoryStore();
  let teamId = '';
  let editor = '';
  let viewer = '';

  const upload = (data: Uint8Array, filename = 'f.bin', contentType = 'application/octet-stream', cookie = editor) => {
    const m = multipart(data, filename, contentType);
    return app.inject({ method: 'POST', url: `/teams/${teamId}/assets`, payload: m.payload, headers: { ...m.headers, cookie } });
  };
  const get = (url: string, cookie = viewer) => app.inject({ method: 'GET', url, headers: { cookie } });

  beforeAll(async () => {
    const fresh = await freshDb();
    drop = fresh.drop;
    app = await buildApp({ db: fresh.db, store, secureCookie: false, logger: false });
    const team = await setupTeam(app);
    teamId = team.teamId;
    editor = await team.member('editor');
    viewer = await team.member('viewer');
  });
  afterAll(async () => {
    await app?.close();
    await drop?.();
  });

  it.each([
    ['tiny.png', 'image/png', 3, 2],
    ['tiny.jpg', 'image/jpeg', 5, 4],
    ['tiny-lossy.webp', 'image/webp', 7, 6],
  ])('stores %s with type from magic bytes and its dimensions', async (file, mime, width, height) => {
    const bytes = fixture(file);
    // Deliberately wrong client-side name and type: only the bytes count.
    const res = await upload(bytes, 'whatever.txt', 'text/plain');
    expect(res.statusCode).toBe(201);
    const asset = res.json();
    expect(asset).toMatchObject({ kind: 'image', mime, width, height, bytes: bytes.length });

    const content = await get(`/teams/${teamId}/assets/${asset.id}/content`);
    expect(content.statusCode).toBe(200);
    expect(content.headers['content-type']).toBe(mime);
    expect(content.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(content.rawPayload, bytes)).toBe(0);
    expect(store.objects.has(`teams/${teamId}/assets/${asset.sha256}.${mime === 'image/jpeg' ? 'jpg' : mime.slice(6)}`)).toBe(true);
  });

  it('dedupes identical content within the team (sha256)', async () => {
    const first = await upload(fixture('tiny-lossless.webp'), 'a.webp');
    const again = await upload(fixture('tiny-lossless.webp'), 'b.webp');
    expect(first.statusCode).toBe(201);
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(first.json().id);
    const list = (await get(`/teams/${teamId}/assets`)).json<{ sha256: string }[]>();
    expect(list.filter((a) => a.sha256 === first.json().sha256)).toHaveLength(1);
  });

  it('rejects types other than PNG/JPEG/WebP/SVG regardless of the claimed type', async () => {
    expect((await upload(fixture('tiny.gif'), 'x.png', 'image/png')).statusCode).toBe(415);
    expect((await upload(Buffer.from('%PDF-1.7 ...'), 'x.svg', 'image/svg+xml')).statusCode).toBe(415);
    expect((await upload(Buffer.from('<html><script>1</script></html>'), 'x.svg', 'image/svg+xml')).statusCode).toBe(415);
  });

  it('stores SVGs sanitized and measures them', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" onload="alert(1)">' +
      '<script>alert(2)</script><image href="https://evil.example/t.png"/><rect width="40" height="20"/></svg>';
    const res = await upload(Buffer.from(svg), 'logo.svg', 'image/svg+xml');
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ kind: 'vector', mime: 'image/svg+xml', width: 40, height: 20 });

    const content = await get(`/teams/${teamId}/assets/${res.json().id}/content`);
    expect(content.body).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><image></image><rect width="40" height="20"></rect></svg>',
    );
    expect(content.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('rejects SVGs with entity declarations or references', async () => {
    const bomb =
      '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "a">]><svg xmlns="http://www.w3.org/2000/svg">&a;</svg>';
    // A DOCTYPE with an internal subset never passes the sniffer.
    expect((await upload(Buffer.from(bomb))).statusCode).toBe(415);
    const undefinedEntity = '<svg xmlns="http://www.w3.org/2000/svg"><text>&ext;</text></svg>';
    expect((await upload(Buffer.from(undefinedEntity))).statusCode).toBe(422);
  });

  it('accepts TTF, OTF and WOFF2 fonts, stores their family, and lists them', async () => {
    const res = await Promise.all(
      [
        ['tiny.ttf', 'font/ttf'],
        ['tiny.otf', 'font/otf'],
        ['tiny.woff2', 'font/woff2'],
      ].map(([file, mime]) => upload(fixture(file ?? ''), file, 'application/octet-stream').then((r) => [r, mime] as const)),
    );
    for (const [r, mime] of res) {
      expect(r.statusCode).toBe(201);
      expect(r.json()).toMatchObject({ kind: 'font', mime, fontFamily: 'SC Test Sans', width: null, height: null });
    }
    const fonts = (await get(`/teams/${teamId}/fonts`)).json<{ family: string; mime: string }[]>();
    expect(fonts.map((f) => f.mime).sort()).toEqual(['font/otf', 'font/ttf', 'font/woff2']);
    expect(fonts.every((f) => f.family === 'SC Test Sans')).toBe(true);
    const content = await get(`/teams/${teamId}/assets/${res[2]?.[0].json().id}/content`);
    expect(content.headers['content-type']).toBe('font/woff2');
  });

  it('rejects font collections (415) and unparseable fonts (422)', async () => {
    expect((await upload(fixture('tiny.ttc'), 'x.ttc')).statusCode).toBe(415);
    const broken = await upload(fixture('broken.ttf'), 'x.ttf');
    expect(broken.statusCode).toBe(422);
    expect(broken.json()).toEqual({ error: 'font_rejected' });
  });

  it('caps uploads at 50 MB', async () => {
    const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
    fixture('tiny.png').copy(big);
    expect((await upload(big, 'big.png', 'image/png')).statusCode).toBe(413);
  });

  it('enforces roles and team scope', async () => {
    expect((await upload(fixture('tiny.png'), 'x.png', 'image/png', viewer)).statusCode).toBe(403);
    expect((await get(`/teams/${teamId}/assets`, '')).statusCode).toBe(401);
    const asset = (await get(`/teams/${teamId}/assets`)).json<{ id: string }[]>()[0];
    expect((await get(`/teams/${teamId}/assets/${asset?.id}`)).statusCode).toBe(200);
    const otherTeam = '00000000-0000-4000-8000-000000000000';
    expect((await get(`/teams/${otherTeam}/assets/${asset?.id}/content`)).statusCode).toBe(404);
    const notMultipart = await app.inject({
      method: 'POST',
      url: `/teams/${teamId}/assets`,
      payload: { file: 'x' },
      headers: { cookie: editor },
    });
    expect(notMultipart.statusCode).toBe(415);
  });
});
