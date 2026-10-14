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
const head = frame.slice(0, 900);
assert.match(head, /printUniforms\.uTint\.value\.copy\(tint\);/, 'every frame the prints take it');
assert.match(head, /impactDecals\.material\.color\.copy\(tint\);/, 'the hull scars take it');
assert.match(head, /atgmBodyMat\.color\.copy\(tint\);/, "a missile's body takes it");
assert.doesNotMatch(head, /atgmFlareMat\.color\.copy/, "a motor's flare stays emissive");
// the tint itself: white on a clear noon rig, dim at night (the snow print and the foam stop glowing)
const lin = (h) => new THREE.Color(h); // hex is read as sRGB into the linear working space
const noon = battleLightTintForRig({ sunIntensity: 4.5, sunColor: lin(0xfff1dc), hemiIntensity: 0.36, hemiSky: lin(0xaac8f5),
  hemiGround: lin(0x94815f), fillIntensity: 0.66, fillColor: lin(0xbdd2f2) }, new THREE.Color());
assert.ok(noon.r > 0.99 && noon.g > 0.99 && noon.b > 0.99, 'noon is white');
const night = battleLightTintForRig({ sunIntensity: 0.6, sunColor: lin(0x9fb4e0), hemiIntensity: 0.75, hemiSky: lin(0x1c2a4a),
  hemiGround: lin(0x0e1014), fillIntensity: 0.2, fillColor: lin(0x2a3a5a) }, new THREE.Color());
assert.ok(Math.max(night.r, night.g, night.b) < 0.45, `night is dim (${night.r.toFixed(2)} ${night.g.toFixed(2)} ${night.b.toFixed(2)})`);
console.log('timeOfDayMarks: prints, wake foam, hull scars and missile bodies take the time of day; flares stay emissive — ok');
