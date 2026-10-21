// structureAureole.selftest — 2026-10-17 (the SKY lane, 227 SKY-03; owner 10-09 "shadows are still really badd on maps like
// whiteout"; the 226 judging: Whiteout's buildings and props "float on a thin dark line"). The aureole's soft shadow: the
// directions over the disc round the sun (the sun's convention, the elevation floor), the swept footprint's raster against
// a box's analytic shadow (dark at the foot on the far side, nothing on the sun's side, a penumbra that widens along the
// shadow, a fading tip), one count a direction however many solids shade a texel, a region re-bake equal to the full bake,
// a thin mast's faint smear, the covered texels; the light model's share (a thin closed deck only, by day); the handle's
// lifecycle on the main thread (the bake lands, a capture waits for it, the sun moving re-bakes); and the pass's wiring.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { SGO_HALF_M, SGO_TEXEL_M, packOccluders } from './structureGroundOcclusionBake.ts';
import {
  AUREOLE_MIN_ELEVATION_DEG, AUREOLE_RADIUS_DEG, AUREOLE_REACH_M, AUREOLE_SAMPLES, aureoleOffsets, aureoleSunOf, bakeStructureAureole,
} from './structureAureoleBake.ts';
import {
  AUREOLE_GATE_M, AUREOLE_SHARE_MAX, DECK_AUREOLE_GAIN, SGO_DARK_MAX, SGO_DECK_BROAD, STRUCTURE_GROUND_OCCLUSION_GLSL,
  createStructureGroundOcclusion, createStructureGroundUniforms, updateStructureGroundUniforms,
} from './structureGroundOcclusion.ts';
import { sunDirectionOf, skyPresetToAtmosphere } from './atmosphere.ts';
import { loadGroundedLightModel, resolveLightModel } from './lightModelCore.ts';
import { DECK_AUREOLE_G, DECK_AUREOLE_MAX } from './lightModel.ts';
import { DEFAULT_SKY_PRESET } from './sky.ts';
import { getMapConfig } from '../world/maps/index.ts';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const DEG = Math.PI / 180;

// ---- 1. the directions
for (const [el, az] of [[13, 164], [33, 115], [60, 0], [5, 270]]) {
  const a = aureoleSunOf(el, az), b = sunDirectionOf(el, az);
  for (let i = 0; i < 3; i++) near(a[i], b[i], 1e-9, `the sun's convention at ${el}°/${az}°`);
}
const sunX = [Math.cos(13 * DEG), Math.sin(13 * DEG), 0];
const off = aureoleOffsets(sunX);
assert.equal(off.length, 2 * AUREOLE_SAMPLES);
let mx = 0;
for (let k = 0; k < AUREOLE_SAMPLES; k++) {
  const ox = off[2 * k], oz = off[2 * k + 1];
  // every direction points away from the sun, none flatter than the floor
  assert.ok(ox < 0, 'the shadow falls away from the sun');
  assert.ok(Math.hypot(ox, oz) <= 1 / Math.tan(AUREOLE_MIN_ELEVATION_DEG * DEG) + 1e-9, 'no direction under the floor');
  mx += ox / AUREOLE_SAMPLES;
}
// the disc's directions spread round the sun's own shadow length (cot 13° = 4.33 per metre of height)
near(off[0], -1 / Math.tan(13 * DEG), 0.6, 'the innermost direction near the sun');
assert.ok(mx < -3.5 && mx > -8, `the mean shadow length per metre (${mx.toFixed(2)})`);
const point = aureoleOffsets(sunX, 0);
for (let k = 0; k < AUREOLE_SAMPLES; k++) near(point[2 * k], -1 / Math.tan(13 * DEG), 1e-9, 'a zero radius is the sun alone');

// ---- 2. a 4 × 4 × 3 m box, the sun from +x at 13°
const box = (cx, cz, hw, hl, h) => ({ min: [cx - hw, 0, cz - hl], max: [cx + hw, h, cz + hl], shape2: { kind: 'obb', cx, cz, hw, hl, yaw: 0 } });
const rect = [992, 992, 1056, 1056];
const sampler = (r) => (x, z) => {
  const i = Math.floor((x + SGO_HALF_M) / SGO_TEXEL_M) - r.rect[0], j = Math.floor((z + SGO_HALF_M) / SGO_TEXEL_M) - r.rect[1];
  const q = (j * (r.rect[2] - r.rect[0]) + i) * 2;
  return { v: (r.rg[q] >> 1) / 127, covered: (r.rg[q] & 1) === 1, base: r.rg[q + 1] };
};
const one = bakeStructureAureole(packOccluders([box(0, 0, 2, 2, 3)]), sunX, rect);
const at = sampler(one);
for (const x of [-2.25, -4, -8]) near(at(x, 0).v, 1, 0.02, `the far side's shadow at ${x} m, on the axis`);
for (const x of [2.25, 3, 5]) assert.equal(at(x, 0).v, 0, `nothing on the sun's side (${x} m)`);
// the penumbra widens along the shadow: the shade a metre past the box's side, near and far
assert.ok(at(-3, 3).v < at(-9, 3).v, `wider further out (${at(-3, 3).v.toFixed(2)} → ${at(-9, 3).v.toFixed(2)})`);
assert.ok(at(-9, 3).v > 0.05 && at(-9, 3).v < 0.95, 'a soft edge, neither lit nor full');
// the tip: 3 m at 13° casts 13 m, the disc's elevations spread it (the floor's directions furthest)
assert.ok(at(-11, 0).v < 1 && at(-11, 0).v > 0.5, `the tip softens (${at(-11, 0).v.toFixed(2)})`);
assert.equal(at(-30, 0).v, 0, 'and ends');
// the covered texels: their open neighbours' mean, so the sunlit foot never takes the inside's shade
assert.ok(at(1.75, 0).covered && at(1.75, 0).v === 0, 'the sun side\'s wall line stays lit');
assert.ok(at(-1.75, 0).covered && at(-1.75, 0).v > 0.9, 'the far side\'s wall line is the shadow\'s');

// ---- 3. one count a direction: two solids over one shadow shade it no more than one
const two = bakeStructureAureole(packOccluders([box(0, 0, 2, 2, 3), box(-0.5, 0, 1, 1, 2.5)]), sunX, rect);
const at2 = sampler(two);
for (const [x, z] of [[-4, 0], [-8, 0.5], [-6, 1.5]]) near(at2(x, z).v, at(x, z).v, 0.02, `the union, not the sum, at ${x}, ${z}`);

// ---- 4. a region re-bake equals the full bake there
const sub = [1010, 1012, 1030, 1028];
const part = bakeStructureAureole(packOccluders([box(0, 0, 2, 2, 3)]), sunX, sub);
const atS = sampler(part);
for (const [x, z] of [[-4, 0], [-6.5, 1.5], [-6, -3], [-1.75, 0]]) {
  assert.deepEqual(atS(x, z), at(x, z), `the region bake at ${x}, ${z}`);
}

// ---- 5. a thin mast: its shadow smears to a faint stripe a few metres off its foot
const mast = bakeStructureAureole(packOccluders([box(0, 0, 0.15, 0.15, 12)]), sunX, [900, 1000, 1030, 1048]);
const atM = sampler(mast);
assert.ok(atM(-10, 0).v < 0.3, `a mast's shadow 10 m out stays faint (${atM(-10, 0).v.toFixed(2)})`);
// the reach: nothing past it
assert.equal(atM(-AUREOLE_REACH_M - 4, 0).v, 0, 'nothing past the reach');

// ---- 6. the light model's share: a thin closed deck, by day
await loadGroundedLightModel();
const irr = [0.11, 0.125, 0.16];
const model = (sky) => resolveLightModel(sky, skyPresetToAtmosphere(sky), { irradianceRaw: irr }, null, true);
const whiteout = getMapConfig('whiteout');
const wSky = { ...DEFAULT_SKY_PRESET, ...whiteout.sky, cloudscape: whiteout.clouds };
const wm = model(wSky);
assert.equal(wm.deckClosure, 1, 'Whiteout\'s deck is closed');
assert.ok(wm.deckAureole > 0.08 && wm.deckAureole < 0.4, `Whiteout's aureole (${wm.deckAureole.toFixed(3)} of the hemisphere's light)`);
assert.ok(wm.deckAureole <= DECK_AUREOLE_MAX);
assert.equal(model({ ...wSky, cloudscape: { ...whiteout.clouds, deckBeam: 0 } }).deckAureole, 0, 'a thick deck diffuses it all');
const thinner = model({ ...wSky, cloudscape: { ...whiteout.clouds, deckBeam: 0.1 } }).deckAureole;
assert.ok(thinner > 0 && thinner < wm.deckAureole, 'a denser deck keeps less of it round the sun');
near(Math.pow(0.25, 1 - DECK_AUREOLE_G), 0.812, 0.002, 'Whiteout\'s quarter keeps 0.81 of the deck\'s sunlight round the sun');
for (const id of ['winter', 'verdant', 'urban']) {
  const m = getMapConfig(id);
  const sky = { ...DEFAULT_SKY_PRESET, ...m.sky, cloudscape: m.clouds };
  assert.equal(model(sky).deckAureole, 0, `${id}: no aureole (a deck with gaps casts its clear sun, an open sky none)`);
}

// ---- 7. the handle on the main thread: the bake lands, a capture waits for it, the sun moving re-bakes
const group = new THREE.Group();
new THREE.Scene().add(group);
const records = [box(0, 0, 2, 2, 3)];
const handle = createStructureGroundOcclusion(records, { group, makeWorker: null, aureoleSun: sunX });
assert.equal(handle.aureoleTexture, null, 'nothing before the bake lands');
assert.equal(await handle.whenReady(), true);
assert.ok(handle.aureoleTexture instanceof THREE.DataTexture, 'the aureole raster after the capture\'s wait');
handle.setInstant(true);
handle.update(0.016);
assert.equal(handle.aureoleStrength, 1, 'at full strength in shot mode');
assert.equal(handle.stats.aureoleBakes, 1);
handle.requestAureole(sunX.map((v) => v * 2));
assert.equal(handle.stats.aureoleBakes, 1, 'the same sun asks for nothing');
handle.requestAureole(aureoleSunOf(13, 300));
await handle.whenReady();
assert.equal(handle.stats.aureoleBakes, 2, 'a sun moved re-bakes');
// the pass's uniforms: the light model's share, scaled by the lever, on the rig's sky pole
const scene = new THREE.Scene();
scene.add(group);
scene.userData.structureGroundOcclusion = handle;
scene.userData.lightModel = { deckAureole: 0.2, mode: 'physical', overcast: 1, deckClosure: 1 };
const u = { ...createStructureGroundUniforms(), uSunDir: { value: new THREE.Vector3(...aureoleSunOf(13, 300)) },
  uContactAmb: { value: new THREE.Vector4(0.4, 0.3, 0.1, 0) }, uContactFillDir: { value: new THREE.Vector3(0, 1, 0) } };
const renderer = { copyTextureToTexture() {} };
updateStructureGroundUniforms(u, scene, renderer, true);
const share = Math.min(AUREOLE_SHARE_MAX, 0.2 * DECK_AUREOLE_GAIN);
near(u.uAur.value.x, share * 0.4, 1e-9, 'the aureole\'s light on up-facing ground (its gain, its cap)');
near(u.uAur.value.y, share * 0.4 / 0.5, 1e-9, 'its share of that ground\'s ambient');
near(u.uSgoBroad.value, SGO_DECK_BROAD, 1e-9, 'the occlusion broadened under a closed deck');
assert.equal(u.tAur.value, handle.aureoleTexture);
updateStructureGroundUniforms(u, scene, renderer, false);
assert.equal(u.uAur.value.x, 0, 'off with the contact-shadow lever');
scene.userData.lightModel = { deckAureole: 0, mode: 'physical', overcast: 1, deckClosure: 0 };
updateStructureGroundUniforms(u, scene, renderer, true);
assert.equal(u.uAur.value.x, 0, 'off without a thin deck');
assert.equal(u.uSgoBroad.value, 1, 'the uniform sky\'s law under a deck with gaps');
handle.dispose();

// ---- 8. the wiring
assert.match(STRUCTURE_GROUND_OCCLUSION_GLSL, /uniform vec2 uAur;\s*uniform sampler2D tAur;/);
// every function the block calls is defined in it or in the blocks before it (v4's black frames: a dropped definition)
for (const fn of STRUCTURE_GROUND_OCCLUSION_GLSL.matchAll(/\b(cot[A-Za-z]+)\(/g)) {
  const name = fn[1];
  const own = new RegExp(`(float|vec3|bool|vec2|void) ${name}\\(`).test(STRUCTURE_GROUND_OCCLUSION_GLSL);
  assert.ok(own || ['cotSunVisOf', 'cotNormalAt'].includes(name), `${name} is defined`);
}
assert.match(STRUCTURE_GROUND_OCCLUSION_GLSL, /aurDark = uAur\.x \* aur \* aGate \/ max\( T \+ A, 1e-4 \);/, 'the hidden aureole over all the pixel\'s light');
assert.match(STRUCTURE_GROUND_OCCLUSION_GLSL, new RegExp(`cotAurGate\\( texelFetch\\( tAur, ti, 0 \\)\\.rg, P\\.y, ${AUREOLE_GATE_M.toFixed(5)}`), 'its receivers near the shading solid\'s base');
assert.match(STRUCTURE_GROUND_OCCLUSION_GLSL, new RegExp(`return 1\\.0 - min\\( uSgo \\* occ .*, ${SGO_DARK_MAX.toFixed(5)} \\);`), 'never deeper than the cap: shade, not a hole');
assert.match(STRUCTURE_GROUND_OCCLUSION_GLSL, /occ = 1\.0 - pow\( 1\.0 - min\( occ, 1\.0 \), uSgoBroad \);/, 'the broadened occlusion');
const worker = read('./structureGroundOcclusionWorker.ts');
assert.match(worker, /if \(data\.kind === 'aureole' && data\.sun\) \{\s*const aureole = bakeStructureAureole\(data\.packed, data\.sun, data\.rect, data\.radius\);/, 'baked off the main thread');
const map = read('../world/map.ts');
assert.match(map, /aureoleSunOf\(mapSky\.sunElevationDeg, mapSky\.sunAzimuthDeg\)/, 'a thin deck\'s map starts the bake with its own sun');
const runtime = read('./structureGroundOcclusion.ts');
assert.match(runtime, /lightTune\('DECK_AUREOLE', DECK_AUREOLE_GAIN\)/, 'the live gain');
assert.ok(AUREOLE_RADIUS_DEG >= 4 && AUREOLE_RADIUS_DEG <= 12, 'a disc of a few degrees');

console.log(`structureAureole.selftest: ${AUREOLE_SAMPLES} directions over ${AUREOLE_RADIUS_DEG}° round the sun, a box's soft shadow (foot, penumbra, tip), the union, a region re-bake, a mast's smear, Whiteout's share (${wm.deckAureole.toFixed(3)}), the handle's lifecycle and the pass's wiring PASS`);
