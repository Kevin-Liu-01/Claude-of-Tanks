#!/usr/bin/env node
/**
 * Vehicle physics torture harness (PR #9 physics lane, 2026-10-03; owner: "make our game physics a lot better and
 * less glitchy and be able to handle our extreme gravity modes and have special edge cases while also maintaining
 * perfect beautiful suspension").
 *
 * Every case runs through the real network authority (sim/authoritativeMatch.ts: the movement step with its
 * collider, the structure support field, the hull-on-hull contact pass, the ram momentum exchange, the impact laws)
 * over a synthetic world — analytic terrain seated through the rendered contact surface the game uses
 * (world/terrainContactSurface.ts) plus collision primitives — so the numbers are the production composition's.
 * The ruleset is the target world's physics (gravity, rebound, spin limits, speed, jump and recoil launch)
 * relabelled to the standard mode, so no objective machinery (a ball, caches, respawns) moves the hulls.
 *
 * Hull classes: light (BMP-2, 14 t, pivot turns), medium (T-90M), main battle (M1A2), heavy (Jagdpanzer E-100,
 * 130 t), tall (M3A3 Bradley, 3.7 m), low (UDES 03, 1.9 m hydropneumatic casemate), fast (Object 695, 84 km/h),
 * long (Challenger 3X, 9.2 m). The fleet has no wheeled vehicle.
 * Worlds: Earth (standard), Earth in Gravity Mode (1 g on the mode's physics), Mars 0.38 g, Moon 0.17 g, Turbo
 * (0.6 g, 1.85x speed, 13 m/s jumps, x12 recoil launches).
 *
 * Glitch metrics per run (see `newMetrics`): NaN/Infinity anywhere in the movement state; unexplained position
 * and attitude steps (pops and snaps: motion the velocities do not account for); rendered-attitude angular jerk;
 * the armor shell below the ground; residual overlap with obstacles and other hulls after the step; a hull
 * standing below a roof it stands on; suspension compression past its travel; tunnelling through a wall; energy
 * gained in flight and rebounds above the restitution law; rest jitter and creep; stuck time with throttle held;
 * suspension oscillation after a disturbance; and the prediction replay divergence (the authority's checkpoint
 * replayed through the client's prediction world for the same inputs, as LocalPredictor does).
 *
 *   node tools/physics-torture.mjs                          the default matrix (every hull, world and case)
 *   node tools/physics-torture.mjs --hulls=medium,heavy --worlds=moon --cases=land-tank,stack3
 *   node tools/physics-torture.mjs --json --out=report.json  machine-readable results
 *   node tools/physics-torture.mjs --field --maps=verdant,mars --seconds=120
 *                                                            real maps, real collision, 14v14 bots per world
 *
 * Node-only and deterministic: the same arguments always print the same numbers.
 */
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { Vector3 } from 'three';
import { ensureAuthorityFleet } from '../src/vehicles/authorityFleet.ts';
import { getSpec } from '../src/vehicles/specs.ts';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.ts';
import { matchRulesetFor } from '../src/sim/matchRuleset.ts';
import {
  SIM_DT, applyShellKnock, createTankState, fireRecoil, resetTankVerticalState, updateTank,
} from '../src/sim/movement.ts';
import { applyMovementPredictionState, captureMovementPredictionState } from '../src/sim/movementPredictionState.ts';
import { PLAYER_ACTION_BITS } from '../src/sim/playerActions.ts';
import { tankBodyTopM, tankContactRect } from '../src/sim/tankContactShape.ts';
import { prefersVerticalTankContact, tanksVerticallyClear } from '../src/sim/tankBodyContacts.ts';
import { createTerrainContactSampler } from '../src/world/terrainContactSurface.ts';
import * as collisionModule from '../src/world/collision.ts';
import { createPredictionWorld } from '../src/mp/presentation/predictionWorld.ts';

const { hullPassesObstacleTop, pointInsideCollisionRecord, pushHullFromHull, pushHullFromObstacle, setObbShape } = collisionModule;
// the standing rule's underside (physics lane); a tree without it (the A/B base) reads the root, as its own rule did
const hullUndersideOver = collisionModule.hullUndersideOver
  ?? ((_record, _cx, _cz, _fx, _fz, _rx, _rz, _hl, _hw, rootY) => rootY);
import { ASSAULT_TRENCH, FIELD_TRENCH, trenchProfile } from '../src/sim/assaultLines.ts';

const DT = SIM_DT;
const G = 9.81;

// ---- hull classes and gravity worlds -----------------------------------------------------------------------------
export const HULLS = Object.freeze({
  light: 'bmp2',
  medium: 't90m',
  mbt: 'm1a2',
  heavy: 'jpz_e100_x',
  tall: 'm3a3_bradley',
  low: 'udes03',
  fast: 'object695_x',
  long: 'challenger_3x',
});

/** The ruleset a world plays by, relabelled to the standard objective (the physics trio and launches kept). */
function worldRuleset(mode, arrangement = null) {
  const source = matchRulesetFor(mode, null, arrangement);
  return Object.freeze({
    ...source,
    mode: 'standard',
    criticalDamage: false,
    respawnS: null,
    timeLimitS: null,
    allies: null,
    enemies: null,
    mars: undefined,
  });
}

export const WORLDS = Object.freeze({
  earth: { mode: 'standard', label: 'Earth 1 g (standard)', ruleset: () => worldRuleset('standard') },
  gearth: { mode: 'mars', label: 'Earth 1 g (Gravity Mode)', ruleset: () => worldRuleset('mars', { mode: 'mars', marsGravity: 'earth' }) },
  mars: { mode: 'mars', label: 'Mars 0.38 g', ruleset: () => worldRuleset('mars', { mode: 'mars', marsGravity: 'mars' }) },
  moon: { mode: 'mars', label: 'Moon 0.17 g', ruleset: () => worldRuleset('mars', { mode: 'mars', marsGravity: 'moon' }) },
  turbo: { mode: 'turbo_ball', label: 'Turbo 0.6 g x1.85', ruleset: () => worldRuleset('turbo_ball') },
});

// ---- terrain library (analytic; the support samples it through the rendered contact surface) --------------------
const RAD = Math.PI / 180;
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smoothstep = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export const TERRAIN = {
  flat: () => () => 0,
  /** A grade along +z (nose up driving forward), flattening to level ground after `len` metres each way. */
  slopeAlong: (deg, len = 40) => (_x, z) => Math.tan(deg * RAD) * Math.max(-len, Math.min(len, z)),
  slopeAcross: (deg, len = 40) => (x) => Math.tan(deg * RAD) * Math.max(-len, Math.min(len, x)),
  /** A step of height h at z = at (the contact surface turns it into a 1.33 m ramp, as every terrain step is). */
  step: (h, at) => (_x, z) => (z > at ? h : 0),
  /** A raised band (a kerb or a berm) of height h and width w starting at z = at. */
  kerb: (h, at, w = 1.2) => (_x, z) => (z > at && z < at + w ? h : 0),
  trench: (depth, at, w) => (_x, z) => (z > at && z < at + w ? -depth : 0),
  /** The game's own trench cross-section (sim/assaultLines.ts trenchProfile) centred on z = at. */
  gameTrench: (profile, at) => (_x, z) => -profile.depthM * trenchProfile(z - at, profile.floorHalfWidthM, profile.wallRunM),
  crater: (depth, radius, cx, cz) => (x, z) => {
    const r = Math.hypot(x - cx, z - cz);
    const bowl = r < radius ? -depth * (1 - (r / radius) ** 2) : 0;
    return bowl + 0.45 * Math.exp(-(((r - radius) / 1.6) ** 2));
  },
  rubble: (seed, amp = 0.45) => {
    const rng = mulberry32(seed);
    const bumps = [];
    for (let i = 0; i < 160; i++) {
      bumps.push({ x: (rng() - 0.5) * 30, z: rng() * 120 - 10, r: 0.6 + rng() * 1.4, h: (rng() - 0.35) * amp * 2 });
    }
    return (x, z) => {
      let h = 0;
      for (const b of bumps) {
        const d2 = (x - b.x) ** 2 + (z - b.z) ** 2;
        if (d2 < 9 * b.r * b.r) h += b.h * Math.exp(-d2 / (b.r * b.r));
      }
      return h;
    };
  },
  /** A 0.3 m discontinuity line crossing the path diagonally (two height sources meeting). */
  seam: (dh = 0.3, at = 20) => (x, z) => (z - at > 0.35 * x ? dh : 0) + 0.04 * Math.sin(z * 0.7),
  washboard: (amp, wavelength, at = 10) => (_x, z) => (z > at ? amp * Math.sin((z - at) * 2 * Math.PI / wavelength) : 0),
  /** Drop-off: level ground to z = at, then `height` lower. */
  cliff: (height, at) => (_x, z) => (z > at ? -height : 0),
  /** A kicker ramp rising at `deg` over `len` metres from z = at, then dropping back to the ground. */
  kicker: (deg, len, at) => (_x, z) => (z > at && z < at + len ? (z - at) * Math.tan(deg * RAD) : 0),
  /** A valley a bridge spans (z in [a, b], depth d, 30 degree banks). */
  valley: (a, b, d) => (_x, z) => {
    if (z <= a || z >= b) return 0;
    const bank = d / Math.tan(30 * RAD);
    return -d * Math.min(1, (z - a) / bank, (b - z) / bank);
  },
  /** A lake bed: 1.4 m deep between banks of 14 degrees (the drive ground there is soft). */
  lake: (a, b, d = 1.4) => (_x, z) => {
    if (z <= a || z >= b) return 0;
    const bank = d / Math.tan(14 * RAD);
    return -d * Math.min(1, (z - a) / bank, (b - z) / bank);
  },
  /** A face that steepens (a circular arc of radius r from z = at) past what tracks hold, then runs on at maxDeg. */
  quarterPipe: (at, r, maxDeg) => {
    const reach = r * Math.sin(maxDeg * RAD), top = r - Math.sqrt(r * r - reach * reach), grade = Math.tan(maxDeg * RAD);
    return (_x, z) => {
      const d = z - at;
      if (d <= 0) return 0;
      return d < reach ? r - Math.sqrt(r * r - d * d) : top + (d - reach) * grade;
    };
  },
  sum: (...fns) => (x, z) => { let h = 0; for (const fn of fns) h += fn(x, z); return h; },
};

/** Collision primitives (world AABB + tight footprint), as the map manifests publish them. */
export function box(cx, cz, halfWidth, halfLength, bottom, top, { yaw = 0, crushable = false, kind = 'block' } = {}) {
  const record = { min: [0, bottom, 0], max: [0, top, 0], kind, crushable };
  return setObbShape(record, cx, cz, halfWidth, halfLength, yaw);
}

// ---- cases --------------------------------------------------------------------------------------------------------
// t is seconds since the start. `input(t)` must be a pure function of time (the prediction replay reads future ticks).
const hold = (throttle = 0, steer = 0, brake = false) => () => ({ throttle, steer, brake });
const after = (t0, a, b) => (t) => (t < t0 ? a(t) : b(t));

export const CASES = [
  // REST: the hull settles, then must stand still (no jitter, no creep) — coast hold, then brake hold
  { id: 'rest-flat', group: 'rest', seconds: 6, terrain: TERRAIN.flat(), input: hold(), rest: [2, 6] },
  { id: 'rest-slope15', group: 'rest', seconds: 7, terrain: TERRAIN.slopeAlong(15), input: hold(), rest: [3, 7] },
  { id: 'rest-slope25', group: 'rest', seconds: 7, terrain: TERRAIN.slopeAlong(25), input: hold(0, 0, true), rest: [3, 7] },
  { id: 'rest-cross20', group: 'rest', seconds: 7, terrain: TERRAIN.slopeAcross(20), input: hold(), rest: [3, 7] },
  { id: 'rest-rubble', group: 'rest', seconds: 7, terrain: TERRAIN.rubble(11, 0.35), spawn: { z: 14 }, input: hold(), rest: [3, 7] },
  { id: 'rest-kerb', group: 'rest', seconds: 7, terrain: TERRAIN.step(0.35, 0.4), input: hold(), rest: [3, 7] },
  { id: 'rest-roof', group: 'rest', seconds: 7, terrain: TERRAIN.flat(), obstacles: [box(0, 0, 7, 9, 0, 4)],
    spawn: { dropTo: 4.6 }, input: hold(), rest: [3, 7] },
  { id: 'rest-wreck', group: 'rest', seconds: 8, terrain: TERRAIN.flat(), extras: [{ id: 'wreck', specId: 't90m', x: 0, z: 0, wreck: true }],
    spawn: { x: 0.3, z: 0.4, dropTo: 3.2 }, input: hold(), rest: [4, 8] },
  { id: 'rest-bridge', group: 'rest', seconds: 7, terrain: TERRAIN.valley(-14, 14, 6),
    obstacles: [box(0, 0, 4.5, 16, -1.1, 0, { kind: 'bridge' })], spawn: { dropTo: 0.6 }, input: hold(), rest: [3, 7] },
  { id: 'rest-inverted', group: 'rest', seconds: 8, terrain: TERRAIN.flat(), spawn: { dropTo: 2.5, roll: Math.PI }, input: hold(), rest: [4, 8] },

  // DRIVE: full throttle across the feature (flying start where marked); stuck time, pops, snaps, penetration
  { id: 'drive-kerb', group: 'drive', seconds: 5, terrain: TERRAIN.kerb(0.3, 12, 2.8), spawn: { speed: 'top' }, input: hold(1), drive: [0, 5] },
  { id: 'drive-step60', group: 'drive', seconds: 6, terrain: TERRAIN.step(0.6, 12), input: hold(1), drive: [0, 6] },
  { id: 'drive-step120', group: 'drive', seconds: 7, terrain: TERRAIN.step(1.2, 12), input: hold(1), drive: [0, 7], allowBlocked: true },
  { id: 'drive-rubble', group: 'drive', seconds: 7, terrain: TERRAIN.rubble(7), spawn: { speed: 'top' }, input: hold(1), drive: [0, 7] },
  { id: 'drive-trench', group: 'drive', seconds: 7, terrain: TERRAIN.trench(2, 14, 3.5), input: hold(1), drive: [0, 7], allowBlocked: true },
  { id: 'drive-field-trench', group: 'drive', seconds: 7, terrain: TERRAIN.gameTrench(FIELD_TRENCH.profile, 22), spawn: { speed: 'top' },
    input: hold(1), drive: [0, 7] },
  { id: 'drive-assault-trench', group: 'drive', seconds: 9, terrain: TERRAIN.gameTrench(ASSAULT_TRENCH, 16), input: hold(1), drive: [0, 9] },
  { id: 'drive-crater', group: 'drive', seconds: 9, terrain: TERRAIN.crater(3, 8, 0, 18), input: hold(1), drive: [0, 9] },
  { id: 'drive-seam', group: 'drive', seconds: 5, terrain: TERRAIN.seam(), spawn: { speed: 'top' }, input: hold(1, 0.15), drive: [0, 5] },
  { id: 'drive-washboard', group: 'drive', seconds: 6, terrain: TERRAIN.washboard(0.12, 2.6), spawn: { speed: 'top' }, input: hold(1), drive: [0, 6] },
  { id: 'drive-block60', group: 'drive', seconds: 6, terrain: TERRAIN.flat(), obstacles: [box(0, 14, 6, 0.6, 0, 0.6, { kind: 'block' })],
    input: hold(1), drive: [0, 6], allowBlocked: true },
  { id: 'drive-bridge', group: 'drive', seconds: 7, terrain: TERRAIN.valley(10, 38, 6),
    obstacles: [box(0, 24, 4.5, 16, -1.1, 0, { kind: 'bridge' })], input: hold(1), drive: [0, 7] },
  { id: 'drive-lake', group: 'drive', seconds: 10, terrain: TERRAIN.lake(8, 40),
    ground: (_x, z) => (z > 8 && z < 40 ? 'soft' : 'medium'), input: hold(1), drive: [0, 10] },
  { id: 'drive-climb30', group: 'drive', seconds: 8, terrain: TERRAIN.slopeAlong(30, 60), spawn: { z: -8 }, input: hold(1), drive: [0, 8], allowBlocked: true },
  { id: 'drive-side30', group: 'drive', seconds: 6, terrain: TERRAIN.slopeAcross(30), spawn: { speed: 'top' }, input: hold(1), drive: [0, 6] },
  { id: 'drive-side40', group: 'drive', seconds: 6, terrain: TERRAIN.slopeAcross(40), spawn: { speed: 'top' }, input: hold(1), drive: [0, 6], allowBlocked: true },
  { id: 'drive-hardstop', group: 'drive', seconds: 6, terrain: TERRAIN.flat(), spawn: { speed: 'top' },
    input: after(1, hold(1), hold(0, 0, true)), settle: 1, rest: [4.5, 6] },
  { id: 'drive-slalom', group: 'drive', seconds: 7, terrain: TERRAIN.flat(), spawn: { speed: 'top' },
    input: (t) => ({ throttle: 1, steer: Math.sign(Math.sin(t * 1.6)) || 1, brake: false }), drive: [0, 7] },

  // AIR: jumps, launches, drops and the landings (durations follow the world: a Moon jump flies for 15 s).
  // Jump and launch cases run only where the mode has them (the standard mode has neither).
  { id: 'jump-flat', group: 'air', seconds: (w) => 1 + w.jumpFlightS + 4, terrain: TERRAIN.flat(), input: hold(),
    actions: [{ t: 1, kind: 'jump' }], rest: 'tail', modes: 'jump' },
  { id: 'jump-run', group: 'air', seconds: (w) => 1 + w.jumpFlightS + 3, terrain: TERRAIN.flat(), spawn: { speed: 'top' }, input: hold(1),
    actions: [{ t: 0.8, kind: 'jump' }], modes: 'jump' },
  { id: 'jump-slope', group: 'air', seconds: (w) => 2 + w.jumpFlightS + 4, terrain: TERRAIN.slopeAlong(15), input: hold(),
    actions: [{ t: 2, kind: 'jump' }], rest: 'tail', modes: 'jump' },
  { id: 'jump-mash', group: 'air', seconds: (w) => 8 + w.jumpFlightS * 2, terrain: TERRAIN.flat(), input: hold(),
    actions: Array.from({ length: 18 }, (_, i) => ({ t: 1 + i * 0.36, kind: 'jump' })), modes: 'jump' },
  { id: 'launch-down', group: 'air', seconds: (w) => 1 + w.dropS(30) + 4, terrain: TERRAIN.flat(), input: hold(),
    actions: [{ t: 1, kind: 'launch', dir: [0, -1, 0] }], modes: 'launch' },
  { id: 'launch-back', group: 'air', seconds: (w) => 1 + w.dropS(20) + 4, terrain: TERRAIN.flat(), input: hold(),
    actions: [{ t: 1, kind: 'launch', dir: [0, -0.35, -0.94] }], modes: 'launch' },
  { id: 'cliff-10', group: 'air', seconds: (w) => 1 + w.dropS(10) + 4, terrain: TERRAIN.cliff(10, 14), spawn: { speed: 'top' }, input: hold(1) },
  { id: 'cliff-30', group: 'air', seconds: (w) => 1 + w.dropS(30) + 4, terrain: TERRAIN.cliff(30, 14), spawn: { speed: 'top' }, input: hold(0.4) },
  // Sirocco Wadi, Zone Control, seed 57001 (maps lane, 2026-10-03): climbing a face too steep for the tracks at speed,
  // the grade rule stopped the hull and the ride flew on at the climb's 11 m/s — 5.7 m up and a 922 hp landing
  { id: 'climb-face', group: 'drive', seconds: 8, terrain: TERRAIN.quarterPipe(14, 14, 60), spawn: { speed: 'top' }, input: hold(1),
    grounded: true, allowBlocked: true },
  { id: 'kicker', group: 'air', seconds: (w) => 2 + w.dropS(8) * 2 + 3, terrain: TERRAIN.kicker(22, 7, 14), spawn: { speed: 'top' }, input: hold(1) },
  { id: 'land-slope', group: 'air', seconds: (w) => w.dropS(8) + 6, terrain: TERRAIN.slopeAlong(25), spawn: { dropTo: 8 }, input: hold(0, 0, true), rest: 'tail' },
  { id: 'land-tank', group: 'air', seconds: (w) => w.dropS(7) + 6, terrain: TERRAIN.flat(), extras: [{ id: 'lower', specId: 'm1a2', x: 0, z: 0 }],
    spawn: { x: 0.4, z: 0.6, dropTo: 7 }, input: hold(), rest: 'tail' },
  { id: 'land-wreck', group: 'air', seconds: (w) => w.dropS(7) + 6, terrain: TERRAIN.flat(), extras: [{ id: 'wreck', specId: 't90m', x: 0, z: 0, wreck: true }],
    spawn: { x: -0.8, z: 1.2, dropTo: 7, yaw: 0.7 }, input: hold(), rest: 'tail' },
  { id: 'land-roof', group: 'air', seconds: (w) => w.dropS(8) + 6, terrain: TERRAIN.flat(), obstacles: [box(0, 0, 7, 9, 0, 4)], spawn: { dropTo: 8 },
    input: hold(), rest: 'tail' },
  { id: 'land-roof-edge', group: 'air', seconds: (w) => w.dropS(6) + 6, terrain: TERRAIN.flat(), obstacles: [box(0, 6, 7, 6, 0, 4)], spawn: { dropTo: 6 },
    input: hold(), rest: 'tail' },
  { id: 'land-bank', group: 'air', seconds: (w) => w.dropS(9) + 6, terrain: TERRAIN.lake(-2, 30), ground: (_x, z) => (z > -2 && z < 30 ? 'soft' : 'medium'),
    spawn: { dropTo: 9, z: 1 }, input: hold(), rest: 'tail' },
  { id: 'land-nose', group: 'air', seconds: (w) => w.dropS(9) + 6, terrain: TERRAIN.flat(), spawn: { dropTo: 9, pitch: -0.55 }, input: hold(), rest: 'tail' },
  { id: 'land-roll', group: 'air', seconds: (w) => w.dropS(9) + 6, terrain: TERRAIN.flat(), spawn: { dropTo: 9, roll: 0.7 }, input: hold(), rest: 'tail' },
  // Sirocco Wadi, Zone Control, seed 57001 (maps lane, 2026-10-03): an M1A2 on its side, yawing, dropped onto a
  // 40-degree wadi face; its landing read the support envelope's swing as a rising floor (12.8 m/s for a 7.3 m/s fall)
  { id: 'tumble-slope', group: 'air', seconds: (w) => w.dropS(3) + 5, terrain: TERRAIN.slopeAcross(38), spawn: { dropTo: 3, roll: 1.15 },
    input: hold(0, 1), actions: [{ t: 0.02, kind: 'spin', pitchV: 0.9, rollV: 0.5 }] },
  { id: 'land-inverted', group: 'air', seconds: (w) => w.dropS(6) + 9, terrain: TERRAIN.flat(), spawn: { dropTo: 6, roll: Math.PI }, input: hold(),
    actions: [{ t: (w) => w.dropS(6) + 3, kind: 'selfRight' }], rest: 'tail' },
  { id: 'air-spin', group: 'air', seconds: (w) => 1 + w.jumpFlightS + 5, terrain: TERRAIN.flat(), input: hold(),
    actions: [{ t: 1, kind: 'jump' }, { t: 1.05, kind: 'spin', pitchV: 2.5, rollV: 1.5 }], rest: 'tail', modes: 'jump' },

  // CONTACT: rams, walls, wedges, stacks, rollovers, the map edge, tunnelling
  { id: 'ram-headon', group: 'contact', seconds: 5, terrain: TERRAIN.flat(), spawn: { speed: 'top' },
    extras: [{ id: 'oncoming', specId: 'same', x: 0, z: 30, yaw: Math.PI, speed: 'top', input: hold(1) }], input: hold(1) },
  { id: 'ram-tbone', group: 'contact', seconds: 5, terrain: TERRAIN.flat(), spawn: { speed: 'top' },
    extras: [{ id: 'parked', specId: 't90m', x: 0, z: 20, yaw: Math.PI / 2 }], input: hold(1) },
  { id: 'push-parked', group: 'contact', seconds: 8, terrain: TERRAIN.flat(),
    extras: [{ id: 'parked', specId: 't90m', x: 0, z: 9.5, yaw: 0 }], input: hold(1), drive: [0, 8] },
  { id: 'wall-crash', group: 'contact', seconds: 5, terrain: TERRAIN.flat(), obstacles: [box(0, 22, 12, 1, 0, 6, { kind: 'wall' })],
    spawn: { speed: 'top' }, input: hold(1), allowBlocked: true, wall: { z: 21 } },
  { id: 'wall-thin', group: 'contact', seconds: 4, terrain: TERRAIN.flat(), obstacles: [box(0, 22, 12, 0.12, 0, 5, { kind: 'wall' })],
    spawn: { speed: 'top' }, input: hold(1), allowBlocked: true, wall: { z: 22 } },
  { id: 'wall-thin-launch', group: 'contact', seconds: 4, terrain: TERRAIN.flat(), obstacles: [box(0, 22, 12, 0.12, 0, 5, { kind: 'wall' })],
    spawn: { speed: 45 }, input: hold(1), allowBlocked: true, wall: { z: 22 } },
  { id: 'wedge', group: 'contact', seconds: 8, terrain: TERRAIN.flat(),
    obstacles: [box(-3.4, 18, 1, 8, 0, 4, { yaw: 0.35, kind: 'wall' }), box(3.4, 18, 1, 8, 0, 4, { yaw: -0.35, kind: 'wall' })],
    input: after(5, hold(1), hold(-1)), drive: [5.5, 8], allowBlocked: true },
  { id: 'stack3', group: 'contact', seconds: 10, terrain: TERRAIN.flat(),
    extras: [{ id: 'base', specId: 'm1a2', x: 0, z: 0 }, { id: 'middle', specId: 't90m', x: 0.2, z: 0.3, dropTo: 3.4 }],
    spawn: { x: -0.1, z: -0.2, dropTo: 7.5 }, input: hold(), rest: [7, 10] },
  { id: 'sandwich', group: 'contact', seconds: 7, terrain: TERRAIN.flat(), obstacles: [box(0, 24, 12, 1, 0, 6, { kind: 'wall' })],
    extras: [{ id: 'victim', specId: 't90m', x: 0, z: 14, yaw: 0 }], input: hold(1), allowBlocked: true },
  { id: 'rollover-kerb', group: 'contact', seconds: 7, terrain: TERRAIN.flat(),
    obstacles: [box(9, 0, 0.6, 14, 0, 0.7, { kind: 'kerb' })], spawn: { yaw: Math.PI / 2, speed: 'top' }, input: hold(1), allowBlocked: true },
  { id: 'border', group: 'contact', seconds: 5, terrain: TERRAIN.flat(), spawn: { x: 440, yaw: Math.PI / 2, speed: 'top' },
    input: hold(1), allowBlocked: true },
  { id: 'knock-flip', group: 'contact', seconds: 8, terrain: TERRAIN.flat(), input: hold(), actions: [{ t: 1, kind: 'knock', dir: [1, 0.25, 0], mps: 9 }] },
];

// ---- world construction ------------------------------------------------------------------------------------------
function makeWorld(caseDef) {
  const fn = caseDef.terrain;
  const contact = createTerrainContactSampler(fn);
  const ground = caseDef.ground ?? (() => 'medium');
  const heightField = {
    getHeightAt: fn,
    getHeightAtFast: fn,
    getContactHeightAt: contact,
    getGroundType: ground,
    getDriveGroundType: ground,
    getNormalAt(x, z) {
      const e = 0.25;
      const dx = (contact(x + e, z) - contact(x - e, z)) / (2 * e);
      const dz = (contact(x, z + e) - contact(x, z - e)) / (2 * e);
      return new Vector3(-dx, 1, -dz).normalize();
    },
  };
  const obstacles = (caseDef.obstacles ?? []).map((record) => ({ ...record, min: [...record.min], max: [...record.max] }));
  const worldCollision = {
    mapId: 'verdant',
    heightField,
    getObstacles: () => obstacles,
    queryObstacles(minX, minZ, maxX, maxZ, out) {
      out.length = 0;
      for (const record of obstacles) {
        if (record.max[0] < minX || record.min[0] > maxX || record.max[2] < minZ || record.min[2] > maxZ) continue;
        out.push(record);
      }
      return out;
    },
    crushObstacle: () => true,
  };
  return { fn, contact, heightField, obstacles, worldCollision };
}

/** The highest standable primitive top under (x, z) at or below `ceiling`, else -Infinity (measurement only). */
// `floors` (optional): each record's own belly line, the sim's floor rule (structureSupport.ts beginHull with a pose)
function structureTop(obstacles, x, z, ceiling = Infinity, floors = null) {
  let best = -Infinity;
  for (let i = 0; i < obstacles.length; i++) {
    const record = obstacles[i];
    const limit = floors ? floors[i] + 0.55 : ceiling;
    if (record.crushed || record.max[1] - record.min[1] < 0.9 || record.max[1] > limit) continue;
    if (x < record.min[0] || x > record.max[0] || z < record.min[2] || z > record.max[2]) continue;
    if (pointInsideCollisionRecord(record, record.shape2 ?? null, x, z) && record.max[1] > best) best = record.max[1];
  }
  return best;
}

// ---- metrics -------------------------------------------------------------------------------------------------------
const STATE_FIELDS = [
  ['pos', 'x'], ['pos', 'y'], ['pos', 'z'], [null, 'yaw'], [null, 'speed'], [null, 'verticalSpeed'], [null, 'yawRate'],
  [null, 'visualPitch'], [null, 'visualRoll'], [null, 'turretYaw'], [null, 'gunPitch'],
  ['_spring', 'pitch'], ['_spring', 'roll'], ['_spring', 'pitchV'], ['_spring', 'rollV'], ['_spring', 'recoilVX'], ['_spring', 'recoilVZ'],
  ['_ride', 'y'], ['_ride', 'v'], ['_ride', 'groundV'], ['_susp', 'p'], ['_susp', 'r'], ['_susp', 'pv'], ['_susp', 'rv'],
  ['_sup', 'y'], ['_sup', 'floorY'], ['_terr', 'pitch'], ['_terr', 'roll'], ['trackScroll', 'l'], ['trackScroll', 'r'],
];
function nonFinite(state) {
  for (const [group, key] of STATE_FIELDS) {
    const value = group ? state[group]?.[key] : state[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return `${group ? `${group}.` : ''}${key}`;
  }
  return null;
}
const wrap = (a) => {
  a %= 2 * Math.PI;
  if (a > Math.PI) a -= 2 * Math.PI;
  else if (a <= -Math.PI) a += 2 * Math.PI;
  return a;
};
/** The attitude the renderer composes (tankFactoryCore syncFromState): sim spring + amplified rock, sway, flinch. */
function renderedAttitude(state, out) {
  out.pitch = state.visualPitch + (state._susp?.p ?? 0) * 2.2 - (state._flinch?.p ?? 0);
  out.roll = state.visualRoll + (state._susp?.r ?? 0) * 1.9 + (state._swayEst ?? 0) * 2.4 + (state._flinch?.r ?? 0);
  return out;
}

function newMetrics() {
  return {
    ticks: 0, nan: 0, nanField: null,
    popXZMaxM: 0, popsXZ: 0, popYMaxM: 0, popsY: 0, seatJumpMaxM: 0,
    snapMaxRad: 0, snaps: 0, angRateMaxRadS: 0,
    jerkSamples: [], jerkMaxRadS3: 0,
    bodyPenMaxM: 0, obstaclePenMaxM: 0, hullPenMaxM: 0, stackPenMaxM: 0, roofSinkMaxM: 0, gearCompMaxM: 0,
    tunnelled: false, maxHeightM: 0,
    airS: 0, longestAirS: 0, hops: 0, landings: [], contactLandings: [], maxLandingMps: 0, reboundExcessMps: 0, closingExcessMps: 0,
    liftM: 0,
    energyGainMaxJkg: 0, energyGainSumJkg: 0, apexes: [],
    rest: null, stuckS: 0, longestStuckS: 0, progressM: 0,
    overturnedS: 0, tumblingS: 0, finalUpY: 1, finalOverturned: false,
    settleOscillations: null,
    replay: { samples: 0, maxErrM: 0, sumErrM: 0, maxAttErrRad: 0 },
    impacts: [], falls: [],
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
}

// ---- one run -------------------------------------------------------------------------------------------------------
const NEUTRAL = Object.freeze({ throttle: 0, steer: 0, brake: false });
function playerInput(control) {
  return {
    throttle: control.throttle ?? 0, steer: control.steer ?? 0, brake: !!control.brake, fire: false,
    aimLocked: true, aimYaw: 0, aimPitch: 0, aimDistance: 300, shellSlot: 0, actionBits: 0,
  };
}

function topSpeedMps(entity) {
  return entity.spec.topSpeedKmh / 3.6 * (entity.modeSpeedMultiplier ?? 1);
}

function seatAirborne(entity, world, dropTo, { pitch = 0, roll = 0, vy = 0 } = {}) {
  const state = entity.state;
  const y = Math.max(world.fn(state.pos.x, state.pos.z), structureTop(world.obstacles, state.pos.x, state.pos.z)) + dropTo;
  state._spring.pitch = state.visualPitch = pitch;
  state._spring.roll = state.visualRoll = roll;
  state._spring.pitchV = 0;
  state._spring.rollV = 0;
  resetTankVerticalState(state, y, vy, false);
  if (Math.cos(pitch) * Math.cos(roll) < 0.55) state._body.tumbling = true;
}

/**
 * A grounded spawn the way a pad seats it: the attitude preset to the fitted ground plane (no spring swing from
 * level), the ride reset onto the support solve's seat, then the authority's own 30-tick spawn settle.
 */
function seatGrounded(entity, world) {
  const state = entity.state;
  const field = world.heightField;
  updateTank(entity, field, DT);
  state._spring.pitch = state.visualPitch = state._terr.pitch;
  state._spring.roll = state.visualRoll = state._terr.roll;
  state._spring.pitchV = state._spring.rollV = 0;
  state._sup.x = NaN;
  updateTank(entity, field, DT);
  resetTankVerticalState(state, state._sup.y, 0, true);
  for (let n = 0; n < 30; n++) updateTank(entity, field, DT);
  state.speed = 0;
  state._prevSpeed = 0;
}

/** Copy the authority's state into a fresh replay state the way the client's rewind does (pose + checkpoint). */
function replayStateFrom(entity) {
  const source = entity.state;
  const state = createTankState(entity.spec, source.pos, source.yaw);
  state.speed = source.speed;
  state.verticalSpeed = source.verticalSpeed;
  state.visualPitch = source.visualPitch;
  state.visualRoll = source.visualRoll;
  state.turretYaw = source.turretYaw;
  state.gunPitch = source.gunPitch;
  state.grounded = source.grounded;
  state.overturned = source.overturned;
  state._body.autoRighting = source._body.autoRighting;
  state._body.tumbling = state.overturned || state._body.autoRighting;
  state._prevSpeed = state.speed;
  state._spring.pitch = state.visualPitch;
  state._spring.roll = state.visualRoll;
  state._ride.y = state.pos.y;
  state._ride.v = state.verticalSpeed;
  state._ride.grounded = state.grounded;
  state._ride.airTime = 0;
  state._ride.supportY = NaN;
  const checkpoint = captureMovementPredictionState(source);
  if (checkpoint) applyMovementPredictionState(state, checkpoint, null);
  state._groundType = source._groundType;
  return state;
}

const REPLAY_EVERY = 15;
const REPLAY_TICKS = 12;

export function runCase(hullId, worldId, caseDef, { replay = true, trace = null } = {}) {
  const world = makeWorld(caseDef);
  const worldDef = WORLDS[worldId];
  const ruleset = worldDef.ruleset();
  const spawn = caseDef.spawn ?? {};
  const players = [{ id: 'subject', specId: hullId, team: 'alpha', spawn: { x: spawn.x ?? 0, z: spawn.z ?? 0, yaw: spawn.yaw ?? 0 } }];
  for (const extra of caseDef.extras ?? []) {
    players.push({ id: extra.id, specId: extra.specId === 'same' ? hullId : extra.specId, team: extra.team ?? 'bravo',
      spawn: { x: extra.x ?? 0, z: extra.z ?? 0, yaw: extra.yaw ?? 0 } });
  }
  players.push({ id: 'anchor', specId: 't90m', team: 'bravo', spawn: { x: -300, z: -300, yaw: 0 } });
  const match = createAuthoritativeMatch({ mapId: 'verdant', seed: 4242, countdownS: 0, worldCollision: world.worldCollision,
    ruleset, players });
  match.onMatchReady();
  const subject = match.entityById.get('subject');
  for (const entity of match.entities) {
    entity.combat.hp = entity.combat.maxHp = 1e7;
    // explicit spawns are honoured exactly (placement may nudge them clear of the case's own obstacles)
    const record = players.find((p) => p.id === entity.id);
    if (record?.spawn) {
      entity.state.pos.x = record.spawn.x;
      entity.state.pos.z = record.spawn.z;
      entity.state.yaw = record.spawn.yaw;
      const ground = Math.max(world.fn(record.spawn.x, record.spawn.z), structureTop(world.obstacles, record.spawn.x, record.spawn.z, 1e9));
      resetTankVerticalState(entity.state, ground, 0, true);
      entity.state._sup.x = NaN;
      seatGrounded(entity, world);
    }
  }
  const extrasById = new Map((caseDef.extras ?? []).map((extra) => [extra.id, extra]));
  for (const [id, extra] of extrasById) {
    const entity = match.entityById.get(id);
    if (extra.dropTo != null) seatAirborne(entity, world, extra.dropTo);
    if (extra.wreck) { entity.combat.hp = 0; entity.combat.destroyed = true; }
    if (extra.speed != null) {
      entity.state.speed = extra.speed === 'top' ? topSpeedMps(entity) : extra.speed;
      entity.state._spool = 1;
    }
  }
  if (spawn.dropTo != null) seatAirborne(subject, world, spawn.dropTo, spawn);
  if (spawn.speed != null) {
    subject.state.speed = spawn.speed === 'top' ? topSpeedMps(subject) : spawn.speed;
    subject.state._spool = 1;
    subject.state._prevSpeed = subject.state.speed;
  }

  const metrics = newMetrics();
  const g = G * (ruleset.gravityScale ?? 1);
  const jump = ruleset.jumpMps ?? 6;
  const worldTimes = { g, jumpFlightS: 2 * jump / g + 0.5, dropS: (h) => Math.sqrt(2 * h / g) + 0.5 };
  const seconds = typeof caseDef.seconds === 'function' ? caseDef.seconds(worldTimes) : caseDef.seconds;
  const ticks = Math.round(seconds / DT);
  const restWindow = caseDef.rest === 'tail' ? [seconds - 1.5, seconds] : caseDef.rest;
  const actions = (caseDef.actions ?? []).map((action) => ({ ...action,
    tick: Math.round((typeof action.t === 'function' ? action.t(worldTimes) : action.t) / DT) }));
  const impulseTicks = new Set(actions.map((action) => action.tick));
  const controlAt = (tick) => (caseDef.input ? caseDef.input(tick * DT) : NEUTRAL);
  const inputs = new Map();
  const extraInputs = [...extrasById.values()].filter((extra) => extra.input);
  const gravity = G * (subject.modeGravityScale ?? 1);
  const physics = subject.modePhysics ?? ruleset.physics;
  const rect = tankContactRect(subject.spec);
  const bodyTop = tankBodyTopM(subject.spec);
  // a casemate's hull cloud carries its fixed gun barrel; a barrel that digs in when the hull pitches is the vehicle's
  // own geometry, not a contact the solve owns (recorded as a known limitation) — the metric keeps the hull proper
  const rawHull = subject.spec.armor?.bodyContactPoints?.hull ?? [];
  const hullCloud = [];
  {
    let lo = Infinity, hi = -Infinity;
    for (let i = 1; i < rawHull.length; i += 3) { lo = Math.min(lo, rawHull[i]); hi = Math.max(hi, rawHull[i]); }
    const mid = 0.5 * (lo + hi), reachZ = 0.45 * subject.spec.dims.hullLengthM;
    for (let i = 0; i + 2 < rawHull.length; i += 3) {
      const barrel = subject.spec.armor?.turretless && Math.abs(rawHull[i]) < 0.35 && rawHull[i + 2] > reachZ && rawHull[i + 1] > mid;
      if (!barrel) hullCloud.push(rawHull[i], rawHull[i + 1], rawHull[i + 2]);
    }
  }
  const turretCloud = subject.spec.armor?.bodyContactPoints?.turret ?? [];
  const pivot = subject.spec.armor?.turretPivot ?? [0, 0, 0];
  const push = { x: 0, z: 0 };
  const center = { x: 0, y: 0, z: 0 };
  const floors = new Float64Array(Math.max(1, world.obstacles.length));
  const att = { pitch: 0, roll: 0 };
  const renderedHistory = [];
  const restSamples = [];
  const replays = [];
  let prev = null;
  let airRun = 0;
  let apex = -Infinity;
  let lastAirborne = false;
  let wallSide = 0;
  let stuckRun = 0;
  // the prediction world over the same collision, seeing every other hull where the authority has it now
  const others = match.entities.filter((entity) => entity !== subject);
  let replayState = null;
  const predictionWorld = createPredictionWorld({
    worldCollision: world.worldCollision,
    ownSpec: subject.spec,
    ownState: () => replayState,
    others: () => others.map((entity) => ({ spec: entity.spec, state: entity.state, collidable: true })),
    mode: worldDef.mode,
  });

  for (let tick = 0; tick < ticks; tick++) {
    const t = tick * DT;
    // scripted inputs and impulses
    const control = controlAt(tick);
    const subjectInput = playerInput(control);
    inputs.set('subject', subjectInput);
    for (const extra of extraInputs) inputs.set(extra.id, playerInput(extra.input(t)));
    for (const action of actions) {
      if (action.tick !== tick) continue;
      const state = subject.state;
      // the F key through the authority's own action path: self-right an overturned hull, else jump (when the mode has one)
      if (action.kind === 'jump' || action.kind === 'selfRight') subjectInput.actionBits |= PLAYER_ACTION_BITS.SELF_RIGHT;
      else if (action.kind === 'launch') {
        const [dx, dy, dz] = action.dir;
        const yaw = state.yaw;
        // the shell's world direction (hull frame: +z forward), as the authority's fire path passes it
        const wx = dx * Math.cos(yaw) + dz * Math.sin(yaw);
        const wz = -dx * Math.sin(yaw) + dz * Math.cos(yaw);
        fireRecoil(state, subject.spec, subject.spec.gun.shells?.[0] ?? null,
          { scale: Math.max(1.0001, subject.modeRecoilLaunchScale ?? 1), dirX: wx, dirY: dy, dirZ: wz });
      } else if (action.kind === 'knock') applyShellKnock(state, action.dir[0], action.dir[1], action.dir[2], action.mps);
      else if (action.kind === 'spin') { state._spring.pitchV += action.pitchV; state._spring.rollV += action.rollV; }
    }
    // prediction replay: start one from this tick's authority state, compare REPLAY_TICKS later
    if (replay && predictionWorld && tick > 0 && tick % REPLAY_EVERY === 0 && !subject.combat.destroyed) {
      let clean = true;
      for (let k = tick; k <= tick + REPLAY_TICKS; k++) if (impulseTicks.has(k)) clean = false;
      if (clean) {
        replayState = replayStateFrom(subject);
        predictionWorld.anchor?.(replayState);
        const sim = { spec: subject.spec, state: replayState, combat: { destroyed: false, modules: {}, crew: {}, equipMults: {} },
          contactGeom: null, modeSpeedMultiplier: subject.modeSpeedMultiplier ?? 1, modeGravityScale: subject.modeGravityScale ?? 1,
          modePhysics: predictionWorld.physics ?? null, rigidGear: false,
          input: { throttle: 0, steer: 0, brake: false, aimLocked: true, aimPoint: replayState.aimPoint.clone() } };
        for (let k = 0; k < REPLAY_TICKS; k++) {
          const c = controlAt(tick + k);
          sim.input.throttle = c.throttle ?? 0;
          sim.input.steer = c.steer ?? 0;
          sim.input.brake = !!c.brake;
          predictionWorld.beginStep?.(replayState); // as LocalPredictor.step does
          updateTank(sim, predictionWorld.heightField, DT, predictionWorld.collide);
        }
        replays.push({ due: tick + REPLAY_TICKS, x: replayState.pos.x, y: replayState.pos.y, z: replayState.pos.z,
          pitch: replayState.visualPitch, roll: replayState.visualRoll, yaw: replayState.yaw });
        replayState = null;
      }
    }

    const before = subject.state;
    const pre = {
      x: before.pos.x, y: before.pos.y, z: before.pos.z, yaw: before.yaw, pitch: before.visualPitch, roll: before.visualRoll,
      speed: before.speed, recoil: Math.hypot(before._spring.recoilVX, before._spring.recoilVZ), grounded: before.grounded,
    };
    match.step({ dt: DT, inputs });
    trace?.(tick, match);
    metrics.ticks++;
    const state = subject.state;

    // 1. NaN / Infinity anywhere in the movement state (every hull)
    for (const entity of match.entities) {
      const bad = nonFinite(entity.state);
      if (bad) { metrics.nan++; metrics.nanField ??= `${entity.id}:${bad}`; }
    }
    if (metrics.nan) break;

    // 2. unexplained horizontal and vertical steps (pops)
    const dxz = Math.hypot(state.pos.x - pre.x, state.pos.z - pre.z);
    const allowedXZ = (Math.max(Math.abs(pre.speed), Math.abs(state.speed)) + pre.recoil) * DT
      + 1.2 * Math.abs(state.yawRate) * DT + 0.002;
    const popXZ = dxz - allowedXZ;
    if (popXZ > metrics.popXZMaxM) metrics.popXZMaxM = popXZ;
    if (popXZ > 0.05) metrics.popsXZ++;
    const dy = state.pos.y - pre.y;
    const landed = state.landingImpactMps > 0;
    const popY = Math.abs(dy - state._ride.v * DT);
    if (landed) metrics.seatJumpMaxM = Math.max(metrics.seatJumpMaxM, popY);
    else {
      if (popY > metrics.popYMaxM) metrics.popYMaxM = popY;
      if (popY > 0.05) metrics.popsY++;
    }

    // 3. attitude snaps (motion the angular rates do not account for) and rendered angular jerk
    const dPitch = wrap(state.visualPitch - pre.pitch);
    const dRoll = wrap(state.visualRoll - pre.roll);
    const snap = Math.max(Math.abs(dPitch - state._spring.pitchV * DT), Math.abs(dRoll - state._spring.rollV * DT));
    if (snap > metrics.snapMaxRad) metrics.snapMaxRad = snap;
    if (snap > 0.03) metrics.snaps++;
    metrics.angRateMaxRadS = Math.max(metrics.angRateMaxRadS, Math.abs(dPitch) / DT, Math.abs(dRoll) / DT);
    renderedAttitude(state, att);
    renderedHistory.push(att.pitch, att.roll);
    if (renderedHistory.length > 8) renderedHistory.splice(0, 2);
    if (renderedHistory.length === 8) {
      const h = renderedHistory;
      for (let axis = 0; axis < 2; axis++) {
        const jerk = (h[6 + axis] - 3 * h[4 + axis] + 3 * h[2 + axis] - h[axis]) / (DT * DT * DT);
        const magnitude = Math.abs(jerk);
        metrics.jerkSamples.push(magnitude);
        if (magnitude > metrics.jerkMaxRadS3) metrics.jerkMaxRadS3 = magnitude;
      }
    }

    // 4. penetration: the armor shell under the ground, obstacles and hulls overlapped after the step
    // the shell at the attitude the renderer composes (what a player sees; the support solve clears that pose)
    const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
    const cp = Math.cos(-att.pitch), sp = Math.sin(-att.pitch);
    const cr = Math.cos(att.roll), sr = Math.sin(att.roll);
    // the sim's standing rule: the hull's lowest underside point over each record's footprint (world/collision.ts)
    const fx = sy, fz = cy, rx = cy, rz = -sy;
    center.x = state.pos.x + rx * rect.centerX + fx * rect.centerZ;
    center.z = state.pos.z + rz * rect.centerX + fz * rect.centerZ;
    center.y = state.pos.y;
    const sinPitchSim = Math.sin(state.visualPitch || 0), sinRollSim = Math.sin(state.visualRoll || 0);
    for (let i = 0; i < world.obstacles.length; i++) {
      floors[i] = hullUndersideOver(world.obstacles[i], center.x, center.z, fx, fz, rx, rz, rect.halfLength, rect.halfWidth,
        state.pos.y, sinPitchSim, sinRollSim, rect.frontLiftM ?? 0, rect.rearLiftM ?? 0);
    }
    const ground = (x, z) => Math.max(world.contact(x, z), structureTop(world.obstacles, x, z, Infinity, floors));
    const shellDepth = (cloud, frameCos, frameSin, px, py, pz) => {
      let worst = 0, worstZ = 0, worstY = 0;
      for (let i = 0; i + 2 < cloud.length; i += 3) {
        const lx = px + cloud[i] * frameCos + cloud[i + 2] * frameSin;
        const ly = py + cloud[i + 1];
        const lz = pz - cloud[i] * frameSin + cloud[i + 2] * frameCos;
        const rx = lx * cr - ly * sr;
        const ry = lx * sr + ly * cr;
        const pzz = ry * sp + lz * cp;
        const wx = state.pos.x + rx * cy + pzz * sy;
        const wz = state.pos.z - rx * sy + pzz * cy;
        const wy = state.pos.y + ry * cp - lz * sp;
        const depth = ground(wx, wz) - wy;
        if (depth > worst) { worst = depth; worstZ = lz; worstY = ly; }
      }
      if (worst > metrics.bodyPenMaxM) metrics.bodyPenAt = { t: +t.toFixed(2), localZ: +worstZ.toFixed(2), localY: +worstY.toFixed(2),
        pitch: +state.visualPitch.toFixed(3), grounded: state.grounded, tumbling: state._body.tumbling };
      return worst;
    };
    const tc = Math.cos(state.turretYaw || 0), ts = Math.sin(state.turretYaw || 0);
    const bodyPen = Math.max(shellDepth(hullCloud, 1, 0, 0, 0, 0), shellDepth(turretCloud, tc, ts, pivot[0], pivot[1], pivot[2]));
    if (bodyPen > metrics.bodyPenMaxM) metrics.bodyPenMaxM = bodyPen;
    for (let i = 0; i < world.obstacles.length; i++) {
      const record = world.obstacles[i];
      if (record.crushed) continue;
      if (hullPassesObstacleTop(floors[i], record.max[1], record.min[1], !record.crushable)) {
        // standing on it: the hull's underside over it must not sink below its top
        if (record.max[1] - record.min[1] >= 0.9 && (floors[i] !== state.pos.y
          || pointInsideCollisionRecord(record, record.shape2 ?? null, state.pos.x, state.pos.z))) {
          metrics.roofSinkMaxM = Math.max(metrics.roofSinkMaxM, record.max[1] - floors[i]);
        }
        continue;
      }
      push.x = 0; push.z = 0;
      if (pushHullFromObstacle(center, fx, fz, rx, rz, rect.halfLength, rect.halfWidth, record, push, floors[i], state.pos.y + bodyTop)) {
        metrics.obstaclePenMaxM = Math.max(metrics.obstaclePenMaxM, Math.hypot(push.x, push.z));
      }
    }
    for (const other of others) {
      if (other.modeActive === false) continue;
      const orc = tankContactRect(other.spec);
      const ofx = Math.sin(other.state.yaw), ofz = Math.cos(other.state.yaw);
      const ocx = other.state.pos.x + ofz * orc.centerX + ofx * orc.centerZ;
      const ocz = other.state.pos.z - ofx * orc.centerX + ofz * orc.centerZ;
      if (Math.hypot(center.x - ocx, center.z - ocz) > 14) continue;
      if (tanksVerticallyClear(subject, other)) continue;
      push.x = 0; push.z = 0;
      if (!pushHullFromHull(center.x, center.z, fx, fz, rx, rz, rect.halfLength, rect.halfWidth,
        ocx, ocz, ofx, ofz, ofz, -ofx, orc.halfLength, orc.halfWidth, push)) continue;
      const overlap = Math.hypot(push.x, push.z);
      if (prefersVerticalTankContact(subject, other)) metrics.stackPenMaxM = Math.max(metrics.stackPenMaxM, 0);
      else metrics.hullPenMaxM = Math.max(metrics.hullPenMaxM, overlap);
    }
    if (state.grounded) metrics.gearCompMaxM = Math.max(metrics.gearCompMaxM, state._sup.y - state._ride.y);

    // 5. tunnelling through a thin wall: the hull centre may never cross the wall line
    if (caseDef.wall) {
      const side = Math.sign(state.pos.z - caseDef.wall.z);
      if (wallSide === 0) wallSide = side;
      else if (side !== 0 && side !== wallSide) metrics.tunnelled = true;
    }

    // 6. flight: airtime, hops, landings, rebound law, energy never gained without thrust
    metrics.maxHeightM = Math.max(metrics.maxHeightM, state.pos.y - world.fn(state.pos.x, state.pos.z));
    if (!state.grounded) {
      metrics.airS += DT;
      airRun += DT;
      metrics.liftM = Math.max(metrics.liftM, state.pos.y - state._sup.y);
      metrics.longestAirS = Math.max(metrics.longestAirS, airRun);
      apex = Math.max(apex, state.pos.y);
    }
    if (landed) {
      // the landing speed is the hull's own approach: its fall plus the ground rising under its travel (the steepest
      // grade along its heading under its nose, centre or tail, where it may touch first), never its turning in the
      // air (Sirocco Wadi seed 57001)
      const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw), half = rect.halfLength;
      let rise = 0;
      for (const along of [-half, 0, half]) {
        const x = pre.x + fx * along, z = pre.z + fz * along;
        const slope = (world.fn(x + fx * 0.5, z + fz * 0.5) - world.fn(x - fx * 0.5, z - fz * 0.5)) / 1.0;
        rise = Math.max(rise, pre.speed * slope);
      }
      const kinematic = Math.max(0, -(prev?.rideV ?? 0) + gravity * DT) + rise;
      metrics.closingExcessMps = Math.max(metrics.closingExcessMps, state.landingImpactMps - kinematic);
      metrics.landings.push(+state.landingImpactMps.toFixed(2));
      metrics.maxLandingMps = Math.max(metrics.maxLandingMps, state.landingImpactMps);
      metrics.apexes.push(+(apex - world.fn(state.pos.x, state.pos.z)).toFixed(2));
      apex = -Infinity;
      const allowed = state.landingImpactMps * physics.restitution;
      const rebound = state._ride.v - (state._ride.groundV ?? 0);
      if (!state.grounded) metrics.reboundExcessMps = Math.max(metrics.reboundExcessMps, rebound - allowed - gravity * DT);
    }
    if (state.grounded) airRun = 0;
    if (!pre.grounded && !state.grounded && !impulseTicks.has(tick) && !landed) {
      const vx0 = pre.speed;
      const e0 = 0.5 * (vx0 * vx0 + (prev?.rideV ?? 0) ** 2) + gravity * pre.y;
      const e1 = 0.5 * (state.speed * state.speed + state._ride.v * state._ride.v) + gravity * state.pos.y;
      const gain = e1 - e0;
      if (gain > metrics.energyGainMaxJkg) metrics.energyGainMaxJkg = gain;
      if (gain > 0) metrics.energyGainSumJkg += gain;
    }
    if (!pre.grounded && !landed && !impulseTicks.has(tick) && prev && state._ride.v - (prev.rideV ?? 0) > gravity * DT + 1) {
      // an upward impulse the hull-on-hull contact pass gave an airborne hull: a landing on another hull
      metrics.contactLandings.push(+(-(prev.rideV ?? 0)).toFixed(2));
      metrics.maxLandingMps = Math.max(metrics.maxLandingMps, -(prev.rideV ?? 0));
    }
    if (lastAirborne && state.grounded) metrics.hops++;
    lastAirborne = !state.grounded;

    // 7. rest windows: jitter and creep; drive windows: stuck time
    if (restWindow && t >= restWindow[0] && t < restWindow[1]) {
      restSamples.push({ x: state.pos.x, y: state.pos.y, z: state.pos.z, pitch: state.visualPitch, roll: state.visualRoll,
        rp: att.pitch, rr: att.roll, rideV: state._ride.v, pitchV: state._spring.pitchV, rollV: state._spring.rollV });
    }
    const driving = Math.abs(control.throttle ?? 0) > 0.5 &&
      (!caseDef.drive || (t >= caseDef.drive[0] && t < caseDef.drive[1]));
    if (!prev) prev = { xs: [], zs: [] };
    prev.xs.push(state.pos.x); prev.zs.push(state.pos.z);
    if (prev.xs.length > 61) { prev.xs.shift(); prev.zs.shift(); }
    prev.rideV = state._ride.v;
    if (driving && prev.xs.length === 61) {
      const progress = Math.hypot(state.pos.x - prev.xs[0], state.pos.z - prev.zs[0]);
      if (progress < 0.15) { stuckRun += DT; metrics.stuckS += DT; }
      else stuckRun = 0;
      metrics.longestStuckS = Math.max(metrics.longestStuckS, stuckRun);
    } else stuckRun = 0;

    const upY = Math.cos(state.visualPitch) * Math.cos(state.visualRoll);
    if (state.overturned) metrics.overturnedS += DT;
    if (state._body.tumbling) metrics.tumblingS += DT;
    metrics.finalUpY = upY;
    metrics.finalOverturned = state.overturned;

    // 8. the prediction replays that came due
    for (let i = replays.length - 1; i >= 0; i--) {
      const r = replays[i];
      if (r.due !== tick + 1) continue;
      const error = Math.hypot(state.pos.x - r.x, state.pos.y - r.y, state.pos.z - r.z);
      metrics.replay.samples++;
      metrics.replay.sumErrM += error;
      metrics.replay.maxErrM = Math.max(metrics.replay.maxErrM, error);
      metrics.replay.maxAttErrRad = Math.max(metrics.replay.maxAttErrRad,
        Math.abs(wrap(state.visualPitch - r.pitch)), Math.abs(wrap(state.visualRoll - r.roll)), Math.abs(wrap(state.yaw - r.yaw)));
      replays.splice(i, 1);
    }
  }
  metrics.progressM = Math.hypot(subject.state.pos.x - (spawn.x ?? 0), subject.state.pos.z - (spawn.z ?? 0));
  for (const event of match.snapshot({ tick: ticks, serverTimeMs: ticks * 16, viewerId: 'subject', ackInputSeq: 1 }).events ?? []) {
    if (event.type !== 'tank_impact' || event.id !== 'subject') continue;
    (event.cause === 'fall' ? metrics.falls : metrics.impacts).push(+event.closingMps.toFixed(1));
  }
  if (restSamples.length > 2) metrics.rest = restStats(restSamples);
  metrics.final = { x: +subject.state.pos.x.toFixed(2), y: +subject.state.pos.y.toFixed(3), z: +subject.state.pos.z.toFixed(2),
    pitch: +subject.state.visualPitch.toFixed(3), roll: +subject.state.visualRoll.toFixed(3), grounded: subject.state.grounded,
    speed: +subject.state.speed.toFixed(2) };
  const jerks = metrics.jerkSamples.sort((a, b) => a - b);
  metrics.jerkP50 = percentile(jerks, 0.5);
  metrics.jerkP99 = percentile(jerks, 0.99);
  metrics.jerkRms = Math.sqrt(jerks.reduce((sum, v) => sum + v * v, 0) / Math.max(1, jerks.length));
  delete metrics.jerkSamples;
  return metrics;
}

function restStats(samples) {
  let sumDy = 0, sumDa = 0, maxDy = 0, maxDa = 0, maxRideV = 0, maxAngV = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const dy = Math.abs(b.y - a.y);
    const da = Math.max(Math.abs(wrap(b.rp - a.rp)), Math.abs(wrap(b.rr - a.rr)));
    sumDy += dy * dy; sumDa += da * da;
    maxDy = Math.max(maxDy, dy); maxDa = Math.max(maxDa, da);
    maxRideV = Math.max(maxRideV, Math.abs(b.rideV));
    maxAngV = Math.max(maxAngV, Math.abs(b.pitchV), Math.abs(b.rollV));
  }
  const first = samples[0], last = samples.at(-1);
  const span = (samples.length - 1) * DT;
  // oscillation: sign changes of the rendered pitch rate (a settled hull has none)
  let reversals = 0, lastSign = 0;
  for (let i = 1; i < samples.length; i++) {
    const d = samples[i].rp - samples[i - 1].rp;
    if (Math.abs(d) < 2e-5) continue;
    const sign = Math.sign(d);
    if (lastSign && sign !== lastSign) reversals++;
    lastSign = sign;
  }
  return {
    jitterYRmsMm: +(Math.sqrt(sumDy / (samples.length - 1)) * 1000).toFixed(3),
    jitterYMaxMm: +(maxDy * 1000).toFixed(3),
    jitterAttRmsMrad: +(Math.sqrt(sumDa / (samples.length - 1)) * 1000).toFixed(3),
    jitterAttMaxMrad: +(maxDa * 1000).toFixed(3),
    creepMmS: +(Math.hypot(last.x - first.x, last.z - first.z) / span * 1000).toFixed(2),
    sinkMmS: +((last.y - first.y) / span * 1000).toFixed(2),
    maxRideVMmS: +(maxRideV * 1000).toFixed(2),
    maxAngVMradS: +(maxAngV * 1000).toFixed(2),
    attReversals: reversals,
  };
}

// ---- the glitch classes a run can show (thresholds are the gates the receipt holds) -----------------------------
export const GATES = Object.freeze({
  nan: (m) => m.nan === 0,
  pop: (m) => m.popXZMaxM <= 0.12 && m.popYMaxM <= 0.12,
  snap: (m) => m.snapMaxRad <= 0.05,
  bodyPen: (m) => m.bodyPenMaxM <= 0.05,
  obstaclePen: (m) => m.obstaclePenMaxM <= 0.1,
  hullPen: (m) => m.hullPenMaxM <= 0.15,
  roofSink: (m) => m.roofSinkMaxM <= 0.25,
  tunnel: (m) => !m.tunnelled,
  energy: (m) => m.energyGainMaxJkg <= 0.2 && m.reboundExcessMps <= 0.05,
  restJitter: (m) => !m.rest || (m.rest.jitterYRmsMm <= 0.5 && m.rest.jitterAttRmsMrad <= 0.5),
  restCreep: (m) => !m.rest || Math.abs(m.rest.creepMmS) <= 5,
  stuck: (m, c) => c.allowBlocked || m.longestStuckS <= 0.6,
  // a hull that only drives never leaves the ground (climb-face); a landing never reads more than the hull's approach
  flight: (m, c) => !c.grounded || m.liftM <= 0.3,
  closing: (m) => m.closingExcessMps <= 1.0,
});

export function classify(metrics, caseDef) {
  const failed = [];
  for (const [name, gate] of Object.entries(GATES)) if (!gate(metrics, caseDef)) failed.push(name);
  return failed;
}

// ---- matrix --------------------------------------------------------------------------------------------------------
export async function runMatrix({ hulls = Object.keys(HULLS), worlds = Object.keys(WORLDS), cases = CASES.map((c) => c.id),
  replay = true, onRun = null } = {}) {
  const ids = [...new Set([...hulls.map((h) => HULLS[h] ?? h), 't90m', 'm1a2'])];
  await ensureAuthorityFleet(ids);
  const results = [];
  for (const caseId of cases) {
    const caseDef = CASES.find((c) => c.id === caseId);
    if (!caseDef) throw new Error(`unknown case ${caseId}`);
    for (const worldId of worlds) {
      const worldRules = WORLDS[worldId].ruleset();
      if (caseDef.modes === 'jump' && worldRules.jumpMps == null) continue;
      if (caseDef.modes === 'launch' && !(worldRules.recoilLaunchScale > 1)) continue;
      for (const hull of hulls) {
        const hullId = HULLS[hull] ?? hull;
        const started = performance.now();
        const metrics = runCase(hullId, worldId, caseDef, { replay });
        const result = { case: caseId, group: caseDef.group, world: worldId, hull, hullId, metrics, failed: classify(metrics, caseDef),
          ms: performance.now() - started };
        results.push(result);
        onRun?.(result);
      }
    }
  }
  return results;
}

export function summarize(results) {
  const byWorld = {};
  for (const result of results) {
    const row = byWorld[result.world] ??= { runs: 0, failedRuns: 0, classes: {} };
    row.runs++;
    if (result.failed.length) row.failedRuns++;
    for (const name of result.failed) (row.classes[name] ??= []).push(`${result.case}/${result.hull}`);
  }
  return byWorld;
}

// ---- field audit: real maps, real collision, a full bot roster ---------------------------------------------------
export async function runField({ maps = ['verdant'], worlds = ['earth'], seconds = 120, roster = 28, seed = 8100 } = {}) {
  const { createDedicatedWorldCollision } = await import('../server/dedicatedWorldCollision.ts');
  const { ALL_TANK_IDS } = await import('../src/vehicles/specs.ts');
  // the tick-cost gate's 14v14 roster: fourteen battle tanks across the roles, two of each
  const pool = ALL_TANK_IDS.filter((id) => ['mbt', 'medium', 'heavy', 'light'].includes(getSpec(id).role)).slice(0, 14);
  await ensureAuthorityFleet(pool);
  const out = [];
  for (const mapId of maps) {
    for (const worldId of worlds) {
      const worldDef = WORLDS[worldId];
      const players = Array.from({ length: roster }, (_, index) => ({ id: `bot-${index}`, specId: pool[index % pool.length],
        team: index < roster / 2 ? 'alpha' : 'bravo', bot: true }));
      const ruleset = worldDef.ruleset();
      const match = createAuthoritativeMatch({ players, mapId, seed, countdownS: 0, worldCollision: createDedicatedWorldCollision(mapId), ruleset });
      match.onMatchReady();
      const per = new Map();
      const events = [];
      const noteEvent = (kind, size, entity, s, extra) => {
        if (size < 0.2) return;
        events.push({ kind, size: +size.toFixed(3), t: +match.timeS.toFixed(2), spec: entity.specId, x: +s.pos.x.toFixed(1), y: +s.pos.y.toFixed(2),
          z: +s.pos.z.toFixed(1), speed: +s.speed.toFixed(1), v: +s._ride.v.toFixed(2), grounded: s.grounded, pitch: +s.visualPitch.toFixed(2),
          roll: +s.visualRoll.toFixed(2), tumbling: s._body.tumbling, rest: Number.isFinite(s._body.restSupportY), ...extra });
        if (events.length > 400) { events.sort((a, b) => b.size - a.size); events.length = 200; }
      };
      const world = { contact: match.heightField.getContactHeightAt?.bind(match.heightField) ?? match.heightField.getHeightAt.bind(match.heightField) };
      let stepMs = 0;
      const ticks = Math.round(seconds / DT);
      for (let tick = 0; tick < ticks && !match.result; tick++) {
        const pre = new Map(match.entities.map((e) => [e.id, { x: e.state.pos.x, y: e.state.pos.y, z: e.state.pos.z,
          speed: e.state.speed, recoil: Math.hypot(e.state._spring.recoilVX, e.state._spring.recoilVZ), pitch: e.state.visualPitch,
          roll: e.state.visualRoll, grounded: e.state.grounded }]));
        const started = performance.now();
        match.step({ dt: DT, inputs: new Map() });
        stepMs += performance.now() - started;
        for (const entity of match.entities) {
          if (entity.modeActive === false) continue;
          const m = per.get(entity.id) ?? { nan: 0, popXZMaxM: 0, popsXZ: 0, popYMaxM: 0, popsY: 0, snapMaxRad: 0, snaps: 0,
            airS: 0, longestAirS: 0, air: 0, overturnedS: 0, bodyBelowGroundMaxM: 0, maxLandingMps: 0, stuckS: 0, specId: entity.specId };
          per.set(entity.id, m);
          const p = pre.get(entity.id);
          const s = entity.state;
          if (nonFinite(s)) { m.nan++; continue; }
          const allowed = (Math.max(Math.abs(p.speed), Math.abs(s.speed)) + p.recoil) * DT + 1.2 * Math.abs(s.yawRate) * DT + 0.002;
          const pop = Math.hypot(s.pos.x - p.x, s.pos.z - p.z) - allowed;
          if (pop > m.popXZMaxM) m.popXZMaxM = pop;
          if (pop > 0.05) m.popsXZ++;
          noteEvent('popXZ', pop, entity, s, { impact: s.impactSource, wasGrounded: p.grounded });
          if (s.landingImpactMps <= 0) {
            const popY = Math.abs(s.pos.y - p.y - s._ride.v * DT);
            if (popY > m.popYMaxM) m.popYMaxM = popY;
            if (popY > 0.05) m.popsY++;
            noteEvent('popY', popY, entity, s, { dy: +(s.pos.y - p.y).toFixed(3), wasGrounded: p.grounded, sup: +s._sup.y.toFixed(2), floor: +s._sup.floorY.toFixed(2) });
          } else m.maxLandingMps = Math.max(m.maxLandingMps, s.landingImpactMps);
          const snap = Math.max(Math.abs(wrap(s.visualPitch - p.pitch) - s._spring.pitchV * DT),
            Math.abs(wrap(s.visualRoll - p.roll) - s._spring.rollV * DT));
          if (snap > m.snapMaxRad) m.snapMaxRad = snap;
          if (snap > 0.03) m.snaps++;
          if (!s.grounded) { m.airS += DT; m.air += DT; m.longestAirS = Math.max(m.longestAirS, m.air); } else m.air = 0;
          if (s.overturned) m.overturnedS += DT;
          const below = world.contact(s.pos.x, s.pos.z) - (s.pos.y + 0.3);
          if (below > m.bodyBelowGroundMaxM) m.bodyBelowGroundMaxM = below;
          noteEvent('below', below, entity, s, { ground: +world.contact(s.pos.x, s.pos.z).toFixed(2) });
        }
      }
      events.sort((a, b) => b.size - a.size);
      const rows = [...per.values()];
      const agg = (key, fn = Math.max) => rows.reduce((acc, r) => fn(acc, r[key]), 0);
      out.push({ mapId, world: worldId, seconds: match.timeS, hulls: rows.length, stepMsMean: +(stepMs / Math.max(1, match.timeS / DT)).toFixed(3),
        nan: agg('nan', (a, b) => a + b), popXZMaxM: +agg('popXZMaxM').toFixed(3), popsXZ: agg('popsXZ', (a, b) => a + b),
        popYMaxM: +agg('popYMaxM').toFixed(3), popsY: agg('popsY', (a, b) => a + b), snapMaxRad: +agg('snapMaxRad').toFixed(3),
        snaps: agg('snaps', (a, b) => a + b), longestAirS: +agg('longestAirS').toFixed(2), airS: +agg('airS', (a, b) => a + b).toFixed(1),
        overturnedS: +agg('overturnedS', (a, b) => a + b).toFixed(1), bodyBelowGroundMaxM: +agg('bodyBelowGroundMaxM').toFixed(3),
        maxLandingMps: +agg('maxLandingMps').toFixed(1), events: events.slice(0, 25),
        worst: rows.sort((a, b) => (b.popXZMaxM + b.snapMaxRad) - (a.popXZMaxM + a.snapMaxRad)).slice(0, 3)
          .map((r) => ({ spec: r.specId, popXZ: +r.popXZMaxM.toFixed(3), popY: +r.popYMaxM.toFixed(3), snap: +r.snapMaxRad.toFixed(3) })) });
    }
  }
  return out;
}

// ---- CLI ------------------------------------------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (match) args[match[1]] = match[2] ?? true;
  }
  return args;
}
const list = (value, fallback) => (typeof value === 'string' ? value.split(',').filter(Boolean) : fallback);
const fmt = (v, digits = 3) => (Number.isFinite(v) ? v.toFixed(digits) : String(v));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.field) {
    const report = await runField({ maps: list(args.maps, ['verdant']), worlds: list(args.worlds, ['earth']),
      seconds: Number(args.seconds ?? 120), roster: Number(args.roster ?? 28) });
    if (args.out) writeFileSync(args.out, JSON.stringify(report, null, 1));
    console.log(args.json ? JSON.stringify(report, null, 1) : report.map((r) => JSON.stringify(r)).join('\n'));
    return;
  }
  const results = await runMatrix({
    hulls: list(args.hulls, Object.keys(HULLS)),
    worlds: list(args.worlds, Object.keys(WORLDS)),
    cases: list(args.cases, CASES.map((c) => c.id)),
    replay: args.replay !== 'false',
    onRun: args.json ? null : (r) => {
      const m = r.metrics;
      const rest = m.rest ? ` rest y${fmt(m.rest.jitterYRmsMm, 2)}mm a${fmt(m.rest.jitterAttRmsMrad, 2)}mrad creep${fmt(m.rest.creepMmS, 1)}` : '';
      console.log(`${r.case.padEnd(16)} ${r.world.padEnd(6)} ${r.hull.padEnd(6)} ${r.failed.length ? `FAIL[${r.failed.join(',')}]` : 'ok'}`
        + ` pop${fmt(m.popXZMaxM, 2)}/${fmt(m.popYMaxM, 2)} snap${fmt(m.snapMaxRad, 3)} pen b${fmt(m.bodyPenMaxM, 2)} o${fmt(m.obstaclePenMaxM, 2)}`
        + ` h${fmt(m.hullPenMaxM, 2)} roof${fmt(m.roofSinkMaxM, 2)} gear${fmt(m.gearCompMaxM, 2)} air${fmt(m.longestAirS, 1)} hops${m.hops}`
        + ` land${fmt(m.maxLandingMps, 1)} E+${fmt(m.energyGainMaxJkg, 2)} reb+${fmt(m.reboundExcessMps, 2)} lift${fmt(m.liftM, 2)} cl+${fmt(m.closingExcessMps, 1)} stuck${fmt(m.longestStuckS, 1)}`
        + ` jerk99 ${fmt(m.jerkP99, 0)} ovr${fmt(m.overturnedS, 1)} top${fmt(m.maxHeightM, 1)} pred${fmt(m.replay.maxErrM, 3)}${rest}`
        + `${m.tunnelled ? ' TUNNEL' : ''}${m.nan ? ` NaN:${m.nanField}` : ''} (${r.ms.toFixed(0)} ms)`);
    },
  });
  const summary = summarize(results);
  if (args.out) writeFileSync(args.out, JSON.stringify({ summary, results }, null, 1));
  if (args.json) console.log(JSON.stringify({ summary, results }, null, 1));
  else {
    console.log('\nper world: runs / runs with a glitch class / classes');
    for (const [world, row] of Object.entries(summary)) {
      console.log(`${world.padEnd(7)} ${row.runs} runs, ${row.failedRuns} with a glitch`);
      for (const [name, where] of Object.entries(row.classes)) console.log(`   ${name.padEnd(12)} ${where.length}: ${where.slice(0, 12).join(' ')}${where.length > 12 ? ' ...' : ''}`);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
