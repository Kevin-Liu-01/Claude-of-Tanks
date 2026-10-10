// structureGroundOcclusion.selftest — 2026-10-09 (the shadows lane): the ground's sky beside the world's solids. The law
// (Lambert's polygon formula over each prism's faces turned to the receiver) against the closed form of an infinite wall
// and a Monte Carlo of the cosine-weighted sky over a box and an overhanging deck; the raster's encoding (occlusion, the
// base modulo its wrap, a covered texel taking its open neighbours' value, a region re-bake equal to the full bake there);
// a real map's bake from its collision manifest (bounded, the trees out); the pass's block and its wiring (the aerial pass,
// the contact-shadow lever, the world's handle, the capture staging's wait); and the thin-deck beam (cloudscapes.ts
// deckBeam) through the light model and the cloud shade map.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SGO_BASE_WRAP_M, SGO_HALF_M, SGO_REACH_H, SGO_REACH_MAX_M, SGO_SIZE, SGO_TEXEL_M, bakeStructureGroundOcclusion, packOccluders,
  prismSkyOcclusion, sgoRectOf, shapeFootprint,
} from './structureGroundOcclusionBake.ts';
import { STRUCTURE_GROUND_OCCLUSION_GLSL, SGO_GATE_M, SGO_RETURN } from './structureGroundOcclusion.ts';
import { loadGroundedLightModel, resolveDeckBeam, resolveLightModel, luminance } from './lightModelCore.ts';
import { deriveSun, OVERCAST_DIRECT_CUT } from './lightModel.ts';
import { skyPresetToAtmosphere } from './atmosphere.ts';
import { DEFAULT_SKY_PRESET } from './sky.ts';
import { getMapConfig } from '../world/maps/index.ts';
import { createCollisionManifestLoader } from '../../server/collisionManifestLoader.ts';
import { createHeadlessCollisionWorld } from '../world/headlessCollisionWorld.ts';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// ---- 1. the law
// an infinite wall of height h at distance d hides (1 − d / √(d² + h²)) / 2 of an up-facing receiver's sky
const wallPts = [-400, -0.1, 400, -0.1, 400, 0.1, -400, 0.1];
for (const d of [0.25, 1, 2, 4, 8]) {
  near(prismSkyOcclusion(0, 0, 0.1 + d, wallPts, 0, 4, 0, 4), (1 - d / Math.hypot(d, 4)) / 2, 2e-3, `infinite wall at ${d} m`);
}
// Monte Carlo over the cosine-weighted sky (a seeded LCG): a box beside the receiver, a deck over and beside it
let seed = 7;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
function monteCarlo(P, lo, hi, n = 200000) {
  let hit = 0;
  for (let k = 0; k < n; k++) {
    const u = rnd(), v = rnd(), r = Math.sqrt(u), th = 2 * Math.PI * v;
    const d = [r * Math.cos(th), Math.sqrt(1 - u), r * Math.sin(th)];
    let t0 = 0, t1 = 1e9, ok = true;
    for (let a = 0; a < 3 && ok; a++) {
      if (Math.abs(d[a]) < 1e-12) { if (P[a] < lo[a] || P[a] > hi[a]) ok = false; continue; }
      let ta = (lo[a] - P[a]) / d[a], tb = (hi[a] - P[a]) / d[a];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) ok = false;
    }
    if (ok) hit++;
  }
  return hit / n;
}
const box = [-1.5, -1, 1.5, -1, 1.5, 1, -1.5, 1];
near(prismSkyOcclusion(2.7, 0, 1.9, box, 0, 4, 0, 5), monteCarlo([2.7, 0, 1.9], [-1.5, 0, -1], [1.5, 5, 1]), 0.006, 'a box beside the receiver');
near(prismSkyOcclusion(0.5, 0, 0.2, box, 0, 4, 3, 3.5), monteCarlo([0.5, 0, 0.2], [-1.5, 3, -1], [1.5, 3.5, 1]), 0.006, 'a deck over the receiver');
near(prismSkyOcclusion(2.5, 0, 0, box, 0, 4, 3, 3.5), monteCarlo([2.5, 0, 0], [-1.5, 3, -1], [1.5, 3.5, 1]), 0.006, 'a deck beside it');
assert.equal(prismSkyOcclusion(5, 6, 0, box, 0, 4, 0, 5), 0, 'a part below the receiver hides no sky');
// footprints: counter-clockwise whatever the source winding; an oriented box and a circle
const cw = shapeFootprint({ kind: 'convex', cx: 0, cz: 0, points: [0, 0, 0, 1, 1, 1, 1, 0] });
let area2 = 0;
for (let i = 0; i < cw.length; i += 2) { const j = (i + 2) % cw.length; area2 += cw[i] * cw[j + 1] - cw[j] * cw[i + 1]; }
assert.ok(area2 > 0, 'a clockwise outline is reversed');
assert.equal(shapeFootprint({ kind: 'circle', cx: 0, cz: 0, r: 1 }).length, 20, 'a circle is a ten-gon');

// ---- 2. the raster
assert.equal(SGO_SIZE * SGO_TEXEL_M, 2 * SGO_HALF_M, 'the raster spans the playable square');
assert.equal(SGO_HALF_M, 512);
const house = { min: [10, 3.2, 20], max: [18, 9.2, 26], shape2: { kind: 'obb', cx: 14, cz: 23, hw: 4, hl: 3, yaw: 0 } };
const tree = { min: [40, 3, 40], max: [41, 15, 41], treeIdx: 4, shape2: { kind: 'circle', cx: 40.5, cz: 40.5, r: 0.5 } };
const kerb = { min: [60, 3, 60], max: [70, 3.2, 61] };
const broken = { min: [80, 3, 80], max: [84, 6, 84], crushed: true };
const packed = packOccluders([house, tree, kerb, broken]);
assert.equal(packed[0], 4, 'the house: one four-cornered part');
assert.equal(packed.length, 4 + 8, 'trees, kerbs under 0.3 m and broken solids are not occluders');
const full = bakeStructureGroundOcclusion(packed);
const at = (x, z) => {
  const i = Math.floor((x + SGO_HALF_M) / SGO_TEXEL_M), j = Math.floor((z + SGO_HALF_M) / SGO_TEXEL_M);
  const r = full.rg[(j * SGO_SIZE + i) * 2];
  return { occ: (r >> 1) / 127, covered: (r & 1) === 1, g: full.rg[(j * SGO_SIZE + i) * 2 + 1] };
};
// beside the long wall (x 10..18 at z 26): a 6 m wall of 8 m, the receiver 0.75 m out
const foot = at(14.1, 26.75);
near(foot.occ, prismSkyOcclusion(14.25, 3.2, 26.75, shapeFootprint(house.shape2), 0, 4, 3.2, 9.2), 1 / 127, 'the wall foot');
assert.ok(!foot.covered && at(14.1, 25.8).covered && at(14.1, 23).covered, 'R\'s lowest bit: inside the standing solid');
assert.ok(foot.occ > 0.3 && foot.occ < 0.5, `a house's wall foot loses a third of its sky (${foot.occ})`);
const baseMod = (foot.g / 256) * SGO_BASE_WRAP_M;
near(baseMod, 3.2, SGO_BASE_WRAP_M / 256, 'G: the base modulo the wrap');
assert.ok(at(14.1, 25.8).occ >= at(14.1, 26.25).occ, 'the covered texel at the wall line takes its open neighbours\' value (no seam)');
assert.equal(at(14.1, 23).occ, 0, 'deep inside a solid: nothing');
assert.equal(at(14.1, 26 + Math.min(SGO_REACH_MAX_M, SGO_REACH_H * 6) + 1).occ, 0, 'nothing past the reach');
assert.ok(at(14.1, 30).occ < at(14.1, 27.5).occ, 'and it falls off with distance');
assert.equal(at(40.5, 41.6).occ, 0, 'no tree');
// a region re-bake equals the full bake there
const rect = sgoRectOf(8, 18, 30, 34);
const part = bakeStructureGroundOcclusion(packed, rect);
let diff = 0;
for (let j = rect[1]; j < rect[3]; j++) {
  for (let i = rect[0]; i < rect[2]; i++) {
    const a = full.rg[(j * SGO_SIZE + i) * 2], b = part.rg[((j - rect[1]) * (rect[2] - rect[0]) + (i - rect[0])) * 2];
    diff = Math.max(diff, Math.abs(a - b));
  }
}
assert.equal(diff, 0, 'a region re-bake equals the full bake');

// ---- 3. a real map (its captured collision manifest): bounded parts, the trees out
{
  const loader = createCollisionManifestLoader();
  const world = createHeadlessCollisionWorld({ mapId: 'whiteout', heightField: { getHeightAt: () => 0 }, manifest: loader.get('whiteout') });
  const occluders = packOccluders(world.getObstacles());
  let parts = 0;
  for (let o = 0; o < occluders.length; o += 4 + 2 * occluders[o]) parts++;
  assert.ok(parts > 500 && parts < 20000, `Whiteout's occluders (${parts} parts)`);
}

// ---- 4. the pass's block and its wiring
assert.match(STRUCTURE_GROUND_OCCLUSION_GLSL, /float cotStructureGroundShade\( vec2 uv, vec3 P, float alpha, float dist \)/);
assert.match(STRUCTURE_GROUND_OCCLUSION_GLSL, /vec2 near = texelFetch\( tSgo, ti, 0 \)\.rg;/, 'the base and the covered flag by their own texel');
assert.match(STRUCTURE_GROUND_OCCLUSION_GLSL, /bool covered = mod\( floor\( near\.r \* 255\.0 \+ 0\.5 \), 2\.0 \) > 0\.5;/, 'inside a solid: only its base, never its top');
assert.match(STRUCTURE_GROUND_OCCLUSION_GLSL, /ambShare = A \/ max\( T \+ A, 1e-4 \);/, 'only the ambient share');
assert.match(STRUCTURE_GROUND_OCCLUSION_GLSL, new RegExp(`smoothstep\\( ${SGO_GATE_M.toFixed(5)}`), 'only receivers near the base');
assert.ok(STRUCTURE_GROUND_OCCLUSION_GLSL.includes((1 - SGO_RETURN).toFixed(5)), 'the occluder\'s own light given back');
const post = read('./post.ts');
assert.match(post, /\$\{STRUCTURE_GROUND_OCCLUSION_GLSL\}/, 'the aerial pass includes the block');
assert.match(post, /cotGroundJoin = min\( cotGroundJoin, cotStructureGroundShade\( vUv, uCamPos \+ ray \* rayT, texel\.a, -viewZ \) \);/,
  'joined by min() (with a structure pixel\'s cavity factor, overhaul r4)');
assert.match(post, /texel\.rgb \*= min\( 1\.0, cotGroundJoin \/ max\( cotHullGround, 1e-3 \) \);/,
  'never compounded with a hull\'s ground term: the stronger stands');
assert.match(post, /float cotGroundPre = max\( texel\.r, max\( texel\.g, texel\.b \) \);\s*if \( uVehGround > 0\.5/, 'the hulls\' factor read from the colour it scaled');
assert.match(post, /updateStructureGroundUniforms\(aerial\.uniforms, scene, renderer, groundOcclusionOn\);/, 'its lever: the contact march\'s, or the preset\'s own (overhaul r5)');
assert.match(post, /groundOcclusionOn = next\.contactShadows\s*\|\| \(preset\.groundOcclusion === true && resolveGroundOcclusion\(preset, getDeviceTier\(\), currentPostLightFxQuery\(\)\)\);/,
  'Low and the phones take it under their presets\' own lever');
assert.match(post, /updateContactShadowUniforms\(aerial\.uniforms, camera, scene, lightFx\.contactShadows,\s*lightFx\.contactShadows \|\| lightFx\.vehicleOcclusion \|\| groundOcclusionOn\);/,
  'the rig uniforms it reads are refreshed whenever it runs');
const map = read('../world/map.ts');
assert.match(map, /createStructureGroundOcclusion\(props\.obstacles, \{ group, scale: groundOcclusionScale \}\)/, 'the world bakes its obstacles');
assert.match(map, /const groundOcclusionRead = getDeviceTier\(\) !== 'mobile' \|\| getPreset\(\)\.groundOcclusion === true;\s*const groundOcclusion: StructureGroundOcclusionHandle \| null = groundOcclusionScale > 0 && groundOcclusionRead\s*&& \(engineCtx/,
  'baked on the desktop tiers and, overhaul r5, on the phones under a preset that reads it');
assert.match(map, /groundOcclusion\.update\(dt\);/, 'the world polls its destroyed solids');
assert.match(map, /groundOcclusion\.dispose\(\);/);
const main = read('../main.ts');
assert.match(main, /groundOcclusion\.setInstant\(true\);\s*await Promise\.race\(\[groundOcclusion\.whenReady\(\)/, 'a capture waits for the bake');
const runtime = read('./structureGroundOcclusion.ts');
assert.match(runtime, /new Worker\(new URL\('\.\/structureGroundOcclusionWorker\.ts', import\.meta\.url\)/, 'baked off the main thread');
assert.match(runtime, /renderer\.copyTextureToTexture\(src, texture, null, new THREE\.Vector2\(i0, j0\)\)/, 'a re-bake patches in place');

// ---- 5. the thin deck's beam (cloudscapes.ts deckBeam)
await loadGroundedLightModel();
const irr = [0.11, 0.125, 0.16];
const whiteout = getMapConfig('whiteout');
const wSky = { ...DEFAULT_SKY_PRESET, ...whiteout.sky, cloudscape: whiteout.clouds };
assert.ok(whiteout.clouds.deckBeam > 0.3 && whiteout.clouds.deckBeam < 0.6, 'Whiteout\'s stratus is thin');
assert.equal(resolveDeckBeam(wSky), whiteout.clouds.deckBeam);
assert.equal(resolveDeckBeam({ ...wSky, cloudscape: { ...whiteout.clouds, regime: 'fair-weather-cumulus' } }), 0, 'a cloud-shadow regime casts its own cells');
const wAtmo = skyPresetToAtmosphere(wSky);
const thin = resolveLightModel(wSky, wAtmo, { irradianceRaw: irr }, null, true);
const thick = resolveLightModel({ ...wSky, cloudscape: { ...whiteout.clouds, deckBeam: 0 } }, wAtmo, { irradianceRaw: irr }, null, true);
assert.equal(thin.overcast, 1, 'still a closed deck');
const clear = deriveSun(wAtmo, 0);
near(thin.sunIntensity * luminance(thin.sunColor) / (clear.intensity * luminance(clear.color)), whiteout.clouds.deckBeam, 0.02, 'the cascades carry deckBeam of the clear beam');
near(thick.sunIntensity * luminance(thick.sunColor) / (clear.intensity * luminance(clear.color)), 1 - OVERCAST_DIRECT_CUT, 0.005, 'without it the closed deck\'s few per cent');
const sinEl = Math.max(0, wAtmo.sunDir[1]);
const ratio = (m) => (m.sunIntensity * luminance(m.sunColor) * sinEl + m.hemiIntensity + Math.PI * luminance(irr) * m.envIntensity * m.envDiffuseGain)
  / (m.hemiIntensity + Math.PI * luminance(irr) * m.envIntensity * m.envDiffuseGain);
assert.ok(ratio(thick) < 1.05 && ratio(thin) > 1.25, `lit and shaded snow: ${ratio(thick).toFixed(2)} → ${ratio(thin).toFixed(2)}`);
assert.ok(thin.saturation === thick.saturation && thin.whiteBalance.every((v, i) => v === thick.whiteBalance[i]), 'the overcast grade unchanged');
assert.ok(thin.exposure < thick.exposure && thin.exposure > thick.exposure * 0.7, 'the camera adapts a little to the added light');
const clouds = read('./volumetricClouds.ts');
assert.match(clouds, /Math\.min\(lightTune\('CLOUD_DECK_SHADOW_CORE', CLOUD_LAYER_RULES\.deckShadowCore\), 1 - \(preset\.deckBeam \?\? 0\)\)/, 'a deck cell passes deckBeam');
const layer = read('./cloudscapeLayer.ts');
assert.match(layer, /deckBeam: clamp\(scape\.deckBeam \?\? 0, 0, 1\),/);

// ---- 6. every map (2026-10-10: the owner's free hand lifted the protected maps): no map is held off by id
assert.doesNotMatch(map, /PROTECTED_MAPS/, 'no per-map exclusion');
assert.equal(getMapConfig('winter').clouds?.deckBeam, 0.4, 'Frosthollow\'s broken deck passes part of the beam');
assert.equal(getMapConfig('railyard').clouds?.deckBeam, 0.35, 'Cinder Junction\'s too');

console.log(`structureGroundOcclusion.selftest: Lambert's law (infinite wall, box, deck), the ${SGO_SIZE}² raster (base wrap, seamless wall foot, region re-bake), Whiteout's occluders, the pass and its wiring, the thin deck's beam, every map PASS`);
