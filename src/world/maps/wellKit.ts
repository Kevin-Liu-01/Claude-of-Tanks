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
//   tubewell   the Jamuna chars' iron hand pump on its DPHE cement platform: the kerb round it, the floor falling to
//              the outlet, the drain out to the soak pit's ring (r2, 2026-10-15);
//   ringwell   the delta's and the hills' concrete ring well under a timber A-frame and its pulley, water jars beside it;
//   trough     the Maurienne's fountain trough (bachal): a larch trunk hewn hollow on two stones (its keel, walls and
//              ends round the water, the overflow notch and lip), its spout post and iron pipe (r2, 2026-10-15);
//   windlass   the Louisiana well house: a plank box, a windlass under a small gable roof of shingles.
// Monuments (props.ts placeCentralMonument: Steinburg, Amberford, the foundry town):
//   krieger    the Franconian Kriegerdenkmal: a stepped plinth, a pedestal with its tablet and cornice, a laurel wreath,
//              the soldier standing on it in stone;
//   lorraine   the Lorraine cross (Croix de Lorraine) of the French memorials, on its stepped plinth with its tablet;
//   stele      the Saar works' memorial stele: a tall sandstone stele, its cornice, the iron cross on its face and a wreath.
// (r2, 2026-10-15) every monument on its kerbed gravel bed inside its chain-and-post railing (within its record), its
// plinth in courses of dressed stones, its inscription panels sunk into the die, lichen, moss and mould streaks on the
// stone; broken, it snaps above the base to a ragged stub and what it carried lies in pieces beside it.
//
// Surfaces: a timber well rides the structure wood; a stone one the kit's regionalStone (its print, its tint, its damp
// foot), its iron and timber over the print's flat texel (craftMesh.ts STONE_FLAT_TEXEL); a monument on a map without a
// kit rides the map's stone. Pure geometry: no DOM, no materials, no draws from any stream.
import * as THREE from 'three';
import type { ArchitectureStyle, StoneSurfaceKind } from './regional/types.ts';
import { wallWeather } from './regional/weather.ts';
import {
  Mesh, STONE_FLAT_TEXEL, X, Y, Z, add, hash, hexLin, lin, member, mix, mul, pole, scl, stream, type Rgb, type UvMode, type V3,
} from './craftMesh.ts';

export type WellForm = 'zhuravel' | 'logwell' | 'drawwell' | 'pump' | 'granite' | 'desert' | 'tubewell' | 'ringwell' | 'trough' | 'windlass';
export type MonumentForm = 'krieger' | 'lorraine' | 'stele' | 'saeule';

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
  /** a phone's build (the column's shaft a plain 12-gon, not fluted) */
  mobile?: boolean;
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

/**
 * A well's gable roof seated on its frame (the looks lane, 2026-10-16, the r2 sweep: the windlass and log wells' roofs
 * were two boards standing in the air over the posts, sloped the wrong way): the ridge beam on the two posts' heads, a
 * rafter pair at each post down to a tie through the post, and on the rafters the shingle courses, each lapping the one
 * above it a hand. Gables at x = ±half, the ridge at ridgeY over z = 0, the eaves at z = ±eave at eaveY; the posts at
 * x = ±postX. Returns nothing: its members touch the posts and each other.
 */
function wellRoof(m: Mesh, half: number, postX: number, ridgeY: number, eaveY: number, eave: number, r: () => number): void {
  const rh = 0.08, oak = mul(OAK, 0.84);
  member(m, [-half - 0.06, ridgeY, 0], [half + 0.06, ridgeY, 0], 0.09, 0.11, Y, mul(OAK, 0.78), G(0.7), { chamfer: 0.012 });
  for (const sx of [-1, 1]) {
    const x = sx * postX;
    member(m, [x, eaveY - 0.05, -eave - 0.05], [x, eaveY - 0.05, eave + 0.05], 0.07, 0.09, X, oak, G(0.6), { chamfer: 0.01 });
    for (const sz of [-1, 1]) member(m, [x, ridgeY, 0], [x, eaveY, sz * eave], 0.06, rh, X, oak, G(0.5 + sz * 0.1), { chamfer: 0.01 });
  }
  // the shingle courses from the eave up, each its own board of rived shakes a little lighter or darker, lapping
  for (const sz of [-1, 1]) {
    // u down the slope, nn its outward (upward) normal
    const dy = eaveY - ridgeY, dz = sz * eave, L = Math.hypot(dy, dz), u: V3 = [0, dy / L, dz / L], nn: V3 = [0, Math.abs(dz) / L, -sz * dy / L];
    const K = 4, run = L + 0.12, cw = run / K + 0.07;
    for (let k = 0; k < K; k++) {
      const t = run * (k + 0.5) / K, lift = rh / 2 + 0.013 + (k % 2) * 0.012;
      const c: V3 = [0, ridgeY + u[1] * t + nn[1] * lift, u[2] * t + nn[2] * lift];
      member(m, [-half, c[1], c[2]], [half, c[1], c[2]], cw, 0.024, u, mix(SHINGLE, OAK, 0.1 + r() * 0.25), G(0.3 + k * 0.07), { chamfer: 0.006 });
    }
  }
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
  opts: { chamfer?: number; shade?: (q: V3, n: V3) => Rgb } = {}): void {
  member(m, [x, y0, z], [x, y1, z], sz, sx, Z, col, uv, opts);
}

// ------------------------------------------------------------------------------------------------- the r2 tone
// (the looks lane, 2026-10-15; WORKLIST #11 "Tone: lichen, moss, gilt wear, black mould streaks") a stone's colour at
// each corner: its damp foot, grey-green lichen in blotches where the rain sits (the faces that look up, the lower
// courses), and black mould run down a face from under a projecting course. From the corner's own position: no draw.

const LICHEN: Rgb = [0.8, 0.88, 0.66], MOSS: Rgb = [0.56, 0.7, 0.44], MOULD: Rgb = [0.5, 0.5, 0.52];
/** A corner's own blotch value (0..1), from its position on a 7 cm lattice. */
const blotch = (q: V3, salt: number): number => hash(Math.round(q[0] * 14) * 92821 + Math.round(q[2] * 14), Math.round(q[1] * 14), 0x11c4 + salt);

/**
 * The weathered stone at a corner: `k` its tone, `drip` the underside of the course over it (streaks run down from
 * there over `run` m), `lichen` how much grows (0..1).
 */
function weathered(ctx: WellBuildContext, k = 1, opts: { drip?: number; run?: number; lichen?: number; base?: Rgb } = {}): (q: V3, n: V3) => Rgb {
  const d = ctx.stone?.damp ?? 0.7, growth = opts.lichen ?? 0.7, run = opts.run ?? 0.9;
  return (q, n) => {
    let c: Rgb = mul(opts.base ?? [1, 1, 1], k * wallWeather(q[1], d));
    const up = Math.max(0, n[1]), low = Math.max(0, 1 - q[1] / 1.2);
    const b = blotch(q, 1);
    const lich = growth * (0.35 + 0.65 * Math.max(up, low)) * Math.max(0, (b - 0.45) / 0.55);
    if (lich > 0) c = mulRgb(c, mix([1, 1, 1], b > 0.86 && q[1] < 0.6 ? MOSS : LICHEN, Math.min(0.85, lich * 1.3)));
    if (opts.drip !== undefined && up < 0.5 && q[1] < opts.drip) {
      // the streak lines down a face: the face's horizontal at 12 cm, one in three dark
      const u = Math.abs(n[0]) > 0.5 ? q[2] : q[0], s = hash(Math.round(u * 8), 7, 0x5e1d);
      const fade = Math.max(0, 1 - (opts.drip - q[1]) / run);
      if (s > 0.62) c = mulRgb(c, mix([1, 1, 1], MOULD, fade * (s - 0.62) / 0.38 * 1.4));
    }
    return c;
  };
}
const mulRgb = (a: Rgb, b: Rgb): Rgb => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
/** A monument's dressed stone: the kit's print (MASON, its colour a multiplier), or a smooth stone of its own colour
 *  over the print's flat texel (a brick kit's memorial is raised in dressed sandstone, not brick courses). */
interface Dress { col: Rgb; uv: UvMode }
const PRINT: Dress = { col: [1, 1, 1], uv: MASON };
function dressOf(ctx: WellBuildContext): Dress {
  return ctx.stone?.kind === 'brick' ? { col: hexLin(0x9c9078), uv: FLAT } : PRINT;
}

/**
 * A course of dressed stones round a square (w across, centred), from y0 to y1: four stones, the front and back
 * running the full width, the sides between them, each its own unit with a joint, its ring `ring` m wide (the next
 * course stands on the ring's inside, so no hole shows).
 */
function squareCourse(m: Mesh, ctx: WellBuildContext, w: number, ring: number, y0: number, y1: number, k: number,
  opts: { chamfer?: number; drip?: number; joint?: number; dress?: Dress } = {}): void {
  const h = w / 2, j = opts.joint ?? 0.006, ym = (y0 + y1) / 2, th = y1 - y0, ch = opts.chamfer ?? 0.02, dr = opts.dress ?? PRINT;
  const shade = weathered(ctx, k, { drip: opts.drip, base: dr.col });
  for (const s of [-1, 1]) {
    member(m, [-h, ym, s * (h - ring / 2)], [h, ym, s * (h - ring / 2)], ring - j, th, Z, dr.col, dr.uv, { chamfer: ch, shade });
    member(m, [s * (h - ring / 2), ym, -h + ring + j], [s * (h - ring / 2), ym, h - ring - j], ring - j, th, X, dr.col, dr.uv, { chamfer: ch, shade });
  }
}

/**
 * The monument's bed (the r2 grounding, WORKLIST #11 "kerbed gravel beds" and "chain-and-post railings as collidable
 * modules"): a kerb of dressed stones round a gravel bed `half` m out from the middle, a stone post at each corner of
 * the kerb with its pyramid cap and iron eye, and the iron chain hung between them in links. Inside the monument's own
 * record (inhabitKit monument hw 1.3): the posts and chains are the monument's, a hull meets them as it meets the
 * plinth and they go down with it.
 */
function bed(m: Mesh, ctx: WellBuildContext, half: number, opts: { posts?: boolean; knocked?: number; dress?: Dress } = {}): void {
  const dr = opts.dress ?? PRINT, kw = 0.16, shade = weathered(ctx, 0.98, { lichen: 0.9, base: dr.col });
  // the kerb: two stones a side, a joint between, sunk to -0.25 and a hand over the gravel
  for (const s of [-1, 1]) {
    for (const [a, b] of [[-half, -0.004], [0.004, half]] as const) {
      member(m, [a, -0.06, s * (half - kw / 2)], [b, -0.06, s * (half - kw / 2)], kw, 0.38, Z, dr.col, dr.uv, { chamfer: 0.02, shade });
    }
    for (const [a, b] of [[-half + kw + 0.006, -0.004], [0.004, half - kw - 0.006]] as const) {
      member(m, [s * (half - kw / 2), -0.06, a], [s * (half - kw / 2), -0.06, b], kw, 0.38, X, dr.col, dr.uv, { chamfer: 0.02, shade });
    }
  }
  // the gravel inside the kerb: a pale bed a little under its top, its corners each its own tone
  const gy = 0.05, gi = half - kw, uv = m.surface.flatUv ?? [0.5, 0.5];
  const g = (x: number, z: number): Rgb => m.colour(mul(GRAVEL, 0.9 + blotch([x, gy, z], 3) * 0.2), false);
  const n = 4;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x0 = -gi + 2 * gi * i / n, x1 = -gi + 2 * gi * (i + 1) / n, z0 = -gi + 2 * gi * j / n, z1 = -gi + 2 * gi * (j + 1) / n;
    const a: V3 = [x0, gy, z0], b: V3 = [x1, gy, z0], c: V3 = [x1, gy, z1], d: V3 = [x0, gy, z1];
    m.p.push(...a, ...c, ...b, ...a, ...d, ...c);
    for (let v = 0; v < 6; v++) { m.n.push(0, 1, 0); m.t.push(uv[0], uv[1]); }
    for (const q of [a, c, b, a, d, c]) m.c.push(...g(q[0], q[2]));
  }
  if (opts.posts === false) return;
  // the posts on the kerb's corners, their pyramid caps; the chain between them in links, sagging (`knocked`: that post
  // snapped at its foot and lying out over the kerb, its two chains slack on the ground)
  const pc = half - kw / 2;
  const corners: Array<[number, number]> = [[-pc, -pc], [pc, -pc], [pc, pc], [-pc, pc]];
  const postTop = 0.62, eye = postTop - 0.1, knocked = opts.knocked ?? -1;
  const fallen: V3[] = [];
  corners.forEach(([x, z], k) => {
    const start = m.mark;
    member(m, [x, k === knocked ? 0.13 : -0.25, z], [x, postTop, z], 0.15, 0.15, Z, dr.col, dr.uv, { chamfer: 0.015, shade });
    pyramid(m, [x, postTop, z], 0.085, 0.11, STONE_CAP);
    if (k === knocked) {
      // snapped at the kerb: laid out away from the bed, the stump left in the kerb
      const ox = Math.sign(x) * Math.SQRT1_2, oz = Math.sign(z) * Math.SQRT1_2;
      m.tilt(start, [x, 0.13, z], [oz, 0, -ox], Math.PI / 2 - 0.12);
      for (let i = start; i < m.mark; i += 3) m.p[i + 1] = Math.max(0.03, m.p[i + 1]);
      member(m, [x, -0.25, z], [x, 0.16, z], 0.15, 0.15, Z, dr.col, dr.uv, { chamfer: 0.015, shade });
      fallen[k] = [x + ox * (eye - 0.13), 0.1, z + oz * (eye - 0.13)];
    }
  });
  const chain = (pts: readonly V3[], links: number) => {
    // links along the polyline, each turned a quarter from the last (its flat across, then up)
    const segs: number[] = [];
    let total = 0;
    for (let i = 0; i + 1 < pts.length; i++) { const l = Math.hypot(...sub3(pts[i + 1], pts[i])); segs.push(l); total += l; }
    const at = (d: number): V3 => {
      for (let i = 0; i < segs.length; i++) {
        if (d <= segs[i] || i === segs.length - 1) { const t = Math.min(1, d / segs[i]); return add(pts[i], scl(sub3(pts[i + 1], pts[i]), t)); }
        d -= segs[i];
      }
      return pts[pts.length - 1];
    };
    let prev = pts[0];
    for (let i = 1; i <= links; i++) {
      const p = at(total * i / links);
      member(m, prev, p, i % 2 ? 0.035 : 0.012, i % 2 ? 0.012 : 0.035, Y, IRON, FLAT);
      prev = p;
    }
  };
  for (let k = 0; k < 4; k++) {
    const kb = (k + 1) % 4, [ax, az] = corners[k], [bx, bz] = corners[kb];
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    if (k !== knocked && kb !== knocked) {
      const sag = 0.16, pts: V3[] = [];
      for (let i = 0; i <= 7; i++) {
        const t = i / 7, along = 0.08 + t * (len - 0.16);
        pts.push([ax + ux * along, eye - sag * 4 * t * (1 - t), az + uz * along]);
      }
      chain(pts, 10);
    } else {
      // slack: from the standing post's eye down to the kerb and along it to the fallen post's head
      const [sx, sz, f, dir] = k === knocked ? [bx, bz, fallen[k], -1] : [ax, az, fallen[kb], 1];
      chain([[sx + dir * ux * 0.08, eye, sz + dir * uz * 0.08], [sx + dir * ux * 0.2, 0.15, sz + dir * uz * 0.2], [f[0], 0.15, f[2]]], 10);
    }
  }
}
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/** A four-sided pyramid cap on a post: its foot `half` square at p, `h` high. */
function pyramid(m: Mesh, p: V3, half: number, h: number, col: Rgb): void {
  const apex: V3 = [p[0], p[1] + h, p[2]], uv = m.surface.flatUv ?? [0.5, 0.5];
  const c = (sx: number, sz: number): V3 => [p[0] + sx * half, p[1], p[2] + sz * half];
  const ring = [c(-1, -1), c(1, -1), c(1, 1), c(-1, 1)];
  for (let k = 0; k < 4; k++) {
    const a = ring[k], b = ring[(k + 1) % 4], mid: V3 = [(a[0] + b[0]) / 2 - p[0], h * 0.6, (a[2] + b[2]) / 2 - p[2]];
    const l = Math.hypot(...mid), nn: V3 = [mid[0] / l, mid[1] / l, mid[2] / l];
    const col2 = m.colour(mul(col, 0.92 + 0.1 * Math.max(0, nn[1])), false);
    // counter-clockwise seen from outside
    m.tri(a, apex, b, nn, nn, nn, uv, uv, uv, col2);
  }
}
const GRAVEL: Rgb = hexLin(0xa49c8a), STONE_CAP: Rgb = hexLin(0x9a948a);

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
    // (the r2 sweep: the outer two hung 6 cm clear of the middle one) lashed close against each other, under the arm
    for (let k = 0; k < 3; k++) pole(m, add(shortEnd, [-0.16 + k * 0.16, -0.17 - (k === 1 ? 0 : 0.02), -0.25]), add(shortEnd, [-0.16 + k * 0.16, -0.31 - (k === 1 ? 0 : 0.02), 0.35]), 0.08, 0.08, mix(LOG, LOG_END, 0.3), 0.4, 6);
    // the hanging pole (ochep) from the long tip into the shaft, and the bucket at its foot
    pole(m, longTip, [px, 0.85, 0.15], 0.03, 0.03, mul(PINE, 0.95), 0.7, 5);
    bucket(m, [px, 0.55, 0.15], mul(PINE, 0.8));
  } else {
    // the crib's top course thrown off, the post snapped at 2 m, the sweep slid off its pivot and hanging
    // over the stump, its long arm down to the ground in front, its short arm and the counterweight behind (the r2
    // sweep: everything lay flat, 8 % of the standing height)
    logCrib(m, 1.2, 0, 5, r);
    for (let k = 0; k < 1; k++) {
      const a = r() * Math.PI * 2, d = 1.0 + r() * 0.8, start = m.mark;
      pole(m, [-0.7, 0.09, 0], [0.7, 0.09, 0], 0.09, 0.085, mix(LOG, LOG_END, r() * 0.3), 0.2, 7);
      m.turn(start, 0, 0, a);
      for (let i = start; i < m.mark; i += 3) { m.p[i] += Math.cos(a) * d; m.p[i + 2] += Math.sin(a) * d; }
    }
    waterDisc(m, 0.5, 0.33, 4);
    pole(m, [0, -0.3, -1.9], [0, 2.0, -1.9], 0.15, 0.13, mul(LOG, 0.85), 0.5, 8);
    pole(m, [0.5, 0.05, 1.7], [0.08, 1.93, -1.76], 0.07, 0.06, PINE, 0.2, 6);
    pole(m, [0.08, 1.93, -1.76], [-0.25, 0.1, -3.4], 0.075, 0.085, PINE, 0.3, 6);
    for (let k = 0; k < 3; k++) pole(m, [-0.6 + k * 0.16, 0.08, -3.3], [-0.5 + k * 0.16, 0.08, -3.9], 0.08, 0.08, mix(LOG, LOG_END, 0.3), 0.4, 6);
    // the crib's plank cover thrown off and propped against the stump
    for (let k = 0; k < 4; k++) member(m, [-0.26 + k * 0.17, 0.04, -0.82], [-0.24 + k * 0.17, 1.3, -1.74], 0.16, 0.035, [0, 0.6, 0.8], mul(PINE, 0.9 + r() * 0.15), G(0.2 + k * 0.1));
    pole(m, [-0.5, 0.05, -0.9], [0.9, 0.05, -1.6], 0.03, 0.03, mul(PINE, 0.95), 0.7, 5);
    bucket(m, [1.3, 0.0, 0.6], mul(PINE, 0.8));
  }
  return m.geometry();
}

function logwell(ctx: WellBuildContext, broken: boolean): THREE.BufferGeometry {
  const m = meshFor(true, ctx), r = stream(0x1093 + (ctx.seed ?? 0));
  const top = logCrib(m, 1.3, 0, broken ? 4 : 6, r, { radius: 0.085 });
  waterDisc(m, 0.55, 0.3, 4);
  if (!broken) {
    for (const s of [-1, 1]) member(m, [s * 0.78, top - 0.2, 0], [s * 0.78, top + 1.3, 0], 0.13, 0.13, Z, mul(OAK, 0.9), G(0.2 + s * 0.1), { chamfer: 0.015 });
    // the windlass drum and its crank
    pole(m, [-0.74, top + 0.75, 0], [0.74, top + 0.75, 0], 0.09, 0.09, PINE, 0.4, 8);
    member(m, [0.86, top + 0.75, 0], [0.86, top + 0.45, 0.05], 0.03, 0.04, X, IRON, G(0.9));
    member(m, [0.86, top + 0.45, 0.05], [1.0, top + 0.45, 0.05], 0.03, 0.03, Z, IRON, G(0.9));
    pole(m, [0, top + 0.68, 0], [0, 0.95, 0.05], 0.012, 0.012, ROPE, 0.8, 4);
    bucket(m, [0, 0.62, 0.05], mul(PINE, 0.8));
    // the gable roof of shingles over the drum, seated on its ridge, rafters and ties (wellRoof)
    wellRoof(m, 0.95, 0.78, top + 1.35, top + 0.9, 0.72, r);
  } else {
    // (the r2 sweep: the wreck lay 10 % of the standing height) the crib keeps four courses, one post stands snapped, the
    // other is down with the drum, the roof slid off whole and leans on the crib
    member(m, [-0.78, top - 0.2, 0], [-0.78, top + 0.75, 0], 0.13, 0.13, Z, mul(OAK, 0.9), G(0.2), { chamfer: 0.015 });
    member(m, [0.5, 0.07, -1.0], [1.8, 0.07, 0.2], 0.13, 0.13, Y, mul(OAK, 0.9), G(0.2), { chamfer: 0.015 });
    pole(m, [-0.6, 0.09, 1.4], [0.8, 0.09, 1.9], 0.09, 0.09, PINE, 0.4, 8);
    const s0 = m.mark;
    wellRoof(m, 0.95, 0.78, 0.62, 0.1, 0.72, r);
    m.tilt(s0, [0, 0.1, -0.72], X, -0.42);
    for (let i = s0; i < m.mark; i += 3) { m.p[i + 2] -= 0.62; m.p[i + 1] = Math.max(0.01, m.p[i + 1]); }
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
    member(m, [0.16, py, 0], [0.16, 0.62 + 0.26, 0], 0.012, 0.012, Z, IRON, FLAT);
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
  blockRing(m, ctx, 6, 0.62, 1.0, -0.12, broken ? 0.55 : 0.8, 0.1, r, broken ? { skip: 0.3 } : {});
  if (!broken) blockRing(m, ctx, 6, 0.58, 1.04, 0.8, 0.94, 0.62, r);
  waterDisc(m, 0.62, 0.22, 10);
  if (!broken) {
    for (const s of [-1, 1]) member(m, [s * 0.8, 0.9, 0], [s * 0.8, 2.25, 0], 0.26, 0.24, Z, [1, 1, 1], MASON, { chamfer: 0.03, shade: damp(ctx) });
    member(m, [-1.02, 2.37, 0], [1.02, 2.37, 0], 0.3, 0.24, Y, [1.02, 1.02, 1.02], MASON, { chamfer: 0.03 });
    pole(m, [0, 2.0, -0.04], [0, 2.0, 0.04], 0.13, 0.13, IRON, 0.5, 8);
    member(m, [0, 2.25, 0], [0, 2.0, 0], 0.025, 0.025, Z, IRON, FLAT);
    member(m, [0.13, 2.0, 0], [0.13, 0.62 + 0.26, 0], 0.012, 0.012, Z, IRON, FLAT);
    bucketFlat(m, [0.13, 0.62, 0]);
  } else {
    // (the r2 sweep: the wreck stood under a quarter of the well) one post stands snapped over the ring
    member(m, [-0.8, 0.55, 0], [-0.8, 1.35, 0], 0.26, 0.24, Z, [1, 1, 1], MASON, { chamfer: 0.03, shade: damp(ctx) });
    for (const [a, b] of [[[0.6, 0.13, 1.0], [1.9, 0.13, 1.6]], [[0.4, 0.15, -1.2], [1.9, 0.15, -1.6]]] as Array<[V3, V3]>) {
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
    member(m, [0.2, 1.7, 0], [0.2, 0.52 + 0.26, 0], 0.014, 0.014, X, ROPE, FLAT);
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

/**
 * The Jamuna char's tubewell platform (the looks lane, 2026-10-15; LANES "4 Wells": the delta's pump platform): the
 * DPHE cement platform raised a hand over the ground, its kerb round three sides and the front, open at the outlet;
 * the floor falling to it, dark and green with the wet; the drain run out from the outlet in its own little kerbs to
 * the soak pit's ring; the pump on its pedestal at the back: the barrel and its flange, the head, the spout over the
 * floor, the handle on its two links, a brass lota and a clay kolshi on the floor. Broken: the slab cracked and its half
 * heaved up, the barrel snapped and the head and handle thrown down.
 */
function pumpPlatform(m: Mesh, r: () => number, broken: boolean): void {
  const hw = 0.8, z0 = -0.95, z1 = 0.75, top = 0.06, kerbTop = 0.15, kw = 0.09;
  // the floor's wet: darker and greener toward the outlet (front middle), the kerbs' insides stained
  const wet = (q: V3): Rgb => {
    const d = Math.hypot(q[0] / 0.55, (q[2] - z1) / 0.9), k = Math.max(0, 1 - d);
    return mix(mul(CEMENT, 0.93 + blotch(q, 9) * 0.12), mix(WET_CEMENT, ALGAE, 0.35), Math.min(0.8, k * 0.95 + (q[1] < top + 0.01 ? 0.12 : 0)));
  };
  const slab = (xa: number, xb: number) => member(m, [(xa + xb) / 2, -0.2, (z0 + z1) / 2], [(xa + xb) / 2, top, (z0 + z1) / 2], xb - xa, z1 - z0, X, CEMENT, FLAT,
    { chamfer: 0.025, shade: wet });
  if (!broken) slab(-hw, hw);
  else {
    // cracked across: the left half stays, the right half heaved up on its outer edge
    slab(-hw, -0.03);
    const start = m.mark;
    slab(0.03, hw);
    m.tilt(start, [0.03, top, 0], Z, 0.22);
  }
  // the kerb: back and sides whole, the front either side of the outlet
  const kerb = (a: V3, b: V3) => member(m, a, b, kerbTop - top + 0.02, kw, Y, mul(CEMENT, 0.97), FLAT, { chamfer: 0.02, shade: wet });
  const ky = (top - 0.02 + kerbTop) / 2;
  if (!broken) {
    kerb([-hw, ky, z0 + kw / 2], [hw, ky, z0 + kw / 2]);
    for (const s of [-1, 1]) kerb([s * (hw - kw / 2), ky, z0 + kw], [s * (hw - kw / 2), ky, z1]);
    for (const s of [-1, 1]) kerb([s * 0.1, ky, z1 - kw / 2], [s * (hw - kw), ky, z1 - kw / 2]);
  } else {
    kerb([-hw, ky, z0 + kw / 2], [-0.05, ky, z0 + kw / 2]);
    kerb([-(hw - kw / 2), ky, z0 + kw], [-(hw - kw / 2), ky, z1]);
    kerb([-0.1, ky, z1 - kw / 2], [-(hw - kw), ky, z1 - kw / 2]);
    // the right half's kerb pieces knocked off into the mud
    for (const [a, b] of [[[1.0, 0.05, -0.6], [1.2, 0.05, 0.1]], [[0.35, 0.05, 1.05], [0.85, 0.06, 1.15]]] as Array<[V3, V3]>) member(m, a, b, 0.1, kw, Y, mul(CEMENT, 0.95), FLAT, { chamfer: 0.02 });
  }
  // the drain: its floor out from the outlet, its two kerbs, the wet down its middle; the soak pit's ring and its water
  const dz0 = z1 - 0.02, dz1 = 1.32;
  member(m, [0, -0.06, dz0], [0, -0.06, dz1], 0.1, 0.3, Y, mul(CEMENT, 0.9), FLAT, { chamfer: 0.015, shade: wet });
  for (const s of [-1, 1]) member(m, [s * 0.12, 0.0, dz0], [s * 0.12, 0.0, dz1], 0.07, 0.06, Y, mul(CEMENT, 0.92), FLAT, { chamfer: 0.012, shade: wet });
  member(m, [0, -0.008, dz0], [0, -0.008, dz1 + 0.02], 0.012, 0.16, Y, mix(WATER, ALGAE, 0.4), FLAT);
  const pit: V3 = [0, 0, 1.47];
  for (let k = 0; k < 10; k++) {
    const a0 = (k + 0.04) / 10 * Math.PI * 2, a1 = (k + 0.96) / 10 * Math.PI * 2, am = (a0 + a1) / 2, rm = 0.22;
    member(m, add(pit, [Math.cos(a0) * rm, -0.02, Math.sin(a0) * rm]), add(pit, [Math.cos(a1) * rm, -0.02, Math.sin(a1) * rm]), 0.09, 0.12,
      [Math.cos(am), 0, Math.sin(am)], mul(CEMENT, 0.88 + r() * 0.08), FLAT, { chamfer: 0.012 });
  }
  for (let k = 0; k < 8; k++) {
    const a0 = k / 8 * Math.PI * 2, a1 = (k + 1) / 8 * Math.PI * 2, col = m.colour(mix(WATER, ALGAE, 0.3), false), uv = m.surface.flatUv ?? [0.5, 0.5];
    m.tri(add(pit, [0, 0.0, 0]), add(pit, [Math.cos(a1) * 0.18, 0.0, Math.sin(a1) * 0.18]), add(pit, [Math.cos(a0) * 0.18, 0.0, Math.sin(a0) * 0.18]), Y, Y, Y, uv, uv, uv, col);
  }
  // the pump's pedestal at the back, and the pump
  const pz = -0.5, cast = PUMP_BLUE;
  member(m, [0, top - 0.02, pz], [0, 0.3, pz], 0.34, 0.34, Z, mul(CEMENT, 1.02), FLAT, { chamfer: 0.03 });
  if (!broken) {
    pole(m, [0, 0.3, pz], [0, 0.34, pz], 0.11, 0.11, cast, 0.5, 8);
    pole(m, [0, 0.34, pz], [0, 0.98, pz], 0.065, 0.06, cast, 0.5, 8);
    pole(m, [0, 0.98, pz], [0, 1.02, pz], 0.1, 0.1, cast, 0.5, 8);
    pole(m, [0, 1.02, pz], [0, 1.27, pz], 0.09, 0.088, cast, 0.5, 8);
    pole(m, [0, 1.27, pz], [0, 1.33, pz], 0.1, 0.035, cast, 0.5, 8);
    // the spout out over the floor toward the outlet, its mouth turned down
    member(m, [0, 1.08, pz + 0.07], [0, 1.03, pz + 0.38], 0.055, 0.055, X, cast, FLAT);
    member(m, [0, 1.03, pz + 0.38], [0, 0.97, pz + 0.41], 0.05, 0.05, X, cast, FLAT);
    // the handle's two links up from the head and the handle back over the pedestal, its end turned down
    for (const s of [-1, 1]) member(m, [s * 0.05, 1.3, pz - 0.06], [s * 0.05, 1.42, pz - 0.1], 0.015, 0.03, Z, cast, FLAT);
    let prev: V3 = [0, 1.42, pz - 0.1];
    for (let k = 1; k <= 6; k++) {
      const t = k / 6, p: V3 = [0, 1.42 + Math.sin(t * Math.PI) * 0.1 - t * t * 0.3, pz - 0.1 - t * 0.78];
      member(m, prev, p, 0.035, 0.03, X, cast, FLAT); prev = p;
    }
    member(m, [0, 1.33, pz], [0, 1.43, pz - 0.08], 0.02, 0.02, X, IRON, FLAT);
    // a brass lota under the spout, a clay kolshi on the floor's corner
    pole(m, [0.04, top, 0.0], [0.04, top + 0.12, 0.0], 0.07, 0.095, BRASS, 0.5, 8);
    pole(m, [0.04, top + 0.12, 0.0], [0.04, top + 0.2, 0.0], 0.095, 0.045, BRASS, 0.5, 8);
    pole(m, [0.5, top, 0.45], [0.5, top + 0.2, 0.45], 0.12, 0.17, JAR, 0.5, 9);
    pole(m, [0.5, top + 0.2, 0.45], [0.5, top + 0.36, 0.45], 0.17, 0.07, JAR, 0.5, 9);
    pole(m, [0.5, top + 0.36, 0.45], [0.5, top + 0.41, 0.45], 0.07, 0.08, JAR, 0.5, 9);
  } else {
    pole(m, [0, 0.3, pz], [0, 0.55, pz], 0.065, 0.062, cast, 0.5, 8);
    // the head and its handle thrown down across the floor, the barrel's top length beside it
    const start = m.mark;
    pole(m, [0, 0, 0], [0, 0.3, 0], 0.09, 0.088, cast, 0.5, 8);
    member(m, [0, 0.1, 0.07], [0, 0.05, 0.38], 0.055, 0.055, X, cast, FLAT);
    member(m, [0, 0.32, -0.1], [0, 0.2, -0.85], 0.035, 0.03, X, cast, FLAT);
    m.tilt(start, [0, 0, 0], X, Math.PI / 2 - 0.1);
    m.turn(start, 0, 0, 0.9);
    for (let i = start; i < m.mark; i += 3) { m.p[i] += -0.45; m.p[i + 1] = Math.max(top + 0.02, m.p[i + 1] + 0.12); m.p[i + 2] += 0.15; }
    pole(m, [0.25, 0.09, -1.15], [1.05, 0.08, -0.7], 0.065, 0.06, cast, 0.5, 8);
    pole(m, [-0.55, top, 0.3], [-0.55, top + 0.16, 0.3], 0.07, 0.095, BRASS, 0.5, 8);
  }
}
const WET_CEMENT: Rgb = hexLin(0x5e5c56), ALGAE: Rgb = hexLin(0x3f5232), BRASS: Rgb = hexLin(0xa88a4a);

function tubewell(ctx: WellBuildContext, broken: boolean): THREE.BufferGeometry {
  const m = meshFor(false, ctx), r = stream(0x70be + (ctx.seed ?? 0));
  pumpPlatform(m, r, broken);
  if (broken) dropFlat(m, 0);
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
    member(m, [0, 2.05, 0], [0, 0.52 + 0.26, 0.05], 0.014, 0.014, Z, ROPE, FLAT);
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

/**
 * The bachal's trough hewn out of one larch trunk (the looks lane, 2026-10-15; WORKLIST #11 "wells' troughs hollowed
 * with overflow lips"): its keel rounded under, two walls and two ends standing round the hollow (their insides dark and
 * green with the wet), the water a hand under the rim, the overflow notch cut in the far end's rim with its lip board
 * and the water sheeting down from it onto a wet stone, the trough on two stones. `x0..x1` along x, its rim at `rim`.
 */
function hewnTrough(m: Mesh, x0: number, x1: number, rim: number, r: () => number, opts: { notch?: boolean; water?: boolean } = {}): void {
  const W = 0.62, wall = 0.085, keelY = rim - 0.43, floor = keelY + 0.12, mid = (x0 + x1) / 2;
  const wet = (q: V3, n: V3): Rgb => {
    // the hollow's faces (they look in, or up from the floor): dark and green with the wet; the outside larch, mossy at
    // its foot
    const inward = (Math.abs(q[2]) < W / 2 - wall + 0.01 && (n[1] > 0.5 || Math.abs(n[2]) > 0.5)) || (Math.abs(n[0]) > 0.5 && Math.sign(n[0]) !== Math.sign(q[0] - mid) && q[1] > floor - 0.01);
    if (inward && q[1] < rim - 0.01) return mix(mul(LARCH, 0.5), mul(MOSS_WOOD, 0.55), 0.5);
    const foot = Math.max(0, 1 - (q[1] - keelY) / 0.25);
    return mix(mul(LARCH, 0.95 + blotch(q, 5) * 0.12), MOSS_WOOD, foot * 0.45);
  };
  // the keel: the trunk's underside, rounded (its arrises cut back)
  member(m, [x0, keelY + 0.08, 0], [x1, keelY + 0.08, 0], W - 0.1, 0.16, Z, LARCH, G(0.2 + r() * 0.05), { chamfer: 0.06, shade: wet });
  // the walls: the trunk's sides left standing, their tops rounded by the axe
  for (const s of [-1, 1]) {
    member(m, [x0, (floor - 0.02 + rim) / 2, s * (W / 2 - wall / 2)], [x1, (floor - 0.02 + rim) / 2, s * (W / 2 - wall / 2)], wall, rim - floor + 0.02, Z,
      LARCH, G(0.3 + s * 0.05), { chamfer: 0.03, shade: wet });
  }
  // the ends; the far end's rim notched for the overflow (two cheeks and a sill under the notch)
  const endW = W - 2 * wall - 0.004, et = 0.11;
  member(m, [x0 + et / 2, floor - 0.02, 0], [x0 + et / 2, rim, 0], et, endW, X, LARCH, G(0.5), { chamfer: 0.015, shade: wet });
  const xe = x1 - et / 2;
  if (opts.notch !== false) {
    const nw = 0.13, sill = rim - 0.07;
    member(m, [xe, floor - 0.02, 0], [xe, sill, 0], et, endW, X, LARCH, G(0.55), { chamfer: 0.012, shade: wet });
    for (const s of [-1, 1]) {
      const zc = s * (nw / 2 + (endW / 2 - nw / 2) / 2);
      member(m, [xe, sill, zc], [xe, rim, zc], et, endW / 2 - nw / 2, X, LARCH, G(0.6), { chamfer: 0.012, shade: wet });
    }
    // the lip: a split board pegged under the notch, running out over the end
    member(m, [x1 - 0.04, sill - 0.012, 0], [x1 + 0.2, sill - 0.04, 0], nw + 0.05, 0.022, Z, mul(LARCH, 0.85), G(0.7));
    if (opts.water !== false) {
      // the overflow sheeting off the lip down to the wet stone under it
      const fall: V3[] = [[x1 + 0.2, sill - 0.035, 0], [x1 + 0.27, sill - 0.2, 0], [x1 + 0.31, keelY - 0.05, 0], [x1 + 0.33, 0.02, 0]];
      for (let i = 0; i + 1 < fall.length; i++) member(m, fall[i], fall[i + 1], 0.09 - i * 0.012, 0.012, Z, JET, G(0.95));
      member(m, [x1 + 0.12, -0.08, 0], [x1 + 0.5, -0.08, 0], 0.42, 0.16, Z, mul(WET_STONE, 0.9), G(0.4), { chamfer: 0.04 });
    }
  } else member(m, [xe, floor - 0.02, 0], [xe, rim, 0], et, endW, X, LARCH, G(0.55), { chamfer: 0.015, shade: wet });
  if (opts.water !== false) {
    // the water a hand under the rim, and the rings where the jet lands
    member(m, [x0 + et, rim - 0.065, 0], [x1 - et, rim - 0.065, 0], 0.01, W - 2 * wall - 0.01, Y, mul(WATER, 1.6), G(0.5));
  }
}
const MOSS_WOOD: Rgb = hexLin(0x4d5a3a), WET_STONE: Rgb = hexLin(0x5c5a55), DRY_STONE: Rgb = hexLin(0x8a857c), JET: Rgb = hexLin(0xc8d4dc);

function trough(ctx: WellBuildContext, broken: boolean): THREE.BufferGeometry {
  const m = meshFor(true, ctx), r = stream(0x7a06 + (ctx.seed ?? 0));
  // the hewn larch trough on two stones, its water, the spout post with its iron pipe
  const L = 1.9;
  if (!broken) {
    // the two bearers: rough stones bedded in the ground, the trough's keel on them
    for (const s of [-1, 1]) member(m, [s * 0.6, -0.14, 0], [s * 0.6, 0.27, 0], 0.5, 0.42, Z, mul(DRY_STONE, 0.92 + r() * 0.12), G(0.6), { chamfer: 0.05 });
    hewnTrough(m, -L / 2, L / 2, 0.71, r);
    // the spout post (its foot in the ground, a stone at its foot), its cap; the iron pipe through it and the jet
    const px = -L / 2 - 0.25;
    member(m, [px, -0.2, 0], [px, 1.55, 0], 0.22, 0.2, Z, mul(LARCH, 0.9), G(0.7), { chamfer: 0.03 });
    member(m, [px, 1.55, 0], [px, 1.68, 0], 0.3, 0.28, Z, mul(LARCH, 0.75), G(0.8), { chamfer: 0.04 });
    member(m, [px, -0.12, 0], [px, 0.06, 0], 0.36, 0.34, Z, mul(DRY_STONE, 0.95), G(0.35), { chamfer: 0.05 });
    pole(m, [px + 0.1, 1.2, 0], [-L / 2 + 0.3, 1.16, 0], 0.025, 0.025, IRON, 0.9, 6);
    pole(m, [-L / 2 + 0.3, 1.16, 0], [-L / 2 + 0.42, 0.66, 0], 0.018, 0.012, JET, 0.95, 5);
    for (let i = 0; i < 6; i++) {
      const a0 = i / 6 * Math.PI * 2, a1 = (i + 1) / 6 * Math.PI * 2, c: V3 = [-L / 2 + 0.42, 0.652, 0];
      member(m, add(c, [Math.cos(a0) * 0.1, 0, Math.sin(a0) * 0.1]), add(c, [Math.cos(a1) * 0.1, 0, Math.sin(a1) * 0.1]), 0.006, 0.025, Y, JET, G(0.9));
    }
  } else {
    // the trough split along its length: one half thrown on its side off the stones, the other end rolled off; the post
    // snapped at its foot, its head and the pipe in the grass; the stones bared
    for (const s of [-1, 1]) member(m, [s * 0.6, -0.14, 0], [s * 0.6, 0.27, 0], 0.5, 0.42, Z, mul(DRY_STONE, 0.92 + r() * 0.12), G(0.6), { chamfer: 0.05 });
    let start = m.mark;
    hewnTrough(m, -L / 2, 0.15, 0.71, r, { notch: false, water: false });
    m.tilt(start, [0, 0.27, 0.31], X, 1.1);
    for (let i = start; i < m.mark; i += 3) { m.p[i + 1] = Math.max(0.02, m.p[i + 1] - 0.12); m.p[i + 2] += 0.35; }
    start = m.mark;
    hewnTrough(m, 0.25, L / 2, 0.71, r, { water: false });
    m.tilt(start, [0.6, 0.27, -0.31], X, -1.4);
    m.turn(start, 0.6, 0, 0.5);
    for (let i = start; i < m.mark; i += 3) { m.p[i] += 0.3; m.p[i + 1] = Math.max(0.02, m.p[i + 1] - 0.2); m.p[i + 2] -= 0.45; }
    member(m, [-L / 2 - 0.25, -0.2, 0], [-L / 2 - 0.25, 0.4, 0], 0.22, 0.2, Z, mul(LARCH, 0.9), G(0.7));
    member(m, [-L / 2 + 0.1, 0.1, 0.4], [-L / 2 + 0.9, 0.12, 1.4], 0.22, 0.2, Y, mul(LARCH, 0.9), G(0.7));
    pole(m, [-0.4, 0.04, -0.8], [0.05, 0.03, -1.05], 0.025, 0.025, IRON, 0.9, 6);
  }
  return m.geometry();
}

function windlassWell(ctx: WellBuildContext, broken: boolean): THREE.BufferGeometry {
  // (the looks lane, 2026-10-16, the r2 sweep: a box of plain planks, the roof's boards in the air, a flat wreck) the
  // longleaf farm's well: the curb a box of chamfered pine boards nailed to four corner posts, a coping frame on it, the
  // dark shaft mouth inside; two oak posts at its sides carry the windlass drum and its iron crank, the rope down to the
  // bucket, and over them the shingled gable on its ridge, rafters and ties. Broken: the curb's upper boards off, one
  // post snapped, the other down with the drum, the roof slid off whole and leaning on the curb.
  const m = meshFor(true, ctx), r = stream(0xa1e5 + (ctx.seed ?? 0));
  const w = 1.25, hw = w / 2, courses = broken ? 2 : 4, plank = (k: number) => mix(PINE, OAK, r() * 0.4 + k * 0.03);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    member(m, [sx * (hw - 0.04), 0, sz * (hw - 0.04)], [sx * (hw - 0.04), broken && sx * sz > 0 ? 0.52 : 0.9, sz * (hw - 0.04)], 0.08, 0.08, X, mul(PINE, 0.86), G(0.2), { chamfer: 0.012 });
  }
  for (let k = 0; k < courses + (broken ? 1 : 0); k++) {
    const y = 0.1 + k * 0.2;
    for (const s2 of [-1, 1]) {
      if (broken && k === courses && s2 > 0) continue;
      member(m, [-hw, y, s2 * (hw + 0.015)], [hw, y, s2 * (hw + 0.015)], 0.03, 0.19, Z, plank(k), G(0.1 + k * 0.05), { chamfer: 0.008 });
      if (!(broken && k === courses)) member(m, [s2 * (hw + 0.015), y, -hw], [s2 * (hw + 0.015), y, hw], 0.03, 0.19, X, plank(k), G(0.3 + k * 0.05), { chamfer: 0.008 });
    }
  }
  // the shaft's mouth: dark water down the shaft, the boards' inside faces round it
  const mouth = hexLin(0x182024), my = 0.016;
  m.tri([-hw, my, -hw], [hw, my, hw], [hw, my, -hw], Y, Y, Y, [0.5, 0.5], [0.5, 0.5], [0.5, 0.5], mouth);
  m.tri([-hw, my, -hw], [-hw, my, hw], [hw, my, hw], Y, Y, Y, [0.5, 0.5], [0.5, 0.5], [0.5, 0.5], mouth);
  if (!broken) {
    // the coping: four boards laid flat round the top, mitred over the corner posts
    const cy = 0.1 + 3 * 0.2 + 0.095 + 0.02;
    for (const s2 of [-1, 1]) {
      member(m, [-hw - 0.07, cy, s2 * hw], [hw + 0.07, cy, s2 * hw], 0.16, 0.04, Y, mul(OAK, 0.9), G(0.4), { chamfer: 0.01 });
      member(m, [s2 * hw, cy, -hw + 0.08], [s2 * hw, cy, hw - 0.08], 0.16, 0.04, Y, mul(OAK, 0.9), G(0.45), { chamfer: 0.01 });
    }
    // the posts at the curb's sides (bolted to it), the windlass drum through them, its crank
    const px = hw + 0.1, ridgeY = 2.6;
    for (const s2 of [-1, 1]) member(m, [s2 * px, -0.2, 0], [s2 * px, ridgeY - 0.05, 0], 0.12, 0.12, Z, OAK, G(0.5), { chamfer: 0.015 });
    pole(m, [-px - 0.03, 1.35, 0], [px + 0.03, 1.35, 0], 0.08, 0.08, PINE, 0.4, 8);
    member(m, [px + 0.1, 1.35, 0], [px + 0.1, 1.07, 0.06], 0.03, 0.04, X, IRON, G(0.9), { chamfer: 0.006 });
    member(m, [px + 0.02, 1.35, 0], [px + 0.12, 1.35, 0], 0.035, 0.035, Z, IRON, G(0.9));
    member(m, [px + 0.1, 1.07, 0.06], [px + 0.24, 1.07, 0.06], 0.03, 0.03, Z, IRON, G(0.9), { chamfer: 0.006 });
    pole(m, [0, 1.28, 0.04], [0, 0.95, 0.04], 0.012, 0.012, ROPE, 0.8, 4);
    bucket(m, [0, 0.62, 0.04], mul(PINE, 0.8));
    wellRoof(m, 0.95, px, ridgeY, 2.08, 0.78, r);
  } else {
    // one post snapped standing, the other down across the ground with the drum
    member(m, [-hw - 0.1, -0.2, 0], [-hw - 0.1, 1.3, 0], 0.12, 0.12, Z, OAK, G(0.5), { chamfer: 0.015 });
    member(m, [hw + 0.1, 0.07, 0.2], [hw + 1.6, 0.07, 1.0], 0.12, 0.12, Y, OAK, G(0.5), { chamfer: 0.015 });
    pole(m, [0.4, 0.09, 1.0], [1.5, 0.09, 1.5], 0.08, 0.08, PINE, 0.4, 8);
    for (const [a, b] of [[[-1.4, 0.03, -0.9], [-0.4, 0.03, -1.5]], [[0.9, 0.03, -0.9], [1.9, 0.04, -0.6]]] as Array<[V3, V3]>) {
      member(m, a, b, 0.19, 0.03, Y, plank(1), G(0.2), { chamfer: 0.008 });
    }
    bucket(m, [1.0, 0, -1.3], mul(PINE, 0.8));
    // the roof slid off whole: its back eave on the ground behind the curb, its ridge over the curb's rim
    const s0 = m.mark;
    wellRoof(m, 0.95, hw + 0.1, 0.62, 0.1, 0.78, r);
    m.tilt(s0, [0, 0.1, -0.78], X, -0.42);
    for (let i = s0; i < m.mark; i += 3) { m.p[i + 2] -= 0.55; m.p[i + 1] = Math.max(0.01, m.p[i + 1]); }
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
// (the looks lane, 2026-10-15; WORKLIST #11, the r2 standard: "plinths and steps, moulded bases and cornices,
// inscription panels recessed ... chain-and-post railings ... kerbed gravel beds ... lichen, moss, gilt wear, black mould
// streaks"; Destroyed: "small monuments snap above the plinth with a ragged stub") each monument on its bed — the kerb
// round its gravel, the stone posts and their chains — a stepped plinth in courses of dressed stones, a moulded base, the
// die with its panels sunk into its faces (the tablet set back in its frame, its lettering gilt and worn), a moulded
// cornice, and what it carries. Broken, it snaps above its base: the die's stones broken off to a ragged top, the cornice
// and what it carried thrown down in pieces, a post and its chains knocked flat.

/** The bed's kerb, outside half (inside the record's hw 1.3 and the receipt's 1.8 m reach at its corners). */
const BED = 1.24;
const TABLET: Rgb = hexLin(0xc9c4b4), GILT: Rgb = hexLin(0xb8953e), GILT_WORN: Rgb = hexLin(0x6e6448);

/** The stepped plinth: `widths` its courses' sides from the bottom (the first sunk 0.15), each `rise` high; `onTop`
 *  the side of what stands on the last. Returns its top. */
function steppedPlinth(m: Mesh, ctx: WellBuildContext, widths: readonly number[], rise: number, onTop: number, dress: Dress = PRINT): number {
  let y = -0.15;
  widths.forEach((w, k) => {
    const h = rise + (k === 0 ? 0.15 : 0), next = widths[k + 1] ?? onTop;
    squareCourse(m, ctx, w, Math.min(w / 2, (w - next) / 2 + 0.14), y, y + h, 1.0 - k * 0.015, { dress });
    y += h;
  });
  return y;
}

/** A moulded band round a w × d block from y0 to y1 (one stone, its arrises cut back): a base's torus, a cornice's
 *  corona. */
function band(m: Mesh, ctx: WellBuildContext, wx: number, wz: number, y0: number, y1: number, k: number, chamfer: number, col: Rgb = [1, 1, 1], uv: UvMode = MASON): void {
  block(m, 0, 0, y0, y1, wx, wz, col, uv, { chamfer, shade: weathered(ctx, k, { lichen: uv === MASON ? 0.8 : 0.45, base: col }) });
}

interface SunkPanel { u0: number; u1: number; y0: number; y1: number }
type Side = 'px' | 'nx' | 'pz' | 'nz';

/**
 * A die w (x) × d (z) from y0 to y1 with a panel sunk `depth` into each face `panels` names: the core block set back on
 * every face, and each face's outer layer either whole or a frame — its two stiles, its rails under and over the panel
 * — round the sunk field. The x faces run the full depth; the z faces between them, so no two faces share a corner
 * plane. `drip`: the cornice's underside over it (the mould streaks).
 */
function sunkDie(m: Mesh, ctx: WellBuildContext, wx: number, wz: number, y0: number, y1: number, panels: Partial<Record<Side, SunkPanel>>, depth: number,
  col: Rgb = [1, 1, 1], uv: UvMode = MASON, drip = y1): void {
  const shade = weathered(ctx, 1, { drip, run: 1.1, lichen: uv === MASON ? 0.55 : 0.35, base: col });
  const opts = { chamfer: 0, shade };
  block(m, 0, 0, y0, y1, wx - 2 * depth, wz - 2 * depth, col, uv, opts);
  for (const side of ['px', 'nx', 'pz', 'nz'] as const) {
    const onX = side[1] === 'x', s = side[0] === 'p' ? 1 : -1;
    const across = onX ? wz : wx - 2 * depth, off = s * ((onX ? wx : wz) / 2 - depth / 2);
    // a piece of the outer layer between u0 and u1 along the face, y0 to y1
    const piece = (u0: number, u1: number, ya: number, yb: number) => {
      if (u1 - u0 < 0.005 || yb - ya < 0.005) return;
      const um = (u0 + u1) / 2;
      if (onX) block(m, off, um, ya, yb, depth, u1 - u0, col, uv, opts);
      else block(m, um, off, ya, yb, u1 - u0, depth, col, uv, opts);
    };
    const p = panels[side];
    if (!p) { piece(-across / 2, across / 2, y0, y1); continue; }
    piece(-across / 2, p.u0, y0, y1);
    piece(p.u1, across / 2, y0, y1);
    piece(p.u0, p.u1, y0, p.y0);
    piece(p.u0, p.u1, p.y1, y1);
  }
}

/**
 * A tablet set into a sunk panel and its lettering: the polished slab a little proud of the panel's floor (still
 * behind the frame's face), its lines of gilt words, each its own length and some worn to the stone. `side` the face,
 * `face` its distance out from the middle (the frame's face), `depth` the panel's.
 */
function tablet(m: Mesh, side: Side, face: number, depth: number, p: SunkPanel, rows: number, r: () => number, opts: { slab?: boolean; below?: number } = {}): void {
  const onX = side[1] === 'x', s = side[0] === 'p' ? 1 : -1;
  const out: V3 = onX ? [s, 0, 0] : [0, 0, s];
  // u along the face as seen from outside (left to right)
  const U: V3 = onX ? [0, 0, -s] : [s, 0, 0];
  const at = (u: number, y: number, o: number): V3 => add(scl(out, o), add(scl(U, u), [0, y, 0]));
  const floor = face - depth, inset = 0.035;
  const um = (p.u0 + p.u1) / 2, uw = (p.u1 - p.u0) / 2;
  const flatUv = (): [number, number] => [m.surface.flatUv?.[0] ?? 0.5, m.surface.flatUv?.[1] ?? 0.5];
  if (opts.slab !== false) {
    const o = floor + 0.014;
    m.quad(at(um - uw + inset, p.y0 + inset, o), at(um + uw - inset, p.y0 + inset, o), at(um + uw - inset, p.y1 - inset, o), at(um - uw + inset, p.y1 - inset, o),
      out, flatUv, () => TABLET, false);
  }
  // the lines: words of gilt strokes, a cap height of 4 cm, the first line the largest
  const o = floor + (opts.slab !== false ? 0.017 : 0.003), lw = 2 * uw - 0.16;
  for (let row = 0; row < rows; row++) {
    const cap = row === 0 ? 0.055 : 0.036, y = p.y1 - 0.1 - row * ((p.y1 - p.y0 - 0.18) / Math.max(1, rows));
    if (opts.below !== undefined && y + cap > opts.below) continue;
    const words = row === 0 ? 2 : 3 + Math.floor(r() * 3);
    const widths = Array.from({ length: words }, () => 0.06 + r() * 0.12), gap = 0.05;
    const total = Math.min(lw, widths.reduce((a, b) => a + b, 0) + gap * (words - 1));
    let u = um - total / 2;
    for (const w0 of widths) {
      const w = Math.min(w0, um + total / 2 - u);
      if (w < 0.02) break;
      const worn = r() < 0.25, col = worn ? GILT_WORN : GILT;
      m.quad(at(u, y, o), at(u + w, y, o), at(u + w, y + cap, o), at(u, y + cap, o), out, flatUv, () => col, false);
      u += w + gap;
    }
  }
}

/** A laurel wreath in bronze hung on a face at (u, y): its ring of leaves and the ribbon's two tails. */
function wreath(m: Mesh, side: Side, face: number, u: number, y: number, rad: number): void {
  const onX = side[1] === 'x', s = side[0] === 'p' ? 1 : -1;
  const out: V3 = onX ? [s, 0, 0] : [0, 0, s], U: V3 = onX ? [0, 0, -s] : [s, 0, 0];
  const at = (du: number, dy: number, o: number): V3 => add(scl(out, face + o), add(scl(U, u + du), [0, y + dy, 0]));
  for (let k = 0; k < 12; k++) {
    if (k === 9) continue; // the ribbon's knot at the foot
    const a0 = (k - 3) / 12 * Math.PI * 2, a1 = (k - 2) / 12 * Math.PI * 2;
    member(m, at(Math.cos(a0) * rad, Math.sin(a0) * rad, 0.03), at(Math.cos(a1) * rad, Math.sin(a1) * rad, 0.03), 0.06, 0.045, out, BRONZE, FLAT);
  }
  for (const t of [-1, 1]) member(m, at(0, -rad, 0.03), at(t * 0.07, -rad - 0.2, 0.02), 0.035, 0.012, out, mul(BRONZE, 0.9), FLAT);
}

/** Every vertex written since `start` above the ragged break `cut(x, z)` brought down to it (a stub's snapped top). */
function snap(m: Mesh, start: number, cut: (x: number, z: number) => number): void {
  for (let i = start; i < m.mark; i += 3) {
    const c = cut(m.p[i], m.p[i + 2]);
    if (m.p[i + 1] > c) m.p[i + 1] = c;
  }
  dropFlat(m, start);
}
/** The triangles written since `start` that a snap or a clamp left without area dropped (a stone wholly over the break). */
function dropFlat(m: Mesh, start: number): void {
  let w = start;
  for (let i = start; i + 8 < m.p.length; i += 9) {
    const ax = m.p[i + 3] - m.p[i], ay = m.p[i + 4] - m.p[i + 1], az = m.p[i + 5] - m.p[i + 2];
    const bx = m.p[i + 6] - m.p[i], by = m.p[i + 7] - m.p[i + 1], bz = m.p[i + 8] - m.p[i + 2];
    const area = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2;
    if (area < 1e-7) continue;
    const v0 = i / 3, w0 = w / 3;
    for (let k = 0; k < 9; k++) { m.p[w + k] = m.p[i + k]; m.n[w + k] = m.n[i + k]; m.c[w + k] = m.c[i + k]; }
    for (let k = 0; k < 6; k++) m.t[w0 * 2 + k] = m.t[v0 * 2 + k];
    w += 9;
  }
  m.p.length = w; m.n.length = w; m.c.length = w; m.t.length = w / 3 * 2;
}
/** A ragged break about `y`: saw-toothed across the die, each corner its own height. */
const ragged = (y: number, salt: number) => (x: number, z: number): number =>
  y + 0.14 * Math.sin(7.3 * x + salt) + 0.11 * Math.cos(8.9 * z + salt * 1.7) + 0.08 * (hash(Math.round(x * 20), Math.round(z * 20), salt) - 0.5);

/** Pieces thrown down: what was written since `start` laid over about the axis through its foot, turned and carried
 *  `d` m out at `bearing`, kept over the ground. */
function throwDown(m: Mesh, start: number, foot: V3, axis: V3, angle: number, bearing: number, d: number, lift = 0.03): void {
  m.tilt(start, foot, axis, angle);
  m.turn(start, foot[0], foot[2], bearing);
  let low = Infinity;
  for (let i = start; i < m.mark; i += 3) low = Math.min(low, m.p[i + 1]);
  for (let i = start; i < m.mark; i += 3) { m.p[i] += Math.cos(bearing) * d; m.p[i + 1] += lift - low; m.p[i + 2] += Math.sin(bearing) * d; }
}

/** A standing soldier in stone (greatcoat, helmet, rifle at his side), about `h` tall, from y. */
function soldier(m: Mesh, ctx: WellBuildContext, y: number, h: number, col: Rgb): void {
  const u = h / 7.5, shade = weathered(ctx, col[0], { lichen: 0.6 });
  const o = (chamfer: number) => ({ chamfer, shade });
  // the boots and the greatcoat's skirt flaring over them, the torso, the shoulders and arms, the head and the helmet
  for (const s of [-1, 1]) member(m, [s * u * 0.42, y, 0], [s * u * 0.4, y + u * 1.0, 0], u * 0.6, u * 0.85, Z, col, MASON, o(u * 0.1));
  member(m, [0, y + u * 0.9, 0], [0, y + u * 2.4, 0], u * 2.5, u * 1.5, X, col, MASON, o(u * 0.35));
  member(m, [0, y + u * 2.3, 0], [0, y + u * 3.7, 0], u * 2.15, u * 1.3, X, col, MASON, o(u * 0.28));
  member(m, [0, y + u * 3.6, 0], [0, y + u * 5.6, 0], u * 1.9, u * 1.05, X, col, MASON, o(u * 0.25));
  member(m, [0, y + u * 5.5, 0], [0, y + u * 5.9, 0], u * 2.3, u * 1.1, X, col, MASON, o(u * 0.2));
  for (const s of [-1, 1]) member(m, [s * u * 1.1, y + u * 5.7, 0], [s * u * 1.15, y + u * 3.7, u * 0.15], u * 0.55, u * 0.6, Z, col, MASON, o(u * 0.1));
  member(m, [0, y + u * 5.9, 0], [0, y + u * 6.9, 0], u * 0.7, u * 0.8, X, col, MASON, o(u * 0.2));
  // the Stahlhelm: its bowl and the flared brim over the neck
  member(m, [0, y + u * 6.6, 0], [0, y + u * 6.82, 0], u * 1.5, u * 1.55, X, mul(col, 0.95), MASON, o(u * 0.3));
  member(m, [0, y + u * 6.8, 0], [0, y + u * 7.3, 0], u * 1.2, u * 1.3, X, mul(col, 0.95), MASON, o(u * 0.35));
  // the rifle grounded at his right side, the hand on its muzzle
  member(m, [u * 1.5, y + u * 0.1, u * 0.3], [u * 1.45, y + u * 4.4, u * 0.3], u * 0.25, u * 0.3, Z, mul(col, 0.92), MASON, o(0));
}

function krieger(ctx: WellBuildContext, broken: boolean): THREE.BufferGeometry {
  const m = meshFor(false, ctx), r = stream(0x4e1d + (ctx.seed ?? 0));
  bed(m, ctx, BED, { knocked: broken ? 2 : -1 });
  const pw = 0.86, top = steppedPlinth(m, ctx, [1.72, 1.44, 1.18], 0.2, pw + 0.2);
  // the base: its plinth course and the torus over it
  band(m, ctx, pw + 0.2, pw + 0.2, top, top + 0.14, 1.0, 0.03);
  band(m, ctx, pw + 0.12, pw + 0.12, top + 0.14, top + 0.21, 1.02, 0.03);
  // the die: the tablet's panel sunk in its front, the names' panels in its sides, the back whole
  const y0 = top + 0.21, y1 = y0 + 1.39, depth = 0.045;
  const front: SunkPanel = { u0: -0.27, u1: 0.27, y0: y0 + 0.2, y1: y0 + 1.02 };
  const sides: SunkPanel = { u0: -0.25, u1: 0.25, y0: y0 + 0.2, y1: y0 + 1.12 };
  const start = m.mark;
  sunkDie(m, ctx, pw, pw, y0, y1, { px: front, pz: sides, nz: sides }, depth, [1, 1, 1], MASON, y1 + 0.02);
  const cut = ragged(y0 + 0.5, 3.1);
  const below = broken ? cut(0, 0) - 0.12 : undefined;
  tablet(m, 'px', pw / 2, depth, front, 6, r, { below });
  for (const side of ['pz', 'nz'] as const) tablet(m, side, pw / 2, depth, sides, 8, r, { slab: false, below });
  if (broken) snap(m, start, cut);
  if (!broken) {
    wreath(m, 'px', pw / 2, 0, y1 - 0.2, 0.13);
    // the cornice: its fillet, the corona's drip and the cap; the figure's own plinth
    band(m, ctx, pw + 0.04, pw + 0.04, y1, y1 + 0.06, 1.03, 0.012);
    band(m, ctx, pw + 0.2, pw + 0.2, y1 + 0.06, y1 + 0.18, 1.05, 0.035);
    band(m, ctx, pw + 0.08, pw + 0.08, y1 + 0.18, y1 + 0.25, 1.04, 0.025);
    band(m, ctx, 0.7, 0.62, y1 + 0.25, y1 + 0.35, 1.02, 0.03);
    soldier(m, ctx, y1 + 0.35, 1.9, [1, 1, 1]);
  } else {
    // the cornice in two pieces thrown off, the figure broken at the knees lying in the gravel and over the kerb
    const bearing = 0.6 + r() * 0.5;
    let s0 = m.mark;
    band(m, ctx, pw + 0.2, (pw + 0.2) * 0.55, 0, 0.12, 1.05, 0.035);
    throwDown(m, s0, [0, 0, 0], X, 0.25, bearing + 1.9, 1.05, 0.05);
    s0 = m.mark;
    band(m, ctx, (pw + 0.2) * 0.45, pw + 0.2, 0, 0.18, 1.05, 0.035);
    throwDown(m, s0, [0, 0, 0], Z, 0.4, bearing - 1.7, 0.95, 0.06);
    s0 = m.mark;
    soldier(m, ctx, 0, 1.9, [1, 1, 1]);
    // (its legs left on the figure's plinth stone, thrown with it)
    throwDown(m, s0, [0, 0, 0], Z, Math.PI / 2 - 0.12, bearing, 1.35, 0.06);
    s0 = m.mark;
    band(m, ctx, 0.7, 0.62, 0, 0.1, 1.02, 0.03);
    throwDown(m, s0, [0, 0, 0], X, 1.2, bearing + 0.9, 1.0, 0.04);
  }
  return m.geometry();
}

/** A bronze palm laid up a face from (u, y): its stem and its fronds either side. */
function palm(m: Mesh, side: Side, face: number, u: number, y: number, len: number): void {
  const onX = side[1] === 'x', s = side[0] === 'p' ? 1 : -1;
  const out: V3 = onX ? [s, 0, 0] : [0, 0, s], U: V3 = onX ? [0, 0, -s] : [s, 0, 0];
  const at = (du: number, dy: number): V3 => add(scl(out, face + 0.025), add(scl(U, u + du), [0, y + dy, 0]));
  member(m, at(0, 0), at(0.03, len), 0.03, 0.025, out, BRONZE, FLAT);
  for (let k = 1; k <= 5; k++) {
    const t = k / 6, l = 0.2 * (1 - t * 0.6);
    for (const sd of [-1, 1]) member(m, at(0.03 * t, len * t), at(0.03 * t + sd * l, len * t + l * 0.7), 0.045, 0.015, out, mul(BRONZE, 0.95 + k * 0.01), FLAT);
  }
}

function lorraine(ctx: WellBuildContext, broken: boolean): THREE.BufferGeometry {
  const m = meshFor(false, ctx), r = stream(0x10a2 + (ctx.seed ?? 0));
  bed(m, ctx, BED, { knocked: broken ? 0 : -1 });
  const pw = 0.82, top = steppedPlinth(m, ctx, [1.72, 1.42, 1.14], 0.21, pw + 0.18);
  band(m, ctx, pw + 0.18, pw + 0.18, top, top + 0.13, 1.0, 0.03);
  band(m, ctx, pw + 0.1, pw + 0.1, top + 0.13, top + 0.19, 1.02, 0.025);
  const y0 = top + 0.19, y1 = y0 + 1.0, depth = 0.04;
  const front: SunkPanel = { u0: -0.25, u1: 0.25, y0: y0 + 0.16, y1: y0 + 0.8 };
  const side: SunkPanel = { u0: -0.24, u1: 0.24, y0: y0 + 0.16, y1: y0 + 0.8 };
  const start = m.mark;
  sunkDie(m, ctx, pw, pw, y0, y1, { px: front, nx: side, pz: side, nz: side }, depth, [1, 1, 1], MASON, y1 + 0.02);
  const cut = ragged(y0 + 0.5, 1.7);
  const below = broken ? cut(0, 0) - 0.12 : undefined;
  tablet(m, 'px', pw / 2, depth, front, 4, r, { below });
  tablet(m, 'nx', pw / 2, depth, side, 5, r, { slab: false, below });
  if (broken) snap(m, start, cut);
  if (!broken) palm(m, 'pz', pw / 2 - depth, -0.08, y0 + 0.2, 0.55);
  const cross = (y: number) => {
    // the Lorraine cross: the shaft and its two bars, the upper shorter, each a dressed stone with its arrises cut back,
    // the shaft in its socket
    const sh = weathered(ctx, 1.02, { lichen: 0.5 });
    member(m, [0, y, 0], [0, y + 2.95, 0], 0.3, 0.3, Z, [1.02, 1.02, 1.02], MASON, { chamfer: 0.035, shade: sh });
    member(m, [0, y + 2.35, -0.48], [0, y + 2.35, 0.48], 0.3, 0.26, Y, [1.02, 1.02, 1.02], MASON, { chamfer: 0.035, shade: sh });
    member(m, [0, y + 1.85, -0.76], [0, y + 1.85, 0.76], 0.3, 0.26, Y, [1.02, 1.02, 1.02], MASON, { chamfer: 0.035, shade: sh });
  };
  if (!broken) {
    band(m, ctx, pw + 0.16, pw + 0.16, y1, y1 + 0.1, 1.04, 0.03);
    band(m, ctx, pw + 0.04, pw + 0.04, y1 + 0.1, y1 + 0.16, 1.03, 0.02);
    band(m, ctx, 0.48, 0.48, y1 + 0.16, y1 + 0.34, 1.02, 0.04);
    cross(y1 + 0.34);
  } else {
    const bearing = r() * Math.PI * 2;
    let s0 = m.mark;
    band(m, ctx, pw + 0.16, pw + 0.16, 0, 0.1, 1.04, 0.03);
    band(m, ctx, 0.48, 0.48, 0.1, 0.28, 1.02, 0.04);
    throwDown(m, s0, [0, 0, 0], X, 0.3, bearing + 2.4, 0.95, 0.05);
    // the cross down across the bed, its foot by the die
    s0 = m.mark;
    cross(0);
    throwDown(m, s0, [0, 0, 0], Z, Math.PI / 2 - 0.06, bearing, 0.7, 0.05);
  }
  return m.geometry();
}

/** Bolt heads on a face at the points given (u, y): the iron cross's fixings. */
function bolts(m: Mesh, side: Side, face: number, pts: ReadonlyArray<readonly [number, number]>): void {
  const onX = side[1] === 'x', s = side[0] === 'p' ? 1 : -1;
  const out: V3 = onX ? [s, 0, 0] : [0, 0, s], U: V3 = onX ? [0, 0, -s] : [s, 0, 0];
  for (const [u, y] of pts) {
    const c = add(scl(out, face), add(scl(U, u), [0, y, 0]));
    member(m, c, add(c, scl(out, 0.03)), 0.04, 0.04, [0, 1, 0], mul(IRON, 1.2), FLAT);
  }
}

function stele(ctx: WellBuildContext, broken: boolean): THREE.BufferGeometry {
  const m = meshFor(false, ctx), r = stream(0x57e1 + (ctx.seed ?? 0));
  // (a works town of brick raised its memorial in dressed sandstone: on a brick kit the stele, its plinth, its kerb and
  // posts are smooth grey-yellow stone over the print's flat texel, not brick courses)
  const dress = dressOf(ctx), brick = dress.uv === FLAT, sand = dress.col;
  const col: Rgb = dress.col, uv: UvMode = dress.uv;
  bed(m, ctx, BED, { knocked: broken ? 1 : -1, dress });
  const top = steppedPlinth(m, ctx, [1.7, 1.36], 0.25, 1.26, dress);
  // the base course under the stele, a moulded step
  band(m, ctx, 0.7, 1.3, top, top + 0.16, 1.0, 0.03, brick ? mul(sand, 0.96) : [1, 1, 1], uv);
  band(m, ctx, 0.6, 1.2, top + 0.16, top + 0.22, 1.0, 0.02, brick ? mul(sand, 0.98) : [1, 1, 1], uv);
  const y0 = top + 0.22, H = 3.2, y1 = y0 + H, depth = 0.035;
  const panel: SunkPanel = { u0: -0.36, u1: 0.36, y0: y0 + 0.25, y1: y0 + 0.95 };
  const start = m.mark;
  sunkDie(m, ctx, 0.5, 1.1, y0, y1, { px: panel }, depth, col, uv, y1 + 0.02);
  const cut = ragged(y0 + 0.75, 2.3);
  tablet(m, 'px', 0.25, depth, panel, 5, r, { slab: false, below: broken ? cut(0.25, 0) - 0.1 : undefined });
  if (broken) snap(m, start, cut);
  const ironCross = (y: number, foot: V3 = [0.25, 0, 0]) => {
    // the iron cross bolted proud of the face: its upright and arms cast, 7 cm deep in section with their arrises cut
    // back (the r2 sweep: flat bar 2 cm proud read as a dark plate on the face), their bolts
    member(m, add(foot, [0.035, y + 1.15, 0]), add(foot, [0.035, y + 2.35, 0]), 0.07, 0.12, X, IRON, FLAT, { chamfer: 0.014 });
    member(m, add(foot, [0.035, y + 1.9, -0.32]), add(foot, [0.035, y + 1.9, 0.32]), 0.07, 0.12, X, IRON, FLAT, { chamfer: 0.014 });
  };
  if (!broken) {
    ironCross(y0);
    bolts(m, 'px', 0.315, [[0, y0 + 1.25], [0, y0 + 2.25], [-0.26, y0 + 1.9], [0.26, y0 + 1.9], [0, y0 + 1.9]]);
    wreath(m, 'px', 0.3, 0, y0 + 1.9, 0.2);
    // the cornice over the stele and its capstone
    band(m, ctx, 0.62, 1.3, y1, y1 + 0.2, 1.04, 0.03, brick ? mul(sand, 1.05) : [1.04, 1.04, 1.04], uv);
    band(m, ctx, 0.42, 1.04, y1 + 0.2, y1 + 0.4, 1.04, 0.05, brick ? mul(sand, 1.05) : [1.04, 1.04, 1.04], uv);
  } else {
    // the stele's top length thrown down beside it with its cross and its cornice
    const s0 = m.mark;
    block(m, 0, 0, 0, 2.2, 0.5, 1.1, col, uv, { chamfer: 0.012 });
    ironCross(-1.0, [0.25, 0, 0]);
    band(m, ctx, 0.62, 1.3, 2.2, 2.42, 1.04, 0.03, brick ? mul(sand, 1.05) : [1.04, 1.04, 1.04], uv);
    throwDown(m, s0, [0, 0, 0], Z, Math.PI / 2 - 0.1, 0.4 + r() * 1.2, 1.35, 0.04);
  }
  return m.geometry();
}

// --------------------------------------------------------------------------------------------- the Friedenssäule
// (the maps lane, 228; the owner's pick, 2026-10-18: "a civic square with a tree-lined green, memorial column and parked
// period cars") a Franconian town's victory column of 1871 that later took the tablets of 1914-18 and 1939-45: three
// octagonal steps of Burgsandstein, the pedestal — its base course, the die with a polished tablet sunk in each face (the
// town's arms in relief over lettering worn past reading, a laurel on the back), its cornice — an Attic base, a Tuscan
// shaft of seven drums tapering on its entasis (sixteen flutes; a phone's plain twelve-sided shaft), the capital
// (necking, echinus, abacus), the figure drum and the gilt Victoria: her robe, her wings, the wreath raised in her right
// hand, the palm in her left; two bronze wreaths left at the front. 12.3 m. Broken: the shaft snaps above its second
// drum; the drums above it, the capital and the Victoria lie out along the fall, the stub standing on the pedestal.
// No national emblem and no legible name (the plan's sensitivity rule): the arms are a town's tower, the words strokes.

const COLUMN_STEPS = [2.05, 1.8, 1.55] as const, COLUMN_RISE = 0.18;
const COLUMN_STONE: Rgb = hexLin(0xb89e7a);
const GILT_BRIGHT: Rgb = hexLin(0xc8a040), GILT_DEEP: Rgb = hexLin(0x8f7230), VERDIGRIS: Rgb = hexLin(0x5f8a74), BRONZE_DARK: Rgb = hexLin(0x6a5a3a);
/** The column's heights (m over the ground): the steps' top, the die, the cornice, the shaft and the figure. */
const COLUMN_Y = (() => {
  const steps = COLUMN_STEPS.length * COLUMN_RISE, base = steps + 0.25, die = base + 1.35, cornice = die + 0.3;
  const attic = cornice + 0.4, shaft = attic + 6.4, capital = shaft + 0.55, drum = capital + 0.4;
  return { steps, base, die, cornice, attic, shaft, capital, drum, top: drum + 2.1 };
})();
const SHAFT_R0 = 0.5, SHAFT_R1 = 0.42, DRUMS = 7;

/** The shaft's radius at height y (its entasis: a swell a third of the way up). */
function shaftRadius(y: number): number {
  const t = Math.max(0, Math.min(1, (y - COLUMN_Y.attic) / (COLUMN_Y.shaft - COLUMN_Y.attic)));
  return SHAFT_R0 + (SHAFT_R1 - SHAFT_R0) * t + 0.012 * Math.sin(Math.PI * Math.min(1, t * 1.5));
}

/** A surface of revolution on the flat texel: `profile` [r, y] bottom up round `axis` through `o` (vertical by default),
 *  `n` sides, its colour by `shade`. `top` closes the last ring. */
function latheFlat(m: Mesh, profile: ReadonlyArray<readonly [number, number]>, n: number, shade: (q: V3, nn: V3) => Rgb,
  opts: { o?: V3; axis?: V3; top?: boolean; bottom?: boolean; phase?: number } = {}): void {
  const o = opts.o ?? [0, 0, 0], ax = opts.axis ?? Y;
  const ref: V3 = Math.abs(ax[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
  const s1 = normal3(cross3(ax, ref)), s2 = cross3(s1, ax);
  const uv = (): [number, number] => [m.surface.flatUv?.[0] ?? 0.5, m.surface.flatUv?.[1] ?? 0.5];
  const at = (r: number, y: number, a: number): V3 => add(o, add(scl(ax, y), add(scl(s1, Math.sin(a) * r), scl(s2, Math.cos(a) * r))));
  const ph = opts.phase ?? 0;
  for (let j = 0; j + 1 < profile.length; j++) {
    const [r0, y0] = profile[j], [r1, y1] = profile[j + 1];
    for (let k = 0; k < n; k++) {
      const a0 = ph + (k / n) * Math.PI * 2, a1 = ph + ((k + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
      const out = add(add(scl(s1, Math.sin(am) * (y1 - y0)), scl(s2, Math.cos(am) * (y1 - y0))), scl(ax, r0 - r1));
      m.quad(at(r0, y0, a0), at(r0, y0, a1), at(r1, y1, a1), at(r1, y1, a0), out, uv, shade, false);
    }
  }
  const capAt = (j: number, sign: number): void => {
    const [r, y] = profile[j];
    if (!(r > 0)) return;
    const c = add(o, scl(ax, y)), nn = scl(ax, sign);
    for (let k = 0; k < n; k++) {
      const a0 = ph + (k / n) * Math.PI * 2, a1 = ph + ((k + 1) / n) * Math.PI * 2;
      m.quad(c, at(r, y, a0), at(r, y, a1), c, nn, uv, shade, false);
    }
  };
  if (opts.top) capAt(profile.length - 1, 1);
  if (opts.bottom) capAt(0, -1);
}
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normal3 = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** An octagonal course of eight dressed stones, circumradius R, `ring` m deep, from y0 to y1, each its own unit. */
function octagonCourse(m: Mesh, ctx: WellBuildContext, R: number, ring: number, y0: number, y1: number, k: number, chipped = -1): void {
  const shade = weathered(ctx, k, { lichen: 0.9 }), ym = (y0 + y1) / 2;
  const rho = R * Math.cos(Math.PI / 8) - ring / 2, half = R * Math.sin(Math.PI / 8) - 0.004;
  for (let i = 0; i < 8; i++) {
    const am = ((i + 0.5) / 8) * Math.PI * 2, nx = Math.sin(am), nz = Math.cos(am), tx = Math.cos(am), tz = -Math.sin(am);
    const cx = nx * rho, cz = nz * rho, top = i === chipped ? y1 - 0.06 : y1;
    member(m, [cx - tx * half, (y0 + top) / 2, cz - tz * half], [cx + tx * half, (y0 + top) / 2, cz + tz * half], ring, top - y0, [nx, 0, nz],
      [1, 1, 1], MASON, { chamfer: i === chipped ? 0.07 : 0.025, shade });
    void ym;
  }
}

/** One drum of the shaft from y0 to y1 at the origin (or laid along `axis` from `o`): sixteen flutes, or a plain
 *  twelve-gon on a phone; its own tone; its top and bottom joint faces. */
function shaftDrum(m: Mesh, y0: number, y1: number, k: number, fluted: boolean, place?: { o: V3; axis: V3 }): void {
  const n = fluted ? 32 : 12, base = mul(COLUMN_STONE, k);
  const shade = (q: V3, nn: V3): Rgb => {
    // lichen at the joints (the bottom and top 8 cm), a damp foot on the lowest drum
    const local = place ? 0 : q[1];
    const nearJoint = place ? 0.4 : Math.min(Math.abs(local - y0), Math.abs(local - y1)) < 0.08 ? 1 : 0;
    const b = blotch(q, 5);
    let c = mul(base, 0.97 + b * 0.06);
    if (nearJoint && b > 0.55) c = mulRgb(c, mix([1, 1, 1], LICHEN, 0.45));
    if (!place && q[1] < COLUMN_Y.attic + 0.5) c = mul(c, 0.92);
    return mul(c, 0.94 + 0.06 * Math.max(0, nn[1]));
  };
  const prof: Array<[number, number]> = [];
  for (let s = 0; s <= 2; s++) { const y = y0 + ((y1 - y0) * s) / 2; prof.push([shaftRadius(y), y - (place ? y0 : 0)]); }
  if (!fluted) { latheFlat(m, prof, n, shade, { o: place?.o, axis: place?.axis, top: true, bottom: !!place }); return; }
  // fluted: the arrises at the drum's radius, the flutes' floors 6 % in (a 32-sided section, alternating)
  const o = place?.o ?? [0, 0, 0], ax = place?.axis ?? Y;
  const ref: V3 = Math.abs(ax[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
  const s1 = normal3(cross3(ax, ref)), s2 = cross3(s1, ax);
  const uv = (): [number, number] => [m.surface.flatUv?.[0] ?? 0.5, m.surface.flatUv?.[1] ?? 0.5];
  const at = (r: number, y: number, a: number): V3 => add(o, add(scl(ax, y), add(scl(s1, Math.sin(a) * r), scl(s2, Math.cos(a) * r))));
  for (let j = 0; j + 1 < prof.length; j++) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, f0 = i % 2 ? 0.94 : 1, f1 = (i + 1) % 2 ? 0.94 : 1;
      const p00 = at(prof[j][0] * f0, prof[j][1], a0), p01 = at(prof[j][0] * f1, prof[j][1], a1);
      const p10 = at(prof[j + 1][0] * f0, prof[j + 1][1], a0), p11 = at(prof[j + 1][0] * f1, prof[j + 1][1], a1);
      const am = (a0 + a1) / 2, out = add(scl(s1, Math.sin(am)), scl(s2, Math.cos(am)));
      m.quad(p00, p01, p11, p10, out, uv, shade, false);
    }
  }
  for (const [j, sign] of [[prof.length - 1, 1], ...(place ? [[0, -1] as const] : [])] as const) {
    const c = add(o, scl(ax, prof[j][1])), nn = scl(ax, sign);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      m.quad(c, at(prof[j][0] * (i % 2 ? 0.94 : 1), prof[j][1], a0), at(prof[j][0] * ((i + 1) % 2 ? 0.94 : 1), prof[j][1], a1), c, nn, uv, shade, false);
    }
  }
}

/** The capital (necking, echinus, abacus) and the figure drum, from y (at the origin, or laid along `axis` from `o`). */
function columnCapital(m: Mesh, ctx: WellBuildContext, y: number, place?: { o: V3; axis: V3 }): void {
  const shade = weathered(ctx, 1.02, { lichen: 0.5, base: COLUMN_STONE });
  const off = place ? -y : 0;
  latheFlat(m, [[SHAFT_R1 + 0.01, y + off], [SHAFT_R1 + 0.035, y + 0.03 + off], [SHAFT_R1 + 0.035, y + 0.08 + off], [SHAFT_R1, y + 0.1 + off],
    [SHAFT_R1 + 0.02, y + 0.2 + off], [0.56, y + 0.33 + off], [0.6, y + 0.37 + off]], 24, shade, { o: place?.o, axis: place?.axis, top: true, bottom: !!place });
  // the abacus: a square slab 1.25 m, its arrises cut back
  if (!place) {
    block(m, 0, 0, y + 0.37, y + 0.55, 1.25, 1.25, COLUMN_STONE, FLAT, { chamfer: 0.03, shade });
    latheFlat(m, [[0.44, y + 0.55], [0.44, y + 0.88], [0.47, y + 0.9], [0.47, y + 0.95]], 24, shade, { top: true });
  } else {
    // laid down: the abacus and the figure drum along the axis past the echinus
    const a = add(place.o, scl(place.axis, 0.37)), b = add(place.o, scl(place.axis, 0.55));
    member(m, a, b, 1.25, 1.25, [0, 1, 0], COLUMN_STONE, FLAT, { chamfer: 0.03, shade });
    latheFlat(m, [[0.44, 0.55], [0.44, 0.88], [0.47, 0.9], [0.47, 0.95]], 24, shade, { o: place.o, axis: place.axis, top: true });
  }
}

/** The gilt Victoria, about 2.1 m, standing on y (her front local +z): robe, bodice, head, wings, the raised wreath,
 *  the palm. Every member meets the one it hangs from (the r2 grounding). */
function victoria(m: Mesh, y: number, phone: boolean): void {
  const u = 1, n = phone ? 7 : 10;
  const gilt = (q: V3, nn: V3): Rgb => mix(GILT_DEEP, GILT_BRIGHT, Math.max(0, Math.min(1, 0.35 + 0.55 * Math.max(0, nn[1]) + 0.25 * Math.max(0, nn[2])
    + (blotch(q, 9) - 0.5) * 0.2)));
  const G = { chamfer: 0.025, shade: gilt };
  // the robe: flaring from the girdle to the plinth, a fold swung forward over the stepping left foot
  latheFlat(m, [[0.36, y], [0.37, y + 0.05], [0.33, y + 0.3], [0.27, y + 0.7], [0.21, y + 1.0], [0.19, y + 1.12]], n, gilt, { bottom: false });
  member(m, [-0.12, y + 0.05, 0.2], [-0.14, y + 0.9, 0.14], 0.16, 0.12, X, GILT_BRIGHT, FLAT, G);
  member(m, [0.15, y + 0.05, 0.22], [0.1, y + 0.75, 0.12], 0.12, 0.1, X, GILT_DEEP, FLAT, G);
  // the bodice and the shoulders, the neck and the head with its knot of hair
  member(m, [0, y + 1.08, 0], [0, y + 1.5, 0], 0.4 * u, 0.25, Z, GILT_BRIGHT, FLAT, { chamfer: 0.07, shade: gilt });
  member(m, [-0.24, y + 1.45, 0], [0.24, y + 1.45, 0], 0.12, 0.2, Y, GILT_BRIGHT, FLAT, { chamfer: 0.05, shade: gilt });
  latheFlat(m, [[0.05, y + 1.5], [0.055, y + 1.58], [0.1, y + 1.62], [0.115, y + 1.7], [0.1, y + 1.79], [0.05, y + 1.83], [0.0, y + 1.84]], n, gilt, { top: false });
  latheFlat(m, [[0.05, y + 1.74], [0.07, y + 1.78], [0.05, y + 1.83], [0, y + 1.84]], 6, gilt, { o: [0, 0, -0.08] });
  // the right arm raised high, the laurel wreath in its hand
  member(m, [0.22, y + 1.47, 0.0], [0.3, y + 1.78, 0.06], 0.085, 0.085, X, GILT_BRIGHT, FLAT, G);
  member(m, [0.3, y + 1.76, 0.06], [0.34, y + 2.06, 0.1], 0.075, 0.075, X, GILT_BRIGHT, FLAT, G);
  const wc: V3 = [0.35, y + 2.2, 0.11], wr = 0.13, wn = phone ? 8 : 12;
  for (let k = 0; k < wn; k++) {
    const a0 = (k / wn) * Math.PI * 2, a1 = ((k + 1.15) / wn) * Math.PI * 2;
    member(m, add(wc, [Math.sin(a0) * wr, Math.cos(a0) * wr, 0]), add(wc, [Math.sin(a1) * wr, Math.cos(a1) * wr, 0]), 0.045, 0.035, Z, GILT_BRIGHT, FLAT, { shade: gilt });
  }
  // the left arm lowered and forward, the palm branch rising from its hand
  member(m, [-0.22, y + 1.47, 0], [-0.3, y + 1.2, 0.1], 0.085, 0.085, X, GILT_BRIGHT, FLAT, G);
  member(m, [-0.3, y + 1.22, 0.1], [-0.28, y + 1.04, 0.32], 0.075, 0.075, X, GILT_BRIGHT, FLAT, G);
  const p0: V3 = [-0.28, y + 1.0, 0.34], p1: V3 = [-0.33, y + 1.82, 0.44];
  member(m, p0, p1, 0.03, 0.03, X, GILT_DEEP, FLAT, { shade: gilt });
  for (let k = 1; k <= (phone ? 4 : 7); k++) {
    const t = k / (phone ? 5 : 8), c: V3 = add(p0, scl(sub3(p1, p0), t)), l = 0.22 * (1 - t * 0.55);
    for (const s of [-1, 1]) member(m, c, add(c, [s * l, l * 0.55, 0.03]), 0.05, 0.012, Z, GILT_BRIGHT, FLAT, { shade: gilt });
  }
  // the wings: from her shoulder blades back and up, each a whole swept plate (both faces) under its leading edge's
  // member, the primaries' scallops along its trailing edge (228 r2, the blind critics: three separate blades a wing
  // read as "a spiky blob" against the sky)
  for (const s of [-1, 1]) {
    const root: V3 = [s * 0.09, y + 1.42, -0.1];
    const edge: V3[] = [[s * 0.16, y + 1.6, -0.15], [s * 0.33, y + 1.95, -0.29], [s * 0.5, y + 2.12, -0.42], [s * 0.55, y + 1.92, -0.47],
      [s * 0.52, y + 1.66, -0.5], [s * 0.45, y + 1.4, -0.48], [s * 0.34, y + 1.2, -0.42], [s * 0.2, y + 1.22, -0.26]];
    // (flat on the kit's print: its colour over the print's texel, its uv the texel's, as a FLAT member's)
    const uv: readonly [number, number] = [m.surface.flatUv?.[0] ?? 0.5, m.surface.flatUv?.[1] ?? 0.5];
    for (let k = 0; k + 1 < edge.length; k++) {
      const a = edge[k], b = edge[k + 1];
      const e1 = sub3(a, root), e2 = sub3(b, root);
      const cr: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const l = Math.hypot(cr[0], cr[1], cr[2]) || 1, nn: V3 = [cr[0] / l, cr[1] / l, cr[2] / l], back: V3 = [-nn[0], -nn[1], -nn[2]];
      // each face a hair off the plate's mid-plane (no z-fight between them)
      const off = (p: V3, n: V3): V3 => [p[0] + n[0] * 0.008, p[1] + n[1] * 0.008, p[2] + n[2] * 0.008];
      m.tri(off(root, nn), off(a, nn), off(b, nn), nn, nn, nn, uv, uv, uv, m.colour(gilt(root, nn), false));
      m.tri(off(root, back), off(b, back), off(a, back), back, back, back, uv, uv, uv, m.colour(gilt(root, back), false));
    }
    member(m, root, edge[2], 0.07, 0.05, [s, 0, 0.3], GILT_BRIGHT, FLAT, { chamfer: 0.015, shade: gilt });
  }
}

/** A bronze laurel wreath leant against the die's front (its ring tilted 15 degrees back, its ribbon's tails on the
 *  step), standing on y. */
function leaningWreath(m: Mesh, x: number, y: number, z: number, rad: number): void {
  const n = 14, lean = 0.26, bronze = (q: V3): Rgb => mix(VERDIGRIS, BRONZE_DARK, blotch(q, 11) * 0.7);
  const at = (a: number, rr: number): V3 => [x + Math.sin(a) * rr, y + rad + Math.cos(a) * rr * Math.cos(lean), z + Math.cos(a) * rr * Math.sin(lean)];
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1.2) / n) * Math.PI * 2;
    member(m, at(a0, rad), at(a1, rad), 0.09, 0.06, [0, Math.sin(lean), -Math.cos(lean)], VERDIGRIS, FLAT, { shade: bronze });
  }
  for (const t of [-1, 1]) member(m, at(Math.PI, rad), [x + t * 0.12, y + 0.01, z + 0.12], 0.05, 0.015, [0, 1, 0], BRONZE_DARK, FLAT, { shade: bronze });
}

/** The town's arms in relief over a face's tablet: a shield of the die's stone, a tower with its gate on it. */
function armsRelief(m: Mesh, ctx: WellBuildContext, face: number, y: number): void {
  // (carved in the die's own stone: on its print, a shade lighter where it stands proud)
  const shade = weathered(ctx, 1.08, { lichen: 0.3 }), K: Rgb = [1.08, 1.08, 1.08];
  const z0 = face - 0.004, z1 = face + 0.025;
  member(m, [-0.2, y, (z0 + z1) / 2], [0.2, y, (z0 + z1) / 2], z1 - z0, 0.24, [0, 0, 1], K, MASON, { shade });
  for (const s of [-1, 1]) member(m, [s * 0.2, y - 0.12, (z0 + z1) / 2], [0, y - 0.36, (z0 + z1) / 2], z1 - z0, 0.18, [0, 0, 1], K, MASON, { shade });
  // the tower: its body, three merlons, the gate's arch a step back
  const zt = z1 + 0.012, T: Rgb = [1.14, 1.14, 1.14];
  member(m, [0, y - 0.25, zt], [0, y + 0.06, zt], 0.13, 0.022, [1, 0, 0], T, MASON, { shade: weathered(ctx, 1.14, { lichen: 0.2 }) });
  for (const s of [-1, 0, 1]) member(m, [s * 0.045, y + 0.06, zt], [s * 0.045, y + 0.1, zt], 0.03, 0.022, [1, 0, 0], T, MASON, { shade: weathered(ctx, 1.14, { lichen: 0.2 }) });
}

function saeule(ctx: WellBuildContext, broken: boolean): THREE.BufferGeometry {
  const m = meshFor(false, ctx), r = stream(0x5a01 + (ctx.seed ?? 0)), phone = !!ctx.mobile;
  const Yc = COLUMN_Y;
  // the steps: three octagonal courses of dressed stones (each upper course sits on the one below's inside)
  COLUMN_STEPS.forEach((R, k) => {
    const next = COLUMN_STEPS[k + 1] ?? 1.0, ring = Math.min(R, R - next + 0.25), y0 = k ? k * COLUMN_RISE : -0.12;
    octagonCourse(m, ctx, R, ring, y0, (k + 1) * COLUMN_RISE, 0.98 + k * 0.015, broken ? (k === 0 ? 5 : k === 1 ? 2 : -1) : -1);
  });
  // the pedestal: its base course, the die with its four sunk panels and their tablets, the cornice
  squareCourse(m, ctx, 2.0, 0.5, Yc.steps - 0.02, Yc.base, 1.0, { chamfer: 0.03 });
  block(m, 0, 0, Yc.steps, Yc.base - 0.01, 1.0, 1.0, COLUMN_STONE, FLAT, { shade: weathered(ctx, 0.95) });
  const dw = 1.8, depth = 0.045;
  const panel: SunkPanel = { u0: -0.6, u1: 0.6, y0: Yc.base + 0.18, y1: Yc.die - 0.2 };
  sunkDie(m, ctx, dw, dw, Yc.base, Yc.die, { px: panel, nx: panel, pz: panel, nz: panel }, depth, [1, 1, 1], MASON, Yc.die + 0.02);
  // the front: the arms over the lettering; the sides: the two wars' tablets; the back: the laurel
  tablet(m, 'pz', dw / 2, depth, { ...panel, y1: panel.y1 - 0.42 }, 5, r);
  armsRelief(m, ctx, dw / 2 - depth, panel.y1 - 0.2);
  for (const side of ['px', 'nx'] as const) tablet(m, side, dw / 2, depth, panel, 9, r);
  wreath(m, 'nz', dw / 2 - depth + 0.01, 0, (panel.y0 + panel.y1) / 2, 0.24);
  band(m, ctx, dw + 0.04, dw + 0.04, Yc.die, Yc.die + 0.08, 1.03, 0.015);
  band(m, ctx, dw + 0.24, dw + 0.24, Yc.die + 0.08, Yc.die + 0.22, 1.05, 0.04);
  band(m, ctx, dw + 0.08, dw + 0.08, Yc.die + 0.22, Yc.cornice, 1.04, 0.025);
  // the two bronze wreaths left at the front, on the top step
  for (const s of [-1, 1]) leaningWreath(m, s * 0.42, Yc.steps, dw / 2 + 0.1, 0.3);
  // the Attic base: plinth, torus, scotia, torus
  const sh = weathered(ctx, 1.0, { lichen: 0.6, base: COLUMN_STONE });
  block(m, 0, 0, Yc.cornice, Yc.cornice + 0.1, 1.2, 1.2, COLUMN_STONE, FLAT, { chamfer: 0.02, shade: sh });
  latheFlat(m, [[0.6, Yc.cornice + 0.1], [0.62, Yc.cornice + 0.15], [0.6, Yc.cornice + 0.2], [0.54, Yc.cornice + 0.24], [0.53, Yc.cornice + 0.3],
    [0.56, Yc.cornice + 0.34], [SHAFT_R0 + 0.02, Yc.attic - 0.02], [SHAFT_R0, Yc.attic]], phone ? 12 : 24, sh, { top: false });
  // the shaft in its drums
  const dh = (Yc.shaft - Yc.attic) / DRUMS, fluted = !phone;
  const snapAt = Yc.attic + dh * 2 + dh * 0.4;
  for (let d = 0; d < DRUMS; d++) {
    const y0 = Yc.attic + d * dh + (d ? 0.003 : 0), y1 = Yc.attic + (d + 1) * dh - 0.003;
    const tone = 0.95 + hash(d, 3, 0x5ae1) * 0.1;
    if (!broken) { shaftDrum(m, y0, y1, tone, fluted); continue; }
    if (d < 2) { shaftDrum(m, y0, y1, tone, fluted); continue; }
    if (d === 2) {
      // the snapped drum: its lower part standing, its top broken ragged
      const start = m.mark;
      shaftDrum(m, y0, y1, tone, fluted);
      snap(m, start, ragged(snapAt, 4.2));
    }
  }
  if (!broken) {
    columnCapital(m, ctx, Yc.shaft);
    victoria(m, Yc.drum, phone);
    return m.geometry();
  }
  // the fall: along a bearing in the frame, the drums laid out one after another, each turned a little off it; the
  // capital past them and the Victoria face down at the end
  const bearing = 2.1 + r() * 0.3, bx = Math.sin(bearing), bz = Math.cos(bearing);
  let d = 2.6;
  for (let k = 2; k < DRUMS; k++) {
    const len = k === 2 ? dh * 0.6 : dh, yaw = bearing + (r() - 0.5) * 0.6;
    const ax: V3 = [Math.sin(yaw), 0, Math.cos(yaw)], rad = shaftRadius(Yc.attic + k * dh);
    d += k === 2 ? 0.6 : 0.25 + r() * 0.4;
    const side = (r() - 0.5) * 1.2;
    const o: V3 = [bx * d + bz * side - ax[0] * len / 2, rad - 0.02, bz * d - bx * side - ax[2] * len / 2];
    const y0 = Yc.attic + k * dh;
    // a laid drum: the same section along its own axis
    const start = m.mark;
    shaftDrum(m, y0, y0 + len, 0.94 + hash(k, 3, 0x5ae1) * 0.1, fluted, { o, axis: ax });
    void start;
    d += len;
  }
  d += 0.5;
  {
    const yaw = bearing + 0.35, ax: V3 = [Math.sin(yaw), 0, Math.cos(yaw)];
    columnCapital(m, ctx, 0, { o: [bx * d, 0.62, bz * d], axis: ax });
    d += 1.6;
  }
  // the Victoria thrown face down past the capital, a wing broken off beside her
  const vs = m.mark;
  victoria(m, 0, phone);
  m.tilt(vs, [0, 0, 0], [1, 0, 0], Math.PI / 2 - 0.08);
  m.turn(vs, 0, 0, bearing);
  let low = Infinity;
  for (let i = vs; i < m.mark; i += 3) low = Math.min(low, m.p[i + 1]);
  for (let i = vs; i < m.mark; i += 3) { m.p[i] += bx * d; m.p[i + 1] += 0.03 - low; m.p[i + 2] += bz * d; }
  return m.geometry();
}

/**
 * The column's collision solid, the same on every tier: its octagonal steps, the pedestal and the shaft as three plain
 * prisms. The props refit its records to this, not to the drawn stones: the steps' stone-by-stone slivers grew needles
 * at the bots' clearance (a mitred margin) and closed the planner's diagonals past the column (the plan's seat keeps
 * them 2.75 m clear of its octagon).
 */
export function memorialColumnSolid(): THREE.BufferGeometry {
  const steps = new THREE.CylinderGeometry(COLUMN_STEPS[0], COLUMN_STEPS[0], COLUMN_Y.steps + 0.12, 8).toNonIndexed();
  steps.translate(0, (COLUMN_Y.steps - 0.12) / 2, 0);
  const pedestal = new THREE.BoxGeometry(2.04, COLUMN_Y.cornice - COLUMN_Y.steps, 2.04).toNonIndexed();
  pedestal.translate(0, (COLUMN_Y.cornice + COLUMN_Y.steps) / 2, 0);
  const shaft = new THREE.CylinderGeometry(SHAFT_R1, 0.62, COLUMN_Y.drum + 1.9 - COLUMN_Y.cornice, 12).toNonIndexed();
  shaft.translate(0, (COLUMN_Y.drum + 1.9 + COLUMN_Y.cornice) / 2, 0);
  const parts = [steps, pedestal, shaft];
  const count = parts.reduce((n, g) => n + g.attributes.position.count, 0), pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3);
  let at = 0;
  for (const g of parts) { pos.set(g.attributes.position.array as Float32Array, at * 3); nrm.set(g.attributes.normal.array as Float32Array, at * 3); at += g.attributes.position.count; g.dispose(); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return out;
}

/** The column's record height (m): the Victoria's wreath. */
export const MEMORIAL_COLUMN_HEIGHT = COLUMN_Y.top;

/** A map's monument, intact or broken. */
export function buildMonument(form: MonumentForm, ctx: WellBuildContext, broken = false): THREE.BufferGeometry {
  switch (form) {
    case 'krieger': return krieger(ctx, broken);
    case 'lorraine': return lorraine(ctx, broken);
    case 'stele': return stele(ctx, broken);
    case 'saeule': return saeule(ctx, broken);
  }
}
void scl;
