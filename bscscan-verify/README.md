# AgentPass — Paket Verifikasi BscScan

Kontrak: `0x2CaB70C426F92C0d08aEb7cFe41b27b746feEb09` (BNB Smart Chain, chainId 56)
Status saat paket dibuat (22 Nov 2026): **Sourcify exact match (matchId 59525450)** — BscScan BELUM terverifikasi. Paket ini membuat verifikasi BscScan tinggal satu langkah eksekusi.

## Isi paket

| Berkas | Isi |
|---|---|
| `AgentPass.sol` | Source persis seperti ter-deploy (byte-identik dengan source Sourcify exact match; satu file, tanpa import eksternal) |
| `standard-json-input.json` | Standard-JSON input siap pakai: solc 0.8.26, optimizer ON 200 runs, evmVersion cancun |
| `constructor-args.txt` | Constructor arguments ter-encode (hex, tanpa 0x), terverifikasi cocok dengan ekor input tx deploy |

## Setelan yang wajib sama persis

- Compiler: **solc 0.8.26+commit.8a97fa7a**
- Optimization: **Yes, 200 runs**
- EVM version: **cancun** (default 0.8.26)
- License: MIT

## Constructor arguments (terdekode)

```
agentIdContract = 0x60b9262456de011f7d15a54cdd8c48baaa8b022f   (SPACE ID Agent ID)
openingUnix     = 1795266000                                   (2026-11-21T13:00:00Z)
founderSlots    = 1000
baseURI_        = https://agentpass-sigma.vercel.app/api/token/
```

Bukti: encoding argumen di `constructor-args.txt` cocok byte-per-byte dengan ekor
`input` tx deploy `0xa3501e842499801f2ad05e8eca1fd071c5ae14ce18f5e1a15ddd45f81aa3c5ad`,
dan kompilasi lokal dari `standard-json-input.json` menghasilkan runtime 5.372 byte
yang sama dengan kode on-chain kecuali tepat 72 byte slot immutable konstruktor —
persis pola yang diharapkan. Jadi paket ini pasti menghasilkan "Perfect Match" bila
setelannya dipakai apa adanya.

## Jalur eksekusi A — UI BscScan (tanpa kunci API, butuh login akun BscScan Ragil)

1. Buka https://bscscan.com/address/0x2CaB70C426F92C0d08aEb7cFe41b27b746feEb09#code → "Verify and Publish".
2. Compiler Type: **Solidity (Standard-Json-Input)** → unggah `standard-json-input.json`.
   (Alternatif: "Solidity (Single file)" → tempel `AgentPass.sol`, compiler v0.8.26+commit.8a97fa7a,
   optimization Yes/200, evmVersion cancun, license MIT, lalu tempel isi `constructor-args.txt`
   pada kolom Constructor Arguments.)
3. Selesaikan captcha → Submit. Hasil yang diharapkan: "Perfect Match".

## Jalur eksekusi B — API (butuh kunci API BscScan milik Ragil)

```bash
curl -X POST https://api.bscscan.com/api \
  --data-urlencode "module=contract" \
  --data-urlencode "action=verifysourcecode" \
  --data-urlencode "apikey=<KUNCI_API_BSCSCAN_RAGIL>" \
  --data-urlencode "contractaddress=0x2CaB70C426F92C0d08aEb7cFe41b27b746feEb09" \
  --data-urlencode "sourceCode@standard-json-input.json" \
  --data-urlencode "codeformat=solidity-standard-json-input" \
  --data-urlencode "contractname=AgentPass.sol:AgentPass" \
  --data-urlencode "compilerversion=v0.8.26+commit.8a97fa7a" \
  --data-urlencode "constructorArguements=$(cat constructor-args.txt)"
```

Lalu polling `action=checkverifystatus` dengan guid yang dikembalikan sampai "Pass - Verified".

## Satu langkah yang tersisa

Eksekusi butuh salah satu milik Ragil: **login akun BscScan** (jalur A) atau **kunci API BscScan** (jalur B).
Dari lingkungan Muse tidak ada keduanya, dan BscScan memblokir akses baca dari VM ini (403),
jadi label "verified" di BscScan tidak boleh diklaim sampai salah satu jalur di atas benar-benar dijalankan
dan hasilnya terbaca. Sampai saat itu, klaim yang sah di semua halaman publik: **Sourcify — exact match**.
