'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('existing Persian RTL entry point remains present', () => {
  assert.match(source, /<html\s+lang="fa"\s+dir="rtl"/i);
  assert.match(source, /<title>مانا/);
});
test('existing project and financial routes remain declared', () => {
  for (const route of ['dashboard', 'projects', 'contracts', 'invoices', 'pettycash', 'cashflow']) {
    assert.ok(source.includes("k: '" + route + "'"), 'Missing route: ' + route);
  }
});
test('existing schedule and approvals code remain present', () => {
  assert.match(source, /function computeCPM\s*\(/);
  assert.match(source, /INV_STATUS\s*=/);
  assert.match(source, /inv-submit-for-approval/);
});
test('browser persistence compatibility remains unchanged', () => {
  assert.match(source, /LS_KEY\s*=\s*'mana\.db\.v2'/);
  assert.match(source, /function loadDB\s*\(/);
  assert.match(source, /function save\s*\(/);
});
test('legacy app remains a self-contained HTML entry point', () => {
  assert.match(source, /<\/html>\s*$/i);
  assert.ok(source.length > 100000, 'Unexpectedly truncated legacy entry point');
});
