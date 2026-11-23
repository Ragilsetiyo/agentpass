/*
 * GET /api/verify?address=0x…   — verify an address's AgentPass + AgentScore.
 * GET /api/verify?tokenId=184   — same, starting from a passport tokenId.
 *
 * Public verification API for other projects: answer, from live on-chain
 * reads only, whether an address holds an AgentPass passport, its edition,
 * level, streaks and check-in count, and its AgentScore (0–100, formula in
 * api/_lib/agentpass.js — computeAgentScore — and on the /developers page).
 *
 * Behaviour:
 *   - Address holds a passport  -> 200, holdsPassport: true, full fields.
 *   - Address holds none        -> 200, holdsPassport: false, agentScore: 0.
 *   - tokenId not minted        -> 404, holdsPassport: false.
 *   - Missing/invalid parameter -> 400.
 *   - All RPC endpoints down    -> 502.
 * Responses are cacheable for a short window (public, max-age=60,
 * s-maxage=300) — the same pattern as /api/token — so a cached answer can
 * lag the chain by up to ~5 minutes at the edge.
 */
'use strict';

const lib = require('./_lib/agentpass');

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function queryParam(req, name) {
  if (req.query && req.query[name] !== undefined) {
    const v = req.query[name];
    return Array.isArray(v) ? v[0] : v;
  }
  if (req.url) {
    try {
      const u = new URL(req.url, 'http://localhost');
      const v = u.searchParams.get(name);
      if (v !== null) return v;
    } catch (e) { /* fall through */ }
  }
  return null;
}

function basePayload(cfg) {
  return {
    project: cfg.project,
    contract: cfg.contractAddress,
    chainId: cfg.chainId,
    source: 'Live on-chain reads (passportOf + attributesOf) via public BSC RPC. ' +
      'Responses may be cached up to 60s by browsers and 300s at the edge.'
  };
}

function holderPayload(cfg, address, tokenId, attrs) {
  const scored = lib.computeAgentScore(attrs);
  return Object.assign(basePayload(cfg), {
    address,
    tokenId,
    holdsPassport: true,
    founder: attrs.founder,
    edition: attrs.founder ? 'Founder' : 'Standard',
    level: Number(attrs.level),
    levelLabel: lib.levelLabel(attrs.level),
    streak: Number(attrs.streak),
    bestStreak: Number(attrs.bestStreak),
    totalCheckIns: Number(attrs.checkIns),
    agentScore: scored.score,
    scoreBreakdown: scored.breakdown,
    scoreFormula: lib.SCORE_FORMULA_TEXT
  });
}

module.exports = async function handler(req, res) {
  const cfg = lib.loadConfig();
  const rawAddress = queryParam(req, 'address');
  const rawTokenId = queryParam(req, 'tokenId');

  if (!cfg.contractAddress) {
    res.status(503).json({ error: 'contract not configured yet' });
    return;
  }
  if (rawAddress === null && rawTokenId === null) {
    res.status(400).json({
      error: 'pass ?address=0x… or ?tokenId=<id>',
      example: '/api/verify?address=0x21351a1Aa7f55596883Bd7861D9A92Dc59f2d0D6'
    });
    return;
  }

  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');

  // --- lookup by tokenId ---
  if (rawTokenId !== null && rawAddress === null) {
    if (!/^\d+$/.test(String(rawTokenId))) {
      res.status(400).json({ error: 'invalid tokenId' });
      return;
    }
    const tokenId = Number(rawTokenId);
    if (!Number.isSafeInteger(tokenId) || tokenId < 1 || tokenId > 1000000000) {
      res.status(400).json({ error: 'invalid tokenId' });
      return;
    }
    const result = await lib.getAttributes(cfg, tokenId);
    if (!result.ok) {
      if (result.reason === 'revert') {
        res.status(404).json(Object.assign(basePayload(cfg), {
          tokenId, holdsPassport: false, agentScore: 0,
          error: 'AgentPass #' + tokenId + ' has not been minted'
        }));
      } else {
        res.status(502).json({ error: 'upstream RPC unavailable, try again' });
      }
      return;
    }
    res.status(200).json(holderPayload(cfg, result.attrs.owner, tokenId, result.attrs));
    return;
  }

  // --- lookup by address ---
  if (!ADDRESS_RE.test(String(rawAddress))) {
    res.status(400).json({ error: 'invalid address (expected 0x + 40 hex chars)' });
    return;
  }
  const address = String(rawAddress).toLowerCase();
  const found = await lib.getPassportOf(cfg, address);
  if (!found.ok) {
    res.status(502).json({ error: 'upstream RPC unavailable, try again' });
    return;
  }
  if (found.tokenId === 0n) {
    res.status(200).json(Object.assign(basePayload(cfg), {
      address,
      tokenId: null,
      holdsPassport: false,
      founder: false,
      edition: null,
      level: 0,
      levelLabel: lib.levelLabel(0),
      streak: 0,
      bestStreak: 0,
      totalCheckIns: 0,
      agentScore: 0,
      scoreBreakdown: { passport: 0, founder: 0, level: 0, checkIns: 0, bestStreak: 0 },
      scoreFormula: lib.SCORE_FORMULA_TEXT
    }));
    return;
  }
  const tokenId = Number(found.tokenId);
  const result = await lib.getAttributes(cfg, tokenId);
  if (!result.ok) {
    // passportOf said a passport exists; attributesOf failing here is an
    // upstream problem, not a "no passport" answer.
    res.status(502).json({ error: 'upstream RPC unavailable, try again' });
    return;
  }
  res.status(200).json(holderPayload(cfg, address, tokenId, result.attrs));
};
