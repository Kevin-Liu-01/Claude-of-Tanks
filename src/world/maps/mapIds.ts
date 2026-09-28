// src/world/maps/mapIds.ts — the battlefield identity slice: ids, display names, the random rotation and the
// resolvers. DOM-free and type-free on purpose (2026-09-28): the rooms Worker (src/mp/room/roomPolicy.ts) and the
// dedicated server (server/collisionManifestFormat.ts) read map ids from here; catalog.ts re-exports these names for
// the browser and adds the garage sky and the localized names on top. Importing catalog.ts from a network module
// dragged contracts.ts → terrain.ts → maps/horizon.ts → engine/sky.ts → engine/deviceDiag.ts into the Worker's
// TypeScript program (445 DOM errors under cloudflare/rooms' compiler) — roomWorkerProgram.selftest guards the cut.

/** Lightweight battlefield identity used before a full world is requested. */
export const MAP_IDS = Object.freeze([
  'verdant', 'desert', 'winter', 'urban',
  'coastal', 'autumn', 'steppe', 'railyard',
  'frontier', 'fjord', 'delta', 'badlands',
  'monsoon', 'alpine', 'caldera', 'foundry',
  'ruinspires', 'blackglass', 'titan_gorge', 'skybridge',
  'polders', 'copper_mesa', 'airfield', 'oasis', 'whiteout',
  'orchard', 'longleaf', 'mangrove', 'saltwind', 'reservoir',
  // Mars mode (owner 2026-09-18): the galaxy-sky basin plays through its own mode, not the random rotation
  'mars',
] as const);

export type MapId = (typeof MAP_IDS)[number];

export const RANDOM_BATTLE_MAP_IDS = Object.freeze(MAP_IDS.filter((id) => id !== 'mars'));

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
  polders: 'Tidegate Polders',
  copper_mesa: 'Copper Mesa Mine',
  airfield: 'Kestrel Airfield',
  oasis: 'Sunscar Oasis',
  whiteout: 'Whiteout Station',
  orchard: 'Orchard Valley',
  longleaf: 'Longleaf Crossing',
  mangrove: 'Mangrove Reach',
  saltwind: 'Saltwind Narrows',
  reservoir: 'Highland Reservoir',
  mars: 'Olympus Basin',
} satisfies Record<MapId, string>);

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
