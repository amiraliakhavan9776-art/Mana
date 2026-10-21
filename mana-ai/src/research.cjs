'use strict';
function createResearch({ search, maxResults = 5 } = {}) {
  if (typeof search !== 'function') throw new Error('A configured search provider is required');
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 10) throw new Error('Invalid result limit');
  return {
    async lookup({ query, publicOnly = false, signal }) {
      if (publicOnly !== true) throw new Error('External research requires explicit public-only approval');
      if (typeof query !== 'string' || !query.trim() || query.length > 300) throw new Error('Invalid query');
      const items = await search({ query: query.trim(), limit: maxResults, signal });
      if (!Array.isArray(items)) throw new Error('Invalid search response');
      return items.slice(0, maxResults).map(item => {
        if (!item || typeof item.title !== 'string' || typeof item.url !== 'string' || typeof item.snippet !== 'string') throw new Error('Invalid search result');
        const url = new URL(item.url);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Unsafe source URL');
        return Object.freeze({ title: item.title.slice(0, 200), url: url.href, snippet: item.snippet.slice(0, 1200), verified: false });
      });
    }
  };
}
module.exports = { createResearch };
