/**
 * Opening a target in headless Chromium (D27): the web app's /render page, with its /api calls answered
 * by the worker (read-only, allow-listed) so the browser never holds a credential. Resolves once the page
 * reports `data-render-ready="true"` (fonts loaded, images decoded); rejects with the page's error.
 */
import type { Browser, Page } from 'playwright';

export interface RenderTarget {
  teamId: string;
  projectId: string;
  /** 'main' or an output id. */
  target: string;
  /** Include the bleed (default true). */
  bleed?: boolean;
  /** Output pixels per design px; default = the output's export scale. */
  scale?: number;
}

export interface ApiResponse {
  status: number;
  contentType: string;
  body: Buffer;
}
/** Fetches a read-only API path (e.g. `/teams/t/fonts`) for the render page. */
export type ApiFetch = (path: string) => Promise<ApiResponse>;

/** The only API reads the render page makes. */
const ALLOWED = /^\/teams\/[0-9a-f-]{36}\/(projects\/[0-9a-f-]{36}|fonts|assets|assets\/[0-9a-f-]{36}\/content)$/i;

export function isAllowedApiPath(path: string): boolean {
  return ALLOWED.test(path);
}

export function renderUrl(webUrl: string, t: RenderTarget): string {
  const q = new URLSearchParams();
  if (t.bleed === false) q.set('bleed', '0');
  if (t.scale !== undefined) q.set('scale', String(t.scale));
  const qs = q.toString();
  return `${webUrl.replace(/\/$/, '')}/render/${t.teamId}/${t.projectId}/${t.target}${qs ? `?${qs}` : ''}`;
}

export class RenderError extends Error {}

export async function openRender(browser: Browser, webUrl: string, t: RenderTarget, apiFetch: ApiFetch, timeoutMs = 60_000): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.route('**/api/**', async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname.replace(/^\/api/, '');
      if (req.method() !== 'GET' || !isAllowedApiPath(path)) return route.fulfill({ status: 403, body: '' });
      try {
        const res = await apiFetch(path);
        await route.fulfill({ status: res.status, contentType: res.contentType, body: res.body });
      } catch {
        await route.fulfill({ status: 502, body: '' });
      }
    });
    await page.goto(renderUrl(webUrl, t), { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const ready = await page.waitForFunction(() => document.documentElement.dataset.renderReady, undefined, { timeout: timeoutMs });
    if ((await ready.jsonValue()) !== 'true') {
      const reason = await page.evaluate(() => document.documentElement.dataset.renderError ?? 'unknown');
      throw new RenderError(`render failed: ${reason}`);
    }
    return page;
  } catch (e) {
    await page.close();
    throw e;
  }
}

/** Size of the drawn canvas in CSS px (= export pixels at the chosen scale). */
export async function renderedSize(page: Page): Promise<{ width: number; height: number }> {
  const box = await page.locator('.sc-render').first().boundingBox();
  if (!box) throw new RenderError('render: nothing drawn');
  return { width: Math.round(box.width), height: Math.round(box.height) };
}
