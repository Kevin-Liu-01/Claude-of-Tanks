// src/world/maps/regional/arcticYard.ts — the arctic kit's industrial-yard builders (props census #3, lane B
// 2026-10-14; extracted from arctic.ts as they were, then rebuilt here): the radar tower on the water tower's plot and
// the Jamesway hut on the container row's plot. The kit's shared parts (the modules, their doors, stairs and windows,
// the radome, the banks) stay in arctic.ts.
import { PartSink, faceBox, rgb, shade, type Face, type Vec3 } from './geometry.ts';
import { buildHouse, holedPolygon } from './house.ts';
import { latticeFrame } from './lattice.ts';
import { doorUnit, windowUnit } from './openings.ts';
import type { RegionalBuilder } from './types.ts';
import { GALV, OLIVE, PLY, STEEL_DARK, WINDOW, bank, boxFace, clamp, radome, uvOffset, wallsIn, wave } from './arctic.ts';

/**
 * The radar tower (the water tower's plot): a four-legged lattice tower tapering to a railed platform under the short
 * range radar's radome, the cable ladder up one leg, the equipment hut at its foot.
 */
export const radarTower: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const mobile = ctx.tier === 'mobile';
  const fit = wallsIn(ctx, 0.1, 0.1);
  const B = Math.min(fit.w, fit.d) / 2 - 0.15, T = Math.max(1.0, B * 0.42), H = clamp(ctx.bounds.maxY - 1.8, 9, 13);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    // (props census #3, lane B 2026-10-14; the judges: "the equipment hut a plain plaster2 span with no door, window or
    // vent; the cable ladder not built; the open lattice falls as solid metal-clad drums") the lattice on its footings
    // (lattice.ts: legs, girts and X braces in every panel), recorded so it folds over as its members with the radome
    // as its crown; the cable ladder up the +x face; the hut a building with its door and window cut
    latticeFrame(sink, { foot: B, head: T, y0: 0.25, y1: H, size: 0.2, girt: 0.09, brace: 0.09, panels: 4, bucket: 'structureMetal', colour: GALV,
      pad: { bucket: 'stone', size: 0.9, top: 0.25 }, mobile },
      { x0: -T - 1.6, x1: T + 1.6, y0: H, y1: H + 0.6 + 2 * clamp(T + 0.4, 1.4, 2.4), z0: -T - 1.6, z1: T + 1.6, bucket: 'structureMetal', tint: GALV });
    sink.dressing(mobile, () => {
      const at = (y: number) => B + (T - B) * ((y - 0.25) / (H - 0.25));
      for (const dz of [-0.2, 0.2]) sink.member('structureMetal', [at(0.4) + 0.14, 0.4, dz], [at(H) + 0.14, H, dz], 0.035, 0.03, [1, 0, 0], { colour: STEEL_DARK, decor: true, exposed: true }, 0);
      for (let y = 0.7; y < H - 0.1; y += 0.32) sink.span('structureMetal', at(y) + 0.13, y - 0.012, -0.2, at(y) + 0.155, y + 0.012, 0.2, { colour: STEEL_DARK, decor: true, fine: true });
      // the cable tray up the -x face beside it
      sink.member('structureMetal', [-(at(0.4) + 0.1), 0.4, 0], [-(at(H) + 0.1), H, 0], 0.14, 0.04, [-1, 0, 0], { colour: shade(STEEL_DARK, 1.2), decor: true, exposed: true }, 0);
    });
    // the platform, its rail, and the radome on it
    sink.span('structureMetal', -T - 0.5, H, -T - 0.5, T + 0.5, H + 0.18, T + 0.5, { colour: GALV });
    if (!mobile) for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]] as const) {
      const r = T + 0.45;
      sink.member('structureMetal', [a[0] * r, H + 1.0, a[1] * r], [b[0] * r, H + 1.0, b[1] * r], 0.05, 0.05, [0, 1, 0], { colour: STEEL_DARK, decor: true, exposed: true });
      // (the connectivity sweep, 217: the rail stood on nothing) its posts from the platform, at the corner and mid-side
      for (const t of [0, 0.5]) {
        const px = (a[0] + (b[0] - a[0]) * t) * r, pz = (a[1] + (b[1] - a[1]) * t) * r;
        sink.member('structureMetal', [px, H + 0.16, pz], [px, H + 1.03, pz], 0.05, 0.05, [1, 0, 0], { colour: STEEL_DARK, decor: true, exposed: true }, 0.025);
      }
    }
    radome(sink, 0, H + 0.6, 0, clamp(T + 0.4, 1.4, 2.4), 14);
    // the equipment hut at the foot between two legs: a framed insulated hut on its pad, its steel door and a window cut,
    // a louvred vent and the cable entry, a flat roof with its fascia
    sink.placed(0, 0, 0, -B + 0.9, () => {
      sink.span('stone', -1.25, -0.4, -0.95, 1.25, 0.15, 0.95, { shade: 0.85 });
      sink.paint = null;
      const hut = buildHouse(sink, {
        w: 2.2, d: 1.6, plinth: null, storeys: [{ h: 2.3, wall: 'plaster2' }],
        roof: { kind: 'flat', pitchDeg: 0, eave: 0.1, verge: 0.1, thickness: 0.15, bucket: 'roof' }, gableBucket: 'plaster2',
        openings: [{ face: 'front', storey: 0, kind: 'door', u: -0.35, w: 0.85, y0: 0.15, h: 1.95 }, { face: 'right', storey: 0, kind: 'window', u: 0, w: 0.6, y0: 1.1, h: 0.5 }],
        chimneys: [], gutters: null, verge: null, reveal: 0.1,
      }, {
        window: (s2, face, o, y0) => windowUnit(s2, face, o.u, y0 + o.y0, o.w, o.h, WINDOW, ctx.rng, 0.3),
        door: (s2, face, o, y0) => doorUnit(s2, face, o.u, y0 + o.y0, o.w, o.h, { leaf: STEEL_DARK, frame: { bucket: 'structureMetal', width: 0.08, out: 0.04, colour: STEEL_DARK }, steps: { bucket: 'stone' }, leafKind: 'panel' }),
      });
      const f = hut.faces.front;
      faceBox(sink, 'structureMetal', f, 0.6, 1.7, 0.03, 0.45, 0.35, 0.06, { colour: STEEL_DARK, decor: true });
      for (let y = 1.58; y < 1.85; y += 0.07) faceBox(sink, 'structureMetal', f, 0.6, y, 0.065, 0.4, 0.025, 0.02, { colour: GALV, decor: true, fine: true });
      sink.cylinder('structureMetal', [0.9, 2.3, -0.5], 'y', 0.6, 0.06, 6, { colour: STEEL_DARK, decor: true });
    });
  });
  return sink.finish();
};

/**
 * The Jamesway hut (the container row's plot): an arched hut of insulated canvas over a timber floor on sleepers, its
 * plywood end walls with the door and a small window, the vestibule at its entrance and the boardwalk along its side.
 * Round 5 (gauntlet wave 224: "a uniform green quilted grid texture with no fabric sag, vestibules or weathering, and sits
 * on a brown sill on bare snow with no drift ... a giant green caterpillar"): the canvas in painted sheet (the timber print
 * read as a quilted grid), sagging a hand's breadth between the ribs, each bay its own sun-faded olive; the snow banked
 * along its windward side and against its far end.
 */
export const jamesway: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile';
  const bb = ctx.bounds;
  const walk = clamp((bb.maxZ - bb.minZ) * 0.22, 1.2, 2.0);
  const x0 = bb.minX + 0.15, x1 = bb.maxX - 0.15, z0 = bb.minZ + 0.15, zH = bb.maxZ - 0.15 - walk;
  const r = (zH - z0) / 2, zc = (z0 + zH) / 2, fl = 0.5, vest = clamp((x1 - x0) * 0.12, 1.6, 2.4);
  const timber = shade(PLY, 0.62);
  // (props census #3, lane B 2026-10-14; the judges: "the floor platform ONE solid wood span ... the vestibule ONE span box
  // under a slab roof, its door a slab standing proud with no opening ... the end window a unit stuck on the plywood")
  // the floor: its deck on joists on sleepers laid on the snow, the deck the structure
  sink.span('wood', x0, 0.36, z0, x1, fl, zH);
  sink.dressing(mobile, () => {
    for (let z = z0 + 0.25; z < zH - 0.1; z += 1.1) sink.span('structureWood', x0 - 0.1, -0.15, z - 0.1, x1 + 0.1, 0.14, z + 0.1, { colour: shade(timber, 0.8), decor: true });
    for (let x = x0 + 0.2; x < x1; x += 0.6) sink.span('structureWood', x - 0.05, 0.14, z0 + 0.05, x + 0.05, 0.36, zH - 0.05, { colour: timber, decor: true });
    for (let z = z0 + 0.12; z < zH; z += 0.15) sink.span('structureWood', x0, fl - 0.004, z - 0.002, x1, fl + 0.004, z + 0.002, { colour: shade(timber, 0.7), decor: true, fine: true });
  });
  // the canvas from the far end to the vestibule, bay by bay between the ribs (in the vertex-coloured steel bucket)
  const vx0 = x1 - vest;
  const bays = Math.max(1, Math.round((vx0 - x0) / 1.2)), bayW = (vx0 - x0) / bays, sag = 0.08;
  for (let k = 0; k < bays; k++) {
    const xa = x0 + k * bayW, tone = shade(OLIVE, 0.88 + 0.24 * wave(k * 1.7, zc));
    sink.cylinder('structureMetal', [xa, fl, zc], 'x', bayW / 2, r, 10, { colour: tone }, r - sag, false, -Math.PI / 2, Math.PI);
    sink.cylinder('structureMetal', [xa + bayW / 2, fl, zc], 'x', bayW / 2, r - sag, 10, { colour: tone }, r, false, -Math.PI / 2, Math.PI);
  }
  // the far end wall in plywood with its window cut through it; the entrance end closed round the vestibule
  const endW: Face = { origin: [x0 + 0.06, 0, zc], u: [0, 0, 1], out: [-1, 0, 0], width: 2 * r };
  const pts: Array<[number, number]> = [];
  for (let k = 0; k <= 10; k++) { const a = Math.PI * k / 10; pts.push([Math.cos(a) * r, fl + Math.sin(a) * r]); }
  const winY = fl + r * 0.35;
  holedPolygon(sink, 'structureWood', endW, pts,
    [{ u0: -0.35, u1: 0.35, y0: winY, y1: winY + 0.6 }], 0.05, 0.05, { colour: shade(OLIVE, 1.25) });
  sink.prism('structureWood', pts.map(([u, y]): Vec3 => [vx0 - 0.11, y, zc - u]), [1, 0, 0], 0.05, { colour: shade(OLIVE, 1.25), decor: true });
  // the vestibule: a framed plywood arctic entry, its door cut with a step under it and a canopy over it
  sink.placed(0, (vx0 + x1) / 2, fl, zc, () => {
    const vw = r * 1.24, vd = x1 - vx0;
    sink.paint = shade(PLY, 0.95);
    try {
      buildHouse(sink, {
        w: vd, d: vw, plinth: null, storeys: [{ h: r * 0.95, wall: 'structureWood' }],
        roof: { kind: 'shed', pitchDeg: 8, eave: 0.12, verge: 0.12, thickness: 0.1, bucket: 'roof' }, gableBucket: 'structureWood',
        openings: [{ face: 'right', storey: 0, kind: 'door', u: 0, w: 0.9, y0: 0, h: 1.95 }], chimneys: [], gutters: null, verge: null, reveal: 0.08,
      }, {
        window: () => {},
        door: (s2, face, o, y0) => doorUnit(s2, face, o.u, y0 + o.y0, o.w, o.h, { leaf: shade(PLY, 0.7), frame: { bucket: 'structureWood', width: 0.08, out: 0.04, colour: shade(OLIVE, 0.9) }, steps: null, leafKind: 'plank' }),
      });
    } finally { sink.paint = null; }
    sink.span('structureWood', vd / 2, -fl - 0.05, -0.6, vd / 2 + 0.5, -0.12, 0.6, { colour: timber, decor: true });
    sink.span('structureMetal', vd / 2, 2.15, -0.7, vd / 2 + 0.6, 2.22, 0.7, { colour: OLIVE, decor: true });
    for (const z of [-0.6, 0.6]) sink.member('structureWood', [vd / 2 + 0.02, 1.85, z], [vd / 2 + 0.55, 2.15, z], 0.05, 0.05, [0, 0, 1], { colour: timber, decor: true, exposed: true }, 0);
  });
  // the ribs at the bays' ends, proud of the sagging canvas, the tie-downs to their stakes, the window in the far end and
  // the stovepipe on its guys (dressing a phone draws and drops: the window draws the build stream, which the phone must
  // draw as often as the desktop does)
  sink.dressing(mobile, () => {
    for (let k = 1; k < bays; k++) {
      const x = x0 + k * bayW;
      sink.cylinder('structureWood', [x - 0.04, fl, zc], 'x', 0.08, r + 0.03, 12, { colour: shade(OLIVE, 0.75), decor: true }, r + 0.03, false, -Math.PI / 2, Math.PI);
      for (const side of [-1, 1]) sink.member('structureWood', [x, fl + 0.05, zc + side * (r + 0.02)], [x, -0.05, zc + side * (r + 0.6)], 0.02, 0.02, [1, 0, 0], { colour: rgb(0x8a8270), decor: true, exposed: true, fine: true }, 0);
    }
    sink.recess = 0.05;
    try { windowUnit(sink, endW, 0, winY, 0.7, 0.6, WINDOW, rng, 0.4); } finally { sink.recess = 0; }
    const px = vx0 - bayW * 0.6, py = fl + r + 0.9;
    sink.cylinder('structureMetal', [px, fl + r - 0.1, zc + r * 0.35], 'y', 1.1, 0.08, 8, { colour: STEEL_DARK, decor: true });
    sink.cylinder('structureMetal', [px, py, zc + r * 0.35], 'y', 0.12, 0.16, 8, { colour: STEEL_DARK, decor: true }, 0.04);
    for (const [dx, dz] of [[1.2, 0.6], [-1.2, 0.6], [0, -1.0]] as const) {
      sink.member('structureMetal', [px, py - 0.1, zc + r * 0.35], [px + dx, fl + r * 0.8, zc + r * 0.35 + dz], 0.012, 0.012, [0, 1, 0], { colour: STEEL_DARK, decor: true, exposed: true, fine: true }, 0);
    }
  });
  // the boardwalk along its side: boards on two stringers
  sink.span('wood', x0, fl - 0.2, zH, x1, fl - 0.15, bb.maxZ - 0.15);
  sink.dressing(mobile, () => {
    for (const z of [zH + 0.2, bb.maxZ - 0.35]) sink.span('structureWood', x0, -0.3, z - 0.07, x1, fl - 0.2, z + 0.07, { colour: shade(timber, 0.85), decor: true });
    for (let x = x0 + 0.15; x < x1; x += 0.3) sink.span('structureWood', x - 0.003, fl - 0.155, zH, x + 0.003, fl - 0.145, bb.maxZ - 0.15, { colour: shade(timber, 0.7), decor: true, fine: true });
  });
  // the banks: along the windward side (away from the boardwalk) and against the far end
  const north = boxFace(x0, z0, x1, zH, 'n'), far = boxFace(x0, z0, x1, zH, 'w');
  bank(sink, north, -north.width / 2 - 0.6, north.width / 2 + 0.6, 1.0, 0.8, 1.8, -0.3, zc + 3.1);
  bank(sink, far, -far.width / 2 - 0.4, far.width / 2 + 0.4, 1.1, 1.1, 1.6, -0.3, zc + 5.3);
  return sink.finish();
};

