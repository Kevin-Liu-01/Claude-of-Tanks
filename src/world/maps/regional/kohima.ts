// src/world/maps/regional/kohima.ts — the Naga Hills kit (Monsoon Ridge: Kohima, April–June 1944). The hill station's
// colonial bungalows of whitewashed timber and plaster on stone plinths under corrugated iron painted red or green, with
// deep verandas; the bazaar's timber shops under sheet roofs; the mission church of rough stone under a red tin roof;
// Angami Naga houses with low plank walls and great thatched roofs that sweep near the ground, crossed gable horns over
// the front; bamboo granaries on posts; and the battle's shells — bungalows broken to their plinths and chimneys.
import { PartSink, alongPlot, faceBox, facePoint, facePoint as facePointOn, pick, plotAxes, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import {
  buildHouse, closeGables, emitRoof, holedBox, holedPolygon, type HouseFrame, recordBody, recordShaft, roofCrown, roofGeometry, storeyFaces, windowRhythm, type HouseDialect, type Opening, type RoofSpec,
  type WallRect,
} from './house.ts';
import { doorUnit, freeBox, openShop, windowUnit, type WindowStyle } from './openings.ts';
import { openShed } from './outbuildings.ts';
import { BAMBOO_MAT, WEATHERED_PLANK, boardWall, veranda } from './vernacular.ts';
import { boardCladding } from './villageCraft.ts';
import { ruinHouse, type RuinHead } from './ruinGrammar.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import { kohimaBazaarRow, kohimaStall } from './marketKits.ts'; // props #23: the bazaar's stall and booths
import { tinCovering } from './navajoR2.ts'; // (dome-detail-275) the corrugated covering in relief
import { archGlazing, archHead } from './sarajevoParts.ts';
import { finialOn } from './domes.ts';
import { orientedPrism } from './millWorks.ts';

const TIN: readonly Rgb[] = [0x8a3a2e, 0x7a3428, 0x4f6a4a, 0x5a7a52].map(rgb);
const WHITE = rgb(0xd4cfc2), GREEN_TRIM = rgb(0x3f5f46);

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/** A planar polygon wound so its normal looks toward `toward` (dome-detail-275). */
function facing(sink: PartSink, bucket: RegionalBucket, pts: Vec3[], toward: Vec3, opts: EmitOptions): void {
  if (pts.length < 3) return;
  const [a, b, c] = pts;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  sink.polygon(bucket, n[0] * toward[0] + n[1] * toward[1] + n[2] * toward[2] >= 0 ? pts : [...pts].reverse(), opts);
}

/** A stone course along a face (dome-detail-275), `out` proud and round its corners, broken where `gaps` (u ranges) stand. */
function course(sink: PartSink, f: Face, y0: number, y1: number, out: number, gaps: ReadonlyArray<readonly [number, number]>, tone: number): void {
  let u = -f.width / 2 - out;
  for (const [g0, g1] of [...gaps, [f.width / 2 + out, f.width / 2 + out] as const]) {
    if (g0 - u > 0.05) faceBox(sink, 'stone', f, (u + g0) / 2, (y0 + y1) / 2, out / 2, g0 - u, y1 - y0, out + 0.01, { decor: true, shade: tone, fineSides: true });
    u = g1;
  }
}

const tin = (pitch: number, kind: RoofSpec['kind'] = 'gable'): RoofSpec => ({ kind, pitchDeg: pitch, eave: 0.6, verge: 0.6, thickness: 0.06, bucket: 'structureMetal', ridge: 'saddle' });

/** The bungalow: whitewash on a stone plinth, a hipped tin roof, a veranda on two sides, a stack. */
const bungalow: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the body set back from the plot's +z and -x sides by its two verandas' depth, so the verandas stay inside the plot
  const V = 2.2, W = Math.max(6, Math.min(11, ctx.info.w - 0.6 - V)), D = Math.max(7, Math.min(13, ctx.info.d - 0.6 - V));
  const roofColour = pick(rng, TIN);
  const style: WindowStyle = { frame: GREEN_TRIM, frameWidth: 0.07, frameOut: 0.05, bars: 'six', surround: null, sill: { bucket: 'plaster', out: 0.06 }, shutters: { colour: GREEN_TRIM, kind: 'louvred', closed: 0.2 } };
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.3, y0: 0, h: 2.4 }];
  for (const face of ['front', 'left', 'right', 'back'] as const) {
    for (const o of windowRhythm(face, 0, face === 'front' || face === 'back' ? W : D, { w: 1.0, h: 1.5, sill: 0.8, spacing: 2.4, margin: 1.0, avoid: face === 'front' ? [[-1.0, 1.0]] : [] })) openings.push(o);
  }
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, style, rng, 0.45),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: GREEN_TRIM, frame: { bucket: 'structureWood', width: 0.1, out: 0.05, colour: WHITE }, transom: true, steps: { bucket: 'stone' }, leafKind: 'glazed' }, y0 + o.y0),
  };
  sink.placed(0, V / 2, 0, -V / 2, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.75, out: 0.1, bucket: 'stone' }, storeys: [{ h: 3.3, wall: 'plaster' }],
      roof: tin(28, 'hip'), roofColour, gableBucket: 'plaster', openings,
      chimneys: [{ x: -W * 0.25, z: -D * 0.2, sx: 0.65, sz: 0.65, above: 0.9, bucket: 'stone', cap: 'slab' }], gutters: null, verge: null,
      // Assam-type walls: lime plaster on split-bamboo ekra between timber posts, no masonry under it to show
      spall: null,
    }, dialect);
    // (props census #15, Lane C 2026-10-16: "the two verandas simply overlap at the corner") the front veranda runs on
    // over the corner to the side one's outer line, the side one stops short of it: one deck round the corner, the
    // front's lean-to over it
    const f = frame.faces.front, l = frame.faces.left;
    veranda(sink, { ...f, origin: [f.origin[0] - V / 2, f.origin[1], f.origin[2]], width: W + V }, 0.75, frame.eaveY - 0.2, W + V, V, WHITE, { bucket: 'structureMetal', colour: roofColour });
    veranda(sink, { ...l, origin: [l.origin[0], l.origin[1], l.origin[2] - 0.15], width: D - 0.3 }, 0.75, frame.eaveY - 0.2, D - 0.3, V, WHITE, { bucket: 'structureMetal', colour: roofColour });
    // (the integrity check, 2026-10-16: the plinth seen 1 m in under the raised decks, the sky along the open verandas end
    // on) each deck skirted down to the ground in white boards, its open ends hung with split-bamboo chiks from the
    // lean-to down to the rail, as the bungalows kept the sun off theirs
    const wallTop = frame.eaveY - 0.2, rise = Math.max(0.25, wallTop - 0.75 - 2.1), chik: Rgb = [0.72, 0.62, 0.42];
    const runs: Array<[Face, number, readonly number[]]> = [
      [{ ...f, origin: [f.origin[0] - V / 2, f.origin[1], f.origin[2]], width: W + V }, W + V, [-1, 1]],
      [{ ...l, origin: [l.origin[0], l.origin[1], l.origin[2] - 0.15], width: D - 0.3 }, D - 0.3, [-1, 1]],
    ];
    for (const [vf, width, ends] of runs) {
      faceBox(sink, 'structureWood', vf, 0, 0.31, V - 0.045, width - 0.02, 0.82, 0.03, { colour: shade(WHITE, 0.92) });
      for (const sg of ends) {
        const out: Vec3 = [vf.u[0] * sg, 0, vf.u[2] * sg];
        const ef: Face = { origin: facePoint(vf, sg * width / 2, 0, V / 2), u: [out[2], 0, -out[0]], out, width: V };
        // (the end face's u runs from the wall out, or back: its sign read off the veranda's out)
        const ds = ef.u[0] * vf.out[0] + ef.u[2] * vf.out[2] > 0 ? 1 : -1;
        faceBox(sink, 'structureWood', ef, 0, 0.31, -0.03, V - 0.08, 0.82, 0.03, { colour: shade(WHITE, 0.92) });
        // (the kit connectivity, 2026-10-16: the chik stopped 3 cm short of the end post and hung free) it runs from the
        // wall out to the end post's face, hung on it
        const top = (o: number) => wallTop - rise * o / (V - 0.1) - 0.14, o0 = 0.08, o1 = V - 0.165, yb = 0.75 + 0.95;
        const P = (o: number, y: number): Vec3 => facePoint(ef, ds * (o - V / 2), y, -0.07);
        const pts = ds > 0 ? [P(o0, yb), P(o1, yb), P(o1, top(o1)), P(o0, top(o0))] : [P(o1, yb), P(o0, yb), P(o0, top(o0)), P(o1, top(o1))];
        sink.prism('structureWood', pts, out, 0.015, { colour: chik, decor: true });
      }
    }
  });
  return sink.finish();
};

/** A board wall's runs on a face, broken at its openings (each [u0, u1] cleared by 5 cm). */
function boardRuns(sink: PartSink, face: Face, y0: number, y1: number, colour: Rgb, gaps: ReadonlyArray<readonly [number, number]>): void {
  let u = -face.width / 2 + 0.05;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g0 - 0.05 > u + 0.2) boardWall(sink, face, u, g0 - 0.05, y0, y1, colour);
    u = Math.max(u, g1 + 0.05);
  }
  if (face.width / 2 - 0.05 > u + 0.2) boardWall(sink, face, u, face.width / 2 - 0.05, y0, y1, colour);
}

/**
 * One shop: a Kohima bazaar shop of 1944 (props census #29, lane B 2026-10-15; the judges: "a plank-print box with a painted
 * dark opening and a flat board", the owner's counter-example). A timber frame on stone pads: the sole plates on the
 * pads, posts at the corners and the jambs, the wall plate round their heads, braces in the corners; board walls between
 * them (each board panel cut by its openings, its inside a room: house.ts holedPolygon with backs); the raised plank floor.
 * Its front open as the shop (openings.ts openShop: the counter, the shelves and their goods behind it, the shutter
 * boards hinged up from the head and propped on two poles as the awning, `awning` deep); a back door and a shuttered side
 * window; the tin roof on its gable ends with the rafter feet under the eaves; a signboard over the front, sacks and
 * baskets out before it. The shop is a house body for the damage (recordBody).
 * (dome-detail-275; the work list: a dark plank box under a plain sheet) Half the bazaar's shops walled Assam-type, the
 * lime-washed ekra panels between the dark frame with a rail at the sill and the splash of the monsoon's mud along
 * their foot; the tin in relief with its laps and its replaced sheets; the gables' bargeboards and the louvred vent in
 * the front's; the plank walk before the shop at its floor on its stone pads, the awning's poles on it, a step down; the
 * firewood stacked under the side eave; the water drum at the back; a tin advertisement on the side.
 */
function shop(sink: PartSink, ctx: RegionalBuildContext, x: number, z: number, W: number, D: number, walk: number): void {
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  const plank = pick(rng, WEATHERED_PLANK), roofColour = pick(rng, TIN), frameC = shade(plank, 0.62);
  const F = 0.45, H = 2.75, t = 0.06, top = F + H;
  const front = W - 1.2, shopH = 2.2, doorU = W * 0.2;
  // (dome-detail-275) the walls Assam-type (lime on ekra between the frame) or boarded, and the front's frame painted
  const ekra = look() < 0.55, lime = shade(WHITE, 0.94 + look() * 0.08), trim = look() < 0.5 ? shade(pick(look, SIGNS), 0.85) : frameC;
  sink.placed(0, x, 0, z, () => {
    const timber = { colour: frameC };
    // the stone pads, the sole plates on them, the raised plank floor
    const nx = Math.max(2, Math.round(W / 2.0) + 1), nz = Math.max(2, Math.round(D / 2.0) + 1);
    const posts: Array<[number, number]> = [];
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      if (i > 0 && i < nx - 1 && k > 0 && k < nz - 1) continue;
      posts.push([-W / 2 + 0.07 + (W - 0.14) * i / (nx - 1), -D / 2 + 0.07 + (D - 0.14) * k / (nz - 1)]);
    }
    for (const [px, pz] of posts) sink.span('stone', px - 0.2, -0.3, pz - 0.2, px + 0.2, 0.2, pz + 0.2);
    sink.span('structureWood', -W / 2, 0.2, -D / 2, W / 2, F - 0.08, -D / 2 + 0.14, timber);
    sink.span('structureWood', -W / 2, 0.2, D / 2 - 0.14, W / 2, F - 0.08, D / 2, timber);
    sink.span('structureWood', -W / 2, 0.2, -D / 2 + 0.14, -W / 2 + 0.14, F - 0.08, D / 2 - 0.14, timber);
    sink.span('structureWood', W / 2 - 0.14, 0.2, -D / 2 + 0.14, W / 2, F - 0.08, D / 2 - 0.14, timber);
    sink.span('structureWood', -W / 2 + 0.14, F - 0.08, -D / 2 + 0.14, W / 2 - 0.14, F, D / 2 - 0.14, { colour: shade(plank, 0.8) });
    // the board walls, each cut by its openings, their insides the shop's
    const faces = {
      front: { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W } as Face,
      right: { origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D } as Face,
      back: { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W } as Face,
      left: { origin: [-W / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D } as Face,
    };
    const winU = (look() - 0.5) * (D - 2.4);
    const holes = {
      front: [{ u0: -front / 2, u1: front / 2, y0: F, y1: F + shopH }],
      back: [{ u0: doorU - 0.43, u1: doorU + 0.43, y0: F, y1: F + 2.0 }],
      right: [{ u0: winU - 0.4, u1: winU + 0.4, y0: F + 0.95, y1: F + 1.75 }],
      left: [] as Array<{ u0: number; u1: number; y0: number; y1: number }>,
    };
    const wallC = { colour: ekra ? lime : shade(plank, 0.9) };
    for (const name of ['front', 'right', 'back', 'left'] as const) {
      const f = faces[name], half = f.width / 2 - (name === 'right' || name === 'left' ? t : 0);
      holedPolygon(sink, 'structureWood', f, [[-half, F], [half, F], [half, top], [-half, top]], holes[name], t, 0, wallC, [], [], true);
    }
    // the frame over the boards: the posts at the corners and the jambs, the wall plate, the braces in the corners
    const fr = { colour: frameC, decor: true, fineSides: true } as const;
    for (const name of ['front', 'right', 'back', 'left'] as const) {
      const f = faces[name], half = f.width / 2;
      const at = [-half + 0.07, half - 0.07, ...holes[name].flatMap((h) => [h.u0 - 0.06, h.u1 + 0.06])];
      const fc = name === 'front' ? { ...fr, colour: trim } : fr;
      for (const u of at) faceBox(sink, 'structureWood', f, u, (F + top) / 2, 0.04, 0.12, H, 0.08, fc, 'caps');
      faceBox(sink, 'structureWood', f, 0, top - 0.07, 0.045, f.width, 0.14, 0.09, fc, 'ends');
      if (!mobile && name !== 'front') for (const s of [-1, 1]) {
        const a = facePoint(f, s * (half - 0.13), F + 0.15, 0.03), b = facePoint(f, s * (half - 0.95), top - 0.2, 0.03);
        sink.member('structureWood', a, b, 0.09, 0.05, f.out, { colour: frameC, decor: true }, 0);
      }
    }
    if (ekra) {
      // (dome-detail-275) the ekra's rail at the sill between the posts, the mud splashed up the lime along the foot
      for (const name of ['right', 'back', 'left'] as const) {
        const f = faces[name], gaps = holes[name].filter((h) => h.y0 < F + 1.0).map((h) => [h.u0 - 0.06, h.u1 + 0.06] as const);
        let u = -f.width / 2 + 0.13;
        for (const [g0, g1] of [...gaps, [f.width / 2 - 0.13, f.width / 2] as const]) {
          if (g0 - u > 0.2) faceBox(sink, 'structureWood', f, (u + g0) / 2, F + 0.9, 0.03, g0 - u, 0.1, 0.06, { colour: frameC, decor: true, fineSides: true }, 'ends');
          u = g1;
        }
        faceBox(sink, 'structureWood', f, 0, F + 0.2, 0.006, f.width - 0.04, 0.4, 0.012, { colour: shade(lime, 0.62), decor: true });
      }
    } else if (!mobile) {
      boardRuns(sink, faces.back, F + 0.05, top - 0.15, plank, [[doorU - 0.55, doorU + 0.55]]);
      boardRuns(sink, faces.left, F + 0.05, top - 0.15, plank, []);
      boardRuns(sink, faces.right, F + 0.05, top - 0.15, plank, [[winU - 0.5, winU + 0.5]]); // (dome-detail-275)
    }
    // the tin roof on its closed gables, the rafter feet under the eaves
    const roof = tin(26), rg = roofGeometry(W, D, top, roof);
    emitRoof(sink, rg, roof, roofColour);
    // (dome-detail-275) the tin in relief: its laps, three sheets replaced
    tinCovering(sink, rg, roof, null, look, 3, roofColour);
    // (dome-detail-275) the bargeboards up both gables' verges; the louvred vent in the front gable, the loft dark behind
    {
      const zV = D / 2 + roof.verge - 0.03, xE = W / 2 + roof.eave - 0.02, cosP = Math.cos(26 * Math.PI / 180);
      const under = (xx: number) => (rg.topAt(xx, 0) ?? top) - roof.thickness / cosP;
      for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
        sink.member('structureWood', [sx * xE, under(xE) - 0.09, sz * zV], [0, under(0) - 0.09, sz * zV], 0.2, 0.04, [0, 0, sz], { colour: shade(trim, 1.05), decor: true, exposed: true }, 0);
      }
      const vy = top + (rg.ridgeY - top) * 0.42, f = faces.front;
      faceBox(sink, 'dark', f, 0, vy, 0.01, 0.7, 0.38, 0.02, { decor: true });
      for (let k = 0; k < 3; k++) faceBox(sink, 'structureWood', f, 0, vy - 0.12 + k * 0.12, 0.04, 0.7, 0.06, 0.03, { colour: shade(plank, 0.95), decor: true, fineSides: true });
      faceBox(sink, 'structureWood', f, 0, vy, 0.03, 0.84, 0.5, 0.02, { colour: shade(trim, 0.9), decor: true, fineSides: true });
    }
    // (the building-detail triage, 2026-10-16: the shop's rebuild passed no chimneys and lost it) the tea shop's hearth: its
    // brick stack up through the tin at the back, its slab cap
    {
      const sx = W * 0.28, sz = -D * 0.22, at = rg.topAt(sx, sz) ?? rg.ridgeTopY, s0 = 0.21;
      sink.span('stone', sx - s0, at - 0.45, sz - s0, sx + s0, at + 0.7, sz + s0, { tint: [0.78, 0.5, 0.42] });
      sink.span('stone', sx - s0 - 0.07, at + 0.7, sz - s0 - 0.07, sx + s0 + 0.07, at + 0.78, sz + s0 + 0.07, { tint: [0.86, 0.84, 0.8] });
    }
    closeGables(sink, rg, 'structureWood', { colour: ekra ? shade(lime, 0.92) : shade(plank, 0.85) });
    // the rafter feet under the eaves, down the slope from the wall plate
    if (!mobile) {
      const tanP = Math.tan(26 * Math.PI / 180);
      for (const f of [faces.right, faces.left]) {
        for (let k = 0; k < Math.round(D / 0.9); k++) {
          const u = -D / 2 + 0.45 + k * 0.9, a = facePoint(f, u, top - 0.03, 0), b = facePoint(f, u, top - 0.03 - 0.52 * tanP, 0.52);
          sink.member('structureWood', a, b, 0.06, 0.08, [-f.out[0] * Math.sin(Math.atan(tanP)), Math.cos(Math.atan(tanP)), -f.out[2] * Math.sin(Math.atan(tanP))],
            { colour: frameC, decor: true, fine: true, exposed: true }, 0.08);
        }
      }
    }
    // the shop: its counter, shelves and goods, the shutter boards propped up as the awning
    openShop(sink, faces.front, 0, F, front, shopH, { wall: t, depth: D - 2 * t, width: W - 2 * t, height: H },
      { timber: shade(plank, 1.0), shutters: { colour: shade(plank, 1.08), mode: look() < 0.15 ? 'stacked' : 'propped' }, goods: BAZAAR_GOODS }, look);
    faceBox(sink, 'structureWood', faces.front, 0, F + shopH + 0.24, 0.03, Math.min(front, 2.6), 0.36, 0.04, { colour: pick(look, SIGNS), decor: true });
    // the steps up to the floor, the sacks and the baskets out before the shop
    // (dome-detail-275) the plank walk at the floor before the shop on its stone pads, its edge beam, the awning's poles on
    // it; the step down off it, the sacks and the baskets out on it
    sink.span('structureWood', -W / 2 + 0.05, F - 0.07, D / 2, W / 2 - 0.05, F - 0.01, D / 2 + walk, { colour: shade(plank, 0.88), decor: true });
    sink.span('structureWood', -W / 2 + 0.05, F - 0.26, D / 2 + walk - 0.14, W / 2 - 0.05, F - 0.07, D / 2 + walk, { colour: frameC, decor: true });
    for (let k = 0; k < Math.max(3, Math.round(W / 2.2) + 1); k++) {
      const px = -W / 2 + 0.25 + (W - 0.5) * k / Math.max(2, Math.round(W / 2.2));
      sink.span('stone', px - 0.18, -0.2, D / 2 + walk - 0.3, px + 0.18, F - 0.26, D / 2 + walk + 0.02, { decor: true, shade: 0.9 });
    }
    freeBox(sink, 'stone', faces.front, (look() - 0.5) * (front - 1.2), 0.1, walk + 0.22, 1.1, 0.3, 0.44, { decor: true });
    sink.dressing(mobile, () => {
      for (let k = 0; k < 4; k++) {
        const u = (look() - 0.5) * (W - 0.8), o = 0.35 + look() * Math.max(0.1, walk - 0.7);
        const p = facePoint(faces.front, u, 0, o);
        if (look() < 0.5) sink.cylinder('structureWood', [p[0], F - 0.02, p[2]], 'y', 0.42, 0.24, 8, { colour: rgb(0x9a7a4a), decor: true, fine: true }, 0.3, true);
        else faceBox(sink, 'structureWood', faces.front, u, F + 0.24, o, 0.45, 0.5, 0.32, { colour: pick(look, BAZAAR_GOODS), decor: true, fine: true });
      }
    });
    // (dome-detail-275) the firewood stacked along the blind side under its eave, in two cords of their own heights, the
    // ends of the billets over their faces (near); the water drum by the back door; a tin advertisement on the side
    {
      const f = faces.left, u0 = -D / 2 + 0.5, mid = u0 + (D - 1.6) * (0.45 + look() * 0.15), u1 = D / 2 - 1.1;
      for (const [a, b, h] of [[u0, mid, 1.05 + look() * 0.3], [mid + 0.06, u1, 0.75 + look() * 0.3]] as const) {
        if (b - a < 0.5) continue;
        faceBox(sink, 'structureWood', f, (a + b) / 2, h / 2 - 0.1, 0.25, b - a, h + 0.2, 0.46, { colour: shade(rgb(0x6a5038), 0.9 + look() * 0.15), decor: true });
        for (let k = 0; k < Math.round((b - a) / 0.2); k++) {
          const uu = a + 0.1 + look() * (b - a - 0.2), yy = 0.1 + look() * (h - 0.2);
          sink.cylinder('structureWood', facePoint(f, uu, yy, 0.45), 'x', 0.06, 0.055 + look() * 0.03, 6,
            { colour: shade(rgb(0xa08058), 0.85 + look() * 0.25), decor: true, fine: true });
        }
      }
      const dz = -D / 2 - 0.36, dx = (doorU > 0 ? -1 : 1) * (W / 2 - 0.55);
      sink.cylinder('structureMetal', [dx, 0, dz], 'y', 0.88, 0.29, 12, { colour: shade(TIN[2], 0.7), decor: true }, 0.29, true);
      sink.cylinder('structureMetal', [dx, 0.86, dz], 'y', 0.04, 0.3, 12, { colour: shade(TIN[2], 0.55), decor: true }, 0.3, true);
      faceBox(sink, 'structureMetal', faces.right, (winU > 0 ? -1 : 1) * Math.min(D / 2 - 1.0, Math.abs(winU) + 1.2), F + 1.6, 0.012, 0.7, 0.5, 0.012,
        { colour: pick(look, SIGNS), decor: true, fine: 'near' });
    }
    // the back door and the side window's closed plank shutters, in their boards' thickness (whole boxes: the shop's inside
    // sees their backs), the door's battens and its steps down to the ground
    const leafC = { colour: shade(plank, 0.75), decor: true };
    freeBox(sink, 'structureWood', faces.back, doorU, F + 1.0, -t / 2, 0.84, 1.98, 0.035, leafC);
    for (const y of [F + 0.3, F + 1.7]) faceBox(sink, 'structureWood', faces.back, doorU, y, 0.012, 0.8, 0.1, 0.024, { colour: shade(plank, 0.62), decor: true, fine: true });
    freeBox(sink, 'stone', faces.back, doorU, 0.12, 0.25, 1.1, 0.3, 0.5, { decor: true });
    for (const s of [-1, 1]) freeBox(sink, 'structureWood', faces.right, winU + s * 0.2, F + 1.35, -t / 2, 0.39, 0.78, 0.03, { colour: shade(plank, 0.8), decor: true });
    recordBody(sink, 0, 0, W, D, rg.ridgeTopY, 'structureWood');
  });
}

/** A bazaar's goods: rice and dal sacks, tea, cloth, tins. */
const BAZAAR_GOODS: readonly Rgb[] = [0xc8b88a, 0xa89068, 0x6a7a4a, 0x8a3a2e, 0x3a4a6a, 0xd0c4a0, 0x7a5a3a].map(rgb);
/** The shops' painted signboards. */
const SIGNS: readonly Rgb[] = [0x2f4f6a, 0x7a2e26, 0x3f5f46, 0xc0a040].map(rgb);

/** A bazaar shop: one shop on its plot. */
const bazaarShop: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  // (dome-detail-275) the body set back from the plot's front by the plank walk's depth: the walk stands inside the plot
  const walk = 1.3;
  const W = Math.max(5, Math.min(9, ctx.info.w - 0.6)), D = Math.max(6, Math.min(10, ctx.info.d - 0.6 - walk));
  shop(sink, ctx, 0, -walk / 2, W, D, walk);
  return sink.finish();
};

/**
 * The mission church: rough stone, a steep red tin roof, a timber porch and a small belfry over the gable.
 * (dome-detail-275; the work list: "a plain mission chapel: little relief, and a plain roof and belfry") The rubble's
 * dressed quoins, its base and sill courses, the buttresses between the round-headed lights and at the corners, each
 * weathered back in two offsets; the tin in relief with its laps and replaced sheets, white bargeboards and fascias, a
 * cross on the back gable; the front gable's oculus; the timber porch on its stone pads under its own tin gable; the
 * belfry louvred at its sides and open at its ends, its corner boards, cornice, bell-cast cap and cross; the rain butt.
 */
const church: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  // (dome-detail-275) the nave set back from the plot's front by the porch's depth: the porch stands inside the plot
  const porch = 1.4;
  const W = Math.max(5.5, Math.min(8, ctx.info.w - 0.4)), D = Math.max(6.4, Math.min(12, ctx.info.d - 0.4 - porch));
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.4, y0: 0, h: 2.6 }];
  // (dome-detail-275) the side lights round-headed (the house cuts the head)
  for (const face of ['left', 'right'] as const) {
    for (const o of windowRhythm(face, 0, D, { w: 0.8, h: 1.55, sill: 1.2, spacing: 2.4, margin: 1.0 })) openings.push({ ...o, arch: {} });
  }
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => {
      const y = y0 + o.y0, r = o.w / 2;
      windowUnit(s, face, o.u, y, o.w, o.h, { frame: WHITE, frameWidth: 0.06, frameOut: 0.05, bars: 'six', surround: null, sill: { bucket: 'stone', out: 0.1 }, shutters: null }, ctx.rng, 0.3);
      // (dome-detail-275) the fanlight in the head, the dressed jambs up to the springing, the voussoirs round the head
      archGlazing(s, face, o.u, y + o.h, r, WHITE);
      for (const sd of [-1, 1]) faceBox(s, 'stone', face, o.u + sd * (r + 0.08), y + o.h / 2, 0.02, 0.16, o.h, 0.04, { decor: true, shade: 1.1 });
      archHead(s, face, o.u, y + o.h, r, 'stone', 0.16, 7);
    },
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: rgb(0x6a4b33), frame: { bucket: 'stone', width: 0.22, out: 0.07, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank' }, y0 + o.y0),
  };
  const roof = { ...tin(48), eave: 0.4, verge: 0.3 };
  const zc = -porch / 2;
  sink.placed(0, 0, 0, zc, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.45, out: 0.08, bucket: 'stone' }, storeys: [{ h: 3.8, wall: 'stone' }], roof, roofColour: TIN[0], gableBucket: 'stone',
      openings, chimneys: [], gutters: null, verge: null,
    }, dialect);
    const rg = frame.roof, eave = frame.eaveY, F = frame.faces;
    // (dome-detail-275) the tin in relief: its laps and a sheet or two replaced, open over a stripped patch
    tinCovering(sink, rg, roof, frame.roofPatch, look, 2, TIN[0]);
    // (dome-detail-275) the base course and the sill course round the nave, a hand proud, broken at the door
    for (const name of ['front', 'right', 'back', 'left'] as const) {
      const gaps: Array<readonly [number, number]> = name === 'front' ? [[-0.98, 0.98]] : [];
      course(sink, F[name], 0.45, 0.62, 0.06, gaps, 0.86);
      course(sink, F[name], 1.53, 1.61, 0.04, gaps, 1.06);
    }
    // (dome-detail-275) the dressed quoins up the four corners, long and short in turn, a shade paler than the rubble
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      for (let k = 0, y = 0.62; y < eave - 0.25; k++) {
        const h = 0.28 + look() * 0.06, a = k % 2 ? 0.22 : 0.42, b = k % 2 ? 0.42 : 0.22;
        const x0 = sx * W / 2, z0 = sz * D / 2;
        sink.quoin('stone', x0 - (sx > 0 ? a : 0.03), y, z0 - (sz > 0 ? b : 0.03), x0 + (sx > 0 ? 0.03 : a), Math.min(eave - 0.05, y + h), z0 + (sz > 0 ? 0.03 : b), sx, sz,
          { decor: true, shade: 1.14 + look() * 0.06 });
        y += h + 0.01;
      }
    }
    // (dome-detail-275) the buttresses on the long walls: at the corners and between the lights, each its two offsets
    // weathered back (a sloped cap from its face to the wall or the stage over it)
    const sideLights = openings.filter((o) => o.face === 'right').map((o) => o.u).sort((p, q) => p - q);
    const buttressAt = [-(D / 2 - 0.3), D / 2 - 0.3];
    for (let k = 0; k + 1 < sideLights.length; k++) buttressAt.push((sideLights[k] + sideLights[k + 1]) / 2);
    for (const name of ['right', 'left'] as const) {
      const f = F[name];
      for (const u of buttressAt) {
        if (openings.some((o) => o.face === name && Math.abs(o.u - u) < o.w / 2 + 0.45)) continue;
        const stage = (o0: number, o1: number, ya: number, yb: number, cap: number) => {
          if (yb - ya > 0.01) faceBox(sink, 'stone', f, u, (ya + yb) / 2, o1 / 2 - 0.02, 0.5, yb - ya, o1 + 0.04, { decor: true, shade: 0.97 }, { back: true });
          const P = (o: number, y: number) => facePoint(f, u - 0.25, y, o);
          orientedPrism(sink, 'stone', [P(o0 - 0.02, yb), P(o1, yb), P(o0 - 0.02, yb + cap)], f.u, 0.5, { decor: true, shade: 0.88 });
        };
        stage(0, 0.42, -0.3, 1.6, 0);
        stage(0.24, 0.42, 1.6, 1.6, 0.26);
        stage(0, 0.24, 1.6, 3.0, 0);
        stage(0, 0.24, 3.0, 3.0, 0.34);
      }
    }
    // (dome-detail-275) the white bargeboards up both gables' verges, a pendant at each apex; the fascia boards along the
    // eaves under the tin
    const zV = rg.halfD + roof.verge - 0.03, xE = rg.s + roof.eave - 0.02;
    const under = (x: number) => (rg.topAt(x, 0) ?? eave) - roof.thickness / Math.cos(48 * Math.PI / 180);
    const paint = { colour: WHITE, decor: true, exposed: true } as const;
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) sink.member('structureWood', [sx * xE, under(xE) - 0.11, sz * zV], [0, under(0) - 0.11, sz * zV], 0.24, 0.05, [0, 0, sz], paint, 0);
      sink.span('structureWood', -0.06, under(0) - 0.75, sz * zV - 0.06, 0.06, under(0) - 0.05, sz * zV + 0.06, { colour: WHITE, decor: true });
    }
    for (const sx of [-1, 1]) sink.span('structureWood', sx * xE - 0.03, under(xE) - 0.2, -zV, sx * xE + 0.03, under(xE) + 0.02, zV, { colour: shade(WHITE, 0.95), decor: true });
    // (dome-detail-275) a cross over the back gable's apex
    finialOn(sink, 0, rg.ridgeTopY, -rg.halfD - 0.1, 0.9, WHITE, 'cross');
    // (dome-detail-275) the gables' oculi: the dressed ring, the glass, the cross of its glazing bars
    for (const [f, r] of [[F.front, 0.36], [F.back, 0.27]] as const) {
      const oy = eave + Math.min(1.2, (rg.ridgeY - eave) * 0.42);
      sink.cylinder('stone', facePoint(f, 0, oy, -0.02), 'z', 0.08, r + 0.14, 16, { decor: true, shade: 1.12 }, r + 0.14, true);
      sink.cylinder('glass', facePoint(f, 0, oy, 0.04), 'z', 0.025, r, 16, { decor: true }, r, true);
      faceBox(sink, 'structureWood', f, 0, oy, 0.075, 0.05, 2 * r, 0.03, { colour: WHITE, decor: true, fine: true }, 'caps');
      faceBox(sink, 'structureWood', f, 0, oy, 0.075, 2 * r, 0.05, 0.03, { colour: WHITE, decor: true, fine: true }, 'ends');
    }
    // the belfry: a timber box on the front gable with a pyramid cap and a cross
    const z = D / 2 - 0.6, top = rg.ridgeTopY;
    // (props census #5, lane B 2026-10-15) the belfry's bell opening cut through its front (a dark plate on the box), the
    // bell hung in it from its beam
    // (the belfry a crown of the roof in the house's plan: it falls with its roof section)
    // (dome-detail-275) open at its ends and louvred at its sides, the dark of the bell chamber behind; its corner boards,
    // the cornice under a bell-cast cap of tin and its cross
    roofCrown(sink, frame, { kind: 'belfry', x0: -1.0, x1: 1.0, z0: z - 1.0, z1: z + 1.0, y0: top - 0.8, y1: top + 4.1, bucket: 'structureWood' }, () => {
      const hole = { u0: -0.3, u1: 0.3, y0: top + 0.25, y1: top + 1.1 };
      const bf = holedBox(sink, 'structureWood', -0.6, z - 0.6, 0.6, z + 0.6, top - 0.8, top + 1.4, { front: [hole], back: [hole], right: [hole], left: [hole] }, 0.18, 0.14,
        { colour: WHITE });
      for (const name of ['front', 'right', 'back', 'left'] as const) {
        const f = bf[name];
        faceBox(sink, 'dark', f, 0, (hole.y0 + hole.y1) / 2, -0.17, 0.6, hole.y1 - hole.y0, 0.02, { decor: true });
        if (name === 'right' || name === 'left') {
          for (let k = 0; k < 4; k++) {
            const y = hole.y0 + 0.12 + k * 0.21;
            sink.member('structureWood', facePoint(f, -0.3, y, -0.08), facePoint(f, 0.3, y, -0.08), 0.2, 0.02, [f.out[0] * 0.77, 0.64, f.out[2] * 0.77], { colour: shade(WHITE, 0.9), decor: true }, 0);
          }
        }
        // the corner boards and the sill board under the openings
        for (const sd of [-1, 1]) faceBox(sink, 'structureWood', f, sd * 0.53, top + 0.3, 0.015, 0.14, 2.2, 0.03, { colour: shade(WHITE, 0.94), decor: true, fineSides: true }, 'caps');
        faceBox(sink, 'structureWood', f, 0, hole.y0 - 0.04, 0.03, 0.8, 0.08, 0.06, { colour: shade(WHITE, 0.9), decor: true, fineSides: true });
      }
      sink.cylinder('structureMetal', [0, top + 0.45, z + 0.3], 'y', 0.42, 0.2, 10, { colour: rgb(0x6a5a3a), decor: true }, 0.1);
      sink.span('structureWood', -0.42, top + 0.87, z + 0.25, 0.42, top + 0.95, z + 0.35, { colour: rgb(0x4a3a2a), decor: true });
      sink.band('structureWood', -0.68, top + 1.4, z - 0.68, 0.68, top + 1.52, z + 0.68, { colour: shade(WHITE, 0.9), decor: true, shadow: true });
      sink.cylinder('structureMetal', [0, top + 1.52, z], 'y', 0.22, 1.12, 4, { colour: TIN[0] }, 0.88, false, Math.PI / 4);
      sink.cylinder('structureMetal', [0, top + 1.74, z], 'y', 1.2, 0.88, 4, { colour: shade(TIN[0], 1.05) }, 0.03, true, Math.PI / 4);
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + k * Math.PI / 2, c = Math.cos(a), sn = Math.sin(a);
        sink.member('structureMetal', [c * 0.86, top + 1.75, z + sn * 0.86], [c * 0.05, top + 2.93, z + sn * 0.05], 0.06, 0.04, [c * 0.7, 0.71, sn * 0.7], { colour: shade(TIN[0], 0.8), decor: true }, 0.01);
      }
      finialOn(sink, 0, top + 2.92, z, 0.9, WHITE, 'cross');
    });
    // (dome-detail-275) the rain butt at a back corner, on its stones, the eave's drip falling into it
    const bx = (look() < 0.5 ? -1 : 1) * (W / 2 + 0.36), bz = -D / 2 + 0.85;
    sink.span('stone', bx - 0.3, -0.1, bz - 0.3, bx + 0.3, 0.14, bz + 0.3, { decor: true, shade: 0.85 });
    sink.cylinder('structureMetal', [bx, 0.14, bz], 'y', 0.86, 0.26, 12, { colour: shade(TIN[3], 0.7), decor: true }, 0.26, true);
    // (dome-detail-275) the porch: two timber posts on stone pads, its tie beam and knee braces, its own tin gable with the
    // bargeboards and a boarded tympanum, the flags under it, a bench along each side, the step down
    const fz = D / 2, pz = fz + porch, px = 1.15, ph = 2.75;
    const post = rgb(0x5a4636);
    for (const sx of [-1, 1]) {
      sink.span('stone', sx * px - 0.2, -0.3, pz - 0.36, sx * px + 0.2, 0.3, pz - 0.0);
      sink.span('structureWood', sx * px - 0.09, 0.3, pz - 0.27, sx * px + 0.09, ph, pz - 0.09, { colour: post });
      sink.member('structureWood', [sx * (px - 0.06), ph - 0.6, pz - 0.18], [sx * (px - 0.55), ph - 0.06, pz - 0.18], 0.09, 0.08, [0, 0, 1], { colour: post, decor: true, exposed: true }, 0);
      // the bench along the side: its plank on two legs, from the wall to the post
      sink.span('structureWood', sx * (px - 0.4), 0.42, fz + 0.05, sx * (px - 0.05), 0.48, pz - 0.3, { colour: shade(post, 1.1), decor: true });
      for (const bz2 of [fz + 0.2, pz - 0.45]) sink.span('structureWood', sx * (px - 0.3), 0.14, bz2 - 0.04, sx * (px - 0.15), 0.42, bz2 + 0.04, { colour: post, decor: true });
    }
    sink.span('structureWood', -px - 0.12, ph, pz - 0.3, px + 0.12, ph + 0.18, pz - 0.06, { colour: post, decor: true });
    sink.span('stone', -px - 0.25, -0.2, fz, px + 0.25, 0.14, pz - 0.05, { decor: true, shade: 0.92 });
    sink.span('stone', -0.8, -0.2, pz - 0.05, 0.8, 0.0, pz + 0.25, { decor: true, shade: 0.86 });
    const pr: RoofSpec = { ...tin(42), eave: 0.25, verge: 0.2, decor: true };
    sink.placed(0, 0, 0, fz + porch / 2, () => {
      const pg = roofGeometry(2 * px + 0.24, porch, ph + 0.18, pr);
      emitRoof(sink, pg, pr, shade(TIN[0], 0.96));
      tinCovering(sink, pg, pr, null, look, 0, TIN[0]);
      // the boarded tympanum over the tie beam, its bargeboards
      const gz = porch / 2 - 0.1;
      facing(sink, 'structureWood', (pg.gable ?? []).map(([u, y]): Vec3 => [u * 0.98, y, gz]), [0, 0, 1], { colour: WHITE, decor: true });
      const pxE = pg.s + pr.eave - 0.02, pu = (x: number) => (pg.topAt(x, 0) ?? ph) - pr.thickness / Math.cos(42 * Math.PI / 180);
      for (const sx of [-1, 1]) sink.member('structureWood', [sx * pxE, pu(pxE) - 0.09, porch / 2 + pr.verge - 0.03], [0, pu(0) - 0.09, porch / 2 + pr.verge - 0.03], 0.18, 0.04, [0, 0, 1], paint, 0);
    });
  });
  return sink.finish();
};

/**
 * The Angami house: low plank walls on a stone terrace, a great thatch sweeping low, crossed horns on the front gable.
 * (dome-detail-275; the work list: a plain thatch slab over a dark box) The thatch's split-bamboo bindings across each
 * slope, its smoke-darkened band under the ridge (the hearth's smoke seeps out through it), its rain-dark eave, the
 * ridge's crossed bamboo pegs; the
 * gables of woven bamboo mat on their battens; the mithun skulls of the owner's feasts of merit in a row on the front
 * gable; the firewood stacked on the terrace against the walls under the low eaves; the terrace's edge of rough
 * boulders, a step up to it at the door.
 */
const nagaHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the Angami house is long and narrow: on a farmhouse plot (wider than deep) it lies along the plot (plotAxes), its
  // stone platform and the thatch inside it; across the plot (9 m deep) it reached 0.9 m past its +z side
  const plot = plotAxes(ctx.info);
  const W = Math.max(5.6, Math.min(8, plot.w - (plot.turned ? 2.0 : 1.6))), D = Math.max(7, Math.min(14, plot.d - (plot.turned ? 2.2 : 0.4)));
  const plank = pick(rng, WEATHERED_PLANK);
  // (props census BS-3, lane B 2026-10-14: its walls a span box with the door laid on; 334 triangles, 1.2 a m² of wall)
  // the house grammar's plank walls on the stone terrace, the door cut low in the front and a shuttered hatch in a side,
  // the thatch sweeping low over them with the front gable boarded under it; the boards run between the openings
  const du = -W * 0.15;
  const openings: Opening[] = [
    { face: 'front', storey: 0, kind: 'door', u: du, w: 0.8, y0: 0, h: 1.6 },
    { face: 'right', storey: 0, kind: 'window', u: D * 0.18, w: 0.55, y0: 0.75, h: 0.45 },
  ];
  const dialect: HouseDialect = {
    window: (s2, face, o, y0) => windowUnit(s2, face, o.u, y0 + o.y0, o.w, o.h, { frame: shade(plank, 0.7), frameWidth: 0.06, frameOut: 0.03, bars: 'none', surround: null, sill: null,
      shutters: { colour: shade(plank, 0.8), kind: 'plank', closed: 0.6 } }, rng, 0.2),
    door: (s2, face, o, y0) => doorUnit(s2, face, o.u, y0 + o.y0, o.w, o.h, { leaf: shade(plank, 0.75), frame: { bucket: 'structureWood', width: 0.12, out: 0.06, colour: shade(plank, 0.7) }, steps: { bucket: 'stone' }, leafKind: 'plank' }, y0 + o.y0),
    // (the looks lane, 2026-10-15; WORKLIST #15 "kohima nagaHouse from members": the boards were one printed panel a run)
    // the walls in the Angami's broad adzed planks, each its own, battens over their joints, a rail at foot and head
  };
  const cladding = (s2: PartSink, face: Face, rect: WallRect, own: readonly Opening[]) => boardCladding(s2, face, rect, own,
    (k) => shade(plank, 0.82 + ((k * 7919 + Math.round(W * 13)) % 23) / 23 * 0.26), shade(plank, 0.72),
    { mobile: ctx.tier === 'mobile', width: face.out[2] > 0.5 ? 0.42 : 0.3 });
  // the thatch: steep, deep eaves sweeping down to near a metre off the ground
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 52, eave: plot.turned ? 0.9 : 1.3, verge: plot.turned ? 0.7 : 0.9, thickness: 0.4, bucket: 'straw', ridge: 'round', thatch: 'rows' };
  alongPlot(sink, plot.turned, () => {
    sink.paint = shade(plank, 0.9);
    let frame;
    try {
      frame = buildHouse(sink, {
        w: W, d: D, plinth: { h: 0.5, out: 0.8, bucket: 'stone' }, storeys: [{ h: 1.7, wall: 'structureWood' }], roof, gableBucket: 'structureWood',
        openings, chimneys: [], gutters: null, verge: null, reveal: 0.12, spall: null,
      }, dialect);
      // (Lane C 2026-10-16, houseDamage: a framed storey takes its infill from the wall's second layer, which a plank wall has not, so the damage path threw at damage.ts:325; as the LOOKS fishery fix 182dca492) the storey is unframed and its planks laid over the walls after the house is built, face by face round each face's openings
      const faces = storeyFaces(frame, 0), body = frame.bodies[0];
      for (const name of ['front', 'right', 'back', 'left'] as const) {
        const face = faces[name];
        cladding(sink, face, { u0: -face.width / 2, u1: face.width / 2, y0: body.y0, y1: body.y1 }, openings.filter((o) => o.face === name && o.storey === 0));
      }
      // the front planks beside the door carved in relief: the mithun's head with its horns (the feast of merit's mark)
      // over the door's side planks, and the moon disc; and before the house the sitting stones of its forecourt
      const f = frame.faces.front, y0 = frame.floors[0];
      for (const [u, y] of [[du - 0.75, y0 + 1.15], [du + 0.75, y0 + 1.15]] as const) {
        if (Math.abs(u) > W / 2 - 0.4) continue;
        faceBox(sink, 'structureWood', f, u, y, 0.06, 0.26, 0.2, 0.06, { colour: shade(plank, 1.12), decor: true });
        for (const sx of [-1, 1]) sink.member('structureWood', facePointOn(f, u + sx * 0.1, y + 0.08, 0.07), facePointOn(f, u + sx * 0.32, y + 0.26, 0.07), 0.06, 0.04, f.out,
          { colour: shade(plank, 1.15), decor: true, exposed: true, fine: true }, 0.01);
      }
      sink.cylinder('structureWood', facePointOn(f, du + (du < 0 ? 1.4 : -1.4), y0 + 1.25, 0.03), 'z', 0.04, 0.17, 10, { colour: shade(plank, 1.2), decor: true, fine: true });
      nagaDress(sink, ctx, frame, roof, openings, du);
      sink.dressing(ctx.tier === 'mobile', () => {
        for (let k = 0; k < 3; k++) {
          const x = -W / 2 + 0.9 + k * 1.1 + (ctx.variant() - 0.5) * 0.3, z = D / 2 + 0.95 + (ctx.variant() - 0.5) * 0.3;
          sink.span('stone', x - 0.42, 0.42, z - 0.24, x + 0.42, 0.5 + 0.18 + ctx.variant() * 0.06, z + 0.24, { decor: true, shade: 0.94 });
        }
      });
    } finally { sink.paint = null; }
    // the crossed horns (kika) over the front gable
    const z = D / 2 + roof.verge - 0.1, apex = frame.roof.ridgeTopY;
    for (const side of [-1, 1]) {
      // (the connectivity sweep) the horns are the bargeboards run on up past the apex: each from down the verge, on the
      // thatch, so the pair cross in their heads' last third
      sink.member('structureWood', [side * 1.48, apex - 1.96, z], [-side * 0.55, apex + 1.4, z], 0.22, 0.12, [0, 0, 1], { colour: rgb(0x5a4636), decor: true, exposed: true });
    }
  });
  return sink.finish();
};

/** The Angami house's dressing (dome-detail-275): see nagaHouse. In the house's own frame (its front at +z). */
function nagaDress(sink: PartSink, ctx: RegionalBuildContext, frame: HouseFrame, roof: RoofSpec, openings: readonly Opening[], du: number): void {
  const look = ctx.variant, rg = frame.roof, body = frame.bodies[0], y0 = body.y0;
  const W = body.x1 - body.x0, D = body.z1 - body.z0;
  const cosP = 1 / Math.hypot(1, rg.tanP), sinP = rg.tanP * cosP, xe = rg.s + roof.eave, ze = rg.halfD + roof.verge;
  const hole = frame.roofPatch, pad = 0.1;
  const on = (sd: number, r: number, z: number): Vec3 => [sd * r, (rg.topAt(sd * r, z) ?? rg.eaveY) + 0.004, z];
  // a run along the slope at a run r from the ridge line, z from -ze to ze, broken a hand clear of a stripped patch
  const runs = (sd: number, r: number, half: number): Array<[number, number]> => {
    const z0 = -ze + 0.06, z1 = ze - 0.06;
    if (!hole || hole.side !== sd || r < hole.x0 - half - pad || r > hole.x1 + half + pad) return [[z0, z1]];
    return [[z0, hole.z0 - pad], [hole.z1 + pad, z1]];
  };
  const bamboo = rgb(0x9c8a58);
  for (const sd of [-1, 1]) {
    const n: Vec3 = [sd * sinP, cosP, 0];
    // the smoke-darkened band under the ridge and the rain-dark eave
    for (const [r, w, k] of [[0.95, 1.3, 0.55], [xe - 0.32, 0.6, 0.72]] as const) {
      for (const [a, b] of runs(sd, r, w * cosP / 2)) if (b - a > 0.4) sink.member('straw', on(sd, r, a), on(sd, r, b), w, 0.012, n, { decor: true, exposed: true, shade: k }, 0);
    }
    // the split-bamboo bindings across the slope, a long arm apart
    for (let r = xe - 0.75; r > 1.7; r -= 0.9) {
      for (const [a, b] of runs(sd, r, 0.05)) if (b - a > 0.4) sink.member('structureWood', on(sd, r, a), on(sd, r, b), 0.05, 0.035, n, { colour: shade(bamboo, 0.9 + look() * 0.2), decor: true, exposed: true }, 0);
    }
    // the ridge's crossed bamboo pegs that hold its roll down, a pace apart, each pair crossing over the ridge
    for (let z = -ze + 0.45; z < ze - 0.3; z += 0.95) {
      if (hole && hole.side === sd && hole.x0 < 0.8 && z > hole.z0 - pad && z < hole.z1 + pad) continue;
      const a = on(sd, 0.62, z), b: Vec3 = [-sd * 0.32, a[1] + 0.94 * rg.tanP + 0.06, z];
      sink.member('structureWood', a, b, 0.05, 0.05, [0, 0, 1], { colour: shade(bamboo, 0.8 + look() * 0.2), decor: true, exposed: true }, 0);
    }
  }
  // the gables' woven bamboo mat on their battens
  const g = rg.gable;
  if (g) {
    const [, , apex] = g, ey = rg.eaveY;
    for (const sz of [1, -1]) {
      const z = sz * (rg.halfD + 0.02), mat = shade(BAMBOO_MAT, 0.92 + look() * 0.16);
      facing(sink, 'structureWood', [[-rg.s + 0.2, ey + 0.06, z], [rg.s - 0.2, ey + 0.06, z], [0, apex[1] - 0.26, z]], [0, 0, sz], { colour: mat, decor: true });
      for (let u = -rg.s + 0.55; u < rg.s - 0.5; u += 0.55) {
        const yt = apex[1] - 0.3 - Math.abs(u) * rg.tanP;
        if (yt - ey > 0.3) sink.span('structureWood', u - 0.025, ey + 0.06, z - 0.005, u + 0.025, yt, z + sz * 0.03, { colour: shade(mat, 0.7), decor: true, fine: true });
      }
    }
    // the mithun skulls of the feasts of merit in a row across the front gable, their horns sweeping up and out
    const f = frame.faces.front, sy = ey + 0.5, half = rg.s - 0.5 / rg.tanP - 0.45, count = Math.max(3, Math.min(6, Math.floor(2 * half / 0.62) + 1));
    const bone = rgb(0xd8cfb8), horn = rgb(0x3a3026);
    for (let k = 0; k < count; k++) {
      const u = -half + 2 * half * k / (count - 1), y = sy + (look() - 0.5) * 0.06;
      faceBox(sink, 'structureWood', f, u, y, 0.08, 0.17, 0.28, 0.1, { colour: shade(bone, 0.9 + look() * 0.15), decor: true, fine: true }, { back: true });
      for (const sx of [-1, 1]) {
        sink.member('structureWood', facePoint(f, u + sx * 0.06, y + 0.1, 0.06), facePoint(f, u + sx * 0.27, y + 0.2, 0.06), 0.06, 0.06, f.out,
          { colour: horn, decor: true, exposed: true, fine: true }, 0);
      }
    }
  }
  // the firewood stacked on the terrace against the walls, under the low eaves, clear of the openings; the billets' ends
  // over each stack's face (near)
  const wood = rgb(0x6e5438), billet = rgb(0xa88a60);
  for (const name of ['right', 'left', 'front'] as const) {
    const f = frame.faces[name], half = f.width / 2 - 0.25;
    // (the front's clear of the door and its carved planks)
    const gaps = name === 'front' ? [[du - 1.6, du + 1.6] as const] : openings.filter((o) => o.face === name).map((o) => [o.u - o.w / 2 - 0.45, o.u + o.w / 2 + 0.45] as const);
    let u = -half;
    for (const [g0, g1] of [...gaps.sort((p, q) => p[0] - q[0]), [half, half] as const]) {
      const a = u, b = Math.min(g0, half);
      u = Math.max(u, g1);
      if (b - a < 1.0 || look() < 0.2) continue;
      const a1 = a + look() * 0.3, b1 = b - look() * 0.3, h = 0.8 + look() * 0.22, dep = 0.42;
      faceBox(sink, 'structureWood', f, (a1 + b1) / 2, y0 + h / 2, dep / 2, b1 - a1, h, dep, { colour: shade(wood, 0.9 + look() * 0.2), decor: true }, { back: true, bottom: true });
      for (let k = 0; k < Math.round((b1 - a1) / 0.3); k++) {
        const uu = a1 + 0.08 + look() * (b1 - a1 - 0.16), yy = y0 + 0.08 + look() * (h - 0.16);
        const p = facePoint(f, uu, yy, dep - 0.03);
        sink.cylinder('structureWood', p, Math.abs(f.out[0]) > 0.5 ? 'x' : 'z', 0.07, 0.05 + look() * 0.03, 6, { colour: shade(billet, 0.8 + look() * 0.3), decor: true, fine: true });
      }
    }
  }
  // the terrace's edge of rough boulders round the front and the sides (the back is set into the slope), each its own
  // size and turn; the front's clear of the door and of the forecourt's sitting stones
  const ex = W / 2 + 0.8, ez = D / 2 + 0.8;
  const edge = (x: number, z: number, along: 'x' | 'z') => {
    const l = 0.6 + look() * 0.4, h = 0.4 + look() * 0.22, d = 0.34 + look() * 0.14;
    sink.placed((look() - 0.5) * 0.3, x, 0, z, () => {
      if (along === 'x') sink.span('stone', -l / 2, -0.2, -d / 2, l / 2, h, d / 2, { decor: true, shade: 0.78 + look() * 0.3 });
      else sink.span('stone', -d / 2, -0.2, -l / 2, d / 2, h, l / 2, { decor: true, shade: 0.78 + look() * 0.3 });
    });
    return l;
  };
  for (let x = -ex + 0.25; x < ex - 0.2;) {
    if (Math.abs(x - du) < 0.7 || x < -W / 2 + 3.6) { x += 0.35; continue; }
    x += edge(x, ez - 0.05, 'x') + 0.04;
  }
  for (const sx of [-1, 1]) for (let z = ez - 0.3; z > -ez + 0.2;) z -= edge(sx * (ex - 0.05), z, 'z') + 0.04;
}

/**
 * The Naga granary (the props census #22 and #17, 2026-10-15, the judges: "round posts with rat-guard discs, a bamboo
 * floor frame and joists, woven-mat walls as panels in a bamboo frame, a low door with depth, and a notched-log ladder; a
 * thatch roof with a ridge, an eave fringe and horn finials"): the bin a metre up on round posts with a disc round each
 * under the floor's girders, the joists and the deck, the walls of woven mat in their bamboo frames, the low door shut in
 * its frame at the ladder's head, the thatch steep over it in its courses with the crossed horns over the gable
 * (outbuildings.ts openShed, gable form on a raised floor). The granary, the woodshed and the yards' shed are it.
 */
const granary: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const W = Math.max(2.8, Math.min(4, ctx.info.w - 1)), D = Math.max(3.2, Math.min(5, ctx.info.d - 1.5));
  const post = rgb(0x6a5a46), look = ctx.variant;
  const shed = openShed(sink, {
    W, D, hLo: 2.85, pitchDeg: 48, gable: true, lift: 1.0, back: true, ends: true, pile: 0, ratGuards: true, ladder: true,
    front: { u: 0, w: 0.7, h: 1.15, leaf: shade(post, 0.85) }, mobile: ctx.tier === 'mobile',
  }, {
    timber: post, post: 0.14, round: true, pad: null,
    cladding: 'batten', boards: [BAMBOO_MAT, shade(BAMBOO_MAT, 0.92), shade(BAMBOO_MAT, 1.07)], boardW: 0.62, batten: shade(post, 1.15), trim: shade(post, 1.1),
    covering: 'thatch', roofBucket: 'straw', thatch: 'rows', eave: 0.5, verge: 0.4,
  }, look);
  // the crossed horns (kika) over the +z gable: the barge boards run on up past the apex, crossing in their heads
  const apex = roofGeometry(W, D, shed.roof.eaveY, shed.roof.spec).ridgeTopY, z = D / 2 + 0.3;
  for (const side of [-1, 1]) {
    sink.member('structureWood', [side * W * 0.34, apex - W * 0.34 * Math.tan(48 * Math.PI / 180) - 0.05, z], [-side * 0.35, apex + 0.75, z], 0.16, 0.1, [0, 0, 1],
      { colour: rgb(0x5a4636), decor: true, exposed: true });
  }
  return sink.finish();
};

/** A shelled bungalow: the plinth, a standing chimney stack, wall stubs, the tin roof down in sheets. */
const shelled: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const W = Math.max(6, ctx.info.w - 0.6), D = Math.max(7, ctx.info.d - 0.6);
  // (props census #7, lane B 2026-10-14; the judges: "seven plaster posts on a plinth box, the sheets as slabs on cones")
  // the ruin grammar: the bungalow's own rendered walls on its high plinth broken low, its door and windows cut through
  // where they still stand, the chimney stack standing with its firebox, the tin roof down in its sheets over the heaps
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * (W - 2.6), w: 1.0, y0: 0, h: 2.1 }];
  for (const face of ['right', 'left'] as const) for (const o of windowRhythm(face, 0, D - 0.6, { w: 1.1, h: 1.2, sill: 0.8, spacing: 2.6, margin: 1.0, max: 2 })) openings.push(o);
  const head = (): RuinHead => ({ a: 0.4 + rng() * 1.8, b: 0.4 + rng() * 1.8, at: rng(), dip: 0.3 + rng() * 0.4, ragged: 0.3 });
  ruinHouse(sink, {
    w: W, d: D, t: 0.3, wall: 'plaster', plinth: { h: 0.75, out: 0.08, bucket: 'stone' }, storeys: [2.8], openings,
    heads: { front: head(), right: head(), back: head(), left: head() }, stub: 0.35,
    lintel: { bucket: 'structureWood', colour: rgb(0x3a2f26) }, roof: { bucket: 'structureMetal', colour: pick(rng, TIN), piece: [1.0, 2.4, 0.02] },
    timber: rgb(0x2e2620), chimney: { x: -W * 0.25, z: -D * 0.2, w: 0.7, h: 4.6 + rng(), bucket: 'stone' }, mobile: ctx.tier === 'mobile',
  }, rng, look);
  return sink.finish();
};

/**
 * The mission bell tower (the base tower plot; gauntlet wave 15 still saw a tiled European steeple there): a rough
 * stone base, a whitewashed timber belfry with louvred openings, a pyramid of painted tin and a cross.
 */
const bellTower: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const S = Math.max(2.8, Math.min(3.6, Math.min(ctx.info.w, ctx.info.d) - 0.3)), H = Math.max(7.5, Math.min(9.4, ctx.info.h));
  const base = H * 0.5, bel = H * 0.82;
  // (props census #5) the base's door and the belfry's four louvred openings cut through them (the leaf and dark
  // plates with their slats were laid on solid spans), the leaf at the back of the door's reveal and the slats across
  // the openings in theirs; the tower recorded as a shaft body
  holedBox(sink, 'stone', -S / 2, -S / 2, S / 2, S / 2, -0.4, base, { front: [{ u0: -0.5, u1: 0.5, y0: 0, y1: 2.1 }] }, 0.35, 0.3);
  recordShaft(sink, 0, 0, S, H + 0.75, 'stone');
  sink.span('stone', -S / 2 - 0.12, base - 0.05, -S / 2 - 0.12, S / 2 + 0.12, base + 0.2, S / 2 + 0.12, { decor: true });
  const T = S - 0.5;
  const lv = { u0: -T * 0.25, u1: T * 0.25, y0: bel - 1.4, y1: bel - 0.3 };
  const bf = holedBox(sink, 'structureWood', -T / 2, -T / 2, T / 2, T / 2, base + 0.2, bel, { front: [lv], right: [lv], back: [lv], left: [lv] }, 0.18, 0.14, { colour: WHITE });
  for (const f of [bf.front, bf.right, bf.back, bf.left]) {
    for (let k = 0; k < 4; k++) faceBox(sink, 'structureWood', f, 0, bel - 1.3 + k * 0.28, -0.07, T * 0.5, 0.05, 0.06, { colour: GREEN_TRIM, decor: true }, 'ends');
  }
  const door: Face = { origin: [0, 0, S / 2], u: [1, 0, 0], out: [0, 0, 1], width: S };
  sink.recess = 0.3;
  try {
    doorUnit(sink, door, 0, 0, 1.0, 2.1, { leaf: rgb(0x6a4b33), frame: { bucket: 'stone', width: 0.2, out: 0.06, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank' });
  } finally { sink.recess = 0; }
  sink.cylinder('structureMetal', [0, bel, 0], 'y', H - bel, T * 0.78, 4, { colour: TIN[0] }, 0.04, true, Math.PI / 4);
  sink.span('structureWood', -0.04, H - 0.05, -0.04, 0.04, H + 0.75, 0.04, { colour: WHITE, decor: true });
  sink.span('structureWood', -0.24, H + 0.45, -0.04, 0.24, H + 0.53, 0.04, { colour: WHITE, decor: true });
  return sink.finish();
};

const KOHIMA_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  bathhouse: bungalow,
  farmhouse: nagaHouse,
  cornershop: bazaarShop,
  marketRow: kohimaBazaarRow,
  depot: bazaarShop,
  chapel: church,
  granary,
  woodshed: granary,
  ruin: shelled,
  // the base plots the first kit left: the steeple and the market stalls (gauntlet wave 15)
  tower: bellTower,
  market: kohimaStall,
});

export const KOHIMA_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'kohima',
  region: 'Kohima, Naga Hills (1944): colonial bungalows under painted tin, a bazaar, a mission church, Angami thatched houses',
  surfaces: {
    roof: { kind: 'sheet', tint: [0.56, 0.30, 0.24] },
    stone: { kind: 'rubble', tint: [0.55, 0.52, 0.47] },
    sourced: { plaster: false, wood: true },
    // (the facades lane, round 11; waves 319/320: the walls' procedural canvas read as "speckle", "sponge", "cork",
    // "camouflage noise": its 6 cm bumps shade as dots from the street, as Steinburg's did before round 8) the walls
    // painted as the region renders them (regionalSurfaces.ts paintLimewash), every family under the kit's and the map's
    // tones; the plaster photo set is off (its 2.4 m tile repeats a lichen motif down every wall)
    render: { kind: 'limewash', seed: 0x6b0a },
    tones: { straw: (h, s, l) => [h - 0.02, Math.min(1, s * 0.5), Math.min(1, l * 0.8)] },
  },
  builders: KOHIMA_BUILDERS,
  // the Angami yards: a bamboo fence round the vegetable terrace and the granary on posts, an open gap (yards.ts)
  yard: { kinds: ['farmhouse'], fence: 'fencewattle', gate: null, shed: 'granary', shedSize: [4.3, 4.1], garden: true },
});

export type { RegionalParts };
