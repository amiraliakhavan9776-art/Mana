'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Execute selected actual legacy functions without booting the DOM or using real storage.
// These core regressions do not replace browser/workflow acceptance tests.
function legacy(names, globals = {}) {
  const context = vm.createContext(globals);
  for (const name of names) {
    const line = source.split('\n').find(line => line.startsWith('function ' + name + '('));
    assert.ok(line, 'Missing legacy function: ' + name);
    new vm.Script(line).runInContext(context, { timeout: 1000 });
    assert.equal(typeof context[name], 'function');
  }
  return context;
}

test('CPM handles parallel branches, lag and noncritical float', () => {
  const ctx = legacy(['computeCPM']);
  const result = ctx.computeCPM([
    { id: 'a', dur: 3 },
    { id: 'b', dur: 5, deps: [{ id: 'a', lag: 2 }] },
    { id: 'c', dur: 2, deps: ['a'] },
    { id: 'd', dur: 1, deps: ['b', 'c'] }
  ]);
  const byId = Object.fromEntries(result.activities.map(a => [a.id, a]));
  assert.equal(result.duration, 11);
  assert.equal(byId.b.ES, 5);
  assert.equal(byId.d.ES, 10);
  assert.equal(byId.c.TF, 5);
  assert.equal(byId.c.critical, false);
  assert.equal(byId.b.critical, true);
});

test('CPM rejects cycles and accepts an empty schedule', () => {
  const ctx = legacy(['computeCPM']);
  assert.match(ctx.computeCPM([{ id: 'a', dur: 1, deps: ['b'] }, { id: 'b', dur: 1, deps: ['a'] }]).error, /چرخه/);
  assert.equal(ctx.computeCPM([]).duration, 0);
});

test('immediate save and reload preserve synthetic financial records and Persian text', () => {
  const storage = new Map();
  const data = {
    meta: { v: 2 }, settings: { currency: 'تومان' },
    projects: [{ id: 'p', name: 'پروژهٔ آزمایشی' }],
    contracts: [{ id: 'c', projectId: 'p', amount: 123456789 }],
    invoices: [{ id: 'i', contractId: 'c', amount: 1000, status: 'pending' }]
  };
  const ctx = legacy(['save', 'loadDB'], {
    LS_KEY: 'mana.db.v2', DB: data, _saveTimer: null,
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    setTimeout, clearTimeout,
    seedDB: () => { throw new Error('Unexpected fallback'); },
    toast: () => { throw new Error('Unexpected storage error'); }
  });
  ctx.save(true);
  const loaded = JSON.parse(JSON.stringify(ctx.loadDB()));
  assert.deepEqual(loaded.projects, data.projects);
  assert.deepEqual(loaded.contracts, data.contracts);
  assert.deepEqual(loaded.invoices, data.invoices);
  assert.equal(loaded.settings.currency, 'تومان');
});

test('storage failure reports an error without silently reporting success', () => {
  const messages = [];
  const ctx = legacy(['save'], {
    LS_KEY: 'mana.db.v2', DB: { projects: [] }, _saveTimer: null,
    localStorage: { setItem: () => { throw new Error('quota exceeded'); } },
    setTimeout, clearTimeout, toast: (message, kind) => messages.push({ message, kind })
  });
  ctx.save(true);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].kind, 'err');
  assert.match(messages[0].message, /quota exceeded/);
});

test('invoice calculation preserves deductions, VAT base and Persian numeric inputs', () => {
  const ctx = legacy(['toEn','num','invoiceCalc'], { DB:{settings:{retention:5,tax:3,insurance:2,vat:10}} });
  const result=ctx.invoiceCalc({items:[{qty:'۲',price:'۱۰۰۰',coef:'۱٫۵'.replace('٫','.') }],otherDed:100});
  assert.equal(result.gross,3000);
  assert.equal(result.retention,150);assert.equal(result.tax,90);assert.equal(result.insurance,60);
  assert.equal(result.otherDed,100);assert.equal(result.vat,260);assert.equal(result.net,2860);
});

test('invoice explicit zero rates override defaults; payments sum Persian and Arabic digits', () => {
  const ctx=legacy(['toEn','num','sum','invoiceCalc','invoicePaid'],{DB:{settings:{retention:5,tax:3,insurance:2,vat:10}}});
  assert.equal(ctx.invoiceCalc({items:[{qty:2,price:1000}],retention:0,tax:0,insurance:0,vat:0}).net,2000);
  assert.equal(ctx.invoicePaid({payments:[{amount:'۱,۲۰۰'},{amount:'٨٠٠'}]}),2000);
  assert.equal(ctx.invoiceCalc({items:[],retention:0,tax:0,insurance:0,vat:0}).net,0);
});
