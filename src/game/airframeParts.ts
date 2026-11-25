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
  /** (aircraft-streaks-277) the team trim's vertex ranges (start, count): the markings holdTeamTrim paints in a side's
   *  colour, in the airframe's one geometry (no second material, no second draw). */
  readonly trim: number[] = [];
  private trimming = false;
  /** The parts `build` adds are team trim. */
  asTrim(build: () => void): void {
    this.trimming = true;
    try { build(); } finally { this.trimming = false; }
  }
  add(geometry: THREE.BufferGeometry, rgb: (x: number, y: number, z: number, i: number) => readonly number[]): void {
    if (this.trimming) this.trim.push(this.pos.length / 3, (geometry.index ? geometry.index.count : geometry.getAttribute('position').count));
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

/** A lifting surface's end, as surface() takes it. */
export interface SurfaceEnd { le: THREE.Vector3; chord: number; thick: number }
/** The section of a surface from `a` to `b` at span fraction `t` (past 1 runs on beyond the tip), `grow` larger all
 *  round: a band of paint laid over that part of the surface. */
export function sliceAt(a: SurfaceEnd, b: SurfaceEnd, t: number, grow = 0): SurfaceEnd {
  const le = a.le.clone().lerp(b.le, t);
  le.z += grow * 0.5;
  return { le, chord: a.chord + (b.chord - a.chord) * t + grow, thick: a.thick + (b.thick - a.thick) * t + grow };
}

/** (aircraft-streaks-277) The insignia white: a roundel's ring, and the trim's colour until a side paints it (the AC-130
 *  mode, the previews and renders). */
export const INSIGNIA = 0xd8dbd6;

/** A roundel lying on a surface at `centre`, facing `normal`: an insignia-white disc of radius r, and the team trim's
 *  disc inside it. */
export function roundel(parts: Parts, centre: THREE.Vector3, normal: THREE.Vector3, r: number): void {
  const n = normal.clone().normalize();
  rod(parts, centre.clone().addScaledVector(n, -0.02), n, r, 0.04, INSIGNIA, 24);
  parts.asTrim(() => rod(parts, centre.clone().addScaledVector(n, -0.02), n, r * 0.68, 0.06, INSIGNIA, 24));
}

const PAINT_TEAM = 'paintTeam', WEATHER = 'weatherAirframe';
/** (aircraft-solid-277) How a wreck broke, in the airframe's frame (the sim's: sim/airframeVolumes.ts wreckBoxes): the
 *  torn wing's side (+1 the port, -1 the starboard), the span its tear stands at (m from the centre line), and the nose's
 *  crumpled end (z, m) with the z its crumple begins at. */
export interface AirframeTear { readonly wing: 1 | -1; readonly tearX: number; readonly noseZ: number; readonly crumpleFromZ: number;
  /** The drawn nose's tip (z, m): the crumple brings it back to noseZ. */
  readonly tipZ: number;
  /** The fuselage's half width: the wing is torn only outboard of it. */
  readonly bodyHalfX: number }

const SOOT = lin(0x0b0a09), BURNT = lin(0x3a2414), METAL = lin(0x8d9096);
/** A hash of an integer lattice point into [0, 1). */
function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(z | 0, 0xcb1ab31f) ^ Math.imul(seed | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
/** Smooth value noise in [0, 1) at (x, y, z) (lattice units). */
function noise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  let out = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
    out += hash3(ix + dx, iy + dy, iz + dz, seed) * (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy) * (dz ? sz : 1 - sz);
  }
  return out;
}
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Make `geometry`'s team trim (Parts.trim) paintable through `root`, and its skin weatherable: paintTeamTrim(root, colour)
 * writes the trim's colour, weatherAirframe(root, soot, tear) scorches the skin and (a wreck) tears it. Both rewrite the
 * one colour stream only when what they ask for changes (no second material, no second draw, nothing per frame).
 */
export function holdTeamTrim(root: THREE.Object3D, geometry: THREE.BufferGeometry, ranges: readonly number[]): void {
  const attribute = geometry.getAttribute('color') as THREE.BufferAttribute;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const count = attribute.count;
  const trim = new Uint8Array(count);
  for (let i = 0; i < ranges.length; i += 2) trim.fill(1, ranges[i]!, ranges[i]! + ranges[i + 1]!);
  let clean: Float32Array | null = null, cleanPos: Float32Array | null = null, torn: Uint8Array | null = null;
  const team = new THREE.Color();
  let painted = -1, soot = 0, tear: AirframeTear | null = null;
  const render = (): void => {
    const a = attribute.array as Float32Array;
    clean ??= Float32Array.from(a);
    for (let v = 0; v < count; v++) {
      const o = v * 3;
      const isTrim = trim[v] === 1;
      let r = isTrim && painted >= 0 ? team.r : clean[o]!, g = isTrim && painted >= 0 ? team.g : clean[o + 1]!, b = isTrim && painted >= 0 ? team.b : clean[o + 2]!;
      if (soot > 0) {
        const src = cleanPos ?? (position.array as Float32Array);
        const px = src[o]!, py = src[o + 1]!, pz = src[o + 2]!;
        const n = noise3(px * 0.45, py * 0.45, pz * 0.45, 7);
        // a panel's own tone: each triangle a shade apart, the skin's riveted plates
        const panel = (hash3(Math.floor(v / 3), 0, 0, 3) - 0.5) * (tear ? 0.2 : 0.08);
        let char: number;
        if (tear) {
          // the wreck: burned over, darkest where the fire was (the nose that ploughed in, round the engines)
          char = Math.min(0.95, 0.62 + 0.36 * n + (pz > tear.crumpleFromZ - 3 ? 0.15 : 0));
        } else {
          // in flight: scorch patches that grow with the damage
          char = Math.max(0, Math.min(1, (n - (1 - soot)) / 0.22)) * 0.85;
        }
        // the markings keep the side legible on any wreck (a scorched, never a blackened, roundel)
        if (isTrim) char = Math.min(char, 0.38);
        r = mix(r, SOOT[0]!, char); g = mix(g, SOOT[1]!, char); b = mix(b, SOOT[2]!, char);
        if (tear && !isTrim) {
          // blistered paint gone brown, and bare metal where the skin scraped or tore
          const blister = noise3(px * 1.3, py * 1.3, pz * 1.3, 11);
          if (blister > 0.62) { const k = Math.min(1, (blister - 0.62) * 3); r = mix(r, BURNT[0]!, k); g = mix(g, BURNT[1]!, k); b = mix(b, BURNT[2]!, k); }
          const scrape = noise3(px * 3.1, py * 3.1, pz * 3.1, 19);
          const metal = torn![v] ? 0.85 : scrape > 0.8 ? (scrape - 0.8) * 3.5 : 0;
          if (metal > 0) { r = mix(r, METAL[0]!, metal); g = mix(g, METAL[1]!, metal); b = mix(b, METAL[2]!, metal); }
        }
        r = Math.max(0, r * (1 + panel)); g = Math.max(0, g * (1 + panel)); b = Math.max(0, b * (1 + panel));
      }
      a[o] = r; a[o + 1] = g; a[o + 2] = b;
    }
    attribute.needsUpdate = true;
  };
  /** The wreck's torn wing and crumpled nose, moved in the clean positions' copy (kept, so the tear is applied once). */
  const tearSkin = (cut: AirframeTear): void => {
    const p = position.array as Float32Array;
    cleanPos ??= Float32Array.from(p);
    torn = new Uint8Array(count);
    const span = cut.crumpleFromZ, squash = Math.max(0.05, (cut.noseZ - span) / Math.max(0.01, cut.tipZ - span));
    for (let v = 0; v < count; v++) {
      const o = v * 3;
      let x = cleanPos[o]!, y = cleanPos[o + 1]!, z = cleanPos[o + 2]!;
      const outboard = x * cut.wing;
      // the torn wing ends at a ragged line (each torn vertex short of it by its own jag)
      if (outboard > cut.tearX && outboard > cut.bodyHalfX) {
        const jag = hash3(Math.round(z * 4), Math.round(y * 8), 0, 23) * 0.45;
        x = cut.wing * (cut.tearX - jag);
        y -= 0.15 + jag * 0.4;
        torn[v] = 1;
      }
      // the nose, crushed back into the fuselage behind it and folded
      if (z > span) {
        const into = Math.min(1, (z - span) / Math.max(0.01, cut.tipZ - span));
        z = span + (z - span) * squash;
        x *= 1 - 0.18 * into; y = y * (1 - 0.18 * into) - 0.25 * into;
        if (into > 0.35) torn[v] = 1;
      }
      p[o] = x; p[o + 1] = y; p[o + 2] = z;
    }
    position.needsUpdate = true;
    geometry.computeBoundingSphere();
  };
  root.userData[PAINT_TEAM] = (colour: THREE.Color): void => {
    const key = colour.getHex();
    if (key === painted) return;
    painted = key;
    team.copy(colour);
    render();
  };
  root.userData[WEATHER] = (level: number, cut: AirframeTear | null): void => {
    if (level === soot && cut === tear) return;
    if (cut && !tear) tearSkin(cut);
    soot = level; tear = cut ?? tear;
    render();
  };
}
/** Paint the airframe under `root` (one holdTeamTrim made paintable) in `colour`; false when it has no team trim. */
export function paintTeamTrim(root: THREE.Object3D, colour: THREE.Color): boolean {
  const paint = root.userData[PAINT_TEAM] as ((colour: THREE.Color) => void) | undefined;
  if (!paint) return false;
  paint(colour);
  return true;
}
/** (aircraft-solid-277) Weather the airframe under `root`: `soot` 0..1 its scorch (a struck aircraft's damage state), and
 *  with `tear` its wreck (burned, blistered, its torn wing and crumpled nose bare metal). False without a skin. */
export function weatherAirframe(root: THREE.Object3D, soot: number, tear: AirframeTear | null = null): boolean {
  const weather = root.userData[WEATHER] as ((level: number, cut: AirframeTear | null) => void) | undefined;
  if (!weather) return false;
  weather(soot, tear);
  return true;
}
