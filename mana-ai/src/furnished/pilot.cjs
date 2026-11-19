'use strict';
// Local, single-user concept preview. Only the fixed verified exporter is invoked.
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const { lookupPrecedents } = require('../architecture/precedents.cjs');
const runFile = promisify(execFile);
const paths = ['furnished-spine.dxf', 'furnished-gallery.dxf', 'furnished-plans.json', 'furnished-booklet.pdf'];
const receiptName = 'furnished-receipt.json';
const cap = 2_000_000;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function readFile(directory, name) {
  const file = path.join(directory, name);
  if (fs.realpathSync(file) !== file) throw new Error('Untrusted output path');
  const handle = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const st = fs.fstatSync(handle);
    if (!st.isFile() || st.size < 1 || st.size > cap) throw new Error('Invalid file extent');
    const bytes = Buffer.alloc(st.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(handle, bytes, offset, bytes.length - offset, offset);
      if (count === 0) throw new Error('Unexpected output extent');
      offset += count;
    }
    if (fs.fstatSync(handle).size !== st.size) throw new Error('Output extent changed');
    return bytes;
  } finally { fs.closeSync(handle); }
}

function validInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['width', 'length', 'wallHeight', 'preference', 'precedents'].includes(key))) throw new Error('Input fields');
  const { width, length, wallHeight, preference, precedents } = value;
  for (const [v, min, max] of [[width, 12, 20], [length, 16, 30], [wallHeight, 2.4, 4.5]]) {
    if (!Number.isFinite(v) || v < min || v > max) throw new Error('Input dimensions');
  }
  if (!['social', 'private'].includes(preference) || (precedents !== undefined && typeof precedents !== 'boolean')) throw new Error('Input preferences');
  return { brief: { width, length, wallHeight, preference }, precedents: precedents === true };
}

function createFurnishedHandler({ workspace, getPort, discoveryEndpoint }) {
  if (typeof workspace !== 'string' || !path.isAbsolute(workspace) || typeof getPort !== 'function') throw new Error('Furnished preview requires a dedicated absolute workspace');
  const dir = path.resolve(workspace), repo = path.resolve(__dirname, '../../..');
  if (dir === repo || dir.startsWith(repo + path.sep) || repo.startsWith(dir + path.sep)) throw new Error('Furnished workspace and source must be separate');
  fs.mkdirSync(dir, { mode: 0o700, recursive: true });
  const st = fs.lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || fs.realpathSync(dir) !== dir || st.mode & 0o077 || (process.getuid && st.uid !== process.getuid())) throw new Error('Furnished workspace must be private and real');
  const token = randomBytes(32).toString('hex'), runs = new Map();
  let busy = false, attempts = 0;
  const exporter = path.resolve(__dirname, '../../tools/furnished_export.py');

  return async function handler(req, res) {
    const host = '127.0.0.1:' + getPort();
    const send = (code, type, bytes, headers = {}) => {
      res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'", ...headers });
      res.end(bytes);
    };
    const json = (code, body) => send(code, 'application/json; charset=utf-8', JSON.stringify(body));
    if (req.headers.host !== host || req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== 'http://' + host)) return json(403, { error: 'نشانی رابط معتبر نیست.' });
    if (req.method === 'GET' && (req.url === '/furnished' || req.url === '/furnished/')) {
      const { furnishedPage } = require('./page.cjs');
      return send(200, 'text/html; charset=utf-8', furnishedPage(token, { basePath: '/furnished', liveEnabled: Boolean(discoveryEndpoint) }));
    }
    const download = req.url.match(/^\/furnished\/download\/([a-f0-9]{32})\/([a-z.-]+)$/);
    if (req.method === 'GET' && download) {
      const record = runs.get(download[1]), name = download[2];
      if (!record || ![...paths, receiptName].includes(name)) return json(404, { error: 'فایل در این نشست پیدا نشد.' });
      try {
        const bytes = readFile(record.dir, name);
        if (hash(bytes) !== record.hashes[name].sha256 || bytes.length !== record.hashes[name].bytes) throw new Error('Artifact integrity');
        return send(200, 'application/octet-stream', bytes, { 'Content-Disposition': 'attachment; filename="' + name + '"' });
      } catch { return json(409, { error: 'اعتبار فایل تغییر کرده؛ دریافت متوقف شد.' }); }
    }
    const live = req.url === '/furnished/discover' && Boolean(discoveryEndpoint);
    if (req.method !== 'POST' || (req.url !== '/furnished/generate' && !live)) return json(404, { error: 'مسیر پیدا نشد.' });
    const supplied = Buffer.from(typeof req.headers['x-mana-token'] === 'string' ? req.headers['x-mana-token'] : '');
    if (req.headers.origin !== 'http://' + host || supplied.length !== token.length || !timingSafeEqual(supplied, Buffer.from(token))) return json(403, { error: 'درخواست معتبر نیست.' });
    if (req.headers['content-type'] !== 'application/json') return json(415, { error: 'ورودی JSON لازم است.' });
    if (busy) return json(409, { error: 'یک طراحی در حال اجراست.' });
    if (attempts >= 16) return json(429, { error: 'سقف اجرای آزمایشی این نشست پر شده است.' });
    busy = true;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 4096) { json(413, { error: 'شرح آزمایشی بیش از حد بزرگ است.' }); req.destroy(); return; }
        chunks.push(chunk);
      }
      let input;
      try {
        const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
        if (live) {
          const { discoverPrecedents, THEMES } = require('../architecture/precedent-discovery.cjs');
          if (!data || Object.keys(data).length !== 2 || data.optIn !== true || typeof data.theme !== 'string' || !Object.hasOwn(THEMES, data.theme)) return json(400, { error: 'فقط یک موضوع عمومیِ مشخص با تأیید صریح پذیرفته می‌شود.' });
          attempts++;
          const result = await discoverPrecedents({ optIn: true, theme: data.theme, endpoint: discoveryEndpoint });
          if (result.status !== 'SEARCH_COMPLETED_UNVERIFIED') return json(503, { error: 'جست‌وجوی زنده تأیید نشد؛ نتیجه‌ای جایگزین نشده است.' });
          return json(200, result);
        }
        input = validInput(data);
      }
      catch { return json(400, { error: 'ابعاد و اولویت در محدودهٔ نمونهٔ دوخوابه نیست.' }); }
      attempts++;
      const run = fs.mkdtempSync(path.join(dir, 'run-'));
      const artifacts = path.join(run, 'artifacts'), briefPath = path.join(run, 'brief.json');
      fs.mkdirSync(artifacts, { mode: 0o700 });
      fs.writeFileSync(briefPath, JSON.stringify(input.brief), { flag: 'wx', mode: 0o600 });
      const command = await runFile('python3', [exporter, '--brief', briefPath, '--output', artifacts], { timeout: 15000, maxBuffer: 64000, cwd: path.dirname(exporter), env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
      const result = JSON.parse(command.stdout);
      if (result.status !== 'FURNISHED_CONCEPT_FILES_VERIFIED' || result.plans !== 2 || result.constructionApproved !== false) throw new Error('Exporter has no verification');
      const receiptBytes = readFile(artifacts, receiptName), receipt = JSON.parse(receiptBytes);
      const canonicalBrief = JSON.stringify(Object.fromEntries(Object.keys(input.brief).sort().map(key => [key, input.brief[key]])));
      if (receipt.schema !== 'MANA_FURNISHED_EXPORT_RECEIPT_V1' || receipt.briefSha256 !== hash(canonicalBrief) || receipt.verification?.status !== 'FURNISHED_FILES_GEOMETRY_VERIFIED' || receipt.verification.plans !== 2 || receipt.constructionApproved !== false || receipt.productionDeploymentAllowed !== false) throw new Error('Incomplete verification');
      const hashes = Object.fromEntries(paths.map(name => {
        const bytes = readFile(artifacts, name), proof = receipt.files?.[name];
        if (!proof || hash(bytes) !== proof.sha256 || bytes.length !== proof.bytes) throw new Error('Output differs from receipt');
        return [name, proof];
      }));
      hashes[receiptName] = { sha256: hash(receiptBytes), bytes: receiptBytes.length };
      const plans = JSON.parse(readFile(artifacts, 'furnished-plans.json')).plans;
      if (!Array.isArray(plans) || plans.length !== 2) throw new Error('Two usable plans are required');
      const id = randomBytes(16).toString('hex');
      runs.set(id, { dir: artifacts, hashes });
      return json(200, { brief: input.brief, plans, verification: receipt.verification, constructionApproved: false,
        precedents: input.precedents ? lookupPrecedents({ optIn: true, priorities: input.brief.preference === 'private' ? ['privacy', 'daylight'] : ['indoor_outdoor', 'daylight'], limit: 3 }) : null,
        downloads: [...paths, receiptName].map(name => ({ name, url: '/furnished/download/' + id + '/' + name })) });
    } catch { return json(503, { error: 'ساخت یا بررسی مستقل فایل‌ها کامل نشد؛ خروجی تأیید نشده است.' }); }
    finally { busy = false; }
  };
}

module.exports = { createFurnishedHandler, validInput };
