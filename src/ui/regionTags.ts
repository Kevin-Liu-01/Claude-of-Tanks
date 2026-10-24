import type { CamoTagId } from '../vehicles/camoPolicy.ts';
import { isMapId, type MapId } from '../world/maps/catalog.ts';
import type { IconId } from './icons/spriteIndex.ts';

const REGION_ICONS = {
  woodland: 'regionWoodland', desert: 'regionDesert', winter: 'regionWinter',
  urban: 'regionUrban', tropical: 'regionTropical', maritime: 'regionMaritime', night: 'regionNight',
} as const satisfies Partial<Record<CamoTagId, IconId>>;
type RegionTagId = keyof typeof REGION_ICONS;

// Landscape labels shared with the camouflage browser. These describe the
// setting; time-of-day selection and concealment rules remain separate.
const MAP_REGIONS: Readonly<Record<MapId, readonly RegionTagId[]>> = {
  verdant: ['woodland'], desert: ['desert'], winter: ['winter'], urban: ['urban'],
  coastal: ['maritime', 'woodland'], autumn: ['woodland'], steppe: ['desert'],
  railyard: ['urban'], frontier: ['woodland'], fjord: ['maritime', 'winter'],
  delta: ['tropical'], badlands: ['desert'], monsoon: ['tropical'], alpine: ['winter'],
  caldera: ['desert'], foundry: ['urban'], ruinspires: ['urban'], blackglass: ['urban'],
  titan_gorge: ['desert'], skybridge: ['urban'], polders: ['woodland', 'maritime'],
  copper_mesa: ['desert'], airfield: ['woodland'], oasis: ['desert'], whiteout: ['winter'],
  orchard: ['woodland'], longleaf: ['woodland'], mangrove: ['tropical', 'maritime'],
  saltwind: ['maritime', 'desert'], reservoir: ['woodland'], mars: ['desert'], moon: ['night'], cliffbridge: ['woodland'],
};

/** The region's sprite glyph (every region glyph is in the sprite, so it serves icon() and uiIconSVG() alike). */
export function regionTagIcon(tag: CamoTagId): IconId | undefined {
  const icons: Partial<Record<CamoTagId, IconId>> = REGION_ICONS;
  return icons[tag];
}

export function mapRegionTags(mapId: string): readonly RegionTagId[] {
  return isMapId(mapId) ? MAP_REGIONS[mapId] : [];
}
