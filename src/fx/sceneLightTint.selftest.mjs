// sceneLightTint.selftest (fx 9, the owner 2026-10-11: "make sure the effects and smoke and dust from tank driving and
// from engine and tracers are correct for the times of days as well"): the pooled FX media take the scene's light —
// white by day on every daylight map (the battle look unchanged), warm and dimmer at sunset, a dim blue at night, about
// half on an overcast deck — and the battle's pools are shaded by it in every quality.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { lightTintForRig, lightTintFromRig, TINT_WHITE_FROM_BATTLE, TINT_WHITE_FROM_CINEMATIC } from './sceneLightTint.ts';

const tint = (sunI, sunHex, hemiI, skyHex, whiteFrom = TINT_WHITE_FROM_BATTLE) => lightTintForRig({ sunIntensity: sunI,
  sunColor: new THREE.Color(sunHex), hemiIntensity: hemiI, hemiSky: new THREE.Color(skyHex) }, new THREE.Color(), whiteFrom);
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
// daylight: white in battle (Verdant's measured noon; the clear day maps' presets, sun 3.7-4.5)
for (const [sun, hemi] of [[4.5, 0.45], [4.2, 0.36], [4.25, 0.25], [4.0, 0.42], [3.7, 0.43]]) {
  const c = tint(sun, 0xfff2e0, hemi, 0x9fc1e8);
  assert.ok(c.r > 0.97 && c.g > 0.97 && c.b > 0.97, `daylight (sun ${sun}, sky ${hemi}) leaves the media white (${c.getHexString()})`);
}
// sunset (battleAtmosphereRuntime's preset as the rig publishes it): warm and about half
const dusk = tint(2.8, 0xffbf80, 0.73, 0xd8a890);
assert.ok(lum(dusk) > 0.35 && lum(dusk) < 0.7 && dusk.r > dusk.b * 1.15, `sunset: warm, about half (${dusk.getHexString()})`);
// night (the moon's preset): dim and blue
const night = tint(0.6, 0xafc3ec, 0.75, 0x3a4d68);
assert.ok(lum(night) < 0.35 && night.b > night.r, `night: dim and blue (${night.getHexString()})`);
assert.ok(lum(night) < lum(dusk) && lum(dusk) < 1, 'darker with the hour');
// an overcast day's deck (Cinder Junction, Frosthollow): the ground's own dimmer light
const overcast = tint(1.35, 0xf0f2f5, 0.85, 0xc8d0d8);
assert.ok(lum(overcast) > 0.35 && lum(overcast) < 0.8, `an overcast deck dims the media with the ground (${overcast.getHexString()})`);
// no rig: white; a scene's published rig is read
assert.equal(lightTintFromRig(null, new THREE.Color()).getHex(), 0xffffff, 'no rig: white');
const scene = new THREE.Scene();
scene.userData.lightRig = { sunIntensity: 0.6, sunColor: new THREE.Color(0xafc3ec), hemiIntensity: 0.75, hemiSky: new THREE.Color(0x3a4d68) };
assert.equal(lightTintFromRig(scene, new THREE.Color(), TINT_WHITE_FROM_BATTLE).getHex(), night.getHex(), 'the scene\'s published rig');
// the Studio's cinematic layer keeps the measure it was tuned with (white from Verdant's noon only)
const cineNoon = tint(4.5, 0xfff2e0, 0.45, 0x9fc1e8, TINT_WHITE_FROM_CINEMATIC);
assert.ok(cineNoon.r > 0.97 && cineNoon.g > 0.97 && cineNoon.b > 0.97, 'the cinematic noon is white too');
// the battle's pools are shaded by it in every quality: effects.ts switches the tint on at creation and writes it each
// frame; the Studio's cinematic layer reads the same function and never switches it off
const { readFileSync } = await import('node:fs');
const effects = readFileSync(new URL('./effects.ts', import.meta.url), 'utf8');
assert.match(effects, /particles\.setLightTintShading\(true\);/, 'the battle pools take the scene tint');
assert.match(effects, /if \(!cinematicTintOwner\) lightTintFromRig\(engineCtx\.scene \?\? null, particles\.sharing\.uLightTint\.value, TINT_WHITE_FROM_BATTLE\);\s*particles\.update\(dt\);/,
  'written every frame before the pools draw, unless the Studio\'s cinematic quality has taken it');
assert.match(effects, /setLightTintShading: \(on\) => \{ cinematicTintOwner = on; \}/, 'the cinematic port hands the tint over, never the shading off');
const cine = readFileSync(new URL('./cinematicFx.ts', import.meta.url), 'utf8');
assert.match(cine, /import \{ lightTintFromRig \} from '\.\/sceneLightTint\.ts';/, 'one tint function for battle and Studio');
console.log(`sceneLightTint.selftest: daylight white, sunset ${dusk.getHexString()}, night ${night.getHexString()}, overcast ${overcast.getHexString()}; the battle pools tinted every frame in every quality`);
