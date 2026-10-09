/**
 * structureGroundOcclusion.ts — 2026-10-09 (the shadows lane): the ground's sky beside the world's standing solids, read by
 * the aerial pass (post.ts) on the ground's ambient share. The law and the raster are structureGroundOcclusionBake.ts; this
 * is the runtime (the world's handle: the worker, the texture, the re-bake around destroyed or restored solids) and the
 * pass's block.
 *
 * The term dims only a ground pixel's ambient share, as the hulls' ground occlusion does (vehicleGroundOcclusion.ts):
 * colour · (1 − occ · (1 − r) · A / (T + A)), T the sun and A the ambient the light rig gives the pixel's depth normal
 * (contactShadows.ts), r the share of a blocked direction its occluder's own light gives back (a lit wall is not black). So
 * sunlit ground beside a wall keeps its sun, the ground in the wall's shadow and under a deck takes the darkening, and on a
 * clear day the term is a quarter of what it is under Whiteout's stratus. Receivers: opaque lit surfaces turned up (the
 * ground, a road, an apron decal, a flat rock) within SGO_GATE_M of the occluder's base, and the grass cards beside it —
 * never a wall, a roof, a hull (vehicle pixels are the cavity term's) or anything standing above the ground.
 *
 * Lifecycle: map.ts creates the handle when the world assembles (desktop; the phones keep their authored rig and no aerial
 * contact block), the worker answers while the battle entry warms, and the term fades in over SGO_FADE_IN_S (at once in
 * shot mode: whenReady() is what the capture staging awaits). World.update republishes the handle on
 * scene.userData.structureGroundOcclusion and polls the occluders' destroyed flags; a solid that breaks or is restored
 * re-bakes its reach in the worker and the answer patches the texture in place (copyTextureToTexture).
 */
import * as THREE from 'three';
import {
  SGO_BASE_WRAP_M, SGO_HALF_M, SGO_REACH_MAX_M, SGO_SIZE, bakeStructureGroundOcclusion, packOccluders, sgoRectOf,
  type SgoRecord, type SgoRect,
} from './structureGroundOcclusionBake.ts';
import { VEHICLE_ALPHA_MIN } from './vehicleOcclusion.ts';
import { lightTune } from './lightModelCore.ts';

/** The pass applies the term out to this distance, fading over the last SGO_RANGE_FADE_M (m). */
export const SGO_RANGE_M = 220;
export const SGO_RANGE_FADE_M = 70;
/** Receivers up to this far over the occluder's base take the term whole, fading to none SGO_GATE_SOFT_M higher (m). */
export const SGO_GATE_M = 0.8;
export const SGO_GATE_SOFT_M = 0.7;
/** Receivers turned up: from this normal y the term fades in, whole from the second (a wall foot's ground, never the wall). */
export const SGO_UP_MIN = 0.5;
export const SGO_UP_FULL = 0.8;
/**
 * The share of a blocked direction's darkening its occluder's own light gives back (first-order interreflection): a wall
 * seen from its foot is lit by half the sky and half the ground (vehicleGroundOcclusion.ts r_wall), its paint around 0.4.
 */
export const SGO_RETURN = 0.3;
/** A grass card (no sun state) takes this ambient share. */
export const SGO_CARD_AMBIENT_SHARE = 0.6;
/** The live term fades in over this many seconds once the bake lands (0 in shot mode). */
export const SGO_FADE_IN_S = 0.6;
/**
 * The maps the term stays off on (2026-10-09, the owner on the deployed game: Frosthollow "incredible", and so Cinder
 * Junction, Saltwind, Reservoir, Verdant, Saltmere, Sirocco, Frontier and Nordhavn): light-touch until a blind wave shows
 * the term costs them nothing. A map's sky.lighting.groundOcclusion still scales it everywhere else (0: off).
 */
export const SGO_PROTECTED_MAPS: ReadonlySet<string> = new Set([
  'winter', 'railyard', 'saltwind', 'reservoir', 'verdant', 'coastal', 'desert', 'frontier', 'fjord',
]);
/** How often the occluders' destroyed flags are polled (s). */
export const SGO_POLL_S = 0.4;

export interface StructureGroundOcclusionHandle {
  readonly texture: THREE.DataTexture;
  /** The first bake has landed. */
  readonly ready: boolean;
  /** 0..1: the term's live strength (the fade-in, the map's scale). */
  readonly strength: number;
  /** The world is on screen (its group mounted and visible). */
  active(): boolean;
  whenReady(): Promise<boolean>;
  /** Per frame (World.update): fade in, poll the destroyed flags, flush landed patches. */
  update(dt: number): void;
  /** The pass, before it binds the texture: copies landed region patches into the uploaded texture. */
  flush(renderer: THREE.WebGLRenderer): void;
  setInstant(on: boolean): void;
  dispose(): void;
  readonly stats: { parts: number; bakeMs: number; rebakes: number; patches: number; worker: boolean };
}

interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
}

export interface StructureGroundOcclusionOptions {
  /** The world's group: the handle is active only while it is mounted and visible. */
  group: THREE.Object3D;
  /** The map's strength scale (sky.lighting.groundOcclusion; 1 by default, 0 turns the term off for the map). */
  scale?: number;
  /** A worker factory (null: bake on the main thread, sliced to an idle callback). */
  makeWorker?: (() => WorkerLike | null) | null;
}

function defaultWorker(): WorkerLike | null {
  try {
    if (typeof Worker === 'undefined') return null;
    return new Worker(new URL('./structureGroundOcclusionWorker.ts', import.meta.url), { type: 'module', name: 'cot-ground-occlusion' }) as unknown as WorkerLike;
  } catch {
    return null;
  }
}

/** The world rectangle a changed record re-bakes: its bounds grown by the largest reach. */
function recordRect(record: SgoRecord): SgoRect {
  const m = SGO_REACH_MAX_M + 1;
  return sgoRectOf(record.min[0] - m, record.min[2] - m, record.max[0] + m, record.max[2] + m);
}

function mergeRects(rects: SgoRect[]): SgoRect[] {
  const out: SgoRect[] = [];
  for (const r of rects) {
    let merged = false;
    for (const o of out) {
      if (r[0] <= o[2] && r[2] >= o[0] && r[1] <= o[3] && r[3] >= o[1]) {
        o[0] = Math.min(o[0], r[0]); o[1] = Math.min(o[1], r[1]); o[2] = Math.max(o[2], r[2]); o[3] = Math.max(o[3], r[3]);
        merged = true;
        break;
      }
    }
    if (!merged) out.push([...r] as SgoRect);
  }
  return out;
}

export function createStructureGroundOcclusion(
  records: readonly SgoRecord[], options: StructureGroundOcclusionOptions,
): StructureGroundOcclusionHandle {
  const data = new Uint8Array(SGO_SIZE * SGO_SIZE * 2);
  const texture = new THREE.DataTexture(data, SGO_SIZE, SGO_SIZE, THREE.RGFormat, THREE.UnsignedByteType);
  texture.name = 'structure-ground-occlusion';
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.unpackAlignment = 2;
  const scale = Math.max(0, Math.min(1, options.scale ?? 1));
  const stats = { parts: 0, bakeMs: 0, rebakes: 0, patches: 0, worker: false };
  const flags = new Uint8Array(records.length);
  for (let i = 0; i < records.length; i++) flags[i] = records[i]?.dead || records[i]?.crushed ? 1 : 0;
  let ready = false, disposed = false, instant = false, fade = 0, pollT = 0, nextId = 1;
  let uploadedOnce = false;
  const pending: { rect: SgoRect; rg: Uint8Array }[] = [];
  const inflight = new Map<number, true>();
  let resolveReady: (ok: boolean) => void = () => {};
  const readyPromise = new Promise<boolean>((resolve) => { resolveReady = resolve; });
  const worker = scale > 0 ? (options.makeWorker === null ? null : (options.makeWorker ?? defaultWorker)()) : null;
  stats.worker = !!worker;

  function land(rect: SgoRect, rg: Uint8Array, full: boolean): void {
    if (disposed) return;
    const [i0, j0, i1, j1] = rect, w = i1 - i0;
    for (let j = j0; j < j1; j++) data.set(rg.subarray((j - j0) * w * 2, (j - j0 + 1) * w * 2), (j * SGO_SIZE + i0) * 2);
    if (full || !uploadedOnce) { texture.needsUpdate = true; return; }
    pending.push({ rect, rg });
  }

  function request(rect: SgoRect | null): void {
    if (disposed || scale <= 0) return;
    const packed = packOccluders(records);
    if (worker) {
      const id = nextId++;
      inflight.set(id, true);
      worker.postMessage({ id, packed, rect }, [packed.buffer as ArrayBuffer]);
      return;
    }
    const run = (): void => {
      if (disposed) return;
      const result = bakeStructureGroundOcclusion(packed, rect);
      stats.bakeMs += result.ms;
      if (!rect) stats.parts = result.parts;
      land(result.rect, result.rg, !rect);
      if (!rect) { ready = true; resolveReady(true); } else stats.rebakes++;
    };
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (idle) idle(run, { timeout: 500 }); else setTimeout(run, 0);
  }

  if (worker) {
    worker.onmessage = (event: MessageEvent) => {
      const msg = event.data as { id: number; rg: Uint8Array; rect: SgoRect; parts: number; ms: number };
      const first = msg.id === 1;
      inflight.delete(msg.id);
      stats.bakeMs += msg.ms;
      if (first) stats.parts = msg.parts; else stats.rebakes++;
      land(msg.rect, msg.rg, first);
      if (first) { ready = true; resolveReady(true); }
    };
    worker.onerror = () => {
      // a failed worker: bake the rest on the main thread
      try { worker.terminate(); } catch { /* gone */ }
      stats.worker = false;
      if (!ready) {
        const result = bakeStructureGroundOcclusion(packOccluders(records), null);
        stats.bakeMs += result.ms; stats.parts = result.parts;
        land(result.rect, result.rg, true);
        ready = true; resolveReady(true);
      }
    };
  }
  if (scale > 0) request(null); else resolveReady(false);

  function poll(): void {
    const rects: SgoRect[] = [];
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const f = r?.dead || r?.crushed ? 1 : 0;
      if (f !== flags[i]) { flags[i] = f; rects.push(recordRect(r)); }
    }
    if (!rects.length) return;
    for (const rect of mergeRects(rects)) {
      if (rect[2] > rect[0] && rect[3] > rect[1]) request(rect);
    }
  }

  return {
    texture,
    get ready() { return ready; },
    get strength() { return ready ? fade * scale * Math.max(0, lightTune('STRUCT_GROUND_AO', 1)) : 0; },
    active: () => !!options.group.parent && options.group.visible,
    whenReady: () => readyPromise,
    update(dt: number) {
      if (disposed || !ready) return;
      fade = instant || SGO_FADE_IN_S <= 0 ? 1 : Math.min(1, fade + Math.max(0, dt) / SGO_FADE_IN_S);
      pollT += Math.max(0, dt);
      if (pollT >= SGO_POLL_S || instant) { pollT = 0; poll(); }
    },
    flush(renderer: THREE.WebGLRenderer) {
      if (!uploadedOnce) {
        // the first bind uploads the whole texture (the patches are in its data already)
        uploadedOnce = ready;
        pending.length = 0;
        return;
      }
      while (pending.length) {
        const patch = pending.shift()!;
        const [i0, j0, i1, j1] = patch.rect;
        const src = new THREE.DataTexture(patch.rg, i1 - i0, j1 - j0, THREE.RGFormat, THREE.UnsignedByteType);
        src.flipY = false;
        src.unpackAlignment = 2;
        try {
          renderer.copyTextureToTexture(src, texture, null, new THREE.Vector2(i0, j0));
          stats.patches++;
        } catch {
          texture.needsUpdate = true; // the whole texture again from its data
        }
        src.dispose();
      }
    },
    setInstant(on: boolean) { instant = on; if (on && ready) fade = 1; },
    dispose() {
      disposed = true;
      pending.length = 0;
      inflight.clear();
      try { worker?.terminate(); } catch { /* gone */ }
      texture.dispose();
      resolveReady(false);
    },
    stats,
  };
}

// ------------------------------------------------------------------------------------------------- the aerial pass

export interface StructureGroundUniforms {
  uSgo: THREE.IUniform<number>;
  tSgo: THREE.IUniform<THREE.Texture>;
}

const EMPTY = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0]), 1, 1, THREE.RGFormat, THREE.UnsignedByteType);
  t.unpackAlignment = 2;
  t.needsUpdate = true;
  return t;
})();

export function createStructureGroundUniforms(): StructureGroundUniforms {
  return { uSgo: { value: 0 }, tSgo: { value: EMPTY } };
}

/** Per frame (post.ts): the active world's handle, when the lever is on and its bake has landed. */
export function updateStructureGroundUniforms(
  uniforms: StructureGroundUniforms | Record<string, THREE.IUniform>, scene: THREE.Scene, renderer: THREE.WebGLRenderer, enabled: boolean,
): void {
  const u = uniforms as StructureGroundUniforms;
  const handle = scene.userData.structureGroundOcclusion as StructureGroundOcclusionHandle | undefined;
  const strength = enabled && handle && handle.active() ? handle.strength : 0;
  if (!(strength > 0.001) || !handle) { u.uSgo.value = 0; u.tSgo.value = EMPTY; return; }
  handle.flush(renderer);
  u.uSgo.value = strength;
  u.tSgo.value = handle.texture;
}

const f = (x: number): string => x.toFixed(5);

/**
 * The block the aerial fragment includes AFTER `CONTACT_SHADOW_GLSL` (it uses cotSunVisOf, cotNormalAt, the rig uniforms
 * and the pass's uSunDir): `cotStructureGroundShade(uv, P, alpha, dist)` → the multiplier for a ground pixel's colour.
 */
export const STRUCTURE_GROUND_OCCLUSION_GLSL = /* glsl */ `
    // 2026-10-09: the ground's sky beside the world's solids (structureGroundOcclusion.ts)
    uniform float uSgo;
    uniform sampler2D tSgo;
    float cotStructureGroundShade( vec2 uv, vec3 P, float alpha, float dist ) {
      vec2 t = P.xz * ${f(1 / (2 * SGO_HALF_M))} + 0.5;
      if ( any( lessThan( t, vec2( 0.0 ) ) ) || any( greaterThan( t, vec2( 1.0 ) ) ) ) return 1.0;
      float occ = texture2D( tSgo, t ).r;
      if ( occ < 0.004 ) return 1.0;
      // the strongest occluder's base, stored modulo ${SGO_BASE_WRAP_M} m: the one nearest the pixel's own height
      ivec2 ti = ivec2( min( t * ${f(SGO_SIZE)}, vec2( ${f(SGO_SIZE - 1)} ) ) );
      float baseMod = texelFetch( tSgo, ti, 0 ).g * ${f((255 / 256) * SGO_BASE_WRAP_M)};
      float d = baseMod - mod( P.y, ${f(SGO_BASE_WRAP_M)} );
      d -= ${f(SGO_BASE_WRAP_M)} * floor( d * ${f(1 / SGO_BASE_WRAP_M)} + 0.5 );
      float gate = 1.0 - smoothstep( ${f(SGO_GATE_M)}, ${f(SGO_GATE_M + SGO_GATE_SOFT_M)}, -d );
      if ( gate <= 0.0 ) return 1.0;
      gate *= 1.0 - smoothstep( ${f(SGO_RANGE_M - SGO_RANGE_FADE_M)}, ${f(SGO_RANGE_M)}, dist );
      float sunVis = cotSunVisOf( alpha );
      float ambShare = ${f(SGO_CARD_AMBIENT_SHARE)};
      if ( sunVis >= 0.0 ) {
        vec3 N = cotNormalAt( uv, P );
        gate *= smoothstep( ${f(SGO_UP_MIN)}, ${f(SGO_UP_FULL)}, N.y );
        if ( gate <= 0.0 ) return 1.0;
        float T = uContactSunLum * max( dot( N, uSunDir ), 0.0 ) * clamp( sunVis, 0.0, 1.0 );
        float A = mix( uContactAmb.y, uContactAmb.x, N.y * 0.5 + 0.5 ) + uContactAmb.z
          + uContactAmb.w * max( dot( N, uContactFillDir ), 0.0 );
        ambShare = A / max( T + A, 1e-4 );
      }
      return 1.0 - uSgo * occ * ${f(1 - SGO_RETURN)} * gate * ambShare;
    }
`;

/** The pass's condition (post.ts): a non-vehicle pixel within range. */
export const STRUCTURE_GROUND_ALPHA_MAX = VEHICLE_ALPHA_MIN;
