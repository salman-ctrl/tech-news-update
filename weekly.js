import { loadConfig } from './src/config/env.js';
import { createDb } from './src/storage/db.js';
import { itemsSince } from './src/storage/items.js';
import { runWeekly } from './src/agent/weekly.js';
import { formatWeekly } from './src/delivery/weekly-formatter.js';
import { sendMessages } from './src/delivery/telegram.js';
import { logger, trackStep } from './src/lib/logger.js';

/** Minimal item supaya rangkuman punya bahan yang cukup. */
const MIN_ITEMS = 10;

async function main() {
  const config = loadConfig();
  logger.info('weekly.run_start', { dryRun: config.dryRun });

  if (!config.d1.enabled) {
    logger.error('weekly.no_memory', { reason: 'kredensial D1 belum lengkap' });
    process.exitCode = 1;
    return;
  }

  const db = createDb(config);
  const items = await trackStep('load_week', () => itemsSince(db, 7, 400));

  logger.info('weekly.items_loaded', { count: items.length });

  if (items.length < MIN_ITEMS) {
    const pesan = `<b>📊 Rangkuman Mingguan</b>\n\nBaru ${items.length} item terkumpul minggu ini — belum cukup untuk melihat pola. Rangkuman akan lebih berguna setelah agent jalan seminggu penuh.`;
    await sendMessages(config, [pesan]);
    logger.info('weekly.run_done', { skipped: true });
    return;
  }

  let chunks;

  try {
    const result = await trackStep('run_weekly', () => runWeekly(config, items));
    chunks = formatWeekly(result, { stats: { items: items.length } });
  } catch (error) {
    // Jangan diam. Kirim catatan singkat kalau rangkuman gagal disusun.
    logger.error('weekly.failed', { error: error.message, code: error.code });
    chunks = [
      `<b>📊 Rangkuman Mingguan</b>\n\nGagal menyusun rangkuman minggu ini.\n<i>${error.message.slice(0, 300)}</i>\n\nDigest harian tetap jalan seperti biasa.`,
    ];
  }

  await trackStep('send_weekly', () => sendMessages(config, chunks), {
    messages: chunks.length,
  });

  logger.info('weekly.run_done', { messages: chunks.length });
}

main().catch((error) => {
  logger.error('weekly.run_failed', { error: error.message, code: error.code });
  process.exitCode = 1;
});