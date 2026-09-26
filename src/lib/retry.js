import { logger } from './logger.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function defaultIsRetryable(error) {
  if (typeof error.isRetryable === 'boolean') return error.isRetryable;
  return error.status === undefined;
}

/**
 * Gemini menyelipkan waktu tunggu di dalam teks pesan error,
 * misalnya "Please retry in 20.02s". Hormati itu daripada menebak.
 */
function parseRetryHint(error) {
  if (error.retryAfter) return error.retryAfter * 1000;

  const text = String(error?.message ?? '');
  const match = text.match(/retry in (\d+(?:\.\d+)?)s/i);
  if (match) return Math.ceil(Number(match[1]) * 1000);

  const delay = text.match(/"retryDelay":\s*"(\d+)s"/);
  if (delay) return Number(delay[1]) * 1000;

  return null;
}

/**
 * Jalankan fn dengan exponential backoff.
 * Semua pemanggilan HTTP di proyek ini harus lewat sini.
 */
export async function withRetry(fn, options = {}) {
  const {
    retries = 3,
    baseDelay = 500,
    maxDelay = 60000,
    label = 'request',
    isRetryable = defaultIsRetryable,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const canRetry = attempt < retries && isRetryable(error);
      if (!canRetry) break;

      const hinted = parseRetryHint(error);
      const backoff = Math.min(baseDelay * 2 ** attempt, maxDelay);
      const jitter = Math.floor(Math.random() * 500);

      // Kalau server bilang berapa lama harus tunggu, ikuti — plus sedikit margin.
      const delay = hinted ? Math.min(hinted + 1000, maxDelay) : backoff + jitter;

      logger.warn('retry', {
        label,
        attempt: attempt + 1,
        delay,
        hinted: Boolean(hinted),
        error: String(error.message).slice(0, 100),
      });

      await sleep(delay);
    }
  }

  throw lastError;
}