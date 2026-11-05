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
 * Shapes (the call-ins' footprints, sim/airSupport.ts strikeFootprint): a circle (the artillery's dispersion, the
 * bomb's blast with its laser cross), a lane (the strafing run's lane with chevrons marching along its heading, the
 * recon pass's swath), the AC-130's orbit ring; and the aiming reticle of the crew's own strike view, brighter, with
 * its range ticks. Lines are emissive in the linear HDR buffer (they read through the haze and touch the bloom).
 * Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import * as THREE from 'three';

export const STRIKE_MARK_MAX = 8;
export type StrikeMarkShape = 'circle' | 'lane' | 'orbit' | 'aim-circle' | 'aim-lane' | 'aim-orbit';
const SHAPE_CODE: Readonly<Record<StrikeMarkShape, number>> = Object.freeze({
  circle: 0, lane: 1, orbit: 2, 'aim-circle': 3, 'aim-lane': 4, 'aim-orbit': 5,
});

/** One mark: where, its size, its heading, its colour (linear) and how near it is to landing (0..1). */
export interface StrikeMark {
  x: number; y: number; z: number;
  shape: StrikeMarkShape;
  /** circle/orbit: the radius; lane: the half length along the heading. */
  sizeA: number;
  /** lane: the half width. */
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
export function createStrikeMarkUniforms(): typeof UNIFORMS { return UNIFORMS; }

/** Publish this frame's marks (at most STRIKE_MARK_MAX; the rest wait) and the marks' clock (s, for the dashes). */
export function setStrikeMarks(marks: readonly StrikeMark[], timeS: number): void {
  const n = Math.min(STRIKE_MARK_MAX, marks.length);
  UNIFORMS.uStrikeN.value = n;
  UNIFORMS.uStrikeT.value = timeS % 600;
  for (let i = 0; i < n; i++) {
    const m = marks[i]!;
    UNIFORMS.uStrikeA.value[i]!.set(m.x, m.z, m.sizeA, m.sizeB);
    UNIFORMS.uStrikeB.value[i]!.set(m.heading, SHAPE_CODE[m.shape], Math.max(0, Math.min(1, m.urgency)), m.y);
    UNIFORMS.uStrikeC.value[i]!.set(m.r, m.g, m.b, m.shape.startsWith('aim') ? 2.6 : 1.8);
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
    px = max( px, 0.02 );
    for ( int i = 0; i < COT_STRIKE_MAX; i++ ) {
      if ( i >= uStrikeN ) break;
      vec4 A = uStrikeA[ i ], B = uStrikeB[ i ], C = uStrikeC[ i ];
      vec2 d = g - A.xy;
      float reach = max( A.z, A.w ) + 12.0;
      if ( abs( d.x ) > reach || abs( d.y ) > reach ) continue;
      // paint the ground, the roofs and the walls near it; never the sky above the mark's own ground
      if ( wp.y > B.w + 45.0 ) continue;
      float shape = B.y, urg = B.z, T = uStrikeT;
      bool aim = shape > 2.5;
      float s = aim ? shape - 3.0 : shape;
      float w = max( 0.22, px * ( aim ? 1.4 : 1.0 ) ) * ( 1.0 + urg * 0.8 );
      float line = 0.0, fill = 0.0;
      if ( s < 0.5 || s > 1.5 ) {
        // circle (0) and orbit ring (2)
        float r = length( d ), R = A.z;
        float ang = atan( d.y, d.x );
        float ring = cotStrikeLine( r - R, w, px );
        // dashes marching round the ring (quicker as it nears); the orbit's are long, the circle's short
        float dashes = s > 1.5 ? 18.0 : 36.0;
        float dash = step( 0.42, fract( ang / 6.2831853 * dashes + T * ( 0.25 + urg * 1.2 ) * ( s > 1.5 ? -1.0 : 1.0 ) ) );
        line = max( line, ring * mix( dash, 1.0, aim ? 0.6 : 0.25 ) );
        // the inner ring and four ticks (the bomb's laser cross reads in them)
        line = max( line, cotStrikeLine( r - R * 0.5, w * 0.6, px ) * 0.55 );
        vec2 a2 = abs( d );
        float tick = max( cotStrikeLine( d.x, w * 0.8, px ) * step( a2.y, R * 1.12 ) * step( R * 0.72, a2.y ),
                          cotStrikeLine( d.y, w * 0.8, px ) * step( a2.x, R * 1.12 ) * step( R * 0.72, a2.x ) );
        line = max( line, tick );
        if ( aim || s < 0.5 ) {
          // the centre cross
          float cross = max( cotStrikeLine( d.x, w * 0.7, px ) * step( a2.y, min( R * 0.18, 6.0 ) ),
                             cotStrikeLine( d.y, w * 0.7, px ) * step( a2.x, min( R * 0.18, 6.0 ) ) );
          line = max( line, cross );
        }
        fill = ( 1.0 - smoothstep( R - px, R + px, r ) ) * ( s > 1.5 ? 0.05 : 0.11 );
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
        fill = inside * 0.09;
      }
      float pulse = 0.75 + 0.25 * sin( T * ( 3.0 + urg * 9.0 ) );
      vec3 col = C.rgb * C.w;
      rgb = mix( rgb, rgb * 0.55 + col * 0.45, fill * ( 0.6 + 0.4 * urg ) );
      rgb = mix( rgb, col * pulse, clamp( line, 0.0, 1.0 ) * 0.9 );
    }
    return rgb;
  }
`;
