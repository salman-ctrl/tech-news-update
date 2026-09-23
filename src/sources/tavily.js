import { HttpError } from '../lib/errors.js';
import { withRetry } from '../lib/retry.js';
import { logger } from '../lib/logger.js';

const ENDPOINT = 'https://api.tavily.com/search';

/**
 * Satu pencarian Tavily.
 * depth 'basic' = 1 credit, 'advanced' = 2 credit.
 * Free tier 1.000 credit/bulan, jadi default basic.
 */
export async function searchNews(apiKey, query, options = {}) {
  const { maxResults = 10, days = 2, depth = 'basic', topic = 'news' } = options;

  const run = async () => {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        topic,
        days,
        max_results: maxResults,
        search_depth: depth,
      }),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new HttpError(`Tavily gagal: ${body.detail?.error ?? response.statusText}`, {
        status: response.status,
        body,
      });
    }

    return body;
  };

  const body = await withRetry(run, { label: `tavily.${query.slice(0, 20)}`, retries: 2 });

  return (body.results ?? []).map((raw) => ({
    title: (raw.title ?? '').trim(),
    link: raw.url,
    publishedAt: raw.published_date ? new Date(raw.published_date).toISOString() : null,
    snippet: (raw.content ?? '').trim().slice(0, 500),
    source: hostOf(raw.url),
    sourceId: 'tavily',
    category: 'discovery',
    weight: 0.7,
    relevance: raw.score ?? null,
  }));
}

/** Jalankan beberapa query. Satu query gagal tidak menjatuhkan yang lain. */
export async function discoverAll(apiKey, queries, options = {}) {
  const settled = await Promise.allSettled(
    queries.map((query) => searchNews(apiKey, query, options))
  );

  const items = [];
  const failures = [];

  settled.forEach((result, index) => {
    const query = queries[index];

    if (result.status === 'fulfilled') {
      items.push(...result.value);
      logger.info('tavily.ok', { query, count: result.value.length });
    } else {
      failures.push({ feed: `tavily:${query}`, error: result.reason.message });
      logger.warn('tavily.fail', { query, error: result.reason.message });
    }
  });

  return { items, failures };
}

function hostOf(link) {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return 'web';
  }
}