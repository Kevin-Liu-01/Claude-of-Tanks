// First-party geometric primitive (261, the STB-1 / Type 74 mantlet rebuild): the seat a pitching external mask rides
// in, cut into a closed cast turret shell. The shell keeps its own surface (normals and UVs carried through every cut);
// each cut face is capped, so the cheeks either side of the mask and the receiver behind it are closed armour, never a
// deleted-face hole.
import * as THREE from 'three';

/** A plane n·p = c; `keep` the side n·p >= c. */
interface CutPlane { readonly n: readonly [number, number, number]; readonly c: number }

const EPS = 1e-7;
const keyOf = (p: THREE.Vector3): string => `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`;

interface Corner { p: THREE.Vector3; n: THREE.Vector3; uv: THREE.Vector2 }

/** The closed chains of a set of undirected rim segments (each key met exactly twice), or null when they do not close. */
function rimLoops(links: Map<string, string[]>): string[][] | null {
  const loops: string[][] = [], seen = new Set<string>();
  for (const [start, next] of links) {
    if (next.length !== 2) return null;
    if (seen.has(start)) continue;
    const loop = [start];
    seen.add(start);
    let previous = start, current = next[0];
    while (current !== start) {
      if (seen.has(current) || loop.length > links.size) return null;
      loop.push(current); seen.add(current);
      const [a, b] = links.get(current)!;
      const following = a === previous ? b : a;
      previous = current; current = following;
    }
    loops.push(loop);
  }
  return loops;
}

/**
 * Keep the side n·p >= c of a closed stock and cap the cut. Kept triangles carry their normals and UVs (interpolated
 * where an edge is cut); the cap takes the plane's outward normal (-n) and planar UVs. Returns null when nothing is
 * kept. Each cut contour is triangulated as its own simple polygon (a cast shell sliced by a plane leaves one loop per
 * solid piece); a contour that does not chain falls back to a fan round its centroid.
 */
export function clipStock(source: THREE.BufferGeometry, plane: CutPlane): THREE.BufferGeometry | null {
  const geometry = source.index ? source.toNonIndexed() : source;
  const pos = geometry.getAttribute('position'), nor = geometry.getAttribute('normal'), uvs = geometry.getAttribute('uv');
  const n = new THREE.Vector3(...plane.n).normalize(), c = plane.c;
  const out = { p: [] as number[], n: [] as number[], uv: [] as number[] };
  const rim = new Map<string, THREE.Vector3>(), links = new Map<string, string[]>();
  const corner = (i: number): Corner => ({
    p: new THREE.Vector3().fromBufferAttribute(pos, i),
    n: nor ? new THREE.Vector3().fromBufferAttribute(nor, i) : new THREE.Vector3(),
    uv: uvs ? new THREE.Vector2(uvs.getX(i), uvs.getY(i)) : new THREE.Vector2(),
  });
  const emit = (a: Corner, b: Corner, d: Corner) => {
    for (const k of [a, b, d]) { out.p.push(k.p.x, k.p.y, k.p.z); out.n.push(k.n.x, k.n.y, k.n.z); out.uv.push(k.uv.x, k.uv.y); }
  };
  for (let i = 0; i < pos.count; i += 3) {
    const tri = [corner(i), corner(i + 1), corner(i + 2)], kept: Corner[] = [];
    for (let j = 0; j < 3; j++) {
      const a = tri[j], b = tri[(j + 1) % 3], da = n.dot(a.p) - c, db = n.dot(b.p) - c;
      if (da >= -EPS) kept.push(a);
      if ((da > EPS && db < -EPS) || (da < -EPS && db > EPS)) {
        // the neighbour across this edge walks it the other way: cut it from its lower key so both get the same point
        const [s0, s1, d0, d1] = keyOf(a.p) < keyOf(b.p) ? [a, b, da, db] : [b, a, db, da];
        const t = d0 / (d0 - d1);
        kept.push({ p: s0.p.clone().lerp(s1.p, t), n: s0.n.clone().lerp(s1.n, t).normalize(), uv: s0.uv.clone().lerp(s1.uv, t) });
      }
    }
    if (kept.length < 3) continue;
    for (let j = 1; j + 1 < kept.length; j++) emit(kept[0], kept[j], kept[j + 1]);
    for (let j = 0; j < kept.length; j++) {
      const a = kept[j].p, b = kept[(j + 1) % kept.length].p;
      if (Math.abs(n.dot(a) - c) > 1e-6 || Math.abs(n.dot(b) - c) > 1e-6) continue;
      const ka = keyOf(a), kb = keyOf(b);
      if (ka === kb) continue;
      rim.set(ka, a); rim.set(kb, b);
      if (!links.has(ka)) links.set(ka, []);
      if (!links.has(kb)) links.set(kb, []);
      links.get(ka)!.push(kb); links.get(kb)!.push(ka);
    }
  }
  if (geometry !== source) geometry.dispose();
  if (!out.p.length) return null;
  // the cap, in the plane's own (u, v) frame; outward normal -n
  const u = new THREE.Vector3(Math.abs(n.x) < 0.9 ? 1 : 0, Math.abs(n.x) < 0.9 ? 0 : 1, 0).cross(n).normalize(), v = new THREE.Vector3().crossVectors(n, u);
  const capNormal = n.clone().negate();
  const capTri = (a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3) => {
    const face = b.clone().sub(a).cross(d.clone().sub(a));
    if (face.lengthSq() < 1e-16) return;
    const [p, q, r] = face.dot(capNormal) > 0 ? [a, b, d] : [a, d, b];
    for (const k of [p, q, r]) {
      out.p.push(k.x, k.y, k.z); out.n.push(capNormal.x, capNormal.y, capNormal.z); out.uv.push(k.dot(u), k.dot(v));
    }
  };
  const loops = rimLoops(links);
  if (loops) {
    for (const loop of loops) {
      const ring = loop.map((k) => rim.get(k)!);
      const flat = ring.map((p) => new THREE.Vector2(p.dot(u), p.dot(v)));
      for (const [a, b, d] of THREE.ShapeUtils.triangulateShape(flat, [])) capTri(ring[a], ring[b], ring[d]);
    }
  } else if (rim.size >= 3) {
    const cap = [...rim.values()], center = cap.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(cap.length);
    cap.sort((a, b) => Math.atan2(a.clone().sub(center).dot(v), a.clone().sub(center).dot(u))
      - Math.atan2(b.clone().sub(center).dot(v), b.clone().sub(center).dot(u)));
    for (let i = 0; i < cap.length; i++) capTri(center, cap[i], cap[(i + 1) % cap.length]);
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(out.p, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(out.n, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  return result;
}

/** A plane through the trunnion axis (turret frame y `yc`, z `zc`, along X) keeping the points round the axis at an angle
 * (from +Z toward +Y) of at least `psi` (`atLeast`) or at most `psi`, within half a turn of it. */
function axisPlane(yc: number, zc: number, psi: number, atLeast: boolean): CutPlane {
  const s = atLeast ? 1 : -1, n: [number, number, number] = [0, s * Math.cos(psi), -s * Math.sin(psi)];
  return { n, c: n[1] * yc + n[2] * zc };
}

/** 263 (owner: the mantlets "shaped by the turret shape instead of protruding out"): a pitching mask cut from the cast
 * shell's own nose. The mask is the wedge of the shell round the trunnion axis (turret frame y `axisY`, z `axisZ`) from
 * `bottomPsi` to `topPsi` radians (from +Z toward +Y), within `halfWidth` of the gun's plane and over `floorY`; the
 * fixed casting keeps the shell from `crownPsi` over the top and round behind the axis to straight below it, outside a
 * receiver of `radius` round the axis. Between the two wedges the room the mask pitches in: over its top the caller's
 * groove (japaneseMantlets.ts: the mask's tongue under a lip of the crown), under it `bottomPsi + PI/2`, the depression
 * and a keep. */
export interface ConformalSeat {
  readonly halfWidth: number;
  readonly axisY: number;
  readonly axisZ: number;
  readonly radius: number;
  readonly topPsi: number;
  readonly crownPsi: number;
  readonly bottomPsi: number;
  readonly floorY: number;
  readonly bands?: number;
}

/** The mask (turret frame): the shell's nose inside the channel, between the seat's bottom and top angles and over its
 * floor; every cut capped, so it is a closed casting whose face is the turret's own surface. */
export function conformalMask(stock: THREE.BufferGeometry, seat: ConformalSeat & { readonly maskHalf: number }): THREE.BufferGeometry | null {
  const { maskHalf: h, axisY: yc, axisZ: zc } = seat;
  let piece: THREE.BufferGeometry | null = stock;
  const cut = (plane: CutPlane) => {
    if (!piece) return;
    const next = clipStock(piece, plane);
    if (piece !== stock) piece.dispose();
    piece = next;
  };
  cut({ n: [1, 0, 0], c: -h });
  cut({ n: [-1, 0, 0], c: -h });
  cut(axisPlane(yc, zc, seat.bottomPsi, true));
  cut(axisPlane(yc, zc, seat.topPsi, false));
  cut({ n: [0, 1, 0], c: seat.floorY });
  return piece === stock ? null : piece;
}

/**
 * Cut `stock` (a closed cast turret shell, turret frame) for a conformal mask's seat and return the pieces that stay:
 * the two cheeks outside the channel (their cut faces are the channel's walls) and, inside it, the shell from the seat's
 * crown angle over the top and round behind the axis to straight below it, outside the receiver (`bands` wedges, each's
 * chord face a facet of the receiver). Ahead of the axis below the crown nothing stays: that is the mask's. The stock is
 * left untouched; the caller owns and disposes it.
 */
export function cutConformalSeat(stock: THREE.BufferGeometry, seat: ConformalSeat): THREE.BufferGeometry[] {
  const { halfWidth: h, axisY: yc, axisZ: zc, radius: r } = seat, bands = seat.bands ?? 24;
  const pieces: THREE.BufferGeometry[] = [];
  const push = (g: THREE.BufferGeometry | null) => { if (g) pieces.push(g); };
  push(clipStock(stock, { n: [-1, 0, 0], c: h }));
  push(clipStock(stock, { n: [1, 0, 0], c: h }));
  const left = clipStock(stock, { n: [1, 0, 0], c: -h });
  const column = left && clipStock(left, { n: [-1, 0, 0], c: -h });
  left?.dispose();
  if (!column) return pieces;
  const from = seat.crownPsi, to = 1.5 * Math.PI;
  for (let k = 0; k < bands; k++) {
    const a0 = from + ((to - from) * k) / bands, a1 = from + ((to - from) * (k + 1)) / bands, am = (a0 + a1) / 2;
    const over = clipStock(column, axisPlane(yc, zc, a0, true));
    const wedge = over && clipStock(over, axisPlane(yc, zc, a1, false));
    over?.dispose();
    if (!wedge) continue;
    // outside the receiver: beyond the chord between the wedge's edges at the receiver's radius
    const ny = Math.sin(am), nz = Math.cos(am);
    push(clipStock(wedge, { n: [0, ny, nz], c: ny * yc + nz * zc + r * Math.cos((a1 - a0) / 2) }));
    wedge.dispose();
  }
  column.dispose();
  return pieces;
}
