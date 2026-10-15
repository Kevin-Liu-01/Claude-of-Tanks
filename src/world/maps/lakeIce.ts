// src/world/maps/lakeIce.ts — the frozen lakes' ice: the shore's broken plates and the pressure ridges' snow berms and
// crest plates (props lane A, family #19, 2026-10-15; WORKLIST.md #19 ground:winter-lake-ice). Extracted from mapKits.ts
// as it stood (the same text, the same dressing stream, the same buckets): dressWinterLakes calls it where it ran.
import * as THREE from 'three';
import { jitterUV, slabBox } from '../propGeometry.ts';

type Rng = () => number;
/** The dressing's height field as the ice reads it (mapKits.ts DressingHeightField). */
interface DressingHeightField {
  getHeightAt(x: number, z: number): number;
  _roadDist(x: number, z: number): number;
}
/** The buckets the ice draws in (mapKits.ts DressingBuckets). */
interface DressingBuckets {
  plaster: THREE.BufferGeometry[];
}
/** An authored lake (mapKits.ts LayoutDisc). */
interface LayoutDisc { x: number; z: number; r: number }

/** mapKits.ts winterSurface: an indexed surface with its own normals. */
function iceSurface(
  name: string, positions: Float32Array, uvs: Float32Array, indices: Uint16Array,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.name = name;
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

/** mapKits.ts isDressingPointClear: inside the extent and off the roads. */
function pointClear(
  heightField: DressingHeightField,
  x: number,
  z: number,
  extent: number,
  roadClearance: number,
): boolean {
  return Math.max(Math.abs(x), Math.abs(z)) <= extent
    && heightField._roadDist(x, z) >= roadClearance;
}

function winterWedgeBaseHeight(
  heightField: DressingHeightField, x: number, z: number,
  width: number, depth: number, ca: number, sa: number,
): number {
  // A common buried plane cannot bridge a curved bank like independently
  // seated corners. Sample perimeter AND underside at <=0.45m spacing for
  // the authored footprints; the35mm embed covers between-sample curvature.
  let low = Infinity;
  for (let row = 0; row <= 4; row++) for (let column = 0; column <= 4; column++) {
    const lx = (column / 4 - 0.5) * width, lz = (row / 4 - 0.5) * depth;
    low = Math.min(low, heightField.getHeightAt(x + ca * lx + sa * lz, z - sa * lx + ca * lz));
  }
  return low - 0.035;
}

function setWinterPlateUV(
  uv: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, index: number,
  x: number, rise: number, z: number, scale: number,
): void {
  // Box faces are +X,-X,+Y,-Y,+Z,-Z. Use the actual deformed face axes;
  // jitterUV still runs exactly once at the original production call site.
  const face = Math.floor(index / 4);
  const u = face < 2 ? (face ? -z : z) : (face === 5 ? -x : x);
  const v = face === 2 ? -z : face === 3 ? z : rise;
  uv.setXY(index, u * scale, v * scale);
}

// A broad, tilted fracture plate with unequal broken edges, not a narrow
// masonry tent. Keep the same24 vertices/12 triangles and exact buried base;
// existing roll/pitch draws vary the cap without consuming more randomness.
function winterIceWedge(
  heightField: DressingHeightField, x: number, z: number, width: number,
  height: number, depth: number, yaw: number, roll: number, pitch: number, uvScale: number,
): THREE.BoxGeometry {
  const h = Math.min(height, width * 0.16), d = Math.max(depth, width * 0.65);
  const geometry = slabBox(width, h, d, uvScale);
  geometry.name = 'winter-ice-wedge';
  const p = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
  const ca = Math.cos(yaw), sa = Math.sin(yaw);
  const bottomY = winterWedgeBaseHeight(heightField, x, z, width, d, ca, sa);
  const tiltX = roll < 0 ? -0.30 : 0.30;
  const capHeights: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 0, sx = Math.sign(p.getX(i)), sz = Math.sign(p.getZ(i));
    let lx = p.getX(i), lz = p.getZ(i);
    if (top) {
      lx = lx * (0.80 + sz * (0.06 + roll * 0.08)) + pitch * width * 0.045;
      lz = lz * (0.81 + sx * (0.045 + pitch * 0.08)) + roll * d * 0.055;
    }
    const wx = x + ca * lx + sa * lz, wz = z - sa * lx + ca * lz;
    const corner = (sx > 0 ? 1 : 0) + (sz > 0 ? 2 : 0);
    if (top && capHeights[corner] === undefined) {
      const tilt = sx * tiltX + sz * (0.10 + pitch * 0.12);
      capHeights[corner] = heightField.getHeightAt(wx, wz) + 0.025 + h * (0.48 + tilt);
    }
    p.setXYZ(i, wx, top ? capHeights[corner] : bottomY, wz);
    setWinterPlateUV(uv, i, lx, p.getY(i) - bottomY, lz, uvScale);
  }
  geometry.computeVertexNormals();
  return geometry;
}

interface WinterRidgeRow {
  x: number; z: number; angle: number; height: number; halfWidth: number;
}

function winterBermHump(t: number, center: number, radius: number): number {
  const q = Math.max(0, 1 - Math.abs(t - center) / radius);
  return q * q * (3 - 2 * q);
}

function seatWinterBermEdge(
  positions: Float32Array, heightField: DressingHeightField, a: number, b: number,
): void {
  a *= 3; b *= 3;
  let lower = 0;
  // Construction only: seat the interpolated edge, not just its two vertices.
  // Lowering both endpoints cannot reopen any already seated adjoining edge.
  for (let step = 1; step < 8; step++) {
    const t = step / 8;
    const x = positions[a] + (positions[b] - positions[a]) * t;
    const z = positions[a + 2] + (positions[b + 2] - positions[a + 2]) * t;
    const y = positions[a + 1] + (positions[b + 1] - positions[a + 1]) * t;
    lower = Math.max(lower, y - heightField.getHeightAt(x, z) + 0.035);
  }
  positions[a + 1] -= lower;
  positions[b + 1] -= lower;
}

function seatWinterBermPerimeter(
  positions: Float32Array, heightField: DressingHeightField, rows: number,
): void {
  for (let row = 0; row < rows - 1; row++) {
    seatWinterBermEdge(positions, heightField, row * 5, (row + 1) * 5);
    seatWinterBermEdge(positions, heightField, row * 5 + 4, (row + 1) * 5 + 4);
  }
  for (let column = 0; column < 4; column++) {
    seatWinterBermEdge(positions, heightField, column, column + 1);
    const last = (rows - 1) * 5 + column;
    seatWinterBermEdge(positions, heightField, last, last + 1);
  }
}

function winterPressureBerm(
  heightField: DressingHeightField, rows: WinterRidgeRow[],
): THREE.BufferGeometry {
  // Keep the same five-vertex sections, but compose two unequal snow humps
  // instead of a uniformly wide, regularly segmented masonry-looking strip.
  const positions = new Float32Array(rows.length * 15), uvs = new Float32Array(rows.length * 10);
  const indices = new Uint16Array((rows.length - 1) * 24);
  const wave = Math.sin(rows[0].x * 0.17 + rows[0].z * 0.11), side = wave >= 0 ? 1 : -1;
  const profile = side > 0 ? [0, 0.44, 1, 0.68, 0] : [0, 0.68, 1, 0.44, 0];
  let peak = 0;
  for (const row of rows) peak = Math.max(peak, row.height);
  for (let row = 0; row < rows.length; row++) {
    const r = rows[row], ca = Math.cos(r.angle), sa = Math.sin(r.angle);
    const t = row / (rows.length - 1), taper = 4 * t * (1 - t);
    const skew = side * (0.14 + 0.06 * (1 - taper));
    const acrossProfile = [-1, -0.52 + skew * 0.5, skew, 0.55 + skew * 0.5, 1];
    const rise = peak * (0.18 + 0.78 * winterBermHump(t, 0.28 + 0.04 * wave, 0.23)
      + 0.57 * winterBermHump(t, 0.75 + 0.02 * wave, 0.19));
    for (let column = 0; column < 5; column++) {
      const across = acrossProfile[column] * r.halfWidth * (0.24 + 0.76 * taper);
      const x = r.x - sa * across, z = r.z + ca * across;
      const edge = row === 0 || row === rows.length - 1 || column === 0 || column === 4;
      const y = heightField.getHeightAt(x, z) + (edge ? -0.035 : rise * profile[column]);
      const i = row * 5 + column;
      positions.set([x, y, z], i * 3);
      uvs.set([x * 0.3, z * 0.3], i * 2);
      if (row < rows.length - 1 && column < 4) {
        indices.set([i, i + 1, i + 5, i + 1, i + 6, i + 5], (row * 4 + column) * 6);
      }
    }
  }
  seatWinterBermPerimeter(positions, heightField, rows.length);
  return iceSurface('winter-pressure-berm', positions, uvs, indices);
}

// Same seeded ridge sites and occasional ice plates; only the construction
// topology changes. All old UV-jitter draws are consumed to preserve later
// drifts/boats and subsequent lakes, but the continuous surface uses metric UVs.
function pressureRidge(
  buckets: DressingBuckets,
  rng: Rng,
  cx: number,
  cz: number,
  heightField: DressingHeightField,
  ang: number,
  len: number,
): void {
  const n = Math.max(6, Math.round(len / 1.7));
  const bend = (rng() - 0.5) * 0.9; // gentle S-curve along the run
  const rows: WinterRidgeRow[] = [];
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1) - 0.5;
    const aa = ang + bend * t;
    const px = cx + Math.cos(aa) * t * len + (rng() - 0.5) * 0.5;
    const pz = cz + Math.sin(aa) * t * len + (rng() - 0.5) * 0.5;
    const taper = Math.max(0.25, 1 - Math.abs(t) * 1.6); // sink toward the ends
    const bh = (0.17 + rng() * 0.13) * taper;
    const segmentLength = 1.9 + rng() * 0.9, width = 1.15 + rng() * 0.65;
    const angle = aa - (rng() - 0.5) * 0.22, pitch = (rng() - 0.5) * 0.10;
    rows.push({ x: px, z: pz, angle, height: bh * (1 + pitch),
      halfWidth: width * (0.46 + segmentLength * 0.02) });
    rng(); rng(); rng(); rng(); // original segment jitterUV contract
    if (rng() < 0.22) { // occasional small refrozen plate on the crest
      const pw = 0.7 + rng() * 0.6, phh = 0.18 + rng() * 0.22;
      const depth = 0.10 + rng() * 0.08;
      const roll = (rng() - 0.5) * 0.5, pitch = (rng() - 0.5) * 0.4;
      const plate = winterIceWedge(heightField, px, pz, pw, bh + phh * 0.5,
        depth, -aa + (rng() - 0.5) * 0.6, roll, pitch, 0.8);
      buckets.plaster.push(jitterUV(plate, rng));
    }
  }
  // Both the snow-filled seam and opaque snow-dusted plates reuse the existing
  // plaster/drift surface; mortar normals must not print masonry onto ice.
  buckets.plaster.push(winterPressureBerm(heightField, rows));
}

export function addWinterShoreIce(
  lake: LayoutDisc,
  big: boolean,
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
): void {
  const clusters = Math.round(lake.r * (big ? 0.62 : 0.42));
  for (let i = 0; i < clusters; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = lake.r * (0.90 + rng() * 0.12);
    const x = lake.x + Math.cos(angle) * radius;
    const z = lake.z + Math.sin(angle) * radius;
    if (!pointClear(heightField, x, z, 480, 6)) continue;
    if (rng() < 0.45) continue;
    const slabCount = 2 + ((rng() * 4) | 0);
    for (let slabIndex = 0; slabIndex < slabCount; slabIndex++) {
      const width = 0.7 + rng() * 1.1;
      const height = 0.22 + rng() * 0.34;
      const depth = 0.14 + rng() * 0.10;
      const roll = (rng() - 0.5) * 0.9, pitch = (rng() - 0.5) * 0.8;
      const yaw = -angle + (rng() - 0.5) * 0.9;
      const px = x + (rng() - 0.5) * 2.6, pz = z + (rng() - 0.5) * 2.6;
      const slab = winterIceWedge(heightField, px, pz, width, height, depth, yaw, roll, pitch, 0.9);
      buckets.plaster.push(jitterUV(slab, rng));
    }
  }
}

export function addWinterPressureRidges(
  lake: LayoutDisc,
  big: boolean,
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
): void {
  const ridges = big ? 7 : 2;
  for (let i = 0; i < ridges; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = lake.r * (0.16 + rng() * 0.5);
    const x = lake.x + Math.cos(angle) * radius;
    const z = lake.z + Math.sin(angle) * radius;
    pressureRidge(buckets, rng, x, z, heightField,
      rng() * Math.PI, 10 + rng() * 10);
  }
}
