// Lane tool (envelope-honesty-264): write docs/geometry-gate/envelope-allowance.json from a full census (the
// tools/envelope-census.mjs --jsonl rows of every roster id) and a reasons map { "<id>/<frame>": "<reason>" }.
//   node .qa-dev/envelope/seed-allowance.mjs <census.jsonl[,more.jsonl]> <reasons.json> [--about=<text>]
import { readFileSync, writeFileSync } from 'node:fs';
import { ENVELOPE_ALLOWANCE, ENVELOPE_FRAMES, ENVELOPE_RULE, allowanceEntry, readAllowance, serializeAllowance } from '../../tools/envelope-census.mjs';
const [censusFiles, reasonsFile] = process.argv.slice(2);
const about = process.argv.find((arg) => arg.startsWith('--about='))?.slice(8);
const rows = censusFiles.split(',').flatMap((file) => readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse));
const reasons = reasonsFile ? JSON.parse(readFileSync(reasonsFile, 'utf8')) : {};
const allowance = readAllowance();
allowance.rule = { ...ENVELOPE_RULE };
if (about) allowance.about = about;
allowance.rows = {};
const used = new Set();
for (const row of rows) {
  if (row.error) throw new Error(`${row.id}: census error ${row.error}`);
  for (const frame of ENVELOPE_FRAMES) {
    const entry = allowanceEntry(row[frame] ?? null);
    if (!entry) continue;
    const reason = reasons[`${row.id}/${frame}`];
    if (reason) used.add(`${row.id}/${frame}`);
    (allowance.rows[row.id] ||= {})[frame] = reason ? [...entry, reason] : entry;
  }
}
for (const key of Object.keys(reasons)) if (!used.has(key)) console.error(`unused reason (no flagged frame): ${key}`);
writeFileSync(ENVELOPE_ALLOWANCE, serializeAllowance(allowance));
console.log(`${Object.keys(allowance.rows).length} ids, ${Object.values(allowance.rows).reduce((n, r) => n + Object.keys(r).length, 0)} frames`);
