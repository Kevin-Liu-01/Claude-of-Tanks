import * as THREE from 'three';

/**
 * The garage r9 shared kit's geometry core (2026-10-17; the owner: "really upgrade the garages by taking all the props
 * and stuff around and improving them a lot"). Every kit piece (cranes, walls, signs, benches, stands, clutter, the
 * platform collar, display frames) is written through one `KitBuilder`, which emits plain non-indexed triangles with
 * flat or banded normals and a baked vertex colour, so each piece lands in a pack's existing vertex-colour bucket and
 * costs no draw and no shader program of its own.
 *
 * The builder does the shading work a texture would otherwise do:
 * - bevels: `box` chamfers every edge (15-25 mm by default) so silhouettes catch a highlight instead of a CAD edge;
 * - vertex AO: bases and the undersides of overhangs darken (0.15-0.35), each primitive darkens toward its own foot;
 * - wear: chamfers chip toward the skin's primer or bare metal, dirt climbs from the ground, streaks run down faces;
 * - the region skin's weathering: snow caps, sand and red dust on every up-facing face, salt bloom, coal soot, mud
 *   splash, heat tint (one row per garage, so the same drum or crane reads native in each place).
 *
 * Builders are pure and deterministic: they draw random numbers only from a mulberry32 stream they are handed, use
 * three's maths types only, and run in Node (the receipts build every piece headlessly).
 *
 * Two further outputs ride along for the display set: `face()` writes quads mapped into a named rect of the shared
 * display atlas (a pack's one DISPLAY-LIT draw), `decal()` writes ground and wall quads for the DECAL draw.
 */

type KitWeathering = 'clean' | 'sand' | 'snow' | 'salt' | 'coal' | 'mud' | 'reddust' | 'heat';

/** One garage's materials for every kit piece (design 0.4, the region skin). Colours are sRGB hex. */
export interface GarageKitSkin {
  readonly id: string;
  /** Machines, cabinets, trailers and vehicles. */
  readonly paint: number;
  /** Safety yellow or orange on guards, stops, hooks and edges. */
  readonly accent: number;
  /** Structural steel: crane girders, columns, frames. */
  readonly steel: number;
  /** Primer showing through chipped paint. */
  readonly primer: number;
  readonly wood: number;
  readonly rubber: number;
  readonly concrete: number;
  /** Tarps, canvas and webbing. */
  readonly canvas: number;
  /** The ground's own colour, climbing the feet of everything as dirt. */
  readonly ground: number;
  readonly weathering: KitWeathering;
  /** 0..1, how worn the kit is. */
  readonly wear: number;
}

export type KitColor = number | THREE.Color;
export type KitVec = readonly [number, number, number];

interface KitBoxOptions {
  /** Chamfer size in metres (0 for a plain box). Defaults to the builder's bevel. */
  readonly bevel?: number;
  /** Skip the bottom face (a piece standing on the ground never shows it). */
  readonly noBottom?: boolean;
  /** Skip the top face. */
  readonly noTop?: boolean;
  /** Extra local wear on top of the skin's (0..1). */
  readonly wear?: number;
}

interface KitLatheOptions {
  /** Axis the profile turns about (default 'y'). */
  readonly axis?: 'x' | 'y' | 'z';
  /** Start angle and sweep (radians); a full turn by default. */
  readonly start?: number;
  readonly sweep?: number;
  /** Smooth normals round the turn (default true); false gives a faceted drum. */
  readonly smooth?: boolean;
}

export interface KitBuildResult {
  /** Vertex-coloured solids for a pack's baked bucket (position, normal, color, uv zero). */
  readonly solid: THREE.BufferGeometry;
  /** Atlas-mapped quads for the DISPLAY-LIT draw, or null when the piece shows no display. */
  readonly display: THREE.BufferGeometry | null;
  /** Atlas-mapped decal quads for the DECAL draw, or null. */
  readonly decal: THREE.BufferGeometry | null;
  /** Textured building surfaces by pack bucket. */
  readonly surfaces: ReadonlyMap<string, THREE.BufferGeometry>;
  /** Solid plus surface triangles (the pack's buckets). */
  readonly triangles: number;
  readonly solidTriangles: number;
  readonly displayTriangles: number;
  readonly decalTriangles: number;
}

/** A named rect of the display atlas in normalised UV space (u0, v0 bottom-left; u1, v1 top-right). */
export interface KitAtlasRect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

/** The deterministic stream every kit builder draws from. */
export function kitRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const SNOW = new THREE.Color(0xeef3f6);
const SAND = new THREE.Color(0xcdb07c);
const RED_DUST = new THREE.Color(0xb0643c);
const SALT = new THREE.Color(0xdfe2dc);
const SOOT = new THREE.Color(0x1e1d1c);
const MUD = new THREE.Color(0x5a4630);
const HEAT = new THREE.Color(0x4a5a8a);
const BARE = new THREE.Color(0x8d9296);

interface PrimitiveFrame {
  /** Primitive-local height span used for the per-primitive grime gradient. */
  readonly baseY: number;
  readonly topY: number;
  readonly wear: number;
}

/**
 * Accumulates kit geometry under a transform stack. Coordinates are metres in the piece's own frame: +Y up, the piece
 * standing on y = 0 (its ground), +Z its front. A pack places the finished geometry with one matrix.
 */
export class KitBuilder {
  readonly rng: () => number;
  readonly skin: GarageKitSkin;
  bevel = 0.02;
  /** Height over which the ground AO fades out (metres in the piece frame). */
  aoHeight = 0.6;
  aoStrength = 0.38;

  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  /** Per vertex: [primitive-local height 0..1, chip flag 0/1, primitive wear]. */
  private readonly shading: number[] = [];
  private readonly displayPositions: number[] = [];
  private readonly displayNormals: number[] = [];
  private readonly displayUvs: number[] = [];
  private readonly decalPositions: number[] = [];
  private readonly decalNormals: number[] = [];
  private readonly decalUvs: number[] = [];
  /** Textured building surfaces by pack bucket ('stone' brick, 'plaster' render, 'wood' planks, 'route' setts, 'roof'). */
  private readonly surfaceData = new Map<string, { positions: number[]; normals: number[]; uvs: number[] }>();
  private readonly stack: THREE.Matrix4[] = [];
  private matrix = new THREE.Matrix4();
  private readonly normalMatrix = new THREE.Matrix3();
  private normalDirty = true;
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpN = new THREE.Vector3();
  private readonly tmpColor = new THREE.Color();
  private frame: PrimitiveFrame = { baseY: 0, topY: 1, wear: 0 };

  constructor(rng: () => number, skin: GarageKitSkin) {
    this.rng = rng;
    this.skin = skin;
  }

  // ---------------------------------------------------------------- transforms

  push(): this { this.stack.push(this.matrix.clone()); return this; }
  pop(): this {
    const top = this.stack.pop();
    if (top) { this.matrix = top; this.normalDirty = true; }
    return this;
  }
  translate(x: number, y: number, z: number): this {
    this.matrix.multiply(new THREE.Matrix4().makeTranslation(x, y, z));
    this.normalDirty = true;
    return this;
  }
  rotateX(angle: number): this { this.matrix.multiply(new THREE.Matrix4().makeRotationX(angle)); this.normalDirty = true; return this; }
  rotateY(angle: number): this { this.matrix.multiply(new THREE.Matrix4().makeRotationY(angle)); this.normalDirty = true; return this; }
  rotateZ(angle: number): this { this.matrix.multiply(new THREE.Matrix4().makeRotationZ(angle)); this.normalDirty = true; return this; }
  scale(x: number, y = x, z = x): this { this.matrix.multiply(new THREE.Matrix4().makeScale(x, y, z)); this.normalDirty = true; return this; }
  /** Run `body` in a pushed frame translated to (x, y, z) and turned by `yaw`. */
  at(x: number, y: number, z: number, yaw: number, body: () => void): this {
    this.push().translate(x, y, z);
    if (yaw) this.rotateY(yaw);
    body();
    return this.pop();
  }

  /** The current frame's matrix (a copy). */
  currentMatrix(): THREE.Matrix4 { return this.matrix.clone(); }

  // ---------------------------------------------------------------- colours

  color(value: KitColor): THREE.Color {
    return value instanceof THREE.Color ? value : new THREE.Color(value);
  }
  /** A skin colour varied by a small deterministic jitter (no two drums quite alike). */
  jitter(value: KitColor, amount = 0.04): THREE.Color {
    const color = this.color(value).clone();
    const offset = (this.rng() - 0.5) * 2 * amount;
    return color.offsetHSL(0, 0, offset);
  }

  // ---------------------------------------------------------------- emitters

  private updateNormalMatrix(): void {
    if (!this.normalDirty) return;
    this.normalMatrix.getNormalMatrix(this.matrix);
    this.normalDirty = false;
  }

  /**
   * One flat triangle in the current frame. `outward` (local) fixes the winding: the face turns to agree with it.
   * `chip` marks a bevel face for edge wear.
   */
  private tri(a: KitVec, b: KitVec, c: KitVec, color: THREE.Color, outward: KitVec | null, chip = 0, normals?: readonly [KitVec, KitVec, KitVec]): void {
    this.updateNormalMatrix();
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    let fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
    const lengthSq = fx * fx + fy * fy + fz * fz;
    if (lengthSq < 1e-14) return;
    const flip = outward !== null && fx * outward[0] + fy * outward[1] + fz * outward[2] < 0;
    const inv = (flip ? -1 : 1) / Math.sqrt(lengthSq);
    fx *= inv; fy *= inv; fz *= inv;
    const { baseY, topY, wear } = this.frame;
    const span = Math.max(1e-4, topY - baseY);
    const p = this.tmpA, n = this.tmpN;
    const emit = (point: KitVec, index: number): void => {
      const local = (point[1] - baseY) / span;
      p.set(point[0], point[1], point[2]).applyMatrix4(this.matrix);
      this.positions.push(p.x, p.y, p.z);
      if (normals) n.set(normals[index][0], normals[index][1], normals[index][2]);
      else n.set(fx, fy, fz);
      n.applyMatrix3(this.normalMatrix).normalize();
      this.normals.push(n.x, n.y, n.z);
      this.colors.push(color.r, color.g, color.b);
      this.shading.push(local < 0 ? 0 : local > 1 ? 1 : local, chip, wear);
    };
    emit(a, 0);
    if (flip) { emit(c, 2); emit(b, 1); } else { emit(b, 1); emit(c, 2); }
  }

  private quad(a: KitVec, b: KitVec, c: KitVec, d: KitVec, color: THREE.Color, outward: KitVec | null, chip = 0): void {
    this.tri(a, b, c, color, outward, chip);
    this.tri(a, c, d, color, outward, chip);
  }

  private withFrame<T>(baseY: number, topY: number, wear: number, body: () => T): T {
    const previous = this.frame;
    this.frame = { baseY, topY, wear };
    try { return body(); } finally { this.frame = previous; }
  }

  /**
   * A chamfered box centred at (cx, cy, cz) in the current frame: 6 faces, 12 edge chamfers and 8 corners (44
   * triangles; 12 with no bevel).
   */
  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, color: KitColor, options: KitBoxOptions = {}): this {
    const tone = this.color(color);
    const hx = w / 2, hy = h / 2, hz = d / 2;
    const c = Math.min(options.bevel ?? this.bevel, hx * 0.45, hy * 0.45, hz * 0.45);
    this.withFrame(cy - hy, cy + hy, options.wear ?? 0, () => {
      const P = (x: number, y: number, z: number): KitVec => [cx + x, cy + y, cz + z];
      if (c <= 1e-4) {
        const faces: ReadonlyArray<readonly [KitVec, KitVec, KitVec, KitVec, KitVec]> = [
          [P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), P(hx, -hy, hz), [1, 0, 0]],
          [P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), [-1, 0, 0]],
          [P(-hx, hy, -hz), P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), [0, 1, 0]],
          [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), [0, -1, 0]],
          [P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), [0, 0, 1]],
          [P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz), P(hx, -hy, -hz), [0, 0, -1]],
        ];
        faces.forEach(([a, b, cc, dd, n], index) => {
          if (index === 2 && options.noTop) return;
          if (index === 3 && options.noBottom) return;
          this.quad(a, b, cc, dd, tone, n);
        });
        return;
      }
      const ix = hx - c, iy = hy - c, iz = hz - c;
      // main faces
      for (const s of [-1, 1]) {
        this.quad(P(s * hx, -iy, -iz), P(s * hx, iy, -iz), P(s * hx, iy, iz), P(s * hx, -iy, iz), tone, [s, 0, 0]);
        if (!(s > 0 && options.noTop) && !(s < 0 && options.noBottom)) {
          this.quad(P(-ix, s * hy, -iz), P(ix, s * hy, -iz), P(ix, s * hy, iz), P(-ix, s * hy, iz), tone, [0, s, 0]);
        }
        this.quad(P(-ix, -iy, s * hz), P(ix, -iy, s * hz), P(ix, iy, s * hz), P(-ix, iy, s * hz), tone, [0, 0, s]);
      }
      // edge chamfers
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          if (sy < 0 && options.noBottom) continue;
          this.quad(P(sx * hx, sy * iy, -iz), P(sx * ix, sy * hy, -iz), P(sx * ix, sy * hy, iz), P(sx * hx, sy * iy, iz), tone, [sx, sy, 0], 1);
        }
        for (const sz of [-1, 1]) {
          this.quad(P(sx * hx, -iy, sz * iz), P(sx * hx, iy, sz * iz), P(sx * ix, iy, sz * hz), P(sx * ix, -iy, sz * hz), tone, [sx, 0, sz], 1);
        }
      }
      for (const sy of [-1, 1]) {
        if (sy < 0 && options.noBottom) continue;
        for (const sz of [-1, 1]) {
          this.quad(P(-ix, sy * hy, sz * iz), P(ix, sy * hy, sz * iz), P(ix, sy * iy, sz * hz), P(-ix, sy * iy, sz * hz), tone, [0, sy, sz], 1);
        }
      }
      // corners
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        if (sy < 0 && options.noBottom) continue;
        this.tri(P(sx * hx, sy * iy, sz * iz), P(sx * ix, sy * hy, sz * iz), P(sx * ix, sy * iy, sz * hz), tone, [sx, sy, sz], 1);
      }
    });
    return this;
  }

  /** A box whose long axis runs from a to b (local), with a w x h cross-section rolled by `roll` about the axis. */
  beam(a: KitVec, b: KitVec, w: number, h: number, color: KitColor, options: KitBoxOptions & { roll?: number } = {}): this {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const axis = end.clone().sub(start);
    const length = axis.length();
    if (length < 1e-5) return this;
    axis.divideScalar(length);
    const mid = start.add(end).multiplyScalar(0.5);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    if (options.roll) quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), options.roll));
    this.push();
    this.matrix.multiply(new THREE.Matrix4().compose(mid, quaternion, new THREE.Vector3(1, 1, 1)));
    this.normalDirty = true;
    this.box(0, 0, 0, w, h, length, color, options);
    return this.pop();
  }

  /** An I-section (universal beam) from a to b: flanges `width` wide, `depth` deep overall; web vertical by default. */
  ibeam(a: KitVec, b: KitVec, depth: number, width: number, color: KitColor, roll = 0, flange = 0.03, web = 0.018): this {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const axis = end.clone().sub(start);
    const length = axis.length();
    if (length < 1e-5) return this;
    axis.divideScalar(length);
    const mid = start.add(end).multiplyScalar(0.5);
    // keep the web in the vertical plane through the axis (an upright beam), then roll
    const up = Math.abs(axis.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const xAxis = new THREE.Vector3().crossVectors(up, axis).normalize();
    const yAxis = new THREE.Vector3().crossVectors(axis, xAxis).normalize();
    const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, axis);
    if (roll) basis.multiply(new THREE.Matrix4().makeRotationZ(roll));
    basis.setPosition(mid);
    this.push();
    this.matrix.multiply(basis);
    this.normalDirty = true;
    const bevel = Math.min(this.bevel, flange * 0.4);
    this.box(0, depth / 2 - flange / 2, 0, width, flange, length, color, { bevel });
    this.box(0, -depth / 2 + flange / 2, 0, width, flange, length, color, { bevel });
    this.box(0, 0, 0, web, depth - flange * 2, length, color, { bevel: 0 });
    return this.pop();
  }

  /** An equal-angle (L) section from a to b with legs `leg` long and `thick` thick; `roll` turns the heel; `flat` gives a flat bar. */
  angle(a: KitVec, b: KitVec, leg: number, thick: number, color: KitColor, roll = 0, flat = false): this {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const axis = end.clone().sub(start);
    const length = axis.length();
    if (length < 1e-5) return this;
    axis.divideScalar(length);
    const up = Math.abs(axis.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const xAxis = new THREE.Vector3().crossVectors(up, axis).normalize();
    const yAxis = new THREE.Vector3().crossVectors(axis, xAxis).normalize();
    const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, axis);
    if (roll) basis.multiply(new THREE.Matrix4().makeRotationZ(roll));
    basis.setPosition(start.clone().add(end).multiplyScalar(0.5));
    this.push();
    this.matrix.multiply(basis);
    this.normalDirty = true;
    this.box(leg / 2 - thick / 2, 0, 0, leg, thick, length, color, { bevel: 0 });
    if (!flat) this.box(0, leg / 2 - thick / 2, 0, thick, leg, length, color, { bevel: 0 });
    return this.pop();
  }

  /**
   * A solid of revolution: `profile` is [radius, height] pairs from the bottom up, turned about the frame's Y axis (or
   * `axis`) at (cx, cy, cz). A zero radius closes the end. Bands get flat normals along the profile and smooth ones round
   * the turn, so a drum's rolling hoops read crisp while its body reads round.
   */
  lathe(cx: number, cy: number, cz: number, profile: ReadonlyArray<readonly [number, number]>, segments: number,
    color: KitColor | ReadonlyArray<KitColor>, options: KitLatheOptions = {}): this {
    const tones = Array.isArray(color) ? (color as ReadonlyArray<KitColor>).map((c) => this.color(c)) : null;
    const single = tones ? null : this.color(color as KitColor);
    const start = options.start ?? 0;
    const sweep = options.sweep ?? Math.PI * 2;
    const smooth = options.smooth ?? true;
    const axis = options.axis ?? 'y';
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of profile) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const toLocal = (r: number, y: number, theta: number): KitVec => {
      const u = Math.cos(theta) * r, v = Math.sin(theta) * r;
      if (axis === 'y') return [cx + u, cy + y, cz + v];
      if (axis === 'x') return [cx + y, cy + u, cz + v];
      return [cx + u, cy + v, cz + y];
    };
    const dirLocal = (nr: number, ny: number, theta: number): KitVec => {
      const u = Math.cos(theta) * nr, v = Math.sin(theta) * nr;
      if (axis === 'y') return [u, ny, v];
      if (axis === 'x') return [ny, u, v];
      return [u, v, ny];
    };
    const frameBase = axis === 'y' ? cy + minY : cy - Math.max(...profile.map(([r]) => r));
    const frameTop = axis === 'y' ? cy + maxY : cy + Math.max(...profile.map(([r]) => r));
    this.withFrame(frameBase, frameTop, 0, () => {
      for (let i = 0; i < profile.length - 1; i += 1) {
        const [r0, y0] = profile[i];
        const [r1, y1] = profile[i + 1];
        const dr = r1 - r0, dy = y1 - y0;
        const len = Math.hypot(dr, dy);
        if (len < 1e-6) continue;
        // outward normal of this band in the (r, y) plane
        const nr = dy / len, ny = -dr / len;
        const tone = tones ? tones[Math.min(i, tones.length - 1)] : single!;
        const chip = Math.abs(nr) > 0.2 && Math.abs(ny) > 0.2 ? 1 : 0;
        for (let s = 0; s < segments; s += 1) {
          const t0 = start + (s / segments) * sweep;
          const t1 = start + ((s + 1) / segments) * sweep;
          const tm = (t0 + t1) / 2;
          const a = toLocal(r0, y0, t0), b = toLocal(r0, y0, t1), c = toLocal(r1, y1, t1), d = toLocal(r1, y1, t0);
          const n0 = smooth ? dirLocal(nr, ny, t0) : dirLocal(nr, ny, tm);
          const n1 = smooth ? dirLocal(nr, ny, t1) : dirLocal(nr, ny, tm);
          const out = dirLocal(nr, ny, tm);
          if (r0 > 1e-6) this.tri(a, b, c, tone, out, chip, [n0, n1, n1]);
          if (r1 > 1e-6) this.tri(a, c, d, tone, out, chip, [n0, n1, n0]);
        }
      }
    });
    return this;
  }

  /** A chamfered cylinder standing on (cx, cy, cz) along `axis` (its foot at the centre's axis coordinate). */
  cylinder(cx: number, cy: number, cz: number, radius: number, height: number, segments: number, color: KitColor,
    options: KitLatheOptions & { bevel?: number; capTop?: boolean; capBottom?: boolean; topRadius?: number } = {}): this {
    // cylinders chamfer only when asked: a chamfered rim costs four triangles a segment
    const c = Math.min(options.bevel ?? 0, radius * 0.3, height * 0.3);
    const top = options.topRadius ?? radius;
    const profile: Array<[number, number]> = [];
    if (options.capBottom !== false) profile.push([0, 0]);
    if (c > 1e-4) profile.push([radius - c, 0], [radius, c], [top, height - c], [top - c, height]);
    else profile.push([radius, 0], [top, height]);
    if (options.capTop !== false) profile.push([0, height]);
    return this.lathe(cx, cy, cz, profile, segments, color, options);
  }

  /** A cylinder from a to b (local) of radius r. */
  rod(a: KitVec, b: KitVec, radius: number, segments: number, color: KitColor, options: { bevel?: number; caps?: boolean } = {}): this {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const axis = end.clone().sub(start);
    const length = axis.length();
    if (length < 1e-5) return this;
    axis.divideScalar(length);
    this.push();
    this.matrix.multiply(new THREE.Matrix4().compose(start,
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis), new THREE.Vector3(1, 1, 1)));
    this.normalDirty = true;
    this.cylinder(0, 0, 0, radius, length, segments, color, {
      bevel: options.bevel ?? 0, capTop: options.caps !== false, capBottom: options.caps !== false,
    });
    return this.pop();
  }

  /** A torus about `axis` at (cx, cy, cz): ring radius R, tube radius r. */
  torus(cx: number, cy: number, cz: number, R: number, r: number, segments: number, tubeSegments: number, color: KitColor,
    axis: 'x' | 'y' | 'z' = 'y', sweep = Math.PI * 2): this {
    const tone = this.color(color);
    const map = (x: number, y: number, z: number): KitVec => (
      axis === 'y' ? [cx + x, cy + y, cz + z] : axis === 'x' ? [cx + y, cy + x, cz + z] : [cx + x, cy + z, cz + y]);
    const mapN = (x: number, y: number, z: number): KitVec => (axis === 'y' ? [x, y, z] : axis === 'x' ? [y, x, z] : [x, z, y]);
    this.withFrame(cy - r, cy + r, 0, () => {
      for (let i = 0; i < segments; i += 1) {
        const a0 = (i / segments) * sweep, a1 = ((i + 1) / segments) * sweep;
        for (let j = 0; j < tubeSegments; j += 1) {
          const b0 = (j / tubeSegments) * Math.PI * 2, b1 = ((j + 1) / tubeSegments) * Math.PI * 2;
          const point = (a: number, b: number): KitVec => {
            const ring = R + Math.cos(b) * r;
            return map(Math.cos(a) * ring, Math.sin(b) * r, Math.sin(a) * ring);
          };
          const normal = (a: number, b: number): KitVec => mapN(Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b));
          const p00 = point(a0, b0), p10 = point(a1, b0), p11 = point(a1, b1), p01 = point(a0, b1);
          const n00 = normal(a0, b0), n10 = normal(a1, b0), n11 = normal(a1, b1), n01 = normal(a0, b1);
          const am = (a0 + a1) / 2, bm = (b0 + b1) / 2;
          const out = normal(am, bm);
          this.tri(p00, p10, p11, tone, out, 0, [n00, n10, n11]);
          this.tri(p00, p11, p01, tone, out, 0, [n00, n11, n01]);
        }
      }
    });
    return this;
  }

  /**
   * A tube along a polyline (cables, hoses, ropes, slings), `sides` round, with parallel-transported rings so it never
   * twists. Open ends.
   */
  tube(points: ReadonlyArray<KitVec>, radius: number, sides: number, color: KitColor): this {
    if (points.length < 2) return this;
    const tone = this.color(color);
    const P = points.map((p) => new THREE.Vector3(...p));
    const tangents = P.map((_point, i) => {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      return b.clone().sub(a).normalize();
    });
    let normal = Math.abs(tangents[0].y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    normal = normal.sub(tangents[0].clone().multiplyScalar(normal.dot(tangents[0]))).normalize();
    const rings: Array<{ points: THREE.Vector3[]; normals: THREE.Vector3[] }> = [];
    for (let i = 0; i < P.length; i += 1) {
      if (i > 0) {
        const axis = new THREE.Vector3().crossVectors(tangents[i - 1], tangents[i]);
        const sin = axis.length();
        if (sin > 1e-6) {
          axis.divideScalar(sin);
          const ang = Math.acos(THREE.MathUtils.clamp(tangents[i - 1].dot(tangents[i]), -1, 1));
          normal.applyAxisAngle(axis, ang);
        }
      }
      const binormal = new THREE.Vector3().crossVectors(tangents[i], normal).normalize();
      const ringPoints: THREE.Vector3[] = [], ringNormals: THREE.Vector3[] = [];
      for (let s = 0; s < sides; s += 1) {
        const a = (s / sides) * Math.PI * 2;
        const dir = normal.clone().multiplyScalar(Math.cos(a)).add(binormal.clone().multiplyScalar(Math.sin(a)));
        ringNormals.push(dir);
        ringPoints.push(P[i].clone().add(dir.clone().multiplyScalar(radius)));
      }
      rings.push({ points: ringPoints, normals: ringNormals });
    }
    let minY = Infinity, maxY = -Infinity;
    for (const p of P) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    const v = (p: THREE.Vector3): KitVec => [p.x, p.y, p.z];
    this.withFrame(minY - radius, maxY + radius, 0, () => {
      for (let i = 0; i < rings.length - 1; i += 1) {
        for (let s = 0; s < sides; s += 1) {
          const s1 = (s + 1) % sides;
          const a = rings[i].points[s], b = rings[i].points[s1], c = rings[i + 1].points[s1], d = rings[i + 1].points[s];
          const na = rings[i].normals[s], nb = rings[i].normals[s1], nc = rings[i + 1].normals[s1], nd = rings[i + 1].normals[s];
          const out = v(na.clone().add(nb).add(nc).add(nd));
          this.tri(v(a), v(b), v(c), tone, out, 0, [v(na), v(nb), v(nc)]);
          this.tri(v(a), v(c), v(d), tone, out, 0, [v(na), v(nc), v(nd)]);
        }
      }
    });
    return this;
  }

  /** A hanging curve between a and b sagging `sag` metres at its middle (slings, festoon loops, cables). */
  static catenary(a: KitVec, b: KitVec, sag: number, steps = 8): KitVec[] {
    const points: KitVec[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const drop = sag * 4 * t * (1 - t);
      points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - drop, a[2] + (b[2] - a[2]) * t]);
    }
    return points;
  }

  /** A flat polygon (convex, in order) with one colour, e.g. a sign plate's face or a grating panel. */
  polygon(points: ReadonlyArray<KitVec>, color: KitColor, outward: KitVec): this {
    const tone = this.color(color);
    for (let i = 1; i < points.length - 1; i += 1) this.tri(points[0], points[i], points[i + 1], tone, outward);
    return this;
  }

  // ---------------------------------------------------------------- textured surfaces

  /**
   * A plain box of a pack's textured building surface (its own bucket: brick, render, planks, setts, roof), each face
   * mapped at its real size, `tile` metres a repeat, so brick courses keep one scale on a pier and on a wall.
   */
  surfaceBox(bucket: string, cx: number, cy: number, cz: number, w: number, h: number, d: number, tile = 1.2,
    options: { noBottom?: boolean; noTop?: boolean } = {}): this {
    this.updateNormalMatrix();
    let data = this.surfaceData.get(bucket);
    if (!data) { data = { positions: [], normals: [], uvs: [] }; this.surfaceData.set(bucket, data); }
    const hx = w / 2, hy = h / 2, hz = d / 2;
    const faces: ReadonlyArray<readonly [KitVec, KitVec, KitVec, KitVec, KitVec, number, number]> = [
      [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [1, 0, 0], d, h],
      [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-1, 0, 0], d, h],
      [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz], [0, 1, 0], w, d],
      [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz], [0, -1, 0], w, d],
      [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], [0, 0, 1], w, h],
      [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [0, 0, -1], w, h],
    ];
    const p = this.tmpA, n = this.tmpN;
    faces.forEach(([a, b, c, dd, normal, su, sv], index) => {
      if (index === 2 && options.noTop) return;
      if (index === 3 && options.noBottom) return;
      const corners: ReadonlyArray<readonly [KitVec, number, number]> = [[a, 0, 0], [b, su / tile, 0], [c, su / tile, sv / tile], [dd, 0, sv / tile]];
      n.set(normal[0], normal[1], normal[2]).applyMatrix3(this.normalMatrix).normalize();
      for (const corner of [0, 1, 2, 0, 2, 3]) {
        const [point, u, v] = corners[corner];
        p.set(cx + point[0], cy + point[1], cz + point[2]).applyMatrix4(this.matrix);
        data!.positions.push(p.x, p.y, p.z);
        data!.normals.push(n.x, n.y, n.z);
        data!.uvs.push(u, v);
      }
    });
    return this;
  }

  // ---------------------------------------------------------------- display + decal outputs

  /**
   * A quad on the display atlas: corners a (bottom-left), b (bottom-right), c (top-right), d (top-left) in the current
   * frame, mapped to `rect`. Optional `crop` picks a sub-rect of it (0..1 fractions).
   */
  face(a: KitVec, b: KitVec, c: KitVec, d: KitVec, rect: KitAtlasRect, crop?: readonly [number, number, number, number]): this {
    this.emitAtlasQuad(this.displayPositions, this.displayNormals, this.displayUvs, a, b, c, d, rect, crop);
    return this;
  }

  /** A decal quad (stencil, grime, light pool) on the display atlas, for the pack's DECAL draw. */
  decal(a: KitVec, b: KitVec, c: KitVec, d: KitVec, rect: KitAtlasRect, crop?: readonly [number, number, number, number]): this {
    this.emitAtlasQuad(this.decalPositions, this.decalNormals, this.decalUvs, a, b, c, d, rect, crop);
    return this;
  }

  /** A face standing upright in the frame's XY plane, centred at (cx, cy, cz), facing +Z, w x h. */
  uprightFace(cx: number, cy: number, cz: number, w: number, h: number, rect: KitAtlasRect, crop?: readonly [number, number, number, number]): this {
    return this.face([cx - w / 2, cy - h / 2, cz], [cx + w / 2, cy - h / 2, cz], [cx + w / 2, cy + h / 2, cz], [cx - w / 2, cy + h / 2, cz], rect, crop);
  }

  private emitAtlasQuad(positions: number[], normals: number[], uvs: number[], a: KitVec, b: KitVec, c: KitVec, d: KitVec,
    rect: KitAtlasRect, crop?: readonly [number, number, number, number]): void {
    this.updateNormalMatrix();
    const [cu0, cv0, cu1, cv1] = crop ?? [0, 0, 1, 1];
    const u0 = rect.u0 + (rect.u1 - rect.u0) * cu0, u1 = rect.u0 + (rect.u1 - rect.u0) * cu1;
    const v0 = rect.v0 + (rect.v1 - rect.v0) * cv0, v1 = rect.v0 + (rect.v1 - rect.v0) * cv1;
    const corners: ReadonlyArray<readonly [KitVec, number, number]> = [[a, u0, v0], [b, u1, v0], [c, u1, v1], [d, u0, v1]];
    const pa = new THREE.Vector3(...a), pb = new THREE.Vector3(...b), pd = new THREE.Vector3(...d);
    const n = new THREE.Vector3().subVectors(pb, pa).cross(new THREE.Vector3().subVectors(pd, pa)).normalize()
      .applyMatrix3(this.normalMatrix).normalize();
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const [p, u, v] = corners[index];
      const world = new THREE.Vector3(...p).applyMatrix4(this.matrix);
      positions.push(world.x, world.y, world.z);
      normals.push(n.x, n.y, n.z);
      uvs.push(u, v);
    }
  }

  // ---------------------------------------------------------------- finish

  get triangleCount(): number {
    let surface = 0;
    for (const data of this.surfaceData.values()) surface += data.positions.length / 9;
    return this.positions.length / 9 + surface;
  }

  /**
   * Bake the shading and weathering into the vertex colours and hand back the geometries. `groundY` is the piece
   * frame's ground (AO and dirt fade up from it, after the build's transforms).
   */
  build(groundY = 0): KitBuildResult {
    const { skin } = this;
    const ground = new THREE.Color(skin.ground);
    const primer = new THREE.Color(skin.primer);
    const count = this.positions.length / 3;
    const colors = new Float32Array(count * 3);
    const tone = this.tmpColor;
    const weatherTone = skin.weathering === 'snow' ? SNOW : skin.weathering === 'sand' ? SAND
      : skin.weathering === 'reddust' ? RED_DUST : skin.weathering === 'salt' ? SALT
        : skin.weathering === 'coal' ? SOOT : skin.weathering === 'mud' ? MUD : skin.weathering === 'heat' ? HEAT : null;
    for (let i = 0; i < count; i += 1) {
      const x = this.positions[i * 3], y = this.positions[i * 3 + 1], z = this.positions[i * 3 + 2];
      const ny = this.normals[i * 3 + 1];
      const [local, chip, extraWear] = [this.shading[i * 3], this.shading[i * 3 + 1], this.shading[i * 3 + 2]];
      const wear = THREE.MathUtils.clamp(skin.wear + extraWear, 0, 1);
      tone.setRGB(this.colors[i * 3], this.colors[i * 3 + 1], this.colors[i * 3 + 2]);
      // a cheap positional hash for streaks and chips (deterministic, no rng order dependence)
      const hash = Math.abs(Math.sin(x * 12.9898 + z * 78.233 + y * 3.71) * 43758.5453) % 1;
      // worn edges catch the light; some chip toward primer (painted kit) or bare metal
      if (chip) {
        tone.multiplyScalar(1.1);
        if (hash < 0.3 + wear * 0.35) tone.lerp(hash < 0.12 ? BARE : primer, 0.2 + wear * 0.3);
      }
      // weathering on up-facing faces
      if (weatherTone && ny > 0.6) {
        // snow lies in patches on the tops (never a white-painted lid), thinner on narrow members
        const amount = skin.weathering === 'snow' ? (0.3 + 0.42 * hash) * THREE.MathUtils.smoothstep(ny, 0.7, 0.95)
          : skin.weathering === 'sand' || skin.weathering === 'reddust' ? 0.14 + 0.14 * hash
            : skin.weathering === 'coal' ? 0.22 : skin.weathering === 'salt' ? 0.14 : skin.weathering === 'mud' ? 0.1 : 0.05;
        tone.lerp(weatherTone, amount);
      }
      // mud splash and dust low on vertical faces
      if (skin.weathering === 'mud' || skin.weathering === 'reddust' || skin.weathering === 'sand') {
        const splash = (1 - THREE.MathUtils.smoothstep(y - groundY, 0.02, 0.45)) * (Math.abs(ny) < 0.6 ? 1 : 0.3);
        tone.lerp(weatherTone ?? ground, splash * 0.22);
      }
      // salt bloom and rust bleed streaks down vertical faces
      if (Math.abs(ny) < 0.4) {
        const streak = Math.max(0, Math.sin(x * 9.1 + z * 9.7) * Math.sin(x * 2.3 - z * 3.1)) * (1 - local);
        tone.multiplyScalar(1 - streak * 0.12 * (0.5 + wear));
      }
      // dirt climbing from the ground
      const dirt = (1 - THREE.MathUtils.smoothstep(y - groundY, 0.0, 0.3)) * (0.12 + wear * 0.2);
      tone.lerp(ground, dirt);
      // per-primitive grime gradient and ground AO, darker under overhangs
      const ao = 1 - this.aoStrength * (1 - THREE.MathUtils.smoothstep(y - groundY, 0, this.aoHeight));
      const under = ny < -0.5 ? 0.78 : 1;
      const gradient = 0.86 + 0.14 * local;
      tone.multiplyScalar(ao * under * gradient);
      colors[i * 3] = tone.r; colors[i * 3 + 1] = tone.g; colors[i * 3 + 2] = tone.b;
    }
    const solid = new THREE.BufferGeometry();
    solid.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    solid.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    solid.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    solid.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    solid.computeBoundingBox();
    solid.computeBoundingSphere();
    const atlasGeometry = (positions: number[], normals: number[], uvs: number[]): THREE.BufferGeometry | null => {
      if (!positions.length) return null;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    };
    const display = atlasGeometry(this.displayPositions, this.displayNormals, this.displayUvs);
    const decal = atlasGeometry(this.decalPositions, this.decalNormals, this.decalUvs);
    const surfaces = new Map<string, THREE.BufferGeometry>();
    for (const [bucket, data] of this.surfaceData) {
      const geometry = atlasGeometry(data.positions, data.normals, data.uvs);
      if (geometry) surfaces.set(bucket, geometry);
    }
    return {
      solid,
      display,
      decal,
      surfaces,
      triangles: count / 3 + [...surfaces.values()].reduce((sum, g) => sum + g.getAttribute('position').count / 3, 0),
      solidTriangles: count / 3,
      displayTriangles: this.displayPositions.length / 9,
      decalTriangles: this.decalPositions.length / 9,
    };
  }
}
