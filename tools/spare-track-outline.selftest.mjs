// VEH-13 outline rule (owner, 2026-10-16): no spare-link run may stand past the tank's plan outline (the hull frame's own
// width and length, skirts included). The spare-track receipt (tools/spare-track-placement-check.mjs) gates this as
// PROUD. Its seeded break, --seed-proud, carries the first run 5 cm past the outline's right edge; the gate must fail and
// name PROUD. The same id without the break reads no PROUD.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const ID = 'amx10p_25';
const receipt = (extra) => spawnSync(process.execPath, ['--max-old-space-size=4096', 'tools/spare-track-placement-check.mjs',
  `--ids=${ID}`, '--ledger=docs/geometry-gate/spare-track.json', '--gate', ...extra], { encoding: 'utf8', timeout: 300000 });

const seeded = receipt(['--seed-proud']);
assert.notEqual(seeded.status, 0, `the seeded break fails the gate\n${seeded.stdout}${seeded.stderr}`);
assert.match(seeded.stdout, /PROUD \(stands 5\.0 cm past the vehicle's plan outline \(right\)\)/, 'and names PROUD');
const clean = receipt([]);
assert.doesNotMatch(clean.stdout, /PROUD/, `the unbroken build reads no PROUD\n${clean.stdout}`);
console.log(`spare-track-outline.selftest: ${ID} seeded break reads PROUD, the clean build none`);
