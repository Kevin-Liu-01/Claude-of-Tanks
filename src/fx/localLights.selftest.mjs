// (EF.10, MASTER 19) headlights and fires light the smoke: the per-frame local light slots (localLights.ts), their
// GLSL, and the three readers (the pooled puffs, the volume media, effects' per-frame gathering).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { LOCAL_LIGHT_SLOTS, LOCAL_LIGHT_GLSL, localLightUniforms as U, beginLocalLights, addLocalPoint, addLocalSpot,
  endLocalLights, LOCAL_LIGHTS_DEFINE, registerLocalLightMaterial, localLightsForPreset, setLocalLightsCompiled,
  localLightsCompiled } from './localLights.ts';

const white = new THREE.Color(1, 1, 1);
beginLocalLights();
assert.equal(addLocalPoint(0, 1, 0, 10, white, 2), true);
assert.equal(addLocalPoint(0, 1, 0, 10, white, 2, true), true, 'a burst pulse');
assert.equal(addLocalSpot(5, 1, 0, 40, white, 1.4, 0, 0, 2, Math.cos(0.43), Math.cos(0.43 * 0.3)), true);
assert.equal(addLocalPoint(0, 0, 0, 0, white, 1), false, 'no range, no light');
assert.equal(endLocalLights(), 3);
assert.equal(U.uLocalP.value[1].w, -10, 'a burst is flagged by a negative range');
assert.equal(U.uLocalD.value[0].w, -2, 'a point light has no cone');
assert.ok(Math.abs(U.uLocalD.value[2].z - 1) < 1e-9, 'the spot axis is unit');
for (let i = 3; i < LOCAL_LIGHT_SLOTS; i++) assert.equal(U.uLocalP.value[i].w, 0, 'the rest are empty');
// the slots fill and refuse past their count; a new frame empties them
beginLocalLights();
let n = 0; while (addLocalPoint(0, 0, 0, 5, white, 1)) n++;
assert.equal(n, LOCAL_LIGHT_SLOTS);
beginLocalLights(); assert.equal(endLocalLights(), 0); assert.equal(U.uLocalP.value[0].w, 0);

// the GLSL's light, mirrored: the medium in a headlight's beam is lit, beside it is not; a point light falls off to its range
assert.match(LOCAL_LIGHT_GLSL, /float att = 1\.0 - dist \/ range;\s*att \*= att;/);
assert.match(LOCAL_LIGHT_GLSL, /float cone = ld\.w < -1\.5 \? 1\.0 : smoothstep\( ld\.w, lc\.w, dot\( d \/ max\( dist, 1e-3 \), ld\.xyz \) \);/);
assert.match(LOCAL_LIGHT_GLSL, /if \( lp\.w == 0\.0 \|\| \( lp\.w < 0\.0 && skipBursts > 0\.5 \) \) continue;/, 'the media skip a burst pulse');
const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const spotAt = (p, cosO, cosI) => { const d = Math.hypot(...p); const att = (1 - d / 40) ** 2; return att * sst(cosO, cosI, p[2] / d); };
const cO = Math.cos(0.43), cI = Math.cos(0.43 * 0.3);
assert.ok(spotAt([0, 0, 10], cO, cI) > 0.5, 'dust 10 m down the beam is lit');
assert.ok(spotAt([8, 0, 10], cO, cI) === 0, 'dust beside the beam is not');

// the readers
const parts = await readFile(new URL('./particles.ts', import.meta.url), 'utf8');
assert.match(parts, /vEmit \+= vColor\.rgb \* localLightAt\( wpos, 0\.0 \);/, 'the pooled puffs take the local light');
assert.match(parts, /\}, localLightUniforms\),/, 'their materials hold the shared slots');
const media = await readFile(new URL('./volumeMedia.ts', import.meta.url), 'utf8');
assert.match(media, /vLocal = localLightAt\( wpos, 1\.0 \);/, 'the media take it at each corner, the bursts skipped');
assert.match(media, /col \+= vColor\.rgb \* vLocal \* \( 0\.35 \+ 0\.65 \* cov \);/, 'scattered in the medium\'s own colour');
assert.match(media, /\.\.\.localLightUniforms,/, 'the media material holds the shared slots');
const fx = await readFile(new URL('./effects.ts', import.meta.url), 'utf8');
assert.match(fx, /updateWreckLight\(\);\s*writeLocalLights\(\);/, 'gathered every frame after the wreck light');
assert.match(fx, /nightPool = scene\.getObjectByName\('night-light-pool'\) \?\? null;/, 'the headlights come from the night pool');
// tier gating (the coordinator: Low and Ultra Low compile the loop out, a variant, never a runtime branch)
for (const p of ['ultralow', 'low', 'mobile-low', 'mobile-ultralow']) assert.equal(localLightsForPreset(p), false, `${p} skips the loop`);
for (const p of ['medium', 'high', 'ultra', 'mobile', 'mobile-high']) assert.equal(localLightsForPreset(p), true, `${p} compiles it`);
const mat = new THREE.ShaderMaterial({ defines: { FX_LIGHT_TINT: '' } });
registerLocalLightMaterial(mat);
assert.ok(LOCAL_LIGHTS_DEFINE in mat.defines && 'FX_LIGHT_TINT' in mat.defines, 'compiled in by default, other defines kept');
const v0 = mat.version;
assert.equal(setLocalLightsCompiled(false), true);
assert.ok(!(LOCAL_LIGHTS_DEFINE in mat.defines) && 'FX_LIGHT_TINT' in mat.defines && mat.version > v0, 'compiled out: a new variant');
assert.equal(localLightsCompiled(), false);
assert.equal(setLocalLightsCompiled(false), false, 'no change, no recompile');
const late = new THREE.ShaderMaterial({});
registerLocalLightMaterial(late);
assert.ok(!late.defines || !(LOCAL_LIGHTS_DEFINE in late.defines), 'a material made on Low starts compiled out');
setLocalLightsCompiled(true);
assert.ok(LOCAL_LIGHTS_DEFINE in mat.defines && LOCAL_LIGHTS_DEFINE in late.defines, 'back in on every material');
// the loop and every read of it sit under the define in both shaders; the per-frame gathering stops when it is out
assert.match(parts, /#ifdef FX_LOCAL_LIGHTS\s*\$\{LOCAL_LIGHT_GLSL\}\s*#endif/, 'the puff shader declares the loop only in the variant');
assert.match(parts, /#ifdef FX_LOCAL_LIGHTS\s*vEmit \+= vColor\.rgb \* localLightAt\( wpos, 0\.0 \);\s*#endif/, 'and reads it only there');
assert.match(media, /#ifdef FX_LOCAL_LIGHTS\s*varying vec3 vLocal;[^#]*\$\{LOCAL_LIGHT_GLSL\}\s*#endif/, 'the media declare it only in the variant');
assert.match(media, /#ifdef FX_LOCAL_LIGHTS\s*vLocal = localLightAt\( wpos, 1\.0 \);\s*#endif/);
assert.match(media, /#ifdef FX_LOCAL_LIGHTS\s*col \+= vColor\.rgb \* vLocal \* \( 0\.35 \+ 0\.65 \* cov \);\s*#endif/);
assert.match(media, /registerLocalLightMaterial\(material\);/);
assert.match(parts, /registerLocalLightMaterial\(mat\);/);
assert.match(fx, /setLocalLightsCompiled\(localLightsForPreset\(resolvePresetName\(\)\)\);\s*onPresetChange\(/, 'the preset picks the variant, and every change');
assert.match(fx, /if \(!localLightsCompiled\(\)\) \{ endLocalLights\(\); return; \}/, 'no gathering when compiled out');
console.log('localLights: slots, the beam and fall-off, the readers, and the Low / Ultra Low variant — ok');
