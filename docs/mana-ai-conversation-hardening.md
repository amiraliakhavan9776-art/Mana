# Conversation and session hardening

Date: 2026-10-26. Parent revision: 14602d32d08c50990e45860f9457dc188144817e.

## Reproduced defect
The MANA1 conversation format encrypted messages but did not authenticate the organization/user/conversation identity. An adversary able to move valid encrypted files could transplant data into another scope while using the same host key.
A negative regression failed with Missing expected rejection before the correction and passes with MANA2 scope-authenticated additional data.
This finding concerns the encrypted persistence boundary; no claim is made that a remote attacker had filesystem access.

## Corrections
- Scope-authenticated MANA2 encryption, input snapshots, regular-file and size/schema checks.
- Per-record writer locks across cooperating stores plus durable atomic writes.
- Explicit, manifest-bound MANA1 conversion that preserves old bytes on failure. Normal reads/writes do not silently convert legacy records.
- API regression rejects transplanted ciphertext without disclosing its contents or replacing it.
- Bounded session population, expiry reclamation without eviction of active sessions, immutable account configuration, strict identifiers and validated consistent expiry.

## Evidence and operational impact
143 local Node tests pass, with zero failures/skips:
`node --test --test-reporter=tap tests/*.test.cjs mana-ai/tests/*.test.cjs`.
The existing four Chromium tests remain a separate CI suite; check latest workflow evidence.
This change requires explicit migration before a prior MANA1 conversation file can be read. See [format and recovery instructions](../mana-ai/ENCRYPTED-CONVERSATIONS.md). No live file conversion, production deployment or merge was performed.

Authenticated encryption does not prevent restoring an older valid file within the same scope. Independent version/audit evidence, production identity, distributed storage and full release gates remain separate requirements.
