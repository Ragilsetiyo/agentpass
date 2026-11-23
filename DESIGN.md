# RANCANGAN PROYEK — Binance Agent ID Hackathon
## "AgentPass" — Paspor Aktivitas untuk Agent ID
Dirancang 18 Nov 2026 malam, atas perintah Ragil: sebagus & semenarik mungkin UNTUK PARA PEMBURU OTOMATIS (agen seperti Muse yang berburu mint gratis tiap 10 menit atas perintah pemiliknya).

---

## 1. Ide inti
Satu-satunya produk di hackathon ini yang dirancang **agen-dulu, manusia-kemudian**:
- NFT paspor soulbound untuk pemegang Agent ID: gratis, langsung terungkap (bukan misteri), naik level dari aktivitas.
- Check-in harian gratis yang tercatat on-chain → paspor adalah bukti aktivitas agen yang hidup.
- Dinding publik (wall) semua agen yang check-in + papan streak — bisa dibaca siapa pun, termasuk agen lain.
- **Halaman spesifikasi yang bisa dibaca mesin** (`/agents` dalam teks polos/JSON): alamat kontrak, chainId, fungsi + tanda tangan persis, status gratis, sisa kuota, waktu buka. Agen penyaring tidak perlu menebak — proyek lain hanya punya halaman manusia; ini keunggulan struktural kita.

Mengapa ini menang dua-duanya:
- Untuk AGEN PEMBURU: semua gerbang saringan standar terpenuhi secara desain (lihat §3) → lolos verifikasi → dieksekusi otomatis oleh agen-agen milik pemegang Agent ID lain.
- Untuk JURI Inovasi: integrasi Agent ID-nya nyata (kontrak membaca kepemilikan Agent ID), produknya hidup sejak hari pertama (bukan janji roadmap), dan konsep "paspor aktivitas agen" memang baru.

## 2. Mekanik (dibentuk persis seperti yang dicari agen pemburu)
1. **Mint paspor gratis** — 1 per alamat, wajib punya Agent ID (kontrak cek `balanceOf` ke kontrak Agent ID SPACE ID 0x60b9262456de011f7d15a54cdd8c48baaa8b022f). Harga terbaca on-chain = 0.
2. **Edisi Founder terbatas 1.000** dengan penghitung publik yang terbaca mesin (`freeGiven()` / sisa kuota). Kuota yang terlihat terbakar = sinyal permintaan yang memicu agen lain ikut masuk (pola FORGE/BROCCOLI/SIDECOIN: kuota gratis yang diumumkan jelas habis dalam menit).
3. **Pembukaan berjadwal yang diumumkan jauh hari** (tanggal + jam persis, WIB + UTC). Agen pemburu punya jalur khusus "timed openings" — mereka MENJADWALKAN proyek seperti ini dan menembak di detik buka. Mengumumkan waktu buka = masuk kalender mesin mereka.
4. **Check-in harian gratis** (`checkIn()`, 1x per hari UTC, hanya gas): streak tercatat on-chain; level paspor naik di streak 3 / 7 / 14 / 21 hari. Ini menggerakkan JUMLAH TRANSAKSI (salah satu metrik Penghargaan Ekosistem) lewat pemakaian asli, bukan spam — tiap check-in adalah aktivitas produk yang sah.
5. **Satu transaksi, tanpa jebakan**: tanpa commit-reveal, tanpa fee anti-sybil, tanpa deposit, tanpa approval token apa pun, tanpa pendamping token tanpa pool. Semua itu adalah alasan veto standar agen penyaring — kita tidak punya satu pun.
6. **Lencana langsung terungkap** dengan gambar yang dibangkitkan dari nama agen + level + streak (metadata dinamis). Bukan sealed/mystery — kelas yang oleh gerbang kualitas mana pun dicap sampah.

## 3. Kontrak — permukaan yang sengaja dibuat mudah disaring agen
Fungsi baca yang WAJIB ada (agen pemburu mengekstrak set selector dari bytecode lalu mem-probe fungsi quote/cost/penghitung-gratis yang benar-benar ada; kontrak yang tidak punya ini terlihat "tertutup/mahal" dan dilewati):
- `quote(address)` → 0 untuk mint pertama (pola yang terbukti ditemukan agen: harga jalur gratis bersembunyi di fungsi quote).
- `costFor(address,uint256)` → 0 untuk jumlah yang masih gratis.
- `freeGiven()` dan `freeRemaining()` → penghitung kuota publik.
- `hasPassport(address)`, `streakOf(uint256)`, `levelOf(address)`, `totalCheckIns()`.
Fungsi tulis: `mint()` (value 0), `checkIn()` (value 0). ERC-721 soulbound (transfer selalu revert — Agent ID sendiri non-transferable, konsisten).
Keamanan & kepatuhan:
- Kode sumber TERBUKA dan TERverifikasi di BscScan sejak hari pertama (syarat hackathon + sinyal legitimasi utama bagi agen penyaring).
- Izin owner didokumentasikan di README; tidak ada fungsi owner yang bisa mengubah harga/menyapu aset pengguna. Idealnya: tanpa fungsi owner berbahaya sama sekali.
- Tanpa janji imbal hasil di mana pun (garis merah Binance). Yang ditawarkan: status, level, koleksi — bukan keuntungan.

## 4. Sinyal legitimasi (yang dituntut gerbang verifikasi agen)
Agen seperti Muse menuntut: sumber resmi + penyebutan independen kedua + bacaan on-chain positif. Maka paket rilisnya:
1. Situs sederhana (1 halaman): apa ini, kontrak, waktu buka, tautan BscScan, halaman `/agents` terbaca-mesin.
2. Akun/posting resmi di Binance Square + X (satu pengumuman berisi: nama, kontrak, jam buka persis, "gratis, 1.000 Founder").
3. Penyebutan kedua: postingan Boltbook alpha (komunitas agen) + kolaborasi silang 2–3 proyek hackathon kecil (saling mengumumkan — mereka butuh 30 interaksi yang sama).
4. Posting X memakai #BinanceWalletHackathon #AgenticWallet + kirim tautan ke survei resmi → sekalian masuk jalur kampanye komunitas 2.000 USDC.

## 5. Kesesuaian kriteria juri (Penghargaan Inovasi)
- Kedalaman Agent ID (30%): kontrak MENOLAK mint tanpa Agent ID; paspor adalah lapisan identitas/aktivitas di atas Agent ID — bukan tempelan logo.
- Kepraktisan (25%): agen butuh bukti aktivitas & reputasi yang bisa diverifikasi pihak lain; paspor + streak menyediakannya, gratis.
- Kelengkapan (25%): kontrak + situs + wall publik + spesifikasi mesin, semua jalan saat submit.
- Inovasi (20%): "agent-first design" — produk pertama yang permukaan kontrak + halamannya dirancang agar bisa ditemukan, disaring, dan dipakai oleh agen otonom tanpa bantuan manusia.
Penghargaan Ekosistem: metriknya alamat Agent ID unik + jumlah transaksi → dijawab mekanik Founder 1.000 + check-in harian.

## 6. Rencana waktu (jendela submit tutup 9 Des 15:00 WIB)
- 19 Nov (sesudah jendela GTA6): bangun kontrak + situs; uji di testnet BSC dulu.
- Uji saringan jujur: Muse menjalankan hunt-probe standarnya sendiri ke kontrak testnet — bila saringan Muse sendiri tidak meloloskannya sebagai "gratis + aman + layak", perbaiki sampai lolos. (Audit atas audit: proyek ini harus selamat dari gerbang yang sama yang memveto 169 proyek sampah.)
- Deploy mainnet = transaksi on-chain di luar mandat → preview penuh + izin Ragil dulu; gas deploy dari saldo BNB (0,0011 — mepet; estimasi deploy ERC-721 sederhana ±0,0005–0,0015 BNB; bila kurang, opsi: kontrak minimal/Clones atau Ragil isi gas sedikit — keputusan Ragil saat preview).
- Rilis berjadwal ±7 hari sebelum tenggat: umumkan waktu buka, lalu buka mint; check-in harian berjalan selama sisa jendela.
- Submit proyek (tanpa registrasi) sebelum 9 Des 15:00 WIB + posting X kampanye.

## 7. Yang TIDAK dilakukan (garis merah)
- Tidak ada akun ganda / interaksi palsu / volume buatan (diskualifikasi + melanggar aturan main kita).
- Tidak ada janji cuan, tidak ada login QR Agentic Wallet, tidak ada pengumpulan kredensial, tidak ada impersonasi merek Binance.
- Semua interaksi yang datang harus dari pemegang Agent ID asli + agen mereka sendiri — justru itu tesis proyek ini: produk yang cukup rapi akan diburu mesin dengan sendirinya.

## 8. Risiko jujur
- Admin kanal Telegram utama bisa saja tidak mengangkat pengumuman kita; mitigasinya berlapis (Square + X + Boltbook + kolaborasi silang + halaman mesin yang bisa ditemukan pencarian).
- 30 alamat unik tetap tidak dijamin — tapi setiap mekanik di atas menaikkan peluangnya, dan check-in harian membuat yang sudah datang kembali lagi.
- Skor Inovasi tetap penilaian panel manusia; produk dibuat nyata (bukan ladang mint kosong) persis untuk itu.
