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
/** The bund's outer face: past its width the crest falls over this many metres (two neighbours' bunds, meeting at their
 *  widths, stand as one shared bund at full crest, never a notch between them). */
const PADDY_BUND_FALL_M = 0.7;
/** The bank: the ground cut or filled to the floor blends back to its own height over this many metres past the bund. */
export const PADDY_BANK_M = 7;
/** The water stands this far under the floor's rim, so the field's own edge holds it before the bund does. */
export const PADDY_FREEBOARD_M = 0.05;
/** The shelf from the waterline to the bed (canals.ts shelfM): a paddy's bed is flat to within a stride of its bund. */
const PADDY_SHELF_M = 0.8;
/** The bund's inner face from the waterline (rise over run). */
const PADDY_BANK_SLOPE = 1;
/** (2026-10-15, the look pass; the coordinator: "muddy water, rice shoots, about 25 cm depth, cleared banks, no tree in
 *  the water") a flooded paddy stands a quarter metre deep over its levelled mud (it read as a dark pond at the map's
 *  0.64 m river depth). */
export const PADDY_DEPTH_M = 0.25;
/** No tree or shrub stands within this distance of a paddy's water: its bund, its bank and a working strip round it
 *  (a paddy is cleared farmland, not a pond in the forest). */
export const PADDY_CLEAR_M = PADDY_BUND_M + PADDY_BANK_M + 4;
/** The rice: rows across the paddy (along its width) this far apart, hills along a row this far apart (metres). */
export const PADDY_RICE_ROW_M = 0.5, PADDY_RICE_HILL_M = 0.42;

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
interface CompiledPaddies {
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
 * it holds (a bank cut into higher ground may stand over it); past the bunds the cut or the fill blending back to the
 * ground over the bank (the nearest paddy's).
 */
export function levelPaddies(compiled: CompiledPaddies, x: number, z: number, h: number): number {
  const floors = compiled.floors;
  if (floors === null) return h;
  let bund = -Infinity, bankW = 0, bankFloor = 0;
  for (let i = 0; i < compiled.paddies.length; i++) {
    const sd = signedDistance(compiled.paddies[i], compiled.frames[i], x, z);
    if (sd >= PADDY_BUND_M + PADDY_BANK_M) continue;
    if (sd <= 0) return floors[i];
    if (sd < PADDY_BUND_M + PADDY_BUND_FALL_M) {
      // the crest rises from the water's edge over its first third, holds to the bund's width and falls past it
      const crest = floors[i] + PADDY_BUND_H * smooth(0, 0.3 * PADDY_BUND_M, sd) * (1 - smooth(PADDY_BUND_M, PADDY_BUND_M + PADDY_BUND_FALL_M, sd));
      if (crest > bund) bund = crest;
    }
    const w = 1 - smooth(PADDY_BUND_M, PADDY_BUND_M + PADDY_BANK_M, sd);
    if (w > bankW) { bankW = w; bankFloor = floors[i]; }
  }
  const banked = bankW > 0 ? h + (bankFloor - h) * bankW : h;
  return bund > banked ? bund : banked;
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
      shelfM: PADDY_SHELF_M, depthM: PADDY_DEPTH_M, name: `paddy ${i}`,
    };
  });
}

/**
 * The paddy water's level at (x, z) over a paddy's water and its bund (the nearest paddy's); NaN elsewhere. The
 * shallow-water sheet's lattice is eight metres, too coarse for a paddy (a lattice point on a bund stood the sheet at the
 * crest and tilted the water up to it, half a metre on Delta's; two terraces' levels met across one cell): the sheet skips
 * its lattice cells here and draws each paddy's own level surface (paddyWaterQuads), and its height sampler answers the
 * level.
 */
export function paddyWaterLevelAt(compiled: CompiledPaddies, x: number, z: number): number {
  const floors = compiled.floors;
  if (floors === null) return NaN;
  let best = PADDY_BUND_M + PADDY_BUND_FALL_M, level = NaN;
  for (let i = 0; i < compiled.paddies.length; i++) {
    const sd = signedDistance(compiled.paddies[i], compiled.frames[i], x, z);
    if (sd < best) { best = sd; level = floors[i] - PADDY_FREEBOARD_M; }
  }
  return level;
}

/** How far each paddy's own water surface runs in under its bund past the water's edge (the bund clips it there). */
const PADDY_SURFACE_TUCK_M = 0.6;
/** Each paddy's own level water surface (the shallow-water sheet draws it instead of its eight-metre lattice there): its
 *  centre, axes, half extents (the water's, tucked under the bund) and level. */
export interface PaddyWaterQuad { x: number; z: number; c: number; s: number; hw: number; hl: number; level: number }
export function paddyWaterQuads(compiled: CompiledPaddies): PaddyWaterQuad[] {
  const floors = compiled.floors;
  if (floors === null) return [];
  return compiled.paddies.map((p, i) => {
    const f = compiled.frames[i];
    return { x: p.x, z: p.z, c: f.c, s: f.s, hw: f.hw + PADDY_SURFACE_TUCK_M, hl: f.hl + PADDY_SURFACE_TUCK_M,
      level: floors[i] - PADDY_FREEBOARD_M };
  });
}

/** Whether (x, z) lies on a paddy's water or bund (vegetation and props keep off; the bank is open ground). */
export function inPaddy(compiled: CompiledPaddies, x: number, z: number): boolean {
  for (let i = 0; i < compiled.paddies.length; i++) {
    if (signedDistance(compiled.paddies[i], compiled.frames[i], x, z) < PADDY_BUND_M + 0.5) return true;
  }
  return false;
}

/** (the look pass) Whether (x, z) lies within PADDY_CLEAR_M of a paddy's water: trees and shrubs keep off. */
export function inPaddyClearing(compiled: CompiledPaddies, x: number, z: number): boolean {
  for (let i = 0; i < compiled.paddies.length; i++) {
    if (signedDistance(compiled.paddies[i], compiled.frames[i], x, z) < PADDY_CLEAR_M) return true;
  }
  return false;
}

/** A rice hill under a paddy's water: its seat (the planting lattice's node nearest (x, z), rows across the width) and
 *  the water's depth over the floor there; null off the water or within a stride of the bund (the edge left unplanted). */
export interface PaddyRiceSeat { x: number; z: number; depthM: number; level: number }
export function paddyRiceAt(compiled: CompiledPaddies, x: number, z: number, out: PaddyRiceSeat): PaddyRiceSeat | null {
  const floors = compiled.floors;
  if (floors === null) return null;
  for (let i = 0; i < compiled.paddies.length; i++) {
    const p = compiled.paddies[i], f = compiled.frames[i];
    const dx = x - p.x, dz = z - p.z;
    const b = dx * f.c - dz * f.s, a = dx * f.s + dz * f.c; // across (width), along (length)
    if (Math.abs(b) > f.hw - 0.9 || Math.abs(a) > f.hl - 0.9) continue;
    const bs = (Math.round(b / PADDY_RICE_ROW_M + 0.5) - 0.5) * PADDY_RICE_ROW_M;
    const as = (Math.round(a / PADDY_RICE_HILL_M + 0.5) - 0.5) * PADDY_RICE_HILL_M;
    out.x = p.x + f.c * bs + f.s * as;
    out.z = p.z - f.s * bs + f.c * as;
    out.level = floors[i] - PADDY_FREEBOARD_M;
    out.depthM = PADDY_DEPTH_M;
    return out;
  }
  return null;
}
