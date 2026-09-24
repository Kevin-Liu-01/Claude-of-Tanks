// Round 65 (2026-09-24): the physically based atmosphere — Hillaire 2020 — pinned without a GPU. The shipped GLSL
// (atmosphere.ts) and the CPU twin (atmosphere.test-support.mjs) are built from the same constants, share the LUT
// parameterizations and the march structure; the GPU summary readback agreed with the twin to 0.2 % on verdant and
// desert on 2026-09-24 (.qa-dev/r65-atmo-probe.mjs, headless ANGLE). This receipt pins: the constants in the GLSL text,
// the transmittance parameterization's round trip, the physical invariants of the model, the calibration mapping and its
// residual against the legacy dome on the twelve good maps, the legacy twin's own values, the keys and the support gate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ATMOSPHERE_CORE_GLSL, ATMOSPHERE_SKY_GLSL, ATMO_CALIBRATION, ATMO_GROUND_KM, ATMO_LUT_SIZES, ATMO_MEDIUM, ATMO_STEPS, ATMO_SUN_DISC_COS, ATMO_TOP_KM,
  atmosphereKey, atmosphereSupported, skyPresetToAtmosphere, sunDirectionOf,
} from './atmosphere.ts';
import {
  CpuAtmosphere, LEGACY_DEFAULT_PRESET, calibrationDirections, calibrationResidual, cpuSummary, knee, legacySky, luminance,
  medium, miePhase, rayleighPhase, transmittanceDirect, transmittanceTexelToRMu, transmittanceUV,
} from './atmosphere.test-support.mjs';
import { getMapConfig } from '../world/maps/index.ts';

const source = readFileSync(new URL('./atmosphere.ts', import.meta.url), 'utf8');
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);

// ---- the GLSL carries the paper's medium, the LUT sizes and the steps
assert.deepEqual([ATMO_GROUND_KM, ATMO_TOP_KM], [6360, 6460], 'the paper\'s Earth radii');
assert.deepEqual(ATMO_MEDIUM.rayleighScattering, [5.802e-3, 13.558e-3, 33.1e-3], 'the paper\'s Rayleigh coefficients');
assert.deepEqual([ATMO_MEDIUM.mieScattering, ATMO_MEDIUM.mieExtinction, ATMO_MEDIUM.mieScaleHeightKm, ATMO_MEDIUM.rayleighScaleHeightKm], [3.996e-3, 4.44e-3, 1.2, 8]);
assert.deepEqual(ATMO_MEDIUM.ozoneAbsorption, [0.650e-3, 1.881e-3, 0.085e-3]);
assert.deepEqual([ATMO_CALIBRATION.rayleighPerPreset, ATMO_CALIBRATION.miePerTurbidityCoefficient, ATMO_CALIBRATION.sunIlluminance], [0.7, 40, 8.0], 'the pinned calibration (round 65 eye test, c4)');
assert.deepEqual(ATMO_LUT_SIZES, { transmittance: [256, 64], multiScatter: [32, 32], skyView: [200, 100] }, 'LUT sizes as briefed');
assert.deepEqual(ATMO_STEPS, { transmittance: 40, multiScatterDirs: 8, multiScatter: 20, skyView: 32 });
for (const literal of [
  `vec3( ${ATMO_MEDIUM.rayleighScattering.map(String).join(', ')} ) * rayD`, `vec3( ${ATMO_MEDIUM.mieScattering} ) * uAtmoMieTint`,
  `vec3( ${ATMO_MEDIUM.mieExtinction} ) * mieD`, `vec3( ${ATMO_MEDIUM.ozoneAbsorption.map(String).join(', ')} ) * ozD`,
  '/ 8.0 )', '/ 1.2 )', '- 25.0 ) / 15.0',
]) {
  assert.ok(ATMOSPHERE_CORE_GLSL.includes(literal), `the built GLSL carries ${literal}`);
}
assert.ok(ATMOSPHERE_CORE_GLSL.includes(`const float ATMO_RG = ${ATMO_GROUND_KM}.0;`) && ATMOSPHERE_CORE_GLSL.includes(`const float ATMO_RT = ${ATMO_TOP_KM}.0;`));
// the builders' loops take their bounds from ATMO_STEPS (template expressions in the source)
assert.ok(source.includes('for ( int i = 0; i < ${ATMO_STEPS.transmittance}; i++ )'), 'transmittance march of ATMO_STEPS.transmittance steps');
assert.ok(source.includes('for ( int i = 0; i < ${ATMO_STEPS.multiScatterDirs * ATMO_STEPS.multiScatterDirs}; i++ )'), 'N×N multiple-scattering directions');
assert.ok(source.includes('for ( int s = 0; s < ${ATMO_STEPS.multiScatter}; s++ )'), 'multiple-scattering steps');
assert.ok(source.includes('for ( int i = 0; i < ${ATMO_STEPS.skyView}; i++ )'), 'sky-view steps');
assert.match(ATMOSPHERE_SKY_GLSL, /uniform sampler2D tAtmoSky;/, 'consumers sample one 2D LUT');
assert.match(ATMOSPHERE_SKY_GLSL, /vec3 atmoSkyVisible\( vec3 dir \)/);
assert.doesNotMatch(ATMOSPHERE_SKY_GLSL, /tAtmoTransmittance|tAtmoMultiScatter/, 'the sky chunk needs neither builder LUT');
assert.ok(source.includes('Cornette-Shanks'), 'the paper\'s aerosol phase');
near(ATMO_SUN_DISC_COS, 0.999956676946448, 1e-15, 'the legacy disc half angle (0.533°) is kept for the PMREM-folded fill');

// ---- the transmittance parameterization round-trips every texel and every (r, mu)
const [T_W, T_H] = ATMO_LUT_SIZES.transmittance;
for (let y = 0; y < T_H; y += 7) for (let x = 0; x < T_W; x += 17) {
  const [r, mu] = transmittanceTexelToRMu((x + 0.5) / T_W, (y + 0.5) / T_H);
  const [u, v] = transmittanceUV(r, mu);
  // texel centre (x + 0.5) / W maps to the unit-uv sub-range the samplers use; recover the texel index
  const xBack = u * (T_W + 1) - 0.5, yBack = v * (T_H + 1) - 0.5;
  near(xBack, x + 0.5 - 0.5 * ((T_W + 1) / T_W - 1) * 0, 0.51, `x round trip at ${x},${y}`);
  near(yBack, y + 0.5, 0.51, `y round trip at ${x},${y}`);
  assert.ok(r >= ATMO_GROUND_KM - 1e-6 && r <= ATMO_TOP_KM + 1e-6 && mu >= -1 && mu <= 1);
}

// ---- physical invariants (full quality, verdant's parameters)
const verdant = skyPresetToAtmosphere(LEGACY_DEFAULT_PRESET);
near(verdant.rayleighScale, 1.2 * ATMO_CALIBRATION.rayleighPerPreset, 1e-9, 'verdant rayleigh');
near(verdant.mieScale, 4 * 0.006 * 1.25 * ATMO_CALIBRATION.miePerTurbidityCoefficient, 1e-9, 'verdant mie');
const m0 = medium(0, verdant), m8 = medium(8, verdant);
for (let c = 0; c < 3; c++) {
  assert.ok(m0.extinction[c] >= m0.scattering[c], 'extinction never below scattering');
  near(m8.rayScat[c] / m0.rayScat[c], Math.exp(-1), 1e-9, 'Rayleigh scale height 8 km');
}
near(rayleighPhase(1), rayleighPhase(-1), 1e-12, 'Rayleigh phase is symmetric (the legacy dome\'s was not)');
assert.ok(miePhase(1, 0.8) > 50 * miePhase(-1, 0.8), 'a forward aerosol lobe');
const T = transmittanceDirect(ATMO_GROUND_KM + 0.05, 1, verdant), Tlow = transmittanceDirect(ATMO_GROUND_KM + 0.05, 0.05, verdant);
for (let c = 0; c < 3; c++) {
  assert.ok(T[c] > 0 && T[c] <= 1 && Tlow[c] > 0 && Tlow[c] < T[c], 'transmittance in (0, 1], lower at grazing sun');
}
assert.ok(T[0] > T[2], 'blue is extinguished more than red (a warm low sun)');
const atmo = new CpuAtmosphere(verdant);
const sun = verdant.sunDir, az = Math.atan2(sun[2], sun[0]);
const dir = (rel, el) => { const e = el * Math.PI / 180, a = az + rel * Math.PI / 180; return [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)]; };
const zenith = atmo.sky([0, 1, 0]), antiHorizon = atmo.sky(dir(180, 3)), sunSide = atmo.sky(dir(0, 20)), antiSide = atmo.sky(dir(180, 20));
for (const s of [zenith, antiHorizon, sunSide, antiSide]) assert.ok(s.every((v) => Number.isFinite(v) && v > 0), 'positive finite sky');
assert.ok(zenith[2] / zenith[0] > antiHorizon[2] / antiHorizon[0], 'the zenith is bluer than the horizon');
assert.ok(luminance(antiHorizon) > luminance(zenith), 'the horizon band is brighter than the zenith');
assert.ok(luminance(sunSide) > luminance(antiSide), 'the sun side is brighter than the anti-solar side at 20°');
const ms = atmo.multiScatter(ATMO_GROUND_KM + 1, 0.5);
assert.ok(ms.every((v) => Number.isFinite(v) && v > 0 && v < 1), 'multiple scattering finite, positive, bounded');
const summary = cpuSummary(atmo);
assert.ok(summary.elevationFalloff > 0.05 && summary.elevationFalloff < 1, `elevation falloff ${summary.elevationFalloff}`);
near(summary.elevationFalloff, 0.329, 0.02, 'verdant falloff at the pinned calibration (the GPU read the twin to 0.2 % on 2026-09-24)');
assert.deepEqual(knee([2, 2, 2]).map((v) => +v.toFixed(3)), [1.047, 1.047, 1.047], 'the dome shoulder at luminance 2 (1 + 0.45·(1 − e^−0.11))');
assert.deepEqual(knee([0.5, 0.5, 0.5]), [0.5, 0.5, 0.5], 'the shoulder leaves the sky below 1 untouched');

// ---- the calibration mapping and its overrides
assert.deepEqual(ATMO_CALIBRATION.groundAlbedo, [0.25, 0.25, 0.25]);
near(ATMO_CALIBRATION.legacyMieGain, 1.25, 1e-12, 'sky.ts\'s ×1.25 Mie gain is part of the mapping');
const desert = skyPresetToAtmosphere({ ...LEGACY_DEFAULT_PRESET, ...getMapConfig('desert').sky });
near(desert.rayleighScale, 0.85 * ATMO_CALIBRATION.rayleighPerPreset, 1e-9, 'the round-37 desert Rayleigh maps through');
assert.ok(desert.mieScale > verdant.mieScale, 'the dustier desert carries more aerosol');
const mars = skyPresetToAtmosphere({ ...LEGACY_DEFAULT_PRESET, ...getMapConfig('mars').sky });
assert.deepEqual([mars.rayleighScale, mars.mieScale, mars.mieG, mars.ozoneScale], [0.03, 60, 0.76, 0], 'Mars authors its thin CO2 sky');
assert.ok(mars.mieTint[0] > mars.mieTint[2] * 3, 'Martian dust absorbs blue');
assert.ok(mars.groundAlbedo[0] > mars.groundAlbedo[2], 'a rust ground bounce');
assert.equal(skyPresetToAtmosphere({ ...LEGACY_DEFAULT_PRESET, mieDirectionalG: 0.99 }).mieG, ATMO_CALIBRATION.mieGMax, 'mieG is clamped');
assert.deepEqual(sunDirectionOf(90, 0).map((v) => +v.toFixed(9)), [0, 1, 0]);
assert.notEqual(atmosphereKey(verdant, 1), atmosphereKey(verdant, 0.08), 'the night intensity is part of the key');
assert.notEqual(atmosphereKey(verdant, 1), atmosphereKey({ ...verdant, mieG: verdant.mieG + 1e-9 }, 1), 'every parameter is part of the key');
assert.equal(atmosphereSupported({ capabilities: { isWebGL2: true }, extensions: { has: () => false } }), false, 'float targets are required');
assert.equal(atmosphereSupported({ capabilities: { isWebGL2: true }, extensions: { has: (n) => n === 'EXT_color_buffer_float' } }), true);

// ---- the legacy twin (three r185 Sky + sky.ts's fragment) and the residual on the twelve good maps
const legacyZenith = legacySky(LEGACY_DEFAULT_PRESET, [0, 1, 0]);
assert.deepEqual(legacyZenith.map((v) => +v.toFixed(3)), [0.030, 0.106, 0.325], 'the legacy zenith (the fit target)');
assert.ok(legacySky(LEGACY_DEFAULT_PRESET, dir(0, 20))[2] > legacySky(LEGACY_DEFAULT_PRESET, dir(180, 20))[2] * 1.5,
  'the legacy dome halves its anti-solar Rayleigh (the structural residual the docs explain)');
const GOOD = ['verdant', 'urban', 'railyard', 'frontier', 'delta', 'monsoon', 'alpine', 'foundry', 'airfield', 'orchard', 'longleaf', 'reservoir'];
const residuals = {};
for (const id of GOOD) {
  const preset = { ...LEGACY_DEFAULT_PRESET, ...getMapConfig(id).sky };
  const coarse = new CpuAtmosphere(skyPresetToAtmosphere(preset), { msDirs: 4, msSteps: 10 });
  residuals[id] = calibrationResidual(preset, coarse).meanAbsLog;
  // 2026-09-24 at the pinned constants: verdant 0.438, urban 0.510, railyard 0.600 (the overcast preset's bright
  // legacy dome), frontier 0.392, delta 0.445, monsoon 0.381, alpine 0.389, foundry 0.447, airfield 0.454,
  // orchard 0.395, longleaf 0.378, reservoir 0.388 — mean 0.435 (the loss minimum's 0.325 whitened the sky)
  assert.ok(residuals[id] < 0.65, `${id}: mean |log| residual ${residuals[id].toFixed(3)} against the legacy dome stays under 0.65`);
}
const mean = Object.values(residuals).reduce((a, b) => a + b) / GOOD.length;
assert.ok(mean < 0.5, `mean residual over the good maps ${mean.toFixed(3)} (0.435 at the pinned constants)`);
assert.equal(calibrationDirections(verdant.sunDir).length, 30, 'the fit\'s 30 directions (31 minus the 35° direction 3° from the sun)');

console.log(`atmosphere.selftest: paper constants in the GLSL, LUT round trip, physical invariants, calibration mapping (verdant rayleigh ${verdant.rayleighScale.toFixed(2)} / mie ${verdant.mieScale.toFixed(1)}), Mars overrides, keys, legacy twin, good-map residual mean ${mean.toFixed(3)} PASS`);
