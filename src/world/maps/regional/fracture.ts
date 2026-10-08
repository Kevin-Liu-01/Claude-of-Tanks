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
    if (this.sampled && pen.s.colour?.(bucket, p[1], COL)) {
      return this.w.vertex(pen.x(p[0], p[2]), pen.y(p[1]), pen.z(p[0], p[2]), n[0], n[1], n[2], UV[0] + du, UV[1] + dv, COL[0] * k, COL[1] * k, COL[2] * k);
    }
    const kk = k * pen.s.weather(bucket, p[1]);
    return this.w.vertex(pen.x(p[0], p[2]), pen.y(p[1]), pen.z(p[0], p[2]), n[0], n[1], n[2], UV[0] + du, UV[1] + dv, tint[0] * kk, tint[1] * kk, tint[2] * kk);
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
  // the blocks the cut clipped and the blow left: their faces, clipped to the circle
  for (const b of blocks) {
    if (b.gone || inOpening(f, (b.u0 + b.u1) / 2, (b.y0 + b.y1) / 2)) continue;
    const poly = rectInCircle(b.u0, b.y0, b.u1, b.y1, cu, cy, r + OVERLAP);
    if (poly.length) mesh.facePoly(pen, bucket, poly.map(([u, y]) => [u, y, LIFT] as const), n, tint, 1);
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
      if (q.every(inFace) && !q.some((c) => inOpening(pen.f, c[0], c[1]))) mesh.facePoly(pen, skin.bucket, [q[0], q[3], q[2], q[1]], n, skin.tint, 1);
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
      if (q.every(inFace) && !q.some((c) => inOpening(pen.f, c[0], c[1]))) mesh.facePoly(pen, core.bucket, [q[0], q[3], q[2], q[1]], n, core.tint, 0.86);
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
  mesh.end();
  // the pieces: plates of render, chunks of the core, along the blow
  const speed = blowSpeed(hole), count = Math.min(24, Math.round(6 + r * 14));
  for (let k = 0; k < count; k++) {
    const th = rng() * Math.PI * 2, rad = Math.sqrt(rng()) * r * 0.8;
    const fromCore = core && k % 3 !== 0;
    const slot = fromCore ? core! : skin;
    const shape: DebrisShape = slot.material === 'plaster' ? 'plate' : slot.material === 'adobe' ? 'clod' : slot.material === 'brick' ? 'brick'
      : slot.material === 'plank' ? 'splinter' : slot.material === 'metal' ? 'sheet' : 'chunk';
    const s = 0.06 + rng() * 0.16;
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
  { x: number; y: number; z: number; nx: number; nz: number; radiusM: number; depthM: number } | null {
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
  return { x: pen.x(cu, 0), y: pen.y(cy), z: pen.z(cu, 0), nx: f.out[0], nz: f.out[2], radiusM: R, depthM: t + 0.01 };
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
