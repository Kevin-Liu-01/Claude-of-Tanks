/**
 * craterMarks.ts — the ground a blast leaves behind (destruction-fx lane, 2026-10-07; crater-render-spec §D).
 *
 * Two kinds of mark in one draw:
 *
 *  - CRATERS: a deforming crater the core dug (terrain:crater). The ground lane moves the terrain into the bowl; this
 *    lays the crater's own surface over it — scorched, churned soil darkest in the bowl, broken soil on the rim, and the
 *    apron of thrown soil, torn turf and clods out to ~2.2 R (heavier where the core's rim stands higher) — draped on
 *    the deformed ground (base + the bound overlay, the same frame the mesh follows), with the edge ragged by the
 *    simulation's own wobble (craterWobblePhases: the decal's rim follows the bowl's). 160 slots, kept for the match
 *    (the simulation's own cap).
 *  - MARKS: a burst that dug nothing: an HE round's at its size (the same look), a shaped charge's scar (round 7,
 *    wave 276: a black star of soot out of a small pit, no bowl, no rim), HESH's shallow scorch, a kinetic gouge; flat
 *    on the ground, a seeded ragged outline. 96 slots, the oldest recycled first.
 *
 * The look is procedural in the shader (no texture): the pit darker and wetter than the rim, the rim's lip lit as a
 * slope (catching the sun on the side facing it), ejecta clumps and rays thinning outward, soot for explosives, and
 * the soil of the place: the surface kind under the burst and the map's ground climate (loam, sandy loam, sand, dark
 * soil through snow, black mud, grey chips on rock and road, ash).
 *
 * (orange-rings-230, 2026-10-21) The light is the ground's own: the mark is three's standard lit material registered
 * with the engine's cascades (lighting.ts setupShadowMaterial, receiver-only like the terrain it lies on), its shader
 * writing only the surface — the albedo, the coverage, the relief's normal over the draped ground's own and a heavy
 * shell's heat. It used to light itself: the sun's full colour with a 0.35 wrap and no shadow, and a hemisphere guess
 * for the sky. A mark in a building's shadow, under a low sun or under the moon drew several times brighter than the
 * ground round it — Steinburg's glowing orange rings on the cobbles by day, pale discs over the fields by night.
 *
 * No per-frame work but the clock: a stamp uploads its own slot.
 */
import * as THREE from 'three';
import type { SurfaceKind } from './surfaceLooks.ts';

const CRATER_SLOTS = 160;
const MARK_SLOTS = 96;
const SLOTS = CRATER_SLOTS + MARK_SLOTS;
const SEG = 28;
const RINGS = 6;
const VERTS = 1 + SEG * RINGS;
/** a centre fan plus (RINGS - 1) quad rings */
const INDICES_PER_SLOT = SEG * 3 + (RINGS - 1) * SEG * 6;
/** A disc reaches 2.4 rim radii (round 7: a crater's apron reaches ~2.2 R; the deformed ground fades by 2 R). */
const MARK_REACH = 2.4;
const CRATER_REACH = 2.4;
/** (ac130-fx-228 follow-up) a heavy shell's ground heat to a heat-imaging lens: its peak emission and time constant (s) */
export const CRATER_HEAT_PEAK = 5, CRATER_HEAT_S = 10;

/** What kind of mark a burst leaves (round 7, wave 276): a kinetic gouge, an HE round's crater or mark, a shaped
 *  charge's scar (no bowl: the core never digs one), HESH's shallow scorch (never dug either); (FX lane 10-15, FX-05) a
 *  heavy shell's rayed crater (the gunship's howitzer and missile: long dark rays of thrown soil out past the apron, a
 *  wider scorch) and a drone warhead's pocked scorch (a small black blast spot, a dense ring of fragment pocks, the
 *  battery's melted black patch beside it). */
type CraterMarkKind = 'gouge' | 'he' | 'scar' | 'hesh' | 'rayed' | 'drone';
const KIND_INDEX: Readonly<Record<CraterMarkKind, number>> = Object.freeze({ gouge: 0, he: 1, scar: 2, hesh: 3, rayed: 4, drone: 5 });
/** The mark a munition leaves (sim/destructionEvents.ts MunitionClass). */
export function markKindFor(munition: string, explosive: boolean): CraterMarkKind {
  if (!explosive) return 'gouge';
  if (munition === 'drone_fpv') return 'drone';
  if (munition === 'heat' || munition === 'atgm') return 'scar';
  if (munition === 'howitzer' || munition === 'missile') return 'rayed';
  return munition === 'hesh' ? 'hesh' : 'he';
}

/** Surface index the shader knows (2: snow — dark soil under white ejecta). */
const SURFACE_INDEX: Readonly<Record<SurfaceKind, number>> = Object.freeze({
  soil: 0, sand: 1, snow: 2, mud: 3, rock: 4, concrete: 4, water: 0, wood: 0, metal: 4,
});

/** The map's ground climate (world/groundRedux.ts), with the volcanic maps' ash and the Moon's regolith. */
export type CraterClimate = 'vegetated' | 'arid' | 'snow' | 'ash' | 'regolith';

/**
 * The turned soil of a place (linear rgb) and how fully the mark covers the ground: the surface under the burst, then
 * the climate (an arid map's soil is a sandy loam, an ash field black-grey).
 */
export function craterSoil(surface: SurfaceKind, climate: CraterClimate, out: [number, number, number, number]): [number, number, number, number] {
  const set = (r: number, g: number, b: number, cover: number) => { out[0] = r; out[1] = g; out[2] = b; out[3] = cover; return out; };
  if (climate === 'ash' && (surface === 'soil' || surface === 'rock' || surface === 'mud')) return set(0.032, 0.031, 0.033, 0.95);
  // (the Earthrise 228 rebuild, 2026-10-18; the blind critics: "the tan halos round the craters look like glowing sand
  // rings", "three crater rims glow tan like lit desert sand") the Moon's ground is regolith whatever it classifies as: the
  // sand's sandy tan, dried to 1.35 times under a wrapped light, glowed half again over the floor. The gardened grey a
  // shade lighter when dried (the fresher ejecta of a young crater), on a lighter cover
  if (climate === 'regolith') return set(0.084, 0.082, 0.079, 0.62);
  switch (surface) {
    case 'sand': return set(0.29, 0.23, 0.155, 0.8);
    case 'snow': return set(0.05, 0.039, 0.027, 0.92);
    case 'mud': return set(0.038, 0.031, 0.022, 0.97);
    case 'rock': case 'concrete': case 'metal': return set(0.12, 0.116, 0.11, 0.78);
    default: return climate === 'arid' ? set(0.12, 0.092, 0.062, 0.92) : set(0.068, 0.054, 0.038, 0.95);
  }
}

/** The vertex stage's additions to three's standard program: the slot's attributes, the draped ground's normal. */
const VERT_PARS = /* glsl */ `
attribute vec4 aInfo;   // birth, surface index, kind (0 gouge, 1 HE, 2 scar, 3 HESH), seed (0..1)
attribute vec4 aShape;  // wobble phases p1, p2, p3 (a crater) and its rim's share of the disc (0: a mark)
attribute vec4 aSoil;   // the turned soil (linear rgb), cover
attribute vec2 aDisc;   // disc coordinates (-1..1, scaled to the disc's reach)
attribute float aSize;  // the rim radius (m): the texture's metres
uniform float uTime;
varying vec2 vDisc;
varying vec4 vInfo;
varying vec4 vShape;
varying vec4 vSoil;
varying float vSize;
varying vec3 vGroundN;  // the draped ground's normal (world: the mesh never moves)
`;
const VERT_MAIN = /* glsl */ `
  vDisc = aDisc;
  vInfo = aInfo;
  vShape = aShape;
  vSoil = aSoil;
  vSize = aSize;
  vGroundN = normal;
`;
/** a slot born after the clock (a warm's or a rebased stamp) draws nothing */
const VERT_UNBORN = /* glsl */ `
  if ( uTime - aInfo.x < 0.0 ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
`;

/**
 * The fragment stage's additions: the mark's surface as a function three's lit program calls — its albedo (linear),
 * coverage, the relief's normal about the up axis, a glossy share and a heavy shell's heat to a heat-imaging lens. The
 * light is the program's own (the sun through the cascades, the sky, the clouds' shade, the fog).
 */
const FRAG_PARS = /* glsl */ `
uniform float uTime;
uniform float uHeatView;  // (ac130-fx-228 follow-up) 1 under a heat-imaging lens (infrared, thermal), else 0
varying vec2 vDisc;
varying vec4 vInfo;
varying vec4 vShape;
varying vec4 vSoil;
varying float vSize;
varying vec3 vGroundN;
float h21( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float vnoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( h21( i ), h21( i + vec2( 1.0, 0.0 ) ), f.x ), mix( h21( i + vec2( 0.0, 1.0 ) ), h21( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float fbm( vec2 p ) { return 0.55 * vnoise( p ) + 0.3 * vnoise( p * 2.13 + 7.1 ) + 0.15 * vnoise( p * 4.37 + 3.3 ); }
void cotCraterMark( out vec3 col, out float a, out vec3 n, out float gloss, out vec3 heat ) {
  float seed = vInfo.w;
  vec2 so = vec2( fract( seed * 7.13 ), fract( seed * 3.71 ) ) * 40.0;
  float r = length( vDisc );
  // (2026-10-08) atan(0, 0) is undefined (NaN on some drivers) at the disc's centre
  float ang = r > 1e-5 ? atan( vDisc.y, vDisc.x ) : 0.0;
  bool crater = vShape.w > 0.0;
  // the mark's kind: 0 a kinetic gouge, 1 an HE burst (a crater or its mark), 2 a shaped charge's scar, 3 HESH's mark,
  // 4 a heavy shell's rayed crater, 5 a drone warhead's pocked scorch
  float kind = vInfo.z;
  bool scar = kind > 1.5 && kind < 2.5;
  bool hesh = kind > 2.5 && kind < 3.5;
  bool rayed = kind > 3.5 && kind < 4.5;
  bool drone = kind > 4.5;
  float explosive = kind > 0.5 ? 1.0 : 0.0;
  float rimShare = crater ? vShape.w : ${(1 / MARK_REACH).toFixed(5)};
  float q = r / rimShare;
  // the rim's break round the crater (the core's craterProfile: its height x (1 + 0.45 (0.5 sin(2a+p2) + 0.3 sin(4a+p3)
  // + 0.2 sin(6a+p1)))): the apron is thrown farther and heavier where the rim stands higher; a mark's by noise
  float brk;
  if ( crater ) {
    float w = 1.0 + 0.08 * ( 0.5 * sin( 3.0 * ang + vShape.x ) + 0.3 * sin( 5.0 * ang + vShape.y ) + 0.2 * sin( 7.0 * ang + vShape.z ) );
    q /= w;
    brk = 1.0 + 0.45 * ( 0.5 * sin( 2.0 * ang + vShape.y ) + 0.3 * sin( 4.0 * ang + vShape.z ) + 0.2 * sin( 6.0 * ang + vShape.x ) );
  } else {
    q *= 1.0 + 0.32 * ( fbm( vec2( ang * 2.2, 0.0 ) + so ) - 0.5 );
    brk = 1.0 + 0.7 * ( fbm( vec2( ang * 1.7, 5.0 ) + so.yx ) - 0.5 );
  }
  // (wave 276: "concentric bullseye rings", "a stamped decal") no zone is a clean circle: the radius the zones read is
  // warped by noise; the disc's own edge is reached by nothing
  float qw = q * ( 1.0 + 0.3 * ( fbm( vDisc * 3.3 + so * 0.7 ) - 0.5 ) );
  vec2 wp = vDisc * ( vSize / rimShare );
  float fine = fbm( wp * 3.0 + so );
  float lumps = fbm( wp * 1.6 + so.yx );
  float rays = fbm( vec2( ang * 7.0, qw * 0.45 ) + so * 0.5 );
  float age = uTime - vInfo.x;
  float fresh = 1.0 - smoothstep( 20.0, 300.0, age );
  vec3 soil = vSoil.rgb;
  int surf = int( vInfo.y + 0.5 );
  n = vec3( 0.0, 1.0, 0.0 );
  gloss = 0.0;
  if ( drone ) {
    // (FX-05) a drone warhead's pocked scorch: a small black blast spot, a dense ring of the fragment sleeve's pocks round
    // it, and the battery's melted cells, a glossy black patch beside the spot; no star, no bowl
    float spot = 1.0 - smoothstep( 0.1, 0.34 + 0.08 * lumps, qw );
    float halo = ( 1.0 - smoothstep( 0.25, 0.85 + 0.2 * lumps, qw ) ) * 0.4;
    vec2 cp = wp * 6.5 + so;
    vec2 ci = floor( cp ), cf = fract( cp ) - 0.5;
    vec2 co = vec2( h21( ci + 2.3 ), h21( ci + 6.1 ) ) - 0.5;
    float pockF = step( 0.5, h21( ci + 13.7 ) ) * smoothstep( 0.3, 0.5, q ) * ( 1.0 - smoothstep( 1.3, 2.0, q ) );
    float pockD = pockF * ( 1.0 - smoothstep( 0.07, 0.14, length( cf - co * 0.5 ) ) );
    vec2 melt0 = vec2( cos( seed * 6.2832 ), sin( seed * 6.2832 ) ) * 0.42;
    float melt = 1.0 - smoothstep( 0.1, 0.2 + 0.06 * fine, length( ( vDisc / rimShare - melt0 ) * vec2( 1.0, 1.35 ) ) );
    float soot = clamp( spot * 0.95 + halo, 0.0, 1.0 ) * ( 0.45 + 0.55 * fresh );
    col = mix( soil * ( 0.9 + 0.3 * fine ), vec3( 0.016, 0.014, 0.012 ), soot );
    col = mix( col, soil * 0.22, pockD * 0.95 );
    col = mix( col, vec3( 0.008, 0.008, 0.009 ), melt );
    if ( surf == 2 ) col = mix( col, vec3( 0.42, 0.43, 0.45 ), ( 1.0 - max( soot, max( pockD, melt ) ) ) * 0.5 );
    a = max( max( soot * 0.95, pockD * 0.85 ), melt * 0.95 );
    // the melted cells catch the sun: a glossy patch
    n = normalize( vec3( 0.0, 1.0, 0.0 ) + vec3( fine - 0.5, 0.0, lumps - 0.5 ) * 0.4 * melt );
    gloss = melt;
  } else if ( scar ) {
    // a shaped charge's scar (wave 276: it left a bowl): a small black pit, a star of soot thrown out of it in streaks of
    // different lengths, a scorched halo, a thin scatter of fine soil; no bowl, no rim
    float star = fbm( vec2( ang * 9.0, 1.3 ) + so );
    float streak = ( 1.0 - smoothstep( 0.25, 0.7 + 1.1 * star, qw ) ) * smoothstep( 0.42, 0.62, star );
    float heart = 1.0 - smoothstep( 0.12, 0.38, qw );
    float halo = 1.0 - smoothstep( 0.3, 1.0 + 0.3 * lumps, qw );
    float spray = ( 1.0 - smoothstep( 0.6, min( 2.1, 1.7 * brk ), q ) ) * smoothstep( 0.55, 0.75, lumps * 0.6 + fine * 0.6 );
    float soot = clamp( heart * 0.95 + streak * 0.8 + halo * 0.35, 0.0, 1.0 ) * ( 0.45 + 0.55 * fresh );
    col = mix( soil * ( 0.9 + 0.3 * fine ), vec3( 0.014, 0.012, 0.011 ), soot );
    if ( surf == 2 ) col = mix( col, vec3( 0.42, 0.43, 0.45 ), ( 1.0 - soot ) * 0.5 );
    a = max( soot * 0.95, spray * 0.7 );
  } else {
    // a crater, or an HE round's mark: the pit's moist dark soil, the inner wall and the crest broken soil lit as slopes,
    // and the apron: the soil thrown out in rays and lumps over the ground to ~2.2 R (farther and heavier where the rim
    // stands higher), torn turf on it, clods punched in, a scorch halo round the pit for an explosive, all drying with
    // age (wave 276: "no apron of thrown dark soil, clods or torn turf", "no scorch")
    float pit = 1.0 - smoothstep( 0.45, 0.85, qw );
    float wall = smoothstep( 0.4, 0.85, qw ) * ( 1.0 - smoothstep( 0.85, 1.1, qw ) );
    float crest = smoothstep( 0.85, 1.0, qw ) * ( 1.0 - smoothstep( 1.0, 1.3, qw ) );
    float apronQ = min( 2.25, ( hesh ? 1.7 : 2.2 ) * ( 0.75 + 0.3 * brk ) );
    float apronT = 1.0 - smoothstep( 1.0, apronQ, q );
    float apron = apronT * smoothstep( 0.32, 0.62, rays * 0.65 + lumps * 0.55 + apronT * 0.3 - 0.15 ) * clamp( brk, 0.6, 1.4 );
    vec2 out2 = r > 1e-4 ? vDisc / r : vec2( 0.0 );
    vec3 nWall = normalize( vec3( -out2.x * 0.9, 1.0, -out2.y * 0.9 ) );
    vec3 nFlank = normalize( vec3( out2.x * 0.6, 1.0, out2.y * 0.6 ) );
    n = normalize( mix( vec3( 0.0, 1.0, 0.0 ), wall > crest ? nWall : nFlank, clamp( wall + crest, 0.0, 1.0 ) * ( crater ? 1.0 : 0.5 ) ) );
    // thrown soil: moist and dark when fresh, drying lighter (a late joiner's craters are old)
    vec3 wet = soil * ( 0.85 + 0.3 * fine ), dry = soil * 1.35 + vec3( 0.012, 0.01, 0.006 );
    vec3 thrown = mix( dry, wet, 0.35 + 0.65 * fresh );
    vec3 pitC = soil * ( 0.55 + 0.2 * fine );
    vec3 rimC = thrown * ( 0.95 + 0.25 * lumps );
    if ( surf == 2 ) {
      // snow: dark soil in the pit and on the rim; on the apron soil sprayed over dirty snow lumps (no pale ring)
      vec3 dirty = vec3( 0.46, 0.47, 0.49 );
      thrown = mix( dirty, soil * 1.4, clamp( 0.3 + 0.6 * smoothstep( 0.42, 0.7, rays ) + 0.3 * smoothstep( 0.55, 0.8, lumps ), 0.0, 1.0 ) );
      rimC = mix( soil, dirty, 0.15 );
    }
    col = mix( thrown, rimC, clamp( crest + wall * 0.6, 0.0, 1.0 ) );
    col = mix( col, pitC, pit );
    // torn turf on a vegetated ground's apron: sod thrown upside down (soil, roots, a little grass)
    if ( surf == 0 && explosive > 0.5 ) {
      vec2 tc = wp / 0.65 + so;
      vec2 ti = floor( tc ), tf = fract( tc ) - 0.5;
      float th = h21( ti + 5.3 );
      vec2 toff = vec2( h21( ti + 1.7 ), h21( ti + 9.2 ) ) - 0.5;
      float td = length( ( tf - toff * 0.4 ) * vec2( 1.0, 1.6 ) );
      float turf = step( 0.74, th ) * ( 1.0 - smoothstep( 0.18, 0.3, td ) ) * smoothstep( 1.05, 1.25, qw ) * ( 1.0 - smoothstep( 1.6, 2.0, q ) );
      col = mix( col, mix( soil * 1.2, vec3( 0.045, 0.06, 0.022 ), 0.45 + 0.3 * fine ), turf );
      apron = max( apron, turf * 0.95 );
    }
    // clods punched into the apron: dark dots
    vec2 cellP = wp * 1.4 + so;
    vec2 cellI = floor( cellP ), cellF = fract( cellP ) - 0.5;
    float cellH = h21( cellI + 3.7 );
    vec2 off = vec2( h21( cellI + 11.1 ), h21( cellI + 23.9 ) ) - 0.5;
    float pock = apronT * step( 0.8, cellH ) * ( 1.0 - smoothstep( 0.08, 0.16, length( cellF - off * 0.5 ) ) );
    col = mix( col, soil * 0.45, pock * 0.8 );
    // the scorch: the blast's black heart and a halo of soot streaked out over the rim, weathering
    float halo = ( 1.0 - smoothstep( 0.75, 1.45 + 0.25 * lumps, qw ) ) * smoothstep( 0.35, 0.62, fbm( vec2( ang * 5.0, 2.7 ) + so ) );
    float soot = explosive * ( ( 1.0 - smoothstep( 0.0, 0.6, qw ) ) * 0.7 + halo * ( hesh ? 0.75 : 0.55 ) )
      * ( 0.75 + 0.25 * fine ) * ( 0.35 + 0.65 * fresh );
    col = mix( col, vec3( 0.016, 0.014, 0.012 ), clamp( soot, 0.0, 0.85 ) );
    // (FX-05) a heavy shell's rays: the soil it threw out low in streaks, long and dark out past the apron to the disc's
    // edge, thinning and breaking up as they go, and a wider scorch over the rim
    float rayK = 0.0;
    if ( rayed ) {
      float band = smoothstep( 0.64, 0.76, fbm( vec2( ang * 11.0, 0.7 ) + so ) );
      float reach = 1.7 + 0.65 * fbm( vec2( ang * 3.1, 4.4 ) + so.yx );
      rayK = band * smoothstep( 0.75, 1.05, q ) * ( 1.0 - smoothstep( reach * 0.75, reach, q ) ) * ( 0.6 + 0.4 * smoothstep( 0.35, 0.6, fine ) );
      col = mix( col, mix( thrown * 0.55, pitC, 0.5 ), rayK );
      float wide = ( 1.0 - smoothstep( 1.0, 1.7 + 0.3 * lumps, qw ) ) * smoothstep( 0.4, 0.6, fbm( vec2( ang * 4.0, 9.1 ) + so ) );
      col = mix( col, vec3( 0.02, 0.018, 0.016 ), wide * 0.45 * ( 0.35 + 0.65 * fresh ) );
      soot = max( soot, wide * 0.45 );
    }
    // (fx 9c, the owner: "hit marks all look better") an explosive's fragment field: fine pits peppered over the apron and
    // past it where the casing's fragments struck the ground — on rock and road pale pulverized chips round each pit
    vec2 fp = wp * 4.2 + so * 1.3;
    vec2 fi = floor( fp ), ff = fract( fp ) - 0.5;
    vec2 fo = vec2( h21( fi + 4.1 ), h21( fi + 8.8 ) ) - 0.5;
    float fd = length( ff - fo * 0.6 );
    float fragF = explosive * step( 0.84, h21( fi + 17.3 ) ) * smoothstep( 0.85, 1.25, qw ) * ( 1.0 - smoothstep( 1.85, 2.35, q ) );
    float frag = fragF * ( 1.0 - smoothstep( 0.05, 0.11, fd ) );
    float chip = surf == 4 ? fragF * smoothstep( 0.09, 0.13, fd ) * ( 1.0 - smoothstep( 0.13, 0.2, fd ) ) : 0.0;
    col = mix( col, soil * 0.32, frag * 0.85 );
    col = mix( col, soil * 2.2 + vec3( 0.04 ), chip * 0.6 );
    a = max( max( pit, wall ), crest * 0.97 );
    a = max( a, apron * ( 0.92 - 0.25 * ( 1.0 - fresh ) ) );
    a = max( a, max( pock, soot ) * 0.9 );
    a = max( a, max( frag * 0.85, chip * 0.55 ) );
    a = max( a, rayK * 0.9 );
    // a faint stain over the whole apron ties its lumps together (broken by the grain: no clean edge)
    a = max( a, apronT * 0.3 * smoothstep( 0.25, 0.6, fine ) );
  }
  a *= vSoil.a * smoothstep( 0.0, 0.35, age );  // the ejecta lands over the first third of a second
  if ( a < 0.01 ) discard;
  // (2026-10-08, the owner's black screens) finite colour only
  if ( !( abs( col.r ) < 6.0e4 && abs( col.g ) < 6.0e4 && abs( col.b ) < 6.0e4 && abs( a ) < 6.0e4 ) ) discard;
  // (ac130-fx-228 follow-up, the coordinator: "a 152 mm impact keeps a hot ground signature that fades over 10-20 s")
  // a heavy shell's scorched pit and its halo stay hot to a heat-imaging lens (the grade images luminance over ~1.55):
  // CRATER_HEAT_PEAK at the burst, falling as exp(-age / CRATER_HEAT_S); white-hot ~5 s, warm to ~12 s. Never evaluated
  // under any other lens. An emission: no light of the scene reaches it.
  heat = vec3( 0.0 );
  if ( uHeatView > 0.5 && kind > 3.5 && kind < 4.5 ) {
    heat = vec3( ${CRATER_HEAT_PEAK.toFixed(2)} ) * exp( -age / ${CRATER_HEAT_S.toFixed(2)} ) * ( 1.0 - smoothstep( 0.2, 0.9, qw ) );
  }
}
`;
/** the surface, where three's program has laid its own albedo */
const FRAG_SURFACE = /* glsl */ `
  vec3 cotMarkCol, cotMarkN, cotMarkHeat;
  float cotMarkA, cotMarkGloss;
  cotCraterMark( cotMarkCol, cotMarkA, cotMarkN, cotMarkGloss, cotMarkHeat );
  diffuseColor = vec4( cotMarkCol, cotMarkA );
`;
const FRAG_ROUGHNESS = /* glsl */ `
  roughnessFactor = mix( roughnessFactor, 0.4, cotMarkGloss );
`;
/** the relief's slopes tilt the draped ground's own normal (the ground's slope and a dug bowl's walls come with it) */
const FRAG_NORMAL = /* glsl */ `
  vec3 cotMarkNW = normalize( normalize( vGroundN ) + cotMarkN - vec3( 0.0, 1.0, 0.0 ) );
  normal = normalize( ( viewMatrix * vec4( cotMarkNW, 0.0 ) ).xyz );
`;
const FRAG_HEAT = /* glsl */ `
  totalEmissiveRadiance += cotMarkHeat;
`;

/** Insert `add` after (or, for `void main() {`, before) each anchor of three's program; a missing anchor throws. */
function patchProgram(source: string, edits: ReadonlyArray<readonly [string, string, 'before' | 'after']>): string {
  for (const [anchor, add, where] of edits) {
    if (source.split(anchor).length !== 2) throw new Error(`craterMarks: three's program has no single ${anchor}`);
    source = source.replace(anchor, where === 'before' ? `${add}\n${anchor}` : `${anchor}\n${add}`);
  }
  return source;
}
/** The hook that makes three's standard program the mark's. */
function craterMarksCompileHook(uniforms: { uTime: { value: number }; uHeatView: { value: number } }) {
  return (shader: { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string }): void => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uHeatView = uniforms.uHeatView;
    shader.vertexShader = patchProgram(shader.vertexShader, [
      ['void main() {', VERT_PARS, 'before'],
      ['#include <begin_vertex>', VERT_MAIN, 'after'],
      ['#include <project_vertex>', VERT_UNBORN, 'after'],
    ]);
    shader.fragmentShader = patchProgram(shader.fragmentShader, [
      ['void main() {', FRAG_PARS, 'before'],
      ['#include <map_fragment>', FRAG_SURFACE, 'after'],
      ['#include <roughnessmap_fragment>', FRAG_ROUGHNESS, 'after'],
      ['#include <normal_fragment_maps>', FRAG_NORMAL, 'after'],
      ['#include <emissivemap_fragment>', FRAG_HEAT, 'after'],
    ]);
  };
}

/** A deforming crater's surface (crater-render-spec §D). */
interface CraterSurfaceInput {
  x: number; z: number;
  radiusM: number;
  /** the simulation's wobble phases (sim/terrainDeformation.ts craterWobblePhases) */
  p1: number; p2: number; p3: number;
  surface: SurfaceKind;
  climate: CraterClimate;
  explosive: boolean;
  /** the mark's kind (default: HE when explosive, else a gouge) */
  kind?: CraterMarkKind;
  /** 0..1 (the event's 16-bit seed / 65536) */
  seed: number;
  /** its birth on the fx clock (a settled crater: long past) */
  birth: number;
}

/** The engine's cascade registration for a lit material and its shader hook (lighting.ts setupShadowMaterial). */
type LitMaterialSetup = (material: THREE.Material, hook: NonNullable<THREE.Material['onBeforeCompile']>) => unknown;

interface CraterMarksOptions {
  /** (orange-rings-230) the marks take the ground's own light: without it (a Node receipt) the hook alone compiles */
  setupMaterial?: LitMaterialSetup;
}

export interface CraterMarks {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  /** A deforming crater's surface, draped on `heightAt` (the deformed ground) over its 1.6 R reach. */
  crater(c: CraterSurfaceInput, heightAt: (x: number, z: number) => number): void;
  /** A burst that dug nothing: rim radius (m), the surface and climate, its kind (true: HE, false: a gouge), a seed
   *  0..1, its birth. */
  stamp(x: number, z: number, rimRadiusM: number, surface: SurfaceKind, kind: CraterMarkKind | boolean, seed: number, birth: number,
    groundY: (x: number, z: number) => number, climate?: CraterClimate): void;
  update(now: number): void;
  /** (ac130-fx-228 follow-up) this frame's camera images heat: a heavy shell's ground stays hot to it */
  setHeatView(on: boolean): void;
  shiftTime(delta: number): void;
  reset(): void;
  /** receipts: slots in use (craters + marks), craters alone */
  readonly count: number;
  readonly craters: number;
}

export function createCraterMarks(options: CraterMarksOptions = {}): CraterMarks {
  const template = new Float32Array(VERTS * 2);
  for (let ri = 1; ri <= RINGS; ri++) {
    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      const rad = ri / RINGS;
      const v = 1 + (ri - 1) * SEG + s;
      template[v * 2] = Math.cos(a) * rad;
      template[v * 2 + 1] = Math.sin(a) * rad;
    }
  }
  const positions = new Float32Array(SLOTS * VERTS * 3);
  const disc = new Float32Array(SLOTS * VERTS * 2);
  const info = new Float32Array(SLOTS * VERTS * 4).fill(-1e9);
  const shapes = new Float32Array(SLOTS * VERTS * 4);
  const soils = new Float32Array(SLOTS * VERTS * 4);
  const sizes = new Float32Array(SLOTS * VERTS);
  // the draped ground's normal per vertex (the lit program's own attribute): up until a stamp drapes its slot
  const normals = new Float32Array(SLOTS * VERTS * 3);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  const index: number[] = [];
  for (let c = 0; c < SLOTS; c++) {
    const base = c * VERTS;
    for (let v = 0; v < VERTS; v++) { disc[(base + v) * 2] = template[v * 2]; disc[(base + v) * 2 + 1] = template[v * 2 + 1]; }
    for (let s = 0; s < SEG; s++) index.push(base, base + 1 + (s + 1) % SEG, base + 1 + s);
    for (let ri = 1; ri < RINGS; ri++) {
      const a0 = base + 1 + (ri - 1) * SEG, b0 = base + 1 + ri * SEG;
      for (let s = 0; s < SEG; s++) {
        const s1 = (s + 1) % SEG;
        index.push(a0 + s, b0 + s1, b0 + s, a0 + s, a0 + s1, b0 + s1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(positions, 3);
  pos.setUsage(THREE.DynamicDrawUsage);
  const inf = new THREE.BufferAttribute(info, 4);
  inf.setUsage(THREE.DynamicDrawUsage);
  const shp = new THREE.BufferAttribute(shapes, 4);
  shp.setUsage(THREE.DynamicDrawUsage);
  const sol = new THREE.BufferAttribute(soils, 4);
  sol.setUsage(THREE.DynamicDrawUsage);
  const siz = new THREE.BufferAttribute(sizes, 1);
  siz.setUsage(THREE.DynamicDrawUsage);
  const nor = new THREE.BufferAttribute(normals, 3);
  nor.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pos);
  geo.setAttribute('normal', nor);
  geo.setAttribute('aDisc', new THREE.BufferAttribute(disc, 2));
  geo.setAttribute('aInfo', inf);
  geo.setAttribute('aShape', shp);
  geo.setAttribute('aSoil', sol);
  geo.setAttribute('aSize', siz);
  geo.setIndex(index);
  geo.setDrawRange(0, 0);
  const uTime = { value: 0 };
  const uHeatView = { value: 0 };
  // (orange-rings-230) three's standard lit material: the shader writes the surface (craterMarksCompileHook), the
  // program lights it as it lights the ground — the sun through the cascades, the sky, the clouds' shade, the fog
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.96,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    side: THREE.DoubleSide,
  });
  material.name = 'fx-crater-marks';
  // never in a depth map, lying on the receiver-only terrain: its shadows meet the ground's (RECEIVER_ONLY_SHADOW_NOTE)
  material.userData.cotShadowReceiverOnly = true;
  material.userData.uniforms = { uTime, uHeatView };
  const hook = craterMarksCompileHook({ uTime, uHeatView });
  material.onBeforeCompile = hook;
  material.customProgramCacheKey = () => 'fx-crater-marks-lit-v1';
  options.setupMaterial?.(material, hook);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'fx-crater-marks';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = 2.5; // after the terrain and the wreck scorch, before every particle
  mesh.receiveShadow = true; // the cascades' shadow on the mark, as on the ground under it
  mesh.castShadow = false;
  mesh.visible = false;   // out of the render list until the first mark
  // a whole upload (the first, a reset, a clock rebase) is never cut short by a stamp's range written before the
  // renderer gets to it (three uploads only the ranges when there are any): a reset's cleared slots would otherwise
  // keep the last match's craters on the GPU in the fixed crater region
  const attrs = [pos, inf, shp, sol, siz, nor];
  let wholePending = true;
  pos.onUpload(() => { wholePending = false; });
  const whole = (): void => { wholePending = true; for (const a of attrs) { a.clearUpdateRanges(); a.needsUpdate = true; } };
  let craterCursor = 0, craterCount = 0;
  let markCursor = 0, markCount = 0;
  let highest = -1;
  const soil: [number, number, number, number] = [0, 0, 0, 0];

  /** The draped slot's normals from its own grid (no more ground reads): the tangent along its ring and the radial run
   *  across the rings either side; the centre's, its first ring's mean. */
  function drapeNormals(base: number): void {
    let cx = 0, cy = 0, cz = 0;
    for (let ri = 1; ri <= RINGS; ri++) {
      const ring = base + 1 + (ri - 1) * SEG;
      for (let s = 0; s < SEG; s++) {
        const v = ring + s;
        const t1 = (ring + (s + 1) % SEG) * 3, t0 = (ring + (s + SEG - 1) % SEG) * 3;
        const r0 = (ri === 1 ? base : ring - SEG + s) * 3, r1 = (ri === RINGS ? v : ring + SEG + s) * 3;
        const tx = positions[t1] - positions[t0], ty = positions[t1 + 1] - positions[t0 + 1], tz = positions[t1 + 2] - positions[t0 + 2];
        const rx = positions[r1] - positions[r0], ry = positions[r1 + 1] - positions[r0 + 1], rz = positions[r1 + 2] - positions[r0 + 2];
        // t x r points up on a level ring (the template turns counter-clockwise seen from above)
        let nx = ty * rz - tz * ry, ny = tz * rx - tx * rz, nz = tx * ry - ty * rx;
        const len = Math.hypot(nx, ny, nz);
        if (len > 1e-9 && ny > 0) { nx /= len; ny /= len; nz /= len; } else { nx = 0; ny = 1; nz = 0; }
        normals[v * 3] = nx; normals[v * 3 + 1] = ny; normals[v * 3 + 2] = nz;
        if (ri === 1) { cx += nx; cy += ny; cz += nz; }
      }
    }
    const len = Math.hypot(cx, cy, cz);
    normals[base * 3] = len > 1e-9 ? cx / len : 0;
    normals[base * 3 + 1] = len > 1e-9 ? cy / len : 1;
    normals[base * 3 + 2] = len > 1e-9 ? cz / len : 0;
  }

  function write(slot: number, x: number, z: number, radius: number, yaw: number, heightAt: (x: number, z: number) => number,
    lift: number, birth: number, surfaceIndex: number, kind: number, seed: number,
    p1: number, p2: number, p3: number, rimShare: number, rimM: number): void {
    const base = slot * VERTS;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (let v = 0; v < VERTS; v++) {
      const lx = template[v * 2], lz = template[v * 2 + 1];
      const wx = x + (lx * cy - lz * sy) * radius;
      const wz = z + (lx * sy + lz * cy) * radius;
      const o = (base + v) * 3;
      positions[o] = wx; positions[o + 1] = heightAt(wx, wz) + lift; positions[o + 2] = wz;
      const q = (base + v) * 4;
      info[q] = birth; info[q + 1] = surfaceIndex; info[q + 2] = kind; info[q + 3] = seed;
      shapes[q] = p1; shapes[q + 1] = p2; shapes[q + 2] = p3; shapes[q + 3] = rimShare;
      soils[q] = soil[0]; soils[q + 1] = soil[1]; soils[q + 2] = soil[2]; soils[q + 3] = soil[3];
      sizes[base + v] = rimM;
    }
    drapeNormals(base);
    if (!wholePending) {
      pos.addUpdateRange(base * 3, VERTS * 3);
      inf.addUpdateRange(base * 4, VERTS * 4);
      shp.addUpdateRange(base * 4, VERTS * 4);
      sol.addUpdateRange(base * 4, VERTS * 4);
      siz.addUpdateRange(base, VERTS);
      nor.addUpdateRange(base * 3, VERTS * 3);
    }
    pos.needsUpdate = inf.needsUpdate = shp.needsUpdate = sol.needsUpdate = siz.needsUpdate = nor.needsUpdate = true;
    if (slot > highest) highest = slot;
    geo.setDrawRange(0, (highest + 1) * INDICES_PER_SLOT);
    mesh.visible = true;
  }

  return {
    mesh,
    crater(c, heightAt) {
      const slot = craterCursor;
      craterCursor = (craterCursor + 1) % CRATER_SLOTS;
      craterCount = Math.min(CRATER_SLOTS, craterCount + 1);
      craterSoil(c.surface, c.climate, soil);
      // world-aligned (no yaw): the shader's angle is the simulation's atan2(dz, dx)
      const kind = c.kind ?? (c.explosive ? 'he' : 'gouge');
      write(slot, c.x, c.z, c.radiusM * CRATER_REACH, 0, heightAt, 0.05, c.birth, SURFACE_INDEX[c.surface], KIND_INDEX[kind], c.seed,
        c.p1, c.p2, c.p3, 1 / CRATER_REACH, c.radiusM);
    },
    stamp(x, z, rimRadiusM, surface, kind, seed, birth, groundY, climate = 'vegetated') {
      const slot = CRATER_SLOTS + markCursor;
      markCursor = (markCursor + 1) % MARK_SLOTS;
      markCount = Math.min(MARK_SLOTS, markCount + 1);
      craterSoil(surface, climate, soil);
      const k: CraterMarkKind = kind === true ? 'he' : kind === false ? 'gouge' : kind;
      write(slot, x, z, rimRadiusM * MARK_REACH, seed * Math.PI * 2, groundY, 0.04, birth, SURFACE_INDEX[surface], KIND_INDEX[k], seed,
        0, 0, 0, 0, rimRadiusM);
    },
    setHeatView(on) { uHeatView.value = on ? 1 : 0; },
    update(now) {
      uTime.value = now;
    },
    shiftTime(delta) {
      for (let i = 0; i < info.length; i += 4) if (info[i] > -1e8) info[i] += delta;
      whole();
    },
    reset() {
      info.fill(-1e9);
      positions.fill(0);
      whole();
      craterCursor = craterCount = markCursor = markCount = 0;
      highest = -1;
      geo.setDrawRange(0, 0);
      mesh.visible = false;
    },
    get count() { return craterCount + markCount; },
    get craters() { return craterCount; },
  };
}
