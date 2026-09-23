import { escapeHtml, MAX_LENGTH } from './telegram.js';

const SAFE_LIMIT = MAX_LENGTH - 200;

const CATEGORY_LABEL = {
  'rilis-versi': '📦 Rilis & Versi',
  'model-ai': '🤖 AI & Model',
  keamanan: '🔐 Keamanan',
  industri: '🏭 Industri',
  infrastruktur: '🏗 Infrastruktur',
  indonesia: '🇮🇩 Indonesia',
  lainnya: '📌 Lainnya',
};

const ORDER = ['rilis-versi', 'model-ai', 'keamanan', 'industri', 'infrastruktur', 'indonesia', 'lainnya'];

/** Kelompokkan hasil kurasi berdasarkan kategori. */
function groupByKategori(items) {
  const groups = new Map();
  for (const item of items) {
    const key = CATEGORY_LABEL[item.kategori] ? item.kategori : 'lainnya';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

/** Penanda kepercayaan berdasarkan sumber resmi dan jumlah pendukung. */
function trustBadge(item) {
  if (item.sumberResmi) return '✅';
  if (item.pendukung >= 3) return '';
  if (item.pendukung === 2) return '';
  return ' ⚠️';
}

/** Satu blok berita. Fungsi murni. */
function renderItem(item) {
  const judul = escapeHtml(item.judul);
  const link = escapeHtml(item.link);
  const sumber = escapeHtml(item.sumber);
  const badge = trustBadge(item);
  const ringkasan = escapeHtml(item.ringkasan);

  const meta =
    item.pendukung > 1 ? `${sumber} +${item.pendukung - 1} sumber lain` : sumber;

  return `${badge} <a href="${link}"><b>${judul}</b></a>\n${ringkasan}\n<i>${meta}</i>`;
}

/** Bagi baris jadi beberapa pesan yang muat di Telegram. */
function chunkLines(lines, header) {
  const chunks = [];
  let current = header;

  for (const line of lines) {
    const candidate = current ? `${current}\n\n${line}` : line;

    if (candidate.length > SAFE_LIMIT) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) chunks.push(current);
  return chunks;
}

/**
 * Susun digest hasil kurasi agent jadi array pesan Telegram.
 */
export function formatDigest(items, { failures = [], date = new Date(), stats = {} } = {}) {
  const dateLabel = date.toLocaleDateString('id-ID', { dateStyle: 'long' });

  if (items.length === 0) {
    return [
      `<b>📰 Tech News Digest</b>\n<i>${escapeHtml(dateLabel)}</i>\n\nHari ini sepi — tidak ada yang cukup penting untuk dilaporkan.`,
    ];
  }

  const header = `<b>📰 Tech News Digest</b>\n<i>${escapeHtml(dateLabel)} — ${items.length} item</i>`;

  const lines = [];
  const groups = groupByKategori(items);

  for (const key of ORDER) {
    const list = groups.get(key);
    if (!list?.length) continue;

    lines.push(`<b>${CATEGORY_LABEL[key]}</b>`);
    lines.push(...list.map(renderItem));
  }

  const chunks = chunkLines(lines, header);

  const notes = [];

  const unverified = items.filter((item) => !item.sumberResmi && item.pendukung < 2);
  if (unverified.length > 0) {
    notes.push(
      `⚠️ ${unverified.length} item bersumber tunggal dan belum terkonfirmasi — cek dulu sebelum dipercaya.`
    );
  }

  if (failures.length > 0) {
    notes.push(`Sumber gagal dibaca: ${failures.map((f) => escapeHtml(f.feed)).join(', ')}`);
  }

  if (stats.candidates) {
    notes.push(
      `<i>${stats.candidates} kandidat → ${items.length} lolos kurasi · ${stats.toolCalls ?? 0} tool call</i>`
    );
  }

  if (notes.length > 0) chunks.push(notes.join('\n\n'));

  if (chunks.length > 1) {
    return chunks.map((chunk, index) =>
      index === 0 ? chunk : `<i>(${index + 1}/${chunks.length})</i>\n\n${chunk}`
    );
  }

  return chunks;
}

/** Digest darurat kalau agent gagal — kirim judul mentah, jangan diam. */
export function formatFallback(items, reason) {
  const header = `<b>📰 Tech News Digest</b>\n<i>Mode darurat — kurasi AI gagal</i>\n\n<i>${escapeHtml(reason)}</i>`;

  const lines = items
    .slice(0, 25)
    .map((item) => `• <a href="${escapeHtml(item.link)}">${escapeHtml(item.title)}</a>\n  <i>${escapeHtml(item.source)}</i>`);

  return chunkLines(lines, header);
}