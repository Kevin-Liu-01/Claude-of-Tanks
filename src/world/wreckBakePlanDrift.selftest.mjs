// Drift receipt for the wreck bake plan (src/world/maps/wreckBakePlan.ts, the time-to-battle lane, 2026-10-08), in the
// manner of server/collisionManifestDrift.selftest.mjs. The world build starts each map's planned wreck bakes beside the
// terrain and vegetation (src/world/wreckBakePrefetch.ts); a plan the tree has moved past still builds the same world —
// a request it does not hold bakes on demand — but loses the time it was there to save, silently. So every map's
// requests are recorded again here on both tiers and both terrains (tools/wreck-bake-plan.mjs --check: the browser's
// build in Node, a child process per tier and share of the maps) and each of the four keys a map resolves must match the
// committed plan. On a failure, regenerate the named maps: node tools/wreck-bake-plan.mjs --write --maps=<ids>.
// Two children (test-speed R9a, 2026-10-16): one a tier, every map each; four since 229 (below). Four children counted as one slot by every
// pool, and without a yield between worlds (tools/wreck-bake-plan.mjs) they grew past the gate pool's 12 GB cap, twice
// in the 226 cycle. Two paired runs side by side on one host (2026-10-17, load 100-250): four unyielding children peaked
// at 9.7-12.9 GB (3.1-4.3 GB in one child) on 984-1,010 CPU-s; two yielding children at 2.8-3.0 GB (1.5-1.6 GB) on
// 876-902 CPU-s, and each child bakes a donor once, so fewer children bake less. The largest child's CPU, the receipt's
// floor on a quiet core, goes from about 300 s to about 500 s (the desktop tier; the phone tier's child takes 375 s).
// Four YIELDING children (229, critic r1 on the test-speed branch: the two-child receipt was the floor of every delta
// run): measured 2026-10-19 at load about 200, 3,636 s wall against the two children's 4,824 s at load 172, 1,023 CPU-s
// against 876-902, and 954 MB in the largest child (about 3.8 GB for all four, against the unyielding four's 9.7-12.9 GB).
// About half the wall for about 15 % more CPU (each child bakes the donors of its own maps).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MAP_IDS } from './maps/mapIds.ts';

const tool = fileURLToPath(new URL('../../tools/wreck-bake-plan.mjs', import.meta.url));
const VARIANTS = ['desktop', 'mobile', 'assault', 'assault-mobile'];

const { code, out, err } = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [tool, '--check', '--maps=all', '--workers=4'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (exit) => resolve({ code: exit, out: stdout, err: stderr }));
});
assert.ok(code === 0 || code === 1, `the plan check exited ${code}: ${err.split('\n').filter((l) => l && !/warning|\[wreck-bake-plan\] [a-z_]+@/i.test(l)).slice(-6).join(' | ')}`);
const rows = new Map();
for (const line of out.split('\n')) {
  const match = /^([a-z_]+@[a-z-]+): (current|DRIFTED)(.*)$/.exec(line.trim());
  if (match) rows.set(match[1], match[2] + match[3]);
}
const expected = MAP_IDS.flatMap((id) => VARIANTS.map((variant) => `${id}@${variant}`)).sort();
assert.deepEqual([...rows.keys()].sort(), expected, 'every canonical map was recorded on both tiers and both terrains');
const drifted = [...rows.entries()].filter(([, status]) => !status.startsWith('current'));
const maps = [...new Set(drifted.map(([key]) => key.split('@')[0]))];
assert.deepEqual(drifted, [], `the wreck bake plan matches the tree (regenerate: node tools/wreck-bake-plan.mjs --write --maps=${maps.join(',')})`);
console.log(`wreckBakePlanDrift.selftest: ${MAP_IDS.length} maps × ${VARIANTS.length} (desktop, phone, assault, assault phone) match the committed plan`);
