/** Match-scoped presentation only. Never advances the simulation RNG, changes
 * spotting/traction, or schedules frames. Select once from the authoritative
 * battle seed; local quality may omit precipitation visuals, not re-roll it.
 * Biome is an explicit shared map-authoring input, not inferred from its name.
 */
export const BATTLE_WEATHER_VERSION = 1;

export type BattleWeatherBiome = 'temperate' | 'arid' | 'tropical' | 'cold' | 'coastal';
export type BattleWeatherCondition = 'clear' | 'fog' | 'rain' | 'snow';
export type BattleTimeOfDay = 'day' | 'night';

/** Local visual admission only. Cache on preset changes; never feed this into
 * the shared weather selection or force a quality tier to enable particles.
 */
export function battleWeatherParticleBudget(preset: string): number {
  switch (preset) {
    case 'mobile':
    case 'mobile-high': return 64;
    case 'medium': return 128;
    case 'high': return 384;
    case 'ultra': return 768;
    default: return 0; // low, mobile-low and unknown policies fail closed
  }
}

export interface BattleWeather {
  readonly version: typeof BATTLE_WEATHER_VERSION;
  /** Same uint32 normalization as the combat RNG. */
  readonly seed: number;
  readonly biome: BattleWeatherBiome;
  readonly condition: BattleWeatherCondition;
  readonly timeOfDay: BattleTimeOfDay;
  /** Normalized visual intensity, not a particle count or gameplay modifier. */
  readonly precipitationIntensity: number;
  /** Hints composed with the authored map, not absolute sky/lighting presets. */
  readonly cloudOpacityMultiplier: number;
  readonly fogDensityMultiplier: number;
}

interface BiomeWeather {
  readonly clearThrough: number;
  readonly fogThrough: number;
  readonly precipitation: 'rain' | 'snow';
  readonly fogDensityMultiplier: number;
}

const BIOMES: Readonly<Record<BattleWeatherBiome, BiomeWeather>> = {
  temperate: { clearThrough: 50, fogThrough: 70, precipitation: 'rain', fogDensityMultiplier: 1.45 },
  arid: { clearThrough: 90, fogThrough: 100, precipitation: 'rain', fogDensityMultiplier: 1.15 },
  tropical: { clearThrough: 35, fogThrough: 50, precipitation: 'rain', fogDensityMultiplier: 1.35 },
  cold: { clearThrough: 40, fogThrough: 60, precipitation: 'snow', fogDensityMultiplier: 1.40 },
  coastal: { clearThrough: 45, fogThrough: 65, precipitation: 'rain', fogDensityMultiplier: 1.50 },
};

// Stateless, independent integer domains: adding a future cosmetic field must
// not shift the condition/day selection or consume the caller's RNG stream.
function weatherHash(seed: number, salt: number): number {
  let value = (seed ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function selectCondition(roll: number, profile: BiomeWeather): BattleWeatherCondition {
  if (roll < profile.clearThrough) return 'clear';
  if (roll < profile.fogThrough) return 'fog';
  return profile.precipitation;
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
  const profile = BIOMES[biome];
  const condition = selectCondition(weatherHash(canonicalSeed, 0x77ea71e5) % 100, profile);
  const precipitating = condition === 'rain' || condition === 'snow';
  const precipitationIntensity = precipitating
    ? (350 + weatherHash(canonicalSeed, 0x9e3779b9) % 351) / 1000 : 0;
  return Object.freeze({
    version: BATTLE_WEATHER_VERSION,
    seed: canonicalSeed,
    biome,
    condition,
    timeOfDay: weatherHash(canonicalSeed, 0x85ebca6b) % 100 < 20 ? 'night' : 'day',
    precipitationIntensity,
    cloudOpacityMultiplier: precipitating ? 1.30 : condition === 'fog' ? 1.15 : 1,
    fogDensityMultiplier: condition === 'fog' ? profile.fogDensityMultiplier : precipitating ? 1.20 : 1,
  });
}
