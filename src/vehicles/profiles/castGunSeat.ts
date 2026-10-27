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

/** A pitching mask's seat: a channel `halfWidth` either side of the gun's plane, its back a concave cylinder of
 * `radius` round the trunnion axis (turret frame y `axisY`, z `axisZ`), approximated by `bands` chords. Below `floorY`
 * the back is the vertical wall where the cylinder meets that height: the turret's seat over the deck
 * (turretSeatRace.ts seatTurretOverDeck) lifts the shell's low corners onto its plane, and lifted onto it the wall stays
 * a wall instead of sliding a shelf of the receiver forward under the drum. */
export interface MaskSeat {
  readonly halfWidth: number;
  readonly axisY: number;
  readonly axisZ: number;
  readonly radius: number;
  readonly bands?: number;
  readonly floorY?: number;
}

/**
 * Cut `stock` (a closed cast turret shell, turret frame) for a mask seat and return the pieces that stay: the two
 * cheeks outside the channel (their cut faces are the channel's walls) and, inside it, the shell behind the trunnion
 * plane and outside the receiver cylinder (its chord faces are the receiver the mask's drum turns in). The stock is
 * left untouched; the caller owns and disposes it.
 */
export function cutMaskSeat(stock: THREE.BufferGeometry, seat: MaskSeat): THREE.BufferGeometry[] {
  const { halfWidth: h, axisY: yc, axisZ: zc, radius: r } = seat, bands = seat.bands ?? 24;
  const floorY = Math.max(yc - r, Math.min(yc + r, seat.floorY ?? yc - r));
  const pieces: THREE.BufferGeometry[] = [];
  const push = (g: THREE.BufferGeometry | null) => { if (g) pieces.push(g); };
  push(clipStock(stock, { n: [-1, 0, 0], c: h }));
  push(clipStock(stock, { n: [1, 0, 0], c: h }));
  const left = clipStock(stock, { n: [1, 0, 0], c: -h });
  const column = left && clipStock(left, { n: [-1, 0, 0], c: -h });
  left?.dispose();
  const back = column && clipStock(column, { n: [0, 0, -1], c: -zc });
  column?.dispose();
  if (!back) return pieces;
  // above the receiver's arc the column is whole behind the trunnion plane; below its floor, behind the floor's wall
  push(clipStock(back, { n: [0, 1, 0], c: yc + r }));
  const below = clipStock(back, { n: [0, -1, 0], c: -floorY });
  if (below) { push(clipStock(below, { n: [0, 0, -1], c: -(zc - Math.sqrt(Math.max(0, r * r - (floorY - yc) ** 2))) })); below.dispose(); }
  const aFloor = Math.asin((floorY - yc) / r), span = Math.PI / 2 - aFloor;
  for (let k = 0; k < bands; k++) {
    const a0 = aFloor + (k / bands) * span, a1 = aFloor + ((k + 1) / bands) * span;
    const y0 = yc + r * Math.sin(a0), y1 = yc + r * Math.sin(a1), z0 = zc - r * Math.cos(a0), z1 = zc - r * Math.cos(a1);
    const low = clipStock(back, { n: [0, 1, 0], c: y0 });
    const band = low && clipStock(low, { n: [0, -1, 0], c: -y1 });
    low?.dispose();
    if (!band) continue;
    // keep the side of the chord away from the axis: the chord's normal toward the axis, reversed
    const ny = -(z1 - z0), nz = y1 - y0, len = Math.hypot(ny, nz);
    let my = ny / len, mz = nz / len;
    if (my * (yc - y0) + mz * (zc - z0) > 0) { my = -my; mz = -mz; }
    push(clipStock(band, { n: [0, my, mz], c: my * y0 + mz * z0 }));
    band.dispose();
  }
  back.dispose();
  return pieces;
}
