// src/world/maps/regional/longleaf.ts — the mill-town kit (Longleaf Crossing: Longleaf, Rapides Parish, Louisiana, the
// Crowell Long Leaf Lumber Company's sawmill town in the pine flatwoods, crossed by the Louisiana Maneuvers of 1941).
// The company town as it stood: the sawmill's long tall shed on its timber posts, the board-and-batten walls stopping
// short of the eaves, a monitor along the ridge and the log slip up from the pond; the planer mill and the lumber sheds,
// open down their long sides; the brick dry kilns; the logging railroad's engine shed with its smoke jacks and the
// machine shop; the commissary under its gallery with the company's sign; the boarding house's double gallery; the
// manager's raised cottage under a hipped roof and its gallery; the workers' shotgun and dogtrot houses raised on brick
// piers, board-and-batten under tin roofs, front porches and a brick chimney; the mule barn under its hay hood; the
// railroad's water tank on its trestle; privies and woodsheds; a house burnt to its chimney. Galvanised sheet roofs
// over everything (the mill's fires took the shingles), the boards weathered silver or whitewashed, the trim painted.
import { PartSink, faceBox, pick, rgb, shade, type Face, type RegionalBucket, type Rgb } from './geometry.ts';
import { buildHouse, wallPolygon, windowRhythm, type FaceName, type HouseDialect, type HouseFrame, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import { bench, washingLine } from './dressing.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

/** Painted trim and doors: white, the company's green, a barn red, a faded blue. */
const TRIM: readonly Rgb[] = [0xe2ddd0, 0xe2ddd0, 0x3f5e45, 0x8a3a2c, 0x5a7488].map(rgb);
const WHITE = rgb(0xe6e1d4), WEATHERED = rgb(0x8e8a80), BATTEN = rgb(0x6f6a60), CHAR = rgb(0x2a2622);
/** The galvanised sheet: bright, dulled, rust-streaked, a red-painted one. */
const TIN: readonly Rgb[] = [0xa4a8a6, 0x8f9392, 0x8a6a52, 0x8a3e30].map(rgb);
const IRON = rgb(0x3a3d3e), SIGN = rgb(0x2f4a3a), RUST = rgb(0x6a4030);

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

// ---------------------------------------------------------------------------------------------------------- the lot

/**
 * The base geometry's measured footprint (ctx.bounds; the plot where it is empty). The coordinator's rule (2026-10-05,
 * Titan's pacing bisect: a kit barn 2.4 m short of its base warehouse opened a lane the bots drove through): a kit
 * building's main body fills it.
 */
interface Footprint { w: number; d: number; cx: number; cz: number }
function footprint(ctx: RegionalBuildContext): Footprint {
  const b = ctx.bounds;
  const ok = Number.isFinite(b.minX) && Number.isFinite(b.maxX) && b.maxX - b.minX > 0.5 && b.maxZ - b.minZ > 0.5;
  const x0 = ok ? b.minX : -ctx.info.w / 2, x1 = ok ? b.maxX : ctx.info.w / 2;
  const z0 = ok ? b.minZ : -ctx.info.d / 2, z1 = ok ? b.maxZ : ctx.info.d / 2;
  return { w: x1 - x0, d: z1 - z0, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}
/**
 * Emit a body centred on the footprint, its local z (a roof's ridge) along the footprint's long side. On a footprint
 * longer in x the body turns a quarter, its local -x side then facing the lot's +z (the street). `body` gets the frame's
 * across (W) and along (D) sizes and whether it turned.
 */
function onLot(sink: PartSink, fp: Footprint, body: (W: number, D: number, turned: boolean) => void): void {
  if (fp.w > fp.d + 0.5) sink.placed(Math.PI / 2, fp.cx, 0, fp.cz, () => body(fp.d, fp.w, true));
  else sink.placed(0, fp.cx, 0, fp.cz, () => body(fp.w, fp.d, false));
}

interface MillState {
  rng: () => number;
  look: () => number;
  trim: Rgb;
  window: WindowStyle;
}

function stateFor(ctx: RegionalBuildContext): MillState {
  const rng = ctx.rng, trim = pick(rng, TRIM);
  return {
    rng, look: ctx.variant, trim,
    window: {
      frame: WHITE, frameWidth: 0.06, frameOut: 0.04, bars: rng() < 0.7 ? 'six' : 'two',
      surround: { bucket: 'structureWood', width: 0.1, out: 0.03, lintel: 0.14, colour: shade(trim, 0.95) },
      sill: { bucket: 'structureWood', out: 0.06, colour: WHITE },
      shutters: rng() < 0.35 ? { colour: shade(trim, 0.85), kind: 'plank', closed: 0.15 } : null,
    },
  };
}

function dialect(st: MillState, leaf?: Rgb): HouseDialect {
  return {
    window: (sink, face, o, y0) => windowUnit(sink, face, o.u, y0 + o.y0, o.w, o.h,
      o.kind === 'loft' ? { ...st.window, shutters: null, surround: null, bars: 'none' } : st.window, st.rng, o.kind === 'loft' ? 0 : 0.4),
    door: (sink, face, o, y0, frame) => doorUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, {
      leaf: leaf ?? (st.rng() < 0.5 ? st.trim : WEATHERED), frame: { bucket: 'structureWood', width: 0.09, out: 0.04, colour: WHITE },
      steps: null, leafKind: o.w > 1.6 ? 'plank' : 'panel',
    }, frame.floors[o.storey] + o.y0),
  };
}

/** The galvanised sheet roof (a painted or rusted one now and then). */
function tin(kind: RoofSpec['kind'], pitch: number, eave = 0.45, verge = 0.35): RoofSpec {
  return { kind, pitchDeg: pitch, eave, verge, thickness: 0.06, bucket: 'structureMetal', ridge: kind === 'shed' || kind === 'flat' ? null : 'saddle' };
}

/** The openings cut in a face of a built house, in the face's (u, y) frame. */
function holesOf(frame: HouseFrame, name: FaceName): Array<{ u0: number; u1: number; y0: number; y1: number }> {
  return frame.spec.openings.filter((o) => o.face === name)
    .map((o) => ({ u0: o.u - o.w / 2 - 0.08, u1: o.u + o.w / 2 + 0.08, y0: frame.floors[o.storey] + o.y0 - 0.12, y1: frame.floors[o.storey] + o.y0 + o.h + 0.12 }));
}

/**
 * Battens over a board wall: a strip every `step` metres along a face from y0 to y1, broken round the openings (fine
 * joinery; the boards read without them).
 */
function battens(sink: PartSink, face: Face, y0: number, y1: number, step = 0.6, colour = BATTEN, holes: ReturnType<typeof holesOf> = []): void {
  const n = Math.floor((face.width - 0.2) / step);
  for (let k = 0; k <= n; k++) {
    const u = -face.width / 2 + 0.1 + k * (face.width - 0.2) / Math.max(1, n);
    // the strip's runs between the openings it crosses
    let runs: Array<[number, number]> = [[y0, y1]];
    for (const h of holes) {
      if (u < h.u0 || u > h.u1) continue;
      runs = runs.flatMap(([a, b]): Array<[number, number]> => (h.y1 <= a || h.y0 >= b ? [[a, b]] : [[a, Math.max(a, h.y0)], [Math.min(b, h.y1), b]]));
    }
    for (const [a, b] of runs) if (b - a > 0.15) faceBox(sink, 'structureWood', face, u, (a + b) / 2, 0.02, 0.06, b - a, 0.03, { colour, decor: true, fine: true });
  }
}

/** Battens on every face of a board house, round its openings. */
function battenHouse(sink: PartSink, frame: HouseFrame, y0: number, y1: number, step = 0.6): void {
  for (const name of ['front', 'right', 'back', 'left'] as FaceName[]) battens(sink, frame.faces[name], y0, y1, step, BATTEN, holesOf(frame, name));
}

/** Brick piers under a raised floor (structural), from below the ground to the sill at `lift`, round a w x d body. */
function piers(sink: PartSink, w: number, d: number, lift: number): void {
  const nx = Math.max(2, Math.round(w / 2.4) + 1), nz = Math.max(2, Math.round(d / 2.4) + 1);
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    if (i > 0 && i < nx - 1 && k > 0 && k < nz - 1) continue;
    const x = -w / 2 + 0.2 + (w - 0.4) * i / (nx - 1), z = -d / 2 + 0.2 + (d - 0.4) * k / (nz - 1);
    sink.span('stone', x - 0.2, -0.8, z - 0.2, x + 0.2, lift, z + 0.2);
  }
}

/**
 * A porch across a face: the deck at the floor's height on its brick piers, turned posts, a rail, the steps down to the
 * ground and a shed roof of tin from the wall head (the posts, the deck and the piers are structure; the rail and the
 * steps dressing). `ground` is the local height of the ground under it.
 */
function porch(sink: PartSink, face: Face, floorY: number, wallTop: number, width: number, depth: number, st: MillState, ground: number, rail = true): void {
  const post = WHITE;
  const rise = Math.max(0.3, wallTop - floorY - 2.4);
  faceBox(sink, 'structureWood', face, 0, floorY - 0.06, depth / 2, width, 0.12, depth, { colour: shade(WEATHERED, 1.05) });
  for (const u of [-width / 2 + 0.25, 0, width / 2 - 0.25]) faceBox(sink, 'stone', face, u, (floorY - 0.12 + ground - 0.3) / 2, depth - 0.25, 0.36, floorY - 0.12 - ground + 0.3, 0.36);
  const n = Math.max(2, Math.round(width / 2.4) + 1);
  for (let i = 0; i < n; i++) {
    const u = -width / 2 + 0.12 + (width - 0.24) * i / (n - 1);
    faceBox(sink, 'structureWood', face, u, (floorY + wallTop - rise) / 2, depth - 0.12, 0.14, wallTop - rise - floorY, 0.14, { colour: post });
  }
  if (rail) {
    faceBox(sink, 'structureWood', face, -width / 4 - 0.3, floorY + 0.85, depth - 0.12, width / 2 - 1.0, 0.06, 0.07, { colour: post, decor: true });
    faceBox(sink, 'structureWood', face, width / 4 + 0.3, floorY + 0.85, depth - 0.12, width / 2 - 1.0, 0.06, 0.07, { colour: post, decor: true });
    for (let u = -width / 2 + 0.3; u < width / 2 - 0.2; u += 0.16) {
      if (Math.abs(u) < 0.65) continue; // the gap for the steps
      faceBox(sink, 'structureWood', face, u, floorY + 0.45, depth - 0.12, 0.04, 0.75, 0.04, { colour: post, decor: true, fine: true });
    }
  }
  // the steps down from the deck's middle to the ground
  const steps = Math.max(2, Math.round((floorY - ground) / 0.2));
  for (let k = 0; k < steps; k++) {
    const y = ground + (floorY - ground) * (k + 1) / steps;
    faceBox(sink, 'structureWood', face, 0, y - 0.05, depth + 0.28 * (steps - k) - 0.14, 1.2, 0.08, 0.3, { colour: shade(WEATHERED, 0.95), decor: true });
  }
  // the tin roof: a shed from the wall head down over the posts (its low side on the face's outward normal)
  const spec: RoofSpec = tin('shed', Math.max(6, Math.atan2(rise, depth) * 180 / Math.PI), 0.25, 0.15);
  const yaw = Math.atan2(-face.out[2], face.out[0]);
  sink.placed(yaw, face.origin[0] + face.out[0] * depth / 2, 0, face.origin[2] + face.out[2] * depth / 2, () =>
    buildRoofOnly(sink, depth, width, wallTop - rise, spec, pick(st.rng, TIN)));
}

/** A roof over a w x d plan whose eave stands at eaveY (its shed slope rising toward the local -x). */
function buildRoofOnly(sink: PartSink, w: number, d: number, eaveY: number, spec: RoofSpec, colour: Rgb): void {
  // a body of zero height carries the roof: buildHouse with an empty storey draws walls too, so the shed is laid here
  const t = spec.thickness, tanP = Math.tan(spec.pitchDeg * Math.PI / 180);
  const x0 = -w / 2 - spec.eave, x1 = w / 2 + spec.verge, z0 = -d / 2 - spec.verge, z1 = d / 2 + spec.verge;
  const yAt = (x: number) => eaveY + (w / 2 - x) * tanP;
  const top = (x: number, z: number): [number, number, number] => [x, yAt(x) + t, z];
  const bot = (x: number, z: number): [number, number, number] => [x, yAt(x), z];
  const opts = { colour };
  sink.quad(spec.bucket, top(x1, z1), top(x1, z0), top(x0, z0), top(x0, z1), opts);
  sink.quad(spec.bucket, bot(x0, z1), bot(x0, z0), bot(x1, z0), bot(x1, z1), { ...opts, shade: 0.7 });
  sink.quad(spec.bucket, bot(x1, z1), bot(x1, z0), top(x1, z0), top(x1, z1), opts);
  sink.quad(spec.bucket, bot(x0, z0), bot(x0, z1), top(x0, z1), top(x0, z0), opts);
  sink.quad(spec.bucket, bot(x0, z1), bot(x1, z1), top(x1, z1), top(x0, z1), opts);
  sink.quad(spec.bucket, bot(x1, z0), bot(x0, z0), top(x0, z0), top(x1, z0), opts);
}

/** The two triangles a shed roof leaves open over the ±z walls of a w × d body (its slope rises toward -x). */
function shedGables(sink: PartSink, w: number, d: number, eaveY: number, tanP: number, bucket: RegionalBucket): void {
  const rise = w * tanP;
  if (rise < 0.03) return;
  const front: Face = { origin: [0, 0, d / 2], u: [1, 0, 0], out: [0, 0, 1], width: w };
  const back: Face = { origin: [0, 0, -d / 2], u: [-1, 0, 0], out: [0, 0, -1], width: w };
  wallPolygon(sink, bucket, front, [[-w / 2, eaveY], [w / 2, eaveY], [-w / 2, eaveY + rise]], 0.12);
  wallPolygon(sink, bucket, back, [[-w / 2, eaveY], [w / 2, eaveY], [w / 2, eaveY + rise]], 0.12);
}

// ---------------------------------------------------------------------------------------------------------- houses

/**
 * The worker's house: on a narrow lot the shotgun — one room wide, the rooms one behind another, the gable and the
 * porch to the street; on a wider lot the dogtrot — two pens under one roof either side of the open breezeway, the
 * porch along the front. Both raised on brick piers, board-and-batten (whitewashed or weathered) under tin, a brick
 * chimney; house and porch fill the lot.
 */
const workerHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng, look = st.look;
  const fp = footprint(ctx);
  const lift = 0.7, wallH = 2.7 + rng() * 0.2;
  const sheet = pick(rng, TIN);
  const whitewashed = rng() < 0.45;
  const wall: RegionalBucket = whitewashed ? 'plaster' : 'wood';
  const dogtrot = Math.min(fp.w, fp.d) >= 7.2;
  onLot(sink, fp, (Wf, Df, turned) => {
    const street: FaceName = turned ? 'left' : 'front';
    if (!dogtrot) {
      // the shotgun: the porch across the gable to the street (+z, or -x turned: its long side then faces the street,
      // so the porch runs along it)
      const pD = Math.min(2.2, Math.max(1.6, (turned ? Wf : Df) * 0.22));
      const W = turned ? Wf - pD - 0.1 : Wf - 0.1, D = turned ? Df - 0.1 : Df - pD - 0.1;
      const bx = turned ? pD / 2 : 0, bz = turned ? 0 : -pD / 2;
      const openings: Opening[] = [
        { face: street, storey: 0, kind: 'door', u: turned ? 0 : -W * 0.18, w: 0.9, y0: 0, h: 2.05 },
        { face: street, storey: 0, kind: 'window', u: turned ? D * 0.3 : W * 0.22, w: 0.8, y0: 0.8, h: 1.3 },
        ...windowRhythm(turned ? 'front' : 'left', 0, turned ? W : D, { w: 0.8, h: 1.3, sill: 0.8, spacing: 2.6, margin: 1.0, max: 3 }),
        ...windowRhythm(turned ? 'back' : 'right', 0, turned ? W : D, { w: 0.8, h: 1.3, sill: 0.8, spacing: 2.6, margin: 1.0, max: 3 }),
        ...windowRhythm(turned ? 'right' : 'back', 0, turned ? D : W, { w: 0.8, h: 1.3, sill: 0.8, spacing: 2.6, margin: 1.0, max: 1 }),
      ];
      sink.placed(0, bx, lift, bz, () => {
        piers(sink, W, D, 0);
        const frame = buildHouse(sink, {
          w: W, d: D, plinth: null, storeys: [{ h: wallH, wall }], roof: tin('gable', 30 + rng() * 6, 0.45, 0.3),
          roofColour: sheet, gableBucket: wall, openings,
          chimneys: [{ x: 0, z: (rng() - 0.3) * D * 0.3, sx: 0.5, sz: 0.5, above: 0.6, bucket: 'stone', cap: 'none' }],
          gutters: null, verge: { colour: WHITE, bucket: 'structureWood' }, reveal: 0.06, spall: null,
        }, dialect(st));
        if (!whitewashed) battenHouse(sink, frame, 0, wallH);
        porch(sink, frame.faces[street], 0, wallH, turned ? D : W, pD, st, -lift);
        if (look() < 0.5) bench(sink, frame.faces[street], (look() - 0.5) * 1.2, 1.3, WEATHERED);
      });
      return;
    }
    // the dogtrot: two pens either side of the breezeway along the ridge, the porch along the long side to the street
    const pD = Math.min(2.4, Math.max(1.8, (turned ? Wf : Df) * 0.24));
    const W = turned ? Wf - pD - 0.1 : Wf - 0.1, D = turned ? Df - 0.1 : Df - pD - 0.1;
    const bx = turned ? pD / 2 : 0, bz = turned ? 0 : -pD / 2;
    sink.placed(0, bx, lift, bz, () => {
      piers(sink, W, D, 0);
      // the breezeway runs across the body (x) through its middle when the porch is on a long side (turned), along it
      // otherwise: one roof over two pens and the open hall
      const hall = Math.min(2.6, (turned ? D : W) * 0.24);
      const roof = tin('gable', 26 + rng() * 6, 0.5, 0.35);
      const frame = buildHouse(sink, {
        w: W, d: D, plinth: null, storeys: [{ h: wallH, wall }], roof, roofColour: sheet, gableBucket: wall,
        openings: [
          ...windowRhythm(street, 0, turned ? D : W, { w: 0.8, h: 1.3, sill: 0.8, spacing: 2.4, margin: 1.0, avoid: [[-hall / 2 - 0.6, hall / 2 + 0.6]], max: 2 }),
          ...windowRhythm(turned ? 'front' : 'left', 0, turned ? W : D, { w: 0.8, h: 1.3, sill: 0.8, spacing: 2.6, margin: 1.0, max: 2 }),
          ...windowRhythm(turned ? 'back' : 'right', 0, turned ? W : D, { w: 0.8, h: 1.3, sill: 0.8, spacing: 2.6, margin: 1.0, max: 2 }),
        ],
        chimneys: [-1, 1].map((s) => ({ x: turned ? 0 : s * (W / 2 - 0.25), z: turned ? s * (D / 2 - 0.25) : 0, sx: 0.55, sz: 0.55, above: 0.6, bucket: 'stone' as RegionalBucket, cap: 'none' as const })),
        gutters: null, verge: { colour: WHITE, bucket: 'structureWood' }, reveal: 0.06, spall: null,
      }, dialect(st));
      // the breezeway: a dark recess through the body's middle, its doors into each pen (dressing over the wall)
      const sf = frame.faces[street];
      faceBox(sink, 'dark', sf, 0, wallH / 2, 0.012, hall, wallH - 0.05, 0.01, { decor: true });
      for (const s of [-1, 1]) faceBox(sink, 'structureWood', sf, s * hall / 2, wallH / 2, 0.03, 0.12, wallH, 0.05, { colour: WHITE, decor: true });
      if (!whitewashed) battenHouse(sink, frame, 0, wallH);
      porch(sink, sf, 0, wallH, turned ? D : W, pD, st, -lift);
      if (look() < 0.55) washingLine(sink, frame.faces[turned ? 'right' : 'back'], -1.6, 1.6, 2.2, look);
    });
  });
  return sink.finish();
};

/**
 * The manager's house: a raised cottage on brick piers under a broad hipped roof of tin, the gallery across the front
 * under the roof's own slope on its posts, tall windows to the floor, a central door with sidelights, two chimneys.
 */
const managerHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng, look = st.look;
  const fp = footprint(ctx);
  const lift = 0.9, wallH = 3.2;
  const sheet = pick(rng, TIN);
  // the gallery along the long side to the street: never turned, the front (+z) carries it on a wide lot, the left
  // side on a deep one (the house then faces the lot's +x side... the gallery wraps the street end instead)
  onLot(sink, fp, (Wf, Df, turned) => {
    const street: FaceName = turned ? 'left' : 'front';
    const gD = 2.4;
    const W = turned ? Wf - gD - 0.1 : Wf - 0.1, D = turned ? Df - 0.1 : Df - gD - 0.1;
    const bx = turned ? gD / 2 : 0, bz = turned ? 0 : -gD / 2;
    const streetLen = turned ? D : W;
    sink.placed(0, bx, lift, bz, () => {
      piers(sink, W, D, 0);
      const frame = buildHouse(sink, {
        w: W, d: D, plinth: null, storeys: [{ h: wallH, wall: rng() < 0.6 ? 'plaster' : 'wood' }], roof: tin('hip', 30, 0.6, 0.6),
        roofColour: sheet, gableBucket: 'wood',
        openings: [
          { face: street, storey: 0, kind: 'door', u: 0, w: 1.1, y0: 0, h: 2.4 },
          ...windowRhythm(street, 0, streetLen, { w: 1.0, h: 2.2, sill: 0.1, spacing: 2.4, margin: 1.0, avoid: [[-1.2, 1.2]], max: 4 }),
          ...windowRhythm(turned ? 'front' : 'left', 0, turned ? W : D, { w: 0.95, h: 1.9, sill: 0.4, spacing: 2.6, margin: 1.2, max: 3 }),
          ...windowRhythm(turned ? 'back' : 'right', 0, turned ? W : D, { w: 0.95, h: 1.9, sill: 0.4, spacing: 2.6, margin: 1.2, max: 3 }),
          ...windowRhythm(turned ? 'right' : 'back', 0, streetLen, { w: 0.95, h: 1.9, sill: 0.4, spacing: 2.6, margin: 1.2, max: 3 }),
        ],
        chimneys: [-1, 1].map((s) => ({ x: turned ? -W * 0.15 : s * W * 0.28, z: turned ? s * D * 0.28 : -D * 0.15, sx: 0.6, sz: 0.6, above: 0.8, bucket: 'stone' as RegionalBucket, cap: 'slab' as const })),
        gutters: null, verge: null, reveal: 0.08, spall: null,
      }, dialect(st, WHITE));
      porch(sink, frame.faces[street], 0, wallH, streetLen, gD, st, -lift);
      if (look() < 0.6) bench(sink, frame.faces[street], streetLen * 0.3, 1.5, WHITE);
    });
  });
  return sink.finish();
};

/**
 * The boarding house: two storeys of board under a tin gable, the double gallery across the front (the upper on the
 * lower's posts), the doors of the rooms onto it; the gallery and the house fill the lot.
 */
const boardingHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng;
  const fp = footprint(ctx);
  const lift = 0.6, h = 3.0;
  const sheet = pick(rng, TIN);
  const wall: RegionalBucket = rng() < 0.5 ? 'plaster' : 'wood';
  onLot(sink, fp, (Wf, Df, turned) => {
    const street: FaceName = turned ? 'left' : 'front';
    const gD = 2.2;
    const W = turned ? Wf - gD - 0.1 : Wf - 0.1, D = turned ? Df - 0.1 : Df - gD - 0.1;
    const bx = turned ? gD / 2 : 0, bz = turned ? 0 : -gD / 2;
    const streetLen = turned ? D : W, sideLen = turned ? W : D;
    sink.placed(0, bx, lift, bz, () => {
      piers(sink, W, D, 0);
      const openings: Opening[] = [];
      for (const s of [0, 1]) {
        const doors = Math.max(1, Math.floor(streetLen / 3.2));
        for (let k = 0; k < doors; k++) {
          const u = -streetLen / 2 + streetLen * (k + 0.5) / doors;
          openings.push({ face: street, storey: s, kind: 'door', u: u - 0.55, w: 0.9, y0: 0, h: 2.1 });
          openings.push({ face: street, storey: s, kind: 'window', u: u + 0.6, w: 0.8, y0: 0.8, h: 1.4 });
        }
        for (const f of (turned ? ['front', 'back'] : ['left', 'right']) as FaceName[]) openings.push(...windowRhythm(f, s, sideLen, { w: 0.8, h: 1.4, sill: 0.8, spacing: 2.6, margin: 1.0, max: 3 }));
      }
      const frame = buildHouse(sink, {
        w: W, d: D, plinth: null, storeys: [{ h, wall }, { h, wall }], roof: tin('gable', 26, 0.45, 0.35), roofColour: sheet, gableBucket: wall,
        openings, chimneys: [{ x: 0, z: 0, sx: 0.55, sz: 0.55, above: 0.7, bucket: 'stone', cap: 'none' }],
        gutters: null, verge: { colour: WHITE, bucket: 'structureWood' }, reveal: 0.06, spall: null,
      }, dialect(st));
      if (wall === 'wood') battenHouse(sink, frame, 0, frame.eaveY);
      // the double gallery: the lower porch, the upper deck on its posts, the roof over both
      const sf = frame.faces[street];
      faceBox(sink, 'structureWood', sf, 0, -0.06, gD / 2, streetLen, 0.12, gD, { colour: shade(WEATHERED, 1.05) });
      faceBox(sink, 'structureWood', sf, 0, h - 0.06, gD / 2, streetLen, 0.14, gD, { colour: shade(WEATHERED, 1.05) });
      const n = Math.max(2, Math.round(streetLen / 2.4) + 1);
      for (let i = 0; i < n; i++) {
        const u = -streetLen / 2 + 0.12 + (streetLen - 0.24) * i / (n - 1);
        faceBox(sink, 'structureWood', sf, u, (frame.eaveY - 0.3) / 2, gD - 0.12, 0.14, frame.eaveY - 0.3, 0.14, { colour: WHITE });
        faceBox(sink, 'stone', sf, u, -0.45, gD - 0.12, 0.36, 0.9, 0.36);
      }
      faceBox(sink, 'structureWood', sf, 0, h + 0.95, gD - 0.12, streetLen - 0.3, 0.06, 0.07, { colour: WHITE, decor: true });
      for (let u = -streetLen / 2 + 0.3; u < streetLen / 2 - 0.2; u += 0.16) faceBox(sink, 'structureWood', sf, u, h + 0.5, gD - 0.12, 0.04, 0.85, 0.04, { colour: WHITE, decor: true, fine: true });
      const yaw = Math.atan2(-sf.out[2], sf.out[0]);
      sink.placed(yaw, sf.origin[0] + sf.out[0] * gD / 2, 0, sf.origin[2] + sf.out[2] * gD / 2, () =>
        buildRoofOnly(sink, gD, streetLen, frame.eaveY - 0.35, tin('shed', 10, 0.25, 0.15), sheet));
    });
  });
  return sink.finish();
};

/**
 * The commissary: the company store, a long gable-front hall of board on a brick foundation, its double doors and
 * display windows under the gallery's tin roof on posts along the loading platform, the company's sign board on the
 * false front over the gable; the platform and the store fill the lot.
 */
const commissary: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng;
  const fp = footprint(ctx);
  const plat = 1.0, h = 4.6;
  const sheet = pick(rng, TIN);
  onLot(sink, fp, (Wf, Df, turned) => {
    const street: FaceName = turned ? 'left' : 'front';
    const gD = 2.6;
    const W = turned ? Wf - gD - 0.1 : Wf - 0.1, D = turned ? Df - 0.1 : Df - gD - 0.1;
    const bx = turned ? gD / 2 : 0, bz = turned ? 0 : -gD / 2;
    const streetLen = turned ? D : W, sideLen = turned ? W : D;
    sink.placed(0, bx, 0, bz, () => {
      const frame = buildHouse(sink, {
        w: W, d: D, plinth: { h: plat, out: 0.05, bucket: 'stone' }, storeys: [{ h, wall: 'wood' }], roof: tin('gable', 24, 0.4, 0.3),
        roofColour: sheet, gableBucket: 'wood',
        openings: [
          { face: street, storey: 0, kind: 'door', u: 0, w: 1.8, y0: 0, h: 2.6 },
          { face: street, storey: 0, kind: 'window', u: -Math.min(streetLen / 2 - 1.2, 2.4), w: 1.6, y0: 0.6, h: 2.2 },
          { face: street, storey: 0, kind: 'window', u: Math.min(streetLen / 2 - 1.2, 2.4), w: 1.6, y0: 0.6, h: 2.2 },
          ...(turned ? [] : windowRhythm('left', 0, sideLen, { w: 0.9, h: 1.5, sill: 1.6, spacing: 3.2, margin: 1.4, max: 4 })),
          ...windowRhythm(turned ? 'back' : 'right', 0, sideLen, { w: 0.9, h: 1.5, sill: 1.6, spacing: 3.2, margin: 1.4, max: 4 }),
          { face: turned ? 'right' : 'back', storey: 0, kind: 'door', u: 0, w: 1.6, y0: 0, h: 2.4 },
        ],
        chimneys: [{ x: W * 0.25, z: -D * 0.3, sx: 0.5, sz: 0.5, above: 0.6, bucket: 'stone', cap: 'none' }],
        gutters: null, verge: { colour: WHITE, bucket: 'structureWood' }, reveal: 0.08, spall: null,
      }, dialect(st, shade(st.trim, 0.9)));
      battenHouse(sink, frame, plat, plat + h, 0.7);
      // the loading platform along the street front at the floor's height, its gallery on posts
      const sf = frame.faces[street];
      faceBox(sink, 'structureWood', sf, 0, plat - 0.08, gD / 2, streetLen, 0.16, gD, { colour: shade(WEATHERED, 1.0) });
      faceBox(sink, 'stone', sf, 0, (plat - 0.16 - 0.8) / 2, gD - 0.25, streetLen - 0.2, plat - 0.16 + 0.8, 0.3);
      const n = Math.max(2, Math.round(streetLen / 2.8) + 1);
      for (let i = 0; i < n; i++) {
        const u = -streetLen / 2 + 0.15 + (streetLen - 0.3) * i / (n - 1);
        faceBox(sink, 'structureWood', sf, u, plat + (h - 0.4) / 2, gD - 0.15, 0.16, h - 0.4, 0.16, { colour: WHITE });
      }
      const yaw = Math.atan2(-sf.out[2], sf.out[0]);
      sink.placed(yaw, sf.origin[0] + sf.out[0] * gD / 2, 0, sf.origin[2] + sf.out[2] * gD / 2, () =>
        buildRoofOnly(sink, gD, streetLen + 0.2, plat + h - 0.4, tin('shed', 8, 0.25, 0.15), sheet));
      // the false front over the gable end to the street (the gable's own face on a deep lot), the sign board on it
      if (!turned) {
        // (free-standing spans: the false front is seen from behind over the roof, so it keeps its back face)
        const top = frame.roof.ridgeY + 0.8;
        sink.span('wood', -W / 2, frame.eaveY, D / 2, W / 2, top, D / 2 + 0.16);
        sink.span('structureWood', -W / 2 - 0.1, top - 0.12, D / 2 - 0.02, W / 2 + 0.1, top, D / 2 + 0.26, { colour: WHITE, decor: true });
      }
      faceBox(sink, 'structureWood', sf, 0, plat + h + (turned ? 0.25 : 0.9), 0.2, Math.min(streetLen - 1, 7), 0.9, 0.06, { colour: SIGN, decor: true });
      faceBox(sink, 'structureWood', sf, 0, plat + h + (turned ? 0.25 : 0.9), 0.235, Math.min(streetLen - 1.4, 6.4), 0.3, 0.01, { colour: WHITE, decor: true, fine: true });
    });
  });
  return sink.finish();
};

// ---------------------------------------------------------------------------------------------------------- the mill

/**
 * An open-sided mill or lumber shed: timber posts on brick footings down both long sides carrying a tin gable (and on
 * the sawmill a monitor along the ridge), board-and-batten closing the ends and the lower walls, the dark of the floor
 * inside (structural, so a hull meets the shed's mass and not a lane through it).
 */
function millShed(sink: PartSink, W: number, D: number, h: number, monitor: boolean, sheet: Rgb, ends: boolean): HouseFrame {
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.6, out: 0.05, bucket: 'stone' }, storeys: [{ h, wall: 'wood' }], roof: tin('gable', 22, 0.6, 0.4),
    roofColour: sheet, gableBucket: 'wood',
    openings: [
      ...(ends ? [{ face: 'front' as FaceName, storey: 0, kind: 'gate' as const, u: 0, w: Math.min(4.2, W * 0.45), y0: 0, h: Math.min(4.2, h - 0.6) }] : []),
      ...windowRhythm('left', 0, D, { w: 2.6, h: h * 0.42, sill: h * 0.5, spacing: 3.6, margin: 1.4 }).map((o): Opening => ({ ...o, kind: 'loft' })),
      ...windowRhythm('right', 0, D, { w: 2.6, h: h * 0.42, sill: h * 0.5, spacing: 3.6, margin: 1.4 }).map((o): Opening => ({ ...o, kind: 'loft' })),
    ],
    chimneys: [], gutters: null, verge: null, reveal: 0.2, spall: null,
  }, {
    // the long sides' upper band open to the air (dark behind, slatted), the end doors plank leaves
    window: (s, face, o, y0) => {
      faceBox(s, 'dark', face, o.u, y0 + o.y0 + o.h / 2, -0.15, o.w, o.h, 0.02, {});
      for (let k = 1; k < 4; k++) faceBox(s, 'structureWood', face, o.u, y0 + o.y0 + o.h * k / 4, 0.0, o.w, 0.06, 0.05, { colour: WEATHERED, decor: true, fine: true });
    },
    door: (s, face, o, y0) => {
      const r = s.recess, go = r > 0 ? -r + 0.04 : 0.02;
      faceBox(s, 'structureWood', face, o.u - o.w / 4, y0 + o.y0 + o.h / 2, go, o.w / 2, o.h, 0.06, { colour: shade(WEATHERED, 0.85) });
      faceBox(s, 'dark', face, o.u + o.w / 4, y0 + o.y0 + o.h / 2, go, o.w / 2, o.h, 0.02, {});
      faceBox(s, 'structureMetal', face, o.u, y0 + o.y0 + o.h + 0.12, 0.08, o.w + 1.2, 0.1, 0.1, { colour: IRON, decor: true });
    },
  });
  battenHouse(sink, frame, 0.6, 0.6 + h * 0.5, 0.75);
  // the posts down the long sides, proud of the wall
  for (const side of [-1, 1]) for (let z = -D / 2 + 0.3; z <= D / 2 - 0.3 + 1e-6; z += Math.max(2.4, (D - 0.6) / Math.max(1, Math.round((D - 0.6) / 3)))) {
    sink.span('structureWood', side * W / 2 - 0.14, 0.6, z - 0.12, side * W / 2 + 0.14, 0.6 + h, z + 0.12, { colour: shade(WEATHERED, 0.8), decor: true });
  }
  if (monitor) {
    // the monitor along the ridge: a raised slot of louvres under its own small roof (dressing over the main roof)
    const top = frame.roof.ridgeY, L = D * 0.7, T = top + 0.9, tanP = Math.tan(14 * Math.PI / 180);
    sink.span('structureWood', -0.9, top - 0.25, -L / 2, 0.9, T, L / 2, { colour: shade(WEATHERED, 0.9), decor: true });
    // (round 2, gauntlet wave 124: "a mis-seated floating cupola"): the shed roof's rise over the louvre box is boarded
    // in, so the roof sits on the monitor instead of hovering over a slot of sky
    sink.prism('structureWood', [[-0.9, T - 0.02, -L / 2], [0.9, T - 0.02, -L / 2], [0.9, T + 0.2 * tanP, -L / 2],
      [-0.9, T + 2.0 * tanP, -L / 2]], [0, 0, 1], L, { colour: shade(WEATHERED, 0.9), decor: true });
    sink.placed(0, 0, 0, 0, () => buildRoofOnly(sink, 2.2, L + 0.2, T, tin('shed', 14, 0.1, 0.1), sheet));
  }
  return frame;
}

/**
 * The sawmill (the warehouse plot 16 m and more across): the mill shed with its monitor, the log slip climbing to its
 * end from the pond side, and the steel wigwam burner's cone beside it for the slabs and sawdust; a smaller plot holds
 * the planer mill or a lumber shed (the shed open down one long side over its stacked boards).
 */
const sawmill: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng;
  const fp = footprint(ctx);
  const sheet = pick(rng, TIN);
  const big = Math.min(fp.w, fp.d) >= 14;
  onLot(sink, fp, (Wf, Df) => {
    if (big) {
      // the burner takes a square at the shed's back end, the shed the rest
      const bR = Math.min(Wf * 0.3, 4.2);
      const Ds = Df - 2 * bR - 0.6;
      sink.placed(0, 0, 0, bR + 0.3, () => millShed(sink, Wf - 0.1, Ds, 6.2, true, sheet, true));
      // the wigwam burner: a riveted steel cone on its brick ring, the spark screen dome on top (the cone is structure)
      const bz = -Df / 2 + bR;
      sink.cylinder('stone', [0, -0.5, bz], 'y', 1.6, bR, 16, {}, bR, true);
      sink.cylinder('structureMetal', [0, 1.1, bz], 'y', 8.5, bR, 16, { colour: RUST }, bR * 0.35, false);
      sink.cylinder('structureMetal', [0, 9.6, bz], 'y', 1.4, bR * 0.36, 12, { colour: IRON, decor: true }, bR * 0.12, true);
      // the slab conveyor from the shed's end up to the burner's flank (dressing)
      sink.member('structureWood', [0, 1.4, bz + bR + 0.2], [0, 6.0, bz + bR * 0.35], 1.0, 0.4, [1, 0, 0], { colour: WEATHERED, decor: true, exposed: true }, 0);
      // the log slip up the front end from the pond side
      sink.member('structureWood', [0, 0.2, Df / 2 + 0.0], [0, 3.6, Df / 2 - 5.5], 1.6, 0.5, [1, 0, 0], { colour: shade(WEATHERED, 0.8), decor: true, exposed: true }, 0);
      return;
    }
    const frame = millShed(sink, Wf - 0.1, Df - 0.1, 4.6, rng() < 0.4, sheet, true);
    // the boards stacked inside the open band (dressing)
    for (let k = 0; k < 3; k++) {
      const z = -Df / 2 + 1.6 + k * (Df - 3.2) / 2;
      sink.span('wood', -Wf / 2 + 0.6, 0.6, z - 0.9, -Wf / 2 + 2.2, 0.6 + 1.2 + rng() * 0.8, z + 0.9, { decor: true });
    }
    void frame;
  });
  return sink.finish();
};

/**
 * The logging railroad's engine shed: a tall board shed on a brick base, the two track doors in the gable end under
 * smoke vents on the ridge; or the machine shop with its row of windows; or the brick dry kilns, a long low block of
 * vaulted chambers behind their steel doors under a tin roof with its vent stacks.
 */
const depot: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng;
  const fp = footprint(ctx);
  const sheet = pick(rng, TIN);
  const kind = rng();
  onLot(sink, fp, (Wf, Df) => {
    const W = Wf - 0.1, D = Df - 0.1;
    if (kind < 0.25) {
      // the dry kilns: brick chambers side by side down the long side, each with its door; vent stacks on the roof
      const frame = buildHouse(sink, {
        w: W, d: D, plinth: null, storeys: [{ h: 3.6, wall: 'stone' }], roof: tin('gable', 14, 0.3, 0.3), roofColour: sheet, gableBucket: 'stone',
        openings: windowRhythm('left', 0, D, { w: 1.6, h: 2.6, sill: 0, spacing: 3.0, margin: 1.0 }).map((o): Opening => ({ ...o, kind: 'gate' })),
        chimneys: [], gutters: null, verge: null, reveal: 0.25, spall: null,
      }, {
        window: () => {},
        door: (s, face, o, y0) => {
          const r = s.recess, go = r > 0 ? -r + 0.04 : 0.02;
          faceBox(s, 'structureMetal', face, o.u, y0 + o.y0 + o.h / 2, go, o.w, o.h, 0.06, { colour: RUST });
        },
      });
      for (let z = -D / 2 + 1.6; z < D / 2 - 1.0; z += 3.0) sink.cylinder('structureMetal', [0, frame.roof.ridgeY - 0.3, z], 'y', 1.6, 0.25, 8, { colour: IRON, decor: true });
      return;
    }
    const shop = kind < 0.5;
    const h = shop ? 4.2 : 6.0;
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.5, out: 0.05, bucket: 'stone' }, storeys: [{ h, wall: 'wood' }], roof: tin('gable', 24, 0.5, 0.35), roofColour: sheet, gableBucket: 'wood',
      openings: shop
        ? [{ face: 'front', storey: 0, kind: 'gate', u: 0, w: Math.min(3.6, W * 0.5), y0: 0, h: 3.4 },
          ...windowRhythm('left', 0, D, { w: 1.2, h: 1.6, sill: 1.2, spacing: 2.4, margin: 1.2 }),
          ...windowRhythm('right', 0, D, { w: 1.2, h: 1.6, sill: 1.2, spacing: 2.4, margin: 1.2 })]
        : [...(W >= 9 ? [-1, 1] : [0]).map((s): Opening => ({ face: 'front', storey: 0, kind: 'gate', u: s * W * 0.24, w: Math.min(3.6, W * 0.38), y0: 0, h: 5.0 })),
          ...windowRhythm('left', 0, D, { w: 1.0, h: 1.4, sill: 2.4, spacing: 3.2, margin: 1.4 }),
          ...windowRhythm('right', 0, D, { w: 1.0, h: 1.4, sill: 2.4, spacing: 3.2, margin: 1.4 })],
      chimneys: [], gutters: null, verge: { colour: WHITE, bucket: 'structureWood' }, reveal: 0.12, spall: null,
    }, {
      window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { ...st.window, shutters: null, surround: null, bars: 'six' }, rng, 0.2),
      door: (s, face, o, y0) => {
        const r = s.recess, go = r > 0 ? -r + 0.04 : 0.02;
        for (const sd of [-1, 1]) faceBox(s, 'structureWood', face, o.u + sd * o.w / 4, y0 + o.y0 + o.h / 2, go, o.w / 2 - 0.02, o.h, 0.06, { colour: shade(WEATHERED, 0.85) });
        for (let k = 1; k < 4; k++) faceBox(s, 'structureWood', face, o.u, y0 + o.y0 + o.h * k / 4, go + 0.05, o.w - 0.1, 0.1, 0.03, { colour: BATTEN, decor: true, fine: true });
      },
    });
    battenHouse(sink, frame, 0.5, 0.5 + h, 0.75);
    if (!shop) for (let z = -D / 2 + 3; z < D / 2 - 2; z += 6) {
      // the smoke jacks over the tracks
      sink.span('structureWood', -0.5, frame.roof.ridgeY - 0.3, z - 0.6, 0.5, frame.roof.ridgeY + 1.1, z + 0.6, { colour: CHAR, decor: true });
    }
  });
  return sink.finish();
};

/** The mule barn: a board-and-batten barn under a tin gable, the hay hood over the loft door, the aisle doors at the ends. */
const muleBarn: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng;
  const fp = footprint(ctx);
  const sheet = pick(rng, TIN);
  onLot(sink, fp, (Wf, Df) => {
    const W = Wf - 0.1, D = Df - 0.1, h = 3.6;
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.3, out: 0.04, bucket: 'stone' }, storeys: [{ h, wall: 'wood' }], roof: tin('gable', 36, 0.5, 0.25), roofColour: sheet, gableBucket: 'wood',
      openings: [
        { face: 'front', storey: 0, kind: 'gate', u: 0, w: Math.min(3.2, W * 0.4), y0: 0, h: 3.0 },
        { face: 'back', storey: 0, kind: 'gate', u: 0, w: Math.min(3.2, W * 0.4), y0: 0, h: 3.0 },
        ...windowRhythm('left', 0, D, { w: 0.6, h: 0.6, sill: 1.8, spacing: 2.4, margin: 1.2 }).map((o): Opening => ({ ...o, kind: 'loft' })),
        ...windowRhythm('right', 0, D, { w: 0.6, h: 0.6, sill: 1.8, spacing: 2.4, margin: 1.2 }).map((o): Opening => ({ ...o, kind: 'loft' })),
      ],
      chimneys: [], gutters: null, verge: { colour: WHITE, bucket: 'structureWood' }, reveal: 0.1, spall: null,
    }, {
      window: (s, face, o, y0) => faceBox(s, 'dark', face, o.u, y0 + o.y0 + o.h / 2, -0.05, o.w, o.h, 0.02, {}),
      door: (s, face, o, y0) => {
        const r = s.recess, go = r > 0 ? -r + 0.04 : 0.02;
        faceBox(s, 'structureWood', face, o.u, y0 + o.y0 + o.h / 2, go, o.w, o.h, 0.06, { colour: rng() < 0.5 ? RUST : shade(WEATHERED, 0.85) });
        // the Z brace across the leaves
        s.member('structureWood', [o.u - o.w / 2 + 0.1, y0 + o.y0 + 0.2, 0], [o.u + o.w / 2 - 0.1, y0 + o.y0 + o.h - 0.2, 0], 0.12, 0.04, face.out, { colour: WHITE, decor: true, fine: true });
      },
    });
    battenHouse(sink, frame, 0.3, 0.3 + h, 0.7);
    // the hay hood: the ridge carried out over the loft door in the front gable (dressing), the loft door under it
    const top = frame.roof.ridgeY, z = D / 2;
    sink.span('structureMetal', -0.9, top - 0.9, z - 0.2, 0.9, top - 0.75, z + 1.2, { colour: sheet, decor: true });
    const gf: Face = { origin: [0, 0, z], u: [1, 0, 0], out: [0, 0, 1], width: W };
    faceBox(sink, 'dark', gf, 0, frame.eaveY + 0.9, 0.02, 1.3, 1.4, 0.02, { decor: true });
  });
  return sink.finish();
};

/** The railroad's water tank: a stave tank under its conical cap on a timber trestle, the spout and its counterweight. */
const waterTank: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const fp = footprint(ctx);
  const S = Math.min(fp.w, fp.d), legH = 6.5 + rng() * 1.5, R = Math.max(1.6, S / 2 - 0.15);
  sink.placed(0, fp.cx, 0, fp.cz, () => {
    // the trestle's footing slab fills the plot, the legs at its corners, the cross braces
    sink.span('stone', -fp.w / 2 + 0.05, -0.4, -fp.d / 2 + 0.05, fp.w / 2 - 0.05, 0.25, fp.d / 2 - 0.05);
    const a = Math.min(fp.w, fp.d) / 2 - 0.4;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) sink.span('structureWood', sx * a - 0.17, 0.25, sz * a - 0.17, sx * a + 0.17, legH, sz * a + 0.17, { colour: WEATHERED });
    for (const [x0, z0, x1, z1] of [[-a, -a, a, -a], [a, -a, a, a], [a, a, -a, a], [-a, a, -a, -a]] as const) {
      sink.member('structureWood', [x0, 0.6, z0], [x1, legH - 0.4, z1], 0.14, 0.08, [Math.sign(x0 + x1) || 0, 0, Math.sign(z0 + z1) || 0], { colour: shade(WEATHERED, 0.9), decor: true, exposed: true }, 0);
    }
    sink.span('structureWood', -a - 0.3, legH, -a - 0.3, a + 0.3, legH + 0.3, a + 0.3, { colour: shade(WEATHERED, 0.95) });
    // the stave tank, its hoops and the cap
    sink.cylinder('wood', [0, legH + 0.3, 0], 'y', 3.6, R, 16, {});
    for (const y of [0.5, 1.4, 2.3, 3.2]) sink.cylinder('structureMetal', [0, legH + 0.3 + y, 0], 'y', 0.06, R + 0.03, 16, { colour: IRON, decor: true, fine: true });
    sink.cylinder('structureMetal', [0, legH + 3.9, 0], 'y', 1.3, R + 0.15, 16, { colour: pick(rng, TIN) }, 0.15);
    // the spout swung up along the tank
    sink.member('structureMetal', [R, legH + 1.2, 0], [R + 1.4, legH - 0.4, 0], 0.35, 0.35, [0, 0, 1], { colour: IRON, decor: true, exposed: true }, 0);
  });
  return sink.finish();
};

/** The privy or woodshed behind a house: planks under a lean-to of tin, a plank door; it fills its plot. */
const woodshed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng;
  const fp = footprint(ctx);
  const W = Math.max(1.6, fp.w - 0.06), D = Math.max(1.4, fp.d - 0.06), h = 2.1 + rng() * 0.3;
  const sheet = pick(rng, TIN);
  sink.placed(0, fp.cx, 0, fp.cz, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: null, storeys: [{ h, wall: 'wood' }], roof: tin('shed', 10, 0.2, 0.15), roofColour: sheet,
      openings: [{ face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * Math.max(0, W - 1.2), w: 0.8, y0: 0, h: 1.85 }],
      chimneys: [], gutters: null, verge: null, reveal: 0.04, spall: null,
    }, {
      window: () => {},
      door: (s, face, o, y0, fr) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: WEATHERED, frame: { bucket: 'structureWood', width: 0.06, out: 0.03, colour: BATTEN }, steps: null, leafKind: 'plank',
      }, fr.floors[o.storey] + o.y0),
    });
    shedGables(sink, W, D, frame.eaveY, Math.tan(10 * Math.PI / 180), 'wood');
    battenHouse(sink, frame, 0, h, 0.5);
  });
  return sink.finish();
};

/** A house burnt to its chimney: the brick stack standing, the piers and the charred sills, a fallen sheet of the roof. */
const burnt: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const fp = footprint(ctx);
  const W = Math.max(3.6, fp.w - 0.1), D = Math.max(4, fp.d - 0.1);
  sink.placed(0, fp.cx, 0, fp.cz, () => {
    piers(sink, W, D, 0.6);
    // the charred sills round the plan on the piers (structure: the house's footprint stays solid at its base)
    for (const [x0, z0, x1, z1] of [[-W / 2, -D / 2, W / 2, -D / 2 + 0.25], [-W / 2, D / 2 - 0.25, W / 2, D / 2], [-W / 2, -D / 2, -W / 2 + 0.25, D / 2], [W / 2 - 0.25, -D / 2, W / 2, D / 2]] as const) {
      sink.span('structureWood', x0, 0.6, z0, x1, 0.85, z1, { colour: CHAR });
    }
    // the chimney standing whole, a corner of the wall frame, the fallen roof sheet
    sink.span('stone', -0.35, -0.5, -0.35, 0.35, 5.6 + rng(), 0.35);
    sink.member('structureWood', [-W / 2 + 0.15, 0.85, D / 2 - 0.15], [-W / 2 + 0.15, 2.4 + rng() * 0.8, D / 2 - 0.15], 0.12, 0.12, [0, 0, 1], { colour: CHAR, decor: true, exposed: true }, 0);
    sink.member('structureMetal', [W * 0.1, 0.9, -D * 0.3], [W * 0.35, 1.9, D * 0.2], 2.2, 0.04, [0.3, 1, 0], { colour: RUST, decor: true, exposed: true }, 0);
  });
  return sink.finish();
};

/**
 * The town's church (the map-revival lane, 2026-10-05, round 2; gauntlet wave 124 saw the border villages' generic
 * stone church as "a stone pebble-dash tower"): a white weatherboard nave on brick piers under tin, the double door in
 * the gable front with a window over it, tall windows down both sides, and the square belfry over the front gable with
 * its louvred stage under a pyramid cap.
 */
const church: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng;
  const fp = footprint(ctx);
  const plat = 0.8, h = 4.8;
  const sheet = pick(rng, TIN);
  onLot(sink, fp, (Wf, Df, turned) => {
    const W = Wf - 0.1, D = Df - 0.1;
    const street: FaceName = turned ? 'left' : 'front';
    const streetLen = turned ? D : W, sideLen = turned ? W : D;
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: plat, out: 0.05, bucket: 'stone' }, storeys: [{ h, wall: 'plaster' }], roof: tin('gable', 38, 0.35, 0.3),
      roofColour: sheet, gableBucket: 'plaster',
      openings: [
        { face: street, storey: 0, kind: 'door', u: 0, w: 1.8, y0: 0, h: 2.6 },
        { face: street, storey: 0, kind: 'window', u: 0, w: 1.0, y0: 3.2, h: 1.1 },
        ...windowRhythm(turned ? 'front' : 'left', 0, sideLen, { w: 0.9, h: 2.3, sill: 1.1, spacing: 3.0, margin: 1.4, max: 5 }),
        ...windowRhythm(turned ? 'back' : 'right', 0, sideLen, { w: 0.9, h: 2.3, sill: 1.1, spacing: 3.0, margin: 1.4, max: 5 }),
      ],
      chimneys: [], gutters: null, verge: { colour: WHITE, bucket: 'structureWood' }, reveal: 0.08, spall: null,
    }, dialect(st, shade(st.trim, 0.9)));
    // the belfry over the front gable: a square tower rising through the ridge, its louvred stage, the pyramid cap
    const sf = frame.faces[street];
    const inset = 1.8, b = Math.min(2.6, streetLen * 0.32);
    const cx = sf.origin[0] - sf.out[0] * inset, cz = sf.origin[2] - sf.out[2] * inset;
    const y0 = frame.eaveY + 0.4, y1 = frame.roof.ridgeY + 2.6;
    sink.span('plaster', cx - b / 2, y0, cz - b / 2, cx + b / 2, y1, cz + b / 2);
    sink.span('structureWood', cx - b / 2 - 0.06, y1 - 1.6, cz - b / 2 - 0.06, cx + b / 2 + 0.06, y1 - 0.4, cz + b / 2 + 0.06, { colour: shade(WEATHERED, 0.7), decor: true });
    sink.span('structureWood', cx - b / 2 - 0.12, y1 - 0.06, cz - b / 2 - 0.12, cx + b / 2 + 0.12, y1 + 0.1, cz + b / 2 + 0.12, { colour: WHITE, decor: true });
    sink.cylinder('structureMetal', [cx, y1 + 0.1, cz], 'y', b * 1.15, b * 0.78, 4, { colour: sheet }, 0.03, true, Math.PI / 4);
  });
  return sink.finish();
};

export const LONGLEAF_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  logcabin: workerHouse,
  farmhouse: managerHouse,
  rangerlodge: boardingHouse,
  tavern: commissary,
  warehouse: sawmill,
  depot,
  barn: muleBarn,
  granary: waterTank,
  woodshed,
  ruin: burnt,
  church,
});

export const LONGLEAF_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'longleaf',
  region: 'Longleaf, Louisiana (the Crowell Long Leaf Lumber Company town, 1941): the sawmill and its wigwam burner, the commissary, shotgun and dogtrot houses on brick piers under tin',
  surfaces: {
    roof: { kind: 'sheet', tint: [0.62, 0.64, 0.64] },
    stone: { kind: 'brick', tint: [0.66, 0.44, 0.36] },
    sourced: { plaster: false, wood: true },
    tones: {
      // whitewashed boards: a chalky warm white over the board's own grain
      plaster: (_h, s, l) => [0.11, Math.min(1, s * 0.18), Math.min(1, l * 1.2 + 0.14)],
    },
  },
  builders: LONGLEAF_BUILDERS,
  weather: {
    plaster: [[1, 1, 1], [0.97, 0.96, 0.93], [0.93, 0.92, 0.9]],
    stone: [[1, 1, 1], [0.94, 0.92, 0.9], [1.03, 0.98, 0.95]],
    roof: [[1, 1, 1], [0.92, 0.9, 0.86], [1.04, 1.02, 1.0], [0.86, 0.8, 0.74]],
    damp: 0.65, moss: 0.35,
  },
  wear: 0.3,
  // the houses' yards: a plank fence and gate, the privy or woodshed at the back, the kitchen garden (yards.ts)
  yard: { kinds: ['logcabin', 'farmhouse'], fence: 'fenceplank', gate: 'gate', shed: 'woodshed', shedSize: [2.4, 2.0], garden: true },
});
