import { loadConfig } from './src/config/env.js';
import { FEEDS, WATCHED_REPOS, DISCOVERY_QUERIES, MAX_ITEMS } from './src/config/feeds.js';
import { fetchAllFeeds } from './src/sources/rss.js';
import { discoverAll } from './src/sources/tavily.js';
import { checkReleases } from './src/sources/github.js';
import { rankItems } from './src/sources/filter.js';
import { runAgent } from './src/agent/loop.js';
import { formatDigest, formatFallback } from './src/delivery/formatter.js';
import { sendMessages } from './src/delivery/telegram.js';
import { logger, trackStep } from './src/lib/logger.js';

/**
 * Berapa kandidat yang disodorkan ke agent.
 * Dinaikkan dari 120 — agent perlu melihat lebih banyak bahan sebelum memilih.
 * Gemini sanggup menampung prompt sebesar ini.
 */
const CANDIDATE_LIMIT = 250;

/** Kumpulkan dari semua lapisan sumber. Satu lapisan gagal tidak menjatuhkan run. */
async function collectItems(config) {
  const items = [];
  const failures = [];

  const rss = await trackStep('fetch_rss', () => fetchAllFeeds(FEEDS));
  items.push(...rss.items);
  failures.push(...rss.failures);

  const releases = await trackStep('check_releases', () =>
    checkReleases(WATCHED_REPOS, { token: config.github.token })
  );
  items.push(...releases.items);
  failures.push(...releases.failures);

  if (config.tavily.apiKey) {
    const discovery = await trackStep('discover_tavily', () =>
      discoverAll(config.tavily.apiKey, DISCOVERY_QUERIES)
    );
    items.push(...discovery.items);
    failures.push(...discovery.failures);
  } else {
    logger.warn('tavily.skipped', { reason: 'TAVILY_API_KEY kosong' });
  }

  return { items, failures };
}

async function main() {
  const config = loadConfig();
  logger.info('run.start', { dryRun: config.dryRun });

  const { items, failures } = await collectItems(config);
  const candidates = rankItems(items, { limit: CANDIDATE_LIMIT, hours: 24 });

  logger.info('candidates.ready', { raw: items.length, candidates: candidates.length });

  let chunks;

  try {
    const curated = await trackStep('run_agent', () => runAgent(config, candidates));

    logger.info('agent.curated', { count: curated.length });

    chunks = formatDigest(curated, {
      failures,
      stats: { candidates: candidates.length },
    });
  } catch (error) {
    // Aturan: jangan pernah diam. Kalau agent gagal, kirim judul mentah.
    logger.error('agent.failed', { error: error.message, code: error.code });
    chunks = formatFallback(candidates.slice(0, MAX_ITEMS), error.message);
  }

  await trackStep('send_digest', () => sendMessages(config, chunks), {
    messages: chunks.length,
  });

  logger.info('run.done', { messages: chunks.length });
}

main().catch((error) => {
  logger.error('run.failed', { error: error.message, code: error.code });
  process.exitCode = 1;
});