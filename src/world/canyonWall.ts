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

type Rng = () => number;

/** A trench landform's walls to relieve. */
export interface CanyonWallSpec {
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
  /** sRGB HSL base tone of the rock (default Navajo sandstone). */
  tone?: readonly [number, number, number];
}

interface CanyonWallOptions {
  mobile?: boolean;
}

const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Build both walls' skins of the trench. */
export function buildCanyonWall(spec: CanyonWallSpec, ground: CastleGround, noise: SimplexNoise, rng: Rng,
  { mobile = false }: CanyonWallOptions = {}): { geometry: THREE.BufferGeometry | null; triangles: number } {
  const groundAt = ground.getHeightAtFast ? (x: number, z: number) => ground.getHeightAtFast!(x, z) : (x: number, z: number) => ground.getHeightAt(x, z);
  const yaw = THREE.MathUtils.degToRad(spec.yawDeg);
  const ax: V3 = [Math.cos(yaw), 0, Math.sin(yaw)], cr: V3 = [-Math.sin(yaw), 0, Math.cos(yaw)];
  const span = (spec.span ?? 0.82) * spec.length;
  const step = mobile ? 2.8 : 1.4;
  const stations = Math.max(2, Math.floor(span / step));
  const tone = spec.tone ?? [0.045, 0.5, 0.46];
  const mesh = new SkinMesh();
  const salt = rng() * 100;
  for (const side of [-1, 1]) {
    // per station: the wall's foot and brow on this side (out from the axis, the floor, then the rise, then the plain)
    const at = (s: number, r: number) => groundAt(spec.x + ax[0] * s + cr[0] * side * r, spec.z + ax[2] * s + cr[2] * side * r);
    const walls: Array<{ s: number; foot: number; footY: number; brow: number; browY: number } | null> = [];
    for (let k = 0; k <= stations; k++) {
      const s = -span / 2 + (k / stations) * span;
      let foot = NaN, footY = 0, brow = NaN, browY = 0;
      for (let r = 1; r < spec.width * 0.75; r += 0.25) {
        const y0 = at(s, r), y1 = at(s, r + 0.5);
        if (Number.isNaN(foot)) { if (y1 - y0 > 0.4) { foot = r; footY = y0; } }
        else if (y1 - y0 < 0.12) { brow = r; browY = y0; break; }
      }
      walls.push(Number.isFinite(brow) && browY - footY > 4 ? { s, foot, footY, brow, browY } : null);
    }
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
        const pt: V3 = [spec.x + ax[0] * w.s + cr[0] * side * r, y, spec.z + ax[2] * w.s + cr[2] * side * r];
        // the colour: the sandstone's cross-beds, the varnish curtains from the brow, the bathtub ring at the water
        const mott = noise.noise3d(pt[0] * 0.17 + salt, pt[1] * 0.17, pt[2] * 0.17);
        const sweep = Math.sin(y * 1.7 + w.s * 0.11 + mott * 1.4);
        let h = tone[0] + 0.008 * sweep, sa = tone[1] * (1 - 0.08 * sweep), l = tone[2] * (1 + 0.06 * sweep + 0.05 * mott);
        const curtain = smooth(0.5, 0.85, noise.noise(w.s * 0.21 + salt * 2, side * 5.1) * 0.5 + 0.5) * smooth(yLow, yTop, y);
        l *= 1 - 0.38 * curtain; sa *= 1 - 0.3 * curtain;
        const ring = 1 - smooth(yLow + 0.7, yLow + 6.5, y);
        l *= 1 + 0.32 * ring; sa *= 1 - 0.35 * ring;
        l *= 1 - 0.1 * flute - 0.12 * (1 - Math.min(1, p / 0.9));
        col.push(mesh.vert(pt, hsl(h, sa, l), groundAt(pt[0], pt[2])));
      }
      grid.push(col);
    }
    // the faces between neighbouring stations (a station with no wall parts the skin)
    const out: V3 = [-cr[0] * side, 0, -cr[2] * side];
    for (let k = 0; k < stations; k++) {
      const a = grid[k], b = grid[k + 1];
      if (!a.length || !b.length) continue;
      for (let i = 0; i + 1 < rows; i++) {
        mesh.tri(a[i], b[i], b[i + 1], out);
        mesh.tri(a[i], b[i + 1], a[i + 1], out);
      }
    }
  }
  if (!mesh.idx.length) return { geometry: null, triangles: 0 };
  return { geometry: finishSkin(mesh, 50), triangles: mesh.idx.length / 3 };
}
