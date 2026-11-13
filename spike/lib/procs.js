'use strict';
// Starts/stops the Hardhat node and the API as real child processes (so "restart the API" and "stop the RPC" are real).
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { log } = require('./log');

const ROOT = path.join(__dirname, '..', '..');

function startProcess({ name, args, env, readyRegex, logFile, timeoutMs = 60000 }) {
  return new Promise((resolve, reject) => {
    const out = logFile ? fs.createWriteStream(logFile, { flags: 'a' }) : null;
    const proc = spawn(process.execPath, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let ready = false; let buf = '';
    const onData = (chunk) => {
      const s = chunk.toString(); if (out) out.write(s);
      if (!ready) { buf += s; if (readyRegex.test(buf)) { ready = true; clearTimeout(timer); resolve(handle); } }
    };
    proc.stdout.on('data', onData); proc.stderr.on('data', onData);
    const timer = setTimeout(() => { if (!ready) { proc.kill('SIGKILL'); reject(new Error(`${name} did not become ready in ${timeoutMs}ms\n${buf}`)); } }, timeoutMs);
    const exited = new Promise((res) => proc.on('exit', (code, sig) => { if (out) out.end(); res({ code, sig }); }));
    proc.on('exit', (code) => { if (!ready) { clearTimeout(timer); reject(new Error(`${name} exited early (code ${code})\n${buf}`)); } });
    const handle = {
      name, proc, pid: proc.pid,
      async stop() {
        if (proc.exitCode !== null || proc.signalCode !== null) return;
        proc.kill('SIGTERM');
        const t = setTimeout(() => proc.kill('SIGKILL'), 5000);
        await exited; clearTimeout(t);
      },
    };
  });
}

async function startHardhat(runDir) {
  const cli = require.resolve('hardhat/internal/cli/cli.js');
  const h = await startProcess({ name: 'hardhat node', args: [cli, 'node', '--hostname', '127.0.0.1', '--port', '8545'],
    readyRegex: /Started HTTP and WebSocket JSON-RPC server/, logFile: path.join(runDir, 'hardhat-node.log') });
  log(`  started hardhat node pid=${h.pid}`);
  return h;
}

async function startApi(runDir, { tz, port, label }) {
  const logFile = path.join(runDir, `api-${label}.log`);
  const env = { TZ: tz, API_PORT: String(port), API_LOG_FILE: logFile, API_QUIET: '1' };
  const h = await startProcess({ name: 'API', args: [path.join(ROOT, 'src', 'server.js')], env, readyRegex: /API listening/, logFile: path.join(runDir, `api-${label}.stdout.log`) });
  log(`  started API pid=${h.pid} TZ=${tz} log=${path.relative(ROOT, logFile)}`);
  h.tz = tz; h.logFile = logFile;
  return h;
}

module.exports = { startHardhat, startApi, ROOT };
