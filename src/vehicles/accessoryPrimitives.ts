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
function drumLathe(R: number, len: number, seg = 16, hoops = true): THREE.BufferGeometry {
  const hoop = (y: number): XY[] => [[R, y - 0.016], [R + 0.012, y], [R, y + 0.016]];
  return latheY([[0.0005, 0.01], [R - 0.012, 0.012], [R + 0.004, 0], [R, 0.02],
    ...(hoops ? [...hoop(len * 0.29), ...hoop(len * 0.71)] : []),
    [R, len - 0.02], [R + 0.004, len], [R - 0.012, len - 0.012], [0.0005, len - 0.01]], seg);
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
  const body = withBoxUV(drumLathe(R, len, seg, detail === 1));
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

export interface BarkLogSpec {
  /** Length along local +X (metres) and radius at the butt (the -X end). */
  len: number;
  r: number;
  seed?: number;
  /** Share of the radius the trunk loses from butt to tip. */
  taper?: number;
  detail?: AccessoryDetail;
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
 */
export function barkLog(spec: BarkLogSpec): BarkLogParts {
  const detail = spec.detail ?? 1;
  const seed = spec.seed ?? 1;
  const seg = detail ? 18 : 9;
  const count = detail ? 9 : 4;
  const taper = spec.taper ?? 0.06;
  const phase = hash01(seed, 3) * TAU;
  const radiusAt = (u: number): number =>
    spec.r * (1 - taper * u) * (1 + 0.03 * Math.sin(u * 9.4 + phase) + 0.02 * Math.sin(u * 23 + phase * 2));
  const twist = (hash01(seed, 5) - 0.5) * 0.7;
  // the first knot carries the cut branch stub and faces up and out of the load (it never digs into its support)
  const knots = detail ? [0, 1, 2].map((k) => ({
    a: k ? hash01(seed, 31, k) * TAU : Math.PI / 2 + (hash01(seed, 31, k) - 0.5) * 0.9,
    u: 0.14 + 0.72 * hash01(seed, 37, k), h: 0.09 + 0.08 * hash01(seed, 41, k),
  })) : [];
  const angleGap = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const ring = (u: number): XY[] => {
    const R = radiusAt(u);
    const out: XY[] = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * TAU + twist * u;
      let k = 1;
      if (detail) {
        // a ridge on every even vertex, a furrow on every odd one, each ridge its own height along the run
        const ridge = i % 2 === 0 ? 1 : -0.75;
        k += ridge * 0.05 * (0.55 + 0.9 * hash01(seed, i)) * (0.8 + 0.2 * Math.sin(u * 11 + i * 1.7));
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
    sections.push({ z: (u - 0.5) * spec.len, ring: ring(u) });
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
    // two radial drying checks from the pith toward the bark
    for (const k of [0, 1]) {
      const a = hash01(seed, 53 + end, k) * TAU;
      const check = new THREE.PlaneGeometry(0.007, R * 0.62).toNonIndexed();
      place(check, 0, R * 0.36, 0, 0, 0, 0);
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
  return { bark, stub, ends, grain, radiusAt };
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
