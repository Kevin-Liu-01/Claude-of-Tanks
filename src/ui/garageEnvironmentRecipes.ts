import type { StructureBuilder } from '../world/maps/exteriorDetailKit.ts';
import {
  makeBathhouse, makeCaravanserai, makeFireStation, makeFishery,
  makeFoundryOffice, makeRangerLodge, makeTavern,
} from '../world/maps/structureKit.ts';
import {
  makeBoatshed, makeContainerRow, makeGantry, makeLighthouse, makeShed, makeStack,
  makeWarehouse, makeWaterTower,
} from '../world/maps/railKit.ts';
import {
  makeAlpine, makeChapel, makeCornerShop, makeDepot, makeFarmhouse, makeMinaret,
  makeGranary, makeLogCabin, makeWoodshed,
} from '../world/maps/villageKit.ts';
import { makeChurch, makeFactory } from '../world/maps/urbanKit.ts';

export type GarageSurfaceKey = 'grass' | 'sand' | 'snow' | 'rock' | 'cobble' |
  'plaster' | 'roof' | 'wood' | 'brick';

export interface GarageStructurePlacement {
  readonly builder: StructureBuilder;
  readonly label: string;
  /** Authored world-space footprint center inside the compact terrain excerpt. */
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly scale: number;
}

export interface GarageEnvironmentRecipe {
  readonly terrainSurface: GarageSurfaceKey;
  readonly terrainTint: number;
  readonly hardstandTint: number;
  readonly buildingTint: number;
  readonly structures: readonly GarageStructurePlacement[];
  readonly treeSpecies: readonly string[];
  readonly treeCount: number;
  /** Vertical compression for a camera-scale Garage excerpt of the real map. */
  readonly reliefScale?: number;
  readonly terrainProfile: string;
  readonly serviceFrame: string;
  readonly sourceBeat: string;
  readonly sourceStructure: string;
  readonly landmark: readonly [number, number, number];
  readonly distinctiveElements: readonly string[];
}

const at = (builder: StructureBuilder, label: string, x: number, z: number,
  yaw = 0, scale = 1): GarageStructurePlacement => ({ builder, label, x, z, yaw, scale });

export const GARAGE_ENVIRONMENT_RECIPES = Object.freeze<Record<string, GarageEnvironmentRecipe>>({
  field_shed: {
    terrainSurface: 'grass', terrainTint: 0xb1bd83, hardstandTint: 0x8d8a78, buildingTint: 0xd2c8a4,
    structures: [
      at(makeFarmhouse, 'field farmhouse', -36, -6, 0.16, 0.88),
      at(makeTavern, 'village tavern', -30, -30, -0.16, 0.76),
      at(makeShed, 'maintenance shed', -7, -36, 0.28, 0.82),
      at(makeGranary, 'hedgerow granary', 18, -34, 0.18, 0.68),
      at(makeWoodshed, 'field stores', 36, -14, -0.10, 0.70),
    ],
    treeSpecies: ['oak', 'poplar'], treeCount: 24,
    terrainProfile: 'actual Verdant Fields spawn excerpt with hedgerow relief',
    serviceFrame: 'farm motor-pool apron and connected maintenance shed',
    sourceBeat: 'verdant-field-maintenance', sourceStructure: 'farmhouse + loading shed', landmark: [-20, 8.4, -27],
    distinctiveElements: ['real grass PBR', 'field farmhouse', 'connected loading shed', 'oak and poplar line'],
  },
  shade_depot: {
    terrainSurface: 'sand', terrainTint: 0xc7a06e, hardstandTint: 0xa99071, buildingTint: 0xcbb58c,
    structures: [
      at(makeCaravanserai, 'wadi caravanserai', -36, -6, 0.12, 0.84),
      at(makeMinaret, 'wadi minaret', -30, -30, 0.08, 0.76),
      at(makeShed, 'forward shade bay', -7, -36, -0.24, 0.82),
      at(makeDepot, 'wadi supply depot', 18, -34, -0.10, 0.68),
      at(makeCaravanserai, 'outer adobe court', 36, -14, 0.20, 0.56),
    ],
    treeSpecies: ['palm', 'acacia'], treeCount: 16,
    terrainProfile: 'actual Sirocco Wadi spawn excerpt with dune and mesa shoulder',
    serviceFrame: 'adobe forward depot and open service shade',
    sourceBeat: 'sirocco-wadi-logistics', sourceStructure: 'caravanserai + field shade', landmark: [-22, 7.4, -30],
    distinctiveElements: ['real sand PBR', 'fortified adobe court', 'connected shade bay', 'palm and acacia oasis'],
  },
  repair_bunker: {
    terrainSurface: 'snow', terrainTint: 0xe1eaec, hardstandTint: 0xb8c1c3, buildingTint: 0xc2c8c6,
    structures: [
      at(makeRangerLodge, 'winter ranger lodge', -36, -6, 0.14, 0.82),
      at(makeAlpine, 'snow service chalet', -30, -30, -0.16, 0.78),
      at(makeChapel, 'frost chapel', -7, -36, 0.10, 0.72),
      at(makeLogCabin, 'snowline cabin', 18, -34, 0.20, 0.66),
      at(makeWoodshed, 'winter stores', 36, -14, -0.12, 0.68),
    ],
    treeSpecies: ['spruce', 'birch'], treeCount: 18, reliefScale: 0.58,
    terrainProfile: 'actual Frosthollow spawn excerpt with snowbank relief',
    serviceFrame: 'snowbound lodge yard and sheltered repair chalet',
    sourceBeat: 'frosthollow-recovery', sourceStructure: 'ranger lodge + alpine chalet', landmark: [-20, 10.7, -28],
    distinctiveElements: ['real snow PBR', 'deep-roof lodge', 'alpine service chalet', 'spruce and birch windbreak'],
  },
  brick_arsenal: {
    terrainSurface: 'cobble', terrainTint: 0x8a8881, hardstandTint: 0x787b79, buildingTint: 0xa6907e,
    structures: [
      at(makeFactory, 'urban factory', -36, -6, 0.12, 0.76),
      at(makeFireStation, 'Steinburg fire station', -30, -30, -0.14, 0.78),
      at(makeCornerShop, 'arsenal corner shop', -7, -36, 0.18, 0.74),
      at(makeChurch, 'old-city church', 18, -34, 0.08, 0.54),
      at(makeFactory, 'arsenal annex', 36, -14, -0.08, 0.56),
    ],
    treeSpecies: ['poplar', 'oak'], treeCount: 14,
    terrainProfile: 'actual Steinburg spawn excerpt beneath a cobbled arsenal apron',
    serviceFrame: 'city appliance bay and brick industrial loading road',
    sourceBeat: 'steinburg-arsenal', sourceStructure: 'fire station + urban factory', landmark: [-21, 14.1, -29],
    distinctiveElements: ['real cobble PBR', 'hose tower fire station', 'brick factory facade', 'restrained city tree line'],
  },
  naval_drydock: {
    terrainSurface: 'grass', terrainTint: 0xa9b79d, hardstandTint: 0x829a9b, buildingTint: 0xc8d2cd,
    structures: [
      at(makeFishery, 'working fishery', -36, -6, 0.14, 0.78),
      at(makeLighthouse, 'harbor lighthouse', -30, -30, 0, 0.84),
      at(makeBoatshed, 'harbor boatshed', -7, -36, -0.14, 0.72),
      at(makeShed, 'drydock service bay', 18, -34, 0.24, 0.78),
      at(makeBoatshed, 'breakwater boatshed', 36, -14, 0.18, 0.62),
    ],
    treeSpecies: ['cedar', 'pine'], treeCount: 18,
    terrainProfile: 'actual Saltmere Bay spawn excerpt with wind-cut maritime ground',
    serviceFrame: 'harbor work apron, fishery dock and drydock service shelter',
    sourceBeat: 'saltmere-harbor-service', sourceStructure: 'fishery + lighthouse + shed', landmark: [25, 16.2, -31],
    distinctiveElements: ['maritime grass PBR', 'working fishery dock', 'harbor lighthouse', 'cedar and pine breakwater'],
  },
  rail_roundhouse: {
    terrainSurface: 'cobble', terrainTint: 0x817a6c, hardstandTint: 0x6f6960, buildingTint: 0xa18f7b,
    structures: [
      at(makeWarehouse, 'freight warehouse', -36, -6, 0.12, 0.78),
      at(makeGantry, 'rail gantry', -30, -30, -0.16, 0.82),
      at(makeContainerRow, 'container rank', -7, -36, 0.12, 0.74),
      at(makeWaterTower, 'junction water tower', 18, -34, 0, 0.72),
      at(makeWarehouse, 'roundhouse annex', 36, -14, 0.18, 0.58),
    ],
    treeSpecies: ['poplar', 'birch'], treeCount: 12,
    terrainProfile: 'actual Cinder Junction spawn excerpt with cinder and rail-yard grades',
    serviceFrame: 'rail-served overhaul apron beneath a connected gantry',
    sourceBeat: 'cinder-junction-overhaul', sourceStructure: 'warehouse + gantry + containers', landmark: [19, 11.6, -19],
    distinctiveElements: ['cinder cobble PBR', 'freight warehouse', 'connected crane gantry', 'authored container rank'],
  },
  rain_canopy: {
    terrainSurface: 'grass', terrainTint: 0x779978, hardstandTint: 0x708079, buildingTint: 0xa4af99,
    structures: [
      at(makeBathhouse, 'monsoon bathhouse', -36, -6, 0.12, 0.8),
      at(makeDepot, 'ridge field depot', -30, -30, -0.14, 0.8),
      at(makeFishery, 'ridge longhouse workshop', -7, -36, -0.12, 0.62),
      at(makeShed, 'rain service canopy', 18, -34, 0.24, 0.76),
      at(makeLogCabin, 'ridge crew lodge', 36, -14, 0.16, 0.64),
    ],
    treeSpecies: ['eucalyptus', 'palm'], treeCount: 20, reliefScale: 0.72,
    terrainProfile: 'actual Monsoon Ridge spawn excerpt with drainage relief',
    serviceFrame: 'raised depot terrace and connected rain-service shelter',
    sourceBeat: 'monsoon-ridge-field-bay', sourceStructure: 'bathhouse + field depot + shed', landmark: [-21, 7.7, -28],
    distinctiveElements: ['wet green PBR ground', 'domed field bathhouse', 'raised supply depot', 'eucalyptus and palm canopy'],
  },
  rock_cavern: {
    terrainSurface: 'snow', terrainTint: 0xd7e0e1, hardstandTint: 0x9da7a8, buildingTint: 0xb8b6aa,
    structures: [
      at(makeRangerLodge, 'glacier lodge', -36, -6, 0.12, 0.8),
      at(makeAlpine, 'pass chalet', -30, -30, -0.14, 0.78),
      at(makeChapel, 'ridge chapel', -7, -36, 0.10, 0.72),
      at(makeShed, 'pass service shelter', 18, -34, -0.20, 0.72),
      at(makeLogCabin, 'glacier outpost', 36, -14, 0.18, 0.62),
    ],
    treeSpecies: ['spruce', 'fir'], treeCount: 18, reliefScale: 0.38,
    terrainProfile: 'actual Glacier Pass spawn excerpt with steep alpine shoulder',
    serviceFrame: 'high-pass recovery terrace between lodge and chalet',
    sourceBeat: 'glacier-pass-service', sourceStructure: 'ranger lodge + chalet + chapel', landmark: [28, 13.6, -33],
    distinctiveElements: ['snow and rock terrain', 'deep-roof lodge', 'alpine chalet', 'spruce and fir ridge line'],
  },
  recovery_yard: {
    terrainSurface: 'rock', terrainTint: 0xb16d4f, hardstandTint: 0x8d6e5e, buildingTint: 0xb69678,
    structures: [
      at(makeCaravanserai, 'redrock compound', -36, -6, 0.12, 0.74),
      at(makeWarehouse, 'recovery warehouse', -30, -30, -0.14, 0.74),
      at(makeGantry, 'heavy lift gantry', -7, -36, 0.18, 0.76),
      at(makeWaterTower, 'divide water tower', 18, -34, 0, 0.68),
      at(makeContainerRow, 'salvage container line', 36, -14, 0.16, 0.62),
    ],
    treeSpecies: ['acacia', 'cedar'], treeCount: 14, reliefScale: 0.72,
    terrainProfile: 'actual Redrock Divide spawn excerpt with terraced mesa relief',
    serviceFrame: 'mesa recovery compound and heavy-lift frame',
    sourceBeat: 'redrock-recovery-yard', sourceStructure: 'compound + warehouse + gantry', landmark: [18, 10.7, -16],
    distinctiveElements: ['warm rock PBR', 'fortified recovery compound', 'freight warehouse', 'connected heavy-lift gantry'],
  },
  factory_line: {
    terrainSurface: 'cobble', terrainTint: 0x716a60, hardstandTint: 0x65615b, buildingTint: 0x91857b,
    structures: [
      at(makeFoundryOffice, 'foundry office', -36, -6, 0.12, 0.8),
      at(makeFactory, 'heavy factory', -30, -30, -0.14, 0.76),
      at(makeStack, 'smokestack', -7, -36, 0, 0.82),
      at(makeWaterTower, 'works water tower', 18, -34, 0, 0.70),
      at(makeWarehouse, 'works warehouse', 36, -14, 0.14, 0.58),
    ],
    treeSpecies: ['poplar', 'birch'], treeCount: 10,
    terrainProfile: 'actual Ironworks spawn excerpt beneath a worn factory hardstand',
    serviceFrame: 'sawtooth works road with foundry service line',
    sourceBeat: 'ironworks-heavy-service', sourceStructure: 'foundry office + factory + stack', landmark: [29, 18.4, -20],
    distinctiveElements: ['industrial cobble PBR', 'sawtooth foundry office', 'heavy factory hall', 'stack and water-tower skyline'],
  },
});
