'use strict';
// One-command spike runner: npm run spike
// Env: SPIKE_TIMEZONES (default "UTC,America/New_York,Asia/Tokyo"), SPIKE_TESTS (default "1,2,3"), API_PORT.
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { attach, log } = require('./lib/log');
const { startHardhat, startApi, ROOT } = require('./lib/procs');
const { apiClient } = require('./lib/api-client');
const { chainClient } = require('./lib/chain');
const { openBrowser, newVerifier } = require('./lib/browser');
const { Report } = require('./lib/report');
const { environmentReport } = require('./lib/environment');
const { makePool } = require('../db/pool');
const { reset } = require('../db/reset');
const { runTest1 } = require('./test1-consistency');
const { runTest2 } = require('./test2-tamper');
const { runTest3 } = require('./test3-validation');
const accounts = require('../chain/accounts');

const TIMEZONES = (process.env.SPIKE_TIMEZONES || 'UTC,America/New_York,Asia/Tokyo').split(',').map((s) => s.trim()).filter(Boolean);
const TESTS = (process.env.SPIKE_TESTS || '1,2,3').split(',').map((s) => s.trim());
const PORT = Number(process.env.API_PORT || 3000);
const RPC = process.env.RPC_URL || 'http://127.0.0.1:8545';
const BASE = `http://127.0.0.1:${PORT}`;

async function main() {
  const startedAt = new Date();
  const runDir = path.join(ROOT, 'results', startedAt.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19) + 'Z');
  const screenshotsDir = path.join(runDir, 'screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });
  attach(path.join(runDir, 'console.log'));
  log(`TraceChain spike run ${path.basename(runDir)}  timezones=${TIMEZONES.join(',')} tests=${TESTS.join(',')}`);

  const dataset = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'items.json'), 'utf8'));
  const items = dataset.items;
  const report = new Report(runDir, { startedAt: startedAt.toISOString(), timezones: TIMEZONES, tests: TESTS, datasetSeed: dataset.seed, datasetCount: items.length, edgeCases: dataset.edgeCases });
  for (const tz of TIMEZONES) report.mark({ label: `Test 1 consistency (TZ ${tz})`, test: 'T1', group: `consistency-${tz}`, required: 100, kind: 'all' });
  if (TESTS.includes('2')) {
    report.mark({ label: 'Test 2 tamper detected', test: 'T2', group: 'tamper-detected', required: 200, kind: 'all' });
    report.mark({ label: 'Test 2 false alarms', test: 'T2', group: 'no-false-alarms', required: 100, kind: 'zero' });
  }
  if (TESTS.includes('3')) {
    report.mark({ label: 'Test 3 400 group', test: 'T3', group: '400-validation', required: 10, kind: 'all' });
    report.mark({ label: 'Test 3 409 group', test: 'T3', group: '409-duplicate-id', required: 10, kind: 'all' });
  }

  const browser = await openBrowser();
  const pool = makePool();
  pool.on('error', () => {});
  const ctx = { report, runDir, pool, api: apiClient(BASE), chain: chainClient(RPC), hardhat: null, apiProc: null, apiLabelCount: 0 };
  ctx.startApi = async (label) => { ctx.apiProc = await startApi(runDir, { tz: ctx.tz, port: PORT, label: `${label || 'api'}-${++ctx.apiLabelCount}` }); };
  ctx.stopApi = async () => { if (ctx.apiProc) { await ctx.apiProc.stop(); log(`  stopped API pid=${ctx.apiProc.pid}`); ctx.apiProc = null; } };
  ctx.restartApi = async () => { await ctx.stopApi(); await ctx.startApi(`${ctx.tz.replace('/', '-')}-restarted`); };
  ctx.stopHardhat = async () => { if (ctx.hardhat) { await ctx.hardhat.stop(); log(`  stopped hardhat node pid=${ctx.hardhat.pid}`); ctx.hardhat = null; } };
  // Fresh start for a timezone run: stop everything, reset DB (sequence back to 1), fresh chain, deploy, start API with TZ.
  ctx.freshStart = async (tz) => {
    ctx.tz = tz;
    await ctx.stopApi(); await ctx.stopHardhat();
    await reset(); log('  database reset (dropped, recreated, migrated)');
    ctx.hardhat = await startHardhat(runDir);
    const dep = await ctx.chain.deploy(); log(`  deployed TraceChainStub at ${dep.address} (chainId ${dep.chainId})`);
    await ctx.startApi(tz.replace('/', '-'));
  };

  const pgv = (await pool.query('SHOW server_version')).rows[0].server_version;
  fs.writeFileSync(path.join(runDir, 'environment.txt'), environmentReport({ postgresServerVersion: pgv, chromiumVersion: `Chromium ${browser.version()} (Playwright ${require('playwright/package.json').version})`, 'run directory': path.relative(ROOT, runDir) }));
  fs.copyFileSync(path.join(runDir, 'environment.txt'), path.join(ROOT, 'results', 'environment.txt'));

  let registered = null; let verifier = null; let failure = null;
  try {
    if (TESTS.includes('1')) {
      for (const tz of TIMEZONES) {
        await ctx.freshStart(tz);
        if (verifier) await verifier.close();
        verifier = await newVerifier(browser, BASE, { timezoneId: tz });
        registered = await runTest1(ctx, { tz, items, verifier });
        report.write();
      }
    }
    if (TESTS.includes('2')) {
      if (!registered) throw new Error('Test 2 needs Test 1 to have registered the dataset');
      await runTest2(ctx, { registered, verifier, screenshotsDir });
      report.write();
    }
    if (TESTS.includes('3')) {
      if (!registered) throw new Error('Test 3 needs Test 1 to have registered the dataset');
      await runTest3(ctx, { items: registered, verifier, screenshotsDir, producer: accounts.producer1.address, unauthorized: accounts.unauthorized.address });
      report.write();
    }
  } catch (e) {
    failure = e; log(`\nRUN ABORTED: ${e.stack || e.message}`);
    report.notes.push(`Run aborted with error: ${e.message}`);
  } finally {
    if (verifier) await verifier.close();
    await browser.close();
    await ctx.stopApi(); await ctx.stopHardhat();
    await pool.end();
  }
  report.notes.push(`Tests 2 and 3 ran against the state left by the last Test 1 timezone run (${TIMEZONES[TIMEZONES.length - 1]}).`);
  report.notes.push(`Hash cross-check sources per record: (a) POST response, (b) Node recompute from GET, (c) headless Chromium page, (d) on-chain getItem, (e) Node recompute after API restart.`);
  const json = report.write();
  log('\n' + report.consoleTable());
  log(`\nartifacts: ${path.relative(ROOT, runDir)}/ (summary.csv, summary.json, environment.txt, api-*.log, hardhat-node.log, console.log, screenshots/)`);
  updateReadme(report.markdown());
  const allPass = json.marks.every((m) => m.verdict === 'PASS') && !failure;
  log(`\nOVERALL: ${allPass ? 'PASS' : 'FAIL'}`);
  process.exit(allPass ? 0 : 1);
}

function updateReadme(md) {
  const file = path.join(ROOT, 'README.md');
  if (!fs.existsSync(file)) return;
  const s = fs.readFileSync(file, 'utf8');
  const start = '<!-- RESULTS:START -->'; const end = '<!-- RESULTS:END -->';
  if (!s.includes(start) || !s.includes(end)) return;
  const out = s.slice(0, s.indexOf(start) + start.length) + '\n' + md + s.slice(s.indexOf(end));
  fs.writeFileSync(file, out);
}

main().catch((e) => { console.error(e); process.exit(2); });
