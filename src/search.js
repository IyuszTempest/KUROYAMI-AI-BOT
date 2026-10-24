const SEARCH_URL = 'https://puri.li/api/search';

export async function searchWeb(query) {
  const url = new URL(SEARCH_URL);
  url.searchParams.set('q', query);

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`Pencarian web gagal: HTTP ${response.status}`);
  }

  const data = await response.json();

  return (data.results || []).slice(0, 5).map(item => ({
    title: item.title || '',
    url: item.url || '',
    description: item.description || ''
  }));
}