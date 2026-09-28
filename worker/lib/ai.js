const API = 'https://generativelanguage.googleapis.com/v1beta/models';

const SYSTEM_PROMPT = `Kamu asisten riset teknologi pribadi untuk seorang software engineer Indonesia.

PROFIL PEMBACA
- Full-stack web development (JavaScript, TypeScript, Node, React, PHP)
- Sedang membangun sistem AI/RAG dan agent
- Mengerjakan SEO dan JSON-LD schema automation untuk klien
- Tertarik pada automation, bot, API, data engineering

CARA MENJAWAB
- Bahasa Indonesia santai tapi padat. Jangan bertele-tele.
- Kalau ada arsip berita yang relevan, pakai itu dan sebutkan sumbernya.
- Kalau arsip tidak memuat jawabannya, katakan terus terang. Jangan mengarang.
- Jelaskan kenapa sesuatu penting untuk kerjaan dia, bukan cuma apa yang terjadi.
- Maksimal 250 kata kecuali dia minta lebih detail.

FORMAT — INI PENTING
Telegram di sini memakai HTML, BUKAN markdown. Aturannya mutlak:
- Tebal: <b>teks</b>. JANGAN pakai **teks**.
- Miring: <i>teks</i>. JANGAN pakai *teks* atau _teks_.
- Link: <a href="https://contoh.com">judul</a>. JANGAN pakai [judul](url).
- Kode: <code>teks</code>. JANGAN pakai backtick.
- JANGAN pakai heading (#), tabel, atau bullet dengan tanda minus di awal baris. Pakai • kalau perlu daftar.
- Jangan tutup jawaban di tengah kalimat. Kalau ruang terbatas, persingkat isinya, bukan potong kalimatnya.`;

/** Daftar model untuk fallback kalau satu penuh. */
function models(env) {
  const raw = env.GEMINI_MODELS ?? 'gemini-3.8-flash,gemini-3.6-flash,gemini-flash-latest';
  return raw
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
}

/**
 * Model kadang tetap mengeluarkan markdown meski diminta HTML.
 * Konversi yang paling umum supaya tidak bocor ke pembaca.
 * Urutan penting: link dulu, baru penebalan.
 */
function markdownToHtml(text) {
  return (
    text
      // Link markdown, termasuk yang dibungkus tanda kurung biasa.
      .replace(/\[([^\]]+)\]\(\s*(https?:\/\/[^)\s]+)\s*\)/g, '<a href="$2">$1</a>')
      // Tebal dan miring.
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/__([^_]+)__/g, '<b>$1</b>')
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:]|$)/g, '$1<i>$2</i>')
      // Kode inline.
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      // Heading jadi tebal.
      .replace(/^#{1,6}\s*(.+)$/gm, '<b>$1</b>')
      // Bullet markdown jadi bullet biasa.
      .replace(/^\s*[-*]\s+/gm, '• ')
  );
}

/** Satu panggilan ke Gemini. */
async function generate(env, model, prompt) {
  const response = await fetch(`${API}/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        // Bahasa Indonesia butuh lebih banyak token daripada Inggris.
        maxOutputTokens: 3000,
      },
    }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = body.error?.message ?? response.statusText;
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }

  const candidate = body.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text).join('') ?? '';

  if (!text) throw new Error('Model tidak mengembalikan teks');

  // Kalau jawaban terpotong karena batas token, beri tahu pembaca.
  const truncated = candidate?.finishReason === 'MAX_TOKENS';
  const cleaned = markdownToHtml(text.trim());

  return truncated
    ? `${cleaned}\n\n<i>(jawaban dipotong — tanya lebih spesifik kalau perlu)</i>`
    : cleaned;
}

/** Susun konteks arsip jadi teks yang ringkas. */
function buildContext(items) {
  if (!items.length) return '(arsip kosong)';

  return items
    .map((item) => {
      const tanggal = item.sent_at ? item.sent_at.slice(0, 10) : '-';
      return `- ${item.judul} [${item.kategori}, ${item.sumber}, ${tanggal}]\n  ${item.url}\n  ${(item.ringkasan ?? '').slice(0, 160)}`;
    })
    .join('\n');
}

/**
 * Jawab pertanyaan pembaca dengan arsip sebagai konteks.
 * Mencoba beberapa model kalau satu penuh.
 */
export async function answer(env, question, archive, { quoted = null } = {}) {
  const quotedBlock = quoted
    ? `\n\nDIA SEDANG MEMBALAS PESAN INI:\n"""\n${quoted.slice(0, 1500)}\n"""\n`
    : '';

  const prompt = `ARSIP BERITA YANG SUDAH DIKIRIM KE DIA (7 hari terakhir):
${buildContext(archive)}
${quotedBlock}
PERTANYAAN DIA:
${question}`;

  let lastError;

  for (const model of models(env)) {
    try {
      return await generate(env, model, prompt);
    } catch (error) {
      lastError = error;
      const retryable = [429, 503, 504].includes(error.status);
      if (!retryable) throw error;
    }
  }

  throw lastError ?? new Error('Semua model tidak tersedia');
}