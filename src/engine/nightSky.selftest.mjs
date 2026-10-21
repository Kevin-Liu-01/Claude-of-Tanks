// 2026-10-14 (the SKY lane, SKY-02 / CL.14 "a real night", settled conflict 3): the night is skies-r1's stars hidden by
// cloud (3420b838b) and its scotopic shift (96f5f0ba6), with night-key's moonlit clouds (84d0ef10e nightKeyed()).
// Pinned without a GPU:
// - moonlit clouds: at full night the cloud layer's key is NIGHT_CLOUD_KEY (0.3) of the day law's and its sky light
//   NIGHT_CLOUD_AMBIENT (0.8), ramped by the night amount; a day or a sunset sky is untouched, and so are Mars' constant
//   sky (diurnal false) and a forced galaxy night (their key is daylight);
// - no stars over cloud: the dome reads the cloud layer's resolved history at its own fragment and fades the stars by its
//   transmittance (STAR_CLOUD_CUT), only at night, and the binding is cleared after the dome's draw;
// - a terrestrial night draws the pixel law (sparse, faint, pixel-wide stars); a galaxy sky keeps round 22's cell law.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveCloudLayerPreset, loadCloudscapeLayers } from './cloudPresets.ts';
import { DEFAULT_SKY_PRESET, STAR_CLOUD_CUT, STAR_LAW_PIXEL } from './sky.ts';
import { MARS_SKY_PRESET } from './marsAtmosphere.ts';
import { getMapConfig } from '../world/maps/index.ts';

await loadCloudscapeLayers();
const here = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');

// ---- moonlit clouds
const verdant = getMapConfig('verdant');
const at = (skyIntensity, extra = {}) => deriveCloudLayerPreset({ ...DEFAULT_SKY_PRESET, ...verdant.sky, cloudscape: verdant.clouds ?? null, skyIntensity, ...extra });
const unkeyed = (skyIntensity) => {
  globalThis.__LIGHT_TUNE = { NIGHT_CLOUD_KEY: 1, NIGHT_CLOUD_AMBIENT: 1 };
  try { return at(skyIntensity); } finally { delete globalThis.__LIGHT_TUNE; }
};
// (2026-10-17, 227: the approved night keeps the layer's moonlight whole — the default key and sky share are 1; the QA knobs
// still dim them, pinned here at the 10-09 values)
const keyed = (skyIntensity) => {
  globalThis.__LIGHT_TUNE = { NIGHT_CLOUD_KEY: 0.3, NIGHT_CLOUD_AMBIENT: 0.8 };
  try { return at(skyIntensity); } finally { delete globalThis.__LIGHT_TUNE; }
};
for (const skyIntensity of [0.08, 0.04, 0.19]) {
  const d = at(skyIntensity), u = unkeyed(skyIntensity);
  assert.equal(d.sunGain, u.sunGain, `the approved night's moonlight whole (intensity ${skyIntensity})`);
  assert.equal(d.ambientScale, u.ambientScale);
}
for (const [skyIntensity, night] of [[0.08, 1], [0.04, 1], [0.19, 0.5]]) {
  const k = keyed(skyIntensity), u = unkeyed(skyIntensity);
  const key = 1 - night * 0.7, amb = 1 - night * 0.2;
  assert.ok(Math.abs(k.sunGain - u.sunGain * key) < 1e-9, `night ${night}: the moon's key ${key} of the day law's (${k.sunGain} vs ${u.sunGain})`);
  assert.ok(Math.abs(k.ambientScale - u.ambientScale * amb) < 1e-9, `night ${night}: the sky's light ${amb} of the day law's`);
}
for (const skyIntensity of [1, 0.6, 0.3]) {
  const k = at(skyIntensity), u = unkeyed(skyIntensity);
  assert.equal(k.sunGain, u.sunGain, `a day or sunset sky (intensity ${skyIntensity}) keeps its key`);
  assert.equal(k.ambientScale, u.ambientScale);
}
{
  const forced = at(0.08, { nightSky: 1 }), plain = unkeyed(0.08);
  assert.equal(forced.sunGain, plain.sunGain, 'a forced galaxy night keeps the daylight key');
  const marsSky = { ...DEFAULT_SKY_PRESET, ...MARS_SKY_PRESET, skyIntensity: 0.08, cloudscape: { ...(getMapConfig('mars')?.clouds ?? {}), diurnal: false } };
  const m = deriveCloudLayerPreset(marsSky);
  globalThis.__LIGHT_TUNE = { NIGHT_CLOUD_KEY: 1, NIGHT_CLOUD_AMBIENT: 1 };
  const mu = deriveCloudLayerPreset(marsSky);
  delete globalThis.__LIGHT_TUNE;
  assert.equal(m.sunGain, mu.sunGain, "Mars' constant sky keeps its key");
}

// ---- no stars over cloud
const sky = here('./sky.ts');
assert.ok(STAR_CLOUD_CUT[0] > 0.3 && STAR_CLOUD_CUT[0] < STAR_CLOUD_CUT[1] && STAR_CLOUD_CUT[1] <= 1, 'the stars fade out over the layer\'s transmittance, a thin bank already hiding them');
assert.match(sky, /float cloudT = texture2D\( tStarClouds, \( gl_FragCoord\.xy - uStarClouds\.xy \) \* uStarClouds\.zw \)\.a;\s*starVis = smoothstep\( uStarCloudCut\.x, uStarCloudCut\.y, cloudT \);/,
  'the dome reads the layer\'s transmittance at its own fragment');
assert.match(sky, /stars \*= starVis;/, 'every star is dimmed by it');
assert.match(sky, /const history = \(u\.uNight\.value as number\) > 0\.001 \? volumetricClouds\?\.historyTexture \?\? null : null;/, 'only at night, from the layer\'s resolved history');
assert.match(sky, /atmosphereDome\.onAfterRender = \(\) => \{\s*atmosphereMaterial\.uniforms\.uStarCloudsOn\.value = 0;/, 'the binding cleared after the dome\'s draw (the environment bake shares the material)');
// ---- (227) every night draws round 22's cell law (the approved stars); the pixel law is a QA knob (STAR_PIXEL_LAW 1)
assert.ok(STAR_LAW_PIXEL[0] < 0.11 && STAR_LAW_PIXEL[1] < 0.09, 'the pixel law: sparser and fainter than round 22\'s carpet');
assert.match(sky, /if \(galaxySky \|\| !\(lightTune\('STAR_PIXEL_LAW', 0\) > 0\)\) \{/, 'the cell law by default');
assert.match(sky, /writeStarLaw\(u\.uStarLaw\.value as THREE\.Vector4, u\.uStarShape\.value as THREE\.Vector4, \(preset\.nightSky \?\? 0\) > 0\.5\)/, 'a forced night sky (the galaxy domes) keeps the cell law');
// ---- (the Earthrise 228 rebuild, 2026-10-18) the planet's own direction: the sun's unless a preset authors it, its phase
// then lit from the sun (sky.ts uPlanetDir / uPlanetSun / uPlanetPhase)
assert.equal(DEFAULT_SKY_PRESET.earthAzimuthDeg, null, 'no map but one that authors it moves its disc off the sun');
assert.equal(DEFAULT_SKY_PRESET.earthElevationDeg, null);
assert.match(sky, /u\.uPlanetDir\.value = sunDir;\s*u\.uPlanetPhase\.value = 0;/, 'unauthored, the disc is the live sun\'s direction under the fixed phase');
assert.equal(sky.split('cotNightSky( direction, uPlanetDir, ').length, 2, 'the dome draws the disc at the planet\'s direction');
assert.equal(sky.split('cotNightSky( normalize( direction ), uPlanetDir, ').length, 2, 'the legacy dome too');
assert.match(sky, /if \( uPlanetPhase > 0\.5 \) phaseL = normalize\( vec3\( dot\( uPlanetSun, mx \), dot\( uPlanetSun, my \), -dot\( uPlanetSun, moonDir \) \)/,
  'an authored disc takes its phase from the sun in the disc\'s frame');
{
  // the Moon's Earth: apart from the sun, gibbous (the share of its disc lit, (1 + cos(180 - angle)) / 2)
  const moonSky = getMapConfig('moon').sky, rad = Math.PI / 180;
  const dir = (az, el) => [Math.sin(az * rad) * Math.cos(el * rad), Math.sin(el * rad), Math.cos(az * rad) * Math.cos(el * rad)];
  const e = dir(moonSky.earthAzimuthDeg, moonSky.earthElevationDeg), sun = dir(moonSky.sunAzimuthDeg, moonSky.sunElevationDeg);
  const angle = Math.acos(e[0] * sun[0] + e[1] * sun[1] + e[2] * sun[2]) / rad, lit = (1 + Math.cos((180 - angle) * rad)) / 2;
  assert.ok(angle >= 90 && lit > 0.5 && lit < 0.95, `the Earth ${angle.toFixed(0)} degrees from the sun, gibbous (${(lit * 100).toFixed(0)} % lit)`);
}
console.log('nightSky.selftest: the approved night (moonlight whole; the knobs at 0.3 / 0.8 still key it; day, sunset, Mars and the galaxy domes untouched), no stars over cloud, the cell-law stars PASS');
