// src/world/maps/boatHulls.ts — the map boats as hulls (the map-vehicles lane, P2, 2026-10-05).
//
// The kits' boats were ten boxes: three planks a side, a tilted bow plate, a transom and two thwarts. A boat here is a
// lofted hull: stations along its length, each a section from the keel round the bilge to the sheer, the strakes'
// lands stepped proud on a clinker boat, a skin of plank thickness inside, the gunwale capped, the stems carried up
// into posts on a Nordland boat, a transom on a canot or a gajeta, thwarts, bottom boards, and the paint of its coast:
// the Breton canots' bright topsides over a red-brown bottom, the Nordland færinger tarred, the Dalmatian gajete white
// with a coloured band under the sheer, the Ca Mau xuồng in dark varnish with their painted eyes, the Jamuna's nouka
// on its crescent sheer under a bamboo chhoi. One indexed geometry
// in vertex colours (the props' baked bucket, which a moored hull keeps), weathered by the toolkit: the water line's
// grime, the salt-bleached topsides, the shade inside.
//
// Local frame: length along +Z (the bow), beam along X, the keel's lowest point at y = 0. Renderer-free; no streams of
// its own (the kits spend their legacy draws and pass the few they use in `BoatVariation`).

import * as THREE from 'three';
import { VehicleMesh, linearHex, material, vehicleWeathering, type Vec3, type VehicleMaterial } from './vehicleMesh.ts';
import { keepStreams } from '../geometryStreams.ts';

type BoatType = 'faering' | 'canot' | 'gajeta' | 'xuong' | 'lakeboat' | 'nouka';

interface BoatSpec {
  type: BoatType;
  /** Overall length, the beam at the sheer amidships, the keel-to-sheer depth amidships (m). */
  length: number;
  beam: number;
  depth: number;
  /** The sheer's rise at the stern and the bow over amidships, and the keel's rise at the ends (rocker). */
  sheerAft: number;
  sheerFwd: number;
  rocker: number;
  /** 0 a flat floor (the xuồng, the lake boat) .. 1 a deep V. */
  deadrise: number;
  /** The topsides lean out by this share of the half-beam from the keel to the sheer. */
  flare: number;
  /** A transom (its half-beam as a share of the beam) or a double end. */
  stern: 'transom' | 'double';
  transom: number;
  /** Strakes a side; clinker strakes show their lands. */
  strakes: number;
  clinker: boolean;
  /** The stem (and a double end's stern post) carried this far above the sheer. */
  posts: number;
  thwarts: number;
  /** Colours (hex): topsides, the sheer strake, the bottom below the water line, the inside, the gunwale and posts, an
   * optional band under the sheer. */
  topside: number;
  sheerStrake: number;
  bottom: number;
  inside: number;
  trim: number;
  band?: number;
  /** Painted eyes on the bow (the Mekong boats). */
  eyes?: boolean;
  /** A woven bamboo hood (chhoi) arched over the middle of the boat (a Bengal passenger nouka). */
  hood?: boolean;
}

/** What a kit's draws pick for one boat: a colour scheme from the region's, a mast. */
interface BoatVariation {
  scheme: number;
  mast: boolean;
  /**
   * Afloat (a moored hull, 2026-10-07): the water's height over the keel's lowest point (m). The planking is soaked
   * dark from the keel to 0.1 m over it and a thin line of weed and slime marks the waterline (wave 153: a hull that
   * "rides entirely on top of the water… no draft, waterline"). Omitted, the boat is ashore.
   */
  afloat?: number;
  /**
   * Hauled out on a muddy landing (round 3, wave 234: the Mangrove boat "on clean lawn"): the bottom caked in mud from
   * the keel to this height (m), its edge splashed up the planking. With `afloat` the waterline it floated at shows too.
   */
  mud?: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

const paint = (hex: number, rough = 0.78, weather = 1): VehicleMaterial => material('paint', linearHex(hex), rough, 0, 0, weather);
const woodMat = (hex: number, scale = 1): VehicleMaterial => material('wood', linearHex(hex, scale), 0.86, 0, 0, 1);

/** Half-beam share along the length (u: 0 stern .. 1 bow): fuller aft, finer forward. */
function beamShare(s: BoatSpec, u: number): number {
  if (u >= 0.5) {
    const t = (u - 0.5) / 0.5;
    return Math.pow(Math.max(0, 1 - t * t), s.type === 'xuong' ? 0.55 : s.type === 'nouka' ? 0.62 : 0.75);
  }
  const t = (0.5 - u) / 0.5;
  if (s.stern === 'double') return Math.pow(Math.max(0, 1 - t * t), 0.7);
  return lerp(1, s.transom, Math.pow(t, 2.2));
}

function keelY(s: BoatSpec, u: number): number {
  const t = 2 * u - 1;
  const aft = s.stern === 'transom' ? 0.35 : 1;
  return s.rocker * t * t * (t < 0 ? aft : 1);
}

function sheerY(s: BoatSpec, u: number): number {
  const t = 2 * u - 1;
  return s.depth + (t < 0 ? s.sheerAft : s.sheerFwd) * t * t;
}

/** A section point (x, y) at u, v (0 keel .. 1 sheer), the clinker land stepped out at each strake's lower edge. */
function sectionPoint(s: BoatSpec, u: number, v: number, inset = 0): [number, number] {
  const B = (s.beam / 2) * beamShare(s, u), K = keelY(s, u), S = sheerY(s, u);
  const m = 1.25 + 2.6 * (1 - s.deadrise);
  let x = B * (1 - Math.pow(1 - v, m)) * (1 - s.flare * (1 - v));
  if (s.clinker && v > 0.001 && v < 0.999) {
    const f = v * s.strakes - Math.floor(v * s.strakes);
    x += 0.022 * (1 - f) * Math.min(1, B * 6);
  }
  const y = lerp(K, S, v);
  return [Math.max(0, x - inset), y + (v < 0.02 ? inset : 0)];
}

/** Wet planking under the waterline (linear RGB): dark, stained brown-green. */
const SOAKED_RGB: [number, number, number] = [0.052, 0.05, 0.032];
/** Planking under the water seen through it (linear RGB): the deep green-blue of a northern harbour. */
const UNDERWATER_RGB: [number, number, number] = [0.014, 0.034, 0.04];

/**
 * The soaked band of a hull afloat: the outer skin (its normals out from the keel line, the keel's underside) darkened
 * and stained toward SOAKED_RGB from the keel to the water's height `h`, fading out over the 0.1 m above it with a
 * ragged edge; the inside stays dry. In place on the built colours (their shading kept: the stain multiplies in).
 */
function soakHull(g: THREE.BufferGeometry, h: number, submerged = true): void {
  const p = g.attributes.position.array as Float32Array, n = g.attributes.normal.array as Float32Array;
  const c = g.attributes.color.array as Float32Array;
  for (let v = 0; v < p.length / 3; v++) {
    const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2], nx = n[v * 3], ny = n[v * 3 + 1];
    if (!(ny < -0.5 || (Math.abs(x) > 0.02 && nx * x > 0))) continue;
    const ragged = 0.025 * Math.sin(z * 9.1 + x * 3.7) + 0.015 * Math.sin(z * 23.3);
    const t = (y - h - ragged) / 0.1;
    const k = t <= 0 ? 1 : t >= 1 ? 0 : 1 - t * t * (3 - 2 * t);
    if (k <= 0) continue;
    // (wave 260: through the clear jetty water the submerged strakes showed untinted, "keel fully exposed… hovering"):
    // under the waterline the planking takes the water's own deep green-blue, so seen through the surface it reads as
    // submerged; the wet dark band above it stays
    const deep = submerged ? (h - 0.02 - y) / 0.14 : 0, u = deep <= 0 ? 0 : deep >= 1 ? 1 : deep * deep * (3 - 2 * deep);
    for (let i = 0; i < 3; i++) {
      const soaked = c[v * 3 + i] * (1 - 0.5 * k) * (1 - 0.35 * k) + SOAKED_RGB[i] * 0.35 * k;
      c[v * 3 + i] = soaked * (1 - 0.72 * u) + UNDERWATER_RGB[i] * 0.72 * u;
    }
  }
  g.attributes.color.needsUpdate = true;
}
/** Landing mud (linear RGB): grey-brown, the silt of a tidal creek. */
const MUD_RGB: [number, number, number] = [0.11, 0.094, 0.068];

/**
 * The mud a hull hauled out on a landing carries (round 3): the outer skin from the keel to `h` over it, its edge
 * splashed up the planking in a few tongues, caked (the colour mostly the mud's, a little of the paint's shading kept).
 */
function mudHull(g: THREE.BufferGeometry, h: number): void {
  const p = g.attributes.position.array as Float32Array, n = g.attributes.normal.array as Float32Array;
  const c = g.attributes.color.array as Float32Array;
  for (let v = 0; v < p.length / 3; v++) {
    const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2], nx = n[v * 3], ny = n[v * 3 + 1];
    if (!(ny < -0.5 || (Math.abs(x) > 0.02 && nx * x > 0))) continue;
    const splash = 0.05 * Math.max(0, Math.sin(z * 4.3 + x * 2.9)) ** 3 + 0.02 * Math.sin(z * 13.1 + 1.7);
    const t = (y - h - splash) / 0.06;
    const k = t <= 0 ? 1 : t >= 1 ? 0 : 1 - t * t * (3 - 2 * t);
    if (k <= 0) continue;
    for (let i = 0; i < 3; i++) c[v * 3 + i] = c[v * 3 + i] * (1 - 0.8 * k) + MUD_RGB[i] * 0.8 * k;
  }
  g.attributes.color.needsUpdate = true;
}
const SLIME = material('cargo', linearHex(0x5a6630), 0.3, 0, 0, 0.3);
const WEED = material('cargo', linearHex(0x3e5a28), 0.38, 0, 0, 0.3);

/**
 * The waterline's weed and slime: along each side, at every station whose skin spans the water's height, a strip from
 * 2 cm under to 4.5 cm over it (wave 260: at 3 cm it did not read as a line at the harbour's distances), 4 mm proud of
 * the planking (dressing; the clinker lands ignored: it lies on them).
 */
function waterlineStrip(mesh: VehicleMesh, s: BoatSpec, h: number, nu: number): void {
  mesh.dressing(() => {
    const at = (u: number, y: number): [number, number] | null => {
      const K = keelY(s, u), S = sheerY(s, u);
      if (y <= K + 0.01 || y >= S - 0.01) return null;
      const v = (y - K) / (S - K);
      const [x] = sectionPoint(s, u, v);
      return [x + 0.004, v];
    };
    for (const side of [1, -1]) {
      for (let i = 0; i < nu; i++) {
        const u0 = i / nu, u1 = (i + 1) / nu, z0 = (u0 - 0.5) * s.length, z1 = (u1 - 0.5) * s.length;
        const lo0 = at(u0, h - 0.02), hi0 = at(u0, h + 0.045), lo1 = at(u1, h - 0.02), hi1 = at(u1, h + 0.045);
        if (!lo0 || !hi0 || !lo1 || !hi1) continue;
        const m = (i * 7 + (side > 0 ? 3 : 0)) % 5 === 0 ? WEED : SLIME;
        const a = mesh.vert(side * lo0[0], h - 0.02, z0, side, 0, 0, m), b = mesh.vert(side * lo1[0], h - 0.02, z1, side, 0, 0, m);
        const c = mesh.vert(side * hi1[0], h + 0.045, z1, side, 0, 0, m), d = mesh.vert(side * hi0[0], h + 0.045, z0, side, 0, 0, m);
        side > 0 ? mesh.quad(a, b, c, d) : mesh.quad(a, d, c, b);
      }
    }
  });
}

/** Build one boat. */
export function buildBoat(spec: BoatSpec, variation: BoatVariation, coarse = false): THREE.BufferGeometry {
  const mesh = new VehicleMesh();
  mesh.coarse = coarse;
  const s = spec;
  const nu = coarse ? 14 : 26;
  // the section's rows: a few round the keel and the bilge, two per strake (its land and its top)
  const vs: number[] = [0];
  const per = s.clinker ? 2 : 1;
  const rows = coarse ? Math.max(3, Math.ceil(s.strakes / 2)) : s.strakes;
  for (let k = 0; k < rows; k++) {
    for (let p = 1; p <= per; p++) vs.push((k + (per === 2 ? (p === 1 ? 0.04 : 1) : p)) / rows);
  }
  vs[vs.length - 1] = 1;
  const nv = vs.length - 1;
  const waterline = 0.36;
  const top = paint(s.topside), sheer = paint(s.sheerStrake), bottom = paint(s.bottom, 0.85), inside = woodMat(s.inside, 0.62);
  const rib = woodMat(s.inside, 0.42);
  const trim = paint(s.trim, 0.82), band = s.band !== undefined ? paint(s.band) : null;
  const outerMat = (j: number) => {
    const v = (vs[j] + vs[j + 1]) / 2;
    if (v < waterline) return bottom;
    if (v > 1 - 1 / s.strakes) return sheer;
    if (band && v > 1 - 2 / s.strakes) return band;
    return top;
  };
  const u0 = 0, u1 = 1;
  const U = (i: number) => lerp(u0, u1, i / nu);
  mesh.mirrored(() => {
    // the outer skin
    mesh.grid(nu, nv, (i, j, out) => {
      const u = U(i), [x, y] = sectionPoint(s, u, vs[j]);
      out[0] = x; out[1] = y; out[2] = (u - 0.5) * s.length;
    }, (_i, j) => outerMat(j), { creaseJ: s.clinker ? vs.map((_, j) => j).filter((j) => j % 2 === 1) : [], flip: true });
    // the inner skin (plank thickness inside), facing in
    mesh.grid(nu, nv, (i, j, out) => {
      const u = U(i), [x, y] = sectionPoint(s, u, vs[j], 0.028);
      out[0] = x; out[1] = y + 0.02; out[2] = (u - 0.5) * s.length;
    }, () => inside);
    // the gunwale cap between the skins
    mesh.grid(nu, 1, (i, j, out) => {
      const u = U(i), [x, y] = sectionPoint(s, u, 1, j === 0 ? 0 : 0.03);
      out[0] = x + (j === 0 ? 0.008 : 0); out[1] = y + 0.012; out[2] = (u - 0.5) * s.length;
    }, () => trim);
  });
  // the transom: the stern section closed between the skins' sternmost stations
  if (s.stern === 'transom') {
    const pts: [number, number][] = vs.map((v) => sectionPoint(s, 0, v));
    const z = -0.5 * s.length;
    const c = mesh.vert(0, (pts[0][1] + pts[pts.length - 1][1]) / 2, z - 0.004, 0, 0, -1, top);
    for (const side of [1, -1]) {
      const ring = pts.map(([x, y]) => mesh.vert(side * x, y, z - 0.004, 0, 0, -1, top));
      for (let k = 0; k + 1 < ring.length; k++) side > 0 ? mesh.tri(c, ring[k + 1], ring[k]) : mesh.tri(c, ring[k], ring[k + 1]);
    }
    // its top rail
    const [tx, ty] = pts[pts.length - 1];
    mesh.box(0, ty + 0.01, z + 0.01, tx * 2 + 0.03, 0.04, 0.05, trim, 0.008);
  }
  // the stem (and the stern post of a double end): a timber up the end line and above the sheer
  const post = (end: 1 | -1) => {
    const u = end > 0 ? 1 : 0;
    const z = (u - 0.5) * s.length, K = keelY(s, u), S = sheerY(s, u);
    const lean = end * (0.1 + s.posts * 0.35);
    const path: [number, number, number][] = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6, y = lerp(K, S + s.posts, t);
      path.push([0, y, z + end * 0.01 + lean * t * t]);
    }
    mesh.sweep(path, [[-0.035, -0.04], [0.035, -0.04], [0.035, 0.04], [-0.035, 0.04]], () => trim,
      { closedSection: true, caps: true, up: [1, 0, 0] });
  };
  post(1);
  if (s.stern === 'double') post(-1);
  // the keel strip under the hull
  {
    const path: [number, number, number][] = [];
    for (let k = 0; k <= 10; k++) {
      const u = 0.04 + 0.92 * (k / 10);
      path.push([0, keelY(s, u) - 0.012, (u - 0.5) * s.length]);
    }
    mesh.sweep(path, [[-0.03, -0.02], [0.03, -0.02], [0.03, 0.02], [-0.03, 0.02]], () => bottom, { closedSection: true, caps: true, up: [0, 1, 0] });
  }
  // thwarts across the inside at seat height, and the bottom boards
  for (let k = 0; k < s.thwarts; k++) {
    const u = s.thwarts === 1 ? 0.52 : lerp(0.3, 0.74, k / (s.thwarts - 1));
    const v = 0.62;
    const [x, y] = sectionPoint(s, u, v, 0.03);
    mesh.box(0, y, (u - 0.5) * s.length, x * 2, 0.035, 0.22, inside, 0.006);
  }
  if (!coarse) {
    // the frames: bent ribs across the inside from gunwale to gunwale every half metre
    const frames = Math.max(4, Math.round(s.length / 0.5));
    for (let k = 1; k < frames; k++) {
      const u = k / frames;
      if (u < 0.08 || u > 0.92) continue;
      const path: [number, number, number][] = [];
      for (let q = -3; q <= 3; q++) {
        const v = Math.abs(q) / 3, [x, y] = sectionPoint(s, u, v, 0.034);
        path.push([Math.sign(q) * x, y + 0.012, (u - 0.5) * s.length]);
      }
      mesh.sweep(path, [[-0.014, -0.02], [0.014, -0.02], [0.014, 0.012], [-0.014, 0.012]], () => rib, { closedSection: true, caps: true, up: [0, 0, 1] });
    }
    for (const x of [-0.16, 0, 0.16]) {
      const [, y] = sectionPoint(s, 0.5, 0.06, 0.03);
      mesh.box(x * s.beam / 1.6, y + 0.03, 0, 0.12, 0.018, s.length * 0.52, inside, 0.004);
    }
  }
  // the chhoi of a Bengal nouka: a woven bamboo mat arched over the middle third, its edges on the gunwales
  if (s.hood) {
    const u0 = 0.36, u1 = 0.62, rows = coarse ? 3 : 5, cols = coarse ? 6 : 10;
    const weave = material('canvas', linearHex(0x7a6a4e), 0.95, 0, 0, 1);
    for (const inset of [0, 0.014]) {
      mesh.grid(rows, cols, (i, j, out) => {
        const u = lerp(u0, u1, i / rows), [x, y] = sectionPoint(s, u, 1);
        const a = Math.PI * (j / cols);
        out[0] = (x + 0.02 - inset) * Math.cos(a);
        out[1] = y + 0.015 + (0.66 - inset) * Math.pow(Math.sin(a), 0.75);
        out[2] = (u - 0.5) * s.length;
      }, () => weave, { flip: inset > 0 });
    }
    // the canes along its ends
    for (const u of [u0, u1]) {
      const [x, y] = sectionPoint(s, u, 1), arch: [number, number, number][] = [];
      for (let k = 0; k <= 8; k++) {
        const a = Math.PI * (k / 8);
        arch.push([(x + 0.03) * Math.cos(a), y + 0.02 + 0.672 * Math.pow(Math.sin(a), 0.75), (u - 0.5) * s.length]);
      }
      mesh.tube(arch, 0.018, coarse ? 4 : 6, woodMat(0x7a6040), { caps: true });
    }
  }
  // the painted eyes of the Mekong boats (mắt ghe), either side of the bow: a red almond, its white, a round black
  // pupil looking ahead, painted on the planking and following its curve (wave 153: flat boxes read as "a pin/flag
  // icon", a UI waypoint)
  if (s.eyes) {
    const u0 = 0.86, v0 = 0.66, H = sheerY(s, u0) - keelY(s, u0);
    const at = (u: number, v: number, lift: number, side: number): Vec3 => {
      const [x, y] = sectionPoint(s, u, v, -lift);
      return [side * x, y, (u - 0.5) * s.length];
    };
    // a painted patch: a fan round (uc, vc) out to the edge `edge(t)` (half-extents in metres along and up the side),
    // each vertex on the hull `lift` proud of the planking, its normal the hull's own
    const patch = (side: number, uc: number, vc: number, lift: number, edge: (t: number) => [number, number], m: VehicleMaterial) => {
      const n = coarse ? 10 : 20;
      const normalAt = (u: number, v: number): Vec3 => {
        const e = 0.004, a = at(u + e, v, 0, side), b = at(u - e, v, 0, side), c = at(u, v + e, 0, side), d = at(u, v - e, 0, side);
        const du: Vec3 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dv: Vec3 = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
        const nx = du[1] * dv[2] - du[2] * dv[1], ny = du[2] * dv[0] - du[0] * dv[2], nz = du[0] * dv[1] - du[1] * dv[0];
        const flip = nx * side < 0 ? -1 : 1, l = Math.hypot(nx, ny, nz) || 1;
        return [(flip * nx) / l, (flip * ny) / l, (flip * nz) / l];
      };
      const vert = (u: number, v: number): number => {
        const p = at(u, v, lift, side), q = normalAt(u, v);
        return mesh.vert(p[0], p[1], p[2], q[0], q[1], q[2], m);
      };
      const c = vert(uc, vc), ring: number[] = [];
      for (let k = 0; k < n; k++) {
        const [eu, ev] = edge((k / n) * Math.PI * 2);
        ring.push(vert(uc + eu / s.length, vc + ev / H));
      }
      // the ring runs bow, up, aft, down: clockwise seen from the starboard side, so starboard winds it back
      for (let k = 0; k < n; k++) side > 0 ? mesh.tri(c, ring[(k + 1) % n], ring[k]) : mesh.tri(c, ring[k], ring[(k + 1) % n]);
    };
    // the almond: pointed at both ends, fuller toward the bow
    const almond = (a: number, b: number) => (t: number): [number, number] => {
      const ct = Math.cos(t), st = Math.sin(t);
      return [a * ct, b * Math.sign(st) * Math.pow(Math.abs(st), 0.8) * (0.82 + 0.18 * ct) * Math.pow(1 - 0.3 * ct * ct, 1)];
    };
    const round = (r: number) => (t: number): [number, number] => [r * Math.cos(t), r * Math.sin(t)];
    for (const side of [1, -1]) {
      patch(side, u0, v0, 0.004, almond(0.15, 0.072), paint(0x9c2a22, 0.7, 0.6));
      patch(side, u0, v0, 0.007, almond(0.125, 0.052), paint(0xf2efe6, 0.6, 0.6));
      patch(side, u0 + 0.03 / s.length, v0 + 0.004 / H, 0.01, round(0.036), paint(0x161616, 0.6, 0.6));
    }
  }
  // a mast stepped through the forward thwart, its sail furled on the boom
  if (variation.mast) {
    const u = 0.74, [, y] = sectionPoint(s, u, 0.62, 0.03);
    const z = (u - 0.5) * s.length, h = s.length * 0.62;
    mesh.box(0, y + h / 2, z, 0.09, h, 0.09, woodMat(0x6e5a44), 0.012);
    mesh.push().translate(0, y + 0.95, z - s.length * 0.22);
    mesh.box(0, 0, 0, 0.07, 0.07, s.length * 0.46, woodMat(0x6e5a44), 0.01);
    mesh.box(0, 0.06, 0, 0.13, 0.1, s.length * 0.42, material('canvas', linearHex(0xb8ad94), 0.95, 0, 0, 1), 0.03);
    mesh.pop();
  }
  // the baked bucket's streams: position, normal, uv, colour (a fresh geometry: a moored hull is drawn on its own every
  // frame, keepStreams); marked as a boat for the dressing receipts
  // afloat: the waterline's weed and slime, a thin strip a few millimetres proud of the planking along both sides
  // wherever the hull's skin crosses the water's height (dressing), and the soaked band under it (soakHull)
  const afloat = variation.afloat;
  if (afloat !== undefined && !coarse) waterlineStrip(mesh, s, afloat, nu);
  const built = mesh.build(vehicleWeathering({ wheels: [], dirt: 0.25, dirtTop: s.depth * waterline + 0.1, rust: 0.35,
    seed: 11 + variation.scheme, voxelAo: !coarse }));
  // a hull hauled out (mud) shows where it floated, but nothing of it is under water now
  if (afloat !== undefined) soakHull(built, afloat, variation.mud === undefined);
  if (variation.mud !== undefined) mudHull(built, variation.mud);
  const g = keepStreams(built, ['position', 'normal', 'uv', 'color']);
  g.userData = { ...g.userData };
  delete g.userData.bodyBox;
  g.userData.boat = true;
  return g;
}

// ---------------------------------------------------------------------------------------------------- the coasts' boats

/** A region's boat: its hull and its colour schemes (a kit's draw picks one). */
export interface BoatFamily {
  hull: Omit<BoatSpec, 'topside' | 'sheerStrake' | 'bottom' | 'inside' | 'trim' | 'band'>;
  schemes: readonly Pick<BoatSpec, 'topside' | 'sheerStrake' | 'bottom' | 'inside' | 'trim' | 'band'>[];
}

export const BOAT_FAMILIES: Readonly<Record<string, BoatFamily>> = {
  // Nordland: the færing / åttring of the Lofoten and Ofoten fjords, double-ended clinker with tall stems, tarred
  faering: {
    hull: { type: 'faering', length: 5.6, beam: 1.5, depth: 0.62, sheerAft: 0.34, sheerFwd: 0.42, rocker: 0.16, deadrise: 0.7,
      flare: 0.22, stern: 'double', transom: 0, strakes: 6, clinker: true, posts: 0.32, thwarts: 3 },
    schemes: [
      { topside: 0x2a2620, sheerStrake: 0x2a2620, bottom: 0x1e1b17, inside: 0x8a6a48, trim: 0x231f1a },
      { topside: 0xe6e2d6, sheerStrake: 0x2a3a4a, bottom: 0x2a2620, inside: 0x9a7a54, trim: 0x2a2620 },
      { topside: 0x3a2e24, sheerStrake: 0x7a2a22, bottom: 0x1e1b17, inside: 0x8a6a48, trim: 0x231f1a },
    ],
  },
  // Brittany: the canot of the Léon coast, carvel, a transom, bright topsides over a red-brown bottom
  canot: {
    hull: { type: 'canot', length: 5.2, beam: 1.85, depth: 0.7, sheerAft: 0.12, sheerFwd: 0.26, rocker: 0.08, deadrise: 0.55,
      flare: 0.16, stern: 'transom', transom: 0.62, strakes: 7, clinker: false, posts: 0.06, thwarts: 3 },
    schemes: [
      { topside: 0x2f5f86, sheerStrake: 0xe8e4d8, bottom: 0x7a3426, inside: 0x9a8064, trim: 0xe8e4d8 },
      { topside: 0x2f6e4e, sheerStrake: 0xe8e4d8, bottom: 0x7a3426, inside: 0x9a8064, trim: 0x1d1d1b },
      { topside: 0xe8e4d8, sheerStrake: 0x2f5f86, bottom: 0x7a3426, inside: 0xa08868, trim: 0x2f5f86 },
      { topside: 0x8a2f26, sheerStrake: 0xe8e4d8, bottom: 0x2a2620, inside: 0x9a8064, trim: 0xe8e4d8 },
    ],
  },
  // Dalmatia: the gajeta / pasara of the channels, carvel, a small transom, white with a band under the sheer
  gajeta: {
    hull: { type: 'gajeta', length: 5.8, beam: 1.9, depth: 0.74, sheerAft: 0.14, sheerFwd: 0.3, rocker: 0.06, deadrise: 0.6,
      flare: 0.14, stern: 'transom', transom: 0.42, strakes: 8, clinker: false, posts: 0.26, thwarts: 2 },
    schemes: [
      { topside: 0xeeebe2, sheerStrake: 0x2c5f8e, bottom: 0x7a3426, inside: 0xa58a66, trim: 0x2c5f8e, band: 0xeeebe2 },
      { topside: 0xeeebe2, sheerStrake: 0x3a7a5a, bottom: 0x7a3426, inside: 0xa58a66, trim: 0x3a7a5a, band: 0xeeebe2 },
      { topside: 0xeeebe2, sheerStrake: 0x9a2a22, bottom: 0x2a2a2a, inside: 0xa58a66, trim: 0x9a2a22, band: 0xeeebe2 },
    ],
  },
  // Ca Mau: the xuồng of the creeks, long and narrow on a flat floor, both ends raised, dark varnish and painted eyes
  xuong: {
    hull: { type: 'xuong', length: 6.4, beam: 1.15, depth: 0.42, sheerAft: 0.2, sheerFwd: 0.32, rocker: 0.14, deadrise: 0.12,
      flare: 0.12, stern: 'double', transom: 0, strakes: 3, clinker: false, posts: 0.08, thwarts: 2, eyes: true },
    schemes: [
      { topside: 0x4a3626, sheerStrake: 0x3a2a1e, bottom: 0x2a2018, inside: 0x6a4e34, trim: 0x2e221a },
      { topside: 0x5a6a5a, sheerStrake: 0x9a2a22, bottom: 0x2a2018, inside: 0x6a4e34, trim: 0x2e221a },
      { topside: 0x3e5a76, sheerStrake: 0xd8d2c0, bottom: 0x2a2018, inside: 0x6a4e34, trim: 0x2e221a },
    ],
  },
  // the Jamuna: the dinghi nouka of the chars, double-ended on a crescent sheer, tarred or oiled, some under a chhoi
  nouka: {
    hull: { type: 'nouka', length: 6.6, beam: 1.45, depth: 0.44, sheerAft: 0.62, sheerFwd: 0.74, rocker: 0.24, deadrise: 0.3,
      flare: 0.12, stern: 'double', transom: 0, strakes: 4, clinker: false, posts: 0.2, thwarts: 2, hood: true },
    schemes: [
      { topside: 0x231d17, sheerStrake: 0x231d17, bottom: 0x1a1612, inside: 0x6e5236, trim: 0x2a221a },
      { topside: 0x5a4430, sheerStrake: 0x2f5a86, bottom: 0x1e1914, inside: 0x7a5c3c, trim: 0x2a221a, band: 0x9a2a22 },
      { topside: 0x3e3226, sheerStrake: 0xc8a030, bottom: 0x1a1612, inside: 0x6e5236, trim: 0x2a221a },
    ],
  },
  // the Alps: a lake's plank rowing boat, a flat floor and a transom, its paint faded
  lakeboat: {
    hull: { type: 'lakeboat', length: 4.2, beam: 1.4, depth: 0.5, sheerAft: 0.08, sheerFwd: 0.16, rocker: 0.06, deadrise: 0.18,
      flare: 0.2, stern: 'transom', transom: 0.7, strakes: 4, clinker: true, posts: 0.04, thwarts: 2 },
    schemes: [
      { topside: 0x3c4e3a, sheerStrake: 0x2a2620, bottom: 0x2a2620, inside: 0x8a7458, trim: 0x2a2620 },
      { topside: 0x5a5e62, sheerStrake: 0x2a2620, bottom: 0x2a2620, inside: 0x8a7458, trim: 0x2a2620 },
    ],
  },
};

/** The boat family of a map's coast (by the map's Reference). */
export function boatFamilyForMap(mapId: string): BoatFamily {
  switch (mapId) {
    case 'fjord': return BOAT_FAMILIES.faering;
    case 'coastal': return BOAT_FAMILIES.canot;
    case 'saltwind': return BOAT_FAMILIES.gajeta;
    case 'mangrove': return BOAT_FAMILIES.xuong;
    case 'delta': return BOAT_FAMILIES.nouka;
    case 'alpine': return BOAT_FAMILIES.lakeboat;
    default: return BOAT_FAMILIES.canot;
  }
}

/** One boat of a family: its hull scaled to a length, a scheme and a mast picked by the kit's draws. */
export function familyBoat(family: BoatFamily, length: number, scheme: number, mast: boolean, coarse = false,
  afloat?: number, mud?: number): THREE.BufferGeometry {
  const k = length / family.hull.length;
  const hull = { ...family.hull, length, beam: family.hull.beam * clamp(Math.sqrt(k), 0.85, 1.15), depth: family.hull.depth * clamp(Math.sqrt(k), 0.88, 1.12) };
  const colours = family.schemes[((scheme % family.schemes.length) + family.schemes.length) % family.schemes.length];
  return buildBoat({ ...hull, ...colours }, {
    scheme, mast, ...(afloat === undefined ? {} : { afloat }), ...(mud === undefined ? {} : { mud }),
  }, coarse);
}
