// Round 69 (2026-09-24): screen-space contact shadows — the ray-march step table, the march length ramp, the
// range fade, the occlusion law, the sun-share blend (the term that keeps a cascade-shadowed pixel untouched), the
// GLSL contract inside the aerial pass and the alpha channel that carries the CSM visibility from lighting.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  CONTACT_SHADOW_FADE_M, CONTACT_SHADOW_FAR_M, CONTACT_SHADOW_GLSL, CONTACT_SHADOW_NEAR_M, CONTACT_SHADOW_RANGE_M,
  CONTACT_SHADOW_STEPS, CONTACT_SHADOW_STRENGTH, CONTACT_SHADOW_TAIL_FADE, CONTACT_SHADOW_WIDTH_M,
  CONTACT_SHADOW_WIDTH_PER_M, CONTACT_SHADOW_WIDTH_PX, contactShadowMarchLength,
  contactShadowOcclusion, contactShadowRangeFade, contactShadowStepParameter, contactShadowStepTable,
  contactShadowSunShare, createContactShadowUniforms, updateContactShadowUniforms,
} from './contactShadows.ts';

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// 1. the step table: twelve rungs, inside the ray, strictly increasing, quadratic (each spacing wider than the last)
assert.equal(CONTACT_SHADOW_STEPS, 12);
for (const jitter of [0, 0.25, 0.5, 0.999]) {
  const table = contactShadowStepTable(jitter);
  assert.equal(table.length, CONTACT_SHADOW_STEPS);
  assert.ok(table.every((u) => u >= 0 && u <= 1), `inside the ray (jitter ${jitter})`);
  for (let i = 1; i < table.length; i++) assert.ok(table[i] > table[i - 1], 'strictly increasing');
  for (let i = 2; i < table.length; i++) {
    assert.ok(table[i] - table[i - 1] > table[i - 1] - table[i - 2] - 1e-12, 'spacing widens along the ray (dense at the contact)');
  }
}
assert.ok(contactShadowStepParameter(0, 0.5) < 0.02, 'the first rung sits within two percent of the ray (the seam)');
assert.ok(contactShadowStepParameter(CONTACT_SHADOW_STEPS - 1, 0.999) > 0.999, 'the last rung reaches the ray end');
assert.ok(near(contactShadowStepParameter(0, 0.5), (0.5 / 12) * (0.3 + 0.7 * (0.5 / 12))), 'u = s · (0.3 + 0.7 s)');
console.log('contactShadows.selftest: step table (jitter 0.5)', contactShadowStepTable(0.5).map((u) => u.toFixed(3)).join(' '));

// 2. march length: 0.55 m near, 1.4 m from 40 m, monotone between
assert.equal(contactShadowMarchLength(0), CONTACT_SHADOW_NEAR_M);
assert.equal(contactShadowMarchLength(4), CONTACT_SHADOW_NEAR_M);
assert.equal(contactShadowMarchLength(40), CONTACT_SHADOW_FAR_M);
assert.equal(contactShadowMarchLength(80), CONTACT_SHADOW_FAR_M);
let previous = 0;
for (let d = 0; d <= 60; d += 1) { const l = contactShadowMarchLength(d); assert.ok(l >= previous); previous = l; }
assert.ok(near(contactShadowMarchLength(22), (CONTACT_SHADOW_NEAR_M + CONTACT_SHADOW_FAR_M) / 2, 1e-9), 'midpoint of the ramp');

// 3. range fade: full to 65 m, gone at 90 m
assert.equal(contactShadowRangeFade(10), 1);
assert.equal(contactShadowRangeFade(CONTACT_SHADOW_RANGE_M - CONTACT_SHADOW_FADE_M), 1);
assert.equal(contactShadowRangeFade(CONTACT_SHADOW_RANGE_M), 0);
assert.ok(contactShadowRangeFade(80) > 0 && contactShadowRangeFade(80) < 1);

// 4. occlusion from the first occluded rung: hard up to the tail, faded to zero at the ray end, none past it
assert.equal(contactShadowOcclusion(2), 0);
assert.equal(contactShadowOcclusion(Number.NaN), 0);
assert.equal(contactShadowOcclusion(0.2), 1);
assert.equal(contactShadowOcclusion(CONTACT_SHADOW_TAIL_FADE), 1);
assert.equal(contactShadowOcclusion(1), 0);
assert.ok(contactShadowOcclusion(0.8) > 0 && contactShadowOcclusion(0.8) < 1);

// 5. the sun share: the fraction of the pixel's light that is sun — what an occluded pixel loses
const amb = { sky: 0.4, ground: 0.25, env: 0.3, fill: 0.5 };
assert.equal(contactShadowSunShare(0.8, 0, 4.3, amb, 0.9, 0), 0, 'a cascade-shadowed pixel keeps everything');
assert.equal(contactShadowSunShare(-0.2, 1, 4.3, amb, 0.9, 0), 0, 'a face turned from the sun has no sun to lose');
assert.equal(contactShadowSunShare(0.8, 1, 0, amb, 0.9, 0), 0, 'no sun, no share');
{
  const lit = contactShadowSunShare(1, 1, 4.3, amb, 1, 0);
  assert.ok(lit > 0.8 && lit < 1, `a sunlit up-facing pixel under this rig is mostly sun (${lit.toFixed(3)})`);
  assert.ok(near(lit, 4.3 / (4.3 + amb.sky + amb.env)), 'T / (T + A) with the sky pole for an up-facing normal');
  const grazing = contactShadowSunShare(0.15, 1, 4.3, amb, 1, 0);
  assert.ok(grazing < lit, 'less sun at grazing incidence');
  const half = contactShadowSunShare(1, 0.5, 4.3, amb, 1, 0);
  assert.ok(half < lit && half > 0, 'a penumbra pixel loses proportionally less');
  const down = contactShadowSunShare(1, 1, 4.3, amb, -1, 1);
  assert.ok(near(down, 4.3 / (4.3 + amb.ground + amb.env + amb.fill)), 'ground pole and full fill for a down-facing normal');
  let last = 0;
  for (let n = 0.05; n <= 1; n += 0.05) { const s = contactShadowSunShare(n, 1, 4.3, amb, 0.5, 0.2); assert.ok(s >= last); last = s; }
}

// 6. uniforms from the published rig
{
  const u = createContactShadowUniforms();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 4000);
  camera.position.set(3, 2, 1);
  camera.lookAt(0, 0, -10);
  camera.updateMatrixWorld();
  updateContactShadowUniforms(u, camera, scene, false);
  assert.equal(u.uContact.value, 0);
  scene.userData.lightRig = {
    sunIntensity: 4.2, sunColor: new THREE.Color(0xfff1dc), hemiIntensity: 0.5, hemiSky: new THREE.Color(0xaac8f5),
    hemiGround: new THREE.Color(0x94815f), fillIntensity: 0.66, fillColor: new THREE.Color(0xbdd2f2), fillDir: new THREE.Vector3(2, 1, 0),
  };
  scene.userData.skyIrradiance = new THREE.Color(0.3, 0.4, 0.6);
  scene.environmentIntensity = 0.3;
  updateContactShadowUniforms(u, camera, scene, true);
  assert.equal(u.uContact.value, 1);
  const c = new THREE.Color(0xfff1dc);
  assert.ok(near(u.uContactSunLum.value, 4.2 * (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b), 1e-6), 'sun luminance = intensity × colour luma');
  assert.ok(near(u.uContactFillDir.value.length(), 1, 1e-6), 'the fill direction is unit');
  const expected = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  assert.deepEqual(u.uContactViewProj.value.elements, expected.elements, 'the frame view-projection');
  const irr = 0.2126 * 0.3 + 0.7152 * 0.4 + 0.0722 * 0.6;
  assert.ok(near(u.uContactAmb.value.z, (irr + 0.5) * 0.3, 1e-6), 'environment: sky irradiance plus the disc fill, × intensity');
  assert.ok(u.uContactAmb.value.x > 0 && u.uContactAmb.value.y > 0 && u.uContactAmb.value.w > 0);
}

// 7. the GLSL contract and the wiring
assert.match(CONTACT_SHADOW_GLSL, new RegExp(`for \\( int i = 0; i < ${CONTACT_SHADOW_STEPS}; i\\+\\+ \\)`), 'twelve rungs');
assert.ok(CONTACT_SHADOW_GLSL.includes('float u = s * ( 0.3 + 0.7 * s );'), 'the shader walks the same table');
assert.ok(CONTACT_SHADOW_GLSL.includes(`mix( ${CONTACT_SHADOW_NEAR_M.toFixed(4)}, ${CONTACT_SHADOW_FAR_M.toFixed(4)},`), 'the same length ramp');
assert.ok(CONTACT_SHADOW_GLSL.includes(`smoothstep( ${CONTACT_SHADOW_TAIL_FADE.toFixed(4)}, 1.0, hit )`), 'the same tail fade');
assert.ok(CONTACT_SHADOW_GLSL.includes(`${(CONTACT_SHADOW_RANGE_M - CONTACT_SHADOW_FADE_M).toFixed(4)}, ${CONTACT_SHADOW_RANGE_M.toFixed(4)}, dist`), 'the same range fade');
assert.ok(CONTACT_SHADOW_GLSL.includes(`occ * share * ${CONTACT_SHADOW_STRENGTH.toFixed(4)}`), 'the strength');
assert.match(CONTACT_SHADOW_GLSL, /float share = T \/ \( T \+ amb \);/, 'T / (T + A)');
assert.match(CONTACT_SHADOW_GLSL, /if \( diff > bias && diff < thick \) \{/, 'bias below, thickness above');
assert.match(CONTACT_SHADOW_GLSL, /if \( abs\( dl - occ \) < wide && abs\( dr - occ \) < wide \) \{ hit = u; break; \}/,
  'only a wide occluder counts (grass blades and wires, a few pixels wide, never cast in the cascades)');
assert.ok(CONTACT_SHADOW_GLSL.includes(`uInvSize.x * ${CONTACT_SHADOW_WIDTH_PX.toFixed(4)}`), 'the width test spans five pixels either side');
assert.ok(CONTACT_SHADOW_GLSL.includes(`${CONTACT_SHADOW_WIDTH_M.toFixed(4)} + occ * ${CONTACT_SHADOW_WIDTH_PER_M.toFixed(4)}`), 'the same-surface tolerance grows with distance');
assert.match(CONTACT_SHADOW_GLSL, /clamp\( sunVis, 0\.0, 1\.0 \)/, 'the CSM visibility gates the sun term');
assert.match(CONTACT_SHADOW_GLSL, /cross\( dx, dy \)/, 'best-pair normal from the depth neighbours');

const post = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
const aerialStart = post.indexOf('const AerialShader = {');
const aerialEnd = post.indexOf('const GradeShader = {', aerialStart);
const aerial = post.slice(aerialStart, aerialEnd);
assert.ok(aerial.includes('...createContactShadowUniforms(),'), 'the aerial pass carries the uniforms');
const includeAt = aerial.indexOf('${CONTACT_SHADOW_GLSL}');
assert.ok(includeAt > aerial.indexOf('uniform float uFirefly;'), 'the block follows every declaration it uses');
assert.ok(includeAt < aerial.indexOf('vec4 texel = texture2D( tDiffuse, vUv );'), 'and precedes the fragment main');
const rayTAt = aerial.indexOf('float rayT = -viewZ / max( dot( ray, uCamFwd ), 0.05 );');
const shadeAt = aerial.indexOf(`if ( uContact > 0.5 && -viewZ < \${CONTACT_SHADOW_RANGE_M.toFixed(1)} ) {`);
const extinctionAt = aerial.indexOf('texel.rgb = mix( texel.rgb, hazy, f );');
assert.ok(rayTAt > 0 && shadeAt > rayTAt && shadeAt < extinctionAt, 'the shade lands after the world position and before the haze');
assert.ok(aerial.includes('texel.rgb *= cotContactShade( vUv, uCamPos + ray * rayT, -viewZ, texel.a );'), 'the alpha channel is the CSM visibility');
const resetAt = aerial.indexOf('texel.a = 1.0;');
assert.ok(resetAt > shadeAt && resetAt < aerial.indexOf('gl_FragColor = texel;'), 'the alpha is restored to one before the chain continues');
assert.match(post, /updateContactShadowUniforms\(aerial\.uniforms, camera, scene, lightFx\.contactShadows\);/, 'per-frame refresh follows the lever');

const lighting = readFileSync(new URL('./lighting.ts', import.meta.url), 'utf8');
assert.match(lighting, /#define COT_SUN_VIS_CAPTURED 1\nfloat cotSunVis = 1\.0;/, 'the capture marks itself for the alpha write');
assert.match(lighting, /#if defined\( COT_SUN_VIS_CAPTURED \) && defined\( OPAQUE \) && defined\( USE_CSM \)\ngl_FragColor\.a = cotSunVis;\n#endif/,
  'opaque CSM pixels write their sun visibility into alpha');
assert.match(lighting, /const opaqueAnchor = 'gl_FragColor = vec4\( outgoingLight, diffuseColor\.a \);';/, 'anchored on the chunk\'s own write');
assert.match(lighting, /scene\.userData\.lightRig = lightRig;/, 'the rig is published for the post chain');
const renderer = readFileSync(new URL('./renderer.ts', import.meta.url), 'utf8');
assert.doesNotMatch(renderer, /alpha:\s*true/, 'the canvas stays opaque: the alpha channel is free for the carrier');
const chunk = readFileSync(new URL('../../node_modules/three/src/renderers/shaders/ShaderChunk/opaque_fragment.glsl.js', import.meta.url), 'utf8');
assert.ok(chunk.includes('gl_FragColor = vec4( outgoingLight, diffuseColor.a );'), 'the pinned Three chunk still writes alpha here');

console.log('contactShadows.selftest: step table, length ramp, range fade, occlusion, sun share, uniforms, GLSL contract and the alpha carrier pinned');
