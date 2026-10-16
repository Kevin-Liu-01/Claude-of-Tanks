// src/world/landmarks/stations.ts — the polar station's works (the map-content lane, 2026-10-09; owner: "some maps like
// whiteout crossing and mesa mines look unfinished and so empty"): the pieces a Distant Early Warning Line main station
// of the 1980s stood on the tundra — the search radar's radome on its tower building, the tropospheric-scatter
// "billboard" antennas that carried the line's traffic station to station (AN/FRC-45: a curved reflector some 18 m wide
// on a steel back frame, its feed horn on a short tower before it), the guyed lattice masts in their aviation bands, the
// module train (the station's living and working modules joined end to end on short steel stilts, the arctic entries
// at its doors), and the POL tank farm inside its concrete bund.
//
// Sizes from the type: the DEW Line's AN/FPS-19 radome stood on the module train's end over a two-storey tower building,
// a sphere some 12 m across; the billboards stood 9-18 m high, two to four to a station, facing the next station along
// the line; the masts 30-45 m; a main station's train ran 20-25 modules, each about 8.5 × 9.7 m; the tank farm's tanks
// 8-12 m across.
//
// Each piece is drawn in its own frame (x across, y up, z out of its front, ground at y = 0) into the regional part sink:
// it merges into the props' material buckets (no draw call of its own). The thin members (guys, lattice, rails, battens)
// are dressing; the bodies, the legs and the footings are structure.
import { LocalFrame, PartSink, rgb, shade, type EmitOptions, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { bar, revolve } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';
import { finishLandmark, piece } from './pieces.ts';
// (props census #12: the module train, the Jamesway and the airstrip are the looks lane's, in polarStations.ts)
export { airstrip, jamesway, moduleTrain } from './polarStations.ts';

const PANEL = rgb(0xd9d8d0), PANEL_CREAM = rgb(0xd3ccb8), TRIM_RED = rgb(0x8a3026);
const STEEL = rgb(0x7f868b), STEEL_DARK = rgb(0x4b5157), IRON = rgb(0x2c2e30), RADOME = rgb(0xeeeeea);
const AVI_ORANGE = rgb(0xcf5a2e), AVI_WHITE = rgb(0xe8e8e2), SNOW = rgb(0xf0f3f6), RUST = rgb(0x6e3c26);
const DOOR = rgb(0x3d4246);
// the arctic kit's billboard paints (maps/regional/arctic.ts): the panels a multiplier over white, the truss's steel, the
// feed tower's galvanised grey
const TROPO_PANEL: Rgb = [0.97, 0.975, 0.97], TROPO_WHITE = rgb(0xe8e9e6), TROPO_STEEL = rgb(0x5d6266), GALV = rgb(0xa3aaae);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const lerp = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const num = (ctx: LandmarkBuildContext, key: string, min: number): number => Math.max(min, Number(ctx.params[key]));

/** A concrete footing from below the ground (the piece's fall) up to `top`. */
function footing(sink: PartSink, ctx: LandmarkBuildContext, x: number, z: number, hw: number, hd: number, top = 0.35): void {
  sink.span('stone', x - hw, -0.6 - ctx.groundFall, z - hd, x + hw, top, z + hd);
}

/**
 * A footing seated on the ground at height y under it (a draped piece's legs: plan.ts drapes). It reaches down past the
 * piece's lowest ground, buried, so that its foot stands in the ground-contact band wherever the slope sets it
 * (structureCollision.ts: the movement record is the solids under 1.8 m over the base).
 */
function foot(sink: PartSink, x: number, z: number, hw: number, hd: number, y: number, top = 0.35): void {
  sink.span('stone', x - hw, Math.min(y - 0.8, -0.6), z - hd, x + hw, y + top, z + hd);
}

/** A rust stain down a sheet: the paint at the top, darker toward the foot (a coloured bucket's per-corner colour). */
const weathered = (base: Rgb, y0: number, y1: number, k = 0.22) => (p: Vec3): Rgb => {
  const t = Math.min(1, Math.max(0, (p[1] - y0) / Math.max(0.01, y1 - y0)));
  return lerp(lerp(base, RUST, k), base, Math.sqrt(t));
};

/** A ladder up a face from y0 to y1 at (x, z) with its rungs (dressing). */
function ladder(sink: PartSink, x: number, z: number, y0: number, y1: number, alongX: boolean, colour: Rgb): void {
  const o: EmitOptions = { colour, decor: true, fine: true };
  for (const s of [-0.22, 0.22]) {
    const a: Vec3 = alongX ? [x + s, y0, z] : [x, y0, z + s], b: Vec3 = alongX ? [x + s, y1, z] : [x, y1, z + s];
    bar(sink, 'structureMetal', a, b, 0.05, o);
  }
  for (let y = y0 + 0.3; y < y1 - 0.1; y += 0.35) {
    const a: Vec3 = alongX ? [x - 0.22, y, z] : [x, y, z - 0.22], b: Vec3 = alongX ? [x + 0.22, y, z] : [x, y, z + 0.22];
    bar(sink, 'structureMetal', a, b, 0.03, o);
  }
}

// --------------------------------------------------------------------------------------------------------------- radome

/**
 * The search radar's radome on its tower building: a two-storey clad block (the operations floor, its window band and
 * its door under a canopy, the outside stair to the roof), a drum on the roof and the white sphere on it, its panel
 * courses and the beacon at its crown; whip antennas and a snow slab on the flat roof.
 */
export const radomeTower: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const S = num(ctx, 'side', 7), H = num(ctx, 'height', 6), R = num(ctx, 'radius', 3.5);
  const h = S / 2, base = 0.5;
  footing(sink, ctx, 0, 0, h + 0.3, h + 0.3, base);
  // the block, its trim band under the parapet and the rust at its foot
  // (in the regional buckets the arctic kit paints: its white panels, its safety-orange band — maps/regional/arctic.ts)
  sink.span('plaster', -h, base, -h, h, H, h);
  sink.span('plaster2', -h - 0.05, H - 0.7, -h - 0.05, h + 0.05, H - 0.35, h + 0.05, { decor: true });
  sink.span('structureMetal', -h - 0.08, H, -h - 0.08, h + 0.08, H + 0.45, h + 0.08, { colour: shade(PANEL, 0.82) });
  // the panel battens (fine) and the window bands on every face but the stair's
  const frames: Array<{ u: Vec3; out: Vec3; o: Vec3 }> = [
    { u: [1, 0, 0], out: [0, 0, 1], o: [0, 0, h] }, { u: [0, 0, -1], out: [1, 0, 0], o: [h, 0, 0] },
    { u: [-1, 0, 0], out: [0, 0, -1], o: [0, 0, -h] }, { u: [0, 0, 1], out: [-1, 0, 0], o: [-h, 0, 0] }];
  const at = (f: typeof frames[number], u: number, y: number, out: number): Vec3 =>
    [f.o[0] + f.u[0] * u + f.out[0] * out, y, f.o[2] + f.u[2] * u + f.out[2] * out];
  frames.forEach((f, i) => {
    const bat = Math.max(3, Math.round(S / 1.2));
    for (let k = 1; k < bat; k++) {
      const u = -h + (k / bat) * S;
      sink.box('structureMetal', at(f, u, (base + H - 0.7) / 2, 0.025), [0.03, (H - 0.7 - base) / 2, 0.025], { colour: shade(PANEL, 0.86), decor: true, fine: true },
        new LocalFrame(f.u, [0, 1, 0], f.out, [0, 0, 0]));
    }
    if (i === 1) return;
    for (const y of [2.1, H - 2.2]) {
      for (let k = -1; k <= 1; k++) {
        const u = k * S * 0.28;
        sink.quad('glass', at(f, u - 0.6, y, 0.03), at(f, u + 0.6, y, 0.03), at(f, u + 0.6, y + 0.9, 0.03), at(f, u - 0.6, y + 0.9, 0.03), { decor: true });
      }
    }
  });
  // the door and its canopy on the front, the steps up to it
  sink.quad('structureMetal', [-0.55, base, h + 0.03], [0.55, base, h + 0.03], [0.55, base + 2.1, h + 0.03], [-0.55, base + 2.1, h + 0.03], { colour: DOOR, decor: true });
  sink.span('structureMetal', -1.1, base + 2.3, h, 1.1, base + 2.45, h + 1.3, { colour: shade(PANEL, 0.7), decor: true });
  for (let k = 0; k < 2; k++) sink.span('stone', -0.9, 0, h + 0.3 + k * 0.32, 0.9, base - k * 0.22, h + 0.62 + k * 0.32, { decor: true });
  // the outside stair to the roof on the right face (+x): a ladder in its cage
  ladder(sink, h + 0.3, -h * 0.4, base, H + 0.45, false, STEEL_DARK);
  // (the cage's side bars from the wall itself: the connectivity sweep, 217, found them 3 cm off it)
  for (let y = base + 2.2; y < H; y += 1.4) bar(sink, 'structureMetal', [h - 0.01, y, -h * 0.4 - 0.35], [h + 0.62, y, -h * 0.4 - 0.35], 0.04, { colour: STEEL_DARK, decor: true, fine: true });
  // the roof: a snow slab, the radome's drum and sphere
  if (ctx.snowCap) sink.span('structureMetal', -h + 0.1, H + 0.45, -h + 0.1, h - 0.1, H + 0.62, h - 0.1, { colour: SNOW, decor: true });
  const drumTop = H + 0.45 + 1.1, rb = R * 0.77;
  revolve(sink, 'structureMetal', 0, 0, [[rb + 0.25, H + 0.45], [rb + 0.25, drumTop], [rb, drumTop]], 16, { colour: STEEL });
  const yc = drumTop + R * Math.sin(40 * Math.PI / 180);
  const profile: Array<[number, number]> = [];
  for (let k = 0; k <= 9; k++) {
    const a = (-40 + (130 * k) / 9) * Math.PI / 180;
    profile.push([R * Math.cos(a), yc + R * Math.sin(a)]);
  }
  profile.push([0, yc + R]);
  // (props lane A #21, 2026-10-15; WORKLIST #21: "radome panels tear and fall exposing the reflector") the search
  // radar inside the sphere — its reflector, a wide parabolic cheese of panels on a backing frame, on its pedestal and
  // turning gear, the feed horn on its struts at the focus — hidden while the sphere stands, laid open when it tears
  reflector(sink, drumTop, rb, yc, R, (S * 0.37 + H * 0.23 + R * 0.11) % 1);
  // (props lane A, E12: the radome tears open on the side a round came from when the tower is breached; its whips come
  // off at the first damage; landmarks/pieces.ts) (#21: its inside the radar's, deep behind the hole)
  piece(sink, { name: 'radome', kind: 'tank', at: 'breached', vessel: { x: 0, z: 0, y0: drumTop, y1: yc + R, r: R, contents: 'none', insideM: 1.6 } }, (sink) => {
    revolve(sink, 'plaster', 0, 0, profile, 20);
    // the panel courses (fine rings) and the beacon at the crown
    for (const deg of [-10, 20, 48, 72]) {
      const a = deg * Math.PI / 180, r = R * Math.cos(a) + 0.02, y = yc + R * Math.sin(a);
      revolve(sink, 'structureMetal', 0, 0, [[r, y - 0.04], [r, y + 0.04]], 20, { colour: shade(RADOME, 0.84), decor: true, fine: true });
    }
    sink.span('structureMetal', -0.12, yc + R - 0.05, -0.12, 0.12, yc + R + 0.35, 0.12, { colour: TRIM_RED, decor: true });
  });
  // whip antennas on the roof's corners
  for (const [k, [sx, sz]] of ([[-1, -1], [1, 1]] as const).entries()) {
    piece(sink, { name: `whip-${k}`, kind: 'detach', at: 'damaged', fall: 'drop' }, (s) =>
      bar(s, 'structureMetal', [sx * (h - 0.6), H + 0.45, sz * (h - 0.6)], [sx * (h - 0.6), H + 4.2, sz * (h - 0.6)], 0.05, { colour: STEEL_DARK, decor: true }));
  }
  return { parts: finishLandmark(sink) };
};

/**
 * The search radar inside the radome (an AN/FPS-19's kind): its pedestal on the drum's floor, the turning gear, the
 * reflector — a wide shallow parabolic cheese of mesh panels in a frame, its back braced — facing `azimuth`, and the feed
 * horn on its struts at the focus; all within the sphere (radius R about yc). Structure metal, decor: no collision.
 */
function reflector(sink: PartSink, floor: number, rb: number, yc: number, R: number, turn: number): void {
  const azimuth = turn * Math.PI * 2, ca = Math.cos(azimuth), sa = Math.sin(azimuth);
  const rot = (x: number, y: number, z: number): Vec3 => [x * ca + z * sa, y, -x * sa + z * ca];
  const dec = { decor: true } as const;
  // the deck across the drum, the pedestal on it and its turning gear
  revolve(sink, 'structureMetal', 0, 0, [[rb, floor + 0.02], [0.24, floor + 0.02]], 16, { colour: STEEL_DARK, ...dec });
  bar(sink, 'structureMetal', [0, floor, 0], [0, yc - 0.35, 0], 0.22, { colour: STEEL_DARK, ...dec });
  revolve(sink, 'structureMetal', 0, 0, [[0.45, yc - 0.55], [0.45, yc - 0.3], [0.3, yc - 0.3]], 12, { colour: IRON, ...dec });
  // the reflector: W wide, Hh tall, its face concave toward +z (the parabola's sag `sag` at the rim), a little behind the axis
  const W = R * 1.6, Hh = R * 0.7, sag = R * 0.22, back = -R * 0.12, cols = 10, rows = 4;
  const at = (i: number, j: number): Vec3 => {
    const x = (i / cols - 0.5) * W, y = (j / rows - 0.5) * Hh;
    return rot(x, yc + y + 0.1, back + sag * ((2 * x / W) ** 2 * 0.8 + (2 * y / Hh) ** 2 * 0.2));
  };
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    const panel = (i + j) % 2 ? STEEL : shade(STEEL, 0.9);
    sink.quad('structureMetal', a, b, c, d, { colour: panel, ...dec });
    sink.quad('structureMetal', d, c, b, a, { colour: shade(STEEL_DARK, 0.9), ...dec });
  }
  // its frame: the rim and the ribs, and the backing struts to the turning gear
  for (let i = 0; i <= cols; i += 2) bar(sink, 'structureMetal', at(i, 0), at(i, rows), 0.035, { colour: STEEL_DARK, ...dec });
  for (const j of [0, rows]) for (let i = 0; i < cols; i++) bar(sink, 'structureMetal', at(i, j), at(i + 1, j), 0.04, { colour: STEEL_DARK, ...dec });
  for (const i of [2, 5, 8]) bar(sink, 'structureMetal', at(i, rows / 2), rot(0, yc - 0.3, back - 0.4), 0.04, { colour: STEEL_DARK, ...dec });
  // the feed horn at the focus on its two struts from the reflector's lower rim
  const focus = rot(0, yc - 0.1, back + R * 0.62);
  for (const i of [3, 7]) bar(sink, 'structureMetal', at(i, 0), focus, 0.03, { colour: STEEL, ...dec });
  const f = focus;
  sink.box('structureMetal', f, [0.16, 0.12, 0.2], { colour: IRON, ...dec }, new LocalFrame(rot(1, 0, 0), [0, 1, 0], rot(0, 0, 1), [0, 0, 0]));
}

// -------------------------------------------------------------------------------------------------------- billboards

/**
 * A tropospheric-scatter "billboard" antenna, built as the arctic kit builds the station's own (maps/regional/arctic.ts
 * tropo: map-revival lane 2's round 5 after gauntlet wave 224 — "a flat drive-in-movie screen", "a thin billboard on a
 * cage that seems to hover above the snow"), so the billboards out on the high ground match the station's: the face
 * concave to the front (+z) with a sag of a sixth of its width, in 28 strips shading darker toward the edges, its joints
 * every sixth of the height and every fourth strip, the edge ribs and the rails along its head and foot; the space truss
 * behind it (a flat rear plane 2.2 m behind the vertex, verticals at nine stations front and rear, six levels of chords,
 * the webs, the rear plane braced in X), four raking legs to footings behind; the feed horn on its braced lattice tower
 * at the focus, its waveguide down the tower; the transmitter module beside it on its piles. On falling ground (plan.ts
 * drapes) the face clears the highest ground under it and every vertical and leg foots on the ground under it.
 */
export const troposcatter: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const bw = num(ctx, 'width', 8), H = Math.max(6, Math.min(Number(ctx.params.height), bw * 0.9)), clear = num(ctx, 'clearance', 1.2);
  const gl = (lx: number, lz: number) => ctx.ground?.(lx, lz) ?? 0;
  const SAG = Math.max(2.0, bw / 6);
  const rearZ = -sagDepth(bw) / 2 + 3.1, back = rearZ + 2.2;
  const curve = (t: number): number => back + 4 * SAG * t * t;
  const fz = Math.min(back + (bw * bw) / (16 * SAG), back + 4 * SAG + 7);
  let g0 = 0;
  for (let k = 0; k <= 8; k++) { const t = k / 8 - 0.5; g0 = Math.max(g0, gl(t * bw, curve(t)), gl(t * bw, rearZ)); }
  const foot = g0 + clear, fy = foot + H * 0.5, crest = foot + H + 0.8;
  // the panels: 28 strips overlapping into one curved sheet, darker toward the edges (the curve reads in the light)
  piece(sink, { name: 'face', kind: 'lattice', at: 'collapse', fall: 'flat' }, (sink) => {
  const n = 28;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n - 0.5, x = t * bw, ang = Math.atan(8 * SAG * t / bw);
    const c: Vec3 = [x, foot + H / 2, curve(t)];
    const f = new LocalFrame([Math.cos(ang), 0, Math.sin(ang)], [0, 1, 0], [-Math.sin(ang), 0, Math.cos(ang)], c);
    sink.box('regionalPlaster', c, [bw / n / 2 + 0.06, H / 2, 0.06], { colour: shade(TROPO_PANEL, 0.84 + 0.16 * (1 - 4 * t * t)) }, f);
  }
  const joint = { colour: shade(TROPO_WHITE, 0.62), decor: true } as const;
  for (let j = 1; j < 6; j++) {
    const y = foot + H * j / 6;
    for (let k = 0; k + 1 < n; k++) {
      const ta = (k + 0.5) / n - 0.5, tb = (k + 1.5) / n - 0.5;
      sink.member('structureMetal', [ta * bw, y, curve(ta) + 0.07], [tb * bw, y, curve(tb) + 0.07], 0.09, 0.03, [0, 0, 1], joint);
    }
  }
  for (let k = 4; k < n; k += 4) {
    const t = k / n - 0.5;
    sink.member('structureMetal', [t * bw, foot, curve(t) + 0.07], [t * bw, foot + H, curve(t) + 0.07], 0.08, 0.03, [0, 0, 1], joint);
  }
  for (const t of [-0.5, 0.5]) sink.member('structureMetal', [t * bw, foot - 0.2, curve(t) + 0.1], [t * bw, foot + H + 0.2, curve(t) + 0.1], 0.24, 0.2, [0, 0, 1], { colour: TROPO_STEEL, exposed: true });
  for (const y of [foot - 0.1, foot + H + 0.1]) for (let k = 0; k < n; k++) {
    const ta = k / n - 0.5, tb = (k + 1) / n - 0.5;
    sink.member('structureMetal', [ta * bw, y, curve(ta) + 0.1], [tb * bw, y, curve(tb) + 0.1], 0.2, 0.18, [0, 1, 0], { colour: TROPO_STEEL, decor: true, exposed: true });
  }
  });
  // the space truss: verticals footed on the ground under them, six levels of chords, webs and the rear plane's X bracing
  piece(sink, { name: 'truss', kind: 'lattice', at: 'collapse', fall: 'slump' }, (sink) => {
  const stations = [-0.5, -0.375, -0.25, -0.125, 0, 0.125, 0.25, 0.375, 0.5];
  const front = (t: number): number => curve(t) - 0.14;
  const sx = (t: number): number => t * bw * 0.98;
  const truss = { colour: TROPO_STEEL, exposed: true } as const, light = { colour: STEEL_DARK, decor: true, exposed: true } as const;
  const levels: number[] = [];
  for (let l = 0; l <= 5; l++) levels.push(foot - 0.6 + (crest - foot + 0.6) * l / 5);
  for (const t of stations) {
    const x = sx(t);
    for (const z of [rearZ, front(t)]) {
      const g = gl(x, z);
      sink.member('structureMetal', [x, Math.min(g - 0.3, -0.6), z], [x, crest, z], z === rearZ ? 0.28 : 0.2, z === rearZ ? 0.28 : 0.2, [0, 0, 1], truss);
      sink.span('stone', x - 0.45, g - 0.4, z - 0.45, x + 0.45, g + 0.25, z + 0.45, { decor: true });
    }
    for (const y of levels) if (y > Math.max(gl(x, rearZ), gl(x, front(t))) + 0.3) sink.member('structureMetal', [x, y, rearZ], [x, y, front(t)], 0.1, 0.1, [1, 0, 0], light);
  }
  for (let j = 0; j + 1 < stations.length; j++) {
    const ta = stations[j], tb = stations[j + 1], xa = sx(ta), xb = sx(tb);
    const lo = Math.max(gl(xa, rearZ), gl(xb, rearZ), gl(xa, front(ta)), gl(xb, front(tb))) + 0.3;
    for (let l = 0; l < levels.length; l++) {
      const y = levels[l];
      if (y < lo) continue;
      sink.member('structureMetal', [xa, y, rearZ], [xb, y, rearZ], 0.14, 0.14, [0, 1, 0], light);
      sink.member('structureMetal', [xa, y, front(ta)], [xb, y, front(tb)], 0.12, 0.12, [0, 1, 0], light);
      if (l + 1 < levels.length) {
        const y2 = levels[l + 1];
        sink.member('structureMetal', [xa, y, rearZ], [xb, y2, rearZ], 0.09, 0.09, [0, 0, 1], light);
        sink.member('structureMetal', [xb, y, rearZ], [xa, y2, rearZ], 0.09, 0.09, [0, 0, 1], light);
        // (the depth diagonals are fine joinery: a phone leaves them out, its coarse share the desktop's)
        const xs = (j + l) % 2 === 0 ? xa : xb, ts = (j + l) % 2 === 0 ? ta : tb;
        sink.member('structureMetal', [xs, y, rearZ], [xs, y2, front(ts)], 0.08, 0.08, [1, 0, 0], { ...light, fine: true });
      }
    }
  }
  // the raking legs: A-frames from footings 2.6 m behind the rear frame up to it at three fifths of the height
  for (const t of [-0.5, -0.25, 0.25, 0.5]) {
    const x = sx(t), g = gl(x, rearZ - 2.6);
    sink.member('structureMetal', [x, Math.min(g - 0.3, -0.6), rearZ - 2.6], [x, foot + H * 0.6, rearZ], 0.24, 0.24, [1, 0, 0], truss);
    sink.span('stone', x - 0.5, g - 0.4, rearZ - 3.1, x + 0.5, g + 0.25, rearZ - 2.1, { decor: true });
  }
  });
  // the feed horn at the focus on its own tower: four tapering legs braced in X, a platform, the horn turned to the face
  piece(sink, { name: 'feed', kind: 'lattice', at: 'breached', fall: 'topple', outward: false }, (sink) => {
  const tw = 0.85, tz = fz + 0.9, legTop = fy - 0.7;
  const gt = Math.min(gl(-tw, tz - tw), gl(tw, tz - tw), gl(-tw, tz + tw), gl(tw, tz + tw));
  const legAt = (s: number, y: number): number => s * tw * (1 - 0.4 * (y - gt + 0.3) / (legTop - gt + 0.3));
  for (const ox of [-1, 1]) for (const oz of [-1, 1]) {
    const g = gl(ox * tw, tz + oz * tw);
    sink.member('structureMetal', [legAt(ox, g - 0.3), Math.min(g - 0.3, -0.6), tz + legAt(oz, g - 0.3)], [legAt(ox, legTop), legTop, tz + legAt(oz, legTop)],
      0.16, 0.16, [1, 0, 0], { colour: GALV, exposed: true });
  }
  for (let y = gt + 0.6; y + 2.4 < legTop; y += 2.4) {
    for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]] as const) {
      sink.member('structureMetal', [legAt(ax, y), y, tz + legAt(az, y)], [legAt(bx, y + 2.4), y + 2.4, tz + legAt(bz, y + 2.4)],
        0.06, 0.06, [0, 1, 0], { colour: GALV, decor: true, fine: true, exposed: true });
    }
  }
  sink.span('structureMetal', -0.8, legTop - 0.1, tz - 0.8, 0.8, legTop + 0.05, tz + 0.8, { colour: GALV });
  sink.cylinder('structureMetal', [0, fy, fz - 1.9], 'z', 1.9, 1.1, 4, { colour: STEEL_DARK }, 0.32);
  sink.span('structureMetal', -0.45, fy - 0.45, fz, 0.45, fy + 0.45, fz + 0.8, { colour: TROPO_STEEL });
  sink.member('structureMetal', [0.35, fy - 0.45, fz + 0.5], [0.35, gt + 0.9, tz + 0.5], 0.14, 0.1, [1, 0, 0], { colour: STEEL_DARK, decor: true, exposed: true });
  });
  // the transmitter module beside the feed tower, on its piles, clear of the face, its door toward the front
  const mx0 = bw / 2 - 5.4, mx1 = bw / 2 - 1.2, mz1 = fz + 1.6, mz0 = mz1 - 2.8;
  const gm = Math.max(gl(mx0, mz0), gl(mx1, mz0), gl(mx0, mz1), gl(mx1, mz1)), floor = gm + 1.1;
  for (const px of [mx0 + 0.3, mx1 - 0.3]) for (const pz of [mz0 + 0.3, mz1 - 0.3]) {
    bar(sink, 'structureMetal', [px, Math.min(gl(px, pz) - 0.3, -0.6), pz], [px, floor, pz], 0.2, { colour: STEEL_DARK });
  }
  sink.span('plaster', mx0, floor, mz0, mx1, floor + 2.8, mz1);
  sink.span('plaster2', mx0 - 0.04, floor + 2.3, mz0 - 0.04, mx1 + 0.04, floor + 2.6, mz1 + 0.04, { decor: true });
  sink.span('structureMetal', mx0 - 0.1, floor + 2.8, mz0 - 0.1, mx1 + 0.1, floor + 2.95, mz1 + 0.1, { colour: STEEL });
  if (ctx.snowCap) sink.span('structureMetal', mx0, floor + 2.95, mz0, mx1, floor + 3.08, mz1, { colour: SNOW, decor: true });
  sink.quad('structureMetal', [mx0 + 0.8, floor + 0.02, mz1 + 0.03], [mx0 + 1.7, floor + 0.02, mz1 + 0.03], [mx0 + 1.7, floor + 2.0, mz1 + 0.03], [mx0 + 0.8, floor + 2.0, mz1 + 0.03], { colour: DOOR, decor: true });
  const gs = gl(mx0 + 1.25, mz1 + 0.6);
  for (let k = 0; k < 4; k++) sink.span('structureMetal', mx0 + 0.75, gs + k * floor / 4 - 0.1, mz1 + 0.2 + (3 - k) * 0.28, mx0 + 1.75, gs + k * floor / 4, mz1 + 0.48 + (3 - k) * 0.28, { colour: STEEL_DARK, decor: true });
  // (the connectivity sweep, 217: the steps hung a riser apart in air) their two stringers, from the ground before the
  // first up to the module's front under its door, along the steps' nosings
  const nose = (z: number): number => gs + (mz1 + 1.32 - z) / 0.28 * (floor / 4) - 0.05;
  for (const x of [mx0 + 0.73, mx0 + 1.77]) bar(sink, 'structureMetal', [x, nose(mz1 + 1.45), mz1 + 1.45], [x, nose(mz1 - 0.02), mz1 - 0.02], 0.06, { colour: STEEL_DARK, decor: true });
  return { parts: finishLandmark(sink) };
};

/** The billboard's depth from its raking legs' footings to its transmitter module (plan.ts footprint, the piece centred). */
export function sagDepth(width: number): number {
  const sag = Math.max(2.0, width / 6), back = 2.2, fz = Math.min(back + (width * width) / (16 * sag), back + 4 * sag + 7);
  return 3.1 + fz + 1.6 + 1.4;
}

// ----------------------------------------------------------------------------------------------------------- the mast

/**
 * A guyed lattice mast in its aviation bands (orange and white, seven to its height): three legs on a concrete pad,
 * their girts and diagonals, the guys from three heights to three anchors, the equipment hut at its foot, the dishes and
 * whips at its head and the beacon at its top.
 */
export const guyedMast: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const H = num(ctx, 'height', 12), face = num(ctx, 'face', 0.6), G = Math.max(0.2, Number(ctx.params.guys)) * H;
  const r = face / Math.sqrt(3), gl = (lx: number, lz: number) => ctx.ground?.(lx, lz) ?? 0, g0 = gl(0, 0);
  // (its guys reach far over the ground: each anchor and the hut foot on the ground under them — plan.ts drapes)
  foot(sink, 0, 0, face * 1.4, face * 1.4, g0, 0.45);
  const legAt = (i: number, y: number): Vec3 => { const a = (i / 3) * Math.PI * 2 + Math.PI / 2; return [Math.cos(a) * r, y, Math.sin(a) * r]; };
  const bands = 7, band = (H - 0.45) / bands;
  // (props lane A, E12: an open frame, read as members — landmarks/damage.ts; the mast one piece, its legs unbroken, that
  // goes over whole when it falls; its crown drops off when it is breached, its dishes at the first damage;
  // landmarks/pieces.ts)
  piece(sink, { name: 'mast', kind: 'lattice', at: 'collapse', fall: 'drop' }, (sink) => {
  for (let b = 0; b < bands; b++) {
    const y0 = g0 + 0.45 + b * band, y1 = y0 + band, colour = b % 2 ? AVI_WHITE : AVI_ORANGE;
    for (let i = 0; i < 3; i++) bar(sink, 'structureMetal', legAt(i, y0), legAt(i, y1), 0.1, { colour });
    const panels = Math.max(1, Math.round(band / 1.5));
    for (let p = 0; p < panels; p++) {
      const ya = y0 + (p / panels) * band, yb = y0 + ((p + 1) / panels) * band;
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3;
        bar(sink, 'structureMetal', legAt(i, yb), legAt(j, yb), 0.05, { colour, decor: true, fine: p % 2 === 1 });
        bar(sink, 'structureMetal', legAt(i, ya), legAt(j, yb), 0.04, { colour, decor: true, fine: true });
      }
    }
  }
  });
  // the guys from three heights to three anchors, each anchor in line with a leg and its guys made fast to that leg (the
  // connectivity sweep, 217: the guys ended in air between the legs)
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2, ax = Math.cos(a) * G, az = Math.sin(a) * G, ga = gl(ax, az);
    sink.span('stone', ax - 0.5, ga - 0.6, az - 0.5, ax + 0.5, ga + 0.35, az + 0.5, { decor: true });
    // (the guys go slack with the mast: they fall with it)
    piece(sink, { name: `guys-${k}`, kind: 'lattice', at: 'collapse', fall: 'slump' }, (s) => {
      for (const f of [0.34, 0.66, 0.95]) {
        const y = g0 + 0.45 + (H - 0.45) * f;
        bar(s, 'structureMetal', [ax, ga + 0.35, az], [Math.cos(a) * r, y, Math.sin(a) * r], 0.035, { colour: STEEL, decor: true });
      }
    });
  }
  // the hut at the foot, its door toward the front
  const hx = face * 1.4 + 1.6, gh = Math.min(gl(hx - 1.2, -1.1), gl(hx + 1.2, -1.1), gl(hx - 1.2, 1.1), gl(hx + 1.2, 1.1));
  const ghTop = Math.max(gl(hx - 1.2, -1.1), gl(hx + 1.2, -1.1), gl(hx - 1.2, 1.1), gl(hx + 1.2, 1.1));
  foot(sink, hx, 0, 1.3, 1.2, gh, Math.max(0.15, ghTop - gh + 0.15));
  const hy = Math.max(gh + 0.15, ghTop + 0.15);
  sink.span('structureMetal', hx - 1.2, hy, -1.1, hx + 1.2, hy + 2.4, 1.1, { colourAt: weathered(PANEL_CREAM, hy, hy + 2.4) });
  sink.span('structureMetal', hx - 1.3, hy + 2.4, -1.2, hx + 1.3, hy + 2.6, 1.2, { colour: TRIM_RED });
  sink.quad('structureMetal', [hx - 0.45, hy + 0.05, 1.12], [hx + 0.45, hy + 0.05, 1.12], [hx + 0.45, hy + 2.0, 1.12], [hx - 0.45, hy + 2.0, 1.12], { colour: DOOR, decor: true });
  if (ctx.snowCap) sink.span('structureMetal', hx - 1.2, hy + 2.6, -1.1, hx + 1.2, hy + 2.72, 1.1, { colour: SNOW, decor: true });
  // the cable tray from the hut to the mast
  bar(sink, 'structureMetal', [hx - 1.2, hy + 2.0, 0], [r, g0 + 2.0, 0], 0.12, { colour: STEEL_DARK, decor: true });
  // the head: two dishes, the whips and the beacon
  for (const [i, y] of [[0, g0 + H * 0.78], [2, g0 + H * 0.62]] as const) piece(sink, { name: `dish-${i}`, kind: 'detach', at: 'damaged', fall: 'flat' }, (sink) => {
    const [lx, , lz] = legAt(i, 0), out = Math.hypot(lx, lz) || 1, dx = lx / out, dz = lz / out;
    const c: Vec3 = [lx + dx * 0.5, y, lz + dz * 0.5];
    bar(sink, 'structureMetal', legAt(i, y), c, 0.06, { colour: STEEL, decor: true });
    // a dish: a shallow cone facing outward (a revolve about the local axis, built as a fan)
    const ring: Vec3[] = [];
    const ux: Vec3 = [-dz, 0, dx], uy: Vec3 = [0, 1, 0];
    for (let s = 0; s < 12; s++) {
      const t = (s / 12) * Math.PI * 2, rr = 0.75;
      ring.push([c[0] + dx * 0.25 + (ux[0] * Math.cos(t)) * rr, c[1] + Math.sin(t) * rr * uy[1], c[2] + dz * 0.25 + (ux[2] * Math.cos(t)) * rr]);
    }
    for (let s = 0; s < 12; s++) {
      const n = (s + 1) % 12;
      sink.polygon('structureMetal', [c, ring[n], ring[s]], { colour: AVI_WHITE, decor: true });
      sink.polygon('structureMetal', [c, ring[s], ring[n]], { colour: shade(AVI_WHITE, 0.7), decor: true });
    }
  });
  // the head's cap plate across the legs' tops, the whip and the beacon on it (they go with the top band)
  piece(sink, { name: 'crown', kind: 'lattice', at: 'breached', fall: 'drop' }, (s) => {
    s.span('structureMetal', -r - 0.06, g0 + H - 0.02, -r - 0.06, r + 0.06, g0 + H + 0.04, r + 0.06, { colour: STEEL_DARK, decor: true });
    bar(s, 'structureMetal', [0, g0 + H + 0.04, 0], [0, g0 + H + 3.2, 0], 0.06, { colour: STEEL_DARK, decor: true });
    s.span('structureMetal', -0.14, g0 + H + 0.04, -0.14, 0.14, g0 + H + 0.36, 0.14, { colour: TRIM_RED, decor: true });
  });
  return { parts: finishLandmark(sink) };
};

// --------------------------------------------------------------------------------------------- caches and drift fences

/**
 * A fuel cache: the station's drums stood in rows on the snow (the props' own drum pool: a hull scatters them), with a
 * stack of pallets at one end. All dressing: the piece itself builds nothing.
 */
export const drumCache: LandmarkBuilder = (ctx) => {
  const rows = Math.round(num(ctx, 'rows', 1)), cols = Math.round(num(ctx, 'columns', 1)), pitch = 0.74;
  const destructibles: Array<{ kind: string; x: number; z: number; yawDeg: number }> = [];
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    if (ctx.rng() < 0.08) continue; // a gap where a drum has been taken
    destructibles.push({ kind: 'drum', x: (j - (cols - 1) / 2) * pitch + (ctx.rng() - 0.5) * 0.06, z: (i - (rows - 1) / 2) * pitch + (ctx.rng() - 0.5) * 0.06,
      yawDeg: ctx.rng() * 360 });
  }
  const ex = ((cols - 1) / 2) * pitch + 1.4;
  for (let k = 0; k < 3; k++) destructibles.push({ kind: 'pallet', x: ex, z: (k - 1) * 1.3, yawDeg: (ctx.rng() - 0.5) * 20 });
  return { parts: new PartSink().finish(), destructibles };
};

/**
 * A drift fence: a line of plank fence modules across the wind (the props' own fence pool: a hull breaks through it),
 * its length along x, broken here and there where the drifts have flattened a module.
 */
export const snowFence: LandmarkBuilder = (ctx) => {
  const L = num(ctx, 'length', 5), module = 2.5, n = Math.max(1, Math.floor(L / module));
  const destructibles: Array<{ kind: string; x: number; z: number; yawDeg: number }> = [];
  for (let k = 0; k < n; k++) {
    if (ctx.rng() < 0.1) continue;
    destructibles.push({ kind: 'fenceplank', x: -((n - 1) * module) / 2 + k * module, z: 0, yawDeg: 90 });
  }
  return { parts: new PartSink().finish(), destructibles };
};
