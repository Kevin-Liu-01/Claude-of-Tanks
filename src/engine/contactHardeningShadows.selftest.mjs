// contactHardeningShadows.selftest — 2026-10-10 (the shadows lane, overhaul r3): contact-hardening soft shadows on the
// nearest cascade. The blocker-height law and the penumbra's texels (CPU twins), the light's widening under a deck, the GLSL
// block (its literals from the same constants, compares only — no new texture unit — and the lit early-out), three's CSM
// chunk still carrying the two calls the patch replaces, and the wiring in lighting.ts and quality.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CSMShader } from 'three/examples/jsm/csm/CSMShader.js';
import {
  CONTACT_HARDENING_GLSL, CSM_CASCADE_SHADOW_CALL, CSM_GET_SHADOW_CALL, CSM_NON_CSM_HEAD, PCSS_CASCADES, PCSS_FILTER_TAPS, PCSS_LADDER_M, PCSS_LIGHT_DEG,
  PCSS_MAX_TEXELS, PCSS_OVERCAST_K, PCSS_TOP_M, blockerDistanceM, pcssLightRad, penumbraTexels,
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
for (const m of PCSS_LADDER_M) assert.ok(g.includes(`- ${m.toFixed(5)} * depthPerM`), `the ladder level ${m} m`);
assert.ok(g.includes(`clamp( uCotPcss.x * blockerM / max( texelM, 1e-4 ), minTx, ${PCSS_MAX_TEXELS.toFixed(5)} )`), 'the penumbra law');
assert.ok(g.includes(`vogelDiskSample( i, ${PCSS_FILTER_TAPS}, phi )`), 'the wide filter');
assert.match(g, /if \( litC > 0\.999 && min\( min\( lit0\.x, lit0\.y \), min\( lit0\.z, lit0\.w \) \) > 0\.999 \) return 1\.0;/, 'the lit early-out (five taps, three\'s own cost)');
assert.doesNotMatch(g, /sampler2D\s+(?!Shadow)/, 'compares only: no raw-depth sampler, no new texture unit');
assert.match(g, /float phi = fract\( shadowRadius \* 0\.754877666 \) \* PI2;/, 'one fixed rotation per cascade (no screen noise)');
assert.match(g, new RegExp(`if \\( cascade < ${PCSS_CASCADES} && uCotPcss\\.z > 0\\.5 \\)`), 'only the nearest cascade(s), only where the lever is on');
assert.match(g, /return getShadow\( shadowMap, shadowMapSize, shadowIntensity, shadowBias, shadowRadius, shadowCoord \);/, 'otherwise three\'s getShadow exactly');
{
  const chunk = CSMShader.lights_fragment_begin, at = chunk.indexOf(CSM_NON_CSM_HEAD);
  assert.ok(at > 0, 'three\'s chunk keeps its non-CSM directional block after the CSM one');
  assert.equal(chunk.slice(0, at).split(CSM_GET_SHADOW_CALL).length - 1, 2, 'the CSM block makes the two calls the patch replaces');
  assert.equal(chunk.slice(at).split(CSM_GET_SHADOW_CALL).length - 1, 1, 'the non-CSM block keeps its own (getShadow, untouched)');
}
assert.ok(CSM_CASCADE_SHADOW_CALL.includes('UNROLLED_LOOP_INDEX'), 'the cascade index is a literal after three unrolls the loop');

// ---- 4. the wiring
const lighting = read('./lighting.ts');
assert.match(lighting, /frag = csmPart\.split\(CSM_GET_SHADOW_CALL\)\.join\(CSM_CASCADE_SHADOW_CALL\) \+ frag\.slice\(nonCsmAt\);/, 'the CSM block calls cotCascadeShadow');
assert.match(lighting, /\$\{CONTACT_HARDENING_GLSL\}`;/, 'the block rides shadowmap_pars_fragment');
assert.match(lighting, /shader\.uniforms\.uCotPcss = pcssUniform;[\s\S]{0,120}shader\.uniforms\.uCotPcssTexel = pcssTexelUniform;/, 'every CSM program binds the law\'s state');
assert.match(lighting, /function updateLighting\(force = false, dt = 1 \/ 60\): void \{\s*updateContactHardening\(\);/, 'refreshed every frame');
assert.match(lighting, /const on = !mobileTier && getPreset\(\)\.pcss === true && lightTune\('PCSS', 1\) > 0;/, 'the tier\'s lever; never the phones');
for (const name of ['ultra', 'high', 'medium']) assert.equal(PRESETS[name].pcss, true, `${name} takes the law`);
for (const name of ['low', 'mobile', 'mobile-low', 'mobile-high']) assert.equal(PRESETS[name].pcss, undefined, `${name} keeps three's PCF`);

console.log(`contactHardeningShadows.selftest: the blocker ladder (${PCSS_LADDER_M.join(' / ')} m) and penumbra law, the deck's widening, the GLSL block (compares only, lit early-out, ${PCSS_FILTER_TAPS}-tap filter), three's two calls and the wiring PASS`);
