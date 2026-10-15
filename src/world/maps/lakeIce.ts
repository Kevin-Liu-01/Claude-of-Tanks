// src/world/maps/lakeIce.ts — the frozen lakes' ice: the shore's broken plates and the pressure ridges' snow berms and
// crest plates (props lane A, family #19, 2026-10-15; WORKLIST.md #19 ground:winter-lake-ice). Extracted from mapKits.ts
// as it stood: dressWinterLakes calls it where it ran.
//
// (#19, the rebuild: "Rebuild the ridge as a pile of broken ice slabs. Each slab is a real block 15-40 cm thick with
// chipped edges, stacked and leaning against each other, with an ice material (clear blue-green edges, a white rime top)
// apart from the snow. Fill the gaps with snow") A slab is a broken plate of the sheet: an irregular pentagon, 15-40 cm
// thick, its top arris chipped, rafted up on one edge with its low edge frozen into the sheet; vertex colour on the baked
// material (a rime top, blue-green broken edges darkening to the deep ice below). The shore's plates and the ridges'
// crest plates are these, on the same draws of the dressing stream; each ridge's pile of slabs leaning in on its snow
// berm from both sides is drawn from the ridge's own hash stream, so every later draw of the dressing keeps its seat.
import * as THREE from 'three';
import { hash, hexLin, mix, stream, type Rgb } from './craftMesh.ts';

type Rng = () => number;
/** The dressing's height field as the ice reads it (mapKits.ts DressingHeightField). */
interface DressingHeightField {
  getHeightAt(x: number, z: number): number;
  _roadDist(x: number, z: number): number;
}
/** The buckets the ice draws in (mapKits.ts DressingBuckets): the snow on the plaster, the ice on the baked material. */
interface DressingBuckets {
  plaster: THREE.BufferGeometry[];
  baked?: THREE.BufferGeometry[];
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

const RIME = hexLin(0xe6ecf2), SNOWED = hexLin(0xd2dae2), EDGE = hexLin(0x6a9aa0), DEEP = hexLin(0x2c5864);

/** The ice's bucket: the baked material's vertex colour (a caller without it keeps the ice on the snow, uncoloured). */
function pushIce(buckets: DressingBuckets, geometry: THREE.BufferGeometry): void {
  if (buckets.baked) { buckets.baked.push(geometry); return; }
  geometry.deleteAttribute('color');
  buckets.plaster.push(geometry);
}

/**
 * A broken slab of the sheet, `w` along its yaw and `d` across, `t` thick: an irregular pentagon, its top arris chipped,
 * rafted up `lean` (rad) on its +across edge, its low edge frozen into the lowest ice under it by 4 cm; closed (its
 * underside shows under a raised edge). `seed` its own shape.
 */
function iceSlab(heightField: DressingHeightField, x: number, z: number, w: number, d: number, t: number,
  yaw: number, lean: number, seed: number): THREE.BufferGeometry {
  const N = 5, CH = 0.03, r = stream(seed);
  const outline = Array.from({ length: N }, (_, k) => {
    const a = (k + (r() - 0.5) * 0.8) / N * Math.PI * 2, s = 0.6 + r() * 0.45;
    return [Math.cos(a) * w * 0.5 * s, Math.sin(a) * d * 0.5 * s] as const;
  });
  const inset = (k: number, f: number) => {
    const [px, pz] = outline[k], l = Math.hypot(px, pz) || 1;
    return [px - (px / l) * f, pz - (pz / l) * f] as const;
  };
  // the raft: tilted about its long axis so the +across edge rises
  const theta = Math.min(1.35, Math.max(0.04, lean));
  const ct = Math.cos(theta), st = Math.sin(theta), ca = Math.cos(yaw), sa = Math.sin(yaw);
  const world = (lx: number, lz: number) => [x + ca * lx + sa * lz, z - sa * lx + ca * lz] as const;
  // the ice under it as a plane (a 5 x 5 probe of its footprint): the slab follows a bank's slope, then rafts up off it
  let gx = 0, gz = 0, sxx = 0, szz = 0;
  for (let row = 0; row <= 4; row++) for (let colm = 0; colm <= 4; colm++) {
    const lx = (colm / 4 - 0.5) * w, lz = (row / 4 - 0.5) * d, [wx, wz] = world(lx, lz), h = heightField.getHeightAt(wx, wz);
    gx += h * lx; gz += h * lz; sxx += lx * lx; szz += lz * lz;
  }
  gx /= sxx; gz /= szz;
  const local = (lx: number, ly: number, lz: number) => {
    const ry = ly * ct + lz * st, rz = lz * ct - ly * st;
    return [lx, ry + gx * lx + gz * rz, rz] as const;
  };
  // seated by one corner: the foot corner the ice stands highest against frozen in by 4 cm, the rest rafted off it
  let y0 = -Infinity;
  for (const [px, pz] of outline) {
    const [lx, ly, lz] = local(px, 0, pz), [wx, wz] = world(lx, lz);
    y0 = Math.max(y0, heightField.getHeightAt(wx, wz) - ly);
  }
  y0 -= 0.04;
  const pos: number[] = [], col: number[] = [], uv: number[] = [];
  const put = (q: readonly [number, number, number], c: Rgb) => {
    const [lx, ly, lz] = local(q[0], q[1], q[2]), [wx, wz] = world(lx, lz);
    pos.push(wx, y0 + ly, wz); col.push(c[0], c[1], c[2]); uv.push(wx * 0.3, wz * 0.3);
  };
  const tri = (a: readonly [number, number, number], b: readonly [number, number, number], c: readonly [number, number, number], ca2: Rgb, cb: Rgb, cc: Rgb) => {
    put(a, ca2); put(b, cb); put(c, cc);
  };
  const shade = (k: number, base: Rgb, n: number) => mix(base, RIME, hash(k, n, seed) * 0.18);
  const top = Array.from({ length: N }, (_, k) => { const [px, pz] = inset(k, CH * 1.4); return [px, t, pz] as const; });
  const shoulder = outline.map(([px, pz]) => [px, t - CH, pz] as const);
  const foot = outline.map(([px, pz]) => [px, 0, pz] as const);
  // (wound outward: the outline runs counter-clockwise seen from +y, so a side's quad a b b' a' faces out)
  for (let k = 1; k + 1 < N; k++) tri(top[0], top[k + 1], top[k], mix(RIME, SNOWED, hash(0, 1, seed)), RIME, SNOWED);
  for (let k = 0; k < N; k++) {
    const k1 = (k + 1) % N, chip = mix(RIME, EDGE, 0.45), edge = shade(k, EDGE, 2), deep = shade(k, DEEP, 3);
    tri(shoulder[k], top[k], top[k1], chip, RIME, RIME); tri(shoulder[k], top[k1], shoulder[k1], chip, RIME, chip);
    tri(foot[k], shoulder[k], shoulder[k1], deep, edge, edge); tri(foot[k], shoulder[k1], foot[k1], deep, edge, deep);
  }
  for (let k = 1; k + 1 < N; k++) tri(foot[0], foot[k], foot[k + 1], DEEP, DEEP, DEEP);
  const geometry = new THREE.BufferGeometry();
  geometry.name = 'winter-ice-slab';
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
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
      const yaw = -aa + (rng() - 0.5) * 0.6;
      // (#19) a slab rafted up on the crest, thicker for its depth draw; the old plate's jitterUV draws still made
      rng(); rng(); rng(); rng();
      pushIce(buckets, iceSlab(heightField, px, pz, pw * 1.3, pw * (0.75 + roll * 0.4), 0.14 + depth * 1.2,
        yaw + pitch * 0.4, 0.55 + phh * 1.6, Math.floor(hash(Math.round(px * 16), Math.round(pz * 16), 0x1ce) * 0x7fffffff)));
    }
  }
  // (#19) the ridge's pile: broken slabs leaning in on the berm from both sides along it, its ends left to the snow
  const pile = stream(Math.floor(hash(Math.round(cx * 16), Math.round(cz * 16), 0x9e1) * 0x7fffffff));
  for (let k = 1; k + 1 < rows.length; k++) {
    const row = rows[k], ca = Math.cos(row.angle), sa = Math.sin(row.angle);
    const slabs = 1 + Math.floor(pile() * 1.8);
    for (let j = 0; j < slabs; j++) {
      const side = (k + j) % 2 ? 1 : -1, off = row.halfWidth * (0.25 + pile() * 0.45) * side;
      const along = (pile() - 0.5) * 1.2;
      const sx = row.x + ca * along - sa * off, sz = row.z + sa * along + ca * off;
      const w = 0.9 + pile() * 1.0, d = 0.6 + pile() * 0.7, t = 0.15 + pile() * 0.14;
      // pushed up steeply, its raised edge toward the crest: the slab's +across turned to face the ridge's line
      const yaw = -row.angle + (side > 0 ? Math.PI : 0) + (pile() - 0.5) * 0.5;
      pushIce(buckets, iceSlab(heightField, sx, sz, w, d, t, yaw, 0.6 + pile() * 0.7, Math.floor(pile() * 0x7fffffff)));
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
      // (#19) a broken slab 15-40 cm thick rafted up on the shore; the old plate's jitterUV draws still made
      rng(); rng(); rng(); rng();
      // (rafted up on the shore 10-40 degrees, the higher the taller its old plate's height draw)
      pushIce(buckets, iceSlab(heightField, px, pz, width * 1.2, width * (0.6 + Math.abs(roll) * 0.4), 0.12 + depth * 1.1,
        yaw + pitch * 0.3, 0.18 + (height - 0.22) * 1.4, Math.floor(hash(Math.round(px * 16), Math.round(pz * 16), 0x51a) * 0x7fffffff)));
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
