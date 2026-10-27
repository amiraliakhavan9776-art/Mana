'use strict';
const { canAccessProject } = require('./security.cjs');
const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');
const { normalizePrincipals, authenticate, can } = require('./security.cjs');
const { validateProjects, projectsFor } = require('./projects.cjs');
const { createAuditLog } = require('./audit.cjs');
const { createDurableAuditLog } = require('./durable-audit.cjs');
const { loadAuditAnchor } = require('./file-audit-anchor.cjs');
const { createNativeApi } = require('./native/api.cjs');
const { loadProjectSnapshot } = require('./snapshot.cjs');
const { loadDocuments, validateDocuments } = require('./documents.cjs');
const { createEngine, createLocalOpenAICompatibleProvider } = require('./engine.cjs');
const { authorizeAction } = require('./governance.cjs');
const { createOpenAIProvider } = require('./openai-provider.cjs');
const { createAgentRunner } = require('./agent-runner.cjs');
const { createReadOnlyAgentTools } = require('./agent-tools.cjs');
const { loadApprovedExport } = require('./export-loader.cjs');

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
function createServer({ token, principals, projects = [], audit = createAuditLog(), engine = null, documents = [], nativeCore = null, nativeEvidence = [] } = {}) {
  if (typeof token !== 'string' || token.length < 32) {
    throw new Error('MANA_AI_TOKEN must be at least 32 characters');
  }
  const recordAudit = (event, res) => {
    try { audit.record(event); return true; }
    catch { json(res, 503, { error: 'audit_unavailable' }); return false; }
  };
  const users = normalizePrincipals(principals || [{ id: 'local-admin', orgId: 'local', role: 'admin', token }]);
  const safeProjects = validateProjects(projects);
  const safeDocuments = validateDocuments(documents);
  const nativeApi=nativeCore?createNativeApi({core:nativeCore,authenticate:req=>authenticate(req.headers.authorization||'',users),projects:safeProjects,evidence:nativeEvidence,audit}):null;
  const agent = createAgentRunner({ audit, tools: createReadOnlyAgentTools({ projects: safeProjects, documents: safeDocuments }) });
  return http.createServer((req, res) => {
    if (!req.url || req.url.length > MAX_URL_LENGTH) {
      return json(res, 414, { error: 'uri_too_long' });
    }
    const pathname = req.url.split('?')[0];
    if(nativeApi&&['/v1/native/plan','/v1/native/evaluate'].includes(pathname)){void nativeApi(req,res);return;}
    if (req.method === 'POST' && pathname === '/v1/agent/documents/search') {
      const principal = authenticate(req.headers.authorization || '', users);
      if (!principal) return json(res, 401, { error: 'unauthorized' });
      if (!can(principal, 'projects:read')) return json(res, 403, { error: 'forbidden' });
      let bytes = 0;
      const chunks = [];
      req.on('data', chunk => {
        if (res.writableEnded) return;
        bytes += chunk.length;
        if (bytes > 4096) return json(res, 413, { error: 'payload_too_large' });
        chunks.push(chunk);
      });
      req.on('end', async () => {
        if (res.writableEnded) return;
        let input;
        try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch (_) { return json(res, 400, { error: 'invalid_input' }); }
        if (!input || typeof input !== 'object' || Array.isArray(input) ||
            Object.keys(input).some(k => k !== 'projectId' && k !== 'question') ||
            typeof input.projectId !== 'string' || typeof input.question !== 'string') {
          return json(res, 400, { error: 'invalid_input' });
        }
        if (!safeProjects.some(p => p.id === input.projectId && canAccessProject(principal, p))) {
          if (!recordAudit({ actorId: principal.id, orgId: principal.orgId, action: pathname, outcome: 'denied' }, res)) return;
          return json(res, 404, { error: 'project_not_found' });
        }
        let result;
        try { result = await agent.execute({ principal, action: 'documents:read', scope: input.projectId, input: { question: input.question } }); }
        catch { return json(res, 503, { error: 'audit_unavailable' }); }
        return json(res, result.ok ? 200 : 400, result.ok ? result.result : { error: result.error });
      });
      return;
    }
    if (req.method === 'POST' && pathname === '/v1/ai/ask' && engine) {
      const principal = authenticate(req.headers.authorization || '', users);
      if (!principal) return json(res, 401, { error: 'unauthorized' });
      if (!can(principal, 'projects:read')) return json(res, 403, { error: 'forbidden' });
      const policy = authorizeAction({ principal, action: 'documents:read', scope: principal.orgId });
      if (!policy.allowed) return json(res, 403, { error: 'policy_denied' });
      const chunks = [];
      let bytes = 0;
      req.on('data', chunk => {
        if (res.writableEnded) return;
        bytes += chunk.length;
        if (bytes > 8192) {
          json(res, 413, { error: 'payload_too_large' });
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', async () => {
        if (res.writableEnded) return;
        try {
          const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (!input || typeof input !== 'object' || Array.isArray(input) ||
              Object.keys(input).some(k => k !== 'question' && k !== 'projectId' && k !== 'sessionId')) throw new Error('Invalid input');
          if (input.projectId !== undefined && !safeProjects.some(p => p.id === input.projectId && canAccessProject(principal, p))) {
            if (!recordAudit({ actorId: principal.id, orgId: principal.orgId, action: pathname, outcome: 'forbidden' }, res)) return;
            return json(res, 404, { error: 'project_not_found' });
          }
          const result = await engine.ask({ principal, question: input.question, projectId: input.projectId, sessionId: input.sessionId, projects: safeProjects, documents: safeDocuments });
          if (!recordAudit({ actorId: principal.id, orgId: principal.orgId, action: pathname, outcome: 'allowed' }, res)) return;
          return json(res, 200, result);
        } catch (err) {
          if (!recordAudit({ actorId: principal.id, orgId: principal.orgId, action: pathname, outcome: 'failed' }, res)) return;
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
      if (!recordAudit({ action: pathname, outcome: 'unauthorized' }, res)) return;
      res.setHeader('WWW-Authenticate', 'Bearer');
      return json(res, 401, { error: 'unauthorized' });
    }
    const permission = pathname === '/v1/capabilities' ? 'capabilities:read' :
      pathname === '/v1/projects' ? 'projects:read' :
      pathname === '/v1/audit' ? 'audit:read' : null;
    if (!permission) {
      if (!recordAudit({ actorId: principal.id, orgId: principal.orgId, action: pathname, outcome: 'not_found' }, res)) return;
      return json(res, 404, { error: 'not_found' });
    }
    if (!can(principal, permission)) {
      if (!recordAudit({ actorId: principal.id, orgId: principal.orgId, action: pathname, outcome: 'forbidden' }, res)) return;
      return json(res, 403, { error: 'forbidden' });
    }
    if (!recordAudit({ actorId: principal.id, orgId: principal.orgId, action: pathname, outcome: 'allowed' }, res)) return;
    if (pathname === '/v1/projects') return json(res, 200, { projects: projectsFor(principal, safeProjects) });
    if (pathname === '/v1/audit') return json(res, 200, { events: audit.list(principal.orgId) });
    if (pathname === '/v1/capabilities') {
      return json(res, 200, {
        service: 'mana-ai',
        mode: 'read-only-foundation',
        aiEnabled: !!engine,
        nativeCoreEnabled: !!nativeCore,
        dataConnected: false,
        capabilities: ['health', 'capabilities', 'projects:read', 'audit:read', 'agent:documents:search'].concat(engine ? ['ai:ask'] : [], nativeCore ? ['native:plan','native:evaluate'] : []),
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
  if (process.env.MANA_AI_APPROVED_EXPORT &&
      (process.env.MANA_AI_PROJECT_SNAPSHOT || process.env.MANA_AI_DOCUMENT_SNAPSHOT)) {
    throw new Error('Approved export cannot be combined with separate snapshots');
  }
  const approved = process.env.MANA_AI_APPROVED_EXPORT ?
    loadApprovedExport(process.env.MANA_AI_APPROVED_EXPORT, { orgId: process.env.MANA_AI_EXPORT_ORG_ID }) : null;
  const projects = approved ? approved.projects : process.env.MANA_AI_PROJECT_SNAPSHOT ?
    loadProjectSnapshot(process.env.MANA_AI_PROJECT_SNAPSHOT) : [];
  const documents = approved ? approved.documents : process.env.MANA_AI_DOCUMENT_SNAPSHOT ?
    loadDocuments(process.env.MANA_AI_DOCUMENT_SNAPSHOT) : [];
  const anchorFile=process.env.MANA_AI_AUDIT_ANCHOR_FILE, keyFile=process.env.MANA_AI_AUDIT_KEY_FILE;
  if ((anchorFile || keyFile) && !(anchorFile && keyFile && process.env.MANA_AI_AUDIT_FILE)) {
    throw new Error('Audit file, anchor file and private key file required together');
  }
  const anchor=anchorFile ? loadAuditAnchor({auditFile:process.env.MANA_AI_AUDIT_FILE,anchorFile,keyFile}) : undefined;
  if (process.env.MANA_AI_OPENAI_API_KEY && process.env.MANA_AI_LOCAL_PROVIDER_URL) {
    throw new Error('Select only one AI provider');
  }
  if (process.env.MANA_AI_OPENAI_API_KEY && process.env.MANA_AI_APPROVED_EXPORT) {
    throw new Error('External AI provider cannot be used with approved project exports in pilot mode');
  }
  if (process.env.MANA_AI_OPENAI_API_KEY && (projects.length || documents.length)) {
    throw new Error('External AI provider is limited to general questions without project or document data');
  }
  const engine = process.env.MANA_AI_MODEL && (process.env.MANA_AI_LOCAL_PROVIDER_URL || process.env.MANA_AI_OPENAI_API_KEY) ?
    createEngine({
      provider: process.env.MANA_AI_OPENAI_API_KEY ?
        createOpenAIProvider({ apiKey: process.env.MANA_AI_OPENAI_API_KEY }) :
        createLocalOpenAICompatibleProvider({ baseUrl: process.env.MANA_AI_LOCAL_PROVIDER_URL }),
      model: process.env.MANA_AI_MODEL
    }) : null;
  const audit = process.env.MANA_AI_AUDIT_FILE ?
    createDurableAuditLog(process.env.MANA_AI_AUDIT_FILE,{anchor}) : createAuditLog();
  let server;
  try { server = createServer({ token, projects, documents, audit, engine }); }
  catch (error) { if (typeof audit.close === 'function') audit.close(); throw error; }
  if (typeof audit.close === 'function') server.on('close', () => audit.close());
  if (typeof audit.close === 'function') server.once('error', () => audit.close());
  server.listen(port, host, () => {
    process.stdout.write('Mana AI foundation listening on ' + host + ':' + port + '\n');
  });
  return server;
}
if (require.main === module) {
  try { start().on('error', err => { process.stderr.write(err.message + '\n'); process.exitCode = 1; }); }
  catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
}
module.exports = { createServer, start, tokenMatches };
