// src/world/maps/craftAnatomy.ts — the fracture anatomy of a light structure built part by part (E1, the props census,
// 2026-10-14; the looks lane).
//
// The light kinds (structureKit.ts: the huts, sheds, tents and posts) are built as a list of parts, each a small
// geometry painted and pushed in order, then merged into the one build the pool draws (mergeConnectedStructure). A kind
// that breaks by its pieces (fractureAnatomy.ts KitFractureAnatomy: the live break takes it apart, FractureSettle lays its
// settled wreck) needs those pieces named: which runs of the merged build are a post, a wall panel, the roof. This file
// is that naming, kept beside the build:
//  - `piece(geo, spec, group?)` tags a part with its role and material as it is built (consecutive parts with the same
//    group, a wall panel's boards and battens, are one piece);
//  - `craftAnatomy(kind, parts, bucket)` reads the tags off the parts in their merge order and returns the anatomy: each
//    piece's contiguous triangle run, its box (axis-aligned, or the part's own axes when it was built turned), its mass
//    from its box and material, the scores a long member snaps at, the anchors (what stands on the ground: footings,
//    slabs, and the feet of posts and walls), and the links (parts whose boxes meet within 2 cm), so every piece is held
//    by a path to an anchor (checkKitFracture).
// THREE only for the geometry it reads.

import * as THREE from 'three';
import type { FractureMaterial } from '../destructionKit.ts';
import type { FractureFace, FractureLink, FractureLinkKind, FracturePiece, FractureRole, KitFractureAnatomy, Vec3 } from '../fractureAnatomy.ts';

export interface CraftPieceSpec {
  role: FractureRole;
  material: FractureMaterial;
  face?: FractureFace;
  /** Stands whatever happens (a footing, a slab on the ground); by default a piece whose foot is on the ground and whose
   *  role stands (a post, a stud, a wall, a footing, a slab) is one. `false` keeps a grounded piece loose (a crate). */
  anchor?: boolean;
  /** Where it snaps, signed metres from its centre along its longest axis (default: a long member snaps once or twice). */
  scores?: readonly number[];
}

interface Tag { spec: CraftPieceSpec; group: string | null; axes: THREE.Quaternion | null }

const TAG = 'craftPiece';

/** Tags a part with its piece (in place); parts with the same `group` next to each other in the build are one piece. */
export function piece<T extends THREE.BufferGeometry>(geo: T, spec: CraftPieceSpec, group: string | null = null, axes: THREE.Quaternion | null = null): T {
  const tag: Tag = { spec, group, axes };
  geo.userData[TAG] = tag;
  return geo;
}

/** The roles that stand on their foot (a grounded one is an anchor). */
const STANDING: ReadonlySet<FractureRole> = new Set(['footing', 'slab', 'post', 'stud', 'wall']);
/** The long members a fall snaps. */
const MEMBERS: ReadonlySet<FractureRole> = new Set(['post', 'stud', 'sill', 'plate', 'girt', 'purlin', 'rafter', 'brace', 'board', 'frame']);
/** kg/m³ of a piece's box by material (a box is mostly air for a frame or a sheet: the fill below). */
const DENSITY: Partial<Record<FractureMaterial, number>> = {
  timber: 520, plank: 480, metal: 7850, canvas: 600, concrete: 2300, brick: 1900, stone: 2500, rubble: 2200, adobe: 1700,
  plaster: 1500, infill: 1300, earth: 1600, thatch: 200, tile: 1800, slate: 2700, glass: 2500,
};
const FILL: Partial<Record<FractureRole, number>> = { wall: 0.18, roof: 0.15, sheet: 0.05, door: 0.35, shutter: 0.35, slab: 0.6, footing: 0.9, bag: 0.9 };
const LINK_KIND: Partial<Record<FractureMaterial, FractureLinkKind>> = {
  timber: 'nail', plank: 'nail', metal: 'bolt', canvas: 'lash', thatch: 'lash', concrete: 'cast', brick: 'mortar', stone: 'mortar',
  rubble: 'mortar', adobe: 'mortar', plaster: 'mortar', earth: 'rest',
};

function triCount(g: THREE.BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}

/**
 * The anatomy of a build merged from `parts` in this order (every part tagged; an untagged part joins the piece before
 * it). `bucket` is the kind's one material bucket. Throws on an untagged first part.
 */
export function craftAnatomy(kind: string, parts: readonly THREE.BufferGeometry[], bucket: string,
  opts: { groundScarM?: number } = {}): KitFractureAnatomy {
  interface Open { spec: CraftPieceSpec; group: string | null; tri0: number; triN: number; geos: THREE.BufferGeometry[]; axes: THREE.Quaternion | null }
  const open: Open[] = [];
  let tri = 0;
  for (const g of parts) {
    const tag = g.userData[TAG] as Tag | undefined;
    const n = triCount(g);
    const last = open[open.length - 1];
    if (!tag || (last && tag.group !== null && tag.group === last.group)) {
      if (!last) throw new Error(`craftAnatomy(${kind}): the first part has no piece`);
      last.triN += n; last.geos.push(g);
    } else {
      open.push({ spec: tag.spec, group: tag.group, tri0: tri, triN: n, geos: [g], axes: tag.axes });
    }
    tri += n;
  }
  const v = new THREE.Vector3();
  const pieces: FracturePiece[] = open.map((o) => {
    // its box: in the part's own axes when it was built turned, else axis-aligned; 1 cm of slack round its corners
    const inv = o.axes ? o.axes.clone().invert() : null;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    let footY = Infinity;
    for (const g of o.geos) {
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        footY = Math.min(footY, v.y);
        if (inv) v.applyQuaternion(inv);
        lo[0] = Math.min(lo[0], v.x); lo[1] = Math.min(lo[1], v.y); lo[2] = Math.min(lo[2], v.z);
        hi[0] = Math.max(hi[0], v.x); hi[1] = Math.max(hi[1], v.y); hi[2] = Math.max(hi[2], v.z);
      }
    }
    const h: [number, number, number] = [0, 1, 2].map((k) => Math.max(0.005, (hi[k] - lo[k]) / 2 + 0.01)) as [number, number, number];
    const local = new THREE.Vector3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
    if (o.axes) local.applyQuaternion(o.axes);
    const q = o.axes ? [o.axes.x, o.axes.y, o.axes.z, o.axes.w] as const : [0, 0, 0, 1] as const;
    const axis = h[0] >= h[1] && h[0] >= h[2] ? 0 : h[1] >= h[2] ? 1 : 2;
    const L = h[axis];
    const scores = o.spec.scores ?? (MEMBERS.has(o.spec.role) && L > 0.6 ? (L > 1.4 ? [-0.32 * L, 0.27 * L] : [0.18 * L]) : []);
    const vol = 8 * h[0] * h[1] * h[2];
    const massKg = Math.max(0.5, vol * (DENSITY[o.spec.material] ?? 600) * (FILL[o.spec.role] ?? 0.7));
    const grounded = footY <= 0.03;
    const anchor = o.spec.anchor ?? (grounded && STANDING.has(o.spec.role));
    return {
      role: o.spec.role, material: o.spec.material, bucket, tri0: o.tri0, triN: o.triN,
      c: [local.x, local.y, local.z] as Vec3, h: h as Vec3, q, massKg: Math.round(massKg * 10) / 10,
      ...(anchor ? { anchor: true as const } : {}),
      ...(o.spec.face ? { face: o.spec.face } : {}),
      ...(scores.length ? { scoreAxis: axis as 0 | 1 | 2, scores: scores.filter((s) => Math.abs(s) < L).slice(0, 6) } : {}),
    };
  });
  // the links: every pair of pieces whose world boxes meet within 2 cm, by the softer material's joint
  const boxes = open.map((o) => new THREE.Box3().setFromBufferAttribute(o.geos[0].getAttribute('position') as THREE.BufferAttribute))
    .map((b, k) => { for (const g of open[k].geos.slice(1)) b.union(new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute)); return b.expandByScalar(0.02); });
  const links: FractureLink[] = [];
  for (let a = 0; a < pieces.length; a++) {
    for (let b = a + 1; b < pieces.length; b++) {
      if (!boxes[a].intersectsBox(boxes[b])) continue;
      const soft = pieces[a].material === 'timber' || pieces[a].material === 'plank' ? pieces[b].material : pieces[a].material;
      const kind2 = LINK_KIND[soft] ?? 'rest';
      links.push({ a, b, kind: kind2 });
    }
  }
  return { kind, pieces, links, ...(opts.groundScarM ? { groundScarM: opts.groundScarM } : {}) };
}
