// contactHardeningShadows.selftest — 2026-10-10 (the shadows lane, overhaul r3): contact-hardening soft shadows on the
// nearest cascade. The blocker-height law and the penumbra's texels (CPU twins), the light's widening under a deck, the GLSL
// block (its literals from the same constants, compares only — no new texture unit — and the lit early-out), three's CSM
// chunk still carrying the two calls the patch replaces, and the wiring in lighting.ts and quality.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CSMShader } from 'three/examples/jsm/csm/CSMShader.js';
import { ShaderChunk } from 'three';
import {
  CONTACT_HARDENING_GLSL, COT_PCF_GET_SHADOW_DEF, CSM_NON_CSM_HEAD, CSM_SITE_SETUP, PCSS_CASCADES, PCSS_FILTER_TAPS, PCSS_LADDER_M, PCSS_LIGHT_DEG,
  PCSS_MAX_TEXELS, PCSS_OVERCAST_K, PCSS_TOP_M, THREE_PCF_GET_SHADOW_DEF, blockerDistanceM, pcssLightRad, penumbraTexels,
} from './contactHardeningShadows.ts';
import { PRESETS } from './quality.ts';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// ---- 1. the blocker height (the shares in shadow at depth offsets 0 and the ladder's levels)
assert.equal(blockerDistanceM(0, 0, 0, 0), 0, 'nothing in shadow');
near(blockerDistanceM(1, 0, 0, 0), PCSS_LADDER_M[0] / 2, 1e-12, 'a contact: every blocker under the first level');
near(blockerDistanceM(1, 1, 1, 1), PCSS_TOP_M, 1e-12, 'every blocker over the top level');
near(blockerDistanceM(1, 1, 0, 0), (PCSS_LADDER_M[0] + PCSS_LADDER_M[1]) / 2, 1e-12, 'between the first two levels');
near(blockerDistanceM(0.5, 0.5, 0.25, 0), ((0.25 * (PCSS_LADDER_M[0] + PCSS_LADDER_M[1]) / 2) + 0.25 * (PCSS_LADDER_M[1] + PCSS_LADDER_M[2]) / 2) / 0.5, 1e-12, 'a mixture: the shadowed taps\' mean');
assert.ok(blockerDistanceM(1, 0.2, 0, 0) < blockerDistanceM(1, 0.8, 0, 0), 'more taps still shadowed higher up: a taller blocker');

// ---- 2. the penumbra in texels
const sun = PCSS_LIGHT_DEG * Math.PI / 180;
near(penumbraTexels(0.2, sun, 0.034, 1.25), 1.25, 1e-12, 'a contact keeps the cascade\'s own PCF radius (High near: 3.4 cm texels)');
near(penumbraTexels(6, sun, 0.034, 1.25), sun * 6 / 0.034, 1e-9, 'a 6 m blocker: light size × height over the texel');
assert.equal(penumbraTexels(100, sun, 0.017, 1.25), PCSS_MAX_TEXELS, 'clamped to the widest disk');
near(pcssLightRad(0), sun, 1e-12, 'by day the sun\'s size');
near(pcssLightRad(1), sun * (1 + PCSS_OVERCAST_K), 1e-12, 'a closed deck widens it');
near(pcssLightRad(2), pcssLightRad(1), 1e-12, 'clamped overcast');

// ---- 3. the GLSL block
const g = CONTACT_HARDENING_GLSL;
for (const m of PCSS_LADDER_M) assert.ok(g.includes(`float z = sc.z - ${m.toFixed(5)} * depthPerM;`), `the ladder level ${m} m`);
assert.ok(g.includes(`clamp( uCotPcss.x * blockerM / max( texelM, 1e-4 ), minTx, ${PCSS_MAX_TEXELS.toFixed(5)} )`), 'the penumbra law');
assert.ok(g.includes(`vogelDiskSample( i, ${PCSS_FILTER_TAPS}, phi )`), 'the wide filter');
assert.match(g, /if \( litC > 0\.999 && min\( min\( lit0\.x, lit0\.y \), min\( lit0\.z, lit0\.w \) \) > 0\.999 \) return 1\.0;/, 'the lit early-out (five taps, three\'s own cost)');
assert.doesNotMatch(g, /sampler2D\s+(?!Shadow)/, 'compares only: no raw-depth sampler, no new texture unit');
assert.match(g, /float phi = fract\( shadowRadius \* 0\.754877666 \) \* PI2;/, 'one fixed rotation per cascade (no screen noise)');
assert.match(g, /return texture\( shadowMap, vec3\( uv \+ offsetTx \* texel, z \+ dot\( offsetTx \* texelM, grad \) \) \);/, 'every disk tap compares against the receiver\'s own plane');
assert.match(g, /vec2 grad = vec2\( dot\( cotShadowN, uCotPcssR \), dot\( cotShadowN, uCotPcssU \) \) \/ max\( cotShadowNdotL, 0\.1 \);/, 'the plane\'s gradient from the receiver\'s normal and the light\'s frame');
assert.match(g, /int cascade = cotShadowCascade;\s*cotShadowCascade = -1;/, 'a site is read once: a later call (a spot light) takes three\'s PCF');
assert.match(g, new RegExp(`if \\( cascade >= 0 && cascade < ${PCSS_CASCADES} && uCotPcss\\.z > 0\\.5 \\)`), 'only the nearest cascade(s), only where the lever is on');
assert.match(g, /return cotGetShadowPCF\( shadowMap, shadowMapSize, shadowIntensity, shadowBias, shadowRadius, shadowCoord \);/, 'otherwise three\'s PCF exactly');
assert.ok(g.includes(THREE_PCF_GET_SHADOW_DEF), 'the wrapper keeps three\'s getShadow signature');
assert.equal(ShaderChunk.shadowmap_pars_fragment.split(THREE_PCF_GET_SHADOW_DEF).length - 1, 1, 'three\'s chunk defines its PCF getShadow once (the rename\'s anchor)');
assert.equal(COT_PCF_GET_SHADOW_DEF.replace('cotGetShadowPCF', 'getShadow'), THREE_PCF_GET_SHADOW_DEF, 'the rename keeps the signature');
{
  const chunk = CSMShader.lights_fragment_begin, at = chunk.indexOf(CSM_NON_CSM_HEAD);
  const site = 'directionalLightShadow = directionalLightShadows[ i ];';
  assert.ok(at > 0, 'three\'s chunk keeps its non-CSM directional block after the CSM one');
  assert.equal(chunk.slice(0, at).split(site).length - 1, 2, 'the CSM block has the two directional sites the set-up follows');
  assert.equal(chunk.split('getShadow( directionalShadowMap[ i ]').length - 1, 3, 'three\'s call text untouched (vegetation.ts counts three sites)');
}
assert.ok(CSM_SITE_SETUP.includes('cotShadowCascade = UNROLLED_LOOP_INDEX;'), 'the cascade index is a literal after three unrolls the loop');
assert.ok(CSM_SITE_SETUP.includes('cotShadowN = nonPerturbedNormal;') && !CSM_SITE_SETUP.includes('geometryNormal'),
  'the receiver plane is the geometric normal, never the normal-mapped one (a bumpy plane compares a wall against itself)');
assert.ok(ShaderChunk.normal_fragment_begin.includes('vec3 nonPerturbedNormal = normal;'), 'three\'s normal chunk still declares it, before any map');

// ---- 4. the wiring
const lighting = read('./lighting.ts');
assert.match(lighting, /frag = csmPart\.split\(receiverLightSite\)\.join\(`\$\{receiverLightSite\}\s*\$\{CSM_SITE_SETUP\}`\) \+ frag\.slice\(nonCsmAt\);/, 'each CSM site sets the lookup up, after its receiver-only bias');
assert.match(lighting, /shadowmap_pars_fragment\.replace\(THREE_PCF_GET_SHADOW_DEF, COT_PCF_GET_SHADOW_DEF\)\}\s*\$\{CONTACT_HARDENING_GLSL\}\s*\$\{receiverOnlyPars\}/, 'three\'s PCF renamed, the wrapper after it (the receiver-only uniform still ends the chunk)');
assert.match(lighting, /const receiverOnlyPars = `#if defined\( COT_SHADOW_RECEIVER_ONLY \) && defined\( USE_SHADOWMAP \)\nuniform float uCotReceiverOnly;\n#endif`;/, 'the receiver-only uniform block, shared by both installs');
assert.match(lighting, /const contactHardening = getDeviceTier\(\) !== 'mobile';/, 'the phones never install the law');
assert.match(lighting, /if \(getPreset\(\)\.pcss !== true\) \(mat\.defines \?\?= \{\}\)\.COT_NO_PCSS = '';\s*csm\.setupMaterial\(mat\);/,
  'a material set up at a preset without the law compiles it out (Low)');
assert.ok(g.indexOf('#ifndef COT_NO_PCSS') < g.indexOf('float cotPcss(') && g.split('#ifndef COT_NO_PCSS').length - 1 === 2,
  'the law and its call compile out under COT_NO_PCSS; the wrapper stays (three\'s PCF beneath it)');
assert.match(lighting, /if \(contactHardening\) \{\s*frag = csmPart\.split\(receiverLightSite\)/, 'no site set-up on the phones');
assert.match(lighting, /: `\$\{THREE\.ShaderChunk\.shadowmap_pars_fragment\}\s*\$\{receiverOnlyPars\}`;/, 'their shadow chunk is three\'s PCF exactly, plus the receiver-only uniform');
assert.match(lighting, /shader\.uniforms\.uCotPcss = pcssUniform;[\s\S]{0,260}shader\.uniforms\.uCotPcssU = pcssUUniform;/, 'every CSM program binds the law\'s state');
assert.match(lighting, /function updateLighting\(force = false, dt = 1 \/ 60\): void \{\s*updateContactHardening\(\);/, 'refreshed every frame');
assert.match(lighting, /const on = !mobileTier && getPreset\(\)\.pcss === true && lightTune\('PCSS', 1\) > 0;/, 'the tier\'s lever; never the phones');
for (const name of ['ultra', 'high', 'medium']) assert.equal(PRESETS[name].pcss, true, `${name} takes the law`);
for (const name of ['low', 'mobile', 'mobile-low', 'mobile-high']) assert.equal(PRESETS[name].pcss, undefined, `${name} keeps three's PCF`);

// ---- 5. the installed chunks (the real rig, built in Node): three's call sites intact for vegetation.ts's leaf floor (it
// throws unless it finds three), each CSM site set up once, one wrapper over the renamed PCF, the receiver-only uniform last
{
  const THREE = await import('three');
  const { createLighting } = await import('./lighting.ts');
  createLighting(new THREE.Scene(), new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 4000), new THREE.Vector3(0.4, 0.6, 0.3).normalize());
  const C = THREE.ShaderChunk;
  assert.equal(C.lights_fragment_begin.split('getShadow( directionalShadowMap[ i ]').length - 1, 3, 'three directional sites (vegetation.ts counts them)');
  assert.equal(C.lights_fragment_begin.split(CSM_SITE_SETUP).length - 1, 2, 'the two CSM sites set the lookup up');
  assert.equal(C.shadowmap_pars_fragment.split(THREE_PCF_GET_SHADOW_DEF).length - 1, 1, 'one getShadow: the wrapper');
  assert.equal(C.shadowmap_pars_fragment.split(COT_PCF_GET_SHADOW_DEF).length - 1, 1, 'three\'s PCF beneath it');
  assert.ok(C.shadowmap_pars_fragment.indexOf(COT_PCF_GET_SHADOW_DEF) < C.shadowmap_pars_fragment.indexOf(THREE_PCF_GET_SHADOW_DEF), 'the PCF defined before the wrapper calls it');
}

console.log(`contactHardeningShadows.selftest: the blocker ladder (${PCSS_LADDER_M.join(' / ')} m) and penumbra law, the deck's widening, the GLSL block (compares only, receiver-plane bias, lit early-out, ${PCSS_FILTER_TAPS}-tap filter), three's call sites untouched and the wiring PASS`);
