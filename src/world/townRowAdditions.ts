// src/world/townRowAdditions.ts — rows a recorded settlement never held (props.townRowPlanAdditions), replayed after the
// recorded rows from streams of their own (the map-revival lane, 2026-10-06, Suzhou Creek's round 2: the lilong lanes'
// shikumen terraces on the district's empty lots). An addition stands only where its plot is clear; this module is that
// test, moved out of props.ts by the maps lane (2026-10-14) so the props pass keeps only its call site.
import { collisionFootprintContainsPoint, type CollisionRecord } from './collision.ts';
import type { TownRowEntry } from './props.ts';

/**
 * A row addition's plot: its corners, edge midpoints and middle 4.5 m off every road's core, and no record inside it
 * (a record's centre in the plot, a crate or a lamp; or its own footprint over the plot's points: a building beside it
 * is judged by its shape, not its turned box). The plot is the row's footprint padded 0.6 m.
 */
export function townRowPlotClear(
  entry: Pick<TownRowEntry, 'x' | 'z' | 'w' | 'd' | 'rot'>,
  roadDist: (x: number, z: number) => number,
  obstacles: readonly CollisionRecord[],
): boolean {
  const c = Math.cos(entry.rot), sn = Math.sin(entry.rot), hw = entry.w / 2 + 0.6, hd = entry.d / 2 + 0.6;
  const local = (x: number, z: number): [number, number] => { const dx = x - entry.x, dz = z - entry.z; return [dx * c - dz * sn, dx * sn + dz * c]; };
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0], [0, 0]]) {
    const lx = a * hw, lz = b * hd, x = entry.x + lx * c + lz * sn, z = entry.z - lx * sn + lz * c;
    if (roadDist(x, z) < 4.5) return false;
  }
  const ex = Math.abs(c) * hw + Math.abs(sn) * hd, ez = Math.abs(sn) * hw + Math.abs(c) * hd;
  const pts: Array<[number, number]> = [];
  for (let a = -hw; a <= hw + 1e-6; a += hw / Math.max(1, Math.round(hw / 0.75))) for (let b = -hd; b <= hd + 1e-6; b += hd / Math.max(1, Math.round(hd / 0.75))) {
    pts.push([entry.x + a * c + b * sn, entry.z - a * sn + b * c]);
  }
  return !obstacles.some((o) => {
    if (o.dead || o.max[0] < entry.x - ex || o.min[0] > entry.x + ex || o.max[2] < entry.z - ez || o.min[2] > entry.z + ez) return false;
    const [lx, lz] = local((o.min[0] + o.max[0]) / 2, (o.min[2] + o.max[2]) / 2);
    if (Math.abs(lx) < hw && Math.abs(lz) < hd) return true;
    return pts.some(([x, z]) => collisionFootprintContainsPoint(o, x, z, 0));
  });
}
