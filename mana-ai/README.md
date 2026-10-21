# Mana AI foundation service

This is an **isolated, non-production, read-only API skeleton**. It does not connect to the existing Mana browser data, does not call an AI model, and cannot write project records.

## Prerequisites
Node.js 20+; no third-party dependencies.

## Run locally
Generate a unique random secret in a secure password manager and set it as `MANA_AI_TOKEN` (minimum 32 characters). Do not commit the secret.

```sh
cd mana-ai
MANA_AI_TOKEN='replace-with-a-unique-secret-of-32-plus-characters' npm start
```

The service binds to `127.0.0.1:8787` by default and refuses non-loopback binding.

```sh
curl http://127.0.0.1:8787/healthz
curl -H "Authorization: Bearer YOUR_SECRET" http://127.0.0.1:8787/v1/capabilities
npm test
```

## Routes
- `GET /healthz`: unauthenticated health probe, no project data.
- `GET /v1/capabilities`: bearer-protected declaration of disabled AI/data integrations.
- All write methods are rejected; no project records or user data are exposed.

## Security boundary
The bearer token is only a temporary local-development gate, **not production identity or RBAC**. Do not expose this server to the internet or place it behind a public reverse proxy. Before any live deployment, implement organization-scoped identity, authorization, audit trails, TLS termination, rate limiting, persistent storage, approval policies, observability and threat-model review.

The existing root `index.html` is intentionally untouched. This service is not connected to the browser's `mana.db.v2` localStorage.

## Identity and audit prototype (development only)

The server now supports optional `principals` and `projects` passed to `createServer()` for tests and embedding. Principals have `id`, `orgId`, `role` (`viewer`, `analyst`, `admin`), and a unique secret token. The default CLI configuration creates a single local admin principal from `MANA_AI_TOKEN`; **it is not a production identity provider**.

- `GET /v1/projects`: returns a sanitized list of projects for the authenticated organization. Default list is empty; **no real Mana data is connected**.
- `GET /v1/audit`: admin-only, organization-filtered in-memory audit events.
- Unknown routes are 404; all non-GET requests remain 405.

Audit events are **in-memory and lost on restart**; they are not tamper-proof and must not be used as compliance records. Token secrets must be kept outside source control and logs. Before deployment, replace development tokens with a proper identity provider, implement durable append-only audit storage and policy-driven approvals, and conduct security tests.

## Optional read-only snapshot and durable local audit prototype

The CLI can now load a deliberately prepared **sanitized** snapshot from an absolute or relative JSON file path via `MANA_AI_PROJECT_SNAPSHOT`. See `examples/projects.snapshot.example.json` for schema version 1. It only accepts `id`, `orgId` and `name`; extra fields are discarded. It does not automatically read, scrape, export or migrate legacy `localStorage` data.

For a local append-only audit log, set `MANA_AI_AUDIT_FILE` to an **absolute path** in an existing private directory. The file is created with mode 0600, appended with fsync, and a SHA-256 hash chain is checked at startup. The audit file can be read by an administrator using the local `GET /v1/audit` endpoint. Example:

```sh
MANA_AI_TOKEN='replace-with-a-unique-secret-of-32-plus-characters' \
MANA_AI_PROJECT_SNAPSHOT='./examples/projects.snapshot.example.json' \
MANA_AI_AUDIT_FILE='/absolute/private/path/audit.jsonl' npm start
```

**Limitations:** This is still **not** a central database or a secure production audit system. The local audit file has no file locking, cross-process coordination, external anchoring, rotation, encryption, or tamper-proof storage; do not run multiple service processes against the same file. If a write or fsync fails, manual intervention is required. A PostgreSQL-backed multi-tenant store, migrations, transaction-safe append-only audit, backups, identity provider and tested authorization must precede production use. The existing Mana UI is **not yet connected**.

## Integration plan

1. Obtain explicit approval and a tested backup of legacy project data.
2. Implement a consent-driven, validated export from the legacy app; never silently extract browser data.
3. Define an authenticated, organization-scoped import and reversible migration with audit evidence.
4. Use PostgreSQL transactions, schema constraints and row-level isolation for production persistence.
5. Add a read-only AI tool interface with redaction and citations, then human-approved write actions.
