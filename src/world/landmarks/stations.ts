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

const PANEL = rgb(0xd9d8d0), PANEL_CREAM = rgb(0xd3ccb8), TRIM_RED = rgb(0x8a3026), TRIM_BLUE = rgb(0x34506e);
const STEEL = rgb(0x7f868b), STEEL_DARK = rgb(0x4b5157), IRON = rgb(0x2c2e30), RADOME = rgb(0xeeeeea);
const AVI_ORANGE = rgb(0xcf5a2e), AVI_WHITE = rgb(0xe8e8e2), SNOW = rgb(0xf0f3f6), RUST = rgb(0x6e3c26), TIMBER = rgb(0x5e4c3a);
const DOOR = rgb(0x3d4246), SIGN_YELLOW = rgb(0xd8a93a);

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

/** A railing round a rectangle at height y (posts and a top rail; dressing). */
function deckRail(sink: PartSink, x0: number, z0: number, x1: number, z1: number, y: number, colour: Rgb): void {
  const o: EmitOptions = { colour, decor: true };
  const corners: Array<[number, number]> = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
    bar(sink, 'structureMetal', [ax, y + 1.0, az], [bx, y + 1.0, bz], 0.05, o);
    bar(sink, 'structureMetal', [ax, y + 0.5, az], [bx, y + 0.5, bz], 0.035, { ...o, fine: true });
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 1.8));
    for (let k = 0; k < n; k++) {
      const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      bar(sink, 'structureMetal', [x, y, z], [x, y + 1.0, z], 0.05, o);
    }
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
  sink.span('structureMetal', -h, base, -h, h, H, h, { colourAt: weathered(PANEL, base, H, 0.18) });
  sink.span('structureMetal', -h - 0.05, H - 0.7, -h - 0.05, h + 0.05, H - 0.35, h + 0.05, { colour: TRIM_RED, decor: true });
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
  for (let y = base + 2.2; y < H; y += 1.4) bar(sink, 'structureMetal', [h + 0.05, y, -h * 0.4 - 0.35], [h + 0.62, y, -h * 0.4 - 0.35], 0.04, { colour: STEEL_DARK, decor: true, fine: true });
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
  revolve(sink, 'structureMetal', 0, 0, profile, 20, { colour: RADOME });
  // the panel courses (fine rings) and the beacon at the crown
  for (const deg of [-10, 20, 48, 72]) {
    const a = deg * Math.PI / 180, r = R * Math.cos(a) + 0.02, y = yc + R * Math.sin(a);
    revolve(sink, 'structureMetal', 0, 0, [[r, y - 0.04], [r, y + 0.04]], 20, { colour: shade(RADOME, 0.84), decor: true, fine: true });
  }
  sink.span('structureMetal', -0.12, yc + R - 0.05, -0.12, 0.12, yc + R + 0.35, 0.12, { colour: TRIM_RED, decor: true });
  // whip antennas on the roof's corners
  for (const [sx, sz] of [[-1, -1], [1, 1]]) bar(sink, 'structureMetal', [sx * (h - 0.6), H + 0.45, sz * (h - 0.6)], [sx * (h - 0.6), H + 4.2, sz * (h - 0.6)], 0.05, { colour: STEEL_DARK, decor: true });
  return { parts: sink.finish() };
};

// -------------------------------------------------------------------------------------------------------- billboards

/**
 * A tropospheric-scatter "billboard" antenna: the reflector curved across its width (concave to the front, +z), its
 * face in pale panels and its back in the steel of the frame, raised on vertical legs braced back to the ground by
 * raking struts, horizontal girts along its back; before it, at the focus, the feed horn on its four-legged tower and
 * the waveguide run back along the ground.
 */
export const troposcatter: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const W = num(ctx, 'width', 8), Hh = num(ctx, 'height', 6), clear = num(ctx, 'clearance', 1.2);
  const hw = W / 2, sag = W * 0.1, rake = Math.min(0.5 * Hh + 2, 10);
  const gl = (lx: number, lz: number) => ctx.ground?.(lx, lz) ?? 0;
  const zc = (x: number) => -sag * (1 - (x / hw) ** 2) + sag * 0.5; // the face's depth across the width (the piece centred)
  const cols = 12;
  // (it stands on the high ground it carries across: the face clears the highest ground under it, each leg and strut
  // foots on the ground under it — plan.ts drapes)
  let gmax = 0;
  for (let k = 0; k <= cols; k++) { const x = -hw + (k / cols) * W; gmax = Math.max(gmax, gl(x, zc(x)), gl(x, zc(x) - 0.3)); }
  const y0 = gmax + clear, top = y0 + Hh;
  // the reflector: a face of panels toward +z and the steel back a hand's depth behind it
  for (let k = 0; k < cols; k++) {
    const x0 = -hw + (k / cols) * W, x1 = -hw + ((k + 1) / cols) * W;
    const z0 = zc(x0), z1 = zc(x1), tint = k % 2 ? 1 : 0.95;
    sink.quad('structureMetal', [x0, y0, z0], [x1, y0, z1], [x1, top, z1], [x0, top, z0], { colour: shade(PANEL, tint) });
    sink.quad('structureMetal', [x1, y0, z1 - 0.12], [x0, y0, z0 - 0.12], [x0, top, z0 - 0.12], [x1, top, z1 - 0.12], { colour: STEEL_DARK });
    sink.quad('structureMetal', [x0, top, z0], [x1, top, z1], [x1, top, z1 - 0.12], [x0, top, z0 - 0.12], { colour: STEEL_DARK, decor: true });
    sink.quad('structureMetal', [x1, y0, z1], [x0, y0, z0], [x0, y0, z0 - 0.12], [x1, y0, z1 - 0.12], { colour: STEEL_DARK, decor: true });
  }
  // the panel joints on the face (fine), the girts along the back
  for (let j = 1; j < 4; j++) {
    const y = y0 + (j / 4) * Hh;
    for (let k = 0; k < cols; k++) {
      const x0 = -hw + (k / cols) * W, x1 = -hw + ((k + 1) / cols) * W;
      bar(sink, 'structureMetal', [x0, y, zc(x0) + 0.02], [x1, y, zc(x1) + 0.02], 0.04, { colour: shade(PANEL, 0.78), decor: true, fine: true });
      bar(sink, 'structureMetal', [x0, y, zc(x0) - 0.22], [x1, y, zc(x1) - 0.22], 0.12, { colour: STEEL_DARK, decor: true });
    }
  }
  // the legs and the raking struts behind them, each on its footing
  const legs = 5;
  for (let k = 0; k < legs; k++) {
    const x = -hw * 0.9 + (k / (legs - 1)) * hw * 1.8, z = zc(x) - 0.3, g = gl(x, z);
    foot(sink, x, z, 0.45, 0.45, g);
    bar(sink, 'structureMetal', [x, g + 0.3, z], [x, top, z], 0.26, { colour: STEEL_DARK });
    const az = z - rake, ga = gl(x, az);
    foot(sink, x, az, 0.4, 0.4, ga);
    bar(sink, 'structureMetal', [x, ga + 0.3, az], [x, y0 + Hh * 0.82, z - 0.05], 0.2, { colour: STEEL_DARK });
    bar(sink, 'structureMetal', [x, ga + 0.3, az], [x, y0 + Hh * 0.4, z - 0.05], 0.14, { colour: STEEL_DARK, decor: true });
  }
  // the feed horn's tower at the focus and the horn turned to the face; the waveguide back along the ground
  const fz = Math.min(hw * hw / (4 * sag) - sag * 0.5, 0.9 * hw + 2), fy = y0 + Hh * 0.42, th = 0.55;
  const gf = Math.min(gl(-th, fz - th), gl(th, fz - th), gl(-th, fz + th), gl(th, fz + th));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    bar(sink, 'structureMetal', [sx * th, Math.min(gl(sx * th, fz + sz * th) - 0.6, -0.6), fz + sz * th], [sx * th * 0.6, fy - 0.6, fz + sz * th * 0.6], 0.12, { colour: STEEL });
  }
  for (let y = gf + 2.2; y < fy - 0.8; y += 1.6) deckRail(sink, -th * 0.8, fz - th * 0.8, th * 0.8, fz + th * 0.8, y - 1.0, STEEL);
  sink.span('structureMetal', -0.6, fy - 0.7, fz - 0.6, 0.6, fy - 0.55, fz + 0.6, { colour: STEEL_DARK });
  // the horn: a frustum opening toward the reflector (-z)
  const horn: Vec3[] = [[-0.25, fy - 0.55, fz + 0.3], [0.25, fy - 0.55, fz + 0.3], [0.25, fy - 0.05, fz + 0.3], [-0.25, fy - 0.05, fz + 0.3]];
  const mouth: Vec3[] = [[-0.6, fy - 0.55, fz - 0.9], [0.6, fy - 0.55, fz - 0.9], [0.6, fy + 0.35, fz - 0.9], [-0.6, fy + 0.35, fz - 0.9]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    sink.quad('structureMetal', horn[j], horn[i], mouth[i], mouth[j], { colour: STEEL, decor: true });
  }
  sink.polygon('structureMetal', [...horn].reverse(), { colour: STEEL, decor: true });
  bar(sink, 'structureMetal', [0, gl(0, fz) + 0.25, fz - 0.1], [0, gl(0, zc(0) - 0.3) + 0.25, zc(0) - 0.3], 0.2, { colour: IRON, decor: true });
  return { parts: sink.finish() };
};

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
  // the guys from three heights to three anchors
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 6, ax = Math.cos(a) * G, az = Math.sin(a) * G, ga = gl(ax, az);
    sink.span('stone', ax - 0.5, ga - 0.6, az - 0.5, ax + 0.5, ga + 0.35, az + 0.5, { decor: true });
    for (const f of [0.34, 0.66, 0.95]) {
      const y = g0 + 0.45 + (H - 0.45) * f;
      bar(sink, 'structureMetal', [ax, ga + 0.35, az], [Math.cos(a) * r, y, Math.sin(a) * r], 0.035, { colour: STEEL, decor: true });
    }
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
  for (const [i, y] of [[0, g0 + H * 0.78], [2, g0 + H * 0.62]] as const) {
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
  }
  bar(sink, 'structureMetal', [0, g0 + H, 0], [0, g0 + H + 3.2, 0], 0.06, { colour: STEEL_DARK, decor: true });
  sink.span('structureMetal', -0.14, g0 + H, -0.14, 0.14, g0 + H + 0.32, 0.14, { colour: TRIM_RED, decor: true });
  return { parts: sink.finish() };
};

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
  for (const z of [-1.2, -0.6]) sink.cylinder('structureMetal', [x0, floor - 0.55, z], 'x', total, 0.18, 6, { colour: STEEL, decor: true });
  // the modules
  for (let k = 0; k < n; k++) {
    const a = x0 + k * L, b = a + L, garage = k === n - 1 && n > 2, top = garage ? eave + 1.6 : eave;
    const paint = k % 3 === 2 ? PANEL_CREAM : PANEL, trim = trims[(k + Math.floor(ctx.variant() * 4)) % 4];
    sink.span('structureMetal', a + 0.02, floor, -hd, b - 0.02, top, hd, { colourAt: weathered(paint, floor, top, 0.14) });
    sink.span('structureMetal', a, top - 0.55, -hd - 0.04, b, top - 0.25, hd + 0.04, { colour: trim, decor: true });
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

// ---------------------------------------------------------------------------------------------------------- tank farm

/**
 * The POL tank farm: vertical tanks in rows inside a concrete bund (its gap and the steps over it at the front), each tank
 * on its ring footing with its cone roof, the stair climbing its side to the rail round its roof; the pipes from each tank
 * to the manifold at the bund's front.
 */
export const fuelTankFarm: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const count = Math.round(num(ctx, 'tanks', 1)), R = num(ctx, 'radius', 2), Ht = num(ctx, 'height', 3);
  const cols = Math.min(count, Math.max(1, Math.round(num(ctx, 'columns', 1)))), rows = Math.ceil(count / cols);
  const pitch = 2 * R + 3, ex = (cols - 1) * pitch / 2 + R + 2.5, ez = (rows - 1) * pitch / 2 + R + 2.5;
  const gl = (lx: number, lz: number) => ctx.ground?.(lx, lz) ?? 0;
  // (on falling ground — plan.ts drapes — each tank stands on its own ring footing at the highest ground under it, and
  // the bund runs in short lengths, each from below its lowest ground to a wall's height over its highest)
  const wallH = 1.1, t = 0.35;
  const wall = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 6));
    for (let k = 0; k < n; k++) {
      const x0 = ax + (bx - ax) * k / n, z0 = az + (bz - az) * k / n, x1 = ax + (bx - ax) * (k + 1) / n, z1 = az + (bz - az) * (k + 1) / n;
      const g0 = gl(x0, z0), g1 = gl(x1, z1), gm = gl((x0 + x1) / 2, (z0 + z1) / 2);
      const lo = Math.min(g0, g1, gm), hi = Math.max(g0, g1, gm);
      sink.span('stone', Math.min(x0, x1) - (az === bz ? 0 : t / 2), Math.min(lo - 0.6, -0.6), Math.min(z0, z1) - (az === bz ? t / 2 : 0),
        Math.max(x0, x1) + (az === bz ? 0 : t / 2), hi + wallH, Math.max(z0, z1) + (az === bz ? t / 2 : 0));
    }
  };
  wall(-ex, -ez + t / 2, ex, -ez + t / 2);
  wall(-ex + t / 2, -ez, -ex + t / 2, ez);
  wall(ex - t / 2, -ez, ex - t / 2, ez);
  wall(-ex, ez - t / 2, -1.4, ez - t / 2);
  wall(1.4, ez - t / 2, ex, ez - t / 2);
  // the tanks
  for (let i = 0; i < count; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    const x = -((cols - 1) * pitch) / 2 + c * pitch, z = -((rows - 1) * pitch) / 2 + r * pitch;
    let lo = Infinity, hi = -Infinity;
    for (let a = 0; a < 8; a++) { const g = gl(x + Math.cos(a * Math.PI / 4) * R, z + Math.sin(a * Math.PI / 4) * R); lo = Math.min(lo, g); hi = Math.max(hi, g); }
    lo = Math.min(lo, gl(x, z)); hi = Math.max(hi, gl(x, z));
    const y0 = hi + 0.3;
    const tone = lerp(PANEL, SNOW, ctx.variant() * 0.4);
    revolve(sink, 'stone', x, z, [[R + 0.3, Math.min(lo - 0.6, -0.6)], [R + 0.3, y0], [R - 0.05, y0]], 16);
    revolve(sink, 'structureMetal', x, z, [[R, y0], [R, y0 + Ht], [R * 0.25, y0 + Ht + R * 0.18], [0, y0 + Ht + R * 0.2]], 20,
      { colourAt: (p) => (p[1] > y0 + Ht + 0.01 ? shade(tone, 0.88) : weathered(tone, y0, y0 + Ht, 0.3)(p)) });
    // the shell's courses (fine rings)
    for (let y = y0 + 1.8; y < y0 + Ht - 0.3; y += 1.8) revolve(sink, 'structureMetal', x, z, [[R + 0.02, y - 0.03], [R + 0.02, y + 0.03]], 20, { colour: shade(tone, 0.8), decor: true, fine: true });
    // the stair up its side (a straight flight on the tangent toward the front) and the roof rail
    const s0: Vec3 = [x - R - 0.5, gl(x - R - 0.5, z + 0.8) + 0.1, z + 0.8], s1: Vec3 = [x - R - 0.5, y0 + Ht, z - R * 0.9];
    bar(sink, 'structureMetal', s0, s1, 0.12, { colour: STEEL_DARK, decor: true });
    bar(sink, 'structureMetal', [s0[0] - 0.6, s0[1] + 1, s0[2]], [s1[0] - 0.6, s1[1] + 1, s1[2]], 0.05, { colour: STEEL_DARK, decor: true, fine: true });
    revolve(sink, 'structureMetal', x, z, [[R * 0.9, y0 + Ht + R * 0.03 + 0.95], [R * 0.9, y0 + Ht + R * 0.03 + 1.0]], 16, { colour: STEEL_DARK, decor: true, fine: true });
    // the pipe from the tank's foot to the manifold
    bar(sink, 'structureMetal', [x, y0 + 0.2, z + R], [x, gl(x, ez - t - 0.75) + 0.5, ez - t - 0.75], 0.24, { colour: IRON, decor: true });
  }
  // the manifold along the bund's front and its valve stand, the steps over the gap
  const gm = gl(0, ez - t - 0.75);
  bar(sink, 'structureMetal', [-ex + 1.0, gl(-ex + 1.0, ez - t - 0.75) + 0.5, ez - t - 0.75], [ex - 1.0, gl(ex - 1.0, ez - t - 0.75) + 0.5, ez - t - 0.75], 0.3, { colour: IRON, decor: true });
  sink.span('structureMetal', -1.2, gm - 0.3, ez - t - 1.5, 1.2, gm + 1.3, ez - t - 0.7, { colour: SIGN_YELLOW });
  const gs = gl(0, ez + 0.1);
  sink.span('structureWood', -1.3, gs - 0.3, ez - 0.4, 1.3, gs + 0.25, ez + 0.6, { colour: TIMBER, decor: true });
  return { parts: sink.finish() };
};

// ------------------------------------------------------------------------------------------------------------ jamesway

// (the first capture: the canvas read as a golden yellow under the snow's light) the olive drab of the huts' canvas, dark
const CANVAS_OLIVE = rgb(0x45473a), PLYWOOD = rgb(0x7d6e55);

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
  const canvas = lerp(CANVAS_OLIVE, rgb(0x5d5a48), ctx.variant());
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
  sink.span('structureWood', -0.9, floor, -z0, 0.9, floor + 2.2, -z0 + 1.2, { colour: PLYWOOD });
  sink.span('structureWood', -1.0, floor + 2.2, -z0 - 0.05, 1.0, floor + 2.32, -z0 + 1.3, { colour: shade(PLYWOOD, 0.6) });
  sink.quad('structureWood', [-0.42, floor + 0.02, -z0 + 1.22], [0.42, floor + 0.02, -z0 + 1.22], [0.42, floor + 1.95, -z0 + 1.22], [-0.42, floor + 1.95, -z0 + 1.22], { colour: DOOR, decor: true });
  sink.span('structureWood', -0.6, 0, -z0 + 1.2, 0.6, floor * 0.5, -z0 + 1.55, { colour: TIMBER, decor: true });
  sink.cylinder('structureMetal', [r * 0.45, floor + r * 0.85, -z0 * 0.4], 'y', 1.4, 0.09, 6, { colour: IRON, decor: true });
  return { parts: sink.finish() };
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
