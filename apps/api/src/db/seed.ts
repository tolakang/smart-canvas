/** Built-in size presets (team_id null) follow `@smart-canvas/presets`: upserted by id, stale ones removed. */
import { presets as builtIns } from '@smart-canvas/presets';
import { and, isNull, notInArray, sql } from 'drizzle-orm';
import type { Db } from './client';
import { presets } from './schema';

export async function seedBuiltInPresets(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    const ids = builtIns.map((p) => p.id);
    await tx.delete(presets).where(and(isNull(presets.teamId), ids.length ? notInArray(presets.id, ids) : sql`true`));
    if (ids.length === 0) return;
    await tx
      .insert(presets)
      .values(
        builtIns.map((p) => ({
          id: p.id,
          teamId: null,
          group: p.group,
          name: p.name,
          family: p.family ?? null,
          width: p.size.width,
          height: p.size.height,
          unit: p.size.unit,
          dpi: p.dpi ?? null,
          bleedMm: p.bleedMm ?? null,
        })),
      )
      .onConflictDoUpdate({
        target: presets.id,
        set: {
          group: sql`excluded."group"`,
          name: sql`excluded.name`,
          family: sql`excluded.family`,
          width: sql`excluded.width`,
          height: sql`excluded.height`,
          unit: sql`excluded.unit`,
          dpi: sql`excluded.dpi`,
          bleedMm: sql`excluded.bleed_mm`,
        },
      });
  });
}
