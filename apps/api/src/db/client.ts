import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

export function createDb(connectionString: string): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString });
  // An idle client dropped by the server (restart, admin terminate) must not crash the process; the pool replaces it.
  pool.on('error', (err) => console.error('pg pool', err.message));
  return { db: drizzle(pool, { schema }), pool };
}
