'use strict';
// Local developer chat only. Never expose the development token in browser code.
const readline = require('node:readline');
const token = process.env.MANA_AI_TOKEN;
const endpoint = process.env.MANA_AI_CHAT_URL || 'http://127.0.0.1:8787/v1/ai/ask';
if (!token || token.length < 32) {
  console.error('Set MANA_AI_TOKEN to the same 32+ character secret used by the local server.');
  process.exitCode = 1;
} else {
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.pathname !== '/v1/ai/ask' || url.search || url.hash) {
    console.error('Chat endpoint must be a local loopback /v1/ai/ask URL.');
    process.exitCode = 1;
  } else {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'شما > ' });
    console.log('Mana AI — local development chat. Type /exit to quit. No conversation history is persisted.');
    rl.prompt();
    rl.on('line', async line => {
      const question = line.trim();
      if (question === '/exit') return rl.close();
      if (!question) return rl.prompt();
      rl.pause();
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ question }),
          signal: AbortSignal.timeout(30000)
        });
        const data = await response.json();
        if (!response.ok) console.log('خطا:', data.error || response.status);
        else console.log('مانا >', data.answer || data.response || JSON.stringify(data));
      } catch (err) {
        console.log('خطای اتصال:', err.message);
      } finally {
        rl.resume();
        rl.prompt();
      }
    });
  }
}
