import assert from 'node:assert/strict';
import { HARDSTAND_PAINT_SPILL_M, createHardstandVegetationExclusion, stampHardstandRoadGrids, stampHardstandRoadMask } from './hardstandSurface.ts';
import { createHeightField } from './terrain.ts';
import airfield from './maps/airfield.ts';

const size = 65, mapSize = 256;
const distances = new Float32Array(size * size).fill(1000);
const heights = new Float32Array(size * size).fill(10);
const distanceBuffer = distances.buffer, heightBuffer = heights.buffer;
const strip = { x: 0, z: 0, width: 36, length: 180, level: 3, grade: 0.005 };
stampHardstandRoadGrids([strip], distances, heights, size, mapSize, () => 10);
assert.equal(distances.buffer, distanceBuffer); assert.equal(heights.buffer, heightBuffer);
for (let z = -80; z <= 80; z += 4) for (let x = -16; x <= 16; x += 4) {
  const at = ((z + 128) / 4) * size + (x + 128) / 4;
  assert.ok(distances[at] < 3.8);
  assert.ok(Math.abs(heights[at] - (3 + z * 0.005)) < 1e-6,
    'the entire pavement width is one plane, not two flattened wheel lanes');
}
// 2026-10-02 (the apron bank law, tools/hardstand-banks.mjs): an authored grade tilts an apron with its hillside up to
// 8 %, grade 'road' fits the crossing road's grade up to 8 % (an omitted grade still fits it within 1 %), and an
// authored bankM widens the band over which the ground leaves the apron's plane; without one, the band is the road
// blend's own.
{
  const cell = (x, z) => ((z + 128) / 4) * size + (x + 128) / 4;
  const stamp = (stand) => {
    const d = new Float32Array(size * size).fill(1000), h = new Float32Array(size * size).fill(10);
    stampHardstandRoadGrids([stand], d, h, size, mapSize, () => 10);
    return { d, h };
  };
  const tilted = stamp({ x: 0, z: 0, width: 36, length: 120, level: 3, grade: 0.05 });
  const held = stamp({ x: 0, z: 0, width: 36, length: 120, level: 3, grade: 0.3 });
  // 'road' fits the crossing road's own grade up to 8 %; omitted holds that fit to 1 %
  const roadAt = (x, z) => 10 + z * 0.06;
  const stampOn = (stand) => {
    const d = new Float32Array(size * size).fill(1000), h = new Float32Array(size * size).fill(10);
    stampHardstandRoadGrids([stand], d, h, size, mapSize, roadAt);
    return h;
  };
  const followed = stampOn({ x: 0, z: 0, width: 36, length: 120, grade: 'road' });
  const fitted = stampOn({ x: 0, z: 0, width: 36, length: 120 });
  for (let z = -56; z <= 56; z += 8) {
    assert.ok(Math.abs(tilted.h[cell(0, z)] - (3 + z * 0.05)) < 1e-6, 'an authored 5 % grade is the plane');
    assert.ok(Math.abs(held.h[cell(0, z)] - (3 + z * 0.08)) < 1e-6, 'an authored grade is held to 8 %');
    assert.ok(Math.abs(followed[cell(0, z)] - (10 + z * 0.06)) < 1e-4, "'road' follows a 6 % road at its height");
    assert.ok(Math.abs(fitted[cell(0, z)] - (10 + z * 0.01)) < 1e-4, 'an omitted grade fits the road within 1 %');
  }
  const guard = 4 * Math.SQRT2, smooth = (t) => t * t * (3 - 2 * t);
  const narrow = stamp({ x: 0, z: 0, width: 36, length: 36, level: 3 });
  const wide = stamp({ x: 0, z: 0, width: 36, length: 36, level: 3, bankM: 30 });
  // 22 m outside the east edge: past the road blend's own bank, inside the authored 30 m one
  const sd = 22 - guard, at = cell(40, 0);
  assert.equal(narrow.d[at], 1000, 'the default bank leaves ground 22 m out alone');
  assert.equal(narrow.h[at], 10);
  assert.ok(Math.abs(wide.d[at] - (3.8 + sd * (10.2 / 30))) < 1e-4, 'a 30 m bank reads 22 m out as inside its blend');
  assert.ok(Math.abs(wide.h[at] - (10 + (3 - 10) * (1 - smooth(sd / 33.8)))) < 1e-4, 'and feathers its plane over 33.8 m');
  assert.equal(wide.d[cell(76, 0)], 1000, 'and leaves ground past its bank alone');
}
const pixels = new Uint8ClampedArray(128 * 128 * 4).fill(37);
const pixelBuffer = pixels.buffer;
stampHardstandRoadMask([strip], pixels, 128, mapSize);
assert.equal(pixels.buffer, pixelBuffer, 'pavement reuses the existing road mask buffer');
for (let z = -80; z <= 80; z += 2) for (let x = -16; x <= 16; x += 2) {
  const at = (((z + 128) / 2) * 128 + (x + 128) / 2) * 4;
  assert.equal(pixels[at], 255); assert.equal(pixels[at + 1], 0);
  assert.equal(pixels[at + 2], 37); assert.equal(pixels[at + 3], 37,
    'hardstands do not overwrite wetness or village channels');
}

// 2026-10-03 (maps lane): the paint spills past the apron's edge in irregular tongues, never inward, and never past its
// spill reach; the apron itself stays fully paved (above).
{
  const big = { x: 0, z: 0, width: 160, length: 160, yawDeg: 0 };
  const px = new Uint8ClampedArray(512 * 512 * 4).fill(0);
  stampHardstandRoadMask([big], px, 512, 1024);
  let spilled = 0, ring = 0;
  for (let iz = 0; iz < 512; iz++) for (let ix = 0; ix < 512; ix++) {
    const x = (ix + 0.5) * 2 - 512, z = (iz + 0.5) * 2 - 512, at = (iz * 512 + ix) * 4;
    const out = Math.max(Math.abs(x), Math.abs(z)) - 80;
    if (out <= -1) assert.equal(px[at], 255, 'the apron stays fully paved');
    if (out >= HARDSTAND_PAINT_SPILL_M + 1.25) assert.equal(px[at], 0, 'no paint past the spill reach');
    if (out >= 2 && out < 4) { ring++; if (px[at] > 0) spilled++; }
  }
  assert.ok(spilled > ring * 0.1 && spilled < ring * 0.9, `the outline wanders: ${spilled} of ${ring} pixels 2-4 m out painted`);
}
// Kestrel Airfield (redesigned 2026-10-02, maps lane B): the runway runs east-west across the field's centre (yaw 90,
// its length along x), and the level holding apron where the taxiways meet it carries the zone-control disc and the
// kickoff. Outside the apron and its blend the runway is one graded plane over its whole width; the apron is level; the
// blend between them, the runway's ends and its edges show no kerb.
const [runway, holding] = airfield.terrain.hardstands;
const runwayHalfWidth = runway.width / 2, runwayReach = runway.length / 2 - 10, blendEnd = holding.width / 2 + 16;
for (const seed of [1337, 2049]) {
  const field = createHeightField(seed, airfield);
  const without = createHeightField(seed, {
    ...airfield, terrain: { ...airfield.terrain, hardstands: [] },
  });
  const east = field.getHeightAt(runwayReach, 0);
  const grade = (east - field.getHeightAt(-runwayReach, 0)) / (2 * runwayReach);
  assert.ok(Math.abs(grade) <= 0.01001);
  for (let x = -runwayReach; x <= runwayReach; x += 20) {
    const half = runwayHalfWidth;
    for (const z of [-half, -half + 0.1, -16, -8, 0, 8, 16, half - 0.1, half]) {
      if (Math.abs(x) > blendEnd) {
        assert.ok(Math.abs(field.getHeightAt(x, z) - (east + grade * (x - runwayReach))) < 2e-6,
          'the real airfield has continuous graded full-width pavement');
      }
      assert.equal(field.getGroundType(x, z), 'hard');
      assert.equal(field._noVeg(x, z), true);
    }
  }
  const apronY = field.getHeightAt(0, 0);
  for (let x = -holding.width / 2; x <= holding.width / 2; x += 5) {
    for (const z of [-holding.length / 2, -runwayHalfWidth, 0, runwayHalfWidth, holding.length / 2]) {
      assert.ok(Math.abs(field.getHeightAt(x, z) - apronY) < 2e-6, 'the holding apron is one level plane');
    }
  }
  for (let x = -runwayReach; x < runwayReach; x += 0.4) {
    for (const z of [-runwayHalfWidth, 0, runwayHalfWidth]) {
      assert.ok(Math.abs(field.getHeightAt(x + 0.4, z) - field.getHeightAt(x, z)) < 0.12,
        'the runway rides from its graded plane onto the level apron without a kerb');
    }
  }
  for (const spawn of [airfield.spawns.player, ...airfield.spawns.enemies]) {
    assert.equal(field.getHeightAt(spawn.x, spawn.z), without.getHeightAt(spawn.x, spawn.z),
      'the bounded runway never changes deployment pad elevations');
  }
  // The taxiways and the field meet the strip via the same elevation grid. Its immediate threshold crosses no new
  // raised kerb or disconnected pavement step.
  for (const x of [-200, -60, 120]) {
    for (const side of [-1, 1]) {
      assert.ok(Math.abs(field.getHeightAt(x, side * (runwayHalfWidth + 0.2))
        - field.getHeightAt(x, side * (runwayHalfWidth - 0.2))) < 0.12);
    }
  }
}
console.log('hardstandSurface.selftest: full-width plane, pavement mask, dry drive and connected aprons passed');

assert.equal(createHardstandVegetationExclusion(undefined), null);
assert.equal(createHardstandVegetationExclusion([]), null);
for (const yawDeg of [0, 27, 90, -137]) {
  const strip = { x: 20, z: -60, width: 36, length: 180, yawDeg };
  const excluded = createHardstandVegetationExclusion([strip]);
  const angle = yawDeg * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const point = (a, b) => [strip.x + c * a + s * b, strip.z - s * a + c * b];
  for (const a of [-19.25, -18, 0, 18, 19.25]) for (const b of [-90, 0, 90]) {
    assert.equal(excluded(...point(a, b)), true, 'paint and feather stay clear');
  }
  for (const [a, b] of [[20.01, 0], [0, 92.01], [19.5, 91.5], [200, 200]]) {
    assert.equal(excluded(...point(a, b)), false, 'exclusion stays local with rounded corners');
  }
}
const multiple = createHardstandVegetationExclusion([
  { x: -100, z: 0, width: 20, length: 40 },
  { x: 100, z: 0, width: 20, length: 40, yawDeg: 90 },
]);
assert.equal(multiple(-100, 0), true);
assert.equal(multiple(100, 0), true);
assert.equal(multiple(0, 0), false, 'separate aprons do not bridge their intervening land');

/** Whether (x, z) lies within `margin` of one of the airfield's hardstands (their exclusions and feathers). */
function insideHardstand(x, z, margin) {
  return airfield.terrain.hardstands.some((stand) => {
    const angle = (stand.yawDeg ?? 0) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    const dx = x - stand.x, dz = z - stand.z;
    return Math.abs(c * dx - s * dz) <= stand.width / 2 + margin
      && Math.abs(s * dx + c * dz) <= stand.length / 2 + margin;
  });
}
for (const seed of [1337, 2049, 7719]) {
  const field = createHeightField(seed, airfield);
  const noApron = createHeightField(seed, { ...airfield, terrain: { ...airfield.terrain, hardstands: [] } });
  let controls = 0;
  for (let z = -480; z <= 480; z += 8) for (let x = -480; x <= 480; x += 8) {
    if (insideHardstand(x, z, 3)) continue;
    assert.equal(field._noVeg(x, z), noApron._noVeg(x, z), 'remote exclusion is not a road-mask side effect');
    if (field._roadDist(x, z) < 4.3 && !noApron._noVeg(x, z)) controls++;
  }
  assert.ok(controls > 100, 'real unrelated road sites exercise the regression');
}
const lakeField = createHeightField(1337, { ...airfield,
  terrain: { ...airfield.terrain, lakes: [{ x: 300, z: 280, r: 35 }], marshes: [], softLakes: true } });
assert.equal(lakeField._noVeg(300, 280), true, 'existing liquid-water exclusion is retained');
assert.equal(lakeField._noVeg(300, 340), false);
// 2026-10-07 (wave 182, Frosthollow's "dark untextured rectangles"): the material knows a pad by its stamp — the
// carriageway's coverage with no centreline near (R high, G 0) — and draws it as the carriageway's packed ground (packed
// snow on a snow map) without lanes, ruts or crown; a paved map's pads paved; the shoulder's own dirt stands down on it
{
  const { readFileSync } = await import('node:fs');
  const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
  assert.ok(terrain.includes('float padK = (1.0 - smoothstep(0.05, 0.25, mk.g)) * (1.0 - step(0.5, gRoadTex));')
    && terrain.includes('float apronK = smoothstep(0.50, 0.90, mk.r) * padK;') && terrain.includes('float apronRim = smoothstep(0.04, 0.50, mk.r) * padK;'),
    'a pad is the stamp\'s coverage away from any centreline, on an unpaved map — its body and its feather');
  assert.ok(terrain.includes('shoulder * uShoulderDirt * (1.0 - apronRim)'), 'the shoulder\'s dirt stands down over the whole pad');
  assert.ok(terrain.includes('float dW = max(roadCore, apronK) * 0.9 * (1.0 - gRoadTex);'),
    'the pad takes the carriageway\'s packed ground — earth, or on a snow map packed snow');
  const strip = readFileSync(new URL('./hardstandSurface.ts', import.meta.url), 'utf8');
  assert.ok(strip.includes('pixels[at] = Math.max(pixels[at], coverage * 255);') && strip.includes('pixels[at + 1] *= 1 - coverage;'),
    'the stamp the material reads: full coverage in R, the centreline distance cleared in G');
}
// 2026-10-07 (wave 235's Monsoon chase: "a flat, uniform brown dirt plane … cut by a ruler-straight edge"; Whiteout's "no
// tracks"): a pad's edge reaches into the stamp's spill tongues and is broken by a ragged threshold, and the pad is worked
// ground — two families of vehicle ruts across it, darkening its packed ground, puddled as a road's ruts are (on a wet map),
// slush on a snow map, grooved in the light — with churned patches along them
{
  const { readFileSync } = await import('node:fs');
  const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
  assert.ok(terrain.includes('apronK = smoothstep(0.30, 0.85, mk.r + (apronN - 0.5) * 0.60 * tileVis(4.8)) * padK;'), 'the pad\'s edge: into the spill, ragged');
  assert.ok(terrain.includes('rut = max(rut, padRut * rutAmp * 1.2);'), 'its ruts are the road\'s for the puddles');
  assert.ok(terrain.includes('a.rgb *= 1.0 - padRut * 0.36;') && terrain.includes('n.xy -= padRutN * 0.35;'), 'they darken its ground and groove it');
  assert.ok(terrain.includes('lane * rutAmp * 1.25 + padRut * 1.10'), 'and on snow they are slush');
}
console.log('hardstandSurface.selftest: local rotated exclusions, remote road controls, additive water and the pads\' worn ground passed');
