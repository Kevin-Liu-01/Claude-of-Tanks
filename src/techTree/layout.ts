// Tech-tree layout: where every node sits and how every connector runs, in grid units, so the screen
// (src/ui/techTree.ts) draws exactly what the receipt checks. Pure, Node-runnable.
//
// Grid units: tier column c (0-based) spans x in [2c, 2c + 1] and its right gutter (2c + 1, 2c + 2); drawn row r spans
// y in [2r, 2r + 1] and the gap under it (2r + 1, 2r + 2). The special lane's rows follow the line lanes' rows.
// A connector runs along its parent's row and enters its child:
//   - from the left, straight when they share a row, else turning in the gutter just before the child (back from
//     the gutter's middle, so the turn stays clear of a sibling's arrowhead);
//   - from above or below at the child's centre when it is a second parent (another parent already enters from the
//     left) and the parent's row is clear up to the child's column;
//   - vertically between rows when parent and child share a tier (a sidegrade stacked under or over its parent).
// First-party: Kevin B. Liu (NOTICE.md).

import type { NationTree, TreeNode } from './model.ts';

export interface GridPoint {
  readonly x: number;
  readonly y: number;
}

export interface TreeEdge {
  readonly parent: string;
  readonly child: string;
  /** The polyline from the parent's edge to the child's edge. */
  readonly points: readonly GridPoint[];
}

export interface TreeLayout {
  readonly lineLanes: number;
  readonly specialLanes: number;
  /** Drawn row of every node: its lane, or for a special the line lanes plus its lane. */
  readonly rowOf: ReadonlyMap<string, number>;
  readonly edges: readonly TreeEdge[];
}

const cellLeft = (tier: number): number => 2 * (tier - 1);

export function layoutTree(tree: NationTree): TreeLayout {
  const lineNodes = tree.nodes.filter((node) => node.slot === 'line');
  const specialNodes = tree.nodes.filter((node) => node.slot === 'special');
  const lineLanes = 1 + Math.max(0, ...lineNodes.map((node) => node.lane));
  const specialLanes = specialNodes.length ? 1 + Math.max(0, ...specialNodes.map((node) => node.lane)) : 0;
  const rowOf = new Map(tree.nodes.map((node) => [node.id, node.slot === 'special' ? lineLanes + node.lane : node.lane]));
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  const occupied = new Set(tree.nodes.map((node) => `${rowOf.get(node.id)}:${node.tier}`));
  const rowClear = (row: number, from: number, to: number): boolean => {
    for (let tier = from + 1; tier <= to; tier++) if (occupied.has(`${row}:${tier}`)) return false;
    return true;
  };
  const columnClear = (tier: number, fromRow: number, toRow: number): boolean => {
    const [a, b] = fromRow < toRow ? [fromRow, toRow] : [toRow, fromRow];
    for (let row = a + 1; row < b; row++) if (occupied.has(`${row}:${tier}`)) return false;
    return true;
  };

  const edges: TreeEdge[] = [];
  for (const child of tree.nodes) {
    const parents = child.parents.map((id) => byId.get(id)).filter((node): node is TreeNode => !!node);
    const cr = rowOf.get(child.id)!;
    const leftEntry = parents.find((parent) => rowOf.get(parent.id) === cr && parent.tier < child.tier)
      ?? parents.find((parent) => parent.tier < child.tier);
    for (const parent of parents) {
      const pr = rowOf.get(parent.id)!;
      const cx = cellLeft(child.tier);
      let points: GridPoint[];
      if (parent.tier === child.tier) {
        const x = cx + 0.5;
        points = cr > pr ? [{ x, y: 2 * pr + 1 }, { x, y: 2 * cr }] : [{ x, y: 2 * pr }, { x, y: 2 * cr + 1 }];
      } else {
        const x1 = cellLeft(parent.tier) + 1;
        const y1 = 2 * pr + 0.5;
        const y2 = 2 * cr + 0.5;
        if (pr === cr) {
          points = [{ x: x1, y: y1 }, { x: cx, y: y2 }];
        } else if (parent !== leftEntry && rowClear(pr, parent.tier, child.tier) && columnClear(child.tier, pr, cr)) {
          const ex = cx + 0.5;
          points = [{ x: x1, y: y1 }, { x: ex, y: y1 }, { x: ex, y: cr > pr ? 2 * cr : 2 * cr + 1 }];
        } else {
          // the turn sits back from the gutter's middle, clear of a sibling's arrowhead entering the same column
          const gx = cx - 0.62;
          points = [{ x: x1, y: y1 }, { x: gx, y: y1 }, { x: gx, y: y2 }, { x: cx, y: y2 }];
        }
      }
      edges.push({ parent: parent.id, child: child.id, points });
    }
  }
  return { lineLanes, specialLanes, rowOf, edges };
}

interface Segment {
  readonly a: GridPoint;
  readonly b: GridPoint;
  readonly edge: TreeEdge;
}

const EPS = 1e-6;

function segmentsOf(edge: TreeEdge): Segment[] {
  const out: Segment[] = [];
  for (let i = 1; i < edge.points.length; i++) out.push({ a: edge.points[i - 1], b: edge.points[i], edge });
  return out;
}

/** True when the open segment passes through the inside of the cell (touching its edge does not count). */
function segmentEntersCell(segment: Segment, tier: number, row: number): boolean {
  const x0 = cellLeft(tier), x1 = x0 + 1, y0 = 2 * row, y1 = y0 + 1;
  const minX = Math.min(segment.a.x, segment.b.x), maxX = Math.max(segment.a.x, segment.b.x);
  const minY = Math.min(segment.a.y, segment.b.y), maxY = Math.max(segment.a.y, segment.b.y);
  return maxX > x0 + EPS && minX < x1 - EPS && maxY > y0 + EPS && minY < y1 - EPS;
}

/** Where two axis-aligned segments of different parents meet away from a shared endpoint. */
function segmentsConflict(p: Segment, q: Segment): string | null {
  const pv = Math.abs(p.a.x - p.b.x) < EPS, qv = Math.abs(q.a.x - q.b.x) < EPS;
  const range = (u: number, v: number): [number, number] => (u < v ? [u, v] : [v, u]);
  if (pv === qv) {
    // Collinear overlap.
    const same = pv ? Math.abs(p.a.x - q.a.x) < EPS : Math.abs(p.a.y - q.a.y) < EPS;
    if (!same) return null;
    const [p0, p1] = pv ? range(p.a.y, p.b.y) : range(p.a.x, p.b.x);
    const [q0, q1] = pv ? range(q.a.y, q.b.y) : range(q.a.x, q.b.x);
    return Math.min(p1, q1) - Math.max(p0, q0) > EPS ? 'overlap' : null;
  }
  const [v, h] = pv ? [p, q] : [q, p];
  const x = v.a.x, y = h.a.y;
  const [vy0, vy1] = range(v.a.y, v.b.y);
  const [hx0, hx1] = range(h.a.x, h.b.x);
  const inside = (value: number, lo: number, hi: number) => value > lo + EPS && value < hi - EPS;
  return inside(y, vy0, vy1) && inside(x, hx0, hx1) ? 'crossing' : null;
}

/**
 * Every drawing fault of a tree, as messages (empty when the tree reads cleanly): a connector through another node,
 * and connectors of different parents that cross or run on top of each other.
 */
export function layoutProblems(tree: NationTree, layout: TreeLayout = layoutTree(tree)): string[] {
  const problems: string[] = [];
  const cells = tree.nodes.map((node) => ({ id: node.id, tier: node.tier, row: layout.rowOf.get(node.id)! }));
  const segments = layout.edges.flatMap(segmentsOf);
  for (const segment of segments) {
    for (const cell of cells) {
      if (cell.id === segment.edge.parent || cell.id === segment.edge.child) continue;
      if (segmentEntersCell(segment, cell.tier, cell.row)) {
        problems.push(`${segment.edge.parent} -> ${segment.edge.child} runs through ${cell.id}`);
      }
    }
  }
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const p = segments[i], q = segments[j];
      if (p.edge.parent === q.edge.parent) continue;
      const conflict = segmentsConflict(p, q);
      if (conflict) problems.push(`${p.edge.parent} -> ${p.edge.child} and ${q.edge.parent} -> ${q.edge.child}: ${conflict}`);
    }
  }
  return [...new Set(problems)];
}
