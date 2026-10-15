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
  // the face's set-back at (u, y) within stratum s at fraction t up it
  const setBack = (u: number, y: number, s: number, t: number): number => {
    const curl = -depth * 0.45 * Math.pow(Math.abs(u) / half, 3) * (0.8 + 0.4 * fbm(y * 0.2, 4.1));
    const batter = -0.2 * y;
    const lean = -0.45 * (1 - t);
    // joint blocks: the stratum breaks into blocks 1.6-3.2 m wide, each standing proud or set back as a whole
    const blockWidth = 1.6 + hash(s, 7) * 1.6;
    const block = Math.floor(u / blockWidth + hash(s, 3) * 3);
    const jointed = (hash(block, s) - 0.5) * 0.2; // (0.45 stepped the face into blocks: v3 stills)
    const rough = (fbm(u * 0.12 + 3.1, y * 0.15) - 0.5) * 2.6 + (fbm(u * 0.3 + s * 1.7, y * 0.3) - 0.5) * 0.9
      + (fbm(u * 0.9 + 11, y * 0.9 + s) - 0.5) * 0.3;
    return curl + batter + lean + jointed + rough;
  };
  const inOpening = (u: number, y: number, margin = 0): boolean => {
    if (!opening) return false;
    const du = Math.abs(u - opening.u);
    if (y < opening.spring) return du < opening.half + margin;
    return Math.hypot(du, y - opening.spring) < opening.half + margin;
  };
  // the strata pulled halfway to their mean so the bands read as one rock, coloured per vertex from smooth noise so
  // neighbouring facets blend (a colour per facet read as pixels in the GPU stills)
  const mean = options.strata.map(linear).reduce((acc, c) => acc.add(c), new THREE.Color(0, 0, 0)).multiplyScalar(1 / options.strata.length);
  const strataTones = options.strata.map((hex) => linear(hex).lerp(mean, 0.5));
  const snow = linear(options.snow);
  const snowShade = linear(0xc9d3da);
  const tone = (s: number, u: number, y: number, n: THREE.Vector3): THREE.Color => {
    if (n.y > 0.55) return snow.clone().lerp(snowShade, fbm(u * 0.8, y * 0.8) * 0.5);
    const base = strataTones[s % strataTones.length].clone();
    base.multiplyScalar(0.84 + fbm(u * 0.18 + 9, y * 0.22) * 0.32);
    // dark streaks where water runs down the face, and the wet foot
    base.multiplyScalar(1 - Math.pow(fbm(u * 0.7 + 21, y * 0.05), 3) * 0.35);
    if (y < 1.2) base.multiplyScalar(0.8 + y / 6);
    return base;
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
        triangle(soup, a, b, c, snow);
        triangle(soup, a, c, d, snow);
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
      const color = strataTones[s % strataTones.length].clone().multiplyScalar(0.8);
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
  /** Metres of the cover's front edge (its eaves over the facade) left as exposed earth and turf, wind-scoured. */
  readonly frontEarth?: number;
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
      const scoured = (options.frontEarth ?? 0) > 0
        && (j * (length + 0.8)) / rows < (options.frontEarth ?? 0) * (0.7 + noise(i * 0.9 + 5, 3.1) * 0.6);
      const tone = scoured ? earth.clone().lerp(new THREE.Color(0x4a5236), 0.35 + noise(i * 1.3, j * 1.3) * 0.3)
        : steep > 0.55 + noise(i * 0.7, j * 0.7) * 0.2 ? earth.clone().lerp(snow, 0.25) : snow.clone().lerp(shade, steep * 0.6);
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
 * Conifers under snow (Frosthollow, the re-judge 2026-10-15: the bunker's snow mound was "white on a near-white sky ...
 * a darker treeline or rock band behind it", "conifers with snow load in the hero background"): each tree a trunk and
 * three stacked eight-sided cones, dark spruce green with snow lying on the upper faces of each tier. Points are
 * (u, w, height) in the frame. World space, vertex-coloured, for the pack's baked bucket.
 */
export function buildConifers(frame: RockFrame, trees: ReadonlyArray<readonly [number, number, number]>, seed: number): THREE.BufferGeometry {
  const soup: Soup = { positions: [], normals: [], colors: [] };
  const cos = Math.cos(frame.yaw), sin = Math.sin(frame.yaw);
  let state = seed >>> 0;
  const rand = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const needles = new THREE.Color(0x1f2e24), needlesDeep = new THREE.Color(0x17221b), bark = new THREE.Color(0x3a2c22);
  const snow = new THREE.Color(0xe4eaee), snowShade = new THREE.Color(0xb9c6cf);
  const sides = 8;
  for (const [u, w, height] of trees) {
    const x = frame.x + cos * u + sin * w, z = frame.z - sin * u + cos * w, ground = frame.groundAt(u, w) - 0.3;
    const turn = rand() * Math.PI;
    const green = needles.clone().lerp(needlesDeep, rand());
    const ring = (y: number, r: number, k: number): THREE.Vector3 => {
      const a = turn + (k / sides) * Math.PI * 2;
      return new THREE.Vector3(x + Math.cos(a) * r, y, z + Math.sin(a) * r);
    };
    // the trunk below the lowest tier
    for (let k = 0; k < sides; k += 2) {
      const a0 = ring(ground, 0.22, k), a1 = ring(ground, 0.22, k + 2), b0 = ring(ground + height * 0.22, 0.16, k), b1 = ring(ground + height * 0.22, 0.16, k + 2);
      triangle(soup, a0, b1, a1, bark); triangle(soup, a0, b0, b1, bark);
    }
    // three tiers, each a cone from a skirt to a tip above the next one's skirt
    const tiers: Array<[number, number, number]> = [[0.16, 0.62, 0.3], [0.42, 0.84, 0.23], [0.64, 1.0, 0.15]];
    for (const [from, to, radius] of tiers) {
      const y0 = ground + height * from, y1 = ground + height * to, r = height * radius * (0.85 + rand() * 0.3);
      const tip = new THREE.Vector3(x, y1, z);
      for (let k = 0; k < sides; k += 1) {
        const a = ring(y0 + (k % 2) * 0.12, r, k), b = ring(y0 + ((k + 1) % 2) * 0.12, r, k + 1);
        // the snow lies on the cone's upper slopes: a white band from the skirt up, its shaded side greyer
        const lit = Math.cos(turn + ((k + 0.5) / sides) * Math.PI * 2 - 0.6) > -0.2;
        const mid = a.clone().lerp(tip, 0.45), midB = b.clone().lerp(tip, 0.45);
        const cap = lit ? snow : snowShade;
        triangle(soup, a, mid, b, green, cap, green);
        triangle(soup, b, mid, midB, green, cap, cap);
        triangle(soup, mid, tip, midB, cap, green, cap);
        triangle(soup, a, b, new THREE.Vector3(x, y0 + 0.2, z), needlesDeep); // the skirt's underside
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
