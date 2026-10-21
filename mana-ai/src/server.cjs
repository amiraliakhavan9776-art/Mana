'use strict';
const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');

const MAX_URL_LENGTH = 2048;
const DEFAULT_HOST = '127.0.0.1';

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(payload);
}
function tokenMatches(supplied, expected) {
  if (typeof supplied !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
function createServer({ token } = {}) {
  if (typeof token !== 'string' || token.length < 32) {
    throw new Error('MANA_AI_TOKEN must be at least 32 characters');
  }
  return http.createServer((req, res) => {
    if (!req.url || req.url.length > MAX_URL_LENGTH) {
      return json(res, 414, { error: 'uri_too_long' });
    }
    const pathname = req.url.split('?')[0];
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return json(res, 405, { error: 'method_not_allowed' });
    }
    if (pathname === '/healthz') {
      return json(res, 200, { status: 'ok', service: 'mana-ai' });
    }
    const authorization = req.headers.authorization || '';
    const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!tokenMatches(supplied, token)) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      return json(res, 401, { error: 'unauthorized' });
    }
    if (pathname === '/v1/capabilities') {
      return json(res, 200, {
        service: 'mana-ai',
        mode: 'read-only-foundation',
        aiEnabled: false,
        dataConnected: false,
        capabilities: ['health', 'capabilities'],
        humanApprovalRequiredForConsequentialActions: true
      });
    }
    return json(res, 404, { error: 'not_found' });
  });
}
function start() {
  const token = process.env.MANA_AI_TOKEN;
  const host = process.env.MANA_AI_HOST || DEFAULT_HOST;
  const port = Number(process.env.MANA_AI_PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('MANA_AI_PORT must be an integer between 1 and 65535');
  }
  if (host !== DEFAULT_HOST && host !== '::1') {
    throw new Error('Remote binding is disabled in foundation mode; use loopback only');
  }
  const server = createServer({ token });
  server.listen(port, host, () => {
    process.stdout.write('Mana AI foundation listening on ' + host + ':' + port + '\n');
  });
  return server;
}
if (require.main === module) {
  try { start(); }
  catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
}
module.exports = { createServer, start, tokenMatches };
