// src/world/maps/regional/kyushu.ts — the Kyushu kit (Obsidian Caldera: the Aso caldera, Kumamoto prefecture). The
// farming villages of the caldera floor and the sulphur works by the vents: the minka, a long farmhouse of earth
// plaster over dark cedar boards on a stone footing, its deep hip-and-gable (irimoya) roof of miscanthus thatch, of
// ibushi-gawara tile, or thatch sheathed in painted tin, a veranda and sliding screens along its south front; the kura,
// a white-plastered storehouse on a namako-tiled base under a heavy tile gable; the naya, a timber barn under rusting
// tin; the vinyl greenhouses in their rows; the agricultural co-op's rice warehouse; the sulphur works, timber refinery
// sheds stained yellow with their retorts and brick stacks; the village fire brigade's post and its fire lookout
// (hinomi-yagura) with the alarm bell; the small Shinto shrine behind its torii; the works office of painted
// clapboard; and the burnt-out farmsteads.
import { PartSink, bodyFaces, faceBox, pick, rgb, shade, type Face, type RegionalBucket, type Rgb, type Vec3 } from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, windowRhythm, type HouseDialect, type HouseFrame, type Opening, type RoofGeometry, type RoofSpec } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

/** White lime plaster (shikkui), earth plaster (tsuchikabe), grey cement render; Aso's grey andesite; ibushi tile. */
const SHIKKUI: RegionalBucket = 'plaster', EARTH: RegionalBucket = 'plaster2', CEMENT: RegionalBucket = 'plaster3', STONE: RegionalBucket = 'stone';
/** Cedar boards: charred or stained near black (yakisugi), weathered grey-brown, fresh. */
const CEDAR: readonly Rgb[] = [0x2e2621, 0x3a3029, 0x5e4c3e, 0x6a5646].map(rgb);
const CEDAR_DARK = rgb(0x2a231e), CEDAR_GREY = rgb(0x6f6458), FRESH = rgb(0x8a7056);
/** Tin sheathing over thatch (tottan yane) and the barns' corrugated roofs: red oxide, blue, green, rust. */
const TIN: readonly Rgb[] = [0x8a3a2e, 0x3f5f8a, 0x4f6a52, 0x7a5040, 0x9a4a32].map(rgb);
const VINYL = rgb(0xdfe6e8), HOOP = rgb(0xb8bcbc), IRON = rgb(0x3a3c3e), SULPHUR = rgb(0xc9b23c), VERMILION = rgb(0xb8402a);

/** The base's reach (ctx.bounds): its size, centre and edges. A kit body sized from it opens no lane beside it. */
function reach(ctx: RegionalBuildContext): { W: number; D: number; cx: number; cz: number; x0: number; x1: number; z0: number; z1: number } {
  const b = ctx.bounds;
  return { W: b.maxX - b.minX, D: b.maxZ - b.minZ, cx: (b.maxX + b.minX) / 2, cz: (b.maxZ + b.minZ) / 2, x0: b.minX, x1: b.maxX, z0: b.minZ, z1: b.maxZ };
}

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/**
 * The irimoya's gables: on a hip roof `rg`, at each ridge end a vertical gable (tsuma) standing a little in from the hip,
 * its triangle of `gableBucket` (lattice-boarded or plastered), and the main slopes carried out over it as short slabs.
 * In the roof's own frame (ridge along z).
 */
function irimoyaGables(sink: PartSink, rg: RoofGeometry, roof: RoofSpec, gableBucket: RegionalBucket, colour: Rgb | undefined, gableColour?: Rgb): void {
  if (rg.kind !== 'hip' || rg.ridgeHalf < 0.5) return;
  const cosP = Math.cos(Math.atan(rg.tanP));
  const topY = rg.ridgeY + roof.thickness / cosP;
  // the gable stands a fifth of the way down the hip from the ridge end, its foot on the hip's surface there
  const hipRun = rg.halfD + roof.verge - rg.ridgeHalf;
  const zt = rg.ridgeHalf + hipRun * 0.32;
  const footY = rg.topAt(0, zt) ?? rg.eaveY;
  const half = Math.max(0.3, (topY - footY) / rg.tanP);
  const opts = colour ? { colour } : {};
  for (const end of [1, -1]) {
    const z = end * zt;
    const tri: Vec3[] = [[-half, footY, z], [half, footY, z], [0, topY - 0.05, z]];
    // a triangle facing out (+z at the +z end): prism inward from the face
    sink.prism(gableBucket, end > 0 ? [...tri].reverse() : tri, [0, 0, -end], 0.12, gableColour ? { colour: gableColour } : {});
    // the slopes carried out over the gable: two slabs from the ridge end to 0.5 m past the gable
    for (const side of [1, -1]) {
      const z0 = end * (rg.ridgeHalf - 0.2), z1 = end * (zt + 0.55);
      const a: Vec3 = [0, topY, z0], b: Vec3 = [0, topY, z1];
      const c: Vec3 = [side * (half + 0.35), footY - 0.35 * rg.tanP, z1], d: Vec3 = [side * (half + 0.35), footY - 0.35 * rg.tanP, z0];
      const pts = side * end > 0 ? [a, b, c, d] : [a, d, c, b];
      const n: Vec3 = [side * Math.sin(Math.atan(rg.tanP)), Math.cos(Math.atan(rg.tanP)), 0];
      sink.prism(roof.bucket, pts, n, roof.thickness * 0.6, { ...opts, decor: true });
    }
  }
}

/** Window and door dialect of the kit: dark timber frames, sliding glazed or shoji panels, plank doors. */
const SASH: WindowStyle = { frame: CEDAR_DARK, frameWidth: 0.05, frameOut: 0.04, bars: 'six', surround: null, sill: null, shutters: null };
function dialectOf(rng: () => number, door: Rgb, lit = 0.35): HouseDialect {
  return {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, o.kind === 'loft' ? { ...SASH, bars: 'none' } : SASH, rng, o.kind === 'loft' ? 0 : lit),
    door: (s, face, o, y0, frame) => {
      if (o.kind === 'gate') { gateUnit(s, face, o.u, y0 + o.y0, o.w, o.h, shade(CEDAR_GREY, 0.95), { bucket: 'structureWood', width: 0.14, out: 0.05, colour: CEDAR_DARK }); return; }
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: door, frame: { bucket: 'structureWood', width: 0.1, out: 0.05, colour: CEDAR_DARK }, steps: { bucket: STONE }, leafKind: 'plank' }, frame.floors[o.storey] + o.y0);
    },
  };
}

/**
 * A koshi window (Caldera round 2, wave 114: the windows "flat grey panels"): a shoji panel set back in the opening (lit
 * at night) behind a lattice of fine vertical cedar slats, in a dark frame proud of the wall.
 */
function koshiWindow(sink: PartSink, face: Face, u: number, y0: number, w: number, h: number): void {
  faceBox(sink, 'curtain', face, u, y0 + h / 2, -0.06, w, h, 0.02, { decor: true, window: face.out });
  faceBox(sink, 'structureWood', face, u, y0 + h + 0.05, 0.04, w + 0.18, 0.1, 0.09, { colour: CEDAR_DARK, decor: true });
  faceBox(sink, 'structureWood', face, u, y0 - 0.05, 0.04, w + 0.18, 0.1, 0.09, { colour: CEDAR_DARK, decor: true });
  for (const side of [-1, 1]) faceBox(sink, 'structureWood', face, u + side * (w / 2 + 0.045), y0 + h / 2, 0.04, 0.09, h + 0.2, 0.09, { colour: CEDAR_DARK, decor: true });
  const n = Math.max(5, Math.round(w / 0.08));
  for (let k = 1; k < n; k++) faceBox(sink, 'structureWood', face, u - w / 2 + (w * k) / n, y0 + h / 2, 0.0, 0.028, h, 0.035, { colour: CEDAR_DARK, decor: true, fine: true });
}

/** The farmhouses' dialect: koshi windows, plank doors and the doma's gate. */
function farmDialect(rng: () => number, door: Rgb): HouseDialect {
  const base = dialectOf(rng, door);
  return { ...base, window: (s, face, o, y0) => koshiWindow(s, face, o.u, y0 + o.y0, o.w, o.h) };
}

/** Sliding screens along a front between `u0` and `u1`: dark frames over shoji paper (lit at night) in a grid. */
function screens(sink: PartSink, face: Face, u0: number, u1: number, y0: number, h: number): void {
  const n = Math.max(2, Math.round((u1 - u0) / 0.9));
  const w = (u1 - u0) / n;
  for (let k = 0; k < n; k++) {
    const u = u0 + (k + 0.5) * w;
    faceBox(sink, 'curtain', face, u, y0 + h / 2, 0.02, w - 0.08, h - 0.1, 0.02, { decor: true, window: face.out });
    faceBox(sink, 'structureWood', face, u, y0 + h / 2, 0.04, 0.06, h, 0.04, { colour: CEDAR_DARK, decor: true, fine: true });
    for (const t of [0.25, 0.5, 0.75]) faceBox(sink, 'structureWood', face, u, y0 + h * t, 0.04, w - 0.08, 0.03, 0.03, { colour: CEDAR_DARK, decor: true, fine: true });
  }
  faceBox(sink, 'structureWood', face, (u0 + u1) / 2, y0 + h + 0.06, 0.045, u1 - u0 + 0.1, 0.12, 0.06, { colour: CEDAR_DARK, decor: true });
}

/**
 * The minka (a depot or shed plot): the long farmhouse, earth plaster over a dado of dark cedar boards on a stone
 * footing, the irimoya roof of thatch, tile or tin-sheathed thatch, a veranda (engawa) under a lean-to along the south
 * front with its sliding screens, the doma's wide door at one end. The front is the plot's +x side (its long side).
 */
function minkaBody(sink: PartSink, rng: () => number, look: () => number, W: number, D: number): HouseFrame {
  const kind = rng(), thatch = kind < 0.4, tile = kind >= 0.4 && kind < 0.7;
  const tin = pick(rng, TIN);
  const openings: Opening[] = [{ face: 'right', storey: 0, kind: 'gate', u: D / 2 - 1.8, w: 2.2, y0: 0, h: 2.2 }];
  for (const o of windowRhythm('left', 0, D, { w: 1.2, h: 0.9, sill: 1.2, spacing: 2.6, margin: 1.4, max: 4 })) openings.push(o);
  for (const o of windowRhythm('front', 0, W, { w: 1.0, h: 0.9, sill: 1.2, spacing: 2.6, margin: 1.4, max: 2 })) openings.push(o);
  const roof: RoofSpec = thatch
    ? { kind: 'hip', pitchDeg: 44, eave: 0.75, verge: 0.75, thickness: 0.42, bucket: 'straw', ridge: 'round' }
    : { kind: 'hip', pitchDeg: tile ? 30 : 38, eave: 0.8, verge: 0.8, thickness: tile ? 0.14 : 0.1, bucket: tile ? 'roof' : 'structureMetal', ridge: 'saddle' };
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.45, out: 0.05, bucket: STONE }, storeys: [{ h: 2.9, wall: EARTH }], roof, gableBucket: EARTH,
    ...(roof.bucket === 'structureMetal' ? { roofColour: tin } : {}),
    openings, chimneys: [], gutters: null, verge: null, reveal: 0.12, spall: null,
  }, farmDialect(rng, shade(CEDAR_GREY, 0.9)));
  irimoyaGables(sink, frame.roof, roof, 'structureWood', roof.bucket === 'structureMetal' ? tin : undefined, CEDAR_DARK);
  // the cedar dado (koshi-ita) round the walls, lath strips over it
  const b = frame.bodies[0];
  for (const name of ['front', 'back', 'left', 'right'] as const) {
    const f = frame.faces[name];
    faceBox(sink, 'structureWood', f, 0, b.y0 + 0.55, 0.018, f.width, 1.1, 0.03, { colour: pick(look, CEDAR), decor: true });
    for (let u = -f.width / 2 + 0.3; u < f.width / 2; u += 0.45) faceBox(sink, 'structureWood', f, u, b.y0 + 0.55, 0.04, 0.035, 1.1, 0.02, { colour: CEDAR_DARK, decor: true, fine: true });
  }
  // the engawa and its lean-to (hisashi) along the south front (+x): posts, a plank floor, screens behind
  const f = frame.faces.right, dy = b.y0 + 2.4, deep = 1.8;
  const n = Math.max(3, Math.round((D - 4) / 1.8));
  for (let k = 0; k <= n; k++) {
    const u = -D / 2 + 0.6 + (D - 4.6) * k / n;
    faceBox(sink, 'structureWood', f, u, dy / 2, deep - 0.08, 0.14, dy, 0.14, { colour: CEDAR_DARK });
  }
  faceBox(sink, 'structureWood', f, -1.6, 0.5, deep / 2, D - 3.2 - 0.2, 0.12, deep - 0.1, { colour: FRESH, decor: true });
  screens(sink, f, -D / 2 + 0.6, D / 2 - 4.0, b.y0, 2.0);
  const hisashi: RoofSpec = { kind: 'shed', pitchDeg: 16, eave: 0.25, verge: 0.2, thickness: 0.08, bucket: thatch || tile ? 'roof' : 'structureMetal' };
  sink.placed(Math.PI, W / 2 + deep / 2, 0, -1.6, () => emitRoof(sink, roofGeometry(deep + 0.1, D - 3.0, dy, hisashi), hisashi, thatch || tile ? undefined : tin));
  return frame;
}

const minka: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  // the house and its engawa fill the old depot's reach (its bounds, which stand off the plot's centre): the back wall
  // on the reach's back (-x) edge, the engawa's posts on its front (+x) edge
  const R = reach(ctx);
  // (half a metre in: a thatched roof's deep eaves stay inside the reach)
  const W = Math.max(5.5, Math.min(12, R.W - 2.6)), D = Math.max(8, Math.min(24, R.D - 1.0));
  sink.placed(0, R.x0 + 0.5 + W / 2, 0, R.cz, () => minkaBody(sink, ctx.rng, ctx.variant, W, D));
  return sink.finish();
};

/**
 * A kura storehouse at the origin, w x d: white plaster walls over a base of namako tiles (dark squares, white
 * pointing on the diagonal), a heavy tile gable with raised ends, the thick door and a small shuttered window high up.
 */
function kuraBody(sink: PartSink, rng: () => number, w: number, d: number, h: number): void {
  const frame = buildHouse(sink, {
    w, d, plinth: { h: 0.5, out: 0.06, bucket: STONE }, storeys: [{ h, wall: SHIKKUI }],
    roof: { kind: 'gable', pitchDeg: 27, eave: 0.55, verge: 0.5, thickness: 0.22, bucket: 'roof', ridge: 'saddle' }, gableBucket: SHIKKUI,
    openings: [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.3, y0: 0, h: 1.9 }, { face: 'back', storey: 0, kind: 'loft', u: 0, w: 0.7, y0: h - 1.3, h: 0.7 }],
    chimneys: [], gutters: null, verge: null, reveal: 0.3, spall: STONE,
  }, {
    window: (s, face, o, y0) => {
      faceBox(s, 'structureWood', face, o.u, y0 + o.y0 + o.h / 2, 0.06, o.w + 0.2, o.h + 0.2, 0.12, { colour: rgb(0x4a4440), decor: true });
    },
    door: (s, face, o, y0, fr) => {
      // the door's stepped plaster frame and the thick leaf
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: rgb(0x3e3a36), frame: { bucket: SHIKKUI, width: 0.3, out: 0.16 }, steps: { bucket: STONE }, leafKind: 'plank' }, fr.floors[o.storey] + o.y0);
    },
  });
  // the namako base band: dark tile squares with white diagonal pointing (the band dark, the pointing a lattice)
  const b = frame.bodies[0];
  for (const name of ['front', 'back', 'left', 'right'] as const) {
    const f = frame.faces[name];
    faceBox(sink, 'structureWood', f, 0, b.y0 + 0.65, 0.02, f.width, 1.3, 0.03, { colour: rgb(0x33363a), decor: true });
    // the pointing (Caldera round 2, wave 114: "a zigzag band where the diagonal namako tile grid should be"): the
    // square tiles set on the diagonal, their raised white joints two families of lines at 45 degrees, 0.3 m apart,
    // each clipped to the band's ends
    const yb = b.y0 + 0.04, H = 1.22, half = f.width / 2;
    for (const dir of [1, -1]) {
      for (let c = -half - H; c < half; c += 0.3) {
        // the line u = c + dir (y - yb) over the band, clipped to [-half, half]
        let ua = dir > 0 ? c : c + H, ub = dir > 0 ? c + H : c, ya = yb, yy = yb + H;
        const clip = (uEdge: number) => {
          const t = (uEdge - ua) / (ub - ua);
          return ya + (yy - ya) * t;
        };
        if (Math.max(ua, ub) <= -half || Math.min(ua, ub) >= half) continue;
        if (ua < -half) { ya = clip(-half); ua = -half; } else if (ua > half) { ya = clip(half); ua = half; }
        if (ub < -half) { yy = clip(-half); ub = -half; } else if (ub > half) { yy = clip(half); ub = half; }
        if (Math.hypot(ub - ua, yy - ya) < 0.12) continue;
        sink.member('structureWood', facePt(f, ua, ya, 0.04), facePt(f, ub, yy, 0.04), 0.045, 0.015, f.out,
          { colour: rgb(0xe4e0d6), decor: true, fine: true, exposed: true }, 0);
      }
    }
  }
  // the kura's mark: a crest plate on the gable (the family's mon), a dark disc high on the front
  const front = frame.faces.front;
  if (rng() < 0.7) faceBox(sink, 'structureWood', front, 0, frame.eaveY + 0.9, 0.04, 0.7, 0.7, 0.03, { colour: rgb(0x2a2a2c), decor: true });
}

function facePt(f: Face, u: number, y: number, o: number): Vec3 {
  return [f.origin[0] + f.u[0] * u + f.out[0] * o, y, f.origin[2] + f.u[2] * u + f.out[2] * o];
}

/** A row of kura (a container row plot): two or three storehouses side by side along the plot. */
const kuraRow: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the storehouses fill the old row's reach (its bounds, which stand off the plot's centre), end to end
  const R = reach(ctx);
  const L = R.W - 0.4, n = L > 13 ? 3 : 2, w = Math.max(3.2, Math.min(6, L / n - 0.5)), d = Math.max(4.5, Math.min(7.5, R.D - 0.9));
  for (let k = 0; k < n; k++) {
    const x = R.cx - L / 2 + (k + 0.5) * L / n;
    sink.placed(0, x, 0, R.cz - 0.1, () => kuraBody(sink, rng, w, d, 4.6 + rng() * 1.2));
  }
  return sink.finish();
};

/** The naya (a shed plot): a timber barn, board walls on a stone footing, a tin gable roof, open bays with straw. */
const naya: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the barn fills the old shed's reach (its bounds), lying along the reach's long side
  const R = reach(ctx), along = R.W >= R.D;
  const W = Math.max(5, (along ? R.D : R.W) - 0.4), L = Math.max(7, (along ? R.W : R.D) - 0.6);
  const tin = pick(rng, TIN), board = pick(rng, CEDAR);
  sink.placed(along ? Math.PI / 2 : 0, R.cx, 0, R.cz, () => {
    // (built along its own z, turned to lie along the reach's long side)
    sink.span(STONE, -W / 2 - 0.05, -0.4, -L / 2 - 0.05, W / 2 + 0.05, 0.3, L / 2 + 0.05);
    // (Caldera round 2, wave 114: "the barn reads as clean painted board, not rusting tin"): the walls are corrugated tin
    // on the timber frame, the paint gone to rust at the foot, in runs from the nail lines and patches where sheets lap
    const rusty = (c: Rgb, k: number): Rgb => [c[0] * (1 - k) + 0.46 * k, c[1] * (1 - k) + 0.27 * k, c[2] * (1 - k) + 0.17 * k];
    const wallTin = rusty(tin, 0.35 + look() * 0.25);
    sink.span('structureMetal', -W / 2, 0.3, -L / 2, -W / 2 + 0.06, 3.6, L / 2, { colour: wallTin });
    sink.span('structureMetal', -W / 2 + 0.06, 0.3, -L / 2, W / 2, 3.6, -L / 2 + 0.06, { colour: wallTin });
    sink.span('structureMetal', -W / 2 + 0.06, 0.3, L / 2 - 0.06, W / 2, 3.6, L / 2, { colour: wallTin });
    for (const f of [{ origin: [-W / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: L } as Face,
      { origin: [0, 0, -L / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W } as Face, { origin: [0, 0, L / 2], u: [1, 0, 0], out: [0, 0, 1], width: W } as Face]) {
      // the rusted foot, then the runs and the lapped patches
      faceBox(sink, 'structureMetal', f, 0, 0.5, 0.012, f.width, 0.4, 0.01, { colour: rusty(tin, 0.85), decor: true });
      const runs = Math.round(f.width / 1.4);
      for (let k = 0; k < runs; k++) {
        const u = -f.width / 2 + (k + 0.3 + look() * 0.4) * (f.width / runs), len = 0.5 + look() * 1.4;
        faceBox(sink, 'structureMetal', f, u, 3.5 - len / 2, 0.012, 0.08 + look() * 0.1, len, 0.01, { colour: rusty(tin, 0.75 + look() * 0.2), decor: true });
      }
      if (look() < 0.6) faceBox(sink, 'structureMetal', f, (look() - 0.5) * f.width * 0.6, 1.2 + look() * 1.6, 0.014, 0.9 + look() * 0.6, 0.6 + look() * 0.6, 0.01, { colour: rusty(tin, 0.6), decor: true });
    }
    // the open front (+x of the barn) on posts, a straw stack and a tractor's dark bay inside
    for (let k = 0; k <= 3; k++) sink.span('structureWood', W / 2 - 0.16, 0.3, -L / 2 + 0.06 + (L - 0.2) * k / 3 - 0.08, W / 2, 3.6, -L / 2 + 0.06 + (L - 0.2) * k / 3 + 0.08, { colour: CEDAR_DARK });
    sink.span('straw', -W / 2 + 0.3, 0.3, -L / 2 + 0.4, W / 2 - 0.9, 1.9, -L / 2 + L * 0.42);
    const roof: RoofSpec = { kind: 'gable', pitchDeg: 22, eave: 0.6, verge: 0.4, thickness: 0.07, bucket: 'structureMetal', ridge: 'saddle' };
    const rg = roofGeometry(W, L, 3.6, roof);
    emitRoof(sink, rg, roof, tin);
    if (rg.gable) for (const z of [L / 2, -L / 2]) {
      const pts: Vec3[] = rg.gable.map(([u, y]) => [u, y, z] as Vec3);
      sink.prism('structureWood', z > 0 ? [...pts].reverse() : pts, [0, 0, z > 0 ? -1 : 1], 0.06, { colour: board });
    }
    sink.dressing(ctx.tier === 'mobile', () => {
      for (let k = 0; k < 6; k++) {
        sink.cylinder('structureWood', [W / 2 + 0.6 + look() * 0.6, 0, -L / 2 + 1 + k * 0.9], 'y', 1.1 + look() * 0.3, 0.32, 7, { colour: rgb(0xb8a070), decor: true }, 0.12);
      }
    });
  });
  return sink.finish();
};

/** A vinyl greenhouse (a gantry plot): steel hoops under milky film along the plot, the end walls and doors. */
const greenhouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  // the house stands between the old gantry's legs: the symmetric part of its reach about the plot's origin. The reach's
  // longer side is the crane beam's overhang, high over open ground (Caldera's south gantry overhangs the coast road's
  // edge there: a house filling the whole reach stood half a metre into the carriageway's core)
  const R = reach(ctx), halfX = Math.min(-R.x0, R.x1), halfZ = Math.min(-R.z0, R.z1);
  const L = Math.max(10, 2 * halfX - 0.6), r = Math.max(1.6, Math.min(2.6, halfZ - 0.3)), base = 0.5;
  sink.placed(0, 0, 0, 0, () => {
  sink.span(CEMENT, -L / 2 - 0.05, -0.3, -r - 0.05, L / 2 + 0.05, base, r + 0.05);
  sink.cylinder('structureMetal', [-L / 2, base, 0], 'x', L, r, 12, { colour: VINYL }, r, true, -Math.PI / 2, Math.PI);
  for (let x = -L / 2 + 0.5; x < L / 2; x += 1.0) {
    sink.cylinder('structureMetal', [x, base, 0], 'x', 0.05, r + 0.03, 12, { colour: HOOP, decor: true, fine: true }, r + 0.03, false, -Math.PI / 2, Math.PI);
  }
  for (const end of [-1, 1]) {
    const f: Face = { origin: [end * (L / 2 + 0.02), 0, 0], u: [0, 0, -end], out: [end, 0, 0], width: r * 2 };
    faceBox(sink, 'structureMetal', f, 0, base + 0.95, 0.02, 1.2, 1.9, 0.04, { colour: shade(HOOP, 0.8), decor: true });
  }
  // the ridge vent rolled up along one side
  sink.cylinder('structureMetal', [-L / 2 + 0.3, base + r * 0.62, r * 0.78], 'x', L - 0.6, 0.08, 6, { colour: rgb(0xc8ccc8), decor: true });
  });
  return sink.finish();
};

/**
 * The agricultural co-op's rice warehouse (a warehouse plot): a big gabled shed of painted corrugated steel on a
 * concrete base, its sliding door under a canopy, the co-op's green sign band.
 */
const coopWarehouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the shed fills the old warehouse's reach (its bounds): its back on the back edge, its loading dock to the front
  const R = reach(ctx), W = Math.max(10, R.W - 0.4), D = Math.max(14, R.D - 1.8), H = 6.4;
  const livery = pick(rng, [rgb(0xd8d2bc), rgb(0xb8c4c8), rgb(0xc9c0a8)]);
  sink.placed(0, R.cx, 0, R.z0 + 0.25 + D / 2, () => {
    sink.span(CEMENT, -W / 2 - 0.1, -0.4, -D / 2 - 0.1, W / 2 + 0.1, 0.9, D / 2 + 0.1);
    sink.span('structureMetal', -W / 2, 0.9, -D / 2, W / 2, H, D / 2, { colour: livery });
    const roof: RoofSpec = { kind: 'gable', pitchDeg: 18, eave: 0.5, verge: 0.4, thickness: 0.07, bucket: 'structureMetal', ridge: 'saddle' };
    const rg = roofGeometry(W, D, H, roof);
    emitRoof(sink, rg, roof, pick(rng, [rgb(0x5f6f78), rgb(0x8a3a2e), rgb(0x4f6a52)]));
    if (rg.gable) for (const z of [D / 2, -D / 2]) {
      const pts: Vec3[] = rg.gable.map(([u, y]) => [u, y, z] as Vec3);
      sink.prism('structureMetal', z > 0 ? [...pts].reverse() : pts, [0, 0, z > 0 ? -1 : 1], 0.06, { colour: livery });
    }
    const f: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    faceBox(sink, 'dark', f, 0, 0.9 + 2.0, 0.005, Math.min(4.4, W * 0.4), 4.0, 0.02, { decor: true });
    faceBox(sink, 'structureMetal', f, -Math.min(4.4, W * 0.4) / 4, 0.9 + 2.0, 0.03, Math.min(4.4, W * 0.4) / 2, 4.0, 0.04, { colour: shade(livery, 0.85), decor: true });
    faceBox(sink, 'structureMetal', f, 0, H - 0.6, 0.02, W * 0.6, 0.45, 0.03, { colour: rgb(0x2f7a4a), decor: true });
    sink.span('structureMetal', -3.0, 5.0, D / 2, 3.0, 5.12, D / 2 + 1.4, { colour: shade(livery, 0.9), decor: true, shadow: true });
    // the loading dock under the canopy, at a lorry's bed height
    sink.span(CEMENT, -3.2, -0.3, D / 2, 3.2, 1.0, D / 2 + 1.2);
    for (const side of [-1, 1]) {
      const sf: Face = { origin: [side * W / 2, 0, 0], u: [0, 0, -side], out: [side, 0, 0], width: D };
      for (let u = -D / 2 + 2.4; u < D / 2 - 2; u += 4.0) faceBox(sink, 'glass', sf, u, H - 1.2, 0.012, 1.4, 0.8, 0.02, { decor: true });
    }
  });
  return sink.finish();
};

/**
 * The sulphur works' refinery shed or the co-op's rice store (a factory plot). The refinery: a tall timber shed of dark
 * boards stained yellow at the foot, a roof monitor along the ridge for the fumes, a brick retort block with its iron
 * flue, sulphur heaped in the yard. The rice store: a large kura of white plaster on a stone base under a tile gable.
 */
const works: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // both fill the old factory's reach (its bounds): the rice store whole, the refinery with its retort block behind it
  const R = reach(ctx), W = Math.max(8, R.W - 0.8);
  if (rng() < 0.4) {
    const Dk = Math.max(12, R.D - 0.8);
    sink.placed(0, R.cx, 0, R.cz, () => kuraBody(sink, rng, W, Dk, 7.0));
    return sink.finish();
  }
  const D = Math.max(10, R.D - 3.0);
  const H = 7.5, board = pick(rng, CEDAR), tin = pick(rng, TIN);
  sink.placed(0, R.cx, 0, R.z0 + 2.7 + D / 2, () => {
  sink.span(STONE, -W / 2 - 0.05, -0.4, -D / 2 - 0.05, W / 2 + 0.05, 0.4, D / 2 + 0.05);
  sink.span('structureWood', -W / 2, 0.4, -D / 2, W / 2, H, D / 2, { colour: board });
  // the sulphur's crust on the boards (Caldera round 2, wave 114: "no retort, vents, steam or sulphur crust" — the old
  // even yellow band read as paint): blotches of every size crowding the foot and thinning up the wall, paler and
  // darker yellows and the grey-white of the dried crust, and the window band under the eaves as slatted vents
  const faces = bodyFaces(W, D);
  for (const f of [faces.front, faces.back, faces.left, faces.right]) {
    const n = Math.round(f.width / 0.9);
    for (let k = 0; k < n; k++) {
      const u = -f.width / 2 + (k + look()) * (f.width / n), hgt = 0.4 + look() * look() * 2.6, wid = 0.5 + look() * 1.3;
      const tone = look(), col: Rgb = tone < 0.15 ? rgb(0xd8d4c4) : shade(SULPHUR, 0.7 + tone * 0.45);
      faceBox(sink, 'structureWood', f, Math.max(-f.width / 2 + wid / 2, Math.min(f.width / 2 - wid / 2, u)), 0.4 + hgt / 2, 0.012 + k % 3 * 0.003,
        wid, hgt, 0.01, { colour: col, decor: true });
    }
    for (let x = -f.width * 0.4; x <= f.width * 0.4 + 1e-6; x += f.width * 0.8 / 6) {
      faceBox(sink, 'structureWood', f, x, H - 1.3, 0.02, f.width * 0.8 / 6 - 0.15, 0.75, 0.04, { colour: shade(board, 0.6), decor: true, fine: true });
    }
  }
  const front: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
  faceBox(sink, 'dark', front, 0, 0.4 + 1.7, 0.02, 3.0, 3.4, 0.03, { decor: true });
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 24, eave: 0.5, verge: 0.4, thickness: 0.07, bucket: 'structureMetal', ridge: null };
  const rg = roofGeometry(W, D, H, roof);
  emitRoof(sink, rg, roof, tin);
  if (rg.gable) for (const z of [D / 2, -D / 2]) {
    const pts: Vec3[] = rg.gable.map(([u, y]) => [u, y, z] as Vec3);
    sink.prism('structureWood', z > 0 ? [...pts].reverse() : pts, [0, 0, z > 0 ? -1 : 1], 0.06, { colour: board });
  }
  // the roof monitor along the ridge: a raised slatted vent under its own small gable
  const ry = rg.ridgeY;
  sink.span('structureWood', -0.9, ry - 0.4, -D / 2 + 1, 0.9, ry + 0.9, D / 2 - 1, { colour: shade(board, 0.85) });
  const cap: RoofSpec = { kind: 'gable', pitchDeg: 24, eave: 0.3, verge: 0.2, thickness: 0.06, bucket: 'structureMetal', ridge: null };
  emitRoof(sink, roofGeometry(1.8, D - 2, ry + 0.9, cap), cap, tin);
  // the retorts behind the shed: a row of brick melting ovens on a stone bench, each with its iron door and its own
  // flue, the sulphur run into moulds at their feet; vent pipes on the ridge; sulphur heaped by the door
  sink.span('stone', -W / 2 + 0.4, -0.3, -D / 2 - 2.4, W / 2 - 0.2, 0.9, -D / 2 - 0.1);
  const ovens = Math.max(2, Math.min(4, Math.floor((W - 0.6) / 2.6)));
  for (let k = 0; k < ovens; k++) {
    const x = -W / 2 + 0.4 + (k + 0.5) * ((W - 0.6) / ovens);
    sink.cylinder('stone', [x, 0.9, -D / 2 - 1.25], 'y', 1.3, 0.95, 10, {}, 0.8, true);
    sink.cylinder('stone', [x, 2.2, -D / 2 - 1.25], 'y', 0.5, 0.8, 10, { decor: true }, 0.25, true);
    sink.cylinder('structureMetal', [x, 2.6, -D / 2 - 1.25], 'y', 3.4 + look() * 2.4, 0.18, 8, { colour: IRON, decor: true }, 0.16);
    faceBox(sink, 'structureMetal', { origin: [0, 0, -D / 2 - 0.3], u: [1, 0, 0], out: [0, 0, 1], width: W }, x, 1.45, 0.02, 0.6, 0.5, 0.04, { colour: IRON, decor: true });
    sink.span('structureWood', x - 0.5, -0.05, -D / 2 - 0.1 + 0.05, x + 0.5, 0.12, -D / 2 + 0.35, { colour: shade(SULPHUR, 0.95), decor: true });
  }
  for (let k = 0; k < 3; k++) sink.cylinder('structureMetal', [(k - 1) * 0.5, ry + 0.9, -D / 2 + 2 + k * (D - 4) / 2], 'y', 1.6 + look(), 0.14, 8, { colour: IRON, decor: true }, 0.12);
  for (let k = 0; k < 2; k++) sink.cylinder('structureWood', [-W * 0.25 + k * 2.6, 0, D / 2 + 1.1], 'y', 1.0 + look() * 0.4, 1.0, 9, { colour: SULPHUR, decor: true }, 0.2);
  });
  return sink.finish();
};

/**
 * A works chimney or a fire lookout (a stack plot). The sulphur works' stack of brick on a stone plinth, sooted at its
 * mouth; or the village fire brigade's lookout tower (hinomi-yagura): a steel lattice on four legs, a ladder, the
 * lookout platform under a little roof with the alarm bell (hansho) hanging in it, a siren.
 */
const stack: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the Sulphur Works' stack west of its yard (the map's planned site) is always a chimney
  const nearWorks = ctx.x !== undefined && ctx.z !== undefined && Math.hypot(ctx.x + 332, ctx.z - 96) < 60;
  if (nearWorks || rng() < 0.35) {
    const base = Math.max(2.2, Math.min(3.2, Math.min(ctx.info.w, ctx.info.d) - 0.4)), H = 18 + rng() * 6;
    sink.span(STONE, -base / 2, -0.4, -base / 2, base / 2, 3.0, base / 2);
    sink.cylinder('stone', [0, 3.0, 0], 'y', H - 3.0, base * 0.42, 10, {}, base * 0.28, true, Math.PI / 10);
    sink.cylinder('stone', [0, H, 0], 'y', 0.6, base * 0.32, 10, { shade: 0.5 }, base * 0.3, true, Math.PI / 10);
    return sink.finish();
  }
  const H = 11 + rng() * 3, b0 = Math.min(1.5, Math.min(ctx.info.w, ctx.info.d) / 2 - 0.2), b1 = 0.7;
  const steel = pick(rng, [rgb(0x9a9e9c), VERMILION, rgb(0x7a8a8e)]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) sink.member('structureMetal', [sx * b0, -0.3, sz * b0], [sx * b1, H, sz * b1], 0.1, 0.1, [sx, 0, 0], { colour: steel, exposed: true }, 0);
  for (let y = 1.2; y < H - 0.5; y += 2.2) {
    const r = b0 + (b1 - b0) * y / H;
    for (const [a, b] of [[[-r, -r], [r, -r]], [[r, -r], [r, r]], [[r, r], [-r, r]], [[-r, r], [-r, -r]]] as const) {
      sink.member('structureMetal', [a[0], y, a[1]], [b[0], y, b[1]], 0.05, 0.05, [0, 1, 0], { colour: steel, decor: true, exposed: true }, 0);
    }
  }
  for (const dx of [-0.2, 0.2]) sink.member('structureMetal', [b0 + 0.1 + dx * 0, 0, dx], [b1 + 0.1, H, dx], 0.04, 0.04, [1, 0, 0], { colour: IRON, decor: true, exposed: true }, 0);
  sink.span('structureWood', -1.0, H - 0.05, -1.0, 1.0, H + 0.05, 1.0, { colour: FRESH, decor: true });
  for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]] as const) sink.span('structureMetal', x - 0.04, H, z - 0.04, x + 0.04, H + 1.8, z + 0.04, { colour: steel, decor: true });
  const cap: RoofSpec = { kind: 'hip', pitchDeg: 32, eave: 0.25, verge: 0.25, thickness: 0.05, bucket: 'structureMetal', ridge: null };
  emitRoof(sink, roofGeometry(1.8, 1.8, H + 1.8, cap), cap, steel);
  sink.cylinder('structureMetal', [0, H + 1.0, 0], 'y', 0.6, 0.25, 10, { colour: rgb(0x5a4a32), decor: true }, 0.12);
  sink.cylinder('structureMetal', [0.6, H + 2.5, 0], 'x', 0.5, 0.2, 8, { colour: rgb(0xd8d4c8), decor: true }, 0.35);
  return sink.finish();
};

/**
 * The village shrine (a water tower plot): a small honden of cedar on a stone base under a flowing (nagare) roof, its
 * front slope carried out over the steps; a torii before it, two stone lanterns, the rope (shimenawa) on the torii.
 */
const shrine: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the precinct fills the old tower's reach (its bounds): a low stone fence (tamagaki) along its sides and back, the
  // torii on its front edge
  const R = reach(ctx), P = Math.min(R.W, R.D);
  sink.placed(0, R.cx, 0, R.cz, () => {
  // (Caldera round 2, wave 114: the torii read as "a stone-block gate fused with a hut"): the honden smaller and at
  // the back of the precinct, an open approach of gravel before it, the torii free-standing at the front edge
  const hd = Math.min(1.6, P * 0.3), hw = Math.min(2.0, P * 0.38), hz = -R.D / 2 + 0.55 + hd / 2;
  {
    const fx = R.W / 2 - 0.3, fz = R.D / 2 - 0.3, fe = R.D / 2 - 1.0;
    for (const s of [-1, 1]) sink.span(STONE, s * fx - 0.15, -0.2, -fz, s * fx + 0.15, 0.6, fe);
    sink.span(STONE, -fx + 0.15, -0.2, -fz, fx - 0.15, 0.6, -fz + 0.3);
    for (const [x, z] of [[-fx, -fz], [fx, -fz], [-fx, fe], [fx, fe]] as const) sink.span(STONE, x - 0.2, 0.6, z - 0.2 + (z > 0 ? -0.1 : 0.15), x + 0.2, 0.85, z + 0.2 + (z > 0 ? -0.1 : 0.15), { decor: true });
  }
  sink.span(STONE, -hw / 2 - 0.4, -0.3, hz - hd / 2 - 0.4, hw / 2 + 0.4, 0.7, hz + hd / 2 + 0.6);
  sink.span('structureWood', -hw / 2, 0.7, hz - hd / 2, hw / 2, 2.2, hz + hd / 2, { colour: rgb(0x6a5040) });
  faceBox(sink, 'structureWood', { origin: [0, 0, hz + hd / 2], u: [1, 0, 0], out: [0, 0, 1], width: hw }, 0, 1.45, 0.02, hw * 0.6, 1.2, 0.03, { colour: CEDAR_DARK, decor: true });
  // the nagare roof: a gable whose front slope runs long over the steps (tile or cypress bark)
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 32, eave: 0.4, verge: 0.35, thickness: 0.14, bucket: 'roof', ridge: 'saddle' };
  sink.placed(Math.PI / 2, 0, 0, hz, () => emitRoof(sink, roofGeometry(hd, hw, 2.2, roof), roof));
  const lean: RoofSpec = { kind: 'shed', pitchDeg: 20, eave: 0.2, verge: 0.3, thickness: 0.1, bucket: 'roof' };
  sink.placed(-Math.PI / 2, 0, 0, hz + hd / 2 + 0.5, () => emitRoof(sink, roofGeometry(1.0, hw + 0.6, 1.9, lean), lean));
  // the torii (a myojin torii in vermilion): two round pillars leaning in a little, the nuki tie beam through them,
  // the kasagi's black cap over the shimaki, its ends swept up, the central strut (gakuzuka), the shimenawa rope
  rng();
  const tz = R.D / 2 - 0.35, tw = Math.min(2.3, P * 0.42), th = 3.1, tc = VERMILION;
  for (const s of [-1, 1]) sink.cylinder('structureMetal', [s * (tw / 2 + 0.06), 0, tz], 'y', th - 0.3, 0.16, 12, { colour: tc }, 0.13);
  sink.span('stone', -tw / 2 - 0.36, -0.1, tz - 0.3, -tw / 2 + 0.24, 0.18, tz + 0.3);
  sink.span('stone', tw / 2 - 0.24, -0.1, tz - 0.3, tw / 2 + 0.36, 0.18, tz + 0.3);
  // the nuki runs through the pillars and out past them
  sink.span('structureMetal', -tw / 2 - 0.42, th - 1.05, tz - 0.07, tw / 2 + 0.42, th - 0.86, tz + 0.07, { colour: tc });
  sink.span('structureMetal', -0.1, th - 0.86, tz - 0.06, 0.1, th - 0.45, tz + 0.06, { colour: tc, decor: true });
  // the shimaki, and over it the kasagi: a black beam whose ends rise in a shallow sweep
  sink.span('structureMetal', -tw / 2 - 0.5, th - 0.45, tz - 0.1, tw / 2 + 0.5, th - 0.27, tz + 0.1, { colour: tc });
  sink.member('structureMetal', [-tw / 2 - 0.3, th - 0.15, tz], [tw / 2 + 0.3, th - 0.15, tz], 0.26, 0.24, [0, 1, 0], { colour: CEDAR_DARK, exposed: true }, 0);
  for (const s of [-1, 1]) sink.member('structureMetal', [s * (tw / 2 + 0.3), th - 0.15, tz], [s * (tw / 2 + 0.85), th + 0.05, tz], 0.24, 0.24, [0, 1, 0], { colour: CEDAR_DARK, decor: true, exposed: true }, 0);
  sink.member('structureWood', [-tw / 2 + 0.2, th - 1.25, tz + 0.12], [tw / 2 - 0.2, th - 1.25, tz + 0.12], 0.12, 0.12, [0, 0, 1], { colour: rgb(0xd8c9a0), decor: true, exposed: true }, 0);
  // the approach: a gravel path from the torii to the steps
  sink.span('plaster3', -0.6, -0.2, hz + hd / 2 + 0.9, 0.6, 0.04, tz - 0.3, { decor: true, shade: 0.9 });
  // two stone lanterns beside the path
  for (const s of [-1, 1]) {
    const x = s * Math.min(1.6, P * 0.32), z = (hz + tz) / 2;
    sink.span(STONE, x - 0.25, -0.1, z - 0.25, x + 0.25, 0.9, z + 0.25);
    sink.span(STONE, x - 0.3, 0.9, z - 0.3, x + 0.3, 1.3, z + 0.3);
    sink.span(STONE, x - 0.38, 1.3, z - 0.38, x + 0.38, 1.45, z + 0.38);
  }
  });
  return sink.finish();
};

/** The works office (a foundry office plot): two storeys of painted clapboard under a tile hip roof, a gabled porch. */
const worksOffice: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the office fills the old office's reach (its bounds): its back on the back edge, its porch's posts to the front
  const R = reach(ctx), W = Math.max(8, R.W - 0.8), D = Math.max(7, R.D - 2.9);
  sink.placed(0, R.cx, 0, R.z0 + 0.3 + D / 2, () => {
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.6, y0: 0, h: 2.2 }];
    for (let s = 0; s < 2; s++) for (const face of ['front', 'back', 'left', 'right'] as const) {
      for (const o of windowRhythm(face, s, face === 'front' || face === 'back' ? W : D, { w: 1.1, h: 1.3, sill: 0.9, spacing: 1.9, margin: 1.0,
        avoid: s === 0 && face === 'front' ? [[-1.4, 1.4]] : [] })) openings.push(o);
    }
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.45, out: 0.05, bucket: STONE }, storeys: [{ h: 3.2, wall: 'wood' }, { h: 3.0, wall: 'wood' }],
      roof: { kind: 'hip', pitchDeg: 26, eave: 0.7, verge: 0.7, thickness: 0.16, bucket: 'roof', ridge: 'saddle' }, gableBucket: 'wood',
      openings, chimneys: [], gutters: { colour: rgb(0x5a5a58) }, verge: null, reveal: 0.1, rafters: CEDAR_DARK,
    }, dialectOf(rng, rgb(0x5a6a72), 0.4));
    // clapboard lines across the walls, the porch on two posts with its own small gable
    const b = frame.bodies[1];
    for (const name of ['front', 'back', 'left', 'right'] as const) {
      const f = frame.faces[name];
      for (let y = 0.7; y < b.y1; y += 0.42) faceBox(sink, 'structureWood', f, 0, y, 0.025, f.width, 0.03, 0.03, { colour: rgb(0x7a7268), decor: true, fine: true });
    }
    for (const s of [-1, 1]) sink.span('structureWood', s * 1.3 - 0.1, 0, D / 2 + 2.4 - 0.1, s * 1.3 + 0.1, 2.8, D / 2 + 2.4 + 0.1, { colour: CEDAR_GREY });
    const porch: RoofSpec = { kind: 'gable', pitchDeg: 28, eave: 0.2, verge: 0.2, thickness: 0.1, bucket: 'roof', ridge: 'saddle' };
    sink.placed(Math.PI / 2, 0, 0, D / 2 + 1.3, () => emitRoof(sink, roofGeometry(2.6, 3.0, 2.8, porch), porch));
  });
  return sink.finish();
};

/** The fire brigade post (a fire station plot): two storeys of cement render, the red shutter, the hose tower. */
const firePost: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the post fills the old station's reach (its bounds): the front on the front edge, the hose tower in the back corner
  const R = reach(ctx), W = Math.max(7, R.W - 0.8), D = Math.max(7, R.D - 2.3);
  sink.placed(0, R.cx, 0, R.z1 - 0.3 - D / 2, () => {
    const openings: Opening[] = [];
    for (const o of windowRhythm('front', 1, W, { w: 1.4, h: 1.2, sill: 0.9, spacing: 2.2, margin: 1.0 })) openings.push(o);
    for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 1, D, { w: 1.2, h: 1.1, sill: 0.9, spacing: 2.4, margin: 1.0 })) openings.push(o);
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.2, out: 0.04, bucket: CEMENT }, storeys: [{ h: 4.0, wall: CEMENT }, { h: 3.0, wall: CEMENT }],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.3, verge: 0.3, thickness: 0.2, bucket: CEMENT, parapet: 0.4 }, gableBucket: CEMENT,
      openings, chimneys: [], gutters: null, verge: null, reveal: 0.15,
    }, dialectOf(rng, rgb(0x5a6a72), 0.5));
    const f = frame.faces.front;
    faceBox(sink, 'dark', f, -W * 0.15, 1.9, 0.005, W * 0.5, 3.6, 0.02, { decor: true });
    faceBox(sink, 'structureMetal', f, -W * 0.15, 2.6, 0.03, W * 0.5, 2.4, 0.04, { colour: rgb(0xb8302a), decor: true });
    faceBox(sink, 'structureWood', f, W * 0.3, 3.4, 0.02, 1.8, 0.4, 0.03, { colour: rgb(0xe8e2d4), decor: true });
  });
  // the hose-drying tower of steel at the back, its red lamp
  const tx = R.x1 - 1.0, tz = R.z0 + 1.0;
  for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]] as const) sink.member('structureMetal', [tx + dx, -0.3, tz + dz], [tx + dx * 0.6, 11, tz + dz * 0.6], 0.1, 0.1, [1, 0, 0], { colour: rgb(0x9a9e9c), exposed: true }, 0);
  sink.span('structureMetal', tx - 0.6, 11, tz - 0.6, tx + 0.6, 11.15, tz + 0.6, { colour: rgb(0x9a9e9c), decor: true });
  sink.cylinder('structureMetal', [tx, 11.15, tz], 'y', 0.3, 0.14, 8, { colour: rgb(0xd83a2a), decor: true });
  return sink.finish();
};

/** A burnt farmstead (a ruin plot): charred posts and the fallen roof of a minka, or a kura's cracked white shell. */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(5, ctx.info.w - 0.8), D = Math.max(6, ctx.info.d - 0.8);
  sink.span(STONE, -W / 2 - 0.05, -0.4, -D / 2 - 0.05, W / 2 + 0.05, 0.4, D / 2 + 0.05);
  const char = rgb(0x2a2420);
  if (rng() < 0.6) {
    for (let k = 0; k < 10; k++) {
      const side = k % 4, t = rng();
      const x = side < 2 ? (side === 0 ? -1 : 1) * (W / 2 - 0.15) : (t - 0.5) * W * 0.85;
      const z = side < 2 ? (t - 0.5) * D * 0.85 : (side === 2 ? -1 : 1) * (D / 2 - 0.15);
      sink.span('structureWood', x - 0.12, 0.4, z - 0.12, x + 0.12, 0.9 + rng() * 1.8, z + 0.12, { colour: char });
    }
    // the roof's charred thatch and timbers heaped inside
    sink.cylinder('straw', [0, 0.3, 0], 'y', 0.6, Math.min(W, D) * 0.38, 8, { decor: true }, Math.min(W, D) * 0.2, true, rng());
    for (let k = 0; k < 5; k++) {
      const a: Vec3 = [(rng() - 0.5) * W * 0.8, 0.5, (rng() - 0.5) * D * 0.8], b: Vec3 = [a[0] + (rng() - 0.5) * 3.5, 0.5 + rng() * 1.2, a[2] + (rng() - 0.5) * 3.5];
      sink.member('structureWood', a, b, 0.2, 0.2, [0, 1, 0], { colour: char, decor: true, exposed: true }, 0);
    }
    return sink.finish();
  }
  const t = 0.35;
  for (const [x0, z0, x1, z1, axis] of [[-W / 2, -D / 2, W / 2, -D / 2 + t, 'x'], [-W / 2, D / 2 - t, W / 2, D / 2, 'x'],
    [-W / 2, -D / 2 + t, -W / 2 + t, D / 2 - t, 'z'], [W / 2 - t, -D / 2 + t, W / 2, D / 2 - t, 'z']] as const) {
    const len = axis === 'x' ? x1 - x0 : z1 - z0, pieces = Math.max(3, Math.round(len / 1.5));
    for (let k = 0; k < pieces; k++) {
      if (rng() < 0.25) continue;
      const a = k / pieces, b = (k + 1) / pieces, top = 0.8 + rng() * 3.2;
      if (axis === 'x') sink.span(SHIKKUI, x0 + len * a, 0.4, z0, x0 + len * b, top, z1);
      else sink.span(SHIKKUI, x0, 0.4, z0 + len * a, x1, top, z0 + len * b);
    }
  }
  return sink.finish();
};

export const KYUSHU_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  depot: minka,
  shed: naya,
  containerRow: kuraRow,
  gantry: greenhouse,
  warehouse: coopWarehouse,
  factory: works,
  stack,
  watertower: shrine,
  foundryoffice: worksOffice,
  firestation: firePost,
  ruin,
});

export const KYUSHU_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'kyushu',
  region: 'the Aso caldera, Kumamoto (Kyushu): minka under thatch, tile or tin, white kura, greenhouses, the co-op store, the sulphur works, shrines',
  surfaces: {
    // ibushi-gawara, the smoked silver-grey tile; Aso's grey andesite
    roof: { kind: 'pantile', tint: [0.36, 0.37, 0.39] },
    stone: { kind: 'granite', tint: [0.6, 0.6, 0.58] },
    sourced: { plaster: false, wood: true },
    tones: {
      // white lime plaster (shikkui), the earth plaster of the farmhouses (tsuchikabe), a grey cement render, thatch
      plaster: (_h, s, l) => [0.11, Math.min(1, s * 0.15), Math.min(1, l * 1.32 + 0.16)],
      plaster2: (_h, s, l) => [0.085, Math.min(1, s * 0.9 + 0.2), Math.min(1, l * 1.0 + 0.04)],
      plaster3: (_h, s, l) => [0.12, Math.min(1, s * 0.12), Math.min(1, l * 1.0 + 0.1)],
      straw: (h, s, l) => [h - 0.015, Math.min(1, s * 0.55), Math.min(1, l * 0.8)],
    },
  },
  builders: KYUSHU_BUILDERS,
  // a wet volcanic basin: damp at the wall foot, moss on the tile and the thatch
  weather: {
    plaster: [[1, 1, 1], [0.97, 0.97, 0.95], [1.02, 1.0, 0.96], [0.94, 0.93, 0.9]],
    stone: [[1, 1, 1], [0.92, 0.93, 0.92], [1.04, 1.03, 1.0]],
    roof: [[1, 1, 1], [0.9, 0.9, 0.92], [1.05, 1.04, 1.02], [0.85, 0.86, 0.84]],
    damp: 0.7, moss: 0.45,
  },
  wear: 0.22,
  // (Caldera round 2, wave 114: "buildings sit on bare ground with no yard, wall or hedge"): each farmhouse keeps its
  // yard, a woven bamboo fence (the wattle module) round its freest side and the kitchen garden's beds inside
  yard: { kinds: ['depot'], fence: 'fencewattle', gate: null, shed: null, garden: true },
});
