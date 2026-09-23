import { HttpError } from '../lib/errors.js';
import { withRetry } from '../lib/retry.js';
import { logger } from '../lib/logger.js';

const API_BASE = 'https://api.telegram.org';
const MAX_LENGTH = 4096;
const SEND_GAP_MS = 400; // jeda antar pesan supaya tidak kena rate limit

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callApi(botToken, method, payload) {
  const response = await fetch(`${API_BASE}/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.ok === false) {
    throw new HttpError(`Telegram ${method} gagal: ${body.description ?? response.statusText}`, {
      status: response.status,
      body,
      retryAfter: body.parameters?.retry_after,
    });
  }

  return body.result;
}

/** Kirim satu pesan. */
export async function sendMessage(config, text, options = {}) {
  const { parseMode = 'HTML', disablePreview = true, replyMarkup } = options;

  if (config.dryRun) {
    logger.info('telegram.dry_run', { chars: text.length });
    console.log('\n--- DRY RUN ---\n' + text + '\n---------------\n');
    return { dryRun: true };
  }

  const payload = {
    chat_id: config.telegram.chatId,
    text: text.slice(0, MAX_LENGTH),
    parse_mode: parseMode,
    link_preview_options: { is_disabled: disablePreview },
  };

  if (replyMarkup) payload.reply_markup = replyMarkup;

  const result = await withRetry(
    () => callApi(config.telegram.botToken, 'sendMessage', payload),
    { label: 'telegram.sendMessage' }
  );

  logger.info('telegram.sent', { messageId: result.message_id });
  return result;
}

/**
 * Kirim beberapa pesan berurutan dengan jeda.
 * Dipakai saat digest tidak muat dalam satu pesan.
 */
export async function sendMessages(config, chunks, options = {}) {
  const results = [];

  for (const [index, chunk] of chunks.entries()) {
    results.push(await sendMessage(config, chunk, options));
    if (index < chunks.length - 1 && !config.dryRun) {
      await sleep(SEND_GAP_MS);
    }
  }

  logger.info('telegram.batch_sent', { count: chunks.length });
  return results;
}

/** Escape teks yang masuk ke parse_mode HTML. */
export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export { MAX_LENGTH };