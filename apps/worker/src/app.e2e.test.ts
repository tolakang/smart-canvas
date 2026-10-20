/**
 * T7.5 end to end, through the real stack: the web app in Chromium → the API on Postgres → the export
 * worker (in process, same runExportJob as production) → the file store → download.
 * Create project → 4 inputs → 3 outputs → override → export.
 */
import { readFileSync } from 'node:fs';
import type { ProjectDoc } from '@smart-canvas/core';
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

const tinyPng = readFileSync(new URL('../../api/src/assets/fixtures/tiny.png', import.meta.url));
const logoSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#0a7"/></svg>');

const pngSize = (b: Buffer) => [b.readUInt32BE(16), b.readUInt32BE(20)];

describe.skipIf(!adminUrl)('end to end (T7.5)', () => {
  let stack: Stack;
  let env: Stack['env'];
  let page: Page;

  beforeAll(async () => {
    stack = await startStack();
    env = stack.env;
    page = await env.browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  const doc = async (): Promise<ProjectDoc> => {
    const [, team, project] = /#\/t\/([^/]+)\/p\/([^/]+)/.exec(page.url()) ?? [];
    return (await (await page.request.get(`${env.webUrl}api/teams/${team}/projects/${project}`)).json()).doc;
  };
  const inNode = (label: string) => page.locator('.react-flow__node-inputNode').filter({ has: page.locator('.sc-node__title', { hasText: new RegExp(`^${label}$`) }) });

  it('creates a project with 4 inputs and 3 outputs', async () => {
    await setupAndCreateProject(page, env.webUrl, 'Grand opening');

    await inNode('Subject').locator('input[type=file]').setInputFiles({ name: 'subject.png', mimeType: 'image/png', buffer: tinyPng });
    await inNode('Subject').locator('img.sc-thumb').waitFor();
    await inNode('Logo').locator('input[type=file]').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: logoSvg });
    await inNode('Logo').locator('img.sc-thumb').waitFor();
    await inNode('Headline').getByLabel('Headline text').fill('Grand opening សួស្តី');
    for (const l of ['Background', 'Subject', 'Headline', 'Logo']) await page.getByRole('button', { name: `Connect ${l}` }).click();
    for (const preset of ['Instagram portrait 4:5 · 1080×1350 px', 'Instagram square · 1080×1080 px', 'A5 flyer · 148×210 mm']) {
      await page.getByRole('button', { name: '+ Add output' }).click();
      await page.getByRole('dialog').getByLabel('Preset').selectOption({ label: preset });
      await page.getByRole('dialog').getByRole('button', { name: 'Add' }).click();
    }
    await saved();

    const d = await doc();
    expect(d.wires.filter((w) => w.to === 'main').map((w) => w.from).sort()).toEqual(['background', 'headline', 'logo', 'subject']);
    expect(d.outputs.map((o) => o.label)).toEqual(['Instagram portrait 4:5', 'Instagram square', 'A5 flyer']);
    expect(d.wires.filter((w) => w.from === 'main')).toHaveLength(3);
    await page.getByLabel('Output Instagram square', { exact: true }).locator('.sc-render [data-source-id=headline]').waitFor();
  }, 90_000);

  it('overrides one output only', async () => {
    await page.getByRole('button', { name: 'Edit output Instagram square' }).click();
    const editor = page.getByRole('dialog', { name: 'Output editor Instagram square' });
    await editor.getByRole('complementary', { name: 'Layers' }).getByRole('button', { name: /^Subject/ }).click();
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');
    await saved();
    await editor.getByRole('button', { name: 'Close' }).click();

    const d = await doc();
    const [portrait, square, a5] = d.outputs;
    expect(square?.overrides.map((o) => o.sourceId)).toEqual(['subject']);
    expect(square?.overrides[0]?.frame?.x).toBeDefined();
    expect(portrait?.overrides).toEqual([]);
    expect(a5?.overrides).toEqual([]);
  }, 60_000);

  it('exports all 3 outputs as PNG and downloads them', async () => {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Format').selectOption('png');
    await dialog.getByRole('button', { name: /^Export 3 outputs/ }).click();
    const list = dialog.getByRole('list', { name: 'Export progress' });
    await expect.poll(async () => list.locator('li').evaluateAll((els) => els.map((e) => e.getAttribute('data-status'))), { timeout: 90_000, interval: 500 }).toEqual(['done', 'done', 'done']);
    // D31: these sizes are made in the browser (up to 4096 px), not by the worker.
    expect(await list.locator('li').evaluateAll((els) => els.map((e) => e.getAttribute('data-where')))).toEqual(['browser', 'browser', 'browser']);

    const [file] = await Promise.all([page.waitForEvent('download'), list.getByRole('link', { name: 'Download' }).nth(1).click()]);
    expect(file.suggestedFilename()).toBe('Grand-opening_Instagram-square_1080x1080.png');
    const bytes = readFileSync((await file.path()) as string);
    expect(pngSize(bytes)).toEqual([1080, 1080]);

    const [zip] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: /Download all \(ZIP/ }).click()]);
    expect(zip.suggestedFilename()).toMatch(/\.zip$/);
    const names = readFileSync((await zip.path()) as string).toString('latin1');
    for (const n of ['Instagram-portrait-4-5_1080x1350.png', 'Instagram-square_1080x1080.png', 'A5-flyer_']) expect(names).toContain(n);
  }, 150_000);
});
