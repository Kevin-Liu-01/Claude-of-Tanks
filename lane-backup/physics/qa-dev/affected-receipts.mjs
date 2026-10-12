// physics lane scratch: every registered receipt the shared selftest cache would run (its inputs changed since its last
// PASS on this machine), split into plain Node receipts and those owning the capture lease (browser ones).
import { createSelftestCache } from '../tools/selftest-cache.mjs';
import { SELFTEST_SUITES } from '../tools/selftest-suites.mjs';
import { SELFTEST_OWNED_LEASE_FILES } from '../tools/run-selftests.mjs';
const cache = createSelftestCache({});
const files = [...new Set(Object.values(SELFTEST_SUITES).flat())];
const run = [], lease = [], skipped = [];
for (const file of files) {
  let hit;
  try { hit = cache.lookup(file); } catch (error) { run.push(file); continue; }
  if (hit.skip) { skipped.push(file); continue; }
  (SELFTEST_OWNED_LEASE_FILES.includes(file) ? lease : run).push(file);
}
console.log(JSON.stringify({ total: files.length, skipped: skipped.length, run: run.length, lease: lease.length }));
process.stdout.write(run.join('\n') + '\n');
console.error('LEASE ' + lease.join(' '));
