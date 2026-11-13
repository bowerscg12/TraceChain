'use strict';
// Test 1 — Consistency. Pass = 100 of 100 per timezone.
// For each record: (a) POST hash == (b) Node recompute from GET == (c) browser hash == (d) on-chain hash == (e) Node recompute
// after a full API restart; and the page must show "Verified".
const { log } = require('./lib/log');
const { detailsHashOf, normalizeRecord, HASHED_FIELDS } = require('../src/hash');

const BODY = (it) => ({ brand: it.brand, styleCode: it.styleCode, colorway: it.colorway, size: it.size, manufacturer: it.manufacturer,
  countryOfManufacture: it.countryOfManufacture, productionBatch: it.productionBatch, productionDate: it.productionDate });

async function registerAll(ctx, items) {
  // Plays the producer frontend (Interface 1): POST -> register tx -> PATCH confirm (or DELETE on failure).
  const registered = [];
  for (const it of items) {
    const post = await ctx.api.post(BODY(it), it.producer);
    ctx.report.time('POST /items (ms)', post.ms);
    if (post.status !== 201) throw new Error(`POST failed for seq ${it.seq}: ${post.status} ${JSON.stringify(post.json)}`);
    const { itemId, detailsHash } = post.json;
    const tx = await ctx.chain.register(it.producer, itemId, detailsHash);
    if (!tx.ok) {
      await ctx.api.del(itemId, it.producer);
      throw new Error(`on-chain register failed for ${itemId}: ${tx.error}`);
    }
    const c = await ctx.api.confirm(itemId, it.producer);
    if (c.status !== 200) throw new Error(`PATCH confirm failed for ${itemId}: ${c.status}`);
    registered.push({ ...it, itemId, postHash: detailsHash });
  }
  return registered;
}

async function runTest1(ctx, { tz, items, verifier }) {
  const group = `consistency-${tz}`;
  log(`\n== Test 1 — Consistency, API TZ=${tz}, browser timezoneId=${tz} (browser reports ${await verifier.browserTimezone()})`);
  const registered = await registerAll(ctx, items);
  log(`  registered ${registered.length} records through POST -> chain -> PATCH confirm`);

  const perRecord = [];
  for (const r of registered) {
    const got = await ctx.api.get(r.itemId);
    ctx.report.time('GET /items/:id (ms)', got.ms);
    const b = got.status === 200 ? detailsHashOf(got.json) : null;
    const page = await verifier.verify(r.itemId);
    if (page.verifyMs) ctx.report.time(`page verify (ms, ${tz})`, page.verifyMs);
    const chain = await ctx.chain.read(r.itemId);
    perRecord.push({ r, got, b, page, chain });

    // FR-02: stored values equal the normalized input exactly (uncounted, informational for the pass mark but recorded).
    const expected = normalizeRecord({ ...r, itemId: r.itemId, registeredBy: r.producer }).record;
    const diffs = HASHED_FIELDS.filter((f) => got.json && got.json[f] !== expected[f]);
    ctx.report.add({ test: 'T1', group: `stored-as-entered-${tz}`, caseId: r.itemId, counted: false,
      expected: 'GET returns normalized input byte-for-byte', actual: diffs.length ? `differs in ${diffs.join(',')}` : 'identical', pass: diffs.length === 0 });
  }

  // (e): fully stop and restart the API process, then recompute from GET again.
  log('  restarting API process for check (e)');
  await ctx.restartApi();
  for (const p of perRecord) {
    const again = await ctx.api.get(p.r.itemId);
    p.e = again.status === 200 ? detailsHashOf(again.json) : null;
    const hashes = { a: p.r.postHash, b: p.b, c: p.page.computedHash, d: p.chain.detailsHash, e: p.e };
    const allEqual = Object.values(hashes).every((h) => h && h === hashes.a);
    const pass = allEqual && p.page.status === 'Verified';
    const mism = Object.entries(hashes).filter(([, h]) => h !== hashes.a).map(([k]) => k);
    ctx.report.add({ test: 'T1', group, caseId: p.r.itemId, expected: 'a=b=c=d=e and page "Verified"',
      actual: `${allEqual ? 'all equal' : 'mismatch in ' + mism.join(',')}; page "${p.page.status}"`, pass,
      note: p.r.edgeCase ? `edge case: ${p.r.edgeCase}` : '', detail: { hashes, pageError: p.page.error } });
    if (!pass) log(`  FAIL ${p.r.itemId} ${JSON.stringify(hashes)} page=${p.page.status} ${p.page.error}`);
  }
  const t = ctx.report.tally('T1', group);
  log(`  Test 1 (${tz}): ${t.passed} of ${t.total} records consistent`);
  return registered;
}

module.exports = { runTest1, registerAll, BODY };
