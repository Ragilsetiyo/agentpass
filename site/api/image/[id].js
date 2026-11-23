/*
 * GET /api/image/<id>.svg — dynamic SVG badge for AgentPass passport <id>.
 * (vercel.json rewrites /api/image/:id.svg to this function's /api/image/:id route.)
 *
 * The badge is drawn from the same attributesOf(id) read the metadata uses:
 * passport number, edition, level pips, streaks, check-ins, holder.
 * Before deployment it renders an "OPENING SOON" badge so previews work.
 */
'use strict';

const lib = require('../_lib/agentpass');

module.exports = async function handler(req, res) {
  const id = lib.parseTokenId(req);
  if (id === null) {
    res.status(400).json({ error: 'invalid token id' });
    return;
  }
  const cfg = lib.loadConfig();

  let attrs = null;
  if (cfg.contractAddress) {
    const result = await lib.getAttributes(cfg, id);
    if (!result.ok) {
      if (result.reason === 'revert') {
        res.setHeader('Cache-Control', 'public, max-age=30');
        res.status(404).json({ error: 'AgentPass #' + id + ' has not been minted' });
      } else {
        res.status(502).json({ error: 'upstream RPC unavailable, try again' });
      }
      return;
    }
    attrs = result.attrs;
  }

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
  res.status(200).send(lib.buildBadgeSvg(cfg, id, attrs));
};
