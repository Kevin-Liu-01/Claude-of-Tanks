import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { NIGHT_EMISSION_ATTRIBUTE, NIGHT_HEADLIGHT_COLOR, NIGHT_RED_DISPLAY_LEVEL, NIGHT_RED_FLOOR_EXPOSURE, NIGHT_SHTORA_COLOR,
  setNightEmissionExposure, setNightEmissionMask, installNightEmissionMask } from './nightEmissionMaterial.ts';
import { EXPOSURE_KEY, EXPOSURE_MIN, NIGHT_EV, exposureFor, whiteBalanceGains } from './lightModel.ts';
import { EXPOSURE_REFERENCE_ILLUMINANCE, LEGACY_EXPOSURE, loadGroundedLightModel } from './lightModelCore.ts';

await loadGroundedLightModel(); // the exposure law (lightModel.ts) meters against the core's handed-over reference

const geometry = new THREE.BoxGeometry(1, 2, 3);
const original = geometry.getAttribute('position').array.slice();
setNightEmissionMask(geometry, 1, [2, 3]);
assert.deepEqual(geometry.getAttribute('position').array, original, 'tagging never changes geometry');
assert.equal(geometry.getAttribute(NIGHT_EMISSION_ATTRIBUTE).count, original.length / 3);
assert.deepEqual([...geometry.getAttribute(NIGHT_EMISSION_ATTRIBUTE).array].filter(Boolean), [1, 1]);
setNightEmissionMask(geometry, 0);
assert.ok([...geometry.getAttribute(NIGHT_EMISSION_ATTRIBUTE).array].every(value => value === 0));

function compileMask(options = {}) {
  const material = new THREE.MeshStandardMaterial({ emissive: 0x123456, emissiveIntensity: .37 });
  let previousCalls = 0;
  material.onBeforeCompile = shader => { previousCalls++; shader.fragmentShader += '\n// existing material hook'; };
  material.customProgramCacheKey = () => 'authored-base';
  const before = { emissive: material.emissive.toArray(), intensity: material.emissiveIntensity };
  installNightEmissionMask(material, options);
  installNightEmissionMask(material, options);
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader, {});
  assert.equal(previousCalls, 1, 'existing hooks run once despite idempotent installation');
  assert.deepEqual({ emissive: material.emissive.toArray(), intensity: material.emissiveIntensity }, before, 'installation preserves original day appearance');
  assert.match(shader.fragmentShader, /existing material hook/);
  assert.match(shader.fragmentShader, /step\(0\.5, vNightEmissionMask\)/, 'unmarked poles/periscopes get no new emission');
  assert.match(shader.fragmentShader, /clamp\(vNightEmissionActive, 0\.0, 1\.0\)/);
  assert.match(material.customProgramCacheKey(), /^authored-base\|night-emission-mask-v1:/);
  const base = shader.uniforms.nightEmissionBase.value;
  assert.deepEqual(base.toArray(), new THREE.Color(0x123456).multiplyScalar(.37).toArray());
  // The shader's additive-baseline form is exact at day, mask0, and activity0.
  const radiance = base.clone().add(new THREE.Color(3, 3, 3).sub(base).multiplyScalar(0));
  assert.deepEqual(radiance.toArray(), base.toArray());
  return { material, shader };
}

const regular = compileMask();
assert.match(regular.shader.vertexShader, /vNightEmissionActive = 1\.0;/);
const instanced = compileMask({ instanceActiveAttribute: 'streetlampActive' });
assert.match(instanced.shader.vertexShader, /attribute float streetlampActive;/);
assert.match(instanced.shader.vertexShader, /vNightEmissionActive = 1\.0 \* streetlampActive;/);
assert.notEqual(instanced.material.customProgramCacheKey(), regular.material.customProgramCacheKey());
assert.throws(() => installNightEmissionMask(instanced.material), /cannot change/);
assert.throws(() => installNightEmissionMask(new THREE.MeshStandardMaterial(), { instanceActiveAttribute: 'bad; shader' }), /Invalid/);

// Evaluate the installed red lens through the production output transform, not just the declared red material
// property: the old radiance passed that property check while the final discs were visibly amber under ACES, and
// (2026-10-02) an AgX-only oracle at day exposures passed while the night camera's lens read salmon on screen. The
// oracle is the whole chain post.ts runs, read from its own source so it follows the grade: the light model's exposure
// and white balance, the scene-referred saturation and log contrast, three's AgX, the sRGB transfer, the display black
// point and the night's scotopic shift (the lens sits at the frame's centre: no vignette). The exposures are the light
// model's own cameras. This CPU oracle supplements (does not replace) the native composed close-up comparison.
const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
assert.match(chunk, /vec3 AgXToneMapping\( vec3 color \)/);
for (const coefficient of ['0.856627153315983', '0.761241990602591', '0.811302368396859', '1.1271005818144368',
  '1.157823702216272', '1.2519364065950405', '12.47393', '4.026069', '15.5', '40.14', '31.96', '6.868', '0.4298', '0.1191', '0.00232',
  '0.6274', '0.9195', '0.8956', '1.6605', '1.1329', '1.1187']) {
  assert.ok(chunk.includes(coefficient), 'update the colour oracle if the installed Three AgX implementation changes');
}
const column = (a) => new THREE.Matrix3().set(a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]); // GLSL mat3 columns
const toRec2020 = column([.6274, .0691, .0164, .3293, .9195, .0880, .0433, .0113, .8956]);
const fromRec2020 = column([1.6605, -.1246, -.0182, -.5876, 1.1329, -.1006, -.0728, -.0083, 1.1187]);
const agxInset = column([.856627153315983, .137318972929847, .11189821299995, .0951212405381588, .761241990602591,
  .0767994186031903, .0482516061458583, .101439036467562, .811302368396859]);
const agxOutset = column([1.1271005818144368, -.1413297634984383, -.14132976349843826, -.11060664309660323,
  1.157823702216272, -.11060664309660294, -.016493938717834573, -.016493938717834257, 1.2519364065950405]);
const agxContrast = (x) => { const x2 = x * x, x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + .4298 * x2 + .1191 * x - .00232; };
function agx(rgb) {
  const v = new THREE.Vector3(...rgb).applyMatrix3(toRec2020).applyMatrix3(agxInset);
  v.fromArray(v.toArray().map((x) => agxContrast(THREE.MathUtils.clamp((Math.log2(Math.max(x, 1e-10)) + 12.47393) / (4.026069 + 12.47393), 0, 1))));
  v.applyMatrix3(agxOutset).fromArray(v.toArray().map((x) => Math.pow(Math.max(0, x), 2.2))).applyMatrix3(fromRec2020);
  return new THREE.Color(...v.toArray().map((x) => THREE.MathUtils.clamp(x, 0, 1))).convertLinearToSRGB().toArray();
}
const post = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
const gradeConstant = (name) => {
  const m = post.match(new RegExp(`const ${name} = ([0-9.]+);`));
  assert.ok(m, `post.ts declares ${name}`);
  return Number(m[1]);
};
const SAT_LINEAR = gradeConstant('GRADE_SAT_LINEAR'), CONTRAST = gradeConstant('GRADE_CONTRAST'), BLACK_POINT = gradeConstant('GRADE_BLACK_POINT');
const DISPLAY_SAT = gradeConstant('GRADE_SATURATION');
// 2026-10-03 (the shade-fill lane): the photographic toe below the card by day, its slope back to the constant one with the night
const TOE_SLOPE = gradeConstant('GRADE_TOE_SLOPE'), TOE_STOPS = gradeConstant('GRADE_TOE_STOPS');
const TOE_CHANNEL_FROM = gradeConstant('GRADE_TOE_CHANNEL_FROM'), TOE_CHANNEL_TO = gradeConstant('GRADE_TOE_CHANNEL_TO');
const inOrder = (source, lines, what) => {
  let at = -1;
  for (const line of lines) {
    const next = source.indexOf(line, at + 1);
    assert.ok(next > at, `${what}: the oracle models "${line}" in this order`);
    at = next;
  }
};
inOrder(post, [
  'outputColor.rgb *= uExposure * uWhiteBalance;',
  'float sceneLuma = dot( outputColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );',
  'outputColor.rgb = max( mix( vec3( sceneLuma ), outputColor.rgb, uSatLinear ), vec3( 0.0 ) );',
  'float cotUL = min( log2( max( sceneLuma, 1e-6 ) * ( 1.0 / 0.18 ) ), 0.0 );',
  'vec3 cotLift = ( uContrast - uToe.x ) * mix( vec3( cotLiftL ), cotLiftC, smoothstep( uToe.z, uToe.w, -cotUL ) );',
  'outputColor.rgb = 0.18 * exp2( uContrast * cotU + cotLift );',
  'outputColor.rgb = 0.18 * pow( max( outputColor.rgb, vec3( 1e-6 ) ) * ( 1.0 / 0.18 ), vec3( uContrast ) );',
  'outputColor.rgb = AgXToneMapping( outputColor.rgb );',
  'outputColor = sRGBTransferOETF( outputColor );',
], 'the output pass\'s scene-referred chain');
inOrder(post, [
  'col = max( col - vec3( uBlackPoint ), vec3( 0.0 ) ) / ( 1.0 - uBlackPoint );',
  'float luma = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );',
  'col = clamp( mix( vec3( luma ), col, uSaturation ), 0.0, 1.0 );',
  'if ( uNight > 0.001 ) {',
], 'the display grade');
const scotopic = post.match(/float scot = uNight \* ([0-9.]+) \* \( 1\.0 - smoothstep\( ([0-9.]+), ([0-9.]+), luma \) \);\s*col = mix\( col, luma \* vec3\( ([0-9.]+), ([0-9.]+), ([0-9.]+) \), scot \);/);
assert.ok(scotopic, 'the oracle models the night\'s scotopic shift');
const [scotAmount, scotLo, scotHi, ...scotTint] = scotopic.slice(1).map(Number);
assert.match(post, /u\.uSatLinear\.value = satLinear \* model\.saturation;/);
assert.match(post, /u\.uContrast\.value = contrast \* model\.contrast;/);
assert.match(post, /setNightEmissionExposure\(u\.uExposure\.value\);/, 'post.ts hands the lens programs the output pass\'s exposure');
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lumaOf = (c) => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
/** What the frame shows for a radiance (shipped maps author no saturation or contrast trims; warmth is the WB). */
function displayOf(radiance, { exposure, warmth = 0, night = 0 }) {
  const wb = whiteBalanceGains(warmth);
  let c = radiance.toArray().map((v, i) => v * exposure * wb[i]);
  const sceneLuma = lumaOf(c);
  c = c.map((v) => Math.max(sceneLuma + SAT_LINEAR * (v - sceneLuma), 0));
  if (night < 0.999) {
    // the constant slope plus the toe's log-space lift: read from the luminance near the card, per channel deep under it
    const lo = TOE_SLOPE + (CONTRAST - TOE_SLOPE) * night;
    const lift = (u) => { const uc = Math.min(u, 0), t = Math.min(1, Math.max(0, uc / TOE_STOPS + 1)); return TOE_STOPS * (t ** 3 * (1 - .5 * t) - .5) - uc; };
    const uL = Math.min(Math.log2(Math.max(sceneLuma, 1e-6) / .18), 0), w = smooth(TOE_CHANNEL_FROM, TOE_CHANNEL_TO, -uL);
    c = c.map((v) => {
      const u = Math.log2(Math.max(v, 1e-6) / .18);
      return .18 * 2 ** (CONTRAST * u + (CONTRAST - lo) * (lift(uL) + (lift(u) - lift(uL)) * w));
    });
  } else c = c.map((v) => .18 * Math.pow(Math.max(v, 1e-6) / .18, CONTRAST));
  c = agx(c).map((v) => THREE.MathUtils.clamp(v, 0, 1));
  c = c.map((v) => Math.max(v - BLACK_POINT, 0) / (1 - BLACK_POINT));
  const luma = lumaOf(c);
  c = c.map((v) => THREE.MathUtils.clamp(luma + DISPLAY_SAT * (v - luma), 0, 1));
  const scot = night * scotAmount * (1 - smooth(scotLo, scotHi, luma));
  c = c.map((v, i) => v + (luma * scotTint[i] - v) * scot);
  return new THREE.Color(...c); // display-encoded components (read them raw: getHexString would encode again)
}
const hexOf = (c) => c.toArray().map((x) => Math.round(THREE.MathUtils.clamp(x, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
const hueOf = (c) => { const h = c.getHSL({ h: 0, s: 0, l: 0 }).h * 360; return h > 180 ? h - 360 : h; };
const chroma = (c) => (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)) / Math.max(c.r, c.g, c.b, 1e-6);
assert.deepEqual(regular.shader.uniforms.nightEmissionWarm.value.toArray(),
  new THREE.Color(NIGHT_HEADLIGHT_COLOR).toArray(), 'headlights/window lamps retain exact warm radiance');
const dayRed = new THREE.Color(0x7c2410); // measured authored T-90A Vladimir lens floor
const whiteNight = new THREE.Color(3, 3, 3);
const redTint = regular.shader.uniforms.nightEmissionRed.value;
const redRadiance = dayRed.clone().add(whiteNight.clone().sub(dayRed).multiply(redTint));
// The light model's cameras: its day key, the bounds of its adaptation (with the authored −0.25 EV of the snow maps
// and the low sun's −0.5 EV at the dark end), the night camera (its illuminance pins the bound, with the night EV)
const nightCamera = exposureFor(1e-6, NIGHT_EV);
const cameras = [EXPOSURE_KEY * EXPOSURE_MIN * 2 ** -.75, exposureFor(EXPOSURE_REFERENCE_ILLUMINANCE), nightCamera, exposureFor(1e-6)];
assert.ok(nightCamera > 3 && nightCamera < 3.5, `the night camera opens about two stops over the day key (${nightCamera.toFixed(2)})`);
// the old lens at the night camera: the salmon this fix removes, a pale pink in the whole chain
const unheldNight = displayOf(redRadiance, { exposure: nightCamera, night: 1 });
assert.ok(chroma(unheldNight) < .45 && unheldNight.g > unheldNight.r * .6,
  `the unheld lens at the night camera is the salmon the ceiling removes (${hexOf(unheldNight)})`);
const oldRadiance = dayRed.clone().add(whiteNight.clone().sub(dayRed).multiply(new THREE.Color(NIGHT_SHTORA_COLOR)));
assert.ok(chroma(displayOf(oldRadiance, { exposure: EXPOSURE_KEY })) < .4,
  'the regression fixture actually distinguishes the previous full-Shtora radiance (washed to a pale pink)');
// 2026-10-02: a driven red lens is capped at NIGHT_RED_DISPLAY_LEVEL of the tone curve's input, whatever the camera's
// exposure. The installed fragment code, modelled exactly here:
const levelUniform = regular.shader.uniforms.nightEmissionRedLevel;
const exposureUniform = regular.shader.uniforms.nightEmissionExposure;
assert.equal(levelUniform.value, NIGHT_RED_DISPLAY_LEVEL);
assert.strictEqual(exposureUniform, compileMask().shader.uniforms.nightEmissionExposure, 'one exposure uniform shared by every lens program');
assert.equal(regular.shader.uniforms.nightEmissionFloorExposure.value, NIGHT_RED_FLOOR_EXPOSURE);
// the floors keep the key the lenses were authored under — the legacy rig's exposure (the Garage, the galaxy skies), at or
// above the grounded day key, so no daylight camera dims an unlit floor (2026-10-03: whatever the grounded key)
assert.equal(NIGHT_RED_FLOOR_EXPOSURE, LEGACY_EXPOSURE, 'the floors hold the authored lenses\' key (the legacy rig\'s exposure)');
assert.ok(NIGHT_RED_FLOOR_EXPOSURE >= EXPOSURE_KEY, 'at or above the grounded rig\'s day key');
for (const line of [
  'float nightEmissionRedLens = step(1.5, vNightEmissionMask) * nightEmissionOn;',
  'float nightEmissionLit = step(1e-4, dot(nightEmissionDriven, nightEmissionDriven));',
  'float nightEmissionRedPeak = max(max(totalEmissiveRadiance.r, totalEmissiveRadiance.g), max(totalEmissiveRadiance.b, 1e-6)) * nightEmissionExposure;',
  'float nightEmissionRedScale = mix(min(1.0, nightEmissionFloorExposure / nightEmissionExposure), min(1.0, nightEmissionRedLevel / nightEmissionRedPeak), nightEmissionLit);',
  'totalEmissiveRadiance *= mix(1.0, nightEmissionRedScale, nightEmissionRedLens);',
]) assert.ok(regular.shader.fragmentShader.includes(line), `the oracle models the installed lens code: ${line}`);
function lensRadiance(total, base, mask, active, exposure) {
  const on = (mask >= .5 ? 1 : 0) * Math.min(1, Math.max(0, active));
  const driven = total.clone().sub(base);
  const tint = mask >= 1.5 ? redTint : regular.shader.uniforms.nightEmissionWarm.value;
  const lit = base.clone().add(driven.clone().multiply(tint).multiplyScalar(on));
  const redLens = (mask >= 1.5 ? 1 : 0) * on;
  const isLit = driven.r ** 2 + driven.g ** 2 + driven.b ** 2 >= 1e-4 ? 1 : 0;
  const peak = Math.max(lit.r, lit.g, lit.b, 1e-6) * exposure;
  const floorScale = Math.min(1, NIGHT_RED_FLOOR_EXPOSURE / exposure), litScale = Math.min(1, NIGHT_RED_DISPLAY_LEVEL / peak);
  const scale = floorScale + (litScale - floorScale) * isLit;
  return lit.multiplyScalar(1 + (scale - 1) * redLens);
}
// (a player's lights are on by day too, auxiliary lights: the ceiling engages from the camera where the lit lens
// reaches it, about two thirds of the day key; under a brighter sky the lens reads a deeper red, as a tail lamp in sun)
const capFrom = NIGHT_RED_DISPLAY_LEVEL / Math.max(redRadiance.r, redRadiance.g, redRadiance.b);
assert.ok(capFrom < EXPOSURE_KEY * .5, `every night and dusk camera holds the lens at the ceiling (from ${capFrom.toFixed(2)})`);
const shownAt = new Map();
for (const night of [0, 1]) for (const warmth of [0, .25]) for (const exposure of cameras) {
  setNightEmissionExposure(exposure);
  assert.equal(exposureUniform.value, exposure, 'post.ts drives the shared exposure');
  const display = displayOf(lensRadiance(whiteNight, dayRed, 2, 1, exposure), { exposure, warmth, night });
  const unlit = displayOf(lensRadiance(dayRed, dayRed, 2, 1, exposure), { exposure, warmth, night });
  const at = `exposure ${exposure.toFixed(2)}, warmth ${warmth}, night ${night}`;
  assert.ok(display.g < display.r * .45 && Math.abs(hueOf(display)) < 10 && chroma(display) > .62,
    `a lit red lens reads red on screen at ${at}: its hue, never amber, its colour, never salmon (${hexOf(display)})`);
  assert.ok(display.r > unlit.r + .05, `and reads lit, brighter than its unlit floor (${hexOf(display)} against ${hexOf(unlit)} at ${at})`);
  if (exposure < capFrom) continue;
  assert.ok(display.r > .78, `held at the ceiling, a bright red (${hexOf(display)} at ${at})`);
  const key = `${warmth}/${night}`;
  shownAt.set(key, [...(shownAt.get(key) ?? []), hexOf(display)]);
}
for (const [key, shown] of shownAt) {
  assert.ok(shown.length >= 3, 'the day key, the night camera and the bound are held');
  assert.equal(new Set(shown).size, 1, `the same red through every held camera (${key}: ${shown})`);
}
// the whole lens floor family: a darker or browner authored base reads the same lit red
for (const floor of [0x000000, 0x5a1a10, 0x8a3a20, 0x402020]) {
  const display = displayOf(lensRadiance(whiteNight, new THREE.Color(floor), 2, 1, nightCamera), { exposure: nightCamera, night: 1 });
  assert.ok(chroma(display) > .62 && Math.abs(hueOf(display)) < 10, `lens floor #${floor.toString(16)} lit at night (${hexOf(display)})`);
}
// a dimmer drive (the window material's obstruction bulbs, white × 0.225) stays under the ceiling, untouched
const dimBulb = lensRadiance(new THREE.Color(.225, .225, .225), new THREE.Color(0, 0, 0), 2, 1, nightCamera);
assert.deepEqual(dimBulb.toArray(), new THREE.Color(.225, .225, .225).multiply(redTint).toArray(), 'a dim red drive keeps its own radiance');
for (const exposure of [cameras[0], 1, EXPOSURE_KEY]) {
  assert.deepEqual(lensRadiance(dayRed, dayRed, 2, 1, exposure).toArray(), dayRed.toArray(),
    `an unlit lens keeps the exact authored day radiance at the day key and under any brighter sky (${exposure.toFixed(2)})`);
}
// under a dimmer camera (an overcast deck, the night) an unlit floor holds its day-key level, where it glowed salmon
// above its lit neighbours (a wreck's lenses, a tank with its lights off)
for (const night of [0, 1]) {
  const atKey = hexOf(displayOf(dayRed, { exposure: NIGHT_RED_FLOOR_EXPOSURE, night }));
  for (const exposure of [2.2, nightCamera, exposureFor(1e-6)]) {
    assert.equal(hexOf(displayOf(lensRadiance(dayRed, dayRed, 2, 1, exposure), { exposure, night })), atKey,
      `an unlit red floor at ${exposure.toFixed(2)} reads as at the day key`);
  }
}
const unheldFloor = displayOf(dayRed, { exposure: nightCamera, night: 1 });
assert.ok(unheldFloor.r > displayOf(lensRadiance(whiteNight, dayRed, 2, 1, nightCamera), { exposure: nightCamera, night: 1 }).r,
  `the regression fixture: unheld, the unlit floor outshone the lit lens at night (${hexOf(unheldFloor)})`);
assert.deepEqual(dayRed.clone().add(dayRed.clone().sub(dayRed).multiply(redTint)).toArray(), dayRed.toArray(),
  'red-aperture gain cannot alter the exact authored day radiance');
const warmFloor = lensRadiance(dayRed, dayRed, 1, 1, nightCamera);
assert.deepEqual(warmFloor.toArray(), dayRed.toArray(), 'warm lamp floors are untouched by the red floor hold');
const warmLit = lensRadiance(whiteNight, dayRed, 1, 1, nightCamera);
assert.deepEqual(warmLit.toArray(), dayRed.clone().add(whiteNight.clone().sub(dayRed).multiply(regular.shader.uniforms.nightEmissionWarm.value)).toArray(),
  'warm lamps are untouched by the red ceiling');
setNightEmissionExposure(1);
geometry.dispose(); regular.material.dispose(); instanced.material.dispose();
console.log('nightEmissionMaterial: exact day baseline, semantic zero mask, lit red lenses read red through the whole output chain at every camera, unlit floors hold their day key, dim drives and warm lamps untouched, instanced activity, hook/key preservation PASS');
