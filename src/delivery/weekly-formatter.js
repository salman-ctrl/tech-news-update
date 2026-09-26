import { escapeHtml, MAX_LENGTH } from './telegram.js';

const SAFE_LIMIT = MAX_LENGTH - 200;

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

/** Satu tema beserta item pendukungnya. */
function renderTema(tema, index) {
  const judul = escapeHtml(tema.judul);
  const narasi = escapeHtml(tema.narasi);

  const pendukung = tema.pendukung
    .map((p) => `  • <a href="${escapeHtml(p.link)}">${escapeHtml(p.judul)}</a>`)
    .join('\n');

  const blok = [`<b>${index + 1}. ${judul}</b>`, narasi];
  if (pendukung) blok.push(pendukung);

  return blok.join('\n\n');
}

/**
 * Susun rangkuman mingguan jadi array pesan Telegram.
 * Bentuknya naratif, bukan daftar — pembaca sudah baca item hariannya.
 */
export function formatWeekly(result, { date = new Date(), stats = {} } = {}) {
  const dateLabel = date.toLocaleDateString('id-ID', { dateStyle: 'long' });

  if (!result.tema.length) {
    return [
      `<b>📊 Rangkuman Mingguan</b>\n<i>${escapeHtml(dateLabel)}</i>\n\nMinggu ini tidak ada pola yang cukup jelas untuk dirangkum.`,
    ];
  }

  const header = `<b>📊 Rangkuman Mingguan</b>\n<i>${escapeHtml(dateLabel)} — ${result.tema.length} tema dari ${stats.items ?? 0} item</i>`;

  const lines = result.tema.map(renderTema);

  if (result.penutup) {
    lines.push(`<b>🔭 Yang layak diikuti</b>\n${escapeHtml(result.penutup)}`);
  }

  const chunks = chunkLines(lines, header);

  if (chunks.length > 1) {
    return chunks.map((chunk, index) =>
      index === 0 ? chunk : `<i>(${index + 1}/${chunks.length})</i>\n\n${chunk}`
    );
  }

  return chunks;
}