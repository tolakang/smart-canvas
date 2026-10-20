/**
 * The export job queue (D28: pg-boss, no Redis). The API only sends; the worker consumes. One queue job per
 * export_jobs row (= one output), carrying just the row id.
 */
import { PgBoss } from 'pg-boss';

export const EXPORT_QUEUE = 'export';

export interface ExportQueue {
  send(exportJobId: string): Promise<void>;
}

export async function startPgBossQueue(connectionString: string): Promise<ExportQueue & { stop(): Promise<void> }> {
  const boss = new PgBoss(connectionString);
  boss.on('error', (err) => console.error('pg-boss', err));
  await boss.start();
  await boss.createQueue(EXPORT_QUEUE);
  return {
    send: async (id) => {
      await boss.send(EXPORT_QUEUE, { exportJobId: id }, { retryLimit: 1, expireInSeconds: 600 });
    },
    stop: () => boss.stop(),
  };
}
