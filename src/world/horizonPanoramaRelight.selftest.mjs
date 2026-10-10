// The far country under a battle's sunset and night (the nightsky lane, 2026-10-08; the owner, 10:52: "on sunsets and
// nights, the far skybox is still like glowing instead of having the right lighting"). horizonPanorama.ts bakes the far
// country under the map's authored day sun and draws it unlit; the camera's exposure opens up at night and at a low sun,
// so the day-lit far land glowed over a darker scene (the September fix dimmed it to a fifth at night only). Now the
// battle atmosphere re-bakes it under the light it applies (relight): the key light's direction, the bake's sun, sky
// and bounce terms scaled per channel by the live light over the day's, its air from the live sky.
//
// This receipt runs without a browser. Per map (every terrestrial map that bakes a panorama), it builds the day, sunset
// and night skies on the CPU twin of the atmosphere (atmosphere.test-support.mjs), resolves the grounded light model
// for each, computes the relight the handle computes (horizonPanoramaRelight), and runs the bake's OWN statements — the
// strip's light law and its haze law, read out of the strip shader the bake compiles — through the GLSL-subset
// evaluator (glslSubset.test-support.mjs) on far faces of five albedo classes, then the aerial pass's haze over the
// shell's depth. The targets (the coordinator, 2026-10-08), each on every map:
//   sunset and night  the far surface's own light (before the air) is no brighter than the near ground's of the same
//           albedo — nor, against it, than by day — and the far path's air is no brighter than the sky above it (the dome
//           2 degrees up on the same bearing): nothing in the far band lights itself;
//   night   the far woods, fields and rock stand darker than the sky just above them; the far sand and snow, which the
//           moon lights about as bright as the night sky, stay under both the near ground turned the same way and the sky;
//   sunset  toward the sun the ranges (faces turned from it) stand as dark silhouettes against the sky under a warm
//           haze; away from it the faces turned to the low sun take a warmer light than by day;
//   day     the relight is the identity (the authored bake stands, byte for byte).
// and the control: the September behaviour (the day bake; a fifth of it at night) fails them on every map — the glow
// the owner saw.
//   node src/world/horizonPanoramaRelight.selftest.mjs        (HORIZON_RELIGHT_TABLE=1 prints the per-map numbers)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  HORIZON_PANORAMA, HORIZON_PANORAMA_SHADERS, STRIP_AUX_FRAGMENT, horizonFarLight, horizonPanoramaHaze, horizonPanoramaRelight,
} from './horizonPanorama.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { resolveHorizonLightingGains } from './maps/horizon.ts';
import { battleTimePreset } from '../engine/battleAtmosphereRuntime.ts';
import {
  OVERCAST_DIRECT_CUT_SHARED, authoredSunOf, loadGroundedLightModel, resolveLightModel, resolveOvercast,
} from '../engine/lightModelCore.ts';
import { skyPresetToAtmosphere } from '../engine/atmosphere.ts';
import { CpuAtmosphere, LEGACY_DEFAULT_PRESET, cpuSummary, skyVisible } from '../engine/atmosphere.test-support.mjs';
import { HAZE_EXT_CHROMA, HAZE_LAW_GLSL, hazeLayerInverseScale, hazeSigma } from '../engine/hazeLaw.ts';
import { closingBrace, parseGlsl, runGlsl, runGlslFunction, stripComments } from './glslSubset.test-support.mjs';

await loadGroundedLightModel();
const P = HORIZON_PANORAMA;
const LUM = [0.2126, 0.7152, 0.0722];
const lum = (c) => c[0] * LUM[0] + c[1] * LUM[1] + c[2] * LUM[2];
const table = process.env.HORIZON_RELIGHT_TABLE === '1';

// ---------------------------------------------------------------------------------------------- the bake's statements
const strip = HORIZON_PANORAMA_SHADERS.strip;
const between = (text, from, to, label) => {
  const a = text.indexOf(from);
  assert.ok(a >= 0 && text.indexOf(from, a + 1) < 0, `${label}: one "${from.slice(0, 40)}"`);
  const b = text.indexOf(to, a);
  assert.ok(b > a, `${label}: "${to.slice(0, 40)}" after it`);
  return text.slice(a, b + to.length);
};
// the surface's light (surfaceColour's last statements): the sun with its cast shadows, the sky with its occlusion, the
// valleys' bounce, each under the relight's scale
const lightChunk = parseGlsl(stripComments(between(strip, 'float ndl = max(0.0, dot(n, uSun));', 'col *= sunC + skyC + bounce;', 'the strip\'s light')));
// the column's in-scatter target (warm toward the sun) and the law over the far path
// (the evaluator hands back the variables it was given: the chunk's own declarations stay inside, so the target is read
// out through one appended assignment)
const targetChunk = parseGlsl(`${stripComments(between(strip, 'vec2 sunH = uSun.xz / max(length(uSun.xz), 1e-4);',
  'vec3 lawTarget = mix(uHazeAnti, uHazeToward, toward * toward);', 'the strip\'s target'))}\noutTarget = lawTarget;`);
const hazeFrom = strip.indexOf('if (uHaze.w > 0.5) {\n    vec3 target = lawTarget;');
assert.ok(hazeFrom > 0, 'the strip\'s air past the shell');
const hazeThen = closingBrace(strip, strip.indexOf('{', hazeFrom));
const hazeElse = closingBrace(strip, strip.indexOf('{', hazeThen + 1));
const hazeChunk = parseGlsl(stripComments(strip.slice(hazeFrom, hazeElse + 1)));
// the shared law's two functions, read out of hazeLaw.ts's chunk and run by the same evaluator
const lawBody = (signature) => {
  const at = HAZE_LAW_GLSL.indexOf(signature);
  assert.ok(at >= 0, `the haze law's ${signature}`);
  const open = HAZE_LAW_GLSL.indexOf('{', at);
  return parseGlsl(stripComments(HAZE_LAW_GLSL.slice(open + 1, closingBrace(HAZE_LAW_GLSL, open))));
};
const layerMeanBody = lawBody('float hazeLayerMean( float a0, float a1 )');
const transmittanceBody = lawBody('vec3 hazeTransmittance( float sigma, float d, float layerMean, vec3 chroma )');
const functions = {
  hazeLayerMean: (a0, a1) => runGlslFunction(layerMeanBody, { a0, a1 }, {}, new Set()),
  hazeTransmittance: (sigma, d, layerMean, chroma) => runGlslFunction(transmittanceBody, { sigma, d, layerMean, chroma }, {}, new Set()),
};

// the relight's uniforms reach every term of the light, the hidden fill's too, and the aux the cloud shade reads
assert.ok(/uniform vec3 uSunScale, uSkyScale, uBounceScale;/.test(strip), 'the strip declares the relight\'s scales');
assert.ok(strip.includes('vec3(1.06, 0.98, 0.86) * uSunScale;') && strip.includes('light.g * skyTint * uSkyScale;')
  && strip.includes('vec3(0.9, 0.85, 0.75) * uBounceScale;'), 'the sun, sky and bounce terms each take their scale');
assert.ok(strip.includes('vec3(1.06, 0.98, 0.86) * uSunScale + uGains.x * 0.82 * skyTint * uSkyScale)'), 'and the fill under the skyline');
assert.ok(STRIP_AUX_FRAGMENT && STRIP_AUX_FRAGMENT.includes('* uSunScale * gSunScale;'), 'the cloud shade\'s aux still splits the relit sun\'s share');

// ---------------------------------------------------------------------------------------------- the skies
const skySource = readFileSync(new URL('../engine/sky.ts', import.meta.url), 'utf8');
const skyConst = (name) => {
  const m = new RegExp(`const ${name} = (0x[0-9a-fA-F]+|[\\d.]+)`).exec(skySource);
  assert.ok(m, `sky.ts ${name}`);
  return Number(m[1]);
};
// sky.ts's DEFAULT_PRESET under every map's block (the dome's medium, the haze's density and tint)
const SKY_DEFAULTS = { ...LEGACY_DEFAULT_PRESET, fogDensity: skyConst('FOG_DENSITY'), fogTintHex: skyConst('FOG_BLUE_TINT_HEX'),
  fogMix: skyConst('FOG_BLUE_MIX') };
const linearHex = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

/** One map's sky at one time, as the battlefield publishes it: the atmosphere, its summary and raw irradiance, the light. */
function skyAt(atm, authored, time) {
  const preset = battleTimePreset(authored, time === 'day' ? null : time);
  const full = { ...SKY_DEFAULTS, ...preset };
  const params = skyPresetToAtmosphere(full);
  atm.p = params; // (the medium is the time's too: only the sun and the dome's intensity change)
  const intensity = full.skyIntensity ?? 1;
  const summary = cpuSummary(atm, intensity);
  // the raw irradiance (sky.ts's summary texel 7): the cosine-weighted dome, no knee, × the dome's intensity
  const irradianceRaw = [0, 0, 0];
  for (let i = 0; i < 256; i++) {
    const a = ((i % 16) + 0.5) / 16, b = (Math.floor(i / 16) + 0.5) / 16, rr = Math.sqrt(b), phi = a * 2 * Math.PI;
    const s = atm.sky([rr * Math.cos(phi), Math.sqrt(Math.max(1 - b, 0)), rr * Math.sin(phi)]);
    for (let c = 0; c < 3; c++) irradianceRaw[c] += s[c] * intensity / 256;
  }
  const model = resolveLightModel(preset, params, { irradianceRaw }, authoredSunOf(preset), true);
  assert.equal(model.mode, 'physical', `${time}: the grounded light`);
  const atmosphere = {
    active: true, sunDir: { x: params.sunDir[0], y: params.sunDir[1], z: params.sunDir[2] }, fogDensity: full.fogDensity,
    fogMix: full.fogMix, fogTint: new THREE.Color(full.fogTintHex),
    summary: { horizon: new THREE.Color(...summary.horizon), sunHorizon: new THREE.Color(...summary.sunHorizon) },
  };
  return { preset, full, params, intensity, summary, irradianceRaw, model, atmosphere,
    sample: { model, irradianceRaw, horizon: summary.horizon, sunHorizon: summary.sunHorizon, sunDir: params.sunDir } };
}

// ---------------------------------------------------------------------------------------------- the far faces
/** The albedo classes a far country carries (linear, neutral: the hue under test is the light's). */
const CLASSES = Object.freeze({ forest: 0.06, grass: 0.12, rock: 0.2, sand: 0.34, snow: 0.72 });
const RR = 5000, WP_Y = 180, SLOPE = 30 * Math.PI / 180;
/** A sunset silhouette: the far band toward the sun under this share of the sky just above it. */
const SILHOUETTE = 0.65;
const normalize = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };

/** A far face at the column `a` (radians round the compass, x = cos a, z = sin a), its normal, under a bake's uniforms. */
function farFace(albedo, normal, a, u) {
  let { col } = runGlsl(lightChunk, { col: [albedo, albedo, albedo], n: normal, uSun: u.sun, uFog: u.fog, uGains: u.gains,
    light: [u.lit, 0.85, 0, 1], uSunScale: u.sunScale, uSkyScale: u.skyScale, uBounceScale: u.bounceScale }, functions, new Set());
  const lit = col;
  const { outTarget: lawTarget } = runGlsl(targetChunk, { uSun: u.sun, a, uHazeAnti: u.anti, uHazeToward: u.toward, outTarget: [0, 0, 0] },
    functions, new Set());
  ({ col } = runGlsl(hazeChunk, { col, lawTarget, uHaze: [u.sigma, u.invScale, 0, u.law ? 1 : 0], uAir: [1, 0, -1, 0],
    uFrame: [P.innerM, P.outerM, P.shellM, P.eyeY], wp: [Math.cos(a) * RR, WP_Y, Math.sin(a) * RR], rr: RR,
    uHazeChroma: [...HAZE_EXT_CHROMA], uFog: u.fog }, functions, new Set()));
  return { lit, baked: col.map((v) => Math.min(1, Math.max(0, v))), target: lawTarget };
}

/** The bake's uniforms for a light (null: the authored day), as createHorizonPanorama sets them. */
function bakeUniforms(sky, light, authoredSun, gains, fog) {
  const sun = light ? light.sun : authoredSun;
  const haze = horizonPanoramaHaze(sky.atmosphere, sun, sky.full.fogDensity, resolveOvercast(sky.preset));
  return {
    sun: normalize(sun), gains: [gains.ambient, gains.sunGain], fog: light ? fog.map((v) => v * light.airScale) : fog,
    sunScale: light?.sunScale ?? [1, 1, 1], skyScale: light?.skyScale ?? [1, 1, 1], bounceScale: light?.bounceScale ?? [1, 1, 1],
    law: !!haze, sigma: haze?.sigma ?? 0, invScale: haze?.invScale ?? hazeLayerInverseScale(),
    anti: haze ? [haze.anti.x, haze.anti.y, haze.anti.z] : [0, 0, 0], toward: haze ? [haze.toward.x, haze.toward.y, haze.toward.z] : [0, 0, 0],
    lit: 1,
  };
}

/** The aerial pass over the shell's depth from a camera 80 m inside the edge, toward the same target (post.ts's law). */
function aerial(colour, target, sky) {
  const sigma = hazeSigma(sky.full.fogDensity), d = P.shellM - 432;
  const layer = functions.hazeLayerMean(2.5 * hazeLayerInverseScale(), WP_Y * 0.4 * hazeLayerInverseScale());
  const T = functions.hazeTransmittance(sigma, d, layer, [...HAZE_EXT_CHROMA]);
  return colour.map((v, c) => v * T[c] + target[c] * (1 - T[c]));
}

/** The near ground of an albedo under a light, the battlefield's way: albedo / π × (the sun on the face + the sky it
 * sees: all of it on a level face, half from a wall). Level by default. */
function nearGround(albedo, sky, normal = [0, 1, 0]) {
  const { sun, sky: skyLight } = horizonFarLight(sky.model, sky.irradianceRaw);
  const s = normalize(sky.params.sunDir);
  const ndl = Math.max(0, normal[0] * s[0] + normal[1] * s[1] + normal[2] * s[2]);
  return [0, 1, 2].map((c) => albedo / Math.PI * (sun[c] * ndl + skyLight[c] * (0.5 + 0.5 * normal[1])));
}

// ---------------------------------------------------------------------------------------------- per map
const maps = MAP_IDS.filter((id) => {
  const cfg = getMapConfig(id);
  return cfg.horizon?.panorama !== false && !((cfg.sky?.nightSky ?? 0) > 0.5);
});
assert.ok(maps.length >= 25, `the terrestrial panorama maps (${maps.length})`);
const rows = [];
let septemberNightFails = 0, septemberSunsetFails = 0;
/** Every per-map check, so a failing run names all of them (and HORIZON_RELIGHT_TABLE prints the numbers). */
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
for (const id of maps) {
  const cfg = getMapConfig(id);
  const authored = { ...(cfg.sky ?? {}), cloudscape: cfg.clouds ?? null };
  const full0 = { ...SKY_DEFAULTS, ...authored };
  const atm = new CpuAtmosphere(skyPresetToAtmosphere(full0));
  const day = skyAt(atm, authored, 'day'), sunset = skyAt(atm, authored, 'sunset'), night = skyAt(atm, authored, 'night');
  // the far gains as maps/horizon.ts resolves them (farLighting: the deck's whole average cut)
  const overcast = resolveOvercast(authored);
  const sunEl = (full0.sunElevationDeg) * Math.PI / 180, sunAz = full0.sunAzimuthDeg * Math.PI / 180;
  const authoredSun = [Math.sin(sunAz) * Math.cos(sunEl), Math.sin(sunEl), Math.cos(sunAz) * Math.cos(sunEl)];
  const gains = resolveHorizonLightingGains({
    sun: cfg.sky?.sunIntensity ?? 4.5, hemi: (cfg.sky?.hemiIntensity ?? 0.36) + 0.15,
    cover: Math.min(1, Math.max(0, cfg.clouds?.coverage ?? cfg.sky?.cloudOpacity ?? 0.3)),
    direct: 1 - OVERCAST_DIRECT_CUT_SHARED * overcast, sinEl: Math.max(0, Math.sin(sunEl)),
  });
  const fog = linearHex(cfg.sky?.fogTintHex ?? SKY_DEFAULTS.fogTintHex);

  // day: the identity — the authored bake stands
  assert.equal(horizonPanoramaRelight(day.sample, day.sample), null, `${id}: by day the relight is the identity`);
  assert.equal(horizonPanoramaRelight(day.sample, day.sample, { gains, fog }), null, `${id}: by day the relight is the identity, level match and all`);
  // (the handle hands the relight its own light: the gains and the palette's fog — here the map's sky tint stands in)
  const bakeLight = { gains, fog };
  const lightSunset = horizonPanoramaRelight(day.sample, sunset.sample, bakeLight), lightNight = horizonPanoramaRelight(day.sample, night.sample, bakeLight);
  assert.ok(lightSunset && lightNight, `${id}: sunset and night relight`);
  for (const [name, light] of [['sunset', lightSunset], ['night', lightNight]]) {
    for (const k of ['sunScale', 'skyScale', 'bounceScale']) {
      assert.ok(light[k].every((v) => Number.isFinite(v) && v >= 0 && v <= 4), `${id} ${name}: ${k} finite, in [0, 4]`);
    }
    assert.ok(Math.abs(Math.hypot(...light.sun) - 1) < 1e-9, `${id} ${name}: the key light a unit vector`);
  }
  assert.ok(lum(lightNight.sunScale) < 0.25 && lum(lightNight.skyScale) < 0.6 && lightNight.airScale < 0.3,
    `${id}: the night's moon, sky and air are far under the day's (${lum(lightNight.sunScale).toFixed(3)}, ${lum(lightNight.skyScale).toFixed(3)}, ${lightNight.airScale.toFixed(3)})`);
  assert.ok(lightSunset.sunScale[0] > lightSunset.sunScale[2] * 1.3,
    `${id}: the sunset's sun is redder than the day's (${lightSunset.sunScale.map((v) => v.toFixed(3)).join(', ')})`);

  const snowy = cfg.horizon?.style === 'alpine' || cfg.horizon?.relief === 'polar';
  const classes = Object.entries(CLASSES).filter(([k]) => k !== 'snow' || snowy);
  const towardA = Math.atan2(authoredSun[2], authoredSun[0]), awayA = towardA + Math.PI;
  const sunH = normalize([authoredSun[0], 0, authoredSun[2]]);
  const backlit = normalize([-sunH[0] * Math.sin(SLOPE), Math.cos(SLOPE), -sunH[2] * Math.sin(SLOPE)]);
  const frontlit = normalize([sunH[0] * Math.sin(SLOPE), Math.cos(SLOPE), sunH[2] * Math.sin(SLOPE)]);
  const dirAt = (a, elDeg) => { const e = elDeg * Math.PI / 180; return [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)]; };

  const uDay = bakeUniforms(day, null, authoredSun, gains, fog);
  const uNight = bakeUniforms(night, lightNight, authoredSun, gains, fog);
  const uSunset = bakeUniforms(sunset, lightSunset, authoredSun, gains, fog);
  check(uNight.law && uSunset.law, `${id}: the sunset and night bakes take the published sky's law (their air is the live sky's)`);
  const row = { id, kDay: 0, kNight: 0, kSunset: 0, airNight: 0, airSunset: 0, farNight: 0, backSunset: 0,
    septemberNight: 0, septemberSunset: 0 };
  /** One far face under a time's bake: its surface's own light (before the air), its target, the band (after both airs). */
  const look = (sky, u, albedo, normal, a) => {
    atm.p = sky.params;
    const face = farFace(albedo, normal, a, u);
    return { lit: face.lit, target: face.target, band: aerial(face.baked, face.target, sky), sky: skyVisible(atm, dirAt(a, 2), sky.intensity) };
  };
  // the September far country: the authored day bake, its air the day sky's, under each time's own aerial pass (a fifth
  // of the shell's colour by night)
  const september = (sky, albedo, normal, a, dim) => {
    const face = farFace(albedo, normal, a, uDay);
    atm.p = sky.params;
    const target = look(sky, sky === night ? uNight : uSunset, albedo, normal, a).target;
    return { lit: face.lit.map((v) => v * dim), air: face.target.map((v) => v * dim), band: aerial(face.baked.map((v) => v * dim), target, sky) };
  };
  for (const [cls, albedo] of classes) {
    // the far surface's light against the near ground's of the same albedo, both level, under each time's light: the day's
    // ratio is the calibration the critics scored; a glow is the far land lit above it
    const kDay = lum(look(day, uDay, albedo, [0, 1, 0], awayA).lit) / lum(nearGround(albedo, day));
    for (const [time, sky, u] of [['night', night, uNight], ['sunset', sunset, uSunset]]) {
      const near = lum(nearGround(albedo, sky));
      const level = look(sky, u, albedo, [0, 1, 0], awayA);
      const k = lum(level.lit) / near;
      // (never brighter than the near ground, nor against it than by day: the day bake's own excess over the
      // battlefield's ground is its calibration, kept by day only)
      check(k <= Math.min(kDay, 1) * 1.02, `${id} ${time} ${cls}: the far surface lit no brighter than the near ground (${k.toFixed(3)}; by day ${kDay.toFixed(3)})`);
      row[time === 'night' ? 'kNight' : 'kSunset'] = Math.max(row[time === 'night' ? 'kNight' : 'kSunset'], k);
      row.kDay = Math.max(row.kDay, kDay);
      const sept = september(sky, albedo, [0, 1, 0], awayA, time === 'night' ? 0.2 : 1);
      row[time === 'night' ? 'septemberNight' : 'septemberSunset'] = Math.max(row[time === 'night' ? 'septemberNight' : 'septemberSunset'],
        lum(sept.lit) / near / (Math.min(kDay, 1) * 1.02));
      for (const a of [towardA, awayA]) {
        // the far path's air never brighter than the sky it converges to (the dome 2 degrees up on the same bearing)
        const face = look(sky, u, albedo, [0, 1, 0], a);
        const air = lum(face.target) / lum(face.sky);
        check(air <= 1, `${id} ${time} ${cls}: the far path's air (${lum(face.target).toFixed(5)}) no brighter than the sky above it (${lum(face.sky).toFixed(5)})`);
        row[time === 'night' ? 'airNight' : 'airSunset'] = Math.max(row[time === 'night' ? 'airNight' : 'airSunset'], air);
        const septAir = lum(september(sky, albedo, [0, 1, 0], a, time === 'night' ? 0.2 : 1).air) / lum(face.sky);
        if (time === 'night') row.septemberNight = Math.max(row.septemberNight, septAir);
        else row.septemberSunset = Math.max(row.septemberSunset, septAir);
      }
    }
    // night: the far band a silhouette under the sky just above it, both ways round the compass — the far country's
    // woods, fields and rock. Moonlit sand and snow are about as bright as the night sky at the horizon under this
    // moon (the receipt's own numbers: the near sand at the sky's level); they stay under the near sand and snow
    for (const [a, normal] of [[towardA, backlit], [awayA, frontlit], [towardA, [0, 1, 0]], [awayA, [0, 1, 0]]]) {
      const face = look(night, uNight, albedo, normal, a);
      const band = lum(face.band), sky = lum(face.sky);
      if (cls === 'snow' || cls === 'sand') {
        // (never brighter than both: its surface no brighter than the near ground's, its air no brighter than the sky)
        // (the near ground turned the same way: a slope facing the moon is brighter than a level one, near or far)
        const near = lum(nearGround(albedo, night, normal));
        check(band <= Math.max(near, sky) * 1.001, `${id} night ${cls}: the far ${cls} (${band.toFixed(5)}) no brighter than both the near ${cls} (${near.toFixed(5)}) and the sky above it (${sky.toFixed(5)})`);
      } else {
        check(band < sky, `${id} night ${cls}: the far band (${band.toFixed(5)}) under the sky just above it (${sky.toFixed(5)})`);
        row.farNight = Math.max(row.farNight, band / sky);
      }
      const sept = lum(september(night, albedo, normal, a, 0.2).band) / sky;
      if (cls !== 'snow' && cls !== 'sand') row.septemberNight = Math.max(row.septemberNight, sept);
    }
    // sunset: toward the sun the faces the camera sees are turned from it — silhouettes against the bright sky
    {
      const face = look(sunset, uSunset, albedo, backlit, towardA);
      const band = lum(face.band), sky = lum(face.sky);
      // (dark: under 0.65 of the sky just above — the relight measured at most 0.59, the September bake 1.7 and more)
      check(band < SILHOUETTE * sky, `${id} sunset ${cls}: toward the sun the ranges stand dark against the sky (${band.toFixed(4)} vs ${sky.toFixed(4)})`);
      row.backSunset = Math.max(row.backSunset, band / sky);
      row.septemberSunset = Math.max(row.septemberSunset, lum(september(sunset, albedo, backlit, towardA, 1).band) / (SILHOUETTE * sky));
    }
    // away from it the faces turned to the low sun take a warmer light than by day
    {
      const front = look(sunset, uSunset, albedo, frontlit, awayA), frontDay = look(day, uDay, albedo, frontlit, awayA);
      check(front.lit[0] / front.lit[2] > frontDay.lit[0] / frontDay.lit[2] * 1.05,
        `${id} sunset ${cls}: the faces turned to the low sun warmer than by day (R/B ${(front.lit[0] / front.lit[2]).toFixed(3)} vs ${(frontDay.lit[0] / frontDay.lit[2]).toFixed(3)})`);
    }
  }
  // the warm haze along the horizon toward the sun
  check(uSunset.toward[0] > uSunset.toward[2], `${id} sunset: the haze toward the sun is warm (${uSunset.toward.map((v) => v.toFixed(4)).join(', ')})`);
  if (row.septemberNight > 1) septemberNightFails++;
  if (row.septemberSunset > 1) septemberSunsetFails++;
  rows.push(row);
}
if (table) {
  const f = (v) => v.toFixed(3).padStart(7);
  console.log(`${'map'.padEnd(12)} ${'kDay'.padStart(7)} ${'kNight'.padStart(7)} ${'kSunset'.padStart(7)} ${'airN'.padStart(7)} ${'airS'.padStart(7)} ${'farN/sky'.padStart(8)} ${'backS/sky'.padStart(9)} ${'septN'.padStart(7)} ${'septS'.padStart(7)}`);
  for (const r of rows) {
    console.log(`${r.id.padEnd(12)} ${f(r.kDay)} ${f(r.kNight)} ${f(r.kSunset)} ${f(r.airNight)} ${f(r.airSunset)} ${f(r.farNight).padStart(8)} ${f(r.backSunset).padStart(9)} ${f(r.septemberNight)} ${f(r.septemberSunset)}`);
  }
  console.log(failures.join('\n'));
}
assert.deepEqual(failures, [], `${failures.length} far-country checks fail`);
// the control: the September behaviour fails the targets (the glow the owner reported) — at sunset on every map, at
// night on most
assert.ok(septemberSunsetFails === maps.length, `the day bake glows at sunset on every map (${septemberSunsetFails}/${maps.length})`);
assert.ok(septemberNightFails >= Math.ceil(maps.length * 0.8), `the fifth-dimmed day bake glows at night on most maps (${septemberNightFails}/${maps.length})`);

// ---------------------------------------------------------------------------------------------- the wiring
{
  const runtime = readFileSync(new URL('../engine/battleAtmosphereRuntime.ts', import.meta.url), 'utf8');
  assert.match(runtime, /restoreHorizon\(\);\s*const relit = relightHorizonPanoramas\(root, options\.getRenderer\?\.\(\) \?\? null\);\s*if \(next\?\.timeOfDay === 'night'\) dimHorizon\(root, horizonColors, relit\);/,
    'the battle atmosphere relights the far panorama right after it applies the light, inside its covered prepare, and dims only what it could not relight');
  assert.ok(runtime.includes('if (!mesh.isMesh || relit.has(mesh)) return;'), 'a relit shell keeps its colour');
  assert.match(runtime, /noteHorizonDaySky\(root\);\s*options\.applyPreset\(/, 'the far panoramas note the day sky before a time of day is applied');
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
  assert.ok(/getRenderer: \(\) => renderer,/.test(main), 'main hands the battle atmosphere its renderer');
  const horizon = readFileSync(new URL('./maps/horizon.ts', import.meta.url), 'utf8');
  assert.ok(horizon.includes('lightPreset: deckPreset,'), 'the ring hands its panorama the map\'s sky block with its cloudscape');
  const pano = readFileSync(new URL('./horizonPanorama.ts', import.meta.url), 'utf8');
  assert.ok(pano.includes('if (!light) takeDayReference(published.atmosphere);'), 'a day bake keeps this map\'s sky as the day reference');
  assert.ok(pano.includes('const haze = horizonPanoramaHaze(published.atmosphere, sun, options.fogDensity'), 'the haze law takes the published sky of the light baked');
}

console.log(`horizonPanoramaRelight.selftest: ${maps.length} maps from the bake's own statements — by day the identity; at sunset and night the far surface lit no brighter than the near ground (nor against it than by day) and its air no brighter than the sky; at night the far woods, fields and rock under the sky just above them and the far sand and snow under the near; at sunset dark toward the sun under a warm haze and warmer away from it. The September bake fails at sunset on ${septemberSunsetFails} and at night on ${septemberNightFails} PASS`);
