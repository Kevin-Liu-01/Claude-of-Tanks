import assert from 'node:assert/strict';
import {
  scanEdgeWater, resolveSeaOpenings, seaOpeningWeight, dominantSeaOpening, buildSeaApronGeometry,
  ringAngleToAzimuthDeg, SEA_APRON_OUTER_RADIUS_M, SEA_APRON_OVERLAP_M,
} from './edgeWater.ts';
import { buildOutlandWaterGeometry, seaSectorBlend, coastReachAlong } from './edgeWater.ts';
import { createHeightField } from './terrain.ts';
import { getMapConfig } from './maps/index.ts';
import { waterContactProfile } from './waterContact.ts';

// Round 40 (2026-09-22, AAA map program check 13 "water at the edge: same level and shader beyond").
// --- pure geometry -------------------------------------------------------------------------------------------------
assert.equal(ringAngleToAzimuthDeg(0), 90, '+x is east');
assert.equal(ringAngleToAzimuthDeg(Math.PI / 2), 0, '+z is north');
assert.equal(ringAngleToAzimuthDeg(Math.PI), 270, '-x is west');

// a synthetic square: water where a predicate says, surface = floor + depth
const synthetic = (wet, { size = 1024, floor = -5.2, depth = 0.7 } = {}) => ({
  size,
  getWaterMaskAt: (x, z) => (wet(x, z) ? 1 : 0),
  getHeightAt: (x, z) => (wet(x, z) ? floor : 2.5),
  getWaterDepthAt: (x, z) => (wet(x, z) ? depth : 0),
});
{
  // a bay on the east edge between z = -200 and z = +200
  const openings = scanEdgeWater(synthetic((x, z) => x > 400 && Math.abs(z) < 200));
  assert.equal(openings.length, 1, 'one east opening');
  const [east] = openings;
  assert.ok(Math.abs(east.azimuthDeg - 90) < 0.5, `centred east: ${east.azimuthDeg}`);
  assert.equal(east.level, -5.2, 'level = the flattened floor (the ring continues the bed)');
  assert.equal(east.source, 'edge');
  const spanHalfDeg = Math.atan2(200, 492) * 180 / Math.PI;
  assert.ok(east.widthDeg / 2 > spanHalfDeg && east.widthDeg / 2 < spanHalfDeg * 1.5 + 2, `shoulders extend past the run: ${east.widthDeg}`);
  // the run itself is fully open; the shore 30° away is land
  assert.equal(seaOpeningWeight(0, openings), 1);
  assert.equal(seaOpeningWeight(Math.atan2(190, 492), openings), 1, 'the end of the run is still fully open');
  assert.equal(seaOpeningWeight(Math.PI / 2, openings), 0, 'north is land');
  assert.equal(dominantSeaOpening(Math.PI, openings), null, 'west is land');
}
assert.deepEqual(scanEdgeWater(synthetic(() => false)), [], 'a dry square derives nothing');
assert.deepEqual(scanEdgeWater(synthetic((x, z) => x > 400 && Math.abs(z) < 12)), [], 'a 24 m creek is below the 40 m minimum run');
assert.deepEqual(scanEdgeWater(synthetic((x, z) => x > 500 && Math.abs(z) < 200)), [], 'a puddle in the last 12 m before the red line is the clamp fringe, not a sea');
{
  // two separate bays on the north edge → two openings; a wet north-east corner joins the east and north runs
  const two = scanEdgeWater(synthetic((x, z) => z > 400 && (Math.abs(x - 300) < 80 || Math.abs(x + 300) < 80)));
  assert.equal(two.length, 2, 'two north bays');
  const corner = scanEdgeWater(synthetic((x, z) => (x > 400 && z > 300) || (z > 400 && x > 300)));
  assert.equal(corner.length, 1, 'a wet corner is one shoreline');
  assert.ok(corner[0].azimuthDeg > 30 && corner[0].azimuthDeg < 60, `north-east: ${corner[0].azimuthDeg}`);
}
{
  // the authored opening wins over the derived one it overlaps and both take the map's water colour
  const authored = { azimuthDeg: 90, widthDeg: 118, level: -4 };
  const field = synthetic((x, z) => x > 400 && Math.abs(z) < 200);
  const resolved = resolveSeaOpenings(authored, field, 'coastal');
  assert.equal(resolved.length, 1); assert.equal(resolved[0].source, 'authored'); assert.equal(resolved[0].widthDeg, 118);
  assert.equal(resolved[0].colorHex, waterContactProfile('coastal').color, 'the aperture is this map\'s deep water, not a grey');
  assert.equal(resolveSeaOpenings(undefined, null, 'coastal').length, 0);
  const west = resolveSeaOpenings(authored, synthetic((x, z) => x < -400 && Math.abs(z) < 150), 'saltwind');
  assert.equal(west.length, 2, 'a derived west bay stands beside the authored east one');
  assert.equal(west[1].colorHex, waterContactProfile('saltwind').color);
}
{
  const geometry = buildSeaApronGeometry([{ azimuthDeg: 90, widthDeg: 118, level: -4 }], 512, undefined, { depthM: 0.72 });
  assert.ok(geometry, 'an apron fan');
  const position = geometry.getAttribute('position');
  let minR = Infinity, maxR = 0;
  for (let i = 0; i < position.count; i++) {
    assert.ok(Math.abs(position.getY(i) - -3.28) < 1e-6, 'every apron vertex floats the water depth above the floor');
    const r = Math.hypot(position.getX(i), position.getZ(i));
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    assert.ok(Math.max(Math.abs(position.getX(i)), Math.abs(position.getZ(i))) >= 512 - SEA_APRON_OVERLAP_M - 1e-6, 'the apron reaches only its 12 m overlap inside the square');
  }
  assert.ok(minR < 512 && minR > 480 && Math.abs(maxR - SEA_APRON_OUTER_RADIUS_M) < 1e-3, `spans the seam overlap to the outer radius: ${minR}..${maxR}`);
  assert.equal(geometry.getIndex().count % 3, 0);
  // every apron triangle faces up (the double-sided water material would light a downward face from below)
  const idx = geometry.getIndex(); const tri = [0, 0, 0];
  for (let t = 0; t < idx.count; t += 3) {
    for (let k = 0; k < 3; k++) tri[k] = idx.getX(t + k);
    const ax = position.getX(tri[0]), az = position.getZ(tri[0]);
    const ux = position.getX(tri[1]) - ax, uz = position.getZ(tri[1]) - az, vx = position.getX(tri[2]) - ax, vz = position.getZ(tri[2]) - az;
    assert.ok(uz * vx - ux * vz > 0, `triangle ${t / 3} winds counter-clockwise seen from above`);
  }
  assert.equal(buildSeaApronGeometry([], 512), null, 'no openings, no apron');
  geometry.dispose();
}

// --- the real battlefields -----------------------------------------------------------------------------------------
// Coastal: the authored east bay covers the water that reaches the east edge, so it stays the single opening.
const coastal = createHeightField(1337, getMapConfig('coastal'));
const coastalDerived = scanEdgeWater(coastal);
assert.ok(coastalDerived.length >= 1 && coastalDerived.every((o) => Math.abs(o.azimuthDeg - 90) < 59), `Coastal's water reaches only its east edge: ${JSON.stringify(coastalDerived)}`);
const coastalResolved = resolveSeaOpenings(getMapConfig('coastal').horizon.seaOpening, coastal, 'coastal');
assert.equal(coastalResolved.length, 1, 'the authored aperture absorbs the derived east run');
assert.equal(coastalResolved[0].source, 'authored');
// Saltwind: the hooked bay meets the west edge; until round 40 the ring showed a beach past it.
const saltwind = createHeightField(1337, getMapConfig('saltwind'));
const saltwindOpenings = resolveSeaOpenings(getMapConfig('saltwind').horizon?.seaOpening, saltwind, 'saltwind');
assert.ok(saltwindOpenings.length >= 1, 'Saltwind derives a sea opening');
const west = saltwindOpenings.find((o) => Math.abs(o.azimuthDeg - 270) < 45);
assert.ok(west, `a west opening: ${JSON.stringify(saltwindOpenings)}`);
assert.ok(Math.abs(west.level - -7.8) < 0.05, `the bay's authored floor: ${west.level}`);
assert.ok(west.widthDeg > 40 && west.widthDeg < 150, `the bay spans a good part of the west edge: ${west.widthDeg}`);
// Verdant has no water at its edge: no opening, no apron, ring unchanged.
const verdant = createHeightField(1337, getMapConfig('verdant'));
assert.deepEqual(resolveSeaOpenings(getMapConfig('verdant').horizon?.seaOpening, verdant, 'verdant'), []);
// Round 47 (2026-09-23, owner: "evident right angle with shore and water at the border"): the apron is a grid over the
// outland whose cells follow the map's own bay contour near the square and the derived sector only 120–360 m out.
{
  // a bay disc centred past the east edge: wet inside r 190 of (560, 40), a straight shore elsewhere
  const bay = (x, z) => { const d = Math.hypot(x - 560, z - 40) / 190; return d < 1 ? { wetness: 1 - Math.max(0, (d - 0.8) / 0.16), level: -4 } : null; };
  const reach = coastReachAlong({ azimuthDeg: 90, widthDeg: 60, level: -4 }, bay, 512);
  assert.ok(reach > 180 && reach < 240, `the bay contour reaches ${reach} m past the east edge (disc to x 750, waterline at 0.88 r)`);
  assert.deepEqual(seaSectorBlend(0), [0, 40], 'no contour: the sector opens within 40 m');
  assert.deepEqual(seaSectorBlend(200), [140, 260], 'a 200 m bay reach: the sector fades in from 140 m and is open at 260 m');
  const east = [{ azimuthDeg: 90, widthDeg: 60, level: -4, shoulder: 0.58, source: 'authored', coastReachM: reach }];
  const grid = buildOutlandWaterGeometry(east, bay, 512, 1400, { cellM: 16, depthM: 0.72 });
  assert.ok(grid, 'an outland grid');
  const position = grid.getAttribute('position');
  const cellsAt = (x, z) => { let hit = 0; for (let i = 0; i < position.count; i++) if (Math.abs(position.getX(i) - x) <= 8 && Math.abs(position.getZ(i) - z) <= 8) hit++; return hit; };
  assert.ok(cellsAt(560, 40) > 0, 'the bay centre past the edge is water');
  assert.ok(cellsAt(600, -420) === 0, 'the shore beside the bay stays land within the coast band (the sector is not open yet)');
  assert.ok(cellsAt(900, 0) > 0, 'the open sea beyond the bay reach is carried by the sector');
  assert.ok(cellsAt(900, -560) === 0, 'outside the sector shoulders: land');
  for (let i = 0; i < position.count; i++) assert.ok(Math.abs(position.getY(i) - (-4 + 0.72)) < 1e-6, 'every apron vertex floats the water depth above the bay level');
  for (let i = 0; i < position.count; i++) assert.ok(Math.max(Math.abs(position.getX(i)), Math.abs(position.getZ(i))) >= 512 - 1e-6, 'the grid starts on the red line: no strip renders the water twice');
  const index = grid.getIndex();
  for (let tri = 0; tri < index.count; tri += 3) {
    const [a, b, c] = [index.getX(tri), index.getX(tri + 1), index.getX(tri + 2)];
    const ux = position.getX(b) - position.getX(a), uz = position.getZ(b) - position.getZ(a);
    const vx = position.getX(c) - position.getX(a), vz = position.getZ(c) - position.getZ(a);
    assert.ok(uz * vx - ux * vz > 0, `triangle ${tri / 3} winds counter-clockwise seen from above`);
  }
  // without a contour query the fan is the fallback
  const fan = buildOutlandWaterGeometry(east, null, 512, 1400, { depthM: 0.72 });
  assert.ok(fan && fan.getAttribute('position').count < position.count, 'no contour: the sector fan');
  assert.equal(buildOutlandWaterGeometry([], bay), null, 'no openings: no apron');
  grid.dispose(); fan.dispose();
}

console.log(`edgeWater.selftest: synthetic scans, authored precedence, apron fan, Coastal ${coastalResolved.length} opening (authored), Saltwind west ${west.azimuthDeg}°/${west.widthDeg}° at ${west.level} m, Verdant none PASS`);
