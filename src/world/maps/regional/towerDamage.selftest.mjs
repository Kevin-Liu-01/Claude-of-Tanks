// towerDamage.selftest.mjs — the tower reader's coverage (props census #9, E13, lane B 2026-10-15).
//
// The shell and shaft readings leave the towers out (damage.ts NOT_SHELLS, NOT_SHAFTS), so a tower builder that
// records no bodies fell to the default kit's bounding-box spalls. Every placed tower kind of the high-rise family
// (ruinspires, blackglass, skybridge) records its bodies (house.ts recordBody, in storey bands): each must read through
// the multi-body house route (one anatomy body per recorded body, the tallest in bands), and its collapse must draw.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARCHITECTURE_STYLES, buildRegionalParts, regionalKitPlanOf } from './index.ts';
import { streamFrom } from './geometry.ts';
import { damageSeed } from '../../destructionKit.ts';
import { createStructureDamageSeam, describeStructure } from '../../structureDamageSeam.ts';
import '../../destructionDefaultKit.ts';

const src = readFileSync(new URL('./regionalArchitecture.selftest.mjs', import.meta.url), 'utf8');
const INFO = eval('(' + src.slice(src.indexOf('const INFO = {') + 13, src.indexOf('};', src.indexOf('const INFO = {')) + 1) + ')');

/** style, builder, the pose that picks its variant (a district, a valley), the bodies it records at least */
const KINDS = [
  ['sarajevo', 'arcology', null, 3], ['sarajevo', 'needletower', null, 2], ['sarajevo', 'terracetower', null, 2],
  ['sarajevo', 'parkingdeck', null, 2], ['sarajevo', 'broadcasttower', null, 4],
  ['sarajevo', 'megatower', { x: 0, z: 0 }, 2], ['sarajevo', 'megatower', { x: 0, z: 200 }, 2],
  ['glencanyon', 'arcology', null, 2], ['glencanyon', 'needletower', null, 1],
  ['shanghai', 'arcology', null, 2], ['shanghai', 'needletower', null, 2], ['shanghai', 'megatower', null, 2],
  ['shanghai', 'terracetower', null, 2], ['shanghai', 'broadcasttower', null, 2], ['shanghai', 'parkingdeck', null, 1],
  ['shanghai', 'civichall', { x: 0, z: 0 }, 1], ['shanghai', 'civichall', { x: 0, z: 200 }, 3],
];

function writers() {
  let v = 0, t = 0, n = 0;
  return {
    mesh: { capacity: 60000, get vertices() { return v; }, begin() { return true; }, vertex() { return v++; }, triangle() { t++; }, end() {} },
    pieces: { capacity: 160, get count() { return n; }, push() { n++; return true; } }, tris: () => t, fallAxis: [1, 0.3],
  };
}

const rows = [];
for (const [sid, id, pose, min] of KINDS) {
  const style = ARCHITECTURE_STYLES.find((s) => s.id === sid);
  const [w, d, h] = INFO[id];
  const parts = buildRegionalParts(style, { structureId: id, info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
    wallBucket: 'stone', rng: streamFrom(11), variant: streamFrom(80), mapId: 'selftest', snowCap: false, tier: 'desktop', ...(pose ?? {}) }, streamFrom(38));
  const plan = regionalKitPlanOf(parts);
  const name = `${sid}:${id}${pose ? `@z${pose.z}` : ''}`;
  const houses = plan?.houses?.length ?? 0;
  assert.ok(houses >= min, `${name} records ${houses} bodies for the damage reading (at least ${min}: recordBody in its builder)`);
  const anatomy = describeStructure({ structureIdx: 1, mapId: 'selftest', builder: id, style: sid, parts, w, d, h, placement: { x: 0, y: 0, z: 0, yaw: 0 },
    massClass: 'house', seed: 4242, kitPlan: plan });
  const bodies = [anatomy, ...(anatomy.kitPlan?.bodies ?? [])];
  assert.equal(bodies.length, houses, `${name} reads one damage body per recorded body (${bodies.length} of ${houses})`);
  assert.ok(bodies.some((b) => (b.storeys?.length ?? 0) >= 2), `${name}: its tallest body reads in storey bands`);
  const wr = writers();
  createStructureDamageSeam(1, id, sid, anatomy, []).collapse(damageSeed(4242, 3), wr);
  assert.ok(wr.tris() > 0, `${name}: its collapse draws`);
  rows.push(`${name} ${bodies.length}`);
}
console.log(`tower damage: ${rows.length} tower kinds read through their recorded bodies (${rows.join(', ')})`);
