// src/world/maps/adobeWallKit.ts — the mud field walls in their region's build (props lane A, family #6, 2026-10-16;
// WORKLIST.md #6 prop:walladobe: "adobe walls with regional crowns (ksar pinnacles, Siwa kershef, Wadi Rum brush tops,
// Bengal/Mekong tile or thatch caps)").
//
// The mud wall module (inhabitKit adobeModule: the scenery lane's thirteen-point worn section, battered faces, the foot
// cut back, the crown rubbed round) was swept through twenty rings along a straight three metres: 480 of its 502
// triangles drew the same section again. Here the same section is swept through the rings it needs (the module's ends
// and the tuck where it steps inside the next one), fitted to the same envelope, and its region's crown stands on it:
//   ksar (the Dahar)      pinnacles, the ksour's little rounded merlons along the crown;
//   siwa                  the kershef's lumpy crown of salt-mud and rubble, uneven along the wall;
//   wadirum               brushwood laid along the top (the Bedouin enclosures' thorn tops);
//   bengal, mekong        a little ridged cap along the crown (the tile or thatch over a mud wall in the wet);
//   (navajo, elsewhere)   the worn crown alone.
// Broken, the module is a stepped bite through its own section: two low lengths of the wall by the lips, the bite's
// floor between, its lumps spilled.
//
// The collision, the terrain fit and the footprint are the legacy module's exactly: its builders still run first (their
// draws), its contact band frozen as the pool's, its module the one the run's fitWallSpan reads (fitGeometry), its
// fixed-seed build the placement footprint. The mud print's shape uniform (props.ts mudShapeFor) reads the wall's own box
// (the crown's features above it set aside: geometry.boundingBox). On the field-mud print, one tile a module (u along the
// wall, v round the section, inhabitKit ADOBE_UV_PER_M). Pure geometry; no draws from any stream.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ADOBE_UV_PER_M, type DestructiblePropType } from './inhabitKit.ts';
import { deriveRuntimeStructureContactBand, type StructureCollisionRuntimeBand } from '../structureCollision.ts';

export type AdobeCrown = 'pinnacles' | 'kershef' | 'brush' | 'ridge' | 'worn';
const CROWNS: Readonly<Record<string, AdobeCrown>> = Object.freeze({
  ksar: 'pinnacles', siwa: 'kershef', wadirum: 'brush', bengal: 'ridge', mekong: 'ridge',
});
/** A mud-wall map's crown by its architecture kit. */
export function adobeCrownFor(architectureId: string | null | undefined): AdobeCrown {
  return (architectureId ? CROWNS[architectureId] : undefined) ?? 'worn';
}

// the legacy section (inhabitKit adobeModule), one foot over the crown to the other: [across (x / half), height (y / H)]
const SECTION: ReadonlyArray<readonly [number, number]> = [[-1.05, 0], [-0.99, 0.06], [-1.03, 0.22], [-0.95, 0.64], [-0.82, 0.86],
  [-0.48, 0.975], [0, 1.0], [0.48, 0.975], [0.82, 0.86], [0.95, 0.64], [1.03, 0.22], [0.99, 0.06], [1.05, 0]];

function hash(a: number, b: number, seed: number): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** The envelope a module fills (the legacy module's box). */
interface Envelope { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }

/**
 * The section swept along the module at `us` (shares of its length), fitted to the envelope as fitToEnvelope fitted the
 * legacy: across to ±1.05 half, up 0..H, along the module's length ×0.995; `crownAt(i, k)` lifts a section point's height
 * (the kershef's lumps). Its two end faces fanned with the side's own rim normals (inhabitKit's joint law).
 */
function sweep(env: Envelope, us: readonly number[], crownAt: (i: number, k: number) => number = () => 0, ends = true): THREE.BufferGeometry {
  const half = (env.x1 - env.x0) / 2 / 1.05, H = env.y1 - env.y0, L = (env.z1 - env.z0) / 0.995;
  const xc = (env.x0 + env.x1) / 2, zc = (env.z0 + env.z1) / 2;
  const rowLength = SECTION.length, arc = [0];
  for (let k = 1; k < rowLength; k++) arc.push(arc[k - 1] + Math.hypot((SECTION[k][0] - SECTION[k - 1][0]) * half, (SECTION[k][1] - SECTION[k - 1][1]) * H));
  const positions: number[] = [], uvs: number[] = [], index: number[] = [];
  us.forEach((u, i) => {
    const z = zc + (u - 0.5) * L * 0.995, tuck = 1 - Math.max(0, u - 0.9) * 0.3;
    for (let k = 0; k < rowLength; k++) {
      const [sx, sy] = SECTION[k];
      positions.push(xc + sx * half * tuck, env.y0 + sy * H + crownAt(i, k), z);
      uvs.push(u, arc[k] * ADOBE_UV_PER_M);
    }
  });
  for (let i = 0; i + 1 < us.length; i++) for (let k = 0; k + 1 < rowLength; k++) {
    const a = i * rowLength + k, b = a + 1, c = a + rowLength, d = c + 1;
    index.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  const flat = g.toNonIndexed();
  if (!ends) { g.dispose(); return flat; }
  const capP: number[] = [], capU: number[] = [], capN: number[] = [], side = g.attributes.normal;
  for (const [i, last] of [[0, false], [us.length - 1, true]] as const) {
    const base = i * rowLength;
    for (let k = 1; k + 1 < rowLength; k++) {
      for (const q of last ? [0, k, k + 1] : [0, k + 1, k]) {
        const p = [positions[(base + q) * 3], positions[(base + q) * 3 + 1], positions[(base + q) * 3 + 2]];
        capP.push(p[0], p[1], p[2]); capU.push(p[0] * ADOBE_UV_PER_M, p[1] * ADOBE_UV_PER_M);
        capN.push(side.getX(base + q), side.getY(base + q), side.getZ(base + q));
      }
    }
  }
  g.dispose();
  const caps = new THREE.BufferGeometry();
  caps.setAttribute('position', new THREE.Float32BufferAttribute(capP, 3));
  caps.setAttribute('normal', new THREE.Float32BufferAttribute(capN, 3));
  caps.setAttribute('uv', new THREE.Float32BufferAttribute(capU, 2));
  const out = mergeGeometries([flat, caps], false)!;
  flat.dispose(); caps.dispose();
  return out;
}

/** A small solid from its rings (each a list of [x, y, z]), its top closed to a point or a cap; uvs by place. */
function lathe(rings: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>>, apex: readonly [number, number, number] | null): THREE.BufferGeometry {
  const pos: number[] = [];
  const put = (q: readonly number[]) => pos.push(q[0], q[1], q[2]);
  for (let j = 0; j + 1 < rings.length; j++) {
    const a = rings[j], b = rings[j + 1], n = a.length;
    for (let k = 0; k < n; k++) { const k1 = (k + 1) % n; put(a[k]); put(b[k1]); put(b[k]); put(a[k]); put(a[k1]); put(b[k1]); }
  }
  if (apex) { const top = rings[rings.length - 1], n = top.length; for (let k = 0; k < n; k++) { put(top[k]); put(apex); put(top[(k + 1) % n]); } }
  return finish(pos);
}

/** Positions to a geometry: every face wound out from its own solid's centroid, normals and place uvs. */
function finish(pos: number[]): THREE.BufferGeometry {
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < pos.length; i += 3) { cx += pos[i]; cy += pos[i + 1]; cz += pos[i + 2]; }
  const n = pos.length / 3; cx /= n; cy /= n; cz /= n;
  for (let t = 0; t < pos.length; t += 9) {
    const ux = pos[t + 3] - pos[t], uy = pos[t + 4] - pos[t + 1], uz = pos[t + 5] - pos[t + 2];
    const vx = pos[t + 6] - pos[t], vy = pos[t + 7] - pos[t + 1], vz = pos[t + 8] - pos[t + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (pos[t] + pos[t + 3] + pos[t + 6]) / 3 - cx, my = (pos[t + 1] + pos[t + 4] + pos[t + 7]) / 3 - cy, mz = (pos[t + 2] + pos[t + 5] + pos[t + 8]) / 3 - cz;
    if (nx * mx + ny * my + nz * mz < 0) for (let k = 0; k < 3; k++) [pos[t + 3 + k], pos[t + 6 + k]] = [pos[t + 6 + k], pos[t + 3 + k]];
  }
  const uv: number[] = [];
  for (let i = 0; i < pos.length; i += 3) uv.push((pos[i + 2] + pos[i]) * ADOBE_UV_PER_M, pos[i + 1] * ADOBE_UV_PER_M);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

const square = (x: number, y: number, z: number, r: number): Array<[number, number, number]> =>
  [[x + r, y, z + r], [x - r, y, z + r], [x - r, y, z - r], [x + r, y, z - r]];

/** The crown's features on the module (in the envelope's frame). */
function crown(kind: AdobeCrown, env: Envelope, seed: number): THREE.BufferGeometry[] {
  const top = env.y1, xc = (env.x0 + env.x1) / 2, zc = (env.z0 + env.z1) / 2, len = env.z1 - env.z0, out: THREE.BufferGeometry[] = [];
  if (kind === 'pinnacles') {
    // four little merlons, rounded to their tops, standing on the worn crown
    for (let k = 0; k < 4; k++) {
      const z = zc + (k - 1.5) * len / 4, h = 0.2 + hash(k, 1, seed) * 0.06;
      out.push(lathe([square(xc, top - 0.04, z, 0.11), square(xc, top + h * 0.6, z, 0.085)], [xc, top + h, z]));
    }
  } else if (kind === 'ridge') {
    // a ridged cap along the crown, its eaves a hand past the wall's crown
    const w = (env.x1 - env.x0) * 0.62, y = top - 0.02, z0 = env.z0 + 0.02, z1 = env.z1 - 0.02, rise = 0.2;
    const pos: number[] = [];
    const quad = (a: number[], b: number[], c: number[], d: number[]) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (const s of [1, -1]) quad([xc + s * w, y - 0.04, z0], [xc + s * w, y - 0.04, z1], [xc, y + rise, z1], [xc, y + rise, z0]);
    for (const z of [z0, z1]) pos.push(xc + w, y - 0.04, z, xc - w, y - 0.04, z, xc, y + rise, z);
    out.push(finish(pos));
  } else if (kind === 'brush') {
    // brushwood laid along the top: a few thin bundles, crossing a little
    for (let k = 0; k < 5; k++) {
      const x = xc + (hash(k, 2, seed) - 0.5) * 0.22, y = top - 0.02 + (k % 3) * 0.04, r = 0.05 + hash(k, 3, seed) * 0.03;
      const za = env.z0 + hash(k, 4, seed) * 0.4, zb = env.z1 - hash(k, 5, seed) * 0.4, tilt = (hash(k, 6, seed) - 0.5) * 0.12;
      const tri = (z: number, dx: number): Array<[number, number, number]> => [[x + dx - r, y, z], [x + dx + r, y, z], [x + dx, y + r * 1.6, z]];
      out.push(lathe([tri(za, -tilt), tri(zb, tilt)], null));
    }
  }
  return out;
}

/** One mud wall module filling `env` with its region's crown (intact), or its stepped breach (broken). */
export function buildAdobeWall(kind: AdobeCrown, env: Envelope, broken = false, seed = 0x0ad0): THREE.BufferGeometry {
  if (!broken) {
    const kershef = kind === 'kershef';
    const us = kershef ? [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1] : [0, 0.3, 0.6, 0.9, 1];
    // the kershef's crown rows lifted and dropped along the wall (its lumps), the faces left as they were
    const lumps = (i: number, k: number) => (kershef && k >= 4 && k <= 8 ? (hash(i, k > 6 ? 12 - k : k, seed) - 0.4) * 0.2 : 0);
    const wall = sweep(env, us, lumps);
    wall.computeBoundingBox();
    const box = wall.boundingBox!.clone();
    const parts = [wall, ...crown(kind, env, seed)];
    const g = parts.length > 1 ? mergeGeometries(parts, false)! : wall;
    if (g !== wall) for (const p of parts) p.dispose();
    // (the mud print's shape uniform reads the wall's own box, not its crown's features: props.ts mudShapeFor)
    g.boundingBox = box;
    return g;
  }
  // the stepped bite: a low length of the wall by each lip, the bite's floor between, the lumps it shed
  const H = env.y1 - env.y0, parts: THREE.BufferGeometry[] = [];
  const at = (z0: number, z1: number, h: number): Envelope => ({ ...env, z0, z1, y1: env.y0 + h });
  // (r2: the wreck within 1.5 x the intact's triangles — one length a lip, the floor open-ended, four lumps)
  parts.push(sweep(at(env.z0, env.z0 + 0.8, H * 0.42), [0, 1]));
  parts.push(sweep(at(env.z1 - 0.65, env.z1, H * 0.3), [0, 1]));
  parts.push(sweep(at(env.z0 + 0.8, env.z1 - 0.65, H * 0.16), [0, 1], () => 0, false));
  for (let k = 0; k < 4; k++) {
    const x = (env.x0 + env.x1) / 2 + (hash(k, 7, seed) - 0.5) * 1.3, z = env.z0 + 0.6 + hash(k, 8, seed) * (env.z1 - env.z0 - 1.2);
    const s = 0.08 + hash(k, 9, seed) * 0.1, y = env.y0 + 0.1;
    parts.push(lathe([square(x, y - s * 0.4, z, s), square(x, y + s * 0.3, z, s * 0.7)], [x + s * 0.2, y + s * 0.6, z]));
  }
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}

/** The mud wall's record on a map (props.ts LOCAL_TYPES walladobe): the legacy module's numbers and material. */
type AdobeWallType = Omit<DestructiblePropType, 'mat'> & { fitGeometry?: THREE.BufferGeometry; mat: string };

/**
 * The mud field wall in its region's build: `legacy` still builds first on the pool's stream (its draws, its envelope;
 * its broken build's draws), its contact band frozen as the pool's, its module the one the run's terrain fit reads, its
 * fixed-seed build the placement footprint.
 */
export function adobeWallType(architectureId: string | null | undefined, legacy: Omit<DestructiblePropType, 'mat'> & { mat: string },
  footprintRng: () => () => number): AdobeWallType {
  const kind = adobeCrownFor(architectureId);
  let band: StructureCollisionRuntimeBand | undefined, fit: THREE.BufferGeometry | undefined, env: Envelope | undefined;
  const envOf = (g: THREE.BufferGeometry): Envelope => {
    g.computeBoundingBox();
    const b = g.boundingBox!;
    return { x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y, z0: b.min.z, z1: b.max.z };
  };
  const entry: AdobeWallType = {
    ...legacy,
    build: (rng) => {
      const old = legacy.build(rng);
      band = deriveRuntimeStructureContactBand({ baked: [old] });
      env = envOf(old);
      fit?.dispose();
      fit = old;
      return buildAdobeWall(kind, env, false);
    },
    broken: (rng) => {
      legacy.broken!(rng).dispose();
      return buildAdobeWall(kind, env ?? { x0: -0.27, x1: 0.27, y0: 0, y1: 1.0, z0: -1.5, z1: 1.5 }, true);
    },
    footprintBuild: () => legacy.build(footprintRng()),
  };
  Object.defineProperty(entry, 'contactBand', { enumerable: true, get: () => band });
  Object.defineProperty(entry, 'fitGeometry', { enumerable: true, get: () => fit });
  return entry;
}
