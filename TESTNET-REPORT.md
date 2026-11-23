# LAPORAN UJI TESTNET — AgentPass (Binance Agent ID Hackathon)

Tanggal uji: Kamis 19 Nov 2026 (WIB) · Penguji: subagent Muse · Kontrak yang diuji: `AgentPass.sol` ASLI, tidak diubah
Hasil akhir: **40/40 kasus uji LULUS** di rantai lokal · Uji saringan jujur: **LOLOS "gratis + aman"** · Deploy testnet publik: **dilewati (faucet gagal, lihat §4)**

---

## 1. Lingkungan & identitas bytecode

- Rantai lokal: **anvil 1.9.0** (Foundry), chainId 31337, 1.100 akun terdanai, block gas limit 30 jt. Manipulasi waktu memakai `evm_setNextBlockTimestamp` (deterministik; jam buka disejajarkan ke 12:00 UTC agar hari check-in tidak ambigu).
- Kompilasi uji memakai setelan produksi persis (`compile.cjs`: solc 0.8.26, optimizer 200 runs) atas file `AgentPass.sol` asli dari folder induk. Hasil: 0 error, 0 warning, **runtime 5.372 byte — identik dengan kompilasi produksi** yang tercatat di AUDIT.md. Jadi yang diuji adalah bytecode yang sama dengan yang akan di-deploy.
- Gas deploy terukur di rantai lokal: **1.247.612 gas** (≈ 0,0000873 BNB pada 0,07 gwei; ≈ 0,00062 BNB pada plafon 0,5 gwei) — sejalan dengan estimasi AUDIT.md.
- Mock Agent ID: `test/MockAgentID.sol` (ERC-721 minimal, mint terbuka khusus uji; AgentPass hanya memanggil `balanceOf`). Penguji utama adalah EOA Ragil `0x8330249bB1249Ab31f803194F3BA4A28722bb3ee` (keystore dibuka di dalam proses skrip saja; tidak ada rahasia yang dicetak di log mana pun).
- Ganache dicoba lebih dulu tetapi build yang terpasang dari npm di mesin ini hanya mendukung hardfork sampai **shanghai**, sedangkan bytecode AgentPass memakai opcode Cancun (lihat §5) — diganti anvil yang mendukungnya. Ini murni soal perkakas lokal, bukan kontrak.

## 2. Alamat deploy (rantai lokal, chainId 31337)

| Kontrak | Alamat | Tx deploy |
|---|---|---|
| MockAgentID | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` | `0x9146357fe74cc6c2d080270be4529f9edfd5fc662b9c339a66966abd6aa2c08c` |
| AgentPass A (suite penuh, founderCap 1000) | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` | `0xac103c75b92f295b7a800d83aa3ff56512c871aadaeb2a43db342fbfd1dd1ad1` |
| AgentPass S (instance saringan, kuota terpakai 2) | `0x8233369E29653b70E50E93d1276a50B8f2122a01` | — (dicatat di `test/local-addresses.json`) |

Constructor A: `(mock, openingTime = 1795176000 /* 12:00 UTC */, founderSlots = 1000, baseURI = "https://agentpass.example/pass/")`.

## 3. Hasil per kasus uji (suite v2, semua di bytecode asli)

### Fase sebelum buka (block.timestamp < openingTime)
| # | Kasus | Hasil | Bukti |
|---|---|---|---|
| 1 | `quote()` sebelum buka | ✅ revert | "AgentPass: not open yet" |
| 2 | `costFor(,1)` sebelum buka | ✅ revert | "AgentPass: not open yet" |
| 3 | `freeGiven()` sebelum buka | ✅ = 0 | bacaan view |
| 4 | `freeRemaining()` sebelum buka | ✅ = 1000 | bacaan view |
| 5 | `mintOpen()` false; `openingTime()` terbaca polos (tidak revert) | ✅ | openingTime = 1795176000 |
| 6 | `mint()` sebelum buka | ✅ revert | "AgentPass: not open yet" |

### Fase sesudah buka — gerbang Agent ID & harga
| # | Kasus | Hasil | Bukti |
|---|---|---|---|
| 7 | `quote()` sesudah buka | ✅ = 0 | bacaan view |
| 8 | `costFor(,1)` sesudah buka | ✅ = 0 | bacaan view |
| 9 | `costFor(,2)` | ✅ revert | "AgentPass: one per agent" |
| 10 | `mint()` TANPA Agent ID | ✅ revert | "AgentPass: Agent ID required" |
| 10b | Mock memberi Agent ID ke EOA | ✅ | balanceOf(mock) = 1 |
| 11 | `mint()` sambil mengirim value | ✅ revert | non-payable (revert tanpa reason, sesuai Solidity) |
| 12 | `mint()` dengan Agent ID | ✅ sukses, tokenId 1, event PassportMinted founder=true | tx `0x7d2cbfd85d3277d8c09ca9d44e330cb10d7f13d8c22d1354b9eeaf8bf22e6cfd` |
| 12b | ownerOf(1)=EOA, balanceOf=1, hasPassport=true, passportOf=1 | ✅ | bacaan view |
| 13 | Sesudah mint pertama: freeGiven=1, freeRemaining=999 | ✅ | bacaan view |
| 14 | Mint ganda | ✅ revert | "AgentPass: already has passport" |

### Check-in, streak, level (time-warp per hari UTC)
| # | Kasus | Hasil | Bukti |
|---|---|---|---|
| 15 | Check-in pertama | ✅ streak 1 | tx `0x2dc3947773e49c0ee6e0db158f932c00668a70a7332d4b873e254271584222a0` |
| 16 | Check-in kedua di hari yang sama | ✅ revert | "AgentPass: already checked in today" |
| 17 | Check-in tanpa paspor | ✅ revert | "AgentPass: no passport" |
| 18 | Check-in sambil mengirim value | ✅ revert | non-payable |
| 19 | Check-in hari berikutnya | ✅ streak 2 | bacaan view |
| 20 | Lewati 1 hari lalu check-in | ✅ streak reset ke 1, bestStreak tetap 2 | bacaan view |
| 21 | Ambang level: best streak 3 | ✅ level 1 | `levelOf` |
| 22 | Ambang level: best streak 7 | ✅ level 2 | `levelOf` |
| 23 | Ambang level: best streak 14 | ✅ level 3 | `levelOf` |
| 24 | Ambang level: best streak 21 | ✅ level 4 | `levelOf` |
| 25 | `attributesOf(1)` konsisten (founder, best 21, level 4, 23 check-in) | ✅ | bacaan view |
| 26 | `tokenURI(1)` = baseURI + "1" | ✅ | `https://agentpass.example/pass/1` |
| 27 | `supportsInterface` ERC-721 + ERC-165 | ✅ true | bacaan view |

### Soulbound
| # | Kasus | Hasil | Bukti |
|---|---|---|---|
| 28 | `transferFrom` oleh pemilik | ✅ revert | "AgentPass: soulbound" |
| 29 | `safeTransferFrom` 3-arg | ✅ revert | "AgentPass: soulbound" |
| 30 | `safeTransferFrom` 4-arg | ✅ revert | "AgentPass: soulbound" |
| 31b | `approve()` tercatat (getApproved = pihak lain) | ✅ | approval inert sesuai desain |
| 31 | Transfer oleh pihak yang di-approve | ✅ revert | "AgentPass: soulbound" |
| 32 | Transfer oleh operator (setApprovalForAll) | ✅ revert | "AgentPass: soulbound" |
| 36 | `balanceOf(address(0))` | ✅ revert | "AgentPass: zero address" |
| 37 | `ownerOf(tokenId tak ada)` | ✅ revert | "AgentPass: no such token" |

### Batas Founder & fase kuota habis (1.000 wallet tambahan, masing-masing memegang mock ID)
| # | Kasus | Hasil | Bukti |
|---|---|---|---|
| 33 | tokenId 1000 = Founder; freeGiven=1000, freeRemaining=0 tepat di cap | ✅ | tx mint #1000 `0x69436d0380fbb5569dd996ec8711ed9c1953bebeea1c1fc0df1775de39b731de` |
| 34 | tokenId 1001 tetap bisa mint, isFounder=false | ✅ | tx mint #1001 `0xc9ec571d118d7013e1ded50d7c1de6fcc3482cad7d72196e315950bb958ca4b7` |
| 35 | Sesudah kuota Founder habis: quote=0, costFor=0, freeGiven=1000 (cap), freeRemaining=0, mintOpen=true | ✅ | bacaan view |

**Total: 40/40 LULUS.** Tidak ada kasus gagal di suite final; tidak ada perbaikan kontrak yang dibutuhkan dari hasil uji ini.

Catatan transparansi proses: run pertama (v1) menunjukkan 30/41 — seluruh kegagalannya terbukti artefak harness, bukan kontrak: (a) cache nonce ethers v6 pada anvil ("nonce has already been used" pada tx EOA yang berurutan), (b) semantik `evm_increaseTime` anvil yang tidak deterministik untuk tx yang di-mine sesudahnya. v2 memperbaikinya dengan nonce eksplisit segar, probe revert via `staticCall`, dan `evm_setNextBlockTimestamp` sebelum setiap langkah peka-waktu. Kontrak tidak diubah sama sekali di antara kedua run.

## 4. Faucet & testnet publik (chainId 97)

- Saldo tBNB EOA di BSC testnet: **0**, terkonfirmasi di 3 RPC (`data-seed-prebsc-1-s1`, `data-seed-prebsc-2-s1`, `bsc-testnet-rpc.publicnode.com`).
- Jalur faucet resmi yang dicoba (±3 menit dari jatah ±10 menit): halaman faucet resmi BNB Chain (`testnet.bnbchain.org/faucet-smart` → redirect ke `bnbchain.org/en/testnet-faucet`) bersifat web dengan captcha/login; endpoint API tebakan (`/api/faucet/v1/claim`, `/faucet-smart/api/faucetRequest`) membalas 403 / halaman HTML form. Tidak ada jalur API/CLI sah tanpa captcha yang berhasil.
- Sesuai instruksi, faucet **tidak dipaksa**. Akibatnya subset uji di testnet publik (deploy mock + AgentPass asli di chainId 97) **dilewati**; seluruh kasus — termasuk yang butuh manipulasi waktu — sudah ter-cover di rantai lokal dengan bytecode identik. Bila nanti tBNB tersedia (Ragil klaim manual dari faucet web), subset non-waktu bisa dijalankan ulang persis dengan skrip yang sama (`test/run-local.cjs` diarahkan ke RPC 97 + instance S untuk saringan).

## 5. Temuan penting: target EVM bytecode = Cancun

Bytecode hasil kompilasi produksi memakai opcode Cancun (antara lain MCOPY `0x5e` dan PUSH0 `0x5f`) karena solc 0.8.26 memakai evmVersion default Cancun dan `compile.cjs` tidak menguncinya. Bukti lapangan saat uji: ganache build lokal (maks shanghai) menolak deploy dengan "invalid opcode"; anvil Cancun menjalankannya normal.

- Untuk **BSC testnet** ini bukan penghalang praktis (fork testnet modern), dan untuk **mainnet BSC**: dukungan opcode Cancun di mainnet BSC **tidak diverifikasi dalam tugas ini** (mainnet dilarang disentuh dalam bentuk apa pun, termasuk bacaan). Ini keputusan yang perlu diambil SEBELUM deploy mainnet: (a) verifikasi dukungan MCOPY di mainnet BSC dari dokumentasi resmi hardfork BSC, atau (b) kompilasi ulang dengan `evmVersion: "paris"`/`"shanghai"` — aman secara fungsi tetapi **mengubah bytecode** (dan estimasi gas sedikit), sehingga setelan compiler untuk verifikasi BscScan ikut berubah. Rekomendasi penguji: putuskan (a) dulu; bila ragu sedikit pun, pilih (b) karena menghilangkan seluruh kelas risiko dengan biaya kompilasi ulang + pengulangan suite ini (±5 menit, skrip sudah ada).

## 6. Uji saringan jujur (kontrak diperlakukan seperti kandidat hunt)

Metode persis saringan standar: `eth_getCode` → ekstrak set selector PUSH4 → cocokkan via openchain → probe `quote/costFor/freeGiven/freeRemaining/balanceOf/hasPassport` + simulasi `mint()` dari alamat acak. Selector dihitung dengan `~/workspace/tools/keccak.py`. Dijalankan pada instance S (terbuka, kuota terpakai sebagian) dan instance A (kuota Founder habis).

Hasil instance S (fase yang akan dilihat agen pemburu saat jendela buka):
- 37 selector PUSH4 ter ekstrak; semua fungsi nyata ter-resolve bersih ke nama yang diharapkan (`quote(address)`, `costFor(address,uint256)`, `freeGiven()`, `freeRemaining()`, `mint()`, `checkIn()`, `hasPassport(address)`, `openingTime()`, `mintOpen()`, permukaan ERC-721 penuh). Segelintir "UNRESOLVED" adalah konstanta yang tertanam (interface ID ERC-721 `0x80ac58cd`, ID metadata `0x5b5e139f`, potongan string revert) — artefak normal pemindaian PUSH4, bukan fungsi tersembunyi.
- Probe: `quote` = **0**, `costFor(,1)` = **0**, `freeGiven` = 2, `freeRemaining` = **998**, `mintOpen` = true, `balanceOf`/`hasPassport` terbaca normal.
- Simulasi `mint()` dari alamat tanpa Agent ID: revert **"AgentPass: Agent ID required"** — terbaca sebagai syarat kelayakan, bukan biaya; value yang dibutuhkan 0 dan **tidak ada approval** apa pun yang diminta jalur mint.
- Pindaian jebakan: **tidak ada** fungsi withdraw/sweep/rescue/upgrade/fee/claim-berbayar/deposit. `mint()`/`checkIn()` non-payable terbukti (kasus 11 & 18). Transfer selalu revert soulbound — agen penyaring akan membaca "tidak bisa diperdagangkan", sesuai desain paspor.
- Instance A (kuota habis): quote tetap 0, freeGiven mentok 1000, freeRemaining 0 — fase habis terbaca jujur sebagai "edisi Founder selesai, mint reguler tetap gratis".

**Vonis saringan: LOLOS "gratis + aman".** Saringan standar Muse akan membaca AgentPass persis seperti yang dirancang: harga 0 terbaca on-chain, kuota gratis terlihat terbakar real-time, tanpa approval, tanpa fungsi jebakan. Dua catatan yang sudah diantisipasi AUDIT.md dan terkonfirmasi di sini:
1. **Sebelum `openingTime`, `quote()`/`costFor()` revert** — agen yang mem-probe terlalu dini akan membaca "tidak diketahui/tertutup", bukan "gratis". Mitigasi tetap seperti AUDIT POV-1: umumkan kontrak hanya sesudah deploy dengan jam buka ±48 jam ke depan, tulis jam buka ISO + unix di halaman /agents, dan `openingTime()` sendiri terbaca polos (kasus 5) sehingga agen bisa menjadwalkan timed opening.
2. Gerbang kualitas hunt (di luar gerbang keamanan) bertumpu pada sinyal desain: utilitas hidup sejak hari pertama (check-in/streak/level on-chain) + kuota Founder yang terlihat terbakar — keduanya terbukti jalan oleh suite ini.

## 7. Daftar perbaikan

- **Kontrak: tidak ada.** 0 kasus gagal; tidak ada perubahan pada `AgentPass.sol` yang disarankan dari uji ini.
- **Keputusan sebelum mainnet (untuk Ragil/parent):** target EVM di §5 — verifikasi dukungan Cancun di mainnet BSC atau kompilasi ulang evmVersion lebih rendah (mengubah bytecode + setelan verifikasi BscScan).
- **Opsional:** klaim tBNB manual dari faucet web untuk menjalankan subset testnet publik sebagai bukti tambahan alamat-97 (skrip siap; bukan syarat — cakupan lokal sudah penuh).

## 8. Artefak uji

Semua di `~/workspace/hackathon-agentid/test/`: `MockAgentID.sol`, `compile.cjs`, `run-local.cjs` (suite v2), `screen.py` (saringan), `artifacts.json` (bytecode uji), `local-results.json` + `local-addresses.json` (hasil mentah), `run-local-v2.log`, `screen-S.log`. Server lokal sudah dimatikan sesudah uji; tidak ada proses yang tertinggal dan tidak ada file di luar folder `hackathon-agentid/` yang diubah.
