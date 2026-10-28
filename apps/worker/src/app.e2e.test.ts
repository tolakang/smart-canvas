/**
 * T7.5 end to end, through the real stack: the web app in Chromium → the API on Postgres → the export
 * worker (in process, same runExportJob as production) → the file store → download.
 * Create project → its asset nodes (D49) → a Preset node with 3 sizes → override → export.
 */
import { readFileSync } from 'node:fs';
import type { ProjectDoc } from '@smart-canvas/core';
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boardNode, putPicture, setupAndCreateProject, startStack, type Stack } from './test/stack';

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

  it('creates a project: pictures and text in its asset nodes, a Preset node with 3 sizes', async () => {
    await setupAndCreateProject(page, env.webUrl, 'Grand opening');

    await putPicture(page, 'Subject', { name: 'subject.png', mimeType: 'image/png', buffer: tinyPng });
    await boardNode(page, 'Image').locator('img[alt="Subject preview"]').waitFor();
    await putPicture(page, 'Logo', { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: logoSvg });
    await boardNode(page, 'Logo').locator('img[alt="Logo preview"]').waitFor();
    // D49: text is typed into its slot on the Text node.
    await boardNode(page, 'Text').getByLabel('Headline text').fill('Grand opening សួស្តី');
    // A custom Preset node with three sizes.
    page.once('dialog', (d) => void d.accept('Social'));
    await page.getByRole('button', { name: '+ Add' }).click();
    await page.getByRole('menuitem', { name: 'Custom preset…' }).click();
    const set = boardNode(page, 'Social');
    await set.waitFor();
    for (const name of ['Instagram portrait 4:5', 'Instagram square', 'A5 flyer']) await set.getByLabel('Add a size to Social').selectOption({ label: name });
    await saved();

    const d = await doc();
    for (const id of ['background', 'headline', 'logo', 'subject']) expect(d.edges.some((e) => e.kind === 'layer' && e.to === 'main' && e.from === id)).toBe(true);
    expect(d.outputs.map((o) => o.label)).toEqual(['Instagram portrait 4:5', 'Instagram square', 'A5 flyer']);
    expect(d.edges.filter((e) => e.kind === 'composition')).toHaveLength(3);
    await page.getByLabel('Preview Instagram square', { exact: true }).locator('.sc-render [data-source-id=headline]').waitFor();
  }, 90_000);

  it('overrides one output only', async () => {
    const editor = page.getByRole('dialog', { name: 'Preview editor Instagram square' });
    // The board may still be placing the three new Previews; a click that lands while the button moves misses it,
    // so click until the editor is open (as wires.e2e does for its drag).
    await expect
      .poll(async () => {
        if (!(await editor.count())) await page.getByRole('button', { name: 'Edit Preview Instagram square' }).click();
        return editor.count();
      }, { timeout: 20_000 })
      .toBe(1);
    await editor.getByRole('complementary', { name: 'Layers' }).getByRole('button', { name: /^Subject/ }).click();
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');
    // "All changes saved" can still be showing from before the nudges: wait for the override itself to be saved.
    await expect.poll(async () => (await doc()).outputs[1]?.overrides.map((o) => o.sourceId), { timeout: 15_000 }).toEqual(['subject']);
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
    await dialog.getByRole('button', { name: /^Export 3 Preview/ }).click();
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
