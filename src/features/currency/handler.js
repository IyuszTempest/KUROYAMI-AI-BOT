import {
  convertCurrency,
  formatConversion,
  formatCurrencyList
} from './index.js';

export function isCurrencyRequest(text = '') {
  return /\b(kurs|konversi|convert|currency|mata uang|nilai tukar)\b/i.test(text);
}

export async function handleCurrencyRequest(text = '') {
  const input = text.trim();

  try {
    if (/\b(daftar mata uang|list mata uang|mata uang tersedia|supported currencies)\b/i.test(input)) {
      return await formatCurrencyList();
    }

    // Contoh: 100 USD ke IDR
    // Contoh: convert 50 MYR to IDR
    // Contoh: kurs USD IDR
    const match = input.match(
      /(?:^|\s)(?:(?:kurs|konversi|convert|currency)\s+)?(?:(\d+(?:[.,]\d+)?)\s+)?([A-Za-z]{3})\s+(?:ke|to|into|\/)\s+([A-Za-z]{3})(?:\s|$)/i
    );

    if (match) {
      const amount = match[1]
        ? Number(match[1].replace(',', '.'))
        : 1;

      const from = match[2].toUpperCase();
      const to = match[3].toUpperCase();

      const result = await convertCurrency(amount, from, to);
      return formatConversion(result);
    }

    // Format alternatif: kurs USD IDR
    const simpleMatch = input.match(
      /^(?:kurs|konversi|convert|currency)\s+(?:(\d+(?:[.,]\d+)?)\s+)?([A-Za-z]{3})\s+([A-Za-z]{3})$/i
    );

    if (simpleMatch) {
      const amount = simpleMatch[1]
        ? Number(simpleMatch[1].replace(',', '.'))
        : 1;

      const result = await convertCurrency(
        amount,
        simpleMatch[2],
        simpleMatch[3]
      );

      return formatConversion(result);
    }

    return [
      '💱 *CARA PAKAI KUROYAMI CURRENCY*',
      '',
      '• kurs USD IDR',
      '• kurs MYR IDR',
      '• 100 USD ke IDR',
      '• 50 SGD ke MYR',
      '• convert 250 EUR to IDR',
      '• daftar mata uang',
      '',
      'Bisa menggunakan kode mata uang 3 huruf yang didukung API.'
    ].join('\n');
  } catch (error) {
    console.error('[Currency] Error:', error.message);

    return [
      '❌ Gagal mengambil data kurs.',
      '',
      'Periksa kode mata uangnya, misalnya:',
      '• kurs USD IDR',
      '• kurs MYR IDR',
      '',
      'Bisa juga coba lagi beberapa saat lagi.'
    ].join('\n');
  }
}