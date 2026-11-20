'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { chromium } = require('../../tests/browser/node_modules/playwright');
const { start } = require('../development-ui.cjs');

async function getFile(page, name) {
  const link = page.locator('#files a[href$="/' + name + '"]');
  assert.equal(await link.count(), 1);
  const [file] = await Promise.all([page.waitForEvent('download'), link.click()]);
  assert.equal(file.suggestedFilename(), name);
  return fs.readFileSync(await file.path());
}

async function generate(page, preference) {
  await page.locator('#preference').selectOption(preference);
  assert.equal(await page.locator('#results svg').count(), 0);
  assert.equal(await page.locator('#files a').count(), 0);
  const response = page.waitForResponse(res => res.url().endsWith('/furnished/generate') &&
    res.request().method() === 'POST', { timeout: 30000 });
  await page.locator('#generate').click();
  const res = await response;
  assert.equal(res.status(), 200, await res.text());
  const data = await res.json();
  await page.waitForFunction(() => document.querySelectorAll('#results svg').length === 2);
  return data;
}

(async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mana-plan-browser-'));
  const server = start({ port: 0, furnishedWorkspace: workspace, runner: { history: () => [], run: async () => ({}) } });
  let browser;
  try {
    await once(server, 'listening');
    browser = await chromium.launch({ headless: true, ...(process.env.MANA_CHROMIUM_PATH ? { executablePath: process.env.MANA_CHROMIUM_PATH } : {}) });
    for (const narrow of [false, true]) {
      const page = await browser.newPage({ viewport: narrow ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: narrow, hasTouch: narrow, locale: 'fa-IR' });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://127.0.0.1:' + server.address().port);
      await page.getByRole('link', { name: /مبلمان‌دار/ }).click();
      assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
      const runs = [];
      for (const [preference, expected] of [['social', { spine: '47.7', gallery: '50.22' }], ['private', { spine: '33.92', gallery: '35.712' }]]) {
        const data = await generate(page, preference);
        const result = {};
        for (const id of ['spine', 'gallery']) {
          const card = page.locator('#results [data-plan-id="' + id + '"]');
          const table = card.locator('table[data-geometry-sha256]');
          const version = await table.getAttribute('data-geometry-sha256');
          assert.equal(version, data.takeoff.geometrySha256);
          assert.equal(version, data.verification.geometrySha256);
          assert.match(version, /^[0-9a-f]{64}$/);
          result[id] = { version, svg: await card.locator('svg').innerHTML() };
          assert.equal(await table.locator('tr[data-room-id][data-area-m2]').count(), 7);
          assert.equal(await table.locator('tr[data-room-id="living"]').getAttribute('data-area-m2'), expected[id]);
          assert.equal(await card.locator('[data-total-m2]').getAttribute('data-total-m2'), '240');
        }
        const content = await getFile(page, 'furnished-booklet.pdf');
        assert.equal(content.subarray(0, 4).toString(), '%PDF');
        for (const id of ['spine', 'gallery']) {
          const dxf = await getFile(page, 'furnished-' + id + '.dxf');
          assert.ok(dxf.toString().includes(data.takeoff.geometrySha256.toUpperCase()) ||
            dxf.toString().includes(data.takeoff.geometrySha256));
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        const pdfURL = data.downloads.find(x => x.name === 'furnished-booklet.pdf').url;
        runs.push({ ...result, content, pdfURL });
      }
      for (const id of ['spine','gallery']) {
        assert.notEqual(runs[0][id].version, runs[1][id].version);
        assert.notEqual(runs[0][id].svg, runs[1][id].svg);
      }
      assert.notEqual(runs[0].pdfURL, runs[1].pdfURL);
      assert.notDeepEqual(runs[0].content, runs[1].content);
      await page.locator('#clear').click();
      assert.equal(await page.locator('#results svg, #results table, #files a').count(), 0);
      assert.deepEqual(errors, []);
      if (process.env.MANA_BROWSER_PROOF_DIR) fs.writeFileSync(path.join(process.env.MANA_BROWSER_PROOF_DIR, narrow ? 'phone-private.pdf' : 'desktop-social.pdf'), runs[narrow ? 1 : 0].content);
      await page.close();
      console.log('MANA_PLAN_TAKEOFF_REAL_CHROMIUM_' + (narrow ? 'MOBILE' : 'DESKTOP') + '_PASSED');
    }
  } finally {
    if (browser) await browser.close();
    if (server.listening) await new Promise(resolve => server.close(resolve));
    fs.rmSync(workspace, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
