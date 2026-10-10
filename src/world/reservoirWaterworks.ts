/** Reservoir-only construction: exchange accepted rubble for working waterworks. */
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { setObbShape, type CollisionRecord } from './collision.ts';
import { slabBox } from './propGeometry.ts';
import { PartSink, hashSeed, streamFrom, type RegionalBucket, type Rgb, type Vec3 } from './maps/regional/geometry.ts';
import { DEFAULT_WEATHER, pickWeatherTints, type WeatherPalette } from './maps/regional/weather.ts';

type Point2 = readonly [number, number];
type Point3 = readonly [number, number, number];
type BucketName = 'stone' | 'wood' | 'dark' | 'regionalStone' | 'curtain';
export interface ReservoirWaterworksConfig {
  lakeIndex: number;
  kiosk: Point2;
  bank: Point2;
  intake: Point2;
}
export interface WaterworksRubblePacket {
  stone: BufferGeometry[];
  wood: BufferGeometry[];
  obstacle: CollisionRecord;
  collider: CollisionRecord;
}
interface WaterworksTerrain {
  getHeightAt(x: number, z: number): number;
  getWaterMaskAt(x: number, z: number): number;
  _roadDist(x: number, z: number): number;
  _layout: {
    lakes: readonly { level?: number }[];
    spawns: { player: { x: number; z: number }; enemies: readonly { x: number; z: number }[] };
  };
}
interface Buckets {
  stone: BufferGeometry[]; wood: BufferGeometry[]; dark: BufferGeometry[];
  /** the regional kit's weathered stone and curtained panes (props.ts): the pump house draws in them when they exist */
  regionalStone?: BufferGeometry[]; curtain?: BufferGeometry[];
}
interface Budget { triangles: number; sourceBytes: number; mergedBytes: number; geometries: number }
interface Body {
  name: 'kiosk' | 'bank' | 'intake'; x: number; z: number; width: number; depth: number;
  bottom: number; top: number; collisionTop: number; supportMin: number; supportMax: number;
}
interface Piece { bucket: BucketName; geometry: BufferGeometry }
interface Plan { bodies: Body[]; pipe: Point3[]; waterLevel: number }
interface SiteRect { x0: number; z0: number; x1: number; z1: number }
interface Support { min: number; max: number }
interface PipeRoute { ax: number; az: number; dx: number; dz: number; nx: number; nz: number }
interface DonorSelection { removed: Set<BufferGeometry>; ignored: Set<CollisionRecord> }
interface ReservoirWaterworksReceipt {
  status: 'built' | 'unavailable' | 'unsafe' | 'budget';
  donors: number;
  before: Budget;
  after: Budget;
  bodies: Body[];
  pipe: Point3[];
}

function emptyBudget(): Budget {
  return { triangles: 0, sourceBytes: 0, mergedBytes: 0, geometries: 0 };
}

function addBudget(out: Budget, geometry: BufferGeometry): void {
  const indices = geometry.index?.count ?? geometry.attributes.position.count;
  out.triangles += indices / 3;
  out.geometries++;
  out.sourceBytes += geometry.index?.array.byteLength ?? 0;
  for (const attribute of Object.values(geometry.attributes)) {
    out.sourceBytes += attribute.array.byteLength;
    // props.ts expands indexed pieces before its final material merge.
    out.mergedBytes += indices * attribute.itemSize * attribute.array.BYTES_PER_ELEMENT;
  }
}

function safePoint(field: WaterworksTerrain, x: number, z: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.max(Math.abs(x), Math.abs(z)) > 455
      || field._roadDist(x, z) < 8) return false;
  const spawns = field._layout.spawns;
  if (Math.hypot(x - spawns.player.x, z - spawns.player.z) < 32) return false;
  return !spawns.enemies.some(s => Math.hypot(x - s.x, z - s.z) < 32);
}

function blocked(x0: number, z0: number, x1: number, z1: number,
  blockers: readonly CollisionRecord[], ignored: ReadonlySet<CollisionRecord>): boolean {
  return blockers.some(ob => !ignored.has(ob) && x1 + 0.3 > ob.min[0] && x0 - 0.3 < ob.max[0]
    && z1 + 0.3 > ob.min[2] && z0 - 0.3 < ob.max[2]);
}

function supportedBodyHeight(name: Body['name'], field: WaterworksTerrain, x: number, z: number): number | null {
  if (!safePoint(field, x, z)) return null;
  const y = field.getHeightAt(x, z), water = field.getWaterMaskAt(x, z);
  if (!Number.isFinite(y) || !Number.isFinite(water)) return null;
  if (name === 'kiosk' ? water !== 0 : name === 'intake' && water < 0.99) return null;
  return y;
}

function sampleBodySupport(name: Body['name'], field: WaterworksTerrain, rect: SiteRect): Support | null {
  let min = Infinity, max = -Infinity;
  for (let px = rect.x0; px <= rect.x1; px += 0.5) for (let pz = rect.z0; pz <= rect.z1; pz += 0.5) {
    const y = supportedBodyHeight(name, field, px, pz);
    if (y === null) return null;
    min = Math.min(min, y); max = Math.max(max, y);
  }
  return { min, max };
}

function planBody(name: Body['name'], center: Point2, width: number, depth: number,
  field: WaterworksTerrain, level: number, blockers: readonly CollisionRecord[],
  ignored: ReadonlySet<CollisionRecord>): Body | null {
  const [x, z] = center, x0 = x - width / 2, x1 = x + width / 2;
  const z0 = z - depth / 2, z1 = z + depth / 2;
  if (!safePoint(field, x, z)) return null;
  if (blocked(x0, z0, x1, z1, blockers, ignored)) return null;
  const support = sampleBodySupport(name, field, { x0, z0, x1, z1 });
  if (!support) return null;
  const { min, max } = support;
  if (name === 'kiosk' ? max - min > 0.65 : min < level - 0.02 || max > level + 0.4) return null;
  // Water height is the visible liquid surface, not a claim about the lakebed.
  // Both hydraulic foundations continue below it; the dry body buries its toe.
  const bottom = name === 'kiosk' ? min - 0.12 : level - 1.2;
  const top = name === 'kiosk' ? max + 3.2 : level + (name === 'intake' ? 7.4 : 1.1);
  return { name, x, z, width, depth, bottom, top, collisionTop: top + 0.06,
    supportMin: min, supportMax: max };
}

function clearPipeSpan(field: WaterworksTerrain, route: PipeRoute, segment: number,
  blockers: readonly CollisionRecord[], ignored: ReadonlySet<CollisionRecord>): boolean {
  const { ax, az, dx, dz, nx, nz } = route;
  let high = -Infinity;
  const x0 = ax + dx * segment / 7, z0 = az + dz * segment / 7;
  const x1 = ax + dx * (segment + 1) / 7, z1 = az + dz * (segment + 1) / 7;
  if (blocked(Math.min(x0, x1) - 0.45, Math.min(z0, z1) - 0.45,
    Math.max(x0, x1) + 0.45, Math.max(z0, z1) + 0.45, blockers, ignored)) return false;
  for (let step = 0; step <= 8; step++) for (const across of [-0.45, 0, 0.45]) {
    const t = (segment + step / 8) / 7, x = ax + dx * t + nx * across;
    const z = az + dz * t + nz * across;
    if (!safePoint(field, x, z)) return false;
    high = Math.max(high, field.getHeightAt(x, z));
  }
  return Number.isFinite(high);
}

function liftPipeSpan(field: WaterworksTerrain, route: PipeRoute, ys: Float64Array, segment: number): boolean {
  const { ax, az, dx, dz, nx, nz } = route;
  let lift = 0;
  for (let step = 0; step <= 16; step++) {
    const f = step / 16, t = (segment + f) / 7;
    for (const across of [-0.4, 0, 0.4]) {
      const ground = field.getHeightAt(ax + dx * t + nx * across, az + dz * t + nz * across);
      lift = Math.max(lift, ground + 0.42 - (ys[segment] * (1 - f) + ys[segment + 1] * f));
    }
  }
  if (lift > 0.55) return false;
  ys[segment] += lift; ys[segment + 1] += lift;
  return true;
}

function planPipe(field: WaterworksTerrain, bodies: Body[], blockers: readonly CollisionRecord[],
  ignored: ReadonlySet<CollisionRecord>): Point3[] | null {
  const [kiosk, bank] = bodies;
  const ax = kiosk.x + kiosk.width / 2 - 0.12, az = kiosk.z + 1.5;
  const bx = bank.x - bank.width / 2 + 0.4, bz = bank.z - 1;
  const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
  if (length < 5 || length > 40) return null;
  const route = { ax, az, dx, dz, nx: -dz / length, nz: dx / length };
  const ys = new Float64Array(8), pipe: Point3[] = [];
  for (let ring = 0; ring < 8; ring++) {
    ys[ring] = field.getHeightAt(ax + dx * ring / 7, az + dz * ring / 7) + 0.55;
  }
  // Each connected ring sits above the whole adjoining segment footprint.
  // A bounded dense check prevents a straight tube chord cutting into a bank.
  for (let segment = 0; segment < 7; segment++) {
    if (!clearPipeSpan(field, route, segment, blockers, ignored)) return null;
  }
  // Raise the adjacent endpoints by only the measured chord penetration.
  for (let segment = 0; segment < 7; segment++) {
    if (!liftPipeSpan(field, route, ys, segment)) return null;
  }
  for (let i = 0; i < 8; i++) pipe.push([ax + dx * i / 7, ys[i], az + dz * i / 7]);
  // Tube ends actually penetrate the two solid buildings, rather than float
  // next to them; no unconnected terminal caps or invisible bridging volume.
  if (ys[0] + 0.35 >= kiosk.top || ys[7] + 0.35 >= bank.top) return null;
  return pipe;
}

function planWorks(config: ReservoirWaterworksConfig, field: WaterworksTerrain,
  blockers: readonly CollisionRecord[], ignored: ReadonlySet<CollisionRecord>): Plan | null {
  const waterLevel = field._layout.lakes[config.lakeIndex]?.level;
  if (!Number.isFinite(waterLevel)) return null;
  const level = waterLevel!;
  const kiosk = planBody('kiosk', config.kiosk, 6, 6, field, level, blockers, ignored);
  const bank = planBody('bank', config.bank, 7, 12, field, level, blockers, ignored);
  const intake = planBody('intake', config.intake, 7, 6, field, level, blockers, ignored);
  if (!kiosk || !bank || !intake) return null;
  // Bank and intake share one closed, supported interface, not a water gap.
  if (Math.abs(bank.x + bank.width / 2 - (intake.x - intake.width / 2)) > 0.001
      || Math.abs(bank.z - intake.z) + intake.depth / 2 > bank.depth / 2) return null;
  const bodies = [kiosk, bank, intake], pipe = planPipe(field, bodies, blockers, ignored);
  return pipe ? { bodies, pipe, waterLevel: level } : null;
}

function piece(out: Piece[], bucket: BucketName, name: string,
  width: number, height: number, depth: number, x: number, y: number, z: number): BufferGeometry {
  const geometry = slabBox(width, height, depth, 0.65);
  geometry.name = `reservoir-${name}`;
  geometry.translate(x, y, z);
  out.push({ bucket, geometry });
  return geometry;
}

function shapeIntakeHood(geometry: BufferGeometry, body: Body): void {
  const position = geometry.attributes.position, uv = geometry.attributes.uv;
  let highest = -Infinity;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) - body.x, z = position.getZ(i) - body.z;
    // The collision format extrudes one footprint through a single height.
    // A full-footprint closed hood matches that solid exactly; a tapered or
    // pitched head would introduce long invisible blockers for grazing shells.
    const y = body.top + (position.getY(i) > body.top ? 1.04 : -0.06);
    position.setXYZ(i, body.x + x, y, body.z + z);
    const face = Math.floor(i / 4);
    const u = face < 2 ? (face === 0 ? -z : z) + body.depth / 2
      : (face === 5 ? -x : x) + body.width / 2;
    const v = face === 2 || face === 3 ? (face === 2 ? -z : z) + body.depth / 2
      : y - (body.top - 0.06);
    // Reproject the deformed surfaces at the existing metric texture density;
    // do not stretch the old 12cm cap's V range over the new service head.
    uv.setXY(i, u * 0.65, v * 0.65);
    highest = Math.max(highest, position.getY(i));
  }
  geometry.computeVertexNormals();
  // The overlapping body and hood form exactly the existing hard-plan OBB.
  body.collisionTop = highest;
}

/** The pump house's openings, in its own face frames (u along the face as seen from outside, metres from its centre). */
const KIOSK_DOOR = { u: 1.3, width: 1.15, height: 2.15, depth: 0.3 } as const;
const KIOSK_WINDOWS = { us: [-1.35, 1.35], width: 1.0, sillBelowTop: 2.05, headBelowTop: 0.7, depth: 0.22 } as const;
/** The rising-damp band's cut (m over the lowest ground) and weather.ts DAMP_TABLE's darkening at the foot and the cut. */
const KIOSK_DAMP_CUT_M = 1.0, KIOSK_DAMP_FOOT = 0.648, KIOSK_DAMP_AT_CUT = 0.93;
/** Dressed stone at the openings (lintels, reveals, sills): a lighter, warmer course of the same greywacke. */
const KIOSK_DRESSED: Rgb = [1.14, 1.11, 1.05];
/** The plinth under the damp cut: a darker, cooler course (the masonry's foot, laid in harder stone). */
const KIOSK_PLINTH: Rgb = [0.86, 0.86, 0.89];

interface KioskFace { n: Vec3; r: Vec3; c: Vec3; half: number }

/**
 * The pump house in the Reservoir's regional kit (the Eifel kit, maps/regional/eifel.ts): its walls are the weathered
 * greywacke Reservoir's houses already draw (regionalStone: the building's tint, the rising damp at the foot), on
 * exactly the old body's hard plan, with dressed lintels, a recessed plank door on its threshold and two iron-framed
 * windows over stone sills whose curtained panes are lit at night (the curtain family, its authored aperture mask).
 * No new material family, no collision part, no draw from any props stream (the tints come from the kiosk's own
 * hashed stream). Built in world coordinates so the walls stand on the hard plan to the float.
 */
function buildKitKiosk(kiosk: Body, field: WaterworksTerrain, palette: WeatherPalette, out: Piece[]): void {
  const sink = new PartSink([2.37, 1.13]);
  const tint = pickWeatherTints(palette, streamFrom(hashSeed('reservoir:waterworks:kiosk', kiosk.x, kiosk.z))).stone;
  const damp = Math.min(1, Math.max(0, palette.damp));
  const ground = kiosk.supportMin, yb = kiosk.bottom, yt = kiosk.top, yc = ground + KIOSK_DAMP_CUT_M;
  const kFoot = 1 - (1 - KIOSK_DAMP_FOOT) * damp, kCut = 1 - (1 - KIOSK_DAMP_AT_CUT) * damp;
  // Piecewise linear over the only heights every wall edge carries (foot, cut, top): neighbouring wall pieces agree
  // along every shared edge, whatever their openings.
  const damped = (y: number): number => y <= yc
    ? kFoot + (kCut - kFoot) * Math.max(0, (y - yb) / (yc - yb))
    : kCut + (1 - kCut) * Math.min(1, (y - yc) / (yt - yc));
  const colour = (k: Rgb, shade = 1) => (p: Vec3): Rgb => {
    const f = damped(p[1]) * shade;
    return [Math.min(1.2, tint[0] * k[0] * f), Math.min(1.2, tint[1] * k[1] * f), Math.min(1.2, tint[2] * k[2] * f)];
  };
  const PLAIN: Rgb = [1, 1, 1];
  const hw = kiosk.width / 2, hd = kiosk.depth / 2;
  const face = (n: Vec3, r: Vec3, half: number): KioskFace => ({ n, r, half,
    c: [kiosk.x + n[0] * hw, 0, kiosk.z + n[2] * hd] });
  const south = face([0, 0, -1], [-1, 0, 0], hw), north = face([0, 0, 1], [1, 0, 0], hw);
  const west = face([-1, 0, 0], [0, 0, 1], hd), east = face([1, 0, 0], [0, 0, -1], hd);
  const at = (f: KioskFace, u: number, y: number, inset = 0): Vec3 =>
    [f.c[0] + f.r[0] * u - f.n[0] * inset, y, f.c[2] + f.r[2] * u - f.n[2] * inset];
  /** One quad wound counter-clockwise as seen from the side `facing` points to. */
  const quad = (bucket: RegionalBucket, pts: Vec3[], facing: Vec3, opts: Parameters<PartSink['quad']>[5] = {}): void => {
    const [a, b, c] = pts;
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const ordered = nx * facing[0] + ny * facing[1] + nz * facing[2] >= 0 ? pts : [...pts].reverse();
    sink.quad(bucket, ordered[0], ordered[1], ordered[2], ordered[3], opts);
  };
  const UP: Vec3 = [0, 1, 0], DOWN: Vec3 = [0, -1, 0];
  /** A wall piece on a face, cut at the damp band when it spans it: the plinth course under the cut, the wall over it. */
  const wall = (f: KioskFace, u0: number, u1: number, y0: number, y1: number, k: Rgb = PLAIN): void => {
    const cuts = y0 < yc && yc < y1 ? [y0, yc, y1] : [y0, y1];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const plinth = cuts[i + 1] <= yc && k === PLAIN;
      quad('regionalStone', [at(f, u0, cuts[i]), at(f, u1, cuts[i]), at(f, u1, cuts[i + 1]), at(f, u0, cuts[i + 1])], f.n,
        { colourAt: colour(plinth ? KIOSK_PLINTH : k) });
    }
  };
  /** An opening's reveal (its two jambs, soffit and floor in dressed stone) back to `depth`. */
  const reveal = (f: KioskFace, u0: number, u1: number, y0: number, y1: number, depth: number): void => {
    const neg: Vec3 = [-f.r[0], 0, -f.r[2]];
    quad('regionalStone', [at(f, u0, y0), at(f, u0, y0, depth), at(f, u0, y1, depth), at(f, u0, y1)], f.r,
      { colourAt: colour(KIOSK_DRESSED, 0.8) });
    quad('regionalStone', [at(f, u1, y0), at(f, u1, y1), at(f, u1, y1, depth), at(f, u1, y0, depth)], neg,
      { colourAt: colour(KIOSK_DRESSED, 0.8) });
    quad('regionalStone', [at(f, u0, y1), at(f, u1, y1), at(f, u1, y1, depth), at(f, u0, y1, depth)], DOWN,
      { colourAt: colour(KIOSK_DRESSED, 0.66) });
    quad('regionalStone', [at(f, u0, y0), at(f, u0, y0, depth), at(f, u1, y0, depth), at(f, u1, y0)], UP,
      { colourAt: colour(KIOSK_DRESSED) });
  };
  /** A face pierced by openings [u0, u1, y0, y1] (sorted along u): full piers, the wall under each and the dressed
   * lintel course over it. */
  const pierced = (f: KioskFace, openings: Array<[number, number, number, number]>): void => {
    let u = -f.half;
    for (const [u0, u1, y0, y1] of openings) {
      wall(f, u, u0, yb, yt);
      if (y0 > yb) wall(f, u0, u1, yb, y0);
      const lintel = Math.min(yt, y1 + 0.24);
      wall(f, u0, u1, y1, lintel, KIOSK_DRESSED);
      if (lintel < yt) wall(f, u0, u1, lintel, yt);
      u = u1;
    }
    wall(f, u, f.half, yb, yt);
  };
  // the door: its threshold a step over the highest ground along it (sampled on the face line), never over the cut
  let doorGround = -Infinity;
  for (let t = 0; t <= 4; t++) {
    const p = at(south, KIOSK_DOOR.u - KIOSK_DOOR.width / 2 + KIOSK_DOOR.width * t / 4, 0);
    doorGround = Math.max(doorGround, field.getHeightAt(p[0], p[2]));
  }
  const dU0 = KIOSK_DOOR.u - KIOSK_DOOR.width / 2, dU1 = KIOSK_DOOR.u + KIOSK_DOOR.width / 2;
  const thr = Math.min(Math.max(doorGround, ground) + 0.15, yc - 0.05), head = thr + KIOSK_DOOR.height;
  // (the windows: high sills, iron frames)
  const sill = yt - KIOSK_WINDOWS.sillBelowTop, wHead = yt - KIOSK_WINDOWS.headBelowTop;
  const windows = KIOSK_WINDOWS.us.map((u): [number, number, number, number] =>
    [u - KIOSK_WINDOWS.width / 2, u + KIOSK_WINDOWS.width / 2, sill, wHead]);
  pierced(south, [[dU0, dU1, thr, head]]);
  pierced(west, windows);
  wall(north, -north.half, north.half, yb, yt);
  wall(east, -east.half, east.half, yb, yt);
  reveal(south, dU0, dU1, thr, head, KIOSK_DOOR.depth);
  for (const [u0, u1, y0, y1] of windows) reveal(west, u0, u1, y0, y1, KIOSK_WINDOWS.depth);
  // the stone sills under the windows: 5 cm proud of the hard plan, dressing only (no collision part)
  for (const [u0, u1, y0] of windows) {
    const s0 = u0 - 0.08, s1 = u1 + 0.08, out = -0.05, sy = y0 - 0.08, decor = { colourAt: colour(KIOSK_DRESSED), decor: true };
    quad('regionalStone', [at(west, s0, y0, out), at(west, s0, y0), at(west, s1, y0), at(west, s1, y0, out)], UP, decor);
    quad('regionalStone', [at(west, s0, sy, out), at(west, s1, sy, out), at(west, s1, y0, out), at(west, s0, y0, out)], west.n, decor);
    quad('regionalStone', [at(west, s0, sy, out), at(west, s0, sy), at(west, s1, sy), at(west, s1, sy, out)], DOWN, decor);
  }
  // the plank door at the back of its reveal
  quad('wood', [at(south, dU0, thr, KIOSK_DOOR.depth), at(south, dU1, thr, KIOSK_DOOR.depth),
    at(south, dU1, head, KIOSK_DOOR.depth), at(south, dU0, head, KIOSK_DOOR.depth)], south.n, { decor: true });
  // the windows: curtained panes (lit at night: the curtain family's authored aperture) behind iron frames and bars
  for (const [u0, u1, y0, y1] of windows) {
    const d = KIOSK_WINDOWS.depth;
    quad('curtain', [at(west, u0, y0, d), at(west, u1, y0, d), at(west, u1, y1, d), at(west, u0, y1, d)], west.n,
      { window: west.n });
    const fw = 0.06, bw = 0.045, dd = d - 0.02, um = (u0 + u1) / 2;
    const bar = (a0: number, a1: number, b0: number, b1: number, inset: number) => quad('dark',
      [at(west, a0, b0, inset), at(west, a1, b0, inset), at(west, a1, b1, inset), at(west, a0, b1, inset)], west.n,
      { decor: true });
    bar(u0, u0 + fw, y0, y1, dd); bar(u1 - fw, u1, y0, y1, dd);
    bar(u0 + fw, u1 - fw, y0, y0 + fw, dd); bar(u0 + fw, u1 - fw, y1 - fw, y1, dd);
    bar(um - bw / 2, um + bw / 2, y0 + fw, y1 - fw, dd);
    for (const t of [1 / 3, 2 / 3]) {
      const yy = y0 + (y1 - y0) * t;
      bar(u0 + fw, u1 - fw, yy - bw / 2, yy + bw / 2, dd - 0.002);
    }
  }
  // the vent high on the east wall (where the dark slab was, its size): five timber louvres over a dark backing, all
  // within 6 cm of the wall
  const vu0 = 1.3 - 0.675, vu1 = 1.3 + 0.675, vy0 = yt - 1.125, vy1 = yt - 0.475;
  quad('dark', [at(east, vu0, vy0, -0.01), at(east, vu1, vy0, -0.01), at(east, vu1, vy1, -0.01), at(east, vu0, vy1, -0.01)],
    east.n, { decor: true });
  for (let i = 0; i < 5; i++) {
    const y = vy0 + (vy1 - vy0) * (i + 0.5) / 5;
    quad('wood', [at(east, vu0, y - 0.05, -0.06), at(east, vu1, y - 0.05, -0.06), at(east, vu1, y + 0.05, -0.012),
      at(east, vu0, y + 0.05, -0.012)], [east.n[0], 0.7, east.n[2]], { decor: true });
  }
  const parts = sink.finish();
  const named: Array<[BucketName, BufferGeometry, string]> = [];
  for (const g of parts.regionalStone) named.push(['regionalStone', g, g.userData.noCollision ? 'kiosk-sills' : 'kiosk-body']);
  for (const g of parts.curtain) named.push(['curtain', g, 'kiosk-panes']);
  for (const g of parts.dark) named.push(['dark', g, 'kiosk-ironwork']);
  for (const g of parts.wood) named.push(['wood', g, 'kiosk-timber']);
  for (const [bucket, geometry, name] of named) {
    geometry.name = `reservoir-${name}`;
    out.push({ bucket, geometry });
  }
}

function buildBodies(plan: Plan, field: WaterworksTerrain, palette: WeatherPalette, out: Piece[]): void {
  for (const body of plan.bodies) {
    // (the pump house's walls are the kit's masonry, buildKitKiosk; the bank and the intake keep their stone bodies)
    if (body.name !== 'kiosk') piece(out, 'stone', `${body.name}-body`, body.width, body.top - body.bottom,
      body.depth, body.x, (body.top + body.bottom) / 2, body.z);
    // The ordinary cap overlaps by6cm. The intake reuses that same geometry
    // for a taller full-footprint closed hood, still inside one exact hard OBB.
    const cap = piece(out, 'dark', `${body.name}-cap`, body.width, 0.12,
      body.depth, body.x, body.top, body.z);
    if (body.name === 'intake') shapeIntakeHood(cap, body);
  }
  const [kiosk, bank, intake] = plan.bodies;
  buildKitKiosk(kiosk, field, palette, out);
  // Split the two closed screens between the exposed +Z approach wall and
  // lakeward +X face. Crossbars attach to solid masonry, not fake open holes.
  const faceX = intake.x + intake.width / 2;
  const faceZ = intake.z + intake.depth / 2;
  piece(out, 'dark', 'intake-screen', 2.8, 5.8, 0.10,
    intake.x, plan.waterLevel + 3.15, faceZ - 0.02);
  for (let j = 0; j < 3; j++) piece(out, 'stone', 'screen-crossbar', 2.9, 0.24, 0.16,
    intake.x, plan.waterLevel + 1.25 + j * 1.9, faceZ - 0.02);
  piece(out, 'dark', 'intake-screen', 0.10, 5.8, 1.95,
    faceX - 0.02, plan.waterLevel + 3.15, intake.z + 1.35);
  for (let j = 0; j < 3; j++) piece(out, 'stone', 'screen-crossbar', 0.16, 0.10, 2.05,
    faceX - 0.02, plan.waterLevel + 1.25 + j * 1.9, intake.z + 1.35);
  // Shallow attached trim: at most6cm outside the hard plan, reduced from the
  // previous17cm piers/23cm header. It does not create another collision slot.
  for (const z of [-2.65, 2.65]) piece(out, 'stone', 'intake-face-pier', 0.24, 7.2, 0.55,
    faceX - 0.06, plan.waterLevel + 3.6, intake.z + z);
  piece(out, 'stone', 'intake-header', 0.20, 0.50, 5.90,
    faceX - 0.04, intake.top - 0.25, intake.z);
  // Shallow soft fixtures overlap the cap by4cm and expose4cm above it.
  // Like the inset trim, they do not introduce another hard collision volume.
  for (const z of [-3.8, 3.8]) piece(out, 'dark', 'bank-hatch', 2.2, 0.08, 2.0,
    bank.x, bank.top + 0.06, bank.z + z);
  for (const z of [-4.7, 4.7]) piece(out, 'stone', 'bank-stop', 2.8, 0.22, 0.25,
    bank.x, bank.top + 0.06, bank.z + z);
}

function buildPipe(points: readonly Point3[], out: Piece[]): void {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  const first = points[0], last = points[points.length - 1];
  const length = Math.hypot(last[0] - first[0], last[2] - first[2]);
  const nx = -(last[2] - first[2]) / length, nz = (last[0] - first[0]) / length;
  let along = 0;
  for (let ring = 0; ring < points.length; ring++) {
    const p = points[ring];
    if (ring) along += Math.hypot(p[0] - points[ring - 1][0], p[1] - points[ring - 1][1], p[2] - points[ring - 1][2]);
    for (let side = 0; side <= 6; side++) {
      const angle = side * Math.PI / 3, across = Math.cos(angle) * 0.34;
      positions.push(p[0] + nx * across, p[1] + Math.sin(angle) * 0.34, p[2] + nz * across);
      uv.push(side / 6 * 2.14, along);
      if (ring && side < 6) {
        const a = (ring - 1) * 7 + side, b = ring * 7 + side;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  for (const ring of [0, points.length - 1]) {
    const c = positions.length / 3, p = points[ring];
    positions.push(...p); uv.push(0.5, 0.5);
    for (let side = 0; side < 6; side++) {
      const a = ring * 7 + side;
      if (ring === 0) indices.push(c, a, a + 1); else indices.push(c, a + 1, a);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  geometry.name = 'reservoir-connected-penstock';
  out.push({ bucket: 'dark', geometry });
}

function buildBraces(plan: Plan, field: WaterworksTerrain, out: Piece[]): void {
  for (const index of [1, 3, 5, 6]) {
    const [x, y, z] = plan.pipe[index];
    let ground = Infinity;
    for (const dx of [-0.42, 0.42]) for (const dz of [-0.42, 0.42]) {
      ground = Math.min(ground, field.getHeightAt(x + dx, z + dz));
    }
    const top = y - 0.26, bottom = ground - 0.10;
    piece(out, 'stone', 'penstock-support', 0.84, top - bottom, 0.84, x, (top + bottom) / 2, z);
  }
}

function replaceCollision(record: CollisionRecord, body: Body): void {
  record.min[1] = body.bottom; record.max[1] = body.collisionTop;
  setObbShape(record, body.x, body.z, body.width / 2, body.depth / 2);
  record.kind = 'waterworks';
}

function removeDonorGeometry(bucket: BufferGeometry[], removed: ReadonlySet<BufferGeometry>): void {
  let target = 0;
  for (const geometry of bucket) {
    if (removed.has(geometry)) geometry.dispose();
    else bucket[target++] = geometry;
  }
  bucket.length = target;
}

function collectRubblePacket(donor: WaterworksRubblePacket, buckets: Buckets,
  selection: DonorSelection, before: Budget): boolean {
  selection.ignored.add(donor.obstacle); selection.ignored.add(donor.collider);
  for (const bucket of ['stone', 'wood'] as const) for (const geometry of donor[bucket]) {
    if (!buckets[bucket].includes(geometry) || selection.removed.has(geometry)) return false;
    selection.removed.add(geometry); addBudget(before, geometry);
  }
  return true;
}

function collectDonors(donors: readonly WaterworksRubblePacket[], buckets: Buckets,
  blockers: readonly CollisionRecord[], before: Budget): DonorSelection | null {
  const selection: DonorSelection = { removed: new Set(), ignored: new Set() };
  for (const donor of donors) {
    if (!collectRubblePacket(donor, buckets, selection, before)) return null;
  }
  if (selection.ignored.size !== 6
      || [...selection.ignored].some(record => !blockers.includes(record))) return null;
  return selection;
}

function buildBudgetedWorks(plan: Plan, field: WaterworksTerrain, palette: WeatherPalette, before: Budget,
  after: Budget): Piece[] | null {
  const pieces: Piece[] = [];
  buildBodies(plan, field, palette, pieces); buildPipe(plan.pipe, pieces); buildBraces(plan, field, pieces);
  for (const p of pieces) addBudget(after, p.geometry);
  if (after.triangles > before.triangles || after.sourceBytes > before.sourceBytes
      || after.mergedBytes > before.mergedBytes || after.geometries > before.geometries) {
    pieces.forEach(p => p.geometry.dispose()); return null;
  }
  return pieces;
}

function commitWaterworks(plan: Plan, donors: readonly WaterworksRubblePacket[], buckets: Buckets,
  removed: ReadonlySet<BufferGeometry>, pieces: readonly Piece[]): void {
  removeDonorGeometry(buckets.stone, removed); removeDonorGeometry(buckets.wood, removed);
  for (const p of pieces) buckets[p.bucket]!.push(p.geometry);
  for (let index = 0; index < 3; index++) {
    replaceCollision(donors[index].obstacle, plan.bodies[index]);
    replaceCollision(donors[index].collider, plan.bodies[index]);
  }
}

/**
 * Atomic, construction-only replacement. No RNG, new material or new collider slot. `kit` is the map's regional
 * architecture (props.ts), whose weathering the pump house takes (weather.ts DEFAULT_WEATHER when the kit names none).
 */
export function composeReservoirWaterworks(mapId: string, config: ReservoirWaterworksConfig | undefined,
  field: WaterworksTerrain, donors: readonly WaterworksRubblePacket[], buckets: Buckets,
  blockers: readonly CollisionRecord[], kit: { weather?: WeatherPalette } | null = null): ReservoirWaterworksReceipt | null {
  if (mapId !== 'reservoir' || !config) return null;
  const before = emptyBudget(), after = emptyBudget();
  const receipt: ReservoirWaterworksReceipt = {
    status: 'unavailable', donors: donors.length, before, after, bodies: [], pipe: [],
  };
  if (donors.length !== 3) return receipt;
  const selection = collectDonors(donors, buckets, blockers, before);
  if (!selection) return receipt;
  // Both material families must already be used. Do not accidentally activate
  // a formerly empty dark bucket/extra shader on a changed authored layout.
  if (!buckets.dark.length || !buckets.stone.length) return receipt;
  // The pump house draws in the kit's weathered stone and curtained panes: only where the map's houses already draw both
  // (no family is activated by the waterworks).
  const palette = kit ? kit.weather ?? DEFAULT_WEATHER : null;
  if (!palette || !buckets.regionalStone?.length || !buckets.curtain?.length) return receipt;
  const plan = planWorks(config, field, blockers, selection.ignored);
  if (!plan) { receipt.status = 'unsafe'; return receipt; }
  const pieces = buildBudgetedWorks(plan, field, palette, before, after);
  if (!pieces) { receipt.status = 'budget'; return receipt; }
  // No donor or physical record is changed until the complete assembly passes.
  commitWaterworks(plan, donors, buckets, selection.removed, pieces);
  receipt.status = 'built'; receipt.bodies = plan.bodies; receipt.pipe = plan.pipe;
  return receipt;
}
