'use strict';
/**
 * TraceChain API-side implementation of SERIALIZATION_SPEC.md (v1).
 * Node built-in crypto only. The browser has its OWN implementation in public/verify-hash.js
 * written independently from the spec; do not share code between them (D6 Risk 7).
 */
const { createHash } = require('node:crypto');

/** Hashed fields, in exactly this order (spec §1). */
const HASHED_FIELDS = Object.freeze([
  'itemId', 'brand', 'styleCode', 'colorway', 'size', 'manufacturer',
  'countryOfManufacture', 'productionBatch', 'productionDate', 'registeredBy',
]);

/** Fields the producer supplies in POST /items (everything except itemId and registeredBy). */
const BODY_FIELDS = Object.freeze(HASHED_FIELDS.filter((f) => f !== 'itemId' && f !== 'registeredBy'));

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ITEM_ID_RE = /^TC-\d{4}-\d{6}$/;

/** True if s is exactly YYYY-MM-DD and a real calendar date (spec §2). */
function isValidCalendarDate(s) {
  const m = typeof s === 'string' ? DATE_RE.exec(s) : null;
  if (!m) return false;
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return d <= dim;
}

/** Trim + NFC for one text field. Returns null when the value is not a string or is empty after trimming. */
function normalizeText(value) {
  if (typeof value !== 'string') return null;
  if (!value.isWellFormed()) return null; // lone surrogates: reject rather than let JSON.stringify escape them
  const out = value.trim().normalize('NFC');
  return out.length === 0 ? null : out;
}

/**
 * Normalize a full record (spec §2). Returns { ok: true, record } or { ok: false, field, message }.
 * `input` must have all 10 hashed fields. itemId and registeredBy are supplied by the API, not the body.
 */
function normalizeRecord(input) {
  const record = {};
  for (const field of HASHED_FIELDS) {
    const raw = input[field];
    if (raw === undefined || raw === null) return { ok: false, field, message: `${field} is required` };
    if (typeof raw !== 'string') return { ok: false, field, message: `${field} must be a string` };
    const v = normalizeText(raw);
    if (v === null) return { ok: false, field, message: `${field} must not be empty` };
    record[field] = v;
  }
  if (!ITEM_ID_RE.test(record.itemId)) return { ok: false, field: 'itemId', message: 'itemId must look like TC-YYYY-NNNNNN' };
  if (!isValidCalendarDate(record.productionDate)) {
    return { ok: false, field: 'productionDate', message: 'productionDate must be a real calendar date in YYYY-MM-DD format' };
  }
  if (!ADDRESS_RE.test(record.registeredBy)) {
    return { ok: false, field: 'registeredBy', message: 'registeredBy must be a 0x-prefixed 40-hex-character address' };
  }
  record.registeredBy = record.registeredBy.toLowerCase();
  return { ok: true, record };
}

/** Spec §3: JSON array of the 10 values in order, no whitespace. Throws if any value is not a string. */
function serialize(record) {
  const values = HASHED_FIELDS.map((f) => {
    const v = record[f];
    if (typeof v !== 'string') throw new TypeError(`serialize: ${f} must be a string, got ${typeof v}`);
    return v;
  });
  return JSON.stringify(values);
}

/** Spec §4: SHA-256 over the UTF-8 bytes, lowercase 0x-prefixed 64-hex. */
function detailsHashOf(record) {
  const bytes = Buffer.from(serialize(record), 'utf8');
  return '0x' + createHash('sha256').update(bytes).digest('hex');
}

module.exports = {
  HASHED_FIELDS, BODY_FIELDS, DATE_RE, ADDRESS_RE, ITEM_ID_RE,
  isValidCalendarDate, normalizeText, normalizeRecord, serialize, detailsHashOf,
};
