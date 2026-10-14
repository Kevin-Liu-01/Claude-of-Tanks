// src/world/hinterland/material.ts — the land material's surface (HZ.09, the horizons stream, 2026-10-13;
// B-architecture §4.3): the worker's surface atlas (surface.ts — the land's albedo and its flags at half each height
// level's resolution) packed into one texture, read in the land mesh's fragment at the finest level that holds the
// point (bilinear for the albedo, nearest for the flags), with a world-space detail that breaks the texels (a field's
// furrows and tone across it, the grain of a wood's canopy seen from afar, the rock's beds), the water's gloss, and the
// distance fade of that detail by the pixel's footprint rather than a distance switch. Its own program (the battlefield's
// terrain program is at its samplers' limit): the height atlas and this one, two samplers past three's own.
import * as THREE from 'three';
import type { HinterlandWire } from './wire.ts';

export interface HinterlandSurface { uniforms: Record<string, THREE.IUniform>; fragmentPars: string; albedo: string; roughness: string }

/** Pack the surface levels into one RGBA8 texture (the finest first in a row, the rest shelved below it). */
function packSurface(levels: NonNullable<HinterlandWire['surface']>): { texture: THREE.DataTexture; blocks: { x0: number; y0: number; n: number; texelM: number; halfM: number }[] } {
  const blocks: { x0: number; y0: number; n: number; texelM: number; halfM: number }[] = [];
  let x = 0, y = 0, shelf = 0, width = 0;
  const rowWidth = levels[0].n + (levels[1]?.n ?? 0);
  for (const level of levels) {
    if (x > 0 && x + level.n > rowWidth) { x = 0; y += shelf; shelf = 0; }
    blocks.push({ x0: x, y0: y, n: level.n, texelM: level.texelM, halfM: level.halfM });
    x += level.n; shelf = Math.max(shelf, level.n); width = Math.max(width, x);
  }
  const height = y + shelf;
  const data = new Uint8Array(width * height * 4);
  levels.forEach((level, i) => {
    const b = blocks[i];
    for (let j = 0; j < level.n; j++) data.set(level.rgba.subarray(j * level.n * 4, (j + 1) * level.n * 4), ((b.y0 + j) * width + b.x0) * 4);
  });
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.minFilter = THREE.NearestFilter; texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false; texture.needsUpdate = true;
  return { texture, blocks };
}

/** The land's surface from the worker's atlas; null (no atlas) draws the debug albedo by slope (mesh.ts). */
export function createHinterlandSurface(wire: HinterlandWire): HinterlandSurface | null {
  if (!wire.surface?.length) return null;
  const { texture, blocks } = packSurface(wire.surface);
  const n = blocks.length;
  const uniforms: Record<string, THREE.IUniform> = {
    uHlSurface: { value: texture },
    uHlSBlock: { value: blocks.map((b) => new THREE.Vector4(b.x0, b.y0, b.n, b.texelM)) },
    uHlSHalf: { value: blocks.map((b) => b.halfM) },
  };
  const fragmentPars = /* glsl */`
uniform sampler2D uHlSurface;
uniform vec4 uHlSBlock[${n}];
uniform float uHlSHalf[${n}];
float hlFlags = 0.0;
int hlSurfaceLevel( vec2 p ) {
  float a = max( abs( p.x ), abs( p.y ) );
  for ( int i = 0; i < ${n - 1}; i++ ) if ( a < uHlSHalf[i] - 2.0 * uHlSBlock[i].w ) return i;
  return ${n - 1};
}
vec4 hlSurfaceAt( vec2 p ) {
  int i = hlSurfaceLevel( p );
  vec4 b = uHlSBlock[i];
  vec2 f = clamp( ( p + uHlSHalf[i] ) / b.w, vec2( 0.0 ), vec2( b.z - 1.001 ) );
  ivec2 c = ivec2( floor( f ) ), o = ivec2( b.xy ) + c;
  vec2 t = f - vec2( c );
  vec4 s00 = texelFetch( uHlSurface, o, 0 ), s10 = texelFetch( uHlSurface, o + ivec2( 1, 0 ), 0 );
  vec4 s01 = texelFetch( uHlSurface, o + ivec2( 0, 1 ), 0 ), s11 = texelFetch( uHlSurface, o + ivec2( 1, 1 ), 0 );
  // the flags from the nearest texel (a bitmask never blends)
  vec4 sn = t.x < 0.5 ? ( t.y < 0.5 ? s00 : s01 ) : ( t.y < 0.5 ? s10 : s11 );
  hlFlags = floor( sn.a * 255.0 + 0.5 );
  return vec4( mix( mix( s00.rgb, s10.rgb, t.x ), mix( s01.rgb, s11.rgb, t.x ), t.y ), sn.a );
}
float hlHash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float hlNoise( vec2 x ) {
  vec2 i = floor( x ), f = fract( x ), u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hlHash( i ), hlHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( hlHash( i + vec2( 0.0, 1.0 ) ), hlHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
bool hlFlag( float bit ) { return mod( floor( hlFlags / bit ), 2.0 ) > 0.5; }
`;
  const albedo = /* glsl */`{
    vec4 hlS = hlSurfaceAt( vHlWorld.xz );
    vec3 hlAlb = pow( hlS.rgb, vec3( 2.2 ) );
    // the detail, faded by the pixel's footprint (a texel of detail under a pixel averages out, it never shimmers)
    float hlFoot = length( fwidth( vHlWorld.xz ) );
    float hlNear = 1.0 - smoothstep( 1.5, 9.0, hlFoot ), hlMid = 1.0 - smoothstep( 8.0, 60.0, hlFoot );
    vec2 hlP = vHlWorld.xz;
    float hlD = ( hlNoise( hlP * 0.19 ) - 0.5 ) * 0.22 * hlNear + ( hlNoise( hlP * 0.031 ) - 0.5 ) * 0.26 * hlMid + ( hlNoise( hlP * 0.004 ) - 0.5 ) * 0.18;
    if ( hlFlag( 2.0 ) ) {
      // a wood seen from afar: the crowns' grain, light tops and dark gaps
      hlD += ( hlNoise( hlP * 0.11 ) - 0.5 ) * 0.5 * hlMid;
    }
    if ( hlFlag( 4.0 ) ) {
      // rock: its beds along the height, broken
      hlD += ( sin( vHlWorld.y * 0.9 + hlNoise( hlP * 0.02 ) * 6.0 ) * 0.08 ) * hlMid;
    }
    diffuseColor.rgb = hlAlb * clamp( 1.0 + hlD, 0.55, 1.5 );
  }`;
  const roughness = /* glsl */`
  float roughnessFactor = roughness;
  if ( hlFlag( 1.0 ) ) roughnessFactor = hlFlag( 64.0 ) ? 0.12 : 0.2;
  else if ( hlFlag( 8.0 ) ) roughnessFactor = 0.7;
`;
  return { uniforms, fragmentPars, albedo, roughness };
}
