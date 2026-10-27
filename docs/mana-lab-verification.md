# Consolidated lab verification

Run `node mana-ai/verify-lab.cjs /absolute/new/report-directory` to collect
the complete Node regression suite, Python training regressions, a resource
scheduling example and sandbox preflight in one private report directory.
Python 3.12 with the pinned NumPy dependency and Node 24 must be available.
An existing output directory is refused to preserve prior evidence.

Add `--sandbox` to run real OS sandbox acceptance instead of preflight.
This executes authored acceptance fixtures inside the isolated sandbox. It does
not generate candidates, train weights, contact a model provider, promote code,
change a service or delete a checkpoint.

Each fixed command has a three-minute timeout and four-MiB output bound.
Checks continue after failure so one report shows all observed blockers.
Logs have SHA-256 digests; the JSON report records exit status and whether real
sandbox acceptance was requested. These are local evidence files, not signed
attestations. Preserve the source revision and archive checksum alongside them.

`LAB_CHECKS_PASSED` covers only the selected lab checks. A successful preflight
is not real sandbox acceptance. Neither outcome establishes master-plan
completion, general coding competence or production deployment permission.
An unavailable sandbox returns an incomplete report and a nonzero CLI exit;
there is no fallback to executing candidate code outside isolation.
