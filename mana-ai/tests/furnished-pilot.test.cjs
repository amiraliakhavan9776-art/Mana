'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const http = require('node:http');
const { start } = require('../development-ui.cjs');

test('local mounted furnished preview produces verified real DXFs/booklet and denies changed artifact', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mana-furnished-test-'));
  const server = start({ port: 0, furnishedWorkspace: workspace, runner: { history: () => [], run: async () => ({}) } });
  try {
    await once(server, 'listening');
    const origin = 'http://127.0.0.1:' + server.address().port;
    assert.match(await (await fetch(origin + '/')).text(), /href="\/furnished"/);
    const html = await (await fetch(origin + '/furnished')).text();
    assert.match(html, /lang="fa" dir="rtl"/);
    assert.doesNotMatch(html, /id="discover"/);
    const token = JSON.parse(html.match(/const CONFIG=(\{[^\n]+?\});/)[1]).token;
    const input = { width: 12, length: 20, wallHeight: 2.8, preference: 'private', precedents: true };
    const send = (data, overrides = {}) => fetch(origin + '/furnished/generate', {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Mana-Token': token, ...overrides }, body: JSON.stringify(data),
    });
    assert.equal((await send(input, { 'X-Mana-Token': 'wrong' })).status, 403);
    assert.equal((await send({ ...input, width: 6 })).status, 400);
    const result = await send(input);
    assert.equal(result.status, 200);
    const out = await result.json();
    assert.deepEqual(out.plans.map(p => p.entrySide), ['south', 'west']);
    assert.deepEqual(out.plans.map(p => p.furniture.length), [14, 14]);
    assert.equal(out.verification.pdfPlanPages, 2);
    assert.equal(out.precedents.liveInternetSearch, false);
    assert.equal(out.constructionApproved, false);
    const booklet = out.downloads.find(d => d.name.endsWith('.pdf'));
    const pdf = await fetch(origin + booklet.url);
    assert.equal(pdf.status, 200);
    assert.ok(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).equals(Buffer.from('%PDF')));
    const output = path.join(workspace, fs.readdirSync(workspace)[0], 'artifacts');
    fs.appendFileSync(path.join(output, booklet.name), 'changed');
    assert.equal((await fetch(origin + booklet.url)).status, 409);
    assert.equal((await fetch(origin + booklet.url.replace(booklet.name, 'brief.json'))).status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('optional live route sends only fixed generic theme to configured loopback search', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mana-precedent-route-'));
  const calls = [];
  const search = http.createServer((req, res) => { calls.push(req.url); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ results: [{ title: 'Example design', url: 'https://public-architects.org/design', content: 'Discovery candidate' }] })); });
  search.listen(0, '127.0.0.1');
  await once(search, 'listening');
  const server = start({ port: 0, furnishedWorkspace: workspace, precedentSearchEndpoint: `http://127.0.0.1:${search.address().port}/search`, runner: { history: () => [], run: async () => ({}) } });
  try {
    await once(server, 'listening');
    const origin = 'http://127.0.0.1:' + server.address().port;
    const html = await (await fetch(origin + '/furnished')).text();
    assert.match(html, /id="discover"/);
    const token = JSON.parse(html.match(/const CONFIG=(\{[^\n]+?\});/)[1]).token;
    const send = body => fetch(origin + '/furnished/discover', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Mana-Token': token }, body: JSON.stringify(body) });
    assert.equal((await send({ optIn: false, theme: 'courtyard_privacy' })).status, 400);
    assert.equal((await send({ optIn: true, theme: 'courtyard_privacy', width: 12 })).status, 400);
    assert.equal(calls.length, 0);
    const r = await send({ optIn: true, theme: 'courtyard_privacy' });
    assert.equal(r.status, 200);
    const result = await r.json();
    assert.equal(result.status, 'SEARCH_COMPLETED_UNVERIFIED');
    assert.equal(result.verified, false);
    assert.equal(result.pagesFetched, 0);
    assert.equal(calls.length, 1);
    assert.equal(new URL(calls[0], 'http://127.0.0.1').searchParams.get('q'), 'architect courtyard house privacy daylight project');
  } finally {
    await Promise.all([server, search].map(s => new Promise(resolve => s.close(resolve))));
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
