// src/world/hinterland/material.ts — the land material's surface (HZ.09, the horizons stream, 2026-10-13;
// B-architecture §4.3): the worker's surface atlas (surface.ts — the land's albedo and its flags at half each height
// level's resolution) packed into one texture, read in the land mesh's fragment at the finest level that holds the
// point (bilinear for the albedo, nearest for the flags), with a world-space detail that breaks the texels (a field's
// furrows and tone across it, the grain of a wood's canopy seen from afar, the rock's beds), the water's gloss, and the
// distance fade of that detail by the pixel's footprint rather than a distance switch. Its own program (the battlefield's
// terrain program is at its samplers' limit): the height atlas and this one, two samplers past three's own.
import * as THREE from 'three';
import { HL_EDGE_OFFSET_M, HL_EDGE_SCALE, type HinterlandWire } from './wire.ts';

export interface HinterlandSurface {
  uniforms: Record<string, THREE.IUniform>; fragmentPars: string; albedo: string; roughness: string; normal: string;
  /** The program's variant for the cache key ('lite' on the light tiers: no bedding, shoulders or ground bump). */
  key: string;
}

/** Pack the surface levels into one RGBA8 texture (the finest first in a row, the rest shelved below it), and their
 * edge offsets into a second with the same layout. */
function packSurface(levels: NonNullable<HinterlandWire['surface']>): { texture: THREE.DataTexture; edges: THREE.DataTexture | null; blocks: { x0: number; y0: number; n: number; texelM: number; halfM: number }[] } {
  const blocks: { x0: number; y0: number; n: number; texelM: number; halfM: number }[] = [];
  let x = 0, y = 0, shelf = 0, width = 0;
  const rowWidth = levels[0].n + (levels[1]?.n ?? 0);
  for (const level of levels) {
    if (x > 0 && x + level.n > rowWidth) { x = 0; y += shelf; shelf = 0; }
    blocks.push({ x0: x, y0: y, n: level.n, texelM: level.texelM, halfM: level.halfM });
    x += level.n; shelf = Math.max(shelf, level.n); width = Math.max(width, x);
  }
  const height = y + shelf;
  const pack = (pick: (level: (typeof levels)[number]) => Uint8Array | null, fill: number): THREE.DataTexture => {
    const data = new Uint8Array(width * height * 4).fill(fill);
    levels.forEach((level, i) => {
      const b = blocks[i], src = pick(level);
      if (!src) return;
      for (let j = 0; j < level.n; j++) data.set(src.subarray(j * level.n * 4, (j + 1) * level.n * 4), ((b.y0 + j) * width + b.x0) * 4);
    });
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.minFilter = THREE.NearestFilter; texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false; texture.needsUpdate = true;
    return texture;
  };
  const texture = pack((l) => l.rgba, 0);
  const edges = levels.some((l) => l.edges) ? pack((l) => l.edges, 255) : null;
  return { texture, edges, blocks };
}

/** The land's surface from the worker's atlas; null (no atlas) draws the debug albedo by slope (mesh.ts). */
export function createHinterlandSurface(wire: HinterlandWire, { lite = false }: { lite?: boolean } = {}): HinterlandSurface | null {
  if (!wire.surface?.length) return null;
  const { texture, edges, blocks } = packSurface(wire.surface);
  const n = blocks.length;
  const rot = wire.landRot ?? [1, 0];
  // the steep faces' bedding: from 10° past the region's rock slope to 16° past it (the alpine 50–56°: the critics on
  // round 4c, "bedding only on faces over 50–55°"), the region's own dip at most 6° over the folds' (round 5)
  const rock = wire.rock ?? null;
  const rad = Math.PI / 180;
  const uniforms: Record<string, THREE.IUniform> = {
    uHlRock: { value: new THREE.Vector4(rock?.rgb[0] ?? 0, rock?.rgb[1] ?? 0, rock?.rgb[2] ?? 0, rock ? 1 : 0) },
    uHlStrata: { value: new THREE.Vector4(Math.cos(((rock?.slopeDeg ?? 40) + 10) * rad), Math.cos(((rock?.slopeDeg ?? 40) + 16) * rad),
      rock?.snowy ? 1 : 0, Math.tan(Math.min(6, Math.abs(rock?.dipDeg ?? 0)) * rad)) },
    uHlSurface: { value: texture },
    uHlEdges: { value: edges ?? texture },
    uHlLandRot: { value: new THREE.Vector3(rot[0], rot[1], edges && wire.landRot ? 1 : 0) },
    uHlSBlock: { value: blocks.map((b) => new THREE.Vector4(b.x0, b.y0, b.n, b.texelM)) },
    uHlSHalf: { value: blocks.map((b) => b.halfM) },
  };
  const fragmentPars = /* glsl */`
${lite ? '#define HL_LITE' : ''}
uniform sampler2D uHlSurface;
uniform sampler2D uHlEdges;
uniform vec3 uHlLandRot; // the land-use grid's (cos, sin) heading; z: 1 where the edges are baked
uniform vec4 uHlSBlock[${n}];
uniform float uHlSHalf[${n}];
float hlFlags = 0.0;
int hlSurfaceLevel( vec2 p ) {
  float a = max( abs( p.x ), abs( p.y ) );
  for ( int i = 0; i < ${n - 1}; i++ ) if ( a < uHlSHalf[i] - 2.0 * uHlSBlock[i].w ) return i;
  return ${n - 1};
}
float hlEdgeDist = 1e6;
// a texel's field holds the point d metres (world xz) from the texel's centre: neither of its nearer edges crossed —
// the offsets run linearly along the grid's axes, so the test is two straight lines (soft over the pixel's footprint)
float hlInside( vec4 e, vec2 d, float fw ) {
  if ( e.r > 0.999 && e.g > 0.999 ) return 1.0; // no field: holds anything
  float sU = ( e.r * 65280.0 + e.g * 255.0 ) / ${HL_EDGE_SCALE.toFixed(1)} - ${HL_EDGE_OFFSET_M.toFixed(1)};
  float sV = ( e.b * 65280.0 + e.a * 255.0 ) / ${HL_EDGE_SCALE.toFixed(1)} - ${HL_EDGE_OFFSET_M.toFixed(1)};
  float dU = uHlLandRot.x * d.x + uHlLandRot.y * d.y, dV = -uHlLandRot.y * d.x + uHlLandRot.x * d.y;
  float u = sign( sU ) * ( sU + dU ), v = sign( sV ) * ( sV + dV );
  hlEdgeDist = min( hlEdgeDist, min( abs( u ), abs( v ) ) );
  return clamp( 0.5 + u / fw, 0.0, 1.0 ) * clamp( 0.5 + v / fw, 0.0, 1.0 );
}
float hlHash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float hlNoise( vec2 x ) {
  vec2 i = floor( x ), f = fract( x ), u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hlHash( i ), hlHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( hlHash( i + vec2( 0.0, 1.0 ) ), hlHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
vec4 hlSurfaceAt( vec2 p ) {
  int i = hlSurfaceLevel( p );
  vec4 b = uHlSBlock[i];
  // the lookup wanders ~0.6 texel off the grid on a smooth field, so a boundary that is no parcel's edge (snow and rock,
  // a wood's, the water's) runs as a natural line, not the texel grid's blocks (the coordinator on the Glacier frames);
  // a parcel's edges below are rebuilt from the exact point, so they stay straight
  vec2 jq = p / ( 2.1 * b.w );
  vec2 pj = p + ( vec2( hlNoise( jq ), hlNoise( jq + vec2( 17.3, -9.1 ) ) ) - 0.5 ) * 1.2 * b.w;
  vec2 f = clamp( ( pj + uHlSHalf[i] ) / b.w, vec2( 0.0 ), vec2( b.z - 1.001 ) );
  ivec2 c = ivec2( floor( f ) ), o = ivec2( b.xy ) + c;
  vec2 t = f - vec2( c );
  vec4 s00 = texelFetch( uHlSurface, o, 0 ), s10 = texelFetch( uHlSurface, o + ivec2( 1, 0 ), 0 );
  vec4 s01 = texelFetch( uHlSurface, o + ivec2( 0, 1 ), 0 ), s11 = texelFetch( uHlSurface, o + ivec2( 1, 1 ), 0 );
  // the flags from the nearest texel (a bitmask never blends)
  vec4 sn = t.x < 0.5 ? ( t.y < 0.5 ? s00 : s01 ) : ( t.y < 0.5 ? s10 : s11 );
  hlFlags = floor( sn.a * 255.0 + 0.5 );
  vec3 bil = mix( mix( s00.rgb, s10.rgb, t.x ), mix( s01.rgb, s11.rgb, t.x ), t.y );
  hlEdgeDist = 1e6;
  if ( uHlLandRot.z < 0.5 ) return vec4( bil, sn.a );
  // the parcels' edges straight between the texels (the coordinator on the pilot's overview: "stair-stepped, pixelated
  // edges"): each of the four texels weighs in only where its own field holds the point, by its bilinear weight
  vec4 e00 = texelFetch( uHlEdges, o, 0 ), e10 = texelFetch( uHlEdges, o + ivec2( 1, 0 ), 0 );
  vec4 e01 = texelFetch( uHlEdges, o + ivec2( 0, 1 ), 0 ), e11 = texelFetch( uHlEdges, o + ivec2( 1, 1 ), 0 );
  vec2 d00 = ( p + uHlSHalf[i] ) - vec2( c ) * b.w;
  float fw = max( 0.35, length( fwidth( p ) ) );
  float w00 = ( 1.0 - t.x ) * ( 1.0 - t.y ) * hlInside( e00, d00, fw );
  float w10 = t.x * ( 1.0 - t.y ) * hlInside( e10, d00 - vec2( b.w, 0.0 ), fw );
  float w01 = ( 1.0 - t.x ) * t.y * hlInside( e01, d00 - vec2( 0.0, b.w ), fw );
  float w11 = t.x * t.y * hlInside( e11, d00 - vec2( b.w ), fw );
  float ws = w00 + w10 + w01 + w11;
  // (no texel's field holds it — a field narrower than the texels: the plain bilinear)
  vec3 rgb = ws > 1e-3 ? ( s00.rgb * w00 + s10.rgb * w10 + s01.rgb * w01 + s11.rgb * w11 ) / ws : bil;
  return vec4( rgb, sn.a );
}
bool hlFlag( float bit ) { return mod( floor( hlFlags / bit ), 2.0 ) > 0.5; }
uniform vec4 uHlRock;   // the region's rock (linear), and 1 where the wire carries it
uniform vec4 uHlStrata; // cos of the slope where the strata begin and where they are full; ledges hold snow; the dip's tangent
float hlLedge = 0.0;
// the steep faces' bedding (round 5, the critics on round 4c: "the uniform dashes read as contour lines"): the beds'
// surface dips 5–25° and folds over kilometres (two low octaves) and steps at a fault or two (10–40 m throw); it is cut
// into formations ~180 m thick, each massive (beds 40–90 m: dark cliff bands) or thin-bedded (4–15 m, log-spread:
// packets of steps that hold snow); a dark joint under each bed, snow on a thin-bedded bed's bench — 0.3–3 m wide,
// broken along the strike so a third to a half of it is gap — only where the face holds it (under ~62°), dark varnish
// down the fall line here and there. Under a pixel that holds several beds they average out. n: the world normal;
// eY, eA: the pixel's footprint in height and across the strike (taken in uniform control flow by the caller).
vec3 hlStrataAt( vec3 w, vec3 n, float eY, float eA, out float ledge ) {
  vec2 q = w.xz;
  float hb = w.y + ( hlNoise( q * 0.00038 + vec2( 3.1, -7.7 ) ) - 0.5 ) * 650.0 + ( hlNoise( q * 0.0011 + vec2( -5.3, 2.9 ) ) - 0.5 ) * 160.0
    + 26.0 * smoothstep( 0.49, 0.51, hlNoise( q * 0.0009 + vec2( 9.3, 1.1 ) ) ) + dot( q, vec2( 0.8, 0.6 ) ) * uHlStrata.w;
  float F = floor( hb / 180.0 ), local = hb - F * 180.0;
  float massive = step( 0.62, hlHash( vec2( F, 2.71 ) ) );
  float T = massive > 0.5 ? mix( 40.0, 90.0, hlHash( vec2( F, 5.3 ) ) ) : exp( mix( 1.386, 2.708, hlHash( vec2( F, 8.9 ) ) ) );
  float ph = local / T + 0.18 * sin( local / ( 2.3 * T ) + F );
  float k = floor( ph ) + F * 97.0, fr = fract( ph );
  float e = max( 1.3 * eY / T, 0.01 );
  float crisp = 1.0 - smoothstep( 0.3, 0.7, e );
  float tone = massive > 0.5 ? 0.38 + 0.18 * hlHash( vec2( k, 7.13 ) ) : 0.55 + 0.45 * hlHash( vec2( k, 7.13 ) );
  // the joint under each bed (~1.5 m), the bench's snow on a thin bed's top (0.3–3 m, broken along the strike)
  float jw = min( 0.3, 1.5 / T );
  float joint = 1.0 - smoothstep( jw * 0.4, jw + e, fr );
  float lw = min( 0.4, mix( 0.3, 3.0, hlHash( vec2( k, 3.71 ) ) ) / T );
  float run = smoothstep( 0.46, 0.56, 0.55 * hlNoise( q * 0.02 + vec2( k * 3.1, k * 1.7 ) ) + 0.45 * hlNoise( q * 0.08 + vec2( k * 5.3, k * 2.9 ) ) );
  float hold = smoothstep( 0.47, 0.6, n.y ) * ( 1.0 - massive * 0.85 );
  ledge = smoothstep( 1.0 - lw - e, 1.0 - lw + e, fr ) * run * hold * uHlStrata.z * crisp;
  // the varnish down the fall line (across the strike, a few metres; faded where a pixel holds several)
  vec2 sd = normalize( vec2( -n.z, n.x ) + vec2( 1e-4, 0.0 ) );
  float a = dot( q, sd ) / 9.0;
  float streak = smoothstep( 0.55, 0.85, hlNoise( vec2( a, hb / 140.0 ) ) ) * ( 1.0 - smoothstep( 0.3, 0.8, eA / 9.0 ) );
  // (the faces past ~60° bare and dark: the light spire reads against them)
  float bare = 1.0 - 0.3 * smoothstep( 0.55, 0.45, n.y );
  vec3 rockC = uHlRock.rgb * 0.7 * bare * mix( 0.7, tone * ( 1.0 - 0.55 * joint ), crisp ) * ( 1.0 - 0.4 * streak );
  vec3 snowC = vec3( 0.72, 0.79, 0.88 );
  return mix( mix( rockC, snowC, ( 1.0 - crisp ) * uHlStrata.z * hold * 0.12 ), snowC, ledge );
}
// the shoulders under the bedding (round 5: "shoulders and lower slopes become scree or talus aprons, snowfields and
// forest; replace the cotton-blob snow with crisp snowfields driven by slope and aspect"): where the atlas blends rock
// and snow, a crisp line chosen by the blend's share, the slope, the aspect (north faces hold more) and a ragged noise;
// the rock there scree, paler and grained. alb: the atlas's linear albedo; n: the world normal.
vec3 hlShoulderAt( vec3 w, vec3 n, vec3 alb, float eQ ) {
  float share = clamp( ( dot( alb, vec3( 0.2126, 0.7152, 0.0722 ) ) - 0.07 ) / 0.71, 0.0, 1.0 );
  vec2 q = w.xz;
  float rag = 0.6 * hlNoise( q * 0.025 + 4.4 ) + 0.4 * hlNoise( q * 0.09 - 2.2 );
  float s = share + ( rag - 0.5 ) * 0.45 - ( 1.0 - n.y ) * 0.5 + 0.12 * n.z;
  float edge = 0.03 + 0.5 * min( 1.0, eQ / 40.0 );
  float snow = smoothstep( 0.5 - edge, 0.5 + edge, s );
  float grain = 1.0 - smoothstep( 2.0, 8.0, eQ );
  vec3 scree = uHlRock.rgb * ( 1.35 + 0.25 * ( hlNoise( q * 0.35 ) - 0.5 ) * grain + 0.2 * ( hlNoise( q * 0.05 ) - 0.5 ) );
  return mix( scree, vec3( 0.72, 0.79, 0.88 ), snow * uHlStrata.z );
}
`;`;
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
    // the steep faces' bedding and the shoulders' snowfields and scree (round 5): the footprints taken here, in uniform
    // control flow; the beds drawn only where the face is steep (most of the land never pays for them), the shoulders
    // only on the atlas's rock and snow texels; none of it on the light tiers (HL_LITE: phones, the light presets)
#ifndef HL_LITE
    if ( uHlRock.w > 0.5 ) {
      vec3 hlNW = normalize( ( vec4( vNormal, 0.0 ) * viewMatrix ).xyz );
      float hlEY = fwidth( vHlWorld.y );
      float hlSteep = ( 1.0 - smoothstep( uHlStrata.y, uHlStrata.x, hlNW.y ) ) * ( hlFlag( 1.0 ) || hlFlag( 2.0 ) ? 0.0 : 1.0 );
      bool hlShoulder = ( hlFlag( 4.0 ) || hlFlag( 8.0 ) ) && !hlFlag( 1.0 ) && !hlFlag( 2.0 );
      if ( hlShoulder && hlSteep < 1.0 ) diffuseColor.rgb = mix( diffuseColor.rgb, hlShoulderAt( vHlWorld, hlNW, hlAlb, hlFoot ), 1.0 - hlSteep );
      if ( hlSteep > 0.0 ) {
        float hlL;
        vec3 hlSt = hlStrataAt( vHlWorld, hlNW, hlEY, hlFoot, hlL );
        diffuseColor.rgb = mix( diffuseColor.rgb, hlSt, hlSteep );
        hlLedge = hlL * hlSteep;
      }
    }
#endif
    // a field's boundary: its ditch and rank margin, a darker line a metre and a half wide, where a pixel resolves it
    float hlLine = ( 1.0 - smoothstep( 0.5, 1.6, hlEdgeDist ) ) * ( 1.0 - smoothstep( 1.0, 4.0, hlFoot ) );
    diffuseColor.rgb *= 1.0 - 0.24 * hlLine;
  }`;
  const roughness = /* glsl */`
  float roughnessFactor = roughness;
  if ( hlFlag( 1.0 ) ) roughnessFactor = hlFlag( 64.0 ) ? 0.12 : 0.2;
  else if ( hlFlag( 8.0 ) ) roughnessFactor = 0.7;
`;
  // the ground's own relief under a pixel that resolves it: drifts and hummocks a few metres to a few tens across tilt
  // the normal, so the outland reads as textured ground from the air as the battlefield's does (the coordinator on the
  // Glacier bird view: "the playable square reads as a distinct lighter, textured tile against a flat outland")
  const normal = /* glsl */`
  {
    float hlFootN = length( fwidth( vHlWorld.xz ) );
#ifdef HL_LITE
    float hlBumpW = 0.0;
#else
    float hlBumpW = ( 1.0 - smoothstep( 2.0, 9.0, hlFootN ) ) * ( hlFlag( 8.0 ) ? 1.0 : 0.6 ) * ( hlFlag( 1.0 ) ? 0.0 : 1.0 );
#endif
    if ( hlBumpW > 0.0 ) {
      vec2 q = vHlWorld.xz;
      float n0 = hlNoise( q * 0.11 ) + 0.6 * hlNoise( q * 0.034 );
      float nx = hlNoise( ( q + vec2( 1.5, 0.0 ) ) * 0.11 ) + 0.6 * hlNoise( ( q + vec2( 1.5, 0.0 ) ) * 0.034 );
      float nz = hlNoise( ( q + vec2( 0.0, 1.5 ) ) * 0.11 ) + 0.6 * hlNoise( ( q + vec2( 0.0, 1.5 ) ) * 0.034 );
      vec3 hlTilt = vec3( n0 - nx, 0.0, n0 - nz ) * ( 2.4 * hlBumpW );
      normal = normalize( normal + ( viewMatrix * vec4( hlTilt, 0.0 ) ).xyz );
    }
    // a ledge's snow lies on its level top: it faces the sky, not the wall's own fall
    if ( hlLedge > 0.0 ) normal = normalize( mix( normal, ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz, 0.6 * hlLedge ) );
  }`;
  return { uniforms, fragmentPars, albedo, roughness, normal, key: lite ? 'lite' : 'full' };
}
