# Actual trained-model coding evaluation

This increment connects MANA's random-initialized byte-RNN checkpoint to the independent Python OS sandbox, without Gemma, another pretrained model, a syntax-only success or execution in the trainer process. It measures a small model's current limitations rather than claiming that a lower text loss is working code.

`training/evaluate_native_code.py` verifies checkpoint integrity/source fingerprint and exact corpus provenance, loads a versioned host-authored benchmark, and requires coverage of every test-family in that checkpoint's split. Training or validation families cannot be substituted as held-out coding tests. The initial research corpus has three held-out families: unique items preserving order, integer clamping and parity. These are tiny public tasks, not broad coding acceptance or a secret industry benchmark.

Only each task's natural-language request enters generation. Function names are stated in the request. Reference code, evaluation inputs and expected outputs do not enter the generation call. There is one generated candidate per task, bounded to 500 sampled bytes by default (maximum 1000). Seeds, checkpoint/benchmark/corpus digests, candidate hashes and actual per-case results are retained. No markdown extraction, template insertion, external-model fallback, answer copying, generated-test substitution or automatic repair of this held-out test set is performed. Invalid Python, missing functions, wrong results, exceptions, forbidden operations, malformed output and timeouts fail cases.

The evaluator writes a candidate and a separate trusted benchmark file into a new private output directory. `evaluate-code-file.cjs` passes only the copied candidate into a fresh namespace, using the previously accepted read-only/capability/seccomp/resource policy. Test inputs reach the function one at a time; expected outputs remain in the host verifier. The trainer never imports or executes generated text. Sandbox absence stops as `EVALUATION_BLOCKED_SANDBOX`, with no complete score. A complete zero score is a real failed model measurement, not an installation failure. Even three perfect tasks leave `general_coding_acceptance:false` because the suite is narrow.

`evaluation.json` is an immutable local report; checkpoint weights and the source project are unchanged. Each invocation needs a new output directory. Interrupted candidates remain private evidence and no automatic resumed score is invented. A stale evaluation lock needs operator inspection. Report integrity uses host-owned files and digests; it is not independent audit anchoring or protection from a malicious workspace owner.

## Run

```
OPENBLAS_NUM_THREADS=1 python3 mana-ai/training/evaluate_native_code.py \
  --checkpoint /absolute/step-00001100 \
  --corpus mana-ai/training/research-corpus.jsonl \
  --benchmark mana-ai/training/native-code-benchmark.json \
  --output /absolute/new-private-evaluation
```

Python/NumPy runs on the host solely for model math; Node and the real OS sandbox perform candidate execution. The combined offline release wraps NumPy extraction and selects the already-installed Node 24. The user's confirmed checkpoint at `/opt/mana-engine-lab/native-training/run.LULFtw/step-00001100` can be evaluated without retraining it or resetting progress.

## Verification and next model work

Unit tests check held-out family exclusion/coverage, model-context isolation with an explicitly labelled fixture, failed-result counts and unavailable-sandbox semantics. Existing gradient, exact resume, feedback, engine and sandbox tests remain required. The real sandbox acceptance command additionally runs every benchmark's independently authored reference implementation to establish a passing baseline. CI trains a fresh 64-hidden-unit MANA model for 1000 steps and measures its actual generated output through the real sandbox; this result is distinct from measurement of the user's 1100-step checkpoint. No score for the user's model is inferred from CI or text loss.

Do not optimize training based on these test answers while continuing to call them unseen. Future development needs authorized larger corpora, proper validation for model selection, separate new held-out coding families and architecture/tokenizer/context experiments under a measured CPU/GPU budget. Repeatedly training the same 36 synthetic records cannot establish a general coding assistant. Model upgrades and autonomous engine changes still require independent functional benchmarks, scoped identity, review, promotion and rollback.
