// src/dev/colliderOverlay.ts — the world's collider view (the hitbox lane, 2026-10-07): every collision record near a
// point drawn as the prisms the simulation tests — the movement obstacles in orange, the shell and line-of-sight
// colliders in cyan — each part from its own bottom to its own top. Lines in front of the scene draw solid; the stretch
// a mesh hides draws faint and dashed, so a collider standing in empty air reads at once against the stone or wall it
// stands for, and one behind a bank or a tree never reads as hanging on its face (the hitbox lane, 2026-10-08: a fit
// wave read the faint prisms of three stones behind a terrain bank as colliders floating on the bank). A stone's
// movement tiers are columns from its floor, each inside the one under it (rockCollision.ts movementTiers): each is drawn
// from the top of the column it stands in, so the stack reads as the steps the hull meets. A legend names the colours
// and says what the movement record leaves to the shells (round 2).
// Debug-only: reached through window.__DEBUG.colliderOverlay (debugSurface.ts), never from a player's boot.
// Plain one-pixel THREE.LineSegments, the hidden stretch a LineDashedMaterial (batch 5 integration, 2026-10-08): three's
// fat lines (LineSegments2, LineSegmentsGeometry, LineMaterial) drew wider strokes but pulled WireframeGeometry and
// InstancedInterleavedBuffer into the shared three.core chunk every page preloads, though only this lazy overlay used
// them (the gallery 1,461 B over its budget). The classes used here are already in that chunk (the gallery's overlays).
import * as THREE from 'three';
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
  /** The legend in the frame's corner (default true). */
  legend?: boolean;
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

/** Is every corner of `inner` inside the convex `outer` (either winding), within two centimetres? */
function outlineInside(inner: readonly number[], outer: readonly number[]): boolean {
  let wind = 0;
  for (let i = 0; i < outer.length; i += 2) {
    const j = (i + 2) % outer.length;
    wind += outer[i] * outer[j + 1] - outer[j] * outer[i + 1];
  }
  const sign = wind >= 0 ? 1 : -1;
  for (let k = 0; k < inner.length; k += 2) {
    for (let i = 0; i < outer.length; i += 2) {
      const j = (i + 2) % outer.length, ex = outer[j] - outer[i], ez = outer[j + 1] - outer[i + 1], len = Math.hypot(ex, ez);
      if (len < 1e-9) continue;
      if (sign * (ex * (inner[k + 1] - outer[i + 1]) - ez * (inner[k] - outer[i])) / len < -0.02) return false;
    }
  }
  return true;
}

/** Line-segment positions (x y z pairs) of every part's prism: the bottom and top loops and the corner posts. */
export function recordSegments(record: CollisionRecord, groundAt: ((x: number, z: number) => number) | null, out: number[]): void {
  const shape = record.shape2;
  const parts: Array<SimpleCollisionShape | null> = !shape ? [null] : shape.kind === 'compound' ? shape.parts : [shape];
  const outlines = parts.map((part) => partOutline(part, record));
  for (let p = 0; p < parts.length; p++) {
    const part = parts[p];
    const outline = outlines[p];
    const n = outline.length / 2;
    let y0 = part?.y0 ?? record.min[1];
    const y1 = part?.y1 ?? record.max[1];
    // a column standing in another (a stone's tier inside the one under it, from the same floor): drawn from that one's
    // top, where it shows (under it the two are one volume)
    let stands = -Infinity;
    for (let q = 0; q < parts.length; q++) {
      const other = parts[q], top = other?.y1 ?? record.max[1];
      if (q === p || !(top < y1 - 1e-6) || !(top > stands) || (other?.y0 ?? record.min[1]) > y0 + 1e-3) continue;
      if (outlineInside(outline, outlines[q])) stands = top;
    }
    if (stands > y0) { y0 = stands; }
    // a part's bottom under the ground draws at the ground, where it can be seen (its posts start there)
    else if (groundAt) {
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

function linesOf(positions: number[], color: number, hidden: boolean): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = hidden
    // (dashes of 15 cm every 40 cm, in world metres: the hidden stretch, drawn through whatever hides it)
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity: 0.28, depthTest: false, depthWrite: false, dashSize: 0.15, gapSize: 0.25 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, depthTest: true, depthWrite: false });
  const lines = new THREE.LineSegments(geometry, material);
  if (hidden) lines.computeLineDistances();
  lines.renderOrder = hidden ? 9998 : 9999;
  lines.frustumCulled = false;
  return lines;
}

/** The legend in the frame's lower left corner (a page without a document draws none). */
function showLegend(): { remove(): void } | null {
  if (typeof document === 'undefined' || !document.body) return null;
  const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
  const box = document.createElement('div');
  box.dataset.debugColliderLegend = '1';
  box.style.cssText = 'position:fixed;left:12px;bottom:12px;max-width:540px;z-index:2147483000;pointer-events:none;'
    + 'font:13px/1.4 system-ui,-apple-system,sans-serif;color:#f2f4f6;background:rgba(10,12,16,0.74);'
    + 'padding:8px 11px;border-radius:6px';
  const chip = (c: number): string => `<span style="display:inline-block;width:10px;height:10px;margin:0 5px 0 0;background:${hex(c)}"></span>`;
  box.innerHTML = `<b>Colliders</b><br>${chip(MOVEMENT_COLOR)}movement: what stops a hull &nbsp; ${chip(SHELL_COLOR)}shells and sight `
    + '&nbsp; dashed: behind a surface<br>Movement stands to a hull\'s roof (3 m over the ground): an overhang above it, such as a '
    + 'hoodoo\'s cap, stops shells only, by design.';
  document.body.appendChild(box);
  return { remove: () => box.remove() };
}

/** Draw the records within `radius` of (x, z) into the scene; the handle removes them. (The renderer is no longer read:
 * one-pixel lines need no drawing-buffer resolution; the parameter stays for debugSurface's call.) */
export function showColliderOverlay(
  scene: THREE.Scene, world: OverlayWorld, _renderer: THREE.WebGLRenderer | null, options: ColliderOverlayOptions,
): ColliderOverlayHandle {
  const radius = options.radius ?? 30, lists = options.lists ?? 'both';
  const groundAt = world.heightField ? (x: number, z: number) => world.heightField!.getHeightAt(x, z) : null;
  const near = (record: CollisionRecord) => !record.dead && (options.trees || record.treeIdx == null)
    && record.max[0] >= options.x - radius && record.min[0] <= options.x + radius
    && record.max[2] >= options.z - radius && record.min[2] <= options.z + radius;
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
    group.add(linesOf(positions, color, true), linesOf(positions, color, false));
  };
  if (lists !== 'shells') add(world.getObstacles?.() ?? [], MOVEMENT_COLOR, 'movement');
  if (lists !== 'movement') add(world.getColliders?.() ?? [], SHELL_COLOR, 'shells');
  scene.add(group);
  const legend = options.legend === false ? null : showLegend();
  return {
    object: group,
    records,
    remove() {
      legend?.remove();
      scene.remove(group);
      group.traverse((object) => {
        const lines = object as THREE.LineSegments;
        lines.geometry?.dispose?.();
        (lines.material as THREE.Material | undefined)?.dispose?.();
      });
    },
  };
}
