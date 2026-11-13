'use strict';
// Data access for item_details. Column <-> camelCase field mapping lives here only.
const COLS = {
  itemId: 'item_id', brand: 'brand', styleCode: 'style_code', colorway: 'colorway', size: 'size',
  manufacturer: 'manufacturer', countryOfManufacture: 'country_of_manufacture', productionBatch: 'production_batch',
  productionDate: 'production_date', registeredBy: 'registered_by', status: 'status',
};
const SELECT_COLS = Object.entries(COLS).map(([k, c]) => `${c} AS "${k}"`).join(', ');

/** Next itemId: TC-{year}-{6-digit sequence}. */
async function nextItemId(pool) {
  const { rows } = await pool.query("SELECT nextval('item_seq') AS n");
  const year = new Date().getUTCFullYear();
  return `TC-${year}-${String(rows[0].n).padStart(6, '0')}`;
}

/** Inserts a normalized record with status 'pending'. Throws pg error 23505 on duplicate item_id. */
async function insertItem(pool, r) {
  await pool.query(
    `INSERT INTO item_details (item_id, brand, style_code, colorway, size, manufacturer, country_of_manufacture,
       production_batch, production_date, registered_by, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')`,
    [r.itemId, r.brand, r.styleCode, r.colorway, r.size, r.manufacturer, r.countryOfManufacture,
      r.productionBatch, r.productionDate, r.registeredBy],
  );
}

async function getItem(pool, itemId) {
  const { rows } = await pool.query(`SELECT ${SELECT_COLS} FROM item_details WHERE item_id = $1`, [itemId]);
  return rows[0] || null;
}

/** pending -> confirmed. Returns 'confirmed' | 'already' | 'missing'. */
async function confirmItem(pool, itemId) {
  const r = await pool.query("UPDATE item_details SET status = 'confirmed' WHERE item_id = $1 AND status = 'pending'", [itemId]);
  if (r.rowCount === 1) return 'confirmed';
  const existing = await getItem(pool, itemId);
  return existing ? 'already' : 'missing';
}

/** Deletes ONLY a pending record (FR-07). Returns 'deleted' | 'confirmed' | 'missing'. */
async function deletePendingItem(pool, itemId) {
  const r = await pool.query("DELETE FROM item_details WHERE item_id = $1 AND status = 'pending'", [itemId]);
  if (r.rowCount === 1) return 'deleted';
  const existing = await getItem(pool, itemId);
  return existing ? 'confirmed' : 'missing';
}

module.exports = { COLS, nextItemId, insertItem, getItem, confirmItem, deletePendingItem };
