// src/dev/colliderOverlay.ts — the world's collider view (the hitbox lane, 2026-10-07): every collision record near a
// point drawn as the prisms the simulation tests — the movement obstacles in orange, the shell and line-of-sight
// colliders in cyan — each part from its own bottom to its own top. Lines in front of the scene draw solid; the stretch
// a mesh hides draws faint, so a collider standing in empty air reads at once against the stone or wall it stands for.
// Debug-only: reached through window.__DEBUG.colliderOverlay (debugSurface.ts), never from a player's boot.
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { CollisionRecord, SimpleCollisionShape } from '../world/collision.ts';

interface OverlayWorld {
  getObstacles?(): CollisionRecord[];
  getColliders?(): CollisionRecord[];
  heightField?: { getHeightAt(x: number, z: number): number };
}

export interface ColliderOverlayOptions {
  /** World centre and radius of the records drawn (m). */
  x: number;
  z: number;
  radius?: number;
  /** Which lists: movement obstacles, shell colliders or both (default both). */
  lists?: 'movement' | 'shells' | 'both';
  /** Leave out the trees (thousands on a forest map). */
  trees?: boolean;
  /** Line width in pixels (default 2.5). */
  width?: number;
}

export interface ColliderOverlayHandle {
  object: THREE.Object3D;
  records: { movement: number; shells: number };
  remove(): void;
}

const MOVEMENT_COLOR = 0xff8a1f;
const SHELL_COLOR = 0x22e4ff;
const CIRCLE_SIDES = 24;

/** The outline of one part as world [x, z, ...] points. */
export function partOutline(part: SimpleCollisionShape | null, record: CollisionRecord): number[] {
  if (!part) {
    return [record.min[0], record.min[2], record.max[0], record.min[2], record.max[0], record.max[2], record.min[0], record.max[2]];
  }
  if (part.kind === 'convex') return part.points.slice();
  if (part.kind === 'circle') {
    const out: number[] = [];
    for (let i = 0; i < CIRCLE_SIDES; i++) {
      const a = (i / CIRCLE_SIDES) * Math.PI * 2;
      out.push(part.cx + Math.cos(a) * part.r, part.cz + Math.sin(a) * part.r);
    }
    return out;
  }
  const fx = Math.sin(part.yaw), fz = Math.cos(part.yaw), rx = fz, rz = -fx;
  const out: number[] = [];
  for (const [s, t] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    out.push(part.cx + rx * part.hw * s + fx * part.hl * t, part.cz + rz * part.hw * s + fz * part.hl * t);
  }
  return out;
}

/** Line-segment positions (x y z pairs) of every part's prism: the bottom and top loops and the corner posts. */
export function recordSegments(record: CollisionRecord, groundAt: ((x: number, z: number) => number) | null, out: number[]): void {
  const shape = record.shape2;
  const parts: Array<SimpleCollisionShape | null> = !shape ? [null] : shape.kind === 'compound' ? shape.parts : [shape];
  for (const part of parts) {
    const outline = partOutline(part, record);
    const n = outline.length / 2;
    let y0 = part?.y0 ?? record.min[1];
    const y1 = part?.y1 ?? record.max[1];
    // a part's bottom under the ground draws at the ground, where it can be seen (its posts start there)
    if (groundAt) {
      let lowest = Infinity;
      for (let i = 0; i < n; i++) lowest = Math.min(lowest, groundAt(outline[i * 2], outline[i * 2 + 1]));
      if (Number.isFinite(lowest)) y0 = Math.max(y0, Math.min(lowest, y1));
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = outline[i * 2], az = outline[i * 2 + 1], bx = outline[j * 2], bz = outline[j * 2 + 1];
      out.push(ax, y0, az, bx, y0, bz, ax, y1, az, bx, y1, bz);
      // posts at every other corner of a many-sided outline (a circle's or a stone's), at every corner of a box
      if (n <= 8 || i % 2 === 0) out.push(ax, y0, az, ax, y1, az);
    }
  }
}

function linesOf(positions: number[], color: number, width: number, resolution: THREE.Vector2, hidden: boolean): LineSegments2 {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  const material = new LineMaterial({
    color, linewidth: hidden ? width * 0.6 : width, transparent: true, opacity: hidden ? 0.28 : 1,
    depthTest: !hidden, depthWrite: false,
  });
  material.resolution.copy(resolution);
  const lines = new LineSegments2(geometry, material);
  lines.renderOrder = hidden ? 9998 : 9999;
  lines.frustumCulled = false;
  return lines;
}

/** Draw the records within `radius` of (x, z) into the scene; the handle removes them. */
export function showColliderOverlay(
  scene: THREE.Scene, world: OverlayWorld, renderer: THREE.WebGLRenderer | null, options: ColliderOverlayOptions,
): ColliderOverlayHandle {
  const radius = options.radius ?? 30, lists = options.lists ?? 'both', width = options.width ?? 2.5;
  const groundAt = world.heightField ? (x: number, z: number) => world.heightField!.getHeightAt(x, z) : null;
  const near = (record: CollisionRecord) => !record.dead && (options.trees || record.treeIdx == null)
    && record.max[0] >= options.x - radius && record.min[0] <= options.x + radius
    && record.max[2] >= options.z - radius && record.min[2] <= options.z + radius;
  const resolution = new THREE.Vector2(1600, 900);
  if (renderer) renderer.getDrawingBufferSize(resolution);
  const group = new THREE.Group();
  group.name = 'debug-collider-overlay';
  const records = { movement: 0, shells: 0 };
  const add = (list: CollisionRecord[], color: number, key: 'movement' | 'shells') => {
    const positions: number[] = [];
    for (const record of list) {
      if (!near(record)) continue;
      recordSegments(record, groundAt, positions);
      records[key]++;
    }
    if (!positions.length) return;
    group.add(linesOf(positions, color, width, resolution, true), linesOf(positions, color, width, resolution, false));
  };
  if (lists !== 'shells') add(world.getObstacles?.() ?? [], MOVEMENT_COLOR, 'movement');
  if (lists !== 'movement') add(world.getColliders?.() ?? [], SHELL_COLOR, 'shells');
  scene.add(group);
  return {
    object: group,
    records,
    remove() {
      scene.remove(group);
      group.traverse((object) => {
        const lines = object as LineSegments2;
        lines.geometry?.dispose?.();
        (lines.material as THREE.Material | undefined)?.dispose?.();
      });
    },
  };
}
