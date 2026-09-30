/** Match-scoped presentation only. Never advances the simulation RNG, changes
 * spotting/traction, or schedules frames. Select once from the authoritative
 * battle seed. Only time of day varies; authored map atmosphere stays intact.
 * Biome is an explicit shared map-authoring input, not inferred from its name.
 */
export const BATTLE_WEATHER_VERSION = 4;

export type BattleWeatherBiome = 'temperate' | 'arid' | 'tropical' | 'cold' | 'coastal';
type BattleWeatherCondition = 'clear';
export const BATTLE_TIMES = Object.freeze(['day', 'sunset', 'night'] as const);
export type BattleTimeOfDay = typeof BATTLE_TIMES[number];
const TIME_WEIGHTS: Readonly<Record<BattleTimeOfDay, number>> = Object.freeze({
  day: 60, sunset: 30, night: 10,
});

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

// A dedicated hash domain keeps time selection independent of combat randomness.
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
export function selectBattleWeather(
  seed: number, biome: BattleWeatherBiome, enabled: readonly BattleTimeOfDay[] = BATTLE_TIMES,
): BattleWeather {
  if (!Number.isSafeInteger(seed)) throw new RangeError('Battle weather requires a safe integer seed');
  if (!Object.hasOwn(BIOMES, biome)) throw new RangeError('Unknown battle weather biome');
  if (!enabled.length || enabled.some(time => !BATTLE_TIMES.includes(time))) {
    throw new RangeError('At least one valid time of day is required');
  }
  const canonicalSeed = seed >>> 0;
  // Canonical order also deduplicates preferences. Draw directly from the
  // enabled weights so disabling a time preserves the remaining relative odds.
  const choices = BATTLE_TIMES.filter(time => enabled.includes(time));
  const totalWeight = choices.reduce((total, time) => total + TIME_WEIGHTS[time], 0);
  let roll = weatherHash(canonicalSeed, 0x85ebca6b) / 0x100000000 * totalWeight;
  let timeOfDay = choices[choices.length - 1];
  for (const time of choices) {
    roll -= TIME_WEIGHTS[time];
    if (roll < 0) {
      timeOfDay = time;
      break;
    }
  }
  return Object.freeze({
    version: BATTLE_WEATHER_VERSION,
    seed: canonicalSeed,
    biome,
    condition: 'clear',
    timeOfDay,
    precipitationIntensity: 0,
    cloudOpacityMultiplier: 1,
    fogDensityMultiplier: 1,
  });
}
