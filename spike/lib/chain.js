'use strict';
// Plays the producer frontend's on-chain half of Interface 1: sends register() with the producer's wallet, reads records back.
const { ethers } = require('ethers');
const accounts = require('../../chain/accounts');
const { deploy } = require('../../chain/deploy');

function chainClient(rpcUrl) {
  const provider = new ethers.JsonRpcProvider(rpcUrl, 31337, { staticNetwork: true });
  provider.pollingInterval = 100; // default 4000 ms made each tx.wait() take ~4 s on an instant-mining local node
  let deployment = null;
  const wallets = new Map();
  for (const a of Object.values(accounts)) wallets.set(a.address.toLowerCase(), new ethers.Wallet(a.key, provider));
  const contractFor = (addr) => new ethers.Contract(deployment.address, deployment.abi, wallets.get(addr.toLowerCase()));
  return {
    provider, accounts,
    async deploy() { deployment = await deploy(rpcUrl); return deployment; },
    get deployment() { return deployment; },
    /** Returns { ok: true, receipt } or { ok: false, error }. Never throws. */
    async register(producerAddress, itemId, detailsHash) {
      try {
        const tx = await contractFor(producerAddress).register(ethers.encodeBytes32String(itemId), detailsHash);
        const receipt = await tx.wait();
        return { ok: receipt.status === 1, receipt };
      } catch (e) {
        // ethers 6.13 reports Hardhat custom-error reverts as "unknown custom error"; decode the selector ourselves.
        let error = e.shortMessage || e.message;
        try { const parsed = new ethers.Interface(deployment.abi).parseError(e.data); if (parsed) error = `reverted with ${parsed.signature}`; } catch { /* keep generic message */ }
        return { ok: false, error, code: e.code };
      }
    },
    async read(itemId) {
      const c = new ethers.Contract(deployment.address, deployment.abi, provider);
      const r = await c.getItem(ethers.encodeBytes32String(itemId));
      return { detailsHash: r[0], producer: r[1], registeredAt: Number(r[2]), currentOwner: r[3], exists: r[4] };
    },
  };
}

module.exports = { chainClient };
