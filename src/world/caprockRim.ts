// src/world/caprockRim.ts — the hard bed along a wall's brow (the map-revival lane, 2026-10-07; the scenery `caprock`
// family). Chimney Valley round 3 (gauntlet wave 206: the bench top "a rounded sand dome with a stretched grey rock
// texture smeared down its right flank, not a flat cap rock ending in a sharp cliff rim") and Skybridge round 5 (the
// arm's walls "flat vertical planes" under a soft brow).
//
// A plateau's edge is its hardest bed: a slab one to two and a half metres thick lying on the brow, its lip a little
// proud of the wall below, split by its joints into blocks a few metres long, broken where a rill has cut the brow.
// Along a ridge (a bench, a mesa) the brow is where the cap falls away, out from the ridge's axis; along a trench (a
// canyon arm) it is where the wall rising from the floor levels off onto the plain, the lip leaning out over the void.
// The slab's top lies a hand over the ground behind the brow and its foot tucks into the wall, so a hull at the brow
// drives the terrain as before and sees a hard rim. Decor: no mass (the landform is the rock). Welded vertex-coloured
// geometry in the scenery rock family (castleRock.ts finishSkin's attribute set). Deterministic: only the stream it is
// handed and the shared noise.
import * as THREE from 'three';
import type { SimplexNoise } from '../engine/simplexFast.ts';
import { finishSkin, hsl, SkinMesh, type CastleGround, type V3 } from './castleRock.ts';
import { landformPathStation, prepareLandformPath, type LandformPathStation } from './landformPath.ts';

type Rng = () => number;

/** The ridge or trench whose brows the caprock runs along. */
export interface CaprockSpec {
  /** The landform's centre, length, width (a ridge's: the whole width; the rims are searched out to 0.75 of it) and
   * bearing (degrees from +x toward +z: 90 runs along z). */
  x: number;
  z: number;
  length: number;
  width: number;
  yawDeg: number;
  /** A trench (a canyon arm): the brows are the walls' tops, the lips leaning out over the floor. */
  trench?: boolean;
  /** The share of the length the ledge runs (its middle; the ends are the ridge's ramps or the trench's heads). Default
   * 0.82. */
  span?: number;
  /** sRGB HSL base tone of the bed (default a grey-brown welded tuff). */
  tone?: readonly [number, number, number];
  /** The bed's thickness range (m; default 1.2-2.5). */
  thickness?: readonly [number, number];
  /** The blocks' length range between the joints (m; default 5-12): a massive sandstone parts less often. */
  blockM?: readonly [number, number];
  /** (Skybridge round 6) a path landform's control points (its `path`, landformPath.ts): the brows follow the curve,
   * its length the curve's; x, z, length and yawDeg then only name it. */
  path?: ReadonlyArray<readonly [number, number]>;
}

interface CaprockBuildOptions {
  mobile?: boolean;
}

const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];

/** A brow found on one station: its distance from the axis, its height. */
interface Brow {
  s: number;
  r: number;
  y: number;
}

/**
 * Build the caprock along both brows of the ridge or trench. Returns the welded geometry (or null when no brow was
 * found), its triangles and its blocks.
 */
export function buildCaprockRim(spec: CaprockSpec, ground: CastleGround, noise: SimplexNoise, rng: Rng,
  { mobile = false }: CaprockBuildOptions = {}): { geometry: THREE.BufferGeometry | null; triangles: number; blocks: number } {
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
  const step = mobile ? 4 : 2.5;
  const stations = Math.floor(span / step);
  const trench = !!spec.trench;
  const crest = (s: number) => { const f = frameAt(s); return groundAt(f.x, f.z); };
  const tone = spec.tone ?? [0.075, 0.13, 0.52];
  const [tMin, tMax] = spec.thickness ?? [1.2, 2.5];
  const [bMin, bMax] = spec.blockM ?? [5, 12];
  const mesh = new SkinMesh();
  let blocks = 0;
  const salt = rng() * 100;
  for (const side of [-1, 1]) {
    // per station: the brow
    const rims: Array<Brow | null> = [];
    for (let k = 0; k <= stations; k++) {
      const s = -span / 2 + k * step;
      const at = (r: number) => { const f = frameAt(s); return groundAt(f.x + -f.tz * side * r, f.z + f.tx * side * r); };
      let found: Brow | null = null;
      if (!trench) {
        // a ridge: out from the axis, the first fall steeper than ~39 degrees with three metres down within six
        for (let r = 2; r < spec.width * 0.75; r += 0.25) {
          const y0 = at(r), y1 = at(r + 0.5);
          if (y0 - y1 > 0.4) {
            if (y0 - at(r + 6) > 3) found = { s, r, y: y0 };
            break;
          }
        }
        if (found && found.y < crest(s) - 3.5) found = null; // a rill's head, not the cap's edge
      } else {
        // a trench: out from the axis, the wall's rise (steeper than ~39 degrees), then where it levels off: the brow,
        // three metres or more over the wall's foot
        let foot = NaN, footY = 0;
        for (let r = 2; r < spec.width * 0.75; r += 0.25) {
          const y0 = at(r), y1 = at(r + 0.5);
          if (Number.isNaN(foot)) {
            if (y1 - y0 > 0.4) { foot = r; footY = y0; }
          } else if (y1 - y0 < 0.12) {
            if (y0 - footY > 3) found = { s, r, y: y0 };
            break;
          }
        }
      }
      rims.push(found);
    }
    // a station whose brow falls well under its neighbours' is a rill cutting it: the bed is broken there
    for (let k = 0; k <= stations; k++) {
      const me = rims[k];
      if (!me) continue;
      const nb = [rims[k - 2], rims[k - 1], rims[k + 1], rims[k + 2]].filter(Boolean) as Brow[];
      if (nb.length >= 2) { const ys = nb.map((n) => n.y).sort((a, b) => a - b); if (ys[ys.length >> 1] - me.y > 1.6) rims[k] = null; }
    }
    // over the void: out from the ridge's axis, toward the trench's
    const voidDir = trench ? -side : side;
    // the joints: blocks of 5 to 12 m (blockM) along the brow, a hand apart where one ends and the next begins
    let k = 0;
    while (k < stations) {
      while (k < stations && !rims[k]) k++;
      const len = Math.max(2, Math.round((bMin + rng() * (bMax - bMin)) / step));
      const k1 = Math.min(stations, k + len);
      let end = k;
      while (end < k1 && rims[end + 1]) end++;
      if (end - k >= 1) {
        const t = tMin + rng() * (tMax - tMin), over = 0.4 + rng() * 0.5;
        const rows: number[][] = [];
        for (let q = k; q <= end; q++) {
          const rim = rims[q]!;
          const sJ = rim.s + (q === k ? 0.12 : q === end ? -0.12 : 0);
          // dr: metres out over the void from the brow
          const P = (dr: number, y: number): V3 => {
            const r = trench ? rim.r - dr : rim.r + dr;
            const f = frameAt(sJ);
            return [f.x + -f.tz * side * r, y, f.z + f.tx * side * r];
          };
          const wob = noise.noise(sJ * 0.31 + salt, side * 3.1) * 0.25;
          const behind = P(-1.8, 0);
          const capY = Math.max(rim.y, groundAt(behind[0], behind[2]));
          const ov = over * (0.8 + 0.4 * (noise.noise(sJ * 0.53 - salt, side) * 0.5 + 0.5));
          const tt = t * (0.85 + 0.3 * (noise.noise(sJ * 0.21 + 7, side * 2) * 0.5 + 0.5));
          // the wall's face at the slab's foot
          let dw = 0;
          for (let dr = 0; dr < 8; dr += 0.25) { const p = P(dr, 0); if (groundAt(p[0], p[2]) < rim.y - tt) { dw = dr; break; } }
          const pts: V3[] = [
            P(-2.2, capY + 0.02),
            P(-0.6, rim.y + 0.14 + wob * 0.2),
            P(ov * 0.75, rim.y + 0.1),
            P(ov, rim.y - tt * 0.35),
            P(ov * 0.82, rim.y - tt),
            P(Math.min(dw - 0.35, ov * 0.5), rim.y - tt - 0.15),
          ];
          rows.push(pts.map((p, idx) => {
            const up = idx <= 2 ? 1 : 0;
            const mott = noise.noise3d(p[0] * 0.3 + salt, p[1] * 0.3, p[2] * 0.3);
            const l = tone[2] * (0.9 + 0.1 * mott) * (up ? 1.08 : idx === 5 ? 0.62 : 0.9);
            return mesh.vert(p, hsl(tone[0], tone[1], l), groundAt(p[0], p[2]));
          }));
        }
        for (let q = 0; q + 1 < rows.length; q++) {
          // toward the void: the row's own normal (the straight axis's one normal)
          const f = frameAt(rims[k + q]!.s);
          const out: V3 = [-f.tz * voidDir, 0, f.tx * voidDir];
          for (let idx = 0; idx < 5; idx++) {
            const a = rows[q][idx], b = rows[q][idx + 1], c = rows[q + 1][idx + 1], d = rows[q + 1][idx];
            const o: V3 = idx === 0 ? [0, 1, 0] : idx >= 4 ? [out[0], -1, out[2]] : idx === 1 ? [out[0] * 0.4, 1, out[2] * 0.4] : out;
            mesh.tri(a, b, c, o); mesh.tri(a, c, d, o);
          }
        }
        // the block's ends, along the curve at each
        const f0 = frameAt(rims[k]!.s), t0: V3 = [f0.tx, 0, f0.tz];
        mesh.poly(rows[0], scl(t0, -1));
        const f1 = frameAt(rims[end]!.s), t1: V3 = [f1.tx, 0, f1.tz];
        mesh.poly(rows[rows.length - 1], t1);
        blocks++;
      }
      // (the next block starts on this one's last station: the joint is the two ends' trims)
      k = end > k && end < stations && rims[end + 1] ? end : Math.max(end + 1, k + 1);
    }
  }
  if (!mesh.idx.length) return { geometry: null, triangles: 0, blocks: 0 };
  return { geometry: finishSkin(mesh, 40), triangles: mesh.idx.length / 3, blocks };
}
