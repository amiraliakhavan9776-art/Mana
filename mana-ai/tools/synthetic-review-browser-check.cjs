'use strict';

const assert = require('node:assert/strict');
const {mkdtemp, writeFile, readFile, rm} = require('node:fs/promises');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('../../tests/browser/node_modules/playwright');
const {makeReview} = require('../examples/synthetic-aec-dxf/render-review.cjs');
const {makeArtifacts} = require('../src/native/synthetic-dxf-review-artifacts.cjs');

async function main() {
  const temporary = await mkdtemp(join(tmpdir(), 'mana-dxf-review-browser-'));
  let browser;
  try {
    const filename = join(temporary, 'review.html');
    await writeFile(filename, makeReview(), {mode: 0o600, flag: 'wx'});
    browser = await chromium.launch({headless: true});
    for (const [width, height] of [[390, 844], [1280, 900]]) {
      const context = await browser.newContext({viewport: {width, height}, offline: true, acceptDownloads: true});
      const page = await context.newPage();
      const errors = [], outbound = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {if (/^https?:/.test(request.url())) outbound.push(request.url());});
      await page.goto(pathToFileURL(filename).href);
      assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
      assert.match(await page.locator('main').innerText(), /۲۰۷ به ۲۰۵٫۵ مترمربع/);
      assert.match(await page.getByRole('heading', {name: 'دو مسیر پیشنهادی هویت بصری'}).innerText(), /هویت بصری/);
      const graphic = page.getByRole('img');
      await graphic.evaluate(image => image.decode());
      assert.equal(await graphic.evaluate(image => image.naturalWidth), 1200);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator('summary').click();
      assert.equal(await page.locator('details').getAttribute('open'), '');
      const [download] = await Promise.all([
        page.waitForEvent('download', {timeout: 5000}),
        page.getByRole('link', {name: /دریافت جدول بازبینی/}).click(),
      ]);
      assert.equal(download.suggestedFilename(), 'mana-synthetic-review.csv');
      assert.equal(await readFile(await download.path(), 'utf8'), makeArtifacts().csv);
      assert.deepEqual(errors, []);
      assert.deepEqual(outbound, []);
      await context.close();
    }
    console.log('SYNTHETIC_DXF_OFFLINE_PERSIAN_CHROMIUM_PASSED');
  } finally {
    if (browser) await browser.close();
    await rm(temporary, {recursive: true, force: true});
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
