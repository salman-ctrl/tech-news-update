import { ConfigError } from '../lib/errors.js';

function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new ConfigError(`Environment variable ${name} belum diisi di .env`);
  }
  return value.trim();
}

export function loadConfig({ requireGemini = false } = {}) {
  return {
    telegram: {
      botToken: required('TELEGRAM_BOT_TOKEN'),
      chatId: required('TELEGRAM_CHAT_ID'),
    },
    gemini: {
      apiKey: requireGemini ? required('GEMINI_API_KEY') : process.env.GEMINI_API_KEY,
    },
    dryRun: process.argv.includes('--dry-run'),
  };
}