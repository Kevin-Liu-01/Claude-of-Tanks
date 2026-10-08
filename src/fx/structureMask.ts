/**
 * structureMask.ts — buildings coming down in the world's own geometry (destruction-fx lane, 2026-10-07).
 *
 * The world merges every building's parts into shared bucket meshes (and BatchedMesh fine-detail cells); each vertex
 * of a structure part carries `aDamage` = structureIdx + 1 (a Uint16 attribute; 0, or the attribute absent, for
 * anything else — the core lane's seam, DESTRUCTION.md §16.4). This module keeps one state per structure in a small
 * float DataTexture and patches the bucket materials (handed over by world.patchStructureMaterials) so every tagged
 * vertex reads its structure's state:
 *
 *  - collapse: from its start time the building sinks into its own dust plume, gravity-eased, leaning a few degrees
 *    toward the blow about its base, and is discarded at the end (the core's rubble heap is the ground then);
 *  - a settled collapse (a late joiner, a migration) is gone at once.
 *
 * Two texels per structure: A = (collapse start on the fx clock or 0, height m, blow dir x, blow dir z), B = (base
 * pivot x, y, z, unused). No per-frame CPU: the shader animates from the shared fx clock uniform; a stage event writes
 * two texels and one upload range. Part classes (glass on 'damaged', a fallen roof) are hidden through the seam's spans
 * on the CPU, the way crushableClutter flattens its ranges — not here.
 *
 * Assumption the world keeps: a bucket mesh's object space is world space (merged buckets sit at identity), so the
 * pivot is a world point. Depth / distance materials of those buckets take the same patch (the shadow sinks with the
 * building); the static shadow cache must refresh the cascades a collapsing structure touches.
 */
import * as THREE from 'three';

const TEX_W = 512;
/** Seconds a collapse takes from the first crack to the last stone below the dust. */
export const COLLAPSE_S = 2.4;
/** The lean (rad) a falling building reaches toward the blow. */
const LEAN_RAD = 0.2;

const VERT_PARS = /* glsl */ `
attribute float aDamage;
uniform highp sampler2D uStructMask;
uniform float uStructClock;
varying float vStructCut;
`;

const VERT_BODY = /* glsl */ `
vStructCut = 0.0;
{
  int sid = int( floor( aDamage + 0.5 ) ) - 1;
  if ( sid >= 0 ) {
    int base = sid * 2;
    ivec2 ta = ivec2( base % ${TEX_W}, base / ${TEX_W} );
    vec4 SA = texelFetch( uStructMask, ta, 0 );
    vec4 SB = texelFetch( uStructMask, ta + ivec2( 1, 0 ), 0 );
    if ( SA.x > 0.0 ) {
      float t = uStructClock - SA.x;
      if ( t > 0.0 ) {
        float k = clamp( t / ${COLLAPSE_S.toFixed(2)}, 0.0, 1.0 );
        float fall = k * k;
        // lean toward the blow about the base: rotate in the plane of (blow direction, up) through the pivot
        vec3 piv = SB.xyz;
        vec3 p = transformed - piv;
        vec2 d = SA.zw;
        float along = dot( p.xz, d );
        float ang = ${LEAN_RAD.toFixed(3)} * fall;
        float ca = cos( ang ), sa = sin( ang );
        float na = along * ca + p.y * sa;
        float ny = -along * sa + p.y * ca;
        p.xz += d * ( na - along );
        p.y = ny;
        transformed = piv + p;
        // sink into the plume (the dust hides where it meets the ground)
        transformed.y -= fall * SA.y * 0.96;
        if ( t >= ${COLLAPSE_S.toFixed(2)} ) vStructCut = 1.0;
      }
    }
  }
}
`;

const FRAG_PARS = /* glsl */ `
varying float vStructCut;
`;
const FRAG_BODY = /* glsl */ `
if ( vStructCut > 0.5 ) discard;
`;

export interface StructureMask {
  readonly texture: THREE.DataTexture;
  /** The uniforms every patched material shares. */
  readonly uniforms: { uStructMask: { value: THREE.Texture }; uStructClock: { value: number } };
  /** A structure starts coming down at `startS` (fx clock); `settled`: it is gone already. */
  collapse(structureId: number, startS: number, heightM: number, dirX: number, dirZ: number,
    pivotX: number, baseY: number, pivotZ: number, settled?: boolean): void;
  /** The fx clock (patched shaders animate from it). */
  setClock(seconds: number): void;
  /** Shift every collapse start with the fx clock's rebase. */
  shiftTime(delta: number): void;
  reset(): void;
  /** Patch one bucket material (idempotent). Usable as the world hook's callback. */
  patch(material: THREE.Material): void;
  readonly capacity: number;
}

/** A float DataTexture of `capacity` structures (two texels each). */
export function createStructureMask(capacity = 4096): StructureMask {
  const texels = capacity * 2;
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

  const touch = (texel: number): void => {
    // two texels of one structure share a row (base is even, TEX_W is even)
    texture.addUpdateRange(texel * 4, 8);
    texture.needsUpdate = true;
  };
  const inRange = (id: number): boolean => Number.isInteger(id) && id >= 0 && id < capacity;

  return {
    texture,
    uniforms,
    capacity,
    collapse(id, startS, heightM, dirX, dirZ, pivotX, baseY, pivotZ, settled = false) {
      if (!inRange(id)) return;
      const t = id * 2, o = t * 4;
      const dl = Math.hypot(dirX, dirZ);
      // a start of 0 means "standing": a collapse always stamps a positive time (a settled one far in the past)
      data[o] = settled ? 1e-3 : Math.max(1e-3, startS);
      data[o + 1] = Math.max(0.5, heightM);
      data[o + 2] = dl > 1e-6 ? dirX / dl : 0;
      data[o + 3] = dl > 1e-6 ? dirZ / dl : 0;
      data[o + 4] = pivotX; data[o + 5] = baseY; data[o + 6] = pivotZ;
      if (settled) data[o] = Math.max(1e-3, uniforms.uStructClock.value - COLLAPSE_S - 1);
      touch(t);
    },
    setClock(seconds) { uniforms.uStructClock.value = seconds; },
    shiftTime(delta) {
      let any = false;
      for (let id = 0; id < capacity; id++) {
        const o = id * 8;
        if (data[o] > 0) { data[o] = Math.max(1e-3, data[o] + delta); any = true; }
      }
      if (any) { texture.clearUpdateRanges?.(); texture.needsUpdate = true; }
    },
    reset() {
      data.fill(0);
      texture.clearUpdateRanges?.();
      texture.needsUpdate = true;
    },
    patch(material) {
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
    },
  };
}

function injectAfter(source: string, marker: string, text: string): string {
  const at = source.indexOf(marker);
  if (at < 0) return `${text}\n${source}`;
  const end = at + marker.length;
  return `${source.slice(0, end)}\n${text}${source.slice(end)}`;
}
