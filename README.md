# Kuroyami — Bot WhatsApp AI - Open Source Project

Versi awal bot publik Kuroyami: Baileys whiskeysockets + Gemini, fokus membalas chat grup ketika bot di-mention atau di-reply.

## Fitur awal
- Login WhatsApp via QR dan menyimpan sesi di `auth_info/`.
- Hanya membalas pesan grup (default).
- Hanya merespons ketika di-mention atau ketika pesan membalas pesan bot.
- Konteks percakapan singkat per grup (disimpan di RAM; hilang saat proses restart).
- Cooldown per grup, batas panjang jawaban, dan pesan error sederhana.
- API dan model bisa diganti lewat `.env`.

## Prasyarat
- Node.js 20 atau lebih baru.
- Google Gemini API key.
- WhatsApp di ponsel untuk menautkan perangkat.

## Install
```bash
npm install
```

## Start
```bash
npm start
```

## Cara mengunakan
- Masukkan bot ke grup.
- Mention/tag bot lalu tulis pesan, atau reply pesan Kuro dan tulis balasan.
- Secara default bot tidak menanggapi semua pesan biasa agar tidak spam dan menghemat kuota.

## Konfigurasi
- `BOT_NAME`: nama bot.
- `GEMINI_MODEL`: default `gemini-3.5-flash-lite`.
- `HISTORY_MESSAGES`: jumlah pesan konteks yang disimpan di RAM per grup (default 8 pesan).
- `MAX_OUTPUT_TOKENS`: batas panjang respons AI.
- `COOLDOWN_SECONDS`: jeda minimum antarrespons di grup.
- `GROUP_ONLY`: `true` untuk grup saja; `false` mengizinkan chat pribadi juga.

## Catatan penting
- API model gratis punya batas yang bisa berubah. perilaku dan ketersediaannya dapat berubah.
- Kode ini adalah starter minimal, belum siap untuk skala publik besar. Untuk banyak grup, tambahkan antrean permintaan, rate limiting global, database, logging yang aman, dan fallback provider.
- Hormati privasi anggota grup. Jangan mengarsipkan atau memproses seluruh percakapan tanpa kebutuhan dan persetujuan yang sesuai.
- Baileys adalah library tidak resmi. Penggunaan otomatisasi WhatsApp punya risiko akun dibatasi; gunakan dengan bijak.

## News Search (fitur awal)

News Search memakai Google News RSS untuk menemukan berita tanpa API key tambahan. Jika pesan menyebut berita/kabar/news/terbaru/hari ini, bot akan mencoba mencari berita, lalu menggunakan hasil pencarian sebagai konteks jawaban Gemini agar diringkas secara singkat.

Pengaturan di `.env`:
- `NEWS_SEARCH_ENABLED=true`: mengaktifkan atau mematikan pencarian berita.
- `NEWS_MAX_RESULTS=8`: jumlah hasil maksimal yang diberikan ke AI.
- `NEWS_MAX_AGE_DAYS=7`: abaikan hasil yang lebih lama dari jumlah hari ini jika tanggalnya tersedia.
- `NEWS_ALLOWED_DOMAINS=`: kosong berarti tidak dibatasi. Isi daftar domain dipisahkan koma untuk membatasi situs, misalnya `kompas.com,antaranews.com`.
- `NEWS_BLOCKED_DOMAINS=`: domain yang ingin dikecualikan.
- `NEWS_LANGUAGE=id` dan `NEWS_COUNTRY=ID`: bahasa dan negara pencarian.

Catatan: ini tahap awal berbasis RSS, bukan crawler mandiri. Hasil, tanggal publikasi, dan akses tautan bergantung pada data yang diberikan Google News dan situs penerbit. Tanggal yang tidak tersedia tidak ditebak; pencarian gagal akan diberitahukan ke AI agar tidak mengarang berita.


## Link preview berita dan clearsession

Berita umum dan berita anime dikirim sebagai teks berisi beberapa artikel beserta URL asli. WhatsApp akan menampilkan preview link jika situs menyediakan metadata preview; preview tidak bisa dijamin untuk semua situs. Karena tidak lagi memakai caption gambar, teks berita tidak dipotong oleh batas caption gambar.

Jika sesi WhatsApp benar-benar rusak dan perlu ditautkan ulang, hentikan bot lalu jalankan `npm run clearsession`. Script meminta konfirmasi dengan mengetik `HAPUS`, lalu menghapus folder lokal `auth_info`. Setelah itu jalankan `npm start` dan scan QR. Jangan jalankan perintah ini kecuali memang siap login ulang. Script ini tidak menghapus sesi secara otomatis saat koneksi terputus.


## Auto-update file (tanpa restart manual)

`npm start` menjalankan watcher yang memantau file `.js`, `.mjs`, `.cjs`, dan `.json` di dalam `src`. Saat file ditambah, diubah, atau dihapus, proses bot dimuat ulang otomatis. Ini tetap melakukan restart proses secara internal karena modul JavaScript yang sudah di-import tidak dapat diganti dengan aman di proses Node.js yang sama; pengguna tidak perlu menghentikan dan menjalankan ulang bot secara manual.

Watcher juga mencoba menjalankan bot lagi jika prosesnya crash. Kalau crash berulang, periksa pesan error tepat sebelum baris `[Watcher] Proses bot berhenti`.

Jalankan pemeriksaan sintaks dengan `npm run check`.
