/*
 * AgentPass — shared serverless helpers (Vercel Node runtime, zero dependencies).
 *
 * Used by api/token/[id].js and api/image/[id].js. The "_" prefix on this
 * folder keeps Vercel from treating it as a route.
 *
 * Configuration precedence (highest first):
 *   1. Environment variables: AGENTPASS_CONTRACT_ADDRESS, AGENTPASS_OPENING_UNIX,
 *      BSC_RPC_URL (comma-separated list allowed).
 *   2. site-config.json at the site root (the single post-deploy config file).
 *
 * All chain access is read-only eth_call against public BSC RPC endpoints.
 * The one call the metadata service needs is attributesOf(uint256), which
 * returns (address owner, bool founder, uint256 streak, uint256 bestStreak,
 * uint256 checkIns, uint256 level) — every attribute in a single read, so the
 * metadata is reproducible from chain data alone.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SELECTOR_ATTRIBUTES_OF = '0x09363c44'; // attributesOf(uint256)
const SELECTOR_PASSPORT_OF = '0x5d1c2634'; // passportOf(address)

const DEFAULTS = {
  project: 'AgentPass',
  chainId: 56,
  contractAddress: null,
  agentIdContract: '0x60b9262456de011f7d15a54cdd8c48baaa8b022f',
  founderCap: 1000,
  openingUnix: null,
  openingTimeISO: null,
  rpcUrls: [
    'https://bsc-dataseed.binance.org',
    'https://bsc-rpc.publicnode.com',
    'https://bsc-dataseed1.defibit.io'
  ]
};

const LEVEL_LABELS = ['Passport Issued', 'Active', 'Regular', 'Committed', 'Core'];

function loadConfig() {
  const cfg = Object.assign({}, DEFAULTS);
  const candidates = [
    path.join(__dirname, '..', '..', 'site-config.json'),
    path.join(process.cwd(), 'site-config.json')
  ];
  for (const p of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      for (const k of Object.keys(DEFAULTS)) {
        if (parsed[k] !== undefined) cfg[k] = parsed[k];
      }
      break;
    } catch (e) { /* try next candidate */ }
  }
  if (process.env.AGENTPASS_CONTRACT_ADDRESS) {
    cfg.contractAddress = process.env.AGENTPASS_CONTRACT_ADDRESS;
  }
  if (process.env.AGENTPASS_OPENING_UNIX) {
    const n = Number(process.env.AGENTPASS_OPENING_UNIX);
    if (Number.isFinite(n)) cfg.openingUnix = n;
  }
  if (process.env.BSC_RPC_URL) {
    cfg.rpcUrls = process.env.BSC_RPC_URL.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return cfg;
}

function encodeUint(n) {
  return BigInt(n).toString(16).padStart(64, '0');
}

async function rpcRequest(url, method, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  if (!res.ok) throw new Error('RPC HTTP ' + res.status);
  const json = await res.json();
  if (json.error) {
    const err = new Error(json.error.message || 'RPC error');
    err.rpcError = json.error;
    throw err;
  }
  return json.result;
}

async function ethCall(cfg, data) {
  let lastErr = null;
  for (const url of cfg.rpcUrls) {
    try {
      return await rpcRequest(url, 'eth_call', [{ to: cfg.contractAddress, data }, 'latest']);
    } catch (e) {
      lastErr = e;
      // A revert is a definitive answer from the chain, not a transport
      // failure — do not mask it by trying other endpoints.
      if (e.rpcError) throw e;
    }
  }
  throw lastErr || new Error('no RPC endpoints configured');
}

/*
 * Reads attributesOf(tokenId).
 * Returns one of:
 *   { ok: true, attrs: { owner, founder, streak, bestStreak, checkIns, level } }
 *   { ok: false, reason: 'revert' }  — token does not exist (call reverted)
 *   { ok: false, reason: 'rpc' }     — every RPC endpoint failed
 */
async function getAttributes(cfg, tokenId) {
  const data = SELECTOR_ATTRIBUTES_OF + encodeUint(tokenId);
  let hex;
  try {
    hex = await ethCall(cfg, data);
  } catch (e) {
    if (e && e.rpcError) return { ok: false, reason: 'revert' };
    return { ok: false, reason: 'rpc' };
  }
  if (!hex || hex === '0x' || hex.length < 2 + 64 * 6) {
    return { ok: false, reason: 'revert' };
  }
  const body = hex.slice(2);
  const word = (i) => body.slice(i * 64, (i + 1) * 64);
  const uint = (i) => BigInt('0x' + word(i));
  return {
    ok: true,
    attrs: {
      owner: '0x' + word(0).slice(24),
      founder: uint(1) !== 0n,
      streak: uint(2),
      bestStreak: uint(3),
      checkIns: uint(4),
      level: uint(5)
    }
  };
}

function encodeAddress(addr) {
  return String(addr).replace(/^0x/i, '').toLowerCase().padStart(64, '0');
}

/*
 * Reads passportOf(address) — the tokenId of the address's passport,
 * or 0 when the address holds none. Same result contract as getAttributes:
 *   { ok: true, tokenId } | { ok: false, reason: 'rpc' }
 * (passportOf never reverts for a well-formed address.)
 */
async function getPassportOf(cfg, address) {
  const data = SELECTOR_PASSPORT_OF + encodeAddress(address);
  let hex;
  try {
    hex = await ethCall(cfg, data);
  } catch (e) {
    return { ok: false, reason: 'rpc' };
  }
  if (!hex || hex === '0x') return { ok: false, reason: 'rpc' };
  return { ok: true, tokenId: BigInt(hex) };
}

/*
 * AgentScore v1 — the "Participation & Consistency Score". A 0..100 score
 * computed ONLY from two fields of attributesOf(uint256): bestStreak and
 * checkIns. The formula is fixed, public and frozen, so anyone can recompute
 * the exact same score from raw contract reads:
 *
 *   score = round( 60 * min(bestStreak, 21) / 21
 *                + 40 * min(checkIns, 30) / 30 )
 *
 *   bestStreak contribution — consistency: up to 60 points for a best streak
 *                             of 21 days (the streak that earns level 4)
 *   checkIns contribution   — participation: up to 40 points for 30 lifetime
 *                             check-ins
 *   TOTAL                                                        — max 100
 *
 * Holding a passport, the Founder edition and the level earn NO points:
 * founder is an edition badge (reported as its own field), and level is
 * derived from best streak by the contract itself, so awarding points for
 * level as well would count the same streak twice. An address with no
 * passport scores 0.
 *
 * Correction note (23 Nov 2026, launch day, before any external project had
 * integrated the API): the first published draft of this formula awarded
 * 10 points for holding a passport, 10 for Founder and 10 per level on top
 * of per-day streak/check-in points — double-counting level, which is a
 * pure function of best streak. That draft was replaced the same day by
 * this v1 formula, which is the frozen one. The score measures recorded
 * on-chain participation and consistency only; it is not a trust or
 * reputation rating, not a financial rating, and promises nothing.
 */
const SCORE_NAME = 'AgentScore — Participation & Consistency Score';
const SCORE_VERSION = 1;
const SCORE_CAPS = { bestStreakDays: 21, bestStreakPoints: 60, checkInsCount: 30, checkInsPoints: 40 };

function computeAgentScore(attrs) {
  if (!attrs) {
    return { score: 0, breakdown: { bestStreak: 0, checkIns: 0 } };
  }
  const bestStreakPart = SCORE_CAPS.bestStreakPoints *
    Math.min(Number(attrs.bestStreak), SCORE_CAPS.bestStreakDays) / SCORE_CAPS.bestStreakDays;
  const checkInsPart = SCORE_CAPS.checkInsPoints *
    Math.min(Number(attrs.checkIns), SCORE_CAPS.checkInsCount) / SCORE_CAPS.checkInsCount;
  const breakdown = {
    bestStreak: Math.round(bestStreakPart * 100) / 100,
    checkIns: Math.round(checkInsPart * 100) / 100
  };
  return { score: Math.round(bestStreakPart + checkInsPart), breakdown };
}

const SCORE_FORMULA_TEXT =
  'AgentScore v1 (0-100) — Participation & Consistency Score = ' +
  'round(60 * min(bestStreak, 21) / 21 + 40 * min(checkIns, 30) / 30). ' +
  'Computed only from attributesOf(uint256); no passport = 0. Holding a passport, ' +
  'Founder edition and level earn no points (level is derived from best streak, ' +
  'so it is never counted twice); founder and level are reported as separate fields.';

/*
 * Reads the current block number (eth_blockNumber) from the first RPC that
 * answers. Returns a Number, or null when every endpoint fails — callers
 * treat blockNumber as best-effort metadata, never as a hard dependency.
 */
async function getBlockNumber(cfg) {
  for (const url of cfg.rpcUrls) {
    try {
      const hex = await rpcRequest(url, 'eth_blockNumber', []);
      if (hex && hex !== '0x') return Number(BigInt(hex));
    } catch (e) { /* try next endpoint */ }
  }
  return null;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function levelLabel(level) {
  const n = Number(level);
  return LEVEL_LABELS[n] || LEVEL_LABELS[0];
}

function buildMetadata(cfg, tokenId, attrs, baseUrl) {
  const image = baseUrl + '/api/image/' + tokenId + '.svg';
  if (!attrs) {
    return {
      name: 'AgentPass — Opening Soon',
      description:
        'AgentPass is a free, soulbound activity passport for Binance Agent ID holders on BNB Smart Chain. ' +
        'The contract is not live yet. When it opens, passport #' + tokenId + ' will be revealed here directly ' +
        'from on-chain data. AgentPass is an activity record; it promises no returns, rewards, or future value.',
      image,
      attributes: [
        { trait_type: 'Status', value: 'Not yet launched' },
        { trait_type: 'Edition', value: tokenId <= (cfg.founderCap || 1000) ? 'Founder (reserved range)' : 'Standard (reserved range)' }
      ]
    };
  }
  const level = Number(attrs.level);
  return {
    name: 'AgentPass #' + tokenId,
    description:
      'A soulbound activity passport for a Binance Agent ID holder on BNB Smart Chain. ' +
      'Level ' + level + ' (' + levelLabel(level) + '), earned from a best check-in streak of ' +
      attrs.bestStreak.toString() + ' days. This passport can never be transferred. ' +
      'All attributes are read from the AgentPass contract (attributesOf). AgentPass is an activity ' +
      'record; it promises no returns, rewards, or future value.',
    image,
    external_url: baseUrl + '/',
    attributes: [
      { trait_type: 'Edition', value: attrs.founder ? 'Founder' : 'Standard' },
      { trait_type: 'Level', value: level },
      { trait_type: 'Level Label', value: levelLabel(level) },
      { trait_type: 'Best Streak', value: Number(attrs.bestStreak), display_type: 'number' },
      { trait_type: 'Current Streak', value: Number(attrs.streak), display_type: 'number' },
      { trait_type: 'Check-ins', value: Number(attrs.checkIns), display_type: 'number' },
      { trait_type: 'Soulbound', value: 'Yes' }
    ]
  };
}

function buildBadgeSvg(cfg, tokenId, attrs) {
  const founder = attrs ? attrs.founder : tokenId <= (cfg.founderCap || 1000);
  const edition = attrs
    ? (founder ? 'FOUNDER EDITION' : 'STANDARD EDITION')
    : 'OPENING SOON';
  const level = attrs ? Number(attrs.level) : 0;
  const pips = [1, 2, 3, 4].map((i) => {
    const cx = 400 + (i - 2.5) * 44;
    const fill = attrs && level >= i ? '#f0b90b' : 'none';
    return '<circle cx="' + cx.toFixed(0) + '" cy="512" r="13" fill="' + fill +
      '" stroke="#f0b90b" stroke-width="2.5"/>';
  }).join('');
  const rows = attrs
    ? [
        ['LEVEL', level + ' — ' + levelLabel(level)],
        ['BEST STREAK', attrs.bestStreak.toString() + ' DAYS'],
        ['CURRENT STREAK', attrs.streak.toString() + ' DAYS'],
        ['CHECK-INS', attrs.checkIns.toString()],
        ['HOLDER', attrs.owner.slice(0, 6) + '…' + attrs.owner.slice(-4)]
      ]
    : [
        ['STATUS', 'NOT YET LAUNCHED'],
        ['PRICE', 'FREE — FOREVER'],
        ['SUPPLY', 'FIRST 1,000 = FOUNDER'],
        ['TRANSFER', 'SOULBOUND']
      ];
  const rowsSvg = rows.map((r, i) => {
    const y = 596 + i * 40;
    return '<text x="130" y="' + y + '" font-size="21" fill="#9aa5b8" letter-spacing="2">' + escapeXml(r[0]) + '</text>' +
      '<text x="670" y="' + y + '" font-size="23" fill="#e8ecf3" text-anchor="end" font-weight="600">' + escapeXml(r[1]) + '</text>';
  }).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">' +
    '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#12161f"/><stop offset="1" stop-color="#0b0e14"/></linearGradient></defs>' +
    '<rect x="0" y="0" width="800" height="800" fill="url(#bg)"/>' +
    '<rect x="26" y="26" width="748" height="748" rx="34" fill="none" stroke="#f0b90b" stroke-width="3"/>' +
    '<rect x="44" y="44" width="712" height="712" rx="26" fill="none" stroke="#232a3a" stroke-width="1.5"/>' +
    '<g font-family="\'Segoe UI\', Helvetica, Arial, sans-serif">' +
    '<text x="400" y="140" font-size="44" font-weight="800" fill="#e8ecf3" text-anchor="middle" letter-spacing="6">AGENT<tspan fill="#f0b90b">PASS</tspan></text>' +
    '<text x="400" y="178" font-size="19" fill="#9aa5b8" text-anchor="middle" letter-spacing="4">ACTIVITY PASSPORT — BNB CHAIN</text>' +
    '<text x="400" y="330" font-size="150" font-weight="800" fill="#e8ecf3" text-anchor="middle">#' + tokenId + '</text>' +
    '<text x="400" y="392" font-size="27" font-weight="700" fill="' + (founder && attrs ? '#f0b90b' : '#3ecf8e') + '" text-anchor="middle" letter-spacing="5">' + edition + '</text>' +
    pips +
    rowsSvg +
    '<text x="400" y="742" font-size="17" fill="#9aa5b8" text-anchor="middle" letter-spacing="3">SOULBOUND — CANNOT BE TRANSFERRED</text>' +
    '</g></svg>';
}

function requestBaseUrl(req) {
  const proto = (req.headers && (req.headers['x-forwarded-proto'] || 'https')) || 'https';
  const host = (req.headers && req.headers.host) || 'localhost';
  return proto.split(',')[0].trim() + '://' + host;
}

function parseTokenId(req) {
  let raw = null;
  if (req.query && req.query.id !== undefined) raw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (raw === null && req.url) {
    const m = req.url.match(/\/(\d+)(?:\.svg)?(?:\?.*)?$/);
    if (m) raw = m[1];
  }
  if (raw === null || !/^\d+$/.test(String(raw))) return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1 || n > 1000000000) return null;
  return n;
}

module.exports = {
  loadConfig,
  getAttributes,
  getPassportOf,
  getBlockNumber,
  computeAgentScore,
  buildMetadata,
  buildBadgeSvg,
  requestBaseUrl,
  parseTokenId,
  levelLabel,
  SCORE_FORMULA_TEXT,
  SCORE_NAME,
  SCORE_VERSION,
  SELECTOR_ATTRIBUTES_OF,
  SELECTOR_PASSPORT_OF
};
