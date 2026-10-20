import * as THREE from 'three';

/**
 * Landmark geometry for an outdoor Garage's horizon (garage r9, K10: "the skyline comes from the map"). The horizon is
 * one unlit vertex-colour draw (garageEnvironmentKit.ts createBackdropGeometry); its landmarks (a map's mesas, its ksar,
 * a town's gables, spires and castle) are written into the same arrays, flat-shaded under the backdrop's own fixed low
 * sun and hazed by distance exactly like its bands, so they cost no draw, texture or program.
 *
 * Coordinates are the Garage's world-local metres (the turntable at the origin, a map's +X/+Z, so a landmark's bearing
 * from the Garage is its bearing from the map's player spawn). Faces that look away from the yard are never seen from
 * any Garage camera (they all stand within ~30 m of the turntable) and are skipped.
 */

export interface GarageHorizonSink {
  readonly positions: number[];
  readonly colors: number[];
  readonly indices: number[];
  /** The backdrop's fixed low sun (normalised, world). */
  readonly sun: THREE.Vector3;
  /** The horizon haze colour the bands fade to. */
  readonly horizon: THREE.Color;
  /** The crest of backdrop band `layer` (0 nearest .. 4 farthest) at world bearing `angle`, metres over the datum. */
  crestAt(angle: number, layer: number): number;
  /** The bands' radii (metres), nearest first. */
  readonly layerRadii: readonly number[];
}

export type LandmarkPoint = readonly [number, number, number];

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const tmpColor = new THREE.Color();
const HEX = new Map<number, THREE.Color>();

/** A cached colour for a hex (never mutated). */
export function landmarkHex(hex: number): THREE.Color {
  let color = HEX.get(hex);
  if (!color) { color = new THREE.Color(hex); HEX.set(hex, color); }
  return color;
}

/** A deterministic hash in [0, 1) for a pair of numbers (no random stream needed by the landmark builders). */
export function landmarkHash(a: number, b = 0): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export class LandmarkMesh {
  readonly sink: GarageHorizonSink;
  /** Tallest y written by `track` geometry (the receipts' skyline ceiling). */
  topY = 0;
  /** Lighting curve: rugged rock takes the bands' high-contrast curve; built masses the softer one. */
  rugged = true;
  /** Extra haze on top of the distance haze (0..1). */
  hazeBias = 0;
  /** When false, geometry does not count toward `topY` (slender accents). */
  track = true;
  /** The tallest accent y (spires, stacks, keeps) when `track` is off. */
  accentY = 0;
  triangles = 0;

  constructor(sink: GarageHorizonSink) {
    this.sink = sink;
  }

  /** Distance haze matching the bands (0.07 at the first band, about 0.55 at the last) and the valley mist at the foot. */
  hazeAt(x: number, y: number, z: number): number {
    const r = Math.hypot(x, z);
    const band = THREE.MathUtils.clamp((r - 44) / 13, 0, 4.4);
    const foot = 1 - THREE.MathUtils.smoothstep(y, -4, 2.5);
    return THREE.MathUtils.clamp(0.06 + band * 0.105 + foot * 0.1 + this.hazeBias, 0, 0.82);
  }

  private shade(normal: THREE.Vector3): number {
    const sunlit = Math.max(0, normal.dot(this.sink.sun));
    return this.rugged
      ? 0.46 + 0.86 * sunlit + 0.1 * Math.max(0, normal.y)
      : 0.52 + 0.7 * sunlit + 0.12 * Math.max(0, normal.y);
  }

  private note(y: number): void {
    if (this.track) this.topY = Math.max(this.topY, y);
    else this.accentY = Math.max(this.accentY, y);
  }

  /**
   * A flat-shaded polygon (3 or 4 corners, counter-clockwise seen from its front). `tones` is one colour or one per
   * corner. Returns false when it faced away from the yard and was skipped.
   */
  face(points: readonly LandmarkPoint[], tones: number | THREE.Color | readonly (number | THREE.Color)[], options: {
    readonly cull?: boolean; readonly darkenFoot?: boolean;
    /** A point inside the solid: the face turns to look away from it whatever its corners' order. */
    readonly inside?: LandmarkPoint;
  } = {}): boolean {
    const [p0, p1, p2] = points;
    tmpA.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    tmpB.set(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
    tmpN.crossVectors(tmpA, tmpB);
    if (tmpN.lengthSq() < 1e-12) return false;
    tmpN.normalize();
    if (options.inside) {
      let cx = 0, cy = 0, cz = 0;
      for (const p of points) { cx += p[0]; cy += p[1]; cz += p[2]; }
      const n = points.length, [ix, iy, iz] = options.inside;
      if (tmpN.x * (cx / n - ix) + tmpN.y * (cy / n - iy) + tmpN.z * (cz / n - iz) < 0) {
        const reversed = [...points].reverse();
        const reversedTones = Array.isArray(tones) ? [...tones].reverse() : tones;
        return this.face(reversed, reversedTones, { cull: options.cull, darkenFoot: options.darkenFoot });
      }
    }
    if (options.cull !== false && tmpN.y < 0.3) {
      // the face's centre and the direction back to the yard
      let cx = 0, cz = 0;
      for (const p of points) { cx += p[0]; cz += p[2]; }
      cx /= points.length; cz /= points.length;
      const r = Math.hypot(cx, cz) || 1;
      const horizontal = Math.hypot(tmpN.x, tmpN.z) || 1;
      if ((tmpN.x * -cx + tmpN.z * -cz) / (r * horizontal) < -0.6) return false;
    }
    const lit = this.shade(tmpN);
    const base = this.sink.positions.length / 3;
    points.forEach((p, index) => {
      const tone = Array.isArray(tones) ? tones[index] : tones as number | THREE.Color;
      tmpColor.copy(typeof tone === 'number' ? landmarkHex(tone) : tone)
        .multiplyScalar(lit * (options.darkenFoot && p[1] < 0.8 ? 0.78 : 1))
        .lerp(this.sink.horizon, this.hazeAt(p[0], p[1], p[2]));
      this.sink.positions.push(p[0], p[1], p[2]);
      this.sink.colors.push(tmpColor.r, tmpColor.g, tmpColor.b);
      this.note(p[1]);
    });
    if (points.length === 3) { this.sink.indices.push(base, base + 1, base + 2); this.triangles += 1; }
    else { this.sink.indices.push(base, base + 1, base + 2, base, base + 2, base + 3); this.triangles += 2; }
    return true;
  }

  /** A frame turned to face the yard from world bearing `angle` at `radius`: x across (right, seen from the yard), z away. */
  frame(angle: number, radius: number, yaw = 0): (x: number, y: number, z: number) => LandmarkPoint {
    const ox = Math.cos(angle) * radius, oz = Math.sin(angle) * radius;
    const outX = Math.cos(angle + yaw), outZ = Math.sin(angle + yaw);
    const acrossX = -outZ, acrossZ = outX;
    return (x, y, z) => [ox + acrossX * x + outX * z, y, oz + acrossZ * x + outZ * z];
  }

  /**
   * A box in a frame (front face toward the yard at z0): walls in `wall`, an optional flat roof. Feet at `foot`.
   * `sides` false skips the side walls (a row's party walls).
   */
  box(at: (x: number, y: number, z: number) => LandmarkPoint, x0: number, x1: number, z0: number, z1: number, foot: number, top: number,
    wall: number | THREE.Color, roof: number | THREE.Color | null, sides = true): void {
    this.face([at(x0, foot, z0), at(x1, foot, z0), at(x1, top, z0), at(x0, top, z0)], wall, { darkenFoot: true });
    if (sides) {
      this.face([at(x1, foot, z0), at(x1, foot, z1), at(x1, top, z1), at(x1, top, z0)], wall, { darkenFoot: true });
      this.face([at(x0, foot, z1), at(x0, foot, z0), at(x0, top, z0), at(x0, top, z1)], wall, { darkenFoot: true });
    }
    if (roof !== null) this.face([at(x0, top, z0), at(x1, top, z0), at(x1, top, z1), at(x0, top, z1)], roof);
  }

  /** A pitched roof over x0..x1, z0..z1 from `eave` to `ridge`; the ridge runs across the frame (gables left and right). */
  gableAcross(at: (x: number, y: number, z: number) => LandmarkPoint, x0: number, x1: number, z0: number, z1: number,
    eave: number, ridge: number, wall: number | THREE.Color, roof: number | THREE.Color, overhang = 0.35): void {
    const zm = (z0 + z1) / 2;
    const ex0 = x0 - overhang, ex1 = x1 + overhang, ez0 = z0 - overhang, ez1 = z1 + overhang;
    const drop = overhang * (ridge - eave) / Math.max(0.1, zm - z0);
    this.face([at(ex0, eave - drop, ez0), at(ex1, eave - drop, ez0), at(ex1, ridge, zm), at(ex0, ridge, zm)], roof);
    this.face([at(ex1, eave - drop, ez1), at(ex0, eave - drop, ez1), at(ex0, ridge, zm), at(ex1, ridge, zm)], roof);
    this.face([at(x1, eave, z0), at(x1, eave, z1), at(x1, ridge, zm)], wall);
    this.face([at(x0, eave, z1), at(x0, eave, z0), at(x0, ridge, zm)], wall);
  }

  /** A pitched roof whose ridge runs away from the yard: its gable faces the yard (a gable-fronted house). */
  gableToward(at: (x: number, y: number, z: number) => LandmarkPoint, x0: number, x1: number, z0: number, z1: number,
    eave: number, ridge: number, wall: number | THREE.Color, roof: number | THREE.Color, overhang = 0.35): void {
    const xm = (x0 + x1) / 2;
    const ex0 = x0 - overhang, ex1 = x1 + overhang, ez0 = z0 - overhang, ez1 = z1 + overhang;
    const drop = overhang * (ridge - eave) / Math.max(0.1, xm - x0);
    this.face([at(ex0, eave - drop, ez1), at(ex0, eave - drop, ez0), at(xm, ridge, ez0), at(xm, ridge, ez1)], roof);
    this.face([at(ex1, eave - drop, ez0), at(ex1, eave - drop, ez1), at(xm, ridge, ez1), at(xm, ridge, ez0)], roof);
    this.face([at(x0, eave, z0), at(x1, eave, z0), at(xm, ridge, z0)], wall);
    this.face([at(x1, eave, z1), at(x0, eave, z1), at(xm, ridge, z1)], wall);
  }

  /** A prism (round tower, stack) of `sides` from foot to top with a cone or flat cap rising `cap` over it. */
  prism(at: (x: number, y: number, z: number) => LandmarkPoint, x: number, z: number, radius: number, foot: number, top: number,
    wall: number | THREE.Color, capTone: number | THREE.Color, sides = 8, cap = 0, topRadius = radius): void {
    for (let i = 0; i < sides; i += 1) {
      const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      // (the frame's x/z axes are mirrored seen from above, so the walls wind a0 -> a1 to face outward)
      this.face([at(x + c0 * radius, foot, z + s0 * radius), at(x + c1 * radius, foot, z + s1 * radius),
        at(x + c1 * topRadius, top, z + s1 * topRadius), at(x + c0 * topRadius, top, z + s0 * topRadius)], wall, { darkenFoot: true });
      this.face([at(x, top + cap, z), at(x + c0 * topRadius, top, z + s0 * topRadius), at(x + c1 * topRadius, top, z + s1 * topRadius)], capTone,
        { cull: cap > 0 });
    }
  }

  /** A thin panel on a front face at z0 (windows, doors, timber framing): a quad 6 cm proud of it. */
  panel(at: (x: number, y: number, z: number) => LandmarkPoint, x0: number, x1: number, z0: number, y0: number, y1: number,
    tone: number | THREE.Color): void {
    this.face([at(x0, y0, z0 - 0.06), at(x1, y0, z0 - 0.06), at(x1, y1, z0 - 0.06), at(x0, y1, z0 - 0.06)], tone);
  }
}
