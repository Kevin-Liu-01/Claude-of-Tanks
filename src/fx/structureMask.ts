/**
 * structureMask.ts — buildings breaking and coming down in the world's own geometry (destruction-fx lane, 2026-10-07).
 *
 * The world merges every building's parts into shared bucket meshes (and BatchedMesh fine-detail cells); each vertex
 * of a structure part carries `aDamage` = structureIdx + 1 (a Uint16 attribute; 0, or the attribute absent, for
 * anything else — the core lane's seam, DESTRUCTION.md §16.4). This module keeps one state per structure in a small
 * float DataTexture and patches the bucket materials (handed over by world.patchStructureMaterials) and their shadow
 * depth materials, so every tagged vertex and fragment reads its structure's state:
 *
 *  - holes: up to four per structure, each the stage builder's cut (DESTRUCTION.md §16: a cylinder along the face's
 *    outward normal, from outsideM outside the face to depthM into the wall, world space here); a fragment of the
 *    structure inside one is discarded, with a blocky ragged edge (brick-sized cells of the wall break out between 0.8
 *    and 1.2 of the radius, under the builder's rim, which covers 0.75 to 1.25) — the broken rim in the wall's own
 *    courses and the dark room behind it come through the debris writers;
 *  - collapse (round 7, wave 277: "the building is never seen to come down... the dust rises afterwards instead of
 *    coming out of a falling structure"): from its start the roof drops into the building, sagging in its middle,
 *    and the walls come down from the top along a ragged crumble front the eye can follow (FRONT_T0 to FRONT_T0 +
 *    FRONT_T, gravity-eased) — the desktop tiers cut them above the front (the patch's one discard, beside the
 *    holes), the phone folds them onto it — while the stage builders throw the walls' own pieces off the front (they
 *    fall with weight and lie in the building's materials) and its dust bursts out of the base as they land; the roof
 *    rides the front down; at the end the vertices fold onto the pivot (the kit's stubs and pile are the building
 *    then); a settled collapse (a late joiner, a migration) is gone at once.
 *
 * Eleven texels per structure: A = (collapse start on the fx clock or 0, height m, blow dir x, blow dir z),
 * B = (base pivot x, y, z, hole count), then per hole C = (centre x, y, z, radius m) and N = (outward normal x, z,
 * depth m, outside m), and last F = (eave height over the base m, footprint half width, half depth, yaw) for the
 * fall. No per-frame CPU but the clock uniform: a stage or breach event writes texels and one upload
 * range. (The static shadow cache cannot see a shape the GPU changes: the presentation touches the structure's
 * casters through the world seam on every frame the mask moves it.)
 *
 * World space throughout: the vertex patch carries `transformed` to the world through the model, batching and
 * instance matrices, moves it there, and carries the displacement back (the world keeps every bucket and batch at
 * identity, so this is the identity there; it keeps the patch right for anything that is not). The world hands over
 * every bucket material once, its shadow depth materials included (role 'depth': the patch compiles on the depth
 * shader too, so a hole lets the sun through and the shadow sinks with the building).
 */
import * as THREE from 'three';

const TEX_W = 512;
/** Texels per structure: A, B, two per hole, and F (the fall's footprint). */
export const STRUCT_STRIDE = 11;
const STRIDE = STRUCT_STRIDE;
/** The fall's footprint texel (after the holes). */
const F_TEXEL = 10;
/** A breach outline's phase as a share of a turn (destructionKit holeOutlinePhase / 2π, from the hole's own seed: the
 *  BreachSpec's damageSeed(anatomy.seed, section, hole)); the kit's rim and the mask's cut share it. */
export function holeOutlinePhase01(seed: number): number {
  return (Math.imul(seed >>> 0, 0x9e3779b1) >>> 0) / 4294967296;
}
/** Holes a structure keeps (a ring: a fifth replaces the first). */
export const MAX_HOLES = 4;
/** Seconds a collapse takes from the blow to the fold (round 7: slow enough to watch it come down, ~3.5 s). */
export const COLLAPSE_S = 4.2;
/** The crumble front leaves the top at FRONT_T0 and reaches the base FRONT_T later, gravity-eased (h = H (1 - u^1.5)). */
export const FRONT_T0 = 0.3;
export const FRONT_T = 3.4;
/** Where the front stands (m over the base) `t` s into a collapse whose walls stand `heightM` (its eaves). */
export function collapseFront(t: number, heightM: number): number {
  const u = Math.min(1, Math.max(0, (t - FRONT_T0) / FRONT_T));
  return heightM * (1 - Math.pow(u, 1.5));
}
/** When the front passes `h` m over the base (the inverse of collapseFront; `heightM` the eaves). */
export function collapseWallHeight(heightM: number, eaveM: number | null | undefined): number {
  return eaveM && eaveM > 0 ? Math.min(eaveM, Math.max(0.5, heightM)) : 0.8 * Math.max(0.5, heightM);
}
export function collapseFrontTime(h: number, heightM: number): number {
  const k = Math.min(1, Math.max(0, 1 - h / Math.max(0.5, heightM)));
  return FRONT_T0 + FRONT_T * Math.pow(k, 1 / 1.5);
}
/**
 * A shaft topples (dcore 2026-10-09, wave 294b: "the stack telescopes straight down into the ground... it never actually
 * topples"): a stack, a water tower, a minaret or a tower breaks a metre or two over its foot and goes over whole, about
 * the leading edge of its foot, in the blow's direction — slow at first, then fast (a rod falling about its base,
 * θ(u) = 0.25 (cosh u - 1) + 0.05 u with u = ω (t - TOPPLE_T0), ω = √(1.5 g / L) for the length L over the hinge, ω no
 * less than TOPPLE_MIN_OMEGA so a tall one lands within the fall); it lies at TOPPLE_LIE rad and the kit's broken drums
 * take its place (structureStages lays them at the landing). The mask's F texel carries the hinge as -(1 + hinge m).
 */
const TOPPLE_T0 = 0.15;
const TOPPLE_U_LAND = 2.555;
const TOPPLE_MIN_OMEGA = 0.82;
const TOPPLE_LIE = 1.5;
/** A shaft's toppling, as the mask and the stages share it: when it lies on the ground (s after the blow). */
export function toppleLandS(heightM: number, hingeM: number): number {
  const omega = Math.max(TOPPLE_MIN_OMEGA, Math.sqrt(14.7 / Math.max(2, heightM - hingeM)));
  return TOPPLE_T0 + TOPPLE_U_LAND / omega;
}
/** Added to a structure's tag on a stage builder's own runs (they fall with the building; holes never cut them). */
export const STAGE_RUN_TAG = 32768;

const HASH = /* glsl */ `
vec3 fxStructHash3( vec3 c ) {
  return fract( sin( vec3( dot( c, vec3( 127.1, 311.7, 74.7 ) ), dot( c, vec3( 269.5, 183.3, 246.1 ) ),
    dot( c, vec3( 113.5, 271.9, 124.6 ) ) ) ) * 43758.5453 );
}
`;

// The vertex patch: every tier. The fall ends with the structure's vertices folded onto its pivot (zero-area
// triangles the rasteriser drops), not with a fragment discard: an opaque bucket that can discard loses its early
// depth (and a phone's hidden-surface removal) on every draw.
const vertPars = (holes: boolean): string => /* glsl */ `
attribute float aDamage;
uniform highp sampler2D uStructMask;
uniform float uStructClock;
${holes ? `varying vec3 vStructPos;
flat varying float vStructSid;
flat varying float vStructHoles;
flat varying float vStructFront;
varying float vStructRoof;` : ''}
${HASH}
`;

const vertBody = (holes: boolean): string => /* glsl */ `
${holes ? `vStructPos = vec3( 0.0 );
vStructSid = -1.0;
vStructHoles = 0.0;
vStructFront = 1e9;
vStructRoof = 0.0;` : ''}
{
  // aDamage = structure index + 1; with 32768 added, a stage builder's own run (a breach's rim and room): it falls with
  // its building but no hole cuts it
  float tag = floor( aDamage + 0.5 );
  bool stageRun = tag > 32767.5;
  int sid = int( stageRun ? tag - 32768.0 : tag ) - 1;
  if ( sid >= 0 ) {
    mat4 sw = modelMatrix;
    #ifdef USE_BATCHING
      sw = sw * batchingMatrix;
    #endif
    #ifdef USE_INSTANCING
      sw = sw * instanceMatrix;
    #endif
    vec3 wp = ( sw * vec4( transformed, 1.0 ) ).xyz;
    int base = sid * ${STRIDE};
    vec4 SA = texelFetch( uStructMask, ivec2( base % ${TEX_W}, base / ${TEX_W} ), 0 );
    vec4 SB = texelFetch( uStructMask, ivec2( ( base + 1 ) % ${TEX_W}, ( base + 1 ) / ${TEX_W} ), 0 );
    ${holes ? `vStructPos = wp;
    vStructSid = float( sid );
    vStructHoles = stageRun ? 0.0 : SB.w;` : ''}
    if ( SA.x > 0.0 ) {
      float t = uStructClock - SA.x;
      int fi = base + ${F_TEXEL};
      vec4 SF = texelFetch( uStructMask, ivec2( fi % ${TEX_W}, fi / ${TEX_W} ), 0 );
      // a shaft topples (F.x = -(1 + hinge)): it lies at its landing and the kit's drums take its place then
      bool topple = SF.x < 0.0;
      float hinge = -SF.x - 1.0;
      float omega = max( ${TOPPLE_MIN_OMEGA.toFixed(3)}, sqrt( 14.7 / max( 2.0, SA.y - hinge ) ) );
      // (wave 322: "the fallen shaft disappears") it lies a second and a half in its landing dust before the kit's drums,
      // laid at the landing beside it, are all that is left
      float toppleEnd = topple ? ${TOPPLE_T0.toFixed(3)} + ${TOPPLE_U_LAND.toFixed(3)} / omega + 1.5 : 1e9;
      if ( t >= ${COLLAPSE_S.toFixed(2)} || t >= toppleEnd ) {
        // down: every vertex onto the pivot (the stubs and the pile are the stage builder's own meshes)
        transformed = ( inverse( sw ) * vec4( SB.xyz, 1.0 ) ).xyz;
      } else if ( t > 0.0 && topple ) {
        // over about the leading edge of its foot, toward the blow (A.zw); the upper courses lag behind a little and
        // break, so the shaft bends as it goes; it settles onto the ground as it lands
        vec3 piv = SB.xyz;
        vec3 p = wp - piv;
        vec2 d = vec2( SA.z, SA.w );
        if ( dot( d, d ) < 0.25 ) d = vec2( 1.0, 0.0 );
        d = normalize( d );
        float q = p.y - hinge;
        if ( q > 0.0 ) {
          float e = max( SF.y, SF.z );
          float s0 = dot( p.xz, d ) - e;
          vec2 lat = p.xz - d * dot( p.xz, d );
          float u = omega * max( 0.0, t - ${TOPPLE_T0.toFixed(3)} );
          float th = min( ${TOPPLE_LIE.toFixed(2)}, 0.25 * ( cosh( u ) - 1.0 ) + 0.05 * u );
          float L = max( 2.0, SA.y - hinge );
          th = min( ${TOPPLE_LIE.toFixed(2)} + 0.06, th * ( 1.0 + 0.1 * smoothstep( 0.5 * L, L, q ) ) );
          float c = cos( th ), sn = sin( th );
          float s1 = s0 * c + q * sn;
          float q1 = q * c - s0 * sn;
          float sink = hinge * smoothstep( 0.55, 1.0, th / ${TOPPLE_LIE.toFixed(2)} );
          p = vec3( lat.x + d.x * ( s1 + e ), hinge + q1 - sink, lat.y + d.y * ( s1 + e ) );
          transformed += inverse( mat3( sw ) ) * ( piv + p - wp );
        }
      } else if ( t > 0.0 ) {
        float H = SA.y;
        vec3 piv = SB.xyz;
        vec3 p = wp - piv;
        float eave = SF.x > 0.0 ? SF.x : 0.8 * H;
        // the crumble front (m over the base): it leaves the eaves (the walls' top) at FRONT_T0, gravity-eased down to
        // the base; the roof drops onto it at once
        // (dcore 2026-10-09, wave 322: a rammed house's struck wall stood round the hull) the side the blow struck comes
        // down first: its front runs up to 1.8x as fast as the far side's
        float side = 0.0;
        {
          vec2 bd = vec2( SA.z, SA.w );
          float bl = length( bd );
          if ( bl > 0.5 ) side = clamp( dot( p.xz, -bd / bl ) / max( max( SF.y, SF.z ), 1.0 ), 0.0, 1.0 );
        }
        float u = clamp( ( t - ${FRONT_T0.toFixed(2)} * ( 1.0 - side ) ) / ${FRONT_T.toFixed(2)} * ( 1.0 + 0.8 * side ), 0.0, 1.0 );
        float front = eave * ( 1.0 - pow( u, 1.5 ) );
        float roof = step( eave - 0.05, p.y );
        if ( roof > 0.5 ) {
          // the roof drops into the building as the blow lands, its middle first (the farther from the eaves line, the
          // deeper it sags), and rests on what still stands: it rides the front down, its pitch flattening
          float ca = cos( SF.w ), sa = sin( SF.w );
          float bx = p.x * ca - p.z * sa, bz = p.x * sa + p.z * ca;
          float mid = 1.0 - clamp( max( abs( bx ) / max( SF.y, 0.5 ), abs( bz ) / max( SF.z, 0.5 ) ), 0.0, 1.0 );
          float tr = max( 0.0, t - 0.2 );
          float drop = 4.9 * tr * tr + 1.4 * mid * smoothstep( 0.0, 0.5, tr );
          // (dcore 2026-10-09, waves 294a/b: debris vanishing in view at the swap) as the front reaches the base the
          // roof's wreck settles into the heap rather than lying on it, so the fold takes nothing the eye still sees
          // (wave 322: "the roof skin vanishes" — flattened to a third of its pitch, a lid at the eaves the eye lost) it keeps
          // most of its pitch as it rides the front down, tilting toward the side that falls first
          // (wave 326: "the back-wall remnant disappears" — the gable and the roof stood a metre and more over the heap
          // until the fold took them) their pitch closes as the front comes down: at the base they lie on the heap
          p.y = max( p.y - drop, front + ( p.y - eave ) * 0.75 * ( 1.0 - u * u ) - 1.2 * u * u );
        }${holes ? '' : `
        else if ( p.y > front ) {
          // the phone tier cuts nothing: the wall above the front folds down onto it
          p.y = front;
        }`}
        ${holes ? `vStructFront = u > 0.0 ? piv.y + front : 1e9;
        vStructRoof = roof;` : ''}
        transformed += inverse( mat3( sw ) ) * ( piv + p - wp );
      }
    }
  }
}
`;

// The hole cut: the desktop tiers only (the one discard the patch adds; a phone shows the builder's rim and room on
// the standing wall instead of cutting it).
const FRAG_PARS = /* glsl */ `
uniform highp sampler2D uStructMask;
varying vec3 vStructPos;
flat varying float vStructSid;
flat varying float vStructHoles;
flat varying float vStructFront;
varying float vStructRoof;
${HASH}
`;
const FRAG_BODY = /* glsl */ `
// (dcore 2026-10-09, wave 322: "the roof skin vanishes" at a collapse's first frame) nothing is cut before the front
// leaves the eaves, and never a fragment of a triangle that reaches the roof (its eave band rides with it)
if ( vStructFront < 1e8 && vStructRoof < 0.02 ) {
  // the crumble front, ragged: columns of the wall ~2.4 m wide stand at different heights, and block-sized cells break
  // away above and below the line (the pieces the stage throws leave from here)
  float col = fxStructHash3( floor( vec3( vStructPos.x, 0.0, vStructPos.z ) * 0.42 ) ).x - 0.5;
  float cell = fxStructHash3( floor( vStructPos * 1.7 ) ).y - 0.5;
  if ( vStructPos.y > vStructFront + 1.1 * col + 0.45 * cell ) discard;
}
float fxCrack = 0.0;
if ( vStructHoles > 0.5 ) {
  int hb = int( vStructSid + 0.5 ) * ${STRIDE} + 2;
  // brick-sized cells of the wall break out at different radii: a blocky, ragged hole
  float rk = 0.85 + 0.3 * fxStructHash3( floor( vStructPos * 2.6 ) ).x;
  for ( int i = 0; i < ${MAX_HOLES}; i++ ) {
    if ( float( i ) >= vStructHoles ) break;
    int at = hb + i * 2;
    vec4 hc = texelFetch( uStructMask, ivec2( at % ${TEX_W}, at / ${TEX_W} ), 0 );
    vec4 hn = texelFetch( uStructMask, ivec2( ( at + 1 ) % ${TEX_W}, ( at + 1 ) / ${TEX_W} ), 0 );
    vec3 dd = vStructPos - hc.xyz;
    // the cut is a cylinder along the face's outward normal: from its outside distance outside the face to hn.z into the wall (the
    // texel's w packs the hole's outline phase over the outside distance: phase index + outside)
    float outside = fract( hn.w );
    float pk = floor( hn.w );
    float along = dot( dd.xz, hn.xy );
    if ( along < -hn.z || along > outside ) continue;
    vec3 lateral = dd - vec3( hn.x, 0.0, hn.y ) * along;
    // the outline the kit's rim follows (destructionKit holeOutlineK: 0.8 + 0.2 sin(3θ + φ) + 0.12 sin(5θ + 2φ), θ from
    // the face's u = (n.z, -n.x), φ the hole's own phase), its blocky cells on top
    // (2026-10-08) atan(0, 0) is undefined on the hole's own axis
    float thx = dot( lateral.xz, vec2( hn.y, -hn.x ) );
    float th = abs( lateral.y ) + abs( thx ) > 1e-6 ? atan( lateral.y, thx ) : 0.0;
    float ph = pk > 0.5 ? ( pk - 1.0 ) / 255.0 * 6.2832 : fxStructHash3( floor( hc.xyz * 3.1 ) ).y * 6.2832;
    float lobe = 0.8 + 0.2 * sin( 3.0 * th + ph ) + 0.12 * sin( 5.0 * th + 2.0 * ph );
    float rl = length( lateral );
    if ( rl < hc.w * rk * lobe ) discard;
    // cracks (the core asked them of the mask): thin dark runs 1-2 m along the face out of the three lobes' tips,
    // jagged, tapering, on the face only
    if ( along > -0.06 && hn.z > 0.15 ) {
      for ( int k = 0; k < 3; k++ ) {
        float tk = ( 1.5708 - ph + 6.2832 * float( k ) ) / 3.0;
        float r0 = hc.w * ( 1.0 + 0.12 * sin( 5.0 * tk + 2.0 * ph ) );
        float len = 1.0 + fract( sin( ( ph + float( k ) ) * 43.1 ) * 977.0 );
        float dr = rl - r0;
        if ( dr < -0.05 || dr > len ) continue;
        float dth = atan( sin( th - tk ), cos( th - tk ) );
        float off = rl * dth + 0.07 * sin( dr * 9.0 + ph * 3.0 ) + 0.035 * sin( dr * 23.0 + float( k ) );
        float w = mix( 0.035, 0.008, clamp( dr / len, 0.0, 1.0 ) );
        fxCrack = max( fxCrack, 1.0 - smoothstep( w * 0.5, w, abs( off ) ) );
      }
    }
  }
}
`;
// the cracks darken the face's own colour at the end of the surface program (a depth program has no colour: none there)
const FRAG_TAIL = /* glsl */ `
gl_FragColor.rgb *= 1.0 - 0.8 * clamp( fxCrack, 0.0, 1.0 );
#include <dithering_fragment>
`;

export interface StructureMask {
  readonly texture: THREE.DataTexture;
  /** The uniforms every patched material shares. */
  readonly uniforms: { uStructMask: { value: THREE.Texture }; uStructClock: { value: number } };
  /** A structure starts coming down at `startS` (fx clock); `settled`: it is gone already. `fall`: its eave height over
   *  the base (m: the roof above it drops and rides the front), footprint half width and depth, yaw (default: the
   *  eaves at 0.8 of the height, the roof's sag even). */
  collapse(structureId: number, startS: number, heightM: number, dirX: number, dirZ: number,
    pivotX: number, baseY: number, pivotZ: number, settled?: boolean,
    fall?: { eaveM: number; halfW: number; halfD: number; yaw: number; toppleHingeM?: number }, quickS?: number): void;
  /**
   * A hole through the structure: the builder's cut in the world (centre, radius m, the face's outward normal, depth m
   * into the wall, m outside it), in the next of its MAX_HOLES slots (a ring: a fifth hole replaces the first).
   * Returns the slot, or -1.
   */
  addHole(structureId: number, x: number, y: number, z: number, radiusM: number, nx: number, nz: number,
    depthM: number, outsideM?: number, phase01?: number): number;
  /** The holes a structure has cut so far (up to MAX_HOLES: a fifth replaces the first). */
  holes(structureId: number): number;
  /** A storey dropped (world y): the holes centred in its band [y0, y1] go with it, those above come down by `dropM`
   *  with the walls they were cut in. */
  moveHoles(structureId: number, y0: number, y1: number, dropM: number): void;
  /** The fx clock (patched shaders animate from it); while a building falls, its buckets' shadows follow. */
  setClock(seconds: number): void;
  /** Shift every collapse start with the fx clock's rebase. */
  shiftTime(delta: number): void;
  reset(): void;
  /** Patch one bucket material, surface or shadow depth (idempotent). */
  patch(material: THREE.Material): void;
  readonly capacity: number;
}

/** A float DataTexture of `capacity` structures (STRIDE texels each); `holes`: cut holes (the desktop tiers). */
export function createStructureMask(capacity = 4096, { holes = true }: { holes?: boolean } = {}): StructureMask {
  const VERT_PARS = vertPars(holes), VERT_BODY = vertBody(holes);
  const cacheKey = holes ? '|fx-structure-mask-holes' : '|fx-structure-mask';
  const texels = capacity * STRIDE;
  const rows = Math.max(1, Math.ceil(texels / TEX_W));
  const data = new Float32Array(TEX_W * rows * 4);
  const texture = new THREE.DataTexture(data, TEX_W, rows, THREE.RGBAFormat, THREE.FloatType);
  texture.name = 'fx-structure-mask';
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  const uniforms = { uStructMask: { value: texture as THREE.Texture }, uStructClock: { value: 0 } };
  const patched = new WeakSet<THREE.Material>();
  const holeCount = new Uint8Array(capacity);
  const holeNext = new Uint8Array(capacity);

  // A whole upload (the first, a reset, a clock rebase) must not be cut short by an event's range written before the
  // renderer gets to it: three uploads only the ranges when there are any. Round 4's strips caught it — a reset
  // between two Studio scenes, then a breach's range in the same frame, and the GPU kept the last scene's fallen
  // house folded away: in a battle, a cached world's next match would have lost every building the last one dropped.
  let wholePending = true;
  texture.onUpdate = () => { wholePending = false; };
  const whole = (): void => { wholePending = true; texture.clearUpdateRanges?.(); texture.needsUpdate = true; };
  const touch = (firstTexel: number, count: number): void => {
    if (!wholePending) texture.addUpdateRange(firstTexel * 4, count * 4);
    texture.needsUpdate = true;
  };
  const inRange = (id: number): boolean => Number.isInteger(id) && id >= 0 && id < capacity;

  function patch(material: THREE.Material): void {
    if (patched.has(material)) return;
    patched.add(material);
    const prior = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      prior?.call(material, shader, renderer);
      shader.uniforms.uStructMask = uniforms.uStructMask;
      shader.uniforms.uStructClock = uniforms.uStructClock;
      shader.vertexShader = injectAfter(shader.vertexShader, '#include <common>', VERT_PARS)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
      if (holes) {
        shader.fragmentShader = injectAfter(shader.fragmentShader, '#include <common>', FRAG_PARS)
          .replace(/void\s+main\s*\(\s*\)\s*\{/, (m) => `${m}\n${FRAG_BODY}`)
          .replace('#include <dithering_fragment>', FRAG_TAIL);
      }
    };
    const priorKey = material.customProgramCacheKey?.bind(material);
    material.customProgramCacheKey = () => `${priorKey ? priorKey() : ''}${cacheKey}`;
    material.needsUpdate = true;
  }

  return {
    texture,
    uniforms,
    capacity,
    collapse(id, startS, heightM, dirX, dirZ, pivotX, baseY, pivotZ, settled = false, fall, quickS) {
      if (!inRange(id)) return;
      const t = id * STRIDE, o = t * 4;
      const dl = Math.hypot(dirX, dirZ);
      // a start of 0 means "standing": a collapse always stamps a positive time (a settled one far in the past); a quick
      // fold (what stands after the P2 cascade) is a fall that began long enough ago to end in `quickS`
      const start = quickS !== undefined && quickS >= 0 ? startS - Math.max(0, COLLAPSE_S - quickS) : startS;
      data[o] = settled ? Math.max(1e-3, uniforms.uStructClock.value - COLLAPSE_S - 1) : Math.max(1e-3, start);
      data[o + 1] = Math.max(0.5, heightM);
      data[o + 2] = dl > 1e-6 ? dirX / dl : 0;
      data[o + 3] = dl > 1e-6 ? dirZ / dl : 0;
      data[o + 4] = pivotX; data[o + 5] = baseY; data[o + 6] = pivotZ;
      touch(t, 2);
      const f = (t + F_TEXEL) * 4;
      // a shaft's topple carries its hinge as -(1 + hinge m) (no roof rides a shaft's front: it goes over whole)
      data[f] = fall && fall.toppleHingeM !== undefined && fall.toppleHingeM >= 0 ? -(1 + fall.toppleHingeM)
        : fall && fall.eaveM > 0 ? Math.min(fall.eaveM, Math.max(0.5, heightM)) : 0;
      data[f + 1] = fall ? Math.max(0.5, fall.halfW) : 0;
      data[f + 2] = fall ? Math.max(0.5, fall.halfD) : 0;
      data[f + 3] = fall ? fall.yaw : 0;
      touch(t + F_TEXEL, 1);
    },
    addHole(id, x, y, z, radiusM, nx, nz, depthM, outsideM = 0.3, phase01) {
      if (!inRange(id) || !(radiusM > 0)) return -1;
      const s = holeNext[id];
      holeNext[id] = (s + 1) % MAX_HOLES;
      const t = id * STRIDE + 2 + s * 2, o = t * 4;
      const nl = Math.hypot(nx, nz);
      data[o] = x; data[o + 1] = y; data[o + 2] = z; data[o + 3] = radiusM;
      data[o + 4] = nl > 1e-6 ? nx / nl : 0; data[o + 5] = nl > 1e-6 ? nz / nl : 0;
      // w: the outline's phase index (1..256; 0: none, the shader hashes the hole's place) over the outside distance (< 1)
      const ph = phase01 !== undefined && Number.isFinite(phase01) ? Math.floor((((phase01 % 1) + 1) % 1) * 255) + 1 : 0;
      data[o + 6] = Math.max(0.05, depthM); data[o + 7] = ph + Math.min(0.999, Math.max(0, outsideM));
      touch(t, 2);
      const n = Math.max(holeCount[id], s + 1);
      if (n !== holeCount[id]) {
        holeCount[id] = n;
        data[(id * STRIDE + 1) * 4 + 3] = n;
        touch(id * STRIDE + 1, 1);
      }
      return s;
    },
    holes(id) {
      return inRange(id) ? holeCount[id] : 0;
    },
    moveHoles(id, y0, y1, dropM) {
      if (!inRange(id)) return;
      for (let k = 0; k < holeCount[id]; k++) {
        const t = id * STRIDE + 2 + k * 2, o = t * 4;
        if (!(data[o + 3] > 0)) continue;
        const y = data[o + 1];
        if (y >= y0 && y <= y1) data[o + 3] = 0;
        else if (y > y1 && dropM > 0) data[o + 1] = y - dropM;
        else continue;
        touch(t, 1);
      }
    },
    setClock(seconds) { uniforms.uStructClock.value = seconds; },
    shiftTime(delta) {
      let any = false;
      for (let id = 0; id < capacity; id++) {
        const o = id * STRIDE * 4;
        if (data[o] > 0) { data[o] = Math.max(1e-3, data[o] + delta); any = true; }
      }
      if (any) whole();
    },
    reset() {
      data.fill(0);
      holeCount.fill(0);
      holeNext.fill(0);
      whole();
    },
    patch,
  };
}

function injectAfter(source: string, marker: string, text: string): string {
  const at = source.indexOf(marker);
  if (at < 0) return `${text}\n${source}`;
  const end = at + marker.length;
  return `${source.slice(0, end)}\n${text}${source.slice(end)}`;
}
