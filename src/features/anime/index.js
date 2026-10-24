const ANILIST_API = 'https://graphql.anilist.co';

async function anilistQuery(query, variables = {}) {
  const response = await fetch(ANILIST_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15000)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.errors?.length) {
    throw new Error(
      data.errors?.[0]?.message ||
      `AniList API error: HTTP ${response.status}`
    );
  }

  return data.data;
}

const MEDIA_FIELDS = `
  id
  title {
    romaji
    english
    native
  }
  siteUrl
  description(asHtml: false)
  format
  status
  episodes
  season
  seasonYear
  averageScore
  genres
  coverImage {
    large
  }
  startDate {
    year
    month
    day
  }
  nextAiringEpisode {
    episode
    airingAt
    timeUntilAiring
  }
`;

function cleanText(text = '') {
  return String(text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getTitle(anime) {
  return (
    anime.title?.english ||
    anime.title?.romaji ||
    anime.title?.native ||
    'Judul tidak tersedia'
  );
}

function getStatus(status) {
  const statuses = {
    FINISHED: 'Tamat',
    RELEASING: 'Sedang tayang',
    NOT_YET_RELEASED: 'Belum tayang',
    CANCELLED: 'Dibatalkan',
    HIATUS: 'Hiatus'
  };

  return statuses[status] || status || 'Tidak diketahui';
}

function getFormat(format) {
  const formats = {
    TV: 'TV',
    TV_SHORT: 'TV Short',
    MOVIE: 'Film',
    SPECIAL: 'Special',
    OVA: 'OVA',
    ONA: 'ONA',
    MUSIC: 'Music'
  };

  return formats[format] || format || 'Tidak diketahui';
}

function formatDate(date) {
  if (!date?.year) return 'Tidak diketahui';

  const month = date.month
    ? String(date.month).padStart(2, '0')
    : '01';

  const day = date.day
    ? String(date.day).padStart(2, '0')
    : '01';

  return `${day}/${month}/${date.year}`;
}

function formatAnime(anime, index) {
  const title = getTitle(anime);
  const description = cleanText(anime.description || '');
  const synopsis = description
    ? description.length > 550
      ? `${description.slice(0, 547)}...`
      : description
    : 'Sinopsis belum tersedia.';

  const genres = anime.genres?.length
    ? anime.genres.join(', ')
    : 'Belum tersedia';

  const score = anime.averageScore != null
    ? `${anime.averageScore}/100`
    : 'Belum tersedia';

  const episodes = anime.episodes ?? 'Belum diketahui';

  const airing = anime.nextAiringEpisode
    ? `\nEpisode berikutnya: ${anime.nextAiringEpisode.episode}` +
      `\nTayang dalam: ${formatDuration(anime.nextAiringEpisode.timeUntilAiring)}`
    : '';

  return [
    `${index}. ${title}`,
    anime.title?.english && anime.title?.romaji
      ? `Judul Jepang/Romaji: ${anime.title.romaji}`
      : null,
    `Format: ${getFormat(anime.format)}`,
    `Status: ${getStatus(anime.status)}`,
    `Rilis: ${formatDate(anime.startDate)}`,
    `Episode: ${episodes}`,
    `Skor AniList: ${score}`,
    `Genre: ${genres}`,
    '',
    `Sinopsis: ${synopsis}`,
    airing,
    `Sumber: ${anime.siteUrl}`
  ].filter(Boolean).join('\n');
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 'Belum diketahui';
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);

  if (days > 0) return `${days} hari ${hours} jam`;
  if (hours > 0) return `${hours} jam`;

  return `${Math.max(1, Math.floor(seconds / 60))} menit`;
}

const SEARCH_QUERY = `
  query ($search: String, $genre: String, $season: MediaSeason,
         $seasonYear: Int, $status: MediaStatus, $page: Int,
         $sort: [MediaSort]) {
    Page(page: $page, perPage: 10) {
      media(
        search: $search
        genre: $genre
        season: $season
        seasonYear: $seasonYear
        status: $status
        type: ANIME
        sort: $sort
      ) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;

export async function searchAnime(keyword, options = {}) {
  const data = await anilistQuery(SEARCH_QUERY, {
    search: keyword || undefined,
    genre: options.genre || undefined,
    season: options.season || undefined,
    seasonYear: options.seasonYear || undefined,
    status: options.status || undefined,
    page: 1,
    sort: options.sort || ['SEARCH_MATCH', 'POPULARITY_DESC']
  });

  return data.Page.media;
}

export async function getAnimeInfo(keyword) {
  const results = await searchAnime(keyword, {
    sort: ['SEARCH_MATCH']
  });

  return results[0] || null;
}

export async function getTrendingAnime() {
  const query = `
    query {
      Page(page: 1, perPage: 10) {
        media(
          type: ANIME
          sort: TRENDING_DESC
          status_not: CANCELLED
        ) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const data = await anilistQuery(query);
  return data.Page.media;
}

export async function getSeasonAnime(season, year) {
  const data = await anilistQuery(SEARCH_QUERY, {
    season,
    seasonYear: Number(year),
    page: 1,
    sort: ['POPULARITY_DESC']
  });

  return data.Page.media;
}

export async function getAiringAnime() {
  const data = await anilistQuery(SEARCH_QUERY, {
    status: 'RELEASING',
    page: 1,
    sort: ['POPULARITY_DESC']
  });

  return data.Page.media;
}

export function formatAnimeResults(animeList) {
  if (!animeList?.length) {
    return 'Yah, anime yang cocok nggak ketemu. Coba judul atau genre lain, ya.';
  }

  return animeList
    .slice(0, 5)
    .map((anime, index) => formatAnime(anime, index + 1))
    .join('\n\n━━━━━━━━━━━━━━\n\n');
}