'use strict';
// Isolated backup/restore verification. Never writes to legacy storage or seeds data.
const { randomBytes, createCipheriv, createDecipheriv, createHash } = require('node:crypto');
const MAX = 20 * 1024 * 1024;
const MAGIC = Buffer.from('MANABK1');
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function inspect(databaseJson, attachments) {
  if (typeof databaseJson !== 'string' || Buffer.byteLength(databaseJson) > MAX) throw Error('Invalid database export');
  const db = JSON.parse(databaseJson);
  if (!db || Array.isArray(db) || db.meta?.v !== 2 || !Array.isArray(db.projects) || !db.settings || typeof db.settings !== 'object' || Array.isArray(db.settings)) throw Error('Unsupported legacy schema');
  if (!Array.isArray(attachments)) throw Error('Explicit attachment export required');
  const counts = {}, ids = {};
  for (const [name, rows] of Object.entries(db)) {
    if (['meta','settings'].includes(name)) continue;
    if (!Array.isArray(rows)) throw Error('Unknown non-collection field: '+name);
    counts[name] = rows.length; ids[name] = new Set();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string' || !row.id || ids[name].has(row.id)) throw Error('Invalid or duplicate record: '+name);
      ids[name].add(row.id);
    }
  }
  for (const [name, rows] of Object.entries(db)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (row.projectId != null && !ids.projects.has(row.projectId)) throw Error('Orphan project reference: '+name);
      if (row.contractId != null && !ids.contracts?.has(row.contractId)) throw Error('Orphan contract reference: '+name);
    }
  }
  const attachmentIds = new Set();
  for (const a of attachments) {
    if (!a || typeof a.id !== 'string' || !a.id || attachmentIds.has(a.id) || typeof a.ownerKey !== 'string' || typeof a.data !== 'string' || !a.data.startsWith('data:')) throw Error('Invalid attachment export');
    attachmentIds.add(a.id);
  }
  return { counts, attachmentCount: attachments.length, unverifiedInvoiceIds: (db.invoices || []).filter(i => !i.status || (i.status === 'approved' && i.approvedBy === 'سیستم')).map(i=>i.id) };
}
function checkKey(key) { if (!Buffer.isBuffer(key) || key.length !== 32) throw Error('32-byte backup key required'); }
function createLegacyBackup({ databaseJson, attachments }, key) {
  checkKey(key);
  const report = inspect(databaseJson, attachments);
  const payload = JSON.stringify({ version:1, databaseJson, attachments, databaseDigest:digest(databaseJson), report });
  if (Buffer.byteLength(payload) > MAX) throw Error('Backup too large');
  const nonce=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,nonce);
  const encrypted=Buffer.concat([cipher.update(payload,'utf8'),cipher.final()]);
  return Buffer.concat([MAGIC,nonce,cipher.getAuthTag(),encrypted]);
}
function verifyLegacyBackup(bytes,key) {
  checkKey(key);
  if (!Buffer.isBuffer(bytes) || bytes.length < 35 || bytes.length > MAX+35 || !bytes.subarray(0,7).equals(MAGIC)) throw Error('Invalid backup');
  const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(7,19));
  decipher.setAuthTag(bytes.subarray(19,35));
  const data=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(35)),decipher.final()]).toString('utf8'));
  if (data.version !== 1 || typeof data.databaseJson !== 'string' || digest(data.databaseJson) !== data.databaseDigest) throw Error('Backup integrity failed');
  const report=inspect(data.databaseJson,data.attachments);
  if (JSON.stringify(report) !== JSON.stringify(data.report)) throw Error('Backup reconciliation failed');
  return { databaseJson:data.databaseJson, attachments:data.attachments, report };
}
module.exports={createLegacyBackup,verifyLegacyBackup};
