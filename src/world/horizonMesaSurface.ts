/**
 * Replace the generic horizon mottle gain after its existing dA/dB samples.
 * This fragment owns no texture reads, uniforms or lighting/fog response.
 * The caller multiplies diffuseColor.rgb by horizonSurfaceGain exactly once.
 */
export const HORIZON_MESA_SURFACE_FRAGMENT: string = /* glsl */`
float horizonSurfaceGain = 1.0 + (dA * 0.28 + dB * 0.30) * (1.0 - fixW * 0.8);
{
  float mesaWallWeight = smoothstep(0.18, 0.52, 1.0 - clamp(hnW0.y, 0.0, 1.0))
    * clamp(uCapFix, 0.0, 1.0) * (1.0 - clamp(horizonMarine, 0.0, 1.0))
    * (1.0 - clamp(fixW, 0.0, 1.0));

  // Approximately 17 m beds, warped and interrupted by the already-sampled
  // surface fields. Never draw a continuous constant-altitude contour line.
  float mesaBedPhase = vHPos.y * 0.37 + dB * 4.6 + dA * 1.7;
  float mesaBedFade = 1.0 - smoothstep(0.35, 1.15, fwidth(mesaBedPhase));
  float mesaBedBreak = smoothstep(0.35, 0.75, 0.5 + dA + dB * 0.45);
  float mesaBedShadow = smoothstep(0.60, 0.96, sin(mesaBedPhase));
  float mesaBedLip = smoothstep(0.68, 0.98, sin(mesaBedPhase + 0.55));

  // Sparse fractured patches, not another periodic axis or a grid. Fade
  // unresolved patch edges as well as beds; the original texture still mips.
  float mesaPatchField = dA - dB * 0.45;
  float mesaPatchFade = 1.0 - smoothstep(0.06, 0.22, fwidth(mesaPatchField));
  float mesaFracture = smoothstep(0.12, 0.29, mesaPatchField)
    * (1.0 - smoothstep(0.12, 0.38, dB));
  float mesaWallGain = 1.0 + dA * 0.08 + dB * 0.10
    + (mesaBedLip * 0.055 - mesaBedShadow * 0.17) * mesaBedBreak * mesaBedFade
    - mesaFracture * 0.10 * mesaPatchFade;
  mesaWallGain = clamp(mesaWallGain, 0.74, 1.14);
  horizonSurfaceGain = mix(horizonSurfaceGain, mesaWallGain, mesaWallWeight);
}
`;
