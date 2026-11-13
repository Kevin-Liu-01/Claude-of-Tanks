/**
 * The camouflage paint's spotting bonus (camo_spotting r3, WoT's rule; 268: one rule for both drivers): a hull's paint
 * earns CAMO_PAINT_BONUS, spotting's paint term, on a map whose biome it belongs to, by its season or as one of the biome's own
 * pool. AUTO always earns it (it resolves to a member of the map's pool); factory paint earns it when the vehicle's stock
 * scheme does. The tables are the vehicles' paint tables: src/vehicles/materials.ts keeps its copy (BIOME_PATTERN,
 * PATTERN_SEASON), held row for row to these by src/vehicles/camoPolicy.selftest.mjs, until a release that moves the
 * fleet core anyway folds it onto this module (item/camo-fold-268; folding re-keys every tank and map). The solo battle
 * stamps each hull's bonus from the player's saved scheme, the match actor from each seat's chosen scheme (the room's
 * camo), so a seat's paint earns the same on either driver.
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

/** A bot's paint: AUTO (a member of its map's pool) where the match rolls it, else its stock scheme. */
export type BotCamo = 'auto' | 'factory';

/** The share of a battle's bots that wear AUTO (camo_spotting r5: so a field is not all factory paint). */
const BOT_AUTO_SHARE = 0.6;

/**
 * A bot's paint (268, Main item 6: one bot paint rule for both drivers), rolled from the match seed and the bot's roster
 * index as its other streams are (game/botConstruction.ts botSeeds); on the winter and desert maps every bot wears AUTO,
 * where a factory scheme reads wrong. The authority rolls it (sim/authoritativeMatch.ts) and the roster carries it
 * (the WELCOME's flags bit 2), so a client paints what the authority scores; the solo battle rolls the same for a random
 * roster (game/rosterState.ts).
 */
export function botCamoRoll(matchSeed: number, index: number, mapId: string): BotCamo {
  if (mapId === 'winter' || mapId === 'desert') return 'auto';
  // mulberry32's first draw (game/ai.ts) on the bot's own seed: this leaf imports nothing
  let a = (matchSeed + 47000 + index * 977) | 0;
  a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296 < BOT_AUTO_SHARE ? 'auto' : 'factory';
}

/**
 * Every bot's paint in a planned match (round 8 Y1 s4-06): the one roll-index rule. A bot's roster index is the number of
 * seated hulls (every seat but a spectator's) plus its place among the bots, in plan order: the match actor seats those
 * first, then the bots (server/match/matchActor.ts), and the authority rolls each at its index (sim/authoritativeMatch.ts
 * botCamoRoll(seed, entities.length, mapId)). A bot that already carries its paint (a resumed roster's) keeps it. The
 * match actor stamps each bot's paint from it, and a client's guess before the WELCOME (mp/session/browserComposition.ts,
 * its roster prebuild) reads the same rule, so the guess cannot drift from the roll.
 */
export function planBotPaints(seats: readonly { readonly team: string }[], bots: readonly { readonly camo?: string | null }[],
  matchSeed: number, mapId: string): BotCamo[] {
  let index = 0;
  for (const seat of seats) if (seat.team !== 'spectator') index++;
  return bots.map((bot, ordinal) => (bot.camo === 'auto' || bot.camo === 'factory' ? bot.camo : botCamoRoll(matchSeed, index + ordinal, mapId)));
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
