// src/world/maps/coalStockpile.ts — the rail yards' and the coal stages' stockpiles (props census #3, lane B 2026-10-14;
// extracted from mapKits.ts as they were, then rebuilt here): the faceted heap, its clear-site law, its convex record
// and its crushable pile.
import * as THREE from 'three';
import { cloneCollisionRecord, convexHull2, setConvexShape, type CollisionRecord } from '../collision.ts';
import { CrushableClutter } from '../crushableClutter.ts';

/** The ground a heap reads (mapKits.ts DressingHeightField's members it uses). */
export interface CoalGround {
  getHeightAt(x: number, z: number): number;
  _roadDist(x: number, z: number): number;
  getWaterMaskAt(x: number, z: number): number;
}

/** What a heap registers into (mapKits.ts FocusedDressingContext's members it uses). */
interface CoalContext {
  obstacles?: CollisionRecord[];
  colliders?: CollisionRecord[];
  clutter?: (pile: CrushableClutter) => void;
}

type CoalVertex = readonly [number, number, number];

export function coalSiteIsClear(
  field: CoalGround, x: number, z: number, radius: number,
  obstacles: readonly CollisionRecord[],
): boolean {
  let low = Infinity, high = -Infinity;
  for (let iz = -2; iz <= 2; iz++) for (let ix = -2; ix <= 2; ix++) {
    const px = x + ix * radius / 2, pz = z + iz * radius / 2;
    if (field._roadDist(px, pz) < 7 || field.getWaterMaskAt?.(px, pz) > 0.01) return false;
    const y = field.getHeightAt(px, pz);
    if (!Number.isFinite(y)) return false;
    low = Math.min(low, y); high = Math.max(high, y);
  }
  if (high - low > 0.4) return false;
  return !obstacles.some(record => record.min[0] < x + radius + 0.5
    && record.max[0] > x - radius - 0.5 && record.min[2] < z + radius + 0.5
    && record.max[2] > z - radius - 0.5);
}

function coalFacet(
  positions: number[], colors: number[], uvs: number[],
  a: CoalVertex, b: CoalVertex, c: CoalVertex, phase: number,
): void {
  // Three small irregular facets retain a granular highlight, not smooth
  // interpolated ellipsoid normals. No additional seeded draws are consumed.
  const middle: CoalVertex = [(a[0] + b[0] + c[0]) / 3,
    (a[1] + b[1] + c[1]) / 3 + 0.015 * (1 + Math.sin(phase * 2.7)),
    (a[2] + b[2] + c[2]) / 3];
  const corners = [a, b, c];
  for (let edge = 0; edge < 3; edge++) {
    const shade = 0.032 + 0.012 * Math.sin(phase * 4.1 + edge * 1.7);
    for (const vertex of [corners[edge], corners[(edge + 1) % 3], middle]) {
      positions.push(...vertex);
      colors.push(shade * 0.94, shade, shade * 1.03);
      uvs.push(vertex[0] * 0.6, vertex[2] * 0.6);
    }
  }
}

export function makeCoalStockpile(
  field: CoalGround, x: number, z: number,
  radius: number, length: number, phase: number,
): THREE.BufferGeometry {
  const base: CoalVertex[] = [], shoulder: CoalVertex[] = [];
  const height = 0.66 + (radius - 1.1) * 0.36;
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const dx = Math.cos(angle) * radius, dz = Math.sin(angle) * length;
    base.push([x + dx, field.getHeightAt(x + dx, z + dz) - 0.05, z + dz]);
    const sx = x + dx * 0.47 + radius * 0.08, sz = z + dz * 0.47;
    shoulder.push([sx, field.getHeightAt(sx, sz) + height * (0.54 + 0.06 * Math.sin(i * 2 + phase)), sz]);
  }
  const peak: CoalVertex = [x - radius * 0.1, field.getHeightAt(x - radius * 0.1, z) + height, z];
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [];
  for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8;
    // Clockwise XZ winding faces upward in Three's Y-up world.
    coalFacet(positions, colors, uvs, base[i], shoulder[i], base[next], phase + i * 3);
    coalFacet(positions, colors, uvs, base[next], shoulder[i], shoulder[next], phase + i * 3 + 1);
    coalFacet(positions, colors, uvs, shoulder[i], peak, shoulder[next], phase + i * 3 + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.name = 'rail-coal-stockpile';
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

export function registerCoalStockpile(geometry: THREE.BufferGeometry, ctx: CoalContext): void {
  const position = geometry.getAttribute('position'), points: Array<[number, number]> = [];
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < position.count; i++) {
    points.push([position.getX(i), position.getZ(i)]);
    low = Math.min(low, position.getY(i)); high = Math.max(high, position.getY(i));
  }
  // Same ordinary conservative vertical prism as authored rocks: exact
  // projected convex footprint/Y bounds, not a rectangular invisible wall.
  const record = setConvexShape({min: [0, low, 0], max: [0, high, 0], kind: 'coal-heap'}, convexHull2(points));
  const shell = cloneCollisionRecord(record);
  ctx.obstacles?.push(record);
  ctx.colliders?.push(shell);
  // (destruction stream, 2026-10-13; the owner: every prop under a size destructible by ramming or shooting) a hull
  // drives through a coal pile and a round bursts it: crushed, the pile lies flattened where it stood
  if (ctx.clutter) {
    let cx = 0, cz = 0;
    for (const [x, z] of points) { cx += x; cz += z; }
    cx /= Math.max(1, points.length); cz /= Math.max(1, points.length);
    let r = 0;
    for (const [x, z] of points) r = Math.max(r, Math.hypot(x - cx, z - cz));
    const pile = new CrushableClutter('coal-heap', cx, low, cz, r, high - low, [record], [shell]);
    pile.ownPiece(geometry);
    ctx.clutter(pile);
  }
}

