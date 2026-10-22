// src/world/hinterland/material.ts — the land material's surface (HZ.09, the horizons stream, 2026-10-13;
// B-architecture §4.3): the worker's surface atlas (surface.ts — the land's albedo and its flags at half each height
// level's resolution) packed into one texture, read in the land mesh's fragment at the finest level that holds the
// point (bilinear for the albedo, nearest for the flags), with a world-space detail that breaks the texels (a field's
// furrows and tone across it, the grain of a wood's canopy seen from afar, the rock's beds), the water's gloss, and the
// distance fade of that detail by the pixel's footprint rather than a distance switch. Its own program (the battlefield's
// terrain program is at its samplers' limit): the height atlas and this one, two samplers past three's own.
import * as THREE from 'three';
import { HL_EDGE_OFFSET_M, HL_EDGE_SCALE, type HinterlandWire } from './wire.ts';

export interface HinterlandSurface { uniforms: Record<string, THREE.IUniform>; fragmentPars: string; albedo: string; roughness: string; normal: string }

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
export function createHinterlandSurface(wire: HinterlandWire): HinterlandSurface | null {
  if (!wire.surface?.length) return null;
  const { texture, edges, blocks } = packSurface(wire.surface);
  const n = blocks.length;
  const rot = wire.landRot ?? [1, 0];
  // the steep faces' strata: from 3° past the region's rock slope to 9° past it (the alpine 43–49°: the coordinator's
  // "every face steeper than ~45°"), the beds' dip at most 6° (regular beds)
  const rock = wire.rock ?? null;
  const rad = Math.PI / 180;
  const uniforms: Record<string, THREE.IUniform> = {
    uHlRock: { value: new THREE.Vector4(rock?.rgb[0] ?? 0, rock?.rgb[1] ?? 0, rock?.rgb[2] ?? 0, rock ? 1 : 0) },
    uHlStrata: { value: new THREE.Vector4(Math.cos(((rock?.slopeDeg ?? 40) + 3) * rad), Math.cos(((rock?.slopeDeg ?? 40) + 9) * rad),
      rock?.snowy ? 1 : 0, Math.tan(Math.min(6, Math.abs(rock?.dipDeg ?? 0)) * rad)) },
    uHlSurface: { value: texture },
    uHlEdges: { value: edges ?? texture },
    uHlLandRot: { value: new THREE.Vector3(rot[0], rot[1], edges && wire.landRot ? 1 : 0) },
    uHlSBlock: { value: blocks.map((b) => new THREE.Vector4(b.x0, b.y0, b.n, b.texelM)) },
    uHlSHalf: { value: blocks.map((b) => b.halfM) },
  };
  const fragmentPars = /* glsl */`
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
// the steep faces' strata (round 4, the coordinator on Glacier's edge-n: "the ring's wall wins because its strata are
// CRISP: thin, dark, regular beds with bright snow on every ledge"; the atlas's texels on the walls are 24–96 m): beds of
// 13–28 m by world height, wandering and dipping gently, each a tone of its own, a dark joint at its foot and a snow
// ledge along its top broken along the strike, streaked down the fall line; under a pixel that holds several beds they
// average out to the face's tone (no shimmer). n: the world normal.
vec3 hlStrataAt( vec3 w, vec3 n, out float ledge ) {
  vec2 q = w.xz;
  // (the beds wander over hundreds of metres, and a few metres over tens: no bed runs as a drawn contour)
  float hb = w.y + ( hlNoise( q * 0.0035 ) - 0.5 ) * 70.0 + ( hlNoise( q * 0.016 + 3.7 ) - 0.5 ) * 10.0
    + ( hlNoise( q * 0.07 + 1.3 ) - 0.5 ) * 4.0 + dot( q, vec2( 0.8, 0.6 ) ) * uHlStrata.w;
  // (a bed 13–28 m: the phase runs at 1/18 m, swung over 230 m and 57 m of height)
  float ph = hb / 18.0 + 0.4 * sin( hb / 37.0 ) + 0.09 * sin( hb / 9.1 + 1.7 );
  float k = floor( ph ), fr = ph - k;
  float e = max( fwidth( ph ), 0.015 );
  float crisp = 1.0 - smoothstep( 0.22, 0.6, e );
  // (a snowy face's beds a third closer in tone: under the snow the schist's bands read as rock, not as ruled stripes)
  float tone = mix( 0.45 + 0.6 * hlHash( vec2( k, 7.13 ) ), 0.75, 0.35 * uHlStrata.z );
  // the along-strike coordinate: a bed's laminae smear along it, the fall line's streaks cross it
  vec2 sd = normalize( vec2( -n.z, n.x ) + vec2( 1e-4, 0.0 ) );
  float a = dot( q, sd );
  // (laminae of ~5 m, read at two kilometres; under a pixel that holds several they average out)
  float lam = ( hlNoise( vec2( a / 30.0, hb / 5.0 ) ) - 0.5 ) * ( 1.0 - smoothstep( 0.35, 0.9, fwidth( hb / 5.0 ) ) );
  // the joint under each bed: a dark line
  float joint = 1.0 - smoothstep( 0.03, 0.09 + e, fr );
  // the ledges on the beds' tops, and the couloirs (233, the media lane's maps-227 review on Glacier: "a horizontal
  // stripe/dash pattern across every mountain slope reads as stretched texture", "white horizontal streaks and smears" —
  // a ledge on every bed, broken into dashes of one width along every bed's top, ruled the whole face in level white
  // dashes): the snow lies on the benches' ledges and two beds in five of the rest, in patches that swell and thin along
  // the strike, and down the fall line in couloirs, long narrow runs crossing the beds, as the faces over Mont-Cenis hold
  // it in April
  float bench = step( 0.82, hlHash( vec2( k, 11.9 ) ) );
  float snowBed = max( bench, step( 0.6, hlHash( vec2( k, 13.7 ) ) ) );
  float swell = smoothstep( 0.42, 0.75, 0.6 * hlNoise( q * 0.013 + vec2( k * 2.3, k * 4.1 ) ) + 0.4 * hlNoise( q * 0.06 + vec2( k * 5.3, k * 2.9 ) ) );
  float lw = ( 0.08 + 0.12 * hlHash( vec2( k, 3.71 ) ) + 0.12 * bench ) * ( 0.4 + 1.2 * swell );
  float top = smoothstep( 1.0 - lw - e, 1.0 - lw + e, fr ) * swell * snowBed;
  // (the couloir: a run ~18 m across and a few hundred long down the face, where the face is not sheer; under a pixel
  // that holds several, the faded share)
  float couloir = smoothstep( 0.62, 0.8, hlNoise( vec2( a / 18.0, hb / 260.0 + 5.1 ) ) ) * smoothstep( 0.3, 0.6, hlNoise( vec2( a / 60.0, hb / 90.0 ) ) )
    * ( 1.0 - smoothstep( 0.4, 0.9, fwidth( a / 18.0 ) ) ) * smoothstep( 0.05, 0.25, n.y );
  // (the steepest walls hold little)
  float hold = smoothstep( 0.12, 0.32, n.y );
  ledge = max( top * hold, couloir ) * uHlStrata.z * crisp;
  // the fall line's streaks (the water's varnish down the face): dark, here and there
  float streak = smoothstep( 0.5, 0.85, hlNoise( vec2( a / 10.0, hb / 120.0 ) ) ) * ( 1.0 - smoothstep( 0.3, 0.8, fwidth( a / 10.0 ) ) );
  // (a dark schist: two-thirds of the region's rock, each bed its own tone, its laminae and streaks)
  vec3 rockC = uHlRock.rgb * 0.65 * mix( 0.72, tone * ( 1.0 - 0.6 * joint ) * ( 1.0 + 0.6 * lam ), crisp ) * ( 1.0 - 0.45 * streak );
  vec3 snowC = vec3( 0.72, 0.79, 0.88 );
  return mix( mix( rockC, snowC, ( 1.0 - crisp ) * uHlStrata.z * hold * 0.14 ), snowC, ledge );
}
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
    // the steep faces: the strata over the atlas, by the face's own slope (computed in uniform control flow, so the
    // beds' footprint is well defined at the slope's edge)
    if ( uHlRock.w > 0.5 ) {
      vec3 hlNW = normalize( ( vec4( vNormal, 0.0 ) * viewMatrix ).xyz );
      // (and the atlas's bare rock at any slope — a rock texel's grey core by the bilinear albedo, not the scree's pale
      // grey or a rock-and-snow blend — so a summit's rock and the bands read as beds, not soft grey blotches)
      float hlLum = dot( hlAlb, vec3( 0.2126, 0.7152, 0.0722 ) );
      float hlSat = ( max( hlAlb.r, max( hlAlb.g, hlAlb.b ) ) - min( hlAlb.r, min( hlAlb.g, hlAlb.b ) ) ) / max( 1e-3, max( hlAlb.r, max( hlAlb.g, hlAlb.b ) ) );
      float hlRockCore = ( 1.0 - smoothstep( 0.1, 0.2, hlLum ) ) * ( 1.0 - smoothstep( 0.2, 0.35, hlSat ) ) * ( hlFlag( 4.0 ) ? 0.85 : 0.0 );
      float hlSteep = max( 1.0 - smoothstep( uHlStrata.y, uHlStrata.x, hlNW.y ), hlRockCore ) * ( hlFlag( 1.0 ) ? 0.0 : 1.0 );
      float hlL;
      vec3 hlSt = hlStrataAt( vHlWorld, hlNW, hlL );
      diffuseColor.rgb = mix( diffuseColor.rgb, hlSt, hlSteep );
      hlLedge = hlL * hlSteep;
    }
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
    float hlBumpW = ( 1.0 - smoothstep( 2.0, 9.0, hlFootN ) ) * ( hlFlag( 8.0 ) ? 1.0 : 0.6 ) * ( hlFlag( 1.0 ) ? 0.0 : 1.0 );
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
  return { uniforms, fragmentPars, albedo, roughness, normal };
}
