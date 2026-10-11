// The map-revival lane (round 2b, 2026-10-10; gauntlet wave 335 on Whiteout: the round-2 banks read as "free-standing
// white lumps or flat hard-edged decal ovals, brighter than the ground and unblended at the base"): a snow map that asks
// for them banks lee drifts against its closed buildings and ploughs windrows along its roads, each a fillet of the
// ground drawn with the terrain's own material — the beds' attribute set (position, fold, normal), its toe sunk under the
// drawn ground with the ground's normal, the windward and along-wind faces scoured bare, the tails wrapping past the
// corners, no bank round an open structure or a landmark the map doesn't allow, none into a carriageway. Opt-in: Whiteout.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAP_IDS, getMapConfig } from './index.ts';
import { buildBuildingDrifts, buildPloughBanks } from './buildingSnowDrifts.ts';
import { SNOW_WIND_YAW } from './fieldWallDressing.ts';
import { structureCollisionOpenIds } from './structureCollision.ts';

const flat = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), _foldAt: () => 0.25 };
const tris = (list) => list.reduce((n, g) => n + g.index.count / 3, 0);
const opts = (extra = {}) => ({ open: structureCollisionOpenIds, landmarkAllow: new Set(['moduleTrain', 'radomeTower', 'jamesway']), ...extra });

// 1. opt-in: Whiteout only, with the closed-shell landmark list
for (const id of MAP_IDS) {
  const props = getMapConfig(id).props ?? {};
  const asks = !!(props.buildingDrifts || props.ploughBanks);
  assert.equal(asks, id === 'whiteout', `${id}: ${id === 'whiteout' ? 'drifts and windrows' : 'none'}`);
  if (asks) {
    assert.ok(props.snowCap, `${id}: a snow map`);
    assert.deepEqual([...props.driftLandmarks].sort(), ['jamesway', 'moduleTrain', 'radomeTower'], 'the closed shells of its set pieces');
  }
}

// 2. a house with one face square to the wind's lee: one lee drift (the windward and the along-wind faces scoured bare)
const dx = Math.cos(SNOW_WIND_YAW), dz = -Math.sin(SNOW_WIND_YAW);
const rot = Math.atan2(dx, dz); // the house's local +z face looks downwind
const house = { x: 40, z: -20, w: 10, d: 8, rot, kind: 'cottage' };
const a = buildBuildingDrifts(flat, [house], opts());
const b = buildBuildingDrifts(flat, [house], opts());
assert.equal(a.length, 1, 'one lee drift: the windward and the along-wind faces carry none');
assert.deepEqual(a.map((g) => Array.from(g.getAttribute('position').array)), b.map((g) => Array.from(g.getAttribute('position').array)), 'deterministic');
const g = a[0];
// the beds' attribute set: drawn with the terrain material and merged with the turf by cell
assert.deepEqual(Object.keys(g.attributes).sort(), ['fold', 'normal', 'position'], 'position, fold and normal only (the beds\' set)');
assert.ok(g.index, 'indexed, as the beds are');
assert.ok(g.getAttribute('fold').normalized && g.getAttribute('fold').array instanceof Int8Array, 'the fold byte, normalized');
const p = g.getAttribute('position').array, n = g.getAttribute('normal').array;
let top = 0, lee = 0, windward = 0, below = 0, toeUp = 0, toes = 0;
for (let i = 0; i < p.length; i += 3) {
  top = Math.max(top, p[i + 1]);
  const along = (p[i] - house.x) * dx + (p[i + 2] - house.z) * dz;
  lee = Math.max(lee, along); windward = Math.max(windward, -along);
  if (p[i + 1] < 0) { below++; toeUp += n[i + 1]; toes++; }
}
assert.ok(top > 0.4 && top < 1.2, `a lee drift a house's size (${top.toFixed(2)} m)`);
assert.ok(lee > house.d / 2 + 3, `a long tail downwind (${lee.toFixed(1)} m from the centre)`);
assert.ok(windward < house.d / 2 + 0.2, 'nothing on the windward side');
assert.ok(below > 0 && toeUp / toes > 0.99, 'the toe sunk under the ground, its normal the ground\'s');
// the tails wrap past the corners: the drift runs wider than the face
let minA = Infinity, maxA = -Infinity;
const tx = Math.cos(rot), tz = -Math.sin(rot); // the house's local +x
for (let i = 0; i < p.length; i += 3) { const u = (p[i] - house.x) * tx + (p[i + 2] - house.z) * tz; minA = Math.min(minA, u); maxA = Math.max(maxA, u); }
assert.ok(maxA - minA > house.w + 2, `the tails wrap past the corners (${(maxA - minA).toFixed(1)} m against a ${house.w} m face)`);

// 3. none round an open structure, none round a landmark the map doesn't allow, none into a carriageway
assert.equal(buildBuildingDrifts(flat, [{ ...house, kind: 'containerRow' }], opts()).length, 0, 'no drift rings a container row');
assert.equal(buildBuildingDrifts(flat, [{ ...house, kind: undefined, landmark: 'guyedMast' }], opts()).length, 0, 'no bank round a mast');
assert.equal(buildBuildingDrifts(flat, [{ ...house, kind: undefined, landmark: 'jamesway' }], opts()).length, 1, 'a Jamesway hut is banked');
const roadDownwind = (x, z) => Math.abs((x - house.x) * dx + (z - house.z) * dz - 6); // a road 6 m downwind of the centre
assert.equal(buildBuildingDrifts(flat, [house], opts({ roadDist: roadDownwind })).length, 0, 'no drift into a carriageway');

// 4. windrows: both edges of a straight road inside the area, a cut face at the edge, none on the carriageway or outside
const road = [[-100, 0], [100, 0]];
const area = { x0: -60, x1: 60, z0: -40, z1: 40 };
const banks = buildPloughBanks(flat, [road], area, (x, z) => Math.abs(z));
assert.ok(banks.length >= 8, `windrows along the road (${banks.length})`);
let bx0 = Infinity, bx1 = -Infinity, btop = 0, onRoad = 0;
for (const w of banks) {
  assert.deepEqual(Object.keys(w.attributes).sort(), ['fold', 'normal', 'position']);
  const q = w.getAttribute('position').array;
  for (let i = 0; i < q.length; i += 3) {
    bx0 = Math.min(bx0, q[i]); bx1 = Math.max(bx1, q[i]); btop = Math.max(btop, q[i + 1]);
    if (Math.abs(q[i + 2]) < 3.85 && q[i + 1] > 0.02) onRoad++;
  }
}
assert.ok(bx0 > area.x0 - 3 && bx1 < area.x1 + 3, 'only inside the ploughed area');
assert.ok(btop > 0.35 && btop < 0.95, `a windrow 0.5-0.8 m high (${btop.toFixed(2)})`);
assert.equal(onRoad, 0, 'nothing standing on the carriageway');
const crossing = buildPloughBanks(flat, [road], area, (x, z) => Math.min(Math.abs(z), Math.abs(x)));
for (const w of crossing) {
  const q = w.getAttribute('position').array;
  for (let i = 0; i < q.length; i += 3) if (q[i + 1] > 0.05) assert.ok(Math.abs(q[i]) > 3.0, 'broken where a crossing road comes in');
}
assert.ok(tris(banks) < 14000, `windrows cheap (${tris(banks)} triangles for 240 m of berm)`);

// 5. the props owner merges them with the turf into the beds' cells (the terrain material), on the desktop, where asked
const src = readFileSync(new URL('../props.ts', import.meta.url), 'utf8');
assert.ok(src.includes('if (snowCap && !mobileProps && (P.buildingDrifts || P.ploughBanks)) {'), 'opt-in on a snow map\'s desktop');
const hook = src.indexOf('wallDressing.turfs.push(...buildBuildingDrifts(heightField');
assert.ok(hook > 0 && hook < src.indexOf('if (wallDressing.turfs.length) {'), 'merged with the turf into the beds\' cells');

console.log(JSON.stringify({ test: 'buildingSnowDrifts', drift: { tris: tris(a), top: +top.toFixed(2), tail: +lee.toFixed(1) }, banks: banks.length, bankTris: tris(banks) }));
