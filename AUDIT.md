# AUDIT ADVERSARIAL + REGISTER ANTISIPASI — AgentPass
Audit 18 Nov 2026 malam (perintah Ragil: periksa sedetail mungkin, dari POV pihak lain, bukan POV sendiri).
Status kode: AgentPass.sol TERKOMPILASI BERSIH — solc 0.8.26, optimizer 200 runs, 0 error, 0 warning.
Runtime 5.372 byte; estimasi kasar gas deploy ±1,15 jt → ±0,00008 BNB pada gas malam ini (0,07 gwei), ±0,00058 BNB pada plafon 0,5 gwei. Keduanya muat di saldo 0,0011 BNB — TAPI saldo itu di bawah cadangan gas trading terkunci 0,0015 BNB; deploy memakai pot yang sama → keputusan sadar Ragil saat preview nanti.

## Verifikasi fondasi (sudah dibuktikan, bukan asumsi)
- Kontrak Agent ID 0x60b9262456de011f7d15a54cdd8c48baaa8b022f terbaca on-chain 18 Nov 23:40 WIB: name() = "SPACE ID Agent ID", balanceOf(Ragil) = 1. Gerbang `balanceOf > 0` di mint() berdiri di atas kontrak yang benar.

## POV 1 — Agen penyaring (gerbang seperti hunt Muse)
- LULUS by design: quote()/costFor() = 0 selama buka; freeGiven()/freeRemaining() terbaca; openingTime() view polos (tidak revert sebelum buka) → bisa dijadwalkan timed_openings.
- TEMUAN: quote() revert sebelum openingTime. Agen yang mem-probe terlalu dini bisa salah membaca "tertutup". Antisipasi: halaman /agents wajib menulis jam buka dalam ISO + unix dan kalimat "price is 0; mint opens at <ts>"; pengumuman kontrak hanya SETELAH deploy dengan jam buka masa depan (±48 jam) supaya agen menjadwalkan, bukan mem-probe lalu membuang.
- WAJIB saat deploy: verifikasi source di BscScan segera (kelas penyaring yang menolak kontrak tak terverifikasi itu nyata). Simpan setelan compiler persis (0.8.26, optimizer 200) di repo untuk verifikasi exact-match.
- PERANGKAT DIRI (penting): hunt Muse sendiri hampir pasti akan MENDETEKSI AgentPass dari Square/Boltbook/TG. Mengeksekusinya lewat hunt = interaksi diri yang menggelembungkan metrik proyek sendiri — penampilan manipulasi. KEPUTUSAN: begitu alamat deploy diketahui, masukkan ke daftar pengecualian hunt (lewati dengan alasan "proyek sendiri"). Ragil mint paspornya sendiri secara manual sebagai pengguna biasa (1 interaksi sah), BUKAN lewat hunt otomatis.

## POV 2 — Juri Inovasi
- Serangan yang akan datang: "check-in itu sepele". Bantahan yang harus hidup di situs saat penjurian: paspor = kredensial aktivitas agen yang bisa diverifikasi pihak ketiga + spesifikasi terbaca-mesin; wall + papan streak tampil live.
- Juri akan menguji mint TANPA Agent ID → revert beralasan jelas ✓; situs wajib menjelaskan cara mendapat Agent ID.
- Kelengkapan dinilai saat submit → target submit 5 Des (penyangga 4 hari sebelum tenggat 9 Des 15:00 WIB), semua fitur sudah jalan, bukan "akan jalan".

## POV 3 — Kepatuhan Binance
- Nama "AgentPass" tidak memakai merek Binance; logo tidak boleh meniru Binance (cek saat desain logo).
- Tanpa janji imbal hasil di SEMUA teks (situs, posting, README) — daftar periksa salinan sebelum terbit.
- Izin owner: kontrak TIDAK punya fungsi admin sama sekali → README menulis "owner permissions: none" (jawaban terkuat untuk syarat dokumentasi hackathon).
- Situs hanya koneksi wallet standar; tidak ada alur QR Agentic Wallet.
- Interaksi palsu/dibeli: tidak pernah. Bila <30 di tengah jendela: eskalasinya promosi tambahan, bukan fabrikasi.

## POV 4 — Pemegang Agent ID & pemilik agen (pengguna produk)
- Biaya mereka kecil (gas mint/check-in ±0,00003 BNB), tapi gerbang kualitas agen mereka menuntut sinyal keras: kita punya (b) utilitas hidup sejak hari pertama + (c) kuota Founder yang terlihat terbakar.
- RISIKO TERBESAR PROYEK: cold-start. Sinyal (c) agen lain hanya menyala bila momentum 24 jam pertama nyata. Antisipasi: jam buka diumumkan 48 jam sebelumnya; mitra promosi silang disiapkan SEBELUM buka; posting Square + X Ragil di menit buka; Boltbook di jam yang sama.
- Kebingungan zona waktu: hari check-in = UTC (reset 07:00 WIB) — wajib tertulis di situs + halaman /agents.

## POV 5 — Penyerang / pengganggu
- Kontrak tidak memegang dana; mint/checkIn non-payable (mengirim BNB = revert) → tidak ada yang bisa dikuras.
- Sybil: 1 paspor per alamat; Agent ID sendiri 1 per akun Binance — biaya sybil di pihak penyerang, keuntungan dibatasi desain.
- Balapan slot Founder: kompetisi on-chain murni, tidak ada komponen off-chain yang bisa diserang.
- Server metadata mati: attributesOf() memaparkan semua atribut on-chain; renderer mana pun bisa membangun ulang. baseURI immutable — bila hosting mati, gambar rusak secara visual (keadaan on-chain utuh). Antisipasi: hosting statis tahan lama di bawah kendali Ragil; risiko sisa diterima dan dicatat di sini.
- Dependensi kontrak Agent ID immutable: bila SPACE ID bermigrasi, gerbang rusak. Diterima + didokumentasikan (itu kontrak resmi yang ditunjuk hackathon sendiri).

## POV 6 — Ragil (pemilik)
- Biaya deploy terverifikasi muat (lihat kepala dokumen) — keputusan tetap di preview.
- Urutan yang tidak boleh tertukar: testnet + uji saringan dulu, deploy mainnet hanya bila lolos; akun X besok; jangan umumkan apa pun sebelum kontrak terverifikasi di BscScan.

## Rencana uji testnet (besok, sebelum mainnet)
Deploy mock Agent ID (ERC-721 sederhana) di testnet BSC + AgentPass menunjuk ke mock itu, lalu uji: mint tanpa ID (revert), mint dengan ID, mint ganda (revert), check-in dua kali sehari sama (revert), streak putus lalu lanjut (reset ke 1), ambang level 3/7/14/21, batas Founder tokenId 1000 vs 1001, transfer (revert soulbound), quote/costFor/freeRemaining di semua fase. Sesudah itu: probe hunt standar Muse ke kontrak testnet — vonisnya harus "gratis + aman + layak" sebelum mainnet dibicarakan.
