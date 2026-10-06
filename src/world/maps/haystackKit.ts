// src/world/maps/haystackKit.ts — the field stacks of every region (the scenery lane, b15).
//
// Gauntlet wave 106 on the field haystack (inhabitKit's nine-sided cone, r 1.9 m x h 2.5 m, scattered on every map
// that had no word on it): "a bare textureless dark cone … a leftover debug marker". A stack is a region's own build:
//
//   - the stog (Russia, Ukraine, the Tatra): tall and rounded, built up round a central pole whose tip stands out, the
//     hay raked down its sides in locks from the pole to the foot;
//   - the plast (the Balkans, Dalmatia): the same build, smaller;
//   - the hooiberg (the Dutch polders): a square stack under a thatched pyramid roof that slides on four tall poles;
//   - the meule (France: Lorraine, Normandy, Brittany): a broad drum of hay drawn up into a dome, a twist of straw at its
//     top;
//   - the Diemen (Germany: Hesse, the Eifel): a long rick, its walls drawn down, a rounded thatched ridge, hipped ends;
//   - the Bengal and Mekong pole stack: sceneryKit's strawstack (rice straw round a bamboo pole).
//
// Every one is hay over a settled foot: a skirt of loose hay pressed into the ground round it, the stack's face drawn
// down in locks (hayPrint.ts: the face band, v from the foot up), a roof or a ridge thatched (the thatch band), its
// poles grey timber (the wood band), and its outline ragged: the silhouette broken by locks and tufts, never a turned
// solid. The stook keeps its teepee of sheaves, each now a bound sheaf with splayed butts and a head of ears.
// One geometry a kind (a destructible pool draws it for every stack of the kind on the map): position, normal, uv.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HAY_FACE_V, HAY_PACKED_V, HAY_THATCH_V, HAY_WOOD_V } from '../hayPrint.ts';
import type { DestructiblePropType } from './inhabitKit.ts';

type Rng = () => number;

/** The region's field stack a map draws (props haystackStyle; 'none' draws none, 'haystack' the legacy cone). */
export type HaystackStyle = 'stog' | 'plast' | 'hooiberg' | 'meule' | 'diemen' | 'strawstack' | 'haystack' | 'none';

/** One lattice cell of a periodic noise round a stack (angle) and up it. */
function noiseTable(rng: Rng, n: number): Float32Array {
  const t = new Float32Array(n * n);
  for (let i = 0; i < t.length; i++) t[i] = rng();
  return t;
}
function sampleTable(t: Float32Array, n: number, a: number, b: number): number {
  const x = ((a % 1) + 1) % 1 * n, y = Math.max(0, b) * n;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const at = (i: number, j: number) => t[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
  return top + (at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx - top) * sy;
}

/** A point of a turned profile: its radius, its height, its v in the print, and how ragged the hay is there (m). */
type ProfilePoint = readonly [r: number, y: number, v: number, rag: number];

/**
 * A turned stack: the profile round the vertical, `segs` round, its radius broken by a periodic noise of the angle and
 * the height (lumps at a metre's scale, locks and tufts at a hand's), u round it in tiles of about four metres. The seam
 * column's normals are the mean of its two sides' (no lighting seam where u wraps).
 *
 * (b21; gauntlet wave 139 on the stog: "a perfectly smooth, symmetric beehive silhouette with uniform vertical grooves,
 * so it reads as a sculpted object rather than loose, combed hay") a stack built by hand (`hand`) is no solid of
 * revolution: one side slumped fuller than the other through its belly (the crown still on its pole), the hay raked down
 * in a slight twist, locks standing proud of the skin here and there; `hand` the reach its record gives it, which no
 * vertex passes. Every number from the stack's own noise tables — no draw more from the stream (every later pool keeps
 * its geometry).
 */
function turn(profile: readonly ProfilePoint[], segs: number, rng: Rng, tilesU: number, hand: number | false = false): THREE.BufferGeometry {
  const lumps = noiseTable(rng, 8), locks = noiseTable(rng, 24);
  const rows = profile.length, cols = segs + 1;
  const pos = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2), index: number[] = [];
  let top = 0;
  for (const p of profile) top = Math.max(top, p[1]);
  // the slump's side and its depth, the twist, from the tables already drawn
  const slumpA = lumps[3] * Math.PI * 2, slump = hand ? 0.05 + lumps[11] * 0.06 : 0, sway = hand ? 0.05 + lumps[19] * 0.07 : 0;
  const twist = hand ? (lumps[27] - 0.5) * 0.14 : 0;
  for (let k = 0; k < rows; k++) {
    const [r, y, v, rag] = profile[k];
    const yN = top > 0 ? Math.min(1, Math.max(0, y / top)) : 0, belly = Math.sin(Math.PI * yN);
    for (let j = 0; j < cols; j++) {
      const t = (j % segs) / segs, a = t * Math.PI * 2;
      const wobble = (sampleTable(lumps, 8, t, y * 0.35) - 0.5) * 2 * 0.06 * r + (sampleTable(locks, 24, t * 3, y * 1.6) - 0.5) * 2 * rag;
      let rr = Math.max(0.02, r + wobble);
      let ox = 0, oz = 0;
      if (hand) {
        // the fuller side through the belly, and the belly swayed toward it; a lock proud of the skin here and there
        rr *= 1 + slump * Math.cos(a - slumpA) * belly;
        ox = Math.cos(slumpA) * sway * belly; oz = Math.sin(slumpA) * sway * belly;
        const lock = locks[(k * 7 + (j % segs) * 13) % (24 * 24)];
        if (yN > 0.12 && yN < 0.92 && lock > 0.9) rr += (lock - 0.9) * 1.2 * Math.min(1, r);
      }
      const o = (k * cols + j) * 3;
      let px = Math.cos(a) * rr + ox, pz = Math.sin(a) * rr + oz;
      if (hand) { const d = Math.hypot(px, pz); if (d > hand) { px *= hand / d; pz *= hand / d; } }
      pos[o] = px; pos[o + 1] = y; pos[o + 2] = pz;
      uv[(k * cols + j) * 2] = (j / segs) * tilesU + twist * y; uv[(k * cols + j) * 2 + 1] = v;
    }
  }
  for (let k = 0; k < rows - 1; k++) for (let j = 0; j < segs; j++) {
    const a = k * cols + j, b = a + 1, c = a + cols, d = c + 1;
    index.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let k = 0; k < rows; k++) {
    const a = k * cols, b = a + segs;
    const x = n.getX(a) + n.getX(b), yy = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, yy, z) || 1;
    n.setXYZ(a, x / l, yy / l, z / l); n.setXYZ(b, x / l, yy / l, z / l);
  }
  return g;
}

/** A band's v at a share of its height (0 its start, 1 its end). */
const bandV = (band: readonly [number, number], t: number) => band[0] + (band[1] - band[0]) * Math.min(1, Math.max(0, t));

/** Each triangle wound to face away from `centre` (a convex part's own inside), its normals recomputed. */
function faceOutward(g: THREE.BufferGeometry, centre: THREE.Vector3): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute, idx = g.index!.array as ArrayLike<number> & { [i: number]: number };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    a.fromBufferAttribute(p, idx[t]); b.fromBufferAttribute(p, idx[t + 1]); c.fromBufferAttribute(p, idx[t + 2]);
    n.subVectors(b, a).cross(m.subVectors(c, a));
    m.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(centre);
    if (n.dot(m) < 0) { const k = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = k; }
  }
  g.computeVertexNormals();
  return g;
}

/**
 * An existing straw part's print moved into one band of the hay print: its v (0 to its largest) laid along the band,
 * its u as it was (every band is periodic along u).
 */
export function mapToBand<T extends THREE.BufferGeometry>(g: T, band: readonly [number, number]): T {
  const uv = g.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv) return g;
  let top = 1e-6;
  for (let i = 0; i < uv.count; i++) top = Math.max(top, uv.getY(i));
  for (let i = 0; i < uv.count; i++) uv.setY(i, bandV(band, uv.getY(i) / top));
  uv.needsUpdate = true;
  return g;
}

/** A timber pole (the wood band, its grain along it): from y0 to y1, leaning by (lx, lz) over its length. */
function pole(r: number, y0: number, y1: number, lx: number, lz: number): THREE.BufferGeometry {
  const len = y1 - y0;
  const g = new THREE.CylinderGeometry(r * 0.85, r, len, 6, 1, true);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.6, bandV(HAY_WOOD_V, uv.getY(i)));
  g.translate(0, y0 + len / 2, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - y0) / len;
    p.setXYZ(i, p.getX(i) + lx * t, p.getY(i), p.getZ(i) + lz * t);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * The settled foot: a skirt of loose hay pressed into the ground round a stack — from inside its foot (under the
 * stack, hidden) out and down to under the ground a hand or two out, ragged, the face band's darkest, pressed foot.
 */
function footSkirt(r: number, out: number, segs: number, rng: Rng, tilesU: number): THREE.BufferGeometry {
  return turn([
    [r * 1.06 + out, -0.06, bandV(HAY_FACE_V, 0), out * 0.35],
    [r * 1.04 + out * 0.55, 0.05, bandV(HAY_FACE_V, 0.02), out * 0.3],
    [r * 1.02, 0.2, bandV(HAY_FACE_V, 0.06), 0.03],
    [r * 0.9, 0.24, bandV(HAY_FACE_V, 0.07), 0.0],
  ], segs, rng, tilesU);
}

/**
 * A rick's settled foot: footSkirt's profile round a rounded rectangle of half extents (hx, hz) — a superellipse —
 * from inside the rick's foot out and down to under the ground `out` beyond it.
 */
function rectSkirt(hx: number, hz: number, out: number, rng: Rng): THREE.BufferGeometry {
  const segs = 36, rows: Array<[number, number, number, number]> = [
    // [offset beyond the outline (m), y, v share of the face band, rag]
    [out * 1.0 + 0.04, -0.06, 0, out * 0.35], [out * 0.55 + 0.03, 0.05, 0.02, out * 0.3], [0.02, 0.2, 0.06, 0.03], [-0.2, 0.24, 0.07, 0],
  ];
  const locks = noiseTable(rng, 24), cols = segs + 1;
  const pos = new Float32Array(rows.length * cols * 3), uv = new Float32Array(rows.length * cols * 2), index: number[] = [];
  const tiles = Math.max(2, Math.round((4 * (hx + hz)) / 4));
  for (let k = 0; k < rows.length; k++) {
    const [off, y, f, rag] = rows[k];
    for (let j = 0; j < cols; j++) {
      const t = (j % segs) / segs, a = t * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), p = 6;
      const ox = hx * Math.sign(c) * Math.pow(Math.abs(c), 2 / p), oz = hz * Math.sign(s) * Math.pow(Math.abs(s), 2 / p);
      const l = Math.hypot(ox, oz) || 1, wob = (sampleTable(locks, 24, t * 3, y * 1.6) - 0.5) * 2 * rag;
      const o = (k * cols + j) * 3;
      pos[o] = ox + (ox / l) * (off + wob); pos[o + 1] = y; pos[o + 2] = oz + (oz / l) * (off + wob);
      uv[(k * cols + j) * 2] = (j / segs) * tiles; uv[(k * cols + j) * 2 + 1] = bandV(HAY_FACE_V, f);
    }
  }
  for (let k = 0; k < rows.length - 1; k++) for (let j = 0; j < segs; j++) {
    const a = k * cols + j, b = a + 1, c = a + cols, d = c + 1;
    index.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const ready = parts.map((part) => {
    const g = part.index ? part.toNonIndexed() : part;
    if (!g.attributes.normal) g.computeVertexNormals();
    return g;
  });
  const merged = mergeGeometries(ready, false);
  if (!merged) throw new Error('haystackKit: merge produced no geometry');
  return merged;
}

/**
 * A stog's (or a plast's) turned body: foot, belly a third of the way up, the shoulder, the crown drawn up round the
 * pole to its tip. Heights and radii in metres.
 */
function stogBody(R: number, H: number, rng: Rng, segs: number, reach: number): THREE.BufferGeometry {
  const belly = R * (1.05 + rng() * 0.06), shoulderY = H * (0.62 + rng() * 0.06), tiles = Math.max(2, Math.round((Math.PI * 2 * belly) / 4));
  // (the hay raked down from the pole to the foot: one face band up the whole stack — a thatched cap read as a hut's
  // roof on the meule, and a stog's crown is its own hay drawn up round the pole)
  const face = (y: number) => bandV(HAY_FACE_V, y / H);
  const crown = face;
  const profile: ProfilePoint[] = [
    [R * 0.96, -0.1, face(0), 0.03],
    [R, 0.12, face(0.12), 0.04],
    [belly * 0.99, H * 0.18, face(H * 0.18), 0.07],
    [belly, H * 0.32, face(H * 0.32), 0.08],
    [belly * 0.97, H * 0.45, face(H * 0.45), 0.09],
    [belly * 0.86, shoulderY, face(shoulderY), 0.11],
  ];
  // the crown: an ogive up round the pole, its hay ragged at the shoulder and the tip
  for (let i = 1; i <= 5; i++) {
    const t = i / 5, y = shoulderY + (H - shoulderY) * t;
    profile.push([belly * 0.86 * Math.pow(1 - t, 0.75) + 0.07, y, crown(y), 0.09 * (1 - t) + 0.03]);
  }
  return turn(profile, segs, rng, tiles, reach);
}

function bStog(rng: Rng): THREE.BufferGeometry {
  const R = 1.75 + rng() * 0.2, H = 4.3 + rng() * 0.5, segs = 18;
  const lean = 0.12;
  return merge([
    stogBody(R, H, rng, segs, 2.25),
    footSkirt(R, 0.32, segs, rng, Math.max(2, Math.round((Math.PI * 2 * R) / 4))),
    pole(0.06, -0.4, H + 0.9 + rng() * 0.4, (rng() - 0.5) * lean, (rng() - 0.5) * lean),
  ]);
}

function bPlast(rng: Rng): THREE.BufferGeometry {
  const R = 1.25 + rng() * 0.15, H = 3.0 + rng() * 0.4, segs = 16;
  return merge([
    stogBody(R, H, rng, segs, 1.6),
    footSkirt(R, 0.24, segs, rng, 2),
    pole(0.05, -0.3, H + 0.55 + rng() * 0.3, (rng() - 0.5) * 0.1, (rng() - 0.5) * 0.1),
  ]);
}

/** A driven-through stack: a low split mound of its hay (the face band), its pole fallen across it. */
function hayMounds(rng: Rng, spread: number, withPole: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [ox, oz, r] of [[-0.8, 0.2, 1.3], [0.9, -0.3, 1.1], [0.1, 0.9, 0.8]] as const) {
    const rr = r * spread;
    parts.push(turn([
      [rr * 1.1, -0.06, bandV(HAY_FACE_V, 0), 0.08],
      [rr, 0.2, bandV(HAY_FACE_V, 0.15), 0.1],
      [rr * 0.6, 0.5, bandV(HAY_FACE_V, 0.35), 0.1],
      [0.05, 0.62, bandV(HAY_FACE_V, 0.45), 0.02],
    ], 10, rng, 1).translate(ox * spread, 0, oz * spread));
  }
  if (withPole) {
    const p = pole(0.06, 0, 4.2, 0, 0);
    p.rotateZ(Math.PI / 2 - 0.08);
    parts.push(p.translate(2.0, 0.35, (rng() - 0.5) * 0.6));
  }
  return merge(parts);
}

function bStogBroken(rng: Rng): THREE.BufferGeometry { return hayMounds(rng, 1.15, true); }
function bPlastBroken(rng: Rng): THREE.BufferGeometry { return hayMounds(rng, 0.85, true); }

/**
 * The hooiberg: four tall poles at a square's corners, a thatched pyramid roof hung between them at the stack's height,
 * the stack below it a square of hay drawn down at its sides, its corners rounded, its foot settled.
 */
function hooibergStack(half: number, top: number, rng: Rng): THREE.BufferGeometry {
  // the stack's section: a square with rounded corners, turned as a 'superellipse' profile round the vertical.
  // (b21; gauntlet wave 139: "a dead-straight block of uniform vertical strands like a straw curtain": the hay is
  // pitched up in layers — each a course of the face band, pressed darker at its foot — drawn in a little at every
  // layer's joint, its sides bellying out between the poles, the whole leaning a little its own way; every number from
  // the stack's own noise tables, no draw more from the stream)
  const segs = 20;
  const lumps = noiseTable(rng, 8), locks = noiseTable(rng, 24);
  // the layers: about 0.85 m each, their joints off a level by the stack's own noise
  const layers = Math.max(4, Math.round(top / 0.85)), joints: number[] = [];
  for (let l = 1; l < layers; l++) joints.push((l + (lumps[(l * 7) % 64] - 0.5) * 0.4) * (top / layers));
  // [y, the face band's share, the joint's draw-in, the layer's slant]: each forkful's straw slanting its own way, the
  // next layer's the other (a herringbone of layers the eye finds at any distance; continuous at the joints)
  const rows: Array<[number, number, number, number]> = [[-0.1, 0, 0, 0], [0.15, 0.06, 0, 0]];
  let y0 = 0, l = 0;
  for (const y1 of [...joints, top]) {
    const h = y1 - y0, slant = (t: number) => (l % 2 === 0 ? t : 1 - t) * 0.07;
    if (y0 > 0) rows.push([y0, 0.3, 1, slant(0)]);
    rows.push([y0 + h * 0.55, 0.7, 0, slant(0.55)]);
    y0 = y1; l++;
  }
  rows.push([top, 1, 0, (l % 2 === 0 ? 0 : 1) * 0.07]);
  const leanA = lumps[5] * Math.PI * 2, lean = 0.04 + lumps[13] * 0.08;
  const cols = segs + 1, pos = new Float32Array(rows.length * cols * 3), uv = new Float32Array(rows.length * cols * 2), index: number[] = [];
  const perimeter = 8 * half, tiles = Math.max(2, Math.round(perimeter / 4));
  for (let k = 0; k < rows.length; k++) {
    const [y, f, joint, slant] = rows[k];
    const yN = Math.min(1, Math.max(0, y / top));
    const bulge = 1 + 0.05 * Math.sin(Math.PI * yN) - 0.016 * joint;
    for (let j = 0; j < cols; j++) {
      const t = (j % segs) / segs, a = t * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      // a rounded square, its sides bellying out between the corners' poles (a lower exponent mid-height)
      const p = 5 - 1.4 * Math.sin(Math.PI * yN), rr = half * bulge / Math.pow(Math.pow(Math.abs(c), p) + Math.pow(Math.abs(s), p), 1 / p);
      const wobble = (sampleTable(lumps, 8, t, y * 0.4) - 0.5) * 0.12 + (sampleTable(locks, 24, t * 3, y * 1.6) - 0.5) * 0.16;
      const o = (k * cols + j) * 3;
      pos[o] = c * (rr + wobble) + Math.cos(leanA) * lean * yN; pos[o + 1] = y; pos[o + 2] = s * (rr + wobble) + Math.sin(leanA) * lean * yN;
      uv[(k * cols + j) * 2] = (j / segs) * tiles + slant; uv[(k * cols + j) * 2 + 1] = bandV(HAY_FACE_V, f);
    }
  }
  for (let k = 0; k < rows.length - 1; k++) for (let j = 0; j < segs; j++) {
    const a = k * cols + j, b = a + 1, c = a + cols, d = c + 1;
    index.push(a, c, b, b, c, d);
  }
  // the top: a low cap of hay under the roof (unseen from the ground; it closes the stack against the sky)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** A thatched pyramid roof: eaves at y0 a square of half `eave`, the apex at y1; ragged eaves; the thatch band. */
function pyramidRoof(eave: number, y0: number, y1: number, rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const thick = 0.18;
  for (let side = 0; side < 4; side++) {
    // one face: a triangle from the eave edge to the apex, as a strip of rows (the courses run along the eave).
    // (b21; wave 139, the roof from the field "a flat, untextured dark pyramid": each course's butts stand proud of the
    // course above, a step the light finds from any distance — the rows' odd joints drawn out and down a little; the
    // eave row's draws as before)
    const rows = 4, cols = 6, pos: number[] = [], uv: number[] = [], index: number[] = [];
    for (let k = 0; k <= rows; k++) {
      const t = k / rows, y = y0 + (y1 - y0) * t, w = eave * (1 - t);
      const butt = k > 0 && k < rows ? 0.07 * (k % 2 === 1 ? 1 : 0.4) : 0;
      for (let j = 0; j <= cols; j++) {
        const s = j / cols * 2 - 1;
        const ragged = k === 0 ? (rng() - 0.5) * 0.14 : 0;
        pos.push(s * (w + butt), y - (k === 0 ? 0.06 + ragged : butt * 0.4), eave * (1 - t) + (k === 0 ? 0.04 : butt));
        uv.push((j / cols) * (2 * eave) / 4, bandV(HAY_THATCH_V, t));
      }
    }
    for (let k = 0; k < rows; k++) for (let j = 0; j < cols; j++) {
      const a = k * (cols + 1) + j, b = a + 1, c = a + cols + 1, d = c + 1;
      index.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    g.rotateY((side * Math.PI) / 2);
    parts.push(g);
    // the eave's thickness: a fringe band under the eave line (the thatch's cut butts)
    const fringe = new THREE.BoxGeometry(eave * 2, thick, 0.06);
    const fuv = fringe.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * 2, bandV(HAY_THATCH_V, 0.02 + fuv.getY(i) * 0.08));
    fringe.translate(0, y0 - thick / 2 - 0.04, eave + 0.02);
    fringe.rotateY((side * Math.PI) / 2);
    parts.push(fringe);
  }
  return merge(parts);
}

function bHooiberg(rng: Rng): THREE.BufferGeometry {
  const half = 2.0 + rng() * 0.2, roofY = 4.3 + rng() * 0.5, apex = roofY + 1.5 + rng() * 0.3, poleTop = apex + 0.6;
  const parts: THREE.BufferGeometry[] = [hooibergStack(half * 0.94, roofY - 0.12, rng)];
  parts.push(footSkirt(half * 1.12, 0.3, 24, rng, 3));
  parts.push(pyramidRoof(half * 1.16, roofY, apex, rng));
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
    parts.push(pole(0.08, -0.5, poleTop + rng() * 0.3, 0, 0).translate(sx * half * 1.06, 0, sz * half * 1.06));
  }
  return merge(parts);
}

function bHooibergBroken(rng: Rng): THREE.BufferGeometry {
  // the stack gone to a mound under the roof, which has slid down its poles to rest on it
  const half = 2.1, parts: THREE.BufferGeometry[] = [hayMounds(rng, 1.35, false)];
  const roof = pyramidRoof(half * 1.16, 1.0, 2.3, rng);
  roof.rotateX(0.12);
  parts.push(roof);
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) parts.push(pole(0.08, -0.5, 6.6, 0, 0).translate(sx * half * 1.06, 0, sz * half * 1.06));
  return merge(parts);
}

/**
 * The meule: a broad drum of hay drawn up into a dome of thatched straw, one form from foot to crown (never a hut's
 * roof on a wall), a twist of straw at its top.
 */
function bMeule(rng: Rng): THREE.BufferGeometry {
  const R = 2.15 + rng() * 0.25, drum = 1.9 + rng() * 0.4, H = drum + 2.1 + rng() * 0.4, segs = 22;
  const tiles = Math.max(3, Math.round((Math.PI * 2 * R) / 4));
  // (the hay's locks from the foot over the dome: one face band up the whole stack, no thatched cap to read as a roof)
  const face = (y: number) => bandV(HAY_FACE_V, y / H);
  const crown = (t: number) => bandV(HAY_THATCH_V, t);
  const profile: ProfilePoint[] = [
    [R * 0.97, -0.1, face(0), 0.03],
    [R, 0.15, face(0.15), 0.05],
    [R * 1.04, drum * 0.45, face(drum * 0.45), 0.08],
    [R * 1.03, drum * 0.85, face(drum * 0.85), 0.09],
    [R * 0.99, drum, face(drum), 0.1],
  ];
  // the dome: drawn in toward the top as a quarter round a little pointed, ragged lower down
  for (let i = 1; i <= 6; i++) {
    const t = i / 6, y = drum + (H - drum) * t;
    profile.push([R * 0.99 * Math.pow(Math.cos((t * Math.PI) / 2), 0.85) + 0.07, y, face(y), 0.09 * (1 - t) + 0.02]);
  }
  const body = turn(profile, segs, rng, tiles, 2.65);
  // the topknot: a twist of straw at the dome's tip
  const knot = turn([[0.16, H - 0.05, crown(0.9), 0.03], [0.1, H + 0.25, crown(0.95), 0.02], [0.02, H + 0.42, crown(1), 0]], 8, rng, 1);
  return merge([body, footSkirt(R, 0.3, segs, rng, tiles), knot]);
}

function bMeuleBroken(rng: Rng): THREE.BufferGeometry { return hayMounds(rng, 1.3, false); }

/**
 * The Diemen: a long rick — its walls drawn down, a rounded thatched ridge over them, its ends hipped round — swept
 * along z: the cross-section's outline (foot, wall, eave, ridge) at each station, the stations near the ends drawn in.
 */
function bDiemen(rng: Rng): THREE.BufferGeometry {
  const halfL = 3.2 + rng() * 0.5, halfW = 1.7 + rng() * 0.15, wall = 2.3 + rng() * 0.3, ridge = wall + 1.5 + rng() * 0.3;
  const lumps = noiseTable(rng, 8), locks = noiseTable(rng, 24);
  // the section's outline from the left foot over the ridge to the right foot: (x, y, v, rag)
  const outline: ProfilePoint[] = [];
  const sideRows: Array<[number, number]> = [[-0.1, 0], [0.15, 0.06], [wall * 0.5, 0.5], [wall, 1]];
  for (const [y, f] of sideRows) outline.push([-halfW * (1 + 0.04 * Math.sin(Math.PI * f)), y, bandV(HAY_FACE_V, f), 0.1]);
  for (let i = 1; i <= 6; i++) {
    const t = i / 7, ang = Math.PI * (1 - t);
    outline.push([Math.cos(ang) * halfW * 1.04, wall + Math.sin(ang) * (ridge - wall), bandV(HAY_THATCH_V, Math.min(t, 1 - t) * 2), 0.08]);
  }
  for (let k = sideRows.length - 1; k >= 0; k--) {
    const [y, f] = sideRows[k];
    outline.push([halfW * (1 + 0.04 * Math.sin(Math.PI * f)), y, bandV(HAY_FACE_V, f), 0.1]);
  }
  // the stations along the rick: its ends drawn in a little and rounded at their corners, then cut square (b19; the
  // b15 frames: a deep hip drew the thatch's courses down over the end like the ribs of a shell — "a barrel or a log
  // end"; a rick's end is its cut face, the hay standing in it as in its walls)
  const stations: number[] = [];
  for (let i = 0; i <= 12; i++) stations.push(-halfL + (2 * halfL * i) / 12);
  const rows = stations.length, cols = outline.length;
  const pos = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2), index: number[] = [];
  const along = (2 * halfL) / 4;
  for (let i = 0; i < rows; i++) {
    const z = stations[i], e = Math.abs(z) / halfL, hip = e > 0.84 ? Math.sqrt(Math.max(0, 1 - Math.pow((e - 0.84) / 0.16, 2))) : 1;
    for (let k = 0; k < cols; k++) {
      const [x, y, v, rag] = outline[k];
      const t = k / (cols - 1);
      const wobble = (sampleTable(lumps, 8, z / 8 + 0.5, y * 0.4 + t) - 0.5) * 0.14 + (sampleTable(locks, 24, z / 4 + t * 2, y * 1.6) - 0.5) * 2 * rag;
      const scale = 0.8 + 0.2 * hip, yScale = y > wall ? 0.9 + 0.1 * hip : 1;
      const o = (i * cols + k) * 3;
      pos[o] = (x + Math.sign(x) * wobble) * scale; pos[o + 1] = y * yScale; pos[o + 2] = z * (e > 0.84 ? 1 - 0.04 * (1 - hip) : 1);
      uv[(i * cols + k) * 2] = ((z + halfL) / (2 * halfL)) * along; uv[(i * cols + k) * 2 + 1] = v;
    }
  }
  for (let i = 0; i < rows - 1; i++) for (let k = 0; k < cols - 1; k++) {
    const a = i * cols + k, b = a + 1, c = a + cols, d = c + 1;
    index.push(a, c, b, b, c, d);
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  body.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  body.setIndex(index);
  body.computeVertexNormals();
  // the hipped ends closed: a fan at each end from the section's centre (its last station's outline, drawn in).
  // (b19; the b15 frames: the fan's thatch laid round it read as "a barrel or a log end", radial stripes on a shell —
  // the end is the rick's cut face now, the face band's hanging straw by its height and across it, as its walls wear it)
  const parts: THREE.BufferGeometry[] = [body];
  const endV = (y: number): number => bandV(HAY_FACE_V, Math.min(1, Math.max(0, y / ridge)));
  for (const end of [0, rows - 1]) {
    const ring: number[] = [];
    for (let k = 0; k < cols; k++) { const o = (end * cols + k) * 3; ring.push(pos[o], pos[o + 1], pos[o + 2]); }
    const cx = 0, cy = ridge * 0.45, cz = stations[end] * 0.985;
    const fpos: number[] = [], fuv: number[] = [], fidx: number[] = [];
    fpos.push(cx, cy, cz); fuv.push((cx + halfW) / 4, endV(cy));
    for (let k = 0; k < cols; k++) { fpos.push(ring[k * 3], ring[k * 3 + 1], ring[k * 3 + 2]); fuv.push((ring[k * 3] + halfW) / 4, endV(ring[k * 3 + 1])); }
    for (let k = 0; k < cols - 1; k++) fidx.push(0, k + 1, k + 2);
    fidx.push(0, cols, 1); // (and across its foot: the cut face is whole down to the ground)
    const fan = new THREE.BufferGeometry();
    fan.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
    fan.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2));
    fan.setIndex(fidx);
    parts.push(faceOutward(fan, new THREE.Vector3(0, ridge * 0.4, 0)));
  }
  // the settled foot along its walls and round its ends
  parts.push(rectSkirt(halfW, halfL, 0.32, rng));
  return merge(parts);
}

function bDiemenBroken(rng: Rng): THREE.BufferGeometry {
  const a = hayMounds(rng, 1.1, false), b = hayMounds(rng, 1.0, false);
  return merge([a.translate(0, 0, -1.6), b.translate(0, 0, 1.6)]);
}

/**
 * The stook: a teepee of sheaves leaning on each other, each a bound sheaf (its straw the face band's, a darker band
 * where it is tied), its butts splayed on the ground (the packed band: cut ends), a head of ears at the top.
 */
export function buildStook(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const count = 6 + Math.floor(rng() * 2), lean = 0.3, len = 1.32;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.25, r = 0.075 + rng() * 0.02;
    // one sheaf (five-sided: a field of them stands in a harvest): butts splayed at its foot, bound a third of the way up,
    // its ears in a head at the top
    const sheaf = turn([
      [r * 1.35, 0, bandV(HAY_PACKED_V, 0.5), 0.015],
      [r * 1.12, 0.12, bandV(HAY_FACE_V, 0.05), 0.015],
      [r * 0.82, len * 0.36, bandV(HAY_THATCH_V, 0.02), 0.0],
      [r * 1.15, len * 0.78, bandV(HAY_FACE_V, 0.8), 0.03],
      [r * 1.3, len * 0.92, bandV(HAY_FACE_V, 0.95), 0.04],
      [0.02, len, bandV(HAY_FACE_V, 1), 0.02],
    ], 5, rng, 0.5);
    sheaf.rotateZ(lean);
    sheaf.translate(len * Math.sin(lean) * 0.92, 0, 0);
    sheaf.rotateY(a);
    parts.push(sheaf);
  }
  return merge(parts);
}

/** A stream of the kit's own (a builder that may draw nothing more from the props' destructible stream). */
function ownStream(seed: number): Rng {
  let a = seed | 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * The kopna (b21; gauntlet wave 139, the legacy field stack: "a straight-edged, four-sided pyramid", "a flat, untextured
 * pyramid"): the haycock a steppe's or a meadow's hay is raked into before it is carted — two metres and a bit of loose
 * hay drawn up to a rounded top, no pole, its foot settled; built by hand like the stog (its slump, its twist, its proud
 * locks). From a stream of its own: the legacy stack's draws are spent by its caller (inhabitKit bHaystack), so every
 * later pool keeps its geometry. Inside the legacy record's reach (r 1.75) and height (h 2.5).
 */
export function buildKopna(): THREE.BufferGeometry {
  const rng = ownStream(0x6b0a7), R = 1.32 + rng() * 0.08, H = 2.3 + rng() * 0.12, segs = 14;
  const face = (y: number) => bandV(HAY_FACE_V, y / H), tiles = Math.max(2, Math.round((Math.PI * 2 * R) / 4));
  const profile: ProfilePoint[] = [
    [R * 0.96, -0.1, face(0), 0.03], [R, 0.1, face(0.1), 0.04], [R * 1.05, H * 0.28, face(H * 0.28), 0.07],
    [R * 0.98, H * 0.44, face(H * 0.44), 0.08], [R * 0.82, H * 0.58, face(H * 0.58), 0.09],
  ];
  // the top: a rounded cone drawn in to a tuft, ragged at its shoulder
  for (let i = 1; i <= 4; i++) {
    const t = i / 4, y = H * 0.58 + H * 0.42 * t;
    profile.push([R * 0.82 * Math.pow(Math.cos((t * Math.PI) / 2), 0.75) + 0.05, y, face(y), 0.08 * (1 - t) + 0.02]);
  }
  return merge([turn(profile, segs, rng, tiles, 1.68), footSkirt(R, 0.24, segs, rng, tiles)]);
}

/**
 * The haycock (b22; the coordinator, from gauntlet waves 147, 154 and 157: "modern round bales" on the WW2 and 1950s
 * maps, Verdant's 1943 farmyard, the Polders and Amberford in 1944, the steppe in the 1950s; the round baler came in the
 * 1970s): the period's hay in the meadow and by the yard. A haymaker forks it up into cocks to sweat a few days before
 * it is carted to the rick: a dome of loose hay about a man's height, combed down its sides to shed the rain and drawn
 * up to a tuft, built by hand like the kopna (its slump, its twist, its proud locks). It stands on the round bale's
 * record: inside its height (h 1.45), its foot over its collider (collisionR 0.75), its reach inside the Autumn
 * harvest's bale envelope (props.ts autumnHarvestRadius). From a stream of its own: the round bale's build draws
 * nothing, so neither does this one, and every later pool keeps its geometry.
 */
export function buildHaycock(): THREE.BufferGeometry {
  const SEED = 0x4c0c6, rng = ownStream(SEED), R = 0.84 + rng() * 0.03, H = 1.3 + rng() * 0.08, segs = 12;
  const face = (y: number) => bandV(HAY_FACE_V, y / H), tiles = 2;
  const profile: ProfilePoint[] = [
    [R * 0.95, -0.08, face(0), 0.02], [R, 0.08, face(0.08), 0.03], [R * 1.03, H * 0.3, face(H * 0.3), 0.05],
    [R * 0.9, H * 0.52, face(H * 0.52), 0.06],
  ];
  // the top: drawn in to a tuft, rounder than the kopna's
  for (let i = 1; i <= 3; i++) {
    const t = i / 3, y = H * 0.52 + H * 0.48 * t;
    profile.push([R * 0.9 * Math.pow(Math.cos((t * Math.PI) / 2), 0.7) + 0.04, y, face(y), 0.05 * (1 - t) + 0.015]);
  }
  // the hand's touch at about half a stog's: turn() sets the sway and the proud locks in metres, and on a cock this
  // small they leaned the whole of it over. The same body is turned plain as well (the same tables, from a stream at
  // the same place) and the two meet a little past half way, vertex by vertex
  const handed = turn(profile, segs, rng, tiles, HAYCOCK_REACH);
  const plainRng = ownStream(SEED);
  plainRng(); plainRng();
  const plain = turn(profile, segs, plainRng, tiles), hp = handed.attributes.position, pp = plain.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    hp.setXYZ(i, pp.getX(i) + (hp.getX(i) - pp.getX(i)) * HAYCOCK_HAND, hp.getY(i), pp.getZ(i) + (hp.getZ(i) - pp.getZ(i)) * HAYCOCK_HAND);
  }
  handed.computeVertexNormals();
  // (the seam column's normals the mean of its two sides', as turn() leaves them)
  const n = handed.attributes.normal as THREE.BufferAttribute;
  for (let k = 0; k < profile.length; k++) {
    const a = k * (segs + 1), b = a + segs;
    const x = n.getX(a) + n.getX(b), yy = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, yy, z) || 1;
    n.setXYZ(a, x / l, yy / l, z / l); n.setXYZ(b, x / l, yy / l, z / l);
  }
  plain.dispose();
  return merge([handed, footSkirt(R * 0.92, 0.08, segs, rng, tiles)]);
}
/**
 * The haycock's contact stand-in (inhabitKit HAYCOCK_BALE contactProxy): an upright twelve-sided prism of the round
 * bale's collider radius (0.75) and the cock's height, inside its hay at the ground and convex, so the colliders refit
 * from it are one outline.
 */
export function buildHaycockContactProxy(): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(0.75, 0.75, 1.3, 12, 1).translate(0, 0.65, 0);
}
/** The share of the hand's touch a haycock keeps (the stog's is whole). */
const HAYCOCK_HAND = 0.55;
/** The haycock's reach (m): no vertex past it (the Autumn harvest's bale envelope is hypot(0.725, 0.72), 1.02 m). */
export const HAYCOCK_REACH = 0.98;

/**
 * The maps whose 'bale' is the round bale (b22): the modern ones — Kestrel Airfield (Hostomel, 2022) and Frontier
 * Basin (the Fulda Gap in the 1980s). Every other map's 'bale' is the haycock (inhabitKit HAYCOCK_BALE; props.ts swaps
 * it in): same kind, record, placements and broken heap, the period's form.
 */
export const ROUND_BALE_MAPS: ReadonlySet<string> = new Set(['airfield', 'frontier']);

/**
 * The field stacks' destructible kinds (merged into the props type registry after the scenery's, so no existing kind
 * moves; not landmarks: the haystack pass places them, never a map's scenery plan).
 * Shoot-through crushable obstacles like the legacy stack. r is the hay's reach above its skirt (the stog's belly, the
 * hooiberg's eaves at the corners, the Diemen's hipped ends), h its top with the poles; the footprints follow the hay at
 * the ground: the stog's and the plast's foot, the hooiberg's stack, the meule's drum, the Diemen's walls.
 */
export const HAYSTACK_DESTRUCTIBLE_TYPES = {
  stog: { cls: 'break', mat: 'straw', contact: 'ob', r: 2.3, h: 6.1, shape: 'circle', collisionR: 1.7, build: bStog, broken: bStogBroken },
  plast: { cls: 'break', mat: 'straw', contact: 'ob', r: 1.65, h: 4.25, shape: 'circle', collisionR: 1.2, build: bPlast, broken: bPlastBroken },
  hooiberg: { cls: 'break', mat: 'straw', contact: 'ob', r: 3.6, h: 7.45, hw: 2.15, hl: 2.15, build: bHooiberg, broken: bHooibergBroken },
  meule: { cls: 'break', mat: 'straw', contact: 'ob', r: 2.7, h: 5.2, shape: 'circle', collisionR: 2.2, build: bMeule, broken: bMeuleBroken },
  diemen: { cls: 'break', mat: 'straw', contact: 'ob', r: 3.9, h: 4.35, hw: 1.8, hl: 3.5, build: bDiemen, broken: bDiemenBroken },
} satisfies Record<string, DestructiblePropType>;

/** Each style's kind and the radius of its grounding disc (props.ts stackSpots) at scale 1. */
export const HAYSTACK_STYLE_KINDS: Readonly<Record<Exclude<HaystackStyle, 'none'>, { kind: string; spotR: number }>> = Object.freeze({
  stog: { kind: 'stog', spotR: 2.7 },
  plast: { kind: 'plast', spotR: 2.0 },
  hooiberg: { kind: 'hooiberg', spotR: 3.4 },
  meule: { kind: 'meule', spotR: 3.3 },
  diemen: { kind: 'diemen', spotR: 4.4 },
  strawstack: { kind: 'strawstack', spotR: 2.4 },
  haystack: { kind: 'haystack', spotR: 2.85 },
});

/**
 * The maps' field stacks (b15; the coordinator's survey of wave 106): a region's own build where its fields stack hay,
 * none where they do not. A map absent here keeps the legacy cone if it authors a count (the steppe, whose rick is the
 * maps lane's), and draws none at the default.
 */
export const HAYSTACK_STYLE_BY_MAP: Readonly<Record<string, HaystackStyle>> = Object.freeze({
  verdant: 'stog', winter: 'stog', saltwind: 'plast', polders: 'hooiberg', autumn: 'meule', coastal: 'meule',
  frontier: 'diemen', reservoir: 'diemen', delta: 'strawstack', mangrove: 'strawstack',
  orchard: 'none', longleaf: 'none', cliffbridge: 'none',
});
