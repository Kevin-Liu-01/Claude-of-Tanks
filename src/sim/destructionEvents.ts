/**
 * destructionEvents.ts — the destruction contract between the authoritative core and its presentation (destruction
 * core lane, 2026-10-07; docs/DESTRUCTION.md).
 *
 * The core (the solo step in game/state.ts, the network authority in sim/authoritativeMatch.ts and the shared rules in
 * sim/structureDamage.ts, sim/munitionBlast.ts and sim/terrainDeformation.ts) decides what breaks, when, and how the
 * collision, sight and ground change. This module is the only thing the presentation (explosions, debris, dust,
 * collapse animation, holes, crater surfaces, sound) needs to import: event names, payload shapes, the munition
 * classes with their nominal charges, and the settled-state shapes a late joiner reads. It has no imports, no three, no
 * DOM and no world builders, so the fx and audio layers can take it without pulling the world into their chunks.
 *
 * Coordinates are world metres (y up, the hull's forward is +Z), angles radians, charges kilograms of TNT equivalent.
 */

// ---- Munition classes ------------------------------------------------------------------------------------------

/**
 * Every weapon class the blast catalog prices (DESTRUCTION.md §4.1). A shell or warhead maps to exactly one class
 * (`munitionClassForShell` in sim/munitionBlast.ts); non-shell blasts (a hull's ammunition, its fuel) have their own.
 */
export type MunitionClass =
  /** Rifle and machine-gun bullets (coaxial and roof guns): marks, never structure damage, never a crater. */
  | 'small_arms'
  /** 20–40 mm armour-piercing rounds (IFV cannons, the gunship's 30 mm): chips and small holes. */
  | 'autocannon_ap'
  /** 20–40 mm high-explosive rounds (IFV cannons, the gunship's 25/40 mm class). */
  | 'autocannon_he'
  /** Tank AP / APCR / APFSDS: a punched hole, little structural damage, no crater. */
  | 'kinetic'
  /** HEAT shells and shaped-charge warheads fired from a gun. */
  | 'heat'
  /** Guided anti-tank missiles (guided HEAT: Konkurs, Spike, TOW, MILAN, HJ-10, Viper, gun-launched missiles). */
  | 'atgm'
  /** HE / HE-FRAG gun rounds. */
  | 'he'
  /** HESH (squash head): the anti-structure round, a wall breaker. The fleet types it 'HE' and names it (L31A7, M393). */
  | 'hesh'
  /** Smoke and white-phosphorus rounds (typed 'HE' in the fleet, named 'Smoke' / 'WP'): a screen, never a blast. */
  | 'smoke'
  /** Heavy howitzer HE (105–155 mm): the gunship's howitzer, heavy self-propelled guns. */
  | 'howitzer'
  /** Guided HE missiles (the gunship's missile, 9M-695 and HJ-P9 Blast, the Stinger). */
  | 'missile'
  /** Unguided rockets (salvo racks, rocket batteries). */
  | 'rocket'
  /** The FPV drone's warhead (a shaped charge on a small frag body). */
  | 'drone_fpv'
  /** A destroyed hull's ammunition detonating (ammo-rack kill). */
  | 'cook_off'
  /** A burning hull's fuel deflagrating (fire kill). */
  | 'fuel';

export const MUNITION_CLASSES: readonly MunitionClass[] = Object.freeze([
  'small_arms', 'autocannon_ap', 'autocannon_he', 'kinetic', 'heat', 'atgm', 'he', 'hesh', 'smoke', 'howitzer',
  'missile', 'rocket', 'drone_fpv', 'cook_off', 'fuel',
] as const);

/** What a class does in the world, for the presentation's choice of explosion and the catalog's laws. */
export interface MunitionProfile {
  readonly id: MunitionClass;
  /** Short label for diagnostics and the field manual. */
  readonly label: string;
  /** Explosive: detonates (fireball, blast wave, soot). False for kinetic and small-arms rounds. */
  readonly explosive: boolean;
  /**
   * Nominal TNT-equivalent charge in kg for a typical member of the class; the catalog scales gun rounds by calibre
   * (`munitionChargeKg`), so this is a reference, not the value every event carries (events carry their own).
   */
  readonly nominalChargeKg: number;
  /** Multiplies the blast's structural damage (HESH is the wall breaker; shaped charges spend their energy in a jet). */
  readonly structureFactor: number;
  /** Multiplies the crater the charge digs (shaped charges and air bursts dig less than a buried HE shell). */
  readonly craterFactor: number;
  /** Punches a hole where it strikes a wall (kinetic and shaped-charge rounds), whatever the blast does. */
  readonly penetrator: boolean;
}

/**
 * The catalog's class table (DESTRUCTION.md §4.1). Charges are TNT equivalents of the class's reference round:
 * small arms, kinetic and smoke none; 30 mm HE 0.05 kg; 120 mm HEAT 2.3 kg; 125 mm HE-FRAG 3.5 kg; 120 mm HESH 5.2 kg;
 * 152 mm howitzer HE 6.8 kg; a 152 mm ATGM 3.4 kg; the gunship's missile 11 kg; a rocket 8 kg (capped); the FPV
 * warhead 1.2 kg; a 60 t hull's ammunition 9 kg; its fuel 4 kg.
 */
export const MUNITION_PROFILES: Readonly<Record<MunitionClass, MunitionProfile>> = Object.freeze({
  small_arms: Object.freeze({ id: 'small_arms', label: 'Small arms', explosive: false, nominalChargeKg: 0, structureFactor: 0, craterFactor: 0, penetrator: false }),
  autocannon_ap: Object.freeze({ id: 'autocannon_ap', label: 'Autocannon AP', explosive: false, nominalChargeKg: 0, structureFactor: 0, craterFactor: 0, penetrator: true }),
  autocannon_he: Object.freeze({ id: 'autocannon_he', label: 'Autocannon HE', explosive: true, nominalChargeKg: 0.05, structureFactor: 1, craterFactor: 0.6, penetrator: false }),
  kinetic: Object.freeze({ id: 'kinetic', label: 'Kinetic (AP / APFSDS)', explosive: false, nominalChargeKg: 0, structureFactor: 0, craterFactor: 0, penetrator: true }),
  heat: Object.freeze({ id: 'heat', label: 'HEAT', explosive: true, nominalChargeKg: 1.6, structureFactor: 0.6, craterFactor: 0.45, penetrator: true }),
  atgm: Object.freeze({ id: 'atgm', label: 'Guided anti-tank missile', explosive: true, nominalChargeKg: 3.4, structureFactor: 0.7, craterFactor: 0.5, penetrator: true }),
  he: Object.freeze({ id: 'he', label: 'HE / HE-FRAG', explosive: true, nominalChargeKg: 3.5, structureFactor: 1, craterFactor: 1, penetrator: false }),
  hesh: Object.freeze({ id: 'hesh', label: 'HESH', explosive: true, nominalChargeKg: 5.2, structureFactor: 1.6, craterFactor: 0.7, penetrator: false }),
  smoke: Object.freeze({ id: 'smoke', label: 'Smoke / WP', explosive: false, nominalChargeKg: 0, structureFactor: 0, craterFactor: 0, penetrator: false }),
  howitzer: Object.freeze({ id: 'howitzer', label: 'Howitzer HE', explosive: true, nominalChargeKg: 6.8, structureFactor: 1, craterFactor: 1.15, penetrator: false }),
  missile: Object.freeze({ id: 'missile', label: 'Guided missile (HE)', explosive: true, nominalChargeKg: 11, structureFactor: 1, craterFactor: 1, penetrator: false }),
  rocket: Object.freeze({ id: 'rocket', label: 'Rocket', explosive: true, nominalChargeKg: 8, structureFactor: 0.9, craterFactor: 0.9, penetrator: false }),
  drone_fpv: Object.freeze({ id: 'drone_fpv', label: 'FPV drone warhead', explosive: true, nominalChargeKg: 1.2, structureFactor: 0.7, craterFactor: 0.5, penetrator: true }),
  cook_off: Object.freeze({ id: 'cook_off', label: 'Ammunition cook-off', explosive: true, nominalChargeKg: 9, structureFactor: 0.8, craterFactor: 0.6, penetrator: false }),
  fuel: Object.freeze({ id: 'fuel', label: 'Fuel deflagration', explosive: true, nominalChargeKg: 4, structureFactor: 0.3, craterFactor: 0, penetrator: false }),
});

// ---- Structures ------------------------------------------------------------------------------------------------

/**
 * A structure's damage stage (DESTRUCTION.md §5). Stages only advance within a match: intact → damaged → breached →
 * collapsed. A landmark stops at `breached` (breach-only mass class); every other class collapses to rubble.
 */
export type StructureStage = 'intact' | 'damaged' | 'breached' | 'collapsed';
export const STRUCTURE_STAGES: readonly StructureStage[] = Object.freeze(['intact', 'damaged', 'breached', 'collapsed'] as const);

/** Mass class (DESTRUCTION.md §3.2): hit points, stage thresholds and whether the structure may collapse. */
export type StructureMassClass = 'shed' | 'house' | 'large' | 'landmark';

/** What dealt a blow: a detonation's blast, a penetrator's kinetic strike, a hull's ram. */
export type DestructionCause = 'blast' | 'kinetic' | 'ram';

/** Section kinds of a structure (phase P2): a wall face over one storey, or the roof. */
export type StructureSectionKind = 'wall' | 'roof';

/**
 * A structure as any world can find it: the authority's id plus the footprint that identifies it in a world laid out
 * otherwise (the mobile tier, a variant terrain), exactly as `world_prop_destroyed` carries a prop's box centre.
 * The footprint is an oriented rectangle around the collision contact band: centre (cx, cz), half extents along the
 * structure's own axes (hw across, hd along), yaw (radians about +Y), and the vertical span baseY..topY.
 */
export interface StructureIdentity {
  /** The authority's structure index: the structure group of its collision manifest, in first-seen record order. */
  structureId: number;
  massClass: StructureMassClass;
  cx: number;
  cz: number;
  hw: number;
  hd: number;
  yaw: number;
  baseY: number;
  topY: number;
}

/**
 * A structure crossed into a new stage. Solo bus `structure:stage`; wire event `structure_stage` (every viewer: a
 * building breaking is world state, it names no shooter). `collapsed` also swaps the collision (the structure's
 * records go dead, its rubble mound joins the ground) before the event is emitted.
 */
export interface StructureStageEvent extends StructureIdentity {
  stage: StructureStage;
  previous: StructureStage;
  cause: DestructionCause;
  /** The blow's munition, null for a ram. */
  munition: MunitionClass | null;
  /** Where the blow landed (the burst, the strike point, the hull's contact). */
  x: number;
  y: number;
  z: number;
  /** Horizontal unit direction the blow pushed (a collapse leans and throws debris this way). */
  dirX: number;
  dirZ: number;
  /** Structure points the crossing blow dealt (the presentation scales dust and debris by it). */
  points: number;
  /** Hit-point share left after the blow, 0..1 (0 when collapsed). */
  integrity: number;
  /** The match plays sections (P2): its holes and falls arrive as their own `structure:breach` events, so a `breached`
   * stage cuts no hole of its own. */
  sections?: boolean;
  /** State older than this viewer's view (a late joiner, a reconnect, a migration): lay it at its final pose. */
  settled?: boolean;
}

/**
 * A hole opened in a section, or a section fell (phase P2, DESTRUCTION.md §3.4). Solo bus `structure:breach`; wire event
 * `structure_breach` (every viewer). Shells and sight lines pass the opening from the event's tick on: a hole of
 * `radiusM` centred at (x, y, z) on the face whose outward normal is (nx, ny, nz) (the roof's: a vertical cylinder), or
 * — `sectionDown` — the whole section (a wall panel above its metre-high stub, the roof, a storey that dropped after
 * it). A fall carries no hole (`hole` 255, `radiusM` 0) and stands at the section's centre on its face, so the
 * presentation finds its own section there (seam.holeAt) and drops it (seam.sectionDown).
 */
export interface StructureBreachEvent extends StructureIdentity {
  /** The core's section index within the structure (DESTRUCTION.md §3.4: `storey · 4 + face` for a wall — faces 0 and 1
   * the footprint's +/− forward ends, 2 and 3 its +/− across sides — and `storeys · 4` for the roof). The kit's own
   * sections differ; the world maps a hole to its face and storey by the point. */
  section: number;
  sectionKind: StructureSectionKind;
  /** The section's height span (world y): what falls when `sectionDown`. */
  y0: number;
  y1: number;
  /** Breach slot within the section's bounded hole list (0–3; 255 for a fall). */
  hole: number;
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  /** Hole radius in metres (0 for a fall). */
  radiusM: number;
  munition: MunitionClass | null;
  /** The section fell (a roof dropping, an upper storey after it, a wall panel gone): partial collapse. */
  sectionDown: boolean;
  /** This fall completed its storey (P2): the roof and every storey above are down and so are all four of this storey's
   * faces — everything above its floor line `y0` is gone, its floor slab with it (the ground storey keeps its stubs). */
  storeyDown?: boolean;
  settled?: boolean;
}

// ---- Ground ----------------------------------------------------------------------------------------------------

/**
 * A crater stamped into the ground the simulation drives on (DESTRUCTION.md §7). Solo bus `terrain:crater`; wire
 * event `terrain_crater`. The stamp is deterministic from (x, z, radiusM, depthM, rimM, seed): every peer applies the
 * same height offset to its terrain (sim/terrainDeformation.ts craterOffsetAt), the world moves its ground mesh's
 * vertices under it in place (core, P3) and the presentation dresses the surface. A crater too small for the 1.33 m terrain lattice is presentation-only and
 * carries `deforms: false` (no sim change, nothing in the settled log).
 */
export interface TerrainCraterEvent {
  /** Index in the match's crater log (settled order); -1 for a presentation-only mark. */
  craterId: number;
  x: number;
  z: number;
  /** Rim radius in metres. */
  radiusM: number;
  /** Bowl depth at the centre in metres. */
  depthM: number;
  /** Rim lift in metres (thrown earth). */
  rimM: number;
  /** Deterministic shape seed (0..65535): the rim's raggedness and the presentation's ejecta. */
  seed: number;
  munition: MunitionClass;
  /** The terrain under the stamp moved (false: a mark on hard ground, water, a full log, or a sub-lattice crater). */
  deforms: boolean;
  settled?: boolean;
  /** A settled crater's age in seconds, when its source knows it (crater round 3: the Studio's settled fields set it per
   * crater so the presentation weathers them by age; a late joiner's restore leaves it out). */
  ageS?: number;
}

/**
 * One detonation, for the explosion's variety (solo bus `munition:blast`; over the wire the presentation derives it
 * from `shell_impact` / `shell_hit`, which now carry `munition` and `chargeKg`, and from `tank_destroyed`'s cause).
 */
export interface MunitionBlastEvent {
  munition: MunitionClass;
  /** TNT-equivalent charge of this blast in kg (0 for a non-explosive strike). */
  chargeKg: number;
  x: number;
  y: number;
  z: number;
  /** Surface normal at the burst (0, 1, 0 in the air or on flat ground). */
  nx: number;
  ny: number;
  nz: number;
  /** What it burst on. */
  surface: 'terrain' | 'water' | 'structure' | 'prop' | 'tank' | 'air';
  /** The structure it struck, when it struck one. */
  structureId?: number;
  /** The crater it dug, when it dug one that deforms the ground. */
  craterId?: number;
}

// ---- Names -----------------------------------------------------------------------------------------------------

/** Solo event-bus names (game/stateCore.ts EventBus). */
export const DESTRUCTION_BUS_EVENTS = Object.freeze({
  stage: 'structure:stage',
  breach: 'structure:breach',
  crater: 'terrain:crater',
  blast: 'munition:blast',
} as const);

/** Network event kinds (mp/wire constants EVENT_KIND_NAMES; payloads are the interfaces above without `settled`). */
export const DESTRUCTION_WIRE_EVENTS = Object.freeze({
  stage: 'structure_stage',
  breach: 'structure_breach',
  crater: 'terrain_crater',
} as const);

// ---- Rules -----------------------------------------------------------------------------------------------------

/** The ruleset's destruction block (sim/matchRuleset.ts MatchRuleset.destruction; DESTRUCTION.md §9). */
export interface DestructionRules {
  /** Buildings take damage and collapse. */
  readonly structures: boolean;
  /** Explosions deform the ground. */
  readonly craters: boolean;
  /** Structures open in sections (P2): holes and fallen walls, roofs and storeys that shells and sight lines pass. */
  readonly sections: boolean;
  /** Multiplies every structure point dealt. */
  readonly structureDamageScale: number;
  /** Multiplies crater radii. */
  readonly craterScale: number;
  /** Deforming craters per match. */
  readonly maxCraters: number;
}

// ---- Settled state ---------------------------------------------------------------------------------------------

/**
 * The destruction log: everything that changed the world's structures and ground, in authority order. It only grows
 * within a match (stages only advance, craters are never removed), so a snapshot carries it whole in a keyframe and
 * as the entries after its baseline's length in a delta, the host migration seals it in the keyframe, and a late
 * joiner lays every entry down settled. `revision` is the log's length.
 */
export type DestructionLogEntry =
  /** A stage, and the structure's footprint centre (its identity in a world laid out otherwise; absent from old logs). */
  | { readonly kind: 'stage'; readonly structureId: number; readonly stage: StructureStage; readonly cx?: number; readonly cz?: number }
  /** A hole or a section's fall (P2), and the structure's footprint centre (its identity in a world laid out otherwise). */
  | { readonly kind: 'breach'; readonly structureId: number; readonly section: number; readonly hole: number;
      readonly x: number; readonly y: number; readonly z: number; readonly radiusM: number; readonly sectionDown: boolean;
      readonly cx?: number; readonly cz?: number }
  | { readonly kind: 'crater'; readonly craterId: number; readonly x: number; readonly z: number;
      readonly radiusM: number; readonly depthM: number; readonly rimM: number; readonly seed: number };

export interface DestructionSettledState {
  /** Entries so far (the log's length): the client re-reads the state when it moves. */
  readonly revision: number;
  readonly entries: readonly DestructionLogEntry[];
}
