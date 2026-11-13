'use strict';
// Applies db/schema.sql (idempotent). Run: npm run db:migrate
const fs = require('node:fs');
const path = require('node:path');
const { makePool } = require('./pool');

async function migrate(pool) {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

module.exports = { migrate };

if (require.main === module) {
  const pool = makePool();
  migrate(pool)
    .then(() => { console.log('migrate: schema applied'); return pool.end(); })
    .catch((e) => { console.error('migrate failed:', e.message); process.exit(1); });
}
