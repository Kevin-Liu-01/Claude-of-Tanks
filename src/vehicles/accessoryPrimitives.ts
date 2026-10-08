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
  /** Half-width of a strap's pinch along z (m; default 0.06, a soft cinch). */
  cinchWidth?: number;
  /** The fabric pressed out between straps, as a share of the section (default 0). */
  bulge?: number;
  /**
   * A roll pinched under its straps (2026-10-07, round 4): loft stations at each strap and at its two shoulders
   * (strap +- 1.25 cinchWidth), plus the two ends and `stations` - 2 evenly spaced interior stations clear of the
   * straps, instead of the even spread, so a narrow pinch resolves without adding rings.
   */
  shoulders?: boolean;
  seed?: number;
  detail?: AccessoryDetail;
}

const CINCH_WIDTH = 0.06;
/** A pinched roll's shoulder stations sit this many cinch widths either side of each strap. */
const SHOULDER_K = 1.25;

/** The fabric's section scale at local z (end gathering times every strap's cinch) and its fold share there. */
function fabricSection(spec: FabricSpec, z: number): { scale: number; drop: number; foldShare: number } {
  const t = THREE.MathUtils.clamp(z / spec.len + 0.5, 0, 1);
  const endLength = spec.endLength ?? 0.18, endScale = spec.endScale ?? 0.35;
  const edge = Math.min(t, 1 - t) / Math.max(endLength, 1e-3);
  let scale = edge >= 1 ? 1 : endScale + (1 - endScale) * Math.sin(Math.min(1, edge) * Math.PI / 2);
  const width = spec.cinchWidth ?? CINCH_WIDTH;
  let near = 0, gap = Infinity;
  for (const c of spec.cinch ?? []) {
    const k = Math.exp(-(((z - c) / width) ** 2));
    near = Math.max(near, k);
    gap = Math.min(gap, Math.abs(z - c));
  }
  scale *= 1 - (spec.cinchDepth ?? 0.08) * near;
  // 2026-10-07 (round 4, wave 214: "the rolled tarp ... no strap-compression bulges"): the cloth a strap squeezes out
  // swells the roll between its straps, so each strap sits in a groove instead of a band painted round a pipe
  if (spec.bulge && Number.isFinite(gap)) scale *= 1 + spec.bulge * (1 - Math.exp(-((gap / (width * 1.6)) ** 2)));
  const drop = (spec.sag ?? 0) * Math.sin(Math.PI * t);
  return { scale, drop, foldShare: (0.35 + 0.65 * Math.sin(Math.PI * t)) * (1 - near) };
}

/** The loft stations of a fabric body (ascending z). */
function fabricStations(spec: FabricSpec, detail: AccessoryDetail): number[] {
  const zs = new Set<number>();
  const cinch = (spec.cinch ?? []).filter((c) => Math.abs(c) < spec.len / 2 - 0.004);
  if (spec.shoulders) {
    const width = spec.cinchWidth ?? CINCH_WIDTH, s = width * SHOULDER_K;
    for (const end of [-1, 1]) zs.add(+(end * spec.len / 2).toFixed(5));
    // the coarse level (28 m and beyond) keeps the strap stations only: the pinch, without its shoulders
    for (const c of cinch) for (const dz of detail ? [-s, 0, s] : [0]) {
      if (Math.abs(c + dz) < spec.len / 2 - 0.01) zs.add(+(c + dz).toFixed(5));
    }
    const interior = Math.max(0, (spec.stations ?? 2) - 2);
    for (let k = 1; k <= interior; k++) {
      const z = (k / (interior + 1) - 0.5) * spec.len;
      if (cinch.every((c) => Math.abs(z - c) > s * 1.6)) zs.add(+z.toFixed(5));
    }
    return [...zs].sort((a, b) => a - b);
  }
  const count = Math.max(4, Math.round((spec.stations ?? 9) * (detail ? 1 : 0.6)));
  for (let k = 0; k < count; k++) zs.add(+((k / (count - 1) - 0.5) * spec.len).toFixed(5));
  // one station on each strap line resolves its cinch at both levels (the fabric bulges between straps)
  for (const c of cinch) zs.add(+c.toFixed(5));
  return [...zs].sort((a, b) => a - b);
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
  const amp = (spec.wrinkle ?? 0.045) * (detail ? 1 : 0.5);
  const sections: LoftSection[] = fabricStations(spec, detail).map((z) => ({ z, ring: fabricRing(spec, z, seg, amp) }));
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

/** One point of a fabric section at angle `a` (fabricRing's construction at an arbitrary angle), `proud` off it. */
function fabricPoint(spec: FabricSpec, z: number, a: number, amp: number, proud: number): XY {
  const e = 2 / (spec.exponent ?? 3);
  const flatten = spec.flatten ?? 0.25;
  const { scale, drop, foldShare } = fabricSection(spec, z);
  const floor = -spec.hh * (1 - flatten);
  const c = Math.cos(a), s = Math.sin(a);
  const folds = 1 + amp * foldShare * wrinkle(a, z, spec.seed ?? 1);
  let x = Math.sign(c) * Math.pow(Math.abs(c), e) * spec.hw * scale * folds;
  let y = Math.sign(s) * Math.pow(Math.abs(s), e) * spec.hh * scale * folds;
  if (y < floor) { const under = floor - y; y = floor - under * 0.18; x *= 1 + (under / Math.max(spec.hh, 1e-3)) * 0.25; }
  const l = Math.hypot(x, y) || 1;
  return [x + (x / l) * proud, y + (y / l) * proud - drop];
}

/**
 * An open sleeve over part of a fabric body along +Z (round 4, 2026-10-07: a camouflage net's own skin over its
 * roll, where a rigid half-cylinder stood proud of the roll with dead-straight hems): at each of the body's loft
 * stations it spans the section from `cover(z)[0]` to `cover(z)[1]` (the section's own angle, radians; pi / 2 is the
 * top) `proud(z)` metres off the fabric, so it follows every pinch and swell, and its hem is wherever `cover` puts
 * it. Open (net material is seen from both sides), `arc` quads round, normals and box UVs like the kit's geometry.
 */
export function fabricSleeve(spec: FabricSpec, cover: (z: number) => readonly [number, number], proud: (z: number) => number,
  arc = 7): THREE.BufferGeometry {
  const detail = spec.detail ?? 1;
  const amp = (spec.wrinkle ?? 0.045) * (detail ? 1 : 0.5);
  const rows = fabricStations(spec, detail).map((z) => {
    const [a0, a1] = cover(z), pr = proud(z);
    const row: Array<[number, number, number]> = [];
    for (let j = 0; j <= arc; j++) {
      const [x, y] = fabricPoint(spec, z, a0 + ((a1 - a0) * j) / arc, amp, pr);
      row.push([x, y, z]);
    }
    return row;
  });
  const positions: number[] = [];
  for (let k = 0; k < rows.length - 1; k++) {
    for (let j = 0; j < arc; j++) {
      const a = rows[k][j], b = rows[k][j + 1], c = rows[k + 1][j + 1], d = rows[k + 1][j];
      positions.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return withBoxUV(geometry);
}

/** How deep a strap's edges sink into the fabric it cinches (m). */
const STRAP_SINK = 0.004;

/**
 * A webbing strap wrapping a fabric body at one of its `cinch` stations: a band on the cinched section, its crown a
 * few millimetres proud and both edges sunk into the fabric. Width along Z in metres. 2026-10-06 (the finish lane):
 * the band's edges were proud too, so where the body tapers its inside showed past them, and the sealed-hull census
 * counts an inside seen from outside as a hole (seven hulls regressed through rack loads and profile stowage). With
 * its edges buried, the band's inside is enclosed by the fabric from every exterior view; the crown ring keeps the
 * webbing's proud face.
 */
export function fabricStrap(spec: FabricSpec, z: number, width = 0.03, proud = 0.005): THREE.BufferGeometry {
  const seg = fabricSegments(spec);
  return loftZ([
    { z: z - width / 2, ring: fabricRing(spec, z - width / 2, seg, 0, -STRAP_SINK) },
    { z, ring: fabricRing(spec, z, seg, 0, proud) },
    { z: z + width / 2, ring: fabricRing(spec, z + width / 2, seg, 0, -STRAP_SINK) },
  ], false, false);
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

/**
 * The rolled face at one end of a roll lying along +Z (radius `r`, end plane at z = `zEnd`, `facing` +1 for the +Z end):
 * an Archimedean ribbon wound from near the core to near the rim a couple of millimetres proud of the end cap, so the end
 * reads as rolled cloth. 2026-10-07 (tank-accessories round 3: the blind critics read the two eight-segment concentric
 * rings of rolledEndLayers as "eight visible facets" up close): `steps` ribbon quads, two triangles each.
 */
export function rolledEndSpiral(r: number, zEnd: number, facing: 1 | -1, steps = 18, turns = 1.6): THREE.BufferGeometry {
  const r0 = r * 0.14, r1 = r * 0.8, half = r * 0.045;
  const z = zEnd + facing * 0.002;
  const at = (k: number, edge: number): THREE.Vector3 => {
    const u = k / steps;
    const a = u * turns * TAU + (facing > 0 ? 0 : Math.PI);
    const rr = r0 + (r1 - r0) * u + edge * half * (0.6 + 0.4 * u);
    return new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, z);
  };
  const positions: number[] = [];
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => {
    // every triangle faces out of the end (+Z at the +Z end, -Z at the other)
    const flip = ab.subVectors(b, a).cross(ac.subVectors(c, a)).z * facing < 0;
    for (const v of flip ? [a, c, b] : [a, b, c]) positions.push(v.x, v.y, v.z);
  };
  for (let k = 0; k < steps; k++) {
    const a0 = at(k, -1), a1 = at(k, 1), b0 = at(k + 1, -1), b1 = at(k + 1, 1);
    tri(a0, b0, b1);
    tri(a0, b1, a1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return withBoxUV(geometry);
}

/**
 * A firm fabric roll lying along +X, centred on its axis (a rolled tarp, an anti-thermal cover, a canvas bundle): round
 * sections with flat rolled ends, pinched under the caller's straps at `cinch` (local x), and the wound spiral on both
 * ends. 2026-10-07 (round 3): the profile packs' plain 12-16 sided cylinders read as pipes with visible facets.
 */
export function fabricRollParts(len: number, r: number, cinch: readonly number[], seg = 18, seed = 71):
  { body: THREE.BufferGeometry; ends: THREE.BufferGeometry[] } {
  const spec: FabricSpec = { len, hw: r, hh: r, exponent: 2.1, endScale: 0.93, endLength: 0.04, flatten: 0, wrinkle: 0.025,
    seg, stations: 5, cinch, cinchDepth: 0.08, seed };
  const alongX = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => place(geometry, 0, 0, 0, 0, Math.PI / 2, 0);
  const steps = Math.max(14, Math.round(seg * 1.1));
  return {
    body: alongX(fabricBody(spec)),
    ends: ([-1, 1] as const).map((end) => alongX(rolledEndSpiral(r * 0.93, end * len / 2, end, steps))),
  };
}

/**
 * A 200 L class steel drum as a lathe along +Y from y = 0 to `len`: rolled chimes at both heads and two rolling hoops
 * (round 3: the T-90M's rear drums were plain canvas-green cylinders).
 */
function drumLathe(R: number, len: number, seg = 16, hoops = true, bold = false): THREE.BufferGeometry {
  // round 5 (`bold`, the Type 99A's half-metre drums): the rolling hoops stand 18 mm proud, a swaged rib runs between
  // each hoop and its head, and the chimes are rolled beads 12 mm proud
  const hoop = (y: number): XY[] => [[R, y - 0.016], [R + (bold ? 0.018 : 0.012), y], [R, y + 0.016]];
  const rib = (y: number): XY[] => [[R, y - 0.009], [R + 0.007, y], [R, y + 0.009]];
  const chime = bold ? 0.012 : 0.004;
  return latheY([[0.0005, 0.01], [R - 0.012, 0.012], [R + chime, 0], ...(bold ? [[R + chime * 0.6, 0.012] as XY] : []), [R, 0.02],
    ...(hoops && bold ? rib(len * 0.13) : []),
    ...(hoops ? [...hoop(len * 0.29), ...hoop(len * 0.71)] : []),
    ...(hoops && bold ? rib(len * 0.87) : []),
    [R, len - 0.02], ...(bold ? [[R + chime * 0.6, len - 0.012] as XY] : []), [R + chime, len], [R - 0.012, len - 0.012],
    [0.0005, len - 0.01]], seg);
}

export interface FuelDrumSpec {
  /** Shell radius and length (metres); the drum stands on local +Y from y = 0 to `len`. */
  r: number;
  len: number;
  seg?: number;
  /** Strap stations as shares of the length: each band stands 4 mm proud of the shell and carries a buckle. */
  straps?: readonly number[];
  /** Bearing of every buckle about +Y (radians; a point at bearing a sits at (r sin a, y, r cos a)). */
  buckleAt?: number;
  /** The head that carries the two bung caps: 1 the top (y = len), -1 the bottom (y = 0), 0 none. */
  bungHead?: -1 | 0 | 1;
  detail?: AccessoryDetail;
  /** Heavy rims and ribs (round 5): see drumLathe. */
  bold?: boolean;
  /**
   * The drum's issue paint, linear (round 5): the body bakes its colours into a `color` attribute for the vehicle's
   * vertex-coloured matte draw (`bark`): the paint mottled, rust where the straps chafe, a fuel stain run from the bung
   * head along the crown, grime in the chimes, the hoops' crests worn to steel, and two shallow dents, all to `seed`.
   * The crown is the drum's local -X (the bearing that lies uppermost when the drum is laid along X, alongX callers).
   */
  paint?: readonly [number, number, number];
  seed?: number;
}

export interface FuelDrumParts {
  /** The shell: rolled chimes round both recessed heads and two rolling hoops (near level). */
  body: THREE.BufferGeometry;
  /** Raised steel strap bands. */
  straps: THREE.BufferGeometry[];
  /** Strap buckles and their tension bolts, and the two bung caps on the chosen head (near level). */
  hardware: THREE.BufferGeometry[];
}

/**
 * A 200 L class steel fuel drum with its retaining straps (2026-10-07, tank-accessories round 4; wave 214 on the T-90M:
 * "glossy horizontal banding, and stark white blotches on the end caps"; wave 215 on the Type 99A: "the left rear fuel
 * drum ends in a squared, flat block instead of a round cap", "a strap on the near cylinder is a flat colour band, not
 * raised"). Round heads recessed inside rolled chimes, two rolling hoops, two bung caps on one head, strap bands
 * standing proud of the shell with a buckle and bolt each. World-scale box UVs (one unit per metre) so the paint's
 * normal and roughness maps keep their size. The coarse level drops the hoops, buckles and bungs.
 */
export function fuelDrumParts(spec: FuelDrumSpec): FuelDrumParts {
  const R = spec.r, len = spec.len, detail = spec.detail ?? 1;
  const seg = spec.seg ?? (detail ? 18 : 10);
  const body = withBoxUV(drumLathe(R, len, seg, detail === 1, spec.bold === true));
  if (spec.paint) weatherDrumBody(body, R, len, spec.paint, spec.straps ?? [], spec.bungHead ?? 0, spec.seed ?? 1, detail);
  const straps: THREE.BufferGeometry[] = [];
  const hardware: THREE.BufferGeometry[] = [];
  const bearing = spec.buckleAt ?? 0;
  for (const share of spec.straps ?? []) {
    const y = share * len;
    // the band's edges dive 2 mm under the shell so no seam opens; its crown is 4.5 mm proud
    straps.push(withBoxUV(latheY([[R - 0.002, y - 0.017], [R + 0.0035, y - 0.0145], [R + 0.0045, y],
      [R + 0.0035, y + 0.0145], [R - 0.002, y + 0.017]], seg)));
    if (!detail) continue;
    // the buckle: a block on the band and the tension bolt through it, both along the band's tangent
    const buckle = block(0.042, 0.03, 0.014);
    place(buckle, 0, y, R + 0.0095);
    place(buckle, 0, 0, 0, 0, bearing, 0);
    hardware.push(withBoxUV(buckle));
    const bolt = roundBar([-0.036, 0, 0], [0.036, 0, 0], 0.0055, 6);
    place(bolt, 0, y, R + 0.0165);
    place(bolt, 0, 0, 0, 0, bearing, 0);
    hardware.push(withBoxUV(bolt));
  }
  if (detail && spec.bungHead) {
    const top = spec.bungHead > 0;
    const headY = top ? len - 0.011 : 0.011;
    for (const [dx, r] of [[R * 0.52, 0.03], [-R * 0.55, 0.017]] as const) {
      // a threaded plug with a raised hex: from the recessed head to 1 mm under the chime
      const cap = latheY([[r, 0], [r, 0.006], [r * 0.72, 0.008], [r * 0.72, 0.011]], 10);
      if (!top) place(cap, 0, 0, 0, Math.PI, 0, 0);
      hardware.push(withBoxUV(place(cap, dx, headY, 0)));
    }
  }
  return { body, straps, hardware };
}

/**
 * Fuel drum issue paints, linear albedo (round 5; the wave-257 rule "military kit only, in service colours"): olive
 * drab, dark green, faded green-grey and sand. Never the scheme's fitting paint, which a desert scheme turns orange
 * under the warm key (wave 269 on the T-90M: "a bright orange plastic-looking cylinder at the rear left").
 */
export const DRUM_ISSUE_PAINTS: ReadonlyArray<readonly [number, number, number]> = [
  [0.075, 0.085, 0.036], [0.0423, 0.0685, 0.0319], [0.117, 0.133, 0.0844], [0.314, 0.238, 0.117],
];

// Round 5 drum weathering colours, linear: a dark rust brown, never an orange (sRGB 84, 52, 34), and steel worn bright
// through the paint (96, 94, 88)
const DRUM_RUST: Rgb3 = [0.0887, 0.0343, 0.016];
const DRUM_STEEL: Rgb3 = [0.117, 0.112, 0.0976];

/** Bake a painted drum's colours and dents (see FuelDrumSpec.paint); `body` is the drum's own frame (+Y the axis). */
function weatherDrumBody(body: THREE.BufferGeometry, R: number, len: number, paint: Rgb3, straps: readonly number[],
  bungHead: number, seed: number, detail: AccessoryDetail): void {
  const pos = body.getAttribute('position');
  // two shallow dents in the shell, between the hoops (near level only)
  const dents = detail ? [0, 1].map((k) => ({ a: hash01(seed, 81, k) * TAU, y: len * (0.36 + 0.28 * hash01(seed, 83, k)),
    depth: 0.004 + 0.004 * hash01(seed, 87, k) })) : [];
  const gap = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = Math.hypot(v.x, v.z);
    if (r < R - 0.003 || r > R + 0.003) continue;                     // the plain shell only, not hoops or heads
    const a = Math.atan2(v.x, v.z);
    for (const dent of dents) {
      const d2 = (gap(a, dent.a) * R / 0.06) ** 2 + ((v.y - dent.y) / 0.06) ** 2;
      if (d2 < 1) {
        const k = 1 - (dent.depth * (1 - d2)) / r;
        pos.setXYZ(i, v.x * k, v.y, v.z * k);
      }
    }
  }
  body.computeVertexNormals();
  const crown = -Math.PI / 2 + (hash01(seed, 89) - 0.5) * 0.6;           // the stain's bearing, near the top
  const color = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = Math.hypot(v.x, v.z), a = Math.atan2(v.x, v.z), y = v.y;
    const mottle = 0.92 + 0.08 * Math.sin(a * 3 + y * 9 + seed) * Math.sin(a * 5 - y * 4 + seed * 2);
    let c: Rgb3 = scale3(paint, mottle);
    // grime in the chimes and on the heads
    if (y < 0.022 || y > len - 0.022 || r < R - 0.01) c = scale3(mix3(c, DRUM_RUST, 0.14), 0.7);
    // worn hoop and rib crests
    else if (r > R + 0.005) c = mix3(c, DRUM_STEEL, Math.min(0.5, (r - R - 0.005) * 40));
    // rust where each strap chafes, patchy round the drum
    for (const share of straps) {
      const g = (y - share * len) / 0.04;
      const rust = Math.exp(-g * g) * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(a * 4 + seed + share * 7)));
      c = mix3(c, DRUM_RUST, Math.min(0.6, rust * 0.7));
    }
    // a fuel stain run from the bung head along the crown, darker and fading
    if (bungHead) {
      const fromHead = bungHead > 0 ? len - y : y;
      const across = gap(a, crown) / 0.32;
      const stain = Math.exp(-across * across) * Math.max(0, 1 - fromHead / (len * 0.55));
      c = scale3(mix3(c, DRUM_RUST, stain * 0.3), 1 - stain * 0.45);
    }
    color[i * 3] = c[0]; color[i * 3 + 1] = c[1]; color[i * 3 + 2] = c[2];
  }
  body.setAttribute('color', new THREE.BufferAttribute(color, 3));
}

export interface BarkLogSpec {
  /** Length along local +X (metres) and radius at the butt (the -X end). */
  len: number;
  r: number;
  seed?: number;
  /** Share of the radius the trunk loses from butt to tip. */
  taper?: number;
  detail?: AccessoryDetail;
  /**
   * Bark relief at the near level (2026-10-07, round 4): 1 is the round-3 trunk the decor kit keeps inside its triangle
   * budget; the vehicle logs (profile and fitting) take 2: deeper furrows on 26 ridges and 13 stations, so the bark
   * breaks the silhouette and the light at close range ("a smooth orange or peach tube", "a smooth brown tub").
   */
  relief?: 1 | 2;
  /**
   * Bake the wood's own colours into a linear `color` attribute on every part (round 4): grey-brown bark, darker in
   * the furrows and lighter on the ridges, the sawn faces pale sapwood round a warmer heart, darker growth rings and
   * near-black checks. For the vehicle `bark` material (vertex colours over white); the decor painter tints its own.
   */
  tinted?: boolean;
}

export interface BarkLogParts {
  /** The barked trunk lying along X: furrowed ridges running the length with a slow twist, knots, closed sawn ends. */
  bark: THREE.BufferGeometry;
  /** A cut branch stub standing out of one knot (near level), its own sawn face included. */
  stub: THREE.BufferGeometry | null;
  /** The pale sawn faces, a hair proud of each end inside a rim of bark (near level). */
  ends: THREE.BufferGeometry[];
  /** Growth rings and the radial drying checks on the sawn faces (near level), darker than the face. */
  grain: THREE.BufferGeometry[];
  /** Mean bark radius at u in [0, 1] (butt to tip): seats bands, chains and straps on the actual trunk. */
  radiusAt(u: number): number;
}

/**
 * An unditching log (2026-10-07, tank-accessories round 3: the blind critics read the old lathe as "a smooth green
 * pipe"): bark ridges and furrows running the length with a slow twist, raised knots and one cut branch stub, a trunk
 * that swells and tapers, and sawn ends in pale end grain with growth rings and radial checks inside a rim of bark. Centred
 * on the origin, lying along +X, deterministic in `seed`. The coarse level (`detail` 0) is the same envelope without the
 * furrows, knots and grain.
 * Round 5 (2026-10-08; wave 255 on the T-90M: "the log bundle is identical smooth dowels: needs bark, knots, split ends
 * and varied diameters"): thirteen even ridges running the whole length read as a bundle of rods. The bark is now
 * plates: every ridge rises and dies away station to station and wanders off its line, the furrows open and close, the
 * trunk tapers a tenth and swells unevenly, the knots ring dark and the ridges carry grey lichen; three drying checks
 * split each sawn end to the bark. Same stations and triangles.
 */
export function barkLog(spec: BarkLogSpec): BarkLogParts {
  const detail = spec.detail ?? 1;
  const seed = spec.seed ?? 1;
  const deep = detail === 1 && spec.relief === 2;
  const seg = detail ? (deep ? 26 : 18) : 9;
  const count = detail ? (deep ? 13 : 9) : 4;
  const ridgeAmp = deep ? 0.085 : 0.05;
  const taper = spec.taper ?? 0.1;
  const phase = hash01(seed, 3) * TAU;
  const radiusAt = (u: number): number =>
    spec.r * (1 - taper * u) * (1 + 0.045 * Math.sin(u * 9.4 + phase) + 0.03 * Math.sin(u * 23 + phase * 2));
  const twist = (hash01(seed, 5) - 0.5) * 0.7;
  // the first knot carries the cut branch stub and faces up and out of the load (it never digs into its support)
  const knots = detail ? [0, 1, 2].map((k) => ({
    a: k ? hash01(seed, 31, k) * TAU : Math.PI / 2 + (hash01(seed, 31, k) - 0.5) * 0.9,
    u: 0.14 + 0.72 * hash01(seed, 37, k), h: 0.09 + 0.08 * hash01(seed, 41, k),
  })) : [];
  const angleGap = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const ring = (u: number, station: number): XY[] => {
    const R = radiusAt(u);
    const out: XY[] = [];
    const at = seed + 7919 * station;
    for (let i = 0; i < seg; i++) {
      // round 5: each ridge wanders off its line station to station (a quarter of its spacing), so none runs straight
      const a = (i / seg) * TAU + twist * u + (detail ? (hash01(at, 61, i) - 0.5) * (TAU / seg) * 0.5 : 0);
      let k = 1;
      if (detail) {
        // a ridge on every even vertex, a furrow on every odd one; round 5: a ridge rises into a plate and dies away
        // station to station, and the furrow beside it opens and closes
        const ridge = i % 2 === 0 ? Math.max(0, 1.45 * hash01(at, 67, i) - 0.3) : -(0.25 + 0.65 * hash01(at, 71, i));
        k += ridge * ridgeAmp * (0.55 + 0.7 * hash01(seed, i));
        for (const knot of knots) {
          k += knot.h * Math.exp(-((angleGap(a, knot.a) / 0.34) ** 2) - (((u - knot.u) * spec.len) / 0.06) ** 2);
        }
      }
      out.push([Math.cos(a) * R * k, Math.sin(a) * R * k]);
    }
    return out;
  };
  const sections: LoftSection[] = [];
  for (let s = 0; s < count; s++) {
    const u = s / (count - 1);
    sections.push({ z: (u - 0.5) * spec.len, ring: ring(u, s) });
  }
  // smooth bark (welded side), crisp sawn caps
  const side = loftZ(sections, false, false);
  side.deleteAttribute('normal');
  side.deleteAttribute('uv');
  const welded = mergeVertices(side, 1e-6);
  side.dispose();
  welded.computeVertexNormals();
  const smooth = welded.toNonIndexed();
  welded.dispose();
  const capRing = (s: number): THREE.Vector3[] => {
    const pts = sections[s].ring.map(([x, y]) => new THREE.Vector3(x, y, sections[s].z));
    pts.push(pts[0].clone());
    return pts;
  };
  const caps: FanCap[] = [
    { center: new THREE.Vector3(0, 0, sections[0].z), ring: capRing(0), outward: new THREE.Vector3(0, 0, -1) },
    { center: new THREE.Vector3(0, 0, sections[count - 1].z), ring: capRing(count - 1), outward: new THREE.Vector3(0, 0, 1) },
  ];
  const bark = withFanCaps(withBoxUV(smooth), caps);
  const alongX = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => place(geometry, 0, 0, 0, 0, Math.PI / 2, 0);
  alongX(bark);
  const ends: THREE.BufferGeometry[] = [];
  const grain: THREE.BufferGeometry[] = [];
  for (const end of [-1, 1] as const) {
    const u = end < 0 ? 0 : 1;
    const R = radiusAt(u);
    const z = end * spec.len / 2;
    if (!detail) continue;
    const face = new THREE.CircleGeometry(R * 0.88, 16).toNonIndexed();
    ends.push(alongX(withBoxUV(place(face, 0, 0, z + end * 0.002, 0, end > 0 ? 0 : Math.PI, 0))));
    for (const [inner, outer] of [[0.3, 0.35], [0.6, 0.65]] as const) {
      const rings = new THREE.RingGeometry(R * inner, R * outer, 12, 1).toNonIndexed();
      grain.push(alongX(withBoxUV(place(rings, 0, 0, z + end * 0.0035, 0, end > 0 ? 0 : Math.PI, 0))));
    }
    // three radial drying checks from the pith to the bark (round 5: wider and full length, the ends read split)
    for (const k of [0, 1, 2]) {
      const a = hash01(seed, 53 + end, k) * TAU;
      const check = new THREE.PlaneGeometry(0.004 + R * 0.06, R * 0.8).toNonIndexed();
      place(check, 0, R * 0.44, 0, 0, 0, 0);
      place(check, 0, 0, 0, 0, 0, a);
      grain.push(alongX(withBoxUV(place(check, 0, 0, z + end * 0.004, 0, end > 0 ? 0 : Math.PI, 0))));
    }
  }
  let stub: THREE.BufferGeometry | null = null;
  if (detail && knots.length) {
    // a branch sawn off flush with a hand's width of wood left: a short tapered round out of the biggest knot
    const knot = knots[0];
    const R = radiusAt(knot.u);
    const sr = R * 0.3;
    const g = latheY([[sr * 1.25, 0], [sr, R * 0.2], [sr * 0.92, R * 0.28]], 8);
    place(g, 0, R * 0.92, 0);                                   // its foot sunk in the bark
    place(g, 0, 0, 0, 0, 0, knot.a - Math.PI / 2);              // turned out to the knot's bearing
    stub = alongX(place(g, 0, 0, (knot.u - 0.5) * spec.len));
  }
  if (spec.tinted) tintBarkLog({ bark, stub, ends, grain, radiusAt }, spec.len, ridgeAmp, seed, knots);
  return { bark, stub, ends, grain, radiusAt };
}

// Linear wood colours (round 4): sRGB (44,36,28) furrow, (74,60,46) bark, (104,90,72) ridge, (174,148,106) sapwood,
// (148,110,70) heart, (106,78,52) growth ring, (40,30,22) check.
const BARK_FURROW: Rgb3 = [0.0252, 0.0176, 0.0103];
const BARK_MID: Rgb3 = [0.0685, 0.0452, 0.0273];
const BARK_RIDGE: Rgb3 = [0.140, 0.102, 0.0648];
const SAPWOOD: Rgb3 = [0.423, 0.296, 0.146];
const HEARTWOOD: Rgb3 = [0.297, 0.157, 0.0612];
const GROWTH_RING: Rgb3 = [0.145, 0.0762, 0.0343];
const DRYING_CHECK: Rgb3 = [0.0176, 0.0103, 0.0060];
/** Grey lichen over the bark's ridges (round 5): sRGB (92, 94, 82). */
const LICHEN: Rgb3 = [0.107, 0.112, 0.0844];
type Rgb3 = readonly [number, number, number];

function paintVertices(geometry: THREE.BufferGeometry, colorAt: (x: number, y: number, z: number, i: number) => Rgb3): void {
  const position = geometry.getAttribute('position');
  const color = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const c = colorAt(position.getX(i), position.getY(i), position.getZ(i), i);
    color[i * 3] = c[0]; color[i * 3 + 1] = c[1]; color[i * 3 + 2] = c[2];
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
}

const mix3 = (a: Rgb3, b: Rgb3, t: number): Rgb3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale3 = (a: Rgb3, k: number): Rgb3 => [a[0] * k, a[1] * k, a[2] * k];

/** Bake the log's wood colours (see `BarkLogSpec.tinted`); positions are the placed log's (axis along X). */
function tintBarkLog(parts: BarkLogParts, len: number, ridgeAmp: number, seed: number,
  knots: ReadonlyArray<{ a: number; u: number }> = []): void {
  const phase = hash01(seed, 71) * TAU;
  // weathering: slow grey-to-warm patches along the trunk and round it, the same at every copy of a position
  const patch = (x: number, a: number): number => 0.9 + 0.08 * Math.sin(x * 6.1 + phase) + 0.07 * Math.sin(a * 3 + x * 2.3 + phase * 2);
  const gap = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  paintVertices(parts.bark, (x, y, z) => {
    const r = Math.hypot(y, z);
    const u = Math.min(1, Math.max(0, x / len + 0.5));
    const a = Math.atan2(z, y);
    const f = (r / parts.radiusAt(u) - 1) / ridgeAmp;                 // -1 in a furrow, +1 on a ridge
    // round 5: softer furrows, and each plate of bark (a ridge between two stations) its own lightness
    let base = f < 0 ? mix3(BARK_MID, BARK_FURROW, Math.min(0.75, -f * 0.9)) : mix3(BARK_MID, BARK_RIDGE, Math.min(1, f * 0.8));
    const cell = hash01(seed + Math.round(u * 12) * 131, 73, Math.round(((a + TAU) % TAU) / TAU * 13));
    base = scale3(base, 0.84 + 0.32 * cell);
    // round 5: grey lichen in patches on the ridges, and a dark ring of bark round each knot
    const lichen = Math.sin(x * 4.1 + a * 2 + phase * 3) * Math.sin(x * 1.7 - a * 3 + phase);
    if (f > 0 && lichen > 0.35) base = mix3(base, LICHEN, Math.min(0.6, (lichen - 0.35) * 2));
    for (const knot of knots) {
      // the knot's bearing about the trunk in the placed frame (barkLog turns its +Z axis to +X: y stays, z = -x')
      const d = Math.hypot(gap(a, Math.atan2(-Math.cos(knot.a), Math.sin(knot.a))) / 0.5, ((u - knot.u) * len) / 0.09);
      if (d < 1) base = scale3(base, 0.55 + 0.45 * d);
    }
    return scale3(base, patch(x, a));
  });
  if (parts.stub) paintVertices(parts.stub, (x, y, z) => scale3(BARK_MID, patch(x, Math.atan2(z, y)) * 1.1));
  for (const face of parts.ends) {
    face.computeBoundingSphere();
    const rim = face.boundingSphere?.radius || 1;
    // the face is a disc in the YZ plane: its centre is the pith (heart), its rim the sapwood under the bark
    paintVertices(face, (_x, y, z) => mix3(HEARTWOOD, SAPWOOD, Math.min(1, Math.max(0, (Math.hypot(y, z) / rim - 0.2) / 0.55))));
  }
  for (const mark of parts.grain) {
    // rings are annuli (many vertices); a drying check is a thin quad of six vertices
    const check = mark.getAttribute('position').count <= 6;
    paintVertices(mark, () => (check ? DRYING_CHECK : GROWTH_RING));
  }
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

/**
 * A swept tube through points (centripetal Catmull-Rom): cables, rope handles, hoses, bent bars. An open tube ends in
 * flat caps (2026-10-06, the finish lane: an uncapped end showed its inside, which the sealed-hull census counts as a
 * hole in the vehicle; seven hulls regressed through grips, handles and belts).
 */
export function sweptTube(points: ReadonlyArray<readonly number[]>, r: number, radial = 6, along = 12,
  closed = false): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), closed, 'centripetal');
  const geometry = new THREE.TubeGeometry(curve, along, r, radial, closed);
  const flat = geometry.toNonIndexed();
  if (closed) { geometry.dispose(); return flat; }
  const position = geometry.getAttribute('position');
  const ringAt = (station: number): THREE.Vector3[] => {
    const ring: THREE.Vector3[] = [];
    for (let j = 0; j <= radial; j++) {
      const v = station * (radial + 1) + j;
      ring.push(new THREE.Vector3(position.getX(v), position.getY(v), position.getZ(v)));
    }
    return ring;
  };
  const caps = [
    { center: curve.getPointAt(0), ring: ringAt(0), outward: curve.getTangentAt(0).negate() },
    { center: curve.getPointAt(1), ring: ringAt(along), outward: curve.getTangentAt(1) },
  ];
  geometry.dispose();
  return withFanCaps(flat, caps);
}

/**
 * A lathe about +Y from (radius, y) stations (bottom to top), closed with flat caps when the ends are off-axis
 * (2026-10-06, the finish lane: the caps this promised were never built, so a jacket, a muzzle device or a cupola foot
 * stood open and the sealed-hull census counted its inside as holes). Each cap faces away from the profile's body.
 */
export function latheY(profile: readonly XY[], seg = 16): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y));
  const geometry = new THREE.LatheGeometry(pts, seg);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  const meanY = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
  const caps: FanCap[] = [];
  for (const [index, fallback] of [[0, -1], [pts.length - 1, 1]] as const) {
    const { x: r, y } = pts[index];
    if (r <= LATHE_AXIS_R) continue;
    const ring: THREE.Vector3[] = [];
    for (let i = 0; i <= seg; i++) {
      const phi = (i / seg) * TAU; // LatheGeometry's own stations: the cap's rim is the surface's rim
      ring.push(new THREE.Vector3(r * Math.sin(phi), y, r * Math.cos(phi)));
    }
    caps.push({ center: new THREE.Vector3(0, y, 0), ring, outward: new THREE.Vector3(0, Math.sign(y - meanY) || fallback, 0) });
  }
  return withFanCaps(flat, caps);
}

/** A profile station this close to the axis is on it: the lathe closes there by itself and needs no cap (m). */
const LATHE_AXIS_R = 0.002;

interface FanCap { center: THREE.Vector3; ring: readonly THREE.Vector3[]; outward: THREE.Vector3 }

/**
 * Close a non-indexed surface's open end rings with flat fans (the ring repeats its first point last). Each fan
 * triangle is wound to face `outward` and carries its normal; uv is planar over the fan.
 */
function withFanCaps(geometry: THREE.BufferGeometry, caps: readonly FanCap[]): THREE.BufferGeometry {
  if (!caps.length) return geometry;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const positions = Array.from(position.array as ArrayLike<number>);
  const normals = normal ? Array.from(normal.array as ArrayLike<number>) : null;
  const uvs = uv ? Array.from(uv.array as ArrayLike<number>) : null;
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), face = new THREE.Vector3();
  for (const { center, ring, outward } of caps) {
    const n = outward.clone().normalize();
    let radius = 0;
    for (const v of ring) radius = Math.max(radius, v.distanceTo(center));
    for (let i = 0; i < ring.length - 1; i++) {
      let a = ring[i], b = ring[i + 1];
      face.crossVectors(ab.subVectors(a, center), ac.subVectors(b, center));
      if (face.lengthSq() < 1e-18) continue;
      if (face.dot(n) < 0) [a, b] = [b, a];
      for (const v of [center, a, b]) {
        positions.push(v.x, v.y, v.z);
        normals?.push(n.x, n.y, n.z);
        uvs?.push(0.5 + (v.x - center.x) / (2 * radius || 1), 0.5 + (v.z - center.z + v.y - center.y) / (2 * radius || 1));
      }
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (normals) out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (uvs) out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.dispose();
  return out;
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
