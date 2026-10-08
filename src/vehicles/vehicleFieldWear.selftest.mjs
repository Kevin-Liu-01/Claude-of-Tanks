// Receipt for the round 5 field wear (vehicleFieldWear.ts; 2026-10-08, tank-accessories lane):
// 1. every battlefield's soil follows its terrain: the table's dirt and ground colours are recomputed here from the photo
//    sets, sourcedTextures.ts's plan and the map configs, composed and measured as the terrain composes and measures
//    them (sourcedTextureComposer.ts composeAlbedoPixels; terrain.ts measureLayerMean: the linear mean per channel), and
//    each map's climate is its groundRedux.ts class;
// 2. the shader text runs through the receipts' GLSL subset (src/world/glslSubset.test-support.mjs): the glue in full,
//    the core's laws (graded up from the ground contact, film only on faces that look up, the far octaves settle to their
//    mean, the desert's dust lighter than a tan paint, the farmland's coat darker and wetter, nothing at strength 0);
// 3. the plumbing: per-draw roles and soils, setCamoBiome → the battle soil, the floor hook's uniforms and injections with
//    no define (no program variant) and the per-root strength through setVehicleGroundFromRoot.
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
  FIELD_WEAR_NOISE_GLSL, FIELD_WEAR_VERTEX, bindVehicleFieldWear, vehicleFieldSoil, vehicleFieldWearRole,
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
  // the derived soils keep the critics' reads: farmland darker and wet low, desert dust lighter than a tan paint with a
  // darker grime under it, winter snow on the decks
  const farm = vehicleFieldSoil('verdant'), desert = vehicleFieldSoil('desert'), winter = vehicleFieldSoil('winter');
  const tanPaint = [0.40, 0.33, 0.22];
  assert.ok(farm.wet >= 0.6 && luma(farm.deep) < luma(farm.splash) && luma(farm.splash) < luma(farm.settle), 'farmland: wet deep, drier up, dust on the decks');
  assert.ok(luma(farm.deep) >= 0.03 && luma(farm.deep) < 0.08, 'farmland coat is dark wet earth, not a black void and not cream');
  assert.ok(luma(desert.settle) > luma(tanPaint) * 1.15 && luma(desert.deep) < luma(desert.splash) * 0.75, 'desert dust is lighter than tan paint over a darker grime');
  assert.ok(desert.wet <= 0.2, 'desert dust is dry');
  assert.ok(luma(winter.settle) > 0.6 && luma(winter.splash) < 0.15, 'winter: snow on the decks, dark slush thrown up');
  assert.equal(vehicleFieldSoil('no-such-map'), vehicleFieldSoil('verdant'), 'an unknown map reads as Verdant');
}

// ---------------------------------------------------------------- 2. the shader text through the GLSL subset
const fnTree = (name) => {
  const text = FIELD_WEAR_NOISE_GLSL; const at = text.indexOf(`${name}(`); const open = text.indexOf('{', at);
  let depth = 1, k = open + 1; for (; depth; k++) { if (text[k] === '{') depth++; else if (text[k] === '}') depth--; }
  return parseGlsl(text.slice(open + 1, k - 1));
};
const hashT = fnTree('cotWearHash'), noiseT = fnTree('cotWearNoise');
const fns = {};
fns.cotWearHash = (p) => runGlslFunction(hashT, { p }, fns, new Set());
fns.cotWearNoise = (x) => runGlslFunction(noiseT, { x }, fns, new Set());
for (let i = 0; i < 64; i++) {
  const v = fns.cotWearNoise([i * 0.731 - 9, i * 1.37 + 2]);
  assert.ok(v >= 0 && v <= 1, 'the value noise stays in 0..1');
}
const core = parseGlsl(FIELD_WEAR_CORE_GLSL);
const soilVec = (s) => ({ soilDeep: [...s.deep, s.wet], soilSplash: [...s.splash, s.spatter], soilSettle: [...s.settle, s.settleAmount] });
const run = (over) => runGlsl(core, {
  wearH: 0.3, wearUp: 0, wearBack: 0, wearFoot: 0.004, wearN1: 0.5, wearN2: 0.5, wearStrength: 1, wearRole: [1, 1, 0, 0],
  ...soilVec(vehicleFieldSoil('verdant')), wearAlbedo: [0.1, 0.12, 0.06], wearRough: 0.7, ...over,
}, fns, new Set());
// strength 0 and a role of none change nothing
for (const over of [{ wearStrength: 0 }, { wearRole: [0, 0, 0, 0] }]) {
  const o = run({ ...over, wearUp: 1, wearH: 0.2 });
  assert.deepEqual(o.wearAlbedo, [0.1, 0.12, 0.06]); assert.equal(o.wearRough, 0.7);
}
// graded up from the ground contact, averaged over the noise: heavy low, gone by the turret's sides
const coatAt = (h, up = 0, soil = 'verdant', albedo = [0.1, 0.12, 0.06], back = 0) => {
  let shift = 0, n = 0;
  for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
    const o = run({ wearH: h, wearUp: up, wearBack: back, wearN1: i / 8, wearN2: j / 8, ...soilVec(vehicleFieldSoil(soil)), wearAlbedo: albedo });
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
// the far octaves settle to their mean: at a battle footprint the noise inputs change nothing (no sparkle)
{
  const a = run({ wearFoot: 0.2, wearN1: 0, wearN2: 0, wearH: 0.6, wearUp: 0.5 });
  const b = run({ wearFoot: 0.2, wearN1: 1, wearN2: 1, wearH: 0.6, wearUp: 0.5 });
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(a.wearAlbedo[k] - b.wearAlbedo[k]) < 1e-9, 'band-limited at range');
}
// farmland darkens a light green low and leaves it wet; the desert's film lightens a tan paint on the decks
{
  const light = [0.12, 0.16, 0.07];
  const o = run({ wearH: 0.15, wearN1: 0.5, wearN2: 0.5, wearAlbedo: light });
  assert.ok(luma(o.wearAlbedo) < luma(light) && o.wearAlbedo[0] / o.wearAlbedo[1] > light[0] / light[1], 'farmland: dark brown earth low');
  assert.ok(o.wearRough < 0.62, 'farmland earth is wet low on the hull');
  const tan = [0.40, 0.33, 0.22];
  const d = runGlsl(core, { wearH: 1.0, wearUp: 1, wearBack: 0, wearFoot: 0.004, wearN1: 0.6, wearN2: 0.6, wearStrength: 1, wearRole: [1, 1, 0, 0],
    ...soilVec(vehicleFieldSoil('desert')), wearAlbedo: tan, wearRough: 0.7 }, fns, new Set());
  assert.ok(luma(d.wearAlbedo) > luma(tan) * 1.05 && d.wearRough > 0.75, 'desert: a paler, matte dust film on a tan deck');
}
// the glue runs whole: matrices stand in as scalars (the subset has none), the screen derivatives as fixed steps
{
  const glue = parseGlsl(FIELD_WEAR_FRAGMENT);
  const stub = {
    ...fns,
    dFdx: (v) => [0.002, 0, 0.0005].slice(0, v.length), dFdy: (v) => [0, 0.002, 0].slice(0, v.length),
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  };
  const vars = (h, up, face = 1) => ({
    uVehGround: [0, 0, 0, 1], uVehWearRole: [1, 1, 0, 0],
    ...Object.fromEntries(Object.entries(soilVec(vehicleFieldSoil('verdant'))).map(([k, v]) => [`uVehWear${k.slice(4)}`, v])),
    vCotWearFrame: [h, up, 0], faceDirection: face, vCotWearPos: [1.7, h, 0.4],
    diffuseColor: [0.1, 0.12, 0.06, 1], roughnessFactor: 0.7,
  });
  const low = runGlsl(glue, vars(0.3, 0), stub, new Set());
  assert.notDeepEqual(low.diffuseColor, [0.1, 0.12, 0.06, 1], 'the glue coats a low side plate');
  assert.equal(low.diffuseColor[3], 1, 'the glue leaves alpha');
  const high = runGlsl(glue, vars(2.4, 0), stub, new Set());
  assert.deepEqual(high.diffuseColor, [0.1, 0.12, 0.06, 1], 'a high vertical face is skipped');
  const roof = runGlsl(glue, vars(2.4, 1), stub, new Set()), under = runGlsl(glue, vars(2.4, 1, -1), stub, new Set());
  assert.notDeepEqual(roof.diffuseColor, [0.1, 0.12, 0.06, 1], 'a roof takes the film');
  assert.deepEqual(under.diffuseColor, [0.1, 0.12, 0.06, 1], 'the back face of double-sided cloth turns the frame over');
  assert.ok(FIELD_WEAR_FRAGMENT.indexOf('dFdx') < FIELD_WEAR_FRAGMENT.indexOf('if ( wearH <'),
    'screen derivatives are taken in uniform control flow, before the per-pixel skip');
  assert.ok(FIELD_WEAR_VERTEX.includes('vCotWearPos = transformed;') && FIELD_WEAR_VERTEX.includes('USE_INSTANCING')
    && FIELD_WEAR_VERTEX.includes('USE_BATCHING'), 'instances and batched parts each take their own pattern offset');
  assert.ok(!/viewMatrix|cameraPosition|vViewPosition/.test(FIELD_WEAR_FRAGMENT), 'no matrix work per fragment: the frame comes from the vertex stage');
}

// ---------------------------------------------------------------- 3. plumbing
{
  const mat = (role, extra = {}) => { const m = new THREE.MeshStandardMaterial(extra); m.userData.appearanceRole = role; return m; };
  const role = (m) => vehicleFieldWearRole(m).toArray();
  assert.deepEqual(role(mat('armorPaint')), [1, 1, 0, 0]);
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
  setCamoBiome('desert');
  bindVehicleFieldWear(false, mat('armorPaint'));
  const desert = vehicleFieldSoil('desert');
  assert.deepEqual(u4(U.uVehWearSettle), s4(desert.settle, desert.settleAmount), 'setCamoBiome points battle builds at the map soil');
  bindVehicleFieldWear(true, mat('armorPaint'));
  assert.notDeepEqual(u4(U.uVehWearSettle), s4(desert.settle, desert.settleAmount), 'the Garage keeps its neutral film');
  setCamoBiome('verdant');
  bindVehicleFieldWear(false, mat('gearShadow'));
  const farm = vehicleFieldSoil('verdant');
  assert.deepEqual(u4(U.uVehWearDeep), s4(farm.deep, farm.wet), 'a map switch rebinds the battle soil');
  assert.deepEqual(u4(U.uVehWearRole), [0, 0, 0, 0], 'the drawn material sets the role');
  // the per-root strength rides the ground reference's w
  const root = new THREE.Object3D(); root.position.set(3, 1, -2); root.updateMatrixWorld(true);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  const before = { ...shader };
  vehicleAmbientFloorHook(shader);
  setVehicleGroundFromRoot(root, mat('armorPaint'));
  assert.deepEqual(shader.uniforms.uVehGround.value.toArray(), [3, 1, -2, 1], 'a root without fieldWear wears it in full');
  root.userData.fieldWear = VEHICLE_FIELD_WEAR_GARAGE;
  setVehicleGroundFromRoot(root, mat('armorPaint'));
  assert.equal(shader.uniforms.uVehGround.value.w, VEHICLE_FIELD_WEAR_GARAGE, 'the showroom strength reaches the shader');
  resetVehicleGround();
  assert.equal(shader.uniforms.uVehGround.value.w, 0, 'drawn without a vehicle root: no wear');
  root.rotation.y = Math.PI / 2; root.updateMatrixWorld(true);
  setVehicleGroundFromRoot(root, mat('armorPaint'));
  const fwd = shader.uniforms.uVehWearFwd.value;
  assert.ok(Math.abs(fwd.x - 1) < 1e-9 && Math.abs(fwd.z) < 1e-9, 'the forward axis follows the root (+Z turned to +X)');
  for (const name of ['uVehWearRole', 'uVehWearFwd', 'uVehWearDeep', 'uVehWearSplash', 'uVehWearSettle']) {
    assert.equal(shader.uniforms[name], U[name], `${name} is the shared uniform object`);
  }
  assert.ok(shader.fragmentShader.includes(`#include <normal_fragment_maps>${FIELD_WEAR_FRAGMENT}`), 'the wear reads the surface after the normal maps');
  assert.ok(shader.vertexShader.includes(`#include <begin_vertex>${FIELD_WEAR_VERTEX}`), 'the pattern frame rides begin_vertex');
  assert.ok(shader.fragmentShader.indexOf(FIELD_WEAR_FRAGMENT) < shader.fragmentShader.indexOf('#include <lights_physical_fragment>'),
    'the paint takes the wear before any light reads it');
  assert.ok(!/#define COT_FIELD_WEAR|COT_FIELD_WEAR/.test(shader.fragmentShader + shader.vertexShader), 'no define: no program variant');
  assert.notEqual(before.fragmentShader, shader.fragmentShader);
}

console.log(`vehicleFieldWear.selftest: ${MAP_IDS.length} battlefields' soils follow their terrain; the coat, film and spatter `
  + 'grade, settle and band-limit through the shader text; roles, soils and strength bind per draw with no program variant');
