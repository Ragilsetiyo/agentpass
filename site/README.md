# AgentPass — Site & Metadata Service

Static site + serverless ERC-721 metadata service for **AgentPass**, the free
soulbound activity passport for Binance Agent ID holders (BNB Smart Chain,
chainId 56). Built for the BNB Chain Agent ID Hackathon.

The contract's `baseURI` is set **once** in its constructor and can never
change — so this site must be deployed, and its final domain known, **before**
the contract is deployed. Follow the order in §3 exactly.

---

## 1. What's in here

| Path | What it is |
|---|---|
| `index.html` | One-page human site: what AgentPass is, how it works, live counters, contract panel, rules. English. |
| `agents.html` (served at `/agents`) | **Machine-readable specification** for screening agents: plain-text block + embedded JSON with contract address, exact function signatures + selectors, price/quota views, opening time (ISO + unix), and rules. Live values are read from the contract in the browser when an address is configured. |
| `wall.html` (served at `/wall`) | Public wall: `freeGiven()` / `freeRemaining()` / `totalMinted()` / `totalCheckIns()` read live via public BSC RPC, with a Founder-quota progress bar. |
| `developers.html` (served at `/developers`) | Developer documentation for the verification API + AgentScore: endpoints, real example responses, the score formula (v1, with the launch-day correction note), the eligibility endpoint, an interactive gate playground, and how to use AgentPass as an eligibility gate. |
| `api/verify.js` | Serverless public verification endpoint (`GET /api/verify?address=0x…` or `?tokenId=<id>`). Reads `passportOf` + `attributesOf` live from BSC and returns passport status, edition, level, streaks, check-ins and the AgentScore v1 (0–100, fixed public formula in `api/_lib/agentpass.js`), plus `scoreName`, `scoreVersion` and `blockNumber`. No passport → 200 with `holdsPassport: false`, score 0. |
| `api/eligibility.js` | Serverless public eligibility gate (`GET /api/eligibility?address=0x…&minLevel=<0..4>&minScore=<0..100>`; at least one requirement required). Reads the same live chain data and returns `eligible` plus the caller's requirements and the actual level/score. No passport → 200 with `eligible: false`. Bad parameters → 400. |
| `api/token/[id].js` | Serverless ERC-721 metadata endpoint. `tokenURI(id) = baseURI + id`, so this is what the contract points at. Reads `attributesOf(id)` live from BSC and renders name, description, attributes. |
| `api/image/[id].js` | Serverless dynamic SVG badge (`/api/image/<id>.svg`): passport number, edition, level pips, streaks, check-ins, holder. |
| `api/_lib/agentpass.js` | Shared zero-dependency helpers: config loading, `eth_call`, ABI decoding, metadata/SVG builders. |
| `assets/chain.js` | Zero-dependency browser helper for the static pages (config + read-only `eth_call` with RPC rotation). |
| `site-config.json` | **The single place for post-deploy values** (see §4). Everything else reads from it. |
| `vercel.json` | Rewrites: `/agents`, `/wall`, `/developers`, `/api/image/:id.svg`; cache headers for the API. |
| `test/run-tests.cjs` | Mock test for the metadata service — no mainnet needed (see §5). |

Design rules honored everywhere: **no promises of returns, rewards, or value**
in any copy; **no Binance branding** (the only brand text is the factual
"Built for the BNB Chain Agent ID Hackathon"); no credentials or secrets in
any file — all chain access is read-only against public RPC endpoints.

---

## 2. Deploy the site to Vercel

1. Import this `site/` folder as a Vercel project (framework preset: **Other**;
   no build command; output directory = project root). It is plain static
   files + Node serverless functions — no dependencies to install.
2. Deploy. Note the final production domain, e.g. `https://agentpass.vercel.app`
   (or your custom domain). **This domain is final** — it will be baked into
   the contract forever via `baseURI`.
3. Sanity-check the pre-launch state:
   - `/` renders with status "contract deploying soon".
   - `/agents` shows the full spec with `contract_address: null`.
   - `/api/token/7` returns the "Opening Soon" metadata JSON.
   - `/api/image/7.svg` returns an "OPENING SOON" badge.

No environment variables are required. Optional overrides (they win over
`site-config.json`): `AGENTPASS_CONTRACT_ADDRESS`, `AGENTPASS_OPENING_UNIX`,
`BSC_RPC_URL` (comma-separated RPC list).

---

## 3. Order of operations around the contract deployment

**Do not reorder.** `baseURI` is immutable.

1. **Deploy this site** (§2) and fix the final domain.
2. **Deploy the AgentPass contract** with constructor arguments:
   - `agentIdContract` = `0x60b9262456de011f7d15a54cdd8c48baaa8b022f` (SPACE ID Agent ID)
   - `openingUnix` = the announced opening time (unix seconds; announce ≥ 48 h ahead)
   - `founderSlots` = `1000`
   - `baseURI_` = `https://<FINAL-DOMAIN>/api/token/` ← **note the trailing slash**;
     the contract builds `tokenURI(id)` as `baseURI + id`, so token 7 must resolve
     to `https://<FINAL-DOMAIN>/api/token/7`.
3. **Verify the contract source on BscScan** immediately (compiler solc 0.8.26,
   optimizer 200 runs — exact match).
4. **Fill in `site-config.json`** (§4) with the deployed address and opening
   time, commit, and **redeploy the site**.
5. Verify end-to-end (§6). Only then announce the contract publicly —
   announcements come after deployment, with the future opening time, so
   screening agents schedule the opening instead of probing a closed mint
   (before `openingTime`, `quote()`/`costFor()` revert with
   "AgentPass: not open yet" — the `/agents` page explains this explicitly).

---

## 4. Values to fill in after mainnet deployment

Edit **only** `site-config.json` (then redeploy), or set the matching env vars:

| Key in `site-config.json` | Env override | Value to set |
|---|---|---|
| `contractAddress` | `AGENTPASS_CONTRACT_ADDRESS` | The deployed AgentPass contract address (checksummed `0x…`). Currently `null`. |
| `openingUnix` | `AGENTPASS_OPENING_UNIX` | The same unix timestamp passed to the constructor. Currently `null`. |
| `openingTimeISO` | — | The same moment in ISO 8601 UTC, e.g. `2026-12-01T12:00:00.000Z`. Must match `openingUnix`. Currently `null`. |

Everything else is already final and must not change casually:

| Key | Fixed value |
|---|---|
| `chainId` | `56` |
| `agentIdContract` | `0x60b9262456de011f7d15a54cdd8c48baaa8b022f` |
| `founderCap` | `1000` (must equal the constructor's `founderSlots`) |
| `bscscanBase` | `https://bscscan.com` |
| `rpcUrls` | Public BSC RPC endpoints (rotation order for browser reads) |
| `metadataBasePath` | `/api/token/` |
| `imagePathPattern` | `/api/image/{id}.svg` |

---

## 5. Testing the metadata service (mock — no mainnet)

```bash
node test/run-tests.cjs
```

The test stubs `fetch` so JSON-RPC `eth_call` requests for
`attributesOf(uint256)` are answered with canned chain data, then invokes the
real Vercel handlers with fake request/response objects. Eight scenarios:
pre-deploy "Opening Soon" metadata; minted Founder token (edition/level/streak
built from the mocked read); minted Standard token (id > 1000); unminted token
→ 404 (mocked revert); all RPCs down → 502; SVG badge content; pre-deploy
badge; invalid id → 400. Deployment state is simulated via the
`AGENTPASS_CONTRACT_ADDRESS` / `BSC_RPC_URL` env overrides described in §2.

Static checks worth re-running after edits:

```bash
node --check assets/chain.js
python3 -m json.tool site-config.json > /dev/null   # config is valid JSON
```

---

## 6. Post-deploy verification checklist

- [ ] `tokenURI(1)` on BscScan returns `https://<domain>/api/token/1`.
- [ ] `GET /api/token/1` (after the first mint) returns name `AgentPass #1`,
      `Edition: Founder`, and an `image` URL ending in `/api/image/1.svg`.
- [ ] `GET /api/image/1.svg` renders the badge with `#1`, `FOUNDER EDITION`.
- [ ] `/agents` shows the contract address, live `free_remaining`, and a
      `quote` probe of `0` once mint is open (or the documented pre-open
      revert note before opening).
- [ ] `/wall` counters move after a test mint + check-in.
- [ ] The contract address is added to our own hunt's exclusion list
      (own project — never auto-mint it; see AUDIT.md POV 1).
