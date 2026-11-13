'use strict';
// Test 3 — Validation and API behavior. 400 group (10) and 409 group (10): pass = 10 of 10 each. Plus uncounted checks.
const path = require('node:path');
const { log } = require('./lib/log');
const { BODY } = require('./test1-consistency');

async function runTest3(ctx, { items, verifier, screenshotsDir, producer, unauthorized }) {
  log('\n== Test 3 — Validation and API behavior');
  const good = BODY(items[0]);
  const pool = ctx.pool;
  const rowCount = async () => Number((await pool.query('SELECT count(*) FROM item_details')).rows[0].count);

  // 400 group: each of the 8 body fields missing, plus an invalid calendar date, plus a whitespace-only field.
  const cases400 = Object.keys(good).map((f) => { const b = { ...good }; delete b[f]; return { id: `missing ${f}`, body: b, field: f }; });
  cases400.push({ id: 'invalid calendar date 2026-02-30', body: { ...good, productionDate: '2026-02-30' }, field: 'productionDate' });
  cases400.push({ id: 'whitespace-only colorway', body: { ...good, colorway: '   ' }, field: 'colorway' });
  for (const c of cases400) {
    const before = await rowCount();
    const res = await ctx.api.post(c.body, producer);
    const after = await rowCount();
    const pass = res.status === 400 && res.json && res.json.field === c.field && after === before;
    ctx.report.add({ test: 'T3', group: '400-validation', caseId: c.id, expected: `400 naming field "${c.field}", nothing written`,
      actual: `${res.status} field="${res.json && res.json.field}" rows ${before}->${after}`, pass, detail: res.json });
    if (!pass) log(`  FAIL 400 case ${c.id}: ${res.status} ${JSON.stringify(res.json)}`);
  }
  log(`  400 group: ${ctx.report.tally('T3', '400-validation').passed} of 10`);

  // 409 group: pre-insert a row with the NEXT sequence id directly (without consuming the sequence), then POST.
  for (let i = 1; i <= 10; i++) {
    const { rows } = await pool.query('SELECT last_value, is_called FROM item_seq');
    const next = Number(rows[0].last_value) + (rows[0].is_called ? 1 : 0);
    const id = `TC-${new Date().getUTCFullYear()}-${String(next).padStart(6, '0')}`;
    await pool.query(`INSERT INTO item_details (item_id, brand, style_code, colorway, size, manufacturer, country_of_manufacture, production_batch, production_date, registered_by, status)
      VALUES ($1, 'PRE-INSERTED', 'COLLISION', 'collision test', '1', 'n/a', 'n/a', 'n/a', '2026-01-01', $2, 'confirmed')`, [id, producer.toLowerCase()]);
    const before = await rowCount();
    const res = await ctx.api.post(good, producer);
    const after = await rowCount();
    const row = (await pool.query('SELECT brand FROM item_details WHERE item_id = $1', [id])).rows[0];
    const pass = res.status === 409 && res.json && res.json.error === 'This item ID is already registered.' && after === before && row && row.brand === 'PRE-INSERTED';
    ctx.report.add({ test: 'T3', group: '409-duplicate-id', caseId: `collision ${i} on ${id}`, expected: '409 "This item ID is already registered.", nothing written',
      actual: `${res.status} ${res.json && res.json.error} rows ${before}->${after}, pre-inserted row intact=${row && row.brand === 'PRE-INSERTED'}`, pass, detail: res.json });
    if (!pass) log(`  FAIL 409 case ${i}: ${res.status} ${JSON.stringify(res.json)}`);
    await pool.query('DELETE FROM item_details WHERE item_id = $1', [id]); // clean up the planted row
  }
  log(`  409 group: ${ctx.report.tally('T3', '409-duplicate-id').passed} of 10`);

  // ---- Uncounted checks ----
  const add = (caseId, expected, actual, pass, detail) => { ctx.report.add({ test: 'T3', group: 'other', caseId, counted: false, expected, actual, pass, detail }); if (!pass) log(`  FAIL ${caseId}: ${actual}`); };

  let r = await ctx.api.post(good, undefined);
  add('401 missing X-Producer-Address', '401', String(r.status), r.status === 401, r.json);
  r = await ctx.api.post(good, unauthorized);
  add('401 address not on allowlist', '401', String(r.status), r.status === 401, r.json);
  r = await ctx.api.get('TC-2026-999999');
  add('404 unknown item ID', '404', String(r.status), r.status === 404, r.json);

  // Failed on-chain register (unauthorized wallet) -> DELETE removes the pending record.
  r = await ctx.api.post(good, producer);
  const pendingId = r.json.itemId;
  const tx = await ctx.chain.register(unauthorized, pendingId, r.json.detailsHash);
  add('contract rejects register() from unauthorized wallet', 'revert', tx.ok ? 'tx succeeded' : `revert (${tx.error})`, !tx.ok, tx.error);
  const del = await ctx.api.del(pendingId, producer);
  const gone = await ctx.api.get(pendingId);
  add('failed on-chain register -> DELETE removes pending record', '204 then GET 404', `${del.status} then GET ${gone.status}`, del.status === 204 && gone.status === 404);

  // DELETE on a confirmed record is rejected (FR-07).
  const confirmedId = items[0].itemId;
  r = await ctx.api.del(confirmedId, producer);
  add('DELETE on confirmed record rejected', '409', String(r.status), r.status === 409, r.json);

  // Contract rejects a duplicate register.
  const dup = await ctx.chain.register(producer, confirmedId, '0x' + '11'.repeat(32));
  add('contract rejects duplicate register()', 'revert', dup.ok ? 'tx succeeded' : `revert (${dup.error})`, !dup.ok, dup.error);

  // Page shows "Pending confirmation" for a pending record (POST without on-chain register / confirm).
  r = await ctx.api.post(BODY(items[1]), producer);
  const pend = await verifier.verify(r.json.itemId, { screenshot: path.join(screenshotsDir, 'pending-confirmation.png') });
  add('page shows "Pending confirmation" for pending record', 'Pending confirmation', pend.status, pend.status === 'Pending confirmation');
  await ctx.api.del(r.json.itemId, producer);

  // Page shows "Can't verify" when the API is stopped (open page, stop API process for real, click "Check again").
  await verifier.verify(confirmedId);
  await ctx.stopApi();
  const noApi = await verifier.recheck({ screenshot: path.join(screenshotsDir, 'cant-verify-api-stopped.png') });
  add('page shows "Can\'t verify" when API is stopped', "Can't verify right now, try again later.", noApi.status, noApi.status === "Can't verify right now, try again later.", noApi.error);
  await ctx.startApi('after-api-stop-check');
  const back = await verifier.verify(confirmedId, { screenshot: path.join(screenshotsDir, 'verified.png') });
  add('page back to "Verified" after API restart', 'Verified', back.status, back.status === 'Verified');

  // Page shows "Can't verify" when the RPC is stopped. Done LAST: stopping the Hardhat node discards chain state.
  await ctx.stopHardhat();
  const noRpc = await verifier.verify(confirmedId, { screenshot: path.join(screenshotsDir, 'cant-verify-rpc-stopped.png') });
  add('page shows "Can\'t verify" when RPC is stopped', "Can't verify right now, try again later.", noRpc.status, noRpc.status === "Can't verify right now, try again later.", noRpc.error);
}

module.exports = { runTest3 };
