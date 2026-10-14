// src/world/maps/regional/arcticYard.ts — the arctic kit's industrial-yard builders (props census #3, lane B
// 2026-10-14; extracted from arctic.ts as they were, then rebuilt here): the radar tower on the water tower's plot and
// the Jamesway hut on the container row's plot. The kit's shared parts (the modules, their doors, stairs and windows,
// the radome, the banks) stay in arctic.ts.
import { PartSink, faceBox, shade, type Face, type Vec3 } from './geometry.ts';
import { windowUnit } from './openings.ts';
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
    const leg = (sx: number, sz: number, y: number): Vec3 => { const k = y / H, r = B + (T - B) * k; return [sx * r, y, sz * r]; };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      sink.member('structureMetal', leg(sx, sz, -0.3), leg(sx, sz, H), 0.2, 0.2, [sx, 0, 0], { colour: GALV, exposed: true });
      sink.span('stone', sx * B - 0.45, -0.4, sz * B - 0.45, sx * B + 0.45, 0.25, sz * B + 0.45);
    }
    // the braces: an X in each face, panel by panel
    const panels = 4;
    for (let k = 0; k < panels; k++) {
      const ya = H * k / panels, yb = H * (k + 1) / panels;
      for (const [s1, s2, t1, t2] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]] as const) {
        // the face's outward normal: a face along x keeps its z sign, a face along z its x sign
        const out: Vec3 = s2 === t2 ? [0, 0, s2] : [s1, 0, 0];
        const opts = { colour: shade(GALV, 0.85), exposed: true } as const;
        sink.member('structureMetal', leg(s1, s2, ya), leg(t1, t2, yb), 0.09, 0.09, out, opts);
        sink.member('structureMetal', leg(t1, t2, ya), leg(s1, s2, yb), 0.09, 0.09, out, opts);
      }
    }
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
    // the equipment hut at the foot between two legs
    sink.span('plaster2', -1.1, 0, -B + 0.1, 1.1, 2.4, -B + 1.7);
    sink.span('roof', -1.2, 2.4, -B, 1.2, 2.55, -B + 1.8);
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
  // the floor platform on its sleepers
  sink.span('wood', x0, -0.3, z0, x1, fl, zH);
  // the canvas from the far end to the vestibule, bay by bay between the ribs (in the vertex-coloured steel bucket)
  const vx0 = x1 - vest;
  const bays = Math.max(1, Math.round((vx0 - x0) / 1.2)), bayW = (vx0 - x0) / bays, sag = 0.08;
  for (let k = 0; k < bays; k++) {
    const xa = x0 + k * bayW, tone = shade(OLIVE, 0.88 + 0.24 * wave(k * 1.7, zc));
    sink.cylinder('structureMetal', [xa, fl, zc], 'x', bayW / 2, r, 10, { colour: tone }, r - sag, false, -Math.PI / 2, Math.PI);
    sink.cylinder('structureMetal', [xa + bayW / 2, fl, zc], 'x', bayW / 2, r - sag, 10, { colour: tone }, r, false, -Math.PI / 2, Math.PI);
  }
  const endW: Face = { origin: [x0, 0, zc], u: [0, 0, 1], out: [-1, 0, 0], width: 2 * r };
  const pts: Array<[number, number]> = [];
  for (let k = 0; k <= 10; k++) { const a = Math.PI * k / 10; pts.push([-Math.cos(a) * r, fl + Math.sin(a) * r]); }
  // (round 3, wave 130: "a brick-patterned end wall": the timber bucket's plank print read as brick at range) painted
  // plywood, the hut's own olive a shade lighter
  sink.prism('structureWood', pts.map(([u, y]): Vec3 => [x0 + 0.06, y, zc + u]), [1, 0, 0], 0.05, { colour: shade(OLIVE, 1.25) });
  // (round 5) the arch's entrance end closed by the same plywood round the vestibule (its open end showed the canvas's inside)
  sink.prism('structureWood', pts.map(([u, y]): Vec3 => [vx0 - 0.11, y, zc + u]), [1, 0, 0], 0.05, { colour: shade(OLIVE, 1.25), decor: true });
  // the vestibule: a plywood box at the entrance end with its door and a window
  sink.span('plaster2', vx0, fl, zc - r * 0.62, x1, fl + r * 0.95, zc + r * 0.62);
  sink.span('roof', vx0 - 0.1, fl + r * 0.95, zc - r * 0.62 - 0.1, x1 + 0.1, fl + r * 0.95 + 0.12, zc + r * 0.62 + 0.1, { colour: OLIVE });
  const vf: Face = { origin: [x1, 0, zc], u: [0, 0, -1], out: [1, 0, 0], width: r * 1.24 };
  faceBox(sink, 'structureMetal', vf, 0, fl + 1.0, 0.04, 0.9, 2.0, 0.06, { colour: shade(PLY, 0.7), decor: true });
  // the ribs at the bays' ends, proud of the sagging canvas, and the window in the far end (dressing a phone draws and
  // drops: the window draws the build stream, which the phone must draw as often as the desktop does)
  sink.dressing(mobile, () => {
    for (let k = 1; k < bays; k++) {
      sink.cylinder('structureWood', [x0 + k * bayW - 0.04, fl, zc], 'x', 0.08, r + 0.03, 12, { colour: shade(OLIVE, 0.75), decor: true }, r + 0.03, false, -Math.PI / 2, Math.PI);
    }
    windowUnit(sink, endW, 0, fl + r * 0.35, 0.7, 0.6, WINDOW, rng, 0.4);
  });
  // the boardwalk along its side
  sink.span('wood', x0, -0.3, zH, x1, fl - 0.15, bb.maxZ - 0.15);
  // the banks: along the windward side (away from the boardwalk) and against the far end
  const north = boxFace(x0, z0, x1, zH, 'n'), far = boxFace(x0, z0, x1, zH, 'w');
  bank(sink, north, -north.width / 2 - 0.6, north.width / 2 + 0.6, 1.0, 0.8, 1.8, -0.3, zc + 3.1);
  bank(sink, far, -far.width / 2 - 0.4, far.width / 2 + 0.4, 1.1, 1.1, 1.6, -0.3, zc + 5.3);
  return sink.finish();
};

