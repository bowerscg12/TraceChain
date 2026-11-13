Run: `2026-11-13_00-32-00Z` (2026-11-13T00:32:00.011Z); timezones: UTC, America/New_York, Asia/Tokyo

| Pass mark | Required | Result | Verdict |
|---|---|---|---|
| Test 1 consistency (TZ UTC) | 100 of 100 | 100 of 100 | **PASS** |
| Test 1 consistency (TZ America/New_York) | 100 of 100 | 100 of 100 | **PASS** |
| Test 1 consistency (TZ Asia/Tokyo) | 100 of 100 | 100 of 100 | **PASS** |
| Test 2 tamper detected | 200 of 200 | 200 of 200 | **PASS** |
| Test 2 false alarms | 0 of 100 | 0 of 100 | **PASS** |
| Test 3 400 group | 10 of 10 | 10 of 10 | **PASS** |
| Test 3 409 group | 10 of 10 | 10 of 10 | **PASS** |

Checks outside the counted groups (recorded, not part of a pass mark):

| Test | Case | Expected | Actual | OK |
|---|---|---|---|---|
| T1 stored-as-entered-UTC | 100 cases | GET returns normalized input byte-for-byte | 100 of 100 as expected | yes |
| T1 stored-as-entered-America/New_York | 100 cases | GET returns normalized input byte-for-byte | 100 of 100 as expected | yes |
| T1 stored-as-entered-Asia/Tokyo | 100 cases | GET returns normalized input byte-for-byte | 100 of 100 as expected | yes |
| T2 whitespace-informational | TC-2026-000005.brand | informational (not judged) | via API normalization: absorbed by normalization (by design), hash unchanged; written directly to the DB: page "Not verified" | yes |
| T2 whitespace-informational | TC-2026-000010.colorway | informational (not judged) | via API normalization: absorbed by normalization (by design), hash unchanged; written directly to the DB: page "Not verified" | yes |
| T2 whitespace-informational | TC-2026-000015.manufacturer | informational (not judged) | via API normalization: absorbed by normalization (by design), hash unchanged; written directly to the DB: page "Not verified" | yes |
| T2 whitespace-informational | TC-2026-000020.styleCode | informational (not judged) | via API normalization: absorbed by normalization (by design), hash unchanged; written directly to the DB: page "Not verified" | yes |
| T2 whitespace-informational | TC-2026-000025.countryOfManufacture | informational (not judged) | via API normalization: absorbed by normalization (by design), hash unchanged; written directly to the DB: page "Not verified" | yes |
| T3 other | 401 missing X-Producer-Address | 401 | 401 | yes |
| T3 other | 401 address not on allowlist | 401 | 401 | yes |
| T3 other | 404 unknown item ID | 404 | 404 | yes |
| T3 other | contract rejects register() from unauthorized wallet | revert | revert (reverted with NotAuthorized()) | yes |
| T3 other | failed on-chain register -> DELETE removes pending record | 204 then GET 404 | 204 then GET 404 | yes |
| T3 other | DELETE on confirmed record rejected | 409 | 409 | yes |
| T3 other | contract rejects duplicate register() | revert | revert (reverted with ItemAlreadyExists(bytes32)) | yes |
| T3 other | page shows "Pending confirmation" for pending record | Pending confirmation | Pending confirmation | yes |
| T3 other | page shows "Can't verify" when API is stopped | Can't verify right now, try again later. | Can't verify right now, try again later. | yes |
| T3 other | page back to "Verified" after API restart | Verified | Verified | yes |
| T3 other | page shows "Can't verify" when RPC is stopped | Can't verify right now, try again later. | Can't verify right now, try again later. | yes |

Informational timings (ms; performance is not this spike's question):

| Measurement | n | min | median | p95 | max |
|---|---|---|---|---|---|
| POST /items (ms) | 300 | 1.71 | 2.55 | 3.69 | 40.91 |
| GET /items/:id (ms) | 300 | 1.59 | 1.99 | 2.42 | 10.33 |
| page verify (ms, UTC) | 100 | 22.1 | 29.7 | 41.1 | 51.7 |
| page verify (ms, America/New_York) | 100 | 22.8 | 30.6 | 40.4 | 51.3 |
| page verify (ms, Asia/Tokyo) | 100 | 20.2 | 31.8 | 46.4 | 50.6 |

- Tests 2 and 3 ran against the state left by the last Test 1 timezone run (Asia/Tokyo).
- Hash cross-check sources per record: (a) POST response, (b) Node recompute from GET, (c) headless Chromium page, (d) on-chain getItem, (e) Node recompute after API restart.
