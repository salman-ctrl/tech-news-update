-- Item yang sudah pernah dikirim. Dipakai untuk deduplikasi lintas hari.
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url_hash TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  judul TEXT NOT NULL,
  ringkasan TEXT,
  kategori TEXT,
  sumber TEXT,
  skor REAL,
  sumber_resmi INTEGER DEFAULT 0,
  thread_id TEXT,
  sent_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_sent_at ON items(sent_at);
CREATE INDEX IF NOT EXISTS idx_items_thread ON items(thread_id);
CREATE INDEX IF NOT EXISTS idx_items_kategori ON items(kategori);

-- Topik yang diikuti lintas hari, supaya agent tahu ada kelanjutan.
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  judul TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  mentions INTEGER DEFAULT 1,
  active INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_threads_active ON threads(active, last_seen);

-- Reaksi pembaca. Dipakai tahap 5 untuk menyetel kurasi.
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url_hash TEXT NOT NULL,
  rating TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_hash ON feedback(url_hash);