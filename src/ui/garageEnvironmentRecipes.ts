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
} from '../world/maps/villageKit.ts';
import { makeFactory } from '../world/maps/urbanKit.ts';

export type GarageSurfaceKey = 'grass' | 'sand' | 'snow' | 'rock' | 'cobble' |
  'plaster' | 'roof' | 'wood' | 'brick';

export interface GarageStructurePlacement {
  readonly builder: StructureBuilder;
  readonly label: string;
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
      at(makeFarmhouse, 'field farmhouse', -8, -24, 0.16, 0.88),
      at(makeTavern, 'village tavern', 17, -27, -0.16, 0.76),
      at(makeShed, 'maintenance shed', -19, -16, 0.28, 0.82),
    ],
    treeSpecies: ['oak', 'poplar'], treeCount: 12,
    terrainProfile: 'actual Verdant Fields spawn excerpt with hedgerow relief',
    serviceFrame: 'farm motor-pool apron and connected maintenance shed',
    sourceBeat: 'verdant-field-maintenance', sourceStructure: 'farmhouse + loading shed', landmark: [-20, 8.4, -27],
    distinctiveElements: ['real grass PBR', 'field farmhouse', 'connected loading shed', 'oak and poplar line'],
  },
  shade_depot: {
    terrainSurface: 'sand', terrainTint: 0xc7a06e, hardstandTint: 0xa99071, buildingTint: 0xcbb58c,
    structures: [
      at(makeCaravanserai, 'wadi caravanserai', -6, -29, 0.12, 0.84),
      at(makeMinaret, 'wadi minaret', -23, -31, 0.08, 0.76),
      at(makeShed, 'forward shade bay', 19, -17, -0.24, 0.82),
    ],
    treeSpecies: ['palm', 'acacia'], treeCount: 9,
    terrainProfile: 'actual Sirocco Wadi spawn excerpt with dune and mesa shoulder',
    serviceFrame: 'adobe forward depot and open service shade',
    sourceBeat: 'sirocco-wadi-logistics', sourceStructure: 'caravanserai + field shade', landmark: [-22, 7.4, -30],
    distinctiveElements: ['real sand PBR', 'fortified adobe court', 'connected shade bay', 'palm and acacia oasis'],
  },
  repair_bunker: {
    terrainSurface: 'snow', terrainTint: 0xe1eaec, hardstandTint: 0xb8c1c3, buildingTint: 0xc2c8c6,
    structures: [
      at(makeRangerLodge, 'winter ranger lodge', -7, -27, 0.14, 0.82),
      at(makeAlpine, 'snow service chalet', 18, -27, -0.16, 0.78),
      at(makeChapel, 'frost chapel', -23, -31, 0.10, 0.72),
    ],
    treeSpecies: ['spruce', 'birch'], treeCount: 13, reliefScale: 0.58,
    terrainProfile: 'actual Frosthollow spawn excerpt with snowbank relief',
    serviceFrame: 'snowbound lodge yard and sheltered repair chalet',
    sourceBeat: 'frosthollow-recovery', sourceStructure: 'ranger lodge + alpine chalet', landmark: [-20, 10.7, -28],
    distinctiveElements: ['real snow PBR', 'deep-roof lodge', 'alpine service chalet', 'spruce and birch windbreak'],
  },
  brick_arsenal: {
    terrainSurface: 'cobble', terrainTint: 0x8a8881, hardstandTint: 0x787b79, buildingTint: 0xa6907e,
    structures: [
      at(makeFactory, 'urban factory', -6, -30, 0.12, 0.76),
      at(makeFireStation, 'Steinburg fire station', 18, -27, -0.14, 0.78),
      at(makeCornerShop, 'arsenal corner shop', -21, -26, 0.18, 0.74),
    ],
    treeSpecies: ['poplar', 'oak'], treeCount: 7,
    terrainProfile: 'actual Steinburg spawn excerpt beneath a cobbled arsenal apron',
    serviceFrame: 'city appliance bay and brick industrial loading road',
    sourceBeat: 'steinburg-arsenal', sourceStructure: 'fire station + urban factory', landmark: [-21, 14.1, -29],
    distinctiveElements: ['real cobble PBR', 'hose tower fire station', 'brick factory facade', 'restrained city tree line'],
  },
  naval_drydock: {
    terrainSurface: 'grass', terrainTint: 0xa9b79d, hardstandTint: 0x829a9b, buildingTint: 0xc8d2cd,
    structures: [
      at(makeFishery, 'working fishery', -7, -29, 0.14, 0.78),
      at(makeLighthouse, 'harbor lighthouse', 24, -31, 0, 0.84),
      at(makeBoatshed, 'harbor boatshed', 17, -25, -0.14, 0.72),
      at(makeShed, 'drydock service bay', -20, -16, 0.24, 0.78),
    ],
    treeSpecies: ['cedar', 'pine'], treeCount: 8,
    terrainProfile: 'actual Saltmere Bay spawn excerpt with wind-cut maritime ground',
    serviceFrame: 'harbor work apron, fishery dock and drydock service shelter',
    sourceBeat: 'saltmere-harbor-service', sourceStructure: 'fishery + lighthouse + shed', landmark: [25, 16.2, -31],
    distinctiveElements: ['maritime grass PBR', 'working fishery dock', 'harbor lighthouse', 'cedar and pine breakwater'],
  },
  rail_roundhouse: {
    terrainSurface: 'cobble', terrainTint: 0x817a6c, hardstandTint: 0x6f6960, buildingTint: 0xa18f7b,
    structures: [
      at(makeWarehouse, 'freight warehouse', -7, -31, 0.12, 0.78),
      at(makeGantry, 'rail gantry', 18, -18, -0.16, 0.82),
      at(makeContainerRow, 'container rank', -19, -27, 0.12, 0.74),
      at(makeWaterTower, 'junction water tower', 25, -31, 0, 0.72),
    ],
    treeSpecies: ['poplar', 'birch'], treeCount: 6,
    terrainProfile: 'actual Cinder Junction spawn excerpt with cinder and rail-yard grades',
    serviceFrame: 'rail-served overhaul apron beneath a connected gantry',
    sourceBeat: 'cinder-junction-overhaul', sourceStructure: 'warehouse + gantry + containers', landmark: [19, 11.6, -19],
    distinctiveElements: ['cinder cobble PBR', 'freight warehouse', 'connected crane gantry', 'authored container rank'],
  },
  rain_canopy: {
    terrainSurface: 'grass', terrainTint: 0x779978, hardstandTint: 0x708079, buildingTint: 0xa4af99,
    structures: [
      at(makeBathhouse, 'monsoon bathhouse', -7, -27, 0.12, 0.8),
      at(makeDepot, 'ridge field depot', 18, -25, -0.14, 0.8),
      at(makeFishery, 'ridge longhouse workshop', 25, -31, -0.12, 0.62),
      at(makeShed, 'rain service canopy', -20, -16, 0.24, 0.76),
    ],
    treeSpecies: ['eucalyptus', 'palm'], treeCount: 13, reliefScale: 0.72,
    terrainProfile: 'actual Monsoon Ridge spawn excerpt with drainage relief',
    serviceFrame: 'raised depot terrace and connected rain-service shelter',
    sourceBeat: 'monsoon-ridge-field-bay', sourceStructure: 'bathhouse + field depot + shed', landmark: [-21, 7.7, -28],
    distinctiveElements: ['wet green PBR ground', 'domed field bathhouse', 'raised supply depot', 'eucalyptus and palm canopy'],
  },
  rock_cavern: {
    terrainSurface: 'snow', terrainTint: 0xd7e0e1, hardstandTint: 0x9da7a8, buildingTint: 0xb8b6aa,
    structures: [
      at(makeRangerLodge, 'glacier lodge', -7, -29, 0.12, 0.8),
      at(makeAlpine, 'pass chalet', 18, -27, -0.14, 0.78),
      at(makeChapel, 'ridge chapel', -23, -32, 0.10, 0.72),
      at(makeShed, 'pass service shelter', 23, -16, -0.20, 0.72),
    ],
    treeSpecies: ['spruce', 'fir'], treeCount: 12, reliefScale: 0.38,
    terrainProfile: 'actual Glacier Pass spawn excerpt with steep alpine shoulder',
    serviceFrame: 'high-pass recovery terrace between lodge and chalet',
    sourceBeat: 'glacier-pass-service', sourceStructure: 'ranger lodge + chalet + chapel', landmark: [28, 13.6, -33],
    distinctiveElements: ['snow and rock terrain', 'deep-roof lodge', 'alpine chalet', 'spruce and fir ridge line'],
  },
  recovery_yard: {
    terrainSurface: 'rock', terrainTint: 0xb16d4f, hardstandTint: 0x8d6e5e, buildingTint: 0xb69678,
    structures: [
      at(makeCaravanserai, 'redrock compound', -7, -30, 0.12, 0.74),
      at(makeWarehouse, 'recovery warehouse', 18, -29, -0.14, 0.74),
      at(makeGantry, 'heavy lift gantry', -19, -17, 0.18, 0.76),
      at(makeWaterTower, 'divide water tower', 25, -31, 0, 0.68),
    ],
    treeSpecies: ['acacia', 'cedar'], treeCount: 7, reliefScale: 0.72,
    terrainProfile: 'actual Redrock Divide spawn excerpt with terraced mesa relief',
    serviceFrame: 'mesa recovery compound and heavy-lift frame',
    sourceBeat: 'redrock-recovery-yard', sourceStructure: 'compound + warehouse + gantry', landmark: [18, 10.7, -16],
    distinctiveElements: ['warm rock PBR', 'fortified recovery compound', 'freight warehouse', 'connected heavy-lift gantry'],
  },
  factory_line: {
    terrainSurface: 'cobble', terrainTint: 0x716a60, hardstandTint: 0x65615b, buildingTint: 0x91857b,
    structures: [
      at(makeFoundryOffice, 'foundry office', -7, -28, 0.12, 0.8),
      at(makeFactory, 'heavy factory', 17, -30, -0.14, 0.76),
      at(makeStack, 'smokestack', 27, -20, 0, 0.82),
      at(makeWaterTower, 'works water tower', -25, -20, 0, 0.70),
    ],
    treeSpecies: ['poplar', 'birch'], treeCount: 5,
    terrainProfile: 'actual Ironworks spawn excerpt beneath a worn factory hardstand',
    serviceFrame: 'sawtooth works road with foundry service line',
    sourceBeat: 'ironworks-heavy-service', sourceStructure: 'foundry office + factory + stack', landmark: [29, 18.4, -20],
    distinctiveElements: ['industrial cobble PBR', 'sawtooth foundry office', 'heavy factory hall', 'stack and water-tower skyline'],
  },
});
