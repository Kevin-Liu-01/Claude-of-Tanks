// src/world/maps/regional/wadirum.ts — the Wadi Rum kit (Redrock Divide: a desert outpost in the Wadi Rum country of
// southern Jordan). Flat-roofed houses of concrete block, bare grey or rendered sand-ochre, with the reinforcing bars of
// the next storey left standing at the corners and black water tanks on the roof, steel doors painted green or blue,
// window grilles; the Desert Patrol's fort, crenellated with corner towers; steel-portal stores and workshops under
// low corrugated roofs instead of tiles; walled compounds of block houses.
import { PartSink, alongPlot, faceBox, pick, plotAxes, rgb, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, windowRhythm, type HouseDialect, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

const STEEL_DOORS: readonly Rgb[] = [0x3f6a5a, 0x3e5f86, 0x6a6e70, 0x8a6a3e].map(rgb);
const TANK = rgb(0x262626), REBAR = rgb(0x5a3e2e);
const SAND_SHEET: readonly Rgb[] = [0xc8b48e, 0xbcae96, 0xd6ccb4].map(rgb);

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/** Rooftop furniture: rebar stubs at the corners and columns, one or two black tanks on a steel stand. */
function rooftop(sink: PartSink, W: number, D: number, top: number, rng: () => number): void {
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]] as const) {
    if (sx === 0 && rng() < 0.5) continue;
    const x = sx * (W / 2 - 0.2), z = sz * (D / 2 - 0.2);
    for (const [dx, dz] of [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]]) {
      sink.span('structureWood', x + dx - 0.015, top, z + dz - 0.015, x + dx + 0.015, top + 0.9 + rng() * 0.5, z + dz + 0.015, { colour: REBAR, decor: true });
    }
  }
  const n = rng() < 0.6 ? 1 : 2;
  for (let k = 0; k < n; k++) {
    const x = (k - (n - 1) / 2) * 1.4 + (rng() - 0.5) * W * 0.2, z = (rng() - 0.5) * D * 0.3;
    for (const [dx, dz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) sink.span('structureMetal', x + dx - 0.03, top, z + dz - 0.03, x + dx + 0.03, top + 0.6, z + dz + 0.03, { colour: rgb(0x6a6e70), decor: true });
    sink.cylinder('structureMetal', [x, top + 0.6, z], 'y', 1.1, 0.55, 10, { colour: TANK, decor: true });
  }
}

/** The block house: one or two storeys of concrete block, flat roof, parapet, steel door, grilles, roof furniture. */
const blockHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(5.0, ctx.info.w - 0.3), D = Math.max(5.4, ctx.info.d - 0.3);
  // (round 11, the gauntlet's wave 282: "cinder-block cubes with a regular brick-pattern skin" — every house rendered;
  // the draw that chose bare block stays, so the rest of the house draws as before)
  if (ctx.wallBucket !== 'stone') rng();
  const wall: RegionalBucket = ctx.wallBucket === 'stone' ? 'plaster' : ctx.wallBucket as RegionalBucket;
  const door = pick(rng, STEEL_DOORS);
  const style: WindowStyle = { frame: rgb(0x5a5e60), frameWidth: 0.05, frameOut: 0.04, bars: 'six', surround: null, sill: { bucket: 'plaster', out: 0.06 }, shutters: null };
  const count = rng() < 0.3 ? 2 : 1;
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * W * 0.3, w: 1.0, y0: 0, h: 2.1 }];
  for (let i = 0; i < count; i++) for (const face of ['front', 'left', 'right', 'back'] as const) {
    // (round 11: "almost no openings" — a window every 2.2 m, up to three a face)
    for (const o of windowRhythm(face, i, face === 'front' || face === 'back' ? W : D, { w: 0.9, h: 1.0, sill: 1.1, spacing: 2.2, margin: 0.9, max: 3,
      avoid: face === 'front' && i === 0 ? [[openings[0].u - 0.8, openings[0].u + 0.8]] : [] })) if (face !== 'back' || rng() < 0.5) openings.push(o);
  }
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, style, rng, 0.4),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: door, frame: { bucket: 'plaster', width: 0.12, out: 0.04 }, steps: { bucket: 'stone' }, leafKind: 'panel' }, y0 + o.y0),
  };
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.25, out: 0.05, bucket: 'stone' }, storeys: Array.from({ length: count }, () => ({ h: 3.0, wall })),
    roof: { kind: 'flat', pitchDeg: 0, eave: 0.08, verge: 0.08, thickness: 0.2, bucket: wall, parapet: 0.6 }, gableBucket: wall,
    openings, chimneys: [], gutters: null, verge: null,
  }, dialect);
  rooftop(sink, W, D, frame.eaveY + 0.2, rng);
  return sink.finish();
};

/** A steel-portal store: block plinth walls, sheet cladding in a sand livery, a low corrugated roof, a roller door. */
const steelStore: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(8, Math.min(18, ctx.info.w - 0.6)), D = Math.max(10, Math.min(28, ctx.info.d - 0.6));
  const livery = pick(rng, SAND_SHEET);
  sink.span('stone', -W / 2, -0.3, -D / 2, W / 2, 1.2, D / 2);
  sink.span('structureMetal', -W / 2, 1.2, -D / 2, W / 2, 5.2, D / 2, { colour: livery });
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 8, eave: 0.35, verge: 0.25, thickness: 0.08, bucket: 'structureMetal', ridge: 'saddle' };
  emitRoof(sink, roofGeometry(W, D, 5.2, roof), roof, rgb(0xb4b0a6));
  const front: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
  gateUnit(sink, front, 0, 0, Math.min(4.2, W - 2), 4.0, rgb(0x8a8e90), { bucket: 'structureMetal', width: 0.2, out: 0.06, colour: rgb(0x6a6e70) });
  for (const side of [-1, 1]) {
    const f: Face = { origin: [side * W / 2, 0, 0], u: [0, 0, -side], out: [side, 0, 0], width: D };
    for (let u = -D / 2 + 2; u < D / 2 - 1; u += 4) faceBox(sink, 'glass', f, u, 4.4, 0.01, 2.0, 0.6, 0.02, { decor: true });
  }
  return sink.finish();
};

/**
 * The Desert Patrol fort (Qasr al-Badia at Rum; the Redrock lane, 2026-10-07, the owner's "redrock is really rough": the
 * fort was a blank box in a harsh cork print). Rendered stone (round 9), the render fallen away in patches to the coursed
 * sandstone under it, a stone footing at the foot, sand drifted against the walls, sand-scoured at the foot;
 * a parapet of merlons on a coping over the wall walk; corner towers with arrow slits; a gate tower with an arched
 * gateway, its doors set back in the arch, a plain pennant over it; an inner court ringed by the post's rooms, their doors and
 * windows on the court, and a cistern head in it. The footprint is the old fort's (walls inset from the plot by a metre,
 * the towers half a tower out from the corners, the gate tower 0.7 m proud of the front).
 */
const fort: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(12, Math.min(22, ctx.info.w - 2.0)), D = Math.max(11, Math.min(20, ctx.info.d - 2.0));
  // (round 9, the gauntlet's wave 261: "clean, perfectly regular brick tile with crisp European crenellations and no
  // weathering, base staining or footing ... a new toy castle"): the walls rendered over their stone, the render fallen
  // away in patches to the coursed stone under it, a stone footing proud at the foot, sand drifted against the walls
  const t = 0.9, h = 5.0, wall: RegionalBucket = 'plaster';
  // the foot sand-scoured and darker, the courses paling a little up the wall (a per-corner occlusion the weathering
  // pass folds in), each wall a slightly different lot of stone
  // (round 11, the gauntlet's wave 282: "a hard, grime-free base line on the sand" — the foot darker and higher)
  const scour = (p: Vec3) => (p[1] < 0.25 ? 0.64 : p[1] < 1.1 ? 0.8 : p[1] < 1.9 ? 0.91 : 1.0);
  const lot = (): Rgb => { const k = 0.94 + rng() * 0.12; return [k * 1.02, k, k * 0.97]; };
  const span = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    sink.span(wall, x0, y0, z0, x1, y1, z1, { shadeAt: scour, tint: lot() });
    // the footing: the stone the render stops above, a hand proud of the wall and knee-high
    sink.span('stone', x0 - 0.07, -0.3, z0 - 0.07, x1 + 0.07, 0.55 + rng() * 0.25, z1 + 0.07, { shadeAt: scour, tint: lot() });
  };
  // (round 10, the gauntlet's wave 270: "a flat plane with a stucco noise texture and two rectangles of stone-block texture
  // pasted on like decals", "grey cobbled wedge ramps butted against its base") the walls' and towers' cores are the
  // coursed stone itself, and their render a skin 8 cm proud of it, laid in 0.35 m courses, each course one panel between
  // the holes; the holes are a few ragged patches where the render has fallen, more of them low and towards the ends, the
  // stone showing in them behind the render's broken edge. One lot of render to a face; no drift wedges, the ground is
  // the terrain's
  const skin = (face: Face, u0: number, u1: number, y0: number, y1: number) => {
    if (u1 - u0 < 0.3 || y1 - y0 < 0.3) return;
    const tint = lot(), size = Math.min(1, (u1 - u0) / 6);
    const holes: Array<[number, number, number, number]> = [];
    const n = Math.round((u1 - u0) * (y1 - y0) / 18 * (0.5 + rng() * 0.8));
    for (let k = 0; k < n; k++) {
      const end = rng() < 0.35;
      const cu = end ? (rng() < 0.5 ? u0 + rng() * 1.2 : u1 - rng() * 1.2) : u0 + rng() * (u1 - u0);
      holes.push([cu, y0 + (y1 - y0) * rng() * rng(), (0.5 + rng() * 1.3) * size, (0.35 + rng() * 0.8) * size]);
    }
    const rows = Math.max(1, Math.round((y1 - y0) / 0.35)), dy = (y1 - y0) / rows;
    const cols = Math.max(1, Math.round((u1 - u0) / 0.2)), du = (u1 - u0) / cols;
    for (let r = 0; r < rows; r++) {
      const y = y0 + (r + 0.5) * dy;
      for (let c = 0, run = -1; c <= cols; c++) {
        let lost = c === cols;
        if (!lost) {
          const u = u0 + (c + 0.5) * du, edge = 0.7 + 0.6 * rng();
          for (const [hu, hy, ru, ry] of holes) {
            const qu = (u - hu) / ru, qy = (y - hy) / ry;
            if (qu * qu + qy * qy < edge) { lost = true; break; }
          }
        }
        if (!lost && run < 0) run = c;
        if (lost && run >= 0) {
          const a = u0 + run * du, b = u0 + c * du;
          faceBox(sink, 'plaster', face, (a + b) / 2, y, 0.04, b - a, dy, 0.08, { tint, shadeAt: scour });
          run = -1;
        }
      }
    }
  };
  // a stone core on its footing (the footing a hand proud of the wall and knee-high)
  const core = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    // (round 11, the gauntlet's wave 282: the holes "hard-edged rectangular stone-block decals" — the core is the render's
    // brown coat, darker and redder, where the finish coat has fallen; the footing stays the coursed stone)
    const coat = lot();
    sink.span('plaster', x0, y0, z0, x1, y1, z1, { shadeAt: scour, tint: [coat[0] * 0.74, coat[1] * 0.63, coat[2] * 0.54] });
    sink.span('stone', x0 - 0.07, -0.3, z0 - 0.07, x1 + 0.07, 0.55 + rng() * 0.25, z1 + 0.07, { shadeAt: scour, tint: lot() });
  };
  const gateW = 3.2, gateH = 3.9, gateTowerW = 6.0, proud = 0.7;
  // the curtain walls: the back, the two sides, the front either side of the gate tower
  core(-W / 2, -0.3, -D / 2, W / 2, h, -D / 2 + t);
  core(-W / 2, -0.3, -D / 2 + t, -W / 2 + t, h, D / 2 - t);
  core(W / 2 - t, -0.3, -D / 2 + t, W / 2, h, D / 2 - t);
  core(-W / 2, -0.3, D / 2 - t, -gateTowerW / 2, h, D / 2);
  core(gateTowerW / 2, -0.3, D / 2 - t, W / 2, h, D / 2);
  // the coping along the wall heads (a pale lime-mortared course) and the merlons on its outer edge
  const coping = { tint: [1.12, 1.08, 1.0] as Rgb };
  const cope = (x0: number, z0: number, x1: number, z1: number) => sink.span(wall, x0, h, z0, x1, h + 0.18, z1, coping);
  cope(-W / 2 - 0.08, -D / 2 - 0.08, W / 2 + 0.08, -D / 2 + t);
  cope(-W / 2 - 0.08, -D / 2 + t, -W / 2 + t, D / 2 - t);
  cope(W / 2 - t, -D / 2 + t, W / 2 + 0.08, D / 2 - t);
  cope(-W / 2 - 0.08, D / 2 - t, -gateTowerW / 2, D / 2 + 0.08);
  cope(gateTowerW / 2, D / 2 - t, W / 2 + 0.08, D / 2 + 0.08);
  {
    // rendered between the towers (each corner tower covers 2.4 m of the walls' ends)
    const back: Face = { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W };
    const west: Face = { origin: [-W / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D };
    const east: Face = { origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D };
    const front: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    skin(back, -W / 2 + 2.4, W / 2 - 2.4, 0.75, h);
    skin(west, -D / 2 + 2.4, D / 2 - 2.4, 0.75, h);
    skin(east, -D / 2 + 2.4, D / 2 - 2.4, 0.75, h);
    skin(front, -W / 2 + 2.4, -gateTowerW / 2, 0.75, h);
    skin(front, gateTowerW / 2, W / 2 - 2.4, 0.75, h);
    // and on the court side: over the rooms along the back and the west wall, to the foot on the east and the front
    const backIn: Face = { origin: [0, 0, -D / 2 + t], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const westIn: Face = { origin: [-W / 2 + t, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D };
    const eastIn: Face = { origin: [W / 2 - t, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D };
    const frontIn: Face = { origin: [0, 0, D / 2 - t], u: [-1, 0, 0], out: [0, 0, -1], width: W };
    const roomsTop = Math.min(3.4, h - 0.6) + 0.5;
    skin(backIn, -W / 2 + 2.4, W / 2 - 2.4, roomsTop, h);
    skin(westIn, -D / 2 + 2.4, D / 2 - 2.4, roomsTop, h);
    skin(eastIn, -D / 2 + 2.4, D / 2 - 2.4, 0.75, h);
    skin(frontIn, -W / 2 + 2.4, -gateTowerW / 2, 0.75, h);
    skin(frontIn, gateTowerW / 2, W / 2 - 2.4, 0.75, h);
  }
  // (the merlons each a little different, worn at their tops, one in nine fallen)
  const merlon = (x0: number, z0: number, x1: number, z1: number, y = h + 0.18) => {
    if (rng() < 0.11) return;
    // (round 11, the gauntlet's wave 282: "identical oversized cube merlons" — smaller, each its own width and height)
    const inset = 0.05 + rng() * 0.12;
    sink.span(wall, x0 + inset, y, z0 + inset, x1 - inset, y + 0.5 + rng() * 0.35, z1 - inset, { decor: true, tint: lot() });
  };
  for (let x = -W / 2 + 0.3; x < W / 2 - 0.9; x += 1.5) {
    merlon(x, -D / 2 - 0.08, x + 0.8, -D / 2 + 0.42);
    if (x + 0.8 < -gateTowerW / 2 || x > gateTowerW / 2) merlon(x, D / 2 - 0.42, x + 0.8, D / 2 + 0.08);
  }
  for (let z = -D / 2 + 1.6; z < D / 2 - 1.6; z += 1.5) {
    merlon(-W / 2 - 0.08, z, -W / 2 + 0.42, z + 0.8);
    merlon(W / 2 - 0.42, z, W / 2 + 0.08, z + 0.8);
  }
  // the corner towers: 3.2 m square, half a tower out from the corners, a storey over the walls, slits in their faces
  const tw = 3.2, th = h + 2.4;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const tx = sx * (W / 2 - 0.8), tz = sz * (D / 2 - 0.8);
    core(tx - tw / 2, -0.3, tz - tw / 2, tx + tw / 2, th, tz + tw / 2);
    sink.span(wall, tx - tw / 2 - 0.1, th, tz - tw / 2 - 0.1, tx + tw / 2 + 0.1, th + 0.2, tz + tw / 2 + 0.1, coping);
    for (const k of [-1, 0, 1]) {
      merlon(tx + k * 1.15 - 0.36, tz + sz * (tw / 2 - 0.36), tx + k * 1.15 + 0.36, tz + sz * (tw / 2 + 0.1), th + 0.2);
      merlon(tx + sx * (tw / 2 - 0.36), tz + k * 1.15 - 0.36, tx + sx * (tw / 2 + 0.1), tz + k * 1.15 + 0.36, th + 0.2);
    }
    const outX: Face = { origin: [tx + sx * tw / 2, 0, tz], u: [0, 0, -sx], out: [sx, 0, 0], width: tw };
    const outZ: Face = { origin: [tx, 0, tz + sz * tw / 2], u: [sz, 0, 0], out: [0, 0, sz], width: tw };
    // rendered on their outer faces, and over the wall heads on their inner ones; the slits through the render
    const inX: Face = { origin: [tx - sx * tw / 2, 0, tz], u: [0, 0, sx], out: [-sx, 0, 0], width: tw };
    const inZ: Face = { origin: [tx, 0, tz - sz * tw / 2], u: [-sz, 0, 0], out: [0, 0, -sz], width: tw };
    for (const f of [outX, outZ]) skin(f, -tw / 2, tw / 2, 0.75, th);
    for (const f of [inX, inZ]) skin(f, -tw / 2, tw / 2, 0.75, th);
    for (const f of [outX, outZ]) for (const y of [2.6, 5.4]) faceBox(sink, 'dark', f, 0, y, 0.09, 0.16, 0.95, 0.02, { decor: true });
  }
  // the gate tower: 6 m wide, 0.7 m proud of the front, two metres over the walls; its arched gateway
  const gz = D / 2 + proud, gth = h + 2.0, gx = gateTowerW / 2;
  core(-gx, -0.3, D / 2 - t - 0.6, -gateW / 2, gth, gz);
  core(gateW / 2, -0.3, D / 2 - t - 0.6, gx, gth, gz);
  core(-gateW / 2, gateH + gateW / 2 + 0.25, D / 2 - t - 0.6, gateW / 2, gth, gz);
  {
    // its render: the jambs, the spandrels clear of the voussoirs, the head over the arch; the sides' proud foot and
    // their full depth over the wall heads
    const gf: Face = { origin: [0, 0, gz], u: [1, 0, 0], out: [0, 0, 1], width: 2 * gx };
    const zc = (D / 2 - t - 0.6 + gz) / 2, top = gateH + gateW / 2 + 0.35;
    for (const s of [-1, 1]) {
      const [a, b] = s < 0 ? [-gx, -gateW / 2] : [gateW / 2, gx];
      skin(gf, a, b, 0.75, gateH);
      skin(gf, s < 0 ? -gx : gateW / 2 + 0.35, s < 0 ? -gateW / 2 - 0.35 : gx, gateH, top);
      const side: Face = { origin: [s * gx, 0, zc], u: [0, 0, -s], out: [s, 0, 0], width: gz - (D / 2 - t - 0.6) };
      const [p0, p1] = s < 0 ? [D / 2 - zc, gz - zc] : [zc - gz, zc - D / 2];
      skin(side, p0, p1, 0.75, h);
      skin(side, -side.width / 2, side.width / 2, h + 0.18, gth);
    }
    skin(gf, -gx, gx, top, gth);
    // the back on the court: the jambs either side of the passage, the head over it
    const gb: Face = { origin: [0, 0, D / 2 - t - 0.6], u: [-1, 0, 0], out: [0, 0, -1], width: 2 * gx };
    skin(gb, -gx, -gateW / 2, 0.75, gateH);
    skin(gb, gateW / 2, gx, 0.75, gateH);
    skin(gb, -gx, gx, gateH, gth);
  }
  // the arch: seven voussoirs round a half circle over the jambs, the keystone proud
  const archR = gateW / 2, archY = gateH;
  for (let k = 0; k < 7; k++) {
    const a0 = Math.PI * k / 7, a1 = Math.PI * (k + 1) / 7, am = (a0 + a1) / 2;
    // centre on the ring 0.15 m out from the opening, the voussoir along the ring's tangent (sin, cos) there
    const cx = -Math.cos(am) * (archR + 0.15), cy = archY + Math.sin(am) * (archR + 0.15);
    const len = (archR + 0.3) * (a1 - a0) + 0.04, ts = Math.sin(am) * len / 2, tc = Math.cos(am) * len / 2;
    sink.member(wall, [cx - ts, cy - tc, gz - 0.02], [cx + ts, cy + tc, gz - 0.02], 0.32, k === 3 ? 0.18 : 0.08, [0, 0, 1],
      { tint: [1.1, 1.06, 0.98] });
  }
  // the tympanum: the arch's head closed by a recessed stone panel over the doors
  sink.span(wall, -gateW / 2, gateH - 0.05, D / 2 - t + 0.2, gateW / 2, gateH + archR + 0.3, D / 2 - t + 0.45, { tint: lot() });
  // the arch's head: the opening narrowing in four courses to the crown (each course's half-width the circle's at its
  // middle), the stone beside it filled through the tower's depth
  for (let k = 0; k < 4; k++) {
    const y0 = gateH + k * (archR + 0.25) / 4, y1 = gateH + (k + 1) * (archR + 0.25) / 4, ym = (y0 + y1) / 2 - gateH;
    const half = Math.sqrt(Math.max(0, archR * archR - ym * ym));
    for (const side of [-1, 1]) sink.span(wall, side < 0 ? -gateW / 2 : half, y0, D / 2 - t - 0.6, side < 0 ? -half : gateW / 2, y1, gz - 0.05,
      { tint: lot() });
  }
  // the doors stand back in the arch: the gateway's passage dark behind them
  const doorFace: Face = { origin: [0, 0, D / 2 - t + 0.2], u: [1, 0, 0], out: [0, 0, 1], width: gateW };
  gateUnit(sink, doorFace, 0, 0, gateW - 0.1, gateH - 0.05, rgb(0x4a3a2c), { bucket: 'structureWood', width: 0.1, out: 0.04, colour: rgb(0x3a2e24) });
  sink.span(wall, -gateW / 2, -0.3, D / 2 - t - 0.6, gateW / 2, gateH, D / 2 - t + 0.2, { tint: lot() });
  // the gate tower's merlons and the pennant over the gate
  for (let x = -gx + 0.2; x < gx - 0.5; x += 1.45) merlon(x, gz - 0.5, x + 0.8, gz, gth);
  sink.span('structureMetal', -0.05, gth, gz - 1.0, 0.05, gth + 6.5, gz - 0.9, { colour: rgb(0x8a8e90), decor: true });
  // (the facades lane, 2026-10-09; the owner: the fort "uses a country flag that we shouldn't use") no nation's flag: a
  // plain pennant of sun-faded khaki cloth on the gate tower's mast, 2.4 m to the fly, 0.9 m at the hoist
  {
    const fz = gz - 0.976, cloth = rgb(0xb9a98a);
    sink.prism('structureWood', [[0.06, gth + 5.4, fz], [2.46, gth + 5.9, fz], [0.06, gth + 6.3, fz]], [0, 0, 1], 0.032, { colour: cloth, decor: true });
  }
  // the court: rooms along the back and the west wall, flat roofs behind a low parapet, doors and windows on the court
  const ri = -D / 2 + t, rd = Math.min(4.2, D * 0.28), rh = 3.4;
  span(-W / 2 + t, -0.3, ri, W / 2 - t, rh, ri + rd);
  span(-W / 2 + t, -0.3, ri + rd, -W / 2 + t + Math.min(3.8, W * 0.22), rh, D / 2 - t - 1.6);
  const backRooms: Face = { origin: [0, 0, ri + rd], u: [1, 0, 0], out: [0, 0, 1], width: W - 2 * t };
  for (let u = -(W - 2 * t) / 2 + 2.2; u < (W - 2 * t) / 2 - 1.2; u += 3.4) {
    const isDoor = rng() < 0.5;
    faceBox(sink, 'dark', backRooms, u, isDoor ? 1.05 : 1.75, 0.01, isDoor ? 1.0 : 0.8, isDoor ? 2.1 : 0.9, 0.02, { decor: true });
    if (isDoor) faceBox(sink, 'structureWood', backRooms, u, 2.2, 0.04, 1.2, 0.12, 0.06, { colour: rgb(0x5a4632), decor: true });
  }
  const sideW = Math.min(3.8, W * 0.22), sideRooms: Face = { origin: [-W / 2 + t + sideW, 0, (ri + rd + D / 2 - t - 1.6) / 2], u: [0, 0, 1], out: [1, 0, 0], width: D / 2 - t - 1.6 - ri - rd };
  for (let u = -sideRooms.width / 2 + 1.6; u < sideRooms.width / 2 - 0.8; u += 3.2) faceBox(sink, 'dark', sideRooms, u, 1.05, 0.01, 1.0, 2.1, 0.02, { decor: true });
  // the roofs' parapets on the court side
  sink.span(wall, -W / 2 + t, rh, ri + rd - 0.25, W / 2 - t, rh + 0.5, ri + rd, { decor: true, tint: lot() });
  // the court's floor of beaten earth and its cistern head
  sink.span('plaster3', -W / 2 + t, -0.3, ri + rd, W / 2 - t, 0.06, D / 2 - t, { decor: true });
  sink.cylinder(wall, [W * 0.12, 0.06, (ri + rd + D / 2 - t) / 2], 'y', 0.75, 0.85, 10, { tint: lot() });
  sink.cylinder('dark', [W * 0.12, 0.81, (ri + rd + D / 2 - t) / 2], 'y', 0.02, 0.6, 10, { decor: true });
  return sink.finish();
};

/** A shelled block house: walls broken to stumps, the slab fallen in, rebar curling from the breaks. */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(5.4, ctx.info.w - 0.3), D = Math.max(6, ctx.info.d - 0.3), t = 0.25;
  for (const [x0, z0, x1, z1] of [[-W / 2, -D / 2, W / 2, -D / 2 + t], [-W / 2, D / 2 - t, W / 2, D / 2], [-W / 2, -D / 2 + t, -W / 2 + t, D / 2 - t], [W / 2 - t, -D / 2 + t, W / 2, D / 2 - t]] as const) {
    const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    for (let k = 0; k < 4; k++) {
      if (rng() < 0.3) continue;
      const a = k / 4, b = (k + 1) / 4, top = 0.6 + rng() * 2.4;
      if (along) sink.span('stone', x0 + (x1 - x0) * a, -0.3, z0, x0 + (x1 - x0) * b, top, z1);
      else sink.span('stone', x0, -0.3, z0 + (z1 - z0) * a, x1, top, z0 + (z1 - z0) * b);
    }
  }
  sink.member('plaster', [-W * 0.35, 0.2, -D * 0.2], [W * 0.3, 1.6, D * 0.25], 2.2, 0.2, [0, 1, 0], { decor: true, exposed: true });
  rooftop(sink, W * 0.5, D * 0.5, 0.2, rng);
  return sink.finish();
};

// ---- the base plots the first kit left to the generic yard (gauntlet wave 15: containers, gantries and steel water
// towers read as a rail yard, not a Jordanian desert outpost)

/** A shop row of the souq: one storey of rendered block, a run of shopfronts with rolling shutters and awnings, a flat
 *  roof behind a parapet with its tanks (the base marketRow plot). */
const souqRow: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the base market row's plot is wider than deep: the row lies along it, its shopfronts (+x) down one long side
  const plot = plotAxes(ctx.info);
  const W = Math.max(plot.turned ? 4.2 : 6, Math.min(10, plot.w - 0.6)), D = Math.max(plot.turned ? 6 : 10, Math.min(18, plot.d - 0.6));
  const H = 3.6, wall: RegionalBucket = ctx.wallBucket === 'stone' ? 'plaster' : ctx.wallBucket as RegionalBucket;
  const awning = plot.turned ? 0.8 : 1.1;
  alongPlot(sink, plot.turned, () => {
    sink.span('stone', -W / 2 - 0.05, -0.3, -D / 2 - 0.05, W / 2 + 0.05, 0.25, D / 2 + 0.05);
    sink.span(wall, -W / 2, 0.25, -D / 2, W / 2, H, D / 2);
    for (const [x0, z0, x1, z1] of [[-W / 2, -D / 2, W / 2, -D / 2 + 0.22], [-W / 2, D / 2 - 0.22, W / 2, D / 2], [-W / 2, -D / 2, -W / 2 + 0.22, D / 2], [W / 2 - 0.22, -D / 2, W / 2, D / 2]] as const) {
      sink.span(wall, x0, H, z0, x1, H + 0.6, z1);
    }
    // the shopfronts along the street side (+x): rolling shutters half up over dark shops, an awning over each
    const face: Face = { origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D };
    const n = Math.max(2, Math.floor(D / 3.2));
    for (let k = 0; k < n; k++) {
      const u = -D / 2 + (k + 0.5) * D / n, w = D / n - 0.7;
      faceBox(sink, 'dark', face, u, 1.45, 0.005, w, 2.3, 0.02, { decor: true });
      faceBox(sink, 'structureMetal', face, u, 2.15 + rng() * 0.25, 0.04, w, 0.9 + rng() * 0.4, 0.05, { colour: rgb(0x8a8e90), decor: true });
      faceBox(sink, 'structureMetal', face, u, 2.95, awning / 2, w + 0.3, 0.05, awning, { colour: pick(rng, SAND_SHEET), decor: true });
      faceBox(sink, 'structureWood', face, u, 3.3, 0.03, w * 0.8, 0.35, 0.04, { colour: pick(rng, STEEL_DOORS), decor: true });
    }
    rooftop(sink, W, D, H, rng);
  }, 1);
  return sink.finish();
};

/** Lock-up stores in place of a container row: a single storey of bare block with steel roller doors (containerRow). */
const lockUps: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(10, Math.min(16, ctx.info.w - 0.6)), D = Math.max(4.6, Math.min(6.4, ctx.info.d - 0.6)), H = 3.3;
  sink.span('stone', -W / 2, -0.3, -D / 2, W / 2, H, D / 2);
  sink.span('stone', -W / 2 - 0.08, H, -D / 2 - 0.08, W / 2 + 0.08, H + 0.25, D / 2 + 0.08);
  const face: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
  const n = Math.max(3, Math.floor(W / 3.4));
  for (let k = 0; k < n; k++) {
    const u = -W / 2 + (k + 0.5) * W / n;
    faceBox(sink, 'structureMetal', face, u, 1.3, 0.03, W / n - 0.8, 2.5, 0.05, { colour: pick(rng, STEEL_DOORS), decor: true });
  }
  rooftop(sink, W, D, H + 0.25, rng);
  return sink.finish();
};

/** A lorry shelter in place of a gantry crane: a steel portal canopy on columns over a concrete apron, open-sided. */
const lorryShelter: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(12, Math.min(20, ctx.info.w - 1.0)), D = Math.max(4.4, Math.min(6.0, ctx.info.d - 0.4)), H = 5.2;
  sink.span('stone', -W / 2, -0.3, -D / 2, W / 2, 0.12, D / 2);
  const steel = rgb(0x7a7e80);
  for (let k = 0, n = Math.max(3, Math.round(W / 5) + 1); k < n; k++) {
    const x = -W / 2 + 0.25 + (W - 0.5) * k / (n - 1);
    for (const z of [-D / 2 + 0.25, D / 2 - 0.25]) sink.span('structureMetal', x - 0.12, 0.12, z - 0.12, x + 0.12, H, z + 0.12, { colour: steel });
    sink.span('structureMetal', x - 0.1, H - 0.4, -D / 2 + 0.1, x + 0.1, H, D / 2 - 0.1, { colour: steel });
  }
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 6, eave: 0.4, verge: 0.3, thickness: 0.06, bucket: 'structureMetal', ridge: 'saddle' };
  sink.placed(Math.PI / 2, 0, 0, 0, () => emitRoof(sink, roofGeometry(D, W, H, roof), roof, pick(rng, SAND_SHEET)));
  return sink.finish();
};

/** The village water tower: four concrete legs with ring beams, a rendered concrete tank, a ladder (watertower). */
const concreteTower: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const S = Math.max(3.6, Math.min(5.0, Math.min(ctx.info.w, ctx.info.d) - 0.4)), legH = 9.0, tankH = 3.2;
  const c = S / 2 - 0.3;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) sink.span('plaster', sx * c - 0.22, -0.3, sz * c - 0.22, sx * c + 0.22, legH, sz * c + 0.22);
  for (const y of [3.2, 6.2]) {
    sink.span('plaster', -c - 0.15, y, -c - 0.15, c + 0.15, y + 0.3, -c + 0.15);
    sink.span('plaster', -c - 0.15, y, c - 0.15, c + 0.15, y + 0.3, c + 0.15);
    sink.span('plaster', -c - 0.15, y, -c + 0.15, -c + 0.15, y + 0.3, c - 0.15);
    sink.span('plaster', c - 0.15, y, -c + 0.15, c + 0.15, y + 0.3, c - 0.15);
  }
  sink.span('plaster', -S / 2, legH, -S / 2, S / 2, legH + tankH, S / 2);
  sink.span('plaster', -S / 2 - 0.12, legH + tankH, -S / 2 - 0.12, S / 2 + 0.12, legH + tankH + 0.25, S / 2 + 0.12);
  for (let y = 0.4; y < legH + tankH; y += 0.35) sink.span('structureMetal', c + 0.22, y, -0.25, c + 0.26, y + 0.04, 0.25, { colour: rgb(0x5a5e60), decor: true });
  return sink.finish();
};

/** The mosque's minaret: a slender rendered shaft on a square base, a balcony ring, a lantern and a pointed cap. */
const minaret: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const H = Math.max(10, Math.min(13, ctx.info.h)), B = 2.6;
  sink.span('stone', -B / 2, -0.3, -B / 2, B / 2, 2.4, B / 2);
  sink.cylinder('plaster', [0, 2.4, 0], 'y', H * 0.62 - 2.4, 0.95, 8, {}, 0.82, true, Math.PI / 8);
  const bal = H * 0.62;
  // the balcony: a corbelled slab and its solid parapet drum (an open ring shows its inner faces from above)
  sink.cylinder('plaster', [0, bal, 0], 'y', 0.3, 1.35, 8, {}, 1.35, true, Math.PI / 8);
  sink.cylinder('plaster', [0, bal + 0.3, 0], 'y', 0.55, 1.3, 8, { decor: true }, 1.3, true, Math.PI / 8);
  sink.cylinder('plaster', [0, bal + 0.3, 0], 'y', H * 0.2, 0.7, 8, {}, 0.7, true, Math.PI / 8);
  // (round 9, the gauntlet's wave 261: "a green-capped minaret that looks like a game token") the cap rendered as the shaft
  // under a brass finial and its crescent, as the village mosques' are
  const capY = bal + 0.3 + H * 0.2;
  sink.cylinder('plaster', [0, capY, 0], 'y', H * 0.16, 0.78, 8, {}, 0.08, true, Math.PI / 8);
  sink.cylinder('structureMetal', [0, capY + H * 0.16, 0], 'y', 0.95, 0.05, 6, { colour: rgb(0xa08a52) }, 0.03);
  sink.span('structureMetal', -0.2, capY + H * 0.16 + 0.95, -0.03, 0.2, capY + H * 0.16 + 1.05, 0.03, { colour: rgb(0xa08a52), decor: true });
  return sink.finish();
};

export const WADIRUM_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  adobe: blockHouse,
  depot: steelStore,
  warehouse: steelStore,
  factory: steelStore,
  caravanserai: fort,
  // the walled compounds of the village edge read as the patrol post's enclosure
  compound: fort,
  compoundSouk: fort,
  ruin,
  marketRow: souqRow,
  containerRow: lockUps,
  gantry: lorryShelter,
  watertower: concreteTower,
  minaret,
});

export const WADIRUM_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'wadirum',
  region: 'Wadi Rum, southern Jordan: flat-roofed block houses with rooftop tanks and rebar, the Desert Patrol fort, steel stores',
  surfaces: {
    roof: { kind: 'sheet', tint: [0.70, 0.68, 0.62] },
    // (the Redrock lane, 2026-10-07: the fort and the bare walls in the valley's own sandstone, laid in courses, where a
    // grey concrete block stood; the render finer and shallower than the shared tile — the fort's "cork" print)
    stone: { kind: 'sandstone', tint: [0.80, 0.62, 0.48] },
    sourced: { plaster: true, wood: true },
    relief: { plasterUv: 1.8, normal: 0.22, ao: 0.32 },
  },
  builders: WADIRUM_BUILDERS,
  // the courtyards: a block wall round the house's court, a gate (yards.ts)
  yard: { kinds: ['adobe'], fence: 'walladobe', gate: 'gate', shed: null, garden: false },
});

export type { RegionalParts };
