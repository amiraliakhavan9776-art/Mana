'use strict';

const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {resolve} = require('node:path');
const {test} = require('node:test');
const {makeReview} = require('../examples/synthetic-aec-dxf/render-review.cjs');
const {makeArtifacts} = require('../src/native/synthetic-dxf-review-artifacts.cjs');
const script = resolve(__dirname, '../examples/synthetic-aec-dxf/render-review.cjs');

test('one offline Persian review binds the actual geometry, downloads and current visual concepts', () => {
  const html = makeReview();
  assert.equal(html, makeReview());
  assert.match(html, /<html lang="fa" dir="rtl">/);
  assert.match(html, /۲۰۷ به ۲۰۵٫۵ مترمربع/);
  assert.match(html, /۴۰۲ مترمربع/);
  assert.match(html, /۶ به ۷٫۵ مترمربع/);
  assert.match(html, /سکوتِ منظم/);
  assert.match(html, /توالیِ گرم/);
  assert.match(html, /نقشهٔ اجرایی یا تأیید مهندسی نیست/);
  assert.match(html, /مدل‌های BIM و تأسیسات در این آزمون وجود ندارند/);
  assert.match(html, /default-src 'none'/);
  assert.doesNotMatch(html, /<script|<form|https?:\/\//);
  const expected = makeArtifacts();
  const decoded = (pattern) => Buffer.from(html.match(pattern)[1], 'base64').toString('utf8');
  assert.equal(decoded(/src="data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)"/), expected.svg);
  assert.equal(decoded(/href="data:text\/csv;base64,([A-Za-z0-9+/=]+)"/), expected.csv);
  for (const artifact of expected.manifest.artifacts) assert.ok(html.includes(artifact.sha256));
});

test('CLI generates exact offline bytes, rejects extra arguments without partial HTML', () => {
  const ok = spawnSync(process.execPath, [script], {encoding: 'utf8'});
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout, makeReview());
  const bad = spawnSync(process.execPath, [script, '/tmp/other.dxf'], {encoding: 'utf8'});
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout, '');
  assert.equal(bad.stderr.trim(), 'SYNTHETIC_REVIEW_EVIDENCE_UNVERIFIED');
});
