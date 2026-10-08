// src/world/maps/regional/fracture.ts — how a regional house breaks (the facades lane, 2026-10-07; docs/DESTRUCTION.md
// §16.3): the stage builders the house kits register (damage.ts), written against the anatomy alone, so a house the
// core's default kit described breaks the same way, and the extras a house plan carries (the wall's own texture
// mapping and weathering, damage.ts HouseDamagePlan) make the redrawn wall meet the intact one seamlessly.
//
// A breach (`breachHouse`): the core cuts a cylinder of the hole's radius out of the intact wall (StructureCut); the
// builder redraws, inside that cylinder, what the blow left standing and what it opened:
//   - masonry (stone, brick, rubble with a layout): whole blocks fall — the blocks fully inside the hole and near its
//     middle — and the blocks the cylinder only clipped are redrawn (their faces clipped to the circle, their texture
//     the wall's own: MasonryLayout.uv), so the hole steps along the courses and joints; the blocks round the gap show
//     their beds and ends through the wall's depth; the fallen blocks go as debris along the blow;
//   - render over a core (plaster over rubble, brick or earth): the render breaks back further than the core — a ragged
//     ring of render redrawn to the cut, its 3 cm lip, the core's face exposed between, the core's ragged returns;
//   - a framed wall (Fachwerk): the infill panels near the blow drop out whole, the rest of the infill and every member
//     inside the cut are redrawn, a member near the blow snaps with a splintered end; lath edges where a panel fell;
//   - planks, sheet: a ragged hole with splintered or torn returns;
//   - behind every breach the room it opens (anatomy.interior): a dark box the hole looks into, its floor at the storey
//     line, the floor slab's edge and the joist ends where the hole reaches them.
// Everything is drawn in the structure's body frame, in the building's own buckets with its UVs and weather tints,
// within the writers' caps; it draws only from damageRng(hole.seed).
import {
  damageRng,
  type BreachSpec, type DamageFace, type DamageMeshWriter, type DamagePieceWriter, type DamageRole, type DamageStageResult,
  type DebrisShape, type FractureSlot, type FrameMember, type MasonryLayout, type Rgb, type StructureDamageAnatomy, type Vec3,
} from '../../destructionKit.ts';

// ---------------------------------------------------------------------------------------------------- surfaces

/** A face's intact surface: the uv the wall's own parts carry, and the weathering they were painted with. */
export interface FaceSurface {
  uv(bucket: string, u: number, y: number, out: [number, number]): void;
  /** the weathering factor (damp at the foot) the intact wall carries in `bucket` at height y above the storey floor */
  weather(bucket: string, y: number): number;
  /**
   * The intact wall's own vertex colour in `bucket` at height y (its tint, damp, rain shadow and grime as the
   * weathering pass painted them, sampled at build time), or false: a redrawn skin then takes its tint × weather.
   */
  colour?(bucket: string, y: number, out: [number, number, number]): boolean;
}

/** What a house kit's anatomy carries for its builders beside the plan (damage.ts describeHouse sets it). */
export interface HouseDamageExtras {
  kind: 'house-damage';
  /** the face surfaces by section */
  surfaces: ReadonlyMap<number, FaceSurface>;
}

function extrasOf(anatomy: StructureDamageAnatomy): HouseDamageExtras | null {
  const k = anatomy.kitPlan as { damage?: HouseDamageExtras } | undefined;
  return k?.damage?.kind === 'house-damage' ? k.damage : null;
}

/** A plain world projection (a default anatomy's wall: no offset known). */
function fallbackSurface(face: DamageFace): FaceSurface {
  const alongX = Math.abs(face.out[2]) > 0.5;
  return {
    uv(bucket, u, y, out) {
      const d = bucket.includes('Stone') || bucket === 'stone' ? 0.5 : bucket.includes('lasters') || bucket.includes('laster') ? 0.42 : 0.55;
      const c = alongX ? face.origin[0] + face.u[0] * u : face.origin[2] + face.u[2] * u;
      out[0] = c * d; out[1] = (face.origin[1] + y) * d;
    },
    weather: () => 1,
  };
}

/** A member's own uv: its grain along it, across it in the structure wood tile's seam-free band (geometry.ts member). */
function memberUv(mm: FrameMember): (u: number, y: number, out: [number, number]) => void {
  const len = Math.hypot(mm.u1 - mm.u0, mm.y1 - mm.y0) || 1, au = (mm.u1 - mm.u0) / len, ay = (mm.y1 - mm.y0) / len;
  return (u, y, out) => {
    const du = u - mm.u0, dy = y - mm.y0;
    out[0] = (du * -ay + dy * au) * 0.55 + 0.1;
    out[1] = (du * au + dy * ay) * 0.55;
  };
}

// ---------------------------------------------------------------------------------------------------- emission

const UV: [number, number] = [0, 0];
const COL: [number, number, number] = [0, 0, 0];

/** The face frame: a point at (u, y above the storey floor, o out of the face) in the body frame. */
class FacePen {
  readonly f: DamageFace;
  readonly s: FaceSurface;
  constructor(f: DamageFace, s: FaceSurface) { this.f = f; this.s = s; }
  x(u: number, o: number): number { return this.f.origin[0] + this.f.u[0] * u + this.f.out[0] * o; }
  z(u: number, o: number): number { return this.f.origin[2] + this.f.u[2] * u + this.f.out[2] * o; }
  y(y: number): number { return this.f.origin[1] + y; }
}

/** Triangles through a DamageMeshWriter, one bucket and role a run, never past the writer's capacity. */
class Mesh {
  private readonly w: DamageMeshWriter;
  private open = false;
  /** this run redraws the intact wall's own skin: its vertices take the wall's sampled colour (FaceSurface.colour) */
  private sampled = false;
  /**
   * A blast's scorch round its hole, in face coordinates (u, y): every face vertex's colour × this (1 beyond it). A rim
   * sets it for its own redraw and clears it, so the soot is gone where the redraw meets the intact wall.
   */
  soot: ((u: number, y: number) => number) | null = null;
  constructor(w: DamageMeshWriter) { this.w = w; }
  begin(bucket: string, role: DamageRole, sampled = false): boolean {
    this.end();
    this.open = this.w.begin(bucket, role);
    this.sampled = sampled;
    return this.open;
  }
  end(): void {
    if (this.open) this.w.end();
    this.open = false;
  }
  fits(n: number): boolean {
    return this.open && this.room(n);
  }
  /** whether n more vertices fit the stage's cap (a run open or not) */
  room(n: number): boolean {
    return this.w.vertices + n <= this.w.capacity;
  }
  /**
   * A convex polygon on a face, its corners (u, y, o) counter-clockwise seen from the side `n` (body frame) points to;
   * its uv from the face surface for `bucket` (offset by `du`, `dv` for a return through the depth); its tint × k.
   */
  facePoly(pen: FacePen, bucket: string, pts: ReadonlyArray<readonly [number, number, number]>, n: Vec3, tint: Rgb, k: number,
    du = 0, dv = 0, uvOf?: (u: number, y: number, out: [number, number]) => void): boolean {
    if (pts.length < 3 || !this.fits(pts.length)) return false;
    const i0 = this.vertex(pen, bucket, pts[0], n, tint, k, du, dv, uvOf);
    let prev = this.vertex(pen, bucket, pts[1], n, tint, k, du, dv, uvOf);
    for (let i = 2; i < pts.length; i++) {
      const cur = this.vertex(pen, bucket, pts[i], n, tint, k, du, dv, uvOf);
      this.w.triangle(i0, prev, cur);
      prev = cur;
    }
    return true;
  }
  private vertex(pen: FacePen, bucket: string, p: readonly [number, number, number], n: Vec3, tint: Rgb, k: number, du: number, dv: number,
    uvOf?: (u: number, y: number, out: [number, number]) => void): number {
    if (uvOf) uvOf(p[0], p[1], UV); else pen.s.uv(bucket, p[0], p[1], UV);
    if (this.soot) k *= this.soot(p[0], p[1]);
    if (this.sampled && pen.s.colour?.(bucket, p[1], COL)) {
      return this.w.vertex(pen.x(p[0], p[2]), pen.y(p[1]), pen.z(p[0], p[2]), n[0], n[1], n[2], UV[0] + du, UV[1] + dv, COL[0] * k, COL[1] * k, COL[2] * k);
    }
    const kk = k * pen.s.weather(bucket, p[1]);
    return this.w.vertex(pen.x(p[0], p[2]), pen.y(p[1]), pen.z(p[0], p[2]), n[0], n[1], n[2], UV[0] + du, UV[1] + dv, tint[0] * kk, tint[1] * kk, tint[2] * kk);
  }
  /** One body-frame vertex of an open run (a smooth surface's grid: the heap's skin); its index, or -1 past the cap. */
  rawVertex(p: Vec3, n: Vec3, u: number, v: number, tint: Rgb): number {
    if (!this.fits(1)) return -1;
    return this.w.vertex(p[0], p[1], p[2], n[0], n[1], n[2], u, v, tint[0], tint[1], tint[2]);
  }
  rawTriangle(a: number, b: number, c: number): void {
    if (a >= 0 && b >= 0 && c >= 0) this.w.triangle(a, b, c);
  }
  /** A world-space quad with uvs projected by its normal's dominant axis at `d` repeats a metre (a heap's chunk, a plinth). */
  quadUv(a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3, density: number, tint: Rgb): boolean {
    if (!this.fits(4)) return false;
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    const uvOf = (p: Vec3): [number, number] => (ax >= ay && ax >= az ? [p[2] * density, p[1] * density] : ay >= az ? [p[0] * density, p[2] * density]
      : [p[0] * density, p[1] * density]);
    const v = [a, b, c, d].map((p) => { const [u, w] = uvOf(p); return this.w.vertex(p[0], p[1], p[2], n[0], n[1], n[2], u, w, tint[0], tint[1], tint[2]); });
    this.w.triangle(v[0], v[1], v[2]);
    this.w.triangle(v[0], v[2], v[3]);
    return true;
  }
  /** A world-space quad, uv along its first edge and up its second (a rafter's grain, a band of tiles), at the bucket's scale. */
  quadUvAlong(a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3, _span: number, tint: Rgb): boolean {
    if (!this.fits(4)) return false;
    const e1 = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]), e2 = norm3([d[0] - a[0], d[1] - a[1], d[2] - a[2]]);
    const v = [a, b, c, d].map((p) => {
      const rx = p[0] - a[0], ry = p[1] - a[1], rz = p[2] - a[2];
      const u = (rx * e1[0] + ry * e1[1] + rz * e1[2]) * 0.5, w = (rx * e2[0] + ry * e2[1] + rz * e2[2]) * 0.5;
      return this.w.vertex(p[0], p[1], p[2], n[0], n[1], n[2], u, w, tint[0], tint[1], tint[2]);
    });
    this.w.triangle(v[0], v[1], v[2]);
    this.w.triangle(v[0], v[2], v[3]);
    return true;
  }
  /** A world-space quad (a room's wall, a slab edge), uv by its own two axes. */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3, uvScale: number, tint: Rgb): boolean {
    if (!this.fits(4)) return false;
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), ad = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
    const v = [a, b, c, d].map((p, i) => this.w.vertex(p[0], p[1], p[2], n[0], n[1], n[2],
      (i === 1 || i === 2 ? ab : 0) * uvScale, (i >= 2 ? ad : 0) * uvScale, tint[0], tint[1], tint[2]));
    this.w.triangle(v[0], v[1], v[2]);
    this.w.triangle(v[0], v[2], v[3]);
    return true;
  }
}

/** The face's normal (out) and in-plane axes as body-frame vectors. */
function axes(f: DamageFace): { n: Vec3; inward: Vec3; u: Vec3; nu: Vec3; up: Vec3; down: Vec3 } {
  return {
    n: f.out, inward: [-f.out[0], -f.out[1], -f.out[2]], u: f.u, nu: [-f.u[0], -f.u[1], -f.u[2]], up: [0, 1, 0], down: [0, -1, 0],
  };
}

// ---------------------------------------------------------------------------------------------------- geometry

/** A rectangle clipped to a circle (u, y): the polygon of its part inside, counter-clockwise, or [] (Sutherland–Hodgman
 *  against the circle's inscribed 32-gon, close enough at a breach's scale). */
function rectInCircle(u0: number, y0: number, u1: number, y1: number, cu: number, cy: number, r: number): Array<[number, number]> {
  let poly: Array<[number, number]> = [[u0, y0], [u1, y0], [u1, y1], [u0, y1]];
  const N = 32;
  for (let i = 0; i < N && poly.length >= 3; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
    const p0: [number, number] = [cu + Math.cos(a0) * r, cy + Math.sin(a0) * r], p1: [number, number] = [cu + Math.cos(a1) * r, cy + Math.sin(a1) * r];
    // keep the left of the edge p0 → p1 (the circle's inside, counter-clockwise)
    const ex = p1[0] - p0[0], ey = p1[1] - p0[1];
    const side = (p: [number, number]) => ex * (p[1] - p0[1]) - ey * (p[0] - p0[0]);
    const out: Array<[number, number]> = [];
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length], sa = side(a), sb = side(b);
      if (sa >= 0) out.push(a);
      if ((sa >= 0) !== (sb >= 0)) {
        const t = sa / (sa - sb);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    poly = out;
  }
  return poly.length >= 3 ? poly : [];
}

/** Whether a face point lies in one of the face's openings (a breach never redraws wall over a door or a window). */
function inOpening(f: DamageFace, u: number, y: number): boolean {
  return f.openings.some((o) => Math.abs(u - o.u) < o.w / 2 && y > o.y0 && y < o.y0 + o.h);
}

/** A blast's soot: darkest at `inner` from the hole's middle, gone at `outer` (where the redraw meets the wall). */
function sootField(cu: number, cy: number, inner: number, outer: number): (u: number, y: number) => number {
  return (u, y) => {
    const t = Math.min(1, Math.max(0, (Math.hypot(u - cu, y - cy) - inner) / Math.max(1e-3, outer - inner)));
    return 1 - 0.5 * (1 - t * t * (3 - 2 * t));
  };
}

type FacePt = readonly [number, number, number];

/** A convex polygon on a face (u, y, o) clipped to the half-plane a·u + b·y ≤ c (Sutherland–Hodgman; o follows). */
function clipFacePoly(poly: readonly FacePt[], a: number, b: number, c: number): FacePt[] {
  const out: FacePt[] = [];
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k], q = poly[(k + 1) % poly.length];
    const sp = a * p[0] + b * p[1] - c, sq = a * q[0] + b * q[1] - c;
    if (sp <= 0) out.push(p);
    if ((sp <= 0) !== (sq <= 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]);
    }
  }
  return out;
}

function facePolyArea(poly: readonly FacePt[]): number {
  let a = 0;
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k], q = poly[(k + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

/**
 * A convex polygon of redrawn wall less the face's openings and kept to the face's width: the convex pieces left (a
 * breach beside a door redraws the wall up to its jamb, not over it, and leaves no gap where a whole quad would have
 * touched it).
 */
function wallPieces(f: DamageFace, poly: readonly FacePt[]): FacePt[][] {
  const half = f.width / 2;
  const inWidth = clipFacePoly(clipFacePoly(clipFacePoly(poly, 1, 0, half), -1, 0, half), 0, -1, 0.05);
  let pieces: FacePt[][] = inWidth.length >= 3 ? [inWidth] : [];
  for (const o of f.openings) {
    const u0 = o.u - o.w / 2, u1 = o.u + o.w / 2, y0 = o.y0, y1 = o.y0 + o.h;
    const next: FacePt[][] = [];
    for (const p of pieces) {
      let minU = Infinity, maxU = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const v of p) { minU = Math.min(minU, v[0]); maxU = Math.max(maxU, v[0]); minY = Math.min(minY, v[1]); maxY = Math.max(maxY, v[1]); }
      if (maxU <= u0 || minU >= u1 || maxY <= y0 || minY >= y1) { next.push(p); continue; }
      const mid = clipFacePoly(clipFacePoly(p, -1, 0, -u0), 1, 0, u1);
      for (const q of [clipFacePoly(p, 1, 0, u0), clipFacePoly(p, -1, 0, -u1), clipFacePoly(mid, 0, 1, y0), clipFacePoly(mid, 0, -1, -y1)]) {
        if (q.length >= 3 && facePolyArea(q) > 1e-5) next.push(q);
      }
    }
    pieces = next;
  }
  return pieces;
}

/**
 * The redrawn wall runs a hair past the cut and a hair proud of the intact face (OVERLAP, LIFT), so no crack opens along
 * the circle where the presentation's discard meets it (the two coincide in texture and tint).
 */
const OVERLAP = 0.012, LIFT = 0.0015;

function insideCircle(u: number, y: number, cu: number, cy: number, r: number): boolean {
  return (u - cu) * (u - cu) + (y - cy) * (y - cy) <= r * r;
}

/** A ragged radius round a circle: `base` × (1 ± `amp`) by angle, smooth, from the hole's own stream. */
function raggedRadius(rng: () => number, base: number, amp: number, lobes = 7): (theta: number) => number {
  const a = Array.from({ length: lobes }, () => rng() * 2 - 1), ph = Array.from({ length: lobes }, () => rng() * Math.PI * 2);
  return (t) => {
    let v = 0;
    for (let k = 0; k < lobes; k++) v += a[k] * Math.sin(t * (k + 2) + ph[k]) / (k + 1);
    return base * (1 + amp * Math.max(-1, Math.min(1, v * 0.7)));
  };
}

// ---------------------------------------------------------------------------------------------------- debris

/** Debris thrown along the blow: from (u, y, o) on the face, along the blow's direction, out of the wall and down. */
function throwPiece(out: DamagePieceWriter, pen: FacePen, hole: BreachSpec, rng: () => number, bucket: string, shape: DebrisShape,
  u: number, y: number, o: number, sx: number, sy: number, sz: number, tint: Rgb, speed: number): boolean {
  // the blow comes from outside: its direction points into the building; debris flies on with it, scattered
  const n = pen.f.out, dx = hole.dirX, dz = hole.dirZ;
  const along = speed * (0.6 + rng() * 0.8), spread = speed * 0.45;
  const vx = dx * along + (rng() - 0.5) * spread - n[0] * speed * 0.15;
  const vz = dz * along + (rng() - 0.5) * spread - n[2] * speed * 0.15;
  const vy = speed * (0.15 + rng() * 0.5);
  // a random orientation (a unit quaternion from three uniforms)
  const u1 = rng(), u2 = rng() * Math.PI * 2, u3 = rng() * Math.PI * 2, s1 = Math.sqrt(1 - u1), s2 = Math.sqrt(u1);
  return out.push(bucket, shape, Math.floor(rng() * 4), pen.x(u, o), pen.y(y), pen.z(u, o),
    s1 * Math.sin(u2), s1 * Math.cos(u2), s2 * Math.sin(u3), s2 * Math.cos(u3), sx, sy, sz, tint[0], tint[1], tint[2], vx, vy, vz);
}

function blowSpeed(hole: BreachSpec): number {
  return hole.cause === 'ram' ? 3 : hole.cause === 'kinetic' ? 6 : 9;
}

// ---------------------------------------------------------------------------------------------------- the room

/**
 * The room a breach opens: a dark box behind the hole (its back wall, the floor at the storey line, the ceiling, the
 * sides), so the hole never looks through the house; the floor slab's edge at the storey line and the joist ends at
 * the ceiling where the hole reaches them.
 */
function roomBehind(mesh: Mesh, anatomy: StructureDamageAnatomy, pen: FacePen, storeyIndex: number, cu: number, cy: number, r: number,
  depth: number): void {
  const f = pen.f, storey = anatomy.storeys[storeyIndex];
  const dark = anatomy.interior.color;
  const halfW = Math.min(f.width / 2, r + 0.6);
  const u0 = Math.max(-f.width / 2, cu - halfW), u1 = Math.min(f.width / 2, cu + halfW);
  const deep = anatomy.interior.open ? Math.max(2.5, Math.min(anatomy.w, anatomy.d) * 0.7) : 2.4;
  const back = -depth - deep, front = -depth + 0.001;
  const y0 = 0.02, y1 = Math.max(y0 + 1, f.height - 0.02);
  const P = (u: number, y: number, o: number): Vec3 => [pen.x(u, o), pen.y(y), pen.z(u, o)];
  const { n, u, nu, up, down } = axes(f);
  if (mesh.begin('dark', 'room')) {
    const floorTint: Rgb = [dark[0] * 2.2, dark[1] * 2.1, dark[2] * 2.0];
    // back wall (facing out), floor (up), ceiling (down), the two sides (facing each other)
    mesh.quad(P(u1, y0, back), P(u0, y0, back), P(u0, y1, back), P(u1, y1, back), n, 0.5, dark);
    mesh.quad(P(u0, y0, front), P(u1, y0, front), P(u1, y0, back), P(u0, y0, back), up, 0.5, floorTint);
    mesh.quad(P(u0, y1, back), P(u1, y1, back), P(u1, y1, front), P(u0, y1, front), down, 0.5, dark);
    mesh.quad(P(u0, y0, back), P(u0, y0, front), P(u0, y1, front), P(u0, y1, back), u, 0.5, dark);
    mesh.quad(P(u1, y0, front), P(u1, y0, back), P(u1, y1, back), P(u1, y1, front), nu, 0.5, dark);
  }
  // the floor slab's edge where the hole reaches the storey line, the joist ends where it reaches the ceiling
  const slab = storey.floor, above = anatomy.storeys[storeyIndex + 1]?.floor ?? null;
  const joist = (slot: FractureSlot | undefined) => slot ?? { material: 'timber', bucket: 'structureWood', tint: [0.36, 0.27, 0.19] as Rgb, thicknessM: 0.22, share: 1 };
  if (slab && cy - r < 0.35 && mesh.begin(joist(slab.structure).bucket, 'room')) {
    const t = slab.thicknessM, tint = joist(slab.structure).tint;
    const a0 = Math.max(u0, cu - Math.sqrt(Math.max(0, r * r - cy * cy))), a1 = Math.min(u1, cu + Math.sqrt(Math.max(0, r * r - cy * cy)));
    if (a1 - a0 > 0.1) mesh.quad(P(a0, -t, -0.02), P(a1, -t, -0.02), P(a1, 0, -0.02), P(a0, 0, -0.02), n, 0.55, tint);
  }
  if (above && cy + r > f.height - 0.4 && mesh.begin(joist(above.structure).bucket, 'room')) {
    const tint = joist(above.structure).tint, pitch = Math.max(0.3, above.joistPitchM), h = 0.2, wj = 0.12;
    for (let x = Math.ceil((cu - r) / pitch) * pitch; x < cu + r; x += pitch) {
      if (!insideCircle(x, f.height - h / 2, cu, cy, r * 0.95)) continue;
      // a joist end: its cut face toward the hole and its underside
      mesh.quad(P(x - wj / 2, f.height - h, -depth * 0.5), P(x + wj / 2, f.height - h, -depth * 0.5), P(x + wj / 2, f.height, -depth * 0.5),
        P(x - wj / 2, f.height, -depth * 0.5), n, 0.55, tint);
      mesh.quad(P(x - wj / 2, f.height - h, -depth * 0.5 - 1.2), P(x + wj / 2, f.height - h, -depth * 0.5 - 1.2), P(x + wj / 2, f.height - h, -depth * 0.5),
        P(x - wj / 2, f.height - h, -depth * 0.5), down, 0.55, [tint[0] * 0.7, tint[1] * 0.7, tint[2] * 0.7]);
    }
  }
}

// ---------------------------------------------------------------------------------------------------- the rims

/** Masonry: whole blocks fall along the layout's joints; the clipped blocks are redrawn; the gap's beds and ends show. */
function masonryRim(mesh: Mesh, pieces: DamagePieceWriter, pen: FacePen, m: MasonryLayout, slot: FractureSlot, hole: BreachSpec,
  rng: () => number, depth: number): boolean {
  const f = pen.f, cu = hole.u, cy = hole.y, r = hole.radiusM;
  const { n, u: uDir, nu, up, down } = axes(f);
  interface Block { u0: number; u1: number; y0: number; y1: number; gone: boolean; course: number }
  const blocks: Block[] = [];
  for (let k = 0; k < m.courses.length; k++) {
    const y0 = m.courses[k], y1 = m.courses[k + 1] ?? f.height;
    if (y1 <= cy - r || y0 >= cy + r) continue;
    const joints = m.joints(k);
    const edges = [-f.width / 2, ...joints, f.width / 2];
    for (let j = 0; j + 1 < edges.length; j++) {
      const u0 = edges[j], u1 = edges[j + 1];
      if (u1 <= cu - r || u0 >= cu + r) continue;
      // does the block reach into the circle at all?
      const nu0 = Math.max(u0, Math.min(cu, u1)), ny0 = Math.max(y0, Math.min(cy, y1));
      if (!insideCircle(nu0, ny0, cu, cy, r)) continue;
      const whole = insideCircle(u0, y0, cu, cy, r) && insideCircle(u1, y0, cu, cy, r) && insideCircle(u0, y1, cu, cy, r) && insideCircle(u1, y1, cu, cy, r);
      const dc = Math.hypot((u0 + u1) / 2 - cu, (y0 + y1) / 2 - cy) / r;
      blocks.push({ u0, u1, y0, y1, gone: whole && dc < 0.7 + rng() * 0.3, course: k });
    }
  }
  if (!blocks.some((b) => b.gone)) return false;
  const bucket = slot.bucket, tint = slot.tint;
  if (!mesh.begin(bucket, 'rim', true)) return true;
  // a blast scorches the stones round the gap (gone where the redrawn blocks meet the wall)
  mesh.soot = hole.cause === 'blast' ? sootField(cu, cy, r * 0.7, r) : null;
  // the blocks the cut clipped and the blow left: their faces, clipped to the circle
  for (const b of blocks) {
    if (b.gone) continue;
    const poly = rectInCircle(b.u0, b.y0, b.u1, b.y1, cu, cy, r + OVERLAP);
    if (poly.length) for (const piece of wallPieces(f, poly.map(([u, y]) => [u, y, LIFT] as const))) mesh.facePoly(pen, bucket, piece, n, tint, 1);
  }
  // the gap's sides: where a standing block meets a fallen one, its end or bed through the wall's depth
  const shade = 0.72;
  for (const b of blocks) {
    if (b.gone) continue;
    for (const g of blocks) {
      if (!g.gone) continue;
      if (g.course === b.course && Math.abs(g.u0 - b.u1) < 1e-4) {
        // the fallen block lies to b's +u side: b's +u end shows
        mesh.facePoly(pen, bucket, [[b.u1, b.y0, 0], [b.u1, b.y0, -depth], [b.u1, b.y1, -depth], [b.u1, b.y1, 0]], uDir, tint, shade, 0, 0);
      } else if (g.course === b.course && Math.abs(g.u1 - b.u0) < 1e-4) {
        mesh.facePoly(pen, bucket, [[b.u0, b.y0, -depth], [b.u0, b.y0, 0], [b.u0, b.y1, 0], [b.u0, b.y1, -depth]], nu, tint, shade, 0, 0);
      } else if (Math.abs(g.y0 - b.y1) < 1e-4) {
        const a0 = Math.max(b.u0, g.u0), a1 = Math.min(b.u1, g.u1);
        if (a1 - a0 > 1e-3) mesh.facePoly(pen, bucket, [[a0, b.y1, 0], [a1, b.y1, 0], [a1, b.y1, -depth], [a0, b.y1, -depth]], up, tint, shade * 1.05, 0, 0.11);
      } else if (Math.abs(g.y1 - b.y0) < 1e-4) {
        const a0 = Math.max(b.u0, g.u0), a1 = Math.min(b.u1, g.u1);
        if (a1 - a0 > 1e-3) mesh.facePoly(pen, bucket, [[a0, b.y0, -depth], [a1, b.y0, -depth], [a1, b.y0, 0], [a0, b.y0, 0]], down, tint, shade * 0.8, 0, 0.11);
      }
    }
  }
  mesh.soot = null;
  mesh.end();
  // the fallen blocks: debris along the blow (a brick wall's bricks, a stone wall's blocks)
  const shape: DebrisShape = slot.material === 'brick' ? 'brick' : slot.material === 'rubble' ? 'stone' : 'block';
  const speed = blowSpeed(hole);
  for (const b of blocks) {
    if (!b.gone) continue;
    if (!throwPiece(pieces, pen, hole, rng, bucket, shape, (b.u0 + b.u1) / 2, (b.y0 + b.y1) / 2, -depth * 0.3,
      b.u1 - b.u0, b.y1 - b.y0, Math.min(depth, 0.3), tint, speed)) break;
  }
  return true;
}

/**
 * Render over a core (or a ragged hole in one material): the skin breaks back to a ragged edge short of the cut, the
 * core's face shows between it and the core's own ragged edge; the cut's ring of skin is redrawn to meet the intact wall.
 */
function raggedRim(mesh: Mesh, pieces: DamagePieceWriter, pen: FacePen, skin: FractureSlot, core: FractureSlot | null, hole: BreachSpec,
  rng: () => number, depth: number): number {
  const cu = hole.u, cy = hole.y, r = hole.radiusM;
  const N = 32;
  // the cut reaches past the hole so the skin can break back unevenly round it; inside the cut it is redrawn to its
  // ragged edge (a render spalls well past the core's hole, a single skin less)
  const R = r * (core ? 1.28 : 1.12);
  // a blast scorches the skin round its hole, darkest at the break, gone where the redrawn ring meets the wall
  mesh.soot = hole.cause === 'blast' ? sootField(cu, cy, r * (core ? 1.0 : 0.88), R) : null;
  const skinRag = raggedRadius(rng, r * (core ? 1.02 : 0.9), core ? 0.2 : 0.14);
  const skinEdge = (th: number) => Math.min(R - 0.02, skinRag(th));
  const coreEdge = raggedRadius(rng, r * 0.72, 0.22);
  const t = core ? Math.min(0.05, skin.thicknessM) : 0;
  const { n } = axes(pen.f);
  const at = (i: number, rad: number, o: number): [number, number, number] => {
    const th = (i / N) * Math.PI * 2;
    return [cu + Math.cos(th) * rad, cy + Math.sin(th) * rad, o];
  };
  const inFace = (p: readonly [number, number, number]) => p[0] >= -pen.f.width / 2 - 1e-3 && p[0] <= pen.f.width / 2 + 1e-3 && p[1] >= -0.05;
  // the skin's ring, from its broken edge out to the cut (meeting the intact wall)
  if (mesh.begin(skin.bucket, 'rim', true)) {
    for (let i = 0; i < N; i++) {
      const th0 = (i / N) * Math.PI * 2, th1 = ((i + 1) / N) * Math.PI * 2;
      const q = [at(i, R + OVERLAP, LIFT), at(i + 1, R + OVERLAP, LIFT), at(i + 1, skinEdge(th1), LIFT), at(i, skinEdge(th0), LIFT)];
      for (const piece of wallPieces(pen.f, [q[0], q[3], q[2], q[1]])) mesh.facePoly(pen, skin.bucket, piece, n, skin.tint, 1);
    }
    // the skin's lip: its broken edge through its own thickness (or, alone, through the wall)
    const lip = core ? t : depth;
    for (let i = 0; i < N; i++) {
      const th0 = (i / N) * Math.PI * 2, th1 = ((i + 1) / N) * Math.PI * 2;
      const a = at(i, skinEdge(th0), 0), b = at(i + 1, skinEdge(th1), 0);
      if (!inFace(a) || !inFace(b) || inOpening(pen.f, a[0], a[1]) || inOpening(pen.f, b[0], b[1])) continue;
      const mid = (th0 + th1) / 2, nIn = inwardNormal(pen, mid);
      mesh.facePoly(pen, skin.bucket, [[a[0], a[1], 0], [a[0], a[1], -lip], [b[0], b[1], -lip], [b[0], b[1], 0]], nIn, skin.tint, 0.78, 0, 0.07);
    }
  }
  if (core && mesh.begin(core.bucket, 'rim')) {
    // the core's face between the skin's edge and its own, a skin's thickness back
    for (let i = 0; i < N; i++) {
      const th0 = (i / N) * Math.PI * 2, th1 = ((i + 1) / N) * Math.PI * 2;
      const q = [at(i, skinEdge(th0), -t), at(i + 1, skinEdge(th1), -t), at(i + 1, coreEdge(th1), -t), at(i, coreEdge(th0), -t)];
      for (const piece of wallPieces(pen.f, [q[0], q[3], q[2], q[1]])) mesh.facePoly(pen, core.bucket, piece, n, core.tint, 0.86);
    }
    // its ragged returns through the wall
    for (let i = 0; i < N; i++) {
      const th0 = (i / N) * Math.PI * 2, th1 = ((i + 1) / N) * Math.PI * 2;
      const a = at(i, coreEdge(th0), -t), b = at(i + 1, coreEdge(th1), -t);
      if (!inFace(a) || !inFace(b) || inOpening(pen.f, a[0], a[1]) || inOpening(pen.f, b[0], b[1])) continue;
      const nIn = inwardNormal(pen, (th0 + th1) / 2);
      mesh.facePoly(pen, core.bucket, [[a[0], a[1], -t], [a[0], a[1], -depth], [b[0], b[1], -depth], [b[0], b[1], -t]], nIn, core.tint, 0.7, 0, 0.13);
    }
  }
  mesh.soot = null;
  mesh.end();
  // poured concrete: the reinforcement left in the break. Two mats of bars at 20 cm each way near the wall's faces (one
  // mat in a thin wall); where a bar crosses the hole the blow stripped the concrete off it: a short span is left whole,
  // bowed with the blow, a longer one snapped into stubs bent along it. The grid does not centre on the hole.
  const concrete = skin.material === 'concrete' ? skin : core?.material === 'concrete' ? core : null;
  if (concrete && mesh.begin('structureMetal', 'rim')) {
    const rust: Rgb = [0.2, 0.11, 0.07], BAR = 0.016, SPACING = 0.2, MAX_BARS = 40;
    const edgeOf = core ? coreEdge : skinEdge;
    const push = hole.dirX * pen.f.out[0] + hole.dirZ * pen.f.out[2] <= 0 ? -1 : 1; // into the wall, or out of it
    const mats = depth > 0.16 ? [-0.05, -depth + 0.05] : [-depth / 2];
    const bend = (o: number, k: number) => Math.max(-depth - 0.03, Math.min(0.03, o + push * k));
    // half the chord a grid line (offset `off` across it) cuts through the ragged edge on side s; 0 when it misses
    const halfChord = (off: number, s: number, vertical: boolean): number => {
      let h = Math.sqrt(Math.max(0, r * r - off * off));
      for (let pass = 0; pass < 2; pass++) {
        const rad = edgeOf(vertical ? Math.atan2(s * h, off) : Math.atan2(off, s * h));
        h = rad > Math.abs(off) ? Math.sqrt(rad * rad - off * off) : 0;
      }
      return h;
    };
    const P = (vertical: boolean, off: number, along: number, o: number, sag = 0): Vec3 => {
      const u = vertical ? cu + off : cu + along, y = vertical ? cy + along : cy + off;
      return [pen.x(u, o), pen.y(y) - sag, pen.z(u, o)];
    };
    const onWall = (vertical: boolean, off: number, along: number) => {
      const u = vertical ? cu + off : cu + along, y = vertical ? cy + along : cy + off;
      return inFace([u, y, 0]) && !inOpening(pen.f, u, y);
    };
    // the crossings first, so a large hole thins its bars evenly rather than running out on one side
    const lines: Array<[boolean, number, number, number, number]> = []; // vertical, off, o, the two half chords
    for (const o of mats) {
      const phase = rng() * SPACING;
      for (const vertical of [true, false]) {
        for (let off = phase - Math.ceil((r + phase) / SPACING) * SPACING; off < r; off += SPACING) {
          const hi = halfChord(off, 1, vertical), lo = halfChord(off, -1, vertical);
          if (hi > 0.02 && lo > 0.02) lines.push([vertical, off, o, hi, lo]);
        }
      }
    }
    const keep = Math.min(0.85, MAX_BARS / Math.max(1, lines.length));
    for (const [vertical, off, o, hi, lo] of lines) {
      if (rng() >= keep) continue;
      const droop = vertical ? 0 : 0.04; // a horizontal bar sags under its own weight
      if (hi + lo < 0.75 && rng() < 0.5) {
        // a short span left whole, bowed with the blow
        const a = P(vertical, off, hi + 0.03, o), b = P(vertical, off, -lo - 0.03, o);
        const m = P(vertical, off, (hi - lo) / 2, bend(o, 0.04 + rng() * 0.1), droop * rng());
        if (onWall(vertical, off, hi) && onWall(vertical, off, -lo)) { beamBetween(mesh, a, m, BAR, BAR, pen.f.out, rust); beamBetween(mesh, m, b, BAR, BAR, pen.f.out, rust); }
        continue;
      }
      // snapped: a stub from each side, bent along the blow
      for (const [edge, dir] of [[hi, -1], [-lo, 1]] as const) {
        if (rng() < 0.25 || !onWall(vertical, off, edge)) continue;
        const reach = Math.min(Math.abs(edge) * 0.85, 0.06 + rng() * 0.3);
        const a = P(vertical, off, edge - dir * 0.03, o), b = P(vertical, off, edge + dir * reach, bend(o, 0.02 + rng() * 0.12), droop * reach * rng() * 3);
        beamBetween(mesh, a, b, BAR, BAR, pen.f.out, rust);
      }
    }
  }
  // the pieces: plates of render, chunks of the core, along the blow
  const speed = blowSpeed(hole), count = Math.min(24, Math.round(6 + r * 14));
  for (let k = 0; k < count; k++) {
    const th = rng() * Math.PI * 2, rad = Math.sqrt(rng()) * r * 0.8;
    const fromCore = core && k % 3 !== 0;
    const slot = fromCore ? core! : skin;
    const shape: DebrisShape = slot.material === 'plaster' ? 'plate' : slot.material === 'adobe' ? 'clod' : slot.material === 'brick' ? 'brick'
      : slot.material === 'plank' ? 'splinter' : slot.material === 'metal' ? 'sheet' : 'chunk';
    const s = 0.06 + rng() * 0.16;
    if (slot.material === 'concrete' && k % 5 === 4) {
      // a cut length of bar torn out with the concrete
      if (!throwPiece(pieces, pen, hole, rng, 'structureMetal', 'rebar', cu + Math.cos(th) * rad, cy + Math.sin(th) * rad, -0.05,
        0.016, 0.016, 0.2 + rng() * 0.35, [0.2, 0.11, 0.07], speed)) break;
      continue;
    }
    if (!throwPiece(pieces, pen, hole, rng, slot.bucket, shape, cu + Math.cos(th) * rad, cy + Math.sin(th) * rad, fromCore ? -depth * 0.4 : 0,
      s, shape === 'plate' ? s * 0.18 : s * 0.7, s * 0.8, slot.tint, speed)) break;
  }
  return R;
}

/** The normal of a hole's side at angle `th` round its centre, facing into the hole (body frame). */
function inwardNormal(pen: FacePen, th: number): Vec3 {
  const cu = -Math.cos(th), cy = -Math.sin(th), U = pen.f.u;
  const v: Vec3 = [U[0] * cu, cy, U[2] * cu];
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * A framed wall: the infill panels near the blow drop out whole — the cut widens to take them (the returned radius) —
 * and the rest of the infill and every member inside the cut are redrawn; a member near the blow or across a fallen
 * panel snaps (its stubs end in a splintered, paler cap); a fallen panel's edges show the lath. A panel is the
 * rectangle between the nearest posts and rails round a point (braces stay members).
 */
function framedRim(mesh: Mesh, pieces: DamagePieceWriter, pen: FacePen, timber: FractureSlot, infill: FractureSlot, hole: BreachSpec,
  rng: () => number): number {
  const f = pen.f, cu = hole.u, cy = hole.y, r = hole.radiusM;
  const members = f.members;
  const { n, up, down } = axes(f);
  const vertical = (m: FrameMember) => Math.abs(m.u1 - m.u0) < 1e-3, level = (m: FrameMember) => Math.abs(m.y1 - m.y0) < 1e-3;
  const posts = members.filter(vertical), rails = members.filter(level);
  /** the panel round (u, y): out to the nearest post sides and rail sides that bound it */
  const panelAt = (u: number, y: number): { u0: number; u1: number; y0: number; y1: number } | null => {
    let u0 = -f.width / 2, u1 = f.width / 2, y0 = 0, y1 = f.height;
    for (const p of posts) {
      const lo = Math.min(p.y0, p.y1), hi = Math.max(p.y0, p.y1);
      if (y < lo || y > hi) continue;
      if (Math.abs(u - p.u0) < p.widthM / 2) return null;
      if (p.u0 < u) u0 = Math.max(u0, p.u0 + p.widthM / 2); else u1 = Math.min(u1, p.u0 - p.widthM / 2);
    }
    for (const q of rails) {
      const lo = Math.min(q.u0, q.u1), hi = Math.max(q.u0, q.u1);
      if (u < lo || u > hi) continue;
      if (Math.abs(y - q.y0) < q.widthM / 2) return null;
      if (q.y0 < y) y0 = Math.max(y0, q.y0 + q.widthM / 2); else y1 = Math.min(y1, q.y0 - q.widthM / 2);
    }
    return u1 - u0 > 0.05 && y1 - y0 > 0.05 ? { u0, u1, y0, y1 } : null;
  };
  // the panels the blow reaches: sampled across its circle, each once
  const panels = new Map<string, { u0: number; u1: number; y0: number; y1: number; gone: boolean }>();
  for (let su = cu - r; su <= cu + r; su += 0.12) for (let sy = cy - r; sy <= cy + r; sy += 0.12) {
    if (!insideCircle(su, sy, cu, cy, r)) continue;
    const p = panelAt(su, sy);
    if (!p) continue;
    const key = `${p.u0.toFixed(3)}|${p.y0.toFixed(3)}`;
    if (panels.has(key)) continue;
    const near = Math.hypot((p.u0 + p.u1) / 2 - cu, (p.y0 + p.y1) / 2 - cy) / r;
    panels.set(key, { ...p, gone: near < 0.6 + rng() * 0.3 && (p.u1 - p.u0) * (p.y1 - p.y0) < 4 });
  }
  // the cut widens to take every fallen panel whole (within reason)
  let R = r;
  for (const p of panels.values()) {
    if (!p.gone) continue;
    for (const [u, y] of [[p.u0, p.y0], [p.u1, p.y0], [p.u0, p.y1], [p.u1, p.y1]]) R = Math.max(R, Math.hypot(u - cu, y - cy) + 0.02);
  }
  R = Math.min(R, r * 1.8);
  const gone = [...panels.values()].filter((p) => p.gone);
  const inGone = (u: number, y: number) => gone.some((p) => u > p.u0 && u < p.u1 && y > p.y0 && y < p.y1);
  const infillT = Math.min(0.14, infill.thicknessM);
  // the infill inside the cut: every cell between the frame's lines that is not a member and not fallen, clipped
  const us = new Set<number>([cu - R, cu + R]), ys = new Set<number>([cy - R, cy + R]);
  for (const p of posts) if (p.u0 > cu - R && p.u0 < cu + R) { us.add(p.u0 - p.widthM / 2); us.add(p.u0 + p.widthM / 2); }
  for (const q of rails) if (q.y0 > cy - R && q.y0 < cy + R) { ys.add(q.y0 - q.widthM / 2); ys.add(q.y0 + q.widthM / 2); }
  const U = [...us].filter((v) => v >= cu - R - 1e-6 && v <= cu + R + 1e-6).sort((x, y) => x - y);
  const Y = [...ys].filter((v) => v >= cy - R - 1e-6 && v <= cy + R + 1e-6).sort((x, y) => x - y);
  const onMember = (u: number, y: number) => members.some((mm) => mm.role !== 'brace' && distToSegment(u, y, mm) < mm.widthM / 2 - 1e-4);
  if (mesh.begin(infill.bucket, 'rim', true)) {
    for (let i = 0; i + 1 < U.length; i++) for (let j = 0; j + 1 < Y.length; j++) {
      const u0 = U[i], u1 = U[i + 1], y0 = Y[j], y1 = Y[j + 1], mu = (u0 + u1) / 2, my = (y0 + y1) / 2;
      if (u1 - u0 < 0.01 || y1 - y0 < 0.01 || onMember(mu, my) || inGone(mu, my) || inOpening(f, mu, my)) continue;
      if (mu < -f.width / 2 || mu > f.width / 2 || my < 0 || my > f.height) continue;
      const poly = rectInCircle(u0, y0, u1, y1, cu, cy, R + OVERLAP);
      if (poly.length) mesh.facePoly(pen, infill.bucket, poly.map(([u, y]) => [u, y, LIFT] as const), n, infill.tint, 1);
    }
    // a fallen panel: the lath and the daub's broken edge round it, inside its frame
    const lath: Rgb = [0.45, 0.36, 0.25];
    for (const p of gone) {
      mesh.facePoly(pen, infill.bucket, [[p.u0, p.y0, 0], [p.u1, p.y0, 0], [p.u1, p.y0, -infillT], [p.u0, p.y0, -infillT]], up, lath, 0.62);
      mesh.facePoly(pen, infill.bucket, [[p.u0, p.y1, -infillT], [p.u1, p.y1, -infillT], [p.u1, p.y1, 0], [p.u0, p.y1, 0]], down, lath, 0.5);
      const { u: ud, nu } = axes(f);
      mesh.facePoly(pen, infill.bucket, [[p.u0, p.y0, -infillT], [p.u0, p.y0, 0], [p.u0, p.y1, 0], [p.u0, p.y1, -infillT]], ud, lath, 0.56);
      mesh.facePoly(pen, infill.bucket, [[p.u1, p.y0, 0], [p.u1, p.y0, -infillT], [p.u1, p.y1, -infillT], [p.u1, p.y1, 0]], nu, lath, 0.56);
      // the daub falls in slabs along the blow
      const slabs = Math.min(3, 1 + Math.floor((p.u1 - p.u0) * (p.y1 - p.y0) * 2));
      for (let k = 0; k < slabs; k++) {
        throwPiece(pieces, pen, hole, rng, infill.bucket, 'plate', p.u0 + (p.u1 - p.u0) * (k + 0.5) / slabs, (p.y0 + p.y1) / 2, -infillT / 2,
          (p.u1 - p.u0) / slabs, (p.y1 - p.y0) * 0.8, infillT, infill.tint, blowSpeed(hole));
      }
    }
  }
  // the members inside the cut: whole, or snapped near the blow or across a fallen panel
  if (mesh.begin(timber.bucket, 'rim')) {
    for (const mm of members) {
      if (distToSegment(cu, cy, mm) > R + mm.widthM) continue;
      const len = Math.hypot(mm.u1 - mm.u0, mm.y1 - mm.y0);
      if (len < 1e-3) continue;
      const au = (mm.u1 - mm.u0) / len, ay = (mm.y1 - mm.y0) / len;
      const [t0, t1] = segmentInCircle(mm, cu, cy, R);
      if (t1 - t0 < 1e-3) continue;
      // the point of the member nearest the blow, and whether it lies across a fallen panel
      const tc = Math.max(t0, Math.min(t1, (cu - mm.u0) * au + (cy - mm.y0) * ay));
      const crossGone = mm.role === 'brace' && inGone(mm.u0 + au * tc, mm.y0 + ay * tc);
      const snap = crossGone || (distToSegment(cu, cy, mm) < r * 0.4 && rng() < 0.75);
      if (snap) {
        const gap = 0.1 + rng() * 0.3;
        const a = Math.max(t0, tc - gap * (0.3 + rng())), b = Math.min(t1, tc + gap * (0.3 + rng()));
        if (a - t0 > 0.02) memberBox(mesh, pen, timber, mm, au, ay, t0, a, false, true, n, rng);
        if (t1 - b > 0.02) memberBox(mesh, pen, timber, mm, au, ay, b, t1, true, false, n, rng);
        throwPiece(pieces, pen, hole, rng, timber.bucket, 'beam', mm.u0 + au * tc, mm.y0 + ay * tc, mm.depthM / 2, Math.max(0.15, b - a), mm.widthM, mm.depthM,
          timber.tint, blowSpeed(hole));
        for (let k = 0; k < 2; k++) {
          throwPiece(pieces, pen, hole, rng, timber.bucket, 'splinter', mm.u0 + au * tc, mm.y0 + ay * tc, mm.depthM / 2, 0.04, 0.25 + rng() * 0.3, 0.03,
            timber.tint, blowSpeed(hole) * 1.2);
        }
      } else memberBox(mesh, pen, timber, mm, au, ay, t0, t1, false, false, n, rng);
    }
  }
  mesh.end();
  return R;
}

/** A member's run from s0 to s1 along it: its face and two sides, and a splintered cap at a broken end. */
function memberBox(mesh: Mesh, pen: FacePen, slot: FractureSlot, mm: FrameMember, au: number, ay: number, s0: number, s1: number,
  capStart: boolean, capEnd: boolean, n: Vec3, rng: () => number): void {
  const hw = mm.widthM / 2, depth = mm.depthM, o1 = depth - 0.02, o0 = -0.02;
  const nu = -ay, ny = au;
  const P = (s: number, w: number, o: number): [number, number, number] => [mm.u0 + au * s + nu * w, mm.y0 + ay * s + ny * w, o];
  // member UVs: grain along it (the structure wood's 0.55 uv/m), across it offset into the tile's seam-free band
  const muv = memberUv(mm);
  mesh.facePoly(pen, slot.bucket, [P(s0, -hw, o1), P(s1, -hw, o1), P(s1, hw, o1), P(s0, hw, o1)], n, slot.tint, 1, 0, 0, muv);
  const U = pen.f.u;
  const sideN = (k: number): Vec3 => { const v: Vec3 = [U[0] * nu * k, ny * k, U[2] * nu * k]; const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  mesh.facePoly(pen, slot.bucket, [P(s0, hw, o0), P(s0, hw, o1), P(s1, hw, o1), P(s1, hw, o0)], sideN(1), slot.tint, 0.82, 0.03, 0, muv);
  mesh.facePoly(pen, slot.bucket, [P(s1, -hw, o0), P(s1, -hw, o1), P(s0, -hw, o1), P(s0, -hw, o0)], sideN(-1), slot.tint, 0.82, 0.03, 0, muv);
  // a broken end: the fresh wood paler, its cap jagged in three teeth
  for (const [at, sign, on] of [[s0, -1, capStart], [s1, 1, capEnd]] as Array<[number, number, boolean]>) {
    if (!on) continue;
    const pale: Rgb = [Math.min(1, slot.tint[0] * 1.5 + 0.12), Math.min(1, slot.tint[1] * 1.45 + 0.1), Math.min(1, slot.tint[2] * 1.35 + 0.07)];
    const capN: Vec3 = (() => { const v: Vec3 = [U[0] * au * sign, ay * sign, U[2] * au * sign]; const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; })();
    const teeth = [-hw, -hw / 3, hw / 3, hw];
    for (let k = 0; k + 1 < teeth.length; k++) {
      const jut = sign * (0.02 + rng() * 0.07);
      const a = P(at, teeth[k], o0), b = P(at, teeth[k + 1], o0), c = P(at + jut, (teeth[k] + teeth[k + 1]) / 2, (o0 + o1) / 2), d = P(at, teeth[k], o1), e = P(at, teeth[k + 1], o1);
      if (sign > 0) {
        mesh.facePoly(pen, slot.bucket, [a, b, c], capN, pale, 0.9, 0, 0, muv);
        mesh.facePoly(pen, slot.bucket, [b, e, c], capN, pale, 0.95, 0, 0, muv);
        mesh.facePoly(pen, slot.bucket, [e, d, c], capN, pale, 1, 0, 0, muv);
        mesh.facePoly(pen, slot.bucket, [d, a, c], capN, pale, 0.9, 0, 0, muv);
      } else {
        mesh.facePoly(pen, slot.bucket, [b, a, c], capN, pale, 0.9, 0, 0, muv);
        mesh.facePoly(pen, slot.bucket, [e, b, c], capN, pale, 0.95, 0, 0, muv);
        mesh.facePoly(pen, slot.bucket, [d, e, c], capN, pale, 1, 0, 0, muv);
        mesh.facePoly(pen, slot.bucket, [a, d, c], capN, pale, 0.9, 0, 0, muv);
      }
    }
  }
}

function distToSegment(u: number, y: number, mm: FrameMember): number {
  const du = mm.u1 - mm.u0, dy = mm.y1 - mm.y0, l2 = du * du + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((u - mm.u0) * du + (y - mm.y0) * dy) / l2)) : 0;
  return Math.hypot(u - (mm.u0 + du * t), y - (mm.y0 + dy * t));
}

/** The span [t0, t1] (metres along the member from its start) inside a circle, or [0, 0]. */
function segmentInCircle(mm: FrameMember, cu: number, cy: number, r: number): [number, number] {
  const len = Math.hypot(mm.u1 - mm.u0, mm.y1 - mm.y0);
  const au = (mm.u1 - mm.u0) / len, ay = (mm.y1 - mm.y0) / len;
  const fu = mm.u0 - cu, fy = mm.y0 - cy;
  const b = fu * au + fy * ay, c = fu * fu + fy * fy - r * r, disc = b * b - c;
  if (disc <= 0) return [0, 0];
  const s = Math.sqrt(disc);
  const t0 = Math.max(0, -b - s), t1 = Math.min(len, -b + s);
  return t1 > t0 ? [t0, t1] : [0, 0];
}

// ---------------------------------------------------------------------------------------------------- breach

/** The hole's face: its storey's face by name. */
function faceOf(anatomy: StructureDamageAnatomy, hole: BreachSpec): DamageFace | null {
  return anatomy.storeys[hole.storey]?.faces.find((f) => f.name === hole.face) ?? null;
}

/** A breach in a house's wall (DESTRUCTION.md §16.3 Breach). */
export function breachHouse(anatomy: StructureDamageAnatomy, hole: BreachSpec, out: { mesh: DamageMeshWriter; pieces: DamagePieceWriter }): DamageStageResult {
  const f = faceOf(anatomy, hole);
  if (!f || !f.layers.length) return { cuts: [], hides: [] };
  const rng = damageRng(hole.seed);
  const extras = extrasOf(anatomy);
  const pen = new FacePen(f, extras?.surfaces.get(f.section) ?? fallbackSurface(f));
  const mesh = new Mesh(out.mesh);
  const layers = f.layers;
  const depth = Math.max(0.16, Math.min(0.6, layers.reduce((a, l) => a + l.thicknessM, 0)));
  const outer = layers[0];
  let drawn = false, radius = hole.radiusM;
  if (f.members.length && layers.some((l) => l.material === 'infill')) {
    radius = framedRim(mesh, out.pieces, pen, outer.material === 'timber' ? outer : layers.find((l) => l.material === 'timber')!,
      layers.find((l) => l.material === 'infill')!, hole, rng);
    drawn = true;
  } else if (f.masonry && (outer.material === 'stone' || outer.material === 'brick' || outer.material === 'rubble')) {
    drawn = masonryRim(mesh, out.pieces, pen, f.masonry, outer, hole, rng, depth);
  }
  if (!drawn) radius = raggedRim(mesh, out.pieces, pen, outer, layers[1] ?? null, hole, rng, depth);
  roomBehind(mesh, anatomy, pen, hole.storey, hole.u, hole.y, radius, depth);
  mesh.end();
  const cx = pen.x(hole.u, 0), cz = pen.z(hole.u, 0);
  return {
    cuts: [{ x: cx, y: pen.y(hole.y), z: cz, nx: f.out[0], nz: f.out[2], radiusM: radius, depthM: depth + 0.05 }],
    hides: [],
  };
}

// ---------------------------------------------------------------------------------------------------- damaged

/**
 * A spall: the skin (a render, a panel's daub) blown off a patch of wall down to its core — a shallow cut of the skin's
 * thickness, the core's face across the patch a skin's depth back, the skin's ragged lip round it and its ring redrawn
 * out to the cut (DESTRUCTION.md §16.3 Damaged).
 */
function spall(mesh: Mesh, pen: FacePen, skin: FractureSlot, core: FractureSlot, cu: number, cy: number, r: number, rng: () => number):
  { x: number; y: number; z: number; nx: number; nz: number; radiusM: number; depthM: number; outsideM: number } | null {
  const f = pen.f;
  if (cu - r < -f.width / 2 || cu + r > f.width / 2 || cy - r < 0.05 || cy + r > f.height - 0.05) return null;
  if (f.openings.some((o) => Math.abs(cu - o.u) < o.w / 2 + r && cy + r > o.y0 && cy - r < o.y0 + o.h)) return null;
  const N = 18, R = r * 1.12, t = Math.max(0.015, Math.min(0.04, skin.thicknessM));
  // a spall is long and ragged, not round: an ellipse at its own slant under a deep ragged edge
  const rag = raggedRadius(rng, r * 0.8, 0.42, 6), aspect = 0.55 + rng() * 0.35, slant = rng() * Math.PI;
  const edge = (th: number) => Math.min(R - 0.02, rag(th) * aspect / Math.sqrt((Math.cos(th - slant) * aspect) ** 2 + Math.sin(th - slant) ** 2));
  const { n } = axes(f);
  const at = (i: number, rad: number, o: number): [number, number, number] => {
    const th = (i / N) * Math.PI * 2;
    return [cu + Math.cos(th) * rad, cy + Math.sin(th) * rad, o];
  };
  if (!mesh.room(N * 10)) return null;
  if (mesh.begin(skin.bucket, 'rim', true)) {
    for (let i = 0; i < N; i++) {
      const th0 = (i / N) * Math.PI * 2, th1 = ((i + 1) / N) * Math.PI * 2;
      const q = [at(i, R + OVERLAP, LIFT), at(i + 1, R + OVERLAP, LIFT), at(i + 1, edge(th1), LIFT), at(i, edge(th0), LIFT)];
      mesh.facePoly(pen, skin.bucket, [q[0], q[3], q[2], q[1]], n, skin.tint, 1);
      const a = at(i, edge(th0), 0), b = at(i + 1, edge(th1), 0);
      mesh.facePoly(pen, skin.bucket, [[a[0], a[1], 0], [a[0], a[1], -t], [b[0], b[1], -t], [b[0], b[1], 0]], inwardNormal(pen, (th0 + th1) / 2), skin.tint, 0.8, 0, 0.05);
    }
  }
  if (mesh.begin(core.bucket, 'rim')) {
    // the core's face across the patch: a fan from the middle to the ragged edge
    const centre: [number, number, number] = [cu, cy, -t];
    for (let i = 0; i < N; i++) {
      const th0 = (i / N) * Math.PI * 2, th1 = ((i + 1) / N) * Math.PI * 2;
      mesh.facePoly(pen, core.bucket, [centre, at(i, edge(th0), -t), at(i + 1, edge(th1), -t)], n, core.tint, 0.9);
    }
  }
  mesh.end();
  // only the skin goes: a downpipe, a sign or a timber proud of the wall over the patch stays (the seam's 0.3 m default is
  // a breach's, taking the sills and surrounds inside its hole)
  return { x: pen.x(cu, 0), y: pen.y(cy), z: pen.z(cu, 0), nx: f.out[0], nz: f.out[2], radiusM: R, depthM: t + 0.01, outsideM: 0.01 };
}

/**
 * `damaged` (DESTRUCTION.md §16.3): the glass gone (the presentation hides the structure's glass; the shards fall from
 * the windows), the render spalled off in patches down to its core, slipped tiles on the roof and a few at the eaves.
 */
export function damagedHouse(anatomy: StructureDamageAnatomy, seed: number, out: { mesh: DamageMeshWriter; pieces: DamagePieceWriter }): DamageStageResult {
  const rng = damageRng(seed);
  const extras = extrasOf(anatomy);
  const mesh = new Mesh(out.mesh);
  const cuts: DamageStageResult['cuts'] = [];
  const faces = anatomy.storeys.flatMap((st) => st.faces.map((f) => ({ st, f })));
  // spalls: on a rendered or framed face, the skin off its core in a few ragged patches
  const skinned = faces.filter(({ f }) => f.layers.length >= 2 && (f.layers[0].material === 'plaster' || f.layers[1].material === 'infill'));
  const spalls = Math.min(skinned.length * 2, 3 + Math.floor(rng() * 5));
  for (let k = 0; k < spalls && skinned.length; k++) {
    const { f } = skinned[Math.floor(rng() * skinned.length)];
    const pen = new FacePen(f, extras?.surfaces.get(f.section) ?? fallbackSurface(f));
    const framed = f.layers[1]?.material === 'infill';
    const skin = framed ? f.layers[1] : f.layers[0];
    // a framed wall's daub falls to its wattle; a render to its rubble, brick or earth
    const core: FractureSlot = framed ? { ...skin, material: 'infill', tint: [0.46, 0.37, 0.26], thicknessM: 0.1 } : f.layers[1];
    const r = 0.18 + rng() * (framed ? 0.16 : 0.42);
    const cu = (rng() - 0.5) * (f.width - 2 * r - 0.2), cy = r + 0.1 + rng() * Math.max(0, f.height - 2 * r - 0.2);
    if (framed && f.members.some((m) => distToSegment(cu, cy, m) < r + m.widthM / 2)) continue;
    const cut = spall(mesh, pen, skin, core, cu, cy, r, rng);
    if (cut) cuts.push(cut);
  }
  // the glass: shards from the windows, falling out and down
  for (const { f } of faces) {
    const pen = new FacePen(f, extras?.surfaces.get(f.section) ?? fallbackSurface(f));
    for (const o of f.openings) {
      if (o.kind !== 'window' && o.kind !== 'shopfront' && o.kind !== 'loft') continue;
      if (o.state) continue;
      const shards = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < shards; k++) {
        const u = o.u + (rng() - 0.5) * o.w * 0.8, y = o.y0 + rng() * o.h;
        const hole: BreachSpec = { section: f.section, storey: 0, face: f.name, hole: 0, u, y, radiusM: 0, dirX: f.out[0], dirZ: f.out[2],
          munition: null, cause: 'blast', seed };
        if (!throwPiece(out.pieces, pen, hole, rng, 'glass', 'shard', u, y, -o.reveal, 0.08 + rng() * 0.14, 0.1 + rng() * 0.2, 0.006, [1, 1, 1], 2.5)) break;
      }
    }
  }
  // slipped tiles: a few lying askew on the roof, a few fallen to the eaves
  const roof = anatomy.roof;
  if (roof && (roof.covering.material === 'tile' || roof.covering.material === 'slate') && roof.slabs.length) {
    const shape: DebrisShape = roof.covering.material === 'slate' ? 'slate' : 'tile';
    const count = 4 + Math.floor(rng() * 8);
    for (let k = 0; k < count; k++) {
      const s = roof.slabs[Math.floor(rng() * Math.min(2, roof.slabs.length))];
      const [a, b, , d] = s.corners;
      const t = rng(), w = rng();
      // a point on the slab (between its eave edge a-b and its ridge corner d), a little proud of the covering
      const p = [a[0] + (b[0] - a[0]) * w + (d[0] - a[0]) * t, a[1] + (b[1] - a[1]) * w + (d[1] - a[1]) * t + 0.05, a[2] + (b[2] - a[2]) * w + (d[2] - a[2]) * t];
      // lying on the slope, turned a little off the courses: the slab's frame (along the eave, its normal, down the slope)
      const ex = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]), up = norm3([d[0] - a[0], d[1] - a[1], d[2] - a[2]]);
      const nn = norm3(cross3(ex, up)), slabN = nn[1] < 0 ? [-nn[0], -nn[1], -nn[2]] as Vec3 : nn;
      const turn = (rng() - 0.5) * 0.9, c = Math.cos(turn), sn = Math.sin(turn);
      const xAxis = norm3([ex[0] * c + up[0] * sn, ex[1] * c + up[1] * sn, ex[2] * c + up[2] * sn]);
      const zAxis = norm3(cross3(xAxis, slabN));
      const q = quatFromBasis(xAxis, slabN, zAxis);
      if (!out.pieces.push(roof.covering.bucket, shape, Math.floor(rng() * 4), p[0], p[1], p[2], q[0], q[1], q[2], q[3], 0.2, 0.012, 0.36,
        roof.covering.tint[0], roof.covering.tint[1], roof.covering.tint[2], 0, k % 3 === 0 ? -0.5 : 0, 0)) break;
    }
  }
  mesh.end();
  return { cuts, hides: [{ section: null, partClass: 'glass' }] };
}

function norm3(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
/** The unit quaternion of the rotation whose columns are the orthonormal axes x, y, z. */
function quatFromBasis(x: Vec3, y: Vec3, z: Vec3): [number, number, number, number] {
  const m00 = x[0], m11 = y[1], m22 = z[2], tr = m00 + m11 + m22;
  let qx: number, qy: number, qz: number, qw: number;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    qw = 0.25 * s; qx = (y[2] - z[1]) / s; qy = (z[0] - x[2]) / s; qz = (x[1] - y[0]) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    qw = (y[2] - z[1]) / s; qx = 0.25 * s; qy = (y[0] + x[1]) / s; qz = (z[0] + x[2]) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    qw = (z[0] - x[2]) / s; qx = (y[0] + x[1]) / s; qy = 0.25 * s; qz = (z[1] + y[2]) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    qw = (x[1] - y[0]) / s; qx = (z[0] + x[2]) / s; qy = (z[1] + y[2]) / s; qz = 0.25 * s;
  }
  const l = Math.hypot(qx, qy, qz, qw) || 1;
  return [qx / l, qy / l, qz / l, qw / l];
}

// ---------------------------------------------------------------------------------------------------- collapse

/**
 * The middle of the house's ground storey in the body frame: the mean of its four faces' middles (a builder can set its
 * main body off the plot's centre, a tower behind its forecourt, a hall beside its yard). The origin without storeys.
 */
export function bodyCentre(anatomy: StructureDamageAnatomy): [number, number] {
  const faces = anatomy.storeys[0]?.faces;
  if (!faces?.length) return [0, 0];
  let x = 0, z = 0;
  for (const f of faces) { x += f.origin[0]; z += f.origin[2]; }
  return [x / faces.length, z / faces.length];
}

/**
 * The ground under a collapsed house as the sim lays its rubble mound, in the body frame: the height of the pile's
 * surface above the terrain at (x, z). The world gives the sim's own (destructionKit.ts bodyMoundHeightAt over
 * sim/terrainDeformation.ts rubbleMoundHeightAt); without it (an offline preview, a test), a dome over the house's
 * footprint and a metre round it, its crown from the storeys.
 */
export type MoundHeight = (x: number, z: number) => number;
export function domeMound(anatomy: StructureDamageAnatomy): MoundHeight {
  const rx = anatomy.w / 2 + 1, rz = anatomy.d / 2 + 1, [cx, cz] = bodyCentre(anatomy);
  const crown = Math.max(0.8, Math.min(2.6, anatomy.storeys.length * 0.55 + 0.4));
  return (x, z) => {
    const q = ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2;
    return q >= 1 ? 0 : crown * Math.pow(1 - q, 0.7);
  };
}

/** A box on the face (u0..u1, y0..y1, o from front to back): its front, top, ends and back as the remnant shows them. */
function stubBlock(mesh: Mesh, pen: FacePen, slot: FractureSlot, u0: number, u1: number, y0: number, y1: number, front: number, back: number,
  show: { top: boolean; left: boolean; right: boolean }, tint: Rgb): void {
  const { n, u, nu, up } = axes(pen.f);
  const inward: Vec3 = [-n[0], -n[1], -n[2]];
  mesh.facePoly(pen, slot.bucket, [[u0, y0, front], [u1, y0, front], [u1, y1, front], [u0, y1, front]], n, tint, 1);
  mesh.facePoly(pen, slot.bucket, [[u1, y0, back], [u0, y0, back], [u0, y1, back], [u1, y1, back]], inward, tint, 0.62, 0.07, 0);
  if (show.top) mesh.facePoly(pen, slot.bucket, [[u0, y1, front], [u1, y1, front], [u1, y1, back], [u0, y1, back]], up, tint, 0.9, 0, 0.13);
  if (show.left) mesh.facePoly(pen, slot.bucket, [[u0, y0, back], [u0, y0, front], [u0, y1, front], [u0, y1, back]], nu, tint, 0.75, 0.05, 0);
  if (show.right) mesh.facePoly(pen, slot.bucket, [[u1, y0, front], [u1, y0, back], [u1, y1, back], [u1, y1, front]], u, tint, 0.75, 0.05, 0);
}

/**
 * What stands of one ground-storey face: masonry to a ragged top stepped along its courses and joints (the corners
 * standing higher), a render or a frame's infill to a ragged line with its core along the break, a framed wall's
 * sill and the stumps of its posts; never across a door or a window.
 */
function remnantWall(mesh: Mesh, pen: FacePen, anatomy: StructureDamageAnatomy, rng: () => number): void {
  const f = pen.f, rem = anatomy.remnant;
  const depth = Math.max(0.16, Math.min(0.5, f.layers.reduce((a, l) => a + l.thicknessM, 0)));
  const half = f.width / 2;
  // the standing height along the face: the stub's ragged line, the corners higher
  const lobes = Array.from({ length: 5 }, () => [rng() * 2 - 1, rng() * Math.PI * 2]);
  const stubAt = (u: number) => {
    let v = 0;
    for (let k = 0; k < lobes.length; k++) v += lobes[k][0] * Math.sin(u * (k + 1) * 1.3 + lobes[k][1]) / (k + 1);
    const corner = rem.corners ? Math.max(0, 1 - (half - Math.abs(u)) / 0.9) * (0.9 + rng() * 0.6) : 0;
    return Math.min(f.height, Math.max(0.15, rem.stubHeightM * (1 + 0.45 * v) + corner * 1.4));
  };
  const outer = f.layers[0];
  const framed = f.members.length > 0 && f.layers.some((l) => l.material === 'infill');
  if (f.masonry && !framed && (outer.material === 'stone' || outer.material === 'brick' || outer.material === 'rubble')) {
    const m = f.masonry;
    if (!mesh.begin(outer.bucket, 'remnant', true)) return;
    interface B { u0: number; u1: number; y0: number; y1: number }
    const kept: B[][] = [];
    for (let k = 0; k < m.courses.length; k++) {
      const y0 = m.courses[k], y1 = m.courses[k + 1] ?? f.height;
      const edges = [-half, ...m.joints(k), half];
      const row: B[] = [];
      for (let j = 0; j + 1 < edges.length; j++) {
        const u0 = edges[j], u1 = edges[j + 1], mu = (u0 + u1) / 2;
        if (inOpening(f, mu, (y0 + y1) / 2)) continue;
        if (y1 <= stubAt(mu) + (rng() - 0.5) * 0.3) row.push({ u0, u1, y0, y1 });
      }
      kept.push(row);
      if (!row.length) break;
    }
    const has = (k: number, u: number) => (kept[k] ?? []).some((b) => u > b.u0 && u < b.u1);
    for (let k = 0; k < kept.length; k++) for (const b of kept[k]) {
      const mid = (b.u0 + b.u1) / 2;
      stubBlock(mesh, pen, outer, b.u0, b.u1, b.y0, b.y1, LIFT, -depth, {
        top: !has(k + 1, mid), left: !(kept[k] ?? []).some((c) => Math.abs(c.u1 - b.u0) < 1e-4) && b.u0 > -half + 1e-3,
        right: !(kept[k] ?? []).some((c) => Math.abs(c.u0 - b.u1) < 1e-4) && b.u1 < half - 1e-3,
      }, outer.tint);
    }
    mesh.end();
    return;
  }
  // a render or infill over its core, or planks: a ragged line along the face, in steps of 0.35 m
  const skin = framed ? f.layers.find((l) => l.material === 'infill')! : outer;
  const core = framed ? skin : f.layers[1] ?? outer;
  const steps = Math.max(2, Math.round(f.width / 0.35));
  const { n, up } = axes(f);
  const inward: Vec3 = [-n[0], -n[1], -n[2]];
  if (mesh.begin(skin.bucket, 'remnant', true)) {
    for (let i = 0; i < steps; i++) {
      const u0 = -half + (f.width * i) / steps, u1 = -half + (f.width * (i + 1)) / steps, mid = (u0 + u1) / 2;
      if (inOpening(f, mid, Math.min(0.5, stubAt(mid) / 2))) continue;
      const h0 = stubAt(u0), h1 = stubAt(u1);
      mesh.facePoly(pen, skin.bucket, [[u0, 0, LIFT], [u1, 0, LIFT], [u1, h1, LIFT], [u0, h0, LIFT]], n, skin.tint, 1);
      mesh.facePoly(pen, skin.bucket, [[u1, 0, -depth], [u0, 0, -depth], [u0, h0, -depth], [u1, h1, -depth]], inward, skin.tint, 0.6, 0.07, 0);
    }
  }
  if (mesh.begin(core.bucket, 'remnant')) {
    // the break along the top: the core's ragged crest, a hand lower than the skin's edge in places
    for (let i = 0; i < steps; i++) {
      const u0 = -half + (f.width * i) / steps, u1 = -half + (f.width * (i + 1)) / steps;
      if (inOpening(f, (u0 + u1) / 2, Math.min(0.5, stubAt((u0 + u1) / 2) / 2))) continue;
      const h0 = stubAt(u0), h1 = stubAt(u1), d0 = h0 - 0.04 - rng() * 0.08, d1 = h1 - 0.04 - rng() * 0.08;
      mesh.facePoly(pen, core.bucket, [[u0, h0, LIFT], [u1, h1, LIFT], [u1, d1, -depth], [u0, d0, -depth]], up, core.tint, 0.85, 0, 0.11);
    }
  }
  // a framed wall's sill and the stumps of its posts, broken at their own heights
  if (framed) {
    const timber = f.layers.find((l) => l.material === 'timber') ?? outer;
    if (mesh.begin(timber.bucket, 'remnant')) {
      for (const mm of f.members) {
        if (mm.role === 'sill') memberBox(mesh, pen, timber, mm, 1, 0, 0, Math.abs(mm.u1 - mm.u0), false, false, n, rng);
        if (mm.role !== 'post') continue;
        const top = Math.min(Math.max(mm.y0, mm.y1), stubAt(mm.u0) + 0.2 + rng() * 0.8);
        const low = Math.min(mm.y0, mm.y1);
        if (top - low > 0.1) memberBox(mesh, pen, timber, { ...mm, y0: low, y1: top, u1: mm.u0 }, 0, 1, 0, top - low, false, true, n, rng);
      }
    }
  }
  mesh.end();
}

/** A chunk of the pile: an irregular box seated on the mound, in its bucket with its tint (body frame, world uvs). */
/** The skin's bucket: the walls' main material in the pile (a render's core where the skin is a render). */
const SKIN_MATERIALS: ReadonlySet<string> = new Set(['stone', 'brick', 'rubble', 'concrete', 'adobe', 'earth', 'plaster']);

/**
 * The heap's skin: a polar grid over the mound from its crown out to where it stands 12 cm high, each vertex on the
 * heap with a lump of its own, in the walls' main material (its own texture across the top, its tint dusted and
 * darkened); returns the heap's reach along x and z for the chunks (DESTRUCTION.md §16.3 Collapse).
 */
function heapSkin(mesh: Mesh, anatomy: StructureDamageAnatomy, slots: readonly FractureSlot[], mound: MoundHeight, cx: number, cz: number,
  rng: () => number): [number, number] {
  const RINGS = 7, SECTORS = 22, EDGE = 0.12;
  const rx = anatomy.w / 2 + 0.8, rz = anatomy.d / 2 + 0.8, far = 1.8 * Math.max(rx, rz);
  // how far out each sector's ray stays on the heap
  const ext: number[] = [];
  let reachX = rx, reachZ = rz;
  for (let k = 0; k < SECTORS; k++) {
    const a = (k / SECTORS) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    let r = 0.25;
    while (r < far && mound(cx + dx * (r + 0.25), cz + dz * (r + 0.25)) > EDGE) r += 0.25;
    ext.push(r);
    reachX = Math.max(reachX, Math.abs(dx) * (r + 0.6));
    reachZ = Math.max(reachZ, Math.abs(dz) * (r + 0.6));
  }
  const slot = slots.find((s) => SKIN_MATERIALS.has(s.material)) ?? slots[0];
  if (!slot || !mesh.room(1 + RINGS * SECTORS) || !mesh.begin(slot.bucket, 'rubble')) return [reachX, reachZ];
  const density = slot.bucket.includes('laster') ? 0.42 : 0.5, dust = 0.8;
  const tint: Rgb = [slot.tint[0] * dust, slot.tint[1] * dust * 0.98, slot.tint[2] * dust * 0.95];
  // the positions first (a lump at every vertex but the rim, which stays on the heap), then the normals across the grid
  const pos: Vec3[] = [[cx, mound(cx, cz) + 0.05, cz]];
  for (let ring = 1; ring <= RINGS; ring++) {
    const t = Math.pow(ring / RINGS, 0.85);
    for (let k = 0; k < SECTORS; k++) {
      const a = (k / SECTORS) * Math.PI * 2, r = ext[k] * t * (ring === RINGS ? 1 : 0.92 + rng() * 0.16);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const lump = ring === RINGS ? 0.01 : (rng() - 0.35) * 0.22 * (1 - t * 0.6);
      pos.push([x, mound(x, z) + lump, z]);
    }
  }
  const at = (ring: number, k: number): number => (ring === 0 ? 0 : 1 + (ring - 1) * SECTORS + ((k + SECTORS) % SECTORS));
  const idx: number[] = [];
  for (let i = 0; i < pos.length; i++) {
    const ring = i === 0 ? 0 : 1 + Math.floor((i - 1) / SECTORS), k = i === 0 ? 0 : (i - 1) % SECTORS;
    let n: Vec3 = [0, 1, 0];
    if (ring > 0) {
      const p = pos[i], inner = pos[at(ring - 1, k)], outer = pos[at(Math.min(RINGS, ring + 1), k)];
      const left = pos[at(ring, k - 1)], right = pos[at(ring, k + 1)];
      const radial: Vec3 = [outer[0] - inner[0], outer[1] - inner[1], outer[2] - inner[2]];
      const around: Vec3 = [right[0] - left[0], right[1] - left[1], right[2] - left[2]];
      n = norm3(cross3(around, radial));
      if (n[1] < 0) n = [-n[0], -n[1], -n[2]];
      if (!Number.isFinite(n[0])) n = [0, 1, 0];
      void p;
    }
    const shade = 0.78 + 0.22 * n[1];
    idx.push(mesh.rawVertex(pos[i], n, pos[i][0] * density, pos[i][2] * density, [tint[0] * shade, tint[1] * shade, tint[2] * shade]));
  }
  // counter-clockwise from above: the crown's fan, then the rings' quads
  for (let k = 0; k < SECTORS; k++) mesh.rawTriangle(idx[0], idx[at(1, k + 1)], idx[at(1, k)]);
  for (let ring = 1; ring < RINGS; ring++) {
    for (let k = 0; k < SECTORS; k++) {
      const a = idx[at(ring, k)], b = idx[at(ring, k + 1)], c = idx[at(ring + 1, k + 1)], d = idx[at(ring + 1, k)];
      mesh.rawTriangle(a, b, c);
      mesh.rawTriangle(a, c, d);
    }
  }
  mesh.end();
  return [reachX, reachZ];
}

function heapChunk(mesh: Mesh, slot: FractureSlot, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, yaw: number,
  tilt: number, rng: () => number): void {
  if (!mesh.fits(24)) return;
  const c = Math.cos(yaw), s = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
  const corner = (a: number, b: number, e: number): Vec3 => {
    const x = a * sx * (0.8 + rng() * 0.2), y = b * sy * (0.8 + rng() * 0.2), z = e * sz * (0.8 + rng() * 0.2);
    // tilt about x, then turn about y
    const y1 = y * ct - z * st, z1 = y * st + z * ct;
    return [cx + x * c + z1 * s, cy + y1, cz - x * s + z1 * c];
  };
  const k: Vec3[] = [];
  for (const e of [-1, 1]) for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.push(corner(a, b, e));
  const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]];
  const jitter = 0.88 + rng() * 0.24, tint: Rgb = [slot.tint[0] * jitter, slot.tint[1] * jitter, slot.tint[2] * jitter];
  const d = 0.5;
  for (const fc of faces) {
    const [a, b, cc, dd] = fc.map((i) => k[i]);
    const nx0 = (b[1] - a[1]) * (cc[2] - a[2]) - (b[2] - a[2]) * (cc[1] - a[1]);
    const ny0 = (b[2] - a[2]) * (cc[0] - a[0]) - (b[0] - a[0]) * (cc[2] - a[2]);
    const nz0 = (b[0] - a[0]) * (cc[1] - a[1]) - (b[1] - a[1]) * (cc[0] - a[0]);
    const l = Math.hypot(nx0, ny0, nz0) || 1;
    const nrm: Vec3 = [nx0 / l, ny0 / l, nz0 / l];
    const shade = 0.72 + 0.28 * Math.max(0, nrm[1]);
    mesh.quadUv(a, b, cc, dd, nrm, d, [tint[0] * shade, tint[1] * shade, tint[2] * shade]);
  }
}

/**
 * The collapse (DESTRUCTION.md §16.3 Collapse): the ground storey's walls stand to their stubs (the corners higher, the
 * chimney stacks whole), the plinth stays, and the house lies in a heap on the mound — chunks of its own walls in their
 * buckets and tints by the rubble's shares, its timbers across them, its tiles — and the falling debris thrown down
 * and out from the storeys and the roof.
 */
export function collapseHouse(anatomy: StructureDamageAnatomy, seed: number, out: { mesh: DamageMeshWriter; pieces: DamagePieceWriter },
  mound: MoundHeight = domeMound(anatomy)): DamageStageResult {
  const rng = damageRng(seed);
  const extras = extrasOf(anatomy);
  const mesh = new Mesh(out.mesh);
  const st0 = anatomy.storeys[0], [cx, cz] = bodyCentre(anatomy);
  // the remnant: the ground storey's faces to their stubs
  if (st0) for (const f of st0.faces) remnantWall(mesh, new FacePen(f, extras?.surfaces.get(f.section) ?? fallbackSurface(f)), anatomy, rng);
  // the plinth stays where it was
  if (anatomy.plinth && mesh.begin(anatomy.plinth.slot.bucket, 'remnant')) {
    const p = anatomy.plinth, hw = anatomy.w / 2 + p.out, hd = anatomy.d / 2 + p.out, y = st0?.y0 ?? p.h; // the ground floor sits on the plinth (house.ts), wherever the house was placed
    const t = p.slot.tint;
    mesh.quadUv([cx - hw, y, cz + hd], [cx + hw, y, cz + hd], [cx + hw, y, cz - hd], [cx - hw, y, cz - hd], [0, 1, 0], 0.5, t);
  }
  // the chimney stacks stand (a stack that rose from the roof falls with it)
  if (anatomy.remnant.chimneys) for (const c of anatomy.chimneys) {
    if (c.y0 > 1 || !mesh.begin(c.bucket, 'remnant')) continue;
    heapChunk(mesh, { material: 'brick', bucket: c.bucket, tint: [0.62, 0.42, 0.34], thicknessM: 0.24, share: 0 }, c.x, (c.y0 + c.y1) / 2, c.z,
      c.sx / 2, (c.y1 - c.y0) / 2, c.sz / 2, 0, 0, () => 0.99);
  }
  // the heap: first a skin over the mound in the walls' own material (the pile reads as this house's rubble, not as
  // ground with chunks on it), then chunks of its materials by their shares, kept where the heap stands high
  const slots = anatomy.rubble.filter((s) => s.share > 0.005);
  const reach = heapSkin(mesh, anatomy, slots, mound, cx, cz, rng);
  const budget = Math.max(40, Math.min(420, Math.floor((out.mesh.capacity - out.mesh.vertices) / 26)));
  const crown = Math.max(0.05, mound(cx, cz));
  for (const slot of slots) {
    const count = Math.round(budget * slot.share);
    if (count < 1 || !mesh.begin(slot.bucket, 'rubble')) continue;
    for (let i = 0; i < count; i++) {
      // a point over the heap, kept as often as the heap is high there (dense on its crown, thinning down its skirt)
      let x = cx, z = cz;
      for (let t = 0; t < 8; t++) {
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng());
        const px = cx + Math.cos(a) * r * reach[0], pz = cz + Math.sin(a) * r * reach[1];
        if (rng() * crown < mound(px, pz)) { x = px; z = pz; break; }
      }
      const timber = slot.material === 'timber' || slot.material === 'plank';
      const flat = slot.material === 'tile' || slot.material === 'slate' || slot.material === 'plaster' || slot.material === 'infill' || slot.material === 'metal';
      const sx = timber ? 0.5 + rng() * 1.1 : flat ? 0.12 + rng() * 0.22 : 0.12 + rng() * 0.26;
      const sy = timber ? 0.07 + rng() * 0.04 : flat ? 0.015 + rng() * 0.03 : 0.08 + rng() * 0.18;
      const sz = timber ? 0.07 + rng() * 0.04 : flat ? 0.1 + rng() * 0.2 : 0.1 + rng() * 0.22;
      const y = mound(x, z) + sy * 0.35;
      heapChunk(mesh, slot, x, y, z, sx, sy, sz, rng() * Math.PI, timber ? (rng() - 0.5) * 0.6 : (rng() - 0.5) * 0.9, rng);
    }
  }
  mesh.end();
  // the falling debris: from the storeys and the roof, down and out
  const top = anatomy.roof?.ridgeY ?? anatomy.h;
  const pieceSlots = slots.length ? slots : anatomy.rubble;
  for (let i = 0; i < out.pieces.capacity; i++) {
    const slot = pieceSlots[Math.floor(rng() * pieceSlots.length)];
    if (!slot) break;
    const shape: DebrisShape = slot.material === 'brick' ? 'brick' : slot.material === 'stone' ? 'block' : slot.material === 'rubble' ? 'stone'
      : slot.material === 'timber' ? 'beam' : slot.material === 'plank' ? 'splinter' : slot.material === 'tile' ? 'tile' : slot.material === 'slate' ? 'slate'
        : slot.material === 'thatch' ? 'straw' : slot.material === 'adobe' || slot.material === 'earth' ? 'clod' : slot.material === 'metal' ? 'sheet' : 'chunk';
    const ox = (rng() - 0.5) * anatomy.w, oz = (rng() - 0.5) * anatomy.d, x = cx + ox, z = cz + oz, y = 1 + rng() * (top - 1);
    const out2 = Math.hypot(ox, oz) || 1, sp = 1.5 + rng() * 3;
    const s = shape === 'beam' ? [1 + rng() * 1.6, 0.16, 0.16] : shape === 'tile' ? [0.2, 0.015, 0.34] : [0.15 + rng() * 0.25, 0.1 + rng() * 0.15, 0.12 + rng() * 0.2];
    const ang = rng() * Math.PI * 2;
    if (!out.pieces.push(slot.bucket, shape, Math.floor(rng() * 4), x, y, z, 0, Math.sin(ang / 2), 0, Math.cos(ang / 2), s[0], s[1], s[2],
      slot.tint[0], slot.tint[1], slot.tint[2], (ox / out2) * sp, -1 - rng() * 2, (oz / out2) * sp)) break;
  }
  return { cuts: [], hides: [{ section: null, partClass: null }] };
}

// ---------------------------------------------------------------------------------------------------- the roof falls

/** A timber between two body-frame points, `w` wide and `t` deep, its broad face toward `up` (a rafter, a batten). */
function beamBetween(mesh: Mesh, a: Vec3, b: Vec3, w: number, t: number, upHint: Vec3, tint: Rgb): void {
  if (!mesh.fits(16)) return;
  const ax = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  let side = norm3(cross3(ax, upHint));
  if (!Number.isFinite(side[0]) || Math.hypot(side[0], side[1], side[2]) < 0.5) side = norm3(cross3(ax, [1, 0, 0]));
  const up = norm3(cross3(side, ax));
  const P = (p: Vec3, s: number, u: number): Vec3 => [p[0] + side[0] * s + up[0] * u, p[1] + side[1] * s + up[1] * u, p[2] + side[2] * s + up[2] * u];
  const hw = w / 2, ht = t / 2;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const quad = (p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, n: Vec3, k: number) => {
    const c: Rgb = [tint[0] * k, tint[1] * k, tint[2] * k];
    mesh.quadUvAlong(p0, p1, p2, p3, n, len, c);
  };
  quad(P(a, -hw, ht), P(b, -hw, ht), P(b, hw, ht), P(a, hw, ht), up, 1);
  quad(P(a, hw, -ht), P(b, hw, -ht), P(b, -hw, -ht), P(a, -hw, -ht), [-up[0], -up[1], -up[2]], 0.55);
  quad(P(a, hw, ht), P(b, hw, ht), P(b, hw, -ht), P(a, hw, -ht), side, 0.8);
  quad(P(a, -hw, -ht), P(b, -hw, -ht), P(b, -hw, ht), P(a, -hw, ht), [-side[0], -side[1], -side[2]], 0.8);
}

/**
 * The roof falls (DESTRUCTION.md §16.3 Roof, `sectionDown` for the roof's section): the covering is hidden and what is
 * left is redrawn — a ragged band of it along each eave, the rafters over the gap (some whole to the ridge, some snapped
 * with their ends splintered, some hanging into the house from the wall plate), a few battens across them above the
 * band, the ridge's purlin broken and sagging; a thatch charred and slumped over its blackened rafters; an earth roof
 * dropped between its joists. Tiles, slates, straw and the broken timbers fall as debris.
 */
export function roofDown(anatomy: StructureDamageAnatomy, seed: number, out: { mesh: DamageMeshWriter; pieces: DamagePieceWriter }): DamageStageResult {
  const roof = anatomy.roof;
  if (!roof) return { cuts: [], hides: [] };
  const rng = damageRng(seed);
  const mesh = new Mesh(out.mesh);
  const cover = roof.covering, timber = roof.structure, [cx, cz] = bodyCentre(anatomy);
  const thatch = cover.material === 'thatch', earth = cover.material === 'earth';
  const charred = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k * 0.92, c[2] * k * 0.85];
  const coverTint = thatch ? charred(cover.tint, 0.42) : cover.tint;
  const rafterTint = thatch ? charred(timber.tint, 0.35) : timber.tint;
  const pitched = roof.kind !== 'flat' && roof.slabs.length >= 2;
  if (pitched) {
    const slopes = roof.slabs.slice(0, 2);
    for (const slab of slopes) {
      const [a, b, c, d] = slab.corners; // eave a → b, ridge c (above b) and d (above a)
      const along = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]), eaveLen = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const nrm0 = norm3(cross3([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [d[0] - a[0], d[1] - a[1], d[2] - a[2]]));
      const nrm: Vec3 = nrm0[1] < 0 ? [-nrm0[0], -nrm0[1], -nrm0[2]] : nrm0;
      // the band left along the eave: up to a ragged fraction of the slope (a thatch slumps lower, sagging between)
      const segs = Math.max(4, Math.round(eaveLen / 0.6));
      const frac = Array.from({ length: segs + 1 }, () => (thatch ? 0.12 : 0.18) + rng() * (thatch ? 0.22 : 0.32));
      const at = (s: number, t: number): Vec3 => {
        // a point on the slab: s along the eave (0..1), t up the slope (0 at the eave, 1 at the ridge), the ridge line
        // interpolated between its two corners
        const e: Vec3 = [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
        const r: Vec3 = [d[0] + (c[0] - d[0]) * s, d[1] + (c[1] - d[1]) * s, d[2] + (c[2] - d[2]) * s];
        const sag = thatch ? Math.sin(Math.PI * t) * 0.18 : 0;
        return [e[0] + (r[0] - e[0]) * t - nrm[0] * sag, e[1] + (r[1] - e[1]) * t - nrm[1] * sag, e[2] + (r[2] - e[2]) * t - nrm[2] * sag];
      };
      if (mesh.begin(cover.bucket, 'remnant')) {
        for (let i = 0; i < segs; i++) {
          const s0 = i / segs, s1 = (i + 1) / segs;
          const q = [at(s0, 0), at(s1, 0), at(s1, frac[i + 1]), at(s0, frac[i])];
          mesh.quadUvAlong(q[0], q[1], q[2], q[3], nrm, eaveLen, coverTint);
          // the band's broken edge: its thickness facing up the slope
          const dn: Vec3 = [-nrm[0] * roof.thicknessM, -nrm[1] * roof.thicknessM, -nrm[2] * roof.thicknessM];
          const up0 = q[3], up1 = q[2];
          const edgeN = norm3([d[0] - a[0], d[1] - a[1], d[2] - a[2]]);
          mesh.quadUvAlong(up1, up0, [up0[0] + dn[0], up0[1] + dn[1], up0[2] + dn[2]], [up1[0] + dn[0], up1[1] + dn[1], up1[2] + dn[2]], edgeN, eaveLen,
            [coverTint[0] * 0.7, coverTint[1] * 0.7, coverTint[2] * 0.7]);
        }
      }
      // the rafters over the gap, every rafter pitch along the eave
      if (mesh.begin(timber.bucket, 'remnant')) {
        const n = Math.max(2, Math.floor(eaveLen / Math.max(0.5, roof.rafterPitchM)));
        const lift = -roof.thicknessM - 0.08;
        for (let k = 0; k <= n; k++) {
          const s = 0.04 + 0.92 * (k / n);
          const foot = at(s, 0), head = at(s, 1);
          const footIn: Vec3 = [foot[0] + nrm[0] * lift, foot[1] + nrm[1] * lift, foot[2] + nrm[2] * lift];
          const headIn: Vec3 = [head[0] + nrm[0] * lift, head[1] + nrm[1] * lift, head[2] + nrm[2] * lift];
          const fate = rng();
          if (fate < 0.35) beamBetween(mesh, footIn, headIn, 0.1, 0.14, nrm, rafterTint);
          else if (fate < 0.8) {
            // snapped past the band, its end splintered (a paler tip)
            const t = 0.35 + rng() * 0.4;
            const mid: Vec3 = [footIn[0] + (headIn[0] - footIn[0]) * t, footIn[1] + (headIn[1] - footIn[1]) * t, footIn[2] + (headIn[2] - footIn[2]) * t];
            beamBetween(mesh, footIn, mid, 0.1, 0.14, nrm, rafterTint);
            const tip: Vec3 = [mid[0] + (headIn[0] - footIn[0]) * 0.05, mid[1] + (headIn[1] - footIn[1]) * 0.05 - 0.03, mid[2] + (headIn[2] - footIn[2]) * 0.05];
            beamBetween(mesh, mid, tip, 0.05, 0.07, nrm, [Math.min(1, rafterTint[0] * 1.6 + 0.1), Math.min(1, rafterTint[1] * 1.5 + 0.08), Math.min(1, rafterTint[2] * 1.4 + 0.06)]);
            throwPieceAt(out.pieces, rng, timber.bucket, 'beam', mid, [0.9 + rng(), 0.12, 0.12], rafterTint, 2.5);
          } else {
            // hanging from the wall plate into the house (the plate: where the rafter crosses the wall's top, inside the
            // eave's overhang, so it never swings down outside the wall)
            const len = Math.hypot(headIn[0] - footIn[0], headIn[1] - footIn[1], headIn[2] - footIn[2]) * (0.4 + rng() * 0.3);
            const inward = norm3([-nrm[0], 0, -nrm[2]]);
            const tp = Math.max(0, Math.min(0.5, (roof.eaveY - footIn[1]) / Math.max(1e-3, headIn[1] - footIn[1])));
            const plate: Vec3 = [footIn[0] + (headIn[0] - footIn[0]) * tp, footIn[1] + (headIn[1] - footIn[1]) * tp, footIn[2] + (headIn[2] - footIn[2]) * tp];
            // its end comes to rest on the floor at the worst
            const dropTo: Vec3 = [plate[0] + inward[0] * len * 0.45, Math.max(0.15 + rng() * 0.3, plate[1] - len * 0.85), plate[2] + inward[2] * len * 0.45];
            beamBetween(mesh, plate, dropTo, 0.1, 0.14, along, rafterTint);
          }
        }
        // two or three battens across the rafters just above the band, the odd one broken short
        const battens = 2 + Math.floor(rng() * 2);
        for (let k = 0; k < battens; k++) {
          const t = Math.max(...frac) + 0.04 + k * Math.max(0.1, roof.battenPitchM / Math.max(1, Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2])));
          const s0 = rng() * 0.25, s1 = 1 - rng() * 0.35;
          const p0 = at(s0, t), p1 = at(s1, t);
          const off = -roof.thicknessM * 0.4;
          beamBetween(mesh, [p0[0] + nrm[0] * off, p0[1] + nrm[1] * off, p0[2] + nrm[2] * off], [p1[0] + nrm[0] * off, p1[1] + nrm[1] * off, p1[2] + nrm[2] * off],
            0.05, 0.03, nrm, rafterTint);
        }
      }
      // the covering falls: tiles, slates or straw from the gap
      const shape: DebrisShape = thatch ? 'straw' : cover.material === 'slate' ? 'slate' : cover.material === 'metal' ? 'sheet' : cover.material === 'plank' ? 'splinter' : 'tile';
      for (let k = 0; k < 40; k++) {
        const p = at(rng(), 0.4 + rng() * 0.55);
        if (!throwPieceAt(out.pieces, rng, cover.bucket, shape, p, shape === 'straw' ? [0.08, 0.9, 0.08] : [0.2, 0.015, 0.34], cover.tint, 2)) break;
      }
    }
    // the hip ends (house.ts lays a hip or half-hip's ends as triangles: their eave corners and the ridge's end): a band
    // of covering along the eave like the slopes', the two hip rafters from the corners up to the ridge's end — whole,
    // or snapped with the end splintered — and the common rafter up the middle
    for (const slab of roof.slabs.slice(2)) {
      const [a, b, apex] = slab.corners;
      const eaveLen = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      if (eaveLen < 0.5) continue;
      const nrm0 = norm3(cross3([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [apex[0] - a[0], apex[1] - a[1], apex[2] - a[2]]));
      const nrm: Vec3 = nrm0[1] < 0 ? [-nrm0[0], -nrm0[1], -nrm0[2]] : nrm0;
      const at = (s: number, t: number): Vec3 => {
        const e: Vec3 = [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
        const sag = thatch ? Math.sin(Math.PI * t) * 0.18 : 0;
        return [e[0] + (apex[0] - e[0]) * t - nrm[0] * sag, e[1] + (apex[1] - e[1]) * t - nrm[1] * sag, e[2] + (apex[2] - e[2]) * t - nrm[2] * sag];
      };
      const segs = Math.max(3, Math.round(eaveLen / 0.6));
      const frac = Array.from({ length: segs + 1 }, () => (thatch ? 0.12 : 0.18) + rng() * (thatch ? 0.22 : 0.32));
      if (mesh.begin(cover.bucket, 'remnant')) {
        const dn: Vec3 = [-nrm[0] * roof.thicknessM, -nrm[1] * roof.thicknessM, -nrm[2] * roof.thicknessM];
        const edgeN = norm3([apex[0] - (a[0] + b[0]) / 2, apex[1] - (a[1] + b[1]) / 2, apex[2] - (a[2] + b[2]) / 2]);
        for (let i = 0; i < segs; i++) {
          const s0 = i / segs, s1 = (i + 1) / segs;
          // the band narrows to nothing at the corners, where the hips meet the eave
          const f0 = frac[i] * Math.min(1, 4 * s0 * (1 - s0) + 0.15), f1 = frac[i + 1] * Math.min(1, 4 * s1 * (1 - s1) + 0.15);
          const q = [at(s0, 0), at(s1, 0), at(s1, f1), at(s0, f0)];
          mesh.quadUvAlong(q[0], q[1], q[2], q[3], nrm, eaveLen, coverTint);
          mesh.quadUvAlong(q[2], q[3], [q[3][0] + dn[0], q[3][1] + dn[1], q[3][2] + dn[2]], [q[2][0] + dn[0], q[2][1] + dn[1], q[2][2] + dn[2]], edgeN, eaveLen,
            [coverTint[0] * 0.7, coverTint[1] * 0.7, coverTint[2] * 0.7]);
        }
      }
      if (mesh.begin(timber.bucket, 'remnant')) {
        const lift = -roof.thicknessM - 0.08;
        const sink = (p: Vec3): Vec3 => [p[0] + nrm[0] * lift, p[1] + nrm[1] * lift, p[2] + nrm[2] * lift];
        for (const foot of [a, b, at(0.5, 0)]) {
          const f = sink(foot), h = sink(apex);
          if (rng() < 0.5) { beamBetween(mesh, f, h, 0.12, 0.16, nrm, rafterTint); continue; }
          const t = 0.3 + rng() * 0.4;
          const mid: Vec3 = [f[0] + (h[0] - f[0]) * t, f[1] + (h[1] - f[1]) * t, f[2] + (h[2] - f[2]) * t];
          beamBetween(mesh, f, mid, 0.12, 0.16, nrm, rafterTint);
          const tip: Vec3 = [mid[0] + (h[0] - f[0]) * 0.05, mid[1] + (h[1] - f[1]) * 0.05 - 0.03, mid[2] + (h[2] - f[2]) * 0.05];
          beamBetween(mesh, mid, tip, 0.06, 0.08, nrm, [Math.min(1, rafterTint[0] * 1.6 + 0.1), Math.min(1, rafterTint[1] * 1.5 + 0.08), Math.min(1, rafterTint[2] * 1.4 + 0.06)]);
          throwPieceAt(out.pieces, rng, timber.bucket, 'beam', mid, [0.9 + rng(), 0.12, 0.12], rafterTint, 2.5);
        }
      }
      const shape: DebrisShape = thatch ? 'straw' : cover.material === 'slate' ? 'slate' : cover.material === 'metal' ? 'sheet' : cover.material === 'plank' ? 'splinter' : 'tile';
      for (let k = 0; k < 16; k++) {
        const p = at(0.2 + rng() * 0.6, 0.35 + rng() * 0.5);
        if (!throwPieceAt(out.pieces, rng, cover.bucket, shape, p, shape === 'straw' ? [0.08, 0.9, 0.08] : [0.2, 0.015, 0.34], cover.tint, 2)) break;
      }
    }
    // the ridge's purlin, broken and sagging into the house
    if (mesh.begin(timber.bucket, 'remnant')) {
      const [, , c0, d0] = slopes[0].corners;
      const r0: Vec3 = [d0[0], d0[1] - roof.thicknessM - 0.2, d0[2]], r1: Vec3 = [c0[0], c0[1] - roof.thicknessM - 0.2, c0[2]];
      const t = 0.35 + rng() * 0.3, sag = 0.6 + rng() * 0.9;
      const mid: Vec3 = [r0[0] + (r1[0] - r0[0]) * t, r0[1] + (r1[1] - r0[1]) * t - sag, r0[2] + (r1[2] - r0[2]) * t];
      beamBetween(mesh, r0, mid, 0.16, 0.2, [0, 1, 0], rafterTint);
      beamBetween(mesh, [mid[0] + 0.1, mid[1] - 0.15, mid[2]], r1, 0.16, 0.2, [0, 1, 0], rafterTint);
    }
  } else if (earth || roof.kind === 'flat') {
    // a flat roof: its deck down between the joists, a few joists still spanning, earth slumped on the floor below
    const s = roof.slabs[0];
    if (s && mesh.begin(timber.bucket, 'remnant')) {
      const [a, b, , d] = s.corners;
      const n = Math.max(3, Math.floor(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.6));
      for (let k = 1; k < n; k++) {
        if (rng() < 0.45) continue;
        const t = k / n, y = a[1] - roof.thicknessM - 0.1;
        const p0: Vec3 = [a[0] + (b[0] - a[0]) * t, y, a[2] + (b[2] - a[2]) * t], p1: Vec3 = [d[0] + (b[0] - a[0]) * t, y - (rng() < 0.4 ? 0.5 + rng() : 0), d[2] + (b[2] - a[2]) * t];
        beamBetween(mesh, p0, p1, 0.14, 0.18, [0, 1, 0], rafterTint);
      }
    }
    for (let k = 0; k < 60; k++) {
      const p: Vec3 = [cx + (rng() - 0.5) * anatomy.w * 0.8, roof.eaveY - 0.3, cz + (rng() - 0.5) * anatomy.d * 0.8];
      if (!throwPieceAt(out.pieces, rng, cover.bucket, 'clod', p, [0.25 + rng() * 0.3, 0.15 + rng() * 0.2, 0.25 + rng() * 0.3], cover.tint, 1)) break;
    }
  }
  mesh.end();
  return { cuts: [], hides: [{ section: roof.section, partClass: 'roof' }] };
}

/** A piece from a body-frame point, falling with a small scatter. */
function throwPieceAt(out: DamagePieceWriter, rng: () => number, bucket: string, shape: DebrisShape, p: Vec3, s: [number, number, number], tint: Rgb, speed: number): boolean {
  const ang = rng() * Math.PI * 2;
  return out.push(bucket, shape, Math.floor(rng() * 4), p[0], p[1], p[2], 0, Math.sin(ang / 2), 0, Math.cos(ang / 2), s[0], s[1], s[2],
    tint[0], tint[1], tint[2], (rng() - 0.5) * speed, -speed * (0.5 + rng() * 0.5), (rng() - 0.5) * speed);
}

/**
 * `sectionDown` (P2, DESTRUCTION.md §3.4): the roof's section falls as its covering says (roofDown); a wall section's
 * fall is the core's default for now.
 */
export function sectionDownHouse(anatomy: StructureDamageAnatomy, section: number, seed: number,
  out: { mesh: DamageMeshWriter; pieces: DamagePieceWriter }): DamageStageResult {
  if (anatomy.roof && section === anatomy.roof.section) return roofDown(anatomy, seed, out);
  return { cuts: [], hides: [] };
}
