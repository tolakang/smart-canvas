/**
 * D63 approval of Previews: an editor approves a Preview, a later change marks it "Changed since approved" until it
 * is approved again; the Review panel lists every Preview's state; the export dialog warns about Previews not
 * approved and can keep only the approved ones; a viewer sees the states with no Approve.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { addOutput, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe.skipIf(!adminUrl)('approval of Previews (D63)', () => {
  let stack: Stack;
  let page: Page;
  let board = '';
  let teamId = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const ids = await setupAndCreateProject(page, stack.env.webUrl, 'Approval');
    teamId = ids.teamId;
    const url = `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;
    const p = (await (await page.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    let doc = ok(addOutput(p.doc, { id: 'banner', label: 'Banner', size: { width: 1500, height: 500, unit: 'px' } }));
    doc = ok(addOutput(doc, { id: 'square', label: 'Square', size: { width: 1080, height: 1080, unit: 'px' } }));
    expect((await page.request.put(url, { data: { rev: p.rev, doc } })).status()).toBe(200);
    board = page.url();
    await page.reload();
    await node(page, 'banner').waitFor();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const node = (p: Page, id: string) => p.locator(`.react-flow__node-outputNode[data-id="out:${id}"]`);
  const editor = (p: Page, label: string) => p.getByRole('dialog', { name: `Output editor ${label}` });
  const approval = (p: Page, label: string) => editor(p, label).getByRole('group', { name: 'Approval' });
  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });

  it('an editor approves a Preview; a change marks it changed until it is approved again', async () => {
    await node(page, 'banner').getByRole('button', { name: 'Edit output Banner' }).click();
    await approval(page, 'Banner').getByRole('button', { name: 'Approve' }).click();
    await approval(page, 'Banner').getByText('✓ Approved by Ada').waitFor();
    // A change: the logo nudged on this Preview (an override).
    await editor(page, 'Banner').getByRole('complementary', { name: 'Layers' }).getByText('Logo', { exact: true }).click();
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight');
    await approval(page, 'Banner').getByText('Changed since approved').waitFor();
    await approval(page, 'Banner').getByRole('button', { name: 'Approve again' }).waitFor();
    await editor(page, 'Banner').getByRole('button', { name: 'Close', exact: true }).click();
    await saved();
    await node(page, 'banner').getByText('Changed since approved').waitFor();
    // Approved again: the node shows it.
    await node(page, 'banner').getByRole('button', { name: 'Edit output Banner' }).click();
    await approval(page, 'Banner').getByRole('button', { name: 'Approve again' }).click();
    await approval(page, 'Banner').getByText('✓ Approved by Ada').waitFor();
    await editor(page, 'Banner').getByRole('button', { name: 'Close', exact: true }).click();
    await node(page, 'banner').getByText('✓ Approved').waitFor();
    expect(await node(page, 'square').locator('.sc-preview__approval').count()).toBe(0);
  }, 60_000);

  it('the Review panel lists every Preview with its state and opens one', async () => {
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'Review' });
    await panel.getByText('1 of 2 approved · 0 open comments').waitFor();
    expect(await panel.getByRole('button', { name: 'Open Banner' }).innerText()).toContain('✓ Approved');
    expect(await panel.getByRole('button', { name: 'Open Square' }).innerText()).toContain('Not approved');
    if (process.env.SC_SHOTS) await page.screenshot({ path: `${process.env.SC_SHOTS}/review-panel.png` });
    await panel.getByRole('button', { name: 'Open Square' }).click();
    await editor(page, 'Square').waitFor();
    await editor(page, 'Square').getByRole('button', { name: 'Close', exact: true }).click();
    await panel.getByRole('button', { name: 'Close review' }).click();
    await panel.waitFor({ state: 'detached' });
  }, 60_000);

  it('the export dialog warns about Previews not approved and can keep only the approved ones', async () => {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Export' });
    const outputs = dialog.getByRole('group', { name: 'Outputs' });
    await outputs.getByText('· approved').waitFor();
    await outputs.getByText('· not approved').waitFor();
    const warning = dialog.locator('.sc-export__approval');
    await warning.getByText(/1 of 2 chosen outputs aren’t approved/).waitFor();
    await warning.getByRole('button', { name: 'Only approved (1)' }).click();
    await warning.waitFor({ state: 'detached' });
    await dialog.getByRole('button', { name: 'Export 1 output' }).waitFor();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  }, 60_000);

  it('a viewer sees the states, with no Approve', async () => {
    const invite = await page.request.post(`${stack.env.webUrl}api/teams/${teamId}/invites`, { data: { role: 'viewer' } });
    const { token } = (await invite.json()) as { token: string };
    const ctx = await stack.env.browser.newContext({ viewport: { width: 1600, height: 1000 } });
    try {
      expect((await ctx.request.post(`${stack.env.webUrl}api/invites/${token}/accept`, { data: { email: 'vee@example.com', password: 'password123', name: 'Vee' } })).ok()).toBe(true);
      const vee = await ctx.newPage();
      await vee.goto(board);
      await node(vee, 'banner').getByText('✓ Approved').waitFor();
      await node(vee, 'square').getByRole('button', { name: 'View output Square' }).click();
      await approval(vee, 'Square').getByText('Not approved').waitFor();
      expect(await approval(vee, 'Square').getByRole('button').count()).toBe(0);
    } finally {
      await ctx.close();
    }
  }, 60_000);
});
