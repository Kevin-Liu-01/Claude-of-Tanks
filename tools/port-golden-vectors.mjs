#!/usr/bin/env node
/**
 * port-golden-vectors.mjs — the TypeScript simulation as the oracle for its
 * Rust port (docs/PORT-BEVY.md "Parity").
 *
 * Evaluates the ported functions on fixed inputs through the TypeScript
 * modules under src/ and writes the results, as exact doubles, to
 * crates/cot-sim/tests/golden/<module>.json. `cargo test -p cot-sim` reads the
 * same files and holds the Rust functions to the bits.
 *
 *   node tools/port-golden-vectors.mjs          # rewrite the vectors
 *   node tools/port-golden-vectors.mjs --check  # verify the committed vectors
 *                                                 (the receipt registered in
 *                                                 npm test)
 *
 * Numbers are emitted by JSON.stringify, whose shortest round-trip form
 * decodes to the identical double in serde_json (with its float_roundtrip
 * parser); a non-finite value is written as the string "NaN" / "Infinity" /
 * "-Infinity".
 *
 * The TypeScript runs on pinned math (tools/cot-sim-wasm.mjs pinMath: the
 * Rust port's own libm, compiled to WebAssembly, over Math.*), so the vectors
 * are the same on every engine and the Rust comparison proves the port's
 * operation order exactly. An engine's own Math.* differs from it, and from
 * other engines, by up to an ulp (tools/jsmath-conformance.mjs); the tool
 * reports how many vector doubles the engine's math would change.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Vector3 } from 'three';
import { mulberry32 } from '../src/game/stateCore.ts';
import { loadCotSimWasmNode, pinMath } from './cot-sim-wasm.mjs';
import { createTerrainContactSampler } from '../src/world/terrainContactSurface.ts';
import { createTerrainDeformation } from '../src/sim/terrainDeformation.ts';
import { createStructureSupportField } from '../src/sim/structureSupport.ts';
import { createHullFootprint, hullFootprint } from '../src/world/collision.ts';
import { createDedicatedWorldCollision } from '../server/dedicatedWorldCollision.ts';
import {
  GRAVITY_SCALE,
  GUIDED_MISSILE_TURN_RATE_RAD_S,
  SHELL_MAX_LIFETIME_S,
  aimElevationRad,
  applyDispersion,
  createShell,
  guideShellToward,
  penAtDistanceMm,
  shellGravityMps2,
  solveBallisticGunLay,
  stepShell,
} from '../src/sim/ballistics.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'crates', 'cot-sim', 'tests', 'golden');
const CHECK = process.argv.includes('--check');

const num = (v) => (Number.isFinite(v) ? v : Object.is(v, NaN) ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity');
const vec = (v) => ({ x: num(v.x), y: num(v.y), z: num(v.z) });
const sha = (rel) => createHash('sha256').update(readFileSync(path.join(ROOT, rel))).digest('hex');

// ---------------------------------------------------------------- rng ------
function rngVectors() {
  const seeds = [0, 1, -1, 1337, 2001, 2002, 3000, 4000, 5000, 6000, 123456789,
    2147483647, -2147483648, 4294967296, 4294967297, 1e20, 0.9, -7.9, 21000, 52000];
  return {
    source: 'src/game/stateCore.ts',
    sourceSha256: sha('src/game/stateCore.ts'),
    cases: seeds.map((seed) => {
      const r = mulberry32(seed);
      const draws = [];
      for (let i = 0; i < 48; i++) draws.push(r());
      return { seed, draws };
    }),
  };
}

// --------------------------------------------------------- ballistics ------
function ballisticsVectors() {
  const specs = {
    apfsds: { velocityMps: 1750, pen100Mm: 640, pen1000Mm: 590, pen2000Mm: 540, caliberMm: 120 },
    heat: { velocityMps: 1140, pen100Mm: 480, pen1000Mm: 480, caliberMm: 120 },
    he: { velocityMps: 800, pen100Mm: 60, pen1000Mm: 60, caliberMm: 125 },
    atgm: { velocityMps: 300, guided: true, pen100Mm: 800, pen1000Mm: 800, guidanceTurnRateRadS: 1.6 },
    atgmDefault: { velocityMps: 260, guided: true, pen100Mm: 700, pen1000Mm: 700 },
    lob: { velocityMps: 240, gravityScale: 0.5, pen100Mm: 90, pen1000Mm: 80 },
    negScale: { velocityMps: 900, gravityScale: -2, pen100Mm: 200, pen1000Mm: 150 },
    nanScale: { velocityMps: 900, gravityScale: NaN, pen100Mm: 200, pen1000Mm: 150 },
    zeroFar: { velocityMps: 900, pen100Mm: 200, pen1000Mm: 150, pen2000Mm: 0 },
    slow: { velocityMps: 40, pen100Mm: 30, pen1000Mm: 20 },
    // b9d6a7f4ff (the battle modes): an FPV drone's flight-time limit, and a NaN one that never expires
    drone: { velocityMps: 60, maxLifetimeS: 4, pen100Mm: 10, pen1000Mm: 10 },
    nanLife: { velocityMps: 300, maxLifetimeS: NaN, pen100Mm: 50, pen1000Mm: 40 },
  };
  const distances = [0, 50, 100, 250, 500, 999, 1000, 1000.5, 1001, 1500, 2000, 2500, 3000, -50];
  const dt = 1 / 60;

  const gravity = Object.entries(specs).map(([name, spec]) => ({ spec: name, expect: num(shellGravityMps2(spec)) }));
  gravity.push({ spec: null, expect: num(shellGravityMps2(null)) });

  const pen = [];
  for (const [name, spec] of Object.entries(specs)) {
    for (const distM of distances) pen.push({ spec: name, distM, expect: num(penAtDistanceMm(spec, distM)) });
  }

  const elevation = [];
  for (const distM of [10, 100, 400, 1000, 2500, 8000, 60000]) {
    for (const v of [40, 240, 800, 1140, 1750]) elevation.push({ distM, velocityMps: v, expect: num(aimElevationRad(distM, v)) });
  }

  const muzzle = new Vector3(12.5, 2.3, -8.75);
  const aims = [
    [412.0, 1.1, 260.0], [-300.5, 40.0, 1200.0], [12.5, 2.3, -8.75], [12.5, 30.0, -8.75],
    [1800.0, -20.0, 1800.0], [60.0, 6.0, 60.0], [-4500.0, 900.0, 100.0],
  ];
  const lay = [];
  const out = new Vector3();
  for (const [name, spec] of Object.entries(specs)) {
    for (const a of aims) {
      const aim = new Vector3(...a);
      out.set(0, 0, 0);
      const ok = solveBallisticGunLay(out, muzzle, aim, spec);
      lay.push({ spec: name, muzzle: vec(muzzle), aim: vec(aim), ok, out: vec(out) });
    }
  }
  out.set(0.1, 0.2, 0.3);
  lay.push({ spec: 'apfsds', muzzle: vec(muzzle), aim: null, ok: solveBallisticGunLay(out, muzzle, null, specs.apfsds), out: vec(out) });

  const flights = [];
  const dirs = [[0.7, 0.05, 0.71], [0, 1, 0], [-0.2, 0.3, 0.9], [1, 0, 0]];
  for (const [name, spec] of Object.entries(specs)) {
    for (const d of dirs) {
      const dir = new Vector3(...d).normalize();
      const shell = createShell(spec, 'p1', name === 'apfsds', muzzle, dir, 7);
      const samples = [];
      const record = (step) => samples.push({ step, pos: vec(shell.pos), prevPos: vec(shell.prevPos), vel: vec(shell.vel), ageS: num(shell.ageS), distM: num(shell.distM), dead: shell.dead });
      record(0);
      for (let step = 1; step <= 370; step++) {
        stepShell(shell, dt);
        if (step === 1 || step === 2 || step === 30 || step === 120 || step === 240 || step === 241 || step === 359 || step === 360 || step === 361 || step === 370) record(step);
      }
      flights.push({ spec: name, dir: vec(dir), gravityMps2: num(shell.gravityMps2), samples });
    }
  }

  const guidance = [];
  for (const name of ['atgm', 'atgmDefault', 'apfsds']) {
    const spec = specs[name];
    const shell = createShell(spec, 'p2', false, muzzle, new Vector3(0, 0, 1), 9);
    const cursor = new Vector3(180, 25, 420);
    const samples = [];
    for (let step = 1; step <= 240; step++) {
      const applied = guideShellToward(shell, cursor, dt);
      stepShell(shell, dt);
      if (step === 1 || step === 5 || step === 60 || step === 120 || step === 240) samples.push({ step, applied, pos: vec(shell.pos), vel: vec(shell.vel) });
    }
    guidance.push({ spec: name, cursor: vec(cursor), samples });
  }
  {
    const shell = createShell(specs.atgm, 'p2', false, muzzle, new Vector3(0, 0, 1), 10);
    guidance.push({ spec: 'atgm-null-aim', cursor: null, samples: [{ step: 1, applied: guideShellToward(shell, null, dt), pos: vec(shell.pos), vel: vec(shell.vel) }] });
    const back = createShell(specs.atgm, 'p2', false, muzzle, new Vector3(0, 0, 1), 11);
    const behind = new Vector3(muzzle.x, muzzle.y, muzzle.z - 100);
    guidance.push({ spec: 'atgm-antiparallel', cursor: vec(behind), samples: [{ step: 1, applied: guideShellToward(back, behind, dt), pos: vec(back.pos), vel: vec(back.vel) }] });
  }

  const dispersion = [];
  for (const seed of [6000, 6001, 6002, 6003, 42]) {
    for (const [dx, dy, dz] of [[0, 0, 1], [0.6, 0.1, 0.79], [0, 0.995, 0.1], [0, -1, 0]]) {
      for (const sigma of [0.002, 0.0125, 0.03]) {
        const rng = mulberry32(seed);
        const dir = new Vector3(dx, dy, dz).normalize();
        const before = vec(dir);
        // Pull 8 shots from one generator so the re-placement branch is exercised.
        const shots = [];
        for (let i = 0; i < 8; i++) {
          dir.set(dx, dy, dz).normalize();
          applyDispersion(dir, sigma, rng);
          shots.push(vec(dir));
        }
        dispersion.push({ seed, dir: before, sigmaRad: sigma, shots });
      }
    }
  }
  {
    const dir = new Vector3(0, 0, 1);
    applyDispersion(dir, 0, mulberry32(1));
    dispersion.push({ seed: 1, dir: { x: 0, y: 0, z: 1 }, sigmaRad: 0, shots: [vec(dir)] });
  }

  return {
    source: 'src/sim/ballistics.ts',
    sourceSha256: sha('src/sim/ballistics.ts'),
    constants: { GRAVITY_SCALE, SHELL_MAX_LIFETIME_S, GUIDED_MISSILE_TURN_RATE_RAD_S, dt },
    specs: Object.fromEntries(Object.entries(specs).map(([name, spec]) => [name,
      Object.fromEntries(Object.entries(spec).map(([field, value]) => [field, typeof value === 'number' ? num(value) : value]))])),
    cases: { gravity, pen, elevation, lay, flights, guidance, dispersion },
  };
}

// ------------------------------------------------------------ contact ------
// A steep analytic surface (crests along x - z = const, cusped, so many cells are steep convex folds and some take the
// a-d split): the Rust test evaluates the same expression on its pinned math and fills its lattice lazily from it.
const steepHeight = (x, z) => 30 * Math.sin(x * 0.05) * Math.cos(z * 0.04) - 12 * Math.abs(Math.sin((x - z) * 0.9)) + 0.25 * x;
function contactVectors() {
  const sampler = createTerrainContactSampler(steepHeight);
  const points = [];
  for (let i = 0; i < 6000; i++) points.push([-60 + ((i * 0.6180339887498949) % 1) * 120, -40 + ((i * 0.7548776662466927) % 1) * 80]);
  // the square's edges and corners, just off it, chunk seams, vertices, cell seams in Float32 and non-finite input
  for (const v of [-512, 512, -512.0000001, 512.0000001, -384, 0, 128, 255.99999999999997, 256, 1.3333333333333333, 1.3333333730697632, 1.333333]) {
    points.push([v, 10.1], [10.1, v], [v, v]);
  }
  points.push([NaN, 1], [1, Infinity], [-Infinity, 0], [600, -700]);
  let flipped = 0;
  const cases = points.map(([x, z]) => {
    const expect = sampler(x, z);
    const flip = sampler.cellFlippedAt(x, z);
    if (flip) flipped++;
    return { x: num(x), z: num(z), expect: num(expect), flipped: flip };
  });
  return { source: 'src/world/terrainContactSurface.ts', sourceSha256: sha('src/world/terrainContactSurface.ts'),
    surface: steepHeight.toString(), flippedSamples: flipped, cases };
}

// -------------------------------------------------------- deformation ------
// A battle's ground as a script: craters (overlapping ones that fill a bucket, one refused for a zero radius, some at the
// map's edge), heaps on and off the clock, two graded courses, the clock stepped while heaps rise, a reset and a crater
// after it. After each phase every point reads offsetAt and contactOffsetAt both ways; the Rust replays the script.
function deformationVectors() {
  const overlay = createTerrainDeformation();
  const rng = mulberry32(253);
  const ops = [];
  const reads = [];
  const points = [];
  for (let i = 0; i < 700; i++) points.push([-140 + rng() * 280, -120 + rng() * 240]);
  for (const v of [-512, 512, -511.9, 511.9, -512.0000001, 512.0000001, 0, 1.3333333333333333, 16, -16, 15.999999999999998]) points.push([v, 3.3], [3.3, v], [v, v]);
  points.push([NaN, 1], [1, NaN], [Infinity, 2], [2, -Infinity], [600, -700]);
  const read = (phase) => {
    for (const [x, z] of points) {
      reads.push({ phase, x: num(x), z: num(z), offset: num(overlay.offsetAt(x, z)), contact: num(overlay.contactOffsetAt(x, z, false)),
        contactFlipped: num(overlay.contactOffsetAt(x, z, true)), near: overlay.near(x, z) });
    }
  };
  const op = (entry, run) => { const result = run(); ops.push({ ...entry, result: typeof result === 'boolean' ? result : null }); };
  op({ op: 'setTime', t: 5 }, () => overlay.setTime(5));
  for (let i = 0; i < 48; i++) {
    const x = i < 10 ? 20.5 + rng() * 3 : -120 + rng() * 240, z = i < 10 ? -10.5 + rng() * 3 : -100 + rng() * 200;
    const radius = i === 11 ? 0 : 0.5 + rng() * 3.5, depth = 0.2 + rng() * 1.4, rim = rng() * 0.6, seed = Math.floor(rng() * 4294967296);
    op({ op: 'crater', x, z, radius, depth, rim, seed }, () => overlay.addCrater(x, z, radius, depth, rim, seed));
  }
  for (const [x, z] of [[509.5, 3], [-510.25, -509], [3, 511.75]]) op({ op: 'crater', x, z, radius: 2.5, depth: 0.8, rim: 0.3, seed: 77 }, () => overlay.addCrater(x, z, 2.5, 0.8, 0.3, 77));
  read(0);
  const heaps = [[60, 40, 6, 9, 0.4, 1.8, 4.5], [-70, 55, 12, 7.5, -1.1, 2.6, undefined], [10, -80, 4, 4, 2.9, 0.9, 5.2], [-30, -40, 15, 20, 0.05, 3.2, undefined], [90, -60, 7, 3, 1.57, 1.2, 4.9]];
  for (const [cx, cz, hw, hd, yaw, h, t0] of heaps) op({ op: 'rubble', cx, cz, hw, hd, yaw, h, t0: t0 === undefined ? null : t0 }, () => overlay.addRubble(cx, cz, hw, hd, yaw, h, t0));
  const course = (cx, cz, yaw, hw, skirtM, profile) => {
    const stamp = { kind: 'course', cx, cz, yaw, c: Math.cos(yaw), s: Math.sin(yaw), hw, skirtM, profile: Float64Array.from(profile) };
    op({ op: 'course', cx, cz, c: stamp.c, s: stamp.s, hw, skirtM, profile }, () => overlay.addCourse(stamp));
  };
  course(-100, 90, 0.7, 4, 3, [-30, 0, -20, 1.5, -10, 1.5, -5, -0.8, 0, 0.6, 6, 0.6, 12, 2.5, 30, 0]);
  course(110, 100, -2.2, 2.5, 6, [-12, 0, 12, 0.4]);
  read(1);
  for (const t of [5.6, 6.3, 6.3, 7.1, 9]) { op({ op: 'setTime', t }, () => overlay.setTime(t)); read(2); }
  op({ op: 'reset' }, () => overlay.reset());
  read(3);
  op({ op: 'crater', x: 4, z: 4, radius: 3, depth: 1, rim: 0.4, seed: 4242 }, () => overlay.addCrater(4, 4, 3, 1, 0.4, 4242));
  read(4);
  return { source: 'src/sim/terrainDeformation.ts', sourceSha256: sha('src/sim/terrainDeformation.ts'), ops, reads,
    revision: overlay.revision, maxRaiseM: num(overlay.maxRaiseM) };
}

// ---------------------------------------------------- structure support ------
// Hulls placed over real battlefields' records (Urban's roofed buildings, Titan Gorge's drawn-top stones, Verdant), their
// belly lines a metre under to half a metre over the tops, half of them posed (pitched and rolled footprints): each
// hull's candidates as the obstacle grid gave them, whether it stands on a deck, and structureTopAt over a 7 x 7 grid
// about it (the ground under each point given). A few records are marked crushed or dead. The records referenced are
// written out whole, so the Rust builds the same table without the manifests.
function structureSupportVectors() {
  const rng = mulberry32(2531);
  const records = new Map();
  const encodePart = (part) => {
    if (!part) return null;
    const y = part.y0 !== undefined ? [num(part.y0), num(part.y1)] : null;
    if (part.kind === 'obb') return { kind: 'obb', cx: num(part.cx), cz: num(part.cz), hw: num(part.hw), hl: num(part.hl), yaw: num(part.yaw), y };
    if (part.kind === 'circle') return { kind: 'circle', cx: num(part.cx), cz: num(part.cz), r: num(part.r), y };
    return { kind: 'convex', points: part.points.map(num), tp: part.tp ? part.tp.map(num) : null, y };
  };
  const encode = (record) => {
    const shape = record.shape2;
    return { min: record.min.map(num), max: record.max.map(num), crushable: !!record.crushable,
      wreck: record.kind === 'tank-wreck' || record.kind === 'tram-wreck', crushed: !!record.crushed, dead: !!record.dead,
      shape: !shape ? null : shape.kind === 'compound' ? { compound: shape.parts.map(encodePart) } : { simple: encodePart(shape) } };
  };
  const hulls = [];
  const rect = { centerX: 0.02, centerZ: 0.2, halfLength: 3.6, halfWidth: 1.75, frontLiftM: 0.45, rearLiftM: 0.3 };
  for (const [mapId, count] of [['urban', 40], ['titan_gorge', 30], ['verdant', 20]]) {
    const world = createDedicatedWorldCollision(mapId);
    const obstacles = [...new Set(world.getObstacles())];
    const index = new Map(obstacles.map((record, i) => [record, i]));
    const field = createStructureSupportField(world.heightField, { queryObstacles: world.queryObstacles.bind(world) });
    // the records worth standing on: buildings' compounds and drawn tops, then anything tall
    const interesting = obstacles.filter((r) => (r.shape2?.kind === 'compound' || (r.shape2?.kind === 'convex' && r.shape2.tp)) && !r.crushable);
    for (let k = 0; k < 6; k++) { const r = obstacles[Math.floor(rng() * obstacles.length)]; if (k % 2) r.crushed = true; else r.dead = true; }
    for (let h = 0; h < count; h++) {
      const target = interesting[Math.floor(rng() * interesting.length)];
      const x = target.min[0] + rng() * (target.max[0] - target.min[0]), z = target.min[2] + rng() * (target.max[2] - target.min[2]);
      const belly = target.max[1] - 1 + rng() * 1.5 - (h % 5 === 0 ? 4 : 0);
      let pose = null;
      if (h % 2) {
        pose = hullFootprint(rect, x, z, rng() * Math.PI * 2, (rng() - 0.5) * 0.6, (rng() - 0.5) * 0.4, createHullFootprint());
        if (h % 7 === 1) { pose.riseAlong = 2.5; } // past POSED_RISE_MAX: the root's belly decides
      }
      field.beginHull(x, z, belly, pose);
      const candidates = [];
      world.queryObstacles(x - 6, z - 6, x + 6, z + 6, candidates);
      const candidateIds = candidates.map((r) => index.get(r));
      for (const id of candidateIds) if (!records.has(`${mapId}:${id}`)) records.set(`${mapId}:${id}`, encode(obstacles[id]));
      const samples = [];
      for (let a = 0; a < 7; a++) for (let b = 0; b < 7; b++) {
        const sx = x + (a - 3) * 1.6 + (rng() - 0.5) * 0.3, sz = z + (b - 3) * 1.6 + (rng() - 0.5) * 0.3;
        const ground = world.heightField.getHeightAt(sx, sz);
        samples.push([num(sx), num(sz), num(ground), num(field.getHeightAt(sx, sz))]);
      }
      hulls.push({ map: mapId, x: num(x), z: num(z), belly: num(belly),
        pose: pose ? Object.fromEntries(Object.entries(pose).filter(([key]) => key !== 'clearBottom').map(([key, value]) => [key, num(value)])) : null,
        candidates: candidateIds, standing: field.standingDeck, samples });
    }
    world.release?.();
  }
  return { source: 'src/sim/structureSupport.ts', sourceSha256: sha('src/sim/structureSupport.ts'),
    collisionSha256: sha('src/world/collision.ts'), records: Object.fromEntries(records), hulls };
}

// --------------------------------------------------------------- main ------
const generate = () => ({ rng: rngVectors(), ballistics: ballisticsVectors(), contact: contactVectors(), deformation: deformationVectors(), structureSupport: structureSupportVectors() });
const engineModules = generate();
const restoreMath = pinMath(await loadCotSimWasmNode());
let modules;
try {
  modules = generate();
} finally {
  restoreMath();
}
{
  // how many vector doubles the engine's own Math.* would change
  let numbers = 0, changed = 0;
  const walk = (a, b) => {
    if (typeof a === 'number') { numbers++; if (!Object.is(a, b)) changed++; return; }
    if (a && typeof a === 'object') for (const key of Object.keys(a)) walk(a[key], b?.[key]);
  };
  walk(modules, engineModules);
  console.log(`[port-golden] pinned math; this engine's Math.* (V8 ${process.versions.v8}, ${process.arch}) would change ${changed} of ${numbers} doubles`);
}
mkdirSync(OUT_DIR, { recursive: true });
let drift = 0;
for (const [name, data] of Object.entries(modules)) {
  const file = path.join(OUT_DIR, `${name}.json`);
  const text = `${JSON.stringify({ generator: 'tools/port-golden-vectors.mjs', math: 'pinned (crates/cot-sim-wasm jsmath)', ...data }, null, 1)}\n`;
  if (CHECK) {
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (current !== text) {
      drift += 1;
      console.error(`[port-golden] ${path.relative(ROOT, file)} differs from the TypeScript source of truth`);
    }
  } else {
    writeFileSync(file, text);
    console.log(`[port-golden] wrote ${path.relative(ROOT, file)} (${text.length} bytes)`);
  }
}
if (CHECK) {
  if (drift) {
    console.error(`[port-golden] ${drift} golden file(s) drifted: run \`node tools/port-golden-vectors.mjs\` and re-run \`cargo test -p cot-sim\``);
    process.exit(1);
  }
  console.log('[port-golden] committed golden vectors match the TypeScript modules');
}
