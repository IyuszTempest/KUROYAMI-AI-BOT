import {
  searchNews,
  searchAnimeNews,
  formatNewsContext
} from '../features/news/index.js';
import { askKuro } from '../ai.js';
import { isAnimeRequest, handleAnimeRequest } from '../features/anime/handler.js';
import { isCurrencyRequest, handleCurrencyRequest } from '../features/currency/handler.js';

function isNewsRequest(text) {
  return /\b(berita|beritanya|kabar|breaking news|news)\b/i.test(String(text || ''));
}

function isAnimeNewsRequest(text) {
  return /berita\s+anime|anime\s+terbaru|proyek\s+anime|project\s+anime|anime\s+baru|anime\s+yang\s+baru\s+diumumkan|pengumuman\s+anime|adaptasi\s+anime|film\s+anime|jadwal\s+anime\s+terbaru|anime\s+announcement|anime\s+news/i.test(String(text || ''));
}

function cleanArticleText(value = '') {
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function formatNewsList(result, { anime = false, limit = 5 } = {}) {
  const articles = (result?.results || []).slice(0, limit);
  if (!articles.length) {
    return anime
      ? 'Maaf, berita anime belum berhasil ditemukan. Coba lagi beberapa saat nanti, ya.'
      : 'Maaf, berita belum berhasil ditemukan. Coba kata kunci lain atau ulangi beberapa saat lagi, ya.';
  }

  const heading = anime ? 'Berita Anime Terbaru' : 'Berita Terbaru';
  const blocks = articles.map((article, i) => {
    const title = cleanArticleText(article.title) || 'Judul tidak tersedia';
    const description = cleanArticleText(article.description || 'Ringkasan tidak tersedia.');
    const summary = description.length > 360 ? `${description.slice(0, 357).trimEnd()}...` : description;
    const source = cleanArticleText(article.source || 'Sumber tidak diketahui');
    const link = /^https?:\/\//i.test(article.link || '') ? article.link : '';
    return [
      `${i + 1}. ${title}`,
      summary,
      `Sumber: ${source}`,
      link ? `Baca selengkapnya: ${link}` : ''
    ].filter(Boolean).join('\n');
  });

  // Kirim URL artikel sebagai teks biasa agar WhatsApp bisa membuat link preview.
  // Tidak menggunakan caption gambar, sehingga ringkasan tidak terpotong batas caption.
  return `${heading}\n${'─'.repeat(18)}\n\n${blocks.join('\n\n')}`;
}

export async function routeFeature({ prompt = '', history = [], groupName = 'grup WhatsApp', media = [], debug = false }) {
  const hasMedia = Array.isArray(media) && media.length > 0;

  if (!hasMedia && isAnimeNewsRequest(prompt)) {
    if (debug) console.log('[ANIME NEWS] Mencari berita anime:', prompt);
    const newsResult = await searchAnimeNews({ maxResults: 8 });
    if (debug) {
      console.log('[ANIME NEWS] Penyedia:', newsResult.provider || 'tidak tersedia');
      console.log('[ANIME NEWS] Jumlah artikel:', newsResult.results?.length || 0);
      if (newsResult.errors?.length) console.log('[ANIME NEWS] Detail pencarian:', newsResult.errors);
    }
    return formatNewsList(newsResult, { anime: true, limit: 5 });
  }

  if (!hasMedia && isNewsRequest(prompt)) {
    const newsResult = await searchNews(prompt, { maxResults: 5 });
    return formatNewsList(newsResult, { limit: 5 });
  }

  if (!hasMedia && isAnimeRequest(prompt)) {
    return await handleAnimeRequest(prompt);
  }

  if (!hasMedia && isCurrencyRequest(prompt)) {
    return await handleCurrencyRequest(prompt);
  }

  return await askKuro({ text: prompt, history, groupName, media });
}
