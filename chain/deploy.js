'use strict';
// Deploys TraceChainStub to the running local Hardhat node with ethers, authorizes producer1 and producer2,
// and writes chain/deployment.json (address + ABI) for the API's /config endpoint and the test harness.
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { ethers } = require('ethers');
const accounts = require('./accounts');

async function deploy(rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545') {
  const artifact = require('../artifacts/contracts/TraceChainStub.sol/TraceChainStub.json');
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const admin = new ethers.Wallet(accounts.admin.key, provider);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, admin);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  for (const p of [accounts.producer1, accounts.producer2]) {
    await (await contract.setAuthorized(p.address, true)).wait();
  }
  const net = await provider.getNetwork();
  const out = { address, chainId: Number(net.chainId), abi: artifact.abi, deployedAt: new Date().toISOString(), note: 'STUB contract for the hash-consistency spike; not the real TraceChain contract.' };
  fs.writeFileSync(path.join(__dirname, 'deployment.json'), JSON.stringify(out, null, 2) + '\n');
  return out;
}

module.exports = { deploy };

if (require.main === module) {
  deploy().then((d) => console.log(`deployed TraceChainStub at ${d.address} (chainId ${d.chainId})`))
    .catch((e) => { console.error('deploy failed:', e.message); process.exit(1); });
}
