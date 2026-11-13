'use strict';
// Test 2 — Tamper detection. 20 confirmed records x 9 non-key hashed fields, edited directly in PostgreSQL (bypassing the API),
// restored between edits (180 cases) + 20 swap cases. Pass = 200 of 200 "Not verified" and 0 false alarms on untouched records.
const path = require('node:path');
const { log } = require('./lib/log');
const { COLS } = require('../src/repo');
const { normalizeRecord, detailsHashOf } = require('../src/hash');

const FIELDS = ['brand', 'styleCode', 'colorway', 'size', 'manufacturer', 'countryOfManufacture', 'productionBatch', 'productionDate', 'registeredBy'];
const TEXT_KINDS = ['change one character', 'change letter case', 'append one character'];

function shiftDate(s, days) {
  const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function mutate(field, value, i) {
  if (field === 'productionDate') { const days = i % 2 === 0 ? 1 : -1; return { kind: `move date ${days > 0 ? '+' : '-'}1 day`, value: shiftDate(value, days) }; }
  if (field === 'registeredBy') {
    const idx = 2 + (i % 40); const digit = parseInt(value[idx], 16); const nd = ((digit + 1) % 16).toString(16);
    return { kind: `change one hex digit (pos ${idx})`, value: value.slice(0, idx) + nd + value.slice(idx + 1) };
  }
  let kind = TEXT_KINDS[i % TEXT_KINDS.length];
  if (kind === 'change letter case') {
    const j = [...value].findIndex((ch) => ch.toLowerCase() !== ch.toUpperCase());
    if (j >= 0) {
      const ch = value[j]; const sw = ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
      return { kind, value: value.slice(0, j) + sw + value.slice(j + 1) };
    }
    kind = 'change one character'; // no letters to case-swap (e.g. size "10.5")
  }
  if (kind === 'append one character') return { kind, value: value + '1' };
  const j = Math.floor(value.length / 2); const ch = value[j] === 'X' ? 'Y' : 'X';
  return { kind, value: value.slice(0, j) + ch + value.slice(j + 1) };
}

async function sweepUntouched(ctx, verifier, items, group, label) {
  let falseAlarms = 0;
  for (const r of items) {
    const page = await verifier.verify(r.itemId);
    const pass = page.status === 'Verified';
    if (!pass) falseAlarms++;
    ctx.report.add({ test: 'T2', group, caseId: r.itemId, expected: 'Verified', actual: page.status, pass, note: label });
  }
  return falseAlarms;
}

async function runTest2(ctx, { registered, verifier, screenshotsDir }) {
  log('\n== Test 2 — Tamper detection (direct SQL UPDATE, bypassing the API)');
  const targets = registered.filter((r) => r.seq % 5 === 0); // 20 records: seq 5,10,...,100 (includes 4 edge cases)
  if (targets.length !== 20) throw new Error(`expected 20 targets, got ${targets.length}`);
  const pool = ctx.pool;
  const current = async (id) => (await pool.query('SELECT * FROM item_details WHERE item_id = $1', [id])).rows[0];
  let caseNo = 0; let shot = false;

  // 180 single-field substantive edits
  for (let ri = 0; ri < targets.length; ri++) {
    const r = targets[ri];
    const original = await current(r.itemId);
    for (let fi = 0; fi < FIELDS.length; fi++) {
      const field = FIELDS[fi]; const col = COLS[field];
      const before = original[col];
      const m = mutate(field, before, ri + fi);
      if (m.value === before) throw new Error(`mutation produced identical value for ${r.itemId}.${field}`);
      await pool.query(`UPDATE item_details SET ${col} = $1 WHERE item_id = $2`, [m.value, r.itemId]);
      const page = await verifier.verify(r.itemId, { screenshot: !shot && screenshotsDir ? path.join(screenshotsDir, 'not-verified-tampered.png') : undefined });
      shot = true;
      await pool.query(`UPDATE item_details SET ${col} = $1 WHERE item_id = $2`, [before, r.itemId]);
      const restored = (await current(r.itemId))[col];
      if (restored !== before) throw new Error(`restore failed for ${r.itemId}.${field}`);
      const pass = page.status === 'Not verified';
      caseNo++;
      ctx.report.add({ test: 'T2', group: 'tamper-detected', caseId: `${r.itemId}.${field}`, expected: 'Not verified', actual: page.status, pass,
        note: m.kind, detail: { before, after: m.value, browserHash: page.computedHash, onchainHash: page.onchainHash } });
      if (!pass) log(`  FAIL ${r.itemId}.${field} (${m.kind}): page=${page.status}`);
    }
  }
  log(`  ${caseNo} single-field edits done`);

  // 20 swap cases: copy another item's 9 fields into the row, keep the itemId
  for (let ri = 0; ri < targets.length; ri++) {
    const r = targets[ri]; const other = targets[(ri + 1) % targets.length];
    const original = await current(r.itemId);
    const setCols = FIELDS.map((f) => COLS[f]);
    await pool.query(`UPDATE item_details t SET ${setCols.map((c) => `${c} = o.${c}`).join(', ')} FROM item_details o WHERE o.item_id = $1 AND t.item_id = $2`, [other.itemId, r.itemId]);
    const page = await verifier.verify(r.itemId);
    await pool.query(`UPDATE item_details SET ${setCols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE item_id = $${setCols.length + 1}`, [...setCols.map((c) => original[c]), r.itemId]);
    const pass = page.status === 'Not verified';
    ctx.report.add({ test: 'T2', group: 'tamper-detected', caseId: `${r.itemId}.swap`, expected: 'Not verified', actual: page.status, pass,
      note: `details of ${other.itemId} copied into ${r.itemId}`, detail: { browserHash: page.computedHash, onchainHash: page.onchainHash } });
    if (!pass) log(`  FAIL swap ${r.itemId}: page=${page.status}`);
  }
  const td = ctx.report.tally('T2', 'tamper-detected');
  log(`  tamper cases detected: ${td.passed} of ${td.total}`);

  // Whitespace-only edits: informational, not counted.
  log('  whitespace-only edits (informational)');
  const wsCases = [['brand', (v) => v + ' '], ['colorway', (v) => ' ' + v], ['manufacturer', (v) => v + '\t'], ['styleCode', (v) => '  ' + v + '  '], ['countryOfManufacture', (v) => v + '\n']];
  for (let i = 0; i < wsCases.length; i++) {
    const r = targets[i]; const [field, fn] = wsCases[i]; const col = COLS[field];
    const original = await current(r.itemId); const before = original[col]; const after = fn(before);
    await pool.query(`UPDATE item_details SET ${col} = $1 WHERE item_id = $2`, [after, r.itemId]);
    const page = await verifier.verify(r.itemId);
    await pool.query(`UPDATE item_details SET ${col} = $1 WHERE item_id = $2`, [before, r.itemId]);
    // Same whitespace variant pushed through the API's normalizer: hash is unchanged (absorbed by design).
    const stored = await ctx.api.get(r.itemId);
    const viaNormalizer = detailsHashOf(normalizeRecord({ ...stored.json, [field]: after }).record);
    const absorbed = viaNormalizer === detailsHashOf(stored.json);
    ctx.report.add({ test: 'T2', group: 'whitespace-informational', caseId: `${r.itemId}.${field}`, counted: false,
      expected: 'informational (not judged)', pass: absorbed,
      actual: `via API normalization: ${absorbed ? 'absorbed by normalization (by design), hash unchanged' : 'HASH CHANGED'}; written directly to the DB: page "${page.status}"`,
      note: 'whitespace-only edit', detail: { before: JSON.stringify(before), after: JSON.stringify(after) } });
  }

  // 0 false alarms: every record untouched by the above (restored) must still verify.
  log('  sweeping all 100 records for false alarms');
  const fa = await sweepUntouched(ctx, verifier, registered, 'no-false-alarms', 'after all tamper edits were restored');
  log(`  false alarms: ${fa} of ${registered.length}`);
}

module.exports = { runTest2, FIELDS };
