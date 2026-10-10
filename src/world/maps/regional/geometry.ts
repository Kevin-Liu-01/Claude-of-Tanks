// src/world/maps/regional/geometry.ts — the regional architecture kits' geometry kernel (regional-buildings lane,
// 2026-10-03). A kit emits boxes, extruded wall polygons and roof slabs straight into per-bucket arrays and finishes
// ONE BufferGeometry per (bucket, collision role) per building, so a 300-part half-timbered house costs a dozen
// geometries in the props bucket merge instead of three hundred. UVs are world-metre projections in the building's
// local frame (brick courses and slate rows line up across every part of one house), member-aligned for timbers and
// boards, or plane-aligned for roof slabs (rows parallel to the eaves).
//
// Parts that only dress a surface (timber framing, window joinery, shutters, gutters, signs) are emitted as DECOR: the
// finished geometry carries userData.noCollision and the structure collision derivation (structureCollision.ts)
// leaves it out, so a framing member 3 cm proud of the wall never becomes a collision part. Walls, roofs, chimneys,
// stairs and plinths stay structural.
import * as THREE from 'three';
import { NIGHT_EMISSION_ATTRIBUTE } from '../../../engine/nightEmissionMaterial.ts';

export type Vec3 = readonly [number, number, number];
export type Rgb = readonly [number, number, number];

/** The props buckets a regional kit may fill (props.ts mats / buckets). */
export const REGIONAL_BUCKETS = Object.freeze([
  'plaster', 'plaster2', 'plaster3', 'stone', 'roof', 'wood', 'dark', 'glass', 'curtain', 'straw',
  'structureMetal', 'structureWood',
  // the weathered, vertex-coloured walls and roofs (weather.ts moves the plain buckets here after a build)
  'regionalPlaster', 'regionalPlaster2', 'regionalPlaster3', 'regionalStone', 'regionalRoof',
] as const);
export type RegionalBucket = (typeof REGIONAL_BUCKETS)[number];
/** Buckets whose material is vertex-coloured: every part there carries a colour attribute. */
const COLOURED: ReadonlySet<string> = new Set(['structureMetal', 'structureWood', 'regionalPlaster', 'regionalPlaster2', 'regionalPlaster3',
  'regionalStone', 'regionalRoof']);
/** Buckets the weathering pass repaints: their parts may carry a per-vertex occlusion `shade` (reveals, soffits). */
const SHADED: ReadonlySet<string> = new Set(['plaster', 'plaster2', 'plaster3', 'stone', 'roof']);
/** World-metre UV density (texture repeats per metre) of each textured bucket's tile. */
export const BUCKET_UV_DENSITY: Readonly<Record<RegionalBucket, number>> = Object.freeze({
  plaster: 0.42, plaster2: 0.42, plaster3: 0.42, stone: 0.5, roof: 0.5, wood: 0.55, dark: 0.5,
  glass: 0.5, curtain: 0.5, straw: 0.45, structureMetal: 0.55, structureWood: 0.55,
  regionalPlaster: 0.42, regionalPlaster2: 0.42, regionalPlaster3: 0.42, regionalStone: 0.5, regionalRoof: 0.5,
});

export type RegionalParts = Record<RegionalBucket, THREE.BufferGeometry[]>;
export function newRegionalParts(): RegionalParts {
  return Object.fromEntries(REGIONAL_BUCKETS.map((name) => [name, []])) as unknown as RegionalParts;
}

/** UV mapping of one emitted solid. */
export type UvMode =
  /** world-metre projection by the dominant face axis (walls, plinths, chimneys: courses align across parts) */
  | { kind: 'world' }
  /** across the member's width (u) and along its length (v): timbers, boards, posts */
  | { kind: 'member' }
  /** a plane frame: u and v are the distances along two axes from an origin (roof slabs, hip faces) */
  | { kind: 'plane'; origin: Vec3; u: Vec3; v: Vec3 };
const WORLD: UvMode = Object.freeze({ kind: 'world' });
const MEMBER: UvMode = Object.freeze({ kind: 'member' });
export const UV_WORLD = WORLD;
export const UV_MEMBER = MEMBER;

interface Accumulator {
  pos: number[];
  nor: number[];
  uv: number[];
  col: number[] | null;
  mask: number[] | null;
  /** occlusion factor per vertex (weathered buckets only; 1 = open wall) */
  shade: number[] | null;
  /** paint multiplier per vertex, rgb (weathered buckets only; 1 = the surface's own colour) */
  tint: number[] | null;
}

export interface EmitOptions {
  /** vertex colour (required in a coloured bucket, ignored elsewhere) */
  colour?: Rgb;
  /** dressing only: no collision record (structureCollision.ts) */
  decor?: boolean;
  /**
   * dressing whose shadow still reads (a slatted mat's stripes on the ground): it keeps casting where the kit's other
   * joinery and metalwork dressing casts none (props.ts merges that into a receive-only mesh)
   */
  shadow?: boolean;
  /**
   * fine joinery a long view cannot resolve (window frames and glazing bars, shutter rails, door panels): props.ts
   * draws it only within the quality preset's fine-detail distance of the camera, and a phone never builds it.
   * 'near': the facade craft's finest pieces (a flower box, a shop's lettering, a gutter's hangers), which props.ts
   * draws within half that distance, in cells of their own (PartSink.near scopes a whole call the same way)
   */
  fine?: boolean | 'near';
  /**
   * a box seated on a wall (a timber, a shutter leaf): its outward face reads at any range, its sides and caps are
   * fine joinery (`fine`). Honoured by `box` for non-casting dressing; `member` sets it on every framing member.
   * 'near': those faces are near fine joinery (`fine` 'near'), on a box's `coarse` faces' complement as well
   */
  fineSides?: boolean | 'near';
  /**
   * laid on the terrain (the wall-foot strip, house.ts groundSkirt): a group of its own, which the weathering's wall-foot
   * band never cuts at its break heights (a part facing up takes no damp, so a cut would only add triangles)
   */
  ground?: boolean;
  uv?: UvMode;
  /** night window: the faces whose normal matches this unit vector glow (curtain bucket only) */
  window?: Vec3;
  /** UV density override (repeats per metre) */
  density?: number;
  /** occlusion of this part's surface (a reveal, a recess): multiplied into the weathered colour (weather.ts) */
  shade?: number;
  /** per-corner occlusion (a stain fading along a face), given the corner in the emitting frame; wins over `shade` */
  shadeAt?: (p: Vec3) => number;
  /** per-corner colour in a coloured bucket (a painted sheet weathering down its slope), emitting frame; wins over `colour` */
  colourAt?: (p: Vec3) => Rgb;
  /**
   * a cylinder's tile turned a quarter: its u along the axis, v round the ring (the straw tile's lay), so the sheet
   * steel's profile and panel seams run round an upright shell as horizontal plate courses (the Saar kit's furnaces,
   * stoves and gas mains: wave 176 read the ribs running up them as "wooden barrels or grain silos")
   */
  uvAxial?: boolean;
  /**
   * paint on a weathered surface (a limewash band, a painted dado, clay showing through): an rgb multiplier the
   * weathering pass folds into the building's tint (weather.ts), so the paint takes the wall's damp and grime as well
   */
  tint?: Rgb;
  /** per-corner paint (emitting frame); wins over `tint` */
  tintAt?: (p: Vec3) => Rgb;
}

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), tmpD = new THREE.Vector3();

/**
 * The per-building emission sink. `uvOffset` shifts every world/member UV of the building, so neighbouring houses
 * never print the same tile at the same wall position.
 */
export class PartSink {
  private groups = new Map<string, Accumulator>();
  /** triangles emitted so far (structural + decor) */
  triangles = 0;
  /** an optional placement of everything emitted (a wing built in its own frame): rotation about Y + offset */
  private place: { cos: number; sin: number; x: number; y: number; z: number } | null = null;
  readonly uvOffset: readonly [number, number];
  /**
   * The depth of the reveal the opening units are being built into (house.ts sets it around each dialect call of a
   * wall it has cut openings in; 0 everywhere else, where a unit sits on a solid face).
   */
  recess = 0;
  /** inside `near`: every fine emission is a near one (EmitOptions.fine 'near') */
  private nearDepth = 0;
  /**
   * The paint of a coloured bucket's parts emitted with no colour of their own (null: the neutral grey). A kit sets it
   * round a body whose walls it builds in a coloured bucket (a painted weatherboard cottage: Queenstown's cottageRow).
   */
  paint: Rgb | null = null;
  constructor(uvOffset: readonly [number, number] = [0, 0]) { this.uvOffset = uvOffset; }

  /** Emit `body` with its fine joinery drawn near the camera only (EmitOptions.fine 'near'; the facade craft). */
  near<T>(body: () => T): T {
    this.nearDepth++;
    try { return body(); } finally { this.nearDepth--; }
  }

  /**
   * Dressing a phone leaves out, drawn as the desktop draws it (docs/DESTRUCTION.md §8.4: a phone's collision is the
   * desktop's, index for index). On a desktop this is `body()`. On a phone `body` runs too, so every stream it draws
   * (the build stream, the look stream) stands where the desktop's does when the structure draws its next solid, but
   * nothing it emits is kept.
   */
  dressing(mobile: boolean, body: () => void): void {
    if (!mobile) { body(); return; }
    const kept = this.groups, triangles = this.triangles;
    this.groups = new Map();
    try { body(); } finally { this.groups = kept; this.triangles = triangles; }
  }

  /** Emit `body` with every point turned `yaw` about Y and moved by (x, y, z); UVs stay in the body's own frame. */
  placed(yaw: number, x: number, y: number, z: number, body: () => void): void {
    const prior = this.place;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    // nested placements compose: the child's frame is placed inside the parent's
    this.place = prior
      ? { cos: prior.cos * c - prior.sin * s, sin: prior.sin * c + prior.cos * s,
        x: x * prior.cos + z * prior.sin + prior.x, y: y + prior.y, z: -x * prior.sin + z * prior.cos + prior.z }
      : { cos: c, sin: s, x, y, z };
    try { body(); } finally { this.place = prior; }
  }

  /** The placement `placed` has open (its yaw and offset in the building's frame), or null in the building's own frame. */
  placement(): { yaw: number; x: number; y: number; z: number } | null {
    const pl = this.place;
    return pl ? { yaw: Math.atan2(pl.sin, pl.cos), x: pl.x, y: pl.y, z: pl.z } : null;
  }

  /** A point of the emitting frame in the building's frame (through the placements `placed` has open). */
  framePoint(p: Vec3): Vec3 {
    const pl = this.place;
    return pl ? [p[0] * pl.cos + p[2] * pl.sin + pl.x, p[1] + pl.y, -p[0] * pl.sin + p[2] * pl.cos + pl.z] : [p[0], p[1], p[2]];
  }

  private acc(bucket: RegionalBucket, decor: boolean, shadow = false, fine: boolean | 'near' = false, ground = false): Accumulator {
    const key = `${bucket}|${decor ? (fine ? (fine === 'near' || this.nearDepth > 0 ? 'n' : 'f') : shadow ? 'c' : 'd') : 's'}${ground ? '|g' : ''}`;
    let group = this.groups.get(key);
    if (!group) {
      group = { pos: [], nor: [], uv: [], col: COLOURED.has(bucket) ? [] : null, mask: bucket === 'curtain' ? [] : null,
        shade: SHADED.has(bucket) ? [] : null, tint: SHADED.has(bucket) ? [] : null };
      this.groups.set(key, group);
    }
    return group;
  }

  /** One planar quad, corners counter-clockwise seen from the side its normal points to. */
  quad(bucket: RegionalBucket, a: Vec3, b: Vec3, c: Vec3, d: Vec3, opts: EmitOptions = {}, local?: LocalFrame): void {
    this.polygon(bucket, [a, b, c, d], opts, local);
  }

  /** A convex planar polygon (fan triangulated), counter-clockwise seen from its outward side. */
  polygon(bucket: RegionalBucket, points: readonly Vec3[], opts: EmitOptions = {}, local?: LocalFrame): void {
    if (points.length < 3) return;
    tmpA.set(...points[0]); tmpB.set(...points[1]); tmpC.set(...points[2]);
    const normal = tmpD.subVectors(tmpB, tmpA).cross(tmpC.sub(tmpA));
    // a degenerate first corner: find any non-collinear triple
    if (normal.lengthSq() < 1e-14) {
      for (let i = 2; i < points.length && normal.lengthSq() < 1e-14; i++) {
        tmpA.set(...points[0]); tmpB.set(...points[1]); tmpC.set(...points[i]);
        normal.subVectors(tmpB, tmpA).cross(tmpC.sub(tmpA));
      }
      if (normal.lengthSq() < 1e-14) return;
    }
    normal.normalize();
    const n: Vec3 = [normal.x, normal.y, normal.z];
    const g = this.acc(bucket, !!opts.decor, !!opts.shadow, opts.fine === 'near' ? 'near' : !!opts.fine, !!opts.ground);
    const colour = g.col ? (opts.colour ?? this.paint ?? [0.6, 0.6, 0.6]) : null;
    const glow = g.mask && opts.window ? (n[0] * opts.window[0] + n[1] * opts.window[1] + n[2] * opts.window[2] > 0.999 ? 1 : 0) : 0;
    const density = opts.density ?? BUCKET_UV_DENSITY[bucket];
    const mode = opts.uv ?? WORLD;
    const pl = this.place;
    const nx = pl ? n[0] * pl.cos + n[2] * pl.sin : n[0], nz = pl ? -n[0] * pl.sin + n[2] * pl.cos : n[2];
    for (let i = 1; i + 1 < points.length; i++) {
      for (const p of [points[0], points[i], points[i + 1]]) {
        if (pl) g.pos.push(p[0] * pl.cos + p[2] * pl.sin + pl.x, p[1] + pl.y, -p[0] * pl.sin + p[2] * pl.cos + pl.z);
        else g.pos.push(p[0], p[1], p[2]);
        g.nor.push(nx, n[1], nz);
        const [u, v] = this.uvOf(p, n, mode, density, local);
        g.uv.push(u, v);
        if (g.col && colour) {
          const c = opts.colourAt ? opts.colourAt(p) : colour;
          g.col.push(c[0], c[1], c[2]);
        }
        if (g.mask) g.mask.push(glow);
        if (g.shade) g.shade.push(opts.shadeAt ? opts.shadeAt(p) : opts.shade ?? 1);
        if (g.tint) {
          const t = opts.tintAt ? opts.tintAt(p) : opts.tint;
          if (t) g.tint.push(t[0], t[1], t[2]); else g.tint.push(1, 1, 1);
        }
      }
      this.triangles++;
    }
  }

  private uvOf(p: Vec3, n: Vec3, mode: UvMode, density: number, local?: LocalFrame): [number, number] {
    const [ou, ov] = this.uvOffset;
    if (mode.kind === 'plane') {
      const dx = p[0] - mode.origin[0], dy = p[1] - mode.origin[1], dz = p[2] - mode.origin[2];
      return [(dx * mode.u[0] + dy * mode.u[1] + dz * mode.u[2]) * density + ou,
        (dx * mode.v[0] + dy * mode.v[1] + dz * mode.v[2]) * density + ov];
    }
    if (mode.kind === 'member' && local) {
      // local frame: x across the member, y along it, z out of the wall
      const lx = local.toLocal(p, 0), ly = local.toLocal(p, 1), lz = local.toLocal(p, 2);
      const ln0 = local.dirLocal(n, 0), ln1 = local.dirLocal(n, 1), ln2 = local.dirLocal(n, 2);
      const ax = Math.abs(ln0), ay = Math.abs(ln1), az = Math.abs(ln2);
      // members keep their grain along v; offset u so the plank seam of the detail tile misses a narrow timber
      if (az >= ax && az >= ay) return [lx * density + 0.1 + ou * 0.02, ly * density + ov];
      if (ax >= ay) return [lz * density + 0.1, ly * density + ov];
      return [lx * density + 0.1, lz * density + ov];
    }
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    if (ax >= ay && ax >= az) return [p[2] * density + ou, p[1] * density + ov];
    if (az >= ay) return [p[0] * density + ou, p[1] * density + ov];
    return [p[0] * density + ou, p[2] * density + ov];
  }

  /**
   * A box: centre, half sizes along the frame's axes (x across / y up-or-along / z out), optional rotation frame.
   * Without a frame the box is axis aligned in the building's local space.
   */
  box(bucket: RegionalBucket, centre: Vec3, half: Vec3, opts: EmitOptions = {}, frame?: LocalFrame, skip?: FaceSkip, coarse?: FaceSkip): void {
    const f = frame ?? IDENTITY;
    const c = (sx: number, sy: number, sz: number): Vec3 => f.toWorld(centre, sx * half[0], sy * half[1], sz * half[2]);
    const local = frame ? new LocalFrame(f.ax, f.ay, f.az, centre) : undefined;
    const o = { ...opts, uv: opts.uv ?? (frame ? MEMBER : WORLD) };
    const lf = o.uv.kind === 'member' ? (local ?? new LocalFrame(IDENTITY.ax, IDENTITY.ay, IDENTITY.az, centre)) : undefined;
    // the faces that stay coarse (a long view reads them) while every other face is fine joinery: `coarse`, or under
    // fineSides the +z face (a face frame's outward axis); non-casting dressing only
    const keep = opts.decor && !opts.shadow ? coarse ?? (opts.fineSides ? { pz: true } : null) : null;
    const fine = { ...o, fine: o.fine === 'near' || o.fineSides === 'near' ? 'near' as const : true };
    const at = (face: keyof FaceSkip) => (keep && !keep[face] ? fine : o);
    // +x, -x, +y, -y, +z, -z faces (corners ccw from outside)
    if (!skip?.px) this.quad(bucket, c(1, -1, 1), c(1, -1, -1), c(1, 1, -1), c(1, 1, 1), at('px'), lf);
    if (!skip?.nx) this.quad(bucket, c(-1, -1, -1), c(-1, -1, 1), c(-1, 1, 1), c(-1, 1, -1), at('nx'), lf);
    if (!skip?.py) this.quad(bucket, c(-1, 1, 1), c(1, 1, 1), c(1, 1, -1), c(-1, 1, -1), at('py'), lf);
    if (!skip?.ny) this.quad(bucket, c(-1, -1, -1), c(1, -1, -1), c(1, -1, 1), c(-1, -1, 1), at('ny'), lf);
    if (!skip?.pz) this.quad(bucket, c(-1, -1, 1), c(1, -1, 1), c(1, 1, 1), c(-1, 1, 1), at('pz'), lf);
    if (!skip?.nz) this.quad(bucket, c(1, -1, -1), c(-1, -1, -1), c(-1, 1, -1), c(1, 1, -1), at('nz'), lf);
  }

  /** Axis-aligned box from two opposite corners. */
  span(bucket: RegionalBucket, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, opts: EmitOptions = {}, coarse?: FaceSkip): void {
    const lo = [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], hi = [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)];
    if (hi[0] - lo[0] < 1e-4 || hi[1] - lo[1] < 1e-4 || hi[2] - lo[2] < 1e-4) return;
    this.box(bucket, [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2],
      [(hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2], opts, undefined, undefined, coarse);
  }

  /**
   * A dressed block on a body corner (a quoin): its two outward faces stay coarse, its caps and the faces in the wall
   * are fine joinery (a long view sees two faces of a block 3 cm proud). `sx`, `sz` are the corner's signs.
   */
  /**
   * A moulding run round a body (a string course, a cornice, a band): its four faces stay coarse, its top and underside
   * (a few centimetres of ledge proud of the wall) are fine joinery.
   */
  band(bucket: RegionalBucket, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, opts: EmitOptions = {}): void {
    this.span(bucket, x0, y0, z0, x1, y1, z1, opts, { px: true, nx: true, pz: true, nz: true });
  }

  quoin(bucket: RegionalBucket, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, sx: number, sz: number, opts: EmitOptions = {}): void {
    this.span(bucket, x0, y0, z0, x1, y1, z1, opts, { px: sx > 0, nx: sx < 0, pz: sz > 0, nz: sz < 0 });
  }

  /**
   * A timber member from a to b (both on the wall face plane), `width` across it in the face, `depth` out of the face
   * along `out` (unit). The member's back face sits `embed` metres inside the wall.
   */
  member(bucket: RegionalBucket, a: Vec3, b: Vec3, width: number, depth: number, out: Vec3, opts: EmitOptions & { ends?: boolean; exposed?: boolean } = {}, embed = 0.02): void {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-3) return;
    const ay: Vec3 = [dx / length, dy / length, dz / length];
    // across = ay × out (in the face plane)
    const ax: Vec3 = normalize3([ay[1] * out[2] - ay[2] * out[1], ay[2] * out[0] - ay[0] * out[2], ay[0] * out[1] - ay[1] * out[0]]);
    const frame = new LocalFrame(ax, ay, out, [0, 0, 0]);
    const mid = depth / 2 - embed;
    const centre: Vec3 = [(a[0] + b[0]) / 2 + out[0] * mid, (a[1] + b[1]) / 2 + out[1] * mid, (a[2] + b[2]) / 2 + out[2] * mid];
    // a framing member abuts its neighbours at both ends: only its face and two sides show (ends: true keeps the caps)
    // exposed: a free member (debris, a wheel spoke, a hip cap) keeps every face. A framing member's sides and caps
    // are fine joinery (EmitOptions.fineSides): a few centimetres deep, they are sub-pixel at a long view
    this.box(bucket, centre, [width / 2, length / 2, depth / 2], opts.exposed ? opts : { ...opts, fineSides: opts.fineSides === 'near' ? 'near' : true }, frame,
      opts.exposed ? undefined : opts.ends ? { nz: true } : { nz: true, py: true, ny: true });
  }

  /**
   * A convex polygon extruded by `depth` along `dir` (unit): the cap at `points` faces -dir, the far cap faces +dir.
   * Points are counter-clockwise seen from +dir.
   */
  prism(bucket: RegionalBucket, points: readonly Vec3[], dir: Vec3, depth: number, opts: EmitOptions = {}, capUv?: UvMode): void {
    const far = points.map((p): Vec3 => [p[0] + dir[0] * depth, p[1] + dir[1] * depth, p[2] + dir[2] * depth]);
    const capOpts = capUv ? { ...opts, uv: capUv } : opts;
    this.polygon(bucket, far, capOpts);
    this.polygon(bucket, [...points].reverse(), capOpts);
    const sideOpts = { ...opts, uv: opts.uv ?? WORLD };
    for (let i = 0; i < points.length; i++) {
      const p = points[i], q = points[(i + 1) % points.length];
      const pf = far[i], qf = far[(i + 1) % points.length];
      this.quad(bucket, p, q, qf, pf, sideOpts);
    }
  }

  /**
   * A cylinder (or frustum) along an axis: `radius` at the start, `radiusEnd` at the far end. UVs wrap around (u) and
   * run along (v); the caps take a world projection. `segments` ≥ 3.
   */
  cylinder(bucket: RegionalBucket, start: Vec3, axis: 'x' | 'y' | 'z', length: number, radius: number, segments = 8,
    opts: EmitOptions = {}, radiusEnd = radius, caps = true, phase = 0, arc = Math.PI * 2): void {
    const along: Vec3 = axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1];
    const e1: Vec3 = axis === 'y' ? [1, 0, 0] : [0, 1, 0];
    const e2: Vec3 = axis === 'x' ? [0, 0, 1] : axis === 'y' ? [0, 0, 1] : [1, 0, 0];
    // orient e1 × e2 = along so the side quads wind outward
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = cross[0] * along[0] + cross[1] * along[1] + cross[2] * along[2] < 0;
    // a partial arc (a vault, a half drum) is an open ring of segments + 1 points; a full ring closes on itself
    const closed = arc >= Math.PI * 2 - 1e-6;
    const count = closed ? segments : segments + 1;
    const ring = (r: number, t: number): Vec3[] => {
      const out: Vec3[] = [];
      for (let i = 0; i < count; i++) {
        const a = (flip ? -1 : 1) * (i / segments * arc + phase);
        const c = Math.cos(a) * r, sn = Math.sin(a) * r;
        out.push([start[0] + along[0] * t + e1[0] * c + e2[0] * sn, start[1] + along[1] * t + e1[1] * c + e2[1] * sn,
          start[2] + along[2] * t + e1[2] * c + e2[2] * sn]);
      }
      return out;
    };
    const a0 = ring(radius, 0), a1 = ring(radiusEnd, length);
    const density = opts.density ?? BUCKET_UV_DENSITY[bucket];
    for (let i = 0; i < segments; i++) {
      const j = closed ? (i + 1) % segments : i + 1;
      // side quad: UVs through a one-off plane frame (u along the ring chord, v along the axis)
      const chord = normalize3([a0[j][0] - a0[i][0], a0[j][1] - a0[i][1], a0[j][2] - a0[i][2]]);
      const plane = { kind: 'plane' as const, origin: a0[i], u: chord, v: along };
      // thatch combs along the axis (the straw tile's stalks run along its u)
      this.quad(bucket, a0[i], a0[j], a1[j], a1[i], { ...opts, uv: bucket === 'straw' || opts.uvAxial ? { ...plane, u: along, v: chord } : plane, density });
    }
    if (caps) {
      this.polygon(bucket, [...a1], { ...opts, uv: UV_WORLD });
      this.polygon(bucket, [...a0].reverse(), { ...opts, uv: UV_WORLD });
    }
  }

  /**
   * A smooth surface of revolution about an axis through `start` (the map-revival lane, 2026-10-07, Ironworks' furnaces
   * and stoves: wave 223 read `cylinder`'s twelve flat facets as "a visibly faceted octagonal prism"). `profile` lists
   * [distance along the axis, radius] from the start; each band between two profile points is shaded by its own slope,
   * blended with its neighbour's across a soft bend (under 25 degrees) and kept sharp at a lap or a shoulder, so the
   * shell reads round. The UVs run unbroken round the shell (u, the arc at the ring's radius) and along the axis (v);
   * `uvPin` instead pins every vertex to one texel (a plain plate: the steel tile's corrugation never shows). No caps.
   * `bandColour` (a coloured bucket) gives each band its own colour, given the band's index and the corner (emitting
   * frame), so a band's tone is flat and steps at its edges (a shell's plate courses); it wins over `colourAt`.
   */
  revolve(bucket: RegionalBucket, start: Vec3, axis: 'x' | 'y' | 'z', profile: ReadonlyArray<readonly [number, number]>,
    segments: number, opts: EmitOptions & { uvPin?: readonly [number, number]; bandColour?: (band: number, p: Vec3) => Rgb } = {}): void {
    if (profile.length < 2 || segments < 3) return;
    const along: Vec3 = axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1];
    const e1: Vec3 = axis === 'y' ? [1, 0, 0] : [0, 1, 0];
    const e2: Vec3 = axis === 'x' ? [0, 0, 1] : axis === 'y' ? [0, 0, 1] : [1, 0, 0];
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const sign = cross[0] * along[0] + cross[1] * along[1] + cross[2] * along[2] < 0 ? -1 : 1;
    // each band's outward normal in the (radial, axial) plane
    const bands: Array<[number, number]> = [];
    for (let k = 0; k + 1 < profile.length; k++) {
      const dt = profile[k + 1][0] - profile[k][0], dr = profile[k + 1][1] - profile[k][1], l = Math.hypot(dt, dr) || 1;
      bands.push([dt / l, -dr / l]);
    }
    const soft = Math.cos(25 * Math.PI / 180);
    const vertexNormal = (band: number, ring: number): [number, number] => {
      const own = bands[band], other = bands[ring === band ? band - 1 : band + 1];
      if (!other || own[0] * other[0] + own[1] * other[1] < soft) return own;
      const x = own[0] + other[0], y = own[1] + other[1], l = Math.hypot(x, y) || 1;
      return [x / l, y / l];
    };
    const g = this.acc(bucket, !!opts.decor, !!opts.shadow, !!opts.fine);
    const colour = g.col ? (opts.colour ?? [0.6, 0.6, 0.6]) : null;
    const density = opts.density ?? BUCKET_UV_DENSITY[bucket];
    const [ou, ov] = this.uvOffset;
    const pl = this.place;
    const corner = (ring: number, i: number, band: number): void => {
      const [t, r] = profile[ring], a = sign * (i / segments) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      const radial: Vec3 = [e1[0] * c + e2[0] * sn, e1[1] * c + e2[1] * sn, e1[2] * c + e2[2] * sn];
      const p: Vec3 = [start[0] + along[0] * t + radial[0] * r, start[1] + along[1] * t + radial[1] * r, start[2] + along[2] * t + radial[2] * r];
      const [nr, na] = vertexNormal(band, ring);
      const n: Vec3 = [radial[0] * nr + along[0] * na, radial[1] * nr + along[1] * na, radial[2] * nr + along[2] * na];
      if (pl) {
        g.pos.push(p[0] * pl.cos + p[2] * pl.sin + pl.x, p[1] + pl.y, -p[0] * pl.sin + p[2] * pl.cos + pl.z);
        g.nor.push(n[0] * pl.cos + n[2] * pl.sin, n[1], -n[0] * pl.sin + n[2] * pl.cos);
      } else { g.pos.push(p[0], p[1], p[2]); g.nor.push(n[0], n[1], n[2]); }
      if (opts.uvPin) g.uv.push(opts.uvPin[0], opts.uvPin[1]);
      else g.uv.push((i / segments) * Math.PI * 2 * r * density + ou, t * density + ov);
      if (g.col && colour) {
        const cc = opts.bandColour ? opts.bandColour(band, p) : opts.colourAt ? opts.colourAt(p) : colour;
        g.col.push(cc[0], cc[1], cc[2]);
      }
      if (g.mask) g.mask.push(0);
      if (g.shade) g.shade.push(opts.shadeAt ? opts.shadeAt(p) : opts.shade ?? 1);
      if (g.tint) { const tt = opts.tintAt ? opts.tintAt(p) : opts.tint; if (tt) g.tint.push(tt[0], tt[1], tt[2]); else g.tint.push(1, 1, 1); }
    };
    for (let k = 0; k + 1 < profile.length; k++) {
      if (Math.abs(profile[k + 1][0] - profile[k][0]) < 1e-9 && Math.abs(profile[k + 1][1] - profile[k][1]) < 1e-9) continue;
      for (let i = 0; i < segments; i++) {
        // (counter-clockwise seen from outside, as cylinder's side quads: this ring at i, i + 1, the next ring at i + 1, i)
        corner(k, i, k); corner(k, i + 1, k); corner(k + 1, i + 1, k);
        corner(k, i, k); corner(k + 1, i + 1, k); corner(k + 1, i, k);
        this.triangles += 2;
      }
    }
  }

  /**
   * A round pipe from `a` to `b` of radius `r` (`r1` at b), its normals smooth round it, its UVs unbroken (u round, v
   * along), or pinned to one texel with `uvPin`; its ends open (a joint or a flange covers them) unless `caps`, which
   * closes each with a flat disc. The map-revival lane, 2026-10-07: Ironworks' uptakes, downcomers and blast mains, where
   * a box member read as a square duct.
   */
  pipe(bucket: RegionalBucket, a: Vec3, b: Vec3, r: number, segments: number,
    opts: EmitOptions & { uvPin?: readonly [number, number]; caps?: boolean } = {}, r1 = r): void {
    const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(d[0], d[1], d[2]);
    if (len < 1e-6 || segments < 3) return;
    const ax = normalize3(d);
    // a side axis square to the pipe (any), and the third by the cross product
    const ref: Vec3 = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const s1 = normalize3([ax[1] * ref[2] - ax[2] * ref[1], ax[2] * ref[0] - ax[0] * ref[2], ax[0] * ref[1] - ax[1] * ref[0]]);
    const s2: Vec3 = [ax[1] * s1[2] - ax[2] * s1[1], ax[2] * s1[0] - ax[0] * s1[2], ax[0] * s1[1] - ax[1] * s1[0]];
    const g = this.acc(bucket, !!opts.decor, !!opts.shadow, !!opts.fine);
    const colour = g.col ? (opts.colour ?? [0.6, 0.6, 0.6]) : null;
    const density = opts.density ?? BUCKET_UV_DENSITY[bucket];
    const [ou, ov] = this.uvOffset;
    const pl = this.place;
    const slope = (r - r1) / len;
    const corner = (end: 0 | 1, i: number): void => {
      const ang = (i / segments) * Math.PI * 2, c = Math.cos(ang), sn = Math.sin(ang), rr = end ? r1 : r;
      const radial: Vec3 = [s1[0] * c + s2[0] * sn, s1[1] * c + s2[1] * sn, s1[2] * c + s2[2] * sn];
      const base = end ? b : a;
      const p: Vec3 = [base[0] + radial[0] * rr, base[1] + radial[1] * rr, base[2] + radial[2] * rr];
      const n = normalize3([radial[0] + ax[0] * slope, radial[1] + ax[1] * slope, radial[2] + ax[2] * slope]);
      if (pl) {
        g.pos.push(p[0] * pl.cos + p[2] * pl.sin + pl.x, p[1] + pl.y, -p[0] * pl.sin + p[2] * pl.cos + pl.z);
        g.nor.push(n[0] * pl.cos + n[2] * pl.sin, n[1], -n[0] * pl.sin + n[2] * pl.cos);
      } else { g.pos.push(p[0], p[1], p[2]); g.nor.push(n[0], n[1], n[2]); }
      if (opts.uvPin) g.uv.push(opts.uvPin[0], opts.uvPin[1]);
      else g.uv.push((i / segments) * Math.PI * 2 * rr * density + ou, end * len * density + ov);
      if (g.col && colour) { const cc = opts.colourAt ? opts.colourAt(p) : colour; g.col.push(cc[0], cc[1], cc[2]); }
      if (g.mask) g.mask.push(0);
      if (g.shade) g.shade.push(opts.shadeAt ? opts.shadeAt(p) : opts.shade ?? 1);
      if (g.tint) { const tt = opts.tintAt ? opts.tintAt(p) : opts.tint; if (tt) g.tint.push(tt[0], tt[1], tt[2]); else g.tint.push(1, 1, 1); }
    };
    for (let i = 0; i < segments; i++) {
      // (s1 x s2 = ax: the ring turns positively about the pipe's run, as cylinder's do about theirs, so its quad order —
      // this end at i, i + 1, the far end at i + 1, i — faces out)
      corner(0, i); corner(0, i + 1); corner(1, i + 1);
      corner(0, i); corner(1, i + 1); corner(1, i);
      this.triangles += 2;
    }
    if (opts.caps) {
      // the end discs: the far one counter-clockwise seen from along the run (it faces +ax), the near one reversed
      const ringAt = (base: Vec3, rr: number): Vec3[] => Array.from({ length: segments }, (_, i) => {
        const ang = (i / segments) * Math.PI * 2, c = Math.cos(ang), sn = Math.sin(ang);
        return [base[0] + (s1[0] * c + s2[0] * sn) * rr, base[1] + (s1[1] * c + s2[1] * sn) * rr, base[2] + (s1[2] * c + s2[2] * sn) * rr] as Vec3;
      });
      const { caps: _caps, uvPin, ...capOpts } = opts;
      const disc = { ...capOpts, ...(uvPin ? { uv: { kind: 'plane' as const, origin: a, u: s1, v: s2 }, density: 0 } : {}) };
      this.polygon(bucket, ringAt(b, r1), disc);
      this.polygon(bucket, ringAt(a, r).reverse(), disc);
    }
  }

  /** Finish: one geometry per (bucket, role), handed to the props bucket set. */
  finish(): RegionalParts {
    const parts = newRegionalParts();
    for (const [key, g] of this.groups) {
      if (!g.pos.length) continue;
      const [bucket, role, place] = key.split('|') as [RegionalBucket, 'd' | 'c' | 'f' | 'n' | 's', 'g' | undefined];
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      if (g.col) geometry.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
      if (g.mask) geometry.setAttribute(NIGHT_EMISSION_ATTRIBUTE, new THREE.BufferAttribute(Uint8Array.from(g.mask), 1));
      // the weathering pass consumes (and removes) the occlusion record; an all-open part carries none
      if (g.shade && g.shade.some((v) => v !== 1)) geometry.setAttribute('shade', new THREE.Float32BufferAttribute(g.shade, 1));
      if (g.tint && g.tint.some((v) => v !== 1)) geometry.setAttribute('tint', new THREE.Float32BufferAttribute(g.tint, 3));
      if (role !== 's') geometry.userData.noCollision = true;
      if (role === 'c') geometry.userData.castsShadow = true;
      if (role === 'f' || role === 'n') geometry.userData.fine = true;
      if (role === 'n') geometry.userData.fineNear = true;
      if (place === 'g') geometry.userData.onGround = true;
      geometry.userData.uvJitter = 'none';
      geometry.userData.regional = true;
      parts[bucket].push(geometry);
    }
    this.groups.clear();
    return parts;
  }
}

export interface FaceSkip { px?: boolean; nx?: boolean; py?: boolean; ny?: boolean; pz?: boolean; nz?: boolean }

export function normalize3(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** An orthonormal frame (ax across, ay up/along, az out) with an origin for member-local UVs. */
export class LocalFrame {
  readonly ax: Vec3;
  readonly ay: Vec3;
  readonly az: Vec3;
  readonly origin: Vec3;
  constructor(ax: Vec3, ay: Vec3, az: Vec3, origin: Vec3) { this.ax = ax; this.ay = ay; this.az = az; this.origin = origin; }
  toWorld(centre: Vec3, x: number, y: number, z: number): Vec3 {
    return [centre[0] + this.ax[0] * x + this.ay[0] * y + this.az[0] * z,
      centre[1] + this.ax[1] * x + this.ay[1] * y + this.az[1] * z,
      centre[2] + this.ax[2] * x + this.ay[2] * y + this.az[2] * z];
  }
  toLocal(p: Vec3, axis: 0 | 1 | 2): number {
    const a = axis === 0 ? this.ax : axis === 1 ? this.ay : this.az;
    return (p[0] - this.origin[0]) * a[0] + (p[1] - this.origin[1]) * a[1] + (p[2] - this.origin[2]) * a[2];
  }
  dirLocal(n: Vec3, axis: 0 | 1 | 2): number {
    const a = axis === 0 ? this.ax : axis === 1 ? this.ay : this.az;
    return n[0] * a[0] + n[1] * a[1] + n[2] * a[2];
  }
}
const IDENTITY = new LocalFrame([1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, 0]);

/** A wall face of a rectangular body: u runs left→right seen from outside, y up, out is the outward normal. */
export interface Face {
  /** point on the face plane at u = 0, y = 0 */
  origin: Vec3;
  u: Vec3;
  out: Vec3;
  /** face width along u, centred on origin (u from -width/2 to +width/2) */
  width: number;
}

/** The four faces of a w (x) × d (z) body centred on the origin: front +z, right +x, back -z, left -x. */
export function bodyFaces(w: number, d: number): { front: Face; right: Face; back: Face; left: Face } {
  return {
    front: { origin: [0, 0, d / 2], u: [1, 0, 0], out: [0, 0, 1], width: w },
    right: { origin: [w / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: d },
    back: { origin: [0, 0, -d / 2], u: [-1, 0, 0], out: [0, 0, -1], width: w },
    left: { origin: [-w / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: d },
  };
}

/** Building-local point of a face coordinate (u along the face, y up, o out of the face). */
export function facePoint(face: Face, u: number, y: number, o = 0): Vec3 {
  return [face.origin[0] + face.u[0] * u + face.out[0] * o, y + face.origin[1], face.origin[2] + face.u[2] * u + face.out[2] * o];
}

/** Faces of a face-aligned box that something else covers: its ends (u faces), top, bottom or back. */
export interface FaceBoxHidden { ends?: boolean; top?: boolean; bottom?: boolean; back?: boolean }

/** A face-aligned box: centre (u, y, out), size (along u, up, out). */
export function faceBox(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, y: number, o: number,
  su: number, sy: number, so: number, opts: EmitOptions = {}, hidden?: 'ends' | 'caps' | FaceBoxHidden): void {
  const centre = facePoint(face, u, y, o);
  const frame = new LocalFrame(face.u, [0, 1, 0], face.out, [0, 0, 0]);
  // a part seated on (or into) the wall never shows its back face: leave it out; 'ends' (u faces) and 'caps'
  // (top and bottom) abut neighbouring parts; a part mounted on another names what that part covers
  const h: FaceBoxHidden = hidden === 'ends' ? { ends: true } : hidden === 'caps' ? { top: true, bottom: true } : hidden ?? {};
  const seated = o - so / 2 <= 0.002;
  const skip: FaceSkip = { nz: seated || !!h.back, px: !!h.ends, nx: !!h.ends, py: !!h.top, ny: !!h.bottom };
  sink.box(bucket, centre, [su / 2, sy / 2, so / 2], { ...opts, uv: opts.uv ?? WORLD }, frame, skip);
}

/** A flat panel on a face (a window pane): one quad facing out, `o` metres proud of the wall plane. */
export function facePanel(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, y: number, o: number,
  su: number, sy: number, opts: EmitOptions = {}): void {
  const a = facePoint(face, u - su / 2, y - sy / 2, o), b = facePoint(face, u + su / 2, y - sy / 2, o);
  const c = facePoint(face, u + su / 2, y + sy / 2, o), d = facePoint(face, u - su / 2, y + sy / 2, o);
  sink.quad(bucket, a, b, c, d, { ...opts, uv: opts.uv ?? WORLD });
}

/** A deterministic stream from a 32-bit seed (mulberry32, the props convention). */
export function streamFrom(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** FNV-1a over a string and numbers: the per-building seed of a regional rebuild. */
export function hashSeed(text: string, ...values: number[]): number {
  let h = 2166136261 >>> 0;
  const eat = (byte: number) => { h ^= byte & 0xff; h = Math.imul(h, 16777619) >>> 0; };
  for (let i = 0; i < text.length; i++) eat(text.charCodeAt(i));
  for (const value of values) {
    const q = Math.round(value * 1000) | 0;
    eat(q); eat(q >>> 8); eat(q >>> 16); eat(q >>> 24);
  }
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0; h ^= h >>> 15;
  return h >>> 0;
}

export function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

/** sRGB hex → linear-ish float triple for vertex colours (vertex colours are linear in three). */
export function rgb(hex: number): Rgb {
  const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  return [c.r, c.g, c.b];
}

/** Scale a colour's brightness (vertex colour variation). */
export function shade(c: Rgb, k: number): Rgb {
  return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
}

/**
 * A plot read along its long side. A builder lays a long building along its local z (its d); on a plot wider than it is
 * deep (a market row is 12 x 5.2 m) it builds in a frame turned a quarter, so the building lies along the plot instead
 * of reaching out of its long sides. `w` and `d` are the plot in that frame (d the long side).
 */
export function plotAxes(info: { w: number; d: number }, slack = 1): { turned: boolean; w: number; d: number } {
  const turned = info.w > info.d + slack;
  return { turned, w: turned ? info.d : info.w, d: turned ? info.w : info.d };
}

/**
 * Emit `body` in the plot-axes frame: turned, the body's long faces look to the plot's +z and -z sides, and `front`
 * names the body's local x side (-1 or +1) that faces the plot's +z.
 */
export function alongPlot(sink: PartSink, turned: boolean, body: () => void, front: -1 | 1 = -1): void {
  if (turned) sink.placed(front < 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0, 0, body);
  else body();
}
