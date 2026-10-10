/**
 * destructionKit.ts — the kit seam for damage geometry (destruction core lane, 2026-10-07; docs/DESTRUCTION.md §16).
 *
 * Owner, 2026-10-07: "destructible buildings and props need to be included in the buildings redesign, they need to
 * look just as good as everything else." Every damage stage is built from the building's (or the prop's) own kit:
 * wall breaks follow the material (brick courses, stone blocks, Fachwerk timbers and infill, plaster over rubble,
 * adobe, concrete with rebar), roofs fall their own way (tiles, slate, straw, earth, sheet), a breach opens the room
 * behind the wall (its floor-slab edge, joist ends, its floor), and the rubble is the building's own buckets, weather
 * tints and timbers.
 *
 * Who does what:
 * - The core (this lane) decides WHEN and WHERE: the stage, a hole's centre and radius, the section that fell, the
 *   rubble mound's profile (sim/terrainDeformation.ts). It runs `describe` at build time, keeps each structure's
 *   `StructureDamageAnatomy`, tags the intact geometry (§16.4), and implements the DEFAULT kit (anatomy read from the
 *   parts, fractured from the building's own buckets).
 * - A KIT hands over what it knows (the facades lane: per storey the four face rects with their openings and wall
 *   buckets, the Fachwerk members as segments, the masonry layout, floors and jetties, the roof's kind, pitch, slabs
 *   and covering, chimneys, the plinth; the scenery lane: each prop's materials) and may implement any stage's
 *   fracture builder itself, in or beside the kit.
 * - The PRESENTATION lane renders what the builders write (the damage batches, the pooled debris, the collapse
 *   animation, the hole cut, the room's darkness, dust, sound).
 *
 * Rules every builder keeps:
 * 1. Deterministic: it reads only its arguments and draws only from `damageRng(seed)`. Same anatomy, seed and
 *    arguments, same triangles and pieces, on every peer and every run.
 * 2. In budget: it writes into caller-owned writers (`DamageMeshWriter`: triangles in the building's own buckets, UVs
 *    and weather tints kept; `DamagePieceWriter`: pooled, instanced debris) and allocates nothing per vertex or piece.
 *    A writer refuses past its stage's cap; the builder stops there.
 * 3. Precompute only what collapse needs: `describe` keeps numbers and the kit's own layout handles, never geometry;
 *    every stage builds when it first happens (the presentation may run `collapse` once a structure is breached and
 *    keep the result, so the collapse frame only uploads).
 * 4. Frames: everything is in the structure's BODY frame, the frame its kit drew it in before props.ts placed it
 *    (house.ts): centred on the origin, base at y = 0, +X across (width w), +Z along (depth d; the ridge runs along Z),
 *    +Y up. Faces as house.ts names them: front +Z, right +X, back −Z, left −X. World = translate(placement) ·
 *    rotateY(placement.yaw).
 *
 * World-layer module (three types only, no builders): kits import it to implement; the presentation reaches a kit
 * through the world runtime (`world.structureDamage(id)`), never by importing one.
 */
import type { BufferGeometry } from 'three';
import type { DestructionCause, MunitionClass, StructureMassClass } from '../sim/destructionEvents.ts';
import { rubbleMoundHeightAt, type RubbleMound } from '../sim/terrainDeformation.ts';

export type Vec3 = readonly [number, number, number];
export type Rgb = readonly [number, number, number];

// ---- Materials -------------------------------------------------------------------------------------------------

/** How a material breaks (the builder's choice of fracture); the bucket says how it LOOKS. */
export type FractureMaterial =
  /** Fired brick: steps along courses and bonds; loose single bricks. */
  | 'brick'
  /** Dressed stone or ashlar: breaks on its joints; whole blocks fall. */
  | 'stone'
  /** Rubble masonry (fieldstone, random rubble): slumps into irregular stones. */
  | 'rubble'
  /** Cast concrete: cracks into plates; rebar stubs at the edge. */
  | 'concrete'
  /** Mud brick and rammed earth: crumbles to clods, rounded edges. */
  | 'adobe'
  /** Render and stucco: a thin skin with a lip around whatever core it covers. */
  | 'plaster'
  /** Structural timber (posts, rails, braces, sill and plate, rafters, joists): snaps with a splintered cap. */
  | 'timber'
  /** Fachwerk infill (wattle and daub, brick nogging): panels drop out of the frame whole, lath and wattle edges. */
  | 'infill'
  /** Boards and cladding: splinters along the grain. */
  | 'plank'
  /** Sheet and profile metal: bends and tears. */
  | 'metal'
  | 'glass'
  | 'tile'
  | 'slate'
  /** Straw thatch: chars and slumps. */
  | 'thatch'
  /** Earth and sod roofs: slump between their beams. */
  | 'earth'
  | 'canvas';

export const FRACTURE_MATERIALS: readonly FractureMaterial[] = Object.freeze([
  'brick', 'stone', 'rubble', 'concrete', 'adobe', 'plaster', 'timber', 'infill', 'plank', 'metal', 'glass', 'tile',
  'slate', 'thatch', 'earth', 'canvas',
] as const);

/** One material layer: how it breaks, the bucket it renders in, and this building's own tint of it. */
export interface FractureSlot {
  material: FractureMaterial;
  /** The props / regional bucket that draws it ('regionalStone', 'plaster2', 'roof', 'wood', 'straw' …). */
  bucket: string;
  /** This building's own linear-RGB tint (its weather tint in a vertex-coloured bucket; white in a textured one). */
  tint: Rgb;
  /** Layer thickness in metres (render 0.03, brick leaf 0.24, rubble core 0.5 …); for a pile, ignored. */
  thicknessM: number;
  /** Share of the face's area, or of the pile's volume, 0..1. */
  share: number;
}

// ---- What a kit hands over (build time) --------------------------------------------------------------------------

export type FaceName = 'front' | 'right' | 'back' | 'left';

/** A face of a storey (house.ts Face): origin at u = 0 on the storey floor, u along the face (centred), out normal. */
export interface DamageFace {
  name: FaceName;
  origin: Vec3;
  u: Vec3;
  out: Vec3;
  /** Width along u (u runs from −width/2 to +width/2) and the storey's wall height. */
  width: number;
  height: number;
  /** This face-on-storey's section id in the anatomy (the tags' section, §16.4). The core's sim sections are its
   * own (footprint faces and height bands, derivable on a host from the shard); the world maps an event's hole point or
   * fallen span onto these faces by geometry. */
  section: number;
  /** The wall's bucket and its layers outermost first (render over rubble; a framed wall's frame over its infill). */
  bucket: string;
  layers: FractureSlot[];
  openings: DamageOpening[];
  /** A framed (Fachwerk) wall's members on this face; empty when not framed. */
  members: FrameMember[];
  /** A coursed wall's layout (masonryLayout); null for render, timber, sheet. */
  masonry: MasonryLayout | null;
}

/** An opening in face coordinates (house.ts Opening: centre u, width, bottom above the storey floor, height). */
export interface DamageOpening {
  kind: 'window' | 'door' | 'gate' | 'shopfront' | 'loft' | 'arch';
  u: number;
  w: number;
  y0: number;
  h: number;
  /** Reveal depth (the wall's thickness the opening shows). */
  reveal: number;
  /** War wear already on it (house.ts Opening.state). */
  state?: 'burnt' | 'boarded';
}

/** A Fachwerk member as a segment on its face (u, y from the storey floor), its width and depth. */
export interface FrameMember {
  role: 'post' | 'rail' | 'brace' | 'sill' | 'plate' | 'stud' | 'strut';
  u0: number;
  y0: number;
  u1: number;
  y1: number;
  widthM: number;
  depthM: number;
}

/**
 * The masonry of a coursed wall, from the kit's own layout (the facades lane's masonryLayout): breaks step along
 * these joints and a broken block keeps its tile UVs. A handle, not data: it may close over the kit's layout.
 */
export interface MasonryLayout {
  /** Course boundaries up the face from the storey floor, ascending (the first is 0). */
  readonly courses: readonly number[];
  /** The block edges along u in course `index`, ascending (bond offsets included). */
  joints(index: number): readonly number[];
  /** The tile UV of a face point (u, y), so a broken block keeps the wall's own texture. */
  uv(u: number, y: number, out: [number, number]): void;
}

export interface DamageStorey {
  index: number;
  /** Floor and ceiling heights (body frame). */
  y0: number;
  y1: number;
  /** Oversail of this storey over the one below on front, right, back, left (house.ts StoreySpec.jetty). */
  jetty: readonly [number, number, number, number];
  framed: boolean;
  faces: DamageFace[];
  /** The slab at y0 (null on the ground storey): what a breach shows at the storey line and an upper fall drops. */
  floor: FloorSlab | null;
}

export interface FloorSlab {
  thicknessM: number;
  /** Joists (timber) or a slab (concrete); their ends show at a breach's top. */
  structure: FractureSlot;
  /** Spacing of the joists (0 for a slab). */
  joistPitchM: number;
}

export type RoofKind = 'gable' | 'halfhip' | 'hip' | 'flat' | 'shed' | 'dome' | 'spire' | 'vault';

/** A planar roof slab (a pitch, a hip, a flat deck) as its four corners in the body frame, and its covering bucket. */
export interface RoofSlab {
  corners: readonly [Vec3, Vec3, Vec3, Vec3];
  bucket: string;
}

export interface DamageRoof {
  kind: RoofKind;
  section: number;
  pitchDeg: number;
  eaveY: number;
  ridgeY: number;
  thicknessM: number;
  /** The covering (tile, slate, thatch, earth, sheet) and what carries it (rafters and battens, or a slab). */
  covering: FractureSlot;
  structure: FractureSlot;
  /** Batten and rafter pitch (a stripped patch shows them; emitRoofPatch). */
  battenPitchM: number;
  rafterPitchM: number;
  slabs: RoofSlab[];
}

export interface DamageChimney {
  x: number;
  z: number;
  sx: number;
  sz: number;
  y0: number;
  y1: number;
  bucket: string;
}

/** Everything a stage builder knows of one structure (numbers and the kit's layout handles; no geometry). */
export interface StructureDamageAnatomy {
  /** The structure's group id (CollisionRecord.structureIdx) in this world. */
  structureIdx: number;
  /** The kit that described it ('default', a regional style id such as 'franconian', a landmark kind). */
  kit: string;
  /** `damageSeed(mapHash, placement x cm, z cm)`: the same on every peer and tier. */
  seed: number;
  massClass: StructureMassClass;
  /** The body frame's placement (props.ts: the merge's position and yaw). */
  placement: { x: number; y: number; z: number; yaw: number };
  /** Body extents: w across (x), d along (z), h to the ridge. */
  w: number;
  d: number;
  h: number;
  plinth: { h: number; out: number; slot: FractureSlot } | null;
  storeys: DamageStorey[];
  roof: DamageRoof | null;
  chimneys: DamageChimney[];
  /** The room a breach opens: its darkness (linear RGB) and whether the body is one open shell (a barn, a hangar). */
  interior: { color: Rgb; open: boolean };
  /** The pile's materials by volume share, in this building's buckets and tints (timbers and roof tiles included). */
  rubble: FractureSlot[];
  /** What a collapse leaves standing: wall stubs to this height, the corners, the chimneys. */
  remnant: { stubHeightM: number; corners: boolean; chimneys: boolean };
  /**
   * The heap the simulation raises when the structure collapses (world frame: its collision footprint and height,
   * sim/terrainDeformation.ts). A kit's `describe` leaves it out: the world seam fills it from the structure table after
   * describe; `bodyMoundHeightAt` reads it in the body frame (0 while absent).
   */
  mound?: RubbleMound;
  /**
   * The kit's own plan of the building, opaque to the core (house.ts HouseSpec and HouseFrame, a landmark's plan): a
   * kit's builders read it back to fracture exactly what it built. Absent for the default kit.
   */
  kitPlan?: unknown;
}

/** What `describe` reads at build time (props.ts, landmarks/compose.ts): the building as its kit just built it. */
export interface StructureDescribeInput {
  structureIdx: number;
  mapId: string;
  /** The plan or builder id ('cottage', 'rowhouse', 'church', 'barn', 'ruin', a landmark kind …). */
  builder: string;
  /** The map's regional style id, or null for the base structure kit. */
  style: string | null;
  /** The parts in the body frame by bucket, as merged (read-only: never transform or dispose them). */
  parts: Readonly<Record<string, readonly BufferGeometry[]>>;
  /** The plan's footprint and height (structureKit BuildingInfo). */
  w: number;
  d: number;
  h: number;
  placement: { x: number; y: number; z: number; yaw: number };
  massClass: StructureMassClass;
  seed: number;
  /** The kit builder's plan, as it handed it back beside its parts (house.ts HouseSpec + HouseFrame), or undefined. */
  kitPlan?: unknown;
}

// ---- Writers (stage time) --------------------------------------------------------------------------------------

/**
 * How the presentation treats what a builder writes: `rim` (a breach's broken edge), `room` (what a breach opens:
 * the dark backing, the floor plane, the slab edge, joist ends), `remnant` (what stands after a fall), `rubble` (the
 * pile, seated on `rubbleMoundHeightAt`), `debris` (falling pieces: pooled, animated from the pose given, seeded by
 * their index, settled into the pile or faded).
 */
export type DamageRole = 'rim' | 'room' | 'remnant' | 'rubble' | 'debris';

/**
 * Triangles in the building's own buckets, body frame, with UVs and tints, appended to caller-owned arrays. A run
 * belongs to one bucket and one role; vertices are indexed within their run. `begin` returns false when that bucket's
 * share of the stage's cap is spent (the builder skips the run).
 */
export interface DamageMeshWriter {
  begin(bucket: string, role: DamageRole): boolean;
  vertex(px: number, py: number, pz: number, nx: number, ny: number, nz: number, u: number, v: number,
    r: number, g: number, b: number): number;
  triangle(a: number, b: number, c: number): void;
  end(): void;
  readonly vertices: number;
  readonly capacity: number;
}

/** Shapes of the pooled debris pieces (one instanced mesh per bucket and shape in use, per world). */
export type DebrisShape = 'chunk' | 'brick' | 'block' | 'stone' | 'plate' | 'splinter' | 'beam' | 'tile' | 'slate'
  | 'sheet' | 'shard' | 'clod' | 'straw' | 'rebar';

/**
 * Pooled debris: one instance of (bucket, shape, variant) at a pose in the body frame (position, unit quaternion,
 * scale), tinted, with an initial velocity the animation starts from. Returns false when the stage's cap is reached.
 */
export interface DamagePieceWriter {
  push(bucket: string, shape: DebrisShape, variant: number,
    px: number, py: number, pz: number, qx: number, qy: number, qz: number, qw: number,
    sx: number, sy: number, sz: number, r: number, g: number, b: number,
    vx: number, vy: number, vz: number): boolean;
  readonly count: number;
  readonly capacity: number;
}

/** The writers a stage gets, and its caps (DESTRUCTION.md §16.3). */
export interface DamageWriters {
  mesh: DamageMeshWriter;
  pieces: DamagePieceWriter;
}

/**
 * A hole to cut from the intact geometry: a cylinder along the face normal (the presentation's shader discard), from
 * `outsideM` outside the face plane (sills, surrounds and shutters inside the hole go too; 0.3 m by default) to
 * `depthM` inside it (the wall's layers plus a margin).
 */
export interface StructureCut {
  x: number;
  y: number;
  z: number;
  nx: number;
  nz: number;
  radiusM: number;
  /** Depth from the outer plane inward: the wall's layers plus a margin. */
  depthM: number;
  /** How far outside the face plane the cut begins (absent: 0.3 m). */
  outsideM?: number;
}

/** The per-vertex part class the build tags (§16.4): what a stage may hide. */
export type DamagePartClass = 'wall' | 'roof' | 'glass' | 'trim' | 'interior';

/**
 * Intact parts to hide from a stage on: a whole section, a part class, a class within a section — or, with both null,
 * everything the structure has (a collapse).
 */
export interface DamageHide {
  section: number | null;
  partClass: DamagePartClass | null;
}

/** What a stage returns beside what it wrote. */
export interface DamageStageResult {
  cuts: StructureCut[];
  hides: DamageHide[];
}

/** A breach to dress (StructureBreachEvent in the body frame) and what made it. */
export interface BreachSpec {
  section: number;
  /** The storey and face the section is. */
  storey: number;
  face: FaceName;
  /** Hole slot within the section, and its centre on the face (u, y from the storey floor) and radius. */
  hole: number;
  u: number;
  y: number;
  radiusM: number;
  /** The blow's direction in the body frame (horizontal unit vector) and what it was. */
  dirX: number;
  dirZ: number;
  munition: MunitionClass | null;
  cause: DestructionCause;
  /** `damageSeed(anatomy.seed, section, hole)`. */
  seed: number;
}

// ---- Kits ------------------------------------------------------------------------------------------------------

/**
 * A structure damage kit. Every member except `id` is optional; for each one the world takes the first kit in the
 * chain (`structureDamageKitChain`) that defines it, so a kit may override only its breach or only its roof.
 */
export interface StructureDamageKit {
  readonly id: string;
  /** Build time: the anatomy (from the kit's plan when it has one), or null for the default's reading of the parts. */
  describe?(input: StructureDescribeInput): StructureDamageAnatomy | null;
  /** A debris piece mesh for one of this kit's buckets (null: the default's piece). Built once per world. */
  piece?(bucket: string, shape: DebrisShape, variant: number, rng: () => number): BufferGeometry | null;
  /** `damaged`: spalled render patches, chipped arrises, cracked and missing glass, slipped tiles. */
  damaged?(anatomy: StructureDamageAnatomy, seed: number, out: DamageWriters): DamageStageResult;
  /** A breach: the rim in the wall's own layers and joints, the room behind it, the debris thrown along the blow. */
  breach?(anatomy: StructureDamageAnatomy, hole: BreachSpec, out: DamageWriters): DamageStageResult;
  /** A section falls (P2): a roof drops its covering (slab sections missing, a broken ridge, hanging rafters), an
   *  upper storey pancakes, a wall panel topples outward. */
  sectionDown?(anatomy: StructureDamageAnatomy, section: number, seed: number, out: DamageWriters): DamageStageResult;
  /** A storey drops after its faces (P2: the fall that completes it, StructureBreachEvent.storeyDown): its floor slab
   *  and what stood on it falling into the storey below. */
  storeyDown?(anatomy: StructureDamageAnatomy, storey: number, seed: number, out: DamageWriters): DamageStageResult;
  /** The collapse: remnants, the pile on the mound in the building's own buckets, and the falling debris. */
  collapse?(anatomy: StructureDamageAnatomy, seed: number, out: DamageWriters): DamageStageResult;
}

/** A destructible prop at build time (maps/inhabitKit.ts DESTRUCTIBLE_TYPES). */
export interface PropDescribeInput {
  propIdx: number;
  kind: string;
  /** The type table's material ('wood', 'straw', 'stone', 'plaster', 'baked', 'vehicle'). */
  mat: string;
  /** The intact prop in its own frame (read-only). */
  geometry: BufferGeometry;
  radiusM: number;
  heightM: number;
  seed: number;
}

export interface PropDamageAnatomy {
  propIdx: number;
  kind: string;
  seed: number;
  /** What it breaks into, in its own buckets and tints: its planks, its sheet, its stones, its glass. */
  fracture: FractureSlot[];
}

/**
 * A prop damage kit (the scenery lane's): the type table's `broken` builder is the broken state; this throws the
 * debris from the prop's own materials along the blow. Deterministic in (anatomy, cause, direction).
 */
export interface PropDamageKit {
  readonly id: string;
  readonly kinds: readonly string[];
  describe?(input: PropDescribeInput): PropDamageAnatomy | null;
  debris?(anatomy: PropDamageAnatomy, cause: DestructionCause, dirX: number, dirZ: number,
    out: DamagePieceWriter): void;
}

// ---- Registry and resolution -----------------------------------------------------------------------------------

const structureKits = new Map<string, StructureDamageKit>();
const propKits = new Map<string, PropDamageKit>();

/** A kit module registers itself once at load; a second registration of the same id replaces the first. */
export function registerStructureDamageKit(kit: StructureDamageKit): void {
  structureKits.set(kit.id, kit);
}

export function registerPropDamageKit(kit: PropDamageKit): void {
  for (const kind of kit.kinds) propKits.set(kind, kit);
}

/**
 * The kits a structure resolves through, most specific first: its builder's own (a landmark, a set piece), the map's
 * regional style, then 'default'. Each member is taken from the first kit in the chain that defines it.
 */
export function structureDamageKitChain(builder: string, style: string | null): StructureDamageKit[] {
  const chain: StructureDamageKit[] = [];
  const own = structureKits.get(builder);
  if (own) chain.push(own);
  const regional = style ? structureKits.get(style) : undefined;
  if (regional && regional !== own) chain.push(regional);
  const fallback = structureKits.get('default');
  if (fallback && fallback !== own && fallback !== regional) chain.push(fallback);
  return chain;
}

export function propDamageKitFor(kind: string): PropDamageKit | null {
  return propKits.get(kind) ?? propKits.get('default') ?? null;
}

// ---- The body frame's heap and the kit's plan ------------------------------------------------------------------

/**
 * The sim's heap at body-frame (x, z) — its height above the ground there (the presentation seats a piece on the
 * terrain under it plus this). A kit's `collapse` places its pile with it: `(x, z) => bodyMoundHeightAt(anatomy, x, z)`.
 */
export function bodyMoundHeightAt(anatomy: StructureDamageAnatomy, x: number, z: number): number {
  const { placement } = anatomy;
  if (!anatomy.mound) return 0;
  const c = Math.cos(placement.yaw), s = Math.sin(placement.yaw);
  // body → world: rotateY(yaw) then translate (three's rotateY: x' = x c + z s, z' = −x s + z c)
  return rubbleMoundHeightAt(anatomy.mound, placement.x + x * c + z * s, placement.z - x * s + z * c);
}

type KitPlanReader = (parts: Readonly<Record<string, readonly BufferGeometry[]>>, style: string | null) => unknown;
let kitPlanReader: KitPlanReader | null = null;

/**
 * The regional kits' plan reader (the facades lane's `regionalKitPlanOf`): registered once by the kits' module, read by
 * the world builder for `StructureDescribeInput.kitPlan` at every rebuild site, so the builder imports no kit.
 */
export function setKitPlanReader(reader: KitPlanReader | null): void {
  kitPlanReader = reader;
}

export function kitPlanFor(parts: Readonly<Record<string, readonly BufferGeometry[]>>, style: string | null): unknown {
  return kitPlanReader ? kitPlanReader(parts, style) : undefined;
}

// ---- Determinism -----------------------------------------------------------------------------------------------

/**
 * A 32-bit seed from integers (FNV-1a over their 32-bit words): `damageSeed(mapHash, xCm, zCm)` for a building (its
 * placement centre in centimetres), `damageSeed(seed, section, hole)` for a hole, `damageSeed(seed, stage)` for a
 * stage.
 */
export function damageSeed(...parts: number[]): number {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    let word = Math.trunc(part) | 0;
    for (let byte = 0; byte < 4; byte++) {
      hash ^= word & 0xff;
      hash = Math.imul(hash, 0x01000193);
      word >>>= 8;
    }
  }
  return hash >>> 0;
}

/**
 * A breach's outline (wave 277: a hole read as "a neat round dark ring, like a porthole"): at angle θ round its centre
 * on its face — θ = atan2(up, along the face's u) — its edge stands holeOutlineK(θ, seed) of its radius out:
 * 0.8 + 0.2·sin(3θ + φ) + 0.12·sin(5θ + 2φ), 0.48–1.12, φ = holeOutlinePhase(seed) from the hole's own seed
 * (BreachSpec.seed). The kits lay their rims round it and the FX lane's cut follows the same lobes.
 */
export function holeOutlinePhase(seed: number): number {
  return (Math.imul(seed >>> 0, 0x9e3779b1) >>> 0) / 4294967296 * Math.PI * 2;
}
export function holeOutlineK(theta: number, seed: number): number {
  const phase = holeOutlinePhase(seed);
  return 0.8 + 0.2 * Math.sin(3 * theta + phase) + 0.12 * Math.sin(5 * theta + 2 * phase);
}

/** The only RNG a builder may draw from (mulberry32 over the seed). */
export function damageRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
