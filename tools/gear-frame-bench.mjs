#!/usr/bin/env node
// Per-frame running-gear cost in node (no browser): a 16-tank battle mix on rough ground. Every frame each gear unit
// conforms to ground that scrolls under it at 12 m/s (a 0.35 m swell and a 0.12 m ripple, so wheels reach their stops
// and the top run lifts) and updates its bands, as a visible tank does in battle. First-party tooling: Kevin B. Liu.
//
//   node tools/gear-frame-bench.mjs [--root=<abs checkout>] [--label=x]       timing + bytes allocated per frame
//   node tools/gear-frame-bench.mjs --poses=<out.json> [--root=...]           pose digests over a fixed scenario
//   node tools/gear-frame-bench.mjs --alloc-sites=15 [--root=...]             top allocation sites (sampling profiler)
//   --ids=a,b,c replaces the 16-tank mix (GEAR_BENCH_IDS).
//
// Timing belongs under the capture lock: node tools/timing-gate.mjs -- node tools/with-capture-lock.mjs
// --lock-class=timing --place <lane> -- node tools/gear-frame-bench.mjs ... (gear-alloc-279, 2026-11-26).
// --root points the bench at another checkout (a frozen baseline), so one copy of this file measures both arms.
// The process re-runs itself with --expose-gc and a 512 MB semi-space: no scavenge can fall inside the window
// that counts heap growth, so heapUsed growth over it is the bytes the frames allocated.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const SELF = fileURLToPath(import.meta.url);
export const GEAR_BENCH_IDS = ['mbt70', 'stb1', 'type74', 'strv103b', 'udes03', 'leclerc_s1', 'challenger2',
  'k2_black_panther', 'm1a1_abrams_hc', 't90am', 'leopard2_proto', 'merkava4', 't72b3m_2022', 'type10', 'osorio_p1',
  'redback'];
// the pose receipt adds a tank whose shoes ride the band's own centre line off rigid chords (merkava3d), so both shoe
// samplers' carriers are compared
export const GEAR_POSE_IDS = [...GEAR_BENCH_IDS, 'merkava3d'];
const NODE_FLAGS = ['--expose-gc', '--max-semi-space-size=512'];

export function parseOptions(args) {
  const { values } = parseArgs({ args, options: {
    root: { type: 'string' }, label: { type: 'string', default: 'run' },
    warm: { type: 'string', default: '300' }, frames: { type: 'string', default: '1200' },
    'alloc-frames': { type: 'string', default: '200' }, poses: { type: 'string' },
    'pose-frames': { type: 'string', default: '320' }, 'alloc-sites': { type: 'string' }, ids: { type: 'string' },
  } });
  const root = resolve(values.root ?? resolve(dirname(SELF), '..'));
  if (!isAbsolute(root)) throw new Error('--root must resolve to an absolute path');
  const int = (name) => {
    const n = Number(values[name]);
    if (!Number.isInteger(n) || n < 1) throw new Error(`--${name} must be a positive integer`);
    return n;
  };
  const ids = values.ids ? values.ids.split(',').filter(Boolean) : (values.poses ? GEAR_POSE_IDS : GEAR_BENCH_IDS);
  if (!ids.length) throw new Error('--ids names no tank');
  return { root, ids, label: values.label, warm: int('warm'), frames: int('frames'), allocFrames: int('alloc-frames'),
    poses: values.poses ? resolve(values.poses) : null, poseFrames: int('pose-frames'),
    allocSites: values['alloc-sites'] === undefined ? 0 : int('alloc-sites') };
}

/** Rank by p50/p95 the way the summary line prints them. */
export function percentiles(times) {
  const sorted = Float64Array.from(times).sort();
  const n = sorted.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += sorted[i];
  return { mean: sum / n, p50: sorted[n >> 1], p95: sorted[Math.floor(n * 0.95)] };
}

/** The 16-tank rig: every buildRunningGear unit with the floor its sampler rests on. */
async function buildRig(root, ids) {
  await import(pathToFileURL(resolve(root, 'tools/tank-surface-collect.mjs')).href);
  const THREE = await import(pathToFileURL(resolve(root, 'node_modules/three/build/three.module.js')).href);
  const { createTank } = await import(pathToFileURL(resolve(root, 'src/vehicles/tankFactory.ts')).href);
  const { KIT } = await import(pathToFileURL(resolve(root, 'src/vehicles/tankFactoryCore.ts')).href);
  const built = [];
  const build = KIT.buildRunningGear;
  KIT.buildRunningGear = (P, cfg) => { const gear = build(P, cfg); built.push({ gear, hullG: P.hullG }); return gear; };
  const units = [];
  try {
    for (const id of ids) {
      built.length = 0;
      createTank(id, null, { proceduralOnly: true, quality: 'high' });
      for (const u of built) {
        const s = u.hullG.scale.y;
        units.push({ id, gear: u.gear, hullG: u.hullG, s, floor: u.gear.contactGeom.bottomYM * s + u.hullG.position.y });
      }
    }
  } finally {
    KIT.buildRunningGear = build;
  }
  return { THREE, units };
}

/** One frame driver over the rig: the same ground and the same calls for every arm. */
function makeFrame(THREE, units) {
  const state = { pos: new THREE.Vector3(), yaw: 0, visualPitch: 0, visualRoll: 0 };
  let phase = 0;
  let cur = units[0];
  const sampler = (x, z) => cur.floor + (0.35 * Math.sin(0.9 * (z + phase)) + 0.12 * Math.sin(3.1 * (z + phase) + 1.3 * x)) * cur.s;
  return (f) => {
    phase = f * 0.2;
    for (let i = 0; i < units.length; i++) {
      cur = units[i];
      cur.gear.conform(state, sampler, 0, 0, 1 / 60);
      cur.gear.update(phase, phase, 1 / 60);
    }
  };
}

/** Every pose the gear owns under a hull: object transforms, instance and batch matrices, and every buffer attribute. */
function poseDigest(hullG) {
  const hash = createHash('sha256');
  const f64 = new Float64Array(11);
  hullG.traverse((o) => {
    f64[0] = o.position.x; f64[1] = o.position.y; f64[2] = o.position.z;
    f64[3] = o.quaternion.x; f64[4] = o.quaternion.y; f64[5] = o.quaternion.z; f64[6] = o.quaternion.w;
    f64[7] = o.scale.x; f64[8] = o.scale.y; f64[9] = o.scale.z; f64[10] = o.visible ? 1 : 0;
    hash.update(o.name); hash.update(new Uint8Array(f64.buffer));
    if (o.instanceMatrix) hash.update(new Uint8Array(o.instanceMatrix.array.buffer, o.instanceMatrix.array.byteOffset, o.instanceMatrix.array.byteLength));
    if (o.count !== undefined) hash.update(String(o.count));
    const tex = o._matricesTexture?.image?.data;
    if (tex) hash.update(new Uint8Array(tex.buffer, tex.byteOffset, tex.byteLength));
    const attrs = o.geometry?.attributes;
    if (attrs) for (const key of Object.keys(attrs).sort()) {
      const a = attrs[key].array ?? attrs[key].data?.array;
      if (a) { hash.update(key); hash.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); }
    }
    const map = o.material?.map;
    if (map?.offset && map.repeat) { f64[0] = map.offset.x; f64[1] = map.offset.y; f64[2] = map.repeat.x; f64[3] = map.repeat.y; hash.update(new Uint8Array(f64.buffer, 0, 32)); }
  });
  return hash.digest('hex');
}

async function runPoses(opts) {
  const { THREE, units } = await buildRig(opts.root, opts.ids);
  // A fixed scenario wider than the timing frame: the hull moves, yaws, pitches and rolls, the two sides scroll apart and
  // the step varies, so the receipt reaches conform's attitude and settle branches as well as the band pass; the left
  // tracks are thrown for a stretch and repaired; the last 80 frames are flat, so every wheel settles back to rest (the
  // relays' at-rest restore); then resetPose. Every gear-owned pose is hashed every 10th frame.
  const state = { pos: new THREE.Vector3(), yaw: 0, visualPitch: 0, visualRoll: 0 };
  let phase = 0, flat = false;
  let cur = units[0];
  const sampler = (x, z) => cur.floor + (flat ? 0 : (0.35 * Math.sin(0.9 * (z + phase)) + 0.12 * Math.sin(3.1 * (z + phase) + 1.3 * x)) * cur.s);
  const frames = [];
  const sample = (f) => frames.push({ frame: f, digests: units.map((u) => poseDigest(u.hullG)) });
  for (let f = 0; f < opts.poseFrames; f++) {
    flat = f >= opts.poseFrames - 80;
    phase = f * 0.2;
    const dt = f % 7 === 3 ? 1 / 30 : 1 / 60;
    if (!flat) {
      state.pos.set(0.3 * Math.sin(f * 0.05), 0.02 * Math.sin(f * 0.11), f * 0.1);
      state.yaw = 0.4 * Math.sin(f * 0.03);
    }
    const pitch = flat ? 0 : 0.06 * Math.sin(f * 0.07), roll = flat ? 0 : 0.04 * Math.cos(f * 0.09);
    const thrown = f >= 60 && f < 90;
    for (let i = 0; i < units.length; i++) {
      cur = units[i];
      if (f === 60 || f === 90) cur.gear.setBroken?.('trackL', thrown);
      cur.gear.conform(state, sampler, pitch, roll, dt, f % 5 === 0 ? 0.9 : 1);
      cur.gear.update(phase, phase * 0.97 + 0.1, dt);
    }
    if (f % 10 === 9 || f === opts.poseFrames - 1) sample(f);
  }
  for (const u of units) u.gear.resetPose?.();
  sample(-1);
  const all = createHash('sha256').update(JSON.stringify(frames)).digest('hex');
  writeFileSync(opts.poses, `${JSON.stringify({ protocol: 'gear-frame-poses-v2', ids: opts.ids, units: units.length, digest: all, frames }, null, 1)}\n`);
  console.log(`${opts.label}: poses ${units.length} gear units / ${opts.ids.length} tanks, ${frames.length} sampled frames, digest ${all}`);
}

async function runAllocSites(opts) {
  const { Session } = await import('node:inspector/promises');
  const { THREE, units } = await buildRig(opts.root, opts.ids);
  const frame = makeFrame(THREE, units);
  for (let f = 0; f < opts.warm; f++) frame(f);
  const session = new Session();
  session.connect();
  await session.post('HeapProfiler.enable');
  await session.post('HeapProfiler.startSampling', { samplingInterval: 256,
    includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  for (let f = 0; f < opts.allocFrames; f++) frame(opts.warm + f);
  const { profile } = await session.post('HeapProfiler.stopSampling');
  session.disconnect();
  const sites = new Map();
  const walk = (node) => {
    const cf = node.callFrame;
    const key = `${cf.functionName || '(anon)'} ${cf.url.replace(/^.*\/(src|node_modules)\//, '$1/')}:${cf.lineNumber + 1}:${cf.columnNumber + 1}`;
    const self = node.selfSize;
    if (self) sites.set(key, (sites.get(key) ?? 0) + self);
    for (const c of node.children) walk(c);
  };
  walk(profile.head);
  const top = [...sites].sort((a, b) => b[1] - a[1]).slice(0, opts.allocSites);
  const total = [...sites.values()].reduce((a, b) => a + b, 0);
  console.log(`${opts.label}: sampled ${(total / opts.allocFrames / 1024).toFixed(1)} KB/frame over ${opts.allocFrames} frames`);
  for (const [k, v] of top) console.log(`  ${(v / opts.allocFrames).toFixed(0).padStart(8)} B/frame  ${k}`);
}

async function runTiming(opts) {
  const { THREE, units } = await buildRig(opts.root, opts.ids);
  const frame = makeFrame(THREE, units);
  for (let f = 0; f < opts.warm; f++) frame(f);
  const times = new Float64Array(opts.frames);
  for (let f = 0; f < opts.frames; f++) {
    const t0 = process.hrtime.bigint();
    frame(opts.warm + f);
    times[f] = Number(process.hrtime.bigint() - t0) / 1e6;
  }
  const { mean, p50, p95 } = percentiles(times);
  globalThis.gc();
  const h0 = process.memoryUsage().heapUsed;
  const base = opts.warm + opts.frames;
  for (let f = 0; f < opts.allocFrames; f++) frame(base + f);
  const bytesPerFrame = (process.memoryUsage().heapUsed - h0) / opts.allocFrames;
  const record = { label: opts.label, root: opts.root, units: units.length, tanks: opts.ids.length,
    frames: opts.frames, meanMs: +mean.toFixed(4), p50Ms: +p50.toFixed(4), p95Ms: +p95.toFixed(4),
    bytesPerFrame: Math.round(bytesPerFrame) };
  console.log(`${opts.label}: ${units.length} gear units / ${opts.ids.length} tanks, ${opts.frames} frames: mean ${mean.toFixed(3)} ms/frame, `
    + `p50 ${p50.toFixed(3)}, p95 ${p95.toFixed(3)}, heap ${(bytesPerFrame / 1e6).toFixed(3)} MB/frame`);
  console.log(`GEAR_BENCH ${JSON.stringify(record)}`);
}

async function main(args) {
  const opts = parseOptions(args);
  if (typeof globalThis.gc !== 'function') {
    const child = spawnSync(process.execPath, [...NODE_FLAGS, ...process.execArgv, SELF, ...args], { stdio: 'inherit' });
    process.exit(child.status ?? 1);
  }
  if (opts.poses) await runPoses(opts);
  else if (opts.allocSites) await runAllocSites(opts);
  else await runTiming(opts);
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) await main(process.argv.slice(2));
