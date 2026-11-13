'use strict';
// Hardhat config for the local stand-in chain. The container cannot reach binaries.soliditylang.org, so the
// compile task is pointed at the pinned npm `solc` (solc-js) package instead of downloading a native compiler.
const { subtask } = require('hardhat/config');
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require('hardhat/builtin-tasks/task-names');
const path = require('node:path');

const SOLC_VERSION = require('solc/package.json').version; // 0.8.28

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
  if (args.solcVersion === SOLC_VERSION) {
    return {
      compilerPath: path.dirname(require.resolve('solc/soljson.js')) + '/soljson.js',
      isSolcJs: true,
      version: SOLC_VERSION,
      longVersion: `${SOLC_VERSION} (npm solc-js)`,
    };
  }
  return runSuper();
});

module.exports = {
  solidity: { version: SOLC_VERSION, settings: { optimizer: { enabled: false } } },
  defaultNetwork: 'localhost',
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: process.env.RPC_URL || 'http://127.0.0.1:8545', chainId: 31337 },
  },
  paths: { sources: './contracts', artifacts: './artifacts', cache: './cache' },
};
