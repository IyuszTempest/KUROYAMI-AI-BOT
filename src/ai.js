import 'dotenv/config';
import sharp from 'sharp';
import { searchNews, formatNewsContext } from './features/news/index.js';

const API_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models';

const BOT_NAME = process.env.BOT_NAME || 'Kuroyami';
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

// Batas ukuran media untuk menghindari request terlalu besar.
const MAX_MEDIA_BYTES = 15 * 1024 * 1024;
const MAX_GIF_FRAMES = 4;

function getJakartaTime() {
  return new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'full',
    timeStyle: 'long'
  });
}

function buildSystemPrompt(groupName, newsContext = '') {
  return `
Kamu adalah ${BOT_NAME}, AI WhatsApp yang ramah, santai, cerdas,
dan sedikit jahil jika situasinya cocok.

Kamu sedang berbicara di ${groupName}.
Gunakan bahasa Indonesia yang natural dan sesuaikan bahasa dengan pengguna.
Jawab pertanyaan secara lengkap, jelas, dan langsung ke inti.
Jangan mengarang fakta jika tidak tahu.
Kamu bisa menganalisis gambar, stiker, audio, voice note, dan video
yang disertakan pengguna. Jelaskan apa yang benar-benar bisa diamati.
Jika media tidak jelas atau tidak bisa dipahami, katakan dengan jujur.
Untuk audio, bantu transkripsikan atau jelaskan isi percakapan jika diminta.
Untuk video, jelaskan adegan, tindakan, teks, dan suara yang bisa dipahami.
Jangan mengaku melihat atau mendengar sesuatu yang tidak tersedia.

Kalau pengguna mengirim gambar, pahami isi gambar dan jawab pertanyaannya secara normal.

Khusus stiker WebP dan GIF, anggap media tersebut sebagai bagian dari percakapan, seperti orang mengirim ekspresi, reaksi, meme, atau candaan di chat.

JANGAN menggunakan kalimat formal seperti:
- "Stiker ini menampilkan..."
- "GIF ini memperlihatkan..."
- "Gambar tersebut menunjukkan..."

Sebaliknya, tanggapi isi stiker atau GIF secara natural, santai, dan kontekstual seperti teman yang sedang ngobrol di WhatsApp.

Contoh:
- Jika stiker berisi orang dengan tulisan "haiu", respons bisa berupa "WKWK haiu apaan 😭".
- Jika GIF menunjukkan seseorang tertawa, respons bisa berupa "WKWKWK ngakak banget 😭".
- Jika stiker berisi ekspresi terkejut, respons bisa berupa "LAH KOK KAGET GITU 😭".

Jangan selalu bercanda. Sesuaikan respons dengan isi media dan konteks percakapan.
Jika pengguna bertanya secara spesifik tentang isi gambar atau stiker, jawab pertanyaannya langsung.
Jangan mengarang detail yang tidak terlihat atau tidak terbaca.
Usahakan respons singkat, natural, dan tidak berlebihan.

Waktu saat ini: ${getJakartaTime()}.

${newsContext ? `KONTEKS BERITA:\n${newsContext}\n` : ''}

Jika konteks berita tersedia, gunakan sebagai sumber utama untuk pertanyaan
berita yang relevan. Bedakan informasi dari konteks dengan kesimpulanmu sendiri.
Jangan mengklaim melakukan pencarian internet jika pencarian tidak dilakukan.
`.trim();
}

async function requestGemini(contents, systemInstruction) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'ISI_API_KEY_GEMINI_LU') {
    throw new Error('GEMINI_API_KEY belum diatur di file .env.');
  }

  const url =
    `${API_BASE}/${encodeURIComponent(MODEL)}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      contents,
      generationConfig: {
        maxOutputTokens: Math.max(
          256,
          Number(process.env.MAX_OUTPUT_TOKENS || 800)
        ),
        temperature: 0.8
      }
    }),
    signal: AbortSignal.timeout(90000)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const apiMessage =
      data?.error?.message || `HTTP ${response.status}`;

    if (response.status === 400) {
      throw new Error(`Request Gemini tidak valid: ${apiMessage}`);
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(`API key Gemini ditolak: ${apiMessage}`);
    }

    if (response.status === 404) {
      throw new Error(
        `Model Gemini "${MODEL}" tidak ditemukan atau tidak tersedia: ${apiMessage}`
      );
    }

    if (response.status === 429) {
      throw new Error(`Gemini terkena rate limit atau kuota habis: ${apiMessage}`);
    }

    throw new Error(`Gemini API error (${response.status}): ${apiMessage}`);
  }

  const answer = (data?.candidates?.[0]?.content?.parts || [])
    .map(part => part.text || '')
    .join('')
    .trim();

  if (!answer) {
    const reason = data?.candidates?.[0]?.finishReason;
    throw new Error(
      `Gemini tidak menghasilkan teks jawaban${reason ? ` (${reason})` : ''}.`
    );
  }

  return answer;
}

function normalizeMimeType(mimeType, fallback = 'application/octet-stream') {
  return String(mimeType || fallback)
    .split(';')[0]
    .trim()
    .toLowerCase();
}

function inlineMediaPart(media) {
  return {
    inlineData: {
      mimeType: normalizeMimeType(media.mimeType),
      data: Buffer.from(media.data).toString('base64')
    }
  };
}

async function prepareMedia(media) {
  if (!media || !media.data) return [];

  const buffer = Buffer.isBuffer(media.data)
    ? media.data
    : Buffer.from(media.data);

  if (buffer.length === 0) return [];

  if (buffer.length > MAX_MEDIA_BYTES) {
    throw new Error(
      'Ukuran media terlalu besar. Batas sementara Kuroyami adalah 15 MB per media.'
    );
  }

  const mimeType = normalizeMimeType(media.mimeType);
  const mediaType = media.mediaType || '';

  // GIF animasi: ambil beberapa frame supaya AI dapat melihat
  // lebih dari satu momen, bukan hanya frame pertama.
  if (
    mediaType === 'gif' ||
    mimeType === 'image/gif'
  ) {
    try {
      const metadata = await sharp(buffer, { animated: true }).metadata();
      const pageHeight = metadata.pageHeight || metadata.height;
      const pageCount = Math.min(
        metadata.pages || 1,
        MAX_GIF_FRAMES
      );

      const parts = [];

      for (let i = 0; i < pageCount; i++) {
        const frame = await sharp(buffer, { animated: true })
          .extract({
            left: 0,
            top: i * pageHeight,
            width: metadata.width,
            height: pageHeight
          })
          .png()
          .toBuffer();

        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: frame.toString('base64')
          }
        });
      }

      if (parts.length) return parts;
    } catch (error) {
      console.error('[Media] Gagal memproses GIF:', error.message);
      throw new Error('GIF tidak berhasil diproses. Coba kirim ulang media tersebut.');
    }
  }

  // Stiker WebP statis dikonversi menjadi PNG agar lebih mudah dianalisis.
  if (mimeType === 'image/webp' || mediaType === 'sticker') {
    try {
      const png = await sharp(buffer, { animated: false })
        .png()
        .toBuffer();

      return [{
        inlineData: {
          mimeType: 'image/png',
          data: png.toString('base64')
        }
      }];
    } catch (error) {
      console.error('[Media] Gagal mengonversi WebP:', error.message);

      // Jika konversi gagal, coba kirim sebagai WebP asli.
      return [{
        inlineData: {
          mimeType: 'image/webp',
          data: buffer.toString('base64')
        }
      }];
    }
  }

  return [inlineMediaPart({ mimeType, data: buffer })];
}

export async function askKuro({
  text,
  history = [],
  groupName = 'grup WhatsApp',
  media = []
}) {
  let newsContext = '';

  // Pencarian berita hanya untuk prompt teks.
  if (
    text &&
    (process.env.NEWS_SEARCH_ENABLED || 'true').toLowerCase() === 'true'
  ) {
    try {
      const news = await searchNews(text);
      if (news?.length) {
        newsContext = formatNewsContext(news);
      }
    } catch (error) {
      console.error('[News] Pencarian berita gagal:', error.message);
    }
  }

  const contents = history
    .filter(item => item && item.content)
    .map(item => ({
      role: item.role === 'assistant' || item.role === 'model'
        ? 'model'
        : 'user',
      parts: [{ text: String(item.content) }]
    }));

  const currentParts = [];

  if (text?.trim()) {
    currentParts.push({ text: text.trim() });
  } else if (media.length) {
    currentParts.push({
      text: 'Tolong periksa media yang dikirim pengguna dan jelaskan isinya.'
    });
  }

  for (const item of media) {
    const preparedParts = await prepareMedia(item);
    currentParts.push(...preparedParts);
  }

  if (newsContext) {
    currentParts.push({
      text: `Konteks berita yang ditemukan:\n${newsContext}`
    });
  }

  if (!currentParts.length) {
    currentParts.push({ text: 'Halo!' });
  }

  contents.push({
    role: 'user',
    parts: currentParts
  });

  return requestGemini(
    contents,
    buildSystemPrompt(groupName, newsContext)
  );
}