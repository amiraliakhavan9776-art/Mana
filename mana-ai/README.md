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

## Mana AI Engine v0 (opt-in, general questions only)

The first AI engine adapter is implemented, but **disabled by default**. It can connect to a locally running OpenAI-compatible chat completions endpoint (for example, a local model server). No provider, model weights, cloud API or model installation is bundled.

Configure `MANA_AI_LOCAL_PROVIDER_URL` (loopback HTTP root URL only, such as `http://127.0.0.1:11434/`) and `MANA_AI_MODEL` (a model already installed on that provider), plus the existing `MANA_AI_TOKEN`. Restart the service.

```sh
curl -X POST http://127.0.0.1:8787/v1/ai/ask \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_SECRET' \
  -d '{"question":"Explain the purpose of a project schedule."}'
```

The endpoint requires authentication and a read permission; requests are limited to a single `question` field. It does not receive project data, search files, use tools, execute changes, remember conversations or provide RAG. The model may hallucinate. Do not submit secrets or real company information until a privacy and access review is complete. The adapter currently supports **only** local loopback providers and is not production hardened (including rate limits, full request lifecycle controls and structured model governance).

## Opt-in project context (prototype)

`POST /v1/ai/ask` also accepts an optional `projectId` alongside `question`. The engine resolves the ID **server-side** from the explicitly loaded, sanitized snapshot, checks the authenticated principal's `orgId`, and sends only the matching project's `id` and `name` to the configured local model. Other organizations' project metadata is never included in the prompt. A missing or unauthorized project is rejected without calling the model.

Example: `{"question":"What is the project name?","projectId":"sample_project"}`.

This is **not RAG**, semantic retrieval, durable conversation memory, or a live connection to the legacy Mana app. It is a controlled context proof of concept. Project names can still be sensitive: do not use real customer data until explicit approval, data classification, and provider privacy review. The model output is not guaranteed to be correct.

## Read-only lexical retrieval prototype

Set `MANA_AI_DOCUMENT_SNAPSHOT` to a locally prepared, sanitized JSON snapshot in the format of `examples/documents.snapshot.example.json`. A project snapshot must also be configured, and the local model provider must be enabled. This is **opt-in**, and no files are ingested automatically.

For `POST /v1/ai/ask` with `{"question":"Monday schedule","projectId":"sample_project"}`, the service checks the caller's organization and authorized project, then ranks only matching documents from that project using simple word overlap. At most three short excerpts are passed to the local model. The API returns document IDs and titles in `sources`, but does not verify that the model actually used or cited them. Retrieved content is untrusted and may contain prompt-injection attempts.

**Not yet implemented:** embeddings/vector search, document-level ACLs, ingestion pipeline, live data sync, durable conversational memory, verified answer citations, model installation, production controls. Do not load real contracts, invoices or customer data yet.

## Opt-in bounded conversation memory

Supply an optional `sessionId` (1–64 ASCII letters, digits, underscores or hyphens) **together with an authorized `projectId`** in `POST /v1/ai/ask`. The service stores up to six question/answer turns in process memory, isolated by organization, authenticated user, project and session ID. Previous turns are sent to the local model on subsequent calls using the same scope. Without a session ID, questions remain stateless. Sessions are lost on restart; no persistence, expiry, encrypted storage, user-facing deletion API, or conversation governance is provided yet. Avoid sensitive information.

This is **not semantic RAG**: document matching remains lexical, and retrieved source IDs are candidates rather than verified answer citations. The existing service is a local development prototype and must not be deployed with real customer data.

## Autonomous research design (not yet connected)

`src/research.cjs` provides a pluggable public-information search interface. External lookup requires an explicit `publicOnly: true` flag, limits query length and results, and returns HTTPS source links marked unverified. The interface intentionally has **no built-in web provider, automatic query routing, browser access, background search, or permission to transmit private project information**. Tests use a mock search function. A later integration must add an approved provider, query classification/redaction, user/organization permissions, source verification, rate limits, cost limits, and audit before enabling automatic internet searches.

## Security governance prototype

`src/governance.cjs` defines an explicit allowlist of action names and a fail-closed decision helper. High-risk actions (payments, signatures, deletion, safety sign-off, permission changes and secret exports) are **always denied** in foundation mode; the helper does not execute tools or issue real approval tokens. Public research requires an explicit approval flag. See `tests/governance.test.cjs` and `docs/mana-ai-target-architecture.md` for the planned broader security architecture. This is not a production policy engine, and not yet wired into all routes or agent connectors.
