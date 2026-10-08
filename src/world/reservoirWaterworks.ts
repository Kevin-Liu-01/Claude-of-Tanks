/** Reservoir-only construction: exchange accepted rubble for working waterworks. */
import { BufferGeometry } from 'three';
import { setObbShape, type CollisionRecord } from './collision.ts';
import { slabBox } from './propGeometry.ts';
import { PartSink, hashSeed, newRegionalParts, streamFrom, type RegionalBucket, type Rgb, type Vec3 } from './maps/regional/geometry.ts';
import { DEFAULT_WEATHER, pickWeatherTints, weatherRegionalParts, type WeatherPalette } from './maps/regional/weather.ts';
import { emitRoof, roofGeometry, type RoofSpec } from './maps/regional/house.ts';
import { STEEL_STRIP_V } from './propsSteelAtlas.ts';

type Point2 = readonly [number, number];
type Point3 = readonly [number, number, number];
type BucketName = 'stone' | 'wood' | 'dark' | 'regionalStone' | 'curtain' | 'glass' | 'regionalRoof' | 'structureWood' | 'steel';
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
  /** (round 3c) the families of its roof, glazing, door and iron: each already standing on Reservoir, or no pump house */
  glass?: BufferGeometry[]; regionalRoof?: BufferGeometry[]; structureWood?: BufferGeometry[]; steel?: BufferGeometry[];
}
interface Budget { triangles: number; sourceBytes: number; mergedBytes: number; geometries: number }
interface Body {
  name: 'kiosk' | 'bank' | 'intake'; x: number; z: number; width: number; depth: number;
  bottom: number; top: number; collisionTop: number; supportMin: number; supportMax: number;
}
/** A built piece; `kit`: the pump house's own kit parts (and its penstock's iron), budgeted under KIT_TRIANGLE_CEILING. */
interface Piece { bucket: BucketName; geometry: BufferGeometry; kit?: boolean }
interface Plan { bodies: Body[]; pipe: Point3[]; waterLevel: number }
interface SiteRect { x0: number; z0: number; x1: number; z1: number }
interface Support { min: number; max: number }
interface PipeRoute { ax: number; az: number; dx: number; dz: number; nx: number; nz: number }
interface DonorSelection { removed: Set<BufferGeometry>; ignored: Set<CollisionRecord> }
interface ReservoirWaterworksReceipt {
  status: 'built' | 'unavailable' | 'unsafe' | 'budget';
  donors: number;
  before: Budget;
  /** the works outside the kit (the bank, the intake, their screens, caps and braces): at or under the donors */
  after: Budget;
  /** the kit's own parts (round 3c): under KIT_TRIANGLE_CEILING */
  kit: Budget;
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
 * Round 3c (gauntlet wave 250's follow-ups; the coordinator's ruling, 2026-10-07: the kit's own parts under a ceiling of
 * their own, KIT_TRIANGLE_CEILING): the pump house under a hipped roof of the Eifel slate on its cornice, its corners
 * quoined, a plinth course at the damp line with the damp rising over it, its windows glazed dark (an unmanned house,
 * unlit at night) and a lantern by the door lit at night (the curtain family) with a faint warmth on the wall and the
 * step under it, a painted plank door on its frame with strap hinges, the vent a louvred opening in a reveal under a
 * stone hood, the gutters and the downpipe in painted iron, and the penstock cast iron with its flanges and its collar
 * at the wall (the steel family's plain sheet, rust in its mask).
 */
const KIOSK_ROOF: RoofSpec = { kind: 'hip', pitchDeg: 34, eave: 0.42, verge: 0.42, thickness: 0.08, bucket: 'roof', ridge: 'saddle' };
/** The cornice under the eaves: its height and its projection at the top. */
const KIOSK_CORNICE = { height: 0.26, out: 0.14 } as const;
/** The lantern beside the door: its offset along the face from the door's side, its height over the threshold. */
const KIOSK_LANTERN = { side: 0.42, over: 2.02, out: 0.26 } as const;
/** The louvred vent on the east wall: its opening (face u and heights under the top) and its reveal. */
const KIOSK_VENT = { u: 1.3, half: 0.62, belowTop0: 1.15, belowTop1: 0.5, depth: 0.18 } as const;
/** The kit's own parts (the kiosk's and its penstock's iron) may draw at most this many triangles (the coordinator). */
const KIT_TRIANGLE_CEILING = 1500;
/** The painted iron: the gutters' and the downpipe's grey, the penstock's cast iron, its rust. */
const IRON_GREY: Rgb = [0.34, 0.35, 0.35], CAST_IRON: Rgb = [0.25, 0.24, 0.23], RUST: Rgb = [0.42, 0.25, 0.15];
/** The door's paint (an Eifel works green), worn to the grey timber at its foot and bleached toward its head. */
const DOOR_PAINT: Rgb = [0.21, 0.31, 0.25], BARE_TIMBER: Rgb = [0.42, 0.4, 0.36];

/**
 * The pump house in the Reservoir's regional kit (the Eifel kit, maps/regional/eifel.ts): its walls are the weathered
 * greywacke Reservoir's houses already draw (regionalStone: the building's tint, the rising damp at the foot), on
 * exactly the old body's hard plan, with dressed lintels and reveals; round 3c as above. No new material family (each
 * family it draws in already stands on Reservoir: the guard in composeReservoirWaterworks), no collision part, no draw
 * from any props stream (the tints and the look come from the kiosk's own hashed streams). Built in world coordinates so
 * the walls stand on the hard plan to the float.
 */
function buildKitKiosk(kiosk: Body, field: WaterworksTerrain, palette: WeatherPalette, out: Piece[]): void {
  const sink = new PartSink([2.37, 1.13]);
  const tints = pickWeatherTints(palette, streamFrom(hashSeed('reservoir:waterworks:kiosk', kiosk.x, kiosk.z)));
  const tint = tints.stone;
  // the look's own stream (the stains' places, the coping's lengths): the tints' stream is never moved by it
  const look = streamFrom(hashSeed('reservoir:waterworks:kiosk:look', kiosk.x, kiosk.z));
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
  const minus = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];
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
  const vent: [number, number, number, number] = [KIOSK_VENT.u - KIOSK_VENT.half, KIOSK_VENT.u + KIOSK_VENT.half, yt - KIOSK_VENT.belowTop0,
    yt - KIOSK_VENT.belowTop1];
  pierced(south, [[dU0, dU1, thr, head]]);
  pierced(west, windows);
  wall(north, -north.half, north.half, yb, yt);
  pierced(east, [vent]);
  reveal(south, dU0, dU1, thr, head, KIOSK_DOOR.depth);
  for (const [u0, u1, y0, y1] of windows) reveal(west, u0, u1, y0, y1, KIOSK_WINDOWS.depth);
  reveal(east, vent[0], vent[1], vent[2], vent[3], KIOSK_VENT.depth);
  // the stone sills under the windows: 5 cm proud of the hard plan, dressing only (no collision part)
  for (const [u0, u1, y0] of windows) {
    const s0 = u0 - 0.08, s1 = u1 + 0.08, o = -0.05, sy = y0 - 0.08, decor = { colourAt: colour(KIOSK_DRESSED), decor: true };
    quad('regionalStone', [at(west, s0, y0, o), at(west, s0, y0), at(west, s1, y0), at(west, s1, y0, o)], UP, decor);
    quad('regionalStone', [at(west, s0, sy, o), at(west, s1, sy, o), at(west, s1, y0, o), at(west, s0, y0, o)], west.n, decor);
    quad('regionalStone', [at(west, s0, sy, o), at(west, s0, sy), at(west, s1, sy), at(west, s1, sy, o)], DOWN, decor);
  }
  // ---- the walls' dressing (decor): the plinth course, the quoins, the cornice, the damp, the spill, the step, the hood
  const dressing = (k: Rgb, shade = 1) => ({ colourAt: colour(k, shade), decor: true });
  /** A box proud of a face: u0..u1 along it, y0..y1, from the wall plane out to `o` (its back face in the wall left out;
   * `edges` false: its face alone, a quoin's 2.5 cm sides being under a pixel at any range a hull sees it from). */
  const proud = (f: KioskFace, u0: number, u1: number, y0: number, y1: number, o: number, k: Rgb, edges = true): void => {
    const neg: Vec3 = [-f.r[0], 0, -f.r[2]], opts = dressing(k);
    quad('regionalStone', [at(f, u0, y0, -o), at(f, u1, y0, -o), at(f, u1, y1, -o), at(f, u0, y1, -o)], f.n, opts);
    if (!edges) return;
    quad('regionalStone', [at(f, u0, y1), at(f, u0, y1, -o), at(f, u1, y1, -o), at(f, u1, y1)], UP, opts);
    {
      quad('regionalStone', [at(f, u0, y0), at(f, u0, y1), at(f, u0, y1, -o), at(f, u0, y0, -o)], neg, opts);
      quad('regionalStone', [at(f, u1, y0), at(f, u1, y0, -o), at(f, u1, y1, -o), at(f, u1, y1)], f.r, opts);
    }
  };
  // the plinth course at the damp line: a weathered ledge 5 cm proud, its top falling outward, broken at the door, the
  // penstock's collar and the downpipe's shoe
  const PC0 = yc - 0.06, PC1 = yc + 0.06, PCO = 0.05;
  const pipeU = -1.5, downU = 2.3;
  const course = (f: KioskFace, gaps: Array<[number, number]>): void => {
    let u = -f.half - PCO;
    for (const [g0, g1] of [...gaps, [f.half + PCO, f.half + PCO] as [number, number]]) {
      if (g0 - u > 0.05) {
        const neg: Vec3 = [-f.r[0], 0, -f.r[2]], opts = dressing(KIOSK_DRESSED, 0.92);
        quad('regionalStone', [at(f, u, PC0, -PCO), at(f, g0, PC0, -PCO), at(f, g0, PC1 - 0.02, -PCO), at(f, u, PC1 - 0.02, -PCO)], f.n, opts);
        quad('regionalStone', [at(f, u, PC1, 0), at(f, u, PC1 - 0.02, -PCO), at(f, g0, PC1 - 0.02, -PCO), at(f, g0, PC1, 0)], [f.n[0], 1, f.n[2]], opts);
        quad('regionalStone', [at(f, u, PC0), at(f, g0, PC0), at(f, g0, PC0, -PCO), at(f, u, PC0, -PCO)], DOWN, opts);
        if (u > -f.half) quad('regionalStone', [at(f, u, PC0), at(f, u, PC0, -PCO), at(f, u, PC1 - 0.02, -PCO), at(f, u, PC1)], neg, opts);
        if (g0 < f.half) quad('regionalStone', [at(f, g0, PC0), at(f, g0, PC1), at(f, g0, PC1 - 0.02, -PCO), at(f, g0, PC0, -PCO)], f.r, opts);
      }
      u = g1;
    }
  };
  course(south, [[dU0, dU1]]);
  course(north, []);
  course(west, []);
  course(east, [[pipeU - 0.55, pipeU + 0.55], [downU - 0.12, downU + 0.12]]);
  // the quoins: dressed blocks up each corner from the course to the cornice, long and short by turns on each face
  const CQ0 = PC1 + 0.02, CQ1 = yt - KIOSK_CORNICE.height - 0.02, QO = 0.025;
  // (seven courses whatever the ground's fall under the plan: the kit's parts keep one count on every seed's terrain)
  const blocks = 7, bh = (CQ1 - CQ0) / blocks;
  const corners: Array<[KioskFace, KioskFace]> = [[south, east], [east, north], [north, west], [west, south]];
  for (const [fa, fb] of corners) for (let k = 0; k < blocks; k++) {
    const y0 = CQ0 + k * bh + 0.01, y1 = CQ0 + (k + 1) * bh - 0.01, long = k % 2 === 0;
    // (fa's end at +half, fb's start at -half: the corner they share)
    proud(fa, fa.half - (long ? 0.44 : 0.27), fa.half + QO, y0, y1, QO, KIOSK_DRESSED, false);
    proud(fb, -fb.half - QO, -fb.half + (long ? 0.27 : 0.44), y0, y1, QO, KIOSK_DRESSED, false);
  }
  // the cornice under the eaves: a cove from the wall out to its crown, mitred at the corners
  for (const f of [south, east, north, west]) {
    const c0 = yt - KIOSK_CORNICE.height, o = KIOSK_CORNICE.out, opts = dressing(KIOSK_DRESSED, 0.96);
    const ext = (y: number, d: number): [Vec3, Vec3] => [at(f, -f.half - d, y, -d), at(f, f.half + d, y, -d)];
    const rows: Array<[number, number]> = [[c0, 0], [c0 + 0.08, 0.035], [yt - 0.06, o], [yt, o]];
    for (let i = 0; i + 1 < rows.length; i++) {
      const [ya, da] = rows[i], [yb2, db] = rows[i + 1];
      const [a0, a1] = ext(ya, da), [b0, b1] = ext(yb2, db);
      quad('regionalStone', [a0, a1, b1, b0], [f.n[0], i === 0 ? 0.3 : 0, f.n[2]], opts);
    }
    const [t0, t1] = ext(yt, o), [w0, w1] = ext(yt, 0);
    quad('regionalStone', [w0, w1, t1, t0], UP, opts);
  }
  // the damp rising over the course: ragged stains a hand to two over it, darker at their foot, their tops the wall's
  // own colour (each stain's tint fades to 1 at its top edge); kept off the openings, the quoins and the iron
  const stain = (f: KioskFace, u: number, w: number, h: number, deep: number): void => {
    const y0 = PC1 + 0.004, y1 = y0 + h;
    const k = (p: Vec3): Rgb => { const t = Math.max(0, Math.min(1, (p[1] - y0) / h)), d = 1 - deep * (1 - t) ** 1.5; return [d, d * 1.01, d * 1.02]; };
    const fade = (p: Vec3): Rgb => { const c = colour(PLAIN)(p), m = k(p); return [c[0] * m[0], c[1] * m[1], c[2] * m[2]]; };
    // (two quads: the stain's top ragged in a shallow arch)
    const ym = y1 + h * (look() - 0.5) * 0.4;
    quad('regionalStone', [at(f, u - w / 2, y0, -0.004), at(f, u, y0, -0.004), at(f, u, ym, -0.004), at(f, u - w / 2, y1 * 0.6 + y0 * 0.4, -0.004)], f.n,
      { decor: true, colourAt: fade });
    quad('regionalStone', [at(f, u, y0, -0.004), at(f, u + w / 2, y0, -0.004), at(f, u + w / 2, y1 * 0.7 + y0 * 0.3, -0.004), at(f, u, ym, -0.004)], f.n,
      { decor: true, colourAt: fade });
  };
  const stainSpans: Array<[KioskFace, Array<[number, number]>]> = [
    [north, [[-2.4, 2.4]]], [west, [[-2.4, 2.4]]], [east, [[-0.9, 1.9]]], [south, [[-2.4, -0.6]]],
  ];
  for (const [f, spans] of stainSpans) for (const [u0, u1] of spans) {
    for (let u = u0; u < u1 - 0.3;) {
      const w = 0.45 + look() * 0.55;
      if (u + w > u1) break;
      if (look() < 0.75) stain(f, u + w / 2, w, 0.18 + look() * 0.42, 0.18 + look() * 0.16);
      u += w + 0.15 + look() * 0.5;
    }
  }
  // the door's step: a dressed block before the threshold, warm under the lantern
  const lanternU = dU0 - KIOSK_LANTERN.side, lanternY = thr + KIOSK_LANTERN.over;
  const warmAt = (cu: number, cy: number, r: number, base: (p: Vec3) => Rgb) => (p: Vec3): Rgb => {
    // the lantern's light, faint and warm, falling off to nothing at r from the point under it (the south face's u runs
    // along -x: u = kiosk.x - x), the step's depth out from the wall counted a little longer
    const d = Math.hypot((kiosk.x - p[0]) - cu, (p[1] - cy) * 0.8, Math.max(0, kiosk.z - hd - p[2]) * 1.2), w = Math.max(0, 1 - d / r) ** 2;
    const c = base(p);
    return [Math.min(1.2, c[0] * (1 + 0.16 * w)), Math.min(1.2, c[1] * (1 + 0.09 * w)), Math.min(1.2, c[2] * (1 - 0.02 * w))];
  };
  {
    const s0 = dU0 - 0.25, s1 = dU1 + 0.25, o = 0.42, stepTop = thr - 0.005;
    const opts = { decor: true, colourAt: warmAt(lanternU, thr, 1.6, colour(KIOSK_DRESSED, 0.95)) };
    quad('regionalStone', [at(south, s0, stepTop, -o), at(south, s0, stepTop), at(south, s1, stepTop), at(south, s1, stepTop, -o)], UP, opts);
    quad('regionalStone', [at(south, s0, ground - 0.1, -o), at(south, s1, ground - 0.1, -o), at(south, s1, stepTop, -o), at(south, s0, stepTop, -o)], south.n, opts);
    quad('regionalStone', [at(south, s0, ground - 0.1), at(south, s0, ground - 0.1, -o), at(south, s0, stepTop, -o), at(south, s0, stepTop)],
      [-south.r[0], 0, -south.r[2]], opts);
    quad('regionalStone', [at(south, s1, ground - 0.1), at(south, s1, stepTop), at(south, s1, stepTop, -o), at(south, s1, ground - 0.1, -o)], south.r, opts);
  }
  // the spill on the wall under the lantern: a patch 6 mm proud in a grid, its edges the wall's own colour
  {
    const u0 = Math.max(-south.half + 0.5, lanternU - 0.75), u1 = dU0 - 0.03, y0 = PC1 + 0.01, y1 = Math.min(yt - KIOSK_CORNICE.height - 0.05, lanternY + 0.5);
    const NU = 3, NY = 4;
    const tone = warmAt(lanternU, lanternY - 0.2, 1.25, colour(PLAIN));
    for (let i = 0; i < NU; i++) for (let j = 0; j < NY; j++) {
      const ua = u0 + (u1 - u0) * i / NU, ub = u0 + (u1 - u0) * (i + 1) / NU, ya = y0 + (y1 - y0) * j / NY, yb3 = y0 + (y1 - y0) * (j + 1) / NY;
      quad('regionalStone', [at(south, ua, ya, -0.006), at(south, ub, ya, -0.006), at(south, ub, yb3, -0.006), at(south, ua, yb3, -0.006)], south.n,
        { decor: true, colourAt: tone });
    }
  }
  // the vent's hood: a dressed stone drip over its head, its top falling outward
  {
    const h0 = vent[3] + 0.1, h1 = h0 + 0.12, o = 0.13, u0 = vent[0] - 0.14, u1 = vent[1] + 0.14, opts = dressing(KIOSK_DRESSED);
    const neg: Vec3 = [-east.r[0], 0, -east.r[2]];
    quad('regionalStone', [at(east, u0, h0, -o), at(east, u1, h0, -o), at(east, u1, h1 - 0.05, -o), at(east, u0, h1 - 0.05, -o)], east.n, opts);
    quad('regionalStone', [at(east, u0, h1), at(east, u0, h1 - 0.05, -o), at(east, u1, h1 - 0.05, -o), at(east, u1, h1)], [east.n[0], 1, east.n[2]], opts);
    quad('regionalStone', [at(east, u0, h0), at(east, u1, h0), at(east, u1, h0, -o), at(east, u0, h0, -o)], DOWN, opts);
    quad('regionalStone', [at(east, u0, h0), at(east, u0, h0, -o), at(east, u0, h1 - 0.05, -o), at(east, u0, h1)], neg, opts);
    quad('regionalStone', [at(east, u1, h0), at(east, u1, h1), at(east, u1, h1 - 0.05, -o), at(east, u1, h0, -o)], east.r, opts);
  }
  // ---- the door: painted planks at the back of the reveal, the frame round them, two strap hinges and the latch
  {
    const d = KIOSK_DOOR.depth, planks = 6, pw = (dU1 - dU0 - 0.12) / planks, gap = 0.008;
    // the frame: jambs and head in the door's timber, 6 cm wide, on the reveal's back
    const paint = (shade: number) => (p: Vec3): Rgb => {
      const t = Math.max(0, Math.min(1, (p[1] - thr) / KIOSK_DOOR.height)), bare = Math.max(0, 1 - (p[1] - thr) / 0.22);
      const bleach = 1 + 0.18 * t;
      const c: Rgb = [DOOR_PAINT[0] * bleach, DOOR_PAINT[1] * bleach, DOOR_PAINT[2] * bleach];
      return [shade * (c[0] + (BARE_TIMBER[0] - c[0]) * bare), shade * (c[1] + (BARE_TIMBER[1] - c[1]) * bare), shade * (c[2] + (BARE_TIMBER[2] - c[2]) * bare)];
    };
    const board = (u0: number, u1: number, y0: number, y1: number, inset: number, thick: number, shade: number) => {
      const front = inset - thick, opts = { colourAt: paint(shade) };
      quad('structureWood', [at(south, u0, y0, front), at(south, u1, y0, front), at(south, u1, y1, front), at(south, u0, y1, front)], south.n, opts);
      quad('structureWood', [at(south, u0, y0, inset), at(south, u0, y0, front), at(south, u0, y1, front), at(south, u0, y1, inset)],
        [-south.r[0], 0, -south.r[2]], opts);
      quad('structureWood', [at(south, u1, y0, inset), at(south, u1, y1, inset), at(south, u1, y1, front), at(south, u1, y0, front)], south.r, opts);
      quad('structureWood', [at(south, u0, y1, inset), at(south, u0, y1, front), at(south, u1, y1, front), at(south, u1, y1, inset)], UP, opts);
    };
    board(dU0, dU0 + 0.06, thr, head, d, 0.07, 0.86);
    board(dU1 - 0.06, dU1, thr, head, d, 0.07, 0.86);
    board(dU0 + 0.06, dU1 - 0.06, head - 0.06, head, d, 0.07, 0.86);
    for (let k = 0; k < planks; k++) {
      const u0 = dU0 + 0.06 + k * pw + gap / 2, u1 = u0 + pw - gap;
      board(u0, u1, thr + 0.01, head - 0.06, d - 0.012, 0.035, 0.92 + 0.12 * ((k * 5 + 3) % 4) / 3);
    }
    // the dark of the doorway behind the planks' joints
    quad('dark', [at(south, dU0 + 0.06, thr, d + 0.01), at(south, dU1 - 0.06, thr, d + 0.01), at(south, dU1 - 0.06, head - 0.06, d + 0.01),
      at(south, dU0 + 0.06, head - 0.06, d + 0.01)], south.n, { decor: true });
    // two strap hinges from the hinge side (the door's +u jamb), their pintles in the frame, and the latch
    for (const y of [thr + 0.32, head - 0.4]) {
      const u1 = dU1 - 0.07, u0 = u1 - 0.78, f = d - 0.012 - 0.035 - 0.012;
      quad('dark', [at(south, u0, y - 0.03, f), at(south, u1, y - 0.035, f), at(south, u1, y + 0.035, f), at(south, u0, y + 0.03, f)], south.n, { decor: true });
      quad('dark', [at(south, u1 - 0.02, y - 0.06, f - 0.005), at(south, u1 + 0.04, y - 0.06, f - 0.005), at(south, u1 + 0.04, y + 0.06, f - 0.005),
        at(south, u1 - 0.02, y + 0.06, f - 0.005)], south.n, { decor: true });
    }
    const lu = dU0 + 0.16, ly = thr + 1.0, lf = d - 0.012 - 0.035 - 0.015;
    quad('dark', [at(south, lu, ly - 0.07, lf), at(south, lu + 0.05, ly - 0.07, lf), at(south, lu + 0.05, ly + 0.09, lf), at(south, lu, ly + 0.09, lf)], south.n, { decor: true });
  }
  // ---- the windows: glazed dark (the glass family: the sky in it by day, unlit at night) behind iron frames and bars
  for (const [u0, u1, y0, y1] of windows) {
    const d = KIOSK_WINDOWS.depth;
    quad('glass', [at(west, u0, y0, d), at(west, u1, y0, d), at(west, u1, y1, d), at(west, u0, y1, d)], west.n, { decor: true });
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
  // ---- the vent: five timber louvres in the reveal over its dark, and its frame on the wall
  {
    const [u0, u1, y0, y1] = vent, d = KIOSK_VENT.depth;
    quad('dark', [at(east, u0, y0, d - 0.01), at(east, u1, y0, d - 0.01), at(east, u1, y1, d - 0.01), at(east, u0, y1, d - 0.01)], east.n, { decor: true });
    for (let i = 0; i < 5; i++) {
      const y = y0 + (y1 - y0) * (i + 0.5) / 5;
      quad('wood', [at(east, u0, y - 0.055, d * 0.35), at(east, u1, y - 0.055, d * 0.35), at(east, u1, y + 0.055, d * 0.85),
        at(east, u0, y + 0.055, d * 0.85)], [east.n[0], 0.7, east.n[2]], { decor: true });
    }
    const fr = 0.07, fo = 0.03;
    for (const [a0, a1, b0, b1] of [[u0 - fr, u0, y0 - fr, y1 + fr], [u1, u1 + fr, y0 - fr, y1 + fr], [u0, u1, y1, y1 + fr], [u0, u1, y0 - fr, y0]] as const) {
      quad('wood', [at(east, a0, b0, -fo), at(east, a1, b0, -fo), at(east, a1, b1, -fo), at(east, a0, b1, -fo)], east.n, { decor: true });
    }
  }
  // ---- the lantern by the door: a cage on its bracket, its glass in the curtain family (lit at night), a cap and a base
  {
    const o = KIOSK_LANTERN.out, r = 0.1, y0 = lanternY - 0.14, y1 = lanternY + 0.14;
    const cx = at(south, lanternU, 0, -o), c: Vec3 = [cx[0], 0, cx[2]];
    const corner = (sx: number, sz: number, y: number): Vec3 => [c[0] + sx * r, y, c[2] + sz * r];
    for (const [sx0, sz0, sx1, sz1, n] of [[-1, -1, 1, -1, [0, 0, -1]], [1, -1, 1, 1, [1, 0, 0]], [1, 1, -1, 1, [0, 0, 1]], [-1, 1, -1, -1, [-1, 0, 0]]] as const) {
      const nn: Vec3 = [n[0], n[1], n[2]];
      quad('curtain', [corner(sx0, sz0, y0), corner(sx1, sz1, y0), corner(sx1, sz1, y1), corner(sx0, sz0, y1)], nn, { decor: true, window: nn });
    }
    sink.span('dark', c[0] - r - 0.02, y1, c[2] - r - 0.02, c[0] + r + 0.02, y1 + 0.05, c[2] + r + 0.02, { decor: true });
    sink.polygon('dark', [[c[0] - r - 0.02, y1 + 0.05, c[2] - r - 0.02], [c[0], y1 + 0.17, c[2]], [c[0] + r + 0.02, y1 + 0.05, c[2] - r - 0.02]], { decor: true });
    sink.polygon('dark', [[c[0] + r + 0.02, y1 + 0.05, c[2] + r + 0.02], [c[0], y1 + 0.17, c[2]], [c[0] - r - 0.02, y1 + 0.05, c[2] + r + 0.02]], { decor: true });
    sink.polygon('dark', [[c[0] + r + 0.02, y1 + 0.05, c[2] - r - 0.02], [c[0], y1 + 0.17, c[2]], [c[0] + r + 0.02, y1 + 0.05, c[2] + r + 0.02]], { decor: true });
    sink.polygon('dark', [[c[0] - r - 0.02, y1 + 0.05, c[2] + r + 0.02], [c[0], y1 + 0.17, c[2]], [c[0] - r - 0.02, y1 + 0.05, c[2] - r - 0.02]], { decor: true });
    sink.span('dark', c[0] - r - 0.01, y0 - 0.05, c[2] - r - 0.01, c[0] + r + 0.01, y0, c[2] + r + 0.01, { decor: true });
    // the bracket back to the wall
    const w = at(south, lanternU, 0, 0);
    sink.span('dark', Math.min(c[0], w[0]) - 0.02, y1 + 0.17, Math.min(c[2], w[2]), Math.max(c[0], w[0]) + 0.02, y1 + 0.21, Math.max(c[2], w[2]), { decor: true });
  }
  // ---- the roof: the Eifel slate hipped over the cornice on the cap, weathered (moss at its low courses) in its family
  const eaveY = yt + 0.06;
  const rg = roofGeometry(kiosk.width, kiosk.depth, eaveY, KIOSK_ROOF);
  sink.placed(0, kiosk.x, 0, kiosk.z, () => emitRoof(sink, rg, KIOSK_ROOF));
  // ---- the gutters along the four eaves (a half-round of three facets under each eave's lip) and the downpipe
  {
    const t = Math.tan(KIOSK_ROOF.pitchDeg * Math.PI / 180), lip = KIOSK_ROOF.eave + 0.02, gy = eaveY - KIOSK_ROOF.eave * t - 0.03, gr = 0.065;
    const opts = { decor: true, colour: IRON_GREY };
    // each run along an eave, its section a U below the lip (the outer side, the bottom, the inner side), ends closed
    const runs: Array<[Vec3, Vec3, Vec3]> = [
      [[kiosk.x - hw - lip, 0, kiosk.z - hd - lip], [kiosk.x + hw + lip, 0, kiosk.z - hd - lip], [0, 0, -1]],
      [[kiosk.x + hw + lip, 0, kiosk.z - hd - lip], [kiosk.x + hw + lip, 0, kiosk.z + hd + lip], [1, 0, 0]],
      [[kiosk.x + hw + lip, 0, kiosk.z + hd + lip], [kiosk.x - hw - lip, 0, kiosk.z + hd + lip], [0, 0, 1]],
      [[kiosk.x - hw - lip, 0, kiosk.z + hd + lip], [kiosk.x - hw - lip, 0, kiosk.z - hd - lip], [-1, 0, 0]],
    ];
    const inside = { decor: true, colour: [IRON_GREY[0] * 0.55, IRON_GREY[1] * 0.55, IRON_GREY[2] * 0.55] as Rgb };
    for (const [a, b, n] of runs) {
      const p = (q: Vec3, out: number, y: number): Vec3 => [q[0] + n[0] * out, y, q[2] + n[2] * out];
      const facets: Array<[Vec3, Vec3, Vec3, Vec3, Vec3]> = [
        [p(a, gr, gy), p(b, gr, gy), p(b, gr * 0.7, gy - gr * 0.7), p(a, gr * 0.7, gy - gr * 0.7), [n[0], -0.3, n[2]]],
        [p(a, gr * 0.7, gy - gr * 0.7), p(b, gr * 0.7, gy - gr * 0.7), p(b, -gr * 0.6, gy - gr * 0.85), p(a, -gr * 0.6, gy - gr * 0.85), DOWN],
        [p(a, -gr * 0.6, gy - gr * 0.85), p(b, -gr * 0.6, gy - gr * 0.85), p(b, -gr, gy), p(a, -gr, gy), [-n[0], -0.3, -n[2]]],
      ];
      // each facet outside, and inside (the open gutter's trough, seen from above), its own shade
      for (const [q0, q1, q2, q3, f] of facets) {
        quad('structureMetal', [q0, q1, q2, q3], f, opts);
        quad('structureMetal', [q0, q1, q2, q3], minus(f), inside);
      }
    }
    // the downpipe: from the east gutter back under the eave to the wall, down it to its shoe over the course's gap
    const top: Vec3 = at(east, downU, gy - 0.1, -(lip - 0.02)), wallTop: Vec3 = at(east, downU, gy - 0.45, -0.09), shoe: Vec3 = at(east, downU, PC1 + 0.18, -0.09);
    const foot: Vec3 = at(east, downU, ground + 0.12, -0.24);
    const pipe = (a: Vec3, b: Vec3) => {
      const N = 6, dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l = Math.hypot(dx, dy, dz);
      const ax: Vec3 = [dx / l, dy / l, dz / l];
      const ref: Vec3 = Math.abs(ax[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const u: Vec3 = [ax[1] * ref[2] - ax[2] * ref[1], ax[2] * ref[0] - ax[0] * ref[2], ax[0] * ref[1] - ax[1] * ref[0]];
      const ul = Math.hypot(...u), uu: Vec3 = [u[0] / ul, u[1] / ul, u[2] / ul];
      const vv: Vec3 = [ax[1] * uu[2] - ax[2] * uu[1], ax[2] * uu[0] - ax[0] * uu[2], ax[0] * uu[1] - ax[1] * uu[0]];
      const ring = (q: Vec3, k: number): Vec3 => {
        const an = k / N * Math.PI * 2, cs = Math.cos(an) * 0.05, sn = Math.sin(an) * 0.05;
        return [q[0] + uu[0] * cs + vv[0] * sn, q[1] + uu[1] * cs + vv[1] * sn, q[2] + uu[2] * cs + vv[2] * sn];
      };
      for (let k = 0; k < N; k++) {
        const an = (k + 0.5) / N * Math.PI * 2, out: Vec3 = [uu[0] * Math.cos(an) + vv[0] * Math.sin(an), uu[1] * Math.cos(an) + vv[1] * Math.sin(an),
          uu[2] * Math.cos(an) + vv[2] * Math.sin(an)];
        quad('structureMetal', [ring(a, k), ring(a, k + 1), ring(b, k + 1), ring(b, k)], out, opts);
      }
    };
    pipe(top, wallTop); pipe(wallTop, shoe); pipe(shoe, foot);
  }
  const parts = sink.finish();
  // the roof weathered in the kit's family (the kiosk's own tints: the same pick as its walls'), moss at its low courses
  const roofParts = newRegionalParts();
  roofParts.roof = parts.roof;
  const weatheredRoof = weatherRegionalParts(roofParts, tints, { damp: palette.damp, moss: palette.moss, mossTint: palette.mossTint }).regionalRoof;
  const named: Array<[BucketName, BufferGeometry, string]> = [];
  for (const g of parts.regionalStone) named.push(['regionalStone', g, g.userData.noCollision ? 'kiosk-dressing' : 'kiosk-body']);
  for (const g of weatheredRoof) named.push(['regionalRoof', g, 'kiosk-roof']);
  for (const g of parts.glass) named.push(['glass', g, 'kiosk-glazing']);
  for (const g of parts.curtain) named.push(['curtain', g, 'kiosk-lantern']);
  for (const g of parts.structureWood) named.push(['structureWood', g, 'kiosk-door']);
  for (const g of parts.structureMetal) named.push(['steel', plainSheet(g), 'kiosk-gutters']);
  for (const g of parts.dark) named.push(['dark', g, 'kiosk-ironwork']);
  for (const g of parts.wood) named.push(['wood', g, 'kiosk-timber']);
  for (const [bucket, geometry, name] of named) {
    geometry.name = `reservoir-${name}`;
    out.push({ bucket, geometry, kit: true });
  }
}

/**
 * A painted iron part from the kit's metal (structureMetal: its colour per vertex) moved into the steel family's plain
 * sheet: its UVs folded into the atlas's plain strip (propsSteelAtlas.ts STEEL_STRIP_V.plain), the paint and the rust its
 * vertex colour and the mask's own. Same attributes as the steel family's merged mesh (position, normal, uv, color).
 */
function plainSheet(geometry: BufferGeometry): BufferGeometry {
  const [v0, v1] = STEEL_STRIP_V.plain, uv = geometry.getAttribute('uv');
  const pad = (v1 - v0) * 0.12;
  for (let i = 0; i < uv.count; i++) {
    const v = uv.getY(i), f = v - Math.floor(v);
    uv.setXY(i, uv.getX(i) * 0.35, v0 + pad + (v1 - v0 - 2 * pad) * f);
  }
  uv.needsUpdate = true;
  return geometry;
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

/**
 * The penstock in cast iron (round 3c, gauntlet wave 250: "glossy black plastic"): the tube through its eight rings from
 * inside the pump house's east wall to inside the bank (each ring's section upright across the route, as before), a
 * flanged joint at each inner ring, and its collar where it passes the pump house's wall — the steel family's plain
 * sheet in the cast iron's colour, rust gathered under it and at its joints (a kit part: under the kit's ceiling).
 */
function buildIronPenstock(plan: Plan, out: Piece[]): void {
  const points = plan.pipe, sink = new PartSink([0.7, 0.3]);
  const first = points[0], last = points[points.length - 1];
  const length = Math.hypot(last[0] - first[0], last[2] - first[2]);
  const nx = -(last[2] - first[2]) / length, nz = (last[0] - first[0]) / length, dx = -nz, dz = nx;
  const R = 0.34, N = 10;
  const at = (p: Point3, a: number, r: number, along = 0): Vec3 =>
    [p[0] + nx * Math.cos(a) * r + dx * along, p[1] + Math.sin(a) * r, p[2] + nz * Math.cos(a) * r + dz * along];
  const rustAt = (p: Vec3): Rgb => {
    // rust under the tube (its lower half wet longest) and in patches along it, from the iron's own hash
    const h = Math.sin(p[0] * 3.1 + p[2] * 1.7) * 0.5 + Math.sin(p[0] * 0.9 - p[2] * 2.3) * 0.5;
    const ring = points.reduce((m, q) => Math.min(m, Math.hypot(q[0] - p[0], q[2] - p[2])), Infinity);
    const k = Math.max(0, Math.min(1, 0.35 * (h + 0.4) + 0.5 * Math.max(0, 1 - ring / 0.6)));
    return [CAST_IRON[0] + (RUST[0] - CAST_IRON[0]) * k, CAST_IRON[1] + (RUST[1] - CAST_IRON[1]) * k, CAST_IRON[2] + (RUST[2] - CAST_IRON[2]) * k];
  };
  const underRust = (centre: Point3) => (p: Vec3): Rgb => {
    const c = rustAt(p), w = Math.max(0, Math.min(1, (centre[1] - p[1]) / R)) * 0.6;
    return [c[0] + (RUST[0] - c[0]) * w, c[1] + (RUST[1] - c[1]) * w, c[2] + (RUST[2] - c[2]) * w];
  };
  // the tube: a quad per facet per segment, wound outward
  for (let k = 0; k + 1 < points.length; k++) {
    const a = points[k], b = points[k + 1], mid: Point3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    for (let i = 0; i < N; i++) {
      const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
      const pts: Vec3[] = [at(a, a0, R), at(b, a0, R), at(b, a1, R), at(a, a1, R)];
      const am = (a0 + a1) / 2, outN: Vec3 = [nx * Math.cos(am), Math.sin(am), nz * Math.cos(am)];
      const [p0, p1, p2] = pts;
      const cx = (p1[1] - p0[1]) * (p2[2] - p0[2]) - (p1[2] - p0[2]) * (p2[1] - p0[1]);
      const cy = (p1[2] - p0[2]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[2] - p0[2]);
      const cz = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
      const o = cx * outN[0] + cy * outN[1] + cz * outN[2] >= 0 ? pts : [...pts].reverse();
      sink.quad('structureMetal', o[0], o[1], o[2], o[3], { colourAt: underRust(mid) });
    }
  }
  // its ends closed (inside the pump house's wall and the bank)
  for (const [p, sign] of [[first, -1], [last, 1]] as const) {
    const ring = Array.from({ length: N }, (_, i) => at(p, i / N * Math.PI * 2, R));
    const cx = (ring[1][1] - ring[0][1]) * (ring[2][2] - ring[0][2]) - (ring[1][2] - ring[0][2]) * (ring[2][1] - ring[0][1]);
    const cz = (ring[1][0] - ring[0][0]) * (ring[2][1] - ring[0][1]) - (ring[1][1] - ring[0][1]) * (ring[2][0] - ring[0][0]);
    sink.polygon('structureMetal', (cx * dx + cz * dz) * sign >= 0 ? ring : [...ring].reverse(), { colour: CAST_IRON });
  }
  /** A flange: an annulus front and back, `t` thick along the route, from r0 to r1, and its rim. */
  const flange = (p: Point3, r0: number, r1: number, t: number, M: number) => {
    const opts = { colourAt: underRust(p) };
    for (let i = 0; i < M; i++) {
      const a0 = i / M * Math.PI * 2, a1 = (i + 1) / M * Math.PI * 2;
      for (const side of [-1, 1]) {
        const s0 = side * t / 2, f: Vec3 = [dx * side, 0, dz * side];
        const pts: Vec3[] = [at(p, a0, r0, s0), at(p, a1, r0, s0), at(p, a1, r1, s0), at(p, a0, r1, s0)];
        const [q0, q1, q2] = pts;
        const cx = (q1[1] - q0[1]) * (q2[2] - q0[2]) - (q1[2] - q0[2]) * (q2[1] - q0[1]);
        const cz = (q1[0] - q0[0]) * (q2[1] - q0[1]) - (q1[1] - q0[1]) * (q2[0] - q0[0]);
        const o = cx * f[0] + cz * f[2] >= 0 ? pts : [...pts].reverse();
        sink.quad('structureMetal', o[0], o[1], o[2], o[3], opts);
      }
      const am = (a0 + a1) / 2, outN: Vec3 = [nx * Math.cos(am), Math.sin(am), nz * Math.cos(am)];
      const pts: Vec3[] = [at(p, a0, r1, -t / 2), at(p, a0, r1, t / 2), at(p, a1, r1, t / 2), at(p, a1, r1, -t / 2)];
      const [q0, q1, q2] = pts;
      const cx = (q1[1] - q0[1]) * (q2[2] - q0[2]) - (q1[2] - q0[2]) * (q2[1] - q0[1]);
      const cy = (q1[2] - q0[2]) * (q2[0] - q0[0]) - (q1[0] - q0[0]) * (q2[2] - q0[2]);
      const cz = (q1[0] - q0[0]) * (q2[1] - q0[1]) - (q1[1] - q0[1]) * (q2[0] - q0[0]);
      const o = cx * outN[0] + cy * outN[1] + cz * outN[2] >= 0 ? pts : [...pts].reverse();
      sink.quad('structureMetal', o[0], o[1], o[2], o[3], opts);
    }
  };
  for (let k = 1; k + 1 < points.length; k++) flange(points[k], R - 0.04, R + 0.11, 0.07, 8);
  // the collar where the tube passes the pump house's east wall (its plane, x = the wall): a deeper flange there
  const [kiosk] = plan.bodies, wallX = kiosk.x + kiosk.width / 2;
  const t = (wallX - first[0]) / (last[0] - first[0]);
  if (t > 0 && t < 1 / 7) {
    const k0 = points[0], k1 = points[1];
    const tt = t * 7, c: Point3 = [k0[0] + (k1[0] - k0[0]) * tt, k0[1] + (k1[1] - k0[1]) * tt, k0[2] + (k1[2] - k0[2]) * tt];
    flange(c, R - 0.04, R + 0.17, 0.12, 8);
  }
  const geometry = plainSheet(sink.finish().structureMetal[0]);
  geometry.name = 'reservoir-connected-penstock';
  out.push({ bucket: 'steel', geometry, kit: true });
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
  after: Budget, kit: Budget): Piece[] | null {
  const pieces: Piece[] = [];
  buildBodies(plan, field, palette, pieces); buildIronPenstock(plan, pieces); buildBraces(plan, field, pieces);
  // (the coordinator, 2026-10-07: the kit's own parts under a ceiling of their own; the rest at or under its donors)
  for (const p of pieces) addBudget(p.kit ? kit : after, p.geometry);
  if (after.triangles > before.triangles || after.sourceBytes > before.sourceBytes
      || after.mergedBytes > before.mergedBytes || after.geometries > before.geometries || kit.triangles > KIT_TRIANGLE_CEILING) {
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
 * architecture (props.ts), whose weathering the pump house takes (weather.ts DEFAULT_WEATHER when the kit names none),
 * and whether the map draws the steel family (`steel`: its atlas painted), which the penstock's iron draws in.
 */
export function composeReservoirWaterworks(mapId: string, config: ReservoirWaterworksConfig | undefined,
  field: WaterworksTerrain, donors: readonly WaterworksRubblePacket[], buckets: Buckets,
  blockers: readonly CollisionRecord[], kit: { weather?: WeatherPalette; steel?: boolean } | null = null): ReservoirWaterworksReceipt | null {
  if (mapId !== 'reservoir' || !config) return null;
  const before = emptyBudget(), after = emptyBudget(), kitBudget = emptyBudget();
  const receipt: ReservoirWaterworksReceipt = {
    status: 'unavailable', donors: donors.length, before, after, kit: kitBudget, bodies: [], pipe: [],
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
  // (the steel family's own pieces, the yards' drums and tanks, are laid after the waterworks: props.ts says whether the
  // map draws it — its steel atlas is painted — and the guard reads that)
  if (!palette || !buckets.regionalStone?.length || !buckets.curtain?.length || !buckets.glass?.length || !buckets.regionalRoof?.length
    || !buckets.structureWood?.length || !(buckets.steel?.length || kit?.steel)) return receipt;
  const plan = planWorks(config, field, blockers, selection.ignored);
  if (!plan) { receipt.status = 'unsafe'; return receipt; }
  const pieces = buildBudgetedWorks(plan, field, palette, before, after, kitBudget);
  if (!pieces) { receipt.status = 'budget'; return receipt; }
  // No donor or physical record is changed until the complete assembly passes.
  commitWaterworks(plan, donors, buckets, selection.removed, pieces);
  receipt.status = 'built'; receipt.bodies = plan.bodies; receipt.pipe = plan.pipe;
  return receipt;
}
