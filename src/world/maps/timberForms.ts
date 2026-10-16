// src/world/maps/timberForms.ts — the field's fallen timber built from its members (props lane A, family #19,
// 2026-10-15; WORKLIST.md #19 site:logs-and-stumps: "Build it from members. The log needs a bark shell with ridges and
// peeled patches, end-grain caps (rings, radial checks …), 2-4 branch stubs, and on windthrow a root plate with soil and
// stones in it. The stump needs a saw-cut or broken top with splinters, flared root buttresses running into the ground,
// and moss. Use each map's species").
//
// A log is built in the frame its cylinder had (props.ts, now groundDressing.ts): its axis along +Y, the butt (radius r)
// at -len/2 and the top (0.85 r) at +len/2, so the placement's seat, its grounding receipt and the logging yard's rigid
// moves stay as they were; nothing stands outside the old cylinder's radii but the stubs and the root plate, which are
// turned off the ground (`up`, the world's up in that frame). A stump is built about its own centre, y from -h/2 (its
// seat) to +h/2, its roots following the ground (`ground`). Vertex colour on the baked material (no print): the bark's
// relief darkens its fissures, the end grain carries its rings, the moss its side. Pure geometry: no placement stream
// is read (each piece's own hash stream).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash, hexLin, mix, stream, type Rgb, type V3 } from './craftMesh.ts';

type Ridge = 'plates' | 'furrows' | 'smooth' | 'scales' | 'rings' | 'strips';
interface TimberSpecies {
  bark: Rgb; dark: Rgb; sap: Rgb; heart: Rgb;
  ridge: Ridge;
  /** the bark's relief, a share of the radius */
  amp: number;
  sides: number;
  /** branch stubs on a fallen stem [min, max] */
  stubs: readonly [number, number];
  /** the share of fallen stems a storm threw with their root plate */
  windthrow: number;
  /** dark marks over a pale bark (the birch's lenticels and black patches) */
  marks?: number;
  /** how far the stem wanders from straight, a share of its length */
  crook?: number;
}
const C = hexLin;
export const TIMBER_SPECIES: Readonly<Record<string, TimberSpecies>> = Object.freeze({
  birch: { bark: C(0xd6d2c6), dark: C(0x2c2a27), sap: C(0xe2d3ae), heart: C(0xd8c49a), ridge: 'smooth', amp: 0.015, sides: 10, stubs: [2, 4], windthrow: 0.35, marks: 0.24 },
  spruce: { bark: C(0x6c5c4c), dark: C(0x3a3028), sap: C(0xdcc496), heart: C(0xd2b884), ridge: 'scales', amp: 0.05, sides: 10, stubs: [4, 7], windthrow: 0.45 },
  pine: { bark: C(0x8c5c3c), dark: C(0x45301f), sap: C(0xdcbc88), heart: C(0xc89a62), ridge: 'plates', amp: 0.1, sides: 10, stubs: [2, 4], windthrow: 0.3 },
  longleaf: { bark: C(0x70584a), dark: C(0x30251c), sap: C(0xd8b47c), heart: C(0xb88448), ridge: 'plates', amp: 0.11, sides: 10, stubs: [1, 3], windthrow: 0.25 },
  oak: { bark: C(0x67625a), dark: C(0x2c2924), sap: C(0xc8ae80), heart: C(0x9a7448), ridge: 'furrows', amp: 0.13, sides: 12, stubs: [2, 4], windthrow: 0.3, crook: 0.012 },
  beech: { bark: C(0x8c8c84), dark: C(0x55554e), sap: C(0xdcc4a2), heart: C(0xc8a888), ridge: 'smooth', amp: 0.01, sides: 10, stubs: [1, 3], windthrow: 0.35 },
  poplar: { bark: C(0x7c7a6c), dark: C(0x36342d), sap: C(0xdcd0ac), heart: C(0xb8a07c), ridge: 'furrows', amp: 0.1, sides: 12, stubs: [2, 3], windthrow: 0.3 },
  olive: { bark: C(0x7a7468), dark: C(0x403b34), sap: C(0xc8b080), heart: C(0x9a7c50), ridge: 'furrows', amp: 0.16, sides: 10, stubs: [2, 4], windthrow: 0, crook: 0.03 },
  cedar: { bark: C(0x6a5a4c), dark: C(0x382d24), sap: C(0xd8b07a), heart: C(0xb07a4a), ridge: 'plates', amp: 0.09, sides: 10, stubs: [2, 4], windthrow: 0.2 },
  sugi: { bark: C(0x7c4e36), dark: C(0x43291c), sap: C(0xe0bc90), heart: C(0xb86e4e), ridge: 'strips', amp: 0.06, sides: 12, stubs: [1, 3], windthrow: 0.3 },
  teak: { bark: C(0x7a6e5a), dark: C(0x464031), sap: C(0xd0b080), heart: C(0xa87a44), ridge: 'furrows', amp: 0.08, sides: 10, stubs: [1, 3], windthrow: 0.25 },
  palm: { bark: C(0x6e665a), dark: C(0x3a362f), sap: C(0xb8a07a), heart: C(0x9a8462), ridge: 'rings', amp: 0.05, sides: 10, stubs: [0, 0], windthrow: 0.4 },
});

/** A map's timber: its species in their shares, the moss its damp grows, the char its fires left. */
interface MapTimber { mix: readonly (readonly [string, number])[]; moss: number; charred?: number }
const MAP_TIMBER: Readonly<Record<string, MapTimber>> = Object.freeze({
  // the Russian and Ukrainian fields' birch, with the pines and oaks of their woods
  verdant: { mix: [['birch', 5], ['pine', 3], ['oak', 2]], moss: 0.35 },
  steppe: { mix: [['birch', 6], ['oak', 2], ['poplar', 2]], moss: 0.15 },
  winter: { mix: [['birch', 4], ['spruce', 5], ['pine', 1]], moss: 0.1 },
  // the north's and the mountains' spruce
  fjord: { mix: [['spruce', 6], ['pine', 3], ['birch', 1]], moss: 0.5 },
  alpine: { mix: [['spruce', 7], ['beech', 2], ['pine', 1]], moss: 0.45 },
  whiteout: { mix: [['spruce', 7], ['birch', 3]], moss: 0.1 },
  // West Germany's spruce plantations and beech woods
  frontier: { mix: [['spruce', 5], ['beech', 3], ['oak', 2]], moss: 0.45 },
  reservoir: { mix: [['spruce', 5], ['beech', 4], ['oak', 1]], moss: 0.55 },
  railyard: { mix: [['spruce', 4], ['beech', 3], ['pine', 3]], moss: 0.3 },
  // Normandy's and Brittany's oak and beech, the polders' poplar rows
  autumn: { mix: [['oak', 5], ['beech', 3], ['poplar', 2]], moss: 0.5 },
  coastal: { mix: [['oak', 4], ['pine', 4], ['beech', 2]], moss: 0.45 },
  polders: { mix: [['poplar', 6], ['oak', 2], ['beech', 2]], moss: 0.5 },
  // the Mediterranean's pines and olives, Mount Lebanon's olive and cedar
  saltwind: { mix: [['pine', 6], ['oak', 2], ['olive', 2]], moss: 0.1 },
  cliffbridge: { mix: [['pine', 5], ['oak', 3], ['olive', 2]], moss: 0.1 },
  orchard: { mix: [['olive', 5], ['cedar', 4], ['oak', 1]], moss: 0.05 },
  // the American West's ponderosa, the Carolinas' longleaf
  skybridge: { mix: [['pine', 8], ['spruce', 2]], moss: 0.1 },
  longleaf: { mix: [['longleaf', 8], ['oak', 2]], moss: 0.25 },
  // the monsoon's teak and palms
  monsoon: { mix: [['teak', 6], ['palm', 4]], moss: 0.55 },
  delta: { mix: [['palm', 6], ['teak', 4]], moss: 0.5 },
  mangrove: { mix: [['palm', 5], ['teak', 5]], moss: 0.55 },
  // Aso's sugi plantations, half of them burnt
  caldera: { mix: [['sugi', 7], ['pine', 3]], moss: 0.3, charred: 0.45 },
});
const DEFAULT_TIMBER: MapTimber = { mix: [['pine', 5], ['oak', 5]], moss: 0.3 };

const MOSS = C(0x4e5a2c), SOIL = C(0x4a3a2a), CLAY = C(0x7a6248), STONE = C(0x7a7670), WEATHERED = C(0x8a8478);
const CHAR = C(0x36312c), CHAR_DARK = C(0x171513), ASH = C(0x6a655e), TURF = C(0x56653a);

interface TimberPick { species: TimberSpecies; name: string; moss: number; charred: boolean }
/** The piece of timber a map's field shows at a draw u (0..1) of its own stream. */
export function timberOf(mapId: string, u: number, v: number): TimberPick {
  const t = MAP_TIMBER[mapId] ?? DEFAULT_TIMBER;
  const total = t.mix.reduce((s, [, w]) => s + w, 0);
  let k = u * total, name = t.mix[0][0];
  for (const [n, w] of t.mix) { if (k < w) { name = n; break; } k -= w; }
  return { species: TIMBER_SPECIES[name], name, moss: t.moss, charred: v < (t.charred ?? 0) };
}

// ---------------------------------------------------------------------------------------------------------------
// the writer: indexed parts (a part's shared vertices smooth it), each wound out, merged unindexed

class Part {
  readonly p: number[] = []; readonly c: number[] = []; readonly t: number[] = []; readonly i: number[] = [];
  v(q: V3, col: Rgb, u = 0, w = 0): number {
    this.p.push(q[0], q[1], q[2]); this.c.push(col[0], col[1], col[2]); this.t.push(u, w);
    return this.p.length / 3 - 1;
  }
  /** A triangle wound to face `out`. */
  f(a: number, b: number, c: number, out: V3): void {
    const P = this.p;
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    if (nx * out[0] + ny * out[1] + nz * out[2] < 0) this.i.push(a, c, b); else this.i.push(a, b, c);
  }
  pos(a: number): V3 { return [this.p[a * 3], this.p[a * 3 + 1], this.p[a * 3 + 2]]; }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.t, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeVertexNormals();
    const flat = g.toNonIndexed();
    g.dispose();
    return flat;
  }
}
function merged(parts: Part[]): THREE.BufferGeometry {
  const gs = parts.filter((p) => p.i.length).map((p) => p.geometry());
  const g = mergeGeometries(gs, false)!;
  for (const x of gs) x.dispose();
  return g;
}
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** The bark's radius at angle index k of ring j (at height y along the stem), a share over the base radius. */
function relief(sp: TimberSpecies, k: number, j: number, y: number, seed: number): number {
  const n = hash(k, j, seed) - 0.5, a = sp.amp, th = (k / sp.sides) * Math.PI * 2;
  switch (sp.ridge) {
    case 'smooth': return a * n;
    case 'scales': return a * n * 2;
    // plates: blocks of bark between fissures, a plate's vertices lifted together
    case 'plates': return a * (hash(k >> 1, Math.floor(y / 0.34), seed ^ 0x51) - 0.35) + a * 0.3 * n;
    // furrows: ridges along the stem, alternate sides up and down, a slow twist
    case 'furrows': return a * 0.5 * Math.cos(th * sp.sides * 0.5 + y * 0.35) + a * 0.35 * n;
    case 'strips': return a * 0.45 * Math.cos(th * sp.sides * 0.5 + y * 0.12) + a * 0.5 * n;
    case 'rings': return a * (j % 2 ? 0.5 : -0.5) + a * 0.3 * n;
  }
}

/** The bark's colour at a vertex: its fissures dark (relief under the mean), the birch's marks, the moss on its `wet` side. */
function barkColour(sp: TimberSpecies, pick: TimberPick, rel: number, k: number, j: number, seed: number, wet: number): Rgb {
  if (pick.charred) return mix(CHAR_DARK, CHAR, Math.min(1, Math.max(0, 0.5 + rel / Math.max(1e-3, sp.amp))) * 0.8 + hash(k, j, seed ^ 0x77) * 0.2);
  const depth = Math.min(1, Math.max(0, 0.5 + rel / Math.max(1e-3, sp.amp * 1.2)));
  let col = mix(sp.dark, sp.bark, 0.35 + 0.65 * depth);
  col = mix(col, sp.bark, (hash(k, j, seed ^ 0x3c) - 0.5) * 0.3);
  if (sp.marks && hash(k * 3 + 1, j, seed ^ 0x9d) < sp.marks) col = mix(col, sp.dark, 0.75);
  if (wet > 0 && hash(k, j, seed ^ 0x4d) < pick.moss * 1.6) col = mix(col, MOSS, Math.min(0.85, wet * (0.6 + 0.4 * hash(j, k, seed))));
  return col;
}

/** The end grain's colour at a share s of the radius out (0 the pith, 1 the bark): sapwood, heartwood, aged toward grey. */
function grain(sp: TimberSpecies, pick: TimberPick, s: number, age: number, n: number): Rgb {
  if (pick.charred) return mix(CHAR_DARK, ASH, 0.3 + 0.4 * n);
  const wood = s > 0.93 ? mix(sp.dark, sp.bark, 0.4) : s > 0.62 ? sp.sap : mix(sp.heart, sp.sap, s / 0.62 * 0.5);
  // the rings: alternate shares of the radius a step darker
  const ring = Math.floor(s * 7) % 2 ? 0.88 : 1;
  return mix([wood[0] * ring, wood[1] * ring, wood[2] * ring], WEATHERED, age * (0.7 + 0.3 * n));
}

/**
 * A tube of rings around a centre line: ring j at `centre(j)` in the plane spanned by `ax`, `bx` (the stem's
 * cross-section), radius `radius(k, j)`, coloured by `colour(k, j, rel)`. Returns each ring's vertex indices.
 */
function tube(part: Part, sides: number, rings: number, centre: (j: number) => V3, ax: V3, bx: V3,
  radius: (k: number, j: number) => number, colour: (k: number, j: number, out: V3) => Rgb): number[][] {
  const ids: number[][] = [];
  for (let j = 0; j < rings; j++) {
    const row: number[] = [], o = centre(j);
    for (let k = 0; k < sides; k++) {
      const th = (k / sides) * Math.PI * 2, d = add(scl(ax, Math.cos(th)), scl(bx, Math.sin(th)));
      row.push(part.v(add(o, scl(d, radius(k, j))), colour(k, j, d), k / sides, j));
    }
    ids.push(row);
  }
  for (let j = 0; j + 1 < rings; j++) for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides, th = ((k + 0.5) / sides) * Math.PI * 2;
    const out = add(scl(ax, Math.cos(th)), scl(bx, Math.sin(th)));
    // (the out hint leans along the axis where a ring steps in or out, so a flare's faces still wind outward)
    part.f(ids[j][k], ids[j + 1][k], ids[j + 1][k1], out);
    part.f(ids[j][k], ids[j + 1][k1], ids[j][k1], out);
  }
  return ids;
}

/** A saw cut across a ring of the stem: the bark's edge, the sapwood, the heartwood and the pith, with checks. */
function sawCap(part: Part, ring: readonly V3[], centre: V3, normal: V3, sp: TimberSpecies, pick: TimberPick, age: number, seed: number): void {
  const n = ring.length;
  // the bark's cut edge, then the sapwood and heartwood rings in to the pith (its own vertices: a hard arris)
  const rings: number[][] = [ring.map((q, k) => part.v(q, grain(sp, pick, 0.99, age, hash(k, 7, seed))))];
  for (const s of [0.93, 0.62, 0.3]) {
    rings.push(ring.map((q, k) => part.v(add(centre, scl(sub(q, centre), s)), grain(sp, pick, s - 0.01, age, hash(k, s * 100, seed)))));
  }
  const pith = part.v(centre, grain(sp, pick, 0, age, 0.5));
  for (let r = 0; r + 1 < rings.length; r++) for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    part.f(rings[r][k], rings[r + 1][k], rings[r + 1][k1], normal);
    part.f(rings[r][k], rings[r + 1][k1], rings[r][k1], normal);
  }
  const last = rings[rings.length - 1];
  for (let k = 0; k < n; k++) part.f(last[k], last[(k + 1) % n], pith, normal);
  // the radial checks: a dark split from the pith toward the bark, a hair proud of the face
  const checks = 1 + Math.floor(hash(3, 9, seed) * 2.5);
  for (let c = 0; c < checks; c++) {
    const k = Math.floor(hash(c, 11, seed) * n), tip = ring[k], side = ring[(k + 1) % n];
    const lift = scl(normal, 0.003), dark: Rgb = mix(sp.dark, CHAR_DARK, 0.5);
    const a = part.v(add(centre, lift), dark), b = part.v(add(add(centre, scl(sub(tip, centre), 0.86)), lift), dark);
    const d = part.v(add(add(centre, scl(sub(add(scl(tip, 0.94), scl(side, 0.06)), centre), 0.86)), lift), dark);
    part.f(a, b, d, normal);
  }
}

/** A snapped end: the fibres torn out in splinters past the ring, the heart pulled furthest. */
function snapCap(part: Part, ringPos: readonly V3[], centre: V3, normal: V3, radius: number, sp: TimberSpecies, pick: TimberPick, age: number, seed: number): void {
  const n = ringPos.length, r = stream(seed ^ 0x5a1);
  const ring = ringPos.map((q, k) => part.v(q, grain(sp, pick, 0.99, age, hash(k, 4, seed))));
  const inner = ringPos.map((q0, k) => {
    const q = add(centre, scl(sub(q0, centre), 0.5 + r() * 0.25)), long = r() < 0.35;
    return part.v(add(q, scl(normal, radius * (long ? 0.7 + r() * 1.1 : 0.08 + r() * 0.3))), grain(sp, pick, 0.7, age * 0.6, hash(k, 5, seed)));
  });
  const edge = ringPos.map((q, k) => part.v(add(q, scl(normal, radius * r() * 0.3)), grain(sp, pick, 0.95, age, hash(k, 6, seed))));
  const off = ringPos[Math.floor(r() * n)];
  const tip = part.v(add(add(centre, scl(sub(off, centre), 0.3)), scl(normal, radius * (0.2 + r() * 0.5))), grain(sp, pick, 0.2, age * 0.5, 0.5));
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    part.f(ring[k], edge[k], edge[k1], normal); part.f(ring[k], edge[k1], ring[k1], normal);
    part.f(edge[k], inner[k], inner[k1], normal); part.f(edge[k], inner[k1], edge[k1], normal);
    part.f(inner[k], tip, inner[k1], normal);
  }
}

/** A short cone from `base` along `dir`: a branch stub or a torn root, its end snapped. */
function stub(part: Part, base: V3, dir: V3, len: number, r0: number, r1: number, sides: number, col: Rgb, end: Rgb): void {
  const a = unit(crs(dir, Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), b = crs(dir, a);
  const ring = (o: V3, r: number, c: Rgb) => Array.from({ length: sides }, (_, k) => {
    const th = (k / sides) * Math.PI * 2;
    return part.v(add(o, add(scl(a, Math.cos(th) * r), scl(b, Math.sin(th) * r))), c);
  });
  const top = add(base, scl(dir, len));
  const r0s = ring(base, r0, col), r1s = ring(top, r1, col);
  for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides, th = ((k + 0.5) / sides) * Math.PI * 2;
    const out = add(scl(a, Math.cos(th)), scl(b, Math.sin(th)));
    part.f(r0s[k], r1s[k], r1s[k1], out); part.f(r0s[k], r1s[k1], r0s[k1], out);
  }
  const tip = part.v(add(top, scl(dir, r1 * 0.6)), end);
  for (let k = 0; k < sides; k++) part.f(r1s[k], r1s[(k + 1) % sides], tip, dir);
}

/** A stone in the root plate's soil: a lumpy octahedron. */
function pebble(part: Part, at: V3, size: number, seed: number): void {
  const d: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const ids = d.map((q, i) => part.v(add(at, scl(q, size * (0.7 + 0.5 * hash(i, 1, seed)))), mix(STONE, CLAY, hash(i, 2, seed) * 0.4)));
  for (const [x, y, z] of [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]]) {
    part.f(ids[x], ids[y], ids[z], scl(add(add(d[x], d[y]), d[z]), 1));
  }
}

interface LogForm {
  r: number; len: number; pick: TimberPick;
  /** the world's up in the log's frame (the stubs and the plate stand off the ground) */
  up: V3;
  butt: 'saw' | 'snap' | 'plate';
  top: 'saw' | 'snap';
  /** 0 fresh-cut .. 1 long down (the ends grey, the moss over it) */
  age: number;
  stubs: boolean;
  seed: number;
}

/** The log's own choices at its seed: its ends, its age, its stubs (a logging yard's donor is cut timber). */
export function logForm(r: number, len: number, pick: TimberPick, up: V3, seed: number, cut: boolean): LogForm {
  const s = stream(seed);
  const windthrown = !cut && s() < pick.species.windthrow;
  return {
    r, len, pick, up, seed,
    butt: cut ? 'saw' : windthrown ? 'plate' : s() < 0.6 ? 'saw' : 'snap',
    top: cut ? 'saw' : s() < 0.65 ? 'snap' : 'saw',
    age: cut ? 0.1 : 0.4 + s() * 0.5,
    stubs: !cut,
  };
}

/** A fallen stem in its cylinder's frame (+Y its axis, the butt at -len/2). */
export function buildFallenLog(f: LogForm): THREE.BufferGeometry {
  const sp = f.pick.species, S = sp.sides, seed = f.seed;
  const Y: V3 = [0, 1, 0];
  // the cross-section's axes: `ux` the world's up turned square to the stem, `wx` across it
  const ux = unit(sub(f.up, scl(Y, dot(f.up, Y)))), wx = crs(ux, Y);
  const spacing = sp.ridge === 'rings' ? 0.2 : 0.34;
  const rings = Math.max(5, Math.round(f.len / spacing) + 1);
  const crook = (sp.crook ?? 0) * f.len * (hash(1, 2, seed) - 0.5) * 2;
  const centre = (j: number): V3 => {
    const t = j / (rings - 1);
    return add([0, -f.len / 2 + f.len * t, 0], scl(wx, crook * Math.sin(Math.PI * t)));
  };
  const base = (j: number) => f.r + (f.r * 0.85 - f.r) * (j / (rings - 1));
  const bark = new Part(), ends = new Part(), parts = [bark, ends];
  // (the bark stays inside the old cylinder's radii: its relief only cuts in, so the seat is the cylinder's)
  const rel = (k: number, j: number) => relief(sp, k, j, j * spacing, seed) - sp.amp;
  // a peeled patch on an old log: the bare wood showing through on its top
  const peel = f.age > 0.6 && !f.pick.charred ? Math.floor(hash(4, 4, seed) * rings) : -9;
  const ring = tube(bark, S, rings, centre, ux, wx, (k, j) => base(j) * (1 + rel(k, j)), (k, j, out) => {
    const wet = Math.max(0, dot(out, ux) - 0.15) * f.age;
    if (j === peel && dot(out, ux) > 0.55) return mix(sp.sap, WEATHERED, 0.7);
    return barkColour(sp, f.pick, rel(k, j) + sp.amp, k, j, seed, wet);
  });
  const butt = ring[0].map((id) => bark.pos(id)), top = ring[rings - 1].map((id) => bark.pos(id));
  const bc = centre(0), tc = centre(rings - 1), down: V3 = [0, -1, 0];
  if (f.butt === 'snap') snapCap(ends, butt, bc, down, f.r, sp, f.pick, f.age, seed ^ 0x11);
  else sawCap(ends, butt, bc, down, sp, f.pick, f.age, seed ^ 0x11);
  if (f.top === 'snap') snapCap(ends, top, tc, Y, f.r * 0.85, sp, f.pick, f.age, seed ^ 0x22);
  else sawCap(ends, top, tc, Y, sp, f.pick, f.age, seed ^ 0x22);
  const r = stream(seed ^ 0x3b3);
  if (f.stubs && sp.stubs[1] > 0) {
    // the branches' stubs, snapped where the stem hit the ground: on its upper side and flanks, raked toward the top
    const count = sp.stubs[0] + Math.floor(r() * (sp.stubs[1] - sp.stubs[0] + 1)), thin = sp === TIMBER_SPECIES.spruce;
    const sp2 = new Part(); parts.push(sp2);
    for (let i = 0; i < count; i++) {
      const t = 0.25 + r() * 0.7, j = Math.min(rings - 1, Math.round(t * (rings - 1)));
      const phi = (r() - 0.5) * Math.PI * 1.1, d = add(scl(ux, Math.cos(phi)), scl(wx, Math.sin(phi)));
      const rake = 0.55 + r() * 0.4, dir = unit(add(scl(d, Math.cos(rake)), scl(Y, Math.sin(rake))));
      const br = base(j) * (thin ? 0.14 + r() * 0.06 : 0.22 + r() * 0.12);
      const at = add(centre(j), scl(d, base(j) * 0.75));
      const col = barkColour(sp, f.pick, 0, i, j, seed, 0);
      stub(sp2, at, dir, (thin ? 0.1 : 0.15) + r() * (thin ? 0.15 : 0.25) + base(j) * 0.25, br, br * 0.55, 5, col, grain(sp, f.pick, 0.5, f.age, 0.5));
    }
  }
  if (f.butt === 'plate') {
    // the root plate the storm tore up with it: a lumpy disc of soil and roots square to the stem, standing on its
    // upper side, its foot in the ground; torn roots and stones in its face
    const plate = new Part(); parts.push(plate);
    const A: V3 = [0, -1, 0], Rp = f.r * (2.6 + r() * 0.8), th = 0.32 + r() * 0.16, M = 12;
    const pc = add(add(bc, [0, -0.04, 0]), scl(ux, Rp * 0.55));
    // the soil: loam and clay in patches, wetter (darker) toward its foot; the turf it tore up still on its top edge
    const soil = (k: number, s: number, lift = 0): Rgb => mix(mix(SOIL, CLAY, hash(k, s * 10, seed ^ 0x7e) * 0.7), SOIL, Math.max(0, -lift) * 0.5);
    const turfed = (m: number) => Math.cos((m / M) * Math.PI * 2) > 0.35 && hash(m, 21, seed) < 0.85;
    const outline = Array.from({ length: M }, (_, m) => Rp * (0.78 + 0.32 * hash(m, 3, seed)));
    const rim = (m: number, side: number, s = 1): V3 => {
      const phi = (m / M) * Math.PI * 2, d = add(scl(ux, Math.cos(phi)), scl(wx, Math.sin(phi)));
      return add(add(pc, scl(d, outline[m] * s)), scl(A, side * th * 0.5 + (side > 0 ? (1 - s) * 0.18 : 0)));
    };
    const lift = (m: number) => Math.cos((m / M) * Math.PI * 2);
    const front = Array.from({ length: M }, (_, m) => plate.v(rim(m, -1), turfed(m) ? TURF : soil(m, 1, lift(m))));
    const back = Array.from({ length: M }, (_, m) => plate.v(rim(m, 1), turfed(m) ? mix(TURF, SOIL, 0.3) : soil(m, 2, lift(m))));
    const mid = Array.from({ length: M }, (_, m) => plate.v(add(rim(m, 1, 0.55), scl(A, 0.04 * hash(m, 9, seed))), soil(m, 3)));
    const fc = plate.v(add(pc, scl(A, -th * 0.5)), mix(SOIL, sp.dark, 0.4)), bcen = plate.v(add(pc, scl(A, th * 0.5 + 0.16)), soil(0, 4));
    for (let m = 0; m < M; m++) {
      const m1 = (m + 1) % M, phi = ((m + 0.5) / M) * Math.PI * 2, out = add(scl(ux, Math.cos(phi)), scl(wx, Math.sin(phi)));
      plate.f(front[m], front[m1], fc, scl(A, -1));
      plate.f(front[m], back[m], back[m1], out); plate.f(front[m], back[m1], front[m1], out);
      plate.f(back[m], mid[m], mid[m1], A); plate.f(back[m], mid[m1], back[m1], A);
      plate.f(mid[m], bcen, mid[m1], A);
    }
    const roots = 6 + Math.floor(r() * 4), rootCol = mix(sp.dark, SOIL, 0.4);
    for (let i = 0; i < roots; i++) {
      // (torn roots stand out of the plate's face over the ground; its buried foot keeps its own)
      const phi = (r() - 0.5) * 3.8, s = 0.45 + r() * 0.5, d = add(scl(ux, Math.cos(phi)), scl(wx, Math.sin(phi)));
      const at = add(add(pc, scl(d, Rp * s * 0.8)), scl(A, th * 0.4));
      stub(plate, at, unit(add(scl(A, 0.6 + r() * 0.6), scl(d, 0.5 + r()))), 0.18 + r() * 0.35, 0.02 + r() * 0.025, 0.01, 4, rootCol, rootCol);
    }
    for (let i = 0; i < 3; i++) {
      const phi = (r() - 0.5) * 3.8, s = 0.2 + r() * 0.6, d = add(scl(ux, Math.cos(phi)), scl(wx, Math.sin(phi)));
      pebble(plate, add(add(pc, scl(d, Rp * s)), scl(A, th * 0.5 + 0.06)), 0.05 + r() * 0.07, seed + i);
    }
  }
  return merged(parts);
}

interface StumpForm {
  r: number; h: number; pick: TimberPick;
  top: 'saw' | 'snap' | 'rot';
  /** the felling cut's lean (rad) and the side it falls to */
  tilt: number; tiltDir: number;
  /** the buttresses: their count and the first one's angle */
  lobes: number; lobe0: number;
  age: number;
  /** the roots run out over the ground to it (null: a logging yard's donor, moved after it is built) */
  roots: boolean;
  seed: number;
}

/** The stump's own choices at its seed (a logging yard's donor is fresh-felled, its roots kept to its foot). */
export function stumpForm(r: number, h: number, pick: TimberPick, seed: number, cut: boolean): StumpForm {
  const s = stream(seed);
  return {
    r, h, pick, seed,
    top: cut ? 'saw' : s() < 0.62 ? 'saw' : s() < 0.6 ? 'snap' : 'rot',
    tilt: 0.04 + s() * 0.06, tiltDir: s() * Math.PI * 2,
    lobes: 4 + Math.floor(s() * 3), lobe0: s() * Math.PI * 2,
    age: cut ? 0.1 : 0.3 + s() * 0.6,
    roots: !cut,
  };
}

/**
 * A stump about its centre (y -h/2 its seat, +h/2 its top): flared buttresses into a buried skirt, a saw cut (its lean,
 * its rings, the hinge's torn fibres), a snapped crown or a rotted-out hollow on top; its roots run out over the ground
 * (`ground(x, z)`: the ground's height in this frame) and dive into it.
 */
export function buildStump(f: StumpForm, ground: (x: number, z: number) => number): THREE.BufferGeometry {
  const sp = f.pick.species, S = Math.max(10, sp.sides), seed = f.seed;
  const bark = new Part(), top = new Part(), parts = [bark, top];
  // the rings: a buried skirt, the ground line, the flare, the bole, the top
  const hs = [-f.h / 2 - 0.12, -f.h / 2, -f.h / 2 + 0.07, -f.h / 2 + f.h * 0.3, -f.h / 2 + f.h * 0.65, f.h / 2];
  const flare = (j: number) => [1.3, 1, 0.62, 0.18, 0, 0][j];
  const lobe = (k: number) => {
    const th = (k / S) * Math.PI * 2;
    return Math.pow(Math.max(0, Math.cos(f.lobes * (th - f.lobe0) * 0.5)), 2) * 0.55;
  };
  const cutY = (k: number) => Math.tan(f.tilt) * f.r * Math.cos((k / S) * Math.PI * 2 - f.tiltDir);
  const base = (j: number) => f.r * (1.15 + (0.92 - 1.15) * Math.max(0, Math.min(1, (hs[j] + f.h / 2) / f.h)));
  const rel = (k: number, j: number) => relief(sp, k, j, hs[j], seed) - sp.amp;
  const X: V3 = [1, 0, 0], Z: V3 = [0, 0, 1], Y: V3 = [0, 1, 0];
  const ring = tube(bark, S, hs.length, (j) => [0, hs[j], 0], X, Z, (k, j) => base(j) * (1 + rel(k, j) + flare(j) * lobe(k)), (k, j, out) => {
    // moss at the foot and on the damp side, the rest bark
    const wet = (j <= 2 ? 0.8 : 0.2 * Math.max(0, dot(out, [0.6, 0, 0.8]))) * f.age;
    return barkColour(sp, f.pick, rel(k, j) + sp.amp, k, j, seed, wet);
  });
  // the top ring follows the cut's lean (a saw cut) or the break (snapped / rotted at its own heights)
  const last = ring[hs.length - 1];
  const P = bark.p;
  for (let k = 0; k < S; k++) P[last[k] * 3 + 1] += f.top === 'saw' ? cutY(k) : 0;
  const tc: V3 = [0, f.h / 2, 0];
  if (f.top === 'saw') {
    sawCap(top, last.map((id) => bark.pos(id)), tc, Y, sp, f.pick, f.age, seed ^ 0x11);
    // the hinge: a strip of torn fibres standing across the cut, square to the fall
    const hd: V3 = [Math.cos(f.tiltDir + Math.PI / 2), 0, Math.sin(f.tiltDir + Math.PI / 2)];
    const r = stream(seed ^ 0x6b);
    for (let i = 0; i < 4; i++) {
      const s = (i / 3 - 0.5) * 1.3 * f.r, at: V3 = add(tc, scl(hd, s)), hgt = 0.02 + r() * 0.04;
      const w = scl(hd, 0.035), col = grain(sp, f.pick, 0.5, f.age * 0.6, r());
      const a = top.v(add(at, w), col), b = top.v(sub(at, w), col), c = top.v(add(add(at, [0, hgt, 0]), scl(hd, (r() - 0.5) * 0.05)), col);
      const out: V3 = [Math.cos(f.tiltDir), 0, Math.sin(f.tiltDir)];
      top.f(a, b, c, out); top.f(a, c, b, scl(out, -1));
    }
  } else if (f.top === 'snap') {
    snapCap(top, last.map((id) => bark.pos(id)), tc, Y, f.r * 0.6, sp, f.pick, f.age, seed ^ 0x22);
  } else {
    // rotted out: the shell's lip, its inner wall down into the dark hollow
    const lip = last.map((id, k) => top.v(bark.pos(id), grain(sp, f.pick, 0.97, f.age, hash(k, 2, seed))));
    const inner = last.map((id, k) => { const q = bark.pos(id); return top.v([q[0] * 0.72, q[1] - 0.01, q[2] * 0.72], grain(sp, f.pick, 0.75, f.age, hash(k, 3, seed))); });
    const deep = last.map((id) => { const q = bark.pos(id); return top.v([q[0] * 0.62, q[1] - f.h * 0.45, q[2] * 0.62], mix(SOIL, CHAR_DARK, 0.5)); });
    const floor = top.v([0, f.h / 2 - f.h * 0.5, 0], mix(SOIL, CHAR_DARK, 0.6));
    for (let k = 0; k < S; k++) {
      const k1 = (k + 1) % S, th = ((k + 0.5) / S) * Math.PI * 2, inward: V3 = [-Math.cos(th), 0, -Math.sin(th)];
      top.f(lip[k], inner[k], inner[k1], Y); top.f(lip[k], inner[k1], lip[k1], Y);
      top.f(inner[k], deep[k], deep[k1], inward); top.f(inner[k], deep[k1], inner[k1], inward);
      top.f(deep[k], floor, deep[k1], Y);
    }
  }
  if (f.roots) {
    // the roots: from each buttress over the ground and into it
    const roots = new Part(); parts.push(roots);
    const r = stream(seed ^ 0x2c7), col = barkColour(sp, f.pick, 0, 1, 1, seed, f.age * 0.5);
    for (let i = 0; i < f.lobes; i++) {
      if (r() < 0.25) continue;
      const th = f.lobe0 + (i / f.lobes) * Math.PI * 2, d: V3 = [Math.cos(th), 0, Math.sin(th)];
      const reach = f.r * (1.6 + r() * 1.0), foot = add(scl(d, f.r * 1.2), [0, -f.h / 2 + 0.05, 0]);
      const mx = d[0] * reach * 0.6, mz = d[2] * reach * 0.6, ex = d[0] * reach, ez = d[2] * reach;
      const mid: V3 = [mx, Math.max(ground(mx, mz) + 0.02, -f.h / 2 - 0.1), mz];
      const end: V3 = [ex, ground(ex, ez) - 0.08, ez];
      const r0 = f.r * (0.24 + r() * 0.08);
      for (const [a, b, ra, rb] of [[foot, mid, r0, r0 * 0.6], [mid, end, r0 * 0.6, r0 * 0.3]] as const) {
        const seg = sub(b, a), len = Math.hypot(seg[0], seg[1], seg[2]);
        if (len < 0.05) continue;
        stub(roots, a, scl(seg, 1 / len), len, ra, rb, 5, col, col);
      }
    }
  }
  return merged(parts);
}
