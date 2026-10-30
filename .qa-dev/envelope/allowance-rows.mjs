// Lane tool (envelope-honesty-264): replace the named ids' envelope-allowance rows from census rows (tools/envelope-census.mjs
// --jsonl), every other id's row untouched; a frame past the rule takes the given reason.
//   node .qa-dev/envelope/allowance-rows.mjs <census.jsonl> <reason>
import { readFileSync, writeFileSync } from 'node:fs';
import { ENVELOPE_ALLOWANCE, ENVELOPE_FRAMES, allowanceEntry, readAllowance, serializeAllowance } from '../../tools/envelope-census.mjs';
const [censusFile, reason] = process.argv.slice(2);
const rows = readFileSync(censusFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const allowance = readAllowance();
for (const row of rows) {
  if (row.error) throw new Error(`${row.id}: census error ${row.error}`);
  const next = {};
  for (const frame of ENVELOPE_FRAMES) {
    const entry = allowanceEntry(row[frame] ?? null);
    if (!entry) continue;
    next[frame] = entry[1] >= 0.05 && reason ? [...entry, reason] : entry;
  }
  console.log(`${row.id}: ${JSON.stringify(allowance.rows[row.id] ?? null)} -> ${JSON.stringify(next)}`);
  if (Object.keys(next).length) allowance.rows[row.id] = next; else delete allowance.rows[row.id];
}
writeFileSync(ENVELOPE_ALLOWANCE, serializeAllowance(allowance));
