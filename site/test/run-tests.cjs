/*
 * Mock test for the AgentPass metadata service — NO mainnet needed.
 *
 * How it works:
 *   - globalThis.fetch is replaced with a stub that answers JSON-RPC
 *     eth_call requests for attributesOf(uint256) with canned chain data
 *     (or a revert, or a transport failure, per scenario).
 *   - The Vercel handlers are invoked directly with fake req/res objects.
 *   - Deployment state is simulated with env vars: when
 *     AGENTPASS_CONTRACT_ADDRESS is unset, loadConfig() falls back to
 *     site-config.json, whose contractAddress is null (pre-deploy).
 *
 * Run:  node test/run-tests.cjs
 */
'use strict';

const assert = require('assert');

const tokenHandler = require('../api/token/[id].js');
const imageHandler = require('../api/image/[id].js');

const FAKE_CONTRACT = '0x1111111111111111111111111111111111111111';
const ATTR_SELECTOR = '0x09363c44';

// ---------- canned chain data ----------
function word(hex) { return hex.padStart(64, '0'); }
function attributesResult({ owner, founder, streak, bestStreak, checkIns, level }) {
  const body =
    word(owner.replace(/^0x/, '')) +
    word(founder ? '1' : '0') +
    word(BigInt(streak).toString(16)) +
    word(BigInt(bestStreak).toString(16)) +
    word(BigInt(checkIns).toString(16)) +
    word(BigInt(level).toString(16));
  return '0x' + body;
}

const TOKENS = {
  7: attributesResult({ owner: '0x2222222222222222222222222222222222222222', founder: true, streak: 5, bestStreak: 9, checkIns: 12, level: 2 }),
  1500: attributesResult({ owner: '0x3333333333333333333333333333333333333333', founder: false, streak: 0, bestStreak: 0, checkIns: 0, level: 0 })
};

// mode: 'ok' | 'revert' | 'down'
let rpcMode = 'ok';
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (rpcMode === 'down') throw new TypeError('fetch failed (mock)');
  const body = JSON.parse(opts.body);
  assert.strictEqual(body.method, 'eth_call');
  const data = body.params[0].data;
  assert.ok(data.startsWith(ATTR_SELECTOR), 'expected attributesOf call, got ' + data.slice(0, 10));
  const id = Number(BigInt('0x' + data.slice(10)));
  if (rpcMode === 'revert' || !TOKENS[id]) {
    return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: 3, message: 'execution reverted: AgentPass: no such token' } }) };
  }
  return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: TOKENS[id] }) };
};

// ---------- fake req/res ----------
function fakeReq(id) {
  return { query: { id: String(id) }, headers: { host: 'agentpass.test', 'x-forwarded-proto': 'https' }, url: '/api/token/' + id };
}
function fakeRes() {
  return {
    statusCode: null, headers: {}, body: null, jsonBody: null,
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
    json(o) { this.jsonBody = o; this.body = JSON.stringify(o); return this; },
    send(b) { this.body = b; return this; }
  };
}

function setDeployed() {
  process.env.AGENTPASS_CONTRACT_ADDRESS = FAKE_CONTRACT;
  process.env.BSC_RPC_URL = 'https://rpc.mock.invalid';
}
function setNotDeployed() {
  delete process.env.AGENTPASS_CONTRACT_ADDRESS;
  delete process.env.BSC_RPC_URL;
}

(async () => {
  let passed = 0;
  const ok = (name) => { passed++; console.log('  PASS  ' + name); };

  // A — pre-deploy metadata (contractAddress null in site-config.json)
  setNotDeployed(); rpcMode = 'ok';
  {
    const res = fakeRes();
    await tokenHandler(fakeReq(7), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.jsonBody.name, 'AgentPass — Opening Soon');
    assert.strictEqual(res.jsonBody.image, 'https://agentpass.test/api/image/7.svg');
    assert.strictEqual(res.jsonBody.attributes[0].value, 'Not yet launched');
    ok('A: pre-deploy token metadata returns Opening Soon');
  }
  // B — minted Founder token #7
  setDeployed(); rpcMode = 'ok';
  {
    const res = fakeRes();
    await tokenHandler(fakeReq(7), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.jsonBody.name, 'AgentPass #7');
    const attrs = Object.fromEntries(res.jsonBody.attributes.map((a) => [a.trait_type, a.value]));
    assert.strictEqual(attrs['Edition'], 'Founder');
    assert.strictEqual(attrs['Level'], 2);
    assert.strictEqual(attrs['Best Streak'], 9);
    assert.strictEqual(attrs['Current Streak'], 5);
    assert.strictEqual(attrs['Check-ins'], 12);
    assert.ok(res.jsonBody.image.endsWith('/api/image/7.svg'));
    assert.ok(!/return|profit|reward/i.test(res.jsonBody.description.replace('no returns, rewards', '')), 'no yield language');
    ok('B: minted Founder token metadata built from mocked attributesOf');
  }
  // C — minted Standard token #1500
  {
    const res = fakeRes();
    await tokenHandler(fakeReq(1500), res);
    assert.strictEqual(res.statusCode, 200);
    const attrs = Object.fromEntries(res.jsonBody.attributes.map((a) => [a.trait_type, a.value]));
    assert.strictEqual(attrs['Edition'], 'Standard');
    assert.strictEqual(attrs['Level'], 0);
    ok('C: tokenId > founderCap renders Standard edition');
  }
  // D — unminted token (attributesOf reverts) -> 404
  rpcMode = 'revert';
  {
    const res = fakeRes();
    await tokenHandler(fakeReq(42), res);
    assert.strictEqual(res.statusCode, 404);
    ok('D: unminted token returns 404');
  }
  // E — all RPC down -> 502
  rpcMode = 'down';
  {
    const res = fakeRes();
    await tokenHandler(fakeReq(7), res);
    assert.strictEqual(res.statusCode, 502);
    ok('E: RPC failure returns 502');
  }
  // F — SVG badge for minted token #7
  rpcMode = 'ok';
  {
    const res = fakeRes();
    await imageHandler(fakeReq(7), res);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('image/svg+xml'));
    assert.ok(res.body.includes('#7'));
    assert.ok(res.body.includes('FOUNDER EDITION'));
    assert.ok(res.body.includes('LEVEL'));
    assert.ok(res.body.includes('9 DAYS'));
    ok('F: SVG badge renders number, edition, level, streak');
  }
  // G — SVG badge pre-deploy -> OPENING SOON
  setNotDeployed();
  {
    const res = fakeRes();
    await imageHandler(fakeReq(7), res);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.includes('OPENING SOON'));
    ok('G: pre-deploy badge renders OPENING SOON');
  }
  // H — invalid id -> 400
  setDeployed(); rpcMode = 'ok';
  {
    const res = fakeRes();
    await tokenHandler({ query: { id: 'abc' }, headers: { host: 'agentpass.test' }, url: '/api/token/abc' }, res);
    assert.strictEqual(res.statusCode, 400);
    ok('H: invalid token id returns 400');
  }

  globalThis.fetch = realFetch;
  console.log('\nAll ' + passed + ' mock scenarios passed.');
})().catch((e) => {
  globalThis.fetch = realFetch;
  console.error('TEST FAILURE:', e);
  process.exit(1);
});
