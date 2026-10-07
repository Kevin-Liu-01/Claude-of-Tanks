// src/world/butteSkin.ts — a butte's wall in relief, its caprock and the rubble on its talus (the map-revival lane,
// 2026-10-07, Titan Gorge round 6; gauntlet wave 235 on the PR head's buttes: "a rounded-corner box whose near-vertical
// walls drop straight into a sand ramp, missing the broad talus pedestal and fluted cliffs").
//
// Monument Valley's buttes are De Chelly sandstone: one massive bed, a cliff a hundred metres or more high (here a
// few tens) standing on the Organ Rock shale's talus, the Shinarump caprock a pale hard rim on top. The wall is not a
// drum: it breaks along vertical joints into blocks that stand proud or have spalled back, rain has cut deep grooves
// of irregular spacing and depth from the rim down, desert varnish streams from the rim in dark curtains, and fallen
// blocks lie on the talus thickest at the cliff's foot. A heightfield draws none of that — its grooves were regular
// ribs — so this is the wall's skin: rows of the butte's own wall read on rays round its centre, pushed off the
// terrain by the blocks, grooves and joints, tucked under the caprock at the top and into the talus at the foot; the
// caprock a slab round the rim, its lip a hand proud of the wall and split at its joints; the rubble decor blocks on the
// talus. The landform stays the battlefield's rock (the wall is sheer, the talus keeps hulls off its foot): the skin and
// the rubble are decor. Welded vertex-coloured geometry in the scenery rock family (castleRock.ts finishSkin's
// attribute set), drawn with the formations. Deterministic: only the stream it is handed and the shared noise.
import * as THREE from 'three';
import type { SimplexNoise } from '../engine/simplexFast.ts';
import { finishSkin, hsl, SkinMesh, type CastleGround, type V3 } from './castleRock.ts';

type Rng = () => number;

/** A butte (a knoll landform with a sheer wall) to skin. */
export interface ButteSkinSpec {
  /** The knoll's centre and radii (the rays search 1.25 x the larger). */
  x: number;
  z: number;
  rx: number;
  rz: number;
  /** sRGB HSL base tones of the wall (default De Chelly sandstone) and the caprock (default a pale Shinarump). */
  tone?: readonly [number, number, number];
  capTone?: readonly [number, number, number];
}

interface ButteSkinOptions {
  mobile?: boolean;
}

const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** One ray's wall: where the cap's rim stands and where the wall meets its talus. */
interface RayWall {
  theta: number;
  brow: number;
  browY: number;
  foot: number;
  footY: number;
  toe: number;
}

/** Build the butte's wall skin, caprock and talus rubble. */
export function buildButteSkin(spec: ButteSkinSpec, ground: CastleGround, noise: SimplexNoise, rng: Rng,
  { mobile = false }: ButteSkinOptions = {}): {
    geometry: THREE.BufferGeometry | null; triangles: number; blocks: number; rubble: number;
    /** the wall's rows above the two tucked into the talus: how many, and how many stand inside the rock */
    clearance: { rows: number; inside: number };
  } {
  const groundAt = ground.getHeightAtFast ? (x: number, z: number) => ground.getHeightAtFast!(x, z) : (x: number, z: number) => ground.getHeightAt(x, z);
  const R = Math.max(spec.rx, spec.rz);
  const rays = mobile ? 84 : 180;
  const rows = mobile ? 10 : 18;
  const tone = spec.tone ?? [0.032, 0.58, 0.42];
  const capTone = spec.capTone ?? [0.075, 0.22, 0.6];
  const mesh = new SkinMesh();
  const salt = rng() * 100;
  const dirOf = (theta: number): V3 => [Math.cos(theta), 0, Math.sin(theta)];
  // the wall read on both the exact ground and the metre grid the terrain's mesh is drawn from, the higher of the two
  // (on a sheer face they part by up to a metre), so the skin stands clear of whichever is drawn
  const rockAt = ground.getHeightAtFast
    ? (x: number, z: number) => Math.max(ground.getHeightAt(x, z), ground.getHeightAtFast!(x, z)) : (x: number, z: number) => ground.getHeightAt(x, z);
  const at = (theta: number, r: number) => rockAt(spec.x + Math.cos(theta) * r, spec.z + Math.sin(theta) * r);
  // (the rim and the foot are found on the metre grid: the exact ground's beds and roughness break the scan's thresholds)
  const atGrid = (theta: number, r: number) => groundAt(spec.x + Math.cos(theta) * r, spec.z + Math.sin(theta) * r);

  // ---- per ray: the rim (where the cap's level ends in a drop) and the foot (where the drop eases onto the talus)
  const walls: Array<RayWall | null> = [];
  for (let k = 0; k < rays; k++) {
    const theta = (k / rays) * Math.PI * 2;
    let brow = NaN, browY = 0, foot = NaN, footY = 0, toe = NaN, sheer = false;
    for (let r = R * 0.2; r < R * 1.25; r += 0.25) {
      const y0 = atGrid(theta, r), y1 = atGrid(theta, r + 0.5);
      // (the brow where the cap's level breaks; the wall where the fall passes ~70 degrees; its foot where the fall eases
      // under ~60 degrees onto the scree, whose steepest is under ~50)
      if (Number.isNaN(brow)) { if (y0 - y1 > 0.6) { brow = r; browY = y0; } }
      else if (Number.isNaN(foot)) { if (y0 - y1 > 1.4) sheer = true; else if (sheer && y0 - y1 < 0.85) { foot = r; footY = y0; } }
      else if (y0 - y1 < 0.06) { toe = r; break; }
    }
    if (Number.isFinite(foot) && browY - footY > 6) walls.push({ theta, brow, browY, foot, footY, toe: Number.isFinite(toe) ? toe : foot + R * 0.4 });
    else walls.push(null);
  }

  // ---- the joints: the wall broken into blocks along the run, 3 to 11 m apart; each block its own setback and tone
  const perimeter = walls.reduce((sum, w, k) => {
    const n = walls[(k + 1) % rays];
    return sum + (w && n ? Math.hypot(Math.cos(n.theta) * n.foot - Math.cos(w.theta) * w.foot, Math.sin(n.theta) * n.foot - Math.sin(w.theta) * w.foot) : 0);
  }, 0) || Math.PI * 2 * R * 0.5;
  const joints: Array<{ at: number; width: number; depth: number; reach: number }> = [];
  for (let s = rng() * 4; s < perimeter; s += 3 + rng() * 8) {
    joints.push({ at: s / perimeter, width: (0.35 + rng() * 0.6) / perimeter, depth: 0.5 + rng() * 1.1, reach: 0.35 + rng() * 0.65 });
  }
  const blockOf = (u: number): number => { let b = 0; while (b + 1 < joints.length && joints[b + 1].at <= u) b++; return b; };
  const blockSet = joints.map(() => ({ setback: (rng() - 0.35) * 0.9, light: (rng() - 0.5) * 0.14, lean: (rng() - 0.5) * 0.5 }));

  // ---- the grooves the rain cut from the rim: irregular spacing (5 to 14 m), width and depth, each reaching down a
  // share of the wall; set by their own positions, not a periodic function, so no two neighbours match
  const grooves: Array<{ at: number; width: number; depth: number; reach: number }> = [];
  for (let s = rng() * 6; s < perimeter; s += 5 + rng() * 9) {
    grooves.push({ at: s / perimeter, width: (0.8 + rng() * 1.8) / perimeter, depth: 0.7 + rng() * 1.3, reach: 0.4 + rng() * 0.6 });
  }

  /** The wall's distance from the centre at height y on a ray: its outermost rise through y, searched in from below the
   * foot, so a rill cut near the rim never seats the skin inside the rock standing out beyond it. */
  const wallAt = (w: RayWall, y: number): number => {
    let prev = w.foot + 2;
    for (let r = w.foot + 2; r >= w.brow - 1; r -= 0.25) {
      if (at(w.theta, r) >= y) {
        const g0 = at(w.theta, prev), g1 = at(w.theta, r);
        return r + (prev - r) * Math.max(0, Math.min(1, (g1 - y) / Math.max(1e-6, g1 - g0)));
      }
      prev = r;
    }
    return w.brow;
  };

  // ---- the wall's skin
  const grid: number[][] = [];
  const clearance = { rows: 0, inside: 0 };
  for (let k = 0; k < rays; k++) {
    const w = walls[k];
    if (!w) { grid.push([]); continue; }
    const u = k / rays;
    const yLow = w.footY - 0.6, yTop = w.browY - 0.25;
    const block = blockSet[blockOf(u)] ?? { setback: 0, light: 0, lean: 0 };
    const col: number[] = [];
    for (let i = 0; i < rows; i++) {
      const t = i / (rows - 1), y = yLow + (yTop - yLow) * t;
      const rw = wallAt(w, y);
      // the joints' cracks and the grooves: a V notch each, reaching down from the rim its own share of the wall
      let cut = 0, inGroove = 0;
      for (const j of joints) {
        const d = Math.abs(((u - j.at + 1.5) % 1) - 0.5) / j.width;
        if (d < 1 && t > 1 - j.reach) cut = Math.max(cut, j.depth * (1 - d) * smooth(1 - j.reach, 1 - j.reach + 0.15, t));
      }
      for (const g of grooves) {
        const d = Math.abs(((u - g.at + 1.5) % 1) - 0.5) / g.width;
        if (d < 1 && t > 1 - g.reach) {
          const v = g.depth * (1 - d * d) * smooth(1 - g.reach, 1 - g.reach + 0.25, t);
          if (v > cut) { cut = v; inGroove = 1 - d; }
        }
      }
      // the block's own face: set back or proud as it spalled, leaning a little, the broad buttresses between
      const butt = smooth(-0.3, 0.8, noise.noise(u * 9 + salt, 0.5) * 0.7 + noise.noise(u * 23 - salt, 1.5) * 0.3);
      let p = 0.45 + 1.1 * butt + block.setback + block.lean * (t - 0.5) - cut;
      // tucked under the caprock's lip at the top and into the talus at the foot
      p = Math.max(0.25, p) * (0.3 + 0.7 * smooth(1, 0.82, t)) * (0.35 + 0.65 * smooth(0, 0.12, t));
      p = Math.max(t > 0.85 ? 0.32 : 0.22, p);
      const r = rw + p;
      const pt: V3 = [spec.x + Math.cos(w.theta) * r, y, spec.z + Math.sin(w.theta) * r];
      // the colour: the block's tone, the varnish curtains from the rim, the grooves' shade, the dust at the foot
      const mott = noise.noise3d(pt[0] * 0.21 + salt, pt[1] * 0.21, pt[2] * 0.21);
      let h = tone[0] + 0.006 * mott, sa = tone[1], l = tone[2] * (1 + block.light + 0.05 * mott);
      const curtain = smooth(0.45, 0.8, noise.noise(u * 47 + salt * 2, 3.1) * 0.5 + 0.5) * smooth(0.15, 0.95, t) * (0.6 + 0.4 * smooth(0, 0.6, inGroove));
      l *= 1 - 0.42 * curtain; sa *= 1 - 0.25 * curtain;
      // a fresh spall scar where the block fell back: a step brighter and more orange, fading down the face
      if (block.setback < -0.15) { l *= 1 + 0.05 * smooth(0.2, 0.9, t); sa *= 1.04; }
      l *= 1 - 0.22 * inGroove * smooth(0.2, 1, t);
      const dust = 1 - smooth(0, 0.18, t);
      l *= 1 + 0.12 * dust; sa *= 1 - 0.3 * dust;
      if (i >= 2) { clearance.rows++; if (pt[1] < rockAt(pt[0], pt[2]) - 0.15) clearance.inside++; }
      col.push(mesh.vert(pt, hsl(h, sa, l), groundAt(pt[0], pt[2])));
    }
    grid.push(col);
  }
  for (let k = 0; k < rays; k++) {
    const a = grid[k], b = grid[(k + 1) % rays];
    if (!a.length || !b.length) continue;
    const mid = (walls[k]!.theta + walls[(k + 1) % rays]!.theta + (k + 1 === rays ? Math.PI * 2 : 0)) / 2;
    const out = dirOf(mid);
    for (let i = 0; i + 1 < rows; i++) {
      mesh.tri(a[i], b[i], b[i + 1], out);
      mesh.tri(a[i], b[i + 1], a[i + 1], out);
    }
  }

  // ---- the caprock: a slab round the rim, its lip proud of the wall, in blocks split at the joints
  let blocks = 0;
  {
    let k = 0;
    while (k < rays) {
      while (k < rays && !walls[k]) k++;
      if (k >= rays) break;
      const len = Math.max(2, Math.round((5 + rng() * 8) / Math.max(0.4, perimeter / rays)));
      let end = k;
      while (end - k < len && end + 1 < rays && walls[end + 1]) end++;
      if (end > k) {
        const thick = 0.8 + rng() * 1.1, over = 0.35 + rng() * 0.45;
        const rowsC: number[][] = [];
        for (let q = k; q <= end; q++) {
          const w = walls[q]!;
          const th = w.theta + (q === k ? 0.0015 : q === end ? -0.0015 : 0);
          const P = (dr: number, y: number): V3 => [spec.x + Math.cos(th) * (w.brow + dr), y, spec.z + Math.sin(th) * (w.brow + dr)];
          const wob = noise.noise(th * 5 + salt, 7.7) * 0.12;
          const ov = over * (0.8 + 0.4 * (noise.noise(th * 9 - salt, 2.2) * 0.5 + 0.5));
          const pts: V3[] = [P(-2.2, w.browY + 0.03), P(-0.5, w.browY + 0.12 + wob), P(ov * 0.8, w.browY + 0.08),
            P(ov, w.browY - thick * 0.4), P(ov * 0.85, w.browY - thick), P(0.15, w.browY - thick - 0.12)];
          rowsC.push(pts.map((p, idx) => {
            const mott = noise.noise3d(p[0] * 0.33 + salt, p[1] * 0.33, p[2] * 0.33);
            const l = capTone[2] * (0.9 + 0.1 * mott) * (idx <= 2 ? 1.06 : idx === 5 ? 0.62 : 0.88);
            return mesh.vert(p, hsl(capTone[0], capTone[1], l), groundAt(p[0], p[2]));
          }));
        }
        for (let q = 0; q + 1 < rowsC.length; q++) {
          const thMid = walls[k + q]!.theta;
          const out = dirOf(thMid);
          for (let idx = 0; idx < 5; idx++) {
            const a = rowsC[q][idx], b = rowsC[q][idx + 1], c = rowsC[q + 1][idx + 1], d = rowsC[q + 1][idx];
            const o: V3 = idx === 0 ? [0, 1, 0] : idx >= 4 ? [out[0], -1, out[2]] : idx === 1 ? [out[0] * 0.4, 1, out[2] * 0.4] : out;
            mesh.tri(a, b, c, o); mesh.tri(a, c, d, o);
          }
        }
        const t0 = dirOf(walls[k]!.theta + Math.PI / 2), t1 = dirOf(walls[end]!.theta + Math.PI / 2);
        mesh.poly(rowsC[0], [-t0[0], 0, -t0[2]]);
        mesh.poly(rowsC[rowsC.length - 1], t1);
        blocks++;
      }
      k = end > k && end + 1 < rays && walls[end + 1] ? end : end + 1;
    }
  }

  // ---- the rubble on the talus: fallen blocks thickest at the cliff's foot, most of them small
  const rubbleCount = mobile ? 40 : 130;
  let rubble = 0;
  for (let n = 0; n < rubbleCount; n++) {
    const k = Math.floor(rng() * rays), w = walls[k];
    if (!w) continue;
    const u = rng();
    const r = w.foot + 0.6 + (w.toe - w.foot) * 0.6 * u * u;
    const theta = w.theta + (rng() - 0.5) * (Math.PI * 2 / rays);
    const cx = spec.x + Math.cos(theta) * r, cz = spec.z + Math.sin(theta) * r;
    const size = 0.3 + 1.9 * Math.pow(rng(), 2.2);
    const gy = groundAt(cx, cz);
    const sx = size * (0.8 + rng() * 0.6), sy = size * (0.45 + rng() * 0.4), sz = size * (0.8 + rng() * 0.6);
    const yaw = rng() * Math.PI * 2, cy = Math.cos(yaw), syw = Math.sin(yaw);
    const corner = (ix: number, iy: number, iz: number): V3 => {
      const lx = ix * sx * (0.75 + rng() * 0.5) * 0.5, ly = iy * sy * 0.5, lz = iz * sz * (0.75 + rng() * 0.5) * 0.5;
      return [cx + lx * cy - lz * syw, gy + sy * 0.25 + ly, cz + lx * syw + lz * cy];
    };
    const lr = tone[2] * (0.8 + rng() * 0.25), cr = hsl(tone[0] + (rng() - 0.5) * 0.01, tone[1] * 0.9, lr);
    const v = [corner(-1, -1, -1), corner(1, -1, -1), corner(1, -1, 1), corner(-1, -1, 1), corner(-1, 1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(-1, 1, 1)]
      .map((p) => mesh.vert(p, cr, gy));
    const faces: Array<[number[], V3]> = [[[4, 5, 6, 7], [0, 1, 0]], [[0, 1, 5, 4], [0, 0, -1]], [[1, 2, 6, 5], [1, 0, 0]], [[2, 3, 7, 6], [0, 0, 1]], [[3, 0, 4, 7], [-1, 0, 0]]];
    for (const [f, o] of faces) {
      const oo: V3 = [o[0] * cy - o[2] * syw, o[1], o[0] * syw + o[2] * cy];
      mesh.poly(f.map((i) => v[i]), oo);
    }
    rubble++;
  }

  if (!mesh.idx.length) return { geometry: null, triangles: 0, blocks: 0, rubble: 0, clearance };
  return { geometry: finishSkin(mesh, 46), triangles: mesh.idx.length / 3, blocks, rubble, clearance };
}
