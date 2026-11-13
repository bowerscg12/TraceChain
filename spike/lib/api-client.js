'use strict';
// Thin HTTP client for the TraceChain API with per-request timing (informational).
async function request(method, url, { body, producer } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (producer) headers['X-Producer-Address'] = producer;
  const t0 = process.hrtime.bigint();
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, json, ms };
}

function apiClient(baseUrl) {
  return {
    post: (body, producer) => request('POST', `${baseUrl}/items`, { body, producer }),
    get: (id) => request('GET', `${baseUrl}/items/${encodeURIComponent(id)}`),
    confirm: (id, producer) => request('PATCH', `${baseUrl}/items/${encodeURIComponent(id)}/confirm`, { producer }),
    del: (id, producer) => request('DELETE', `${baseUrl}/items/${encodeURIComponent(id)}`, { producer }),
    config: () => request('GET', `${baseUrl}/config`),
  };
}

module.exports = { apiClient };
