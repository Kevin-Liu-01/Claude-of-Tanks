import assert from 'node:assert/strict';
import { HARDSTAND_PAINT_SPILL_M, HARDSTAND_TRAMPLE_COVER, HARDSTAND_TRAMPLE_M, createHardstandPaintCover, createHardstandVegetationExclusion,
  stampHardstandRoadGrids, stampHardstandRoadMask, stampHardstandTrampleMask } from './hardstandSurface.ts';
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
  // roads lane R3 (2026-10-10; wave 341: "every pad is a pasted polygon ... It needs spill, trampled margins, and tracks that
  // ... leave across grass, sand or snow"; the coordinator: keep the core fully paved and add an irregular outward margin —
  // the rule this receipt keeps is the paint's, so the margin is asserted on its own terms, outward only): the trampled
  // margin rides in R at a low cover past the paint, 2–5 m out by its own wandering reach, and nowhere else
  const before = px.slice();
  const withG = px.slice(); for (let i = 0; i < withG.length; i += 4) { withG[i + 1] = 91; withG[i + 2] = 17; withG[i + 3] = 203; }
  const gBefore = withG.slice();
  stampHardstandTrampleMask([big], px, 512, 1024);
  stampHardstandTrampleMask([big], withG, 512, 1024);
  const cap = HARDSTAND_TRAMPLE_COVER * 255;
  let lowered = 0, touched = 0;
  const rings = {};
  for (let iz = 0; iz < 512; iz++) for (let ix = 0; ix < 512; ix++) {
    const x = (ix + 0.5) * 2 - 512, z = (iz + 0.5) * 2 - 512, at = (iz * 512 + ix) * 4;
    const out = Math.max(Math.abs(x), Math.abs(z)) - 80;
    if (px[at] < before[at]) lowered++;
    if (withG[at + 1] !== gBefore[at + 1] || withG[at + 2] !== gBefore[at + 2] || withG[at + 3] !== gBefore[at + 3]) touched++;
    if (out <= -1) assert.equal(px[at], 255, 'the apron stays fully paved under its margin');
    if (px[at] > before[at]) assert.ok(px[at] <= cap + 1, `the margin is a low cover only (${px[at]} at ${out.toFixed(1)} m out)`);
    if (out >= HARDSTAND_PAINT_SPILL_M + 1.25 + HARDSTAND_TRAMPLE_M) assert.equal(px[at], 0, 'nothing past the margin\'s reach');
    if (out >= 0 && out < 10) { const r = rings[Math.floor(out / 2)] ??= { n: 0, paint: 0, margin: 0 }; r.n++; if (before[at] > 0) r.paint++; if (px[at] > 0) r.margin++; }
  }
  const share = (k, key) => rings[k][key] / rings[k].n;
  assert.equal(lowered, 0, 'the margin only raises the cover — outward and additive');
  assert.equal(touched, 0, 'and leaves the distance, wetness and wear channels alone');
  // past the paint's last texels (2–4 m out, where the paint holds a third) the margin covers the ground; it then wanders out,
  // ragged, 4–8 m — not a second ruled outline
  assert.ok(share(1, 'paint') < 0.6 && share(1, 'margin') > 0.95, `the margin closes round the paint's tongues (2–4 m out: paint ${share(1, 'paint').toFixed(2)}, margin ${share(1, 'margin').toFixed(2)})`);
  assert.ok(share(2, 'paint') < 0.1 && share(2, 'margin') > 0.3 && share(2, 'margin') < 0.95, `4–6 m out the margin wanders (${share(2, 'margin').toFixed(2)})`);
  assert.ok(share(3, 'margin') > 0.02 && share(3, 'margin') < 0.5, `6–8 m out its last tongues (${share(3, 'margin').toFixed(2)})`);
  assert.ok(cap < 0.15 * 255, 'below the paving\'s 0.15 threshold (terrain.ts paveCore) and the apron\'s 0.30 (apronK): no surface grows');
  const cover = createHardstandPaintCover([big]);
  assert.ok(cover(80 + HARDSTAND_PAINT_SPILL_M + HARDSTAND_TRAMPLE_M - 0.5, 0) && !cover(80 + HARDSTAND_PAINT_SPILL_M + 1.25 + HARDSTAND_TRAMPLE_M + 0.5, 0),
    'the paint cover the village receipt protects reaches over the margin');
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
    && terrain.includes('float apronK = smoothstep(0.50, 0.90, mk.r) * padK;')
    && terrain.includes('float apronRim = smoothstep(uLandTier > 0.5 ? 0.015 : 0.04, uLandTier > 0.5 ? 0.11 : 0.50, mk.r) * padK;'),
    'a pad is the stamp\'s coverage away from any centreline, on an unpaved map — its body and its feather (R3: past the Low tier its rim takes the trampled margin)');
  // (R3) the margin is stamped after the strand's soil, which skips R: the soil fringe is painted as before
  const shoreAt = terrain.indexOf('stampShoreDirtMask(px, dist, s, MAP_SIZE, shoreDirtStart);');
  const trampleAt = terrain.indexOf('if (layout.terrain.hardstands?.length) stampHardstandTrampleMask(layout.terrain.hardstands, px, s, MAP_SIZE);');
  assert.ok(shoreAt > 0 && trampleAt > shoreAt, 'the trampled margin after the shore stamp');
  assert.ok(terrain.includes('padTrackW = max(apronK, 0.85 * apronRim);') && terrain.includes('float padLiftK = workedR && uReduxD.y < 1.5 ? 0.9 * apronK : 0.0;'),
    'R3: the prints run out across the margin; a pad\'s earth lifted to a shade over the field (no charcoal slab)');
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
  assert.ok(terrain.includes('if (uLandTier < 0.5) a.rgb *= 1.0 - padRut * (uReduxD.y > 1.5 ? 0.06 : 0.20);') && terrain.includes('if (nrmOn && (uLandTier < 0.5 ? padRut > 0.003 : padTrackW > 0.003)) n.xy -= padRutN * (uLandTier < 0.5 ? 0.35 : 0.5);'), 'they darken its ground (a snow pad\'s barely: pressed snow) and groove it');
  // (R3, 2026-10-10, the gauntlet's Frosthollow pad: "thin, dark, pen-like scratch lines ... no paired track-width ruts,
  // grouser imprints, compacted berms") past the Low tier a print is a tank's 0.6 m track or a lorry's 0.3 m tyre pressed
  // flat, its grousers' bars across it every 0.17 m, a berm of the pushed snow or soil on each side, and it keeps none of
  // the road's lane darkening
  assert.ok(terrain.includes('float hw = tank ? 0.30 : 0.15;') && terrain.includes('float bv = stripeVis(0.17, aP) * floorW * pres;')
    && terrain.includes('padBerm = max(padBerm, berm * pres * wallV);') && terrain.includes('if (uLandTier < 0.5) rut = max(rut, padRut * rutAmp * 1.2);'),
    'R3: the prints, their grousers and berms; the lanes\' darkening the Low tier\'s only');
  // (roads lane, 2026-10-10, wave 341's packing note) on snow they are pressed, glazed snow, slush churned to the ground in stretches
  assert.ok(terrain.includes('lane * rutAmp * 1.25 + padSlush * 1.10') && terrain.includes('roadCol = mix(roadCol, packedSnow * vec3(0.80, 0.82, 0.86), (padRut - padSlush) * 0.85);'),
    'and on snow they are pressed snow with slush in stretches');
  // 2026-10-09 (roads lane; the gauntlet's "near-black swirl apron" on Frontier): a family's heading is a constant — any
  // heading read off noise is multiplied by |wp| in q = dot(wp, dir) and draws that noise's contours, a rut every metre —
  // its lines wander only on the slow field b (features past 26 m), and its tracks are single vehicles' pairs per strip
  assert.ok(terrain.includes('float t = 0.62 + float(k) * (padArcs ? 0.60 : 1.15);') && !/float th = [^;]*nz\(/.test(terrain),
    'the pad ruts\' families keep fixed headings');
  // (R3f, the lab's Frosthollow assembly area: ruled stubs at right angles read as a lattice) past the Low tier the wander
  // doubles over a slower field still (0.0016: gentle arcs, never metre-scale contours); the Low tier keeps R1b's
  assert.ok(terrain.includes('float q = dot(wp.xz, dP) + (padArcs ? 7.0 : 3.5) * (nz(uv, padArcs ? 0.0016 : 0.0024,')
    && terrain.includes('bool padArcs = uLandTier > 0.5;') && terrain.includes('float gauge = ch.y > 0.45 ? 2.9 : 1.8;'),
    'their lines wander slowly and hold one vehicle\'s pair per strip');
}
console.log('hardstandSurface.selftest: local rotated exclusions, remote road controls, additive water and the pads\' worn ground passed');
