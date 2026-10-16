// src/world/canopyLighting.ts — the canopy's light-driven diffuse scattering, shared by the battlefield's
// foliage cards (vegetation.ts) and the horizon ring's far crowns (horizonVista.ts).
//
// Round 55 (2026-09-24): the ring forest adopted the battlefield's matte canopy response. Importing the helper from
// vegetation.ts pulled that whole module into the terrain/horizon import chain, ahead of the loader hook that
// src/world/tidalMangrove.selftest.mjs registers on vegetation.ts (the hook then never saw the module load and its
// appended exports vanished — "buildBroadleafTrunk is not a function"). The helper lives here, a leaf with no world
// imports, and vegetation.ts re-exports it unchanged.
import * as THREE from 'three';

type MaterialShader = Parameters<THREE.Material['onBeforeCompile']>[0];

/**
 * GND (2026-10-15; the Kestrel chase-s blind pair: "the backlit pines glow a saturated lime green that does not match
 * the backlight or Scots-pine colour"): the light a NEEDLE crown passes toward a viewer looking into the sun. A needle
 * is thick and waxy and passes little light; what comes through is the needles' own green dulled, never a glow. The
 * transmitted terms (the back-lit translucency and the leaf transmission below) take the front-lit albedo pulled toward
 * its own luminance — NEEDLE_TRANSMIT_SATURATION of its chroma kept — and scaled by NEEDLE_TRANSMIT_LUMINANCE. With the
 * grown crown's gain and the grounded light's leaf transmission at their full strength, an unshadowed back-lit needle
 * crown then never outshines its own front-lit side (canopyNeedleTransmit.selftest), where it read 2.1x brighter and
 * pushed the tone map into lime. Broadleaf crowns (a needle share of 0) keep their translucency exactly.
 */
export const NEEDLE_TRANSMIT_SATURATION = 0.6;
export const NEEDLE_TRANSMIT_LUMINANCE = 0.42;
/** The Rec. 709 luminance weights the transmitted colour keeps its luminance by (linear albedo). */
const LUMA = [0.2126, 0.7152, 0.0722] as const;

/** The JS twin of the shader's `cotCanopyTransmit`: the colour a crown transmits for a linear albedo and its needle
 * share (0 a broadleaf crown, its albedo exactly; 1 a needle crown). */
export function canopyTransmitColour(albedo: readonly [number, number, number], needle: number): [number, number, number] {
  const l = albedo[0] * LUMA[0] + albedo[1] * LUMA[1] + albedo[2] * LUMA[2];
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const dull = (l + (albedo[i] - l) * NEEDLE_TRANSMIT_SATURATION) * NEEDLE_TRANSMIT_LUMINANCE;
    out[i] = albedo[i] + (dull - albedo[i]) * needle;
  }
  return out;
}

const CANOPY_TRANSMIT_GLSL = `vec3 cotCanopyTransmit( vec3 albedo, float needle ) {
	float l = dot( albedo, vec3( ${LUMA.map(v => v.toFixed(4)).join(', ')} ) );
	return mix( albedo, mix( vec3( l ), albedo, ${NEEDLE_TRANSMIT_SATURATION.toFixed(3)} ) * ${NEEDLE_TRANSMIT_LUMINANCE.toFixed(3)}, needle );
}
`;

function mustReplace(src: string, anchor: string, replacement: string): string {
  const out = src.replace(anchor, replacement);
  if (out === src) throw new Error(`world/vegetation: shader anchor missing: ${anchor}`);
  return out;
}

/** Light-driven DIFFUSE scattering; keep microfacet specular incidence intact. */
export function applyCanopyDiffuseWrap(
  shader: MaterialShader,
  wrap: number,
  matteCanopy = false,
  // Round 77 (2026-09-26): leaf translucency for the battlefield's crowns — the share of the (shadowed) direct light
  // a back-lit cluster transmits toward the viewer, raised to the third power of the view-against-sun cosine so it
  // reads as the glowing rim of a crown between the camera and the sun and nowhere else. 0 (the horizon ring's far
  // crowns, solid bark) leaves the expression byte-identical. p2 trees lane (2026-10-02): a grown crown's material
  // defines COT_GROWN_CROWN, its transmission gain — the grown crown's own hull shadows its anti-sun cards (each card
  // samples the cascades once, pushed sunward by the crown's radius), so a back-lit grown crown passes less of the
  // shadowed light than the round-8 lobe proxies let through; the gain gives that light back where the view looks
  // toward the sun and nowhere else.
  thin = 0,
  // p2 trees lane (2026-10-02): leaf transmission. The grounded light (engine/lightModel.ts) retired the anti-sun
  // fill that lit every backlit face; a leaf passes light through instead — on its far side a Lambert lobe of the
  // (shadowed) direct light, T × max(0, −N·L), the light through the leaf when the sun is behind it. T is the
  // uniform the vegetation drives from the light model (0 under the legacy rig, whose fill still lights the backs);
  // null leaves the expression as it was (the horizon ring's crowns, the phones).
  transmission: { value: number } | null = null,
  // GND (2026-10-15): the crown's needle share as a GLSL float expression the caller's program declares (a uniform of a
  // near card's material, the impostors' per-species varying): the transmitted terms take cotCanopyTransmit, the needles'
  // dulled green. null leaves the expression as it was (the horizon ring, the Hinterland, the phones).
  needle: string | null = null,
): void {
  if (wrap <= 0) return;
  const transmits = thin > 0 || !!transmission;
  const transmitted = needle && transmits ? 'canopyTransmit' : 'material.diffuseContribution';
  const reciprocal = (1 / (1 + wrap)).toFixed(6);
  let wrappedPhysical = mustReplace(
    THREE.ShaderChunk.lights_physical_pars_fragment,
    'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
    'float canopyRawNL = dot( geometryNormal, directLight.direction );\n\tfloat dotNL = saturate( canopyRawNL );',
  );
  // Do not wrap irradiance: GGX uses the original clamped incidence inside
  // its Smith visibility denominator. Lighting a backface through that term
  // exposes its 1/EPSILON singularity and turns crowns into white bloom lamps.
  // Only the Lambert diffuse lobe scatters through the leaf volume.
  wrappedPhysical = mustReplace(
    wrappedPhysical,
    'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );',
    `float canopyDiffuseNL = saturate( ( canopyRawNL + ${wrap.toFixed(2)} ) * ${reciprocal} ) * ${reciprocal};\n\t${matteCanopy ? 'canopyDiffuseNL = canopyDiffuseNL * 0.70 + 0.075;\n\t' : ''}reflectedLight.directDiffuse += canopyDiffuseNL * directLight.color * BRDF_Lambert( material.diffuseContribution );${
      needle && transmits ? `\n\tvec3 canopyTransmit = cotCanopyTransmit( material.diffuseContribution, ${needle} );` : ''}${
      thin > 0
        ? `\n\tfloat canopyBack = pow( saturate( dot( -geometryViewDir, directLight.direction ) ), 3.0 );\n\t#ifdef COT_GROWN_CROWN\n\tcanopyBack *= COT_GROWN_CROWN;\n\t#endif\n\treflectedLight.directDiffuse += canopyBack * ${thin.toFixed(2)} * directLight.color * BRDF_Lambert( ${transmitted} );`
        : ''}${transmission
        ? `\n\treflectedLight.directDiffuse += saturate( -canopyRawNL ) * uCotLeafTransmission * directLight.color * BRDF_Lambert( ${transmitted} );`
        : ''}`,
  );
  if (needle && transmits) wrappedPhysical = `${CANOPY_TRANSMIT_GLSL}${wrappedPhysical}`;
  if (transmission) {
    shader.uniforms.uCotLeafTransmission = transmission;
    wrappedPhysical = `uniform float uCotLeafTransmission;\n${wrappedPhysical}`;
  }
  if (matteCanopy) {
    // A spray represents many differently oriented leaves. Mix 30% of an
    // isotropic volume lobe into its directional wrap so entire reverse-facing
    // sprays do not become black panels. Both lobes integrate to 0.5 over
    // incidence [-1, 1]: 0.70 * 0.5 + 2 * 0.075 = 0.5. This redistributes
    // actual incident light; it adds neither emission nor a night-time floor.
    // Near cards and far crown proxies use the same response.
    // Volume-bent leaf normals intentionally do not flip toward the camera.
    // They describe a scattering crown, not a glossy microfacet surface:
    // GGX at N.V=0 produces a broad white grazing lobe across these cards.
    // Use the diffuse crown model for direct sun; retain the existing IBL
    // and hemisphere bounce. Omitting GGX also removes its two DFG lookups.
    wrappedPhysical = mustReplace(
      wrappedPhysical,
      'reflectedLight.directSpecular += irradiance * BRDF_GGX_Multiscatter( directLight.direction, geometryViewDir, geometryNormal, material );',
      '// Matte canopy: direct illumination is the volume-diffuse lobe below.',
    );
  }
  // Three renamed this parameter from normal to geometryNormal. The former
  // unchecked replacement silently disabled scattering, leaving white-facing
  // cards beside black interiors. Fail explicitly if that contract changes.
  shader.fragmentShader = mustReplace(
    shader.fragmentShader, '#include <lights_physical_pars_fragment>', wrappedPhysical,
  );
}
