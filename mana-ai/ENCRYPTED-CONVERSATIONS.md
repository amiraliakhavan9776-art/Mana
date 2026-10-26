# Mana encrypted conversation persistence — scope-authenticated format

Current format: MANA2. AES-256-GCM authenticated additional data binds ciphertext to organizationId, userId and conversationId. Hashed filenames alone are not an authorization/integrity boundary. Copying one valid ciphertext into another scope now fails authentication; the API returns a generic storage error and does not disclose or overwrite it.

## Implementation
- Validate and snapshot scope and key before asynchronous work; later mutation of caller objects cannot redirect queued writes.
- Bound file size, message count and message schema. Reject symlinks, malformed or corrupted records; never replace unreadable records with an empty conversation.
- Serialize writes within an instance and acquire an exclusive per-record lock across cooperating instances/processes. Busy writes fail explicitly rather than losing a competing update.
- Write a private temporary file, fsync, rename atomically and fsync the directory.
- Read is a snapshot of the last committed record, not a transaction across different conversations.
- Crash-stale locks require operator reconciliation; do not automatically delete them. A post-rename sync failure is an uncertain outcome, not proof that no message was written. Reconcile before retry where duplication matters.

## Compatibility and explicit migration
MANA1 did not authenticate scope. Normal MANA2 read/append rejects a MANA1 record with a verified-migration error and preserves its bytes.
The store exposes `migrateLegacy(scope, {expectedSha256})` for an explicitly reviewed offline conversion. The expected SHA-256 must come from a separately trusted backup manifest mapping that exact organization/user/conversation to its original ciphertext. Do not calculate the expected digest from an untrusted live file and treat that as verification.
1. Stop writers and verify a restorable encrypted backup and retained key.
2. Verify identity-to-file mapping against trusted backup evidence.
3. Instantiate the store with the existing key and directory; call migrateLegacy for the verified scope/digest.
4. Verify restored messages. Successful conversion writes MANA2 atomically; a repeated call validates the MANA2 scope and returns migrated:false.
A digest mismatch, wrong key, invalid schema or busy lock aborts without replacing the old ciphertext. If no trusted mapping exists, quarantine the record for recovery; do not guess its owner.
No real conversation files were migrated by this PR.

## Integration and limits
Use trusted host identity through the authenticated conversation API. File cryptography does not grant organization membership or project access.
Supply a managed 32-byte key; do not expose keys/storage through HTTP. Key recovery, rotation and retention remain operational requirements.
Same-scope rollback of an old ciphertext is not prevented by authenticated encryption alone; use independent version/audit evidence for that requirement. This single-host pilot is not distributed locking or cross-device deployment.

## Verification
`node --test mana-ai/tests/encrypted-conversations.test.cjs mana-ai/tests/conversation-encrypted-integration.test.cjs`
Tests include scope transplantation reproduced before the fix, explicit MANA1 conversion, wrong manifests/keys, input mutation, competing writers, corruption, oversize/symlink rejection and API nondisclosure.
