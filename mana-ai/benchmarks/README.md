# Synthetic Persian CPU/GPU intent benchmark

Standalone Node >=20 harness, prepared at repository base `28d330cc920fb374e92651b46f8b9af86f194a3a`. No dependency installation. No model, weights, server connection or GPU activation included. All prompts are synthetic and fixed. Model responses are parsed as JSON, never executed. This does not measure Jarvis task execution, architectural quality, or voice quality.

## Harness check (no model)

```sh
node --test mana-ai/benchmarks/persian-intent.test.cjs
```

Four mock-only tests verify URL restriction, scoring, receipt/comparison and failed HTTP. Mock successes are not model evidence.

## Real comparison, only when server use has been authorized

1. Use an already downloaded identical GGUF and the same CUDA-capable llama-server executable for both runs. CPU mode must have zero GPU layers; GPU mode changes only GPU offload. Do not download models or alter running production service as a side effect of this harness. Use a dedicated loopback endpoint.
2. Copy `config.example.json` to separate CPU and GPU configs. Fill exact local weight and runtime paths, served model ID and actual launch settings (template, context, threads, parallelism, batch/cache settings and other flags). The `device` value is an operator label, NOT GPU detection. Do not place passwords/secrets in config. Identical JSON runtimeConfig values and ordering required; record GPU offload and hardware in separate launch logs. SHA-256 hashes are calculated from local weight and executable bytes. Those hashes do not prove the server actually loaded those files: preserve server startup logs/model metadata and hardware evidence separately.
3. Run CPU and GPU sequentially against independently restarted, otherwise idle dedicated servers with those exact settings. A restart and absence of previous inference must be operator-verified; mark `serverRestartAttested` only when true. The harness never starts/stops services. Check server accepts seed/temperature/top_p/max_tokens and does not ignore them. Same seed does not guarantee bit-identical CPU/GPU generations.

```sh
node mana-ai/benchmarks/persian-intent.cjs run cpu-config.json cpu-receipt.json
node mana-ai/benchmarks/persian-intent.cjs run gpu-config.json gpu-receipt.json
node mana-ai/benchmarks/persian-intent.cjs compare cpu-receipt.json gpu-receipt.json
```

Receipt paths must be new; the harness refuses overwrite. 8 cases x 3 rounds = 24 requests per run, no retries; each timeout defaults to 60 seconds. Default worst-case 24 minutes per run. Only literal IPv4/IPv6 loopback HTTP and the exact chat-completions route are allowed; redirects fail. Response cap 256 KiB. No external API calls or tools.

## Interpret honestly

- First-pass per-case latency, first-request latency and warm latencies are retained separately. **First-request latency is NOT model loading/startup time or proven cold-cache latency.** Actual cold startup/load timing must come from server launch logs, since this client attaches to an already running endpoint. Even restarted server may have warm OS file caches; do not drop system caches for this benchmark.
- Semantic exact-match accuracy is separate from JSON validity. Correct width/length, intent and approval flag required; extra keys/prose rejected. This fixed miniature taxonomy is a benchmark contract, not the full native product policy.
- Warm latency excludes HTTP/parse failures; error count and accuracy retain them. Evaluate correctness before comparing speed. Small samples are diagnostic, not statistical proof.
- Receipt comparison refuses different model bytes, executable, model ID, settings, launch config or suite. CPU/GPU labels and runtime configuration are attestations; current harness cannot independently prove execution hardware. A pass never authorizes production or activates a capability.
- Actual Persian ASR/TTS weights, audio/device compatibility and voice latency remain separate unverified work. No voice benchmark is claimed here.

## Infrastructure is deliberately outside this harness

No llama-server installation or launch command is supplied here. Select supported flags from the installed runtime's own help/official documentation during separately authorized infrastructure setup. The config fields are recorded experiment metadata, not executable CLI flags, and this harness does not apply them.

A real comparison report must attach sanitized startup logs for EACH run showing the actual loaded model path/identity and quantization, runtime build, effective seed/sampling/context/template/threads/batch/parallel/cache settings, and CPU versus actual GPU layer offload/device. Include CPU hardware and GPU model/driver evidence; mere `nvidia-smi` presence does not prove inference offload. Record unsupported/ignored settings and do not claim a controlled like-for-like comparison if relevant settings differ. Use identical quantization/weights and seed/threads wherever supported, changing only execution device/offload. Record server start-to-ready/model-load duration separately from these client inference timings; label absent cold-load evidence as not measured. Save logs separately and do not upload secrets.
