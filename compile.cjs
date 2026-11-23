const solc = require('solc');
const fs = require('fs');
const src = fs.readFileSync('AgentPass.sol','utf8');
const input = { language:'Solidity', sources:{ 'AgentPass.sol':{ content: src } },
  settings:{ optimizer:{ enabled:true, runs:200 }, outputSelection:{ '*':{ '*':['abi','evm.bytecode.object','evm.deployedBytecode.object'] } } } };
const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errs = (out.errors||[]).filter(e=>e.severity==='error');
const warns = (out.errors||[]).filter(e=>e.severity==='warning');
console.log('errors:', errs.length, 'warnings:', warns.length);
errs.forEach(e=>console.log('ERR', e.formattedMessage));
warns.forEach(e=>console.log('WARN', e.formattedMessage.split('\n')[0]));
if (!errs.length) {
  const c = out.contracts['AgentPass.sol']['AgentPass'];
  const dep = c.evm.bytecode.object, run = c.evm.deployedBytecode.object;
  console.log('creation bytes:', dep.length/2, 'runtime bytes:', run.length/2);
  const gas = 21000 + 32000 + 200*(run.length/2) + 4*(dep.length/2);
  console.log('rough deploy gas est:', gas, '=> BNB @0.07gwei:', (gas*0.07e-9).toFixed(6), '| @0.5gwei:', (gas*0.5e-9).toFixed(6));
  fs.writeFileSync('AgentPass.abi.json', JSON.stringify(c.abi,null,1));
}
