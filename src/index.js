import 'dotenv/config';

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  getContentType,
  downloadMediaMessage,
} from '@whiskeysockets/baileys';

import pino from 'pino';
import qrcode from 'qrcode-terminal';

import { formatWhatsAppMessage } from './utils/messageFormatter.js';
import { routeFeature } from './core/featureRouter.js';
import { registerMessageHandler } from './core/messageHandler.js';

// ── Konfigurasi dan state ────────────────────────────────────────────────

const logger = pino({ level: 'silent' });

const historyByChat = new Map();
const lastReplyByChat = new Map();

let botJid = '';
let botLid = '';

const HISTORY_LIMIT = Math.max(
  0,
  Number(process.env.HISTORY_MESSAGES || 8)
);

const COOLDOWN_MS =
  Math.max(0, Number(process.env.COOLDOWN_SECONDS || 3)) * 1000;

const GROUP_ONLY =
  (process.env.GROUP_ONLY || 'true').toLowerCase() === 'true';

const DEBUG =
  (process.env.DEBUG_LOGS || 'true').toLowerCase() === 'true';

// ── Identitas bot ────────────────────────────────────────────────────────

function normalizeJid(jid) {
  if (!jid) return '';
  return jidNormalizedUser(jid);
}

function isBotIdentity(jid) {
  if (!jid) return false;

  const normalized = normalizeJid(jid);

  return Boolean(
    normalized &&
    (
      normalized === botJid ||
      (botLid && normalized === botLid)
    )
  );
}

// ── Membaca isi pesan ────────────────────────────────────────────────────

function unwrapMessage(message) {
  let current = message;

  for (let i = 0; i < 5 && current; i++) {
    if (current.ephemeralMessage?.message) {
      current = current.ephemeralMessage.message;
    } else if (current.viewOnceMessage?.message) {
      current = current.viewOnceMessage.message;
    } else if (current.viewOnceMessageV2?.message) {
      current = current.viewOnceMessageV2.message;
    } else if (current.documentWithCaptionMessage?.message) {
      current = current.documentWithCaptionMessage.message;
    } else {
      break;
    }
  }

  return current || {};
}

function getText(message) {
  const msg = unwrapMessage(message);
  const type = getContentType(msg);

  if (!type) return '';

  const content = msg[type];

  if (typeof content === 'string') {
    return content;
  }

  if (typeof content?.text === 'string') {
    return content.text;
  }

  if (typeof content?.caption === 'string') {
    return content.caption;
  }

  if (type === 'extendedTextMessage') {
    return content?.text || '';
  }

  return '';
}

// ── Informasi media ──────────────────────────────────────────────────────

function getMediaInfo(message) {
  const msg = unwrapMessage(message);
  const type = getContentType(msg);

  if (!type) return null;

  const content = msg[type];

  if (type === 'imageMessage') {
    return {
      mediaType: 'image',
      mimeType: content?.mimetype || 'image/jpeg',
      message: msg,
    };
  }

  if (type === 'stickerMessage') {
    return {
      mediaType: content?.isAnimated ? 'gif' : 'sticker',
      mimeType: content?.mimetype || 'image/webp',
      message: msg,
    };
  }

  if (type === 'videoMessage') {
    return {
      mediaType: content?.gifPlayback ? 'gif' : 'video',
      mimeType: content?.gifPlayback
        ? 'image/gif'
        : content?.mimetype || 'video/mp4',
      message: msg,
    };
  }

  if (type === 'audioMessage') {
    return {
      mediaType: 'audio',
      mimeType: content?.mimetype || 'audio/ogg',
      message: msg,
    };
  }

  if (type === 'documentMessage') {
    const mimeType = content?.mimetype || 'application/octet-stream';

    if (/^(image|audio|video)\//i.test(mimeType)) {
      return {
        mediaType: mimeType.split('/')[0],
        mimeType,
        message: msg,
      };
    }
  }

  return null;
}

function getContextInfo(message) {
  const msg = unwrapMessage(message);
  const type = getContentType(msg);

  return msg?.[type]?.contextInfo || {};
}

function getQuotedMediaInfo(message) {
  const context = getContextInfo(message);
  const quotedMessage = context?.quotedMessage;

  if (!quotedMessage) return null;

  const info = getMediaInfo(quotedMessage);

  if (!info) return null;

  return {
    ...info,
    quoted: true,
    quotedMessage,
  };
}

// ── Mengunduh media ──────────────────────────────────────────────────────

async function downloadIncomingMedia(msg, info, sock) {
  let messageToDownload = msg;

  if (info.quoted && info.quotedMessage) {
    const context = getContextInfo(msg.message);

    messageToDownload = {
      key: {
        remoteJid: msg.key.remoteJid,
        id: context.stanzaId,
        participant: context.participant,
        fromMe: false,
      },
      message: info.quotedMessage,
    };
  }

  const buffer = await downloadMediaMessage(
    messageToDownload,
    'buffer',
    {},
    {
      logger,
      reuploadRequest: sock.updateMediaMessage,
    }
  );

  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error('Media WhatsApp kosong atau gagal diunduh.');
  }

  return {
    mediaType: info.mediaType,
    mimeType: info.mimeType,
    data: buffer,
  };
}

// ── Deteksi mention dan reply ────────────────────────────────────────────

function wasKuroMentioned(message) {
  const context = getContextInfo(message);
  const mentions = context.mentionedJid || [];

  return mentions.some(jid => isBotIdentity(jid));
}

function isReplyToKuro(message) {
  const context = getContextInfo(message);

  return (
    isBotIdentity(context.participant) ||
    isBotIdentity(context.remoteJid)
  );
}

function cleanPrompt(text) {
  if (!text) return '';

  return text.replace(/@\d{5,}/g, '').trim();
}

// ── Riwayat percakapan ───────────────────────────────────────────────────

function addHistory(chatId, role, content) {
  if (!HISTORY_LIMIT) return;

  const history = historyByChat.get(chatId) || [];

  history.push({ role, content });

  while (history.length > HISTORY_LIMIT) {
    history.shift();
  }

  historyByChat.set(chatId, history);
}

// ── Memulai koneksi WhatsApp ─────────────────────────────────────────────

async function startBot() {
  const { state, saveCreds } =
    await useMultiFileAuthState('auth_info');

  let version;

  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch (error) {
    if (DEBUG) {
      console.log(
        '[Baileys] Gagal mengambil versi terbaru:',
        error?.message || error
      );
    }
  }

  const sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ['Kuroyami', 'Chrome', '1.0.0'],
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on(
    'connection.update',
    ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        console.log(
          '\nScan QR melalui WhatsApp > Perangkat tertaut:\n'
        );

        qrcode.generate(qr, { small: true });
      }

      if (connection === 'open') {
        botJid = normalizeJid(sock.user?.id || '');
        botLid = normalizeJid(sock.user?.lid || '');

        console.log('Bot JID:', botJid);
        console.log('Bot LID:', botLid || '(belum tersedia)');

        console.log(
          `\n${process.env.BOT_NAME || 'Kuroyami'} tersambung sebagai ${
            sock.user?.id || 'akun WhatsApp'
          }`
        );

        console.log(
          `Mode grup saja: ${GROUP_ONLY ? 'aktif' : 'nonaktif'}`
        );

        console.log(
          `Debug log: ${DEBUG ? 'aktif' : 'nonaktif'}`
        );

        console.log(
          'Bot membalas jika di-mention atau di-reply. Ctrl+C untuk berhenti.\n'
        );
      }

      if (connection === 'close') {
        const status =
          lastDisconnect?.error?.output?.statusCode;

        const shouldReconnect =
          status !== DisconnectReason.loggedOut;

        console.log(
          `Koneksi terputus (${status ?? 'unknown'}). ${
            shouldReconnect
              ? 'Mencoba menyambung ulang...'
              : 'Sesi logout; hapus auth_info lalu jalankan ulang untuk scan QR.'
          }`
        );

        if (shouldReconnect) {
          setTimeout(() => {
            startBot().catch(console.error);
          }, 2000);
        }
      }
    }
  );

  // ── Daftarkan handler pesan ─────────────────────────────────────────

  registerMessageHandler({
    sock,
    GROUP_ONLY,
    DEBUG,
    COOLDOWN_MS,
    historyByChat,
    lastReplyByChat,
    cleanPrompt,
    getText,
    getMediaInfo,
    getQuotedMediaInfo,
    wasKuroMentioned,
    isReplyToKuro,
    downloadIncomingMedia,
    routeFeature,
    formatWhatsAppMessage,
    addHistory,
  });
}

// ── Penanganan error dan startup ─────────────────────────────────────────

process.on('unhandledRejection', error => {
  console.error('Unhandled rejection:', error);
});

startBot().catch(error => {
  console.error('Bot gagal dijalankan:', error);
  process.exitCode = 1;
});