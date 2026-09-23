import { HttpError } from '../lib/errors.js';
import { withRetry } from '../lib/retry.js';

const API_BASE = 'https://api.cloudflare.com/client/v4';

/**
 * Klien D1 lewat REST API.
 * D1 biasanya diakses dari Workers, tapi REST API memungkinkan
 * GitHub Actions dan skrip lokal ikut membacanya.
 */
export function createDb(config) {
  const { accountId, apiToken, databaseId } = config.d1;
  const endpoint = `${API_BASE}/accounts/${accountId}/d1/database/${databaseId}/query`;

  async function run(sql, params = []) {
    const request = async () => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          'Accept-Encoding': 'identity',
        },
        body: JSON.stringify({ sql, params }),
        signal: AbortSignal.timeout(20000),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok || body.success === false) {
        const detail = body.errors?.[0]?.message ?? response.statusText;
        throw new HttpError(`D1 gagal: ${detail}`, { status: response.status, body });
      }

      return body.result?.[0] ?? { results: [], meta: {} };
    };

    return withRetry(request, { label: 'd1.query', retries: 2 });
  }

  return {
    /** Query yang mengembalikan baris. */
    async all(sql, params) {
      const result = await run(sql, params);
      return result.results ?? [];
    },

    /** Query yang mengembalikan satu baris atau null. */
    async first(sql, params) {
      const rows = await this.all(sql, params);
      return rows[0] ?? null;
    },

    /** Query tulis. Mengembalikan metadata, bukan baris. */
    async exec(sql, params) {
      const result = await run(sql, params);
      return result.meta ?? {};
    },
  };
}