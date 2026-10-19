import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createDb, type Db } from '../db/client';
import { runMigrations } from '../db/migrate';

/** Postgres role with CREATEDB, e.g. postgres://sc:sc@localhost:5432/postgres. Integration tests skip without it. */
export const adminUrl = process.env.TEST_DATABASE_URL;

/** Creates a fresh, migrated database; `drop()` removes it. */
export async function freshDb(): Promise<{ url: string; db: Db; drop: () => Promise<void> }> {
  const name = `sc_test_${randomUUID().replaceAll('-', '')}`;
  await adminQuery(`CREATE DATABASE "${name}"`);
  const u = new URL(adminUrl ?? '');
  u.pathname = `/${name}`;
  const url = u.toString();
  await runMigrations(url);
  const { db, pool } = createDb(url);
  return {
    url,
    db,
    drop: async () => {
      await pool.end();
      await adminQuery(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    },
  };
}

async function adminQuery(sql: string): Promise<void> {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(sql);
  } finally {
    await admin.end();
  }
}
