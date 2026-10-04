// The grounded light model (2026-10-01, lighting lane): lightModel.ts pinned without a GPU. The transmittance the
// model integrates on the CPU agrees with the round-65 CPU twin of the atmosphere's LUT; the derived sun lands
// Verdant's authored key and warms and weakens toward the horizon; overcast greys and dims the sun and moves the
// light into the deck; the physical rig derives its sun (an authored day key never reaches it; the night's moon
// does), retires the anti-sun fill and the disc-folded environment fill; the exposure law adapts part of the way and
// stays bounded; the legacy rig survives unchanged without a summary and under a galaxy sky; and the wiring in
// sky.ts / lighting.ts / post.ts / renderer.ts / main.ts carries the model where the renderer applies it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXPOSURE_ADAPTATION, EXPOSURE_KEY, EXPOSURE_MAX, EXPOSURE_MIN, GROUND_SUNLIT_SHARE, LIGHT_SOLAR_IRRADIANCE, LOW_SUN_EV, NIGHT_EV, NIGHT_SKY_GLOW, OVERCAST_GROUND_RETURN, OVERCAST_SKY_CUT,
  SKY_DIFFUSE_CHROMA, SKY_DIFFUSE_GAIN, atmosphereTransmittance, deriveSun, exposureFor, linearToHex, whiteBalanceGains,
  EXPOSURE_ALBEDO_K, EXPOSURE_ALBEDO_REF, exposureAlbedoEV,
} from './lightModel.ts';
import {
  DEFAULT_GROUND_ALBEDO, EXPOSURE_REFERENCE_ILLUMINANCE, hexToLinear, isGalaxySky, lightTune, loadGroundedLightModel, luminance,
  resolveLightModel, resolveOvercast,
} from './lightModelCore.ts';
import { ATMO_GROUND_KM, skyPresetToAtmosphere } from './atmosphere.ts';
import { transmittanceDirect } from './atmosphere.test-support.mjs';
import { DEFAULT_SKY_PRESET } from './sky.ts';
import { getMapConfig } from '../world/maps/index.ts';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);
// 2026-10-02 (the boot weight): the grounded model loads behind the battle entry; until it is installed an open sky
// keeps the authored rig (lightModelCore.ts)
{
  const preset = { ...DEFAULT_SKY_PRESET, ...getMapConfig('verdant').sky };
  const args = [preset, skyPresetToAtmosphere(preset), { irradianceRaw: [0.05, 0.08, 0.14] }];
  assert.equal(resolveLightModel(...args).mode, 'legacy', 'before the grounded model loads, an open sky keeps the authored rig');
  await loadGroundedLightModel();
  assert.equal(resolveLightModel(...args).mode, 'physical', 'loaded, the grounded model lights it');
}
const verdantSky = { ...DEFAULT_SKY_PRESET, ...getMapConfig('verdant').sky };
const verdant = skyPresetToAtmosphere(verdantSky);

// ---- 1. the CPU transmittance is the LUT's integral (the round-65 twin, 40 steps, Bruneton's parameterization)
for (const [sky, el] of [[verdantSky, 32], [verdantSky, 7], [{ ...DEFAULT_SKY_PRESET, ...getMapConfig('monsoon').sky }, 24],
  [{ ...DEFAULT_SKY_PRESET, ...getMapConfig('desert').sky }, 44]]) {
  const p = skyPresetToAtmosphere({ ...sky, sunElevationDeg: el });
  const ours = atmosphereTransmittance(p, p.sunDir[1]);
  const twin = transmittanceDirect(ATMO_GROUND_KM + p.viewHeightKm, p.sunDir[1], p);
  for (let c = 0; c < 3; c++) near(ours[c], twin[c], twin[c] * 0.004 + 1e-4, `transmittance ch${c} at ${el}°`);
}
assert.deepEqual(atmosphereTransmittance(verdant, -0.2), [0, 0, 0], 'a sun below the horizon sends no direct light');

// ---- 2. the derived sun: Verdant's authored key, warmer and weaker toward the horizon
const day = deriveSun(verdant, 0);
near(day.intensity * luminance(day.color), 4.5 * luminance(hexToLinear(0xfff1dc)), 0.03, 'Verdant\'s 32° sun lands its authored irradiance');
assert.equal(Math.max(...day.color), 1, 'the authored convention: the brightest channel is 1');
assert.equal(linearToHex(day.color), day.colorHex);
near(LIGHT_SOLAR_IRRADIANCE, 4.99, 1e-9, 'the solar constant in light units (pinned to Verdant\'s key)');
let last = { irr: Infinity, blue: Infinity };
for (const el of [44, 32, 20, 12, 7, 3]) {
  const s = deriveSun(skyPresetToAtmosphere({ ...verdantSky, sunElevationDeg: el }), 0);
  const irr = s.intensity * luminance(s.color);
  assert.ok(irr < last.irr && s.color[2] < last.blue, `${el}°: weaker and warmer than the higher sun`);
  last = { irr, blue: s.color[2] };
}
const grey = deriveSun(verdant, 1);
assert.ok(grey.intensity * luminance(grey.color) < 0.15 * day.intensity * luminance(day.color), 'a closed deck leaves a tenth of the direct sun');
assert.ok(grey.color[2] > day.color[2], 'and greys its colour toward the cool deck light');

// ---- 3. the overcast fraction: authored, then the cloudscape, then the legacy deck rule
assert.equal(resolveOvercast({ lighting: { overcast: 0.4 }, cloudscape: { regime: 'overcast-stratus' } }), 0.4, 'the authored value wins');
assert.ok(resolveOvercast({ cloudscape: { regime: 'stratocumulus-deck' } }) > 0.6, 'a stratiform deck that casts no cloud shadows is overcast');
assert.equal(resolveOvercast({ cloudscape: { regime: 'fair-weather-cumulus' } }), 0, 'cumulus casts its own shadows: no overcast');
assert.equal(resolveOvercast({ cloudscape: { regime: 'altocumulus' } }), 0, 'a half-covered mid deck is not an overcast');
assert.equal(resolveOvercast({ cloudOpacity: 1, cloudOpacity2: 0.95, turbidity: 7.2 }), 0.8, 'the legacy deck rule (both decks closed, a turbid sky)');
assert.equal(resolveOvercast({ cloudOpacity: 1, cloudOpacity2: 0.6, turbidity: 4 }), 0);

// ---- 4. the physical rig
const irr = [0.11, 0.125, 0.16];
const clear = resolveLightModel(verdantSky, verdant, { irradianceRaw: irr }, { intensity: 4.5, colorHex: 0xfff1dc });
assert.equal(clear.mode, 'physical');
assert.equal(clear.sunIntensity, day.intensity, 'by day the model\'s own sun lights the scene');
assert.deepEqual(clear.sunColor, day.color);
const stale = resolveLightModel(verdantSky, verdant, { irradianceRaw: irr }, { intensity: 1.2, colorHex: 0xff8040 });
assert.equal(stale.sunIntensity, day.intensity, 'an authored day key (a stale preset, the legacy rig\'s) never reaches the physical sun');
assert.deepEqual(stale.sunColor, day.color);
assert.equal(clear.fillIntensity, 0, 'the anti-sun rescue fill is retired');
assert.equal(clear.hemiIntensity, 0, 'an open sky has no deck glow');
assert.equal(clear.envIntensity, 1, 'the environment shows the dome at its own radiance (a mirror reflects the sky the eye sees)');
near(clear.envDiffuseGain, SKY_DIFFUSE_GAIN, 1e-12, 'the sky\'s diffuse share takes the aerosol / cloud gain');
// 2026-10-03 (the skies-and-atmosphere lane; the gauntlet's wave 0: the shade under a hull rendered indigo on straw):
// the diffuse share keeps part of the clean dome's hue — the light real open shade takes from a clear sky is far whiter
// than a Rayleigh dome's (9 000–15 000 K, B/R 1.6–2.2, against the dome's 3.3–4)
near(clear.envDiffuseChroma, SKY_DIFFUSE_CHROMA, 1e-12, 'the sky\'s diffuse share keeps SKY_DIFFUSE_CHROMA of its hue');
assert.ok(SKY_DIFFUSE_CHROMA > 0.2 && SKY_DIFFUSE_CHROMA < 0.7, 'some of the sky\'s blue, never all of it, never none');
{
  const dome = [0.069, 0.130, 0.273]; // Verdant's measured dome irradiance (2026-10-03 census)
  const L = luminance(dome);
  const shade = dome.map((c) => L + SKY_DIFFUSE_CHROMA * (c - L));
  near(luminance(shade), L, 1e-12, 'the chroma keeps the luminance: the shade\'s level and the metered illuminance are unchanged');
  assert.ok(dome[2] / dome[0] > 3.3, 'the clean dome\'s own light is a deep Rayleigh blue');
  assert.ok(shade[2] / shade[0] > 1.5 && shade[2] / shade[0] < 2.2, `the shade light ${(shade[2] / shade[0]).toFixed(2)} B/R: open shade's 9 000–15 000 K`);
}
clear.groundRadiance.forEach((g, c) => near(g, DEFAULT_GROUND_ALBEDO[c] * (irr[c] + GROUND_SUNLIT_SHARE * clear.sunIntensity * clear.sunColor[c]
  * verdant.sunDir[1] / (Math.PI * SKY_DIFFUSE_GAIN)), 1e-12, `below the horizon: the ground under the sky, half of it sunlit (ch${c})`));
assert.ok(luminance(clear.groundRadiance) > 2 * luminance(DEFAULT_GROUND_ALBEDO.map((a, i) => a * irr[i])), 'a mirror turned down sees lit ground, not the shade');
const sunH = day.intensity * luminance(day.color) * verdant.sunDir[1];
const shadeH = Math.PI * luminance(irr) * SKY_DIFFUSE_GAIN;
assert.ok(sunH / shadeH > 3 && sunH / shadeH < 6, `open-ground sun over shade ${(sunH / shadeH).toFixed(2)}: a clear day's 3–6 : 1`);
near(clear.illuminance, sunH + shadeH, 1e-9, 'the metered illuminance is sun + sky on a level surface');
const overcastModel = resolveLightModel({ ...verdantSky, lighting: { overcast: 1 } }, verdant, { irradianceRaw: irr }, null);
near(overcastModel.envIntensity, 1 - OVERCAST_SKY_CUT, 1e-12, 'a closed deck replaces most of the clear sky');
assert.ok(overcastModel.hemiIntensity > shadeH, 'and glows brighter than the clear sky it hides');
assert.ok(overcastModel.illuminance < clear.illuminance, 'an overcast day is darker than a clear one');
assert.ok(overcastModel.exposure > clear.exposure, 'and the camera opens up for it');
assert.ok(overcastModel.exposure / clear.exposure < clear.illuminance / overcastModel.illuminance, 'part of the way: an overcast day still reads darker');
// 2026-10-03 (the gauntlet's wave 17 on Whiteout's chase: the overcast snow "darker and much bluer than the neutral overcast
// sky"): the deck sends back OVERCAST_GROUND_RETURN of what the ground sends up, in its own light — the direct light
// × g / (1 − g), g = overcast × the share × the ground's albedo — and the clear sky's share under a closed deck keeps
// none of the dome's blue
{
  const at = (overcast, groundAlbedoHex, tune) => {
    const saved = globalThis.__LIGHT_TUNE; globalThis.__LIGHT_TUNE = tune;
    try { return resolveLightModel({ ...verdantSky, lighting: { overcast, groundAlbedoHex } }, verdant, { irradianceRaw: irr }, null); }
    finally { globalThis.__LIGHT_TUNE = saved; }
  };
  const ratio = (overcast, hex) => {
    const m = at(overcast, hex, undefined), m0 = at(overcast, hex, { OVERCAST_GROUND_RETURN: 0 });
    const g = Math.min(0.9, overcast * OVERCAST_GROUND_RETURN * luminance(m.groundAlbedo));
    near(m.hemiIntensity - m0.hemiIntensity, m0.illuminance * g / (1 - g), 1e-9, `the returned light (overcast ${overcast}, ground ${hex.toString(16)})`);
    return m.illuminance / m0.illuminance;
  };
  const snowGain = ratio(1, 0xe5e7ec), grassGain = ratio(1, 0x6a7a4a), partGain = ratio(0.5, 0xe5e7ec);
  assert.ok(snowGain > 1.5 && snowGain < 1.8, `a snowfield under a closed deck: ×${snowGain.toFixed(2)}`);
  assert.ok(grassGain > 1.0 && grassGain < 1.12, `grass under the same deck: ×${grassGain.toFixed(2)}`);
  assert.ok(partGain > 1 && partGain < snowGain, `a half-closed deck returns less (×${partGain.toFixed(2)})`);
  near(ratio(0, 0xe5e7ec), 1, 1e-12, 'an open sky returns nothing');
  near(at(1, 0xe5e7ec, undefined).envDiffuseChroma, 0, 1e-12, 'a closed deck: the clear share without the dome\'s blue');
  near(at(0.5, 0xe5e7ec, undefined).envDiffuseChroma, SKY_DIFFUSE_CHROMA * 0.5, 1e-12, 'half the hue under half a deck');
  const snowDeck = at(1, 0xe5e7ec, undefined), snowDeck0 = at(1, 0xe5e7ec, { OVERCAST_GROUND_RETURN: 0 });
  assert.ok(snowDeck.exposure < snowDeck0.exposure, 'the camera follows part of the way: the snow reads brighter, the deck a little darker');
  assert.ok(snowDeck.illuminance * snowDeck.exposure > snowDeck0.illuminance * snowDeck0.exposure, 'the snow keeps most of its gain on screen');
}
const authoredGround = resolveLightModel({ ...verdantSky, lighting: { groundAlbedoHex: 0xd8d4cc, skyLight: 1.2, exposureEV: 1, warmth: 0.1, saturation: 0.9, contrast: 1.05 } },
  verdant, { irradianceRaw: irr }, null);
assert.ok(authoredGround.groundAlbedo[1] > 0.6, 'snow\'s albedo from the lighting block');
near(authoredGround.envDiffuseGain, SKY_DIFFUSE_GAIN * 1.2, 1e-12);
assert.equal(authoredGround.saturation, 0.9); assert.equal(authoredGround.contrast, 1.05);
assert.ok(authoredGround.whiteBalance[0] > authoredGround.whiteBalance[2], 'a warm climate shift');

const nightModel = resolveLightModel({ ...verdantSky, skyIntensity: 0.08, sunElevationDeg: 24 }, skyPresetToAtmosphere({ ...verdantSky, sunElevationDeg: 24 }),
  { irradianceRaw: irr.map((v) => v * 0.08) }, { intensity: 0.6, colorHex: 0xafc3ec });
near(nightModel.night, 1, 1e-9, 'the night preset\'s dimmed dome is a full night');
near(nightModel.hemiIntensity, NIGHT_SKY_GLOW, 1e-9, 'the night sky\'s own glow rides the hemisphere');
assert.ok(nightModel.hemiSky[2] > nightModel.hemiSky[0] * 1.5, 'in the moonlit sky\'s blue');
assert.ok(nightModel.exposure > clear.exposure, 'the camera opens for the night');
const nightKey = (nightModel.illuminance * nightModel.exposure) / (clear.illuminance * clear.exposure);
// (2026-10-03: the night's camera is the owner's — "a little more visible, not darker", 2026-09-14 — whatever the day key:
// the key, its bound and NIGHT_EV hold 1.5 × 2.6 × 2^−0.25 between them)
near(nightModel.exposure, 1.5 * 2.6 * 2 ** -0.25, 0.02 * nightModel.exposure, 'the night\'s camera (the key, the bound and the night EV)');
near(EXPOSURE_KEY * EXPOSURE_MAX * 2 ** NIGHT_EV, 1.5 * 2.6 * 2 ** -0.25, 0.01, 'NIGHT_EV holds it with the day key');
assert.ok(nightKey > 0.2 && nightKey < 0.35, `and the night reads as night, a little more visible than the old rig's (${nightKey.toFixed(2)} of the day's key)`);
near(nightModel.sunIntensity, 0.6, 1e-9, 'the night\'s direct light is the authored moon');
hexToLinear(0xafc3ec).forEach((v, c) => near(nightModel.sunColor[c], v, 1e-12, `the moon's colour ch${c}`));
assert.ok(luminance(nightModel.groundRadiance) < 0.2 * luminance(clear.groundRadiance), 'the night\'s ground is moonlit, not the day\'s');
const overcastNight = resolveLightModel({ ...verdantSky, skyIntensity: 0.08, sunElevationDeg: 24, lighting: { overcast: 1 } },
  skyPresetToAtmosphere({ ...verdantSky, sunElevationDeg: 24 }), { irradianceRaw: irr.map((v) => v * 0.08) }, { intensity: 0.6, colorHex: 0xafc3ec });
assert.ok(overcastNight.hemiIntensity < NIGHT_SKY_GLOW + 0.15, `a deck at night passes the moon, not the day's sun (${overcastNight.hemiIntensity.toFixed(3)})`);

// a galaxy sky (the space maps: the dome forced to the stars over a daylight key) keeps the authored rig, never the night
const galaxySky = { ...verdantSky, nightSky: 1, skyIntensity: 0.06, sunIntensity: 3.2, sunColorHex: 0xe4ebff, hemiIntensity: 0.56, fillIntensity: 0.36 };
assert.ok(isGalaxySky(galaxySky) && !isGalaxySky(verdantSky) && !isGalaxySky({ ...verdantSky, skyIntensity: 0.08 }));
const galaxy = resolveLightModel(galaxySky, verdant, { irradianceRaw: irr }, { intensity: 3.2, colorHex: 0xe4ebff });
assert.equal(galaxy.mode, 'legacy'); assert.equal(galaxy.night, 0, 'a galaxy sky\'s key is daylight');
assert.equal(galaxy.sunIntensity, 3.2); assert.equal(galaxy.fillIntensity, 0.36);

// the vehicles' readability lift: whole at Verdant's key under an open sky, faded as the camera opens and under a deck
near(clear.vehicleReadability, Math.min(1, EXPOSURE_KEY / clear.exposure), 1e-12, 'an open sky keeps the lift (bounded by the camera)');
assert.ok(clear.vehicleReadability > 0.85, `Verdant keeps its calibrated lift (${clear.vehicleReadability.toFixed(2)})`);
assert.ok(overcastModel.vehicleReadability < 0.35, `a closed deck lights every face: the lift fades (${overcastModel.vehicleReadability.toFixed(2)})`);
assert.ok(nightModel.vehicleReadability < clear.vehicleReadability, 'the opened night camera needs less of the scene-linear floor');
assert.equal(galaxy.vehicleReadability, 1, 'the authored rig keeps its calibration');

// the golden hour: a 7° sun is exposed for its sky (the low-sun offset), the day's key is untouched
const sunsetSky = { ...verdantSky, sunElevationDeg: 7, skyIntensity: 0.72 };
const sunsetModel = resolveLightModel(sunsetSky, skyPresetToAtmosphere(sunsetSky), { irradianceRaw: irr.map((v) => v * 0.72) }, { intensity: 2.8, colorHex: 0xffbf80 });
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
near(sunsetModel.exposure, exposureFor(sunsetModel.illuminance, LOW_SUN_EV * (1 - smooth(6, 18, 7))), 1e-9, 'the low sun takes its offset');
near(clear.exposure, exposureFor(clear.illuminance), 1e-12, 'a 32° sun takes none');
assert.ok(sunsetModel.sunColor[2] < clear.sunColor[2] * 0.8, 'and its light is the long path\'s warm');

// ---- 5. the exposure law
near(exposureFor(3), EXPOSURE_KEY, 1e-12, 'Verdant\'s key at the reference illuminance');
near(exposureFor(3, 1), 2 * EXPOSURE_KEY, 1e-12, 'an EV offset doubles');
near(exposureFor(1.5) / exposureFor(3), Math.pow(2, EXPOSURE_ADAPTATION), 1e-9, 'half the light, a partial adaptation');
near(exposureFor(1e-6), EXPOSURE_KEY * EXPOSURE_MAX, 1e-12, 'a night scene stays a night scene (the adaptation is bounded around the key)');
near(exposureFor(1e6), EXPOSURE_KEY * EXPOSURE_MIN, 1e-12);
for (const w of [-1, -0.3, 0, 0.4, 1]) near(luminance(whiteBalanceGains(w)), 1, 1e-12, `white balance ${w} keeps luminance`);

// ---- 6. the legacy rig without a summary (the Preetham tier, a failed readback)
const legacy = resolveLightModel({ sunIntensity: 3.6, sunColorHex: 0xfae8d0, hemiIntensity: 0.46, envIntensity: 0.27, postExposure: 0.96 }, null, null);
assert.equal(legacy.mode, 'legacy');
assert.equal(legacy.sunIntensity, 3.6); assert.equal(legacy.envIntensity, 0.27); assert.equal(legacy.fillIntensity, 0.66);
near(legacy.hemiIntensity, 0.46 + 0.15, 1e-12, 'the authored hemisphere and its bounce floor');
assert.equal(legacy.envDiffuseGain, 1); assert.equal(legacy.envDiffuseChroma, 1, 'the legacy rig keeps its environment as it was');

// ---- 6b. the bright-ground lift (2026-10-03; the gauntlet's wave 7: a median-matched key greyed the snow): a snowfield
// opens about a third of a stop at K 0.25 (the gauntlet's wave 19, with the deck's ground return brightening an overcast
// snowfield by itself; K 0.42 before it), a ground at or under the reference is untouched
assert.equal(EXPOSURE_ALBEDO_K, 0.25, 'about a third of a stop on Frosthollow');
assert.ok(Math.abs(exposureAlbedoEV(0.799) - 0.3) < 0.03, `Frosthollow opens about a third of a stop by default (${exposureAlbedoEV(0.799).toFixed(3)})`);
assert.equal(exposureAlbedoEV(0.338), 0, 'Sirocco\'s sand (0.34) is untouched');
{
  const saved = globalThis.__LIGHT_TUNE;
  globalThis.__LIGHT_TUNE = { EXPOSURE_ALBEDO_K: 0.42 };
  near(exposureAlbedoEV(0.799), 0.42 * Math.log2(0.799 / EXPOSURE_ALBEDO_REF), 1e-12, 'Frosthollow\'s snow');
  assert.ok(exposureAlbedoEV(0.799) > 0.45 && exposureAlbedoEV(0.799) < 0.55, 'about half a stop');
  assert.equal(exposureAlbedoEV(EXPOSURE_ALBEDO_REF), 0, 'the reference ground is untouched');
  assert.equal(exposureAlbedoEV(0.16), 0, 'a darker ground never darkens');
  assert.ok(exposureAlbedoEV(5) <= 0.75 + 1e-12, 'capped');
  globalThis.__LIGHT_TUNE = saved;
}
assert.match(readFileSync(new URL('./lightModel.ts', import.meta.url), 'utf8'), /\+ \(1 - night\) \* exposureAlbedoEV\(luminance\(ground\)\)\);/, 'by day, on the map\'s ground albedo');

// ---- 7. the wiring
const sky = readFileSync(new URL('./sky.ts', import.meta.url), 'utf8');
assert.match(sky, /if \( uEnvBake > 0\.5 \) \{[\s\S]{0,700}gl_FragColor = vec4\( mix\( max\( skyCol, vec3\( 0\.0 \) \) \* uSkyIntensity, uEnvGround, below \), 1\.0 \);\s*return;/,
  'the environment bakes the raw sky (no knee, no disc) over the shaded ground');
assert.match(sky, /atmosphereMaterial\.uniforms\.uEnvBake\.value = physicalEnvBake\(\) \? 1 : 0;[\s\S]{0,300}fromScene\(envScene\)[\s\S]{0,300}uEnvBake\.value = 0;/, 'only for the synchronous bake');
assert.match(sky, /const physicalEnvBake = \(\): boolean => physicalEnvIntensity != null && !scene\.userData\.lightEnclosed;/,
  'only where the grounded model lights the scene (the Garage and a galaxy sky keep the full dome\'s bake)');
assert.match(sky, /physicalEnvIntensity = model\.mode === 'physical' \? model\.envIntensity : null;/);
assert.equal(sky.match(/atmosphereKeySuffix = environmentKeySuffix\(\);/g)?.length, 3, 'every bake keys the environment by its mode');
assert.match(sky, /\(scene\.userData\.lightEnclosed \? null : physicalEnvIntensity\)\s*\?\? Math\.max\(preset\.envIntensity, ENV_INTENSITY_FLOOR\)/,
  'the model\'s environment intensity on the physically based dome, the authored floor in an enclosed presentation');
const lighting = readFileSync(new URL('./lighting.ts', import.meta.url), 'utf8');
assert.match(lighting, /fill\.intensity = model\.mode === 'physical' \? 0 : \(opts\.fillIntensity \?\? FILL_INTENSITY\);/, 'the grounded rig drives the fill to zero');
assert.doesNotMatch(lighting, /fill\.visible = false/, 'without leaving the light signature (no program recompiles between rigs)');
assert.match(lighting, /scene\.userData\.lightModel = model;/, 'the rig publishes the model the output pass reads');
assert.match(lighting, /scene\.userData\.lightEnclosed = farCascadeDormant;/, 'the rig publishes the enclosed presentation');
assert.match(lighting, /const physical = physicalRig && !farCascadeDormant/, 'the Garage keeps the authored rig');
const post = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
assert.match(post, /outputColor\.rgb \*= uExposure \* uWhiteBalance;[\s\S]{0,200}mix\( vec3\( sceneLuma \), outputColor\.rgb, uSatLinear \)[\s\S]{0,1100}outputColor\.rgb = 0\.18 \* pow\( max\( outputColor\.rgb, vec3\( 1e-6 \) \) \* \( 1\.0 \/ 0\.18 \), vec3\( uContrast \) \);\s*\}\s*#ifdef LINEAR_TONE_MAPPING/,
  'exposure, white balance, the scene-referred saturation and contrast are linear, before the tone curve');
assert.doesNotMatch(post, /GRADE_PIVOT|GRADE_BLACK_LIFT|GRADE_SHADOW_TINT|GRADE_GREEN_DESAT|GRADE_KNEE/, 'the ACES-era grade stack is retired');
// 2026-10-02: the enclosed Garage keeps its authored rig, tuned under ACES's steep shoulder; under AgX its spot-lit
// highlights compressed (the boot frame's p95 182 → 161; the showroom region's p90/p95/p99 197/207/215 → 162/179/194,
// its median 87 against ACES's 82). A display shoulder for the enclosed presentation only restores the highlight range
// and keeps the look below it
assert.match(post, /u\.uHighlightLift\.value = scene\.userData\.lightEnclosed \? lightTune\('GARAGE_HIGHLIGHT_LIFT', GARAGE_HIGHLIGHT_LIFT\) : 0;/,
  'the shoulder belongs to the enclosed presentation (a battle frame never takes it)');
assert.match(post, /float hlL = max\( dot\( col, vec3\( 0\.2126, 0\.7152, 0\.0722 \) \), 1e-4 \);\s*float hlD = max\( 1\.0 - hlL, 0\.0 \);\s*float hlLift = hlL \+ uHighlightLift \* hlL \* hlD \* sqrt\( hlD \) \* smoothstep\( 0\.36, 0\.66, hlL \);\s*col = clamp\( col \* \( hlLift \/ hlL \), 0\.0, 1\.0 \);/,
  'a luma shoulder that keeps each pixel\'s hue');
{
  const lift = Number(post.match(/const GARAGE_HIGHLIGHT_LIFT = ([0-9.]+);/)?.[1]);
  assert.ok(lift > 0 && lift < 1.2, `a bounded shoulder (${lift})`);
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const shoulder = (l) => l + lift * l * Math.pow(Math.max(1 - l, 0), 1.5) * ss(0.36, 0.66, l);
  for (const l of [0, 24 / 255, 0.2, 87 / 255, 0.36]) near(shoulder(l), l, 1e-12, `the dark bay and the midtones up to the showroom's median keep their level (${(l * 255).toFixed(0)})`);
  near(shoulder(1), 1, 1e-12, 'white stays white');
  let previous = -1;
  for (let l = 0; l <= 1.0000001; l += 0.001) {
    const v = shoulder(Math.min(l, 1));
    assert.ok(v > previous && v <= 1, `monotonic and never past white (${l.toFixed(3)})`);
    previous = v;
  }
  // a monotonic map moves each percentile of the showroom (canvas pixels only) to the mapped value: the AgX boot's
  // p90/p95/p99 reach the ACES showroom's
  near(shoulder(162 / 255) * 255, 197, 3, 'the showroom p90 (162 → the ACES 197)');
  near(shoulder(179 / 255) * 255, 207, 3, 'its p95 (179 → 207)');
  near(shoulder(194 / 255) * 255, 215, 3, 'its p99 (194 → 215)');
}
// the aerial haze is a layer over the ground: a high camera looks down through less of it (the census bird view)
assert.match(post, /float x = -viewZ \* uDensity \* hzLayer;/, 'the extinction curve takes the layer factor');
assert.match(post, /float x2 = hzD \* dHaze \* hzLayer;/, 'and the scatter-in curve');
assert.match(post, /const datum = Number\.isFinite\(ground\) \? ground : 0;\s*aerial\.uniforms\.uHazeDatum\.value = datum;/, 'the datum is the ground under the camera');
{
  const H = 300;
  const fromCam = (y0, y1) => Math.abs(y0 - y1) < 1 ? Math.exp(-0.5 * (y0 + y1) / H) : H * (Math.exp(-y1 / H) - Math.exp(-y0 / H)) / (y0 - y1);
  const fromGround = (y1) => y1 < 1 ? Math.exp(-0.5 * y1 / H) : H * (1 - Math.exp(-y1 / H)) / y1;
  const layer = (y0, y1) => (y0 > 1 ? Math.min(1, fromCam(y0, y1) / fromGround(y1)) : 1);
  assert.equal(layer(0.5, 0), 1, 'a camera on the ground sees the full haze');
  near(layer(4, 0), 1, 0.01, 'the chase camera (4 m) is unchanged');
  near(layer(300, 0), 0.632, 0.002, 'the census bird (300 m over the ground) looks through 63 % of it');
}
const renderer = readFileSync(new URL('./renderer.ts', import.meta.url), 'utf8');
assert.match(renderer, /renderer\.toneMapping = THREE\.AgXToneMapping;/, 'AgX');
assert.match(renderer, /renderer\.toneMappingExposure = 1\.0;/, 'the exposure is the light model\'s');
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(sky, /resolveLightModel\(preset, params, \{ irradianceRaw: [^}]*\},\s*authoredSunOf\(preset as LightModelPreset\)\)/, 'the environment\'s ground sees the same moon the rig lights');
assert.match(lighting, /const authoredSun = authoredSunOf\(opts\);/);
assert.match(main, /setSun: \(skyConfig\) => lighting\.setSun\(sky\.sunDir, withWorldCloudscape\(skyConfig\)\),/, 'the world activation sets the light with the deck');
assert.match(main, /getBattleSkyConfig: \(\) => withWorldCloudscape\(currentWorld\(\)\?\.config\.sky \?\? null\),/, 'and so does the Garage trim\'s restore');
assert.match(main, /post\.setGroundHeightSource\(\(x, z\) => hfProxy\.getHeightAt\(x, z\)\);/, 'the battlefield ground feeds the haze layer');
assert.match(main, /getLightReadability: \(\) => \(scene\.userData\.lightModel as \{ vehicleReadability\?: number \} \| undefined\)\?\.vehicleReadability \?\? 1,/,
  'the battle atmosphere reads the light\'s readability share');

// ---- the boot weight (2026-10-02): the grounded model loads behind the battle entry. The boot chunk's importers take
// the core (types, the authored rig, the dispatcher); the battle atmosphere's acquisition and the capture staging load
// the grounded model before they light an open sky; until then every resolve is the authored rig
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const core = read('./lightModelCore.ts');
assert.doesNotMatch(core, /from '\.\/lightModel\.ts'/, 'the core never imports the grounded model statically');
for (const [file, src] of [['lighting.ts', lighting], ['sky.ts', sky], ['post.ts', post]]) {
  assert.match(src, /from '\.\/lightModelCore\.ts';/, `${file} takes the core`);
  assert.doesNotMatch(src, /from '\.\/lightModel\.ts'/, `${file} stays off the grounded model (the boot chunk)`);
}
// the grounded chunk imports nothing at runtime (its chunk shares no module with the boot closure): the core hands it
// the atmosphere; its local helpers match the core's
const grounded = read('./lightModel.ts');
assert.doesNotMatch(grounded.replace(/^import type [^;]+;$/gm, ''), /^import /m, 'the grounded model has no runtime import');
assert.match(core, /import\('\.\/lightModel\.ts'\)/, 'the core loads it on demand');
assert.match(read('./battleAtmosphereAccess.ts'), /Promise\.all\(\[loadRuntime\(\), loadGroundedLightModel\(\), loadCloudscapeLayers\(\)\]\)/, 'with the battle atmosphere\'s covered acquisition');
assert.match(read('../main.ts'), /await Promise\.all\(\[import\('\.\/dev\/shotRuntime\.ts'\), loadGroundedLightModel\(\), loadCloudscapeLayers\(\)\]\)/,
  'and the capture staging (the census and the map probes stage maps without the battle atmosphere)');
assert.equal(EXPOSURE_REFERENCE_ILLUMINANCE, 3.0);
near(exposureFor(EXPOSURE_REFERENCE_ILLUMINANCE), EXPOSURE_KEY, 1e-12, 'the handed-over meter reference');
for (const hex of [0x000000, 0x7c2410, 0xe5e7ec, 0xffffff]) {
  const a = hexToLinear(hex), b = resolveLightModel({ ...verdantSky, lighting: { groundAlbedoHex: hex } }, skyPresetToAtmosphere(verdantSky), { irradianceRaw: [0, 0, 0] }).groundAlbedo;
  a.forEach((v, c) => near(b[c], v, 1e-15, `the grounded model's own hex conversion matches the core's (#${hex.toString(16)} ch${c})`));
}
globalThis.__LIGHT_TUNE = { EXPOSURE_KEY: 2 };
near(exposureFor(EXPOSURE_REFERENCE_ILLUMINANCE), 2, 1e-12, 'its tuning hook reads the same page tune as the core\'s');
near(lightTune('EXPOSURE_KEY', 1), 2, 1e-12);
delete globalThis.__LIGHT_TUNE;

console.log(`lightModel.selftest: CPU transmittance = the LUT twin, Verdant key ${(day.intensity * luminance(day.color)).toFixed(2)}, sun/shade ${(sunH / shadeH).toFixed(2)}:1, overcast, exposure law, legacy rig and wiring PASS`);
