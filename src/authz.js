'use strict';
// Authorization STUB for the spike: a static allowlist of producer addresses from .env, identified by the
// X-Producer-Address header. Real wallet signature verification (e.g. EIP-191 / SIWE) is out of scope here.
const { ADDRESS_RE } = require('./hash');

function loadAllowlist(env = process.env) {
  return new Set((env.PRODUCER_ALLOWLIST || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/** Express middleware: sets req.producerAddress (lowercased) or responds 401. */
function requireProducer(allowlist) {
  return function producerAuth(req, res, next) {
    const header = req.get('X-Producer-Address');
    if (!header) return res.status(401).json({ error: 'Missing X-Producer-Address header' });
    const addr = header.trim().toLowerCase();
    if (!ADDRESS_RE.test(addr) || !allowlist.has(addr)) {
      return res.status(401).json({ error: 'Producer address is not authorized' });
    }
    req.producerAddress = addr;
    return next();
  };
}

module.exports = { loadAllowlist, requireProducer };
