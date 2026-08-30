import type { MapCompositionConfig } from './contracts.ts';

/** Lightweight battlefield identity used before a full world is requested. */
export const MAP_IDS = Object.freeze([
  'verdant', 'desert', 'winter', 'urban',
  'coastal', 'autumn', 'steppe', 'railyard',
  'frontier', 'fjord', 'delta', 'badlands',
  'monsoon', 'alpine', 'caldera', 'foundry',
  'ruinspires', 'blackglass', 'titan_gorge', 'skybridge',
] as const);

export type MapId = (typeof MAP_IDS)[number];

export const RANDOM_BATTLE_MAP_IDS = MAP_IDS;

const MAP_NAMES = Object.freeze({
  verdant: 'Verdant Fields',
  desert: 'Sirocco Wadi',
  winter: 'Frosthollow',
  urban: 'Steinburg',
  coastal: 'Saltmere Bay',
  autumn: 'Amberford',
  steppe: 'Tarkhan Steppe',
  railyard: 'Cinder Junction',
  frontier: 'Frontier Basin',
  fjord: 'Nordhavn Fjord',
  delta: 'Jade River Delta',
  badlands: 'Redrock Divide',
  monsoon: 'Monsoon Ridge',
  alpine: 'Glacier Pass',
  caldera: 'Obsidian Caldera',
  foundry: 'Ironworks',
  ruinspires: 'Ruinspires',
  blackglass: 'Blackglass District',
  titan_gorge: 'Titan Gorge',
  skybridge: 'Skybridge Chasm',
} satisfies Record<MapId, string>);

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
  sunColorHex: 0xfff1dc,
  hemiIntensity: 0.32,
};

export function isMapId(mapId: string): mapId is MapId {
  return Object.prototype.hasOwnProperty.call(MAP_NAMES, mapId);
}

export function getMapName(mapId: string): string {
  return isMapId(mapId) ? MAP_NAMES[mapId] : MAP_NAMES.verdant;
}

export function resolveMapId(mapId: string, rand: () => number = Math.random): MapId {
  if (mapId === 'random' || !isMapId(mapId)) {
    const sample = Number(rand());
    const unit = Number.isFinite(sample)
      ? Math.max(0, Math.min(1 - Number.EPSILON, sample)) : 0;
    return RANDOM_BATTLE_MAP_IDS[Math.floor(unit * RANDOM_BATTLE_MAP_IDS.length)];
  }
  return mapId;
}
