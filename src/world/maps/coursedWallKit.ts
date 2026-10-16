// src/world/maps/coursedWallKit.ts — the brick-print maps' field walls in their region's build (props lane A, family #6,
// 2026-10-16; WORKLIST.md #6 prop:wallstone@coursed: "walls: Ruhr/Saar brick with piers and Rollschicht coping, Kronach
// ashlar with saddleback coping, Sarajevo rendered rubble, Shanghai grey brick with tiled coping, Aso volcanic stone,
// Glen Canyon CMU").
//
// On the seven maps whose 'stone' print is their brick or block (sourcedTextures.ts sourcedStoneIsBrick), the field
// wall module was three stacked boxes under four tilted slabs. Here it is a wall: a plinth course a brick proud of the
// face, the body, and its region's coping — the Rollschicht of bricks on edge (with the wall's piers, the Ruhr's and the
// Saar's), the dressed saddleback coping in four stones (Kronach), a little tiled roof on a grey-brick wall (Jiangnan), the
// CMU wall's cap blocks (Glen Canyon), a slab coping with its drip elsewhere. Its broken state is a stepped bite through
// those courses: the plinth and the body's foot left standing to either side of the breach, the coping stones and loose
// units fallen across it.
//
// The collision is the legacy module's exactly: the legacy builder still runs first on the pool's stream (its draws), its
// contact band is frozen as the pool's and the legacy module is the one the run's terrain fit reads (fitGeometry: the
// span's ground and shear come from its vertices, as before), its fixed-seed build the placement footprint. Frame
// (inhabitKit WALL_SEG): the run along local z (-1.5..1.5), x across, y up from the module's foot. On the stone bucket
// (the print's 0.7 repeats a metre, by place on each face). Pure geometry; no draws from any stream.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type DestructiblePropType } from './inhabitKit.ts';
import { deriveRuntimeStructureContactBand, type StructureCollisionRuntimeBand } from '../structureCollision.ts';

const WALL_SEG = 3.0, UV = 0.7, Z0 = -WALL_SEG / 2, Z1 = WALL_SEG / 2;
export type CoursedCoping = 'rollschicht' | 'saddleback' | 'tiled' | 'block' | 'slab';
const COPING: Readonly<Record<string, CoursedCoping>> = Object.freeze({
  ruhr: 'rollschicht', saar: 'rollschicht', franconian: 'saddleback', shanghai: 'tiled', glencanyon: 'block',
});
/** A brick-print map's wall coping by its architecture kit (the Ruhr's and the Saar's walls carry piers too). */
export function coursedCopingFor(architectureId: string | null | undefined): CoursedCoping {
  return (architectureId ? COPING[architectureId] : undefined) ?? 'slab';
}

function hash(a: number, b: number, seed: number): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/**
 * A course on the print: its section `w` wide and `h` tall with its top arrises taken off (r2: a dressed course, never a
 * bare box), run `d` along z about (cx, y0, cz); its faces' uvs by place on the face (`soldier` stands its courses
 * upright: the Rollschicht's bricks on edge); its foot face left out.
 */
function course(w: number, h: number, d: number, cx: number, y0: number, cz: number, soldier = false): THREE.BufferGeometry {
  const c = Math.min(0.025, w * 0.12, h * 0.25), hw = w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const sec: Array<[number, number]> = [[-hw, 0], [hw, 0], [hw, h - c], [hw - c, h], [-hw + c, h], [-hw, h - c]];
  const pos: number[] = [], uv: number[] = [];
  const put = (x: number, y: number, z: number, nx: number, ny: number) => {
    pos.push(cx + x, y0 + y, z);
    let u = Math.abs(ny) > 0.5 ? cx + x : z, v = Math.abs(ny) > 0.5 ? z : y0 + y;
    if (soldier && Math.abs(ny) < 0.5) [u, v] = [v, u];
    void nx; uv.push(u * UV, v * UV);
  };
  // the long faces (not the foot), each strip wound out
  for (let k = 1; k < sec.length; k++) {
    const [xa, ya] = sec[k], [xb, yb] = sec[(k + 1) % sec.length];
    const nx = (yb - ya), ny = -(xb - xa);
    const out = nx * ((xa + xb) / 2) + ny * ((ya + yb) / 2 - h / 2) > 0;
    const quad = out ? [[xa, ya, z0], [xb, yb, z0], [xb, yb, z1], [xa, ya, z1]] : [[xa, ya, z0], [xa, ya, z1], [xb, yb, z1], [xb, yb, z0]];
    for (const i of [0, 1, 2, 0, 2, 3]) put(quad[i][0], quad[i][1], quad[i][2], nx, ny);
  }
  // the two ends (fans of the section), wound out along z
  for (const [z, s] of [[z0, -1], [z1, 1]] as const) {
    for (let k = 1; k + 1 < sec.length; k++) {
      const tri = s > 0 ? [0, k, k + 1] : [0, k + 1, k];
      for (const i of tri) put(sec[i][0], sec[i][1], z, 0, 0);
    }
  }
  // (the end fans' winding: a section counter-clockwise in (x, y) faces +z)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** A ridged coping piece along z (z0..z1) over a wall `w` wide at height y: two slopes meeting at a ridge `rise` up, its
 *  two gable ends; every face wound out from a point inside it. */
function ridge(w: number, y: number, rise: number, z0: number, z1: number, eaves = 0.035): THREE.BufferGeometry {
  const h = w / 2, pos: number[] = [], uv: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => { for (const q of [a, b, c, a, c, d]) { pos.push(q[0], q[1], q[2]); uv.push((q[2] + q[0]) * UV, q[1] * UV); } };
  // (r2: the coping's own thickness at its eaves — a section of five corners, its soffit too, never a bare wedge)
  const t = 0.04, sec: Array<[number, number]> = [[-h, y - eaves - t], [h, y - eaves - t], [h, y - eaves], [0, y + rise], [-h, y - eaves]];
  for (let k = 0; k < sec.length; k++) {
    const [xa, ya] = sec[k], [xb, yb] = sec[(k + 1) % sec.length];
    quad([xa, ya, z0], [xb, yb, z0], [xb, yb, z1], [xa, ya, z1]);
  }
  for (const z of [z0, z1]) for (let k = 1; k + 1 < sec.length; k++) {
    for (const i of [0, k, k + 1]) { pos.push(sec[i][0], sec[i][1], z); uv.push(sec[i][0] * UV, sec[i][1] * UV); }
  }
  const inside = [0, y + rise * 0.3, (z0 + z1) / 2];
  for (let t = 0; t < pos.length; t += 9) {
    const ux = pos[t + 3] - pos[t], uy = pos[t + 4] - pos[t + 1], uz = pos[t + 5] - pos[t + 2];
    const vx = pos[t + 6] - pos[t], vy = pos[t + 7] - pos[t + 1], vz = pos[t + 8] - pos[t + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const cx = (pos[t] + pos[t + 3] + pos[t + 6]) / 3 - inside[0], cy = (pos[t + 1] + pos[t + 4] + pos[t + 7]) / 3 - inside[1];
    const cz = (pos[t + 2] + pos[t + 5] + pos[t + 8]) / 3 - inside[2];
    if (nx * cx + ny * cy + nz * cz < 0) {
      for (let k = 0; k < 3; k++) [pos[t + 3 + k], pos[t + 6 + k]] = [pos[t + 6 + k], pos[t + 3 + k]];
      const u = (t / 3) * 2;
      for (let k = 0; k < 2; k++) [uv[u + 2 + k], uv[u + 4 + k]] = [uv[u + 4 + k], uv[u + 2 + k]];
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false)!;
  for (const p of parts) p.dispose();
  return g;
}

/** One coursed wall module of `coping`'s region (intact), or its stepped breach (broken). */
export function buildCoursedWall(coping: CoursedCoping, broken = false): THREE.BufferGeometry {
  const T = 0.46, H = 1.08, plinth = 0.3, parts: THREE.BufferGeometry[] = [];
  const piers = coping === 'rollschicht';
  if (!broken) {
    parts.push(course(T + 0.06, plinth, WALL_SEG, 0, -0.1, 0));
    parts.push(course(T, H - plinth, WALL_SEG, 0, plinth - 0.1, 0));
    const top = H - 0.1;
    if (coping === 'rollschicht') parts.push(course(T + 0.04, 0.12, WALL_SEG, 0, top, 0, true));
    else if (coping === 'saddleback') for (let k = 0; k < 4; k++) parts.push(ridge(T + 0.1, top + 0.04, 0.12, Z0 + k * 0.75 + 0.004, Z0 + (k + 1) * 0.75 - 0.004));
    else if (coping === 'tiled') {
      parts.push(course(T + 0.02, 0.06, WALL_SEG, 0, top, 0));
      parts.push(ridge(T + 0.24, top + 0.08, 0.16, Z0, Z1, 0.05));
    } else if (coping === 'block') parts.push(course(T + 0.03, 0.1, WALL_SEG, 0, top, 0));
    else parts.push(course(T + 0.1, 0.07, WALL_SEG, 0, top, 0));
    // the Ruhr's and the Saar's walls stand between piers (one at each module's start: the next module's is its end)
    if (piers) parts.push(course(T + 0.18, H + 0.16, 0.42, 0, -0.1, Z0 + 0.21));
    return merged(parts);
  }
  // the stepped bite (r2: within 1.5 x the intact's triangles, standing over the module's length): the plinth left standing
  // its whole length, the body's foot by one lip stepped down into the breach, a fallen unit or coping stone across it
  const lip = 0.7 + hash(1, 2, 0x6e1) * 0.25, hUp = 0.24 + hash(3, 1, 0x6e1) * 0.12;
  parts.push(course(T + 0.06, plinth * 0.9, WALL_SEG, 0, -0.1, 0));
  parts.push(course(T, hUp, lip, 0, plinth * 0.9 - 0.1, Z0 + lip / 2));
  if (coping === 'saddleback' || coping === 'tiled') {
    const stone = ridge(T + 0.1, 0, 0.12, -0.36, 0.36);
    stone.rotateZ(0.5); stone.rotateY(0.7); stone.translate(0.45, 0.05, -0.2);
    parts.push(stone);
  } else {
    const a = hash(0, 5, 0x6e2), b = hash(0, 7, 0x6e2);
    const unit = course(0.24 + a * 0.1, 0.1, 0.36, 0, 0, 0);
    unit.rotateY(a * Math.PI);
    unit.translate(0.42 + (b - 0.5) * 0.3, plinth * 0.9 - 0.1, (b - 0.5) * 0.8);
    parts.push(unit);
  }
  return merged(parts);
}

/** The coursed wall's record on a map (props.ts LOCAL_TYPES wallstone on a brick print): the legacy module's numbers. */
export type CoursedWallType = DestructiblePropType & { fitGeometry?: THREE.BufferGeometry };

/**
 * The brick-print field wall in its region's build: `legacy` (inhabitKit COURSED_WALLSTONE) still builds first on the
 * pool's stream (its draws, and its broken build's), its contact band frozen as the pool's, its module the one the run's
 * terrain fit reads, its fixed-seed build the placement footprint.
 */
export function coursedWallType(architectureId: string | null | undefined, legacy: DestructiblePropType,
  footprintRng: () => () => number): CoursedWallType {
  const coping = coursedCopingFor(architectureId);
  let band: StructureCollisionRuntimeBand | undefined, fit: THREE.BufferGeometry | undefined;
  const entry: CoursedWallType = {
    ...legacy,
    build: (rng) => {
      const old = legacy.build(rng);
      band = deriveRuntimeStructureContactBand({ baked: [old] });
      fit?.dispose();
      fit = old;
      return buildCoursedWall(coping, false);
    },
    broken: (rng) => { legacy.broken!(rng).dispose(); return buildCoursedWall(coping, true); },
    footprintBuild: () => legacy.build(footprintRng()),
  };
  Object.defineProperty(entry, 'contactBand', { enumerable: true, get: () => band });
  Object.defineProperty(entry, 'fitGeometry', { enumerable: true, get: () => fit });
  return entry;
}
