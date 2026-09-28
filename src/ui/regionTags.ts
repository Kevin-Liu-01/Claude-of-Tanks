import type { CamoTagId } from '../vehicles/camoPolicy.ts';
import { isMapId, type MapId } from '../world/maps/catalog.ts';
import type { UiIconId } from './uiIcons.ts';

const REGION_ICONS = {
  woodland: 'regionWoodland', desert: 'regionDesert', winter: 'regionWinter',
  urban: 'regionUrban', tropical: 'regionTropical', maritime: 'regionMaritime', night: 'regionNight',
} as const satisfies Partial<Record<CamoTagId, UiIconId>>;
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
  saltwind: ['maritime', 'desert'], reservoir: ['woodland'], mars: ['desert'],
};

export function regionTagIcon(tag: CamoTagId): UiIconId | undefined {
  const icons: Partial<Record<CamoTagId, UiIconId>> = REGION_ICONS;
  return icons[tag];
}

export function mapRegionTags(mapId: string): readonly RegionTagId[] {
  return isMapId(mapId) ? MAP_REGIONS[mapId] : [];
}
