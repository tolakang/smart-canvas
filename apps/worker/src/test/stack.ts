/**
 * The whole stack in one process for end-to-end tests: the API on a fresh Postgres database, the web app on
 * Vite (its /api proxied to that API) and Chromium. Export jobs run right away in this process through the
 * production runExportJob, like the worker does from pg-boss.
 */
import type { AddressInfo } from 'node:net';
import { buildApp } from '@smart-canvas/api/src/app';
import { MemoryStore } from '@smart-canvas/api/src/storage/object-store';
import { freshDb } from '@smart-canvas/api/src/test/db';
import pg from 'pg';
import type { Page } from 'playwright';
import { httpApiFetch } from '../api-fetch';
import { runExportJob, type ExportDeps } from '../jobs';
import { pgJobStore } from '../pg-jobs';
import { openRender, type ApiFetch } from '../render';
import { startRenderEnv } from './render-env';

const TOKEN = 'e2e-render-token-0123456789abcdef0123';

export interface Stack {
  env: Awaited<ReturnType<typeof startRenderEnv>>;
  /** The worker's view of the API (render token). */
  api: ApiFetch;
  store: MemoryStore;
  close: () => Promise<void>;
}

export async function startStack(): Promise<Stack> {
  const fresh = await freshDb();
  const pool = new pg.Pool({ connectionString: fresh.url, max: 2 });
  const store = new MemoryStore();
  const running: Promise<void>[] = [];
  const worker: { deps?: ExportDeps } = {};
  const app = await buildApp({ db: fresh.db, store, secureCookie: false, logger: false, renderToken: TOKEN, queue: { send: async (id) => void running.push(runExportJob(id, worker.deps as ExportDeps)) } });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const apiUrl = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const env = await startRenderEnv(apiUrl);
  const api = httpApiFetch(apiUrl, TOKEN);
  worker.deps = { jobs: pgJobStore(pool), api, files: store, render: (t) => openRender(env.browser, env.webUrl, t, api) };
  return {
    env,
    api,
    store,
    close: async () => {
      await Promise.allSettled(running);
      await env.close();
      await app.close();
      await pool.end();
      await fresh.drop();
    },
  };
}

/** First-run setup in the UI, then a new project; resolves with its ids once the board shows. */
export async function setupAndCreateProject(page: Page, webUrl: string, name: string): Promise<{ teamId: string; projectId: string }> {
  await page.goto(webUrl);
  await page.getByText('First run? Set up the workspace').click();
  await page.getByLabel('Your name').fill('Ada');
  await page.getByLabel('Team name').fill('Studio');
  await page.getByLabel('Email').fill('ada@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByPlaceholder('New project name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.locator('.sc-port').first().waitFor();
  const [, teamId = '', projectId = ''] = /#\/t\/([^/]+)\/p\/([^/]+)/.exec(page.url()) ?? [];
  return { teamId, projectId };
}
