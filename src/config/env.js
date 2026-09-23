import { ConfigError } from '../lib/errors.js';

function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new ConfigError(`Environment variable ${name} belum diisi di .env`);
  }
  return value.trim();
}

function optional(name, fallback = null) {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

const DEFAULT_MODELS =
  'gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-flash-latest,gemini-3.1-flash-lite,gemini-3.5-flash-lite';

export function loadConfig({ requireGemini = false } = {}) {
  return {
    telegram: {
      botToken: required('TELEGRAM_BOT_TOKEN'),
      chatId: required('TELEGRAM_CHAT_ID'),
    },
    gemini: {
      apiKey: requireGemini ? required('GEMINI_API_KEY') : optional('GEMINI_API_KEY'),
      // Daftar model, dicoba berurutan kalau yang sebelumnya penuh (503).
      models: optional('GEMINI_MODELS', DEFAULT_MODELS)
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
    },
    tavily: {
      apiKey: optional('TAVILY_API_KEY'),
    },
    github: {
      token: optional('GITHUB_TOKEN'),
    },
    dryRun: process.argv.includes('--dry-run'),
  };
}