// Round 42 (2026-09-23, AAA map program checks 4 "shaded faces bluer, lit faces keep local colour" and 11 "shadow
// colour = sky ambient"; owner audit: shaded slopes go black on Caldera, Skybridge and Mars). The terrain material
// adds the horizon sky's own colour (the fog colour the sky probe publishes) to steep faces turned away from the sun,
// weighted by slope and by how far the face turns from the sun, through Three's indirect-diffuse path. Measured on the
// wall-probe views: Caldera's inner east wall 6.6 → ~16 display luma against a 216 sky, Skybridge's shaded slope 21 →
// 33, lit faces unchanged to 0.1 luma, flat ground untouched. This receipt pins the contract, not the pixels.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const compact = (text) => text.replace(/\s+/g, ' ');

// 1. The weight: slope from ~28° (1 - n.y = 0.12) to 60° (0.50), times how far the face turns from the sun.
assert.ok(source.includes('gWallSky = smoothstep(0.12, 0.50, 1.0 - clamp(wn.y, 0.0, 1.0)) * (1.0 - smoothstep(-0.08, 0.30, dot(wn, uSunDirW)));'),
  'the sky-light weight is slope × turned-from-the-sun, on the world normal and the world sun direction');
assert.ok(/uniform vec3 uSunDirW;/.test(source) && /uniform float uWallSkyLift;/.test(source) && /float gWallSky = 0\.0;/.test(source),
  'the sun direction, the gain and the per-fragment weight are declared in the terrain common block');

// 2. The light: added to the indirect diffuse after Three's own lights, in the sky's (fog) colour, through the
//    material's Lambert BRDF — so a basalt wall stays dark and a limestone wall pale, and only under fog (every map).
const hook = compact(source);
assert.ok(hook.includes(compact(`'#include <lights_fragment_end>\\n#ifdef USE_FOG\\nreflectedLight.indirectDiffuse += fogColor * (uWallSkyLift * gWallSky) * BRDF_Lambert(diffuseColor.rgb);\\n#endif'`)),
  'the sky light joins the indirect diffuse after lights_fragment_end, gated to USE_FOG');
assert.ok(hook.includes(compact(`_mustReplace(shader.fragmentShader, '#include <lights_fragment_end>',`)),
  'the hook replaces the lights_fragment_end include (a missing include fails loudly)');

// 3. The gain and its per-map override, and a fresh program cache key for the new fragment.
const gain = Number((source.match(/const WALL_SKY_LIFT = ([0-9.]+);/) || [])[1]);
assert.ok(gain >= 4 && gain <= 10, `the default gain sits in the measured band (got ${gain})`);
assert.ok(source.includes('shader.uniforms.uWallSkyLift = { value: S.wallSkyLift ?? WALL_SKY_LIFT };'),
  'a map may author its own gain through splat.wallSkyLift');
assert.ok(/wallSkyLift\?: number;/.test(source), 'SplatConfig declares wallSkyLift');
assert.ok(source.includes("mat.customProgramCacheKey = () => 'world-terrain-splat-v41';"), // round 55 (2026-09-24): v39
  'the program cache key moved with the fragment change');

// 4. The sun direction matches the vista ring's formula (horizon.ts): azimuth from +z toward +x, elevation up.
const fn = source.match(/function skySunDirection\(sky[^)]*\): THREE\.Vector3 \{([\s\S]*?)\n\}/);
assert.ok(fn, 'skySunDirection exists');
assert.ok(fn[1].includes('Math.sin(sunAz) * Math.cos(sunEl), Math.sin(sunEl), Math.cos(sunAz) * Math.cos(sunEl)'),
  'the same (sin az · cos el, sin el, cos az · cos el) vector the horizon ring shades with');
assert.ok(fn[1].includes('?? 115') && fn[1].includes('?? 32'), 'the horizon defaults (115°, 32°) when a map authors no sun');
// numeric check of the formula for Caldera's preset (116°, 22°): the vector is unit length and points up-sun
const az = 116 * Math.PI / 180, el = 22 * Math.PI / 180;
const v = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-9 && v[1] > 0.37 && v[0] > 0.8 && v[2] < 0, 'Caldera sun: unit, 22° up, east-south-east');
assert.ok(source.includes('cfg?.sky ?? null,'), 'terrainBuildSteps hands the map sky preset to the material (plain property access: receipts re-evaluate the build steps in a sandbox)');
assert.ok(source.includes('shader.uniforms.uSunDirW = { value: skySunDirection(sky) };'), 'the material derives the sun vector from the preset itself');

console.log('wallSkyLight.selftest: sky light on steep faces turned from the sun — weight, indirect hook, gain/override, cache key and the shared sun vector pinned');
