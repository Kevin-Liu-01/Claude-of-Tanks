// src/vehicles/wreckDents.ts — the impact dents and the bent gun a destroyed tank carries (destruction core lane,
// 2026-10-09; the owner: "destroyed vehicles should be crumpled not just turn rusty").
//
// Shared by the two wrecks a battle shows: the live kill (tankFactoryCore.ts: the dents in the burn hook's vertex stage,
// materials.ts, the gun's geometry bent on the CPU) and the map's baked hulks (world/wreckCrumple.ts, every field on the
// CPU at bake). A dent is a round crater of radius √r2 pushed in along `dir` by `depth`: (1 − r²/R²)² · depth, a field of
// position alone, so the corners a mesh splits keep meeting. Pure three math; no allocation per vertex.

import * as THREE from 'three';

export interface WreckDent { cx: number; cy: number; cz: number; dx: number; dy: number; dz: number; r2: number; depth: number }
/**
 * A crease: a plate folded in along a line — `t` along the fold, `d` the push (inward, ⟂ t), the fold `half` long and `w`
 * wide each side. The fold is a V (a tent across the line): its two faces meet at an edge the light catches, as crumpled
 * plate does, where a dent's round crater reads soft. Points more than 0.6 m off the plate along `d` do not move (the far
 * side of a hull stays). Displacement: d · depth · (1 − across/w)₊ · (1 − (along/half)²)² · (1 − |off|/0.6)₊.
 */
export interface WreckCrease {
  cx: number; cy: number; cz: number; tx: number; ty: number; tz: number; dx: number; dy: number; dz: number;
  half: number; w: number; depth: number;
}
/**
 * The gun's kink (wave 350: a barrel bent along a curve "bends like rubber"): past the stress point `z0` the barrel
 * turns rigidly by `theta` toward (ux, uy) about a hinge on its axis there, the turn taken over the short `ramp` (m) of
 * the kink itself, so the barrel is two straight runs meeting at a crease.
 */
export interface WreckBend { z0: number; theta: number; ux: number; uy: number; ramp: number }

export function wreckRandom(a: number): () => number {
  return function (): number {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DentSamples { p: number[]; n: number[] }

/** Every `stride`-th corner of a geometry (positions and normals) through `m` (null: as stored), for planning. */
export function dentSamples(geometry: THREE.BufferGeometry, m: THREE.Matrix4 | null, stride = 7): DentSamples | null {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  if (!position || !normal) return null;
  const nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  const p: number[] = [], n: number[] = [];
  for (let i = 0; i < position.count; i += stride) {
    v.fromBufferAttribute(position, i);
    w.fromBufferAttribute(normal, i);
    if (m) { v.applyMatrix4(m); w.applyMatrix3(nm!).normalize(); }
    p.push(v.x, v.y, v.z); n.push(w.x, w.y, w.z);
  }
  return p.length ? { p, n } : null;
}

/**
 * Impact dents on a part: centred on real surface corners — flanks, glacis and plates sloping up, the faces a round
 * meets, and a few roof strikes — pushed in toward the part's middle (a face seen from inside is still struck from
 * outside). `level`: pushed in sideways only (a body on its wheels, never down through its tyres).
 */
export function planDents(samples: DentSamples | null, count: number, rMin: number, rMax: number, dMin: number,
  dMax: number, rng: () => number, out: WreckDent[], center: THREE.Vector3 | null = null, level = false): void {
  if (!samples) return;
  const corners = samples.p.length / 3;
  for (let k = 0, tries = 0; k < count && tries < count * 24; tries++) {
    const i = Math.floor(rng() * corners) * 3;
    let dx = -samples.n[i], dy = -samples.n[i + 1], dz = -samples.n[i + 2];
    if (-dy > 0.85 && rng() > 0.25) continue;
    if (-dy < -0.3) continue;
    const cx = samples.p[i], cy = samples.p[i + 1], cz = samples.p[i + 2];
    if (center && dx * (center.x - cx) + dy * (center.y - cy) + dz * (center.z - cz) < 0) { dx = -dx; dy = -dy; dz = -dz; }
    if (level) {
      const l = Math.hypot(dx, dz);
      if (l < 0.3) continue;
      dx /= l; dy = 0; dz /= l;
    }
    const r = rMin + (rMax - rMin) * rng();
    out.push({ cx, cy, cz, dx, dy, dz, r2: r * r, depth: dMin + (dMax - dMin) * rng() });
    k++;
  }
}

/**
 * The barrel's bend in the gun's frame (+Z along the bore from the trunnions): past a point 35–60 % along it the bore
 * curves by κ·(z − z0)², the muzzle 0.22–0.55 m off (scaled to the barrel), down under its own weight in the fire or —
 * on a turret the blast threw — any way. Null for a gun too short to bend.
 */
export function planBend(zMin: number, zMax: number, rng: () => number, anyWay: boolean): WreckBend | null {
  const zStart = Math.max(0, zMin), length = zMax - zStart;
  if (!(zMax > 1) || !(length > 0.8)) return null;
  // the stress point: where the barrel's wall thins past its thermal sleeve and evacuator, a third to a half of the way out
  const z0 = zStart + length * (0.35 + rng() * 0.2);
  // (2026-10-09: a 0.2-0.5 m droop read as a straight gun at 13 m) 0.35-0.6 m at the muzzle, now as a corner the light finds
  const tip = (0.35 + rng() * 0.25) * Math.min(1.3, Math.max(0.7, length / 4.2));
  const phi = anyWay ? (rng() * 2 - 1) * Math.PI : (rng() * 2 - 1) * 1.1;
  const theta = Math.asin(Math.min(0.35, tip / Math.max(0.5, zMax - z0)));
  return { z0, theta, ux: Math.sin(phi), uy: -Math.cos(phi), ramp: 0.06 };
}

/** The kink's turn at `t` past its stress point (eased over its ramp: the crease). */
export function bendAngle(bend: WreckBend, t: number): number {
  if (t <= 0) return 0;
  if (t >= bend.ramp) return bend.theta;
  const s = t / bend.ramp;
  return bend.theta * s * s * (3 - 2 * s);
}

/**
 * Creases on a part, on the same surface corners a dent takes (the faces a round meets, pushed in toward the part's middle):
 * each fold along a random line in its plate.
 */
export function planCreases(samples: DentSamples | null, count: number, halfMin: number, halfMax: number, wMin: number, wMax: number,
  dMin: number, dMax: number, rng: () => number, out: WreckCrease[], center: THREE.Vector3 | null = null): void {
  const dents: WreckDent[] = [];
  planDents(samples, count, 0.5, 0.5, dMin, dMax, rng, dents, center);
  const d = new THREE.Vector3(), r = new THREE.Vector3(), t = new THREE.Vector3();
  for (const dent of dents) {
    d.set(dent.dx, dent.dy, dent.dz).normalize();
    // a random direction in the plate: any vector not along d, crossed with d
    for (let k = 0; k < 4; k++) {
      r.set(rng() - 0.5, rng() - 0.5, rng() - 0.5);
      t.crossVectors(d, r);
      if (t.lengthSq() > 1e-4) break;
    }
    if (t.lengthSq() <= 1e-4) t.set(0, 1, 0).cross(d);
    t.normalize();
    out.push({ cx: dent.cx, cy: dent.cy, cz: dent.cz, tx: t.x, ty: t.y, tz: t.z, dx: d.x, dy: d.y, dz: d.z,
      half: halfMin + (halfMax - halfMin) * rng(), w: wMin + (wMax - wMin) * rng(), depth: dent.depth });
  }
}

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();

/**
 * A point of the gun's frame turned by the kink (in place): its run along the bore past `z0` and its offset toward
 * (ux, uy) rotate together about the hinge, so the barrel past the crease is straight and keeps its length.
 */
export function kinkPoint(bend: WreckBend, p: THREE.Vector3): void {
  const t = p.z - bend.z0;
  if (t <= 0) return;
  const th = bendAngle(bend, t), c = Math.cos(th), s = Math.sin(th);
  const a = p.x * bend.ux + p.y * bend.uy;
  const t1 = t * c - a * s, a1 = t * s + a * c;
  p.x += bend.ux * (a1 - a); p.y += bend.uy * (a1 - a); p.z = bend.z0 + t1;
}

/** A direction of the gun's frame at a point `t` past the stress point, turned as the kink turns it there (in place). */
export function kinkDirection(bend: WreckBend, t: number, n: THREE.Vector3): void {
  if (t <= 0) return;
  const th = bendAngle(bend, t), c = Math.cos(th), s = Math.sin(th);
  const a = n.x * bend.ux + n.y * bend.uy, z = n.z;
  const z1 = z * c - a * s, a1 = z * s + a * c;
  n.x += bend.ux * (a1 - a); n.y += bend.uy * (a1 - a); n.z = z1;
}

/** Whether a triangle of `geometry` (its corners taken to the gun's frame by `toGun`) crosses a plane of the kink. */
function crossesBendPlanes(geometry: THREE.BufferGeometry, bend: WreckBend, toGun: THREE.Matrix4): boolean {
  const position = geometry.attributes.position;
  if (!position) return false;
  const index = geometry.index, e = toGun.elements, p0 = bend.z0, p1 = bend.z0 + bend.ramp;
  const corners = index ? index.count : position.count;
  const zAt = (k: number): number => {
    const i = index ? index.getX(k) : k;
    return e[2] * position.getX(i) + e[6] * position.getY(i) + e[10] * position.getZ(i) + e[14];
  };
  for (let k = 0; k + 2 < corners; k += 3) {
    const a = zAt(k), b = zAt(k + 1), c = zAt(k + 2);
    const lo = Math.min(a, b, c), hi = Math.max(a, b, c);
    if ((lo < p0 - 1e-7 && hi > p0 + 1e-7) || (lo < p1 - 1e-7 && hi > p1 + 1e-7)) return true;
  }
  return false;
}

/**
 * A copy of `geometry` cut at the kink's two planes (z = z0 and z = z0 + ramp in the gun's frame, `toGun` taking its
 * stored corners there): non-indexed, every attribute interpolated along the cut edges, its material groups kept.
 * bendGeometry moves corners only. A barrel tube authored as one cylinder has corners only at its breech and muzzle
 * rings, so bent uncut it draws as a straight chord from the unmoved breech to the kinked muzzle, up to 0.2 m off the
 * true kink — out through the sleeve sections, evacuator, collars and bands concentric with it, which do have corners
 * past the hinge and follow it: two barrels on the wreck (tank-opt 2026-10-15). Cut, no drawn triangle spans the
 * hinge: everything behind z0 stays, everything past z0 + ramp turns rigidly, and the 6 cm crease between is linear.
 * A geometry no triangle of which crosses either plane needs no cut: `geometry` itself comes back (indexed as it was).
 */
export function cutAtBend(geometry: THREE.BufferGeometry, bend: WreckBend, toGun: THREE.Matrix4): THREE.BufferGeometry {
  if (!crossesBendPlanes(geometry, bend, toGun)) return geometry;
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const names = Object.keys(source.attributes);
  const sizes: number[] = [];
  const arrays: ArrayLike<number>[] = [];
  for (const name of names) {
    const attribute = source.getAttribute(name);
    sizes.push(attribute.itemSize);
    if ((attribute as THREE.BufferAttribute).isBufferAttribute && !attribute.normalized) { arrays.push(attribute.array); continue; }
    const copy = new Float32Array(attribute.count * attribute.itemSize);
    for (let i = 0; i < attribute.count; i++) for (let c = 0; c < attribute.itemSize; c++) copy[i * attribute.itemSize + c] = attribute.getComponent(i, c);
    arrays.push(copy);
  }
  const count = source.attributes.position.count, triangles = Math.floor(count / 3);
  const position = arrays[names.indexOf('position')], e = toGun.elements;
  const z = new Float64Array(count);
  for (let i = 0; i < count; i++) z[i] = e[2] * position[i * 3] + e[6] * position[i * 3 + 1] + e[10] * position[i * 3 + 2] + e[14];
  const planes = [bend.z0, bend.z0 + bend.ramp];
  const spans = (t: number): boolean => {
    const lo = Math.min(z[3 * t], z[3 * t + 1], z[3 * t + 2]), hi = Math.max(z[3 * t], z[3 * t + 1], z[3 * t + 2]);
    return planes.some((plane) => lo < plane - 1e-7 && hi > plane + 1e-7);
  };
  const ranges: [number, number, number | undefined][] = source.groups.length
    ? source.groups.map((g) => [Math.floor(g.start / 3), Math.min(triangles, Math.floor((g.start + g.count) / 3)), g.materialIndex])
    : [[0, triangles, undefined]];
  // a triangle cut by both planes leaves at most three convex pieces of seven corners: five triangles
  let kept = 0, cutCount = 0;
  for (const [t0, t1] of ranges) for (let t = t0; t < t1; t++) { if (spans(t)) cutCount++; else kept++; }
  const capacity = 3 * kept + 15 * cutCount;
  const outs = sizes.map((size) => new Float32Array(capacity * size));
  let n = 0;
  const copyCorner = (i: number): void => {
    for (let k = 0; k < arrays.length; k++) {
      const size = sizes[k], src = arrays[k], dst = outs[k];
      for (let c = 0; c < size; c++) dst[n * size + c] = src[i * size + c];
    }
    n++;
  };
  // the few triangles that span a plane: their corners as attribute vectors, clipped plane by plane
  const stride = sizes.reduce((a, b) => a + b, 0);
  const at = sizes.slice(0, names.indexOf('position')).reduce((a, b) => a + b, 0);
  const zOf = (v: Float64Array): number => e[2] * v[at] + e[6] * v[at + 1] + e[10] * v[at + 2] + e[14];
  const corner = (i: number): Float64Array => {
    const v = new Float64Array(stride);
    for (let k = 0, o = 0; k < arrays.length; o += sizes[k], k++) for (let c = 0; c < sizes[k]; c++) v[o + c] = arrays[k][i * sizes[k] + c];
    return v;
  };
  const emitPoint = (v: Float64Array): void => {
    for (let k = 0, o = 0; k < arrays.length; o += sizes[k], k++) for (let c = 0; c < sizes[k]; c++) outs[k][n * sizes[k] + c] = v[o + c];
    n++;
  };
  const cutTriangle = (t: number): void => {
    let polys = [[corner(3 * t), corner(3 * t + 1), corner(3 * t + 2)]];
    for (const plane of planes) {
      const next: Float64Array[][] = [];
      for (const poly of polys) {
        const d = poly.map((v) => zOf(v) - plane);
        // a piece on one side of the plane (corners on it included) stays whole
        if (!d.some((x) => x < -1e-9) || !d.some((x) => x > 1e-9)) { next.push(poly); continue; }
        const below: Float64Array[] = [], above: Float64Array[] = [];
        for (let i = 0; i < poly.length; i++) {
          const j = (i + 1) % poly.length, a = poly[i], b = poly[j], da = d[i], db = d[j];
          if (da <= 1e-9) below.push(a);
          if (da >= -1e-9) above.push(a);
          if ((da < -1e-9 && db > 1e-9) || (da > 1e-9 && db < -1e-9)) {
            const s = da / (da - db), m = new Float64Array(stride);
            for (let k = 0; k < stride; k++) m[k] = a[k] + (b[k] - a[k]) * s;
            below.push(m); above.push(m);
          }
        }
        next.push(below, above);
      }
      polys = next;
    }
    for (const poly of polys) for (let i = 1; i + 1 < poly.length; i++) { emitPoint(poly[0]); emitPoint(poly[i]); emitPoint(poly[i + 1]); }
  };
  const cut = new THREE.BufferGeometry();
  for (const [t0, t1, materialIndex] of ranges) {
    const start = n;
    for (let t = t0; t < t1; t++) {
      if (spans(t)) cutTriangle(t);
      else { copyCorner(3 * t); copyCorner(3 * t + 1); copyCorner(3 * t + 2); }
    }
    if (source.groups.length) cut.addGroup(start, n - start, materialIndex);
  }
  names.forEach((name, k) => cut.setAttribute(name, new THREE.BufferAttribute(outs[k].slice(0, n * sizes[k]), sizes[k])));
  cut.name = geometry.name;
  cut.userData = geometry.userData;
  if (source !== geometry) source.dispose();
  return cut;
}

/**
 * Kink a geometry by `bend` in the gun's frame: `toGun` takes its stored corners into that frame, `fromGun` back. The
 * normals turn with the barrel (the crease's two runs catch the light differently). In place.
 */
export function bendGeometry(geometry: THREE.BufferGeometry, bend: WreckBend, toGun: THREE.Matrix4, fromGun: THREE.Matrix4): void {
  const position = geometry.attributes.position as THREE.BufferAttribute | undefined;
  if (!position) return;
  const normal = geometry.attributes.normal as THREE.BufferAttribute | undefined;
  const to3 = new THREE.Matrix3().setFromMatrix4(toGun), from3 = new THREE.Matrix3().setFromMatrix4(fromGun);
  for (let i = 0; i < position.count; i++) {
    _p.fromBufferAttribute(position, i).applyMatrix4(toGun);
    if (_p.z <= bend.z0) continue;
    const t = _p.z - bend.z0;
    kinkPoint(bend, _p);
    _p.applyMatrix4(fromGun);
    position.setXYZ(i, _p.x, _p.y, _p.z);
    if (!normal) continue;
    _n.fromBufferAttribute(normal, i).applyMatrix3(to3);
    kinkDirection(bend, t, _n);
    _n.applyMatrix3(from3).normalize();
    normal.setXYZ(i, _n.x, _n.y, _n.z);
  }
  position.needsUpdate = true;
  if (normal) normal.needsUpdate = true;
}
