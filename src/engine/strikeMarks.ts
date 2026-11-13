/**
 * strikeMarks.ts — Air Support's marks on the ground (air-support-270; owner 2026-11-05: "a giant aiming reticle on the
 * ground respecting ground geometry"; Main's ruling: "project the reticle onto the ground and structures as a fixed-cost
 * decal or terrain-shader term, never a mesh rebuilt each frame").
 *
 * A term in the aerial post pass (post.ts), where every pixel's world point is already rebuilt from the scene depth: each
 * mark is a pattern in the ground plane painted on whatever surface the pixel's depth puts there — the terrain, a roof,
 * a wall, a hull — so it lies on the ground's geometry exactly, at a fixed cost: a uniform block of at most
 * STRIKE_MARK_MAX marks, one loop over the live ones, and nothing at all when none is up (uStrikeN 0 skips the block).
 * No geometry, no draw call, no per-frame allocation.
 *
 * Shapes (the call-ins' footprints, sim/strikeRuns.ts runFootprint): a circle (the artillery's dispersion; the bomb's
 * ellipse, its blast round its miss, long along the run, with its laser cross on the run's axis), a lane (the strafing run's lane with chevrons marching along its heading), a track
 * (the recon pass: its flight line and the dashed edges of the swath it reveals, unfilled), the AC-130's orbit ring; and
 * the aiming reticle of the crew's own strike view, brighter, with
 * its range ticks. Lines are emissive in the linear HDR buffer (they read through the haze and touch the bloom).
 * Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import * as THREE from 'three';

export const STRIKE_MARK_MAX = 8;
export type StrikeMarkShape = 'circle' | 'lane' | 'orbit' | 'track' | 'aim-circle' | 'aim-lane' | 'aim-orbit' | 'aim-track';
// the four shapes, and the aim's the same four plus 4
const SHAPE_CODE: Readonly<Record<StrikeMarkShape, number>> = Object.freeze({
  circle: 0, lane: 1, orbit: 2, track: 3, 'aim-circle': 4, 'aim-lane': 5, 'aim-orbit': 6, 'aim-track': 7,
});

/** One mark: where, its size, its heading, its colour (linear) and how near it is to landing (0..1). */
export interface StrikeMark {
  x: number; y: number; z: number;
  shape: StrikeMarkShape;
  /** circle/orbit: the radius (an ellipse's semi-axis along the heading); lane: the half length along the heading. */
  sizeA: number;
  /** lane: the half width; circle: 0, or an ellipse's semi-axis across the heading. */
  sizeB: number;
  heading: number;
  r: number; g: number; b: number;
  /** 0 just called .. 1 landing now; the line thickens and the dashes quicken. */
  urgency: number;
}

/** The uniform block, one set shared by the aerial pass's material (post.ts spreads it into its uniforms). */
const UNIFORMS = {
  uStrikeN: { value: 0 },
  uStrikeT: { value: 0 },
  // per mark: (x, z, sizeA, sizeB), (heading, shape, urgency, groundY), (r, g, b, intensity)
  uStrikeA: { value: Array.from({ length: STRIKE_MARK_MAX }, () => new THREE.Vector4()) },
  uStrikeB: { value: Array.from({ length: STRIKE_MARK_MAX }, () => new THREE.Vector4()) },
  uStrikeC: { value: Array.from({ length: STRIKE_MARK_MAX }, () => new THREE.Vector4()) },
};
/** The block's shape for a material (a ShaderPass clones its uniforms: syncStrikeMarkUniforms copies the live marks in). */
export function createStrikeMarkUniforms(): typeof UNIFORMS { return UNIFORMS; }

type StrikeMarkUniformTarget = Record<'uStrikeN' | 'uStrikeT', { value: number }> &
  Record<'uStrikeA' | 'uStrikeB' | 'uStrikeC', { value: THREE.Vector4[] }>;
/** Copy the live marks into a material's own (cloned) block, once a frame before its draw: only the live ones. */
export function syncStrikeMarkUniforms(target: StrikeMarkUniformTarget): void {
  const n = UNIFORMS.uStrikeN.value;
  target.uStrikeN.value = n;
  if (!n) return;
  target.uStrikeT.value = UNIFORMS.uStrikeT.value;
  for (let i = 0; i < n; i++) {
    target.uStrikeA.value[i]!.copy(UNIFORMS.uStrikeA.value[i]!);
    target.uStrikeB.value[i]!.copy(UNIFORMS.uStrikeB.value[i]!);
    target.uStrikeC.value[i]!.copy(UNIFORMS.uStrikeC.value[i]!);
  }
}

/** Publish this frame's first `count` marks (at most STRIKE_MARK_MAX; the rest wait) and the marks' clock (s, for the
 *  dashes). The caller keeps its marks in a pool of its own (no allocation a frame). */
export function setStrikeMarks(marks: readonly StrikeMark[], timeS: number, count = marks.length): void {
  const n = Math.min(STRIKE_MARK_MAX, count, marks.length);
  UNIFORMS.uStrikeN.value = n;
  UNIFORMS.uStrikeT.value = timeS % 600;
  for (let i = 0; i < n; i++) {
    const m = marks[i]!;
    UNIFORMS.uStrikeA.value[i]!.set(m.x, m.z, m.sizeA, m.sizeB);
    UNIFORMS.uStrikeB.value[i]!.set(m.heading, SHAPE_CODE[m.shape], Math.max(0, Math.min(1, m.urgency)), m.y);
    // (the first capture: the aim's 2.6 bloomed every line white in the binoculars) a mark's lines a little over the scene
    UNIFORMS.uStrikeC.value[i]!.set(m.r, m.g, m.b, m.shape.startsWith('aim') ? 1.5 : 1.3);
  }
}
export function clearStrikeMarks(): void { UNIFORMS.uStrikeN.value = 0; }
/** How many marks are live (the frame-cost receipt and the probes read it). */
export function strikeMarkCount(): number { return UNIFORMS.uStrikeN.value; }

/**
 * The GLSL: `vec3 cotStrikeMarks( vec3 wp, vec3 rgb, float px )` paints every live mark on the surface point `wp` (world);
 * `px` is the pixel's footprint on the ground (m: its distance times the pixel's angle over the ray's grazing angle,
 * computed by the caller: no derivatives inside the pass's depth branch), so a far mark stays a crisp line.
 */
export const STRIKE_MARKS_GLSL = /* glsl */ `
  #define COT_STRIKE_MAX ${STRIKE_MARK_MAX}
  uniform int uStrikeN;
  uniform float uStrikeT;
  uniform vec4 uStrikeA[ COT_STRIKE_MAX ];
  uniform vec4 uStrikeB[ COT_STRIKE_MAX ];
  uniform vec4 uStrikeC[ COT_STRIKE_MAX ];
  // a line of half width w (m) at signed distance d, feathered over one ground pixel (px m)
  float cotStrikeLine( float d, float w, float px ) { return 1.0 - smoothstep( w, w + px * 1.25, abs( d ) ); }
  vec3 cotStrikeMarks( vec3 wp, vec3 rgb, float px ) {
    vec2 g = wp.xz;
    // the surface's facing from the rebuilt world point (its screen derivatives): marks lie on what faces up — the ground,
    // a roof, a hull's deck — never down a wall, a trunk or a bush's side, where a ground-plane line becomes a sheet (the
    // phone capture's binoculars)
    vec3 dpx = dFdx( wp ), dpy = dFdy( wp );
    vec3 nrm = cross( dpx, dpy );
    float up = smoothstep( 0.55, 0.8, abs( nrm.y ) / max( length( nrm ), 1e-6 ) );
    // where the next pixel is another surface metres away (a grass blade's edge, a crown against the field) the derivatives
    // are a depth break, not the ground's footprint: no mark there, and no line widened by it (the phone capture's
    // binoculars: the strafe lane's lines ballooned at every blade edge into blue speckle across the field)
    float jump = length( vec2( length( dpx.xz ), length( dpy.xz ) ) );
    up *= 1.0 - smoothstep( px * 3.0, px * 8.0, jump );
    if ( up <= 0.0 ) return rgb;
    px = max( max( px, min( jump, px * 3.0 ) * 0.7 ), 0.02 );
    for ( int i = 0; i < COT_STRIKE_MAX; i++ ) {
      if ( i >= uStrikeN ) break;
      vec4 A = uStrikeA[ i ], B = uStrikeB[ i ], C = uStrikeC[ i ];
      vec2 d = g - A.xy;
      float reach = max( A.z, A.w ) + 12.0;
      if ( abs( d.x ) > reach || abs( d.y ) > reach ) continue;
      // the ground, the low roofs and the walls' feet near the mark's own ground; a crown or a roof far above it fades out
      // (the first capture: the pattern drawn across tree crowns and grass tops read as blobs, not a reticle)
      float hFade = ( 1.0 - smoothstep( 5.0, 14.0, wp.y - B.w ) ) * up;
      if ( hFade <= 0.0 ) continue;
      float shape = B.y, urg = B.z, T = uStrikeT;
      bool aim = shape > 3.5;
      float s = aim ? shape - 4.0 : shape;
      float w = max( 0.22, px * ( aim ? 1.4 : 1.0 ) ) * ( 1.0 + urg * 0.8 );
      float line = 0.0, fill = 0.0;
      if ( s < 0.5 || ( s > 1.5 && s < 2.5 ) ) {
        // circle (0) and orbit ring (2); a circle with an across semi-axis (A.w) is an ellipse along the heading (the bomb's
        // footprint: its long miss along the run), drawn in the frame of the run with the across axis stretched to the along
        vec2 e = d;
        if ( s < 0.5 && A.w > 0.0 ) {
          float sh = sin( B.x ), ch = cos( B.x );
          e = vec2( ( d.x * ch - d.y * sh ) * A.z / A.w, d.x * sh + d.y * ch );
        }
        float r = length( e ), R = A.z;
        float ang = atan( e.y, e.x );
        float ring = cotStrikeLine( r - R, w, px );
        // dashes marching round the ring (quicker as it nears); the orbit's are long, the circle's short
        float dashes = s > 1.5 ? 18.0 : 36.0;
        float dash = step( 0.42, fract( ang / 6.2831853 * dashes + T * ( 0.25 + urg * 1.2 ) * ( s > 1.5 ? -1.0 : 1.0 ) ) );
        line = max( line, ring * mix( dash, 1.0, aim ? 0.6 : 0.25 ) );
        // the inner ring and four ticks (the bomb's laser cross reads in them)
        line = max( line, cotStrikeLine( r - R * 0.5, w * 0.6, px ) * 0.55 );
        vec2 a2 = abs( e );
        float tick = max( cotStrikeLine( e.x, w * 0.8, px ) * step( a2.y, R * 1.12 ) * step( R * 0.72, a2.y ),
                          cotStrikeLine( e.y, w * 0.8, px ) * step( a2.x, R * 1.12 ) * step( R * 0.72, a2.x ) );
        line = max( line, tick );
        if ( aim || s < 0.5 ) {
          // the centre cross
          float cross = max( cotStrikeLine( e.x, w * 0.7, px ) * step( a2.y, min( R * 0.18, 6.0 ) ),
                             cotStrikeLine( e.y, w * 0.7, px ) * step( a2.x, min( R * 0.18, 6.0 ) ) );
          line = max( line, cross );
        }
        // a footprint's faint fill (the AC-130's ring hardly any: 140 m of red flooded an overhead view); the aim none
        fill = aim ? 0.0 : ( 1.0 - smoothstep( R - px, R + px, r ) ) * ( s > 1.5 ? 0.02 : 0.07 );
      } else if ( s > 2.5 ) {
        // track (3), the recon pass: its flight line with chevrons marching along it, the swath's edges dashed, no fill
        // (the desktop capture: drawn as a lane, the 320 m swath's chevrons merged into one blue sheet over the field)
        float sh = sin( B.x ), ch = cos( B.x );
        float along = d.x * sh + d.y * ch, across = d.x * ch - d.y * sh;
        float hl = A.z, hw = A.w;
        float within = step( abs( along ), hl );
        float dashes = step( 0.5, fract( along / 24.0 - T * ( 0.3 + urg * 1.2 ) ) );
        line = cotStrikeLine( abs( across ) - hw, w, px ) * within * dashes * 0.7;
        line = max( line, cotStrikeLine( across, w, px ) * within );
        float period = 30.0;
        float v = fract( ( along - T * ( 12.0 + urg * 40.0 ) ) / period ) * period - period * 0.5;
        line = max( line, cotStrikeLine( v + abs( across ) * 0.8, w, px ) * step( abs( across ), 8.0 ) * within );
      } else {
        // lane (1): along the heading (x of local = across, y = along)
        float sh = sin( B.x ), ch = cos( B.x );
        float along = d.x * sh + d.y * ch, across = d.x * ch - d.y * sh;
        float hl = A.z, hw = A.w;
        float inside = step( abs( along ), hl ) * step( abs( across ), hw );
        float sides = cotStrikeLine( abs( across ) - hw, w, px ) * step( abs( along ), hl + w );
        float ends = cotStrikeLine( abs( along ) - hl, w, px ) * step( abs( across ), hw + w );
        line = max( sides, ends );
        // chevrons marching down the lane toward the far end (the run's direction)
        float period = 14.0;
        float v = fract( ( along - T * ( 6.0 + urg * 30.0 ) ) / period ) * period - period * 0.5;
        float chev = cotStrikeLine( v + abs( across ) * 0.55, w * 1.1, px ) * step( abs( across ), hw * 0.62 );
        line = max( line, chev * inside * 0.85 );
        fill = aim ? 0.0 : inside * 0.06;
      }
      float pulse = 0.75 + 0.25 * sin( T * ( 3.0 + urg * 9.0 ) );
      vec3 col = C.rgb * C.w;
      rgb = mix( rgb, rgb * 0.55 + col * 0.45, fill * ( 0.6 + 0.4 * urg ) * hFade );
      rgb = mix( rgb, col * pulse, clamp( line, 0.0, 1.0 ) * 0.85 * hFade );
    }
    return rgb;
  }
`;
