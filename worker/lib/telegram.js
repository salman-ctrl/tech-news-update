const API_BASE = 'https://api.telegram.org';

/** Panggil Telegram Bot API. */
async function call(token, method, payload) {
  const response = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new Error(`Telegram ${method}: ${body.description ?? response.statusText}`);
  }
  return body.result;
}

/** Kirim pesan biasa. */
export function sendMessage(env, chatId, text, options = {}) {
  return call(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
    chat_id: chatId,
    text: text.slice(0, 4096),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...options,
  });
}

/** Balas callback dari tombol inline, supaya loading-nya berhenti. */
export function answerCallback(env, callbackId, text = '') {
  return call(env.TELEGRAM_BOT_TOKEN, 'answerCallbackQuery', {
    callback_query_id: callbackId,
    text,
  });
}

/** Tampilkan indikator "sedang mengetik". */
export function sendTyping(env, chatId) {
  return call(env.TELEGRAM_BOT_TOKEN, 'sendChatAction', {
    chat_id: chatId,
    action: 'typing',
  }).catch(() => {});
}