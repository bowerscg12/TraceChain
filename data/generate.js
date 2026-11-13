'use strict';
// Generates data/items.json: 100 synthetic sneaker records from a FIXED seed (deterministic, reproducible).
// Records 1-80 are realistic; records 81-100 are deliberate edge cases (tagged in `edgeCase`).
// Values are the raw producer INPUT (before API normalization), so edge cases include untrimmed and NFD strings.
const fs = require('node:fs');
const path = require('node:path');

const SEED = 20261113;
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pad = (n, w) => String(n).padStart(w, '0');

const PRODUCERS = ['0x70997970C51812dc3A010C7d01b50e0d17dc79C8', '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'];
const BRANDS = {
  'Nike': { codes: () => `${pick(['DD', 'CW', 'DZ', 'FD', 'CT', 'DH'])}${int(1000, 9999)}-${pad(int(0, 999), 3)}`, mfrs: ['Pou Chen Corp.', 'Feng Tay Enterprises', 'Chang Shin Vietnam'], countries: ['Vietnam', 'Indonesia', 'China'] },
  'adidas': { codes: () => `${pick(['GX', 'HQ', 'IF', 'GY', 'ID'])}${int(1000, 9999)}`, mfrs: ['Pou Chen Corp.', 'Dean Shoes Co.', 'Apache Footwear'], countries: ['Vietnam', 'Indonesia', 'China'] },
  'New Balance': { codes: () => `${pick(['M990', 'U9060', 'M2002R', 'BB550', 'M1906R'])}${pick(['GL6', 'NAV', 'WT', 'BK', 'GR', 'SE'])}`, mfrs: ['New Balance Skowhegan', 'New Balance Lawrence', 'New Balance Flimby'], countries: ['United States', 'United States', 'United Kingdom', 'Vietnam'] },
  'ASICS': { codes: () => `1201A${pad(int(0, 999), 3)}-${pad(int(0, 999), 3)}`, mfrs: ['ASICS Vietnam Co.', 'Golden Chang'], countries: ['Vietnam', 'Indonesia'] },
  'Puma': { codes: () => `${int(370000, 399999)}-${pad(int(1, 99), 2)}`, mfrs: ['Pou Chen Corp.', 'Yue Yuen Industrial'], countries: ['Vietnam', 'China', 'Cambodia'] },
  'Salomon': { codes: () => `L${int(40000000, 47999999)}`, mfrs: ['Salomon Vietnam', 'Freetrend Industrial'], countries: ['Vietnam', 'China'] },
  'Converse': { codes: () => `A${pad(int(0, 99999), 5)}C`, mfrs: ['Pou Chen Corp.', 'Chang Shin Vietnam'], countries: ['Vietnam', 'Indonesia', 'India'] },
  'Hoka': { codes: () => `1${pad(int(100000, 199999), 6)}-${pick(['BBLC', 'WHT', 'OBS', 'SBLC'])}`, mfrs: ['Deckers Outdoor Vietnam', 'Lai Yih Footwear'], countries: ['Vietnam', 'China'] },
};
const COLORWAYS = ['White/Black', 'Black/White', 'Triple White', 'Core Black', 'Grey/Navy', 'University Red', 'Sail/Gum', 'Obsidian', 'Wolf Grey', 'Pine Green', 'Bred', 'Chicago', 'Panda', 'Cream/Tan', 'Midnight Navy', 'Volt', 'Desert Sand', 'Slate Blue'];
const SIZES = ['6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '13', '14'];

function dateIn(year) {
  const m = int(1, 12); const dim = [31, (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return `${year}-${pad(m, 2)}-${pad(int(1, dim), 2)}`;
}

function realistic(i) {
  const brand = pick(Object.keys(BRANDS)); const b = BRANDS[brand];
  const year = pick([2025, 2026, 2026, 2026]);
  const date = dateIn(year);
  return {
    seq: i, edgeCase: null, producer: pick(PRODUCERS),
    brand, styleCode: b.codes(), colorway: pick(COLORWAYS), size: pick(SIZES), manufacturer: pick(b.mfrs),
    countryOfManufacture: pick(b.countries), productionBatch: `PB-${date.slice(0, 7)}-${pick(['A', 'B', 'C', 'D'])}${pad(int(1, 99), 2)}`,
    productionDate: date,
  };
}

const long = (s, n) => Array.from({ length: n }, (_, k) => `${s}${k % 10}`).join('');
const base = () => realistic(0);
const EDGE = [
  ['accented-composed', (r) => ({ ...r, brand: 'Salomon', colorway: 'Café Noir / Crème Brûlée', manufacturer: 'Chaîne de Fabrication S.A.' })],
  ['accented-decomposed', (r) => ({ ...r, brand: 'Salomon', colorway: 'Café Noir / Crème Brûlée', manufacturer: 'Chaîne de Fabrication S.A.' })],
  ['accented-mixed-nfc-nfd', (r) => ({ ...r, colorway: 'Sévilla Roûge', manufacturer: 'Zürich Schuhe GmbH', countryOfManufacture: 'Türkiye' })],
  ['cjk-and-german', (r) => ({ ...r, brand: 'ASICS', manufacturer: 'アシックス工場 / Straße 7', countryOfManufacture: '日本 (Japan)' })],
  ['emoji', (r) => ({ ...r, colorway: 'Fire Red 🔥 / Ice ❄️', productionBatch: 'PB-👟-001' })],
  ['emoji-zwj-flag', (r) => ({ ...r, colorway: 'Family 👨‍👩‍👧 edition', countryOfManufacture: 'Vietnam 🇻🇳' })],
  ['quotes-double', (r) => ({ ...r, colorway: 'The "Chicago" Edition', productionBatch: 'PB-"Q1"-07' })],
  ['quotes-single-and-backslash', (r) => ({ ...r, colorway: "Collector's Cut \\ Series 2", manufacturer: 'Back\\Slash Footwear \\\\ Co' })],
  ['json-special-chars', (r) => ({ ...r, colorway: 'Tab\there / Slash\\n literal', manufacturer: 'Brace {Co} [Ltd] <Inc> & Sons' })],
  ['leading-trailing-whitespace', (r) => ({ ...r, brand: '  Nike  ', styleCode: '\tDD1391-100 ', colorway: ' White/Black\n', manufacturer: ' Pou Chen Corp. ' })],
  ['internal-double-spaces-kept', (r) => ({ ...r, colorway: 'White  /  Black', manufacturer: 'Pou   Chen Corp.' })],
  ['size-half', (r) => ({ ...r, size: '10.5' })],
  ['size-zero-padded', (r) => ({ ...r, size: '09' })],
  ['size-eu-and-trailing-zero', (r) => ({ ...r, size: '42.0 EU' })],
  ['date-month-boundary', (r) => ({ ...r, productionDate: '2026-01-31', productionBatch: 'PB-2026-01-A31' })],
  ['date-year-boundary', (r) => ({ ...r, productionDate: '2025-12-31', productionBatch: 'PB-2025-12-Z' })],
  ['date-leap-day', (r) => ({ ...r, productionDate: '2024-02-29', productionBatch: 'PB-2024-02-LEAP' })],
  ['date-new-year-day', (r) => ({ ...r, productionDate: '2026-01-01', productionBatch: 'PB-2026-01-A01' })],
  ['mixed-case-address', (r) => ({ ...r, producer: '0x70997970c51812DC3a010c7D01B50E0D17DC79c8' })],
  ['very-long-strings', (r) => ({ ...r, colorway: long('Colorway-', 40), manufacturer: long('Manufacturer-', 30), productionBatch: long('B', 200) })],
];

function generate() {
  const items = [];
  for (let i = 1; i <= 80; i++) items.push(realistic(i));
  EDGE.forEach(([tag, fn], k) => { const r = fn(base()); r.seq = 81 + k; r.edgeCase = tag; items.push(r); });
  return items;
}

if (require.main === module) {
  const items = generate();
  const out = { seed: SEED, generatedBy: 'data/generate.js', count: items.length, edgeCases: items.filter((i) => i.edgeCase).length, items };
  fs.writeFileSync(path.join(__dirname, 'items.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote data/items.json: ${items.length} items, ${out.edgeCases} edge cases, seed ${SEED}`);
}
module.exports = { generate, SEED };
