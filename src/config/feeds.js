/**
 * Sumber RSS — tulang punggung, gratis dan tak terbatas.
 * Tavily menambah cakupan di luar daftar ini.
 */
export const FEEDS = [
  // Umum / industri
  { id: 'hackernews', name: 'Hacker News', url: 'https://hnrss.org/frontpage?points=100', category: 'industri', weight: 1.0 },
  { id: 'techcrunch', name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'industri', weight: 0.8 },
  { id: 'theverge', name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', category: 'industri', weight: 0.7 },
  { id: 'arstechnica', name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', category: 'industri', weight: 0.8 },
  { id: 'infoq', name: 'InfoQ', url: 'https://feed.infoq.com/', category: 'industri', weight: 0.8 },

  // AI / model
  { id: 'openai', name: 'OpenAI', url: 'https://openai.com/blog/rss.xml', category: 'model-ai', weight: 1.0 },
  { id: 'googleai', name: 'Google AI Blog', url: 'https://blog.google/technology/ai/rss/', category: 'model-ai', weight: 1.0 },
  { id: 'huggingface', name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml', category: 'model-ai', weight: 0.9 },
  { id: 'deepmind', name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml', category: 'model-ai', weight: 0.9 },

  // Web dev / framework
  { id: 'webdev', name: 'web.dev', url: 'https://web.dev/static/blog/feed.xml', category: 'rilis-versi', weight: 0.9 },
  { id: 'nodejs', name: 'Node.js Blog', url: 'https://nodejs.org/en/feed/blog.xml', category: 'rilis-versi', weight: 1.0 },
  { id: 'reactblog', name: 'React Blog', url: 'https://react.dev/rss.xml', category: 'rilis-versi', weight: 1.0 },
  { id: 'vercel', name: 'Vercel', url: 'https://vercel.com/atom', category: 'rilis-versi', weight: 0.8 },
  { id: 'css-tricks', name: 'CSS-Tricks', url: 'https://css-tricks.com/feed/', category: 'rilis-versi', weight: 0.6 },

  // SEO / schema
  { id: 'seroundtable', name: 'Search Engine Roundtable', url: 'https://www.seroundtable.com/index.rdf', category: 'industri', weight: 0.9 },
  { id: 'searchengineland', name: 'Search Engine Land', url: 'https://searchengineland.com/feed', category: 'industri', weight: 0.8 },

  // Infrastruktur / cloud
  { id: 'aws', name: 'AWS News', url: 'https://aws.amazon.com/about-aws/whats-new/recent/feed/', category: 'infrastruktur', weight: 0.7 },
  { id: 'cloudflare', name: 'Cloudflare Blog', url: 'https://blog.cloudflare.com/rss/', category: 'infrastruktur', weight: 0.8 },

  // Indonesia
  { id: 'dailysocial', name: 'DailySocial', url: 'https://dailysocial.id/feed', category: 'indonesia', weight: 0.8 },
  { id: 'techinasia', name: 'Tech in Asia', url: 'https://www.techinasia.com/feed', category: 'indonesia', weight: 0.8 },
];

/** Repo yang rilisnya dipantau langsung dari GitHub. */
export const WATCHED_REPOS = [
  'facebook/react',
  'nodejs/node',
  'tailwindlabs/tailwindcss',
  'vercel/next.js',
  'microsoft/TypeScript',
  'vitejs/vite',
  'expressjs/express',
  'prisma/prisma',
  'langchain-ai/langchainjs',
  'supabase/supabase',
];

/**
 * Query dasar untuk Tavily. Agent boleh menambah query sendiri
 * di tahap berikutnya — ini hanya jaring pengaman.
 */
export const DISCOVERY_QUERIES = [
  'new AI model release',
  'major framework version release',
  'AI infrastructure data center announcement',
  'developer tool launch',
  'programming language release',
];

export const MAX_ITEMS = 100;