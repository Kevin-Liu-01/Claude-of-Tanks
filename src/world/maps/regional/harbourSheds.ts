// src/world/maps/regional/harbourSheds.ts — the waterfront family's kit buildings the looks lane rebuilt in kits it does
// not own (props census #25, the looks lane 2026-10-15; WORKLIST.md "Waterfront buildings"): the Mekong boat shelter and
// fish-buying shed (Mangrove Reach, kit:mekong/boatshed and /fishery), the Dalmatian boathouse with its round-arched
// water door (Saltwind, kit:dalmatian/boatshed) and the Zeeland pakhuis of the fish trade (Polders, kit:polder/fishery).
// Each kit file keeps one re-pointing line; a builder that needs the kit's own joinery takes its state and dialect from
// the kit's call (no import back into the kit).
import { LocalFrame, PartSink, faceBox, facePoint, pick, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, storeyFaces, windowRhythm, type HouseDialect, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, type WindowStyle } from './openings.ts';
import { recordLattice } from './lattice.ts';
import { archHead } from './sarajevoParts.ts';
import { dressedQuoin } from './facade.ts';
import { BAMBOO_MAT, RUSTED, WEATHERED_PLANK } from './vernacular.ts';
import { boatHull, bollard, hungNet, leantPole, slipway } from './waterfront.ts';
import type { RegionalBuildContext } from './types.ts';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
/** A box standing free on a face's plane (u, y, o its centre): every face drawn (faceBox drops a seated box's back). */
function freeBox(sink: PartSink, face: Face, u: number, y: number, o: number, su: number, sy: number, so: number, opts: EmitOptions, bucket: RegionalBucket = 'structureWood',
  caps = true): void {
  sink.box(bucket, facePoint(face, u, y, o), [su / 2, sy / 2, so / 2], { ...opts, uv: opts.uv ?? { kind: 'world' } }, new LocalFrame(face.u, [0, 1, 0], face.out, [0, 0, 0]),
    caps ? undefined : { py: true, ny: true });
}
const uvOffset = (ctx: RegionalBuildContext): [number, number] => [ctx.rng() * 7.31, ctx.rng() * 5.17];
const IRON: Rgb = [0.16, 0.16, 0.16];
const FOAM = rgb(0xe9e8e1), TARP = rgb(0x2f6db0);
const BASKETS: readonly Rgb[] = [0xc0392b, 0x2e6fb8, 0x3a9a5a, 0xd8a028].map(rgb);

// ------------------------------------------------------------------------------------------------ the Mekong

const nipa = (pitch: number): RoofSpec => ({ kind: 'gable', pitchDeg: pitch, eave: 0.6, verge: 0.4, thickness: 0.26, bucket: 'straw', ridge: 'round', thatch: 'nipa' });
const tole = (pitch: number): RoofSpec => ({ kind: 'gable', pitchDeg: pitch, eave: 0.5, verge: 0.35, thickness: 0.06, bucket: 'roof', ridge: 'saddle' });

/** A plastic fish basket or a foam ice box on the ground or a deck at y. Dressing. */
function basket(sink: PartSink, x: number, y: number, z: number, colour: Rgb): void {
  sink.cylinder('structureWood', [x, y, z], 'y', 0.34, 0.27, 9, { colour, decor: true, fine: true }, 0.22, false);
  sink.cylinder('structureWood', [x, y, z], 'y', 0.02, 0.22, 9, { colour: shade(colour, 0.7), decor: true, fine: true }, 0.22, true);
}
function foamBox(sink: PartSink, x: number, y: number, z: number, look: () => number): void {
  sink.span('structureWood', x - 0.31, y, z - 0.21, x + 0.31, y + 0.36, z + 0.21, { colour: shade(FOAM, 0.94 + look() * 0.06), decor: true, fine: true });
}

/**
 * The boat shelter of a Cà Mau creek (kit:mekong/boatshed; the judges: "square post spans, walls single plank-coloured
 * slabs, one roof slab, no boat, no water access"): round hardwood posts on footing pads, plates and tie beams with
 * knee braces, bamboo rafters and purlins under nipa thatch (or a sheet roof on its laps), the walls of the three closed
 * sides woven nipa panels in bamboo frames or upright planks with their gaps, the back gable closed; the creek end open
 * over a plank slip on its bearers, the sampan drawn up on it under its hood, the paddles and a net. Shot, its posts
 * snap and its thatch comes down in a heap (lattice.ts recordLattice).
 */
export function mekongBoatShelter(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile', bb = ctx.bounds;
  // the base hall's span (railKit makeBoatshed: its info is the hall's w + 3 and d + 2.6, the ramp toward +z)
  const W = clamp(ctx.info.w - 3.4, 4.2, 6.6), D = clamp(ctx.info.d - 2.2, 7, 11.5);
  const post = pick(rng, WEATHERED_PLANK), timber = shade(post, 0.82);
  const thatched = look() < 0.7, mat = look() < 0.55;
  const plate = 2.5, px = W / 2 - 0.12, n = Math.max(3, Math.round(D / 2.3) + 1);
  const zs = Array.from({ length: n }, (_, k) => -D / 2 + 0.12 + (D - 0.24) * k / (n - 1));
  const legs: Array<{ foot: Vec3; head: Vec3 }> = [];
  // the posts on their pads; the plates; the tie beams and knee braces
  for (const sx of [-1, 1]) for (const z of zs) {
    const x = sx * px;
    sink.span('stone', x - 0.18, -0.35, z - 0.18, x + 0.18, 0.12, z + 0.18, { tint: [0.82, 0.8, 0.76] });
    sink.cylinder('structureWood', [x, 0.12, z], 'y', plate + 0.14 - 0.12, 0.085, 6, { colour: shade(timber, 0.95 + look() * 0.1) }, 0.08);
    legs.push({ foot: [x, 0.12, z], head: [x, plate, z] });
  }
  for (const x of [-W / 4, W / 4]) {
    sink.span('stone', x - 0.16, -0.35, -D / 2 + 0.12 - 0.16, x + 0.16, 0.12, -D / 2 + 0.12 + 0.16, { tint: [0.82, 0.8, 0.76] });
    sink.cylinder('structureWood', [x, 0.12, -D / 2 + 0.12], 'y', plate + 0.14 - 0.12, 0.075, 6, { colour: timber }, 0.07);
  }
  for (const sx of [-1, 1]) sink.span('structureWood', sx * px - 0.08, plate, -D / 2, sx * px + 0.08, plate + 0.14, D / 2, { colour: shade(timber, 0.9) });
  sink.dressing(mobile, () => {
    for (const z of zs) {
      sink.span('structureWood', -px - 0.1, plate + 0.14, z - 0.06, px + 0.1, plate + 0.26, z + 0.06, { colour: shade(timber, 0.85), decor: true, fine: true });
      for (const sx of [-1, 1]) sink.member('structureWood', [sx * (px - 0.06), plate - 0.6, z], [sx * (px - 0.6), plate + 0.16, z], 0.07, 0.07, [0, 0, 1], { colour: shade(timber, 0.85), decor: true, exposed: true, fine: true }, 0.035);
    }
  });
  // the roof: rafters, purlins and the ridge pole under the covering
  const roof = thatched ? nipa(30 + look() * 4) : tole(18 + look() * 4);
  const eaveY = plate + 0.26, rw = 2 * (px + 0.08);
  const rg = roofGeometry(rw, D + 0.1, eaveY, roof);
  emitRoof(sink, rg, roof, thatched ? undefined : pick(look, RUSTED));
  const under = (x: number) => rg.ridgeY - Math.abs(x) * rg.tanP - 0.03;
  sink.dressing(mobile, () => {
    const bam = { colour: shade(BAMBOO_MAT, 0.85), decor: true, exposed: true, fine: true } as const;
    for (let z = -D / 2; z <= D / 2 + 1e-6; z += D / Math.max(1, Math.round(D / 1.0))) {
      for (const s of [-1, 1]) sink.member('structureWood', [s * (rg.s + roof.eave * 0.85), under(rg.s + roof.eave * 0.85) - 0.05, z], [0, under(0) - 0.05, z], 0.08, 0.08, [0, 0, 1], bam, 0.04);
    }
    for (const s of [-1, 1]) for (const t of [0.35, 0.72]) {
      const x = s * rg.s * (1 - t);
      sink.cylinder('structureWood', [x, under(x) - 0.13, -D / 2 - roof.verge + 0.1], 'z', D + 2 * roof.verge - 0.2, 0.045, 6, { colour: shade(BAMBOO_MAT, 0.9), decor: true, fine: true });
    }
    sink.cylinder('structureWood', [0, under(0) - 0.14, -D / 2 - roof.verge + 0.05], 'z', D + 2 * roof.verge - 0.1, 0.06, 6, { colour: shade(BAMBOO_MAT, 0.8), decor: true, fine: true });
  });
  // the walls of the three closed sides: framed nipa panels, or upright planks with their gaps (structure: the cover the
  // base shed gave)
  const wallTone = mat ? BAMBOO_MAT : pick(look, WEATHERED_PLANK);
  const side = (face: Face, u0: number, u1: number, y1: (u: number) => number) => {
    // the sill along the wall's foot from pad to pad, the panels or boards standing on it to the plate (both their faces:
    // the shelter is seen from inside through its open end)
    freeBox(sink, face, (u0 + u1) / 2, 0.12, 0, u1 - u0, 0.12, 0.09, { colour: shade(timber, 0.8) });
    if (mat) {
      // a panel a bay, its bamboo rails at foot and head, two centimetres off each post
      for (let u = u0; u < u1 - 0.3; u += 2.0) {
        const a = u + 0.1, b = Math.min(u1, u + 2.0) - 0.1, top = Math.min(y1(a), y1(b));
        freeBox(sink, face, (a + b) / 2, (0.18 + top) / 2, 0, b - a, top - 0.18, 0.035, { colour: shade(wallTone, 0.86 + look() * 0.22) });
        for (const y of [0.24, top - 0.06]) faceBox(sink, 'structureWood', face, (a + b) / 2, y, 0.035, b - a + 0.08, 0.06, 0.05, { colour: shade(BAMBOO_MAT, 0.75), decor: true });
      }
    } else {
      for (let u = u0 + 0.14; u < u1 - 0.12; u += 0.29) {
        const top = y1(u);
        freeBox(sink, face, u, (0.18 + top) / 2, 0, 0.265, top - 0.18, 0.03, { colour: shade(wallTone, 0.84 + look() * 0.26) }, 'structureWood', false);
      }
    }
  };
  side({ origin: [px, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D }, -D / 2, D / 2 - 0.3, () => plate);
  side({ origin: [-px, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D }, -D / 2 + 0.3, D / 2, () => plate);
  // the back: its wall to the eaves and its gable to the rake
  const back: Face = { origin: [0, 0, zs[0]], u: [-1, 0, 0], out: [0, 0, -1], width: W };
  side(back, -px, px, (u) => eaveY + Math.max(0, rg.s - Math.abs(u)) * rg.tanP - 0.06);
  // the creek end's fascia board under the eave
  faceBox(sink, 'structureWood', { origin: [0, 0, D / 2 + 0.06], u: [1, 0, 0], out: [0, 0, 1], width: W }, 0, plate + 0.07, 0.02, rw, 0.14, 0.04, { colour: shade(timber, 0.8), decor: true });
  // the plank slip from inside the shelter down to the plot's water edge: bearers, the boards across them
  const z0 = -D / 2 + 1.2, z1 = Math.max(D / 2 + 0.5, bb.maxZ - 0.1), yb = 0.22, yf = -0.25;
  const yAt = (z: number) => yb + (yf - yb) * (z - z0) / (z1 - z0);
  for (const x of [-0.7, 0.7]) sink.member('structureWood', [x, yb - 0.1, z0], [x, yf - 0.1, z1], 0.16, 0.12, [0, 1, 0], { colour: shade(timber, 0.7), exposed: true }, 0.06);
  sink.dressing(mobile, () => {
    for (let z = z0 + 0.15; z < z1 - 0.1; z += 0.3) {
      // a board's top across the bearers (its edges a hand's breadth over them)
      const ya = yAt(z - 0.13) + 0.03, yb2 = yAt(z + 0.13) + 0.03;
      const bc = shade(pick(look, WEATHERED_PLANK), 0.8 + look() * 0.25);
      sink.quad('structureWood', [-1.05, yb2, z + 0.13], [1.05, yb2, z + 0.13], [1.05, ya, z - 0.13], [-1.05, ya, z - 0.13], { colour: bc, decor: true });
      sink.quad('structureWood', [-1.05, ya - 0.03, z - 0.13], [1.05, ya - 0.03, z - 0.13], [1.05, yb2 - 0.03, z + 0.13], [-1.05, yb2 - 0.03, z + 0.13], { colour: shade(bc, 0.7), decor: true });
    }
    // the sampan on the slip under its hood, its bow to the creek; paddles and a net on the wall
    const len = Math.min(6.2, D * 0.72), bz = Math.min(D / 2 - len / 2 + 0.6, z1 - len / 2 - 0.1);
    boatHull(sink, [0, yAt(bz) + 0.06, bz], -Math.PI / 2, { length: len, beam: 1.35, depth: 0.55, sheer: 0.38, stern: 'double', flat: 0.45,
      colour: shade(rgb(0x6a4a30), 0.85 + look() * 0.2), inside: rgb(0x8a6a48), gunwale: rgb(0x2e5a7a), thwarts: 2, hood: BAMBOO_MAT });
    const wf: Face = { origin: [px + 0.06, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D };
    for (const k of [0, 1]) leantPole(sink, { ...wf, out: [-1, 0, 0], u: [0, 0, 1] }, -D * 0.3 + k * 0.25, 0.35 + k * 0.05, 2.3, 0.2, shade(timber, 1.1), true);
    // the cast net hung to dry over the tie beam nearest the creek end
    const tz = zs[n - 2];
    hungNet(sink, -px * 0.7, -px * 0.1, plate + 0.2, tz, rgb(0x2e6a5a), look, { floats: rgb(0xd8a028), foot: 1.2 });
  });
  recordLattice(sink, legs, [plate], 0.17, 'structureWood', timber, {
    x0: -1.2, x1: 1.2, y0: eaveY, y1: eaveY + 2.2, z0: -1.2, z1: 1.2, bucket: roof.bucket, tint: thatched ? [0.62, 0.52, 0.34] : [0.55, 0.42, 0.32],
  });
  return sink.finish();
}

/**
 * The fish-buying shed (vựa cá) of a Cà Mau landing (kit:mekong/fishery; the judges: "a market hall, not a fish shed: 41
 * spans, no rafters, walls, openings or goods"): a board hall raised on its stilts over the bank, its floor of planks,
 * its walls of upright boards with their gaps over the frame, the wide openings to the landing cut through them, the
 * propped shutters, a sheet roof on its rafters; the landing before it a plank deck on posts with a blue tarpaulin on
 * poles over it, the foam ice boxes stacked, the baskets, the scale; a sampan drawn up at the deck's end. Its house plan
 * breaks the hall; the deck is its own frame.
 */
export function mekongFishShed(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile', bb = ctx.bounds;
  const x0 = bb.minX + 0.2, x1 = bb.maxX - 0.2, z0 = bb.minZ + 0.2, z1 = bb.maxZ - 0.2;
  const deckD = clamp((z1 - z0) * 0.24, 3.0, 4.6);
  const W = clamp(x1 - x0 - 1.0, 7, 12), D = clamp(z1 - z0 - deckD, 9, 14), lift = 0.9;
  const cx = (x0 + x1) / 2, cz = z0 + D / 2;
  const plank = pick(rng, WEATHERED_PLANK), timber = shade(plank, 0.8);
  sink.placed(0, cx, 0, cz, () => {
    // the stilts and the floor, the hall on it
    const nx = Math.max(2, Math.round(W / 2.2) + 1), nz = Math.max(2, Math.round(D / 2.2) + 1);
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      if (i > 0 && i < nx - 1 && k > 0 && k < nz - 1 && (i + k) % 2) continue;
      const x = -W / 2 + 0.15 + (W - 0.3) * i / (nx - 1), z = -D / 2 + 0.15 + (D - 0.3) * k / (nz - 1);
      sink.cylinder('structureWood', [x, -0.45, z], 'y', lift + 0.45, 0.1, 8, { colour: shade(timber, 0.9 + look() * 0.15) }, 0.09);
    }
    sink.dressing(mobile, () => {
      for (const sx of [-1, 1]) for (let k = 0; k + 1 < nz; k++) {
        const za = -D / 2 + 0.15 + (D - 0.3) * k / (nz - 1), zb = -D / 2 + 0.15 + (D - 0.3) * (k + 1) / (nz - 1), x = sx * (W / 2 - 0.15);
        sink.member('structureWood', [x, 0.05, za], [x, lift - 0.15, zb], 0.09, 0.07, [sx, 0, 0], { colour: shade(timber, 0.85), decor: true, exposed: true, fine: true }, 0);
      }
    });
    sink.span('structureWood', -W / 2 - 0.05, lift, -D / 2 - 0.05, W / 2 + 0.05, lift + 0.14, D / 2 + 0.05, { colour: shade(plank, 1.05) });
    const floor = lift + 0.14;
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'gate', u: -W * 0.18, w: 2.6, y0: 0, h: 2.45 },
      { face: 'front', storey: 0, kind: 'gate', u: W * 0.22, w: 2.2, y0: 0, h: 2.45 },
      { face: 'back', storey: 0, kind: 'door', u: W * 0.2, w: 0.95, y0: 0, h: 2.0 },
    ];
    for (const face of ['right', 'left'] as const) for (const o of windowRhythm(face, 0, D, { w: 1.2, h: 0.9, sill: 1.1, spacing: 2.6, margin: 1.2, max: 4 })) openings.push({ ...o, kind: 'loft' });
    const leaf = shade(plank, 0.88);
    const dialect: HouseDialect = {
      // the board shutters hinged at their heads and propped out on their sticks; the wide openings open, their plank
      // leaves folded back against the boards
      window: (s, face, o, y0) => {
        const y = y0 + o.y0, P = (uu: number, yy: number, oo: number) => facePoint(face, uu, yy, oo);
        const swing = 1.0, len = o.h * 0.95, hy = y + o.h + 0.02;
        const along = (t: number): Vec3 => P(o.u, hy - len * t * Math.cos(swing), 0.01 + len * t * Math.sin(swing));
        const nrm: Vec3 = [face.out[0] * Math.cos(swing), Math.sin(swing), face.out[2] * Math.cos(swing)];
        s.member('structureWood', along(0), along(1), o.w, 0.035, nrm, { colour: leaf, decor: true, exposed: true }, 0.0175);
        s.member('structureWood', P(o.u + o.w * 0.3, y, 0.005), along(0.85), 0.03, 0.03, face.u, { colour: shade(leaf, 0.7), decor: true, exposed: true, fine: true }, 0.015);
      },
      door: (s, face, o, y0, frame) => {
        if (o.kind === 'gate') {
          for (const sd of [-1, 1]) faceBox(s, 'structureWood', face, o.u + sd * (o.w / 2 + 0.36), y0 + o.y0 + o.h / 2, 0.03, 0.66, o.h - 0.05, 0.035, { colour: leaf, decor: true });
          return;
        }
        doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf, frame: { bucket: 'structureWood', width: 0.08, out: 0.05, colour: timber }, steps: null, leafKind: 'plank' }, frame.floors[o.storey] + o.y0);
      },
    };
    // the boards over the frame: upright, their gaps, broken round the openings (laid over the house's plank walls after
    // it is built: a plank wall reads and breaks as planks, so its storey is no framed one of the damage kit's)
    // (phoneIdentity: dressing, built and discarded on the phone, so its tints spend the variant stream's draws there too)
    // (Lane C 2026-10-16, phoneIdentity: the phone skipped the boards and their look draws, 76 of the desktop's 302) the
    // phone builds them as dressing it leaves out: the same draws, no geometry
    const boards = (s: PartSink, face: Face, rect: { u0: number; u1: number; y0: number; y1: number }, ops: readonly Opening[]) => s.dressing(mobile, () => {
      const holes = ops.map((o) => [o.u - o.w / 2 - 0.04, o.u + o.w / 2 + 0.04, rect.y0 + o.y0 - 0.04, rect.y0 + o.y0 + o.h + 0.04] as const);
      for (let u = rect.u0 + 0.12; u < rect.u1 - 0.1; u += 0.24) {
        const cut = holes.filter(([a, b]) => u > a - 0.1 && u < b + 0.1);
        let cur = rect.y0 + 0.02;
        for (const [, , a, b] of [...cut.sort((p, q) => p[2] - q[2]), [0, 0, rect.y1, rect.y1] as const]) {
          if (a - cur > 0.15) faceBox(s, 'structureWood', face, u, (cur + a) / 2, 0.012, 0.215, a - cur, 0.024, { colour: shade(plank, 0.84 + look() * 0.26), decor: true, fine: true }, 'caps');
          cur = Math.max(cur, b);
        }
      }
    });
    sink.paint = shade(plank, 0.95);
    try {
      sink.placed(0, 0, floor, 0, () => {
        const frame = buildHouse(sink, {
          w: W, d: D, plinth: null, storeys: [{ h: 3.0, wall: 'structureWood' }], roof: { ...tole(16), eave: 0.6 }, gableBucket: 'structureWood',
          openings, chimneys: [], gutters: null, verge: { colour: timber, bucket: 'structureWood' }, reveal: 0.08, spall: null, rafters: timber,
          roofColour: pick(look, RUSTED),
        }, dialect);
        const faces = storeyFaces(frame, 0), body = frame.bodies[0];
        for (const name of ['front', 'back', 'left', 'right'] as const) {
          const face = faces[name];
          boards(sink, face, { u0: -face.width / 2, u1: face.width / 2, y0: body.y0, y1: body.y1 }, openings.filter((o) => o.face === name && o.storey === 0));
        }
      });
    } finally { sink.paint = null; }
  });
  // the landing before the hall: its deck on posts, the tarpaulin over it, the goods; the sampan at its end
  const dz0 = z0 + D, dz1 = z1, dw = Math.min(W, x1 - x0 - 0.4), floorY = lift + 0.14;
  for (let x = cx - dw / 2 + 0.15; x <= cx + dw / 2 - 0.1; x += (dw - 0.3) / Math.max(1, Math.round((dw - 0.3) / 2.4))) {
    sink.cylinder('structureWood', [x, -0.45, dz1 - 0.2], 'y', floorY - 0.12 + 0.45, 0.09, 8, { colour: shade(timber, 0.85) }, 0.085);
  }
  sink.span('structureWood', cx - dw / 2, floorY - 0.16, dz0, cx + dw / 2, floorY - 0.04, dz1, { colour: shade(plank, 0.95) });
  sink.dressing(mobile, () => {
    for (let x = cx - dw / 2 + 0.01; x < cx + dw / 2 - 0.1; x += 0.24) {
      sink.quad('structureWood', [x, floorY - 0.035, dz1], [x + 0.22, floorY - 0.035, dz1], [x + 0.22, floorY - 0.035, dz0 + 0.02], [x, floorY - 0.035, dz0 + 0.02],
        { colour: shade(plank, 0.86 + look() * 0.24), decor: true, fine: true });
    }
    // the tarpaulin on its poles over the landing, sloping back to the hall's eave
    const yH = floorY + 2.75, yF = floorY + 2.2;
    for (const x of [cx - dw / 2 + 0.4, cx, cx + dw / 2 - 0.4]) sink.cylinder('structureWood', [x, floorY - 0.04, dz1 - 0.3], 'y', yF - floorY + 0.04, 0.04, 6, { colour: timber, decor: true });
    const a: Vec3 = [cx - dw / 2 + 0.3, yH, dz0 + 0.1], b: Vec3 = [cx + dw / 2 - 0.3, yH, dz0 + 0.1], c: Vec3 = [cx + dw / 2 - 0.3, yF, dz1 - 0.3], d: Vec3 = [cx - dw / 2 + 0.3, yF, dz1 - 0.3];
    sink.quad('structureWood', d, c, b, a, { colour: TARP, decor: true });
    const dn = (v: Vec3): Vec3 => [v[0], v[1] - 0.012, v[2]];
    sink.quad('structureWood', dn(a), dn(b), dn(c), dn(d), { colour: shade(TARP, 0.6), decor: true });
    sink.member('structureWood', [cx - dw / 2 + 0.3, yF - 0.02, dz1 - 0.3], [cx + dw / 2 - 0.3, yF - 0.02, dz1 - 0.3], 0.05, 0.05, [0, 1, 0], { colour: timber, decor: true, exposed: true }, 0.025);
    for (let k = 0; k < 9; k++) foamBox(sink, cx - dw / 2 + 0.7 + (k % 3) * 0.66, floorY - 0.04 + Math.floor(k / 3) * 0.36, dz0 + 0.8, look);
    for (let k = 0; k < 5; k++) basket(sink, cx + dw * 0.15 + k * 0.62, floorY - 0.04, dz0 + 1.2 + (k % 2) * 0.5, BASKETS[k % BASKETS.length]);
    // the platform scale
    sink.span('structureMetal', cx - 0.35, floorY - 0.04, dz0 + 1.8, cx + 0.35, floorY + 0.08, dz0 + 2.35, { colour: rgb(0x4a5052), decor: true, fine: true });
    sink.span('structureMetal', cx - 0.03, floorY + 0.08, dz0 + 2.3, cx + 0.03, floorY + 1.05, dz0 + 2.36, { colour: rgb(0x3a3e40), decor: true, fine: true });
    // the sampan drawn up on the bank beside the landing's end
    const room = bb.maxX - (cx + dw / 2);
    if (room > 1.6) boatHull(sink, [cx + dw / 2 + room / 2, 0.02, dz1 - 2.0], 0.04, { length: Math.min(5.2, dz1 - dz0 + 1.5), beam: Math.min(1.35, room - 0.2), depth: 0.5, sheer: 0.34,
      stern: 'double', flat: 0.45, colour: rgb(0x5a6a7a), inside: rgb(0x8a6a48), gunwale: rgb(0xb8452e), thwarts: 2, hood: null }, { heel: 0.12 });
  });
  return sink.finish();
}

// ------------------------------------------------------------------------------------------------ Dalmatia

/** The kit's joinery a builder here takes from its kit's call: the state its dialect dresses with. */
export interface KitJoinery<S> { st: S; dialect: (st: S) => HouseDialect }

/**
 * The boathouse of a Dalmatian bay (kit:dalmatian/boatshed; the judges: "a flat-headed gateUnit under nine faceBoxes
 * spaced in the air on a half-ellipse, plinth null, one window a side"): rubble limestone on a plinth sunk into the
 * shore, dressed quoins at its corners, the round-arched water door cut through the gable (its voussoirs course to
 * course on the arch, the keystone), the plank leaves hung in it to the springing and the lunette over them slatted;
 * slit vents down both long walls with their lintels and sills, a door and a loft hatch at the back; the stone eave
 * course under the canal tiles; the slip of dressed stone down to the water with its runners and the gajeta on it.
 */
export function dalmatianBoathouse<S extends { door: Rgb; window: WindowStyle; litShare: number; rng: () => number }>(
  ctx: RegionalBuildContext, kit: KitJoinery<S>): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant, mobile = ctx.tier === 'mobile', bb = ctx.bounds;
  const W = clamp(ctx.info.w - 3.2, 5.6, 8.4), D = clamp(ctx.info.d - 2.7, 8, 12.5);
  const plinth = 0.3, wallH = 3.8, gw = Math.min(3.0, W - 2.0), r = gw / 2, spring = 2.2;
  const openings: Opening[] = [
    { face: 'front', storey: 0, kind: 'gate', u: 0, w: gw, y0: 0, h: spring, arch: { spring } },
    { face: 'back', storey: 0, kind: 'door', u: (look() - 0.5) * (W - 2.6), w: 0.95, y0: 0, h: 2.0 },
  ];
  for (const face of ['right', 'left'] as const) for (const t of [-0.3, 0, 0.3]) openings.push({ face, storey: 0, kind: 'loft', u: t * D, w: 0.18, y0: 1.5, h: 0.75 });
  const base = kit.dialect({ ...kit.st, litShare: 0 });
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: plinth, out: 0.06, bucket: 'stone' }, storeys: [{ h: wallH, wall: 'stone' }],
    roof: { kind: 'gable', pitchDeg: 22, eave: 0.2, verge: 0.08, thickness: 0.15, bucket: 'roof', ridge: 'round' }, gableBucket: 'stone',
    openings, chimneys: [], gutters: null, verge: null, reveal: 0.42,
  }, {
    ...base,
    window: (s, face, o, y0) => {
      // a slit: its lintel and sill, the dark of the store behind
      faceBox(s, 'stone', face, o.u, y0 + o.y0 + o.h + 0.08, 0.03, o.w + 0.36, 0.16, 0.06, { decor: true });
      faceBox(s, 'stone', face, o.u, y0 + o.y0 - 0.05, 0.05, o.w + 0.28, 0.1, 0.1, { decor: true });
    },
    door: (s, face, o, y0, fr) => {
      if (o.kind !== 'gate') { base.door(s, face, o, y0, fr); return; }
      // the water door's plank leaves to the springing (no wicket: a boat door), the lunette over them slatted
      const leaf = shade(kit.st.door, 0.9), go = s.recess > 0 ? -s.recess + 0.03 : 0.015, y = y0 + o.y0;
      for (const side of [-1, 1]) {
        const cu = o.u + side * o.w / 4, hw = o.w / 2 - 0.02;
        for (let k = 0, nb = Math.max(4, Math.round(hw / 0.17)); k < nb; k++) {
          const bu = cu - hw / 2 + (k + 0.5) * hw / nb;
          faceBox(s, 'structureWood', face, bu, y + o.h / 2, go + (k % 2) * 0.004, hw / nb - 0.004, o.h - 0.02, 0.04, { colour: shade(leaf, 0.88 + look() * 0.2), decor: true });
        }
        for (const t of [0.15, 0.85]) faceBox(s, 'structureWood', face, cu, y + o.h * t, go + 0.035, hw - 0.1, 0.13, 0.03, { colour: shade(leaf, 0.82), decor: true, fine: true });
        for (const t of [0.15, 0.85]) faceBox(s, 'structureMetal', face, cu + side * (hw / 2 - 0.3), y + o.h * t + 0.09, go + 0.04, 0.55, 0.045, 0.01, { colour: IRON, decor: true, fine: true });
      }
      // the lunette: upright slats set back in the head, the dark behind them (holedFace's)
      const sp = y + o.h;
      for (let u = -r + 0.12; u < r - 0.08; u += 0.16) {
        const top = sp + Math.sqrt(Math.max(0, r * r - u * u)) - 0.05;
        if (top - sp > 0.1) faceBox(s, 'structureWood', face, o.u + u, (sp + top) / 2, go + 0.01, 0.07, top - sp, 0.03, { colour: shade(leaf, 0.75), decor: true });
      }
      faceBox(s, 'structureWood', face, o.u, sp + 0.04, go + 0.02, o.w, 0.09, 0.05, { colour: shade(leaf, 0.7), decor: true });
    },
    gableOpenings: (face) => (face.out[2] < 0 ? [{ u0: -0.35, u1: 0.35, y0: plinth + wallH + 0.25, y1: plinth + wallH + 0.95 }] : []),
  });
  const f = frame.faces.front;
  // the arch's voussoirs and keystone, the springers' imposts
  archHead(sink, f, 0, plinth + spring, r, 'stone', 0.26, 11);
  faceBox(sink, 'stone', f, 0, plinth + spring + r + 0.13, 0.05, 0.36, 0.44, 0.1, { decor: true, tint: [1.06, 1.04, 1.0] });
  for (const s of [-1, 1]) faceBox(sink, 'stone', f, s * (r + 0.2), plinth + spring + 0.04, 0.04, 0.5, 0.12, 0.08, { decor: true });
  // the eave course under both eaves; the dressed quoins
  const b = frame.bodies[0];
  for (const s of [-1, 1]) {
    const x = s > 0 ? b.x1 : b.x0;
    sink.span('stone', Math.min(x, x + s * 0.2), frame.eaveY - 0.16, b.z0 - 0.06, Math.max(x, x + s * 0.2), frame.eaveY, b.z1 + 0.06);
  }
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
    const x = sx > 0 ? b.x1 : b.x0, z = sz > 0 ? b.z1 : b.z0;
    for (let y = plinth + 0.05, k = 0; y < frame.eaveY - 0.4; y += 0.38, k++) {
      const lx = k % 2 ? 0.28 : 0.52, lz = k % 2 ? 0.52 : 0.28;
      dressedQuoin(sink, 'stone', sx > 0 ? x - lx : x - 0.03, y, sz > 0 ? z - lz : z - 0.03, sx > 0 ? x + 0.03 : x + lx, y + 0.36, sz > 0 ? z + 0.03 : z + lz, sx, sz, { decor: true });
    }
  }
  // the back gable's loft hatch: its plank leaf in the reveal, its sill
  const bf = frame.faces.back;
  sink.recess = frame.gableReveal;
  try {
    doorUnit(sink, bf, 0, plinth + wallH + 0.25, 0.7, 0.7, { leaf: shade(kit.st.door, 0.8), frame: { bucket: 'stone', width: 0.1, out: 0.05 }, steps: null, leafKind: 'plank' });
  } finally { sink.recess = 0; }
  faceBox(sink, 'stone', bf, 0, plinth + wallH + 0.19, 0.05, 0.9, 0.1, 0.12, { decor: true });
  // the slip down from the doors to the plot's water edge, the gajeta on it, a bollard at its foot
  const z0 = D / 2 + 0.05, z1 = Math.max(z0 + 0.8, bb.maxZ - 0.1), sw = gw + 0.3;
  slipway(sink, 0, sw, z0, z1, plinth, -0.3, rgb(0x5a4a3a), { mobile });
  sink.dressing(mobile, () => {
    bollard(sink, sw / 2 + 0.2, -0.1, z1 - 0.3, 'granite', [0.8, 0.78, 0.72]);
    const room = bb.maxX - W / 2;
    if (room > 1.9) {
      // the gajeta drawn up on the shingle beside the house, heeled on its bilge, its oars against the wall
      const len = Math.min(6.0, D * 0.6), bx = W / 2 + Math.min(room / 2, 1.5);
      boatHull(sink, [bx, 0.05, -D * 0.1], -Math.PI / 2, { length: len, beam: Math.min(1.8, room - 0.3), depth: 0.6, sheer: 0.3, stern: 'double', flat: 0.25,
        colour: pick(look, [rgb(0xe8e4d8), rgb(0x3a6a8a), rgb(0x4a7a5a)]), inside: rgb(0x9a7a56), gunwale: pick(look, [rgb(0xb8452e), rgb(0x2e4a6a), rgb(0x3a3a3a)]), thwarts: 3 },
      { heel: 0.18 });
      for (const k of [0, 1]) leantPole(sink, frame.faces.right, D * 0.32 + k * 0.22, 0.45 + k * 0.06, 3.0, 0.3, shade(rgb(0x8a7258), 0.95 + k * 0.1), true);
    }
  });
  return sink.finish();
}

// ------------------------------------------------------------------------------------------------ Zeeland

/**
 * The pakhuis of the Scheldt fish trade (kit:polder/fishery; the judges: "every opening on one long face, the docstring's
 * loading doors and hoist beam never drawn, three faces blank brick, 8 m of a 17 m plot"): a brick warehouse of two
 * storeys and its loft under pantiles, its loading doors stacked up the street gable (+z) under the hoist beam with its
 * wheel and block and the fall to the street, each door's plank leaves in its reveal under a segmental arch; windows down
 * both long walls, the gates to the yard on the +x side, the back gable's windows and door; the yard beside it paved in
 * brick, the fish crates and mussel baskets stacked, a handcart, the cast-iron bollard at the quay's edge.
 */
export function polderPakhuis<S extends { door: Rgb; green: Rgb; window: WindowStyle; litShare: number; rng: () => number }>(
  ctx: RegionalBuildContext, kit: KitJoinery<S>): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant, mobile = ctx.tier === 'mobile', bb = ctx.bounds;
  const W = clamp(ctx.info.w - 7.5, 7, 9), D = clamp(bb.maxZ - bb.minZ - 4.0, 12, 16);
  const cx = bb.minX + 0.2 + W / 2, cz = bb.minZ + 0.3 + D / 2;
  const st = kit.st, white: Rgb = rgb(0xd6d2c8);
  const openings: Opening[] = [
    // the street gable's loading doors, one a floor, up its middle (the loft's in the gable, cut below)
    { face: 'front', storey: 0, kind: 'door', u: 0, w: 1.5, y0: 0, h: 2.5 },
    { face: 'front', storey: 1, kind: 'door', u: 0, w: 1.3, y0: 0.25, h: 1.9 },
    { face: 'back', storey: 0, kind: 'door', u: W * 0.25, w: 0.95, y0: 0, h: 2.1 },
  ];
  for (const s of [0, 1]) for (const u of [-W * 0.32, W * 0.32]) openings.push({ face: 'front', storey: s, kind: 'window', u, w: 0.85, y0: s ? 0.6 : 1.0, h: 1.2 });
  const gates = [-D * 0.18, D * 0.24];
  for (const u of gates) openings.push({ face: 'right', storey: 0, kind: 'gate', u, w: 2.2, y0: 0, h: 2.6 });
  for (const o of windowRhythm('right', 0, D, { w: 0.9, h: 1.2, sill: 1.0, spacing: 2.6, margin: 1.2, avoid: gates.map((g) => [g - 1.6, g + 1.6] as const), max: 4 })) openings.push(o);
  for (const o of windowRhythm('right', 1, D, { w: 0.9, h: 1.1, sill: 0.6, spacing: 2.6, margin: 1.2, max: 5 })) openings.push({ ...o, kind: 'loft' });
  for (const s of [0, 1]) for (const o of windowRhythm('left', s, D, { w: 0.85, h: 1.1, sill: s ? 0.6 : 1.1, spacing: 3.0, margin: 1.4, max: 4 })) openings.push(s ? { ...o, kind: 'loft' } : o);
  for (const u of [-W * 0.25]) openings.push({ face: 'back', storey: 0, kind: 'window', u, w: 0.85, y0: 1.0, h: 1.2 });
  openings.push({ face: 'back', storey: 1, kind: 'loft', u: 0, w: 0.85, y0: 0.6, h: 1.1 });
  const base = kit.dialect({ ...st, litShare: 0.1 });
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 48, eave: 0.3, verge: 0.12, thickness: 0.13, bucket: 'roof', ridge: 'round' };
  sink.placed(0, cx, 0, cz, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.35, out: 0.04, bucket: 'stone' }, storeys: [{ h: 3.4, wall: 'stone' }, { h: 2.8, wall: 'stone' }],
      roof, gableBucket: 'stone', openings, chimneys: [], gutters: { colour: rgb(0x7d8183) }, verge: { colour: white, bucket: 'structureWood' }, reveal: 0.22,
    }, {
      ...base,
      door: (s, face, o, y0, fr) => {
        if (o.kind === 'gate' || o.face !== 'front') { base.door(s, face, o, y0, fr); return; }
        // a loading door: two ledged plank leaves in the reveal, white-framed, under its segmental arch
        doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: st.green, frame: { bucket: 'structureWood', width: 0.1, out: 0.06, colour: white }, steps: null, leafKind: 'plank' },
          fr.floors[o.storey] + o.y0);
        faceBox(s, 'stone', face, o.u, y0 + o.y0 + o.h + 0.12, 0.03, o.w + 0.3, 0.22, 0.06, { decor: true });
      },
      // the loft's loading door cut through the street gable under the hoist beam
      gableOpenings: (face) => (face.out[2] > 0 ? [{ u0: -0.55, u1: 0.55, y0: 3.75 + 2.8 + 0.3, y1: 3.75 + 2.8 + 1.85 }] : []),
    });
    const f = frame.faces.front, ey = frame.eaveY;
    sink.recess = frame.gableReveal;
    try {
      doorUnit(sink, f, 0, ey + 0.3, 1.1, 1.55, { leaf: st.green, frame: { bucket: 'structureWood', width: 0.1, out: 0.06, colour: white }, steps: null, leafKind: 'plank' });
    } finally { sink.recess = 0; }
    faceBox(sink, 'stone', f, 0, ey + 1.97, 0.03, 1.4, 0.22, 0.06, { decor: true });
    // the hoist beam out of the apex: its wheel, its block and the fall down to the street door
    const hb = ey + 2.55;
    faceBox(sink, 'structureWood', f, 0, hb, 0.6, 0.22, 0.24, 1.2, { colour: rgb(0x4a3e32), decor: true, shadow: true });
    sink.dressing(mobile, () => {
      const wheel = facePoint(f, 0, hb + 0.05, 0.25);
      sink.cylinder('structureWood', [wheel[0] - 0.12, wheel[1], wheel[2]], 'x', 0.24, 0.42, 12, { colour: rgb(0x5a4a38), decor: true });
      faceBox(sink, 'structureMetal', f, 0, hb - 0.26, 1.08, 0.14, 0.26, 0.14, { colour: IRON, decor: true });
      faceBox(sink, 'structureMetal', f, 0, (hb - 0.39 + 2.9) / 2, 1.08, 0.022, hb - 0.39 - 2.9, 0.022, { colour: rgb(0x6a5e4c), decor: true, fine: true });
      faceBox(sink, 'structureMetal', f, 0, 2.84, 1.08, 0.07, 0.12, 0.05, { colour: IRON, decor: true, fine: true });
    });
    // the gable's ridge stack at the back
    const rg = frame.roof;
    sink.span('stone', -0.4, rg.ridgeY - 1.2, -D / 2 + 0.05, 0.4, rg.ridgeTopY + 0.9, -D / 2 + 0.6);
    sink.span('stone', -0.48, rg.ridgeTopY + 0.9, -D / 2 - 0.03, 0.48, rg.ridgeTopY + 1.02, -D / 2 + 0.68, { decor: true });
  });
  // the yard beside it, paved in brick to the plot's +x edge; the crates, the baskets, the handcart, the bollard
  const yx0 = cx + W / 2 + 0.05, yx1 = bb.maxX - 0.2;
  if (yx1 - yx0 > 1.5) {
    sink.span('stone', yx0, -0.3, bb.minZ + 0.3, yx1, 0.08, bb.maxZ - 0.3, { tint: [0.84, 0.8, 0.76] });
    sink.dressing(mobile, () => {
      const crate = rgb(0x9a8466), ym = (yx0 + yx1) / 2;
      for (let k = 0; k < 8; k++) {
        const x = yx0 + 0.5 + (k % 4) * 0.62, y = 0.08 + Math.floor(k / 4) * 0.3, z = cz + D * 0.05;
        for (let sl = 0; sl < 3; sl++) sink.span('structureWood', x - 0.28, y + 0.02 + sl * 0.09, z - 0.2, x + 0.28, y + 0.08 + sl * 0.09, z + 0.2, { colour: shade(crate, 0.8 + sl * 0.07 + look() * 0.1), decor: true });
        for (const dx of [-1, 1]) sink.span('structureWood', x + dx * 0.27 - 0.02, y, z - 0.2, x + dx * 0.27 + 0.02, y + 0.28, z + 0.2, { colour: shade(crate, 0.7), decor: true });
      }
      for (let k = 0; k < 4; k++) sink.cylinder('structureWood', [ym + (k - 1.5) * 0.6, 0.08, cz - D * 0.25], 'y', 0.42, 0.24, 9, { colour: shade(rgb(0x8a7550), 0.9 + look() * 0.2), decor: true }, 0.3);
      // the handcart: its bed, its two wheels, its shafts down to the ground
      const hx = ym, hz = cz + D * 0.32;
      sink.span('structureWood', hx - 0.55, 0.62, hz - 0.8, hx + 0.55, 0.68, hz + 0.8, { colour: shade(rgb(0x6a5a48), 1.05), decor: true });
      for (const s of [-1, 1]) {
        sink.cylinder('structureWood', [hx + s * 0.62 - (s < 0 ? 0.06 : 0), 0.45, hz], 'x', 0.06, 0.45, 12, { colour: rgb(0x3a3430), decor: true }); // (a negative length turned the left wheel inside out)
        sink.member('structureWood', [hx + s * 0.45, 0.65, hz + 0.7], [hx + s * 0.4, 0.08, hz + 1.9], 0.06, 0.06, [1, 0, 0], { colour: rgb(0x5a4a38), decor: true, exposed: true }, 0);
      }
      bollard(sink, yx1 - 0.4, 0.08, bb.maxZ - 0.7, 'iron', rgb(0x2a2c2d));
    });
  }
  return sink.finish();
}

