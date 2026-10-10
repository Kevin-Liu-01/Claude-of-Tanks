// Drift receipt for the wreck bake plan (src/world/maps/wreckBakePlan.ts, the time-to-battle lane, 2026-10-08), in the
// manner of server/collisionManifestDrift.selftest.mjs. The world build starts each map's planned wreck bakes beside the
// terrain and vegetation (src/world/wreckBakePrefetch.ts); a plan the tree has moved past still builds the same world —
// a request it does not hold bakes on demand — but loses the time it was there to save, silently. So every map's
// requests are recorded again here on both tiers and both terrains (tools/wreck-bake-plan.mjs --check: the browser's
// build in Node, a child process per tier and share of the maps) and each of the four keys a map resolves must match the
// committed plan. On a failure, regenerate the named maps: node tools/wreck-bake-plan.mjs --write --maps=<ids>.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MAP_IDS } from './maps/mapIds.ts';

const tool = fileURLToPath(new URL('../../tools/wreck-bake-plan.mjs', import.meta.url));
const VARIANTS = ['desktop', 'mobile', 'assault', 'assault-mobile'];

const { code, out, err } = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [tool, '--check', '--maps=all'], { stdio: ['ignore', 'pipe', 'pipe'] });
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
