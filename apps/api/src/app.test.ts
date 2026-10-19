import { describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { MemoryStore } from './storage/object-store';
import type { Db } from './db/client';

describe('api', () => {
  it('GET /health returns ok', async () => {
    // /health never touches the database.
    const app = await buildApp({ db: {} as Db, store: new MemoryStore(), logger: false });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });
});
