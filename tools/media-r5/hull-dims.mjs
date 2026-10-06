#!/usr/bin/env node
// Each media tank's contact rectangle (src/sim/tankContactShape.ts tankContactRect, the one the Studio's crush plan and
// the battle's collider read): its half length and half width, so the planner's route and lens checks hold every hull
// to its own size — a Challenger 3 prototype runs 9.2 m, a Hetman II stands 4.6 m wide — instead of one long MBT's.
// Writes tools/media-r5/hull-dims.json for every tank the site fifty stages (heroes, allies and foes).
//   node tools/media-r5/hull-dims.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

await import('../../src/vehicles/fleetRegistration.ts');
const { getSpec } = await import('../../src/vehicles/specs.ts');
const { tankContactRect } = await import('../../src/sim/tankContactShape.ts');
const { SHOTS, siteScene } = await import('./site50.mjs');

const ids = new Set();
for (const shot of SHOTS) for (const a of siteScene(shot).actors) ids.add(a.id);
const dims = {};
for (const id of [...ids].sort()) {
  const rect = tankContactRect(getSpec(id));
  dims[id] = [+rect.halfLength.toFixed(3), +rect.halfWidth.toFixed(3)];
}
const out = join(dirname(fileURLToPath(import.meta.url)), 'hull-dims.json');
writeFileSync(out, `${JSON.stringify(dims, null, 1)}\n`);
console.log(`[hull-dims] ${Object.keys(dims).length} tanks -> ${out}`);
