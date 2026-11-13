'use strict';
// Captures tool versions and platform facts into a text block for evidence (results/environment.txt).
const { execSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

function tryExec(cmd) {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 20000 }).toString().trim().split('\n')[0]; }
  catch { return '(not available)'; }
}

function pkgVersion(name) {
  try { return require(path.join(process.cwd(), 'node_modules', name, 'package.json')).version; }
  catch { return '(not installed)'; }
}

function environmentReport(extra = {}) {
  const lines = [];
  lines.push(`TraceChain spike environment report`);
  lines.push(`generated: ${new Date().toISOString()}`);
  lines.push(``);
  lines.push(`NOTE: The spike brief assumed a Windows 11 laptop with tools installed via winget. This run executed in a`);
  lines.push(`Linux cloud container (no winget). Git, Node.js LTS, GitHub CLI, native PostgreSQL 16 (not Docker) and`);
  lines.push(`Playwright Chromium were already present, so the install step was replaced by version verification below.`);
  lines.push(``);
  lines.push(`platform:        ${os.platform()} ${os.release()} (${os.arch()})`);
  lines.push(`os:              ${tryExec('cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2') || os.version()}`);
  lines.push(`hostname:        ${os.hostname()}`);
  lines.push(`cpus:            ${os.cpus().length} x ${os.cpus()[0] ? os.cpus()[0].model : '?'}`);
  lines.push(`memory:          ${Math.round(os.totalmem() / 1024 / 1024)} MiB`);
  lines.push(`process TZ:      ${process.env.TZ || '(unset)'}  resolved: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  lines.push(``);
  lines.push(`git:             ${tryExec('git --version')}`);
  lines.push(`node:            ${process.version}`);
  lines.push(`npm:             ${tryExec('npm --version')}`);
  lines.push(`gh:              ${tryExec('gh --version')}`);
  lines.push(`psql:            ${tryExec('psql --version')}`);
  lines.push(`postgres server: ${extra.postgresServerVersion || '(see run log)'}`);
  lines.push(`chromium:        ${extra.chromiumVersion || '(see run log)'}`);
  lines.push(``);
  lines.push(`pinned npm packages (package.json, exact versions):`);
  for (const n of ['express', 'pg', 'ethers', 'dotenv', 'hardhat', 'solc', 'playwright']) {
    lines.push(`  ${n.padEnd(12)} ${pkgVersion(n)}`);
  }
  lines.push(``);
  lines.push(`solidity compiler: solc-js ${pkgVersion('solc')} from npm (binaries.soliditylang.org is blocked by the container proxy,`);
  lines.push(`  so Hardhat is configured to use the npm solc package instead of downloading a native compiler).`);
  for (const [k, v] of Object.entries(extra)) {
    if (k !== 'postgresServerVersion' && k !== 'chromiumVersion') lines.push(`${k}: ${v}`);
  }
  return lines.join('\n') + '\n';
}

module.exports = { environmentReport };

if (require.main === module) {
  process.stdout.write(environmentReport());
}
