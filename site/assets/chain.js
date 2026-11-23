/*
 * AgentPass — tiny zero-dependency chain helper for the static pages.
 * Reads site-config.json, performs read-only eth_call against public BSC RPC
 * endpoints (rotating on failure), and decodes the small set of return types
 * the AgentPass contract exposes. No wallet, no signing, no keys — reads only.
 */
(function (global) {
  'use strict';

  // Function selectors, computed from the exact signatures in AgentPass.abi.json
  // (keccak-256; sanity-checked: name() = 0x06fdde03, ownerOf = 0x6352211e).
  var SELECTORS = {
    'quote(address)': '0x0b39ed47',
    'costFor(address,uint256)': '0xf31cc4e6',
    'freeGiven()': '0x3aedb2f1',
    'freeRemaining()': '0x5a781a6b',
    'hasPassport(address)': '0x4dc30e87',
    'levelOf(address)': '0x5c138c9d',
    'streakOf(uint256)': '0xf5490339',
    'bestStreakOf(uint256)': '0x3b6433ac',
    'checkInsOf(uint256)': '0xcc6aa2b7',
    'attributesOf(uint256)': '0x09363c44',
    'totalCheckIns()': '0xa563eaa3',
    'totalMinted()': '0xa2309ff8',
    'openingTime()': '0xb7a8807c',
    'mintOpen()': '0x24bbd049',
    'founderCap()': '0x239ff423',
    'isFounder(uint256)': '0xa303cf8e',
    'mint()': '0x1249c58b',
    'checkIn()': '0x183ff085',
    'ownerOf(uint256)': '0x6352211e',
    'tokenURI(uint256)': '0xc87b56dd',
    'balanceOf(address)': '0x70a08231',
    'passportOf(address)': '0x5d1c2634',
    'agentId()': '0xe84f43b7',
    'name()': '0x06fdde03',
    'symbol()': '0x95d89b41',
    'lastCheckInDay(uint256)': '0x08ef3a1e'
  };

  var FALLBACK_CONFIG = {
    project: 'AgentPass',
    chainId: 56,
    chainName: 'BNB Smart Chain',
    contractAddress: null,
    agentIdContract: '0x60b9262456de011f7d15a54cdd8c48baaa8b022f',
    agentIdName: 'SPACE ID Agent ID',
    founderCap: 1000,
    openingUnix: null,
    openingTimeISO: null,
    bscscanBase: 'https://bscscan.com',
    rpcUrls: [
      'https://bsc-dataseed.binance.org',
      'https://bsc-rpc.publicnode.com',
      'https://bsc-dataseed1.defibit.io'
    ]
  };

  var configPromise = null;

  function loadConfig() {
    if (!configPromise) {
      configPromise = fetch('site-config.json', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (json) {
          var cfg = {};
          Object.keys(FALLBACK_CONFIG).forEach(function (k) { cfg[k] = FALLBACK_CONFIG[k]; });
          if (json) Object.keys(json).forEach(function (k) { cfg[k] = json[k]; });
          return cfg;
        })
        .catch(function () { return FALLBACK_CONFIG; });
    }
    return configPromise;
  }

  function pad32(hexNoPrefix) {
    var s = hexNoPrefix.toLowerCase();
    while (s.length < 64) s = '0' + s;
    return s;
  }

  function encodeUint(n) {
    return pad32(BigInt(n).toString(16));
  }

  function encodeAddress(addr) {
    return pad32(addr.replace(/^0x/i, ''));
  }

  function encodeCall(signature, argsHex) {
    var sel = SELECTORS[signature];
    if (!sel) throw new Error('unknown signature: ' + signature);
    return sel + (argsHex || '');
  }

  var rpcIndex = 0;

  function rpcCall(rpcUrls, method, params) {
    // Try each configured RPC in order until one answers.
    var attempts = rpcUrls.map(function (_, i) { return rpcUrls[(rpcIndex + i) % rpcUrls.length]; });
    var chain = Promise.reject(new Error('start'));
    attempts.forEach(function (url) {
      chain = chain.catch(function () {
        return fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params })
        })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (j.error) {
              var err = new Error(j.error.message || 'RPC error');
              err.rpcError = j.error;
              throw err;
            }
            return j.result;
          });
      });
    });
    return chain;
  }

  function ethCall(cfg, data) {
    if (!cfg.contractAddress) return Promise.reject(new Error('contract not deployed yet'));
    return rpcCall(cfg.rpcUrls, 'eth_call', [{ to: cfg.contractAddress, data: data }, 'latest']);
  }

  function decodeUint(hex) {
    if (!hex || hex === '0x') return null;
    return BigInt(hex.slice(0, 66));
  }

  function decodeBool(hex) {
    var v = decodeUint(hex);
    return v === null ? null : v !== 0n;
  }

  function fmt(n) {
    if (n === null || n === undefined) return '—';
    return Number(n).toLocaleString('en-US');
  }

  function shortAddr(a) {
    if (!a) return '—';
    return a.slice(0, 6) + '…' + a.slice(-4);
  }

  global.AgentPassChain = {
    SELECTORS: SELECTORS,
    loadConfig: loadConfig,
    ethCall: ethCall,
    encodeCall: encodeCall,
    encodeUint: encodeUint,
    encodeAddress: encodeAddress,
    decodeUint: decodeUint,
    decodeBool: decodeBool,
    fmt: fmt,
    shortAddr: shortAddr
  };
})(window);
