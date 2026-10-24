import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from './schema';

const tableNames = Object.values(schema)
  .filter((v) => is(v, PgTable))
  .map((t) => getTableConfig(t).name)
  .sort();

describe('db schema', () => {
  it('has the tables listed in the DATA-MODEL header', () => {
    expect(tableNames).toEqual(
      [
        'assets',
        'export_jobs',
        'invites',
        'library_items',
        'memberships',
        'presets',
        'project_versions',
        'projects',
        'sessions',
        'teams',
        'users',
      ].sort(),
    );
  });

  it('stores the project document as JSONB with a revision', () => {
    const cols = Object.fromEntries(getTableConfig(schema.projects).columns.map((c) => [c.name, c]));
    expect(cols.doc?.getSQLType()).toBe('jsonb');
    expect(cols.rev?.getSQLType()).toBe('integer');
    expect(cols.rev?.notNull).toBe(true);
  });
});
