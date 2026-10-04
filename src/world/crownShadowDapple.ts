// src/world/crownShadowDapple.ts — trees round 2 (2026-10-03): the grown crowns' dappled shadow.
//
// A grown tree casts its crown through a position-only hull (treeGrowth.ts emitCrownShadowHull: the stem and the thick
// limbs as tubes, the crown as a handful of ellipsoids fitted to its spray clusters). Rendered solid, that hull printed
// every crown on the ground as one black blob — the gauntlet's "solid black tree shadows with no leaf dappling". Its
// depth pass now lets the sun through the crown's leaf gaps: a two-octave value noise in SUN space — the world position
// turned by the shadow camera's rotation alone, so the pattern is anchored to the world and the same in every cascade
// and every frame while the cascades snap and slide with the camera (the LOD dissolve's rule, engine/lodShadowFade.ts)
// — discards the crown masses' fragments where it runs low. Each mass opens as far as its own sprays leave it open
// (treeGrowth.ts GROWTH_CROWN_POROSITY: a sparse weeping crown lets more sun through than a dense oak) and draws its
// own pattern, so where the sun crosses two masses it has to find a gap in both and a crown's heart casts darker than
// its fringe. Both faces of a mass see the same sun-space point along a ray, so a gap opens through the whole mass. The wood never opens (`aCrown` 0 on its triangles: a stem's shadow is a
// line, not a dotted one), and the gaps close where a cascade's texel grows past the leaf-cluster scale (the pattern
// would alias into crawling dots there): the far cascades keep the solid mass, the near ones the dapple.
//
// THREE-only, no world state: one shared depth material serves every world (no per-world uniform); the vegetation's
// crown proxies take it in place of the engine's LOD dissolve material, whose dissolve it keeps (the patch chains
// engine/lodShadowFade.ts patchLodShadowFadeDepthShader, and the material carries its `lodShadowFade` mark).
import * as THREE from 'three';
import { LOD_SHADOW_FADE_ATTRIBUTE, patchLodShadowFadeDepthShader } from '../engine/lodShadowFade.ts';

type MaterialShader = Parameters<THREE.Material['onBeforeCompile']>[0];
type DappleMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;

/**
 * The per-vertex crown tag a dappled proxy carries: 0 on the wood; on a crown mass its index + 1 (its own pattern) plus,
 * in the fraction, the noise level under which the sun passes (crownDappleTags).
 */
export const CROWN_DAPPLE_ATTRIBUTE = 'aCrown';
export const CROWN_DAPPLE_PROGRAM_KEY = 'cot-crown-dapple-depth-v2';

/**
 * The dapple law: the leaf-cluster cell (m) of the coarse octave (the fine one is 0.43 of it); the noise level under
 * which a share of the sun passes, at shares 0, 0.05 … 1 (the two-octave noise's quantiles, measured on a CPU grid of
 * the shader's own hash: treeCrownShading.selftest.mjs measures them again); the sun-space offset between two masses'
 * patterns (m, per mass index); the shadow texel sizes (m) over which the gaps close (full under the first, none past
 * the second).
 */
export const CROWN_DAPPLE_LAW = Object.freeze({
  cellM: 0.55, fine: 0.43,
  thresholds: Object.freeze([0.014, 0.243, 0.294, 0.331, 0.361, 0.388, 0.413, 0.435, 0.458, 0.479, 0.5, 0.522, 0.543, 0.565,
    0.588, 0.613, 0.639, 0.669, 0.706, 0.757, 0.986] as const),
  massOffsetM: Object.freeze([7.13, 3.71] as const),
  texelFadeM: Object.freeze([0.07, 0.2] as const),
});

/** The noise level under which `transmittance` (0..1) of the sun passes a crown mass (the law's quantiles, linear). */
export function crownDappleThreshold(transmittance: number): number {
  const table = CROWN_DAPPLE_LAW.thresholds, last = table.length - 1;
  const x = Math.min(1, Math.max(0, transmittance)) * last, i = Math.min(last - 1, Math.floor(x));
  return table[i] + (table[i + 1] - table[i]) * (x - i);
}

/** The tag's fraction: the threshold scaled into [TAG_MARGIN, TAG_MARGIN + TAG_SPAN] of the unit. */
const TAG_MARGIN = 0.02, TAG_SPAN = 0.96;

function replaceAnchor(source: string, anchor: string, replacement: string): string {
  const patched = source.replace(anchor, replacement);
  if (patched === source) throw new Error(`world/crownShadowDapple: shader anchor missing: ${anchor}`);
  return patched;
}

/** The dappled crown depth program: the engine's LOD dissolve, then the sun-space leaf gaps on the crown masses. */
export function patchCrownDappleDepthShader(shader: MaterialShader): void {
  patchLodShadowFadeDepthShader(shader);
  const [t0, t1] = CROWN_DAPPLE_LAW.texelFadeM;
  shader.vertexShader = replaceAnchor(shader.vertexShader, '#include <common>',
    `#include <common>\nattribute float ${CROWN_DAPPLE_ATTRIBUTE};\nvarying float vCotCrown;\nvarying vec2 vCotSun;`);
  // the LOD patch leaves the world position in vLodShadowWorldPosition after project_vertex; the shadow camera's
  // rotation alone (no translation: the cascades move, the sun does not) turns it into sun space
  shader.vertexShader = replaceAnchor(shader.vertexShader, 'vLodShadowWorldPosition = (modelMatrix * cotLodShadowWorld).xyz;',
    `vLodShadowWorldPosition = (modelMatrix * cotLodShadowWorld).xyz;
    vCotCrown = ${CROWN_DAPPLE_ATTRIBUTE};
    vCotSun = ( mat3( viewMatrix ) * vLodShadowWorldPosition ).xy;`);
  shader.fragmentShader = replaceAnchor(shader.fragmentShader, '#include <common>',
    `#include <common>
varying float vCotCrown;
varying vec2 vCotSun;
float cotDappleHash( vec2 p ) {
  p = fract( p * vec2( 0.1031, 0.1030 ) );
  p += dot( p, p.yx + 33.33 );
  return fract( ( p.x + p.y ) * p.x );
}
float cotDappleNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( cotDappleHash( i ), cotDappleHash( i + vec2( 1.0, 0.0 ) ), u.x ),
    mix( cotDappleHash( i + vec2( 0.0, 1.0 ) ), cotDappleHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}`);
  const [ox, oy] = CROWN_DAPPLE_LAW.massOffsetM;
  shader.fragmentShader = replaceAnchor(shader.fragmentShader, '#include <alphatest_fragment>', `#include <alphatest_fragment>
    if ( vCotCrown > 0.5 ) {
      // the mass (its own pattern) and the noise level under which the sun passes it (crownDappleTags' encoding)
      float cotMass = floor( vCotCrown );
      float cotThreshold = ( vCotCrown - cotMass - ${TAG_MARGIN.toFixed(3)} ) / ${TAG_SPAN.toFixed(3)};
      vec2 cotSun = vCotSun + cotMass * vec2( ${ox.toFixed(3)}, ${oy.toFixed(3)} );
      // metres of sun space per shadow texel: the gaps live where the cascade resolves them
      float cotTexel = max( length( dFdx( vCotSun ) ), length( dFdy( vCotSun ) ) );
      float cotDetail = 1.0 - smoothstep( ${t0.toFixed(3)}, ${t1.toFixed(3)}, cotTexel );
      float cotLeaf = cotDappleNoise( cotSun * ${(1 / CROWN_DAPPLE_LAW.cellM).toFixed(4)} ) * 0.62
        + cotDappleNoise( cotSun * ${(1 / (CROWN_DAPPLE_LAW.cellM * CROWN_DAPPLE_LAW.fine)).toFixed(4)} + 17.31 ) * 0.38;
      if ( cotLeaf < cotThreshold * cotDetail ) discard;
    }`);
}

const crownDappleDepthMaterial = new THREE.MeshDepthMaterial({ name: 'CrownDappleDepth', depthPacking: THREE.RGBADepthPacking });
crownDappleDepthMaterial.onBeforeCompile = patchCrownDappleDepthShader;
crownDappleDepthMaterial.customProgramCacheKey = () => CROWN_DAPPLE_PROGRAM_KEY;
// it carries the engine's LOD dissolve (the shadow audits read the mark)
crownDappleDepthMaterial.userData.lodShadowFade = true;
crownDappleDepthMaterial.userData.crownDapple = true;

export function getCrownDappleDepthMaterial(): THREE.MeshDepthMaterial {
  return crownDappleDepthMaterial;
}

/** Cast an instanced crown proxy through the dappled depth program (it needs aLodF and aCrown). */
export function applyCrownDappleDepth<T extends DappleMesh>(mesh: T): T {
  for (const name of [LOD_SHADOW_FADE_ATTRIBUTE, CROWN_DAPPLE_ATTRIBUTE]) {
    if (!mesh.geometry.getAttribute(name)) throw new Error(`world/crownShadowDapple: ${mesh.name || mesh.type} requires ${name}`);
  }
  mesh.customDepthMaterial = crownDappleDepthMaterial;
  mesh.userData.lodShadowFadeCaster = true;
  mesh.userData.crownDapple = true;
  return mesh;
}

/**
 * The crown tags of a hull built by emitCrownShadowHull: 0 on the wood and on anything outside its masses (a trailing
 * caster a builder appends: the mangrove's stilt arches); on mass m, m + 1 plus the noise level under which its
 * transmittance passes, kept inside the fraction's margins so the interpolated tag never crosses an integer.
 */
export function crownDappleTags(vertexCount: number, masses: readonly { start: number; end: number; transmittance: number }[]): Float32Array {
  const tags = new Float32Array(vertexCount);
  masses.forEach((mass, m) => {
    const tag = m + 1 + TAG_MARGIN + TAG_SPAN * crownDappleThreshold(mass.transmittance);
    for (let i = Math.max(0, mass.start); i < Math.min(mass.end, vertexCount); i++) tags[i] = tag;
  });
  return tags;
}
