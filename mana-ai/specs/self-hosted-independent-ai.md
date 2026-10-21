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
