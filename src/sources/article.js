import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { HttpError } from '../lib/errors.js';
import { withRetry } from '../lib/retry.js';

const MAX_CHARS = 4000;

/**
 * Ambil isi artikel bersih tanpa iklan dan navigasi.
 * Penting: tanpa ini, satu halaman bisa menelan puluhan ribu token.
 */
export async function fetchArticle(url) {
  const html = await withRetry(
    async () => {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) {
        throw new HttpError(`Gagal buka ${url}: ${response.statusText}`, {
          status: response.status,
        });
      }

      return response.text();
    },
    { label: 'article.fetch', retries: 1 }
  );

  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();

  if (!article) {
    return { url, title: null, text: null, error: 'Isi artikel tidak bisa diekstrak' };
  }

  return {
    url,
    title: article.title,
    byline: article.byline ?? null,
    text: (article.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_CHARS),
  };
}