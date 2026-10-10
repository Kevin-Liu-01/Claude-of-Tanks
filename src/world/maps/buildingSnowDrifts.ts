// src/world/maps/buildingSnowDrifts.ts — (the map-revival lane, round 2b, 2026-10-10; gauntlet wave 335 on Whiteout: the
// round-2 banks read as "free-standing white lumps or flat hard-edged decal ovals, brighter than the ground and unblended
// at the base — pasted overlay, not wind-fed drifts and ploughed berms") the snow a winter's wind banks against a station's
// buildings and the windrows its ploughs throw up, drawn as the ground itself: every drift and berm is a fillet of the
// snow surface (the boulders' beds' and the wall turf's pipeline: props.ts merges them by 512 m cell into the beds the
// world draws with the terrain's own material, map.ts bindRockBeds), so its albedo, grain, tone, sky occlusion and light
// are the snow's round it; it carries the ground's fold byte, its toe sinks under the drawn ground and its normals there
// are the ground's, so no edge shows. The forms are the wind's:
//   - the lee drift: in the shelter of a downwind face, a crest a metre or so off the wall (the eddy scoops the snow at
//     the wall's foot) falling away in a long concave tail downwind, its ends wrapping past the building's corners;
//   - the windward face scoured bare (no bank: the wind's horseshoe vortex keeps it clear), as are the faces the wind runs
//     along;
//   - the plough's windrow: a cut face toward the carriageway, a rounded crown, a long back slope with the blade's spray
//     thinning out beyond it, in broken runs along both edges of the ploughed roads.
// A drift only rings a closed building: the open structures (container rows, gantries, markets) and every landmark but
// the closed shells a map allows (Whiteout: the module train, the radome tower, the Jamesway huts) get none; none reaches
// into a carriageway. Deterministic by place (each face's own seed); desktop only (the phones draw no beds).
import * as THREE from 'three';
import { SNOW_WIND_YAW, placeSeed, dressingRng } from './fieldWallDressing.ts';

/** What a drift reads of the ground: its height, its normal and (on a map that publishes it) its fold, -1 crest .. 1 hollow. */
export interface DriftGround {
  getHeightAt(x: number, z: number): number;
  getNormalAt?(x: number, z: number): { x: number; y: number; z: number };
  _foldAt?(x: number, z: number): number;
}

/** A placed building's footprint (props.ts buildingFeatures): its centre, plan size and yaw (three's rotateY). */
export interface DriftBuilding { x: number; z: number; w: number; d: number; rot: number; kind?: string; landmark?: string }

export interface BuildingDriftOptions {
  /** Structure kinds whose footprint is not one closed shell (a container row, a gantry, a market): no drift rings them. */
  open: ReadonlySet<string>;
  /** Landmark kinds that are closed shells on the ground (Whiteout: moduleTrain, radomeTower, jamesway); every other
   * landmark (masts, open frames, a bunded tank farm, dressing) gets none. */
  landmarkAllow?: ReadonlySet<string>;
  /** Distance to the nearest road line (m): a drift whose reach would enter the carriageway is left out. */
  roadDist?: (x: number, z: number) => number;
  /** The drifts' size against a 3 m wall's (default 1). */
  scale?: number;
}

/** Faces shorter than this carry none (a porch's or a chimney stack's sliver). */
const MIN_FACE_M = 2.4;
/** A face the wind meets more squarely than this (|cos|, 0 along it .. 1 square) and downwind of the building banks. */
const MIN_LEE = 0.3;
/** The carriageway core and a margin: no drift or berm crest nearer a road's line. */
const ROAD_CLEAR_M = 4.6;
/** How far the toe sinks under the drawn ground (m): the ground covers the fillet's edge. */
const TOE_SINK_M = 0.035;

const _n = new THREE.Vector3();

/** The ground's normal at (x, z): its own query when it has one, central differences 0.6 m apart otherwise. */
function groundNormal(g: DriftGround, x: number, z: number): THREE.Vector3 {
  if (g.getNormalAt) { const n = g.getNormalAt(x, z); return _n.set(n.x, n.y, n.z).normalize(); }
  const e = 0.6, hx = g.getHeightAt(x + e, z) - g.getHeightAt(x - e, z), hz = g.getHeightAt(x, z + e) - g.getHeightAt(x, z - e);
  return _n.set(-hx / (2 * e), 1, -hz / (2 * e)).normalize();
}
function foldByteAt(g: DriftGround, x: number, z: number): number {
  if (!g._foldAt) return 0;
  const f = g._foldAt(x, z);
  return Math.max(-127, Math.min(127, Math.round((f > 1 ? 1 : f < -1 ? -1 : f) * 127)));
}
/** A slow, seeded wobble along a run (two incommensurate sines from the place's own stream), mean 0, about ±1. */
function wobble(r: () => number): (s: number) => number {
  const a = r() * 6.283, b = r() * 6.283, f1 = 0.35 + r() * 0.25, f2 = 0.9 + r() * 0.5;
  return (s: number) => 0.65 * Math.sin(s * f1 + a) + 0.35 * Math.sin(s * f2 + b);
}

/**
 * One fillet over the ground: rows along a run (its foot from `a` to `b`), columns out along `out` through the profile
 * `prof(s, t)` -> [distance out (m), height over the ground (m)] for t 0 (the inner edge, hidden) .. 1 (the toe). The toe
 * column sinks under the ground and takes the ground's normal; the rows next to it blend toward it, so nothing of the
 * fillet's edge reads. Position, fold and normal, indexed: the beds' attribute set.
 */
function fillet(ground: DriftGround, ax: number, az: number, bx: number, bz: number, ox: number, oz: number,
  rows: number, cols: number, prof: (s: number, t: number) => readonly [number, number],
  sinkEnds: readonly [boolean, boolean] = [true, true]): THREE.BufferGeometry | null {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.5 || rows < 1 || cols < 2) return null;
  const pos: number[] = [], fold: number[] = [], idx: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const s = i / rows;
    for (let k = 0; k <= cols; k++) {
      const t = k / cols, [d, h] = prof(s * len, t);
      const x = ax + (bx - ax) * s + ox * d, z = az + (bz - az) * s + oz * d;
      const toe = k === cols || (i === 0 && sinkEnds[0]) || (i === rows && sinkEnds[1]);
      pos.push(x, ground.getHeightAt(x, z) + (toe ? -TOE_SINK_M : Math.max(0, h) - TOE_SINK_M * t * t), z);
      fold.push(foldByteAt(ground, x, z));
    }
  }
  for (let i = 0; i < rows; i++) for (let k = 0; k < cols; k++) {
    const p = i * (cols + 1) + k, q = p + cols + 1;
    idx.push(p, q, p + 1, p + 1, q, q + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('fold', new THREE.BufferAttribute(Int8Array.from(fold), 1, true));
  g.setIndex(idx);
  g.computeVertexNormals();
  // face up whichever way the run turns, then the edges' normals the ground's (the toe, the ends) and the next ring halfway
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  let up = 0;
  for (let v = 0; v < nrm.count; v++) up += nrm.getY(v);
  if (up < 0) {
    for (let k = 0; k < idx.length; k += 3) { const t2 = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t2; }
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  const posA = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i <= rows; i++) for (let k = 0; k <= cols; k++) {
    const endA = sinkEnds[0] && i <= 1, endB = sinkEnds[1] && i >= rows - 1;
    const edge = k === cols || (endA && i === 0) || (endB && i === rows) ? 1 : (k === cols - 1 || endA || endB ? 0.5 : 0);
    if (edge === 0) continue;
    const v = i * (cols + 1) + k, gn = groundNormal(ground, posA.getX(v), posA.getZ(v));
    const nx = nrm.getX(v) * (1 - edge) + gn.x * edge, ny = nrm.getY(v) * (1 - edge) + gn.y * edge, nz = nrm.getZ(v) * (1 - edge) + gn.z * edge;
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm.setXYZ(v, nx / l, ny / l, nz / l);
  }
  return g;
}

/**
 * The lee drifts against every closed building's downwind faces, as fillets of the ground (see the file's note).
 * Rows every 0.6 m along a face (1.2 m on a long one), nine columns out.
 */
export function buildBuildingDrifts(
  ground: DriftGround, buildings: readonly DriftBuilding[], opts: BuildingDriftOptions,
): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const dx = Math.cos(SNOW_WIND_YAW), dz = -Math.sin(SNOW_WIND_YAW); // downwind
  const scale = Math.sqrt(opts.scale ?? 1);
  for (const b of buildings) {
    if (b.landmark !== undefined ? !opts.landmarkAllow?.has(b.landmark) : (b.kind !== undefined && opts.open.has(b.kind))) continue;
    if (!(b.w > MIN_FACE_M) || !(b.d > MIN_FACE_M)) continue;
    const c = Math.cos(b.rot), s = Math.sin(b.rot), hw = b.w / 2, hd = b.d / 2;
    const world = (lx: number, lz: number): [number, number] => [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
    const faces: Array<[number, number, number, number, number, number]> = [
      [-hw, -hd, hw, -hd, 0, -1], [hw, -hd, hw, hd, 1, 0], [hw, hd, -hw, hd, 0, 1], [-hw, hd, -hw, -hd, -1, 0],
    ];
    for (const [lax, laz, lbx, lbz, lnx, lnz] of faces) {
      const nx = lnx * c + lnz * s, nz = -lnx * s + lnz * c; // outward, world
      const facing = nx * dx + nz * dz;                       // > 0: the face looks downwind (the lee)
      if (facing < MIN_LEE) continue;                         // the windward and the along-wind faces scoured bare
      const faceLen = Math.hypot(lbx - lax, lbz - laz);
      if (faceLen < MIN_FACE_M) continue;
      const r = dressingRng(placeSeed(b.x + nx * hd, b.z + nz * hd, 0x1d5e));
      const reach = (2.6 + 3.8 * facing) * scale * (0.85 + 0.3 * r());
      const h0 = (0.42 + 0.38 * facing) * scale * (0.85 + 0.3 * r());
      const ext = 0.45 * reach;                               // the tails wrap past the corners
      const [ax0, az0] = world(lax, laz), [bx0, bz0] = world(lbx, lbz);
      const tx = (bx0 - ax0) / faceLen, tz = (bz0 - az0) / faceLen;
      // the foot from just inside the wall, extended past both corners
      const ax = ax0 - tx * ext - nx * 0.08, az = az0 - tz * ext - nz * 0.08;
      const bx = bx0 + tx * ext - nx * 0.08, bz = bz0 + tz * ext - nz * 0.08;
      const total = faceLen + 2 * ext;
      // no drift reaching into a carriageway: the crest and the tail's mid sampled along the face
      if (opts.roadDist) {
        let blocked = false;
        for (let k = 0; k <= 6 && !blocked; k++) {
          const u = k / 6, px = ax + (bx - ax) * u, pz = az + (bz - az) * u;
          blocked = opts.roadDist(px + nx * reach * 0.5, pz + nz * reach * 0.5) < ROAD_CLEAR_M;
        }
        if (blocked) continue;
      }
      const wob = wobble(r), wob2 = wobble(r);
      const prof = (sm: number, t: number): readonly [number, number] => {
        // along the run: full behind the wall, tapering out over the tails past each corner (the far tail longer)
        const e0 = Math.min(1, sm / ext), e1 = Math.min(1, (total - sm) / ext);
        const along = Math.min(e0 * e0 * (3 - 2 * e0), e1 * e1 * (3 - 2 * e1));
        const rch = reach * (0.55 + 0.45 * along) * (1 + 0.12 * wob(sm * 0.5));
        const hh = h0 * along * (1 + 0.16 * wob2(sm * 0.7));
        // across: from the wall's foot (the eddy's scoop) up to the crest at a fifth of the reach, then the long tail
        const d = rch * t;
        const crest = 0.2;
        const prof01 = t < crest ? 0.62 + 0.38 * Math.sin((t / crest) * Math.PI / 2) : Math.pow((1 - t) / (1 - crest), 2.1);
        return [d, hh * prof01];
      };
      const rows = Math.max(4, Math.ceil(total / (total > 24 ? 1.2 : 0.6)));
      const g = fillet(ground, ax, az, bx, bz, nx, nz, rows, 9, prof);
      if (g) out.push(g);
    }
  }
  return out;
}

/** A snow map's station or village area, where its roads are ploughed. */
export interface PloughArea { x0: number; x1: number; z0: number; z1: number }

/**
 * The windrows a plough throws up along both edges of a ploughed road inside the area, as fillets of the ground: a cut
 * face toward the carriageway, a rounded crown 0.5-0.8 m high, a long back slope, the blade's spray thinning out beyond
 * it; in runs of 10-24 m broken where a drive or a crossing road comes in (no berm nearer another road than its own).
 */
export function buildPloughBanks(
  ground: DriftGround, roads: readonly (readonly (readonly [number, number])[])[], area: PloughArea,
  roadDist: (x: number, z: number) => number, opts: { roadHalfM?: number } = {},
): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const edge = (opts.roadHalfM ?? 3.85) + 0.15;   // the cut face stands at the ploughed edge
  const inside = (x: number, z: number) => x > area.x0 && x < area.x1 && z > area.z0 && z < area.z1;
  for (const path of roads) {
    if (path.length < 2) continue;
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    const total = cum[cum.length - 1];
    if (total < 8) continue;
    const at = (d: number): [number, number, number, number] => {
      let i = 1;
      while (i < cum.length - 1 && cum[i] < d) i++;
      const seg = cum[i] - cum[i - 1] || 1, t = Math.min(1, Math.max(0, (d - cum[i - 1]) / seg));
      const [ax, az] = path[i - 1], [bx, bz] = path[i];
      return [ax + (bx - ax) * t, az + (bz - az) * t, (bx - ax) / seg, (bz - az) / seg];
    };
    for (const side of [1, -1] as const) {
      const foot = (d: number): [number, number, number, number] => {
        const [x, z, tx, tz] = at(d);
        return [x + tz * side * edge, z - tx * side * edge, tz * side, -tx * side];
      };
      const ok = (d: number): boolean => {
        const [x, z, nx, nz] = foot(d), cx = x + nx * 0.9, cz = z + nz * 0.9;
        return inside(cx, cz) && roadDist(cx, cz) > edge + 0.4;
      };
      const [sx, sz] = path[0];
      let s = 2 + (placeSeed(sx, sz, side > 0 ? 0x91 : 0x93) >>> 0) % 5;
      while (s < total - 4) {
        const [qx, qz] = foot(s);
        const runSeed = placeSeed(qx, qz, side > 0 ? 0x4b1 : 0x4b3) >>> 0;
        const run = Math.min(10 + runSeed % 15, total - 2 - s), gap = 2 + (runSeed >>> 8) % 5;
        let a = -1, b = -1;
        for (let t = 0; t <= run; t += 1) {
          if (ok(s + t)) { if (a < 0) a = t; b = t; } else if (a >= 0) break;
        }
        if (a >= 0 && b - a >= 4) {
          const r = dressingRng(runSeed ^ 0x5eed);
          const H = 0.5 + r() * 0.3, W = 2.2 + r() * 0.8, wob = wobble(r);
          // laid as chords of at most 8 m along the road's line, so a bend stays a bend
          const chords = Math.max(1, Math.ceil((b - a) / 8));
          for (let ch = 0; ch < chords; ch++) {
            const d0 = s + a + (b - a) * (ch / chords), d1 = s + a + (b - a) * ((ch + 1) / chords);
            const [ax, az, nx, nz] = foot(d0), [bx, bz] = foot(d1);
            const span = Math.hypot(bx - ax, bz - az), runLen = b - a, base = d0 - (s + a);
            const prof = (sm: number, t: number): readonly [number, number] => {
              // the run's ends ramp down over 1.5 m; the crown wanders along it
              const u = base + sm, e = Math.min(1, u / 1.5, (runLen - u) / 1.5);
              const hh = H * Math.max(0, e) * (1 + 0.15 * wob(u * 0.6));
              // across: the cut face (0-0.12 of the width), the crown (to 0.42), the back slope, the spray (0.8-1)
              const p = t < 0.12 ? Math.sin((t / 0.12) * Math.PI / 2) * 0.92
                : t < 0.42 ? 0.92 + 0.08 * Math.sin(((t - 0.12) / 0.3) * Math.PI)
                  : t < 0.8 ? 0.92 * Math.pow((0.8 - t) / 0.38, 1.6) + 0.04 * (t - 0.42) / 0.38
                    : 0.04 * (1 - (t - 0.8) / 0.2);
              return [W * t * (t < 0.8 ? 1 : 1 + (t - 0.8) * 1.5) - 0.05, hh * p];
            };
            const g = fillet(ground, ax, az, bx, bz, nx, nz, Math.max(2, Math.ceil(span / 0.8)), 10, prof, [ch === 0, ch === chords - 1]);
            if (g) out.push(g);
          }
        }
        s += run + gap;
      }
    }
  }
  return out;
}
