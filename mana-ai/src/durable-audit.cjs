'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

function openAuditLog(filePath, { anchor } = {}) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
    throw new Error('Audit path must be absolute');
  }
  const dir = path.dirname(filePath);
  const dirStat = fs.statSync(dir);
  if (!dirStat.isDirectory()) throw new Error('Audit parent is not a directory');
  const events = [];
  let previousHash = '0'.repeat(64);
  if (fs.existsSync(filePath)) {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 10 * 1024 * 1024) {
      throw new Error('Invalid or oversized audit file');
    }
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      const record = JSON.parse(line);
      if (!record || record.previousHash !== previousHash || !record.event ||
          typeof record.hash !== 'string') throw new Error('Audit chain invalid');
      const calculated = createHash('sha256').update(JSON.stringify({
        previousHash: record.previousHash, event: record.event
      })).digest('hex');
      if (calculated !== record.hash) throw new Error('Audit integrity verification failed');
      events.push(record.event);
      previousHash = record.hash;
    }
  }
  const checkpoint = () => ({ sequence: events.length, hash: previousHash });
  if (anchor) {
    if (typeof anchor.read !== 'function' || typeof anchor.write !== 'function') throw new Error('Synchronous independent anchor required');
    const expected = anchor.read();
    if (expected && (expected.sequence !== events.length || expected.hash !== previousHash)) throw new Error('Audit anchor mismatch');
    if (!expected && events.length) throw new Error('Existing log requires trusted anchor');
    if (expected && typeof expected.then === 'function') throw new Error('Synchronous anchor required');
  }
  let poisoned = false;
  const fd = fs.openSync(filePath, fs.constants.O_WRONLY | fs.constants.O_APPEND |
    fs.constants.O_CREAT | (fs.constants.O_NOFOLLOW || 0), 0o600);
  return {
    record({ actorId, orgId, action, outcome, requestId, resourceId, projectId, approvalId, idempotencyKey, payloadDigest }) {
      if (poisoned) throw new Error('Audit unavailable; reconciliation required');
      if (typeof action !== 'string' || !action || typeof outcome !== 'string' || !outcome) throw new Error('Action and outcome required');
      for (const value of [actorId,orgId,action,outcome,requestId,resourceId,projectId,approvalId,idempotencyKey,payloadDigest]) {
        if (value !== undefined && (typeof value !== 'string' || value.length > 256 || /[\r\n]/.test(value))) throw new Error('Invalid audit metadata');
      }
      const event = {
        eventId: randomUUID(),
        timestamp: new Date().toISOString(),
        actorId: actorId || 'anonymous',
        orgId: orgId || null,
        action,
        outcome, requestId, resourceId, projectId, approvalId, idempotencyKey, payloadDigest
      };
      const record = { previousHash, event };
      record.hash = createHash('sha256').update(JSON.stringify(record)).digest('hex');
      const line = JSON.stringify(record) + '\n';
      try {
        if (fs.fstatSync(fd).size + Buffer.byteLength(line) > 10 * 1024 * 1024) throw new Error('Audit capacity reached');
        const written = fs.writeSync(fd, line);
        if (written !== Buffer.byteLength(line)) throw new Error('Incomplete audit write');
        fs.fsyncSync(fd);
        previousHash = record.hash;
        events.push(event);
        if (anchor) {
          const result = anchor.write(checkpoint());
          if (result && typeof result.then === 'function') throw new Error('Synchronous anchor required');
        }
      } catch (error) { poisoned = true; throw error; }
    },
    list(orgId) {
      return events.filter(e => e.orgId === orgId).map(e => ({ ...e }));
    },
    checkpoint,
    close() { fs.closeSync(fd); }
  };
}
function createDurableAuditLog(filePath, options) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('Audit path must be absolute');
  filePath = path.join(fs.realpathSync(path.dirname(filePath)), path.basename(filePath));
  const lockPath = filePath + '.lock';
  const lock = fs.openSync(lockPath, 'wx', 0o600);
  try {
    const log = openAuditLog(filePath, options);
    let closed = false;
    return { ...log, close() {
      if (closed) return;
      closed = true;
      try { log.close(); } finally { fs.closeSync(lock); fs.unlinkSync(lockPath); }
    }};
  } catch (error) {
    fs.closeSync(lock); fs.unlinkSync(lockPath); throw error;
  }
}
module.exports = { createDurableAuditLog };
