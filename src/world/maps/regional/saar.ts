// src/world/maps/regional/saar.ts — the Saar ironworks kit (Ironworks: the Völklingen ironworks on the Saar, fought over
// in March 1945). The works' iron and brick: the blast furnaces in their row — each furnace shaft banded in steel above
// its casting house, the Cowper stoves beside it under their domes, the bustle pipe and the hot-blast main, the uptakes
// and the downcomer at its top, the inclined skip hoist up from the ore bunkers; the rolling mills' long brick halls
// under sawtooth north lights, and among them the column-guided gas holders; conveyor galleries on lattice trestles;
// the colliery's headframe over its shaft hall with the winding-engine house behind it (the Saar coalfield at the works'
// gate); the works office in brick with yellow-brick bands under slate. The workers' terraces, the station, the water
// towers, the stacks and the shelled brick shells are the Ruhr kit's (ruhr.ts): the same coalfield brick.
import { PartSink, alongPlot, faceBox, facePanel, facePoint, rgb, shade, type Face, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, windowRhythm, type HouseDialect, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { RUHR_BUILDERS } from './ruhr.ts';
import { factoryStack } from './shared.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

const YELLOW_BRICK = 'plaster2' as const;
/** The works' steel: furnace plate rusted brown-grey, the stoves' darker shells, the trusses' oxide red, the sheet's grey. */
const PLATE = rgb(0x544840), STOVE = rgb(0x46403b), OXIDE = rgb(0x6a3f2e), TRUSS = rgb(0x3a3532), SHEET = rgb(0x6e7272);
/** The streaks down a furnace's and a stove's shell from their tops: the soot's black, the rust's brown (wave 176). */
const STREAK_SOOT: Rgb = [0.05, 0.045, 0.04], STREAK_RUST: Rgb = [0.27, 0.13, 0.07];
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

/** A texel of the steel tile's plain plate (between the corrugation's crest and its seams, off the rivet lines and the
 * laps): a shell pinned to it reads as smooth plate, its courses carried by their tones (wave 223: the tile's ribs run
 * round a shell read as "horizontal brick-like coursing"). */
const PLAIN_PLATE = [34.5 / 256, 60.5 / 256] as const;

/**
 * A shell's profile through its key points ([height, radius], rising), cut into riveted plate courses `course` m deep with
 * a seam band 6 cm deep under each course's top (none on a phone); and each band's kind: its course's index, or -1 for
 * a seam.
 */
function plateProfile(points: ReadonlyArray<readonly [number, number]>, course: number, seams: boolean): { profile: Array<[number, number]>; kinds: number[] } {
  const rAt = (y: number): number => {
    for (let k = 0; k + 1 < points.length; k++) {
      const [y0, r0] = points[k], [y1, r1] = points[k + 1];
      if (y <= y1 || k + 2 === points.length) return r0 + (r1 - r0) * Math.max(0, Math.min(1, (y - y0) / ((y1 - y0) || 1)));
    }
    return points[points.length - 1][1];
  };
  const y0 = points[0][0], y1 = points[points.length - 1][0];
  const cuts = new Set<number>(points.map((p) => +p[0].toFixed(3)));
  for (let y = y0 + course; y < y1 - 0.3; y += course) cuts.add(+y.toFixed(3));
  const ys = [...cuts].sort((a, b) => a - b);
  const profile: Array<[number, number]> = [[ys[0], rAt(ys[0])]], kinds: number[] = [];
  for (let i = 1; i < ys.length; i++) {
    const y = ys[i];
    if (seams && i < ys.length - 1 && y - ys[i - 1] > 0.3) {
      profile.push([y - 0.06, rAt(y - 0.06)]); kinds.push(i - 1);
      profile.push([y, rAt(y)]); kinds.push(-1);
    } else { profile.push([y, rAt(y)]); kinds.push(i - 1); }
  }
  return { profile, kinds };
}

/**
 * The shell's tones: each course its own patina (drawn from the look stream), a seam a shade under its course, and the
 * soot run down from the top in some of seven sectors round the shell (wave 176's streaks, now in the plate's own colour).
 */
function shellTones(base: Rgb, kinds: readonly number[], look: () => number, cx: number, cz: number, top: number, reach: number) {
  const tones = Array.from({ length: 48 }, () => 0.86 + look() * 0.2);
  const soot = Array.from({ length: 7 }, () => { const h = look(); return h < 0.4 ? 0 : (h - 0.4) / 0.6; });
  // (a sector's run is soot or rust)
  const run = Array.from({ length: 7 }, () => (look() < 0.6 ? STREAK_SOOT : STREAK_RUST));
  return (band: number, p: Vec3): Rgb => {
    const kind = kinds[band];
    const k = kind < 0 ? tones[(kinds[band - 1] ?? 0) % tones.length] * 0.8 : tones[kind % tones.length];
    const a = Math.atan2(p[2] - cz, p[0] - cx), sector = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 7) % 7;
    const t = Math.max(0, Math.min(1, (p[1] - (top - reach)) / reach)), s = soot[sector] * t * t * 0.8, c = run[sector];
    return [base[0] * k * (1 - s) + c[0] * s, base[1] * k * (1 - s) + c[1] * s, base[2] * k * (1 - s) + c[2] * s];
  };
}

/**
 * A blast furnace unit after the Völklinger Hütte's (round 4, gauntlet wave 223: round 3's furnace read as "a masonry silo
 * rather than a riveted steel Cowper stove" on "a small windowed brick house"): the ore and coke bunkers across the
 * plot's front and the inclined skip hoist from their pit up to the charging platform; the casting house round the
 * furnace's foot, a sheet-steel shed on a brick plinth under a monitor roof with its wide doors; the furnace a smooth
 * riveted shell (hearth, bosh, belly, the stack drawn in to its throat) in plate courses; the bustle main's ring over the
 * casting house roof with its tuyere stocks down through it; the flat charging platform with its railing, the skip's head
 * frame and the bell hoist's gallows; the four uptakes off the throat bent over into the gas header, the bleeders over
 * it, the downcomer falling to the dust catcher on its legs; the two Cowper stoves at the back under round domes, the hot
 * blast main from them to the bustle main.
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
  // the casting house round the furnace's foot, clear of the stoves; its walls under the bustle main
  const ch = 5.8, cz1 = Math.min(bz0 - 0.4, fz + fr + 3.0), cz0 = Math.min(cz1 - 4, Math.max(fz - fr - 2.2, stz + sr + 0.4));
  const SEG = mobile ? 16 : 28, PSEG = mobile ? 8 : 12;
  const plate = { uvPin: PLAIN_PLATE };
  sink.placed(0, f.cx, 0, f.cz, () => {
    // ---- the casting house: a brick plinth, sheet-steel walls to the eaves, a low gable under a monitor (its louvres
    // dark), the wide doors in each long side and the front; no windows of a house
    const hw = (W - 1.0) / 2, plinth = 1.0, cx0 = -hw, cx1 = hw;
    sink.span('stone', cx0, -0.4, cz0, cx1, plinth, cz1);
    sink.span('structureMetal', cx0 + 0.04, plinth, cz0 + 0.04, cx1 - 0.04, ch, cz1 - 0.04, { colour: SHEET });
    const ridge = ch + Math.min(1.6, (cz1 - cz0) * 0.16), mid = (cz0 + cz1) / 2;
    for (const [za, zb] of [[cz0 - 0.35, mid], [cz1 + 0.35, mid]] as const) {
      // each roof slope from its eave up to the ridge (corrugated, the plate's rust): its upper face counter-clockwise
      // seen from above and outside, its underside the reverse
      const ya = ch - 0.05, yb = ridge;
      const c: Vec3[] = za < zb
        ? [[cx0 - 0.3, ya, za], [cx0 - 0.3, yb, zb], [cx1 + 0.3, yb, zb], [cx1 + 0.3, ya, za]]
        : [[cx1 + 0.3, ya, za], [cx1 + 0.3, yb, zb], [cx0 - 0.3, yb, zb], [cx0 - 0.3, ya, za]];
      sink.quad('structureMetal', c[0], c[1], c[2], c[3], { colour: shade(OXIDE, 0.85) });
      sink.quad('structureMetal', c[3], c[2], c[1], c[0], { colour: shade(OXIDE, 0.6), decor: true });
    }
    // the gables (each counter-clockwise seen from inside, its outer cap facing out)
    sink.prism('structureMetal', [[cx0, ch, cz1], [cx0, ch, cz0], [cx0, ridge, mid]], [1, 0, 0], 0.08, { colour: SHEET });
    sink.prism('structureMetal', [[cx1, ch, cz0], [cx1, ch, cz1], [cx1, ridge, mid]], [-1, 0, 0], 0.08, { colour: SHEET });
    // the monitor: a raised strip along the ridge, its louvred sides dark
    sink.span('structureMetal', cx0 + 0.6, ridge - 0.1, mid - 0.9, cx1 - 0.6, ridge + 0.9, mid + 0.9, { colour: shade(OXIDE, 0.75), decor: true });
    for (const s of [-1, 1]) facePanel(sink, 'dark', { origin: [0, 0, mid + s * 0.91], u: [s, 0, 0], out: [0, 0, s], width: 2 * hw - 1.2 }, 0, ridge + 0.4, 0.01, 2 * hw - 1.6, 0.6, { decor: true });
    // the doors: two in each long side, one in the front (dark, steel-framed)
    for (const side of [-1, 1]) {
      const face: Face = { origin: [side * hw, 0, mid], u: [0, 0, -side], out: [side, 0, 0], width: cz1 - cz0 };
      for (const u of [-(cz1 - cz0) * 0.22, (cz1 - cz0) * 0.22]) facePanel(sink, 'dark', face, u, 2.2, 0.03, Math.min(2.8, (cz1 - cz0) * 0.3), 3.8, { decor: true });
    }
    facePanel(sink, 'dark', { origin: [0, 0, cz1], u: [1, 0, 0], out: [0, 0, 1], width: 2 * hw }, -hw * 0.45, 2.0, 0.03, Math.min(3.0, hw * 0.6), 3.6, { decor: true });
    // ---- the furnace: one smooth riveted shell, plate courses 1.8 m deep
    const hearthR = fr * 0.9, bellyR = fr * 1.06, throat = fr * 0.72, boshTop = 8.4, bellyTop = 10.4;
    const keys: Array<[number, number]> = [[-0.4, hearthR], [ch + 0.6, hearthR], [boshTop, bellyR], [bellyTop, bellyR], [fh - 1.0, throat], [fh, throat]];
    // (the collision-bearing core: the same on every tier, a hair inside the plated shell the eye sees; it casts the
    // shell's shadow)
    sink.revolve('structureMetal', [0, 0, fz], 'y', keys.map(([y, r]) => [y, r * 0.97] as [number, number]), 12, { ...plate, colour: PLATE });
    const shell = plateProfile(keys, 1.8, !mobile);
    sink.revolve('structureMetal', [0, 0, fz], 'y', shell.profile, SEG,
      { ...plate, colour: PLATE, decor: true, bandColour: shellTones(PLATE, shell.kinds, look, 0, fz, fh, fh * 0.55) });
    // the flashing where the shell passes the casting house roof
    sink.revolve('structureMetal', [0, 0, fz], 'y', [[ch - 0.2, hearthR + 0.12], [ch + 0.5, hearthR + 0.08]], SEG, { ...plate, colour: shade(OXIDE, 0.7), decor: true });
    // ---- the bustle main over the casting house roof, the tuyere stocks down from it to the hearth's tuyeres
    const ringY = ch + 2.4, ringR = bellyR + 0.7, ringN = mobile ? 12 : 22;
    for (let k = 0; k < ringN; k++) {
      const a0 = (k / ringN) * Math.PI * 2, a1 = ((k + 1) / ringN) * Math.PI * 2;
      sink.pipe('structureMetal', [Math.cos(a0) * ringR, ringY, fz + Math.sin(a0) * ringR], [Math.cos(a1) * ringR, ringY, fz + Math.sin(a1) * ringR], 0.48, PSEG,
        { ...plate, colour: OXIDE, decor: true, caps: true });
    }
    for (let k = 0; k < (mobile ? 6 : 12); k++) {
      const a = ((k + 0.5) / (mobile ? 6 : 12)) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      // each stock: down from the ring, then in through the roof to the tuyere at the hearth
      const p0: Vec3 = [c * ringR, ringY - 0.3, fz + s * ringR], p1: Vec3 = [c * (ringR - 0.1), ch + 0.2, fz + s * (ringR - 0.1)];
      const p2: Vec3 = [c * (hearthR + 0.2), 2.8, fz + s * (hearthR + 0.2)];
      sink.pipe('structureMetal', p0, p1, 0.17, 8, { ...plate, colour: shade(OXIDE, 0.85), decor: true, caps: true });
      sink.pipe('structureMetal', p1, p2, 0.15, 8, { ...plate, colour: shade(OXIDE, 0.85), decor: true, caps: true });
    }
    // ---- the charging platform: a flat deck wider than the throat on its brackets, its railing; the bell hoist's
    // gallows over the throat
    const top = fh, pw = throat + 2.0;
    sink.span('structureMetal', -pw, top, fz - pw, pw, top + 0.3, fz + pw, { colour: TRUSS, decor: true });
    for (const [bx, bz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      sink.member('structureMetal', [bx * throat * 0.7, top - 2.6, fz + bz * throat * 0.7], [bx * (pw - 0.3), top, fz + bz * (pw - 0.3)], 0.2, 0.2, [0, 1, 0],
        { colour: TRUSS, decor: true, exposed: true }, 0);
    }
    if (!mobile) {
      for (const [x0, z0, x1, z1] of [[-pw, -pw, pw, -pw], [-pw, pw, pw, pw], [-pw, -pw, -pw, pw], [pw, -pw, pw, pw]] as const) {
        for (const h of [1.1, 0.55]) sink.member('structureMetal', [x0, top + 0.3 + h, fz + z0], [x1, top + 0.3 + h, fz + z1], 0.05, 0.05, [0, 1, 0],
          { colour: TRUSS, decor: true, fine: true, exposed: true }, 0);
        const n = Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.2));
        for (let i = 0; i <= n; i++) {
          const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n;
          sink.member('structureMetal', [x, top + 0.3, fz + z], [x, top + 1.45, fz + z], 0.05, 0.05, [1, 0, 0], { colour: TRUSS, decor: true, fine: true, exposed: true }, 0);
        }
      }
    }
    // the bell hoist's gallows: two raked legs to a sheave beam over the throat, the bell rod down to it
    const gy = top + 4.6;
    for (const s of [-1, 1]) sink.member('structureMetal', [s * (throat + 0.4), top + 0.3, fz - 0.6], [s * 0.5, gy, fz - 0.6], 0.22, 0.22, [0, 0, 1], { colour: TRUSS, decor: true, exposed: true }, 0);
    sink.member('structureMetal', [-0.9, gy, fz - 0.6], [0.9, gy, fz - 0.6], 0.3, 0.3, [0, 1, 0], { colour: TRUSS, decor: true, exposed: true }, 0);
    sink.member('structureMetal', [0, gy, fz - 0.6], [0, top + 0.6, fz - 0.6], 0.08, 0.08, [1, 0, 0], { colour: IRON, decor: true, exposed: true }, 0);
    // ---- the gas offtakes: four uptakes standing off the throat's quarters, bent over into the gas header; the bleeders
    // over it with their flat bonnets; the downcomer falling from it to the dust catcher
    const hy = top + 5.8, header: Vec3 = [0, hy + 0.4, fz + 0.9];
    for (const [ux, uz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      const bx = ux * throat * 0.62, bz = fz + uz * throat * 0.62;
      const knee: Vec3 = [bx * 0.8, hy, bz + (header[2] - bz) * 0.2];
      sink.pipe('structureMetal', [bx, top + 0.3, bz], knee, 0.46, PSEG, { ...plate, colour: PLATE, decor: true, caps: true });
      sink.pipe('structureMetal', knee, header, 0.44, PSEG, { ...plate, colour: PLATE, decor: true, caps: true });
    }
    sink.revolve('structureMetal', [header[0], header[1] - 0.9, header[2]], 'y', [[0, 0.9], [1.6, 0.9], [1.9, 0.5], [2.0, 0]], SEG / 2, { ...plate, colour: PLATE, decor: true });
    for (const [bx, bz] of [[-0.45, -0.35], [0.45, 0.35]] as const) {
      sink.pipe('structureMetal', [header[0] + bx, header[1] + 0.9, header[2] + bz], [header[0] + bx, header[1] + 3.6, header[2] + bz], 0.24, 10, { ...plate, colour: PLATE, decor: true });
      sink.revolve('structureMetal', [header[0] + bx, header[1] + 3.6, header[2] + bz], 'y', [[0, 0.24], [0, 0.44], [0.32, 0.44], [0.36, 0]], 12, { ...plate, colour: shade(PLATE, 0.8), decor: true });
    }
    // the dust catcher beside the casting house on its four legs: a hopper cone, the drum, a round crown (its centre and
    // top are maps/saarWorks.ts CATCHER_U / CATCHER_V / CATCHER_TOP, where the gas main's branch meets it)
    const dcx = -W / 2 + 1.6, dcz = cz0 + 1.4, dr = 1.2, dc0 = ch + 1.6;
    sink.revolve('structureMetal', [dcx, 0, dcz], 'y', [[dc0 - 2.1, 0], [dc0 - 2.0, 0.3], [dc0, dr], [dc0 + 4.2, dr], [dc0 + 4.7, dr * 0.6], [dc0 + 4.9, 0]], SEG / 2,
      { ...plate, colour: STOVE, decor: true });
    for (const [lx, lz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      sink.member('structureMetal', [dcx + lx * dr * 0.62, -0.2, dcz + lz * dr * 0.62], [dcx + lx * dr * 0.62, dc0 + 0.2, dcz + lz * dr * 0.62], 0.2, 0.2, [0, 0, 1],
        { colour: TRUSS, decor: true, exposed: true }, 0);
    }
    sink.pipe('structureMetal', header, [dcx, dc0 + 4.6, dcz], 0.62, PSEG, { ...plate, colour: PLATE, decor: true, caps: true });
    // ---- the Cowper stoves at the back: smooth shells in plate courses under round domes to a small flat crown (never a
    // point: wave 176's "row of minarets"), the hot blast main from them to the bustle main
    for (const s of [-1, 1]) {
      const sx = s * (sr + 0.3);
      const dome: Array<[number, number]> = [[-0.4, sr], [sh, sr]];
      for (let k = 1; k <= 5; k++) { const a = (k / 6) * (Math.PI / 2); dome.push([sh + Math.sin(a) * sr * 0.86, Math.cos(a) * sr]); }
      dome.push([sh + sr * 0.88, 0.25], [sh + sr * 0.88, 0]);
      sink.revolve('structureMetal', [sx, 0, stz], 'y', [[-0.4, sr * 0.97], [sh, sr * 0.97], [sh + sr * 0.6, sr * 0.75], [sh + sr * 0.85, 0.2], [sh + sr * 0.85, 0]], 12,
        { ...plate, colour: STOVE });
      const st = plateProfile(dome, 2.4, false);
      sink.revolve('structureMetal', [sx, 0, stz], 'y', st.profile, SEG,
        { ...plate, colour: STOVE, decor: true, bandColour: shellTones(STOVE, st.kinds, look, sx, stz, sh, sh * 0.45) });
    }
    sink.pipe('structureMetal', [-(sr + 0.3), ringY, stz + sr * 0.9], [-(sr + 0.3) * 0.5, ringY, fz - ringR + 0.2], 0.55, PSEG, { ...plate, colour: OXIDE, decor: true, caps: true });
    // ---- the bunkers and their bins; the wagon arches through them
    sink.span('stone', -W / 2, -0.4, bz0, W / 2, bh, D / 2);
    sink.span('structureMetal', -W / 2 + 0.3, bh, bz0 + 0.3, W / 2 - 0.3, bh + 2.6, D / 2 - 0.3, { colour: SHEET });
    sink.span('structureMetal', -W / 2 + 0.2, bh + 2.6, bz0 + 0.2, W / 2 - 0.2, bh + 2.8, D / 2 - 0.2, { colour: TRUSS, decor: true });
    sink.band(YELLOW_BRICK, -W / 2 - 0.04, bh - 0.5, bz0 - 0.04, W / 2 + 0.04, bh - 0.25, D / 2 + 0.04, { decor: true });
    const arches = Math.max(2, Math.round(W / 4.2));
    for (const [z, out] of [[D / 2, 1], [bz0, -1]] as const) {
      const bf: Face = { origin: [0, 0, z], u: [out, 0, 0], out: [0, 0, out], width: W };
      for (let k = 0; k < arches; k++) facePanel(sink, 'dark', bf, -W / 2 + W * (k + 0.5) / arches, 1.6, 0.02, Math.min(2.8, W / arches - 0.9), 3.0, { decor: true });
    }
    // ---- the skip hoist: an inclined bridge from the bunkers' pit up to the charging platform on its trestle, its head
    // frame and sheave over the platform's edge
    const za = (bz0 + D / 2) / 2, ya = bh + 2.8, zb = fz + pw - 0.2, yb = top + 0.6;
    truss(sink, [0, ya, za], [0, yb, zb], 1.6, [0, 1, 0], 10, OXIDE, mobile);
    const zl = za - (za - zb) * 0.4, yl = ya + (yb - ya) * 0.4;
    for (const s of [-1, 1]) sink.member('structureMetal', [s * 0.8, 0, zl], [s * 0.8, yl, zl], 0.3, 0.3, [0, 0, 1], { colour: TRUSS, exposed: true }, 0);
    for (const s of [-1, 1]) sink.member('structureMetal', [s * 0.9, top + 0.3, zb + 0.2], [s * 0.6, top + 3.4, zb - 0.4], 0.2, 0.2, [0, 0, 1], { colour: TRUSS, decor: true, exposed: true }, 0);
    sink.cylinder('structureMetal', [-0.8, top + 3.3, zb - 0.4], 'x', 1.6, 0.42, 12, { colour: IRON, decor: true }, 0.42, true);
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
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
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
      // the north light's glazing bars read at range (wave 176: "no north-light glazing"), its sill and head rails, a
      // shattered pane or two gone to the dark behind
      for (let u = -W / 2 + 1.2; u < W / 2 - 0.8; u += 1.2) faceBox(sink, 'structureWood', up, u, y0 + rise * 0.5, 0.03, 0.08, rise * 0.75, 0.06, { colour: IRON, decor: true });
      for (const yy of [y0 + rise * 0.125, y0 + rise * 0.875]) faceBox(sink, 'structureWood', up, 0, yy, 0.04, W - 0.8, 0.09, 0.08, { colour: IRON, decor: true });
      // (the phones draw the same look stream: the panes' draws made and the panes dropped there, DESTRUCTION.md §8.4)
      sink.dressing(mobile, () => { for (let n2 = Math.floor(look() * 3); n2 > 0; n2--) facePanel(sink, 'dark', up, (look() - 0.5) * (W - 3), y0 + rise * 0.5, 0.02, 1.0, rise * 0.7, { decor: true }); });
    }
    // the blue-black engineering brick of the plinth, the downpipes from the parapet's hoppers, the works' soot run down
    // the long walls from the eaves (wave 176: "no soot, downpipes or plinth")
    sink.band('dark', b.x0 - 0.05, -0.4, b.z0 - 0.05, b.x1 + 0.05, 0.85, b.z1 + 0.05, { decor: true });
    for (const side of [-1, 1]) {
      const x = side < 0 ? b.x0 - 0.14 : b.x1 + 0.14;
      for (let z = b.z0 + 2.4; z < b.z1 - 1.0; z += 6.2) {
        sink.member('structureMetal', [x, wallH + 0.3, z], [x, 0.25, z], 0.12, 0.12, [1, 0, 0], { colour: IRON, decor: true, exposed: true }, 0);
        sink.span('structureMetal', x - 0.16, wallH + 0.25, z - 0.2, x + 0.16, wallH + 0.6, z + 0.2, { colour: IRON, decor: true });
      }
      const wallFace: Face = side < 0 ? { origin: [b.x0, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D } : { origin: [b.x1, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D };
      for (let k = 0; k < Math.max(2, Math.round(D / 7)); k++) {
        const u = -D / 2 + 1.5 + look() * (D - 3), w2 = 1.2 + look() * 2.2, drop = 1.6 + look() * 2.4;
        sink.quad('stone', facePoint(wallFace, u - w2 / 2, wallH - drop, 0.012), facePoint(wallFace, u + w2 / 2, wallH - drop, 0.012),
          facePoint(wallFace, u + w2 / 2, wallH + 0.55, 0.012), facePoint(wallFace, u - w2 / 2, wallH + 0.55, 0.012),
          { decor: true, shadeAt: (p) => (p[1] > wallH - 0.4 ? 0.36 : 0.72) });
      }
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

/**
 * The works' water tower as the Saar built them (the map-revival lane, 2026-10-06; wave 137's critics read the Ruhr kit's
 * square plank-seamed tank house as an American timber tank): a round brick shaft banded in yellow brick, corbelled out
 * to a brick drum round the tank with its ring of small windows, under a steep slate cone and a lantern. The drum fills
 * the plot; the cone's eaves stop at its edge.
 */
const saarWaterTower: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const half = Math.min(ctx.info.w, ctx.info.d) / 2;
  // the shaft on its plinth stand as the Ruhr kit's tower stood (its radius, its octagonal plinth, its 11.5 m head): the
  // ground contact a tower's base offers the battle (structureCollision.ts) is unchanged, only the tank house's look is
  // the Saar's (a 60-seed pacing control: the taller, narrower first draft's contact shortened the median 194 -> 170 s)
  // (the tank house's drum at most 7.2 m across: a shaft the damage kit topples (shell.ts readShaft, 8 m at most); the
  // map's 5.4 m tower lot draws a 4.7 m drum, as before)
  const T = Math.min(3.6, Math.max(1.6, half - 0.35)), R = Math.max(1.5, Math.min(2.2, half - 0.75)), H = 11.5, SEG = 16, turn = Math.PI / SEG;
  sink.cylinder('stone', [0, -0.4, 0], 'y', 0.9, R + 0.25, 8, {}, R + 0.2, true, Math.PI / 8);
  sink.cylinder('stone', [0, 0.5, 0], 'y', H - 0.5, R, SEG, {}, R * 0.94, true, turn);
  for (const y of [3.4, 7.0, 10.6]) {
    const r = R * (1 - 0.06 * (y - 0.5) / (H - 0.5)) + 0.05;
    sink.cylinder(YELLOW_BRICK, [0, y, 0], 'y', 0.3, r, SEG, { decor: true }, r, true, turn);
  }
  // the corbel out to the drum, the drum, its sill band and cornice. The corbel starts 2 cm over the shaft's head, so
  // the corbel and drum weld into a solid of their own: the tower's ground contact (structureCollision.ts, the solids
  // that reach below 1.8 m) is the shaft on its plinth, as the Ruhr kit's tower stood, not the drum's wider round
  // carried down to the ground
  sink.cylinder('stone', [0, H + 0.02, 0], 'y', 1.18, R * 0.94, SEG, {}, T, true, turn);
  const d0 = H + 1.2, dh = 4.2;
  sink.cylinder('stone', [0, d0, 0], 'y', dh, T, SEG, {}, T, true, turn);
  sink.cylinder(YELLOW_BRICK, [0, d0 + 0.9, 0], 'y', 0.22, T + 0.04, SEG, { decor: true }, T + 0.04, true, turn);
  sink.cylinder(YELLOW_BRICK, [0, d0 + dh - 0.35, 0], 'y', 0.35, T + 0.05, SEG, { decor: true }, T + 0.05, true, turn);
  // the drum's windows, one on every other facet (the facets' centres stand at T cos(pi / SEG))
  const rf = T * Math.cos(turn);
  for (let k = 0; k < SEG; k += 2) {
    const a = turn * 2 * k + turn * 2;
    const out: Vec3 = [Math.cos(a), 0, Math.sin(a)], u: Vec3 = [Math.sin(a), 0, -Math.cos(a)]; // (u to the right seen from outside)
    const face: Face = { origin: [out[0] * rf, 0, out[2] * rf], u, out, width: 2 * T * Math.sin(turn) };
    facePanel(sink, 'dark', face, 0, d0 + 2.3, 0.02, 0.5, 1.3, { decor: true });
  }
  // the cone: slate from the cornice's eave to the lantern, the lantern and its cap
  const c0 = d0 + dh, eave = Math.min(0.3, half - T + 0.02);
  sink.cylinder('roof', [0, c0, 0], 'y', 3.6, T + eave, SEG, {}, 0.32, true, turn);
  sink.cylinder('structureMetal', [0, c0 + 3.5, 0], 'y', 0.9, 0.38, 8, { colour: rgb(0x4a5551), decor: true }, 0.38, true);
  sink.cylinder('structureMetal', [0, c0 + 4.4, 0], 'y', 0.8, 0.5, 8, { colour: rgb(0x4a5551), decor: true }, 0.02, true);
  // the door at the shaft's foot
  const front: Face = { origin: [0, 0, R * Math.cos(turn)], u: [1, 0, 0], out: [0, 0, 1], width: 2 };
  doorUnit(sink, front, 0, 0.6, 1.0, 2.2, { leaf: DOOR, frame: { bucket: YELLOW_BRICK, width: 0.16, out: 0.06, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank' }, 0.6);
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
  // the Saar's own water tower (a round brick drum under a slate cone), in place of the Ruhr kit's square tank house
  watertower: saarWaterTower,
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

