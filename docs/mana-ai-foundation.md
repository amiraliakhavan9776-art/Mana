# Mana AI — Foundation and architecture

Status: initial architecture proposal; no production AI integration yet.

## Existing application

The current repository contains a large Persian RTL browser application in `index.html` (approximately 664k characters). It includes project management, schedules/Gantt, contracts, invoices/progress claims, approval actions, and browser-side persistence. The file includes successive function overrides; changing it directly before regression testing is risky.

## Architecture principles

1. Preserve the existing application and `main` branch. Develop on feature branches and merge only after human review.
2. Separate the browser UI, API gateway, AI orchestration, domain modules, persistence, and integration adapters.
3. AI-led automation is permissioned: role-based access, audit trails, explicit approval for consequential actions, and licensed sign-off for regulated or safety-critical outputs.
4. Design the Strategy Architect for any profession or industry. Construction is the first deployment, not a hard-coded constraint.
5. Self-hosting and integration with the existing desktop/web Mana system are deployment requirements.
6. Treat user-provided documents, external sources, and model outputs as untrusted. Validate inputs and outputs and protect credentials server-side.

## Proposed components

- **API and identity:** authentication, authorization, organization/project tenancy, approvals and audit logs.
- **AI orchestration:** tool registry, task plans, human approval gates, provenance and execution logs.
- **Strategy Architect:** profession interview, industry-specific frameworks, objectives, KPIs, scenarios, resource plans, execution monitoring.
- **Construction adapters:** progress claims, site evidence, contracts, change orders, schedules, costs, procurement and technical office.
- **Company OS:** cross-department workflows and exception handling.
- **Intelligence modules:** Reality Check, Contract Intelligence, Risk Sentinel, Partner Intelligence, Meeting Intelligence, Regulatory Intelligence, Executive Audit, Mana Academy and Integration Studio.
- **Design pipeline (future phases):** phase 0 site studies, phase 1 concepts, phase 2 construction documentation; editable CAD/BIM outputs require dedicated tools and professional validation.

## Implementation stages

1. Inventory repository assets and data models; document workflows, persistence and external dependencies.
2. Add baseline regression tests and secure backup/export migration tests without changing existing user data.
3. Define versioned API contracts and RBAC/audit/approval schemas.
4. Implement a minimal self-hostable service skeleton with health checks, configuration and tests.
5. Connect a read-only AI assistant to approved project data; verify provenance and data isolation.
6. Add controlled write workflows with explicit approvals, idempotency, rollback and audit logs.
7. Implement Strategy Architect and construction-specific adapters incrementally.
8. Add desktop/web integration, operational observability and deployment hardening.

## Acceptance gates

- No changes to `main` until the owner reviews and merges a PR.
- No autonomous consequential write without required authorization and approval.
- Existing project data remains readable; migrations are reversible and tested.
- No claims of working CAD/BIM generation without integration tests and editable artifact verification.
- Security, regression and domain tests pass before production rollout.

## Current change scope

This foundation commit adds documentation only. It does not modify `index.html`, install dependencies, alter user data, or enable any AI execution. Further implementation requires staged code review and tests.
