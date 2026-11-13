'use strict';
// Collects every test case (expected vs actual), writes summary.csv / summary.json, prints the PASS/FAIL table
// and renders the README results section.
const fs = require('node:fs');
const path = require('node:path');

function stats(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
  return { n: s.length, min: +s[0].toFixed(2), median: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), max: +s[s.length - 1].toFixed(2) };
}

class Report {
  constructor(runDir, meta) {
    this.runDir = runDir; this.meta = meta; this.cases = []; this.timings = {}; this.marks = []; this.notes = [];
  }
  /** c: { test, group, caseId, expected, actual, pass, counted=true, note, detail } */
  add(c) { const full = { counted: true, ...c, pass: !!c.pass }; this.cases.push(full); return full; }
  time(name, ms) { (this.timings[name] = this.timings[name] || []).push(ms); }
  /** mark: { label, group, test, required, kind: 'all' | 'zero' } */
  mark(m) { this.marks.push(m); }
  tally(test, group) {
    const cs = this.cases.filter((c) => c.test === test && c.group === group && c.counted);
    return { total: cs.length, passed: cs.filter((c) => c.pass).length, failed: cs.filter((c) => !c.pass).length };
  }
  evaluateMarks() {
    return this.marks.map((m) => {
      const t = this.tally(m.test, m.group);
      let verdict;
      if (m.kind === 'zero') verdict = t.failed === 0 && t.total === m.required ? 'PASS' : 'FAIL';
      else verdict = t.passed === m.required && t.total === m.required ? 'PASS' : 'FAIL';
      return { ...m, ...t, verdict };
    });
  }
  summaryJson() {
    return {
      meta: this.meta, marks: this.evaluateMarks(),
      timings: Object.fromEntries(Object.entries(this.timings).map(([k, v]) => [k, stats(v)])),
      notes: this.notes, cases: this.cases,
    };
  }
  write() {
    const json = this.summaryJson();
    fs.writeFileSync(path.join(this.runDir, 'summary.json'), JSON.stringify(json, null, 2) + '\n');
    const cols = ['test', 'group', 'caseId', 'counted', 'pass', 'expected', 'actual', 'note', 'detail'];
    const esc = (v) => { const s = v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [cols.join(',')].concat(this.cases.map((c) => cols.map((k) => esc(c[k])).join(',')));
    fs.writeFileSync(path.join(this.runDir, 'summary.csv'), lines.join('\n') + '\n');
    fs.writeFileSync(path.join(this.runDir, 'results-table.md'), this.markdown());
    return json;
  }
  consoleTable() {
    const rows = this.evaluateMarks();
    const w = Math.max(...rows.map((r) => r.label.length), 10);
    const out = [];
    out.push(`${'Pass mark'.padEnd(w)} | ${'Required'.padEnd(10)} | ${'Result'.padEnd(10)} | Verdict`);
    out.push(`${'-'.repeat(w)}-|-${'-'.repeat(10)}-|-${'-'.repeat(10)}-|--------`);
    for (const r of rows) {
      const req = r.kind === 'zero' ? `0 of ${r.required}` : `${r.required} of ${r.required}`;
      const res = r.kind === 'zero' ? `${r.failed} of ${r.total}` : `${r.passed} of ${r.total}`;
      out.push(`${r.label.padEnd(w)} | ${req.padEnd(10)} | ${res.padEnd(10)} | ${r.verdict}`);
    }
    return out.join('\n');
  }
  markdown() {
    const rows = this.evaluateMarks();
    const out = [];
    out.push(`Run: \`${path.basename(this.runDir)}\` (${this.meta.startedAt}); timezones: ${this.meta.timezones.join(', ')}`);
    out.push('');
    out.push('| Pass mark | Required | Result | Verdict |');
    out.push('|---|---|---|---|');
    for (const r of rows) {
      const req = r.kind === 'zero' ? `0 of ${r.required}` : `${r.required} of ${r.required}`;
      const res = r.kind === 'zero' ? `${r.failed} of ${r.total}` : `${r.passed} of ${r.total}`;
      out.push(`| ${r.label} | ${req} | ${res} | **${r.verdict}** |`);
    }
    const unc = this.cases.filter((c) => !c.counted);
    if (unc.length) {
      out.push(''); out.push('Checks outside the counted groups (recorded, not part of a pass mark):'); out.push('');
      out.push('| Test | Case | Expected | Actual | OK |'); out.push('|---|---|---|---|---|');
      for (const c of unc) out.push(`| ${c.test} ${c.group} | ${c.caseId} | ${String(c.expected).replace(/\|/g, '\\|')} | ${String(c.actual).replace(/\|/g, '\\|')} | ${c.pass ? 'yes' : 'NO'} |`);
    }
    const t = this.summaryJson().timings;
    if (Object.keys(t).length) {
      out.push(''); out.push('Informational timings (ms; performance is not this spike\'s question):'); out.push('');
      out.push('| Measurement | n | min | median | p95 | max |'); out.push('|---|---|---|---|---|---|');
      for (const [k, v] of Object.entries(t)) if (v) out.push(`| ${k} | ${v.n} | ${v.min} | ${v.median} | ${v.p95} | ${v.max} |`);
    }
    if (this.notes.length) { out.push(''); for (const n of this.notes) out.push(`- ${n}`); }
    return out.join('\n') + '\n';
  }
}

module.exports = { Report, stats };
