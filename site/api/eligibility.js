/*
 * GET /api/eligibility?address=0x…&minLevel=<n>&minScore=<n>
 *
 * Public eligibility gate for other projects: answer, from live on-chain
 * reads only, whether an address's AgentPass meets a caller-chosen bar —
 * a minimum passport level and/or a minimum AgentScore v1 (Participation &
 * Consistency Score, formula in api/_lib/agentpass.js). This is the
 * access-control companion to /api/verify: verify returns the facts,
 * eligibility returns the yes/no for a requirement.
 *
 * Behaviour:
 *   - address + at least one of minLevel / minScore are required.
 *   - minLevel must be an integer 0..4, minScore an integer 0..100.
 *   - Address holds no passport -> 200, eligible: false (not an error).
 *   - Missing/invalid parameter -> 400.
 *   - All RPC endpoints down    -> 502.
 * Responses are cacheable for a short window (public, max-age=60,
 * s-maxage=300) — the same pattern as /api/verify — so a cached answer can
 * lag the chain by up to ~5 minutes at the edge. For block-fresh gating
 * inside a smart contract, read passportOf / attributesOf on-chain
 * directly instead (see /developers).
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

function parseRequirement(raw, name, max) {
  if (raw === null) return { given: false, value: null };
  if (!/^\d+$/.test(String(raw))) return { error: name + ' must be an integer 0..' + max };
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0 || n > max) {
    return { error: name + ' must be an integer 0..' + max };
  }
  return { given: true, value: n };
}

module.exports = async function handler(req, res) {
  const cfg = lib.loadConfig();
  const rawAddress = queryParam(req, 'address');
  const minLevel = parseRequirement(queryParam(req, 'minLevel'), 'minLevel', 4);
  const minScore = parseRequirement(queryParam(req, 'minScore'), 'minScore', 100);

  if (!cfg.contractAddress) {
    res.status(503).json({ error: 'contract not configured yet' });
    return;
  }
  if (rawAddress === null || !ADDRESS_RE.test(String(rawAddress))) {
    res.status(400).json({
      error: 'pass ?address=0x… plus at least one of ?minLevel=<0..4> or ?minScore=<0..100>',
      example: '/api/eligibility?address=0x21351a1Aa7f55596883Bd7861D9A92Dc59f2d0D6&minLevel=1'
    });
    return;
  }
  if (minLevel.error || minScore.error) {
    res.status(400).json({ error: minLevel.error || minScore.error });
    return;
  }
  if (!minLevel.given && !minScore.given) {
    res.status(400).json({
      error: 'at least one requirement is required: ?minLevel=<0..4> and/or ?minScore=<0..100>',
      example: '/api/eligibility?address=0x21351a1Aa7f55596883Bd7861D9A92Dc59f2d0D6&minLevel=1&minScore=25'
    });
    return;
  }

  const address = String(rawAddress).toLowerCase();
  const requirements = { minLevel: minLevel.value, minScore: minScore.value };

  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
  const blockNumber = await lib.getBlockNumber(cfg);
  const base = {
    project: cfg.project,
    contract: cfg.contractAddress,
    chainId: cfg.chainId,
    source: 'Live on-chain reads (passportOf + attributesOf) via public BSC RPC. ' +
      'Responses may be cached up to 60s by browsers and 300s at the edge.',
    address,
    requirements,
    scoreName: lib.SCORE_NAME,
    scoreVersion: lib.SCORE_VERSION,
    blockNumber
  };

  const found = await lib.getPassportOf(cfg, address);
  if (!found.ok) {
    res.status(502).json({ error: 'upstream RPC unavailable, try again' });
    return;
  }
  if (found.tokenId === 0n) {
    res.status(200).json(Object.assign(base, {
      eligible: false,
      actual: { holdsPassport: false, founder: false, tokenId: null, level: 0, agentScore: 0 }
    }));
    return;
  }
  const tokenId = Number(found.tokenId);
  const result = await lib.getAttributes(cfg, tokenId);
  if (!result.ok) {
    // passportOf said a passport exists; attributesOf failing here is an
    // upstream problem, not a "not eligible" answer.
    res.status(502).json({ error: 'upstream RPC unavailable, try again' });
    return;
  }
  const attrs = result.attrs;
  const level = Number(attrs.level);
  const agentScore = lib.computeAgentScore(attrs).score;
  const eligible =
    (requirements.minLevel === null || level >= requirements.minLevel) &&
    (requirements.minScore === null || agentScore >= requirements.minScore);
  res.status(200).json(Object.assign(base, {
    eligible,
    actual: {
      holdsPassport: true,
      founder: attrs.founder,
      tokenId,
      level,
      agentScore
    }
  }));
};
