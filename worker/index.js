import { sendMessage, answerCallback, sendTyping } from './lib/telegram.js';
import { saveFeedback, searchArchive, recentItems, stats } from './lib/db.js';
import { answer } from './lib/ai.js';

/** Escape teks yang masuk ke parse_mode HTML. */
function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** Hanya pemilik bot yang boleh berinteraksi. */
function isOwner(env, chatId) {
  return String(chatId) === String(env.TELEGRAM_CHAT_ID);
}

const HELP = `<b>Tech News Bot</b>

Kirim pertanyaan apa saja, saya jawab pakai arsip berita yang pernah dikirim.

<b>Perintah</b>
/cari &lt;kata&gt; — cari di arsip
/stats — statistik arsip
/help — pesan ini

<b>Contoh</b>
"minggu ini ada apa soal schema?"
"jelasin lebih dalam soal MCP stateless"
/cari supabase`;

/** Tangani perintah /cari. */
async function handleSearch(env, chatId, keyword) {
  if (!keyword) {
    return sendMessage(env, chatId, 'Mau cari apa? Contoh: <code>/cari supabase</code>');
  }

  const rows = await searchArchive(env.DB, keyword);

  if (!rows.length) {
    return sendMessage(env, chatId, `Tidak ada arsip yang cocok dengan "${esc(keyword)}".`);
  }

  const lines = rows.map((r) => {
    const tanggal = r.sent_at ? r.sent_at.slice(0, 10) : '-';
    return `• <a href="${esc(r.url)}">${esc(r.judul)}</a>\n  <i>${esc(r.sumber)} · ${tanggal}</i>`;
  });

  const text = `<b>🔍 Hasil untuk "${esc(keyword)}"</b> — ${rows.length} item\n\n${lines.join('\n\n')}`;
  return sendMessage(env, chatId, text);
}

/** Tangani perintah /stats. */
async function handleStats(env, chatId) {
  const s = await stats(env.DB);
  const text = `<b>📊 Statistik Arsip</b>

Total item: <b>${s.total}</b>
Minggu ini: <b>${s.minggu}</b>
👍 ${s.suka} · 👎 ${s.takSuka}`;
  return sendMessage(env, chatId, text);
}

/** Tangani pertanyaan bebas — di sini AI-nya bekerja. */
async function handleQuestion(env, chatId, question, quoted) {
  await sendTyping(env, chatId);

  try {
    const archive = await recentItems(env.DB, 7, 80);
    const reply = await answer(env, question, archive, { quoted });
    return sendMessage(env, chatId, reply);
  } catch (error) {
    const pesan =
      error.status === 429
        ? 'Kuota Gemini sedang penuh. Coba lagi sebentar lagi.'
        : `Gagal menjawab: ${esc(String(error.message).slice(0, 200))}`;
    return sendMessage(env, chatId, pesan);
  }
}

/** Tangani tekan tombol 👍/👎. */
async function handleCallback(env, query) {
  const chatId = query.message?.chat?.id;
  const data = String(query.data ?? '');

  if (!isOwner(env, chatId)) {
    return answerCallback(env, query.id, 'Bukan untukmu.');
  }

  const [action, urlHash] = data.split(':');

  if (action !== 'up' && action !== 'down') {
    return answerCallback(env, query.id);
  }

  try {
    await saveFeedback(env.DB, urlHash, action);
    return answerCallback(env, query.id, action === 'up' ? 'Noted 👍' : 'Noted 👎');
  } catch {
    return answerCallback(env, query.id, 'Gagal menyimpan');
  }
}

/** Tangani pesan teks masuk. */
async function handleMessage(env, message) {
  const chatId = message.chat?.id;
  const text = (message.text ?? '').trim();

  if (!isOwner(env, chatId)) return;
  if (!text) return;

  // Isi pesan yang di-reply, dipakai sebagai konteks tambahan.
  const quoted = message.reply_to_message?.text ?? null;

  if (text === '/start' || text === '/help') {
    return sendMessage(env, chatId, HELP);
  }

  if (text.startsWith('/cari')) {
    return handleSearch(env, chatId, text.slice(5).trim());
  }

  if (text === '/stats') {
    return handleStats(env, chatId);
  }

  // Selain perintah, semuanya diperlakukan sebagai pertanyaan.
  return handleQuestion(env, chatId, text, quoted);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Tech News Bot is running', { status: 200 });
    }

    // Telegram mengirim header rahasia ini kalau webhook diset dengan secret_token.
    const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (env.WEBHOOK_SECRET && secret !== env.WEBHOOK_SECRET) {
      return new Response('Forbidden', { status: 403 });
    }

    const update = await request.json().catch(() => null);
    if (!update) return new Response('OK');

    // Telegram menunggu balasan cepat — proses di belakang layar
    // supaya tidak kena timeout dan update tidak dikirim ulang.
    if (update.callback_query) {
      ctx.waitUntil(handleCallback(env, update.callback_query));
    } else if (update.message) {
      ctx.waitUntil(handleMessage(env, update.message));
    }

    return new Response('OK');
  },
};