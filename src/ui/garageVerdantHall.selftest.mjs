// Verdant Motor Pool's hall as a building (GA.05, 2026-10-14): the openings are cut through the sheeting and the
// upstand (no face inside a door or a clerestory), the glass faces the room, the shell stays inside its triangle and
// boot-time budgets, the wall map paints no ribs, seams or hazard band, and the stage builds the hall with the outdoor
// seeds' programs (no new shader program).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { buildVerdantHallParts, verdantHallShutter } from './garageVerdantHall.ts';
import { buildVerdantFloorAlbedo, VERDANT_FLOOR_POURS, VERDANT_FLOOR_TEXELS } from './garageVerdantFloor.ts';

const HW = 23, WALL_H = 10;
const started = performance.now();
const hall = buildVerdantHallParts(HW, WALL_H);
const buildMs = performance.now() - started;

// budgets: the whole hall under 40k triangles; the outside's apron, fields and woods under 4k
const parts = ['sheeting', 'roof', 'steel', 'concrete', 'glass', 'exterior'];
const triangles = Object.fromEntries(parts.map((name) => [name, hall[name].triangleCount]));
const total = Object.values(triangles).reduce((a, b) => a + b, 0);
assert.ok(total < 40_000, `the hall's ${total} triangles stay under 40k (${JSON.stringify(triangles)})`);
assert.ok(triangles.exterior < 4_000, 'the country outside stays cheap');
assert.ok(hall.stats.columns >= 20 && hall.stats.girts >= 40, 'columns at every truss line and girts between them');
assert.ok(hall.stats.skylights === 3 && hall.stats.openings >= 20, 'three roof lights and the wall openings');

// the openings are cut: no sheeting facet's centre lies inside the south wall's shutter (world x 0.9..6.5 at z = 23,
// y 0..4) or a south clerestory light (y 6.95..8.6 between the wind posts)
const sheeting = hall.sheeting.toGeometry({ uv: true, color: false });
const position = sheeting.getAttribute('position');
const index = sheeting.getIndex();
let inShutter = 0, inClerestory = 0, faces = 0;
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
for (let i = 0; i < index.count; i += 3) {
  a.fromBufferAttribute(position, index.getX(i)); b.fromBufferAttribute(position, index.getX(i + 1)); c.fromBufferAttribute(position, index.getX(i + 2));
  const m = a.clone().add(b).add(c).multiplyScalar(1 / 3);
  faces += 1;
  if (m.z > HW - 0.1) {
    if (m.x > 1.0 && m.x < 6.4 && m.y < 3.95) inShutter += 1;
    // the bay between the wind posts at x 9 and 0 (u 14..23): its light spans u 14.67..22.33, x 0.67..8.33
    if (m.x > 0.8 && m.x < 8.2 && m.y > 7.0 && m.y < 8.55) inClerestory += 1;
  }
}
assert.ok(faces > 5000, 'the sheeting is profiled geometry');
assert.equal(inShutter, 0, 'the roller shutter is an opening through the sheeting');
assert.equal(inClerestory, 0, 'the clerestory lights are openings through the sheeting');

// the glass faces the room: every pane's normal points inward from its wall (|x| or |z| falling)
const glass = hall.glass.toGeometry({ uv: false, color: false });
const gp = glass.getAttribute('position'), gn = glass.getAttribute('normal');
let outward = 0, panes = 0;
for (let i = 0; i < gp.count; i += 4) {
  const x = gp.getX(i), y = gp.getY(i), z = gp.getZ(i);
  if (y > WALL_H - 0.5) { // roof lights face down into the hall
    if (gn.getY(i) > -0.5) outward += 1;
  } else if (Math.abs(z) > HW - 0.3) {
    if (gn.getZ(i) * Math.sign(z) > 0) outward += 1;
  } else if (Math.abs(x) > HW - 0.3) {
    if (gn.getX(i) * Math.sign(x) > 0) outward += 1;
  }
  panes += 1;
}
assert.ok(panes > 50, 'the lights are glazed');
assert.equal(outward, 0, 'every pane faces the hall');

// boot cost: generous wall-clock bound (CI and loaded machines), the real cost is ~10 ms unloaded
assert.ok(buildMs < 1500, `the hall builds within the boot budget (${buildMs.toFixed(0)} ms)`);

// the stage: the hall replaces the painted wall planes, the wall map paints weathering only, no new program
const stage = await readFile(new URL('./garageStage.ts', import.meta.url), 'utf8');
assert.match(stage, /buildVerdantHallParts\(HW, WALL_H\)/, 'the stage builds the hall');
assert.doesNotMatch(stage, /new THREE\.PlaneGeometry\(HW \* 2, WALL_H\)/, 'no painted wall planes');
assert.doesNotMatch(stage, /hazard stripe strip on the wainscot|vertical corrugation ribs/, 'the wall map paints no ribs or hazard band');
assert.doesNotMatch(stage, /garage_verdant_roof_skylights/, 'the roof lights are openings, not planes');
assert.match(stage, /vertexColors: true, roughness: 0\.58, metalness: 0\.4/, 'the steel rides the vertex-colour program');
assert.doesNotMatch(stage, /emissive: 0x0d1115|emissive: 0x151b22|emissive: 0x171c22|emissive: 0x11151a/,
  'no cold navy fake-bounce emissive is left on the hall (wave 402)');

// GA.05 fixes (the garage critic panel, 2026-10-14): the floor is a finished slab on the graded floor program with the
// concrete detail relief, daylight lands on it under the roof lights and through the shutter, the shutter is two-thirds
// open, the glass is milky rather than cyan, the roof liner is grey, and no loose cable lies on the floor
const floorStarted = performance.now();
const floor = buildVerdantFloorAlbedo({ halfWidthM: HW, shutterX: verdantHallShutter(HW).x });
const floorMs = performance.now() - floorStarted;
assert.equal(floor.length, VERDANT_FLOOR_TEXELS * VERDANT_FLOOR_TEXELS * 4, 'the floor albedo covers the hall');
assert.ok(floorMs < 1500, `the floor albedo builds within the boot budget (${floorMs.toFixed(0)} ms)`);
{
  // saw-cut joints every pour: the texel row on a joint is darker than the row between
  const S = VERDANT_FLOOR_TEXELS, slab = S / VERDANT_FLOOR_POURS;
  const rowMean = (y) => { let sum = 0; for (let x = 0; x < S; x++) sum += floor[(y * S + x) * 4]; return sum / S; };
  const joint = Math.round(slab * 3), mid = Math.round(slab * 3.5);
  assert.ok(rowMean(joint) < rowMean(mid) * 0.85, `the pours meet at sawn joints (${rowMean(joint).toFixed(0)} vs ${rowMean(mid).toFixed(0)})`);
}
assert.deepEqual([...verdantHallShutter(HW).x].map((x) => +x.toFixed(2)), [0.9, 6.5], 'the shutter spans x 0.9..6.5');
assert.ok(verdantHallShutter(HW).openY >= 2.6, 'the shutter stands about two-thirds open');
assert.match(stage, /mesh\.name = 'garage_verdant_floor_finish';/, 'the hall lays its finished floor');
assert.match(stage, /garageHardstandGradedHook\(null, 0,\s*\{ uniform: garageHardstandDetailUniform\('concrete'\), kind: 'concrete' \}\)/,
  'the finished floor takes the concrete detail relief on the graded floor program');
assert.match(stage, /finish\.customProgramCacheKey = \(\) => GARAGE_HARDSTAND_PROGRAM_KEY;/, 'no new program for the floor');
assert.match(stage, /mesh\.name = 'garage_verdant_daylight_on_floor';/, 'daylight lands on the floor');
assert.match(stage, /map: soft, color: 0x[0-9a-f]{6}, transparent: true, depthWrite: false, blending: THREE\.AdditiveBlending,/,
  'the daylight is one map-only additive decal (the decals\' program)');
assert.doesNotMatch(stage, /\[\[2\.4, 0\.05, 11\.0\], \[1\.5, 0\.04, 8\.9\], \[0\.9, 0\.06, 6\.4\]\]/, 'no loose cable on the floor');
assert.doesNotMatch(stage, /color: 0x9fb2b6/, 'no cyan glass');
assert.doesNotMatch(stage, /function makeFloorTexture/, 'the smeared 11 px/m floor canvas is gone');

console.log(`garageVerdantHall.selftest: ${total} triangles (${JSON.stringify(triangles)}), openings cut, glass inward, built in ${buildMs.toFixed(0)} ms`);
