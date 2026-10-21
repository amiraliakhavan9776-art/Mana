'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function createDurableAuditLog(filePath) {
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
  const fd = fs.openSync(filePath, fs.constants.O_WRONLY | fs.constants.O_APPEND |
    fs.constants.O_CREAT | (fs.constants.O_NOFOLLOW || 0), 0o600);
  return {
    record({ actorId, orgId, action, outcome }) {
      const event = {
        timestamp: new Date().toISOString(),
        actorId: actorId || 'anonymous',
        orgId: orgId || null,
        action,
        outcome
      };
      const record = { previousHash, event };
      record.hash = createHash('sha256').update(JSON.stringify(record)).digest('hex');
      const line = JSON.stringify(record) + '\n';
      const written = fs.writeSync(fd, line);
      if (written !== Buffer.byteLength(line)) throw new Error('Incomplete audit write');
      fs.fsyncSync(fd);
      previousHash = record.hash;
      events.push(event);
    },
    list(orgId) {
      return events.filter(e => e.orgId === orgId).map(e => ({ ...e }));
    },
    close() { fs.closeSync(fd); }
  };
}
module.exports = { createDurableAuditLog };
