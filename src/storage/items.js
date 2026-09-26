import { createHash } from 'node:crypto';
import { normalizeUrl } from '../sources/filter.js';
import { logger } from '../lib/logger.js';

/** Hash URL yang sudah dinormalisasi — kunci deduplikasi. */
export function hashUrl(url) {
  return createHash('sha256').update(normalizeUrl(url)).digest('hex').slice(0, 32);
}

/**
 * Ambil URL yang sudah pernah dikirim dalam N hari terakhir.
 * Dipakai untuk menyaring kandidat sebelum sampai ke agent.
 */
export async function recentHashes(db, days = 30) {
  const rows = await db.all(
    `SELECT url_hash FROM items WHERE sent_at >= datetime('now', ?) ORDER BY sent_at DESC LIMIT 2000`,
    [`-${days} days`]
  );
  return new Set(rows.map((row) => row.url_hash));
}

/** Judul yang sudah dikirim, untuk diberitahukan ke agent supaya tidak mengulang. */
export async function recentTitles(db, days = 7, limit = 60) {
  const rows = await db.all(
    `SELECT judul FROM items WHERE sent_at >= datetime('now', ?) ORDER BY sent_at DESC LIMIT ?`,
    [`-${days} days`, limit]
  );
  return rows.map((row) => row.judul);
}

/**
 * Ambil item lengkap dalam N hari terakhir.
 * Dipakai weekly digest untuk melihat pola seminggu.
 */
export async function itemsSince(db, days = 7, limit = 400) {
  return db.all(
    `SELECT judul, ringkasan, kategori, sumber, url, skor, sumber_resmi, thread_id, sent_at
       FROM items
      WHERE sent_at >= datetime('now', ?)
      ORDER BY skor DESC, sent_at DESC
      LIMIT ?`,
    [`-${days} days`, limit]
  );
}

/** Simpan item yang baru dikirim. Satu baris gagal tidak menjatuhkan sisanya. */
export async function saveItems(db, items) {
  const now = new Date().toISOString();
  let saved = 0;

  for (const item of items) {
    try {
      await db.exec(
        `INSERT OR IGNORE INTO items
           (url_hash, url, judul, ringkasan, kategori, sumber, skor, sumber_resmi, thread_id, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          hashUrl(item.link),
          item.link,
          item.judul,
          item.ringkasan ?? '',
          item.kategori ?? 'industri',
          item.sumber ?? 'web',
          item.skor ?? 5,
          item.sumberResmi ? 1 : 0,
          item.threadId ?? null,
          now,
        ]
      );
      saved += 1;
    } catch (error) {
      logger.warn('items.save_failed', { url: item.link, error: error.message });
    }
  }

  logger.info('items.saved', { saved, total: items.length });
  return saved;
}

/** Cari arsip berdasarkan kata kunci. Dipakai nanti untuk perintah /cari. */
export async function searchItems(db, keyword, limit = 20) {
  return db.all(
    `SELECT judul, url, kategori, sumber, sent_at
       FROM items
      WHERE judul LIKE ? OR ringkasan LIKE ?
      ORDER BY sent_at DESC
      LIMIT ?`,
    [`%${keyword}%`, `%${keyword}%`, limit]
  );
}