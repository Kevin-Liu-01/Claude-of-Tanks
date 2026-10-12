// sceneLightTint.selftest (the owner 2026-10-11: "make sure the effects and smoke and dust from tank driving and from
// engine and tracers are correct for the times of days as well"). In battle the pooled media (driving dust, the phone
// tier's exhaust and smoke, debris) drew at the daylight level at every hour: pale dust glowing in a moonlit field. Now
// the battle pools take the light a puff receives under the live rig, as a share of the default noon rig's, every frame
// (battleLightTintForRig): white on a clear day, warm and dimmer at sunset, dim and blue at night, about half under an
// overcast deck. Every light term counts at its colour's luminance (the Studio's cinematic measure counted the sky at
// full strength whatever its colour; it stays as it was for the Studio's films).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { battleLightTintForModel, battleLightTintForRig, battleLightTintFromRig, lightTintForRig, puffLightForModel, TINT_WHITE_FROM_CINEMATIC,
  VERDANT_DAY_PUFF_LIGHT } from './sceneLightTint.ts';

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
// (2026-10-12) Under the grounded light model (every open sky on the desktop tiers) the published rig has no sky term by
// day — the environment carries it — so the battle measures the light over a puff's whole sphere on the model itself.
const { loadGroundedLightModel, resolveLightModel } = await import('../engine/lightModelCore.ts');
const { skyPresetToAtmosphere } = await import('../engine/atmosphere.ts');
const { DEFAULT_SKY_PRESET } = await import('../engine/sky.ts');
const { getMapConfig } = await import('../world/maps/index.ts');
await loadGroundedLightModel();
const IRR = [0.11, 0.125, 0.16]; // the clear dome's raw irradiance the light model's receipt pins for Verdant
const hour = (id, time) => {
  const sky = { ...DEFAULT_SKY_PRESET, ...getMapConfig(id).sky };
  const [p, k, sun] = time === 'day' ? [sky, 1, null]
    : time === 'sunset' ? [{ ...sky, sunElevationDeg: 7, skyIntensity: 0.72 }, 0.72, { intensity: 2.8, colorHex: 0xffbf80 }]
      : [{ ...sky, skyIntensity: 0.08, sunElevationDeg: 24 }, 0.08, { intensity: 0.6, colorHex: 0xafc3ec }];
  const irr = IRR.map((v) => v * k);
  const model = resolveLightModel(p, skyPresetToAtmosphere(p), { irradianceRaw: irr }, sun);
  assert.equal(model.mode, 'physical', `${id} ${time}: the grounded model`);
  return { model, irr: { r: irr[0], g: irr[1], b: irr[2] } };
};
const vDay = hour('verdant', 'day');
const vLight = puffLightForModel(vDay.model, vDay.irr, { r: 0, g: 0, b: 0 });
assert.ok(Math.abs(lum(vLight) / VERDANT_DAY_PUFF_LIGHT - 1) < 0.01, `the pinned clear-day light is the model's (${lum(vLight).toFixed(3)})`);
const tintAt = (id, time) => { const h = hour(id, time); return battleLightTintForModel(h.model, h.irr, new THREE.Color()); };
for (const id of ['verdant', 'frontier', 'desert']) {
  const c = tintAt(id, 'day');
  assert.ok(c.r > 0.97 && c.g > 0.97 && c.b > 0.97, `${id}'s clear day leaves the pools white (${c.getHexString()})`);
}
const mDusk = tintAt('verdant', 'sunset'), mNight = tintAt('verdant', 'night'), mDeck = tintAt('monsoon', 'day');
assert.ok(lum(mDusk) > 0.35 && lum(mDusk) < 0.7 && mDusk.r > mDusk.b * 1.15, `the grounded sunset: about half, warm (${mDusk.getHexString()})`);
assert.ok(lum(mNight) > 0.08 && lum(mNight) < 0.25 && mNight.b > mNight.r, `the grounded night: about a sixth, blue (${mNight.getHexString()})`);
assert.ok(lum(mDeck) > 0.25 && lum(mDeck) < 0.6, `Monsoon's deck dims the pools with its ground (${mDeck.getHexString()})`);
// the sky term the rig lacks: the rig-only measure misses the dome's light (most of a sunset's besides the sun)
const duskRig = battleLightTintForRig({ sunIntensity: hour('verdant', 'sunset').model.sunIntensity, sunColor: (() => { const s = hour('verdant', 'sunset').model.sunColor; return { r: s[0], g: s[1], b: s[2] }; })(),
  hemiIntensity: 0, hemiSky: { r: 1, g: 1, b: 1 } }, new THREE.Color());
assert.ok(lum(mDusk) > lum(duskRig) * 1.1, `the dome's light counts (${lum(mDusk).toFixed(3)} vs the rig's ${lum(duskRig).toFixed(3)})`);
// a scene reads the model where it lights the scene, the rig otherwise
const lit = new THREE.Scene();
const nightH = hour('verdant', 'night');
lit.userData.lightModel = nightH.model; lit.userData.atmosphere = { irradianceRaw: new THREE.Color(nightH.irr.r, nightH.irr.g, nightH.irr.b) };
lit.userData.lightRig = rig(4.5, 0xfff1dc, 0.36, 0xaac8f5);
assert.equal(battleLightTintFromRig(lit, new THREE.Color()).getHex(), mNight.getHex(), "the scene's grounded model wins over its rig");
lit.userData.lightModel = { ...nightH.model, mode: 'legacy' };
assert.equal(battleLightTintFromRig(lit, new THREE.Color()).getHex(), battleLightTintForRig(lit.userData.lightRig, new THREE.Color()).getHex(), 'an authored rig keeps the rig measure');
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
console.log(`sceneLightTint.selftest: battle pools white by day; the grounded model's sunset ${mDusk.getHexString()}, night ${mNight.getHexString()}, Monsoon's deck ${mDeck.getHexString()}; the rig's sunset ${dusk.getHexString()}, night ${night.getHexString()} (cinematic measure ${cineNight.getHexString()}), overcast ${overcast.getHexString()}`);
