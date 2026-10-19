import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';
import { seedBuiltInPresets } from './seed';

export const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Applies all pending migrations, then syncs the built-in presets. Safe to run repeatedly. */
export async function runMigrations(connectionString: string): Promise<void> {
  const { db, pool } = createDb(connectionString);
  try {
    await migrate(db, { migrationsFolder });
    await seedBuiltInPresets(db);
  } finally {
    await pool.end();
  }
}
