import { HttpError } from '../lib/errors.js';
import { withRetry } from '../lib/retry.js';
import { logger } from '../lib/logger.js';

const API = 'https://api.github.com';

/** Rilis terbaru satu repo. Mengikuti redirect kalau repo sudah pindah nama. */
export async function latestRelease(repo, token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'Accept-Encoding': 'identity',
    'User-Agent': 'tech-news-agent/1.0',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const request = async (url, depth = 0) => {
    const response = await fetch(url, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    });

    if (response.status === 404) return null;

    // Repo dipindah atau diganti nama — ikuti alamat barunya.
    if (response.status >= 300 && response.status < 400 && depth < 3) {
      const body = await response.json().catch(() => ({}));
      const next = response.headers.get('location') ?? body.url;
      if (next) return request(next, depth + 1);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new HttpError(
        `GitHub ${repo} gagal (${response.status}): ${detail.slice(0, 120)}`,
        { status: response.status }
      );
    }

    return response.json();
  };

  const release = await withRetry(
    () => request(`${API}/repos/${repo}/releases/latest`),
    { label: `github.${repo}`, retries: 2 }
  );

  if (!release) return null;

  return {
    title: `${repo} ${release.tag_name}`,
    link: release.html_url,
    publishedAt: release.published_at ?? null,
    snippet: (release.body ?? '').trim().slice(0, 500),
    source: 'GitHub Releases',
    sourceId: 'github',
    category: 'rilis-versi',
    weight: 1.0,
    isOfficial: true,
  };
}

/** Cek banyak repo, sisakan yang rilisnya dalam N jam terakhir. */
export async function checkReleases(repos, { token, hours = 48 } = {}) {
  const settled = await Promise.allSettled(repos.map((repo) => latestRelease(repo, token)));

  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const items = [];
  const failures = [];

  settled.forEach((result, index) => {
    const repo = repos[index];

    if (result.status === 'rejected') {
      failures.push({ feed: `github:${repo}`, error: result.reason.message });
      logger.warn('github.fail', { repo, error: result.reason.message });
      return;
    }

    const release = result.value;
    if (!release?.publishedAt) return;
    if (new Date(release.publishedAt).getTime() < cutoff) return;

    items.push(release);
    logger.info('github.new_release', { repo, tag: release.title });
  });

  return { items, failures };
}