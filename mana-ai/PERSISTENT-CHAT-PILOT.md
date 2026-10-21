# Mana AI — authenticated persistent chat pilot

The local server now includes an optional POST /api/chat/:conversationId route when sessionAuth and conversationStore are configured. The route checks the bearer session and CSRF proof, loads recent conversation history, calls the local model, and appends the user turn and assistant response to the scoped store. The Persian mobile UI uses this route after login and can load history through GET /api/conversations/:conversationId.

This is not yet a production deployment or verified cross-device synchronization. The CLI still does not configure accounts or storage. The server's legacy /api/ask and voice routes remain unauthenticated. Do not expose it on the public network or submit confidential business data.

Before production: execute tests, add login rate limiting, secure HTTPS access, identity administration, durable encrypted key management, atomic two-message transactions, per-conversation concurrency control, and full mobile/desktop end-to-end testing.
