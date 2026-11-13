'use strict';
// Quick self-test of src/hash.js against the spec. Run: npm run hash:selftest
const assert = require('node:assert/strict');
const h = require('./hash');

const vector = {
  itemId: 'TC-2026-000001', brand: 'Nike', styleCode: 'DD1391-100', colorway: 'White/Black', size: '10.5',
  manufacturer: 'Pou Chen Corp.', countryOfManufacture: 'Vietnam', productionBatch: 'PB-2026-07-A',
  productionDate: '2026-07-14', registeredBy: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
};
const n = h.normalizeRecord(vector);
assert.equal(n.ok, true);
assert.equal(n.record.registeredBy, '0x70997970c51812dc3a010c7d01b50e0d17dc79c8');
const ser = h.serialize(n.record);
assert.equal(ser, '["TC-2026-000001","Nike","DD1391-100","White/Black","10.5","Pou Chen Corp.","Vietnam","PB-2026-07-A","2026-07-14","0x70997970c51812dc3a010c7d01b50e0d17dc79c8"]');
const hash = h.detailsHashOf(n.record);
assert.match(hash, /^0x[0-9a-f]{64}$/);
console.log('vector hash', hash);
// Pinned on first run; both implementations must keep producing this.
const PINNED = require('./hash.vector.json').detailsHash;
assert.equal(hash, PINNED, 'pinned test vector changed!');

// NFC: composed vs decomposed must hash identically after normalization
const a = h.normalizeRecord({ ...vector, colorway: 'Café Noir' }).record;
const b = h.normalizeRecord({ ...vector, colorway: 'Café Noir' }).record;
assert.equal(h.detailsHashOf(a), h.detailsHashOf(b));
// trim
assert.equal(h.normalizeRecord({ ...vector, brand: '  Nike  ' }).record.brand, 'Nike');
// case preserved
assert.equal(h.normalizeRecord({ ...vector, brand: 'nIKE' }).record.brand, 'nIKE');
// size stays string
assert.equal(h.normalizeRecord({ ...vector, size: '09' }).record.size, '09');
assert.equal(h.normalizeRecord({ ...vector, size: 10.5 }).ok, false);
// dates
for (const bad of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '07/14/2026', '2026-07-14T00:00:00Z', '2026-7-14', '']) {
  const r = h.normalizeRecord({ ...vector, productionDate: bad });
  assert.equal(r.ok, false, `date should be rejected: ${bad}`); assert.equal(r.field, 'productionDate');
}
for (const good of ['2024-02-29', '2026-12-31', '2026-01-01', '2000-02-29']) {
  assert.equal(h.normalizeRecord({ ...vector, productionDate: good }).ok, true, `date should be accepted: ${good}`);
}
// address
assert.equal(h.normalizeRecord({ ...vector, registeredBy: '0x123' }).ok, false);
assert.equal(h.normalizeRecord({ ...vector, registeredBy: '70997970C51812dc3A010C7d01b50e0d17dc79C8' }).ok, false);
// missing / empty
assert.deepEqual(h.normalizeRecord({ ...vector, brand: undefined }).field, 'brand');
assert.deepEqual(h.normalizeRecord({ ...vector, brand: '   ' }).field, 'brand');
// escaping
const q = h.normalizeRecord({ ...vector, colorway: 'Say "hi" \\ back' }).record;
assert.ok(h.serialize(q).includes('Say \\"hi\\" \\\\ back'));
console.log('hash self-test: all assertions passed');
