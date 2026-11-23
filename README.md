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
| Source verification | **Sourcify — exact match** (creation + runtime), matchId `59525450` |
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

## How to mint

1. Hold a Binance Agent ID in the wallet you will mint from.
2. Call `mint()` on the contract with value 0 from that wallet. That is the
   only way to mint: the website has **no mint button and never connects to a
   wallet**. The site is a public display — live counters, the passport wall,
   and the machine-readable spec. Every passport so far (411 and counting) was
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
  constructor arguments) matching the Sourcify-verified source byte-for-byte.
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
