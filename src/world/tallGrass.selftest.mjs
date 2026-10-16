// Round 73 (2026-09-25, the ground redux; owner: "add tall grass that interacts with tanks"): the tall-grass tier.
// Deterministic cells, the admission rules (roads and shoulders, water, soft ground, steep faces, worked ground,
// sealed footprints, village ground, hollows), the two rings and their fades, the blade geometry, the quality knob,
// the reeds, the shader (the press, the root-anchored shadow, the scope corridor), the engine hooks and the world
// wiring — with no renderer (the press field is null and the sward stands).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  SHADED_SWARD_GLSL, TALL_GRASS, buildTallGrassClumpGeometry, buildTallGrassFarGeometry, createTallGrass, publishTrim, tallGrassRank,
  tallGrassShaderSource,
} from './tallGrass.ts';
import { resolveGroundReduxProfile } from './groundRedux.ts';
import { MAP_IDS } from './maps/catalog.ts';
import { PRESETS } from '../engine/quality.ts';

const height = (x, z) => 0.4 * Math.sin(x * 0.1) + 0.2 * Math.cos(z * 0.13);
const field = {
  getHeightAt: height,
  getHeightAtFast: height,
  _roadDist: (x) => Math.abs(x - 5),                                        // a road along z at x = 5
  getGroundType: (x, z) => (Math.hypot(x + 20, z - 15) < 6 ? 'soft' : 'medium'),
  getNormalAt: (x, z) => (z > 30 ? { x: 0.6, y: 0.7, z: 0.39 } : { x: 0, y: 1, z: 0 }),
  _noVeg: (x) => x < -30,                                                   // worked yards west
  getWaterMaskAt: (x, z) => (z < -20 ? 1 : 0),
  _villageMask: (x, z) => (x > 30 && z > 5 ? 1 : 0),                        // the trodden village NE
  _foldAt: (x, z) => (Math.hypot(x + 8, z - 8) < 7 ? 0.9 : 0),               // a hollow
};
const blocked = (x, y, z) => Math.hypot(x - 20, z + 10) < 5;                // a sealed building footprint
const meadow = resolveGroundReduxProfile('verdant').grass;
const settle = (grass, camera, n = 600) => {
  // at least one update (a knob or camera change is only noticed there), then until every ring is published and idle
  for (let i = 0; i < n; i++) {
    grass.update(1 / 60, camera, null, null);
    const s = grass.getState();
    if (s.near.publishes && s.mid.publishes && s.far.publishes && !s.near.pending && !s.mid.pending && !s.far.pending) break;
  }
};
const roots = (mesh) => {
  const a = mesh.instanceMatrix.array, out = [];
  for (let i = 0; i < mesh.count; i++) out.push([a[i * 16 + 12], a[i * 16 + 13], a[i * 16 + 14]]);
  return out;
};
const blades = (mesh) => {
  const a = mesh.geometry.getAttribute('aBlade').array, out = [];
  for (let i = 0; i < mesh.count; i++) out.push([a[i * 4], a[i * 4 + 1], a[i * 4 + 2], a[i * 4 + 3]]);
  return out;
};
const cam = new THREE.Vector3(0, 2, 0);

// 1. The blade geometry: a clump of three strips, two segments each (five vertices, three triangles a blade); the far
//    ring's single triangle blade.
{
  const clump = buildTallGrassClumpGeometry();
  const perBlade = TALL_GRASS.bladeSegments * 2 + 1, trisPerBlade = TALL_GRASS.bladeSegments * 2 - 1;
  assert.equal(TALL_GRASS.bladeSegments, 2, 'two segments: a third cost 40 % more triangles for a bend no thin strip shows');
  assert.equal(clump.getAttribute('position').count, TALL_GRASS.bladesPerClump * perBlade, 'three blades of five vertices');
  assert.equal(clump.index.count, TALL_GRASS.bladesPerClump * trisPerBlade * 3, 'nine triangles');
  const three = buildTallGrassClumpGeometry(3, 3);
  assert.equal(three.getAttribute('position').count, 21); assert.equal(three.index.count, 45, 'the builder still takes any segment count');
  three.dispose();
  const far = buildTallGrassFarGeometry();
  assert.equal(far.getAttribute('position').count, 3); assert.equal(far.index.count, 3, 'one triangle blade');
  const p = clump.getAttribute('position');
  for (let v = 0; v < p.count; v++) {
    assert.ok(p.getX(v) >= -0.5 && p.getX(v) <= 0.5, 'x is the across coordinate');
    assert.ok(p.getY(v) >= 0 && p.getY(v) <= 1, 'y is the height fraction');
  }
  assert.deepEqual(Object.keys(clump.attributes).sort(), ['normal', 'position']);
  assert.deepEqual([...buildTallGrassClumpGeometry().getAttribute('position').array], [...p.array], 'deterministic');
  for (const i of clump.index.array) assert.ok(i >= 0 && i < p.count);
  clump.dispose(); far.dispose();
}

// 2. Gates: the mobile tier, a map without a sward, a zero quality knob.
{
  const mobile = createTallGrass(field, { tier: 'mobile', biome: meadow, qualityScale: () => 1 });
  assert.equal(mobile.group.visible, false); assert.equal(mobile.pressure, null); assert.equal(mobile.pressureFine, null);
  mobile.update(1 / 60, cam); assert.equal(mobile.getState().enabled, false); assert.equal(mobile.near.count, 0);
  mobile.dispose();
  const desert = createTallGrass(field, { tier: 'desktop', mapId: 'desert', qualityScale: () => 1 });
  assert.equal(desert.group.visible, false, 'the desert grows no sward');
  desert.update(1 / 60, cam); assert.equal(desert.getState().near.builds, 0);
  desert.dispose();
  const off = createTallGrass(field, { tier: 'desktop', biome: meadow, qualityScale: () => 0 });
  settle(off, cam, 20);
  assert.equal(off.near.count, 0); assert.equal(off.getState().near.builds, 0, 'a zero knob builds nothing');
  off.dispose();
}

// 3. A settled ring under the camera: counts, exclusions, ground fit, the hollow, the blade attribute.
const grass = createTallGrass(field, { seed: 11, tier: 'desktop', biome: meadow, blocked, qualityScale: () => 1 });
assert.equal(grass.group.name, 'tall-grass');
assert.deepEqual(grass.group.children.map((m) => m.name), ['tall-grass-near', 'tall-grass-mid', 'tall-grass-far']);
for (const mesh of [grass.near, grass.mid, grass.far]) {
  assert.equal(mesh.castShadow, false, 'blades cast no shadow');
  assert.equal(mesh.receiveShadow, true, 'blades receive shadow (at the root)');
  assert.equal(mesh.frustumCulled, false);
  assert.ok(mesh.material.isMeshLambertMaterial && mesh.material.side === THREE.DoubleSide, 'an opaque, textureless, double-sided Lambert strip');
  assert.equal(mesh.material.map, null); assert.equal(mesh.material.alphaTest, 0);
}
assert.equal(grass.near.material.customProgramCacheKey(), TALL_GRASS.near.programKey);
assert.equal(grass.mid.material.customProgramCacheKey(), TALL_GRASS.mid.programKey);
assert.equal(grass.far.material.customProgramCacheKey(), TALL_GRASS.far.programKey);
grass.update(1 / 60, cam);
assert.ok(grass.getState().near.pending > 0, 'a fresh ring builds over several updates');
settle(grass, cam);
const state = grass.getState();
for (const ring of ['near', 'mid', 'far']) {
  assert.equal(state[ring].pending, 0);
  assert.equal(state[ring].cells, (TALL_GRASS[ring].ring * 2 + 1) ** 2);
  assert.equal(state[ring].builds, state[ring].cells);
  assert.ok(state[ring].publishes >= 1);
  assert.equal(state[ring].truncated, 0);
  assert.equal(grass[ring].count, state[ring].count);
}
assert.ok(state.near.count > 2000, `the near ring carries thousands of clumps (${state.near.count})`);
assert.ok(state.mid.count > 1000, `the mid ring carries thousands of clumps (${state.mid.count})`);
assert.ok(state.far.count > 300, `the far ring carries hundreds of blades (${state.far.count})`);
const nearRoots = roots(grass.near), midRoots = roots(grass.mid), farRoots = roots(grass.far);
const halfOf = (ring) => (TALL_GRASS[ring].ring + 1) * TALL_GRASS[ring].cellM;
for (const [list, half] of [[nearRoots, halfOf('near')], [midRoots, halfOf('mid')], [farRoots, halfOf('far')]]) {
  for (const [x, y, z] of list) {
    assert.ok(Math.abs(x - 5) >= TALL_GRASS.roadKeepOutM, `off the carriageway (${x.toFixed(2)})`);
    assert.ok(z >= -20, 'off water');
    assert.ok(z <= 30, 'off steep faces');
    assert.ok(x >= -30, 'off worked ground');
    assert.ok(Math.hypot(x - 20, z + 10) >= 5 - 0.2, 'out of sealed footprints');
    assert.ok(Math.abs(y - height(x, z)) < 1e-4, 'rooted on the ground');
    assert.ok(Math.abs(x) <= half && Math.abs(z) <= half, 'inside its ring');
  }
}
const perM2 = (list, cx, cz, r) => list.filter(([x, , z]) => Math.hypot(x - cx, z - cz) < r).length / (Math.PI * r * r);
const soft = perM2(nearRoots, -20, 15, 5), open = perM2(nearRoots, 15, 20, 8), hollow = perM2(nearRoots, -8, 8, 7), village = perM2(nearRoots, 40, 20, 8);
assert.ok(soft < open * 0.6, `soft ground thins the sward (${soft.toFixed(2)} vs ${open.toFixed(2)} per m²)`);
// the +30 % hollow bonus multiplies `keep`, which the admission roll saturates at 1: on open ground the splat noise
// already leaves most of the fixture's keep at or above 1, so the measured thickening is ~+15 % — the whole 7 m
// fixture disc (~350 clumps, ±5 %) against a floor of +8 % (2026-09-26: the 5 m disc read 1.148 at 2.6 clumps / m²)
assert.ok(hollow > open * 1.08, `the hollow thickens it (${hollow.toFixed(2)} vs ${open.toFixed(2)} per m²)`);
assert.ok(village < open * 0.3, `the village ground is trodden (${village.toFixed(2)} vs ${open.toFixed(2)} per m²)`);
const shoulder = nearRoots.filter(([x]) => Math.abs(x - 5) >= TALL_GRASS.roadKeepOutM && Math.abs(x - 5) < 6).length;
const verge = nearRoots.filter(([x]) => Math.abs(x - 5) >= 12 && Math.abs(x - 5) < 13.4).length;
assert.ok(shoulder < verge * 0.7, `the shoulder thins toward the road (${shoulder} vs ${verge})`);
const nearBlades = blades(grass.near);
let hollowHeight = 0, hollowN = 0, openHeight = 0, openN = 0;
nearBlades.forEach(([yaw, h, w, r], i) => {
  // (grass r2: the fourth value is the species code + the clump's random; no herb grows without a canopy)
  assert.ok(yaw >= 0 && yaw < Math.PI * 2 + 1e-6 && h > 0.3 && h <= 1.9 && w > 0.02 && w < 0.12 && r >= 0 && r < 5 && r % 1 < 0.9996, 'blade yaw / height / width / code + random inside their bands');
  const [x, , z] = nearRoots[i];
  if (Math.hypot(x + 8, z - 8) < 5) { hollowHeight += h; hollowN++; } else if (Math.hypot(x - 15, z - 20) < 8) { openHeight += h; openN++; }
});
assert.ok(hollowHeight / hollowN > openHeight / openN * 1.1, 'blades stand taller in the hollow');
const colors = grass.near.instanceColor.array;
// (grass r2: the clump's jitter times its patch's colour and light)
for (let i = 0; i < grass.near.count * 3; i++) assert.ok(colors[i] > 0.3 && colors[i] <= 1.6 + 1e-6, 'tints jitter inside their band (the 1.6 cap as a float32)');
for (const ring of [grass.mid, grass.far]) {
  assert.ok(blades(ring).every(([, , w]) => w > meadow.widthM * TALL_GRASS.farWidth * 0.8 - 1e-9), 'mid and far blades are wider (one strip carries the read)');
}

// 3b. grass r2 (2026-10-15, the blind critics: "blades only in a ~15 m band, then crumpled bladeless ground behind a hard
//     line"; "one species and one colour … no seed heads, flowers or height variety"). The mid ring holds the cover the
//     near ring hands over: its cells are published in rank order as the prefix their nearest camera position shows
//     ((keepRef / d)² beyond keepRef), none inside its dissolve-in, and every clump the shader would show is published.
{
  assert.deepEqual([...TALL_GRASS.near.dissolve], [-1, -1, 30, 46], 'the near clumps leave by rank across 30–46 m');
  assert.deepEqual([...TALL_GRASS.mid.dissolve], [30, 46, -1, -1], 'the mid clumps arrive by rank across the same band');
  assert.ok(TALL_GRASS.mid.fade[2] > TALL_GRASS.far.fade[0] && TALL_GRASS.mid.fade[3] > TALL_GRASS.far.fade[1], 'the far ring comes in under the mid ring\'s fade-out');
  // the trim: the camera anywhere in its cell, any point of the target cell — the published share covers the shown one
  const show = (d) => (d < 46 ? (d <= 30 ? 0 : ((d - 30) / 16) ** 2 * (3 - 2 * (d - 30) / 16)) : 1) * Math.min(1, (46 / Math.max(d, 1)) ** 2);
  for (let k = 0; k < 4000; k++) {
    const cm = TALL_GRASS.mid.cellM, gx = Math.floor((k * 7919) % 13) - 6, gz = Math.floor((k * 104729) % 13) - 6;
    const camX = ((k * 0.6180339) % 1) * cm, camZ = ((k * 0.4142135) % 1) * cm;
    const px = gx * cm + ((k * 0.7320508) % 1) * cm, pz = gz * cm + ((k * 0.2360679) % 1) * cm;
    const centre = Math.hypot(gx, gz) * cm, d = Math.hypot(px - camX, pz - camZ);
    const kept = publishTrim(1000, centre, cm, TALL_GRASS.mid.keepRefM, 30) / 1000;
    assert.ok(kept >= show(d) - 1e-9, `a mid cell ${centre.toFixed(0)} m out keeps every rank a camera ${d.toFixed(1)} m from its clump shows`);
  }
  assert.equal(publishTrim(500, 0, 16, 46, 30), 0, 'the camera\'s own cell shows no mid blade');
  assert.equal(publishTrim(500, 200, 24, 0, 88), 500, 'a far cell past the fade-in publishes whole');
  assert.ok(publishTrim(500, 96, 16, 46, 30) < 250, 'an outer mid cell publishes a fraction (its nearest point 73 m out: 39 % + the soft edge)');
  // the published mid clumps follow the law on open level ground: the clumps the shader shows thin as (46 / d)² past 46 m
  const open = createTallGrass({ getHeightAt: () => 0 }, { seed: 11, tier: 'desktop', biome: meadow, qualityScale: () => 1 });
  settle(open, cam);
  const or = roots(open.mid), ob = blades(open.mid);
  const showing = (d0, d1) => {
    let n = 0;
    or.forEach(([x, , z], i) => { const d = Math.hypot(x - cam.x, z - cam.z); if (d >= d0 && d < d1 && tallGrassRank(ob[i][3]) < show(d)) n++; });
    return n / (Math.PI * (d1 * d1 - d0 * d0));
  };
  const at50 = showing(46, 56), at90 = showing(84, 96);
  assert.ok(at50 > 0.3 && at90 > 0.05 && at50 > at90 * 2.4, `the mid ring thins with distance (${at50.toFixed(2)} vs ${at90.toFixed(2)} per m² shown)`);
  open.dispose();
  // the cells are kept in rank order: a published prefix is a rank prefix
  for (const ring of [grass.mid]) {
    const b = blades(ring);
    let ordered = 0;
    for (let i = 1; i < b.length; i++) if (tallGrassRank(b[i][3]) >= tallGrassRank(b[i - 1][3])) ordered++;
    assert.ok(ordered > b.length * 0.97, 'mid cells publish in rank order (descending only at a cell boundary)');
  }
  // the species: seed-bearing grasses and flowering herbs on a meadow, no herb layer without a canopy
  const codes = [0, 0, 0, 0, 0, 0];
  for (const [, , , w] of nearBlades) codes[Math.floor(w)]++;
  const total = nearBlades.length;
  assert.ok(codes[1] / total > 0.06 && codes[1] / total < 0.30, `a meadow seeds in places (${(codes[1] / total * 100).toFixed(1)} %)`);
  const flowers = codes[2] + codes[3] + codes[4];
  assert.ok(flowers / total > 0.015 && flowers / total < 0.15, `and flowers in its flower patches (${(flowers / total * 100).toFixed(1)} %)`);
  assert.ok(codes[2] > 0 && codes[3] > 0 && codes[4] > 0, 'white, yellow and purple heads');
  assert.equal(codes[5], 0, 'no herb layer in the open');
  // the colour wanders patch by patch: 8 m patches' mean tints spread far wider than one clump's jitter would average to
  const cells = new Map();
  nearRoots.forEach(([x, , z], i) => {
    const key = `${Math.floor(x / 8)},${Math.floor(z / 8)}`, c = cells.get(key) ?? [0, 0, 0];
    c[0] += colors[i * 3 + 1] / colors[i * 3]; c[1] += colors[i * 3] + colors[i * 3 + 1]; c[2]++; cells.set(key, c);
  });
  const hue = [...cells.values()].filter((c) => c[2] > 40).map((c) => c[0] / c[2]);
  const meanHue = hue.reduce((a, b) => a + b, 0) / hue.length;
  const sdHue = Math.sqrt(hue.reduce((a, b) => a + (b - meanHue) ** 2, 0) / hue.length);
  assert.ok(sdHue > 0.04, `patches of fresh and cured sward (8 m patch hue sd ${sdHue.toFixed(3)})`);
  // the woods' herb layer: fronds in patches under a closed canopy, broad and short, the sward thinned there
  const woodsField = { getHeightAt: () => 0, _woodsAt: (x, z) => (Math.hypot(x - 20, z - 25) < 14 ? 0.9 : 0) };
  const wood = createTallGrass(woodsField, { seed: 11, tier: 'desktop', biome: meadow, blocked, qualityScale: () => 1 });
  settle(wood, cam);
  const wr = roots(wood.near), wb = blades(wood.near);
  let herbs = 0, herbOut = 0, herbW = 0, grassIn = 0, grassOut = 0;
  wr.forEach(([x, , z], i) => {
    const inside = Math.hypot(x - 20, z - 25) < 14, out = Math.hypot(x - 20, z - 25) > 15 && Math.hypot(x - 20, z - 25) < 28;
    if (Math.floor(wb[i][3]) === 5) { if (inside) { herbs++; herbW += wb[i][2]; } else herbOut++; }
    else if (inside) grassIn++; else if (out) grassOut++;
  });
  assert.ok(herbs > 60 && herbOut === 0, `the herb layer grows under the canopy and only there (${herbs} in, ${herbOut} out)`);
  assert.ok(herbW / herbs > 0.10, 'its fronds are broad');
  assert.ok(grassIn / (Math.PI * 14 * 14) < grassOut / (Math.PI * (28 * 28 - 15 * 15)) * 0.4, 'the sward thins in the stand\'s shade');
  wood.dispose();
}

// 4. Determinism and seeds; the quality knob halves the sward.
{
  const twin = createTallGrass(field, { seed: 11, tier: 'desktop', biome: meadow, blocked, qualityScale: () => 1 });
  settle(twin, cam);
  assert.equal(twin.near.count, grass.near.count);
  assert.deepEqual([...twin.near.instanceMatrix.array.slice(0, grass.near.count * 16)], [...grass.near.instanceMatrix.array.slice(0, grass.near.count * 16)], 'same seed, same sward');
  const other = createTallGrass(field, { seed: 12, tier: 'desktop', biome: meadow, blocked, qualityScale: () => 1 });
  settle(other, cam);
  assert.notDeepEqual([...other.near.instanceMatrix.array.slice(0, 64)], [...grass.near.instanceMatrix.array.slice(0, 64)], 'another seed grows differently');
  const half = createTallGrass(field, { seed: 11, tier: 'desktop', biome: meadow, blocked, qualityScale: () => 0.5 });
  settle(half, cam);
  assert.ok(half.near.count > grass.near.count * 0.4 && half.near.count < grass.near.count * 0.62, `Medium halves the sward (${half.near.count} vs ${grass.near.count})`);
  twin.dispose(); other.dispose(); half.dispose();
}

// Expanded far grass must fill the actual outer fringe, including after streaming across cell boundaries.
{
  const wide = createTallGrass({ getHeightAt: () => 0 }, {
    seed: 712, biome: { ...meadow, density: 1.3 }, tier: 'desktop', qualityScale: () => 1,
  });
  for (const x of [23.9, 24.1, 263.9, 264.1]) {
    const eye = new THREE.Vector3(x, 2, 23.9);
    settle(wide, eye);
    const far = wide.getState().far;
    assert.equal(far.pending, 0, 'expanded ring finishes streaming');
    assert.equal(far.truncated, 0, 'dense grass retains the outer cells');
    assert.ok(far.cached <= TALL_GRASS.cacheCells, 'expanded cache stays bounded');
    const fringe = [0, 0, 0, 0];
    for (const [px, , pz] of roots(wide.far)) {
      const dx = px - eye.x, dz = pz - eye.z, d = Math.hypot(dx, dz);
      if (d < 200 || d > 235) continue;
      fringe[(dx < 0 ? 1 : 0) + (dz < 0 ? 2 : 0)]++;
    }
    assert.ok(fringe.every(n => n > 100), `grass reaches all four outer quadrants: ${fringe}`);
  }
  wide.dispose();
}

// 5. A live knob change re-seeds the rings.
{
  let q = 1;
  const live = createTallGrass(field, { seed: 11, tier: 'desktop', biome: meadow, blocked, qualityScale: () => q });
  settle(live, cam);
  const full = live.near.count;
  q = 0.25; settle(live, cam);
  assert.ok(live.near.count < full * 0.4, `Low keeps a quarter (${live.near.count} vs ${full})`);
  assert.equal(live.getState().quality, 0.25);
  q = 0; live.update(1 / 60, cam); assert.equal(live.near.count, 0, 'a zero knob clears the sward');
  live.dispose();
}

// 6. Streaming: one cell east builds one column; the return trip is served from the cache; the cache is bounded.
{
  const before = grass.getState().near.builds;
  const east = new THREE.Vector3(TALL_GRASS.near.cellM + 1, 2, 0);
  settle(grass, east);
  assert.equal(grass.getState().near.builds, before + TALL_GRASS.near.ring * 2 + 1, 'one new column of near cells');
  settle(grass, cam);
  assert.equal(grass.getState().near.builds, before + TALL_GRASS.near.ring * 2 + 1, 'the return trip built nothing');
  assert.equal(grass.near.count, state.near.count, 'the cached ring republishes identically');
  for (let i = 0; i < 60; i++) settle(grass, new THREE.Vector3(i * TALL_GRASS.near.cellM, 2, 400));
  assert.ok(grass.getState().near.cached <= TALL_GRASS.cacheCells, 'the cell cache is bounded');
}

// 7. Reeds are a MARGIN (round 73b): densest at the waterline, gone by the open water, the bank's meadow thinner than
//    the margin; a meadow with a reed margin (Monsoon's) grows tall olive reeds along its lake; a plain meadow keeps
//    off the water. The fixture's water mask ramps from 0 at z = 0 to 1 at z = −40 (the waterline class 0.04–0.12 at
//    z −1.6..−4, the open-water cut 0.4 at z = −16).
{
  const wetField = { ...field, getWaterMaskAt: (x, z) => (z < -40 ? 1 : z < 0 ? -z / 40 : 0), getGroundType: () => 'medium', _villageMask: () => 0 };
  const band = (list, z0, z1, x0 = -60, x1 = 60) => list.filter(([x, , z]) => z >= z0 && z < z1 && x >= x0 && x < x1 && Math.abs(x - 5) >= 12).length / ((z1 - z0) * (x1 - x0 - 24));
  const reeds = createTallGrass(wetField, { seed: 3, tier: 'desktop', biome: resolveGroundReduxProfile('delta').grass, blocked, qualityScale: () => 1 });
  settle(reeds, cam);
  const rr = roots(reeds.near);
  assert.ok(rr.some(([, , z]) => z < -2 && z >= -7), 'reeds stand along the waterline');
  assert.ok(rr.every(([, , z]) => z > -16.5), 'and never past the open-water cut (mask 0.4)');
  const marginD = band(rr, -7, -2), midD = band(rr, -15, -10), bankD = band(rr, 2, 14);
  assert.ok(marginD > midD * 2.5, `the margin is dense at the waterline and thins toward the open water (${marginD.toFixed(2)} vs ${midD.toFixed(2)} per m²)`);
  assert.ok(bankD > 0 && bankD < marginD * 0.9, `the bank's meadow is thinner than the margin (${bankD.toFixed(2)} vs ${marginD.toFixed(2)} per m²)`);
  const rb = blades(reeds.near);
  const tall = (list, roots_, z0, z1) => { let s = 0, n = 0; list.forEach(([, h], i) => { const z = roots_[i][2]; if (z >= z0 && z < z1) { s += h; n++; } }); return s / n; };
  assert.ok(tall(rb, rr, -7, -2) > tall(rb, rr, 2, 14) * 1.1, 'reeds at the waterline stand taller than the bank meadow');
  reeds.dispose();
  const monsoon = createTallGrass(wetField, { seed: 3, tier: 'desktop', biome: resolveGroundReduxProfile('monsoon').grass, blocked, qualityScale: () => 1 });
  settle(monsoon, cam);
  const mr = roots(monsoon.near), mb = blades(monsoon.near), mc = monsoon.near.instanceColor.array;
  assert.ok(band(mr, -7, -2) > 0.3 && band(mr, -7, -2) < band(mr, 2, 14), 'a meadow with a reed margin grows reeds along its lake, sparser than the meadow');
  assert.ok(mr.every(([, , z]) => z > -16.5), 'and none on the open water');
  assert.ok(tall(mb, mr, -7, -2) > 1.5, `margin reeds are tall (${tall(mb, mr, -7, -2).toFixed(2)} m)`);
  let olive = 0, green = 0, on = 0, off = 0;
  mr.forEach(([, , z], i) => { const ratio = mc[i * 3 + 2] / mc[i * 3 + 1]; if (z < -2 && z >= -7) { olive += ratio; on++; } else if (z >= 2) { green += ratio; off++; } });
  assert.ok(olive / on < green / off * 0.7, 'margin reeds are olive (less blue in the tint than the meadow)');
  monsoon.dispose();
  const dry = createTallGrass(wetField, { seed: 3, tier: 'desktop', biome: meadow, blocked, qualityScale: () => 1 });
  settle(dry, cam);
  assert.ok(roots(dry.near).every(([, , z]) => z > -1.3), 'a meadow without a reed margin keeps off the water band (the mask under 0.03 is dry ground)');
  dry.dispose();
}

// 7b. Tundra sedge keeps to the hollows and the lee sides in clumps (round 73b): the open windward snowfield is
//     nearly bare, the hollow carries the clumps; the whole ring is sparse beside a meadow's.
{
  // (the winter map's sedge: Whiteout Station's ice grows none since trees round 2b)
  const wind = resolveGroundReduxProfile('winter').grass.windDir;
  // the lee slope (its downhill direction along the wind) south of z −20, the windward slope north of z 20, flat between
  const snowField = { ...field, getNormalAt: (x, z) => (z > 20 ? { x: -wind[0] * 0.3, y: 0.95, z: -wind[1] * 0.3 } : z < -20 ? { x: wind[0] * 0.3, y: 0.95, z: wind[1] * 0.3 } : { x: 0, y: 1, z: 0 }),
    getWaterMaskAt: () => 0, _villageMask: () => 0, _foldAt: (x, z) => (Math.hypot(x + 8, z - 8) < 7 ? 0.9 : 0) };
  const sedge = createTallGrass(snowField, { seed: 9, tier: 'desktop', biome: resolveGroundReduxProfile('winter').grass, blocked, qualityScale: () => 1 });
  settle(sedge, cam);
  const sr = roots(sedge.near);
  const hollowD = perM2(sr, -8, 8, 6), openD = perM2(sr, 12, -20, 8);
  const windwardD = sr.filter(([x, , z]) => z > 24 && z < 44 && x > -30).length, leeD = sr.filter(([x, , z]) => z < -24 && z > -44 && x > -30).length;
  assert.ok(hollowD > openD * 6, `the sedge clumps in the hollow (${hollowD.toFixed(2)} vs ${openD.toFixed(3)} per m² on open flat snow)`);
  assert.ok(leeD > windwardD * 1.6, `and favours the lee slope (${leeD} lee vs ${windwardD} windward)`);
  assert.ok(sedge.near.count < state.near.count * 0.25, `the whole ring is sparse beside a meadow's (${sedge.near.count} vs ${state.near.count})`);
  sedge.dispose();
}

// 8. The shader: every dimension from the instance attribute, the press from the field, the shadow at the root,
//    the scope corridor, the lens clear, the root-to-tip gradient and the bruise.
{
  const { vertexShader, fragmentShader } = tallGrassShaderSource();
  for (const term of [
    'attribute vec4 aBlade;', 'vec4 p = texture2D(uPress, fract(root.xz / uPressParams.x));', 'float ang = press * uBend;',
    'vec3 up = vec3(pdir.x * sin(ang), cos(ang), pdir.y * sin(ang));', 'worldPosition = modelMatrix * cotGrassShadowWorld;',
    'fade *= mix(1.0, nearBand * rayBand, uSniperFade);', `smoothstep(${TALL_GRASS.lensClearM[0].toFixed(2)}, ${TALL_GRASS.lensClearM[1].toFixed(2)}, dCam)`,
    'float hgt = aBlade.y * fade;', 'float taper = 1.0 - 0.72 * t;',
    // grass r2: the rank dissolve and the distance law (the CPU's tallGrassRank hashes the same fraction), the species
    'float cotRank = fract(cotRnd * 61.73 + 0.37);', 'fade *= clamp((cotShow - cotRank) * 20.0, 0.0, 1.0);',
    'float cotK = uGrassKeep.x / max(dCam, 1.0); cotShow *= min(1.0, cotK * cotK);',
    'if (uGrassKeep.x > 0.0) wid *= clamp(dCam / uGrassKeep.x, 1.0, uGrassKeep.y);',
    'float cotRnd = fract(aBlade.w);', 'float cotCode = floor(aBlade.w);',
  ]) assert.ok(vertexShader.includes(term), `vertex: ${term}`);
  assert.ok(!/aBlade\.w \*/.test(vertexShader), 'every random reads the fraction, never the species code');
  assert.ok(fragmentShader.includes('float head = smoothstep(vHeadT0, vHeadT0 + 0.04, vBladeT); diffuseColor.rgb = mix(diffuseColor.rgb, vHeadCol * uBladeLift, head);'), 'a seed spike or a flower head over the blade\'s top');
  assert.ok(fragmentShader.includes('(1.0 - vHerb)'), 'a frond never cures to straw');
  for (const w of [0.123, 1.5, 4.9995, 5.25]) assert.ok(Math.abs(tallGrassRank(w) - (((w % 1) * 61.73 + 0.37) % 1)) < 1e-9, 'the CPU rank is the shader\'s');
  assert.ok(vertexShader.indexOf('float cotYaw = aBlade.x + position.z;') < vertexShader.indexOf('vec3 transformed;'), 'the yaw is set with the normal, before the strip');
  // (contact round 5) the fine near field read inside its window after the coarse one, eased in from its outer band
  for (const term of [
    'uniform sampler2D uPressFine; uniform vec4 uPressFineParams;', 'if (uPressFineParams.w > 0.5) {',
    'float winF = 1.0 - smoothstep(0.30, 0.38, max(offF.x, offF.y));', 'vec4 pf = texture2D(uPressFine, fract(root.xz / uPressFineParams.x));',
    'press = mix(press, clamp(pf.r, 0.0, 1.0), winF);', 'crush = mix(crush, clamp(pf.a, 0.0, 1.0), winF);',
  ]) assert.ok(vertexShader.includes(term), `vertex (fine field): ${term}`);
  assert.ok(vertexShader.indexOf('vec4 pf = texture2D(uPressFine') > vertexShader.indexOf('vec4 p = texture2D(uPress,')
    && vertexShader.indexOf('vec4 pf = texture2D(uPressFine') < vertexShader.indexOf('float ang = press * uBend;'), 'after the coarse read, before the bend');
  assert.ok(fragmentShader.includes(`diffuseColor.rgb *= mix(uGrassBase * (1.0 - 0.22 * uSwardTone), uGrassTip * (1.0 + 0.06 * uSwardTone), pow(vBladeT, uBladeGamma)) * uBladeLift * (1.0 - ${TALL_GRASS.crushDarken.toFixed(2)} * vBladeCrush);`), 'dark roots, lit tips (per-ring gradient and lift, the sward\'s depth), bruised where crushed');
  assert.ok(TALL_GRASS.crushDarken >= 0.2 && TALL_GRASS.crushDarken <= 0.4, 'a bruise, not a burn');
  assert.ok(fragmentShader.includes('normal = normalize( vNormal );'), 'both faces of a strip light the same way');
  assert.ok(!vertexShader.includes('uv.'), 'no uv attribute: the height fraction is position.y');
}

// 9. The engine hooks: both materials join the cascaded-shadow setup and are released with the tier; the sniper fade.
{
  const calls = [], released = [];
  const csm = createTallGrass(field, { seed: 5, tier: 'desktop', biome: meadow, qualityScale: () => 1,
    setupMaterial: (material, hook) => { calls.push({ material, hook }); material.onBeforeCompile = hook; }, releaseMaterial: (m) => released.push(m) });
  assert.equal(calls.length, 3, 'the near, the mid and the far material are set up once each');
  assert.deepEqual(calls.map((c) => c.material), [csm.near.material, csm.mid.material, csm.far.material]);
  const freshShader = () => ({ uniforms: {}, vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <shadowmap_vertex>', fragmentShader: '#include <common>\n#include <normal_fragment_begin>\n#include <color_fragment>' });
  const shader = freshShader();
  calls[0].hook(shader);
  assert.deepEqual(shader.uniforms.uGrassFade.value.toArray(), [...TALL_GRASS.near.fade], 'the near ring fades out at 38–46 m');
  const midShader = freshShader();
  calls[1].hook(midShader);
  const farShader = freshShader();
  calls[2].hook(farShader);
  assert.deepEqual(farShader.uniforms.uGrassFade.value.toArray(), [...TALL_GRASS.far.fade], 'the far ring fades in at 88–102 m and out at 192–240 m');
  assert.deepEqual(shader.uniforms.uGrassDissolve.value.toArray(), [...TALL_GRASS.near.dissolve], 'the near clumps leave by rank');
  assert.deepEqual(midShader.uniforms.uGrassDissolve.value.toArray(), [...TALL_GRASS.mid.dissolve], 'the mid clumps arrive by rank');
  assert.deepEqual(midShader.uniforms.uGrassKeep.value.toArray(), [TALL_GRASS.mid.keepRefM, TALL_GRASS.mid.widthGrow, 1], 'the mid ring\'s distance law, its blades widening, heads over the upper half');
  assert.deepEqual(shader.uniforms.uGrassKeep.value.toArray(), [0, 1, 0], 'no distance law on the near ring');
  assert.equal(midShader.uniforms.uBladeGamma.value, TALL_GRASS.bladeGamma.far, 'the mid blade is a far blade');
  assert.deepEqual(shader.uniforms.uGrassSeed.value.toArray(), [...TALL_GRASS.species.meadow.seedRgb], 'the biome kind\'s seed colour');
  assert.equal(shader.uniforms.uBladeGamma.value, TALL_GRASS.bladeGamma.near, 'the near clump keeps a dark root');
  assert.equal(farShader.uniforms.uBladeGamma.value, TALL_GRASS.bladeGamma.far, 'the far blade takes its tip colour early (seen from above it is mostly root)');
  assert.ok(TALL_GRASS.bladeGamma.far < TALL_GRASS.bladeGamma.near && TALL_GRASS.farWidth > 1 && TALL_GRASS.farWidth < 2.5);
  assert.equal(shader.uniforms.uBladeLift.value, TALL_GRASS.bladeLift.near);
  assert.equal(farShader.uniforms.uBladeLift.value, TALL_GRASS.bladeLift.far, 'the far ring lifts a third so the mid-distance sward stays as light as the meadow');
  assert.ok(TALL_GRASS.bladeLift.far > 1 && TALL_GRASS.bladeLift.far <= 1.5 && TALL_GRASS.bladeLift.near === 1);
  assert.equal(shader.uniforms.uWindTime, farShader.uniforms.uWindTime, 'one clock, one camera, one press field for both rings');
  csm.setSniperFade(1, true); assert.equal(shader.uniforms.uSniperFade.value, 1);
  csm.setSniperFade(0); csm.update(1, cam); assert.ok(shader.uniforms.uSniperFade.value < 0.01, 'the fade eases out');
  csm.setWindTime(7); assert.equal(shader.uniforms.uWindTime.value, 7);
  csm.dispose();
  assert.deepEqual(released, [csm.near.material, csm.mid.material, csm.far.material], 'dispose releases every material from the shadow setup');
  assert.equal(csm.group.parent, null);
}
grass.dispose();

// 10. The biomes and the wiring: every map, the world, the quality presets.
for (const id of MAP_IDS) {
  const g = createTallGrass(field, { tier: 'desktop', mapId: id, qualityScale: () => 1 });
  assert.equal(g.group.visible, !!resolveGroundReduxProfile(id).grass, `${id}: the sward follows its profile`);
  g.dispose();
}
const map = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
assert.match(map, /createTallGrass\(heightField, \{/, 'the world builds the tier on its height field');
assert.match(map, /blocked: groundCoverClearance\(\)/, 'kept out of the sealed footprints (and the scenery\'s holes)');
assert.match(map, /splatNoise: sampleSplatNoise,/, 'thinned by the terrain\'s own dirt fields');
assert.match(map, /tallGrass\.update\(dt, cameraPos, focusPos, cameraFwd\)/, 'the frame update streams the rings and steps the press');
assert.match(map, /tallGrass\.dispose\(\)/, 'released with the world');
assert.match(map, /tallGrass\.setWindTime\(t\)/, 'frozen with the world clock');
assert.match(map, /tallGrass\.setSniperFade\(f, immediate\)/, 'cleared from the scope with the tufts');
assert.ok(map.includes('setupMaterial: (material, hook) => engineCtx.setupShadowMaterial?.(material, hook),')
  && map.includes('releaseMaterial: (material) => engineCtx.releaseShadowMaterial?.(material),'), 'the world folds the materials into the cascaded-shadow setup');
assert.equal(PRESETS.high.tallGrass, 1); assert.equal(PRESETS.ultra.tallGrass, 1); assert.equal(PRESETS.medium.tallGrass, 0.5); assert.equal(PRESETS.low.tallGrass, 0.25);
assert.equal(PRESETS.mobile.tallGrass, undefined, 'the mobile tier keeps today\'s ground');

// ground lane (2026-10-03, hold 7: shaded straw at 51/81/76 beside sunlit 141/131/90): the shaded sward's light — its
// final indirect term (after the engine's cool shadow dim and bounce) keeps a quarter of its hue over its luminance as far
// as the blade stands in shadow, and the carpet (vegetation.ts) carries the same text
{
  assert.ok(/reflectedLight\.indirectDiffuse = mix\( cotIrr, vec3\( cotL \) \* vec3\( 1\.05, 1\.0, 0\.86 \), 0\.75 \* cotShade \) \* cotAlb;/.test(SHADED_SWARD_GLSL),
    'the shaded sward keeps a quarter of its light\'s hue, warmed a little');
  assert.ok(SHADED_SWARD_GLSL.includes('float cotShade = 1.0 - clamp( cotSunVis, 0.0, 1.0 );'), 'only as far as the blade stands in shadow');
  const vegetationSource = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
  assert.ok(vegetationSource.includes('const SHADED_SWARD_GLSL = /* glsl */ `' + SHADED_SWARD_GLSL + '`;'), 'the carpet carries the same shaded-sward light');
  const tallGrassSource = readFileSync(new URL('./tallGrass.ts', import.meta.url), 'utf8');
  for (const source of [tallGrassSource, vegetationSource]) {
    assert.ok(source.replace(/\s+/g, '').includes("replace('#include<lights_fragment_end>',`#include<lights_fragment_end>\\n${SHADED_SWARD_GLSL}`)"),
      'appended after the chunk (after the engine\'s shadow dim and bounce), not before it');
  }
}
console.log('tallGrass.selftest: blade geometry, gates, a settled ring (exclusions, hollows, shoulders, tints), the mid ring (rank dissolve, distance law, publish trim), species, colour patches and the herb layer, determinism, the quality knob, streaming, the reed margin, the tundra clumps, the shader, the engine hooks and the world wiring passed');
