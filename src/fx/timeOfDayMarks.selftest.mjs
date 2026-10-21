// (EF.09, MASTER 18) the unlit marks and bodies take the time of day's light: the track prints and the wake's foam, the
// hull scars and a missile's painted body are multiplied every frame by the battle pools' light tint (sceneLightTint.ts:
// white by day, warm at dusk, a dim blue at night); a motor's flare stays emissive. Source pins on effects.ts.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { battleLightTintForRig } from './sceneLightTint.ts';

const src = await readFile(new URL('./effects.ts', import.meta.url), 'utf8');
assert.match(src, /const printUniforms = \{ uTime: \{ value: 0 \}, uMap: \{ value: printTex \}, uTint: \{ value: new THREE\.Color\(1, 1, 1\) \} \};/,
  'the prints carry a tint');
assert.match(src, /gl_FragColor = vec4\(color \* uTint, a\);/, 'the print and wake colour is tinted');
const frame = src.slice(src.indexOf('battleLightTintFromRig(engineCtx.scene ?? null, particles.sharing.uLightTint.value);'));
assert.ok(frame.length > 0, 'the battle tint is measured every frame');
const head = frame.slice(0, 1600);
assert.match(head, /printUniforms\.uTint\.value\.copy\(tint\);/, 'every frame the prints take it');
assert.match(head, /impactDecals\.material\.color\.copy\(tint\);/, 'the hull scars take it');
// (FX lane 10-15) a missile's airframe is lit by the time of day's rig itself (missileBodies.ts: sun, sky and ground,
// the light its wire and trail take), refreshed while one flies
assert.match(src, /const bodies = createMissileBodies\(missileLight, MAX_ATGM_BODIES\);/, "a missile's body takes the scene's light");
assert.match(src, /if \(wires\.mesh\.visible \|\| smokeTrails\.mesh\.visible \|\| bodies\.count > 0\) \{\n\s+readSceneLight\(/,
  'refreshed every frame a body flies');
assert.doesNotMatch(head, /atgmFlareMat\.color\.copy/, "a motor's flare stays emissive");
// the tint itself: white on a clear noon rig, dim at night (the snow print and the foam stop glowing)
const lin = (h) => new THREE.Color(h); // hex is read as sRGB into the linear working space
const noon = battleLightTintForRig({ sunIntensity: 4.5, sunColor: lin(0xfff1dc), hemiIntensity: 0.36, hemiSky: lin(0xaac8f5),
  hemiGround: lin(0x94815f), fillIntensity: 0.66, fillColor: lin(0xbdd2f2) }, new THREE.Color());
assert.ok(noon.r > 0.99 && noon.g > 0.99 && noon.b > 0.99, 'noon is white');
const night = battleLightTintForRig({ sunIntensity: 0.6, sunColor: lin(0x9fb4e0), hemiIntensity: 0.75, hemiSky: lin(0x1c2a4a),
  hemiGround: lin(0x0e1014), fillIntensity: 0.2, fillColor: lin(0x2a3a5a) }, new THREE.Color());
assert.ok(Math.max(night.r, night.g, night.b) < 0.45, `night is dim (${night.r.toFixed(2)} ${night.g.toFixed(2)} ${night.b.toFixed(2)})`);
// (EF.11, DO-FX-08) the media's night and rim defects: a thin rim takes the sky's light grey (no cyan fringe); at night a
// dark medium never falls under a share of the sky's own light (no flat black cut-out), the level from the rig's sun
const media = await readFile(new URL('./volumeMedia.ts', import.meta.url), 'utf8');
assert.match(media, /skyC = mix\( vec3\( skyLum \), skyC, smoothstep\( 0\.15, 0\.6, cov \) \);/, 'the thin rim is lit grey by the sky');
// (FX 10-17, re-pinned 230 with its cause: the media critics' "flat black plume" on ~15 night takes) the floor's share is
// tunable (uGrade2.w, volumeTune.night; .z is the embers' level) and lifts the body's top over its heart; a blind ranking
// of 0.25/0.5/0.8/1.1 on s63/s169/s214 against integ/230 put 0.5 first (mean rank 1.5 of 5, both critics; 0.25 and the
// old floor read as flat black cut-outs, 1.1 as milky) — still neutral grey and under the sky's own level (EF.11)
assert.match(media, /float floorL = skyLum \* uGrade2\.y \* uGrade2\.w \* \( 0\.35 \+ 0\.5 \* U \+ 0\.15 \* front \);\s*col = max\( col, vec3\( floorL \) \);/,
  'the night floor: a share of the sky\'s light, neutral grey, its top lit over its heart (round 2: "pink-beige ... as if by day")');
assert.match(media, /ground: 1\.0, night: 0\.5 \}\);/, 'the night floor\'s share: half the sky\'s light at the top (the blind ranking\'s pick)');
assert.match(media, /uGrade2\.value\.w = tune\.night;/, 'the share rides .w, apart from the embers\' .z');
const puffSrc = await readFile(new URL('./particles.ts', import.meta.url), 'utf8');
assert.match(puffSrc, /export const NIGHT_SMOKE_FLOOR = 0\.14;/, 'the pooled puffs\' night floor (the same ranking\'s pick, with the media at 0.5)');
assert.match(puffSrc, /float floorL = L \* uNightFloor \* \( 1\.0 - smoothstep\( 0\.3, 0\.6, L \) \)/, 'gone by day (the tint over ~0.6)');
const fxSrc = await readFile(new URL('./effects.ts', import.meta.url), 'utf8');
assert.match(fxSrc, /const LOCAL_FIRE_REACH_M = 5;/, 'a wreck fire lights only a few metres of its smoke');
assert.match(fxSrc, /addLocalPoint\(col\.pos\[0\], col\.pos\[1\] \+ 1\.2, col\.pos\[2\], LOCAL_FIRE_REACH_M \* col\.scale,/, 'from the flames');
assert.match(media, /uGrade2\.value\.y = 1 - k \* k \* \(3 - 2 \* k\);/, 'the night level from the rig');
const nightOf = (sunI) => { const k = Math.min(1, Math.max(0, (sunI - 0.9) / 1.3)); return 1 - k * k * (3 - 2 * k); };
assert.equal(nightOf(4.5), 0, 'none by day'); assert.ok(nightOf(2.8) < 0.05, 'next to none at sunset'); assert.equal(nightOf(0.6), 1, 'full at night');
console.log('timeOfDayMarks: prints, wake foam, hull scars and missile bodies take the time of day (flares emissive); the media rim and night floor — ok');
