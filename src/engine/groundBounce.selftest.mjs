// Round 69 (2026-09-24): ground bounce — the lower-hemisphere view factor and its conservation against the sky
// half, the ground-lit law, the receiver factor, the excess-over-hemisphere irradiance (never negative, never more
// than sunlit ground reflects), the rig → uniform mapping, the GLSL term's literals and the lighting.ts wiring.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  GROUND_BOUNCE_GAIN, GROUND_BOUNCE_GLSL_PARS, GROUND_BOUNCE_GLSL_TERM, GROUND_BOUNCE_SELF_SHADE,
  GROUND_BOUNCE_SHADOWED_RECEIVER, GROUND_BOUNCE_UNDERSIDE_LIT, applyGroundBounceRig, attachGroundBounceUniforms,
  createGroundBounceUniforms, groundBounceGroundLit, groundBounceIrradiance, groundBounceRadiance,
  groundBounceReceiver, groundBounceViewFactor,
} from './groundBounce.ts';

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// 1. the view factor and the hemisphere split it conserves
assert.equal(groundBounceViewFactor(-1), 1);
assert.equal(groundBounceViewFactor(0), 0.5);
assert.equal(groundBounceViewFactor(1), 0);
for (let ny = -1; ny <= 1; ny += 0.125) {
  const ground = groundBounceViewFactor(ny), sky = 0.5 + 0.5 * ny; // Three's hemisphere weight for the sky pole
  assert.ok(near(ground + sky, 1), 'ground share + sky share = 1 for every normal');
}

// 2. the ground-lit law
const sunHigh = { x: 0, y: 1, z: 0 };
const sunLow = { x: 0.9, y: 0.3, z: 0 }; // low in the east
assert.equal(groundBounceGroundLit({ x: 0, y: -1, z: 0 }, sunHigh), GROUND_BOUNCE_UNDERSIDE_LIT, 'an underside sees half lit, half shaded ground');
assert.equal(groundBounceGroundLit({ x: 1, y: 0, z: 0 }, sunLow), 1, 'a flank facing the sun sees lit ground');
assert.ok(near(groundBounceGroundLit({ x: -1, y: 0, z: 0 }, sunLow), 1 - 0.7 * GROUND_BOUNCE_SELF_SHADE), 'a flank turned from a low sun sees its object\'s shadow');
assert.equal(groundBounceGroundLit({ x: -1, y: 0, z: 0 }, sunHigh), 1, 'no long shadow under a high sun');
assert.equal(groundBounceGroundLit({ x: 0, y: 0, z: 1 }, sunLow), 1, 'a flank side-on to the sun is not in its shadow');
assert.ok(groundBounceGroundLit({ x: -0.7071, y: -0.7071, z: 0 }, sunLow) > groundBounceGroundLit({ x: -1, y: 0, z: 0 }, sunLow) * 0.5, 'a lower face blends toward the underside law');

// 3. the receiver factor
assert.equal(groundBounceReceiver(0), GROUND_BOUNCE_SHADOWED_RECEIVER);
assert.equal(groundBounceReceiver(1), 1);
assert.equal(groundBounceReceiver(0.5), (GROUND_BOUNCE_SHADOWED_RECEIVER + 1) / 2);

// 4. energy: the excess over the hemisphere's ground pole, bounded by what sunlit ground reflects
const sunColor = new THREE.Color(0xfff1dc);
const tone = new THREE.Color(0x94815f);
const radiance = groundBounceRadiance(sunColor, 4.2, sunLow, tone);
assert.ok(near(radiance.g, sunColor.g * tone.g * 4.2 * 0.3 * GROUND_BOUNCE_GAIN, 1e-9), 'L = sun colour × intensity × sun.y × tone × gain');
assert.equal(groundBounceRadiance(sunColor, 4.2, { x: 0.5, y: -0.2, z: 0 }, tone).g, 0, 'a sun below the horizon lights no ground');
const hemi = new THREE.Color(tone.r * 0.5, tone.g * 0.5, tone.b * 0.5);
{
  const E = groundBounceIrradiance({ x: 0, y: -1, z: 0 }, sunHigh, 0, radiance, hemi);
  assert.ok(E.r >= 0 && E.g >= 0 && E.b >= 0, 'never negative');
}
assert.deepEqual(groundBounceIrradiance({ x: 0, y: 1, z: 0 }, sunLow, 1, radiance, hemi).toArray(), [0, 0, 0], 'an up-facing face sees no ground');
{
  const dim = new THREE.Color(0.01, 0.01, 0.01);
  assert.deepEqual(groundBounceIrradiance({ x: 0, y: -1, z: 0 }, sunLow, 1, dim, hemi).toArray(), [0, 0, 0],
    'shaded ground below the hemisphere\'s own pole adds nothing (and subtracts nothing)');
}
{
  const random = new THREE.Vector3();
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 400; i++) {
    random.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
    const v = rand();
    const E = groundBounceIrradiance(random, sunLow, v, radiance, hemi);
    const view = groundBounceViewFactor(random.y);
    for (const [c, k] of [['r', 0], ['g', 1], ['b', 2]]) {
      assert.ok(E[c] >= -1e-12, 'non-negative');
      assert.ok(E[c] <= radiance.toArray()[k] * view + 1e-9, 'never more than sunlit ground reflects into that view');
    }
  }
}
{
  // more bounce the further a face turns from the sky toward the horizon (the view factor grows over lit
  // ground); an underside, looking at the shaded ground under its own object, gets less than a flank but not none
  const radianceHigh = groundBounceRadiance(sunColor, 4.2, sunHigh, tone); // the ground lit by that high sun
  const at = (ny) => { const n = new THREE.Vector3(0.6, ny, 0).normalize(); return groundBounceIrradiance(n, sunHigh, 1, radianceHigh, hemi).g; };
  let last = -1;
  for (let ny = 1; ny >= 0; ny -= 0.1) { const E = at(ny); assert.ok(E >= last - 1e-12, 'growing down to the horizon'); last = E; }
  assert.ok(at(0) > at(0.5) && at(0.5) > at(1) && at(1) >= 0);
  const underside = groundBounceIrradiance({ x: 0, y: -1, z: 0 }, sunHigh, 1, radianceHigh, hemi).g;
  assert.ok(underside > 0 && underside < at(0), `an underside sees half shaded ground (${underside.toFixed(3)} < flank ${at(0).toFixed(3)})`);
}

// 5. the uniforms follow the rig
{
  const u = createGroundBounceUniforms();
  applyGroundBounceRig(u, { enabled: false, sunDir: sunLow, sunColor, sunIntensity: 4.2, groundTone: tone, hemiGround: tone, hemiIntensity: 0.5 });
  assert.deepEqual(u.uCotBounceRad.value.toArray(), [0, 0, 0], 'the lever off zeroes the radiance (the shader skips the block)');
  applyGroundBounceRig(u, { enabled: true, sunDir: sunLow, sunColor, sunIntensity: 4.2, groundTone: tone, hemiGround: tone, hemiIntensity: 0.5 });
  assert.ok(near(u.uCotBounceRad.value.y, radiance.g, 1e-9));
  assert.ok(near(u.uCotBounceHemi.value.y, tone.g * 0.5, 1e-9));
  assert.ok(near(u.uCotBounceSun.value.length(), 1, 1e-6), 'unit sun direction');
  const shader = { uniforms: {} };
  attachGroundBounceUniforms(shader, u);
  assert.equal(shader.uniforms.uCotBounceRad, u.uCotBounceRad, 'the very same uniform object rides every program');
  assert.equal(shader.uniforms.uCotSkyChroma, u.uCotSkyChroma); assert.equal(shader.uniforms.uCotShadowDim, u.uCotShadowDim);
  assert.equal(shader.uniforms.uCotShadowFacing, u.uCotShadowFacing); assert.equal(u.uCotShadowFacing.value, 0, 'the legacy dim until a rig says otherwise');
  assert.equal(shader.uniforms.uCotShadowDepth, u.uCotShadowDepth); assert.equal(u.uCotShadowDepth.value, 1, 'the full dims until a rig says otherwise');
  assert.equal(u.uCotSkyChroma.value, 1, 'the sky keeps its hue until a rig says otherwise');
}

// 6. the GLSL term carries the same law and literals
assert.ok(GROUND_BOUNCE_GLSL_PARS.includes('uniform vec3 uCotBounceRad;') && GROUND_BOUNCE_GLSL_PARS.includes('uniform vec3 uCotBounceHemi;')
  && GROUND_BOUNCE_GLSL_PARS.includes('uniform vec3 uCotBounceSun;'));
assert.ok(GROUND_BOUNCE_GLSL_TERM.includes(`* ${GROUND_BOUNCE_SELF_SHADE.toFixed(4)};`), 'self-shade literal');
assert.ok(GROUND_BOUNCE_GLSL_TERM.includes(`mix( ${GROUND_BOUNCE_UNDERSIDE_LIT.toFixed(4)}, cotSide, clamp( cotNw.y + 1.0, 0.0, 1.0 ) )`), 'underside law');
// (2026-10-06, the skies lane: re-pinned — the receiver reads the ambient dim's facing-corrected visibility; the raw CSM
// visibility counted a back face's self-shade twice, on top of cotSide)
assert.ok(GROUND_BOUNCE_GLSL_TERM.includes(`mix( ${GROUND_BOUNCE_SHADOWED_RECEIVER.toFixed(4)}, 1.0, clamp( cotAmbVis, 0.0, 1.0 ) )`), 'receiver law on the facing-corrected visibility');
assert.ok(!GROUND_BOUNCE_GLSL_TERM.includes('clamp( cotSunVis'), 'and not on the raw CSM visibility');
{
  // the term is inserted after lighting.ts computes cotAmbVis (it would not compile above it)
  const lighting = readFileSync(new URL('./lighting.ts', import.meta.url), 'utf8');
  const decl = lighting.indexOf('float cotAmbVis = cotSunVis;'), term = lighting.indexOf('${GROUND_BOUNCE_GLSL_TERM}');
  assert.ok(decl > 0 && term > decl, 'lighting.ts declares cotAmbVis before it inserts the term');
}
assert.ok(GROUND_BOUNCE_GLSL_TERM.includes('float cotView = clamp( 0.5 - 0.5 * cotNw.y, 0.0, 1.0 );'), 'view factor');
assert.ok(GROUND_BOUNCE_GLSL_TERM.includes('irradiance += max( uCotBounceRad * ( cotGroundLit * cotRecv ) - uCotBounceHemi, vec3( 0.0 ) ) * cotView;'), 'the excess, clamped, into the indirect diffuse');
assert.ok(GROUND_BOUNCE_GLSL_TERM.includes('( vec4( geometryNormal, 0.0 ) * viewMatrix ).xyz'), 'the world normal from the view normal');
assert.ok(GROUND_BOUNCE_GLSL_TERM.includes('if ( dot( uCotBounceRad, vec3( 1.0 ) ) > 0.0 )'), 'a zero radiance skips the block');

// 7. lighting.ts wiring
const lighting = readFileSync(new URL('./lighting.ts', import.meta.url), 'utf8');
assert.match(lighting, /iblIrradiance \*= cotAmbDim;\n\$\{GROUND_BOUNCE_GLSL_TERM\}\n\t#endif/, 'the term sits inside the RE_IndirectDiffuse block after the ambient dims');
// (2026-10-03: the cloud shade's varying follows the declarations, cloudShadeMap.ts; 2026-10-10, the shadows lane r2: and
// the cascades' seam law's uniform joins the CSM declarations, shadowCascadeLayout.ts)
assert.match(lighting, /THREE\.ShaderChunk\.lights_pars_begin = `#if defined\( USE_CSM \) && defined\( CSM_CASCADES \)\n\$\{GROUND_BOUNCE_GLSL_PARS\}\nuniform float uCotCsmFadeK;\n#endif\n#if defined\( COT_CLOUD_SHADE \) && defined\( USE_SHADOWMAP \)\nvarying float vCotCloudSun;\n#endif\n\$\{THREE\.ShaderChunk\.lights_pars_begin\}`;/,
  'the declarations precede every CSM fragment');
assert.match(lighting, /csm\.setupMaterial\(mat\);[\s\S]{0,900}?\{\s*\/\/ Round 69: the ground-bounce uniforms ride on every CSM registration \(groundBounce\.ts\)\.\s*const csmHook = mat\.onBeforeCompile;\s*mat\.onBeforeCompile = \(shader, rdr\) => \{\s*csmHook\(shader, rdr\);\s*attachGroundBounceUniforms\(shader, groundBounceUniforms\);\s*if \(extraHook\) extraHook\(shader, rdr\);/,
  'every CSM registration attaches the uniforms after the CSM hook and before the caller\'s hook');
assert.equal((lighting.match(/csm\.setupMaterial\(/g) || []).length, 1, 'setupShadowMaterial is the only registration path');
assert.match(lighting, /lightRig\.fillDir\.copy\(fill\.position\)\.normalize\(\);\s*applyGroundBounce\(\);/, 'applied once the rig exists');
assert.match(lighting, /lightRig\.sunIntensity = intensity;\s*lightRig\.sunColor\.setHex\(colorHex\);[\s\S]{0,400}applyGroundBounce\(\);\s*shadowFitCache\.invalidate\(\);/, 'and again in setSun, before the cascades refit');
// 2026-10-01 (the grounded light model, lightModel.ts): on the physically based sky the ground tone is the model's
// albedo and the pole the bounce subtracts is what the sky light already gives a face turned down (the environment's
// shaded ground + the deck's reflection), applied at full gain; the legacy rig keeps its own ground pole. Neither
// samples the terrain.
assert.match(lighting, /groundTone: model \? groundTone : hemi\.groundColor,\s*hemiGround: model \? groundPole : hemi\.groundColor, hemiIntensity: model \? 1 : hemi\.intensity,/,
  'the ground tone is the model\'s albedo on the grounded rig, the rig\'s own ground pole on the legacy one (no terrain sampler)');
assert.match(lighting, /groundBounceUniforms\.uCotSkyDiffuse\.value = model\.envDiffuseGain;/, 'the sky\'s diffuse gain rides the same uniforms');
// 2026-10-03 (the skies-and-atmosphere lane; the gauntlet's wave 0: grass in a tank's shadow rendered indigo and teal):
// the grounded rig's environment diffuse keeps part of the clean dome's hue about its luminance (lightModel.ts
// SKY_DIFFUSE_CHROMA), and its shadow dims the ambient neutrally at the legacy dim's luminance — the legacy rig's cool
// dim painted the sky's blue in a second time over a sky light already a deep Rayleigh blue
assert.ok(GROUND_BOUNCE_GLSL_TERM.startsWith('\n\tiblIrradiance = mix( vec3( dot( iblIrradiance, vec3( 0.2126, 0.7152, 0.0722 ) ) ), iblIrradiance, uCotSkyChroma ) * uCotSkyDiffuse;\n'),
  'the chroma and the diffuse gain shape the environment before the bounce adds the ground');
assert.ok(GROUND_BOUNCE_GLSL_PARS.includes('uniform float uCotSkyDiffuse;') && GROUND_BOUNCE_GLSL_PARS.includes('uniform float uCotSkyChroma;')
  && GROUND_BOUNCE_GLSL_PARS.includes('uniform vec3 uCotShadowDim;') && GROUND_BOUNCE_GLSL_PARS.includes('uniform float uCotShadowFacing;')
  && GROUND_BOUNCE_GLSL_PARS.includes('uniform float uCotShadowDepth;'));
// 2026-10-03 (the shade-fill lane): the dims keep to the faces turned toward the sun on the grounded rig — a face turned
// from the sun keeps its whole sky (the occluder that shades a face hides its circumsolar sky; a face turned away sees
// none of it); the legacy rig dims every shadowed face as before
assert.match(lighting, /float cotAmbVis = cotSunVis;\s*#ifdef OPAQUE\s*if \( uCotShadowFacing > 0\.0 \) \{\s*vec3 cotNf = normalize\( \( vec4\( geometryNormal, 0\.0 \) \* viewMatrix \)\.xyz \);\s*cotAmbVis = 1\.0 - \( 1\.0 - cotSunVis \) \* mix\( 1\.0, smoothstep\( -0\.05, 0\.25, dot\( cotNf, uCotBounceSun \) \), uCotShadowFacing \);\s*\}[\s\S]{0,400}?#endif/,
  'the facing rule, on solid faces (the cards in a crown or a sward hide each other\'s sky: they keep the dim)');
// 2026-10-04 (the skies lane: the light under a closed deck; the gauntlet's wave 82 on Titan Gorge: "crisp, hard-edged
// shadows"): the dims stand for the circumsolar sky an occluder hides; a closed deck's light comes from every direction
// alike, so they fade with the overcast — the ambient's and the specular's alike, after the facing rule
assert.match(lighting, /uCotShadowFacing \);\s*\}\s*\/\/ 2026-10-04 \(groundBounce\.ts uCotShadowDepth\)[^\n]*\n[^\n]*\n\s*cotAmbVis = 1\.0 - \( 1\.0 - cotAmbVis \) \* uCotShadowDepth;\s*#endif\s*vec3 cotAmbDim = mix\( uCotShadowDim, vec3\( 1\.0 \), cotAmbVis \);/,
  'the depth scales a solid face\'s shadowed share before both dims read it (the cards keep theirs: inside a crown they hide each other\'s sky)');
// (2026-10-05: by the deck's closure — a broken deck's gaps keep their circumsolar sky, its cells shade through the map)
// (2026-10-09, the shadows lane: and by a thin deck's beam — the sun's glow through it is circumsolar sky an occluder hides)
assert.match(lighting, /groundBounceUniforms\.uCotShadowDepth\.value = 1 - Math\.min\(1, Math\.max\(0, model\.overcast \* model\.deckClosure \* \(1 - \(model\.deckBeam \?\? 0\)\)\)\)\s*\* lightTune\('SHADOW_DIM_OVERCAST', SHADOW_DIM_OVERCAST\);/,
  'the grounded rig: the dims fade with the closed share of the overcast (QA: SHADOW_DIM_OVERCAST)');
assert.match(lighting, /groundBounceUniforms\.uCotShadowDepth\.value = 1;\s*groundBounceUniforms\.uCotShadowFacing\.value = 0;/, 'the legacy rig keeps them whole');
assert.match(lighting, /const SHADOW_DIM_OVERCAST = 1;/);
{
  // modelled: a sun-facing face in a cast shadow (visibility 0) under a closed deck keeps its whole ambient and specular
  const dims = (vis, depth, dimL = 0.874, spec = 0.55) => { const a = 1 - (1 - vis) * depth; return [dimL + (1 - dimL) * a, spec + (1 - spec) * a]; };
  assert.deepEqual(dims(0, 0), [1, 1], 'a closed deck: no dim in the cast shadow');
  assert.deepEqual(dims(0, 1), [0.874, 0.55], 'an open sky: the dims as before');
  assert.ok(Math.abs(dims(0, 1 - 0.787)[0] - (1 - 0.126 * 0.213)) < 1e-9, 'Frosthollow\'s 0.79 deck keeps a fifth of the dim');
}
assert.match(lighting, /vec3 cotAmbDim = mix\( uCotShadowDim, vec3\( 1\.0 \), cotAmbVis \);/, 'the shadow\'s ambient dim rides the shared uniform');
assert.match(lighting, /radiance \*= mix\( \$\{SHADOW_AMBIENT_SPEC_DIM\.toFixed\(3\)\}, 1\.0, cotAmbVis \);/, 'the specular dim follows the same rule');
// (2026-10-06, the skies lane: re-pinned — the bounce receiver reads the same facing-corrected visibility as the dims. A
// face toward the sun in a cast shadow still stands on shaded ground (its receiver keeps the cascade's 0.4); a face turned
// from the sun is in its own shadow, which cotSide already counts, so the raw visibility took its bounce twice)
assert.ok(GROUND_BOUNCE_GLSL_TERM.includes('clamp( cotAmbVis, 0.0, 1.0 )'), 'the bounce receiver reads the facing-corrected visibility (a cast shadow\'s ground stays shaded; a self-shaded face keeps its bounce)');
assert.match(lighting, /groundBounceUniforms\.uCotShadowFacing\.value = lightTune\('SHADOW_DIM_FACING', SHADOW_DIM_FACING\);/, 'the grounded rig keeps the dims to sun-facing faces');
assert.match(lighting, /groundBounceUniforms\.uCotShadowFacing\.value = 0;/, 'the legacy rig: every shadowed face, as before');
assert.match(lighting, /const SHADOW_DIM_FACING = 1;/);
{
  // the rule, modelled: a face turned 0.3 toward the sun in a cast shadow keeps the whole dim; a face turned from the sun
  // keeps its sky; the transition is smooth through grazing
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const ambVis = (sunVis, ndl, facing = 1) => 1 - (1 - sunVis) * (1 + (sm(-0.05, 0.25, ndl) - 1) * facing);
  assert.equal(ambVis(0, 0.3), 0, 'a sun-facing face in shadow: the full dim');
  assert.equal(ambVis(0, -0.2), 1, 'a face turned from the sun: no dim');
  assert.equal(ambVis(1, 0.3), 1, 'a sunlit face: no dim');
  assert.equal(ambVis(0, -0.2, 0), 0, 'the legacy rig: the dim on every shadowed face');
  assert.ok(ambVis(0, 0.1) > 0 && ambVis(0, 0.1) < 1, 'grazing: between');
}
assert.match(lighting, /groundBounceUniforms\.uCotSkyChroma\.value = model\.envDiffuseChroma;\s*groundBounceUniforms\.uCotShadowDim\.value\.setScalar\(SHADOW_AMBIENT_DIM_LUMA\);/,
  'the grounded rig: the model\'s chroma, a neutral shadow dim');
assert.match(lighting, /groundBounceUniforms\.uCotSkyChroma\.value = 1;\s*groundBounceUniforms\.uCotShadowDim\.value\.fromArray\(SHADOW_AMBIENT_DIM\);/,
  'the legacy rig: the dome\'s own hue and its cool shadow dim, as they were');
{
  const dim = lighting.match(/const SHADOW_AMBIENT_DIM = \[([\d., ]+)\];/)[1].split(',').map(Number);
  assert.deepEqual(dim, [0.80, 0.88, 1.0], 'the legacy dim');
  assert.match(lighting, /const SHADOW_AMBIENT_DIM_LUMA = 0\.2126 \* SHADOW_AMBIENT_DIM\[0\] \+ 0\.7152 \* SHADOW_AMBIENT_DIM\[1\] \+ 0\.0722 \* SHADOW_AMBIENT_DIM\[2\];/,
    'the neutral dim keeps the legacy dim\'s luminance: the shade is as deep, only its hue changes');
}

console.log('groundBounce.selftest: view-factor conservation, ground-lit and receiver laws, energy bounds, rig mapping, GLSL literals and the lighting hook pinned');
