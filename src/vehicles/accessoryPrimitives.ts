// src/vehicles/accessoryPrimitives.ts — the shared first-party construction vocabulary for vehicle accessories
// (tank-accessories lane, 2026-10-05; owner: "any 3d thing that was old must be improved in our new version").
//
// The fleet's newest equipment (the Abrams X stowage sacks and molded containers, profiles/abramsSourceX*.ts) is
// built from rounded-section lofts, filleted molded stock and belts that follow the fabric; the older shared decor kit
// was assembled from boxes, squashed spheres and capsules. This module gives every shared accessory builder that newer
// grammar without importing a profile pack: molded boxes with filleted vertical edges and bevelled rims, sewn fabric
// lofts with pinched ends, a seated base and deterministic wrinkles, straps that wrap the actual fabric section, round
// members between points and swept tubes. Every constructor is deterministic (no Math.random), allocation-light at
// build time only, and returns a non-indexed, outward-facing BufferGeometry with normals and box-free UVs (callers
// project their own UVs). `detail` 0 is the coarse level (the far LOD and the mobile tier), 1 the near level.
import * as THREE from 'three';
import { mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type XY = readonly [number, number];
export type AccessoryDetail = 0 | 1;
export interface LoftSection { z: number; ring: readonly XY[] }

const TAU = Math.PI * 2;

/** Integer hash noise in [0, 1): stable across platforms, no state. */
export function hash01(a: number, b = 0, c = 0): number {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35)
    ^ Math.imul((c | 0) + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Smooth periodic wrinkle field over (angle, length): two incommensurate folds and a seeded phase. */
function wrinkle(angle: number, z: number, seed: number): number {
  const p = hash01(seed, 7) * TAU, q = hash01(seed, 11) * TAU;
  return Math.sin(angle * 3 + z * 9.1 + p) * 0.6 + Math.sin(angle * 5 - z * 14.3 + q) * 0.4;
}

/**
 * A closed loft along +Z through counterclockwise (seen from +Z) rings of equal length; stations ascend in Z. Faces
 * point outward (the same winding law as profiles/abramsSourceXGeometry.ts closedSectionLoft). Caps are optional so
 * open sleeves (straps, net skins) share the constructor.
 */
export function loftZ(sections: readonly LoftSection[], capStart = true, capEnd = true): THREE.BufferGeometry {
  if (sections.length < 2) throw new Error('accessoryPrimitives.loftZ: at least two sections');
  const n = sections[0].ring.length;
  if (n < 3 || sections.some((s) => s.ring.length !== n)) throw new Error('accessoryPrimitives.loftZ: rings differ');
  const positions: number[] = [];
  const p = (s: number, i: number): [number, number, number] => {
    const [x, y] = sections[s].ring[i];
    return [x, y, sections[s].z];
  };
  const tri = (a: readonly number[], b: readonly number[], c: readonly number[]): void => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };
  for (let s = 0; s < sections.length - 1; s++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      tri(p(s, i), p(s, j), p(s + 1, j));
      tri(p(s, i), p(s + 1, j), p(s + 1, i));
    }
  }
  const cap = (s: number, flip: boolean): void => {
    const contour = sections[s].ring.map(([x, y]) => new THREE.Vector2(x, y));
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, [])) {
      if (flip) tri(p(s, c), p(s, b), p(s, a)); else tri(p(s, a), p(s, b), p(s, c));
    }
  };
  if (capStart) cap(0, true);
  if (capEnd) cap(sections.length - 1, false);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return withBoxUV(geometry);
}

/**
 * World-scale box-projected UVs (the decor kit's boxUV recipe at 1 texel unit per metre): every accessory geometry
 * carries position, normal and uv so material families merge into one draw; callers rescale for their textures.
 */
export function withBoxUV(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geometry.attributes.position;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const nor = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    if (ny >= nx && ny >= nz) { uv[i * 2] = pos.getX(i); uv[i * 2 + 1] = pos.getZ(i); }
    else if (nx >= nz) { uv[i * 2] = pos.getZ(i); uv[i * 2 + 1] = pos.getY(i); }
    else { uv[i * 2] = pos.getX(i); uv[i * 2 + 1] = pos.getY(i); }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/** Counterclockwise rounded rectangle (half extents, corner radius, arc segments per corner; 0 = sharp). */
export function roundedRectRing(hw: number, hh: number, r: number, seg: number): XY[] {
  const rr = Math.max(0, Math.min(r, hw * 0.98, hh * 0.98));
  const corners: Array<[number, number, number]> = [[hw - rr, -hh + rr, -Math.PI / 2], [hw - rr, hh - rr, 0],
    [-hw + rr, hh - rr, Math.PI / 2], [-hw + rr, -hh + rr, Math.PI]];
  if (rr <= 1e-5 || seg < 1) return [[hw, -hh], [hw, hh], [-hw, hh], [-hw, -hh]];
  const steps = Math.max(1, seg | 0);
  const ring: XY[] = [];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (k / steps) * (Math.PI / 2);
      ring.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
  }
  return ring;
}

/** Rotate a +Z loft so its axis stands on +Y (a proper rotation: winding and orientation survive). */
function standUp(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/**
 * Molded / pressed stock: a box centred on the origin whose vertical edges are filleted (radius r, `seg` arc steps)
 * and whose top and bottom rims carry a bevel row, so every edge catches a highlight instead of reading as a
 * twelve-triangle block. Flat faces keep hard normals (creased at 50 degrees); fillets and bevels shade smooth.
 */
export function moldedBox(w: number, h: number, d: number, r = 0.02, seg = 2, bevel = r * 0.7): THREE.BufferGeometry {
  const hw = w / 2, hd = d / 2, b = Math.max(0, Math.min(bevel, h * 0.24, hw * 0.4, hd * 0.4));
  const rounded = r > 1e-5 && seg >= 1;
  const full = roundedRectRing(hw, hd, rounded ? r : 0, seg);
  const inset = roundedRectRing(hw - b, hd - b, rounded ? Math.max(r - b * 0.6, r * 0.3) : 0, seg);
  const sections: LoftSection[] = b > 1e-5
    ? [{ z: -h / 2, ring: inset }, { z: -h / 2 + b, ring: full }, { z: h / 2 - b, ring: full }, { z: h / 2, ring: inset }]
    : [{ z: -h / 2, ring: full }, { z: h / 2, ring: full }];
  // the ring lies in X/Y with Y = depth before standing up; standUp maps loft +Y to world -Z, so build with -depth
  const raw = standUp(loftZ(sections));
  const creased = toCreasedNormals(raw, (50 * Math.PI) / 180);
  if (creased !== raw) raw.dispose();
  return withBoxUV(creased);
}

export interface FabricSpec {
  /** Length along local +Z (the loft axis), metres. */
  len: number;
  /** Half width (X) and half height (Y) at the fullest section. */
  hw: number;
  hh: number;
  /** Superellipse exponent: 2 = round (bedroll), 3 = pillow, 4+ = boxy duffel. */
  exponent?: number;
  /** Radial segments and length stations at the near detail. */
  seg?: number;
  stations?: number;
  /** End radius as a share of the full section (0.2 = tightly gathered, 0.85 = a flat-ended roll). */
  endScale?: number;
  /** Share of the length over which each end gathers. */
  endLength?: number;
  /** Seated base: vertices below -hh * (1 - flatten) are pressed toward that plane (the bag rests on armor). */
  flatten?: number;
  /** Fold amplitude as a share of the section radius. */
  wrinkle?: number;
  /** Downward sag of the centre line (m) — a long bag drapes over its middle support. */
  sag?: number;
  /** Strap stations (local z): the fabric is cinched there and bulges between them; fabricStrap() wraps the same z. */
  cinch?: readonly number[];
  /** Cinch depth as a share of the section (0.08 = a firm webbing strap). */
  cinchDepth?: number;
  seed?: number;
  detail?: AccessoryDetail;
}

const CINCH_WIDTH = 0.06;

/** The fabric's section scale at local z (end gathering times every strap's cinch) and its fold share there. */
function fabricSection(spec: FabricSpec, z: number): { scale: number; drop: number; foldShare: number } {
  const t = THREE.MathUtils.clamp(z / spec.len + 0.5, 0, 1);
  const endLength = spec.endLength ?? 0.18, endScale = spec.endScale ?? 0.35;
  const edge = Math.min(t, 1 - t) / Math.max(endLength, 1e-3);
  let scale = edge >= 1 ? 1 : endScale + (1 - endScale) * Math.sin(Math.min(1, edge) * Math.PI / 2);
  let near = 0;
  for (const c of spec.cinch ?? []) {
    const k = Math.exp(-(((z - c) / CINCH_WIDTH) ** 2));
    near = Math.max(near, k);
  }
  scale *= 1 - (spec.cinchDepth ?? 0.08) * near;
  const drop = (spec.sag ?? 0) * Math.sin(Math.PI * t);
  return { scale, drop, foldShare: (0.35 + 0.65 * Math.sin(Math.PI * t)) * (1 - near) };
}

/** One superellipse ring of a fabric section (no folds when `amp` is 0), seated on its pressed base. */
function fabricRing(spec: FabricSpec, z: number, seg: number, amp: number, proud = 0): XY[] {
  const e = 2 / (spec.exponent ?? 3);
  const flatten = spec.flatten ?? 0.25;
  const seed = spec.seed ?? 1;
  const { scale, drop, foldShare } = fabricSection(spec, z);
  const floor = -spec.hh * (1 - flatten);
  const ring: XY[] = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * TAU;
    const c = Math.cos(a), s = Math.sin(a);
    const folds = 1 + amp * foldShare * wrinkle(a, z, seed);
    let x = Math.sign(c) * Math.pow(Math.abs(c), e) * spec.hw * scale * folds;
    let y = Math.sign(s) * Math.pow(Math.abs(s), e) * spec.hh * scale * folds;
    if (y < floor) { const under = floor - y; y = floor - under * 0.18; x *= 1 + (under / Math.max(spec.hh, 1e-3)) * 0.25; }
    if (proud) { const l = Math.hypot(x, y) || 1; x += (x / l) * proud; y += (y / l) * proud; }
    ring.push([x, y - drop]);
  }
  return ring;
}

function fabricSegments(spec: FabricSpec): number {
  return Math.max(6, Math.round((spec.seg ?? 14) * ((spec.detail ?? 1) ? 1 : 0.58)));
}

/**
 * A sewn fabric body along +Z, centred on the origin: superellipse sections, ends gathered toward their seams, a
 * pressed-flat base where it rests, cinched under its straps, and deterministic folds. Smooth normals (welded).
 */
export function fabricBody(spec: FabricSpec): THREE.BufferGeometry {
  const detail = spec.detail ?? 1;
  const seg = fabricSegments(spec);
  const count = Math.max(4, Math.round((spec.stations ?? 9) * (detail ? 1 : 0.6)));
  const amp = (spec.wrinkle ?? 0.045) * (detail ? 1 : 0.5);
  const zs = new Set<number>();
  for (let k = 0; k < count; k++) zs.add(+((k / (count - 1) - 0.5) * spec.len).toFixed(5));
  // one station on each strap line resolves its cinch at both levels (the fabric bulges between straps)
  for (const c of spec.cinch ?? []) if (Math.abs(c) < spec.len / 2 - 0.004) zs.add(+c.toFixed(5));
  const sections: LoftSection[] = [...zs].sort((a, b) => a - b).map((z) => ({ z, ring: fabricRing(spec, z, seg, amp) }));
  const raw = loftZ(sections);
  raw.deleteAttribute('normal');
  raw.deleteAttribute('uv');
  const welded = mergeVertices(raw, 1e-5);
  raw.dispose();
  welded.computeVertexNormals();
  const flat = welded.toNonIndexed();
  welded.dispose();
  return withBoxUV(flat);
}

/**
 * A webbing strap wrapping a fabric body at one of its `cinch` stations: an open band on the cinched section, a few
 * millimetres proud, outward faces only (its edges sit in the fabric's bulge). Width along Z in metres.
 */
export function fabricStrap(spec: FabricSpec, z: number, width = 0.03, proud = 0.005): THREE.BufferGeometry {
  const seg = fabricSegments(spec);
  return loftZ([{ z: z - width / 2, ring: fabricRing(spec, z - width / 2, seg, 0, proud) },
    { z: z + width / 2, ring: fabricRing(spec, z + width / 2, seg, 0, proud) }], false, false);
}

/**
 * The rolled face at each end of a roll lying along Z (length `len`, radius `r`, axis through the origin): two thin
 * concentric layer lines a couple of millimetres proud of each end cap, facing outward. Rolled layers rather than a
 * solid disc or a single ring (which read as a nut). Four 16-triangle rings.
 */
export function rolledEndLayers(r: number, len: number, segments = 8): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const end of [-1, 1]) {
    for (const [inner, outer] of [[0.3, 0.37], [0.6, 0.67]] as const) {
      const ring = new THREE.RingGeometry(r * inner, r * outer, segments, 1);
      const flat = ring.toNonIndexed();
      ring.dispose();
      flat.computeVertexNormals();
      out.push(withBoxUV(place(flat, 0, 0, end * (len / 2 + 0.002), 0, end > 0 ? 0 : Math.PI, 0)));
    }
  }
  return out;
}

/** A plain six-face block (12 triangles) for small hardware where a fillet would not read: latches, clips, ribs. */
export function block(w: number, h: number, d: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  return withBoxUV(flat);
}

/** A round member (bar, handle rung, chair leg) between two points; `seg` radial steps. */
export function roundBar(a: readonly number[], b: readonly number[], r: number, seg = 8): THREE.BufferGeometry {
  const start = new THREE.Vector3(a[0], a[1], a[2]), end = new THREE.Vector3(b[0], b[1], b[2]);
  const delta = end.clone().sub(start);
  const len = delta.length();
  if (len < 1e-6 || r <= 0) throw new Error('accessoryPrimitives.roundBar: degenerate member');
  const geometry = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
  geometry.translate((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  return flat;
}

/** A swept tube through points (centripetal Catmull-Rom): cables, rope handles, hoses, bent bars. */
export function sweptTube(points: ReadonlyArray<readonly number[]>, r: number, radial = 6, along = 12,
  closed = false): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), closed, 'centripetal');
  const geometry = new THREE.TubeGeometry(curve, along, r, radial, closed);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  return flat;
}

/** A lathe about +Y from (radius, y) stations (bottom to top), closed with flat caps when the ends are off-axis. */
export function latheY(profile: readonly XY[], seg = 16): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y));
  const geometry = new THREE.LatheGeometry(pts, seg);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  return flat;
}

/** Apply translation/rotation (XYZ Euler) to a geometry in place and return it (builder ergonomics). */
export function place(geometry: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0,
  scale: number | readonly [number, number, number] = 1): THREE.BufferGeometry {
  const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s[0], s[1], s[2]));
  geometry.applyMatrix4(m);
  return geometry;
}
