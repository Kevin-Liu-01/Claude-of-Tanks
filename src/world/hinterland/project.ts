// src/world/hinterland/project.ts — the Hinterland's direction-exact depth compression and the earth's curvature
// (HL-3, the horizons stream, 2026-10-13; B-architecture §4.2: "the one technical move that makes this possible").
//
// Everything past 2.5 km is drawn along its exact direction from the CURRENT camera, at a depth compressed into
// 2.5–3.3 km: P' = C + (P − C) · R(|P − C|) / |P − C|, with R(d) = d to 2,500 m and 2,500 + 800 (1 − e^(−(d − 2,500) /
// 20,000)) beyond. Directions are exact from every eye and under every zoom (parallax correct: no bake, no shell
// seam); R is monotonic, so depth order holds; R(∞) = 3,300 m sits under the cloud dome (3.4 km), the sea fog bank
// (3.6 km) and the camera's far plane (4 km), all untouched. The true distance travels to the fragment for the haze and
// the clouds (hinterlandTrueDistance inverts R). The earth's curvature is built in: a point's height falls by d_h² / 2R′
// with R′ = 7,300 km (refraction-adjusted), 6.8 m at 10 km, 62 m at 30 km, 438 m at 80 km, so the land reaches the limb.
//
// Pure (no THREE): the shaders and their JS twins live together so a receipt can hold one against the other.

/** Up to here a point is drawn where it is. */
export const HINTERLAND_COMPRESS_FROM_M = 2500;
/** The compressed band's depth: everything farther stands within this much past 2.5 km. */
export const HINTERLAND_COMPRESS_SPAN_M = 800;
/** The falloff of the compression (m): R(d) approaches 3.3 km as e^(−(d − 2.5 km) / 20 km). */
export const HINTERLAND_COMPRESS_FALLOFF_M = 20_000;
/** The refraction-adjusted earth radius (m). */
export const HINTERLAND_EARTH_R_M = 7_300_000;

/** R(d): the compressed distance of a point d metres from the camera. */
export function compressDistance(d: number): number {
  if (d <= HINTERLAND_COMPRESS_FROM_M) return d;
  return HINTERLAND_COMPRESS_FROM_M + HINTERLAND_COMPRESS_SPAN_M * (1 - Math.exp(-(d - HINTERLAND_COMPRESS_FROM_M) / HINTERLAND_COMPRESS_FALLOFF_M));
}

/** R⁻¹: the true distance of a compressed one (for r in (2.5, 3.3) km; beyond the span, the far limit). */
export function trueDistance(r: number): number {
  if (r <= HINTERLAND_COMPRESS_FROM_M) return r;
  const f = Math.min(0.999999, (r - HINTERLAND_COMPRESS_FROM_M) / HINTERLAND_COMPRESS_SPAN_M);
  return HINTERLAND_COMPRESS_FROM_M - HINTERLAND_COMPRESS_FALLOFF_M * Math.log(1 - f);
}

/** The earth's drop (m) of a point a horizontal distance dh (m) from the camera. */
export function curvatureDrop(dh: number): number {
  return (dh * dh) / (2 * HINTERLAND_EARTH_R_M);
}

/** The compressed position of a world point for a camera (into `out`; returns the true distance). */
export function compressPoint(px: number, py: number, pz: number, cx: number, cy: number, cz: number, out: [number, number, number]): number {
  const dh = Math.hypot(px - cx, pz - cz);
  const y = py - curvatureDrop(dh);
  const dx = px - cx, dy = y - cy, dz = pz - cz;
  const d = Math.hypot(dx, dy, dz);
  const k = d > 1e-6 ? compressDistance(d) / d : 1;
  out[0] = cx + dx * k; out[1] = cy + dy * k; out[2] = cz + dz * k;
  return d;
}

/** GLSL: the compression, the curvature and the inverse (the shaders' twin of the functions above). */
export const HINTERLAND_PROJECT_GLSL = /* glsl */`
const float HL_FROM = ${HINTERLAND_COMPRESS_FROM_M.toFixed(1)};
const float HL_SPAN = ${HINTERLAND_COMPRESS_SPAN_M.toFixed(1)};
const float HL_FALLOFF = ${HINTERLAND_COMPRESS_FALLOFF_M.toFixed(1)};
const float HL_EARTH_R = ${HINTERLAND_EARTH_R_M.toFixed(1)};
float hinterlandCompress( float d ) {
  return d <= HL_FROM ? d : HL_FROM + HL_SPAN * ( 1.0 - exp( -( d - HL_FROM ) / HL_FALLOFF ) );
}
float hinterlandTrueDistance( float r ) {
  if ( r <= HL_FROM ) return r;
  float f = min( 0.999999, ( r - HL_FROM ) / HL_SPAN );
  return HL_FROM - HL_FALLOFF * log( 1.0 - f );
}
// the world point drawn for camera c: its earth drop, then its distance compressed along its exact direction;
// trueD gets its true distance
vec3 hinterlandProject( vec3 p, vec3 c, out float trueD ) {
  vec2 dh = p.xz - c.xz;
  p.y -= dot( dh, dh ) / ( 2.0 * HL_EARTH_R );
  vec3 v = p - c;
  float d = length( v );
  trueD = d;
  return d > 1e-6 ? c + v * ( hinterlandCompress( d ) / d ) : p;
}
`;
