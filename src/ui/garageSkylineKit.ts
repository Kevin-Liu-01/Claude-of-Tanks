import * as THREE from 'three';

/**
 * K10, the outside environment kit (garage r9): landmark builders that draw into a Garage's backdrop (the pack's one unlit
 * vertex-colour horizon draw: no draw, texture or program of their own). Every face is flat-shaded by the backdrop's one
 * low sun and hazed by its distance, so a mesa, a furnace or a lighthouse recedes like the bands round it.
 *
 * A Garage's skyline (its kit module) is a list of named landmarks at their map bearings plus the arcs between them:
 * `bearing` is the angle in the pack's frame (radians from +X toward +Z, the backdrop's own convention), computed from
 * the landmark's map position relative to the Garage's terrain-patch anchor (the patch is unrotated: map x/z = pack
 * x/z). The receipts read the landmark table, not the geometry.
 */

export interface GarageSkylineLandmark {
  readonly name: string;
  /** Bearing in the pack's frame (radians, from +X toward +Z). */
  readonly bearing: number;
  /** Distance from the turntable (m). */
  readonly radius: number;
  /** The landmark's source on the map (its map x/z and what stands there), for the receipt and the reader. */
  readonly source: string;
}

export interface GarageSkyline {
  readonly landmarks: readonly GarageSkylineLandmark[];
  /** Draw the built skyline (landmarks and the masses between them). */
  build(emitter: GarageSkylineEmitter): void;
  /** Optional: reshape a land band's crest at `angle` (sea arcs drop the land under the water). */
  crest?(angle: number, layerIndex: number, crest: number): number;
  /** Optional: colour a band's ground at `angle` (strands, bocage hedges); return false to keep the biome colour. */
  ground?(out: THREE.Color, angle: number, t: number, y: number, slope: number, layerIndex: number, noise: number): boolean;
  /** Optional: the coastal sea's arc [from, to] (radians, from < to, may exceed 2PI): outside it the sea ring is not drawn. */
  readonly seaArc?: readonly [number, number];
  /** Land band columns (near to far): built-horizon packs need fewer, their land is low. */
  readonly bandSegments?: readonly [number, number, number, number, number];
}

type Local = (x: number, y: number, z: number) => THREE.Vector3;

/** Working (linear) colours from sRGB hex, converted once per tone (a skyline paints a few thousand vertices). */
const LINEAR = new Map<number, THREE.Color>();
function linear(hex: number): THREE.Color {
  let color = LINEAR.get(hex);
  if (!color) { color = new THREE.Color(hex); LINEAR.set(hex, color); }
  return color;
}

/** Smooth 0..1 weight of `angle` inside the arc [from, to] with `edge` radians of fade each end (angles wrap). */
export function arcWeight(angle: number, from: number, to: number, edge: number): number {
  const TAU = Math.PI * 2;
  let a = angle;
  while (a < from - edge) a += TAU;
  while (a > to + edge) a -= TAU;
  if (a < from - edge || a > to + edge) return 0;
  return THREE.MathUtils.smoothstep(a, from - edge, from) * (1 - THREE.MathUtils.smoothstep(a, to, to + edge));
}

/** A bearing from a map point relative to an anchor (both map x/z), in the pack's frame. */
export function mapBearing(anchor: readonly [number, number], point: readonly [number, number]): number {
  return Math.atan2(point[1] - anchor[1], point[0] - anchor[0]);
}

/**
 * The emitter a skyline draws through: flat-shaded quads and triangles in tones lit by their normals, hazed by distance,
 * on frames turned to face the yard. It tracks the tops of the masses and of the slender accents (the receipts bound
 * both).
 */
export class GarageSkylineEmitter {
  massTop = 0;
  accentTop = 0;
  /** While set, tops count as accents (stacks, spires, the lighthouse) apart from the masses. */
  accent = false;
  readonly foot = -3.5;
  private readonly colour = new THREE.Color();
  private readonly n = new THREE.Vector3();
  private readonly e1 = new THREE.Vector3();
  private readonly e2 = new THREE.Vector3();
  private state: number;
  private readonly positions: number[];
  private readonly colors: number[];
  private readonly indices: number[];
  private readonly horizon: THREE.Color;
  private readonly sun: THREE.Vector3;

  constructor(positions: number[], colors: number[], indices: number[], horizon: THREE.Color, sun: THREE.Vector3, seed: number) {
    this.positions = positions;
    this.colors = colors;
    this.indices = indices;
    this.horizon = horizon;
    this.sun = sun;
    this.state = seed >>> 0;
  }

  /** A deterministic 0..1 stream (mulberry32). */
  random(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** The haze a face takes at `radius` metres (the built horizon's own law, a little deeper for far landmarks). */
  hazeAt(radius: number): number {
    // (lighter than the bands' own law: the landmarks are what the place is known by, and full band haze washed them
    // out to the "pale translucent boxes" the brief names)
    return THREE.MathUtils.clamp(0.06 + (radius - 50) / 60 * 0.16, 0.05, 0.3);
  }

  /** A frame at (bearing, radius) turned to face the yard: x across (right seen from the yard), z away, y absolute. */
  frame(bearing: number, radius: number): Local {
    const out = new THREE.Vector3(Math.cos(bearing), 0, Math.sin(bearing));
    const across = new THREE.Vector3(-Math.sin(bearing), 0, Math.cos(bearing));
    const origin = out.clone().multiplyScalar(radius);
    return (x, y, z) => origin.clone().addScaledVector(across, x).addScaledVector(out, z).setY(y);
  }

  private track(top: number): void {
    if (this.accent) this.accentTop = Math.max(this.accentTop, top);
    else this.massTop = Math.max(this.massTop, top);
  }

  private lit(tone: number, haze: number, normal: THREE.Vector3, dimFoot: number, y: number): THREE.Color {
    const light = 0.5 + 0.7 * Math.max(0, normal.dot(this.sun)) + 0.12 * Math.max(0, normal.y);
    return this.colour.copy(linear(tone)).multiplyScalar(light * (y < dimFoot ? 0.74 : 1)).lerp(this.horizon, haze);
  }

  /** One flat quad (corners counter-clockwise seen from its front). */
  quad(p: readonly THREE.Vector3[], tone: number, haze: number): void {
    this.n.subVectors(p[1], p[0]).cross(this.e1.subVectors(p[3], p[0])).normalize();
    const base = this.positions.length / 3;
    for (const v of p) {
      const c = this.lit(tone, haze, this.n, 1, v.y);
      this.positions.push(v.x, v.y, v.z); this.colors.push(c.r, c.g, c.b);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    for (const v of p) this.track(v.y);
  }

  tri(p: readonly THREE.Vector3[], tone: number, haze: number): void {
    this.n.subVectors(p[1], p[0]).cross(this.e2.subVectors(p[2], p[0])).normalize();
    const base = this.positions.length / 3;
    for (const v of p) {
      const c = this.lit(tone, haze, this.n, -Infinity, v.y);
      this.positions.push(v.x, v.y, v.z); this.colors.push(c.r, c.g, c.b);
    }
    this.indices.push(base, base + 1, base + 2);
    for (const v of p) this.track(v.y);
  }

  /** A box from `foot` (default the backdrop's buried foot) to `top`: front toward the yard (-z), walls, a flat roof. */
  box(at: Local, x0: number, x1: number, z0: number, z1: number, top: number, wall: number, roof: number, haze: number,
    options: { flat?: boolean; foot?: number; back?: boolean } = {}): void {
    const f = options.foot ?? this.foot;
    this.quad([at(x0, f, z0), at(x1, f, z0), at(x1, top, z0), at(x0, top, z0)], wall, haze);
    this.quad([at(x1, f, z0), at(x1, f, z1), at(x1, top, z1), at(x1, top, z0)], wall, haze);
    this.quad([at(x0, f, z1), at(x0, f, z0), at(x0, top, z0), at(x0, top, z1)], wall, haze);
    if (options.back) this.quad([at(x1, f, z1), at(x0, f, z1), at(x0, top, z1), at(x1, top, z1)], wall, haze);
    if (options.flat !== false) this.quad([at(x0, top, z0), at(x1, top, z0), at(x1, top, z1), at(x0, top, z1)], roof, haze);
  }

  /** A pitched roof over a box, its ridge across the frame (gable ends left and right). */
  gable(at: Local, x0: number, x1: number, z0: number, z1: number, eave: number, ridge: number, wall: number, roof: number,
    haze: number): void {
    const zm = (z0 + z1) / 2;
    this.quad([at(x0, eave, z0), at(x1, eave, z0), at(x1, ridge, zm), at(x0, ridge, zm)], roof, haze);
    this.quad([at(x1, eave, z1), at(x0, eave, z1), at(x0, ridge, zm), at(x1, ridge, zm)], roof, haze);
    this.tri([at(x1, eave, z0), at(x1, eave, z1), at(x1, ridge, zm)], wall, haze);
    this.tri([at(x0, eave, z1), at(x0, eave, z0), at(x0, ridge, zm)], wall, haze);
  }

  /** A pitched roof whose ridge runs toward the yard (a gable end faces the yard). */
  gableEnd(at: Local, x0: number, x1: number, z0: number, z1: number, eave: number, ridge: number, wall: number, roof: number,
    haze: number): void {
    const xm = (x0 + x1) / 2;
    this.quad([at(x1, eave, z0), at(x1, eave, z1), at(xm, ridge, z1), at(xm, ridge, z0)], roof, haze);
    this.quad([at(x0, eave, z1), at(x0, eave, z0), at(xm, ridge, z0), at(xm, ridge, z1)], roof, haze);
    this.tri([at(x0, eave, z0), at(x1, eave, z0), at(xm, ridge, z0)], wall, haze);
  }

  /** A flat panel on a front face at z0 (a door, a window band, louvres): 6 cm proud. */
  panel(at: Local, x0: number, x1: number, z0: number, y0: number, y1: number, tone: number, haze: number): void {
    this.quad([at(x0, y0, z0 - 0.06), at(x1, y0, z0 - 0.06), at(x1, y1, z0 - 0.06), at(x0, y1, z0 - 0.06)], tone, haze);
  }

  /** Window rows on a front face (dark glass, a few lit). */
  windows(at: Local, x0: number, x1: number, z0: number, y0: number, top: number, haze: number, pitch = 2.6, storey = 3,
    glass = 0x2c3339, size: readonly [number, number] = [1.2, 1.4]): void {
    for (let floor = y0; floor + size[1] < top - 0.4; floor += storey) {
      for (let x = x0 + 0.8; x + size[0] < x1 - 0.5; x += pitch) {
        const litWindow = this.random() < 0.1;
        this.panel(at, x, x + size[0], z0, floor, floor + size[1], litWindow ? 0xd9c48f : glass, haze * (litWindow ? 0.6 : 1));
      }
    }
  }

  /** A round tank, stack or tower: `sides` faces from `foot` to `top` with a capped (or coned) top. */
  prism(at: Local, x: number, z: number, radius: number, top: number, tone: number, cap: number, haze: number, sides = 10,
    foot = this.foot, options: { rise?: number; topRadius?: number; open?: boolean } = {}): void {
    const rise = options.rise ?? Math.min(radius * 0.25, 1.2);
    const r1 = options.topRadius ?? radius;
    for (let i = 0; i < sides; i += 1) {
      const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
      this.quad([at(x + Math.cos(a1) * radius, foot, z + Math.sin(a1) * radius), at(x + Math.cos(a0) * radius, foot, z + Math.sin(a0) * radius),
        at(x + Math.cos(a0) * r1, top, z + Math.sin(a0) * r1), at(x + Math.cos(a1) * r1, top, z + Math.sin(a1) * r1)], tone, haze);
      if (!options.open) this.tri([at(x, top + rise, z), at(x + Math.cos(a1) * r1, top, z + Math.sin(a1) * r1), at(x + Math.cos(a0) * r1, top, z + Math.sin(a0) * r1)], cap, haze);
    }
  }

  /** A lathe: a profile of [radius, height] rings turned about (x, z), each band its own tone (or one tone). */
  lathe(at: Local, x: number, z: number, profile: ReadonlyArray<readonly [number, number]>, tones: number | readonly number[], haze: number,
    sides = 10): void {
    for (let k = 0; k < profile.length - 1; k += 1) {
      const [ra, ya] = profile[k], [rb, yb] = profile[k + 1];
      const tone = typeof tones === 'number' ? tones : tones[Math.min(k, tones.length - 1)];
      for (let i = 0; i < sides; i += 1) {
        const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
        const P = (r: number, y: number, a: number) => at(x + Math.cos(a) * r, y, z + Math.sin(a) * r);
        if (ra < 1e-4) this.tri([P(rb, yb, a1), P(rb, yb, a0), P(0, ya, 0)], tone, haze);
        else if (rb < 1e-4) this.tri([P(ra, ya, a1), P(ra, ya, a0), P(0, yb, 0)].reverse(), tone, haze);
        else this.quad([P(ra, ya, a1), P(ra, ya, a0), P(rb, yb, a0), P(rb, yb, a1)], tone, haze);
      }
    }
  }

  /** A slender member from a to b (frame coordinates) with a square section `w` (a truss chord, a pipe, a mast). */
  strut(at: Local, a: readonly [number, number, number], b: readonly [number, number, number], w: number, tone: number, haze: number): void {
    const A = at(a[0], a[1], a[2]), B = at(b[0], b[1], b[2]);
    const axis = B.clone().sub(A);
    const len = axis.length();
    if (len < 1e-4) return;
    axis.divideScalar(len);
    const up = Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(axis, up).normalize().multiplyScalar(w / 2);
    const v = new THREE.Vector3().crossVectors(axis, u).normalize().multiplyScalar(w / 2);
    const corner = (p: THREE.Vector3, su: number, sv: number) => p.clone().addScaledVector(u, su).addScaledVector(v, sv);
    const ring: Array<[number, number]> = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (let i = 0; i < 4; i += 1) {
      const [su0, sv0] = ring[i], [su1, sv1] = ring[(i + 1) % 4];
      this.quad([corner(A, su0, sv0), corner(A, su1, sv1), corner(B, su1, sv1), corner(B, su0, sv0)], tone, haze);
    }
  }

  /** A ground mound (spoil tip, slag bank, headland, islet): a lathe of `rings` from a wide foot to its top, rilled by noise. */
  mound(at: Local, x: number, z: number, radius: number, height: number, flatTop: number, tones: readonly number[], haze: number,
    sides = 14, rill = 0.06, squash = 1): void {
    const rings = tones.length;
    const profile: Array<[number, number]> = [];
    for (let k = 0; k <= rings; k += 1) {
      const t = k / rings;
      const r = radius * (1 - t) + flatTop * t;
      profile.push([r, this.foot + (height - this.foot) * (k === 0 ? 0 : Math.pow(t, 0.8))]);
    }
    for (let k = 0; k < rings; k += 1) {
      const [ra, ya] = profile[k], [rb, yb] = profile[k + 1];
      for (let i = 0; i < sides; i += 1) {
        const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
        const wobble = (a: number, r: number) => r * (1 + rill * Math.sin(a * 7 + x) + rill * 0.6 * Math.sin(a * 13 + z));
        const P = (r: number, y: number, a: number) => at(x + Math.cos(a) * wobble(a, r), y, z + Math.sin(a) * wobble(a, r) * squash);
        if (rb < 0.05) this.tri([P(ra, ya, a1), P(ra, ya, a0), at(x, yb, z)], tones[k], haze);
        else this.quad([P(ra, ya, a1), P(ra, ya, a0), P(rb, yb, a0), P(rb, yb, a1)], tones[k], haze);
      }
    }
    // the flat top where the tipping track ran
    if (flatTop >= 0.05) {
      const [rt, yt] = profile[rings];
      for (let i = 0; i < sides; i += 1) {
        const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
        this.tri([at(x, yt, z), at(x + Math.cos(a1) * rt, yt, z + Math.sin(a1) * rt * squash), at(x + Math.cos(a0) * rt, yt, z + Math.sin(a0) * rt * squash)], tones[rings - 1], haze);
      }
    }
  }

  /** A tree crown silhouette (a squat cone over a short trunk), for birch scrub, pines and poplars on the skyline. */
  tree(at: Local, x: number, z: number, height: number, width: number, tone: number, haze: number, foot = 0, sides = 5): void {
    this.prism(at, x, z, width * 0.08, foot + height * 0.35, 0x3a322a, 0x3a322a, haze, 3, foot, { rise: 0 });
    this.lathe(at, x, z, [[width * 0.5, foot + height * 0.28], [width * 0.42, foot + height * 0.7], [0, foot + height]], tone, haze, sides);
  }
}
