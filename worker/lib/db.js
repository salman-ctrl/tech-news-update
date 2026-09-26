/**
 * Akses D1 lewat binding Worker — lebih cepat dari REST API
 * karena tidak lewat jaringan publik.
 */

/** Simpan reaksi 👍/👎 pada sebuah item. */
export async function saveFeedback(db, urlHash, rating) {
  await db
    .prepare(`INSERT INTO feedback (url_hash, rating, created_at) VALUES (?, ?, datetime('now'))`)
    .bind(urlHash, rating)
    .run();
}

/** Cari arsip berdasarkan kata kunci. */
export async function searchArchive(db, keyword, limit = 15) {
  const like = `%${keyword}%`;
  const { results } = await db
    .prepare(
      `SELECT judul, url, kategori, sumber, sent_at
         FROM items
        WHERE judul LIKE ? OR ringkasan LIKE ?
        ORDER BY sent_at DESC
        LIMIT ?`
    )
    .bind(like, like, limit)
    .all();
  return results ?? [];
}

/** Ambil item terbaru sebagai konteks untuk menjawab pertanyaan. */
export async function recentItems(db, days = 7, limit = 80) {
  const { results } = await db
    .prepare(
      `SELECT judul, ringkasan, kategori, sumber, url, sent_at
         FROM items
        WHERE sent_at >= datetime('now', ?)
        ORDER BY sent_at DESC
        LIMIT ?`
    )
    .bind(`-${days} days`, limit)
    .all();
  return results ?? [];
}

/** Cari satu item berdasarkan potongan judul. */
export async function findItem(db, keyword) {
  const { results } = await db
    .prepare(`SELECT judul, ringkasan, url, sumber FROM items WHERE judul LIKE ? LIMIT 1`)
    .bind(`%${keyword}%`)
    .all();
  return results?.[0] ?? null;
}

/** Statistik singkat untuk perintah /stats. */
export async function stats(db) {
  const total = await db.prepare(`SELECT COUNT(*) as n FROM items`).first();
  const minggu = await db
    .prepare(`SELECT COUNT(*) as n FROM items WHERE sent_at >= datetime('now', '-7 days')`)
    .first();
  const suka = await db
    .prepare(`SELECT COUNT(*) as n FROM feedback WHERE rating = 'up'`)
    .first();
  const takSuka = await db
    .prepare(`SELECT COUNT(*) as n FROM feedback WHERE rating = 'down'`)
    .first();

  return {
    total: total?.n ?? 0,
    minggu: minggu?.n ?? 0,
    suka: suka?.n ?? 0,
    takSuka: takSuka?.n ?? 0,
  };
}