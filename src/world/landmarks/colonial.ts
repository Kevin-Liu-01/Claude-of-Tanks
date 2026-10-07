// src/world/landmarks/colonial.ts — a hill station's colonial set pieces (the landmarks lane, 2026-10-05): the Deputy
// Commissioner's bungalow and the terraced tennis court beside it — Kohima's Garrison Hill, where in April 1944 the
// lines of the siege lay across the court, a grenade's throw apart.
//
// The bungalow is the hill station's grandest (the Naga Hills kit's bungalows, maps/regional/kohima.ts, are its
// lesser neighbours): whitewashed plaster on a stone plinth under a hipped roof of corrugated iron painted red or green,
// deep verandas on three sides on white posts with their balustrades, a gabled porch over the front steps, two stacks.
// `damage` (0..1) is the siege on it: the veranda's roof stripped to its rafters along a run from one corner, a post
// knocked out and its beam sagging, the plaster scorched round the windows.
//
// The tennis court is a level terrace cut into the slope: the clay court (a doubles court and its run-off), its white
// lines, the net and its posts, the wire fence on its posts, the stone retaining wall where the ground falls away from
// the terrace, and the trench the siege dug across it (`damage` > 0). The terrace authors its movement record (a
// standable floor a hull drives onto from the uphill side, the retaining walls a hull meets from below).
import { PartSink, faceBox, rgb, shade, type Face, type Rgb } from '../maps/regional/geometry.ts';
import { buildHouse, windowRhythm, withWear, type HouseDialect, type Opening, type RoofSpec, emitRoof, roofGeometry } from '../maps/regional/house.ts';
import { doorUnit, windowUnit, type WindowStyle } from '../maps/regional/openings.ts';
import type { SimpleCollisionShape } from '../collision.ts';
import { bar } from './kit.ts';
import { sootOver } from './age.ts';
import type { LandmarkBuilder } from './types.ts';

const TIN: readonly Rgb[] = [0x8a3a2e, 0x7a3428, 0x4f6a4a, 0x5a7a52].map(rgb);
const WHITE = rgb(0xd8d3c6), GREEN_TRIM = rgb(0x3f5f46), SOOT = rgb(0x2a2724), RAFTER = rgb(0x5a4a3a), IRON = rgb(0x2e3030);
const CLAY = rgb(0x9a5a3c), LINE_WHITE = rgb(0xe8e4da), NET = rgb(0x2a2c2a), POST_GREEN = rgb(0x3d4f3e);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const tin = (pitch: number, kind: RoofSpec['kind']): RoofSpec => ({ kind, pitchDeg: pitch, eave: 0.6, verge: 0.6, thickness: 0.06, bucket: 'structureMetal', ridge: 'saddle' });

/**
 * One veranda along a face: the floor on the plinth, the posts (on their plinth piers), the balustrade, the lean-to
 * roof in bays — a bay listed in `stripped` shows its rafters only, a post listed in `fallen` is gone and its beam sags.
 */
function verandaRun(sink: PartSink, face: Face, floorY: number, wallTop: number, width: number, depth: number, roofColour: Rgb,
  stripped: ReadonlySet<number>, fallen: ReadonlySet<number>): void {
  faceBox(sink, 'structureWood', face, 0, floorY + 0.06, depth / 2, width, 0.12, depth, { colour: shade(WHITE, 0.9) });
  faceBox(sink, 'stone', face, 0, floorY / 2 - 0.2, depth / 2, width, floorY + 0.4, depth);
  const bays = Math.max(2, Math.round(width / 2.4));
  const beamY = wallTop - 0.25, lowY = beamY - 0.1;
  for (let i = 0; i <= bays; i++) {
    const u = -width / 2 + 0.12 + (width - 0.24) * i / bays;
    if (fallen.has(i)) {
      // the knocked-out post lies across the floor
      faceBox(sink, 'structureWood', face, u + 0.9, floorY + 0.2, depth - 0.8, 2.0, 0.16, 0.16, { colour: WHITE, decor: true });
      continue;
    }
    faceBox(sink, 'structureWood', face, u, (floorY + lowY) / 2, depth - 0.12, 0.16, lowY - floorY, 0.16, { colour: WHITE });
  }
  // the beam along the posts' heads: sagging over a fallen post
  for (let i = 0; i < bays; i++) {
    const u0 = -width / 2 + (width) * i / bays, u1 = -width / 2 + width * (i + 1) / bays;
    const sagA = fallen.has(i) ? 0.55 : 0, sagB = fallen.has(i + 1) ? 0.55 : 0;
    const a: [number, number, number] = [face.origin[0] + face.u[0] * u0 + face.out[0] * (depth - 0.12), lowY - sagA, face.origin[2] + face.u[2] * u0 + face.out[2] * (depth - 0.12)];
    const b: [number, number, number] = [face.origin[0] + face.u[0] * u1 + face.out[0] * (depth - 0.12), lowY - sagB, face.origin[2] + face.u[2] * u1 + face.out[2] * (depth - 0.12)];
    bar(sink, 'structureWood', a, b, 0.18, { colour: WHITE });
    // the balustrade between the posts (the front's middle bay left open for the steps)
    if (!(i === Math.floor(bays / 2) && face.out[2] > 0.5)) {
      faceBox(sink, 'structureWood', face, (u0 + u1) / 2, floorY + 0.9, depth - 0.12, u1 - u0 - 0.2, 0.08, 0.08, { colour: WHITE, decor: true });
      for (let u = u0 + 0.3; u < u1 - 0.2; u += 0.32) faceBox(sink, 'structureWood', face, u, floorY + 0.5, depth - 0.12, 0.05, 0.75, 0.05, { colour: WHITE, decor: true, fine: true });
    }
    // the lean-to's bay: its tin over rafters, or the rafters alone where the siege stripped it
    const rise = wallTop - lowY + 0.25;
    for (let r = 0; r <= 3; r++) {
      const u = u0 + (u1 - u0) * r / 3;
      const p0: [number, number, number] = [face.origin[0] + face.u[0] * u, wallTop + 0.05, face.origin[2] + face.u[2] * u];
      const p1: [number, number, number] = [p0[0] + face.out[0] * (depth + 0.25), wallTop + 0.05 - rise, p0[2] + face.out[2] * (depth + 0.25)];
      bar(sink, 'structureWood', p0, p1, 0.08, { colour: RAFTER, decor: true, ...(stripped.has(i) ? {} : { fine: true }) });
    }
    if (!stripped.has(i)) {
      const spec: RoofSpec = { kind: 'shed', pitchDeg: Math.max(6, Math.atan2(rise, depth) * 180 / Math.PI), eave: 0.3, verge: 0.05, thickness: 0.06, bucket: 'structureMetal' };
      const rg = roofGeometry(depth, u1 - u0, wallTop + 0.1 - rise, spec);
      const yaw = Math.atan2(-face.out[2], face.out[0]);
      const um = (u0 + u1) / 2;
      sink.placed(yaw, face.origin[0] + face.u[0] * um + face.out[0] * depth / 2, 0, face.origin[2] + face.u[2] * um + face.out[2] * depth / 2,
        () => emitRoof(sink, rg, spec, roofColour));
    }
  }
}

/**
 * The Deputy Commissioner's bungalow (plan.ts colonialBungalow): see the module's note.
 */
export const colonialBungalow: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const rng = ctx.rng;
  const W = Math.max(10, Number(ctx.params.width)), D = Math.max(8, Number(ctx.params.depth)), V = Math.max(1.8, Number(ctx.params.veranda));
  const damage = Math.max(0, Math.min(1, Number(ctx.params.damage)));
  const roofColour = TIN[Math.floor(ctx.variant() * TIN.length) % TIN.length];
  const plinth = 0.9, storey = 3.7;
  const style: WindowStyle = { frame: GREEN_TRIM, frameWidth: 0.08, frameOut: 0.05, bars: 'six', surround: null, sill: { bucket: 'plaster', out: 0.06 },
    shutters: { colour: GREEN_TRIM, kind: 'louvred', closed: 0.15 } };
  const openings: Opening[] = [
    { face: 'front', storey: 0, kind: 'door', u: 0, w: 1.6, y0: 0, h: 2.6 },
    { face: 'back', storey: 0, kind: 'door', u: W * 0.2, w: 1.2, y0: 0, h: 2.4 },
  ];
  for (const face of ['front', 'left', 'right', 'back'] as const) {
    const width = face === 'front' || face === 'back' ? W : D;
    const avoid: Array<[number, number]> = face === 'front' ? [[-1.3, 1.3]] : face === 'back' ? [[W * 0.2 - 1, W * 0.2 + 1]] : [];
    for (const o of windowRhythm(face, 0, width, { w: 1.2, h: 1.9, sill: 0.7, spacing: 2.6, margin: 1.1, avoid })) openings.push(o);
  }
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, style, rng, 0.4),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: GREEN_TRIM, frame: { bucket: 'structureWood', width: 0.12, out: 0.05, colour: WHITE }, transom: true, steps: { bucket: 'stone' }, leafKind: 'glazed' }, y0 + o.y0),
  };
  // its age (round 2, gauntlet wave 157: "a clean, believable model … no sign of age"): the house grammar's own wear,
  // drawn from the piece's age stream — burnt and boarded windows, a roof patch stripped, the render spalled to the
  // plinth's stone — as much as the siege's damage
  const age = ctx.age;
  const wear = age ? { amount: Math.max(0.25, damage), rng: () => age(), spall: () => age() } : null;
  const frame = withWear(wear, () => buildHouse(sink, {
    w: W, d: D, plinth: { h: plinth, out: 0.12, bucket: 'stone' }, storeys: [{ h: storey, wall: 'plaster' }],
    roof: tin(26, 'hip'), roofColour, gableBucket: 'plaster', openings,
    chimneys: [{ x: -W * 0.28, z: -D * 0.18, sx: 0.7, sz: 0.7, above: 1.0, bucket: 'stone', cap: 'slab' },
      { x: W * 0.3, z: D * 0.12, sx: 0.7, sz: 0.7, above: 1.0, bucket: 'stone', cap: 'slab' }],
    gutters: null, verge: null, spall: age ? 'stone' : null,
  }, dialect));
  // the verandas on the front and both ends; the siege's damage along the front from its left corner
  const stripRun = Math.round(damage * 3);
  const frontBays = Math.max(2, Math.round(W / 2.4));
  const stripped = new Set(Array.from({ length: stripRun }, (_, i) => i));
  const fallen = new Set(damage >= 0.35 ? [1] : []);
  verandaRun(sink, frame.faces.front, plinth, frame.eaveY - 0.05, W, V, roofColour, stripped, fallen);
  verandaRun(sink, frame.faces.left, plinth, frame.eaveY - 0.05, D, V, roofColour, new Set(damage >= 0.6 ? [Math.max(0, Math.round(D / 2.4) - 1)] : []), new Set());
  verandaRun(sink, frame.faces.right, plinth, frame.eaveY - 0.05, D, V, roofColour, new Set(), new Set());
  void frontBays;
  // the porch: a gabled bay over the front steps on four posts, its pediment boarded white
  const f = frame.faces.front;
  const porchW = 3.6, porchD = V + 2.4;
  for (const su of [-1, 1]) for (const out of [V + 0.2, porchD - 0.15]) {
    faceBox(sink, 'structureWood', f, su * (porchW / 2 - 0.12), (plinth + frame.eaveY - 0.3) / 2, out, 0.2, frame.eaveY - 0.3 - plinth, 0.2, { colour: WHITE });
  }
  faceBox(sink, 'stone', f, 0, plinth / 2 - 0.2, porchD - 0.9, porchW + 0.4, plinth + 0.4, 2.2);
  for (let k = 0; k < 4; k++) faceBox(sink, 'stone', f, 0, plinth - 0.22 * (k + 1) + 0.11, porchD + 0.3 + k * 0.32, porchW, 0.22, 0.34, { decor: true });
  const porchRoof: RoofSpec = { kind: 'gable', pitchDeg: 32, eave: 0.35, verge: 0.3, thickness: 0.06, bucket: 'structureMetal', ridge: 'saddle' };
  const prg = roofGeometry(porchW, porchD - V + 0.4, frame.eaveY - 0.3, porchRoof);
  const yawF = Math.atan2(f.out[0], f.out[2]);
  const pc = [f.origin[0] + f.out[0] * (V + (porchD - V) / 2), f.origin[2] + f.out[2] * (V + (porchD - V) / 2)];
  sink.placed(yawF, pc[0], 0, pc[1], () => emitRoof(sink, prg, porchRoof, roofColour));
  // the scorching over the windows (the render's own bucket darkened by the kit weathering; a coloured box in the
  // plaster bucket drew no soot at all), heavier with the damage
  if (damage > 0) {
    const scorched = openings.filter((o) => o.kind === 'window').filter((_, i) => i % 3 === 0 || damage > 0.7);
    for (const o of scorched) sootOver(sink, 'plaster', frame.faces[o.face], o.u, plinth + o.y0 + o.h, o.w, 1.3, { depth: 0.55 + 0.3 * damage });
  }
  return { parts: sink.finish(), tints: { plaster: [1.02, 1.0, 0.95] } };
};

/**
 * The terraced tennis court (plan.ts tennisCourt): see the module's note. The piece's frame: the court's long axis
 * along z, its net across at z = 0; y = 0 the lowest ground under the terrace.
 *
 * Round 2 (2026-10-06; gauntlet wave 157: "a free-standing red slab on sheer beige plinth walls perched on an untouched
 * grass slope, with no steps, path or garden", its wall "a modern-looking stamped concrete-block texture"): the terrace
 * is made ground — the court level with its uphill edge, its sides falling to the slope in banks of rough grass, a low
 * dry-stone wall along its edge where the bank falls, a flight of stone steps down the bank toward the bungalow (`steps`:
 * the side, -1 the court's -x side, +1 its +x side, 0 none) with a gap in the wall and the wire for them, the clay worn
 * to the earth along the base lines and round the net, shell holes and the siege's trench across it.
 */
export const tennisCourt: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = 36.6, Wt = 18.3, damage = Math.max(0, Math.min(1, Number(ctx.params.damage)));
  const stepSide = Math.sign(Number(ctx.params.steps) || 0);
  const g = (x: number, z: number) => (ctx.ground ? ctx.ground(x, z) : 0);
  // the terrace's level: the highest ground under it (its uphill edge flush), 15 cm proud
  let top = 0;
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 4; j++) top = Math.max(top, g(-Wt / 2 + Wt * j / 4, -L / 2 + L * i / 6));
  top += 0.15;
  // the terrace: the clay's bed and the court's surface on it
  sink.span('stone', -Wt / 2, top - 0.6, -L / 2, Wt / 2, top - 0.12, L / 2, { decor: true });
  sink.span('plaster', -Wt / 2, top - 0.12, -L / 2, Wt / 2, top, L / 2);
  // the clay worn to the earth behind the base lines, round the net posts and along the side lines (dressing)
  const CL = 23.77 / 2, CW = 10.97 / 2, SW = 8.23 / 2, SV = 6.4, lw = 0.05;
  const worn = (x0: number, z0: number, x1: number, z1: number) => sink.span('plaster3', x0, top, z0, x1, top + 0.006, z1, { decor: true });
  for (const sz of [-1, 1]) worn(-2.6, sz * (CL + 0.2), 2.6, sz * (CL + 2.8));
  for (const sx of [-1, 1]) worn(sx * (CW + 0.5) - 0.8, -1.2, sx * (CW + 0.5) + 0.8, 1.2);
  // the lines (a doubles court 23.77 × 10.97 m, its singles side lines, the service lines and the centre line), faded
  const line = (x0: number, z0: number, x1: number, z1: number) => sink.span('structureWood', Math.min(x0, x1) - lw, top, Math.min(z0, z1) - lw, Math.max(x0, x1) + lw, top + 0.012, Math.max(z0, z1) + lw, { colour: LINE_WHITE, decor: true });
  for (const sx of [-1, 1]) { line(sx * CW, -CL, sx * CW, CL); line(sx * SW, -CL, sx * SW, CL); }
  for (const sz of [-1, 1]) { line(-CW, sz * CL, CW, sz * CL); line(-SW, sz * SV, SW, sz * SV); }
  line(0, -SV, 0, SV);
  // the net and its posts (the net's band, sagging to its middle)
  for (const sx of [-1, 1]) sink.span('structureMetal', sx * (CW + 0.9) - 0.05, top, -0.05, sx * (CW + 0.9) + 0.05, top + 1.07, 0.05, { colour: IRON });
  for (let k = 0; k < 8; k++) {
    const x0 = -(CW + 0.9) + (2 * CW + 1.8) * k / 8, x1 = x0 + (2 * CW + 1.8) / 8;
    const sag = (x: number) => 0.16 * (1 - (x / (CW + 0.9)) ** 2);
    sink.span('structureWood', x0, top + 0.05, -0.012, x1, top + 1.0 - Math.max(sag(x0), sag(x1)), 0.012, { colour: NET, decor: true, fine: k % 2 === 1 });
  }
  // the banks: from the terrace's edge down to the slope at about 40 degrees, trodden earth (plaster3), sampled every
  // 2 m along each side; the corners fan between their two sides' last samples
  const BANK = 1.2, edgeOut = 0.5, bankMax = Math.max(0.5, Number(ctx.params.bank) || 4);
  type Side = { a: [number, number]; b: [number, number]; n: [number, number] };
  const sideList: Side[] = [
    { a: [Wt / 2, -L / 2], b: [Wt / 2, L / 2], n: [1, 0] }, { a: [-Wt / 2, L / 2], b: [-Wt / 2, -L / 2], n: [-1, 0] },
    { a: [Wt / 2, L / 2], b: [-Wt / 2, L / 2], n: [0, 1] }, { a: [-Wt / 2, -L / 2], b: [Wt / 2, -L / 2], n: [0, -1] },
  ];
  const movement: SimpleCollisionShape[] = [];
  for (const side of sideList) {
    const len = Math.hypot(side.b[0] - side.a[0], side.b[1] - side.a[1]), ux = (side.b[0] - side.a[0]) / len, uz = (side.b[1] - side.a[1]) / len;
    const n = Math.max(2, Math.round(len / 2));
    let reach = 0;
    const inner: Array<[number, number, number]> = [], outer: Array<[number, number, number]> = [];
    for (let k = 0; k <= n; k++) {
      const t = len * k / n, ex = side.a[0] + ux * t + side.n[0] * edgeOut, ez = side.a[1] + uz * t + side.n[1] * edgeOut;
      // the bank's foot: where the slope meets the fall from the terrace's level at the bank's angle
      let d = 0.3;
      for (let it = 0; it < 4; it++) d = Math.min(bankMax, Math.max(0.3, (top - g(ex + side.n[0] * d, ez + side.n[1] * d)) * BANK));
      reach = Math.max(reach, d);
      inner.push([ex, top - 0.02, ez]);
      outer.push([ex + side.n[0] * d, g(ex + side.n[0] * d, ez + side.n[1] * d) - 0.15, ez + side.n[1] * d]);
    }
    for (let k = 0; k < n; k++) {
      // counter-clockwise seen from above and outside: along the terrace's edge, then down to the foot
      sink.quad('plaster2', inner[k], inner[k + 1], outer[k + 1], outer[k], { decor: true });
    }
    // the low dry-stone wall along the edge where the bank falls more than half a metre (a gap for the steps)
    const fall = Math.max(...outer.map((p) => top - p[1]));
    if (fall > 0.6) {
      // (for the stepped side, the wall leaves a gap over the flight at the net line)
      const spans: Array<[number, number]> = stepSide !== 0 && side.n[0] === stepSide ? [[0, len / 2 - 1.3], [len / 2 + 1.3, len]] : [[0, len]];
      for (const [t0, t1] of spans) {
        const ax = side.a[0] + ux * t0, az = side.a[1] + uz * t0, bx = side.a[0] + ux * t1, bz = side.a[1] + uz * t1;
        const nx = side.n[0], nz = side.n[1];
        sink.span('stone', Math.min(ax, bx) + Math.min(0, nx * 0.5), top - 0.4, Math.min(az, bz) + Math.min(0, nz * 0.5),
          Math.max(ax, bx) + Math.max(0, nx * 0.5), top + 0.62, Math.max(az, bz) + Math.max(0, nz * 0.5), { decor: true });
      }
    }
    // the bank's footprint a hull meets from below (its foot to the terrace's edge)
    const cxs = (side.a[0] + side.b[0]) / 2 + side.n[0] * (edgeOut + reach) / 2, czs = (side.a[1] + side.b[1]) / 2 + side.n[1] * (edgeOut + reach) / 2;
    const lowest = Math.min(...outer.map((p) => p[1]));
    if (top - lowest > 0.35) {
      movement.push({ kind: 'obb', cx: cxs, cz: czs, hw: side.n[0] !== 0 ? (edgeOut + reach) / 2 : len / 2, hl: side.n[0] !== 0 ? len / 2 : (edgeOut + reach) / 2,
        yaw: 0, y0: lowest - 0.3, y1: top });
    }
  }
  // the corners' fans between their sides' end samples (a quarter cone of earth)
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
    const cx = sx * (Wt / 2 + edgeOut), cz = sz * (L / 2 + edgeOut);
    const pts: Array<[number, number, number]> = [];
    for (let k = 0; k <= 4; k++) {
      const a = Math.atan2(sz, 0) * 0 + (sx > 0 ? 0 : Math.PI) + (sx > 0 === sz > 0 ? 1 : -1) * (Math.PI / 2) * k / 4;
      const nx = Math.cos(a), nz = Math.sin(a);
      let d = 0.3;
      for (let it = 0; it < 4; it++) d = Math.min(bankMax, Math.max(0.3, (top - g(cx + nx * d, cz + nz * d)) * BANK));
      pts.push([cx + nx * d, g(cx + nx * d, cz + nz * d) - 0.15, cz + nz * d]);
    }
    for (let k = 0; k < 4; k++) {
      const tri = [[cx, top - 0.02, cz] as [number, number, number], pts[k], pts[k + 1]];
      // wind each triangle to face up and out
      const ux1 = tri[1][0] - tri[0][0], uz1 = tri[1][2] - tri[0][2], ux2 = tri[2][0] - tri[0][0], uz2 = tri[2][2] - tri[0][2];
      sink.polygon('plaster2', ux1 * uz2 - uz1 * ux2 < 0 ? tri : [tri[0], tri[2], tri[1]], { decor: true });
    }
  }
  // the flight of stone steps down the bank on the stepped side, at the net line
  if (stepSide !== 0) {
    const x0 = stepSide * (Wt / 2 + edgeOut);
    let y = top, x = x0, k = 0;
    while (y - g(x + stepSide * 0.35, 0) > 0.1 && k < 24) {
      const tread = 0.36, rise = Math.min(0.19, y - g(x + stepSide * tread, 0));
      sink.span('stone', Math.min(x, x + stepSide * tread), y - rise - 0.25, -0.9, Math.max(x, x + stepSide * tread), y - rise + 0.02, 0.9, { decor: true });
      x += stepSide * tread; y -= rise; k++;
    }
  }
  // the fence: posts every 3 m round the terrace, rails and the wire's bands (a run torn down with the damage; open
  // over the steps)
  const torn = damage > 0 ? Math.round(2 + damage * 4) : 0;
  const ring: Array<[number, number]> = [];
  const perimeter = [[-Wt / 2, -L / 2], [Wt / 2, -L / 2], [Wt / 2, L / 2], [-Wt / 2, L / 2]] as const;
  for (let e = 0; e < 4; e++) {
    const [ax, az] = perimeter[e], [bx, bz] = perimeter[(e + 1) % 4], n = Math.round(Math.hypot(bx - ax, bz - az) / 3);
    for (let k = 0; k < n; k++) ring.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  const overSteps = (x: number, z: number, nx: number, nz: number) => stepSide !== 0 && Math.sign(x) === stepSide && Math.abs(Math.abs(x) - Wt / 2) < 0.01
    && Math.abs(nx - x) < 0.01 && Math.min(z, nz) < 1.5 && Math.max(z, nz) > -1.5;
  for (let k = 0; k < ring.length; k++) {
    const [x, z] = ring[k], [nx, nz] = ring[(k + 1) % ring.length];
    const down = k >= ring.length / 2 && k < ring.length / 2 + torn;
    if (down) { bar(sink, 'structureMetal', [x, top + 0.1, z], [x + (nx - x) * 0.4, top + 0.25, z + (nz - z) * 0.4 + 0.6], 0.06, { colour: POST_GREEN, decor: true }); continue; }
    sink.span('structureMetal', x - 0.04, top - 0.3, z - 0.04, x + 0.04, top + 3.0, z + 0.04, { colour: POST_GREEN });
    if (overSteps(x, z, nx, nz)) continue;
    if (!(k + 1 >= ring.length / 2 && k + 1 < ring.length / 2 + torn)) {
      for (const y of [0.1, 1.5, 2.95]) bar(sink, 'structureMetal', [x, top + y, z], [nx, top + y, nz], 0.035, { colour: POST_GREEN, decor: true, fine: y === 1.5 });
      // the wire's mesh: five strands of a grey veil at a distance
      for (const y of [0.45, 0.8, 1.15, 1.85, 2.2, 2.55]) bar(sink, 'structureMetal', [x, top + y, z], [nx, top + y, nz], 0.012, { colour: shade(POST_GREEN, 0.7), decor: true, fine: true });
    }
  }
  // the siege on the court: the trench dug across its far half (a dark cut and its spoil) and shell holes
  if (damage > 0) {
    const zt = L * 0.22;
    for (let k = 0; k < 5; k++) {
      const x0 = -Wt / 2 + 1 + (Wt - 2) * k / 5, x1 = x0 + (Wt - 2) / 5, dz = (k % 2 ? 0.9 : -0.9) * damage;
      sink.span('structureWood', x0, top + 0.002, zt + dz - 0.45, x1, top + 0.015, zt + dz + 0.45, { colour: SOOT, decor: true });
      sink.span('plaster3', x0, top, zt + dz + 0.5, x1, top + 0.35, zt + dz + 1.2, { decor: true });
    }
    for (const [hx, hz, r] of [[-4.2, -9.5, 1.3], [5.1, -2.6, 0.9], [-2.0, 14.5, 1.1]] as const) {
      const ring2: Array<[number, number, number]> = [];
      for (let i = 0; i < 10; i++) { const a = -i / 10 * Math.PI * 2; ring2.push([hx + Math.cos(a) * r, top + 0.008, hz + Math.sin(a) * r]); }
      sink.polygon('structureWood', ring2, { colour: shade(SOOT, 1.4), decor: true });
    }
  }
  // the terrace's movement record: a standable floor in panels a metre deep under the clay, the banks a hull meets from
  // below, and the net's posts
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
    movement.push({ kind: 'obb', cx: -Wt / 4 + Wt / 2 * j, cz: -L / 2 + L / 8 + L / 4 * i, hw: Wt / 4, hl: L / 8, yaw: 0, y0: top - 1.0, y1: top });
  }
  for (const sx of [-1, 1]) movement.push({ kind: 'obb', cx: sx * (CW + 0.9), cz: 0, hw: 0.05, hl: 0.05, yaw: 0, y0: top, y1: top + 1.07 });
  // the court's clay (the plaster bucket in the clay's colour) and the trodden earth of its banks and worn patches
  // (the banks in plaster2: rough grass gone to earth in patches, the hill's own green; the worn clay and the spoil in plaster3)
  return { parts: sink.finish(), movement, tints: { plaster: [CLAY[0] * 1.5, CLAY[1] * 1.5, CLAY[2] * 1.5], plaster2: [0.5, 0.56, 0.36], plaster3: [0.62, 0.5, 0.38] } };
};
