'use strict';
// Opt-in OpenAI-compatible HTTPS provider for isolated development pilot.
// Never bundle credentials in a browser or commit them to source control.
function createOpenAIProvider({ apiKey, baseUrl = 'https://api.openai.com/v1/' } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw Error('MANA_AI_OPENAI_API_KEY is required');
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'api.openai.com' ||
      url.port || url.username || url.password || url.pathname !== '/v1/' ||
      url.search || url.hash) throw Error('Only official OpenAI HTTPS API endpoint is supported');
  return {
    async complete({ model, messages, signal }) {
      const response = await fetch(new URL('chat/completions', url), {
        method: 'POST', redirect: 'error', signal,
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: false })
      });
      if (!response.ok) throw Error('AI provider request failed (HTTP ' + response.status + ')');
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > 1024*1024) throw Error('AI provider response too large');
      const body = await response.text();
      if (body.length > 1024*1024) throw Error('AI provider response too large');
      const data = JSON.parse(body);
      if (typeof data?.choices?.[0]?.message?.content !== 'string') throw Error('Invalid AI provider response');
      return data.choices[0].message.content;
    }
  };
}
module.exports = { createOpenAIProvider };
