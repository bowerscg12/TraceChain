'use strict';
// Console logger that also appends everything to results/<run>/console.log.
const fs = require('node:fs');
let stream = null;
function attach(file) { stream = fs.createWriteStream(file, { flags: 'a' }); }
function log(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  process.stdout.write(line + '\n');
  if (stream) stream.write(`${new Date().toISOString()} ${line}\n`);
}
module.exports = { attach, log };
