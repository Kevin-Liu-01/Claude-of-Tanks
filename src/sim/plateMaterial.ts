// What a round struck on a vehicle, for the impact's presentation (impact-materials-269): the material of the plate a
// hit event names (HitEvent.material) and of the outer screen the round passed before it (HitEvent.screenMaterial).
// The audio's impact resolver (audio/impactMaterials.ts) plays every layer from it, so a ricochet off a rubber skirt or
// a track no longer rings like sloped steel.
//
// Presentation only: read from the plate's own data after the damage law has decided, it changes no outcome and draws
// nothing from the combat RNG. Pure numbers, Node-runnable.
//
// The armour models carry no material field, so the class comes from what they do carry, in this order:
//   era              the plate's kind
//   trackLinks       a plate linked to a track module; roadWheel where the strike lies on the band's side, between its
//   roadWheel        top and bottom runs (the wheels behind the links)
//   armour           a main plate
//   thinSteel        a screen linked to any other module: launcher boxes and weapon housings
//   rubberSkirt      a screen named rubber, or a skirt under 10 mm (the fleet's 8 mm skirts are rubber-fabric)
//   cage             a screen that intercepts drones, or one named a cage, slat or lattice
//   stowage          a bustle rack, basket, bin or stowage screen
//   armour           every other screen 30 mm or thicker: armoured skirts, wedges, appliqué armour
//   thinSteel        every other screen: steel skirts, side screens, appliqué sheet, dozer blades
// `wreck` is no plate's: a round on a destroyed hull strikes its wreck whatever plate it meets (damage.ts resolveWreckHit).

import type { ArmorPlate } from './armor.ts';

export const PLATE_MATERIALS = ['armour', 'thinSteel', 'rubberSkirt', 'trackLinks', 'roadWheel', 'era', 'cage', 'stowage', 'wreck'] as const;
export type PlateMaterial = typeof PLATE_MATERIALS[number];

/** A skirt thinner than this is rubber-fabric (the fleet's T-72, T-80, ZTZ-99 and Leopard rear skirts are 8 mm). */
export const RUBBER_SKIRT_MAX_MM = 10;
/** A screen this thick is armour (Leopard 2A5 wedges at 90 mm, Leclerc and Type 10 skirts at 60 mm), not sheet steel. */
export const SPACED_ARMOUR_MIN_MM = 30;

type PlateFacts = Pick<ArmorPlate, 'name' | 'kind' | 'physicalMm'> & Partial<Pick<ArmorPlate, 'moduleLink' | 'droneInterception'>>;

/**
 * Where on a track the strike lies, in the hull frame: its height and the outward normal's lateral part, with the
 * running gear's lowest and highest points there. The band's side between its runs is the road wheels.
 */
export interface TrackStrike {
  y: number;
  normalX: number;
  yMin: number;
  yMax: number;
}

/** The strike lies on the wheels: the band's side, above its bottom run and below its top run. */
export function strikesRoadWheel(strike: TrackStrike | null | undefined): boolean {
  if (!strike) return false;
  const height = strike.yMax - strike.yMin;
  if (!(height > 0.3) || Math.abs(strike.normalX) < 0.7) return false;
  const bottomRun = Math.max(0.15, 0.2 * height);
  const topRun = Math.max(0.12, 0.15 * height);
  return strike.y > strike.yMin + bottomRun && strike.y < strike.yMax - topRun;
}

export function plateMaterial(plate: PlateFacts, track: TrackStrike | null = null): PlateMaterial {
  if (plate.kind === 'era') return 'era';
  const link = plate.moduleLink ?? null;
  if (link === 'trackL' || link === 'trackR') return strikesRoadWheel(track) ? 'roadWheel' : 'trackLinks';
  if (plate.kind === 'main') return 'armour';
  if (link) return 'thinSteel';
  const name = plate.name.toLowerCase();
  if (name.includes('rubber')) return 'rubberSkirt';
  if ((plate.droneInterception ?? 0) > 0 || /cage|slat|lattice/.test(name)) return 'cage';
  if (/(?:^|_)(?:rack|bustle|basket|stowage)|(?:^|_)bin(?:_|$)/.test(name)) return 'stowage';
  if (name.includes('skirt') && plate.physicalMm < RUBBER_SKIRT_MAX_MM) return 'rubberSkirt';
  return plate.physicalMm >= SPACED_ARMOUR_MIN_MM ? 'armour' : 'thinSteel';
}
