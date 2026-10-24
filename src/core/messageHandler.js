export function registerMessageHandler({
  sock, GROUP_ONLY, DEBUG, COOLDOWN_MS, historyByChat, lastReplyByChat,
  cleanPrompt, getText, getMediaInfo, getQuotedMediaInfo,
  wasKuroMentioned, isReplyToKuro, downloadIncomingMedia,
  routeFeature, formatWhatsAppMessage, addHistory
}) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        if (!msg.message || msg.key.fromMe) continue;
        const chatId = msg.key.remoteJid;
        if (!chatId || chatId === 'status@broadcast') continue;

        const isGroup = chatId.endsWith('@g.us');
        if (GROUP_ONLY && !isGroup) {
          if (DEBUG) console.log('[DEBUG] Pesan diabaikan: chat pribadi, GROUP_ONLY=true.');
          continue;
        }

        const rawText = getText(msg.message).trim();
        const directMedia = getMediaInfo(msg.message);
        const quotedMedia = getQuotedMediaInfo(msg.message);
        const mediaInfo = directMedia || quotedMedia;

        if (!rawText && !mediaInfo) {
          if (DEBUG) console.log('[DEBUG] Pesan masuk tidak berisi teks atau media yang didukung.');
          continue;
        }

        const mentioned = wasKuroMentioned(msg.message);
        const replied = isReplyToKuro(msg.message);
        if (DEBUG) {
          console.log('[DEBUG] Pesan masuk:', JSON.stringify({ chatId, text: rawText, mentioned, replied }));
        }

        if (!mentioned && !replied) {
          if (DEBUG) console.log('[DEBUG] Diabaikan: bot tidak di-mention atau di-reply.');
          continue;
        }

        const now = Date.now();
        const previous = lastReplyByChat.get(chatId) || 0;
        if (now - previous < COOLDOWN_MS) {
          if (DEBUG) console.log('[DEBUG] Pesan diabaikan karena cooldown.');
          continue;
        }
        lastReplyByChat.set(chatId, now);

        const prompt = cleanPrompt(rawText);
        const history = historyByChat.get(chatId) || [];
        const groupMetadata = isGroup ? await sock.groupMetadata(chatId).catch(() => null) : null;
        const groupName = groupMetadata?.subject || 'grup WhatsApp';

        await sock.sendPresenceUpdate('composing', chatId).catch(() => {});
        if (DEBUG) {
          console.log('[DEBUG] Mengirim pesan ke AI:', prompt || '(tanpa teks)', mediaInfo ? `[media: ${mediaInfo.mediaType}]` : '');
        }

        let media = [];
        if (mediaInfo) {
          try {
            media = [await downloadIncomingMedia(msg, mediaInfo, sock)];
          } catch (error) {
            console.error('[Media] Gagal mengunduh media:', error?.message || error);
            await sock.sendMessage(chatId, { text: 'Aduh, medianya gagal kuunduh. Coba kirim ulang, ya.' }, { quoted: msg });
            continue;
          }
        }

        const answer = await routeFeature({ prompt, history, groupName, media, debug: DEBUG });
        const answerText = typeof answer === 'string' ? answer : answer?.text;
        const finalAnswer = formatWhatsAppMessage(answerText || 'Maaf, aku belum bisa menyusun jawaban.');

        // Kirim teks dan URL artikel langsung. WhatsApp akan membuat link preview
        // jika situs tujuan menyediakan metadata preview; tidak ada batas caption gambar.
        await sock.sendMessage(chatId, { text: finalAnswer }, { quoted: msg });

        if (DEBUG) console.log('[DEBUG] AI selesai membalas.');
        const historyPrompt = [prompt, mediaInfo ? `[Pengguna mengirim ${mediaInfo.mediaType}]` : ''].filter(Boolean).join('\n');
        addHistory(chatId, 'user', historyPrompt);
        addHistory(chatId, 'assistant', finalAnswer);
      } catch (error) {
        console.error('Gagal memproses pesan:', error?.stack || error?.message || error);
        const chatId = msg.key?.remoteJid;
        if (chatId) {
          const errorText = String(error?.message || error);
          const errorMessage =
            /GEMINI_API_KEY/i.test(errorText)
              ? 'API key Gemini belum diatur. Periksa GEMINI_API_KEY di file .env.'
              : /429|rate limit|quota/i.test(errorText)
                ? 'Kuota Gemini sedang penuh atau terkena rate limit. Coba lagi sebentar, ya.'
                : /Ukuran media terlalu besar/i.test(errorText)
                  ? 'Medianya terlalu besar untuk diproses. Coba kirim versi yang lebih kecil, ya.'
                  : 'Aduh, AI-ku sedang bermasalah. Cek terminal untuk detail error, ya.';
          await sock.sendMessage(chatId, { text: errorMessage }, { quoted: msg }).catch(() => {});
        }
      } finally {
        const chatId = msg.key?.remoteJid;
        if (chatId) await sock.sendPresenceUpdate('paused', chatId).catch(() => {});
      }
    }
  });
}
