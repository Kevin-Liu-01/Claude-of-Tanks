/**
 * studioLight.ts — Scene Studio's cinematic light plans (media r5, 2026-10-01).
 *
 * Pure and Node-runnable: no DOM, no renderer. Given a map's authored sky (the
 * same preset the battle atmosphere starts from), a Studio time of day and an
 * optional sun-direction override, `planStudioLight` returns the complete sky
 * preset to apply plus the Studio-only presentation around it (a key light
 * decoupled from a set sun, vehicle readability, the far-horizon grade).
 *
 * Battles never import this module: BATTLE_TIMES, their weights, the seeded
 * selection and the battle day/sunset/night presets stay in
 * battleWeatherPolicy.ts / battleAtmosphereRuntime.ts, byte-for-byte. The
 * Studio superset is authored RELATIVE to each map's own light (multipliers and
 * hue blends over the authored values), the way weatherPreset() authors the
 * battle sunset, so an overcast map stays overcast at golden hour and a desert
 * keeps its hard key. Moonlight and the blue-hour glow are absolute keys: they
 * do not inherit a map's daytime overcast.
 *
 * Determinism: the plan is a pure function of (mapId, authored sky, time,
 * light, cloud identity). No clocks, no randomness.
 */
import type { MapSkyConfig } from '../world/maps/horizon.ts';
import type { CloudLayerPreset } from '../engine/cloudPresets.ts';

export const STUDIO_TIMES = Object.freeze(['dawn', 'morning', 'day', 'golden', 'sunset', 'dusk', 'night'] as const);
export type StudioTimeOfDay = typeof STUDIO_TIMES[number];

/** Maps whose authored space lighting is kept: only the day time applies (the light override still steers the sun). */
export const STUDIO_SPACE_MAPS = Object.freeze(['mars', 'moon'] as const);

/** The scene JSON `light` block (absolute world angles; an omitted field keeps the time's own sun). */
export interface StudioLight {
  /** Compass bearing of the sun (the moon at night) in degrees: 0 = +Z, 90 = +X (the sky preset convention). */
  sunAzimuthDeg?: number;
  /** Sun elevation in degrees, clamped into the time's band (STUDIO_TIME_BANDS). Dusk: the set sun, below 0. */
  sunElevationDeg?: number;
  /** Dusk and night light the actors' headlights (default true); false keeps a blacked-out column. */
  headlights?: boolean;
}

interface ElevationBand { readonly min: number; readonly max: number }

/** Per-time sun elevation band and default (degrees; a null default keeps the map's authored elevation). */
export const STUDIO_TIME_BANDS: Readonly<Record<StudioTimeOfDay, Readonly<ElevationBand & { default: number | null }>>> = Object.freeze({
  dawn: Object.freeze({ min: 1, max: 9, default: 4 }),
  morning: Object.freeze({ min: 12, max: 30, default: 17 }),
  day: Object.freeze({ min: 10, max: 80, default: null }),
  golden: Object.freeze({ min: 6, max: 18, default: 11 }),
  sunset: Object.freeze({ min: 1, max: 8, default: 3.5 }),
  dusk: Object.freeze({ min: -9, max: -1, default: -4 }),
  night: Object.freeze({ min: 8, max: 70, default: 20 }),
});
/** Space maps keep their authored day and accept a sun override inside this band. */
const SPACE_BAND: ElevationBand = Object.freeze({ min: 8, max: 60 });
/** At dusk the key light stands this high over the set sun's bearing (the twilight glow). */
export const STUDIO_DUSK_KEY_ELEVATION_DEG = 5;

/** The far horizon's grade: the ring and its far range are unlit (baked) materials, so the plan carries their light. */
interface StudioHorizonGrade {
  /** Scalar on the unlit horizon materials' colour (the battle night uses 0.20). */
  readonly dim: number;
}

export interface StudioLightPlan {
  /** The time rendered (space maps render `day` for every request). */
  readonly time: StudioTimeOfDay;
  /** The sun (the moon at night) as rendered. */
  readonly sunAzimuthDeg: number;
  readonly sunElevationDeg: number;
  /** The complete sky preset (sky + key/hemi/fill + clouds) to apply. */
  readonly sky: MapSkyConfig;
  /** Unit vector toward the key light when it is decoupled from the sky's sun (dusk); null = the sky's sun. */
  readonly keyDirection: readonly [number, number, number] | null;
  readonly readability: number;
  readonly horizon: StudioHorizonGrade;
  /** The map keeps its authored space lighting (mars / moon). */
  readonly space: boolean;
}

export function isStudioTime(value: unknown): value is StudioTimeOfDay {
  return typeof value === 'string' && (STUDIO_TIMES as readonly string[]).includes(value);
}

function isSpaceMap(mapId: string): boolean {
  return (STUDIO_SPACE_MAPS as readonly string[]).includes(mapId);
}

/** Times a map renders: every Studio time, or only `day` on the space maps. */
export function studioTimesFor(mapId: string): readonly StudioTimeOfDay[] {
  return isSpaceMap(mapId) ? ['day'] : STUDIO_TIMES;
}

/** The time a map actually renders for a requested time (space maps: always `day`). */
export function studioTimeFor(mapId: string, time: StudioTimeOfDay): StudioTimeOfDay {
  return isSpaceMap(mapId) ? 'day' : time;
}

const round = (value: number, digits: number): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};
const clamp = (value: number, lo: number, hi: number): number => (value < lo ? lo : value > hi ? hi : value);

/** The band the sun override is clamped into for this map and time. */
export function studioElevationBand(mapId: string, time: StudioTimeOfDay): ElevationBand {
  return isSpaceMap(mapId) ? SPACE_BAND : STUDIO_TIME_BANDS[studioTimeFor(mapId, time)];
}

/**
 * Validate a scene's `light` block. Returns null for an absent/empty block and throws on a malformed one.
 * Azimuth wraps into [0, 360); elevation is kept as authored here and clamped per time by `planStudioLight`.
 * Values round to 0.01° so state() round-trips exactly.
 */
export function normalizeStudioLight(input: unknown): StudioLight | null {
  if (input == null) return null;
  if (typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Studio light must be an object');
  const source = input as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (key !== 'sunAzimuthDeg' && key !== 'sunElevationDeg' && key !== 'headlights') throw new RangeError(`Unknown Studio light field: ${key}`);
  }
  const out: StudioLight = {};
  if (source.sunAzimuthDeg != null) {
    const azimuth = Number(source.sunAzimuthDeg);
    if (typeof source.sunAzimuthDeg !== 'number' || !Number.isFinite(azimuth)) throw new RangeError('Studio light sunAzimuthDeg must be a finite number');
    out.sunAzimuthDeg = round(((azimuth % 360) + 360) % 360, 2) % 360;
  }
  if (source.sunElevationDeg != null) {
    const elevation = Number(source.sunElevationDeg);
    if (typeof source.sunElevationDeg !== 'number' || !Number.isFinite(elevation)) throw new RangeError('Studio light sunElevationDeg must be a finite number');
    out.sunElevationDeg = round(clamp(elevation, -90, 90), 2);
  }
  if (source.headlights != null) {
    if (typeof source.headlights !== 'boolean') throw new RangeError('Studio light headlights must be a boolean');
    // the default (on) is not stored, so a scene without the field round-trips without it
    if (!source.headlights) out.headlights = false;
  }
  return out.sunAzimuthDeg === undefined && out.sunElevationDeg === undefined && out.headlights === undefined ? null : out;
}

// ---------------------------------------------------------------------------
// colour helpers (sRGB hex blends — the authored presets are hex sRGB)
// ---------------------------------------------------------------------------
function mixHex(from: number, to: number, weight: number): number {
  const w = clamp(weight, 0, 1);
  const channel = (shift: number): number => {
    const a = (from >> shift) & 255, b = (to >> shift) & 255;
    return Math.round(a + (b - a) * w) & 255;
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Unit vector toward a sun at (elevation, azimuth): the sky.ts / atmosphere.ts convention. */
export function studioSunDirection(elevationDeg: number, azimuthDeg: number): [number, number, number] {
  const el = elevationDeg * Math.PI / 180, az = azimuthDeg * Math.PI / 180;
  const c = Math.cos(el);
  // three's setFromSphericalCoords(1, 90° - el, az): x = sin(phi) sin(theta), y = cos(phi), z = sin(phi) cos(theta)
  return [c * Math.sin(az), Math.sin(el), c * Math.cos(az)];
}

// ---------------------------------------------------------------------------
// the recipes
// ---------------------------------------------------------------------------
/** A time of day relative to the map's authored light. Scalars multiply the authored value unless named absolute. */
interface TimeRecipe {
  /** Key light: a multiplier on the authored sunIntensity, or an absolute intensity, and the hue it blends toward. */
  readonly key: number;
  readonly keyAbsolute?: boolean;
  readonly keyHex: number;
  readonly keyBlend: number;
  readonly hemi: number;
  /** Absolute clamp of the resulting hemisphere intensity. */
  readonly hemiRange: readonly [number, number];
  readonly fill: number;
  readonly env: number;
  /** Dome radiance multiplier (absolute; the battle night runs 0.08). */
  readonly skyIntensity: number;
  readonly turbidity: number;
  readonly mie: number;
  /** Multiplier on the authored Rayleigh (the blue hour's bluer dome); 1 when omitted. */
  readonly rayleigh?: number;
  readonly fogDensity: number;
  readonly fogHex: number;
  readonly fogBlend: number;
  /** Absolute fog mix (null keeps the authored). */
  readonly fogMix: number | null;
  readonly cloudHex: number;
  readonly cloudBlend: number;
  readonly exposure: number;
  readonly readability: number;
  readonly horizonDim: number;
  /** Optional extra sky fields (night sky, moon size…). */
  readonly extra?: Partial<MapSkyConfig>;
  /** Atmosphere overrides merged over the authored ones (e.g. the blue hour's ozone). */
  readonly atmosphere?: NonNullable<MapSkyConfig['atmosphere']>;
  /** Cloud-layer overrides beyond the pinned identity (e.g. no cloud shadows from a set sun). */
  readonly cloudLayer?: Partial<CloudLayerPreset>;
  /** A key light decoupled from the sky's sun at this elevation along its bearing (the blue hour's glow). */
  readonly keyElevationDeg?: number;
  /**
   * The grounded camera's offset (EV) for this time, added to the map's own `lighting.exposureEV` (2026-10-06, the skies
   * lane; the media session's review of PR #9's merge: all six night takes read as daylight). Under the grounded light
   * model (lightModel.ts) the camera adapts to the light the frame receives — `exposure` (postExposure) above sets only
   * the legacy rig's level — and a moonlit field displays at about a third of noon, the battle night's level (the owner's
   * 2026-09-14 calibration). The Studio's night is a cinematic night, darker than the battle's.
   */
  readonly cameraEV?: number;
}

/**
 * QA only (the light lane's calibration probes, like atmosphere.ts's __ATMO_CALIBRATION): per-time recipe fields and
 * raw sky fields merged over the shipped recipes. Never set by the product; a page without it plans the shipped light.
 */
export type StudioLightLab = Partial<Record<StudioTimeOfDay, Partial<TimeRecipe> & { readonly sky?: Partial<MapSkyConfig> }>>;

const FILL_DEFAULT = 0.66; // lighting.ts FILL_INTENSITY (a preset without fillIntensity)
const SUN_DEFAULT = 4.5; // lighting.ts SUN_INTENSITY
const SUN_HEX_DEFAULT = 0xfff1dc; // lighting.ts SUN_COLOR
const HEMI_DEFAULT = 0.36; // lighting.ts HEMI_INTENSITY

// Calibrated on the light lane's lab sheets (verdant, desert, alpine; toward-sun, anti-sun, hero and overview cameras).
// The low suns lift the ambient and lower the vehicle readability floors (a camera-facing fill that reads as clay under
// a weak key); their fog tints stay darker than the bright low-sun horizon so the far field never washes out.
const RECIPES: Readonly<Record<Exclude<StudioTimeOfDay, 'day'>, TimeRecipe>> = Object.freeze({
  // Sun just clear of the horizon: rose key, a lavender sky (the ozone's violet cast), soft low-contrast light, haze.
  dawn: {
    key: 0.5, keyHex: 0xffb8a8, keyBlend: 0.85,
    hemi: 1.35, hemiRange: [0.30, 0.62], fill: 0.9, env: 1.3,
    skyIntensity: 0.95, turbidity: 0.85, mie: 1.3,
    fogDensity: 1.15, fogHex: 0x7a7096, fogBlend: 0.85, fogMix: 0.58,
    cloudHex: 0xf6d6d6, cloudBlend: 0.55,
    exposure: 1.08, readability: 0.55, horizonDim: 0.6,
    atmosphere: { ozoneScale: 2.2, mieTintHex: 0xfff0f6 },
  },
  // A clean mid-morning: deep blue air, crisp shadows, near-white key.
  morning: {
    key: 0.92, keyHex: 0xfff2dd, keyBlend: 0.6,
    hemi: 0.95, hemiRange: [0.22, 0.9], fill: 0.9, env: 1.0,
    skyIntensity: 1.0, turbidity: 0.72, mie: 0.8,
    fogDensity: 0.72, fogHex: 0x8aa3c4, fogBlend: 0.35, fogMix: null,
    cloudHex: 0xfffbf4, cloudBlend: 0.5,
    exposure: 1.0, readability: 1, horizonDim: 0.96,
  },
  // Rich warm gold with long shadows: a strong key over a cooler, open shade.
  golden: {
    key: 0.9, keyHex: 0xffc07c, keyBlend: 0.88,
    hemi: 0.95, hemiRange: [0.2, 0.7], fill: 0.75, env: 1.05,
    skyIntensity: 0.92, turbidity: 1.15, mie: 1.2,
    fogDensity: 1.0, fogHex: 0x9a8268, fogBlend: 0.8, fogMix: 0.5,
    cloudHex: 0xffdcb4, cloudBlend: 0.45,
    exposure: 1.04, readability: 0.65, horizonDim: 0.72,
  },
  // The sun on the horizon: a deep orange key, a glowing band under a deepening blue, darker land.
  sunset: {
    key: 0.68, keyHex: 0xff8f4c, keyBlend: 0.92,
    hemi: 1.15, hemiRange: [0.26, 0.6], fill: 0.7, env: 1.15,
    skyIntensity: 0.78, turbidity: 1.3, mie: 1.25,
    fogDensity: 1.1, fogHex: 0x8c6a6e, fogBlend: 0.85, fogMix: 0.5,
    cloudHex: 0xf2b28c, cloudBlend: 0.35,
    exposure: 1.06, readability: 0.55, horizonDim: 0.5,
    atmosphere: { ozoneScale: 1.4 },
  },
  // Blue hour: the sun set, a deep dome over the warm glow band and the Belt of Venus, first stars, dark land under a
  // faint warm key from the glow. The twilight is lifted through the atmosphere's illuminance (the dome's dither is
  // added before skyIntensity, so a large skyIntensity would amplify it into grain); the environment probe is told
  // the dome is dim on purpose (envValidityScale) instead of mistaking it for a poisoned bake.
  dusk: {
    key: 0.5, keyAbsolute: true, keyHex: 0xffa884, keyBlend: 0.9,
    // the sky fill reads a lamp-less battlefield at blue hour (orchestrator review: Cinder Junction, Nordhavn's sea side)
    hemi: 1.0, hemiRange: [0.22, 0.5], fill: 0.55, env: 1.35,
    skyIntensity: 1.5, turbidity: 1.0, mie: 0.7, rayleigh: 1.3,
    fogDensity: 1.1, fogHex: 0x2e3d5e, fogBlend: 0.9, fogMix: 0.62,
    cloudHex: 0x9aa0b8, cloudBlend: 0.6,
    exposure: 1.12, readability: 0.4, horizonDim: 0.36,
    atmosphere: { ozoneScale: 0.8, sunIlluminance: 64 },
    extra: { nightSky: 0.15, envValidityScale: 0.1 },
    cloudLayer: { shadow: false },
    keyElevationDeg: STUDIO_DUSK_KEY_ELEVATION_DEG,
  },
  // Moonlight: a silver key, readable shapes, deep blue shade, stars and the moon; the clouds moonlit silver (their
  // daylight albedo, a stronger moon term), not black holes in the starfield.
  night: {
    key: 0.9, keyAbsolute: true, keyHex: 0xa9c0ef, keyBlend: 1,
    hemi: 0.9, hemiRange: [0.25, 0.45], fill: 0.4, env: 1.0,
    skyIntensity: 0.08, turbidity: 1.0, mie: 1.0,
    fogDensity: 1.0, fogHex: 0x34445e, fogBlend: 1, fogMix: 0.66,
    cloudHex: 0xb4c0d8, cloudBlend: 1,
    exposure: 1.1, readability: 0.3, horizonDim: 0.2,
    cloudLayer: { shadow: false, sunGain: 3, ambientScale: 2 },
    // the moonlit grey card at about a seventh of the Studio day (the grounded camera alone kept a third)
    cameraEV: -1.25,
  },
});

/** The authored identity the clouds keep across times (their weather offset and wind come from the authored sun). */
export interface StudioCloudIdentity {
  readonly offset: readonly [number, number];
  readonly windDirRad: number;
}

/**
 * The complete plan for one Studio time on one map. `authored` is the map's own sky (for mars, the shared Mars
 * preset the battle atmosphere applies); `clouds` is the cloud identity derived from that authored sky (sky.ts's
 * derivation), pinned so the cloud field stays put while the light moves.
 */
export function planStudioLight(
  mapId: string, authored: MapSkyConfig, requested: StudioTimeOfDay, light: StudioLight | null,
  clouds: StudioCloudIdentity | null = null, lab: StudioLightLab | null = null,
): StudioLightPlan {
  if (!isStudioTime(requested)) throw new RangeError('Unknown Studio time of day');
  const space = isSpaceMap(mapId);
  const time = studioTimeFor(mapId, requested);
  const authoredAz = authored.sunAzimuthDeg ?? 115;
  const authoredEl = authored.sunElevationDeg ?? 32;
  const band = studioElevationBand(mapId, time);
  const azimuth = light?.sunAzimuthDeg ?? authoredAz;
  const defaultEl = time === 'day' ? authoredEl : STUDIO_TIME_BANDS[time].default ?? authoredEl;
  const elevation = round(clamp(light?.sunElevationDeg ?? defaultEl, band.min, band.max), 2);
  const pinnedClouds: Partial<CloudLayerPreset> | null = clouds
    ? { ...(authored.cloudLayer ?? {}), offset: [clouds.offset[0], clouds.offset[1]], windDirRad: clouds.windDirRad }
    : null;

  if (time === 'day') {
    // The authored day, exactly — unless the sun is moved, which changes only its direction.
    const moved = !!light && (azimuth !== authoredAz || elevation !== authoredEl);
    const sky: MapSkyConfig = { ...authored };
    if (moved) {
      sky.sunAzimuthDeg = azimuth;
      sky.sunElevationDeg = elevation;
      if (pinnedClouds) sky.cloudLayer = pinnedClouds;
    }
    return Object.freeze({
      time, sunAzimuthDeg: moved ? azimuth : authoredAz, sunElevationDeg: moved ? elevation : authoredEl,
      sky: Object.freeze(sky), keyDirection: null, readability: 1, horizon: Object.freeze({ dim: 1 }), space,
    });
  }

  const recipe: TimeRecipe = lab?.[time] ? { ...RECIPES[time], ...lab[time] } : RECIPES[time];
  const sunI = authored.sunIntensity ?? SUN_DEFAULT;
  const hemiI = authored.hemiIntensity ?? HEMI_DEFAULT;
  const sky: MapSkyConfig = {
    ...authored,
    ...(recipe.extra ?? {}),
    sunAzimuthDeg: azimuth,
    sunElevationDeg: elevation,
    skyIntensity: recipe.skyIntensity,
    sunIntensity: round(recipe.keyAbsolute ? recipe.key : sunI * recipe.key, 3),
    sunColorHex: mixHex(authored.sunColorHex ?? SUN_HEX_DEFAULT, recipe.keyHex, recipe.keyBlend),
    hemiIntensity: round(clamp(hemiI * recipe.hemi, recipe.hemiRange[0], recipe.hemiRange[1]), 3),
    fillIntensity: round((authored.fillIntensity ?? FILL_DEFAULT) * recipe.fill, 3),
    envIntensity: round((authored.envIntensity ?? 0.2) * recipe.env, 3),
    turbidity: round((authored.turbidity ?? 4) * recipe.turbidity, 3),
    rayleigh: round((authored.rayleigh ?? 1.2) * (recipe.rayleigh ?? 1), 3),
    mieCoefficient: round((authored.mieCoefficient ?? 0.006) * recipe.mie, 6),
    fogDensity: round((authored.fogDensity ?? 0.00074) * recipe.fogDensity, 8),
    fogTintHex: mixHex(authored.fogTintHex ?? 0x7e97b8, recipe.fogHex, recipe.fogBlend),
    fogMix: recipe.fogMix ?? authored.fogMix ?? 0.55,
    cloudTintHex: mixHex(authored.cloudTintHex ?? 0xffffff, recipe.cloudHex, recipe.cloudBlend),
    postExposure: round((authored.postExposure ?? 1) * recipe.exposure, 3),
  };
  if (recipe.atmosphere) sky.atmosphere = { ...(authored.atmosphere ?? {}), ...recipe.atmosphere };
  // the grounded camera's offset joins the map's own lighting block (its ground albedo, overcast and EV kept)
  if (recipe.cameraEV) sky.lighting = { ...(authored.lighting ?? {}), exposureEV: round((authored.lighting?.exposureEV ?? 0) + recipe.cameraEV, 3) };
  const cloudLayer = { ...(pinnedClouds ?? authored.cloudLayer ?? {}), ...(recipe.cloudLayer ?? {}) };
  if (Object.keys(cloudLayer).length) sky.cloudLayer = cloudLayer;
  if (lab?.[time]?.sky) Object.assign(sky, lab[time].sky);
  return Object.freeze({
    time, sunAzimuthDeg: azimuth, sunElevationDeg: elevation, sky: Object.freeze(sky),
    keyDirection: recipe.keyElevationDeg !== undefined ? studioSunDirection(recipe.keyElevationDeg, azimuth) : null,
    readability: recipe.readability, horizon: Object.freeze({ dim: recipe.horizonDim }), space,
  });
}
