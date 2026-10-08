/**
 * structureSections.ts — a structure's sections: holes, fallen walls, a fallen roof, dropped storeys (destruction core
 * lane, P2, 2026-10-08; docs/DESTRUCTION.md §3.4, §6).
 *
 * Derived from the structure's records alone, as the table is (a host has no rendered kit): the footprint rectangle's
 * four faces over the storeys below the eaves, and the roof above them. The eaves are where the shell bands' plan area
 * falls below three quarters of its widest (a pitched roof's staircase of strips; a flat roof's last half metre), and
 * the storeys split the walls below into 3.2 m bands (at most six). A section's hit points are its share of the
 * structure's by its area — twice its share of the envelope, between 5 % and 30 % — so a house's wall panel falls to
 * one or two 125 mm HE rounds landing in it and its roof to two, while the house itself still takes six (every blow
 * also prices the whole, as in P1); a large building's roof and a storey's faces fall long before it does (a storey
 * can drop).
 *
 * What opens is written into the structure's `StructureOpenings` (world/collision.ts), which every shell band of the
 * structure points at once something has opened: the world raycasts read the structure as a hollow box from then on,
 * so shells and sight lines pass a hole, a fallen wall panel above its metre-high stub, a fallen roof and the storeys
 * that dropped after it. The values are quantized as the wire carries them (millimetre centres, centimetre radii), so
 * the authority, a peer replaying its events and a migrated host restoring its log open exactly the same.
 *
 * Pure and Node-runnable; allocates when a structure's sections are first needed.
 */
import {
  STRUCTURE_HOLE_STRIDE, STRUCTURE_HOLES_PER_SECTION, STRUCTURE_WALL_STUB_M,
  type CollisionRecord, type SimpleCollisionShape, type StructureOpenings,
} from '../world/collision.ts';
import { MUNITION_PROFILES, type MunitionClass } from './destructionEvents.ts';
import type { StructureMaterial } from './structureMaterial.ts';

/** A storey's nominal height (m). */
export const STOREY_M = 3.2;
/** Storeys a structure splits into at most. */
export const MAX_STOREYS = 6;
/** The slot a section-down entry names (it opens no hole). */
export const NO_HOLE = 255;
/** Holes smaller than this are marks: the presentation draws them, nothing passes them. */
export const MIN_HOLE_M = 0.1;
/** A point deeper than this inside every face is the room (its floor), no section's. */
const WALL_BAND_M = 1.2;
/** Plan-area samples for the eaves (m), and the share of the widest a wall storey keeps. */
const AREA_STEP_M = 0.5;
const EAVES_AREA_SHARE = 0.75;
/** A section's hit points: this many times its share of the envelope, within these bounds of the structure's. */
const SECTION_HP_K = 2;
const SECTION_HP_MIN = 0.05;
const SECTION_HP_MAX = 0.3;
/** A blast's hole: radius = 0.45 · (W · structureFactor)^⅓ (125 mm HE 0.68 m, the gunship's howitzer 0.85 m). */
const BLAST_HOLE_K = 0.45;
/** Walls give way more or less readily than masonry. */
const HOLE_MATERIAL: Readonly<Record<StructureMaterial, number>> = Object.freeze({
  timber: 1.3, adobe: 1.15, masonry: 1, concrete: 0.7,
});
/** No hole wider than this, nor than half a storey. */
const MAX_HOLE_M = 1.6;

export type SectionKind = 'wall' | 'roof';

/** A structure's sections: its openings (what the raycasts read) and each section's hit points. */
export interface StructureSections extends StructureOpenings {
  /** Sections: 4 · storeys walls, then the roof. */
  readonly count: number;
  readonly maxHp: Float64Array;
  readonly hp: Float64Array;
  /** Its shell bands point at these openings (set once the first thing opens). */
  attached: boolean;
}

/** What a structure's sections are derived from (StructureState's fields). */
export interface SectionSource {
  readonly cx: number;
  readonly cz: number;
  readonly hw: number;
  readonly hd: number;
  readonly yaw: number;
  readonly baseY: number;
  readonly topY: number;
  readonly maxHp: number;
  readonly obstacles: readonly CollisionRecord[];
  readonly colliders: readonly CollisionRecord[];
}

/** A footprint part's plan area (m²). */
export function shapeArea(shape: SimpleCollisionShape): number {
  if (shape.kind === 'circle') return Math.PI * shape.r * shape.r;
  if (shape.kind === 'obb') return 4 * shape.hw * shape.hl;
  let twice = 0;
  for (let i = 0; i < shape.points.length; i += 2) {
    const j = (i + 2) % shape.points.length;
    twice += shape.points[i] * shape.points[j + 1] - shape.points[j] * shape.points[i + 1];
  }
  return Math.abs(twice) * 0.5;
}

/** Where the walls end: the top of the highest half metre whose plan area is at least ¾ of the widest. */
export function eavesHeight(source: SectionSource): number {
  const span = source.topY - source.baseY;
  const fallback = source.baseY + 0.7 * Math.max(0, span);
  if (!(span > 1) || !source.colliders.length) return fallback;
  const bins = Math.max(1, Math.ceil(span / AREA_STEP_M));
  const area = new Float64Array(bins);
  const add = (y0: number, y1: number, value: number) => {
    for (let i = 0; i < bins; i++) {
      const mid = source.baseY + (i + 0.5) * AREA_STEP_M;
      if (mid >= y0 && mid <= y1) area[i] += value;
    }
  };
  for (const record of source.colliders) {
    const shape = record.shape2;
    if (!shape) {
      add(record.min[1], record.max[1], (record.max[0] - record.min[0]) * (record.max[2] - record.min[2]));
      continue;
    }
    const parts = shape.kind === 'compound' ? shape.parts : [shape];
    for (const part of parts) add(part.y0 ?? record.min[1], part.y1 ?? record.max[1], shapeArea(part));
  }
  let peak = 0;
  for (let i = 0; i < bins; i++) if (area[i] > peak) peak = area[i];
  if (!(peak > 0)) return fallback;
  let top = -1;
  for (let i = 0; i < bins; i++) if (area[i] >= EAVES_AREA_SHARE * peak) top = i;
  const eaves = source.baseY + (top + 1) * AREA_STEP_M;
  // walls at least a storey (or the whole of a low shed), a roof at least its last half metre (a flat roof's slab)
  const lowest = source.baseY + Math.min(2.4, span * 0.6);
  const highest = source.topY - Math.min(AREA_STEP_M, span * 0.1);
  return Math.max(lowest, Math.min(highest, eaves));
}

/** Derive a structure's sections (all standing, no holes). */
export function createStructureSections(source: SectionSource): StructureSections {
  const eavesY = eavesHeight(source);
  const wallsH = Math.max(0.5, eavesY - source.baseY);
  const storeys = Math.max(1, Math.min(MAX_STOREYS, Math.round(wallsH / STOREY_M)));
  const storeyH = wallsH / storeys;
  const count = storeys * 4 + 1;
  const hw = Math.max(0.05, source.hw), hd = Math.max(0.05, source.hd);
  // the end faces (0, 1) span the width, the sides (2, 3) the length
  const faceLength = [2 * hw, 2 * hw, 2 * hd, 2 * hd];
  const roofArea = 4 * hw * hd;
  const envelope = 2 * (2 * hw + 2 * hd) * wallsH + roofArea;
  const share = (area: number) => Math.max(SECTION_HP_MIN, Math.min(SECTION_HP_MAX, SECTION_HP_K * area / envelope));
  const maxHp = new Float64Array(count);
  for (let k = 0; k < storeys; k++) {
    for (let f = 0; f < 4; f++) maxHp[k * 4 + f] = source.maxHp * share(faceLength[f] * storeyH);
  }
  maxHp[count - 1] = source.maxHp * share(roofArea);
  return {
    cx: source.cx, cz: source.cz, fx: Math.sin(source.yaw), fz: Math.cos(source.yaw), hw, hd,
    baseY: source.baseY, eavesY, topY: source.topY, storeys, storeyH, capY: source.topY,
    down: new Uint8Array(count), holeCount: new Uint8Array(count),
    holes: new Float64Array(count * STRUCTURE_HOLES_PER_SECTION * STRUCTURE_HOLE_STRIDE),
    records: source.colliders, rayStamp: 0, rayRecord: null,
    count, maxHp, hp: maxHp.slice(), attached: false,
  };
}

export const roofSection = (sections: StructureSections): number => sections.storeys * 4;
export const sectionKind = (sections: StructureSections, section: number): SectionKind =>
  section === sections.storeys * 4 ? 'roof' : 'wall';

/** The section a point on the structure belongs to: the roof above the eaves, else the face nearest it over its storey;
 * −1 for a point deep inside the footprint below the eaves (the floor of a room a round entered by). */
export function sectionAt(sections: StructureSections, x: number, y: number, z: number): number {
  const s = sections;
  if (y >= s.eavesY - 1e-3) return s.storeys * 4;
  const dx = x - s.cx, dz = z - s.cz;
  const along = dx * s.fx + dz * s.fz, across = dx * s.fz - dz * s.fx;
  const pa = Math.abs(along) - s.hd, pc = Math.abs(across) - s.hw;
  if (pa < -WALL_BAND_M && pc < -WALL_BAND_M) return -1;
  const side = Math.abs(pa) <= Math.abs(pc) ? (along >= 0 ? 0 : 1) : (across >= 0 ? 2 : 3);
  const storey = Math.min(s.storeys - 1, Math.max(0, Math.floor((y - s.baseY) / s.storeyH)));
  return storey * 4 + side;
}

/** A section's height span (world y): a wall's storey, the roof's eaves to top. */
export function sectionSpan(sections: StructureSections, section: number, out: { y0: number; y1: number }): { y0: number; y1: number } {
  if (section === sections.storeys * 4) {
    out.y0 = sections.eavesY;
    out.y1 = sections.topY;
  } else {
    const storey = Math.floor(section / 4);
    out.y0 = sections.baseY + storey * sections.storeyH;
    out.y1 = out.y0 + sections.storeyH;
  }
  return out;
}

/** The outward normal of a section (a face's, or up for the roof). */
export function sectionNormal(sections: StructureSections, section: number, out: { x: number; y: number; z: number }) {
  const s = sections;
  if (section === s.storeys * 4) { out.x = 0; out.y = 1; out.z = 0; return out; }
  const side = section % 4;
  out.y = 0;
  if (side === 0) { out.x = s.fx; out.z = s.fz; } else if (side === 1) { out.x = -s.fx; out.z = -s.fz; }
  else if (side === 2) { out.x = s.fz; out.z = -s.fx; } else { out.x = -s.fz; out.z = s.fx; }
  return out;
}

/** A point on the middle of a section, on its face's plane (a wall's above its stub; the roof's over the footprint's
 * centre, half way up): where a section-down event stands, for the presentation to find its own section by. */
export function sectionCentre(sections: StructureSections, section: number, out: { x: number; y: number; z: number }) {
  const s = sections;
  if (section === s.storeys * 4) {
    out.x = s.cx; out.y = (s.eavesY + s.topY) * 0.5; out.z = s.cz;
    return out;
  }
  const side = section % 4, storey = Math.floor(section / 4);
  const y0 = s.baseY + storey * s.storeyH;
  const low = storey === 0 ? Math.min(y0 + STRUCTURE_WALL_STUB_M, y0 + s.storeyH) : y0;
  out.y = (low + y0 + s.storeyH) * 0.5;
  const along = side === 0 ? s.hd : side === 1 ? -s.hd : 0;
  const across = side === 2 ? s.hw : side === 3 ? -s.hw : 0;
  // world = along · forward + across · (fz, −fx)
  out.x = s.cx + along * s.fx + across * s.fz;
  out.z = s.cz + along * s.fz - across * s.fx;
  return out;
}

/** The hole a blast opens where it strikes a wall: 0.45 · (W · structureFactor)^⅓, by the wall's material. */
export function blastHoleRadiusM(chargeKg: number, munition: MunitionClass): number {
  const factor = MUNITION_PROFILES[munition].structureFactor;
  if (!(chargeKg > 0) || !(factor > 0)) return 0;
  return BLAST_HOLE_K * Math.cbrt(chargeKg * factor);
}

/** A hole's radius in a structure's walls (its material), within the bounds (none past half a storey or 1.6 m). */
export function holeRadiusFor(sections: StructureSections, radiusM: number, material: StructureMaterial): number {
  return Math.min(MAX_HOLE_M, sections.storeyH * 0.5, radiusM * HOLE_MATERIAL[material]);
}

/** Write a hole (its centre a world point) into a section's slot. */
export function openHole(sections: StructureSections, section: number, slot: number,
  x: number, y: number, z: number, radiusM: number): void {
  const s = sections;
  if (section < 0 || section >= s.count || slot < 0 || slot >= STRUCTURE_HOLES_PER_SECTION) return;
  const base = (section * STRUCTURE_HOLES_PER_SECTION + slot) * STRUCTURE_HOLE_STRIDE;
  const dx = x - s.cx, dz = z - s.cz;
  const along = dx * s.fx + dz * s.fz, across = dx * s.fz - dz * s.fx;
  if (section === s.storeys * 4) {
    s.holes[base] = along; s.holes[base + 1] = across; s.holes[base + 2] = 0;
  } else {
    const side = section % 4;
    s.holes[base] = side < 2 ? across : along;
    s.holes[base + 1] = y;
    s.holes[base + 2] = side === 0 ? along - s.hd : side === 1 ? -along - s.hd : side === 2 ? across - s.hw : -across - s.hw;
  }
  s.holes[base + 3] = radiusM;
  if (slot >= s.holeCount[section]) s.holeCount[section] = slot + 1;
}

/** Nothing stands above this: the top while the roof stands; the eaves once it fell; a storey's floor (the ground
 * storey's stubs) once that storey and everything above it fell. */
export function capHeight(sections: StructureSections): number {
  const s = sections;
  if (!s.down[s.storeys * 4]) return s.topY;
  let cap = s.eavesY;
  for (let k = s.storeys - 1; k >= 0; k--) {
    if (!(s.down[k * 4] && s.down[k * 4 + 1] && s.down[k * 4 + 2] && s.down[k * 4 + 3])) break;
    cap = k === 0 ? s.baseY + STRUCTURE_WALL_STUB_M : s.baseY + k * s.storeyH;
  }
  return cap;
}

/** A section falls (its hit points gone): what stands above it is recomputed. */
export function fellSection(sections: StructureSections, section: number): void {
  if (section < 0 || section >= sections.count) return;
  sections.down[section] = 1;
  sections.hp[section] = 0;
  sections.capY = capHeight(sections);
}

/**
 * The falls a fallen section brings (§3.4), in order, into `out`: a roof whose top storey has three faces down comes
 * down; with the roof down, a top storey with three faces down drops whole (its standing faces fall), and the storey
 * below is the top. Applies them.
 */
export function cascadeFalls(sections: StructureSections, out: number[]): number[] {
  const s = sections;
  out.length = 0;
  const roof = s.storeys * 4;
  for (;;) {
    let top = -1;
    for (let k = s.storeys - 1; k >= 0; k--) {
      if (!(s.down[k * 4] && s.down[k * 4 + 1] && s.down[k * 4 + 2] && s.down[k * 4 + 3])) { top = k; break; }
    }
    if (top < 0) return out;
    const facesDown = s.down[top * 4] + s.down[top * 4 + 1] + s.down[top * 4 + 2] + s.down[top * 4 + 3];
    if (facesDown < 3) return out;
    if (!s.down[roof]) {
      fellSection(s, roof);
      out.push(roof);
      continue;
    }
    for (let f = 0; f < 4; f++) {
      if (s.down[top * 4 + f]) continue;
      fellSection(s, top * 4 + f);
      out.push(top * 4 + f);
    }
  }
}

/** Whether a wall section's fall completed its storey: the roof and all four of the storey's faces down, and nothing
 * standing above its floor line (capY at its floor, or the ground storey's stubs). */
export function storeyDownAt(sections: StructureSections, section: number): boolean {
  const s = sections;
  if (section < 0 || section >= s.storeys * 4 || !s.down[s.storeys * 4]) return false;
  const storey = Math.floor(section / 4);
  if (!(s.down[storey * 4] && s.down[storey * 4 + 1] && s.down[storey * 4 + 2] && s.down[storey * 4 + 3])) return false;
  const floor = storey === 0 ? s.baseY + STRUCTURE_WALL_STUB_M : s.baseY + storey * s.storeyH;
  return s.capY <= floor + 1e-9;
}

/** Point every shell band of the structure at its openings (idempotent). */
export function attachOpenings(sections: StructureSections): void {
  if (sections.attached) return;
  sections.attached = true;
  for (const record of sections.records) record.openings = sections;
}
