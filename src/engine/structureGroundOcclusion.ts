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
 *
 * 2026-10-17 (the SKY lane, 227 SKY-03): the handle also keeps the aureole's soft shadow (structureAureoleBake.ts) — a thin
 * deck's forward-scattered sunlight from a disc round the sun, hidden by the same solids — baked in the same worker for
 * the sun the pass asks for (requestAureole) once the light model gives the deck an aureole (lightModel.ts deckAureole),
 * re-baked when the sun moves and patched round destroyed solids like the occlusion. The pass's block takes the aureole's
 * light back where a solid hides it, on the same receivers (structureAureoleBake.ts has the law).
 */
import * as THREE from 'three';
import {
  SGO_BASE_WRAP_M, SGO_HALF_M, SGO_REACH_MAX_M, SGO_SIZE, bakeStructureGroundOcclusion, packOccluders, sgoRectOf,
  type SgoRecord, type SgoRect,
} from './structureGroundOcclusionBake.ts';
import { VEHICLE_ALPHA_MIN } from './vehicleOcclusion.ts';
import { lightTune } from './lightModelCore.ts';
import { AUREOLE_RADIUS_DEG, AUREOLE_REACH_M, bakeStructureAureole } from './structureAureoleBake.ts';

/** The pass applies the term out to this distance, fading over the last SGO_RANGE_FADE_M (m). */
export const SGO_RANGE_M = 220;
export const SGO_RANGE_FADE_M = 70;
/** Receivers up to this far over the occluder's base take the term whole, fading to none SGO_GATE_SOFT_M higher (m). */
export const SGO_GATE_M = 0.8;
export const SGO_GATE_SOFT_M = 0.7;
/** Inside a standing solid's footprint (the raster's covered flag) only receivers at its base itself: never the solid's top. */
export const SGO_COVERED_GATE_M = 0.2;
export const SGO_COVERED_GATE_SOFT_M = 0.2;
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
/** How often the occluders' destroyed flags are polled (s). */
export const SGO_POLL_S = 0.4;
/**
 * (227) The aureole's receivers: up to this far over the shading solid's base take its shadow whole, fading to none
 * AUREOLE_GATE_SOFT_M higher (m) — wider than the occlusion's gate, for a shadow that runs tens of metres over the snow.
 */
export const AUREOLE_GATE_M = 2;
export const AUREOLE_GATE_SOFT_M = 2;
/** (227) A sun moved further than this from the aureole's baked one re-bakes it (the cosine of 1°). */
export const AUREOLE_SUN_COS = Math.cos(Math.PI / 180);

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
  /** (227) The aureole's soft shadow raster (structureAureoleBake.ts): null until a thin deck asks for it. */
  readonly aureoleTexture: THREE.DataTexture | null;
  /** (227) 0..1: the aureole's live strength (its bake for a sun has landed; the fade-in, the map's scale). */
  readonly aureoleStrength: number;
  /** (227) The pass, while the deck has an aureole: the sun (toward it) to bake it for; a sun moved 1° re-bakes. */
  requestAureole(sun: readonly number[]): void;
  readonly stats: {
    parts: number; bakeMs: number; rebakes: number; patches: number; worker: boolean; aureoleMs: number; aureoleBakes: number;
  };
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
  /** (227) The map's own sun when its deck is thin (deckBeam): the aureole's bake starts with the occlusion's. */
  aureoleSun?: readonly number[] | null;
}

/** A raster the handle owns: its CPU texels, its texture and the region patches that landed after its first upload. */
interface SgoRaster {
  data: Uint8Array;
  texture: THREE.DataTexture;
  uploadedOnce: boolean;
  pending: { rect: SgoRect; rg: Uint8Array }[];
}

function makeRaster(name: string): SgoRaster {
  const data = new Uint8Array(SGO_SIZE * SGO_SIZE * 2);
  const texture = new THREE.DataTexture(data, SGO_SIZE, SGO_SIZE, THREE.RGFormat, THREE.UnsignedByteType);
  texture.name = name;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.unpackAlignment = 2;
  return { data, texture, uploadedOnce: false, pending: [] };
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
  const sgo = makeRaster('structure-ground-occlusion');
  const texture = sgo.texture;
  const scale = Math.max(0, Math.min(1, options.scale ?? 1));
  const stats = { parts: 0, bakeMs: 0, rebakes: 0, patches: 0, worker: false, aureoleMs: 0, aureoleBakes: 0 };
  const flags = new Uint8Array(records.length);
  for (let i = 0; i < records.length; i++) flags[i] = records[i]?.dead || records[i]?.crushed ? 1 : 0;
  let ready = false, disposed = false, instant = false, fade = 0, pollT = 0, nextId = 1;
  const inflight = new Map<number, true>();
  // (227) the aureole: its raster (made on the first request), the sun its landed bake is for, the sun of the full bake in
  // flight, its fade-in, and the promise a capture waits on while a full bake is in flight
  let aur: SgoRaster | null = null;
  let aurSun: number[] | null = null, aurWant: number[] | null = null, aurFade = 0;
  let aurWait: Promise<boolean> | null = null, aurResolve: ((ok: boolean) => void) | null = null;
  const aureoleRadius = (): number => lightTune('DECK_AUREOLE_RADIUS', AUREOLE_RADIUS_DEG);
  let resolveReady: (ok: boolean) => void = () => {};
  const readyPromise = new Promise<boolean>((resolve) => { resolveReady = resolve; });
  const worker = scale > 0 ? (options.makeWorker === null ? null : (options.makeWorker ?? defaultWorker)()) : null;
  stats.worker = !!worker;

  function landIn(raster: SgoRaster, rect: SgoRect, rg: Uint8Array, full: boolean): void {
    if (disposed) return;
    const [i0, j0, i1, j1] = rect, w = i1 - i0;
    for (let j = j0; j < j1; j++) raster.data.set(rg.subarray((j - j0) * w * 2, (j - j0 + 1) * w * 2), (j * SGO_SIZE + i0) * 2);
    if (full || !raster.uploadedOnce) { raster.texture.needsUpdate = true; return; }
    raster.pending.push({ rect, rg });
  }
  const land = (rect: SgoRect, rg: Uint8Array, full: boolean): void => landIn(sgo, rect, rg, full);

  /** (227) An aureole bake landed: a full one for its sun swaps the raster in, a region one patches it. */
  function landAureole(rect: SgoRect, rg: Uint8Array, full: boolean, sun: number[], ms: number): void {
    if (disposed || !aur) return;
    stats.aureoleMs += ms;
    stats.aureoleBakes++;
    landIn(aur, rect, rg, full);
    if (!full) return;
    aurSun = sun;
    if (aurWant && aurWant.every((v, i) => v === sun[i])) {
      aurWant = null;
      aurResolve?.(true);
      aurResolve = null;
      aurWait = null;
    }
  }

  function requestAur(rect: SgoRect | null, sun: number[]): void {
    if (disposed || scale <= 0 || !aur) return;
    const packed = packOccluders(records);
    const radius = aureoleRadius();
    if (worker) {
      const id = nextId++;
      inflight.set(id, true);
      worker.postMessage({ id, kind: 'aureole', packed, rect, sun, radius }, [packed.buffer as ArrayBuffer]);
      return;
    }
    const run = (): void => {
      if (disposed) return;
      const result = bakeStructureAureole(packed, sun, rect, radius);
      landAureole(result.rect, result.rg, !rect, sun, result.ms);
    };
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (idle) idle(run, { timeout: 500 }); else setTimeout(run, 0);
  }

  function wantAureole(sun: readonly number[]): void {
    if (disposed || scale <= 0) return;
    const l = Math.hypot(sun[0], sun[1], sun[2]);
    if (!(l > 1e-6) || !(sun[1] > 0)) return;
    const s = [sun[0] / l, sun[1] / l, sun[2] / l];
    const ref = aurWant ?? aurSun;
    if (ref && ref[0] * s[0] + ref[1] * s[1] + ref[2] * s[2] >= AUREOLE_SUN_COS) return;
    if (!aur) aur = makeRaster('structure-aureole-shadow');
    aurWant = s;
    if (!aurWait) aurWait = new Promise<boolean>((resolve) => { aurResolve = resolve; });
    requestAur(null, s);
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
      const msg = event.data as { id: number; kind?: string; rg: Uint8Array; rect: SgoRect; parts: number; ms: number; full?: boolean; sun?: number[] };
      inflight.delete(msg.id);
      if (msg.kind === 'aureole') { landAureole(msg.rect, msg.rg, !!msg.full, msg.sun ?? [0, 1, 0], msg.ms); return; }
      const first = msg.id === 1;
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
      if (aurWant) {
        const sun = aurWant, result = bakeStructureAureole(packOccluders(records), sun, null, aureoleRadius());
        landAureole(result.rect, result.rg, true, sun, result.ms);
      }
    };
  }
  if (scale > 0) request(null); else resolveReady(false);
  // (227) a thin deck's map: the aureole's bake starts with the occlusion's (the pass re-bakes it if the battle's sun differs)
  if (scale > 0 && options.aureoleSun) wantAureole(options.aureoleSun);

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
    // (227) the aureole's shadows reach further: its re-bake grows each record by the shadow's reach
    if (aur && aurSun) {
      const grown: SgoRect[] = [];
      for (const rect of rects) {
        const m = Math.ceil((AUREOLE_REACH_M - SGO_REACH_MAX_M) / ((2 * SGO_HALF_M) / SGO_SIZE));
        grown.push([Math.max(0, rect[0] - m), Math.max(0, rect[1] - m), Math.min(SGO_SIZE, rect[2] + m), Math.min(SGO_SIZE, rect[3] + m)]);
      }
      for (const rect of mergeRects(grown)) {
        if (rect[2] > rect[0] && rect[3] > rect[1]) requestAur(rect, aurSun);
      }
    }
  }

  /** A raster's first bind uploads the whole texture (the patches are in its data already); later patches copy in place. */
  function flushRaster(raster: SgoRaster, renderer: THREE.WebGLRenderer, landed: boolean): void {
    const texture = raster.texture, pending = raster.pending;
    if (!raster.uploadedOnce) {
      raster.uploadedOnce = landed;
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
  }

  return {
    texture,
    get ready() { return ready; },
    get strength() { return ready ? fade * scale * Math.max(0, lightTune('STRUCT_GROUND_AO', 1)) : 0; },
    get aureoleTexture() { return aur && aurSun ? aur.texture : null; },
    get aureoleStrength() { return aur && aurSun ? aurFade * scale : 0; },
    requestAureole: wantAureole,
    active: () => !!options.group.parent && options.group.visible,
    // (227) a capture also waits for an aureole bake in flight
    whenReady: () => readyPromise.then(async (ok) => { if (aurWait) await aurWait; return ok; }),
    update(dt: number) {
      if (disposed) return;
      if (aurSun) aurFade = instant || SGO_FADE_IN_S <= 0 ? 1 : Math.min(1, aurFade + Math.max(0, dt) / SGO_FADE_IN_S);
      if (!ready) return;
      fade = instant || SGO_FADE_IN_S <= 0 ? 1 : Math.min(1, fade + Math.max(0, dt) / SGO_FADE_IN_S);
      pollT += Math.max(0, dt);
      if (pollT >= SGO_POLL_S) { pollT = 0; poll(); }
    },
    flush(renderer: THREE.WebGLRenderer) {
      flushRaster(sgo, renderer, ready);
      if (aur) flushRaster(aur, renderer, !!aurSun);
    },
    setInstant(on: boolean) { instant = on; if (on && ready) fade = 1; if (on && aurSun) aurFade = 1; },
    dispose() {
      disposed = true;
      sgo.pending.length = 0;
      inflight.clear();
      try { worker?.terminate(); } catch { /* gone */ }
      texture.dispose();
      if (aur) { aur.pending.length = 0; aur.texture.dispose(); }
      resolveReady(false);
      aurResolve?.(false);
    },
    stats,
  };
}

// ------------------------------------------------------------------------------------------------- the aerial pass

export interface StructureGroundUniforms {
  uSgo: THREE.IUniform<number>;
  tSgo: THREE.IUniform<THREE.Texture>;
  /** (227) The aureole: x its light on up-facing ground in the rig's units, y its share of that ground's ambient. */
  uAur: THREE.IUniform<THREE.Vector2>;
  tAur: THREE.IUniform<THREE.Texture>;
}

const EMPTY = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0]), 1, 1, THREE.RGFormat, THREE.UnsignedByteType);
  t.unpackAlignment = 2;
  t.needsUpdate = true;
  return t;
})();

export function createStructureGroundUniforms(): StructureGroundUniforms {
  return { uSgo: { value: 0 }, tSgo: { value: EMPTY }, uAur: { value: new THREE.Vector2() }, tAur: { value: EMPTY } };
}

/** Per frame (post.ts): the active world's handle, when the lever is on and its bake has landed. */
export function updateStructureGroundUniforms(
  uniforms: StructureGroundUniforms | Record<string, THREE.IUniform>, scene: THREE.Scene, renderer: THREE.WebGLRenderer, enabled: boolean,
): void {
  const u = uniforms as StructureGroundUniforms;
  const handle = scene.userData.structureGroundOcclusion as StructureGroundOcclusionHandle | undefined;
  const on = !!(enabled && handle && handle.active());
  // (227) the deck's aureole (lightModel.ts deckAureole: its share of the hemisphere's light), baked for the pass's sun
  // (QA: __LIGHT_TUNE.DECK_AUREOLE scales it live, 0 drops it)
  const share = on ? Math.max(0, (scene.userData.lightModel as { deckAureole?: number } | undefined)?.deckAureole ?? 0)
    * Math.max(0, lightTune('DECK_AUREOLE', 1)) : 0;
  const sun = (uniforms as { uSunDir?: THREE.IUniform<THREE.Vector3> }).uSunDir?.value;
  if (share > 1e-3 && handle && sun) handle.requestAureole([sun.x, sun.y, sun.z]);
  const strength = on && handle ? handle.strength : 0;
  const aurStrength = share > 1e-3 && handle ? handle.aureoleStrength : 0;
  if (handle && (strength > 0.001 || aurStrength > 0.001)) handle.flush(renderer);
  if (!(strength > 0.001) || !handle) { u.uSgo.value = 0; u.tSgo.value = EMPTY; } else {
    u.uSgo.value = strength;
    u.tSgo.value = handle.texture;
  }
  const aurTexture = handle?.aureoleTexture ?? null;
  const amb = (uniforms as { uContactAmb?: THREE.IUniform<THREE.Vector4> }).uContactAmb?.value;
  const fillY = Math.max(0, (uniforms as { uContactFillDir?: THREE.IUniform<THREE.Vector3> }).uContactFillDir?.value.y ?? 0);
  if (!(aurStrength > 0.001) || !aurTexture || !amb) { u.uAur.value.set(0, 0); u.tAur.value = EMPTY; return; }
  // the aureole is that share of the hemisphere's light on up-facing ground (the rig's sky pole, uContactAmb.x)
  const light = share * amb.x * aurStrength;
  const ambUp = amb.x + amb.z + amb.w * fillY;
  u.uAur.value.set(light, ambUp > 1e-6 ? light / ambUp : 0);
  u.tAur.value = aurTexture;
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
    // 2026-10-17 (227 SKY-03): a thin deck's aureole (structureAureoleBake.ts) — x its light on up-facing ground in the
    // rig's units, y its share of that ground's ambient (a card's)
    uniform vec2 uAur;
    uniform sampler2D tAur;
    // the aureole raster's gate, as the occlusion's below: its texel's base (stored modulo ${SGO_BASE_WRAP_M} m, the one nearest
    // the pixel's own height) against the pixel's height; inside a standing solid's footprint only the ground at its base
    float cotAurGate( vec2 near, float y, float gateM, float softM ) {
      float d = near.g * ${f((255 / 256) * SGO_BASE_WRAP_M)} - mod( y, ${f(SGO_BASE_WRAP_M)} );
      d -= ${f(SGO_BASE_WRAP_M)} * floor( d * ${f(1 / SGO_BASE_WRAP_M)} + 0.5 );
      bool coveredHere = mod( floor( near.r * 255.0 + 0.5 ), 2.0 ) > 0.5;
      return coveredHere ? 1.0 - smoothstep( ${f(SGO_COVERED_GATE_M)}, ${f(SGO_COVERED_GATE_M + SGO_COVERED_GATE_SOFT_M)}, -d )
        : 1.0 - smoothstep( gateM, gateM + softM, -d );
    }
    float cotStructureGroundShade( vec2 uv, vec3 P, float alpha, float dist ) {
      vec2 t = P.xz * ${f(1 / (2 * SGO_HALF_M))} + 0.5;
      if ( any( lessThan( t, vec2( 0.0 ) ) ) || any( greaterThan( t, vec2( 1.0 ) ) ) ) return 1.0;
      // the occlusion in R's upper seven bits (the covered flag's lowest bit is noise under 1/254 in the filtered read)
      float occ = texture2D( tSgo, t ).r * ${f(255 / 254)};
      float aur = uAur.x > 0.0 ? texture2D( tAur, t ).r * ${f(255 / 254)} : 0.0;
      if ( occ < 0.008 && aur < 0.008 ) return 1.0;
      ivec2 ti = ivec2( min( t * ${f(SGO_SIZE)}, vec2( ${f(SGO_SIZE - 1)} ) ) );
      float gate = 0.0;
      if ( occ >= 0.008 ) {
        // the strongest occluder's base, stored modulo ${SGO_BASE_WRAP_M} m: the one nearest the pixel's own height
        vec2 near = texelFetch( tSgo, ti, 0 ).rg;
        float baseMod = near.g * ${f((255 / 256) * SGO_BASE_WRAP_M)};
        float d = baseMod - mod( P.y, ${f(SGO_BASE_WRAP_M)} );
        d -= ${f(SGO_BASE_WRAP_M)} * floor( d * ${f(1 / SGO_BASE_WRAP_M)} + 0.5 );
        // inside a standing solid's footprint only the ground at its base (the wall foot under the filter), never its top
        bool covered = mod( floor( near.r * 255.0 + 0.5 ), 2.0 ) > 0.5;
        gate = covered ? 1.0 - smoothstep( ${f(SGO_COVERED_GATE_M)}, ${f(SGO_COVERED_GATE_M + SGO_COVERED_GATE_SOFT_M)}, -d )
          : 1.0 - smoothstep( ${f(SGO_GATE_M)}, ${f(SGO_GATE_M + SGO_GATE_SOFT_M)}, -d );
      }
      // the aureole's shade: its shading solid's base by its own texel, a wider gate for a shadow tens of metres long
      float aGate = aur >= 0.008 ? cotAurGate( texelFetch( tAur, ti, 0 ).rg, P.y, ${f(AUREOLE_GATE_M)}, ${f(AUREOLE_GATE_SOFT_M)} ) : 0.0;
      if ( gate <= 0.0 && aGate <= 0.0 ) return 1.0;
      float range = 1.0 - smoothstep( ${f(SGO_RANGE_M - SGO_RANGE_FADE_M)}, ${f(SGO_RANGE_M)}, dist );
      gate *= range;
      aGate *= range;
      float sunVis = cotSunVisOf( alpha );
      float ambShare = ${f(SGO_CARD_AMBIENT_SHARE)};
      float aurDark = uAur.y * aur * aGate * ${f(SGO_CARD_AMBIENT_SHARE)};
      if ( sunVis >= 0.0 ) {
        vec3 N = cotNormalAt( uv, P );
        float up = smoothstep( ${f(SGO_UP_MIN)}, ${f(SGO_UP_FULL)}, N.y );
        gate *= up;
        aGate *= up;
        if ( gate <= 0.0 && aGate <= 0.0 ) return 1.0;
        float T = uContactSunLum * max( dot( N, uSunDir ), 0.0 ) * clamp( sunVis, 0.0, 1.0 );
        float A = mix( uContactAmb.y, uContactAmb.x, N.y * 0.5 + 0.5 ) + uContactAmb.z
          + uContactAmb.w * max( dot( N, uContactFillDir ), 0.0 );
        ambShare = A / max( T + A, 1e-4 );
        // the aureole's light the solid hides, over all the light the pixel takes (never the occluder's own light given back:
        // the face turned to its shadow is the face the aureole does not light)
        aurDark = uAur.x * aur * aGate / max( T + A, 1e-4 );
      }
      return max( 1.0 - uSgo * occ * ${f(1 - SGO_RETURN)} * gate * ambShare - aurDark, 0.0 );
    }
`;

/** The pass's condition (post.ts): a non-vehicle pixel within range. */
export const STRUCTURE_GROUND_ALPHA_MAX = VEHICLE_ALPHA_MIN;
