'use strict';
// Logs every request (timestamp, method, path, status, duration ms) to a log file and stdout.
const fs = require('node:fs');
const path = require('node:path');

function requestLogger(logFile) {
  if (logFile) fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const stream = logFile ? fs.createWriteStream(logFile, { flags: 'a' }) : null;
  const header = `# TraceChain API request log; pid=${process.pid} TZ=${process.env.TZ || '(unset)'} started=${new Date().toISOString()}\n`;
  if (stream) stream.write(header);
  return function log(req, res, next) {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const line = `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(2)}ms\n`;
      if (stream) stream.write(line);
      if (process.env.API_QUIET !== '1') process.stdout.write(line);
    });
    next();
  };
}

module.exports = { requestLogger };
