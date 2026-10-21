'use strict';
const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');
const { normalizePrincipals, authenticate, can } = require('./security.cjs');
const { validateProjects, projectsFor } = require('./projects.cjs');
const { createAuditLog } = require('./audit.cjs');
const { createDurableAuditLog } = require('./durable-audit.cjs');
const { loadProjectSnapshot } = require('./snapshot.cjs');
const { loadDocuments, validateDocuments } = require('./documents.cjs');
const { createEngine, createLocalOpenAICompatibleProvider } = require('./engine.cjs');
const { authorizeAction } = require('./governance.cjs');

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
function createServer({ token, principals, projects = [], audit = createAuditLog(), engine = null, documents = [] } = {}) {
  if (typeof token !== 'string' || token.length < 32) {
    throw new Error('MANA_AI_TOKEN must be at least 32 characters');
  }
  const users = normalizePrincipals(principals || [{ id: 'local-admin', orgId: 'local', role: 'admin', token }]);
  const safeProjects = validateProjects(projects);
  const safeDocuments = validateDocuments(documents);
  return http.createServer((req, res) => {
    if (!req.url || req.url.length > MAX_URL_LENGTH) {
      return json(res, 414, { error: 'uri_too_long' });
    }
    const pathname = req.url.split('?')[0];
    if (req.method === 'POST' && pathname === '/v1/ai/ask' && engine) {
      const principal = authenticate(req.headers.authorization || '', users);
      if (!principal) return json(res, 401, { error: 'unauthorized' });
      if (!can(principal, 'projects:read')) return json(res, 403, { error: 'forbidden' });
      const policy = authorizeAction({ principal, action: 'documents:read', scope: principal.orgId });
      if (!policy.allowed) return json(res, 403, { error: 'policy_denied' });
      let raw = '';
      req.on('data', chunk => {
        raw += chunk;
        if (Buffer.byteLength(raw, 'utf8') > 8192 && !res.headersSent) {
          json(res, 413, { error: 'payload_too_large' });
          req.resume();
        }
      });
      req.on('end', async () => {
        if (res.writableEnded) return;
        try {
          const input = JSON.parse(raw);
          if (!input || typeof input !== 'object' || Array.isArray(input) ||
              Object.keys(input).some(k => k !== 'question' && k !== 'projectId' && k !== 'sessionId')) throw new Error('Invalid input');
          if (input.projectId !== undefined && !safeProjects.some(p => p.id === input.projectId && p.orgId === principal.orgId)) {
            audit.record({ actorId: principal.id, orgId: principal.orgId, action: pathname, outcome: 'forbidden' });
            return json(res, 404, { error: 'project_not_found' });
          }
          const result = await engine.ask({ principal, question: input.question, projectId: input.projectId, sessionId: input.sessionId, projects: safeProjects, documents: safeDocuments });
          audit.record({ actorId: principal.id, orgId: principal.orgId, action: pathname, outcome: 'allowed' });
          return json(res, 200, result);
        } catch (err) {
          audit.record({ actorId: principal.id, orgId: principal.orgId, action: pathname, outcome: 'failed' });
          return json(res, 400, { error: 'ai_request_failed' });
        }
      });
      return;
    }
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return json(res, 405, { error: 'method_not_allowed' });
    }
    if (pathname === '/healthz') {
      return json(res, 200, { status: 'ok', service: 'mana-ai' });
    }
    const authorization = req.headers.authorization || '';
    const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const principal = authenticate(authorization, users);
    if (!principal) {
      audit.record({ action: pathname, outcome: 'unauthorized' });
      res.setHeader('WWW-Authenticate', 'Bearer');
      return json(res, 401, { error: 'unauthorized' });
    }
    const permission = pathname === '/v1/capabilities' ? 'capabilities:read' :
      pathname === '/v1/projects' ? 'projects:read' :
      pathname === '/v1/audit' ? 'audit:read' : null;
    if (!permission) {
      audit.record({ actorId: principal.id, orgId: principal.orgId, action: pathname, outcome: 'not_found' });
      return json(res, 404, { error: 'not_found' });
    }
    if (!can(principal, permission)) {
      audit.record({ actorId: principal.id, orgId: principal.orgId, action: pathname, outcome: 'forbidden' });
      return json(res, 403, { error: 'forbidden' });
    }
    audit.record({ actorId: principal.id, orgId: principal.orgId, action: pathname, outcome: 'allowed' });
    if (pathname === '/v1/projects') return json(res, 200, { projects: projectsFor(principal, safeProjects) });
    if (pathname === '/v1/audit') return json(res, 200, { events: audit.list(principal.orgId) });
    if (pathname === '/v1/capabilities') {
      return json(res, 200, {
        service: 'mana-ai',
        mode: 'read-only-foundation',
        aiEnabled: !!engine,
        dataConnected: false,
        capabilities: ['health', 'capabilities', 'projects:read', 'audit:read'].concat(engine ? ['ai:ask'] : []),
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
  const projects = process.env.MANA_AI_PROJECT_SNAPSHOT ?
    loadProjectSnapshot(process.env.MANA_AI_PROJECT_SNAPSHOT) : [];
  const documents = process.env.MANA_AI_DOCUMENT_SNAPSHOT ?
    loadDocuments(process.env.MANA_AI_DOCUMENT_SNAPSHOT) : [];
  const audit = process.env.MANA_AI_AUDIT_FILE ?
    createDurableAuditLog(process.env.MANA_AI_AUDIT_FILE) : createAuditLog();
  const engine = process.env.MANA_AI_LOCAL_PROVIDER_URL && process.env.MANA_AI_MODEL ?
    createEngine({ provider: createLocalOpenAICompatibleProvider({ baseUrl: process.env.MANA_AI_LOCAL_PROVIDER_URL }), model: process.env.MANA_AI_MODEL }) : null;
  const server = createServer({ token, projects, documents, audit, engine });
  if (typeof audit.close === 'function') server.on('close', () => audit.close());
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
