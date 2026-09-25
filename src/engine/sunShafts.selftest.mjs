// Round 69 (2026-09-24): sun shafts — the per-map haze law over every battlefield's sky preset (the hazy and
// low-sun maps get visible shafts, the clear high-sun maps nearly none, the night dome none), the frame fade, the
// sun projection, the quarter-res pass contract and its place in the chain, and the haze inputs sky.ts publishes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  SUN_SHAFT_DECAY, SUN_SHAFT_GAIN, SUN_SHAFT_SPANS, SUN_SHAFT_TAPS, projectSunToScreen, sunShaftDayFactor,
  sunShaftElevationFactor, sunShaftFrameFade, sunShaftHaze, sunShaftMapStrength,
} from './sunShafts.ts';
import { MAP_IDS } from '../world/maps/catalog.ts';
import { getMapConfig } from '../world/maps/index.ts';

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const sky = readFileSync(new URL('./sky.ts', import.meta.url), 'utf8');

// 1. the dome's defaults for a preset that omits a field (sky.ts DEFAULT_PRESET) and its night law
const TURBIDITY = Number(sky.match(/const TURBIDITY = ([\d.]+);/)?.[1]);
const MIE = Number(sky.match(/const MIE_COEFFICIENT = ([\d.]+);/)?.[1]);
const NIGHT_FULL = Number(sky.match(/const NIGHT_SKY_FULL_INTENSITY = ([\d.]+);/)?.[1]);
const NIGHT_TOP = Number(sky.match(/const NIGHT_SKY_FULL_INTENSITY_TOP = ([\d.]+);/)?.[1]);
assert.ok(TURBIDITY > 0 && MIE > 0 && NIGHT_FULL > 0 && NIGHT_TOP > NIGHT_FULL, 'sky.ts constants located');
assert.equal(sunShaftDayFactor(NIGHT_FULL), 0, 'the full night dome: no shafts');
assert.equal(sunShaftDayFactor(NIGHT_TOP), 1);
assert.equal(sunShaftDayFactor(1), 1);
assert.ok(near(sunShaftDayFactor((NIGHT_FULL + NIGHT_TOP) / 2), 0.5), 'the same law as the dome\'s nightAmount');

// 2. the per-map table over every battlefield's authored sky (the dome's defaults for an omitted field)
const strengths = {};
for (const id of MAP_IDS) {
  const p = getMapConfig(id).sky ?? {};
  strengths[id] = sunShaftMapStrength({
    fogDensity: p.fogDensity, turbidity: p.turbidity ?? TURBIDITY, mieCoefficient: p.mieCoefficient ?? MIE,
    sunElevationDeg: p.sunElevationDeg ?? 32, skyIntensity: p.skyIntensity ?? 1,
  });
  assert.ok(Number.isFinite(strengths[id]) && strengths[id] >= 0 && strengths[id] <= 1, id);
}
console.log('sunShafts.selftest: per-map strength', Object.entries(strengths).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', '));
const visible = { titan_gorge: 0.45, fjord: 0.55, monsoon: 0.85, longleaf: 0.40, alpine: 0.60, caldera: 0.85, blackglass: 0.75, whiteout: 0.5 };
for (const [id, floor] of Object.entries(visible)) assert.ok(strengths[id] >= floor, `${id} gets visible shafts (${strengths[id].toFixed(2)} >= ${floor})`);
const clear = { desert: 0.05, steppe: 0.08, railyard: 0.12, coastal: 0.06, urban: 0.30 };
for (const [id, cap] of Object.entries(clear)) assert.ok(strengths[id] <= cap, `${id} is a clear high-sun map (${strengths[id].toFixed(2)} <= ${cap})`);
assert.equal(strengths.mars, 0, 'Mars\' thin dust sky carries no shafts');

// 3. the law's parts
assert.equal(sunShaftElevationFactor(20), 1);
assert.equal(sunShaftElevationFactor(26), 1);
assert.equal(sunShaftElevationFactor(46), 0);
assert.ok(sunShaftElevationFactor(36) > 0 && sunShaftElevationFactor(36) < 1);
assert.equal(sunShaftHaze({ fogDensity: 0.0002, turbidity: 2, mieCoefficient: 0.004 }), 0, 'thin air: no haze');
assert.equal(sunShaftHaze({ fogDensity: 0.0009, turbidity: 2, mieCoefficient: 0.004 }), 1, 'fog alone saturates');
assert.equal(sunShaftHaze({ fogDensity: 0.0002, turbidity: 8, mieCoefficient: 0.014 }), 1, 'aerosol alone saturates');
assert.ok(near(sunShaftHaze({ fogDensity: 0.00065, turbidity: 2, mieCoefficient: 0.004 }), 0.5), 'the fog band midpoint');

// 4. the frame fade and the sun projection
assert.equal(sunShaftFrameFade(0, 0, true), 1);
assert.equal(sunShaftFrameFade(1, 0.5, true), 1, 'at the frame edge the rays are still full');
assert.equal(sunShaftFrameFade(1.55, 0, true), 0, 'half a frame outside: gone');
assert.ok(sunShaftFrameFade(1.3, 0, true) > 0 && sunShaftFrameFade(1.3, 0, true) < 1, 'just outside: fading');
assert.equal(sunShaftFrameFade(0, 0, false), 0, 'behind the camera: none');
{
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000);
  camera.position.set(0, 10, 0);
  camera.lookAt(1, 10, 0); // east, level
  camera.updateMatrixWorld();
  const out = { uv: new THREE.Vector2(), ahead: false, ndc: new THREE.Vector2() };
  const east = new THREE.Vector3(Math.cos(0.4), Math.sin(0.4), 0);
  projectSunToScreen(camera, east, out);
  assert.equal(out.ahead, true);
  assert.ok(out.uv.x > 0.4 && out.uv.x < 0.6 && out.uv.y > 0.5 && out.uv.y < 1, `a sun ahead and above the centre line lands there (${out.uv.toArray()})`);
  projectSunToScreen(camera, new THREE.Vector3(-1, 0.3, 0).normalize(), out);
  assert.equal(out.ahead, false, 'a sun behind the camera');
}

// 5. the pass contract and the chain
const source = readFileSync(new URL('./sunShafts.ts', import.meta.url), 'utf8');
assert.equal(SUN_SHAFT_TAPS, 12);
assert.equal(SUN_SHAFT_DECAY, 0.9);
assert.deepEqual([...SUN_SHAFT_SPANS], [1, 1 / 12], 'the whole segment, then a twelfth of it');
assert.ok(SUN_SHAFT_GAIN > 0 && SUN_SHAFT_GAIN < 1);
assert.match(source, /float sky = step\( 0\.9999999, texture2D\( tDepth, vUv \)\.x \);/, 'the mask uses the aerial pass\'s own sky gate');
assert.match(source, /for \( int i = 0; i < \$\{SUN_SHAFT_TAPS\}; i\+\+ \)/, 'twelve taps per blur pass');
assert.match(source, /Math\.round\(width \/ 4\)/, 'quarter resolution');
assert.match(source, /renderer\.clear\( ?true, false, false ?\)/, 'a zero strength still clears the light target');
const post = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
const bloomAt = post.indexOf('composer.addPass(bloom);');
const shaftsAt = post.indexOf('composer.addPass(sunShafts);');
const flareAt = post.indexOf('composer.addPass(lensFlare);');
const gradeAt = post.indexOf('composer.addPass(grade);');
assert.ok(bloomAt > 0 && shaftsAt > bloomAt && flareAt > shaftsAt && gradeAt > flareAt, 'shafts then flare after bloom and before the grade');
assert.match(post, /grade\.uniforms\.tLightFx\.value = lightFxTarget\.texture;/, 'the grade reads the shared light target');
assert.match(post, /if \( uLightFx > 0\.5 \) outputColor\.rgb \+= texture2D\( tLightFx, sampleUv \)\.rgb;/, 'added in linear HDR before the tonemap');
assert.ok(post.indexOf('if ( uLightFx > 0.5 ) outputColor.rgb +=') < post.indexOf('#ifdef LINEAR_TONE_MAPPING'), 'before the output transform');
assert.match(post, /grade\.uniforms\.uLightFx\.value = lightFx\.sunShafts \|\| lightFx\.lensFlare \? 1 : 0;/, 'the fetch follows the levers');
assert.match(post, /sunShafts\.update\(lightFx\.sunShafts\);/, 'per-frame update follows the lever');
assert.match(sky, /targetScene\.userData\.skyHazeInputs = \{\s*fogDensity: preset\.fogDensity, turbidity: preset\.turbidity, mieCoefficient: preset\.mieCoefficient,\s*sunElevationDeg: preset\.sunElevationDeg, skyIntensity: preset\.skyIntensity,\s*\};/,
  'sky.ts publishes the haze inputs with every fog application');

console.log('sunShafts.selftest: night law, the 31-map strength table, the law\'s parts, frame fade, sun projection, pass contract and chain order pinned');
