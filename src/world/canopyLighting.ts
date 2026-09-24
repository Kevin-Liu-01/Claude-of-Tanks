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
): void {
  if (wrap <= 0) return;
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
    `float canopyDiffuseNL = saturate( ( canopyRawNL + ${wrap.toFixed(2)} ) * ${reciprocal} ) * ${reciprocal};\n\t${matteCanopy ? 'canopyDiffuseNL = canopyDiffuseNL * 0.70 + 0.075;\n\t' : ''}reflectedLight.directDiffuse += canopyDiffuseNL * directLight.color * BRDF_Lambert( material.diffuseContribution );`,
  );
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
