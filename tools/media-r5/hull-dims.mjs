#!/usr/bin/env node
// Each media tank's contact rectangle (src/sim/tankContactShape.ts tankContactRect, the one the Studio's crush plan and
// the battle's collider read): its half length and half width, so the planner's route and lens checks hold every hull
// to its own size — a Challenger 3 prototype runs 9.2 m, a Hetman II stands 4.6 m wide — instead of one long MBT's.
// Writes tools/media-r5/hull-dims.json for every tank the site takes stage (the fifty, the owner's nine and the fleet's;
// heroes, allies and foes).
// Since 2026-10-08 (composition wave c3: barrels cut by the frame's edge in a third of the frames) each entry also holds
// the muzzle's reach from the hull's centre with the turret ahead (the spec's overall length less half the hull's, never
// short of the hull's own nose) and the silhouette's height: [halfLength, halfWidth, muzzleReach, heightM].
//   node tools/media-r5/hull-dims.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

await import('../../src/vehicles/fleetRegistration.ts');
const { getSpec } = await import('../../src/vehicles/specs.ts');
const { tankContactRect } = await import('../../src/sim/tankContactShape.ts');
const { FLEET, SHOTS, OWNER_NINE, siteScene } = await import('./site50.mjs');
const { resolveTankId } = await import('../../src/vehicles/tankIdAliases.ts');

const ids = new Set();
for (const shot of [...SHOTS, ...OWNER_NINE, ...FLEET]) for (const a of siteScene(shot).actors) ids.add(a.id);
const dims = {};
// keyed as the scenes write their ids (schema 1, unstamped), which is how the route and lens checks look them up; the
// spec is today's, read through the alias layer (268: aft10_x and the other renamed ids stopped the table at 255 tanks)
for (const id of [...ids].sort()) {
  const spec = getSpec(resolveTankId(id, 1)), rect = tankContactRect(spec), d = spec.dims ?? {};
  const reach = Math.max(rect.halfLength, (d.overallLengthM ?? 0) - (d.hullLengthM ?? 0) / 2);
  dims[id] = [+rect.halfLength.toFixed(3), +rect.halfWidth.toFixed(3), +reach.toFixed(3), +(d.silhouetteHeightM ?? d.heightM ?? 2.4).toFixed(3)];
}
const out = join(dirname(fileURLToPath(import.meta.url)), 'hull-dims.json');
writeFileSync(out, `${JSON.stringify(dims, null, 1)}\n`);
console.log(`[hull-dims] ${Object.keys(dims).length} tanks -> ${out}`);
