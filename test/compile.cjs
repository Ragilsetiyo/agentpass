// Compile the ORIGINAL AgentPass.sol (read from the parent folder, untouched)
// plus the test-only mock, using the exact production settings from
// ../compile.cjs: solc 0.8.26, optimizer enabled, 200 runs.
const solc = require('../node_modules/solc');
const fs = require('fs');
const path = require('path');

const agentPassSrc = fs.readFileSync(path.join(__dirname, '..', 'AgentPass.sol'), 'utf8');
const mockSrc = fs.readFileSync(path.join(__dirname, 'MockAgentID.sol'), 'utf8');

const input = {
  language: 'Solidity',
  sources: {
    'AgentPass.sol': { content: agentPassSrc },
    'MockAgentID.sol': { content: mockSrc },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
  },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errs = (out.errors || []).filter((e) => e.severity === 'error');
const warns = (out.errors || []).filter((e) => e.severity === 'warning');
console.log('errors:', errs.length, 'warnings:', warns.length);
errs.forEach((e) => console.log('ERR', e.formattedMessage));
if (errs.length) process.exit(1);

const ap = out.contracts['AgentPass.sol']['AgentPass'];
const mk = out.contracts['MockAgentID.sol']['MockAgentID'];
console.log('AgentPass runtime bytes:', ap.evm.deployedBytecode.object.length / 2);
console.log('MockAgentID runtime bytes:', mk.evm.deployedBytecode.object.length / 2);

fs.writeFileSync(path.join(__dirname, 'artifacts.json'), JSON.stringify({
  AgentPass: { abi: ap.abi, bytecode: ap.evm.bytecode.object, runtime: ap.evm.deployedBytecode.object },
  MockAgentID: { abi: mk.abi, bytecode: mk.evm.bytecode.object, runtime: mk.evm.deployedBytecode.object },
}, null, 1));
console.log('artifacts.json written');
