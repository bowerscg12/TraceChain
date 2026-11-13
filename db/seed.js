'use strict';
// Inserts a few sample rows directly (status 'pending') for manual API exploration. The spike runner does NOT use
// this: it registers data/items.json through the real POST -> chain -> PATCH flow. Run: npm run db:seed
const { makePool } = require('./pool');
const { normalizeRecord, HASHED_FIELDS } = require('../src/hash');
const { nextItemId, insertItem } = require('../src/repo');

const SAMPLES = [
  { brand: 'Nike', styleCode: 'DD1391-100', colorway: 'White/Black', size: '10.5', manufacturer: 'Pou Chen Corp.', countryOfManufacture: 'Vietnam', productionBatch: 'PB-2026-07-A', productionDate: '2026-07-14' },
  { brand: 'adidas', styleCode: 'GX6316', colorway: 'Core Black/Cloud White', size: '9', manufacturer: 'Feng Tay Enterprises', countryOfManufacture: 'Indonesia', productionBatch: 'FT-26-031', productionDate: '2026-03-02' },
  { brand: 'New Balance', styleCode: 'M990GL6', colorway: 'Grey', size: '11', manufacturer: 'New Balance Skowhegan', countryOfManufacture: 'United States', productionBatch: 'SK-0611', productionDate: '2026-06-11' },
];

async function seed(pool) {
  const registeredBy = (process.env.PRODUCER_ALLOWLIST || '').split(',')[0].trim().toLowerCase();
  const ids = [];
  for (const s of SAMPLES) {
    const itemId = await nextItemId(pool);
    const n = normalizeRecord({ ...s, itemId, registeredBy });
    if (!n.ok) throw new Error(`seed sample invalid: ${n.message}`);
    await insertItem(pool, n.record);
    ids.push(itemId);
  }
  return ids;
}

module.exports = { seed, SAMPLES, HASHED_FIELDS };

if (require.main === module) {
  const pool = makePool();
  seed(pool)
    .then((ids) => { console.log('seed: inserted', ids.join(', ')); return pool.end(); })
    .catch((e) => { console.error('seed failed:', e.message); process.exit(1); });
}
