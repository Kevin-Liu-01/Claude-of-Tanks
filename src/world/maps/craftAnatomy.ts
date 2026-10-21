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

interface CraftPieceSpec {
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
    // a shell (a solid body every way over 0.9 m, its height over 1.2 m: a hut's body block, a tent's canvas mass) breaks
    // across its height at two fifths and three quarters (it settles in bands, lightWreck.ts); a long member along its
    // length once or twice
    const shell = !o.axes && o.geos.length === 1 && Math.min(...h) >= 0.45 && h[1] >= 0.6;
    const axis = shell ? 1 : h[0] >= h[1] && h[0] >= h[2] ? 0 : h[1] >= h[2] ? 1 : 2;
    const L = h[axis];
    const scores = o.spec.scores ?? (shell ? [-0.2 * L, 0.5 * L]
      : MEMBERS.has(o.spec.role) && L > 0.6 ? (L > 1.4 ? [-0.32 * L, 0.27 * L] : [0.18 * L]) : []);
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
  // every piece held: one the links leave loose stands on its own foot if it is grounded, else rests on its nearest held
  // neighbour (a crate set down inside, a sign on its bracket's gap); with no anchor at all, the lowest piece is one
  if (!pieces.some((p) => p.anchor)) {
    let low = 0;
    boxes.forEach((b, k) => { if (b.min.y < boxes[low].min.y) low = k; });
    pieces[low] = { ...pieces[low], anchor: true };
  }
  for (let pass = 0; pass < pieces.length; pass++) {
    const adj: number[][] = pieces.map(() => []);
    for (const l of links) { adj[l.a].push(l.b); adj[l.b].push(l.a); }
    const held = new Uint8Array(pieces.length), queue: number[] = [];
    pieces.forEach((p, k) => { if (p.anchor) { held[k] = 1; queue.push(k); } });
    while (queue.length) for (const o of adj[queue.pop()!]) if (!held[o]) { held[o] = 1; queue.push(o); }
    const loose = pieces.map((_p, k) => k).filter((k) => !held[k]);
    if (!loose.length) break;
    const k = loose[0];
    if (boxes[k].min.y <= 0.07) { pieces[k] = { ...pieces[k], anchor: true }; continue; }
    let best = -1, bestD = Infinity;
    held.forEach((h, j) => { if (!h) return; const d = boxes[k].distanceToPoint(boxes[j].getCenter(new THREE.Vector3())); if (d < bestD) { bestD = d; best = j; } });
    if (best >= 0) links.push({ a: Math.min(k, best), b: Math.max(k, best), kind: 'rest' });
  }
  return { kind, pieces, links, ...(opts.groundScarM ? { groundScarM: opts.groundScarM } : {}) };
}

// ------------------------------------------------------------------------------------------------ pieces read off a craft

interface PartShape {
  geo: THREE.BufferGeometry;
  min: THREE.Vector3;
  max: THREE.Vector3;
  centre: THREE.Vector3;
  /** principal axes (unit) and extents along them, longest first */
  axes: THREE.Vector3[];
  ext: number[];
  role: FractureRole;
}

/** A part's principal axes and extents (its corners' covariance; a box's own axes). */
function shapeOf(geo: THREE.BufferGeometry): PartShape {
  const p = geo.getAttribute('position');
  const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const pts: THREE.Vector3[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    min.min(v); max.max(v);
    const key = `${Math.round(v.x * 500)},${Math.round(v.y * 500)},${Math.round(v.z * 500)}`;
    if (!seen.has(key)) { seen.add(key); pts.push(v); }
  }
  const centre = new THREE.Vector3();
  for (const v of pts) centre.add(v);
  centre.divideScalar(Math.max(1, pts.length));
  // covariance, then its eigenvectors by Jacobi rotations
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const v of pts) {
    const d = [v.x - centre.x, v.y - centre.y, v.z - centre.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i][j] += d[i] * d[j];
  }
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 12; sweep++) {
    for (const [i, j] of [[0, 1], [0, 2], [1, 2]] as const) {
      if (Math.abs(m[i][j]) < 1e-12) continue;
      const th = 0.5 * Math.atan2(2 * m[i][j], m[j][j] - m[i][i]), c = Math.cos(th), s = Math.sin(th);
      for (let k = 0; k < 3; k++) { const a = m[k][i], b = m[k][j]; m[k][i] = c * a - s * b; m[k][j] = s * a + c * b; }
      for (let k = 0; k < 3; k++) { const a = m[i][k], b = m[j][k]; m[i][k] = c * a - s * b; m[j][k] = s * a + c * b; }
      for (let k = 0; k < 3; k++) { const a = V[k][i], b = V[k][j]; V[k][i] = c * a - s * b; V[k][j] = s * a + c * b; }
    }
  }
  const axes = [0, 1, 2].map((k) => new THREE.Vector3(V[0][k], V[1][k], V[2][k]).normalize());
  const ext = axes.map((a) => {
    let lo = Infinity, hi = -Infinity;
    for (const v of pts) { const s = v.clone().sub(centre).dot(a); lo = Math.min(lo, s); hi = Math.max(hi, s); }
    return hi - lo;
  });
  const order = [0, 1, 2].sort((a, b) => ext[b] - ext[a]);
  return { geo, min, max, centre: new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5), axes: order.map((k) => axes[k]), ext: order.map((k) => ext[k]), role: 'fitting' };
}

/**
 * A part's role by its shape: a footing (low on the ground), a post (an upright at least 9 cm across), a wall (a
 * board, batten or sheet standing on a face, or a solid body block from the ground), the roof (a sloped or high flat
 * sheet, or a solid block over the eaves), a slab (a low flat sheet: a floor, a deck), a plate, purlin or brace (a long
 * member lying or raking) or a fitting (everything small).
 */
function roleOf(s: PartShape, top: number): FractureRole {
  const [L, M, T] = s.ext, up = (v: THREE.Vector3): number => Math.abs(v.y);
  if (s.min.y <= 0.05 && s.max.y <= 0.38 && L >= 0.25 && T <= 0.4) return 'footing';
  if (T >= 0.4) {
    // a solid block: the body standing from the ground, its roof mass over the eaves, or a chunky thing (a crate)
    if (s.min.y <= 0.1 && s.max.y >= 1.5) return 'wall';
    if (s.min.y >= top * 0.45 && L >= 1.2) return 'roof';
    return 'fitting';
  }
  if (up(s.axes[0]) >= 0.85 && L >= 0.6 && M >= 0.09 && M <= 0.4) return 'post';
  if (T <= 0.1 && M >= 0.15) {
    const n = up(s.axes[2]);
    if (n >= 0.9) return s.centre.y <= Math.min(1.6, top * 0.5) ? 'slab' : 'roof';
    if (n >= 0.25) return 'roof';
    return 'wall';
  }
  // battens and trims standing on a face: boards of the wall
  if (up(s.axes[0]) >= 0.85 && L >= 0.4 && M < 0.09) return 'wall';
  if (L >= 0.6 && M <= 0.4) return up(s.axes[0]) <= 0.25 ? (s.centre.y >= top * 0.8 ? 'purlin' : 'plate') : 'brace';
  return 'fitting';
}

/**
 * A light craft's parts read into pieces (props #1, the huts' r2 round): each part's role by its shape (roleOf), the
 * wall boards and sheets grouped by their face into panels of at most five, the roof by its slopes, the members one a
 * piece, the small things by where they lie; grouped further where the kind would pass FRACTURE_PIECE_CAP. Returns the
 * parts reordered so each piece is one run, every part tagged (piece()) for craftAnatomy.
 */
export function autoCraftPieces(parts: readonly THREE.BufferGeometry[], material: FractureMaterial, cap = 48): THREE.BufferGeometry[] {
  // (a build that names its own pieces — hutKit's — keeps them: its parts gathered by group in first-seen order)
  if (parts.length && parts.every((g) => g.userData[TAG])) return namedPieces(parts, cap);
  const shapes = parts.map(shapeOf);
  const top = Math.max(...shapes.map((s) => s.max.y));
  for (const s of shapes) s.role = roleOf(s, top);
  // the plan's middle, for the faces
  const mid = new THREE.Vector3();
  for (const s of shapes) mid.add(s.centre);
  mid.divideScalar(Math.max(1, shapes.length));
  const faceOf = (s: PartShape): FractureFace => {
    if (s.role === 'roof') return 'roof';
    if (s.role === 'slab' || s.role === 'footing') return 'floor';
    const dx = s.centre.x - mid.x, dz = s.centre.z - mid.z;
    return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'right' : 'left') : (dz > 0 ? 'front' : 'back');
  };
  // groups: key -> parts (in their build order): a face's boards in panels (1.2 m along it, 1.6 m up), a roof slope in
  // halves, a face's members by role and height band, the small things where they lie
  const groups = new Map<string, PartShape[]>();
  const add = (key: string, s: PartShape): void => { const g = groups.get(key) ?? []; g.push(s); groups.set(key, g); };
  const bin = (v: number, step: number): number => Math.floor((v + 100) / step);
  let solids = 0;
  for (const s of shapes) {
    const face = faceOf(s), along = face === 'front' || face === 'back' ? s.centre.x : s.centre.z;
    // a solid body (every way over 0.9 m) is a piece of its own: a shell that settles in its bands (lightWreck.ts)
    if (s.ext[2] >= 0.9 && s.ext[1] >= 0.9) { add(`solid|${solids++}`, s); continue; }
    if (s.role === 'wall') add(`wall|${face}|${bin(along, 1.2)}|${bin(s.centre.y, 1.6)}`, s);
    else if (s.role === 'roof') {
      const n = s.axes[2], side = Math.abs(n.x) >= Math.abs(n.z) ? `x${s.centre.x >= mid.x ? 1 : -1}` : `z${s.centre.z >= mid.z ? 1 : -1}`;
      add(`roof|${side}|${bin(s.centre.x + s.centre.z, 3)}|${bin(s.centre.y, 1.5)}`, s);
    } else if (s.role === 'fitting') add(`fitting|${bin(s.centre.x, 1.2)}|${bin(s.centre.z, 1.2)}`, s);
    else if (s.role === 'slab') add(`slab|${bin(s.centre.y, 0.25)}|${bin(s.centre.x, 2.5)}|${bin(s.centre.z, 2.5)}`, s);
    else if (s.role === 'post' || s.role === 'footing') add(`${s.role}|${face}|${bin(along, 0.6)}`, s);
    else add(`${s.role}|${face}|${bin(s.centre.y, 0.8)}|${bin(along, 2.4)}`, s);
  }
  // over the cap: the smallest group joins the nearest group of its role on its face, else of its role anywhere
  const list = [...groups.entries()].map(([key, members]) => ({ key, role: key.startsWith('solid|') ? 'solid' as const : members[0].role, face: faceOf(members[0]), members }));
  const centreOf = (g: { members: PartShape[] }): THREE.Vector3 => g.members.reduce((a, s) => a.add(s.centre), new THREE.Vector3()).divideScalar(g.members.length);
  const order: FractureRole[] = ['fitting', 'brace', 'plate', 'purlin', 'wall', 'footing', 'slab', 'post', 'roof'];
  for (const sameFace of [true, false]) {
    for (const role of order) {
      while (list.length > cap) {
        const same = list.filter((g) => g.role === role);
        if (same.length < 2) break;
        same.sort((a, b) => a.members.length - b.members.length);
        let merged = false;
        for (const small of same) {
          const c = centreOf(small);
          let best: typeof small | null = null, bestD = Infinity;
          for (const g of same) {
            if (g === small || (sameFace && g.face !== small.face)) continue;
            const d = centreOf(g).distanceTo(c);
            if (d < bestD) { bestD = d; best = g; }
          }
          if (!best) continue;
          best.members.push(...small.members);
          list.splice(list.indexOf(small), 1);
          merged = true;
          break;
        }
        if (!merged) break;
      }
    }
  }
  // tagged, in piece order (a piece's parts keep their build order)
  const out: THREE.BufferGeometry[] = [];
  list.forEach((g, k) => {
    const face = g.face;
    const role: FractureRole = g.role === 'solid' ? g.members[0].role : g.role;
    const spec: CraftPieceSpec = {
      role, material: role === 'footing' ? 'concrete' : material === 'timber' && (role === 'wall' || role === 'roof') ? 'plank' : material,
      ...(role === 'fitting' ? { anchor: false } : {}),
      ...(face ? { face } : {}),
    };
    for (const s of g.members) out.push(piece(s.geo, spec, `auto-${k}`));
  });
  return out;
}

/**
 * A build's own named pieces (every part tagged with piece(): hutKit names each part's role and group as it builds),
 * gathered into runs by group in the order each group first appears; over the cap, the smallest group joins the nearest
 * group of its role (else the nearest at all). Parts with no group are pieces of their own.
 */
function namedPieces(parts: readonly THREE.BufferGeometry[], cap: number): THREE.BufferGeometry[] {
  interface Group { key: string; role: FractureRole; members: THREE.BufferGeometry[]; centre: THREE.Vector3; tris: number }
  const groups: Group[] = [], byKey = new Map<string, Group>();
  const box = new THREE.Box3(), c = new THREE.Vector3();
  parts.forEach((g, i) => {
    const tag = g.userData[TAG] as Tag;
    const key = tag.group ?? `#${i}`;
    let grp = byKey.get(key);
    if (!grp) { grp = { key, role: tag.spec.role, members: [], centre: new THREE.Vector3(), tris: 0 }; byKey.set(key, grp); groups.push(grp); }
    grp.members.push(g);
    box.setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);
    grp.centre.add(box.getCenter(c));
    grp.tris += triCount(g);
  });
  for (const g of groups) g.centre.divideScalar(g.members.length);
  while (groups.length > cap) {
    const small = groups.reduce((a, b) => (b.tris < a.tris ? b : a));
    let best: Group | null = null, bestD = Infinity;
    for (const sameRole of [true, false]) {
      for (const g of groups) {
        if (g === small || (sameRole && g.role !== small.role)) continue;
        const d = g.centre.distanceTo(small.centre);
        if (d < bestD) { bestD = d; best = g; }
      }
      if (best) break;
    }
    if (!best) break;
    for (const m of small.members) {
      const t = m.userData[TAG] as Tag;
      m.userData[TAG] = { ...t, spec: (best.members[0].userData[TAG] as Tag).spec, group: best.key };
    }
    best.members.push(...small.members);
    best.tris += small.tris;
    groups.splice(groups.indexOf(small), 1);
  }
  return groups.flatMap((g) => g.members);
}
