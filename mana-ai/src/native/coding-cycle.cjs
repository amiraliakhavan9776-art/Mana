'use strict';
/**
 * MANA_CODE_CYCLE_V1. Review-only bounded generate -> sandbox-test -> repair.
 * No source code is modified, no commits, approvals or deployments are made.
 * Caller provides an independent sandbox verifier; it is never substituted with
 * a JS eval, host-side process, or a model's verbal assertion.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function requirePrivateDir(workspace) {
  if (typeof workspace !== 'string' || !path.isAbsolute(workspace)) throw Error('Absolute workspace required');
  fs.mkdirSync(workspace, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(workspace);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw Error('Private, non-symlink workspace required');
}
function saveReceipt(directory, record) {
  const file = path.join(directory, 'cycle-receipt.json');
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return file;
}
function formatFeedback(result) {
  const message = typeof result?.summary === 'string' ? result.summary.slice(0, 1200) : 'Independent verification failed';
  return message.replace(/[\u0000-\u001f]/g, ' ');
}
async function codingCycle({ request, projectRoot, allowedFiles, workspace, propose, verify, draft = null, maxAttempts = 3 }) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) throw Error('Invalid attempt budget');
  if (typeof verify !== 'function') throw Error('Independent sandbox verifier required');
  const draftCode = draft ?? require('./code-workbench.cjs').draftCode;
  if (typeof request !== 'string' || request.length < 10 || request.length > 3000) throw Error('Invalid coding request');
  requirePrivateDir(workspace);
  const cycleId = hash(JSON.stringify({ request, allowedFiles, projectRoot })).slice(0, 24);
  const cycleDir = path.join(workspace, `cycle-${cycleId}`);
  fs.mkdirSync(cycleDir, { mode: 0o700 });
  const attempts = [];
  let feedback = '';
  for (let n = 1; n <= maxAttempts; n++) {
    const requestForAttempt = `${request}\n\nAttempt ${n}. ${feedback}`;
    const draft = await draftCode({ request: requestForAttempt, projectRoot, allowedFiles,
      workspace: path.join(cycleDir, `attempt-${n}`), propose });
    if (draft.status === 'DEPENDENCY_UNAVAILABLE') {
      const receipt = { schema: 'MANA_CODE_CYCLE_V1', status: 'DEPENDENCY_UNAVAILABLE', attempts,
        approved: false, productionDeploymentAllowed: false };
      return { ...receipt, receiptPath: saveReceipt(cycleDir, receipt) };
    }
    const candidateDir = path.join(draft.directory, 'candidate');
    let verified;
    try {
      verified = await verify({ candidateDir, files: draft.files, attempt: n });
    } catch (error) {
      verified = { status: 'SANDBOX_UNAVAILABLE', executed: false, passed: false, summary: error.message };
    }
    // A successful result must explicitly attest to a real isolated execution.
    if (!verified || !['PASSED', 'FAILED', 'SANDBOX_UNAVAILABLE'].includes(verified.status)
      || typeof verified.executed !== 'boolean' || typeof verified.passed !== 'boolean'
      || (verified.status === 'PASSED' && (!verified.executed || !verified.passed))) {
      throw Error('Malformed independent verifier result');
    }
    attempts.push({ attempt: n, draftDirectory: draft.directory, files: draft.files,
      verification: { status: verified.status, executed: verified.executed,
        passed: verified.passed, summary: formatFeedback(verified) } });
    if (verified.status === 'PASSED') {
      const receipt = { schema: 'MANA_CODE_CYCLE_V1', status: 'SANDBOX_PASSED_AWAITING_HUMAN_REVIEW',
        attempts, approved: false, productionDeploymentAllowed: false };
      return { ...receipt, receiptPath: saveReceipt(cycleDir, receipt) };
    }
    if (verified.status === 'SANDBOX_UNAVAILABLE') {
      const receipt = { schema: 'MANA_CODE_CYCLE_V1', status: 'SANDBOX_UNAVAILABLE',
        attempts, approved: false, productionDeploymentAllowed: false };
      return { ...receipt, receiptPath: saveReceipt(cycleDir, receipt) };
    }
    feedback = `Independent sandbox tests FAILED. Error summary: ${formatFeedback(verified)}. Repair without changing unrelated functionality.`;
  }
  const receipt = { schema: 'MANA_CODE_CYCLE_V1', status: 'BUDGET_EXHAUSTED', attempts,
    approved: false, productionDeploymentAllowed: false };
  return { ...receipt, receiptPath: saveReceipt(cycleDir, receipt) };
}
module.exports = { codingCycle };
