export const newsConfig = {
  enabled: (process.env.NEWS_SEARCH_ENABLED || 'true').toLowerCase() === 'true',
  language: process.env.NEWS_LANGUAGE || 'id',
  country: process.env.NEWS_COUNTRY || 'ID',
  maxResults: Number.parseInt(process.env.NEWS_MAX_RESULTS || '8', 10),
  maxAgeDays: Number.parseInt(process.env.NEWS_MAX_AGE_DAYS || '7', 10),
  allowedDomains: (process.env.NEWS_ALLOWED_DOMAINS || '')
    .split(',')
    .map((domain) => domain.trim())
    .filter(Boolean),
  blockedDomains: (process.env.NEWS_BLOCKED_DOMAINS || '')
    .split(',')
    .map((domain) => domain.trim())
    .filter(Boolean),
  timeoutMs: Number.parseInt(process.env.NEWS_TIMEOUT_MS || '15000', 10),
  tavilyApiKey: process.env.TAVILY_API_KEY || '',
  braveSearchApiKey: process.env.BRAVE_SEARCH_API_KEY || ''
};