// sceneLightTint.selftest (the owner 2026-10-11: "make sure the effects and smoke and dust from tank driving and from
// engine and tracers are correct for the times of days as well"). In battle the pooled media (driving dust, the phone
// tier's exhaust and smoke, debris) drew at the daylight level at every hour: pale dust glowing in a moonlit field. Now
// the battle pools take the light a puff receives under the live rig, as a share of the default noon rig's, every frame
// (battleLightTintForRig): white on a clear day, warm and dimmer at sunset, dim and blue at night, about half under an
// overcast deck. Every light term counts at its colour's luminance (the Studio's cinematic measure counted the sky at
// full strength whatever its colour; it stays as it was for the Studio's films).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { battleLightTintForRig, battleLightTintFromRig, lightTintForRig, TINT_WHITE_FROM_CINEMATIC } from './sceneLightTint.ts';

const C = (hex) => new THREE.Color(hex);
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const battle = (rig) => battleLightTintForRig(rig, new THREE.Color());
const rig = (sunI, sun, hemiI, sky, ground = sky, fillI = 0, fill = sky) => ({ sunIntensity: sunI, sunColor: C(sun), hemiIntensity: hemiI,
  hemiSky: C(sky), hemiGround: C(ground), fillIntensity: fillI, fillColor: C(fill) });

// Clear daylight: white (the engine's noon rig and the clear day maps' keys, sun 3.7-4.5).
for (const [sun, hemi] of [[4.5, 0.36], [4.2, 0.36], [4.0, 0.42], [3.7, 0.43]]) {
  const c = battle(rig(sun, 0xfff1dc, hemi, 0xaac8f5, 0x94815f, 0.66, 0xbdd2f2));
  assert.ok(c.r > 0.97 && c.g > 0.97 && c.b > 0.97, `daylight (sun ${sun}) leaves the pools white (${c.getHexString()})`);
}
// Sunset (battleAtmosphereRuntime: sun 2.8 #ffbf80 at 7 degrees, sky .58, fill .38): warm and dimmer.
const dusk = battle(rig(2.8, 0xffbf80, 0.58, 0xd8a890, 0x7a5a40, 0.38, 0xc09080));
assert.ok(lum(dusk) > 0.25 && lum(dusk) < 0.75 && dusk.r > dusk.b * 1.15, `sunset: warm and dimmer (${dusk.getHexString()})`);
// Night (the moon .6 #afc3ec, sky .6 under a navy dome, fill .3): dim and blue, near the ground's own share of the noon.
const night = battle(rig(0.6, 0xafc3ec, 0.6, 0x3a4d68, 0x1c2230, 0.3, 0x3a4d68));
assert.ok(lum(night) < 0.16 && night.b > night.r, `night: dim and blue (${night.getHexString()})`);
assert.ok(lum(night) < lum(dusk), 'darker with the hour');
// The cinematic measure's flaw is gone: a dark sky no longer counts as a bright one.
const cineNight = lightTintForRig(rig(0.6, 0xafc3ec, 0.6, 0x3a4d68), new THREE.Color(), 0.72);
assert.ok(lum(night) < lum(cineNight) * 0.7, `the night sky counts at its own luminance (${lum(night).toFixed(3)} vs ${lum(cineNight).toFixed(3)})`);
// An overcast day's deck (sun 1.35, a bright grey dome): the ground's own dimmer light.
const overcast = battle(rig(1.35, 0xf0f2f5, 0.85, 0xc8d0d8, 0x7a7468, 0.4, 0xc8d0d8));
assert.ok(lum(overcast) > 0.25 && lum(overcast) < 0.85, `an overcast deck dims the pools with the ground (${overcast.getHexString()})`);
// No rig: white; a scene's published rig is read.
assert.equal(battleLightTintFromRig(null, new THREE.Color()).getHex(), 0xffffff, 'no rig: white');
const scene = new THREE.Scene();
scene.userData.lightRig = rig(0.6, 0xafc3ec, 0.6, 0x3a4d68, 0x1c2230, 0.3, 0x3a4d68);
assert.equal(battleLightTintFromRig(scene, new THREE.Color()).getHex(), night.getHex(), "the scene's published rig");
// The Studio's cinematic measure is unchanged (its films keep their look): white at Verdant's noon.
const cineNoon = lightTintForRig(rig(4.5, 0xfff2e0, 0.45, 0x9fc1e8), new THREE.Color(), TINT_WHITE_FROM_CINEMATIC);
assert.ok(cineNoon.r > 0.97 && cineNoon.g > 0.97 && cineNoon.b > 0.97, 'the cinematic noon is white');
// The battle pools are shaded by the tint in every quality: effects.ts switches it on at creation and writes the battle
// measure each frame before the pools draw; the Studio's cinematic layer takes it over with its own measure.
const { readFileSync } = await import('node:fs');
const effects = readFileSync(new URL('./effects.ts', import.meta.url), 'utf8');
assert.match(effects, /particles\.setLightTintShading\(true\);/, 'the battle pools take the scene tint');
assert.match(effects, /if \(!cinematicTintOwner\) battleLightTintFromRig\(engineCtx\.scene \?\? null, particles\.sharing\.uLightTint\.value\);\s*particles\.update\(dt\);/,
  "written every frame before the pools draw, unless the Studio's cinematic quality has taken it");
assert.match(effects, /setLightTintShading: \(on\) => \{ cinematicTintOwner = on; \}/, 'the cinematic port hands the tint over, never the shading off');
const cine = readFileSync(new URL('./cinematicFx.ts', import.meta.url), 'utf8');
assert.match(cine, /import \{ lightTintFromRig \} from '\.\/sceneLightTint\.ts';/, 'the Studio reads the same module');
console.log(`sceneLightTint.selftest: battle pools white by day, sunset ${dusk.getHexString()}, night ${night.getHexString()} (cinematic measure ${cineNight.getHexString()}), overcast ${overcast.getHexString()}`);
