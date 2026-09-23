import { GoogleGenAI } from '@google/genai';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';
import { TOOL_DECLARATIONS, createToolRunners } from './tools.js';
import { withRetry } from '../lib/retry.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';

const MAX_TOOL_CALLS = 15;
const MAX_DURATION_MS = 3 * 60 * 1000;

/** Bersihkan pagar markdown yang kadang dibungkus model di sekitar JSON. */
function stripFence(text) {
  return String(text ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

/** 503 dan 429 dari Gemini layak dicoba ulang atau dipindah ke model lain. */
function isRetryableGeminiError(error) {
  const text = String(error?.message ?? '');
  return text.includes('503') || text.includes('429') || text.includes('UNAVAILABLE');
}

/** Validasi bentuk output model. Item cacat dibuang, bukan menjatuhkan run. */
function validateItems(raw) {
  if (!Array.isArray(raw)) {
    throw new AppError('Output model bukan array', { code: 'BAD_OUTPUT' });
  }

  const valid = [];
  let rejected = 0;

  for (const item of raw) {
    if (!item?.judul || !item?.link) {
      rejected += 1;
      continue;
    }

    valid.push({
      kategori: item.kategori ?? 'industri',
      judul: String(item.judul).slice(0, 200),
      ringkasan: String(item.ringkasan ?? '').slice(0, 500),
      link: String(item.link),
      sumber: String(item.sumber ?? 'web'),
      pendukung: Number(item.pendukung) || 1,
      sumberResmi: Boolean(item.sumber_resmi),
      skor: Number(item.skor) || 5,
    });
  }

  if (rejected > 0) logger.warn('agent.items_rejected', { count: rejected });
  return valid;
}

/**
 * Satu percobaan penuh dengan satu model.
 * Model memutuskan sendiri tool mana yang dipanggil dan kapan berhenti.
 */
async function runWithModel(config, model, candidates, history) {
  const ai = new GoogleGenAI({
    apiKey: config.gemini.apiKey,
    // Kompresi dimatikan — jalur jaringan tertentu merusak respons gzip.
    httpOptions: {
      headers: { 'Accept-Encoding': 'identity' },
      timeout: 120000,
    },
  });

  const chat = ai.chats.create({
    model,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
    },
  });

  const runners = createToolRunners(config);
  const startedAt = Date.now();
  let toolCalls = 0;
  let message = buildUserPrompt(candidates, { history });

  logger.info('agent.start', { model, candidates: candidates.length });

  while (true) {
    if (Date.now() - startedAt > MAX_DURATION_MS) {
      logger.warn('agent.timeout', { toolCalls });
      message = 'Waktu habis. Langsung keluarkan JSON hasil kurasi dari yang sudah kamu tahu.';
    }

    const response = await withRetry(() => chat.sendMessage({ message }), {
      label: `gemini.${model}`,
      retries: 2,
      baseDelay: 2000,
      isRetryable: isRetryableGeminiError,
    });

    const calls = response.functionCalls ?? [];

    // Tidak ada tool call berarti model sudah selesai dan mengeluarkan jawaban.
    if (calls.length === 0) {
      const text = stripFence(response.text);
      logger.info('agent.done', { model, toolCalls, ms: Date.now() - startedAt });

      try {
        return validateItems(JSON.parse(text));
      } catch (error) {
        logger.error('agent.parse_failed', {
          error: error.message,
          preview: text.slice(0, 300),
        });
        throw new AppError(`Gagal parse output agent: ${error.message}`, { code: 'BAD_OUTPUT' });
      }
    }

    // Batas tool call tercapai — paksa model menyimpulkan.
    if (toolCalls + calls.length > MAX_TOOL_CALLS) {
      logger.warn('agent.tool_limit', { toolCalls });
      message = 'Batas pemanggilan tool tercapai. Langsung keluarkan JSON hasil kurasi.';
      continue;
    }

    const parts = [];

    for (const call of calls) {
      toolCalls += 1;
      const runner = runners[call.name];
      const stepStart = Date.now();

      const output = runner
        ? await runner(call.args ?? {})
        : { error: `Tool tidak dikenal: ${call.name}` };

      logger.info('agent.tool_call', {
        tool: call.name,
        args: call.args,
        ms: Date.now() - stepStart,
        ok: !output.error,
        n: toolCalls,
      });

      parts.push({
        functionResponse: { name: call.name, response: output },
      });
    }

    message = parts;
  }
}

/**
 * Loop agent dengan fallback antar model.
 * Kalau satu model penuh (503), pindah ke model berikutnya di daftar.
 */
export async function runAgent(config, candidates, { history = [] } = {}) {
  if (!config.gemini.apiKey) {
    throw new AppError('GEMINI_API_KEY belum diisi', { code: 'CONFIG_ERROR' });
  }

  let lastError;

  for (const model of config.gemini.models) {
    try {
      return await runWithModel(config, model, candidates, history);
    } catch (error) {
      lastError = error;

      // Error selain kepadatan server tidak layak dicoba di model lain.
      if (!isRetryableGeminiError(error)) throw error;

      logger.warn('agent.model_unavailable', {
        model,
        error: String(error.message).slice(0, 120),
      });
    }
  }

  throw new AppError(
    `Semua model Gemini tidak tersedia. Terakhir: ${String(lastError?.message).slice(0, 200)}`,
    { code: 'ALL_MODELS_BUSY' }
  );
}