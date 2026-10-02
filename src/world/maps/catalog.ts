import type { MapCompositionConfig } from './contracts.ts';

// The battlefield identity slice (ids, names, the random rotation, the resolvers) lives in mapIds.ts so the rooms
// Worker and the dedicated server can import it without this file's contracts.ts type chain (2026-09-28).
import { isMapId } from './mapIds.ts';
export { MAP_IDS, RANDOM_BATTLE_MAP_IDS, isMapId, getMapName, resolveMapId, type MapId } from './mapIds.ts';

// The sealed motor-pool Garage uses Verdant's authored neutral light until a
// requested outdoor Garage world is live. Verdant imports this same object,
// so the fallback cannot drift from the full battlefield configuration.
export const DEFAULT_GARAGE_SKY: NonNullable<MapCompositionConfig['sky']> = {
  sunElevationDeg: 32,
  sunAzimuthDeg: 115,
  turbidity: 4,
  rayleigh: 1.2,
  mieCoefficient: 0.006,
  mieDirectionalG: 0.82,
  fogDensity: 0.00074,
  fogTintHex: 0x7e97b8,
  fogMix: 0.55,
  envIntensity: 0.2,
  cloudOpacity: 1.0,
  cloudOpacity2: 0.6,
  cloudTintHex: 0xffffff,
  sunIntensity: 4.5,
  sunColorHex: 0xfff1dd,
  hemiIntensity: 0.32,
};

/**
 * Localized map name. Falls back to the English MAP_NAMES when the active
 * locale is en-US. The Random option always returns the localized label.
 */
import { t } from '../../ui/i18n.ts';

export function getLocalizedMapName(mapId: string): string {
  if (mapId === 'random') return t('map.random');
  return isMapId(mapId) ? t(`map.${mapId}`) : t('map.verdant');
}

