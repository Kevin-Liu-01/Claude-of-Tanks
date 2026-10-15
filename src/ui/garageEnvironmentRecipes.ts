import type { StructureBuilder } from '../world/maps/exteriorDetailKit.ts';
import {
  makeBathhouse, makeCaravanserai, makeCivicHall, makeFireStation, makeFishery,
  makeFoundryOffice, makeMegatower, makeParkingDeck, makeRangerLodge, makeSchoolhouse,
  makeTavern,
} from '../world/maps/structureKit.ts';
import { MARKET_BUILDERS } from '../world/maps/mapKits.ts';
import {
  makeBoatshed, makeContainerRow, makeGantry, makeLighthouse, makeShed, makeStack,
  makeNetYard, makeWarehouse, makeWaterTower,
} from '../world/maps/railKit.ts';
import {
  makeAlpine, makeChapel, makeCornerShop, makeDepot, makeFarmhouse, makeMinaret,
  makeGranary, makeLogCabin, makeMill, makeOnionChurch, makeWoodshed,
} from '../world/maps/villageKit.ts';
import { makeChurch, makeFactory } from '../world/maps/urbanKit.ts';
import {
  GARAGE_HERO_HEADING_RAD,
  legacyGaragePointToView,
} from '../game/garagePresentationPose.ts';

export type GarageSurfaceKey = 'grass' | 'sand' | 'snow' | 'rock' | 'cobble' |
  'plaster' | 'roof' | 'wood' | 'brick';

interface GarageStructurePlacement {
  readonly builder: StructureBuilder;
  /** Stable exterior-detail catalog key. Never infer this from Function.name:
   * production minification renames builders and silently drops facades. */
  readonly catalogId: string;
  readonly label: string;
  /** Footprint center in the immutable opening-camera coordinate frame. */
  readonly side: number;
  readonly depth: number;
  /** Local +Z shares the immutable hero axis; every facility uses one grid. */
  readonly yaw: number;
  readonly scale: number;
}

export type GarageApproachStyle = 'farm-lane' | 'desert-convoy' | 'snow-road' |
  'urban-street' | 'drydock-lane' | 'rail-fan' | 'monsoon-causeway' |
  'alpine-pass' | 'recovery-trail' | 'foundry-haul-road';

export interface GarageApproachRecipe {
  readonly style: GarageApproachStyle;
  readonly label: string;
  readonly surface: GarageSurfaceKey;
  /** Camera-space route centerline. Depth increases away from the podium. */
  readonly waypoints: readonly (readonly [side: number, depth: number])[];
  readonly width: number;
  /** Optional parallel roads, rails, or ruts measured from the centerline. */
  readonly lanes?: readonly number[];
  /**
   * A depth span a building covers (Cinder's engine shed): the rail roads lay no rails or sleepers inside it, where the
   * shed carries its own pit roads (garageFacilityDetails.ts addEngineShed).
   */
  readonly covered?: readonly [number, number];
  /**
   * A paved forecourt from this depth to the route's end, this wide, kerbed on three sides (Steinburg's Zeughaus: the
   * garage critic panel, 2026-10-14: "a granite-sett forecourt across the full facade with kerbs, carried to the
   * threshold").
   */
  readonly forecourt?: { readonly from: number; readonly width: number };
}

export interface GarageEnvironmentRecipe {
  readonly terrainSurface: GarageSurfaceKey;
  readonly terrainTint: number;
  readonly hardstandTint: number;
  readonly buildingTint: number;
  readonly structures: readonly GarageStructurePlacement[];
  readonly treeSpecies: readonly string[];
  readonly treeCount: number;
  /** Distant relief grammar; flat facilities must not inherit alpine walls. */
  readonly horizonStyle: 'flat' | 'rolling' | 'urban' | 'coastal' | 'alpine' | 'mesa' | 'dune';
  /** Upper bound for the farthest skyline crest above the Garage datum. */
  readonly horizonHeightM: number;
  readonly approach: GarageApproachRecipe;
  /** Vertical compression for a camera-scale Garage excerpt of the real map. */
  readonly reliefScale?: number;
  readonly terrainProfile: string;
  readonly serviceFrame: string;
  readonly sourceBeat: string;
  readonly sourceStructure: string;
  readonly landmark: readonly [number, number, number];
  readonly distinctiveElements: readonly string[];
}

const STRUCTURE_CATALOG_IDS = new Map<StructureBuilder, string>([
  [makeAlpine, 'alpine'], [makeBathhouse, 'bathhouse'], [makeBoatshed, 'boatshed'],
  [makeCaravanserai, 'caravanserai'], [makeChapel, 'chapel'], [makeChurch, 'church'],
  [makeCivicHall, 'civichall'], [makeContainerRow, 'containerrow'],
  [makeCornerShop, 'cornershop'], [makeDepot, 'depot'], [makeFactory, 'factory'],
  [makeFarmhouse, 'farmhouse'], [makeFireStation, 'firestation'], [makeFishery, 'fishery'],
  [makeFoundryOffice, 'foundryoffice'], [makeGantry, 'gantry'], [makeGranary, 'granary'],
  [makeLighthouse, 'lighthouse'], [makeLogCabin, 'logcabin'], [makeMill, 'mill'],
  [makeMinaret, 'minaret'], [makeNetYard, 'netyard'], [makeOnionChurch, 'onionchurch'],
  [makeParkingDeck, 'parkingdeck'], [makeRangerLodge, 'rangerlodge'], [makeShed, 'shed'],
  [makeStack, 'stack'], [makeTavern, 'tavern'], [makeWarehouse, 'warehouse'],
  [makeWaterTower, 'watertower'], [makeWoodshed, 'woodshed'],
  [MARKET_BUILDERS.market, 'market'], [MARKET_BUILDERS.marketRow, 'marketRow'],
  [MARKET_BUILDERS.compound, 'compound'], [MARKET_BUILDERS.compoundSouk, 'compoundSouk'],
  [makeMegatower, 'megatower'], [makeSchoolhouse, 'schoolhouse'],
]);

const at = (builder: StructureBuilder, label: string, x: number, z: number,
  scale = 1): GarageStructurePlacement => {
  const point = legacyGaragePointToView(x, z);
  const catalogId = STRUCTURE_CATALOG_IDS.get(builder);
  if (!catalogId) throw new Error(`Garage structure has no stable catalog id: ${label}`);
  // Catalog structures author their primary facade on local +Z. Keep every
  // facility on the hero's orthogonal yard grid, but reverse the foreground
  // row by 180 degrees so its doors/working face point back into the motor
  // pool. This avoids both radial "staring" buildings and bare rear walls in
  // alternate orbit views.
  return {
    builder,
    catalogId,
    label,
    ...point,
    yaw: GARAGE_HERO_HEADING_RAD + (point.depth < 0 ? Math.PI : 0),
    scale,
  };
};

const atView = (builder: StructureBuilder, label: string, side: number, depth: number,
  scale = 1): GarageStructurePlacement => {
  const catalogId = STRUCTURE_CATALOG_IDS.get(builder);
  if (!catalogId) throw new Error(`Garage structure has no stable catalog id: ${label}`);
  return {
    builder,
    catalogId,
    label,
    side,
    depth,
    yaw: GARAGE_HERO_HEADING_RAD + (depth < 0 ? Math.PI : 0),
    scale,
  };
};

export const GARAGE_ENVIRONMENT_RECIPES = Object.freeze<Record<string, GarageEnvironmentRecipe>>({
  field_shed: {
    terrainSurface: 'grass', terrainTint: 0xb1bd83, hardstandTint: 0x8d8a78, buildingTint: 0xd2c8a4,
    structures: [
      at(makeFarmhouse, 'field farmhouse', -36, -6, 0.88),
      at(makeTavern, 'village tavern', -30, -30, 0.76),
      at(makeShed, 'maintenance shed', -7, -36, 0.82),
      at(makeGranary, 'hedgerow granary', 18, -34, 0.68),
      at(makeWoodshed, 'field stores', 36, -14, 0.70),
      at(makeMill, 'working field mill', -40, 23, 0.58),
      at(makeSchoolhouse, 'village operations school', 31, 29, 0.48),
      at(makeChapel, 'crossroads memorial', -9, 40, 0.48),
    ],
    treeSpecies: ['oak', 'poplar'], treeCount: 24,
    horizonStyle: 'rolling', horizonHeightM: 8.6,
    approach: {
      style: 'farm-lane', label: 'hedgerow motor-pool lane', surface: 'grass', width: 6.8,
      waypoints: [[0, 10], [-2, 24], [-7, 44]],
    },
    terrainProfile: 'actual Verdant Fields spawn excerpt with hedgerow relief',
    serviceFrame: 'farm motor-pool apron and connected maintenance shed',
    sourceBeat: 'verdant-field-maintenance', sourceStructure: 'farmhouse + loading shed', landmark: [-20, 8.4, -27],
    distinctiveElements: ['real grass PBR', 'field farmhouse', 'connected loading shed', 'oak and poplar line'],
  },
  shade_depot: {
    terrainSurface: 'sand', terrainTint: 0xc7a06e, hardstandTint: 0xa99071, buildingTint: 0xcbb58c,
    structures: [
      at(makeCaravanserai, 'wadi caravanserai', -36, -6, 0.84),
      // a water tower, not a minaret, behind the hero (2026-10-10, waves 338, 357, 377: the round white tower with
      // its balcony and cap read as "a lighthouse standing among the dunes" in every frame)
      // in the frame's right third, a turret's width and more clear of the hero (the garage critic panel, 2026-10-14:
      // "the water tower sits on the turret like a hat")
      at(makeWaterTower, 'wadi water tower', 9.9, -38.2, 0.7),
      // flat-roofed and containerised (wave 398: "no European pitched-roof houses in desert or alpine sites"); a low line
      // behind the hero, under its hull's outline
      at(makeContainerRow, 'forward container line', -30, -30, 0.5),
      at(MARKET_BUILDERS.compound, 'wadi supply compound', 18, -34, 0.5),
      at(makeCaravanserai, 'outer adobe court', 36, -14, 0.56),
      at(makeBathhouse, 'wadi crew hammam', 40, -11, 0.66),
      at(makeMinaret, 'outer-route watchtower', 6, 38, 0.58),
      at(MARKET_BUILDERS.marketRow, 'covered quartermaster souk', -41, 23, 0.72),
      at(MARKET_BUILDERS.compoundSouk, 'outer convoy compound', 30, 31, 0.48),
    ],
    treeSpecies: ['palm', 'acacia'], treeCount: 20,
    horizonStyle: 'dune', horizonHeightM: 9.8,
    approach: {
      style: 'desert-convoy', label: 'compacted convoy approach', surface: 'sand', width: 8.4,
      waypoints: [[1, 10], [3, 25], [-5, 46]], lanes: [-2.6, 2.6],
    },
    terrainProfile: 'actual Sirocco Wadi spawn excerpt with dune and mesa shoulder',
    serviceFrame: 'adobe forward depot and open service shade',
    sourceBeat: 'sirocco-wadi-logistics', sourceStructure: 'caravanserai + field shade', landmark: [-22, 7.4, -30],
    distinctiveElements: ['real sand PBR', 'fortified adobe court', 'connected shade bay', 'palm and acacia oasis',
      'covered quartermaster souk', 'convoy compound wall', 'wadi water tower and route watchtower'],
  },
  repair_bunker: {
    terrainSurface: 'snow', terrainTint: 0xe1eaec, hardstandTint: 0xb8c1c3, buildingTint: 0xc2c8c6,
    structures: [
      at(makeRangerLodge, 'winter ranger lodge', -36, -6, 0.82),
      // (the re-judge, 2026-10-15: the chalet stood square behind the turret, the chapel half cut by the frame's right
      // edge): the chalet left of the turret (view side -10, depth 44), the chapel whole in the right third (24, 30)
      at(makeAlpine, 'snow service chalet', -38.18, -24.04, 0.78),
      at(makeChapel, 'frost chapel', -4.24, -38.18, 0.72),
      at(makeLogCabin, 'snowline cabin', 18, -34, 0.66),
      at(makeWoodshed, 'winter stores', 36, -14, 0.68),
      at(makeOnionChurch, 'frostline chapel', 40, -11, 0.56),
      at(makeMill, 'snowfield utility mill', 6, 38, 0.54),
      at(makeSchoolhouse, 'heated recovery schoolhouse', -41, 23, 0.50),
      at(makeRangerLodge, 'avalanche command lodge', 30, 31, 0.48),
    ],
    treeSpecies: ['spruce', 'birch'], treeCount: 26, reliefScale: 0.58,
    horizonStyle: 'rolling', horizonHeightM: 10.2,
    approach: {
      style: 'snow-road', label: 'ploughed recovery road', surface: 'snow', width: 7.4,
      waypoints: [[0, 9], [3, 15], [6.5, 21], [9.5, 26.5]], lanes: [-2.2, 2.2], // to the bunker's portal
    },
    terrainProfile: 'actual Frosthollow spawn excerpt with snowbank relief',
    serviceFrame: 'snowbound lodge yard and sheltered repair chalet',
    sourceBeat: 'frosthollow-recovery', sourceStructure: 'ranger lodge + alpine chalet', landmark: [-20, 10.7, -28],
    distinctiveElements: ['real snow PBR', 'deep-roof lodge', 'alpine service chalet', 'spruce and birch windbreak',
      'heated recovery schoolhouse', 'avalanche command post', 'snowbound chapel cluster'],
  },
  brick_arsenal: {
    // the banks round the arsenal are dusty grass embankments; only its boulevard is cobbled (waves 408 and 419: "a huge
    // cobblestone embankment curls up around the bay like the inside of a bowl")
    terrainSurface: 'grass', terrainTint: 0x8f9a74, hardstandTint: 0x787b79, buildingTint: 0xa6907e,
    structures: [
      at(makeFactory, 'urban factory', -39, -6, 0.76), // 2.1 m out: clear of the Zeughaus
      // off the frame's left, so the Zeughaus has the sky over its roof (the garage critic panel, 2026-10-14: "move the
      // building 15-25 m back until the whole roofline and both gables fit with sky above")
      at(makeFireStation, 'Steinburg fire station', -39.6, 11.3, 0.62),
      at(makeCornerShop, 'arsenal corner shop', -7, -36, 0.74),
      at(makeChurch, 'old-city church', 18, -34, 0.54),
      at(makeFactory, 'arsenal annex', 36, -14, 0.56),
      at(makeCivicHall, 'arsenal administration', 40, -11, 0.50),
      at(makeParkingDeck, 'armored vehicle depot', 6, 38, 0.58),
      at(makeMegatower, 'damaged arsenal high-rise', -42, 24, 0.34),
      at(makeCornerShop, 'munition street frontage', 31, 31, 0.54),
    ],
    treeSpecies: ['poplar', 'oak'], treeCount: 18,
    horizonStyle: 'urban', horizonHeightM: 9.4,
    approach: {
      // straight on the Zeughaus's axis to its gate, a sett forecourt across its whole facade
      style: 'urban-street', label: 'cobbled arsenal boulevard', surface: 'cobble', width: 9.2,
      waypoints: [[0, 10], [0.2, 22], [0.2, 33.3]], lanes: [-3.1, 3.1], forecourt: { from: 27, width: 31 },
    },
    terrainProfile: 'actual Steinburg spawn excerpt beneath a cobbled arsenal apron',
    serviceFrame: 'city appliance bay and brick industrial loading road',
    sourceBeat: 'steinburg-arsenal', sourceStructure: 'fire station + urban factory', landmark: [-21, 14.1, -29],
    distinctiveElements: ['real cobble PBR', 'hose tower fire station', 'brick factory facade', 'restrained city tree line',
      'damaged high-rise skyline', 'munition street frontage', 'armored parking depot'],
  },
  naval_drydock: {
    terrainSurface: 'grass', terrainTint: 0xa9b79d, hardstandTint: 0x829a9b, buildingTint: 0xc8d2cd,
    structures: [
      at(makeFishery, 'working fishery', -36, -6, 0.78),
      // off the hero's axis to the far left (it rose out of the turret: the garage critic panel, 2026-10-14)
      at(makeLighthouse, 'harbor lighthouse', -45.25, 5.66, 0.84),
      at(makeBoatshed, 'harbor boatshed', 6.36, -40.3, 0.72), // beyond the crane's new berth
      at(makeShed, 'drydock service bay', 18, -34, 0.78),
      at(makeBoatshed, 'breakwater boatshed', 36, -14, 0.62),
      at(makeNetYard, 'rigging and net yard', 40, -11, 0.66),
      at(makeWarehouse, 'harbor stores', 6, 38, 0.52),
      at(makeFishery, 'breakwater repair fishery', -41, 23, 0.46),
      at(makeLighthouse, 'outer approach light', 31, 31, 0.56),
    ],
    treeSpecies: ['cedar', 'pine'], treeCount: 22,
    horizonStyle: 'coastal', horizonHeightM: 5.8,
    approach: {
      // the causeway ends at the quay edge, where the shore falls to the sea (2026-10-11)
      style: 'drydock-lane', label: 'reinforced drydock causeway', surface: 'cobble', width: 8.6,
      waypoints: [[0, 10], [-2, 22], [-1.5, 32]], lanes: [-3.0, 3.0],
    },
    terrainProfile: 'actual Saltmere Bay spawn excerpt with wind-cut maritime ground',
    serviceFrame: 'harbor work apron, fishery dock and drydock service shelter',
    sourceBeat: 'saltmere-harbor-service', sourceStructure: 'fishery + lighthouse + shed', landmark: [25, 16.2, -31],
    distinctiveElements: ['maritime grass PBR', 'working fishery dock', 'harbor lighthouse', 'cedar and pine breakwater',
      'twin approach lights', 'rigging yard', 'breakwater repair frontage'],
  },
  rail_roundhouse: {
    // cinder ballast ground, not a paved hillside (2026-10-10, wave 377: "a vast, empty cobbled slope")
    // soot-dark railway brick (the garage critic panel, 2026-10-14: "clean brick ... darker engineering brick")
    terrainSurface: 'rock', terrainTint: 0x6e6860, hardstandTint: 0x6f6960, buildingTint: 0x86735f,
    structures: [
      at(makeWarehouse, 'freight warehouse', -38, -6, 0.78), // 1.4 m further out: clear of the engine shed (GA.04)
      // over the roads behind the engine shed (GA.04: 4.2 m further back, clear of the shed's terrace)
      at(makeGantry, 'rail gantry', -33, -33, 0.82),
      at(makeContainerRow, 'container rank', -7, -36, 0.74),
      at(makeWaterTower, 'junction water tower', 18, -34, 0.72),
      at(makeWarehouse, 'roundhouse annex', 36, -14, 0.58),
      at(makeDepot, 'Cinder Junction station', 40, -11, 0.72),
      at(makeFactory, 'locomotive machine shop', 6, 38, 0.54),
      atView(makeShed, 'three-road engine shed', -42, -24, 0.76),
      atView(makeGantry, 'roundhouse transfer crane', 30, -42, 0.60),
      atView(makeDepot, 'junction passenger depot', 42, 31, 0.50),
    ],
    treeSpecies: ['poplar', 'birch'], treeCount: 16,
    horizonStyle: 'flat', horizonHeightM: 5.8,
    approach: {
      style: 'rail-fan', label: 'three-road roundhouse fan', surface: 'cobble', width: 4.2,
      // straight through the engine shed (GA.04): the roads run square into its doors and out of its back
      waypoints: [[0, 9], [0, 27], [0, 49]], lanes: [-6.2, 0, 6.2], covered: [18.6, 35.4],
    },
    terrainProfile: 'actual Cinder Junction spawn excerpt with cinder and rail-yard grades',
    serviceFrame: 'rail-served overhaul apron beneath a connected gantry',
    sourceBeat: 'cinder-junction-overhaul', sourceStructure: 'warehouse + gantry + containers', landmark: [19, 11.6, -19],
    distinctiveElements: ['cinder cobble PBR', 'freight warehouse', 'connected crane gantry', 'authored container rank',
      'three-road engine shed', 'roundhouse transfer crane', 'station frontage', 'water-tower skyline'],
  },
  rain_canopy: {
    terrainSurface: 'grass', terrainTint: 0x779978, hardstandTint: 0x708079, buildingTint: 0xa4af99,
    structures: [
      at(makeBathhouse, 'monsoon bathhouse', -38.2, -5.66, 0.8), // clear of the wider covered bay
      at(makeDepot, 'ridge field depot', -33, -33, 0.8), // behind the covered bay (garage round 7)
      at(makeFishery, 'ridge longhouse workshop', -5, -39, 0.62), // clear of the covered bay
      at(makeShed, 'rain service canopy', 18, -34, 0.76),
      at(makeLogCabin, 'ridge crew lodge', 36, -14, 0.64),
      at(makeGranary, 'raised ration store', 40, -11, 0.64),
      at(makeNetYard, 'monsoon cable yard', 6, 38, 0.62),
      at(makeBoatshed, 'flood-response boathouse', -41, 23, 0.58),
      at(makeBathhouse, 'ridge operations hall', 31, 31, 0.48),
    ],
    // Fourteen shared three-tree groves still read as a dense wet perimeter,
    // while staying below the strict 50k Garage geometry budget.
    // Eleven shared three-tree groves retain a dense 33-tree tropical ring;
    // higher counts duplicated off-axis canopy detail that was invisible from
    // the Garage stage while pushing the environment beyond its 50k budget.
    treeSpecies: ['eucalyptus', 'palm'], treeCount: 22, reliefScale: 0.72,
    horizonStyle: 'rolling', horizonHeightM: 10.4,
    approach: {
      style: 'monsoon-causeway', label: 'drained ridge causeway', surface: 'rock', width: 7.8,
      waypoints: [[0, 10], [0, 25], [0, 46]], lanes: [-3.3, 3.3], // straight through the covered bay
    },
    terrainProfile: 'actual Monsoon Ridge spawn excerpt with drainage relief',
    serviceFrame: 'raised depot terrace and connected rain-service shelter',
    sourceBeat: 'monsoon-ridge-field-bay', sourceStructure: 'bathhouse + field depot + shed', landmark: [-21, 7.7, -28],
    distinctiveElements: ['wet green PBR ground', 'domed field bathhouse', 'raised supply depot', 'eucalyptus and palm canopy',
      'flood-response boathouse', 'drainage causeway', 'cable and manifold yard'],
  },
  rock_cavern: {
    terrainSurface: 'snow', terrainTint: 0xd7e0e1, hardstandTint: 0x9da7a8, buildingTint: 0xb8b6aa,
    structures: [
      // a military pass station of steel sheds, containers and a plant house (wave 398: no chalets, chapels or domes)
      // at the cliff's foot, clear of its face (the cliff now runs 46 m across the frame: the garage critic panel)
      at(makeWarehouse, 'glacier vehicle store', -34.65, 0.71, 0.6),
      at(makeContainerRow, 'pass container line', -30, -30, 0.55),
      at(makeFireStation, 'pass plant house', -2.1, -31.8, 0.5),
      at(makeShed, 'pass service shelter', 18, -34, 0.72),
      at(makeContainerRow, 'glacier outpost containers', 36, -14, 0.45),
      at(makeWaterTower, 'high-pass water tank', 40, -11, 0.6),
      at(makeWarehouse, 'avalanche patrol garage', 6, 38, 0.5),
      at(makeDepot, 'cliff rescue depot', -41, 23, 0.5),
      at(makeContainerRow, 'high-pass rescue containers', 31, 31, 0.5),
    ],
    treeSpecies: ['spruce', 'fir'], treeCount: 28, reliefScale: 0.38,
    horizonStyle: 'alpine', horizonHeightM: 13.2,
    approach: {
      style: 'alpine-pass', label: 'snowbound cavern approach', surface: 'snow', width: 7.2,
      waypoints: [[0, 9], [3, 15], [6.5, 21], [8.5, 26.5]], lanes: [-2.4, 2.4],
    },
    terrainProfile: 'actual Glacier Pass spawn excerpt with steep alpine shoulder',
    serviceFrame: 'high-pass recovery terrace between lodge and chalet',
    sourceBeat: 'glacier-pass-service', sourceStructure: 'ranger lodge + chalet + chapel', landmark: [28, 13.6, -33],
    distinctiveElements: ['snow and rock terrain', 'deep-roof lodge', 'alpine chalet', 'spruce and fir ridge line',
      'cliff rescue station', 'avalanche portal', 'high-pass chapel cluster'],
  },
  recovery_yard: {
    terrainSurface: 'rock', terrainTint: 0xb16d4f, hardstandTint: 0x8d6e5e, buildingTint: 0xb69678,
    structures: [
      at(makeCaravanserai, 'redrock compound', -36, -6, 0.74),
      // the warehouse stood square behind the turret, its dark roof against the hero's outline (the re-judge, 2026-10-15):
      // a smaller store right of it, its roof under the turret's line from the Garage camera (view side 9, depth 44)
      at(makeWarehouse, 'recovery warehouse', -24.75, -37.48, 0.45),
      // the map's grey gantry stood behind the yard's own red recovery gantry, two lattices crossing in the frame's right
      // third (stills ticket 6, 2026-10-15): it now stands behind the showroom lens on the right, seen from the orbit
      atView(makeGantry, 'heavy lift gantry', 17, -38, 0.76),
      at(makeWaterTower, 'divide water tower', 18, -34, 0.68),
      at(makeContainerRow, 'salvage container line', 36, -14, 0.62),
      at(makeShed, 'recovery fabrication shed', 40, -11, 0.72),
      at(makeCaravanserai, 'mesa crew compound', 6, 38, 0.54),
      at(MARKET_BUILDERS.compound, 'salvage fortification', -41, 23, 0.50),
      at(makeGantry, 'canyon recovery bridge', 31, 31, 0.56),
    ],
    // acacia and scrub oak only: a cedar read as "a stray spruce instead of badlands" (wave 408)
    treeSpecies: ['acacia', 'oak'], treeCount: 12, reliefScale: 0.72,
    horizonStyle: 'mesa', horizonHeightM: 11.8,
    approach: {
      style: 'recovery-trail', label: 'tracked recovery trail', surface: 'rock', width: 8.0,
      waypoints: [[0, 10], [3, 26], [-5, 46]], lanes: [-2.7, 2.7],
    },
    terrainProfile: 'actual Redrock Divide spawn excerpt with terraced mesa relief',
    serviceFrame: 'mesa recovery compound and heavy-lift frame',
    sourceBeat: 'redrock-recovery-yard', sourceStructure: 'compound + warehouse + gantry', landmark: [18, 10.7, -16],
    distinctiveElements: ['warm rock PBR', 'fortified recovery compound', 'freight warehouse', 'connected heavy-lift gantry',
      'salvage fortification', 'canyon recovery bridge', 'mesa water-tower silhouette'],
  },
  factory_line: {
    // slag and cinder ground round the works (wave 377: "a paved hillside rather than a workshop yard")
    terrainSurface: 'rock', terrainTint: 0x5f5953, hardstandTint: 0x65615b, buildingTint: 0x91857b,
    structures: [
      at(makeFoundryOffice, 'foundry office', -37.8, -4.6, 0.8), // clear of the wider crane bay
      at(makeFactory, 'heavy factory', -31, -31, 0.76), // 1.4 m back: clear of the crane bay (garage round 7)
      at(makeStack, 'smokestack', -7, -36, 0.82),
      at(makeWaterTower, 'works water tower', 18, -34, 0.70),
      at(makeWarehouse, 'works warehouse', 36, -14, 0.58),
      at(makeParkingDeck, 'works vehicle depot', 40, -11, 0.48),
      at(makeGantry, 'foundry transfer gantry', 6, 38, 0.66),
      atView(makeFireStation, 'works emergency hall', -42, -24, 0.52),
      atView(makeContainerRow, 'rail-fed component rank', 30, -42, 0.60),
    ],
    treeSpecies: ['poplar', 'birch'], treeCount: 14,
    horizonStyle: 'flat', horizonHeightM: 7.8,
    approach: {
      style: 'foundry-haul-road', label: 'rail-served foundry haul road', surface: 'cobble', width: 9.0,
      waypoints: [[0, 10], [0, 27], [0, 48]], lanes: [-3.2, 3.2], // straight under the crane bay
    },
    terrainProfile: 'actual Ironworks spawn excerpt beneath a worn factory hardstand',
    serviceFrame: 'sawtooth works road with foundry service line',
    sourceBeat: 'ironworks-heavy-service', sourceStructure: 'foundry office + factory + stack', landmark: [29, 18.4, -20],
    distinctiveElements: ['industrial cobble PBR', 'sawtooth foundry office', 'heavy factory hall', 'stack and water-tower skyline',
      'works emergency hall', 'rail-fed component rank', 'transfer gantry line'],
  },
});
