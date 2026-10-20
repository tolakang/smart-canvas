/**
 * Export worker (D27): consumes the pg-boss `export` queue; each job renders one output in headless
 * Chromium through the web app's /render page and stores the file (T6.5).
 */
import pg from 'pg';
import { PgBoss } from 'pg-boss';
import { chromium } from 'playwright';
import { httpApiFetch } from './api-fetch';
import { runExportJob } from './jobs';
import { pgJobStore } from './pg-jobs';
import { CHROMIUM_ARGS, openRender } from './render';
import { s3FileStore } from './s3-files';
import { EXPORT_QUEUE, WORKER_NAME } from './worker';

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`${name} is not set`);
    process.exit(1);
  }
  return v;
}

const databaseUrl = required('DATABASE_URL');
const webUrl = required('WEB_URL');
const api = httpApiFetch(required('API_URL'), required('RENDER_TOKEN'));
const concurrency = Math.max(1, Number(process.env.EXPORT_CONCURRENCY ?? 2));

const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
const browser = await chromium.launch({ args: CHROMIUM_ARGS });
const boss = new PgBoss(databaseUrl);
boss.on('error', (err) => console.error('pg-boss', err));
await boss.start();
await boss.createQueue(EXPORT_QUEUE);

const deps = {
  jobs: pgJobStore(pool),
  files: s3FileStore(process.env),
  api,
  render: (target: Parameters<typeof openRender>[2]) => openRender(browser, webUrl, target, api),
};

await boss.work<{ exportJobId: string }>(EXPORT_QUEUE, { localConcurrency: concurrency }, async (jobs) => {
  for (const job of jobs) await runExportJob(job.data.exportJobId, deps);
});
console.log(`${WORKER_NAME} ready (concurrency ${concurrency})`);

const shutdown = async () => {
  await boss.stop({ graceful: true, timeout: 30_000 });
  await browser.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
