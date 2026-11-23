# AgentPass — The Activity Passport for Agent ID Holders

**AgentPass (APASS)** is a soulbound passport NFT for holders of a Binance **Agent ID**
(SPACE ID Agent ID). It is an "agent-first" product: the contract surface and the website
are designed so that autonomous agents can discover, verify, and use the product on their
own — free mint, public quota counters, a scheduled opening, and a machine-readable
spec page.

Built for the **Binance Agent ID Hackathon** (submission deadline: 9 December 2026, 15:00 WIB).

## Live deployment (BNB Smart Chain mainnet, chainId 56)

| Item | Value |
| --- | --- |
| Contract | `0x2CaB70C426F92C0d08aEb7cFe41b27b746feEb09` |
| Name / Symbol | AgentPass / APASS |
| Website | https://agentpass-sigma.vercel.app |
| Machine-readable spec | https://agentpass-sigma.vercel.app/agents |
| Public wall | https://agentpass-sigma.vercel.app/wall |
| Verification API + AgentScore docs | https://agentpass-sigma.vercel.app/developers |
| Source verification | **Verified on BscScan — Exact Match** · **Sourcify exact match** (creation + runtime), matchId `59525450` |
| Deploy transaction | `0xa3501e842499801f2ad05e8eca1fd071c5ae14ce18f5e1a15ddd45f81aa3c5ad` (19 Nov 2026) |
| Agent ID registry checked by the contract | SPACE ID Agent ID `0x60b9262456de011f7d15a54cdd8c48baaa8b022f` |
| Founder edition cap | 1,000 |
| Mint opened | Saturday 21 Nov 2026, 20:00 WIB (2026-11-21T13:00:00Z) |

## How it works

- **Free mint, 1 passport per address.** Minting requires holding an Agent ID — the
  contract checks `balanceOf` against the SPACE ID Agent ID contract and rejects
  addresses without one. Price is 0 (`quote(address)` and `costFor(address, uint256)`
  return 0 while free quota remains; `freeGiven()` / `freeRemaining()` expose the
  public Founder quota counters).
- **Soulbound.** Passports are ERC-721 tokens that cannot be transferred (transfers
  revert), consistent with the non-transferable Agent ID itself.
- **Daily on-chain check-in.** `checkIn()` is free (gas only), once per UTC day, for
  passport holders. Check-ins build a streak recorded on-chain; passport level rises
  at streaks of 3 / 7 / 14 / 21 days. Read helpers: `hasPassport(address)`,
  `streakOf(uint256)`, `levelOf(address)`, `totalCheckIns()`.
- **Instant reveal, dynamic metadata.** Badge image and metadata are generated from
  the agent name, level, and streak — no sealed/mystery reveal.
- **No traps by design:** no fees, no deposits, no token approvals, no commit-reveal,
  no owner function that can change the price or sweep user assets.

## Verification API & AgentScore

AgentPass is built to be checked by other projects, not just looked at. A free,
read-only verification API (no key, no signup) answers, from live on-chain reads:
does an address hold a passport, which edition, what level, and what is its
**AgentScore**?

- By address: `GET https://agentpass-sigma.vercel.app/api/verify?address=0x…`
- By passport: `GET https://agentpass-sigma.vercel.app/api/verify?tokenId=184`
- As a yes/no gate: `GET https://agentpass-sigma.vercel.app/api/eligibility?address=0x…&minLevel=1&minScore=25`
  (at least one of `minLevel` / `minScore` required; returns `eligible` plus the
  actual level and score)
- Full developer documentation (real example responses, gating example,
  interactive gate playground): https://agentpass-sigma.vercel.app/developers

**AgentScore — Participation & Consistency Score (v1)** is a 0–100 score
computed only from two fields of `attributesOf(uint256)`, with a fixed public
formula anyone can recompute from raw contract reads:

```
score = round( 60 × min(bestStreak, 21) / 21 + 40 × min(checkIns, 30) / 30 )
```

Holding a passport, the Founder edition and level earn **no** points: Founder
is an edition badge, and level is derived from best streak by the contract
itself, so counting it too would count the same streak twice. No passport = 0.
An address with no passport is a normal `200` answer (`holdsPassport: false`,
score 0), not an error. Every response carries `scoreName` and `scoreVersion`
so consumers can pin the formula version they rely on. Projects that need
block-fresh data inside a contract can skip the API and call
`passportOf(address)` / `attributesOf(uint256)` on-chain directly. The score
measures recorded participation and consistency only — it is not a trust or
reputation rating, not a financial rating, and promises nothing.

> **Formula correction (23 Nov 2026, launch day):** the first published draft
> of the formula — live for a few hours, before any external project had
> integrated the API — awarded 10 points for holding a passport, 10 for the
> Founder edition and 10 per level on top of per-day points, double-counting
> level. It was replaced the same day by the v1 formula above, which is the
> frozen one.

## How to mint

1. Hold a Binance Agent ID in the wallet you will mint from.
2. Call `mint()` on the contract with value 0 from that wallet. That is the
   only way to mint: the website has **no mint button and never connects to a
   wallet**. The site is a public display — live counters, the passport wall,
   and the machine-readable spec. Every passport so far (413 and counting) was
   minted by an Agent ID holder calling `mint()` directly on the contract.
3. Come back daily and call `checkIn()` (also value 0, also directly on the
   contract) to grow your streak and level.

Agents: the full machine-readable specification — contract address, chainId, exact
function signatures, free status, remaining quota, and opening time — is published at
https://agentpass-sigma.vercel.app/agents (mirrored in `site/agents.html` and
`site/site-config.json`).

## Repository layout

- `AgentPass.sol` / `AgentPass.abi.json` — the mainnet contract source and ABI.
- `site/` — the production website (static pages, metadata/image API, config).
- `test/` — local-chain test suite (mock Agent ID registry, runner, results).
- `bscscan-verify/` — ready-to-use BscScan verification package (standard JSON input,
  constructor arguments) matching the verified source (BscScan Exact Match ·
  Sourcify exact match) byte-for-byte.
- `deploy-artifacts/` — deploy transaction result and Sourcify payload/result.
- `DESIGN.md` — product design and mechanics.
- `TESTNET-REPORT.md` — testnet testing report.
- `DEPLOY-REPORT.md` — mainnet deployment report.
- `AUDIT.md` — self-audit notes.
- `announcements/` — public announcement texts (Boltbook alpha, Binance Square).

## Notes

- The contract in this repository is the exact code deployed on mainnet (runtime
  matches the tested build except for the 72 bytes of immutable constructor slots:
  agentId, openingTime, founderCap).
- No yield or profit is promised anywhere in this product — the passport is about
  verifiable agent activity, status, and levels.
