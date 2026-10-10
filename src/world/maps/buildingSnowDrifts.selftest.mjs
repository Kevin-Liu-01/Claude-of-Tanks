// The map-revival lane (round 2, 2026-10-09; gauntlet waves 319/320 on Whiteout): a snow map that asks for them banks
// drifts against its closed buildings — the lee drift on the downwind faces, a low ramp on the windward ones, the door's
// path dug clear, none into a carriageway, none round an open structure — and ploughs windrows along both edges of its
// roads inside the settlement, broken at crossings. Opt-in per map: only Whiteout asks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAP_IDS, getMapConfig } from './index.ts';
import { buildBuildingDrifts, buildPloughBanks } from './buildingSnowDrifts.ts';
import { SNOW_WIND_YAW } from './fieldWallDressing.ts';
import { structureCollisionOpenIds } from './structureCollision.ts';

const flat = { getHeightAt: () => 0 };
const tris = (list) => list.reduce((n, g) => n + (g.index ? g.index.count : g.attributes.position.count) / 3, 0);
const bounds = (list) => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y1 = -Infinity;
  for (const g of list) {
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 2]); z1 = Math.max(z1, p[i + 2]); y1 = Math.max(y1, p[i + 1]); }
  }
  return { x0, x1, z0, z1, y1 };
};

// 1. opt-in: Whiteout only, and only on a snow map
for (const id of MAP_IDS) {
  const props = getMapConfig(id).props ?? {};
  const asks = !!(props.buildingDrifts || props.ploughBanks);
  assert.equal(asks, id === 'whiteout', `${id}: ${id === 'whiteout' ? 'drifts and windrows' : 'none (the protected snow maps keep their look)'}`);
  if (asks) assert.ok(props.snowCap || id === 'winter', `${id}: a snow map`);
}

// 2. a house square to the wind: a lee drift on its downwind side (the big one), a ramp on the windward side, all of it
// on the ground and under 1.2 m; deterministic by place
const dx = Math.cos(SNOW_WIND_YAW), dz = -Math.sin(SNOW_WIND_YAW);
const rot = Math.atan2(dx, dz); // the house's local +z (its front) looks downwind
const house = { x: 40, z: -20, w: 10, d: 8, rot, kind: 'cottage' };
const a = buildBuildingDrifts(flat, [house], { open: structureCollisionOpenIds });
const b = buildBuildingDrifts(flat, [house], { open: structureCollisionOpenIds });
assert.ok(a.length >= 4, 'drifts round the house');
assert.deepEqual(a.map((g) => Array.from(g.attributes.position.array)), b.map((g) => Array.from(g.attributes.position.array)), 'deterministic');
const box = bounds(a);
assert.ok(box.y1 > 0.3 && box.y1 < 1.2, `a lee drift a house's size (${box.y1.toFixed(2)} m)`);
// how far the snow reaches out from the house, downwind against upwind
let lee = 0, windward = 0;
for (const g of a) {
  const p = g.attributes.position.array;
  for (let i = 0; i < p.length; i += 3) {
    const along = (p[i] - house.x) * dx + (p[i + 2] - house.z) * dz;
    lee = Math.max(lee, along); windward = Math.max(windward, -along);
  }
}
assert.ok(lee > windward + 0.8, `the lee drift reaches further (${lee.toFixed(1)} vs ${windward.toFixed(1)} m)`);
// the door's path: the front face's middle carries no drift
const fx = house.x + Math.sin(rot) * (house.d / 2 + 0.5), fz = house.z + Math.cos(rot) * (house.d / 2 + 0.5);
for (const g of a) {
  const p = g.attributes.position.array;
  for (let i = 0; i < p.length; i += 3) assert.ok(Math.hypot(p[i] - fx, p[i + 2] - fz) > 0.9, 'the dug path to the door is clear');
}

// 3. none round an open structure, none into a carriageway
assert.equal(buildBuildingDrifts(flat, [{ ...house, kind: 'containerRow' }], { open: structureCollisionOpenIds }).length, 0, 'no drift rings a container row');
const roadAt = (x, z) => Math.abs(z - house.z); // a road along x through the house's middle line: every face's reach is in it
assert.ok(buildBuildingDrifts(flat, [house], { open: structureCollisionOpenIds, roadDist: roadAt }).length < a.length, 'a face reaching into the road has none');

// 4. windrows: both sides of a straight road inside the area, broken in runs, none outside it, none nearer another road
const road = [[-100, 0], [100, 0]];
const area = { x0: -60, x1: 60, z0: -40, z1: 40 };
const rd = (x, z) => Math.abs(z);
const banks = buildPloughBanks(flat, [road], area, rd);
assert.ok(banks.length >= 8, 'windrows along the road');
const bb = bounds(banks);
assert.ok(bb.x0 > area.x0 - 2 && bb.x1 < area.x1 + 2, 'only inside the ploughed area');
assert.ok(bb.y1 > 0.3 && bb.y1 < 0.9, `a bank half a metre high (${bb.y1.toFixed(2)})`);
for (const g of banks) {
  const p = g.attributes.position.array;
  for (let i = 0; i < p.length; i += 3) assert.ok(Math.abs(p[i + 2]) > 3.85 - 0.2, 'no windrow on the carriageway');
}
const crossing = (x, z) => Math.min(Math.abs(z), Math.abs(x));
const broken = buildPloughBanks(flat, [road], area, crossing);
for (const g of broken) {
  const p = g.attributes.position.array;
  for (let i = 0; i < p.length; i += 3) assert.ok(Math.abs(p[i]) > 3.0, 'broken where a crossing road comes in');
}
assert.ok(tris(banks) < 12000, `windrows cheap (${tris(banks)} triangles for 240 m of bank)`);

// 5. the props owner draws them on the walls' drift mesh, only where the map asks
const src = readFileSync(new URL('../props.ts', import.meta.url), 'utf8');
assert.ok(src.includes('if (snowCap && (P.buildingDrifts || P.ploughBanks)) {'), 'opt-in on a snow map');
assert.ok(src.indexOf('buildBuildingDrifts(heightField') < src.indexOf("mesh.name = 'props-snow-drifts';"), 'joined to the walls\' drift mesh');

console.log(JSON.stringify({ test: 'buildingSnowDrifts', houseDrifts: a.length, houseTris: tris(a), banks: banks.length, bankTris: tris(banks) }));
