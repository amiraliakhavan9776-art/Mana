'use strict';
const readline = require('node:readline/promises');
const { stdin, stdout, stderr } = require('node:process');

function chatConfig(env = process.env) {
  const token = env.MANA_AI_TOKEN;
  if (typeof token !== 'string' || token.length < 32) throw new Error('MANA_AI_TOKEN must be at least 32 characters');
  const baseUrl = env.MANA_AI_CHAT_URL || 'http://127.0.0.1:8787';
  const url = new URL(baseUrl);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Chat service must use local HTTP');
  const projectId = env.MANA_AI_CHAT_PROJECT_ID;
  if (projectId !== undefined && !/^[A-Za-z0-9_-]{1,64}$/.test(projectId)) throw new Error('Invalid project ID');
  return { token, baseUrl, projectId };
}
async function sendChat({ token, baseUrl, projectId }, question, fetchImpl = fetch) {
  if (typeof question !== 'string' || !question.trim() || question.length > 4000) throw new Error('Question must be 1-4000 characters');
  const body = { question: question.trim() };
  if (projectId) {
    body.projectId = projectId;
    body.sessionId = 'local-chat';
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetchImpl(new URL('/v1/ai/ask', baseUrl), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) throw new Error('Mana AI service returned HTTP ' + response.status);
    const answer = await response.json();
    if (typeof answer?.answer !== 'string') throw new Error('AI model is not configured or returned an invalid response');
    return answer.answer;
  } finally { clearTimeout(timeout); }
}
async function main() {
  const config = chatConfig();
  const rl = readline.createInterface({ input: stdin, output: stdout });
  stdout.write('Mana AI local chat. Type /exit to quit. Do not enter sensitive data.\n');
  try {
    while (true) {
      const question = await rl.question('You: ');
      if (question.trim() === '/exit') break;
      if (!question.trim()) continue;
      try { stdout.write('Mana: ' + await sendChat(config, question) + '\n'); }
      catch (err) { stderr.write('Chat error: ' + err.message + '\n'); }
    }
  } finally { rl.close(); }
}
if (require.main === module) main().catch(err => { stderr.write(err.message + '\n'); process.exitCode = 1; });
module.exports = { chatConfig, sendChat };
