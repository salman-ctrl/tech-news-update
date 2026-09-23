const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[process.env.LOG_LEVEL ?? 'info'] ?? LEVELS.info;

function emit(level, message, meta = {}) {
  if (LEVELS[level] < threshold) return;

  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  const out = level === 'error' ? console.error : console.log;
  out(JSON.stringify(line));
}

export const logger = {
  debug: (message, meta) => emit('debug', message, meta),
  info: (message, meta) => emit('info', message, meta),
  warn: (message, meta) => emit('warn', message, meta),
  error: (message, meta) => emit('error', message, meta),
};

// Bungkus operasi apa pun, catat durasi dan hasilnya.
// Nanti dipakai untuk mencatat tiap tool call agent.
export async function trackStep(name, fn, meta = {}) {
  const started = Date.now();
  try {
    const result = await fn();
    logger.info('step.ok', { step: name, ms: Date.now() - started, ...meta });
    return result;
  } catch (error) {
    logger.error('step.fail', {
      step: name,
      ms: Date.now() - started,
      error: error.message,
      code: error.code,
      ...meta,
    });
    throw error;
  }
}