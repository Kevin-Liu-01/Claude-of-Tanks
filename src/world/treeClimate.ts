// src/world/treeClimate.ts — Round 77 (2026-09-26, the vegetation round): the climate every tree of a battlefield
// stands in — the wind it sways in and the moss its shaded bark grows — resolved once per world from the map's own
// authored weather and ground profile (THREE-free, shared by the runtime and the receipts). The vertex law lives in vegetation.ts (makeTreeWindHook): a gust front travels down the wind over the
// stands, every tree leans with it by the square of its height and its canopy flutters about the lean by the cards'
// authored flex; this module only decides the direction, the strength and the amplitudes the uniforms carry.
//
// Direction: the map's cloud wind (`clouds.windDirDeg`, degrees from +X toward +Z, the convention of
// engine/cloudscapes.ts and `ocean.windDirDeg`) when it authors one, else the ground profile's prevailing wind (the
// tall-grass biome's `windDir`, groundRedux.ts — the sward's gust field runs along it, so the blades and the crowns
// answer the same wind), else the temperate default. Strength: the cloud regime's wind speed (m/s aloft) against the
// temperate 7 m/s, clamped to the 0.55–1.6 band, so a storm front leans the stands and an overcast stratus barely
// stirs them; a map with no cloud block stands at 1.
import { CLOUDSCAPE_REGIMES } from '../engine/cloudscapes.ts';
import { resolveGroundReduxProfile } from './groundRedux.ts';

export interface TreeWindConfig {
  id?: string;
  clouds?: { regime?: string; windDirDeg?: number; windSpeed?: number } | null;
}

export interface TreeWind {
  /** Unit direction the wind blows TOWARD, world xz. */
  dirX: number;
  dirZ: number;
  /** 0.55–1.6, temperate 1. */
  strength: number;
  /** The source the direction came from (receipts / diagnostics). */
  source: 'clouds' | 'ground' | 'default';
}

/** Lean of a nominal-height crown top at strength 1 (m, instance space; a gust reaches ~1.4 × this). */
export const TREE_WIND_LEAN_M = 0.30;
/** Canopy flutter amplitude at flex 1 and strength 1 (m). */
export const TREE_WIND_FLUTTER_M = 0.11;
/** The nominal tree height the lean law normalises by (1 / m in the uniform): an 8 m crown top leans the full amount. */
export const TREE_WIND_NOMINAL_HEIGHT_M = 8;
/** Mobile tier: a third of the lean, half the flutter (the sway is vertex ALU only, but the phones keep their frame). */
export const TREE_WIND_MOBILE_SCALE = Object.freeze({ lean: 0.35, flutter: 0.5 });
export const TREE_WIND_DEFAULT_DIR = Object.freeze([0.8, 0.6] as const);

/**
 * Moss on the shaded side of the trunk bases (0..1): read off the ground profile's outcrop-rim climate tint
 * (groundRedux.ts round 73b — MOSS on the wet and tropical maps, LICHEN on the temperate ones, DUST and HOAR on the
 * arid and frozen ones): the green-over-red ratio of that tint says how wet the climate is. The wet maps grow a
 * full moss collar, the temperate ones a faint lichen dusting, the arid and frozen ones none.
 */
export function resolveTrunkMoss(cfg: TreeWindConfig | null | undefined): number {
  const tint = resolveGroundReduxProfile(cfg?.id).rimTint;
  const r = tint?.[0] ?? 1, g = tint?.[1] ?? 1;
  if (!(r > 0) || !Number.isFinite(g)) return 0;
  const ratio = g / r;
  const t = Math.min(1, Math.max(0, (ratio - 1.0) / 0.28));
  return t * t * (3 - 2 * t);
}

export function resolveTreeWind(cfg: TreeWindConfig | null | undefined): TreeWind {
  const clouds = cfg?.clouds ?? null;
  let dirX: number = TREE_WIND_DEFAULT_DIR[0], dirZ: number = TREE_WIND_DEFAULT_DIR[1];
  let source: TreeWind['source'] = 'default';
  if (clouds && Number.isFinite(clouds.windDirDeg)) {
    const rad = (clouds.windDirDeg as number) * Math.PI / 180;
    dirX = Math.cos(rad); dirZ = Math.sin(rad);
    source = 'clouds';
  } else {
    const grass = resolveGroundReduxProfile(cfg?.id).grass;
    if (grass && Number.isFinite(grass.windDir[0]) && Number.isFinite(grass.windDir[1])) {
      dirX = grass.windDir[0]; dirZ = grass.windDir[1];
      source = 'ground';
    }
  }
  const len = Math.hypot(dirX, dirZ);
  if (len > 1e-6) { dirX /= len; dirZ /= len; } else { dirX = TREE_WIND_DEFAULT_DIR[0]; dirZ = TREE_WIND_DEFAULT_DIR[1]; }
  let speed: number | null = null;
  if (clouds && Number.isFinite(clouds.windSpeed)) speed = clouds.windSpeed as number;
  else if (clouds?.regime && Object.prototype.hasOwnProperty.call(CLOUDSCAPE_REGIMES, clouds.regime)) {
    speed = CLOUDSCAPE_REGIMES[clouds.regime as keyof typeof CLOUDSCAPE_REGIMES].windSpeed;
  }
  const strength = speed === null ? 1 : Math.min(1.6, Math.max(0.55, speed / 7));
  return { dirX, dirZ, strength, source };
}
