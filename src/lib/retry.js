import { logger } from './logger.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function defaultIsRetryable(error) {
  if (typeof error.isRetryable === 'boolean') return error.isRetryable;
  // Error jaringan (DNS, timeout, connection reset) tidak punya status.
  return error.status === undefined;
}

/**
 * Jalankan fn dengan exponential backoff.
 * Semua pemanggilan HTTP di proyek ini harus lewat sini.
 */
export async function withRetry(fn, options = {}) {
  const {
    retries = 3,
    baseDelay = 500,
    maxDelay = 8000,
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

      // Telegram mengirim retry_after saat kena rate limit — hormati itu.
      const hinted = error.retryAfter ? error.retryAfter * 1000 : null;
      const backoff = Math.min(baseDelay * 2 ** attempt, maxDelay);
      const jitter = Math.floor(Math.random() * 250);
      const delay = hinted ?? backoff + jitter;

      logger.warn('retry', {
        label,
        attempt: attempt + 1,
        delay,
        error: error.message,
      });

      await sleep(delay);
    }
  }

  throw lastError;
}