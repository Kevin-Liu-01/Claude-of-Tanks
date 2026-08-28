/**
 * Shared battlefield art selection for the garage and multiplayer lobby.
 * The random choice should read as a deliberate collection of real maps,
 * never as a generic four-colour placeholder.
 */
export const RANDOM_MAP_PREVIEW_IDS = Object.freeze([
  'verdant', 'desert', 'winter', 'foundry',
] as const);

export interface MapPreview {
  readonly id: string;
  readonly thumb?: string;
}

export interface RandomMapMosaicOptions {
  readonly showCount?: boolean;
}

export function randomMapPreviewEntries<T extends MapPreview>(
  maps: readonly T[] | null | undefined,
  count = 4,
): T[] {
  const available = (maps || []).filter((map) => map?.id !== 'random' && map?.thumb);
  const byId = new Map(available.map((map) => [map.id, map]));
  const picked: T[] = [];
  for (const id of RANDOM_MAP_PREVIEW_IDS) {
    const map = byId.get(id);
    if (map && !picked.includes(map)) picked.push(map);
  }
  for (const map of available) {
    if (!picked.includes(map)) picked.push(map);
  }
  return picked.slice(0, Math.max(0, count));
}

export function createRandomMapMosaic(
  maps: readonly MapPreview[] | null | undefined,
  { showCount = false }: RandomMapMosaicOptions = {},
): HTMLDivElement {
  const mosaic = document.createElement('div');
  mosaic.className = 'random-map-mosaic';
  mosaic.setAttribute('aria-hidden', 'true');
  for (const map of randomMapPreviewEntries(maps)) {
    const tile = document.createElement('i');
    tile.className = 'random-map-tile';
    tile.style.backgroundImage = `url("${String(map.thumb).replace(/"/g, '%22')}")`;
    mosaic.appendChild(tile);
  }
  if (showCount) {
    const count = (maps || []).filter((map) => map?.id !== 'random').length;
    const badge = document.createElement('div');
    badge.className = 'random-map-count';
    badge.innerHTML = `<b>${count}</b><span>theatres</span>`;
    mosaic.appendChild(badge);
  }
  return mosaic;
}
