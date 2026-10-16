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

/** A box on the print (its faces' uvs by place on the face; `soldier` stands its courses upright), bottom face left out. */
function course(w: number, h: number, d: number, cx: number, y0: number, cz: number, soldier = false): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(cx, y0 + h / 2, cz);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    let u = ay > 0.5 ? p.getX(i) : ax > 0.5 ? p.getZ(i) : p.getX(i), v = ay > 0.5 ? p.getZ(i) : p.getY(i);
    if (soldier && ay < 0.5) [u, v] = [v, u];
    uv.setXY(i, u * UV, v * UV);
  }
  const index = g.index!, keep: number[] = [];
  for (let t = 0; t < index.count; t += 3) if (n.getY(index.getX(t)) > -0.5) keep.push(index.getX(t), index.getX(t + 1), index.getX(t + 2));
  g.setIndex(keep);
  g.clearGroups();
  return g.toNonIndexed();
}

/** A ridged coping piece along z (z0..z1) over a wall `w` wide at height y: two slopes meeting at a ridge `rise` up, its
 *  two gable ends; every face wound out from a point inside it. */
function ridge(w: number, y: number, rise: number, z0: number, z1: number, eaves = 0.035): THREE.BufferGeometry {
  const h = w / 2, pos: number[] = [], uv: number[] = [];
  const e = [[h, y - eaves], [-h, y - eaves]] as const;
  const quad = (a: number[], b: number[], c: number[], d: number[]) => { for (const q of [a, b, c, a, c, d]) { pos.push(q[0], q[1], q[2]); uv.push((q[2] + q[0]) * UV, q[1] * UV); } };
  const tri = (a: number[], b: number[], c: number[]) => { for (const q of [a, b, c]) { pos.push(q[0], q[1], q[2]); uv.push(q[0] * UV, q[1] * UV); } };
  for (const [x, yy] of e) quad([x, yy, z0], [x, yy, z1], [0, y + rise, z1], [0, y + rise, z0]);
  tri([e[0][0], e[0][1], z0], [e[1][0], e[1][1], z0], [0, y + rise, z0]);
  tri([e[0][0], e[0][1], z1], [e[1][0], e[1][1], z1], [0, y + rise, z1]);
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
  // the stepped bite: the plinth and the body's foot standing either side, stepped down into the breach
  const lip = 0.55 + hash(1, 2, 0x6e1) * 0.2;
  for (const [z0, z1, s] of [[Z0, Z0 + lip, -1], [Z1 - lip * 0.8, Z1, 1]] as const) {
    const len = z1 - z0, zc = (z0 + z1) / 2;
    parts.push(course(T + 0.06, plinth, len, 0, -0.1, zc));
    const up = len * 0.55, hUp = 0.2 + hash(3, s, 0x6e1) * 0.12;
    parts.push(course(T, hUp, up, 0, plinth - 0.1, s < 0 ? z0 + up / 2 : z1 - up / 2));
  }
  // the plinth's broken run across the gap, half its height
  parts.push(course(T + 0.04, plinth * 0.5, WALL_SEG - lip * 1.8 - 0.3, 0, -0.1, (lip * 0.1)));
  // the fallen coping and loose units across the breach, lying low
  for (let k = 0; k < 7; k++) {
    const a = hash(k, 5, 0x6e2), b = hash(k, 7, 0x6e2), c = hash(k, 9, 0x6e2);
    const w = 0.12 + a * 0.16, h = 0.07 + b * 0.05, d = 0.22 + c * 0.14;
    const unit = course(w, h, d, 0, 0, 0);
    unit.rotateY(a * Math.PI);
    unit.translate((b - 0.5) * 1.4, plinth * 0.5 - 0.1 + (k % 3 === 0 ? 0 : -0.05), (c - 0.5) * (WALL_SEG - 1.2));
    parts.push(unit);
  }
  if (coping === 'saddleback' || coping === 'tiled') {
    const stone = ridge(T + 0.1, 0, 0.12, -0.36, 0.36);
    stone.rotateZ(0.5); stone.rotateY(0.7); stone.translate(0.45, 0.05, -0.2);
    parts.push(stone);
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
