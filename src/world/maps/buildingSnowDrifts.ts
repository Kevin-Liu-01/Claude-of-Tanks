// src/world/maps/buildingSnowDrifts.ts — (the map-revival lane, round 2, 2026-10-09; gauntlet waves 319/320 on
// Frosthollow and Whiteout: the houses sit "on a perfectly flat featureless snow plane with no drift, trodden path or snow
// build-up at its walls", "float on a featureless flat snow plane with no plough banks or drifts") the snow a winter's
// wind banks against a building on a snow map: the big lee drift in the shelter of the downwind walls, a low ramp on the
// windward ones, both scaled by how square the wind meets the wall (fieldWallDressing.ts buildWallDrift, the field walls'
// law at a house's size), the doorway's front kept clear where the path to the door is dug, and no drift reaching into a
// carriageway. The drifts join the walls' own drift mesh (props.ts 'props-snow-drifts': the plaster's snow, receiving the
// cascades and casting none), so they cost triangles, not draws.
import type * as THREE from 'three';
import { SNOW_WIND_YAW, buildWallDrift, placeSeed, type DressingGround } from './fieldWallDressing.ts';

/** A placed building's footprint (props.ts buildingFeatures): its centre, plan size and yaw (three's rotateY). */
export interface DriftBuilding { x: number; z: number; w: number; d: number; rot: number; kind?: string }

export interface BuildingDriftOptions {
  /** Kinds whose footprint is not one closed shell (a container row, a gantry, a market): no drift rings them. */
  open: ReadonlySet<string>;
  /** Distance to the nearest road line (m); a face whose drift would reach within the carriageway gets none. */
  roadDist?: (x: number, z: number) => number;
  mobile?: boolean;
  /** The drifts' size against the field walls' (a house catches more snow than a wall a metre high). */
  scale?: number;
}

/** A building's face is left without a drift where the carriageway core (3.5 m) and a drift's reach meet. */
const ROAD_CLEAR_M = 4.5;
/** The dug path to a door: the middle of the front face (local +z) stays clear over this width (m). */
const DOOR_PATH_M = 2.4;
/** Faces shorter than this carry none (a chimney stack's or a porch's sliver). */
const MIN_FACE_M = 2.0;

/**
 * The drifts round every closed building on a snow map, in world space. Deterministic by place (each face's own seed).
 */
export function buildBuildingDrifts(
  ground: DressingGround, buildings: readonly DriftBuilding[], opts: BuildingDriftOptions,
): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const dx = Math.cos(SNOW_WIND_YAW), dz = -Math.sin(SNOW_WIND_YAW); // downwind
  const scale = opts.scale ?? 1.6;
  for (const b of buildings) {
    if ((b.kind !== undefined && opts.open.has(b.kind)) || !(b.w > MIN_FACE_M) || !(b.d > MIN_FACE_M)) continue;
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    // the footprint's corners (local (±w/2, ±d/2) under three's rotateY), a hand's breadth inside the plot so the drift's
    // shoulder tucks under the wall's foot
    const hw = b.w / 2 - 0.05, hd = b.d / 2 - 0.05;
    const world = (lx: number, lz: number): [number, number] => [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
    // the four faces as local segments with their outward normals; the front (+z) split round the door's path
    const faces: Array<[number, number, number, number, number, number]> = [
      [-hw, -hd, hw, -hd, 0, -1],
      [hw, -hd, hw, hd, 1, 0],
      [-hw, hd, -hw, -hd, -1, 0],
    ];
    if (hw * 2 > DOOR_PATH_M + 2 * MIN_FACE_M) {
      faces.push([hw, hd, DOOR_PATH_M / 2, hd, 0, 1], [-DOOR_PATH_M / 2, hd, -hw, hd, 0, 1]);
    }
    for (const [lax, laz, lbx, lbz, lnx, lnz] of faces) {
      const len = Math.hypot(lbx - lax, lbz - laz);
      if (len < MIN_FACE_M) continue;
      const [ax, az] = world(lax, laz), [bx, bz] = world(lbx, lbz);
      const nx = lnx * c + lnz * s, nz = -lnx * s + lnz * c; // outward, world
      const facing = nx * dx + nz * dz; // > 0: the face looks downwind (the lee)
      const lee = facing > 0, across = Math.abs(facing);
      // no drift into a carriageway: the face's middle pushed out by the drift's reach
      if (opts.roadDist) {
        const reach = (lee ? 2.2 * (0.5 + 0.5 * across) : 0.7) * Math.sqrt(scale) + 0.6;
        const mx = (ax + bx) / 2 + nx * reach, mz = (az + bz) / 2 + nz * reach;
        if (opts.roadDist(mx, mz) < ROAD_CLEAR_M) continue;
      }
      // buildWallDrift's `side` +1 builds on the run's right-hand normal (tz, -tx) of a->b
      const tx = (bx - ax) / len, tz = (bz - az) / len;
      const side: 1 | -1 = tz * nx - tx * nz > 0 ? 1 : -1;
      const g = buildWallDrift(ground, ax, az, bx, bz, 0, side, placeSeed((ax + bx) / 2, (az + bz) / 2, lee ? 0x5d71 : 0x3a9b),
        { mobile: opts.mobile, across, lee, scale, step: 0.45 });
      if (g) out.push(g);
    }
  }
  return out;
}

/** A snow map's station or village area, where its roads are ploughed (the terrain's village rect). */
export interface PloughArea { x0: number; x1: number; z0: number; z1: number }

/**
 * The windrows a plough throws up along both sides of a ploughed road (Whiteout's service corridors: "no plough banks"):
 * a bank 1.2 m off the carriageway's edge, about half a metre high and two and a half wide, in runs of 10-24 m broken
 * where a drive or a crossing road comes in (no bank nearer another road than its own), only inside the ploughed area.
 * Each run is laid as chords of at most 10 m along the road's line (a bend stays a bend), each chord two drift ramps
 * back to back (buildWallDrift's windward profile at a bank's size).
 */
export function buildPloughBanks(
  ground: DressingGround, roads: readonly (readonly (readonly [number, number])[])[], area: PloughArea,
  roadDist: (x: number, z: number) => number, opts: { mobile?: boolean; roadHalfM?: number } = {},
): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const offset = (opts.roadHalfM ?? 3.85) + 1.2;
  const inside = (x: number, z: number) => x > area.x0 && x < area.x1 && z > area.z0 && z < area.z1;
  for (const path of roads) {
    if (path.length < 2) continue;
    // arc length along the line, and a point with its unit tangent at any distance
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
      const bank = (d: number): [number, number] => { const [x, z, tx, tz] = at(d); return [x + tz * side * offset, z - tx * side * offset]; };
      const ok = (d: number): boolean => { const [x, z] = bank(d); return inside(x, z) && roadDist(x, z) > offset - 0.6; };
      const [sx, sz] = path[0];
      let s = 2 + (placeSeed(sx, sz, side > 0 ? 0x91 : 0x93) >>> 0) % 5;
      while (s < total - 4) {
        const [qx, qz] = bank(s);
        const runSeed = placeSeed(qx, qz, side > 0 ? 0x4b1 : 0x4b3) >>> 0;
        const run = Math.min(10 + runSeed % 15, total - 2 - s), gap = 2 + (runSeed >>> 8) % 5;
        // the run trimmed to its first stretch that is inside the area and nearer its own road than any other
        let a = -1, b = -1;
        for (let t = 0; t <= run; t += 1) {
          if (ok(s + t)) { if (a < 0) a = t; b = t; } else if (a >= 0) break;
        }
        if (a >= 0 && b - a >= 4) {
          const chords = Math.max(1, Math.ceil((b - a) / 10));
          for (let c = 0; c < chords; c++) {
            const d0 = s + a + (b - a) * (c / chords), d1 = s + a + (b - a) * ((c + 1) / chords);
            const [ax, az] = bank(d0), [bx, bz] = bank(d1);
            for (const face of [1, -1] as const) {
              const g = buildWallDrift(ground, ax, az, bx, bz, 0, face, placeSeed(ax, az, face > 0 ? 0x7c1 : 0x7c3),
                { mobile: opts.mobile, across: 1, lee: false, scale: 3.4, step: 0.8 });
              if (g) out.push(g);
            }
          }
        }
        s += run + gap;
      }
    }
  }
  return out;
}
