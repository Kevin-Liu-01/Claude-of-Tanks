/**
 * strikeRuns.ts — one description of each Air Support run (air-support-runs-272; owner 2026-11-11: "planes need to follow
 * proper actual flight paths, be aligned with the explosion highlight areas, and the bomb dropping should be from a jet").
 *
 * A strike's run is fixed by its record alone (the mark, the heading from the caller's hull to it, the warning's end) and
 * by its kind's rules. From that one run come:
 *   - the aircraft's flight (runPose): a real path flown at speed and altitude, built of legs that join with no jump in
 *     place, heading, climb angle or speed: straight legs (with acceleration), pitch arcs (a push-over into a dive, a
 *     pull-out) and level or climbing turns at a bank the turn's own rate and speed demand (tan bank = v * rate / g);
 *   - the release points: the strafing run's gun walks the lane from the jet's own position, the bomb leaves the jet at
 *     its release point with the jet's own velocity (its forward throw), the AC-130's guns fire from its left side;
 *   - the footprint (runFootprint): the strafing lane along the run's axis, the bomb's ellipse elongated along the heading,
 *     the AC-130's orbit ring centred on the mark at the radius it flies, the battery's circle.
 * So the highlight, the aircraft and the impacts cannot disagree: there is no second source to sync.
 *
 * The run frame: origin the mark (its ground), `along` the heading, `lat` to its left (the port side), `up`; the heading
 * offset `psi` turns left as it grows (the world yaw is heading + psi, atan2(dx, dz)). The runs:
 *   - strafe (A-10): level ingress from behind the caller, a push-over into a dive whose line meets the lane's start, the
 *     gun open from landsS for fireS while the nose walks the rounds down the lane, a pull-out, a banked climbing egress;
 *   - bomb (a fast jet): level ingress high, a push-over into a steep dive, the release at the point from which a free
 *     fall at the jet's velocity meets the mark fallMarginS after the warning, a pull-out, a banked climbing egress;
 *   - recon: level along the heading over the mark at landsS, a climb-out and a banked egress;
 *   - gunship (AC-130): inbound along a line tangent to its orbit, slowing to orbit speed, then a left-hand pylon turn
 *     centred on the mark (its bank is the pivotal altitude's: the guns' line to the mark lies along the left wing),
 *     then a roll-out and a climb away;
 *   - artillery: no aircraft (the battery is off the map).
 *
 * Pure and deterministic (detMath), no allocation per call: each kind's legs are planned once per rules object.
 * Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import * as detMath from './detMath.ts';
import { AIR_STRIKE_WEAPONS, type AirStrikeKind, type AirSupportRules } from './matchRuleset.ts';

/** What a run is derived from: the public record's mark, heading, timing and id. */
export interface RunRecord {
  readonly id: number;
  readonly kind: AirStrikeKind;
  readonly x: number; readonly y: number; readonly z: number;
  readonly heading: number;
  readonly calledS: number;
  readonly landsS: number;
}

/** An aircraft's pose: its position, its yaw (atan2(dx, dz)), its nose-up pitch and its bank (negative: left wing down,
 *  the three.js roll of a nose +Z airframe about its nose). */
export interface RunPose { x: number; y: number; z: number; yaw: number; pitch: number; bank: number }

/** A call-in's ground footprint, the shape the reticle, the minimap, the world and the danger tests all use. */
export type StrikeFootprint =
  | { readonly shape: 'circle'; readonly radiusM: number }
  /** an ellipse: its semi-axis along the heading and across it */
  | { readonly shape: 'ellipse'; readonly alongM: number; readonly acrossM: number }
  | { readonly shape: 'orbit'; readonly radiusM: number }
  | { readonly shape: 'lane'; readonly halfLengthM: number; readonly halfWidthM: number };

type LegKind = 'line' | 'pitch' | 'turn';
/** One leg: its kind, the span it flies (s from landsS; the first is open before, the last open after), its rate (line:
 *  acceleration m/s^2; pitch: rad/s; turn: yaw rate rad/s, positive left) and its state at `ts` (run frame). */
interface Leg {
  readonly kind: LegKind;
  readonly t0: number;
  readonly t1: number;
  readonly ts: number;
  readonly rate: number;
  readonly a: number; readonly l: number; readonly u: number;
  readonly psi: number; readonly gamma: number; readonly v: number;
}
/** A kind's plan: its legs in time order, its exit (s from landsS) and whether its egress turn takes the id's side. */
interface RunPlan { readonly legs: readonly Leg[]; readonly exitS: number; readonly turnSign: boolean }
type LegSpec = readonly [LegKind, number, number];

const DEG = Math.PI / 180;
/** The bank ramps in and out over the first and last ROLL_S of a turn (the attitude; the path is the turn's own). */
const ROLL_S = 1.2;

/** The free fall's gravity: the bomb's own shell's (sim/ballistics.ts shellGravityMps2, read here without that module's
 *  three.js so the HUD's chunk stays light; strikeRuns.selftest pins the two equal), so its arc and the run agree. */
const bombScale = (AIR_STRIKE_WEAPONS.bomb as { gravityScale?: number }).gravityScale;
export const BOMB_GRAVITY_MPS2 = 9.81 * (typeof bombScale === 'number' && Number.isFinite(bombScale) ? Math.max(0, bombScale) : 1);

interface FlightState { a: number; l: number; u: number; psi: number; gamma: number; v: number }
const flightState = (): FlightState => ({ a: 0, l: 0, u: 0, psi: 0, gamma: 0, v: 0 });

/** Advance a state `tau` seconds (negative: back) along a leg of `kind` at `rate` (no allocation: writes `out`). */
function evolve(s: FlightState, kind: LegKind, rate: number, tau: number, out: FlightState): FlightState {
  const { a, l, u, psi, gamma, v } = s;
  if (kind === 'line' || Math.abs(rate) < 1e-9) {
    const acc = kind === 'line' ? rate : 0;
    const d = v * tau + 0.5 * acc * tau * tau;
    const ch = detMath.cos(gamma) * d;
    out.a = a + ch * detMath.cos(psi); out.l = l + ch * detMath.sin(psi); out.u = u + detMath.sin(gamma) * d;
    out.psi = psi; out.gamma = gamma; out.v = v + acc * tau;
    return out;
  }
  if (kind === 'pitch') {
    // a vertical arc at constant speed in the run's plane: the climb angle turns at `rate`
    const g1 = gamma + rate * tau, k = v / rate;
    const h = k * (detMath.sin(g1) - detMath.sin(gamma));
    out.a = a + h * detMath.cos(psi); out.l = l + h * detMath.sin(psi);
    out.u = u - k * (detMath.cos(g1) - detMath.cos(gamma));
    out.psi = psi; out.gamma = g1; out.v = v;
    return out;
  }
  // a turn at constant speed and climb angle: the heading turns at `rate` (positive left)
  const vh = v * detMath.cos(gamma), p1 = psi + rate * tau, k = vh / rate;
  out.a = a + k * (detMath.sin(p1) - detMath.sin(psi));
  out.l = l + k * (detMath.cos(psi) - detMath.cos(p1));
  out.u = u + v * detMath.sin(gamma) * tau;
  out.psi = p1; out.gamma = gamma; out.v = v;
  return out;
}

/** Plan a run from its anchor state at `anchorT` (s from landsS): the legs flown before it (latest first) and after it,
 *  each [kind, duration, rate]. Each leg starts in the state the one before it ended in. */
function plan(anchor: FlightState, anchorT: number, before: readonly LegSpec[], after: readonly LegSpec[], turnSign = false): RunPlan {
  const earlier: Leg[] = [];
  let state: FlightState = { ...anchor }, t = anchorT;
  before.forEach(([kind, dur, rate], i) => {
    const start = evolve(state, kind, rate, -dur, flightState());
    earlier.push({ kind, t0: i === before.length - 1 ? -Infinity : t - dur, t1: t, ts: t - dur, rate, ...start });
    state = start; t -= dur;
  });
  const legs = earlier.reverse();
  state = { ...anchor }; t = anchorT;
  after.forEach(([kind, dur, rate], i) => {
    legs.push({ kind, t0: t, t1: i === after.length - 1 ? Infinity : t + dur, ts: t, rate, ...state });
    state = evolve(state, kind, rate, dur, flightState());
    t += dur;
  });
  return { legs: Object.freeze(legs), exitS: t, turnSign };
}

const plans = new WeakMap<AirSupportRules, Map<AirStrikeKind, RunPlan | null>>();
function planOf(rules: AirSupportRules, kind: AirStrikeKind): RunPlan | null {
  let byKind = plans.get(rules);
  if (!byKind) { byKind = new Map(); plans.set(rules, byKind); }
  if (!byKind.has(kind)) byKind.set(kind, makePlan(rules, kind));
  return byKind.get(kind)!;
}

/** The bomb's fall from the release: its time (s) and its forward throw (m) at the jet's dive and speed. */
export function bombFall(rules: AirSupportRules): { fallS: number; throwM: number } {
  const b = rules.bomb, g = BOMB_GRAVITY_MPS2, dive = b.diveDeg * DEG;
  const vDown = b.speedMps * detMath.sin(dive), vAlong = b.speedMps * detMath.cos(dive);
  const fallS = (-vDown + Math.sqrt(vDown * vDown + 2 * g * b.altitudeM)) / g;
  return { fallS, throwM: vAlong * fallS };
}

/** When the bomb leaves the jet (s from landsS): it lands fallMarginS after the warning has run. */
export function bombReleaseOffsetS(rules: AirSupportRules): number {
  return rules.fallMarginS - bombFall(rules).fallS;
}

/** The strafing run's dive: its line meets the lane's start from the open-fire point altitudeM over the mark. */
function strafeStandoffM(rules: AirSupportRules): number {
  return rules.strafe.altitudeM / detMath.tan(rules.strafe.diveDeg * DEG);
}

function makePlan(rules: AirSupportRules, kind: AirStrikeKind): RunPlan | null {
  const f = rules.flight, g = 9.81;
  /** A banked climbing egress: the turn at the egress bank for egressS, then the exit, climbing and accelerating. */
  const egress = (v: number, climb: number): LegSpec[] => {
    const rate = g * detMath.tan(f.egressBankDeg * DEG) / (v * detMath.cos(climb));
    return [['turn', f.egressS, rate], ['line', f.exitS, f.exitAccelMps2]];
  };
  if (kind === 'artillery') return null;
  if (kind === 'strafe') {
    const s = rules.strafe, dive = s.diveDeg * DEG, v = s.speedMps;
    const push = f.pushG * g / v, pull = f.pullG * g / v, climb = f.climbDeg * DEG;
    const anchor = { a: -s.lengthM * 0.5 - strafeStandoffM(rules), l: 0, u: s.altitudeM, psi: 0, gamma: -dive, v };
    return plan(anchor, 0,
      [['line', f.settleS, 0], ['pitch', dive / push, -push], ['line', 1, 0]],
      [['line', s.fireS, 0], ['pitch', (dive + climb) / pull, pull], ...egress(v, climb)], true);
  }
  if (kind === 'bomb') {
    const b = rules.bomb, dive = b.diveDeg * DEG, v = b.speedMps;
    const push = f.pushG * g / v, pull = f.pullG * g / v, climb = f.climbDeg * DEG;
    const { throwM } = bombFall(rules);
    const anchor = { a: -throwM, l: 0, u: b.altitudeM, psi: 0, gamma: -dive, v };
    return plan(anchor, bombReleaseOffsetS(rules),
      [['line', f.settleS, 0], ['pitch', dive / push, -push], ['line', 1, 0]],
      [['pitch', (dive + climb) / pull, pull], ...egress(v, climb)], true);
  }
  if (kind === 'recon') {
    const r = rules.recon, v = r.speedMps, climb = f.climbDeg * DEG, pull = f.pullG * 0.6 * g / v;
    const anchor = { a: 0, l: 0, u: r.altitudeM, psi: 0, gamma: 0, v };
    return plan(anchor, 0, [['line', 1, 0]],
      [['line', r.trackM * 0.5 / v, 0], ['pitch', climb / pull, pull], ...egress(v, climb)], true);
  }
  // the AC-130: the tangent point (the mark's right, abeam) at landsS, the pylon turn left round the mark for orbitS
  const gs = rules.gunship, v = gs.speedMps, warn = gs.warningS;
  const decel = (v - gs.inboundMps) / warn;
  const anchor = { a: 0, l: -gs.radiusM, u: gs.altitudeM, psi: 0, gamma: 0, v };
  return plan(anchor, 0, [['line', 1, decel]],
    [['turn', gs.orbitS, v / gs.radiusM], ['line', f.exitS * 2, f.exitAccelMps2]]);
}

const _s: FlightState = { a: 0, l: 0, u: 0, psi: 0, gamma: 0, v: 0 }, _o: FlightState = { a: 0, l: 0, u: 0, psi: 0, gamma: 0, v: 0 };

/** The run-frame state of `strike`'s aircraft at `timeS` (null: artillery has none); `bankOut` gets the bank. */
function runState(rules: AirSupportRules, strike: RunRecord, timeS: number, out: FlightState): { leg: Leg; tau: number } | null {
  const p = planOf(rules, strike.kind);
  if (!p) return null;
  const t = timeS - strike.landsS;
  let leg = p.legs[0]!;
  for (const candidate of p.legs) if (t >= candidate.t0) leg = candidate;
  const ts = leg.ts;
  _s.a = leg.a; _s.l = leg.l; _s.u = leg.u; _s.psi = leg.psi; _s.gamma = leg.gamma; _s.v = leg.v;
  // the turn of a jet's egress goes left or right by the strike's id (the plan is drawn left; mirrored for odd ids)
  evolve(_s, leg.kind, leg.rate, t - ts, out);
  if (p.turnSign && (strike.id & 1)) { out.l = -out.l; out.psi = -out.psi; }
  return { leg, tau: t - ts };
}

/** The aircraft of `strike` at `timeS`: its position, yaw, nose-up pitch and bank. Artillery: the point over the mark. */
export function runPose(rules: AirSupportRules, strike: RunRecord, timeS: number, out: RunPose): RunPose {
  const sinH = detMath.sin(strike.heading), cosH = detMath.cos(strike.heading);
  const at = runState(rules, strike, timeS, _o);
  if (!at) {
    out.x = strike.x; out.z = strike.z; out.y = strike.y + rules.artillery.altitudeM;
    out.yaw = strike.heading; out.pitch = 0; out.bank = 0;
    return out;
  }
  // run frame -> world: along the heading (sinH, cosH), left (cosH, -sinH)
  out.x = strike.x + sinH * _o.a + cosH * _o.l;
  out.z = strike.z + cosH * _o.a - sinH * _o.l;
  out.y = strike.y + _o.u;
  out.yaw = strike.heading + _o.psi;
  out.pitch = _o.gamma;
  out.bank = 0;
  const { leg, tau } = at;
  if (leg.kind === 'turn') {
    const vh = _o.v * detMath.cos(_o.gamma);
    const rate = (planOf(rules, strike.kind)!.turnSign && (strike.id & 1)) ? -leg.rate : leg.rate;
    const ramp = Math.min(1, Math.max(0, tau) / ROLL_S, Number.isFinite(leg.t1) ? Math.max(0, leg.t1 - leg.t0 - tau) / ROLL_S : 1);
    out.bank = -detMath.atan2(vh * rate, 9.81) * ramp * ramp * (3 - 2 * ramp);
  }
  if (strike.kind === 'strafe') {
    // the gun walks the lane: while it fires the nose holds on the round's aim point (the jet eases back through it)
    const t = timeS - strike.landsS, s = rules.strafe;
    if (t >= 0 && t <= s.fireS) {
      const aimAlong = -s.lengthM * 0.5 + s.lengthM * t / s.fireS;
      out.pitch = detMath.atan2(-_o.u, Math.max(1, aimAlong - _o.a));
    }
  }
  return out;
}

/** The time (mode clock) the aircraft has left the battle for good: past its egress, far off. */
export function runExitS(rules: AirSupportRules, strike: Pick<RunRecord, 'kind' | 'landsS'>): number {
  const p = planOf(rules, strike.kind);
  return p ? strike.landsS + p.exitS : strike.landsS + rules.artillery.fireS + 1;
}

const _scratchPose: RunPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 };
/** The aircraft's velocity (m/s) at `timeS`, from the run (a central difference over 10 ms: exact for the arcs' scale). */
export function runVelocity(rules: AirSupportRules, strike: RunRecord, timeS: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const h = 0.005;
  runPose(rules, strike, timeS + h, _scratchPose);
  const x1 = _scratchPose.x, y1 = _scratchPose.y, z1 = _scratchPose.z;
  runPose(rules, strike, timeS - h, _scratchPose);
  out.x = (x1 - _scratchPose.x) / (2 * h); out.y = (y1 - _scratchPose.y) / (2 * h); out.z = (z1 - _scratchPose.z) / (2 * h);
  return out;
}

/**
 * Where a round leaves the aircraft (written into `out`), in the airframe's own frame (nose +Z, port +X, up +Y) turned by
 * the pose's yaw and pitch: the strafing jet's GAU-8 under the nose (strikeJetAirframe.ts muzzle), the bomb from the
 * port wing's pylon (its GBU-12), the AC-130's guns along its left side; the battery's round has no aircraft.
 */
export function runMuzzle(pose: RunPose, kind: AirStrikeKind, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const local = kind === 'strafe' ? STRAFE_MUZZLE : kind === 'bomb' ? BOMB_PYLON : kind === 'gunship' ? GUNSHIP_GUNS : null;
  if (!local) { out.x = pose.x; out.y = pose.y; out.z = pose.z; return out; }
  const sy = detMath.sin(pose.yaw), cy = detMath.cos(pose.yaw), sp = detMath.sin(pose.pitch), cp = detMath.cos(pose.pitch);
  // nose (sy cp, sp, cy cp); body up (-sy sp, cp, -cy sp); port (cy, 0, -sy)
  out.x = pose.x + sy * cp * local[2] - sy * sp * local[1] + cy * local[0];
  out.y = pose.y + sp * local[2] + cp * local[1];
  out.z = pose.z + cy * cp * local[2] - cy * sp * local[1] - sy * local[0];
  return out;
}
/** (port, up, nose) offsets in the airframe: strikeJetAirframe.ts (its muzzle, the port GBU-12's pylon), the AC-130's
 *  side guns. */
const STRAFE_MUZZLE = Object.freeze([0.1, -0.3, 8.55] as const);
const BOMB_PYLON = Object.freeze([3.9, -0.78, 1.1] as const);
const GUNSHIP_GUNS = Object.freeze([2.2, -0.8, 0] as const);

/** The strafing lane's start: the point the dive's line meets, half the lane short of the mark along the heading. */
export function strafeLaneStart(rules: AirSupportRules, strike: Pick<RunRecord, 'x' | 'z' | 'heading'>, out: { x: number; z: number }): { x: number; z: number } {
  const half = rules.strafe.lengthM * 0.5;
  out.x = strike.x - detMath.sin(strike.heading) * half;
  out.z = strike.z - detMath.cos(strike.heading) * half;
  return out;
}

const footprints = new WeakMap<AirSupportRules, Map<AirStrikeKind, StrikeFootprint>>();
/** A kind's footprint, from its run (made once per rules and kind: the presentation reads it every frame). */
export function runFootprint(rules: AirSupportRules, kind: AirStrikeKind): StrikeFootprint {
  let byKind = footprints.get(rules);
  if (!byKind) { byKind = new Map(); footprints.set(rules, byKind); }
  let footprint = byKind.get(kind);
  if (!footprint) { footprint = Object.freeze(makeFootprint(rules, kind)); byKind.set(kind, footprint); }
  return footprint;
}
function makeFootprint(rules: AirSupportRules, kind: AirStrikeKind): StrikeFootprint {
  // the recon pass: its track along the heading and the swath it reveals either side
  if (kind === 'recon') return { shape: 'lane', halfLengthM: rules.recon.trackM * 0.5, halfWidthM: rules.recon.revealM };
  // the strafing run: the lane the gun walks, from the dive line's ground point along the run's axis
  if (kind === 'strafe') return { shape: 'lane', halfLengthM: rules.strafe.lengthM * 0.5, halfWidthM: rules.strafe.halfWidthM };
  // the bomb: its blast round every point it can land on (its miss is long along the run, short across it)
  if (kind === 'bomb') return { shape: 'ellipse', alongM: rules.bomb.radiusM + rules.bomb.missAlongM, acrossM: rules.bomb.radiusM + rules.bomb.missAcrossM };
  // the AC-130: the ring it flies round the mark, which is also the reach its guns engage in
  if (kind === 'gunship') return { shape: 'orbit', radiusM: rules.gunship.radiusM };
  return { shape: 'circle', radiusM: rules.artillery.radiusM };
}

/** Whether a ground point lies in a footprint about a mark and heading, widened by `marginM`. */
export function footprintCovers(footprint: StrikeFootprint, mark: Pick<RunRecord, 'x' | 'z' | 'heading'>, x: number, z: number, marginM: number): boolean {
  const dx = x - mark.x, dz = z - mark.z;
  if (footprint.shape === 'circle' || footprint.shape === 'orbit') return detMath.hypot(dx, dz) <= footprint.radiusM + marginM;
  const sinH = detMath.sin(mark.heading), cosH = detMath.cos(mark.heading);
  const along = dx * sinH + dz * cosH, across = dx * cosH - dz * sinH;
  if (footprint.shape === 'lane') return Math.abs(along) <= footprint.halfLengthM + marginM && Math.abs(across) <= footprint.halfWidthM + marginM;
  const a = footprint.alongM + marginM, b = footprint.acrossM + marginM;
  if (!(a > 0) || !(b > 0)) return false;
  return (along / a) ** 2 + (across / b) ** 2 <= 1;
}
