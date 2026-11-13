'use strict';
// TraceChain API (spike). Implements team design D4 Interfaces 1 (producer registration), 2 (confirm/rollback)
// and 4 (public lookup) plus static serving of the browser verification page (same origin).
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const { normalizeRecord, detailsHashOf, BODY_FIELDS } = require('./hash');
const { loadAllowlist, requireProducer } = require('./authz');
const { requestLogger } = require('./requestLog');
const repo = require('./repo');

function createApp({ pool, env = process.env, logFile = env.API_LOG_FILE } = {}) {
  const app = express();
  const allowlist = loadAllowlist(env);
  const ethers = require('ethers');
  const root = path.join(__dirname, '..');

  app.disable('x-powered-by');
  app.use(requestLogger(logFile));
  app.use(express.json({ limit: '64kb' }));

  // Static: verification page assets and the ethers UMD bundle straight from node_modules.
  app.use('/static', express.static(path.join(root, 'public')));
  app.use('/vendor/ethers.umd.min.js', express.static(path.join(root, 'node_modules/ethers/dist/ethers.umd.min.js')));
  app.get('/item/:itemId', (req, res) => res.sendFile(path.join(root, 'public', 'verify.html')));
  app.get('/', (req, res) => res.redirect('/item/TC-2026-000001'));

  // Chain config for the browser: RPC URL + stub contract address/ABI written by chain/deploy.js.
  app.get('/config', (req, res) => {
    const file = path.join(root, 'chain', 'deployment.json');
    if (!fs.existsSync(file)) return res.status(503).json({ error: 'Contract not deployed yet' });
    const dep = JSON.parse(fs.readFileSync(file, 'utf8'));
    res.json({ rpcUrl: env.RPC_URL || 'http://127.0.0.1:8545', contractAddress: dep.address, abi: dep.abi, chainId: dep.chainId });
  });

  // Interface 1: producer registers a pair. Body may ONLY supply the 8 product fields.
  app.post('/items', requireProducer(allowlist), async (req, res, next) => {
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      // Validate the 8 body fields first so the error names the field without consuming a sequence number.
      const probe = normalizeRecord({ ...pick(body, BODY_FIELDS), itemId: 'TC-0000-000000', registeredBy: req.producerAddress });
      if (!probe.ok) return res.status(400).json({ error: probe.message, field: probe.field });
      const itemId = await repo.nextItemId(pool);
      const n = normalizeRecord({ ...pick(body, BODY_FIELDS), itemId, registeredBy: req.producerAddress });
      if (!n.ok) return res.status(400).json({ error: n.message, field: n.field });
      const detailsHash = detailsHashOf(n.record);
      try {
        await repo.insertItem(pool, n.record);
      } catch (e) {
        if (e && e.code === '23505') return res.status(409).json({ error: 'This item ID is already registered.', itemId });
        throw e;
      }
      return res.status(201).json({ itemId, itemIdBytes32: ethers.encodeBytes32String(itemId), detailsHash });
    } catch (e) { return next(e); }
  });

  // Interface 4: public lookup, no account. Stored values only; the hash is never recomputed or returned here.
  app.get('/items/:itemId', async (req, res, next) => {
    try {
      const row = await repo.getItem(pool, req.params.itemId);
      if (!row) return res.status(404).json({ error: 'No record found for this item ID.' });
      return res.json(row);
    } catch (e) { return next(e); }
  });

  // Interface 2: after the on-chain register transaction confirms.
  app.patch('/items/:itemId/confirm', requireProducer(allowlist), async (req, res, next) => {
    try {
      const r = await repo.confirmItem(pool, req.params.itemId);
      if (r === 'missing') return res.status(404).json({ error: 'No record found for this item ID.' });
      return res.json({ itemId: req.params.itemId, status: 'confirmed', alreadyConfirmed: r === 'already' });
    } catch (e) { return next(e); }
  });

  // Interface 2: after the on-chain transaction fails. Only pending records can be removed (FR-07).
  app.delete('/items/:itemId', requireProducer(allowlist), async (req, res, next) => {
    try {
      const r = await repo.deletePendingItem(pool, req.params.itemId);
      if (r === 'missing') return res.status(404).json({ error: 'No record found for this item ID.' });
      if (r === 'confirmed') return res.status(409).json({ error: 'Confirmed records cannot be deleted or changed.' });
      return res.status(204).end();
    } catch (e) { return next(e); }
  });

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Body must be valid JSON', field: 'body' });
    console.error('API error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  return out;
}

module.exports = { createApp };
