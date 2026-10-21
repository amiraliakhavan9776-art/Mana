# Mana legacy application — initial source audit

Scope: static inspection of the repository's root `index.html`; no browser execution, production data inspection, or integration tests performed.

## Confirmed observations

- Persian RTL HTML entry point with responsive styles.
- One large HTML file (~664,258 characters at the reviewed revision) with 32 inline `<script>` blocks and no external script tags.
- Project, contracts, invoices, petty cash, cash flow, CPM scheduling, approval-related code and other business modules.
- Local browser persistence via `LS_KEY = 'mana.db.v2'`, `loadDB()`, and `save()`; save serializes `DB` to `localStorage`.
- `loadDB()` falls back to seeded demonstration data on missing storage or parse errors.
- Existing invoice migration code sets missing statuses to `approved`; this needs a reviewed migration policy before centralizing data.
- Existing code reassigns some functions and route renderers later in the file, making change impact difficult to predict.

## Risks and next engineering controls

1. **Data loss / device isolation:** export and verify a restorable backup before migration; do not assume localStorage is a reliable multi-user database.
2. **Approval integrity:** the browser currently contains approval-related actions. Production approvals require authenticated server-side authorization, role checks, and immutable audit evidence.
3. **Migration ambiguity:** do not automatically translate legacy invoice status into final legal/financial approval without business sign-off.
4. **Regression risk:** preserve the existing HTML and run baseline checks; follow with browser-level tests and representative data fixtures.
5. **Privacy:** never upload live contracts, personal records, financial documents or credentials into test fixtures.
6. **Concurrency:** central data persistence needs version checks, transactions, idempotent writes and conflict handling.
7. **AI safety:** AI access starts read-only; all consequential actions require a verified approval policy.

## Baseline tests

Run `node --test tests/*.test.cjs` from repository root (Node.js 20+ recommended). Tests are static source checks, **not** proof that UI or workflows function. No dependencies or installation required.

## Proposed next milestone

Build a minimal standalone API skeleton with authenticated read-only endpoints and tests, without wiring the legacy application or changing its storage behavior. Define API contracts and RBAC first.
