// src/world/maps/wellKit.ts — the village well and the square's monument as each place built them (the looks lane,
// 2026-10-13; LOOKS-BRIEF item 5). The destruction stream made both destructible this week (inhabitKit bWell,
// bMonument: one stone curb under a timber roof and one stepped obelisk on every map). Here each map's are its region's,
// member by member in its kit's stone and timber, on the DESTRUCTIBLE_TYPES contract (r, h, collider, crushMin, keep);
// their broken states the same members thrown down.
//
// Wells (props.ts placeVillageWell, eighteen maps):
//   zhuravel   the steppe's sweep well (Prokhorovka, the Virgin Lands): a log-cribbed well head, the forked post (soha)
//              and the long sweep pole on its pivot, the counterweight on its short arm, the hanging pole and its bucket;
//   logwell    the roofed log well with its windlass and crank (the Podhale, Lorraine's farms): a corner-notched crib,
//              two posts, the windlass drum, a shingled gable roof;
//   drawwell   the Franconian, Hessian and Eifel town's draw well: a curb of dressed stone with its moulded coping, two
//              iron uprights and the wrought-iron crown with its scrolls and its pulley, the chain and the bucket;
//   pump       the Zeeland brick pump stand: a brick pillar under its stone cap, the cast-iron pump and its curved
//              handle, the spout over a stone trough, a bucket;
//   granite    the Breton well (puits): a curb of great granite blocks, two granite uprights and their lintel with the
//              pulley;
//   desert     the stone well ring of the desert yards (the Dahar, Wadi Rum, Oljato): rough stones laid dry, two forked
//              posts and a crossbar with the pulley wheel, the rope, a stone trough beside it;
//   tubewell   the Jamuna chars' iron hand pump on its cement platform;
//   ringwell   the delta's and the hills' concrete ring well under a timber A-frame and its pulley, water jars beside it;
//   trough     the Maurienne's fountain trough (bachal): a hewn larch trough on stones, its spout post and iron pipe;
//   windlass   the Louisiana well house: a plank box, a windlass under a small gable roof of shingles.
// Monuments (props.ts placeCentralMonument: Steinburg, Amberford, the foundry town):
//   krieger    the Franconian Kriegerdenkmal: a stepped plinth, a pedestal with its tablet and cornice, a laurel wreath,
//              the soldier standing on it in stone;
//   lorraine   the Lorraine cross (Croix de Lorraine) of the French memorials, on its stepped plinth with its tablet;
//   stele      the Saar works' memorial stele: a tall sandstone stele, its cornice, the iron cross on its face and a wreath.
//
// Surfaces: a timber well rides the structure wood; a stone one the kit's regionalStone (its print, its tint, its damp
// foot), its iron and timber over the print's flat texel (craftMesh.ts STONE_FLAT_TEXEL); a monument on a map without a
// kit rides the map's stone. Pure geometry: no DOM, no materials, no draws from any stream.
import * as THREE from 'three';
import type { ArchitectureStyle, StoneSurfaceKind } from './regional/types.ts';
import { wallWeather } from './regional/weather.ts';
import {
  Mesh, STONE_FLAT_TEXEL, X, Y, Z, add, hexLin, lin, member, mix, mul, pole, scl, stream, type Rgb, type UvMode, type V3,
} from './craftMesh.ts';

export type WellForm = 'zhuravel' | 'logwell' | 'drawwell' | 'pump' | 'granite' | 'desert' | 'tubewell' | 'ringwell' | 'trough' | 'windlass';
export type MonumentForm = 'krieger' | 'lorraine' | 'stele';

/** Each place's well: by its kit, else by its map (a map with no kit). */
export const WELL_FORMS: Readonly<Record<string, WellForm>> = Object.freeze({
  kolkhoz: 'zhuravel', steppe: 'zhuravel', winter: 'logwell', autumn: 'logwell', fjord: 'logwell',
  franconian: 'drawwell', hessian: 'drawwell', eifel: 'drawwell', dalmatian: 'drawwell', andalusian: 'drawwell', chouf: 'drawwell',
  polder: 'pump', ruhr: 'pump', saar: 'pump', breton: 'granite',
  ksar: 'desert', wadirum: 'desert', navajo: 'desert', siwa: 'desert', glencanyon: 'desert',
  bengal: 'tubewell', mekong: 'ringwell', kohima: 'ringwell', kyushu: 'ringwell', shanghai: 'ringwell',
  savoyard: 'trough', longleaf: 'windlass', queenstown: 'windlass',
});
/** Each place's monument: by its kit, else by its map. */
export const MONUMENT_FORMS: Readonly<Record<string, MonumentForm>> = Object.freeze({
  franconian: 'krieger', hessian: 'krieger', autumn: 'lorraine', saar: 'stele', ruhr: 'stele',
});
/** The forms whose every member is timber (the structure wood); the rest stand in the kit's stone. */
export const TIMBER_WELLS: ReadonlySet<WellForm> = new Set<WellForm>(['zhuravel', 'logwell', 'trough', 'windlass']);

export function wellFormFor(architectureId: string | null | undefined, mapId: string): WellForm | null {
  return (architectureId ? WELL_FORMS[architectureId] : undefined) ?? WELL_FORMS[mapId] ?? null;
}
export function monumentFormFor(architectureId: string | null | undefined, mapId: string): MonumentForm | null {
  return (architectureId ? MONUMENT_FORMS[architectureId] : undefined) ?? MONUMENT_FORMS[mapId] ?? null;
}

/** A build's surfaces: the kit's stone (print kind, tint, its weather's damp), or none (the map's plain stone). */
export interface WellBuildContext {
  stone?: { kind: StoneSurfaceKind; dressed: boolean; tint: Rgb; damp: number } | null;
  seed?: number;
}
export function wellStoneOf(style: ArchitectureStyle | null | undefined): WellBuildContext['stone'] {
  if (!style) return null;
  const s = style.surfaces.stone;
  return { kind: s.kind, dressed: !!s.dressed, tint: s.tint, damp: style.weather?.damp ?? 0.8 };
}

// colours (sRGB hex → linear)
const OAK = hexLin(0x6a5a48), LOG = hexLin(0x6f604e), LOG_END = hexLin(0x9a8466), PINE = hexLin(0x847258), LARCH = hexLin(0x7c7268);
const IRON = hexLin(0x26282a), PUMP_GREEN = hexLin(0x2f4d3e), PUMP_BLUE = hexLin(0x3f6a86), ROPE = hexLin(0x6e6250), WATER = hexLin(0x1c2a32);
const SHINGLE = hexLin(0x5e554b), BRONZE = hexLin(0x4f5a46), JAR = hexLin(0x9a6a48), CEMENT = hexLin(0x9a968c);

const G = (u0: number): UvMode => ({ kind: 'grain', u0 });
const FLAT: UvMode = { kind: 'flat' };
const MASON: UvMode = { kind: 'masonry' };

/** The mesh for a form: timber on the structure wood, stone on the kit's stone (its flat texel for the rest). */
function meshFor(timber: boolean, ctx: WellBuildContext): Mesh {
  if (timber || !ctx.stone) return new Mesh({ kind: 'wood' });
  const S = ctx.stone;
  const texel = STONE_FLAT_TEXEL[`${S.kind}${S.dressed ? ':dressed' : ''}`] ?? STONE_FLAT_TEXEL[S.kind] ?? STONE_FLAT_TEXEL.sandstone;
  return new Mesh({ kind: 'stone', texel: [lin(texel.srgb[0] * S.tint[0]), lin(texel.srgb[1] * S.tint[1]), lin(texel.srgb[2] * S.tint[2])], flatUv: texel.uv });
}

/** A stone surface's colour at a point: the kit's print, darker at its damp foot. */
function damp(ctx: WellBuildContext, k = 1): (q: V3) => Rgb {
  const d = ctx.stone?.damp ?? 0.7;
  return (q) => mul([k, k, k], wallWeather(q[1], d));
}

/** A ring of `n` blocks (a curb's courses) between radii r0 and r1 from y0 to y1, each its own stone (joints). */
function blockRing(m: Mesh, ctx: WellBuildContext, n: number, r0: number, r1: number, y0: number, y1: number, phase: number, r: () => number,
  opts: { skip?: number; tilt?: number } = {}): void {
  const rm = (r0 + r1) / 2, depth = r1 - r0;
  for (let k = 0; k < n; k++) {
    if (opts.skip && r() < opts.skip) continue;
    const a0 = phase + (k + 0.03) / n * Math.PI * 2, a1 = phase + (k + 0.97) / n * Math.PI * 2, am = (a0 + a1) / 2;
    const p0: V3 = [Math.cos(a0) * rm, (y0 + y1) / 2, Math.sin(a0) * rm], p1: V3 = [Math.cos(a1) * rm, (y0 + y1) / 2, Math.sin(a1) * rm];
    member(m, p0, p1, depth, y1 - y0, [Math.cos(am), 0, Math.sin(am)], [1, 1, 1], MASON, { chamfer: 0.025, shade: damp(ctx, 0.96 + r() * 0.08) });
  }
}

/** The water in a shaft: a dark disc at y (timber surface: its vertex colour; stone: over the flat texel). */
function waterDisc(m: Mesh, rad: number, y: number, n = 12): void {
  const c: V3 = [0, y, 0];
  for (let k = 0; k < n; k++) {
    const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2;
    const col = m.colour(WATER, false), uv = m.surface.flatUv ?? [0.5, 0.5];
    m.tri(c, [Math.cos(a1) * rad, y, Math.sin(a1) * rad], [Math.cos(a0) * rad, y, Math.sin(a0) * rad], Y, Y, Y, uv, uv, uv, col);
  }
}

/** A bucket hanging (or standing) at p: a short tapered pole of staves and its iron band. */
function bucket(m: Mesh, p: V3, timber: Rgb): void {
  pole(m, [p[0], p[1], p[2]], [p[0], p[1] + 0.32, p[2]], 0.13, 0.16, timber, 0.6, 8);
  pole(m, [p[0], p[1] + 0.06, p[2]], [p[0], p[1] + 0.1, p[2]], 0.142, 0.146, IRON, 0.9, 8);
}

/** A crib of logs (corner-notched, the ends running past) w square from y0, `courses` high: the zrub. */
function logCrib(m: Mesh, w: number, y0: number, courses: number, r: () => number, opts: { radius?: number } = {}): number {
  const rad = opts.radius ?? 0.09, half = w / 2;
  let y = y0 + rad;
  for (let c = 0; c < courses; c++) {
    for (const s of [-1, 1]) {
      const col = mix(LOG, LOG_END, r() * 0.25);
      if (c % 2 === 0) pole(m, [-half - 0.14, y, s * half], [half + 0.14, y, s * half], rad, rad * 0.95, col, 0.1 + r() * 0.3, 7);
      else pole(m, [s * half, y, -half - 0.14], [s * half, y, half + 0.14], rad, rad * 0.95, col, 0.1 + r() * 0.3, 7);
    }
    y += rad * 1.55;
  }
  return y - rad * 0.55;
}

/** An upright block at (x, z) from y0 to y1, sx across x and sz across z (a pedestal, a step, a stele). */
function block(m: Mesh, x: number, z: number, y0: number, y1: number, sx: number, sz: number, col: Rgb, uv: UvMode,
  opts: { chamfer?: number; shade?: (q: V3) => Rgb } = {}): void {
  member(m, [x, y0, z], [x, y1, z], sz, sx, Z, col, uv, opts);
}

// ------------------------------------------------------------------------------------------------------------- wells

function zhuravel(ctx: WellBuildContext, broken: boolean): THREE.BufferGeometry {
  const m = meshFor(true, ctx), r = stream(0x2a7e + (ctx.seed ?? 0));
  if (!broken) {
    const top = logCrib(m, 1.2, 0, 5, r);
    // the crib's plank cover half over the shaft
    for (let k = 0; k < 4; k++) member(m, [-0.62, top + 0.02, -0.6 + k * 0.17], [0.62, top + 0.02, -0.6 + k * 0.17], 0.035, 0.16, Y, mul(PINE, 0.9 + r() * 0.15), G(0.2 + k * 0.1));
    waterDisc(m, 0.5, 0.35, 4);
    // the forked post (soha) behind the well, its fork; the sweep on its pivot, the long arm up over the well
    const px = 0, pz = -1.9, pivot: V3 = [px, 3.25, pz];
    pole(m, [px, -0.3, pz], [px, 2.9, pz], 0.15, 0.12, mul(LOG, 0.85), 0.5, 8);
    for (const s of [-1, 1]) pole(m, [px, 2.85, pz], [px + s * 0.16, 3.45, pz], 0.075, 0.06, mul(LOG, 0.85), 0.6, 6);
    pole(m, [px - 0.2, pivot[1], pz], [px + 0.2, pivot[1], pz], 0.035, 0.035, IRON, 0.9, 6);
    // the sweep: long arm rising toward the well (the bucket lowered: the long arm down, the counterweight up)
    const longTip: V3 = [px, 2.55, 1.15], shortEnd: V3 = [px, 4.55, pz - 1.6];
    pole(m, pivot, longTip, 0.07, 0.045, PINE, 0.2, 6);
    pole(m, pivot, shortEnd, 0.075, 0.085, PINE, 0.3, 6);
    // the counterweight: a bundle of logs lashed under the short arm's end
    for (let k = 0; k < 3; k++) pole(m, add(shortEnd, [-0.22 + k * 0.22, -0.18, -0.25]), add(shortEnd, [-0.22 + k * 0.22, -0.32, 0.35]), 0.08, 0.08, mix(LOG, LOG_END, 0.3), 0.4, 6);
    // the hanging pole (ochep) from the long tip into the shaft, and the bucket at its foot
    pole(m, longTip, [px, 0.85, 0.15], 0.03, 0.03, mul(PINE, 0.95), 0.7, 5);
    bucket(m, [px, 0.55, 0.15], mul(PINE, 0.8));
  } else {
    // the crib's top courses thrown off, the post snapped, the sweep and its pole lying across the ground
    logCrib(m, 1.2, 0, 2, r);
    for (let k = 0; k < 5; k++) {
      const a = r() * Math.PI * 2, d = 1.0 + r() * 0.8, start = m.mark;
      pole(m, [-0.7, 0.09, 0], [0.7, 0.09, 0], 0.09, 0.085, mix(LOG, LOG_END, r() * 0.3), 0.2, 7);
      m.turn(start, 0, 0, a);
      for (let i = start; i < m.mark; i += 3) { m.p[i] += Math.cos(a) * d; m.p[i + 2] += Math.sin(a) * d; }
    }
    waterDisc(m, 0.5, 0.33, 4);
    pole(m, [0, -0.3, -1.9], [0, 0.85, -1.9], 0.15, 0.13, mul(LOG, 0.85), 0.5, 8);
    pole(m, [0.3, 0.08, -1.7], [1.6, 0.06, 2.9], 0.07, 0.045, PINE, 0.2, 6);
    pole(m, [-0.4, 0.1, -2.2], [-1.2, 0.12, -4.0], 0.075, 0.08, PINE, 0.3, 6);
    pole(m, [-0.5, 0.05, -0.9], [0.9, 0.05, -1.6], 0.03, 0.03, mul(PINE, 0.95), 0.7, 5);
    bucket(m, [1.3, 0.0, 0.6], mul(PINE, 0.8));
  }
  return m.geometry();
}

function logwell(ctx: WellBuildContext, broken: boolean): THREE.BufferGeometry {
  const m = meshFor(true, ctx), r = stream(0x1093 + (ctx.seed ?? 0));
  const top = logCrib(m, 1.3, 0, broken ? 2 : 6, r, { radius: 0.085 });
  waterDisc(m, 0.55, 0.3, 4);
  if (!broken) {
    for (const s of [-1, 1]) member(m, [s * 0.78, top - 0.2, 0], [s * 0.78, top + 1.35, 0], 0.13, 0.13, Z, mul(OAK, 0.9), G(0.2 + s * 0.1), { chamfer: 0.015 });
    // the windlass drum and its crank
    pole(m, [-0.74, top + 0.75, 0], [0.74, top + 0.75, 0], 0.09, 0.09, PINE, 0.4, 8);
    member(m, [0.86, top + 0.75, 0], [0.86, top + 0.45, 0.05], 0.03, 0.04, X, IRON, G(0.9));
    member(m, [0.86, top + 0.45, 0.05], [1.0, top + 0.45, 0.05], 0.03, 0.03, Z, IRON, G(0.9));
    pole(m, [0, top + 0.68, 0], [0, 0.95, 0.05], 0.012, 0.012, ROPE, 0.8, 4);
    bucket(m, [0, 0.62, 0.05], mul(PINE, 0.8));
    // the gable roof of shingles over the drum: two boards, the ridge
    const ry = top + 1.35;
    for (const s of [-1, 1]) {
      member(m, [-0.95, ry + 0.2, s * 0.42], [0.95, ry + 0.2, s * 0.42], 0.9, 0.04, [0, 1.05, -s], mix(SHINGLE, OAK, 0.2), G(0.3 + s * 0.1));
    }
    member(m, [-0.98, ry + 0.52, 0], [0.98, ry + 0.52, 0], 0.08, 0.08, Y, mul(OAK, 0.8), G(0.7));
    member(m, [-0.9, ry, 0], [0.9, ry, 0], 0.1, 0.12, Y, mul(OAK, 0.85), G(0.6));
  } else {
    for (const [a, b] of [[[0.5, 0.07, -1.0], [1.8, 0.07, 0.2]], [[-1.0, 0.07, 0.6], [-1.6, 0.07, 2.0]]] as Array<[V3, V3]>) member(m, a, b, 0.13, 0.13, Y, mul(OAK, 0.9), G(0.2));
    member(m, [-1.2, 0.06, -1.1], [0.3, 0.12, -2.0], 0.9, 0.04, Y, mix(SHINGLE, OAK, 0.2), G(0.3));
    member(m, [0.2, 0.05, 1.2], [1.6, 0.1, 1.6], 0.9, 0.04, Y, mix(SHINGLE, OAK, 0.2), G(0.4));
    pole(m, [-0.6, 0.09, 1.4], [0.8, 0.09, 1.9], 0.09, 0.09, PINE, 0.4, 8);
    bucket(m, [1.0, 0, -0.6], mul(PINE, 0.8));
  }
  return m.geometry();
}

/** The draw well: a curb of dressed stone with its coping, iron uprights, the wrought-iron crown with scrolls and pulley. */
function drawwell(ctx: WellBuildContext, broken: boolean): THREE.BufferGeometry {
  const m = meshFor(false, ctx), r = stream(0xd7a3 + (ctx.seed ?? 0));
  const R0 = 0.66, R1 = 0.98, H = broken ? 0.42 : 0.82;
  blockRing(m, ctx, 10, R0, R1, -0.1, H * 0.5, 0, r);
  blockRing(m, ctx, 10, R0, R1, H * 0.5, H, Math.PI / 10, r, broken ? { skip: 0.5 } : {});
  if (!broken) blockRing(m, ctx, 12, R0 - 0.04, R1 + 0.05, H, H + 0.14, 0.13, r);
  waterDisc(m, R0, 0.25, 12);
  if (!broken) {
    const top = H + 0.14, y1 = top + 1.55;
    for (const s of [-1, 1]) member(m, [s * 0.86, top - 0.08, 0], [s * 0.86, y1, 0], 0.05, 0.05, Z, IRON, FLAT);
    // the crown: an arch of flat bar from upright to upright, a second inside it, the scrolls between, the finial
    let prev: V3 = [-0.86, y1, 0], prev2: V3 = [-0.62, y1, 0];
    for (let k = 1; k <= 10; k++) {
      const t = k / 10 * Math.PI, p: V3 = [-Math.cos(t) * 0.86, y1 + Math.sin(t) * 0.55, 0], q: V3 = [-Math.cos(t) * 0.62, y1 + Math.sin(t) * 0.36, 0];
      member(m, prev, p, 0.045, 0.02, Z, IRON, FLAT);
      member(m, prev2, q, 0.035, 0.018, Z, IRON, FLAT);
      if (k % 2 === 0) member(m, p, q, 0.02, 0.015, Z, IRON, FLAT);
      prev = p; prev2 = q;
    }
    member(m, [0, y1 + 0.55, 0], [0, y1 + 0.95, 0], 0.03, 0.03, Z, IRON, FLAT);
    // the pulley wheel hung under the crown's crown, the chain into the shaft, the bucket
    const py = y1 + 0.3;
    for (let k = 0; k < 8; k++) {
      const a0 = k / 8 * Math.PI * 2, a1 = (k + 1) / 8 * Math.PI * 2;
      member(m, [Math.cos(a0) * 0.16, py + Math.sin(a0) * 0.16, 0], [Math.cos(a1) * 0.16, py + Math.sin(a1) * 0.16, 0], 0.04, 0.04, Z, IRON, FLAT);
    }
    member(m, [0, y1 + 0.55, 0], [0, py, 0], 0.025, 0.025, Z, IRON, FLAT);
    member(m, [0.16, py, 0], [0.16, 0.95, 0], 0.012, 0.012, Z, IRON, FLAT);
    bucketFlat(m, [0.16, 0.62, 0]);
  } else {
    // the crown fallen across the curb, its uprights bent down
    const start = m.mark;
    for (let k = 1; k <= 10; k++) {
      const t0 = (k - 1) / 10 * Math.PI, t = k / 10 * Math.PI;
      member(m, [-Math.cos(t0) * 0.86, Math.sin(t0) * 0.55, 0], [-Math.cos(t) * 0.86, Math.sin(t) * 0.55, 0], 0.045, 0.02, Z, IRON, FLAT);
    }
    member(m, [-0.86, 0, 0], [-0.86, -1.3, 0], 0.05, 0.05, Z, IRON, FLAT);
    m.tilt(start, [0, 0, 0], X, Math.PI / 2 - 0.1);
    for (let i = start; i < m.mark; i += 3) { m.p[i + 1] = Math.max(0.03, m.p[i + 1] * 0.2 + 0.08); m.p[i + 2] += 1.2; }
    for (let k = 0; k < 5; k++) {
      const a = r() * Math.PI * 2, d = 1.2 + r() * 0.7, s0 = m.mark;
      member(m, [-0.25, 0.12, 0], [0.25, 0.12, 0], 0.3, 0.24, Z, [1, 1, 1], MASON, { chamfer: 0.03, shade: damp(ctx) });
      m.turn(s0, 0, 0, a);
      for (let i = s0; i < m.mark; i += 3) { m.p[i] += Math.cos(a) * d; m.p[i + 2] += Math.sin(a) * d; }
    }
    bucketFlat(m, [1.3, 0.0, -0.7]);
  }
  return m.geometry();
}

/** A bucket in iron and timber over the flat texel (a stone well's). */
function bucketFlat(m: Mesh, p: V3): void {
  const oak = mul(OAK, 0.85);
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2, b = (k + 1) / 8 * Math.PI * 2;
    member(m, [p[0] + Math.cos(a) * 0.14, p[1] + 0.16, p[2] + Math.sin(a) * 0.14], [p[0] + Math.cos(b) * 0.14, p[1] + 0.16, p[2] + Math.sin(b) * 0.14],
      0.03, 0.32, [Math.cos((a + b) / 2), 0, Math.sin((a + b) / 2)], oak, FLAT);
  }
  member(m, [p[0] - 0.15, p[1] + 0.26, p[2]], [p[0] + 0.15, p[1] + 0.26, p[2]], 0.02, 0.02, Z, IRON, FLAT);
}

function pump(ctx: WellBuildContext, broken: boolean): THREE.BufferGeometry {
  const m = meshFor(false, ctx), r = stream(0x9b70 + (ctx.seed ?? 0));
  const ph = broken ? 0.55 : 1.45;
  // the brick pillar on its plinth, its stone cap
  member(m, [0, -0.15, -0.35], [0, 0.2, -0.35], 0.82, 0.7, Z, [1, 1, 1], MASON, { chamfer: 0.02, shade: damp(ctx) });
  member(m, [0, 0.2, -0.35], [0, ph, -0.35], 0.62, 0.56, Z, [1, 1, 1], MASON, { chamfer: 0.015, shade: damp(ctx) });
  if (!broken) member(m, [0, ph, -0.35], [0, ph + 0.12, -0.35], 0.74, 0.68, Z, [1.05, 1.05, 1.05], MASON, { chamfer: 0.03 });
  // the trough before it
  const tz = 0.45;
  // the stone trough: its floor, two long sides and two ends
  block(m, 0, tz, -0.1, 0.12, 1.3, 0.6, [0.95, 0.95, 0.95], MASON, { chamfer: 0.01 });
  for (const s of [-1, 1]) block(m, 0, tz + s * 0.25, 0.12, 0.48, 1.3, 0.1, [0.95, 0.95, 0.95], MASON, { chamfer: 0.01 });
  for (const s of [-1, 1]) block(m, s * 0.6, tz, 0.12, 0.48, 0.1, 0.4, [0.95, 0.95, 0.95], MASON, { chamfer: 0.01 });
  member(m, [-0.55, 0.38, tz], [0.55, 0.38, tz], 0.02, 0.4, Y, WATER, FLAT);
  if (!broken) {
    // the cast-iron pump: its barrel up the pillar's face, the spout over the trough, the curved handle
    const cast = r() < 0.5 ? PUMP_GREEN : IRON;
    pole(m, [0, 0.5, -0.02], [0, 1.75, -0.02], 0.075, 0.07, cast, 0.5, 8);
    pole(m, [0, 1.75, -0.02], [0, 1.88, -0.02], 0.1, 0.06, cast, 0.5, 8);
    member(m, [0, 1.15, 0.03], [0, 1.08, 0.32], 0.05, 0.05, X, cast, FLAT);
    let prev: V3 = [0, 1.82, 0.03];
    for (let k = 1; k <= 6; k++) {
      const t = k / 6, p: V3 = [0, 1.82 + Math.sin(t * Math.PI * 0.8) * 0.22, 0.03 - t * 0.7];
      member(m, prev, p, 0.035, 0.03, X, cast, FLAT); prev = p;
    }
    bucketFlat(m, [0.35, 0.0, 0.9]);
  } else {
    const start = m.mark;
    pole(m, [0, 0.08, 0.3], [0.2, 0.06, 1.5], 0.075, 0.07, IRON, 0.5, 8);
    void start;
    for (let k = 0; k < 6; k++) {
      const a = r() * Math.PI * 2, d = 0.9 + r() * 0.8, s0 = m.mark;
      member(m, [-0.12, 0.06, 0], [0.12, 0.06, 0], 0.12, 0.06, Z, [1, 1, 1], MASON);
      m.turn(s0, 0, 0, a);
      for (let i = s0; i < m.mark; i += 3) { m.p[i] += Math.cos(a) * d; m.p[i + 2] += Math.sin(a) * d - 0.35; }
    }
  }
  return m.geometry();
}

function granite(ctx: WellBuildContext, broken: boolean): THREE.BufferGeometry {
  const m = meshFor(false, ctx), r = stream(0x6a17 + (ctx.seed ?? 0));
  blockRing(m, ctx, 6, 0.62, 1.0, -0.12, broken ? 0.45 : 0.8, 0.1, r, broken ? { skip: 0.3 } : {});
  if (!broken) blockRing(m, ctx, 6, 0.58, 1.04, 0.8, 0.94, 0.62, r);
  waterDisc(m, 0.62, 0.22, 10);
  if (!broken) {
    for (const s of [-1, 1]) member(m, [s * 0.8, 0.9, 0], [s * 0.8, 2.25, 0], 0.26, 0.24, Z, [1, 1, 1], MASON, { chamfer: 0.03, shade: damp(ctx) });
    member(m, [-1.02, 2.37, 0], [1.02, 2.37, 0], 0.3, 0.24, Y, [1.02, 1.02, 1.02], MASON, { chamfer: 0.03 });
    pole(m, [0, 2.0, -0.04], [0, 2.0, 0.04], 0.13, 0.13, IRON, 0.5, 8);
    member(m, [0, 2.25, 0], [0, 2.0, 0], 0.025, 0.025, Z, IRON, FLAT);
    member(m, [0.13, 2.0, 0], [0.13, 0.95, 0], 0.012, 0.012, Z, IRON, FLAT);
    bucketFlat(m, [0.13, 0.62, 0]);
  } else {
    for (const [a, b] of [[[0.6, 0.13, 1.0], [1.9, 0.13, 1.6]], [[-1.0, 0.13, -0.8], [-2.2, 0.13, -1.4]], [[0.4, 0.15, -1.2], [1.9, 0.15, -1.6]]] as Array<[V3, V3]>) {
      member(m, a, b, 0.26, 0.24, Y, [1, 1, 1], MASON, { chamfer: 0.03 });
    }
  }
  return m.geometry();
}

function desertWell(ctx: WellBuildContext, broken: boolean): THREE.BufferGeometry {
  const m = meshFor(false, ctx), r = stream(0xde5e + (ctx.seed ?? 0));
  // the stones in courses: standing, four dressed courses close-jointed and broken in bond under a coping of flat slabs
  // (the lip, proud of the ring); thrown down, two courses of loose rough stones (the coordinator, 2026-10-14: the
  // intact ring must not read as already broken)
  for (let c = 0; c < (broken ? 2 : 4); c++) {
    const n = broken ? 9 + c : 12, ch = broken ? 0.24 : 0.2, y0 = -0.1 + c * ch;
    for (let k = 0; k < n; k++) {
      if (broken && c === 1 && r() < 0.5) continue;
      const gap = broken ? 0.08 : 0.025, jit = broken ? 0.06 : 0;
      const a0 = (k + gap + c * 0.5) / n * Math.PI * 2, a1 = (k + 1 - gap + c * 0.5) / n * Math.PI * 2, am = (a0 + a1) / 2, rm = 0.82 + (r() - 0.5) * jit;
      member(m, [Math.cos(a0) * rm, y0 + ch / 2, Math.sin(a0) * rm], [Math.cos(a1) * rm, y0 + ch / 2, Math.sin(a1) * rm], 0.34, broken ? 0.22 + r() * 0.04 : ch - 0.012,
        [Math.cos(am), 0, Math.sin(am)], [1, 1, 1], MASON, { chamfer: broken ? 0.04 : 0.015, shade: damp(ctx, broken ? 0.9 + r() * 0.15 : 0.96 + r() * 0.06) });
    }
  }
  if (!broken) {
    for (let k = 0; k < 10; k++) {
      const a0 = (k + 0.015) / 10 * Math.PI * 2, a1 = (k + 0.985) / 10 * Math.PI * 2, am = (a0 + a1) / 2;
      member(m, [Math.cos(a0) * 0.86, 0.75, Math.sin(a0) * 0.86], [Math.cos(a1) * 0.86, 0.75, Math.sin(a1) * 0.86], 0.48, 0.1,
        [Math.cos(am), 0, Math.sin(am)], [1.06, 1.04, 1.0], MASON, { chamfer: 0.02, shade: damp(ctx, 1.02) });
    }
  }
  waterDisc(m, 0.62, 0.15, 10);
  const post = hexLin(0x6b5640);
  if (!broken) {
    for (const s of [-1, 1]) {
      // (the forked posts stand front and back of the lip, the trough's side kept clear)
      member(m, [0, -0.2, s * 1.14], [0, 1.85, s * 1.14], 0.13, 0.12, X, post, FLAT, { chamfer: 0.02 });
      for (const t of [-1, 1]) member(m, [0, 1.75, s * 1.14], [0, 2.05, s * 1.14 + t * 0.1], 0.06, 0.06, X, post, FLAT);
    }
    member(m, [0, 1.97, -1.26], [0, 1.97, 1.26], 0.1, 0.1, Y, mul(post, 0.9), FLAT);
    for (let k = 0; k < 8; k++) {
      const a0 = k / 8 * Math.PI * 2, a1 = (k + 1) / 8 * Math.PI * 2;
      member(m, [Math.cos(a0) * 0.2, 1.7 + Math.sin(a0) * 0.2, -0.04], [Math.cos(a1) * 0.2, 1.7 + Math.sin(a1) * 0.2, -0.04], 0.05, 0.05, Z, mul(post, 0.8), FLAT);
    }
    member(m, [0, 1.9, 0], [0, 1.7, 0], 0.04, 0.04, X, IRON, FLAT);
    member(m, [0.2, 1.7, 0], [0.2, 0.85, 0], 0.014, 0.014, X, ROPE, FLAT);
    bucketFlat(m, [0.2, 0.52, 0]);
  } else {
    member(m, [0.7, 0.08, 0.9], [2.1, 0.08, 1.5], 0.13, 0.12, Y, post, FLAT);
    member(m, [-0.6, 0.06, -1.0], [-0.9, 0.06, -2.3], 0.1, 0.1, Y, mul(post, 0.9), FLAT);
  }
  // the stone trough beside it (it stands broken or not)
  member(m, [1.17, 0.12, -0.8], [1.17, 0.12, 0.3], 0.5, 0.36, Y, [0.98, 0.98, 0.98], MASON, { chamfer: 0.03, shade: damp(ctx) });
  member(m, [1.17, 0.31, -0.75], [1.17, 0.31, 0.25], 0.02, 0.3, Y, WATER, FLAT);
  return m.geometry();
}

function tubewell(ctx: WellBuildContext, broken: boolean): THREE.BufferGeometry {
  const m = meshFor(false, ctx), r = stream(0x70be + (ctx.seed ?? 0));
  block(m, 0, 0, -0.25, 0.05, 1.6, 1.8, CEMENT, FLAT, { chamfer: 0.03 });
  member(m, [-0.8, 0.08, 0.86], [0.8, 0.08, 0.86], 0.06, 0.08, Y, mul(CEMENT, 0.9), FLAT);
  member(m, [-0.4, 0.06, 0.55], [0.5, 0.06, 0.55], 0.012, 0.35, Y, WATER, FLAT);
  if (!broken) {
    const cast = PUMP_BLUE;
    pole(m, [0, 0.05, 0], [0, 0.95, 0], 0.07, 0.06, cast, 0.5, 8);
    pole(m, [0, 0.95, 0], [0, 1.25, 0], 0.09, 0.09, cast, 0.5, 8);
    pole(m, [0, 1.25, 0], [0, 1.35, 0], 0.09, 0.03, cast, 0.5, 8);
    member(m, [0, 1.05, 0.06], [0, 0.95, 0.42], 0.05, 0.05, X, cast, FLAT);
    let prev: V3 = [0, 1.32, -0.05];
    for (let k = 1; k <= 6; k++) {
      const t = k / 6, p: V3 = [0, 1.32 + Math.sin(t * Math.PI) * 0.12 - t * 0.25, -0.05 - t * 0.85];
      member(m, prev, p, 0.035, 0.03, X, cast, FLAT); prev = p;
    }
    // a brass lota by the spout
    pole(m, [0.35, 0.07, 0.55], [0.35, 0.27, 0.55], 0.1, 0.06, hexLin(0xa88a4a), 0.5, 8);
  } else {
    pole(m, [0, 0.05, 0], [0, 0.4, 0], 0.07, 0.065, PUMP_BLUE, 0.5, 8);
    pole(m, [0.3, 0.1, -0.3], [1.3, 0.08, -0.9], 0.08, 0.08, PUMP_BLUE, 0.5, 8);
  }
  void r;
  return m.geometry();
}

function ringwell(ctx: WellBuildContext, broken: boolean): THREE.BufferGeometry {
  const m = meshFor(false, ctx), r = stream(0x219e + (ctx.seed ?? 0));
  // the concrete ring: two cast rings stacked, a lip
  blockRing(m, ctx, 14, 0.62, 0.74, -0.1, broken ? 0.3 : 0.55, 0, r, broken ? { skip: 0.35 } : {});
  if (!broken) blockRing(m, ctx, 14, 0.6, 0.78, 0.55, 0.72, 0.1, r);
  waterDisc(m, 0.62, 0.15, 12);
  const bamboo = hexLin(0x9a8862);
  if (!broken) {
    for (const s of [-1, 1]) for (const t of [-1, 1]) member(m, [s * 0.95, -0.15, t * 0.32], [s * 0.15, 2.15, 0], 0.07, 0.07, Z, bamboo, FLAT);
    member(m, [-0.3, 2.08, 0], [0.3, 2.08, 0], 0.07, 0.07, Y, mul(bamboo, 0.9), FLAT);
    member(m, [0, 2.05, 0], [0, 0.85, 0.05], 0.014, 0.014, Z, ROPE, FLAT);
    bucketFlat(m, [0, 0.52, 0.05]);
  } else {
    for (const [a, b] of [[[0.6, 0.06, 0.9], [2.0, 0.06, 0.6]], [[-0.8, 0.06, -0.6], [-1.9, 0.06, 0.8]]] as Array<[V3, V3]>) member(m, a, b, 0.07, 0.07, Y, bamboo, FLAT);
  }
  // water jars beside it
  for (const [x, z] of [[0.95, 0.75], [1.15, 0.2]] as const) {
    if (broken && x > 1.1) continue;
    pole(m, [x, 0, z], [x, 0.3, z], 0.16, 0.22, JAR, 0.5, 9);
    pole(m, [x, 0.3, z], [x, 0.52, z], 0.22, 0.1, JAR, 0.5, 9);
  }
  return m.geometry();
}

function trough(ctx: WellBuildContext, broken: boolean): THREE.BufferGeometry {
  const m = meshFor(true, ctx), r = stream(0x7a06 + (ctx.seed ?? 0));
  // the hewn larch trough on two stones, its water, the spout post with its iron pipe
  const L = 1.9;
  if (!broken) {
    member(m, [-L / 2, 0.42, 0], [L / 2, 0.42, 0], 0.62, 0.5, Y, LARCH, G(0.2), { chamfer: 0.06 });
    member(m, [-L / 2 + 0.08, 0.68, 0], [L / 2 - 0.08, 0.68, 0], 0.02, 0.42, Y, mul(WATER, 1.6), G(0.5));
    for (const s of [-1, 1]) member(m, [s * 0.6, -0.1, 0], [s * 0.6, 0.18, 0], 0.5, 0.4, Z, mul(LARCH, 0.55), G(0.6));
    member(m, [-L / 2 - 0.25, -0.2, 0], [-L / 2 - 0.25, 1.55, 0], 0.22, 0.2, Z, mul(LARCH, 0.9), G(0.7), { chamfer: 0.03 });
    member(m, [-L / 2 - 0.25, 1.55, 0], [-L / 2 - 0.25, 1.68, 0], 0.3, 0.28, Z, mul(LARCH, 0.75), G(0.8), { chamfer: 0.04 });
    pole(m, [-L / 2 - 0.15, 1.2, 0], [-L / 2 + 0.3, 1.16, 0], 0.025, 0.025, IRON, 0.9, 6);
    // the jet into the trough
    pole(m, [-L / 2 + 0.3, 1.16, 0], [-L / 2 + 0.42, 0.7, 0], 0.018, 0.012, hexLin(0xc8d4dc), 0.95, 5);
  } else {
    const start = m.mark;
    member(m, [-L / 2, 0.3, 0], [L / 2, 0.3, 0], 0.62, 0.5, Y, LARCH, G(0.2), { chamfer: 0.06 });
    m.tilt(start, [0, 0, 0.3], X, 0.6);
    for (let i = start; i < m.mark; i += 3) m.p[i + 1] = Math.max(0.02, m.p[i + 1]);
    member(m, [-L / 2 - 0.25, -0.2, 0], [-L / 2 - 0.25, 0.4, 0], 0.22, 0.2, Z, mul(LARCH, 0.9), G(0.7));
    member(m, [-L / 2 + 0.1, 0.1, 0.4], [-L / 2 + 0.9, 0.12, 1.4], 0.22, 0.2, Y, mul(LARCH, 0.9), G(0.7));
  }
  void r;
  return m.geometry();
}

function windlassWell(ctx: WellBuildContext, broken: boolean): THREE.BufferGeometry {
  const m = meshFor(true, ctx), r = stream(0xa1e5 + (ctx.seed ?? 0));
  const w = 1.25, h = broken ? 0.4 : 0.85;
  // the plank box over the shaft
  for (const s of [-1, 1]) {
    for (let k = 0; k * 0.2 < h; k++) {
      member(m, [-w / 2, 0.1 + k * 0.2, s * w / 2], [w / 2, 0.1 + k * 0.2, s * w / 2], 0.03, 0.19, X, mix(PINE, OAK, r() * 0.4), G(0.1 + k * 0.05));
      member(m, [s * w / 2, 0.1 + k * 0.2, -w / 2], [s * w / 2, 0.1 + k * 0.2, w / 2], 0.03, 0.19, X, mix(PINE, OAK, r() * 0.4), G(0.3 + k * 0.05));
    }
  }
  waterDisc(m, 0.5, 0.3, 4);
  if (!broken) {
    for (const s of [-1, 1]) member(m, [s * (w / 2 + 0.06), -0.2, 0], [s * (w / 2 + 0.06), 2.2, 0], 0.12, 0.12, Z, OAK, G(0.5), { chamfer: 0.015 });
    pole(m, [-w / 2, 1.35, 0], [w / 2, 1.35, 0], 0.08, 0.08, PINE, 0.4, 8);
    member(m, [w / 2 + 0.14, 1.35, 0], [w / 2 + 0.14, 1.05, 0.04], 0.03, 0.04, X, IRON, G(0.9));
    pole(m, [0, 1.28, 0], [0, 0.95, 0.04], 0.012, 0.012, ROPE, 0.8, 4);
    bucket(m, [0, 0.62, 0.04], mul(PINE, 0.8));
    for (const s of [-1, 1]) member(m, [-0.95, 2.35, s * 0.42], [0.95, 2.35, s * 0.42], 0.95, 0.04, [0, 1.0, -s], SHINGLE, G(0.3 + s * 0.1));
    member(m, [-0.98, 2.68, 0], [0.98, 2.68, 0], 0.08, 0.08, Y, mul(OAK, 0.8), G(0.7));
    member(m, [-0.9, 2.18, 0], [0.9, 2.18, 0], 0.1, 0.12, Y, mul(OAK, 0.85), G(0.6));
  } else {
    member(m, [0.6, 0.07, -1.0], [1.9, 0.07, 0.2], 0.12, 0.12, Y, OAK, G(0.5));
    member(m, [-1.3, 0.06, -0.4], [-0.2, 0.12, -1.9], 0.95, 0.04, Y, SHINGLE, G(0.3));
    bucket(m, [1.0, 0, 0.9], mul(PINE, 0.8));
  }
  return m.geometry();
}

/** A map's well, intact or broken. */
export function buildWell(form: WellForm, ctx: WellBuildContext, broken = false): THREE.BufferGeometry {
  switch (form) {
    case 'zhuravel': return zhuravel(ctx, broken);
    case 'logwell': return logwell(ctx, broken);
    case 'drawwell': return drawwell(ctx, broken);
    case 'pump': return pump(ctx, broken);
    case 'granite': return granite(ctx, broken);
    case 'desert': return desertWell(ctx, broken);
    case 'tubewell': return tubewell(ctx, broken);
    case 'ringwell': return ringwell(ctx, broken);
    case 'trough': return trough(ctx, broken);
    case 'windlass': return windlassWell(ctx, broken);
  }
}

// --------------------------------------------------------------------------------------------------------- monuments

/** A stepped plinth: `steps` squares from `w` narrowing, each `h` high, each its own stone course. */
function plinth(m: Mesh, ctx: WellBuildContext, w: number, steps: number, h: number, inset: number): number {
  let y = -0.15;
  for (let k = 0; k < steps; k++) {
    const s = w - k * inset * 2, hh = h + (k === 0 ? 0.15 : 0);
    block(m, 0, 0, y, y + hh, s, s, [1, 1, 1], MASON, { chamfer: 0.025, shade: damp(ctx) });
    y += hh;
  }
  return y;
}

/** A standing soldier in stone (greatcoat, helmet, rifle at his side, a flag's staff), about `h` tall, from y. */
function soldier(m: Mesh, y: number, h: number, col: Rgb): void {
  const u = h / 7.5;
  // the greatcoat's skirt and boots, the torso, the shoulders and arms, the head and helmet
  for (const s of [-1, 1]) member(m, [s * u * 0.45, y, 0], [s * u * 0.42, y + u * 2.0, 0], u * 0.7, u * 0.8, Z, col, MASON, { chamfer: u * 0.1 });
  member(m, [0, y + u * 1.6, 0], [0, y + u * 3.6, 0], u * 2.1, u * 1.3, X, col, MASON, { chamfer: u * 0.25 });
  member(m, [0, y + u * 3.6, 0], [0, y + u * 5.6, 0], u * 1.9, u * 1.05, X, col, MASON, { chamfer: u * 0.25 });
  member(m, [0, y + u * 5.5, 0], [0, y + u * 5.9, 0], u * 2.3, u * 1.1, X, col, MASON, { chamfer: u * 0.2 });
  for (const s of [-1, 1]) member(m, [s * u * 1.1, y + u * 5.7, 0], [s * u * 1.15, y + u * 3.7, u * 0.15], u * 0.55, u * 0.6, Z, col, MASON, { chamfer: u * 0.1 });
  member(m, [0, y + u * 5.9, 0], [0, y + u * 6.9, 0], u * 0.7, u * 0.8, X, col, MASON, { chamfer: u * 0.2 });
  member(m, [0, y + u * 6.7, 0], [0, y + u * 7.25, 0], u * 1.25, u * 1.3, X, mul(col, 0.95), MASON, { chamfer: u * 0.35 });
  // the rifle grounded at his right side, the hand on its muzzle
  member(m, [u * 1.5, y + u * 0.1, u * 0.3], [u * 1.45, y + u * 4.4, u * 0.3], u * 0.25, u * 0.3, Z, mul(col, 0.92), MASON);
}

function krieger(ctx: WellBuildContext, broken: boolean): THREE.BufferGeometry {
  const m = meshFor(false, ctx), r = stream(0x4e1d + (ctx.seed ?? 0));
  const top = plinth(m, ctx, 2.5, 3, 0.22, 0.22);
  // the pedestal with its base moulding, its cornice; the tablet and the wreath on its front
  const ph = broken ? 0.9 : 1.75, pw = 1.1;
  block(m, 0, 0, top, top + 0.18, pw + 0.16, pw + 0.16, [1, 1, 1], MASON, { chamfer: 0.03 });
  block(m, 0, 0, top + 0.18, top + ph, pw, pw, [1, 1, 1], MASON, { chamfer: 0.02, shade: damp(ctx) });
  const tablet = hexLin(0x2c302e);
  member(m, [pw / 2 + 0.012, top + 0.45, -0.32], [pw / 2 + 0.012, top + 0.45, 0.32], 0.02, 0.55, X, tablet, FLAT);
  for (let k = 0; k < 4; k++) member(m, [pw / 2 + 0.024, top + 0.3 + k * 0.1, -0.25], [pw / 2 + 0.024, top + 0.3 + k * 0.1, 0.25], 0.008, 0.025, X, hexLin(0xb8a678), FLAT);
  if (!broken) {
    block(m, 0, 0, top + ph, top + ph + 0.2, pw + 0.2, pw + 0.2, [1.04, 1.04, 1.04], MASON, { chamfer: 0.04 });
    // the laurel wreath (bronze) on the pedestal's face above the tablet
    for (let k = 0; k < 10; k++) {
      const a0 = k / 10 * Math.PI * 2, a1 = (k + 1) / 10 * Math.PI * 2, cy = top + 1.25;
      member(m, [pw / 2 + 0.04, cy + Math.sin(a0) * 0.18, Math.cos(a0) * 0.18], [pw / 2 + 0.04, cy + Math.sin(a1) * 0.18, Math.cos(a1) * 0.18], 0.05, 0.06, X, BRONZE, FLAT);
    }
    soldier(m, top + ph + 0.2, 1.9, [1, 1, 1]);
  } else {
    // the figure thrown down, broken at the knees
    const start = m.mark;
    soldier(m, 0, 1.9, [1, 1, 1]);
    m.tilt(start, [0, 0, 0], Z, Math.PI / 2 - 0.15);
    m.turn(start, 0, 0, 0.7 + r() * 0.4);
    for (let i = start; i < m.mark; i += 3) { m.p[i] += 1.4; m.p[i + 1] = Math.max(0.03, m.p[i + 1] + 0.12); m.p[i + 2] += 0.6; }
    member(m, [-0.8, 0.12, 1.3], [-0.2, 0.12, 1.6], 0.5, 0.2, Y, [1, 1, 1], MASON, { chamfer: 0.04 });
  }
  return m.geometry();
}

function lorraine(ctx: WellBuildContext, broken: boolean): THREE.BufferGeometry {
  const m = meshFor(false, ctx), r = stream(0x10a2 + (ctx.seed ?? 0));
  const top = plinth(m, ctx, 2.5, 3, 0.24, 0.24);
  block(m, 0, 0, top, top + 0.9, 0.84, 0.84, [1, 1, 1], MASON, { chamfer: 0.03, shade: damp(ctx) });
  member(m, [0.43, top + 0.25, -0.28], [0.43, top + 0.25, 0.28], 0.02, 0.45, X, hexLin(0x2c302e), FLAT);
  const y0 = top + 0.9;
  const start = m.mark;
  // the Lorraine cross: the shaft and its two bars, the upper shorter
  member(m, [0, y0, 0], [0, y0 + 3.1, 0], 0.3, 0.3, Z, [1.02, 1.02, 1.02], MASON, { chamfer: 0.035 });
  member(m, [0, y0 + 2.45, -0.5], [0, y0 + 2.45, 0.5], 0.3, 0.26, Y, [1.02, 1.02, 1.02], MASON, { chamfer: 0.035 });
  member(m, [0, y0 + 1.95, -0.78], [0, y0 + 1.95, 0.78], 0.3, 0.26, Y, [1.02, 1.02, 1.02], MASON, { chamfer: 0.035 });
  if (broken) {
    m.tilt(start, [0, y0, 0], X, Math.PI / 2 - 0.08);
    m.turn(start, 0, 0, r() * Math.PI * 2);
    for (let i = start; i < m.mark; i += 3) m.p[i + 1] = Math.max(0.04, m.p[i + 1] - y0 + 0.16);
  }
  return m.geometry();
}

function stele(ctx: WellBuildContext, broken: boolean): THREE.BufferGeometry {
  const m = meshFor(false, ctx), r = stream(0x57e1 + (ctx.seed ?? 0));
  const top = plinth(m, ctx, 2.4, 2, 0.25, 0.25);
  const h = broken ? 1.1 : 3.4;
  // (a works town of brick raised its memorial in dressed sandstone: on a brick kit the stele is smooth grey-yellow stone
  // over the print's flat texel, not brick courses)
  const brick = ctx.stone?.kind === 'brick', sand = hexLin(0x9c9078);
  block(m, 0, 0, top, top + h, 0.5, 1.1, brick ? sand : [1, 1, 1], brick ? FLAT : MASON, { chamfer: 0.03, shade: brick ? undefined : damp(ctx) });
  const iron = IRON;
  if (!broken) {
    member(m, [0.26, top + 1.2, 0], [0.26, top + 2.4, 0], 0.02, 0.16, X, iron, FLAT);
    member(m, [0.26, top + 1.95, -0.32], [0.26, top + 1.95, 0.32], 0.02, 0.16, X, iron, FLAT);
    block(m, 0, 0, top + h, top + h + 0.22, 0.62, 1.3, brick ? mul(sand, 1.05) : [1.04, 1.04, 1.04], brick ? FLAT : MASON, { chamfer: 0.04 });
    block(m, 0, 0, top + h + 0.22, top + h + 0.42, 0.4, 1.0, brick ? mul(sand, 1.05) : [1.04, 1.04, 1.04], brick ? FLAT : MASON, { chamfer: 0.05 });
    for (let k = 0; k < 10; k++) {
      const a0 = k / 10 * Math.PI * 2, a1 = (k + 1) / 10 * Math.PI * 2, cy = top + 0.75;
      member(m, [0.28, cy + Math.sin(a0) * 0.2, Math.cos(a0) * 0.2], [0.28, cy + Math.sin(a1) * 0.2, Math.cos(a1) * 0.2], 0.05, 0.06, X, BRONZE, FLAT);
    }
  } else {
    const start = m.mark;
    block(m, 0, 0, 0, 2.3, 0.5, 1.1, brick ? sand : [1, 1, 1], brick ? FLAT : MASON, { chamfer: 0.03 });
    m.tilt(start, [0, 0, 0], Z, Math.PI / 2 - 0.1);
    m.turn(start, 0, 0, r() * 2);
    for (let i = start; i < m.mark; i += 3) { m.p[i] += 1.2; m.p[i + 1] = Math.max(0.03, m.p[i + 1] + 0.05); }
  }
  return m.geometry();
}

/** A map's monument, intact or broken. */
export function buildMonument(form: MonumentForm, ctx: WellBuildContext, broken = false): THREE.BufferGeometry {
  switch (form) {
    case 'krieger': return krieger(ctx, broken);
    case 'lorraine': return lorraine(ctx, broken);
    case 'stele': return stele(ctx, broken);
  }
}
void scl;
