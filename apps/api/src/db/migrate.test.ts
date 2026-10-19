import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from './migrate';

/**
 * Integration: runs the migrations on a brand-new empty database.
 * Needs TEST_DATABASE_URL pointing at a Postgres role with CREATEDB, e.g.
 *   TEST_DATABASE_URL=postgres://sc:sc@localhost:5432/postgres pnpm test
 */
const adminUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!adminUrl)('migrations on empty Postgres', () => {
  const dbName = `sc_test_${randomUUID().replaceAll('-', '')}`;
  let url = '';
  let client: pg.Client;

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${dbName}"`);
    await admin.end();
    const u = new URL(adminUrl ?? '');
    u.pathname = `/${dbName}`;
    url = u.toString();
  });

  afterAll(async () => {
    await client?.end();
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.end();
  });

  it('applies all migrations and creates every table', async () => {
    await runMigrations(url);
    client = new pg.Client({ connectionString: url });
    await client.connect();
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      'assets',
      'export_jobs',
      'invites',
      'library_items',
      'memberships',
      'presets',
      'projects',
      'sessions',
      'teams',
      'users',
    ]);
  });

  it('is idempotent', async () => {
    await expect(runMigrations(url)).resolves.toBeUndefined();
  });

  it('round-trips a project document and enforces case-insensitive unique email', async () => {
    const team = await client.query<{ id: string }>(`INSERT INTO teams (name) VALUES ('T') RETURNING id`);
    const teamId = team.rows[0]?.id;
    const doc = { schema: 1, rev: 0, name: 'P', sources: [], outputs: [], wires: [] };
    const p = await client.query<{ doc: unknown; rev: number }>(
      `INSERT INTO projects (team_id, name, doc) VALUES ($1, 'P', $2) RETURNING doc, rev`,
      [teamId, doc],
    );
    expect(p.rows[0]).toEqual({ doc, rev: 0 });

    await client.query(`INSERT INTO users (email, password_hash) VALUES ('A@x.com', 'h')`);
    await expect(client.query(`INSERT INTO users (email, password_hash) VALUES ('a@X.com', 'h')`)).rejects.toThrow(
      /users_email_lower_uq/,
    );
  });
});
