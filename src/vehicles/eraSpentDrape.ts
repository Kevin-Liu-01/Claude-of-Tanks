// Release 227, round 7 (2026-10-18; the critic's UAPL-R5C-4: "With ERA spent and the field suit on, the nets laid over
// the new ERA keep their height and float in the air over the empty bays ... Acceptance 12 says spent captures show
// nothing floating"; the judge's ruling keeps the nets' coverage over the new ERA while it is live): a field suit's
// cloth and garnish that rest on an authored ERA cluster fall onto the permanent stock behind it when that cluster is
// spent (tankFactoryCore stripEra), and come back on resetEra. For each suit vertex the nearest surface of the owner is
// found: a vertex lying on a cluster's module (within 3 cm of it) moves along the module face's inward normal, through
// the module, to the first permanent surface there, keeping its gap (a deck's net falls onto the bay floor, a skirt's
// drape onto the bay's face); a cloth vertex the net held up over a joint (more than 2 cm off everything), or standing in
// a garnish card, follows the nearest moving cloth round it onto the permanent stock in the same direction; a vertex lying
// on the permanent stock stays. The suit's merged meshes repeat a cloth node in every triangle round it: vertices are
// welded by position into nodes, and a node's copies move together. Nothing else moves, so a suit over permanent stock is byte-identical, and the drape
// costs no draw or triangle.
import * as THREE from 'three';

/** The builder port's ERA drape hooks (tankFactoryCore TankBuilderPort.eraClusterAt / bindEraDrape). */
export interface EraDrapePort {
  eraClusterAt(position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, vertex: number): string | null;
  bindEraDrape(plateName: string, position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    indices: ArrayLike<number>, spent: ArrayLike<number>): void;
}

interface Tri { tri: THREE.Triangle; n: THREE.Vector3; cluster: string | null }
const CELL = .06;
/** How close to a module a cloth vertex lies to move with it, and how far off everything a held vertex hangs. */
const REST_M = .03, HANG_M = .02;
/** How close to a module a garnish card's nearest vertex lies for the card to move with it. */
const CARD_REST_M = .05;
/** How far behind a module the permanent stock may lie (no farther: past it the cloth stays as laid). */
const FALL_M = .30;

class OwnerStock {
  private readonly cells = new Map<string, Tri[]>();
  constructor(port: EraDrapePort, parent: THREE.Object3D, others: readonly THREE.Object3D[]) {
    const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert(), skip = new Set(others);
    const visit = (o: THREE.Object3D): void => {
      if (skip.has(o)) return;
      const mesh = o as THREE.Mesh;
      // (the visible stock only: no suit, no shadow proxy or depth-only mesh, no instanced running gear)
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (mesh.isMesh && mesh.visible && !(mesh as THREE.InstancedMesh).isInstancedMesh && !/_ghillie_|^procShadow/.test(mesh.name || '')
        && !mesh.userData?.shadowOnly && !mesh.userData?.authoredShadowProxy && materials.some(m => m?.colorWrite !== false)
        && mesh.geometry?.attributes?.position) {
        const m = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld), pos = mesh.geometry.getAttribute('position'), ix = mesh.geometry.index;
        const n = ix ? ix.count : pos.count;
        for (let i = 0; i + 2 < n; i += 3) {
          const vi = [0, 1, 2].map(k => ix ? ix.getX(i + k) : i + k);
          const tri = new THREE.Triangle(...vi.map(v => new THREE.Vector3().fromBufferAttribute(pos, v).applyMatrix4(m)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3]);
          if (tri.getArea() < 1e-9) continue;
          const box = new THREE.Box3().setFromPoints([tri.a, tri.b, tri.c]);
          const span = box.getSize(new THREE.Vector3()).divideScalar(CELL);
          if ((span.x + 1) * (span.y + 1) * (span.z + 1) > 20000) continue;
          const t: Tri = {tri, n: tri.getNormal(new THREE.Vector3()), cluster: port.eraClusterAt(pos, vi[0])};
          this.cover(box, list => list.push(t));
        }
      }
      for (const child of o.children) visit(child);
    };
    visit(parent);
  }
  private cover(box: THREE.Box3, f: (list: Tri[]) => void, create = true): void {
    for (let x = Math.floor(box.min.x / CELL); x <= Math.floor(box.max.x / CELL); x++)
      for (let y = Math.floor(box.min.y / CELL); y <= Math.floor(box.max.y / CELL); y++)
        for (let z = Math.floor(box.min.z / CELL); z <= Math.floor(box.max.z / CELL); z++) {
          const key = `${x},${y},${z}`;
          let list = this.cells.get(key);
          if (!list) { if (!create) continue; this.cells.set(key, list = []); }
          f(list);
        }
  }
  private near(box: THREE.Box3): Set<Tri> {
    const out = new Set<Tri>();
    this.cover(box, list => { for (const t of list) out.add(t); }, false);
    return out;
  }
  /** The nearest surface to p within `reach`: its distance, its cluster and its outward normal there. */
  nearest(p: THREE.Vector3, reach: number): {d: number; t: Tri; at: THREE.Vector3} | null {
    const cp = new THREE.Vector3();
    let best: {d: number; t: Tri; at: THREE.Vector3} | null = null;
    for (const t of this.near(new THREE.Box3(p.clone().subScalar(reach), p.clone().addScalar(reach)))) {
      t.tri.closestPointToPoint(p, cp);
      const d = cp.distanceTo(p);
      if (d <= reach && (!best || d < best.d)) best = {d, t, at: cp.clone()};
    }
    return best;
  }
  /** The nearest point of the permanent stock within `reach` of p, or null. */
  nearestPermanent(p: THREE.Vector3, reach: number): THREE.Vector3 | null {
    const cp = new THREE.Vector3();
    let best = Infinity, at: THREE.Vector3 | null = null;
    for (const t of this.near(new THREE.Box3(p.clone().subScalar(reach), p.clone().addScalar(reach)))) {
      if (t.cluster !== null) continue;
      t.tri.closestPointToPoint(p, cp);
      const d = cp.distanceTo(p);
      if (d <= reach && d < best) { best = d; at = cp.clone(); }
    }
    return at;
  }
  /** The first permanent surface along a ray within `far`, or null. */
  firstPermanent(o: THREE.Vector3, dir: THREE.Vector3, far: number): THREE.Vector3 | null {
    const box = new THREE.Box3().setFromPoints([o, o.clone().addScaledVector(dir, far)]).expandByScalar(.001);
    const ray = new THREE.Ray(o, dir), hit = new THREE.Vector3();
    let best = Infinity, at: THREE.Vector3 | null = null;
    for (const t of this.near(box)) {
      if (t.cluster !== null) continue;
      if (!ray.intersectTriangle(t.tri.a, t.tri.b, t.tri.c, false, hit)) continue;
      const d = hit.distanceTo(o);
      if (d > 1e-5 && d <= far && d < best) { best = d; at = hit.clone(); }
    }
    return at;
  }
}

/** Bind every suit mesh of each owner to the clusters its cloth and garnish rest on. */
export function drapeSuitOverSpentEra(port: EraDrapePort, owners: readonly (readonly [THREE.Object3D, readonly THREE.Object3D[]])[]): void {
  for (const [parent, others] of owners) {
    parent.updateMatrixWorld(true);
    const suits = parent.children.filter((o): o is THREE.Mesh => (o as THREE.Mesh).isMesh && /_ghillie_/.test(o.name || ''));
    if (!suits.length) continue;
    const stock = new OwnerStock(port, parent, others), inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
    for (const mesh of suits) {
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute, ix = mesh.geometry.index;
      const toOwner = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld), toMesh = toOwner.clone().invert();
      // the cloth's nodes: its vertices welded by position (a suit's merged mesh repeats a node in every triangle round it)
      const nodeOf = new Int32Array(pos.count), weld = new Map<string, number>(), p: THREE.Vector3[] = [], members: number[][] = [];
      for (let v = 0; v < pos.count; v++) {
        const key = `${Math.round(pos.getX(v) / 5e-4)},${Math.round(pos.getY(v) / 5e-4)},${Math.round(pos.getZ(v) / 5e-4)}`;
        let k = weld.get(key);
        if (k === undefined) { weld.set(key, k = p.length); p.push(new THREE.Vector3().fromBufferAttribute(pos, v).applyMatrix4(toOwner)); members.push([]); }
        nodeOf[v] = k; members[k].push(v);
      }
      const count = p.length, rest = p.map(q => stock.nearest(q, REST_M + .02));
      // into the module: towards its nearest point (or, lying on its face, against the face's normal)
      const inward = (v: number): THREE.Vector3 => {
        const r = rest[v]!;
        return r.d > .002 ? r.at.clone().sub(p[v]).normalize() : r.t.n.clone().negate();
      };
      // where a node goes when its cluster is spent: along `dir` (into the module) to the permanent stock, `gap` off it
      const target = (v: number, dir: THREE.Vector3, gap: number): THREE.Vector3 | null => {
        const hit = stock.firstPermanent(p[v], dir, FALL_M);
        return hit ? hit.addScaledVector(dir, -Math.max(.002, gap)) : null;
      };
      // a node on a module: the nearest of the permanent stock towards the module's nearest point, against its face's
      // normal (at an edge or a corner of a module the two differ) or, where neither meets any (a skirt's top edge over its
      // own cassettes), the nearest permanent surface round it; with the direction it went
      const onto = (v: number): {to: THREE.Vector3; dir: THREE.Vector3} | null => {
        const r = rest[v]!;
        let best: {to: THREE.Vector3; dir: THREE.Vector3} | null = null;
        for (const dir of [inward(v), r.t.n.clone().negate()]) {
          const to = target(v, dir, r.d);
          if (to && (!best || to.distanceTo(p[v]) < best.to.distanceTo(p[v]))) best = {to, dir};
        }
        if (best) return best;
        const floor = stock.nearestPermanent(p[v], FALL_M);
        if (!floor || floor.distanceTo(p[v]) < 1e-4) return null;
        const away = p[v].clone().sub(floor).normalize();
        return {to: floor.clone().addScaledVector(away, Math.max(.002, Math.min(r.d, .01))), dir: away.negate()};
      };
      // the nodes' pieces (connected through the mesh's triangles) and each node's neighbours
      const root = Int32Array.from({length: count}, (_, i) => i);
      const find = (i: number): number => { while (root[i] !== i) { root[i] = root[root[i]]; i = root[i]; } return i; };
      const n = ix ? ix.count : pos.count, near: Set<number>[] = Array.from({length: count}, () => new Set());
      for (let i = 0; i + 2 < n; i += 3) {
        const t = [0, 1, 2].map(k => nodeOf[ix ? ix.getX(i + k) : i + k]);
        for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3]; if (a === b) continue; near[a].add(b); near[b].add(a); root[find(a)] = find(b); }
      }
      const pieces = new Map<number, number[]>();
      for (let v = 0; v < count; v++) { const r = find(v); let l = pieces.get(r); if (!l) pieces.set(r, l = []); l.push(v); }
      const moved = new Map<string, Map<number, THREE.Vector3>>();
      const move = (c: string, v: number, to: THREE.Vector3) => { let m = moved.get(c); if (!m) moved.set(c, m = new Map()); m.set(v, to); };
      for (const nodes of pieces.values()) {
        // the nodes lying on a module move (a garnish card's within 5 cm of it, the cloth's within 3 cm); then, ring by ring
        // (three), a node held up over a joint or standing in a card follows a moving neighbour in its direction onto the
        // permanent stock; a node lying on the permanent stock stays (a card across a module and a frame bends over it)
        // (a card's node stays only where it touches the permanent stock: a card's tip standing a centimetre off a frame
        // plate falls with the card instead of drawing it out into a spike)
        const card = nodes.length <= 24, lie = card ? CARD_REST_M : REST_M, hang = card ? .006 : HANG_M;
        const own = new Map<number, {c: string; dir: THREE.Vector3}>();
        for (const v of nodes) {
          const r = rest[v];
          if (!r || r.t.cluster === null || r.d > lie) continue;
          const go = onto(v);
          if (go) { own.set(v, {c: r.t.cluster, dir: go.dir}); move(r.t.cluster, v, go.to); }
        }
        for (let ring = 0; ring < (card ? 6 : 3); ring++) {
          const add: [number, {c: string; dir: THREE.Vector3}][] = [];
          for (const v of nodes) {
            if (own.has(v) || (rest[v] && rest[v]!.d <= hang)) continue;
            const from = [...near[v]].map(u => own.get(u)).find(x => x !== undefined);
            if (from) add.push([v, from]);
          }
          if (!add.length) break;
          for (const [v, from] of add) {
            const to = target(v, from.dir, .005);
            if (to) { own.set(v, from); move(from.c, v, to); }
          }
        }
      }
      for (const [c, m] of moved) {
        const idx: number[] = [], spent: number[] = [];
        for (const [node, to] of m) {
          const q = to.clone().applyMatrix4(toMesh);
          for (const v of members[node]) { idx.push(v); spent.push(q.x, q.y, q.z); }
        }
        port.bindEraDrape(c, pos, idx, spent);
      }
    }
  }
}
