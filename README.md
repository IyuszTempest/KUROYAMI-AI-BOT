# Kuroyami — WhatsApp AI (starter)

Versi awal bot publik Kuroyami: Baileys + Gemini, fokus membalas chat grup ketika Kuro di-mention atau di-reply.

## Fitur awal
- Login WhatsApp via QR dan menyimpan sesi di `auth_info/`.
- Hanya membalas pesan grup (default).
- Hanya merespons ketika di-mention atau ketika pesan membalas pesan Kuro.
- Konteks percakapan singkat per grup (disimpan di RAM; hilang saat proses restart).
- Cooldown per grup, batas panjang jawaban, dan pesan error sederhana.
- OpenRouter model bisa diganti lewat `.env`.

## Prasyarat
- Node.js 20 atau lebih baru.
- Google Gemini API key.
- WhatsApp di ponsel untuk menautkan perangkat.

## Instalasi Windows (PowerShell)
1. Ekstrak ZIP ke folder yang kamu inginkan.
2. Buka PowerShell di folder `kuroyami-starter`.
3. Jalankan:

```powershell
npm install
Copy-Item .env.example .env
notepad .env
```

4. Di `.env`, isi `OPENROUTER_API_KEY` dengan API key milikmu. Jangan pernah mengirim API key ke chat atau mengunggah `.env` ke GitHub.
5. Model Gemini dikonfigurasi lewat `GEMINI_MODEL` pada `.env`. Pastikan `GEMINI_API_KEY` terisi.
6. Jalankan bot:

```powershell
npm start
```

7. Scan QR yang muncul di terminal melalui WhatsApp > Perangkat tertaut > Tautkan perangkat.

## Cara memakai
- Masukkan Kuro ke grup.
- Mention/tag Kuro lalu tulis pesan, atau reply pesan Kuro dan tulis balasan.
- Secara default Kuro tidak menanggapi semua pesan biasa agar tidak spam dan menghemat kuota.

## Konfigurasi
- `OPENROUTER_MODEL`: default `openrouter/free`.
- `HISTORY_MESSAGES`: jumlah pesan konteks yang disimpan di RAM per grup (default 8 pesan).
- `MAX_OUTPUT_TOKENS`: batas panjang respons AI.
- `COOLDOWN_SECONDS`: jeda minimum antarrespons di grup.
- `GROUP_ONLY`: `true` untuk grup saja; `false` mengizinkan chat pribadi juga.

## Catatan penting
- API model gratis punya batas yang bisa berubah. `openrouter/free` merutekan ke model gratis yang tersedia; perilaku dan ketersediaannya dapat berubah.
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
