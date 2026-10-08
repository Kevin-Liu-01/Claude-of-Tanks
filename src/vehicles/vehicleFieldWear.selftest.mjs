// Receipt for the round 5 field wear (vehicleFieldWear.ts; 2026-10-08, tank-accessories lane):
// 1. every battlefield's soil follows its terrain: the table's dirt and ground colours are recomputed here from the photo
//    sets, sourcedTextures.ts's plan and the map configs, composed and measured as the terrain composes and measures
//    them (sourcedTextureComposer.ts composeAlbedoPixels; terrain.ts measureLayerMean: the linear mean per channel), and
//    each map's climate is its groundRedux.ts class;
// 2. the shader text runs through the receipts' GLSL subset (src/world/glslSubset.test-support.mjs): the glue in full,
//    the core's laws (graded up from the ground contact, film only on faces that look up, the far octaves settle to their
//    mean, the desert's grime darker than a tan paint and its film only a tint, the farmland's coat darker and wetter, the
//    running gear dark under every soil, the breakup soft, nothing lit past the cap, nothing at strength 0; the recess
//    grime, the worn edges and the varied specular at 40 m and in the Garage, every thin band keeping its area far off);
// 3. the plumbing: per-draw roles and soils, setCamoBiome → the battle soil, the floor hook's uniforms and injections with
//    no define (no program variant), the per-root strength through setVehicleGroundFromRoot, the measured planes, and the
//    soot source chosen per material (three uploads a material's uniforms only when the material changes).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { loadImage, createCanvas } from '@napi-rs/canvas';
import { parseGlsl, runGlsl, runGlslFunction } from '../world/glslSubset.test-support.mjs';
import { composeAlbedoPixels } from '../world/sourcedTextureComposer.ts';
import { getMapConfig, MAP_IDS } from '../world/maps/index.ts';
import { resolveGroundReduxProfile } from '../world/groundRedux.ts';
import {
  VEHICLE_FIELD_GROUNDS, VEHICLE_FIELD_WEAR_GARAGE, VEHICLE_FIELD_WEAR_UNIFORMS, FIELD_WEAR_CORE_GLSL, FIELD_WEAR_FRAGMENT,
  FIELD_WEAR_FRAGMENT_PARS, FIELD_WEAR_NOISE_GLSL, FIELD_WEAR_VERTEX, installVehicleFieldWear, vehicleFieldSoil,
  vehicleFieldWearRole,
} from './vehicleFieldWear.ts';
import { setCamoBiome, setVehicleGroundFromRoot, resetVehicleGround, vehicleAmbientFloorHook } from './materials.ts';

const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// ---------------------------------------------------------------- 1. the soil follows the terrain
{
  const root = new URL('../../', import.meta.url);
  const src = readFileSync(new URL('../world/sourcedTextures.ts', import.meta.url), 'utf8');
  const a = src.indexOf('const TERRAIN_PLAN = {'), b = src.indexOf('} satisfies Record<string, TerrainPlan>;', a);
  assert.ok(a > 0 && b > a, 'sourcedTextures.ts keeps its TERRAIN_PLAN literal');
  const PLAN = new Function(`return ${src.slice(a + 'const TERRAIN_PLAN = '.length, b + 1)}`)();
  const sets = {};
  for (const m of src.matchAll(/^\s+(\w+): (acg|ph)\(TT, '([\w]+)'\),$/gm)) sets[m[1]] = { kind: m[2], base: m[3] };
  // every photo this receipt reads, spelled out so the receipt cache (tools/selftest-inputs.mjs) sees them as inputs
  const PHOTOS = new Set([
    'public/textures/terrain/Grass004_1K-JPG_Color.jpg', 'public/textures/terrain/Grass004_1K-JPG_AmbientOcclusion.jpg',
    'public/textures/terrain/Ground071_1K-JPG_Color.jpg', 'public/textures/terrain/Ground071_1K-JPG_AmbientOcclusion.jpg',
    'public/textures/terrain/Ground093C_1K-JPG_Color.jpg', 'public/textures/terrain/Ground093C_1K-JPG_AmbientOcclusion.jpg',
    'public/textures/terrain/Snow010A_1K-JPG_Color.jpg', 'public/textures/terrain/Snow010A_1K-JPG_AmbientOcclusion.jpg',
    'public/textures/terrain/withered_grass_diff_1k.jpg', 'public/textures/terrain/withered_grass_ao_1k.jpg',
  ]);
  const file = (set, layer) => {
    const s = sets[set];
    assert.ok(s, `terrain set ${set} is known`);
    const name = s.kind === 'ph' ? `${s.base}_${layer === 'Color' ? 'diff' : 'ao'}_1k.jpg` : `${s.base}_1K-JPG_${layer}.jpg`;
    const path = `public/textures/terrain/${name}`;
    assert.ok(PHOTOS.has(path), `${path} is listed among this receipt's inputs`);
    return new URL(path, root);
  };
  const px = new Map();
  const pixels = async (url) => {
    if (!px.has(url.href)) {
      const img = await loadImage(readFileSync(url));
      const c = createCanvas(256, 256); const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, 256, 256);
      px.set(url.href, ctx.getImageData(0, 0, 256, 256).data);
    }
    return px.get(url.href);
  };
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const layerMean = async (entry, mult) => {
    const o = typeof entry === 'string' ? { set: entry } : entry;
    let tint = o.tint ?? null;
    if (mult) tint = tint ? tint.map((t, k) => t * mult[k]) : mult;
    const color = new Uint8ClampedArray(await pixels(file(o.set, 'Color')));
    composeAlbedoPixels(color, await pixels(file(o.set, 'AmbientOcclusion')), null, { tint, desat: o.desat ?? 0, lift: o.lift ?? 0 });
    const m = [0, 0, 0];
    for (let i = 0; i < color.length; i += 4) for (let k = 0; k < 3; k++) m[k] += lin(color[i + k] / 255);
    return m.map((v) => v / (color.length / 4));
  };
  const near = (got, want, what) => {
    for (let k = 0; k < 3; k++) {
      assert.ok(Math.abs(got[k] - want[k]) <= Math.max(0.006, want[k] * 0.06),
        `${what}: the vehicle table ${got.map((v) => v.toFixed(3))} drifted from the terrain ${want.map((v) => v.toFixed(3))}`);
    }
  };
  for (const id of MAP_IDS) {
    const row = VEHICLE_FIELD_GROUNDS[id];
    assert.ok(row, `${id} has a field ground`);
    const S = getMapConfig(id).splat || {};
    const palette = S.sourcedPalette ?? (Object.hasOwn(PLAN, id) ? id : 'verdant');
    const plan = PLAN[palette];
    const dirt = (await layerMean(plan.D, S.sourcedTint?.D)).map((v, k) => v * (S.soilTint?.[k] ?? 1));
    near(row.dirt, dirt, `${id} dirt`);
    near(row.ground, await layerMean(plan.G, S.sourcedTint?.G), `${id} ground`);
    assert.equal(row.climate, resolveGroundReduxProfile(id).climate, `${id} wears its ground's climate`);
  }
  // the derived soils keep the critics' reads: farmland darker and wet low; the desert's contrast a darker grime low
  // with only a faint film near the paint's own value on the decks (round 5's GPU frames: a pale film washed the M60A1
  // white); winter snow on the decks
  const farm = vehicleFieldSoil('verdant'), desert = vehicleFieldSoil('desert'), winter = vehicleFieldSoil('winter');
  const tanPaint = [0.40, 0.33, 0.22];
  assert.ok(farm.wet >= 0.6 && luma(farm.deep) < luma(farm.splash) && luma(farm.splash) < luma(farm.settle), 'farmland: wet deep, drier up, dust on the decks');
  assert.ok(luma(farm.deep) >= 0.03 && luma(farm.deep) < 0.08, 'farmland coat is dark wet earth, not a black void and not cream');
  assert.ok(luma(desert.deep) < luma(tanPaint) * 0.45 && luma(desert.deep) < luma(desert.splash) * 0.75, 'desert: a darker grime low');
  assert.ok(luma(desert.settle) < luma(tanPaint) * 1.05 && desert.settleAmount <= 0.4, 'desert: at most a faint film on the decks');
  assert.ok(desert.wet <= 0.2, 'desert dust is dry');
  assert.ok(luma(winter.settle) > 0.6 && luma(winter.splash) < 0.15, 'winter: snow on the decks, dark slush thrown up');
  assert.equal(vehicleFieldSoil('no-such-map'), vehicleFieldSoil('verdant'), 'an unknown map reads as Verdant');
}

// ---------------------------------------------------------------- 2. the shader text through the GLSL subset
const fnTree = (name) => {
  const text = FIELD_WEAR_NOISE_GLSL; const at = text.indexOf(name.endsWith('(') ? name : `${name}(`); const open = text.indexOf('{', at);
  let depth = 1, k = open + 1; for (; depth; k++) { if (text[k] === '{') depth++; else if (text[k] === '}') depth--; }
  return parseGlsl(text.slice(open + 1, k - 1));
};
const hashT = fnTree('cotWearHash('), noiseT = fnTree('cotWearNoise(');
const hash3T = fnTree('cotWearHash3'), noise3T = fnTree('cotWearNoise3'), bandT = fnTree('cotWearBand');
const fns = {};
fns.cotWearHash = (p) => runGlslFunction(hashT, { p }, fns, new Set());
fns.cotWearNoise = (x) => runGlslFunction(noiseT, { x }, fns, new Set());
fns.cotWearHash3 = (p) => runGlslFunction(hash3T, { p }, fns, new Set());
fns.cotWearNoise3 = (x) => runGlslFunction(noise3T, { x }, fns, new Set());
fns.cotWearBand = (x, lo, hi, soft, foot) => runGlslFunction(bandT, { x, lo, hi, soft, foot }, fns, new Set());
for (let i = 0; i < 64; i++) {
  const v = fns.cotWearNoise([i * 0.731 - 9, i * 1.37 + 2]);
  assert.ok(v >= 0 && v <= 1, 'the value noise stays in 0..1');
  const w = fns.cotWearNoise3([i * 0.731 - 9, i * 1.37 + 2, i * 0.29 - 4]);
  assert.ok(w >= 0 && w <= 1, 'and the runs\' 3D octave');
}
// the 3D octave is continuous (no lattice seam inside a hull's reach) and varies (a sane hash)
{
  let jump = 0, lo = 1, hi = 0, prev = null;
  for (let k = 0; k <= 400; k++) {
    const w = fns.cotWearNoise3([k * 0.01 - 2, 0.37, 0.8]);
    if (prev !== null) jump = Math.max(jump, Math.abs(w - prev));
    lo = Math.min(lo, w); hi = Math.max(hi, w); prev = w;
  }
  assert.ok(jump < 0.06 && hi - lo > 0.4, `the runs' octave is smooth and varied (step ${jump.toFixed(3)}, range ${(hi - lo).toFixed(2)})`);
}
const core = parseGlsl(FIELD_WEAR_CORE_GLSL);
const soilVec = (s) => ({ soilDeep: [...s.deep, s.wet], soilSplash: [...s.splash, 0], soilSettle: [...s.settle, s.settleAmount] });
const PAINT = [1, 1, 1, 1], IRON = [0.9, 0, 2, 0.6], STEEL = [0.9, 0.8, 3, 1];
// (a hull 7 m long, its deck at 1.5 m, its fenders at 1.05 m and 1.8 m out, its turret roof at 2.05 m and the turret's
// foot at 1.52 m; the base pixel sits over the fenders, outboard of the wheel bays and inboard of the fender lip)
const BASE = {
  wearH: 0.3, wearUp: 0, wearFront: 0, wearBack: 0, wearAlong: 0, wearAcross: 1.6, wearSootAlong: 0, wearSootOff: 9, wearRelief: 0,
  wearFoot: 0.004, wearN1: 0.5, wearN2: 0.5, wearRuns: 0.5, wearStrength: 1, wearRole: PAINT,
  wearHull: [-3.4, 3.6, 1.5, 1.8], wearPlanes: [1.05, 2.05, 1.52, 0], wearSoot: [0, 0, 0, 0], wearSootAxis: [0, 0, 1, 1],
  ...soilVec(vehicleFieldSoil('verdant')), wearAlbedo: [0.1, 0.12, 0.06], wearRough: 0.7, wearMetal: 0.05,
};
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// (the glue's own derived inputs: the close-range factor and whether the pixel lies inside the soot source's reach)
const run = (over) => {
  const v = { ...BASE, ...over };
  v.wearNear = 1 - ss(0.008, 0.022, v.wearFoot);
  v.wearSootIn = v.wearSoot[3] > 0 && v.wearSootOff < v.wearSoot[3] && v.wearSootAlong > -0.35 * v.wearSootAxis[3] && v.wearSootAlong < v.wearSootAxis[3];
  return runGlsl(core, v, fns, new Set());
};
// strength 0 and a role of none change nothing
for (const over of [{ wearStrength: 0 }, { wearRole: [0, 0, 0, 0] }]) {
  const o = run({ ...over, wearUp: 1, wearH: 0.2, wearSoot: [0, 0, 0, 0.3], wearSootAlong: 0.1, wearSootOff: 0.05 });
  assert.deepEqual(o.wearAlbedo, [0.1, 0.12, 0.06]); assert.equal(o.wearRough, 0.7); assert.equal(o.wearMetal, 0.05);
}
// graded up from the ground contact, averaged over the noise: heavy low, gone by the turret's sides
const coatAt = (h, up = 0, soil = 'verdant', albedo = [0.1, 0.12, 0.06], back = 0) => {
  let shift = 0, n = 0;
  for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
    // (a bare-steel role carries no chips or streaks, so the coat and film are what this measures)
    const o = run({ wearH: h, wearUp: up, wearBack: back, wearN1: i / 8, wearN2: j / 8, wearRole: [1, 1, 0, 0],
      ...soilVec(vehicleFieldSoil(soil)), wearAlbedo: albedo });
    shift += Math.abs(luma(o.wearAlbedo) - luma(albedo)) + Math.abs(o.wearAlbedo[0] - albedo[0]) + Math.abs(o.wearAlbedo[2] - albedo[2]);
    n++;
  }
  return shift / n;
};
const c02 = coatAt(0.2), c08 = coatAt(0.8), c14 = coatAt(1.4), c25 = coatAt(2.5);
assert.ok(c02 > c08 * 1.3 && c08 > c14 * 1.5 && c14 > c25, `the coat thins with height (${[c02, c08, c14, c25].map((v) => v.toFixed(4))})`);
assert.ok(c25 < 1e-6, 'nothing on a vertical face high on the turret');
assert.ok(coatAt(1.0, 0, 'verdant', [0.1, 0.12, 0.06], 1) > c08 * 0.9 && coatAt(1.0, 0, 'verdant', [0.1, 0.12, 0.06], 1) > coatAt(1.0) * 1.3,
  'the rooster tail carries the coat higher up the rear plate than up a side plate');
// gravity: the film settles on faces that look up, never on vertical faces up high
const darkGreen = [0.05, 0.065, 0.035];
assert.ok(coatAt(2.2, 1, 'verdant', darkGreen) > 0.004 && coatAt(2.2, 0, 'verdant', darkGreen) < 1e-6, 'dust settles on the roof, not the turret side');
assert.ok(coatAt(1.0, 1, 'verdant', darkGreen) > coatAt(2.6, 1, 'verdant', darkGreen), 'the film thins up the turret');
// the far octaves settle to their mean: at a battle footprint the noise inputs change nothing (no sparkle), and the
// fine marks (polish, chips, walkways, runs) are gone
{
  for (const over of [{}, { wearRole: IRON, wearUp: 1 }, { wearRelief: 1, wearUp: 1, wearH: 1.5, wearAlong: 3.2 }]) {
    const a = run({ wearFoot: 0.2, wearN1: 0, wearN2: 0, wearRuns: 0, wearH: 0.6, wearUp: 0.5, ...over });
    const b = run({ wearFoot: 0.2, wearN1: 1, wearN2: 1, wearRuns: 1, wearH: 0.6, wearUp: 0.5, ...over });
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(a.wearAlbedo[k] - b.wearAlbedo[k]) < 1e-9, 'band-limited at range');
    assert.ok(Math.abs(a.wearMetal - b.wearMetal) < 1e-9, 'no polish or chip at range');
  }
}
// farmland darkens a light green low and leaves it wet; the desert's film only tints a tan deck; the desert's grime
// darkens the tan lower hull (its value contrast)
{
  const light = [0.12, 0.16, 0.07];
  const o = run({ wearH: 0.15, wearN1: 0.5, wearN2: 0.5, wearAlbedo: light });
  assert.ok(luma(o.wearAlbedo) < luma(light) && o.wearAlbedo[0] / o.wearAlbedo[1] > light[0] / light[1], 'farmland: dark brown earth low');
  assert.ok(o.wearRough < 0.62, 'farmland earth is wet low on the hull');
  const tan = [0.40, 0.33, 0.22];
  const d = run({ wearH: 1.6, wearUp: 1, wearN1: 0.6, wearN2: 0.6, wearRole: [1, 1, 0, 0], ...soilVec(vehicleFieldSoil('desert')), wearAlbedo: tan });
  assert.ok(Math.abs(luma(d.wearAlbedo) - luma(tan)) < luma(tan) * 0.08 && d.wearRough > BASE.wearRough + 0.02, 'desert: a faint, matte film on a tan deck');
  const low = run({ wearH: 0.3, wearUp: 0, wearRole: [1, 1, 0, 0], ...soilVec(vehicleFieldSoil('desert')), wearAlbedo: tan });
  assert.ok(luma(low.wearAlbedo) < luma(tan) * 0.6, 'desert: a darker grime low on a tan hull');
}
// use: soot near the bound source (the muzzle or the exhaust), nothing past its reach or behind its mouth
{
  const at = (along, off, reach = 0.3) => run({ wearH: 2.2, wearSoot: [0, 0, 0, reach], wearSootAxis: [0, 0, -1, 0.8], wearSootAlong: along, wearSootOff: off });
  const clean = run({ wearH: 2.2 });
  assert.ok(luma(at(0.25, 0.05).wearAlbedo) < luma(clean.wearAlbedo) * 0.5, 'carbon on the tube just behind the muzzle');
  assert.ok(at(0.25, 0.05).wearRough > 0.9, 'soot is matte');
  assert.deepEqual(at(0.25, 0.6).wearAlbedo, clean.wearAlbedo, 'none past its reach');
  assert.deepEqual(at(-0.5, 0.05).wearAlbedo, clean.wearAlbedo, 'none upstream of the mouth');
  assert.deepEqual(at(0.25, 0.05, 0).wearAlbedo, clean.wearAlbedo, 'no source bound: no soot');
}
// use up close: track iron polished where wheels and ground rub (through the coat), bare steel worn at contact spots,
// chips along the plate's relief only, boots' rubbing on the walkways near the bow, streaks down the vertical plates
{
  const iron = run({ wearRole: IRON, wearUp: 1, wearH: 0.9, wearN2: 0.8, wearAlbedo: [0.03, 0.03, 0.03], wearRough: 0.75, wearMetal: 0.2 });
  const ironCoat = run({ wearRole: IRON, wearUp: 1, wearH: 0.9, wearN2: 0.3, wearAlbedo: [0.03, 0.03, 0.03], wearRough: 0.75, wearMetal: 0.2 });
  assert.ok(iron.wearMetal > ironCoat.wearMetal + 0.04 && iron.wearRough < ironCoat.wearRough && luma(iron.wearAlbedo) < 0.06,
    'track iron worn smooth on its up-facing faces: a dull dark sheen, never a pale plank');
  const ironSide = run({ wearRole: IRON, wearUp: 0, wearH: 0.9, wearN2: 0.8, wearAlbedo: [0.03, 0.03, 0.03], wearRough: 0.75, wearMetal: 0.2 });
  const ironSideCoat = run({ wearRole: IRON, wearUp: 0, wearH: 0.9, wearN2: 0.3, wearAlbedo: [0.03, 0.03, 0.03], wearRough: 0.75, wearMetal: 0.2 });
  assert.ok(ironSide.wearMetal <= ironSideCoat.wearMetal + 1e-9, 'not on its sides');
  // the track's top run and the tyres keep the dark packed coat, never the pale splash (wave 264: "a bright white outline
  // traces both track runs"); a painted plate at the same height takes the paler splash
  const desertSoil = soilVec(vehicleFieldSoil('desert'));
  const tanWheel = [0.3, 0.25, 0.17];
  for (const role of [IRON, [0.9, 0, 4, 0.6], [0.75, 0, 5, 0.6]]) {
    const top = run({ wearRole: role, wearUp: 0, wearH: 0.85, ...desertSoil, wearAlbedo: tanWheel });
    const plate = run({ wearRole: [1, 1, 0, 0], wearUp: 0, wearH: 0.85, ...desertSoil, wearAlbedo: tanWheel });
    assert.ok(luma(top.wearAlbedo) < luma(plate.wearAlbedo) * 0.9, 'the running gear keeps the dark deep coat at its top');
    // and takes no settled film on its up-facing faces (the film on the track's top run drew wave 264's cream outline)
    const up = run({ wearRole: role, wearUp: 1, wearH: 0.85, ...desertSoil, wearAlbedo: [0.03, 0.03, 0.03] });
    assert.ok(luma(up.wearAlbedo) <= 0.03 * 1.35 + 0.01 + 1e-9, 'no film, and no lightening past the cap, on the running gear');
  }
  // every soil, every role: the wear lightens a dark surface by at most a third (the readability floor scales a shaded
  // texel's light by its albedo over its paint's mean, so a lit-up track band drew a cream outline in shade)
  for (const soil of ['verdant', 'desert', 'winter', 'moon', 'mars']) {
    for (const role of [PAINT, IRON, STEEL, [0.9, 0, 4, 0.6], [0.75, 0, 5, 0.6], [0.85, 1, 0, 0.8]]) {
      for (const h of [0.1, 0.6, 1.2, 2.2]) for (const up of [-1, 0, 1]) {
        const dark = [0.012, 0.0123, 0.0116];
        const o = run({ wearRole: role, wearUp: up, wearH: h, wearN1: 0.9, wearN2: 0.9, wearRuns: 0.9, ...soilVec(vehicleFieldSoil(soil)), wearAlbedo: dark });
        assert.ok(luma(o.wearAlbedo) <= luma(dark) * 1.35 + 0.01 + 1e-9, `${soil}: the wear never lights a dark surface up (${role}, h ${h}, up ${up})`);
      }
    }
  }
  // soft-edged: the cover never jumps; across the fine octave and the runs the albedo moves smoothly (no thresholded
  // blotch: round 5's GPU frames read one as "digital camo" on the mud flaps)
  for (const role of [PAINT, [0.9, 0, 4, 0.6]]) for (const key of ['wearN2', 'wearRuns']) {
    let jump = 0, prev = null;
    for (let k = 0; k <= 40; k++) {
      const o = run({ wearRole: role, wearH: 0.7, [key]: k / 40, ...desertSoil, wearAlbedo: [0.3, 0.25, 0.17] });
      const l = luma(o.wearAlbedo);
      if (prev !== null) jump = Math.max(jump, Math.abs(l - prev));
      prev = l;
    }
    assert.ok(jump < 0.006, `the coat's breakup is soft (${key}: largest step ${jump.toFixed(4)} per 1/40)`);
  }
  let worn = 0;
  for (let i = 0; i <= 10; i++) if (run({ wearRole: STEEL, wearH: 2, wearN1: i / 10, wearN2: i / 10, wearMetal: 0.4 }).wearRough < BASE.wearRough - 0.01) worn++;
  assert.ok(worn > 0 && worn < 8, 'bare steel is worn smooth in spots, not all over');
  const chipped = run({ wearH: 1.6, wearUp: 0.5, wearRelief: 0.9, wearN2: 0.9 });
  const smooth = run({ wearH: 1.6, wearUp: 0.5, wearRelief: 0, wearN2: 0.9 });
  assert.ok(chipped.wearMetal > smooth.wearMetal + 0.12 && luma(chipped.wearAlbedo) < luma(smooth.wearAlbedo) * 0.7, 'dark chips along the relief');
  assert.ok(smooth.wearMetal < 0.1, 'no chips on a plain plate');
  const walk = run({ wearH: 1.45, wearUp: 1, wearAlong: 3.3, wearN1: 0.8, wearN2: 0.6 });
  const midDeck = run({ wearH: 1.45, wearUp: 1, wearAlong: 0.2, wearN1: 0.8, wearN2: 0.6 });
  assert.ok(walk.wearRough < midDeck.wearRough - 0.05, 'boots rub the walkway by the bow smoother than the middle of the deck');
  // grime runs: on a vertical painted plate only where the runs crest and the low octave allows, soft, a multiply
  const runAt = (runs, n1, up = 0) => run({ wearH: 1.6, wearUp: up, wearN1: n1, wearRuns: runs });
  const flatPlate = run({ wearH: 1.6, wearUp: 0, wearN1: 0.8, wearRuns: 0.5, wearRole: [1, 1, 0, 1] });
  assert.ok(luma(runAt(0.95, 0.8).wearAlbedo) < luma(flatPlate.wearAlbedo) * 0.9, 'a grime run hangs where the runs crest');
  assert.ok(luma(runAt(0.95, 0.3).wearAlbedo) > luma(flatPlate.wearAlbedo) * 0.97, 'sparse: none where the low octave is low');
  assert.ok(luma(runAt(0.95, 0.8, 1).wearAlbedo) >= luma(run({ wearH: 1.6, wearUp: 1, wearN1: 0.8, wearRuns: 0.5 }).wearAlbedo) - 1e-9,
    'runs hang on vertical plates, not on decks');
  assert.ok(runAt(0.95, 0.8).wearAlbedo.every((v, k) => v <= flatPlate.wearAlbedo[k] + 1e-9), 'a run multiplies: never a bright mark');
}
// at every distance (the lead's round 5 brief: the media lane's blind pairs called the hulls clean): grime in the
// recesses, worn edges and varied specular, large-scale values on the measured hull frame (deck 1.5, fenders 1.05 and
// 1.8 m out, roof 2.05, the turret's foot 1.52), band-limited by the footprint; FAR is a 40 m battle pixel (2.3 cm: no
// fine octave)
{
  const FAR = 0.023;
  const lum = (o) => luma(o.wearAlbedo);
  // (1) recess grime: at the foot of a wall standing on the deck (inside the hull's outline), the fenders, the turret
  // roof or round the turret's foot; none on a plate whose top edge ends at the plane (the band starts just above it),
  // and none on a plate that only runs past a plane's height at the hull's outline (the rear plate, the bow's plates,
  // the skirts)
  // (value on a tan hull in the desert, where it must read darker; the hue on a dark green one below)
  const desertTan = { ...soilVec(vehicleFieldSoil('desert')), wearAlbedo: [0.40, 0.33, 0.22] };
  const wall = (h, over = {}) => run({ wearH: h, wearUp: 0, wearFoot: FAR, wearAcross: 0.5, ...desertTan, ...over });
  const deckless = { wearHull: [-3.4, 3.6, 1.2, 1.8], wearPlanes: [1.05, 2.05, 0, 0] };
  assert.ok(lum(wall(1.53)) < lum(wall(1.53, deckless)) * 0.8, 'grime at the foot of a wall standing on the deck (a hatch, a box)');
  assert.ok(Math.abs(lum(wall(1.49, { wearFoot: 0.004 })) - lum(wall(1.49, { wearFoot: 0.004, ...deckless }))) < 1e-9,
    'none on the top of a plate that ends at the deck');
  assert.ok(lum(wall(1.75)) > lum(wall(1.53)) * 1.2, 'it fades up the wall within a hand-span');
  const footed = { wearHull: [-3.4, 3.6, 1.2, 1.8] };
  assert.ok(lum(wall(1.55, { ...footed, wearPlanes: [1.05, 2.05, 1.52, 0] })) < lum(wall(1.55, { ...footed, wearPlanes: [1.05, 2.05, 0, 0] })) * 0.8,
    'round the turret\'s foot (the ring\'s gap), wherever the turret stands');
  assert.ok(lum(wall(2.08)) < lum(wall(2.08, { wearPlanes: [1.05, 0, 1.52, 0] })) * 0.8, 'at the foot of a hatch rim or cupola on the roof');
  assert.ok(lum(wall(1.09, { wearAcross: 1.3 })) < lum(wall(1.09, { wearAcross: 1.3, wearPlanes: [0.6, 2.05, 1.52, 0] })) * 0.8,
    'at the foot of the hull side along the fender');
  for (const [what, over] of [['the rear plate', { wearAlong: -3.38, wearFront: -1, wearBack: 1 }], ['the bow\'s plates', { wearAlong: 3.2, wearFront: 1 }],
    ['the skirts', { wearAcross: 1.78 }]]) {
    for (const h of [1.53, 1.08, 1.56]) {
      const a = wall(h, { ...over, wearRole: [1, 1, 0, 0] }), b = wall(h, { ...over, wearRole: [1, 1, 0, 0], ...deckless, wearPlanes: [0.2, 2.05, 0, 0] });
      assert.ok(Math.abs(lum(a) - lum(b)) < 1e-9, `no stripe on ${what} where it runs past a plane (h ${h})`);
    }
  }
  const underside = run({ wearH: 2.0, wearUp: -1, wearFoot: FAR, ...desertTan });
  assert.ok(lum(underside) < lum(run({ wearH: 2.0, wearUp: -1, wearFoot: FAR, ...desertTan, wearHull: [0, 0, 0, 0] })) * 0.8, 'under the bustle');
  const bayIn = run({ wearH: 0.6, wearAcross: 0.9, wearFoot: FAR, ...desertTan }), bayOut = run({ wearH: 0.6, wearAcross: 1.6, wearFoot: FAR, ...desertTan });
  assert.ok(lum(bayIn) < lum(bayOut) * 0.85, 'the wheel bays: the hull\'s own sides inboard of the tracks');
  // on a dark green hull the grime reads by hue: the farmland's dried earth, browner, within a quarter of the paint's value
  const green = [0.07, 0.09, 0.04], gIn = run({ wearH: 1.53, wearAcross: 0.5, wearFoot: FAR, wearAlbedo: green });
  const gOut = run({ wearH: 1.53, wearAcross: 0.5, wearFoot: FAR, wearAlbedo: green, wearHull: [-3.4, 3.6, 1.2, 1.8], wearPlanes: [1.05, 2.05, 0, 0] });
  assert.ok(gIn.wearAlbedo[0] / gIn.wearAlbedo[1] > gOut.wearAlbedo[0] / gOut.wearAlbedo[1] * 1.15 && Math.abs(lum(gIn) / lum(gOut) - 1) < 0.25,
    'on dark green the corner grime reads browner, not just darker');
  const rearIn = run({ wearH: 0.6, wearAcross: 0.9, wearFront: -1, wearBack: 1, wearFoot: FAR });
  const rearOut = run({ wearH: 0.6, wearAcross: 1.6, wearFront: -1, wearBack: 1, wearFoot: FAR });
  assert.ok(Math.abs(lum(rearIn) - lum(rearOut)) < 1e-9, 'not the rear plate (it faces the stern, not a bay)');
  for (const role of [IRON, [0.9, 0, 4, 0.6], [0.75, 0, 5, 0.6]]) {
    const a = run({ wearH: 0.6, wearAcross: 0.9, wearFoot: FAR, wearRole: role }), b = run({ wearH: 0.6, wearAcross: 1.6, wearFoot: FAR, wearRole: role });
    assert.deepEqual(a.wearAlbedo, b.wearAlbedo, 'the running gear keeps its own packed coat');
  }
  assert.ok(bayIn.wearAlbedo.every((v, k) => v <= bayOut.wearAlbedo[k] + 1e-9) && underside.wearRough > 0.75, 'on a tan hull the grime only darkens, matte');
  // (2) worn edges, broken along their length: the fender lip and the rear deck's edge; dark steel with a sheen, never a
  // light line
  const lipAt = (across, n1, over = {}) => run({ wearH: 1.03, wearUp: 1, wearAcross: across, wearN1: n1, wearFoot: FAR, ...over });
  const lip = lipAt(1.77, 0.8), inboard = lipAt(1.5, 0.8);
  assert.ok(lum(lip) < lum(inboard) * 0.8 && lip.wearMetal > inboard.wearMetal + 0.15 && lip.wearRough < inboard.wearRough - 0.1,
    `the fender lip worn to dark steel with a sheen at 40 m (${lum(lip).toFixed(3)} vs ${lum(inboard).toFixed(3)})`);
  assert.ok(Math.abs(lum(lipAt(1.77, 0.2)) - lum(lipAt(1.5, 0.2))) < 0.002, 'broken along its length by the low octave');
  const tan = [0.40, 0.33, 0.22], dark = [0.02, 0.022, 0.018];
  assert.ok(lum(lipAt(1.77, 0.8, { wearAlbedo: tan })) < luma(tan) * 0.6, 'on a tan hull a dark worn line');
  assert.ok(lum(lipAt(1.77, 0.8, { wearAlbedo: dark })) <= luma(dark) * 1.35 + 0.01 + 1e-9, 'never a light line on a dark one');
  const stern = (along, foot = FAR) => run({ wearH: 1.5, wearUp: 1, wearAlong: along, wearN1: 0.8, wearFoot: foot });
  assert.ok(lum(stern(-3.38)) < lum(stern(-3.1)) * 0.85 && lum(stern(-3.38, 0.004)) < lum(stern(-3.1, 0.004)) * 0.75,
    'the rear deck\'s edge (at 40 m and up close)');
  // (a broad band down a cast turret's rounded shoulder read as a dark smear in the round 5 sheet: no shoulder term)
  const shoulder = (role) => run({ wearH: 2.0, wearUp: 0.6, wearN1: 0.5, wearFoot: FAR, wearRole: role });
  assert.ok(Math.abs(lum(shoulder(PAINT)) - lum(shoulder([1, 1, 0, 1]))) < 1e-9, 'no smear down a turret\'s shoulder');
  // band-limited: far off a band widens and dims, keeping its area (a thin band never flickers on and off between
  // pixels); the lip's peak dims with it
  for (const [lo, hi, soft] of [[0.0, 0.05, [0.004, 0.06]], [0.0, 0.125, [0.012, 0]], [0.0, 0.1, [0.03, 0.006]]]) {
    const area = (foot) => {
      let sum = 0, peak = 0;
      for (let k = -400; k <= 600; k++) { const v = fns.cotWearBand(k * 0.001, lo, hi, soft, foot); sum += v * 0.001; peak = Math.max(peak, v); }
      return { sum, peak };
    };
    const a = area(0.002), b = area(0.06), c = area(0.15);
    assert.ok(Math.abs(b.sum / a.sum - 1) < 0.05 && Math.abs(c.sum / a.sum - 1) < 0.05 && c.peak < a.peak * 0.75,
      `a ${hi - lo} m band keeps its area far off (${a.sum.toFixed(4)} -> ${b.sum.toFixed(4)} -> ${c.sum.toFixed(4)}, peak ${a.peak.toFixed(2)} -> ${c.peak.toFixed(2)})`);
  }
  assert.ok(lum(lipAt(1.77, 0.8, { wearFoot: 0.08 })) > lum(lipAt(1.77, 0.8, { wearFoot: 0.004 })), 'the lip dims far off');
  // (3) varied specular at 40 m: the wet coat low, the dust film on the deck, the polished walkway by the bow, the worn
  // edge, the paint's own breakup
  const rough = (over) => run({ wearFoot: FAR, ...over }).wearRough;
  const lowCoat = rough({ wearH: 0.15 }), film = rough({ wearH: 1.3, wearUp: 1, wearAlong: 0.2, wearN1: 0.8 });
  const walkway = rough({ wearH: 1.3, wearUp: 1, wearAlong: 3.1, wearN1: 0.8 });
  assert.ok(lowCoat < 0.6 && film > 0.75 && walkway < film - 0.15, `wet coat ${lowCoat.toFixed(2)}, film ${film.toFixed(2)}, walkway ${walkway.toFixed(2)}`);
  assert.ok(Math.abs(rough({ wearH: 2.2, wearN1: 0.15 }) - rough({ wearH: 2.2, wearN1: 0.85 })) > 0.08, 'the paint\'s sheen breaks up at 40 m');
  const raisedTop = rough({ wearH: 2.1, wearUp: 1, wearN1: 0.8 }), roofTop = rough({ wearH: 2.05, wearUp: 1, wearN1: 0.8 });
  assert.ok(raisedTop < roofTop - 0.1, 'a raised top just above the roof (a hatch rim or lid) is polished');
  // the Garage's light film keeps the use-wear near full (age, not the battlefield)
  const garage = (over) => lum(wall(1.53, { wearStrength: VEHICLE_FIELD_WEAR_GARAGE, ...over }));
  assert.ok(garage({}) < garage(deckless) * 0.82, 'the Garage shows the recess grime too');
}
// the glue runs whole: the screen derivatives stand in as fixed steps, the normal-map relief block is preprocessor-only
{
  // (as a DOUBLE_SIDED material compiles it: that block's body kept, the other preprocessor blocks dropped)
  const glue = parseGlsl(FIELD_WEAR_FRAGMENT.replace(/#ifdef DOUBLE_SIDED([\s\S]*?)#endif/g, '$1').replace(/#ifdef[\s\S]*?#endif/g, ''));
  const singleSided = parseGlsl(FIELD_WEAR_FRAGMENT.replace(/#ifdef[\s\S]*?#endif/g, ''));
  const stub = {
    ...fns,
    dFdx: (v) => [0.002, 0, 0.0005].slice(0, v.length), dFdy: (v) => [0, 0.002, 0].slice(0, v.length),
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  };
  const vars = (h, up, face = 1, role = [1, 1, 0, 0]) => ({
    uVehGround: [0, 0, 0, 1], uVehWearRole: role, uVehWearHull: [-3.4, 3.6, 1.5, 1.8], uVehWearPlanes: [1.05, 2.05, 0, 0],
    uVehWearSoot: [0, 0, 0, 0], uVehWearSootAxis: [0, 0, 1, 1],
    ...Object.fromEntries(Object.entries(soilVec(vehicleFieldSoil('verdant'))).map(([k, v]) => [`uVehWear${k.slice(4)}`, v])),
    vCotWearFrame: [up, 0, 0, 0], vCotWearSide: [9, 0.37, -0.52, 1.6], faceDirection: face, vCotWearPos: [1.7, h, 0.4, h],
    diffuseColor: [0.1, 0.12, 0.06, 1], roughnessFactor: 0.7, metalnessFactor: 0.05,
  });
  const low = runGlsl(glue, vars(0.3, 0), stub, new Set());
  assert.notDeepEqual(low.diffuseColor, [0.1, 0.12, 0.06, 1], 'the glue coats a low side plate');
  assert.equal(low.diffuseColor[3], 1, 'the glue leaves alpha');
  const high = runGlsl(glue, vars(2.4, 0), stub, new Set());
  assert.deepEqual(high.diffuseColor, [0.1, 0.12, 0.06, 1], 'nothing on a high vertical face of a material without use-wear');
  const roof = runGlsl(glue, vars(2.4, 1), stub, new Set()), under = runGlsl(glue, vars(2.4, 1, -1), stub, new Set());
  assert.notDeepEqual(roof.diffuseColor, [0.1, 0.12, 0.06, 1], 'a roof takes the film');
  const downFacing = runGlsl(glue, vars(2.4, -1), stub, new Set());
  assert.deepEqual(under.diffuseColor, downFacing.diffuseColor, 'the back face of double-sided cloth turns the frame over');
  assert.ok(luma(under.diffuseColor) < luma(roof.diffuseColor), 'so it takes the underside\'s grime, not the roof\'s film');
  const backSide = runGlsl(singleSided, vars(2.4, 1, -1), stub, new Set());
  assert.notDeepEqual(backSide.diffuseColor, [0.1, 0.12, 0.06, 1], 'a single-sided material keeps its (vertex-flipped) frame');
  const none = runGlsl(glue, vars(0.3, 0, 1, [0, 0, 0, 0]), stub, new Set());
  assert.deepEqual(none.diffuseColor, [0.1, 0.12, 0.06, 1], 'a role of none skips the whole wear');
  assert.ok(FIELD_WEAR_FRAGMENT.indexOf('dFdx') < FIELD_WEAR_FRAGMENT.indexOf('if ( wearH < max( 1.75'),
    'screen derivatives are taken in uniform control flow, before the per-pixel skip');
  // a high vertical face at range, outside the soot's reach, skips the noise and the core entirely
  const skipped = runGlsl(glue, { ...vars(2.4, 0), uVehWearRole: [1, 1, 1, 1] }, { ...stub, dFdx: () => [0.05, 0, 0], dFdy: () => [0, 0.05, 0],
    cotWearNoise: () => { throw new Error('noise evaluated on a skipped pixel'); } }, new Set());
  assert.deepEqual(skipped.diffuseColor, [0.1, 0.12, 0.06, 1], 'a pixel no wear reaches skips the noise');
  assert.ok(FIELD_WEAR_VERTEX.includes('vec3 cotWearPos = transformed;') && FIELD_WEAR_VERTEX.includes('USE_INSTANCING')
    && FIELD_WEAR_VERTEX.includes('USE_BATCHING'), 'instances and batched parts each take their own pattern offset');
  assert.ok(/cotWearPos \*= cotWearScale/.test(FIELD_WEAR_VERTEX), 'the pattern is in metres, whatever a mesh\'s scale');
  // the runs' frame (the vertex stage's level basis, run through the subset): on a turned mesh, nothing changes straight
  // down a face and a step across it is that many metres on the level plane; the runs' 3D octave then hangs straight down
  // every face, flat or round (a 2D coordinate along a face's own tangent collapses to zero round a cylinder about its
  // origin, and a projection switch leaves seams)
  {
    const a = FIELD_WEAR_VERTEX.indexOf('vec3 cotWearV'), b = FIELD_WEAR_VERTEX.indexOf('cotWearWorld = modelMatrix');
    assert.ok(a > 0 && b > a, 'the vertex stage builds its runs\' basis');
    const basis = parseGlsl(`${FIELD_WEAR_VERTEX.slice(a, b)}\ncotWearOut = cotWearLevel;`);
    const levelAt = (up, p) => runGlsl(basis, { cotWearUp: up, cotWearPos: p, cotWearOut: [0, 0] }, stub, new Set()).cotWearOut;
    for (const [t, axis] of [[0.35, 'z'], [1.2, 'x'], [Math.PI / 2, 'z']]) {
      const up = axis === 'z' ? [Math.sin(t), Math.cos(t), 0] : [0, Math.cos(t), Math.sin(t)];
      const across = axis === 'z' ? [Math.cos(t), -Math.sin(t), 0] : [0, -Math.sin(t), Math.cos(t)];
      const p0 = [0.2, 0.4, 0.5], l0 = levelAt([up[0] * 2, up[1] * 2, up[2] * 2], p0);
      const down = levelAt(up, p0.map((v, k) => v - up[k] * 0.7));
      assert.ok(Math.hypot(down[0] - l0[0], down[1] - l0[1]) < 1e-9, `a turned mesh (${t} about ${axis}): no change straight down a face`);
      const side = levelAt(up, p0.map((v, k) => v + across[k] * 0.3));
      assert.ok(Math.abs(Math.hypot(side[0] - l0[0], side[1] - l0[1]) - 0.3) < 1e-9, 'and metres across it on the level plane');
    }
  }
  // the runs are off on the running gear (it turns under a pattern laid level with the ground) and on decks
  {
    const at = (role, run, up = 0, h = 0.6) => runGlsl(glue, { ...vars(h, up, 1, role), vCotWearSide: [9, run, -0.52, 1.6] }, stub, new Set()).diffuseColor;
    for (const role of [[0.9, 0, 2, 0.6], [0.9, 0, 4, 0.6], [0.75, 0, 5, 0.6]]) {
      assert.deepEqual(at(role, 0.1), at(role, 0.37), `no runs on the running gear (class ${role[2]})`);
    }
    let live = 0;
    for (let k = 0; k < 12; k++) if (luma(at([1, 1, 1, 1], k * 0.05, 0, 0.9)) !== luma(at([1, 1, 1, 1], 0, 0, 0.9))) live++;
    assert.ok(live > 6, 'the runs hang down a painted plate');
  }
  assert.ok(!/viewMatrix|cameraPosition|vViewPosition/.test(FIELD_WEAR_FRAGMENT), 'no matrix work per fragment: the frames come from the vertex stage');
  // varying budget: WebGL2 guarantees only fifteen vectors and three's lit material with four shadow cascades uses about
  // ten, so the wear packs its frames into three vec4
  const varyings = [...FIELD_WEAR_FRAGMENT_PARS.matchAll(/varying (float|vec2|vec3|vec4) /g)].map((m) => m[1]);
  assert.deepEqual(varyings.sort(), ['vec4', 'vec4', 'vec4'], `the wear's varyings stay packed (${varyings})`);
}

// ---------------------------------------------------------------- 3. plumbing
{
  const mat = (role, extra = {}) => { const m = new THREE.MeshStandardMaterial(extra); m.userData.appearanceRole = role; return m; };
  const role = (m) => vehicleFieldWearRole(m).toArray();
  assert.deepEqual(role(mat('armorPaint')), [1, 1, 1, 1]);
  assert.equal(role(mat('trackPad'))[2], 2, 'track shoes polish like track iron');
  assert.equal(role(mat('trackBand'))[2], 4, 'the scrolling band keeps the deep coat but no polish (it would stand still on a moving track)');
  assert.equal(role(mat('gunmetal'))[2], 3, 'bare steel wears bright where it is handled');
  assert.equal(role(mat('gearShadow'))[0] + role(mat('gearShadow'))[1], 0, 'the wheel-bay recess panels stay clean dark');
  assert.equal(role(mat('burnt'))[0], 0, 'wrecks keep their char');
  assert.equal(role(mat('canvas', { alphaTest: 0.4 }))[0], 0, 'alpha-cut cards (nets, leaves) take no coat');
  assert.ok(role(mat('tireRubber'))[0] >= 0.85 && role(mat('opticGlass'))[0] < 0.5, 'rubber takes the coat, glass sheds it');
  const decor = new THREE.MeshStandardMaterial(); decor.name = 'Decor_canvas';
  assert.deepEqual(role(decor), role(mat('canvas')), 'decor families read their own role');
  const named = new THREE.MeshStandardMaterial(); named.userData.cotWearRole = 'none';
  assert.equal(role(named)[0], 0, 'a builder can opt a material out');
  const U = VEHICLE_FIELD_WEAR_UNIFORMS;
  const u4 = (u) => u.value.toArray().map((v) => Number(v.toFixed(5)));
  const s4 = (c, a) => [...c, a].map((v) => Number(v.toFixed(5)));
  // a battle root and a Garage root (draws per frame: frame numbers advance as the render's counter would)
  const battleRoot = new THREE.Object3D(); battleRoot.userData.fieldWear = 1; battleRoot.updateMatrixWorld(true);
  const garageRoot = new THREE.Object3D(); garageRoot.userData.fieldWear = VEHICLE_FIELD_WEAR_GARAGE; garageRoot.updateMatrixWorld(true);
  let frameNo = 100;
  setCamoBiome('desert');
  setVehicleGroundFromRoot(battleRoot, mat('armorPaint'), ++frameNo);
  const desert = vehicleFieldSoil('desert');
  assert.deepEqual(u4(U.uVehWearSettle), s4(desert.settle, desert.settleAmount), 'setCamoBiome points battle builds at the map soil');
  setVehicleGroundFromRoot(garageRoot, mat('armorPaint'), frameNo);
  assert.notDeepEqual(u4(U.uVehWearSettle), s4(desert.settle, desert.settleAmount), 'the Garage keeps its neutral film');
  // the showroom's tyres stay dark: its packed coat (worn all round by the running gear) is a dark grime near the rubber
  const garageTyre = runGlsl(core, { ...BASE, wearH: 0.3, wearRole: [0.9, 0.5, 4, 0.6], wearStrength: VEHICLE_FIELD_WEAR_GARAGE,
    soilDeep: u4(U.uVehWearDeep), soilSplash: u4(U.uVehWearSplash), soilSettle: u4(U.uVehWearSettle),
    wearAlbedo: [0.0116, 0.0123, 0.0116], wearNear: 1, wearSootIn: false }, fns, new Set());
  assert.ok(luma(garageTyre.wearAlbedo) < 0.03, `the Garage film keeps the tyres dark (${luma(garageTyre.wearAlbedo).toFixed(4)})`);
  setVehicleGroundFromRoot(battleRoot, mat('armorPaint'), frameNo);
  setCamoBiome('verdant');
  setVehicleGroundFromRoot(battleRoot, mat('gearShadow'), frameNo);
  const farm = vehicleFieldSoil('verdant');
  assert.deepEqual(u4(U.uVehWearDeep), s4(farm.deep, farm.wet), 'a map switch rebinds the battle soil, even between two draws of one root');
  assert.deepEqual(u4(U.uVehWearRole), [0, 0, 0, 0], 'the drawn material sets the role');
  // the per-root strength rides the ground reference's w
  const root = new THREE.Object3D(); root.position.set(3, 1, -2); root.updateMatrixWorld(true);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  const before = { ...shader };
  vehicleAmbientFloorHook(shader);
  setVehicleGroundFromRoot(root, mat('armorPaint'), ++frameNo);
  assert.deepEqual(shader.uniforms.uVehGround.value.toArray(), [3, 1, -2, 1], 'a root without fieldWear wears it in full');
  root.userData.fieldWear = VEHICLE_FIELD_WEAR_GARAGE;
  setVehicleGroundFromRoot(root, mat('armorPaint'), frameNo);
  assert.equal(shader.uniforms.uVehGround.value.w, 1, 'a root is placed once per frame (the switch lands on the next frame)');
  setVehicleGroundFromRoot(root, mat('armorPaint'), ++frameNo);
  assert.equal(shader.uniforms.uVehGround.value.w, VEHICLE_FIELD_WEAR_GARAGE, 'the showroom strength reaches the shader');
  resetVehicleGround();
  assert.equal(shader.uniforms.uVehGround.value.w, 0, 'drawn without a vehicle root: no wear');
  setVehicleGroundFromRoot(root, mat('armorPaint'), frameNo);
  assert.equal(shader.uniforms.uVehGround.value.w, VEHICLE_FIELD_WEAR_GARAGE, 'a later draw of the same frame restores it after the reset');
  root.rotation.y = Math.PI / 2; root.updateMatrixWorld(true);
  setVehicleGroundFromRoot(root, mat('armorPaint'), -1);
  const fwd = shader.uniforms.uVehWearFwd.value;
  assert.ok(Math.abs(fwd.x - 1) < 1e-9 && Math.abs(fwd.z) < 1e-9, 'the forward axis follows the root (+Z turned to +X)');
  for (const name of ['uVehWearRole', 'uVehWearFwd', 'uVehWearHull', 'uVehWearPlanes', 'uVehWearSoot', 'uVehWearSootAxis', 'uVehWearDeep',
    'uVehWearSplash', 'uVehWearSettle']) {
    assert.equal(shader.uniforms[name], U[name], `${name} is the shared uniform object`);
  }
  assert.ok(shader.fragmentShader.includes(`#include <normal_fragment_maps>${FIELD_WEAR_FRAGMENT}`), 'the wear reads the surface after the normal maps');
  assert.ok(shader.vertexShader.includes(`#include <begin_vertex>${FIELD_WEAR_VERTEX}`), 'the pattern frame rides begin_vertex');
  assert.ok(shader.fragmentShader.indexOf(FIELD_WEAR_FRAGMENT) < shader.fragmentShader.indexOf('#include <lights_physical_fragment>'),
    'the paint takes the wear before any light reads it');
  assert.ok(!/#define COT_FIELD_WEAR|COT_FIELD_WEAR/.test(shader.fragmentShader + shader.vertexShader), 'no define: no program variant');
  assert.notEqual(before.fragmentShader, shader.fragmentShader);
  // a built vehicle's use-wear: its hull frame measured from its plates, its exhaust by family, its muzzle
  const paint = new THREE.MeshStandardMaterial(); paint.name = 'cot:armor-paint';
  const barrel = new THREE.MeshStandardMaterial(); barrel.name = 'cot:barrel-paint';
  // (the gun draws with its own tube paint and brake steel; the hull's grille steel is its own; one steel both share)
  const brakeSteel = mat('gunmetal'), grilleSteel = mat('gunmetal'), sharedSteel = mat('gunmetal');
  let brake = null, grille = null, sharedOnGun = null;
  const tank = (id) => {
    const r = new THREE.Group();
    const hullBox = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 6.8), paint); hullBox.position.set(0, 0.95, 0.1); r.add(hullBox);
    const turret = new THREE.Group(); turret.name = 'rig_turret'; turret.position.set(0, 1.5, 0.6); r.add(turret);
    turret.add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 2.6), paint));
    const gunG = new THREE.Group(); gunG.name = 'rig_gun'; gunG.position.set(0, 0.2, 1.3); turret.add(gunG);
    gunG.add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 3.6), barrel));
    brake = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.3), brakeSteel); gunG.add(brake);
    sharedOnGun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), sharedSteel); gunG.add(sharedOnGun);
    grille = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 1), grilleSteel); r.add(grille);
    r.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), sharedSteel));
    const muzzle = new THREE.Object3D(); muzzle.name = 'rig_muzzle'; muzzle.position.set(0, 0.2, 5.0); turret.add(muzzle);
    r.updateMatrixWorld(true);
    installVehicleFieldWear(r, id);
    return r;
  };
  const leo = tank('leo2a6'), t72 = tank('t72b3m');
  setVehicleGroundFromRoot(leo, paint, ++frameNo);
  const hull = U.uVehWearHull.value;
  assert.ok(Math.abs(hull.x - -3.3) < 0.06 && Math.abs(hull.y - 3.5) < 0.06 && Math.abs(hull.z - 1.5) < 0.06 && Math.abs(hull.w - 1.7) < 0.06,
    `the hull frame is measured from the plates outside the turret (${hull.toArray().map((v) => v.toFixed(2))})`);
  const rearSoot = U.uVehWearSoot.value.clone(), rearAxis = U.uVehWearSootAxis.value.clone();
  assert.ok(rearSoot.w > 0.5 && Math.abs(rearSoot.x) < 1e-6 && rearSoot.z < -2.5 && rearAxis.z < -0.9, 'a rear exhaust fans over the deck and the rear plate');
  setVehicleGroundFromRoot(t72, paint, frameNo);
  assert.ok(U.uVehWearSoot.value.x > 1 && U.uVehWearSootAxis.value.x > 0.4, 'the T-72 lineage soots its left flank');
  setVehicleGroundFromRoot(leo, barrel, frameNo);
  const muzzleAt = U.uVehWearSoot.value;
  assert.ok(Math.abs(muzzleAt.z - 5.72) < 1e-6 && Math.abs(muzzleAt.y - 1.7) < 1e-6 && U.uVehWearSootAxis.value.z < -0.99,
    'the gun reads the muzzle, sooting back along the tube');
  // by the drawn material (three uploads a material's uniforms only when the material changes between draws, so a value
  // chosen per object would go stale inside a run of draws that share one): the materials only the gun draws with read
  // the muzzle, the rest the exhaust; one steel shared by the gun and the hull reads the exhaust
  setVehicleGroundFromRoot(leo, brake.material, frameNo);
  assert.ok(Math.abs(U.uVehWearSoot.value.z - 5.72) < 1e-6, 'a muzzle brake\'s own steel reads the muzzle');
  setVehicleGroundFromRoot(leo, grille.material, frameNo);
  assert.ok(U.uVehWearSoot.value.z < -2.5, 'an engine grille\'s bare steel reads the exhaust');
  setVehicleGroundFromRoot(leo, sharedOnGun.material, frameNo);
  assert.ok(U.uVehWearSoot.value.z < -2.5, 'a steel the hull shares with the gun reads the exhaust, whichever object draws');
  const hookSrc = readFileSync(new URL('./tankFactoryCore.ts', import.meta.url), 'utf8');
  assert.ok(/setVehicleGroundFromRoot\(root, args\[4\], args\[0\]\?\.info\?\.render\?\.frame \?\? -1\);/.test(hookSrc),
    'the per-draw hook passes only the root, the drawn material and the frame: nothing per object');
  // the planes things stand on, each to a millimetre (its bin's area-weighted mean): a hull 2.6 m wide with its deck at
  // 1.5 m, fenders 0.5 m out with their tops at 1.05 m, a turret roof at 1.9 m; a plain box hull's fenders are its deck
  const fendered = (() => {
    const r = new THREE.Group();
    const hullBox = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 6.8), paint); hullBox.position.set(0, 0.95, 0.1); r.add(hullBox);
    for (const side of [-1, 1]) {
      const fender = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 6.4), paint); fender.position.set(side * 1.55, 1.03, 0.1); r.add(fender);
    }
    const turret = new THREE.Group(); turret.name = 'rig_turret'; turret.position.set(0, 1.5, 0.6); r.add(turret);
    const shell = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 2.6), paint); shell.position.y = 0.2; turret.add(shell);
    r.updateMatrixWorld(true);
    installVehicleFieldWear(r, 'leo2a6');
    return r;
  })();
  setVehicleGroundFromRoot(fendered, paint, ++frameNo);
  const planes = U.uVehWearPlanes.value;
  assert.ok(Math.abs(U.uVehWearHull.value.z - 1.5) < 0.002 && Math.abs(planes.x - 1.05) < 0.002 && Math.abs(planes.y - 1.9) < 0.002
    && Math.abs(planes.z - 1.5) < 0.002 && Math.abs(U.uVehWearHull.value.w - 1.8) < 0.002,
    `deck, fenders, roof and the turret's foot measured to a millimetre (${U.uVehWearHull.value.z.toFixed(3)}, ${planes.x.toFixed(3)}, `
    + `${planes.y.toFixed(3)}, ${planes.z.toFixed(3)})`);
  setVehicleGroundFromRoot(leo, paint, frameNo);
  assert.ok(Math.abs(U.uVehWearPlanes.value.x - 1.5) < 0.002 && Math.abs(U.uVehWearPlanes.value.y - 1.9) < 0.002,
    'a box hull without fenders: the fender plane is its deck; each root binds its own planes');
  setVehicleGroundFromRoot(new THREE.Object3D(), paint, frameNo);
  assert.equal(U.uVehWearSoot.value.w, 0, 'a root without use-wear binds no soot');
  assert.equal(U.uVehWearHull.value.z, 0, 'nor a hull frame');
  assert.equal(U.uVehWearPlanes.value.y, 0, 'nor planes');
}

console.log(`vehicleFieldWear.selftest: ${MAP_IDS.length} battlefields' soils follow their terrain; the coat, film, polish, `
  + 'chips, walkways, runs and soot grade, settle, stay soft, never light a dark surface past the cap and band-limit through '
  + 'the shader text; recess grime, worn edges and varied specular read at 40 m and in the Garage, with no stripe where a '
  + 'plate only runs past a plane; roles, soils, frames, planes, soot sources (per material) and strength bind per draw '
  + 'with no program variant');
