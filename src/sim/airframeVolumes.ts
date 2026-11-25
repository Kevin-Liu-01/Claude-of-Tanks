/**
 * airframeVolumes.ts — an Air Support aircraft as a solid: its hit volume in flight and its wreck on the ground
 * (aircraft-solid-277; Kevin 2026-11-25: "we need to make attacking them better esp with drones because we can pass through
 * them ... and when theyre crashed on the ground you should be able to just glitch through them that at least need a
 * hitbox so u hit them and cant drive through them").
 *
 * Each airframe the presentation draws (game/strikeJetAirframe.ts the A-10, game/fighterJetAirframe.ts the fighter,
 * game/gunshipAirframe.ts the AC-130) is a handful of boxes in its own frame (+Z the nose, +Y up, +X the port wing), fitted
 * to its drawn vertices: fuselage, wings, engines, tail, fins. airframeVolumes.selftest.mjs builds the real airframes and
 * holds the boxes to them (at least 99 % of the drawn vertices inside, every box carrying the vertices it is for). The
 * pose convention is the drawn one (three.js Euler 'YXZ' of (-pitch, yaw, bank): game/airSupportWorld.ts poseCraft).
 *
 * In flight, a round strikes an aircraft where its path, swept from where the aircraft stood a step ago to where it stands
 * now (an aircraft at 220 m/s moves 3.7 m a step), enters one of its boxes grown by the kind's hitMarginM. On the ground,
 * a wreck is the same boxes at the wreck's rest pose (the airframe's broken wing cut short, its nose crumpled:
 * wreckBreak), the rounds' and the drones' solid, and a compound collision record the hulls meet as a wall.
 *
 * Pure and deterministic (detMath; no clock, no randomness but the strike id's hash). Copyright (c) 2026 Kevin B. Liu
 * (NOTICE.md).
 */
import * as detMath from './detMath.ts';
import { AIR_CRASH_RULES, type AirStrikeKind, type AirSupportRules } from './matchRuleset.ts';
import { runPose, type RunPose, type RunRecord } from './strikeRuns.ts';
import { setCompoundShape, type CollisionRecord, type SimpleCollisionShape } from '../world/collision.ts';
import type { NavigationWreck } from './botRoutePlanner.ts';

/** The airframes Air Support flies: the A-10 (the recon pass and the strafing run), the fighter (the bomb and the Maverick
 *  run) and the AC-130 (the orbit). */
export type AirframeId = 'strike' | 'fighter' | 'gunship';
export function airframeOf(kind: AirStrikeKind): AirframeId {
  return kind === 'gunship' ? 'gunship' : kind === 'bomb' || kind === 'missile' ? 'fighter' : 'strike';
}

type BoxRole = 'fuselage' | 'wing' | 'engines' | 'tail' | 'fin' | 'gear';
/** A box in the airframe's frame: [minX, minY, minZ, maxX, maxY, maxZ]. */
export interface AirframeBox { readonly role: BoxRole; readonly b: readonly [number, number, number, number, number, number] }
const box = (role: BoxRole, ...b: [number, number, number, number, number, number]): AirframeBox => Object.freeze({ role, b: Object.freeze(b) });

/**
 * The boxes, fitted to the drawn airframes (the selftest's measure: the A-10 and the fighter 100 % of their drawn vertices
 * inside, within 5 cm; the AC-130 99.3 %, its wing roots' fillets and the gear doors' lips outside).
 */
export const AIRFRAME_BOXES: Readonly<Record<AirframeId, readonly AirframeBox[]>> = Object.freeze({
  // the A-10: 16.9 m long, 17.5 m span; the engines high on the rear fuselage, the twin fins on the tailplane's tips
  strike: Object.freeze([
    box('fuselage', -0.9, -0.8, -8.3, 0.9, 1.3, 8.6),
    box('wing', -8.8, -1.1, -1.6, 8.8, 0.2, 2.6),
    box('engines', -2.4, 0.4, -5.6, 2.4, 1.9, -1.5),
    box('tail', -3, -0.4, -8.3, 3, 2.4, -5.8),
  ]),
  // the fighter: 15.8 m long, 9.5 m span, one fin
  fighter: Object.freeze([
    box('fuselage', -0.7, -1.25, -7.6, 0.7, 1.2, 8.3),
    box('wing', -4.8, -0.9, -3.6, 4.8, 0.9, 1.6),
    box('tail', -2.8, -0.5, -8, 2.8, 0.4, -6),
    box('fin', -0.4, 0.4, -8, 0.4, 3.2, -5),
  ]),
  // the AC-130: 30.4 m long, 40.6 m span; a high wing, four engines forward of it, the sponsons, the T of the tail
  gunship: Object.freeze([
    box('fuselage', -2.3, -2.5, -12, 2.3, 3.3, 15),
    box('wing', -20.4, 2.0, -3.4, 20.4, 4.0, 3),
    box('engines', -12.1, -0.8, 2, 12.1, 4.6, 7),
    box('tail', -8.1, 1.2, -15.5, 8.1, 2.6, -12),
    box('fin', -0.4, 1.9, -16, 0.4, 9.4, -11),
    box('gear', -4.9, -1.9, -6.5, 4.9, 0, -3.5),
  ]),
});

// ---- the pose -----------------------------------------------------------------------------------------------------------

type Point3 = { x: number; y: number; z: number };
interface Attitude { readonly yaw: number; readonly pitch: number; readonly bank: number }

/** `p` (world) into the airframe's frame at `pose` (the inverse of the drawn Euler 'YXZ' of (-pitch, yaw, bank)). */
export function toAirframe(pose: Point3 & Attitude, p: Point3, out: Point3): Point3 {
  const dx = p.x - pose.x, dy = p.y - pose.y, dz = p.z - pose.z;
  const cy = detMath.cos(pose.yaw), sy = detMath.sin(pose.yaw);
  const cp = detMath.cos(pose.pitch), sp = detMath.sin(pose.pitch);
  const cb = detMath.cos(pose.bank), sb = detMath.sin(pose.bank);
  const x1 = dx * cy - dz * sy, z1 = dx * sy + dz * cy;
  const y2 = dy * cp - z1 * sp, z2 = dy * sp + z1 * cp;
  out.x = x1 * cb + y2 * sb; out.y = -x1 * sb + y2 * cb; out.z = z2;
  return out;
}

/** A direction in the airframe's frame into the world (no translation). */
export function fromAirframeDir(pose: Attitude, d: Point3, out: Point3): Point3 {
  const cy = detMath.cos(pose.yaw), sy = detMath.sin(pose.yaw);
  const cp = detMath.cos(pose.pitch), sp = detMath.sin(pose.pitch);
  const cb = detMath.cos(pose.bank), sb = detMath.sin(pose.bank);
  const x1 = d.x * cb - d.y * sb, y1 = d.x * sb + d.y * cb;
  const y2 = y1 * cp + d.z * sp, z2 = -y1 * sp + d.z * cp;
  out.x = x1 * cy + z2 * sy; out.y = y2; out.z = -x1 * sy + z2 * cy;
  return out;
}

/** A point in the airframe's frame into the world. */
export function fromAirframe(pose: Point3 & Attitude, p: Point3, out: Point3): Point3 {
  fromAirframeDir(pose, p, out);
  out.x += pose.x; out.y += pose.y; out.z += pose.z;
  return out;
}

// ---- the segment test ---------------------------------------------------------------------------------------------------

/** Where a path met an airframe: its fraction along the path (0..1), the box, and the face's outward normal in the
 *  airframe's frame. */
export interface AirframeHit { t: number; box: number; nx: number; ny: number; nz: number }

const _a = { x: 0, y: 0, z: 0 }, _b = { x: 0, y: 0, z: 0 };
/**
 * The first box of `boxes` the path from `a` (seen from `poseA`) to `b` (seen from `poseB`) enters, each box grown by
 * `margin`; a path that starts inside a box meets it at 0. Null when it meets none. With one pose for both ends this is a
 * plain segment test (a wreck); with the aircraft's last step's pose and this step's it is swept with the aircraft.
 */
export function segmentMeetsBoxes(boxes: readonly AirframeBox[], poseA: Point3 & Attitude, a: Point3, poseB: Point3 & Attitude, b: Point3,
  margin: number, out: AirframeHit): AirframeHit | null {
  toAirframe(poseA, a, _a);
  toAirframe(poseB, b, _b);
  const dx = _b.x - _a.x, dy = _b.y - _a.y, dz = _b.z - _a.z;
  let best = Infinity;
  for (let i = 0; i < boxes.length; i++) {
    const bb = boxes[i]!.b;
    let t0 = 0, t1 = 1, axis = -1, sign = 0;
    for (let k = 0; k < 3; k++) {
      const o = k === 0 ? _a.x : k === 1 ? _a.y : _a.z, d = k === 0 ? dx : k === 1 ? dy : dz;
      const lo = bb[k]! - margin, hi = bb[k + 3]! + margin;
      if (d > -1e-12 && d < 1e-12) {
        if (o < lo || o > hi) { t0 = 2; break; }
        continue;
      }
      let near = (lo - o) / d, far = (hi - o) / d, s = -1;
      if (near > far) { const swap = near; near = far; far = swap; s = 1; }
      if (near > t0) { t0 = near; axis = k; sign = s; }
      if (far < t1) t1 = far;
      if (t0 > t1) break;
    }
    if (t0 > t1 || t0 > 1 || t0 >= best) continue;
    best = t0; out.t = t0; out.box = i;
    // a path that starts inside the box: the face nearest back along it
    if (axis < 0) { const n = Math.max(1e-9, detMath.hypot(dx, dy, dz)); out.nx = -dx / n; out.ny = -dy / n; out.nz = -dz / n; }
    else { out.nx = axis === 0 ? sign : 0; out.ny = axis === 1 ? sign : 0; out.nz = axis === 2 ? sign : 0; }
  }
  return best <= 1 ? out : null;
}

// ---- the wreck ----------------------------------------------------------------------------------------------------------

/**
 * How a wreck broke (deterministic from its strike's id): the wing it tore (`wing` +1 the port, -1 the starboard) at
 * `tipFrac` of that wing's half-span, and the nose crumpled back `noseFrac` of the fuselage's length where it ploughed in.
 */
export interface WreckBreak { readonly wing: 1 | -1; readonly tipFrac: number; readonly noseFrac: number }
export function wreckBreak(id: number): WreckBreak {
  let h = Math.imul((id | 0) ^ 0x5bd1e995, 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  const u = (h & 0xffff) / 0xffff, v = (h >>> 16) / 0xffff;
  return { wing: (h & 1) === 0 ? 1 : -1, tipFrac: 0.5 + 0.3 * u, noseFrac: 0.05 + 0.05 * v };
}

/** The wreck's boxes: the airframe's, the broken wing short at its tear, the nose short by its crumple. */
export function wreckBoxes(airframe: AirframeId, brk: WreckBreak): AirframeBox[] {
  const out: AirframeBox[] = [];
  for (const one of AIRFRAME_BOXES[airframe]) {
    const [x0, y0, z0, x1, y1, z1] = one.b;
    if (one.role === 'wing') {
      // the wing in its halves: the torn one ends at its tear
      const half = Math.max(-x0, x1), tear = half * brk.tipFrac;
      out.push(box('wing', brk.wing < 0 ? -tear : x0, y0, z0, 0, y1, z1));
      out.push(box('wing', 0, y0, z0, brk.wing > 0 ? tear : x1, y1, z1));
    } else if (one.role === 'fuselage') out.push(box('fuselage', x0, y0, z0, x1, y1, z1 - (z1 - z0) * brk.noseFrac));
    else out.push(one);
  }
  return out;
}

/** An aircraft's wreck: where its frame stands and how it lies (the drawn frame's origin and attitude), from when to when
 *  it lies there (the mode's clock), and whose it was. Public: the view carries it (the presentation draws it). */
export interface AircraftWreck {
  id: number;
  kind: AirStrikeKind;
  team: 'alpha' | 'bravo';
  x: number; y: number; z: number;
  yaw: number; pitch: number; bank: number;
  atS: number;
  untilS: number;
}

/**
 * How a wreck comes to rest (air-crash-he-276's settle, now the sim's): nosed down into its crater along its last heading,
 * its fall's pitch held between AIR_CRASH_RULES.wreck's bounds, on its belly or its back as its roll left it (never on a
 * wingtip), leaning at most leanRad from either. The fall's attitude is the drawn fall's (game/airSupportWorld.ts
 * fallPose): the run's pose at the fall, rolling at rollRadS and nosing over at noseRadS.
 */
export function wreckAttitude(rules: AirSupportRules, strike: RunRecord, downedS: number, crashS: number,
  out: { yaw: number; pitch: number; bank: number }): { yaw: number; pitch: number; bank: number } {
  const w = AIR_CRASH_RULES.wreck;
  runPose(rules, strike, downedS, _pose);
  const dt = Math.max(0, crashS - downedS);
  const fallPitch = Math.max(-1.4, _pose.pitch - dt * w.noseRadS);
  const roll = detMath.atan2(detMath.sin(_pose.bank + dt * w.rollRadS), detMath.cos(_pose.bank + dt * w.rollRadS));
  const rest = Math.abs(roll) < Math.PI / 2 ? 0 : Math.PI;
  const lean = detMath.atan2(detMath.sin(roll - rest), detMath.cos(roll - rest));
  out.yaw = _pose.yaw;
  out.pitch = Math.max(w.pitchRad[0], Math.min(w.pitchRad[1], fallPitch));
  out.bank = rest + Math.max(-w.leanRad, Math.min(w.leanRad, lean));
  return out;
}
const _pose: RunPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 };

const _c = { x: 0, y: 0, z: 0 }, _w = { x: 0, y: 0, z: 0 };
/**
 * Seats a wreck lying at `attitude`: its frame's origin such that its lowest box corner stands over (x, z), the point it
 * ploughed in with (the crash round's burst), on `groundY` there, and no corner of it under `ground` (the match's dug
 * ground: a wingtip over the crater's rim holds it up, as the drawn wreck is seated on the ground under every vertex).
 */
export function seatWreck(airframe: AirframeId, brk: WreckBreak, attitude: Attitude, x: number, groundY: number, z: number,
  out: Point3, ground: ((x: number, z: number) => number) | null = null): Point3 {
  const boxes = wreckBoxes(airframe, brk);
  let lowY = Infinity, lowX = 0, lowZ = 0;
  for (const one of boxes) {
    for (let k = 0; k < 8; k++) {
      _c.x = one.b[k & 1 ? 3 : 0]!; _c.y = one.b[k & 2 ? 4 : 1]!; _c.z = one.b[k & 4 ? 5 : 2]!;
      fromAirframeDir(attitude, _c, _w);
      if (_w.y < lowY) { lowY = _w.y; lowX = _w.x; lowZ = _w.z; }
    }
  }
  out.x = x - lowX; out.z = z - lowZ;
  let y = groundY - lowY;
  if (ground) {
    for (const one of boxes) {
      for (let k = 0; k < 8; k++) {
        _c.x = one.b[k & 1 ? 3 : 0]!; _c.y = one.b[k & 2 ? 4 : 1]!; _c.z = one.b[k & 4 ? 5 : 2]!;
        fromAirframeDir(attitude, _c, _w);
        const lift = ground(out.x + _w.x, out.z + _w.z) - _w.y;
        if (lift > y) y = lift;
      }
    }
  }
  out.y = y;
  return out;
}

/** A wreck part a hull meets (its underside under a hull's height): the parts the bots' routes bend round. */
const HULL_REACH_M = 2.4;
/**
 * The aircraft wrecks' parts a hull meets, appended to the bots' navigation wrecks (sim/botRoutePlanner.ts
 * syncNavigationWrecks: the tank wrecks' list) from `count`; returns the new count. Both drivers call it with the same
 * records, after the tank wrecks.
 */
export function appendNavigationWrecks(records: readonly CollisionRecord[], out: NavigationWreck[], count: number): number {
  for (const record of records) {
    const shape = record.shape2;
    if (shape?.kind !== 'compound') continue;
    for (const part of shape.parts) {
      if (part.kind !== 'obb' || (part.y0 ?? record.min[1]) > record.min[1] + HULL_REACH_M) continue;
      const wreck = out[count] ??= { x: 0, z: 0, yaw: 0, halfLength: 0, halfWidth: 0, minY: 0, maxY: 0 };
      wreck.x = part.cx; wreck.z = part.cz; wreck.yaw = part.yaw; wreck.halfLength = part.hl; wreck.halfWidth = part.hw;
      wreck.minY = part.y0 ?? record.min[1]; wreck.maxY = part.y1 ?? record.max[1];
      count++;
    }
  }
  return count;
}

/** Slices a box longer than this (m) along its longest axis, so a tilted fuselage's plan parts each keep their own height
 *  (a hull may pass under the raised tail of a wreck nosed into its crater, never through its nose). */
const SLICE_M = 4;
const _corner = { x: 0, y: 0, z: 0 }, _world = { x: 0, y: 0, z: 0 };
/**
 * The wreck as the world's collision record (the hulls' obstacle, world/collision.ts): one compound of yaw-aligned boxes in
 * plan, each with its own height span, from its boxes at its pose. `kind` 'aircraft_wreck'; never crushed or broken.
 */
export function wreckCollisionRecord(wreck: AircraftWreck): CollisionRecord {
  const airframe = airframeOf(wreck.kind), brk = wreckBreak(wreck.id);
  const fx = detMath.sin(wreck.yaw), fz = detMath.cos(wreck.yaw);
  const parts: SimpleCollisionShape[] = [];
  let minY = Infinity, maxY = -Infinity;
  for (const one of wreckBoxes(airframe, brk)) {
    const b = one.b;
    const ext = [b[3] - b[0], b[4] - b[1], b[5] - b[2]];
    const axis = ext[0]! >= ext[1]! && ext[0]! >= ext[2]! ? 0 : ext[1]! >= ext[2]! ? 1 : 2;
    const slices = Math.max(1, Math.ceil(ext[axis]! / SLICE_M));
    for (let s = 0; s < slices; s++) {
      const lo = b[axis]! + ext[axis]! * s / slices, hi = b[axis]! + ext[axis]! * (s + 1) / slices;
      let a0 = Infinity, a1 = -Infinity, r0 = Infinity, r1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let k = 0; k < 8; k++) {
        const pick = (i: number, bit: number): number => i === axis ? (k & bit ? hi : lo) : b[k & bit ? i + 3 : i]!;
        _corner.x = pick(0, 1); _corner.y = pick(1, 2); _corner.z = pick(2, 4);
        fromAirframe(wreck, _corner, _world);
        const along = _world.x * fx + _world.z * fz, right = _world.x * fz - _world.z * fx;
        if (along < a0) a0 = along; if (along > a1) a1 = along;
        if (right < r0) r0 = right; if (right > r1) r1 = right;
        if (_world.y < y0) y0 = _world.y; if (_world.y > y1) y1 = _world.y;
      }
      const ca = (a0 + a1) * 0.5, cr = (r0 + r1) * 0.5;
      parts.push({ kind: 'obb', cx: ca * fx + cr * fz, cz: ca * fz - cr * fx, hw: (r1 - r0) * 0.5, hl: (a1 - a0) * 0.5, yaw: wreck.yaw, y0, y1 });
      if (y0 < minY) minY = y0; if (y1 > maxY) maxY = y1;
    }
  }
  const record: CollisionRecord = { min: [0, minY, 0], max: [0, maxY, 0], kind: 'aircraft_wreck' };
  return setCompoundShape(record, parts);
}
