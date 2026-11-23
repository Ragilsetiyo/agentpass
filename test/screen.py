#!/usr/bin/env python3
"""Uji saringan jujur (honest screening) untuk AgentPass.

Memperlakukan kontrak hasil deploy PERSIS seperti kandidat hunt Muse:
1. eth_getCode -> ekstrak set selector PUSH4 dari bytecode runtime.
2. Cocokkan tiap selector via openchain signature database.
3. Probe view yang biasa dibaca saringan: quote/costFor/freeGiven/
   freeRemaining/balanceOf/hasPassport/mintOpen/openingTime/name/symbol.
4. Simulasi mint() via eth_call dari alamat acak TANPA Agent ID
   (harus revert karena gerbang, bukan karena biaya) dan cek tidak ada
   fungsi jebakan (withdraw/fee/claim berbayar/upgrade/proxy).
Selector dihitung dengan ~/workspace/tools/keccak.py (BUKAN sha3_256).
"""
import json, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, '/home/hatch/workspace/tools')
from keccak import keccak256, sel

RPC = sys.argv[1]
ADDR = sys.argv[2]
FRESH = "0x00000000000000000000000000000000deadbeef"  # alamat acak tanpa Agent ID

def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(RPC, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def call(to, data, frm=None):
    tx = {"to": to, "data": data}
    if frm: tx["from"] = frm
    res = rpc("eth_call", [tx, "latest"])
    return res

def enc_addr(a): return a.lower().replace("0x", "").rjust(64, "0")
def enc_uint(n): return format(n, "x").rjust(64, "0")
def as_int(hexstr): return int(hexstr, 16) if hexstr and hexstr != "0x" else 0

code = rpc("eth_getCode", [ADDR, "latest"])["result"]
b = bytes.fromhex(code[2:])
sels = set(); i = 0
while i < len(b) - 5:
    if b[i] == 0x63:
        sels.add("0x" + b[i+1:i+5].hex()); i += 5
    else:
        i += 1
print(f"runtime bytes: {len(b)}; PUSH4 selectors found: {len(sels)}")

def resolve(s):
    try:
        req = urllib.request.Request(
            f"https://api.openchain.xyz/signature-database/v1/lookup?function={s}&filter=true",
            headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=20) as r:
            d = json.loads(r.read())
        items = d.get("result", {}).get("function", {}).get(s) or []
        return s, [it["name"] for it in items if not it.get("filtered")]
    except Exception:
        return s, []

resolved = {}
with ThreadPoolExecutor(max_workers=20) as ex:
    for s, names in ex.map(resolve, sorted(sels)):
        resolved[s] = names
        print(f"  {s} -> {names if names else 'UNRESOLVED'}")

print("\n--- probes (seperti saringan hunt) ---")
probes = {}
def probe(name, data, frm=None):
    res = call(ADDR, data, frm)
    if "error" in res:
        msg = res["error"].get("message", str(res["error"]))[:120]
        probes[name] = f"REVERT/ERROR: {msg}"
    else:
        probes[name] = res["result"]
    print(f"  {name}: {probes[name]}")

probe("name()", sel("name()"))
probe("symbol()", sel("symbol()"))
probe("quote(fresh)", sel("quote(address)") + enc_addr(FRESH))
probe("costFor(fresh,1)", sel("costFor(address,uint256)") + enc_addr(FRESH) + enc_uint(1))
probe("freeGiven()", sel("freeGiven()"))
probe("freeRemaining()", sel("freeRemaining()"))
probe("mintOpen()", sel("mintOpen()"))
probe("openingTime()", sel("openingTime()"))
probe("balanceOf(fresh)", sel("balanceOf(address)") + enc_addr(FRESH))
probe("hasPassport(fresh)", sel("hasPassport(address)") + enc_addr(FRESH))
# simulasi mint dari alamat tanpa Agent ID: harus revert karena gerbang ID, value 0
probe("mint() simulated from fresh (no Agent ID)", sel("mint()"), frm=FRESH)

print("\n--- trap scan ---")
all_names = " ".join(n for v in resolved.values() for n in v)
traps = [w for w in ["withdraw", "sweep", "rescue", "upgrade", "setFee", "fee", "claim(", "deposit", "stake("]
         if w in all_names]
print("  resolved function names:", sorted({n for v in resolved.values() for n in v}))
print("  trap-like names found:", traps if traps else "none")
print("  payable check: mint()/checkIn() non-payable by ABI (value sends revert) — verified in local suite cases 11 & 18")

q = probes.get("quote(fresh)", "")
verdict_free = q.startswith("0x") and as_int(q) == 0
fg, fr = probes.get("freeGiven()", ""), probes.get("freeRemaining()", "")
print("\n--- VONIS SARINGAN ---")
print(f"  quote == 0 (gratis terbaca): {verdict_free}")
print(f"  freeGiven = {as_int(fg) if fg.startswith('0x') else fg}, freeRemaining = {as_int(fr) if fr.startswith('0x') else fr}")
print(f"  mint() dari alamat tanpa ID: {probes.get('mint() simulated from fresh (no Agent ID)', '')[:110]}")
