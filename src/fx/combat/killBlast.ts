/**
 * combat/killBlast.ts — a tank dying and its wreck burning (combat-fx lane, 2026-10-05).
 *
 * The critics (motion wave 105, ammo rack 3.8/10): "the fireball is a small pale peach glow, the fire dies to a
 * flicker by frame 4, and the smoke is a soft, straight-up tube of almost even width that never drifts or visibly
 * rolls." The battle recipe keeps its white flash cards, additive fire pockets, sparks, debris, scorch and the turret
 * toss (effects.ts); the media here give the death its mass:
 *  1. the FIREBALL: dense fire-in-smoke billows (heat on the blackbody ramp, cooling over ~2 s in their dense pockets
 *     first-in, last-out) that burst out violently (an expanding outer shell, a buoyant core) and rise as one mass;
 *     an ammo rack adds a mushroom cap thrown high and a much larger body;
 *  2. COOK-OFF: an ammo rack keeps blowing — timed secondary bursts (flame jets, hot billows, spark fountains and a
 *     light pulse each) over the next four seconds;
 *  3. the COLUMN: thick dark smoke rising off the hulk already in the first seconds, widening as it climbs, rolling
 *     and leaning downwind (every puff relaxes toward the scene wind as it rises), fed for the rest of the fire by
 *     columnPuff();
 *  4. a ground shock of dust in the ground's own colour.
 */
import type { CombatContext, Rgb } from './context.ts';
import { mHeat, mLook, mMove, mPlace, mShape, tierCount } from './context.ts';
import { SURFACE_LOOKS, classifySurface } from './surface.ts';

interface Vec3Like { x: number; y: number; z: number }
export type KillCause = 'ammorack' | 'shot' | 'fire';

const TAU = Math.PI * 2;
const SOOT0: Rgb = [0.03, 0.026, 0.023];
const SOOT1: Rgb = [0.085, 0.078, 0.07];
const SMOKE0: Rgb = [0.032, 0.029, 0.026];
const SMOKE1: Rgb = [0.12, 0.115, 0.105];
const SMOKE_LATE0: Rgb = [0.07, 0.066, 0.06];
const SMOKE_LATE1: Rgb = [0.19, 0.185, 0.175];
const WISP0: Rgb = [0.13, 0.125, 0.115];
const WISP1: Rgb = [0.26, 0.255, 0.245];
const JET_FIRE: Rgb = [1, 0.78, 0.42];
const FIRE_HOT: Rgb = [1, 0.8, 0.45];
const FIRE_DEEP: Rgb = [0.95, 0.32, 0.05];
const SPARK: Rgb = [1, 0.72, 0.35];

/** Seconds after the blast at which an ammo rack's secondary charges cook off. */
export const COOK_OFF_S: readonly number[] = Object.freeze([0.9, 1.55, 2.35, 3.2, 4.3]);

export function killBlast(C: CombatContext, pos: Vec3Like, cause: KillCause, birthOffset: number): void {
  const rack = cause === 'ammorack';
  const burn = cause === 'fire';
  const S = rack ? 1 : burn ? 0.62 : 0.8;
  const gy = C.groundY(pos.x, pos.z);
  const cy = Math.max(pos.y, gy) + 1.2;
  const dk = C.distBoost(pos.x, cy, pos.z);
  const m = C.m;
  const R = C.rand;

  // 1a. the fireball body: a buoyant, white-hot core that swells and climbs
  const coreN = tierCount(C, rack ? 9 : burn ? 4 : 6);
  for (let i = 0; i < coreN; i++) {
    const a = R() * TAU, b = R() * Math.PI * 0.5, v = (2 + R() * 4.5) * S;
    mPlace(m, pos.x + (R() - 0.5) * 1.4, cy + (R() - 0.35) * 1.2, pos.z + (R() - 0.5) * 1.4, birthOffset - R() * 0.04);
    mMove(m, Math.cos(a) * Math.sin(b) * v, (2.5 + R() * 3) * S, Math.sin(a) * Math.sin(b) * v, 1.5,
      (rack ? 3.4 : 2.4) * S, 0.3, 0);
    mShape(m, 3.6 + R() * 1.6, (2.6 + R() * 1.2) * S * dk, (7.5 + R() * 3) * S * dk, 2.3, 1, R() * TAU,
      (R() - 0.5) * 1.2);
    mLook(m, SOOT0, SOOT1, 0.97, 0.015, 0.55, 0.25, 0.14, 0, 0.05, R());
    mHeat(m, 1.15, rack ? 0.62 : 0.85, 0.6, 1.1);
    C.smoke(m);
  }
  // 1b. the violent outer shell: thrown out fast, stalls, keeps burning in its dense pockets
  const shellN = tierCount(C, rack ? 14 : burn ? 5 : 9);
  for (let i = 0; i < shellN; i++) {
    const a = (i / shellN) * TAU + (R() - 0.5) * 0.6, b = 0.35 + R() * 1.0, v = (7 + R() * 9) * S;
    mPlace(m, pos.x + Math.cos(a) * 0.6, cy + R() * 0.8, pos.z + Math.sin(a) * 0.6, birthOffset - R() * 0.03);
    mMove(m, Math.cos(a) * Math.sin(b) * v, Math.cos(b) * v * 0.8 + 1.5, Math.sin(a) * Math.sin(b) * v, 2.6,
      2.2 * S, 0.4, 0);
    mShape(m, 3 + R() * 1.4, (1.7 + R() * 0.8) * S * dk, (5.2 + R() * 2.2) * S * dk, 2.6, 1, R() * TAU,
      (R() - 0.5) * 1.6);
    mLook(m, SOOT0, SOOT1, 0.95, 0.012, 0.5, 0.3, 0.16, 0.012, 0.05, R());
    mHeat(m, 1.0, rack ? 1.15 : 1.5, 0.68, 1.0);
    C.smoke(m);
  }
  // 1c. an ammo rack throws a mushroom cap high over the hull
  if (rack) {
    const capN = tierCount(C, 5);
    for (let i = 0; i < capN; i++) {
      const a = R() * TAU, r = R() * 1.6;
      mPlace(m, pos.x + Math.cos(a) * r, cy + 1.0, pos.z + Math.sin(a) * r, birthOffset - 0.02);
      mMove(m, Math.cos(a) * (1.5 + R() * 2), 9 + R() * 4, Math.sin(a) * (1.5 + R() * 2), 1.3, 3.4, 0.45, 0);
      mShape(m, 4.2 + R() * 1.4, 3.2 * dk, (8.5 + R() * 3) * dk, 2.2, 1, R() * TAU, (R() - 0.5) * 0.9);
      mLook(m, SOOT0, SMOKE1, 0.96, 0.02, 0.5, 0.3, 0.16, 0, 0.05, R());
      mHeat(m, 1.0, 0.95, 0.66, 1.05);
      C.smoke(m);
    }
  }

  // 2. cook-off: the rest of the rack keeps blowing for seconds
  if (rack) {
    for (let ci = 0; ci < COOK_OFF_S.length; ci++) {
      const tb = COOK_OFF_S[ci] * (0.9 + R() * 0.2);
      cookOff(C, pos.x, cy, pos.z, tb, ci === 0 ? 1 : 0.65 + R() * 0.35, birthOffset);
    }
  }

  // 3. the column's first seconds: thick dark smoke rising off the hull, widening as it climbs, leaning downwind
  const stalkN = tierCount(C, rack ? 12 : burn ? 9 : 10);
  for (let i = 0; i < stalkN; i++) {
    const delay = 0.25 + (i / stalkN) * 2.6 + R() * 0.2;
    const a = R() * TAU, r = R() * 0.9;
    mPlace(m, pos.x + Math.cos(a) * r, cy + 0.6 + R() * 1.4, pos.z + Math.sin(a) * r, birthOffset + delay);
    mMove(m, Math.cos(a) * 0.6, 3.5 + R() * 2, Math.sin(a) * 0.6, 0.9, 3.0 + R() * 0.8, 0.9, 0);
    mShape(m, 6 + R() * 2.5, (2.2 + R() * 0.8) * dk, (8.5 + R() * 3.5) * dk, 1.5, 1, R() * TAU, (R() - 0.5) * 0.8);
    mLook(m, SMOKE0, SMOKE1, 0.88, 0.25, 0.42, 0.35, 0.24, 0, 0.1, R());
    mHeat(m, burn ? 0.55 : 0.4, 2.2, 0.7, 0.9);
    C.smoke(m);
  }

  // 4. the ground shock: dust in the ground's colour driven out radially from under the hull
  const surf = classifySurface(C.field, pos.x, pos.z);
  if (surf !== 'water') {
    const L = SURFACE_LOOKS[surf];
    const ringN = tierCount(C, (rack ? 14 : burn ? 6 : 10) * Math.sqrt(L.dustK));
    for (let i = 0; i < ringN; i++) {
      const a = (i / ringN) * TAU + (R() - 0.5) * 0.5, v = (10 + R() * 9) * S;
      const rs = 1.5 + R() * 0.8;
      mPlace(m, pos.x + Math.cos(a) * rs, gy + 0.6, pos.z + Math.sin(a) * rs, birthOffset + R() * 0.04);
      mMove(m, Math.cos(a) * v, 0.8 + R() * 0.8, Math.sin(a) * v, 3.4, 0.25, 0.9, 0);
      mShape(m, 2.6 + R() * 1.4, 1.0, (4 + R() * 1.8) * S * dk, 2.6, 0.55, R() * TAU, (R() - 0.5) * 0.6);
      mLook(m, L.dust0, L.dust1, (0.36 + R() * 0.12) * Math.min(1, L.dustK), 0.03, 0.35, 0.6, 0.18, 0.02,
        L.scatter, R());
      mHeat(m, 0, 1, 0.5, 1);
      C.earth(m);
    }
  }
}

/** One secondary charge cooking off tb seconds after the blast: a flame jet, hot billows, a spark fountain, a light pulse. */
function cookOff(C: CombatContext, x: number, cy: number, z: number, tb: number, k: number, birthOffset: number): void {
  const m = C.m;
  const R = C.rand;
  const bo = birthOffset + tb;
  // the flame jet out of the turret ring / hatches
  const j = C.bj;
  const jets = tierCount(C, 2);
  for (let i = 0; i < jets; i++) {
    const a = R() * TAU, tilt = R() * 0.32;
    j.pos[0] = x + (R() - 0.5) * 1.2; j.pos[1] = cy + 0.4; j.pos[2] = z + (R() - 0.5) * 1.2;
    j.axis[0] = Math.cos(a) * Math.sin(tilt); j.axis[1] = Math.cos(tilt); j.axis[2] = Math.sin(a) * Math.sin(tilt);
    j.life = 0.22 + R() * 0.12; j.width = (0.45 + R() * 0.2) * k; j.len0 = 0.6; j.len1 = (3.5 + R() * 2.5) * k;
    j.seed = R(); j.col[0] = JET_FIRE[0]; j.col[1] = JET_FIRE[1]; j.col[2] = JET_FIRE[2]; j.alpha = 0.9;
    j.birthOffset = bo;
    C.jet(j);
  }
  // burning gas licking up out of the hull
  const b = C.bp;
  const licks = tierCount(C, 5);
  for (let i = 0; i < licks; i++) {
    b.pos[0] = x + (R() - 0.5) * 1.0; b.pos[1] = cy + 0.5 + R() * 0.5; b.pos[2] = z + (R() - 0.5) * 1.0;
    b.vel[0] = (R() - 0.5) * 2; b.vel[1] = (6 + R() * 6) * k; b.vel[2] = (R() - 0.5) * 2;
    b.life = 0.35 + R() * 0.35; b.size0 = (1.2 + R() * 0.5) * k; b.size1 = (2.6 + R()) * k;
    b.rot = R() * TAU; b.rotVel = (R() - 0.5) * 4;
    b.col0[0] = FIRE_HOT[0]; b.col0[1] = FIRE_HOT[1]; b.col0[2] = FIRE_HOT[2];
    b.col1[0] = FIRE_DEEP[0]; b.col1[1] = FIRE_DEEP[1]; b.col1[2] = FIRE_DEEP[2];
    b.alpha = 0.85; b.grav = 1.5; b.birthOffset = bo + R() * 0.08;
    C.fire(b);
  }
  // hot billows that cool to soot as they climb into the column
  const billows = tierCount(C, 3);
  for (let i = 0; i < billows; i++) {
    const a = R() * TAU;
    mPlace(m, x + Math.cos(a) * 0.6, cy + 0.8 + R() * 0.8, z + Math.sin(a) * 0.6, bo + R() * 0.06);
    mMove(m, Math.cos(a) * 2.5, (6 + R() * 4) * k, Math.sin(a) * 2.5, 1.6, 3.0, 0.5, 0);
    mShape(m, 3 + R() * 1.2, (1.6 + R() * 0.6) * k, (4.8 + R() * 1.6) * k, 2.2, 1, R() * TAU, (R() - 0.5) * 1.2);
    mLook(m, SOOT0, SMOKE1, 0.93, 0.02, 0.5, 0.3, 0.16, 0, 0.05, R());
    mHeat(m, 1.0, 1.6, 0.62, 1.0);
    C.smoke(m);
  }
  // the spark fountain: burning propellant grains
  const s = C.bs;
  const sparks = tierCount(C, 14);
  for (let i = 0; i < sparks; i++) {
    const a = R() * TAU, tilt = R() * 0.7, v = (9 + R() * 11) * k;
    s.pos[0] = x + (R() - 0.5) * 0.8; s.pos[1] = cy + 0.6; s.pos[2] = z + (R() - 0.5) * 0.8;
    s.vel[0] = Math.cos(a) * Math.sin(tilt) * v; s.vel[1] = Math.cos(tilt) * v; s.vel[2] = Math.sin(a) * Math.sin(tilt) * v;
    s.life = 0.6 + R() * 0.6; s.width = 0.04 + R() * 0.03; s.stretch = 0.035; s.grav = -14;
    s.col[0] = SPARK[0]; s.col[1] = SPARK[1]; s.col[2] = SPARK[2]; s.alpha = 0.6 + R() * 0.4; s.seed = R();
    s.birthOffset = bo + R() * 0.12;
    C.sparks(s);
  }
  C.lightPulse(x, cy + 2.2, z, 0.5 * k, Math.max(0, tb + birthOffset));
}

/**
 * One tick of a burning wreck's (or a burning tank's) column: thick smoke off the deck that rises on its own
 * buoyancy, swells as it climbs (so the column widens with height), rolls (spin + warp) and leans downwind as the
 * scene wind takes it. `stage` runs 1 (fresh) -> 0 (burning out): fresh smoke is black and dense, late smoke greyer
 * and thinner. `scale` is the column's own scale x the camera-distance boost.
 */
export function columnPuff(C: CombatContext, x: number, y: number, z: number, stage: number, scale: number,
  birthOffset: number): void {
  const m = C.m;
  const R = C.rand;
  const h = Math.pow(R(), 1.6) * 1.8;
  const a = R() * TAU, r = R() * 0.55 * scale;
  mPlace(m, x + Math.cos(a) * r, y + 1.0 + h, z + Math.sin(a) * r, birthOffset);
  const up = 2.0 + R() * 1.2;
  mMove(m, Math.cos(a) * 0.5, up, Math.sin(a) * 0.5, 0.75, 2.4 + 1.1 * stage + R() * 0.5, 0.9, 0);
  mShape(m, 6.2 + R() * 2.6, (1.5 + R() * 0.6) * scale, (7 + R() * 3) * scale, 1.45, 1, R() * TAU, (R() - 0.5) * 0.7);
  if (stage > 0.45) mLook(m, SMOKE0, SMOKE1, 0.5 + 0.32 * stage, 0.3, 0.42, 0.35, 0.24, 0, 0.1, R());
  else mLook(m, SMOKE_LATE0, SMOKE_LATE1, 0.36 + 0.3 * stage, 0.3, 0.4, 0.4, 0.26, 0, 0.15, R());
  // the fire under the smoke lights its first metre from inside
  mHeat(m, h < 0.6 ? 0.32 * stage : 0, 3.2, 0.72, 0.85);
  C.smoke(m);
}

/** A smouldering wreck after its fire: thin grey wisps that rise slowly and drift. */
export function smolderPuff(C: CombatContext, x: number, y: number, z: number, k: number, birthOffset: number): void {
  const m = C.m;
  const R = C.rand;
  mPlace(m, x + (R() - 0.5) * 1.4, y + 1.2 + R() * 0.8, z + (R() - 0.5) * 1.4, birthOffset);
  mMove(m, (R() - 0.5) * 0.4, 0.9 + R() * 0.8, (R() - 0.5) * 0.4, 0.9, 1.0 + R() * 0.4, 1, 0);
  mShape(m, 6 + R() * 3, 0.9 + R() * 0.4, 4.5 + R() * 2, 1.4, 1, R() * TAU, (R() - 0.5) * 0.5);
  mLook(m, WISP0, WISP1, 0.12 + 0.2 * k, 0.4, 0.35, 0.5, 0.3, 0, 0.3, R());
  mHeat(m, 0, 1, 0.5, 1);
  C.smoke(m);
}

/** A flame-in-smoke lick on a burning deck (paired with the battle recipe's additive flame licks). */
export function deckFlame(C: CombatContext, x: number, y: number, z: number, scale: number, birthOffset: number): void {
  const m = C.m;
  const R = C.rand;
  mPlace(m, x + (R() - 0.5) * 1.1, y + 0.95 + R() * 0.4, z + (R() - 0.5) * 1.1, birthOffset);
  mMove(m, (R() - 0.5) * 0.6, 1.4 + R() * 1.2, (R() - 0.5) * 0.6, 1.5, 2.2, 0.4, 0);
  mShape(m, 1.1 + R() * 0.5, (0.9 + R() * 0.4) * scale, (2.4 + R() * 0.8) * scale, 1.8, 1, R() * TAU, (R() - 0.5) * 2);
  mLook(m, SOOT0, SMOKE1, 0.9, 0.04, 0.45, 0.35, 0.18, 0, 0.05, R());
  mHeat(m, 1.0, 2.8, 0.6, 1.0);
  C.smoke(m);
}
