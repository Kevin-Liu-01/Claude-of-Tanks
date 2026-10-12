// src/world/paddies.ts — real flooded paddies (2026-10-12, the coordinator's item 4; the owner, 2026-10-11: "in some maps
// such as the jade river deltas spawn, we can see fake water. no more of that, we need real water"). Item 3 stopped the
// land use painting water over hummocky fields (a paddy's floor rose 2-5 m across it); this builds the paddies that hold
// it. A paddy is a level basin cut and filled into the ground (its floor the median of the ground it covers), held by a
// low earth bund round its edge, its water a square-ended canal (canals.ts) a few centimetres under the floor's rim: the
// terrain carves the bed a water depth below the level, the liquid water reads it as wet from bund to bund (wakes, splash,
// the mask bake, the shallow-water sheet at the level), exactly as Polders' vaart. Neighbouring paddies step down as
// terraces, each at its own floor, the bund between them carrying the step. Pure functions, no map knowledge: a map with
// no paddies compiles none and its terrain is byte-identical.
import type { CanalConfig } from './canals.ts';

/** One paddy as a map authors it: the water's rectangle (its bund stands outside it). */
export interface PaddyConfig {
  x: number;
  z: number;
  /** The water's extent across and along the paddy (metres); the length runs along the yaw's +Z. */
  widthM: number;
  lengthM: number;
  yawDeg?: number;
}

/** The bund: its width outside the water's edge, its crest over the floor (a paddy bund is knee high and a stride wide). */
export const PADDY_BUND_M = 1.6, PADDY_BUND_H = 0.4;
/** The bank: the ground cut or filled to the floor blends back to its own height over this many metres past the bund. */
export const PADDY_BANK_M = 7;
/** The water stands this far under the floor's rim, so the field's own edge holds it before the bund does. */
export const PADDY_FREEBOARD_M = 0.05;
/** The shelf from the waterline to the bed (canals.ts shelfM): a paddy's bed is flat to within a stride of its bund. */
const PADDY_SHELF_M = 0.8;
/** The bund's inner face from the waterline (rise over run). */
const PADDY_BANK_SLOPE = 1;

interface PaddyFrame { c: number; s: number; hw: number; hl: number }

function frameOf(p: PaddyConfig): PaddyFrame {
  const yaw = (p.yawDeg ?? 0) * Math.PI / 180;
  return { c: Math.cos(yaw), s: Math.sin(yaw), hw: p.widthM / 2, hl: p.lengthM / 2 };
}

/** The signed distance from (x, z) to a paddy's water rectangle (negative inside). */
function signedDistance(p: PaddyConfig, f: PaddyFrame, x: number, z: number): number {
  const dx = x - p.x, dz = z - p.z;
  const across = Math.abs(dx * f.c - dz * f.s) - f.hw;
  const along = Math.abs(dx * f.s + dz * f.c) - f.hl;
  return Math.hypot(Math.max(0, across), Math.max(0, along)) + Math.min(0, Math.max(across, along));
}

function smooth(a: number, b: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** The compiled paddies: their frames, ready for the height and water queries. */
export interface CompiledPaddies {
  readonly paddies: readonly PaddyConfig[];
  readonly frames: readonly PaddyFrame[];
  /** Each paddy's floor (world y): null until resolvePaddyFloors has sampled the finished ground. */
  floors: Float64Array | null;
}

export function compilePaddies(configs: readonly PaddyConfig[] | undefined): CompiledPaddies | null {
  if (!configs?.length) return null;
  for (const p of configs) {
    if (!p || !(p.widthM > 2) || !(p.lengthM > 2) || !Number.isFinite(p.x) || !Number.isFinite(p.z)) {
      throw new Error('paddy: a position, a width and a length over 2 m');
    }
  }
  return { paddies: configs, frames: configs.map(frameOf), floors: null };
}

/** Each paddy's floor: the median of the finished ground over its water on a 2 m lattice (the cut and the fill balance). */
export function resolvePaddyFloors(compiled: CompiledPaddies, heightAt: (x: number, z: number) => number): void {
  const floors = new Float64Array(compiled.paddies.length);
  compiled.paddies.forEach((p, i) => {
    const f = compiled.frames[i], heights: number[] = [];
    for (let a = -f.hl; a <= f.hl + 1e-6; a += 2) for (let b = -f.hw; b <= f.hw + 1e-6; b += 2) {
      heights.push(heightAt(p.x + f.s * a + f.c * b, p.z + f.c * a - f.s * b));
    }
    heights.sort((u, v) => u - v);
    floors[i] = heights[heights.length >> 1];
  });
  compiled.floors = floors;
}

/**
 * The ground at (x, z) with the paddies built: inside a paddy its floor; on a bund the bund's crest over the higher floor
 * it holds; past the bunds the cut or the fill blending back to the ground over the bank (the nearest paddy's).
 */
export function levelPaddies(compiled: CompiledPaddies, x: number, z: number, h: number): number {
  const floors = compiled.floors;
  if (floors === null) return h;
  let bund = -Infinity, bankW = 0, bankFloor = 0;
  for (let i = 0; i < compiled.paddies.length; i++) {
    const sd = signedDistance(compiled.paddies[i], compiled.frames[i], x, z);
    if (sd >= PADDY_BUND_M + PADDY_BANK_M) continue;
    if (sd <= 0) return floors[i];
    if (sd < PADDY_BUND_M) {
      // a rounded crest, flat over its middle half: the bund rises from the water's edge and falls to the bank's floor
      const t = sd / PADDY_BUND_M;
      const crest = floors[i] + PADDY_BUND_H * smooth(0, 0.3, t) * (1 - smooth(0.75, 1, t));
      if (crest > bund) bund = crest;
      continue;
    }
    const w = 1 - smooth(PADDY_BUND_M, PADDY_BUND_M + PADDY_BANK_M, sd);
    if (w > bankW) { bankW = w; bankFloor = floors[i]; }
  }
  if (bund > -Infinity) return bund;
  return bankW > 0 ? h + (bankFloor - h) * bankW : h;
}

/** The paddies' water as square-ended canals (canals.ts), at each floor less the freeboard: call once the floors are known. */
export function paddyCanals(compiled: CompiledPaddies): CanalConfig[] {
  const floors = compiled.floors;
  if (floors === null) throw new Error('paddy: the floors are resolved before the water');
  return compiled.paddies.map((p, i) => {
    const f = compiled.frames[i];
    return {
      path: [[p.x - f.s * f.hl, p.z - f.c * f.hl], [p.x + f.s * f.hl, p.z + f.c * f.hl]],
      widthM: p.widthM, level: floors[i] - PADDY_FREEBOARD_M, ends: 'square', bankSlope: PADDY_BANK_SLOPE,
      shelfM: PADDY_SHELF_M, name: `paddy ${i}`,
    };
  });
}

/** Whether (x, z) lies on a paddy's water or bund (vegetation and props keep off; the bank is open ground). */
export function inPaddy(compiled: CompiledPaddies, x: number, z: number): boolean {
  for (let i = 0; i < compiled.paddies.length; i++) {
    if (signedDistance(compiled.paddies[i], compiled.frames[i], x, z) < PADDY_BUND_M + 0.5) return true;
  }
  return false;
}
