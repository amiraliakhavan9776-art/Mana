# Mana AI — local Persian web chat pilot

This prototype serves a Persian chat UI and profession-planning form on **127.0.0.1 only**. It uses an already-running local OpenAI-compatible inference server. It does not depend on an OpenAI cloud API, but **no model weights or GPU have been installed by this commit**.

Requirements: Node.js 20+ and a locally installed model/runtime exposing `/v1/chat/completions` on loopback. Run from repository root:

```sh
export MANA_AI_LOCAL_PROVIDER_URL='http://127.0.0.1:1234/'
export MANA_AI_MODEL='<installed-local-model-id>'
node mana-ai/local-chat-ui.cjs
```

Open `http://127.0.0.1:8790` on the same computer. This UI has no production authentication, no chat history, no company integrations and no external access; **do not expose the port publicly or enter confidential company data**.

Run smoke test without a model:
```sh
node --test mana-ai/tests/local-chat-ui.test.cjs
```

The smoke test uses a fake provider and is not evidence of model quality. Next: install a properly licensed local model on a suitable GPU host, evaluate Persian performance, add authentication and a private secure deployment before real data or mobile access.
