'use strict';
// Drives the real verification page in headless Chromium via Playwright.
const { chromium } = require('playwright');

async function openBrowser() { return chromium.launch(); }

async function newVerifier(browser, baseUrl, { timezoneId }) {
  const context = await browser.newContext({ timezoneId, locale: 'en-US', viewport: { width: 1000, height: 1100 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('  [browser pageerror]', e.message));
  async function readResult() {
    await page.waitForSelector('body[data-done="1"]', { timeout: 30000 });
    const status = (await page.textContent('#status')).trim();
    const computedHash = (await page.textContent('#computed-hash')).trim();
    const onchainHash = (await page.textContent('#onchain-hash')).trim();
    const verifyMs = parseFloat(await page.textContent('#verify-ms')) || null;
    const error = (await page.textContent('#error')).trim();
    return { status, computedHash: computedHash === '–' ? null : computedHash, onchainHash: onchainHash === '–' ? null : onchainHash, verifyMs, error };
  }
  return {
    page, context, timezoneId,
    async verify(itemId, { screenshot } = {}) {
      await page.goto(`${baseUrl}/item/${encodeURIComponent(itemId)}`, { waitUntil: 'domcontentloaded' });
      const r = await readResult();
      if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
      return r;
    },
    /** Click "Check again" on the already-open page (used after stopping the API for real). */
    async recheck({ screenshot } = {}) {
      await page.click('#recheck');
      const r = await readResult();
      if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
      return r;
    },
    async browserTimezone() { return page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone); },
    async close() { await context.close(); },
  };
}

module.exports = { openBrowser, newVerifier };
