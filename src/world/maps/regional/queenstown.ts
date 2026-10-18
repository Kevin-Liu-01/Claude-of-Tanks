// src/world/maps/regional/queenstown.ts — the Queenstown kit (Copper Mesa Mine: Queenstown under Mount Lyell on the
// west coast of Tasmania, the Mount Lyell Mining and Railway Company's town from 1893 to 1994, the Iron Blow open cut
// above it and the hills round it stripped bare by the smelters' fumes and the cutting for their furnaces). The mine's
// works: the steel headframes over the North Lyell shafts with their winding houses and timber ore bins; the
// concentrator stepping down its slope in corrugated sections under monitor roofs, a conveyor gallery up to its head;
// the smelters' power house of red brick with tall arched windows and its stack; the railway's engine shed of
// corrugated iron; a water tank on its timber trestle; and the town: the Empire Hotel or the company's office, two
// storeys of brick behind a two-storey verandah of cast-iron lace; rows of weatherboard cottages under corrugated iron,
// each with its bullnose verandah, its brick chimney and its picket fence; and the stripped frames of abandoned ones.
import { PartSink, faceBox, facePanel, pick, rgb, shade, UV_MEMBER, type Face, type RegionalBucket, type Rgb, type Vec3 } from './geometry.ts';
import { buildHouse, emitRoof, holedPolygon, recordBody, roofGeometry, windowRhythm, type HouseDialect, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import { sheetHall } from './hall.ts';
import { latticeFrame, recordLattice } from './lattice.ts';
import { hotelNameBoard } from './queenstownSign.ts';
import { trestleDeck } from './queenstownTrestle.ts';

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
            roof: { kind: 'gable', pitchDeg: 22, eave: 0.3, verge: 0.25, thickness: 0.06, bucket: 'roof', ridge: 'saddle' }, gableBucket: 'structureMetal',
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
        // the ridge vent along the roof, the boiler's stack through it
        const rg = frame.roof;
        sink.span('structureMetal', -0.35, rg.ridgeTopY - 0.05, -hd * 0.3, 0.35, rg.ridgeTopY + 0.4, hd * 0.3, { colour: shade(sheet, 0.9), decor: true });
        sink.span('structureMetal', -0.55, rg.ridgeTopY + 0.4, -hd * 0.3 - 0.1, 0.55, rg.ridgeTopY + 0.48, hd * 0.3 + 0.1, { colour: shade(sheet, 0.8), decor: true });
        sink.cylinder('structureMetal', [hw * 0.22, 0, hd * 0.25], 'y', rg.ridgeTopY + 3.2, 0.22, 8, { colour: rgb(0x3a3634) });
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
    sink.span('structureMetal', ox0 - 0.2, by + bh, -oz - 0.2, ox1 + 0.2, by + bh + 0.12, oz + 0.2, { colour: pick(look, IRON_SHEET), decor: true });
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
 * round the tank.
 */
const concentrator: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the mill fills the old factory's reach (its bounds)
  const R = reach(ctx);
  const W = Math.max(8, R.W - 0.6), D = Math.max(12, R.D - 0.6);
  const sheet = pick(rng, IRON_SHEET);
  const steps = [[1.0, 15.0], [0.66, 10.5], [0.33, 6.5]] as const;
  sink.placed(0, R.cx, 0, R.cz, () => {
    sink.span(CONCRETE, -W / 2 - 0.1, -0.4, -D / 2 - 0.1, W / 2 + 0.1, 0.6, D / 2 + 0.1);
    const sec = D / 3;
    // (props census #13, lane B 2026-10-15) the thickener's yard: the front section stops short of the reach's +x side
    // on a wide reach (the tank stood buried inside the front section)
    const yard = W >= 11 ? Math.min(6.4, Math.max(4.4, W * 0.36)) : 0;
    steps.forEach(([, h], k) => {
      const z0 = -D / 2 + k * sec, z1 = z0 + sec, x0 = -W / 2, x1 = k === 2 ? W / 2 - yard : W / 2, wk = x1 - x0, cx = (x0 + x1) / 2;
      const tone = shade(sheet, 1 - k * 0.04);
      // the sides' glazing bands cut through the cladding into the mill's dark (were glass laid on solid sheet): the
      // glass and its mullions at the back of the reveal, a flashing over the sill
      const band = { u0: -(sec - 1.4) / 2, u1: (sec - 1.4) / 2, y0: h - 2.1, y1: h - 1.1 }, cut = 0.2, back = 0.15;
      const sides: Face[] = [1, -1].map((side) => ({ origin: [side > 0 ? x1 : x0, 0, (z0 + z1) / 2], u: [0, 0, -side], out: [side, 0, 0], width: sec }));
      // the street front (the front section's gable end): the ore-wagon door, the man door and the glazing band cut
      // through it (props census #13, lane B 2026-10-15; the judges: "there are no doors and no openings ... blank gables")
      const street = k === 2, ff: Face = { origin: [cx, 0, z1], u: [1, 0, 0], out: [0, 0, 1], width: wk - 2 * cut };
      const wagon = { u0: -wk * 0.18 - Math.min(1.8, wk * 0.15), u1: -wk * 0.18 + Math.min(1.8, wk * 0.15), y0: 0.6, y1: 4.2 };
      const man = { u0: wk * 0.3 - 0.5, u1: wk * 0.3 + 0.5, y0: 0.6, y1: 2.75 };
      const fband = { u0: -wk / 2 + 1.0, u1: wk / 2 - 1.0, y0: h - 2.1, y1: h - 1.1 };
      const frontCuts = street ? [wagon, man, fband] : [];
      sink.span('structureMetal', x0 + cut, 0.6, z0, x1 - cut, h, street ? z1 - cut : z1, { colour: tone });
      for (const f of sides) holedPolygon(sink, 'structureMetal', f, [[-sec / 2, 0.6], [sec / 2, 0.6], [sec / 2, h], [-sec / 2, h]], [band], cut, back + 0.02, { colour: tone });
      if (street) {
        const hw = wk / 2 - cut;
        holedPolygon(sink, 'structureMetal', ff, [[-hw, 0.6], [hw, 0.6], [hw, h], [-hw, h]], frontCuts, cut, back + 0.02, { colour: tone });
        // the wagon door's sheet leaf and the man door's steel leaf at the back of their cuts, the band's glass
        const leaf = shade(sheet, 0.72);
        faceBox(sink, 'structureMetal', ff, (wagon.u0 + wagon.u1) / 2, (wagon.y0 + wagon.y1) / 2, -back + 0.03, wagon.u1 - wagon.u0, wagon.y1 - wagon.y0, 0.04, { colour: leaf, decor: true });
        for (let x = wagon.u0 + 0.25; x < wagon.u1 - 0.1; x += 0.3) faceBox(sink, 'structureMetal', ff, x, (wagon.y0 + wagon.y1) / 2, -back + 0.06, 0.06, wagon.y1 - wagon.y0, 0.02, { colour: shade(leaf, 0.8), decor: true, fine: true }, 'caps');
        faceBox(sink, 'structureMetal', ff, (man.u0 + man.u1) / 2, (man.y0 + man.y1) / 2, -back + 0.03, 1.0, man.y1 - man.y0, 0.04, { colour: STEEL, decor: true });
        facePanel(sink, 'glass', ff, 0, h - 1.6, -back + 0.012, fband.u1 - fband.u0, 1.0, { decor: true, window: ff.out });
        const nm = Math.max(2, Math.round((fband.u1 - fband.u0) / 1.3));
        for (let j = 1; j < nm; j++) faceBox(sink, 'structureMetal', ff, fband.u0 + (fband.u1 - fband.u0) * j / nm, h - 1.6, -back + 0.035, 0.05, 1.0, 0.04, { colour: shade(sheet, 0.6), decor: true, fine: true }, 'caps');
        faceBox(sink, 'structureMetal', ff, 0, fband.y0 - 0.03, 0.04, fband.u1 - fband.u0 + 0.1, 0.06, 0.08, { colour: shade(sheet, 0.8), decor: true });
      }
      // (the rust skin's front panels are laid in the front face's own frame: u along +x from the section's middle)
      rustSkin(sink, x0, 0.6, z0, x1, h, z1, tone, ctx.variant, [{ face: 1, ...band }, { face: 3, ...band }, ...frontCuts.map((c) => ({ face: 0, ...c }))]);
      // (props census #13, lane B 2026-10-15) the section a body of its own for the damage reading: the steps break one by
      // one into their own heaps (the mill went down to the default kit's bounding-box spalls)
      recordBody(sink, cx, (z0 + z1) / 2, wk, sec, h, 'structureMetal');
      // the monitor roof: a raised clerestory along the section's ridge under its own low gable, its sides louvred: the
      // louvre bands cut through its cladding, the blades across them, the mill's dark behind (it was a solid box)
      const roof: RoofSpec = { kind: 'gable', pitchDeg: 14, eave: 0.35, verge: 0.2, thickness: 0.06, bucket: 'roof', ridge: 'saddle' };
      sink.placed(0, cx, 0, (z0 + z1) / 2, () => emitRoof(sink, roofGeometry(wk, sec, h, roof), roof));
      const rg = roofGeometry(wk, sec, h, roof), my0 = rg.ridgeY - 0.3, my1 = rg.ridgeY + 1.2, ml = sec - 1.2, mc = 0.15;
      const louvre = { u0: -(ml - 0.6) / 2, u1: (ml - 0.6) / 2, y0: rg.ridgeY + 0.15, y1: rg.ridgeY + 0.95 };
      sink.span('structureMetal', cx - 1.2 + mc, my0, z0 + 0.6, cx + 1.2 - mc, my1, z1 - 0.6, { colour: shade(sheet, 0.9) });
      for (const side of [1, -1]) {
        const mf: Face = { origin: [cx + side * 1.2, 0, (z0 + z1) / 2], u: [0, 0, -side], out: [side, 0, 0], width: ml };
        holedPolygon(sink, 'structureMetal', mf, [[-ml / 2, my0], [ml / 2, my0], [ml / 2, my1], [-ml / 2, my1]], [louvre], mc, 0.12, { colour: shade(sheet, 0.9) });
        for (let y = louvre.y0 + 0.08; y < louvre.y1 - 0.04; y += 0.16) {
          faceBox(sink, 'structureMetal', mf, 0, y, -0.06, louvre.u1 - louvre.u0 + 0.08, 0.03, 0.1, { colour: shade(sheet, 0.7), decor: true }, 'ends');
        }
      }
      sink.placed(0, cx, 0, (z0 + z1) / 2, () => emitRoof(sink, roofGeometry(2.4, sec - 1.2, my1, roof), roof));
      for (const f of sides) {
        facePanel(sink, 'glass', f, 0, h - 1.6, -back + 0.012, sec - 1.4, 1.0, { decor: true, window: f.out });
        const nm = Math.max(2, Math.round((sec - 1.4) / 1.3));
        for (let j = 1; j < nm; j++) {
          faceBox(sink, 'structureMetal', f, band.u0 + (band.u1 - band.u0) * j / nm, h - 1.6, -back + 0.035, 0.05, 1.0, 0.04, { colour: shade(sheet, 0.6), decor: true, fine: true }, 'caps');
        }
        faceBox(sink, 'structureMetal', f, 0, band.y0 - 0.03, 0.04, sec - 1.3, 0.06, 0.08, { colour: shade(sheet, 0.8), decor: true });
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
    // a stack beside the top section
    sink.cylinder('structureMetal', [-W / 2 + 1.0, 15.0, -D / 2 + 1.2], 'y', 6.0, 0.45, 10, { colour: BLACK, decor: true }, 0.4);
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
      roof: { kind: 'hip', pitchDeg: 24, eave: 0.6, verge: 0.6, thickness: 0.1, bucket: 'roof', ridge: 'saddle' },
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
    const verandaRoof: RoofSpec = { kind: 'shed', pitchDeg: 10, eave: 0.15, verge: 0.15, thickness: 0.06, bucket: 'structureMetal' };
    sink.placed(-Math.PI / 2, 0, 0, D / 2 + depth / 2, () => emitRoof(sink, roofGeometry(depth, W, 7.8, verandaRoof), verandaRoof, roofPaint));
    // the name board over the verandah: a cream ground, the name in dark capitals (round 3: two dark bars read as a
    // blank board), a dark rule round it
    hotelNameBoard(sink, f, W, rng); // (looks r2 b-east, 2026-10-16: extracted to queenstownSign.ts, rebuilt there)
  });
  return sink.finish();
};

/**
 * The smelters' power house (a warehouse plot): a long hall of red brick on a concrete footing, tall round-arched
 * windows down its sides, a monitor roof of iron, and the stack behind it.
 */
const powerHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the hall and its stack fill the old warehouse's reach (its bounds): the stack's base on the back edge
  const R = reach(ctx);
  const W = Math.max(10, R.W - 0.8), D = Math.max(16, R.D - 3.4), H = 8.5;
  sink.placed(0, R.cx, 0, R.z0 + 3.1 + D / 2, () => {
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'gate', u: 0, w: 3.6, y0: 0, h: 4.4 }];
    for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, D, { w: 1.6, h: 4.2, sill: 1.6, spacing: 3.4, margin: 2.0 })) openings.push(o);
    for (const o of windowRhythm('back', 0, W, { w: 1.6, h: 4.2, sill: 1.6, spacing: 3.4, margin: 2.0, avoid: [[-2.2, 2.2]] })) openings.push(o);
    const roof: RoofSpec = { kind: 'gable', pitchDeg: 20, eave: 0.45, verge: 0.35, thickness: 0.08, bucket: 'roof', ridge: 'saddle' };
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.6, out: 0.08, bucket: CONCRETE }, storeys: [{ h: H, wall: BRICK }], roof, gableBucket: BRICK,
      openings, chimneys: [], gutters: null, verge: null, reveal: 0.32,
    }, dialectOf(rng, rgb(0x3a3c3e), rgb(0x4a3a2e), 0.25, true));
    // the round heads of the tall windows: a brick arch ring over each
    for (const name of ['left', 'right', 'back'] as const) {
      const f = frame.faces[name];
      for (const o of openings.filter((q) => q.face === name && q.kind === 'window')) {
        faceBox(sink, BRICK, f, o.u, frame.floors[0] + o.y0 + o.h + 0.35, 0.04, o.w + 0.5, 0.5, 0.08, { decor: true, fineSides: true, shade: 0.75 });
      }
    }
    // the monitor along the ridge
    const rg = frame.roof;
    sink.span(BRICK, -1.4, rg.ridgeY - 0.5, -D / 2 + 2.0, 1.4, rg.ridgeY + 1.3, D / 2 - 2.0);
    sink.placed(0, 0, 0, 0, () => emitRoof(sink, roofGeometry(2.8, D - 4.0, rg.ridgeY + 1.3, roof), roof));
    // the stack at the back end
    sink.span(BRICK, -1.4, -0.4, -D / 2 - 2.8, 1.4, 3.0, -D / 2 - 0.1);
    sink.cylinder(BRICK, [0, 3.0, -D / 2 - 1.45], 'y', 22, 1.05, 12, {}, 0.7, true, Math.PI / 12);
    sink.cylinder(BRICK, [0, 25.0, -D / 2 - 1.45], 'y', 0.6, 0.85, 12, { shade: 0.5 }, 0.8, true, Math.PI / 12);
  });
  return sink.finish();
};

/**
 * The railway's engine shed (a depot plot): a long shed of corrugated iron, two tall doors in its gable end for the
 * locomotives, the smoke ventilators along its ridge, the coal stage and the water column outside.
 */
const engineShed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the shed fills the old depot's reach (its bounds, which stand off the plot's centre)
  const R = reach(ctx);
  const W = Math.max(8, R.W - 0.6), D = Math.max(12, R.D - 0.6), H = 7.0;
  const sheet = pick(rng, IRON_SHEET);
  sink.placed(0, R.cx, 0, R.cz, () => {
    // (props census #4, lane B 2026-10-14; the judges: "a span box of rusting sheet, its road doors dark plates with a
    // board laid on each, a glass strip") the shared sheet hall (hall.ts): the iron on its frame and slab, the road
    // doors cut in the gable with their leaves on the tracks and the rails running in onto the shed's floor, the lights
    // in their frames under the eaves, a side door; the smoke ventilators along the ridge as before
    const dw = Math.min(3.6, W * 0.32), doors = W > 9 ? [-W * 0.24, W * 0.24] : [0];
    const frame = sheetHall(sink, { w: W, d: D, eave: H, pitchDeg: 18, kerb: 0.3, livery: sheet, doorLivery: shade(TIMBER, 1.1), trim: shade(sheet, 0.7), doors: 'sliding',
      doorW: dw, doorH: 5.2, open: 0.4 + look() * 0.4, doorAt: doors, backDoor: null, sideDoor: -D * 0.3, clerestory: true, roofLights: false, ridgeVent: false,
      gutters: false, mobile: ctx.tier === 'mobile' }, look);
    rustSkin(sink, -W / 2, 0.3, -D / 2, W / 2, H, D / 2, sheet, look);
    const rg = frame.roof;
    for (const u of doors) {
      for (const rx of [-0.53, 0.53]) sink.span('structureMetal', u + rx - 0.04, 0.3, D / 2 - 6.0, u + rx + 0.04, 0.42, D / 2 + 1.2, { colour: STEEL, decor: true });
    }
    // the smoke ventilators along the ridge: little gabled boxes over the stalls
    for (let z = -D / 2 + 2.5; z < D / 2 - 1.5; z += 4.0) {
      sink.span('structureMetal', -0.6, rg.ridgeY - 0.2, z - 0.6, 0.6, rg.ridgeY + 0.9, z + 0.6, { colour: shade(sheet, 0.85), decor: true });
      const cap: RoofSpec = { kind: 'gable', pitchDeg: 30, eave: 0.2, verge: 0.15, thickness: 0.05, bucket: 'roof', ridge: null };
      sink.placed(0, 0, 0, z, () => emitRoof(sink, roofGeometry(1.2, 1.2, rg.ridgeY + 0.9, cap), cap));
    }
    // the water column by the door (dressing)
    sink.dressing(ctx.tier === 'mobile', () => {
      const wx = W / 2 - 0.8, wz = D / 2 - 1.2;
      sink.cylinder('structureMetal', [wx, 0.3, wz], 'y', 3.2, 0.14, 10, { colour: pick(look, [BLACK, STEEL]), decor: true });
      sink.member('structureMetal', [wx, 3.3, wz], [wx - 1.6, 3.1, wz], 0.16, 0.16, [0, 1, 0], { colour: BLACK, decor: true, exposed: true }, 0);
    });
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
        for (let t = 0; t <= 1.001; t += 0.25) sink.span('structureWood', x0 + (x1 - x0) * t - 0.04, legH + 0.3, z0 + (z1 - z0) * t - 0.04, x0 + (x1 - x0) * t + 0.04, legH + 1.25, z0 + (z1 - z0) * t + 0.04, { colour: TIMBER, decor: true, fine: true });
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
    sink.member('structureMetal', [R * 0.6, legH + 0.3, 0], [R * 0.6, 0.2, 0], 0.18, 0.18, [1, 0, 0], { colour: BLACK, decor: true, exposed: true }, 0);
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
          roof: { kind: 'hip', pitchDeg: 26, eave: 0.4, verge: 0.4, thickness: 0.06, bucket: 'roof', ridge: 'saddle' },
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
        for (let x = a + 0.05; x < b; x += 0.24) sink.span('structureWood', x - 0.03, 0, fz - 0.015, x + 0.03, 1.05, fz + 0.015, { colour: white, decor: true, fine: true });
      }
    }
  }
  return sink.finish();
};

/** An abandoned cottage (a ruin plot): its frame stripped of boards, the iron roof half gone, a fallen verandah. */
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
  });
  return sink.finish();
};

export const QUEENSTOWN_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
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
    damp: 0.6, moss: 0.3,
  },
  wear: 0.25,
});
