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
import { PartSink, faceBox, facePoint, pick, rgb, shade, UV_MEMBER, type Face, type RegionalBucket, type Rgb, type Vec3 } from './geometry.ts';
import { buildHouse, closeGables, emitRoof, holedPolygon, roofGeometry, wallPolygon, windowRhythm, type FaceName, type HouseDialect, type HouseFrame, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { bench, mound, washingLine } from './dressing.ts';
import { DOME_MIN_SEGMENTS, smoothDome, smoothProfile } from './domes.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import { beam, orientedPrism, weatherboards } from './millWorks.ts';

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
      if (Math.abs(u) < 0.82) continue; // the gap for the steps (and no baluster beyond the rails' inner ends)
      faceBox(sink, 'structureWood', face, u, floorY + 0.45, depth - 0.12, 0.04, 0.75, 0.04, { colour: post, decor: true, fine: true });
    }
  }
  // the steps down from the deck's middle to the ground, their treads housed in two stringers that run from the ground
  // to the deck's edge (the connectivity sweep: the treads hung in the air one over the next, with nothing under them)
  const steps = Math.max(2, Math.round((floorY - ground) / 0.2));
  for (let k = 0; k < steps; k++) {
    const y = ground + (floorY - ground) * (k + 1) / steps;
    faceBox(sink, 'structureWood', face, 0, y - 0.05, depth + 0.28 * (steps - k) - 0.14, 1.2, 0.08, 0.3, { colour: shade(WEATHERED, 0.95), decor: true });
  }
  for (const u of [-0.63, 0.63]) {
    const foot = facePoint(face, u, ground - 0.04, depth + 0.28 * steps + 0.02), head = facePoint(face, u, floorY - 0.04, depth - 0.02);
    sink.member('structureWood', foot, head, 0.06, 0.24, [0, 1, 0], { colour: shade(WEATHERED, 0.85), decor: true, exposed: true }, 0);
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
  // (gauntlet wave 124, the houses view: "neither house shows the brick piers … walls running straight to grade"): the
  // floor a metre up, so the piers and the dark crawlspace between them show over the grass and the ground's fall
  const lift = 1.0, wallH = 2.7 + rng() * 0.2;
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
    // (props census #15, Lane C 2026-10-16: the piers stood 0.1 m over the ground, and a board house "with reveal 0.08 and
    // NO battens or weatherboards") the piers from below the ground to the sill; a board house in lapped weatherboards
    // round its openings in 0.14 m reveals
    sink.placed(0, bx, 0, bz, () => piers(sink, W, D, lift));
    const boards = rng() >= 0.6;
    sink.placed(0, bx, lift, bz, () => {
      const frame = buildHouse(sink, {
        w: W, d: D, plinth: null, storeys: [{ h: wallH, wall: boards ? 'wood' : 'plaster' }], roof: tin('hip', 30, 0.6, 0.6),
        roofColour: sheet, gableBucket: 'wood',
        openings: [
          { face: street, storey: 0, kind: 'door', u: 0, w: 1.1, y0: 0, h: 2.4 },
          ...windowRhythm(street, 0, streetLen, { w: 1.0, h: 2.2, sill: 0.1, spacing: 2.4, margin: 1.0, avoid: [[-1.2, 1.2]], max: 4 }),
          ...windowRhythm(turned ? 'front' : 'left', 0, turned ? W : D, { w: 0.95, h: 1.9, sill: 0.4, spacing: 2.6, margin: 1.2, max: 3 }),
          ...windowRhythm(turned ? 'back' : 'right', 0, turned ? W : D, { w: 0.95, h: 1.9, sill: 0.4, spacing: 2.6, margin: 1.2, max: 3 }),
          ...windowRhythm(turned ? 'right' : 'back', 0, streetLen, { w: 0.95, h: 1.9, sill: 0.4, spacing: 2.6, margin: 1.2, max: 3 }),
        ],
        chimneys: [-1, 1].map((s) => ({ x: turned ? -W * 0.15 : s * W * 0.28, z: turned ? s * D * 0.28 : -D * 0.15, sx: 0.6, sz: 0.6, above: 0.8, bucket: 'stone' as RegionalBucket, cap: 'slab' as const })),
        gutters: null, verge: null, reveal: boards ? 0.14 : 0.08, spall: null,
      }, dialect(st, WHITE));
      if (boards) {
        for (const name of ['front', 'right', 'back', 'left'] as FaceName[]) weatherboards(sink, frame.faces[name], 0.02, wallH - 0.05, holesOf(frame, name), 0.2, WHITE, look);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) sink.span('structureWood', sx * W / 2 - 0.06, 0, sz * D / 2 - 0.06, sx * W / 2 + 0.06, wallH, sz * D / 2 + 0.06, { colour: WHITE, decor: true });
      }
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
        // (props census #15, Lane C 2026-10-16: "a single plain 16 cm slab with a cap strip, no boarding, battens,
        // bracketed cornice or back bracing") its battens up the street face, the cornice on its brackets, the corner
        // boards, and the raking braces from its back down to the roof
        const ff: Face = { origin: [0, 0, D / 2 + 0.16], u: [1, 0, 0], out: [0, 0, 1], width: W };
        battens(sink, ff, frame.eaveY + 0.05, top - 0.35, 0.55, BATTEN);
        sink.span('structureWood', -W / 2 - 0.18, top - 0.16, D / 2 - 0.02, W / 2 + 0.18, top, D / 2 + 0.42, { colour: WHITE, decor: true });
        sink.span('structureWood', -W / 2 - 0.06, top - 0.34, D / 2 + 0.16, W / 2 + 0.06, top - 0.24, D / 2 + 0.24, { colour: WHITE, decor: true });
        for (let k = 0, n = Math.max(3, Math.round(W / 1.2)); k <= n; k++) {
          const u = -W / 2 + 0.1 + (W - 0.2) * k / n;
          faceBox(sink, 'structureWood', ff, u, top - 0.25, 0.13, 0.08, 0.18, 0.26, { colour: WHITE, decor: true });
        }
        for (const sx of [-1, 1]) sink.span('structureWood', sx * W / 2 - 0.08, frame.eaveY, D / 2 + 0.1, sx * W / 2 + 0.08, top - 0.16, D / 2 + 0.22, { colour: WHITE, decor: true });
        for (const u of [-W * 0.3, W * 0.3]) {
          const yb = frame.roof.topAt(u, D / 2 - 1.6) ?? frame.eaveY;
          beam(sink, 'structureWood', [u, top - 0.4, D / 2 - 0.04], [u, yb + 0.05, D / 2 - 1.6], 0.1, { colour: shade(WEATHERED, 0.85), decor: true });
        }
      }
      faceBox(sink, 'structureWood', sf, 0, plat + h + (turned ? 0.25 : 0.9), 0.2, Math.min(streetLen - 1, 7), 0.9, 0.06, { colour: SIGN, decor: true });
      faceBox(sink, 'structureWood', sf, 0, plat + h + (turned ? 0.25 : 0.9), 0.235, Math.min(streetLen - 1.4, 6.4), 0.3, 0.01, { colour: WHITE, decor: true, fine: true });
      // (dome-detail-275) the gallery's plate over its posts and the knee braces up to it, the platform's edge board
      const pTop = plat + h - 0.4, po = gD - 0.15;
      faceBox(sink, 'structureWood', sf, 0, pTop - 0.11, po, streetLen, 0.22, 0.2, { colour: WHITE, decor: true });
      faceBox(sink, 'structureWood', sf, 0, plat - 0.24, gD + 0.03, streetLen, 0.3, 0.06, { colour: shade(WEATHERED, 0.8), decor: true });
      for (let i = 0; i < n; i++) {
        const u = -streetLen / 2 + 0.15 + (streetLen - 0.3) * i / (n - 1);
        for (const s of [-1, 1]) {
          if ((i === 0 && s < 0) || (i === n - 1 && s > 0)) continue;
          sink.member('structureWood', facePoint(sf, u + s * 0.06, pTop - 0.9, po), facePoint(sf, u + s * 0.7, pTop - 0.2, po), 0.09, 0.09, sf.out, { colour: WHITE, decor: true, exposed: true }, 0.045);
        }
      }
      // the store's goods out on the platform: a row of barrels at one end, crates and feed sacks, the bench by the door,
      // and at the other end the visible gas pump under its round globe
      const pf: Face = { origin: [sf.origin[0], plat, sf.origin[2]], u: sf.u, out: sf.out, width: streetLen };
      const look = st.look, end = look() < 0.5 ? -1 : 1, P = (u: number, o: number): Vec3 => facePoint(pf, u, 0, o);
      for (let k = 0; k < 3; k++) {
        const c = P(end * (streetLen / 2 - 0.45 - k * 0.66), 0.55 + (k % 2) * 0.3), r = 0.28;
        sink.revolve('structureWood', c, 'y', [[0, 0], [0, r * 0.88], [0.42, r * 1.06], [0.85, r * 0.88], [0.85, 0]], 10, { colour: shade(RUST, 1.1 + look() * 0.3), decor: true });
        for (const y of [0.12, 0.73]) sink.revolve('structureMetal', [c[0], c[1] + y, c[2]], 'y', [[0, r * 0.9], [0.02, r * 0.99], [0.04, r * 0.9]], 10, { colour: IRON, decor: true, fine: true });
      }
      for (let k = 0; k < 2; k++) {
        const u = end * (streetLen / 2 - 2.6 - k * 0.75), sz = 0.55 + look() * 0.15;
        faceBox(sink, 'structureWood', pf, u, sz / 2 + k * 0.0, 0.5, sz * 1.3, sz, sz, { colour: shade(WEATHERED, 1.15 + look() * 0.2), decor: true });
      }
      for (let k = 0; k < 3; k++) {
        const q = P(end * (streetLen / 2 - 1.0 - k * 0.5), 1.35 + look() * 0.2);
        mound(sink, q, [pf.u[0], 0, pf.u[2]], [pf.out[0], 0, pf.out[2]], 0.32, 0.22, 0.34, rgb(0xb5a37e), { decor: true }, look(), 4);
      }
      bench(sink, pf, -end * 1.9, 1.5, shade(WEATHERED, 1.05));
      {
        const c = P(-end * (streetLen / 2 - 0.6), gD - 0.55), red = rgb(0x8a2c24), ax = Math.abs(sf.out[0]) > 0.5 ? 'x' : 'z';
        sink.span('structureMetal', c[0] - 0.24, plat, c[2] - 0.24, c[0] + 0.24, plat + 0.2, c[2] + 0.24, { colour: shade(red, 0.7), decor: true });
        sink.cylinder('structureMetal', [c[0], plat + 0.2, c[2]], 'y', 1.5, 0.19, 12, { colour: red, decor: true }, 0.16);
        sink.cylinder('glass', [c[0], plat + 1.7, c[2]], 'y', 0.55, 0.17, 12, { decor: true }, 0.17);
        sink.cylinder('structureMetal', [c[0], plat + 2.25, c[2]], 'y', 0.12, 0.2, 12, { colour: red, decor: true }, 0.12);
        sink.cylinder('structureWood', [c[0] - (ax === 'x' ? 0.06 : 0), plat + 2.62, c[2] - (ax === 'z' ? 0.06 : 0)], ax, 0.12, 0.25, 14, { colour: WHITE, decor: true });
        sink.span('structureMetal', c[0] - 0.03, plat + 2.36, c[2] - 0.03, c[0] + 0.03, plat + 2.4, c[2] + 0.03, { colour: IRON, decor: true });
        beam(sink, 'structureMetal', [c[0] + pf.out[0] * 0.18, plat + 1.5, c[2] + pf.out[2] * 0.18], [c[0] + pf.out[0] * 0.3, plat + 0.25, c[2] + pf.out[2] * 0.3], 0.04, { colour: IRON, decor: true });
      }
      // the rafter tails under the store's own eaves (clear of the gallery's roof on a turned lot), its patched sheets
      if (!turned) rafterTails(sink, W, D, frame.eaveY, 24, 0.4, 0.9, shade(WEATHERED, 0.75));
      tinPatches(sink, frame, W, D, 24, 0.4, 0.3, look);
    });
  });
  return sink.finish();
};

// ---------------------------------------------------------------------------------------------------------- the mill

/** The sawdust and the bark: the heaps by the burner, the logs on the deck, their sawn ends (dome-detail-275). */
const SAWDUST = rgb(0xb4976a), BARK = rgb(0x4e3f33), LOG_END = rgb(0xb8a07a);

/** The unit square to the line a -> b that points up (a sloping member's top), its across axis level (dome-detail-275). */
function upFrom(a: readonly number[], b: readonly number[]): [number, number, number] {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(d[0], d[1], d[2]) || 1;
  const dn = [d[0] / l, d[1] / l, d[2] / l], sl = Math.hypot(dn[0], dn[2]) || 1, side = [-dn[2] / sl, 0, dn[0] / sl];
  // side x d: square to both, and up for any line short of the vertical
  const u: [number, number, number] = [side[1] * dn[2] - side[2] * dn[1], side[2] * dn[0] - side[0] * dn[2], side[0] * dn[1] - side[1] * dn[0]];
  return u[1] < 0 ? [-u[0], -u[1], -u[2]] : u;
}

/**
 * The tails of the rafters out under both eaves of a gable body W across and D along (every `step`), under a sheet of
 * `pitch` degrees over its eave `eave`: fine joinery (dome-detail-275, after the mule barn's).
 */
function rafterTails(sink: PartSink, W: number, D: number, eaveY: number, pitch: number, eave: number, step: number, colour: Rgb,
  sides: readonly number[] = [-1, 1]): void {
  const tanP = Math.tan(pitch * Math.PI / 180), cosP = Math.cos(pitch * Math.PI / 180), sinP = Math.sin(pitch * Math.PI / 180);
  const n = Math.max(2, Math.round((D - 0.5) / step));
  for (const side of sides) {
    for (let k = 0; k <= n; k++) {
      const zz = -D / 2 + 0.25 + (D - 0.5) * k / n;
      const ya = eaveY - 0.13 / cosP + 0.01, xa = side * (W / 2 - 0.02), xb = side * (W / 2 + eave - 0.06);
      sink.member('structureWood', [xa, ya, zz], [xb, ya - (Math.abs(xb) - Math.abs(xa)) * tanP, zz], 0.06, 0.12, [side * sinP, cosP, 0],
        { colour, decor: true, fine: true, exposed: true }, 0);
    }
  }
}

/**
 * The sheets replaced or rusted through on a gable's slopes (dome-detail-275, the work list: "smooth roof"): a sheet's
 * width laid over the covering, a sheet or two long, from the eave or higher up the run; a new bright one, a rusted
 * one, a red-leaded one. `xIn` keeps them off a monitor or the ridge cap; the look stream picks them.
 */
function tinPatches(sink: PartSink, frame: HouseFrame, W: number, D: number, pitch: number, eave: number, xIn: number, look: () => number): void {
  const cosP = Math.cos(pitch * Math.PI / 180), sinP = Math.sin(pitch * Math.PI / 180);
  const n = Math.max(1, Math.round(D / 2.6));
  for (const side of [-1, 1]) {
    for (let k = 0; k < n; k++) {
      const z = -D / 2 + (k + 0.25 + look() * 0.5) * D / n, w = 0.62 + look() * 0.06;
      // a sheet or two (2.4 m each up the slope) from the eave or further up the run
      const run = W / 2 + eave - 0.03 - xIn, len = Math.min(run, (look() < 0.5 ? 2.4 : 4.8) * cosP);
      const from = look() < 0.5 ? 0 : look() * Math.max(0, run - len);
      const x1 = side * (W / 2 + eave - 0.03 - from), x0 = side * (W / 2 + eave - 0.03 - from - len);
      const y1 = frame.roof.topAt(x1, z), y0 = frame.roof.topAt(x0, z);
      if (y1 === null || y0 === null) continue;
      const c = look();
      const colour = c < 0.3 ? shade(TIN[0], 1.02) : c < 0.85 ? shade(TIN[2], 0.85 + look() * 0.25) : TIN[3];
      sink.member('structureMetal', [x1, y1 - 0.004, z], [x0, y0 - 0.004, z], w, 0.016, [side * sinP, cosP, 0], { colour, decor: true, exposed: true }, 0);
    }
  }
}

/**
 * A stack's conical hat (a "china hat") on three stubs over its open mouth, its band at the mouth (dome-detail-275).
 * `r` the pipe's radius, `top` its mouth.
 */
function stackHat(sink: PartSink, x: number, top: number, z: number, r: number): void {
  sink.revolve('structureMetal', [x, top - 0.12, z], 'y', [[0, r - 0.005], [0.02, r + 0.04], [0.12, r + 0.04], [0.12, r - 0.03]], 10, { colour: shade(IRON, 0.85), decor: true });
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI * 2 / 3, c = Math.cos(a) * (r - 0.02), s = Math.sin(a) * (r - 0.02);
    sink.span('structureMetal', x + c - 0.02, top - 0.05, z + s - 0.02, x + c + 0.02, top + 0.26, z + s + 0.02, { colour: IRON, decor: true, fine: true });
  }
  sink.revolve('structureMetal', [x, top + 0.24, z], 'y', [[0, 0], [0, r * 1.75], [0.04, r * 1.75], [r * 0.85, 0.04], [r * 0.85 + 0.02, 0]], 12, { colour: shade(IRON, 0.95), decor: true });
}

/**
 * A louvred monitor (a clerestory ventilator) along a gable's ridge, `L` long and `mw` either side of it, its sill on the
 * covering (dome-detail-275, the work list: "the roof monitor is plain"; replacing a plain box under a shed sheet): the
 * dark of the loft behind, the posts in their bays, three canted louvre boards down each side, boarded ends under its
 * own small tin gable with its ridge cap. Dressing over the main roof.
 */
function roofMonitor(sink: PartSink, frame: HouseFrame, L: number, mw: number, rise: number, sheet: Rgb, z0 = 0): void {
  const top = frame.roof.ridgeY, base = top - mw * frame.roof.tanP, T = top + rise, wood = shade(WEATHERED, 0.9);
  sink.span('dark', -mw + 0.1, base, z0 - L / 2 + 0.1, mw - 0.1, T, z0 + L / 2 - 0.1, { decor: true });
  // the sills on the covering and the plates under the monitor's eaves
  for (const s of [-1, 1]) {
    sink.span('structureWood', s * mw - 0.09, base, z0 - L / 2, s * mw + 0.09, top + 0.12, z0 + L / 2, { colour: wood, decor: true });
    sink.span('structureWood', s * mw - 0.09, T - 0.16, z0 - L / 2, s * mw + 0.09, T, z0 + L / 2, { colour: wood, decor: true });
  }
  // the posts, a bay apart
  const n = Math.max(2, Math.round(L / 1.9));
  for (const s of [-1, 1]) for (let k = 0; k <= n; k++) {
    const z = z0 - L / 2 + 0.06 + (L - 0.12) * k / n;
    sink.span('structureWood', s * mw - 0.07, top + 0.12, z - 0.07, s * mw + 0.07, T - 0.16, z + 0.07, { colour: shade(wood, 0.92), decor: true });
  }
  // the louvres: boards canted 40 degrees down and out between the sill and the plate
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
    const y = top + 0.12 + (T - 0.16 - top - 0.12) * (k + 0.5) / 3;
    sink.member('structureWood', [s * mw, y, z0 - L / 2 + 0.07], [s * mw, y, z0 + L / 2 - 0.07], 0.24, 0.025, [s * 0.77, 0.64, 0],
      { colour: shade(WEATHERED, 1.05), decor: true, exposed: true }, 0.012);
  }
  // the boarded ends and the monitor's own tin gable
  const spec: RoofSpec = { ...tin('gable', 24, 0.3, 0.2), decor: true };
  const rg = roofGeometry(2 * mw, L, T, spec);
  sink.placed(0, 0, 0, z0, () => {
    for (const s of [-1, 1]) sink.span('structureWood', -mw - 0.09, base, s * L / 2 - 0.05, mw + 0.09, T, s * L / 2 + 0.05, { colour: wood, decor: true });
    closeGables(sink, rg, 'wood');
    emitRoof(sink, rg, spec, sheet);
  });
}

/**
 * An open-sided mill or lumber shed: timber posts on brick footings down both long sides carrying a tin gable (and on
 * the sawmill a monitor along the ridge), board-and-batten closing the ends and the lower walls, the dark of the floor
 * inside (structural, so a hull meets the shed's mass and not a lane through it).
 */
function millShed(sink: PartSink, W: number, D: number, h: number, monitor: boolean, sheet: Rgb, ends: boolean, look: () => number): HouseFrame {
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
      // the sliding door's track on the wall over the opening (the connectivity sweep: it stood 3 cm off the wall)
      faceBox(s, 'structureMetal', face, o.u, y0 + o.y0 + o.h + 0.12, 0.05, o.w + 1.2, 0.1, 0.1, { colour: IRON, decor: true });
    },
  });
  battenHouse(sink, frame, 0.6, 0.6 + h * 0.5, 0.75);
  // the posts down the long sides, proud of the wall
  for (const side of [-1, 1]) for (let z = -D / 2 + 0.3; z <= D / 2 - 0.3 + 1e-6; z += Math.max(2.4, (D - 0.6) / Math.max(1, Math.round((D - 0.6) / 3)))) {
    sink.span('structureWood', side * W / 2 - 0.14, 0.6, z - 0.12, side * W / 2 + 0.14, 0.6 + h, z + 0.12, { colour: shade(WEATHERED, 0.8), decor: true });
  }
  // the monitor along the ridge (dome-detail-275: the louvred clerestory under its own gable, for the plain box)
  if (monitor) roofMonitor(sink, frame, D * 0.7, 1.0, 1.15, sheet);
  // the rafter tails under both eaves and the sheets patched in the covering (dome-detail-275)
  rafterTails(sink, W, D, frame.eaveY, 22, 0.6, 0.9, shade(WEATHERED, 0.75));
  tinPatches(sink, frame, W, D, 22, 0.6, monitor ? 1.2 : 0.3, look);
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
  const look = st.look;
  onLot(sink, fp, (Wf, Df) => {
    if (big) {
      // the burner takes a square at the shed's back end, the shed the rest
      const bR = Math.min(Wf * 0.3, 4.2);
      const Ds = Df - 2 * bR - 0.6, back = -Df / 2 + 2 * bR + 0.6, Ws = Wf - 0.1;
      sink.placed(0, 0, 0, bR + 0.3, () => {
        const frame = millShed(sink, Ws, Ds, 6.2, true, sheet, true, look);
        // (dome-detail-275) the boiler's steel stack up through the roof at the back, its banded joints, its flared
        // mouth and the four guy wires down to the sheet
        const sx = -(Ws / 2 - 2.4), sz = -Ds / 2 + 2.2, stTop = 16.5 + look() * 1.5, r = 0.42;
        sink.pipe('structureMetal', [sx, 0.6, sz], [sx, stTop, sz], r, 14, { colour: IRON, decor: true, caps: true });
        for (const y of [frame.roof.ridgeY + 1.6, stTop - 4.2]) sink.revolve('structureMetal', [sx, y, sz], 'y', [[0, r], [0.06, r + 0.05], [0.18, r + 0.05], [0.24, r]], 14, { colour: shade(IRON, 1.15), decor: true });
        sink.revolve('structureMetal', [sx, stTop - 0.3, sz], 'y', [[0, r], [0.22, r + 0.1], [0.3, r + 0.12], [0.3, 0]], 14, { colour: shade(IRON, 0.9), decor: true });
        for (const [gx, gz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
          const ax = Math.max(-Ws / 2 - 0.4, Math.min(Ws / 2 + 0.4, sx + gx * 4.2)), az = Math.max(-Ds / 2 - 0.2, Math.min(Ds / 2 + 0.2, sz + gz * 4.2));
          const ay = frame.roof.topAt(ax, az);
          if (ay !== null) beam(sink, 'structureMetal', [sx + gx * r * 0.7, stTop - 4.1, sz + gz * r * 0.7], [ax, ay, az], 0.03, { colour: IRON, decor: true });
        }
        // the jack-ladder's mouth in the back gable over the burner's side, under its pent of tin (dome-detail-275)
        const jx = -Math.min(Ws / 2 - 1.2, bR + 1.7), bf: Face = { origin: [0, 0, -Ds / 2], u: [-1, 0, 0], out: [0, 0, -1], width: Ws };
        faceBox(sink, 'dark', bf, -jx, 3.9, 0.02, 1.5, 1.6, 0.02, { decor: true });
        for (const s of [-1, 1]) faceBox(sink, 'structureWood', bf, -jx + s * 0.8, 3.9, 0.05, 0.12, 1.8, 0.06, { colour: WHITE, decor: true });
        sink.member('structureMetal', facePoint(bf, -jx, 4.85, 0), facePoint(bf, -jx, 4.6, 0.8), 1.9, 0.04, [0, 0.95, -0.3], { colour: sheet, decor: true, exposed: true }, 0);
        // the slab conveyor's port, the other side
        faceBox(sink, 'dark', bf, -Math.min(Ws / 2 - 1.2, 4.4), 3.7, 0.02, 1.2, 1.1, 0.02, { decor: true });
      });
      // the wigwam burner (dome-detail-275, the work list: "a plain smooth cone"): its battered brick base ring under a
      // coping, the steel cone in six riveted plate courses (the upper ones burnt black) with stiffening rings, the collar
      // at its head and the spark screen's dome on it, ribbed; the iron access doors at its foot on their straps
      const bz = -Df / 2 + bR, coneH = 8.5, rt = bR * 0.36, rc = bR - 0.36;
      const rAt = (y: number): number => rc - (rc - rt) * (y - 1.1) / coneH;
      sink.revolve('stone', [0, -0.5, bz], 'y', [[0, bR], [1.3, bR - 0.12], [1.3, bR - 0.05], [1.6, bR - 0.05], [1.6, rc - 0.05]], 24, {});
      const courses = Array.from({ length: 6 }, (_, k) => shade(RUST, k >= 4 ? 0.55 + look() * 0.15 : 0.85 + look() * 0.3));
      sink.revolve('structureMetal', [0, 1.1, bz], 'y', Array.from({ length: 7 }, (_, k) => [coneH * k / 6, rc - (rc - rt) * k / 6] as const), 24,
        { colour: RUST, bandColour: (band) => courses[band] });
      for (const k of [1, 3, 5]) {
        const y = coneH * k / 6, r = rc - (rc - rt) * k / 6;
        sink.revolve('structureMetal', [0, 1.1, bz], 'y', [[y - 0.1, r + (rc - rt) * 0.1 / coneH - 0.006], [y, r + 0.07], [y + 0.1, r - (rc - rt) * 0.1 / coneH - 0.006]], 24,
          { colour: shade(courses[k], 0.8), decor: true });
      }
      const cTop = 1.1 + coneH;
      sink.revolve('structureMetal', [0, cTop - 0.05, bz], 'y', [[0, rt + 0.02], [0.05, rt + 0.12], [0.55, rt + 0.12], [0.6, rt + 0.04], [0.6, rt * 0.4]], 24, { colour: shade(IRON, 0.9), decor: true });
      const shell = smoothDome(sink, 'structureMetal', 0, cTop + 0.55, bz, rt + 0.03, { form: 'saucer', emit: { colour: shade(IRON, 0.75), decor: true } });
      for (let k = 0; k < 8; k++) {
        const phi = k * Math.PI / 4 + 0.2;
        const pts = [0, 0.45, 0.95, 1.4].map((e) => shell.surface(Math.min(e, Math.PI / 2), phi, 0.025));
        for (let i = 0; i + 1 < pts.length; i++) beam(sink, 'structureMetal', pts[i], pts[i + 1], 0.05, { colour: IRON, decor: true, fine: true });
      }
      // the doors at the cone's foot: a plate on the slope, its frame, its strap hinges
      const slope = (rc - rt) / coneH, nl = Math.hypot(1, slope);
      for (const phi of [0.15, Math.PI - 0.15, -Math.PI * 0.5]) {
        const c = Math.cos(phi), s = Math.sin(phi), n: Vec3 = [c / nl, slope / nl, s / nl];
        const at = (y: number): Vec3 => [c * rAt(y), y, bz + s * rAt(y)];
        sink.member('structureMetal', at(1.25), at(2.95), 1.25, 0.05, n, { colour: shade(IRON, 1.1), decor: true, exposed: true }, 0.01);
        sink.member('structureMetal', at(1.35), at(2.85), 1.0, 0.08, n, { colour: shade(RUST, 0.7), decor: true, exposed: true }, 0.01);
        for (const y of [1.65, 2.55]) {
          const p = at(y), tx = -s, tz = c;
          sink.member('structureMetal', [p[0] - tx * 0.5, y, p[2] - tz * 0.5], [p[0] + tx * 0.1, y, p[2] + tz * 0.1], 0.07, 0.1, n, { colour: IRON, decor: true, fine: true, exposed: true }, 0.01);
        }
      }
      // the slab conveyor from its port in the shed's back gable up to the cone's flank, housed under tin, on its trestle
      // bent (dome-detail-275: a plank leant on the cone)
      {
        const S: Vec3 = [Math.min(Ws / 2 - 1.2, 4.4), 3.2, back - 0.05], yT = 6.6;
        const phi = Math.atan2(S[2] - bz, S[0]), P: Vec3 = [Math.cos(phi) * (rAt(yT) - 0.2), yT, bz + Math.sin(phi) * (rAt(yT) - 0.2)];
        const up = upFrom(S, P), wood = shade(WEATHERED, 0.85);
        sink.member('structureWood', S, P, 1.0, 0.75, up, { colour: wood, decor: true, exposed: true }, 0);
        const o = (p: Vec3, k: number): Vec3 => [p[0] + up[0] * k, p[1] + up[1] * k, p[2] + up[2] * k];
        sink.member('structureMetal', o(S, 0.74), o(P, 0.74), 1.25, 0.05, up, { colour: sheet, decor: true, exposed: true }, 0);
        const M: Vec3 = [(S[0] + P[0]) / 2, (S[1] + P[1]) / 2, (S[2] + P[2]) / 2];
        const dl = Math.hypot(P[0] - S[0], P[2] - S[2]), ax = -(P[2] - S[2]) / dl, az = (P[0] - S[0]) / dl;
        for (const s of [-1, 1]) beam(sink, 'structureWood', [M[0] + ax * s * 0.55, 0, M[2] + az * s * 0.55], [M[0] + ax * s * 0.55, M[1] - 0.02, M[2] + az * s * 0.55], 0.2, { colour: wood, decor: true });
        beam(sink, 'structureWood', [M[0] - ax * 0.75, M[1] - 0.12, M[2] - az * 0.75], [M[0] + ax * 0.75, M[1] - 0.12, M[2] + az * 0.75], 0.2, { colour: shade(wood, 0.9), decor: true });
        beam(sink, 'structureWood', [M[0] - ax * 0.55, 0.3, M[2] - az * 0.55], [M[0] + ax * 0.55, M[1] - 0.4, M[2] + az * 0.55], 0.12, { colour: shade(wood, 0.9), decor: true });
      }
      // the jack ladder up from the log deck at the plot's back to its mouth in the gable: the trough's two side timbers
      // and its bed on three trestle bents, the bull chain, a log riding up it; the logs decked beside its foot
      {
        const jx = -Math.min(Ws / 2 - 1.2, bR + 1.7), F: Vec3 = [jx, 0.3, -Df / 2 + 0.55], H: Vec3 = [jx, 3.2, back - 0.05];
        const up = upFrom(F, H), wood = shade(WEATHERED, 0.78), dc = { decor: true } as const;
        const at = (t: number, dx = 0, k = 0): Vec3 => [F[0] + dx + up[0] * k, F[1] + (H[1] - F[1]) * t + up[1] * k, F[2] + (H[2] - F[2]) * t + up[2] * k];
        sink.member('structureWood', at(0), at(1), 1.2, 0.12, up, { colour: shade(wood, 0.9), ...dc, exposed: true }, 0);
        for (const s of [-1, 1]) sink.member('structureWood', at(0, s * 0.55, 0.1), at(1, s * 0.55, 0.1), 0.14, 0.42, up, { colour: wood, ...dc, exposed: true }, 0);
        sink.member('structureMetal', at(0.02, 0, 0.1), at(0.98, 0, 0.1), 0.12, 0.05, up, { colour: IRON, ...dc, fine: true, exposed: true }, 0);
        for (const t of [0.3, 0.6, 0.85]) {
          const q = at(t);
          for (const s of [-1, 1]) beam(sink, 'structureWood', [q[0] + s * 0.5, 0, q[2]], [q[0] + s * 0.5, q[1] - 0.02, q[2]], 0.18, { colour: wood, ...dc });
          beam(sink, 'structureWood', [q[0] - 0.75, q[1] - 0.1, q[2]], [q[0] + 0.75, q[1] - 0.1, q[2]], 0.18, { colour: shade(wood, 0.9), ...dc });
          if (q[1] > 1.4) beam(sink, 'structureWood', [q[0] - 0.5, 0.25, q[2]], [q[0] + 0.5, q[1] - 0.25, q[2]], 0.1, { colour: shade(wood, 0.9), ...dc });
        }
        const lt = 0.35 + look() * 0.3, lr = 0.26;
        sink.pipe('structureWood', at(lt, 0, 0.1 + lr), at(lt + 0.42, 0, 0.1 + lr), lr, 10, { colour: BARK, ...dc, caps: true });
        // the log deck: logs decked along the slip's foot, three and two and one, their sawn ends pale
        const lx0 = jx - 1.0, lz0 = -Df / 2 + 0.35;
        for (const [row, n] of [[0, 3], [1, 2], [2, 1]] as const) {
          for (let k = 0; k < n; k++) {
            const r = 0.24 + look() * 0.07, x = lx0 - (k + row * 0.5) * 0.52, y = r + row * 0.42, len = 3.6 + look() * 1.0;
            if (x - r < -Wf / 2 - 0.4) continue;
            sink.pipe('structureWood', [x, y, lz0], [x, y, lz0 + len], r, 10, { colour: shade(BARK, 0.9 + look() * 0.25), ...dc, caps: true });
            sink.cylinder('structureWood', [x, y, lz0 - 0.012], 'z', 0.012, r - 0.01, 10, { colour: LOG_END, ...dc });
          }
        }
      }
      // the sawdust and slab ends heaped by the burner's other flank, a cinder heap at its door (dome-detail-275)
      {
        const hx = Math.min(Wf / 2 - 1.7, bR + 1.9), hz = -Df / 2 + 1.9;
        // the sawdust at its angle of repose, slumped at the foot and crusted grey at the crown
        for (const [x, z, r, h] of [[hx, hz, 1.6, 1.6 + look() * 0.5], [hx - 1.0, hz + 2.1, 0.95, 0.8]] as const) {
          sink.revolve('structureWood', [x, -0.05, z], 'y', smoothProfile([[0, r], [0.18, r * 0.86], [h * 0.62, r * 0.36], [h * 0.92, r * 0.1], [h, 0]], 3), DOME_MIN_SEGMENTS,
            { colourAt: (p) => shade(SAWDUST, 0.72 + 0.32 * Math.min(1, Math.max(0, p[1] / h))), decor: true });
        }
        mound(sink, [bR + 0.35, 0, bz + 0.5], [1, 0, 0], [0, 0, 1], 0.6, 1.1, 0.5, shade(CHAR, 1.5), { decor: true }, look(), 6);
      }
      return;
    }
    const frame = millShed(sink, Wf - 0.1, Df - 0.1, 4.6, rng() < 0.4, sheet, true, look);
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
  const kind = rng(), look = st.look;
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
          // (dome-detail-275) the door's riveted bands and its lifting bar, the brick arch over it
          for (const t of [0.15, 0.5, 0.85]) faceBox(s, 'structureMetal', face, o.u, y0 + o.y0 + o.h * t, go + 0.05, o.w - 0.04, 0.1, 0.03, { colour: shade(RUST, 0.7), decor: true });
          faceBox(s, 'structureMetal', face, o.u + o.w * 0.3, y0 + o.y0 + o.h * 0.5, go + 0.1, 0.06, o.h * 0.55, 0.06, { colour: IRON, decor: true, fine: true });
          faceBox(s, 'stone', face, o.u, y0 + o.y0 + o.h + 0.16, 0.03, o.w + 0.5, 0.3, 0.06, { decor: true, shade: 0.85 });
        },
      });
      // (dome-detail-275, the work list: "the roof boxes are plain") the brick pilasters between the chamber doors, the
      // kilns' vent stacks on the ridge on their collars under conical hats, the boiler's brick stack at the back end
      const lf = frame.faces.left, kd = frame.spec.openings.filter((o) => o.face === 'left').map((o) => o.u).sort((a, b) => a - b);
      for (let k = 0; k + 1 < kd.length; k++) for (const [f, u] of [[lf, (kd[k] + kd[k + 1]) / 2], [frame.faces.right, -(kd[k] + kd[k + 1]) / 2]] as const) {
        faceBox(sink, 'stone', f, u, 1.7, 0.1, 0.5, 3.4, 0.2, { decor: true, shade: 0.92 });
      }
      sink.span('stone', -W / 2 - 0.08, 3.35, -D / 2 - 0.08, W / 2 + 0.08, 3.6, D / 2 + 0.08, { decor: true, shade: 0.9 });
      for (let z = -D / 2 + 1.6; z < D / 2 - 1.0; z += 3.0) {
        const top = frame.roof.ridgeY + 1.4 + look() * 0.4;
        sink.span('structureWood', -0.32, frame.roof.ridgeY - 0.3, z - 0.32, 0.32, frame.roof.ridgeY + 0.25, z + 0.32, { colour: shade(CHAR, 1.2), decor: true });
        sink.pipe('structureMetal', [0, frame.roof.ridgeY + 0.2, z], [0, top, z], 0.24, 10, { colour: IRON, decor: true, caps: true });
        stackHat(sink, 0, top, z, 0.24);
      }
      const bx = W / 2 - 1.4, bz = -D / 2 + 1.4, bt = frame.roof.ridgeY + 5.5;
      sink.span('stone', bx - 0.5, 0, bz - 0.5, bx + 0.5, bt, bz + 0.5, { decor: true });
      sink.span('stone', bx - 0.6, bt - 0.5, bz - 0.6, bx + 0.6, bt - 0.3, bz + 0.6, { decor: true, shade: 0.7 });
      sink.span('stone', bx - 0.56, bt - 0.12, bz - 0.56, bx + 0.56, bt, bz + 0.56, { decor: true, shade: 0.45 });
      rafterTails(sink, W, D, frame.eaveY, 14, 0.3, 1.0, shade(WEATHERED, 0.7));
      tinPatches(sink, frame, W, D, 14, 0.3, 0.45, look);
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
    // (dome-detail-275) the white corner boards, the rafter tails under the eaves, the sheets patched in the covering, the
    // louvred vent in the front gable's peak
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) sink.span('structureWood', sx * W / 2 - 0.07, 0.5, sz * D / 2 - 0.07, sx * W / 2 + 0.07, 0.5 + h, sz * D / 2 + 0.07, { colour: WHITE, decor: true });
    rafterTails(sink, W, D, frame.eaveY, 24, 0.5, 0.9, shade(WEATHERED, 0.72));
    tinPatches(sink, frame, W, D, 24, 0.5, 0.3, look);
    const gf: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W }, vy = frame.roof.ridgeY - 1.3;
    faceBox(sink, 'dark', gf, 0, vy, 0.01, 1.2, 0.9, 0.01, { decor: true });
    for (let k = 0; k < 4; k++) sink.member('structureWood', facePoint(gf, -0.6, vy - 0.36 + k * 0.24, 0.02), facePoint(gf, 0.6, vy - 0.36 + k * 0.24, 0.02), 0.2, 0.02, [0, 0.6, 0.8], { colour: WHITE, decor: true, fine: true, exposed: true }, 0);
    for (const s of [-1, 1]) {
      faceBox(sink, 'structureWood', gf, s * 0.66, vy, 0.025, 0.12, 1.14, 0.05, { colour: WHITE, decor: true });
      faceBox(sink, 'structureWood', gf, 0, vy + s * 0.51, 0.025, 1.44, 0.12, 0.05, { colour: WHITE, decor: true });
    }
    if (!shop) {
      // the smoke jacks over the tracks (dome-detail-275, the work list: "the roof boxes are plain"; a black box on the
      // ridge): over each track a boxed hood on the slope, its flared iron skirt and the jack's pipe under a conical hat
      const tracks = W >= 9 ? [-W * 0.24, W * 0.24] : [0];
      for (let z = -D / 2 + 3; z < D / 2 - 2; z += 6) for (const x of tracks) {
        const ya = frame.roof.topAt(x - 0.6, z) ?? frame.eaveY, yb = frame.roof.topAt(x + 0.6, z) ?? frame.eaveY, lo = Math.min(ya, yb), hi = Math.max(ya, yb);
        sink.span('structureWood', x - 0.6, lo - 0.1, z - 0.6, x + 0.6, hi + 0.35, z + 0.6, { colour: shade(CHAR, 1.3), decor: true });
        sink.span('structureMetal', x - 0.66, hi + 0.29, z - 0.66, x + 0.66, hi + 0.37, z + 0.66, { colour: sheet, decor: true });
        sink.revolve('structureMetal', [x, hi + 0.37, z], 'y', [[0, 0.55], [0.25, 0.34], [0.32, 0.3], [0.32, 0.27]], 12, { colour: shade(IRON, 1.1), decor: true });
        const top = hi + 2.0 + look() * 0.5;
        sink.pipe('structureMetal', [x, hi + 0.66, z], [x, top, z], 0.3, 12, { colour: IRON, decor: true, caps: true });
        stackHat(sink, x, top, z, 0.3);
      }
    } else {
      // the shop's forge flue up through the roof and the round ventilators on the ridge (dome-detail-275)
      const fx = W / 2 - 1.6, fz = -D / 2 + 2.5, fy = frame.roof.topAt(fx, fz) ?? frame.eaveY, top = frame.roof.ridgeY + 1.8;
      sink.pipe('structureMetal', [fx, fy - 0.2, fz], [fx, top, fz], 0.2, 10, { colour: IRON, decor: true, caps: true });
      sink.revolve('structureMetal', [fx, fy - 0.05, fz], 'y', [[0, 0.45], [0.12, 0.24], [0.16, 0.21], [0.16, 0.18]], 10, { colour: sheet, decor: true });
      stackHat(sink, fx, top, fz, 0.2);
      for (const z of [-D * 0.22, D * 0.22]) {
        sink.revolve('structureMetal', [0, frame.roof.ridgeY + 0.02, z], 'y', [[0, 0.22], [0.35, 0.22], [0.42, 0.42], [0.72, 0.42], [0.82, 0.2], [0.88, 0]], 12, { colour: shade(TIN[0], 0.95), decor: true });
      }
    }
  });
  return sink.finish();
};

/**
 * A board shutter hung open against the wall beside a loft opening (the mule barn's loft windows), its casing round the
 * cut opening, its ledges and Z-brace, its strap hinges on the casing: the dark of the loft shows through.
 */
function loftShutter(sink: PartSink, face: Face, o: Opening, y0: number, leaf: Rgb, casing: Rgb): void {
  const y = y0 + o.y0, cas = { colour: casing, decor: true, fineSides: true } as const;
  for (const side of [-1, 1]) faceBox(sink, 'structureWood', face, o.u + side * (o.w / 2 + 0.045), y + o.h / 2, 0.03, 0.09, o.h + 0.18, 0.04, cas, 'caps');
  for (const dy of [-0.045, o.h + 0.045]) faceBox(sink, 'structureWood', face, o.u, y + dy, 0.03, o.w + 0.18, 0.09, 0.04, cas, 'ends');
  // the leaf swung back flat against the boards on the hinge side, a hand off the wall on its hinges
  const lu = o.u - o.w - 0.1, lc = { colour: leaf, decor: true, uv: UV_MEMBER } as const;
  faceBox(sink, 'structureWood', face, lu, y + o.h / 2, 0.075, o.w, o.h, 0.035, lc);
  for (const t of [0.18, 0.82]) faceBox(sink, 'structureWood', face, lu, y + o.h * t, 0.105, o.w - 0.06, 0.08, 0.025, { colour: shade(leaf, 0.85), decor: true, fine: true }, 'ends');
  sink.member('structureWood', facePoint(face, lu - o.w / 2 + 0.06, y + o.h * 0.22, 0.093), facePoint(face, lu + o.w / 2 - 0.06, y + o.h * 0.78, 0.093), 0.07, 0.025, face.out,
    { colour: shade(leaf, 0.85), decor: true, fine: true }, 0);
}

/**
 * The mule barn (the props census #17, 2026-10-15, the judges: "cut real openings: the loft door as a reveal with a
 * hinged plank leaf or an open loft showing hay and joists, and the loft windows with board shutters or open frames that
 * show depth; the aisle gates need two leaves of boards with Z-braces and strap hinges; a hay hood with a ridge beam,
 * brackets and a pulley, rafter tails under the tin eaves"): board-and-batten on its plinth under a tin gable, the aisle
 * gates hung in their reveals as ledged-and-braced leaves on strap hinges, the loft windows cut deep with their shutters
 * swung back, the hay door cut through the front gable onto the hay in the loft, the hood carried out on the ridge beam
 * over two brackets with its pulley and rope, the rafter tails out under both eaves.
 */
const muleBarn: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng;
  const fp = footprint(ctx);
  const sheet = pick(rng, TIN);
  const mobile = ctx.tier === 'mobile';
  onLot(sink, fp, (Wf, Df) => {
    const W = Wf - 0.1, D = Df - 0.1, h = 3.6, pitch = 36, tanP = Math.tan(pitch * Math.PI / 180);
    const gateLeaf = rng() < 0.5 ? RUST : shade(WEATHERED, 0.85);
    const hay = { u0: -0.65, u1: 0.65, y0: 0.3 + h + 0.3, y1: 0.3 + h + 1.65 };
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.3, out: 0.04, bucket: 'stone' }, storeys: [{ h, wall: 'wood' }], roof: tin('gable', pitch, 0.5, 0.25), roofColour: sheet, gableBucket: 'wood',
      openings: [
        { face: 'front', storey: 0, kind: 'gate', u: 0, w: Math.min(3.2, W * 0.4), y0: 0, h: 3.0 },
        { face: 'back', storey: 0, kind: 'gate', u: 0, w: Math.min(3.2, W * 0.4), y0: 0, h: 3.0 },
        ...windowRhythm('left', 0, D, { w: 0.6, h: 0.6, sill: 1.8, spacing: 2.4, margin: 1.2 }).map((o): Opening => ({ ...o, kind: 'loft' })),
        ...windowRhythm('right', 0, D, { w: 0.6, h: 0.6, sill: 1.8, spacing: 2.4, margin: 1.2 }).map((o): Opening => ({ ...o, kind: 'loft' })),
      ],
      chimneys: [], gutters: null, verge: { colour: WHITE, bucket: 'structureWood' }, reveal: 0.2, spall: null,
    }, {
      window: (s, face, o, y0) => loftShutter(s, face, o, y0, shade(WEATHERED, 0.9 + rng() * 0.15), WHITE),
      door: (s, face, o, y0) => {
        gateUnit(s, face, o.u, y0 + o.y0, o.w, o.h, gateLeaf, { bucket: 'structureWood', width: 0.14, out: 0.05, colour: WHITE }, { wicket: false });
      },
      gableOpenings: (face) => (face.out[2] > 0.5 ? [hay] : []),
    });
    battenHouse(sink, frame, 0.3, 0.3 + h, 0.7);
    const top = frame.roof.ridgeY, z = D / 2;
    const gf: Face = { origin: [0, 0, z], u: [1, 0, 0], out: [0, 0, 1], width: W };
    // the hay door: its casing, its leaf hung open on the gable, the hay heaped on the loft floor behind it, a joist's end
    sink.recess = frame.gableReveal;
    try {
      loftShutter(sink, gf, { face: 'front', storey: 0, kind: 'loft', u: 0, w: hay.u1 - hay.u0, y0: hay.y0, h: hay.y1 - hay.y0 }, 0, shade(WEATHERED, 0.95), WHITE);
    } finally { sink.recess = 0; }
    sink.dressing(mobile, () => {
      faceBox(sink, 'straw', gf, 0, hay.y0 + 0.32, -frame.gableReveal - 0.35, 1.25, 0.64, 0.6, { decor: true });
      faceBox(sink, 'structureWood', gf, 0, hay.y0 - 0.07, -frame.gableReveal - 0.2, 1.4, 0.14, 0.4, { colour: shade(WEATHERED, 0.7), decor: true });
    });
    // the hood: the ridge beam run out over the hay door on two brackets, a tin gable over it, the pulley and its rope
    const beamY = top - 0.3, out = 1.3;
    sink.member('structureWood', [0, beamY, z - 0.4], [0, beamY, z + out], 0.16, 0.2, [0, 1, 0], { colour: shade(WEATHERED, 0.8), decor: true, exposed: true }, 0.1);
    for (const sx of [-1, 1]) {
      sink.member('structureWood', [sx * 0.75, beamY - 1.05, z + 0.02], [sx * 0.08, beamY - 0.1, z + out * 0.75], 0.1, 0.1, [sx, 0, 0], { colour: shade(WEATHERED, 0.8), decor: true, exposed: true }, 0);
    }
    const hood: RoofSpec = { ...tin('gable', pitch, 0.08, 0.02), decor: true };
    const hw = 0.95, hEave = beamY + 0.12 - hw * tanP;
    sink.placed(0, 0, 0, z + out / 2 - 0.1, () => emitRoof(sink, roofGeometry(2 * hw, out + 0.2, hEave, hood), hood, sheet));
    sink.dressing(mobile, () => {
      sink.cylinder('structureMetal', [0, beamY - 0.42, z + out - 0.15], 'x', 0.06, 0.12, 8, { colour: IRON, decor: true }, 0.12, true);
      sink.member('structureWood', [0, beamY - 0.1, z + out - 0.15], [0, beamY - 0.36, z + out - 0.15], 0.03, 0.03, [0, 0, 1], { colour: IRON, decor: true, exposed: true }, 0);
      sink.member('structureWood', [0.1, beamY - 0.46, z + out - 0.15], [0.1, hay.y0 - 0.2, z + out - 0.1], 0.025, 0.025, [0, 0, 1], { colour: shade(WEATHERED, 1.1), decor: true, exposed: true }, 0);
      // the rafter tails out under both tin eaves, every 85 cm
      const eave = 0.5, cosP = Math.cos(pitch * Math.PI / 180), sinP = Math.sin(pitch * Math.PI / 180);
      for (const side of [-1, 1]) {
        for (let zz = -D / 2 + 0.4; zz < D / 2 - 0.2; zz += 0.85) {
          const ya = frame.eaveY - 0.13 / cosP + 0.01, xa = side * (W / 2 - 0.02), xb = side * (W / 2 + eave - 0.06);
          sink.member('structureWood', [xa, ya, zz], [xb, ya - (Math.abs(xb) - Math.abs(xa)) * tanP, zz], 0.06, 0.12, [side * sinP, cosP, 0],
            { colour: shade(WEATHERED, 0.75), decor: true, fine: true, exposed: true }, 0);
        }
      }
    });
  });
  return sink.finish();
};

/**
 * The railroad's water tank: a stave tank under its conical cap on a timber trestle (props census #22, Lane C
 * 2026-10-16: "no ladder, catwalk, valve or counterweight ... unchamfered sticks with no sway"): four battered legs on
 * their footing, girts and two tiers of sway braces on every side, the cap sills and joists under the tank, the plank
 * catwalk round its foot with its rail, the ladder up a leg to the catwalk and up the staves to the roof hatch, the
 * spout hinged at the outlet and raised on its chain over a sheave to the counterweight, and the valve's rod and lever.
 */
const waterTank: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const fp = footprint(ctx);
  const S = Math.min(fp.w, fp.d), legH = 6.5 + rng() * 1.5, R = Math.max(1.6, S / 2 - 0.15);
  const timber = WEATHERED, dark = shade(WEATHERED, 0.86), dec = { decor: true } as const;
  sink.placed(0, fp.cx, 0, fp.cz, () => {
    // the trestle's footing slab fills the plot, the legs battered in from its corners to the cap sills
    sink.span('stone', -fp.w / 2 + 0.05, -0.4, -fp.d / 2 + 0.05, fp.w / 2 - 0.05, 0.25, fp.d / 2 - 0.05);
    const a = Math.min(fp.w, fp.d) / 2 - 0.4, foot = a, head = a - 0.35;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
    for (const [sx, sz] of corners) beam(sink, 'structureWood', [sx * foot, 0.25, sz * foot], [sx * head, legH, sz * head], 0.32, { colour: timber });
    const at = (y: number): number => foot + (head - foot) * (y - 0.25) / (legH - 0.25);
    // the girts at mid height and the sway braces crossing in two tiers on every side
    const mid = 0.25 + (legH - 0.25) * 0.5;
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
      const P = (sx: number, sz: number, y: number): [number, number, number] => [sx * at(y), y, sz * at(y)];
      beam(sink, 'structureWood', P(ax, az, mid), P(bx, bz, mid), 0.16, { colour: dark, ...dec });
      for (const [y0, y1] of [[0.6, mid - 0.1], [mid + 0.1, legH - 0.3]] as const) {
        beam(sink, 'structureWood', P(ax, az, y0), P(bx, bz, y1), 0.1, { colour: dark, ...dec });
        beam(sink, 'structureWood', P(bx, bz, y0), P(ax, az, y1), 0.1, { colour: dark, ...dec });
      }
    }
    // the cap sills on the legs' heads, the joists across them, the tank's floor
    for (const sx of [-1, 1]) sink.span('structureWood', sx * head - 0.2, legH, -head - 0.3, sx * head + 0.2, legH + 0.3, head + 0.3, { colour: shade(timber, 0.95) });
    const floorY = legH + 0.42, cw = R + 0.75;
    for (let k = -3; k <= 3; k++) sink.span('structureWood', -cw, legH + 0.3, k * (R / 3.5) - 0.07, cw, floorY, k * (R / 3.5) + 0.07, { colour: dark, ...dec });
    // the stave tank, its hoops and the cap with its hatch (dome-detail-275: the staves round and smooth, darkened at the
    // chime where the leaks run and under the cap's eave; the hoops round them, closer set toward the foot as the water's
    // weight wants; the cap's sheet cone with its soffit, its vent under a hat)
    const stain = 0.6 + ctx.variant() * 0.1;
    sink.revolve('wood', [0, floorY, 0], 'y', [[0, 0], [0, R], [0.7, R], [3.3, R], [3.6, R], [3.6, 0]], 24,
      { shadeAt: (p) => (p[1] < floorY + 0.05 ? stain : p[1] > floorY + 3.55 ? 0.78 : 1) });
    for (const y of [0.25, 0.75, 1.35, 2.05, 2.85]) sink.revolve('structureMetal', [0, floorY + y, 0], 'y', [[0, R - 0.01], [0.03, R + 0.02], [0.06, R - 0.01]], 24, { colour: IRON, decor: true, fine: true });
    const roofY = floorY + 3.6, sheetC = pick(rng, TIN);
    sink.revolve('structureMetal', [0, roofY, 0], 'y', [[0, R - 0.05], [0, R + 0.15], [0.08, R + 0.17], [1.24, 0.22], [1.3, 0.15], [1.3, 0]], 24, { colour: sheetC });
    sink.pipe('structureMetal', [0, roofY + 1.2, 0], [0, roofY + 1.65, 0], 0.09, 10, { colour: IRON, decor: true, caps: true });
    stackHat(sink, 0, roofY + 1.65, 0, 0.09);
    const hatchX = (R + 0.15) * 0.55;
    sink.span('structureWood', hatchX - 0.3, roofY + 0.5, -0.32, hatchX + 0.3, roofY + 0.62, 0.32, { colour: timber, ...dec });
    // the catwalk round the tank's foot: plank deck on the joists' ends, a post and two rails at its edge
    for (const [x0, z0, x1, z1] of [[-cw, -cw, cw, -R], [-cw, R, cw, cw], [-cw, -R, -R, R], [R, -R, cw, R]] as const) {
      sink.span('structureWood', x0, floorY - 0.04, z0, x1, floorY + 0.02, z1, { colour: shade(timber, 1.05), ...dec });
    }
    for (const [sx, sz] of corners) sink.span('structureWood', sx * cw - 0.05, floorY, sz * cw - 0.05, sx * cw + 0.05, floorY + 1.0, sz * cw + 0.05, { colour: dark, ...dec });
    // its edge bearers under the deck's rim, on the joists' ends
    for (const s2 of [-1, 1]) {
      sink.span('structureWood', -cw, floorY - 0.2, s2 * (cw - 0.1) - 0.07, cw, floorY - 0.04, s2 * (cw - 0.1) + 0.07, { colour: dark, ...dec });
      sink.span('structureWood', s2 * (cw - 0.1) - 0.07, floorY - 0.2, -cw, s2 * (cw - 0.1) + 0.07, floorY - 0.04, cw, { colour: dark, ...dec });
    }
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
      for (const y of [0.5, 0.98]) beam(sink, 'structureWood', [ax * cw, floorY + y, az * cw], [bx * cw, floorY + y, bz * cw], 0.06, { colour: dark, ...dec });
    }
    // the ladder: up the +x,+z leg's outer face to the catwalk, and in iron up the staves to the hatch
    const lx = cw - 0.05, lz0 = foot - 0.1;
    for (const dz of [-0.22, 0.22]) beam(sink, 'structureWood', [lx + 0.2, 0.25, lz0 + dz], [lx, floorY + 0.9, lz0 + dz - 0.4], 0.08, { colour: dark, ...dec });
    for (let y = 0.6; y < floorY; y += 0.32) {
      const t = (y - 0.25) / (floorY + 0.65), x = lx + 0.2 - 0.2 * t, z = lz0 - 0.4 * t;
      sink.span('structureWood', x - 0.03, y - 0.025, z - 0.24, x + 0.03, y + 0.025, z + 0.24, { colour: dark, ...dec, fine: true });
    }
    for (const dz of [-0.2, 0.2]) sink.span('structureMetal', R + 0.02, floorY, dz - 0.02, R + 0.06, roofY - 0.05, dz + 0.02, { colour: IRON, ...dec });
    for (let y = floorY + 0.3; y < roofY - 0.1; y += 0.3) sink.span('structureMetal', R + 0.02, y, -0.2, R + 0.12, y + 0.025, 0.2, { colour: IRON, ...dec, fine: true });
    // the spout hinged at the outlet on -x, raised along the tank on its chain over the sheave to the counterweight
    const outY = floorY + 0.45;
    sink.span('structureMetal', -R - 0.3, outY - 0.25, -0.25, -R + 0.05, outY + 0.25, 0.25, { colour: IRON, ...dec });
    // (dome-detail-275) the spout a round iron tube, its hinged collar at the outlet and the leather sock at its mouth
    sink.pipe('structureMetal', [-R - 0.25, outY, 0], [-R - 1.6, outY + 2.1, 0], 0.17, 12, { colour: IRON, ...dec, caps: true });
    sink.pipe('structureMetal', [-R - 0.2, outY - 0.08, 0], [-R - 0.42, outY + 0.26, 0], 0.22, 12, { colour: shade(IRON, 0.8), ...dec, caps: true });
    sink.pipe('structureWood', [-R - 1.3, outY + 1.68, 0], [-R - 1.55, outY + 2.03, 0], 0.2, 10, { colour: rgb(0x4a3422), ...dec, caps: true }, 0.15);
    const sheave: [number, number, number] = [-R - 0.4, roofY + 0.2, 0];
    sink.span('structureWood', -R - 0.6, roofY - 0.05, -0.08, -R + 0.1, roofY + 0.05, 0.08, { colour: dark, ...dec });
    sink.cylinder('structureMetal', [sheave[0], sheave[1], -0.04], 'z', 0.08, 0.16, 10, { colour: IRON, ...dec });
    beam(sink, 'structureMetal', [-R - 1.6, outY + 2.1, 0], [sheave[0] - 0.15, sheave[1], 0], 0.025, { colour: IRON, ...dec });
    const weightY = floorY + 1.4;
    beam(sink, 'structureMetal', [sheave[0] + 0.15, sheave[1], 0], [sheave[0] + 0.15, weightY + 0.5, 0], 0.025, { colour: IRON, ...dec });
    sink.span('structureMetal', sheave[0] - 0.05, weightY - 0.25, -0.15, sheave[0] + 0.35, weightY + 0.5, 0.15, { colour: RUST, ...dec });
    // the valve's rod down from the outlet to the lever on the leg
    beam(sink, 'structureMetal', [-R - 0.1, outY - 0.25, 0.35], [-head + 0.2, 1.2, -head + 0.2], 0.03, { colour: IRON, ...dec });
    sink.span('structureMetal', -head + 0.15, 1.1, -head + 0.15, -head + 0.25, 1.3, -head + 0.85, { colour: IRON, ...dec });
  });
  return sink.finish();
};

/**
 * The privy or woodshed behind a house (the props census #17, 2026-10-15, the judges: "keep the house plan; put it on
 * brick piers or skids with a sill, add corner boards, a crescent or slot vent, a Z-braced door with strap hinges in a
 * deeper frame, and rafter tails or a fascia under a corrugated tin roof with a drip edge"): board-and-batten on a
 * fieldstone sill under its tin lean-to, white corner boards, the plank door hung deep in its batten frame with its
 * ledges, Z-brace and strap hinges, the vent slot cut high in the side, the fascia and the drip edge along the low eave.
 */
const woodshed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng;
  const fp = footprint(ctx);
  const W = Math.max(1.6, fp.w - 0.06), D = Math.max(1.4, fp.d - 0.06), h = 2.1 + rng() * 0.3;
  const sheet = pick(rng, TIN);
  sink.placed(0, fp.cx, 0, fp.cz, () => {
    const sill = 0.22;
    // (props census r2 sweep, Lane C 2026-10-16: over a 1.85 m door the batten broke off a hand above its head casing, a
    // dark 6 x 29 cm stub lying on the boards) the door framed up close under the wall plate, as a shed door is: no stub
    // of batten over its head
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: sill, out: 0.02, bucket: 'stone', course: false }, storeys: [{ h, wall: 'wood' }], roof: tin('shed', 10, 0.2, 0.15), roofColour: sheet,
      openings: [{ face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * Math.max(0, W - 1.2), w: 0.8, y0: 0, h: h - 0.25 },
        { face: 'right', storey: 0, kind: 'loft', u: 0, w: Math.min(0.5, D - 0.6), y0: h - 0.42, h: 0.14 }],
      chimneys: [], gutters: null, verge: null, reveal: 0.1, spall: null,
    }, {
      window: () => {},
      door: (s, face, o, y0, fr) => {
        doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
          leaf: WEATHERED, frame: { bucket: 'structureWood', width: 0.08, out: 0.04, colour: BATTEN }, steps: null, leafKind: 'plank',
        }, fr.floors[o.storey] + o.y0);
        // the ledges, the Z-brace between them and the strap hinges on the leaf at the back of the frame
        const go = (s.recess > 0 ? -s.recess + 0.03 : 0.02) + 0.045, y = y0 + o.y0, l0 = o.u - o.w / 2 + 0.06, l1 = o.u + o.w / 2 - 0.06;
        const ledge = { colour: shade(WEATHERED, 0.82), decor: true, fine: true } as const;
        for (const t of [0.16, 0.84]) {
          faceBox(s, 'structureWood', face, o.u, y + o.h * t, go, o.w - 0.12, 0.1, 0.025, ledge);
          faceBox(s, 'structureMetal', face, l0 + 0.2, y + o.h * t, go + 0.017, 0.4, 0.035, 0.008, { colour: IRON, decor: true, fine: true });
        }
        s.member('structureWood', facePoint(face, l0 + 0.04, y + o.h * 0.2, go - 0.012), facePoint(face, l1 - 0.04, y + o.h * 0.8, go - 0.012), 0.08, 0.024, face.out, ledge, 0);
      },
    });
    shedGables(sink, W, D, frame.eaveY, Math.tan(10 * Math.PI / 180), 'wood');
    battenHouse(sink, frame, sill, sill + h, 0.5);
    sink.dressing(ctx.tier === 'mobile', () => {
      // the corner boards
      for (const name of ['front', 'back'] as const) {
        const f = frame.faces[name];
        for (const side of [-1, 1]) faceBox(sink, 'structureWood', f, side * (f.width / 2 - 0.05), sill + h / 2, 0.025, 0.1, h, 0.03, { colour: WHITE, decor: true }, 'caps');
      }
      // the fascia board along the low eave (+x) under the sheet's edge, and the drip edge folded over it
      const r = frame.faces.right, ex = 0.2, ey = frame.eaveY - ex * Math.tan(10 * Math.PI / 180);
      faceBox(sink, 'structureWood', r, 0, ey - 0.06, ex - 0.02, D + 0.3, 0.12, 0.025, { colour: WHITE, decor: true });
      faceBox(sink, 'structureMetal', r, 0, ey + 0.005, ex + 0.005, D + 0.3, 0.04, 0.01, { colour: shade(sheet, 0.9), decor: true, fine: true });
    });
  });
  return sink.finish();
};

/** The burnt house's ash, its scorched boards and the fire-blued and rusted iron (dome-detail-275). */
const ASH = rgb(0x6c675e), SCORCH = rgb(0x4a3a2e), BURNT_TIN = rgb(0x6a5a4c);

/**
 * A house burnt to its chimney (dome-detail-275, wave 2: "a chimney box, a black sill outline and two fallen boards on
 * pier blocks"; after the approved Podhale spalona). The Louisiana house after the fire, as the pine-woods towns saw
 * them: the brick piers standing in their rows, the middle row under the girder too, one knocked over; the sills charred
 * on them and the joists across them burnt through, some whole, some broken and fallen into the crawlspace, a patch of
 * the floor left by the hearth; the chimney standing alone as they always do — its firebox in brick over the two
 * hearths back to back, their mouths sooted, the shoulders stepping in to the stack, the stack scorched where the roof
 * burnt round it and its corbelled head black; one corner of the frame still standing on its sill, studs and a few
 * boards burnt to ragged heads falling away from it, the door's jambs over the brick stoop whose steps climb to
 * nothing; the roof's galvanised sheets fallen in, rusted, slid off the sills into the ash, one leant on the stack; the
 * iron bedstead and the cookstove dropped through the floor into the ash and charred boards heaped round them.
 */
const burnt: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const fp = footprint(ctx);
  const W = Math.max(3.6, fp.w - 0.1), D = Math.max(4, fp.d - 0.1);
  // the house's body behind the stoop, the sill's top S, the joists' top F (the old floor)
  const Dh = D - 1.15, bzc = -0.575, S = 0.85, F = 1.05, hw = W / 2, hd = Dh / 2;
  sink.placed(0, fp.cx, 0, fp.cz, () => {
    sink.placed(0, 0, 0, bzc, () => {
      piers(sink, W, Dh, 0.6);
      // the charred sills round the plan on the piers (structure: the house's footprint stays solid at its base)
      for (const [x0, z0, x1, z1] of [[-hw, -hd, hw, -hd + 0.25], [-hw, hd - 0.25, hw, hd], [-hw, -hd, -hw + 0.25, hd], [hw - 0.25, -hd, hw, hd]] as const) {
        sink.span('structureWood', x0, 0.6, z0, x1, S, z1, { colour: CHAR });
      }
      // the ash and the fallen char lying over the crawlspace's floor inside the piers
      sink.span('structureWood', -hw + 0.25, 0, -hd + 0.25, hw - 0.25, 0.05, hd - 0.25, { colour: ASH, decor: true, ground: true });
      // the middle row of piers under the girder, one knocked off its footing and lying in the ash; the girder's burnt
      // lengths on them
      const nz = Math.max(2, Math.round(Dh / 2.4) + 1), down = 1 + Math.floor(look() * (nz - 2));
      for (let k = 1; k < nz - 1; k++) {
        const z = -hd + 0.2 + (Dh - 0.4) * k / (nz - 1);
        if (k === down) sink.member('stone', [0.15, 0.05, z - 0.1], [0.75, 0.05, z + 0.25], 0.4, 0.38, [0, 1, 0], { decor: true, exposed: true, shade: 0.85 }, 0);
        else sink.span('stone', -0.2, -0.3, z - 0.2, 0.2, 0.6, z + 0.2);
      }
      // the chimney (zc its middle along the house; the firebox 1.7 x 1.1 to y 2.3, the stack 0.84 x 0.64 to T)
      const zc = (rng() - 0.5) * Dh * 0.12 - Dh * 0.06, T = 5.9 + rng() * 0.9;
      const girder = (z0: number, z1: number, keep: boolean) => {
        if (z1 - z0 < 0.3) return;
        if (keep) sink.span('structureWood', -0.11, 0.6, z0, 0.11, S, z1, { colour: shade(CHAR, 1.1), decor: true });
        else sink.member('structureWood', [0, S - 0.02, z0 + 0.05], [0.35, 0.06, z1 - 0.3], 0.22, 0.24, [0, 1, 0], { colour: shade(CHAR, 1.1), decor: true, exposed: true }, 0);
      };
      girder(-hd + 0.25, zc - 0.58, look() < 0.6);
      girder(zc + 0.58, hd - 0.25, true);
      // the firebox: its two holed faces the look (decor, the collision outline's rule), its solid boxes 2 cm inside them
      // round the fireplaces, the firebacks the core's faces, sooted
      for (const s of [-1, 1]) {
        const f: Face = { origin: [0, 0, zc + s * 0.55], u: [s, 0, 0], out: [0, 0, s], width: 1.7 };
        holedPolygon(sink, 'stone', f, [[-0.85, -0.5], [0.85, -0.5], [0.85, 2.3], [-0.85, 2.3]], [{ u0: -0.4, u1: 0.4, y0: F, y1: F + 0.78 }], 0.55, 0.38, { decor: true });
        faceBox(sink, 'stone', f, 0, F + 0.38, -0.375, 0.78, 0.76, 0.01, { decor: true, shade: 0.3 });
        faceBox(sink, 'stone', f, 0, F + 1.0, 0.012, 1.0, 0.36, 0.01, { decor: true, shade: 0.55 });
        // the hearth before it on its brick support, a grate's bars in the mouth
        faceBox(sink, 'stone', f, 0, (F - 0.3) / 2 + 0.005, 0.27, 1.5, F + 0.3, 0.5, { decor: true, shade: 0.8 });
        faceBox(sink, 'structureMetal', f, 0, F + 0.14, -0.22, 0.6, 0.06, 0.26, { colour: IRON, decor: true });
      }
      sink.span('stone', -0.83, -0.5, zc - 0.53, 0.83, F - 0.02, zc + 0.53);
      for (const s of [-1, 1]) sink.span('stone', s * 0.42, F - 0.02, zc - 0.53, s * 0.83, F + 0.8, zc + 0.53);
      sink.span('stone', -0.42, F - 0.02, zc - 0.17, 0.42, F + 0.8, zc + 0.17);
      sink.span('stone', -0.83, F + 0.8, zc - 0.53, 0.83, 2.3, zc + 0.53);
      // the shoulders stepping in to the stack (the weatherings on both sides), the stack in its scorched and sooted bands,
      // its two corbelled courses and the head black
      orientedPrism(sink, 'stone', [[-0.85, 2.3, zc - 0.55], [0.85, 2.3, zc - 0.55], [0.42, 2.95, zc - 0.55], [-0.42, 2.95, zc - 0.55]], [0, 0, 1], 1.1, {});
      const band = (y0: number, y1: number, opts: { shadeAt?: (p: Vec3) => number; shade?: number }) => sink.span('stone', -0.42, y0, zc - 0.32, 0.42, y1, zc + 0.32, opts);
      band(2.95, 3.6, { shadeAt: (p) => (p[1] < 3.0 ? 0.7 : 0.9) });
      band(3.6, 4.6, { shadeAt: (p) => (p[1] < 4.0 ? 0.55 : 0.8) });
      band(4.6, T - 0.4, {});
      band(T - 0.4, T, { shadeAt: (p) => (p[1] > T - 0.05 ? 0.35 : 0.6) });
      sink.span('stone', -0.49, T - 0.4, zc - 0.39, 0.49, T - 0.28, zc + 0.39, { decor: true, shade: 0.62 });
      sink.span('stone', -0.54, T - 0.28, zc - 0.44, 0.54, T - 0.12, zc + 0.44, { decor: true, shadeAt: (p) => (p[1] > T - 0.15 ? 0.32 : 0.5) });
      sink.span('dark', -0.3, T - 0.12, zc - 0.2, 0.3, T - 0.1, zc + 0.2, { decor: true });
      // the joists across the sills, 60 cm apart: whole by the hearth's patch, burnt through elsewhere — one half fallen
      // from its sill into the ash, or a stub left on the sill
      const patch0 = zc + 0.6, patch1 = Math.min(hd - 0.4, zc + 2.4), side = look() < 0.5 ? -1 : 1;
      for (let z = -hd + 0.55; z < hd - 0.3; z += 0.6) {
        if (Math.abs(z - zc) < 0.62) continue;
        const keep = z > patch0 - 0.35 && z < patch1 + 0.35, r = look(), jc = { colour: shade(CHAR, 0.85 + look() * 0.4), decor: true } as const;
        if (keep || r < 0.3) { sink.span('structureWood', -hw + 0.06, S, z - 0.03, hw - 0.06, F, z + 0.03, jc); continue; }
        for (const s of [-1, 1]) {
          const t = look();
          if (t < 0.45) sink.member('structureWood', [s * (hw - 0.12), S + 0.02, z], [s * (0.6 + t * 1.2), 0.07, z + (look() - 0.5) * 0.5], 0.06, 0.2, [0, 1, 0], { ...jc, exposed: true }, 0);
          else sink.span('structureWood', s * (hw - 0.06), S, z - 0.03, s * (hw - 0.4 - t * 0.9), F, z + 0.03, jc);
        }
      }
      // the floor left by the hearth on its joists: boards along the house, their burnt ends ragged
      for (let x = 0.25; x < hw - 0.2; x += 0.155) {
        const z0 = patch0 - 0.32 + look() * 0.25, z1 = patch1 + 0.3 - look() * (0.3 + (x / hw) * 1.4);
        if (z1 - z0 > 0.4) sink.span('structureWood', side * x - 0.07, F, z0, side * x + 0.07, F + 0.025, z1, { colour: shade(SCORCH, 0.8 + look() * 0.45), decor: true });
      }
      // the standing corner (on the back corner away from the patch): its post, studs and boards on both walls burnt to
      // ragged heads falling away from it, the plate's stub over the first bays
      const cx = -side * hw, czc = -hd, Hc = 2.6 + look() * 0.6;
      sink.span('structureWood', cx - 0.07, S, czc - 0.0, cx + 0.07, S + Hc, czc + 0.14, { colour: shade(CHAR, 1.1), decor: true });
      const walls: Array<{ o: Vec3; dir: Vec3; out: Vec3; len: number }> = [
        { o: [cx, 0, czc + 0.07], dir: [side, 0, 0], out: [0, 0, -1], len: W * 0.55 },
        { o: [cx - side * 0.0, 0, czc], dir: [0, 0, 1], out: [-side, 0, 0], len: Dh * 0.4 },
      ];
      for (const w of walls) {
        const p = (u: number, y: number, o = 0): Vec3 => [w.o[0] + w.dir[0] * u + w.out[0] * o, y, w.o[2] + w.dir[2] * u + w.out[2] * o];
        for (let u = 0.4; u < w.len; u += 0.4) {
          const h = Math.max(0.2, Hc * (1 - u / w.len) * (0.7 + look() * 0.45));
          sink.member('structureWood', p(u, S), p(u, S + h), 0.06, 0.1, [w.out[0], 0, w.out[2]], { colour: shade(CHAR, 0.9 + look() * 0.3), decor: true, exposed: true }, 0.08);
        }
        for (let u = 0.05; u < w.len * 0.75; u += 0.27) {
          const h = Math.max(0.15, Hc * 0.9 * (1 - u / (w.len * 0.75)) * (0.6 + look() * 0.5) - 0.2);
          sink.member('structureWood', p(u + 0.12, S - 0.1), p(u + 0.12, S - 0.1 + h), 0.24, 0.025, [w.out[0], 0, w.out[2]],
            { colour: shade(u < 0.6 ? SCORCH : CHAR, 0.75 + look() * 0.5), decor: true, exposed: true }, -0.02);
        }
        // the wall plate burnt off the post's head, its end down in the ash
        const pa = p(0.08, S + Hc - 0.12, 0.02), pb = p(Math.min(2.2, w.len * 0.8), 0.06, -0.6);
        sink.member('structureWood', pa, pb, 0.12, 0.1, upFrom(pa, pb), { colour: CHAR, decor: true, exposed: true }, 0.05);
      }
      // the door's charred jambs on the front sill over the stoop, one burnt short
      const dx = -W * 0.18;
      for (const s of [-1, 1]) {
        const top = S + (s > 0 ? 1.0 + look() * 0.5 : 1.7 + look() * 0.5);
        sink.span('structureWood', dx + s * 0.5 - 0.06, S, hd - 0.2, dx + s * 0.5 + 0.06, top, hd - 0.06, { colour: shade(CHAR, 1.1), decor: true });
      }
      // the roof's sheets fallen in: slid off the side sills into the ash, laid over the joists by the patch, one leant on
      // the stack, one folded on the ground at the back
      const sheetC = () => (look() < 0.3 ? BURNT_TIN : shade(RUST, 0.8 + look() * 0.5));
      for (const s of [-1, 1]) {
        const n = 2 + Math.floor(look() * 2), z0 = s === side ? -hd + 0.6 : zc + 0.9;
        for (let k = 0; k < n; k++) {
          const z = z0 + k * (0.62 + look() * 0.1), reach = 1.6 + look() * 0.9;
          if (z > hd - 0.4) break;
          const a: Vec3 = [s * (hw - 0.05), S + 0.015, z], b: Vec3 = [s * (hw - reach), 0.07, z + (look() - 0.5) * 0.6];
          sink.member('structureMetal', a, b, 0.64, 0.02, upFrom(a, b), { colour: sheetC(), decor: true, exposed: true }, 0);
        }
      }
      for (let k = 0; k < 2; k++) {
        const z = patch0 + 0.3 + k * 0.66, x = side * (0.9 + look() * 0.8);
        sink.member('structureMetal', [x, F + 0.006 + k * 0.01, z - 0.0], [x + side * 0.3, F + 0.006 + k * 0.01, z + 0.04], 2.2, 0.02, [0, 1, 0], { colour: sheetC(), decor: true, exposed: true }, 0);
      }
      {
        const a: Vec3 = [-side * 1.9, 0.06, zc - 0.1], b: Vec3 = [-side * 0.44, 2.6, zc + 0.05];
        sink.member('structureMetal', a, b, 0.64, 0.02, upFrom(a, b), { colour: sheetC(), decor: true, exposed: true }, 0);
      }
      // the iron bedstead dropped through the floor into the ash of the back room, its head and foot frames, bars, rails
      {
        const bx = side * (hw - 1.1), bz = -hd + 1.6, y = 0.05, c = { colour: shade(RUST, 0.75), decor: true } as const;
        for (const [ez, hgt] of [[-0.95, 1.15], [0.95, 0.85]] as const) {
          const z = bz + ez;
          for (const s of [-1, 1]) sink.span('structureMetal', bx + s * 0.6 - 0.025, y, z - 0.025, bx + s * 0.6 + 0.025, y + hgt, z + 0.025, c);
          for (const ry of [hgt - 0.05, 0.45]) sink.span('structureMetal', bx - 0.58, y + ry - 0.02, z - 0.015, bx + 0.58, y + ry + 0.02, z + 0.015, c);
          for (let k = 1; k < 6; k++) sink.span('structureMetal', bx - 0.58 + k * 0.193 - 0.01, y + 0.47, z - 0.01, bx - 0.58 + k * 0.193 + 0.01, y + hgt - 0.07, z + 0.01, { ...c, fine: true });
        }
        for (const s of [-1, 1]) sink.span('structureMetal', bx + s * 0.6 - 0.02, y + 0.3, bz - 0.93, bx + s * 0.6 + 0.02, y + 0.36, bz + 0.93, c);
      }
      // the cookstove fallen through at the back, canted in the ash: its firebox and oven, the top's lids, the reservoir,
      // its stovepipe lying across the joists' ends
      {
        const sx = -side * (hw - 1.3), sz = -hd + 1.2;
        sink.placed(0.35 * side, sx, 0.02, sz, () => {
          const c = { colour: IRON, decor: true } as const;
          sink.span('structureMetal', -0.5, 0.18, -0.32, 0.5, 0.8, 0.32, c);
          sink.span('structureMetal', -0.56, 0.8, -0.36, 0.56, 0.86, 0.36, { colour: shade(IRON, 1.2), decor: true });
          sink.span('structureMetal', 0.5, 0.3, -0.3, 0.78, 0.92, 0.3, { colour: shade(RUST, 0.7), decor: true });
          for (const [x, z] of [[-0.42, -0.26], [0.42, -0.26], [0.42, 0.26], [-0.42, 0.26]] as const) sink.span('structureMetal', x - 0.05, 0, z - 0.05, x + 0.05, 0.18, z + 0.05, c);
          faceBox(sink, 'structureMetal', { origin: [0, 0, 0.32], u: [1, 0, 0], out: [0, 0, 1], width: 1 }, 0.15, 0.5, 0.01, 0.48, 0.4, 0.02, { colour: shade(IRON, 1.35), decor: true, fine: true });
          for (const x of [-0.25, 0.15]) sink.cylinder('structureMetal', [x, 0.86, 0], 'y', 0.012, 0.13, 10, { colour: shade(IRON, 0.8), decor: true, fine: true });
          sink.pipe('structureMetal', [-0.3, 0.86, -0.2], [-0.3, 1.25, -0.2], 0.09, 8, { colour: shade(RUST, 0.8), decor: true, caps: true });
        });
        sink.pipe('structureMetal', [sx - 0.1 * side, 0.1, sz + 0.5], [sx + side * 0.5, 0.12, sz + 2.1], 0.09, 8, { colour: shade(RUST, 0.85), decor: true, caps: true });
      }
      // the charred boards and the ash heaped in the crawlspace, round the stack's foot and before the stoop
      for (const [x, z, r] of [[side * (hw - 0.9), patch1 + 0.6, 0.7], [-side * 1.2, zc + 1.4, 0.8], [side * 0.4, -hd + 0.9, 0.6]] as const) {
        const zz = Math.max(-hd + 0.3 + r, Math.min(hd - 0.3 - r, z));
        mound(sink, [x, 0.04, zz], [1, 0, 0], [0, 0, 1], r, r * 0.85, 0.3 + look() * 0.25, look() < 0.5 ? ASH : shade(CHAR, 1.5), { decor: true }, look() * 3, 6);
      }
      for (let k = 0; k < 4; k++) {
        const x = (look() - 0.5) * (W - 2.2), z = (look() - 0.5) * (Dh - 2.2), a = look() * Math.PI, l = 1.2 + look() * 1.4;
        if (Math.abs(x) < 1.1 && Math.abs(z - zc) < 0.9) continue;
        const p: Vec3 = [x - Math.cos(a) * l / 2, 0.05, z - Math.sin(a) * l / 2], q: Vec3 = [x + Math.cos(a) * l / 2, 0.12 + look() * 0.25, z + Math.sin(a) * l / 2];
        sink.member('structureWood', p, q, 0.14, 0.04, upFrom(p, q), { colour: shade(CHAR, 0.8 + look() * 0.5), decor: true, exposed: true }, 0);
      }
    });
    // the brick stoop before the door: its steps climbing to the burnt-out sill and nothing
    const dx = -W * 0.18, zf = D / 2 - 1.15;
    for (let k = 0; k < 4; k++) sink.span('stone', dx - 0.7, -0.1, zf, dx + 0.7, (k + 1) * (S / 4), zf + (4 - k) * 0.28 - (k === 0 ? 0.03 : 0));
    for (const s of [-1, 1]) sink.span('stone', dx + s * 0.7 - (s > 0 ? 0 : 0.12), -0.1, zf, dx + s * 0.7 + (s > 0 ? 0.12 : 0), S + 0.12, zf + 0.5, { decor: true, shade: 0.9 });
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

const LONGLEAF_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
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
  },
  // the houses' yards: a plank fence and gate, the privy or woodshed at the back, the kitchen garden (yards.ts)
  yard: { kinds: ['logcabin', 'farmhouse'], fence: 'fenceplank', gate: 'gate', shed: 'woodshed', shedSize: [2.4, 2.0], garden: true },
});
