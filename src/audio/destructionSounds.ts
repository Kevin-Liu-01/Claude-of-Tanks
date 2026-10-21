/**
 * What destruction sounds like, from the recorded catalog only (destruction-fx lane, 2026-10-07; the owner's rule:
 * recorded audio, no synthesized stand-ins). Pure data and two small functions, DOM-free; the engine plays the layers.
 *
 * - A round ending on the ground explodes by its munition class (sim/destructionEvents.ts): an explosive class plays
 *   the HE bank sized by its charge (the gunship's 20 kg howitzer shell the large bank, a 30 mm HE round the small one),
 *   a kinetic round or a bullet only the ground it struck. Until this, an HE shell landing on open ground played only
 *   the dirt thud of an AP round.
 * - A structure crossing a stage (structure:stage) plays its walls breaking, a breach the wall giving way and its
 *   rubble, a collapse the building coming down, its rubble settling and the dirt raining back — by what the walls are
 *   made of (brick, stone, timber, concrete, plaster or adobe, sheet steel; 2026-10-13), with a distant recording past
 *   a few hundred metres. A section falling inside a standing building (structure:breach) plays the roof caving in, a
 *   storey dropping or a wall panel going.
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

/**
 * What a building's walls sound like when they break (the audio stream's destruction round, 2026-10-13): the dominant
 * wall material of its anatomy (the world's `structureDamage(id).anatomy.rubble` shares, the same the fx dust and
 * debris are coloured by). Until this every building broke as brick: a timber barn, an adobe ksar, a concrete block
 * and a stone church alike.
 */
type StructureSoundMaterial = 'brick' | 'stone' | 'timber' | 'concrete' | 'plaster' | 'steel';
export const STRUCTURE_SOUND_MATERIALS: readonly StructureSoundMaterial[] = Object.freeze(['brick', 'stone', 'timber', 'concrete', 'plaster', 'steel']);

/** A fracture material (fx/structureFx.ts FRACTURE_BASE) as its walls sound; roofing, glass and canvas are not walls. */
const WALL_SOUND: Readonly<Record<string, StructureSoundMaterial>> = Object.freeze({
  brick: 'brick', stone: 'stone', rubble: 'stone', concrete: 'concrete', adobe: 'plaster', plaster: 'plaster', infill: 'plaster',
  earth: 'plaster', timber: 'timber', plank: 'timber', metal: 'steel',
});

/** The anatomy's rubble as the audio reads it (world/destructionKit.ts StructureDamageAnatomy['rubble']). */
export interface RubbleShareLike { readonly material: string; readonly share: number }

/** How a structure sounds: its walls' material, and whether it has enough glass to throw a cascade of it. */
export interface StructureSound { readonly material: StructureSoundMaterial; readonly glassy: boolean }

/**
 * A structure's sound from its anatomy's rubble shares: the wall material with the largest share, else (no anatomy: a
 * world without the seam, a late world) what its mass class is built of on any map (sheds timber, the rest masonry).
 */
export function structureSoundOf(rubble: readonly RubbleShareLike[] | null | undefined, massClass?: string | null): StructureSound {
  const shares = new Map<StructureSoundMaterial, number>();
  let glass = 0;
  for (const r of rubble ?? []) {
    if (!(r.share > 0)) continue;
    if (r.material === 'glass') { glass += r.share; continue; }
    const m = WALL_SOUND[r.material];
    if (m) shares.set(m, (shares.get(m) ?? 0) + r.share);
  }
  let material: StructureSoundMaterial | null = null;
  let best = 0;
  for (const m of STRUCTURE_SOUND_MATERIALS) {
    const v = shares.get(m) ?? 0;
    if (v > best) { best = v; material = m; }
  }
  return Object.freeze({ material: material ?? (massClass === 'shed' ? 'timber' : 'brick'), glassy: glass >= 0.05 });
}

const WALL_BREAK: Readonly<Record<StructureSoundMaterial, string>> = Object.freeze({
  brick: 'wall_break_brick', stone: 'wall_break_stone', timber: 'wall_break_timber', concrete: 'wall_break_concrete',
  plaster: 'wall_break_plaster', steel: 'wall_break_steel',
});
const COLLAPSE: Readonly<Record<StructureSoundMaterial, string>> = Object.freeze({
  brick: 'collapse_brick', stone: 'collapse_stone', timber: 'collapse_timber', concrete: 'collapse_concrete',
  plaster: 'collapse_plaster', steel: 'collapse_steel',
});
/** What a round through the wall sounds like (shell:expired on a structure). */
const SHELL_HIT: Readonly<Record<StructureSoundMaterial, string>> = Object.freeze({
  brick: 'shell_hit_masonry', stone: 'shell_hit_masonry', timber: 'ground_wood', concrete: 'ground_concrete',
  plaster: 'shell_hit_adobe', steel: 'ground_metal',
});
/** The heavy pieces after a fall: masonry thuds onto the heap; timber and steel come down as their own debris. */
const AFTER_FALL: Readonly<Record<StructureSoundMaterial, string>> = Object.freeze({
  brick: 'rubble_chunk_land', stone: 'rubble_chunk_land', concrete: 'rubble_chunk_land', plaster: 'debris_dirt',
  timber: 'crate_break', steel: 'debris_metal',
});

/** Distant recordings for the big events, crossfaded in by range (the armour hits' law, stretched: a building is big). */
export const STRUCTURE_FAR = Object.freeze({
  breach: 'wall_break_far', collapse: 'collapse_far', hit: 'impact_far_building',
  /** The close layers fade out across these ranges (m)… */
  closeFadeM: Object.freeze([320, 820]) as readonly [number, number],
  /** …while the distant recording fades in across these. */
  farFadeM: Object.freeze([180, 560]) as readonly [number, number],
});

/** The layers a structure plays when it crosses into `stage` (settled stages play nothing: the engine skips them). */
export function structureStageSounds(stage: StructureStage, sound: StructureSound = structureSoundOf(null)): readonly DestructionSoundLayer[] {
  const m = sound.material;
  if (stage === 'intact') return [];
  // a damaged building loses its glass (the seam's damaged stage hides it): the windows go with the wall's crack
  if (stage === 'damaged') return [layer(WALL_BREAK[m], 0, -6, 0.04), layer(sound.glassy ? 'glass_cascade' : 'glass_shatter', 0.06, -9, 0.05)];
  if (stage === 'breached') {
    return [layer(WALL_BREAK[m], 0, -1), layer(AFTER_FALL[m], 0.3, -6, 0.12),
      layer(sound.glassy ? 'glass_cascade' : 'glass_shatter', 0.1, sound.glassy ? -10 : -13, 0.08)];
  }
  // the building coming down, its heavy pieces landing on the heap, the dirt raining back
  return [layer(COLLAPSE[m], 0, 0), layer(AFTER_FALL[m], 1.0, -4, 0.35), layer('debris_dirt', 1.6, -8, 0.3)];
}

/**
 * A section falling inside a standing building (structure:breach with `sectionDown`): the roof caving in, a storey
 * dropping onto the one below, a wall panel going.
 */
export function sectionFallSounds(kind: 'wall' | 'roof', storeyDown: boolean, sound: StructureSound = structureSoundOf(null)): readonly DestructionSoundLayer[] {
  const m = sound.material;
  if (storeyDown) return [layer('floor_fall', 0, 0, 0.05), layer(AFTER_FALL[m], 0.45, -5, 0.2)];
  if (kind === 'roof') return m === 'steel' ? [layer('collapse_steel', 0, -5)] : [layer('roof_fall', 0, -1, 0.05)];
  return [layer(WALL_BREAK[m], 0, -3, 0.05), layer(AFTER_FALL[m], 0.3, -7, 0.15)];
}

/** A round through a structure's wall, by its material. */
export function structureHitAsset(sound: StructureSound = structureSoundOf(null)): string {
  return SHELL_HIT[sound.material];
}

/** Every recorded id these recipes play (the engine preloads them with the battle). */
export const DESTRUCTION_SOUND_IDS: readonly string[] = Object.freeze([...new Set([
  ...Object.values(WALL_BREAK), ...Object.values(COLLAPSE), ...Object.values(SHELL_HIT), ...Object.values(AFTER_FALL),
  'glass_shatter', 'glass_cascade', 'debris_dirt', 'floor_fall', 'roof_fall', 'blast_masonry',
  STRUCTURE_FAR.breach, STRUCTURE_FAR.collapse, STRUCTURE_FAR.hit,
])].sort());
