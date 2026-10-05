// src/world/maps/regional/saar.ts — the Saar ironworks kit (Ironworks: the Völklingen ironworks on the Saar, fought over
// in March 1945). The works' iron and brick: the blast furnaces in their row — each furnace shaft banded in steel above
// its casting house, the Cowper stoves beside it under their domes, the bustle pipe and the hot-blast main, the uptakes
// and the downcomer at its top, the inclined skip hoist up from the ore bunkers; the rolling mills' long brick halls
// under sawtooth north lights, and among them the column-guided gas holders; conveyor galleries on lattice trestles;
// the colliery's headframe over its shaft hall with the winding-engine house behind it (the Saar coalfield at the works'
// gate); the works office in brick with yellow-brick bands under slate. The workers' terraces, the station, the water
// towers, the stacks and the shelled brick shells are the Ruhr kit's (ruhr.ts): the same coalfield brick.
import { PartSink, alongPlot, faceBox, facePanel, plotAxes, rgb, shade, type Face, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
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

// ------------------------------------------------------------------------------------------------ the blast furnace

/**
 * A blast furnace unit: the brick casting house round the furnace's foot, the shaft banded in steel to the charging
 * platform, the uptakes and the downcomer over it, two Cowper stoves under their domes at the back, the hot-blast main
 * and the bustle pipe, the inclined skip hoist from the front up to the furnace's top.
 */
const blastFurnace: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  const W = Math.max(6.4, ctx.info.w - 0.6), D = Math.max(9, ctx.info.d - 0.6);
  const fr = Math.min(3.3, W * 0.28), fz = D * 0.12, fh = Math.max(18, Math.min(30, D * 1.5)) + rng() * 2;
  const sr = Math.min(2.5, (W - 1) / 4.4), sh = fh * 0.86;
  // the casting house round the furnace's foot: brick under a monitor roof of sheet
  const ch = 7.5, cz0 = fz - fr - 2.2, cz1 = Math.min(D / 2, fz + fr + 3.0);
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'gate', u: 0, w: Math.min(3.2, W * 0.4), y0: 0, h: 3.6 }];
  for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, cz1 - cz0, { w: 1.1, h: 2.6, sill: 3.4, spacing: 2.4, margin: 1.0 })) openings.push(o);
  sink.placed(0, 0, 0, (cz0 + cz1) / 2, () => {
    const frame = buildHouse(sink, {
      w: W, d: cz1 - cz0, plinth: { h: 0.4, out: 0.05, bucket: 'stone' }, storeys: [{ h: ch, wall: 'stone' }],
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
  sink.span('structureMetal', -fr - 0.9, top, fz - fr - 0.9, fr + 0.9, top + 0.35, fz + fr + 0.9, { colour: TRUSS, decor: true });
  sink.span('structureMetal', -1.4, top + 0.35, fz - 1.4, 1.4, top + 3.2, fz + 1.4, { colour: SHEET, decor: true });
  // the uptakes rising off the top, the downcomer falling to the dust catcher at the casting house's side
  for (const [ux, uz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    sink.member('structureMetal', [ux * fr * 0.55, top - 0.5, fz + uz * fr * 0.55], [ux * 0.7, top + 6.5, fz + uz * 0.7], 0.75, 0.75, [0, 0, 1], { colour: PLATE, decor: true, exposed: true }, 0);
  }
  const dcx = -W / 2 + 1.4, dcz = cz0 - 0.2;
  sink.member('structureMetal', [0, top + 6.6, fz], [dcx, ch + 4.5, dcz], 0.9, 0.9, [0, 0, 1], { colour: PLATE, decor: true, exposed: true }, 0);
  sink.cylinder('structureMetal', [dcx, ch + 0.5, dcz], 'y', 4.2, 1.2, 10, { colour: STOVE, decor: true }, 1.2);
  sink.cylinder('structureMetal', [dcx, ch - 1.5, dcz], 'y', 2.0, 0.3, 8, { colour: STOVE, decor: true }, 1.2, false);
  // the Cowper stoves behind the furnace, domed, the hot-blast main to the bustle pipe round the furnace
  const stz = -D / 2 + sr + 0.3;
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
  // the skip hoist: an inclined bridge from the bunkers at the plot's front up to the charging platform
  truss(sink, [0, 0.4, D / 2 - 0.3], [0, top + 0.6, fz + fr + 0.6], 1.6, [0, 1, 0], 10, OXIDE, mobile);
  for (const s of [-1, 1]) sink.member('structureMetal', [s * 0.8, 0, D / 2 - 0.8 - (D / 2 - fz) * 0.45], [s * 0.8, (top + 0.6) * 0.55, D / 2 - 0.8 - (D / 2 - fz) * 0.45], 0.3, 0.3, [0, 0, 1], { colour: TRUSS, exposed: true }, 0);
  if (look() < 0.5) facePanel(sink, 'dark', { origin: [W / 2, 0, (cz0 + cz1) / 2], u: [0, 0, -1], out: [1, 0, 0], width: cz1 - cz0 }, (look() - 0.5) * 3, ch * 0.6, 0.02, 1.6, 1.2, { decor: true });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the halls

/**
 * A sawtooth hall: brick walls with tall segmental windows, the roof in north-light teeth across the hall (each tooth's
 * slope of sheet and its glazed upright), on a plot laid along its long side.
 */
function sawtoothHall(ctx: RegionalBuildContext, wallH: number, toothMax: number): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile';
  const plot = plotAxes(ctx.info);
  const W = Math.max(5, plot.w - 0.8), D = Math.max(7, plot.d - 0.8);
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'gate', u: 0, w: Math.min(4, W * 0.36), y0: 0, h: Math.min(4.4, wallH * 0.62) }];
  for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, D, { w: 1.4, h: wallH * 0.42, sill: wallH * 0.32, spacing: 3.2, margin: 1.4 })) openings.push(o);
  openings.push({ face: 'back', storey: 0, kind: 'door', u: W * 0.25, w: 1.1, y0: 0, h: 2.3 });
  alongPlot(sink, plot.turned, () => {
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
  });
  return sink.finish();
}

/**
 * A column-guided gas holder: the steel tank in its lifts behind a ring of lattice columns tied by girder rings, the
 * stair up its side; a brick valve house at its foot.
 */
function gasHolder(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  const R = Math.max(3, Math.min(ctx.info.w, ctx.info.d) / 2 - 1.2), H = Math.min(28, R * 2.6) * (0.75 + rng() * 0.2);
  const lifts = 3;
  let y = -0.4;
  for (let k = 0; k < lifts; k++) {
    const r = R - k * 0.35, h = (H + 0.4) / lifts;
    sink.cylinder('structureMetal', [0, y, 0], 'y', h, r, 16, { colour: shade(HOLDER, 1 - k * 0.06) });
    ring(sink, 0, y + h - 0.3, 0, r, 0.3, shade(HOLDER, 0.7));
    y += h;
  }
  sink.cylinder('structureMetal', [0, y, 0], 'y', R * 0.18, R - lifts * 0.35 + 0.35, 16, { colour: shade(HOLDER, 0.85), decor: true }, 0.4);
  // the guide frame: lattice columns round the tank, girder rings at two heights
  const n = Math.max(6, Math.round(R * 1.2)), cr = R + 0.9;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, x = Math.cos(a) * cr, z = Math.sin(a) * cr;
    sink.member('structureMetal', [x, -0.3, z], [x, H + 1.6, z], 0.45, 0.45, [Math.cos(a), 0, Math.sin(a)], { colour: TRUSS, exposed: true }, 0);
  }
  for (const gy of [H * 0.5, H + 1.4]) for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
    sink.member('structureMetal', [Math.cos(a0) * cr, gy, Math.sin(a0) * cr], [Math.cos(a1) * cr, gy, Math.sin(a1) * cr], 0.3, 0.3, [0, 1, 0], { colour: TRUSS, decor: true, exposed: true }, 0);
  }
  if (!mobile) for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
    sink.member('structureWood', [Math.cos(a0) * cr, 0.5, Math.sin(a0) * cr], [Math.cos(a1) * cr, H * 0.5 - 0.2, Math.sin(a1) * cr], 0.1, 0.1, [0, 1, 0], { colour: TRUSS, decor: true, exposed: true, fine: true }, 0);
  }
  // the valve house at its foot
  const vx = Math.min(ctx.info.w / 2 - 2.2, R * 0.75), vz = Math.min(ctx.info.d / 2 - 1.8, R * 0.75);
  sink.span('stone', vx - 1.8, -0.4, vz - 1.4, vx + 1.8, 3.2, vz + 1.4);
  const cap: RoofSpec = { kind: 'gable', pitchDeg: 30, eave: 0.25, verge: 0.2, thickness: 0.1, bucket: 'roof', ridge: 'saddle' };
  sink.placed(0, vx, 0, vz, () => emitRoof(sink, roofGeometry(3.6, 2.8, 3.2, cap), cap));
  if (look() < 0.6) facePanel(sink, 'dark', { origin: [0, 0, R], u: [1, 0, 0], out: [0, 0, 1], width: 2 * R }, (look() - 0.5) * R, H * (0.3 + look() * 0.4), 0.05, 1.2 + look(), 0.9 + look() * 0.6, { decor: true });
  return sink.finish();
}

/** The works' halls: most a rolling mill under north lights, one in three a gas holder on the plot. */
const millOrHolder: RegionalBuilder = (ctx) => (ctx.rng() < 0.3 && Math.min(ctx.info.w, ctx.info.d) > 9 ? gasHolder(ctx) : sawtoothHall(ctx, 8.5, 6));
const workshop: RegionalBuilder = (ctx) => sawtoothHall(ctx, 5.2, 3);

// ------------------------------------------------------------------------------------------------ conveyors, headframe

/**
 * A conveyor gallery: a sheet-clad belt gallery climbing along the plot on two lattice trestles, its feet and its head
 * house on brick.
 */
const conveyor: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile';
  const plot = plotAxes(ctx.info);
  const L = Math.max(8, plot.d - 0.6), gw = Math.min(2.2, plot.w - 0.6), y0 = 2.2, y1 = Math.min(13, 6 + L * 0.3) + rng() * 1.5;
  const at = (t: number): Vec3 => [0, y0 + (y1 - y0) * t, -L / 2 + L * t];
  alongPlot(sink, plot.turned, () => {
    // the gallery: a box section along the incline (sheet walls, a roof), its windows a dark band
    const a = at(0.02), b = at(0.92);
    sink.member('structureMetal', a, b, gw, 2.2, [0, 1, 0], { colour: SHEET, exposed: true }, 0);
    if (!mobile) sink.member('structureWood', [a[0], a[1] + 1.3, a[2]], [b[0], b[1] + 1.3, b[2]], gw + 0.02, 0.4, [0, 1, 0], { colour: [0.05, 0.05, 0.05], decor: true, exposed: true, fine: true }, 0);
    // the head house at the top end, on its tower
    const hz = L / 2 - 1.6, hy = y1 - 1.2;
    sink.span('stone', -gw / 2 - 0.4, -0.4, hz - 1.6, gw / 2 + 0.4, hy, hz + 1.6);
    sink.span('structureMetal', -gw / 2 - 0.6, hy, hz - 1.8, gw / 2 + 0.6, hy + 3.2, hz + 1.8, { colour: SHEET });
    const cap: RoofSpec = { kind: 'gable', pitchDeg: 20, eave: 0.2, verge: 0.2, thickness: 0.1, bucket: 'roof', ridge: 'saddle' };
    sink.placed(0, 0, 0, hz, () => emitRoof(sink, roofGeometry(gw + 1.2, 3.6, hy + 3.2, cap), cap));
    // the trestles under the gallery: lattice legs on brick feet
    for (const t of [0.3, 0.62]) {
      const p = at(t), h = p[1] - 0.2;
      for (const s of [-1, 1]) {
        sink.span('stone', s * gw / 2 - 0.35, -0.4, p[2] - 0.35, s * gw / 2 + 0.35, 0.6, p[2] + 0.35);
        sink.member('structureMetal', [s * gw / 2, 0.6, p[2]], [s * gw / 2 * 0.8, h, p[2]], 0.3, 0.3, [0, 0, 1], { colour: OXIDE, exposed: true }, 0);
      }
      if (!mobile) for (let y = 1.4; y < h - 0.6; y += 1.6) sink.member('structureWood', [-gw / 2, y, p[2]], [gw / 2, y + 1.2, p[2]], 0.08, 0.08, [0, 0, 1], { colour: OXIDE, decor: true, exposed: true, fine: true }, 0);
    }
    // the tail at the low end, a hopper on its frame
    sink.span('structureMetal', -gw / 2 - 0.3, -0.3, -L / 2 + 0.2, gw / 2 + 0.3, y0, -L / 2 + 2.2, { colour: OXIDE });
  }, 1);
  return sink.finish();
};

/**
 * The colliery's headframe: the steel tower over the shaft hall, its struts raking back to the winding-engine house,
 * the two sheave wheels on top and the ropes down to the engine house.
 */
const headframe: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile';
  const W = Math.max(6, ctx.info.w - 0.6), D = Math.max(8, ctx.info.d - 0.6);
  const tz = D / 2 - 3.0, th = Math.max(14, Math.min(26, D * 1.5)) + rng() * 2, tw = Math.min(4, W * 0.36);
  // the shaft hall round the tower's foot
  sink.span('stone', -W / 2, -0.4, tz - 2.6, W / 2, 6.5, D / 2);
  const cap: RoofSpec = { kind: 'gable', pitchDeg: 26, eave: 0.3, verge: 0.2, thickness: 0.12, bucket: 'roof', ridge: 'saddle' };
  sink.placed(Math.PI / 2, 0, 0, (tz - 2.6 + D / 2) / 2, () => emitRoof(sink, roofGeometry(D / 2 - tz + 2.6, W, 6.5, cap), cap));
  const front: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
  gateUnit(sink, front, 0, 0, Math.min(3, W * 0.4), 3.4, DOOR, { bucket: YELLOW_BRICK, width: 0.24, out: 0.08 });
  for (const u of [-W / 2 + 1.2, W / 2 - 1.2]) windowUnit(sink, front, u, 2.4, 1.0, 2.2, HALL_WINDOW, rng, 0.2);
  // the tower: four legs, cross-braced, the sheave platform
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    sink.member('structureMetal', [sx * tw / 2, 0.2, tz + sz * tw / 2], [sx * tw * 0.4, th, tz + sz * tw * 0.4], 0.32, 0.32, [0, 0, 1], { colour: OXIDE, exposed: true }, 0);
  }
  if (!mobile) for (let y = 7; y < th - 1; y += 2.6) for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]] as const) {
    const k = 0.5 - 0.1 * (y / th);
    sink.member('structureWood', [ax * tw * k, y, tz + az * tw * k], [bx * tw * k, y + 2.4, tz + bz * tw * k], 0.09, 0.09, [0, 1, 0], { colour: OXIDE, decor: true, exposed: true, fine: true }, 0);
  }
  sink.span('structureMetal', -tw * 0.55, th, tz - tw * 0.55, tw * 0.55, th + 0.4, tz + tw * 0.55, { colour: TRUSS, decor: true });
  for (const s of [-1, 1]) {
    sink.cylinder('structureMetal', [s * 0.7, th + 2.1, tz - 0.1], 'x', 0.18, 2.0, 14, { colour: TRUSS, decor: true }, 2.0, true);
    sink.member('structureWood', [s * 0.7, th + 2.1, tz - 2.0], [s * 0.7, 6.0, -D / 2 + 3.5], 0.05, 0.05, [1, 0, 0], { colour: IRON, decor: true, exposed: true, fine: true }, 0);
  }
  // the struts raking back toward the engine house
  for (const s of [-1, 1]) sink.member('structureMetal', [s * tw * 0.4, th - 0.5, tz - tw * 0.4], [s * tw * 0.7, 0.2, tz - th * 0.42], 0.36, 0.36, [1, 0, 0], { colour: OXIDE, exposed: true }, 0);
  // the winding-engine house behind: brick, tall windows, a gable roof
  const ez1 = Math.min(tz - th * 0.42 - 0.6, tz - 4), ez0 = -D / 2;
  if (ez1 - ez0 > 3) {
    const openings: Opening[] = [];
    for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, ez1 - ez0, { w: 1.2, h: 3.2, sill: 1.6, spacing: 2.4, margin: 1.0 })) openings.push(o);
    sink.placed(0, 0, 0, (ez0 + ez1) / 2, () => {
      buildHouse(sink, {
        w: Math.min(W, 9), d: ez1 - ez0, plinth: { h: 0.5, out: 0.05, bucket: 'stone' }, storeys: [{ h: 7.2, wall: 'stone' }],
        roof: { kind: 'gable', pitchDeg: 30, eave: 0.35, verge: 0.25, thickness: 0.14, bucket: 'roof', ridge: 'saddle' }, gableBucket: 'stone', openings,
        chimneys: [], gutters: null, verge: null, reveal: 0.3, rafters: null, spall: null,
      }, dialect(rng, HALL_WINDOW));
    });
  }
  return sink.finish();
};

/** The works office: three storeys of brick with yellow-brick bands, segmental windows, a hipped slate roof, a turret. */
const worksOffice: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(7, ctx.info.w - 0.6), D = Math.max(7, ctx.info.d - 1.6);
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.5, y0: 0, h: 2.8 }];
  for (let i = 0; i < 3; i++) for (const face of ['front', 'back', 'left', 'right'] as const) {
    const width = face === 'front' || face === 'back' ? W : D;
    for (const o of windowRhythm(face, i, width, { w: 1.1, h: 1.9, sill: 0.9, spacing: 2.3, margin: 1.0, avoid: face === 'front' && i === 0 ? [[-1, 1]] : [] })) openings.push(o);
  }
  sink.placed(0, 0, 0, -0.5, () => {
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

export const SAAR_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  // the coalfield brick the Ruhr kit builds (the workers' terraces, the station, the water towers, the shells)
  ...RUHR_BUILDERS,
  cornershop: RUHR_BUILDERS.rowhouse,
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
    tones: { plaster2: (_h, s, l) => [0.11, Math.min(1, s * 0.6 + 0.2), Math.min(1, l * 1.05 + 0.06)] },
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

