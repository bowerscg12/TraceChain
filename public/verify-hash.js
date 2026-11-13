/*
 * TraceChain BROWSER-side hashing, written from SERIALIZATION_SPEC.md v1 (sections 1, 3, 4 and "Reader rules").
 * This file is intentionally independent of the API's src/hash.js: no shared code, Web Crypto + TextEncoder only.
 * A reader hashes the 10 stored values exactly as served; it does not trim, lowercase or NFC-normalize them.
 */
(function (global) {
  'use strict';

  // Spec §1: hashed fields in this exact order.
  var FIELD_ORDER = [
    'itemId',
    'brand',
    'styleCode',
    'colorway',
    'size',
    'manufacturer',
    'countryOfManufacture',
    'productionBatch',
    'productionDate',
    'registeredBy'
  ];

  // Spec §3: JSON array of the 10 string values, no whitespace.
  function serializeDetails(details) {
    var values = [];
    for (var i = 0; i < FIELD_ORDER.length; i++) {
      var name = FIELD_ORDER[i];
      var v = details[name];
      if (typeof v !== 'string') {
        throw new Error('Field "' + name + '" is missing or not a string');
      }
      values.push(v);
    }
    return JSON.stringify(values);
  }

  function bytesToHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      var h = bytes[i].toString(16);
      hex += h.length === 1 ? '0' + h : h;
    }
    return hex;
  }

  // Spec §4: SHA-256 over UTF-8 bytes, lowercase, 0x-prefixed.
  function computeDetailsHash(details) {
    var serialized = serializeDetails(details);
    var bytes = new TextEncoder().encode(serialized);
    return global.crypto.subtle.digest('SHA-256', bytes).then(function (digest) {
      return '0x' + bytesToHex(digest);
    });
  }

  // Compare hex strings case-insensitively (spec §4 note); both sides should already be lowercase.
  function hashesEqual(a, b) {
    return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
  }

  global.TraceChainVerify = {
    FIELD_ORDER: FIELD_ORDER,
    serializeDetails: serializeDetails,
    computeDetailsHash: computeDetailsHash,
    hashesEqual: hashesEqual
  };
})(typeof window !== 'undefined' ? window : globalThis);
