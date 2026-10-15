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
  /** The tunnel's opening and its lining, if any. */
  readonly opening?: Readonly<{ u: number; half: number; spring: number; length: number; lining: number }>;
}

interface Soup {
  readonly positions: number[];
  readonly normals: number[];
  readonly colors: number[];
}

const linear = (hex: number): THREE.Color => new THREE.Color(hex);

function triangle(soup: Soup, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color): void {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  if (n.lengthSq() < 1e-12) return;
  n.normalize();
  for (const p of [a, b, c]) {
    soup.positions.push(p.x, p.y, p.z);
    soup.normals.push(n.x, n.y, n.z);
    soup.colors.push(color.r, color.g, color.b);
  }
}

/** Build a cliff face (and its tunnel) as one world-space, flat-shaded, vertex-coloured geometry. */
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
  const columns = Math.max(8, Math.round(width / 0.8));
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
    const curl = -depth * 0.8 * Math.pow(Math.abs(u) / half, 2.2) * (0.8 + 0.4 * fbm(y * 0.2, 4.1));
    const batter = -0.2 * y;
    const lean = -0.45 * (1 - t);
    // joint blocks: the stratum breaks into blocks 1.6-3.2 m wide, each standing proud or set back as a whole
    const blockWidth = 1.6 + hash(s, 7) * 1.6;
    const block = Math.floor(u / blockWidth + hash(s, 3) * 3);
    const jointed = (hash(block, s) - 0.5) * 1.1;
    const rough = (fbm(u * 0.22 + s * 1.7, y * 0.22) - 0.5) * 1.8 + (fbm(u * 0.9 + 11, y * 0.9 + s) - 0.5) * 0.45;
    return curl + batter + lean + jointed + rough;
  };
  const inOpening = (u: number, y: number, margin = 0): boolean => {
    if (!opening) return false;
    const du = Math.abs(u - opening.u);
    if (y < opening.spring) return du < opening.half + margin;
    return Math.hypot(du, y - opening.spring) < opening.half + margin;
  };
  const strataTones = options.strata.map(linear);
  const snow = linear(options.snow);
  const tone = (s: number, u: number, y: number, n: THREE.Vector3): THREE.Color => {
    if (n.y > 0.55) return snow.clone().lerp(linear(0xc9d3da), fbm(u * 0.8, y * 0.8) * 0.5);
    const base = strataTones[s % strataTones.length].clone();
    base.multiplyScalar(0.86 + fbm(u * 0.6 + 9, y * 0.9) * 0.28);
    if (y - frame.groundAt(u, 0) < 1.2) base.multiplyScalar(0.8); // the wet, dark foot
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
  const n = new THREE.Vector3();
  for (let s = 0; s < strata; s += 1) {
    for (let k = 0; k < columns; k += 1) {
      for (const r of [0, 1] as const) {
        const a = face(k, s, r), b = face(k + 1, s, r), c = face(k + 1, s, (r + 1) as 1 | 2), d = face(k, s, (r + 1) as 1 | 2);
        if (Math.abs(c.y - b.y) < 1e-3 && Math.abs(d.y - a.y) < 1e-3) continue; // above the crest
        const mu = (us[k] + us[k + 1]) / 2, my = (a.y + c.y) / 2 - (ground[k] + ground[k + 1]) / 2;
        if (inOpening(mu, my, -0.15)) continue;
        n.subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
        const color = tone(s, mu, my, n);
        // seen from the yard (+w): a -> b runs +u, so counter-clockwise is a, b, c and a, c, d
        triangle(soup, a, b, c, color);
        triangle(soup, a, c, d, color);
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
    const backA = world(us[k] * 0.92, topA.y + 1.4, -depth), backB = world(us[k + 1] * 0.92, topB.y + 1.4, -depth);
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
    for (let ring = 0; ring < rings; ring += 1) {
      const w0 = mouthW - (ring / rings) * opening.length, w1 = mouthW - ((ring + 1) / rings) * opening.length;
      const shade = lining.clone().multiplyScalar(1 - ring * 0.1);
      for (let i = 0; i < profile.length - 1; i += 1) {
        const [u0, y0] = profile[i], [u1, y1] = profile[i + 1];
        const a = world(opening.u + u0, groundMouth + y0, w0), b = world(opening.u + u1, groundMouth + y1, w0);
        const c = world(opening.u + u1, groundMouth + y1, w1), d = world(opening.u + u0, groundMouth + y0, w1);
        // the lining faces the tunnel's axis
        triangle(soup, a, c, b, shade);
        triangle(soup, a, d, c, shade);
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
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(soup.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(soup.normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(soup.colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
