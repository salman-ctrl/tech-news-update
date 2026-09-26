import { loadConfig } from './src/config/env.js';
import { FEEDS, WATCHED_REPOS, DISCOVERY_QUERIES, MAX_ITEMS } from './src/config/feeds.js';
import { fetchAllFeeds } from './src/sources/rss.js';
import { discoverAll } from './src/sources/tavily.js';
import { checkReleases } from './src/sources/github.js';
import { rankItems, excludeSeen } from './src/sources/filter.js';
import { runAgent } from './src/agent/loop.js';
import { createDb } from './src/storage/db.js';
import { hashUrl, recentHashes, recentTitles, saveItems } from './src/storage/items.js';
import { activeThreads, touchThreads, expireThreads } from './src/storage/threads.js';
import { formatDigest, formatFallback } from './src/delivery/formatter.js';
import { sendMessages } from './src/delivery/telegram.js';
import { logger, trackStep } from './src/lib/logger.js';

/** Berapa kandidat yang disodorkan ke agent. */
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

/**
 * Baca konteks dari D1: apa yang sudah dikirim, topik apa yang sedang berjalan.
 * Kalau D1 bermasalah, run tetap lanjut tanpa memory.
 */
async function loadMemory(db) {
  if (!db) return { seen: new Set(), history: [], threads: [] };

  try {
    const [seen, history, threads] = await Promise.all([
      recentHashes(db, 30),
      recentTitles(db, 7, 60),
      activeThreads(db, 14, 20),
    ]);

    logger.info('memory.loaded', {
      seen: seen.size,
      history: history.length,
      threads: threads.length,
    });

    return { seen, history, threads };
  } catch (error) {
    logger.warn('memory.load_failed', { error: error.message });
    return { seen: new Set(), history: [], threads: [] };
  }
}

/** Simpan hasil hari ini supaya besok tidak diulang. */
async function saveMemory(db, curated) {
  if (!db || curated.length === 0) return;

  try {
    await saveItems(db, curated);
    await touchThreads(db, curated);
    const expired = await expireThreads(db, 21);
    if (expired > 0) logger.info('threads.expired', { count: expired });
  } catch (error) {
    logger.warn('memory.save_failed', { error: error.message });
  }
}

async function main() {
  const config = loadConfig();
  logger.info('run.start', { dryRun: config.dryRun, memory: config.d1.enabled });

  const db = config.d1.enabled ? createDb(config) : null;
  if (!db) logger.warn('memory.disabled', { reason: 'kredensial D1 belum lengkap' });

  const memory = await trackStep('load_memory', () => loadMemory(db));

  const { items, failures } = await collectItems(config);

  // Buang yang sudah pernah dikirim sebelum diperingkat.
  const fresh = excludeSeen(items, memory.seen, hashUrl);
  const candidates = rankItems(fresh, { limit: CANDIDATE_LIMIT, hours: 24 });

  logger.info('candidates.ready', {
    raw: items.length,
    afterDedupe: fresh.length,
    candidates: candidates.length,
  });

  let chunks;
  let curated = [];

  try {
    const result = await trackStep('run_agent', () =>
      runAgent(config, candidates, { history: memory.history, threads: memory.threads })
    );

    curated = result.items;
    logger.info('agent.curated', { count: curated.length, toolCalls: result.toolCalls });

    chunks = formatDigest(curated, {
      failures,
      stats: { candidates: candidates.length, toolCalls: result.toolCalls },
    });
  } catch (error) {
    // Aturan: jangan pernah diam. Kalau agent gagal, kirim judul mentah.
    logger.error('agent.failed', { error: error.message, code: error.code });
    chunks = formatFallback(candidates.slice(0, MAX_ITEMS), error.message);
  }

  await trackStep('send_digest', () => sendMessages(config, chunks), {
    messages: chunks.length,
  });

  // Simpan hanya kalau benar-benar terkirim, bukan saat dry-run.
  if (!config.dryRun) {
    await trackStep('save_memory', () => saveMemory(db, curated));
  }

  logger.info('run.done', {
    messages: chunks.length,
    saved: config.dryRun ? 0 : curated.length,
  });
}

main().catch((error) => {
  logger.error('run.failed', { error: error.message, code: error.code });
  process.exitCode = 1;
});