const MAX_MESSAGE_LENGTH = 4000;

/**
 * Membersihkan dan merapikan teks untuk WhatsApp.
 * Mempertahankan format native WhatsApp:
 * *bold*, _italic_, ~strikethrough~, dan `monospace`.
 */
export function formatWhatsAppMessage(input) {
  if (input == null) return '';

  let text = String(input)
    // Ubah bold Markdown **teks** menjadi format WhatsApp *teks*.
    .replace(/\*\*([\s\S]+?)\*\*/g, '*$1*')
    // Hilangkan tanda ** tersisa yang tidak berpasangan dari keluaran AI.
    .replace(/\*\*/g, '')
    // Normalisasi newline
    .replace(/\r\n?/g, '\n')

    // Hilangkan whitespace di ujung setiap baris
    .replace(/[ \t]+\n/g, '\n')

    // Hilangkan whitespace di awal baris
    .replace(/\n[ \t]+/g, '\n')

    // Batasi baris kosong beruntun
    .replace(/\n{3,}/g, '\n\n')

    // Rapikan spasi beruntun, tanpa mengganggu newline
    .replace(/[ \t]{2,}/g, ' ')

    .trim();

  // Hilangkan karakter kontrol yang tidak diperlukan
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

  return text;
}

/**
 * Memecah pesan panjang menjadi beberapa bagian.
 * Diutamakan memotong pada batas paragraf atau baris.
 */
export function splitWhatsAppMessage(input, maxLength = MAX_MESSAGE_LENGTH) {
  const text = formatWhatsAppMessage(input);

  if (!text) return [];
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let cutAt = remaining.lastIndexOf('\n', maxLength);

    // Jika tidak ada batas baris yang cocok, potong di batas spasi
    if (cutAt < maxLength * 0.5) {
      cutAt = remaining.lastIndexOf(' ', maxLength);
    }

    // Jika satu bagian sangat panjang, potong paksa
    if (cutAt <= 0) {
      cutAt = maxLength;
    }

    const chunk = remaining.slice(0, cutAt).trim();

    if (chunk) chunks.push(chunk);

    remaining = remaining.slice(cutAt).trim();
  }

  if (remaining) chunks.push(remaining);

  return chunks;
}