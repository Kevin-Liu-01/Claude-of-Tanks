/**
 * The camouflage paint's spotting bonus (camo_spotting r3, WoT's rule; 268: one rule for both drivers): a hull's paint
 * earns CAMO_PAINT_BONUS, spotting's paint term, on a map whose biome it belongs to, by its season or as one of the biome's own
 * pool. AUTO always earns it (it resolves to a member of the map's pool); factory paint earns it when the vehicle's stock
 * scheme does. The tables are the vehicles' paint tables (src/vehicles/materials.ts paints AUTO from the pools); the solo
 * battle stamps each hull's bonus from the player's saved scheme, the match actor from each seat's chosen scheme (the
 * room's camo), so a seat's paint earns the same on either driver.
 */
/** A biome-matched paint's camouflage bonus (+3.5 %, camo_spotting r3), spotting's paint term (sim/spotting.ts). */
export const CAMO_PAINT_BONUS = 0.035;

/**
 * Each biome's pool of matching schemes (camo r2): AUTO picks a member per vehicle, and every member belongs on its biome
 * field (the coastal pool stays green-family: a parade of grey-blue AUTO bots on grass would defeat biome matching). A
 * map that names no biome here is verdant.
 */
export const CAMO_BIOME_POOLS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  verdant: ['summer', 'flecktarn', 'amoeba', 'dpm', 'tigerstripe', 'merdc'],
  desert: ['desert', 'chocchip', 'digitaldesert', 'pinkdesert'],
  winter: ['winter', 'washworn', 'winterbands', 'merdcwinter'],
  urban: ['urban', 'urbanblock', 'berlin'],
  autumn: ['autumn', 'oakleaf'],
  coastal: ['summer', 'dpm', 'merdc'],
  steppe: ['desert', 'digitaldesert', 'chocchip'],
  railyard: ['urban', 'urbanblock', 'berlin'],
  moon: ['urban', 'urbanblock'],
  cliffbridge: ['summer', 'flecktarn', 'dpm'],
});

/**
 * The biomes each scheme belongs to (camo r8: a scheme joins the family its palette belongs to, so a hand-picked MERDC
 * earns on grass like summer does). Style-only schemes (digital, dazzle, splinter, ambushdot, hexfield, midnight) never
 * qualify.
 */
export const CAMO_PATTERN_SEASONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  summer: ['verdant', 'coastal'], merdc: ['verdant', 'coastal'], tropic: ['verdant'],
  desert: ['desert', 'steppe'], pinkdesert: ['desert', 'steppe'],
  winter: ['winter'], washworn: ['winter'],
  urban: ['urban', 'railyard'], urbanblock: ['urban', 'railyard'],
  autumn: ['autumn'], naval: ['coastal'],
  flecktarn: ['verdant'], amoeba: ['verdant'], dpm: ['verdant', 'coastal'],
  tigerstripe: ['verdant'], m90: ['verdant'],
  chocchip: ['desert', 'steppe'], digitaldesert: ['desert', 'steppe'],
  merdcwinter: ['winter'], winterbands: ['winter'],
  berlin: ['urban', 'railyard'], oakleaf: ['autumn'],
});

/** A map's camouflage biome: its id where the pools name it, else verdant. */
export function camoBiome(mapId: string): string {
  return Object.prototype.hasOwnProperty.call(CAMO_BIOME_POOLS, mapId) ? mapId : 'verdant';
}

/** Whether a concrete scheme belongs on a map's biome: by its season, or as a member of the biome's pool. */
export function camoPaintFits(pattern: string, mapId: string): boolean {
  if (!pattern || pattern === 'factory') return false;
  const biome = camoBiome(mapId);
  return (CAMO_PATTERN_SEASONS[pattern] ?? []).includes(biome) || (CAMO_BIOME_POOLS[biome] ?? []).includes(pattern);
}

/**
 * A chosen scheme's spotting bonus on a map: 'auto' always, 'factory' when the vehicle's stock scheme (`stockPattern`)
 * fits, any other scheme when it fits; an unknown id earns nothing.
 */
export function camoSelectionBonus(selection: string | null | undefined, stockPattern: string | null | undefined, mapId: string): number {
  if (selection === 'auto') return CAMO_PAINT_BONUS;
  const pattern = !selection || selection === 'factory' ? stockPattern ?? 'factory' : selection;
  return camoPaintFits(pattern, mapId) ? CAMO_PAINT_BONUS : 0;
}
