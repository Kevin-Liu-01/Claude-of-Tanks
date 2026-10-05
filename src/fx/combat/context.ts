/**
 * combat/context.ts — what a combat recipe may touch (combat-fx lane, 2026-10-05).
 *
 * Recipes are plain functions over this context: the seeded fx stream (the SAME stream the battle recipes draw from,
 * so Studio's resetSeed and every frozen capture stay deterministic), the ground, the two media pools, the clods,
 * the craters, the battle pools for additive light (flash, fire, sparks, jets), the explosion-light pulse and the
 * scene wind. Every emit goes through one scratch record per kind; nothing allocates per call.
 */
import type { MediaPuff } from './mediaPool.ts';
import type { ClodRecord } from './clods.ts';
import type { CraterKind } from './craters.ts';
import type { SurfaceField } from './surface.ts';

export type Rgb = readonly [number, number, number];

/** The battle pools a recipe may add light with (particles.ts emit options, structurally). */
export interface BattlePuff {
  pos: [number, number, number]; vel: [number, number, number]; life: number; size0: number; size1: number;
  rot: number; rotVel: number; col0: [number, number, number]; col1: [number, number, number]; alpha: number;
  grav: number; birthOffset: number;
}
export interface BattleStreak {
  pos: [number, number, number]; vel: [number, number, number]; life: number; width: number; stretch: number;
  grav: number; col: [number, number, number]; alpha: number; seed: number; birthOffset: number;
}
export interface BattleJet {
  pos: [number, number, number]; axis: [number, number, number]; life: number; width: number; len0: number;
  len1: number; seed: number; col: [number, number, number]; alpha: number; birthOffset: number;
}

export interface CombatContext {
  /** the shared seeded fx stream */
  rand(): number;
  groundY(x: number, z: number): number;
  readonly field: SurfaceField | null;
  /** media puffs: 'earth' draws dust, soil, powder and spray; 'smoke' draws combustion smoke and fire-in-smoke */
  earth(m: MediaPuff): void;
  smoke(m: MediaPuff): void;
  clod(k: ClodRecord): void;
  crater(x: number, z: number, radius: number, kind: CraterKind, explosive: boolean, birthOffset: number): void;
  flash(o: BattlePuff): void;
  fire(o: BattlePuff): void;
  sparks(o: BattleStreak): void;
  jet(o: BattleJet): void;
  /** pulse the pooled explosion light after delayS (deferred on the fx timers; a backdated recipe flashes now) */
  lightPulse(x: number, y: number, z: number, peak: number, delayS: number): void;
  /** camera-distance size boost (1 inside ~90 m), as the battle recipes' distBoost */
  distBoost(x: number, y: number, z: number): number;
  /** 1 on desktop, about half on the mobile tier: every recipe count scales by it */
  readonly tier: number;
  /** scratch records (mutated per emit) */
  readonly m: MediaPuff;
  readonly k: ClodRecord;
  readonly bp: BattlePuff;
  readonly bs: BattleStreak;
  readonly bj: BattleJet;
}

/** Count scaled by the device tier (never below one when the base count is positive). */
export function tierCount(C: CombatContext, base: number): number {
  if (base <= 0) return 0;
  return Math.max(1, Math.round(base * C.tier));
}

export function calScale(caliberMm: number): number {
  return Math.min(1.7, Math.max(0.5, caliberMm / 100));
}

// ---- media puff setters (each recipe sets every group, so no field carries over between emits) ----

export function mPlace(m: MediaPuff, x: number, y: number, z: number, birthOffset: number): void {
  m.px = x; m.py = y; m.pz = z; m.birthOffset = birthOffset;
}
export function mMove(m: MediaPuff, vx: number, vy: number, vz: number, drag: number, rise: number, windK: number,
  grav: number): void {
  m.vx = vx; m.vy = vy; m.vz = vz; m.drag = drag; m.rise = rise; m.windK = windK; m.grav = grav;
}
export function mShape(m: MediaPuff, life: number, size0: number, size1: number, growExp: number, flatten: number,
  rot: number, rotVel: number): void {
  m.life = life; m.size0 = size0; m.size1 = size1; m.growExp = growExp; m.flatten = flatten; m.rot = rot;
  m.rotVel = rotVel;
}
export function mLook(m: MediaPuff, c0: Rgb, c1: Rgb, alpha: number, fadeIn: number, fadeOut: number, erode: number,
  warp: number, stretch: number, scatter: number, seed: number): void {
  m.r0 = c0[0]; m.g0 = c0[1]; m.b0 = c0[2]; m.r1 = c1[0]; m.g1 = c1[1]; m.b1 = c1[2];
  m.alpha = alpha; m.fadeIn = fadeIn; m.fadeOut = fadeOut; m.erode = erode; m.warp = warp; m.stretch = stretch;
  m.scatter = scatter; m.seed = seed;
}
export function mHeat(m: MediaPuff, heat: number, cool: number, hotCore: number, emissive: number): void {
  m.heat = heat; m.cool = cool; m.hotCore = hotCore; m.emissive = emissive;
}

/** Scale an albedo (value only). */
export function shade(c: Rgb, k: number, out: [number, number, number]): Rgb {
  out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
  return out;
}

/** Mix two albedos. */
export function blend(a: Rgb, b: Rgb, t: number, out: [number, number, number]): Rgb {
  out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

/**
 * The media motion law, as mediaShader.ts integrates it: launch velocity relaxing toward wind x windK + rise, plus a
 * ballistic term. Receipts and recipes (landing puffs, fountain heights) evaluate puffs with it.
 */
export function mediaPositionAt(m: MediaPuff, windX: number, windZ: number, age: number,
  out: [number, number, number]): [number, number, number] {
  const k = Math.max(m.drag, 1e-3);
  const tx = windX * m.windK, ty = m.rise, tz = windZ * m.windK;
  const s = (1 - Math.exp(-k * age)) / k;
  out[0] = m.px + tx * age + (m.vx - tx) * s;
  out[1] = m.py + ty * age + (m.vy - ty) * s + 0.5 * m.grav * age * age;
  out[2] = m.pz + tz * age + (m.vz - tz) * s;
  return out;
}
