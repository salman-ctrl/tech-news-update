import { GoogleGenAI } from '@google/genai';
import { withRetry } from '../lib/retry.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';

const SYSTEM_PROMPT = `Kamu menulis rangkuman mingguan berita teknologi untuk seorang software engineer Indonesia.

PROFIL PEMBACA
- Full-stack web development (JavaScript, TypeScript, Node, React, PHP)
- Sedang membangun sistem AI/RAG dan agent
- Mengerjakan SEO dan JSON-LD schema automation untuk klien
- Tertarik pada automation, bot, API, data engineering

TUGASMU
Kamu menerima semua item yang sudah dikirim ke pembaca sepanjang minggu ini. Jangan ulangi daftarnya — dia sudah membacanya.

Yang kamu tulis adalah POLA. Apa yang sebenarnya bergerak minggu ini? Apa yang berubah dibanding sebelumnya? Apa yang layak dia perhatikan minggu depan?

STRUKTUR
Tulis 3 sampai 5 tema. Tiap tema:
- Judul tema yang menangkap intinya, maksimal 8 kata
- Dua sampai empat kalimat yang menjelaskan polanya, bukan sekadar merangkum berita
- Sebutkan 2 sampai 4 item pendukung dengan link, sebagai bukti

Setelah tema, tulis satu bagian penutup berjudul "Yang layak diikuti" berisi 2 sampai 3 kalimat tentang apa yang sebaiknya dia pantau minggu depan.

ATURAN
- Cari hubungan antar berita. Kalau tiga hal berbeda menunjuk ke arah yang sama, itu tema.
- Prioritaskan yang menyentuh kerjaannya, bukan yang paling ramai diberitakan.
- Jujur kalau minggu ini memang sepi. Jangan mengarang tema.
- Tulis dalam Bahasa Indonesia yang mengalir, bukan bullet point kaku.

OUTPUT
Balas HANYA dengan JSON, tanpa teks pembuka, tanpa blok kode markdown:

{
  "tema": [
    {
      "judul": "string",
      "narasi": "string",
      "pendukung": [
        { "judul": "string", "link": "string" }
      ]
    }
  ],
  "penutup": "string"
}`;

/** Susun bahan dari arsip jadi prompt. */
function buildPrompt(items) {
  const lines = items.map((item, index) => {
    const tanggal = item.sent_at ? item.sent_at.slice(0, 10) : '-';
    return `[${index}] ${item.judul}
${item.kategori} | ${item.sumber} | ${tanggal} | skor ${item.skor}
${item.url}
${(item.ringkasan ?? '').slice(0, 200)}`;
  });

  return `Item yang dikirim ke pembaca sepanjang minggu ini (${items.length} item):

${lines.join('\n\n')}

Tulis rangkuman polanya sesuai aturan.`;
}

/** Validasi output model. */
function validate(raw) {
  if (!raw || !Array.isArray(raw.tema)) {
    throw new AppError('Output weekly bukan format yang diharapkan', { code: 'BAD_OUTPUT' });
  }

  const tema = raw.tema
    .filter((t) => t?.judul && t?.narasi)
    .map((t) => ({
      judul: String(t.judul).slice(0, 120),
      narasi: String(t.narasi).slice(0, 1000),
      pendukung: Array.isArray(t.pendukung)
        ? t.pendukung
            .filter((p) => p?.judul && p?.link)
            .slice(0, 4)
            .map((p) => ({ judul: String(p.judul).slice(0, 150), link: String(p.link) }))
        : [],
    }));

  return {
    tema,
    penutup: String(raw.penutup ?? '').slice(0, 800),
  };
}

function stripFence(text) {
  return String(text ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function isRetryable(error) {
  const text = String(error?.message ?? '');
  return (
    text.includes('503') ||
    text.includes('429') ||
    text.includes('504') ||
    text.includes('UNAVAILABLE') ||
    text.includes('RESOURCE_EXHAUSTED')
  );
}

/**
 * Rangkuman mingguan. Tanpa tool — semua bahan sudah ada di arsip,
 * jadi cukup satu panggilan ke model.
 */
export async function runWeekly(config, items) {
  if (!config.gemini.apiKey) {
    throw new AppError('GEMINI_API_KEY belum diisi', { code: 'CONFIG_ERROR' });
  }

  const ai = new GoogleGenAI({
    apiKey: config.gemini.apiKey,
    httpOptions: {
      headers: { 'Accept-Encoding': 'identity' },
      timeout: 120000,
    },
  });

  let lastError;

  for (const model of config.gemini.models) {
    try {
      logger.info('weekly.start', { model, items: items.length });

      const response = await withRetry(
        () =>
          ai.models.generateContent({
            model,
            contents: buildPrompt(items),
            config: { systemInstruction: SYSTEM_PROMPT },
          }),
        {
          label: `gemini.weekly.${model}`,
          retries: 3,
          baseDelay: 5000,
          maxDelay: 60000,
          isRetryable,
        }
      );

      const text = stripFence(response.text);
      const result = validate(JSON.parse(text));

      logger.info('weekly.done', { model, tema: result.tema.length });
      return result;
    } catch (error) {
      lastError = error;
      if (!isRetryable(error)) throw error;
      logger.warn('weekly.model_unavailable', {
        model,
        error: String(error.message).slice(0, 120),
      });
    }
  }

  throw new AppError(
    `Semua model tidak tersedia untuk weekly. Terakhir: ${String(lastError?.message).slice(0, 200)}`,
    { code: 'ALL_MODELS_BUSY' }
  );
}