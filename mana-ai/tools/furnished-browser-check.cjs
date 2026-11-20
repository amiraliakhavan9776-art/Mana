'use strict';
const { chromium } = require('../../tests/browser/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { start } = require('../development-ui.cjs');

(async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mana-design-browser-'));
  const server = start({ port: 0, furnishedWorkspace: workspace, runner: { history: () => [], run: async () => ({}) } });
  let browser;
  try {
    await once(server, 'listening');
    browser = await chromium.launch({ headless: true });
    for (const narrow of [false, true]) {
      const page = await browser.newPage({ viewport: narrow ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: narrow, hasTouch: narrow, locale: 'fa-IR' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:' + server.address().port);
      await page.getByRole('link', { name: /مبلمان‌دار/ }).click();
      assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
      assert.equal(await page.locator('#discover').count(), 0);
      await page.locator('#precedents').check();
      await page.locator('#preference').selectOption(narrow ? 'private' : 'social');
      await page.locator('#generate').click();
      await page.waitForFunction(() => document.querySelectorAll('#results svg').length === 2, undefined, { timeout: 25000 });
      assert.match(await page.locator('#sources').textContent(), /Sanctuary House/);
      assert.equal(await page.locator('#results svg rect').count(), 44);
      const [file] = await Promise.all([page.waitForEvent('download'), page.locator('#files a[href$="/furnished-booklet.pdf"]').click()]);
      assert.equal(file.suggestedFilename(), 'furnished-booklet.pdf');
      const stream = await file.createReadStream(), chunks = [];
      for await (const b of stream) chunks.push(b);
      assert.equal(Buffer.concat(chunks).subarray(0, 4).toString(), '%PDF');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('FURNISHED_CONCEPT_REAL_BROWSER_AND_PDF_PASSED');
  } finally {
    if (browser) await browser.close();
    if (server.listening) await new Promise(resolve => server.close(resolve));
    fs.rmSync(workspace, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
