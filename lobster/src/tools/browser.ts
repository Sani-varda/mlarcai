import { chromium, type Browser, type Page } from 'playwright';
import { logger } from '../utils/logger.js';

let browser: Browser | null = null;
let page: Page | null = null;
let isRealMode = false;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

export function initBrowser(cfg: { mode: 'real' | 'headless' }): void {
  isRealMode = cfg.mode === 'real';
}

async function getPage(): Promise<Page> {
  if (!browser || !browser.isConnected()) {
    if (isRealMode) {
      browser = await chromium.launch({
        channel: 'chrome',
        headless: false,
        args: ['--disable-blink-features=AutomationControlled'],
      });
      const ctx = browser.contexts()[0] || await browser.newContext();
      page = ctx.pages()[0] || await ctx.newPage();
    } else {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
      });
      const ctx = await browser.newContext({ userAgent: USER_AGENT });
      page = await ctx.newPage();
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });
    }

    page.setDefaultTimeout(15000);
    logger.info(`Browser launched (mode: ${isRealMode ? 'real' : 'headless'})`);
  }

  if (!page || page.isClosed()) {
    if (browser) {
      const ctx = browser.contexts()[0] || await browser.newContext();
      page = await ctx.newPage();
    }
  }

  return page!;
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function browserNavigate(url: string): Promise<string> {
  const p = await getPage();
  try {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    await p.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await p.waitForLoadState('networkidle').catch(() => {});
    const title = await p.title();
    return `Navigated to ${fullUrl}\nPage title: ${title}`;
  } catch (err: unknown) {
    const e = err as Error;
    return `Navigation error: ${e.message}`;
  }
}

export async function browserClick(selector: string): Promise<string> {
  const p = await getPage();
  try {
    await p.waitForSelector(selector, { timeout: 10000 });
    await p.click(selector);
    await p.waitForTimeout(500);
    return `Clicked element: ${selector}`;
  } catch (err: unknown) {
    const e = err as Error;
    return `Click error on "${selector}": ${e.message}`;
  }
}

export async function browserType(selector: string, text: string): Promise<string> {
  const p = await getPage();
  try {
    await p.waitForSelector(selector, { timeout: 10000 });
    await p.fill(selector, text);
    return `Typed "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}" into ${selector}`;
  } catch (err: unknown) {
    const e = err as Error;
    return `Type error on "${selector}": ${e.message}`;
  }
}

export async function browserExtract(): Promise<string> {
  const p = await getPage();
  try {
    const title = await p.title();
    const text = await p.evaluate(() => {
      const main = document.querySelector('main') || document.querySelector('article') || document.body;
      return (main as HTMLElement).innerText?.slice(0, 5000) || '(no text content)';
    });
    return `Title: ${title}\n\nContent:\n${text}`;
  } catch (err: unknown) {
    const e = err as Error;
    return `Extract error: ${e.message}`;
  }
}

export async function browserScreenshot(): Promise<string> {
  const p = await getPage();
  try {
    const buf = await p.screenshot({ type: 'png', fullPage: false });
    return buf.toString('base64');
  } catch (err: unknown) {
    const e = err as Error;
    return `Screenshot error: ${e.message}`;
  }
}

export async function browserSearch(query: string): Promise<string> {
  const p = await getPage();
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    await p.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(3000);

    const results = await p.evaluate(() => {
      const items = document.querySelectorAll('#search div.g, div[data-hveid]');
      const resultsList: string[] = [];
      items.forEach((item, i) => {
        const titleEl = item.querySelector('h3');
        const linkEl = item.querySelector('a');
        const snippetEl = item.querySelector('.VwiC3b, [data-sncf], span.aCOpRe');
        if (titleEl && linkEl) {
          resultsList.push(
            `${i + 1}. ${titleEl.textContent?.trim() || ''}\n   ${linkEl.getAttribute('href') || ''}\n   ${snippetEl?.textContent?.trim() || ''}`
          );
        }
      });
      const filtered = resultsList.filter((r) => !r.includes('javascript:') && r.length > 10);
      return filtered.slice(0, 5).join('\n\n') || '(no structured results)';
    });

    if (results.includes('no structured results')) {
      const fallback = await p.evaluate(() => {
        const links = document.querySelectorAll('a[href^="http"]');
        const found: string[] = [];
        links.forEach((a) => {
          const text = a.textContent?.trim();
          const href = a.getAttribute('href') || '';
          if (text && text.length > 10 && href.length > 10 && !href.includes('google.com')) {
            found.push(`${text}\n   ${href}`);
          }
        });
        return found.slice(0, 5).join('\n\n') || '(no results)';
      });
      return `Search results for "${query}":\n\n${fallback}`;
    }

    return `Search results for "${query}":\n\n${results}`;
  } catch (err: unknown) {
    const e = err as Error;
    return `Search error: ${e.message}`;
  }
}

export async function browserClose(): Promise<string> {
  try {
    if (page) { await page.close().catch(() => {}); page = null; }
    if (browser) { await browser.close().catch(() => {}); browser = null; }
    logger.info('Browser closed');
    return 'Browser closed';
  } catch (err: unknown) {
    const e = err as Error;
    return `Close error: ${e.message}`;
  }
}
