// Round 72 (2026-09-25): the ring's mountain relief and its baked surface (horizonRelief.ts) and the far range
// (horizonFarRange.ts) — deterministic from the map seed, bounded, per-map character keys, the bake's sizes and
// ranges, the far range under a map's cloud deck, and the ring geometry's relief within the receipts' own laws.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  HORIZON_COVER_RADIUS_M, HORIZON_RELIEF_AO_DEPTH, HORIZON_RELIEF_AO_POWER, HORIZON_RELIEF_BAKE_R0, HORIZON_RELIEF_BAKE_R1, HORIZON_STAND_HANDOVER_M,
  HORIZON_RELIEF_CHARACTERS, HORIZON_RELIEF_GRAD_SCALE, HORIZON_RELIEF_SHADE, HORIZON_RELIEF_SUN_DEPTH,
  bakeHorizonRelief, createHorizonReliefField, encodeCanopyAo, encodeCanopySun, resolveHorizonRelief, resolveHorizonReliefCharacter,
} from './horizonRelief.ts';
import { RING_RELIEF_SHADE } from './horizonAutumnGround.ts';
import { HORIZON_FAR_FOOT_M, HORIZON_FAR_ROWS, HORIZON_FAR_SEGMENTS, resolveFarRangeAmp, sampleHorizonFarRange } from './horizonFarRange.ts';
import { Matrix4, Texture, Vector3, Vector4 } from 'three';
import { HORIZON_SEGMENTS, buildHorizonRing, resolveHorizonLightingGains, sampleHorizonGeometry } from './maps/horizon.ts';
import { seaOpeningWeight } from './edgeWater.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { createHeightField } from './terrain.ts';

// --- the characters ---------------------------------------------------------------------------------------------
assert.deepEqual([...HORIZON_RELIEF_CHARACTERS].sort(), ['alpine', 'coastal', 'karst', 'martian', 'mesa', 'polar', 'rolling', 'volcanic'],
  'eight mountain characters');
for (const character of HORIZON_RELIEF_CHARACTERS) {
  const s = resolveHorizonRelief(character);
  assert.equal(s.character, character);
  assert.ok(s.lowAmpM >= 5 && s.lowAmpM <= 60, `${character}: the coarse relief stays within the row ladder's reach (${s.lowAmpM} m)`);
  assert.ok(s.highAmpM >= 3 && s.highAmpM <= 16, `${character}: the fine relief stays a surface term (${s.highAmpM} m)`);
  assert.ok(s.wavelengthM >= 180 && s.wavelengthM <= 480, `${character}: the first octave is a ridge, not a hill or a boulder`);
  assert.ok(s.crestSharpness >= s.footSharpness, `${character}: crests are at least as sharp as the foot`);
  assert.ok(s.gullyM >= 1 && s.gullyM <= 7 && s.gullyElongation >= 3, `${character}: gullies are shallow and elongated downslope`);
  assert.ok(s.aoStrength > 0.4 && s.aoStrength <= 0.85 && s.aoReachM >= 100 && s.aoReachM <= 200, `${character}: the occlusion is a shading term with a bounded reach`);
  assert.ok(s.far && s.far.ampM >= 250 && s.far.ampM <= 1100 && s.far.hazeIn < s.far.hazeOut && s.far.hazeOut <= 0.86,
    `${character}: the far range's peaks and haze are bounded`);
}
// the per-map keys: identity first, the style second, the authored key over both (2026-10-05, the map-revival lane:
// Orchard Valley's ring rolls as Mount Lebanon's rounded ridges over its alpine border, gauntlet wave 123)
// (Suzhou Creek, blackglass's id, authors the delta's coastal relief over its old volcanic identity: the map-revival lane)
const expectedCharacter = {
  // (2026-10-05, the map-revival lane's Caldera round 2: Aso's rim is a wooded, grassy wall, authored `relief: 'rolling'`)
  whiteout: 'polar', winter: 'polar', caldera: 'rolling', blackglass: 'coastal', mars: 'martian', monsoon: 'karst', mangrove: 'karst',
  coastal: 'coastal', saltwind: 'coastal', polders: 'coastal', fjord: 'alpine', alpine: 'alpine', orchard: 'rolling', reservoir: 'rolling',
  // (batch 4: Copper Mesa is Queenstown under the West Coast Range, its ring style 'alpine' — the map-revival lane)
  desert: 'mesa', badlands: 'mesa', titan_gorge: 'mesa', skybridge: 'mesa', copper_mesa: 'alpine',
  verdant: 'rolling', urban: 'rolling', railyard: 'rolling', oasis: 'rolling',
};
for (const [mapId, character] of Object.entries(expectedCharacter)) {
  assert.equal(resolveHorizonReliefCharacter(getMapConfig(mapId).horizon, mapId), character, `${mapId} resolves to ${character}`);
}
assert.equal(resolveHorizonReliefCharacter({ relief: 'karst', style: 'mesa' }, 'desert'), 'karst', 'an authored key wins');
// the ring's own style decides where a map has one; the border's landform keeps reading `style` (gauntlet wave 15: Eifel
// Reservoir's ring rolls like the Eifel over the alpine border its villages were authored on)
assert.equal(resolveHorizonReliefCharacter({ style: 'alpine', ringStyle: 'rolling' }, 'frontier'), 'rolling', 'the ring\'s own style decides');
assert.equal(getMapConfig('reservoir').horizon.style, 'alpine', 'Eifel Reservoir\'s border keeps its alpine landform');
assert.equal(getMapConfig('whiteout').horizon.relief, 'polar', 'Whiteout authors its polar character');
assert.equal(getMapConfig('whiteout').horizon.style, 'alpine', 'round 72: Whiteout stands on the alpine ladder (36 rows) for its polar ranges');

// --- the field: determinism, centring, bounds ---------------------------------------------------------------------
{
  const s = resolveHorizonRelief('polar');
  const a = createHorizonReliefField(0x1234, s), b = createHorizonReliefField(0x1234, s), c = createHorizonReliefField(0x1235, s);
  let sum = 0, maxAbs = 0, differ = 0, n = 0;
  for (let j = 0; j < 40; j++) for (let i = 0; i < 40; i++) {
    const x = 700 + i * 31.7, z = -900 + j * 29.3;
    const va = a.low(x, z), vb = b.low(x, z), vc = c.low(x, z);
    assert.equal(va, vb, 'the same seed gives the same coarse relief');
    if (Math.abs(va - vc) > 1e-6) differ++;
    sum += va; maxAbs = Math.max(maxAbs, Math.abs(va)); n++;
    const h = a.high(x, z, 0.5, 0, 1);
    assert.equal(h, b.high(x, z, 0.5, 0, 1), 'the same seed gives the same fine relief');
    assert.ok(Math.abs(h) <= s.highAmpM * 2.2 + s.gullyM, `the fine relief stays near its amplitude (${h.toFixed(2)})`);
  }
  assert.ok(differ > n * 0.9, 'another seed gives other ridges');
  assert.ok(Math.abs(sum / n) < s.lowAmpM * 0.25, `the coarse relief is centred (mean ${(sum / n).toFixed(2)} m)`);
  // RMS half the amplitude: the peaks reach about the amplitude and never twice it
  assert.ok(maxAbs <= s.lowAmpM * 2.0 && maxAbs > s.lowAmpM * 0.6, `the coarse relief spends its amplitude (${maxAbs.toFixed(1)} m of ${s.lowAmpM})`);
  let rms = 0; for (let j = 0; j < 40; j++) for (let i = 0; i < 40; i++) { const v = a.low(700 + i * 31.7, -900 + j * 29.3); rms += v * v; }
  rms = Math.sqrt(rms / 1600);
  assert.ok(rms > s.lowAmpM * 0.3 && rms < s.lowAmpM * 0.8, `the coarse relief's RMS is about half its amplitude (${rms.toFixed(1)} m)`);
  // the talus apron damps the fine relief at a concave foot, the crest keeps it
  let footE = 0, crestE = 0;
  for (let i = 0; i < 400; i++) {
    const x = 900 + i * 3.1, z = 300 + (i % 7) * 11;
    footE += Math.abs(a.high(x, z, 0.1, 1, 0)); crestE += Math.abs(a.high(x, z, 0.9, -1, 0));
  }
  assert.ok(footE < crestE * 0.6, `the talus apron settles the fine relief (foot ${(footE / 400).toFixed(2)} m vs crest ${(crestE / 400).toFixed(2)} m)`);
  // the gullies close on themselves around the ring (no seam at the -x axis)
  const g1 = a.high(-1000, 0.01, 0.5, 0, 1), g2 = a.high(-1000, -0.01, 0.5, 0, 1);
  assert.ok(Math.abs(g1 - g2) < 0.5, `the gully field is continuous across the angle seam (${g1.toFixed(3)} vs ${g2.toFixed(3)})`);
}

// --- the bake --------------------------------------------------------------------------------------------------------
{
  const cfg = getMapConfig('whiteout');
  const ring = sampleHorizonGeometry(cfg, 1337);
  const s = resolveHorizonRelief('polar');
  const field = createHorizonReliefField(0x51ab, s);
  const sun = [Math.sin(164 * Math.PI / 180) * Math.cos(13 * Math.PI / 180), Math.sin(13 * Math.PI / 180), Math.cos(164 * Math.PI / 180) * Math.cos(13 * Math.PI / 180)];
  const input = { columns: HORIZON_SEGMENTS, rowCount: ring.rows.length, positions: ring.positions, heights: ring.heights, maxHeight: ring.maxHeight };
  const bake = bakeHorizonRelief(input, field, sun, { width: 512, height: 64 });
  assert.equal(bake.width, 512); assert.equal(bake.height, 64);
  assert.equal(bake.data.length, 512 * 64 * 4, 'RGBA8 over the atlas');
  assert.equal(bake.r0, HORIZON_RELIEF_BAKE_R0); assert.equal(bake.r1, HORIZON_RELIEF_BAKE_R1); assert.equal(bake.gradScale, HORIZON_RELIEF_GRAD_SCALE);
  assert.ok(bake.r0 < 430 && bake.r1 >= 1400 && bake.r1 < 1600, 'the atlas spans the ring from its skirt to its outer shoulder');
  assert.ok(bake.stats.aoMean > 0.5 && bake.stats.aoMean < 0.98, `the occlusion darkens some of the ring (mean ${bake.stats.aoMean.toFixed(3)})`);
  assert.ok(bake.stats.shadowMean > 0.2 && bake.stats.shadowMean < 0.99, `the 13° sun lays shadows across the polar ranges (mean visibility ${bake.stats.shadowMean.toFixed(3)})`);
  assert.ok(bake.stats.fineRangeM > 6 && bake.stats.fineRangeM < 70, `the fine relief has metres of range (${bake.stats.fineRangeM.toFixed(1)} m)`);
  const again = bakeHorizonRelief(input, createHorizonReliefField(0x51ab, s), sun, { width: 512, height: 64 });
  assert.equal(createHash('sha256').update(bake.data).digest('hex'), createHash('sha256').update(again.data).digest('hex'), 'the bake is deterministic');
  // a flat ring bakes no occlusion, no shadow and no gradient beyond the fine relief
  const flat = { ...input, heights: new Float32Array(ring.heights.length).fill(60), positions: ring.positions.slice() };
  for (let i = 0; i < flat.heights.length; i++) flat.positions[i * 3 + 1] = 60;
  const flatBake = bakeHorizonRelief(flat, createHorizonReliefField(0x51ab, resolveHorizonRelief('rolling')), [0.5, 0.7, 0.5], { width: 256, height: 32 });
  assert.ok(flatBake.stats.aoMean > 0.9 && flatBake.stats.shadowMean > 0.95, `a flat ring stays open and lit (${flatBake.stats.aoMean.toFixed(3)} / ${flatBake.stats.shadowMean.toFixed(3)})`);
  // marine vertices bake flat, unshadowed and unoccluded
  const marine = { ...input, marine: new Float32Array(ring.heights.length).fill(1) };
  const marineBake = bakeHorizonRelief(marine, createHorizonReliefField(0x51ab, s), sun, { width: 256, height: 32 });
  let openSea = 0;
  for (let i = 0; i < marineBake.data.length; i += 4) if (marineBake.data[i + 2] === 255 && marineBake.data[i + 3] === 255 && marineBake.data[i] === 128 && marineBake.data[i + 1] === 128) openSea++;
  assert.equal(openSea, 256 * 32, 'the sea apron bakes to open, lit, flat texels');
}

// --- the mountains lane (2026-10-03): the fall-line drainage and the landcover -------------------------------------------
// Gauntlet wave 0 named "an obviously repeating diagonal corduroy ridge pattern" on both flanks of Verdant's and Frontier
// Basin's ranges: the round-72 fine relief stretched its crests along the RADIUS, and a flank seen obliquely does not
// fall along the radius, so the crests crossed it as parallel diagonal combs. The drainage now follows the fall line.
{
  // the program's constants the landcover is encoded against (terrain.ts, the ring branch of splatCompute)
  const terrainSource = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
  assert.ok(terrainSource.includes(`gRingAo = 1.0 - (1.0 - pow(ringRel.z, ${HORIZON_RELIEF_AO_POWER.toFixed(1)})) * ${HORIZON_RELIEF_AO_DEPTH.toFixed(1)} * ringW;`),
    'the terrain program reads the occlusion with the power and depth the landcover is encoded against');
  assert.ok(terrainSource.includes(`gRingSun = 1.0 - (1.0 - ringRel.w) * ${HORIZON_RELIEF_SUN_DEPTH.toFixed(2)} * ringW;`),
    'the terrain program reads the sun visibility with the depth the landcover is encoded against');
  assert.equal(RING_RELIEF_SHADE, HORIZON_RELIEF_SHADE, 'the ring binds the atlas at the share the bake encodes for');
  // the encoding: the program's factor from an encoded texel is the bare texel's factor times the cover's light
  const kA = HORIZON_RELIEF_AO_DEPTH * HORIZON_RELIEF_SHADE, kS = HORIZON_RELIEF_SUN_DEPTH * HORIZON_RELIEF_SHADE;
  const programAo = (z) => 1 - (1 - Math.pow(z, HORIZON_RELIEF_AO_POWER)) * kA, programSun = (w) => 1 - (1 - w) * kS;
  for (const ao of [1, 0.9, 0.6, 0.3]) for (const sun of [1, 0.7, 0.2]) for (const light of [1, 0.85, 0.6, 0.5]) {
    const a = programAo(encodeCanopyAo(ao, light)), b = programSun(encodeCanopySun(sun, light));
    assert.ok(Math.abs(a - Math.max(1 - kA, programAo(ao) * light)) < 1e-9, `the occlusion texel carries the cover (ao ${ao}, light ${light})`);
    assert.ok(Math.abs(b - Math.max(1 - kS, programSun(sun) * light)) < 1e-9, `the sun texel carries the cover (sun ${sun}, light ${light})`);
  }
  assert.equal(encodeCanopyAo(0.8, 1), 0.8, 'open ground keeps its occlusion texel');
  assert.equal(encodeCanopySun(0.4, 1), 0.4, 'open ground keeps its sun texel');

  // the comb: a synthetic ring whose ridge line swings up to 40 degrees off the tangent, so many of its flanks fall
  // obliquely to the radius (35 degrees and more are sampled); on those flanks the fine relief's gradient lies across the FALL LINE (couloirs run down it) and no longer
  // across the radius (the round-72 combs)
  const n = HORIZON_SEGMENTS, radii = [];
  for (let r = 420; r <= 1580; r += 20) radii.push(r);
  const positions = new Float32Array(n * radii.length * 3), heights = new Float32Array(n * radii.length);
  const crestAt = (theta) => 980 + 380 * Math.sin(2 * theta);
  const hAt = (theta, r) => 40 + 170 * Math.exp(-(((r - crestAt(theta)) / 260) ** 2));
  radii.forEach((r, row) => { for (let k = 0; k < n; k++) {
    const theta = (k / n) * Math.PI * 2, i = row * n + k;
    positions[i * 3] = Math.cos(theta) * r; positions[i * 3 + 2] = Math.sin(theta) * r;
    heights[i] = positions[i * 3 + 1] = hAt(theta, r);
  } });
  const synthetic = { columns: n, rowCount: radii.length, positions, heights, maxHeight: 210, seed: 0x5eed, treelineM: null, snowlineM: null };
  const rolling = resolveHorizonRelief('rolling');
  const W = 1024, H = 128;
  const alignment = (settings) => {
    const bake = bakeHorizonRelief(synthetic, createHorizonReliefField(0x51ab, settings), [0.4, 0.6, 0.7], { width: W, height: H });
    let fall = 0, tangent = 0, count = 0;
    for (let j = 4; j < H - 4; j++) {
      const r = bake.r0 + (j + 0.5) * (bake.r1 - bake.r0) / H;
      if (r < 640) continue; // past the seam's fade
      for (let i = 0; i < W; i += 2) {
        const theta = (i / W) * Math.PI * 2, e = 1e-3, dr = 1;
        // the macro fall line (analytic): world gradient of hAt
        const gr = (hAt(theta, r + dr) - hAt(theta, r - dr)) / (2 * dr), gt = (hAt(theta + e, r) - hAt(theta - e, r)) / (2 * e * r);
        const slope = Math.hypot(gr, gt);
        if (slope < 0.15) continue;
        const offRadial = Math.atan2(Math.abs(gt), Math.abs(gr));
        if (offRadial < 35 * Math.PI / 180) continue;
        const c = Math.cos(theta), s = Math.sin(theta);
        const fx = gr * c - gt * s, fz = gr * s + gt * c; // the fall line (uphill) in world xz
        const idx = (j * W + i) * 4;
        const gx = (bake.data[idx] / 255 * 2 - 1), gz = (bake.data[idx + 1] / 255 * 2 - 1);
        const g = Math.hypot(gx, gz);
        if (g < 0.02) continue;
        // across the fall line: perpendicular to (fx, fz); the tangential direction: (-s, c)
        fall += Math.abs((gx * -fz + gz * fx) / (g * Math.hypot(fx, fz)));
        tangent += Math.abs((gx * -s + gz * c) / g);
        count++;
      }
    }
    return { fall: fall / count, tangent: tangent / count, count };
  };
  const now = alignment(rolling), before = alignment({ ...rolling, drainage: null, cover: null });
  assert.ok(now.count > 500 && before.count > 500, `the oblique flanks are sampled (${now.count} / ${before.count})`);
  assert.ok(before.tangent > before.fall + 0.05,
    `the round-72 field's crests ran across the radius on an oblique flank — the comb (tangential ${before.tangent.toFixed(3)} vs across the fall line ${before.fall.toFixed(3)})`);
  assert.ok(now.fall > now.tangent + 0.05,
    `the drainage's couloirs run down the fall line (across the fall line ${now.fall.toFixed(3)} vs tangential ${now.tangent.toFixed(3)})`);

  // the cover: Frontier Basin's ring carries stands past the ring forest and none inside it, none under the treeline's
  // floor in metres, none at sea; a polar ring and a treeless ring carry none
  const cfg = getMapConfig('frontier');
  const ring = sampleHorizonGeometry(cfg, 1337);
  const base = { columns: HORIZON_SEGMENTS, rowCount: ring.rows.length, positions: ring.positions, heights: ring.heights, maxHeight: ring.maxHeight, seed: 0x5eed };
  const covered = (input, character) => {
    const settings = resolveHorizonRelief(character);
    // the bare bake keeps the walls' rock (the mountain characters' rock bands, the tablelands' varnish): the stands alone
    // are measured
    const bareCover = settings.cover && ((settings.cover.varnish ?? 0) > 0 || (settings.cover.beds ?? 0) > 0)
      ? { ...settings.cover, forest: 0, canopy: 0, fields: 0 } : null;
    const bare = bakeHorizonRelief(input, createHorizonReliefField(0x51ab, { ...settings, cover: bareCover }), [0.4, 0.6, 0.7], { width: 512, height: 64 });
    // the stands alone (the field parcels start nearer, at 560 m, on the open ground the band trees leave)
    const stands = settings.cover ? { ...settings, cover: { ...settings.cover, fields: 0 } } : settings;
    const bake = bakeHorizonRelief(input, createHorizonReliefField(0x51ab, stands), [0.4, 0.6, 0.7], { width: 512, height: 64 });
    let inner = 0, outer = 0, outerTexels = 0;
    for (let j = 0; j < 64; j++) {
      const r = bake.r0 + (j + 0.5) * (bake.r1 - bake.r0) / 64;
      for (let i = 0; i < 512; i++) {
        const idx = (j * 512 + i) * 4;
        // a texel the cover darkened: both its occlusion and its sun texel lower than the bare bake's (the crowns' grain
        // and the canopy's height move the bare terms a little, so the margin is the canopy's own)
        const darker = bake.data[idx + 3] < bare.data[idx + 3] - 40 && bake.data[idx + 2] < bare.data[idx + 2] - 20;
        if (r < HORIZON_COVER_RADIUS_M[0] - 20) { if (darker) inner++; } else if (r > HORIZON_COVER_RADIUS_M[1]) { outerTexels++; if (darker) outer++; }
      }
    }
    return { inner, share: outer / Math.max(1, outerTexels) };
  };
  const wooded = covered({ ...base, treelineM: 0.91 * ring.maxHeight, snowlineM: null }, 'rolling');
  assert.equal(wooded.inner, 0, 'no baked stand inside the ring forest\'s reach');
  assert.ok(wooded.share > 0.12 && wooded.share < 0.75, `stands cover part of the ranges past it (${(wooded.share * 100).toFixed(1)} %)`);
  assert.equal(covered({ ...base, treelineM: 0, snowlineM: null }, 'rolling').share, 0, 'a treeless ring bakes no stand');
  assert.equal(covered({ ...base, treelineM: 0.91 * ring.maxHeight, snowlineM: null }, 'polar').share, 0, 'a polar ring bakes no stand');
  assert.equal(covered({ ...base, treelineM: 0.91 * ring.maxHeight, snowlineM: null, marine: new Float32Array(ring.heights.length).fill(1) }, 'rolling').share, 0,
    'the sea bakes no stand');
  // the map-borders lane's woods field leads the baked stands across the hand-over, where the ring forest's trees stand in
  // it; past the hand-over the stands are the ranges' own, whatever the border's field (gauntlet wave 6, Verdant's edge-n:
  // a woodland parcel's straight edges drawn up a mountain face read as "a translucent blue-grey band")
  {
    const settings = resolveHorizonRelief('rolling');
    const stands = { ...settings, cover: { ...settings.cover, fields: 0 } };
    const at = (woodsAt) => bakeHorizonRelief({ ...base, treelineM: 0.91 * ring.maxHeight, snowlineM: null, woodsAt }, createHorizonReliefField(0x51ab, stands), [0.4, 0.6, 0.7], { width: 512, height: 64 });
    const none = at(() => 0), all = at(() => 1);
    let inBand = 0, past = 0;
    for (let j = 0; j < 64; j++) {
      const r = none.r0 + (j + 0.5) * (none.r1 - none.r0) / 64;
      for (let i = 0; i < 512; i++) {
        const idx = (j * 512 + i) * 4;
        const differs = none.data[idx + 2] !== all.data[idx + 2] || none.data[idx + 3] !== all.data[idx + 3];
        if (r > HORIZON_STAND_HANDOVER_M[0] && r < HORIZON_STAND_HANDOVER_M[1]) { if (differs) inBand++; }
        // (past the occlusion's and the cast shadows' reach of a band stand's canopy: its shadow falls a little way out)
        else if (r > HORIZON_STAND_HANDOVER_M[1] + 220 && differs) past++;
      }
    }
    assert.ok(inBand > 200, `the border's woods lead the stands across the hand-over (${inBand} texels follow them)`);
    assert.equal(past, 0, 'past the hand-over the stands are the ranges\' own: the border\'s woods field changes no texel there');
  }
  {
    const settings = resolveHorizonRelief('rolling');
    const input = { ...base, treelineM: 0.91 * ring.maxHeight, snowlineM: null, woodsAt: () => 0 };
    const own = bakeHorizonRelief(input, createHorizonReliefField(0x51ab, settings), [0.4, 0.6, 0.7], { width: 512, height: 64 });
    const theirs = bakeHorizonRelief({ ...input, fields: false }, createHorizonReliefField(0x51ab, settings), [0.4, 0.6, 0.7], { width: 512, height: 64 });
    const bare = bakeHorizonRelief(input, createHorizonReliefField(0x51ab, { ...settings, cover: null }), [0.4, 0.6, 0.7], { width: 512, height: 64 });
    let parcels = 0, kept = 0;
    for (let i = 0; i < own.data.length; i += 4) {
      if (own.data[i + 3] < bare.data[i + 3] - 8) parcels++;
      const r = own.r0 + (Math.floor(i / 4 / 512) + 0.5) * (own.r1 - own.r0) / 64;
      // (inside the hand-over by the occlusion's and the shadows' reach: a range stand past it shades a little way in)
      if (r < HORIZON_STAND_HANDOVER_M[0] - 220 && (theirs.data[i + 3] !== bare.data[i + 3] || theirs.data[i + 2] !== bare.data[i + 2])) kept++;
    }
    assert.ok(parcels > 500, `the bake lays its parcels on the open ground (${parcels} texels)`);
    assert.equal(kept, 0, 'with the border\'s parcels in and no woods, the cover leaves the texels inside the hand-over as they were');
  }
}

// --- the lighting gains: the vista's constants at the engine's references, following each map's sun and sky ------------
{
  const ref = resolveHorizonLightingGains({ sun: 4.5, hemi: 0.51, cover: 0 });
  assert.ok(Math.abs(ref.ambient - 0.5) < 1e-9 && Math.abs(ref.sunGain - 1.3) < 1e-9 && Math.abs(ref.shadow - 0.85) < 1e-9, 'the references give the vista constants');
  const whiteout = resolveHorizonLightingGains({ sun: 2.75, hemi: 0.73, cover: 0.97 });
  assert.ok(whiteout.ambient > 0.62 && whiteout.ambient < 0.72, `a bright hemisphere lifts the ambient (${whiteout.ambient.toFixed(3)})`);
  assert.ok(whiteout.sunGain > 0.85 && whiteout.sunGain < 1.0, `a weaker sun lowers the sun term, compressed (${whiteout.sunGain.toFixed(3)})`);
  assert.ok(whiteout.shadow > 0.2 && whiteout.shadow < 0.35, `a closed deck fades the baked cast shadows (${whiteout.shadow.toFixed(3)})`);
  const bright = resolveHorizonLightingGains({ sun: 40, hemi: 5, cover: -1 });
  assert.ok(bright.sunGain <= 1.3 * Math.pow(1.6, 0.7) + 1e-9 && bright.ambient <= 0.5 * Math.pow(2, 0.8) + 1e-9 && bright.shadow === 0.85, 'the gains are clamped');
  // 2026-10-05 (the skies lane; the gauntlet's wave 93 on Titan Gorge's far rock under its closed deck: "banded, graphic
  // mountain-face shading ... inconsistent with the implied shadowless overcast light"): the sun term keeps the beam the
  // deck lets through (the light model's 1 − OVERCAST_DIRECT_CUT × overcast) and the rest returns as sky light, so a
  // level face keeps its light while the faces turned to and from the sun lose the difference
  const sinEl = Math.sin(34 * Math.PI / 180);
  const open = resolveHorizonLightingGains({ sun: 4.5, hemi: 0.51, cover: 1, sinEl });
  const closed = resolveHorizonLightingGains({ sun: 4.5, hemi: 0.51, cover: 1, direct: 1 - 0.98, sinEl });
  assert.ok(Math.abs(closed.sunGain - open.sunGain * 0.02) < 1e-12, `a closed deck: the sun term at the beam's 2 % (${closed.sunGain.toFixed(3)})`);
  const level = (g) => g.sunGain * 1.05 * sinEl + g.ambient;
  assert.ok(Math.abs(level(closed) - level(open)) < 1e-12, 'a level face keeps its light');
  const facing = (g) => g.sunGain * 1.05 + g.ambient * 0.62, away = (g) => g.ambient * 0.62;
  assert.ok(facing(open) / away(open) > 3 && facing(closed) / away(closed) < 1.2, `the faces to and from the sun ${(facing(open) / away(open)).toFixed(2)} → ${(facing(closed) / away(closed)).toFixed(2)}`);
  assert.equal(resolveHorizonLightingGains({ sun: 4.5, hemi: 0.51, cover: 0 }).sunGain, ref.sunGain, 'an open sky: unchanged');
  const horizonSource = readFileSync(new URL('./maps/horizon.ts', import.meta.url), 'utf8');
  assert.match(horizonSource, /direct: 1 - OVERCAST_DIRECT_CUT_SHARED \* deckOvercast \* resolveDeckClosure\(deckPreset, getDeviceTier\(\) !== 'mobile'\),/,
    'the ring: the uniform share of the cut (a deck with gaps casts its pattern on the ring through the cloud shade map)');
  assert.match(horizonSource, /const farLighting: HorizonLighting = \{ \.\.\.lighting, direct: 1 - OVERCAST_DIRECT_CUT_SHARED \* deckOvercast \};/, 'the far range and the panorama: the average cut');
  assert.equal(horizonSource.split('gains: resolveHorizonLightingGains(farLighting)').length - 1, 2, 'both far builders take it');
}

// --- the far range --------------------------------------------------------------------------------------------------
{
  assert.equal(HORIZON_FAR_SEGMENTS, 288);
  assert.equal(HORIZON_FAR_ROWS.length, 6);
  for (let i = 1; i < HORIZON_FAR_ROWS.length; i++) assert.ok(HORIZON_FAR_ROWS[i].r > HORIZON_FAR_ROWS[i - 1].r, 'the far rows step outward');
  assert.ok(HORIZON_FAR_ROWS[0].r > 1600 && HORIZON_FAR_ROWS[HORIZON_FAR_ROWS.length - 1].r < 3400, 'the far range stands beyond the ring and inside the cloud dome');
  const far = resolveHorizonRelief('polar').far;
  assert.ok(Math.abs(resolveFarRangeAmp(far, 300) - 246) < 1e-6, 'a 300 m stratus caps the far peaks at 82 % of the deck base');
  assert.equal(resolveFarRangeAmp(far, 2000), far.ampM, 'a high deck leaves the far peaks their full height');
  assert.equal(resolveFarRangeAmp(far, 100), 120, 'the cap never goes under 120 m');
  const a = sampleHorizonFarRange({ seed: 77, settings: far, deckBaseM: 2000, seaOpenings: [] });
  const b = sampleHorizonFarRange({ seed: 77, settings: far, deckBaseM: 2000, seaOpenings: [] });
  assert.deepEqual(Array.from(a.heights.subarray(0, 64)), Array.from(b.heights.subarray(0, 64)), 'the far range is deterministic');
  let maxH = -Infinity, minCrest = Infinity, needles = 0;
  const n = HORIZON_FAR_SEGMENTS, crest = 3;
  for (let k = 0; k < n; k++) {
    const h = a.heights[crest * n + k];
    maxH = Math.max(maxH, h); minCrest = Math.min(minCrest, h);
    const step = Math.abs(h - a.heights[crest * n + (k + 1) % n]);
    if (step > 70) needles++; // a 70 m step across a 61 m column is a 49° arête, a needle beyond it
  }
  assert.ok(maxH <= HORIZON_FAR_FOOT_M + far.ampM + 0.01 && maxH > HORIZON_FAR_FOOT_M + far.ampM * 0.6, `the crest row reaches toward the peak height (${maxH.toFixed(0)} m)`);
  assert.ok(minCrest < maxH * 0.6, `the far ranges come and go around the horizon (${minCrest.toFixed(0)} / ${maxH.toFixed(0)} m)`);
  assert.equal(needles, 0, 'no one-column needles on the far crest');
  for (let k = 0; k < n; k++) assert.ok(a.heights[k] <= HORIZON_FAR_FOOT_M + 0.01, 'the foot row stays at the foot');
  // a sea opening lowers its sector to the water
  const sea = sampleHorizonFarRange({ seed: 77, settings: far, deckBaseM: 2000, seaOpenings: [{ azimuthDeg: 90, widthDeg: 60, level: -4 }] });
  const east = crest * n; // column 0 is +x, the ring's east (azimuth 90°)
  assert.ok(sea.heights[east] < 0 && sea.marine[east] > 0.99, 'the far range opens onto the sea in a sea sector');
  for(let i=0;i<sea.heights.length;i++) if(seaOpeningWeight((i%n)/n*Math.PI*2,{azimuthDeg:90,widthDeg:60,level:-4})>.05)
    assert.ok(sea.heights[i]<-4,'the background range cannot intersect the shore or water at partial sector coverage');
  // Use an uneven, differently sampled near edge; a fixed 1860 m foot left
  // sky-visible holes between the two landscape meshes.
  const columns=431,positions=new Float32Array(columns*3),heights=new Float32Array(columns);
  for(let k=0;k<columns;k++) {
    const angle=k/columns*Math.PI*2,r=1310+80*Math.sin(angle*3);
    positions[k*3]=Math.cos(angle)*r;positions[k*3+2]=Math.sin(angle)*r;
    positions[k*3+1]=heights[k]=35+18*Math.sin(angle*5);
  }
  for (const seaOpenings of [[], [{azimuthDeg:90,widthDeg:60,level:-4}]]) {
    const joined=sampleHorizonFarRange({seed:77,settings:far,deckBaseM:2000,seaOpenings,nearEdge:{columns,positions,heights}});
    assert.equal(joined.columns,columns,'the distant apron matches every near-edge station');
    for(let k=0;k<columns;k++) {
      const x=positions[k*3],z=positions[k*3+2];
      assert.ok(Math.abs(Math.hypot(x,z)-Math.hypot(joined.positions[k*3],joined.positions[k*3+2])-2)<.001,'far foot overlaps the near edge even beside coastal headlands');
      assert.ok(Math.abs(joined.heights[k]-(heights[k]-.02))<.00001,'far foot seats on the matching near-edge height');
    }
  }
}

// --- the ring geometry with the relief: every map, three seeds, the receipts' own laws -----------------------------
for (const mapId of MAP_IDS) for (const seed of [1337, 2049, 7719]) {
  const cfg = getMapConfig(mapId);
  const ring = sampleHorizonGeometry(cfg, seed);
  const n = HORIZON_SEGMENTS, p = ring.positions;
  for (let i = 0; i < ring.heights.length; i++) assert.ok(Number.isFinite(ring.heights[i]), `${mapId}/${seed}: finite heights`);
  // the coarse relief shows on the authored ranges: along each authored row the height varies beyond the profile's own
  // meander at the 15-column scale (the receipt in horizonResources keeps the relief within the anchor bounds)
  const authored = ring.rows.map((row, i) => (!row.skirt && !row.interpolated ? i : -1)).filter((i) => i >= 0);
  if (mapId !== 'badlands') {
    let ridged = 0;
    for (const row of authored.slice(1)) {
      for (let k = 0; k < n; k += 15) {
        const a = p[(row * n + k) * 3 + 1], b = p[(row * n + (k + 7) % n) * 3 + 1], c = p[(row * n + (k + 15) % n) * 3 + 1];
        if (Math.abs(b - (a + c) * 0.5) > 1.5) ridged++;
      }
    }
    assert.ok(ridged > n / 15 * (authored.length - 1) * 0.25, `${mapId}/${seed}: the ranges carry relief along their crests (${ridged} bent triples)`);
  }
}
// The production path seats and refines every landscape against actual ground.
// Check all maps, including the square corners, independently of legacy hashes.
for(const id of MAP_IDS) {
  const config=getMapConfig(id),ground=createHeightField(5000,config);
  const ring=sampleHorizonGeometry(config,1337,ground),p=ring.positions,n=HORIZON_SEGMENTS;
  assert.ok(ring.heights.length<=75000,`${id}: continued-ground vertex budget`);
  for(let column=0;column<n;column++) {
    assert.ok(ring.heights[column] <= -64,
      `${id}: coastal grading cannot lift the buried closing row through a corner cliff`);
    const i=(n+column)*3;
    assert.ok(Math.abs(p[i+1]-ground.getHeightAt(p[i],p[i+2]))<.2,`${id}: seated terrain seam, including wet bank vertices`);
    for(let row=1;row<ring.rows.length;row++) {
      const next=(row*n+column)*3,before=next-n*3;
      assert.ok(Number.isFinite(p[next+1]),`${id}: finite continued geology`);
      assert.ok(Math.hypot(p[next],p[next+2])>Math.hypot(p[before],p[before+2]),`${id}: no folded radial faces`);
    }
  }
}

// --- the round-72 dressing rules on a built ring: no range tree past 880 m or above half the ring, no ribbon on a far
// or high crest, the far range present, the crowns' height haze in the program ------------------------------------
{
  const previousDocument = globalThis.document;
  globalThis.document = { createElement(tag) {
    assert.equal(tag, 'canvas');
    const canvas = { width: 0, height: 0, getContext() { return {
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData(image) { canvas.pixels = image.data; }, clearRect() {}, save() {}, restore() {}, beginPath() {}, closePath() {},
      rect() {}, clip() {}, moveTo() {}, lineTo() {}, fill() {}, createLinearGradient: () => ({ addColorStop() {} }),
    }; } };
    return canvas;
  } };
  try {
    const mesh = buildHorizonRing(null, getMapConfig('longleaf'), 1337);
    const maxH = mesh.userData.horizonRing.reliefBake ? sampleHorizonGeometry(getMapConfig('longleaf'), 1337).maxHeight : 1;
    const forest = mesh.getObjectByName('horizon-forest');
    assert.ok(forest, 'longleaf stands its ring forest');
    const m = new Matrix4(), v = new Vector3();
    let range = 0;
    for (const child of forest.children) {
      if (!child.name.endsWith('-range')) continue;
      for (let i = 0; i < child.count; i++) {
        child.getMatrixAt(i, m); v.setFromMatrixPosition(m); range++;
        assert.ok(Math.hypot(v.x, v.z) <= 880 + 0.01, `range tree inside 880 m (${Math.hypot(v.x, v.z).toFixed(0)})`);
        assert.ok(v.y + 0.4 <= maxH * 0.5 + 0.01, `range tree below half the ring (${v.y.toFixed(0)} of ${maxH.toFixed(0)})`);
      }
    }
    assert.ok(range > 50, `a green map's near ranges still carry range-class trees (${range})`);
    const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <project_vertex>', fragmentShader: '#include <common>\n#include <lights_physical_pars_fragment>\n#include <map_fragment>' };
    forest.userData.horizonForestHook(shader);
    assert.ok(!shader.fragmentShader.includes('vfHigh') && !shader.fragmentShader.includes('uVfFog'), 'fallback crowns use camera-distance scene fog without a second map-radius wash');
    const comb = mesh.getObjectByName('horizon-treeline');
    assert.ok(comb, 'the skyline ribbon');
    const cp = comb.geometry.attributes.position;
    let highSpans = 0, spans = 0;
    for (let k = 0; k < HORIZON_SEGMENTS; k++) {
      const base = cp.getY(k * 2), top = cp.getY(k * 2 + 1);
      if (top - base > 0.5) { spans++; if (base + 3.2 > maxH * 0.5) highSpans++; }
    }
    assert.equal(highSpans, 0, `no ribbon span on a crest above half the ring (${highSpans} of ${spans})`);
    // on a relieved ring the resolved skyline is mostly high country (round 72b: the ranges' own crests), so at most
    // the low passes keep a ribbon — never more than half the columns, possibly none
    assert.ok(spans <= HORIZON_SEGMENTS * 0.5, `at most the low crests keep their ribbon (${spans})`);
    assert.ok(mesh.getObjectByName('horizon-far-range'), 'the far range stands behind the ring');
    // 2026-10-05 (Part 1, the skies lane): the round-72 range (the panorama's fallback) takes the clouds' shadows on its sun
    // term as the panorama does — the shared shade map's lookup, bound per draw, the sky's term untouched
    {
      const far = mesh.getObjectByName('horizon-far-range');
      const farShader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
      far.material.onBeforeCompile(farShader, null);
      assert.ok(farShader.fragmentShader.includes('float shade = uFGains.x * sky + uFGains.y * max(ndl, 0.0) * cotCloudSun(vFWorld);'),
        'the far range\'s sun term under the cloud shade (the sky\'s term kept)');
      assert.ok(farShader.fragmentShader.includes('float cotCloudSun( vec3 wp )') && 'tCotCloudShade' in farShader.uniforms, 'through the shared lookup');
      const shared = { tCotCloudShade: { value: new Texture() }, uCotCloudShade: { value: new Vector4(0, 0, 1 / 12000, 1) }, uCotCloudSun: { value: new Vector4(0, 1, 0, 1400) } };
      far.onBeforeRender(null, { userData: { cloudShadeUniforms: shared } });
      assert.strictEqual(farShader.uniforms.uCotCloudShade.value, shared.uCotCloudShade.value, 'bound to the layer\'s map by reference');
      far.onBeforeRender(null, { userData: {} });
      assert.equal(farShader.uniforms.uCotCloudShade.value.w, 0, 'no published map: off');
      assert.equal(shared.uCotCloudShade.value.w, 1, 'and the layer\'s own uniform untouched');
    }
    // round 72b: the relieved normal composes two vec2 world-xz gradients — a `.z` on either is a compile error the game
    // never reports (renderer.debug.checkShaderErrors is off), and it left the vista program uncompiled for a whole
    // round while the ring drew with a stale program; the capture tool now checks shader errors, this pins the text
    const vistaShader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <map_fragment>\n#include <color_fragment>' };
    (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).onBeforeCompile(vistaShader, null);
    assert.match(vistaShader.fragmentShader, /vec2 g0 = -n0\.xz \/ max\(n0\.y, 0\.05\);\s*vec3 nR = normalize\(vec3\(-\(g0\.x \+ gd\.x\), 1\.0, -\(g0\.y \+ gd\.y\)\)\);/,
      'the relieved normal reads the vec2 gradients\' .y (a .z there is a silent compile failure)');
    assert.doesNotMatch(vistaShader.fragmentShader, /\b(g0|gd|ringG0|gRingGrad)\.z\b/, 'no .z on a vec2 gradient in the vista program');
    // a snow map keeps no range-class trees at all (its faces past the first ridge are pale and washed to the sky)
    const fjord = buildHorizonRing(null, getMapConfig('fjord'), 1337).getObjectByName('horizon-forest');
    assert.ok(fjord && fjord.userData.horizonForest.range === 0 && fjord.userData.horizonForest.band > 400,
      `a snow map's ring forest is its rim band alone (${fjord?.userData.horizonForest.band} band / ${fjord?.userData.horizonForest.range} range)`);
  } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  }
}
console.log('horizonRelief.selftest: characters, field, bake, the fall-line drainage and the landcover, far range, ring relief and the dressing rules PASS');
