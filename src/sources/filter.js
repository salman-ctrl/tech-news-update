/** Normalisasi URL supaya varian yang sama terdeteksi kembar. */
export function normalizeUrl(link) {
  try {
    const url = new URL(link);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith('utm_') || key === 'ref' || key === 'source') {
        url.searchParams.delete(key);
      }
    }
    url.hostname = url.hostname.replace(/^www\./, '');
    return url.toString();
  } catch {
    return link;
  }
}

/** Kata kunci minat — dipakai untuk skoring relevansi. */
const INTEREST_KEYWORDS = [
  { words: ['ai', 'llm', 'model', 'agent', 'gpt', 'claude', 'gemini', 'rag'], boost: 3 },
  { words: ['javascript', 'typescript', 'node', 'react', 'next.js', 'tailwind', 'css'], boost: 3 },
  { words: ['automation', 'workflow', 'bot', 'api', 'webhook'], boost: 2 },
  { words: ['seo', 'schema', 'structured data', 'search console'], boost: 3 },
  { words: ['database', 'postgres', 'mysql', 'data pipeline', 'etl'], boost: 2 },
  { words: ['release', 'launch', 'announce', 'version', 'update'], boost: 1 },
  { words: ['security', 'vulnerability', 'cve', 'breach'], boost: 2 },
];

/**
 * Hitung skor relevansi. Fungsi murni — tanpa jaringan.
 * Skor = bobot sumber + kecocokan kata kunci + kesegaran.
 */
export function scoreItem(item, now = Date.now()) {
  const haystack = `${item.title} ${item.snippet ?? ''}`.toLowerCase();

  let keywordScore = 0;
  for (const group of INTEREST_KEYWORDS) {
    if (group.words.some((word) => haystack.includes(word))) {
      keywordScore += group.boost;
    }
  }

  let freshness = 0;
  if (item.publishedAt) {
    const ageHours = (now - new Date(item.publishedAt).getTime()) / 3_600_000;
    if (ageHours <= 6) freshness = 3;
    else if (ageHours <= 12) freshness = 2;
    else if (ageHours <= 24) freshness = 1;
  }

  const sourceScore = (item.weight ?? 0.5) * 3;
  const total = keywordScore + freshness + sourceScore;

  return { ...item, score: Math.round(total * 10) / 10 };
}

/**
 * Tandai seberapa kuat dukungan sebuah kabar.
 * `duplicates` = berapa sumber berbeda melaporkan hal yang sama.
 */
export function assignConfidence(item) {
  const sourceCount = item.duplicates ?? 1;

  if (item.isOfficial) {
    return { ...item, confidence: 'resmi', needsCheck: false };
  }
  if (sourceCount >= 3) {
    return { ...item, confidence: 'banyak sumber', needsCheck: false };
  }
  if (sourceCount === 2) {
    return { ...item, confidence: 'dua sumber', needsCheck: false };
  }
  return { ...item, confidence: 'sumber tunggal', needsCheck: true };
}

/**
 * Gabungkan duplikat lintas sumber.
 * Item yang sama dari banyak sumber jadi satu, dengan hitungan pendukungnya.
 */
export function mergeDuplicates(items) {
  const byUrl = new Map();

  for (const item of items) {
    const key = normalizeUrl(item.link);
    const existing = byUrl.get(key);

    if (!existing) {
      byUrl.set(key, { ...item, normalizedUrl: key, duplicates: 1, sources: [item.source] });
      continue;
    }

    existing.duplicates += 1;
    if (!existing.sources.includes(item.source)) existing.sources.push(item.source);
    if (item.isOfficial) existing.isOfficial = true;
  }

  return [...byUrl.values()];
}

/** Sisakan item yang terbit dalam N jam terakhir. */
export function filterRecent(items, hours = 24, now = Date.now()) {
  const cutoff = now - hours * 60 * 60 * 1000;
  return items.filter((item) => {
    if (!item.publishedAt) return true;
    return new Date(item.publishedAt).getTime() >= cutoff;
  });
}

/** Buang kandidat yang hash URL-nya sudah pernah dikirim. */
export function excludeSeen(items, seenHashes, hashFn) {
  if (!seenHashes || seenHashes.size === 0) return items;
  return items.filter((item) => !seenHashes.has(hashFn(item.link)));
}

/** Pipeline lengkap: saring waktu, gabung duplikat, skor, tandai, urutkan, potong. */
export function rankItems(items, { limit = 100, hours = 24, now = Date.now() } = {}) {
  const recent = filterRecent(items, hours, now);
  const merged = mergeDuplicates(recent);

  return merged
    .map((item) => scoreItem(item, now))
    .map(assignConfidence)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Kelompokkan berdasarkan kategori. */
export function groupByCategory(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.category ?? 'lainnya';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

/** Kelompokkan berdasarkan nama sumber. */
export function groupBySource(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.source)) groups.set(item.source, []);
    groups.get(item.source).push(item);
  }
  return groups;
}