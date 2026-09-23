import { fetchFeed } from '../sources/rss.js';
import { searchNews } from '../sources/tavily.js';
import { latestRelease } from '../sources/github.js';
import { fetchArticle } from '../sources/article.js';
import { FEEDS } from '../config/feeds.js';

/**
 * Deklarasi tool untuk Gemini.
 * Model membaca deskripsi ini untuk memutuskan kapan memanggil apa.
 */
export const TOOL_DECLARATIONS = [
  {
    name: 'search_news',
    description:
      'Cari berita teknologi terbaru di web berdasarkan kata kunci. Gunakan untuk menemukan berita yang tidak ada di daftar kandidat, memverifikasi kabar dari sumber tunggal, atau menggali topik yang kamu anggap penting.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Kata kunci pencarian dalam bahasa Inggris' },
        days: { type: 'number', description: 'Rentang hari ke belakang, default 2' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_page',
    description:
      'Buka satu halaman web dan ambil isi artikelnya. Gunakan kalau judul menarik tapi ringkasannya terlalu tipis untuk ditulis ulang dengan akurat. Mahal, pakai seperlunya.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL lengkap halaman' },
      },
      required: ['url'],
    },
  },
  {
    name: 'check_github_release',
    description:
      'Cek rilis terbaru sebuah repo GitHub, termasuk catatan rilisnya. Gunakan untuk memastikan versi dan isi perubahan sebuah library.',
    parameters: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Format owner/nama, contoh facebook/react' },
      },
      required: ['repo'],
    },
  },
  {
    name: 'read_feed',
    description:
      'Baca satu RSS feed dari daftar sumber yang tersedia. Gunakan kalau butuh melihat lebih banyak item dari sumber tertentu.',
    parameters: {
      type: 'object',
      properties: {
        feed_id: {
          type: 'string',
          description: `ID feed. Pilihan: ${FEEDS.map((f) => f.id).join(', ')}`,
        },
      },
      required: ['feed_id'],
    },
  },
];

/**
 * Implementasi tool. Tiap fungsi mengembalikan objek biasa,
 * bukan melempar error — agent perlu tahu kalau sesuatu gagal
 * supaya bisa mencoba pendekatan lain.
 */
export function createToolRunners(config) {
  return {
    async search_news({ query, days = 2 }) {
      try {
        const results = await searchNews(config.tavily.apiKey, query, {
          days,
          maxResults: 8,
        });
        return {
          count: results.length,
          results: results.map((r) => ({
            title: r.title,
            url: r.link,
            source: r.source,
            published: r.publishedAt,
            snippet: r.snippet?.slice(0, 300),
          })),
        };
      } catch (error) {
        return { error: error.message };
      }
    },

    async fetch_page({ url }) {
      try {
        const article = await fetchArticle(url);
        return { title: article.title, text: article.text, error: article.error };
      } catch (error) {
        return { error: error.message };
      }
    },

    async check_github_release({ repo }) {
      try {
        const release = await latestRelease(repo, config.github.token);
        if (!release) return { found: false, repo };
        return {
          found: true,
          repo,
          version: release.title,
          url: release.link,
          published: release.publishedAt,
          notes: release.snippet,
        };
      } catch (error) {
        return { error: error.message };
      }
    },

    async read_feed({ feed_id }) {
      const feed = FEEDS.find((f) => f.id === feed_id);
      if (!feed) return { error: `Feed tidak dikenal: ${feed_id}` };

      try {
        const items = await fetchFeed(feed);
        return {
          count: items.length,
          items: items.slice(0, 20).map((i) => ({
            title: i.title,
            url: i.link,
            published: i.publishedAt,
          })),
        };
      } catch (error) {
        return { error: error.message };
      }
    },
  };
}