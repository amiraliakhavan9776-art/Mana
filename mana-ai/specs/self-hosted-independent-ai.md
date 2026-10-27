# Mana AI — Self-hosted independence requirement

Decision: the default and required production architecture must function **without OpenAI or other foreign hosted inference APIs**. Any cloud adapter remains opt-in development-only, disabled by default, and is not a deployment dependency.

## Architecture
- Mana web/desktop/mobile clients connect to Mana-controlled application server and project database.
- A separate GPU inference host under the operator's control serves a locally installed model through a private, authenticated network endpoint.
- Existing local OpenAI-compatible adapter is a prototype and currently only accepts loopback; production networking must be designed and audited before enabling remote GPU.
- Select downloadable/open-weight models based on Persian conversation, reasoning, document processing, hardware capacity, licensing and quality tests.
- Run document extraction, retrieval, speech and vision locally wherever feasible; CAD generation and takeoff are deterministic tools under the same governance.
- No external data transmission without explicit opt-in, contract/policy review and granular authorization.
- Independent encrypted backups, model/artifact checksums, least-privilege accounts, audited actions, firewall, TLS, VPN, monitoring and incident response.
- High-impact actions and construction documents require authorized human review and sign-off.

## Capacity and limitations
- A 4-vCPU / 8-GB RAM VM is suitable for initial application/API development but not a high-capability large-model inference server.
- Choose GPU memory after benchmarking candidate models and concurrent load; avoid committing to a hardware price or specific model before tests.
- Initial installation may require obtaining model weights and software; plan an offline-capable operational path afterward.

## Acceptance
1. Demonstrate Persian chat with external inference disabled.
2. Demonstrate document and project access isolation with no egress.
3. Demonstrate controlled CAD/takeoff pilot and audit events.
4. Test recovery, model restart, latency, and concurrent users.
5. Document limitations against target quality, with no false equivalence to ChatGPT.

## Mandatory Iran-local operation (approved)

- The application server, primary database, inference GPU, document processing, CAD/takeoff engines, user authentication, internal DNS/time dependencies, and backups required for day-to-day operation must all be reachable within Iran when international connectivity is unavailable.
- Pre-download and locally retain licensed model weights, tokenizers, runtimes, container images, operating-system packages and other required artifacts; do not depend on foreign registries, remote authentication, foreign license checks or cloud APIs at runtime.
- Keep local network paths, private service discovery, certificates, monitoring, logs, queues, and scheduled supervisor reporting operational without international egress.
- Separate optional internet-connected features from core workflows; degrade gracefully and clearly mark unavailable external integrations.
- Test by deliberately blocking international egress in a controlled staging environment: Persian chat, document retrieval, project authorization, supervisor reporting, CAD/takeoff, approval workflows, backups and recovery.
- Iran-local placement alone does not guarantee availability: power, local provider/network outages, hardware failures and domestic connectivity must be covered by recovery plans.
- Treat this as a requirement and acceptance criterion, **not as an implemented or tested feature**.

## Optional future overseas GPU (approved direction, conditional purchase)
- Retain Iran-local inference as the default and always-available core; overseas GPU is optional acceleration/quality tier, not a dependency.
- Route requests via explicit policy: classification, user/org authorization, data residency, provider jurisdiction and consent before remote processing.
- Sensitive company financial, contracts, cameras, personnel and confidential project documents remain local by default. No silent cross-border transfer or replication.
- Support opt-in external inference only where lawful, authorized and technically secure; use data minimization and redaction.
- On overseas connectivity failure, fail over to local inference for supported tasks, disclose reduced capabilities and queue nonessential heavy jobs without leaking data.
- No foreign hosted AI API is required; an overseas operator-controlled GPU may run self-hosted model weights.
- Benchmark model quality, GPU VRAM, throughput, latency, recurring costs, security and operational complexity before any purchase.
- This is a future architecture requirement, not an implemented routing or failover feature.
