# Mana AI — first authenticated local pilot

This is a **loopback-only development pilot**, not production deployment. It needs Node.js 20+, a locally running OpenAI-compatible model server, and secret files stored outside the repository.

1. Create a 32-byte encryption key file in a private directory: `node -e "require('node:fs').writeFileSync('/absolute/private/key.bin',require('node:crypto').randomBytes(32),{mode:0o600})"`. Keep secure backups; loss of this key means loss of readable conversation history.
2. Create a password record locally: `node -e "console.log(require('./mana-ai/src/session-auth.cjs').passwordRecord('replace-with-a-strong-password'))"`. Do not use the example password. Store an accounts JSON file outside the repo containing an array of objects with `userId`, `organizationId`, `salt`, and `digest`. Protect it with owner-only file permissions.
3. Install and start a compatible local inference server with **pre-downloaded, licensed model weights**. Verify its OpenAI-compatible chat endpoint independently. This project does not download or install any model automatically.
4. Configure absolute file paths and local model details:
   ```sh
   export MANA_AI_ACCOUNTS_FILE=/absolute/private/accounts.json
   export MANA_AI_KEY_FILE=/absolute/private/key.bin
   export MANA_AI_CONVERSATION_DIR=/absolute/private/conversations
   export MANA_AI_LOCAL_PROVIDER_URL=http://127.0.0.1:1234/v1
   export MANA_AI_MODEL=your-installed-model-id
   node mana-ai/secure-pilot.cjs
   ```
5. Open `http://127.0.0.1:8790/mobile` **on the same computer**, sign in, send a message, and use the conversation history button. Restarting the server invalidates sessions but encrypted messages remain if the key and directory are retained.

**Do not expose port 8790 on public or LAN interfaces.** Before phone testing, build a properly secured HTTPS gateway or VPN with authenticated access, origin policy, network rate limits, and audited authorization. The development server's origin policy is fixed to loopback and does not currently support remote browser access. No mobile deployment or real GPU test has been performed.

Run automated checks: `node --test mana-ai/tests/*.test.cjs`. GitHub Actions also runs these checks on commits.
