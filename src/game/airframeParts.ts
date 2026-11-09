/**
 * airframeParts.ts — the construction kit of the procedural aircraft (air-support-270, moved out of gunshipAirframe.ts so
 * the AC-130 and the strike jet share it): vertex colours from hex, a merged-triangle collector, the lofted body of
 * rounded-square sections, the NACA-like lifting surface with its de-icing boots, rods and boxes. Every part lands in one
 * non-indexed position/normal/colour stream, so an airframe is one draw on one lit material. First-party procedural
 * geometry; Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import * as THREE from 'three';

/** The AC-130's gunship grey and its black de-icing boots: the kit's defaults (a part may pass its own). */
const GREY = 0x5d6468, BOOT = 0x26292c;

const _c = new THREE.Color();
export const lin = (hex: number): [number, number, number] => { _c.setHex(hex); return [_c.r, _c.g, _c.b]; };

/** A part's triangles (non-indexed position, normal and colour arrays) collected for one merged geometry. */
export class Parts {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly col: number[] = [];
  add(geometry: THREE.BufferGeometry, rgb: (x: number, y: number, z: number, i: number) => readonly number[]): void {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      this.pos.push(x, y, z);
      this.nrm.push(n.getX(i), n.getY(i), n.getZ(i));
      const c = rgb(x, y, z, i);
      this.col.push(c[0]!, c[1]!, c[2]!);
    }
    if (g !== geometry) g.dispose();
    geometry.dispose();
  }
  geometry(): THREE.BufferGeometry {
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    out.computeBoundingSphere();
    return out;
  }
}

/** A lofted body along z: rings of a rounded-square section (centre y, half width, half height) and, per ring, a
 *  colour band; equal z at two rings makes a crisp band edge. Indexed, smooth normals. */
export interface Station { z: number; cy: number; rx: number; ry: number; band?: number }
function loft(stations: readonly Station[], seg: number, cx = 0, power = 2.6,
  colourOf: (s: Station, sx: number, sy: number) => readonly number[] = () => lin(GREY)):
  { geometry: THREE.BufferGeometry; colours: number[] } {
  const pos: number[] = [], colours: number[] = [], index: number[] = [];
  for (const s of stations) {
    for (let k = 0; k < seg; k++) {
      const t = (k / seg) * Math.PI * 2;
      const c = Math.cos(t), sn = Math.sin(t);
      // a superellipse: flat-ish sides, rounded corners (the C-130's section)
      const sx = Math.sign(c) * Math.pow(Math.abs(c), 2 / power), sy = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / power);
      pos.push(cx + sx * s.rx, s.cy + sy * s.ry, s.z);
      const col = colourOf(s, sx, sy);
      colours.push(col[0]!, col[1]!, col[2]!);
    }
  }
  for (let i = 0; i < stations.length - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const a = i * seg + k, b = i * seg + (k + 1) % seg, c = (i + 1) * seg + k, d = (i + 1) * seg + (k + 1) % seg;
      // wound so the outward face is front-facing (the angle turns +x to +y, z falls station to station)
      index.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return { geometry, colours };
}
export function addLoft(parts: Parts, stations: readonly Station[], seg: number, cx = 0, power = 2.6,
  colourOf?: (s: Station, sx: number, sy: number) => readonly number[]): void {
  const { geometry, colours } = loft(stations, seg, cx, power, colourOf);
  // the indexed colours, carried through the non-indexed expansion by the index
  const idx = geometry.index!;
  let n = 0;
  parts.add(geometry, () => { const v = idx.getX(n++); return [colours[v * 3]!, colours[v * 3 + 1]!, colours[v * 3 + 2]!]; });
}

/** A lifting surface: an airfoil from root to tip along `span` (unit axis), its chords along -z from each leading edge. */
export function surface(parts: Parts, root: { le: THREE.Vector3; chord: number; thick: number },
  tip: { le: THREE.Vector3; chord: number; thick: number }, thicknessAxis: THREE.Vector3, bootK: number,
  bodyHex = GREY, bootHex = BOOT): void {
  // a NACA-like section: x along the chord (0 leading edge), the half thickness
  const xs = [0, 0.02, 0.07, 0.16, 0.3, 0.5, 0.72, 1];
  const half = (x: number): number => 5 * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const ring: Array<[number, number]> = [];
  for (const x of xs) ring.push([x, half(x)]);
  for (let i = xs.length - 2; i >= 1; i--) ring.push([xs[i]!, -half(xs[i]!)]);
  const at = (end: typeof root, [x, h]: [number, number], out: THREE.Vector3): THREE.Vector3 =>
    out.copy(end.le).add(new THREE.Vector3(0, 0, -x * end.chord)).addScaledVector(thicknessAxis, h * end.thick);
  const pos: number[] = [], index: number[] = [], boot: number[] = [];
  const v = new THREE.Vector3();
  for (const end of [root, tip]) for (const p of ring) { at(end, p, v); pos.push(v.x, v.y, v.z); boot.push(p[0] < 0.05 ? 1 : 0); }
  const n = ring.length;
  for (let k = 0; k < n; k++) {
    const a = k, b = (k + 1) % n, c = n + k, d = n + (k + 1) % n;
    index.push(a, c, b, b, c, d);
  }
  // the tip's cap (a fan): the root sits inside the fuselage
  for (let k = 1; k < n - 1; k++) index.push(n, n + k + 1, n + k);
  // outward: the first upper-surface face's normal along the thickness axis, else every face turned over
  {
    const p0 = new THREE.Vector3(pos[0], pos[1], pos[2]), p1 = new THREE.Vector3(pos[3], pos[4], pos[5]);
    const pn = new THREE.Vector3(pos[n * 3], pos[n * 3 + 1], pos[n * 3 + 2]);
    const normal = pn.sub(p0).cross(p1.sub(p0));
    if (normal.dot(thicknessAxis) < 0) for (let t = 0; t < index.length; t += 3) { const k = index[t + 1]!; index[t + 1] = index[t + 2]!; index[t + 2] = k; }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setIndex(index);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  flat.computeVertexNormals();
  const grey = lin(bodyHex), dark = lin(bootHex);
  let i = 0;
  const idx = index;
  parts.add(flat, () => { const vtx = idx[i++]!; return bootK > 0 && boot[vtx] === 1 ? dark : grey; });
}

/** A cylinder along the local axis `dir` from `from`, radius r, length len (a barrel, an exhaust stack). */
export function rod(parts: Parts, from: THREE.Vector3, dir: THREE.Vector3, r: number, len: number, hex: number, seg = 8): void {
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  g.translate(from.x, from.y, from.z);
  const c = lin(hex);
  parts.add(g, () => c);
}

export function box(parts: Parts, w: number, h: number, d: number, x: number, y: number, z: number, hex: number): void {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const c = lin(hex);
  parts.add(g, () => c);
}
