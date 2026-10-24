
const API_BASE = 'https://api.frankfurter.dev/v2';


const CURRENCY_NAMES = {
  IDR: 'Rupiah Indonesia',
  USD: 'Dolar Amerika Serikat',
  EUR: 'Euro',
  GBP: 'Pound Sterling Inggris',
  JPY: 'Yen Jepang',
  CNY: 'Yuan Tiongkok',
  KRW: 'Won Korea Selatan',
  SGD: 'Dolar Singapura',
  MYR: 'Ringgit Malaysia',
  THB: 'Baht Thailand',
  PHP: 'Peso Filipina',
  AUD: 'Dolar Australia',
  NZD: 'Dolar Selandia Baru',
  CAD: 'Dolar Kanada',
  CHF: 'Franc Swiss',
  HKD: 'Dolar Hong Kong',
  INR: 'Rupee India',
  SAR: 'Riyal Arab Saudi',
  AED: 'Dirham Uni Emirat Arab',
  TRY: 'Lira Turki',
  BRL: 'Real Brasil',
  VND: 'Dong Vietnam',
  PKR: 'Rupee Pakistan',
  BDT: 'Taka Bangladesh',
  SEK: 'Krona Swedia',
  NOK: 'Krone Norwegia',
  DKK: 'Krone Denmark',
  PLN: 'Zloty Polandia',
  MXN: 'Peso Meksiko',
  ZAR: 'Rand Afrika Selatan'
};

async function fetchJSON(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) {
    throw new Error(`Currency API error: HTTP ${response.status}`);
  }

  return response.json();
}

function validateCurrency(code) {
  return /^[A-Z]{3}$/.test(code);
}

function formatNumber(value) {
  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 6
  }).format(value);
}

function formatMoney(value, currency) {
  try {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency,
      maximumFractionDigits: 4
    }).format(value);
  } catch {
    return `${formatNumber(value)} ${currency}`;
  }
}

export function getCurrencyName(code) {
  return CURRENCY_NAMES[code] || code;
}

export async function getSupportedCurrencies() {
  const data = await fetchJSON(`${API_BASE}/currencies`);

  return data
    .map(item => ({
      code: item.currency,
      name: item.name
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export async function convertCurrency(amount, from, to) {
  from = from.toUpperCase();
  to = to.toUpperCase();

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Jumlah harus berupa angka lebih dari nol.');
  }

  if (!validateCurrency(from) || !validateCurrency(to)) {
    throw new Error('Kode mata uang harus terdiri dari 3 huruf, misalnya USD atau IDR.');
  }

  if (from === to) {
    return {
      amount,
      from,
      to,
      rate: 1,
      result: amount,
      date: new Date().toISOString().slice(0, 10)
    };
  }

  const url = `${API_BASE}/rate/${encodeURIComponent(from)}/${encodeURIComponent(to)}`;
  const data = await fetchJSON(url);

  return {
    amount,
    from,
    to,
    rate: data.rate,
    result: amount * data.rate,
    date: data.date
  };
}

export async function getCurrencyRate(from, to) {
  return convertCurrency(1, from, to);
}

export function formatConversion(data) {
  return [
    '💱 *KUROYAMI CURRENCY*',
    '',
    `${getCurrencyName(data.from)} (${data.from}) → ${getCurrencyName(data.to)} (${data.to})`,
    '',
    `💵 Jumlah: ${formatMoney(data.amount, data.from)}`,
    `📊 Kurs: 1 ${data.from} = ${formatNumber(data.rate)} ${data.to}`,
    `💰 Hasil: *${formatMoney(data.result, data.to)}*`,
    '',
    `📅 Tanggal data kurs: ${data.date}`,
    '',
    '_Kurs referensi; nilai aktual bank atau money changer bisa berbeda._'
  ].join('\n');
}

export async function formatCurrencyList() {
  const currencies = await getSupportedCurrencies();

  return [
    '🌍 *MATA UANG YANG DIDUKUNG*',
    '',
    ...currencies.map(item => `${item.code} — ${item.name}`),
    '',
    `Total: ${currencies.length} mata uang`
  ].join('\n');
}