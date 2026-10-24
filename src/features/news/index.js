import { newsConfig } from '../../config/news.config.js';

const GOOGLE_NEWS_RSS = 'https://news.google.com/rss/search';
const LIVECHART_RSS = 'https://www.livechart.me/feeds/headlines';
const TIME_ZONE = 'Asia/Jakarta';

const CATEGORY_QUERIES = {
  politik: 'politik Indonesia',
  ekonomi: 'ekonomi Indonesia bisnis pasar',
  teknologi: 'teknologi Indonesia AI startup',
  olahraga: 'olahraga Indonesia sepak bola',
  hiburan: 'hiburan Indonesia selebriti film musik',
  kesehatan: 'kesehatan Indonesia',
  pendidikan: 'pendidikan Indonesia',
  kriminal: 'kriminal Indonesia',
  gempa: 'gempa Indonesia BMKG',
  bencana: 'bencana Indonesia banjir longsor',
  dunia: 'berita internasional dunia'
};

function decodeXml(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : _;
    })
    .trim();
}

function getTag(xml, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(
    new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}\\s*>`, 'i')
  );

  return match ? decodeXml(match[1]) : '';
}

function hostOf(value = '') {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function domainMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function allowedByDomain(item) {
  const host = hostOf(item.sourceUrl || item.link);

  if (
    newsConfig.blockedDomains?.some(domain =>
      domainMatches(host, domain)
    )
  ) {
    return false;
  }

  if (newsConfig.allowedDomains?.length) {
    return newsConfig.allowedDomains.some(domain =>
      domainMatches(host, domain)
    );
  }

  return true;
}

function parseRss(xml) {
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item\s*>/gi) || [];

  return items.map(item => {
    const sourceMatch = item.match(
      /<source(?:\s+url="([^"]*)")?[^>]*>([\s\S]*?)<\/source\s*>/i
    );

    const imageMatch =
  item.match(/<media:content\b[^>]*\burl=["']([^"']+)["']/i) ||
  item.match(/<media:thumbnail\b[^>]*\burl=["']([^"']+)["']/i) ||
  item.match(/<enclosure\b[^>]*\burl=["']([^"']+)["']/i);

const imageUrl = imageMatch
  ? decodeXml(imageMatch[1])
  : '';

    const rawDate = getTag(item, 'pubDate');
    const parsedDate = rawDate ? Date.parse(rawDate) : NaN;

    const link = getTag(item, 'link');

    return {
      title: getTag(item, 'title'),
      link,
      imageUrl,
      description: getTag(item, 'description')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
      source: sourceMatch?.[2]
        ? decodeXml(sourceMatch[2])
        : hostOf(link),
      sourceUrl: sourceMatch?.[1]
        ? decodeXml(sourceMatch[1])
        : link,
      publishedAt: Number.isFinite(parsedDate)
        ? new Date(parsedDate).toISOString()
        : null
    };
  });
}

function normalizeResult(item) {
  const link = String(item.link || item.url || '').trim();

  if (!/^https?:\/\//i.test(link)) return null;

  const rawDate = item.publishedAt || item.published_at || item.page_age || null;
  const parsedDate = rawDate ? Date.parse(rawDate) : NaN;

  return {
    title: String(item.title || '').trim(),
    link,
    imageUrl: String(item.imageUrl || item.thumbnail?.src || item.thumbnail || item.image || '').trim(),
    description: String(item.description || item.content || '').trim(),
    source: String(item.source || hostOf(link)).trim(),
    sourceUrl: item.sourceUrl || link,
    publishedAt: Number.isFinite(parsedDate)
      ? new Date(parsedDate).toISOString()
      : null
  };
}

function filterResults(results, maxResults) {
  const cutoff = Date.now() -
    (Number(newsConfig.maxAgeDays) || 7) * 24 * 60 * 60 * 1000;

  const seen = new Set();

  return results
    .map(normalizeResult)
    .filter(Boolean)
    .filter(item => item.title && item.link)
    .filter(allowedByDomain)
    .filter(item => {
      if (!item.publishedAt) return true;

      const timestamp = Date.parse(item.publishedAt);
      return Number.isFinite(timestamp) && timestamp <= Date.now() + 5 * 60 * 1000 &&
        timestamp >= cutoff;
    })
    .filter(item => {
      const key = item.link.split('#')[0].replace(/\/$/, '');

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const dateA = Date.parse(a.publishedAt || '') || 0;
      const dateB = Date.parse(b.publishedAt || '') || 0;
      return dateB - dateA;
    })
    .slice(0, maxResults);
}

async function fetchWithTimeout(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(
      Number(newsConfig.timeoutMs) || 10000
    )
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response;
}

function buildGoogleNewsUrl(query) {
  const url = new URL(GOOGLE_NEWS_RSS);

  url.searchParams.set('q', query);
  url.searchParams.set('hl', newsConfig.language || 'id');
  url.searchParams.set('gl', newsConfig.country || 'ID');
  url.searchParams.set(
    'ceid',
    `${newsConfig.country || 'ID'}:${newsConfig.language || 'id'}`
  );

  return url;
}

async function searchGoogleNews(query, maxResults) {
  const url = buildGoogleNewsUrl(query);

  console.log('[NEWS DEBUG] Mengakses Google News RSS:', url);

  const response = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; KuroyamiNews/2.0)',
      Accept: 'application/rss+xml, application/xml, text/xml'
    }
  });

  console.log('[NEWS DEBUG] HTTP status:', response.status);

  if (!response.ok) {
    throw new Error(`Google News RSS HTTP ${response.status}`);
  }

  const rssText = await response.text();

  console.log('[NEWS DEBUG] Panjang RSS:', rssText.length);

  if (!rssText.trim()) {
    throw new Error('Respons Google News RSS kosong.');
  }

  const parsed = parseRss(rssText);

  console.log('[NEWS DEBUG] Artikel hasil parsing:', parsed.length);

  const results = filterResults(parsed, maxResults);

  console.log('[NEWS DEBUG] Artikel setelah filter:', results.length);

  return {
    source: 'Google News RSS',
    query,
    results
  };
}

async function searchLiveChart(query, maxResults) {
  const response = await fetchWithTimeout(LIVECHART_RSS, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Kuroyami/1.0)',
      Accept: 'application/rss+xml, application/xml, text/xml'
    }
  });

  const xml = await response.text();
  const parsed = parseRss(xml);

  const results = parsed
    .map(item => ({
      ...item,
      source: 'LiveChart.me',
      sourceUrl: item.link
    }))
    .filter(item => item.title && item.link)
    .slice(0, maxResults);

  return {
    provider: 'LiveChart.me',
    query,
    results
  };
}

async function searchTavily(query, maxResults) {
  if (!newsConfig.tavilyApiKey) {
    throw new Error('TAVILY_API_KEY belum diatur');
  }

  const response = await fetchWithTimeout(
    'https://api.tavily.com/search',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: newsConfig.tavilyApiKey,
        query,
        topic: 'news',
        search_depth: 'basic',
        max_results: maxResults,
        days: Number(newsConfig.maxAgeDays) || 7,
        include_answer: false
      })
    }
  );

  const data = await response.json();

  return {
    provider: 'Tavily News',
    results: filterResults(
      (data.results || []).map(item => ({
        title: item.title,
        link: item.url,
        description: item.content,
        imageUrl: item.image || item.thumbnail || '',
        source: hostOf(item.url),
        publishedAt: item.published_date || null
      })),
      maxResults
    )
  };
}

async function searchBrave(query, maxResults) {
  if (!newsConfig.braveApiKey) {
    throw new Error('BRAVE_SEARCH_API_KEY belum diatur');
  }

  const url = new URL('https://api.search.brave.com/res/v1/news/search');

  url.searchParams.set('q', query);
  url.searchParams.set('count', String(Math.min(maxResults, 20)));
  url.searchParams.set('freshness', 'pw');

  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': newsConfig.braveApiKey
    }
  });

  const data = await response.json();

  return {
    provider: 'Brave News',
    results: filterResults(
      (data.results || []).map(item => ({
        title: item.title,
        link: item.url,
        description: item.description,
        imageUrl: item.thumbnail?.src || item.thumbnail || item.image || '',
        source: item.meta_url?.hostname || hostOf(item.url),
        publishedAt: item.page_age || item.age || null
      })),
      maxResults
    )
  };
}

function buildNewsQuery(query) {
  const text = String(query || '').trim();

  if (!text || /^(berita|berita terbaru|news)$/i.test(text)) {
    return 'berita terbaru Indonesia';
  }

  const category = Object.keys(CATEGORY_QUERIES).find(key =>
    new RegExp(`\\b${key}\\b`, 'i').test(text)
  );

  if (category) {
    const remaining = text
      .replace(/\b(berita|terbaru|terkini|hari ini|dong|tolong|cari)\b/gi, '')
      .trim();

    return remaining && remaining.toLowerCase() !== category
      ? `${CATEGORY_QUERIES[category]} ${remaining}`
      : CATEGORY_QUERIES[category];
  }

  return text;
}

export function resolveNewsQuery(query = '') {
  return buildNewsQuery(query);
}

export async function searchNews(query, options = {}) {
  const cleanQuery = String(query || '').trim();

  if (!newsConfig.enabled) {
    return {
      query: cleanQuery,
      results: [],
      reason: 'disabled'
    };
  }

  if (!cleanQuery) {
    return {
      query: '',
      results: [],
      reason: 'empty-query'
    };
  }

  const maxResults = Math.max(
    1,
    Math.min(20, Number(options.maxResults) || Number(newsConfig.maxResults) || 8)
  );

  const searchQuery = buildNewsQuery(cleanQuery);
  const providers = [
    searchGoogleNews,
    searchTavily,
    searchBrave
  ];

  const errors = [];

  for (const provider of providers) {
    try {
      const result = await provider(searchQuery, maxResults);

      if (result.results.length) {
        return {
          query: searchQuery,
          provider: result.provider,
          fetchedAt: new Date().toISOString(),
          results: result.results,
          errors
        };
      }

      errors.push(`${result.provider}: tidak menemukan hasil`);
    } catch (error) {
      errors.push(`${provider.name}: ${error.message}`);
      console.warn('[Kuroyami News]', provider.name, error.message);
    }
  }

  return {
    query: searchQuery,
    fetchedAt: new Date().toISOString(),
    results: [],
    reason: 'all-providers-failed',
    errors
  };
}
export async function searchAnimeNews(options = {}) {
  const maxResults = Math.max(
    1,
    Math.min(20, Number(options.maxResults) || 8)
  );

  try {
    const result = await searchLiveChart('anime news', maxResults);

    return {
      ...result,
      fetchedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('[LiveChart News]', error.message);

    return {
      provider: 'LiveChart.me',
      results: [],
      fetchedAt: new Date().toISOString(),
      reason: 'livechart-failed'
    };
  }
}

export function formatNewsContext(searchResult) {
  if (!searchResult?.results?.length) {
    return [
      'Pencarian berita tidak menemukan artikel yang bisa digunakan.',
      'Jangan mengarang berita, sumber, tanggal, atau tautan.',
      'Beri tahu pengguna bahwa layanan berita sedang tidak tersedia.'
    ].join(' ');
  }

  const articles = searchResult.results.map((item, index) => {
    const timestamp = item.publishedAt
      ? Date.parse(item.publishedAt)
      : NaN;

    const date = Number.isFinite(timestamp)
      ? new Intl.DateTimeFormat('id-ID', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: TIME_ZONE
        }).format(new Date(timestamp)) + ' WIB'
      : 'waktu publikasi tidak tersedia';

    return [
      `${index + 1}. ${item.title}`,
      `Sumber: ${item.source || hostOf(item.link) || 'tidak diketahui'}`,
      `Publikasi: ${date}`,
      `Ringkasan sumber: ${item.description || 'Deskripsi tidak tersedia.'}`,
      `Tautan asli: ${item.link}`
    ].join('\n');
  });

  return [
    `Penyedia pencarian: ${searchResult.provider || 'tidak diketahui'}`,
    `Waktu pengambilan data: ${new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: TIME_ZONE
    }).format(new Date(searchResult.fetchedAt || Date.now()))} WIB`,
    'Gunakan hanya informasi yang didukung hasil pencarian.',
    'Jangan mengarang tanggal, isi artikel, atau klaim bahwa berita terverifikasi.',
    '',
    articles.join('\n\n')
  ].join('\n');
}