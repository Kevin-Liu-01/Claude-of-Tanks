// src/world/landmarks/polarStations.ts — the polar station's module train, Jamesway hut and airstrip, the looks lane's own
// file (props census #12, 2026-10-15: extract-then-own from stations.ts on the coordinator's grant). This first cut is the
// three builders moved byte for byte, with the colours, the uv offset, the parameter reader and the footing they use copied
// from stations.ts as they stand there; stations.ts re-exports the builders, so the landmark registry is unchanged.
import { PartSink, rgb, shade, type Vec3 } from '../maps/regional/geometry.ts';
import { bar } from './kit.ts';
import { drapedPath } from './grounds.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

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
  sink.span('structureMetal', x0, floor - 0.25, -hd, x0 + total, floor, hd, { colour: STEEL_DARK });
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
    sink.span(k % 3 === 2 ? 'plaster3' : 'plaster', a + 0.02, floor, -hd, b - 0.02, top, hd);
    if (trim === TRIM_RED || trim === SIGN_YELLOW) sink.span('plaster2', a, top - 0.55, -hd - 0.04, b, top - 0.25, hd + 0.04, { decor: true });
    else sink.span('structureMetal', a, top - 0.55, -hd - 0.04, b, top - 0.25, hd + 0.04, { colour: trim, decor: true });
    sink.span('structureMetal', a - 0.05, top, -hd - 0.12, b + 0.05, top + 0.3, hd + 0.12, { colour: shade(paint, 0.78) });
    if (ctx.snowCap) sink.span('structureMetal', a + 0.1, top + 0.3, -hd + 0.05, b - 0.1, top + 0.46, hd - 0.05, { colour: SNOW, decor: true });
    // the joint battens at the module's ends (both long faces)
    for (const sz of [-1, 1]) sink.span('structureMetal', a - 0.06, floor, sz * hd - 0.05, a + 0.06, top - 0.55, sz * hd + 0.05, { colour: shade(paint, 0.7), decor: true });
    if (garage) {
      // the roller door on the front and the far end
      sink.quad('structureMetal', [a + 0.8, floor + 0.05, hd + 0.03], [b - 0.8, floor + 0.05, hd + 0.03], [b - 0.8, top - 0.9, hd + 0.03], [a + 0.8, top - 0.9, hd + 0.03], { colour: shade(STEEL, 0.75), decor: true });
      for (let y = floor + 0.4; y < top - 1.0; y += 0.35) sink.span('structureMetal', a + 0.8, y, hd + 0.03, b - 0.8, y + 0.04, hd + 0.06, { colour: shade(STEEL, 0.6), decor: true, fine: true });
      // the earth ramp up to the door
      sink.span('stone', a + 0.6, -0.3, hd, b - 0.6, floor - 0.05, hd + 1.6, { decor: true });
      continue;
    }
    // two windows on each long face
    for (const sz of [-1, 1]) for (const f of [0.3, 0.7]) {
      const x = a + L * f, z = sz * (hd + 0.03), y = floor + 1.3;
      const pts: Vec3[] = sz > 0 ? [[x - 0.45, y, z], [x + 0.45, y, z], [x + 0.45, y + 0.8, z], [x - 0.45, y + 0.8, z]]
        : [[x + 0.45, y, z], [x - 0.45, y, z], [x - 0.45, y + 0.8, z], [x + 0.45, y + 0.8, z]];
      sink.polygon('glass', pts, { decor: true });
    }
    // a roof vent or a stack
    if (ctx.rng() < 0.6) sink.span('structureMetal', a + L * 0.4, top + 0.3, -0.5, a + L * 0.6, top + 0.9, 0.3, { colour: STEEL, decor: true });
    else sink.cylinder('structureMetal', [a + L * 0.5, top + 0.3, -hd * 0.5], 'y', 2.2, 0.18, 8, { colour: IRON, decor: true });
  }
  // the arctic entries at two doors: a vestibule box, its door and the steps down
  for (const k of [Math.min(1, n - 1), Math.max(0, n - 3)]) {
    const cx = x0 + (k + 0.5) * L;
    sink.span('structureMetal', cx - 1.0, floor, hd, cx + 1.0, floor + 2.5, hd + 1.4, { colour: shade(PANEL_CREAM, 0.95) });
    sink.span('structureMetal', cx - 1.1, floor + 2.5, hd - 0.05, cx + 1.1, floor + 2.65, hd + 1.5, { colour: shade(PANEL, 0.75) });
    sink.quad('structureMetal', [cx - 0.45, floor + 0.02, hd + 1.42], [cx + 0.45, floor + 0.02, hd + 1.42], [cx + 0.45, floor + 2.0, hd + 1.42], [cx - 0.45, floor + 2.0, hd + 1.42], { colour: DOOR, decor: true });
    for (let s = 0; s < 2; s++) sink.span('structureWood', cx - 0.7, 0, hd + 1.4 + s * 0.35, cx + 0.7, floor - s * (floor / 2), hd + 1.75 + s * 0.35, { colour: TIMBER, decor: true });
  }
  return { parts: sink.finish() };
};

// ------------------------------------------------------------------------------------------------------------ jamesway

// (the first capture: the canvas read as a golden yellow under the snow's light) the olive drab of the huts' canvas, dark
const CANVAS_OLIVE = rgb(0x5a5a3e), PLYWOOD = shade(rgb(0x5a5a3e), 1.25);

/**
 * A Jamesway hut (the polar stations' prefabricated shelter from the 1950s): canvas over timber arches on a raised
 * plywood floor, its length along z, the plywood end walls, the door in a small vestibule on the front end with its
 * steps, the stovepipe through the canvas; snow lying along its crown on a snow map.
 */
export const jamesway: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = num(ctx, 'length', 6), W = num(ctx, 'width', 3), r = W / 2, floor = 0.45, z0 = -L / 2;
  footing(sink, ctx, 0, 0, r + 0.1, L / 2 + 0.1, 0.05);
  sink.span('structureWood', -r - 0.05, 0.05, z0, r + 0.05, floor, -z0, { colour: shade(PLYWOOD, 0.75) });
  const canvas = shade(CANVAS_OLIVE, 0.88 + 0.24 * ctx.variant());
  sink.cylinder('structureMetal', [0, floor, z0], 'z', L, r, 12, { colour: canvas }, r, false, -Math.PI / 2, Math.PI);
  // the arches showing as bands through the canvas (fine) and the crown's snow
  for (let z = z0 + 1.22; z < -z0 - 0.3; z += 1.22) sink.cylinder('structureMetal', [0, floor, z - 0.04], 'z', 0.08, r + 0.02, 12, { colour: shade(canvas, 0.78), decor: true, fine: true }, r + 0.02, false, -Math.PI / 2, Math.PI);
  if (ctx.snowCap) sink.cylinder('structureMetal', [0, floor, z0 + 0.1], 'z', L - 0.2, r + 0.05, 6, { colour: SNOW, decor: true }, r + 0.05, false, -0.55, 1.1);
  // the end walls: half discs of plywood
  for (const e of [-1, 1]) {
    const ring: Vec3[] = [];
    for (let k = 0; k <= 10; k++) { const a = Math.PI - (k / 10) * Math.PI; ring.push([Math.cos(a) * r, floor + Math.sin(a) * r, e * (L / 2)]); }
    sink.polygon('structureWood', e > 0 ? ring.reverse() : ring, { colour: PLYWOOD });
  }
  // the vestibule and the door on the front, the steps, the stovepipe
  sink.span('plaster2', -0.9, floor, -z0, 0.9, floor + 2.2, -z0 + 1.2);
  sink.span('structureWood', -1.0, floor + 2.2, -z0 - 0.05, 1.0, floor + 2.32, -z0 + 1.3, { colour: shade(PLYWOOD, 0.6) });
  sink.quad('structureWood', [-0.42, floor + 0.02, -z0 + 1.22], [0.42, floor + 0.02, -z0 + 1.22], [0.42, floor + 1.95, -z0 + 1.22], [-0.42, floor + 1.95, -z0 + 1.22], { colour: DOOR, decor: true });
  sink.span('structureWood', -0.6, 0, -z0 + 1.2, 0.6, floor * 0.5, -z0 + 1.55, { colour: TIMBER, decor: true });
  sink.cylinder('structureMetal', [r * 0.45, floor + r * 0.85, -z0 * 0.4], 'y', 1.4, 0.09, 6, { colour: IRON, decor: true });
  return { parts: sink.finish() };
};

// ------------------------------------------------------------------------------------------------------------ airstrip

/**
 * The station's airstrip (DYE-M's gravel strip, kept open by its graders and ploughs): the strip draped on the ground along
 * z, its edge markers (the props' barrels: a hull scatters them) every 30 m down both sides, the windsock on its mast
 * beside the strip's middle and the plywood shack of its radio operator. Built of the map's ground: on falling ground it
 * follows the slope (plan.ts drapes).
 */
export const airstrip: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = num(ctx, 'length', 60), W = num(ctx, 'width', 10), hw = W / 2;
  const gl = (lx: number, lz: number) => ctx.ground?.(lx, lz) ?? 0;
  drapedPath(sink, 'plaster3', ctx.ground, [0, -L / 2], [0, L / 2], W, { lift: 0.05, cell: 4 });
  const destructibles: Array<{ kind: string; x: number; z: number; yawDeg: number }> = [];
  for (let z = -L / 2; z <= L / 2 + 0.01; z += 30) for (const sx of [-1, 1]) destructibles.push({ kind: 'barrel', x: sx * (hw + 1.2), z, yawDeg: ctx.rng() * 360 });
  // the windsock: its mast, the hoop and the orange sock streaming down the wind
  const wx = hw + 4.5, wz = 0, wg = gl(wx, wz);
  sink.span('stone', wx - 0.4, Math.min(wg - 0.8, -0.6), wz - 0.4, wx + 0.4, wg + 0.3, wz + 0.4);
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
  // the radio shack on its skids by the windsock
  const sx0 = hw + 6.5, sz0 = 4, sg = Math.max(gl(sx0, sz0), gl(sx0 + 3, sz0), gl(sx0, sz0 + 2.4), gl(sx0 + 3, sz0 + 2.4));
  sink.span('structureWood', sx0 - 0.1, Math.min(sg - 0.4, -0.6), sz0, sx0 + 3.1, sg + 0.25, sz0 + 2.4, { colour: TIMBER });
  sink.span('plaster2', sx0, sg + 0.25, sz0 + 0.1, sx0 + 3, sg + 2.6, sz0 + 2.3);
  sink.span('structureMetal', sx0 - 0.15, sg + 2.6, sz0 - 0.05, sx0 + 3.15, sg + 2.75, sz0 + 2.45, { colour: STEEL });
  if (ctx.snowCap) sink.span('structureMetal', sx0, sg + 2.75, sz0 + 0.1, sx0 + 3, sg + 2.88, sz0 + 2.3, { colour: SNOW, decor: true });
  sink.quad('structureMetal', [sx0 - 0.02, sg + 0.3, sz0 + 1.6], [sx0 - 0.02, sg + 0.3, sz0 + 0.8], [sx0 - 0.02, sg + 2.2, sz0 + 0.8], [sx0 - 0.02, sg + 2.2, sz0 + 1.6], { colour: DOOR, decor: true });
  bar(sink, 'structureMetal', [sx0 + 2.6, sg + 2.75, sz0 + 1.2], [sx0 + 2.6, sg + 7.5, sz0 + 1.2], 0.05, { colour: STEEL_DARK, decor: true });
  return { parts: sink.finish(), tints: { plaster3: [0.62, 0.6, 0.58] }, destructibles };
};
