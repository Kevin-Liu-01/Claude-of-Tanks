// src/world/maps/regional/lorrain.ts — the Lorraine kit (Amberford: a walled market town on the Moselle between Metz and
// Pont-à-Mousson, autumn 1944). The maison lorraine of the village street: a deep house under one low roof of canal
// tiles whose ridge runs along the street, its long eaves front to the road in two or three bays — the dwelling's door
// and windows, the barn's great segmental-arched cart door (porte charretière) in dressed stone, the stable's door —
// rubble walls rendered in ochre and cream lime (crépi) with the golden Jaumont limestone of Metz at the door and window
// surrounds and the corner quoins, plank shutters in grey-green, brown or blue-grey, iron tie anchors on the front; the
// barns (granges) with their arched doors; the church with its west tower under a slate spire and buttressed nave; the
// mairie-école with its clock and bell-cote; the covered market hall on stone piers; the arcaded houses of the square; a
// round tower of the town wall; the bakehouse and the woodshed; shelled houses with their roofs gone.
import {
  PartSink, faceBox, facePanel, pick, rgb, shade, UV_MEMBER,
  type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3,
} from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, wallPolygon, windowRhythm, type HouseDialect, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import { bench, wallLantern, woodpile } from './dressing.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

/** Shutters: the Lorraine grey-green, pale grey, brown, blue-grey, an oxblood, a sage. */
const SHUTTERS: readonly Rgb[] = [0x7a8a78, 0xa4a69e, 0x6a5040, 0x6a7e8e, 0x7a3a30, 0x8a9a7a].map(rgb);
/** House doors and cart doors: oak, a green, a grey-blue, the barn's ochre and red. */
const DOORS: readonly Rgb[] = [0x5e4632, 0x3f5a46, 0x55687a, 0x8a6a3a, 0x7a3a2c].map(rgb);
const FRAME = rgb(0xd6d2c6), IRON = rgb(0x1e1e1e), SLATE = rgb(0x4a5058), PLANK = rgb(0x6e5440), CHAR = rgb(0x2a2622);

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/**
 * The base geometry's measured footprint (ctx.bounds; the plot where it is empty). The coordinator's rule (2026-10-05,
 * Titan's pacing bisect: a kit barn short of its base opened a lane between two buildings): a kit building's main body
 * fills it.
 */
interface Footprint { x0: number; x1: number; z0: number; z1: number; w: number; d: number; cx: number; cz: number }
function footprint(ctx: RegionalBuildContext): Footprint {
  const b = ctx.bounds;
  const ok = Number.isFinite(b.minX) && Number.isFinite(b.maxX) && b.maxX - b.minX > 0.5 && b.maxZ - b.minZ > 0.5;
  const x0 = ok ? b.minX : -ctx.info.w / 2, x1 = ok ? b.maxX : ctx.info.w / 2;
  const z0 = ok ? b.minZ : -ctx.info.d / 2, z1 = ok ? b.maxZ : ctx.info.d / 2;
  return { x0, x1, z0, z1, w: x1 - x0, d: z1 - z0, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}
/** Emit a body centred on the footprint, its local z along the long side (turned a quarter on a lot longer in x: its
 * local -x then faces the lot's +z); `body` gets the frame's across (W) and along (D) sizes. */
function onLot(sink: PartSink, fp: Footprint, body: (W: number, D: number) => void, turn = fp.w > fp.d + 0.5): void {
  if (turn) sink.placed(Math.PI / 2, fp.cx, 0, fp.cz, () => body(fp.d, fp.w));
  else sink.placed(0, fp.cx, 0, fp.cz, () => body(fp.w, fp.d));
}

interface LorrainState {
  rng: () => number;
  look: () => number;
  shutter: Rgb;
  door: Rgb;
  window: WindowStyle;
  litShare: number;
  /** the render family of the house (the plan's wall pick: ochre, rose or grey crépi) */
  wall: RegionalBucket;
}

function stateFor(ctx: RegionalBuildContext): LorrainState {
  const rng = ctx.rng;
  const shutter = pick(rng, SHUTTERS);
  const wall: RegionalBucket = ctx.wallBucket === 'plaster2' || ctx.wallBucket === 'plaster3' ? ctx.wallBucket : 'plaster';
  return {
    rng, look: ctx.variant, shutter, door: pick(rng, DOORS), wall,
    window: {
      frame: FRAME, frameWidth: 0.06, frameOut: 0.05, bars: 'six',
      // the dressed Jaumont surround: jambs, a deeper lintel, the sill
      surround: { bucket: 'stone', width: 0.17, out: 0.05, lintel: 0.24 }, sill: { bucket: 'stone', out: 0.1 },
      shutters: { colour: shade(shutter, 0.86 + rng() * 0.26), kind: rng() < 0.7 ? 'plank' : 'louvred', closed: 0.22 },
    },
    litShare: 0.4,
  };
}

/**
 * The porte charretière: two plank leaves at the back of the reveal (structural: the barn is closed to a hull), their
 * battens and a wicket, the dressed stone surround with its segmental arch read by springers and a keystone.
 */
function cartDoor(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, colour: Rgb): void {
  const r = sink.recess, go = r > 0 ? -r + 0.04 : 0.02;
  for (const side of [-1, 1]) {
    const cu = u + side * w / 4;
    faceBox(sink, 'structureWood', face, cu, y + h / 2, go, w / 2 - 0.02, h, 0.06, { colour, uv: UV_MEMBER });
    for (const t of [0.15, 0.5, 0.85]) faceBox(sink, 'structureWood', face, cu, y + h * t, go + 0.045, w / 2 - 0.12, 0.1, 0.03, { colour: shade(colour, 0.82), decor: true, fine: true });
  }
  faceBox(sink, 'dark', face, u - w / 4, y + 0.95, go + 0.034, 0.75, 1.8, 0.01, { decor: true });
  const fo = { decor: true, fineSides: true } as const;
  for (const side of [-1, 1]) faceBox(sink, 'stone', face, u + side * (w / 2 + 0.16), y + h / 2, 0.04, 0.32, h, 0.08, fo);
  // the arch: three voussoir blocks either side rising to the keystone, the spandrel stone above
  for (let k = 0; k < 3; k++) {
    for (const side of [-1, 1]) {
      const t = (k + 0.5) / 3, uu = u + side * (w / 2 + 0.12) * (1 - t * 0.85), yy = y + h + 0.12 + Math.sin(t * Math.PI / 2) * 0.32;
      faceBox(sink, 'stone', face, uu, yy, 0.045, w * 0.2, 0.3, 0.09, fo);
    }
  }
  faceBox(sink, 'stone', face, u, y + h + 0.48, 0.05, 0.36, 0.42, 0.1, fo);
}

function dialect(st: LorrainState): HouseDialect {
  return {
    window: (sink, face, o, y0) => windowUnit(sink, face, o.u, y0 + o.y0, o.w, o.h,
      o.kind === 'loft' ? { ...st.window, shutters: null, bars: 'none', surround: { bucket: 'stone', width: 0.12, out: 0.04 } } : st.window,
      st.rng, o.kind === 'loft' ? 0 : st.litShare),
    door: (sink, face, o, y0, frame) => {
      if (o.kind === 'gate') { cartDoor(sink, face, o.u, y0 + o.y0, o.w, o.h, shade(st.door, 0.92)); return; }
      const shop = o.kind === 'shopfront';
      doorUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: st.door, frame: { bucket: 'stone', width: 0.2, out: 0.06, arch: !shop && o.w >= 1.05 }, transom: shop || o.w >= 1.05,
        steps: { bucket: 'stone' }, leafKind: shop ? 'glazed' : 'panel',
      }, frame.floors[o.storey] + o.y0);
    },
  };
}

/** The canal-tile roof of the Lorraine plain: low, its eaves barely past the wall, the round ridge of tiles. */
const canal = (pitch: number, eave = 0.32, verge = 0.18): RoofSpec =>
  ({ kind: 'gable', pitchDeg: pitch, eave, verge, thickness: 0.16, bucket: 'roof', ridge: 'round' });

/** The dressed stone quoins at a body's four corners, long and short stones in turn (dressing). */
function quoins(sink: PartSink, b: { x0: number; x1: number; z0: number; z1: number }, y0: number, y1: number): void {
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const x = sx > 0 ? b.x1 : b.x0, z = sz > 0 ? b.z1 : b.z0;
    let k = 0;
    for (let y = y0; y < y1 - 0.2; y += 0.42, k++) {
      const lx = k % 2 ? 0.28 : 0.52, lz = k % 2 ? 0.52 : 0.28, top = Math.min(y1, y + 0.4);
      sink.quoin('stone', x - sx * lx, y, z - sz * lz, x + sx * 0.04, top, z + sz * 0.04, sx, sz, { decor: true });
    }
  }
}

/** The iron tie anchors (ancres) on a front at a floor's height: an S of flat bar over each joist end (dressing). */
function anchors(sink: PartSink, face: Face, y: number, us: readonly number[]): void {
  for (const u of us) {
    faceBox(sink, 'structureMetal', face, u, y + 0.16, 0.025, 0.05, 0.36, 0.03, { colour: IRON, decor: true, fine: true });
    for (const s of [-1, 1]) faceBox(sink, 'structureMetal', face, u + s * 0.1, y + 0.16 + s * 0.17, 0.025, 0.2, 0.05, 0.03, { colour: IRON, decor: true, fine: true });
  }
}

interface HouseOpts {
  /** the street front's bays, left to right: the dwelling, the barn's cart door, the stable */
  bays: ReadonlyArray<'logis' | 'cart' | 'stable' | 'shop'>;
  storeys: number;
  /** a café or shop: the ground floor's front glazed, a painted fascia over it */
  fascia?: Rgb;
}

/**
 * The maison lorraine: one body under a low canal-tile roof whose ridge runs along the street, its eaves front to the
 * street (the plot's +z) in bays; built in a frame turned a quarter, so the front is the house's left face. Quoins,
 * tie anchors, a woodpile and a bench on the front; a stack on the ridge.
 */
function maison(ctx: RegionalBuildContext, opts: HouseOpts): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng, look = st.look;
  // the front runs along the lot's +z side (its w), the house deep behind it (its d): a Lorraine house is often deeper
  // than its frontage, its low roof spanning the whole depth; walls and plinth fill the base footprint
  const fp = footprint(ctx);
  const F = Math.max(4.4, fp.w - 0.1), Dp = Math.max(4.4, fp.d - 0.1);
  const floorH = [2.85 + rng() * 0.2, 2.6 + rng() * 0.15, 2.5];
  const storeys = Array.from({ length: opts.storeys }, (_, i) => ({ h: floorH[Math.min(i, 2)], wall: st.wall }));
  // bay widths along the front: a dwelling bay 3.6–4.4 m, a cart bay 3.8–4.4, a stable bay 2.6, a shop 4.4; scaled to F
  const want = opts.bays.map((b) => (b === 'logis' ? 4.0 : b === 'cart' ? 4.2 : b === 'shop' ? 4.4 : 2.6));
  const scale = F / want.reduce((a, b) => a + b, 0);
  const openings: Opening[] = [];
  let u = -F / 2;
  const front: 'left' = 'left';
  const anchorsAt: number[] = [];
  opts.bays.forEach((bay, i) => {
    const bw = want[i] * scale, c = u + bw / 2;
    if (bay === 'logis') {
      openings.push({ face: front, storey: 0, kind: 'door', u: c - bw * 0.22, w: 0.98, y0: 0, h: 2.15 });
      openings.push({ face: front, storey: 0, kind: 'window', u: c + bw * 0.2, w: 0.95, y0: 0.85, h: 1.4 });
      for (let s = 1; s < opts.storeys; s++) for (const du of [-bw * 0.22, bw * 0.2]) openings.push({ face: front, storey: s, kind: 'window', u: c + du, w: 0.9, y0: 0.75, h: 1.3 });
      anchorsAt.push(c);
    } else if (bay === 'cart') {
      openings.push({ face: front, storey: 0, kind: 'gate', u: c, w: Math.min(3.2, bw - 0.9), y0: 0, h: 2.95 });
      // the hay loft's hatch above it (the gerbière)
      if (opts.storeys > 1) openings.push({ face: front, storey: opts.storeys - 1, kind: 'loft', u: c, w: 1.0, y0: 0.6, h: 1.0 });
    } else if (bay === 'stable') {
      openings.push({ face: front, storey: 0, kind: 'door', u: c - 0.35, w: 1.0, y0: 0, h: 2.0 });
      openings.push({ face: front, storey: 0, kind: 'loft', u: c + 0.65, w: 0.55, y0: 1.3, h: 0.6 });
    } else {
      openings.push({ face: front, storey: 0, kind: 'shopfront', u: c, w: Math.min(3.4, bw - 0.8), y0: 0, h: 2.6 });
      for (let s = 1; s < opts.storeys; s++) for (const du of [-bw * 0.25, bw * 0.25]) openings.push({ face: front, storey: s, kind: 'window', u: c + du, w: 0.9, y0: 0.75, h: 1.3 });
    }
    u += bw;
  });
  // the back to the garden: a door and a few windows; the gables: one window a storey, the attic vent
  openings.push({ face: 'right', storey: 0, kind: 'door', u: -F * 0.25, w: 0.95, y0: 0, h: 2.0 });
  for (const o of windowRhythm('right', 0, F, { w: 0.8, h: 1.1, sill: 1.0, spacing: 3.2, margin: 1.3, avoid: [[-F * 0.25 - 0.8, -F * 0.25 + 0.8]], max: 3 })) openings.push(o);
  for (let s = 1; s < opts.storeys; s++) for (const o of windowRhythm('right', s, F, { w: 0.8, h: 1.1, sill: 0.8, spacing: 3.2, margin: 1.3, max: 3 })) openings.push(o);
  for (const face of ['front', 'back'] as const) if (rng() < 0.7) openings.push({ face, storey: 0, kind: 'window', u: (rng() - 0.5) * Dp * 0.4, w: 0.75, y0: 1.0, h: 1.05 });
  const pitch = 23 + rng() * 5;
  {
    // built a quarter turned: the house's ridge (its z) runs along the street, its left face is the front (the lot's +z)
    sink.placed(Math.PI / 2, fp.cx, 0, fp.cz, () => {
      const frame = buildHouse(sink, {
        w: Dp, d: F, plinth: { h: 0.35, out: 0.05, bucket: 'stone' }, storeys, roof: canal(pitch), gableBucket: st.wall, openings,
        chimneys: [{ x: (rng() - 0.5) * 0.8, z: F * (rng() < 0.5 ? -0.22 : 0.22), sx: 0.6, sz: 0.6, above: 0.8, bucket: st.wall, cap: 'slab' }],
        gutters: { colour: rgb(0x6a6e6c) }, verge: null, reveal: 0.26,
      }, dialect(st));
      const b = frame.bodies[0];
      quoins(sink, b, 0.35, frame.eaveY);
      const f = frame.faces.left;
      if (opts.storeys > 1) anchors(sink, f, frame.floors[1] - 0.1, anchorsAt.flatMap((c) => [c - 1.0, c + 1.0]));
      if (opts.fascia) {
        // the café's or shop's painted fascia board over its front, a lantern by the door
        faceBox(sink, 'structureWood', f, 0, frame.floors[1] - 0.32, 0.06, F * 0.62, 0.42, 0.06, { colour: opts.fascia, decor: true });
        if (look() < 0.8) wallLantern(sink, f, -F * 0.34, 2.5);
      }
      // the woodpile against the front by the barn and the bench under the dwelling's window (dressing)
      const cart = opts.bays.indexOf('cart');
      if (cart >= 0 && look() < 0.75) {
        const ws = want.slice(0, cart).reduce((a, w) => a + w * scale, -F / 2) + want[cart] * scale;
        if (ws + 1.9 < F / 2 - 0.3) woodpile(sink, f, ws + 0.2, ws + 1.9, 1.1 + look() * 0.4, look);
      }
      if (opts.bays[0] === 'logis' && look() < 0.6) bench(sink, f, -F / 2 + want[0] * scale * 0.7, 1.3, shade(PLANK, 0.9));
    });
  }
  return sink.finish();
}

/** The grange: a deep barn under the long tile roof, the great arched cart door, a stable door, slit vents. */
const grange: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng;
  const fp = footprint(ctx);
  const F = Math.max(4.4, fp.w - 0.08), Dp = Math.max(4.4, fp.d - 0.08);
  const wall: RegionalBucket = rng() < 0.5 ? 'stone' : st.wall;
  const openings: Opening[] = [
    { face: 'left', storey: 0, kind: 'gate', u: -F * 0.12, w: Math.min(3.3, F * 0.3), y0: 0, h: 3.1 },
    { face: 'left', storey: 0, kind: 'door', u: F * 0.3, w: 1.0, y0: 0, h: 2.0 },
    { face: 'right', storey: 0, kind: 'gate', u: F * 0.12, w: Math.min(3.0, F * 0.28), y0: 0, h: 2.9 },
  ];
  for (const face of ['left', 'right'] as const) for (const uu of [-F * 0.38, F * 0.38]) openings.push({ face, storey: 0, kind: 'loft', u: uu, w: 0.18, y0: 1.6, h: 0.9 });
  {
    sink.placed(Math.PI / 2, fp.cx, 0, fp.cz, () => {
      const frame = buildHouse(sink, {
        w: Dp, d: F, plinth: { h: 0.25, out: 0.04, bucket: 'stone' }, storeys: [{ h: 4.4 + rng() * 0.6, wall }], roof: canal(24 + rng() * 4, 0.35, 0.2),
        gableBucket: wall, openings, chimneys: [], gutters: null, verge: null, reveal: 0.3, spall: wall === 'stone' ? null : undefined,
      }, { ...dialect(st), window: (s, face, o, y0) => { faceBox(s, 'dark', face, o.u, y0 + o.y0 + o.h / 2, -s.recess + 0.01, o.w, o.h, 0.02, { decor: true }); } });
      quoins(sink, frame.bodies[0], 0.25, frame.eaveY);
    });
  }
  return sink.finish();
};

/**
 * The village church: the nave of limestone under a steep tile roof with buttresses between tall round-headed windows,
 * the narrower choir at the east end, the west tower rising a storey past the ridge under a slate spire with its cross,
 * the belfry's louvred openings. The tower stands on the plot's +z end (its long axis).
 */
const church: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng;
  const fp = footprint(ctx);
  const wallH = 6.2 + rng() * 0.8;
  const arched: WindowStyle = { frame: rgb(0x5a5e5e), frameWidth: 0.06, frameOut: 0.04, bars: 'six', surround: { bucket: 'stone', width: 0.2, out: 0.06, lintel: 0.34 }, sill: { bucket: 'stone', out: 0.1 }, shutters: null };
  onLot(sink, fp, (Wl, Ll) => {
    // the buttresses (0.6 m) reach the lot's sides, the flat east end (chevet plat) of the choir and the tower its ends
    const W = Math.max(4.6, Wl - 1.3), L = Math.max(10, Ll - 0.1);
    const T = clamp(W * 0.62, 3.6, 5.6), choirD = clamp(L * 0.2, 3.0, 6), choirW = W;
    const naveD = L - T - choirD;
    const z0 = -L / 2, zc1 = z0 + choirD, zn1 = zc1 + naveD;
    // the nave
    sink.placed(0, 0, 0, (zc1 + zn1) / 2, () => {
      const openings: Opening[] = [];
      for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, naveD, { w: 1.0, h: 2.7, sill: 2.4, spacing: 3.0, margin: 1.4 })) openings.push(o);
      const frame = buildHouse(sink, {
        w: W, d: naveD, plinth: { h: 0.5, out: 0.08, bucket: 'stone' }, storeys: [{ h: wallH, wall: 'stone' }], roof: canal(42, 0.4, 0.15),
        gableBucket: 'stone', openings, chimneys: [], gutters: null, verge: null, reveal: 0.4, spall: null,
      }, { window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, arched, rng, 0.25), door: () => {} });
      // buttresses between the windows
      for (const sx of [-1, 1]) for (let k = 0, n = Math.max(2, Math.round(naveD / 3)); k <= n; k++) {
        const z = -naveD / 2 + naveD * k / n;
        sink.span('stone', sx * W / 2 - (sx < 0 ? 0.6 : 0), -0.3, z - 0.32, sx * W / 2 + (sx > 0 ? 0.6 : 0), wallH * 0.72, z + 0.32);
        sink.span('stone', sx * W / 2 - (sx < 0 ? 0.35 : 0), wallH * 0.72, z - 0.28, sx * W / 2 + (sx > 0 ? 0.35 : 0), wallH * 0.92, z + 0.28);
      }
      return frame;
    });
    // the choir, narrower and lower, its east window
    sink.placed(0, 0, 0, (z0 + zc1) / 2, () => {
      buildHouse(sink, {
        w: choirW, d: choirD, plinth: { h: 0.5, out: 0.08, bucket: 'stone' }, storeys: [{ h: wallH - 0.9, wall: 'stone' }], roof: canal(42, 0.35, 0.12),
        gableBucket: 'stone', openings: [{ face: 'back', storey: 0, kind: 'window', u: 0, w: 1.1, y0: 2.2, h: 2.6 }], chimneys: [], gutters: null, verge: null, reveal: 0.4, spall: null,
      }, { window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, arched, rng, 0.2), door: () => {} });
    });
    // the west tower: the porch door, the clock, the belfry, the slate spire and its cross
    const tz = zn1 + T / 2, towerH = wallH + 8 + rng() * 3;
    sink.span('stone', -T / 2, -0.4, zn1 - 0.05, T / 2, towerH, zn1 + T);
    sink.band('stone', -T / 2 - 0.12, towerH - 4.6, zn1 - 0.17, T / 2 + 0.12, towerH - 4.35, zn1 + T + 0.12, { decor: true });
    const tf: Face = { origin: [0, 0, zn1 + T], u: [1, 0, 0], out: [0, 0, 1], width: T };
    doorUnit(sink, tf, 0, 0, 1.5, 2.9, { leaf: st.door, frame: { bucket: 'stone', width: 0.28, out: 0.1, arch: true }, transom: false, steps: { bucket: 'stone' }, leafKind: 'plank' }, 0.2);
    const faces: Face[] = [tf, { origin: [T / 2, 0, tz], u: [0, 0, -1], out: [1, 0, 0], width: T }, { origin: [0, 0, zn1 - 0.05], u: [-1, 0, 0], out: [0, 0, -1], width: T },
      { origin: [-T / 2, 0, tz], u: [0, 0, 1], out: [-1, 0, 0], width: T }];
    for (const f of faces) {
      // the belfry's twin louvred openings
      for (const du of [-T * 0.2, T * 0.2]) {
        faceBox(sink, 'dark', f, du, towerH - 2.2, 0.01, 0.62, 1.7, 0.02, { decor: true });
        for (let k = 0; k < 5; k++) faceBox(sink, 'structureWood', f, du, towerH - 2.9 + k * 0.33, 0.04, 0.62, 0.06, 0.08, { colour: rgb(0x4a3e34), decor: true, fine: true });
      }
    }
    // the clock on the west face, under the belfry
    sink.cylinder('structureMetal', [0, towerH - 6.0, zn1 + T + 0.02], 'z', 0.06, 0.62, 16, { colour: rgb(0xe0dccf), decor: true });
    sink.cylinder('structureMetal', [0, towerH - 6.0, zn1 + T + 0.08], 'z', 0.03, 0.08, 6, { colour: IRON, decor: true });
    // the spire: a slate pyramid, broaches at its foot, the cross
    const spireH = T * 2.3, s = T / 2 + 0.2;
    const base: Vec3[] = [[-s, towerH, zn1 - 0.25], [s, towerH, zn1 - 0.25], [s, towerH, zn1 + T + 0.2], [-s, towerH, zn1 + T + 0.2]];
    const apex: Vec3 = [0, towerH + spireH, tz];
    for (let k = 0; k < 4; k++) sink.polygon('structureMetal', [base[(k + 1) % 4], base[k], apex], { colour: SLATE });
    sink.polygon('structureMetal', [base[0], base[1], base[2], base[3]], { colour: shade(SLATE, 0.7) });
    sink.span('structureMetal', -0.04, towerH + spireH - 0.1, tz - 0.04, 0.04, towerH + spireH + 1.3, tz + 0.04, { colour: IRON, decor: true });
    sink.span('structureMetal', -0.32, towerH + spireH + 0.75, tz - 0.035, 0.32, towerH + spireH + 0.83, tz + 0.035, { colour: IRON, decor: true });
  });
  return sink.finish();
};

/** The wayside chapel: a small nave of limestone under a tile roof, its arched door, the bell-cote over the front gable. */
const chapel: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const fp = footprint(ctx);
  const st = stateFor(ctx), rng = st.rng;
  const W = Math.max(3.6, fp.w - 0.12), D = Math.max(4.0, fp.d - 0.12);
  sink.placed(0, fp.cx, 0, fp.cz, () => {
    const arched: WindowStyle = { frame: rgb(0x5a5e5e), frameWidth: 0.05, frameOut: 0.04, bars: 'two', surround: { bucket: 'stone', width: 0.16, out: 0.05, lintel: 0.28 }, sill: { bucket: 'stone', out: 0.08 }, shutters: null };
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'door', u: 0, w: 1.2, y0: 0, h: 2.4 },
      ...windowRhythm('left', 0, D, { w: 0.7, h: 1.7, sill: 1.6, spacing: 2.6, margin: 1.2, max: 2 }),
      ...windowRhythm('right', 0, D, { w: 0.7, h: 1.7, sill: 1.6, spacing: 2.6, margin: 1.2, max: 2 }),
    ];
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.35, out: 0.06, bucket: 'stone' }, storeys: [{ h: 4.0, wall: rng() < 0.5 ? 'stone' : st.wall }], roof: canal(38, 0.3, 0.15),
      gableBucket: 'stone', openings, chimneys: [], gutters: null, verge: null, reveal: 0.32,
    }, { ...dialect(st), window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, arched, rng, 0.2) });
    // the bell-cote: a stone pier on the front gable's apex with its open arch, the bell and the cross
    const top = frame.roof.ridgeY, z = D / 2 - 0.25;
    sink.span('stone', -0.7, top - 0.9, z - 0.25, 0.7, top + 1.6, z + 0.25);
    faceBox(sink, 'dark', { origin: [0, 0, z + 0.25], u: [1, 0, 0], out: [0, 0, 1], width: 1.4 }, 0, top + 0.7, 0.01, 0.6, 0.9, 0.02, { decor: true });
    sink.cylinder('structureMetal', [0, top + 0.45, z], 'y', 0.42, 0.24, 8, { colour: rgb(0x6a5a3a), decor: true }, 0.12);
    sink.span('stone', -0.82, top + 1.6, z - 0.32, 0.82, top + 1.82, z + 0.32);
    sink.span('structureMetal', -0.03, top + 1.82, z - 0.03, 0.03, top + 2.7, z + 0.03, { colour: IRON, decor: true });
    sink.span('structureMetal', -0.22, top + 2.35, z - 0.025, 0.22, top + 2.42, z + 0.025, { colour: IRON, decor: true });
  });
  return sink.finish();
};

/**
 * The mairie-école: two storeys of dressed stone and render, symmetrical, the town hall's door in the middle of the
 * front gable under its panel, the classrooms' tall windows down the long sides, a hipped roof, the clock in the gable
 * and the bell-cote on the ridge, the flagstaff.
 */
const mairie: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const fp = footprint(ctx);
  const st = stateFor(ctx), rng = st.rng, look = st.look;
  const W = Math.max(5.6, fp.w - 0.12), D = Math.max(7.0, fp.d - 0.12);
  sink.placed(0, fp.cx, 0, fp.cz, () => {
    const school: WindowStyle = { ...st.window, shutters: null, surround: { bucket: 'stone', width: 0.18, out: 0.06, lintel: 0.26 } };
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'door', u: 0, w: 1.3, y0: 0, h: 2.5 },
      { face: 'front', storey: 0, kind: 'window', u: -W * 0.3, w: 1.1, y0: 0.9, h: 1.7 },
      { face: 'front', storey: 0, kind: 'window', u: W * 0.3, w: 1.1, y0: 0.9, h: 1.7 },
      ...[-W * 0.3, 0, W * 0.3].map((u): Opening => ({ face: 'front', storey: 1, kind: 'window', u, w: 1.0, y0: 0.7, h: 1.5 })),
    ];
    for (const face of ['left', 'right'] as const) for (const i of [0, 1]) for (const o of windowRhythm(face, i, D, { w: 1.3, h: 2.0, sill: 0.9, spacing: 2.6, margin: 1.4 })) openings.push(o);
    for (const i of [0, 1]) for (const o of windowRhythm('back', i, W, { w: 1.0, h: 1.5, sill: 0.9, spacing: 2.6, margin: 1.2, max: 2 })) openings.push(o);
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.6, out: 0.06, bucket: 'stone' }, storeys: [{ h: 3.6, wall: 'stone' }, { h: 3.3, wall: st.wall }],
      roof: { kind: 'hip', pitchDeg: 30, eave: 0.45, verge: 0.45, thickness: 0.16, bucket: 'roof', ridge: 'round' }, gableBucket: st.wall, openings,
      chimneys: [-1, 1].map((s) => ({ x: s * W * 0.25, z: -D * 0.3, sx: 0.55, sz: 0.55, above: 0.7, bucket: 'stone' as const, cap: 'slab' as const })),
      gutters: { colour: rgb(0x6a6e6c) }, verge: null, reveal: 0.3,
    }, { ...dialect(st), window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, school, rng, 0.5) });
    sink.band('stone', -W / 2 - 0.06, frame.floors[1] - 0.15, -D / 2 - 0.06, W / 2 + 0.06, frame.floors[1] + 0.1, D / 2 + 0.06, { decor: true });
    quoins(sink, frame.bodies[1], frame.floors[1], frame.eaveY);
    const f = frame.faces.front;
    // the panel over the door (its lettering is a dark band) and the clock above the first floor
    faceBox(sink, 'stone', f, 0, frame.floors[1] - 0.45, 0.06, 2.4, 0.5, 0.08, { decor: true });
    faceBox(sink, 'structureMetal', f, 0, frame.floors[1] - 0.45, 0.105, 1.8, 0.14, 0.01, { colour: rgb(0x2e2e2e), decor: true, fine: true });
    sink.cylinder('structureMetal', [0, frame.eaveY - 0.4, D / 2 + 0.02], 'z', 0.06, 0.48, 16, { colour: rgb(0xe0dccf), decor: true });
    // the bell-cote on the ridge: four posts, a pyramid cap, the bell
    const rz = (frame.roof.ridgeHalf > 0.6 ? frame.roof.ridgeHalf - 0.4 : 0), ry = frame.roof.ridgeTopY;
    for (const [px, pz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]] as const) sink.span('structureWood', px - 0.06, ry - 0.3, rz + pz - 0.06, px + 0.06, ry + 1.4, rz + pz + 0.06, { colour: rgb(0x5a4a3a) });
    const cap: RoofSpec = { kind: 'hip', pitchDeg: 45, eave: 0.12, verge: 0.12, thickness: 0.06, bucket: 'structureMetal', ridge: null };
    sink.placed(0, 0, 0, rz, () => emitRoof(sink, roofGeometry(1.0, 1.0, ry + 1.4, cap), cap, SLATE));
    sink.cylinder('structureMetal', [0, ry + 0.55, rz], 'y', 0.45, 0.24, 8, { colour: rgb(0x6a5a3a), decor: true }, 0.12);
    // the flagstaff over the door with the tricolour (dressing)
    if (look() < 0.85) {
      sink.member('structureMetal', [0, frame.floors[1] + 0.2, D / 2 + 0.05], [0, frame.floors[1] + 1.4, D / 2 + 1.4], 0.04, 0.04, [0, 0, 1], { colour: IRON, decor: true, exposed: true }, 0);
      const colours = [rgb(0x24376e), rgb(0xe8e6e0), rgb(0xb0302a)];
      colours.forEach((c, k) => sink.span('structureWood', -0.012, frame.floors[1] + 0.55 + k * 0, D / 2 + 0.75 + k * 0.32, 0.012, frame.floors[1] + 1.25, D / 2 + 1.07 + k * 0.32, { colour: c, decor: true }));
    }
  });
  return sink.finish();
};

/** The covered market hall (halle): a tile roof on stone piers over a paved floor, open all round. */
const halle: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const fp = footprint(ctx);
  onLot(sink, fp, (W, L) => {
    sink.span('stone', -W / 2, -0.3, -L / 2, W / 2, 0.22, L / 2);
    const nz = Math.max(2, Math.round(L / 3.2) + 1), H = 3.2 + rng() * 0.4;
    for (const sx of [-1, 1]) for (let k = 0; k < nz; k++) {
      const z = -L / 2 + 0.35 + (L - 0.7) * k / (nz - 1), x = sx * (W / 2 - 0.35);
      sink.span('stone', x - 0.26, 0.22, z - 0.26, x + 0.26, H, z + 0.26);
      sink.span('stone', x - 0.34, H - 0.2, z - 0.34, x + 0.34, H, z + 0.34, { decor: true });
    }
    for (const sx of [-1, 1]) sink.span('structureWood', sx * (W / 2 - 0.35) - 0.16, H, -L / 2 + 0.1, sx * (W / 2 - 0.35) + 0.16, H + 0.32, L / 2 - 0.1, { colour: PLANK });
    emitRoof(sink, roofGeometry(W - 0.4, L - 0.2, H + 0.32, canal(27, 0.55, 0.45)), canal(27, 0.55, 0.45));
  });
  return sink.finish();
};

/** The arcaded houses of the square: two storeys over an arcade of round arches on stone piers, a deep tile roof. */
const arcades: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng;
  const fp = footprint(ctx);
  const arcade = 2.0, H0 = 3.6;
  onLot(sink, fp, (Dp, F) => {
    // the arcade along the front, the body's -x side (the lot's +z on a lot longer in x): piers and arches over the
    // walk, the shops behind it
    const nb = Math.max(2, Math.round(F / 3.2)), bay = F / nb, xf = -Dp / 2;
    for (let k = 0; k <= nb; k++) {
      const z = -F / 2 + k * bay;
      sink.span('stone', xf, -0.3, z - 0.28, xf + 0.5, H0, z + 0.28);
    }
    for (let k = 0; k < nb; k++) {
      const z = -F / 2 + (k + 0.5) * bay;
      // the arch's spandrel: the wall over the opening, its soffit stepped to read the round head
      const f: Face = { origin: [xf, 0, z], u: [0, 0, 1], out: [-1, 0, 0], width: bay };
      faceBox(sink, 'stone', f, 0, H0 - 0.35, -0.25, bay - 0.56, 0.7, 0.5, { decor: true });
      for (const side of [-1, 1]) faceBox(sink, 'stone', f, side * (bay / 2 - 0.55), H0 - 0.95, -0.25, 0.5, 0.5, 0.5, { decor: true });
    }
    // the shopfronts at the back of the arcade (a dark wall closed for the collision) and the upper storeys
    sink.span('dark', xf + arcade - 0.05, -0.3, -F / 2 + 0.3, xf + arcade + 0.05, H0, F / 2 - 0.3);
    sink.span(st.wall, xf + arcade, -0.3, -F / 2, Dp / 2, H0, F / 2);
    sink.placed(0, 0, H0, 0, () => {
      const openings: Opening[] = [];
      for (const s of [0, 1]) for (const o of windowRhythm('left', s, F, { w: 0.95, h: 1.4, sill: 0.8, spacing: 2.2, margin: 0.9 })) openings.push(o);
      for (const s of [0, 1]) for (const o of windowRhythm('right', s, F, { w: 0.9, h: 1.3, sill: 0.8, spacing: 2.6, margin: 1.2 })) openings.push(o);
      const frame = buildHouse(sink, {
        w: Dp, d: F, plinth: null, storeys: [{ h: 2.8, wall: st.wall }, { h: 2.6, wall: st.wall }], roof: canal(25 + rng() * 4, 0.35, 0.15),
        gableBucket: st.wall, openings, chimneys: [{ x: -Dp * 0.15, z: F * 0.2, sx: 0.55, sz: 0.6, above: 0.8, bucket: st.wall, cap: 'slab' }],
        gutters: { colour: rgb(0x6a6e6c) }, verge: null, reveal: 0.24,
      }, dialect(st));
      sink.band('stone', -Dp / 2 - 0.05, -0.12, -F / 2 - 0.05, Dp / 2 + 0.05, 0.14, F / 2 + 0.05, { decor: true });
      return frame;
    });
  });
  return sink.finish();
};

/** A round tower of the town wall: rubble with arrow slits and a string course, a conical tile roof, its finial. */
const tour: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const fp = footprint(ctx);
  const rng = ctx.rng;
  const R = Math.max(1.2, Math.min(fp.w, fp.d) / 2 - 0.05), H = 9 + rng() * 3;
  sink.placed(0, fp.cx, 0, fp.cz, () => {
    sink.cylinder('stone', [0, -0.4, 0], 'y', 1.4, R + 0.25, 16, {}, R);
    sink.cylinder('stone', [0, 1.0, 0], 'y', H - 1.0, R, 16, {}, R * 0.96);
    sink.cylinder('stone', [0, H - 0.3, 0], 'y', 0.3, R * 0.96 + 0.12, 16, { decor: true }, R * 0.96 + 0.12);
    sink.cylinder('roof', [0, H, 0], 'y', R * 2.2, R * 0.96 + 0.35, 16, {}, 0.05);
    sink.cylinder('structureMetal', [0, H + R * 2.2 - 0.1, 0], 'y', 0.9, 0.05, 6, { colour: IRON, decor: true }, 0.02);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + 0.4, y = 2.4 + (k % 2) * 3.2;
      const f: Face = { origin: [Math.cos(a) * R * 0.98, 0, Math.sin(a) * R * 0.98], u: [Math.sin(a), 0, -Math.cos(a)], out: [Math.cos(a), 0, Math.sin(a)], width: 1 };
      faceBox(sink, 'dark', f, 0, y, 0.01, 0.16, 1.1, 0.02, { decor: true });
    }
    // the low door in its dressed block, standing out of the curve: the block closed all round, the plank leaf on its face
    sink.span('stone', -0.66, -0.3, R - 0.4, 0.66, 2.5, R + 0.14);
    const door: Face = { origin: [0, 0, R + 0.14], u: [1, 0, 0], out: [0, 0, 1], width: 1.32 };
    facePanel(sink, 'structureWood', door, 0, 1.0, 0.01, 0.86, 1.95, { colour: PLANK, decor: true });
  });
  return sink.finish();
};

/**
 * The village's small outbuilding: the bakehouse (fournil) with its oven's hump and stack, or the cart shed open under
 * its arch; a garden's shed builds to its yard plot.
 */
const fournil: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const fp = footprint(ctx);
  const st = stateFor(ctx), rng = st.rng;
  const small = Math.min(fp.w, fp.d) < 3.6;
  // the oven's hump stands 0.9 m out of the back gable: the house fills the rest of the footprint
  const W = Math.max(1.8, fp.w - 0.08), D = Math.max(1.8, fp.d - (small ? 0.08 : 0.98));
  sink.placed(0, fp.cx, 0, fp.cz + (small ? 0 : 0.45), () => {
    const wall: RegionalBucket = rng() < 0.5 ? 'stone' : st.wall;
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: small ? 0 : -W * 0.18, w: 0.9, y0: 0, h: 1.9 }];
    if (!small) openings.push({ face: 'left', storey: 0, kind: 'loft', u: 0, w: 0.5, y0: 1.3, h: 0.5 });
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.2, out: 0.04, bucket: 'stone' }, storeys: [{ h: small ? 2.2 : 2.6, wall }], roof: canal(24, 0.25, 0.15),
      gableBucket: wall, openings,
      chimneys: small ? [] : [{ x: W * 0.2, z: -D * 0.3, sx: 0.5, sz: 0.5, above: 0.7, bucket: 'stone', cap: 'tile' }],
      gutters: null, verge: null, reveal: 0.22, spall: wall === 'stone' ? null : undefined,
    }, dialect({ ...st, litShare: 0 }));
    if (!small) {
      // the oven's hump against the back gable: a block and its half-round vault
      const back: Face = { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W };
      faceBox(sink, 'stone', back, 0, 0.55, 0.45, 1.7, 1.1, 0.9);
      sink.cylinder('stone', [0, 1.1, -D / 2 - 0.9], 'z', 0.9, 0.8, 10, {}, 0.8, true, 0, Math.PI);
    }
    void frame;
  });
  return sink.finish();
};

/** The woodshed (bûcher): an open lean-to on posts against a back wall, its stacked logs. */
const bucher: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const fp = footprint(ctx);
  const look = ctx.variant;
  const W = Math.max(2.0, fp.w), D = Math.max(2.0, fp.d);
  sink.placed(0, fp.cx, 0, fp.cz, () => {
    sink.span('stone', -W / 2, -0.3, -D / 2, W / 2, 2.6, -D / 2 + 0.35);
    for (const sx of [-1, 1]) sink.span('structureWood', sx * (W / 2 - 0.12) - 0.1, -0.3, D / 2 - 0.3, sx * (W / 2 - 0.12) + 0.1, 2.1, D / 2 - 0.1, { colour: PLANK });
    sink.span('structureWood', -W / 2, 1.95, D / 2 - 0.32, W / 2, 2.15, D / 2 - 0.08, { colour: PLANK });
    const tan = (2.6 - 2.15) / (D - 0.2);
    const roof: RoofSpec = { kind: 'shed', pitchDeg: Math.atan(tan) * 180 / Math.PI, eave: 0.3, verge: 0.2, thickness: 0.14, bucket: 'roof', ridge: null };
    sink.placed(-Math.PI / 2, 0, 0, 0, () => emitRoof(sink, roofGeometry(D, W, 2.15, roof), roof));
    const back: Face = { origin: [0, 0, -D / 2 + 0.35], u: [1, 0, 0], out: [0, 0, 1], width: W };
    woodpile(sink, back, -W / 2 + 0.25, W / 2 - 0.25, 1.5 + look() * 0.4, look);
  });
  return sink.finish();
};

/** A house shelled in the autumn's fighting: the front and gables standing roofless, a gable's peak, the beams fallen. */
const ruine: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const fp = footprint(ctx);
  const st = stateFor(ctx), rng = st.rng;
  const W = Math.max(3.0, fp.w - 0.1), D = Math.max(3.0, fp.d - 0.1), t = 0.5;
  sink.placed(0, fp.cx, 0, fp.cz, () => {
    sink.span('stone', -W / 2 - 0.05, -0.4, -D / 2 - 0.05, W / 2 + 0.05, 0.35, D / 2 + 0.05);
    for (const [x0, z0, x1, z1] of [[-W / 2, -D / 2, W / 2, -D / 2 + t], [-W / 2, D / 2 - t, W / 2, D / 2], [-W / 2, -D / 2 + t, -W / 2 + t, D / 2 - t], [W / 2 - t, -D / 2 + t, W / 2, D / 2 - t]] as const) {
      const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      for (let k = 0; k < 4; k++) {
        if (rng() < 0.22) continue;
        const a = k / 4, b = (k + 1) / 4, top = 1.0 + rng() * 4.2;
        if (along) sink.span(rng() < 0.6 ? st.wall : 'stone', x0 + (x1 - x0) * a, 0.35, z0, x0 + (x1 - x0) * b, top, z1);
        else sink.span(rng() < 0.6 ? st.wall : 'stone', x0, 0.35, z0 + (z1 - z0) * a, x1, top, z0 + (z1 - z0) * b);
      }
    }
    // one gable still standing to its peak
    const gz = rng() < 0.5 ? D / 2 : -D / 2;
    const gf: Face = gz > 0 ? { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W } : { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W };
    const peak = 5.2 + rng() * 1.2;
    wallPolygon(sink, 'stone', gf, [[-W / 2, 0.35], [W / 2, 0.35], [W / 2, 3.6], [0.4, peak], [-0.6, peak - 0.3], [-W / 2, 3.4]], t);
    for (let k = 0; k < 5; k++) {
      const a: Vec3 = [(rng() - 0.5) * W * 0.8, 0.45, (rng() - 0.5) * D * 0.8];
      const b: Vec3 = [a[0] + (rng() - 0.5) * 3.4, 0.45 + rng() * 2.2, a[2] + (rng() - 0.5) * 3.4];
      sink.member('structureWood', a, b, 0.2, 0.18, [0, 1, 0], { colour: k % 2 ? CHAR : PLANK, decor: true, exposed: true });
    }
  });
  return sink.finish();
};

export const LORRAIN_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  cottage: (ctx) => maison(ctx, { bays: ctx.info.w * ctx.info.d > 52 ? ['logis', 'stable'] : ['logis'], storeys: 2 }),
  farmhouse: (ctx) => maison(ctx, { bays: ['logis', 'cart', 'stable'], storeys: 2 }),
  tavern: (ctx) => maison(ctx, { bays: ['shop', 'logis'], storeys: 3, fascia: rgb(0x3f5a46) }),
  cornershop: (ctx) => maison(ctx, { bays: ['shop', 'logis'], storeys: 2, fascia: rgb(0x7a3a2c) }),
  barn: grange,
  church,
  chapel,
  schoolhouse: mairie,
  market: halle,
  marketRow: arcades,
  tower: tour,
  granary: fournil,
  woodshed: bucher,
  ruin: ruine,
});

export const LORRAIN_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'lorrain',
  region: 'The Moselle valley of Lorraine (Pont-à-Mousson to Metz, autumn 1944): maisons lorraines under low canal tiles, ochre crépi and Jaumont limestone',
  surfaces: {
    roof: { kind: 'canal', tint: [0.6, 0.38, 0.28] },
    stone: { kind: 'limestone', tint: [0.8, 0.69, 0.5] },
    sourced: { plaster: true, wood: true },
    tones: {
      // the crépi: ochre (the map's own tone wins), a rose-beige and a grey lime
      plaster2: (_h, s, l) => [0.06, Math.min(1, s * 0.9 + 0.08), Math.min(1, l * 1.08 + 0.06)],
      plaster3: (_h, s, l) => [0.1, Math.min(1, s * 0.3), Math.min(1, l * 1.1 + 0.05)],
    },
  },
  builders: LORRAIN_BUILDERS,
  weather: {
    plaster: [[1, 1, 1], [1.0, 0.95, 0.88], [0.96, 0.94, 0.9], [1.02, 0.97, 0.9], [0.92, 0.9, 0.86]],
    stone: [[1, 1, 1], [0.94, 0.92, 0.88], [1.02, 0.98, 0.92], [0.9, 0.88, 0.85]],
    roof: [[1, 1, 1], [0.9, 0.86, 0.8], [0.84, 0.8, 0.76], [1.04, 0.98, 0.92], [0.94, 0.9, 0.86]],
    damp: 0.75, moss: 0.45,
  },
  wear: 0.3,
  // the gardens behind the houses: a low stone wall, a gate, the woodshed in a corner, the kitchen garden (yards.ts)
  yard: { kinds: ['cottage', 'farmhouse'], fence: 'wallstone', gate: 'gate', shed: 'woodshed', shedSize: [3.4, 2.8], garden: true },
});
