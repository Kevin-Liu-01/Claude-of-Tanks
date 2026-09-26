// Round 72 (2026-09-25): the ring's mountain relief and its baked surface (horizonRelief.ts) and the far range
// (horizonFarRange.ts) — deterministic from the map seed, bounded, per-map character keys, the bake's sizes and
// ranges, the far range under a map's cloud deck, and the ring geometry's relief within the receipts' own laws.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  HORIZON_RELIEF_BAKE_R0, HORIZON_RELIEF_BAKE_R1, HORIZON_RELIEF_CHARACTERS, HORIZON_RELIEF_GRAD_SCALE,
  bakeHorizonRelief, createHorizonReliefField, resolveHorizonRelief, resolveHorizonReliefCharacter,
} from './horizonRelief.ts';
import { HORIZON_FAR_FOOT_M, HORIZON_FAR_ROWS, HORIZON_FAR_SEGMENTS, resolveFarRangeAmp, sampleHorizonFarRange } from './horizonFarRange.ts';
import { HORIZON_SEGMENTS, sampleHorizonGeometry } from './maps/horizon.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';

// --- the characters ---------------------------------------------------------------------------------------------
assert.deepEqual([...HORIZON_RELIEF_CHARACTERS].sort(), ['alpine', 'coastal', 'karst', 'martian', 'mesa', 'polar', 'rolling', 'volcanic'],
  'eight mountain characters');
for (const character of HORIZON_RELIEF_CHARACTERS) {
  const s = resolveHorizonRelief(character);
  assert.equal(s.character, character);
  assert.ok(s.lowAmpM >= 5 && s.lowAmpM <= 45, `${character}: the coarse relief stays within the row ladder's reach (${s.lowAmpM} m)`);
  assert.ok(s.highAmpM >= 3 && s.highAmpM <= 16, `${character}: the fine relief stays a surface term (${s.highAmpM} m)`);
  assert.ok(s.wavelengthM >= 180 && s.wavelengthM <= 480, `${character}: the first octave is a ridge, not a hill or a boulder`);
  assert.ok(s.crestSharpness >= s.footSharpness, `${character}: crests are at least as sharp as the foot`);
  assert.ok(s.gullyM >= 1 && s.gullyM <= 7 && s.gullyElongation >= 3, `${character}: gullies are shallow and elongated downslope`);
  assert.ok(s.aoStrength > 0.4 && s.aoStrength <= 0.85 && s.aoReachM >= 100 && s.aoReachM <= 200, `${character}: the occlusion is a shading term with a bounded reach`);
  assert.ok(s.far && s.far.ampM >= 250 && s.far.ampM <= 1100 && s.far.hazeIn < s.far.hazeOut && s.far.hazeOut <= 0.86,
    `${character}: the far range's peaks and haze are bounded`);
}
// the per-map keys: identity first, the style second, the authored key over both
const expectedCharacter = {
  whiteout: 'polar', winter: 'polar', caldera: 'volcanic', blackglass: 'volcanic', mars: 'martian', monsoon: 'karst', mangrove: 'karst',
  coastal: 'coastal', saltwind: 'coastal', polders: 'coastal', fjord: 'alpine', alpine: 'alpine', orchard: 'alpine', reservoir: 'alpine',
  desert: 'mesa', badlands: 'mesa', titan_gorge: 'mesa', skybridge: 'mesa', copper_mesa: 'mesa',
  verdant: 'rolling', urban: 'rolling', railyard: 'rolling', oasis: 'rolling',
};
for (const [mapId, character] of Object.entries(expectedCharacter)) {
  assert.equal(resolveHorizonReliefCharacter(getMapConfig(mapId).horizon, mapId), character, `${mapId} resolves to ${character}`);
}
assert.equal(resolveHorizonReliefCharacter({ relief: 'karst', style: 'mesa' }, 'desert'), 'karst', 'an authored key wins');
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
console.log('horizonRelief.selftest: characters, field, bake, far range and ring relief PASS');
