// AgentPass full local test suite v2 on anvil (chainId 31337).
// Harness fixes vs v1 (v1 failures were harness artifacts, not contract bugs):
// - Deterministic block time: evm_setNextBlockTimestamp before every
//   time-sensitive step; opening aligned to 12:00 UTC so check-in "days"
//   are unambiguous.
// - Revert expectations probed via staticCall (no nonce consumed, exact
//   revert reason), success txs sent with an explicit fresh nonce.
// Deploys MockAgentID + ORIGINAL AgentPass bytecode (artifacts.json).
// Tester = Ragil's EOA, keystore decrypted in-process only, never printed.
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const RPC = 'http://127.0.0.1:8545';
const BASE_URI = 'https://agentpass.example/pass/';
const artifacts = JSON.parse(fs.readFileSync(path.join(__dirname, 'artifacts.json'), 'utf8'));

const results = [];
function record(id, name, pass, evidence) {
  results.push({ id: String(id), name, pass: !!pass, evidence: String(evidence).slice(0, 300) });
  console.log(`${pass ? 'PASS' : 'FAIL'} #${id} ${name} :: ${String(evidence).slice(0, 130)}`);
}
function errText(e) { return `${e.reason || ''} | ${e.shortMessage || ''} | ${e.message || ''}`.replace(/\s+/g, ' ').slice(0, 260); }
async function expectStaticRevert(id, name, fn, substr) {
  try { await fn(); record(id, name, false, 'DID NOT REVERT'); }
  catch (e) { const t = errText(e); record(id, name, substr ? t.includes(substr) : true, `reverted: ${t.slice(0, 150)}`); }
}

(async () => {
  const provider = new ethers.JsonRpcProvider(RPC);
  const deployer = await provider.getSigner(0);

  const ksJson = fs.readFileSync(path.join(__dirname, '..', '..', 'eoa-wallet', 'keystore.json'), 'utf8');
  const pass = fs.readFileSync(path.join(__dirname, '..', '..', 'eoa-wallet', '.keystore-pass'), 'utf8').trim();
  const eoaWallet = (await ethers.Wallet.fromEncryptedJson(ksJson, pass)).connect(provider);
  const EOA = eoaWallet.address;
  console.log('tester EOA:', EOA);
  await (await deployer.sendTransaction({ to: EOA, value: ethers.parseEther('10') })).wait();

  let eoaNonce = await provider.getTransactionCount(EOA, 'latest');
  async function sendEOA(fn) {
    const tx = await fn({ nonce: eoaNonce });
    const rc = await tx.wait();
    eoaNonce += 1;
    return rc;
  }

  const mockFactory = new ethers.ContractFactory(artifacts.MockAgentID.abi, artifacts.MockAgentID.bytecode, deployer);
  const mock = await mockFactory.deploy(); await mock.waitForDeployment();
  const mockAddr = await mock.getAddress();
  const mockDeployTx = mock.deploymentTransaction().hash;
  console.log('MockAgentID:', mockAddr, 'deploy tx:', mockDeployTx);

  // opening aligned to 12:00 UTC of the day after tomorrow-ish: safely future, mid-day.
  const nowTs = (await provider.getBlock('latest')).timestamp;
  let opening = Math.floor((nowTs + 3600) / 86400) * 86400 + 12 * 3600;
  if (opening < nowTs + 1800) opening += 86400;
  const apFactory = new ethers.ContractFactory(artifacts.AgentPass.abi, artifacts.AgentPass.bytecode, deployer);
  const ap = await apFactory.deploy(mockAddr, opening, 1000, BASE_URI);
  const apRc = await ap.waitForDeployment();
  const apAddr = await ap.getAddress();
  const apDeployReceipt = await provider.getTransactionReceipt(apRc.deploymentTransaction().hash);
  console.log('AgentPass A:', apAddr, 'deploy tx:', apRc.deploymentTransaction().hash, 'gas:', apDeployReceipt.gasUsed.toString(), 'opening:', opening);
  const apE = ap.connect(eoaWallet);

  async function advanceTo(ts) {
    await provider.send('evm_setNextBlockTimestamp', [ts]);
    await provider.send('evm_mine', []);
  }

  // ---------- Phase 0: before opening ----------
  await expectStaticRevert(1, 'quote() before open reverts', () => ap.quote.staticCall(EOA), 'not open yet');
  await expectStaticRevert(2, 'costFor(,1) before open reverts', () => ap.costFor.staticCall(EOA, 1), 'not open yet');
  record(3, 'freeGiven() before open == 0', (await ap.freeGiven()) === 0n, await ap.freeGiven());
  record(4, 'freeRemaining() before open == 1000', (await ap.freeRemaining()) === 1000n, await ap.freeRemaining());
  const ot = await ap.openingTime();
  record(5, 'mintOpen()==false & openingTime() readable before open', (await ap.mintOpen()) === false && ot === BigInt(opening), `openingTime=${ot}`);
  await expectStaticRevert(6, 'mint() before open reverts', () => apE.mint.staticCall(), 'not open yet');

  await advanceTo(opening + 10); // first block past opening; latest block now reads "open"

  // ---------- Phase 1: open, no Agent ID ----------
  record(7, 'quote() after open == 0', (await ap.quote(EOA)) === 0n, await ap.quote(EOA));
  record(8, 'costFor(,1) after open == 0', (await ap.costFor(EOA, 1)) === 0n, await ap.costFor(EOA, 1));
  await expectStaticRevert(9, 'costFor(,2) reverts one-per-agent', () => ap.costFor.staticCall(EOA, 2), 'one per agent');
  await expectStaticRevert(10, 'mint() without Agent ID reverts', () => apE.mint.staticCall(), 'Agent ID required');

  await (await mock.mint(EOA)).wait();
  record('10b', 'mock Agent ID granted to EOA (balanceOf=1)', (await mock.balanceOf(EOA)) === 1n, await mock.balanceOf(EOA));

  await expectStaticRevert(11, 'mint() with value reverts (non-payable)', () => apE.mint.staticCall({ value: ethers.parseEther('0.01') }), '');

  // ---------- Phase 2: mint + passport state (block time opening+20, day D0) ----------
  await provider.send('evm_setNextBlockTimestamp', [opening + 20]);
  const mintRc = await sendEOA((ov) => apE.mint(ov));
  const pm = mintRc.logs.map((l) => { try { return ap.interface.parseLog(l); } catch { return null; } }).filter(Boolean).find((l) => l.name === 'PassportMinted');
  record(12, 'mint() with Agent ID succeeds, tokenId 1, Founder event', !!pm && pm.args.tokenId === 1n && pm.args.founder === true, `tx=${mintRc.hash} founder=${pm && pm.args.founder}`);
  record('12b', 'ownerOf(1)==EOA, balanceOf==1, hasPassport, passportOf==1',
    (await ap.ownerOf(1)) === EOA && (await ap.balanceOf(EOA)) === 1n && (await ap.hasPassport(EOA)) === true && (await ap.passportOf(EOA)) === 1n,
    `owner=${await ap.ownerOf(1)}`);
  record(13, 'freeGiven()==1 & freeRemaining()==999 after first mint',
    (await ap.freeGiven()) === 1n && (await ap.freeRemaining()) === 999n, `given=${await ap.freeGiven()} rem=${await ap.freeRemaining()}`);
  await expectStaticRevert(14, 'double mint reverts', () => apE.mint.staticCall(), 'already has passport');

  // ---------- Check-ins / streak / level (all at 12:00 UTC +20s of each day) ----------
  const ciRc = await sendEOA((ov) => apE.checkIn(ov));
  record(15, 'first checkIn succeeds, streak 1', (await ap.streakOf(1)) === 1n, `tx=${ciRc.hash}`);
  await expectStaticRevert(16, 'second checkIn same day reverts', () => apE.checkIn.staticCall(), 'already checked in today');
  const noPass = await provider.getSigner(5);
  await expectStaticRevert(17, 'checkIn without passport reverts', () => ap.connect(noPass).checkIn.staticCall(), 'no passport');
  await expectStaticRevert(18, 'checkIn with value reverts (non-payable)', () => apE.checkIn.staticCall({ value: ethers.parseEther('0.01') }), '');

  await advanceTo(opening + 86400 + 20);
  await sendEOA((ov) => apE.checkIn(ov));
  record(19, 'next-day checkIn: streak 2', (await ap.streakOf(1)) === 2n, `streak=${await ap.streakOf(1)}`);

  await advanceTo(opening + 3 * 86400 + 20); // skip day 2
  await sendEOA((ov) => apE.checkIn(ov));
  record(20, 'after skipped day: streak resets to 1, bestStreak stays 2',
    (await ap.streakOf(1)) === 1n && (await ap.bestStreakOf(1)) === 2n,
    `streak=${await ap.streakOf(1)} best=${await ap.bestStreakOf(1)}`);

  const levelAt = {};
  let climbErr = '';
  for (let d = 4; d <= 23; d++) {
    await advanceTo(opening + d * 86400 + 20);
    try { await sendEOA((ov) => apE.checkIn(ov)); }
    catch (e) { climbErr = errText(e); break; }
    const s = Number(await ap.streakOf(1));
    if ([3, 7, 14, 21].includes(s)) levelAt[s] = Number(await ap.levelOf(EOA));
  }
  if (climbErr) record('21-24', 'streak climb checkIn', false, climbErr);
  record(21, 'level at best streak 3 == 1', levelAt[3] === 1, `level=${levelAt[3]}`);
  record(22, 'level at best streak 7 == 2', levelAt[7] === 2, `level=${levelAt[7]}`);
  record(23, 'level at best streak 14 == 3', levelAt[14] === 3, `level=${levelAt[14]}`);
  record(24, 'level at best streak 21 == 4', levelAt[21] === 4, `level=${levelAt[21]}`);

  const attr = await ap.attributesOf(1);
  record(25, 'attributesOf(1) consistent (founder, best 21, level 4, 23 check-ins)',
    attr.owner === EOA && attr.founder === true && attr.bestStreak === 21n && attr.level === 4n && attr.checkIns === 23n,
    `checkIns=${attr.checkIns} best=${attr.bestStreak} level=${attr.level}`);
  record(26, 'tokenURI(1) == baseURI+1', (await ap.tokenURI(1)) === BASE_URI + '1', await ap.tokenURI(1));
  record(27, 'supportsInterface ERC721/ERC165', (await ap.supportsInterface('0x80ac58cd')) && (await ap.supportsInterface('0x01ffc9a7')), '');

  // ---------- Soulbound ----------
  const otherSigner = await provider.getSigner(6);
  const other = await otherSigner.getAddress();
  await expectStaticRevert(28, 'transferFrom reverts soulbound', () => apE.transferFrom.staticCall(EOA, other, 1), 'soulbound');
  await expectStaticRevert(29, 'safeTransferFrom(3-arg) reverts soulbound', () => apE['safeTransferFrom(address,address,uint256)'].staticCall(EOA, other, 1), 'soulbound');
  await expectStaticRevert(30, 'safeTransferFrom(4-arg) reverts soulbound', () => apE['safeTransferFrom(address,address,uint256,bytes)'].staticCall(EOA, other, 1, '0x'), 'soulbound');
  await sendEOA((ov) => apE.approve(other, 1, ov));
  record('31b', 'approve() recorded (getApproved == other)', (await ap.getApproved(1)) === other, await ap.getApproved(1));
  await expectStaticRevert(31, 'transfer by approved still reverts soulbound', () => ap.connect(otherSigner).transferFrom.staticCall(EOA, other, 1), 'soulbound');
  await sendEOA((ov) => apE.setApprovalForAll(other, true, ov));
  await expectStaticRevert(32, 'transfer by operator still reverts soulbound', () => ap.connect(otherSigner).transferFrom.staticCall(EOA, other, 1), 'soulbound');

  await expectStaticRevert(36, 'balanceOf(zero address) reverts', () => ap.balanceOf.staticCall(ethers.ZeroAddress), 'zero address');
  await expectStaticRevert(37, 'ownerOf(nonexistent) reverts', () => ap.ownerOf.staticCall(99999), 'no such token');

  // ---------- Phase 3: Founder boundary 1000 / 1001 ----------
  console.log('boundary loop start, totalMinted =', (await ap.totalMinted()).toString());
  let tx1000 = '', tx1001 = '';
  for (let i = 1; i <= 1000; i++) {
    const s = await provider.getSigner(i);
    const a = await s.getAddress();
    await (await mock.mint(a)).wait();
    const r = await (await ap.connect(s).mint()).wait();
    const tid = Number(await ap.passportOf(a));
    if (tid === 1000) tx1000 = r.hash;
    if (tid === 1001) tx1001 = r.hash;
    if (i % 250 === 0) console.log('  boundary progress', i, 'tokenId', tid);
  }
  record(33, 'tokenId 1000 is Founder; freeGiven==1000, freeRemaining==0 at cap',
    (await ap.isFounder(1000)) === true && (await ap.freeGiven()) === 1000n && (await ap.freeRemaining()) === 0n,
    `tx1000=${tx1000}`);
  record(34, 'tokenId 1001 mints, isFounder == false', (await ap.isFounder(1001)) === false && (await ap.totalMinted()) === 1001n, `tx1001=${tx1001}`);
  record(35, 'after Founder quota exhausted: quote/costFor still 0, counters capped',
    (await ap.quote(EOA)) === 0n && (await ap.costFor(EOA, 1)) === 0n && (await ap.freeGiven()) === 1000n && (await ap.freeRemaining()) === 0n && (await ap.mintOpen()) === true,
    `given=${await ap.freeGiven()} rem=${await ap.freeRemaining()}`);

  // ---------- Screening instance S ----------
  const now2 = (await provider.getBlock('latest')).timestamp;
  const apS = await apFactory.deploy(mockAddr, now2 - 10, 1000, BASE_URI);
  await apS.waitForDeployment();
  const apSAddr = await apS.getAddress();
  for (const idx of [1001, 1002]) {
    const s = await provider.getSigner(idx);
    const a = await s.getAddress();
    await (await mock.mint(a)).wait();
    await (await apS.connect(s).mint()).wait();
  }
  console.log('AgentPass S (screening):', apSAddr, 'freeGiven=', (await apS.freeGiven()).toString());

  fs.writeFileSync(path.join(__dirname, 'local-addresses.json'), JSON.stringify({
    rpc: RPC, chainId: 31337, mockAgentId: mockAddr, agentPassA: apAddr, agentPassS: apSAddr,
    deployTxA: apRc.deploymentTransaction().hash, deployGasA: apDeployReceipt.gasUsed.toString(),
    mockDeployTx: mockDeployTx, mintTx1: mintRc.hash, firstCheckInTx: ciRc.hash, boundaryTx1000: tx1000, boundaryTx1001: tx1001,
  }, null, 1));
  fs.writeFileSync(path.join(__dirname, 'local-results.json'), JSON.stringify(results, null, 1));
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== LOCAL SUITE v2: ${passed}/${results.length} passed ===`);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
