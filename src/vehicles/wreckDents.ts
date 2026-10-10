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
export interface WreckBend { z0: number; kappa: number; ux: number; uy: number }

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
  const z0 = zStart + length * (0.3 + rng() * 0.25);
  // (2026-10-09, after the first wave's frames: a 0.2-0.5 m droop read as a straight gun at 13 m) 0.4-0.8 m at the muzzle
  const tip = (0.4 + rng() * 0.4) * Math.min(1.3, Math.max(0.7, length / 4.2));
  const phi = anyWay ? (rng() * 2 - 1) * Math.PI : (rng() * 2 - 1) * 1.1;
  return { z0, kappa: tip / ((zMax - z0) * (zMax - z0)), ux: Math.sin(phi), uy: -Math.cos(phi) };
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
 * Bend a geometry by `bend` in the gun's frame: `toGun` takes its stored corners into that frame, `fromGun` back. The
 * normals follow the bend's Jacobian (the bore's curve is seen in the light). In place.
 */
export function bendGeometry(geometry: THREE.BufferGeometry, bend: WreckBend, toGun: THREE.Matrix4, fromGun: THREE.Matrix4): void {
  const position = geometry.attributes.position as THREE.BufferAttribute | undefined;
  if (!position) return;
  const normal = geometry.attributes.normal as THREE.BufferAttribute | undefined;
  const to3 = new THREE.Matrix3().setFromMatrix4(toGun), from3 = new THREE.Matrix3().setFromMatrix4(fromGun);
  for (let i = 0; i < position.count; i++) {
    _p.fromBufferAttribute(position, i).applyMatrix4(toGun);
    if (_p.z <= bend.z0) continue;
    const t = _p.z - bend.z0, v = bend.kappa * t * t, dv = 2 * bend.kappa * t;
    _p.x += bend.ux * v; _p.y += bend.uy * v;
    _p.applyMatrix4(fromGun);
    position.setXYZ(i, _p.x, _p.y, _p.z);
    if (!normal) continue;
    // J = I + u ⊗ ẑ·dv; its cofactor maps n to (nx, ny, nz − dv·(ux·nx + uy·ny))
    _n.fromBufferAttribute(normal, i).applyMatrix3(to3);
    _n.z -= dv * (bend.ux * _n.x + bend.uy * _n.y);
    _n.applyMatrix3(from3).normalize();
    normal.setXYZ(i, _n.x, _n.y, _n.z);
  }
  position.needsUpdate = true;
  if (normal) normal.needsUpdate = true;
}
