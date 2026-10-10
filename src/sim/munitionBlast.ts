/**
 * munitionBlast.ts — the munition blast catalog's laws (destruction core lane, 2026-10-07; docs/DESTRUCTION.md §4).
 *
 * Every shell and warhead in the game maps to one `MunitionClass` (sim/destructionEvents.ts) and a TNT-equivalent
 * charge; the laws below turn a charge and a distance into structure points (SP) on a building, a penetrator's strike
 * into SP, and a burst on the ground into a crater. The solo step and the network authority call the same functions
 * with the same inputs, so both price a blow alike; the presentation may call the classifier to choose an explosion.
 *
 * Pure and dependency-light (only the contract module): no three, no world, no damage tables. Units: kg TNT, metres.
 */
import { MUNITION_PROFILES, type MunitionBlastEvent, type MunitionClass } from './destructionEvents.ts';

/** The fields of a shell spec the classifier reads (sim/shellSpec.ts ShellSpec and every authored round satisfy it). */
export interface MunitionShellLike {
  readonly type: string;
  readonly caliberMm: number;
  readonly name?: unknown;
  readonly guided?: unknown;
  readonly tracer?: unknown;
  readonly blastRadiusM?: unknown;
  readonly launcherTubes?: unknown;
  readonly pen100Mm?: unknown;
}

const finiteOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** Kinetic rounds under this calibre are small arms (roof machine guns). */
const SMALL_ARMS_MAX_MM = 15;
/** Rounds under this calibre are autocannon rounds (IFV cannons, the gunship's 30 mm). */
const AUTOCANNON_MAX_MM = 57;
/** Unguided HE at or above this calibre is howitzer HE. */
const HOWITZER_MIN_MM = 150;
/** An explicit blast envelope (the gunship's warheads) converts to a charge as (R / this)^3: 22 m → 20 kg. */
const BLAST_RADIUS_PER_CBRT_KG = 8.1;
/** One rocket's charge is capped (DESTRUCTION.md §4.1): a TOS-1A salvo brings down a block, not a district. */
const ROCKET_MAX_CHARGE_KG = 8;
const DRONE_CHARGE_KG = 1.2;
/** A burning hull's fuel deflagration. */
export const FUEL_CHARGE_KG = 4;

const HESH_NAME = /\bHESH\b/i;
const SMOKE_NAME = /\bsmoke\b|\bWP\b/i;
/** Explosive autocannon rounds the fleet types 'AP' and names (M789 HEDP), and HE-I / HEI-T. */
const HE_NAMED_KINETIC = /\bHEDP\b|\bHE-?I(?:-T)?\b|\bHEI\b/i;

function caliberOf(spec: MunitionShellLike): number {
  const caliber = Number(spec.caliberMm);
  return Number.isFinite(caliber) && caliber > 0 ? caliber : 0;
}

/**
 * The class of a shell or warhead (DESTRUCTION.md §4.1). The fleet types HESH and smoke rounds 'HE' and names them,
 * so the name is read for those; an unguided round fired from launcher tubes is a rocket; the FPV warhead carries the
 * DRONE tracer.
 */
export function munitionClassForShell(spec: MunitionShellLike): MunitionClass {
  if (spec.tracer === 'DRONE') return 'drone_fpv';
  const name = typeof spec.name === 'string' ? spec.name : '';
  const caliber = caliberOf(spec);
  switch (spec.type) {
    case 'AP':
    case 'APCR':
    case 'APFSDS':
      if (caliber < SMALL_ARMS_MAX_MM) return 'small_arms';
      if (caliber < AUTOCANNON_MAX_MM) return HE_NAMED_KINETIC.test(name) ? 'autocannon_he' : 'autocannon_ap';
      return 'kinetic';
    case 'HEAT':
      return spec.guided === true ? 'atgm' : 'heat';
    case 'HESH':
      return 'hesh';
    case 'HE':
      if (SMOKE_NAME.test(name)) return 'smoke';
      if (HESH_NAME.test(name)) return 'hesh';
      if (spec.guided === true) return 'missile';
      if ((finiteOrNull(spec.launcherTubes) ?? 0) > 0) return 'rocket';
      if (caliber < AUTOCANNON_MAX_MM) return 'autocannon_he';
      if (caliber >= HOWITZER_MIN_MM || finiteOrNull(spec.blastRadiusM) !== null) return 'howitzer';
      return 'he';
    default:
      return 'kinetic';
  }
}

/** The charge an explicit blast envelope stands for (damage.ts shellBlastRadiusM clamps the envelope to 1..40 m). */
function envelopeChargeKg(radiusM: number): number {
  const radius = Math.max(1, Math.min(40, radiusM));
  const root = radius / BLAST_RADIUS_PER_CBRT_KG;
  return root * root * root;
}

/** TNT-equivalent charge of a shell in kg (DESTRUCTION.md §4.1); 0 for kinetic, small-arms and smoke rounds. */
export function munitionChargeKg(spec: MunitionShellLike, munition: MunitionClass = munitionClassForShell(spec)): number {
  const c = caliberOf(spec) / 100;
  const c3 = c * c * c;
  const radius = finiteOrNull(spec.blastRadiusM);
  const envelope = radius !== null ? envelopeChargeKg(radius) : null;
  switch (munition) {
    case 'autocannon_he':
    case 'he':
      return 1.8 * c3;
    case 'heat':
      return 1.35 * c3;
    case 'atgm':
      return 0.98 * c3;
    case 'hesh':
      return 3.0 * c3;
    case 'howitzer':
      return envelope ?? 1.95 * c3;
    case 'missile':
      return envelope ?? 1.8 * c3;
    case 'rocket':
      return Math.min(ROCKET_MAX_CHARGE_KG, 1.8 * c3);
    case 'drone_fpv':
      return DRONE_CHARGE_KG;
    case 'fuel':
      return FUEL_CHARGE_KG;
    default:
      return 0;
  }
}

/** A destroyed hull's ammunition detonating (ammo-rack kill): 0.15 kg a tonne, 3–12 kg. */
export function cookOffChargeKg(massTons: number): number {
  const tons = Number.isFinite(massTons) && massTons > 0 ? massTons : 40;
  return Math.max(3, Math.min(12, 0.15 * tons));
}

// ---- Blast on structures (§4.2) --------------------------------------------------------------------------------

/** Structure points a kilogram of TNT deals at contact. */
export const BLAST_POINTS_PER_KG = 3.5;
/** Scaled distance (m/kg^⅓) inside which the blast acts at full strength, and past which it does nothing. */
const BLAST_CONTACT_Z = 0.6;
const BLAST_LIMIT_Z = 6;
const BLAST_FALLOFF_EXPONENT = 2.2;

/** How far a charge can still damage a structure (m): `6 · W^⅓`, 0 for no charge. */
export function blastReachM(chargeKg: number): number {
  return chargeKg > 0 ? BLAST_LIMIT_Z * Math.cbrt(chargeKg) : 0;
}

/** The blast law's falloff at scaled distance Z (m/kg^⅓): 1 at contact, (0.6 / Z)^2.2 beyond, 0 past Z = 6. */
export function blastFalloff(scaledDistance: number): number {
  if (!(scaledDistance > BLAST_CONTACT_Z)) return 1;
  if (scaledDistance > BLAST_LIMIT_Z) return 0;
  return Math.pow(BLAST_CONTACT_Z / scaledDistance, BLAST_FALLOFF_EXPONENT);
}

/**
 * Structure points a burst of `chargeKg` deals to a structure whose nearest surface lies `distanceM` from it
 * (before the ruleset's structure damage scale): `3.5 · W · structureFactor · g(d / W^⅓)`.
 */
export function structureBlastPoints(chargeKg: number, munition: MunitionClass, distanceM: number): number {
  if (!(chargeKg > 0)) return 0;
  const factor = MUNITION_PROFILES[munition].structureFactor;
  if (!(factor > 0)) return 0;
  const distance = Math.max(0, Number.isFinite(distanceM) ? distanceM : Infinity);
  return BLAST_POINTS_PER_KG * chargeKg * factor * blastFalloff(distance / Math.cbrt(chargeKg));
}

/** Light props a blast fells (§6): trees, fences, crates and huts within 1.2 · W^⅓ of a burst of 2 kg or more. */
export const PROP_FELL_MIN_CHARGE_KG = 2;
/** At most this many props fall to one blast, and to all of a tick's blasts together (the wire's event budget, §8.5:
 * one EVENT message per viewer per tick, dropped whole above 64 events). */
export const PROP_FELL_PER_BLAST = 6;
export const PROP_FELL_PER_TICK = 12;
export function propFellRadiusM(chargeKg: number): number {
  return chargeKg >= PROP_FELL_MIN_CHARGE_KG ? 1.2 * Math.cbrt(chargeKg) : 0;
}

// ---- Penetrators (§4.3) ----------------------------------------------------------------------------------------

/** Structure points a penetrator's strike deals (kinetic rods, AP shot, shaped-charge jets): 0.004 · pen · cal/100. */
export function kineticStructurePoints(spec: MunitionShellLike, munition: MunitionClass = munitionClassForShell(spec)): number {
  if (!MUNITION_PROFILES[munition].penetrator) return 0;
  const pen = finiteOrNull(spec.pen100Mm) ?? 0;
  if (!(pen > 0)) return 0;
  return 0.004 * pen * (caliberOf(spec) / 100);
}

/** The hole a penetrator punches in a wall (P2): 0.0035 · calibre m (120 mm: 0.42 m). */
export function penetratorHoleRadiusM(spec: MunitionShellLike): number {
  return 0.0035 * caliberOf(spec);
}

// ---- Craters (§4.5) --------------------------------------------------------------------------------------------

const CRATER_RADIUS_PER_CBRT_KG = 1.1;
export const CRATER_MAX_RADIUS_M = 6;
/** Craters smaller than this (1.2 cells of the 1.333 m terrain lattice) are marks: they never move the ground. */
export const CRATER_DEFORM_MIN_RADIUS_M = 1.6;
/**
 * A crater's form (crater round 3, 2026-10-08; wave 276 found no rim from the player's eye height, and a bowl alone
 * never reads from 1.5–3 m): its depth and its thrown rim as shares of its radius. HE digs a 0.35 R bowl under a 0.24 R
 * rim (125 mm: 0.58 m deep, a 0.4 m rim); the rest by munition below (a 152 mm howitzer shell 0.96 m deep under a
 * 0.62 m rim). The rim's height is broken round the crater by its seed (terrainDeformation.ts craterProfile: 0.55–1.45
 * of it). Shaped charges (HEAT, ATGM, FPV) never reach CRATER_DEFORM_MIN_RADIUS_M: they leave marks, not bowls.
 */
const CRATER_DEPTH_PER_RADIUS = 0.35;
const CRATER_RIM_PER_RADIUS = 0.24;
/** [depth, rim] per radius where a munition's crater differs from HE's: a howitzer shell's deep bowl and high thrown
 * rim, a missile warhead's close to it, a rocket's shallower scoop, a cook-off's low heap, a 30–40 mm round's dimple. */
const CRATER_FORM: Readonly<Partial<Record<MunitionClass, readonly [number, number]>>> = Object.freeze({
  howitzer: Object.freeze([0.4, 0.26] as const),
  missile: Object.freeze([0.38, 0.25] as const),
  rocket: Object.freeze([0.3, 0.22] as const),
  cook_off: Object.freeze([0.25, 0.16] as const),
  autocannon_he: Object.freeze([0.3, 0.18] as const),
});

export interface CraterShape {
  radiusM: number;
  depthM: number;
  rimM: number;
}

/**
 * The crater a burst digs (before the ground decides: hard ground halves the depth, water and decks take none):
 * `R = 1.1 · W^⅓ · craterFactor · craterScale` (≤ 6 m), depth 0.35 R and rim 0.24 R for HE, by munition otherwise
 * (CRATER_FORM). Writes `out` and returns it.
 */
export function craterFor(chargeKg: number, munition: MunitionClass, craterScale: number, out: CraterShape): CraterShape {
  const factor = MUNITION_PROFILES[munition].craterFactor;
  const scale = Number.isFinite(craterScale) && craterScale > 0 ? craterScale : 0;
  const radius = chargeKg > 0 && factor > 0 && scale > 0
    ? Math.min(CRATER_MAX_RADIUS_M, CRATER_RADIUS_PER_CBRT_KG * Math.cbrt(chargeKg) * factor * scale) : 0;
  const form = CRATER_FORM[munition];
  out.radiusM = radius;
  out.depthM = radius * (form ? form[0] : CRATER_DEPTH_PER_RADIUS);
  out.rimM = radius * (form ? form[1] : CRATER_RIM_PER_RADIUS);
  return out;
}

// ---- The blast event (§11) ---------------------------------------------------------------------------------------

/**
 * The `munition:blast` a round's detonation makes at (x, y, z) with surface normal (nx, ny, nz), or null for a round that
 * does not detonate (kinetic, small arms, smoke). `structureId` names the structure it struck, when it struck one.
 */
export function munitionBlastEventFor(spec: MunitionShellLike, x: number, y: number, z: number, nx: number, ny: number,
  nz: number, surface: MunitionBlastEvent['surface'], structureId?: number | null, craterId?: number | null): MunitionBlastEvent | null {
  const munition = munitionClassForShell(spec);
  const chargeKg = munitionChargeKg(spec, munition);
  if (!(chargeKg > 0)) return null;
  return { munition, chargeKg, x, y, z, nx, ny, nz, surface,
    ...(typeof structureId === 'number' && Number.isSafeInteger(structureId) ? { structureId } : {}),
    ...(typeof craterId === 'number' && Number.isSafeInteger(craterId) ? { craterId } : {}) };
}
