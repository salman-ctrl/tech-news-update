import { logger } from '../lib/logger.js';

/** Buat id thread yang stabil dari judul — huruf kecil, tanpa simbol. */
export function threadIdFrom(judul) {
  return judul
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 4)
    .join('-');
}

/** Thread yang masih hidup — disebut dalam N hari terakhir. */
export async function activeThreads(db, days = 14, limit = 20) {
  return db.all(
    `SELECT id, judul, mentions, last_seen
       FROM threads
      WHERE active = 1 AND last_seen >= datetime('now', ?)
      ORDER BY last_seen DESC
      LIMIT ?`,
    [`-${days} days`, limit]
  );
}

/** Catat topik hari ini. Yang sudah ada dinaikkan hitungannya. */
export async function touchThreads(db, items) {
  const now = new Date().toISOString();
  let touched = 0;

  for (const item of items) {
    const id = item.threadId ?? threadIdFrom(item.judul);
    if (!id) continue;

    try {
      await db.exec(
        `INSERT INTO threads (id, judul, first_seen, last_seen, mentions, active)
         VALUES (?, ?, ?, ?, 1, 1)
         ON CONFLICT(id) DO UPDATE SET
           last_seen = excluded.last_seen,
           mentions = mentions + 1`,
        [id, item.judul, now, now]
      );
      touched += 1;
    } catch (error) {
      logger.warn('threads.touch_failed', { id, error: error.message });
    }
  }

  return touched;
}

/** Tandai thread yang sudah lama tidak muncul sebagai tidak aktif. */
export async function expireThreads(db, days = 21) {
  const meta = await db.exec(
    `UPDATE threads SET active = 0 WHERE active = 1 AND last_seen < datetime('now', ?)`,
    [`-${days} days`]
  );
  return meta.changes ?? 0;
}