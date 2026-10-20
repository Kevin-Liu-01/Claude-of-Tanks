// src/world/canyonWall.ts — the relief of a canyon arm's walls (the map-revival lane, 2026-10-07, Skybridge round 5;
// gauntlet wave 207's read of round 4's arm: its walls "flat vertical planes" carrying "zigzag strata").
//
// Glen Canyon's walls are Navajo sandstone cut by the river and drowned by the lake: not one plane but a run of rounded
// buttresses between alcoves the seeps hollowed, each face fluted where the rain runs off the rim, the cross-beds' great
// sweeps standing a hand proud and receding by turns, desert varnish streaming down from the brow in dark curtains, and
// at the waterline the paler bathtub ring the lake's falling level left. A heightfield gives a sheer wall no such form,
// so this is the wall's skin: rows of the trench's own wall, read on stations along its axis, pushed off the terrain
// toward the void by buttresses, flutes and beds, tucked under the brow's caprock (caprockRim.ts) at the top, under the
// water at the foot, and into the wall at each end of its run. The landform stays the battlefield's rock: the skin is
// decor no hull reaches (the wall is sheer; the lake keeps every hull off its foot). Welded vertex-coloured geometry in
// the scenery rock family (castleRock.ts finishSkin's attribute set), drawn with the formations. Deterministic: only the
// stream it is handed and the shared noise.
import * as THREE from 'three';
import type { SimplexNoise } from '../engine/simplexFast.ts';
import { finishSkin, hsl, SkinMesh, type CastleGround, type V3 } from './castleRock.ts';
import { landformPathStation, prepareLandformPath, type LandformPathStation } from './landformPath.ts';
import { caprockGap } from './caprockRim.ts';

type Rng = () => number;

/** A trench landform's walls to relieve. */
interface CanyonWallSpec {
  /** The trench's centre, length, width (its search reaches 0.75 of it out from the axis) and bearing (degrees from +x
   * toward +z). */
  x: number;
  z: number;
  length: number;
  width: number;
  yawDeg: number;
  /** The water's surface: the skin starts a little under it (default: the wall's foot). */
  waterLevel?: number;
  /** The share of the length the skin runs (default 0.82: the ends are the trench's heads). */
  span?: number;
  /** (the maps lane, 2026-10-17, Aegis r6) a wall stepped by benches (a gorge cut in stages, its ledges a few metres wide):
   * a gentle run shorter than this (m) under a further rise is a ledge of the wall, not its brow (default 0: the first
   * gentle run is the brow, as on Glen Canyon's single sheer walls). */
  benchM?: number;
  /** (the maps lane, 2026-10-17, Aegis r6) the lake's calcite bathtub ring over the water (default true; a dry gorge
   * floored by its river bed has none). */
  ring?: boolean;
  /** sRGB HSL base tone of the rock (default Navajo sandstone). */
  tone?: readonly [number, number, number];
  /** (the maps lane, 2026-10-17, Aegis r7) the wall as a bedded freestone instead of Glen Canyon's fluted slickrock: thick
   * level beds standing proud and receding by turns (ledges over the soft beds, overhangs under the hard ones), split by
   * their joints into blocks, buttressed by spurs that stand to their own heights, weathered grey in patches and
   * streaked down from the ledges at no rhythm, a talus apron and its fallen blocks at the foot, the top tucked under the
   * brow's caprock (default: none, the fluted skin). */
  beds?: CanyonWallBeds;
  /** (Skybridge round 6) a path trench's control points (its landform's `path`, landformPath.ts): the skin follows the
   * curve, its length the curve's; x, z, length and yawDeg then only name it. */
  path?: ReadonlyArray<readonly [number, number]>;
}

/** (Aegis r7) A bedded wall's make (CanyonWallSpec.beds). */
export interface CanyonWallBeds {
  /** A bed's thickness range (m; default 0.6-3.8): thin partings, the common beds a metre or two, the odd massive one. */
  thickness?: readonly [number, number];
  /** The talus apron's height range over the wall's foot (m; default 2.5-7.5); its toe runs out about half as far. */
  talus?: readonly [number, number];
  /** How far under the brow the skin ends, behind the caprock's lip (m; default 1.0). */
  capTuck?: number;
  /** Runs of the axis (s, m from the centre) where no spur stands out of the wall (a viaduct's piers). */
  keepClear?: ReadonlyArray<readonly [number, number]>;
  /** Where the brow's broken caprock has fallen away (its broken.gaps threshold, caprockRim.ts caprockGap): the skin
   * rounds its top over the bare brow there (default none). */
  capGaps?: number;
}

interface CanyonWallOptions {
  mobile?: boolean;
}

const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** A wall found on one station: its foot and brow (out from the axis) and their heights. */
interface WallStation { s: number; foot: number; footY: number; brow: number; browY: number }

/** Out from the axis on station s: the floor, then the wall's rise (its foot), then where it levels off (its brow; a
 * gentle run shorter than benchM under a further rise is a ledge of the wall). Null when no wall four metres high. */
function findWallStation(at: (s: number, r: number) => number, s: number, width: number, benchM: number): WallStation | null {
  let foot = NaN, footY = 0, brow = NaN, browY = 0;
  for (let r = 1; r < width * 0.75; r += 0.25) {
    const y0 = at(s, r), y1 = at(s, r + 0.5);
    if (Number.isNaN(foot)) { if (y1 - y0 > 0.4) { foot = r; footY = y0; } }
    else if (y1 - y0 < 0.12) {
      // a ledge: the ground rises again within benchM (spec.benchM, 0 = none)
      let rises = false;
      for (let q = r + 0.5; q <= r + benchM && q < width * 0.75; q += 0.25) if (at(s, q + 0.5) - at(s, q) > 0.4) { rises = true; break; }
      if (rises) continue;
      brow = r; browY = y0; break;
    }
  }
  return Number.isFinite(brow) && browY - footY > 4 ? { s, foot, footY, brow, browY } : null;
}

/** Build both walls' skins of the trench. */
export function buildCanyonWall(spec: CanyonWallSpec, ground: CastleGround, noise: SimplexNoise, rng: Rng,
  { mobile = false }: CanyonWallOptions = {}): { geometry: THREE.BufferGeometry | null; triangles: number } {
  const groundAt = ground.getHeightAtFast ? (x: number, z: number) => ground.getHeightAtFast!(x, z) : (x: number, z: number) => ground.getHeightAt(x, z);
  const yaw = THREE.MathUtils.degToRad(spec.yawDeg);
  const ax: V3 = [Math.cos(yaw), 0, Math.sin(yaw)];
  // (round 6) a station's frame: the straight axis's (exactly as before), or the path's point and tangent
  const path = spec.path ? prepareLandformPath(spec.path, spec.width) : null;
  const st: LandformPathStation = { x: 0, z: 0, tx: ax[0], tz: ax[2] };
  let stS = NaN;
  const frameAt = (s: number): LandformPathStation => {
    if (s === stS) return st;
    stS = s;
    if (path) return landformPathStation(path, s, st);
    st.x = spec.x + ax[0] * s; st.z = spec.z + ax[2] * s;
    return st;
  };
  const span = (spec.span ?? 0.82) * (path ? path.length : spec.length);
  if (spec.beds) return buildBeddedWall(spec, spec.beds, groundAt, frameAt, span, noise, rng, mobile);
  const step = mobile ? 2.8 : 1.4;
  const stations = Math.max(2, Math.floor(span / step));
  const tone = spec.tone ?? [0.045, 0.5, 0.46];
  const mesh = new SkinMesh();
  const salt = rng() * 100;
  for (const side of [-1, 1]) {
    // per station: the wall's foot and brow on this side (out from the axis, the floor, then the rise, then the plain)
    const at = (s: number, r: number) => { const f = frameAt(s); return groundAt(f.x + -f.tz * side * r, f.z + f.tx * side * r); };
    const walls: Array<WallStation | null> = [];
    for (let k = 0; k <= stations; k++) walls.push(findWallStation(at, -span / 2 + (k / stations) * span, spec.width, spec.benchM ?? 0));
    // the rows: from under the water (or the wall's foot) to under the brow's caprock
    const rows = mobile ? 9 : 16;
    /** The wall's distance from the axis at height y on a station (the first rise through y, out from the axis). */
    const wallAt = (s: number, y: number, from: number, to: number): number => {
      let prev = from;
      for (let r = from; r <= to + 0.5; r += 0.25) {
        if (at(s, r) >= y) {
          const g0 = at(s, prev), g1 = at(s, r);
          return prev + (r - prev) * Math.max(0, Math.min(1, (y - g0) / Math.max(1e-6, g1 - g0)));
        }
        prev = r;
      }
      return to;
    };
    const grid: number[][] = [];
    for (let k = 0; k <= stations; k++) {
      const w = walls[k];
      if (!w) { grid.push([]); continue; }
      const yLow = (spec.waterLevel ?? w.footY) - 0.7, yTop = w.browY - 0.5;
      // the skin's run: buttresses, the rain's flutes, the beds; tucked into the wall at the run's ends and under the brow
      const t = k / stations, endFade = smooth(0, 0.035, t) * smooth(0, 0.035, 1 - t);
      const butt = smooth(-0.2, 0.7, noise.noise(w.s / 22 + salt, side * 3.7) * 0.75 + noise.noise(w.s / 9 - salt, side) * 0.25);
      const col: number[] = [];
      for (let i = 0; i < rows; i++) {
        const y = yLow + (yTop - yLow) * (i / (rows - 1));
        const rw = wallAt(w.s, y, Math.max(0.5, w.foot - 2), w.brow);
        const flute = Math.pow(0.5 + 0.5 * Math.cos((w.s / (2.6 + 0.8 * Math.sin(salt))) * Math.PI * 2 + noise.noise(w.s * 0.08, y * 0.05 + salt) * 2.2), 5);
        const bed = 0.22 * Math.sin(y * 0.9 + noise.noise(w.s * 0.03 + 7, salt) * 2.6) + 0.12 * Math.sin(y * 2.3 + w.s * 0.02);
        let p = 0.35 + 2.3 * butt - 0.32 * flute + bed;
        // (under the brow the skin closes on the wall: the caprock's lip stands proud of it, the skin's top tucked behind)
        p = Math.max(0.35, Math.max(0.15, p) * (0.15 + 0.85 * smooth(yTop + 0.1, yTop - 3.5, y)));
        p = p * endFade - 0.5 * (1 - endFade);
        // toward the void: back along the station's ray to the axis
        const r = rw - p;
        const f = frameAt(w.s);
        const pt: V3 = [f.x + -f.tz * side * r, y, f.z + f.tx * side * r];
        // the colour: the sandstone's cross-beds, the varnish curtains from the brow, the bathtub ring at the water
        const mott = noise.noise3d(pt[0] * 0.17 + salt, pt[1] * 0.17, pt[2] * 0.17);
        const sweep = Math.sin(y * 1.7 + w.s * 0.11 + mott * 1.4);
        let h = tone[0] + 0.008 * sweep, sa = tone[1] * (1 - 0.08 * sweep), l = tone[2] * (1 + 0.06 * sweep + 0.05 * mott);
        const curtain = smooth(0.5, 0.85, noise.noise(w.s * 0.21 + salt * 2, side * 5.1) * 0.5 + 0.5) * smooth(yLow, yTop, y);
        l *= 1 - 0.38 * curtain; sa *= 1 - 0.3 * curtain;
        // (round 6, wave 259: "no legible bathtub ring") the lake's calcite ring: a pale band some five metres over the
        // water, its top a crisp line where the lake stood longest, wavering a little along the wall
        const ringTop = yLow + 5.2 + 0.6 * noise.noise(w.s * 0.05 + salt, side * 2.9);
        const ring = spec.ring === false ? 0 : 1 - smooth(ringTop - 0.35, ringTop + 0.15, y);
        l *= 1 + 0.62 * ring; sa *= 1 - 0.55 * ring;
        l *= 1 - 0.1 * flute - 0.12 * (1 - Math.min(1, p / 0.9));
        col.push(mesh.vert(pt, hsl(h, sa, l), groundAt(pt[0], pt[2])));
      }
      grid.push(col);
    }
    // the faces between neighbouring stations (a station with no wall parts the skin); toward the void: the station's
    // own inward normal (the straight axis's one normal)
    for (let k = 0; k < stations; k++) {
      const a = grid[k], b = grid[k + 1];
      if (!a.length || !b.length) continue;
      const f = frameAt(-span / 2 + (k / stations) * span);
      const out: V3 = [f.tz * side, 0, -f.tx * side];
      for (let i = 0; i + 1 < rows; i++) {
        mesh.tri(a[i], b[i], b[i + 1], out);
        mesh.tri(a[i], b[i + 1], a[i + 1], out);
      }
    }
  }
  if (!mesh.idx.length) return { geometry: null, triangles: 0 };
  return { geometry: finishSkin(mesh, 50), triangles: mesh.idx.length / 3 };
}

// ------------------------------------------------------------------------------------------ the bedded freestone
// (the maps lane, 2026-10-17, Aegis r7; the r6 blind's after-defects: "evenly spaced vertical streaks read as a hanging
// curtain", "flat faces the same height with dead-straight tops, meeting the floor in a straight line with no talus",
// "a row of dark dashes along the lower walls", "a repeating diamond tile pattern", "a smooth melted dome with stripes
// stretched over it") Ronda's Tajo is cut in the Miocene calcarenite: a freestone laid in thick level beds, the hard beds
// standing proud as ledges and lips over the soft ones that the weather hollows, the beds split by their joints into
// blocks (some fallen out, leaving a hollow), the wall buttressed by spurs that stand to their own heights, the stone a
// warm buff-ochre greyed in patches by the weather and streaked down from the ledges where the water runs off them, and
// at the foot the talus of what fell, its blocks strewn on it. The same beds run on at the same heights on both walls.
// The skin keeps clear of the rendered ground (its 1.33 m triangles bulge out of the heightfield at a concave corner:
// the stepped gorge's bench, the wall's foot), so no ledge of the landform shows through it; the wall's vertices read
// the floor as their ground (the rock material's soil band and moss stay at the foot, not on a bench), and its tile
// runs along the beds, each joint block its own cut of it.

type FrameAt = (s: number) => LandformPathStation;
/** A bed of the freestone (world heights before the waver) and its make: how far it stands proud, its tone's shifts. */
interface Bed { y0: number; y1: number; proud: number; dh: number; ds: number; dl: number; blind: boolean }
/** A joint block of one bed on one wall: where it ends along the axis, its own stand and tone, its cut of the tile. */
interface JointBlock { s1: number; jut: number; dl: number; hollow: boolean; u: number; v: number }
/** A spur standing out of one wall: where it ends along the axis, how far it stands out, how high (a share of the wall). */
interface Spur { s1: number; out: number; top: number }
/** A master joint opened into a cleft down one wall: its station, half-width, the height it opens from, its depth. */
interface Cleft { s: number; half: number; y: number; depth: number }
/** A weathering streak down one wall from under a bed: its station, half-width, head (a bed's foot) and length, kind. */
interface Streak { s: number; half: number; y: number; len: number; dark: boolean; k: number }
/** One station's column: its rows' places, vertices and kinds, and what its talus and fallen blocks read. */
interface Column { r: Float64Array; y: Float64Array; idx: Int32Array; talus: Uint8Array; faceU: Float64Array; faceV: Float64Array;
  rToe: number; rMeet: number; footY: number; ht: number; full: boolean }

function buildBeddedWall(spec: CanyonWallSpec, beds: CanyonWallBeds, groundAt: (x: number, z: number) => number, frameAt: FrameAt,
  span: number, noise: SimplexNoise, rng: Rng, mobile: boolean): { geometry: THREE.BufferGeometry | null; triangles: number } {
  const step = mobile ? 4 : 2;
  const stations = Math.max(2, Math.floor(span / step));
  const tone = spec.tone ?? [0.105, 0.24, 0.56];
  const [tMin, tMax] = beds.thickness ?? [0.6, 3.8];
  const [hMin, hMax] = beds.talus ?? [2.5, 7.5];
  const capTuck = beds.capTuck ?? 1.0;
  const keepClear = beds.keepClear ?? [];
  // the clearances off the rendered ground: the face's least stand, horizontally and over the ground under it
  const C0 = 0.85, CH = 0.85, CV = 0.6, P_TOP = 0.45;
  const salt = rng() * 100;
  const mesh = new SkinMesh();
  const uv: number[] = [], faceUv: number[] = [];
  mesh.uv = uv; mesh.faceUv = faceUv;
  const vert = (p: V3, c: readonly [number, number, number], g: number, u: number, v: number): number => { uv.push(u, v); return mesh.vert(p, c, g); };
  const tri = (a: number, b: number, c: number, out: V3, fu: number, fv: number): void => {
    if (a === b || b === c || a === c) return;
    mesh.tri(a, b, c, out); faceUv.push(fu, fv);
  };

  // both walls' stations (as the fluted skin finds them)
  const sides = [-1, 1].map((side) => {
    const at = (s: number, r: number) => { const f = frameAt(s); return groundAt(f.x + -f.tz * side * r, f.z + f.tx * side * r); };
    const walls: Array<WallStation | null> = [];
    for (let k = 0; k <= stations; k++) walls.push(findWallStation(at, -span / 2 + (k / stations) * span, spec.width, spec.benchM ?? 0));
    return { side, at, walls };
  });
  let yMin = Infinity, yMax = -Infinity;
  for (const { walls } of sides) for (const w of walls) if (w) { yMin = Math.min(yMin, w.footY); yMax = Math.max(yMax, w.browY - capTuck); }
  if (!Number.isFinite(yMin)) return { geometry: null, triangles: 0 };

  // the beds, one sequence for both walls: the odd thin one, the common beds one to three metres, the odd massive one,
  // and a quarter of the partings blind (a phone's half as many beds, each twice as thick)
  const bedList: Bed[] = [];
  for (let y = yMin - 1.5; y < yMax + 1.5;) {
    const roll = rng(), q = rng(), hard = rng();
    const t = (roll < 0.12 ? tMin + (tMax - tMin) * 0.12 * q : roll < 0.78 ? tMin + (tMax - tMin) * (0.2 + 0.4 * q) : tMax - (tMax - tMin) * 0.35 * q) * (mobile ? 1.8 : 1);
    const bed: Bed = { y0: y, y1: y + t, proud: hard > 0.55 ? 0.3 + (hard - 0.55) / 0.45 : 0.15 * hard,
      dh: (rng() - 0.5) * 0.018, ds: (rng() - 0.5) * 0.35, dl: (rng() - 0.45) * 0.14, blind: rng() < 0.25 };
    // (a blind parting: the bed runs on from the one under it, one massive bed with no line between)
    const under = bedList[bedList.length - 1];
    if (bed.blind && under) { bed.proud = under.proud; bed.dh = under.dh; bed.ds = under.ds; bed.dl = under.dl; }
    bedList.push(bed);
    y += t;
  }
  const nb = bedList.length;
  // the rows: the talus's toe (under the floor, on it), then each bed's four (its foot's parting and face, its top's face
  // and parting: the parting rows are the face rows' twins, so a bed's edge is a crease, a line where the beds stand
  // flush, a ledge or an overhang where they do not), then the lid's three where the caprock has fallen away
  const R = 2 + nb * 4 + 3, LID = R - 3;
  const rowY = (j: number, wav: number): number => {
    const b = (j - 2) >> 2, e = (j - 2) & 3;
    return (e < 2 ? bedList[b].y0 + 0.05 : bedList[b].y1 - 0.05) + wav;
  };
  const inClear = (s: number) => keepClear.some(([a, b]) => s > Math.min(a, b) - 2 && s < Math.max(a, b) + 2);

  for (const { side, at, walls } of sides) {
    // this wall's joints, each through a few beds (a fracture, not a mortar line), and the blocks they part in each bed;
    // its spurs and streaks
    const joints: Array<{ s: number; b0: number; b1: number }> = [];
    for (let sJ = -span / 2 - rng() * 2; sJ < span / 2 + step; sJ += 0.6 + rng() * 2) {
      const b0 = Math.floor(rng() * nb);
      joints.push({ s: sJ, b0, b1: Math.min(nb - 1, b0 + Math.floor(rng() * rng() * 8)) });
    }
    const blocks: JointBlock[][] = bedList.map((_, b) => {
      const ends = joints.filter((j) => b >= j.b0 && b <= j.b1).map((j) => j.s);
      ends.push(span / 2 + 2 * step);
      return ends.map((s1) => ({ s1, jut: (rng() - 0.5) * 0.5, dl: (rng() - 0.5) * 0.08, hollow: rng() < 0.05, u: rng() * 17, v: rng() * 13 }));
    });
    const spurs: Spur[] = [];
    for (let s1 = -span / 2 - rng() * 10; s1 < span / 2 + step;) {
      s1 += 5 + rng() * 21;
      const has = rng() >= 0.42, out = 0.8 + 3.0 * Math.pow(rng(), 0.8), top = 0.3 + 0.62 * rng();
      spurs.push({ s1, out: has ? out : 0, top });
    }
    const streaks: Streak[] = [];
    for (let i = Math.round(span / 6); i > 0; i--) {
      const b = Math.floor(rng() * nb);
      streaks.push({ s: -span / 2 + rng() * span, half: step * (0.8 + rng() * 1.4), y: bedList[b].y0, len: 2 + rng() * 11, dark: rng() < 0.35, k: 0.35 + 0.65 * rng() });
    }
    // the master joints, opened by the weather into clefts from some bed up to the brow, tens of metres apart at no rhythm
    const clefts: Cleft[] = [];
    for (let sC = -span / 2 + rng() * 30; sC < span / 2; sC += 12 + rng() * 48) {
      clefts.push({ s: sC, half: step * (0.6 + rng() * 0.9), y: bedList[Math.floor(rng() * nb)].y0, depth: 0.6 + rng() * 0.8 });
    }
    const ptr = new Int32Array(nb);
    const blockAt = (b: number, s: number): JointBlock => {
      const list = blocks[b];
      let i = ptr[b];
      while (i < list.length - 1 && list[i].s1 < s) i++;
      ptr[b] = i;
      return list[i];
    };
    let spurPtr = 0;
    const vd: V3 = [0, 0, 0];
    const cols: Array<Column | null> = [];
    const prof = new Float64Array(2048);
    for (let k = 0; k <= stations; k++) {
      const w = walls[k];
      if (!w) { cols.push(null); continue; }
      const s = w.s;
      // the station's ground out from the axis, a quarter metre a sample
      const rA = Math.max(0.5, w.foot - 8), n = Math.min(prof.length, Math.ceil((w.brow + 2 - rA) / 0.25) + 1);
      for (let i = 0; i < n; i++) prof[i] = at(s, rA + i * 0.25);
      const g = (r: number): number => {
        const t = (r - rA) / 0.25;
        if (t < 0 || t > n - 1) return at(s, r);
        const i = Math.min(n - 2, Math.floor(t));
        return prof[i] + (prof[i + 1] - prof[i]) * (t - i);
      };
      const i0 = Math.round((Math.max(rA, w.foot - 2) - rA) / 0.25);
      const wallAt = (y: number): number => {
        for (let i = i0; i < n; i++) {
          if (prof[i] >= y) {
            if (i === i0) return rA + i * 0.25;
            const g0 = prof[i - 1], g1 = prof[i];
            return rA + (i - 1 + Math.max(0, Math.min(1, (y - g0) / Math.max(1e-6, g1 - g0)))) * 0.25;
          }
        }
        return w.brow;
      };
      const t01 = k / stations, endFade = smooth(0, 0.035, t01) * smooth(0, 0.035, 1 - t01), full = endFade >= 0.999;
      const wav = 0.3 * noise.noise(s / 70 + salt, 1.7) + 0.08 * noise.noise(s / 17 - salt, side * 4.1);
      const yLo = w.footY + 0.25, yHi = w.browY - capTuck;
      while (spurPtr < spurs.length - 1 && spurs[spurPtr].s1 < s) spurPtr++;
      const clear = inClear(s);
      const spur = spurs[spurPtr], spurOut = clear ? 0 : spur.out;
      const butt = clear ? 0 : 0.9 * smooth(-0.1, 0.6, noise.noise(s / 48 + salt, side * 2.3));
      const ht = Math.max(1, Math.min(hMin + (hMax - hMin) * smooth(-0.6, 0.6, noise.noise(s / 26 + salt * 1.3, side * 1.9) * 0.75
        + noise.noise(s / 7 - salt, side * 0.7) * 0.25), 0.5 * (yHi - w.footY)));
      const spurTop = w.footY + ht + (yHi - 8 - w.footY - ht) * spur.top;
      const cleft = clefts.find((c) => Math.abs(c.s - s) < c.half) ?? null;
      /** The face's stand toward the void on bed b at height y. */
      const stand = (b: number, y: number): number => {
        const bed = bedList[b], blk = blockAt(b, s);
        // (a bed's stand runs on for tens of metres, waxing and waning: a ledge's run, not a block's)
        const run = 0.5 + 0.5 * smooth(-0.5, 0.5, noise.noise(s / 40 + b * 7.3, side * 3.3 + salt));
        let p = C0 + 0.35 + butt + bed.proud * run + blk.jut - (blk.hollow ? 0.9 : 0) + (bed.y1 + wav <= spurTop ? spurOut : 0)
          - (cleft && y >= cleft.y + wav ? cleft.depth : 0) + 0.12 * noise.noise(s * 0.37 + b * 3.1, salt);
        p = Math.max(C0, p);
        // the wall's top eight metres: the beds stepping back under the caprock, each standing on its own (no spur, no
        // buttress), the soft bed under the cap hollowed behind its lip
        if (y > yHi - 8) {
          const top = P_TOP + 0.8 * Math.max(0, bed.proud + 0.5 * blk.jut);
          p += (top - p) * smooth(yHi - 8, yHi - 3.2, y);
          if (bed.y0 + wav > yHi - 1.2 || y > yHi - 0.6) p = P_TOP * 0.5;
        }
        return p * endFade - 0.5 * (1 - endFade);
      };
      // and in its top three metres no further out than the caprock's lip leans (the landform's brow rounds back there;
      // the skin closing on it under a soft brow read as a melted dome, standing out past the cap as a bulge)
      const reach = (y: number) => (y <= yHi - 3 ? Infinity : 1.1 + 0.6 * (yHi - y));
      const bedOf = (y: number) => { let b = 0; while (b < nb - 1 && bedList[b].y1 + wav < y) b++; return b; };
      // the talus: from its toe on the floor, concave, up to where it meets the wall (or the spur) at its top
      const L = (0.6 + 0.42 * ht) * endFade, rToe = w.foot - L;
      const yMeet = w.footY + ht, rMeet = wallAt(yMeet) - (stand(bedOf(yMeet), yMeet) + 0.25);
      const talusR = (y: number): number => {
        const u = Math.max(0, Math.min(1, (y - w.footY) / ht));
        return rToe + (rMeet - rToe) * (0.3 * u + 0.7 * (1 - (1 - u) * (1 - u)));
      };
      const col: Column = { r: new Float64Array(R), y: new Float64Array(R), idx: new Int32Array(R), talus: new Uint8Array(R),
        faceU: new Float64Array(nb), faceV: new Float64Array(nb), rToe, rMeet, footY: w.footY, ht, full };
      col.r[0] = rToe - 0.9; col.y[0] = g(rToe - 0.9) - 0.45; col.talus[0] = 1;
      col.r[1] = rToe; col.y[1] = g(rToe) + 0.06; col.talus[1] = 1;
      for (let j = 2; j < LID; j++) {
        const b = (j - 2) >> 2;
        const y = Math.max(yLo, Math.min(yHi, rowY(j, wav)));
        let r: number;
        if (y - w.footY < ht) {
          col.talus[j] = 1;
          r = Math.min(talusR(y) + 0.3 * noise.noise3d(s * 0.31 + salt, y * 0.45, side), wallAt(y) - CH);
        } else r = Math.max(wallAt(y) - stand(b, y), w.brow - reach(y));
        if (full) {
          // clear of the rendered ground: off the wall, and over the ground under it
          const top = yHi - y < 1.5, ch = top ? 0.25 : CH, cv = col.talus[j] ? Math.min(CV, 0.45 * (y - w.footY)) : top ? 0.3 : CV;
          for (let t = 0; t < 40 && (g(r) > y - cv || wallAt(y) - r < ch); t++) r -= 0.25;
        }
        col.r[j] = r; col.y[j] = y;
      }
      // and between the rows: a face from a row under a ledge to one over it must not cut the ledge's lip
      if (full) {
        for (let pass = 0; pass < 3; pass++) {
          for (let j = 2; j + 1 < LID; j++) {
            if (col.y[j + 1] - col.y[j] < 0.02) continue;
            for (let t = 0; t < 12; t++) {
              let bad = false;
              for (const f of [0.25, 0.5, 0.75]) {
                const rm = col.r[j] + (col.r[j + 1] - col.r[j]) * f, ym = col.y[j] + (col.y[j + 1] - col.y[j]) * f;
                if (g(rm) > ym - 0.3) { bad = true; break; }
              }
              if (!bad) break;
              col.r[j] -= 0.25; col.r[j + 1] -= 0.25;
            }
          }
          // (a face row and its parting twin stay one place: the nearer the void of the two)
          for (let j = 2; j < LID; j += 2) { const r = Math.min(col.r[j], col.r[j + 1]); col.r[j] = r; col.r[j + 1] = r; }
        }
      }
      // the lid: where the caprock has fallen away, the top bed's weathered lip rounds over the bare brow onto the ground
      // behind it; elsewhere its rows stand on the top row (no face)
      const gap = full && beds.capGaps !== undefined && caprockGap(noise, s, side, beds.capGaps);
      for (let j = LID; j < R; j++) {
        col.talus[j] = 0;
        if (!gap) { col.r[j] = col.r[LID - 1]; col.y[j] = col.y[LID - 1]; continue; }
        const q = j - LID;
        const r = q === 0 ? Math.min(col.r[LID - 1] + 0.35, w.brow - 0.55) : q === 1 ? w.brow - 0.12 : w.brow + 0.8;
        col.r[j] = r;
        col.y[j] = q === 0 ? Math.max(col.y[LID - 1] + 0.3, Math.min(w.browY - 0.25, g(r) + 0.35)) : q === 1 ? Math.max(w.browY, g(r)) + 0.1 : g(r) - 0.1;
      }
      // the vertices: a talus row twin of the row under it shares its vertex; a wall's parting rows are their own (dark)
      const f = frameAt(s);
      vd[0] = f.tz * side; vd[2] = -f.tx * side;
      const active = streaks.filter((st) => Math.abs(st.s - s) < st.half);
      for (let j = 0; j < R; j++) {
        const lid = j >= LID, e = j < 2 || lid ? -1 : (j - 2) & 3, b = j < 2 ? 0 : lid ? nb - 1 : (j - 2) >> 2;
        const r = col.r[j], y = col.y[j];
        if (j > 0 && Math.abs(r - col.r[j - 1]) < 1e-6 && Math.abs(y - col.y[j - 1]) < 1e-6
          && (col.talus[j] || col.talus[j - 1] || y <= yLo || y >= yHi || !(e === 1 || e === 3))) { col.idx[j] = col.idx[j - 1]; continue; }
        const pt: V3 = [f.x + -f.tz * side * r, y, f.z + f.tx * side * r];
        const mott = noise.noise3d(pt[0] * 0.21 + salt, pt[1] * 0.21, pt[2] * 0.21);
        const grey = smooth(0.05, 0.55, noise.noise3d(pt[0] * 0.03 - salt, pt[1] * 0.05, pt[2] * 0.03));
        let h: number, sa: number, l: number, ground: number;
        if (col.talus[j]) {
          // the talus: the beds' stone broken small, paler and greyer, blotched by its blocks
          const lump = noise.noise3d(pt[0] * 0.55 - salt, pt[1] * 0.55, pt[2] * 0.55);
          h = tone[0] + 0.006; sa = tone[1] * 0.72 * (1 - 0.35 * grey); l = tone[2] * 1.04 * (1 + 0.1 * lump + 0.04 * mott);
          ground = groundAt(pt[0], pt[2]);
        } else {
          const bed = bedList[b], blk = blockAt(b, s);
          h = tone[0] + bed.dh; sa = tone[1] * (1 + bed.ds) * (1 - 0.55 * grey); l = tone[2] * (1 + bed.dl + blk.dl) * (1 + 0.06 * mott + 0.03 * grey);
          // a bed's lip bleached, its foot a shade darker; a hollow where a block fell out dark
          if (e === 2) l *= 1.04; else if (e === 1) l *= 0.96;
          if (blk.hollow) l *= 0.8;
          if (cleft && y >= cleft.y + wav) { l *= 0.92; sa *= 0.9; }
          // the streaks down from under the beds: grey calcite runs and dark varnish, each its own length, at no rhythm
          for (const st of active) {
            const head = st.y + wav;
            if (y > head || y < head - st.len) continue;
            const v = (1 - Math.abs(st.s - s) / st.half) * Math.pow(1 - (head - y) / st.len, 0.8) * st.k;
            if (st.dark) { l *= 1 - 0.32 * v; sa *= 1 - 0.25 * v; } else { sa *= 1 - 0.6 * v; l *= 1 + 0.05 * v; }
          }
          // the parting between the beds: a dark line where they stand flush, the top of a ledge where the bed over it
          // recedes (its lip in the sun, its back in the shade of the next bed), dark under an overhang
          const blindEdge = (e === 0 && bed.blind) || (e === 3 && b + 1 < nb && bedList[b + 1].blind);
          if ((e === 0 || e === 3) && !blindEdge) {
            const dr = e === 3 ? (j + 1 < R ? col.r[j + 1] - r : 0) : r - col.r[j - 1];
            if (dr > 0.25) l *= e === 3 ? 0.98 : 0.86;
            else if (dr < -0.25) { l *= e === 3 ? 0.8 : 0.78; sa *= 0.9; }
            else { l *= 0.9; sa *= 0.9; }
          }
          ground = lid ? groundAt(pt[0], pt[2]) : w.footY - 0.3;
        }
        col.idx[j] = vert(pt, hsl(h, sa, l), ground, s * 0.11, y * 0.08);
      }
      for (let b = 0; b < nb; b++) { const blk = blockAt(b, s + step / 2); col.faceU[b] = blk.u; col.faceV[b] = blk.v; }
      cols.push(col);
    }
    // the faces between neighbouring stations (a station with no wall parts the skin); each wound toward the profile's
    // own normal: toward the void over a face, up over a ledge, down under an overhang
    for (let k = 0; k < stations; k++) {
      const a = cols[k], c = cols[k + 1];
      if (!a || !c) continue;
      const f = frameAt(-span / 2 + ((k + 0.5) / stations) * span);
      vd[0] = f.tz * side; vd[2] = -f.tx * side;
      const tband = Math.floor(k * step / 9) * 7.31 % 17;
      for (let j = 0; j + 1 < R; j++) {
        const e1 = j + 1 < 2 || j + 1 >= LID ? -1 : (j - 1) & 3;
        if (e1 === 1 || e1 === 3) {
          // a face row and its parting twin stand in one place: no face between them
          if (!a.talus[j + 1] || !c.talus[j + 1]) continue;
        }
        const dy = (a.y[j + 1] - a.y[j]) + (c.y[j + 1] - c.y[j]), dr = (a.r[j + 1] - a.r[j]) + (c.r[j + 1] - c.r[j]);
        if (Math.abs(dy) < 1e-5 && Math.abs(dr) < 1e-5) continue;
        const out: V3 = [vd[0] * dy, dr, vd[2] * dy];
        const b = j + 1 < 2 ? 0 : j + 1 >= LID ? nb - 1 : (j - 1) >> 2;
        const tal = a.talus[j + 1] && c.talus[j + 1];
        const fu = tal ? tband : a.faceU[b], fv = tal ? tband * 0.61 : a.faceV[b];
        tri(a.idx[j], c.idx[j], c.idx[j + 1], out, fu, fv);
        tri(a.idx[j], c.idx[j + 1], a.idx[j + 1], out, fu, fv);
      }
    }
    // the fallen blocks on the talus (the big ones up it, only small stones at its toe on the floor)
    for (let sB = -span / 2 + rng() * 6; sB < span / 2; sB += 2.5 + rng() * 8) {
      const size = 0.45 + 1.7 * Math.pow(rng(), 1.8), up = Math.pow(rng(), 1.3) * 0.85;
      const dx = size * (0.45 + 0.25 * rng()), dy = size * (0.28 + 0.2 * rng()), dz = size * (0.4 + 0.25 * rng());
      const yaw = rng() * Math.PI * 2, tilt = (rng() - 0.5) * 0.6, dl = (rng() - 0.5) * 0.14, ou = rng() * 17, ov = rng() * 13;
      const k = Math.round(((sB + span / 2) / span) * stations), col = cols[k];
      if (!col || !col.full) continue;
      const hgt = col.ht * up;
      if (hgt < 0.5 && size > 0.8) continue;
      const u01 = Math.max(0, Math.min(1, hgt / col.ht));
      const rT = col.rToe + (col.rMeet - col.rToe) * (0.3 * u01 + 0.7 * (1 - (1 - u01) * (1 - u01)));
      const f = frameAt(-span / 2 + (k / stations) * span);
      const r = rT - size * 0.15, cy = col.footY + hgt + dy * 0.2;
      const cx = f.x + -f.tz * side * r, cz = f.z + f.tx * side * r;
      const cyw = Math.cos(yaw), syw = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
      const corner: V3[] = [];
      for (let q = 0; q < 8; q++) {
        const lx = q & 1 ? dx : -dx, ly0 = q & 2 ? dy : -dy, lz0 = q & 4 ? dz : -dz;
        const ly = ly0 * ct - lz0 * st, lz = ly0 * st + lz0 * ct;
        corner.push([cx + lx * cyw - lz * syw, cy + ly, cz + lx * syw + lz * cyw]);
      }
      const ids = corner.map((p) => {
        const mott = noise.noise3d(p[0] * 0.4 + salt, p[1] * 0.4, p[2] * 0.4);
        return vert(p, hsl(tone[0] + 0.004, tone[1] * 0.8, tone[2] * (1.02 + dl + 0.06 * mott)), groundAt(p[0], p[2]), (p[0] + p[2]) * 0.2, p[1] * 0.2);
      });
      for (const [q0, q1, q2, q3] of [[0, 2, 6, 4], [1, 3, 7, 5], [0, 1, 5, 4], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6]]) {
        const m: V3 = [0, 0, 0];
        for (const q of [q0, q1, q2, q3]) { m[0] += corner[q][0] / 4 - cx / 4; m[1] += corner[q][1] / 4 - cy / 4; m[2] += corner[q][2] / 4 - cz / 4; }
        tri(ids[q0], ids[q1], ids[q2], m, ou, ov);
        tri(ids[q0], ids[q2], ids[q3], m, ou, ov);
      }
    }
  }
  if (!mesh.idx.length) return { geometry: null, triangles: 0 };
  return { geometry: finishSkin(mesh, 50), triangles: mesh.idx.length / 3 };
}
