/**
 * D68 (UX B10, F7): a new project as a user gets it — no empty slots on the Image and Logo nodes, the first text
 * named "Text 1", and no placeholder boxes on the board's Preview cards.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boardNode, setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('a new project starts without empty layers (D68)', () => {
  let stack: Stack;
  let page: Page;

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await setupAndCreateProject(page, stack.env.webUrl, 'Fresh', { fresh: true });
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  it('the Image node has no slot yet, only its drop area; the Logo node one ready row (D77); the Text node starts with "Text 1"', async () => {
    const image = boardNode(page, 'Image');
    await image.locator('.sc-dropzone').waitFor();
    expect(await image.locator('.sc-slot').count()).toBe(0);
    // D77: the Logo node shows one ready row of three slots; no logo set (layer) exists until a file goes in one.
    const logo = boardNode(page, 'Logo');
    await logo.locator('.sc-logo-set--new').waitFor();
    expect(await logo.locator('.sc-logo-set:not(.sc-logo-set--new)').count()).toBe(0);
    expect(await boardNode(page, 'Text').getByText('Text 1', { exact: true }).count()).toBeGreaterThan(0);
    // No picture slot waits to be filled: only the layers the user adds, the headline pictures and the background.
    const [, teamId = '', projectId = ''] = /#\/t\/([^/]+)\/p\/([^/]+)/.exec(page.url()) ?? [];
    const doc = (await (await page.request.get(`${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`)).json()).doc as { sources: { id: string }[] };
    const ids = doc.sources.map((s) => s.id);
    expect(ids).not.toContain('subject');
    expect(ids).not.toContain('logo');
  }, 60_000);

  it('a Preview card draws no placeholder boxes', async () => {
    await page.locator('[aria-label="Main Comps"]').first().getByRole('button', { name: /^Add GDN sizes/ }).click();
    await page.locator('.react-flow__node-outputNode .sc-render--thumb').first().waitFor();
    expect(await page.locator('.react-flow__node-outputNode .sc-render__placeholder').count()).toBe(0);
  }, 60_000);
});
