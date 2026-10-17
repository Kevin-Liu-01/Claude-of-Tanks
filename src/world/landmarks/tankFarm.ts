// tankFarm.ts — props census #3 (lane B, 2026-10-14): the fuel tank farm moved here as it was from stations.ts, the industrial yard's
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
import { PartSink, rgb, shade, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { bar, revolve } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';
import { finishLandmark, piece } from './pieces.ts';

const PANEL = rgb(0xd9d8d0);
const STEEL_DARK = rgb(0x4b5157), IRON = rgb(0x2c2e30);
const SNOW = rgb(0xf0f3f6), RUST = rgb(0x6e3c26), TIMBER = rgb(0x5e4c3a);
const SIGN_YELLOW = rgb(0xd8a93a);
// the arctic kit's billboard paints (maps/regional/arctic.ts): the panels a multiplier over white, the truss's steel, the
// feed tower's galvanised grey

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const lerp = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const num = (ctx: LandmarkBuildContext, key: string, min: number): number => Math.max(min, Number(ctx.params[key]));

/** A rust stain down a sheet: the paint at the top, darker toward the foot (a coloured bucket's per-corner colour). */
const weathered = (base: Rgb, y0: number, y1: number, k = 0.22) => (p: Vec3): Rgb => {
  const t = Math.min(1, Math.max(0, (p[1] - y0) / Math.max(0.01, y1 - y0)));
  return lerp(lerp(base, RUST, k), base, Math.sqrt(t));
};

// --------------------------------------------------------------------------------------------------------------- radome

/**
 * The search radar's radome on its tower building: a two-storey clad block (the operations floor, its window band and
 * its door under a canopy, the outside stair to the roof), a drum on the roof and the white sphere on it, its panel
 * courses and the beacon at its crown; whip antennas and a snow slab on the flat roof.
 */
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
  // the bund runs in short lengths following the ground)
  // (the map-content lane's R6; gauntlet wave 358a on Whiteout and Copper Mesa: the bund "a low wall of stone blocks
  // rather than an earth-and-gravel berm") the bund an earth and gravel berm with sloped faces, snow-covered on a snow map,
  // its crest a little over a metre; it stands outside the old wall's line by its inner face's run, so the manifold, the
  // stairs' feet and the sump inside the old wall stay clear of its inner slope; the tanks' ring footings concrete (never
  // the kit's brick)
  const wallH = 1.2, t = 0.35, crest = 0.45, run = 1.5;
  const bermBucket = ctx.snowCap ? 'plaster' : 'plaster3';
  const concrete = ctx.brick ? 'plaster3' : 'stone';
  /** A quad wound to face `out` (the berm's faces: whichever way the run goes). */
  const faceOut = (pts: [Vec3, Vec3, Vec3, Vec3], out: Vec3) => {
    const ux = pts[1][0] - pts[0][0], uy = pts[1][1] - pts[0][1], uz = pts[1][2] - pts[0][2];
    const vx = pts[2][0] - pts[0][0], vy = pts[2][1] - pts[0][1], vz = pts[2][2] - pts[0][2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    sink.quad(bermBucket, ...((n[0] * out[0] + n[1] * out[1] + n[2] * out[2]) >= 0 ? pts : [pts[3], pts[2], pts[1], pts[0]] as [Vec3, Vec3, Vec3, Vec3]));
  };
  /** The berm along a run from a to b, its crest on that line, in lengths of 4 m or less, each laid on the ground under
   * it: the inner face, the crest, the outer face; `capA`/`capB` close an end (the gap's sides). */
  const berm = (ax: number, az: number, bx: number, bz: number, capA = false, capB = false) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 4));
    const tx = (bx - ax) / len, tz = (bz - az) / len, nx = tz, nz = -tx;
    const offs = [-crest - run, -crest, crest, crest + run];
    const section = (x: number, z: number): Vec3[] => offs.map((o, i) => {
      const px = x + nx * o, pz = z + nz * o, g = gl(px, pz);
      return [px, i === 0 || i === 3 ? g - 0.15 : g + wallH, pz] as Vec3;
    });
    let prev = section(ax, az);
    if (capA) faceOut([prev[0], prev[1], prev[2], prev[3]], [-tx, 0, -tz]);
    for (let k = 1; k <= n; k++) {
      const next = section(ax + (bx - ax) * k / n, az + (bz - az) * k / n);
      faceOut([prev[0], prev[1], next[1], next[0]], [-nx, 0.6, -nz]);
      faceOut([prev[1], prev[2], next[2], next[1]], [0, 1, 0]);
      faceOut([prev[2], prev[3], next[3], next[2]], [nx, 0.6, nz]);
      prev = next;
    }
    if (capB) faceOut([prev[0], prev[1], prev[2], prev[3]], [tx, 0, tz]);
  };
  // the crest lines a face's run outside the old wall's, the runs carried past the corners by a face's run so the corners
  // close, the gap at the front between the two front runs' capped ends
  const ov = crest + run, bx = ex - t / 2 + run, bz = ez - t / 2 + run;
  berm(-bx - ov, -bz, bx + ov, -bz);
  berm(-bx, -bz, -bx, bz + ov);
  berm(bx, -bz, bx, bz + ov);
  berm(-bx - ov, bz, -1.4 - ov, bz, false, true);
  berm(1.4 + ov, bz, bx + ov, bz, true, false);
  // the manifold's line: straight from 0.5 m over the ground at one end to 0.5 m over it at the other
  const manifoldY = (mx: number): number => {
    const z = ez - t - 0.75, a = gl(-ex + 1.0, z) + 0.5, b = gl(ex - 1.0, z) + 0.5;
    return a + (b - a) * Math.min(1, Math.max(0, (mx + ex - 1.0) / Math.max(1e-6, 2 * ex - 2.0)));
  };
  // the tanks
  for (let i = 0; i < count; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    const x = -((cols - 1) * pitch) / 2 + c * pitch, z = -((rows - 1) * pitch) / 2 + r * pitch;
    let lo = Infinity, hi = -Infinity;
    for (let a = 0; a < 8; a++) { const g = gl(x + Math.cos(a * Math.PI / 4) * R, z + Math.sin(a * Math.PI / 4) * R); lo = Math.min(lo, g); hi = Math.max(hi, g); }
    lo = Math.min(lo, gl(x, z)); hi = Math.max(hi, gl(x, z));
    const y0 = hi + 0.3;
    // (props census #3, lane B 2026-10-14) the place's tanks: the DEW Line's POL tanks white and lagged, a cap of snow on
    // their roofs; the mine's diesel tanks in a sun-faded green paint, rust at their feet
    const arctic = ctx.mapId === 'whiteout';
    const tone = arctic ? lerp(PANEL, SNOW, ctx.variant() * 0.4) : lerp(rgb(0x5f6d5c), rgb(0x8c937f), ctx.variant() * 0.6);
    revolve(sink, concrete, x, z, [[R + 0.3, Math.min(lo - 0.6, -0.6)], [R + 0.3, y0], [R - 0.05, y0]], 16);
    // (props lane A, E12: each tank ruptures on the side a round came from — the first at the first damage, the rest when
    // the farm is breached — and its fuel's burn spreads under the hole; landmarks/pieces.ts)
    piece(sink, { name: `tank-${i}`, kind: 'tank', at: i === 0 ? 'damaged' : 'breached', vessel: { x, z, y0, y1: y0 + Ht, r: R, contents: 'fuel' } }, (sink) => {
      // the shell in its courses, each plate ring a hair thinner than the one under it (their laps step in), the roof cone
      const courses = Math.max(2, Math.round(Ht / 1.8)), ch = Ht / courses;
      for (let k = 0; k < courses; k++) {
        const rk = R + 0.012 * (courses - 1 - k), ya = y0 + k * ch, yb = ya + ch;
        revolve(sink, 'structureMetal', x, z, [[rk, ya], [rk, yb], [R, yb]], 20, { colourAt: weathered(shade(tone, 0.97 + 0.03 * (k % 2)), y0, y0 + Ht, arctic ? 0.15 : 0.3) });
      }
      revolve(sink, 'structureMetal', x, z, [[R, y0 + Ht], [R * 0.25, y0 + Ht + R * 0.18], [0, y0 + Ht + R * 0.2]], 20, { colour: shade(tone, 0.88) });
      if (arctic) revolve(sink, 'plaster', x, z, [[R + 0.03, y0 + Ht + 0.02], [R * 0.3, y0 + Ht + R * 0.18 + 0.1], [0, y0 + Ht + R * 0.2 + 0.1]], 20, { decor: true });
      // the wind girder under the top course, the manway at the foot facing out, the roof's vents and gauge hatch
      revolve(sink, 'structureMetal', x, z, [[R + 0.18, y0 + Ht - 0.45], [R + 0.18, y0 + Ht - 0.38], [R, y0 + Ht - 0.38]], 20, { colour: shade(tone, 0.8), decor: true });
      const mz = z + R, my = y0 + 0.75;
      sink.cylinder('structureMetal', [x - 0.6, my, mz - 0.05], 'z', 0.18, 0.32, 12, { colour: shade(tone, 0.85), decor: true }, 0.32, true);
      sink.cylinder('structureMetal', [x - 0.6, my, mz + 0.13], 'z', 0.05, 0.38, 12, { colour: shade(tone, 0.7), decor: true }, 0.38, true);
      for (const [vx, vz] of [[R * 0.45, 0.2], [-R * 0.3, -R * 0.35]] as const) {
        const vy = y0 + Ht + R * 0.18 * (1 - Math.hypot(vx, vz) / R) + 0.02;
        sink.cylinder('structureMetal', [x + vx, vy, z + vz], 'y', 0.35, 0.09, 8, { colour: STEEL_DARK, decor: true }, 0.09, true);
        sink.cylinder('structureMetal', [x + vx, vy + 0.35, z + vz], 'y', 0.12, 0.18, 8, { colour: STEEL_DARK, decor: true }, 0.05, true);
      }
      sink.span('structureMetal', x + R * 0.55 - 0.25, y0 + Ht + R * 0.06, z - 0.25, x + R * 0.55 + 0.25, y0 + Ht + R * 0.06 + 0.12, z + 0.25, { colour: shade(tone, 0.75), decor: true });
    });
    // the stair up its side: a straight flight on the tangent, its head on a landing at the shell where the roof begins,
    // its foot out toward the front — two stringers, the treads, the outer handrail on posts — and the rail round the
    // roof on its posts (the connectivity sweep, 217: the flight's head stood two metres off the shell, its handrail and
    // the roof's rail on nothing)
    const top = y0 + Ht, xi = x - R - 0.04, xo = xi - 0.75, zh = z, zf = z + 0.8 + R * 0.9, zl = zh + 0.45;
    const gf = Math.min(gl(xi, zf), gl(xo, zf)) - 0.05, rise = top - 0.04 - gf;
    const nosing = (zz: number): number => gf + rise * (zf - zz) / (zf - zl);
    const dark = { colour: STEEL_DARK, decor: true } as const;
    sink.span('structureMetal', xo - 0.05, top - 0.08, zh - 0.45, xi + 0.16, top, zl, dark);
    for (const sx of [xi, xo]) bar(sink, 'structureMetal', [sx, gf, zf], [sx, top - 0.04, zl], 0.08, dark);
    const steps = Math.max(3, Math.ceil(rise / 0.3));
    for (let k = 1; k < steps; k++) {
      const zz = zf - (zf - zl) * k / steps, y = nosing(zz);
      sink.span('structureMetal', xo, y - 0.035, zz - 0.13, xi, y + 0.005, zz + 0.13, { ...dark, fine: true });
    }
    const posts = [zf - 0.3, (zf + zl) / 2, zl - 0.08, zh - 0.37];
    for (const zp of posts) bar(sink, 'structureMetal', [xo, (zp < zl ? top - 0.04 : nosing(zp)), zp], [xo, (zp < zl ? top : nosing(zp)) + 0.95, zp], 0.05, { ...dark, fine: true });
    for (let k = 0; k + 1 < posts.length; k++) {
      const [za, zb] = [posts[k], posts[k + 1]];
      bar(sink, 'structureMetal', [xo, (za < zl ? top : nosing(za)) + 0.95, za], [xo, (zb < zl ? top : nosing(zb)) + 0.95, zb], 0.05, { ...dark, fine: true });
    }
    // (the rail's band both ways round: from over the roof its inside shows — the integrity gate)
    revolve(sink, 'structureMetal', x, z, [[R * 0.9, top + R * 0.03 + 0.95], [R * 0.9, top + R * 0.03 + 1.0]], 16, { colour: STEEL_DARK, decor: true, fine: true });
    revolve(sink, 'structureMetal', x, z, [[R * 0.9 - 0.006, top + R * 0.03 + 1.0], [R * 0.9 - 0.006, top + R * 0.03 + 0.95]], 16, { colour: STEEL_DARK, decor: true, fine: true });
    // the roof rail's posts at every second vertex of its ring, from the cone (0.024 R over the shell's top there)
    for (let k = 0; k < 8; k++) {
      const a = -(k / 8) * Math.PI * 2, px = x + Math.cos(a) * R * 0.9, pz = z + Math.sin(a) * R * 0.9;
      bar(sink, 'structureMetal', [px, top + R * 0.024 - 0.04, pz], [px, top + R * 0.03 + 0.975, pz], 0.05, { ...dark, fine: true });
    }
    // the pipe from the tank's foot to the manifold (the buildings stream, 2026-10-12, the integrity check: on falling
    // ground each pipe ended at its own ground's height, short of or past the straight manifold, which hung over the
    // slope on nothing) to the manifold's line
    bar(sink, 'structureMetal', [x, y0 + 0.2, z + R], [x, manifoldY(x), ez - t - 0.75], 0.24, { colour: IRON, decor: true });
    // its outlet valve on the nozzle (the body and the hand wheel), the earthing straps from the shell to the ground
    sink.span('structureMetal', x - 0.18, y0 + 0.02, z + R + 0.05, x + 0.18, y0 + 0.38, z + R + 0.4, { colour: shade(IRON, 1.4), decor: true });
    sink.cylinder('structureMetal', [x, y0 + 0.62, z + R + 0.22], 'y', 0.04, 0.22, 10, { colour: rgb(0xa8302a), decor: true }, 0.22, false);
    for (const a of [0.8, 3.9]) {
      const sx = x + Math.cos(a) * (R + 0.01), sz = z + Math.sin(a) * (R + 0.01);
      bar(sink, 'structureMetal', [sx, y0 + 0.5, sz], [sx + Math.cos(a) * 0.5, gl(sx, sz) - 0.1, sz + Math.sin(a) * 0.5], 0.03, { colour: rgb(0x9a6a3a), decor: true, fine: true });
    }
  }
  // the manifold along the bund's front on its stands, its valve stand, the steps over the gap
  const gm = gl(0, ez - t - 0.75);
  bar(sink, 'structureMetal', [-ex + 1.0, manifoldY(-ex + 1.0), ez - t - 0.75], [ex - 1.0, manifoldY(ex - 1.0), ez - t - 0.75], 0.3, { colour: IRON, decor: true });
  for (let k = 0, n = Math.max(2, Math.round((2 * ex - 2) / 4)); k <= n; k++) {
    const xs = -ex + 1.0 + (2 * ex - 2) * k / n;
    bar(sink, 'structureMetal', [xs, gl(xs, ez - t - 0.75) - 0.2, ez - t - 0.75], [xs, manifoldY(xs), ez - t - 0.75], 0.1, { colour: STEEL_DARK, decor: true });
  }
  // the valve stand: a grated platform on four posts over the manifold, three risers from it with their valves and hand
  // wheels, the stand's yellow sign board (props census #3: was one yellow box)
  const vz0 = ez - t - 1.5, vz1 = ez - t - 0.7;
  sink.span('structureMetal', -1.2, gm + 0.9, vz0, 1.2, gm + 0.98, vz1, { colour: STEEL_DARK });
  for (const [px, pz] of [[-1.1, vz0 + 0.1], [1.1, vz0 + 0.1], [-1.1, vz1 - 0.1], [1.1, vz1 - 0.1]] as const) bar(sink, 'structureMetal', [px, gm - 0.3, pz], [px, gm + 0.9, pz], 0.08, { colour: STEEL_DARK });
  for (const px of [-0.6, 0, 0.6]) {
    bar(sink, 'structureMetal', [px, manifoldY(px), ez - t - 0.75], [px, gm + 1.7, ez - t - 0.75], 0.14, { colour: IRON, decor: true });
    sink.span('structureMetal', px - 0.14, gm + 1.25, ez - t - 0.9, px + 0.14, gm + 1.5, ez - t - 0.6, { colour: shade(IRON, 1.5), decor: true });
    sink.cylinder('structureMetal', [px, gm + 1.62, ez - t - 0.75], 'y', 0.04, 0.2, 10, { colour: rgb(0xa8302a), decor: true }, 0.2, false);
    // (its spokes to the spindle: the integrity gate found the rim 10 cm clear of the riser)
    for (const [dx, dz] of [[0.19, 0], [0, 0.19]] as const) bar(sink, 'structureMetal', [px - dx, gm + 1.64, ez - t - 0.75 - dz], [px + dx, gm + 1.64, ez - t - 0.75 + dz], 0.025, { colour: rgb(0xa8302a), decor: true, fine: true });
  }
  for (const s2 of [-1, 1]) bar(sink, 'structureMetal', [s2 * 1.15, gm + 0.98, vz0], [s2 * 1.15, gm + 1.95, vz0], 0.05, { colour: SIGN_YELLOW, decor: true, fine: true });
  bar(sink, 'structureMetal', [-1.15, gm + 1.95, vz0], [1.15, gm + 1.95, vz0], 0.05, { colour: SIGN_YELLOW, decor: true, fine: true });
  sink.span('structureMetal', -0.45, gm + 1.3, vz0 - 0.04, 0.45, gm + 1.93, vz0 - 0.01, { colour: SIGN_YELLOW, decor: true });
  // the bund's drain sump in the inside corner with its grate and valve (R6: a berm has no expansion joints)
  const sx0 = -ex + t + 0.45, sz0 = -ez + t + 0.45, gsm = gl(sx0 + 0.4, sz0 + 0.4);
  sink.span('stone', sx0, gsm - 0.6, sz0, sx0 + 0.8, gsm + 0.08, sz0 + 0.8, { decor: true, shade: 0.8 });
  for (let k = 0; k < 5; k++) sink.span('structureMetal', sx0 + 0.1 + k * 0.15, gsm + 0.08, sz0 + 0.1, sx0 + 0.13 + k * 0.15, gsm + 0.11, sz0 + 0.7, { colour: IRON, decor: true, fine: true });
  const gs = gl(0, ez + 0.1);
  sink.span('structureWood', -1.3, gs - 0.3, ez - 0.4, 1.3, gs + 0.25, ez + 0.6, { colour: TIMBER, decor: true });
  return { parts: finishLandmark(sink) };
};


