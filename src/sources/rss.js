import Parser from 'rss-parser';
import { withRetry } from '../lib/retry.js';
import { logger } from '../lib/logger.js';
import { HttpError } from '../lib/errors.js';

/**
 * Beberapa situs menolak User-Agent yang terlihat seperti bot.
 * Accept-Encoding identity mencegah respons gzip yang tidak terbuka
 * di jalur jaringan tertentu.
 */
const parser = new Parser({
  timeout: 30000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
    'Accept-Encoding': 'identity',
  },
});

/** Ambil maksimal sekian item terbaru per feed — RSS selalu urut dari yang baru. */
const MAX_PER_FEED = 50;

/** Normalisasi satu entri feed jadi bentuk seragam. */
function normalizeItem(raw, feed) {
  const link = raw.link?.trim();
  if (!link) return null;

  const publishedAt = raw.isoDate ?? raw.pubDate ?? null;

  return {
    title: (raw.title ?? '').trim(),
    link,
    publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
    snippet: (raw.contentSnippet ?? '').trim().slice(0, 500),
    source: feed.name,
    sourceId: feed.id,
    category: feed.category,
    weight: feed.weight,
  };
}

/** Ambil satu feed. Melempar error kalau gagal — pemanggil yang memutuskan. */
export async function fetchFeed(feed) {
  const parsed = await withRetry(
    async () => {
      try {
        return await parser.parseURL(feed.url);
      } catch (error) {
        throw new HttpError(`Gagal baca feed ${feed.id}: ${error.message}`, {
          status: error.statusCode,
          cause: error,
        });
      }
    },
    { label: `rss.${feed.id}`, retries: 2 }
  );

  return (parsed.items ?? [])
    .slice(0, MAX_PER_FEED)
    .map((raw) => normalizeItem(raw, feed))
    .filter(Boolean);
}

/**
 * Ambil banyak feed paralel.
 * Satu feed mati tidak menjatuhkan yang lain.
 */
export async function fetchAllFeeds(feeds) {
  const settled = await Promise.allSettled(feeds.map((feed) => fetchFeed(feed)));

  const items = [];
  const failures = [];

  settled.forEach((result, index) => {
    const feed = feeds[index];

    if (result.status === 'fulfilled') {
      items.push(...result.value);
      logger.info('feed.ok', { feed: feed.id, count: result.value.length });
    } else {
      failures.push({ feed: feed.id, error: result.reason.message });
      logger.warn('feed.fail', { feed: feed.id, error: result.reason.message });
    }
  });

  return { items, failures };
}