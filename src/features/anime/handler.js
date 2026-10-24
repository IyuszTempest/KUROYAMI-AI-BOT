import {
  searchAnime,
  getAnimeInfo,
  getSeasonAnime,
  getAiringAnime,
  formatAnimeResults
} from './index.js';

export function isAnimeRequest(text = '') {
  const value = String(text || '').trim();

  if (!value) return false;

  // Permintaan berita anime ditangani oleh fitur Anime News.
  if (
    /\b(berita|news|pengumuman|proyek baru|project baru|adaptasi baru)\b/i.test(value) &&
    /\b(anime|isekai|manga|waifu|season|studio)\b/i.test(value)
  ) {
    return false;
  }

  return /\b(anime|isekai|waifu)\b/i.test(value);
}

export async function handleAnimeRequest(text = '') {
  const lower = text.toLowerCase().trim();

  try {
    if (/\b(rekomendasi|recommend|saran anime|anime mirip)\b/i.test(lower)) {
      const genres = [
        'Isekai',
        'Romance',
        'Action',
        'Comedy',
        'Fantasy',
        'Horror',
        'Drama',
        'Sports',
        'Sci-Fi',
        'Slice of Life'
      ];

      const genre = genres.find(g =>
        lower.includes(g.toLowerCase())
      );

      const results = await searchAnime('', {
        genre,
        sort: ['SCORE_DESC', 'POPULARITY_DESC']
      });

      return `Nih rekomendasi anime${genre ? ` genre ${genre}` : ''} buat lu!\n\n${
        formatAnimeResults(results)
      }`;
    }

    if (/\b(lagi tayang|sedang tayang|ongoing|yang tayang)\b/i.test(lower)) {
      const results = await getAiringAnime();

      return `Nih beberapa anime yang sedang tayang!\n\n${
        formatAnimeResults(results)
      }`;
    }

    if (/\b(season terbaru|season sekarang|musim ini|trending|anime terbaru)\b/i.test(lower)) {
      const now = new Date();
      const month = now.getUTCMonth() + 1;

      const season = month <= 3
        ? 'WINTER'
        : month <= 6
          ? 'SPRING'
          : month <= 9
            ? 'SUMMER'
            : 'FALL';

      const results = await getSeasonAnime(
        season,
        now.getUTCFullYear()
      );

      return `Anime musim ${season} ${now.getUTCFullYear()}:\n\n${
        formatAnimeResults(results)
      }`;
    }

    const infoMatch = lower.match(/^(?:info|detail|sinopsis)\s+anime\s+(.+)/i);

    if (infoMatch) {
      const title = text.trim().replace(/^(?:info|detail|sinopsis)\s+anime\s+/i, '');
      const anime = await getAnimeInfo(title);

      return anime
        ? formatAnimeResults([anime])
        : `Anime "${title}" nggak ketemu di AniList.`;
    }

    const keyword = text
      .replace(/@\d+/g, '')
      .replace(/\b(cari|search|info|tentang|anime|dong|tolong)\b/gi, '')
      .trim();

    if (!keyword) {
      return 'Mau cari anime apa, nih? Contoh: anime Solo Leveling';
    }

    const results = await searchAnime(keyword);

    return formatAnimeResults(results);
  } catch (error) {
    console.error('[Anime] Error:', error.message);

    return 'Yah, pencarian anime lagi bermasalah. Coba lagi sebentar, ya.';
  }
}