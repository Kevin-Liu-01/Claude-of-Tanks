// src/world/maps/regional/shedFall.ts — how an open shed comes down (props census #17: barns, woodsheds and yard sheds;
// the looks lane's vernacular sub-stream, 2026-10-15).
//
// The judges on every kit's woodshed: "destroyed by destructionDefaultKit (bucket bounding-box spalls, a generic breach
// rim and a chunk heap), not its own members"; the family's spec: "open sheds get an open-shed fracture (boards and frame
// as pieces)". An open shed (outbuildings.ts openShed) has no wall a round holes: a blow passes between its posts and
// boards (the lattice reading: lattice.ts recordLattice carries the shed's own reading beside its posts). When it falls
// it racks over along the blow: every post snaps a little over its pad and its length lies along the fall; the roof comes
// down in two or three lengths of its deck with the rafters still nailed under them, their low edges on the ground and
// their high edges propped on the wall plate and the stacked wood; the boarded back swings over onto the heap and leans
// there, an end lies flat where it fell and the other leans; a stone back stands to a ragged top over its own stones;
// the stack spills its logs out of the front. Deterministic in the seed; the shed's own colours and its kit's tints.
import {
  damageRng,
  type DamageMeshWriter, type DamagePieceWriter, type DamageStageResult, type Rgb, type StructureDamageAnatomy, type Vec3,
} from '../../destructionKit.ts';
import { HEAP_LIFT_M, Mesh, beamBetween, throwPieceAt, type MoundHeight } from './fracture.ts';
import type { PartSink, RegionalBucket } from './geometry.ts';
import { recordLattice } from './lattice.ts';
import { WEATHER_ROUTE, type WeatherTints } from './weather.ts';

/** An open shed as its builder laid it: its own frame in the building's, and the numbers its wreck is laid from. */
export interface ShedWreck {
  /** the shed's frame in the building's: its origin on the ground, its x (back to front) and z (along) axes */
  o: Vec3;
  ax: Vec3;
  az: Vec3;
  W: number;
  D: number;
  /** the rafters' pitch, the deck's underside at the front face, eaves, verges, the deck's thickness */
  pitchDeg: number;
  eaveY: number;
  eave: number;
  verge: number;
  deck: number;
  /** the posts' section and every post as [x, z, foot, head] in the shed's frame; the pads' size (0: none) and top */
  post: number;
  posts: Array<[number, number, number, number]>;
  pad: { size: number; top: number; bucket: RegionalBucket; colour: Rgb | null } | null;
  timber: Rgb;
  /** the cladding's tone and board width, the clad sides */
  boards: Rgb | null;
  boardW: number;
  back: boolean;
  ends: boolean;
  /** the covering's bucket and a coloured bucket's paint; its debris shape (null: a shed with no roof of its own) */
  roof: { bucket: RegionalBucket; colour: Rgb | null; shape: 'tile' | 'slate' | 'splinter' | 'sheet' | 'straw'; lattice?: boolean } | null;
  /**
   * masonry bodies of the build (a kažun's dry-stone round, an oven's dome on its block): each slumps into a heap of its
   * own stones round a ragged stub of its lowest courses, its radius and height, the shed's frame
   */
  masses?: ReadonlyArray<{ x: number; z: number; r: number; h: number; bucket: RegionalBucket }>;
  /** a doorway's lintel (a monolith over a dry-stone door): it falls across the doorway, its middle and length, its run */
  lintel?: { x: number; z: number; len: number; yaw: number } | null;
  /** a stone back wall: its bucket, thickness and top */
  stone: { bucket: RegionalBucket; t: number; top: number } | null;
  /** the stacked wood's height (0: none) */
  pile: number;
  /** a raised floor's height (the walls stand on it; its deck falls with them) and a gable roof (both long walls as low) */
  lift?: number;
  gable?: boolean;
}

/**
 * Record an open shed for the damage reading: its posts as a lattice's legs (feet and heads in the emitting frame, the
 * frame `sink.placed` has open), its reading beside them.
 */
export function recordShed(sink: PartSink, legs: Array<{ foot: Vec3; head: Vec3 }>, wreck: Omit<ShedWreck, 'o' | 'ax' | 'az'>): void {
  const o = sink.framePoint([0, 0, 0]), px = sink.framePoint([1, 0, 0]), pz = sink.framePoint([0, 0, 1]);
  const full: ShedWreck = { ...wreck, o, ax: [px[0] - o[0], 0, px[2] - o[2]], az: [pz[0] - o[0], 0, pz[2] - o[2]] };
  recordLattice(sink, legs, [Math.max(0.5, ...wreck.posts.map((p) => p[3]))], wreck.post, 'structureWood', wreck.timber, null, full);
}

type Writers = { mesh: DamageMeshWriter; pieces: DamagePieceWriter };
const DEG = Math.PI / 180;
const mulK = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];

/** The shed's wreck (latticeFall.ts collapseLattice hands an open shed's reading here). */
export function collapseShed(anatomy: StructureDamageAnatomy, shed: ShedWreck, seed: number, out: Writers, mound: MoundHeight): DamageStageResult {
  const rng = damageRng(seed);
  const mesh = new Mesh(out.mesh);
  const { W, D } = shed;
  const tints = (anatomy.kitPlan as { regional?: { tints?: WeatherTints } } | undefined)?.regional?.tints;
  const roofBucket = shed.roof ? WEATHER_ROUTE[shed.roof.bucket] ?? shed.roof.bucket : 'regionalRoof';
  const roofTint: Rgb = shed.roof?.colour ?? tints?.roof ?? [0.85, 0.85, 0.85];
  const stoneBucket = shed.stone ? WEATHER_ROUTE[shed.stone.bucket] ?? shed.stone.bucket : 'regionalStone';
  const padBucket = shed.pad ? WEATHER_ROUTE[shed.pad.bucket] ?? shed.pad.bucket : 'regionalStone';
  const stoneTint: Rgb = tints?.stone ?? [0.85, 0.85, 0.85];
  const timber = shed.timber, boardTint = shed.boards ?? timber;
  // the shed's frame into the building's
  const B = (x: number, y: number, z: number): Vec3 => [shed.o[0] + shed.ax[0] * x + shed.az[0] * z, y, shed.o[2] + shed.ax[2] * x + shed.az[2] * z];
  const ground = (x: number, z: number): number => {
    const p = B(x, 0, z), m = mound(p[0], p[2]);
    return m + HEAP_LIFT_M * Math.max(0, Math.min(1, (m - 0.12) / 0.5));
  };
  // the fall: the blow's line (the core's fall axis, building frame) in the shed's frame; else forward, out of its open side
  const given = (out as Writers & { fallAxis?: [number, number] }).fallAxis;
  let fx = 1, fz = 0;
  if (given && Math.hypot(given[0], given[1]) > 1e-3) {
    const gx = given[0] * shed.ax[0] + given[1] * shed.ax[2], gz = given[0] * shed.az[0] + given[1] * shed.az[2], l = Math.hypot(gx, gz) || 1;
    fx = gx / l; fz = gz / l;
  } else {
    const a = (rng() - 0.5) * 0.9;
    fx = Math.cos(a); fz = Math.sin(a);
  }
  // a shed racks over toward its open side or along its length: a blow from the front pushes it back onto its own back wall
  const along = Math.abs(fz) > 0.75;
  const fwd = along ? 0 : fx >= 0 ? 1 : -1;
  /** an oriented box in the shed's frame: centre, three unit axes and half sizes; its faces shaded by their facing */
  const box = (_bucket: string, c: Vec3, ux: Vec3, uy: Vec3, uz: Vec3, hx: number, hy: number, hz: number, tint: Rgb, grain = false): void => {
    if (!mesh.fits(24)) return;
    const P = (a: number, b: number, e: number): Vec3 => B(c[0] + ux[0] * a * hx + uy[0] * b * hy + uz[0] * e * hz, c[1] + ux[1] * a * hx + uy[1] * b * hy + uz[1] * e * hz,
      c[2] + ux[2] * a * hx + uy[2] * b * hy + uz[2] * e * hz);
    const N = (v: Vec3): Vec3 => { const p = B(v[0], 0, v[2]), o = B(0, 0, 0); return [p[0] - o[0], v[1], p[2] - o[2]]; };
    const faces: Array<[Vec3, Vec3, Vec3, Vec3, Vec3]> = [
      [P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), N(uy)],
      [P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), N([-uy[0], -uy[1], -uy[2]])],
      [P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1), N(ux)],
      [P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), N([-ux[0], -ux[1], -ux[2]])],
      [P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), N(uz)],
      [P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1), N([-uz[0], -uz[1], -uz[2]])],
    ];
    for (const [a, b, cc, d, n] of faces) {
      const k = 0.62 + 0.38 * Math.max(0, n[1]);
      if (grain) mesh.quadUvAlong(a, b, cc, d, n, 1, mulK(tint, k)); else mesh.quadUv(a, b, cc, d, n, 0.5, mulK(tint, k));
    }
  };
  /** a timber from a to b (the shed's frame), w x t, its broad face toward `up` */
  const beam = (a: Vec3, b: Vec3, w: number, t: number, up: Vec3, tint: Rgb): void => {
    const o = B(0, 0, 0), u = B(up[0], 0, up[2]);
    beamBetween(mesh, B(a[0], a[1], a[2]), B(b[0], b[1], b[2]), w, t, [u[0] - o[0], up[1], u[2] - o[2]], tint);
  };
  const turn = (x: number, z: number, yaw: number): [number, number] => [x * Math.cos(yaw) - z * Math.sin(yaw), x * Math.sin(yaw) + z * Math.cos(yaw)];
  const s = shed.post;
  let peak = 0;

  // ---- the stone back: standing to a ragged top in lengths, its stones at its foot
  if (shed.stone && mesh.begin(stoneBucket, 'remnant')) {
    const st = shed.stone, n = Math.max(3, Math.round(D / 1.1));
    for (let k = 0; k < n; k++) {
      const z0 = -D / 2 + D * k / n, z1 = -D / 2 + D * (k + 1) / n, top = st.top * (0.45 + rng() * 0.45);
      box(stoneBucket, [-W / 2 + st.t / 2, top / 2 - 0.2, (z0 + z1) / 2], [1, 0, 0], [0, 1, 0], [0, 0, 1], st.t / 2, top / 2 + 0.2, (z1 - z0) / 2 - 0.01, mulK(stoneTint, 0.9 + rng() * 0.15));
      peak = Math.max(peak, top);
    }
    for (let k = 0; k < 9; k++) {
      const x = -W / 2 + st.t + 0.15 + rng() * 0.8, z = (rng() - 0.5) * D, sz = 0.14 + rng() * 0.16, yaw = rng() * Math.PI;
      box(stoneBucket, [x, ground(x, z) + sz * 0.6, z], [Math.cos(yaw), 0, Math.sin(yaw)], [0, 1, 0], [-Math.sin(yaw), 0, Math.cos(yaw)], sz * 1.3, sz * 0.7, sz, mulK(stoneTint, 0.85 + rng() * 0.2));
    }
  }
  mesh.end();

  // ---- the masonry bodies: a ragged ring of their lowest courses, their stones heaped inside and out, a lintel down
  for (const m of shed.masses ?? []) {
    const bucket = WEATHER_ROUTE[m.bucket] ?? m.bucket, tint: Rgb = m.bucket === 'stone' ? stoneTint : tints?.plaster ?? [0.85, 0.85, 0.85];
    if (!mesh.begin(bucket, 'rubble')) continue;
    const ring = Math.max(8, Math.round(m.r * 2 * Math.PI / 0.55));
    for (let k = 0; k < ring; k++) {
      const a = (k + rng() * 0.3) / ring * Math.PI * 2, top = 0.25 + rng() * rng() * 0.9;
      const x = m.x + Math.cos(a) * (m.r - 0.25), z = m.z + Math.sin(a) * (m.r - 0.25);
      box(bucket, [x, (top - 0.3) / 2, z], [Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)], 0.28, (top + 0.3) / 2, 0.3, mulK(tint, 0.85 + rng() * 0.25));
    }
    const n = Math.min(60, Math.round(m.r * m.r * 9));
    for (let k = 0; k < n; k++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * m.r * 1.25, x = m.x + Math.cos(a) * d, z = m.z + Math.sin(a) * d;
      // (on the rubble mound's skin: the sim raises the ground under the heap, the stones lie on it, a few on each other)
      const sz = 0.14 + rng() * 0.16, yaw = rng() * Math.PI, stack = k % 4 === 3 ? sz * 1.1 : 0;
      box(bucket, [x, ground(x, z) + sz * 0.55 + stack, z], [Math.cos(yaw), 0, Math.sin(yaw)], [0, 1, 0], [-Math.sin(yaw), 0, Math.cos(yaw)], sz * 1.4, sz * 0.6, sz, mulK(tint, 0.8 + rng() * 0.3));
    }
    if (shed.lintel) {
      const l = shed.lintel, tilt = 0.25 + rng() * 0.3, ux: Vec3 = [Math.cos(l.yaw) * Math.cos(tilt), Math.sin(tilt), Math.sin(l.yaw) * Math.cos(tilt)];
      box(bucket, [l.x, ground(l.x, l.z) + 0.1 + Math.sin(tilt) * l.len * 0.45, l.z], ux, [-Math.cos(l.yaw) * Math.sin(tilt), Math.cos(tilt), -Math.sin(l.yaw) * Math.sin(tilt)],
        [-Math.sin(l.yaw), 0, Math.cos(l.yaw)], l.len / 2, 0.11, 0.16, mulK(tint, 0.95));
    }
    mesh.end();
  }

  // ---- the pads where the posts stood
  if (shed.pad && mesh.begin(padBucket, 'remnant')) {
    const p = shed.pad, tint = p.colour ?? stoneTint;
    for (const [x, z] of shed.posts) box(padBucket, [x, (p.top - 0.3) / 2, z], [1, 0, 0], [0, 1, 0], [0, 0, 1], p.size / 2, (p.top + 0.3) / 2, p.size / 2, tint);
  }
  mesh.end();

  if (mesh.begin('structureWood', 'rubble')) {
    // ---- the posts: snapped a hand to a metre over their feet, bent over toward the fall; their lengths on the ground
    for (const [x, z, foot, head] of shed.posts) {
      const stub = 0.3 + rng() * 0.6, lean = 0.08 + rng() * 0.2;
      const top: Vec3 = [x + fx * lean, foot + stub, z + fz * lean];
      beam([x, foot, z], top, s, s, [0, 0, 1], mulK(timber, 0.95));
      const len = Math.max(0.6, head - foot - stub) * (0.8 + rng() * 0.18), [dx, dz] = turn(fx, fz, (rng() - 0.5) * 0.6);
      const a0: [number, number] = [top[0] + dx * 0.25, top[2] + dz * 0.25], a1: [number, number] = [a0[0] + dx * len, a0[1] + dz * len];
      beam([a0[0], ground(a0[0], a0[1]) + s / 2 + 0.02, a0[1]], [a1[0], ground(a1[0], a1[1]) + s / 2, a1[1]], s, s, [0, 1, 0], mulK(timber, 0.9));
    }
    // ---- a raised floor: its deck down in two lengths on the snapped stilts, one end on the ground
    if ((shed.lift ?? 0) > 0) {
      for (const sz of [-1, 1]) {
        const zc = sz * D / 4, tilt = 0.08 + rng() * 0.12, yc = ground(fx * 0.4, zc) + 0.08 + Math.sin(tilt) * W * 0.5;
        box('structureWood', [fx * 0.4, yc, zc + fz * 0.4], [Math.cos(tilt), Math.sin(tilt) * (rng() < 0.5 ? 1 : -1), 0], [-Math.sin(tilt), Math.cos(tilt), 0], [0, 0, 1],
          W / 2, 0.05, D / 4 - 0.05, mulK(timber, 0.95), true);
      }
    }
    // ---- the stack spilled: a low course left along the back, its logs rolled out of the front
    if (shed.pile > 0) {
      const xb = -W / 2 + (shed.stone ? shed.stone.t : 0) + s + 0.25, n = Math.min(28, Math.round(D * 4));
      for (let k = 0; k < n; k++) {
        const z = -D / 2 + 0.3 + (D - 0.6) * rng(), course = k < n / 3;
        const x = course ? xb : xb + 0.3 + rng() * W * 0.7, yaw = course ? 0 : rng() * Math.PI, L = 0.35 + rng() * 0.2;
        const [ux, uz] = turn(1, 0, yaw), y = ground(x, z) + 0.07 + (course ? 0.14 * (k % 3) : 0);
        beam([x - ux * L / 2, y, z - uz * L / 2], [x + ux * L / 2, y, z + uz * L / 2], 0.13, 0.13, [0, 1, 0], [0.45 + rng() * 0.1, 0.36, 0.26]);
      }
    }
  }
  mesh.end();

  // ---- the roof: two or three lengths of its deck, low edge down on the ground in the fall's direction, high edge
  // propped on the plates and the stack; the rafters under each length, nailed to it
  const tan = Math.tan(shed.pitchDeg * DEG);
  const L = (W + 2 * shed.eave) / Math.cos(shed.pitchDeg * DEG), Z0 = -D / 2 - shed.verge, Z1 = D / 2 + shed.verge;
  const lengths = D > 3.2 ? 3 : 2;
  const shift = fwd * W * (0.18 + rng() * 0.16);
  const panels: Array<{ c: Vec3; ux: Vec3; uy: Vec3; uz: Vec3; hl: number; hw: number }> = [];
  for (let k = 0; k < (shed.roof ? lengths : 0); k++) {
    const z0 = Z0 + (Z1 - Z0) * k / lengths + (k ? 0.06 : 0), z1 = Z0 + (Z1 - Z0) * (k + 1) / lengths - (k < lengths - 1 ? 0.06 : 0);
    const zc = (z0 + z1) / 2 + (along ? fz * 0.5 : 0);
    // the low edge (the front's, or the back's when it fell backward) on the ground, the high edge propped
    const prop = Math.min(L * 0.36, 0.55 + rng() * 0.45 + (shed.pile > 0 ? 0.2 : 0) + ((shed.lift ?? 0) > 0 ? 0.35 : 0));
    const lowX = (fwd >= 0 ? W / 2 + shed.eave : -W / 2 - shed.eave) + shift, run = Math.sqrt(Math.max(0.5, L * L - prop * prop));
    const highX = lowX - (fwd >= 0 ? 1 : -1) * run;
    const gl = ground(lowX, zc), yLow = gl + 0.06, yHigh = Math.max(gl, ground(highX, zc)) + prop;
    const yaw = (rng() - 0.5) * 0.2;
    const dirx = highX - lowX, diry = yHigh - yLow, dl = Math.hypot(dirx, diry);
    // the length's axes: down its slope (ux, low to high), across it (uz), out of its top (uy)
    const [ax, az] = turn(dirx / dl, 0, yaw);
    const ux: Vec3 = [ax, diry / dl, az];
    const uzr = turn(0, 1, yaw), uz: Vec3 = [uzr[0], 0, uzr[1]];
    const uy: Vec3 = [uz[1] * ux[2] - uz[2] * ux[1], uz[2] * ux[0] - uz[0] * ux[2], uz[0] * ux[1] - uz[1] * ux[0]];
    const up: Vec3 = uy[1] < 0 ? [-uy[0], -uy[1], -uy[2]] : uy;
    const hl = dl / 2, hw = (z1 - z0) / 2, th = shed.deck / 2 + 0.02;
    const c: Vec3 = [(lowX + highX) / 2 + up[0] * th, (yLow + yHigh) / 2 + up[1] * th, zc + up[2] * th];
    panels.push({ c, ux, uy: up, uz, hl, hw });
    peak = Math.max(peak, yHigh + 0.1);
  }
  if (mesh.begin(roofBucket, 'rubble')) {
    for (const p of panels) {
      const th = shed.deck / 2 + 0.02, tint = mulK(roofTint, 0.86 + rng() * 0.14);
      if (shed.roof?.lattice) {
        // an arbour's lattice: its rails down in their length, its leaves in clumps over them
        const at = (v: number, w: number, h: number): Vec3 => [p.c[0] + p.ux[0] * v + p.uz[0] * w + p.uy[0] * h, p.c[1] + p.ux[1] * v + p.uz[1] * w + p.uy[1] * h,
          p.c[2] + p.ux[2] * v + p.uz[2] * w + p.uy[2] * h];
        const o = B(0, 0, 0), q = B(p.uy[0], 0, p.uy[2]), up: Vec3 = [q[0] - o[0], p.uy[1], q[2] - o[2]];
        for (let w = -p.hw + 0.15; w < p.hw; w += 0.55) beamBetween(mesh, B(...at(-p.hl, w, 0)), B(...at(p.hl * (0.6 + rng() * 0.4), w, 0)), 0.07, 0.07, up, mulK(timber, 1.05));
        for (let k = 0; k < 10; k++) {
          const v = (rng() - 0.5) * 2 * p.hl, w = (rng() - 0.5) * 2 * p.hw, r = 0.18 + rng() * 0.12, c = at(v, w, 0.06);
          const a = B(c[0] - r, c[1], c[2] - r), b = B(c[0] + r, c[1] + 0.02, c[2] - r), cc = B(c[0] + r, c[1], c[2] + r), dd = B(c[0] - r, c[1] + 0.02, c[2] + r);
          mesh.quadUv(a, b, cc, dd, [0, 1, 0], 0.5, mulK(roofTint, 0.8 + rng() * 0.4));
        }
        continue;
      }
      box(roofBucket, p.c, p.ux, p.uy, p.uz, p.hl, th, p.hw, tint);
      // the covering's courses still on the length, a few lifted or gone
      for (let v = -p.hl + 0.25; v < p.hl - 0.1; v += 0.42) {
        if (rng() < 0.2) continue;
        const lift = th + 0.015 + rng() * 0.02, w0 = -p.hw + rng() * 0.3, w1 = p.hw - rng() * 0.3;
        const at = (w: number): Vec3 => [p.c[0] + p.ux[0] * v + p.uz[0] * w + p.uy[0] * lift, p.c[1] + p.ux[1] * v + p.uz[1] * w + p.uy[1] * lift,
          p.c[2] + p.ux[2] * v + p.uz[2] * w + p.uy[2] * lift];
        const o = B(0, 0, 0), q = B(p.uy[0], 0, p.uy[2]);
        beamBetween(mesh, B(...at(w0)), B(...at(w1)), 0.12, 0.03, [q[0] - o[0], p.uy[1], q[2] - o[2]], mulK(tint, 0.9 + rng() * 0.15));
      }
    }
  }
  mesh.end();
  if (mesh.begin('structureWood', 'rubble')) {
    // the rafters under each length, a few snapped short with the deck torn over them
    for (const p of panels) {
      const n = Math.max(2, Math.round(p.hw * 2 / 0.72));
      for (let k = 0; k <= n; k++) {
        const w = -p.hw + 0.12 + (p.hw * 2 - 0.24) * k / n, short = rng() < 0.25 ? 0.4 + rng() * 0.3 : 1;
        const off = shed.deck / 2 + 0.02 + 0.07;
        const at = (t: number): Vec3 => [p.c[0] + p.ux[0] * t + p.uz[0] * w - p.uy[0] * off, p.c[1] + p.ux[1] * t + p.uz[1] * w - p.uy[1] * off,
          p.c[2] + p.ux[2] * t + p.uz[2] * w - p.uy[2] * off];
        beam(at(-p.hl + 0.1), at(-p.hl + 0.1 + (p.hl * 2 - 0.2) * short), 0.075, 0.13, p.uy, mulK(timber, 0.88));
      }
    }
    // the front beam down along the open side in two lengths, the wall plate under the roof's high edge
    const xfb = (fwd >= 0 ? W / 2 + 0.4 : W / 2 - 0.3) + shift * 0.5;
    for (const [z0, z1] of shed.posts.length && shed.roof ? [[-D / 2, -0.15 + (rng() - 0.5) * 0.6], [0.15, D / 2]] as const : []) {
      const ya = ground(xfb, z0) + 0.09, yb = ground(xfb + 0.2, z1) + 0.09;
      beam([xfb, ya, z0], [xfb + (rng() - 0.5) * 0.5, yb, z1], 0.16, 0.16, [0, 1, 0], mulK(timber, 0.92));
    }
  }
  mesh.end();

  // ---- the cladding in panels of its boards on their rails: the back over onto the heap, one end flat, one leaning
  if (shed.boards && mesh.begin('structureWood', 'rubble')) {
    const bw = Math.max(0.16, shed.boardW);
    /** a panel of boards: its foot line from f0 to f1 (x, z), turned about it by `tilt` (0 standing, π/2 flat) toward `out` */
    const panel = (f0: [number, number], f1: [number, number], height: number, outX: number, outZ: number, tilt: number): void => {
      const lx = f1[0] - f0[0], lz = f1[1] - f0[1], len = Math.hypot(lx, lz), n = Math.min(14, Math.max(3, Math.round(len / bw)));
      const up: Vec3 = [outX * Math.sin(tilt), Math.cos(tilt), outZ * Math.sin(tilt)];
      const nrm: Vec3 = [outX * Math.cos(tilt), -Math.sin(tilt), outZ * Math.cos(tilt)];
      for (let k = 0; k < n; k++) {
        if (rng() < 0.12) continue;
        const t = (k + 0.5) / n, x = f0[0] + lx * t, z = f0[1] + lz * t, h = height * (rng() < 0.2 ? 0.45 + rng() * 0.4 : 0.92 + rng() * 0.08);
        const y0 = ground(x, z) + 0.03;
        beam([x, y0, z], [x + up[0] * h, y0 + up[1] * h, z + up[2] * h], len / n - 0.025, 0.025, nrm, mulK(boardTint, 0.82 + rng() * 0.24));
      }
      // its two rails across the boards' backs, holding the panel together
      for (const r of [0.3, 0.72]) {
        const yA = ground(f0[0], f0[1]) + up[1] * height * r, yB = ground(f1[0], f1[1]) + up[1] * height * r;
        const back: Vec3 = [-nrm[0] * 0.05, -nrm[1] * 0.05, -nrm[2] * 0.05];
        beam([f0[0] + up[0] * height * r + back[0], yA + back[1], f0[1] + up[2] * height * r + back[2]],
          [f1[0] + up[0] * height * r + back[0], yB + back[1], f1[1] + up[2] * height * r + back[2]], 0.11, 0.06, nrm, mulK(timber, 0.85));
      }
      peak = Math.max(peak, height * Math.cos(tilt));
    };
    const lift = shed.lift ?? 0, wallH = Math.max(0.8, shed.eaveY - lift);
    const hBack = wallH + (shed.gable ? 0 : W * tan * 0.95), hEnd = wallH + W * tan * (shed.gable ? 0.25 : 0.5);
    if (shed.back && !shed.stone) {
      // the back swung over onto the heap (forward) or flat behind (a blow from the front)
      const tilt = fwd >= 0 ? 1.0 + rng() * 0.25 : 1.45 + rng() * 0.1;
      panel([-W / 2, -D / 2 + 0.1], [-W / 2, D / 2 - 0.1], hBack, fwd >= 0 ? 1 : -1, 0, tilt);
    }
    if (shed.ends) {
      const flat = rng() < 0.5 ? -1 : 1;
      for (const sz of [-1, 1]) {
        const tilt = sz === flat ? 1.42 + rng() * 0.12 : 0.95 + rng() * 0.3;
        panel([-W / 2 + 0.1, sz * D / 2], [W / 2 - 0.1, sz * D / 2], hEnd, 0, sz, tilt);
      }
    }
  }
  mesh.end();

  // ---- the throw: boards and splinters, the covering's own pieces, down the fall
  const cover = shed.roof?.shape ?? 'stone';
  for (let i = 0; i < out.pieces.capacity; i++) {
    const t = rng(), wood = i % 3 === 0;
    const x = (rng() - 0.5) * W + fx * t * W * 0.6, z = (rng() - 0.5) * D + fz * t * W * 0.6;
    const p = B(x, 0.6 + (1 - t) * 1.6, z);
    const ok = wood && (shed.boards || shed.posts.length)
      ? throwPieceAt(out.pieces, rng, 'structureWood', rng() < 0.5 ? 'beam' : 'splinter', p, [0.06 + rng() * 0.05, 0.03, 0.4 + rng() * 0.7], boardTint, 3)
      : shed.roof ? throwPieceAt(out.pieces, rng, roofBucket, cover, p, [0.18 + rng() * 0.12, 0.03, 0.22 + rng() * 0.14], roofTint, 3)
        : throwPieceAt(out.pieces, rng, shed.masses?.length ? WEATHER_ROUTE[shed.masses[0].bucket] ?? shed.masses[0].bucket : 'regionalStone', 'stone', p,
          [0.14 + rng() * 0.12, 0.1 + rng() * 0.08, 0.16 + rng() * 0.12], stoneTint, 3);
    if (!ok) break;
  }
  void peak;
  return { cuts: [], hides: [{ section: null, partClass: null }] };
}
