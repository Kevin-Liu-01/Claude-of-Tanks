/**
 * What destruction sounds like, from the recorded catalog only (destruction-fx lane, 2026-10-07; the owner's rule:
 * recorded audio, no synthesized stand-ins). Pure data and two small functions, DOM-free; the engine plays the layers.
 *
 * - A round ending on the ground explodes by its munition class (sim/destructionEvents.ts): an explosive class plays
 *   the HE bank sized by its charge (the gunship's 20 kg howitzer shell the large bank, a 30 mm HE round the small one),
 *   a kinetic round or a bullet only the ground it struck. Until this, an HE shell landing on open ground played only
 *   the dirt thud of an AP round.
 * - A structure crossing a stage (structure:stage) plays its masonry breaking, a breach the wall giving way and its
 *   rubble, a collapse the building coming down, its rubble settling and the dirt raining back.
 */
import { MUNITION_PROFILES, type MunitionClass, type StructureStage } from '../sim/destructionEvents.ts';

/** One sound of a recipe (the shape propSounds.ts uses). */
interface DestructionSoundLayer {
  readonly id: string;
  readonly delayS: number;
  readonly jitterS: number;
  readonly gainDb: number;
}
const layer = (id: string, delayS = 0, gainDb = 0, jitterS = 0): DestructionSoundLayer =>
  Object.freeze({ id, delayS, jitterS, gainDb });

/** Whether a class detonates (the HE bank), or only strikes (the ground's own thud). */
export function munitionExplodes(munition: MunitionClass | null | undefined): boolean {
  return !!munition && MUNITION_PROFILES[munition].explosive;
}

/**
 * The calibre the HE bank is chosen and pitched by (audioEngine explosion: 140 mm and up the large bank, 61 mm and up
 * the medium): the gun calibre whose HE shell carries this charge (1.8 kg at 100 mm, scaling with the cube).
 */
export function blastSoundCaliberMm(chargeKg: number): number {
  if (!(chargeKg > 0)) return 0;
  return 100 * Math.cbrt(chargeKg / 1.8);
}

/** The class of a round from its published type and calibre when the event carries no class (the solo step's). */
export function munitionFromType(shellType: string | undefined, caliberMm: number): MunitionClass | null {
  if (!shellType) return null;
  if (shellType === 'HE' || shellType === 'HESH') return caliberMm < 57 ? 'autocannon_he' : 'he';
  if (shellType === 'HEAT') return 'heat';
  if (shellType === 'AP' || shellType === 'APCR' || shellType === 'APFSDS') {
    return caliberMm < 15 ? 'small_arms' : caliberMm < 57 ? 'autocannon_ap' : 'kinetic';
  }
  return null;
}

const STAGE_SOUNDS: Readonly<Record<StructureStage, readonly DestructionSoundLayer[]>> = Object.freeze({
  intact: Object.freeze([]),
  // a damaged building loses its glass (the seam's damaged stage hides it): the windows go with the wall's crack
  damaged: Object.freeze([layer('wall_brick', 0, -6, 0.04), layer('glass_shatter', 0.06, -9, 0.05)]),
  breached: Object.freeze([layer('wall_brick', 0, -2), layer('rubble_crunch', 0.25, -4, 0.1), layer('glass_shatter', 0.1, -13, 0.08)]),
  collapsed: Object.freeze([
    layer('building_collapse', 0, 0),
    layer('rubble_crunch', 0.7, -3, 0.2),
    layer('debris_dirt', 1.3, -6, 0.3),
  ]),
});

/** The layers a structure plays when it crosses into `stage` (settled stages play nothing: the engine skips them). */
export function structureStageSounds(stage: StructureStage): readonly DestructionSoundLayer[] {
  return STAGE_SOUNDS[stage] ?? STAGE_SOUNDS.intact;
}

/** Every recorded id these recipes play (the engine preloads them with the battle). */
export const DESTRUCTION_SOUND_IDS: readonly string[] = Object.freeze(
  [...new Set(Object.values(STAGE_SOUNDS).flat().map((l) => l.id))].sort(),
);
