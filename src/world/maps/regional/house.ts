// src/world/maps/regional/house.ts — the shared house grammar of the regional architecture kits (regional-buildings
// lane, 2026-10-03). One rectangular body (plinth, storeys with optional jetties, gable or half-hip or hip or flat
// roof, gable walls, chimneys, gutters) laid out in the building's local frame with the ridge along Z, plus the
// window/door rhythm of each face. A style supplies a dialect: how a window, a door and (for half-timbered regions) a
// framed wall are dressed. Every body is centred on the origin with its base at y = 0, like the props builders.
import {
  LocalFrame, PartSink, bodyFaces, facePoint, faceBox, normalize3, UV_MEMBER,
  type Face, type RegionalBucket, type Rgb, type Vec3, type EmitOptions,
} from './geometry.ts';
import {
  carvedVerge, facadeGround, facadeGroundCraft, facadeLegacy, facadeOn, sillStreaks, styleGroundCraft, thatchCourses, withFacade,
  type FacadeContext,
} from './facade.ts';
import { withSillShadow } from './openings.ts';

/** The walls whose occlusion the weathering pass paints (geometry.ts SHADED): a sill's shadow lies on them. */
const SILL_SHADOWED: ReadonlySet<RegionalBucket> = new Set(['plaster', 'plaster2', 'plaster3', 'stone']);

export type RoofKind = 'gable' | 'halfhip' | 'hip' | 'flat' | 'shed';

export interface RoofSpec {
  kind: RoofKind;
  pitchDeg: number;
  /** horizontal eave overhang past the eaves walls (m) */
  eave: number;
  /** overhang past the gable walls (m) */
  verge: number;
  /** slab thickness (m) */
  thickness: number;
  bucket: RegionalBucket;
  /** half-hip: the fraction of the roof height the hip takes (0.3–0.5) */
  hipFrac?: number;
  /** hip pitch (defaults to the main pitch for a hip, 62° for a half-hip) */
  hipPitchDeg?: number;
  /** ridge cap profile */
  ridge?: 'round' | 'saddle' | null;
  /** flat roof parapet height (m) */
  parapet?: number;
  /** dressing only (a second covering over a structural slab): no collision */
  decor?: boolean;
  /**
   * a straw roof's thatch craft (facade.ts thatchCourses, desktop): the eaves beaten into steps of butt ends and course
   * lines up the slope ('stepped', the default), the course lines alone ('rows': a palm or grass thatch), a thick frayed
   * eave course alone ('nipa': an atap of nipa leaf, whose fine rows are the print's), or none
   */
  thatch?: 'stepped' | 'rows' | 'nipa' | 'none';
}

export interface StoreySpec {
  h: number;
  wall: RegionalBucket;
  /** timber-framed storey (the dialect's dressWall runs on it) */
  framed?: boolean;
  /** outward offset of this storey's faces over the one below (front, right, back, left) */
  jetty?: readonly [number, number, number, number];
}

export type FaceName = 'front' | 'right' | 'back' | 'left';

export interface Opening {
  face: FaceName;
  storey: number;
  kind: 'window' | 'door' | 'gate' | 'shopfront' | 'loft';
  /** centre along the face */
  u: number;
  w: number;
  /** bottom above the storey floor */
  y0: number;
  h: number;
  /** war wear: a burnt-out opening (charred void, soot plume up the wall) or one boarded over (wear pass) */
  state?: 'burnt' | 'boarded';
}

export interface ChimneySpec {
  /** position in the body frame */
  x: number;
  z: number;
  /** stack section (m) */
  sx: number;
  sz: number;
  /** metres above the local roof surface the stack rises */
  above: number;
  bucket: RegionalBucket;
  /** cap style */
  cap?: 'slab' | 'tile' | 'pots' | 'none';
  /** a gable-end stack standing in the gable wall (Breton): rises from the ground inside the wall */
  inWall?: boolean;
}

export interface HouseSpec {
  w: number;
  d: number;
  plinth: { h: number; out: number; bucket: RegionalBucket } | null;
  storeys: StoreySpec[];
  roof: RoofSpec;
  /** the wall bucket of the gable triangles (defaults to the top storey's wall) */
  gableBucket?: RegionalBucket;
  /** the gable triangles are timber framed */
  gableFramed?: boolean;
  openings: Opening[];
  chimneys: ChimneySpec[];
  gutters?: { colour: Rgb } | null;
  /**
   * verge boards along the gable rakes; `carved` (facade craft, desktop) cuts their lower edge in scallops and hangs the
   * carved towel board (polotentse) from the apex, in its colour
   */
  verge?: { colour: Rgb; bucket: RegionalBucket; carved?: Rgb } | null;
  /** the roof covering's livery when it lies in a vertex-coloured bucket (painted sheet) */
  roofColour?: Rgb;
  /**
   * Depth of the openings' reveals (m): every window and door is cut into its storey wall and its unit is set back
   * this far, the jambs, head and sill showing the wall's thickness (granite 0.3+, brick 0.15, a framed wall 0.1).
   */
  reveal?: number;
  /** rafter feet showing under the eaves overhang (their colour), or none (a kit leaves them out on phones) */
  rafters?: Rgb | null;
  /**
   * The masonry a rendered storey shows where its render has spalled (rising damp at the wall foot, the drip under a
   * sill, a splinter scar): the kit's stone by default, null for none (a clay or wattle wall has no stone under it)
   */
  spall?: RegionalBucket | null;
  /** the paint (EmitOptions.tint) of what the spalled render shows: clay under a khata's whitewash */
  spallTint?: Rgb;
  /** the spalled patches' size (1: the default; the draws are the same whatever it is) */
  spallScale?: number;
  /**
   * the drip strip round the wall foot and the path from the front door (facade craft, desktop; groundSkirt): by
   * default the plinth's bucket on a house with a plinth (setts, gravel) and none on one without (it may stand raised
   * on piers); `colour` in a coloured bucket, `tint` (EmitOptions.tint) over a weathered one (a khata's trodden clay
   * over the render); null for none
   */
  skirt?: { bucket: RegionalBucket; colour?: Rgb; tint?: Rgb } | null;
}

/** What a dialect sees of the house it dresses. */
export interface HouseFrame {
  spec: HouseSpec;
  faces: Record<FaceName, Face>;
  /** storey floor heights (index i → bottom of storey i) and the eave (top of the top storey) */
  floors: number[];
  eaveY: number;
  /** the body half extents of each storey (with jetties) */
  bodies: Array<{ x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }>;
  roof: RoofGeometry;
  /** the openings' reveal depth (HouseSpec.reveal) */
  reveal: number;
}

export interface HouseDialect {
  /** a window unit: frame, pane, sill, shutters */
  window(sink: PartSink, face: Face, o: Opening, y0: number, frame: HouseFrame): void;
  /** a door unit with its threshold and steps (y0 is the floor of the storey) */
  door(sink: PartSink, face: Face, o: Opening, y0: number, frame: HouseFrame): void;
  /** a framed storey wall: the members around its openings */
  dressWall?(sink: PartSink, face: Face, rect: WallRect, openings: Opening[], frame: HouseFrame): void;
  /** a framed gable: the members inside the gable polygon (u, y pairs on the face) */
  dressGable?(sink: PartSink, face: Face, polygon: Array<[number, number]>, frame: HouseFrame): void;
  /** under-jetty beam ends and sill beams */
  dressJetty?(sink: PartSink, face: Face, u0: number, u1: number, y: number, depth: number, frame: HouseFrame): void;
}

export interface WallRect { u0: number; u1: number; y0: number; y1: number }

/** The roof's measured geometry (ridge along Z). */
export interface RoofGeometry {
  kind: RoofKind;
  /** half width of the wall top the roof bears on */
  s: number;
  /** half depth of the body under the roof */
  halfD: number;
  tanP: number;
  eaveY: number;
  /** ridge height of the slab underside, and of its top surface */
  ridgeY: number;
  ridgeTopY: number;
  /** the gable wall polygon on the z = ±halfD planes, as (u, y) pairs with u along x (front face orientation) */
  gable: Array<[number, number]> | null;
  /** half length of the ridge line */
  ridgeHalf: number;
  /** roof top surface height above (x, z), or null outside the roof */
  topAt(x: number, z: number): number | null;
}

const DEG = Math.PI / 180;
const FACE_NAMES: readonly FaceName[] = ['front', 'right', 'back', 'left'];

/**
 * War wear of the houses being built (index.ts sets it around a kit build; builders are synchronous, so the module
 * slot never leaks between buildings): `amount` is the share of houses showing damage, drawn from the wear stream, never
 * the build stream, so an undamaged house builds exactly as it would without wear.
 */
interface WearContext {
  amount: number;
  rng: () => number;
  /** spalled render (decor only) draws from its own stream: the damage decisions above never move */
  spall?: () => number;
  /** the facade craft's slot for the building (facade.ts withFacade), set with the wear */
  facade?: FacadeContext;
}
let wearContext: WearContext | null = null;
export function withWear<T>(wear: WearContext | null, build: () => T): T {
  const prior = wearContext;
  wearContext = wear;
  try { return wear?.facade ? withFacade(wear.facade, build) : build(); } finally { wearContext = prior; }
}

interface RoofPatch { side: 1 | -1; z0: number; z1: number; x0: number; x1: number }

/** Mark a damaged house's openings (burnt, boarded) and pick its stripped roof patch. */
function wearHouse(spec: HouseSpec, rg: RoofGeometry): RoofPatch | null {
  const wear = wearContext;
  if (!wear || wear.amount <= 0) return null;
  const rng = wear.rng;
  if (rng() >= wear.amount) return null;
  const windows = spec.openings.filter((o) => o.kind === 'window');
  // one fire guts a room: a burnt window takes its neighbours on the same storey and face with it
  const n = Math.min(windows.length, 1 + Math.floor(rng() * 4));
  for (let k = 0; k < n; k++) {
    const o = windows[Math.floor(rng() * windows.length)];
    if (o.state) continue;
    o.state = rng() < 0.6 ? 'burnt' : 'boarded';
    if (o.state === 'burnt') {
      for (const q of windows) if (!q.state && q.face === o.face && q.storey === o.storey && Math.abs(q.u - o.u) < 2.2 && rng() < 0.6) q.state = 'burnt';
    }
  }
  if (rg.kind === 'flat' || rg.kind === 'shed' || rng() >= 0.7) return null;
  // tiles blown off: a patch on one slope, between the ridge and the eaves, inside the ridge run
  const run = rg.s * 0.98, len = Math.max(0.6, rg.ridgeHalf * 1.6);
  const w = 0.9 + rng() * 1.4, h = Math.min(run * 0.8, 0.8 + rng() * 1.3);
  const zc = (rng() - 0.5) * Math.max(0, len - w), x0 = 0.25 + rng() * Math.max(0, run - h - 0.35);
  return { side: rng() < 0.5 ? 1 : -1, z0: zc - w / 2, z1: zc + w / 2, x0, x1: x0 + h };
}

/** A stripped roof patch: the tiles gone, the void under them, battens and two rafters left across it. */
function emitRoofPatch(sink: PartSink, rg: RoofGeometry, roof: RoofSpec, p: RoofPatch): void {
  const cosP = Math.cos(Math.atan(rg.tanP));
  const top = (x: number) => rg.ridgeY + roof.thickness / cosP - x * rg.tanP;
  const on = (x: number, z: number, lift: number): Vec3 => [p.side * x, top(x) + lift / cosP, z];
  // the void: a dark plane just proud of the covering, its outline ragged along the courses
  const pts: Vec3[] = [];
  const steps = 5;
  for (let i = 0; i <= steps; i++) pts.push(on(p.x0 + (i % 2) * 0.06, p.z0 + (p.z1 - p.z0) * i / steps, 0.012));
  for (let i = steps; i >= 0; i--) pts.push(on(p.x1 - (i % 2) * 0.08, p.z0 + (p.z1 - p.z0) * i / steps, 0.012));
  // ccw seen from above the slope: the +x slope reads z from z0 to z1 along the ridge-side edge
  sink.polygon('dark', p.side > 0 ? pts : pts.reverse(), { decor: true });
  const n = normalize3([p.side * Math.sin(Math.atan(rg.tanP)), cosP, 0]);
  const batten: Rgb = [0.42, 0.33, 0.22], rafter: Rgb = [0.3, 0.22, 0.15];
  for (let x = p.x0 + 0.14; x < p.x1 - 0.06; x += 0.3) {
    sink.member('structureWood', on(x, p.z0 + 0.02, 0.02), on(x, p.z1 - 0.02, 0.02), 0.045, 0.03, n, { colour: batten, decor: true, ends: true });
  }
  for (const z of [p.z0 + 0.18, p.z1 - 0.18]) {
    sink.member('structureWood', on(p.x0 + 0.02, z, 0.0), on(p.x1 - 0.02, z, 0.0), 0.1, 0.06, n, { colour: rafter, decor: true, ends: true });
  }
}

/** A damaged window: burnt out (a charred frame in the void) or boarded over with salvaged planks. */
function damagedOpening(sink: PartSink, face: Face, o: Opening, y0: number, reveal: number): void {
  const u = o.u, y = y0 + o.y0, w = o.w, h = o.h;
  if (o.state === 'burnt') {
    const char: Rgb = [0.06, 0.05, 0.045];
    const back = reveal > 0 ? -reveal : 0;
    faceBox(sink, 'structureWood', face, u - w / 2 + 0.035, y + h / 2, back + 0.03, 0.06, h, 0.06, { colour: char, decor: true });
    faceBox(sink, 'structureWood', face, u + 0.1, y + h * 0.35, back + 0.03, 0.05, h * 0.62, 0.05, { colour: char, decor: true });
    faceBox(sink, 'structureWood', face, u, y + 0.035, back + 0.03, w - 0.07, 0.06, 0.06, { colour: char, decor: true }, 'ends');
    return;
  }
  // boarded: three or four planks nailed across the reveal mouth at odd angles
  const plank: Rgb = [0.5, 0.43, 0.34];
  const count = h > 1 ? 4 : 3;
  for (let k = 0; k < count; k++) {
    const yy = y + h * (k + 0.5) / count, tilt = (k % 2 ? 1 : -1) * 0.05;
    sink.member('structureWood', facePoint(face, u - w / 2 - 0.08, yy - tilt), facePoint(face, u + w / 2 + 0.08, yy + tilt),
      0.17, 0.025, face.out, { colour: [plank[0] * (0.85 + k * 0.05), plank[1] * (0.85 + k * 0.05), plank[2] * (0.85 + k * 0.05)], decor: true, ends: true }, -0.004);
  }
}

/**
 * The ground at the wall foot (facade craft, desktop; wave 172: "buildings set straight onto flat dirt or lawn with no
 * plinth, path, grime or contact shadow"; wave 199: "no plinth, path or splash zone"): a drip strip of the kit's paving
 * round the plinth, darkest against the wall (the contact shadow the ground takes there), and a short path of the same
 * out from each ground-floor door.
 *
 * A placed building (facadeGround: props.ts hands the build the rendered terrain) lays both on the ground, in runs of at
 * most SKIRT_RUN, every corner SKIRT_LIFT over the terrain under it (a path a centimetre over the strip), and keeps the
 * grass, tall grass and litter off them (discs along the strip and over each path, held with the yards' ground-cover
 * holes). The house stands at the lowest ground its plot touches (props.ts groundFit) and its plinth reaches 0.6 m below
 * that, so the strip meets the plinth wherever the ground lies. A bare build (the receipts) lays the strip level 4 cm over
 * the base, its outer edge a lip down into the ground. Decor.
 */
const SKIRT_W = 0.45, SKIRT_RUN = 1.5, SKIRT_LIFT = 0.03;
/**
 * (the facades lane, round 10; gauntlet wave 301, both critics: "houses stand on bare dirt or lawn with a hard line", "no
 * plinths, steps, yards"; the 45 cm strip lay under the grass cards' tips) the apron a style's ground craft lays
 * (facadeGroundCraft): 80 cm of paving round the plinth, the grass held off it, and the door paths 1.5 m long
 */
const APRON_W = 0.8, APRON_PATH = 1.5;
function groundSkirt(sink: PartSink, spec: HouseSpec, faces: Record<FaceName, Face>): void {
  // (a house on a plinth stands on the ground; one without may stand raised on piers, so it takes a strip only by name)
  const sk = spec.skirt === undefined ? (spec.plinth ? { bucket: spec.plinth.bucket } : null) : spec.skirt;
  // (round 10) a map gated back to the older craft lays no strip (KIT_LEGACY_MAPS)
  if (!sk || facadeLegacy()) return;
  const o = spec.plinth ? spec.plinth.out : 0;
  const x0 = -spec.w / 2 - o, x1 = spec.w / 2 + o, z0 = -spec.d / 2 - o, z1 = spec.d / 2 + o;
  const wide = facadeGroundCraft();
  const W = wide ? APRON_W : SKIRT_W, top = 0.04, ground = facadeGround();
  // darkest against the wall; a level strip's lips (below its top) a little lighter
  const shadeOf = (p: Vec3): number => {
    if (!ground && p[1] < top - 0.01) return 0.8;
    const wall = Math.max(Math.abs(p[0]) - x1, Math.abs(p[2]) - z1, 0);
    return wall < 0.01 ? 0.55 : 0.95;
  };
  // fine dressing: out of the shadow maps and the always-drawn meshes, drawn by the fine-detail cells (a strip 45 cm wide
  // reads within their distance; past it the ground's own contact decal stands for it)
  const onGround = ground ? { ground: true } : {};
  const opts: EmitOptions = sk.colour ? { decor: true, fine: true, ...onGround, colourAt: (p: Vec3) => shadeRgb(sk.colour as Rgb, shadeOf(p)) }
    : { decor: true, fine: true, ...onGround, shadeAt: shadeOf, ...(sk.tint ? { tint: sk.tint } : {}) };
  // a polygon wound to face along `n` (its corners in any order round it)
  const quad = (pts: Vec3[], n: Vec3) => {
    const [a, b, c] = pts;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cx = u[1] * v[2] - u[2] * v[1], cy = u[2] * v[0] - u[0] * v[2], cz = u[0] * v[1] - u[1] * v[0];
    sink.polygon(sk.bucket, cx * n[0] + cy * n[1] + cz * n[2] >= 0 ? pts : [...pts].reverse(), opts);
  };
  const up: Vec3 = [0, 1, 0];
  const X0 = x0 - W, X1 = x1 + W, Z0 = z0 - W, Z1 = z1 + W;
  // the doors' paths: a slab out to a metre from the plinth, as wide as the door and 18 cm either side
  const paths = spec.openings.filter((op) => op.storey === 0 && op.kind === 'door' && !op.state).map((op) => {
    const f = faces[op.face], hw = op.w / 2 + 0.18, L = wide ? APRON_PATH : 1.0;
    const at = (du: number, out: number): [number, number] => [f.origin[0] + f.u[0] * (op.u + du) + f.out[0] * (out + o),
      f.origin[2] + f.u[2] * (op.u + du) + f.out[2] * (out + o)];
    return { f, hw, L, at };
  });
  if (!ground) {
    // a bare build: level 4 cm over the base, the outer edge a lip down into the ground
    quad([[x0, top, z1], [x1, top, z1], [X1, top, Z1], [X0, top, Z1]], up);
    quad([[x1, top, z0], [x0, top, z0], [X0, top, Z0], [X1, top, Z0]], up);
    quad([[x1, top, z1], [x1, top, z0], [X1, top, Z0], [X1, top, Z1]], up);
    quad([[x0, top, z0], [x0, top, z1], [X0, top, Z1], [X0, top, Z0]], up);
    const lip = -0.3;
    quad([[X0, top, Z1], [X1, top, Z1], [X1, lip, Z1], [X0, lip, Z1]], [0, 0, 1]);
    quad([[X0, top, Z0], [X1, top, Z0], [X1, lip, Z0], [X0, lip, Z0]], [0, 0, -1]);
    quad([[X1, top, Z0], [X1, top, Z1], [X1, lip, Z1], [X1, lip, Z0]], [1, 0, 0]);
    quad([[X0, top, Z0], [X0, top, Z1], [X0, lip, Z1], [X0, lip, Z0]], [-1, 0, 0]);
    for (const { f, hw, L, at } of paths) {
      const y = top + 0.01, deep = -0.5;
      const p3 = (du: number, out: number, yy: number): Vec3 => { const [x, z] = at(du, out); return [x, yy, z]; };
      const side = (s: number): Vec3 => [f.u[0] * s, 0, f.u[2] * s];
      quad([p3(-hw, 0, y), p3(hw, 0, y), p3(hw, L, y), p3(-hw, L, y)], up);
      quad([p3(-hw, L, y), p3(hw, L, y), p3(hw, L, deep), p3(-hw, L, deep)], [f.out[0], 0, f.out[2]]);
      quad([p3(hw, 0, y), p3(hw, L, y), p3(hw, L, deep), p3(hw, 0, deep)], side(1));
      quad([p3(-hw, 0, y), p3(-hw, L, y), p3(-hw, L, deep), p3(-hw, 0, deep)], side(-1));
    }
    return;
  }
  // on the ground: each corner `lift` over the terrain under it (the building's frame through the sink's placements)
  const on = (x: number, z: number, lift: number): Vec3 => {
    const q = sink.framePoint([x, 0, z]);
    return [x, ground.at(q[0], q[2]) - q[1] + lift, z];
  };
  const hole = (x: number, z: number, r: number): void => {
    if (!ground.hole) return;
    const q = sink.framePoint([x, 0, z]);
    ground.hole(q[0], q[2], r);
  };
  // the four runs, mitred at the corners: inner edge along the plinth, outer edge W out, cut into pieces at most SKIRT_RUN
  // long; the corners the runs share sample the same ground, so the strip has no seam
  const runs: Array<[[number, number], [number, number], [number, number], [number, number]]> = [
    [[x0, z1], [x1, z1], [X0, Z1], [X1, Z1]], [[x1, z1], [x1, z0], [X1, Z1], [X1, Z0]],
    [[x1, z0], [x0, z0], [X1, Z0], [X0, Z0]], [[x0, z0], [x0, z1], [X0, Z0], [X0, Z1]],
  ];
  for (const [a, b, A, B] of runs) {
    const n = Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / SKIRT_RUN));
    const inner = (k: number) => on(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, SKIRT_LIFT);
    const outer = (k: number) => on(A[0] + (B[0] - A[0]) * k / n, A[1] + (B[1] - A[1]) * k / n, SKIRT_LIFT);
    for (let k = 0; k < n; k++) {
      const i0 = inner(k), i1 = inner(k + 1), o0 = outer(k), o1 = outer(k + 1);
      // two triangles, each lit by its own facing (the ground under a piece need not be planar)
      quad([i0, i1, o1], up);
      quad([i0, o1, o0], up);
    }
  }
  for (const { hw, L, at } of paths) {
    const m = Math.max(1, Math.ceil(2 * hw / SKIRT_RUN));
    for (let k = 0; k < m; k++) {
      const u0 = -hw + 2 * hw * k / m, u1 = -hw + 2 * hw * (k + 1) / m;
      const [a, b, c, d] = [at(u0, 0), at(u1, 0), at(u1, L), at(u0, L)].map(([x, z]) => on(x, z, SKIRT_LIFT + 0.01));
      quad([a, b, c], up);
      quad([a, c, d], up);
    }
  }
  // the strip's ground grows nothing: discs along its midline, W apart and W/sqrt2 across (they cover it corner to
  // corner), and a row of discs over each path
  const R = W / Math.SQRT2 + 0.01;
  const mx0 = x0 - W / 2, mx1 = x1 + W / 2, mz0 = z0 - W / 2, mz1 = z1 + W / 2;
  for (const [ax, az, bx, bz] of [[mx0, mz1, mx1, mz1], [mx1, mz1, mx1, mz0], [mx1, mz0, mx0, mz0], [mx0, mz0, mx0, mz1]]) {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / W));
    for (let k = 0; k < n; k++) hole(ax + (bx - ax) * k / n, az + (bz - az) * k / n, R);
  }
  for (const { hw, L, at } of paths) {
    const n = Math.ceil(2 * hw / L) + 1;
    for (let k = 0; k < n; k++) { const [x, z] = at(-hw + 2 * hw * k / (n - 1), L / 2); hole(x, z, L / Math.SQRT2 + 0.01); }
  }
}

/** Lay out a roof over a w × d wall top at height eaveY (ridge along Z). */
const RENDERS: ReadonlySet<RegionalBucket> = new Set<RegionalBucket>(['plaster', 'plaster2', 'plaster3']);

/**
 * Spalled render on a worn house (gauntlet wave 0: "no wear"): where a rendered storey's render has fallen away, the
 * masonry under it shows: a ragged band at the wall foot (rising damp), a patch under a sill (the drip), a scar in a
 * pier (a splinter, a sheet come loose). Decor 15 mm proud of the wall, clear of every opening, from the
 * wear context's own spall stream: the walls, the damage decisions and the collision never change.
 */
function spallRender(sink: PartSink, spec: HouseSpec, wall: RegionalBucket, face: Face,
  body: { y0: number; y1: number }, storey: number, own: readonly Opening[]): void {
  const wear = wearContext, rng = wear?.spall;
  const bucket = spec.spall === undefined ? 'stone' : spec.spall;
  if (!wear || !rng || wear.amount <= 0 || !bucket || !RENDERS.has(wall)) return;
  if (rng() >= Math.min(0.75, 0.25 + 1.5 * wear.amount)) return;
  const half = face.width / 2, y0 = body.y0, y1 = body.y1;
  const keepOut = own.map((o) => ({ u0: o.u - o.w / 2 - 0.1, u1: o.u + o.w / 2 + 0.1, y0: y0 + o.y0 - 0.1, y1: y0 + o.y0 + o.h + 0.1 }));
  const windows = own.filter((o) => o.kind === 'window' && !o.state);
  // (facade craft, desktop; wave 172: "a hard-edged texture-blend patch on the blank Steinburg gable") each loss in its
  // layers (layeredLoss); the losses keep their places and count, so the craft only adds to the plain build
  const crafted = facadeOn() && !spec.spallTint && !facadeLegacy();
  const n = 1 + Math.floor(rng() * 3);
  for (let k = 0; k < n; k++) {
    const roll = rng(), a = rng(), b = rng(), c = rng();
    let cu: number, cy: number, ru: number, ry: number;
    const k = spec.spallScale ?? 1;
    // (wave 199 on a Steinburg gable: "three near-identical pasted brick-patch decals"; on a khata, "grey blobs under the
    // windows") each kind of loss its own shape: a band, a tongue, a lobed scar
    let kind: 'damp' | 'drip' | 'scar';
    if (roll < 0.4 && storey === 0) {
      // rising damp: a ragged band along the wall foot, its top edge wandering
      kind = 'damp';
      // (its foot, squashed to 0.4, never dips under the wall's: the centre stands 0.55 of its height up)
      ru = (0.8 + a * 1.4) * k; ry = (0.26 + b * 0.36) * k; cu = (c - 0.5) * (face.width - 2 * ru); cy = y0 + 0.03 + ry * 0.55;
    } else if (roll < 0.7 && windows.length) {
      // the sill's drip has washed the render off below it: a tongue, flat under the sill, narrowing as it runs down
      kind = 'drip';
      const o = windows[Math.floor(a * windows.length)];
      // (its top, squashed to 0.5 and lobed up to 1.32, stays 12 cm under the sill, clear of the window's keep-out)
      ru = o.w * (0.4 + b * 0.35) * k; ry = (0.3 + c * 0.45) * k; cu = o.u + (b - 0.5) * o.w * 0.3; cy = y0 + o.y0 - 0.12 - ry * 0.66;
    } else {
      // a scar in a pier: a splinter strike, a sheet come loose
      kind = 'scar';
      ru = (0.3 + a * 0.6) * k; ry = ru * (0.45 + b * 0.75); cu = (c - 0.5) * (face.width - 2 * ru);
      cy = y0 + ry + 0.25 + rng() * Math.max(0, y1 - y0 - 2 * ry - 0.5);
    }
    // a ragged outline, star-shaped about its centre (the fan below needs no more): two to four lobes, and the radius
    // wandering vertex to vertex
    // (r6 views: a 0.32 lobe on a small scar read as a star) the lobes a gentle swell, never a point
    const lobes = 2 + Math.floor(rng() * 3), phase = rng() * Math.PI * 2, lobe = 0.08 + rng() * 0.12;
    const ragged: Array<[number, number]> = [];
    let lu = Infinity, hu = -Infinity, ly = Infinity, hy = -Infinity;
    for (let j = 0; j < 11; j++) {
      const t = (j / 11) * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
      const r = (0.62 + rng() * 0.38) * (1 + lobe * Math.cos(lobes * t + phase));
      const su = kind === 'drip' && st < 0 ? 1 + 0.6 * st : 1;
      const sv = kind === 'drip' ? (st > 0 ? 0.5 : 1.25) : kind === 'damp' ? (st > 0 ? 1 : 0.4) : 1;
      const p: [number, number] = [cu + ct * ru * r * su, cy + st * ry * r * sv];
      ragged.push(p);
      lu = Math.min(lu, p[0]); hu = Math.max(hu, p[0]); ly = Math.min(ly, p[1]); hy = Math.max(hy, p[1]);
    }
    // (the facades lane, round 10; gauntlet wave 301, both critics, eleven Steinburg frames: "pasted brick-patch decals",
    // "circular", "diamond-shaped", "leaf-shaped", "stickers") a loss in the render reads as a decal at every range the
    // game is seen at — the damp's ragged foot band as a lump at the wall foot (offline renders, the Frontier nave): on a
    // style with the ground craft none is drawn, by any build (their draws kept, so a khata's keep their shapes); the
    // weathering pass's damp band (weather.ts) and the plinth's water table carry the wall foot
    if (styleGroundCraft()) continue;
    if (Math.max(Math.abs(lu), Math.abs(hu)) > half - 0.08 || ly < y0 + 0.02 || hy > y1 - 0.08) continue;
    if (keepOut.some((h) => hu > h.u0 && lu < h.u1 && hy > h.y0 && ly < h.y1)) continue;
    // (the bounds the rings below grow from: the outline's own extent about its centre)
    ru = Math.max(cu - lu, hu - cu); ry = Math.max(cy - ly, hy - cy);
    // fanned from the centre, 15 mm proud: the depth buffer (near 0.5 m, 24 bits) resolves that to ~280 m, where the
    // patch is a pixel; 6 mm fought the render from ~180 m in the establishing views
    const fan: Array<[number, number]> = [[cu, cy], ...ragged, ragged[0]];
    // (facade craft, desktop; wave 150: "plaster loss that looks like stickers") the loss shaded deeper toward its broken
    // edge, where the render it lost stands proud and shades it: a hollow, not a decal laid on the wall
    const centre = facePoint(face, cu, cy, 0.015);
    // (the layers on the first render family only: its fine work batches by the fine-detail cells and its coats cast
    // with the wall's; the second and third families' pieces would all be drawn and cast, so they keep the one patch)
    if (crafted && wall === 'plaster') {
      // the rings round the hole grow out to 1.45x its size where the wall and its openings leave room
      let room = 1.45;
      while (room > 1.02 && (Math.abs(cu) + ru * room > half - 0.08 || cy - ry * room < y0 + 0.02 || cy + ry * room > y1 - 0.08
        || keepOut.some((h) => cu + ru * room > h.u0 && cu - ru * room < h.u1 && cy + ry * room > h.y0 && cy - ry * room < h.y1))) room -= 0.05;
      layeredLoss(sink, face, wall, bucket, cu, cy, ragged, room);
      continue;
    }
    // (clay under lime: the daub keeps its own tone to the edge, where the lime's broken lip shades it only a little)
    const edge = spec.spallTint ? 0.82 : 0.62;
    const rim = facadeOn() ? { shadeAt: (q: Vec3) => (Math.abs(q[0] - centre[0]) + Math.abs(q[1] - centre[1]) + Math.abs(q[2] - centre[2]) < 1e-6 ? 0.92 : edge) } : { shade: 0.86 };
    sink.polygon(bucket, fan.map(([u, yy]) => facePoint(face, u, yy, 0.015)), { decor: true, ...rim, ...(spec.spallTint ? { tint: spec.spallTint } : {}) });
  }
}

/**
 * A render loss as it really breaks (facade craft, desktop; wave 172 read the single-layer patch as "a hard-edged
 * texture-blend patch"): the masonry where the whole coat came away, shaded toward its broken edge (the plain build's
 * patch, the same outline); round it a ragged ring of the brown base coat where only the finish came away; and round
 * that a stain fading out into the render (the water that got in). Each ring stands a little less proud than the one
 * inside it (17, 15, 12 mm) and grows only as far as `room` (times the hole's size) allows. The stain is near fine
 * dressing (EmitOptions.fine 'near'), the base coat fine (out of the shadow maps, drawn by the fine-detail cells).
 */
function layeredLoss(sink: PartSink, face: Face, wall: RegionalBucket, bucket: RegionalBucket, cu: number, cy: number,
  ragged: ReadonlyArray<readonly [number, number]>, room: number): void {
  const at = (s: number, [u, y]: readonly [number, number]): [number, number] => [cu + (u - cu) * s, cy + (y - cy) * s];
  const ring = (inner: number, outer: number, o: number, opts: EmitOptions, shadeIn: number, shadeOut: number) => {
    for (let j = 0; j < ragged.length; j++) {
      const p = ragged[j], q = ragged[(j + 1) % ragged.length];
      // inner p, outer p, outer q, inner q: counter-clockwise seen from outside (the outline runs counter-clockwise)
      const a = at(inner, p), b = at(outer, p), c = at(outer, q), d = at(inner, q);
      const pts = [a, b, c, d].map(([u, y]) => facePoint(face, u, y, o));
      const ins = new Set([0, 3]);
      sink.polygon(wall, pts, { ...opts, shadeAt: (v: Vec3) => (ins.has(pts.findIndex((w) => w[0] === v[0] && w[1] === v[1] && w[2] === v[2])) ? shadeIn : shadeOut) });
    }
  };
  // the masonry: the hole, shaded toward its broken edge
  const centre = facePoint(face, cu, cy, 0.017);
  sink.polygon(bucket, [[cu, cy] as [number, number], ...ragged, ragged[0]].map(([u, y]) => facePoint(face, u, y, 0.017)), {
    decor: true, shadeAt: (q: Vec3) => (Math.abs(q[0] - centre[0]) + Math.abs(q[1] - centre[1]) + Math.abs(q[2] - centre[2]) < 1e-6 ? 0.88 : 0.6),
  });
  if (room <= 1.04) return;
  const coat = Math.min(1.18, room);
  // the base coat: the brown floated coat under the finish, round the hole
  ring(1, coat, 0.015, { decor: true, fine: true, tint: [0.8, 0.72, 0.6] }, 0.78, 0.92);
  // the stain: from the coat's edge out, the render darkening toward the break
  if (room > coat + 0.04) ring(coat, room, 0.012, { decor: true, fine: 'near' }, 0.82, 1);
}

export function roofGeometry(w: number, d: number, eaveY: number, roof: RoofSpec): RoofGeometry {
  const s = w / 2, halfD = d / 2;
  const tanP = Math.tan(roof.pitchDeg * DEG);
  if (roof.kind === 'flat' || roof.kind === 'shed') {
    const rise = roof.kind === 'shed' ? w * tanP : 0;
    return {
      kind: roof.kind, s, halfD, tanP, eaveY, ridgeY: eaveY + rise, ridgeTopY: eaveY + rise + roof.thickness,
      gable: null, ridgeHalf: halfD,
      topAt: (x, z) => (Math.abs(x) > s + roof.eave + 1e-6 || Math.abs(z) > halfD + roof.verge + 1e-6 ? null
        : eaveY + roof.thickness + (roof.kind === 'shed' ? (s - x) * tanP : 0)),
    };
  }
  const ridgeY = eaveY + s * tanP;
  const cosP = Math.cos(roof.pitchDeg * DEG);
  const tTop = roof.thickness / cosP;
  const D = halfD + roof.verge;
  let gable: Array<[number, number]> | null = null;
  let hipCut = ridgeY, hipRun = 0;
  if (roof.kind === 'halfhip' || roof.kind === 'hip') {
    const hipTan = Math.tan((roof.hipPitchDeg ?? (roof.kind === 'hip' ? roof.pitchDeg : 62)) * DEG);
    if (roof.kind === 'hip') {
      hipCut = eaveY - roof.verge * hipTan; // the hip eave line at z = ±D, level with the side eaves when verge = eave
      hipRun = (ridgeY - hipCut) / hipTan;
    } else {
      const frac = Math.min(0.6, Math.max(0.2, roof.hipFrac ?? 0.38));
      hipCut = ridgeY - (ridgeY - eaveY) * frac;
      hipRun = (ridgeY - hipCut) / hipTan;
    }
    const wallTop = hipCut + roof.verge * hipTan; // the hip underside on the gable wall plane
    if (wallTop > eaveY + 0.05) {
      const xc = Math.max(0, s - (wallTop - eaveY) / tanP);
      gable = [[-s, eaveY], [s, eaveY], [xc, wallTop], [-xc, wallTop]];
    }
  } else {
    gable = [[-s, eaveY], [s, eaveY], [0, ridgeY]];
  }
  const ridgeHalf = Math.max(0, D - hipRun);
  const hipTanFinal = roof.kind === 'gable' ? 0 : (ridgeY - hipCut) / Math.max(1e-6, hipRun);
  return {
    kind: roof.kind, s, halfD, tanP, eaveY, ridgeY, ridgeTopY: ridgeY + tTop, gable, ridgeHalf,
    topAt(x, z) {
      if (Math.abs(x) > s + roof.eave + 1e-6 || Math.abs(z) > D + 1e-6) return null;
      let y = ridgeY - Math.abs(x) * tanP;
      if (roof.kind !== 'gable' && Math.abs(z) > ridgeHalf) y = Math.min(y, ridgeY - (Math.abs(z) - ridgeHalf) * hipTanFinal);
      return y + tTop;
    },
  };
}

const RUST: Rgb = [0.36, 0.2, 0.12];

/**
 * A painted sheet roof weathered down its slope (vertex colour, per corner): the paint sun-faded and chalky toward the
 * ridge, rust and grime gathering along the eaves where the water runs off (gauntlet wave 0: "no wear").
 */
function weatheredSheet(c: Rgb, lo: number, hi: number): (p: Vec3) => Rgb {
  const span = Math.max(0.5, hi - lo), grey = (c[0] + c[1] + c[2]) / 3;
  const step = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  return (p) => {
    const t = Math.min(1, Math.max(0, (p[1] - lo) / span));
    const fade = 0.22 * step(0.4, 1, t), rust = 0.42 * (1 - step(0, 0.45, t));
    const lift = 1 + fade * 0.35;
    const f = (k: number) => (c[k] + (grey - c[k]) * fade) * lift;
    return [f(0) + (RUST[0] - f(0)) * rust, f(1) + (RUST[1] - f(1)) * rust, f(2) + (RUST[2] - f(2)) * rust];
  };
}

/** Emit the roof slabs, ridge and hip caps. */
/**
 * The ridge and hip caps' weather (the facades lane, round 6; gauntlet wave 241: "unweathered clay roofs": "moss, lichen
 * and soot at the ridge and eaves"): caps bedded in lime mortar hold the wet and the soot the chimneys give off — a
 * shade darker than the slopes and grey-green with crust lichen (a weathered bucket's paint; geometry.ts tint and shade)
 */
const CAP_WEATHER: EmitOptions = Object.freeze({ shade: 0.8, tint: [0.9, 0.95, 0.86] as Rgb });

export function emitRoof(sink: PartSink, rg: RoofGeometry, roof: RoofSpec, colour?: Rgb): void {
  const { s, halfD, tanP, eaveY, ridgeY } = rg;
  const t = roof.thickness;
  const bucket = roof.bucket;
  // a vertex-coloured covering (painted sheet in structureMetal) takes its livery here, weathered down the slope
  const lowY = eaveY - roof.eave * tanP, highY = roof.kind === 'shed' ? eaveY + 2 * s * tanP : ridgeY;
  const dec: EmitOptions = { ...(roof.decor ? { decor: true } : {}), ...(colour ? { colour } : {}),
    ...(colour && roof.kind !== 'flat' ? { colourAt: weatheredSheet(colour, lowY, highY + t) } : {}) };
  if (roof.kind === 'flat') {
    const e = roof.eave;
    sink.span(bucket, -s - e, eaveY, -halfD - e, s + e, eaveY + t, halfD + e, dec);
    if (roof.parapet) {
      const p = roof.parapet, th = 0.22, top = eaveY + t + p;
      sink.span(bucket === 'roof' ? 'plaster' : bucket, -s - e, eaveY, halfD + e - th, s + e, top, halfD + e);
      sink.span(bucket === 'roof' ? 'plaster' : bucket, -s - e, eaveY, -halfD - e, s + e, top, -halfD - e + th);
      sink.span(bucket === 'roof' ? 'plaster' : bucket, s + e - th, eaveY, -halfD - e + th, s + e, top, halfD + e - th);
      sink.span(bucket === 'roof' ? 'plaster' : bucket, -s - e, eaveY, -halfD - e + th, -s - e + th, top, halfD + e - th);
    }
    return;
  }
  const e = roof.eave, D = halfD + roof.verge;
  const lo = eaveY - e * tanP;
  if (roof.kind === 'shed') {
    // one plane rising from +x (low) to -x (high)
    const hi = eaveY + (2 * s) * tanP + e * tanP;
    const n = normalize3([tanP, 1, 0]);
    const pts: Vec3[] = [[s + e, lo, D], [s + e, lo, -D], [-s - e, hi, -D], [-s - e, hi, D]];
    sink.prism(bucket, pts, n, t, dec, { kind: 'plane', origin: [-s - e, hi, 0], u: [0, 0, 1], v: normalize3([1, -tanP, 0]) });
    return;
  }
  const cosP = Math.cos(Math.atan(tanP)), sinP = Math.sin(Math.atan(tanP));
  const ridgeHalf = rg.ridgeHalf;
  // the hip cut on the verge plane (z = ±D) and its x on the main slope
  let yC = ridgeY, xC = 0;
  if (roof.kind !== 'gable' && ridgeHalf < D - 1e-6) {
    const hipTan = (roof.kind === 'hip') ? Math.tan((roof.hipPitchDeg ?? roof.pitchDeg) * DEG)
      : Math.tan((roof.hipPitchDeg ?? 62) * DEG);
    yC = ridgeY - (D - ridgeHalf) * hipTan;
    xC = Math.min(s + e, (ridgeY - yC) / tanP);
  }
  for (const side of [1, -1]) {
    const pts: Vec3[] = [];
    pts.push([side * (s + e), lo, side * D]);
    pts.push([side * (s + e), lo, -side * D]);
    if (xC > 1e-4 && xC < s + e - 1e-4) pts.push([side * xC, yC, -side * D]);
    pts.push([0, ridgeY, -side * ridgeHalf]);
    if (ridgeHalf > 1e-4) pts.push([0, ridgeY, side * ridgeHalf]);
    if (xC > 1e-4 && xC < s + e - 1e-4) pts.push([side * xC, yC, side * D]);
    const n = normalize3([side * sinP, cosP, 0]);
    // thatch combs down the slope: the straw tile's stalks run along its u, so a straw roof swaps the axes
    const along: Vec3 = [0, 0, side], down = normalize3([side * cosP, -sinP, 0]);
    sink.prism(bucket, pts, n, t, dec, {
      kind: 'plane', origin: [0, ridgeY + t / cosP, 0], u: bucket === 'straw' ? down : along, v: bucket === 'straw' ? along : down,
    });
    // a thatched slope's eave course and course lines (facade.ts), on its top surface from the eave to the ridge
    if (bucket === 'straw' && !roof.decor && roof.thatch !== 'none' && facadeOn()) {
      const top = (p: Vec3): Vec3 => [p[0] + n[0] * t, p[1] + n[1] * t, p[2] + n[2] * t];
      thatchCourses(sink, bucket, top([side * (s + e), lo, side * D]), top([side * (s + e), lo, -side * D]),
        top([0, ridgeY, side * ridgeHalf]), top([0, ridgeY, -side * ridgeHalf]), n,
        { verges: roof.kind === 'gable', stepped: roof.thatch !== 'rows' && roof.thatch !== 'nipa', nipa: roof.thatch === 'nipa' });
    }
  }
  if (roof.kind !== 'gable' && ridgeHalf < D - 1e-6) {
    for (const end of [1, -1]) {
      const pts: Vec3[] = end > 0
        ? [[-xC, yC, D], [xC, yC, D], [0, ridgeY, ridgeHalf]]
        : [[xC, yC, -D], [-xC, yC, -D], [0, ridgeY, -ridgeHalf]];
      const rise = ridgeY - yC, run = D - ridgeHalf;
      const len = Math.hypot(rise, run) || 1;
      const n = normalize3([0, run / len, end * rise / len]);
      const hipAlong: Vec3 = [end, 0, 0], hipDown = normalize3([0, -rise, end * run]);
      sink.prism(bucket, pts, n, t, dec, {
        kind: 'plane', origin: [0, ridgeY, end * ridgeHalf], u: bucket === 'straw' ? hipDown : hipAlong, v: bucket === 'straw' ? hipAlong : hipDown,
      });
      if (bucket === 'straw' && !roof.decor && roof.thatch !== 'none' && facadeOn()) {
        const top = (p: Vec3): Vec3 => [p[0] + n[0] * t, p[1] + n[1] * t, p[2] + n[2] * t];
        const apex = top([0, ridgeY, end * ridgeHalf]);
        thatchCourses(sink, bucket, top([end * xC, yC, end * D]), top([-end * xC, yC, end * D]), apex, apex, n,
          { stepped: roof.thatch !== 'rows' && roof.thatch !== 'nipa', nipa: roof.thatch === 'nipa' });
      }
      // hip caps along both hip lines (round 6: bedded in mortar, lichened, as the ridge)
      for (const sx of [1, -1]) {
        const a: Vec3 = [0, ridgeY + t / cosP + 0.02, end * ridgeHalf];
        const b: Vec3 = [sx * xC, yC + t + 0.02, end * D];
        sink.member(bucket, a, b, 0.2, 0.1, normalize3([sx * 0.3, 1, end * 0.3]), { ...dec, ...CAP_WEATHER, uv: { kind: 'member' }, exposed: true }, 0.05);
      }
    }
  }
  // ridge cap
  const rt = ridgeY + t / cosP;
  const ridgeLen = ridgeHalf > 1e-4 ? ridgeHalf : 0;
  if (roof.ridge !== null && ridgeLen > 0) {
    const half = roof.ridge === 'round' ? 0.13 : 0.16;
    const capPts: Vec3[] = [[-half, rt - 0.06, -ridgeLen - (roof.kind === 'gable' ? roof.verge * 0 : 0)],
      [half, rt - 0.06, -ridgeLen], [half, rt + 0.04, -ridgeLen], [0, rt + 0.11, -ridgeLen], [-half, rt + 0.04, -ridgeLen]];
    // extrude the cap profile along z (points ccw seen from +z)
    sink.prism(bucket, capPts, [0, 0, 1], 2 * ridgeLen, { ...dec, ...CAP_WEATHER }, { kind: 'plane', origin: [0, rt, 0], u: [1, 0, 0], v: [0, 0, 1] });
  }
}

/** The four faces of storey `i` of a built house (a jettied storey's faces stand proud of the ground storey's). */
export function storeyFaces(frame: HouseFrame, i: number): Record<FaceName, Face> {
  const b = frame.bodies[Math.max(0, Math.min(frame.bodies.length - 1, i))];
  const f = bodyFaces(b.x1 - b.x0, b.z1 - b.z0);
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  for (const name of FACE_NAMES) f[name].origin = [f[name].origin[0] + cx, 0, f[name].origin[2] + cz];
  return f;
}

/** Lay out a regular window rhythm on one storey of one face, leaving room for doors. */
export function windowRhythm(face: FaceName, storey: number, width: number, opts: {
  w: number; h: number; sill: number; spacing: number; margin?: number; avoid?: Array<[number, number]>;
  kind?: Opening['kind']; max?: number; centre?: boolean;
}): Opening[] {
  const margin = opts.margin ?? 0.9;
  const span = width - 2 * margin;
  if (span < opts.w) return [];
  let n = Math.max(1, Math.floor((span + opts.spacing - opts.w) / opts.spacing));
  if (opts.max) n = Math.min(n, opts.max);
  const out: Opening[] = [];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : -span / 2 + opts.w / 2 + (span - opts.w) * i / (n - 1);
    if (opts.avoid?.some(([a, b]) => u + opts.w / 2 + 0.25 > a && u - opts.w / 2 - 0.25 < b)) continue;
    out.push({ face, storey, kind: opts.kind ?? 'window', u, w: opts.w, y0: opts.sill, h: opts.h });
  }
  return out;
}

/**
 * A house body as its kit built it, kept for the destruction seam (docs/DESTRUCTION.md §16; damage.ts describe reads it
 * back): its spec and frame, the placement it was built under, its uv offset and the Fachwerk members its dialect drew.
 */
export interface HousePlan {
  spec: HouseSpec;
  frame: HouseFrame;
  /** the placement (PartSink.placed) the body was built under, in the building's frame; null in that frame itself */
  place: { yaw: number; x: number; y: number; z: number } | null;
  /** the sink's uv offset: every world and member UV of the body shifts by it (a broken block keeps its texture) */
  uvOffset: readonly [number, number];
  /** the frame's members by storey (the gable: storeys.length) and face, in face coordinates from that storey's floor */
  members: HouseMember[];
  /** the frame's timber colour (the first member's), or null for an unframed house */
  timber: Rgb | null;
}

interface HouseMember {
  storey: number;
  face: FaceName;
  role: 'post' | 'rail' | 'brace' | 'sill' | 'plate';
  u0: number;
  y0: number;
  u1: number;
  y1: number;
  widthM: number;
  depthM: number;
}

let planSink: HousePlan[] | null = null;
let memberTarget: { plan: HousePlan; storey: number; face: FaceName; y0: number; y1: number } | null = null;

/** Run a kit build keeping every house body it builds (the destruction seam's plan; builders are synchronous). */
export function withHousePlans<T>(build: () => T): [T, HousePlan[]] {
  const prior = planSink, plans: HousePlan[] = [];
  planSink = plans;
  try { return [build(), plans]; } finally { planSink = prior; }
}

/** Dress one face with the member capture pointed at it (a no-op outside withHousePlans). */
function capturingMembers(plan: HousePlan | null, storey: number, face: FaceName, y0: number, y1: number, dress: () => void): void {
  if (!plan) { dress(); return; }
  const prior = memberTarget;
  memberTarget = { plan, storey, face, y0, y1 };
  try { dress(); } finally { memberTarget = prior; }
}

/** A framing member H drew (the capture's target face, or nothing outside a capture). */
function captureMember(kind: 'post' | 'rail' | 'brace', u0: number, y0: number, u1: number, y1: number, width: number, out: number,
  opts: EmitOptions): void {
  const t = memberTarget;
  if (!t) return;
  // a rail at the storey's foot is its sill beam, at its head its plate
  const role = kind !== 'rail' ? kind : y0 - t.y0 < 0.2 ? 'sill' : t.y1 - y0 < 0.2 ? 'plate' : 'rail';
  t.plan.members.push({ storey: t.storey, face: t.face, role, u0, y0: y0 - t.y0, u1, y1: y1 - t.y0, widthM: width, depthM: Math.max(0.02, out) });
  if (!t.plan.timber && opts.colour) t.plan.timber = opts.colour;
}

/**
 * Build one house body into the sink. Returns the frame the dialect dressed (roof geometry, floors, faces) so a
 * style can add its own signature parts (stairs, balconies, dormers, porches) afterwards.
 */
export function buildHouse(sink: PartSink, spec: HouseSpec, dialect: HouseDialect): HouseFrame {
  const floors: number[] = [];
  const bodies: HouseFrame['bodies'] = [];
  let y = spec.plinth ? spec.plinth.h : 0;
  const jet = [0, 0, 0, 0];
  if (spec.plinth) {
    const p = spec.plinth;
    sink.span(p.bucket, -spec.w / 2 - p.out, -0.6, -spec.d / 2 - p.out, spec.w / 2 + p.out, p.h, spec.d / 2 + p.out);
    // (the facades lane, round 10; wave 301: "walls go straight into the dirt with no plinth", "no plinth or step": a
    // stone plinth under a stone ground storey, in the one stone print, read as the wall run down into the ground) the
    // plinth's water table: a dressed course along its top, 4.5 cm proud of it and a shade paler, its underside the
    // shadow line that parts the plinth from the wall, its top the doors' threshold. Decor (no collision), never cast
    if (facadeGroundCraft() && p.h >= 0.2) {
      const o = p.out + 0.045, t = Math.min(0.12, p.h * 0.3);
      sink.span(p.bucket, -spec.w / 2 - o, p.h - t, -spec.d / 2 - o, spec.w / 2 + o, p.h + 0.005, spec.d / 2 + o,
        { decor: true, tint: [1.1, 1.08, 1.05], shadeAt: (q: Vec3) => (q[1] < p.h - t + 0.001 ? 0.7 : 1) });
    }
  }
  spec.storeys.forEach((storey) => {
    if (storey.jetty) for (let k = 0; k < 4; k++) jet[k] += storey.jetty[k];
    const body = { x0: -spec.w / 2 - jet[3], x1: spec.w / 2 + jet[1], z0: -spec.d / 2 - jet[2], z1: spec.d / 2 + jet[0], y0: y, y1: y + storey.h };
    floors.push(y);
    bodies.push(body);
    y += storey.h;
  });
  const reveal = Math.max(0, spec.reveal ?? 0.16);
  // war wear marks openings before the walls are cut (a burnt opening keeps its soot plume on the face)
  const eaveY = y;
  const top = bodies[bodies.length - 1];
  // the roof bears on the top storey's body; a jettied body is offset, so lay the roof out centred and move it
  const roofW = top.x1 - top.x0, roofD = top.z1 - top.z0;
  const roofCx = (top.x0 + top.x1) / 2, roofCz = (top.z0 + top.z1) / 2;
  const rg = roofGeometry(roofW, roofD, eaveY, spec.roof);
  const frameFaces = (b: typeof top): Record<FaceName, Face> => {
    const f = bodyFaces(b.x1 - b.x0, b.z1 - b.z0);
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    for (const name of FACE_NAMES) f[name].origin = [f[name].origin[0] + cx, 0, f[name].origin[2] + cz];
    return f;
  };
  const faces = frameFaces(bodies[0]);
  const frame: HouseFrame = { spec, faces, floors, eaveY, bodies, roof: rg, reveal };
  const plan: HousePlan | null = planSink ? { spec, frame, place: sink.placement(), uvOffset: sink.uvOffset, members: [], timber: null } : null;
  if (plan) planSink!.push(plan);
  if (facadeOn()) groundSkirt(sink, spec, faces);
  const roofPatch = wearHouse(spec, rg);
  // the rain shadow under the eaves (facade craft, desktop): the top storey's eaves faces darken toward the soffit, by
  // the overhang's depth; a gable, a flat roof's parapet or a bare eave casts none
  const rainShadow: Record<FaceName, number> = { front: 1, right: 1, back: 1, left: 1 };
  if (facadeOn() && spec.roof.eave >= 0.15 && rg.kind !== 'flat') {
    // (wave 116: "almost nothing shows weathering": deep enough to read at 30 m)
    const k = 1 - Math.min(0.34, 0.14 + 0.3 * spec.roof.eave);
    if (rg.kind === 'shed') rainShadow.right = k;
    else { rainShadow.left = k; rainShadow.right = k; }
    if (rg.kind === 'hip') { rainShadow.front = k; rainShadow.back = k; }
  }
  // the grime where the ground storey meets the ground (facade craft, desktop; wave 116: "almost nothing shows weathering
  // or grime where walls meet the ground"): its bottom row of corners darker, fading up to the next row it has
  const footGrime = facadeOn() ? 0.7 : 1;
  // the storey bodies: four faces cut by their openings (with reveals), the top, and a jetty's underside
  bodies.forEach((b, i) => {
    const wall = spec.storeys[i].wall;
    const sf = frameFaces(b);
    for (const name of FACE_NAMES) {
      const face = sf[name];
      const own = spec.openings.filter((o) => o.face === name && o.storey === i);
      const holes = own.map((o) => {
        // a shopfront keeps its stall riser: the glazing starts above it
        const riser = o.kind === 'shopfront' ? 0.55 : 0;
        return { u0: o.u - o.w / 2, u1: o.u + o.w / 2, y0: b.y0 + o.y0 + riser, y1: b.y0 + o.y0 + o.h };
      });
      // weathering: rain runs from each sill down the wall below it; a burnt opening's soot climbs the wall over it
      const stains: Stain[] = [];
      own.forEach((o, k) => {
        const h = holes[k];
        if (o.kind === 'window' && o.state !== 'burnt') stains.push({ u0: h.u0 + 0.06, u1: h.u1 - 0.06, y0: h.y0 - 1.1, y1: h.y0, bottom: 1, top: 0.82 });
        if (o.state === 'burnt') stains.push({ u0: h.u0 - 0.3, u1: h.u1 + 0.3, y0: h.y1, y1: h.y1 + 1.7, bottom: 0.32, top: 1 });
      });
      holedFace(sink, wall, face, { u0: -face.width / 2, u1: face.width / 2, y0: b.y0, y1: b.y1 }, holes, reveal, stains,
        own.map((o) => (o.state === 'burnt' ? 0.4 : 1)), i === bodies.length - 1 ? rainShadow[name] : 1, i === 0 ? footGrime : 1);
    }
    sink.quad(wall, [b.x0, b.y1, b.z1], [b.x1, b.y1, b.z1], [b.x1, b.y1, b.z0], [b.x0, b.y1, b.z0]);
    // the underside: a jetty's soffit, or the ground storey's base (seen where the ground falls away from it)
    sink.quad(wall, [b.x0, b.y0, b.z0], [b.x1, b.y0, b.z0], [b.x1, b.y0, b.z1], [b.x0, b.y0, b.z1], { shade: 0.8 });
  });
  // the roof and gables in the top body's frame
  const moveRoof = (fn: () => void) => (Math.abs(roofCx) < 1e-6 && Math.abs(roofCz) < 1e-6 ? fn() : sink.placed(0, roofCx, 0, roofCz, fn));
  moveRoof(() => {
    emitRoof(sink, rg, spec.roof, spec.roofColour);
    if (roofPatch) emitRoofPatch(sink, rg, spec.roof, roofPatch);
    if (rg.gable) {
      const gableBucket = spec.gableBucket ?? spec.storeys[spec.storeys.length - 1].wall;
      const f = bodyFaces(roofW, roofD);
      for (const name of ['front', 'back'] as const) {
        const face = f[name];
        // the gable polygon is symmetric in u, and each face's own u axis mirrors it into place
        const poly = rg.gable.map(([u, yy]): [number, number] => [u, yy]);
        // a gable hung with roof slate or tile courses its tiles downward (roof UVs run v down the slope)
        wallPolygon(sink, gableBucket, face, poly, 0.32, gableBucket === 'roof'
          ? { uv: { kind: 'plane', origin: facePoint(face, 0, 0, 0), u: face.u, v: [0, -1, 0] } } : {});
        if (spec.gableFramed && dialect.dressGable) {
          capturingMembers(plan, spec.storeys.length, name, eaveY, rg.ridgeTopY, () => dialect.dressGable!(sink, face, poly, frame));
        }
      }
      if (spec.verge) {
        for (const end of [1, -1]) for (const side of [1, -1]) {
          const z = end * (roofD / 2 + spec.roof.verge - 0.03);
          const a: Vec3 = [side * (rg.s + spec.roof.eave) * 0.999, eaveY - spec.roof.eave * rg.tanP - 0.02, z];
          const b: Vec3 = [0, rg.ridgeY - 0.02, z];
          if (rg.kind === 'gable') sink.member(spec.verge.bucket, a, b, 0.22, 0.05, [0, 0, end], { colour: spec.verge.colour, decor: true, ends: true });
        }
        if (spec.verge.carved && rg.kind === 'gable' && facadeOn()) {
          for (const end of [1, -1]) {
            carvedVerge(sink, rg.s + spec.roof.eave, eaveY - spec.roof.eave * rg.tanP - 0.02, rg.ridgeY - 0.02, end * (roofD / 2 + spec.roof.verge - 0.03), end,
              spec.verge.carved);
          }
        }
      }
    }
  });
  // the storeys' openings and dressing
  for (let i = 0; i < spec.storeys.length; i++) {
    const storey = spec.storeys[i];
    const sf = frameFaces(bodies[i]);
    for (const name of FACE_NAMES) {
      const face = sf[name];
      const own = spec.openings.filter((o) => o.face === name && o.storey === i);
      if (storey.framed && dialect.dressWall) {
        capturingMembers(plan, i, name, bodies[i].y0, bodies[i].y1,
          () => dialect.dressWall!(sink, face, { u0: -face.width / 2, u1: face.width / 2, y0: bodies[i].y0, y1: bodies[i].y1 }, own, frame));
      } else spallRender(sink, spec, storey.wall, face, bodies[i], i, own);
      // the units stand in the cut openings, set back by the reveal; (round 6) a sill shadows a rendered or masonry wall
      sink.recess = reveal;
      try {
        withSillShadow(!storey.framed && SILL_SHADOWED.has(storey.wall) ? storey.wall : null, () => {
          for (const o of own) {
            if (o.state) damagedOpening(sink, face, o, bodies[i].y0, reveal);
            else if (o.kind === 'door' || o.kind === 'gate' || o.kind === 'shopfront') dialect.door(sink, face, o, bodies[i].y0, frame);
            else dialect.window(sink, face, o, bodies[i].y0, frame);
          }
        });
      } finally { sink.recess = 0; }
      // the dirt run off the sills down a rendered or masonry wall (facade craft): it stops at the opening below
      if (facadeOn() && !storey.framed && (RENDERS.has(storey.wall) || storey.wall === 'stone')) {
        for (const o of own) {
          if (o.kind !== 'window' || o.state) continue;
          const sill = bodies[i].y0 + o.y0;
          let floor = bodies[i].y0 + 0.08;
          for (const q of spec.openings) {
            if (q.face !== name || q === o) continue;
            const head = bodies[q.storey].y0 + q.y0 + q.h;
            if (head < sill - 0.1 && Math.abs(q.u - o.u) < (q.w + o.w) / 2 + 0.1) floor = Math.max(floor, head + 0.25);
          }
          sillStreaks(sink, storey.wall, face, o.u, sill, o.w, floor);
        }
      }
    }
    // jetty dressing on the faces this storey oversails
    if (i > 0 && storey.jetty && dialect.dressJetty) {
      FACE_NAMES.forEach((name, k) => {
        const depth = storey.jetty![k];
        if (depth <= 0.01) return;
        dialect.dressJetty!(sink, sf[name], -sf[name].width / 2, sf[name].width / 2, bodies[i].y0, depth, frame);
      });
    }
  }
  // chimneys
  for (const c of spec.chimneys) {
    const roofY = rg.topAt(c.x - roofCx, c.z - roofCz);
    const topY = (roofY ?? rg.ridgeTopY) + c.above;
    const baseY = c.inWall ? 0 : Math.max(eaveY - 0.4, (roofY ?? eaveY) - 1.2);
    // soot: the stack blackens toward its mouth (the weathering pass reads the shade)
    const soot = { shadeAt: (p: Vec3) => (p[1] > topY - 0.05 ? 0.5 : p[1] > topY - 0.7 ? 0.78 : 1) };
    sink.span(c.bucket, c.x - c.sx / 2, baseY, c.z - c.sz / 2, c.x + c.sx / 2, topY - 0.7, c.z + c.sz / 2);
    sink.span(c.bucket, c.x - c.sx / 2, topY - 0.7, c.z - c.sz / 2, c.x + c.sx / 2, topY, c.z + c.sz / 2, soot);
    const cap = c.cap ?? 'slab';
    if (cap === 'slab' || cap === 'pots') sink.span(c.bucket, c.x - c.sx / 2 - 0.07, topY, c.z - c.sz / 2 - 0.07, c.x + c.sx / 2 + 0.07, topY + 0.1, c.z + c.sz / 2 + 0.07, { shade: 0.5 });
    if (cap === 'tile') {
      // a little gabled tile hood on corner piers (Dalmatian / Mediterranean)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        sink.span(c.bucket, c.x + sx * c.sx / 2 - (sx > 0 ? 0.1 : 0), topY, c.z + sz * c.sz / 2 - (sz > 0 ? 0.1 : 0),
          c.x + sx * c.sx / 2 + (sx < 0 ? 0.1 : 0), topY + 0.28, c.z + sz * c.sz / 2 + (sz < 0 ? 0.1 : 0));
      }
      const hood = roofGeometry(c.sx + 0.16, c.sz + 0.16, 0, { kind: 'gable', pitchDeg: 24, eave: 0.06, verge: 0.06, thickness: 0.05, bucket: 'roof', ridge: null });
      sink.placed(0, c.x, topY + 0.28, c.z, () => emitRoof(sink, hood, { kind: 'gable', pitchDeg: 24, eave: 0.06, verge: 0.06, thickness: 0.05, bucket: 'roof', ridge: null }));
    }
    if (cap === 'pots') {
      for (const k of [-1, 1]) sink.span('roof', c.x + k * c.sx * 0.22 - 0.09, topY + 0.1, c.z - 0.09, c.x + k * c.sx * 0.22 + 0.09, topY + 0.42, c.z + 0.09);
    }
    // the oversailing course a mason corbels out under the cap (facade craft, desktop)
    if (facadeOn() && cap !== 'tile' && c.above >= 0.45) {
      const o = 0.045, y = topY - 0.36;
      sink.span(c.bucket, c.x - c.sx / 2 - o, y, c.z - c.sz / 2 - o, c.x + c.sx / 2 + o, y + 0.13, c.z + c.sz / 2 + o, { decor: true, shade: 0.9, fine: true });
    }
  }
  // rafter feet under the eaves overhang, every 0.8 m along both eaves (dressing)
  if (spec.rafters && (rg.kind === 'gable' || rg.kind === 'halfhip' || rg.kind === 'hip') && spec.roof.eave >= 0.25) {
    const e = spec.roof.eave, c = spec.rafters;
    moveRoof(() => {
      const n = Math.max(2, Math.round((rg.ridgeHalf > 0 ? 2 * rg.halfD : 2 * rg.halfD) / 0.8));
      for (const side of [1, -1]) for (let k = 0; k <= n; k++) {
        const z = -rg.halfD + 0.15 + (2 * rg.halfD - 0.3) * k / n;
        const a: Vec3 = [side * (rg.s - 0.02), eaveY - 0.09, z];
        const b: Vec3 = [side * (rg.s + e - 0.06), eaveY - (e - 0.06) * rg.tanP - 0.09, z];
        sink.member('structureWood', a, b, 0.08, 0.1, [0, 0, 1], { colour: c, decor: true, ends: true }, 0.05);
      }
    });
  }
  // gutters and downpipes on the eaves sides (+x, -x)
  if (spec.gutters && spec.roof.kind !== 'flat') {
    const colour = spec.gutters.colour;
    const ex = rg.s + spec.roof.eave - 0.06, gy = eaveY - spec.roof.eave * rg.tanP - 0.1;
    const gz = roofD / 2 + (rg.kind === 'gable' ? spec.roof.verge : spec.roof.verge) - 0.05;
    moveRoof(() => {
      for (const side of [1, -1]) sink.span('structureMetal', side * ex - 0.07, gy - 0.07, -gz, side * ex + 0.07, gy + 0.05, gz, { colour, decor: true });
    });
    // downpipes stand on the ground storey's face; a swan-neck run joins each to the gutter
    const g0 = bodies[0];
    for (const side of [1, -1]) for (const end of [1, -1]) {
      const pz = end > 0 ? g0.z1 - 0.2 : g0.z0 + 0.2;
      const px = side > 0 ? g0.x1 + 0.08 : g0.x0 - 0.08;
      const gx = roofCx + side * ex;
      // the swan neck and the pipe (9 cm) are fine joinery (EmitOptions.fine); the gutter keeps the eave line at range
      sink.span('structureMetal', Math.min(px, gx) - 0.04, gy - 0.13, pz - 0.04, Math.max(px, gx) + 0.04, gy - 0.05, pz + 0.04, { colour, decor: true, fine: true });
      const baseY = spec.plinth ? spec.plinth.h * 0.5 : 0.15;
      sink.span('structureMetal', px - 0.045, baseY, pz - 0.045, px + 0.045, gy - 0.07, pz + 0.045, { colour, decor: true, fine: true });
      if (facadeOn()) downpipeFittings(sink, px, pz, side, baseY, gy - 0.13, colour);
    }
    // the gutter's hangers under it, one every other rafter: their straps' fronts and undersides (facade craft, desktop;
    // drawn near the camera only, EmitOptions.fine 'near')
    if (facadeOn()) {
      moveRoof(() => {
        const n = Math.max(2, Math.round(2 * gz / 1.2)), hanger = { colour: shadeRgb(colour, 0.7), decor: true, fine: 'near' as const };
        for (const side of [1, -1]) for (let k = 0; k <= n; k++) {
          const z = -gz + 0.12 + (2 * gz - 0.24) * k / n, x0 = side * ex - 0.08, x1 = side * ex + 0.08, y = gy - 0.085;
          sink.quad('structureMetal', [x0, y, z + 0.02], [x0, y, z - 0.02], [x1, y, z - 0.02], [x1, y, z + 0.02], hanger);
          const xo = side > 0 ? x1 : x0;
          if (side > 0) sink.quad('structureMetal', [xo, y, z + 0.02], [xo, y, z - 0.02], [xo, y + 0.03, z - 0.02], [xo, y + 0.03, z + 0.02], hanger);
          else sink.quad('structureMetal', [xo, y, z - 0.02], [xo, y, z + 0.02], [xo, y + 0.03, z + 0.02], [xo, y + 0.03, z - 0.02], hanger);
        }
      });
    }
  }
  return frame;
}

export interface HoleRect { u0: number; u1: number; y0: number; y1: number }
/** A weathering stain on a face: the wall inside it shaded from `bottom` (at y0) to `top` (at y1). */
export interface Stain { u0: number; u1: number; y0: number; y1: number; bottom: number; top: number }

/**
 * A wall face cut by openings: the face around them in horizontal bands, each opening's reveal (jambs, head, sill)
 * back to the frame plane `reveal` metres in, and a dark backing just behind it (a unit's pane or leaf covers it; an
 * opening a dialect leaves empty reads as a dark void, never as a hole through the house). The reveals carry an
 * occlusion shade for the weathering pass. Strips and reveals share their corners exactly (welded solids).
 */
export function holedFace(sink: PartSink, bucket: RegionalBucket, face: Face, rect: WallRect, holes: readonly HoleRect[], reveal: number,
  stains: readonly Stain[] = [], revealShade: readonly number[] = [], topShade = 1, bottomShade = 1): void {
  const m = 0.04;
  const kept: number[] = [];
  const hs = holes.map((h) => ({ u0: Math.max(h.u0, rect.u0 + m), u1: Math.min(h.u1, rect.u1 - m), y0: Math.max(h.y0, rect.y0),
    y1: Math.min(h.y1, rect.y1 - m) })).filter((h, k) => {
    const ok = h.u1 - h.u0 > 0.05 && h.y1 - h.y0 > 0.05;
    if (ok) kept.push(k);
    return ok;
  });
  // stains clipped to the face (a stain never reaches into another storey)
  const ss = stains.map((t) => ({ ...t, u0: Math.max(t.u0, rect.u0), u1: Math.min(t.u1, rect.u1), y0c: Math.max(t.y0, rect.y0),
    y1c: Math.min(t.y1, rect.y1) })).filter((t) => t.u1 - t.u0 > 0.05 && t.y1c - t.y0c > 0.05);
  const P = (u: number, yy: number, o = 0): Vec3 => facePoint(face, u, yy, o);
  const ys = [...new Set([rect.y0, rect.y1, ...hs.flatMap((h) => [h.y0, h.y1]), ...ss.flatMap((t) => [t.y0c, t.y1c])])].sort((a, b) => a - b);
  const stainAt = (t: (typeof ss)[number], yy: number) => t.bottom + (t.top - t.bottom) * Math.min(1, Math.max(0, (yy - t.y0) / (t.y1 - t.y0)));
  for (let i = 0; i + 1 < ys.length; i++) {
    const ya = ys[i], yb = ys[i + 1];
    if (yb - ya < 1e-5) continue;
    const cuts = hs.filter((h) => h.y0 <= ya + 1e-6 && h.y1 >= yb - 1e-6).map((h): [number, number] => [h.u0, h.u1]).sort((a, b) => a[0] - b[0]);
    const live = ss.filter((t) => t.y0c <= ya + 1e-6 && t.y1c >= yb - 1e-6);
    // the strips between openings, split again at the edges of the stains that run through this band
    const marks = [...new Set(live.flatMap((t) => [t.u0, t.u1]))].sort((a, b) => a - b);
    const strip = (ua: number, ub: number) => {
      const edges = [ua, ...marks.filter((x) => x > ua + 1e-5 && x < ub - 1e-5), ub];
      for (let k = 0; k + 1 < edges.length; k++) {
        const a = edges[k], b = edges[k + 1];
        if (b - a <= 1e-5) continue;
        const mid = (a + b) / 2;
        const inStain = live.filter((t) => mid > t.u0 && mid < t.u1);
        // the rain shadow under the eaves (facade craft): the wall's top row of corners darker, on the vertices it has;
        // and the grime where the wall meets the ground (splash and rising damp), its bottom row of corners darker
        const top = topShade !== 1 && yb >= rect.y1 - 1e-6 ? topShade : 1;
        const foot = bottomShade !== 1 && ya <= rect.y0 + 1e-6 ? bottomShade : 1;
        if (!inStain.length) {
          if (top === 1 && foot === 1) sink.quad(bucket, P(a, ya), P(b, ya), P(b, yb), P(a, yb));
          else sink.quad(bucket, P(a, ya), P(b, ya), P(b, yb), P(a, yb), { shadeAt: (q) => (q[1] >= rect.y1 - 1e-6 ? top : q[1] <= rect.y0 + 1e-6 ? foot : 1) });
          continue;
        }
        const lo = inStain.reduce((v, t) => v * stainAt(t, ya), 1) * foot, hi = inStain.reduce((v, t) => v * stainAt(t, yb), 1) * top;
        // each row of corners carries its own shade: the stain fades along the face
        const midY = (ya + yb) / 2;
        sink.quad(bucket, P(a, ya), P(b, ya), P(b, yb), P(a, yb), { shadeAt: (q) => (q[1] < midY ? lo : hi) });
      }
    };
    let cur = rect.u0;
    for (const [a, b] of cuts) { strip(cur, a); cur = Math.max(cur, b); }
    strip(cur, rect.u1);
  }
  if (reveal <= 0) return;
  const r = -reveal;
  // (facade craft, desktop; wave 150: "windows set flush in the wall, with no reveal depth") the reveals a third darker,
  // as the wall's thickness shades them
  const deep = facadeOn() ? 0.68 : 1;
  hs.forEach((h, k) => {
    const dark = (revealShade[kept[k]] ?? 1) * deep;
    // left jamb faces +u, right jamb -u, the head down, the sill up
    sink.quad(bucket, P(h.u0, h.y0), P(h.u0, h.y0, r), P(h.u0, h.y1, r), P(h.u0, h.y1), { shade: 0.74 * dark });
    sink.quad(bucket, P(h.u1, h.y0), P(h.u1, h.y1), P(h.u1, h.y1, r), P(h.u1, h.y0, r), { shade: 0.74 * dark });
    sink.quad(bucket, P(h.u0, h.y1), P(h.u0, h.y1, r), P(h.u1, h.y1, r), P(h.u1, h.y1), { shade: 0.66 * dark });
    sink.quad(bucket, P(h.u0, h.y0), P(h.u1, h.y0), P(h.u1, h.y0, r), P(h.u0, h.y0, r), { shade: 0.9 * dark });
    const back = r - 0.004;
    sink.quad('dark', P(h.u0, h.y0, back), P(h.u1, h.y0, back), P(h.u1, h.y1, back), P(h.u0, h.y1, back), { decor: true });
  });
}

/** A wall polygon (u, y pairs, counter-clockwise seen from outside) on a face, `depth` thick inward. */
export function wallPolygon(sink: PartSink, bucket: RegionalBucket, face: Face, poly: Array<[number, number]>, depth: number, opts: EmitOptions = {}): void {
  const pts = poly.map(([u, yy]) => facePoint(face, u, yy, 0));
  const inward: Vec3 = [-face.out[0], -face.out[1], -face.out[2]];
  // prism(): points ccw seen from +dir (from inside) — the outside-ccw polygon reversed
  sink.prism(bucket, pts.reverse(), inward, depth, opts);
}

function shadeRgb(c: Rgb, k: number): Rgb {
  return [c[0] * k, c[1] * k, c[2] * k];
}

/**
 * A downpipe's fittings (facade craft): the hopper head under the swan neck, two clips holding it to the wall and the
 * shoe kicking the water off at its foot, drawn near the camera only (EmitOptions.fine 'near'). (x, z) is the pipe's
 * axis, `side` the eaves side its wall faces (+x or -x).
 */
function downpipeFittings(sink: PartSink, x: number, z: number, side: number, baseY: number, topY: number, colour: Rgb): void {
  const fine = { colour, decor: true, fine: 'near' as const };
  sink.span('structureMetal', x - 0.09, topY - 0.24, z - 0.09, x + 0.09, topY - 0.02, z + 0.09, fine);
  const y = baseY + (topY - baseY) * 0.5;
  sink.span('structureMetal', Math.min(x, x - side * 0.08) - 0.055, y, z - 0.055, Math.max(x, x - side * 0.08) + 0.055, y + 0.035, z + 0.055,
    { colour: shadeRgb(colour, 0.75), decor: true, fine: 'near' });
  sink.span('structureMetal', Math.min(x, x + side * 0.16) - 0.045, baseY, z - 0.045, Math.max(x, x + side * 0.16) + 0.045, baseY + 0.09, z + 0.045, fine);
}

/** A half-plane of a face's (u, y): the side where a·u + b·y ≤ c. */
type FaceHalfPlane = readonly [number, number, number];

/** A convex polygon of face points clipped to a half-plane (Sutherland–Hodgman). */
function clipFace(poly: Array<[number, number]>, [a, b, c]: FaceHalfPlane): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const dp = a * p[0] + b * p[1] - c, dq = a * q[0] + b * q[1] - c;
    if (dp <= 0) out.push(p);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
      const t = dp / (dp - dq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/** Small helpers shared by the dialects. */
export const H = {
  faceBox,
  facePoint,
  /** a vertical post on a face from y0 to y1 at u, protruding `out` */
  post(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, y0: number, y1: number, width: number, out: number, opts: EmitOptions): void {
    if (y1 - y0 < 0.02) return;
    captureMember('post', u, y0, u, y1, width, out, opts);
    sink.member(bucket, facePoint(face, u, y0), facePoint(face, u, y1), width, out, face.out, opts);
  },
  /** a horizontal rail on a face from u0 to u1 at y */
  rail(sink: PartSink, bucket: RegionalBucket, face: Face, u0: number, u1: number, y: number, height: number, out: number, opts: EmitOptions & { ends?: boolean }): void {
    if (u1 - u0 < 0.02) return;
    captureMember('rail', u0, y, u1, y, height, out, opts);
    sink.member(bucket, facePoint(face, u0, y), facePoint(face, u1, y), height, out, face.out, opts);
  },
  /** a diagonal brace between two face points */
  brace(sink: PartSink, bucket: RegionalBucket, face: Face, u0: number, y0: number, u1: number, y1: number, width: number, out: number, opts: EmitOptions): void {
    captureMember('brace', u0, y0, u1, y1, width, out, opts);
    sink.member(bucket, facePoint(face, u0, y0), facePoint(face, u1, y1), width, out, face.out, opts);
  },
  /**
   * A brace cut to its panel (the facade craft's round 6; wave 241: "the lower diagonal brace lapping across the post
   * instead of being jointed into it"): the strip `width` wide along (u0, y0) → (u1, y1), clipped by `keep` — the faces
   * of the posts, rails and braces it is tenoned into — so its ends are cut to their angle and sit flush against those
   * faces, as a jointed brace does. Its face and its two long sides are drawn (the sides fine joinery, as a member's);
   * the cut ends abut their neighbours and never show. `out` and `embed` as `member`'s: flush with a post of that `out`.
   */
  strut(sink: PartSink, bucket: RegionalBucket, face: Face, u0: number, y0: number, u1: number, y1: number, width: number, out: number,
    keep: readonly FaceHalfPlane[], opts: EmitOptions, embed = 0.02): void {
    const du = u1 - u0, dy = y1 - y0, len = Math.hypot(du, dy);
    if (len < 1e-3) return;
    captureMember('brace', u0, y0, u1, y1, width, out, opts);
    const au = du / len, ay = dy / len, nu = -ay, ny = au, hw = width / 2, ext = width + 0.05;
    const s0u = u0 - au * ext, s0y = y0 - ay * ext, s1u = u1 + au * ext, s1y = y1 + ay * ext;
    let poly: Array<[number, number]> = [[s0u - nu * hw, s0y - ny * hw], [s1u - nu * hw, s1y - ny * hw], [s1u + nu * hw, s1y + ny * hw],
      [s0u + nu * hw, s0y + ny * hw]];
    for (const h of keep) {
      poly = clipFace(poly, h);
      if (poly.length < 3) return;
    }
    // the member frame (member UVs: the grain along the brace)
    const axis = normalize3([face.u[0] * au, ay, face.u[2] * au]);
    const across = normalize3([axis[1] * face.out[2] - axis[2] * face.out[1], axis[2] * face.out[0] - axis[0] * face.out[2],
      axis[0] * face.out[1] - axis[1] * face.out[0]]);
    const frame = new LocalFrame(across, axis, face.out, facePoint(face, (u0 + u1) / 2, (y0 + y1) / 2, out / 2 - embed));
    const front = out - embed, back = -embed;
    const o: EmitOptions = { ...opts, uv: UV_MEMBER };
    sink.polygon(bucket, poly.map(([u, y]) => facePoint(face, u, y, front)), o, frame);
    const sides: EmitOptions = opts.decor && !opts.shadow ? { ...o, fine: opts.fineSides === 'near' || opts.fine === 'near' ? 'near' : true } : o;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      // a long side lies on one of the strip's edges, hw off its axis; every other edge is a cut end
      const op = (p[0] - u0) * nu + (p[1] - y0) * ny, oq = (q[0] - u0) * nu + (q[1] - y0) * ny;
      if (Math.abs(Math.abs(op) - hw) > 1e-6 || Math.abs(op - oq) > 1e-6) continue;
      sink.quad(bucket, facePoint(face, p[0], p[1], back), facePoint(face, q[0], q[1], back), facePoint(face, q[0], q[1], front),
        facePoint(face, p[0], p[1], front), sides, frame);
    }
  },
  /** The half-planes either side of a strut's strip (left of it, right of it): a brace halved across it keeps to one. */
  beside(u0: number, y0: number, u1: number, y1: number, width: number): [FaceHalfPlane, FaceHalfPlane] {
    const len = Math.hypot(u1 - u0, y1 - y0) || 1, nu = -(y1 - y0) / len, ny = (u1 - u0) / len, c = nu * u0 + ny * y0, hw = width / 2;
    return [[-nu, -ny, -(c + hw)], [nu, ny, c - hw]];
  },
  /** A panel's half-planes: between the post faces u0 and u1 and the rail faces y0 and y1. */
  panel(u0: number, u1: number, y0: number, y1: number): FaceHalfPlane[] {
    return [[-1, 0, -u0], [1, 0, u1], [0, -1, -y0], [0, 1, y1]];
  },
};
