'use strict';
const { can } = require('./security.cjs');

function createEngine({ provider, model, timeoutMs = 15000 } = {}) {
  if (!provider || typeof provider.complete !== 'function') throw new Error('AI provider required');
  if (typeof model !== 'string' || !/^[a-zA-Z0-9._:/-]{1,100}$/.test(model)) throw new Error('Invalid AI model');
  return {
    async ask({ principal, question }) {
      if (!can(principal, 'projects:read')) throw new Error('Permission denied');
      if (typeof question !== 'string' || !question.trim() || question.length > 4000) throw new Error('Invalid question');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const answer = await provider.complete({
          model,
          messages: [
            { role: 'system', content: 'You are Mana AI. Provide helpful general answers. You have no access to company data, project records, external tools or live facts. Do not claim to have inspected them. Do not execute actions. Clearly identify uncertainty.' },
            { role: 'user', content: question.trim() }
          ],
          signal: controller.signal
        });
        if (typeof answer !== 'string' || answer.length > 16000) throw new Error('Invalid provider response');
        return { answer, model, dataConnected: false, actionsExecuted: false };
      } finally { clearTimeout(timer); }
    }
  };
}
function createLocalOpenAICompatibleProvider({ baseUrl }) {
  const url = new URL(baseUrl);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.protocol !== 'http:' || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Only local HTTP AI provider base URLs are permitted');
  }
  return {
    async complete({ model, messages, signal }) {
      const response = await fetch(new URL('/v1/chat/completions', url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: false, temperature: 0.2 }),
        signal,
        redirect: 'error'
      });
      if (!response.ok) throw new Error('Local AI provider request failed');
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > 1024 * 1024) throw new Error('Provider response too large');
      const body = await response.text();
      if (body.length > 1024 * 1024) throw new Error('Provider response too large');
      const parsed = JSON.parse(body);
      return parsed?.choices?.[0]?.message?.content;
    }
  };
}
module.exports = { createEngine, createLocalOpenAICompatibleProvider };
