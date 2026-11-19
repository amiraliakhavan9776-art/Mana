'use strict';
// Real Persian browser → Jarvis Runtime → verified file download, not an injected tool.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { chromium } = require('../../tests/browser/node_modules/playwright');
const { start } = require('../development-ui.cjs');
const { createSession } = require('../src/jarvis-preview/session.cjs');

async function download(page, name) {
  const [file] = await Promise.all([
    page.waitForEvent('download'), page.getByRole('link', { name }).first().click(),
  ]);
  const stream = await file.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return { name: file.suggestedFilename(), bytes: Buffer.concat(chunks) };
}

async function main() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mana-jarvis-browser-'));
  let browser, server, session;
  try {
    session = createSession({ workspace });
    server = start({ port: 0, runner: { history: () => [], run: async () => { throw new Error('Not used in this test'); } }, jarvisSession: session });
    await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true, ...(process.env.MANA_CHROMIUM_PATH ? { executablePath: process.env.MANA_CHROMIUM_PATH } : {}) });
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fa-IR' });
    const errors = [];
    phone.on('pageerror', error => errors.push(error.message));
    await phone.goto(url);
    await phone.getByRole('link', { name: /جارویس/ }).click();
    assert.match(phone.url(), /\/jarvis\/?$/);
    assert.equal(await phone.locator('html').getAttribute('dir'), 'rtl');
    await phone.locator('#text').fill('برای زمین ۱۲ در ۲۰ متر دو گزینه پلان هندسی بساز، متره مساحت و دفترچه PDF تهیه کن.');
    assert.equal(await phone.locator('#run').isDisabled(), true);
    await phone.locator('#plan').click();
    await phone.waitForFunction(() => !document.querySelector('#run').disabled);
    assert.match(await phone.locator('#detail').innerText(), /12/);
    assert.match(await phone.locator('#detail').innerText(), /20/);
    assert.equal(await phone.locator('#files a').count(), 0);
    await phone.locator('#run').click();
    await phone.waitForFunction(() => document.querySelectorAll('#files a').length === 5, undefined, { timeout: 45000 });
    const drawing = await download(phone, /\.dxf/);
    assert.match(drawing.name, /\.dxf$/);
    assert.ok(drawing.bytes.includes(Buffer.from('$INSUNITS')));
    const booklet = await download(phone, /\.pdf/);
    assert.equal(booklet.bytes.subarray(0, 4).toString(), '%PDF');
    await phone.reload();
    await phone.waitForFunction(() => document.querySelectorAll('#files a').length === 5);
    assert.deepEqual((await download(phone, /\.dxf/)).bytes, drawing.bytes);
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.deepEqual(errors, []);
    const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'fa-IR' });
    await desktop.goto(url);
    assert.equal(await desktop.locator('#run').isEnabled(), true);
    await desktop.getByRole('link', { name: /جارویس/ }).click();
    await desktop.waitForFunction(() => document.querySelectorAll('#files a').length === 5);
    assert.match(await desktop.locator('#detail').innerText(), /12/);
    console.log('JARVIS_REAL_HTTP_MOBILE_DESKTOP_ARTIFACT_DOWNLOAD_PASSED');
  } finally {
    if (browser) await browser.close();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    if (session) session.close();
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
