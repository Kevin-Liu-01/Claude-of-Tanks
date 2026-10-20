// Round 69 (2026-09-24): screen-space contact shadows — the ray-march step table, the march length ramp, the
// range fade, the occlusion law, the sun-share blend (the term that keeps a cascade-shadowed pixel untouched), the
// GLSL contract inside the aerial pass and the alpha channel that carries the CSM visibility from lighting.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  CONTACT_SHADOW_ALPHA_OPAQUE, CONTACT_SHADOW_FADE_M, CONTACT_SHADOW_GLSL, CONTACT_SHADOW_SEAM_M, CONTACT_SHADOW_MIN_PX,
  CONTACT_SHADOW_SOFT_RISE, CONTACT_SHADOW_SOFT_FALL, CONTACT_SHADOW_PENUMBRA, CONTACT_SHADOW_CLOUD_MIN, contactShadowSoftHit,
  contactShadowMarch, contactShadowPenumbraFade,
  CONTACT_SHADOW_RANGE_M, CONTACT_SHADOW_MAX_SCREEN_PX, contactShadowBoundedLength, contactShadowProjectedStep,
  CONTACT_SHADOW_STEPS, CONTACT_SHADOW_STRENGTH, CONTACT_SHADOW_TAIL_FADE, CONTACT_SHADOW_WIDTH_M,
  CONTACT_SHADOW_WIDTH_PER_M, CONTACT_SHADOW_WIDTH_PX, contactShadowMarchLength,
  contactShadowOcclusion, contactShadowRangeFade, contactShadowStepParameter, contactShadowStepTable, contactShadowSurfaceSupport,
  contactShadowSunShare, contactShadowSunVisibility, createContactShadowUniforms, updateContactShadowUniforms,
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

// 2. march length (contact r6, 2026-10-14; the shadow-quality plan's C5): the cascades' residual seam in metres at every
// distance (the shadow pass publishes it; High's estimate until then), never the old 0.55-1.4 m screen-space shadow
for (const d of [0, 4, 22, 40, 80]) assert.equal(contactShadowMarchLength(d), CONTACT_SHADOW_SEAM_M, `the seam at ${d} m`);
assert.equal(contactShadowMarchLength(10, 0.11), 0.11, 'the published seam');
assert.ok(CONTACT_SHADOW_SEAM_M >= 0.08 && CONTACT_SHADOW_SEAM_M <= 0.25, 'about a bias and a cascade-0 texel');
assert.ok(CONTACT_SHADOW_MIN_PX >= 1 && CONTACT_SHADOW_MIN_PX < CONTACT_SHADOW_MAX_SCREEN_PX, 'a pixel floor under the cap');

// Project actual 3D rays independently of the cap equation. Scope FOV, near-plane
// crossings and sun directions toward/away from the camera must preserve the
// eight-pixel endpoint and every ~one-pixel sample gap, without adding samples.
assert.equal(CONTACT_SHADOW_MAX_SCREEN_PX, 8);
let projectedRays = 0;
for (const [width, height] of [[640, 360], [1920, 1080], [3840, 2160], [800, 1200]]) {
  for (const fov of [2.4, 15, 55, 110]) {
    const camera = new THREE.PerspectiveCamera(fov, width / height, .1, 4000);
    for (const position of [[0, 0, -.11], [.1, -.1, -.5], [2, .2, -3], [10, -2, -40], [40, 0, -80]]) {
      const start = new THREE.Vector3(...position);
      const clip = new THREE.Vector4(...position, 1).applyMatrix4(camera.projectionMatrix);
      const direction = new THREE.Vector3();
      const screenAt = t => {
        const p = start.clone().addScaledVector(direction, t);
        const c = new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(camera.projectionMatrix);
        assert.ok(c.w >= camera.near - 1e-9, 'ray stays in front of near plane');
        return new THREE.Vector2(c.x / c.w * width / 2, c.y / c.w * height / 2);
      };
      for (const vector of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1], [.1, .3, 1], [1, .5, -1], [-1, 1, .7]]) {
        direction.set(...vector).normalize();
        const delta = new THREE.Vector4(direction.x, direction.y, direction.z, 0).applyMatrix4(camera.projectionMatrix);
        const slope = Math.hypot((delta.x - clip.x * delta.w / clip.w) * width / 2,
          (delta.y - clip.y * delta.w / clip.w) * height / 2);
        const original = contactShadowMarchLength(-start.z);
        const length = contactShadowBoundedLength(original, clip.w, delta.w, slope, camera.near);
        const floorDen = slope - CONTACT_SHADOW_MIN_PX * delta.w;
        const floor = floorDen > 0 ? CONTACT_SHADOW_MIN_PX * clip.w / floorDen : 0;
        assert.ok(length >= 0 && length <= Math.max(original, floor) + 1e-12, 'only the pixel floor extends the seam');
        const origin = screenAt(0), end = screenAt(length);
        assert.ok(end.distanceTo(origin) <= 8 + 1e-8, 'exact perspective endpoint <= eight pixels');
        const nearBound = delta.w < 0 ? (clip.w - camera.near) / -delta.w : Infinity;
        if (floorDen > 0 && nearBound > floor) {
          assert.ok(end.distanceTo(origin) >= Math.min(CONTACT_SHADOW_MIN_PX, 8) - 1e-6, 'at least the pixel floor on screen');
        }
        let last = origin, previousDistance = 0;
        for (const u of [...contactShadowStepTable(), 1]) {
          const distance = contactShadowProjectedStep(u, length, clip.w, delta.w);
          assert.ok(distance >= previousDistance - 1e-12 && distance <= length + 1e-12, 'ordered world samples inside ray');
          const screen = screenAt(distance);
          assert.ok(screen.distanceTo(last) <= 1.06 + 1e-8, 'no uncovered large gap between projected samples');
          assert.ok(screen.distanceTo(origin.clone().lerp(end, u)) <= 1e-8, 'quadratic fractions are exact in screen space');
          last = screen; previousDistance = distance;
        }
        projectedRays++;
      }
    }
  }
}
assert.equal(projectedRays, 560);
assert.equal(contactShadowBoundedLength(1, .05, -1, 100, .1), 0, 'receiver behind near plane is skipped');
{
  const project = t => 100 * t / (1 + t);
  assert.ok(project(8 / project(1)) > 8, 'old linear ratio demonstrably overshoots under perspective');
  assert.ok(near(project(contactShadowBoundedLength(1, 1, 1, 100, .1)), 8), 'exact cap reaches eight pixels');
  assert.ok(near(project(contactShadowBoundedLength(0.001, 1, 1, 100, .1)), CONTACT_SHADOW_MIN_PX), 'a sub-pixel seam reaches the floor');
}

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

// 4b. (contact r6) the soft hit: a rung weighs by how far behind the depth surface it lies in its window — faint where it
// only grazes (gravel, cobbles: the crawl), whole in the window's body, gone at the thickness (no hard rim at either end)
{
  const bias = 0.045, thick = 0.25, span = thick - bias;
  assert.equal(contactShadowSoftHit(bias, bias, thick), 0, 'at the bias: none');
  assert.equal(contactShadowSoftHit(thick, bias, thick), 0, 'at the thickness: none');
  assert.equal(contactShadowSoftHit(bias + 0.5 * span, bias, thick), 1, 'in the body: whole');
  assert.ok(contactShadowSoftHit(bias + 0.1 * CONTACT_SHADOW_SOFT_RISE * span, bias, thick) < 0.05, 'a graze is faint');
  let worst = 0, prev = 0;
  for (let d = bias - 0.01; d <= thick + 0.01; d += span / 400) {
    const v = contactShadowSoftHit(d, bias, thick); worst = Math.max(worst, Math.abs(v - prev)); prev = v;
  }
  assert.ok(worst < 0.03, `continuous across the window (worst step ${worst.toFixed(4)})`);
  assert.ok(CONTACT_SHADOW_SOFT_RISE + CONTACT_SHADOW_SOFT_FALL < 1, 'a body between the ramps');
  // the march keeps the strongest rung (its tail fade on it) and stops at a whole one
  near(contactShadowMarch([[0.1, 0.2], [0.2, 1], [0.3, 0.5]], 0.8), 0.8, 1e-12);
  assert.equal(contactShadowMarch([[0.1, 0.2], [0.2, 1], [0.3, 0.5]], 0.8), contactShadowMarch([[0.1, 0.2], [0.2, 1]], 0.8), 'stops at a whole rung');
  near(contactShadowMarch([[0.1, 0.3], [0.9, 0.6]], 1), Math.max(0.3, 0.6 * contactShadowOcclusion(0.9)), 1e-12, 'the tail fades a late rung');
  assert.equal(contactShadowMarch([], 1), 0);
}

// 4c. (contact r6) the cascades' penumbra: the term fades inside it only, the cloud's share divided out of the alpha's
// visibility first (a cloud-shaded pixel the cascades light whole keeps the whole term); main's law under a deep cloud
{
  const [p0, p1] = CONTACT_SHADOW_PENUMBRA;
  assert.equal(contactShadowPenumbraFade(1, 1), 1, 'lit by the cascades, no cloud: whole');
  assert.equal(contactShadowPenumbraFade(0.4, 0.4), 1, 'under a cloud (0.4), lit by the cascades: whole (main 0.4 read as penumbra)');
  assert.equal(contactShadowPenumbraFade(p1, 1), 1); assert.equal(contactShadowPenumbraFade(p0, 1), 0);
  assert.ok(contactShadowPenumbraFade(0.5, 1) > 0.4 && contactShadowPenumbraFade(0.5, 1) < 0.6, 'half in the penumbra: about half');
  near(contactShadowPenumbraFade(0.25, 0.5), contactShadowPenumbraFade(0.5, 1), 1e-12, 'the cloud divided out');
  assert.equal(contactShadowPenumbraFade(0.05, CONTACT_SHADOW_CLOUD_MIN - 0.01), 1, 'under a deep cloud: main\'s law');
  assert.equal(contactShadowPenumbraFade(0.9, 0.5), 1, 'v / cloud clamped at one');
}

// A shallow triangulated valley must not acquire hard diagonal shadows. Real
// contacts still work: vertical hull/wall faces, undersides and an elevated roof.
for (const degrees of [0, 10, 20, 35, 45]) {
  assert.equal(contactShadowSurfaceSupport(Math.cos(degrees * Math.PI / 180), 0.08), 0,
    `a ${degrees}-degree fold of the same surface is not a contact`);
}
assert.equal(contactShadowSurfaceSupport(0, 0.02), 1, 'a wall at the ground keeps its contact');
assert.equal(contactShadowSurfaceSupport(-1, 0.04), 1, 'a hull underside keeps its contact');
assert.equal(contactShadowSurfaceSupport(1, 0.6), 1, 'a raised horizontal object can shadow the ground');
assert.ok(contactShadowSurfaceSupport(0.5, 0.08) > 0 && contactShadowSurfaceSupport(0.5, 0.08) < 1,
  'the corner transition is continuous');

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
  // (contact r6) the seam: High's estimate until the shadow pass publishes one; the cloud share off without the map
  assert.equal(u.uContactSeam.value, CONTACT_SHADOW_SEAM_M);
  assert.equal(u.uCotCloudShade.value.w, 0, 'no cloud map: the share is one');
  scene.userData.lightRig.contactSeamM = 0.12;
  const cloud = { tCotCloudShade: { value: new THREE.Texture() }, uCotCloudShade: { value: new THREE.Vector4(10, 20, 1 / 12000, 1) },
    uCotCloudSun: { value: new THREE.Vector4(0.3, 0.8, 0.1, 1500) } };
  scene.userData.cloudShadeUniforms = cloud;
  updateContactShadowUniforms(u, camera, scene, true);
  assert.equal(u.uContactSeam.value, 0.12, 'the published seam');
  assert.ok(u.tCotCloudShade.value === cloud.tCotCloudShade.value, 'the lit materials\' cloud map');
  assert.deepEqual(u.uCotCloudShade.value.toArray(), [10, 20, 1 / 12000, 1]);
  assert.deepEqual(u.uCotCloudSun.value.toArray(), cloud.uCotCloudSun.value.toArray());
  // the QA lever: main's march for an A/B frame (its ramp, the binary hit, no fade)
  globalThis.__LIGHT_TUNE = { CONTACT_R6: 0 };
  updateContactShadowUniforms(u, camera, scene, true);
  assert.ok(u.uContactSeam.value < 0 && u.uContactR6.value === 0, 'the lever restores main\'s march');
  delete globalThis.__LIGHT_TUNE;
  delete scene.userData.cloudShadeUniforms; delete scene.userData.lightRig.contactSeamM;
  updateContactShadowUniforms(u, camera, scene, true);
  assert.equal(u.uContactR6.value, 1, 'shipped on');
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
assert.match(CONTACT_SHADOW_GLSL, /float s = \( float\( i \) \+ 0\.5 \) \/ 12\.0000;/, 'stable half-step phase');
assert.doesNotMatch(CONTACT_SHADOW_GLSL, /gl_FragCoord|float jitter/, 'no screen-space dither streaks');
assert.match(CONTACT_SHADOW_GLSL, /vec4 c = rayStart \+ rayDir \* rayDistance;/, 'clip vectors reused at every step');
// (contact r6) the seam's length with the pixel floor under the cap, the soft hit, the strongest rung, the penumbra fade
assert.ok(CONTACT_SHADOW_GLSL.includes('uniform float uContactSeam;')
  && CONTACT_SHADOW_GLSL.includes('float len = uContactSeam >= 0.0 ? uContactSeam : mix( 0.5500, 1.4000, smoothstep( 4.0000, 40.0000, dist ) );'),
  'the seam (a negative one: main\'s ramp, the QA lever)');
assert.ok(CONTACT_SHADOW_GLSL.includes('float soft = uContactR6 < 0.5 ? 1.0 :') && CONTACT_SHADOW_GLSL.includes('|| uContactR6 < 0.5 ? 1.0'),
  'the lever restores the binary hit and drops the fade');
assert.ok(CONTACT_SHADOW_GLSL.includes(`if ( floorDenominator > 0.0 && uContactSeam >= 0.0 ) len = max( len, ${CONTACT_SHADOW_MIN_PX.toFixed(4)} * rayStart.w / floorDenominator );`)
  && CONTACT_SHADOW_GLSL.indexOf('len = max( len,') < CONTACT_SHADOW_GLSL.indexOf('len = min( len, ( rayStart.w - uNear )')
  && CONTACT_SHADOW_GLSL.indexOf('len = min( len, ( rayStart.w - uNear )') < CONTACT_SHADOW_GLSL.indexOf(`len = min( len, ${CONTACT_SHADOW_MAX_SCREEN_PX.toFixed(4)} * rayStart.w / capDenominator );`),
  'the floor, then the near plane, then the cap');
assert.equal((CONTACT_SHADOW_GLSL.match(/mix\( 0\.5500, 1\.4000,/g) ?? []).length, 1, 'main\'s metre ramp only behind the lever');
assert.ok(CONTACT_SHADOW_GLSL.includes(`: smoothstep( bias, bias + ${CONTACT_SHADOW_SOFT_RISE.toFixed(4)} * span, diff )`)
  && CONTACT_SHADOW_GLSL.includes(`* ( 1.0 - smoothstep( thick - ${CONTACT_SHADOW_SOFT_FALL.toFixed(4)} * span, thick, diff ) );`), 'the soft hit');
assert.ok(CONTACT_SHADOW_GLSL.includes(`best = max( best, support * soft * ( 1.0 - smoothstep( ${CONTACT_SHADOW_TAIL_FADE.toFixed(4)}, 1.0, u ) ) );`)
  && CONTACT_SHADOW_GLSL.includes('if ( soft >= 0.99 ) break;') && CONTACT_SHADOW_GLSL.includes('return best;'), 'the strongest rung, the tail fade');
assert.equal((CONTACT_SHADOW_GLSL.match(/cotNormalAt\( quv, Q \)/g) ?? []).length, 1, 'the occluder confirmed once (cost neutral)');
assert.ok(CONTACT_SHADOW_GLSL.includes('if ( support < 0.0 ) {'), 'only until one rung confirms');
assert.ok(CONTACT_SHADOW_GLSL.includes('float cloud = cotCloudSun( P );')
  && CONTACT_SHADOW_GLSL.includes(`float penumbra = cloud < ${CONTACT_SHADOW_CLOUD_MIN.toFixed(4)} || uContactR6 < 0.5 ? 1.0`)
  && CONTACT_SHADOW_GLSL.includes(`: smoothstep( ${CONTACT_SHADOW_PENUMBRA[0].toFixed(4)}, ${CONTACT_SHADOW_PENUMBRA[1].toFixed(4)}, clamp( sunVis / cloud, 0.0, 1.0 ) );`)
  && CONTACT_SHADOW_GLSL.includes('float occ = cotContactOcclusion( P, N, dist ) * penumbra'), 'the penumbra fade, the cloud divided out');
assert.ok(CONTACT_SHADOW_GLSL.includes('uniform sampler2D tCotCloudShade;') && CONTACT_SHADOW_GLSL.includes('float cotCloudSun( vec3 wp ) {'),
  'the lit materials\' own cloud lookup (cloudShadeMap.ts)');
assert.ok(CONTACT_SHADOW_GLSL.includes(`${(CONTACT_SHADOW_RANGE_M - CONTACT_SHADOW_FADE_M).toFixed(4)}, ${CONTACT_SHADOW_RANGE_M.toFixed(4)}, dist`), 'the same range fade');
assert.ok(CONTACT_SHADOW_GLSL.includes(`occ * share * ${CONTACT_SHADOW_STRENGTH.toFixed(4)}`), 'the strength');
assert.match(CONTACT_SHADOW_GLSL, /float share = T \/ \( T \+ amb \);/, 'T / (T + A)');
assert.match(CONTACT_SHADOW_GLSL, /if \( diff > bias && diff < thick && texture2D\( tDiffuse, quv \)\.a >= /, 'bias below, thickness above, an opaque lit occluder');
assert.match(CONTACT_SHADOW_GLSL, /if \( abs\( dl - occ \) < wide && abs\( dr - occ \) < wide \) \{/,
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
// owner 2026-10-02: the vehicle cavity occlusion reads the same sun / ambient uniforms, so they refresh for either lever
// (2026-10-03, the skies-and-atmosphere lane: and the far cloud shadows, which take a far pixel's sun share by the same law)
assert.match(post, /updateContactShadowUniforms\(aerial\.uniforms, camera, scene, lightFx\.contactShadows,\s*lightFx\.contactShadows \|\| lightFx\.vehicleOcclusion\);/,
  'per-frame refresh follows the lever');

const lighting = readFileSync(new URL('./lighting.ts', import.meta.url), 'utf8');
assert.match(lighting, /#define COT_SUN_VIS_CAPTURED 1\nfloat cotSunVis = 1\.0;/, 'the capture marks itself for the alpha write');
// (2026-10-14, contact r2) the terrain alone (COT_SNOW_COVER) writes a snowy pixel's visibility in the snow band between the lit
// band and the vehicles' (sceneAlpha.ts, pinned by sceneAlpha.selftest); every other material writes 2 + v as before
assert.match(lighting, /#if defined\( COT_SUN_VIS_CAPTURED \) && defined\( OPAQUE \) && defined\( USE_CSM \)\n#ifdef COT_SNOW_COVER\n[\s\S]*?\n#else\ngl_FragColor\.a = 2\.0 \+ cotSunVis;\n#endif\n#endif/,
  'opaque CSM pixels write two plus their sun visibility into alpha (cards, water and glass stay below 1.5)');
assert.ok(near(contactShadowSunVisibility(3.05 + 2 * 0.15 + 0.4 * 0.14), 0.4) && contactShadowSunVisibility(3.05) === 0,
  'decode: a snowy terrain pixel\'s visibility in the snow band');
assert.equal(contactShadowSunVisibility(2.0), 0, 'decode: an opaque pixel in cascade shadow');
assert.equal(contactShadowSunVisibility(3.0), 1, 'decode: a sunlit opaque pixel');
assert.ok(near(contactShadowSunVisibility(2.4), 0.4), 'decode: a penumbra pixel');
assert.equal(contactShadowSunVisibility(1.0), -1, 'decode: an unlit material or the sky is no receiver');
assert.equal(contactShadowSunVisibility(0.7), -1, 'decode: a grass card (its coverage alpha) is no receiver');
assert.ok(near(contactShadowSunVisibility(4.4), 0.4), 'decode: a vehicle pixel (4 + v, vehicleOcclusion.ts) keeps its own visibility');
assert.equal(contactShadowSunVisibility(5.0), 1, 'decode: a sunlit vehicle pixel');
assert.equal(CONTACT_SHADOW_ALPHA_OPAQUE, 1.5);
assert.match(CONTACT_SHADOW_GLSL, /texture2D\( tDiffuse, quv \)\.a >= 1\.5000/, 'an occluder must be an opaque lit surface: cards never cast');
assert.match(CONTACT_SHADOW_GLSL, /float sunVis = cotSunVisOf\( alpha \);\s*if \( sunVis <= 0\.02 \) return 1\.0;/, 'a card or shadowed receiver returns before the normal taps');
assert.match(lighting, /const opaqueAnchor = 'gl_FragColor = vec4\( outgoingLight, diffuseColor\.a \);';/, 'anchored on the chunk\'s own write');
assert.match(lighting, /scene\.userData\.lightRig = lightRig;/, 'the rig is published for the post chain');
const renderer = readFileSync(new URL('./renderer.ts', import.meta.url), 'utf8');
assert.doesNotMatch(renderer, /alpha:\s*true/, 'the canvas stays opaque: the alpha channel is free for the carrier');
const chunk = readFileSync(new URL('../../node_modules/three/src/renderers/shaders/ShaderChunk/opaque_fragment.glsl.js', import.meta.url), 'utf8');
assert.ok(chunk.includes('gl_FragColor = vec4( outgoingLight, diffuseColor.a );'), 'the pinned Three chunk still writes alpha here');

console.log('contactShadows.selftest: step table, the seam length with its pixel floor (contact r6), range fade, occlusion, the soft hit and the strongest rung, the penumbra fade with the cloud divided out, sun share, uniforms, GLSL contract and the alpha carrier pinned');
