/**
 * The whole stack in one process for end-to-end tests: the API on a fresh Postgres database, the web app on
 * Vite (its /api proxied to that API) and Chromium. Export jobs run right away in this process through the
 * production runExportJob, like the worker does from pg-boss.
 */
import { createBoardProject } from '@smart-canvas/core';
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
  pool.on('error', () => undefined); // the test database is force-dropped at close
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
/**
 * Sets up the workspace and creates a project. D68: a new project starts without empty slots; most browser tests are
 * built on the D8 shape (an empty Subject picture and Logo, a text named Headline), so the project is given that shape
 * unless `fresh` asks for a new project as a user gets it.
 */
export async function setupAndCreateProject(page: Page, webUrl: string, name: string, opts: { fresh?: boolean } = {}): Promise<{ teamId: string; projectId: string }> {
  await page.goto(webUrl);
  await page.getByText('First run? Set up the workspace').click();
  await page.getByLabel('Your name').fill('Ada');
  await page.getByLabel('Team name').fill('Studio');
  await page.getByLabel('Email').fill('ada@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  // T16.2: "+ New project" opens a dialog for the name.
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByPlaceholder('New project name').fill(name);
  await page.getByRole('dialog', { name: 'New project' }).getByRole('button', { name: 'Create', exact: true }).click();
  // D49: the board shows once the Layer Comp group is up.
  await page.locator('.sc-comp-group').waitFor();
  const [, teamId = '', projectId = ''] = /#\/t\/([^/]+)\/p\/([^/]+)/.exec(page.url()) ?? [];
  if (!opts.fresh) {
    const url = `${webUrl}api/teams/${teamId}/projects/${projectId}`;
    const { rev } = (await (await page.request.get(url)).json()) as { rev: number };
    const put = await page.request.put(url, { data: { rev, doc: createBoardProject(name, { legacySlots: true }) } });
    if (put.status() !== 200) throw new Error(`could not give the project its test shape: ${put.status()}`);
    await page.reload();
    await page.locator('.sc-comp-group').waitFor();
  }
  return { teamId, projectId };
}

/** D49: a node on the page-3 board by its title (Logo, Headline, Text, Image, Background, Preview, … Preset). */
export const boardNode = (page: Page, title: string) =>
  page.locator('.react-flow__node').filter({ has: page.locator('.sc-node__title', { hasText: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) });
/** D49: a file put into a named picture of an Image or Logo node (its Replace input; the layer keeps its place). */
export const putPicture = (page: Page, label: string, file: { name: string; mimeType: string; buffer: Buffer }) => page.getByLabel(`Replace ${label}`, { exact: true }).setInputFiles(file);
/** D49: opens one of the Layer Comp's layout editors (Square is the master). */
export const openLayout = (page: Page, family: 'Square' | 'Vertical' | 'Horizontal' = 'Square') => page.locator('.react-flow__node-mainNode').getByRole('button', { name: new RegExp(`^(Edit|View) ${family} layout$`) }).click();
