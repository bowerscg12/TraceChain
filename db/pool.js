'use strict';
// Shared pg Pool for the API and scripts. Includes the mandatory DATE (OID 1082) type parser override
// so production_date comes back as the raw 'YYYY-MM-DD' text in every process timezone (SERIALIZATION_SPEC.md §6).
require('dotenv').config();
const { Pool, types } = require('pg');

const DATE_OID = 1082;
types.setTypeParser(DATE_OID, (value) => value);

function makePool(overrides = {}) {
  return new Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'tracechain',
    user: process.env.PGUSER || 'tracechain',
    password: process.env.PGPASSWORD,
    max: 10,
    ...overrides,
  });
}

module.exports = { makePool, DATE_OID };
