// Ground lane (2026-10-03): the land use (landUse.ts) — the per-map field system the terrain material draws and the
// tiers that grow on the ground stand on. Pins: every row names a real map and packs into the material's three vec4
// uniforms; the CPU twin is deterministic, lays fields of one crop each in the region's rotation, rings them with a
// margin and agrees on a track from both sides of its boundary; and the GLSL no longer derives the parcels itself —
// the terrain reads this twin baked (landUseBake.selftest pins the bake, its stack and its decode). No GPU or art claim.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyUrbanParcelWear, createLandFieldSample, inLandZone, LAND_BAKE_TRACK_BIT, LAND_CROP, LAND_CROP_ALBEDO, LAND_CROP_GROWTH,
  LAND_CROP_NONE, LAND_USE_GLSL, landUseAt, landUseBoundary, landUseProfileIds, landUseUniformValues, resolveLandUseProfile,
} from './landUse.ts';
import { MAP_IDS } from './maps/catalog.ts';

// the table: real maps, packing in range, zero strength without a row
for (const id of landUseProfileIds()) assert.ok(MAP_IDS.includes(id), `${id} is a map`);
assert.equal(resolveLandUseProfile('no-such-map'), null);
assert.deepEqual(landUseUniformValues(null).landA[0], 0, 'no row: strength 0 (the material draws no fields)');
for (const id of landUseProfileIds()) {
  const p = resolveLandUseProfile(id);
  const v = landUseUniformValues(p);
  assert.ok(v.landA[0] > 0 && v.landA[0] <= 1, `${id}: strength in (0, 1]`);
  assert.ok(v.landA[2] >= 40 && v.landA[3] >= 24, `${id}: blocks at least 40 × 24 m`);
  assert.ok([0, 1, 2, 3].includes(v.landE[2]), `${id}: a boundary id`);
  assert.ok(Number.isInteger(v.landE[0]) && v.landE[0] < 2 ** 20 && Number.isInteger(v.landE[1]) && v.landE[1] < 2 ** 15,
    `${id}: the slot→kind table packs exactly into float32 integers`);
  assert.ok(v.landB[0] >= 1 && v.landB[0] <= 4 && Number.isInteger(v.landB[0]), `${id}: 1..4 fields a block`);
  assert.ok(v.landB[2] >= 0 && v.landB[2] <= 1 && v.landB[3] >= 0 && v.landB[3] <= 1, `${id}: shares in [0, 1]`);
}

// every crop kind has its albedo and its growth row; a kind's albedo is a real ground's (0.02–0.35 a channel)
for (const kind of Object.values(LAND_CROP)) {
  const a = LAND_CROP_ALBEDO[kind], g = LAND_CROP_GROWTH[kind];
  assert.ok(a && a.length === 3 && a.every((c) => c >= 0.02 && c <= 0.35), `crop ${kind}: a measured albedo`);
  assert.ok(g && typeof g.sward === 'boolean' && g.height >= 0 && g.height <= 2 && g.keep <= 1, `crop ${kind}: a growth row`);
}

// every map's rotation: the crops its fields draw are its region's, its boundary is its region's, every field is
// one crop (the CPU twin over a 4 m grid of the square) — but where a works' zone cuts it (Ironworks: LandZone cut)
const cutAt = (p, x, z) => (p.zones ?? []).some((zn) => zn.cut && inLandZone(zn, x, z));
for (const id of landUseProfileIds()) {
  const p = resolveLandUseProfile(id);
  const seen = new Map();
  const sample = createLandFieldSample();
  for (let z = -500; z <= 500; z += 8) for (let x = -500; x <= 500; x += 8) {
    landUseAt(p, x, z, sample);
    if (!sample.active) continue; // a zoned land use's ground past its zones (Ruinspires)
    assert.equal(sample.boundary, ['margin', 'ditch', 'bund', 'wall'].indexOf(landUseBoundary(p)), `${id}: the sample carries the region's boundary`);
    if (cutAt(p, x, z)) continue;
    const prior = seen.get(sample.id);
    if (prior === undefined) seen.set(sample.id, sample.crop); else assert.equal(prior, sample.crop, `${id}: one crop a field`);
    assert.deepEqual([sample.tintR, sample.tintG, sample.tintB], [...LAND_CROP_ALBEDO[sample.crop]], `${id}: the sample carries its crop's albedo`);
  }
  const kinds = new Set(seen.values());
  assert.ok(kinds.size >= 3, `${id}: at least three crops sown (${[...kinds].join(',')})`);
}
// 2026-10-05, Ruinspires (the cities lane): a zoned, urban land use — the urban flag on the cities' rows alone (Ruinspires
// and Ironworks; every other map's village keeps its fields off), carried on the sample for the tiers that grow on the
// ground. (2026-10-07, the ground lane on the cities lane's Miljacka valley, 5c04ab6cc) the floor's hardstanding along
// the river's own line, the back lots behind the avenue rows and the benches' orchards overgrown, the flanks' gardens
// green, the cemeteries' mown grass where the map puts them, no dug plot anywhere in the city (waves 186/187: the furrows
// read as "stretched sand-ripple banding"), nothing past the city but the parks that straddle its edge
const URBAN = new Map([['ruinspires', 1], ['foundry', 2]]); // (2: a works' ground — Ironworks)
{
  const p = resolveLandUseProfile('ruinspires'), s = createLandFieldSample();
  assert.equal(landUseUniformValues(p).landE[3], 1, 'ruinspires: an urban land use');
  for (const id of landUseProfileIds()) {
    assert.equal(landUseUniformValues(resolveLandUseProfile(id)).landE[3], URBAN.get(id) ?? 0, `${id}: ${URBAN.has(id) ? '' : 'not '}urban`);
  }
  const riverZ = (x) => 60 * Math.sin((Math.PI * x) / 800); // maps/ruinspires.ts riverZ (pinned below against its source)
  const parks = [[-330, 322, 46], [330, -322, 46], [236, 330, 40], [-236, -330, 40]];
  const inPark = (x, z) => parks.some(([px, pz, r]) => (x - px) ** 2 + (z - pz) ** 2 < (r + 30) ** 2);
  const floor = new Set(), back = new Map(), garden = new Map(), cemetery = [0, 0], cemeteryRot = [0, 0];
  let past = 0, pastActive = 0, dug = 0;
  for (let z = -500; z <= 500; z += 3) for (let x = -500; x <= 500; x += 3) {
    landUseAt(p, x, z, s);
    if (s.active) assert.equal(s.urban, 1, 'an urban field says so');
    if (s.active && s.crop === LAND_CROP.plough) dug++;
    const dz = Math.abs(z - riverZ(x));
    if (dz < 40 && Math.abs(x) < 300 && s.active) floor.add(s.crop);
    if (dz > 80 && dz < 110 && Math.abs(x) < 300 && s.active) back.set(s.crop, (back.get(s.crop) ?? 0) + 1);
    if (Math.abs(z) > 200 && Math.abs(z) < 260 && dz > 150 && Math.abs(x) < 300 && !(Math.abs(x + 50) < 40 && Math.abs(z - 244) < 30)
      && !(Math.abs(x - 50) < 40 && Math.abs(z + 244) < 30) && s.active) garden.set(s.crop, (garden.get(s.crop) ?? 0) + 1);
    if (x > -74 && x < -26 && z > 232 && z < 256) { cemetery[1]++; if (s.active && s.crop === LAND_CROP.hay) cemetery[0]++; }
    if (-x > -74 && -x < -26 && -z > 232 && -z < 256) { cemeteryRot[1]++; if (s.active && s.crop === LAND_CROP.hay) cemeteryRot[0]++; }
    if ((Math.abs(z) > 330 || Math.abs(x) > 390) && !inPark(x, z)) { past++; if (s.active) pastActive++; }
  }
  assert.ok([...floor].every((c) => [LAND_CROP.hardstanding, LAND_CROP.ballast, LAND_CROP.ruderal].includes(c)) && floor.size === 3,
    `the valley floor along the river is hardstanding (${[...floor].join(',')})`);
  const share = (m, kinds) => [...m].reduce((a, [c, n]) => a + (kinds.includes(c) ? n : 0), 0) / Math.max(1, [...m].reduce((a, [, n]) => a + n, 0));
  assert.ok(share(back, [LAND_CROP.ruderal, LAND_CROP.pasture]) > 0.8, `the back lots are overgrown (${[...back].join(' ')})`);
  assert.ok(share(garden, [LAND_CROP.pasture, LAND_CROP.hay]) > 0.6, `the flanks' gardens are green (${[...garden].join(' ')})`);
  assert.ok(cemetery[0] / cemetery[1] > 0.6 && cemeteryRot[0] / cemeteryRot[1] > 0.6,
    `both cemeteries are mown grass (${cemetery[0]}/${cemetery[1]}, ${cemeteryRot[0]}/${cemeteryRot[1]})`);
  assert.equal(dug, 0, 'no dug plot in the city: its furrows read as sand ripples');
  assert.equal(pastActive, 0, `nothing past the city but its parks (${past} points)`);
  const map = readFileSync(new URL('./maps/ruinspires.ts', import.meta.url), 'utf8');
  assert.ok(map.includes('const RIVER_AMP = 60, RIVER_L = 800;') && map.includes('const riverZ = (x: number) => RIVER_AMP * Math.sin(Math.PI * x / RIVER_L);'),
    'the land use\'s Miljacka is the map\'s river line');
  const streets = readFileSync(new URL('./maps/sarajevoStreets.ts', import.meta.url), 'utf8');
  assert.ok(streets.includes('{ x: -50, z: 244, hx: 30, hz: 18 }, { x: 50, z: -244, hx: 30, hz: 18 },'),
    'the mown cemeteries stand on the street kit\'s cemetery plots (60 x 36 m)');
}
// (2026-10-07) the urban parcels set the town's wear: the grass and mown grass a sixth of the village's wear, the beds and
// arbours a quarter, rank grass two thirds, the hardstanding, a track and past the land use all of it — and the material
// build applies it on an urban land use alone
{
  const n = 4, mask = new Uint8Array(n * n * 4).fill(200), bake = new Uint8Array(n * n * 4);
  const set = (k, crop, track = false) => { bake[k * 4] = crop | (track ? LAND_BAKE_TRACK_BIT : 0); };
  set(0, LAND_CROP.pasture); set(1, LAND_CROP.hay); set(2, LAND_CROP.rowCrop); set(3, LAND_CROP.ruderal);
  set(4, LAND_CROP.hardstanding); set(5, LAND_CROP.pasture, true); set(6, LAND_CROP_NONE); set(7, LAND_CROP.ballast);
  for (let k = 8; k < 16; k++) set(k, LAND_CROP_NONE);
  applyUrbanParcelWear(mask, bake, n);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((k) => mask[k * 4 + 3]), [32, 32, 50, 130, 200, 200, 200, 200],
    'the wear by parcel: grass and mown grass a sixth, beds a quarter, rank grass two thirds, the rest kept');
  assert.deepEqual([0, 1, 2].map((c) => mask[c]), [200, 200, 200], 'only the wear channel moves');
  const terrainSrc = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
  assert.ok(terrainSrc.includes('if (landBake && landUseProfile?.urban) applyUrbanParcelWear(mask.image.data as Uint8Array, landBake, landBakeN);'),
    'the build applies the parcels\' wear on an urban land use, after the bake and before the mask is stacked');
}
// 2026-10-05, Ironworks (the cities lane: "slag round the blast furnaces and along the works roads, gravel in the courts,
// ballast on every rail siding"): its zones change the crops inside the works and nothing else — the layout, every
// field's edge, track, hedge, rows and draw are the unzoned profile's on the whole map (so the scrub's hedge seats and
// their collision stand where they stood), and past the works floor the crop is too (the border's parcels); the sidings
// are ballast and cinder, the furnace block slag, the loading court gravel, the works roads' verges cinder
{
  const p = resolveLandUseProfile('foundry'), old = { ...p, zones: undefined, urban: false, works: false, marginM: 1.6 };
  const s = createLandFieldSample(), o = createLandFieldSample();
  const kindsIn = { sidings: new Map(), furnace: new Map(), court: new Map(), floor: new Map() };
  const count = (m, c) => m.set(c, (m.get(c) ?? 0) + 1);
  for (let z = -520; z <= 520; z += 4) for (let x = -520; x <= 520; x += 4) {
    landUseAt(p, x, z, s); landUseAt(old, x, z, o);
    // (the margin's width is the works' own — a lot's trodden edge, 0.8 m where a field's grass margin was 1.6 — and no
    // seat reads it)
    for (const key of ['active', 'edgeM', 'endM', 'sU', 'sV', 'split', 'alongU', 'track', 'hedge', 'rowX', 'rowZ', 'jitter', 'id', 'boundary']) {
      assert.equal(s[key], o[key], `foundry (${x}, ${z}): the layout's ${key} is the unzoned profile's`);
    }
    // (a field's middle decides its zone: one whose middle lies on the works floor reaches half a block and the warp past
    // it, ~75 m)
    if (Math.max(Math.abs(x), Math.abs(z)) > 370) assert.equal(s.crop, o.crop, `foundry (${x}, ${z}): past the works the crop is the brownfield's`);
    assert.equal(s.urban, 1, 'the works: an urban land use');
    // (the works' zones cut the fields: they hold to their own lines — mr1's world at 9bb7490b3)
    const nearLine = [40, 49, 58, 67, 76].some((lx) => Math.abs(x - lx) < 3);
    if (nearLine && Math.abs(z) < 140) count(kindsIn.sidings, s.crop);
    else if (Math.hypot(x + 74, z + 29) < 22 || Math.hypot(x + 20.6, z - 58.2) < 22) count(kindsIn.furnace, s.crop);
    else if (x > 140 && x < 172 && z > -158 && z < -128) count(kindsIn.court, s.crop);
    else if (s.edgeM < 8 || Math.abs(x) > 250 || Math.abs(z) > 250) continue; // the floor's zone is a field's middle's
    else if (!cutAt(p, x, z)) count(kindsIn.floor, s.crop);
  }
  const share = (m, kinds) => { let n = 0, t = 0; for (const [c, k] of m) { t += k; if (kinds.includes(c)) n += k; } return t ? n / t : 0; };
  assert.ok(share(kindsIn.sidings, [LAND_CROP.ballast, LAND_CROP.slag]) > 0.9, `the sidings are ballast and cinder (${[...kindsIn.sidings]})`);
  assert.ok(share(kindsIn.furnace, [LAND_CROP.slag]) > 0.5, `round the furnaces slag (${[...kindsIn.furnace]})`);
  assert.ok(share(kindsIn.court, [LAND_CROP.gravel, LAND_CROP.hardstanding, LAND_CROP.ballast]) > 0.9 && kindsIn.court.has(LAND_CROP.gravel),
    `the loading court is gravel and its stands (${[...kindsIn.court]})`);
  assert.ok(kindsIn.floor.has(LAND_CROP.gravel) && !kindsIn.floor.has(LAND_CROP.pasture), `the works floor's courts are gravel, none grazed (${[...kindsIn.floor]})`);
}
// the slot→kind table: the classic regions keep their identity order (their crops are what they were)
for (const id of ['verdant', 'coastal', 'frontier']) {
  const v = landUseUniformValues(resolveLandUseProfile(id));
  assert.deepEqual([v.landE[0], v.landE[1]], [0 + 32 * 1 + 1024 * 2 + 32768 * 3, 4 + 32 * 5 + 1024 * 6], `${id}: slots 0..6 are crops 0..6`);
  assert.equal(v.landE[2], 0, `${id}: a grass margin`);
}
assert.equal(landUseBoundary(resolveLandUseProfile('polders')), 'ditch');
assert.equal(landUseBoundary(resolveLandUseProfile('delta')), 'bund');
assert.equal(landUseBoundary(resolveLandUseProfile('saltwind')), 'wall');

// the twin over Amberford: determinism, one crop per field, the rotation, margins and tracks
const verdant = resolveLandUseProfile('verdant');
assert.ok(verdant, 'Amberford carries the steppe field system');
const s = createLandFieldSample(), t = createLandFieldSample();
const hist = new Map();
const fields = new Map();
let trackPts = 0, marginPts = 0, n = 0;
for (let z = -500; z <= 500; z += 4) {
  for (let x = -500; x <= 500; x += 4) {
    landUseAt(verdant, x, z, s);
    landUseAt(verdant, x, z, t);
    assert.deepEqual({ ...s }, { ...t }, 'the twin is a pure function of the point');
    assert.equal(s.active, 1);
    n++;
    hist.set(s.crop, (hist.get(s.crop) ?? 0) + 1);
    if (s.track > 0.5) trackPts++;
    if (s.edgeM < s.marginM) marginPts++;
    const prior = fields.get(s.id);
    if (prior === undefined) fields.set(s.id, s.crop);
    else assert.equal(prior, s.crop, `field ${s.id} carries one crop`);
    assert.ok(Math.abs(Math.hypot(s.rowX, s.rowZ) - 1) < 1e-9, 'the row direction is a unit vector');
    assert.ok(s.marginM >= verdant.marginM * 0.7 - 1e-9 && s.marginM <= verdant.marginM * 1.3 + 1e-9, 'the margin stays within ±30 %');
  }
}
assert.ok(fields.size >= 30, `a battlefield of fields, not a few (${fields.size})`);
for (const crop of [LAND_CROP.pasture, LAND_CROP.wheat, LAND_CROP.barley, LAND_CROP.green, LAND_CROP.plough, LAND_CROP.stubble]) {
  assert.ok((hist.get(crop) ?? 0) / n > 0.03, `crop ${crop} is sown somewhere (${((hist.get(crop) ?? 0) / n * 100).toFixed(1)} %)`);
}
assert.ok(trackPts / n > 0.005 && trackPts / n < 0.08, `tracks are lines, not fields (${(trackPts / n * 100).toFixed(2)} %)`);
assert.ok(marginPts / n > 0.01 && marginPts / n < 0.15, `margins ring the fields (${(marginPts / n * 100).toFixed(2)} %)`);

// a track is the boundary's, not a block's: both sides of a long boundary agree on it
{
  const ch = Math.cos(verdant.heading), sh = Math.sin(verdant.heading);
  let agree = 0, checked = 0;
  for (let i = 0; i < 400; i++) {
    // walk across the rows (the v axis) and find the row lines by the boundary distance minimum
    const u = -300 + (i % 20) * 31, v0 = -400 + Math.floor(i / 20) * 41;
    let best = null;
    for (let dv = 0; dv < 160; dv += 0.5) {
      const qv = v0 + dv, x = ch * u - sh * qv, z = sh * u + ch * qv;
      landUseAt(verdant, x, z, s);
      if (s.track > 0.99 && (best === null || s.edgeM < best.edge)) best = { edge: s.edgeM, x, z };
    }
    if (!best) continue;
    // one metre to either side across the line
    landUseAt(verdant, best.x - sh * 1.0 * -1, best.z + ch * 1.0 * -1, s);
    landUseAt(verdant, best.x - sh * 1.0, best.z + ch * 1.0, t);
    checked++;
    if (Math.abs(s.track - t.track) < 0.05) agree++;
  }
  assert.ok(checked > 20 && agree / checked > 0.95, `both sides of a track agree (${agree}/${checked})`);
}

// the rotation's packed shares climb (the twin's packing receipt; the border lane reads them), and the GLSL holds no
// second derivation: the terrain reads this twin's bake (landUseBake.selftest), so there is one field system
{
  for (const id of landUseProfileIds()) {
    const v = landUseUniformValues(resolveLandUseProfile(id));
    const cum = [...v.landD, v.landC[2], v.landC[3]];
    for (let i = 1; i < cum.length; i++) assert.ok(cum[i] >= cum[i - 1] - 1e-12, `${id}: the cumulative shares climb`);
    assert.ok(cum[5] <= 1 + 1e-9 && cum[0] >= 0, `${id}: shares within [0, 1]`);
  }
  assert.ok(!/lu_hash|lu_rand|lu_crop|lu_kind/.test(LAND_USE_GLSL), 'the GLSL no longer derives the parcels per pixel (the bake is the one source)');
  assert.ok(/void lu_field\(vec2 p,/.test(LAND_USE_GLSL) && /texelFetch\(uMask,/.test(LAND_USE_GLSL), 'lu_field reads the bake');
  assert.ok(!/sampler2D/.test(LAND_USE_GLSL), 'the field layout takes no sampler (the material sits at 16 units)');
}

// 2026-10-06 (Ironworks round 3, wave 176's "stair-stepped diagonal green band" — the ore berm's flanks past the fields'
// slope gate, the meadow under the land use showing through): a works' lots run up its berms to ~40° and are gone by ~53°,
// the material and the two tiers on the ground reading the one gate, and the sample carries the works flag for them
{
  const { readFileSync } = await import('node:fs');
  const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  const terrain = read('./terrain.ts'), grass = read('./tallGrass.ts'), veg = read('./vegetation.ts');
  assert.ok(terrain.includes('(1.0 - (uLandE.w > 1.5 ? smoothstep(0.22, 0.40, slope) : smoothstep(0.040, 0.100, slope)))'),
    'the material: a works\' lots to ~40°, every other map\'s fields to ~25°');
  assert.ok(grass.includes('(1 - (_field.works ? smoothstep(0.22, 0.40, slopeN) : smoothstep(0.04, 0.10, slopeN)))'),
    'the tall grass reads the same gate');
  assert.ok(veg.includes('(1 - (f.works ? smoothstepJs(0.22, 0.40, 1 - normalY) : smoothstepJs(0.04, 0.10, 1 - normalY)))'),
    'the tufts read the same gate');
  const s0 = createLandFieldSample();
  landUseAt(resolveLandUseProfile('foundry'), 0, -72, s0);
  assert.equal(s0.works, 1, 'Ironworks\' ground is a works\' ground');
  landUseAt(resolveLandUseProfile('verdant'), 0, 0, s0);
  assert.equal(s0.works, 0, 'a farm is not');
  // a works' paving carries its soot, oil and rust, and its outer joints its cinder — on a works' ground alone
  assert.ok(terrain.includes('if (uLandE.w > 1.5 && paveCore > 0.003) {') && terrain.includes('uLandE.w > 1.5 ? vec3(0.62, 0.60, 0.58) : vec3(0.70, 0.96, 0.50)'),
    'the works\' paving and joints are stained on a works\' ground only');
}

// 2026-10-07 (Ironworks round 4, wave 223: "no black slag, cinder or soot anywhere", "white-outlined orange patches", "two
// flat brown squares", "the highline banks are pale, snow-like mounds", "pale grass-blade sprites"): on a works' ground
// (uLandE.w 2) its slag is black-grey (one colour, worksSlag, for its lots, its rock layer, its steep pass, its bare ground,
// its tracks and its wear), its margins a sooty seam of the lot's own ground, its banks past the lots' gate slag, its bare
// ground (the hardstands among it) cinder, and its gravel thinly weeded; every other map's slag, margins, tracks, wear,
// bare ground and rock as they were
{
  const { readFileSync } = await import('node:fs');
  const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
  const uses = (terrain.match(/worksSlag\(n1h, n2, /g) || []).length;
  assert.ok(/vec3 worksSlag\(float n1h, float n2, float jit\) \{/.test(terrain) && uses >= 6, `one works' slag colour, read by every works surface (${uses})`);
  assert.ok(terrain.includes('cropCol = uLandE.w > 1.5 ? worksSlag(n1h, n2, jit)\n          : mix(vec3(0.068, 0.068, 0.072), vec3(0.090, 0.072, 0.060), smoothstep(0.40, 0.75, n1h)) * (0.85 + 0.30 * jit);'),
    'a works\' slag lots black-grey; every other map\'s slag as it was');
  assert.ok(terrain.includes('if (uLandE.w > 1.5) fR = max(fR, smoothstep(0.22, 0.40, slope) * gWorksFloor * (1.0 - roadCore));'),
    'a works\' banks are slag from where its lots end, inside its floor');
  assert.ok(terrain.includes('gWorksFloor = (kc >= 15 && kc <= 16) || (kc >= 18 && kc <= 19) ? 1.0 : 0.0;'), 'the works floor is its zones\' own ground kinds, read from the bake');
  assert.ok(terrain.includes('vec3 marginCol = uLandE.w > 1.5 ? a.rgb * (0.78 + 0.16 * n1h)'), 'a works\' margins are a seam of the lot\'s own ground');
  assert.ok(terrain.includes('vec3 soilL = uLandE.w > 1.5 ? worksSlag(n1h, n2, 0.5) * 1.25 : soil.rgb * uSoilTint;'), 'its tracks trodden cinder');
  assert.ok(/if \(uLandE\.w > 1\.5\) \{\n      float wkD = gWorksFloor;/.test(terrain), 'its bare ground cinder inside its floor');
  assert.ok(terrain.includes("mix(a.rgb, uLandE.w > 1.5 ? worksSlag(n1h, n2, 0.5) * 1.12 : uMeanD.rgb * vec3(1.02, 0.98, 0.92),"), 'its wear its cinder');
  assert.ok(terrain.includes('if (uLandE.w > 1.5) roadCol = mix(roadCol, worksSlag(n1h, n2, 0.5) * 1.30, 0.80 * gWorksFloor);'), 'its roads and yards trodden cinder');
  assert.ok(terrain.includes('float worksPad = uLandE.w > 1.5 ? (1.0 - smoothstep(0.05, 0.25, mk.g)) : 0.0;'), 'its paved hardstands cinder');
  assert.ok(terrain.includes('if (gWorksFloor > 0.5 && fD < 0.998) {'), 'its floor\'s turf cinder too (no green strip down its roads)');
  assert.equal(LAND_CROP_GROWTH[19].keep, 0.035, 'a court\'s gravel thinly weeded');
  assert.equal(LAND_CROP_GROWTH[15].sward, false, 'the slag bare');
}

console.log(`landUse: ${landUseProfileIds().length} map row(s), ${fields.size} Amberford fields, crops ${[...hist.entries()].sort().map(([c, k]) => `${c}:${(k / n * 100).toFixed(0)}%`).join(' ')}, tracks agree across their boundary, the GLSL reads the bake PASS; no GPU/art claim`);
