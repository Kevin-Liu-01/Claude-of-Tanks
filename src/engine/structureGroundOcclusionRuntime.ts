/**
 * structureGroundOcclusionRuntime.ts — the world's structure ground occlusion handle (split from structureGroundOcclusion.ts
 * in the 232 bundle diet): the worker, the rasters, the re-bake around destroyed or restored solids and the aureole's bake.
 * map.ts creates it when a battle world assembles; the boot graph keeps only the aerial pass's block (the constants, the
 * uniforms and the GLSL in structureGroundOcclusion.ts), so the bakes and their helpers load with the world.
 * The lifecycle and the law are documented in structureGroundOcclusion.ts and structureGroundOcclusionBake.ts.
 */
import * as THREE from 'three';
import {
  SGO_HALF_M, SGO_REACH_MAX_M, SGO_SIZE, bakeStructureGroundOcclusion, packOccluders, packRecordOccluders, sgoRectOf,
  type SgoRecord, type SgoRect,
} from './structureGroundOcclusionBake.ts';
import { AUREOLE_RADIUS_DEG, AUREOLE_REACH_M, bakeStructureAureole, sampleAureoleGroundSliced, type AureoleGround } from './structureAureoleBake.ts';
import { lightTune } from './lightModelCore.ts';
import { AUREOLE_SUN_COS, SGO_FADE_IN_S, SGO_POLL_S, type StructureGroundOcclusionHandle } from './structureGroundOcclusion.ts';
import { createWorkerCalls, type WorkerCallPort, type WorkerCallTimers } from '../workerCalls.ts';

export type WorkerLike = WorkerCallPort;

/** A bake's answer from the worker (structureGroundOcclusionWorker.ts). */
interface SgoReply { id: number; kind?: string; rg: Uint8Array; rect: SgoRect; parts: number; ms: number; full?: boolean; sun?: number[] }

/**
 * (improve-271, plan 017) The worker's deadlines (src/workerCalls.ts). A one-texel request goes ahead of the bakes, so the
 * worker answers within moments of starting: until that answer the deadline is the sky's cloud worker's 3 s
 * (sky.ts), after it a whole raster may take its time (a full bake measured 18-24 s in Node on a loaded machine), and only
 * a worker silent for a minute while it holds a bake is given up. A failed or silent worker is never posted to again: its
 * bakes run here, the whole raster in idle slices (SGO_SLICE_MS).
 */
const SGO_WORKER_FIRST_SILENCE_MS = 3000;
const SGO_WORKER_SILENCE_MS = 60_000;
/** A main-thread slice of a whole-raster bake: bands of rows sized to about this many ms each. */
const SGO_SLICE_MS = 2;
const SGO_FULL_RECT: SgoRect = [0, 0, SGO_SIZE, SGO_SIZE];

export interface StructureGroundOcclusionOptions {
  /** The world's group: the handle is active only while it is mounted and visible. */
  group: THREE.Object3D;
  /** The map's strength scale (sky.lighting.groundOcclusion; 1 by default, 0 turns the term off for the map). */
  scale?: number;
  /** A worker factory (null: bake on the main thread, sliced to an idle callback). */
  makeWorker?: (() => WorkerLike | null) | null;
  /** (227) The map's own sun when its deck is thin (deckBeam): the aureole's bake starts with the occlusion's. */
  aureoleSun?: readonly number[] | null;
  /** (229) The ground's height: the aureole's shadows fall on it, not on each solid's base plane (sampled in idle slices
   *  before the aureole's first bake, which waits for it). */
  aureoleGroundAt?: ((x: number, z: number) => number) | null;
  /** Receipts: the worker deadline's clock. */
  workerTimers?: WorkerCallTimers;
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

/** Run on the next idle callback (a timeout of 500 ms), or the next task where there is none. */
function whenIdle(run: (deadline?: { timeRemaining(): number }) => void): void {
  const idle = (globalThis as { requestIdleCallback?: (cb: (d?: { timeRemaining(): number }) => void, o?: { timeout: number }) => void })
    .requestIdleCallback;
  if (idle) idle(run, { timeout: 500 }); else setTimeout(run, 0);
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
  const stats = { parts: 0, bakeMs: 0, rebakes: 0, patches: 0, worker: false, aureoleMs: 0, aureoleBakes: 0, sliceMs: 0 };
  const flags = new Uint8Array(records.length);
  for (let i = 0; i < records.length; i++) flags[i] = records[i]?.dead || records[i]?.crushed ? 1 : 0;
  // each solid's parts, packed once (the shapes hold still; only the destroyed flags change): null hides no sky, so a
  // tree or a kerb that breaks re-bakes nothing
  const parts = scale > 0 ? records.map(packRecordOccluders) : [];
  let ready = false, disposed = false, instant = false, fade = 0, pollT = 0, nextId = 1;
  // (227) the aureole: its raster (made on the first request), the sun its landed bake is for, the sun of the full bake in
  // flight, its fade-in, and the promise a capture waits on while a full bake is in flight
  let aur: SgoRaster | null = null;
  let aurSun: number[] | null = null, aurWant: number[] | null = null, aurFade = 0;
  let aurWait: Promise<boolean> | null = null, aurResolve: ((ok: boolean) => void) | null = null;
  const aureoleRadius = (): number => lightTune('DECK_AUREOLE_RADIUS', AUREOLE_RADIUS_DEG);
  let resolveReady: (ok: boolean) => void = () => {};
  const readyPromise = new Promise<boolean>((resolve) => { resolveReady = resolve; });
  const spawnWorker = scale > 0 && options.makeWorker !== null ? options.makeWorker ?? defaultWorker : null;
  const calls = spawnWorker ? createWorkerCalls<SgoReply>({
    name: 'ground occlusion worker',
    spawn: spawnWorker,
    idOf: (msg) => msg?.id,
    firstSilenceMs: SGO_WORKER_FIRST_SILENCE_MS,
    silenceMs: SGO_WORKER_SILENCE_MS,
    // (audit R3) a failed worker is final: every later bake takes the main-thread path
    maxFailures: 1,
    timers: options.workerTimers,
  }) : null;
  // (229) the ground under the aureole's raster, sampled in idle slices from the start; the aureole's bakes wait for it
  let ground: AureoleGround | null = null;
  const groundWaits: (() => void)[] = [];
  const awaitGround = (run: () => void): boolean => {
    if (!options.aureoleGroundAt || ground) return false;
    groundWaits.push(run);
    return true;
  };
  const cancelGround = scale > 0 && options.aureoleGroundAt ? sampleAureoleGroundSliced(options.aureoleGroundAt, (g) => {
    if (disposed) return;
    ground = g;
    for (const run of groundWaits.splice(0)) run();
  }) : null;

  function landIn(raster: SgoRaster, rect: SgoRect, rg: Uint8Array, full: boolean): void {
    if (disposed) return;
    const [i0, j0, i1, j1] = rect, w = i1 - i0;
    for (let j = j0; j < j1; j++) raster.data.set(rg.subarray((j - j0) * w * 2, (j - j0 + 1) * w * 2), (j * SGO_SIZE + i0) * 2);
    if (full || !raster.uploadedOnce) { raster.texture.needsUpdate = true; return; }
    raster.pending.push({ rect, rg });
  }
  const land = (rect: SgoRect, rg: Uint8Array, full: boolean): void => landIn(sgo, rect, rg, full);

  /** A ground occlusion bake landed: the whole raster makes the handle ready, a region patches it. */
  function landOcclusion(rect: SgoRect, rg: Uint8Array, ms: number, parts: number, full: boolean): void {
    if (disposed) return;
    stats.bakeMs += ms;
    if (full) stats.parts = parts; else stats.rebakes++;
    land(rect, rg, full);
    if (full) { ready = true; resolveReady(true); }
  }

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
    if (awaitGround(() => requestAur(rect, sun))) return;
    const radius = aureoleRadius();
    if (calls?.available) {
      const packed = packOccluders(records);
      const id = nextId++;
      const posted = calls.post(id, { id, kind: 'aureole', packed, rect, sun, radius, ground }, [packed.buffer as ArrayBuffer], {
        reply: (msg) => { landAureole(msg.rect, msg.rg, !!msg.full, msg.sun ?? [0, 1, 0], msg.ms); return true; },
        fail: () => { stats.worker = false; bakeAureoleHere(rect, sun, radius); },
      });
      if (posted) return;
      stats.worker = false;
    }
    bakeAureoleHere(rect, sun, radius);
  }

  /** The aureole baked on the main thread: a region in one idle callback, the whole raster in slices. */
  function bakeAureoleHere(rect: SgoRect | null, sun: number[], radius: number): void {
    if (disposed) return;
    const packed = packOccluders(records);
    if (!rect) {
      bakeWholeHere((band) => bakeStructureAureole(packed, sun, band, radius, undefined, undefined, ground),
        (rg, ms) => landAureole(SGO_FULL_RECT, rg, true, sun, ms));
      return;
    }
    whenIdle(() => {
      if (disposed) return;
      const result = bakeStructureAureole(packed, sun, rect, radius, undefined, undefined, ground);
      landAureole(result.rect, result.rg, false, sun, result.ms);
    });
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
    if (calls?.available) {
      const packed = packOccluders(records, parts);
      const id = nextId++;
      const posted = calls.post(id, { id, packed, rect }, [packed.buffer as ArrayBuffer], {
        reply: (msg) => { landOcclusion(msg.rect, msg.rg, msg.ms, msg.parts, !rect); return true; },
        fail: () => { stats.worker = false; bakeOcclusionHere(rect); },
      });
      if (posted) return;
      stats.worker = false;
    }
    bakeOcclusionHere(rect);
  }

  /** The ground occlusion baked on the main thread: a region in one idle callback, the whole raster in slices. */
  function bakeOcclusionHere(rect: SgoRect | null): void {
    if (disposed) return;
    const packed = packOccluders(records, parts);
    if (!rect) {
      bakeWholeHere((band) => bakeStructureGroundOcclusion(packed, band), (rg, ms, n) => landOcclusion(SGO_FULL_RECT, rg, ms, n, true));
      return;
    }
    whenIdle(() => {
      if (disposed) return;
      const result = bakeStructureGroundOcclusion(packed, rect);
      landOcclusion(result.rect, result.rg, result.ms, result.parts, false);
    });
  }

  /**
   * (improve-271, plan 017) A whole raster baked on the main thread costs seconds on a large map, so it runs in bands of
   * rows, each band sized from the last one's cost to about SGO_SLICE_MS, while each idle callback's deadline holds
   * (without one, ~4 ms a slice), as the aureole's ground is sampled (structureAureoleBake.ts sampleAureoleGroundSliced).
   * A band equals the whole bake there (a region bake carries its own ring of neighbours); the bands gather in their own
   * buffer and land at once, so a raster on show never mixes two bakes. `parts` is the most any band saw.
   */
  function bakeWholeHere(bake: (band: SgoRect) => { rg: Uint8Array; ms: number; parts: number },
    done: (rg: Uint8Array, ms: number, parts: number) => void): void {
    const rg = new Uint8Array(SGO_SIZE * SGO_SIZE * 2);
    let row = 0, rows = 1, ms = 0, partsSeen = 0;
    const step = (deadline?: { timeRemaining(): number }): void => {
      if (disposed) return;
      const t0 = performance.now();
      let sliceMs = 0;
      do {
        const end = Math.min(SGO_SIZE, row + rows);
        const band = bake([0, row, SGO_SIZE, end]);
        rg.set(band.rg, row * SGO_SIZE * 2);
        ms += band.ms;
        sliceMs += band.ms;
        partsSeen = Math.max(partsSeen, band.parts);
        // the next band from this one's cost a row, never more than twice as tall (cheap open rows run into a town)
        rows = Math.max(1, Math.min(2 * rows, 64, Math.floor(SGO_SLICE_MS / Math.max(band.ms / (end - row), 1e-3))));
        row = end;
      } while (row < SGO_SIZE && (deadline ? deadline.timeRemaining() > SGO_SLICE_MS : performance.now() - t0 < 4));
      stats.sliceMs = Math.max(stats.sliceMs, sliceMs);
      if (row < SGO_SIZE) whenIdle(step); else done(rg, ms, partsSeen);
    };
    whenIdle(step);
  }

  if (calls) {
    // the one-texel request: its answer proves the worker runs (the short deadline holds until it comes)
    const id = nextId++;
    calls.post(id, { id, packed: new Float32Array(0), rect: [0, 0, 1, 1] }, undefined, { reply: () => true, fail: () => {} });
  }
  if (scale > 0) request(null); else resolveReady(false);
  stats.worker = calls?.running ?? false;
  // (227) a thin deck's map: the aureole's bake starts with the occlusion's (the pass re-bakes it if the battle's sun differs)
  if (scale > 0 && options.aureoleSun) wantAureole(options.aureoleSun);

  function poll(): void {
    const rects: SgoRect[] = [];
    for (let i = 0; i < records.length; i++) {
      if (!parts[i]) continue;
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
      cancelGround?.();
      groundWaits.length = 0;
      sgo.pending.length = 0;
      calls?.dispose(new Error('ground occlusion disposed'));
      texture.dispose();
      if (aur) { aur.pending.length = 0; aur.texture.dispose(); }
      resolveReady(false);
      aurResolve?.(false);
    },
    stats,
  };
}

