// lunarLight.selftest — the skies lane (2026-10-08; the gauntlet's wave 260 on Earthrise Basin: "the regolith and the hills
// carry a cold blue-white cast and soft drift-like forms, so the basin reads as a snowfield at night rather than the
// neutral grey sunlit Moon of the Apollo photographs"). Pins the lunar light and the regolith's colour:
// - the hard white sun above any atmosphere, not a cool one;
// - the authored rig's ambient colours neutral: the hemisphere's sky and ground and the anti-sun fill are the sunlit
//   regolith's grey, never the blue Earth's hue the rig took from the sky's irradiance;
// - the regolith's tones, tints and the far massifs a neutral or faintly warm grey (they leaned blue);
// - lighting.ts honours the authored colours on the authored rig only, and every other map keeps the rig's defaults.
// The terrain's forms (the "drift-like" relief) are the map's, not this receipt's. No GPU or art claim.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getMapConfig } from './maps/index.ts';
import { MAP_IDS } from './maps/catalog.ts';

const moon = getMapConfig('moon');
const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => v / 255);
const br = (c) => c[2] / Math.max(c[0], 1e-6);
const chroma = (c) => Math.max(...c) - Math.min(...c);

// 1. the sun: hard white (B/R at most 1, a whisper warm at most)
{
  const sun = rgb(moon.sky.sunColorHex);
  assert.ok(br(sun) <= 1.0 && br(sun) > 0.95 && chroma(sun) < 0.05, `a white sun (${moon.sky.sunColorHex.toString(16)})`);
  assert.ok(moon.sky.sunIntensity >= 3, 'the key stays hard');
}
// 2. the ambient: neutral, the regolith's; the shadows' level from below over above (the sunlit floor lights them)
for (const key of ['hemiSkyHex', 'hemiGroundHex', 'fillColorHex']) {
  const c = rgb(moon.sky[key]);
  assert.ok(chroma(c) < 0.04 && br(c) <= 1.0, `${key}: a neutral grey (${moon.sky[key].toString(16)}, B/R ${br(c).toFixed(2)})`);
}
{
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  assert.ok(lum(rgb(moon.sky.hemiGroundHex)) > lum(rgb(moon.sky.hemiSkyHex)) * 1.5, 'the regolith below lights the shadows more than the black sky');
}
// 3. the regolith: the splat's tones and tints, the far massifs, the minimap
{
  const tone = moon.splat.grassTone(0, 0, 0.5);
  const hue = tone[0], sat = tone[1];
  assert.ok((hue < 0.17 || hue > 0.95) && sat <= 0.03, `the regolith tone a faintly warm neutral (hue ${hue}, saturation ${sat})`);
  for (const key of ['tintA', 'tintB', 'roadTint']) {
    const t = moon.splat[key];
    assert.ok(t[2] <= t[0] && chroma(t) < 0.03, `${key} neutral (${t})`);
  }
  for (const key of ['baseHex', 'rockHex']) {
    const c = rgb(moon.horizon[key]);
    assert.ok(br(c) <= 1.0 && chroma(c) < 0.03, `the far massifs' ${key} neutral (${moon.horizon[key].toString(16)})`);
  }
  const mm = moon.minimap.base;
  assert.ok(mm[2] <= mm[0], 'the minimap\'s regolith neutral');
}
// 4. the rig: authored colours on the authored rig only; no other map authors them
{
  const src = readFileSync(new URL('../engine/lighting.ts', import.meta.url), 'utf8');
  for (const line of [
    'hemi.groundColor.setHex(opts.hemiGroundHex ?? HEMI_GROUND_COLOR);',
    'if (opts.hemiSkyHex != null) hemi.color.setHex(opts.hemiSkyHex);',
    'else applyHemisphereSkyHue();',
    "fill.color.setHex(model.mode !== 'physical' && opts.fillColorHex != null ? opts.fillColorHex : FILL_COLOR);",
    'lightRig.fillColor.copy(fill.color);',
  ]) assert.ok(src.includes(line), `lighting.ts: ${line}`);
  const authors = MAP_IDS.filter((id) => {
    const sky = getMapConfig(id).sky ?? {};
    return sky.hemiSkyHex != null || sky.hemiGroundHex != null || sky.fillColorHex != null;
  });
  assert.deepEqual(authors, ['moon'], `only Earthrise Basin authors the rig's ambient colours (${authors})`);
}
console.log('lunarLight.selftest: Earthrise Basin under a white sun, its shadows lit by the regolith\'s neutral grey (not the Earth\'s blue), its regolith, tints and far massifs neutral; the authored colours on the authored rig only PASS; no GPU/art claim');
