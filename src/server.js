'use strict';
// Starts the TraceChain API. Env: API_PORT, API_LOG_FILE, TZ. Prints "API listening" when ready (the spike runner waits for it).
require('dotenv').config();
const { makePool } = require('../db/pool');
const { createApp } = require('./app');

const pool = makePool();
const port = Number(process.env.API_PORT || 3000);
const app = createApp({ pool });
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`API listening on http://127.0.0.1:${port} pid=${process.pid} TZ=${process.env.TZ || '(unset)'}`);
});

function shutdown(sig) {
  console.log(`API received ${sig}, shutting down`);
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
