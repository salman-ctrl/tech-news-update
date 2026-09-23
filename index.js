import { loadConfig } from './src/config/env.js';
import { sendMessage, escapeHtml } from './src/delivery/telegram.js';
import { logger, trackStep } from './src/lib/logger.js';

async function main() {
  const config = loadConfig();
  logger.info('run.start', { dryRun: config.dryRun });

  const text = [
    '<b>Tech News Agent</b>',
    '',
    `Tahap 1 jalan. Pesan ini dikirim dari ${escapeHtml('index.js')}.`,
  ].join('\n');

  await trackStep('send_test_message', () => sendMessage(config, text));

  logger.info('run.done');
}

main().catch((error) => {
  logger.error('run.failed', { error: error.message, code: error.code });
  process.exitCode = 1;
});