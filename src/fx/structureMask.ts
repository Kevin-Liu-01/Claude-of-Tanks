/**
 * structureMask.ts — buildings breaking and coming down in the world's own geometry (destruction-fx lane, 2026-10-07).
 *
 * The world merges every building's parts into shared bucket meshes (and BatchedMesh fine-detail cells); each vertex
 * of a structure part carries `aDamage` = structureIdx + 1 (a Uint16 attribute; 0, or the attribute absent, for
 * anything else — the core lane's seam, DESTRUCTION.md §16.4). This module keeps one state per structure in a small
 * float DataTexture and patches the bucket materials (handed over by world.patchStructureMaterials) and their shadow
 * depth materials, so every tagged vertex and fragment reads its structure's state:
 *
 *  - holes: up to four per structure (a breach's centre and radius, world space); a fragment of the structure inside
 *    one is discarded, with a blocky ragged edge (brick-sized cells of the wall break out at different radii) — the
 *    stage builder's broken rim and the dark room behind it come through the debris writers;
 *  - collapse: from its start time the building comes down into its own dust plume over COLLAPSE_S — the storeys
 *    crumble apart (cells of the walls drift and drop, the upper ones most), the whole leans a few degrees toward the
 *    blow about its base and sinks gravity-eased — and is discarded at the end (the core's rubble heap is the ground
 *    then); a settled collapse (a late joiner, a migration) is gone at once.
 *
 * Six texels per structure: A = (collapse start on the fx clock or 0, height m, blow dir x, blow dir z),
 * B = (base pivot x, y, z, hole count), H0..H3 = (hole centre x, y, z, radius m). No per-frame CPU but the clock
 * uniform (and, while a building falls, one version bump per bucket so the static shadow cache follows the sinking
 * shadow): a stage or breach event writes texels and one upload range.
 *
 * World space throughout: the vertex patch carries `transformed` to the world through the model, batching and
 * instance matrices, moves it there, and carries the displacement back — merged buckets at identity and BatchedMesh
 * cells (a local frame per part) both work.
 */
import * as THREE from 'three';

const TEX_W = 512;
/** Texels per structure: A, B and the holes. */
const STRIDE = 6;
/** Holes a structure keeps (a ring: a fifth replaces the first). */
export const MAX_HOLES = 4;
/** Seconds a collapse takes from the first crack to the last stone below the dust. */
export const COLLAPSE_S = 2.4;
/** The lean (rad) a falling building reaches toward the blow. */
const LEAN_RAD = 0.2;

const HASH = /* glsl */ `
vec3 fxStructHash3( vec3 c ) {
  return fract( sin( vec3( dot( c, vec3( 127.1, 311.7, 74.7 ) ), dot( c, vec3( 269.5, 183.3, 246.1 ) ),
    dot( c, vec3( 113.5, 271.9, 124.6 ) ) ) ) * 43758.5453 );
}
`;

const VERT_PARS = /* glsl */ `
attribute float aDamage;
uniform highp sampler2D uStructMask;
uniform float uStructClock;
varying float vStructCut;
varying vec3 vStructPos;
flat varying float vStructSid;
flat varying float vStructHoles;
${HASH}
`;

const VERT_BODY = /* glsl */ `
vStructCut = 0.0;
vStructPos = vec3( 0.0 );
vStructSid = -1.0;
vStructHoles = 0.0;
{
  int sid = int( floor( aDamage + 0.5 ) ) - 1;
  if ( sid >= 0 ) {
    mat4 sw = modelMatrix;
    #ifdef USE_BATCHING
      sw = sw * batchingMatrix;
    #endif
    #ifdef USE_INSTANCING
      sw = sw * instanceMatrix;
    #endif
    vec3 wp = ( sw * vec4( transformed, 1.0 ) ).xyz;
    vStructPos = wp;
    vStructSid = float( sid );
    int base = sid * ${STRIDE};
    vec4 SA = texelFetch( uStructMask, ivec2( base % ${TEX_W}, base / ${TEX_W} ), 0 );
    vec4 SB = texelFetch( uStructMask, ivec2( ( base + 1 ) % ${TEX_W}, ( base + 1 ) / ${TEX_W} ), 0 );
    vStructHoles = SB.w;
    if ( SA.x > 0.0 ) {
      float t = uStructClock - SA.x;
      if ( t > 0.0 ) {
        float k = clamp( t / ${COLLAPSE_S.toFixed(2)}, 0.0, 1.0 );
        float fall = k * k;
        float H = SA.y;
        vec3 piv = SB.xyz;
        vec3 p = wp - piv;
        float hf = clamp( p.y / H, 0.0, 1.0 );
        // crumble: cells of the walls drift apart and drop as it goes down, the upper storeys most (a function of the
        // position only, so faces that share a corner keep it shared)
        vec3 n = fxStructHash3( floor( wp * 1.3 ) ) - 0.5;
        p.xz += n.xz * k * ( 0.3 + 0.9 * hf );
        p.y -= abs( n.y ) * fall * hf * 1.6;
        // lean toward the blow about the base: rotate in the plane of (blow direction, up) through the pivot
        vec2 d = SA.zw;
        float along = dot( p.xz, d );
        float ang = ${LEAN_RAD.toFixed(3)} * fall;
        float ca = cos( ang ), sa = sin( ang );
        float na = along * ca + p.y * sa;
        float ny = -along * sa + p.y * ca;
        p.xz += d * ( na - along );
        p.y = ny;
        // sink into the plume (the dust hides where it meets the ground)
        p.y -= fall * H * 0.96;
        transformed += inverse( mat3( sw ) ) * ( piv + p - wp );
        if ( t >= ${COLLAPSE_S.toFixed(2)} ) vStructCut = 1.0;
      }
    }
  }
}
`;

const FRAG_PARS = /* glsl */ `
uniform highp sampler2D uStructMask;
varying float vStructCut;
varying vec3 vStructPos;
flat varying float vStructSid;
flat varying float vStructHoles;
${HASH}
`;
const FRAG_BODY = /* glsl */ `
if ( vStructCut > 0.5 ) discard;
if ( vStructHoles > 0.5 ) {
  int hb = int( vStructSid + 0.5 ) * ${STRIDE} + 2;
  // brick-sized cells of the wall break out at different radii: a blocky, ragged hole
  float rk = 0.8 + 0.4 * fxStructHash3( floor( vStructPos * 2.6 ) ).x;
  for ( int i = 0; i < ${MAX_HOLES}; i++ ) {
    if ( float( i ) >= vStructHoles ) break;
    int at = hb + i;
    vec4 hh = texelFetch( uStructMask, ivec2( at % ${TEX_W}, at / ${TEX_W} ), 0 );
    vec3 dd = vStructPos - hh.xyz;
    float r = hh.w * rk;
    if ( dot( dd, dd ) < r * r ) discard;
  }
}
`;

export interface StructureMask {
  readonly texture: THREE.DataTexture;
  /** The uniforms every patched material shares. */
  readonly uniforms: { uStructMask: { value: THREE.Texture }; uStructClock: { value: number } };
  /** A structure starts coming down at `startS` (fx clock); `settled`: it is gone already. */
  collapse(structureId: number, startS: number, heightM: number, dirX: number, dirZ: number,
    pivotX: number, baseY: number, pivotZ: number, settled?: boolean): void;
  /** A hole through the structure (world centre, radius m): the next of its MAX_HOLES slots (a ring: a fifth hole
   *  replaces the first). Returns the slot, or -1. */
  addHole(structureId: number, x: number, y: number, z: number, radiusM: number): number;
  /** The fx clock (patched shaders animate from it); while a building falls, its buckets' shadows follow. */
  setClock(seconds: number): void;
  /** Shift every collapse start with the fx clock's rebase. */
  shiftTime(delta: number): void;
  reset(): void;
  /** Patch one bucket material (idempotent). */
  patch(material: THREE.Material): void;
  /** Patch a bucket mesh: its material(s) and a shadow depth material of its own (created when it has none). */
  patchMesh(mesh: THREE.Object3D): void;
  /** Keep a bucket's shadow following its falling building until `untilS` (fx clock). */
  followShadow(mesh: THREE.Object3D, untilS: number): void;
  readonly capacity: number;
}

/** A float DataTexture of `capacity` structures (STRIDE texels each). */
export function createStructureMask(capacity = 4096): StructureMask {
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
  // bucket meshes whose shadow follows a fall: the static shadow cache re-renders a caster that changes on
  // consecutive frames as a dynamic one, so its depth material's version moves every frame until the fall ends
  const following = new Map<THREE.Object3D, number>();

  const touch = (firstTexel: number, count: number): void => {
    texture.addUpdateRange(firstTexel * 4, count * 4);
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
      shader.fragmentShader = injectAfter(shader.fragmentShader, '#include <common>', FRAG_PARS)
        .replace(/void\s+main\s*\(\s*\)\s*\{/, (m) => `${m}\n${FRAG_BODY}`);
    };
    const priorKey = material.customProgramCacheKey?.bind(material);
    material.customProgramCacheKey = () => `${priorKey ? priorKey() : ''}|fx-structure-mask`;
    material.needsUpdate = true;
  }

  return {
    texture,
    uniforms,
    capacity,
    collapse(id, startS, heightM, dirX, dirZ, pivotX, baseY, pivotZ, settled = false) {
      if (!inRange(id)) return;
      const t = id * STRIDE, o = t * 4;
      const dl = Math.hypot(dirX, dirZ);
      // a start of 0 means "standing": a collapse always stamps a positive time (a settled one far in the past)
      data[o] = settled ? Math.max(1e-3, uniforms.uStructClock.value - COLLAPSE_S - 1) : Math.max(1e-3, startS);
      data[o + 1] = Math.max(0.5, heightM);
      data[o + 2] = dl > 1e-6 ? dirX / dl : 0;
      data[o + 3] = dl > 1e-6 ? dirZ / dl : 0;
      data[o + 4] = pivotX; data[o + 5] = baseY; data[o + 6] = pivotZ;
      touch(t, 2);
    },
    addHole(id, x, y, z, radiusM) {
      if (!inRange(id) || !(radiusM > 0)) return -1;
      const s = holeNext[id];
      holeNext[id] = (s + 1) % MAX_HOLES;
      const t = id * STRIDE + 2 + s, o = t * 4;
      data[o] = x; data[o + 1] = y; data[o + 2] = z; data[o + 3] = radiusM;
      touch(t, 1);
      const n = Math.max(holeCount[id], s + 1);
      if (n !== holeCount[id]) {
        holeCount[id] = n;
        data[(id * STRIDE + 1) * 4 + 3] = n;
        touch(id * STRIDE + 1, 1);
      }
      return s;
    },
    setClock(seconds) {
      uniforms.uStructClock.value = seconds;
      if (following.size === 0) return;
      for (const [mesh, until] of following) {
        const depth = (mesh as THREE.Mesh).customDepthMaterial;
        if (depth) depth.needsUpdate = true;
        if (seconds > until) following.delete(mesh);
      }
    },
    shiftTime(delta) {
      let any = false;
      for (let id = 0; id < capacity; id++) {
        const o = id * STRIDE * 4;
        if (data[o] > 0) { data[o] = Math.max(1e-3, data[o] + delta); any = true; }
      }
      if (any) { texture.clearUpdateRanges?.(); texture.needsUpdate = true; }
      for (const [mesh, until] of following) following.set(mesh, until + delta);
    },
    reset() {
      data.fill(0);
      holeCount.fill(0);
      holeNext.fill(0);
      following.clear();
      texture.clearUpdateRanges?.();
      texture.needsUpdate = true;
    },
    patch,
    patchMesh(object) {
      const mesh = object as THREE.Mesh;
      const m = mesh.material;
      if (Array.isArray(m)) for (const x of m) patch(x);
      else if (m) patch(m);
      if (!mesh.customDepthMaterial) {
        // three copies the bucket material's side, map and alpha test onto it at every shadow render
        const depth = new THREE.MeshDepthMaterial();
        depth.name = 'fx-structure-depth';
        mesh.customDepthMaterial = depth;
      }
      patch(mesh.customDepthMaterial);
    },
    followShadow(mesh, untilS) {
      if ((mesh as THREE.Mesh).customDepthMaterial) following.set(mesh, Math.max(following.get(mesh) ?? -Infinity, untilS));
    },
  };
}

function injectAfter(source: string, marker: string, text: string): string {
  const at = source.indexOf(marker);
  if (at < 0) return `${text}\n${source}`;
  const end = at + marker.length;
  return `${source.slice(0, end)}\n${text}${source.slice(end)}`;
}
