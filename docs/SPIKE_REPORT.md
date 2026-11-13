# TraceChain Hash-Consistency Spike — Full Report

Caleb Bowers · Team 6 (SAC-1 "TraceChain") · JMU IT 444 Capstone, Fall 2026 · Submitted 2026-11-13

## 1. Spike question and scope

> Can PostgreSQL and the TraceChain API store item details, read them back, and produce a hash that matches the one on
> the blockchain every time — and can the comparison catch a record that really was changed?

In scope: the TraceChain API, the off-chain PostgreSQL database, the serialization/hashing contract shared by the API and
the consumer's browser, and the browser-side comparison (design D4 Interfaces 1, 2 and 4). Requirements exercised:
FR-01, FR-02, FR-06, FR-07, FR-08, NFR-04, NFR-05, NFR-09 and team risk D6 Risk 7.

Out of scope and deliberately not measured: transaction fees and confirmation latency (Nick Crockett), QR scanning and
multi-device behaviour (Nick Frank).

## 2. Headline results

All seven pass marks, set before the tests ran, passed on the first complete run (`results/2026-11-13_00-27-01Z`)
and again on the final clean run recorded in the README.

| Pass mark | Required | Result |
|---|---|---|
| Test 1 consistency, API `TZ=UTC`, browser `timezoneId=UTC` | 100 of 100 | 100 of 100 |
| Test 1 consistency, `America/New_York` | 100 of 100 | 100 of 100 |
| Test 1 consistency, `Asia/Tokyo` | 100 of 100 | 100 of 100 |
| Test 2 tamper detection (180 single-field edits + 20 swaps) | 200 of 200 | 200 of 200 |
| Test 2 false alarms on untouched/restored records | 0 of 100 | 0 of 100 |
| Test 3 400 group (8 missing fields, invalid date, whitespace-only field) | 10 of 10 | 10 of 10 |
| Test 3 409 group (forced sequence-ID collisions, nothing written) | 10 of 10 | 10 of 10 |

Every uncounted check also behaved as specified: 401 for a missing header and for a non-allowlisted address, 404 for
an unknown ID, a failed on-chain register (unauthorized wallet → `NotAuthorized()` revert) followed by DELETE of the
pending record, 409 on DELETE of a confirmed record, `ItemAlreadyExists` revert on a duplicate register, "Pending
confirmation" for a pending record, and "Can't verify right now, try again later." when the API process was stopped
and when the Hardhat RPC node was stopped. The FR-02 "stored exactly as entered" check matched for 300 of 300 reads.

Answer to the spike question: **yes, on this evidence.** Five independently obtained hashes per record (API POST
response, Node recompute from the database read-back, real headless Chromium using a separately written Web Crypto
implementation, the on-chain `bytes32`, and a Node recompute after a full API process restart) were identical for all
100 records in all three timezones, and every substantive direct-database change was caught with no false alarms.

## 3. What was built

| Piece | File(s) | Notes |
|---|---|---|
| Serialization & hashing spec v1 | `SERIALIZATION_SPEC.md` | Field order, normalization rules with reasons, PostgreSQL DATE trap and its fix, on-chain encoding, versioning. |
| Implementation 1 (API, Node `crypto`) | `src/hash.js`, `src/hash.selftest.js`, `src/hash.vector.json` | Pinned test vector `0x5b8277b1…fb573`, confirmed independently with `sha256sum`. |
| Implementation 2 (browser, Web Crypto) | `public/verify-hash.js` | Written from the spec; no shared code with implementation 1. |
| PostgreSQL | `db/schema.sql`, `db/pool.js`, `db/migrate.js`, `db/seed.js`, `db/reset.js`, `src/repo.js` | `item_details` table with CHECK on status, `item_seq` sequence, `types.setTypeParser(1082, v => v)`. |
| API | `src/app.js`, `src/server.js`, `src/authz.js`, `src/requestLog.js` | POST/GET/PATCH/DELETE `/items`, `/config`, static page, per-request log file. 409 comes from catching Postgres error 23505, never a 500. |
| Chain stub | `contracts/TraceChainStub.sol`, `hardhat.config.js`, `chain/deploy.js`, `chain/accounts.js` | Labelled stub of Nick Crockett's contract; no update/delete functions. |
| Verification page | `public/verify.html` | Five states in `#status`, computed hash in `#computed-hash`, NFR-09 statement, "Check again" button. |
| Dataset | `data/generate.js`, `data/items.json` | 100 records, seed 20261113, byte-identical on regeneration; 20 tagged edge cases. |
| Runner | `spike/run.js`, `spike/test1-consistency.js`, `spike/test2-tamper.js`, `spike/test3-validation.js`, `spike/lib/*` | `npm run spike`; real child processes for the API and the Hardhat node; Playwright Chromium; CSV/JSON/markdown output. |

### Edge cases in the dataset (records 81–100)

accented composed, accented decomposed, mixed NFC/NFD, CJK + German ß, emoji, ZWJ emoji + flag, double quotes,
single quote + backslashes, JSON-special characters (tab, braces, angle brackets, ampersand), leading/trailing
whitespace (spaces, tab, newline), internal double spaces (kept), sizes `10.5`, `09`, `42.0 EU`, dates on a month
boundary, year boundary, leap day and New Year's Day, a mixed-case producer address, and very long strings
(colorway 400 chars, manufacturer 420 chars, batch 400 chars).

## 4. Test design

**Test 1.** For each timezone the runner stops everything, drops and recreates the database (sequence back to 1),
starts a fresh Hardhat node, deploys the stub, authorizes producers 1 and 2, and starts the API with `TZ` set. It then
plays the producer frontend for all 100 records: `POST /items` → `register(itemIdBytes32, detailsHash)` with the
matching producer wallet → `PATCH /items/:id/confirm`. For each record it collects hashes (a)–(d), loads the page in
Chromium with `timezoneId` set to the same zone, then stops the API process, starts a new one, and collects (e).
A record passes only if all five hashes are identical and the page says "Verified".

**Test 2.** 20 confirmed records (every fifth, including four edge cases). For each of the 9 non-key hashed fields a
substantive `UPDATE` is applied directly with SQL (change one character, change letter case, append a character,
move the date ±1 day, change one hex digit of `registeredBy`), the page is loaded, and the original value is restored
and re-read. Then 20 swap cases copy another record's 9 fields into the row. Finally all 100 records are loaded
again and must show "Verified" (false-alarm check, which also proves every restore worked).

Whitespace-only edits (5 cases, informational): applied directly in the database they are reported as "Not verified"
because the reader hashes the stored bytes; the same whitespace variants pushed through the API's normalizer produce
the unchanged hash ("absorbed by normalization, by design"). Both facts are recorded in `summary.csv`.

**Test 3.** 400 group: each body field missing in turn (8), `2026-02-30`, and a whitespace-only field; each must return
400 naming the field and write nothing. 409 group: a row is inserted directly with the next sequence ID (without
consuming the sequence), then a normal POST must return 409 "This item ID is already registered." with the planted
row intact and the row count unchanged. Uncounted checks as listed in §2; the RPC-stopped check runs last because
stopping the Hardhat node discards chain state.

## 5. Bugs and issues found, and how they were handled

- **No hash or consistency bug was found by the tests.** Both implementations agreed on every record in every
  timezone on the first full run. The honest reading is that the spec was specific enough to implement twice without
  drift; the PostgreSQL DATE trap was designed out before testing (type parser override), so it never manifested.
- **Harness slowness (not a correctness bug):** the first Test 1 run took about 7 minutes because ethers v6 polls for
  transaction receipts every 4 s by default, so each of the 100 `tx.wait()` calls on an instant-mining node waited
  ~4 s. Setting `provider.pollingInterval = 100` cut a full three-timezone run to about 4 minutes. The slow run is
  kept in `results/2026-11-13_00-19-21Z` and in the commit history.
- **Custom-error names:** ethers reported Hardhat reverts as "unknown custom error". The harness now decodes the
  revert selector against the stub ABI so the evidence reads `reverted with NotAuthorized()` / `ItemAlreadyExists(...)`.
- **An accidental partial run** was started while sanity-loading the runner module; its stray Hardhat process was
  killed and its partial folder removed before the results commit.

## 6. Substitutions and their limits

| Substituted | Why | Limit on the conclusion |
|---|---|---|
| Local Hardhat node for the Ethereum L2 | Spike is about hashing and storage, not the network | Same EVM semantics for `bytes32`; says nothing about fees, latency or finality. |
| Stub contract for the real one | Real contract is Nick Crockett's deliverable | Only `register`/`getItem` semantics are exercised. |
| Allowlist header for wallet signatures | Auth is out of scope | Identity is asserted, not proven; `registeredBy` is still server-set from the header, never from the body. |
| Linux container for the Windows 11 laptop | Session ran in a cloud container | Tool versions recorded in `results/environment.txt`; all scripts are plain Node and should run unchanged on Windows. |
| npm `solc` 0.8.28 for Hardhat's downloaded compiler | Container cannot reach the compiler download host | Same compiler version, JavaScript build. |
| Local git history until the GitHub repo is attached | Session's GitHub token was invalid | Commit history is intact and is pushed as soon as the repo is attached. |

## 7. Evidence

- `results/2026-11-13_00-19-21Z/` — Test 1, UTC only (first run, slow receipt polling).
- `results/2026-11-13_00-27-01Z/` — first full run, all pass marks met.
- The final run named in the README results section — re-run after the last harness changes, from a clean compile.
- Each run folder: `summary.csv`, `summary.json` (every case with expected vs actual and per-record hashes),
  `environment.txt`, `api-*.log` (one per API process incarnation, every request with status and duration),
  `hardhat-node.log`, `console.log`, `screenshots/` (verified, not-verified-tampered, pending-confirmation,
  cant-verify-api-stopped, cant-verify-rpc-stopped).
- Commit history on `spike/caleb-hash-consistency`: spec → hash implementation → database → API → contract →
  page + dataset → harness → runs.

## 8. Recommendations for the team

1. Adopt `SERIALIZATION_SPEC.md` v1 as the shared contract; Nick Frank's frontend should include `public/verify-hash.js`
   unchanged (or re-implement from the spec and run it against `src/hash.vector.json` and `data/items.json`).
2. Every `pg` client in TraceChain must register the DATE type parser (`db/pool.js`); make this a code-review checklist item.
3. Keep `size` and `productionDate` as strings end-to-end, including in any form library or ORM.
4. Replace the allowlist with wallet signature verification before any non-local deployment.
5. Re-run `npm run spike` against Nick Crockett's real contract once its `register`/read functions are fixed; only
   `chain/deploy.js` and the ABI handed to the page should need to change.
