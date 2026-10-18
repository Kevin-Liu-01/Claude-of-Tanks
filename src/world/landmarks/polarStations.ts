// src/world/landmarks/polarStations.ts — the polar station's module train, Jamesway hut and airstrip, the looks lane's own
// file (props census #12, 2026-10-15: extract-then-own from stations.ts on the coordinator's grant). This first cut is the
// three builders moved byte for byte, with the colours, the uv offset, the parameter reader and the footing they use copied
// from stations.ts as they stand there; stations.ts re-exports the builders, so the landmark registry is unchanged. The
// second brings them to the r2 standard (WORKLIST #12: DYE-M, Cape Dyer, 1985): the Jamesway's quilted canvas and bow
// ribs, its sleepers and framed plywood ends; the module train's window frames, panel joints, handrails, radio whips and
// sign; the airstrip's plough berms, threshold markers and the shack's window and stove. Every draw is the old builders'.
import { PartSink, rgb, shade, type Face, type Vec3 } from '../maps/regional/geometry.ts';
import { bar } from './kit.ts';
import { drapedPath } from './grounds.ts';
import { holedPolygon } from '../maps/regional/house.ts';
import { chamferedSection, panelSlab, sectionMember, shellBody, type ShellHole } from '../maps/regional/steelMembers.ts';
import type { LandmarkBuilder, LandmarkBuildContext, LandmarkPlacement } from './types.ts';
import { finishLandmark, piece } from './pieces.ts';

const PANEL = rgb(0xd9d8d0), PANEL_CREAM = rgb(0xd3ccb8), TRIM_RED = rgb(0x8a3026), TRIM_BLUE = rgb(0x34506e);
const STEEL = rgb(0x7f868b), STEEL_DARK = rgb(0x4b5157), IRON = rgb(0x2c2e30);
const AVI_ORANGE = rgb(0xcf5a2e), AVI_WHITE = rgb(0xe8e8e2), SNOW = rgb(0xf0f3f6), TIMBER = rgb(0x5e4c3a);
const DOOR = rgb(0x3d4246), SIGN_YELLOW = rgb(0xd8a93a);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number): number => Math.max(min, Number(ctx.params[key]));

/** A concrete footing from below the ground (the piece's fall) up to `top`. */
function footing(sink: PartSink, ctx: LandmarkBuildContext, x: number, z: number, hw: number, hd: number, top = 0.35): void {
  sink.span('stone', x - hw, -0.6 - ctx.groundFall, z - hd, x + hw, top, z + hd);
}

// ------------------------------------------------------------------------------------------------------ module train

/**
 * The module train: the station's modules joined end to end along x on short steel stilts over the permafrost (the
 * utilidor's pipes under the floor), each module's cladding, its joint battens and its small windows, the trim band
 * under the eaves in the module's colour, the arctic entries with their steps at two doors, a taller garage module at
 * the east end with its roller door, the vents and stacks on the flat roof (a snow slab on a snow map).
 */
export const moduleTrain: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const n = Math.round(num(ctx, 'modules', 3)), L = num(ctx, 'length', 5), D = num(ctx, 'width', 6), Hm = num(ctx, 'height', 3);
  const stilt = num(ctx, 'stilts', 0.4), total = n * L, x0 = -total / 2, hd = D / 2, floor = stilt, eave = floor + Hm;
  const trims = [TRIM_RED, TRIM_BLUE, TRIM_RED, SIGN_YELLOW];
  // the stilts on their pads, the floor deck and the utilidor pipes under it
  for (let k = 0; k <= n; k++) for (const sz of [-1, 1]) {
    const x = x0 + k * L;
    footing(sink, ctx, x, sz * (hd - 0.4), 0.35, 0.35, 0.15);
    bar(sink, 'structureMetal', [x, 0.15, sz * (hd - 0.4)], [x, floor, sz * (hd - 0.4)], 0.24, { colour: STEEL_DARK });
  }
  // (the r2 sweep) the deck in its modules' floor cassettes, joined at every stilt line
  panelSlab(sink, 'structureMetal', x0, floor - 0.25, -hd, x0 + total, floor, hd, L, (k) => shade(STEEL_DARK, 0.94 + 0.08 * (k % 2)), shade(STEEL_DARK, 0.85));
  for (const z of [-1.2, -0.6]) {
    sink.cylinder('structureMetal', [x0, floor - 0.55, z], 'x', total, 0.18, 6, { colour: STEEL, decor: true });
    // (the connectivity sweep, 217: the pipes hung 12 cm under the deck on nothing) a hanger from the deck at every stilt line
    for (let k = 0; k <= n; k++) bar(sink, 'structureMetal', [x0 + k * L + (k === 0 ? 0.3 : k === n ? -0.3 : 0), floor - 0.24, z], [x0 + k * L + (k === 0 ? 0.3 : k === n ? -0.3 : 0), floor - 0.5, z], 0.04, { colour: STEEL_DARK, decor: true });
  }
  // the modules
  for (let k = 0; k < n; k++) {
    const a = x0 + k * L, b = a + L, garage = k === n - 1 && n > 2, top = garage ? eave + 1.6 : eave;
    const paint = k % 3 === 2 ? PANEL_CREAM : PANEL, trim = trims[(k + Math.floor(ctx.variant() * 4)) % 4];
    // (the arctic kit's panels: white, a module in three its pale blue-grey, the band under the eaves its orange or a dark trim)
    // (the looks lane's r2 sweep, 2026-10-16: 31 dark panes and doors stuck on solid boxes) the module's skin with its
    // windows, or the garage's roller door, cut through it: each cut lined, the pane or the door set back in it
    const mcx = (a + b) / 2, winX = [0.3, 0.7].map((f) => a + L * f), wy = floor + 1.3;
    const holes: ShellHole[] = garage
      ? [{ face: 's', u0: a + 0.8 - mcx, u1: b - 0.8 - mcx, y0: floor + 0.05, y1: top - 0.9, fill: 'leaf', leaf: shade(STEEL, 0.75), panels: false }]
      : winX.flatMap((x): ShellHole[] => [{ face: 's', u0: x - 0.45 - mcx, u1: x + 0.45 - mcx, y0: wy, y1: wy + 0.8, fill: 'glass' },
        { face: 'n', u0: mcx - x - 0.45, u1: mcx - x + 0.45, y0: wy, y1: wy + 0.8, fill: 'glass' }]);
    shellBody(sink, k % 3 === 2 ? 'plaster3' : 'plaster', a + 0.02, floor, -hd, b - 0.02, top, hd, holes, {},
      { reveal: 0.14, inset: garage ? 0.12 : 0.08, revealBucket: 'structureMetal', revealColour: shade(paint, 0.66) });
    if (trim === TRIM_RED || trim === SIGN_YELLOW) sink.span('plaster2', a, top - 0.55, -hd - 0.04, b, top - 0.25, hd + 0.04, { decor: true });
    else sink.span('structureMetal', a, top - 0.55, -hd - 0.04, b, top - 0.25, hd + 0.04, { colour: trim, decor: true });
    // (the r2 sweep) the flat roof in its insulated panels across the module, their seams in tone; the snow on it a
    // cushion with its edges rounded off by the wind
    sink.placed(Math.PI / 2, 0, 0, 0, () => panelSlab(sink, 'structureMetal', -hd - 0.12, top, a - 0.05, hd + 0.12, top + 0.3, b + 0.05, 1.2,
      (j) => shade(paint, 0.76 + 0.04 * (j % 2)), shade(paint, 0.72)));
    if (ctx.snowCap) sectionMember(sink, 'structureMetal', [a + 0.1, top + 0.3, 0], [b - 0.1, top + 0.3, 0],
      [[hd - 0.05, 0], [hd - 0.12, 0.12], [hd - 0.3, 0.16], [-hd + 0.3, 0.16], [-hd + 0.12, 0.12], [-hd + 0.05, 0]], { colour: SNOW, decor: true }, 'both', [0, 1, 0]);
    // the joint battens at the module's ends (both long faces)
    for (const sz of [-1, 1]) sink.span('structureMetal', a - 0.06, floor, sz * hd - 0.05, a + 0.06, top - 0.55, sz * hd + 0.05, { colour: shade(paint, 0.7), decor: true });
    if (garage) {
      // the roller door's slats on its curtain, set back in the cut, and its head box over the cut
      for (let y = floor + 0.4; y < top - 1.0; y += 0.35) sink.span('structureMetal', a + 0.82, y, hd - 0.115, b - 0.82, y + 0.04, hd - 0.095, { colour: shade(STEEL, 0.6), decor: true, fine: true });
      sink.span('structureMetal', a + 0.7, top - 0.9, hd, b - 0.7, top - 0.62, hd + 0.22, { colour: shade(STEEL, 0.7), decor: true });
      // the earth ramp up to the door
      sink.span('stone', a + 0.6, -0.3, hd, b - 0.6, floor - 0.05, hd + 1.6, { decor: true });
      continue;
    }
    // two windows on each long face (cut through the skin above)
    for (const sz of [-1, 1]) for (const f of [0.3, 0.7]) {
      const x = a + L * f, y = wy;
      // (props census #12) its frame, proud of the cladding
      const fz = sz * (hd + 0.035), frame = { colour: shade(paint, 0.62), decor: true, fine: true };
      for (const [p0, p1] of [[[x - 0.5, y - 0.05], [x + 0.5, y - 0.05]], [[x - 0.5, y + 0.85], [x + 0.5, y + 0.85]], [[x - 0.5, y - 0.05], [x - 0.5, y + 0.85]], [[x + 0.5, y - 0.05], [x + 0.5, y + 0.85]]] as const) {
        bar(sink, 'structureMetal', [p0[0], p0[1], fz], [p1[0], p1[1], fz], 0.07, frame);
      }
    }
    // the cladding's panel joints down both long faces (a panel every 1.2 m), stopping at the windows' frames
    for (let x = a + 1.2; x < b - 0.6; x += 1.2) for (const sz of [-1, 1]) {
      const cut = winX.some((w) => Math.abs(x - w) < 0.56);
      for (const [y0, y1] of cut ? [[floor + 0.05, wy - 0.1], [wy + 0.9, top - 0.6]] : [[floor + 0.05, top - 0.6]]) {
        sink.span('structureMetal', x - 0.025, y0, sz * hd - 0.02, x + 0.025, y1, sz * hd + 0.02, { colour: shade(paint, 0.82), decor: true, fine: true });
      }
    }
    // a roof vent or a stack
    if (ctx.rng() < 0.6) sink.span('structureMetal', a + L * 0.4, top + 0.3, -0.5, a + L * 0.6, top + 0.9, 0.3, { colour: STEEL, decor: true });
    else sink.cylinder('structureMetal', [a + L * 0.5, top + 0.3, -hd * 0.5], 'y', 2.2, 0.18, 8, { colour: IRON, decor: true });
  }
  // the arctic entries at two doors: a vestibule box, its door and the steps down
  for (const k of [Math.min(1, n - 1), Math.max(0, n - 3)]) {
    const cx = x0 + (k + 0.5) * L;
    // (the r2 sweep) the entry's skin with its door cut through, the leaf set back, the frame round the cut
    shellBody(sink, 'structureMetal', cx - 1.0, floor, hd, cx + 1.0, floor + 2.5, hd + 1.4,
      [{ face: 's', u0: -0.45, u1: 0.45, y0: floor + 0.02, y1: floor + 2.0, fill: 'leaf', leaf: DOOR }], { colour: shade(PANEL_CREAM, 0.95) },
      { reveal: 0.1, inset: 0.06, revealColour: shade(PANEL_CREAM, 0.7), frame: { bucket: 'structureMetal', colour: STEEL_DARK, width: 0.06, out: 0.03 } });
    sink.span('structureMetal', cx - 1.1, floor + 2.5, hd - 0.05, cx + 1.1, floor + 2.65, hd + 1.5, { colour: shade(PANEL, 0.75) });
    for (let s = 0; s < 2; s++) sink.span('structureWood', cx - 0.7, 0, hd + 1.4 + s * 0.35, cx + 0.7, floor - s * (floor / 2), hd + 1.75 + s * 0.35, { colour: TIMBER, decor: true });
    // (props census #12) the steps' handrails, on their posts
    for (const sx of [-1, 1]) {
      const rx = cx + sx * 0.68, rail = { colour: STEEL_DARK, decor: true };
      bar(sink, 'structureMetal', [rx, 0, hd + 2.05], [rx, 0.95, hd + 2.05], 0.05, rail);
      bar(sink, 'structureMetal', [rx, floor, hd + 1.42], [rx, floor + 0.9, hd + 1.42], 0.05, rail);
      bar(sink, 'structureMetal', [rx, 0.95, hd + 2.05], [rx, floor + 0.9, hd + 1.42], 0.045, rail);
    }
  }
  // (props census #12) the radio whips on the garage end's roof and the station sign over the first entry
  const xr = x0 + total - L * 0.5, topR = eave + (n > 2 ? 1.6 : 0) + 0.3;
  for (const dz of [-1.2, 1.2]) bar(sink, 'structureMetal', [xr, topR, dz], [xr, topR + 3.5, dz], 0.035, { colour: STEEL_DARK, decor: true });
  sink.span('structureMetal', x0 + (Math.min(1, n - 1) + 0.5) * L - 0.8, floor + 2.6, hd + 1.5, x0 + (Math.min(1, n - 1) + 0.5) * L + 0.8, floor + 2.95, hd + 1.55, { colour: SIGN_YELLOW, decor: true });
  return { parts: sink.finish() };
};

// ------------------------------------------------------------------------------------------------------------ jamesway

// (the first capture: the canvas read as a golden yellow under the snow's light) the olive drab of the huts' canvas, dark
const CANVAS_OLIVE = rgb(0x5a5a3e), PLYWOOD = shade(rgb(0x5a5a3e), 1.25);

/**
 * A Jamesway hut (the polar stations' prefabricated shelter from the 1950s): canvas over timber arches on a raised
 * plywood floor, its length along z, the plywood end walls, the door in a small vestibule on the front end with its
 * steps, the stovepipe through the canvas; snow lying along its crown on a snow map.
 * (props census #12, 2026-10-15, the r2 standard; WORKLIST: "Jamesway huts with laminated bow ribs and plywood ends ...
 * Jamesway canvas in quilted panels") The floor platform stands on three sleepers, its edge joist showing; the canvas is
 * quilted bay by bay, each panel bellied a few centimetres between its ribs and stitched along three seams; the laminated
 * bow ribs stand proud of it; each plywood end is framed (two studs, a header, its battens) and the rear one has its
 * window; the stovepipe carries its rain cap. The draws are the old hut's, in its order.
 */
export const jamesway: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = num(ctx, 'length', 6), W = num(ctx, 'width', 3), r = W / 2, floor = 0.45, z0 = -L / 2;
  footing(sink, ctx, 0, 0, r + 0.1, L / 2 + 0.1, 0.05);
  // the platform on its sleepers (three runners along the hut) and its edge joist
  // (the looks lane's r2 sweep, 2026-10-16: plain boxes carried 71 % of the hut) the floor laid in its 4 × 8 ft plywood
  // sheets, each its own tone, its edge joist round it; the sleepers sawn timbers with their arrises eased
  panelSlab(sink, 'structureWood', -r - 0.05, 0.25, z0, r + 0.05, floor, -z0, 1.22, (k) => shade(PLYWOOD, 0.72 + 0.06 * (k % 2)), shade(TIMBER, 0.7));
  for (const x of [-r + 0.25, 0, r - 0.25]) sectionMember(sink, 'structureWood', [x, 0.15, z0 + 0.1], [x, 0.15, -z0 - 0.1], chamferedSection(0.2, 0.2, 0.03), { colour: shade(TIMBER, 0.85) });
  const canvas = shade(CANVAS_OLIVE, 0.88 + 0.24 * ctx.variant());
  // the quilted canvas: bay by bay between the ribs, each panel bellied 3.5 cm at its middle, three seams along it
  const ribs: number[] = [z0];
  for (let z = z0 + 1.22; z < -z0 - 0.3; z += 1.22) ribs.push(z);
  ribs.push(-z0);
  for (let k = 0; k + 1 < ribs.length; k++) {
    const za = ribs[k], zb = ribs[k + 1], half = (zb - za) / 2, tone = shade(canvas, 0.94 + 0.12 * (k % 2));
    sink.cylinder('structureMetal', [0, floor, za], 'z', half, r, 12, { colour: tone }, r + 0.035, false, -Math.PI / 2, Math.PI);
    sink.cylinder('structureMetal', [0, floor, za + half], 'z', half, r + 0.035, 12, { colour: tone }, r, false, -Math.PI / 2, Math.PI);
    for (const a of [0.55, 1.5708, 2.59]) {
      sink.cylinder('structureMetal', [0, floor, za], 'z', half, r + 0.004, 1, { colour: shade(canvas, 0.6), decor: true, fine: true }, r + 0.04, false, a - Math.PI / 2 - 0.012, 0.024);
      sink.cylinder('structureMetal', [0, floor, za + half], 'z', half, r + 0.04, 1, { colour: shade(canvas, 0.6), decor: true, fine: true }, r + 0.004, false, a - Math.PI / 2 - 0.012, 0.024);
    }
  }
  // the laminated bow ribs, proud of the canvas, and the crown's snow
  for (let z = z0 + 1.22; z < -z0 - 0.3; z += 1.22) sink.cylinder('structureWood', [0, floor, z - 0.05], 'z', 0.1, r + 0.045, 12, { colour: shade(TIMBER, 0.95), decor: true }, r + 0.045, false, -Math.PI / 2, Math.PI);
  if (ctx.snowCap) sink.cylinder('structureMetal', [0, floor, z0 + 0.1], 'z', L - 0.2, r + 0.06, 6, { colour: SNOW, decor: true }, r + 0.06, false, -0.55, 1.1);
  // the end walls: half discs of plywood, each framed (two studs and a header), the rear one with its window
  for (const e of [-1, 1]) {
    const ring: Vec3[] = [];
    for (let k = 0; k <= 10; k++) { const a = Math.PI - (k / 10) * Math.PI; ring.push([Math.cos(a) * r, floor + Math.sin(a) * r, e * (L / 2)]); }
    const wy = floor + r * 0.62;
    if (e > 0) sink.polygon('structureWood', ring.reverse(), { colour: PLYWOOD });
    else {
      // (the r2 sweep: a dark pane stuck on the plywood) the rear end 5 cm of plywood with its window cut through it
      const endFace: Face = { origin: [0, 0, -L / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W };
      const pts: Array<[number, number]> = [];
      for (let k = 0; k <= 10; k++) { const a = (Math.PI * k) / 10; pts.push([Math.cos(a) * r, floor + Math.sin(a) * r]); }
      holedPolygon(sink, 'structureWood', endFace, pts, [{ u0: -0.3, u1: 0.3, y0: wy - 0.25, y1: wy + 0.25 }], 0.05, 0.05, { colour: PLYWOOD });
    }
    const zf = e * (L / 2 + 0.02), stud = { colour: shade(TIMBER, 0.8), decor: true };
    for (const x of [-r * 0.55, r * 0.55]) bar(sink, 'structureWood', [x, floor, zf], [x, floor + Math.sqrt(r * r - x * x) - 0.04, zf], 0.07, stud);
    bar(sink, 'structureWood', [-r * 0.78, floor + r * 0.6, zf], [r * 0.78, floor + r * 0.6, zf], 0.07, stud);
    if (e < 0) {
      const zw = -L / 2 + 0.025;
      sink.quad('glass', [0.3, wy - 0.25, zw], [-0.3, wy - 0.25, zw], [-0.3, wy + 0.25, zw], [0.3, wy + 0.25, zw], { decor: true });
      for (const [p, q] of [[[-0.36, wy - 0.31], [0.36, wy - 0.31]], [[-0.36, wy + 0.31], [0.36, wy + 0.31]], [[-0.33, wy - 0.31], [-0.33, wy + 0.31]], [[0.33, wy - 0.31], [0.33, wy + 0.31]]] as const) {
        bar(sink, 'structureWood', [p[0], p[1], zf - 0.01], [q[0], q[1], zf - 0.01], 0.06, { colour: shade(PLYWOOD, 0.55), decor: true, fine: true });
      }
    }
  }
  // the vestibule and the door on the front, the steps, the stovepipe and its rain cap
  // (the r2 sweep: a dark door plate on a solid box) the vestibule's skin with its door cut through, the leaf set back
  shellBody(sink, 'plaster2', -0.9, floor, -z0, 0.9, floor + 2.2, -z0 + 1.2,
    [{ face: 's', u0: -0.42, u1: 0.42, y0: floor + 0.02, y1: floor + 1.95, fill: 'leaf', leaf: DOOR }], {},
    { reveal: 0.09, inset: 0.05, revealBucket: 'structureWood', revealColour: shade(PLYWOOD, 0.6), frame: { bucket: 'structureWood', colour: shade(TIMBER, 0.8), width: 0.06, out: 0.03 } });
  sink.span('structureWood', -1.0, floor + 2.2, -z0 - 0.05, 1.0, floor + 2.32, -z0 + 1.3, { colour: shade(PLYWOOD, 0.6) });
  sink.span('structureWood', -0.6, 0, -z0 + 1.2, 0.6, floor * 0.5, -z0 + 1.55, { colour: TIMBER, decor: true });
  sink.cylinder('structureMetal', [r * 0.45, floor + r * 0.85, -z0 * 0.4], 'y', 1.4, 0.09, 6, { colour: IRON, decor: true });
  sink.cylinder('structureMetal', [r * 0.45, floor + r * 0.85 + 1.32, -z0 * 0.4], 'y', 0.2, 0.2, 6, { colour: IRON, decor: true }, 0.03);
  return { parts: sink.finish() };
};

// ------------------------------------------------------------------------------------------------------------ airstrip

/**
 * The station's airstrip (DYE-M's gravel strip, kept open by its graders and ploughs): the strip draped on the ground along
 * z, its edge markers (the props' barrels: a hull scatters them) every 30 m down both sides, the plough's berms and the
 * threshold markers. Built of the map's ground: on falling ground it follows the slope (plan.ts drapes).
 * (the looks lane, 227: the strip's collapse laid the default's heap over its whole 17,500 m2 and stood at 6 % of its
 * height) The strip is ground, all of it dressing (plan.ts `dressing`: no solid, no collision record, no collapse); the
 * windsock and the radio shack beside its middle stand as a set piece of their own, its child (stripShack), with its own
 * small body and its mast a frame of its own.
 */
export const airstrip: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = num(ctx, 'length', 60), W = num(ctx, 'width', 10), hw = W / 2;
  const gl = (lx: number, lz: number) => ctx.ground?.(lx, lz) ?? 0;
  drapedPath(sink, 'plaster3', ctx.ground, [0, -L / 2], [0, L / 2], W, { lift: 0.05, cell: 4 });
  const destructibles: Array<{ kind: string; x: number; z: number; yawDeg: number }> = [];
  for (let z = -L / 2; z <= L / 2 + 0.01; z += 30) for (const sx of [-1, 1]) destructibles.push({ kind: 'barrel', x: sx * (hw + 1.2), z, yawDeg: ctx.rng() * 360 });
  // the plough's berms along both edges, a step out from the markers, in segments down the slope
  for (let z = -L / 2; z < L / 2 - 0.5; z += 10) for (const sx of [-1, 1]) {
    const z1 = Math.min(L / 2, z + 10), bx = sx * (hw + 2.4), g0 = Math.min(gl(bx, z), gl(bx, z1)), g1 = Math.max(gl(bx, z), gl(bx, z1));
    sink.span('structureMetal', bx - 0.6, g0 - 0.3, z, bx + 0.6, g1 + 0.45, z1, { colour: SNOW, decor: true });
  }
  // the thresholds: four orange and white marker panels on their frames across each end
  for (const e of [-1, 1]) for (const fx of [-0.75, -0.25, 0.25, 0.75]) {
    const mx = fx * hw, mz = e * (L / 2 + 1.5), mg = gl(mx, mz);
    for (const s of [-0.5, 0.5]) bar(sink, 'structureMetal', [mx + s, mg - 0.3, mz], [mx + s, mg + 0.9, mz], 0.05, { colour: STEEL_DARK, decor: true });
    sink.span('structureMetal', mx - 0.55, mg + 0.35, mz - 0.02, mx + 0.55, mg + 0.85, mz + 0.02, { colour: (fx < 0) === (e < 0) ? AVI_ORANGE : AVI_WHITE, decor: true });
  }
  // its windsock and radio shack beside the strip's middle, on the ground the strip vetoes
  const children: LandmarkPlacement[] = [{ kind: 'stripShack', x: hw + SHACK_X, z: SHACK_Z, yawDeg: 0, ground: 'veto' }];
  return { parts: sink.finish(), tints: { plaster3: [0.62, 0.6, 0.58] }, destructibles, children };
};

/** The windsock and shack set piece's centre beside the strip's edge (the airstrip's frame, from the strip's edge). */
const SHACK_X = 6.9, SHACK_Z = 3;

/**
 * The airstrip's windsock and its radio operator's plywood shack (stripShack, the airstrip's child; their places beside
 * the strip as they stood, its frame centred on the pair). The windsock's mast, hoop and sock are a frame of their own
 * (pieces.ts: a lattice piece that goes over when the shack falls); the shack is the piece's body — its skids, its
 * plywood skin with its door and window cut through (the leaf and the pane set back in their reveals), its roof in its
 * ribbed panels, the stovepipe and the radio whip — so its fall is the shack's own small heap.
 */
export const stripShack: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const gl = (lx: number, lz: number) => ctx.ground?.(lx, lz) ?? 0;
  // the windsock: its footing, and its mast with the hoop and the orange sock streaming down the wind
  const wx = 4.5 - SHACK_X, wz = -SHACK_Z, wg = gl(wx, wz);
  sink.span('stone', wx - 0.4, Math.min(wg - 0.8, -0.6), wz - 0.4, wx + 0.4, wg + 0.3, wz + 0.4);
  piece(sink, { name: 'mast', kind: 'lattice', at: 'collapse', fall: 'topple' }, (sink) => {
    bar(sink, 'structureMetal', [wx, wg + 0.3, wz], [wx, wg + 6.5, wz], 0.12, { colour: STEEL });
    const sock: Vec3[] = [];
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; sock.push([wx + 0.15, wg + 6.2 + Math.sin(a) * 0.45, wz + Math.cos(a) * 0.45]); }
    // (the connectivity sweep, 217: the sock hung 9 cm off the mast) its hoop, and the arms that carry it from the mast
    for (let k = 0; k < 8; k++) bar(sink, 'structureMetal', sock[k], sock[(k + 1) % 8], 0.04, { colour: STEEL_DARK, decor: true });
    bar(sink, 'structureMetal', [wx, wg + 6.42, wz], [wx + 0.15, wg + 6.65, wz], 0.04, { colour: STEEL_DARK, decor: true });
    bar(sink, 'structureMetal', [wx, wg + 5.75, wz], [wx + 0.17, wg + 5.75, wz], 0.04, { colour: STEEL_DARK, decor: true });
    for (let k = 0; k < 8; k++) {
      const n = (k + 1) % 8, tip = (p: Vec3): Vec3 => [p[0] + 2.4, wg + 6.0 + (p[1] - wg - 6.2) * 0.4, p[2] * 0.4 + wz * 0.6];
      sink.quad('structureMetal', sock[k], sock[n], tip(sock[n]), tip(sock[k]), { colour: k % 2 ? AVI_ORANGE : AVI_WHITE, decor: true });
      sink.quad('structureMetal', tip(sock[k]), tip(sock[n]), sock[n], sock[k], { colour: shade(AVI_ORANGE, 0.7), decor: true });
    }
  });
  // the radio shack on its skids by the windsock
  const sx0 = 6.5 - SHACK_X, sz0 = 4 - SHACK_Z, sg = Math.max(gl(sx0, sz0), gl(sx0 + 3, sz0), gl(sx0, sz0 + 2.4), gl(sx0 + 3, sz0 + 2.4));
  // its skids, sawn timbers with their arrises eased, sunk into the snow, and the floor on them
  for (const z of [sz0 + 0.25, sz0 + 2.15]) sectionMember(sink, 'structureWood', [sx0 - 0.1, (Math.min(sg - 0.4, -0.6) + sg + 0.25) / 2, z], [sx0 + 3.1, (Math.min(sg - 0.4, -0.6) + sg + 0.25) / 2, z],
    chamferedSection(0.3, sg + 0.25 - Math.min(sg - 0.4, -0.6), 0.04), { colour: TIMBER });
  panelSlab(sink, 'structureWood', sx0 - 0.05, sg + 0.13, sz0 + 0.05, sx0 + 3.05, sg + 0.25, sz0 + 2.35, 1.22, (k) => shade(TIMBER, 0.9 + 0.08 * (k % 2)), shade(TIMBER, 0.75));
  // (the r2 standard: the door and the window were dark plates on the box) its plywood skin with the door in its -x end and
  // the window in its +x end cut through, the leaf and the pane set back, framed
  shellBody(sink, 'plaster2', sx0, sg + 0.25, sz0 + 0.1, sx0 + 3, sg + 2.6, sz0 + 2.3, [
    { face: 'w', u0: -0.4, u1: 0.4, y0: sg + 0.3, y1: sg + 2.2, fill: 'leaf', leaf: DOOR },
    { face: 'e', u0: -0.1, u1: 0.7, y0: sg + 1.2, y1: sg + 1.9, fill: 'glass' },
  ], {}, { reveal: 0.08, inset: 0.05, revealBucket: 'structureWood', revealColour: shade(TIMBER, 0.7), frame: { bucket: 'structureWood', colour: shade(TIMBER, 0.7), width: 0.06, out: 0.03 } });
  // its roof in ribbed steel panels, the eaves over the skin all round, the snow on it
  panelSlab(sink, 'structureMetal', sx0 - 0.15, sg + 2.6, sz0 - 0.05, sx0 + 3.15, sg + 2.75, sz0 + 2.45, 0.6, (k) => shade(STEEL, 0.92 + 0.08 * (k % 2)), shade(STEEL, 0.8));
  if (ctx.snowCap) sink.span('structureMetal', sx0, sg + 2.75, sz0 + 0.1, sx0 + 3, sg + 2.88, sz0 + 2.3, { colour: SNOW, decor: true });
  bar(sink, 'structureMetal', [sx0 + 2.6, sg + 2.75, sz0 + 1.2], [sx0 + 2.6, sg + 7.5, sz0 + 1.2], 0.05, { colour: STEEL_DARK, decor: true });
  // the stovepipe with its rain cap
  sink.cylinder('structureMetal', [sx0 + 0.6, sg + 2.7, sz0 + 1.9], 'y', 1.3, 0.08, 6, { colour: IRON, decor: true });
  sink.cylinder('structureMetal', [sx0 + 0.6, sg + 3.95, sz0 + 1.9], 'y', 0.18, 0.18, 6, { colour: IRON, decor: true }, 0.03);
  return { parts: finishLandmark(sink), tints: { plaster3: [0.62, 0.6, 0.58] } };
};
