'use strict';
// Drops and recreates the tracechain database (uses the superuser password from .env), then re-applies the schema.
// Lets the whole spike be re-run from scratch. Run: npm run db:reset
require('dotenv').config();
const { Client } = require('pg');
const { makePool } = require('./pool');
const { migrate } = require('./migrate');

async function reset() {
  const dbName = process.env.PGDATABASE || 'tracechain';
  const owner = process.env.PGUSER || 'tracechain';
  const admin = new Client({
    host: process.env.PGHOST || '127.0.0.1', port: Number(process.env.PGPORT || 5432),
    database: 'postgres', user: 'postgres', password: process.env.PG_SUPERUSER_PASSWORD,
  });
  await admin.connect();
  await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [dbName]);
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  await admin.query(`CREATE DATABASE "${dbName}" OWNER "${owner}"`);
  await admin.end();
  const pool = makePool();
  await migrate(pool);
  await pool.end();
}

module.exports = { reset };

if (require.main === module) {
  reset()
    .then(() => console.log('reset: database dropped, recreated and migrated'))
    .catch((e) => { console.error('reset failed:', e.message); process.exit(1); });
}
