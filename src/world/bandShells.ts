// src/world/bandShells.ts — a concrete pillbox's shell record from its authored layout (physics stream, 2026-10-16; the
// coordinator: "rounds enter the drawn embrasures and doors"). Its slab shells (rockCollision.ts localShellSlabs: one
// convex hull a level) and its structure's shell bands (each wall span one solid, its hull over the hole) both stopped a
// round on an embrasure's outer face, the drawn throat 0.9-1.05 m deeper: fortKit.ts pillboxShellParts lays its walls
// round its embrasures and its door, the plates at the throats and the roof, as drawn. The log and earth work keeps its
// slabs (props.ts SLAB_SHELL_KINDS).
import { applyStructureCollisionBand, type StructureCollisionRuntimeBand } from './structureCollision.ts';
import type { CollisionRecord, SimpleCollisionShape } from './collision.ts';
import { pillboxShellParts, type PillboxStyle } from './maps/fortKit.ts';

/** A concrete pillbox's shell parts as one band, in its own frame (its base at y = 0); null for the log and earth work. */
export function pillboxShellBand(style: PillboxStyle): StructureCollisionRuntimeBand | null {
  const parts = pillboxShellParts(style);
  if (!parts?.length) return null;
  const shapes: SimpleCollisionShape[] = parts.map((part) => {
    let cx = 0, cz = 0;
    for (let i = 0; i < part.points.length; i += 2) { cx += part.points[i]; cz += part.points[i + 1]; }
    const n = part.points.length / 2;
    return { kind: 'convex', cx: cx / n, cz: cz / n, points: part.points.slice(), y0: part.y0, y1: part.y1 };
  });
  return { minY: Math.min(...parts.map((part) => part.y0)), maxY: Math.max(...parts.map((part) => part.y1)), parts: shapes };
}

/** Shape a pooled instance's shell record from its kind's band: turned by yaw, set on its seat (scale 1: a pillbox). */
export function placeLocalShellBand(collider: CollisionRecord, band: StructureCollisionRuntimeBand, x: number, y: number, z: number, yaw: number): void {
  applyStructureCollisionBand(collider, band, x, z, yaw, y);
  collider.min[1] = y + band.minY;
  collider.max[1] = y + band.maxY;
}
