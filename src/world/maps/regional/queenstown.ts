// src/world/maps/regional/queenstown.ts — the Queenstown kit (Copper Mesa Mine: Queenstown under Mount Lyell on the
// west coast of Tasmania, the Mount Lyell Mining and Railway Company's town from 1893 to 1994, the Iron Blow open cut
// above it and the hills round it stripped bare by the smelters' fumes and the cutting for their furnaces). The mine's
// works: the steel headframes over the North Lyell shafts with their winding houses and timber ore bins; the
// concentrator stepping down its slope in corrugated sections under monitor roofs, a conveyor gallery up to its head;
// the smelters' power house of red brick with tall arched windows and its stack; the railway's engine shed of
// corrugated iron; a water tank on its timber trestle; and the town: the Empire Hotel or the company's office, two
// storeys of brick behind a two-storey verandah of cast-iron lace; rows of weatherboard cottages under corrugated iron,
// each with its bullnose verandah, its brick chimney and its picket fence; and the stripped frames of abandoned ones.
import { PartSink, faceBox, facePanel, facePoint, pick, rgb, shade, UV_MEMBER, type Face, type RegionalBucket, type Rgb, type Vec3 } from './geometry.ts';
import { DOME_MIN_SEGMENTS, smoothProfile } from './domes.ts';
import { buildHouse, emitRoof, holedPolygon, layRoofRelief, recordBody, reliefSlope, roofGeometry, windowRhythm, type HouseDialect, type Opening, type RoofRelief, type RoofSpec } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import { sheetHall } from './hall.ts';
import { latticeFrame, recordLattice } from './lattice.ts';
import { hotelNameBoard } from './queenstownSign.ts';
import { trestleDeck } from './queenstownTrestle.ts';
import { archGlazing, archHead } from './sarajevoParts.ts';

const BRICK: RegionalBucket = 'stone', CONCRETE: RegionalBucket = 'plaster3';
/** Corrugated iron: galvanised, rust-streaked, the company's red oxide, a faded green. */
const IRON_SHEET: readonly Rgb[] = [0xa4a8a5, 0x8f7a68, 0x8a4a34, 0x6f7f72].map(rgb);
const STEEL = rgb(0x5f6466), BLACK = rgb(0x2c2d2e), TIMBER = rgb(0x6a5644), TIMBER_GREY = rgb(0x8a7f72);
/** The cottages' weatherboards: cream, white, pale green, buff, a faded blue, a Federation red-brown. */
const COTTAGE: readonly Rgb[] = [0xdcd8cc, 0xe6e2d8, 0xb8c4a8, 0xc8b490, 0xa9b8c4, 0x8a5a46].map(rgb);
/** The trim and the verandah posts (round 3, wave 132: "verandah posts in toy-primary red, green and blue"): cream most
 *  often, a deep Brunswick green, a dull Indian red, a stone grey. */
const TRIM: readonly Rgb[] = [0xe4e0d4, 0xd6cfbd, 0xe4e0d4, 0x3e4a3c, 0x6a3a30, 0x8a8a80].map(rgb);
/** The verandahs' painted iron: a weathered red oxide, a Brunswick green, galvanised, galvanised gone to rust (round 2,
 *  the gauntlet's wave 117: the bright red oxide on a hip read as "a Mediterranean terracotta tile roof"). */
const ROOF_PAINT: readonly Rgb[] = [0x6e3a2e, 0x4a5e48, 0x9aa09c, 0x7a6458].map(rgb);
/** The hotel's cast iron lace, painted cream against the dark posts (round 2: dark lace on dark posts read as plain rails). */
const LACE = rgb(0xe6e0cc), ORE = rgb(0x7a4a32), COPPER = rgb(0x4f8a72);
/** Rust on the west coast's iron: the bleed from the sheets' feet and laps, darker where it runs. */
const RUST = rgb(0x6e3a24), RUST_DARK = rgb(0x4a2a1c);
/**
 * (dome-detail-275) The roofs in relief (house.ts RoofSpec.relief, layRoofRelief): the west coast's corrugated iron
 * everywhere, the mine's and the town's alike, in its lapped courses of 8-foot sheets (2.4 m, lapped a corrugation and a
 * half), two corrugations of each sheet drawn in relief so the profile reads at range; a sheet now and then a cleaner
 * replacement or rust run down from its lap.
 */
const IRON: RoofRelief = { kind: 'sheet', ribs: 2 };

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/** The base's reach (ctx.bounds): its size, centre and edges. A kit body sized from it opens no lane beside it. */
function reach(ctx: RegionalBuildContext): { W: number; D: number; cx: number; cz: number; x0: number; x1: number; z0: number; z1: number } {
  const b = ctx.bounds;
  return { W: b.maxX - b.minX, D: b.maxZ - b.minZ, cx: (b.maxX + b.minX) / 2, cz: (b.maxZ + b.minZ) / 2, x0: b.minX, x1: b.maxX, z0: b.minZ, z1: b.maxZ };
}

const mix3 = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * The rust on a painted or galvanised steel part, by height (the corner's y in the building frame): bleeding up from
 * its foot, a patch here and there higher up. A colourAt for coloured parts (geometry.ts EmitOptions).
 */
function rustBy(base: Rgb, y0: number, y1: number, foot: number, head = 0): (p: Vec3) => Rgb {
  return (p) => {
    const t = Math.min(1, Math.max(0, (p[1] - y0) / Math.max(0.01, y1 - y0)));
    return mix3(base, t < 0.5 ? RUST : RUST_DARK, Math.min(0.85, foot * Math.pow(1 - t, 1.6) + head * Math.pow(t, 3)));
  };
}

/**
 * Corrugated iron weathered as the west coast weathers it (round 2, the gauntlet's wave 117: "pristine corrugated iron
 * and brickwork, no rust, staining or weathering"): a skin of vertical strips on the four sides of a box of cladding,
 * each strip its own run of rust up from the sheets' feet, a few with a stain down from the lap at the top. Dressing a
 * hair proud of the clad wall, so the wall's collision is untouched.
 */
function rustSkin(sink: PartSink, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, base: Rgb, look: () => number,
  cuts: ReadonlyArray<{ face: number; u0: number; u1: number; y0: number; y1: number } | null> = []): void {
  const faces: Face[] = [
    { origin: [(x0 + x1) / 2, 0, z1], u: [1, 0, 0], out: [0, 0, 1], width: x1 - x0 },
    { origin: [x1, 0, (z0 + z1) / 2], u: [0, 0, -1], out: [1, 0, 0], width: z1 - z0 },
    { origin: [(x0 + x1) / 2, 0, z0], u: [-1, 0, 0], out: [0, 0, -1], width: x1 - x0 },
    { origin: [x0, 0, (z0 + z1) / 2], u: [0, 0, 1], out: [-1, 0, 0], width: z1 - z0 },
  ];
  for (const f of faces) {
    const n = Math.max(2, Math.min(12, Math.round(f.width / 1.4)));
    for (let k = 0; k < n; k++) {
      const u = -f.width / 2 + (k + 0.5) * f.width / n;
      const opts = { colour: base, colourAt: rustBy(base, y0, y1, 0.18 + look() * 0.5, look() < 0.35 ? 0.2 + look() * 0.35 : 0), decor: true };
      // (a sheet over openings cut through the wall — the clerestory's glazing, a door — stops round them: the panel in
      // bands at the cuts' sills and heads, each band's runs between the cuts across it)
      const pu0 = u - f.width / n / 2, pu1 = u + f.width / n / 2;
      const fi = faces.indexOf(f);
      const mine = cuts.filter((h): h is NonNullable<typeof h> => !!h && h.face === fi && h.u0 < pu1 && h.u1 > pu0);
      const piece = (a: number, b: number, ya: number, yb: number) => {
        if (b - a > 0.01 && yb - ya > 0.01) faceBox(sink, 'structureMetal', f, (a + b) / 2, (ya + yb) / 2, 0.008, b - a, yb - ya, 0.004, opts);
      };
      const ys = [...new Set([y0, y1, ...mine.flatMap((h) => [Math.max(y0, Math.min(y1, h.y0)), Math.max(y0, Math.min(y1, h.y1))])])].sort((p, q) => p - q);
      for (let i = 0; i + 1 < ys.length; i++) {
        const ya = ys[i], yb = ys[i + 1];
        let from = pu0;
        for (const h of mine.filter((c) => c.y0 <= ya + 1e-6 && c.y1 >= yb - 1e-6).sort((p, q) => p.u0 - q.u0)) {
          piece(from, Math.min(pu1, h.u0), ya, yb);
          from = Math.max(from, h.u1);
        }
        piece(from, pu1, ya, yb);
      }
    }
  }
}

/** A prism whose near cap (at `pts`) faces out along -dir, its points wound to suit whichever way they were listed. (dome-detail-275) */
function prismOut(sink: PartSink, bucket: RegionalBucket, pts: Vec3[], dir: Vec3, depth: number, opts: Parameters<PartSink['prism']>[4]): void {
  const [a, b, c] = pts, e: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], f: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]];
  sink.prism(bucket, n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] < 0 ? [...pts].reverse() : pts, dir, depth, opts);
}

/**
 * (dome-detail-275) A light cut through clad sheet: its glass at the back of the reveal `back` in, its mullions every
 * `pitch` and a transom in a tall one (fine joinery), the flashing over its sill.
 */
interface CutRect { u0: number; u1: number; y0: number; y1: number }
function cutLight(sink: PartSink, f: Face, c: CutRect, bar: Rgb, back: number, pitch = 1.3): void {
  const w = c.u1 - c.u0, hh = c.y1 - c.y0, um = (c.u0 + c.u1) / 2, ym = (c.y0 + c.y1) / 2;
  facePanel(sink, 'glass', f, um, ym, -back + 0.012, w, hh, { decor: true, window: f.out });
  const nm = Math.max(2, Math.round(w / pitch));
  for (let j = 1; j < nm; j++) faceBox(sink, 'structureMetal', f, c.u0 + w * j / nm, ym, -back + 0.035, 0.05, hh, 0.04, { colour: bar, decor: true, fine: true }, 'caps');
  if (hh > 1.2) faceBox(sink, 'structureMetal', f, um, ym, -back + 0.035, w, 0.05, 0.04, { colour: bar, decor: true, fine: true }, 'ends');
  faceBox(sink, 'structureMetal', f, um, c.y0 - 0.03, 0.04, w + 0.1, 0.06, 0.08, { colour: shade(bar, 1.3), decor: true });
}

const SASH = (frame: Rgb): WindowStyle => ({ frame, frameWidth: 0.07, frameOut: 0.05, bars: 'two', surround: null, sill: { bucket: 'structureWood', out: 0.06, colour: frame }, shutters: null });

function dialectOf(rng: () => number, trim: Rgb, door: Rgb, lit = 0.35, lintel = false): HouseDialect {
  const style = SASH(trim);
  return {
    window: (s, face, o, y0) => {
      windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, o.kind === 'loft' ? { ...style, bars: 'none', sill: null } : style, rng, o.kind === 'loft' ? 0 : lit);
      // a brick building's segmental arch over each window: a soldier course a shade darker
      if (lintel) faceBox(s, BRICK, face, o.u, y0 + o.y0 + o.h + 0.14, 0.03, o.w + 0.3, 0.26, 0.06, { decor: true, fineSides: true, shade: 0.8 });
    },
    door: (s, face, o, y0, frame) => {
      if (o.kind === 'gate') { gateUnit(s, face, o.u, y0 + o.y0, o.w, o.h, shade(STEEL, 1.2), { bucket: 'structureMetal', width: 0.2, out: 0.06, colour: STEEL }); return; }
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: door, frame: { bucket: 'structureWood', width: 0.1, out: 0.05, colour: trim }, steps: { bucket: CONCRETE },
        leafKind: rng() < 0.5 ? 'panel' : 'glazed', transom: lintel }, frame.floors[o.storey] + o.y0);
    },
  };
}

/**
 * The headframe (a gantry plot): the steel headframe over a North Lyell shaft and its winding works. (Round 3, gauntlet
 * wave 132: the old gantry "a flat-shaded dark gantry crane built from plain boxes, with no sheave wheels, back-legs,
 * rivets or rust", and round 2's slender ladder of girts read as a mast.) A four-legged tower battered in toward its
 * sheave deck, girts and crossed diagonals in every panel of all four faces; the two spoked sheave wheels on their
 * pedestals over the deck; the pair of back-legs raking down toward the winding house, braced to each other and strutted
 * to the tower; the skip at the tipple, its chute down to the timber ore bin standing between the tower and the
 * back-legs' feet; the winding house of corrugated iron at the reach's far end, the ropes running from the sheaves'
 * heads down to its drum and from their shaft side down into the collar.
 */
const headframe: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the works fill the old gantry's reach (its bounds, which stand off the plot's centre)
  const R = reach(ctx);
  const L = Math.max(14, R.W - 0.4), Dd = Math.max(4.2, R.D - 0.4);
  const H = 22 + rng() * 5, steel = pick(rng, [rgb(0x3a4246), rgb(0x2f3a3e), rgb(0x6e3426)]);
  // (round 2: the headframe's steel weathered — rust bleeding up the legs from the collar, patches on the braces)
  const rusted = { colour: steel, colourAt: rustBy(steel, 0, H, 0.55, 0.15) };
  const lattice = { ...rusted, decor: true, exposed: true };
  // the tower: its legs' half-spread across the reach (x) and its depth (z), at the collar and under the deck
  const tx = -L / 2 + 2.9, bx0 = 2.3, bz0 = Math.min(1.95, Dd / 2 - 0.25), bx1 = 1.45, bz1 = Math.min(1.25, bz0 - 0.35);
  const at = (sx: number, sz: number, y: number): Vec3 => {
    const f = y / H;
    return [tx + sx * (bx0 + (bx1 - bx0) * f), y, sz * (bz0 + (bz1 - bz0) * f)];
  };
  const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  sink.placed(0, R.cx, 0, R.cz, () => {
    // the collar: the shaft's concrete head under the legs
    sink.span(CONCRETE, tx - bx0 - 0.5, -0.4, -bz0 - 0.45, tx + bx0 + 0.5, 0.6, bz0 + 0.45);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      sink.member('structureMetal', at(sx, sz, 0.6), at(sx, sz, H), 0.34, 0.34, [1, 0, 0], { ...rusted, exposed: true }, 0);
    }
    // six panels: a girt round the tower at each level, a crossed pair of diagonals in every panel of every face
    const levels: number[] = [];
    for (let k = 0; k <= 6; k++) levels.push(0.6 + (H - 0.6) * k / 6);
    for (let i = 1; i < levels.length; i++) {
      const y0 = levels[i - 1], y = levels[i];
      for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]] as const) {
        sink.member('structureMetal', at(a[0], a[1], y), at(b[0], b[1], y), 0.16, 0.16, [0, 1, 0], lattice, 0);
      }
      for (const sz of [-1, 1]) {
        sink.member('structureMetal', at(-1, sz, y0), at(1, sz, y), 0.1, 0.1, [0, 0, sz], lattice, 0);
        sink.member('structureMetal', at(1, sz, y0), at(-1, sz, y), 0.1, 0.1, [0, 0, sz], lattice, 0);
      }
      for (const sx of [-1, 1]) {
        sink.member('structureMetal', at(sx, -1, y0), at(sx, 1, y), 0.1, 0.1, [sx, 0, 0], lattice, 0);
        sink.member('structureMetal', at(sx, 1, y0), at(sx, -1, y), 0.1, 0.1, [sx, 0, 0], lattice, 0);
      }
    }
    // the sheave deck over the tower's head, reaching back over the back-legs' heads, its handrail on three sides
    const dx0 = tx - bx1 - 0.3, dx1 = tx + bx1 + 1.1, dz = bz1 + 0.35, deckY = H + 0.25;
    sink.span('structureMetal', dx0, H, -dz, dx1, deckY, dz, { ...rusted, decor: true });
    for (const y of [deckY + 0.55, deckY + 1.05]) {
      for (const sz of [-1, 1]) sink.member('structureMetal', [dx0, y, sz * dz], [dx1, y, sz * dz], 0.05, 0.05, [0, 0, sz], lattice, 0);
      sink.member('structureMetal', [dx0, y, -dz], [dx0, y, dz], 0.05, 0.05, [-1, 0, 0], lattice, 0);
    }
    for (const x of [dx0, (dx0 + dx1) / 2, dx1]) for (const sz of [-1, 1]) {
      sink.member('structureMetal', [x, deckY, sz * dz], [x, deckY + 1.1, sz * dz], 0.06, 0.06, [0, 0, sz], lattice, 0);
    }
    // (props census #3, lane B 2026-10-14) the tower recorded as an open frame: it falls as its members, the sheave deck
    // and wheels its crown (damage.ts lattice, a body beside the winding house)
    recordLattice(sink, ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sz]) => ({ foot: at(sx, sz, 0.6), head: at(sx, sz, H) })),
      levels.slice(1), 0.34, 'structureMetal', steel, { x0: dx0, x1: dx1, y0: H, y1: deckY + 0.5 + 3.5, z0: -dz, z1: dz, bucket: 'structureMetal', tint: steel });
    // the two sheave wheels side by side, each on an A-frame pedestal either side of its hub: a rim of twenty
    // segments and eight spokes, read against the sky from across the town
    const sr = 1.75, sx0 = tx + 0.3, sy = deckY + 0.5 + sr;
    const dark = shade(steel, 0.8);
    for (const wz of [-0.75, 0.75]) {
      for (const bz of [wz - 0.32, wz + 0.32]) for (const ex of [-0.95, 0.95]) {
        sink.member('structureMetal', [sx0 + ex, deckY, bz], [sx0, sy, bz], 0.12, 0.12, [0, 0, 1], lattice, 0);
      }
      sink.cylinder('structureMetal', [sx0, sy, wz - 0.4], 'z', 0.8, 0.17, 10, { colour: dark, decor: true });
      const segs = 20;
      for (let k = 0; k < segs; k++) {
        const a0 = k / segs * Math.PI * 2, a1 = (k + 1) / segs * Math.PI * 2;
        sink.member('structureMetal', [sx0 + Math.cos(a0) * sr, sy + Math.sin(a0) * sr, wz - 0.07], [sx0 + Math.cos(a1) * sr, sy + Math.sin(a1) * sr, wz - 0.07],
          0.17, 0.14, [0, 0, 1], { colour: dark, decor: true, exposed: true }, 0);
      }
      for (let k = 0; k < 8; k++) {
        const a = (k + 0.5) / 8 * Math.PI * 2;
        sink.member('structureMetal', [sx0 + Math.cos(a) * 0.15, sy + Math.sin(a) * 0.15, wz - 0.03], [sx0 + Math.cos(a) * (sr - 0.08), sy + Math.sin(a) * (sr - 0.08), wz - 0.03],
          0.07, 0.06, [0, 0, 1], { colour: dark, decor: true, exposed: true }, 0);
      }
    }
    // the back-legs: two raking struts from under the deck's back corners down to their footings toward the winding
    // house (they take the ropes' pull), a girt and a crossed pair between them in each third, a strut from each to the
    // tower at mid-height
    const fx = tx + 12.2, fz = Math.min(bz0 + 0.2, Dd / 2 - 0.5);
    const top = (sz: number): Vec3 => [tx + bx1 + 0.15, H - 0.3, sz * bz1];
    const foot = (sz: number): Vec3 => [fx, 0.3, sz * fz];
    const legAt = (sz: number, t: number) => lerp3(top(sz), foot(sz), t);
    for (const sz of [-1, 1]) {
      sink.member('structureMetal', top(sz), foot(sz), 0.4, 0.4, [0, 0, 1], { ...rusted, exposed: true }, 0);
      sink.span(CONCRETE, fx - 0.75, -0.4, sz * fz - 0.45, fx + 0.75, 0.5, sz * fz + 0.45);
    }
    const run = [foot(1)[0] - top(1)[0], foot(1)[1] - top(1)[1]], rl = Math.hypot(run[0], run[1]);
    const across: Vec3 = [-run[1] / rl, run[0] / rl, 0];
    const thirds = [0.06, 0.36, 0.66, 0.94];
    for (let i = 0; i < thirds.length; i++) {
      sink.member('structureMetal', legAt(-1, thirds[i]), legAt(1, thirds[i]), 0.14, 0.14, across, lattice, 0);
      if (i === 0) continue;
      sink.member('structureMetal', legAt(-1, thirds[i - 1]), legAt(1, thirds[i]), 0.09, 0.09, across, lattice, 0);
      sink.member('structureMetal', legAt(1, thirds[i - 1]), legAt(-1, thirds[i]), 0.09, 0.09, across, lattice, 0);
    }
    for (const sz of [-1, 1]) {
      const p = legAt(sz, 0.45);
      sink.member('structureMetal', p, at(1, sz, p[1]), 0.16, 0.16, [0, 1, 0], lattice, 0);
    }
    // the winding house of corrugated iron at the reach's far end, a gable roof; the drum's ropes come in high on its
    // tower-side wall
    const hx0 = fx + 1.0, hx1 = L / 2 - 0.2, hy = 6.2, sheet = pick(rng, IRON_SHEET);
    if (hx1 - hx0 > 3) {
      // (props census #3, lane B 2026-10-14; the judges: "ONE corrugated span box with rust decals, a slab gable and glass
      // faceBoxes standing proud: a red box with a black square") a framed engine house of corrugated iron: its walls
      // the sheet on its frame with the lap lines, windows and the door cut and framed, the rope ports high on its
      // tower-side end, a gable roof with its ridge vent, the boiler's stack through it
      sink.span(CONCRETE, hx0, -0.4, -Dd / 2, hx1, 0.4, Dd / 2);
      sink.placed(Math.PI / 2, (hx0 + hx1) / 2, 0.4, 0, () => {
        const hw = Dd, hd = hx1 - hx0;
        const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.4, y0: 0, h: 2.6 }];
        for (const face of ['left', 'right'] as const) {
          for (const o of windowRhythm(face, 0, hd, { w: 1.0, h: 1.2, sill: hy - 0.4 - 2.2, spacing: 2.0, margin: 0.9 })) openings.push(o);
        }
        for (const u of [-0.75, 0.75]) openings.push({ face: 'back', storey: 0, kind: 'window', u, w: 0.35, y0: hy - 0.4 - 1.5, h: 0.35 });
        sink.paint = sheet;
        let frame: ReturnType<typeof buildHouse>;
        try {
          frame = buildHouse(sink, {
            w: hw, d: hd, plinth: null, storeys: [{ h: hy - 0.4, wall: 'structureMetal' }],
            roof: { kind: 'gable', pitchDeg: 22, eave: 0.3, verge: 0.25, thickness: 0.06, bucket: 'roof', ridge: 'saddle', relief: IRON }, gableBucket: 'structureMetal',
            openings, chimneys: [], gutters: null, verge: null, reveal: 0.12,
          }, {
            window: (s2, face, o, y0) => {
              if (o.w < 0.5) return; // the rope ports: open, the ropes through them
              windowUnit(s2, face, o.u, y0 + o.y0, o.w, o.h, { frame: rgb(0x8a8478), frameWidth: 0.06, frameOut: 0.04, bars: 'six', surround: null, sill: { bucket: 'structureMetal', out: 0.06, colour: shade(sheet, 0.7) }, shutters: null }, rng, 0.1);
            },
            door: (s2, face, o, y0) => doorUnit(s2, face, o.u, y0 + o.y0, o.w, o.h, { leaf: shade(sheet, 0.8), frame: { bucket: 'structureMetal', width: 0.1, out: 0.05, colour: shade(sheet, 0.7) }, steps: null, leafKind: 'plank' }),
          });
        } finally { sink.paint = null; }
        sink.dressing(ctx.tier === 'mobile', () => {
          // the sheets' laps and the frame's corner angles
          for (const name of ['front', 'back', 'left', 'right'] as const) {
            const f = frame.faces[name];
            for (let y = 0.4 + 0.9; y < hy - 0.5; y += 0.9) faceBox(sink, 'structureMetal', f, 0, y, 0.012, f.width, 0.03, 0.012, { colour: shade(sheet, 0.82), decor: true, fine: true });
            for (const u of [-f.width / 2 + 0.03, f.width / 2 - 0.03]) faceBox(sink, 'structureMetal', f, u, (hy - 0.4) / 2 + 0.2, 0.025, 0.08, hy - 0.4, 0.05, { colour: shade(sheet, 0.75), decor: true });
          }
        });
        // (dome-detail-275) the house's iron weathered as the mill's is: each sheet its own run of rust up from its foot,
        // the skin stopping round the door, the lights and the rope ports
        rustSkin(sink, -hw / 2, 0, -hd / 2, hw / 2, hy - 0.4, hd / 2, sheet, look, openings.map((o) => ({
          face: o.face === 'front' ? 0 : o.face === 'right' ? 1 : o.face === 'back' ? 2 : 3, u0: o.u - o.w / 2, u1: o.u + o.w / 2, y0: o.y0, y1: o.y0 + o.h })));
        // the ridge vent along the roof, the boiler's stack through it
        const rg = frame.roof;
        sink.span('structureMetal', -0.35, rg.ridgeTopY - 0.05, -hd * 0.3, 0.35, rg.ridgeTopY + 0.4, hd * 0.3, { colour: shade(sheet, 0.9), decor: true });
        sink.span('structureMetal', -0.55, rg.ridgeTopY + 0.4, -hd * 0.3 - 0.1, 0.55, rg.ridgeTopY + 0.48, hd * 0.3 + 0.1, { colour: shade(sheet, 0.8), decor: true });
        sink.cylinder('structureMetal', [hw * 0.22, 0, hd * 0.25], 'y', rg.ridgeTopY + 3.2, 0.22, 8, { colour: rgb(0x3a3634) });
        // (dome-detail-275) the stack's flashing collar on the roof, its bands and its cap, guyed to the eaves
        const stTop = rg.ridgeTopY + 3.2, stCol = { colour: rgb(0x3a3634), colourAt: rustBy(rgb(0x3a3634), hy - 0.4, stTop, 0.25, 0.35), decor: true };
        sink.cylinder('structureMetal', [hw * 0.22, rg.ridgeTopY - 0.75, hd * 0.25], 'y', 0.5, 0.42, 8, stCol, 0.24);
        for (const y of [stTop - 2.2, stTop - 0.9]) sink.cylinder('structureMetal', [hw * 0.22, y, hd * 0.25], 'y', 0.08, 0.245, 8, stCol, 0.245, false);
        sink.cylinder('structureMetal', [hw * 0.22, stTop, hd * 0.25], 'y', 0.22, 0.34, 8, stCol, 0.3);
        for (const [gx, gz] of [[hw / 2, hd / 2], [-hw / 2, hd / 2], [hw / 4, -hd / 2]] as const) {
          const l = Math.hypot(gx - hw * 0.22, gz - hd * 0.25);
          sink.pipe('structureMetal', [hw * 0.22 + (gx - hw * 0.22) / l * 0.22, stTop - 1.0, hd * 0.25 + (gz - hd * 0.25) / l * 0.22], [gx, hy - 0.35, gz], 0.015, 3, { colour: BLACK, decor: true, fine: true });
        }
      });
      // the ropes: over each sheave's head and down to the drum through the house's tower-side wall, and from each
      // sheave's shaft side straight down the tower into the collar
      for (const wz of [-0.75, 0.75]) {
        sink.member('structureMetal', [sx0 + sr * 0.5, sy + sr * 0.86, wz], [hx0 + 0.05, hy - 1.2, wz * 0.8], 0.045, 0.045, [0, 0, 1], { colour: BLACK, decor: true, exposed: true }, 0);
        sink.member('structureMetal', [sx0 - sr, sy, wz], [sx0 - sr, 0.6, wz], 0.045, 0.045, [0, 0, 1], { colour: BLACK, decor: true, exposed: true }, 0);
      }
    }
    // the ore bin: a timber hopper on posts between the tower and the back-legs' feet, its sloped bottom and its iron
    // roof, the skip at the tipple in the tower and the chute down from it to the bin
    const ox0 = tx + bx0 + 1.1, ox1 = Math.min(fx - 1.6, ox0 + 4.6), oz = Math.min(1.8, Dd / 2 - 0.3), by = 4.4, bh = 3.0;
    const oc = (ox0 + ox1) / 2, timber = pick(look, [TIMBER, TIMBER_GREY]);
    for (const x of [ox0 + 0.25, ox1 - 0.25]) for (const z of [-oz + 0.25, oz - 0.25]) sink.span('structureWood', x - 0.18, -0.3, z - 0.18, x + 0.18, by, z + 0.18, { colour: TIMBER });
    sink.span('structureWood', ox0, by, -oz, ox1, by + bh, oz, { colour: timber });
    for (let x = ox0 + 0.9; x < ox1 - 0.4; x += 0.9) faceBox(sink, 'structureWood', { origin: [0, 0, oz], u: [1, 0, 0], out: [0, 0, 1], width: L }, x, by + bh / 2, 0.03, 0.12, bh, 0.06, { colour: shade(timber, 0.75), decor: true });
    // (props census #3, lane B 2026-10-14) its planking in courses on every face, each board its own tone, and the chute's
    // gate under the hopper's mouth on its iron rack
    sink.dressing(ctx.tier === 'mobile', () => {
      const bins: Face[] = [{ origin: [oc, 0, oz], u: [1, 0, 0], out: [0, 0, 1], width: ox1 - ox0 }, { origin: [oc, 0, -oz], u: [-1, 0, 0], out: [0, 0, -1], width: ox1 - ox0 },
        { origin: [ox1, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: 2 * oz }, { origin: [ox0, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: 2 * oz }];
      for (const f of bins) for (let y = by + 0.12; y < by + bh - 0.05; y += 0.24) {
        faceBox(sink, 'structureWood', f, 0, y, 0.012, f.width - 0.04, 0.2, 0.024, { colour: shade(timber, 0.88 + look() * 0.2), decor: true, fine: true }, { ends: true });
      }
      sink.member('structureWood', [oc, by - 1.2, 0], [oc, by - 2.0, oz + 0.6], 0.8, 0.06, [0, 1, 0], { colour: shade(timber, 0.8), decor: true, exposed: true }, 0);
      sink.span('structureMetal', oc - 0.45, by - 1.45, -0.05, oc + 0.45, by - 1.2, 0.05, { colour: shade(steel, 1.1), decor: true });
      for (const dx of [-0.38, 0.38]) sink.span('structureMetal', oc + dx - 0.03, by - 1.9, -0.03, oc + dx + 0.03, by - 1.2, 0.03, { colour: shade(steel, 1.1), decor: true, fine: true });
    });
    sink.prism('structureWood', [[oc - 0.5, by - 1.2, -oz], [oc + 0.5, by - 1.2, -oz], [ox1, by, -oz], [ox0, by, -oz]], [0, 0, 1], oz * 2, { colour: shade(timber, 0.9), decor: true });
    // (dome-detail-275: it was a flat slab) the bin's iron roof pitched over it, its gables boarded
    const binRoof = pick(look, IRON_SHEET), rise = 0.9, binTop = by + bh;
    for (const sz of [-1, 1]) {
      const sl = Math.hypot(rise, oz + 0.25), n: Vec3 = [0, (oz + 0.25) / sl, sz * rise / sl];
      sink.member('structureMetal', [oc, binTop + rise + 0.04, 0], [oc, binTop - 0.04, sz * (oz + 0.25)], ox1 - ox0 + 0.4, 0.06, n, { colour: binRoof, colourAt: rustBy(binRoof, binTop, binTop + rise, 0.3), decor: true, exposed: true }, 0);
    }
    for (const x of [ox0, ox1]) prismOut(sink, 'structureWood', [[x, binTop, -oz], [x, binTop, oz], [x, binTop + rise, 0]], [x === ox0 ? 1 : -1, 0, 0], 0.06, { colour: shade(timber, 0.85), decor: true });
    const tipY = Math.min(H - 6, by + bh + 2.6);
    sink.span('structureMetal', tx - 0.55, tipY - 0.9, -0.55, tx + 0.55, tipY + 0.9, 0.55, { colour: shade(steel, 1.15), decor: true });
    // (the connectivity sweep: the skip hung in the tower's middle on nothing, the chute a metre off it) the skip runs in
    // its guides, two steel rails up the shaft from the collar past the tipple, tied to the girts by buntons; the chute
    // from the skip's lip
    const guideTop = tipY + 2.2;
    for (const sz of [-1, 1]) {
      sink.member('structureMetal', [tx, 0.6, sz * 0.55], [tx, guideTop, sz * 0.55], 0.14, 0.08, [0, 0, sz], lattice, 0);
      for (const y of levels) if (y > 1 && y < guideTop) {
        const bz = bz0 + (bz1 - bz0) * y / H;
        sink.member('structureMetal', [tx, y, sz * 0.55], [tx, y, sz * bz], 0.1, 0.1, [0, 1, 0], lattice, 0);
      }
    }
    sink.member('structureMetal', [tx + 0.45, tipY - 0.6, 0], [ox0 + 0.4, by + bh + 0.1, 0], 0.9, 0.18, [0, 1, 0], { colour: shade(steel, 1.1), decor: true, exposed: true }, 0);
    // (dome-detail-275) the bin's posts braced: a girt round them under the hopper and a cross of timbers in each long
    // face; the tram road under its mouth, a side-tipping ore truck on it
    for (const z of [-oz + 0.25, oz - 0.25]) {
      const zo = z + Math.sign(z) * 0.2;
      sink.member('structureWood', [ox0 + 0.25, by - 1.0, zo], [ox1 - 0.25, by - 1.0, zo], 0.18, 0.12, [0, 0, Math.sign(z)], { colour: shade(TIMBER, 0.9), decor: true }, 0.02);
    }
    for (const x of [ox0 + 0.25, ox1 - 0.25]) {
      const xo = x + (x < oc ? -0.2 : 0.2), sx = x < oc ? -1 : 1;
      sink.member('structureWood', [xo, 0.1, -oz + 0.25], [xo, by - 1.1, oz - 0.25], 0.14, 0.1, [sx, 0, 0], { colour: shade(TIMBER, 0.85), decor: true }, 0.02);
      sink.member('structureWood', [xo, 0.1, oz - 0.25], [xo, by - 1.1, -oz + 0.25], 0.14, 0.1, [sx, 0, 0], { colour: shade(TIMBER, 0.85), decor: true }, 0.02);
    }
    for (const rx of [-0.38, 0.38]) sink.span('structureMetal', oc + rx - 0.035, 0, -Dd / 2 + 0.1, oc + rx + 0.035, 0.12, Dd / 2 - 0.1, { colour: STEEL, decor: true });
    for (let z = -Dd / 2 + 0.3; z < Dd / 2 - 0.1; z += 0.7) sink.span('structureWood', oc - 0.65, -0.02, z - 0.1, oc + 0.65, 0.05, z + 0.1, { colour: shade(TIMBER_GREY, 0.7), decor: true, fine: true });
    {
      const wz = (look() - 0.5) * Math.max(0, Dd - 3.4), wagon = pick(look, [rgb(0x5a3a2a), STEEL, rgb(0x6a5a48)]);
      for (const dz of [-0.45, 0.45]) for (const rx of [-0.38, 0.38]) sink.cylinder('structureMetal', [oc + rx - 0.04, 0.24, wz + dz], 'x', 0.08, 0.2, 8, { colour: BLACK, decor: true });
      sink.span('structureMetal', oc - 0.42, 0.36, wz - 0.75, oc + 0.42, 0.48, wz + 0.75, { colour: shade(wagon, 0.7), decor: true });
      sink.prism('structureMetal', [[oc - 0.6, 0.48, wz - 0.7], [oc + 0.6, 0.48, wz - 0.7], [oc + 0.75, 1.25, wz - 0.7], [oc - 0.75, 1.25, wz - 0.7]], [0, 0, 1], 1.4, { colour: wagon, colourAt: rustBy(wagon, 0.48, 1.25, 0.5), decor: true });
      sink.revolve('structureWood', [oc, 1.2, wz], 'y', [[0, 0.62], [0.22, 0.4], [0.32, 0]], 8, { colour: ORE, decor: true });
    }
    // (dome-detail-275) the ladder up the tower's back face to the sheave deck: its stiles on stand-offs from the girts,
    // its rungs (fine), a rest landing every second panel; the landing at the tipple with its rail
    {
      const bzAt = (y: number) => bz0 + (bz1 - bz0) * y / H;
      const lad = { colour: shade(steel, 1.1), decor: true, exposed: true };
      for (const dx of [-0.22, 0.22]) {
        sink.member('structureMetal', [tx + dx, 0.6, -bzAt(0.6) - 0.32], [tx + dx, deckY, -bzAt(deckY) - 0.32], 0.06, 0.05, [0, 0, -1], lad, 0);
        for (const y of levels.slice(1)) sink.member('structureMetal', [tx + dx, y, -bzAt(y)], [tx + dx, y, -bzAt(y) - 0.34], 0.05, 0.05, [1, 0, 0], { ...lad, fine: true }, 0);
      }
      for (let y = 0.9; y < deckY - 0.1; y += 0.42) {
        sink.member('structureMetal', [tx - 0.22, y, -bzAt(y) - 0.32], [tx + 0.22, y, -bzAt(y) - 0.32], 0.03, 0.03, [0, 0, -1], { ...lad, fine: true }, 0);
      }
      for (const y of [levels[2], levels[4]]) {
        const z = -bzAt(y);
        sink.span('structureMetal', tx - 0.7, y - 0.06, z - 0.95, tx + 0.7, y, z - 0.02, { colour: shade(steel, 1.05), decor: true });
        sink.member('structureMetal', [tx - 0.7, y + 1.0, z - 0.95], [tx + 0.7, y + 1.0, z - 0.95], 0.05, 0.05, [0, 0, -1], lad, 0);
        for (const x of [tx - 0.7, tx + 0.7]) sink.member('structureMetal', [x, y, z - 0.95], [x, y + 1.0, z - 0.95], 0.05, 0.05, [0, 0, -1], lad, 0);
      }
      // the tipple's landing on the tower's bin side, under the skip's lip, its rail on the open sides
      const tY = tipY - 1.0, tx0 = tx + bx0 + (bx1 - bx0) * tY / H, tw = Math.min(bzAt(tY) - 0.05, 1.1);
      sink.span('structureMetal', tx0 - 0.05, tY - 0.08, -tw, tx0 + 1.2, tY, tw, { colour: shade(steel, 1.05), decor: true });
      for (const z of [-tw, tw]) {
        sink.member('structureMetal', [tx0, tY + 1.0, z], [tx0 + 1.2, tY + 1.0, z], 0.05, 0.05, [0, 0, Math.sign(z)], lad, 0);
        sink.member('structureMetal', [tx0 + 1.2, tY, z], [tx0 + 1.2, tY + 1.0, z], 0.05, 0.05, [0, 0, Math.sign(z)], lad, 0);
      }
    }
    // ore spilled under the bin's door
    if (ctx.tier !== 'mobile') sink.cylinder('structureWood', [oc, 0, 0], 'y', 0.6, 1.5, 9, { colour: ORE, decor: true }, 0.3);
  });
  return sink.finish();
};

/**
 * The concentrator (a factory plot): three corrugated sections stepping down the reach, tallest at the back, each
 * under a monitor roof louvred along its sides; the sides' glazing bands cut through the cladding, the street front's
 * wagon door, man door and glazing band (the casing buried in the top section is gone); on a wide reach the thickener in
 * its own yard beside the front section,
 * its rake bridge from the mill to the feed well with the drive head over it and the launder along it, the wet ring
 * round the tank. (dome-detail-275: "stepped sheds of blank sheet with clerestory strips") Each section's gables closed
 * in sheet; a row of tall lights cut down every side under the band; the step faces glazed over the roofs below; the
 * crusher house raised over the top section's back end, its lights cut and its own gable roof; gutters and downpipes;
 * the steel stack guyed to the roof; the siding's rails running in at the wagon door.
 */
const concentrator: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the mill fills the old factory's reach (its bounds)
  const R = reach(ctx);
  const W = Math.max(8, R.W - 0.6), D = Math.max(12, R.D - 0.6);
  const sheet = pick(rng, IRON_SHEET);
  const steps = [[1.0, 15.0], [0.66, 10.5], [0.33, 6.5]] as const;
  // (dome-detail-275) the sections', the monitors' and the crusher house's iron in relief
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 14, eave: 0.35, verge: 0.2, thickness: 0.06, bucket: 'roof', ridge: 'saddle', relief: IRON };
  const tan14 = Math.tan(14 * Math.PI / 180);
  const cut = 0.2, back = 0.15;
  const glaze = (f: Face, c: CutRect, bar: Rgb, pitch = 1.3) => cutLight(sink, f, c, bar, back, pitch);
  sink.placed(0, R.cx, 0, R.cz, () => {
    sink.span(CONCRETE, -W / 2 - 0.1, -0.4, -D / 2 - 0.1, W / 2 + 0.1, 0.6, D / 2 + 0.1);
    const sec = D / 3;
    // (props census #13, lane B 2026-10-15) the thickener's yard: the front section stops short of the reach's +x side
    // on a wide reach (the tank stood buried inside the front section)
    const yard = W >= 11 ? Math.min(6.4, Math.max(4.4, W * 0.36)) : 0;
    const xEnd = (k: number) => (k === 2 ? W / 2 - yard : W / 2);
    steps.forEach(([, h], k) => {
      const z0 = -D / 2 + k * sec, z1 = z0 + sec, x0 = -W / 2, x1 = xEnd(k), wk = x1 - x0, cx = (x0 + x1) / 2;
      const tone = shade(sheet, 1 - k * 0.04), bar = shade(sheet, 0.6);
      // the sides' glazing bands cut through the cladding into the mill's dark (were glass laid on solid sheet): the
      // glass and its mullions at the back of the reveal, a flashing over the sill
      const band = { u0: -(sec - 1.4) / 2, u1: (sec - 1.4) / 2, y0: h - 2.1, y1: h - 1.1 };
      // (dome-detail-275) the row of tall lights down each side under the band
      const nl = Math.max(2, Math.round((sec - 1.4) / 2.8));
      const lows = Array.from({ length: nl }, (_, j) => {
        const u = -(sec - 1.4) / 2 + (sec - 1.4) * (j + 0.5) / nl;
        return { u0: u - 0.55, u1: u + 0.55, y0: 2.0, y1: Math.min(3.9, h - 2.6) };
      });
      const sides: Face[] = [1, -1].map((side) => ({ origin: [side > 0 ? x1 : x0, 0, (z0 + z1) / 2], u: [0, 0, -side], out: [side, 0, 0], width: sec }));
      // the street front (the front section's gable end): the ore-wagon door, the man door and the glazing band cut
      // through it (props census #13, lane B 2026-10-15; the judges: "there are no doors and no openings ... blank gables")
      const street = k === 2, ff: Face = { origin: [cx, 0, z1], u: [1, 0, 0], out: [0, 0, 1], width: wk - 2 * cut };
      const wagon = { u0: -wk * 0.18 - Math.min(1.8, wk * 0.15), u1: -wk * 0.18 + Math.min(1.8, wk * 0.15), y0: 0.6, y1: 4.2 };
      const man = { u0: wk * 0.3 - 0.5, u1: wk * 0.3 + 0.5, y0: 0.6, y1: 2.75 };
      const fband = { u0: -wk / 2 + 1.0, u1: wk / 2 - 1.0, y0: h - 2.1, y1: h - 1.1 };
      // (dome-detail-275) a step's face over the roof below glazed in two runs either side of that roof's monitor
      let stepCuts: Array<{ u0: number; u1: number; y0: number; y1: number }> = [];
      if (!street) {
        const xn0 = -W / 2, xn1 = xEnd(k + 1), cxn = (xn0 + xn1) / 2, rise = (xn1 - xn0) / 2 * tan14 + 0.06;
        const y0 = Math.max(steps[k + 1][1] + rise + 0.5, h - 2.4), y1 = h - 1.0;
        stepCuts = [[-wk / 2 + 1.0, cxn - 1.8 - cx], [cxn + 1.8 - cx, wk / 2 - 1.0]].filter(([a, b]) => b - a > 1.2).map(([a, b]) => ({ u0: a, u1: b, y0, y1 }));
      }
      const frontCuts = street ? [wagon, man, fband] : stepCuts;
      sink.span('structureMetal', x0 + cut, 0.6, z0, x1 - cut, h, z1 - cut, { colour: tone });
      for (const f of sides) holedPolygon(sink, 'structureMetal', f, [[-sec / 2, 0.6], [sec / 2, 0.6], [sec / 2, h], [-sec / 2, h]], [band, ...lows], cut, back + 0.02, { colour: tone });
      const hw = wk / 2 - cut;
      holedPolygon(sink, 'structureMetal', ff, [[-hw, 0.6], [hw, 0.6], [hw, h], [-hw, h]], frontCuts, cut, back + 0.02, { colour: tone });
      if (street) {
        // the wagon door's sheet leaf and the man door's steel leaf at the back of their cuts, the band's glass
        const leaf = shade(sheet, 0.72);
        faceBox(sink, 'structureMetal', ff, (wagon.u0 + wagon.u1) / 2, (wagon.y0 + wagon.y1) / 2, -back + 0.03, wagon.u1 - wagon.u0, wagon.y1 - wagon.y0, 0.04, { colour: leaf, decor: true });
        for (let x = wagon.u0 + 0.25; x < wagon.u1 - 0.1; x += 0.3) faceBox(sink, 'structureMetal', ff, x, (wagon.y0 + wagon.y1) / 2, -back + 0.06, 0.06, wagon.y1 - wagon.y0, 0.02, { colour: shade(leaf, 0.8), decor: true, fine: true }, 'caps');
        faceBox(sink, 'structureMetal', ff, (man.u0 + man.u1) / 2, (man.y0 + man.y1) / 2, -back + 0.03, 1.0, man.y1 - man.y0, 0.04, { colour: STEEL, decor: true });
        glaze(ff, fband, bar);
        // (dome-detail-275) the siding's rails running in through the wagon door
        const wu = (wagon.u0 + wagon.u1) / 2;
        for (const e of [-0.72, 0.72]) faceBox(sink, 'structureMetal', ff, wu + e, 0.65, 0.15, 0.08, 0.1, 0.6, { colour: STEEL, decor: true }, { back: true });
      } else for (const c of stepCuts) glaze(ff, c, bar);
      // (the rust skin's front panels are laid in the front face's own frame: u along +x from the section's middle)
      rustSkin(sink, x0, 0.6, z0, x1, h, z1, tone, ctx.variant, [{ face: 1, ...band }, { face: 3, ...band }, ...lows.flatMap((c) => [{ face: 1, ...c }, { face: 3, ...c }]),
        ...frontCuts.map((c) => ({ face: 0, ...c }))]);
      // (props census #13, lane B 2026-10-15) the section a body of its own for the damage reading: the steps break one by
      // one into their own heaps (the mill went down to the default kit's bounding-box spalls)
      recordBody(sink, cx, (z0 + z1) / 2, wk, sec, h, 'structureMetal');
      // the monitor roof: a raised clerestory along the section's ridge under its own low gable, its sides louvred: the
      // louvre bands cut through its cladding, the blades across them, the mill's dark behind (it was a solid box)
      sink.placed(0, cx, 0, (z0 + z1) / 2, () => emitRoof(sink, roofGeometry(wk, sec, h, roof), roof));
      const rg = roofGeometry(wk, sec, h, roof), my0 = rg.ridgeY - 0.3, my1 = rg.ridgeY + 1.2, mc = 0.15;
      // (dome-detail-275) the top section's monitor stops short of the crusher house over its back end
      const mz0 = k === 0 ? z0 + 4.4 : z0 + 0.6, mz1 = z1 - 0.6, ml = mz1 - mz0, mzc = (mz0 + mz1) / 2;
      const louvre = { u0: -(ml - 0.6) / 2, u1: (ml - 0.6) / 2, y0: rg.ridgeY + 0.15, y1: rg.ridgeY + 0.95 };
      sink.span('structureMetal', cx - 1.2 + mc, my0, mz0, cx + 1.2 - mc, my1, mz1, { colour: shade(sheet, 0.9) });
      for (const side of [1, -1]) {
        const mf: Face = { origin: [cx + side * 1.2, 0, mzc], u: [0, 0, -side], out: [side, 0, 0], width: ml };
        holedPolygon(sink, 'structureMetal', mf, [[-ml / 2, my0], [ml / 2, my0], [ml / 2, my1], [-ml / 2, my1]], [louvre], mc, 0.12, { colour: shade(sheet, 0.9) });
        for (let y = louvre.y0 + 0.08; y < louvre.y1 - 0.04; y += 0.16) {
          faceBox(sink, 'structureMetal', mf, 0, y, -0.06, louvre.u1 - louvre.u0 + 0.08, 0.03, 0.1, { colour: shade(sheet, 0.7), decor: true }, 'ends');
        }
      }
      const mrg = roofGeometry(2.4, ml, my1, roof);
      sink.placed(0, cx, 0, mzc, () => emitRoof(sink, mrg, roof));
      // (dome-detail-275) the gables closed in sheet: the section's front gable (and the top section's back one) over its
      // wall, the monitor's two ends
      for (const [zz, sz] of [[z1, 1], ...(k === 0 ? [[z0, -1]] : [])] as const) {
        prismOut(sink, 'structureMetal', [[x0, h, zz], [x1, h, zz], [cx, rg.ridgeY, zz]], [0, 0, -sz], cut, { colour: shade(tone, 0.95), decor: true });
      }
      for (const [zz, sz] of [[mz1, 1], [mz0, -1]] as const) {
        prismOut(sink, 'structureMetal', [[cx - 1.2, my1, zz], [cx + 1.2, my1, zz], [cx, mrg.ridgeY, zz]], [0, 0, -sz], 0.08, { colour: shade(sheet, 0.85), decor: true });
      }
      for (const f of sides) {
        glaze(f, band, bar);
        for (const c of lows) glaze(f, c, bar, 0.5);
        // (dome-detail-275) the gutter along the eave, a downpipe at each end of the side to the slab
        const gy = h - 0.35 * tan14 - 0.08;
        faceBox(sink, 'structureMetal', f, 0, gy, 0.42, sec + 0.3, 0.14, 0.14, { colour: shade(STEEL, 0.9), decor: true });
        for (const e of [-1, 1]) {
          const u = e * (sec / 2 - 0.35);
          sink.pipe('structureMetal', facePoint(f, u, 0.6, 0.12), facePoint(f, u, gy - 0.06, 0.12), 0.06, 6, { colour: shade(STEEL, 0.8), colourAt: rustBy(STEEL, 0.6, h, 0.5), decor: true });
          sink.pipe('structureMetal', facePoint(f, u, gy - 0.06, 0.12), facePoint(f, u, gy, 0.42), 0.06, 6, { colour: shade(STEEL, 0.8), decor: true });
        }
      }
      if (k === 0) {
        // (dome-detail-275) the crusher house over the top section's back end: taller than the mill, its front's two
        // lights cut through its sheet over the monitor, its own gable roof, its gables closed
        const hx = 2.5, hz0 = z0 + 0.25, hz1 = z0 + 4.0, hb = h - 0.4, ht = h + 5.4, hc = (hz0 + hz1) / 2, ht2 = shade(sheet, 0.86);
        sink.span('structureMetal', cx - hx, hb, hz0, cx + hx, ht, hz1 - cut, { colour: ht2, colourAt: rustBy(ht2, hb, ht, 0.3) });
        const hf: Face = { origin: [cx, 0, hz1], u: [1, 0, 0], out: [0, 0, 1], width: 2 * hx };
        const lights = [-1, 1].map((e) => ({ u0: e * 1.15 - 0.6, u1: e * 1.15 + 0.6, y0: ht - 2.4, y1: ht - 1.0 }));
        holedPolygon(sink, 'structureMetal', hf, [[-hx, hb], [hx, hb], [hx, ht], [-hx, ht]], lights, cut, back + 0.02, { colour: ht2 });
        for (const c of lights) glaze(hf, c, bar, 0.6);
        const hr = roofGeometry(2 * hx, hz1 - hz0, ht, roof);
        sink.placed(0, cx, 0, hc, () => emitRoof(sink, hr, roof));
        for (const [zz, sz] of [[hz1, 1], [hz0, -1]] as const) {
          prismOut(sink, 'structureMetal', [[cx - hx, ht, zz], [cx + hx, ht, zz], [cx, hr.ridgeY, zz]], [0, 0, -sz], cut, { colour: shade(ht2, 0.95), decor: true });
        }
        // the lap lines round it
        for (let y = hb + 1.0; y < ht - 0.3; y += 1.0) sink.span('structureMetal', cx - hx - 0.012, y, hz0 - 0.012, cx + hx + 0.012, y + 0.04, hz1 + 0.012, { colour: shade(ht2, 0.8), decor: true, fine: true });
      }
    });
    if (yard > 0) {
      // the thickener in its yard: the concrete tank, its copper rim, the slurry, the copper-green stain on the apron
      const tx = W / 2 - yard / 2, tz = D / 2 - sec / 2, rt = Math.min(2.3, yard / 2 - 0.35, sec / 2 - 0.35), top = 2.7;
      sink.cylinder(CONCRETE, [tx, 0.3, tz], 'y', top - 0.3, rt, 18, {}, rt, true);
      recordBody(sink, tx, tz, 2 * rt, 2 * rt, top, CONCRETE);
      sink.cylinder('structureMetal', [tx, top - 0.2, tz], 'y', 0.18, rt + 0.03, 18, { colour: COPPER, decor: true }, rt + 0.03, true);
      const ring = (r: number, y: number): Vec3[] => Array.from({ length: 18 }, (_, j) => [tx + Math.cos(-j / 18 * Math.PI * 2) * r, y, tz + Math.sin(-j / 18 * Math.PI * 2) * r]);
      sink.polygon('structureMetal', ring(rt - 0.2, top + 0.005), { colour: rgb(0x5d6458), decor: true });
      // (the wet ring kept on the apron: the slab's edge clips it)
      sink.polygon(CONCRETE, ring(Math.min(rt + 0.9, yard / 2 + 0.05, sec / 2 + 0.05), 0.605), { shade: 0.74, decor: true });
      // the rake bridge from the mill's side to the feed well and on to the far rim: its deck on bearers at the rims and
      // the well, the drive head over the well, the handrail along the walkway, the launder along the bridge from the
      // mill into the well
      const bx0 = W / 2 - yard, bx1 = tx + rt + 0.15, deck = top + 0.25, steel = { colour: STEEL };
      sink.span('structureMetal', bx0, deck, tz - 0.6, bx1, deck + 0.14, tz + 0.6, steel);
      for (const x of [tx - rt, tx + rt]) sink.span('structureMetal', x - 0.15, top - 0.02, tz - 0.5, x + 0.15, deck, tz + 0.5, steel);
      sink.cylinder('structureMetal', [tx, top, tz], 'y', deck - top, 0.6, 10, steel, 0.6, false);
      sink.span('structureMetal', tx - 0.45, deck + 0.14, tz - 0.45, tx + 0.45, deck + 0.8, tz + 0.45, { colour: shade(STEEL, 1.2) });
      const rail = { colour: STEEL, decor: true, exposed: true };
      for (const x of [bx0 + 0.3, (bx0 + tx - 0.5) / 2, tx - 0.55, tx + 0.55, bx1 - 0.2]) {
        sink.member('structureMetal', [x, deck + 0.14, tz - 0.55], [x, deck + 1.1, tz - 0.55], 0.05, 0.05, [0, 0, -1], rail, 0);
      }
      sink.member('structureMetal', [bx0 + 0.3, deck + 1.08, tz - 0.55], [bx1 - 0.2, deck + 1.08, tz - 0.55], 0.05, 0.05, [0, 0, -1], rail, 0);
      const wood = { colour: TIMBER, decor: true };
      sink.span('structureWood', bx0, deck + 0.14, tz + 0.05, tx - 0.45, deck + 0.2, tz + 0.55, wood);
      for (const z of [tz + 0.05, tz + 0.5]) sink.span('structureWood', bx0, deck + 0.2, z, tx - 0.45, deck + 0.5, z + 0.05, wood);
    }
    // a stack beside the top section (dome-detail-275: a steel stack on its flange, rust coming through the black, its
    // collar and cap, guyed to the roof)
    const stx = -W / 2 + 1.0, stz = -D / 2 + 1.2, sy0 = 15.0, sh = 6.4, top0 = steps[0][1];
    sink.revolve('structureMetal', [stx, sy0, stz], 'y', [[0, 0.62], [0.3, 0.62], [0.3, 0.45], [sh - 0.6, 0.41], [sh - 0.6, 0.5], [sh - 0.2, 0.5], [sh - 0.2, 0.44],
      [sh, 0.44], [sh, 0.34], [sh - 0.3, 0.34], [sh - 0.3, 0]], 12, { colour: BLACK, colourAt: rustBy(BLACK, sy0, sy0 + sh, 0.35, 0.25), decor: true });
    const roofAt = (x: number) => top0 + (W / 2 - Math.abs(x)) * Math.tan(14 * Math.PI / 180) + 0.06;
    for (const [ax, az] of [[stx + 2.6, stz], [stx, stz + 2.6], [stx + 0.9, stz - 0.95]] as const) {
      const l = Math.hypot(ax - stx, az - stz);
      sink.pipe('structureMetal', [stx + (ax - stx) / l * 0.42, sy0 + sh - 1.4, stz + (az - stz) / l * 0.42], [ax, roofAt(ax), az], 0.02, 3, { colour: BLACK, decor: true, fine: true });
    }
  });
  return sink.finish();
};

/**
 * The Empire Hotel or the company's office (a foundry office plot): two storeys of red brick under a hipped iron roof,
 * a two-storey verandah across the front on slender posts with cast-iron lace in its balustrade and frieze, the
 * name along a board over the verandah.
 */
const hotel: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the hotel fills the old office's reach (its bounds): its back on the back edge, the verandah's posts to the front
  const R = reach(ctx);
  const W = Math.max(9, R.W - 0.8), D = Math.max(8, R.D - 2.9);
  const trim = pick(rng, TRIM), roofPaint = pick(rng, ROOF_PAINT);
  sink.placed(0, R.cx, 0, R.z0 + 0.3 + D / 2, () => {
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.5, y0: 0, h: 2.5 }];
    for (let s = 0; s < 2; s++) for (const face of ['front', 'back', 'left', 'right'] as const) {
      for (const o of windowRhythm(face, s, face === 'front' || face === 'back' ? W : D, { w: 1.0, h: 2.0, sill: 0.8, spacing: 2.2, margin: 1.1,
        avoid: s === 0 && face === 'front' ? [[-1.2, 1.2]] : [] })) openings.push(o);
    }
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.6, out: 0.08, bucket: CONCRETE }, storeys: [{ h: 4.0, wall: BRICK }, { h: 3.6, wall: BRICK }],
      roof: { kind: 'hip', pitchDeg: 24, eave: 0.6, verge: 0.6, thickness: 0.1, bucket: 'roof', ridge: 'saddle', relief: IRON }, // (dome-detail-275) its iron in relief
      gableBucket: BRICK, openings, chimneys: [{ x: W * 0.28, z: -D * 0.2, sx: 0.6, sz: 0.6, above: 0.9, bucket: BRICK, cap: 'slab' }, { x: -W * 0.28, z: -D * 0.2, sx: 0.6, sz: 0.6, above: 0.9, bucket: BRICK, cap: 'slab' }],
      gutters: null, verge: null, reveal: 0.26, rafters: null,
    }, dialectOf(rng, trim, rgb(0x4a3a2e), 0.45, true));
    // the two-storey verandah across the front: posts, the ground floor's deck, the upper floor, the shed roof over it
    const depth = 2.4, f = frame.faces.front;
    const n = Math.max(3, Math.round(W / 2.4));
    const postU = (k: number) => -W / 2 + 0.2 + (W - 0.4) * k / n;
    for (let k = 0; k <= n; k++) faceBox(sink, 'structureWood', f, postU(k), 3.9, depth - 0.1, 0.14, 7.8, 0.14, { colour: trim });
    faceBox(sink, 'structureWood', f, 0, 0.52, depth / 2, W, 0.14, depth, { colour: TIMBER_GREY, decor: true });
    faceBox(sink, 'structureWood', f, 0, 4.0, depth / 2, W, 0.18, depth, { colour: TIMBER_GREY });
    // the cast iron lace (round 2, wave 117: "plain straight posts and rails with no cast-iron lace"): cream against the
    // dark posts, coarse enough to read across the street — in each bay of the upper balustrade a frame and a diagonal
    // lattice; under each verandah roof a valance of scallops between the posts; a bracket in each post's head
    const lo = { colour: LACE, decor: true };
    for (let k = 0; k < n; k++) {
      const u0 = postU(k) + 0.1, u1 = postU(k + 1) - 0.1, um = (u0 + u1) / 2, bw = u1 - u0;
      // the balustrade: top and bottom rails, the bay's lattice of crossing bars
      for (const y of [4.18, 5.0]) faceBox(sink, 'structureMetal', f, um, y, depth - 0.06, bw, 0.07, 0.05, lo);
      const m = Math.max(2, Math.round(bw / 0.55));
      for (let j = 0; j < m; j++) {
        const a = u0 + bw * j / m, b = u0 + bw * (j + 1) / m;
        sink.member('structureMetal', [f.origin[0] + a, 4.2, f.origin[2] + depth - 0.06], [f.origin[0] + b, 4.98, f.origin[2] + depth - 0.06], 0.045, 0.04, [0, 0, 1], { ...lo, exposed: true }, 0);
        sink.member('structureMetal', [f.origin[0] + b, 4.2, f.origin[2] + depth - 0.06], [f.origin[0] + a, 4.98, f.origin[2] + depth - 0.06], 0.045, 0.04, [0, 0, 1], { ...lo, exposed: true }, 0);
      }
      // the valances: a row of shallow scallops hung from each beam, under the upper floor and under the roof
      for (const yTop of [3.86, 7.72]) {
        faceBox(sink, 'structureMetal', f, um, yTop, depth - 0.06, bw, 0.08, 0.05, lo);
        const sc = Math.max(2, Math.round(bw / 0.7));
        for (let j = 0; j < sc; j++) {
          const a = u0 + bw * j / sc, b = u0 + bw * (j + 1) / sc, c = (a + b) / 2;
          for (const [p, q] of [[a, c], [c, b]] as const) {
            const dip = 0.22;
            sink.member('structureMetal', [f.origin[0] + p, yTop - (p === a ? 0.02 : dip), f.origin[2] + depth - 0.06],
              [f.origin[0] + q, yTop - (q === b ? 0.02 : dip), f.origin[2] + depth - 0.06], 0.05, 0.04, [0, 0, 1], { ...lo, exposed: true }, 0);
          }
        }
      }
    }
    // the brackets: a quarter-round web of lace in each post's head, both ways, under both floors
    for (let k = 0; k <= n; k++) for (const yTop of [3.86, 7.72]) for (const side of [-1, 1]) {
      const u = postU(k);
      if ((k === 0 && side < 0) || (k === n && side > 0)) continue;
      sink.member('structureMetal', [f.origin[0] + u, yTop - 0.55, f.origin[2] + depth - 0.06], [f.origin[0] + u + side * 0.5, yTop - 0.04, f.origin[2] + depth - 0.06],
        0.05, 0.04, [0, 0, 1], { ...lo, exposed: true }, 0);
    }
    // (dome-detail-275) the verandah's painted iron in relief
    const verandaRoof: RoofSpec = { kind: 'shed', pitchDeg: 10, eave: 0.15, verge: 0.15, thickness: 0.06, bucket: 'structureMetal', relief: IRON };
    sink.placed(-Math.PI / 2, 0, 0, D / 2 + depth / 2, () => emitRoof(sink, roofGeometry(depth, W, 7.8, verandaRoof), verandaRoof, roofPaint));
    // the name board over the verandah: a cream ground, the name in dark capitals (round 3: two dark bars read as a
    // blank board), a dark rule round it
    hotelNameBoard(sink, f, W, rng); // (looks r2 b-east, 2026-10-16: extracted to queenstownSign.ts, rebuilt there)
  });
  return sink.finish();
};

/**
 * The smelters' power house (a warehouse plot): a long hall of red brick on a concrete footing, tall round-arched
 * windows down its sides, a monitor roof of iron, and the stack behind it. (dome-detail-275: "a plain hall with a
 * clerestory and a tall plain stack; the long walls carry only flush windows") The windows' round heads cut through the
 * brick under their rubbed-brick rings and keystones, the bays parted by brick piers on their weathered offsets under a
 * corbelled eaves course; the gables coped and kneelered, a round light in each; the engine door under its steel lintel
 * and relieving arch; the monitor of iron, louvred; the stack on its corniced pedestal, banded, under its oversailing
 * crown and the soot; the boiler's feed tank and the coal heap at its foot.
 */
const powerHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the hall and its stack fill the old warehouse's reach (its bounds): the stack's base on the back edge
  const R = reach(ctx);
  const W = Math.max(10, R.W - 0.8), D = Math.max(16, R.D - 3.4), H = 8.5;
  sink.placed(0, R.cx, 0, R.z0 + 3.1 + D / 2, () => {
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'gate', u: 0, w: 3.6, y0: 0, h: 4.4 }];
    const tall = { w: 1.6, h: 4.2, sill: 1.6, spacing: 3.4, margin: 2.0 };
    for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, D, tall)) openings.push({ ...o, arch: {} });
    for (const o of windowRhythm('back', 0, W, { ...tall, avoid: [[-2.2, 2.2]] })) openings.push({ ...o, arch: {} });
    // (dome-detail-275) a tall light either side of the engine door
    for (const o of windowRhythm('front', 0, W, { ...tall, avoid: [[-3.4, 3.4]] })) openings.push({ ...o, arch: {} });
    // (dome-detail-275) the hall's and the monitor's iron in relief
    const roof: RoofSpec = { kind: 'gable', pitchDeg: 20, eave: 0.45, verge: 0.35, thickness: 0.08, bucket: 'roof', ridge: 'saddle', relief: IRON };
    const sash = rgb(0x3a3c3e);
    // (dome-detail-275) the cast-iron lights of a works: six-pane sashes on a concrete sill, the round head glazed over the
    // springing transom (the front's new lights draw their panes from the look stream)
    const iron: WindowStyle = { frame: sash, frameWidth: 0.08, frameOut: 0.04, bars: 'six', surround: null, sill: { bucket: CONCRETE, out: 0.1 }, shutters: null };
    const base = dialectOf(rng, sash, rgb(0x4a3a2e), 0.25, true);
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.6, out: 0.08, bucket: CONCRETE }, storeys: [{ h: H, wall: BRICK }], roof, gableBucket: BRICK,
      openings, chimneys: [], gutters: null, verge: null, reveal: 0.32,
    }, {
      ...base,
      window: (s, face, o, y0) => {
        windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, iron, o.face === 'front' ? look : rng, 0.25);
        archGlazing(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, sash);
      },
    });
    const y0 = frame.floors[0], eY = frame.eaveY, rg = frame.roof;
    const deco = { decor: true } as const;
    for (const name of ['left', 'right', 'back', 'front'] as const) {
      const f = frame.faces[name];
      const lights = openings.filter((q) => q.face === name && q.kind === 'window').sort((p, q) => p.u - q.u);
      // (dome-detail-275) each round head under its ring of rubbed brick a shade darker, the concrete keystone at its crown
      // and the imposts at its springing
      for (const o of lights) {
        const sp = y0 + o.y0 + o.h, r = o.w / 2;
        archHead(sink, f, o.u, sp, r, BRICK, 0.24, 9);
        faceBox(sink, CONCRETE, f, o.u, sp + r + 0.13, 0.05, 0.3, 0.42, 0.1, { ...deco, fineSides: true });
        for (const e of [-1, 1]) faceBox(sink, CONCRETE, f, o.u + e * (r + 0.14), sp - 0.06, 0.04, 0.3, 0.14, 0.08, { ...deco, fine: true });
      }
      // (dome-detail-275) the brick piers parting the bays (at the corners and between the lights), each on a deeper
      // offset to the sill line under a weathered top, its head corbelled out under the eaves course
      const piers = name === 'left' || name === 'right'
        ? [-f.width / 2 + 0.4, ...lights.slice(1).map((o, k) => (o.u + lights[k].u) / 2), f.width / 2 - 0.4]
        : [-f.width / 2 + 0.4, f.width / 2 - 0.4];
      const off = y0 + 1.5, cap = eY - 0.62;
      for (const u of piers) {
        faceBox(sink, BRICK, f, u, (0.6 + off) / 2, 0.14, 0.86, off - 0.6, 0.28, deco, { back: true });
        faceBox(sink, BRICK, f, u, off + 0.06, 0.15, 0.86, 0.12, 0.3, { ...deco, shade: 0.8 }, { back: true });
        faceBox(sink, BRICK, f, u, (off + cap) / 2, 0.1, 0.66, cap - off, 0.2, deco, { back: true });
        faceBox(sink, BRICK, f, u, cap + 0.12, 0.14, 0.84, 0.24, 0.28, { ...deco, shade: 0.9 }, { back: true });
      }
      if (name === 'left' || name === 'right') {
        // the corbelled eaves course: two oversailing courses along the long walls, the lower one darker
        faceBox(sink, BRICK, f, 0, eY - 0.46, 0.05, f.width, 0.2, 0.1, { ...deco, shade: 0.82, fineSides: true }, { back: true });
        faceBox(sink, BRICK, f, 0, eY - 0.18, 0.1, f.width, 0.36, 0.2, deco, { back: true });
        // the gutter along the eave and its downpipes at the corner piers and the middle, each on its shoe
        const out = 0.45 + 0.07, gy = eY - 0.45 * Math.tan(20 * Math.PI / 180) - 0.06;
        faceBox(sink, 'structureMetal', f, 0, gy, out, f.width + 0.7, 0.16, 0.16, { colour: shade(STEEL, 0.9), decor: true });
        for (const pu of [piers[0], piers[Math.floor(piers.length / 2)], piers[piers.length - 1]]) {
          const u = pu + (pu > 0 ? -0.55 : 0.55) - 0.5, top = facePoint(f, u + 0.5, gy - 0.08, 0.36), foot = facePoint(f, u + 0.5, 0.12, 0.36);
          sink.pipe('structureMetal', foot, top, 0.06, 6, { colour: shade(STEEL, 0.8), colourAt: rustBy(STEEL, 0, eY, 0.5), decor: true });
          sink.pipe('structureMetal', facePoint(f, u + 0.5, 0.12, 0.36), facePoint(f, u + 0.5, 0.02, 0.62), 0.06, 6, { colour: shade(STEEL, 0.8), decor: true, caps: true });
          sink.pipe('structureMetal', top, facePoint(f, u + 0.5, gy - 0.02, out), 0.06, 6, { colour: shade(STEEL, 0.8), decor: true });
        }
      }
    }
    // (dome-detail-275) the gables coped in blue brick along their rakes over the verge, a kneeler at each foot, the round
    // light high in each under its brick ring and four keystones, its glass behind a cross of iron
    const tanP = Math.tan(20 * Math.PI / 180);
    for (const sz of [-1, 1]) {
      const zf = sz * (D / 2 - 0.16);
      for (const sx of [-1, 1]) {
        sink.member(BRICK, [sx * (W / 2 + 0.35), eY - 0.35 * tanP + 0.21, zf], [0, rg.ridgeTopY + 0.13, zf], 0.32, 0.56, [0, 0, sz], { decor: true, exposed: true, shade: 0.62 }, 0);
        sink.span(BRICK, sx * (W / 2 - 0.3), eY - 0.55, zf - sz * 0.02, sx * (W / 2 + 0.4), eY + 0.3, zf + sz * 0.6, { decor: true, shade: 0.7 });
      }
      const oy = eY + (rg.ridgeY - eY) * 0.42, z0 = sz * D / 2;
      sink.cylinder(BRICK, [0, oy, sz > 0 ? z0 : z0 - 0.12], 'z', 0.12, 0.98, 16, { decor: true, shade: 0.78 });
      sink.cylinder('glass', [0, oy, sz > 0 ? z0 + 0.12 : z0 - 0.125], 'z', 0.005, 0.72, 12, { decor: true });
      for (const [du, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
        sink.span(CONCRETE, du * 0.85 - 0.14, oy + dy * 0.85 - 0.14, z0, du * 0.85 + 0.14, oy + dy * 0.85 + 0.14, z0 + sz * 0.17, { decor: true });
      }
      for (const dir of [0, 1]) {
        const a: Vec3 = dir ? [-0.72, oy, z0 + sz * 0.15] : [0, oy - 0.72, z0 + sz * 0.15], b: Vec3 = dir ? [0.72, oy, z0 + sz * 0.15] : [0, oy + 0.72, z0 + sz * 0.15];
        sink.member('structureMetal', a, b, 0.06, 0.04, [0, 0, sz], { colour: sash, decor: true, fine: true }, 0.02);
      }
    }
    // (dome-detail-275) the engine door under its steel lintel, a relieving arch over it, the brick tympanum between them
    // a shade back; the concrete apron before it, the siding's rails running in over it
    const front = frame.faces.front, gH = y0 + 4.4;
    faceBox(sink, 'structureMetal', front, 0, gH + 0.17, 0.05, 4.3, 0.34, 0.1, { colour: mix3(BLACK, RUST, 0.35), decor: true });
    archHead(sink, front, 0, gH + 0.34, 2.15, BRICK, 0.38, 11);
    const fan: Vec3[] = [facePoint(front, 0, gH + 0.34, 0.012)];
    for (let j = 0; j <= 10; j++) fan.push(facePoint(front, Math.cos(Math.PI * j / 10) * 2.14, gH + 0.34 + Math.sin(Math.PI * j / 10) * 2.14, 0.012));
    sink.polygon(BRICK, fan, { decor: true, shade: 0.8 });
    faceBox(sink, CONCRETE, front, 0, 0.03, 0.42, 4.8, 0.1, 0.84, { decor: true, shade: 0.9 });
    for (const u of [-0.72, 0.72]) faceBox(sink, 'structureMetal', front, u, 0.12, 0.45, 0.08, 0.1, 0.9, { colour: STEEL, decor: true });
    // the monitor along the ridge (dome-detail-275: of iron, not brick), its sides louvred over the hall's dark, its gable
    // ends closed
    const mSheet = pick(look, IRON_SHEET), mTone = shade(mSheet, 0.92), mc = 0.15, ml = D - 4.0, my0 = rg.ridgeY - 0.5, my1 = rg.ridgeY + 1.3;
    const louvre = { u0: -(ml - 1.2) / 2, u1: (ml - 1.2) / 2, y0: rg.ridgeY + 0.1, y1: rg.ridgeY + 1.0 };
    sink.span('structureMetal', -1.4 + mc, my0, -ml / 2, 1.4 - mc, my1, ml / 2, { colour: mTone });
    for (const sx of [-1, 1]) {
      const mf: Face = { origin: [sx * 1.4, 0, 0], u: [0, 0, -sx], out: [sx, 0, 0], width: ml };
      holedPolygon(sink, 'structureMetal', mf, [[-ml / 2, my0], [ml / 2, my0], [ml / 2, my1], [-ml / 2, my1]], [louvre], mc, 0.12, { colour: mTone });
      for (let y = louvre.y0 + 0.08; y < louvre.y1 - 0.04; y += 0.16) {
        faceBox(sink, 'structureMetal', mf, 0, y, -0.06, louvre.u1 - louvre.u0 + 0.08, 0.03, 0.1, { colour: shade(mSheet, 0.7), decor: true }, 'ends');
      }
      const bays = Math.max(2, Math.round((louvre.u1 - louvre.u0) / 2.6));
      for (let j = 1; j < bays; j++) faceBox(sink, 'structureMetal', mf, louvre.u0 + (louvre.u1 - louvre.u0) * j / bays, (louvre.y0 + louvre.y1) / 2, -0.02, 0.1, louvre.y1 - louvre.y0, 0.12, { colour: shade(mSheet, 0.8), decor: true }, 'caps');
    }
    const mr = roofGeometry(2.8, ml, my1, roof);
    sink.placed(0, 0, 0, 0, () => emitRoof(sink, mr, roof));
    for (const sz of [-1, 1]) {
      const zc = sz * ml / 2;
      prismOut(sink, 'structureMetal', [[-1.4, my1, zc], [1.4, my1, zc], [0, mr.ridgeY, zc]], [0, 0, -sz], 0.08, { colour: shade(mSheet, 0.85), decor: true });
    }
    // the stack at the back end (dome-detail-275): its pedestal on a splayed plinth under a corbelled cornice; the shaft
    // battered to its oversailing crown, iron bands round it, the soot blackening it toward the top, the flue's mouth dark
    const sz0 = -D / 2 - 1.45, pTop = 4.0;
    sink.span(BRICK, -1.4, -0.4, -D / 2 - 2.8, 1.4, pTop, -D / 2 - 0.1);
    sink.span(BRICK, -1.56, -0.1, -D / 2 - 2.96, 1.56, 0.7, -D / 2 - 0.1, { decor: true, shade: 0.85 });
    sink.span(BRICK, -1.56, pTop - 0.4, -D / 2 - 2.96, 1.56, pTop - 0.15, -D / 2 - 0.1, { decor: true, shade: 0.9 });
    sink.span(BRICK, -1.7, pTop - 0.15, -D / 2 - 3.1, 1.7, pTop + 0.05, -D / 2 - 0.1, { decor: true, shade: 0.8 });
    const sTop = 25.6, sl = sTop - pTop, rAt = (y: number) => 1.08 - 0.34 * Math.min(1, (y - pTop) / (sl - 3.0));
    const soot = (p: Vec3) => {
      if (Math.hypot(p[0], p[2] - sz0) < 0.66 && p[1] > sTop - 0.6) return 0.12;
      return 1 - 0.5 * Math.max(0, (p[1] - (sTop - 6)) / 6);
    };
    sink.revolve(BRICK, [0, pTop, sz0], 'y', [[0, 1.08], [sl - 3.0, 0.74], [sl - 3.0, 0.82], [sl - 2.5, 0.82], [sl - 2.5, 0.97], [sl - 1.4, 0.97], [sl - 1.4, 0.88],
      [sl, 0.88], [sl, 0.64], [sl - 0.5, 0.64], [sl - 0.5, 0]], 20, { shadeAt: soot });
    for (let y = pTop + 2.4; y < sTop - 3.4; y += 3.4) {
      sink.cylinder('structureMetal', [0, y, sz0], 'y', 0.12, rAt(y) + 0.025, 20, { colour: mix3(BLACK, RUST, 0.35), decor: true }, rAt(y + 0.12) + 0.025, false);
    }
    // (dome-detail-275) the boiler's feed-water tank on its brick base beside the pedestal, its pipe into the back wall;
    // the coal heap on the other side
    const tx = -W / 2 + 2.6, tz = -D / 2 - 1.5;
    sink.span(BRICK, tx - 1.05, -0.2, tz - 1.05, tx + 1.05, 0.55, tz + 1.05, { shade: 0.85 });
    sink.cylinder('structureMetal', [tx, 0.55, tz], 'y', 1.45, 0.95, 16, { colour: shade(STEEL, 0.9), colourAt: rustBy(STEEL, 0.55, 2.0, 0.6, 0.2) });
    for (let y = 0.85; y < 2.0; y += 0.45) sink.cylinder('structureMetal', [tx, y, tz], 'y', 0.05, 0.975, 16, { colour: RUST_DARK, decor: true }, 0.975, false);
    sink.pipe('structureMetal', [tx + 0.6, 1.7, tz + 0.7], [tx + 0.6, 1.7, -D / 2 + 0.02], 0.07, 6, { colour: BLACK, decor: true });
    // (dome-detail-275: the domeDetail law) the coal heap's mound turned smooth
    sink.revolve('dark', [W / 2 - 2.5, -0.05, -D / 2 - 1.5], 'y', smoothProfile([[0, 1.45], [0.35, 1.15], [0.75, 0.6], [0.95, 0]], 3), DOME_MIN_SEGMENTS, { decor: true, shade: 0.55 });
  });
  return sink.finish();
};

/**
 * The railway's engine shed (a depot plot): a long shed of corrugated iron, two tall doors in its gable end for the
 * locomotives, the smoke ventilators along its ridge, the coal stage and the water column outside. (dome-detail-275) Its
 * lights and side door now show through the rust skin (it was laid over them); the louvred smoke vent the length of the
 * ridge, roof lights and gutters; a smoke jack over each road at each end with its hood; the soot up the gable over each
 * road door; across the back gable the lean-to of the fitters' shop and stores, its door and lights cut, its brick
 * chimney; beside it the coal stage, a crib of old sleepers heaped with coal under its jib crane, and the water column
 * with its swinging arm, its leather bag and the fire devil at its foot.
 */
const engineShed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the shed fills the old depot's reach (its bounds, which stand off the plot's centre)
  const R = reach(ctx);
  const W = Math.max(8, R.W - 0.6), D = Math.max(12, R.D - 0.6), H = 7.0;
  const sheet = pick(rng, IRON_SHEET);
  // (dome-detail-275) on a long reach the hall stops 3 m short of the back for the lean-to across its back gable
  const lt = D >= 15 ? 3.0 : 0, Dh = D - lt;
  sink.placed(0, R.cx, 0, R.cz, () => {
    // (props census #4, lane B 2026-10-14; the judges: "a span box of rusting sheet, its road doors dark plates with a
    // board laid on each, a glass strip") the shared sheet hall (hall.ts): the iron on its frame and slab, the road
    // doors cut in the gable with their leaves on the tracks and the rails running in onto the shed's floor, the lights
    // in their frames under the eaves, a side door
    const dw = Math.min(3.6, W * 0.32), doors = W > 9 ? [-W * 0.24, W * 0.24] : [0], doorH = 5.2, side = -Dh * 0.3;
    sink.placed(0, 0, 0, lt / 2, () => {
      const frame = sheetHall(sink, { w: W, d: Dh, eave: H, pitchDeg: 18, kerb: 0.3, livery: sheet, doorLivery: shade(TIMBER, 1.1), trim: shade(sheet, 0.7), doors: 'sliding',
        doorW: dw, doorH, open: 0.4 + look() * 0.4, doorAt: doors, backDoor: null, sideDoor: side, clerestory: true, roofLights: true, ridgeVent: true,
        gutters: true, mobile: ctx.tier === 'mobile' }, look);
      // (dome-detail-275) the skin stops round the lights under the eaves, the side door and the road doors (hall.ts's own
      // openings, in the same frames)
      const lights: Array<{ face: number; u0: number; u1: number; y0: number; y1: number }> = [];
      for (const [face, fi] of [['left', 3], ['right', 1]] as const) for (let u = -Dh / 2 + 2.2; u < Dh / 2 - 1.6; u += 4.4) {
        if (face === 'right' && Math.abs(u - side) < 2.2) continue;
        lights.push({ face: fi, u0: u - 1.5, u1: u + 1.5, y0: H - 1.25, y1: H - 0.55 });
      }
      lights.push({ face: 1, u0: side - 0.5, u1: side + 0.5, y0: 0.3, y1: 2.5 });
      for (const u of doors) lights.push({ face: 0, u0: u - dw / 2, u1: u + dw / 2, y0: 0.3, y1: 0.3 + doorH });
      rustSkin(sink, -W / 2, 0.3, -Dh / 2, W / 2, H, Dh / 2, sheet, look, lights);
      const rg = frame.roof, tanP = Math.tan(18 * Math.PI / 180);
      // (dome-detail-275) the shed's iron in relief over both slopes (hall.ts lays the slab: eave 0.4, verge 0.3), its
      // translucent roof lights (every other bay, hall.ts) left open
      {
        const X = rg.s + 0.39, Z = rg.halfD + 0.3, yE = rg.topAt(X, 0) ?? H, bays = Math.max(2, Math.round(Dh / 5));
        for (const s of [-1, 1]) {
          const holes: Array<{ x0: number; x1: number; z0: number; z1: number }> = [];
          for (let k = 0; k < bays; k += 2) {
            const x0 = s > 0 ? 0.6 : -(W / 2 - 0.15), x1 = s > 0 ? W / 2 - 0.15 : -0.6;
            holes.push({ x0, x1, z0: -Dh / 2 + (k + 0.25) * Dh / bays, z1: -Dh / 2 + (k + 0.75) * Dh / bays });
          }
          layRoofRelief(sink, IRON, [reliefSlope([s * X, yE, -Z], [s * X, yE, Z], [-s * X, rg.ridgeTopY - yE, 0])], { bucket: 'roof', holes });
        }
      }
      for (const u of doors) {
        for (const rx of [-0.53, 0.53]) sink.span('structureMetal', u + rx - 0.04, 0.3, Dh / 2 - 6.0, u + rx + 0.04, 0.42, Dh / 2 + 1.2, { colour: STEEL, decor: true });
        // (dome-detail-275) the soot up the gable over each road door, darkest at its head
        const sootY0 = 0.3 + doorH + 0.1, sootY1 = rg.ridgeY - 0.6;
        const soot = (p: Vec3) => mix3(sheet, BLACK, 0.75 * (1 - Math.min(1, Math.max(0, (p[1] - sootY0) / (sootY1 - sootY0)))));
        sink.span('structureMetal', u - dw / 2 - 0.2, sootY0, Dh / 2 + 0.012, u + dw / 2 + 0.2, Math.min(sootY1, H + (W / 2 - Math.abs(u) - dw / 2 - 0.2) * tanP), Dh / 2 + 0.02,
          { colour: sheet, colourAt: soot, decor: true });
        // (dome-detail-275) a smoke jack over the road at each end of the shed: its trough on the slope, the pipe, the hood
        for (const z of [-Dh * 0.28, Dh * 0.28]) {
          const ry = H + (W / 2 - Math.abs(u)) * tanP + 0.1;
          sink.span('structureMetal', u - 0.38, ry - 0.4, z - 0.38, u + 0.38, ry + 0.3, z + 0.38, { colour: shade(sheet, 0.7), decor: true });
          sink.revolve('structureMetal', [u, ry + 0.3, z], 'y', [[0, 0.22], [1.45, 0.22], [1.45, 0.44], [1.75, 0.08], [1.75, 0]], 12,
            { colour: BLACK, colourAt: rustBy(BLACK, ry, ry + 2.1, 0.3, 0.3), decor: true });
        }
      }
    });
    if (lt > 0) {
      // (dome-detail-275) the fitters' shop and stores: a lean-to of sheet on a concrete kerb across the back gable,
      // its iron skillion off the hall's wall, its door and two lights cut through the back, the brick chimney through
      // its roof; the coal stage beside it
      const ls = shade(pick(look, IRON_SHEET), 0.95), lx0 = -W / 2, lx1 = W / 2 - 3.6, lz0 = -D / 2, lz1 = -D / 2 + lt, lH = 3.4, lR = 4.4, cut = 0.15;
      const lw = lx1 - lx0, lcx = (lx0 + lx1) / 2;
      sink.span(CONCRETE, lx0, -0.3, lz0, lx1, 0.3, lz1);
      sink.span('structureMetal', lx0, 0.3, lz0 + cut, lx1, lH, lz1, { colour: ls, colourAt: rustBy(ls, 0.3, lH, 0.45) });
      const lb: Face = { origin: [lcx, 0, lz0], u: [-1, 0, 0], out: [0, 0, -1], width: lw };
      const holes = [{ u0: lw * 0.3 - 0.5, u1: lw * 0.3 + 0.5, y0: 0.3, y1: 2.4 }, ...[-0.3, 0].map((t) => ({ u0: lw * t - 0.7 - 0.3, u1: lw * t + 0.7 - 0.3, y0: 1.3, y1: 2.5 }))];
      holedPolygon(sink, 'structureMetal', lb, [[-lw / 2, 0.3], [lw / 2, 0.3], [lw / 2, lH], [-lw / 2, lH]], holes, cut, 0.17, { colour: ls });
      faceBox(sink, 'structureWood', lb, holes[0].u0 + 0.5, 1.35, -0.12, 1.0, 2.1, 0.05, { colour: shade(TIMBER, 0.85), decor: true });
      for (const c of holes.slice(1)) cutLight(sink, lb, c, shade(ls, 0.6), 0.15, 0.5);
      for (const x of [lx0, lx1]) prismOut(sink, 'structureMetal', [[x, lH, lz0], [x, lH, lz1], [x, lR, lz1]], [x === lx0 ? 1 : -1, 0, 0], 0.1, { colour: ls, decor: true });
      const sl = Math.hypot(lR - lH, lt), n: Vec3 = [0, lt / sl, -(lR - lH) / sl];
      sink.member('roof', [lcx, lR + 0.02, lz1], [lcx, lH - 0.08, lz0 - 0.28], lw + 0.2, 0.07, n, { decor: true, exposed: true }, 0);
      // (dome-detail-275) the skillion's iron in relief over the member's top, from its eave up to the hall's wall
      const lo: Vec3 = [lcx, lH - 0.08 + n[1] * 0.07, lz0 - 0.28 + n[2] * 0.07], hw2 = (lw + 0.2) / 2;
      layRoofRelief(sink, IRON, [reliefSlope([lo[0] - hw2, lo[1], lo[2]], [lo[0] + hw2, lo[1], lo[2]], [0, lR - lH + 0.1, lz1 - lz0 + 0.28], 0.04)], { bucket: 'roof' });
      recordBody(sink, lcx, (lz0 + lz1) / 2, lw, lt, lH, 'structureMetal');
      const chx = lx0 + 1.1, chz = lz1 - 0.8;
      sink.span(BRICK, chx - 0.3, 0.3, chz - 0.35, chx + 0.3, lR + 1.4, chz + 0.35);
      sink.span(BRICK, chx - 0.38, lR + 1.2, chz - 0.43, chx + 0.38, lR + 1.4, chz + 0.43, { decor: true, shade: 0.7 });
      // the coal stage: a crib of old sleepers on three sides, the coal heaped in it, the jib crane at its corner
      const cx0 = W / 2 - 3.4, cx1 = W / 2 - 1.1, cz0 = lz0 + 0.15, cz1 = lz1 - 0.1, slp = shade(TIMBER, 0.6 + look() * 0.2);
      for (const [a, b, c, d] of [[cx0, cz0, cx1, cz0 + 0.24], [cx0, cz0, cx0 + 0.24, cz1], [cx1 - 0.24, cz0, cx1, cz1]] as const) {
        for (let y = 0; y < 1.2; y += 0.3) sink.span('structureWood', a, y, b, c, y + 0.27, d, { colour: shade(slp, 0.9 + (y % 0.6 < 0.3 ? 0 : 0.12)), decor: true });
      }
      sink.revolve('dark', [(cx0 + cx1) / 2, 0, (cz0 + cz1) / 2 + 0.15], 'y', smoothProfile([[0, 1.25], [0.9, 1.0], [1.45, 0.45], [1.6, 0]], 3), DOME_MIN_SEGMENTS, { decor: true, shade: 0.5 });
      sink.cylinder('structureWood', [cx0 + 0.12, 1.2, cz0 + 0.12], 'y', 3.4, 0.13, 8, { colour: TIMBER_GREY, decor: true });
      sink.member('structureMetal', [cx0 + 0.12, 4.3, cz0 + 0.12], [cx0 + 2.2, 4.0, cz0 + 1.6], 0.12, 0.12, [0, 1, 0], { colour: STEEL, decor: true, exposed: true }, 0);
      sink.member('structureMetal', [cx0 + 0.12, 2.6, cz0 + 0.12], [cx0 + 1.9, 3.95, cz0 + 1.39], 0.08, 0.08, [0, 1, 0], { colour: STEEL, decor: true, exposed: true }, 0);
      sink.pipe('structureMetal', [cx0 + 2.1, 4.0, cz0 + 1.53], [cx0 + 2.1, 2.2, cz0 + 1.53], 0.02, 3, { colour: BLACK, decor: true, fine: true });
      // the water column at the stage's end (it stood inside the shed): its plinth, the column, the arm, the bag hung from
      // it, the valve wheel; the fire devil at its foot
      sink.dressing(ctx.tier === 'mobile', () => {
        const wx = W / 2 - 0.45, wz = (lz0 + lz1) / 2;
        sink.span(CONCRETE, wx - 0.35, 0, wz - 0.35, wx + 0.35, 0.3, wz + 0.35, { decor: true });
        sink.cylinder('structureMetal', [wx, 0.3, wz], 'y', 3.2, 0.16, 10, { colour: pick(look, [BLACK, STEEL]), decor: true }, 0.13);
        sink.member('structureMetal', [wx, 3.4, wz], [wx - 0.2, 3.3, wz + 1.6], 0.16, 0.16, [0, 1, 0], { colour: BLACK, decor: true, exposed: true }, 0);
        sink.cylinder('structureMetal', [wx - 0.2, 2.1, wz + 1.55], 'y', 1.2, 0.09, 6, { colour: rgb(0x3a2e26), decor: true }, 0.11);
        sink.cylinder('structureMetal', [wx + 0.13, 1.3, wz], 'x', 0.05, 0.28, 10, { colour: STEEL, decor: true, fine: true });
        sink.cylinder('structureMetal', [wx - 0.1, 0, wz - 0.7], 'y', 0.75, 0.17, 8, { colour: RUST_DARK, decor: true }, 0.2);
      });
    }
  });
  return sink.finish();
};

/**
 * The mine's water tank (a water tower plot): a tank of timber staves in iron hoops on a timber trestle — four posts on
 * concrete pads, girts and X braces on all four faces (lattice.ts), the deck's bearers and joists under the tank, a
 * ladder up one face to the catwalk round the deck with its rail, the tank's rim, lid and hatch, its outlet pipe down.
 * (Props census #3, lane B 2026-10-14; the judges: "girts at two levels and only two diagonals; an 18-sided tank with no
 * hoops, staves, rim or roof hatch; no ladder, no sole plates or footings".) It falls as its frame (damage.ts lattice).
 */
const tankTrestle: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant, mobile = ctx.tier === 'mobile';
  // the trestle fills the old tower's reach (its bounds)
  const RR = reach(ctx);
  const P = Math.max(3.6, Math.min(RR.W, RR.D) - 0.2), legH = 8 + ctx.rng() * 2, R = Math.min(2.9, P / 2 - 0.1);
  const post = P / 2 - 0.35;
  sink.placed(0, RR.cx, 0, RR.cz, () => {
    const paint = pick(look, [rgb(0x7a6a5a), rgb(0x9aa09c), rgb(0x5f6466)]);
    const staves = shade(TIMBER, 0.9 + look() * 0.15);
    latticeFrame(sink, { foot: post + 0.25, head: post, y0: 0.25, y1: legH, size: 0.3, girt: 0.16, brace: 0.12, panels: 3, bucket: 'structureWood',
      colour: TIMBER, pad: { bucket: CONCRETE, size: 0.7, top: 0.25, solid: true }, mobile },
      { x0: -R, x1: R, y0: legH + 0.3, y1: legH + 4.2, z0: -R, z1: R, bucket: 'structureWood', tint: staves });
    // the deck: bearers on the post heads, the joists across them, the boards
    trestleDeck(sink, P, legH, shade(TIMBER, 0.85)); // (looks r2 b-east, 2026-10-16: extracted to queenstownTrestle.ts, rebuilt there)
    for (const s of [-1, 1]) sink.span('structureWood', -P / 2 - 0.1, legH - 0.12, s * post - 0.12, P / 2 + 0.1, legH + 0.14, s * post + 0.12, { colour: shade(TIMBER, 0.8), decor: true });
    sink.dressing(mobile, () => {
      for (let x = -P / 2 + 0.3; x < P / 2; x += 0.6) sink.span('structureWood', x - 0.05, legH + 0.02, -P / 2, x + 0.05, legH + 0.14, P / 2, { colour: shade(TIMBER, 0.75), decor: true, fine: true });
      // the catwalk's rail round the deck, the ladder up the +z face to it
      for (const [x0, z0, x1, z1] of [[-P / 2, -P / 2, P / 2, -P / 2], [P / 2, -P / 2, P / 2, P / 2], [P / 2, P / 2, -P / 2, P / 2], [-P / 2, P / 2, -P / 2, -P / 2]] as const) {
        sink.member('structureWood', [x0, legH + 1.25, z0], [x1, legH + 1.25, z1], 0.06, 0.06, [0, 1, 0], { colour: TIMBER, decor: true, exposed: true }, 0);
        // (259, the far-view census: the rail stood over the deck on posts all fine joinery) the corner posts at any range
        for (let t = 0; t <= 1.001; t += 0.25) sink.span('structureWood', x0 + (x1 - x0) * t - 0.04, legH + 0.3, z0 + (z1 - z0) * t - 0.04, x0 + (x1 - x0) * t + 0.04, legH + 1.25, z0 + (z1 - z0) * t + 0.04, { colour: TIMBER, decor: true, fine: t > 0 });
      }
      // (its stiles from the ground into the deck's edge: the connectivity receipt)
      for (const dx of [-0.25, 0.25]) sink.member('structureWood', [dx, 0, P / 2 + 0.55], [dx, legH + 0.3, P / 2 - 0.03], 0.07, 0.05, [0, 0, 1], { colour: TIMBER, decor: true, exposed: true }, 0);
      for (let y = 0.4; y < legH + 0.2; y += 0.32) {
        const z = P / 2 + 0.55 - 0.58 * (y / (legH + 0.3));
        sink.span('structureWood', -0.25, y - 0.02, z - 0.025, 0.25, y + 0.02, z + 0.025, { colour: TIMBER, decor: true, fine: true });
      }
    });
    // the tank: its staves (the shell), iron hoops round them, the rim, the lid and its hatch, the outlet pipe
    sink.cylinder('structureWood', [0, legH + 0.3, 0], 'y', 3.2, R, 18, { colour: staves });
    sink.cylinder('structureWood', [0, legH + 3.5, 0], 'y', 0.7, R + 0.05, 18, { colour: shade(staves, 0.85) }, 0.15);
    sink.dressing(mobile, () => {
      for (let y = legH + 0.55; y < legH + 3.45; y += 0.42) sink.cylinder('structureMetal', [0, y, 0], 'y', 0.05, R + 0.025, 18, { colour: shade(paint, 0.6), decor: true }, R + 0.025, false);
      sink.cylinder('structureWood', [0, legH + 3.44, 0], 'y', 0.1, R + 0.08, 18, { colour: shade(staves, 0.8), decor: true }, R + 0.08, true);
      sink.span('structureWood', R * 0.3 - 0.3, legH + 3.85, -0.3, R * 0.3 + 0.3, legH + 4.0, 0.3, { colour: shade(staves, 0.75), decor: true });
    });
    // (dome-detail-275) the outlet a round main down through the deck to its valve pit, the main away along the ground
    // to the mine; the overflow from under the rim down to the deck; the float gauge's white board up the staves, its
    // pointer; the leaks' dark streaks down the staves; the vent on the lid's peak
    const ox = R * 0.6, iron = { colour: BLACK, colourAt: rustBy(BLACK, 0, legH, 0.4), decor: true };
    sink.pipe('structureMetal', [ox, legH + 0.3, 0], [ox, 0.3, 0], 0.1, 8, iron);
    sink.span(CONCRETE, ox - 0.4, -0.1, -0.4, ox + 0.4, 0.3, 0.4, { decor: true, shade: 0.85 });
    sink.pipe('structureMetal', [ox + 0.4, 0.14, 0.15], [P / 2 + 0.45, 0.14, 0.15], 0.1, 8, { ...iron, caps: true });
    sink.cylinder('structureMetal', [ox, 0.55, -0.12], 'z', 0.04, 0.2, 10, { colour: rgb(0x8a3a2a), decor: true, fine: true });
    sink.cylinder('structureMetal', [ox, 0.3, -0.06], 'z', 0.12, 0.05, 6, { colour: BLACK, decor: true, fine: true }, 0.05, true);
    const ov = { colour: shade(paint, 0.7), decor: true };
    sink.pipe('structureMetal', [R - 0.1, legH + 3.25, -0.7], [R + 0.12, legH + 3.25, -0.7], 0.06, 6, ov);
    sink.pipe('structureMetal', [R + 0.12, legH + 3.3, -0.7], [R + 0.12, legH + 0.3, -0.7], 0.06, 6, ov);
    sink.member('structureWood', [-R, legH + 0.45, 0], [-R, legH + 3.4, 0], 0.26, 0.04, [-1, 0, 0], { colour: rgb(0xe4e0d4), decor: true }, 0.02);
    const fy = legH + 0.6 + look() * 2.5;
    sink.span('structureMetal', -R - 0.08, fy - 0.04, -0.2, -R - 0.01, fy + 0.04, 0.2, { colour: BLACK, decor: true });
    for (const a of [0.8 + look() * 0.6, 3.6 + look() * 0.8]) {
      const c = Math.cos(a), sn = Math.sin(a);
      sink.member('structureWood', [c * R, legH + 0.32, sn * R], [c * R, legH + 1.6 + look() * 1.4, sn * R], 0.35, 0.02, [c, 0, sn], { colour: shade(staves, 0.62), decor: true }, 0.01);
    }
    sink.cylinder('structureWood', [0, legH + 4.05, 0], 'y', 0.4, 0.16, 8, { colour: shade(staves, 0.7), decor: true });
    sink.cylinder('structureMetal', [0, legH + 4.45, 0], 'y', 0.08, 0.3, 8, { colour: shade(paint, 0.6), decor: true }, 0.1);
  });
  return sink.finish();
};

/**
 * A row of weatherboard cottages (a container row plot): two or three houses side by side along the reach, each under
 * its hipped roof of painted corrugated iron with a red-brick chimney, the bullnose verandah across its front on turned
 * posts, the picket fence along the front edge.
 */
const cottageRow: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the cottages fill the old row's reach (its bounds): their backs on the back edge, their verandahs to the front
  const R = reach(ctx);
  const L = Math.max(9, R.W - 0.3), n = L > 14 ? 3 : 2, w = L / n, d = Math.max(4.5, R.D - 2.3), deep = 1.7;
  const zc = R.z0 + 0.3 + d / 2;
  for (let k = 0; k < n; k++) {
    const x = R.cx - L / 2 + (k + 0.5) * w;
    sink.placed(0, x, 0, zc, () => {
      const trim = pick(rng, TRIM), paint = pick(rng, COTTAGE);
      const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: -w * 0.18, w: 0.9, y0: 0, h: 2.05 },
        { face: 'front', storey: 0, kind: 'window', u: w * 0.18, w: 1.0, h: 1.4, y0: 0.9 }];
      for (const o of windowRhythm('back', 0, w, { w: 0.9, h: 1.2, sill: 1.0, spacing: 2.4, margin: 0.9, max: 1 })) openings.push(o);
      // (round 3, gauntlet wave 132: "the weatherboards are rendered as thick high-contrast black-and-white stripes":
      // the walls stood in the bare timber photo set, uncoloured, and only the lap lines took the house's paint) the
      // walls are the house's paint on the painted-timber surface, its own colour on every board
      sink.paint = paint;
      let frame: ReturnType<typeof buildHouse>;
      try {
        frame = buildHouse(sink, {
          w: w - 0.05, d, plinth: { h: 0.5, out: 0.04, bucket: CONCRETE }, storeys: [{ h: 2.7, wall: 'structureWood' }],
          roof: { kind: 'hip', pitchDeg: 26, eave: 0.4, verge: 0.4, thickness: 0.06, bucket: 'roof', ridge: 'saddle', relief: IRON }, // (dome-detail-275) its iron in relief
          gableBucket: 'structureWood', openings, chimneys: [{ x: w * 0.22, z: -d * 0.12, sx: 0.55, sz: 0.7, above: 0.9, bucket: BRICK, cap: 'slab' }],
          gutters: null, verge: null, reveal: 0.1,
        }, dialectOf(rng, trim, shade(paint, 0.8), 0.4));
      } finally { sink.paint = null; }
      // the weatherboards' laps: a faint shadow line under each board, near the camera only
      for (const name of ['front', 'back', 'left', 'right'] as const) {
        const f = frame.faces[name];
        for (let y = 0.72; y < 3.1; y += 0.2) faceBox(sink, 'structureWood', f, 0, y, 0.014, f.width, 0.03, 0.012, { colour: shade(paint, 0.92), decor: true, fine: true });
      }
      // the bullnose verandah (props census #3, lane B 2026-10-14; the judges: "every post pierces the verandah roof by
      // 0.11 m", "a 12 cm slab with nothing under it to the ground"): the posts carry a verandah beam under the flat
      // sheet's edge, the bullnose springing from it on curved rafters round a quarter circle to the front; the floor's
      // joists on concrete stumps along its front, a skirting board along it
      const f = frame.faces.front, beamO = deep - 0.6, beamTop = 2.78;
      const posts = [-w / 2 + 0.25, 0, w / 2 - 0.25];
      for (const u of posts) faceBox(sink, 'structureWood', f, u, (beamTop - 0.14 - 0.3) / 2, beamO, 0.12, beamTop - 0.14 + 0.3, 0.12, { colour: trim }, { top: true });
      faceBox(sink, 'structureWood', f, 0, beamTop - 0.07, beamO, w - 0.2, 0.14, 0.12, { colour: shade(trim, 0.92), decor: true, uv: UV_MEMBER });
      faceBox(sink, 'structureWood', f, 0, 0.42, deep / 2, w - 0.2, 0.12, deep, { colour: TIMBER_GREY, decor: true });
      for (let u = -w / 2 + 0.25; u <= w / 2 - 0.24; u += Math.max(0.9, (w - 0.5) / Math.max(1, Math.round((w - 0.5) / 1.2)))) {
        faceBox(sink, CONCRETE, f, u, 0.03, deep - 0.18, 0.16, 0.66, 0.16, { decor: true, shade: 0.85 }, { top: true });
      }
      faceBox(sink, 'structureWood', f, 0, 0.18, deep - 0.08, w - 0.2, 0.36, 0.025, { colour: shade(trim, 0.85), decor: true, uv: UV_MEMBER });
      const roofC = pick(look, ROOF_PAINT);
      const roofRust = { colourAt: rustBy(roofC, 1.6, 2.9, 0.35 + look() * 0.3) };
      sink.span('structureMetal', -w / 2 + 0.05, 2.78, d / 2, w / 2 - 0.05, 2.84, d / 2 + deep - 0.6, { colour: roofC, decor: true, shadow: true });
      // the bullnose: four bent sheets round a quarter circle from the flat sheet's edge down to the verandah's front
      const cy = 2.24, cz = d / 2 + deep - 0.6, rr = 0.6;
      for (let q = 0; q < 4; q++) {
        const t0 = q / 4 * Math.PI / 2, t1 = (q + 1) / 4 * Math.PI / 2, tm = (t0 + t1) / 2;
        sink.member('structureMetal', [0, cy + rr * Math.cos(t0), cz + rr * Math.sin(t0)], [0, cy + rr * Math.cos(t1), cz + rr * Math.sin(t1)], w - 0.1, 0.05,
          [0, Math.cos(tm), Math.sin(tm)], { colour: roofC, ...roofRust, decor: true, shadow: true, exposed: true }, 0);
        // (the curved rafters under it dropped for the map's budget: Copper Mesa's 28 rows, the cost census 2026-10-14)
      }
    });
  }
  // the picket fence along the front edge, its gate gaps at the paths (dressing)
  if (ctx.tier !== 'mobile') {
    const fz = R.z1 - 0.12, white = rgb(0xe4e0d4);
    for (let k = 0; k < n; k++) {
      const x0 = R.cx - L / 2 + k * w + 0.15, x1 = x0 + w - 0.3, gx = R.cx - L / 2 + (k + 0.5) * w - w * 0.18;
      for (const [a, b] of [[x0, gx - 0.6], [gx + 0.6, x1]] as const) {
        if (b - a < 0.3) continue;
        sink.span('structureWood', a, 0.35, fz - 0.02, b, 0.42, fz + 0.02, { colour: white, decor: true });
        sink.span('structureWood', a, 0.8, fz - 0.02, b, 0.87, fz + 0.02, { colour: white, decor: true });
        // (259, the far-view census: the rails stood on pickets all fine joinery) the end pickets at any range
        for (let x = a + 0.05; x < b; x += 0.24) sink.span('structureWood', x - 0.03, 0, fz - 0.015, x + 0.03, 1.05, fz + 0.015, { colour: white, decor: true, fine: x > a + 0.06 && x + 0.24 < b });
      }
    }
  }
  return sink.finish();
};

/**
 * An abandoned cottage (a ruin plot): its frame stripped of boards, the iron roof half gone, a fallen verandah.
 * (dome-detail-275) The verandah now there, fallen: its sheet slid down off the plate to the ground, one post still up,
 * one down; the floor's joists bare on the stumps with a few boards left; the sole plates round the walls; the front
 * door's frame standing alone; the chimney's fireplace open at its foot under the corbelled top, fallen bricks heaped
 * by it.
 */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the ruin fills the old ruin's reach (its bounds)
  const R = reach(ctx);
  const W = Math.max(5, R.W - 0.6), D = Math.max(6, R.D - 0.6), H = 2.7;
  sink.placed(0, R.cx, 0, R.cz, () => {
    sink.span(CONCRETE, -W / 2 - 0.05, -0.4, -D / 2 - 0.05, W / 2 + 0.05, 0.5, D / 2 + 0.05);
    // the studs left standing, some boards still on them
    for (const [x0, z0, x1, z1] of [[-W / 2, -D / 2, W / 2, -D / 2], [W / 2, -D / 2, W / 2, D / 2], [W / 2, D / 2, -W / 2, D / 2], [-W / 2, D / 2, -W / 2, -D / 2]] as const) {
      const len = Math.hypot(x1 - x0, z1 - z0), nn = Math.round(len / 0.6);
      for (let k = 0; k <= nn; k++) {
        if (rng() < 0.3) continue;
        const t = k / nn, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        sink.span('structureWood', x - 0.05, 0.5, z - 0.05, x + 0.05, 0.5 + H * (0.4 + rng() * 0.6), z + 0.05, { colour: TIMBER_GREY });
      }
      if (rng() < 0.6) {
        const t0 = rng() * 0.5, t1 = t0 + 0.2 + rng() * 0.3;
        const a: Vec3 = [x0 + (x1 - x0) * t0, 0.6, z0 + (z1 - z0) * t0], b: Vec3 = [x0 + (x1 - x0) * t1, 0.6, z0 + (z1 - z0) * t1];
        // the boards upright on the studs (the connectivity sweep: they lay flat as a shelf 1.4 m wide across the wall)
        const nl = Math.hypot(x1 - x0, z1 - z0) || 1, n: Vec3 = [(z1 - z0) / nl, 0, -(x1 - x0) / nl];
        sink.member('structureWood', [a[0], 1.3, a[2]], [b[0], 1.3, b[2]], 1.4, 0.03, n, { colour: pick(rng, COTTAGE), decor: true, exposed: true }, 0);
      }
    }
    // the sagging half of the roof, its sheets on the ground, the brick chimney still standing
    sink.member('structureMetal', [-W / 2, H * 0.9, -D * 0.1], [W / 2, H * 0.5, D * 0.3], 3.2, 0.05, [0, 1, 0], { colour: pick(rng, ROOF_PAINT), decor: true, exposed: true }, 0);
    for (let k = 0; k < 3; k++) {
      // the sheets on the floor (the connectivity sweep: they lay 0.1 m over it), buckled a little
      const a: Vec3 = [(rng() - 0.5) * W, 0.5, (rng() - 0.5) * D], b: Vec3 = [a[0] + (rng() - 0.5) * 2.5, 0.5 + rng() * 0.12, a[2] + (rng() - 0.5) * 2.5];
      sink.member('structureMetal', a, b, 0.8, 0.03, [0, 1, 0], { colour: pick(rng, IRON_SHEET), decor: true, exposed: true }, 0);
    }
    sink.span(BRICK, W * 0.2, 0.5, -D * 0.15, W * 0.2 + 0.55, 4.2, -D * 0.15 + 0.7);
    const look = ctx.variant, grey = { colour: TIMBER_GREY, decor: true };
    // (dome-detail-275) the chimney's fireplace open at its foot, its corbelled top, the bricks fallen from it
    const chx = W * 0.2 + 0.275, chz = -D * 0.15 + 0.35;
    sink.span('dark', chx - 0.2, 0.5, chz - 0.36, chx + 0.2, 1.25, chz - 0.33, { decor: true, shade: 0.4 });
    sink.span(BRICK, chx - 0.38, 3.9, chz - 0.44, chx + 0.38, 4.05, chz + 0.44, { decor: true, shade: 0.8 });
    sink.span(BRICK, chx - 0.33, 4.05, chz - 0.39, chx + 0.33, 4.3, chz + 0.39, { decor: true, shade: 0.75 });
    sink.revolve(BRICK, [chx + 0.9, 0.45, chz - 0.2], 'y', [[0, 0.75], [0.18, 0.55], [0.32, 0.22], [0.38, 0]], 8, { decor: true, shade: 0.85 });
    // the sole plates round the walls and the floor's joists bare across the stumps, a few boards left on them
    for (const [x0, z0, x1, z1] of [[-W / 2, -D / 2, W / 2, -D / 2], [W / 2, -D / 2, W / 2, D / 2], [W / 2, D / 2, -W / 2, D / 2], [-W / 2, D / 2, -W / 2, -D / 2]] as const) {
      sink.member('structureWood', [x0, 0.5, z0], [x1, 0.5, z1], 0.12, 0.1, [0, 1, 0], grey, 0);
    }
    for (let x = -W / 2 + 0.45; x < W / 2 - 0.2; x += 0.6) sink.span('structureWood', x - 0.05, 0.5, -D / 2 + 0.1, x + 0.05, 0.64, D / 2 - 0.1, { colour: shade(TIMBER_GREY, 0.85), decor: true });
    for (let k = 0; k < 5; k++) {
      const z = (look() - 0.5) * (D - 1.2), x0 = -W / 2 + 0.2 + look() * W * 0.4, x1 = Math.min(W / 2 - 0.2, x0 + 1.0 + look() * 2.0);
      sink.span('structureWood', x0, 0.64, z - 0.08, x1, 0.67, z + 0.08, { colour: shade(TIMBER_GREY, 0.95 + look() * 0.15), decor: true });
    }
    // the front door's frame standing alone in its gap: two jambs and the head
    const du = (look() - 0.5) * W * 0.4, dz = D / 2;
    for (const e of [-0.48, 0.48]) sink.span('structureWood', du + e - 0.05, 0.5, dz - 0.06, du + e + 0.05, 2.6, dz + 0.06, { colour: pick(look, TRIM), decor: true });
    sink.span('structureWood', du - 0.6, 2.6, dz - 0.06, du + 0.6, 2.72, dz + 0.06, { colour: pick(look, TRIM), decor: true });
    // the fallen verandah across the front: its sheet slid off the wall plate, its foot on the ground before the slab,
    // one post still up under its edge, one down in the grass
    const vz = D / 2 + 0.05, vC = pick(look, ROOF_PAINT), vy = 1.4 + look() * 0.6;
    const vl = Math.hypot(vy - 0.05, 0.75), vn: Vec3 = [0, 0.75 / vl, (vy - 0.05) / vl];
    sink.member('structureMetal', [-W * 0.05, vy, vz], [-W * 0.05, 0.05, vz + 0.75], W * 0.7, 0.04, vn, { colour: vC, colourAt: rustBy(vC, 0, vy, 0.5), decor: true, exposed: true }, 0);
    sink.span('structureWood', -W / 2 + 0.25 - 0.06, 0, vz + 0.02, -W / 2 + 0.25 + 0.06, vy + 0.05, vz + 0.14, { ...grey, colour: shade(TIMBER_GREY, 1.05) });
    sink.member('structureWood', [W * 0.15, 0, vz + 0.2], [W * 0.15 + 1.6, 0, vz + 0.1], 0.1, 0.1, [0, 1, 0], { ...grey, exposed: true }, 0);
  });
  return sink.finish();
};

const QUEENSTOWN_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  gantry: headframe,
  factory: concentrator,
  foundryoffice: hotel,
  warehouse: powerHouse,
  depot: engineShed,
  watertower: tankTrestle,
  containerRow: cottageRow,
  ruin,
});

export const QUEENSTOWN_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'queenstown',
  region: 'Queenstown under Mount Lyell, Tasmania (the Mount Lyell Mining and Railway Company, 1893-1994): headframes and ore bins, the concentrator, the smelters\' brick, weatherboard cottages under corrugated iron',
  surfaces: {
    // corrugated iron weathering in the west coast's rain; the town's red-brown brick
    roof: { kind: 'sheet', tint: [0.6, 0.58, 0.56] },
    // (round 11; waves 319/320: "clean, saturated, uniformly tiled brick with no soot") an industrial town's brick, soiled
    stone: { kind: 'brick', tint: [0.58, 0.33, 0.27], weathered: true },
    sourced: { plaster: false, wood: true },
    // (the facades lane, round 11; waves 319/320: the walls' procedural canvas read as "speckle", "sponge", "cork",
    // "camouflage noise": its 6 cm bumps shade as dots from the street, as Steinburg's did before round 8) the walls
    // painted as the region renders them (regionalSurfaces.ts paintLimeRender), every family under the kit's and the map's
    // tones
    render: { kind: 'limeRender', seed: 0x5c51 },
    tones: {
      plaster: (_h, s, l) => [0.1, Math.min(1, s * 0.5 + 0.1), Math.min(1, l * 1.1 + 0.12)],
      plaster2: (_h, s, l) => [0.07, Math.min(1, s * 0.6 + 0.12), Math.min(1, l * 0.95 + 0.06)],
      plaster3: (_h, s, l) => [0.09, Math.min(1, s * 0.2 + 0.02), Math.min(1, l * 0.98 + 0.1)],
    },
  },
  builders: QUEENSTOWN_BUILDERS,
  // the wettest town in Australia: damp up the wall foot, moss and lichen on the brick and the iron's lap joints
  weather: {
    plaster: [[1, 1, 1], [1.02, 1.0, 0.96], [0.94, 0.94, 0.92]],
    stone: [[1, 1, 1], [0.9, 0.9, 0.88], [1.04, 1.0, 0.97], [0.86, 0.86, 0.85]],
    // (round 2: the cottages' and the hotel's roofs moved onto the weathered sheet: galvanised, red oxide, Brunswick green,
    // galvanised going to rust, each house its own, the moss and lichen of the wettest town in Australia toward the eaves)
    roof: [[1, 1, 1], [1.28, 0.82, 0.7], [0.84, 1.02, 0.88], [1.12, 0.94, 0.82], [0.86, 0.8, 0.74], [0.78, 0.74, 0.7]],
  },
});
