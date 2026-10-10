// src/world/rubbleCollision.ts — a rubble pile's colliders from its drawn chunks (the hitbox lane, round 3, 2026-10-09).
//
// A map-dressing pile (props.ts addRubblePile) is 6-10 masonry chunks heaped in a cone of radius pr, an apron of brick
// shards round it and sometimes a charred beam. Its records were one circle prism of radius pr to 0.7 pr over the whole
// cone: the overshoot census (collider against the drawn mesh, record by record) measured 92 % of the shell rays a pile
// stopped stopping more than 0.3 m from any chunk, and 80 % of its contact-band area empty.
//
// The records now come from the chunks the pile draws, so a heap drawn differently carries its hitbox with it:
//   shells   each chunk that stands past the floor, in slabs of RUBBLE_SHELL_SLAB_M (slabCollision.ts: the chunk's hull
//            cut level by level, so a leaning slab of wall leans in its record);
//   movement each such chunk's outline from the ground to its top: a crush trigger (a pile is crushable clutter, crushed
//            by any hull on contact, crushableClutter.ts), so it meets a hull where the hull meets a chunk.
// The apron's shards and the beam carry none: a shard lies under the floor, and a 14 cm beam is no cover.
// Pure and deterministic: the chunks' own vertices, no randomness.
import type { BufferGeometry } from 'three';
import { setCircleShape, setCompoundShape, type CollisionRecord, type SimpleCollisionShape } from './collision.ts';
import { convexSlabs, slabParts } from './slabCollision.ts';

/** The tallest shell slab of a chunk (m). */
export const RUBBLE_SHELL_SLAB_M = 0.5;
/** A chunk whose top stands less than this over the pile's ground carries no record (a hull rolls over it). */
export const RUBBLE_CHUNK_FLOOR_M = 0.2;
/** Corners a chunk's slab keeps at most. */
const RUBBLE_CORNERS = 6;

/** A pile's movement and shell records: kind 'rubble', from its chunks (world-space geometries). With no chunk past the
 * floor, the legacy circle (a pile always carries its records, so crushing it reads the same everywhere). */
export function rubbleCollisionRecords(
  chunks: readonly BufferGeometry[], groundY: number, x: number, z: number, pr: number,
): { obstacle: CollisionRecord; collider: CollisionRecord } {
  const move: SimpleCollisionShape[] = [], shell: SimpleCollisionShape[] = [];
  let top = groundY;
  for (const chunk of chunks) {
    const position = chunk.getAttribute('position');
    if (!position) continue;
    const points: number[] = [];
    let chunkTop = -Infinity;
    for (let i = 0; i < position.count; i++) {
      const py = position.getY(i);
      points.push(position.getX(i), py, position.getZ(i));
      if (py > chunkTop) chunkTop = py;
    }
    if (!(chunkTop >= groundY + RUBBLE_CHUNK_FLOOR_M)) continue;
    const slabs = convexSlabs(points, RUBBLE_SHELL_SLAB_M, RUBBLE_CORNERS);
    if (!slabs.length) continue;
    shell.push(...slabParts(slabs));
    // the chunk's outline (its whole hull, one slab) from the ground to its top
    const outline = convexSlabs(points, Infinity, RUBBLE_CORNERS)[0];
    if (outline) move.push(...slabParts([{ points: outline.points, y0: Math.round(groundY * 100) / 100, y1: outline.y1 }]));
    top = Math.max(top, chunkTop);
  }
  const record = (): CollisionRecord => ({ min: [x - pr, groundY, z - pr], max: [x + pr, groundY + pr * 0.7, z + pr], kind: 'rubble' });
  if (!shell.length || !move.length) {
    const obstacle = setCircleShape(record(), x, z, pr), collider = setCircleShape(record(), x, z, pr);
    return { obstacle, collider };
  }
  const obstacle = setCompoundShape(record(), move), collider = setCompoundShape(record(), shell);
  for (const [rec, parts] of [[obstacle, move], [collider, shell]] as const) {
    rec.min[1] = Math.min(...parts.map((part) => part.y0 ?? groundY));
    rec.max[1] = Math.max(...parts.map((part) => part.y1 ?? top));
  }
  return { obstacle, collider };
}
