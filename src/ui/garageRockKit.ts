// src/ui/garageRockKit.ts — sculpted rock for the Garage scene packs (the garage redesign, round 7, 2026-10-14; props
// census #20, garage:rock_cavern grade 0: "a sculpted irregular rock face (displaced, faceted mesh with strata and snow
// ledges) round a shotcrete-lined tunnel mouth ... receding into real depth ... no painted black wall").
//
// One builder: a cliff face in a cluster's frame (lateral u, longitudinal w toward the yard, y up), built stratum by
// stratum. Each stratum is a band of facets that leans a little forward up its height and steps back at its top, so the
// face carries upward ledges where snow lies; the whole face batters back with height, its ends curve back into the
// hill, and a top slopes back from the crest. An opening (a horseshoe: walls to `spring`, a semicircle over them) is cut
// through it, and a lined tunnel runs back from the opening. Flat-shaded, vertex-coloured, world space: it joins the
// pack's baked bucket (no draw of its own).
import * as THREE from 'three';

export interface RockFrame {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  /** Ground height under a point of the face (u, w in the frame). */
  readonly groundAt: (u: number, w: number) => number;
}

export interface RockFaceOptions {
  readonly width: number;
  readonly height: number;
  /** How far the top slopes back and the ends curve back. */
  readonly depth: number;
  readonly seed: number;
  /** Stratum tones (sRGB), one per band in turn. */
  readonly strata: readonly number[];
  readonly snow: number;
  /** Metres between the face's columns (default 0.8; a wide face takes coarser columns to hold its triangle budget). */
  readonly cell?: number;
  /** The tunnel's opening and its lining, if any. */
  readonly opening?: Readonly<{ u: number; half: number; spring: number; length: number; lining: number }>;
  /**
   * The cut the portal's headwall is cast into: within `half` of the opening and up to `top` the face stands plumb at `w`
   * (just behind the headwall), blending back into the rock's own form over 3 m to either side and above.
   */
  readonly cut?: Readonly<{ half: number; w: number; top: number }>;
}

interface Soup {
  readonly positions: number[];
  normals: number[];
  readonly colors: number[];
}

const linear = (hex: number): THREE.Color => new THREE.Color(hex);

function triangle(soup: Soup, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color,
  colorB: THREE.Color = color, colorC: THREE.Color = color): void {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  if (n.lengthSq() < 1e-12) return;
  n.normalize();
  const colors = [color, colorB, colorC];
  [a, b, c].forEach((p, i) => {
    soup.positions.push(p.x, p.y, p.z);
    soup.normals.push(n.x, n.y, n.z);
    soup.colors.push(colors[i].r, colors[i].g, colors[i].b);
  });
}

/** Build a cliff face (and its tunnel) as one world-space, flat-shaded, vertex-coloured geometry. */
/**
 * Smooth shading over a triangle soup (v3 stills, 2026-10-14: per-facet normals lit the rock as "a patchwork of flat
 * squares"): every vertex takes the average of the face normals meeting at its position within 60 degrees of its own,
 * so the faces read as one surface and real creases (the face's edge, the tunnel lining) stay sharp.
 */
function smoothNormals(soup: Soup): void {
  const key = (i: number): string => `${Math.round(soup.positions[i] * 50)},${Math.round(soup.positions[i + 1] * 50)},${Math.round(soup.positions[i + 2] * 50)}`;
  const groups = new Map<string, number[]>();
  for (let i = 0; i < soup.positions.length; i += 3) {
    const k = key(i);
    let list = groups.get(k);
    if (!list) { list = []; groups.set(k, list); }
    list.push(i);
  }
  const out = soup.normals.slice();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    for (const i of list) {
      let x = 0, y = 0, z = 0;
      for (const j of list) {
        const dot = soup.normals[i] * soup.normals[j] + soup.normals[i + 1] * soup.normals[j + 1] + soup.normals[i + 2] * soup.normals[j + 2];
        if (dot < 0.5) continue;
        x += soup.normals[j]; y += soup.normals[j + 1]; z += soup.normals[j + 2];
      }
      const l = Math.hypot(x, y, z) || 1;
      out[i] = x / l; out[i + 1] = y / l; out[i + 2] = z / l;
    }
  }
  soup.normals = out;
}

export function buildRockFace(frame: RockFrame, options: RockFaceOptions): THREE.BufferGeometry {
  const soup: Soup = { positions: [], normals: [], colors: [] };
  const { width, height, depth, seed, opening } = options;
  const cos = Math.cos(frame.yaw), sin = Math.sin(frame.yaw);
  const world = (u: number, y: number, w: number): THREE.Vector3 => new THREE.Vector3(
    frame.x + cos * u + sin * w, y, frame.z - sin * u + cos * w);
  // a small seeded value noise
  let state = seed >>> 0;
  const lattice = Float32Array.from({ length: 64 * 64 }, () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
  const noise = (x: number, y: number): number => {
    const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy;
    const at = (cx: number, cy: number): number => lattice[(((cy % 64) + 64) % 64) * 64 + (((cx % 64) + 64) % 64)];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy;
  };
  const fbm = (x: number, y: number): number => noise(x, y) * 0.6 + noise(x * 2.3 + 17, y * 2.3 + 5) * 0.3 + noise(x * 5.1 + 3, y * 5.1 + 29) * 0.1;
  const half = width / 2;
  const columns = Math.max(8, Math.round(width / (options.cell ?? 0.8)));
  // strata of uneven thickness (0.9-1.8 m), each a fixed band
  const stratumH = 1.3;
  const strata = Math.ceil(height / stratumH);
  const hash = (a: number, b: number): number => {
    let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ seed;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h ^= h >>> 12;
    return ((h >>> 0) % 10000) / 10000;
  };
  const crest = (u: number): number => height * (0.78 + 0.22 * fbm(u * 0.09 + 3, 1.7)) * (1 - 0.35 * Math.pow(Math.abs(u) / half, 3));
  // The face's form (the re-judge, 2026-10-15: "horizontal smeared bands ... like a sliced layer cake ... no rock form,
  // joints or facets, and snow does not sit only on the low-angle faces"): no stratum steps any more. The plan swings in
  // and out over 6-14 m in buttresses with sharp noses and gullies between them; two benches dip across the face, where
  // it steps back a metre or two over a metre's height and the snow lies; jointed blocks 2-4 m wide in tiers of three
  // strata stand proud or set back; the whole face batters back with height and its ends curl into the hill.
  const plan = (u: number): number => (1 - Math.abs(noise(u * 0.085 + 5.3, 2.1) * 2 - 1)) * 2.4 - 1.2
    + (fbm(u * 0.21 + 1.3, 7.7) - 0.5) * 1.4;
  const smooth = (x: number): number => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
  const bench = (u: number, y: number, at: number, back: number, seedU: number): number => {
    const line = at + 0.12 * u + (fbm(u * 0.05 + seedU, 3.3) - 0.5) * 3.0;
    const reach = back * smooth((fbm(u * 0.06 + seedU * 2, 9.1) - 0.32) * 3);
    return -reach * smooth((y - line) / 2.4); // a ledge a couple of metres deep, not a stripe (CPU canonical, 2026-10-15)
  };
  // the portal's cut: 1 within the headwall's reach of the opening, 0 three metres beyond it
  const cutShare = (u: number): number => (options.cut && opening
    ? 1 - smooth((Math.abs(u - opening.u) - options.cut.half) / 3) : 0);
  /** The face's continuous form (its slope decides where snow lies). */
  const formBack = (u: number, y: number): number => {
    const curl = -depth * 0.45 * Math.pow(Math.abs(u) / half, 3) * (0.8 + 0.4 * fbm(y * 0.2, 4.1));
    const rock = curl - 0.18 * y + plan(u) * (0.85 + 0.3 * fbm(y * 0.08 + 2, u * 0.02)) + bench(u, y, height * 0.34, 2.2, 1.7)
      + bench(u, y, height * 0.66, 1.6, 6.1);
    const share = cutShare(u) * (options.cut ? 1 - smooth((y - options.cut.top) / 3) : 0);
    return share > 0 ? rock + (options.cut!.w - rock) * share : rock; // the cut stands plumb behind the headwall
  };
  // the face's set-back at (u, y) within stratum s (the strata only order the mesh's rows now)
  const setBack = (u: number, y: number, s: number, _t: number): number => {
    const tier = Math.floor(s / 3);
    const blockWidth = 2 + hash(tier, 7) * 2;
    const block = Math.floor(u / blockWidth + hash(tier, 3) * 3);
    const jointed = (hash(block, tier) - 0.5) * 0.5;
    const rough = (fbm(u * 0.3 + s * 1.7, y * 0.3) - 0.5) * 0.7 + (fbm(u * 0.9 + 11, y * 0.9 + s) - 0.5) * 0.3;
    return formBack(u, y) + (jointed + rough) * (1 - 0.75 * cutShare(u)); // the cut face is dressed flatter
  };
  const inOpening = (u: number, y: number, margin = 0): boolean => {
    if (!opening) return false;
    const du = Math.abs(u - opening.u);
    if (y < opening.spring) return du < opening.half + margin;
    return Math.hypot(du, y - opening.spring) < opening.half + margin;
  };
  // the gneiss's foliation dips and folds across the face in tones pulled most of the way to their mean, so it reads as
  // one rock with a grain, not as stripes; noses lighter, gullies darker, water streaks; snow only where the form lies
  // back (the benches and the crest), its edge broken by noise
  const mean = options.strata.map(linear).reduce((acc, c) => acc.add(c), new THREE.Color(0, 0, 0)).multiplyScalar(1 / options.strata.length);
  const strataTones = options.strata.map((hex) => linear(hex).lerp(mean, 0.68));
  const snow = linear(options.snow);
  const snowShade = linear(0xc9d3da);
  const tone = (_s: number, u: number, y: number, _n: THREE.Vector3): THREE.Color => {
    const band = (y + 0.13 * u + 2.2 * fbm(u * 0.04 + 2, y * 0.05)) / 2.4;
    const i0 = Math.floor(band), f = band - i0, n = strataTones.length;
    const base = strataTones[((i0 % n) + n) % n].clone().lerp(strataTones[(((i0 + 1) % n) + n) % n], f * f * (3 - 2 * f));
    base.multiplyScalar(0.86 + fbm(u * 0.15 + 9, y * 0.18) * 0.28);
    base.multiplyScalar(0.84 + 0.16 * Math.min(1, Math.max(0, (plan(u) + 1.2) / 2.4)));
    base.multiplyScalar(1 - Math.pow(fbm(u * 0.7 + 21, y * 0.05), 3) * 0.35);
    if (y < 1.2) base.multiplyScalar(0.8 + y / 6);
    const slope = (formBack(u, y + 0.35) - formBack(u, y - 0.35)) / 0.7;
    const lying = smooth((-slope - 0.6) / 0.9) * smooth((fbm(u * 0.11 + 4, y * 0.16) - 0.3) * 2.2); // patches, broken along the ledge
    return lying > 0 ? base.lerp(snow.clone().lerp(snowShade, fbm(u * 0.8, y * 0.8) * 0.5), lying) : base;
  };
  const us = Array.from({ length: columns + 1 }, (_, k) => -half + (k / columns) * width);
  const ground = us.map((u) => frame.groundAt(u, 0));
  // per column: the y of each stratum boundary, clipped to the crest
  const rows = (k: number, s: number): readonly [number, number, number] => {
    const y0 = ground[k] - 0.6 + s * stratumH, y1 = y0 + stratumH;
    const top = Math.min(y1, ground[k] - 0.6 + crest(us[k]));
    return [Math.min(y0, top), Math.min((y0 + y1) / 2, top), top];
  };
  const face = (k: number, s: number, r: 0 | 1 | 2): THREE.Vector3 => {
    const ys = rows(k, s);
    const t = r / 2;
    return world(us[k], ys[r], setBack(us[k], ys[r] - ground[k], s, t));
  };
  const FACE_NORMAL = new THREE.Vector3(0, 0, 1);
  for (let s = 0; s < strata; s += 1) {
    for (let k = 0; k < columns; k += 1) {
      for (const r of [0, 1] as const) {
        const a = face(k, s, r), b = face(k + 1, s, r), c = face(k + 1, s, (r + 1) as 1 | 2), d = face(k, s, (r + 1) as 1 | 2);
        if (Math.abs(c.y - b.y) < 1e-3 && Math.abs(d.y - a.y) < 1e-3) continue; // above the crest
        const mu = (us[k] + us[k + 1]) / 2, my = (a.y + c.y) / 2 - (ground[k] + ground[k + 1]) / 2;
        if (inOpening(mu, my, -0.15)) continue;
        // the face's colour is a function of the vertex alone (stratum, u, height), never of the facet's normal, so
        // neighbouring facets share their edges' colours (a snow rule on the facet's normal speckled the face with
        // white squares: v3 stills); the snow lies on the ledges and the crest
        const at = (p: THREE.Vector3, k0: number): THREE.Color => tone(s, us[k0], p.y - ground[k0], FACE_NORMAL);
        const ca = at(a, k), cb = at(b, k + 1), cc = at(c, k + 1), cd = at(d, k);
        // seen from the yard (+w): a -> b runs +u, so counter-clockwise is a, b, c and a, c, d
        triangle(soup, a, b, c, ca, cb, cc);
        triangle(soup, a, c, d, ca, cc, cd);
      }
      // the ledge between this stratum's top and the next one's foot: upward, snow-laden
      if (s < strata - 1) {
        const a = face(k, s, 2), b = face(k + 1, s, 2), c = face(k + 1, s + 1, 0), d = face(k, s + 1, 0);
        const mu = (us[k] + us[k + 1]) / 2, my = a.y - ground[k];
        if (a.y >= rows(k, s + 1)[2] - 1e-3 || inOpening(mu, my, -0.15)) continue;
        const at = (p: THREE.Vector3, k0: number): THREE.Color => tone(s, us[k0], p.y - ground[k0], FACE_NORMAL);
        triangle(soup, a, b, c, at(a, k), at(b, k + 1), at(c, k + 1));
        triangle(soup, a, c, d, at(a, k), at(c, k + 1), at(d, k));
      }
    }
  }
  // the crest slopes back into the hill under snow
  for (let k = 0; k < columns; k += 1) {
    const topA = face(k, strata - 1, 2), topB = face(k + 1, strata - 1, 2);
    // the crest slopes up and back into the hill
    const backA = world(us[k] * 0.96, topA.y + depth * 0.45, -depth), backB = world(us[k + 1] * 0.96, topB.y + depth * 0.45, -depth);
    triangle(soup, topA, topB, backB, snow);
    triangle(soup, topA, backB, backA, snow);
  }
  // the two ends close back into the hill
  for (const [k, sign] of [[0, -1], [columns, 1]] as const) {
    for (let s = 0; s < strata; s += 1) {
      const a = face(k, s, 0), b = face(k, s, 2);
      const backA = world(us[k] * 0.98, a.y, -depth), backB = world(us[k] * 0.98, b.y, -depth);
      const color = tone(s, us[k], a.y - ground[k], FACE_NORMAL).multiplyScalar(0.8);
      if (sign < 0) { triangle(soup, a, b, backB, color); triangle(soup, a, backB, backA, color); }
      else { triangle(soup, a, backA, backB, color); triangle(soup, a, backB, b, color); }
    }
  }
  // the tunnel: a horseshoe lining from the mouth back `length` metres, seen from inside
  if (opening) {
    const lining = linear(opening.lining);
    const profile: Array<[number, number]> = [];
    profile.push([-opening.half, 0], [-opening.half, opening.spring]);
    for (let i = 1; i < 12; i += 1) {
      const a = Math.PI - (i / 12) * Math.PI;
      profile.push([Math.cos(a) * opening.half, opening.spring + Math.sin(a) * opening.half]);
    }
    profile.push([opening.half, opening.spring], [opening.half, 0]);
    const groundMouth = frame.groundAt(opening.u, 0);
    const mouthW = setBack(opening.u, opening.spring, 0, 0.5) + 0.4;
    const rings = 6;
    // the bore swallows the daylight within a few metres (the garage critic panel, 2026-10-14: "the tunnel is lit like
    // outdoors ... exponential falloff along the bore to a near-black end"): the lining's tone falls off smoothly per ring
    const falloff = (ring: number): THREE.Color => lining.clone().multiplyScalar(Math.exp(-ring * 0.62));
    for (let ring = 0; ring < rings; ring += 1) {
      const w0 = mouthW - (ring / rings) * opening.length, w1 = mouthW - ((ring + 1) / rings) * opening.length;
      const near = falloff(ring), far = falloff(ring + 1);
      for (let i = 0; i < profile.length - 1; i += 1) {
        const [u0, y0] = profile[i], [u1, y1] = profile[i + 1];
        const a = world(opening.u + u0, groundMouth + y0, w0), b = world(opening.u + u1, groundMouth + y1, w0);
        const c = world(opening.u + u1, groundMouth + y1, w1), d = world(opening.u + u0, groundMouth + y0, w1);
        // the lining faces the tunnel's axis
        triangle(soup, a, c, b, near, far, near);
        triangle(soup, a, d, c, near, far, far);
      }
    }
  }
  smoothNormals(soup);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(soup.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(soup.normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(soup.colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export interface MoundOptions {
  readonly width: number;
  readonly length: number;
  /** Crown height above the frame's ground at the front. */
  readonly height: number;
  readonly seed: number;
  readonly snow: number;
  readonly earth: number;
}

/**
 * An earth cover over a buried structure (Frosthollow's repair bunker): a barrel-shaped mound from w = 0 (its front,
 * where the structure's facade stands) back `length` metres, its crown `height` up, its flanks and back end rounding
 * down into the ground, lumpy, under snow that leaves the earth showing where the slope is steep. Seen from outside.
 */
export function buildEarthMound(frame: RockFrame, options: MoundOptions): THREE.BufferGeometry {
  const soup: Soup = { positions: [], normals: [], colors: [] };
  const { width, length, height, seed } = options;
  const cos = Math.cos(frame.yaw), sin = Math.sin(frame.yaw);
  const half = width / 2;
  let state = seed >>> 0;
  const lattice = Float32Array.from({ length: 32 * 32 }, () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
  const noise = (x: number, y: number): number => {
    const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy;
    const at = (cx: number, cy: number): number => lattice[(((cy % 32) + 32) % 32) * 32 + (((cx % 32) + 32) % 32)];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy;
  };
  const front = frame.groundAt(0, 0);
  const point = (u: number, w: number): THREE.Vector3 => {
    const across = Math.min(1, Math.abs(u) / half);
    const along = Math.min(1, Math.max(0, -w / length));
    const crown = height * Math.pow(Math.max(0, 1 - across * across), 0.55) * Math.pow(Math.max(0, 1 - Math.pow(along, 3)), 0.6);
    const lump = (noise(u * 0.35 + 3, w * 0.35 + 7) - 0.5) * 0.7 * (1 - across * 0.5);
    const ground = frame.groundAt(u, w);
    const y = Math.max(ground - 0.3, front + crown + lump * (crown > 0.3 ? 1 : 0) - 0.2);
    return new THREE.Vector3(frame.x + cos * u + sin * w, y, frame.z - sin * u + cos * w);
  };
  const snow = new THREE.Color(options.snow), earth = new THREE.Color(options.earth), shade = new THREE.Color(0xc4cfd6);
  const cols = 20, rows = 14;
  const n = new THREE.Vector3();
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const u0 = -half - 0.6 + ((width + 1.2) * i) / cols, u1 = -half - 0.6 + ((width + 1.2) * (i + 1)) / cols;
      const w0 = -((length + 0.8) * j) / rows, w1 = -((length + 0.8) * (j + 1)) / rows;
      // (b - a) runs +u, (c - a) runs +u and back (-w): u x (u - w) points up, so a, b, c faces the sky
      const a = point(u0, w0), b = point(u1, w0), c = point(u1, w1), d = point(u0, w1);
      n.subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
      const steep = 1 - Math.abs(n.y);
      const tone = steep > 0.55 + noise(i * 0.7, j * 0.7) * 0.2 ? earth.clone().lerp(snow, 0.25) : snow.clone().lerp(shade, steep * 0.6);
      triangle(soup, a, b, c, tone);
      triangle(soup, a, c, d, tone);
    }
  }
  smoothNormals(soup);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(soup.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(soup.normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(soup.colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export interface TalusOptions {
  /** The apron's run along the face (u from, to). */
  readonly from: number;
  readonly to: number;
  /** How far it runs out from the face toward the yard, and its height against the face. */
  readonly reach: number;
  readonly height: number;
  readonly seed: number;
  readonly snow: number;
  readonly rock: number;
  /** Stretches of the face left clear (a portal's headwall), u from, to. */
  readonly gaps?: ReadonlyArray<readonly [number, number]>;
  /** Boulders half buried in the apron. */
  readonly boulders?: number;
}

/**
 * The scree at a cliff's foot under snow (Glacier, the re-judge 2026-10-15: "a freestanding hemisphere on flat snow with a
 * hard ground line ... the 'talus' at its foot is a row of grey cuboids"): an apron that starts inside the face, stands
 * `height` against it and falls away to the ground `reach` metres out, lumpy, thinning to nothing at its ends and at the
 * gaps, the scree showing through the snow where it is steep, with flat-faced boulders half buried in it. World space,
 * vertex-coloured, for the pack's baked bucket.
 */
export function buildTalusApron(frame: RockFrame, options: TalusOptions): THREE.BufferGeometry {
  const apron: Soup = { positions: [], normals: [], colors: [] };
  const stones: Soup = { positions: [], normals: [], colors: [] };
  const { from, to, reach, height, seed } = options;
  const gaps = options.gaps ?? [];
  const cos = Math.cos(frame.yaw), sin = Math.sin(frame.yaw);
  const world = (u: number, y: number, w: number): THREE.Vector3 => new THREE.Vector3(frame.x + cos * u + sin * w, y, frame.z - sin * u + cos * w);
  let state = seed >>> 0;
  const rand = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const lattice = Float32Array.from({ length: 32 * 32 }, rand);
  const noise = (x: number, y: number): number => {
    const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy;
    const at = (cx: number, cy: number): number => lattice[(((cy % 32) + 32) % 32) * 32 + (((cx % 32) + 32) % 32)];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy;
  };
  const smooth = (x: number): number => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
  const back = -2.5;
  const taper = (u: number): number => {
    let t = smooth((u - from) / 8) * smooth((to - u) / 8);
    for (const [g0, g1] of gaps) t *= u < g0 ? smooth((g0 - u) / 2.5) : u > g1 ? smooth((u - g1) / 2.5) : 0;
    return t;
  };
  const surface = (u: number, w: number): number => {
    const t = Math.min(1, Math.max(0, (w - back) / (reach - back)));
    const fall = Math.pow(1 - t, 1.7);
    const crown = height * (0.55 + 0.6 * noise(u * 0.1 + 3, 1.3)) * taper(u);
    const lump = (noise(u * 0.45 + 7, w * 0.45 + 2) - 0.5) * 0.6 * crown / Math.max(0.01, height);
    return frame.groundAt(u, w) - 0.2 + (crown + lump) * fall;
  };
  const snow = new THREE.Color(options.snow), rock = new THREE.Color(options.rock), shade = new THREE.Color(0xc4cfd6);
  const cols = Math.ceil(to - from), rows = 8;
  const point = (i: number, j: number): THREE.Vector3 => {
    const u = from + ((to - from) * i) / cols, w = back + ((reach - back) * j) / rows;
    return world(u, surface(u, w), w);
  };
  const n = new THREE.Vector3();
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      // a runs +u to b, d runs +w (toward the yard) from a: (b - a) x (d - a) = u x w points down, so a, d, c faces up
      const a = point(i, j), b = point(i + 1, j), c = point(i + 1, j + 1), d = point(i, j + 1);
      n.subVectors(d, a).cross(new THREE.Vector3().subVectors(b, a)).normalize();
      const steep = 1 - Math.abs(n.y);
      const scree = steep > 0.3 + noise(i * 0.6, j * 0.9) * 0.25;
      const tone = scree ? rock.clone().lerp(snow, 0.3) : snow.clone().lerp(shade, Math.min(1, steep * 1.4));
      triangle(apron, a, d, c, tone);
      triangle(apron, a, c, b, tone);
    }
  }
  smoothNormals(apron);
  // the boulders: jittered icosahedra, flat-faced, a snow cap on their upward faces
  const ico = new THREE.IcosahedronGeometry(1, 0).getAttribute('position');
  for (let k = 0; k < (options.boulders ?? 0); k += 1) {
    const u = from + 2 + rand() * (to - from - 4), w = -0.6 + rand() * reach * 0.6;
    if (taper(u) < 0.4) continue;
    const size = 0.35 + rand() * 0.65, squash = 0.6 + rand() * 0.3, turn = rand() * Math.PI * 2;
    const y = surface(u, w) - size * squash * 0.35;
    const jitter = new Map<string, number>();
    const corner = (index: number): THREE.Vector3 => {
      const px = ico.getX(index), py = ico.getY(index), pz = ico.getZ(index);
      const key = `${px.toFixed(3)},${py.toFixed(3)},${pz.toFixed(3)}`;
      let scale = jitter.get(key);
      if (scale === undefined) { scale = 0.72 + rand() * 0.5; jitter.set(key, scale); }
      const lx = px * size * scale, ly = py * size * scale * squash, lz = pz * size * scale;
      const ru = lx * Math.cos(turn) - lz * Math.sin(turn), rw = lx * Math.sin(turn) + lz * Math.cos(turn);
      return world(u + ru, y + ly, w + rw);
    };
    const stoneTone = rock.clone().multiplyScalar(0.85 + rand() * 0.3);
    for (let f = 0; f < ico.count; f += 3) {
      const a = corner(f), b = corner(f + 1), c = corner(f + 2);
      n.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
      triangle(stones, a, b, c, n.y > 0.72 ? snow.clone().lerp(shade, 0.25) : stoneTone);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([...apron.positions, ...stones.positions], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([...apron.normals, ...stones.normals], 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute([...apron.colors, ...stones.colors], 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Monsoon's wet-tropics planting (the re-judge, 2026-10-15: "no jungle belt, tall grass, banana or bamboo ... a temperate
 * park"): banana plants (a pseudostem and seven paddle leaves rising and arching over) and bamboo clumps (culms leaning
 * out, drooping fronds at their heads), each a world-space point with its kind and size. Leaves are two-sided.
 * Vertex-coloured, for the pack's baked bucket.
 */
export function buildTropicalPlants(
  plants: ReadonlyArray<{ readonly x: number; readonly z: number; readonly y: number; readonly kind: 'banana' | 'bamboo'; readonly size: number }>,
  seed: number,
): THREE.BufferGeometry {
  const soup: Soup = { positions: [], normals: [], colors: [] };
  let state = seed >>> 0;
  const rand = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const twoSided = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ca: THREE.Color, cb: THREE.Color, cc: THREE.Color): void => {
    triangle(soup, a, b, c, ca, cb, cc);
    triangle(soup, a, c, b, ca, cc, cb);
  };
  const prism = (base: THREE.Vector3, top: THREE.Vector3, r0: number, r1: number, color: THREE.Color, sides = 6): void => {
    for (let k = 0; k < sides; k += 1) {
      const a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2;
      const p = (c: THREE.Vector3, r: number, a: number): THREE.Vector3 => new THREE.Vector3(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r);
      triangle(soup, p(base, r0, a0), p(top, r1, a1), p(base, r0, a1), color);
      triangle(soup, p(base, r0, a0), p(top, r1, a0), p(top, r1, a1), color);
    }
  };
  const leafGreen = new THREE.Color(0x3b6a2a), leafDeep = new THREE.Color(0x284d1f), rib = new THREE.Color(0x8a9a4a);
  const stemTone = new THREE.Color(0x5d6b34), culmTone = new THREE.Color(0x8a8f45), culmOld = new THREE.Color(0x6f6a3a);
  for (const plant of plants) {
    const { x, z, y, size } = plant;
    if (plant.kind === 'banana') {
      const h = 2.4 * size;
      const top = new THREE.Vector3(x, y + h, z);
      prism(new THREE.Vector3(x, y - 0.1, z), top, 0.2 * size, 0.13 * size, stemTone);
      for (let k = 0; k < 7; k += 1) {
        const heading = (k / 7) * Math.PI * 2 + rand() * 0.5, L = (2.0 + rand() * 0.8) * size, W = 0.55 * size;
        const dir = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading)), side = new THREE.Vector3(-dir.z, 0, dir.x);
        const rise = 0.9 + rand() * 0.5, droop = 1.3 + rand() * 0.6;
        const mid = (t: number): THREE.Vector3 => top.clone().addScaledVector(dir, L * t).add(new THREE.Vector3(0, (rise * t - droop * t * t) * size, 0));
        const tone = leafGreen.clone().lerp(leafDeep, rand() * 0.6);
        const segments = 4;
        for (let s = 0; s < segments; s += 1) {
          const t0 = s / segments, t1 = (s + 1) / segments;
          const w0 = W * Math.sin(Math.PI * Math.min(0.97, t0 * 0.9 + 0.08)), w1 = W * Math.sin(Math.PI * Math.min(0.97, t1 * 0.9 + 0.08));
          const m0 = mid(t0), m1 = mid(t1);
          const l0 = m0.clone().addScaledVector(side, w0), r0 = m0.clone().addScaledVector(side, -w0);
          const l1 = m1.clone().addScaledVector(side, w1), r1 = m1.clone().addScaledVector(side, -w1);
          twoSided(m0, l0, l1, rib, tone, tone);
          twoSided(m0, l1, m1, rib, tone, rib);
          twoSided(m0, m1, r1, rib, rib, tone);
          twoSided(m0, r1, r0, rib, tone, tone);
        }
      }
    } else {
      const culms = 9 + Math.floor(rand() * 4);
      for (let k = 0; k < culms; k += 1) {
        const heading = rand() * Math.PI * 2, lean = 0.06 + rand() * 0.16, h = (5.5 + rand() * 2.5) * size;
        const off = new THREE.Vector3(Math.cos(heading) * 0.5 * rand(), 0, Math.sin(heading) * 0.5 * rand());
        const base = new THREE.Vector3(x + off.x, y - 0.1, z + off.z);
        const top = base.clone().add(new THREE.Vector3(Math.cos(heading) * h * lean, h, Math.sin(heading) * h * lean));
        prism(base, top, 0.055 * size, 0.035 * size, k % 3 ? culmTone : culmOld, 5);
        for (let f = 0; f < 3; f += 1) {
          const at = base.clone().lerp(top, 0.7 + f * 0.12), fh = heading + (f - 1) * 0.9 + rand() * 0.4;
          const dir = new THREE.Vector3(Math.cos(fh), 0, Math.sin(fh)), side = new THREE.Vector3(-dir.z, 0, dir.x);
          const tip = at.clone().addScaledVector(dir, 1.5 * size).add(new THREE.Vector3(0, -0.7 * size, 0));
          const midP = at.clone().addScaledVector(dir, 0.8 * size).add(new THREE.Vector3(0, -0.05 * size, 0));
          const tone = leafGreen.clone().lerp(leafDeep, 0.3 + rand() * 0.5);
          const w = 0.32 * size;
          twoSided(at, midP.clone().addScaledVector(side, w), midP.clone().addScaledVector(side, -w), tone, tone, tone);
          twoSided(midP.clone().addScaledVector(side, w), tip, midP.clone().addScaledVector(side, -w), tone, leafDeep, tone);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(soup.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(soup.normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(soup.colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
