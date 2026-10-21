# Mana conversation API — optional server integration

The local chat server now accepts optional `conversationStore` and `authenticate` arguments in `start({...})`. **Both are required together**; if absent, the conversation endpoints remain disabled. When supplied, `GET /api/conversations/:id` and `POST /api/conversations/:id` are delegated to the scoped API handler.

Example for a host application with a **real** authenticated principal:
```js
const {start}=require('./mana-ai/local-chat-ui.cjs');
const {createConversationStore}=require('./mana-ai/src/encrypted-conversations.cjs');
const store=createConversationStore({directory:'/secure/mana/conversations',key:secretKeyBuffer});
start({provider,model,conversationStore:store,authenticate:trustedIdentityMiddleware});
```

Do not use a dummy identity callback or trust identity headers supplied by browsers. This development server still binds to loopback and has other unauthenticated experimental endpoints. Do not expose it directly on the network.

The mobile UI has not yet been connected to these endpoints, and the module does not implement a login flow. Cross-device sync needs a trusted authentication gateway, verified organization membership, secure device sessions and consistent conversation IDs. End-to-end tests with real credentials and encrypted storage have not been run.

Test:
```sh
node --test mana-ai/tests/conversation-server-integration.test.cjs
```
