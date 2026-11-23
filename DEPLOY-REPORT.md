# AgentPass — Laporan Deploy Mainnet

**Status: SELESAI PENUH — kontrak LIVE di BSC mainnet.**
Percobaan pertama terhenti di transfer (19 Nov ±20:28 WIB, penolakan Binance 351703); dilanjutkan malam yang sama sesudah Ragil menambahkan alamat EOA ke address book aplikasi Binance Wallet (±20:51 WIB).
Bukti lengkap: `~/workspace/evidence/2026-11-19-main-agentpass-deploy.md`.

## Hasil akhir

- **Alamat kontrak: `0x2CaB70C426F92C0d08aEb7cFe41b27b746feEb09`**
- Transfer pendanaan: txHash `0x3f55b23e943d2073e46cf3d37aae07ef27641f0e1b76eb52e00a542611b64636` (0,0003 BNB Agentic → EOA; gas transfer 0,000001398781335 BNB; 19 Nov 20:51:45 WIB).
- Deploy: txHash `0xa3501e842499801f2ad05e8eca1fd071c5ae14ce18f5e1a15ddd45f81aa3c5ad` (19 Nov 20:52:51 WIB); gas terpakai 1.292.309 @ 0,075987326 gwei; biaya **0,000098199105275734 BNB**.
- Argumen final terverifikasi on-chain di 2 RPC: agentId `0x60b9262456de011f7d15a54cdd8c48baaa8b022f`; openingTime `1795266000` = **Sabtu 21 Nov 2026 20:00:00 WIB**; founderCap `1000`; baseURI `https://agentpass-sigma.vercel.app/api/token/`; name `AgentPass`; symbol `APASS`; freeRemaining `1000`; quote() revert `AgentPass: not open yet` (benar, sebelum buka).
- Identitas kode: runtime on-chain 5.372 byte, terbukti sama dengan build teruji 40/40 kecuali 72 byte pada slot immutable constructor (agentId/openingTime/founderCap) — kode terpasang = kode teruji.
- **Verifikasi kode sumber: Sourcify EXACT MATCH** (creation + runtime), matchId `59525450`, 19 Nov 20:54:40 WIB. (Sourcify meneruskan ke Etherscan/BscScan; tampilan di BscScan belum terkonfirmasi dari sini — tidak ada kunci API scan yang sah di lingkungan.)
- Situs: `site-config.json` terisi (alamat + openingUnix + openingTimeISO `2026-11-21T13:00:00.000Z`); deploy ulang Vercel `dpl_38QM98a3PADxCv2jxEg96iNkv7SP` READY; produksi tetap `https://agentpass-sigma.vercel.app`. Cek live: /, /agents, /wall → 200; config tersaji dengan nilai baru; `/api/token/1` → 404 "has not been minted" (benar sebelum mint pertama).
- Approvals: Agentic kosong; EOA nonce = 1 (hanya deploy). Tidak ada yang di-revoke.
- Saldo akhir: Agentic 0,000777692815683655 BNB; EOA 0,000201800894724266 BNB (sisa dana deploy tetap di EOA).

## Langkah tersisa

1. **Pengecualian hunt:** kontrak AgentPass `0x2CaB70C426F92C0d08aEb7cFe41b27b746feEb09` WAJIB masuk daftar pengecualian hunt — diurus parent; state.json hunt tidak disentuh run ini.
2. Pengumuman publik (Binance Square + Boltbook alpha) — langkah terpisah, belum dilakukan run ini.
3. Mint pertama oleh Ragil sendiri dari Agentic Wallet saat buka: **Sabtu 21 Nov 2026 20:00 WIB**.

## Addendum — 23 Nov 2026

**Addendum 23 Nov 2026:** verifikasi BscScan kini TERKONFIRMASI — halaman kontrak menampilkan "Source Code Verified — Exact Match" (compiler v0.8.26, optimizer 200 runs, lisensi MIT), dikonfirmasi dari screenshot pemilik 23 Nov 2026 18:29 WIB. Catatan 19 Nov di atas yang menyebut tampilan BscScan belum terkonfirmasi kini sudah terjawab; isi asli laporan di atas tidak diubah.
