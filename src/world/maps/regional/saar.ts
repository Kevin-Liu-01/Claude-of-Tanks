// src/world/maps/regional/saar.ts — the Saar ironworks kit (Ironworks: the Völklingen ironworks on the Saar, fought over
// in March 1945). The works' iron and brick: the blast furnaces in their row — each furnace shaft banded in steel above
// its casting house, the Cowper stoves beside it under their domes, the bustle pipe and the hot-blast main, the uptakes
// and the downcomer at its top, the inclined skip hoist up from the ore bunkers; the rolling mills' long brick halls
// under sawtooth north lights, and among them the column-guided gas holders; conveyor galleries on lattice trestles;
// the colliery's headframe over its shaft hall with the winding-engine house behind it (the Saar coalfield at the works'
// gate); the works office in brick with yellow-brick bands under slate. The workers' terraces, the station, the water
// towers, the stacks and the shelled brick shells are the Ruhr kit's (ruhr.ts): the same coalfield brick.
import { PartSink, alongPlot, faceBox, facePanel, rgb, shade, type Face, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, windowRhythm, type HouseDialect, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { RUHR_BUILDERS } from './ruhr.ts';
import { factoryStack } from './shared.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

const YELLOW_BRICK = 'plaster2' as const;
/** The works' steel: furnace plate rusted brown-grey, the stoves' darker shells, the trusses' oxide red, the sheet's grey. */
const PLATE = rgb(0x544840), STOVE = rgb(0x46403b), OXIDE = rgb(0x6a3f2e), TRUSS = rgb(0x3a3532), SHEET = rgb(0x6e7272);
const HOLDER = rgb(0x5c6a63), FRAME = rgb(0xc8c2b4), DOOR = rgb(0x3e4e44), IRON = rgb(0x2d2f30);
const WINDOW: WindowStyle = { frame: FRAME, frameWidth: 0.07, frameOut: 0.05, bars: 'six', surround: { bucket: YELLOW_BRICK, width: 0.14, out: 0.05, lintel: 0.26 }, sill: { bucket: 'stone', out: 0.1 }, shutters: null };
const HALL_WINDOW: WindowStyle = { ...WINDOW, frame: rgb(0x4a4f4e), bars: 'six' };

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

function dialect(rng: () => number, style: WindowStyle = WINDOW): HouseDialect {
  return {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, style, rng, 0.3),
    door: (s, face, o, y0) => {
      if (o.kind === 'gate') { gateUnit(s, face, o.u, y0 + o.y0, o.w, o.h, shade(DOOR, 0.9), { bucket: YELLOW_BRICK, width: 0.26, out: 0.08 }); return; }
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: DOOR, frame: { bucket: YELLOW_BRICK, width: 0.18, out: 0.06, arch: true }, transom: true, steps: { bucket: 'stone' }, leafKind: 'panel' }, y0 + o.y0);
    },
  };
}

/** A steel ring band round a cylinder at height y (decor). */
function ring(sink: PartSink, x: number, y: number, z: number, r: number, h = 0.3, colour: Rgb = TRUSS): void {
  sink.cylinder('structureMetal', [x, y, z], 'y', h, r + 0.06, 12, { colour, decor: true }, r + 0.06, false);
}

/** A lattice member chain: two chords from a to b, braced in a zigzag (decor steel). */
function truss(sink: PartSink, a: Vec3, b: Vec3, width: number, up: Vec3, panels: number, colour: Rgb, mobile: boolean): void {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  // the side axis: across the truss, square to its run and to `up`
  const t: Vec3 = [dx / len, dy / len, dz / len];
  let sx = t[1] * up[2] - t[2] * up[1], sy = t[2] * up[0] - t[0] * up[2], sz = t[0] * up[1] - t[1] * up[0];
  const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
  const off = (p: Vec3, k: number): Vec3 => [p[0] + sx * k, p[1] + sy * k, p[2] + sz * k];
  const c = { colour, decor: true, exposed: true } as const;
  for (const k of [-width / 2, width / 2]) sink.member('structureMetal', off(a, k), off(b, k), 0.16, 0.16, up, c, 0);
  if (mobile) return;
  for (let i = 0; i < panels; i++) {
    const p0: Vec3 = [a[0] + dx * i / panels, a[1] + dy * i / panels, a[2] + dz * i / panels];
    const p1: Vec3 = [a[0] + dx * (i + 1) / panels, a[1] + dy * (i + 1) / panels, a[2] + dz * (i + 1) / panels];
    sink.member('structureWood', off(p0, -width / 2), off(p1, width / 2), 0.08, 0.08, up, { ...c, fine: true }, 0);
    sink.member('structureWood', off(p1, -width / 2), off(p1, width / 2), 0.08, 0.08, up, { ...c, fine: true }, 0);
  }
}

/**
 * The lot a works building fills: the base's measured reach (ctx.bounds) inset by `inset`, its street edge held to
 * `front` (the map-revival lanes' coverage rule, 2026-10-05: a kit body as wide and deep as the building it replaces, so
 * no lane opens beside it). Every builder centres its body on the fill's centre.
 */
interface Fill { w: number; d: number; cx: number; cz: number }
function fillOf(ctx: RegionalBuildContext, inset = 0.1, front = Infinity): Fill {
  const b = ctx.bounds;
  const x0 = b.minX + inset, x1 = b.maxX - inset, z0 = b.minZ + inset, z1 = Math.min(b.maxZ, front) - inset;
  return { w: x1 - x0, d: z1 - z0, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}

// ------------------------------------------------------------------------------------------------ the blast furnace

/**
 * A blast furnace unit: the ore and coke bunkers across the plot's front, the inclined skip hoist from their pit up to
 * the furnace's top; the brick casting house round the furnace's foot, the shaft banded in steel to the charging
 * platform, the uptakes and the downcomer over it; two Cowper stoves under their domes at the back, the hot-blast main
 * and the bustle pipe.
 */
const blastFurnace: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  const f = fillOf(ctx);
  const W = Math.max(6.4, f.w), D = Math.max(9, f.d);
  const fr = Math.min(3.3, W * 0.28), fz = -D * 0.05, fh = Math.max(18, Math.min(30, D * 1.5)) + rng() * 2;
  const sr = Math.min(2.5, (W - 1) / 4.4), sh = fh * 0.86;
  const stz = -D / 2 + sr;
  // the bunkers: a brick substructure with its wagon arches the plot's width, the steel bins over it
  const bd = Math.max(2.6, Math.min(4.5, D * 0.16)), bz0 = D / 2 - bd, bh = 4.2;
  // the casting house round the furnace's foot (its sheet roof's eaves on the lot's sides), clear of the stoves
  const ch = 7.5, cz1 = Math.min(bz0 - 0.4, fz + fr + 3.0), cz0 = Math.min(cz1 - 4, Math.max(fz - fr - 2.2, stz + sr + 0.4));
  sink.placed(0, f.cx, 0, f.cz, () => {
    const openings: Opening[] = [{ face: 'left', storey: 0, kind: 'gate', u: 0, w: Math.min(3.2, (cz1 - cz0) * 0.4), y0: 0, h: 3.6 }];
    for (const o of windowRhythm('right', 0, cz1 - cz0, { w: 1.1, h: 2.6, sill: 3.4, spacing: 2.4, margin: 1.0 })) openings.push(o);
    for (const o of windowRhythm('front', 0, W - 1.0, { w: 1.1, h: 2.6, sill: 3.4, spacing: 2.6, margin: 1.2, max: 4 })) openings.push(o);
    sink.placed(0, 0, 0, (cz0 + cz1) / 2, () => {
      const frame = buildHouse(sink, {
        w: W - 1.0, d: cz1 - cz0, plinth: { h: 0.4, out: 0.05, bucket: 'stone' }, storeys: [{ h: ch, wall: 'stone' }],
        roof: { kind: 'gable', pitchDeg: 18, eave: 0.4, verge: 0.3, thickness: 0.12, bucket: 'roof', ridge: 'saddle' }, gableBucket: 'stone', openings,
        chimneys: [], gutters: null, verge: null, reveal: 0.3, rafters: null, spall: null,
      }, dialect(rng, HALL_WINDOW));
      sink.band(YELLOW_BRICK, frame.bodies[0].x0 - 0.04, ch - 0.6, frame.bodies[0].z0 - 0.04, frame.bodies[0].x1 + 0.04, ch - 0.35, frame.bodies[0].z1 + 0.04, { decor: true });
    });
    // the furnace: hearth, bosh and stack, banded; the charging platform and the bell house on top
    sink.cylinder('structureMetal', [0, -0.4, fz], 'y', ch + 1.6, fr, 12, { colour: PLATE }, fr * 1.05, true);
    sink.cylinder('structureMetal', [0, ch + 1.2, fz], 'y', fh - ch - 1.2, fr * 1.05, 12, { colour: PLATE }, fr * 0.72, true);
    if (!mobile) for (let y = ch + 2.4; y < fh - 1; y += 2.2) ring(sink, 0, y, fz, fr * (1.05 - 0.33 * (y - ch) / (fh - ch)), 0.25);
    const top = fh;
    sink.span('structureMetal', -fr * 0.72 - 0.7, top, fz - fr * 0.72 - 0.7, fr * 0.72 + 0.7, top + 0.3, fz + fr * 0.72 + 0.7, { colour: TRUSS, decor: true });
    sink.span('structureMetal', -1.2, top + 0.3, fz - 1.2, 1.2, top + 2.8, fz + 1.2, { colour: SHEET, decor: true });
    // the uptakes rising off the top, joined over it, the downcomer falling to the dust catcher at the casting house's side
    for (const [ux, uz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      sink.member('structureMetal', [ux * fr * 0.5, top - 0.5, fz + uz * fr * 0.5], [ux * 0.6, top + 5.6, fz + uz * 0.6], 0.5, 0.5, [0, 0, 1], { colour: PLATE, decor: true, exposed: true }, 0);
    }
    const dcx = -W / 2 + 1.6, dcz = cz0 + 1.4;
    sink.member('structureMetal', [0, top + 5.7, fz], [dcx, ch + 4.5, dcz], 0.7, 0.7, [0, 0, 1], { colour: PLATE, decor: true, exposed: true }, 0);
    sink.cylinder('structureMetal', [dcx, ch + 0.5, dcz], 'y', 4.2, 1.2, 10, { colour: STOVE, decor: true }, 1.2);
    sink.cylinder('structureMetal', [dcx, ch - 1.5, dcz], 'y', 2.0, 0.3, 8, { colour: STOVE, decor: true }, 1.2, false);
    // the Cowper stoves behind the furnace, domed, the hot-blast main to the bustle pipe round the furnace
    for (const s of [-1, 1]) {
      const sx = s * (sr + 0.3);
      sink.cylinder('structureMetal', [sx, -0.4, stz], 'y', sh + 0.4, sr, 12, { colour: STOVE });
      // the dome: three frusta closing over the shell
      let dy = sh;
      for (const [a, b, h] of [[1, 0.86, 0.32], [0.86, 0.52, 0.32], [0.52, 0.06, 0.26]] as const) {
        sink.cylinder('structureMetal', [sx, dy, stz], 'y', sr * h, sr * a, 12, { colour: STOVE, decor: true }, sr * b, true);
        dy += sr * h;
      }
      if (!mobile) for (let y = 3; y < sh - 1; y += 3.5) ring(sink, sx, y, stz, sr, 0.2);
    }
    sink.member('structureMetal', [-(sr + 0.3), 9.5, stz + sr], [0, 9.5, fz - fr - 0.4], 1.0, 1.0, [0, 1, 0], { colour: OXIDE, decor: true, exposed: true }, 0);
    for (let k = 0; k < 8; k++) {
      const a0 = k / 8 * Math.PI * 2, a1 = (k + 1) / 8 * Math.PI * 2, rr = fr + 1.0;
      sink.member('structureMetal', [Math.cos(a0) * rr, 9.0, fz + Math.sin(a0) * rr], [Math.cos(a1) * rr, 9.0, fz + Math.sin(a1) * rr], 0.7, 0.7, [0, 1, 0],
        { colour: OXIDE, decor: true, exposed: true }, 0);
    }
    // the bunkers and their bins; the wagon arches through them
    sink.span('stone', -W / 2, -0.4, bz0, W / 2, bh, D / 2);
    sink.span('structureMetal', -W / 2 + 0.3, bh, bz0 + 0.3, W / 2 - 0.3, bh + 2.6, D / 2 - 0.3, { colour: SHEET });
    sink.span('structureMetal', -W / 2 + 0.2, bh + 2.6, bz0 + 0.2, W / 2 - 0.2, bh + 2.8, D / 2 - 0.2, { colour: TRUSS, decor: true });
    sink.band(YELLOW_BRICK, -W / 2 - 0.04, bh - 0.5, bz0 - 0.04, W / 2 + 0.04, bh - 0.25, D / 2 + 0.04, { decor: true });
    const arches = Math.max(2, Math.round(W / 4.2));
    for (const [z, out] of [[D / 2, 1], [bz0, -1]] as const) {
      const bf: Face = { origin: [0, 0, z], u: [out, 0, 0], out: [0, 0, out], width: W };
      for (let k = 0; k < arches; k++) facePanel(sink, 'dark', bf, -W / 2 + W * (k + 0.5) / arches, 1.6, 0.02, Math.min(2.8, W / arches - 0.9), 3.0, { decor: true });
    }
    // the skip hoist: an inclined bridge from the bunkers' pit up to the charging platform, on its trestle
    const za = (bz0 + D / 2) / 2, ya = bh + 2.8, zb = fz + fr * 0.72 + 0.7, yb = top + 0.6;
    truss(sink, [0, ya, za], [0, yb, zb], 1.6, [0, 1, 0], 10, OXIDE, mobile);
    const zl = za - (za - zb) * 0.4, yl = ya + (yb - ya) * 0.4;
    for (const s of [-1, 1]) sink.member('structureMetal', [s * 0.8, 0, zl], [s * 0.8, yl, zl], 0.3, 0.3, [0, 0, 1], { colour: TRUSS, exposed: true }, 0);
    if (look() < 0.5) facePanel(sink, 'dark', { origin: [(W - 1) / 2, 0, (cz0 + cz1) / 2], u: [0, 0, -1], out: [1, 0, 0], width: cz1 - cz0 }, (look() - 0.5) * 3, ch * 0.6, 0.02, 1.6, 1.2, { decor: true });
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the halls

/**
 * A sawtooth hall: brick walls with tall segmental windows, the roof in north-light teeth across the hall (each tooth's
 * slope of sheet and its glazed upright), laid along the lot's long side and filling it.
 */
function sawtoothHall(ctx: RegionalBuildContext, wallH: number, toothMax: number): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile';
  const f = fillOf(ctx);
  const turned = f.w > f.d + 1;
  // (the parapet roof overhangs its walls by 0.05 m: the walls stand in by that)
  const W = Math.max(5, (turned ? f.d : f.w) - 0.1), D = Math.max(7, (turned ? f.w : f.d) - 0.1);
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'gate', u: 0, w: Math.min(4, W * 0.36), y0: 0, h: Math.min(4.4, wallH * 0.62) }];
  for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, D, { w: 1.4, h: wallH * 0.42, sill: wallH * 0.32, spacing: 3.2, margin: 1.4 })) openings.push(o);
  openings.push({ face: 'back', storey: 0, kind: 'door', u: W * 0.25, w: 1.1, y0: 0, h: 2.3 });
  sink.placed(0, f.cx, 0, f.cz, () => alongPlot(sink, turned, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.4, out: 0.05, bucket: 'stone' }, storeys: [{ h: wallH, wall: 'stone' }],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.05, verge: 0.05, thickness: 0.18, bucket: 'stone', parapet: 0.6 }, gableBucket: 'stone', openings,
      chimneys: [], gutters: null, verge: null, reveal: 0.3, rafters: null, spall: null,
    }, dialect(rng, HALL_WINDOW));
    const b = frame.bodies[0], y0 = frame.eaveY + 0.18;
    sink.band(YELLOW_BRICK, b.x0 - 0.04, wallH - 1.0, b.z0 - 0.04, b.x1 + 0.04, wallH - 0.75, b.z1 + 0.04, { decor: true });
    // the teeth along the hall: each a sheet slope rising toward +z and its glazed upright facing -z (the north light)
    const teeth = Math.max(2, Math.min(toothMax, Math.round(D / 4.6))), tl = (D - 0.4) / teeth, rise = Math.min(2.6, tl * 0.55);
    for (let k = 0; k < teeth; k++) {
      const z0 = -D / 2 + 0.2 + k * tl, z1 = z0 + tl;
      // the slope's slab and the upright as one prism across the hall (the section in the y-z plane, extruded along +x)
      sink.prism('roof', [[-W / 2 + 0.25, y0, z1], [-W / 2 + 0.25, y0, z0], [-W / 2 + 0.25, y0 + rise, z0 + 0.05]], [1, 0, 0], W - 0.5,
        {}, { kind: 'plane', origin: [0, y0 + rise, z0], u: [1, 0, 0], v: [0, -rise / Math.hypot(rise, tl), tl / Math.hypot(rise, tl)] });
      const up: Face = { origin: [0, 0, z0 + 0.04], u: [-1, 0, 0], out: [0, 0, -1], width: W - 0.5 };
      facePanel(sink, 'glass', up, 0, y0 + rise * 0.5, 0.01, W - 0.9, rise * 0.75, { decor: true, window: [0, 0, -1] });
      if (!mobile) for (let u = -W / 2 + 1.2; u < W / 2 - 0.8; u += 1.2) faceBox(sink, 'structureWood', up, u, y0 + rise * 0.5, 0.03, 0.07, rise * 0.75, 0.05, { colour: IRON, decor: true, fine: true });
    }
  }));
  return sink.finish();
}

/**
 * A column-guided gas holder: the steel tank in its lifts behind a ring of lattice columns tied by girder rings; the
 * station's brick wall round the lot (the holders stood walled off from the works), its valve house where the lot
 * leaves room beside the frame.
 */
function gasHolder(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  const f = fillOf(ctx);
  const W = f.w, D = f.d, t = 0.36;
  const R = Math.max(3, Math.min(W, D) / 2 - 1.2), H = Math.min(28, R * 2.6) * (0.75 + rng() * 0.2);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const lifts = 3;
    let y = -0.4;
    for (let k = 0; k < lifts; k++) {
      const r = R - k * 0.35, h = (H + 0.4) / lifts;
      sink.cylinder('structureMetal', [0, y, 0], 'y', h, r, 16, { colour: shade(HOLDER, 1 - k * 0.06) });
      ring(sink, 0, y + h - 0.3, 0, r, 0.3, shade(HOLDER, 0.7));
      y += h;
    }
    sink.cylinder('structureMetal', [0, y, 0], 'y', R * 0.18, R - lifts * 0.35 + 0.35, 16, { colour: shade(HOLDER, 0.85), decor: true }, 0.4);
    // the guide frame: lattice columns round the tank (their outer faces on the lot's fill), girder rings at two heights
    const n = Math.max(6, Math.round(R * 1.2)), cr = R + 0.75, rr = cr + 0.22;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, x = Math.cos(a) * cr, z = Math.sin(a) * cr;
      sink.member('structureMetal', [x, -0.3, z], [x, H + 1.6, z], 0.45, 0.45, [Math.cos(a), 0, Math.sin(a)], { colour: TRUSS, exposed: true }, 0);
    }
    for (const gy of [H * 0.5, H + 1.4]) for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      sink.member('structureMetal', [Math.cos(a0) * rr, gy, Math.sin(a0) * rr], [Math.cos(a1) * rr, gy, Math.sin(a1) * rr], 0.3, 0.3, [0, 1, 0], { colour: TRUSS, decor: true, exposed: true }, 0);
    }
    if (!mobile) for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      sink.member('structureWood', [Math.cos(a0) * rr, 0.5, Math.sin(a0) * rr], [Math.cos(a1) * rr, H * 0.5 - 0.2, Math.sin(a1) * rr], 0.1, 0.1, [0, 1, 0], { colour: TRUSS, decor: true, exposed: true, fine: true }, 0);
    }
    if (look() < 0.6) facePanel(sink, 'dark', { origin: [0, 0, R], u: [1, 0, 0], out: [0, 0, 1], width: 2 * R }, (look() - 0.5) * R, H * (0.3 + look() * 0.4), 0.05, 1.2 + look(), 0.9 + look() * 0.6, { decor: true });
    // the station's wall round the lot under a brick coping, the gate's leaves shut in its front run
    const wy = 2.0;
    const runs: Array<[number, number, number, number]> = [[-W / 2, -D / 2, W / 2, -D / 2 + t], [-W / 2, D / 2 - t, W / 2, D / 2],
      [-W / 2, -D / 2 + t, -W / 2 + t, D / 2 - t], [W / 2 - t, -D / 2 + t, W / 2, D / 2 - t]];
    for (const [x0, z0, x1, z1] of runs) {
      sink.span('stone', x0, -0.4, z0, x1, wy, z1);
      sink.band('stone', x0 - 0.04, wy, z0 - 0.04, x1 + 0.04, wy + 0.14, z1 + 0.04, { decor: true });
    }
    const gate: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const gw = Math.min(4.2, W * 0.3);
    for (const s of [-1, 1]) {
      faceBox(sink, 'structureMetal', gate, s * gw / 4, 1.2, 0.04, gw / 2 - 0.06, 2.3, 0.06, { colour: IRON, decor: true });
      faceBox(sink, 'stone', gate, s * (gw / 2 + 0.3), 1.3, 0.12, 0.6, 2.6, 0.24, { decor: true });
    }
    // the valve house at the long end, where the lot leaves room beside the frame
    const long = D >= W, room = (long ? D : W) / 2 - t - (R + 1.25);
    if (room >= 3.0) {
      const vd = Math.min(3.4, room - 0.3), vw = Math.min(4.2, (long ? W : D) - 2 * t - 1.0), vc = (long ? D : W) / 2 - t - 0.15 - vd / 2;
      const [vx, vz, sx, sz] = long ? [0, -vc, vw, vd] : [-vc, 0, vd, vw];
      sink.span('stone', vx - sx / 2, -0.4, vz - sz / 2, vx + sx / 2, 3.2, vz + sz / 2);
      const cap: RoofSpec = { kind: 'gable', pitchDeg: 30, eave: 0.25, verge: 0.2, thickness: 0.1, bucket: 'roof', ridge: 'saddle' };
      sink.placed(0, vx, 0, vz, () => emitRoof(sink, roofGeometry(sx, sz, 3.2, cap), cap));
    }
  });
  return sink.finish();
}

/** The works' halls: most a rolling mill under north lights, one in three a gas holder on the plot. */
const millOrHolder: RegionalBuilder = (ctx) => (ctx.rng() < 0.3 && Math.min(ctx.info.w, ctx.info.d) > 9 ? gasHolder(ctx) : sawtoothHall(ctx, 8.5, 6));
const workshop: RegionalBuilder = (ctx) => sawtoothHall(ctx, 5.2, 3);

// ------------------------------------------------------------------------------------------------ conveyors, headframe

/**
 * A conveyor gallery: a sheet-clad belt gallery climbing along the plot on two lattice trestles from the receiving
 * hopper at its low end to the transfer house at its head (both the lot's width, in brick).
 */
const conveyor: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile';
  const f = fillOf(ctx);
  const turned = f.w > f.d + 1;
  const L = Math.max(8, turned ? f.w : f.d), Wd = Math.max(2.8, turned ? f.d : f.w);
  const gw = Math.min(2.2, Wd - 0.6), y0 = 2.2, y1 = Math.min(13, 6 + L * 0.3) + rng() * 1.5;
  const at = (t: number): Vec3 => [0, y0 + (y1 - y0) * t, -L / 2 + L * t];
  sink.placed(0, f.cx, 0, f.cz, () => alongPlot(sink, turned, () => {
    // the gallery: a box section along the incline (sheet walls, a roof), its windows a dark band
    const a = at(0.08), b = at(0.86);
    sink.member('structureMetal', a, b, gw, 2.2, [0, 1, 0], { colour: SHEET, exposed: true }, 0);
    if (!mobile) sink.member('structureWood', [a[0], a[1] + 1.3, a[2]], [b[0], b[1] + 1.3, b[2]], gw + 0.02, 0.4, [0, 1, 0], { colour: [0.05, 0.05, 0.05], decor: true, exposed: true, fine: true }, 0);
    // the transfer house at the top end: a brick tower the lot's width, the sheet housing on it under a gable
    const hd = Math.min(3.6, L * 0.2), hy = y1 - 1.2;
    sink.span('stone', -Wd / 2, -0.4, L / 2 - hd, Wd / 2, hy, L / 2);
    sink.span('structureMetal', -Wd / 2 + 0.3, hy, L / 2 - hd + 0.1, Wd / 2 - 0.3, hy + 3.2, L / 2 - 0.1, { colour: SHEET });
    const cap: RoofSpec = { kind: 'gable', pitchDeg: 20, eave: 0.2, verge: 0.1, thickness: 0.1, bucket: 'roof', ridge: 'saddle' };
    sink.placed(0, 0, 0, L / 2 - hd / 2, () => emitRoof(sink, roofGeometry(Wd - 0.6, hd - 0.2, hy + 3.2, cap), cap));
    const hf: Face = { origin: [0, 0, L / 2], u: [1, 0, 0], out: [0, 0, 1], width: Wd };
    gateUnit(sink, hf, 0, 0, Math.min(2.4, Wd - 1.2), 2.8, DOOR, { bucket: YELLOW_BRICK, width: 0.2, out: 0.06 });
    // the trestles under the gallery: lattice legs on brick feet
    for (const t of [0.34, 0.62]) {
      const p = at(t), h = p[1] - 0.2;
      for (const s of [-1, 1]) {
        sink.span('stone', s * gw / 2 - 0.35, -0.4, p[2] - 0.35, s * gw / 2 + 0.35, 0.6, p[2] + 0.35);
        sink.member('structureMetal', [s * gw / 2, 0.6, p[2]], [s * gw / 2 * 0.8, h, p[2]], 0.3, 0.3, [0, 0, 1], { colour: OXIDE, exposed: true }, 0);
      }
      if (!mobile) for (let y = 1.4; y < h - 0.6; y += 1.6) sink.member('structureWood', [-gw / 2, y, p[2]], [gw / 2, y + 1.2, p[2]], 0.08, 0.08, [0, 0, 1], { colour: OXIDE, decor: true, exposed: true, fine: true }, 0);
    }
    // the receiving hopper at the low end: its brick pit walls the lot's width, the steel hopper over the belt's tail
    const pd = Math.min(2.4, L * 0.14);
    sink.span('stone', -Wd / 2, -0.4, -L / 2, Wd / 2, 1.4, -L / 2 + pd);
    sink.span('structureMetal', -gw / 2 - 0.4, 1.4, -L / 2 + 0.2, gw / 2 + 0.4, y0 + 0.9, -L / 2 + pd - 0.2, { colour: OXIDE });
  }, 1));
  return sink.finish();
};

/**
 * The colliery's headframe: the steel tower over the shaft hall at the lot's front, its struts raking back toward the
 * winding-engine house at the back, the two sheave wheels on top and the ropes down to the engine house.
 */
const headframe: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile';
  const f = fillOf(ctx);
  const W = Math.max(6, f.w), D = Math.max(10, f.d);
  // the shaft hall: its roof's eave on the lot's front edge, its verges on the sides; the winding-engine house behind
  const hz1 = D / 2 - 0.35, hz0 = hz1 - Math.min(5.6, D * 0.45), tz = hz1 - 2.65;
  const th = Math.max(14, Math.min(26, D * 1.5)) + rng() * 2, tw = Math.min(4, W * 0.36);
  const ez0 = -D / 2 + 0.45, ez1 = Math.min(ez0 + Math.max(4, Math.min(9, D * 0.32)), hz0 - 3);
  const engine = ez1 - ez0 >= 3;
  // with no room for the engine house the hall runs to the lot's back (the winding engine inside it)
  const hb = engine ? hz0 : -D / 2 + 0.35;
  sink.placed(0, f.cx, 0, f.cz, () => {
    sink.span('stone', -W / 2 + 0.25, -0.4, hb, W / 2 - 0.25, 6.5, hz1);
    const cap: RoofSpec = { kind: 'gable', pitchDeg: 26, eave: 0.3, verge: 0.2, thickness: 0.12, bucket: 'roof', ridge: 'saddle' };
    sink.placed(Math.PI / 2, 0, 0, (hb + hz1) / 2, () => emitRoof(sink, roofGeometry(hz1 - hb, W - 0.5, 6.5, cap), cap));
    const front: Face = { origin: [0, 0, hz1], u: [1, 0, 0], out: [0, 0, 1], width: W - 0.5 };
    gateUnit(sink, front, 0, 0, Math.min(3, W * 0.4), 3.4, DOOR, { bucket: YELLOW_BRICK, width: 0.24, out: 0.08 });
    for (const u of [-W / 2 + 1.4, W / 2 - 1.4]) windowUnit(sink, front, u, 2.4, 1.0, 2.2, HALL_WINDOW, rng, 0.2);
    // the tower: four legs, cross-braced, the sheave platform
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      sink.member('structureMetal', [sx * tw / 2, 0.2, tz + sz * tw / 2], [sx * tw * 0.4, th, tz + sz * tw * 0.4], 0.32, 0.32, [0, 0, 1], { colour: OXIDE, exposed: true }, 0);
    }
    if (!mobile) for (let y = 7; y < th - 1; y += 2.6) for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]] as const) {
      const k = 0.5 - 0.1 * (y / th);
      sink.member('structureWood', [ax * tw * k, y, tz + az * tw * k], [bx * tw * k, y + 2.4, tz + bz * tw * k], 0.09, 0.09, [0, 1, 0], { colour: OXIDE, decor: true, exposed: true, fine: true }, 0);
    }
    sink.span('structureMetal', -tw * 0.55, th, tz - tw * 0.55, tw * 0.55, th + 0.4, tz + tw * 0.55, { colour: TRUSS, decor: true });
    const ropeTo = engine ? ez1 : hb + 1;
    for (const s of [-1, 1]) {
      sink.cylinder('structureMetal', [s * 0.7, th + 2.1, tz - 0.1], 'x', 0.18, 2.0, 14, { colour: TRUSS, decor: true }, 2.0, true);
      sink.member('structureWood', [s * 0.7, th + 2.1, tz - 2.0], [s * 0.7, 6.0, ropeTo], 0.05, 0.05, [1, 0, 0], { colour: IRON, decor: true, exposed: true, fine: true }, 0);
    }
    // the struts raking back toward the engine house, their feet just before it
    const zb = Math.max(tz - th * 0.42, (engine ? ez1 : hb) + 0.9);
    for (const s of [-1, 1]) sink.member('structureMetal', [s * tw * 0.4, th - 0.5, tz - tw * 0.4], [s * tw * 0.7, 0.2, zb], 0.36, 0.36, [1, 0, 0], { colour: OXIDE, exposed: true }, 0);
    // the winding-engine house: brick, tall windows, a gable roof whose eave meets the lot's back edge
    if (engine) {
      const openings: Opening[] = [];
      for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, ez1 - ez0, { w: 1.2, h: 3.2, sill: 1.6, spacing: 2.4, margin: 1.0 })) openings.push(o);
      sink.placed(Math.PI / 2, 0, 0, (ez0 + ez1) / 2, () => {
        buildHouse(sink, {
          w: ez1 - ez0, d: Math.min(W - 0.6, 12), plinth: { h: 0.5, out: 0.05, bucket: 'stone' }, storeys: [{ h: 7.2, wall: 'stone' }],
          roof: { kind: 'gable', pitchDeg: 30, eave: 0.35, verge: 0.25, thickness: 0.14, bucket: 'roof', ridge: 'saddle' }, gableBucket: 'stone', openings,
          chimneys: [], gutters: null, verge: null, reveal: 0.3, rafters: null, spall: null,
        }, dialect(rng, HALL_WINDOW));
      });
    }
  });
  return sink.finish();
};

/** The works office: three storeys of brick with yellow-brick bands, segmental windows, a hipped slate roof, a turret. */
const worksOffice: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const f = fillOf(ctx);
  // the hipped roof's eaves on the lot's edges: the walls stand in by them (0.45 m and the slab's 0.08 m on its slope)
  const W = Math.max(7, f.w - 1.06), D = Math.max(7, f.d - 1.06);
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.5, y0: 0, h: 2.8 }];
  for (let i = 0; i < 3; i++) for (const face of ['front', 'back', 'left', 'right'] as const) {
    const width = face === 'front' || face === 'back' ? W : D;
    for (const o of windowRhythm(face, i, width, { w: 1.1, h: 1.9, sill: 0.9, spacing: 2.3, margin: 1.0, avoid: face === 'front' && i === 0 ? [[-1, 1]] : [] })) openings.push(o);
  }
  sink.placed(0, f.cx, 0, f.cz, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.6, out: 0.06, bucket: 'stone' }, storeys: [{ h: 3.8, wall: 'stone' }, { h: 3.5, wall: 'stone' }, { h: 3.3, wall: 'stone' }],
      roof: { kind: 'hip', pitchDeg: 34, eave: 0.45, verge: 0.45, thickness: 0.14, bucket: 'roof', ridge: 'saddle' }, gableBucket: 'stone', openings,
      chimneys: [{ x: W * 0.25, z: 0, sx: 0.6, sz: 0.7, above: 1.0, bucket: 'stone', cap: 'pots' }, { x: -W * 0.25, z: 0, sx: 0.6, sz: 0.7, above: 1.0, bucket: 'stone', cap: 'pots' }],
      gutters: { colour: rgb(0x6a6e70) }, verge: null, reveal: 0.26, rafters: null, spall: null,
    }, dialect(rng));
    const b = frame.bodies[0];
    for (const y of [frame.floors[1] - 0.15, frame.floors[2] - 0.15, frame.eaveY - 0.45]) sink.band(YELLOW_BRICK, b.x0 - 0.04, y, b.z0 - 0.04, b.x1 + 0.04, y + 0.26, b.z1 + 0.04, { decor: true });
    // the clock turret on the ridge
    const ty = frame.roof.ridgeY - 0.3;
    sink.span('structureMetal', -0.9, ty, -0.9, 0.9, ty + 2.2, 0.9, { colour: SHEET });
    sink.cylinder('structureMetal', [0, ty + 2.2, 0], 'y', 1.6, 1.25, 4, { colour: shade(SHEET, 0.8), decor: true }, 0.05, true, Math.PI / 4);
    facePanel(sink, 'structureMetal', { origin: [0, 0, 0.9], u: [1, 0, 0], out: [0, 0, 1], width: 1.8 }, 0, ty + 1.2, 0.02, 1.1, 1.1, { decor: true, colour: rgb(0xd6d0bf) });
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the miners' houses

const SANDSTONE = rgb(0x9a5f4c), WHITE_FRAME = rgb(0xe4dfd2);
const MINER_WINDOW: WindowStyle = { frame: WHITE_FRAME, frameWidth: 0.06, frameOut: 0.04, bars: 'cross', surround: { bucket: 'stone', width: 0.15, out: 0.05, lintel: 0.2 }, sill: { bucket: 'stone', out: 0.08 }, shutters: null };
const LEAVES: readonly Rgb[] = [0x3e4e44, 0x5a3a2a, 0x2f3f52, 0x6b5a3c].map(rgb);

/**
 * The Saar miner's house (Bergmannshaus): one and a half storeys under a steep tiled roof, its eaves to the street, the
 * dressed surrounds of the windows and the door, the stable and the barn door under the same roof at one end (the
 * miner-farmer's Einhaus); the row's houses meet at firewalls, the yard behind walled to the lot's back. Built along
 * the street (turned a quarter: its local -x side, 'left', the street front at +z).
 */
const minersHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  const f = fillOf(ctx, 0.05, ctx.info.d / 2 - 0.1);
  // (the steep roof's slab reaches past its 0.45 m eave by under 0.13 m)
  const over = 0.58;
  // the house as deep as the lot, or 9.5 m with a walled yard behind it where the lot leaves a yard's room
  const full = f.d - 2 * over, len = Math.max(5, f.w), depth = Math.max(5, full - 9.5 < 1.6 ? full : 9.5);
  const plaster = rng() < 0.6, pitch = 42 + rng() * 6, gH = 2.9 + rng() * 0.2, kH = 1.5;
  const leaf = LEAVES[Math.floor(rng() * LEAVES.length) % LEAVES.length];
  const stable = len >= 8.5 && rng() < 0.6 ? (rng() < 0.5 ? -1 : 1) : 0;
  const zc = f.d / 2 - over - depth / 2;
  const openings: Opening[] = [];
  const doorU = stable ? -stable * len * 0.12 : (rng() - 0.5) * len * 0.3;
  openings.push({ face: 'left', storey: 0, kind: 'door', u: doorU, w: 1.0, y0: 0, h: 2.15 });
  const avoid: Array<[number, number]> = [[doorU - 0.8, doorU + 0.8]];
  if (stable) {
    const su = stable * (len / 2 - 1.7);
    openings.push({ face: 'left', storey: 0, kind: 'gate', u: su, w: 2.4, y0: 0, h: 2.5 });
    avoid.push([su - 1.6, su + 1.6]);
  }
  for (const o of windowRhythm('left', 0, len, { w: 0.85, h: 1.3, sill: 0.9, spacing: 1.9, margin: 0.9, avoid })) openings.push(o);
  for (const o of windowRhythm('left', 1, len, { w: 0.7, h: 0.75, sill: 0.35, spacing: 2.2, margin: 1.2, avoid: stable ? [avoid[1]] : [] })) openings.push(o);
  openings.push({ face: 'right', storey: 0, kind: 'door', u: (rng() - 0.5) * len * 0.3, w: 0.95, y0: 0, h: 2.1 });
  for (const o of windowRhythm('right', 0, len, { w: 0.8, h: 1.1, sill: 1.0, spacing: 2.4, margin: 1.2 })) openings.push(o);
  const houseDialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, MINER_WINDOW, look, 0.25),
    door: (s, face, o, y0) => {
      if (o.kind === 'gate') { gateUnit(s, face, o.u, y0 + o.y0, o.w, o.h, shade(leaf, 0.85), { bucket: 'stone', width: 0.2, out: 0.06 }); return; }
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf, frame: { bucket: 'stone', width: 0.18, out: 0.06 }, transom: false, steps: { bucket: 'stone' }, leafKind: 'panel' }, y0 + o.y0);
    },
  };
  sink.placed(0, f.cx, 0, f.cz, () => {
    sink.placed(0, 0, 0, zc, () => sink.placed(Math.PI / 2, 0, 0, 0, () => {
      const frame = buildHouse(sink, {
        w: depth, d: len, plinth: { h: 0.3, out: 0.04, bucket: 'stone' }, storeys: [{ h: gH, wall: plaster ? 'plaster' : 'stone' }, { h: kH, wall: plaster ? 'plaster' : 'stone' }],
        roof: { kind: 'gable', pitchDeg: pitch, eave: 0.45, verge: 0, thickness: 0.15, bucket: 'roof', ridge: 'saddle' }, gableBucket: plaster ? 'plaster' : 'stone', openings,
        chimneys: [{ x: (rng() - 0.5) * 0.6, z: (stable ? -stable : 1) * len * 0.18, sx: 0.5, sz: 0.6, above: 0.8, bucket: 'stone', cap: 'pots' }],
        gutters: mobile ? null : { colour: rgb(0x6a6e70) }, verge: null, reveal: 0.2, rafters: null, spall: null,
      }, houseDialect);
      // the plinth band in the dressed stone, a soot shadow over the stable door
      const b = frame.bodies[0];
      if (plaster) sink.band('stone', b.x0 - 0.03, 0.3, b.z0 - 0.03, b.x1 + 0.03, 0.62, b.z1 + 0.03, { decor: true, colour: SANDSTONE });
    }));
    // the yard behind the house, walled to the lot's back and sides
    const yard = zc - depth / 2 - over, back = -f.d / 2;
    if (yard - back > 1.4) {
      const t = 0.3, wy = 1.8;
      sink.span('stone', -len / 2, -0.4, back, len / 2, wy, back + t);
      for (const s of [-1, 1]) sink.span('stone', s > 0 ? len / 2 - t : -len / 2, -0.4, back + t, s > 0 ? len / 2 : -len / 2 + t, wy, yard + over);
      if (look() < 0.7) sink.dressing(mobile, () => {
        // a lean-to shed against the back wall: the coal, the goat
        const sw = Math.min(3.2, len * 0.4), sx = (look() - 0.5) * (len - sw - 1);
        sink.span('structureWood', sx - sw / 2, -0.3, back + t, sx + sw / 2, 2.2, back + t + 1.6, { colour: shade(rgb(0x5a4a3a), 0.8 + look() * 0.3), decor: true });
      });
    }
  });
  return sink.finish();
};

export const SAAR_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  // the coalfield brick the Ruhr kit builds (the water towers, the shells, the goods sheds)
  ...RUHR_BUILDERS,
  // the colliery's terraces: the miner's house (the Ruhr kit's cottage pair stands short of the base's reach)
  rowhouse: minersHouse,
  cornershop: minersHouse,
  // the works' depots: workshops under north lights (the Ruhr kit's station is a station)
  depot: workshop,
  factory: blastFurnace,
  warehouse: millOrHolder,
  shed: workshop,
  gantry: conveyor,
  firestation: headframe,
  foundryoffice: worksOffice,
  stack: factoryStack,
});

export const SAAR_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'saar',
  region: 'The Völklingen ironworks on the Saar: blast furnaces and Cowper stoves, sawtooth rolling mills, gas holders, a colliery headframe, brick and steel',
  surfaces: {
    roof: { kind: 'sheet', tint: [0.36, 0.37, 0.37] },
    stone: { kind: 'brick', tint: [0.47, 0.26, 0.2] },
    sourced: { plaster: true, wood: true },
    // the yellow brick of the bands and the dressings (foundry.ts carries it in the map's own tones)
    tones: { plaster2: (_h, s, l) => [0.11, Math.min(1, s * 0.6 + 0.2), Math.min(1, l + 0.05)] },
  },
  builders: SAAR_BUILDERS,
  // soot on everything: the brick from fresh red to smoke-black, the sheet from galvanised to rust
  weather: {
    plaster: [[1, 1, 1], [0.92, 0.9, 0.86], [0.84, 0.82, 0.8]],
    stone: [[1, 1, 1], [0.86, 0.82, 0.8], [0.72, 0.68, 0.66], [0.94, 0.9, 0.86]],
    roof: [[1, 1, 1], [0.86, 0.8, 0.76], [1.06, 0.92, 0.82], [0.72, 0.7, 0.7]],
    damp: 0.6, moss: 0.15,
  },
  wear: 0.4,
});

