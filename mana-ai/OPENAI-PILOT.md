# Mana AI: opt-in powerful cloud model pilot

Status: adapter implemented; **not deployed or end-to-end verified**. Requires your own OpenAI API key, API credit and access to a chat-completions-compatible model. ChatGPT subscription does not provide API credits.

This pilot is for **general non-confidential questions only**. It refuses external model activation when project or document snapshots are configured. Do not enter customer, employee, contract, financial, or proprietary project data.

Set secrets in a private server environment (never in GitHub, browser, screenshots or messages). Example (replace placeholders locally):

```sh
cd mana-ai
export MANA_AI_TOKEN='<unique-long-random-secret-at-least-32-characters>'
export MANA_AI_OPENAI_API_KEY='<your-secret-api-key>'
export MANA_AI_MODEL='<model-id-confirmed-available-to-your-api-account>'
npm start
```

In another local terminal with the same `MANA_AI_TOKEN` set:

```sh
node dev-chat.cjs
```

Keep the API service bound to loopback. There is no public mobile chat UI yet. Costs depend on the selected model and usage. Never expose the development bearer token on the public internet.

Before enabling any company data: design explicit data-transfer consent, per-user authorization, scoped retrieval, data minimization, redaction, retention controls, audit, rate limits, budgets, secure identity and independent backups.
