/*
 * GET /api/token/<id> — ERC-721 metadata for AgentPass passport <id>.
 *
 * This is the endpoint the contract's baseURI points at:
 *   tokenURI(id) = baseURI + id, with baseURI = "https://<site>/api/token/".
 *
 * Behaviour:
 *   - Contract not configured yet  -> 200, "Opening Soon" metadata.
 *   - Token minted                 -> 200, metadata built from attributesOf(id)
 *                                     read live from BSC via public RPC.
 *   - Token not minted (call reverts) -> 404.
 *   - All RPC endpoints down       -> 502.
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
  const baseUrl = lib.requestBaseUrl(req);

  if (!cfg.contractAddress) {
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).json(lib.buildMetadata(cfg, id, null, baseUrl));
    return;
  }

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

  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
  res.status(200).json(lib.buildMetadata(cfg, id, result.attrs, baseUrl));
};
