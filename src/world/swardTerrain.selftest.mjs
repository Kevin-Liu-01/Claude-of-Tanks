// Ground lane (2026-10-08, the gauntlet's wave 274 on Amberford and Monsoon Ridge): the sward and its ground.
// 1. The field's law and the wild sward's meet across the field gate's own band, never on its middle line (Amberford's
//    slope: "a bald patch that steps hard from the dense tall grass"): the share of blades the field's law takes rises
//    smoothly through the band, and outside it (the gate 0 or 1) every blade is what it was. A grass margin's rank grass
//    meets the crop across a ragged band (its young crop's headland lay under the margin's rank grass: the bald band),
//    a wall's footing keeps its line; a young green crop's ground keeps the sward's relief (terrain.ts gCropReliefW).
// 2. Monsoon Ridge's sward follows its ground (its slope: "no thinning on the steeper upper slope … no dry stems"):
//    thinner and shorter up a steep slope, drier on one turned to the sun; the profile (Monsoon only), the field's hook.
// 3. Monsoon's foot ("no soil, litter or dry thatch" under the sward): the material's thatch block — gated on its
//    uniform (0 everywhere else, skipped), bound from the profile, off under the legacy A/B.
// 4. The tufts read the same laws (the vegetation section the grass harnesses compile: no module helper).
// No renderer, no GPU/art claim.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { groundReduxProfileIds, resolveGroundReduxProfile } from './groundRedux.ts';
import { createTallGrass } from './tallGrass.ts';
import { createHeightField } from './terrain.ts';
import { getMapConfig } from './maps/index.ts';

const flat = () => 0;
const cam = new THREE.Vector3(0, 2, 0);
const settle = (grass) => {
  for (let i = 0; i < 900; i++) {
    grass.update(1 / 60, cam, null, null);
    const st = grass.getState();
    if (st.near.publishes && st.far.publishes && !st.near.pending && !st.far.pending) break;
  }
};
const read = (grass) => {
  const m = grass.near.instanceMatrix.array, b = grass.near.geometry.getAttribute('aBlade').array, c = grass.near.instanceColor.array, out = [];
  for (let i = 0; i < grass.near.count; i++) out.push({ x: m[i * 16 + 12], z: m[i * 16 + 14], h: b[i * 4 + 1], r: c[i * 3], g: c[i * 3 + 1] });
  return out;
};
const meadow = resolveGroundReduxProfile('verdant').grass;
let shares = '', slopeRead = '';

// 1. The field gate across its band: a ripe wheat field everywhere, its gate falling with the ground's slope from x = 0
//    (flat) to x = 40 (past the gate's 0.10): the field's law (the crop's tint; an eighth of a sown field's blades are
//    its weeds, the sward's own) takes a share that falls smoothly
{
  const slopeAt = (x) => Math.min(0.14, Math.max(0, x) * 0.0035);
  const youngCrop = (x, z, out) => {
    out.active = 1; out.crop = 1; out.track = 0; out.boundary = 0; out.edgeM = 60; out.marginM = 1.5; out.sward = 1;
    out.cropKeep = 0.85; out.cropHeight = 1.1; out.jitter = 0.4; out.weed = 0; out.urban = 0;
    out.tintR = 0.30; out.tintG = 0.22; out.tintB = 0.075;
    return out;
  };
  const field = {
    getHeightAt: flat, getHeightAtFast: flat, _roadDist: () => 1e9, getGroundType: () => 'medium', _noVeg: () => false,
    getWaterMaskAt: () => 0, _villageMask: () => 0, _landUseAt: youngCrop,
    getNormalAt: (x) => { const s = slopeAt(x); return { x: Math.sqrt(Math.max(0, 1 - (1 - s) ** 2)), y: 1 - s, z: 0 }; },
  };
  const grass = createTallGrass(field, { seed: 5, tier: 'desktop', biome: meadow, qualityScale: () => 1 });
  settle(grass);
  const blades = read(grass);
  // the crop's tint is the crop's albedo over the biome's tip (a field blade); the wild sward's carries its own jitter
  const isCrop = (bl) => Math.abs(bl.r / bl.g - (0.30 / meadow.tip[0]) / (0.22 / meadow.tip[1])) < 0.02;
  const shareIn = (x0, x1) => {
    const list = blades.filter((bl) => bl.x >= x0 && bl.x < x1);
    return list.filter(isCrop).length / Math.max(1, list.length);
  };
  const s0 = shareIn(-40, 5), s1 = shareIn(14, 18), s2 = shareIn(17, 20), s3 = shareIn(20, 24), s4 = shareIn(32, 60);
  // the gate: 1 − smoothstep(0.04, 0.10, slope) — x 11.4 → 1, x 28.6 → 0; its middle at x 20
  // (the old rule, `landW > 0.5`, stepped on the band's middle line: the field's whole share to x = 20, none past it)
  assert.ok(s0 > 0.8 && s4 < 0.02, `the field's law whole on the flat (${s0.toFixed(2)}) and gone on the slope (${s4.toFixed(2)})`);
  assert.ok(s1 > s2 + 0.05 && s2 > s3 + 0.2 && s3 > 0.03,
    `across the band the share falls smoothly (${[s1, s2, s3].map((v) => v.toFixed(2)).join(' > ')})`);
  shares = [s0, s1, s2, s3, s4].map((v) => v.toFixed(2)).join('/');
  grass.dispose();
}

// 1b. The margin across its band: a ploughed field (no sward of its own) whose edge runs along x (edgeM = x, the margin
//     1.8 m), flat — every blade is the margin's, so the count is the share its law takes. The share falls from the
//     margin's inner half to ~3 m into the field over metres, not on the line (the old law: at 1.8 m, ±0.45 m); a dry
//     stone wall's field keeps its footing bare and its line.
let marginRead = '';
{
  const edgeField = (boundary, crop) => ({
    getHeightAt: flat, getHeightAtFast: flat, _roadDist: () => 1e9, getGroundType: () => 'medium', _noVeg: () => false,
    getWaterMaskAt: () => 0, _villageMask: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }),
    _landUseAt: (x, z, out) => {
      out.active = 1; out.crop = crop; out.track = 0; out.boundary = boundary; out.edgeM = Math.max(0, x); out.marginM = 1.8;
      out.sward = crop === 4 ? 0 : 1; out.cropKeep = crop === 4 ? 0 : 0.75; out.cropHeight = crop === 4 ? 0 : 1.1; out.jitter = 0.4;
      out.weed = 0; out.urban = 0; out.tintR = 0.30; out.tintG = 0.22; out.tintB = 0.075; out.sV = 9; out.laneQ = 1e9;
      return out;
    },
  });
  const lay = (boundary, crop) => {
    const g = createTallGrass(edgeField(boundary, crop), { seed: 7, tier: 'desktop', biome: meadow, qualityScale: () => 1 });
    settle(g);
    const out = read(g);
    g.dispose();
    return out;
  };
  const grass = lay(0, 4);
  const count = (x0, x1) => grass.filter((bl) => bl.x >= x0 && bl.x < x1).length / (x1 - x0);
  const inner = count(0, 0.6);
  const share = [];
  for (let e = 0; e < 5.5; e += 0.5) share.push(count(e, e + 0.5) / inner);
  const at = (v) => { for (let i = 0; i < share.length; i++) if (share[i] < v) return i * 0.5 + 0.25; return 99; };
  const w = at(0.2) - at(0.8);
  assert.ok(inner > 0.5, `the margin's rank grass stands (${inner.toFixed(2)} blades a metre of the strip)`);
  assert.ok(w >= 1.5, `the margin's share falls over metres, not on its line (0.8 -> 0.2 over ${w.toFixed(2)} m: ${share.map((v) => v.toFixed(2)).join(' ')})`);
  assert.ok(share[share.length - 1] < 0.05, 'and is gone 3.5 m into the field');
  marginRead = `0.8 -> 0.2 over ${w.toFixed(1)} m, from ${at(0.8).toFixed(1)} to ${at(0.2).toFixed(1)} m`;
  const walled = lay(3, 1);
  assert.equal(walled.filter((bl) => bl.x >= 0 && bl.x < 0.6).length, 0, 'a dry stone wall\'s footing stays bare');
}

// 2. Monsoon's sward follows its ground: the profile, the field's hook with the map's sun, the law on a stub slope.
for (const id of groundReduxProfileIds()) {
  const p = resolveGroundReduxProfile(id);
  assert.equal(p.swardSlope ?? 0, id === 'monsoon' ? 1 : 0, `${id}: ${id === 'monsoon' ? 'the sward follows its ground' : 'no slope law'}`);
  assert.equal(p.thatch ?? 0, id === 'monsoon' ? 1 : 0, `${id}: ${id === 'monsoon' ? 'thatch under the sward' : 'no thatch'}`);
}
{
  const hook = createHeightField(1337, getMapConfig('monsoon'))._swardSlope;
  assert.ok(hook && Math.abs(Math.hypot(hook[0], hook[1]) - 1) < 1e-9 && hook[2] === 1, 'Monsoon publishes its sun and the law');
  assert.equal(createHeightField(1337, getMapConfig('verdant'))._swardSlope, undefined, 'Amberford publishes none');
  // a hillside: flat west of x = 0, a 30° slope east of it turned toward +x; the sun from +x, then from −x
  const slopeN = (x) => (x > 0 ? { x: 0.5, y: Math.cos(Math.PI / 6), z: 0 } : { x: 0, y: 1, z: 0 });
  const base = {
    getHeightAt: flat, getHeightAtFast: flat, _roadDist: () => 1e9, getGroundType: () => 'medium', _noVeg: () => false,
    getWaterMaskAt: () => 0, _villageMask: () => 0, getNormalAt: slopeN,
  };
  const biome = resolveGroundReduxProfile('monsoon').grass;
  const lay = (sun) => {
    const g = createTallGrass({ ...base, ...(sun ? { _swardSlope: Object.freeze([sun, 0, 1]) } : {}) }, { seed: 6, tier: 'desktop', biome, qualityScale: () => 1 });
    settle(g);
    const out = read(g);
    g.dispose();
    return out;
  };
  const off = lay(null), sunOn = lay(1), sunAway = lay(-1);
  const count = (list, east) => list.filter((bl) => (east ? bl.x > 3 : bl.x < -3)).length;
  const meanH = (list, east) => { const l = list.filter((bl) => (east ? bl.x > 3 : bl.x < -3)); return l.reduce((a, bl) => a + bl.h, 0) / l.length; };
  const warm = (list, east) => { const l = list.filter((bl) => (east ? bl.x > 3 : bl.x < -3)); return l.reduce((a, bl) => a + bl.r / bl.g, 0) / l.length; };
  assert.ok(count(sunOn, true) < count(off, true) * 0.7, `thinner up the steep slope (${count(sunOn, true)} vs ${count(off, true)})`);
  assert.ok(meanH(sunOn, true) < meanH(off, true) * 0.85, 'and shorter');
  assert.equal(count(sunOn, false), count(off, false), 'the flat ground is untouched');
  assert.ok(warm(sunOn, true) > warm(sunAway, true) + 0.03, `drier on the slope turned to the sun (${warm(sunOn, true).toFixed(3)} vs ${warm(sunAway, true).toFixed(3)})`);
  slopeRead = `${(count(sunOn, true) / count(off, true)).toFixed(2)}x the blades, ${(meanH(sunOn, true) / meanH(off, true)).toFixed(2)}x the height, `
    + `r/g ${warm(sunOn, true).toFixed(2)} toward the sun vs ${warm(sunAway, true).toFixed(2)} away`;
}

// 3. The thatch under Monsoon's sward: the material's gated block, bound from the profile, off under the legacy A/B.
{
  const src = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('uniform float uThatch;'), 'a scalar uniform (no sampler)');
  assert.ok(src.includes('if (uThatch > 0.001 && meadowG > 0.002) {'), 'the block runs only where a map asks it, on the meadow');
  assert.ok(src.includes('let thatchV = Math.min(1, Math.max(0, groundProfile.thatch ?? 0));') && src.includes('    thatchV = 0;')
    && src.includes('shader.uniforms.uThatch = { value: thatchV };'), 'bound from the profile, off under ?ground=legacy');
  assert.ok(src.includes('mix(1.0, 0.45, smoothstep(30.0, 120.0, camDist))'), 'eased with the distance, never gone (no ring round the camera)');
  assert.ok(src.includes("...((resolveGroundReduxProfile(cfg?.id).swardSlope ?? 0) > 0 && !legacyGroundLanes ? { _swardSlope:"),
    'the slope law\'s hook on the asking map, none under the legacy A/B');
}

// 4. The tufts read the same laws inside the section the grass harnesses compile.
{
  const veg = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
  const filter = veg.indexOf('  // shared placement filter/tint'), prep = veg.indexOf("  yield { stage: 'grassPrep' };");
  for (const decl of ['const fieldDrawAt = (x: number, z: number): number => {', 'const swardSlopeK = heightField._swardSlope ?? null;']) {
    const at = veg.indexOf(decl);
    assert.ok(at > filter && at < prep, `in the compiled section: ${decl}`);
  }
  assert.ok(veg.includes('if (fieldW > 0.15 + 0.70 * fieldDrawAt(x, z)) {'), 'the field gate across its band');
  assert.ok(veg.includes('? fieldDrawAt(x * 1.22 + 17.3, z * 1.22 - 5.1) < 1 - smoothstepJs(-1.6, 2.6, f.edgeM - f.marginM + (fieldDrawAt(x * 0.22 + 3.1, z * 0.22 + 7.7) - 0.5) * 3.0)')
    && veg.includes(': f.edgeM < f.marginM) {'), 'the margin across its band, a bund\'s and a wall\'s on their line');
  assert.ok(veg.includes('if (clJ < 0.55 * steepK) return null;'), 'thinner up a steep slope');
  const tg = readFileSync(new URL('./tallGrass.ts', import.meta.url), 'utf8');
  assert.ok(tg.includes('if (landW > landDraw && _field.active) {')
    && tg.includes('? swardNoise(x, z, 0.9, 0x2b3c) < 1 - smoothstep(-1.6, 2.6, _field.edgeM - _field.marginM + (swardNoise(x, z, 5.0, 0x3d4e) - 0.5) * 3.0)'),
    'the tall grass reads the gate and the margin the same way');
  const terr = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
  assert.ok(terr.includes('gCropReliefW = (crop > 2.5 && crop < 3.5) ? 0.0 : gCropW;'), 'a young green crop keeps the sward\'s relief');
}

console.log(`swardTerrain: the field gate across its band (the field's share ${shares} from the flat up the slope), the margin across `
  + `its band (its share ${marginRead}; a wall's footing bare), Monsoon's sward on its `
  + `slopes (${slopeRead}; profile and hook Monsoon only), the thatch block gated and bound, the tufts' laws PASS; no GPU/art claim`);
