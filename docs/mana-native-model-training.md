# MANA-owned model training: initial research baseline

This is a real small neural training pipeline from random weights, not Gemma fine-tuning, a renamed external model, or completion of the master plan. It does not supply a competent coding assistant. MANA's deterministic planning/runtime/control code and an independently trained language model are different deliverables; neither proves the other complete.

## Implemented and actually run

`mana-ai/training/mana_byte_rnn.py` implements a UTF-8 byte recurrent language model with explicit NumPy forward pass, backpropagation through time and AdaGrad updates. No model-provider call, pretrained tokenizer, downloaded weights, pickle loading or execution of generated text occurs. The model vocabulary is 256 byte values plus a record boundary. It can emit arbitrary UTF-8 byte sequences; invalid sequences are replaced for display. This simple RNN is a training/recovery baseline, not a proposed final architecture for a powerful programmer.

The local experiment uses 64 hidden units, 37,313 trainable parameters, sequence length 64 and 1,000 optimization steps. The included corpus has 36 authored synthetic request/code records across twelve task families; variants sharing the same answer stay in the same family. This tiny corpus is sufficient to exercise training, not to learn general programming. Exact task-family splits and source declarations are recorded in each checkpoint; the code rejects absent training permission declarations, duplicate IDs and exact cross-family answer duplication. Declarations are not independent license/legal verification; near duplicates and semantic leakage require a separate corpus audit. No company files, customer records, existing server private code or unrelated conversations were ingested.

Seven-tenths of sorted-by-hash task groups are training, a further fifteen percent validation, the rest test. The held-out test families are not measured inside training or used as repair feedback. Validation reports are bounded token cross-entropy, NOT functional correctness, pass@k, instruction following, Persian quality or commercial readiness. Training covers the serialized request/code text and does not implement code-only loss masking or modern long-context instruction tuning.

Local experiment results are in `docs/generated/native-training-evidence.json`. Validation loss improved initially, then regressed slightly; the lowest measured validation checkpoint at step 500 differs from the final step 1000. This is evidence against equating longer training with a better model. Checkpoint promotion remains absent. No generated answer has passed an independent coding benchmark.

## Recovery and integrity

Checkpoints contain numeric arrays, optimizer accumulators, RNG state, source fingerprint, dataset digest and split, configuration and metrics. Weights are loaded with `allow_pickle=False`, finite/shape/type checks and a SHA-256 match. A changed training source, dataset or resume configuration stops. The output directory is private, and a lock denies concurrent training; an interrupted process may leave a stale lock that needs operator inspection. Temp checkpoint directories are never selected automatically. Checkpoints are immutable step directories; disk-full/checkpoint failure stops rather than claiming success. This is local integrity, not independently anchored provenance or hostile-owner protection.

Tests compare analytical gradients with finite differences for recurrent/input/output weights and biases, prove real weight updates, and check that split training plus resume is array-for-array equal to a continuous run with identical configuration. Other tests reject rights omissions, duplicate evaluation answers, corrupted weights, changed resume configuration, broad directory permissions and concurrent workers.

## Running

Python 3.12 and NumPy 2.3.5 are the verified environment; dependency is pinned in `mana-ai/training/requirements.txt`. No PyTorch, GPU, internet or model service is required after NumPy is available. The full dependency wheel/license and trained numeric checkpoint can be transferred in the research handoff separately from public repository code.

```
OPENBLAS_NUM_THREADS=1 python3 mana-ai/training/mana_byte_rnn.py train \
  --corpus mana-ai/training/research-corpus.jsonl \
  --output /absolute/private/training-run --hidden 64 --steps 1000
```

Continue a run using exactly the saved hidden/sequence/learning-rate/seed settings and `--resume /absolute/private/training-run/step-00001000`. `--steps` means additional steps. Generated text is unverified and is never a script to run.

## Next prerequisites for a useful MANA coding model

Read-only hardware inventory, a suitable architecture/resource budget, much larger authorized code/instruction corpora, independent task-family/project held-out functional benchmarks, tokenizer/context evaluation, and reproducible training experiments are required. Hardware and budget determine the feasible scale; no GPU purchase or equivalence to a frontier model is assumed. Commercial rights and license policy need actual source evidence. Model outputs still need the coding agent's sandbox, independent tests, permission and release/rollback controls. A small RNN loss reduction does not satisfy any of those acceptance gates.
