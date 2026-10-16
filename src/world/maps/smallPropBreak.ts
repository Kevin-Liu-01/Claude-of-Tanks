// src/world/maps/smallPropBreak.ts — the small dressing props' break path (Lane C, PRP-02, 2026-10-15; the owner, 10-12:
// "make sure all props below a certain size are destructible whether from ramming or shooting").
//
// The census (every map's collision records and the dressing the props draw with none): under the size limit (a
// footprint of 4.5 m and 3 m tall) every kinded record already broke — crushable, a tree or a structure — and the solid
// ones left were the rocks (terrain). What did not break was dressing drawn in the merged buckets with no record at
// all, so a hull drove through it: the yards' pallets, drums, crate stacks, cable drums, skips, tyres and fuel tanks, the
// rail yard's buffer stops, cable reels and sleeper stacks, the rivers' ford markers and the hauled boats' stakes, the
// coastal buoys, the street lamps. Each now takes the crushable clutter path the coal heaps and the hedgehogs take
// (crushableClutter.ts): a record over its drawn footprint — a hull meets it and crushes it, a round passes and breaks
// it — and when it breaks its own pieces collapse where they stand inside their merged buckets: no draw more, no
// frame cost. The records join the destructibles after every ordinary prop (props.ts), so the network's prop
// identities stay where they were.
//
// Authored by Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { CrushableClutter, type ClutterKind } from '../crushableClutter.ts';
import { cloneCollisionRecord, convexHull2, setConvexShape, type CollisionRecord } from '../collision.ts';

/** The sinks a dressing pass hands its records to (the dressing context's: absent in the receipts' bare builds). */
export interface SmallPropSinks {
  obstacles?: CollisionRecord[];
  colliders?: CollisionRecord[];
  clutter?: (clutter: CrushableClutter) => void;
}

/** The size limit the census held the props to (m): a footprint's longer side and the height. */
export const SMALL_PROP_SIDE_M = 4.5;
export const SMALL_PROP_HEIGHT_M = 3.0;

/**
 * Give one small prop, drawn as `pieces` (already in their buckets, world placed), its break path: a convex record over
 * the pieces' footprint from their lowest to their highest point, in both sinks, owned by a clutter of `kind` that
 * collapses those pieces when it breaks. Without a clutter sink (a bare build) the record still stands, solid. Returns
 * the record, or null when the pieces are empty.
 */
export function breakableSmallProp(kind: ClutterKind, pieces: readonly THREE.BufferGeometry[], sinks: SmallPropSinks | null | undefined): CollisionRecord | null {
  if (!sinks || !pieces.length) return null;
  const points: Array<[number, number]> = [];
  let low = Infinity, high = -Infinity;
  for (const g of pieces) {
    const p = g.getAttribute('position');
    if (!p) continue;
    // (a stride over big pieces: the hull of a sample is the hull within a few centimetres)
    const stride = Math.max(1, Math.floor(p.count / 400));
    for (let i = 0; i < p.count; i += stride) {
      points.push([p.getX(i), p.getZ(i)]);
      low = Math.min(low, p.getY(i)); high = Math.max(high, p.getY(i));
    }
  }
  if (points.length < 3 || !(high > low)) return null;
  const hull = convexHull2(points);
  const record = setConvexShape({ min: [0, low, 0], max: [0, high, 0], kind }, hull);
  const shell = cloneCollisionRecord(record);
  sinks.obstacles?.push(record);
  sinks.colliders?.push(shell);
  if (sinks.clutter) {
    let cx = 0, cz = 0;
    for (const [x, z] of points) { cx += x; cz += z; }
    cx /= points.length; cz /= points.length;
    let r = 0;
    for (const [x, z] of points) r = Math.max(r, Math.hypot(x - cx, z - cz));
    const clutter = new CrushableClutter(kind, cx, low, cz, r, high - low, [record], [shell]);
    for (const g of pieces) clutter.ownPiece(g);
    sinks.clutter(clutter);
  }
  return record;
}
