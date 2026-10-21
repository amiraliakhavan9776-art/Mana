# Mana AI — encrypted conversation persistence (foundation)

The new `src/encrypted-conversations.cjs` module saves bounded conversations on disk with AES-256-GCM authenticated encryption, random nonces and per-conversation hashed filenames. It scopes each record to an organization ID, user ID and conversation ID. File writes use temporary files and atomic rename; writes for the same conversation are serialized **within a single process**.

This is a **library module only**: it is not connected to the HTTP API, user login, or the mobile/desktop UIs. It is not yet cross-device synchronization.

Use a 32-byte secret loaded securely from your local deployment's secret manager. Never commit keys, expose the storage directory through HTTP, or reuse production keys in development. Key loss makes old records unreadable. Multi-process concurrency, backup/restore, key rotation, retention/deletion, file system permissions, quotas, server-side membership verification and audit must be addressed before production.

Test (Node.js 20+):
```sh
node --test mana-ai/tests/encrypted-conversations.test.cjs
```

Next: connect authenticated API endpoints, enforce server-verified user and organization membership, and provide shared conversation IDs to authenticated devices over HTTPS.
