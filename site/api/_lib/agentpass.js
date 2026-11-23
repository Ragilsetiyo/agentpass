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
  buildMetadata,
  buildBadgeSvg,
  requestBaseUrl,
  parseTokenId,
  levelLabel,
  SELECTOR_ATTRIBUTES_OF
};
