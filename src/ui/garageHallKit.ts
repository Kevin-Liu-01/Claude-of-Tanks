// src/ui/garageHallKit.ts — the building kit for the Garage halls (the garage redesign, round 7, 2026-10-14; the owner:
// "make the garages (all of them) redesigned to look a ton better"; the props standard, bunker r2: real members,
// openings cut through with a reveal, a frame and a sash or leaf set back, grounded, no painted detail).
//
// One accumulator (HallMesh) collects flat-shaded triangles in a placement frame, with a UV in metres and a linear
// vertex colour per face, and turns them into one BufferGeometry. The builders on top of it are the hall's members:
// trapezoidal profiled sheeting with openings cut out of it, I-section columns and channel girts, a concrete upstand
// with a chamfered cap, framed clerestory glazing, sectional vehicle doors on their guides and a personnel door in a
// frame. Everything is static, built once and merged: one draw per material.
import * as THREE from 'three';

type Vec3 = readonly [number, number, number];

/** An opening in a wall's own frame: u along the wall, y up (metres). */
export interface HallOpening {
  readonly u0: number;
  readonly u1: number;
  readonly y0: number;
  readonly y1: number;
}


/** A growable Float32Array. */
class FloatList {
  array: Float32Array;
  length = 0;
  constructor(capacity: number) { this.array = new Float32Array(capacity); }
  reserve(extra: number): Float32Array {
    if (this.length + extra > this.array.length) {
      const grown = new Float32Array(Math.max(this.array.length * 2, this.length + extra));
      grown.set(this.array.subarray(0, this.length));
      this.array = grown;
    }
    return this.array;
  }
  view(): Float32Array { return this.array.slice(0, this.length); }
}

/**
 * Flat-shaded quads in a movable placement frame (indexed: four corners and two triangles each), with a normal, a UV in
 * metres over `uvScale` and a linear colour per quad. Built straight into typed arrays: the hall is built on the boot
 * path, so a quad costs a few multiplies and no allocation.
 */
export class HallMesh {
  private readonly positions = new FloatList(4096 * 3);
  private readonly normals = new FloatList(4096 * 3);
  private readonly uvs = new FloatList(4096 * 2);
  private readonly colors = new FloatList(4096 * 3);
  private indices = new Uint32Array(4096 * 1.5);
  private indexCount = 0;
  private readonly frame = new THREE.Matrix4();
  private readonly normalFrame = new THREE.Matrix3();
  private readonly color = new THREE.Color(1, 1, 1);
  /** UV metres per repeat (u, v) for the surfaces that carry a map. */
  uvScale: readonly [number, number] = [1, 1];

  setFrame(matrix: THREE.Matrix4): this {
    this.frame.copy(matrix);
    this.normalFrame.getNormalMatrix(matrix);
    return this;
  }

  setColor(color: THREE.ColorRepresentation | THREE.Color): this {
    if (color instanceof THREE.Color) this.color.copy(color);
    else this.color.set(color);
    return this;
  }

  getFrame(target = new THREE.Matrix4()): THREE.Matrix4 {
    return target.copy(this.frame);
  }

  get triangleCount(): number {
    return this.indexCount / 3;
  }

  /** One triangle, counter-clockwise seen from its front. */
  tri(p0: Vec3, p1: Vec3, p2: Vec3): void {
    this.quad(p0, p1, p2, p2);
    this.indexCount -= 3; // the degenerate half (0, 2, 2)
  }

  /**
   * One planar quad, corners counter-clockwise seen from its front; its UVs come from the local corners' (u, y) or an
   * explicit list. The front normal follows the winding.
   */
  quad(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, uv?: readonly (readonly [number, number])[]): void {
    let ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    let bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    if (nx * nx + ny * ny + nz * nz < 1e-14) {
      bx = p3[0] - p0[0]; by = p3[1] - p0[1]; bz = p3[2] - p0[2];
      nx = ay * bz - az * by; ny = az * bx - ax * bz; nz = ax * by - ay * bx;
    }
    const n = this.normalFrame.elements;
    const wx = n[0] * nx + n[3] * ny + n[6] * nz, wy = n[1] * nx + n[4] * ny + n[7] * nz, wz = n[2] * nx + n[5] * ny + n[8] * nz;
    const inv = 1 / (Math.hypot(wx, wy, wz) || 1);
    const m = this.frame.elements;
    const base = this.positions.length / 3;
    const P = this.positions.reserve(12), N = this.normals.reserve(12), U = this.uvs.reserve(8), C = this.colors.reserve(12);
    let pi = this.positions.length, ui = this.uvs.length;
    const [su, sv] = this.uvScale;
    const corners = [p0, p1, p2, p3];
    for (let k = 0; k < 4; k += 1) {
      const [x, y, z] = corners[k];
      P[pi] = m[0] * x + m[4] * y + m[8] * z + m[12];
      P[pi + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      P[pi + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      N[pi] = wx * inv; N[pi + 1] = wy * inv; N[pi + 2] = wz * inv;
      C[pi] = this.color.r; C[pi + 1] = this.color.g; C[pi + 2] = this.color.b;
      const explicit = uv?.[k];
      U[ui] = explicit ? explicit[0] : x / su;
      U[ui + 1] = explicit ? explicit[1] : y / sv;
      pi += 3; ui += 2;
    }
    this.positions.length = pi; this.normals.length = pi; this.colors.length = pi; this.uvs.length = ui;
    if (this.indexCount + 6 > this.indices.length) {
      const grown = new Uint32Array(this.indices.length * 2);
      grown.set(this.indices.subarray(0, this.indexCount));
      this.indices = grown;
    }
    const I = this.indices, i = this.indexCount;
    I[i] = base; I[i + 1] = base + 1; I[i + 2] = base + 2; I[i + 3] = base; I[i + 4] = base + 2; I[i + 5] = base + 3;
    this.indexCount += 6;
  }

  /**
   * An axis-aligned box in the local frame from its centre and size, optionally turned about local Y; `skip` drops
   * faces that are never seen (e.g. a footing's underside). Faces map their UVs in metres on their own two axes.
   */
  box(center: Vec3, size: Vec3, options: Readonly<{ yaw?: number; skip?: readonly ('px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz')[] }> = {}): void {
    const [cx, cy, cz] = center;
    const hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
    const yaw = options.yaw ?? 0;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (x: number, y: number, z: number): Vec3 => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const skip = new Set(options.skip ?? []);
    const faces: Array<[string, Vec3, Vec3, Vec3, Vec3, number, number]> = [
      ['px', at(hx, -hy, hz), at(hx, -hy, -hz), at(hx, hy, -hz), at(hx, hy, hz), size[2], size[1]],
      ['nx', at(-hx, -hy, -hz), at(-hx, -hy, hz), at(-hx, hy, hz), at(-hx, hy, -hz), size[2], size[1]],
      ['py', at(-hx, hy, hz), at(hx, hy, hz), at(hx, hy, -hz), at(-hx, hy, -hz), size[0], size[2]],
      ['ny', at(-hx, -hy, -hz), at(hx, -hy, -hz), at(hx, -hy, hz), at(-hx, -hy, hz), size[0], size[2]],
      ['pz', at(-hx, -hy, hz), at(hx, -hy, hz), at(hx, hy, hz), at(-hx, hy, hz), size[0], size[1]],
      ['nz', at(hx, -hy, -hz), at(-hx, -hy, -hz), at(-hx, hy, -hz), at(hx, hy, -hz), size[0], size[1]],
    ];
    const [su, sv] = this.uvScale;
    for (const [name, a, b, d, e, w, h] of faces) {
      if (skip.has(name as 'px')) continue;
      this.quad(a, b, d, e, [[0, 0], [w / su, 0], [w / su, h / sv], [0, h / sv]]);
    }
  }

  /** A box between two points (a beam, brace or rafter) of square section `t` (or `t` by `t2`). */
  beam(a: Vec3, b: Vec3, t: number, t2 = t): void {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const length = start.distanceTo(end);
    if (length < 1e-4) return;
    const saved = this.frame.clone();
    const direction = end.clone().sub(start).normalize();
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    const local = new THREE.Matrix4().compose(start.add(end).multiplyScalar(0.5), rotation, new THREE.Vector3(1, 1, 1));
    this.setFrame(saved.clone().multiply(local));
    this.box([0, 0, 0], [t, length, t2]);
    this.setFrame(saved);
  }

  toGeometry({ uv = true, color = true }: Readonly<{ uv?: boolean; color?: boolean }> = {}): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions.view(), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(this.normals.view(), 3));
    if (uv) geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs.view(), 2));
    if (color) geometry.setAttribute('color', new THREE.BufferAttribute(this.colors.view(), 3));
    geometry.setIndex(new THREE.BufferAttribute(this.indices.slice(0, this.indexCount), 1));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }
}

/** The wall frame: local u along `dir` from `origin`, y up, w (+) into the room along `inward`. */
export function hallWallFrame(origin: Vec3, alongYaw: number): THREE.Matrix4 {
  // local +X runs along the wall, local +Z points into the room
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...origin),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), alongYaw),
    new THREE.Vector3(1, 1, 1),
  );
}

const overlapsY = (opening: HallOpening, y0: number, y1: number): boolean => opening.y1 > y0 + 1e-4 && opening.y0 < y1 - 1e-4;

/** The y spans of [y0, y1] that a strip from u0 to u1 keeps once the openings that cross it are cut away. */
function stripSpans(u0: number, u1: number, y0: number, y1: number, openings: readonly HallOpening[]): Array<[number, number]> {
  const cuts = openings
    .filter((opening) => opening.u0 < u1 - 1e-4 && opening.u1 > u0 + 1e-4 && overlapsY(opening, y0, y1))
    .map((opening) => [Math.max(y0, opening.y0), Math.min(y1, opening.y1)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const spans: Array<[number, number]> = [];
  let at = y0;
  for (const [c0, c1] of cuts) {
    if (c0 > at + 1e-3) spans.push([at, c0]);
    at = Math.max(at, c1);
  }
  if (y1 > at + 1e-3) spans.push([at, y1]);
  return spans;
}

/**
 * Trapezoidal profiled sheeting (35 mm ribs at `pitch`, ribs vertical) from u0 to u1 and y0 to y1 at w = 0, its crowns
 * standing `depth` into the room; openings are cut out along the profile's own strips (each strip keeps the spans the
 * openings leave), so a cut edge follows the ribs as a real sheet trimmed round a frame does.
 */
export function addProfiledSheeting(mesh: HallMesh, u0: number, u1: number, y0: number, y1: number,
  openings: readonly HallOpening[], { pitch = 0.2, depth = 0.035, inward = 1 }: Readonly<{ pitch?: number; depth?: number; inward?: 1 | -1 }> = {}): void {
  // one period: valley, rising web, crown, falling web (fractions of the pitch)
  const valley = 0.5, web = 0.125, crown = 0.25;
  const profile: Array<[number, number]> = [[0, 0], [valley, 0], [valley + web, 1], [valley + web + crown, 1], [1, 0]];
  const periods = Math.ceil((u1 - u0) / pitch);
  for (let period = 0; period < periods; period += 1) {
    for (let segment = 0; segment < profile.length - 1; segment += 1) {
      const a = Math.min(u1, u0 + (period + profile[segment][0]) * pitch);
      const b = Math.min(u1, u0 + (period + profile[segment + 1][0]) * pitch);
      if (b - a < 1e-5) continue;
      const wa = profile[segment][1] * depth * inward;
      const wb = profile[segment + 1][1] * depth * inward;
      for (const [s0, s1] of stripSpans(a, b, y0, y1, openings)) {
        // seen from the room (+w), +u runs to the right: counter-clockwise is (a, s0) -> (b, s0) -> (b, s1) -> (a, s1)
        if (inward > 0) mesh.quad([a, s0, wa], [b, s0, wb], [b, s1, wb], [a, s1, wa]);
        else mesh.quad([b, s0, wb], [a, s0, wa], [a, s1, wa], [b, s1, wb]);
      }
    }
  }
}

/** A rolled I-section standing from y0 to y1 at (u, w) in the wall frame: two flanges along u, a web along w. */
export function addISectionColumn(mesh: HallMesh, u: number, w: number, y0: number, y1: number,
  { flange = 0.3, depth = 0.4, tf = 0.028, tw = 0.016 }: Readonly<{ flange?: number; depth?: number; tf?: number; tw?: number }> = {}): void {
  const h = y1 - y0, cy = (y0 + y1) / 2;
  for (const sign of [-1, 1]) mesh.box([u, cy, w + sign * (depth / 2 - tf / 2)], [flange, h, tf], { skip: ['ny'] });
  mesh.box([u, cy, w], [tw, h, depth - 2 * tf], { skip: ['ny', 'py'] });
}

/** A cold-rolled channel girt from u0 to u1 at height y: its web against the sheeting at w0, its lips into the room. */
export function addChannelGirt(mesh: HallMesh, u0: number, u1: number, y: number, w0: number,
  { d = 0.2, b = 0.075, t = 0.012 }: Readonly<{ d?: number; b?: number; t?: number }> = {}): void {
  const length = u1 - u0, cu = (u0 + u1) / 2;
  mesh.box([cu, y, w0 + t / 2], [length, d, t], { skip: ['nz'] });
  for (const sign of [-1, 1]) mesh.box([cu, y + sign * (d / 2 - t / 2), w0 + b / 2], [length, t, b]);
}

/** A steel base plate with four anchor nuts and a grout pad under a column at (u, w). */
export function addColumnBase(mesh: HallMesh, u: number, w: number, { plate = 0.5, grout = 0.62 }: Readonly<{ plate?: number; grout?: number }> = {}): void {
  mesh.box([u, 0.02, w], [grout, 0.04, grout], { skip: ['ny'] });
  mesh.box([u, 0.055, w], [plate, 0.03, plate], { skip: ['ny'] });
  for (const du of [-1, 1]) for (const dw of [-1, 1]) {
    mesh.box([u + du * plate * 0.36, 0.09, w + dw * plate * 0.36], [0.05, 0.04, 0.05], { skip: ['ny'] });
  }
}

/**
 * A concrete upstand (dado wall) from u0 to u1, `height` tall, its inner face at w = `face`, `thickness` deep toward
 * -w, with a 45-degree chamfer on its inner top edge. Openings that reach the floor cut it, and their cut ends show
 * the full section (a reveal).
 */
export function addUpstand(mesh: HallMesh, u0: number, u1: number, height: number, face: number, thickness: number,
  openings: readonly HallOpening[], chamfer = 0.05): void {
  const runs: Array<[number, number]> = [];
  let at = u0;
  const cuts = openings.filter((opening) => opening.y0 < height && opening.u1 > u0 && opening.u0 < u1)
    .map((opening) => [Math.max(u0, opening.u0), Math.min(u1, opening.u1)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  for (const [c0, c1] of cuts) {
    if (c0 > at + 1e-3) runs.push([at, c0]);
    at = Math.max(at, c1);
  }
  if (u1 > at + 1e-3) runs.push([at, u1]);
  const back = face - thickness;
  const top = height, knee = height - chamfer, lip = face - chamfer;
  for (const [a, b] of runs) {
    mesh.quad([a, 0, face], [b, 0, face], [b, knee, face], [a, knee, face]); // the room face
    mesh.quad([a, knee, face], [b, knee, face], [b, top, lip], [a, top, lip]); // the chamfer
    mesh.quad([a, top, lip], [b, top, lip], [b, top, back], [a, top, back]); // the cap
    mesh.quad([b, 0, back], [a, 0, back], [a, top, back], [b, top, back]); // the outer face
    // the cut ends show the section: a reveal at every opening and at the run's ends
    const A: Vec3 = [a, 0, back], B: Vec3 = [a, top, back], C: Vec3 = [a, top, lip], D: Vec3 = [a, knee, face], E: Vec3 = [a, 0, face];
    mesh.tri(A, E, D); mesh.tri(A, D, C); mesh.tri(A, C, B);
    const A2: Vec3 = [b, 0, back], B2: Vec3 = [b, top, back], C2: Vec3 = [b, top, lip], D2: Vec3 = [b, knee, face], E2: Vec3 = [b, 0, face];
    mesh.tri(E2, A2, B2); mesh.tri(E2, B2, C2); mesh.tri(E2, C2, D2);
  }
}

/**
 * Framed glazing in an opening of the sheeting: a pressed-steel surround with a head flashing and a projecting sill,
 * glazing bars (mullions every `bay` and one transom) set back `setBack` from the room face, and a glass pane per
 * light into `glass` (or none). Frame members go to `frame`.
 */
export function addFramedGlazing(frame: HallMesh, glass: HallMesh | null, opening: HallOpening,
  { bay = 1.5, setBack = 0.06, transom = true }: Readonly<{ bay?: number; setBack?: number; transom?: boolean }> = {}): void {
  const { u0, u1, y0, y1 } = opening;
  const width = u1 - u0, height = y1 - y0, cu = (u0 + u1) / 2;
  const t = 0.07;
  // surround: jambs, head and the sill's sloped flashing proud of the wall
  frame.box([u0 + t / 2, (y0 + y1) / 2, 0.02], [t, height, 0.12]);
  frame.box([u1 - t / 2, (y0 + y1) / 2, 0.02], [t, height, 0.12]);
  frame.box([cu, y1 - t / 2, 0.02], [width, t, 0.12]);
  frame.box([cu, y1 + 0.03, 0.06], [width + 0.16, 0.04, 0.16]); // head flashing
  frame.box([cu, y0 + 0.025, 0.08], [width + 0.12, 0.05, 0.2]); // sill
  // glazing bars, set back from the room face
  const lights = Math.max(1, Math.round(width / bay));
  const bars = 0.05;
  for (let index = 1; index < lights; index += 1) {
    frame.box([u0 + (index * width) / lights, (y0 + y1) / 2, -setBack], [bars, height - 2 * t, 0.06]);
  }
  const midY = transom && height > 1.2 ? y0 + height * 0.55 : null;
  if (midY !== null) frame.box([cu, midY, -setBack], [width - 2 * t, bars, 0.06]);
  if (!glass) return;
  const rows: Array<[number, number]> = midY === null ? [[y0 + t, y1 - t]] : [[y0 + 0.05, midY - bars / 2], [midY + bars / 2, y1 - t]];
  for (let index = 0; index < lights; index += 1) {
    const a = u0 + (index * width) / lights + (index === 0 ? t : bars / 2);
    const b = u0 + ((index + 1) * width) / lights - (index === lights - 1 ? t : bars / 2);
    // the panes face the room (+w)
    for (const [r0, r1] of rows) glass.quad([a, r0, -setBack - 0.01], [b, r0, -setBack - 0.01], [b, r1, -setBack - 0.01], [a, r1, -setBack - 0.01]);
  }
}

/**
 * A personnel door: a pressed-steel frame round the opening, a leaf set back in it (open by `ajarRad` about its hinge
 * jamb) with a lever, a kick plate and a vision panel's frame, and a steel threshold strip.
 */
export function addPersonnelDoor(mesh: HallMesh, opening: HallOpening,
  { ajarRad = 0, frameColor, leafColor, kickColor }: Readonly<{ ajarRad?: number; frameColor: THREE.ColorRepresentation; leafColor: THREE.ColorRepresentation; kickColor: THREE.ColorRepresentation }>): void {
  const { u0, u1, y0, y1 } = opening;
  const width = u1 - u0, height = y1 - y0, cu = (u0 + u1) / 2;
  const f = 0.06;
  mesh.setColor(frameColor);
  mesh.box([u0 - f / 2, y0 + height / 2 + f / 2, 0.03], [f, height + f, 0.16], { skip: ['ny'] });
  mesh.box([u1 + f / 2, y0 + height / 2 + f / 2, 0.03], [f, height + f, 0.16], { skip: ['ny'] });
  mesh.box([cu, y1 + f / 2, 0.03], [width + 2 * f, f, 0.16]);
  mesh.box([cu, y0 + 0.005, 0.0], [width, 0.01, 0.2]);
  // the leaf hinged at u0, set back 0.05 from the frame's room face
  const saved = mesh.getFrame();
  const hinge = new THREE.Matrix4().makeTranslation(u0 + 0.01, 0, 0.02).multiply(new THREE.Matrix4().makeRotationY(ajarRad));
  mesh.setFrame(saved.clone().multiply(hinge));
  const lw = width - 0.02;
  mesh.setColor(leafColor);
  mesh.box([lw / 2, y0 + (height - 0.01) / 2, 0], [lw, height - 0.02, 0.045]);
  mesh.setColor(kickColor);
  mesh.box([lw - 0.12, y0 + 1.05, 0.05], [0.14, 0.03, 0.03]); // lever
  mesh.box([lw / 2, y0 + 0.16, 0.026], [lw - 0.06, 0.28, 0.006]); // kick plate
  mesh.box([lw / 2, y0 + 1.55, 0.026], [0.32, 0.5, 0.008]); // vision panel frame
  mesh.setFrame(saved);
}
