/**
 * destructionKit.ts — the kit seam for damage geometry (destruction core lane, 2026-10-07; docs/DESTRUCTION.md §16).
 *
 * Owner, 2026-10-07: "destructible buildings and props need to be included in the buildings redesign, they need to
 * look just as good as everything else." Every damage stage is built from the building's (or the prop's) own kit:
 * wall breaks follow the material (brick courses, stone blocks, Fachwerk timbers and infill, adobe, concrete with
 * rebar), roofs fall their own way (tiles, slate, earth, thatch, sheet), a breach exposes the interior (floor slabs, a
 * dark room), and the rubble is the building's own materials and colours.
 *
 * Who does what:
 * - The core (this lane) decides WHEN and WHERE: the stage, the hole's centre and radius, the section that fell, the
 *   rubble mound's profile (sim/terrainDeformation.ts). It derives each building's DAMAGE ANATOMY at build time
 *   (`StructureDamageAnatomy`: its sections, their material layers and colours, its floors, its roof) and implements
 *   the DEFAULT kit's layouts (which pieces go where), deterministic and Node-tested.
 * - A KIT (the facades lane for the structure, regional and landmark kits; the scenery lane for props) may override
 *   any part: its own anatomy, its own palette pieces, its own layouts, or whole authored variants.
 * - The PRESENTATION lane renders: the fracture palette's instanced pieces, pooled debris, the collapse animation,
 *   the hole cut in the intact geometry, the interior's darkness, dust and sound.
 *
 * Rules every implementation keeps:
 * 1. Deterministic: a generator reads only its arguments and draws only from `damageRng(seed)`; the same seed and
 *    arguments give the same pieces on every peer and every run (no Math.random, no clock, no iteration over a Set or
 *    Map built in another order).
 * 2. In budget: pieces are INSTANCES of a small per-world palette (`FracturePalette`), written into caller-owned
 *    typed arrays (`DamagePieceWriter`); a generator allocates nothing per piece. Bespoke geometry (`custom`) is for
 *    authored set pieces only and is built once per structure, at its first damage, never per frame.
 * 3. Precompute only what collapse needs: `describe` runs at build time and returns small numbers (no geometry);
 *    everything else runs when its stage first happens (the presentation may pre-run `collapse` when a structure is
 *    breached, so the collapse frame only uploads).
 * 4. Frames: anatomy and pieces are in the structure's PLOT frame — the frame its kit builder drew it in, before
 *    props.ts placed it: origin at the plot centre on the ground line (`placement.y`), +X across the plot (width
 *    `w`), +Z along it (depth `d`), +Y up; the world matrix is translate(placement) · rotateY(placement.yaw).
 *
 * World-layer module (three types only, no builders): kits import it to implement; the presentation reaches the kits
 * through the world runtime's seam (`world.structureDamage(id)`), never by importing a kit.
 */
import type { BufferGeometry } from 'three';
import type { DestructionCause, MunitionClass, StructureMassClass } from '../sim/destructionEvents.ts';

// ---- Materials -------------------------------------------------------------------------------------------------

/** Materials that break differently. A section is layers of these, outermost first. */
export type FractureMaterial =
  /** Fired brick: breaks along courses and bonds, stepped edges, loose single bricks. */
  | 'brick'
  /** Stone: dressed blocks break on their joints; rubble walls slump into irregular stones. */
  | 'stone'
  /** Cast concrete: slabs crack into plates, the edges show rebar. */
  | 'concrete'
  /** Steel reinforcement: bent bars at a concrete break (never alone). */
  | 'rebar'
  /** Mud brick and rammed earth: crumbles to clods and dust, rounded edges. */
  | 'adobe'
  /** Render and stucco: a thin skin that spalls in sheets off whatever is under it. */
  | 'plaster'
  /** Structural timber: Fachwerk posts, beams and braces; snaps with splinters, hangs from its joints. */
  | 'timber'
  /** Fachwerk infill: wattle-and-daub or brick-nogging panels that drop out of the frame whole or in pieces. */
  | 'infill'
  /** Boards and cladding (sheds, crates, fences, carts): splinters along the grain. */
  | 'plank'
  /** Sheet and profile metal (hangars, sheds, poles, vehicle bodies): bends and tears, never shatters. */
  | 'metal'
  | 'glass'
  /** Clay roof tiles (beavertail, pantile, canal): slide and shatter. */
  | 'tile'
  | 'slate'
  | 'thatch'
  /** Earth and sod roofs, flat mud roofs: slump as a mass. */
  | 'earth'
  | 'canvas';

export const FRACTURE_MATERIALS: readonly FractureMaterial[] = Object.freeze([
  'brick', 'stone', 'concrete', 'rebar', 'adobe', 'plaster', 'timber', 'infill', 'plank', 'metal', 'glass', 'tile',
  'slate', 'thatch', 'earth', 'canvas',
] as const);

/** One material of a section or a pile, bound to the world bucket that renders it and to this building's own colour. */
export interface FractureSlot {
  material: FractureMaterial;
  /** The props bucket whose material draws these pieces ('stone', 'plaster2', 'roof', 'regionalWall', 'wood' …). */
  bucket: string;
  /** This building's own linear-RGB tint of that material (its vertex colour or its bucket material's colour). */
  color: readonly [number, number, number];
  /** Thickness of this layer in metres (render 0.03, brick leaf 0.24, stone 0.5 …); for a pile, ignored. */
  thicknessM: number;
  /** Share of the section's area (or of the pile's volume) this material holds, 0..1. */
  share: number;
}

// ---- Anatomy (build time, numbers only) ------------------------------------------------------------------------

/** A window or door in a wall face, in face coordinates (u across from the face's left end, v up from the ground). */
export interface FaceOpening {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  kind: 'window' | 'door' | 'arch';
}

/** One wall face of the footprint (a section). */
export interface WallSectionAnatomy {
  kind: 'wall';
  /** Stable section index within the structure (DESTRUCTION.md §3.4), shared with the core's section hit points. */
  section: number;
  /** The face's outer plane in the plot frame: a point on it at ground level (its left end) and its outward normal. */
  originX: number;
  originZ: number;
  normalX: number;
  normalZ: number;
  /** Face width (along the face) and height (eaves) in metres. */
  widthM: number;
  heightM: number;
  /** Material layers, outermost first (render over brick; timber frame then infill; concrete then rebar). */
  layers: FractureSlot[];
  /** Fachwerk: the frame's member spacing and member width, so breaks follow it (0 when not framed). */
  framePitchM: number;
  frameMemberM: number;
  /** Masonry: the course height and unit length breaks step along (0 when not coursed). */
  courseM: number;
  unitM: number;
  openings: FaceOpening[];
}

export type RoofForm = 'gable' | 'hip' | 'shed' | 'flat' | 'dome' | 'spire' | 'vault';

export interface RoofSectionAnatomy {
  kind: 'roof';
  section: number;
  form: RoofForm;
  /** The covering (tiles, slate, sheet, thatch, earth) and what carries it (timber rafters, a concrete slab). */
  covering: FractureSlot;
  structure: FractureSlot;
  eavesY: number;
  ridgeY: number;
  /** Ridge direction in the plot frame (radians about +Y; 0 = along +Z). */
  ridgeYaw: number;
  overhangM: number;
}

/** A floor slab: what a breach reveals at its height and what an upper floor's fall drops. */
export interface FloorSlab {
  y: number;
  thicknessM: number;
  material: FractureSlot;
}

export interface StructureDamageAnatomy {
  /** The structure's group id (CollisionRecord.structureIdx) in this world. */
  structureIdx: number;
  /** The kit that described it ('default' or a kit id such as 'chouf', 'franconian', 'sarajevo', a landmark id). */
  kit: string;
  /** Damage seed (`damageSeed`): identical on every peer for the same building. */
  seed: number;
  massClass: StructureMassClass;
  /** The placement that maps the plot frame to the world (props.ts: position and yaw of the merge). */
  placement: { x: number; y: number; z: number; yaw: number };
  /** Plot half extents and height (the solid envelope, not the collision footprint). */
  halfW: number;
  halfD: number;
  heightM: number;
  walls: WallSectionAnatomy[];
  roof: RoofSectionAnatomy | null;
  floors: FloorSlab[];
  /** The interior a breach shows: its darkness (linear RGB) and whether it is an open shell (a barn, a hangar). */
  interior: { color: readonly [number, number, number]; open: boolean };
  /** What the rubble pile is made of, by volume share, in this building's colours. */
  rubble: FractureSlot[];
  /** Standing remnants after a collapse: the height a wall stub keeps (0..1 of eaves), chimneys and corners that stand. */
  remnant: { stubHeightM: number; corners: boolean; chimneys: readonly (readonly [number, number, number])[] };
}

/** What `describe` may read at build time (props.ts, landmarks/compose.ts): the building as its kit just built it. */
export interface StructureDescribeInput {
  structureIdx: number;
  mapId: string;
  /** The plan or builder id ('cottage', 'rowhouse', 'church', 'barn', 'ruin', a landmark kind …). */
  builder: string;
  /** The map's regional style id, or null for the base structure kit. */
  style: string | null;
  /** The building's parts in the plot frame, by props bucket, as merged (read-only: never transform or dispose). */
  parts: Readonly<Record<string, readonly BufferGeometry[]>>;
  /**
   * The kit builder's own plan of this building, opaque to the core: a regional builder that drew from a house plan
   * (house.ts HouseSpec: its walls, openings, roof) returns it beside its parts and reads it back here, so its anatomy
   * is the plan's, not a reading of the geometry. Absent for the base kit and for builders that keep none.
   */
  kitPlan?: unknown;
  /** The plan's footprint and height (structureKit BuildingInfo). */
  w: number;
  d: number;
  h: number;
  placement: { x: number; y: number; z: number; yaw: number };
  massClass: StructureMassClass;
  seed: number;
}

// ---- Pieces (stage time, instances) ----------------------------------------------------------------------------

/**
 * The per-world palette: a few authored or generated piece geometries per material (a brick, a half brick, a stone
 * block, a rubble stone, a tile, a slate, a splinter, a beam end, a rebar hook, a concrete plate …). The presentation
 * builds the default palette once per world; a kit may author its own pieces for its materials. Pieces are unit-sized
 * (about one metre on their longest axis) and scaled per instance.
 */
export interface FracturePalette {
  /** Number of variants for a material (0 = the material has no pieces in this palette). */
  variants(material: FractureMaterial): number;
}

/**
 * Where generators write their pieces: caller-owned, reused, typed arrays. `push` appends one instance: the palette
 * piece (material, variant), its transform in the plot frame (position, a unit quaternion, scale), its tint, and a
 * role the presentation animates by. Returns false when the writer is full (a generator stops placing then).
 */
export interface DamagePieceWriter {
  push(
    material: FractureMaterial, variant: number,
    px: number, py: number, pz: number,
    qx: number, qy: number, qz: number, qw: number,
    sx: number, sy: number, sz: number,
    r: number, g: number, b: number,
    role: DamagePieceRole,
  ): boolean;
  readonly count: number;
  readonly capacity: number;
}

/**
 * How the presentation treats a piece: `rim` and `remnant` stay where they are placed; `rubble` lies on the mound
 * (the generator seats it on `rubbleMoundHeightAt`); `debris` is a falling piece (the generator gives its start pose,
 * the presentation pools and animates it, seeded by its index, and may settle it into the pile).
 */
export type DamagePieceRole = 'rim' | 'interior' | 'remnant' | 'rubble' | 'debris';

/** A hole to cut from the intact geometry: a cylinder through the wall along the face normal (shader discard). */
export interface StructureCut {
  /** Centre on the wall's outer plane, plot frame. */
  x: number;
  y: number;
  z: number;
  /** The face's outward normal (the cylinder's axis), plot frame. */
  nx: number;
  nz: number;
  radiusM: number;
  /** Depth of the cut from the outer plane inward (the wall's thickness plus a margin). */
  depthM: number;
}

/** Parts of the intact building to hide from a stage on: by part class, or the whole section. */
export interface DamageHide {
  section: number | null;
  partClass: DamagePartClass | null;
}

/**
 * The per-vertex part class the build tags beside the structure index (the presentation's mask reads it): a
 * `damaged` stage hides glass; a fallen roof section hides `roof`; a collapse hides everything.
 */
export type DamagePartClass = 'wall' | 'roof' | 'glass' | 'trim' | 'interior';

/** A breach to dress: where the core opened the hole (StructureBreachEvent, in the plot frame) and what made it. */
export interface BreachSpec {
  section: number;
  hole: number;
  x: number;
  y: number;
  z: number;
  radiusM: number;
  munition: MunitionClass | null;
  cause: DestructionCause;
  /** The hole's own seed: `damageSeed(anatomy.seed, section, hole)`. */
  seed: number;
}

/** What a stage adds: instanced pieces (in the writer the caller passed), cuts, hides, and authored geometry. */
export interface DamageStageResult {
  cuts: StructureCut[];
  hides: DamageHide[];
  /** Authored geometry by props bucket, plot frame (set pieces only; built once). */
  custom: { bucket: string; geometry: BufferGeometry }[];
}

// ---- Kits ------------------------------------------------------------------------------------------------------

/**
 * A structure damage kit. Every member is optional except `id`; the resolver (`resolveStructureDamageKit`) falls back
 * member by member to the default kit, so a kit may override only its roof fall or only its rubble.
 */
export interface StructureDamageKit {
  readonly id: string;
  /** Build time: the anatomy, or null to take the default's. Pure, cheap (no geometry built), deterministic. */
  describe?(input: StructureDescribeInput): StructureDamageAnatomy | null;
  /** The palette pieces this kit authors for a material it owns (null: the default palette's piece). Built once. */
  piece?(material: FractureMaterial, variant: number, rng: () => number): BufferGeometry | null;
  /** `damaged`: cracks, chipped corners and arrises, glass gone (pieces as `rim`, `debris` for the glass). */
  damaged?(anatomy: StructureDamageAnatomy, out: DamagePieceWriter): DamageStageResult;
  /** A breach: the rim in the wall's own layers (brick steps, stone blocks, timbers and infill, rebar in concrete),
   *  the exposed floor slabs, the dark interior behind it, and the debris thrown out along the blow. */
  breach?(anatomy: StructureDamageAnatomy, hole: BreachSpec, out: DamagePieceWriter): DamageStageResult;
  /** A section falls (P2): a roof slides and drops its covering, an upper floor pancakes, a wall panel topples. */
  sectionDown?(anatomy: StructureDamageAnatomy, section: number, seed: number, out: DamagePieceWriter): DamageStageResult;
  /** The collapse: what stands (stubs, corners, chimneys), the pile on the mound, and the falling debris. */
  collapse?(anatomy: StructureDamageAnatomy, out: DamagePieceWriter): DamageStageResult;
}

/** A destructible prop as its type table declares it (maps/inhabitKit.ts DESTRUCTIBLE_TYPES) at build time. */
export interface PropDescribeInput {
  propIdx: number;
  kind: string;
  /** The type table's material ('wood', 'straw', 'stone', 'plaster', 'baked', 'vehicle'). */
  mat: string;
  /** The intact prop's geometry in its own frame (read-only). */
  geometry: BufferGeometry;
  radiusM: number;
  heightM: number;
  seed: number;
}

export interface PropDamageAnatomy {
  propIdx: number;
  kind: string;
  seed: number;
  /** What it breaks into, in its own colours: splinters of its planks, bent sheet of its body, its own stones. */
  fracture: FractureSlot[];
}

/**
 * A prop damage kit (the scenery lane's): extends the type table's authored `broken` builder with debris from the
 * prop's own materials. Deterministic in (anatomy, cause, seed); the broken state is built once per prop.
 */
export interface PropDamageKit {
  readonly id: string;
  /** The prop kinds it serves. */
  readonly kinds: readonly string[];
  describe?(input: PropDescribeInput): PropDamageAnatomy | null;
  /** Pieces thrown by the break, along the blow (role `debris`). */
  debris?(anatomy: PropDamageAnatomy, cause: DestructionCause, dirX: number, dirZ: number, out: DamagePieceWriter): void;
}

// ---- Registry and resolution -----------------------------------------------------------------------------------

const structureKits = new Map<string, StructureDamageKit>();
const propKits = new Map<string, PropDamageKit>();

/** A kit module registers itself once at load (its id must be unique; a second registration replaces the first). */
export function registerStructureDamageKit(kit: StructureDamageKit): void {
  structureKits.set(kit.id, kit);
}

export function registerPropDamageKit(kit: PropDamageKit): void {
  for (const kind of kit.kinds) propKits.set(kind, kit);
}

/**
 * The kit for a structure, most specific first: the builder's own (a landmark, a set piece: its builder id), the map's
 * regional style, then 'default'. Returns the ids in that order; the caller takes each member from the first kit that
 * defines it (so a regional kit may override only `breach`).
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

// ---- Determinism helpers ---------------------------------------------------------------------------------------

/**
 * A 32-bit damage seed from integers (FNV-1a over their 32-bit words): `damageSeed(mapHash, xCm, zCm)` for a
 * building (its placement centre in centimetres, identical on every tier that places it), `damageSeed(seed, section,
 * hole)` for a hole.
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

/** The only RNG a generator may draw from (mulberry32 over the seed). */
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
