/** Match-scoped presentation only. Never advances the simulation RNG, changes
 * spotting/traction, or schedules frames. Select once from the authoritative
 * battle seed. Only day/night varies; authored map atmosphere stays intact.
 * Biome is an explicit shared map-authoring input, not inferred from its name.
 */
export const BATTLE_WEATHER_VERSION = 2;

export type BattleWeatherBiome = 'temperate' | 'arid' | 'tropical' | 'cold' | 'coastal';
export type BattleWeatherCondition = 'clear';
export type BattleTimeOfDay = 'day' | 'night';

export interface BattleWeather {
  readonly version: typeof BATTLE_WEATHER_VERSION;
  /** Same uint32 normalization as the combat RNG. */
  readonly seed: number;
  readonly biome: BattleWeatherBiome;
  readonly condition: BattleWeatherCondition;
  readonly timeOfDay: BattleTimeOfDay;
  /** Legacy receipt fields remain explicit and neutral; there are no particles. */
  readonly precipitationIntensity: 0;
  readonly cloudOpacityMultiplier: 1;
  readonly fogDensityMultiplier: 1;
}

const BIOMES: Readonly<Record<BattleWeatherBiome, true>> = Object.freeze({
  temperate: true, arid: true, tropical: true, cold: true, coastal: true,
});

// Preserve the version-1 day/night hash, salt and threshold exactly. Removing
// the independent precipitation domain must not re-key any existing match.
function weatherHash(seed: number, salt: number): number {
  let value = (seed ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

/** Fixed atmosphere for one battle, NOT a continuous day/night cycle. Night
 * is a selection token: its readable lighting/exposure still needs an authored
 * preset and native validation. Apply under covered world activation, never
 * call sky/PMREM rebuilds from a frame loop. Version belongs in replay receipts.
 */
export function selectBattleWeather(seed: number, biome: BattleWeatherBiome): BattleWeather {
  if (!Number.isSafeInteger(seed)) throw new RangeError('Battle weather requires a safe integer seed');
  if (!Object.hasOwn(BIOMES, biome)) throw new RangeError('Unknown battle weather biome');
  const canonicalSeed = seed >>> 0;
  return Object.freeze({
    version: BATTLE_WEATHER_VERSION,
    seed: canonicalSeed,
    biome,
    condition: 'clear',
    timeOfDay: weatherHash(canonicalSeed, 0x85ebca6b) % 100 < 20 ? 'night' : 'day',
    precipitationIntensity: 0,
    cloudOpacityMultiplier: 1,
    fogDensityMultiplier: 1,
  });
}
