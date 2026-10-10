import { placeWreckCollision, placeWreckShellCollision } from './wreckCollision.ts';
import { boxCorners, convexSlabs, slabParts } from './slabCollision.ts';
// src/world/props.ts — rocks, ~10-building village, walls and cover props.
// Contract: docs/ARCHITECTURE.md §3.2. All geometry composed BufferGeometry,
// all textures canvas-generated, everything merged into few draw calls.

import type { OrbitalPlacement } from './maps/marsSettlement.ts';
import * as THREE from 'three';
import { configureWorldLampMaterial, registerWorldNightLighting } from './worldNightLighting.ts';
import { ensureWorldNightEmissionMask, markWorldWindowPane } from './worldNightEmissionGeometry.ts';
import { prepareWorldStaticNightFixture, prepareWorldStructureNightFixture, setWorldNightFixtureActive } from './worldNightFixtureInstances.ts';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergePropsMaterialGeometrySteps } from './propsMaterialGeometry.ts';
import { CrushableClutter, bindClutterBatch, isLooseSurfaceRock } from './crushableClutter.ts';
import { SimplexNoise } from '../engine/simplexFast.ts';
import {
  normalTextureFromHeight as normalFromHeight,
  textureFromRgbaPixels as toTexture,
  tileableTorusNoise as torusN,
} from './proceduralTexture.ts';
import { paintLimeRender, paintLimewash, paintNipaThatch } from './regionalSurfaces.ts'; // a kit's render and thatch painters (the facades lane)
import { graveParts } from './maps/regional/yards.ts'; // a churchyard's graves (placeYards; the facades lane)
import type { YardStyle } from './maps/regional/types.ts';
import { applyTone, terrainNearMeshHeightAt, type HeightField, type TerrainLayout } from './terrain.ts';
import { authoredRoadStationCount, authoredRoadStationIndex, buildingRoadStationIndices } from './maps/roadStations.ts';
import { roadSettlementJunction } from './roadSettlementJunction.ts';
import { roadFencePath, fencePathSampler } from './roadFencePath.ts';
import { buildingFootprintClearsRoads, roadBuildingFrontage, roadBuildingDoorAxis, roadBuildingClearanceCandidates, roadParcelAddsNoExclusion,
  type RoadFrontageSite } from './roadBuildingFrontage.ts';
import { getDeviceTier, resolvePresetName } from '../engine/quality.ts';

// Environment richness (2026-09-14, owner: "add back so much environmental details — they
// feel much barer now"): desktop tiers place 35 % more settlement and roadside clutter than
// the authored per-map counts (stalls, benches, core clutter, bales, stooks, sleds, drums,
// pots, trucks, cars, drum clusters, loose clutter, camps). Mobile keeps the authored counts.
// Applied at the count reads so every map's authoring stays byte-identical.
// Read at call time: the device tier is resolved after module evaluation.
const DESKTOP_ENVIRONMENT_RICHNESS = 1.35;
// Layout identity (destruction core lane, 2026-10-08, the coordinator's ruling): every tier places the desktop's counts
// — the clutter is records (it blocks movement, shells and sight) and the authority's indices are the desktop's.
export function environmentRichness(): number { return DESKTOP_ENVIRONMENT_RICHNESS; }
// A function declaration: roadStations.selftest.mjs extracts and executes the production placement
// functions from this source, and they read their counts through this helper.
function richCount(n: number | undefined, fallback = 0): number { return Math.round((n ?? fallback) * environmentRichness()); }
import { markShadowOnly, setShadowCasterCascades, setShadowCasterProfile, type ShadowCasterProfile } from '../engine/renderLayers.ts';
import { registerRetainedObject3DResources } from '../engine/resourceLifetime.ts';
import { destructibleCastsShadow } from './destructibleRenderPolicy.ts';
import { buildGroundMarkingGeometry, pavedGround, wornPaintTexture, type GroundMarkingsConfig } from './groundMarkings.ts';
import {
  applySourcedBuildings, applySourcedRock, sourcedStoneIsBrick, type BuildingPaletteId, type SourcedTerrainSettings,
  type SourcedTextureApplicationOptions,
} from './sourcedTextures.ts';
import type { SourcedTextureResult } from './sourcedTextureReceipt.ts';
import { URBAN_BUILDERS } from './maps/urbanKit.ts';
import { dressMapExtras, type AnimatedDressing } from './maps/mapKits.ts'; // content_breadth r2
import { STEEL_ATLAS_SIZE, STEEL_ATLAS_SIZE_MOBILE, makeSteelAtlas, steelAtlasNeeded, type SteelAtlasTextures } from './propsSteelAtlas.ts'; // round 75
import { planYardDressing, yardStructureKinds, type YardFamily, type YardStructure } from './yardDressing.ts'; // round 75
import { buildYardFamily, yardInstanceLivery, type YardMaterial } from './maps/yardClutterKit.ts'; // round 75
import {
  applyRockShaderHook, boulderKindFor, boulderSectionRadius, boulderSections, buildBoulderForm, createRockDepthMaterial, makeRockDetail, paintBoulder,
  rockAngularityFor, rockDressingFor, rockLithologyFor,
} from './rockDressing.ts'; // round 75 item 6
import { applyPoleTimberHook, markPoleTimber, roundPoleShaft } from './poleTimber.ts'; // the scenery lane: the telegraph poles' timber
import { applyRailBallastHook } from './railBallast.ts'; // the ground lane (wave 234): the rail kit's crushed-stone bed
import { composeFieldWorks, composeScenery } from './scenery.ts'; // the scenery lane, 2026-10-03
import { composeLandmarks } from './landmarks/compose.ts'; // the landmarks lane, 2026-10-05
import type { LandmarkPlacement } from './landmarks/types.ts';
import { buildFieldWallFineSteps, type FieldWallFineSource } from './fieldWorks.ts'; // b17: the walls stone by stone near the camera
import { TREE_ARCHETYPES, TREE_GEOMETRY_SCALE, type TreeSpecies } from './treeSpecies.ts';
import type { GroundCoverHole, SceneryMapConfig } from './sceneryPlan.ts';
type SceneryHardstand = { x: number; z: number; width: number; length: number; yawDeg?: number };
import { SCENERY_DESTRUCTIBLE_TYPES, buildSandbagBedding, buildSandbagHeap, buildSandbagStack, paintBurlap } from './maps/sceneryKit.ts';
import {
  FIELD_STONE_PRINT_SEED, liftFieldStoneMean, paintFieldStoneBuffers as paintFieldStoneBuffersInline, type FieldStoneBuffers,
  type FieldStoneLithology,
} from './fieldStoneSurface.ts';
import { paintDryWallBuffers } from './fieldWallFace.ts';
import { HAY_PRINT_SEED, paintHayBuffers as paintHayBuffersInline } from './hayPrint.ts';
import {
  registerPaintNoise, settledPaint, surfacePaintKey, type SurfacePaintPrefetch, type SurfacePaintRequest,
} from './surfacePaintPrefetch.ts';
import { paintStructureDetailBuffers, type StructureDetailBuffers } from './structureDetailTile.ts';
import { HAYSTACK_DESTRUCTIBLE_TYPES, HAYSTACK_STYLE_BY_MAP, HAYSTACK_STYLE_KINDS, type HaystackStyle } from './maps/haystackKit.ts';
import { periodClutterTypes } from './maps/periodClutterKit.ts';
import { STRUCTURE_VARIANTS } from './maps/regional/ksarGate.ts'; // b16: the ksar gate post for the checkpoint hut
import { applyMudWallHook, createMudWallDepthMaterial, mudShapeFor, MUD_SLUMP_M } from './mudWallShader.ts';
import { applyStoneWallHook, createStoneWallDepthMaterial, stoneShapeFor, STONE_SETTLE_M } from './stoneWallShader.ts';
import { createWireMesh } from './wireMaterial.ts'; // the power lines' conductors (the scenery lane, wave 48) // the field walls' rubble print (the scenery lane)
import { FIELD_MUD_PLAIN_V, paintFieldMudBuffers, mudEarthOfGround, tintFieldMudToEarth } from './fieldMudSurface.ts'; // the mud walls' worn render (the scenery lane)
import { buildSnowLoad, createWallDressing } from './maps/fieldWallDressing.ts'; // the walls' ground and weather (the scenery lane)
import { buildBuildingDrifts, buildPloughBanks } from './maps/buildingSnowDrifts.ts'; // (the map-revival lane, round 2)
import { structureCollisionOpenIds } from './maps/structureCollision.ts';
import { mooredHullPose, type MooredHullPose } from './maps/mooredHullMotion.ts'; // round 67
import type { WaterDisturbance } from './shallowWater.ts';
import type { RiverLandingAnchor } from './maps/riverLandings.ts';
// world-dressing r1: building-catalog extension + destructible small props
import { VILLAGE_BUILDERS } from './maps/villageKit.ts';
import {
  ADOBE_UV_PER_M,
  COURSED_WALLSTONE,
  DESTRUCTIBLE_TYPES,
  DRY_STONE_KIND,
  FENCE_SEG,
  WALL_SEG,
  bSandbagBroken,
  type DestructiblePropType,
  buildAdobePilaster,
  buildDryStoneWallHead,
  civilianVehicleTypes,
} from './maps/inhabitKit.ts';
import { CIVILIAN_VEHICLE_RECEIPTS, pickCivilianVehicleKind } from './maps/civilianVehicleKit.ts';
import { CART_RECEIPTS } from './maps/cartKit.ts';
import { RUNNER_SNOW_SINK_M } from './maps/cartBodies.ts';
// the map-vehicles lane (2026-10-05): the vehicles' surface stream and liveries, their ground-contact patches
import { applyVehicleSurfaceHook, VEHICLE_SURFACE_PROGRAM } from './maps/vehicleSurface.ts';
import {
  boatMudHoles, buildBoatMud, buildBoatMudRims, buildHullWaterRings, buildRunnerTracks, buildVehicleContactShadows,
  vehicleShadowCaster,
} from './maps/vehicleContactShadow.ts';
import {
  CART_SLIDE_MAX_M, PARKED_VEHICLE_CLEARANCE, polygonGap, seatCartsClear, separateParkedVehicles, shapePolygons, VEHICLE_SLIDE_MAX_M,
  type FootprintPolygon,
} from './parkedVehicleSeparation.ts';
import {
  boxClearOfPoints, boxClearOfRoadCore, discClearOfRoadCore, sharpRoadBends, shiftClearOfRoadCore,
} from './roadFootprint.ts';
import { FISHERY_WHARF_LAKE_INDEX } from './fisheryWharfSite.ts';
import { composeLoggingYard, type FieldTimberPiece, type LoggingYardConfig } from './loggingYard.ts';
import { composeReservoirWaterworks, type ReservoirWaterworksConfig, type WaterworksRubblePacket } from './reservoirWaterworks.ts';
import { composeMangroveFisheryWharf, type FisheryPacket, type FisheryVegetation } from './mangroveFisheryWharf.ts';
import { composeFoundryServiceCourt, type FoundryDonor, type FoundryServiceCourtConfig } from './foundryServiceCourt.ts';
import {
  captureAutumnCropRow, autumnHeadlandSite, autumnHeadlandClearsRows,
  type AutumnCropRow, type AutumnHeadlandSite,
} from './autumnHeadlands.ts';
import {
  DESTRUCTIBLE_BUILDING_TYPES, REGIONAL_DESTRUCTIBLE_TYPES, STRUCTURE_BUILDERS, makeTimberBathhouse,
} from './maps/structureKit.ts';
import {
  addCatalogExterior, addConnectedExterior, carryExteriorChimneyTops, exteriorChimneyTops,
} from './maps/exteriorDetailKit.ts';
import { registerWorldDestructibles, emitBreakFx, emitDestroyed } from './destructibles.ts';
import { setToppleAxis, settledToppleAngle } from './topple.ts';
import { createUtilityNetwork } from './utilityNetwork.ts';
import {
  LOOSE_PROP_STEP_S, createLoosePropBody, kickLooseProp, resetLoosePropBody,
  resolveLoosePropObstacle, resolveLoosePropPair, stepLoosePropBody,
} from './loosePropPhysics.ts';
import {
  cloneCollisionRecord, collisionFootprintContainsPoint, convexHull2, setCircleShape, setCompoundShape, setConvexShape,
  setObbShape, type SimpleCollisionShape,
} from './collision.ts';
import {
  applyRockCollisionProfile, localShellSlabs, placeLocalShellSlabs, rockCollisionProfile, rockFormOf, rockGroundAt,
  rockStaysCrushable,
  type RockCollisionProfile, type RockForm,
} from './rockCollision.ts'; // the hitbox lane, 2026-10-07
/** A hedgehog beam's slabs are at most this tall (m; the hitbox lane, 2026-10-07). */
const HEDGEHOG_SLAB_M = 0.35;
const _hedgehogBeam = new THREE.Matrix4(), _hedgehogTilt = new THREE.Matrix4();
/** Pooled kinds whose shell records are the slabs of their own geometry (the hitbox lane, 2026-10-07). */
export const SLAB_SHELL_KINDS: ReadonlySet<string> = new Set(['sandbagbig', 'sandbagsmall', 'sandbagwall']);
import {
  appendStructureCollisionBand, applyStructureCollisionBand,
  deriveRuntimeStructureCollisionProfile, deriveRuntimeStructureCollisionWithSolids,
  deriveRuntimeStructureContactBand,
} from './structureCollision.ts';
import {
  attachGroundCoverSolidProfile, createGroundCoverSolidProfile, GROUND_COVER_PLACEMENT_BYTES, letGroundCoverLap,
  type GroundCoverSolidProfile,
} from './groundCoverClearance.ts';
import {
  cropRowSegmentIsSupported, hedgehogBeamSpecs, planGroundedObbPose, planGroundedSegment, planUtilityPoleStation,
  sampleDiscGround, sampleObbGround, type GroundedSegmentEndpoint,
} from './propPlacement.ts';
import {
  box, gablePrism, jitterUV, makeTelephonePoleDistanceGeometry,
  pitchRoofPlane, pitchSkillionRoof, scaleUV, slabBox,
} from './propGeometry.ts';
// DESTRUCTIBLES r1: real-roster tank wrecks baked to static geometry
import { bakeTankWreckSteps, bakeWreckDebris, wreckRemnantPaint, type WreckBake } from './wrecks.ts';
import type { VehicleSetPiece } from './maps/vehicleSetPieces.ts';
import { createWreckBakeClient } from './wreckBakeClient.ts';
import type { WreckBakePrefetch } from './wreckBakePrefetch.ts';
import { resolveWreckRoster } from './wreckRoster.ts';
import { mergeWreckGeometries } from './exactWreckGeometry.ts';
import { fitWallSpan, wallIslandEdges, type WallSpan } from './wallSpanPlacement.ts';
import { ensureTankBuilder } from '../vehicles/fleetFactory.ts';
import { isPostwarVehicleEra } from '../vehicles/taxonomy.ts';
import { preloadPropModels, requirePropModels, type BakedPropModel } from './propsModelStore.ts';
import {
  resolveRowhouseTrimBucket, resolveStructureWindowStyle, writeStructureInstanceTint,
} from './structureInstanceAppearance.ts';
import {
  SOURCED_STRUCTURE_TYPES, type SourcedStructureType,
} from './sourcedStructureTypes.ts';
import type { CollisionRecord } from './collision.ts';
import type { LoosePropBody, LoosePropKickCause } from './loosePropPhysics.ts';
import type { UtilityNetwork } from './utilityNetwork.ts';
import { attachStructureBuildContext, type GeometryBuckets, type StructureBuildContext, type StructureDimensions } from './maps/exteriorDetailKit.ts';
// regional-buildings lane (2026-10-03): the map's regional architecture kit replaces each placed building's geometry
// after its placement is settled (maps/regional/index.ts) and paints the kit's roof and masonry (regionalSurfaces.ts)
import { buildRegionalParts, kitLegacy, rebuildRegionalStructure, resolveRegionalArchitecture } from './maps/regional/index.ts';
import {
  bindStructureSpans, describeStructure, tagStructureVertices, type StructureMaterialEntry, type StructureSpan,
} from './structureDamageSeam.ts';
import { setDefaultKitStyleReader } from './destructionDefaultKit.ts';
import type { StructureDamageAnatomy } from './destructionKit.ts';
import { createStructureDamage } from '../sim/structureDamage.ts';
import { EARTH_ARCHITECTURE_STYLES } from '../sim/structureMaterial.ts';

// destruction (docs/DESTRUCTION.md §16): the default damage kit reads a style's surfaces through the regional registry;
// which styles build in earth is the simulation's list (structureMaterial.ts), so a ram prices the walls the kit breaks
setDefaultKitStyleReader((id) => {
  const style = resolveRegionalArchitecture(id);
  return style ? { stoneKind: style.surfaces.stone.kind, roofKind: style.surfaces.roof.kind,
    concrete: !!style.surfaces.concrete, earth: EARTH_ARCHITECTURE_STYLES.has(style.id) } : null;
});

/** A structure as the world described it at build time (docs/DESTRUCTION.md §16): its kit's anatomy and its spans. */
export interface WorldStructureDamage {
  builder: string;
  style: string | null;
  anatomy: StructureDamageAnatomy;
}
import { YARD_SHED, gardenParts, planYard, yardKeepOut, type YardWorld } from './maps/regional/yards.ts';
import { hashSeed, streamFrom } from './maps/regional/geometry.ts';
import type { RegionalBuildContext, RegionalGround } from './maps/regional/types.ts';
import { makeRegionalConcrete, makeRegionalRoof, makeRegionalStone } from './regionalSurfaces.ts';
import { ASSAULT_TRENCH, FIELD_TRENCH } from '../sim/assaultLines.ts';
import { deploymentClearings } from '../sim/matchPlacement.ts';
import { MATCH_OBJECTIVE_LAYOUTS } from '../sim/matchObjectiveLayouts.ts';
import { geologyBoulderSite, restsOnTalus, TALUS_DEG } from './landformGeology.ts';
// Build-time-baked licensed models (see tools/bake-props-models.mjs +
// docs/ATTRIBUTION.md). The exact float/index streams live in a gzip-packed
// binary archive; createMapAsync starts it while terrain is being constructed.
export { preloadPropModels };

// Per-category switch: sourced model vs procedural, set from side-by-side
// screenshot judging on 2026-07-27 (record in docs/ATTRIBUTION.md). Only the
// two winners survive; every losing category (buildings, ruin, rocks, fences,
// hay, haystacks, barrels, trees, tank wrecks) stays procedural and its
// models were removed from the repo.
const SOURCED = {
  sandbags: true, // sandbag emplacements — no procedural equivalent, fits the palette
  poles: true,    // telephone poles with crossarms/insulators/wire beat the plain cylinders
};

type Rng = () => number;
type ToneFunction = (
  hue: number,
  saturation: number,
  lightness: number,
) => readonly [number, number, number];
type MaterialShader = Parameters<THREE.Material['onBeforeCompile']>[0];
type MaterialShaderHook = (shader: MaterialShader) => void;
type PropsBuckets = GeometryBuckets & Record<string, THREE.BufferGeometry[]>;

interface CompletePropsBuckets extends GeometryBuckets {
  plaster: THREE.BufferGeometry[];
  plaster2: THREE.BufferGeometry[];
  plaster3: THREE.BufferGeometry[];
  stone: THREE.BufferGeometry[];
  roof: THREE.BufferGeometry[];
  wood: THREE.BufferGeometry[];
  dark: THREE.BufferGeometry[];
  glass: THREE.BufferGeometry[];
  curtain: THREE.BufferGeometry[];
  /** (and, on a map with a kit's thatched roofs, `thatch`: those roofs, split from the straw at the merge — makeThatch) */
  straw: THREE.BufferGeometry[];
  baked: THREE.BufferGeometry[];
  steel: THREE.BufferGeometry[];
  structureMetal: THREE.BufferGeometry[];
  /** regional kits: painted joinery and timber framing (the light kit's vertex-coloured wood material) */
  structureWood: THREE.BufferGeometry[];
  /** regional kits: weathered render, masonry and roofs (maps/regional/weather.ts) — the plaster, stone and roof
   * surfaces under a per-vertex tint (each house its own shade, damp at the wall foot, moss toward the eaves) */
  regionalPlaster: THREE.BufferGeometry[];
  regionalPlaster2: THREE.BufferGeometry[];
  regionalPlaster3: THREE.BufferGeometry[];
  regionalStone: THREE.BufferGeometry[];
  regionalRoof: THREE.BufferGeometry[];
  [name: string]: THREE.BufferGeometry[];
}
type PropsStructureBuilder = (
  rng: Rng,
  buckets: PropsBuckets,
  wallBucket?: string,
) => StructureDimensions;

interface EngineContext {
  anisotropy?: number;
  setupShadowMaterial(material: THREE.Material, hook?: MaterialShaderHook | null): void;
}

interface SurfaceTextureOptions {
  rust?: Float32Array | null;
  roughMin?: number;
  roughMax?: number;
  aoMin?: number;
}

/** The field walls' cells and their two batches, the near form's and the far form's (b13; updateFieldWallLod). */
interface FieldWallLod {
  near: THREE.BatchedMesh | null;
  far: THREE.BatchedMesh | null;
  cells: Array<{
    box: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }; near: number; far: number; nearShown: boolean;
    /** (b17) The cell's key, and its stone form while the camera is near (built on demand; false: built, nothing in it). */
    key: number; stones: THREE.Mesh | false | null; midShown: boolean;
  }>;
  /** (b17) What the stone forms are built from (null on a phone), and the walls' material they share. */
  fine: FieldWallFineSource | null;
  material: THREE.Material;
  /** (b17) The cells that want their stone form and have none yet, at the last switch (map.ts getFieldWallWorkState). */
  pending?: number;
}

interface GeneratedSurfaceTextures {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  surface: THREE.Texture;
}

interface BakedGeometryOptions {
  targetH?: number;
  targetW?: number;
  scale?: number;
  burn?: number;
  mul?: number;
  sink?: number;
  sourceZMin?: number;
  sourceZMax?: number;
  whiteCap?: readonly [number, number, number];
}

interface RowhouseDimensions {
  w: number;
  d: number;
  lowContrastTrim?: boolean;
}

interface InhabitSettings {
  stalls?: number;
  benches?: number;
  coreClutter?: number;
  bales?: number;
  stooks?: number;
  sleds?: number;
  drums?: number;
  pots?: number;
  trucks?: number;
  jeeps?: number;
  drumClusters?: number;
  looseClutter?: number;
  /** The loose roadside kinds, six of them (the Redrock lane, round 11e: a list of the default's length draws the same
   *  sites and members, so only the kinds change). Absent: the map family's own mix. */
  looseKinds?: readonly [string, string, string, string, string, string];
  camps?: number;
  carts?: number;
  modernClutter?: number | Record<string, number>;
  roadFence?: string;
  yardFence?: string;
  troughs?: number;
  churns?: number;
  laundry?: number;
  handcarts?: number;
  /** settlement detail 2026-09-15: doorstep bench + pots, second woodpile, gate stack (default on) */
  doorsteps?: number;
  woodpiles?: number;
  gateStacks?: number;
}

/** An authored outcrop: `count` boulders on a crescent of `radius` m round (x, z), bulging toward `towardDeg` (degrees,
 * atan2(dz, dx)); the boulders' scales between `scaleMin` and `scaleMax`. */
interface CoverOutcropSettings {
  x: number;
  z: number;
  towardDeg?: number;
  count?: number;
  radius?: number;
  scaleMin?: number;
  scaleMax?: number;
  name?: string;
}

interface TacticalOutcropSettings {
  count?: number;
  radius?: number;
  scaleMin?: number;
  scaleMax?: number;
}

interface TacticalBeatSettings {
  id?: string;
  role?: string;
  x: number;
  z: number;
  yawDeg?: number;
  structure?: string;
  reservePad?: number;
  maxSpread?: number;
  redoubt?: boolean;
  redoubtOffset?: number;
  outcrop?: TacticalOutcropSettings | false;
  wreck?: boolean;
  wreckYawDeg?: number;
  wreckOffsetX?: number;
  wreckOffsetZ?: number;
}

interface TankWreckSettings {
  count?: number;
  era?: string;
  ids?: string[];
  debris?: boolean;
  maxGroundEmbed?: number;
}

type WallRun = readonly [number, number, number, number, number?];
/** Two wall runs whose ends lie this close meet at a corner (one corner pier for both). */
const WALL_CORNER_M = 1.2;

// environment density pass 2 (2026-09-12): per-map dressing caps that used to be
// hard-coded (26 logs + stumps, 5 dressed yards everywhere). Kept here rather
// than in the map modules, whose authoring the relief receipts pin; a map's own
// props.logCount / props.hayCrateSites still wins.
export const FIELD_LOG_COUNTS: Readonly<Record<string, number>> = Object.freeze({
  autumn: 60, longleaf: 60, monsoon: 60, orchard: 56, verdant: 56, frontier: 56, fjord: 56, reservoir: 56,
  alpine: 52, delta: 52, coastal: 52, mangrove: 48, saltwind: 48, steppe: 44,
  polders: 40, skybridge: 40, railyard: 40, winter: 36, whiteout: 30, caldera: 30,
});
export const HAY_CRATE_SITES: Readonly<Record<string, number>> = Object.freeze({
  verdant: 9, autumn: 9, steppe: 9, orchard: 9,
  polders: 8, coastal: 8, frontier: 8, delta: 8, longleaf: 8, reservoir: 8,
  saltwind: 7, alpine: 7, monsoon: 7, mangrove: 7,
});

interface PropsSettings {
  sourcedPalette?: BuildingPaletteId;
  /** The map-revival lane (2026-10-06): scattered rocks and outcrops keep off the zone-control hints' discs. */
  rocksKeepOffZones?: boolean;
  /** regional-buildings lane: the regional architecture kit of this map's settlements (maps/regional/index.ts). */
  architecture?: string;
  bathhouseStyle?: 'timber';
  loggingYard?: LoggingYardConfig;
  reservoirWaterworks?: ReservoirWaterworksConfig;
  foundryServiceCourt?: FoundryServiceCourtConfig;
  plan: string[];
  /** Maps lane B (2026-10-03): `plot` sizes the site — metres across (x) and deep (z) before the yaw — for a builder
   * that honours one (the warehouse; the Hostomel kit raises its barrel-vault cargo hangar on a warehouse plot 21 m
   * wide or more). */
  plannedSites?: readonly { structure: string; x: number; z: number; yawDeg: number; plot?: { w: number; d: number };
    /** The landmarks lane (2026-10-05): a set piece (props.landmarks) stands on this site instead. The site keeps its plan
     * draws, spacing and footprint (every later building, yard and clutter piece stays where it was); its geometry and
     * collision are the piece's. */
    vacated?: boolean;
    /** map revival lane 2 (2026-10-05): a house in an authored street wall (Aegis Crossing's Ronda streets). It stands
     * within a metre of its neighbours, inside the spacing disc every earlier building keeps, so that check passes it:
     * its author holds the footprints apart. It draws from a stream of its own (its index in the plan), so every
     * placement after it keeps its seat. Every other site keeps the check and the shared stream. */
    terrace?: boolean }[];
  /** The map-revival lane (2026-10-07, Orchard round 4): the planned sites stand after the roadside plan has placed every
   * building (they close a square between its houses), so the plan places exactly as it did without them. Unset: the
   * sites stand first, as before. */
  plannedSitesAfterPlan?: boolean;
  /** Maps lane B (2026-10-03, Nordhavn Fjord): the settlement the props dress — its roadside and block-fill buildings,
   * its plaza (the road crossing nearest cx, cz), street furniture and clutter — when it is not the whole ground the
   * terrain's village rect grades (a harbour town on the quay of a graded valley floor). Default: the village rect. */
  town?: { x0: number; x1: number; z0: number; z1: number; cx: number; cz: number };
  /** The maps-and-layouts lane (2026-10-03; the owner's town-plan ruling): a settlement that stands exactly as an earlier
   * build seated it (maps/townPlans.generated.ts). Each entry is one planned building as that build placed it: its
   * structure, plan index, wall and the props stream's state after the wall pick, and its final pose. The replay
   * builds each one from its own stream at its pose, so its geometry, footprint and place are the recorded build's
   * whatever the ground, roads or aprons under the town have become; the generated road, row and block-fill passes then
   * place nothing more. */
  townPlan?: readonly TownPlanEntry[];
  /** The map-revival lane (2026-10-06): buildings a map adds to its recorded town plan (Ironworks' blast-furnace line):
   * each one replayed like a recorded entry, from its own stream at its authored pose, after the record, so no recorded
   * building moves and the props stream draws nothing for them. */
  townPlanAdditions?: readonly TownPlanEntry[];
  /** The light buildings of a recorded settlement (maps/townPlans.generated.ts TOWN_LIGHT_PLANS): each destructible
   * building's kind and final pose as that build placed it. They stand there whatever the ground has become, and the
   * light-building pass draws nothing. */
  townLightPlan?: readonly TownLightEntry[];
  /** The map-revival lane (2026-10-06): a recorded light building's kind the map replaces at its recorded pose (a
   * kind out of place in the region: Ironworks' Nissen hut becomes a brick office), recorded kind → its stand-in. */
  townLightPlanSwaps?: Readonly<Record<string, string>>;
  /** The street rows of a recorded settlement (maps/townPlans.generated.ts TOWN_ROW_PLANS; the map-revival lane,
   * 2026-10-05): each row building's pose, plot, wall, ruin and the props stream's state before its builder, and its
   * rubble's seat, size and the street stream's state before it. They stand there whatever the ground has become, and
   * the street-row pass draws nothing. */
  townRowPlan?: readonly TownRowEntry[];
  /** Rows the record never held (the map-revival lane, 2026-10-06, Suzhou Creek's round 2: the lilong lanes' terraces on
   * the district's empty lots), replayed after the recorded rows the same way, each from its own stream, and only where
   * its plot is dry, off every road's core and clear of every record placed before it. */
  townRowPlanAdditions?: readonly TownRowEntry[];
  /**
   * The map-revival lane (2026-10-05, Suzhou Creek): a water course (the map's liquid marsh chain) laid through a
   * recorded settlement (townPlan, townRowPlan, townLightPlan). What its water reaches leaves it: a planned building is
   * packed for the carriageway post-pass (its new place dry, looked for out to 80 m), a street row or a light building
   * is left out. Every other recorded building stands where it stood. Default off.
   */
  settlementOverWater?: boolean;
  tones: Record<string, ToneFunction | null | undefined>;
  rockTone: ToneFunction | null;
  wallStoneChance: number;
  buildingLat: readonly [number, number];
  sideSkip: number;
  maxSpread: number;
  spacingPad: number;
  wallRuns: WallRun[] | null;
  well: boolean;
  hayCrates: boolean;
  fences: boolean;
  telegraph: boolean;
  carts: boolean;
  logs: boolean;
  /** environment density pass 2 (2026-09-12): fallen logs + stumps per map (was a fixed 26). */
  logCount?: number;
  /** environment density pass 2 (2026-09-12): buildings that get bales and crates around them (was a fixed 5). */
  hayCrateSites?: number;
  haystacks: number;
  /** b15: the region's field stack (maps/haystackKit.ts HAYSTACK_STYLE_BY_MAP gives the map's; 'none' draws none). */
  haystackStyle?: HaystackStyle;
  /**
   * b16 (gauntlet wave 121: "a modern prefab with blue glass windows" at Sirocco Wadi's gates): a region's own build in
   * place of a generic light kind under the same key — its footprint, ground fit and beats kept (maps/regional
   * ksarGate.ts STRUCTURE_VARIANTS: { checkpointhut: 'ksargate' }).
   */
  structureVariants?: Readonly<Record<string, keyof typeof STRUCTURE_VARIANTS>>;
  rocks: number;
  outcrops: number;
  /** Authored hard-cover outcrops (the hitbox lane, 2026-10-08; placeCoverOutcrops). */
  coverOutcrops?: readonly CoverOutcropSettings[];
  craters: number;
  rubblePiles: number;
  wrecks: number;
  cropFields: number;
  cropForm?: 'harvest' | 'wet-upright' | 'grain';
  lampposts: boolean;
  /** the kit's churchyard round its church (maps/regional/types.ts ArchitectureStyle.churchyard; the facades lane): its
   *  walls are destructibles with colliders, so a map opting in regenerates its collision shard */
  churchyard?: boolean;
  hedgehogs: number;
  destructibleBuildings: string[];
  orbitalSettlement?: readonly OrbitalPlacement[];
  tacticalBeats: TacticalBeatSettings[];
  streetRows: boolean;
  curbs: boolean;
  monument: boolean;
  townCraters: boolean;
  snowCap?: boolean;
  /** The map-revival lane (round 2, 2026-10-09; gauntlet waves 319/320 on Whiteout: buildings "float on a featureless flat
   * snow plane with no plough banks or drifts"): on a snow map, the drifts its wind banks against every closed building
   * (maps/buildingSnowDrifts.ts) and the windrows along its ploughed roads inside the settlement, as fillets of the ground
   * drawn with the terrain's material (round 2b). Opt-in per map. */
  buildingDrifts?: boolean;
  ploughBanks?: boolean;
  /** (round 2b) the landmark kinds that are closed shells on the ground and take drifts (every other landmark none). */
  driftLandmarks?: readonly string[];
  streetRowsAfterLandmarks?: boolean;
  /** The maps-and-layouts lane (2026-10-03): a roadside or block-fill building whose footprint stands in a carriageway
   * (within the layout brief's 3.5 m road core of a road's line) moves, once every settlement building stands, by the
   * least distance that clears it, keeping its ground fit and clear of every other building and strongpoint; without
   * such a place it stays. The plan places every building exactly as before (no draw or eligibility changes), so a
   * building that clears the carriageway stands where it always did. Opt-in: a map without it keeps every building. */
  roadBuildingClearance?: boolean;
  /** Authored places for carriageway buildings (with `roadBuildingClearance`): a building packed as standing in a
   * carriageway whose recorded centre lies within 1.5 m of `from` moves to `to` instead of the nearest clear place,
   * when `to` passes the same checks (the road clearance, its ground fit, every other building and strongpoint); else
   * the ring search runs as for any other. For a building with no clear place nearby, or whose nearest one changes the
   * battle (Blackglass's civic hall, settled by the bots lane's swap test). Default none. */
  roadClearanceTargets?: readonly { from: readonly [number, number]; to: readonly [number, number] }[];
  streetRowRoadStride?: number;
  /** Junction corners the roadside buildings keep out of (maps lane B, 2026-10-03): a roadside building's centre stands
   * outside each disc ({ x, z, r }). The centre test (7.5 m off any road) lets a long building reach into the other road
   * of an acute junction; Nordhavn Fjord's town crossroads is one. Default none. */
  roadBuildingKeepouts?: readonly { x: number; z: number; r: number }[];
  /** Open ground the street rows keep out of (maps lane B, 2026-10-02): a street-row building stands only where its
   * whole footprint clears each disc ({ x, z, r }: a square whose zone-control disc must stay open) and each rectangle
   * ({ x0, z0, x1, z1 }: say, gardens along one side of a street). Default none. */
  streetRowKeepouts?: readonly (
    { x: number; z: number; r: number } | { x0: number; z0: number; x1: number; z1: number })[];
  ruinChance?: number;
  blockFill?: boolean;
  destructibleBuildingLat?: readonly [number, number];
  yardClutter?: boolean;
  /** Round 75: the industrial halls' cladding — the brick / stone default or corrugated sheet (Whiteout's station). */
  industrialCladding?: 'brick' | 'steel';
  /** Round 75: the yard dressing budget (pieces) around the industrial structures; default 4.5 a structure, at most 140. */
  yardDressing?: number;
  /** Round 75 item 6: derived at build from the map's splat dirt tone — the boulders' soil skirt. The Redrock lane (round
   * 9): a map whose boulders lie on sand, not soil, authors its sand's tone here (Redrock's red dirt drew a stamped red
   * blotch under every boulder on the orange sand). */
  rockSoilTone?: ToneFunction | null;
  inhabit?: InhabitSettings;
  wallStyle?: string;
  /** The map-revival lane (2026-10-07): the mud walls' apron at the mobile tier's density on every tier
   * (fieldWallDressing.ts adobeApronCoarse); unset, as before. */
  adobeApronCoarse?: boolean;
  sandbagLines?: number;
  /** Field works between the spawns (breastwork + wire + pillbox); every map, default 3 (2026-09-17). */
  fieldWorks?: number;
  /** The Redrock lane (2026-10-07): the field works' pillboxes keep their 8 m square off every trunk the vegetation
   *  planted (a pillbox stood in Redrock's west spring with three palm trunks through its roof). Opt-in: the same overlap
   *  stands on Alpine, Caldera, Delta, Frontier, Steppe and Verdant, whose shards and pacing move with it. */
  pillboxClearOfTrees?: boolean;
  tankWrecks?: TankWreckSettings;
  /** The map-vehicles lane (P5): single vehicles the map authors at a spot (maps/vehicleSetPieces.ts), laid by the kits. */
  vehicleSetPieces?: readonly VehicleSetPiece[];
  rockSink?: number;
  /** The steepest ground a boulder rests on, degrees (landformGeology.ts restsOnTalus; the mountains lane, 2026-10-04,
   *  gauntlet wave 48 on Redrock: boulders hanging on the jebels' walls). Default TALUS_DEG (35); null: no limit. */
  rockTalusDeg?: number | null;
  extraKits?: readonly string[] | null;
  riverLandings?: readonly RiverLandingAnchor[];
  /** The map-revival lane (2026-10-05, Kestrel's apron markings): paint on the paved ground — stripes and numbers
   * (groundMarkings.ts), drawn as one receive-only decal mesh a few centimetres over the terrain mesh. Default none. */
  groundMarkings?: GroundMarkingsConfig;
  /** The landmarks lane (2026-10-05): the map's set pieces — bridges, monuments, squares, gates, towers and civic
   * buildings (src/world/landmarks/) — placed once the settlement stands, before every scatter pass. */
  landmarks?: readonly LandmarkPlacement[];
}

/** One planned building as a recorded build seated it (PropsMapConfig.townPlan; maps/townPlans.generated.ts): its
 * structure, its plan index, its wall, the props stream's state after the wall pick, and its final pose. */
export interface TownPlanEntry {
  structure: string; planIndex: number; wall: string; rng: number; x: number; z: number; rot: number;
}

/** One light (destructible) building as a recorded build seated it (PropsMapConfig.townLightPlan): its kind and pose. */
export interface TownLightEntry { kind: string; x: number; z: number; rot: number; }

/** One street-row building as a recorded build seated it (PropsMapConfig.townRowPlan): its pose, its plot, whether it
 * stood ruined, its wall, the props stream's state before its builder, and its rubble's seat, size and the street
 * stream's state before it (absent when it spilled none). */
export interface TownRowEntry {
  x: number; z: number; rot: number; w: number; d: number; ruined: boolean; wall: string; rng: number;
  rubbleX?: number; rubbleZ?: number; rubbleR?: number; rubbleRng?: number;
}

export interface PropsMapConfig {
  id: string;
  props?: Partial<PropsSettings>;
}

interface PlacedBuilding {
  x: number;
  z: number;
  w: number;
  d: number;
  rot: number;
  /** Round 75: the plan id of a planned building (the yard dressing reads it); other placements carry none. */
  kind?: string;
  /** The landmarks lane (2026-10-05): a set piece's kind (landmarks/plan.ts) — a footprint, not a planned building. */
  landmark?: string;
}

interface TacticalBeatFeature {
  id?: string;
  role?: string;
  x: number;
  z: number;
  structurePlaced: boolean;
  redoubt: boolean;
}

interface PlacedRadius {
  x: number;
  z: number;
  rr: number;
  /** A set piece's reserved ground (the landmarks pass): kept clear by every later pass, never dressed as a yard. */
  landmark?: true;
}

interface DecorationGroundingReceipt {
  kind: string;
  x: number;
  y: number;
  z: number;
  relief?: number;
  baseClearance?: number;
  start?: GroundedSegmentEndpoint;
  end?: GroundedSegmentEndpoint;
  supportMin?: number;
  supportMax?: number;
  specId?: string;
  [name: string]: string | number | boolean | GroundedSegmentEndpoint | undefined;
}

interface UtilityPoleGroundingReceipt {
  x: number;
  y: number;
  z: number;
  supportMin: number;
  supportMax: number;
  supportSpread: number;
}

interface UtilityPolePlacementReceipt {
  station: number;
  paired: boolean;
  pairRelief: number;
  yaw: number;
  poles: UtilityPoleGroundingReceipt[];
}

/** The scenery lane (wave 74, the cascade trim): one rock variant's near and far pools and what repartitions them. */
interface RockLodPools {
  near: THREE.InstancedMesh;
  far: THREE.InstancedMesh;
  /** The crushable rocks hold the first near slots for good. */
  pinned: number;
  /** The rest, by placement index, repartitioned by distance. */
  loose: Int32Array;
  placements: THREE.Matrix4[];
  ground: Float32Array;
  slope: Float32Array;
  /** 1 while a loose rock draws its desktop form. */
  high: Uint8Array;
}
/** The rocks' desktop form draws through this distance (and its phone form past it plus the hysteresis, 10 m), metres. */
const ROCK_FAR_M = 60;
/** The near cascades (0 and 1) take the near and far pools; the far cascades (2 and 3) the shadow-only pool. */
const ROCK_NEAR_CASCADES = 0b0011, ROCK_FAR_CASCADES = 0b1100;

interface BakedInstanceGroup {
  geo: THREE.BufferGeometry;
  list: THREE.Matrix4[];
}

type DestructibleClass = 'break' | 'topple' | 'toss' | 'physics';

interface PropsDestructibleMeta extends Omit<DestructiblePropType, 'cls' | 'mat'> {
  cls: DestructibleClass;
  mat: string;
  airDrag?: number;
  instanceTintStrength?: number;
}

interface PropsCollisionRecord extends CollisionRecord {
  __looseStamp?: number;
  _pressS?: number;
  _pressT?: number;
  hedgehogId?: number;
}

/** One placed stone and its records (the hitbox lane, 2026-10-07): the legacy ones the placement passes read, then the
 * profile of its own mesh they are refitted to (props.ts settleRockColliders, refitRockColliders). */
interface RockSeat {
  vv: number;
  placement: THREE.Matrix4;
  x: number;
  y: number;
  z: number;
  sc: number;
  sink: number;
  tactical: boolean;
  rec: CollisionRecord | null;
  col: CollisionRecord | null;
  clutter: CrushableClutter | null;
  profile: RockCollisionProfile | null;
  /** Records the stone had none of: they join the lists at the refit. */
  added?: boolean;
}

interface GroundSupportRecord {
  y?: number;
  min: number;
  max: number;
  spread: number;
  mode: 'pitched' | 'obb' | 'disc';
}

export interface CrushableRecord {
  x: number;
  y: number;
  z: number;
  r: number;
  h: number;
  toppled: boolean;
  index?: number;
  recIdx?: number;
  kind?: string;
  dynamic?: boolean;
  wirePoleIndex?: number;
}

interface DestructibleRecord {
  clutter?: CrushableClutter;
  kind: string;
  cls: DestructibleClass;
  x: number;
  y: number;
  z: number;
  yaw: number;
  sc: number;
  r: number;
  h: number;
  slot: number;
  state: number;
  ob: PropsCollisionRecord | null;
  col?: CollisionRecord;
  loopRef?: CrushableRecord;
  groundSupport: GroundSupportRecord | null;
  looseIndex?: number;
  body?: LoosePropBody;
  looseListed?: boolean;
  _dKey?: string;
  _destructibleIndex?: number;
  /** The parked-vehicle separation found this vehicle no clear seat: out of play (no obstacle, no instance). */
  dropped?: boolean;
}

interface LooseDestructibleRecord extends DestructibleRecord {
  looseIndex: number;
  body: LoosePropBody;
  looseListed: boolean;
}

interface DestructiblePool {
  meta: PropsDestructibleMeta;
  mats4: THREE.Matrix4[];
  records: DestructibleRecord[];
  imI: THREE.InstancedMesh | null;
  imB: THREE.InstancedMesh | null;
  nBroken: number;
}

interface PoleMatrixWriter {
  instanceMatrix: { needsUpdate: boolean };
  getMatrixAt(index: number, target: THREE.Matrix4): void;
  setMatrixAt(index: number, matrix: THREE.Matrix4): void;
}

interface BaseCrushAnimation {
  im: THREE.InstancedMesh | PoleMatrixWriter;
  index: number;
  x: number;
  y: number;
  z: number;
  ax: number;
  az: number;
  t: number;
  placement: THREE.Matrix4 | null;
}

interface ToppleAnimation extends BaseCrushAnimation {
  type?: undefined;
  maxAng: number;
  wirePoleIndex?: number;
}

interface TossAnimation extends BaseCrushAnimation {
  type: 'toss';
  h: number;
  vx: number;
  vy: number;
  vz: number;
  dur: number;
  spin?: number;
  r?: number;
}

type CrushAnimation = ToppleAnimation | TossAnimation;

interface PendingBlast {
  x: number;
  y: number;
  z: number;
}

interface ShellImpactSettings {
  r?: number;
  he?: boolean;
  cause?: LoosePropKickCause;
}

interface PropsBuildSlice {
  fine?: boolean;
  /** Internal batches pace work without consuming another placement stage. */
  progress?: boolean;
  tankBuilder?: string;
  wreckBake?: { specId: string; options: { seed: number; pop: boolean }; result: WreckBake | null };
  /** (the time-to-battle lane) a fixed-input print the async build may hand in painted ahead (surfacePaintPrefetch.ts) */
  surfacePaint?: { key: string; result: Record<string, unknown> | null };
  stage?: string;
}

interface PropsAwaitTiming {
  count: number;
  totalMs: number;
  maxMs: number;
}

interface PropsBuildDetail {
  sliceCount: number;
  synchronousMs: number;
  maxSliceMs: number;
  slowest: Array<{ stage: string; ms: number }>;
  propModelsAwait?: PropsAwaitTiming & { startMs: number; endMs: number };
  /** the planned wreck bakes the world build started with the terrain (wreckBakePrefetch.ts) */
  wreckPrefetch?: import('./wreckBakePrefetch.ts').WreckBakePrefetchStats;
  /** the fixed-input prints painted ahead by the surface paint worker (surfacePaintPrefetch.ts) */
  surfacePaints?: SurfacePaintPrefetch['stats'];
  /** (the wreck-worker lane) the bakes the worker could not deliver, baked on the main thread; missing: no wreck */
  wreckFallbacks?: { count: number; missing: number; reason: string };
  awaitTimings: {
    clock: 'performance.now';
    sliceTicks: PropsAwaitTiming;
    wreckCheckpoints: PropsAwaitTiming;
    builderImports: PropsAwaitTiming;
    wreckBakes: PropsAwaitTiming;
    wreckRowsLimit: number;
    wreckRowsDropped: number;
    wreckRows: Array<{ specId: string; startMs: number; endMs: number;
      elapsedMs: number; includedCheckpointMs: number }>;
  };
}

interface TankWreckSpot {
  specId: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hx: number;
  hz: number;
  h: number;
  debrisTris: number;
  supportMin: number;
  supportMax: number;
  supportSpread: number;
  supportMaxEmbed: number;
  supportMaxFloat: number;
}

export interface PropsRuntime {
  group: THREE.Group;
  obstacles: PropsCollisionRecord[];
  colliders: CollisionRecord[];
  crushables: CrushableRecord[];
  crushProp(index: number, dx: number, dz: number, speed?: number): boolean;
  crushDestructible(
    propIndex: number,
    dx: number,
    dz: number,
    speed?: number,
    cause?: LoosePropKickCause,
    /** Lay the record at its final pose at once — no fall, no debris, no sound (state older than this viewer's view). */
    settled?: boolean,
  ): boolean;
  destructibles: DestructibleRecord[];
  looseRecords: DestructibleRecord[];
  updateProps(deltaSeconds: number, cameraPosition?: THREE.Vector3 | null): void;
  /**
   * Step only the destruction's own clock — the falls, tosses and loose dressing, the drum blasts — by `deltaSeconds`
   * (updateProps runs it after the LOD work; the Scene Studio runs it on its timeline, its world update held at 0).
   */
  advanceDestructibles(deltaSeconds: number): void;
  resetDestructibles(): void;
  tankWreckSpots: TankWreckSpot[];
  utilityNetwork: UtilityNetwork | null;
  utilityPolePlacements: UtilityPolePlacementReceipt[];
  decorationGroundingReceipts: DecorationGroundingReceipt[];
  sourcedTexturesReady: Promise<SourcedTextureResult[]>;
  /** Register only after assembly succeeds; return an identity-safe disposer. */
  registerDestructibles(): () => void;
  getLoosePropStats(): { total: number; active: number };
  /**
   * 2026-10-07 (the map-vehicles lane): the moored hulls standing in the water, as the water's disturbance sources a
   * standing hull makes (shallowWater.ts WaterDisturbance): the world appends them to the vehicles' so the sheet laps
   * and glints round each hull (map.ts setWaterDisturbances).
   */
  waterContacts: WaterDisturbance[];
  features: {
    buildings: PlacedBuilding[];
    tacticalBeats: TacticalBeatFeature[];
    /** World-space chimney tops of every placed building (hearth smoke anchors). */
    hearths: Array<[number, number, number]>;
  };
  /** Destruction (docs/DESTRUCTION.md §16): every structure's damage anatomy by its group id, and where its parts
   * landed in the merged buckets. */
  structureDamage: Map<number, WorldStructureDamage>;
  structureSpans: Map<number, StructureSpan[]>;
  /** Every props-bucket material with the mesh that draws it (world.patchStructureMaterials). */
  structureMaterials: StructureMaterialEntry[];
  _buildDetail?: PropsBuildDetail;
}

// The scenery lane's landmark kinds follow the inhabiting kit's, so no existing kind moves (2026-10-03).
// (b15: the regions' field stacks after the scenery's kinds — they are the haystack pass's, not landmarks)
const PROP_TYPE_REGISTRY: Readonly<Record<string, PropsDestructibleMeta>> = { ...DESTRUCTIBLE_TYPES, ...SCENERY_DESTRUCTIBLE_TYPES, ...HAYSTACK_DESTRUCTIBLE_TYPES };
/** Symmetric deployments (2026-10-08): a scatter destructible stands its own radius and this far off a deployment slot,
 * as the field scatter, the piles and the decals keep 18-20 m off the pads. */
const DEPLOYMENT_CLEAR_M = 20;

function canvas2d(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', options);
  if (!context) throw new Error('world/props: Canvas2D context unavailable');
  return context;
}

export function mulberry32(a: number): Rng {return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

function clamp(x: number, a: number, b: number): number { return x < a ? a : x > b ? b : x; }
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Canvas textures
// ---------------------------------------------------------------------------

// One linear ORM-style texture feeds both material slots: AO reads red and
// roughness reads green. Packing them together adds real PBR response without
// doubling the building texture/upload budget.
function surfaceFromHeight(h: Float32Array, s: number, anisotropy: number, {
  roughMin = 0.72, roughMax = 0.98, aoMin = 0.76, rust = null,
}: SurfaceTextureOptions = {}): THREE.CanvasTexture {
  const px = new Uint8ClampedArray(s * s * 4);
  for (let i = 0; i < h.length; i++) {
    const height = clamp(h[i], 0, 1);
    const j = i * 4;
    const mask = rust ? rust[i] : 0;
    px[j] = (aoMin + height * (1 - aoMin)) * 255;
    px[j + 1] = Math.min(255, (roughMin + (1 - height) * (roughMax - roughMin)) * 255 + mask * 60);
    px[j + 2] = mask * 255; // round 75: a rust mask (steel only) for the weathering hook; zero elsewhere
    px[j + 3] = 255;
  }
  return toTexture(px, s, { anisotropy });
}

const _col = new THREE.Color();
/** (the time-to-battle lane, 2026-10-08) the untoned render a props build's noise paints: every render family paints the
 * same one (plaster, plaster2 and plaster3 differ only in tone), so it is painted once per build and copied */
const plasterBases = new WeakMap<SimplexNoise, { px: Uint8ClampedArray; hgt: Float32Array }>();
/** (the facades lane, 2026-10-08) and a kit painter's untoned canvas, by painter and seed: plaster2 and plaster3 share one */
const paintedRenders = new WeakMap<SimplexNoise, Map<string, { px: Uint8ClampedArray; hgt: Float32Array }>>();
/** The relief and surface of a painted render: lime-wash (brush ridges) a little deeper than a floated lime render. */
const RENDER_RELIEF = { limewash: 0.8, limeRender: 0.6 } as const;

function makePlaster(
  noi: SimplexNoise,
  anisotropy: number,
  tone: ToneFunction | null = null,
  sharedSurface: Pick<GeneratedSurfaceTextures, 'normal' | 'surface'> | null = null,
): GeneratedSurfaceTextures {
  const s = 256, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  // the facades lane (2026-10-05): a kit's tone may name its render's painter — the khatas' lime-wash brushed over mud
  // plaster (regionalSurfaces.ts paintLimewash), matt and soft where this canvas reads as pebble-dash; (2026-10-08) a town's
  // lime render (paintLimeRender; Steinburg's stucco read "speckled": this canvas's 6 cm bumps shade as dots from the street)
  const paint = (tone as { paint?: { kind: 'limewash' | 'limeRender'; seed: number } } | null)?.paint;
  if (paint) {
    let byPaint = paintedRenders.get(noi);
    if (!byPaint) paintedRenders.set(noi, byPaint = new Map());
    const key = `${paint.kind}:${paint.seed}`;
    let base = byPaint.get(key);
    if (!base) byPaint.set(key, base = paint.kind === 'limeRender' ? paintLimeRender(s, paint.seed) : paintLimewash(s, paint.seed));
    const lime = { px: base.px.slice(), hgt: base.hgt };
    applyTone(lime.px, tone);
    return {
      albedo: toTexture(lime.px, s, { srgb: true, anisotropy }),
      normal: sharedSurface?.normal ?? normalFromHeight(lime.hgt, s, RENDER_RELIEF[paint.kind], anisotropy),
      surface: sharedSurface?.surface ?? surfaceFromHeight(lime.hgt, s, anisotropy, { roughMin: 0.9, roughMax: 0.98, aoMin: 0.9 }),
    };
  }
  const painted = plasterBases.get(noi);
  if (painted) {
    px.set(painted.px);
    hgt.set(painted.hgt);
  } else {
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const i = y * s + x, j = i * 4;
      const n1 = noi.noise(x * 0.045, y * 0.045) * 0.5 + 0.5;
      const n2 = noi.noise(x * 0.16 + 40, y * 0.16 - 21) * 0.5 + 0.5;
      const stain = smoothstep(0.55, 0.9, noi.noise(x * 0.02 - 90, y * 0.05 + 33) * 0.5 + 0.5);
      const streak = smoothstep(0.60, 0.92, noi.noise(x * 0.11 + 250, y * 0.018 - 7) * 0.5 + 0.5);
      // weathered plaster: mid albedo so full sun never blows it to white
      const l = 0.44 + n1 * 0.08 + n2 * 0.04 - stain * 0.15 - streak * 0.08;
      _col.setHSL(0.085, 0.13 - stain * 0.05, l);
      px[j] = _col.r * 255; px[j + 1] = _col.g * 255; px[j + 2] = _col.b * 255; px[j + 3] = 255;
      hgt[i] = n1 * 0.5 + n2 * 0.5;
    }
    plasterBases.set(noi, { px: px.slice(), hgt: hgt.slice() });
  }
  applyTone(px, tone);
  return {
    albedo: toTexture(px, s, { srgb: true, anisotropy }),
    normal: sharedSurface?.normal ?? normalFromHeight(hgt, s, 1.2, anisotropy),
    surface: sharedSurface?.surface
      ?? surfaceFromHeight(hgt, s, anisotropy, { roughMin: 0.84, roughMax: 0.98, aoMin: 0.80 }),
  };
}

function makeRoofTiles(
  noi: SimplexNoise,
  anisotropy: number,
  tone: ToneFunction | null = null,
): GeneratedSurfaceTextures {
  const s = 256, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  const rowH = 32, tileW = 42;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = y * s + x, j = i * 4;
    const row = Math.floor(y / rowH);
    const off = (row % 2) * tileW * 0.5;
    const tile = Math.floor((x + off) / tileW);
    const tRng = noi.noise(tile * 13.7 + 3, row * 7.9 - 11) * 0.5 + 0.5; // per-tile tone
    const inRowY = (y % rowH) / rowH;
    const inTileX = ((x + off) % tileW) / tileW;
    // AA spec (4eccce8): WIDER grooves + softer groove contrast — the 1-2px
    // repeating tile-gap rows with bright specular rims were the loudest
    // remaining shimmer at range (rim softening pairs with the lower
    // normal-map strength below)
    const gap = (inRowY < 0.14 || inTileX < 0.09) ? 1 : 0;
    const curve = Math.sin(inTileX * Math.PI) * 0.5 + 0.5;
    const wear = noi.noise(x * 0.1 - 60, y * 0.1 + 45) * 0.5 + 0.5;
    _col.setHSL(0.028 + tRng * 0.02, 0.42 - wear * 0.12, (0.26 + tRng * 0.10 + curve * 0.04) * (gap ? 0.55 : 1));
    px[j] = _col.r * 255; px[j + 1] = _col.g * 255; px[j + 2] = _col.b * 255; px[j + 3] = 255;
    hgt[i] = gap ? 0.16 : 0.4 + curve * 0.5 + (1 - inRowY) * 0.15;
  }
  applyTone(px, tone);
  // normal strength 2.4 -> 1.8: damps the per-tile specular rim glints that
  // aliased into fireflies once a roof fell below ~2px/tile on screen
  return {
    albedo: toTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 1.8, anisotropy),
    surface: surfaceFromHeight(hgt, s, anisotropy, { roughMin: 0.70, roughMax: 0.94, aoMin: 0.73 }),
  };
}

function makeRoofMaterial(roof: GeneratedSurfaceTextures, mapId: string): THREE.MeshStandardMaterial {
  // Ironworks' sourced tile sheet needs a roughness-map gain, not darker
  // pigment. >1 is intentional: Three multiplies this existing uniform by
  // surface G, then clamps physical roughness to1. Shared pixels stay exact.
  return new THREE.MeshStandardMaterial({ map: roof.albedo, normalMap: roof.normal,
    roughnessMap: roof.surface, aoMap: roof.surface,
    roughness: mapId === 'foundry' ? 1.3 : 1, metalness: 0 });
}

function buildStoneCourseEdges(size: number, rng: () => number): number[] {
  const rowE = [0];
  while (rowE[rowE.length - 1] < size) {
    let nxt = rowE[rowE.length - 1] + 88 + ((rng() * 72) | 0);
    if (size - nxt < 70) nxt = size;
    rowE.push(nxt);
  }
  return rowE;
}

function buildStoneColumnEdges(size: number, rowCount: number, rng: () => number): number[][] {
  const stoneE: number[][] = [];
  for (let row = 0; row < rowCount; row++) {
    const e = [0];
    while (e[e.length - 1] < size) {
      let nxt = e[e.length - 1] + 105 + ((rng() * 125) | 0);
      if (size - nxt < 88) nxt = size;
      e.push(nxt);
    }
    stoneE.push(e);
  }
  return stoneE;
}

function intervalAt(edges: readonly number[], value: number): number {
  let index = 0;
  while (edges[index + 1] <= value) index++;
  return index;
}

function paintStoneRow(
  noi: SimplexNoise,
  pixels: Uint8ClampedArray,
  heights: Float32Array,
  size: number,
  y: number,
  rowEdges: readonly number[],
  columnEdges: readonly (readonly number[])[],
  color: THREE.Color,
): void {
  const row = intervalAt(rowEdges, y);
  const columns = columnEdges[row];
  for (let x = 0; x < size; x++) {
    const i = y * size + x, j = i * 4;
    const wob = noi.noise(x * 0.085 + row * 31, y * 0.085 - 17) * 3.4;
    const dRow = Math.min(y - rowEdges[row], rowEdges[row + 1] - y) + wob * 0.6;
    const column = intervalAt(columns, x);
    const dCol = Math.min(x - columns[column], columns[column + 1] - x) + wob;
    const edgeD = Math.min(dRow, dCol * 0.9);
    const mortar = edgeD < 3.6 ? 1 : 0;
    const tone = noi.noise(row * 13.3 + column * 29.7 + 3.1,
      row * 7.7 - column * 11.9) * 0.5 + 0.5;
    const grain = noi.noise(x * 0.11 + 8, y * 0.11 - 77) * 0.5 + 0.5;
    const grime = smoothstep(0.5, 0.95,
      noi.noise(x * 0.016 + 130, y * 0.028 + 71) * 0.5 + 0.5);
    const bevel = clamp((edgeD - 3.6) / 15, 0, 1);
    color.setHSL(
      0.081 + tone * 0.014,
      0.06 + tone * 0.055 - grime * 0.02,
      (mortar ? 0.25 + grain * 0.04
        : (0.305 + tone * 0.14 + grain * 0.05) * (0.82 + bevel * 0.18)) - grime * 0.07,
    );
    pixels[j] = color.r * 255;
    pixels[j + 1] = color.g * 255;
    pixels[j + 2] = color.b * 255;
    pixels[j + 3] = 255;
    heights[i] = mortar ? 0.12
      : (0.48 + tone * 0.26 + grain * 0.16) * (0.55 + 0.45 * bevel);
  }
}

function* makeStone(
  noi: SimplexNoise,
  anisotropy: number,
  tone: ToneFunction | null = null,
): Generator<PropsBuildSlice, GeneratedSurfaceTextures, void> {
  // Irregular fieldstone coursing (512 px, ~0.35-0.9 m blocks at uvScale 0.5).
  const s = 512, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  const srng = mulberry32(0x51a7);
  const rowEdges = buildStoneCourseEdges(s, srng);
  const columnEdges = buildStoneColumnEdges(s, rowEdges.length - 1, srng);
  const color = new THREE.Color();
  for (let y = 0; y < s; y++) {
    paintStoneRow(noi, px, hgt, s, y, rowEdges, columnEdges, color);
    if ((y + 1) % 16 === 0) yield { fine: true, stage: `stone-rows-${y + 1}` };
  }
  applyTone(px, tone);
  yield { fine: true, stage: 'stone-tone' };
  // Only invocation-local CPU buffers cross checkpoints. Create and transfer
  // the unchanged texture set atomically, without suspending a partial owner.
  return {
    albedo: toTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 3.0, anisotropy),
    surface: surfaceFromHeight(hgt, s, anisotropy, { roughMin: 0.78, roughMax: 0.98, aoMin: 0.68 }),
  };
}

function makeWood(
  noi: SimplexNoise,
  anisotropy: number,
  tone: ToneFunction | null = null,
): GeneratedSurfaceTextures {
  const s = 256, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  const plankW = 42;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = y * s + x, j = i * 4;
    const plank = Math.floor(x / plankW);
    const tone = noi.noise(plank * 23.7, plank * 9.1 + 4) * 0.5 + 0.5;
    const inX = (x % plankW) / plankW;
    const gapped = inX < 0.07 ? 1 : 0;
    const grain = noi.noise(x * 0.30 + plank * 50, y * 0.02) * 0.5 + 0.5;
    _col.setHSL(0.070 + tone * 0.015, 0.32 - grain * 0.08, (0.185 + tone * 0.08 + grain * 0.05) * (gapped ? 0.5 : 1));
    px[j] = _col.r * 255; px[j + 1] = _col.g * 255; px[j + 2] = _col.b * 255; px[j + 3] = 255;
    hgt[i] = gapped ? 0.1 : 0.5 + grain * 0.4;
  }
  applyTone(px, tone);
  return {
    albedo: toTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 1.8, anisotropy),
    surface: surfaceFromHeight(hgt, s, anisotropy, { roughMin: 0.64, roughMax: 0.93, aoMin: 0.72 }),
  };
}

function makeStraw(
  noi: SimplexNoise,
  anisotropy: number,
  tone: ToneFunction | null = null,
): GeneratedSurfaceTextures {
  // packed dry straw: long directional stalks with dark inter-stalk gaps and
  // per-stalk tone variation, graded toward dull ochre — the old bright
  // low-contrast yellow read as untextured toy cylinders on the hay bales
  const s = 256, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = y * s + x, j = i * 4;
    const stalk = noi.noise(x * 0.022, y * 0.55) * 0.5 + 0.5;  // stalk-bundle tone
    const strand = noi.noise(x * 0.10 + 31, y * 1.55 - 12) * 0.5 + 0.5; // fine strands
    const kink = noi.noise(x * 0.45 + 77, y * 0.35 + 9) * 0.5 + 0.5;    // broken ends
    const gap = smoothstep(0.74, 0.92, noi.noise(x * 0.06 + 90, y * 0.9 + 55) * 0.5 + 0.5);
    const l = (0.21 + stalk * 0.13 + strand * 0.10 + kink * 0.04) * (1 - gap * 0.55);
    _col.setHSL(0.098 + stalk * 0.022, 0.38 - gap * 0.12, l);
    px[j] = _col.r * 255; px[j + 1] = _col.g * 255; px[j + 2] = _col.b * 255; px[j + 3] = 255;
    hgt[i] = (stalk * 0.45 + strand * 0.4 + kink * 0.15) * (1 - gap * 0.7);
  }
  applyTone(px, tone);
  return {
    albedo: toTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 2.4, anisotropy),
    surface: surfaceFromHeight(hgt, s, anisotropy, { roughMin: 0.88, roughMax: 1.0, aoMin: 0.74 }),
  };
}

/**
 * A thatched roof's print (facades lane, round 5, 2026-10-07; wave 199 read the khatas' straw roofs as "thatch that reads
 * like carpet"): the straw laid in courses down the slope, as a thatcher lays it. Texture u runs down the slope (house.ts
 * swaps a straw roof's axes), v along the ridge; a 512 px tile is 2.2 m of roof (the straw bucket's density):
 *   - six courses, each about 37 cm down the slope, its butt line wandering along the ridge, the straw thickening
 *     toward it and a soft shadow under its frayed edge on the course below;
 *   - one combed coat within a course: strands down the slope, 7 mm a strand, each its own tone and length, and a
 *     slow drift of tone along the ridge (no bundle edges: those read as wooden shakes);
 *   - the weather's broad clouds.
 * The colour is the straw print's own family and mean (makeStraw's hue, saturation and lightness, under the map's
 * straw tone): the structure changes, not the palette. Every pattern is periodic in the tile (integer counts, wrapped
 * lattices), so it tiles without a seam.
 * A kit may give its thatch its own print (ArchitectureSurfaces.thatch): 'nipa', the Mekong delta's atap of nipa-palm leaf
 * (regionalSurfaces.ts paintNipaThatch; the facades lane, 2026-10-08, gauntlet wave 260: the Ca Mau hamlet's straw print
 * read as "brown shingle gable roofs"), in the same tile convention under the same tone.
 */
function makeThatch(anisotropy: number, tone: ToneFunction | null, seed: number, kind?: 'nipa'): GeneratedSurfaceTextures {
  if (kind === 'nipa') {
    const nipa = paintNipaThatch(512, seed);
    applyTone(nipa.px, tone);
    return {
      albedo: toTexture(nipa.px, 512, { srgb: true, anisotropy }),
      normal: normalFromHeight(nipa.hgt, 512, 2.0, anisotropy),
      surface: surfaceFromHeight(nipa.hgt, 512, anisotropy, { roughMin: 0.84, roughMax: 1.0, aoMin: 0.66 }),
    };
  }
  const s = 512, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  const hash = (a: number, b: number, c: number): number => {
    let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1) ^ seed) >>> 0;
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  };
  const wrap = (i: number, n: number) => ((i % n) + n) % n;
  // periodic value noise over cx x cy cells of the tile
  const vnoise = (x: number, y: number, cx: number, cy: number, salt: number): number => {
    const fx = x / s * cx, fy = y / s * cy, ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const v = (i: number, j: number) => hash(wrap(i, cx), wrap(j, cy), salt);
    return (v(ix, iy) * (1 - sx) + v(ix + 1, iy) * sx) * (1 - sy) + (v(ix, iy + 1) * (1 - sx) + v(ix + 1, iy + 1) * sx) * sy;
  };
  // (r8 views, round 5: seven courses of 8.5 cm bundles, each its own tone and bulge, read as wooden shakes) six courses
  // whose butt lines wander along the ridge; the straw within a course one combed coat: no bundle edges, only the
  // strands' own tones and a slow drift of tone along the ridge
  const COURSES = 6, STRANDS = 320;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = y * s + x, j = i * 4;
      // the course: t runs 0 at its top (up the slope) to 1 at its butt line, which wanders along the ridge
      const cu = x / s * COURSES + (vnoise(x, y, 2, 10, 3) - 0.5) * 0.34 + (vnoise(x, y, 2, 40, 19) - 0.5) * 0.08;
      const c = Math.floor(cu), t = cu - c;
      const strand = Math.floor(y / s * STRANDS);
      const strandTone = hash(wrap(strand, STRANDS), wrap(c, COURSES), 9);
      // the coat's slow drift along the ridge (a handful of straw from another stack), smooth, never a step
      const drift = vnoise(x, y, 2, 9, 7);
      // a strand's own length: some stop short of the butt line (a frayed edge)
      const reach = 0.8 + hash(wrap(strand, STRANDS), wrap(c, COURSES), 11) * 0.2;
      const past = t > reach;
      const lip = smoothstep(0.86, 1, t) * (past ? 0.5 : 1);
      // the soft shadow the course above casts on this one's top
      const shade = 1 - 0.13 * (1 - smoothstep(0, 0.2, t));
      const weather = vnoise(x, y, 3, 3, 13);
      // along the strand: each one's tone wanders down its length (a stalk, not a painted line)
      const along = vnoise(x, y, 28, STRANDS, 17);
      // the straw print's family and mean: hue 0.098-0.12, saturation about 0.3-0.42, lightness about 0.24-0.55
      const light = (0.24 + strandTone * 0.1 + along * 0.06 + drift * 0.04 + lip * 0.03) * shade
        * (0.88 + weather * 0.22) * (past ? 0.86 : 1);
      _col.setHSL(0.098 + drift * 0.022, 0.4 - (1 - shade) * 0.2 - weather * 0.06, light);
      px[j] = _col.r * 255; px[j + 1] = _col.g * 255; px[j + 2] = _col.b * 255; px[j + 3] = 255;
      hgt[i] = Math.min(1, Math.max(0, 0.25 + t * 0.35 * (past ? 0.7 : 1) + strandTone * 0.1 + along * 0.05 - (1 - shade) * 0.25));
    }
  }
  applyTone(px, tone);
  return {
    albedo: toTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 1.8, anisotropy),
    surface: surfaceFromHeight(hgt, s, anisotropy, { roughMin: 0.86, roughMax: 1.0, aoMin: 0.74 }),
  };
}

/**
 * (the time-to-battle lane, 2026-10-07) The fixed-input prints: the async build hands a print in painted ahead by the
 * surface paint worker when the prefetch holds these exact arguments (surfacePaintPrefetch.ts — the same painter, the
 * same texels); otherwise, and always in the synchronous build, it is painted here as before.
 */
function* paintedAhead<T>(key: string, paint: () => Generator<unknown, T, void>): Generator<PropsBuildSlice, T, void> {
  const request: NonNullable<PropsBuildSlice['surfacePaint']> = { key, result: null };
  yield { fine: true, progress: false, stage: `paint-ahead:${key}`, surfacePaint: request };
  if (request.result) return request.result as unknown as T;
  return (yield* paint() as Generator<PropsBuildSlice, T, void>);
}
function* paintHayBuffers(size = 512, seed = HAY_PRINT_SEED): Generator<PropsBuildSlice, { px: Uint8ClampedArray; hgt: Float32Array }, void> {
  return yield* paintedAhead(surfacePaintKey({ kind: 'hay', size, seed }), () => paintHayBuffersInline(size, seed));
}
function* paintFieldStoneBuffers(size = 512, seed = FIELD_STONE_PRINT_SEED, lithology: FieldStoneLithology = 'fieldstone'):
  Generator<PropsBuildSlice, FieldStoneBuffers, void> {
  return yield* paintedAhead(surfacePaintKey({ kind: 'fieldStone', size, seed, lithology }), () => paintFieldStoneBuffersInline(size, seed, lithology));
}

/** The fixed-input prints a map's props build will paint (the surface paint prefetch starts them with the terrain). */
export function plannedSurfacePaints(cfg: PropsMapConfig | null, propsSeed = 2002): SurfacePaintRequest[] {
  const mobile = getDeviceTier() === 'mobile';
  const size = mobile ? 256 : 512;
  const mapId = cfg ? cfg.id : 'verdant';
  const wallStyle = (cfg?.props as { wallStyle?: string } | undefined)?.wallStyle;
  // (2026-10-08) and the tiles it paints from its noise (seed + 7) — all in the order the build reaches them: the straw,
  // the building kit's three detail tiles, the rock tile, the dry-stone print
  const noiseSeed = propsSeed + 7;
  const requests: SurfacePaintRequest[] = [
    { kind: 'hay', size, seed: HAY_PRINT_SEED },
    { kind: 'structureDetail', detail: 'wood', noiseSeed },
    { kind: 'structureDetail', detail: 'canvas', noiseSeed },
    { kind: 'structureDetail', detail: 'steel', noiseSeed },
    { kind: 'rockDetail', lithology: rockLithologyFor(mapId), noiseSeed },
  ];
  if (!(wallStyle === 'adobe' || sourcedStoneIsBrick(mapId))) {
    requests.push({ kind: 'fieldStone', size, seed: FIELD_STONE_PRINT_SEED, lithology: rockLithologyFor(mapId) === 'chalk' ? 'chalk' : 'fieldstone' });
  }
  return requests;
}

/**
 * The scenery lane (b15; gauntlet wave 106 on the field haystack: "a bare textureless dark cone"): the straw props'
 * print (hayPrint.ts) under the map's straw tone — a bale's packed straw, a stack's face drawn down in locks, a thatched
 * crown's courses and a stack pole's grey timber, four bands of one tile, painted the GPU's way round. Phones paint it
 * at half size (the same straw). Its own material (mats.hay) on the straw destructibles only: the thatched roofs and the
 * winter reeds tile their UVs across the whole tile and keep the straw print's uniform stalks (makeStraw).
 */
function* makeHay(
  anisotropy: number,
  tone: ToneFunction | null,
  size: number,
): Generator<PropsBuildSlice, GeneratedSurfaceTextures, void> {
  const { px, hgt } = yield* paintHayBuffers(size);
  applyTone(px, tone);
  return {
    albedo: toTexture(px, size, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, size, 2.2 * size / 512, anisotropy),
    surface: surfaceFromHeight(hgt, size, anisotropy, { roughMin: 0.86, roughMax: 1.0, aoMin: 0.7 }),
  };
}

/**
 * The scenery lane (b13): a painted print's rows reversed for the upload. The field-stone and mud painters lay their
 * bands with v running down the image from row 0 (fieldStoneSurface.ts, fieldMudSurface.ts), but a canvas texture is
 * flipped on upload, row 0 landing at v = 1: the geometry's hearting band read a stone's skin, a seventh of the face
 * stones read the hearting's voids, and the mud walls' plain band read the brick courses. Reversed here, the GPU's v is
 * the painter's v; the painters and their receipts keep their convention.
 */
function flipPrintRows<T extends Uint8ClampedArray | Float32Array>(data: T, size: number, channels: number): T {
  const row = size * channels;
  for (let y = 0; y < size >> 1; y++) {
    const a = y * row, b = (size - 1 - y) * row;
    for (let k = 0; k < row; k++) { const t = data[a + k]; data[a + k] = data[b + k]; data[b + k] = t; }
  }
  return data;
}

/**
 * The scenery lane (2026-10-03): the dry-stone field walls' print (fieldStoneSurface.ts) under the map's stone tone —
 * one stone's skin over its face band (the module's face stones are geometry, each a window of it; wave 34 read a
 * printed rubble on them as "stamped flagstone with dark outlines") and the hearting's packing stones and voids over a
 * band the core maps. Its palette is the stone print's law, so the tone and a masonry tint give the walls the colour
 * they had, lifted where a dark tone would black them out. Phones paint it at half size (the same stones).
 * (b18; gauntlet wave 121, Verdant's yard walls "coal or slate bricks rather than the chalk ... of the Belgorod region":
 * on a chalk map the walls are its chalk, painted for itself and never toned — the map's stone tone is its houses'.)
 */
function* makeFieldStone(
  anisotropy: number,
  tone: ToneFunction | null,
  size: number,
  lithology: FieldStoneLithology = 'fieldstone',
): Generator<PropsBuildSlice, GeneratedSurfaceTextures, void> {
  const { px, hgt } = yield* paintFieldStoneBuffers(size, undefined, lithology);
  if (lithology !== 'chalk') {
    applyTone(px, tone);
    liftFieldStoneMean(px, size); // (wave 34: never darker than a fieldstone, whatever the map's stone tone)
  }
  yield { fine: true, stage: 'field-stone-tone' };
  flipPrintRows(px, size, 4); flipPrintRows(hgt, size, 1); // (b13: the GPU's v is the painter's v)
  return {
    albedo: toTexture(px, size, { srgb: true, anisotropy }),
    // (a stone's skin, not stones: a gentle relief, and the occlusion the geometry's own gaps give)
    normal: normalFromHeight(hgt, size, 2.2 * size / 512, anisotropy),
    surface: surfaceFromHeight(hgt, size, anisotropy, { roughMin: 0.8, roughMax: 0.98, aoMin: 0.72 }),
  };
}

/**
 * The scenery lane (b13; gauntlet wave 87, Saltwind's field walls "cast concrete rather than a drystone wall"): the
 * field works' dry-stone walls' face print (fieldWallFace.ts) — rough courses of limestone between dark dry joints,
 * crusted with lichen, and a top stone's skin for the crown. Neutral: the walls' vertex tone is the map's. Phones
 * paint it at half size (the same stones).
 */
function* makeDryWall(
  anisotropy: number,
  size: number,
): Generator<PropsBuildSlice, GeneratedSurfaceTextures, void> {
  const { px, hgt } = yield* paintDryWallBuffers(size);
  return {
    albedo: toTexture(px, size, { srgb: true, anisotropy }),
    // (stones standing out of dark joints: a firmer relief than a stone's skin)
    normal: normalFromHeight(hgt, size, 3.2 * size / 512, anisotropy),
    surface: surfaceFromHeight(hgt, size, anisotropy, { roughMin: 0.82, roughMax: 1.0, aoMin: 0.55 }),
  };
}

/**
 * The scenery lane (2026-10-03; wave 20, "smooth pillow- and pipe-shaped walls instead of eroded mud brick"): the mud
 * walls' print (fieldMudSurface.ts) under the map's plaster tone — a worn mud render over the courses of sun-dried
 * bricks it shows in patches, one tile a wall module. Phones paint it at half size.
 */
function* makeFieldMud(
  anisotropy: number,
  tone: ToneFunction | null,
  size: number,
  earth: readonly [number, number, number] | null,
): Generator<PropsBuildSlice, GeneratedSurfaceTextures, void> {
  const { px, hgt } = yield* paintFieldMudBuffers(size);
  applyTone(px, tone);
  if (earth) tintFieldMudToEarth(px, size, earth); // (wave 34: the walls and the mud at their feet are the map's earth)
  yield { fine: true, stage: 'field-mud-tone' };
  flipPrintRows(px, size, 4); flipPrintRows(hgt, size, 1); // (b13: the GPU's v is the painter's v)
  return {
    albedo: toTexture(px, size, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, size, 2.4 * size / 512, anisotropy),
    surface: surfaceFromHeight(hgt, size, anisotropy, { roughMin: 0.84, roughMax: 0.98, aoMin: 0.7 }),
  };
}

export function makeStructureDetail(
  noi: SimplexNoise,
  anisotropy: number,
  kind: 'wood' | 'canvas' | 'steel',
): GeneratedSurfaceTextures {
  // (the time-to-battle lane, 2026-10-08) the tile the surface paint worker painted ahead for this build's noise and kind
  // (surfacePaintPrefetch.ts settledPaint: the same painter, structureDetailTile.ts), or painted here
  const ahead = settledPaint(noi, (seed) => surfacePaintKey({ kind: 'structureDetail', detail: kind, noiseSeed: seed })) as StructureDetailBuffers | null;
  const { size: s, px, hgt, rust } = ahead ?? paintStructureDetailBuffers(noi, kind);
  // the rust mask rides the ORM blue channel the weathering hook reads (steel atlas convention, round 75)
  const surface = rust
    ? surfaceFromHeight(hgt, s, anisotropy, { roughMin: 0.50, roughMax: 0.86, aoMin: 0.76, rust })
    : surfaceFromHeight(hgt, s, anisotropy, kind === 'canvas'
      ? { roughMin: 0.90, roughMax: 1.0, aoMin: 0.84 }
      : { roughMin: 0.68, roughMax: 0.95, aoMin: 0.74 });
  return {
    albedo: toTexture(px, s, { srgb: true, anisotropy }),
    // The Sobel derivative already sums four neighboring height samples.
    // The former 1.45 gain bent shallow timber grain/corrugation almost
    // sideways, creating black-white stripes on otherwise flat walls.
    normal: normalFromHeight(hgt, s, kind === 'wood' ? 0.16 : kind === 'steel' ? 0.30 : 0.09, anisotropy),
    surface,
  };
}

/**
 * The sandbags' hessian (the scenery lane, gauntlet wave 52: "burlap that reads as fabric at its real weave scale"):
 * maps/sceneryKit.ts paintBurlap's plain weave, a jute thread every 2.5 mm at the bags' weave uv, its relief gentle so
 * it reads as cloth up close and averages to it farther off.
 */
function makeBurlapDetail(anisotropy: number): GeneratedSurfaceTextures {
  const s = 128, { lum, height } = paintBurlap(s), px = new Uint8ClampedArray(s * s * 4);
  for (let i = 0; i < s * s; i++) {
    const v = clamp(lum[i], 0, 1) * 255;
    px[i * 4] = v; px[i * 4 + 1] = v; px[i * 4 + 2] = v; px[i * 4 + 3] = 255;
  }
  return {
    albedo: toTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(height, s, 0.1, anisotropy),
    surface: surfaceFromHeight(height, s, anisotropy, { roughMin: 0.92, roughMax: 1.0, aoMin: 0.84 }),
  };
}

function _mustReplace(src: string, anchor: string, replacement: string): string {
  const out = src.replace(anchor, replacement);
  if (out === src) throw new Error(`world/props: shader anchor missing: ${anchor}`);
  return out;
}

/**
 * (facades lane, round 7, 2026-10-07; the media critics on Steinburg: "an aliasing roof-tile pattern", "a flat checker
 * of tiles") A kit's tile sheet is fine and high in contrast — a course every ~19 texels, its shadow line near black —
 * so at 40–80 m its courses sit near the screen's Nyquist and crawl as the camera moves, anisotropy (8 on a desktop) or
 * not. The roof samples its maps half a mip level softer: no change where the sheet is magnified (a roof close by), a
 * softer course line wherever it is minified. One chunk each, as three writes it, with the bias added.
 */
const ROOF_TILE_LOD_BIAS = 0.5;
function applyTileLodBias(shader: MaterialShader, bias: number): void {
  const b = bias.toFixed(2);
  const chunk = (name: 'map_fragment' | 'normal_fragment_maps' | 'roughnessmap_fragment' | 'aomap_fragment', sampler: string, uv: string) => {
    const biased = THREE.ShaderChunk[name].split(`texture2D( ${sampler}, ${uv} )`).join(`texture2D( ${sampler}, ${uv}, ${b} )`);
    shader.fragmentShader = _mustReplace(shader.fragmentShader, `#include <${name}>`, biased);
  };
  chunk('map_fragment', 'map', 'vMapUv');
  chunk('normal_fragment_maps', 'normalMap', 'vNormalMapUv');
  chunk('roughnessmap_fragment', 'roughnessMap', 'vRoughnessMapUv');
  chunk('aomap_fragment', 'aoMap', 'vAoMapUv');
}

function cropAttributeNormal(shader: MaterialShader): void {
  // Crop cards carry authored up normals on both faces, with no normal/bump
  // map. Keep Three's transformed normal path, minus its backface inversion.
  const normalChunk = _mustReplace(THREE.ShaderChunk.normal_fragment_begin,
    'normal *= faceDirection;', '');
  shader.fragmentShader = _mustReplace(shader.fragmentShader,
    '#include <normal_fragment_begin>', normalChunk);
}

function* makeGrimeTexture(
  noi: SimplexNoise,
  anisotropy: number,
): Generator<PropsBuildSlice, THREE.CanvasTexture, void> {
  const s = 256, px = new Uint8ClampedArray(s * s * 4);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const u = x / s, v = y / s, j = (y * s + x) * 4;
      const a = torusN(noi, u, v, 3, 3, 5) * 0.6 + torusN(noi, u, v, 7, 7, 19) * 0.4;
      const b = torusN(noi, u, v, 5, 5, 47) * 0.55 + torusN(noi, u, v, 13, 13, 91) * 0.45;
      // r3: blue carries a smooth 1-2 cycle field — sampled at very low world
      // frequency it drives the per-neighbourhood facade tint drift below
      const c2 = torusN(noi, u, v, 2, 2, 133) * 0.7 + torusN(noi, u, v, 5, 5, 171) * 0.3;
      px[j] = (a * 0.5 + 0.5) * 255;
      px[j + 1] = (b * 0.5 + 0.5) * 255;
      px[j + 2] = (c2 * 0.5 + 0.5) * 255; px[j + 3] = 255;
    }
    if ((y + 1) % 16 === 0) yield { fine: true, stage: `grime-rows-${y + 1}` };
  }
  return toTexture(px, s, { anisotropy });
}

/**
 * Compact neutral vehicle finish. Vertex colors carry each paint/glass/rubber
 * zone; this 64px PBR set adds orange-peel, chips, panel grime and roughness
 * without a unique texture or material per vehicle family.
 */
function makeVehiclePaint(noi: SimplexNoise, anisotropy: number): GeneratedSurfaceTextures {
  const size = 64;
  const pixels = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const index = y * size + x;
    const pixel = index * 4;
    const fine = noi.noise(x * 0.31 + 711, y * 0.31 - 233) * 0.5 + 0.5;
    const broad = noi.noise(x * 0.075 - 89, y * 0.10 + 417) * 0.5 + 0.5;
    const chipNoise = noi.noise(x * 0.58 + 63, y * 0.58 + 159) * 0.5 + 0.5;
    const chip = chipNoise > 0.94 && broad < 0.43 ? 0.075 : 0;
    const streak = smoothstep(0.70, 0.94,
      noi.noise(x * 0.08 + 349, y * 0.018 - 81) * 0.5 + 0.5);
    const value = clamp(0.945 + fine * 0.035 - chip - streak * 0.025, 0.76, 0.99);
    pixels[pixel] = value * 255;
    pixels[pixel + 1] = value * 255;
    pixels[pixel + 2] = value * 255;
    pixels[pixel + 3] = 255;
    height[index] = clamp(0.46 + fine * 0.10 - chip * 0.55 - streak * 0.045, 0, 1);
  }
  return {
    albedo: toTexture(pixels, size, { srgb: true, anisotropy }),
    normal: normalFromHeight(height, size, 0.22, anisotropy),
    surface: surfaceFromHeight(height, size, anisotropy, {
      roughMin: 0.68,
      roughMax: 0.94,
      aoMin: 0.84,
    }),
  };
}

// ---------------------------------------------------------------------------
// Baked sourced models (vertex-colored, welded at bake time)
// ---------------------------------------------------------------------------

const _bakedCache = new Map<string, THREE.BufferGeometry>();

interface BakedModelSelection {
  sourceVertexIds: number[] | null;
  sourceIndices: ArrayLike<number>;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

function fullBakedModelSelection(model: BakedPropModel): BakedModelSelection {
  const [minX, minY, minZ] = model.bbox.min;
  const [maxX, maxY, maxZ] = model.bbox.max;
  return {
    sourceVertexIds: null,
    sourceIndices: model.indices,
    minX, minY, minZ, maxX, maxY, maxZ,
  };
}

function slicedBakedModelSelection(
  name: string,
  model: BakedPropModel,
  zMin: number,
  zMax: number,
): BakedModelSelection {
  const vertexCount = model.positions.length / 3;
  const remap = new Int32Array(vertexCount);
  remap.fill(-1);
  const sourceVertexIds: number[] = [];
  const sourceIndices: number[] = [];
  for (let i = 0; i < model.indices.length; i += 3) {
    const triangle = [model.indices[i], model.indices[i + 1], model.indices[i + 2]];
    const inside = triangle.every((id) => {
      const z = model.positions[id * 3 + 2];
      return z >= zMin && z <= zMax;
    });
    if (!inside) continue;
    for (const id of triangle) {
      if (remap[id] < 0) {
        remap[id] = sourceVertexIds.length;
        sourceVertexIds.push(id);
      }
      sourceIndices.push(remap[id]);
    }
  }
  if (!sourceIndices.length) throw new Error(`world/props: empty baked slice ${name}`);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const id of sourceVertexIds) {
    const x = model.positions[id * 3];
    const y = model.positions[id * 3 + 1];
    const z = model.positions[id * 3 + 2];
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  return {
    sourceVertexIds, sourceIndices,
    minX, minY, minZ, maxX, maxY, maxZ,
  };
}

function selectBakedModel(
  name: string,
  model: BakedPropModel,
  opts: BakedGeometryOptions,
): BakedModelSelection {
  if (opts.sourceZMin == null && opts.sourceZMax == null) {
    return fullBakedModelSelection(model);
  }
  return slicedBakedModelSelection(
    name, model, opts.sourceZMin ?? -Infinity, opts.sourceZMax ?? Infinity,
  );
}

function resolveBakedScale(
  selection: BakedModelSelection,
  opts: BakedGeometryOptions,
): number {
  if (opts.targetH) return opts.targetH / Math.max(1e-6, selection.maxY - selection.minY);
  if (opts.targetW) {
    return opts.targetW / Math.max(1e-6,
      Math.max(selection.maxX - selection.minX, selection.maxZ - selection.minZ));
  }
  return opts.scale ?? 1;
}

function copyBakedVertexAttributes(
  model: BakedPropModel,
  selection: BakedModelSelection,
  opts: BakedGeometryOptions,
  scale: number,
): { positions: Float32Array; normals: Float32Array } {
  const count = selection.sourceVertexIds?.length ?? model.positions.length / 3;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const centerX = (selection.minX + selection.maxX) / 2;
  const centerZ = (selection.minZ + selection.maxZ) / 2;
  for (let i = 0; i < count; i++) {
    const sourceIndex = selection.sourceVertexIds?.[i] ?? i;
    positions[i * 3] = (model.positions[sourceIndex * 3] - centerX) * scale;
    positions[i * 3 + 1] = (model.positions[sourceIndex * 3 + 1] - selection.minY)
      * scale - (opts.sink ?? 0);
    positions[i * 3 + 2] = (model.positions[sourceIndex * 3 + 2] - centerZ) * scale;
    normals[i * 3] = model.normals[sourceIndex * 3];
    normals[i * 3 + 1] = model.normals[sourceIndex * 3 + 1];
    normals[i * 3 + 2] = model.normals[sourceIndex * 3 + 2];
  }
  return { positions, normals };
}

function isWhiteCapColor(r: number, g: number, b: number): boolean {
  return Math.min(r, g, b) > 0.72 && Math.max(r, g, b) - Math.min(r, g, b) < 0.10;
}

function copyBakedVertexColors(
  model: BakedPropModel,
  selection: BakedModelSelection,
  opts: BakedGeometryOptions,
): Float32Array {
  const count = selection.sourceVertexIds?.length ?? model.positions.length / 3;
  const colors = new Float32Array(count * 3);
  const burn = opts.burn ?? 0;
  const multiplier = opts.mul ?? 1;
  for (let i = 0; i < count; i++) {
    const sourceIndex = selection.sourceVertexIds?.[i] ?? i;
    const colorIndex = sourceIndex * 3;
    let r = model.colors[colorIndex] * multiplier;
    let g = model.colors[colorIndex + 1] * multiplier;
    let b = model.colors[colorIndex + 2] * multiplier;
    if (opts.whiteCap && isWhiteCapColor(r, g, b)) {
      [r, g, b] = opts.whiteCap;
    }
    if (burn > 0) {
      r = (r + (0.045 - r) * burn) * (1 - burn * 0.25);
      g = (g + (0.038 - g) * burn) * (1 - burn * 0.25);
      b = (b + (0.032 - b) * burn) * (1 - burn * 0.25);
    }
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  return colors;
}

/**
 * Build a BufferGeometry from a baked model: uniform scale to a target size,
 * XZ-centered, base at y=0, optional color grading (burn/darken for wrecks).
 * @param {string} name key in props-models.json
 * @param {{targetH?:number,targetW?:number,scale?:number,burn?:number,
 *   mul?:number,sink?:number,sourceZMin?:number,sourceZMax?:number}} [opts]
 * @returns {THREE.BufferGeometry} indexed geometry with position/normal/color
 */
export function bakedGeometry(name: string, opts: BakedGeometryOptions = {}): THREE.BufferGeometry {
  const key = name + JSON.stringify(opts);
  const hit = _bakedCache.get(key);
  if (hit) return hit;
  const m = requirePropModels()[name];
  if (!m) throw new Error('world/props: missing baked model ' + name);
  const selection = selectBakedModel(name, m, opts);
  const scale = resolveBakedScale(selection, opts);
  const { positions, normals } = copyBakedVertexAttributes(m, selection, opts, scale);
  const colors = copyBakedVertexColors(m, selection, opts);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // BufferGeometry#setIndex only wraps ordinary JS arrays. Packed runtime
  // models expose a Uint16Array view, which must be wrapped explicitly or the
  // renderer later mistakes the raw typed array for a BufferAttribute.
  const indexArray = selection.sourceIndices instanceof Uint16Array
    ? selection.sourceIndices
    : new Uint16Array(selection.sourceIndices);
  geo.setIndex(new THREE.BufferAttribute(indexArray, 1));
  geo.userData.size = {
    w: (selection.maxX - selection.minX) * scale,
    h: (selection.maxY - selection.minY) * scale,
    d: (selection.maxZ - selection.minZ) * scale,
  };
  _bakedCache.set(key, geo);
  return geo;
}

export function buildSourcedStructureGeometry(id: SourcedStructureType) {
  const spec = SOURCED_STRUCTURE_TYPES[id];
  return bakedGeometry(spec.model, { targetH: spec.targetH, sink: spec.sink });
}

// ---------------------------------------------------------------------------
// Building assembly — parts are pushed into per-material buckets, then merged
// ---------------------------------------------------------------------------

function makeCottage(
  rng: Rng,
  buckets: PropsBuckets,
  wallBucket = 'plaster',
): StructureDimensions {
  // (content_breadth r3: wallBucket may now be plaster2/plaster3 — the
  // parts literal below carries all wall families)
  const w = 5.2 + rng() * 1.2, d = 7.0 + rng() * 2.2;
  const wallH = 2.9, roofH = 1.9 + rng() * 0.4, over = 0.35;
  const parts: PropsBuckets = {
    plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [],
  };
  parts.stone.push(box(w + 0.3, 1.0, d + 0.3).translate(0, -0.1, 0)); // foundation (sinks)
  parts[wallBucket].push(box(w, wallH, d).translate(0, wallH / 2, 0));
  parts[wallBucket].push(gablePrism(w, roofH, 0.32).translate(0, wallH, d / 2 - 0.16));
  parts[wallBucket].push(gablePrism(w, roofH, 0.32).translate(0, wallH, -d / 2 + 0.16));
  // roof slabs
  const slope = Math.hypot(w / 2 + over, roofH + 0.1);
  const ang = Math.atan2(roofH + 0.1, w / 2 + over);
  for (const side of [-1, 1]) {
    const slab = slabBox(slope + 0.15, 0.12, d + over * 2, 0.35); // r2: real tile rows (see slabBox)
    pitchRoofPlane(slab, 'x', -side as -1 | 1, ang, 'gable');
    slab.translate(-side * (w / 4 + over / 2), wallH + roofH / 2 + 0.06, 0);
    parts.roof.push(slab);
  }
  // r2: ridge cap — the bare slab junction read as an extruded cardboard fold
  parts.roof.push(slabBox(0.34, 0.13, d + over * 2, 0.5).translate(0, wallH + roofH + 0.04, 0));
  // r2: chimney with cap slab + clay pot (was a bare stub most shots missed)
  parts.stone.push(box(0.55, 1.6, 0.55).translate(w * 0.22, wallH + roofH - 0.2, d * 0.22));
  parts.stone.push(box(0.72, 0.12, 0.72).translate(w * 0.22, wallH + roofH + 0.56, d * 0.22));
  {
    const pot = new THREE.CylinderGeometry(0.09, 0.12, 0.30, 6, 1);
    scaleUV(pot, 0.5, 0.5);
    pot.translate(w * 0.22, wallH + roofH + 0.74, d * 0.22);
    parts.roof.push(pot);
  }
  // door on +z gable end (r2: + lintel and a stone doorstep)
  parts.wood.push(box(1.1, 2.1, 0.10).translate(w * 0.08, 1.05, d / 2 + 0.10));
  parts.dark.push(box(0.86, 1.9, 0.06).translate(w * 0.08, 1.0, d / 2 + 0.16));
  parts.wood.push(box(1.3, 0.14, 0.14).translate(w * 0.08, 2.16, d / 2 + 0.10));
  parts.stone.push(box(1.24, 0.14, 0.5).translate(w * 0.08, 0.07, d / 2 + 0.28));
  // r2: small dark attic window in the +z gable
  parts.dark.push(box(0.5, 0.6, 0.06).translate(-w * 0.16, wallH + roofH * 0.42, d / 2 + 0.02));
  // windows on long sides
  const nw = 2 + ((rng() * 2) | 0);
  const shutters = rng() < 0.6; // r2: hung shutters on most cottages
  for (let k = 0; k < nw; k++) {
    const zz = -d / 2 + (k + 0.5) * (d / nw);
    for (const side of [-1, 1]) {
      if (rng() < 0.2) continue;
      // r5: frame PROUD, pane recessed (they were swapped — dark glass box
      // floated outside the frame and read as a painted-on rectangle), plus
      // a stone sill closing the bottom
      parts.wood.push(box(0.14, 1.06, 0.86).translate(side * (w / 2 + 0.05), 1.7, zz));
      parts.dark.push(box(0.06, 0.9, 0.7).translate(side * (w / 2 + 0.015), 1.7, zz));
      parts.stone.push(box(0.16, 0.09, 0.98).translate(side * (w / 2 + 0.06), 1.12, zz));
      if (shutters && rng() < 0.85) {
        parts.wood.push(box(0.05, 1.0, 0.30).translate(side * (w / 2 + 0.04), 1.7, zz - 0.43 - 0.16));
        parts.wood.push(box(0.05, 1.0, 0.30).translate(side * (w / 2 + 0.04), 1.7, zz + 0.43 + 0.16));
      }
    }
  }
  addConnectedExterior(parts, { id: 'cottage', w, d, wallH, profile: 'rural', variant: 0 });
  mergeInto(buckets, parts);
  return { w: w + 0.3, d: d + 0.3, h: wallH + roofH };
}

function makeBarn(rng: Rng, buckets: PropsBuckets): StructureDimensions {
  const w = 7.5 + rng() * 1.2, d = 11 + rng() * 2, wallH = 3.6, roofH = 2.6, over = 0.45;
  const parts: PropsBuckets = {
    plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [],
  };
  parts.stone.push(box(w + 0.3, 1.2, d + 0.3).translate(0, -0.1, 0));
  parts.wood.push(box(w, wallH, d).translate(0, wallH / 2, 0));
  parts.wood.push(gablePrism(w, roofH, 0.3).translate(0, wallH, d / 2 - 0.15));
  parts.wood.push(gablePrism(w, roofH, 0.3).translate(0, wallH, -d / 2 + 0.15));
  const slope = Math.hypot(w / 2 + over, roofH + 0.1);
  const ang = Math.atan2(roofH + 0.1, w / 2 + over);
  for (const side of [-1, 1]) {
    const slab = slabBox(slope + 0.15, 0.14, d + over * 2, 0.35); // r2: real tile rows
    pitchRoofPlane(slab, 'x', -side as -1 | 1, ang, 'gable');
    slab.translate(-side * (w / 4 + over / 2), wallH + roofH / 2 + 0.07, 0);
    parts.roof.push(slab);
  }
  parts.dark.push(box(2.6, 2.9, 0.10).translate(0, 1.45, d / 2 + 0.08)); // big barn door
  parts.wood.push(box(2.9, 3.1, 0.06).translate(0, 1.55, d / 2 + 0.02));
  // r2 terrain_environment: the barn was a featureless dark box (critique).
  // Ridge cap, vertical batten relief on both long walls, cross-braced door
  // planks, a hayloft door + hoist beam in the gable, and small side windows.
  parts.roof.push(slabBox(0.36, 0.14, d + over * 2, 0.5).translate(0, wallH + roofH + 0.05, 0));
  {
    const nBat = Math.max(6, Math.round(d / 1.15));
    for (let bIdx = 0; bIdx < nBat; bIdx++) {
      const zz = -d / 2 + (bIdx + 0.5) * (d / nBat);
      for (const side of [-1, 1]) {
        const bat = box(0.07, wallH - 0.35, 0.13, 1.4);
        jitterUV(bat, rng);
        parts.wood.push(bat.translate(side * (w / 2 + 0.035), wallH / 2 - 0.1, zz));
      }
    }
    // diagonal door cross-brace plank
    const brace = box(0.16, 3.4, 0.05, 1.2);
    brace.rotateZ(0.72);
    parts.wood.push(brace.translate(0, 1.45, d / 2 + 0.15));
    // hayloft door + hoist beam high in the +z gable
    parts.dark.push(box(1.05, 1.15, 0.08).translate(0, wallH + roofH * 0.42, d / 2 + 0.04));
    parts.wood.push(box(1.25, 0.10, 0.10).translate(0, wallH + roofH * 0.42 + 0.68, d / 2 + 0.04));
    const hoist = box(0.10, 0.10, 0.85, 1.2);
    hoist.translate(0, wallH + roofH * 0.78, d / 2 + 0.35);
    parts.wood.push(hoist);
    // small side windows under the eaves
    for (const side of [-1, 1]) {
      for (const zz of [-d * 0.28, d * 0.28]) {
        if (rng() < 0.25) continue;
        parts.dark.push(box(0.06, 0.5, 0.62).translate(side * (w / 2 + 0.02), wallH - 0.75, zz));
        parts.wood.push(box(0.10, 0.08, 0.74).translate(side * (w / 2 + 0.04), wallH - 1.06, zz));
      }
    }
  }
  addConnectedExterior(parts, { id: 'barn', w, d, wallH, profile: 'timber', variant: 2 });
  mergeInto(buckets, parts);
  return { w: w + 0.3, d: d + 0.3, h: wallH + roofH };
}

function makeTower(rng: Rng, buckets: PropsBuckets): StructureDimensions {
  const w = 3.4, d = 3.4, wallH = 6.4 + rng() * 0.8;
  const parts: PropsBuckets = {
    plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [],
  };
  parts.stone.push(box(w + 0.4, 1.2, d + 0.4).translate(0, -0.1, 0));
  parts.stone.push(box(w, wallH, d, 0.7).translate(0, wallH / 2, 0));
  const spire = new THREE.ConeGeometry(w * 0.78, 2.6, 4, 1);
  spire.rotateY(Math.PI / 4);
  scaleUV(spire, 2, 2);
  spire.translate(0, wallH + 1.3, 0);
  parts.roof.push(spire);
  for (let k = 0; k < 3; k++) {
    const yy = 1.8 + k * 1.7;
    parts.dark.push(box(0.5, 0.8, 0.06).translate(0, yy, d / 2 + 0.04));
    parts.dark.push(box(0.06, 0.8, 0.5).translate(w / 2 + 0.04, yy, 0));
  }
  parts.wood.push(box(1.0, 2.2, 0.1).translate(0, 1.1, -d / 2 - 0.06));
  addConnectedExterior(parts, { id: 'tower', w, d, wallH, profile: 'civic', variant: 1 });
  mergeInto(buckets, parts);
  return { w: w + 0.4, d: d + 0.4, h: wallH + 2.6 };
}

function makeRuin(rng: Rng, buckets: PropsBuckets): StructureDimensions {
  const w = 6.0 + rng(), d = 8.0 + rng() * 1.5;
  const parts: PropsBuckets = {
    plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [],
  };
  parts.stone.push(box(w + 0.3, 1.0, d + 0.3).translate(0, -0.1, 0));
  // four broken walls: sequences of piers with varying heights
  const t = 0.5;
  const walls = [
    { len: d, rot: 0, ox: -w / 2 + t / 2, oz: 0 },
    { len: d, rot: 0, ox: w / 2 - t / 2, oz: 0 },
    { len: w - 2 * t, rot: Math.PI / 2, ox: 0, oz: -d / 2 + t / 2 },
    { len: w - 2 * t, rot: Math.PI / 2, ox: 0, oz: d / 2 - t / 2 },
  ];
  for (const wl of walls) {
    const segs = 3 + ((rng() * 3) | 0);
    const segLen = wl.len / segs;
    for (let k = 0; k < segs; k++) {
      if (rng() < 0.3) continue; // collapsed gap
      const hh = 0.9 + rng() * 2.1;
      const b = box(t, hh, segLen * 0.94, 0.7);
      b.translate(0, hh / 2, -wl.len / 2 + (k + 0.5) * segLen);
      if (wl.rot) b.rotateY(wl.rot);
      b.translate(wl.ox, 0, wl.oz);
      parts.stone.push(b);
    }
  }
  mergeInto(buckets, parts);
  return { w: w + 0.3, d: d + 0.3, h: 3.0 };
}

// flat-roofed adobe house (desert maps): parapet, wood roof beams, viga ends
function makeAdobe(rng: Rng, buckets: PropsBuckets): StructureDimensions {
  const w = 5.4 + rng() * 1.8, d = 5.8 + rng() * 2.6;
  const wallH = 3.0 + rng() * 0.5;
  const parts: PropsBuckets = {
    plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [],
  };
  parts.stone.push(box(w + 0.3, 0.8, d + 0.3).translate(0, -0.15, 0));
  parts.plaster.push(box(w, wallH, d).translate(0, wallH / 2, 0));
  // parapet rim
  parts.plaster.push(box(w, 0.45, 0.18).translate(0, wallH + 0.22, d / 2 - 0.09));
  parts.plaster.push(box(w, 0.45, 0.18).translate(0, wallH + 0.22, -d / 2 + 0.09));
  parts.plaster.push(box(0.18, 0.45, d - 0.36).translate(w / 2 - 0.09, wallH + 0.22, 0));
  parts.plaster.push(box(0.18, 0.45, d - 0.36).translate(-w / 2 + 0.09, wallH + 0.22, 0));
  parts.wood.push(slabBox(w - 0.2, 0.1, d - 0.2, 0.35).translate(0, wallH + 0.02, 0)); // roof deck (r2: slabBox)
  // viga beam ends over the door face
  const nBeam = Math.max(3, (w / 0.9) | 0);
  for (let k = 0; k < nBeam; k++) {
    const bx = -w / 2 + (k + 0.5) * (w / nBeam);
    const beam = new THREE.CylinderGeometry(0.07, 0.07, 0.55, 5, 1);
    scaleUV(beam, 0.5, 0.5);
    beam.rotateX(Math.PI / 2);
    beam.translate(bx, wallH - 0.28, d / 2 + 0.18);
    parts.wood.push(beam);
  }
  parts.wood.push(box(1.0, 2.0, 0.10).translate(w * 0.1, 1.0, d / 2 + 0.08));
  parts.dark.push(box(0.8, 1.8, 0.06).translate(w * 0.1, 0.95, d / 2 + 0.13));
  const nw = 1 + ((rng() * 2) | 0);
  for (let k = 0; k < nw; k++) {
    const zz = -d / 2 + (k + 0.5) * (d / nw);
    for (const side of [-1, 1]) {
      if (rng() < 0.3) continue;
      parts.dark.push(box(0.06, 0.7, 0.6).translate(side * (w / 2 + 0.05), 1.9, zz));
    }
  }
  if (rng() < 0.45) { // rooftop stair block
    parts.plaster.push(box(w * 0.35, 1.0, d * 0.3).translate(-w * 0.18, wallH + 0.5, -d * 0.18));
  }
  addConnectedExterior(parts, { id: 'adobe', w, d, wallH, profile: 'desert', variant: 0 });
  mergeInto(buckets, parts);
  return { w: w + 0.3, d: d + 0.3, h: wallH + 1.2 };
}

// 2-3 story town rowhouse (urban maps): window grids, shopfront, gable roof.
// dims {w,d} pins the footprint so street strips can butt shared walls.
function resolveRowhouseRoofHeight(rng: Rng, roofRoll: number): number {
  if (roofRoll < 0.13) return 0.7;
  if (roofRoll < 0.30) return 0.75 + rng() * 0.35;
  if (roofRoll < 0.44) return 1.9 + rng() * 0.55;
  return 1.35 + rng() * 0.6;
}

function addRowhouseFlatRoof(
  rng: Rng,
  buckets: PropsBuckets,
  parts: PropsBuckets,
  wallBucket: string,
  w: number,
  d: number,
  wallH: number,
): void {
  const deck = box(w - 0.24, 0.10, d - 0.24);
  const colors = new Float32Array(deck.attributes.position.count * 3);
  for (let i = 0; i < deck.attributes.position.count; i++) {
    const value = 0.045 + rng() * 0.02;
    colors[i * 3] = value * 1.08;
    colors[i * 3 + 1] = value;
    colors[i * 3 + 2] = value * 0.90;
  }
  deck.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  deck.translate(0, wallH + 0.14, 0);
  if (buckets.baked) parts.baked!.push(deck);
  else parts.roof.push(deck);
  const parapetHeight = 0.55 + rng() * 0.25;
  const y = wallH + parapetHeight / 2;
  parts[wallBucket].push(box(w, parapetHeight, 0.22).translate(0, y, d / 2 - 0.11));
  parts[wallBucket].push(box(w, parapetHeight, 0.22).translate(0, y, -d / 2 + 0.11));
  parts[wallBucket].push(box(0.22, parapetHeight, d).translate(w / 2 - 0.11, y, 0));
  parts[wallBucket].push(box(0.22, parapetHeight, d).translate(-w / 2 + 0.11, y, 0));
  parts.stone.push(box(w + 0.14, 0.10, 0.32)
    .translate(0, wallH + parapetHeight + 0.05, d / 2 - 0.11));
  parts.stone.push(box(w + 0.14, 0.10, 0.32)
    .translate(0, wallH + parapetHeight + 0.05, -d / 2 + 0.11));
  parts.stone.push(box(0.32, 0.10, d + 0.14)
    .translate(w / 2 - 0.11, wallH + parapetHeight + 0.05, 0));
  parts.stone.push(box(0.32, 0.10, d + 0.14)
    .translate(-w / 2 + 0.11, wallH + parapetHeight + 0.05, 0));
  if (rng() < 0.6) {
    parts[wallBucket].push(box(1.5, 1.1, 1.9)
      .translate((rng() - 0.5) * w * 0.3, wallH + 0.55, (rng() - 0.5) * d * 0.3));
  }
}

function addRowhouseRoof(
  rng: Rng,
  buckets: PropsBuckets,
  parts: PropsBuckets,
  wallBucket: string,
  w: number,
  d: number,
  wallH: number,
  roofH: number,
  flatRoof: boolean,
): number {
  const over = 0.3;
  if (flatRoof) {
    addRowhouseFlatRoof(rng, buckets, parts, wallBucket, w, d, wallH);
  } else {
    parts[wallBucket].push(gablePrism(w, roofH, 0.32)
      .translate(0, wallH, d / 2 - 0.16));
    parts[wallBucket].push(gablePrism(w, roofH, 0.32)
      .translate(0, wallH, -d / 2 + 0.16));
  }
  const slope = Math.hypot(w / 2 + over, roofH + 0.1);
  const angle = Math.atan2(roofH + 0.1, w / 2 + over);
  if (!flatRoof) for (const side of [-1, 1]) {
    const slab = slabBox(slope + 0.15, 0.13, d + over * 2, 0.35);
    pitchRoofPlane(slab, 'x', -side as -1 | 1, angle, 'gable');
    slab.translate(-side * (w / 4 + over / 2), wallH + roofH / 2 + 0.06, 0);
    parts.roof.push(slab);
  }
  return angle;
}

function addRowhouseFacadeRelief(
  rng: Rng,
  parts: PropsBuckets,
  wallBucket: string,
  lowContrastFacade: boolean,
  w: number,
  d: number,
  wallH: number,
): void {
  const trimBucket = lowContrastFacade
    ? 'stone'
    : wallBucket === 'plaster' || wallBucket === 'stone' ? 'stone' : 'plaster';
  if (rng() < 0.6) {
    parts[trimBucket].push(box(w + 0.22, 0.16, 0.12)
      .translate(0, wallH - 0.10, d / 2 + 0.05));
    parts[trimBucket].push(box(w + 0.22, 0.16, 0.12)
      .translate(0, wallH - 0.10, -d / 2 - 0.05));
    parts[trimBucket].push(box(0.12, 0.16, d + 0.22)
      .translate(w / 2 + 0.05, wallH - 0.10, 0));
    parts[trimBucket].push(box(0.12, 0.16, d + 0.22)
      .translate(-w / 2 - 0.05, wallH - 0.10, 0));
  }
  if (rng() < 0.45) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      parts.stone.push(box(0.20, wallH - 0.3, 0.20)
        .translate(sx * (w / 2 + 0.02), (wallH - 0.3) / 2, sz * (d / 2 + 0.02)));
    }
  }
}

function addRowhouseChimneys(
  rng: Rng,
  parts: PropsBuckets,
  w: number,
  d: number,
  wallH: number,
  roofH: number,
): void {
  const chimneyCount = 1 + (rng() < 0.55 ? 1 : 0);
  for (let index = 0; index < chimneyCount; index++) {
    const z = -d * 0.38 + rng() * d * 0.76;
    const x = (rng() - 0.5) * w * 0.12;
    const height = 1.1 + rng() * 0.7;
    const stack = box(0.66, height, 0.66, 0.8);
    jitterUV(stack, rng);
    parts.stone.push(stack.translate(x, wallH + roofH + height / 2 - 0.35, z));
    parts.stone.push(box(0.82, 0.14, 0.82)
      .translate(x, wallH + roofH + height - 0.30, z));
    if (rng() < 0.5) {
      const pot = new THREE.CylinderGeometry(0.10, 0.13, 0.34, 6, 1);
      pot.translate(x + (rng() - 0.5) * 0.3, wallH + roofH + height - 0.06,
        z + (rng() - 0.5) * 0.3);
      parts.roof.push(pot);
    }
  }
}

function addRowhouseRoofClutter(
  rng: Rng,
  parts: PropsBuckets,
  w: number,
  d: number,
  wallH: number,
  roofH: number,
): void {
  const ventCount = 1 + ((rng() * 2) | 0);
  for (let index = 0; index < ventCount; index++) {
    const z = -d * 0.34 + rng() * d * 0.68;
    const side = rng() < 0.5 ? -1 : 1;
    const x = side * w * (0.10 + rng() * 0.16);
    const y = wallH + roofH * (1 - Math.abs(x) / (w / 2 + 0.3)) - 0.12;
    const pipe = new THREE.CylinderGeometry(0.05, 0.06, 0.5 + rng() * 0.3, 5, 1);
    pipe.translate(x, y + 0.28, z);
    parts.dark.push(pipe);
  }
  if (rng() < 0.35) {
    const z = -d * 0.3 + rng() * d * 0.6;
    const height = 1.4 + rng() * 0.8;
    const mast = new THREE.CylinderGeometry(0.022, 0.028, height, 4, 1);
    mast.translate((rng() - 0.5) * w * 0.2,
      wallH + roofH + height / 2 - 0.3, z);
    parts.dark.push(mast);
    const bar = box(0.9 + rng() * 0.5, 0.03, 0.03, 2.0);
    bar.rotateY(rng() * Math.PI);
    bar.translate((rng() - 0.5) * w * 0.2, wallH + roofH + height - 0.34, z);
    parts.dark.push(bar);
  }
}

function addRowhouseDormers(
  rng: Rng,
  parts: PropsBuckets,
  wallBucket: string,
  w: number,
  d: number,
  wallH: number,
  roofH: number,
  roofAngle: number,
): void {
  if (rng() >= 0.4 || roofH <= 1.45) return;
  const count = 1 + ((rng() * 2) | 0);
  for (let index = 0; index < count; index++) {
    const side = rng() < 0.5 ? -1 : 1;
    const z = -d * 0.30 + rng() * d * 0.60;
    const y = wallH + roofH * 0.40;
    const x = side * (w / 2 + 0.3) * 0.55;
    parts[wallBucket].push(box(0.98, 1.0, 0.88).translate(x, y + 0.08, z));
    parts.dark.push(box(0.07, 0.60, 0.52).translate(x + side * 0.50, y + 0.14, z));
    parts.wood.push(box(0.05, 0.72, 0.10)
      .translate(x + side * 0.51, y + 0.14, z - 0.31));
    parts.wood.push(box(0.05, 0.72, 0.10)
      .translate(x + side * 0.51, y + 0.14, z + 0.31));
    const cap = slabBox(1.24, 0.09, 1.04, 0.4);
    pitchRoofPlane(cap, 'x', -side as -1 | 1, roofAngle * 0.5, 'dormer');
    cap.translate(x - side * 0.06, y + 0.72, z);
    parts.roof.push(cap);
  }
}

interface RowhouseWindowStyle {
  bayPitch: number;
  width: number;
  height: number;
  phase: number;
  shutters: boolean;
  trimBucket: string;
  doorSlots: readonly [number, number];
}

function pickRowhousePaneBucket(rng: Rng, lowContrastFacade: boolean): string {
  const roll = rng();
  if (lowContrastFacade) return roll < 0.76 ? 'glass' : 'dark';
  if (roll < 0.62) return 'glass';
  return roll < 0.83 ? 'curtain' : 'dark';
}

function addRowhouseGroundOpening(
  rng: Rng,
  parts: PropsBuckets,
  x: number,
  z: number,
  side: number,
): void {
  if (rng() < 0.55) {
    parts.glass!.push(box(0.07, 1.55, 1.90).translate(x + side * 0.02, 1.38, z));
    parts.stone.push(box(0.16, 0.42, 2.06).translate(x + side * 0.05, 0.32, z));
    parts.wood.push(box(0.10, 0.15, 2.10).translate(x + side * 0.055, 2.28, z));
    parts.wood.push(box(0.09, 0.44, 1.72).translate(x + side * 0.065, 2.66, z));
    if (rng() < 0.55) {
      const awning = pitchSkillionRoof(
        box(0.85, 0.06, 2.15), 'x', side as -1 | 1, 0.42,
      );
      awning.translate(x + side * 0.52, 2.62, z);
      parts.roof.push(awning);
    }
    return;
  }
  parts.wood.push(box(0.10, 2.24, 1.08).translate(x + side * 0.03, 1.14, z));
  parts.dark.push(box(0.06, 2.02, 0.86).translate(x + side * 0.085, 1.05, z));
  parts.wood.push(box(0.11, 0.15, 1.32).translate(x + side * 0.055, 2.34, z));
  parts.stone.push(box(0.36, 0.16, 1.26).translate(x + side * 0.16, 0.10, z));
}

function addRowhouseWindow(
  rng: Rng,
  parts: PropsBuckets,
  style: RowhouseWindowStyle,
  lowContrastFacade: boolean,
  x: number,
  y: number,
  z: number,
  side: number,
): void {
  const paneBucket = pickRowhousePaneBucket(rng, lowContrastFacade);
  parts[paneBucket].push(
    markWorldWindowPane(box(0.05, style.height, style.width), paneBucket, [side, 0, 0])
      .translate(x + side * 0.012, y, z),
  );
  const jambWidth = 0.14, proudness = side * 0.065;
  parts[style.trimBucket].push(box(jambWidth, style.height + 0.14, 0.13)
    .translate(x + proudness, y, z - style.width / 2 - 0.06));
  parts[style.trimBucket].push(box(jambWidth, style.height + 0.14, 0.13)
    .translate(x + proudness, y, z + style.width / 2 + 0.06));
  parts[style.trimBucket].push(box(0.17, 0.16, style.width + 0.34)
    .translate(x + side * 0.08, y + style.height / 2 + 0.09, z));
  parts.stone.push(box(0.22, 0.11, style.width + 0.30)
    .translate(x + side * 0.10, y - style.height / 2 - 0.07, z));
  parts.wood.push(box(0.07, 0.07, style.width)
    .translate(x + side * 0.038, y + style.height * 0.12, z));
  if (!style.shutters || rng() >= 0.8) return;
  parts.wood.push(box(0.05, style.height, 0.30)
    .translate(x + side * 0.03, y, z - style.width / 2 - 0.30));
  parts.wood.push(box(0.05, style.height, 0.30)
    .translate(x + side * 0.03, y, z + style.width / 2 + 0.30));
}

function addRowhouseGableWindows(
  rng: Rng,
  parts: PropsBuckets,
  style: RowhouseWindowStyle,
  lowContrastFacade: boolean,
  w: number,
  d: number,
  y: number,
): void {
  const x = w * (0.14 + rng() * 0.08);
  for (const z of [d / 2 + 0.05, -d / 2 - 0.05]) {
    for (const side of [-1, 1]) {
      const paneBucket = pickRowhousePaneBucket(rng, lowContrastFacade);
      parts[paneBucket].push(
        markWorldWindowPane(box(style.width, style.height, 0.06), paneBucket, [0, 0, Math.sign(z)])
          .translate(side * x, y, z),
      );
      parts.stone.push(box(style.width + 0.28, 0.10, 0.16)
        .translate(side * x, y - style.height / 2 - 0.06, z));
    }
  }
}

function addRowhouseWindowBay(
  rng: Rng,
  parts: PropsBuckets,
  style: RowhouseWindowStyle,
  lowContrastFacade: boolean,
  w: number,
  d: number,
  story: number,
  y: number,
  bay: number,
  bayCount: number,
): void {
  const z = -d / 2 + (bay + 0.5) * (d / bayCount) + style.phase;
  if (z < -d / 2 + 0.75 || z > d / 2 - 0.75) return;
  for (const side of [-1, 1]) {
    const x = side * (w / 2);
    if (story === 0 && bay === style.doorSlots[side < 0 ? 0 : 1] % bayCount) {
      addRowhouseGroundOpening(rng, parts, x, z, side);
    } else if (rng() >= 0.12) {
      addRowhouseWindow(rng, parts, style, lowContrastFacade, x, y, z, side);
    }
  }
}

function addRowhouseWindowGrid(
  rng: Rng,
  parts: PropsBuckets,
  style: RowhouseWindowStyle,
  lowContrastFacade: boolean,
  w: number,
  d: number,
  stories: number,
): void {
  for (let story = 0; story < stories; story++) {
    const y = 1.8 + story * 2.9;
    const bayCount = Math.max(2, Math.round(d / style.bayPitch));
    for (let bay = 0; bay < bayCount; bay++) {
      addRowhouseWindowBay(
        rng, parts, style, lowContrastFacade, w, d, story, y, bay, bayCount,
      );
    }
    if (story > 0) addRowhouseGableWindows(
      rng, parts, style, lowContrastFacade, w, d, y,
    );
  }
}

function addRowhouseStringCourse(
  parts: PropsBuckets,
  trimBucket: string,
  w: number,
  d: number,
): void {
  parts[trimBucket].push(box(w + 0.16, 0.14, 0.10).translate(0, 3.32, d / 2 + 0.04));
  parts[trimBucket].push(box(w + 0.16, 0.14, 0.10).translate(0, 3.32, -d / 2 - 0.04));
  parts[trimBucket].push(box(0.10, 0.14, d + 0.16).translate(w / 2 + 0.04, 3.32, 0));
  parts[trimBucket].push(box(0.10, 0.14, d + 0.16).translate(-w / 2 - 0.04, 3.32, 0));
}

function makeRowhouse(
  rng: Rng,
  buckets: PropsBuckets,
  wallBucket = 'plaster',
  dims: RowhouseDimensions | null = null,
): StructureDimensions {
  const lowContrastFacade = dims?.lowContrastTrim === true;
  const w = (dims && dims.w) || 8.0 + rng() * 3.0;
  const d = (dims && dims.d) || 9.0 + rng() * 4.0;
  const stories = 2 + ((rng() * 2) | 0);
  const wallH = stories * 2.9 + 0.6;
  // content_breadth r3: MIXED roof pitches — every house carried the same
  // 1.4-2.0 m gable ("one gable pitch" critique). ~20% low-pitch pans, ~15%
  // steep town gables, the rest the classic band.
  const roofRoll = rng();
  // content_breadth r4: ~13% PARAPET-FLAT roofs — the establishing camera
  // reads the town as roofscape, and an unbroken sheet of same-axis gables
  // was the loudest "archetype repetition" tell along the main street.
  const flatRoof = roofRoll < 0.13;
  const roofH = resolveRowhouseRoofHeight(rng, roofRoll);
  const parts: PropsBuckets = {
    plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [],
    glass: [], curtain: [], baked: [],
  };
  parts.stone.push(box(w + 0.3, 1.2, d + 0.3).translate(0, -0.1, 0));
  parts[wallBucket].push(box(w, wallH, d).translate(0, wallH / 2, 0));
  const roofAngle = addRowhouseRoof(
    rng, buckets, parts, wallBucket, w, d, wallH, roofH, flatRoof,
  );
  // content_breadth r4: facade RELIEF that survives to mid distance — a
  // proud eaves cornice band under the roofline (~60%) and stone corner
  // quoin strips on masonry walls (~45%): the two most-repeated street
  // archetypes stop reading as bare extruded boxes
  addRowhouseFacadeRelief(rng, parts, wallBucket, lowContrastFacade, w, d, wallH);
  // r7 ROOFSCAPE: ridge chimney stacks with cap slabs (1-2 per house, real
  // masonry proportions) — the old lone 0.6 m stub on the slope was invisible
  // at gameplay distance and the roofs read as bare extruded caps
  addRowhouseChimneys(rng, parts, w, d, wallH, roofH);
  // r7 terrain_environment ROOF CLUTTER: small vent pipes + the occasional
  // wire aerial mast — the ridge chimneys alone left mid-distance roofscapes
  // reading as bare extruded caps (critique: "almost no roof clutter")
  addRowhouseRoofClutter(rng, parts, w, d, wallH, roofH);
  // r7 DORMERS on ~40% of houses: boxed body half-sunk into the slope, dark
  // attic window on the vertical face, pitched cap slab — breaks the bare
  // roof planes the critique flagged
  addRowhouseDormers(rng, parts, wallBucket, w, d, wallH, roofH, roofAngle);
  // window grids on the long sides.
  // r6: ground floors get STREET LIFE — one door or shopfront slot per long
  // side, and ~40% of buildings hang wooden shutters beside their windows.
  // The critique: two facade materials with identical punched black window
  // rectangles and "no street-level doors, shutters, or signage visible".
  const windowStyle: RowhouseWindowStyle = {
    doorSlots: [(rng() * 97) | 0, (rng() * 97) | 0],
    shutters: rng() < 0.4,
  // r7 PER-BUILDING WINDOW LANGUAGE: bay pitch, opening size and a rhythm
  // phase all vary house-to-house — the critique's "repeated identical
  // window spacing across facades" came from every facade computing the same
  // d/2.6 grid with the same 1.25 x 0.82 opening
    bayPitch: 2.3 + rng() * 0.9,
    width: 0.72 + rng() * 0.22,
    height: 1.10 + rng() * 0.30,
    phase: (rng() - 0.5) * 0.5,
    trimBucket: resolveRowhouseTrimBucket(
      wallBucket, rng() < 0.5, lowContrastFacade,
    ),
  };
  addRowhouseWindowGrid(
    rng, parts, windowStyle, lowContrastFacade, w, d, stories,
  );
  // string course between ground and first floor on masonry facades: cheap
  // horizontal relief that kills the single-extrusion read from the street
  if (rng() < 0.55) {
    addRowhouseStringCourse(parts, windowStyle.trimBucket, w, d);
  }
  // street door + shopfront on the +z gable face
  parts.wood.push(box(1.2, 2.3, 0.12).translate(-w * 0.15, 1.15, d / 2 + 0.08));
  parts.dark.push(box(1.0, 2.1, 0.06).translate(-w * 0.15, 1.1, d / 2 + 0.14));
  if (rng() < 0.55) parts.glass!.push(box(2.3, 1.5, 0.06).translate(w * 0.18, 1.5, d / 2 + 0.10));
  const facadeVariant = (Math.round(w * 10) + Math.round(d * 10) + stories) % 4;
  addConnectedExterior(parts, {
    id: 'rowhouse', w, d, wallH, profile: 'urban', variant: facadeVariant,
  });
  mergeInto(buckets, parts);
  return { w: w + 0.3, d: d + 0.3, h: wallH + roofH };
}

const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
// Round 79 (2026-09-28, the performance lane): caster PROFILES for the cascade router (engine/shadowCasterProfiles.ts).
// A merged bucket or an instanced kind spread over the map touches every cascade's light-space box through its
// bounding sphere, so three drew it into all four maps whatever the box actually held — at the chase pose on
// Monsoon Ridge the first cascade's box held none of the 166 fence panels, 128 wall modules, 43 wire coils or 24
// poles, each drawn into it every frame. A profile tells the router where the content stands (an InstancedMesh's
// instances, a bucket's piece cells) and how tall it is (a shadow shorter than two texels of a map's PCF kernel
// cannot read there); the router skips the cascades the content cannot touch.
const PROPS_SHADOW_CELL_M = 96;
const _profileSphere = new THREE.Sphere();
/** The content height of a geometry under the largest of `matrices` (metres). */
function casterHeightM(geometry: THREE.BufferGeometry, matrices: readonly THREE.Matrix4[] | null): number {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box || box.isEmpty()) return 0;
  let scale = 1;
  if (matrices) {
    scale = 0;
    for (const matrix of matrices) scale = Math.max(scale, matrix.getMaxScaleOnAxis());
  }
  return (box.max.y - box.min.y) * scale;
}
/** The profile of a merged bucket: one world sphere per PROPS_SHADOW_CELL_M cell of piece centres, the tallest piece's height. */
function bucketShadowProfile(pieces: readonly THREE.BufferGeometry[]): ShadowCasterProfile {
  const cells = new Map<number, THREE.Box3>();
  let height = 0;
  for (const piece of pieces) {
    if (!piece.boundingBox) piece.computeBoundingBox();
    const box = piece.boundingBox;
    if (!box || box.isEmpty()) continue;
    height = Math.max(height, box.max.y - box.min.y);
    const cx = Math.floor((box.min.x + box.max.x) * 0.5 / PROPS_SHADOW_CELL_M);
    const cz = Math.floor((box.min.z + box.max.z) * 0.5 / PROPS_SHADOW_CELL_M);
    const key = (cx + 4096) * 8192 + (cz + 4096);
    let cell = cells.get(key);
    if (!cell) { cell = new THREE.Box3(); cells.set(key, cell); }
    cell.union(box);
  }
  const spheres = new Float32Array(cells.size * 4);
  let i = 0;
  for (const cell of cells.values()) {
    cell.getBoundingSphere(_profileSphere);
    spheres[i * 4] = _profileSphere.center.x;
    spheres[i * 4 + 1] = _profileSphere.center.y;
    spheres[i * 4 + 2] = _profileSphere.center.z;
    spheres[i * 4 + 3] = _profileSphere.radius;
    i++;
  }
  return { heightM: height, spheres };
}
/** The profile of a merged shadow-only mesh whose parts are known: one sphere per part, the tallest part's height. */
function partsShadowProfile(parts: readonly THREE.BufferGeometry[]): ShadowCasterProfile {
  const spheres = new Float32Array(parts.length * 4);
  let height = 0;
  parts.forEach((part, i) => {
    if (!part.boundingSphere) part.computeBoundingSphere();
    if (!part.boundingBox) part.computeBoundingBox();
    const sphere = part.boundingSphere;
    if (sphere) { spheres[i * 4] = sphere.center.x; spheres[i * 4 + 1] = sphere.center.y; spheres[i * 4 + 2] = sphere.center.z; spheres[i * 4 + 3] = sphere.radius; }
    const box = part.boundingBox;
    if (box && !box.isEmpty()) height = Math.max(height, box.max.y - box.min.y);
  });
  return { heightM: height, spheres };
}

const _upAxis = new THREE.Vector3(0, 1, 0);
const _one = new THREE.Vector3(1, 1, 1);
const _posv = new THREE.Vector3();
const _scalev = new THREE.Vector3();
const _euler = new THREE.Euler();

function mergeInto(
  buckets: PropsBuckets,
  parts: PropsBuckets,
  transform: THREE.Matrix4 | null = null,
): void {
  for (const key of Object.keys(parts)) {
    for (const g of parts[key]) {
      if (transform) g.applyMatrix4(transform);
      buckets[key].push(g);
    }
  }
  // settlement pass 2 (2026-09-12): chimney tops ride along with the geometry
  // so the finished bucket set knows every stack in world space (hearth smoke).
  carryExteriorChimneyTops(buckets, parts, transform);
}

type GroundDecalKind = 'dirt' | 'apron' | 'crater' | 'scorch';

function configureDecalGradient(
  gradient: CanvasGradient,
  kind: GroundDecalKind,
): void {
  if (kind === 'scorch') {
    gradient.addColorStop(0, 'rgba(26,20,14,0.92)');
    gradient.addColorStop(0.38, 'rgba(52,38,24,0.85)');
    gradient.addColorStop(0.66, 'rgba(84,66,42,0.55)');
    gradient.addColorStop(1, 'rgba(90,74,48,0)');
  } else if (kind === 'crater') {
    gradient.addColorStop(0, 'rgba(16,13,10,0.96)');
    gradient.addColorStop(0.30, 'rgba(30,24,17,0.93)');
    gradient.addColorStop(0.52, 'rgba(64,50,32,0.88)');
    gradient.addColorStop(0.74, 'rgba(70,56,37,0.55)');
    gradient.addColorStop(1, 'rgba(74,60,40,0)');
  } else if (kind === 'apron') {
    gradient.addColorStop(0, 'rgba(112,101,84,0.92)');
    gradient.addColorStop(0.55, 'rgba(104,93,76,0.88)');
    gradient.addColorStop(0.82, 'rgba(96,86,70,0.72)');
    gradient.addColorStop(1, 'rgba(90,80,66,0.55)');
  } else {
    gradient.addColorStop(0, 'rgba(52,42,27,0.94)');
    gradient.addColorStop(0.4, 'rgba(66,53,34,0.82)');
    gradient.addColorStop(0.72, 'rgba(78,64,42,0.5)');
    gradient.addColorStop(1, 'rgba(82,68,45,0)');
  }
}

function paintApronGrit(ctx: CanvasRenderingContext2D, size: number): void {
  const rng = mulberry32(5519);
  for (let k = 0; k < 260; k++) {
    const x = rng() * size, y = rng() * size, radius = 0.8 + rng() * 2.6;
    ctx.fillStyle = rng() < 0.5
      ? `rgba(84,74,60,${0.10 + rng() * 0.16})`
      : `rgba(132,121,102,${0.08 + rng() * 0.14})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintCraterEjecta(ctx: CanvasRenderingContext2D, size: number): void {
  const rng = mulberry32(7717);
  ctx.strokeStyle = 'rgba(58,46,30,0.55)';
  ctx.lineCap = 'round';
  for (let k = 0; k < 22; k++) {
    const angle = rng() * Math.PI * 2;
    const innerRadius = size * (0.26 + rng() * 0.10);
    const outerRadius = size * (0.38 + rng() * 0.16);
    ctx.lineWidth = 1.5 + rng() * 3.5;
    ctx.globalAlpha = 0.35 + rng() * 0.5;
    ctx.beginPath();
    ctx.moveTo(size / 2 + Math.cos(angle) * innerRadius,
      size / 2 + Math.sin(angle) * innerRadius);
    ctx.lineTo(size / 2 + Math.cos(angle + (rng() - 0.5) * 0.2) * outerRadius,
      size / 2 + Math.sin(angle + (rng() - 0.5) * 0.2) * outerRadius);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function applyDecalRaggedEdge(
  image: ImageData,
  noise: SimplexNoise,
  size: number,
  kind: GroundDecalKind,
): void {
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x - size / 2) / (size / 2);
    const dy = (y - size / 2) / (size / 2);
    const radius = kind === 'apron'
      ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.hypot(dx, dy);
    const sample = noise.noise(x * 0.11 + (kind === 'scorch' ? 40 : 0), y * 0.11)
      * 0.5 + 0.5;
    const edge = kind === 'apron'
      ? smoothstep(0.66, 0.99, radius + (sample - 0.5) * 0.20)
      : smoothstep(0.55, 1.0, radius);
    let alpha = clamp(1 - edge * (kind === 'apron' ? 1.0 + sample * 0.25
      : 0.4 + sample * 1.1), 0, 1);
    if (kind === 'apron') alpha *= 1 - smoothstep(0.94, 1.0, radius);
    image.data[(y * size + x) * 4 + 3] *= alpha;
  }
}

/**
 * The scenery lane (b44; gauntlet wave 272 on Reservoir and Saltwind: each boulder "sits on a flat tan disc that rings
 * its base like a cookie-cutter decal", "a conspicuous pale-tan ring or dish"): the props' ground-contact layer — the
 * boulders' contact patches and the shades over their beds, the crushables', the field stacks' and the foundations'
 * discs — darkens the ground it lies on instead of laying a soil of its own over it. The fixed brown soil, lit by the
 * full sun with no shadow, read as a pale tan ring over a red karst soil, a shaded forest floor or a meadow. Now: the
 * drawn ground multiplied by a faintly warm grey, by the layer's alpha (the decal texture's ragged profile × the ring's
 * share in the vertex alpha) × the kind's strength (the vertex red, conformedDisc), so the ground keeps its own colour,
 * grain and light, darker toward the foot, and the patch has no edge (its alpha falls to nothing at the rim). Unlit, no
 * fog of its own (a fogged far patch would tint the haze), gone by 160 m, receiving no shadow (the shadow audits).
 */
function contactDarkeningMaterial(tex: THREE.Texture): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false,
    blending: THREE.MultiplyBlending, premultipliedAlpha: true, vertexColors: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>', '#include <common>\nvarying float vCotContactDist;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <project_vertex>', '#include <project_vertex>\nvCotContactDist = -mvPosition.z;');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <common>', '#include <common>\nvarying float vCotContactDist;');
    // (MultiplyBlending: the target × (rgb·a + 1 − a) of the premultiplied output — the ground × mix(1, the grey, a))
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <premultiplied_alpha_fragment>', /* glsl */`{
  float cotContactA = clamp(diffuseColor.a * 2.5 * vColor.r, 0.0, 0.8) * (1.0 - smoothstep(80.0, 160.0, vCotContactDist));
  gl_FragColor = vec4(0.56, 0.53, 0.49, cotContactA);
}
#include <premultiplied_alpha_fragment>`);
  };
  mat.customProgramCacheKey = () => 'props-contact-darkening-v1';
  return mat;
}

function makeGroundDecalTexture(
  noise: SimplexNoise,
  anisotropy: number,
  kind: GroundDecalKind,
): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas2d(canvas, { willReadFrequently: true });
  ctx.clearRect(0, 0, size, size);
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0, size / 2, size / 2, size / 2,
  );
  configureDecalGradient(gradient, kind);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  if (kind === 'apron') paintApronGrit(ctx, size);
  if (kind === 'crater') paintCraterEjecta(ctx, size);
  const image = ctx.getImageData(0, 0, size, size);
  applyDecalRaggedEdge(image, noise, size, kind);
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

interface RoadsideSpotContext {
  rng: Rng;
  roads: TerrainLayout['roads'];
  heightField: HeightField;
  noVegetation(x: number, z: number): boolean;
  spawns: TerrainLayout['spawns'];
  placedBuildings: readonly PlacedRadius[];
}

function isRoadsideSpotClear(
  { heightField, noVegetation, spawns, placedBuildings }: RoadsideSpotContext,
  x: number,
  z: number,
): boolean {
  if (Math.max(Math.abs(x), Math.abs(z)) > 455) return false;
  if (heightField._roadDist(x, z) < 4.6 || noVegetation(x, z)) return false;
  if (heightField.getGroundType(x, z) === 'soft') return false;
  if (heightField.getNormalAt(x, z).y < 0.90) return false;
  if ([spawns.player, ...spawns.enemies]
    .some((spawn) => Math.hypot(x - spawn.x, z - spawn.z) < 24)) return false;
  return !placedBuildings.some(
    (building) => Math.hypot(x - building.x, z - building.z) < building.rr + 2.5,
  );
}

function findRoadsideSpot(
  context: RoadsideSpotContext,
  offMin: number,
  offMax: number,
  tries = 40,
): [number, number, number] | null {
  const { rng, roads } = context;
  for (let attempt = 0; attempt < tries; attempt++) {
    const road = (rng() * roads.length) | 0, nodes = roads[road];
    if (!nodes) continue;
    const layout = context.heightField._layout;
    const count = authoredRoadStationCount(layout, road);
    if (count < 4) continue;
    const original = 2 + ((rng() * (count - 3)) | 0);
    const side = rng() < 0.5 ? -1 : 1;
    const offset = offMin + rng() * (offMax - offMin);
    // A trimmed selection still consumes the same four proposal draws. It
    // never snaps onto an inserted endpoint or rerolls a different ordinal.
    const index = authoredRoadStationIndex(layout, road, original);
    if (index < 0) continue;
    const [startX, startZ] = nodes[index], [endX, endZ] = nodes[index + 1];
    const tangentLength = Math.hypot(endX - startX, endZ - startZ) || 1;
    const x = startX - ((endZ - startZ) / tangentLength) * offset * side;
    const z = startZ + ((endX - startX) / tangentLength) * offset * side;
    if (!isRoadsideSpotClear(context, x, z)) continue;
    return [x, z, Math.atan2(endX - startX, endZ - startZ)];
  }
  return null;
}

type AddDestructible = (
  kind: string,
  x: number,
  y: number,
  z: number,
  yaw?: number,
  scale?: number,
  tiltX?: number,
  tiltZ?: number,
) => DestructibleRecord;

interface FieldScatterContext {
  rng: Rng;
  village: TerrainLayout['village'];
  heightField: HeightField;
  noVegetation(x: number, z: number): boolean;
  spawns: readonly { x: number; z: number }[];
  addDestructible: AddDestructible;
}

function isFieldScatterPointClear(
  context: FieldScatterContext,
  x: number,
  z: number,
): boolean {
  const { village, heightField, noVegetation, spawns } = context;
  if (x > village.x0 - 8 && x < village.x1 + 8
      && z > village.z0 - 8 && z < village.z1 + 8) return false;
  if (heightField._roadDist(x, z) < 8) return false;
  if (heightField.getGroundType(x, z) === 'soft' || noVegetation(x, z)) return false;
  if (heightField.getNormalAt(x, z).y < 0.93) return false;
  return !spawns.some((spawn) => Math.hypot(x - spawn.x, z - spawn.z) < 18);
}

function addFieldScatterPartners(
  context: FieldScatterContext,
  kind: string,
  x: number,
  z: number,
): void {
  const { rng, heightField, noVegetation, addDestructible } = context;
  const partnerCount = 1 + ((rng() * 2) | 0);
  for (let index = 0; index < partnerCount; index++) {
    const angle = rng() * Math.PI * 2;
    const radius = 2.4 + rng() * 4;
    const partnerX = x + Math.cos(angle) * radius;
    const partnerZ = z + Math.sin(angle) * radius;
    if (heightField._roadDist(partnerX, partnerZ) < 7
        || noVegetation(partnerX, partnerZ)) continue;
    addDestructible(kind, partnerX,
      heightField.getHeightAt(partnerX, partnerZ) - 0.03, partnerZ,
      rng() * Math.PI * 2, 0.85 + rng() * 0.3);
  }
}

function scatterFieldProps(
  context: FieldScatterContext,
  kind: string,
  count: number,
): void {
  const { rng, heightField, addDestructible } = context;
  for (let attempt = 0, placed = 0; attempt < count * 16 && placed < count; attempt++) {
    const x = (rng() * 2 - 1) * 420;
    const z = (rng() * 2 - 1) * 420;
    if (!isFieldScatterPointClear(context, x, z)) continue;
    const y = heightField.getHeightAt(x, z);
    addDestructible(kind, x, y - 0.03, z, rng() * Math.PI * 2, 0.9 + rng() * 0.3);
    if (rng() < 0.55) addFieldScatterPartners(context, kind, x, z);
    placed++;
  }
}

interface DestructibleBuildContext {
  heightField: HeightField;
  seed: number;
  localTypes: Readonly<Record<string, PropsDestructibleMeta>>;
  pools: Map<string, DestructiblePool>;
  records: DestructibleRecord[];
  looseRecords: LooseDestructibleRecord[];
  obstacles: PropsCollisionRecord[];
  colliders: CollisionRecord[];
  crushables: CrushableRecord[];
  quaternion: THREE.Quaternion;
  euler: THREE.Euler;
}

interface GroundedDestructiblePlacement {
  y: number;
  support: GroundSupportRecord | null;
}

interface DestructibleContactExtents {
  radius: number;
  halfWidth: number;
  halfLength: number;
}

function resolveDestructibleMeta(
  context: DestructibleBuildContext,
  kind: string,
): PropsDestructibleMeta {
  const meta = context.localTypes[kind]
    || DESTRUCTIBLE_BUILDING_TYPES[kind] || PROP_TYPE_REGISTRY[kind];
  if (!meta) throw new Error('world/props: unknown destructible kind ' + kind);
  return meta;
}

const CART_KINDS: ReadonlySet<string> = new Set(Object.keys(CART_RECEIPTS));
/**
 * The records seated on the ground under their footprint, tilted to it (cartGroundPose): the carts, and since
 * 2026-10-08 the parked vehicles (the map-vehicles lane's placement audit over the merge: seated level at the lowest
 * ground under them, 382 vehicles over 33 maps stood with a corner 0.2-1.9 m inside the slope uphill, their wheels cut
 * by it). A vehicle with an authored tilt keeps it.
 */
const GROUND_POSED_KINDS: ReadonlySet<string> = new Set([...CART_KINDS, ...Object.keys(CIVILIAN_VEHICLE_RECEIPTS)]);

interface CartGroundPose { y: number; tiltX: number; tiltZ: number; min: number; max: number; steep: boolean }

/**
 * A cart's seat on the ground under its footprint (wave 211: a hay sledge on a 19-degree bank, seated level at its
 * lowest corner, had its runners buried uphill and its downhill side in the air): the plane through the ground at its
 * four corners, pitch and roll each clamped at 12 degrees (the integrator's ruling, 2026-10-07), its centre at the
 * plane's height there. `steep`: the plane itself tilts past the cap (a road-cart station refuses such a seat).
 */
function cartGroundPose(heightField: Pick<HeightField, 'getHeightAt'>, x: number, z: number, yaw: number, hw: number,
  hl: number): CartGroundPose {
  const max = (12 * Math.PI) / 180, c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx: number, lz: number) => heightField.getHeightAt(x + lx * c + lz * s, z - lx * s + lz * c);
  const fl = at(-hw, hl), fr = at(hw, hl), bl = at(-hw, -hl), br = at(hw, -hl);
  const pitch = Math.atan2((fl + fr) / 2 - (bl + br) / 2, 2 * hl), roll = Math.atan2((fr + br) / 2 - (fl + bl) / 2, 2 * hw);
  const clamp = (v: number) => Math.max(-max, Math.min(max, v));
  // three's 'YXZ' order: a positive X turn dips the cart's nose (+z), a positive Z turn lifts its right side (+x)
  return {
    y: (fl + fr + bl + br) / 4, tiltX: -clamp(pitch), tiltZ: clamp(roll),
    min: Math.min(fl, fr, bl, br), max: Math.max(fl, fr, bl, br),
    steep: Math.atan(Math.hypot(Math.tan(pitch), Math.tan(roll))) > max,
  };
}

/**
 * How far a cart sits into the ground under it: 3 cm, and a sled on snow (its runners recorded: cartKit.ts) the runners'
 * own sink deeper (round 4, wave 260: "no runner sink"; cartBodies.ts runnerLips presses the snow up round them).
 */
function cartSink(meta: { runners?: unknown }): number {
  return 0.03 + (meta.runners ? RUNNER_SNOW_SINK_M : 0);
}

function groundDestructiblePlacement(
  heightField: HeightField,
  meta: PropsDestructibleMeta,
  x: number,
  y: number,
  z: number,
  yaw: number,
  scale: number,
  tiltX: number,
  tiltZ: number,
): GroundedDestructiblePlacement {
  if (meta.fence || meta.wall) {
    const centerY = heightField.getHeightAt(x, z);
    return {
      y: Math.min(y, centerY - 0.025),
      support: { mode: 'pitched', min: centerY, max: centerY, spread: 0 },
    };
  }
  if (Math.abs(tiltX) >= 0.08 || Math.abs(tiltZ) >= 0.08) {
    return { y, support: null };
  }
  const usesObb = meta.hw != null || meta.hl != null;
  const sampled = usesObb
    ? sampleObbGround(heightField, x, z,
      (meta.hw ?? meta.r) * scale, (meta.hl ?? meta.r) * scale, yaw, 0.025)
    : sampleDiscGround(heightField, x, z,
      (meta.groundR ?? meta.collisionR ?? meta.r) * scale, 0.025);
  return {
    y: Math.min(y, sampled.y),
    support: { mode: usesObb ? 'obb' : 'disc', ...sampled },
  };
}

function ensureDestructiblePool(
  context: DestructibleBuildContext,
  kind: string,
  meta: PropsDestructibleMeta,
): DestructiblePool {
  const existing = context.pools.get(kind);
  if (existing) return existing;
  const pool: DestructiblePool = {
    meta, mats4: [], records: [], imI: null, imB: null, nBroken: 0,
  };
  context.pools.set(kind, pool);
  return pool;
}

function addLooseDestructibleBody(
  context: DestructibleBuildContext,
  meta: PropsDestructibleMeta,
  record: DestructibleRecord,
  recordIndex: number,
): void {
  if (meta.cls !== 'physics') return;
  record.looseIndex = context.looseRecords.length;
  record.body = createLoosePropBody({
    x: record.x, baseY: record.y, z: record.z,
    radius: (meta.bodyR ?? meta.r) * record.sc,
    height: record.h,
    mass: meta.mass ?? 1,
    restitution: meta.bounce ?? 0.32,
    friction: meta.friction ?? 2.2,
    airDrag: meta.airDrag ?? 0.16,
    angularDrag: meta.angularDrag ?? 0.42,
    groundConstrained: meta.groundConstrained === true,
    spinBias: ((recordIndex + context.seed) & 1) ? 1 : -1,
  });
  record.looseListed = false;
  context.looseRecords.push(record as LooseDestructibleRecord);
}

function getDestructibleContactExtents(
  meta: PropsDestructibleMeta,
  scale: number,
  yaw: number,
  radius: number,
): DestructibleContactExtents {
  const contactRadius = meta.fence || meta.wall
    ? Math.max(meta.r * scale, 0.6) : radius;
  if (meta.hw != null || meta.hl != null) {
    const halfWidth = (meta.hw ?? meta.r) * scale;
    const halfLength = (meta.hl ?? meta.r) * scale;
    const cosine = Math.abs(Math.cos(yaw));
    const sine = Math.abs(Math.sin(yaw));
    return {
      radius: contactRadius,
      halfWidth: halfWidth * cosine + halfLength * sine + 0.05,
      halfLength: halfWidth * sine + halfLength * cosine + 0.05,
    };
  }
  if (meta.fence || meta.wall) {
    const segmentLength = meta.wall ? WALL_SEG : FENCE_SEG;
    const thickness = meta.wall ? 0.35 : 0.2;
    const cosine = Math.abs(Math.cos(yaw));
    const sine = Math.abs(Math.sin(yaw));
    return {
      radius: contactRadius,
      halfWidth: (thickness * cosine + segmentLength * 0.5 * sine) * scale + 0.05,
      halfLength: (thickness * sine + segmentLength * 0.5 * cosine) * scale + 0.05,
    };
  }
  return { radius: contactRadius, halfWidth: contactRadius, halfLength: contactRadius };
}

function applyDestructibleObstacleShape(
  obstacle: PropsCollisionRecord,
  meta: PropsDestructibleMeta,
  record: DestructibleRecord,
  extents: DestructibleContactExtents,
): void {
  const { x, z, yaw, sc: scale } = record;
  if (meta.hw != null || meta.hl != null) {
    setObbShape(obstacle, x, z, (meta.hw ?? meta.r) * scale + 0.05,
      (meta.hl ?? meta.r) * scale + 0.05, yaw);
  } else if (meta.fence || meta.wall) {
    const segmentLength = meta.wall ? WALL_SEG : FENCE_SEG;
    const thickness = meta.wall ? 0.35 : 0.2;
    setObbShape(obstacle, x, z, thickness * scale + 0.05,
      segmentLength * 0.5 * scale + 0.05, yaw);
  } else if (meta.shape === 'circle') {
    setCircleShape(obstacle, x, z, (meta.collisionR ?? meta.r) * scale + 0.025);
  } else {
    setObbShape(obstacle, x, z, extents.radius, extents.radius, yaw);
  }
}

function registerDestructibleObstacle(
  context: DestructibleBuildContext,
  meta: PropsDestructibleMeta,
  record: DestructibleRecord,
  recordIndex: number,
): void {
  const extents = getDestructibleContactExtents(meta, record.sc, record.yaw, record.r);
  const obstacle: PropsCollisionRecord = {
    min: [record.x - extents.halfWidth, record.y, record.z - extents.halfLength],
    max: [record.x + extents.halfWidth, record.y + record.h,
      record.z + extents.halfLength],
    crushable: true, crushed: false, propIdx: recordIndex, kind: record.kind,
  };
  applyDestructibleObstacleShape(obstacle, meta, record, extents);
  if (meta.keep != null) obstacle.crushKeep = meta.keep;
  if (meta.crushMin != null) obstacle.crushMin = meta.crushMin;
  record.ob = obstacle;
  context.obstacles.push(obstacle);
  if (!meta.collider) return;
  const collider = cloneCollisionRecord(obstacle);
  collider.dead = false;
  record.col = collider;
  context.colliders.push(collider);
}

function registerDestructibleContact(
  context: DestructibleBuildContext,
  meta: PropsDestructibleMeta,
  record: DestructibleRecord,
  recordIndex: number,
): void {
  if (meta.contact === 'ob') {
    registerDestructibleObstacle(context, meta, record, recordIndex);
    return;
  }
  if (meta.contact !== 'loop') return;
  const entry: CrushableRecord = {
    x: record.x, y: record.y, z: record.z, r: record.r, h: record.h,
    recIdx: recordIndex, kind: record.kind,
    dynamic: meta.cls === 'physics', toppled: false,
  };
  context.crushables.push(entry);
  record.loopRef = entry;
}

function addDestructibleRecord(
  context: DestructibleBuildContext,
  kind: string,
  x: number,
  y: number,
  z: number,
  yaw = 0,
  scale = 1,
  tiltX = 0,
  tiltZ = 0,
): DestructibleRecord {
  const meta = resolveDestructibleMeta(context, kind);
  let placement: GroundedDestructiblePlacement;
  if (GROUND_POSED_KINDS.has(kind) && tiltX === 0 && tiltZ === 0) {
    // a cart or a parked vehicle sits on the ground under it, tilted to it (cartGroundPose), a few centimetres into it
    const pose = cartGroundPose(context.heightField, x, z, yaw, (meta.hw ?? meta.r) * scale, (meta.hl ?? meta.r) * scale);
    tiltX = pose.tiltX; tiltZ = pose.tiltZ;
    placement = { y: pose.y - cartSink(meta), support: { mode: 'pitched', min: pose.min, max: pose.max, spread: pose.max - pose.min } };
  } else {
    placement = groundDestructiblePlacement(context.heightField, meta, x, y, z, yaw, scale, tiltX, tiltZ);
  }
  const pool = ensureDestructiblePool(context, kind, meta);
  context.euler.set(tiltX, yaw, tiltZ, 'YXZ');
  context.quaternion.setFromEuler(context.euler);
  _mat4.compose(_posv.set(x, placement.y, z), context.quaternion,
    _scalev.set(scale, scale, scale));
  pool.mats4.push(_mat4.clone());
  const record: DestructibleRecord = {
    kind, cls: meta.cls, x, y: placement.y, z, yaw, sc: scale,
    r: meta.r * scale, h: meta.h * scale,
    slot: pool.mats4.length - 1, state: 0, ob: null,
    groundSupport: placement.support,
  };
  const recordIndex = context.records.length;
  context.records.push(record);
  pool.records.push(record);
  addLooseDestructibleBody(context, meta, record, recordIndex);
  registerDestructibleContact(context, meta, record, recordIndex);
  return record;
}

function autumnHeadlandTerrainClear(field: FieldScatterContext, site: AutumnHeadlandSite,
  radius: number): boolean {
  if (!isFieldScatterPointClear(field, site.x, site.z)) return false;
  const { village, heightField, spawns } = field;
  if (Math.max(Math.abs(site.x), Math.abs(site.z)) + radius > 420) return false;
  if (site.x > village.x0 - 8 - radius && site.x < village.x1 + 8 + radius
      && site.z > village.z0 - 8 - radius && site.z < village.z1 + 8 + radius) return false;
  if (heightField._roadDist(site.x, site.z) < 8 + radius) return false;
  return !spawns.some(spawn => Math.hypot(site.x - spawn.x, site.z - spawn.z) < 18 + radius);
}

function autumnHeadlandFootprintDry(field: FieldScatterContext, site: AutumnHeadlandSite,
  radius: number): boolean {
  for (let sample = 0; sample < 8; sample++) {
    const a = sample * Math.PI / 4;
    const x = site.x + Math.cos(a) * radius, z = site.z + Math.sin(a) * radius;
    if (field.noVegetation(x, z) || field.heightField.getGroundType(x, z) === 'soft') return false;
  }
  return true;
}

function autumnHeadlandClearsBlockers(blockers: readonly CollisionRecord[], record: DestructibleRecord,
  site: AutumnHeadlandSite, radius: number): boolean {
  return !blockers.some(ob => ob !== record.ob && site.x + radius > ob.min[0]
    && site.x - radius < ob.max[0] && site.z + radius > ob.min[2] && site.z - radius < ob.max[2]);
}

function relocateAutumnHarvestRecord(context: DestructibleBuildContext, record: DestructibleRecord,
  site: AutumnHeadlandSite, placement: GroundedDestructiblePlacement): void {
  const pool = context.pools.get(record.kind);
  const matrix = pool?.mats4[record.slot];
  if (!pool || !matrix || pool.records[record.slot] !== record || pool.imI || pool.imB || record.state !== 0 || !record.ob
      || record.col || record.body || record.loopRef || record.cls !== 'break') {
    throw new Error('Autumn headland relocation requires an unfinalized harvest obstacle');
  }
  record.x = site.x; record.z = site.z; record.y = placement.y;
  record.groundSupport = placement.support;
  // Preserve the original yaw, scale and matrix object. Intact, broken and
  // rematch reset all read this canonical slot after pool finalization.
  matrix.setPosition(site.x, placement.y, site.z);
  record.ob.min[1] = placement.y; record.ob.max[1] = placement.y + record.h;
  const extents = getDestructibleContactExtents(pool.meta, record.sc, record.yaw, record.r);
  applyDestructibleObstacleShape(record.ob, pool.meta, record, extents);
}

/** Move an accepted, unfinalized vehicle record to a seat (parkedVehicleSeparation.ts): its record, slot matrix, ground
 * support, obstacle and collider; the pools' refit later fits both to the seat as to any other. */
function relocateParkedVehicleRecord(context: DestructibleBuildContext, record: DestructibleRecord, x: number, z: number): void {
  const pool = context.pools.get(record.kind);
  const matrix = pool?.mats4[record.slot];
  if (!pool || !matrix || pool.records[record.slot] !== record || pool.imI || pool.imB || record.state !== 0 || !record.ob
      || record.body || record.loopRef) {
    throw new Error('Parked-vehicle separation requires an unfinalized vehicle obstacle');
  }
  const meta = resolveDestructibleMeta(context, record.kind);
  let placement: GroundedDestructiblePlacement;
  if (GROUND_POSED_KINDS.has(record.kind)) {
    // a cart or a vehicle slid to a clear seat takes that seat's ground pose (cartGroundPose), as it took its first one
    const pose = cartGroundPose(context.heightField, x, z, record.yaw, (meta.hw ?? meta.r) * record.sc, (meta.hl ?? meta.r) * record.sc);
    placement = { y: pose.y - cartSink(meta), support: { mode: 'pitched', min: pose.min, max: pose.max, spread: pose.max - pose.min } };
    context.euler.set(pose.tiltX, record.yaw, pose.tiltZ, 'YXZ');
    context.quaternion.setFromEuler(context.euler);
    matrix.compose(_posv.set(x, placement.y, z), context.quaternion, _scalev.set(record.sc, record.sc, record.sc));
  } else {
    placement = groundDestructiblePlacement(context.heightField, meta, x, context.heightField.getHeightAt(x, z) - 0.04, z,
      record.yaw, record.sc, 0, 0);
    matrix.setPosition(x, placement.y, z);
  }
  record.x = x; record.z = z; record.y = placement.y;
  record.groundSupport = placement.support;
  const extents = getDestructibleContactExtents(meta, record.sc, record.yaw, record.r);
  for (const obstacle of [record.ob, record.col]) {
    if (!obstacle) continue;
    obstacle.min[1] = placement.y; obstacle.max[1] = placement.y + record.h;
    applyDestructibleObstacleShape(obstacle as PropsCollisionRecord, meta, record, extents);
  }
}

/** Take an accepted, unfinalized vehicle record out of play (no clear seat): its obstacle and collider leave the
 * lists, its slot is scaled to nothing and the record is marked dropped (the contact layer skips it). */
function dropParkedVehicleRecord(context: DestructibleBuildContext, record: DestructibleRecord): void {
  const pool = context.pools.get(record.kind);
  const matrix = pool?.mats4[record.slot];
  if (!pool || !matrix || pool.records[record.slot] !== record || pool.imI || pool.imB || record.state !== 0 || !record.ob) {
    throw new Error('Parked-vehicle separation requires an unfinalized vehicle obstacle');
  }
  matrix.scale(new THREE.Vector3(1e-4, 1e-4, 1e-4)); // the props' collapsed slot (a crushed instance's scale)
  const at = context.obstacles.indexOf(record.ob as PropsCollisionRecord);
  if (at >= 0) context.obstacles.splice(at, 1);
  if (record.col) {
    const ci = context.colliders.indexOf(record.col);
    if (ci >= 0) context.colliders.splice(ci, 1);
  }
  record.dropped = true;
}

function autumnHarvestDonors(records: readonly DestructibleRecord[], first: number,
  end: number): DestructibleRecord[] {
  const donors: DestructibleRecord[] = [];
  let bales = 0, stooks = 0;
  for (let index = first; index < end; index++) {
    const record = records[index];
    if (record.kind !== 'bale' && record.kind !== 'stook') throw new Error('Invalid Autumn field donor range');
    if (record.kind === 'bale' && bales++ < 12) donors.push(record);
    if (record.kind === 'stook' && stooks++ < 12) donors.push(record);
  }
  return donors;
}

function autumnHarvestRadius(record: DestructibleRecord): number {
  // Actual intact geometry envelopes, not the smaller ground-contact radius:
  // horizontal bale cylinder (half-length .725, radius .72), or six leaned
  // stook stems (center .22 + bottom radius .16 + .625*sin(.34)).
  const envelope = record.kind === 'bale' ? Math.hypot(.725, .72) : .22 + .16 + .625 * Math.sin(.34);
  return Math.max(record.r, envelope * record.sc) + .25;
}

function tryAutumnHeadlandMove(context: DestructibleBuildContext, field: FieldScatterContext,
  rows: readonly AutumnCropRow[], buildings: readonly PlacedRadius[], record: DestructibleRecord,
  station: number, trees: readonly CollisionRecord[]): boolean {
  const radius = autumnHarvestRadius(record), site = autumnHeadlandSite(rows, station, radius);
  if (!site || !autumnHeadlandClearsRows(rows, site, radius)) return false;
  if (!autumnHeadlandTerrainClear(field, site, radius) || !autumnHeadlandFootprintDry(field, site, radius)) return false;
  if (buildings.some(b => Math.hypot(site.x - b.x, site.z - b.z) < b.rr + radius)) return false;
  if (!autumnHeadlandClearsBlockers(context.obstacles, record, site, radius)
      || !autumnHeadlandClearsBlockers(context.colliders, record, site, radius)
      || !autumnHeadlandClearsBlockers(trees, record, site, radius)) return false;
  const meta = resolveDestructibleMeta(context, record.kind);
  const placement = groundDestructiblePlacement(context.heightField, meta, site.x,
    context.heightField.getHeightAt(site.x, site.z) - .03, site.z, record.yaw, record.sc, 0, 0);
  if (!placement.support || placement.support.spread > .25) return false;
  relocateAutumnHarvestRecord(context, record, site, placement);
  return true;
}

function composeAutumnHeadlandDressing(context: DestructibleBuildContext, field: FieldScatterContext,
  rows: readonly AutumnCropRow[], buildings: readonly PlacedRadius[], first: number, end: number,
  trees: readonly CollisionRecord[]): void {
  const donors = autumnHarvestDonors(context.records, first, end);
  let donor = 0;
  for (let station = 0; station < rows.length * 2 && donor < donors.length; station++) {
    if (tryAutumnHeadlandMove(context, field, rows, buildings, donors[donor], station, trees)) donor++;
  }
}

// ---------------------------------------------------------------------------
// createProps
// ---------------------------------------------------------------------------

/**
 * Create rocks, village buildings, walls and cover props.
 * @param {object} heightField HeightField from terrain.createHeightField
 * @param {object} engineCtx EngineCtx (ARCHITECTURE §2.8)
 * @param {number} [seed=2002] props seed
 * @param {?object} [cfg=null] map config (uses cfg.props); null = classic verdant set
 * @returns {{group:THREE.Group, obstacles:Array<{min:number[],max:number[]}>,
 *   colliders:Array<{min:number[],max:number[]}>, features:{buildings:Array<object>}}}
 */
/** A boulder's collision hull (local x, z pairs) scaled and turned to its seat, as its collider is built. */
function turnedRockHull(local: ArrayLike<number>, x: number, z: number, sc: number, yawR: number): number[] {
  const c = Math.cos(yawR), s = Math.sin(yawR), pts = new Array<number>(local.length);
  for (let i = 0; i < local.length; i += 2) {
    const lx = local[i] * sc, lz = local[i + 1] * sc;
    pts[i] = x + lx * c + lz * s;
    pts[i + 1] = z - lx * s + lz * c;
  }
  return pts;
}

/** How far two convex footprints (x, z pairs) reach into each other (separating axes: the least overlap over every
 *  edge normal of both) and the axis of that least overlap, turned to point from b to a (the way a moves to clear b);
 *  null when they are apart. */
function hullSeparation(a: number[], b: number[]): { depth: number; ax: number; az: number } | null {
  let depth = Infinity, bx = 0, bz = 0;
  for (const poly of [a, b]) {
    const n = poly.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      let ax = poly[j * 2 + 1] - poly[i * 2 + 1], az = poly[i * 2] - poly[j * 2];
      const len = Math.hypot(ax, az);
      if (len < 1e-9) continue;
      ax /= len; az /= len;
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (let k = 0; k < a.length; k += 2) { const p = a[k] * ax + a[k + 1] * az; minA = Math.min(minA, p); maxA = Math.max(maxA, p); }
      for (let k = 0; k < b.length; k += 2) { const p = b[k] * ax + b[k + 1] * az; minB = Math.min(minB, p); maxB = Math.max(maxB, p); }
      const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
      if (overlap <= 0) return null;
      if (overlap < depth) {
        depth = overlap;
        // (a's centre of projection beyond b's: a leaves along +axis, else along -axis)
        const sign = (minA + maxA) >= (minB + maxB) ? 1 : -1;
        bx = ax * sign; bz = az * sign;
      }
    }
  }
  return depth === Infinity ? null : { depth, ax: bx, az: bz };
}

export function createProps(
  heightField: HeightField,
  engineCtx: EngineContext,
  seed = 2002,
  cfg: PropsMapConfig | null = null,
  vegetation: FisheryVegetation | null = null,
): PropsRuntime {
  const g = propsBuildSteps(heightField, engineCtx, seed, cfg, vegetation);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

/** One wreck bake a map's props build asks the worker for: the donor and its seeded options. */
interface WreckBakeRequestRecord { specId: string; seed: number; pop: boolean }

/**
 * The wreck bakes a map's props build requests of the worker, in order (the time-to-battle lane, 2026-10-07): the
 * worker-wreck build drained with each request answered by `bake` (the worker's own bake, run where the caller likes),
 * up to the end of the wreck pass ('wrecks-finalized': nothing after it asks for a bake). tools/wreck-bake-plan.mjs
 * records them per map so the browser can start those bakes when the world build starts, beside the terrain and
 * vegetation, instead of one by one inside the props build (src/world/wreckBakePrefetch.ts).
 */
export async function recordWreckBakeRequests(
  heightField: HeightField,
  engineCtx: EngineContext,
  seed: number,
  cfg: PropsMapConfig | null,
  vegetation: FisheryVegetation | null,
  bake: (specId: string, options: { seed: number; pop: boolean }) => Promise<WreckBake | null>,
): Promise<WreckBakeRequestRecord[]> {
  const requests: WreckBakeRequestRecord[] = [];
  const g = propsBuildSteps(heightField, engineCtx, seed, cfg, vegetation, true);
  let r = g.next();
  try {
    while (!r.done) {
      const request = r.value?.wreckBake;
      if (request) {
        requests.push({ specId: request.specId, seed: request.options.seed, pop: request.options.pop });
        request.result = await bake(request.specId, request.options);
      }
      if (r.value?.stage === 'wrecks-finalized') break;
      r = g.next();
    }
  } finally {
    if (!r.done) g.return(undefined as never);
  }
  return requests;
}

/**
 * perf-r3 (play-session probe): chunked twin of {@link createProps} — the
 * one-call build was a single ~1.6 s task behind the loading bar. Awaits
 * `tick(done, total)` between placement families (buildings, rowhouses,
 * walls, trucks, crops, street furniture, wrecks, pool finalization) so the
 * loading screen keeps painting. Byte-identical output: both wrappers drain
 * the same generator, same rng draw order.
 * @param {?function(number, number): (Promise<void>|void)} tick
 */
export async function createPropsAsync(
  heightField: HeightField,
  engineCtx: EngineContext,
  seed = 2002,
  cfg: PropsMapConfig | null = null,
  tick: ((done: number, total: number) => Promise<void> | void) | null = null,
  fineSlices = false,
  vegetation: FisheryVegetation | null = null,
  wreckPrefetch: WreckBakePrefetch | null = null,
  surfacePrefetch: SurfacePaintPrefetch | null = null,
): Promise<PropsRuntime> {
  // IteratorClose must reach delegated builders when an awaited import/tick
  // rejects. Use the standard iterator return() contract: no final runtime is
  // published on cancellation, and nested builders release partial owners.
  const wreckWorker = createPropsWreckWorker(cfg);
  const sourceAbort = new AbortController();
  const g: Iterator<PropsBuildSlice | undefined, PropsRuntime, void> =
    propsBuildSteps(heightField, engineCtx, seed, cfg, vegetation, wreckWorker !== null,
      { worker: true, signal: sourceAbort.signal });
  const slices: Array<{ stage: string; ms: number }> = [];
  const awaitTimings: PropsBuildDetail['awaitTimings'] = {
    clock: 'performance.now',
    sliceTicks: { count: 0, totalMs: 0, maxMs: 0 },
    wreckCheckpoints: { count: 0, totalMs: 0, maxMs: 0 },
    builderImports: { count: 0, totalMs: 0, maxMs: 0 },
    wreckBakes: { count: 0, totalMs: 0, maxMs: 0 },
    wreckRowsLimit: 32, wreckRowsDropped: 0, wreckRows: [],
  };
  const wreckFallbacks = { count: 0, missing: 0 };
  let synchronousMs = 0;
  let nextStartedAt = performance.now();
  let r: IteratorResult<PropsBuildSlice | undefined, PropsRuntime> | null = null;
  let i = 0;
  const total = fineSlices ? 180 : 9;
  // (the wreck-worker lane, 2026-10-09) a tick that failed (a cancelled or failed build) ends the build: a wreck bake
  // that rejects after one is never taken for a worker failure and baked again
  let tickFailed = false;
  const observeTick = (timing: PropsAwaitTiming): Promise<void> | void => {
    if (!tick) return;
    const startedAt = performance.now();
    const settled = (): void => { recordPropsAwait(timing, startedAt); };
    try {
      const pending = tick?.(i, total);
      // Observe settlement without wrapping the returned promise or inserting
      // another awaited hop into the caller's original pacing continuation.
      if (pending && typeof pending.then === 'function') void pending.then(settled, () => { tickFailed = true; settled(); });
      else settled();
      return pending;
    } catch (error) {
      tickFailed = true;
      settled();
      throw error;
    }
  };
  // (the wreck-worker lane) once a worker bake fails (the prefetch's or this build's: a worker that failed to start,
  // went silent or reported an error), the rest of this build bakes its wrecks on the main thread
  let wreckWorkerFailure: unknown = null;
  const wreckCheckpoint = (): Promise<void> | void => observeTick(awaitTimings.wreckCheckpoints);
  try {
    r = g.next();
    // (the time-to-battle lane, 2026-10-08) with the map's planned bakes already running in the prefetch's own worker, this
    // build's worker starts only for a request the plan does not hold (bake() starts it), not a second copy of the donor
    // builders up front
    if (!wreckPrefetch) wreckWorker?.prepare();
    while (!r.done) {
      const sliceMs = performance.now() - nextStartedAt;
      synchronousMs += sliceMs;
      const step = r.value;
      slices.push({ stage: step?.stage || `slice-${slices.length}`, ms: sliceMs });
      if (step?.surfacePaint && surfacePrefetch) {
        // (the time-to-battle lane) a print painted ahead with the terrain; a failed one is painted where it stands
        const ahead = surfacePrefetch.take(step.surfacePaint.key);
        if (ahead) {
          try { step.surfacePaint.result = await ahead; } catch { step.surfacePaint.result = null; }
        }
      }
      if (step?.tankBuilder && !wreckWorker) {
        const startedAt = performance.now();
        await ensureTankBuilder(step.tankBuilder);
        recordPropsAwait(awaitTimings.builderImports, startedAt);
      }
      if (step?.wreckBake && wreckWorker) {
        const request = step.wreckBake;
        const startedAt = performance.now();
        const checkpointsBefore = awaitTimings.wreckCheckpoints.totalMs;
        // (the time-to-battle lane) a bake the world build started with the terrain (wreckBakePrefetch.ts): the same
        // donor, seed and pop through the same worker code — taken here, waited for with the same checkpoints
        const planned = wreckPrefetch?.take(request.specId, request.options) ?? null;
        let baked = false;
        if (planned) {
          let settled = false;
          let value: WreckBake | null = null, failure: unknown = null;
          planned.then((result) => { settled = true; value = result; }, (error) => { settled = true; failure = error ?? 'failed'; });
          while (!settled) {
            await new Promise<void>((resolve) => { setTimeout(resolve, 30); });
            if (!settled) await wreckCheckpoint();
          }
          if (failure === null) { request.result = value; baked = true; } else wreckWorkerFailure ??= failure;
        }
        if (!baked && wreckWorkerFailure === null) {
          try {
            request.result = await wreckWorker.bake(request.specId, request.options, wreckCheckpoint);
            baked = true;
          } catch (error) {
            // a cancelled build stays cancelled; only the worker's own failure falls back
            if (tickFailed) throw error;
            wreckWorkerFailure = error ?? 'failed';
          }
        }
        if (!baked) {
          // (the wreck-worker lane, 2026-10-09) the worker never decides whether a battle starts: the same request is
          // baked here, on the main thread (bakeWreckOnMainThread)
          if (!wreckFallbacks.count++) {
            console.warn(`[props] the wreck worker failed (${describePropsFailure(wreckWorkerFailure)}); `
              + 'this map\'s wrecks are baked on the main thread');
          }
          request.result = await bakeWreckOnMainThread(request, wreckCheckpoint);
          if (!request.result) wreckFallbacks.missing++;
        }
        const endMs = recordPropsAwait(awaitTimings.wreckBakes, startedAt);
        // Inclusive elapsed time includes nested checkpoints, worker transfer
        // and main-thread hydration. It is not worker CPU time or network time.
        if (awaitTimings.wreckRows.length < awaitTimings.wreckRowsLimit) {
          awaitTimings.wreckRows.push({ specId: request.specId, startMs: startedAt, endMs,
            elapsedMs: endMs - startedAt,
            includedCheckpointMs: awaitTimings.wreckCheckpoints.totalMs - checkpointsBefore });
        } else awaitTimings.wreckRowsDropped++;
      }
      if (tick && (fineSlices || !step || !step.fine)) {
        if (step?.progress !== false) i++;
        await observeTick(awaitTimings.sliceTicks);
      }
      nextStartedAt = performance.now();
      r = g.next();
    }
    const finalMs = performance.now() - nextStartedAt;
    synchronousMs += finalMs;
    slices.push({ stage: 'finalize', ms: finalMs });
    const runtime = r.value;
    const slowest = slices.slice().sort((a, b) => b.ms - a.ms).slice(0, 8);
    runtime._buildDetail = {
      sliceCount: slices.length,
      synchronousMs,
      maxSliceMs: slowest[0]?.ms || 0,
      slowest,
      awaitTimings,
      ...(wreckPrefetch ? { wreckPrefetch: { ...wreckPrefetch.stats } } : {}),
      ...(surfacePrefetch ? { surfacePaints: { ...surfacePrefetch.stats } } : {}),
      ...(wreckFallbacks.count ? { wreckFallbacks: { ...wreckFallbacks,
        reason: describePropsFailure(wreckWorkerFailure) } } : {}),
    };
    return runtime;
  } finally {
    closeIncompletePropsBuild(!!r?.done, g, sourceAbort);
    wreckWorker?.dispose();
  }
}

function describePropsFailure(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

/**
 * (the wreck-worker lane, 2026-10-09) A wreck bake the worker could not deliver — a worker that failed to start or to
 * load its donor, went silent past its timeout, or replied with an error — baked on the main thread: the worker's own
 * bake (wreckBakeWorker.ts: the donor's builder, then bakeTankWreck with an empty engine context) through its
 * cooperative twin, the same donor, seed, pop and remnant paint, so the same wreck. The wait between its slices is the
 * worker wait's checkpoint (pacing, cancellation). A donor that cannot be built here either places no wreck at that
 * site (null, as a failed bake always has).
 */
async function bakeWreckOnMainThread(
  request: NonNullable<PropsBuildSlice['wreckBake']>,
  checkpoint: () => Promise<void> | void,
): Promise<WreckBake | null> {
  try {
    await ensureTankBuilder(request.specId);
  } catch (error) {
    console.warn(`[props] no wreck of ${request.specId}: its builder did not load (${describePropsFailure(error)})`);
    return null;
  }
  const steps = bakeTankWreckSteps({}, request.specId, request.options);
  let completed = false;
  try {
    let step = steps.next();
    while (!step.done) {
      await checkpoint();
      step = steps.next();
    }
    completed = true;
    return step.value;
  } finally {
    // a cancelled build closes the bake: its temporary tank and partial geometry are released
    if (!completed) steps.return(null);
  }
}

function recordPropsAwait(timing: PropsAwaitTiming, startedAt: number): number {
  const endedAt = performance.now();
  const elapsedMs = endedAt - startedAt;
  timing.count++;
  timing.totalMs += elapsedMs;
  timing.maxMs = Math.max(timing.maxMs, elapsedMs);
  return endedAt;
}

function createPropsWreckWorker(cfg: PropsMapConfig | null): ReturnType<typeof createWreckBakeClient> | null {
  const wreckCount = cfg?.props?.tankWrecks
    ? (cfg.props.tankWrecks.count ?? 3) : (cfg?.props?.wrecks ?? 4);
  return typeof Worker === 'undefined' || wreckCount <= 0 ? null : createWreckBakeClient();
}

function closeIncompletePropsBuild(
  completed: boolean,
  iterator: Iterator<PropsBuildSlice | undefined, PropsRuntime, void>,
  sourceAbort: AbortController,
): void {
  if (completed) return;
  // Cancel this build's consumer only. Successful runtimes retain their
  // intentionally nonblocking sourcedTexturesReady owner after return.
  sourceAbort.abort();
  // IteratorClose cleanup must not replace the failed import/tick/build.
  try { iterator.return?.(); } catch (_) { /* retain the original failure */ }
}

function* propsBuildSteps(
  heightField: HeightField,
  engineCtx: EngineContext,
  seed: number,
  cfg: PropsMapConfig | null,
  vegetation: FisheryVegetation | null,
  workerWrecks = false,
  sourceApplication: SourcedTextureApplicationOptions = {},
): Generator<PropsBuildSlice | undefined, PropsRuntime, void> {
  const P: PropsSettings = {
    plan: ['cottage', 'barn', 'cottage', 'tower', 'cottage', 'ruin',
      'cottage', 'barn', 'cottage', 'cottage'],
    tones: {}, rockTone: null, wallStoneChance: 0.25,
    buildingLat: [10, 4], sideSkip: 0.25, maxSpread: 1.7, spacingPad: 9,
    wallRuns: null, well: true, hayCrates: true, fences: true,
    telegraph: true, carts: true, logs: true, logCount: 26, hayCrateSites: 5,
    haystacks: 0, rocks: 170, outcrops: 16, craters: 30, rubblePiles: 0,
    wrecks: 4, // r7: burned-out vehicle hulks along the roads (contested read)
    // r6 terrain_environment dressing passes (per-biome, see map configs):
    // cropFields = standing crop-row plots on open farmland; lampposts =
    // cast-iron street lights along the town grid; hedgehogs = steel anti-
    // tank obstacles scattered on streets/approaches
    cropFields: 0, lampposts: false, hedgehogs: 0,
    destructibleBuildings: [],
    // Authored composite positions that turn a broad lane into a memorable
    // decision point. Each beat may combine a destructible structure,
    // sandbag redoubt, hard rock outcrop and staged wreck while reusing the
    // existing pooled/merged render families.
    tacticalBeats: [],
    streetRows: false, curbs: false, monument: false, townCraters: false,
    ...((cfg && cfg.props) || {}),
  };
  // round 75 item 6: the boulders' soil skirt follows the map's dirt tone (a splat law, never authored on props)
  P.rockSoilTone = (cfg as { props?: { rockSoilTone?: ToneFunction } } | null)?.props?.rockSoilTone
    ?? (cfg as { splat?: { dirtTone?: ToneFunction } } | null)?.splat?.dirtTone ?? null;
  const mapId = cfg ? cfg.id : 'verdant';
  const rng = mulberry32(seed);
  const detailUvRng = () => 0.5;
  const L = heightField._layout;
  // Symmetric deployments (modes lane, 2026-10-08): both sides' deployment slots keep the clearings the pads keep
  // (sim/matchPlacement.ts deploymentClearings). The seeded passes test the pads as before; the scatter a pass would
  // stand round a slot is left out AFTER its draws (addDestructible's veto, tryRock), so nothing else moves.
  const deploymentSlots = deploymentClearings(heightField);
  const noVeg = heightField._noVeg || (() => false);
  const noi = new SimplexNoise({ random: mulberry32(seed + 7) });
  registerPaintNoise(noi, seed + 7); // (its tiles may come painted ahead: surfacePaintPrefetch.ts)
  // (the time-to-battle lane, 2026-10-08) the near terrain mesh's vertex heights, each asked of the field once per build:
  // the rock beds, the ground contact patches and the wall turf all conform to that grid (terrain.ts
  // terrainNearMeshHeightAt) and asked its vertices 182 k times on Verdant, 174 k of them again. The field's own heights
  // by their exact coordinates (the build changes no height), so the same values; released when the build returns.
  let nearMeshVertexHeights: Map<number, Map<number, number>> | null = new Map();
  const nearMeshVertexHeight = (px: number, pz: number): number => {
    if (!nearMeshVertexHeights || px === 0 || pz === 0) return heightField.getHeightAt(px, pz);
    let row = nearMeshVertexHeights.get(px);
    if (!row) nearMeshVertexHeights.set(px, row = new Map());
    let h = row.get(pz);
    if (h === undefined) row.set(pz, h = heightField.getHeightAt(px, pz));
    return h;
  };
  const aniso = engineCtx.anisotropy ?? 4;
  const group = new THREE.Group();
  group.name = 'props';
  const decorationGroundingReceipts: DecorationGroundingReceipt[] = [];
  const v = L.village;
  // maps lane B (2026-10-03): the settlement the props dress (P.town, default the village rect); the scatter below keeps
  // off the whole graded village ground (v) as before
  const town = P.town ? { ...v, ...P.town } : v;

  // regional-buildings lane: the map's architecture kit (maps/regional/index.ts) — its default tones sit under the map's
  const regionalArchitecture = resolveRegionalArchitecture(P.architecture);
  if (regionalArchitecture?.surfaces.tones) P.tones = { ...regionalArchitecture.surfaces.tones, ...(P.tones || {}) };
  // the facades lane (2026-10-08): a kit's render painter (surfaces.render) paints each render family the map tones, under
  // that tone — the primary on its seed, plaster2 and plaster3 on the next (plaster3 borrows plaster2's relief below)
  const kitRender = regionalArchitecture?.surfaces.render;
  if (kitRender && P.tones) {
    const tones: Record<string, ToneFunction | null | undefined> = { ...P.tones };
    for (const key of ['plaster', 'plaster2', 'plaster3'] as const) {
      const own = tones[key] as (ToneFunction & { base?: ToneFunction }) | null | undefined;
      if (!own) continue;
      const base = own.base ?? own;
      tones[key] = Object.assign((h: number, s: number, l: number) => base(h, s, l),
        { base, paint: { kind: kitRender.kind, seed: kitRender.seed + (key === 'plaster' ? 0 : 1) } });
    }
    P.tones = tones;
  }
  const T = P.tones || {};
  const plaster = makePlaster(noi, aniso, T.plaster || null);
  yield { fine: true };
  // content_breadth r3: TWO extra render families — the street walls
  // recycled one plaster print ("same white-plaster box repeats dozens of
  // times", critique). Map configs may author tones.plaster2/plaster3
  // (urban.js does); other maps derive tasteful shifts of their own plaster
  // tone so village cottages inherit the variety for free.
  const _tShift = (
    base: ToneFunction | null | undefined,
    dh: number,
    ds: number,
    dl: number,
  ): ToneFunction => (h: number, s: number, l: number) => {
    const [bh, bs, bl] = base ? base(h, s, l) : [h, s, l];
    return [Math.max(0, Math.min(1, bh + dh)),
      Math.max(0, Math.min(1, bs * ds)),
      Math.max(0, Math.min(1, bl * dl))];
  };
  // the map-revival lane (2026-10-05, Skybridge round 2): a kit that pours its concrete paints plaster2 as that
  // concrete (glencanyon: board-formed, its formwork's boards, lift lines and tie holes), toned as the render was
  const plaster2Tone = T.plaster2 || _tShift(T.plaster, +0.022, 1.1, 0.90);
  const pouredConcrete = regionalArchitecture?.surfaces.concrete;
  const plaster2 = pouredConcrete
    ? yield* makeRegionalConcrete(pouredConcrete, (px) => { applyTone(px, plaster2Tone); }, aniso)
    : makePlaster(noi, aniso, plaster2Tone);
  yield { fine: true };
  // These two procedural variants differ only in albedo tone. Share their
  // immutable relief within this props owner; retained materials deduplicate
  // final disposal. Primary plaster stays exclusive for sourced image swaps.
  // (a poured plaster2's relief is the formwork's: plaster3 keeps a render's own)
  const plaster3 = makePlaster(noi, aniso,
    T.plaster3 || _tShift(T.plaster, -0.035, 0.72, 0.84), pouredConcrete ? null : plaster2);
  yield { fine: true };
  const roofT = regionalArchitecture
    ? yield* makeRegionalRoof(regionalArchitecture.surfaces.roof.kind, regionalArchitecture.surfaces.roof.tint, aniso)
    : makeRoofTiles(noi, aniso, T.roof || null);
  yield { fine: true };
  const stone = regionalArchitecture
    ? yield* makeRegionalStone(regionalArchitecture.surfaces.stone.kind, regionalArchitecture.surfaces.stone.tint, aniso, undefined,
      regionalArchitecture.surfaces.stone.dressed)
    : yield* makeStone(noi, aniso, T.stone || null);
  yield { fine: true, stage: 'stone-maps' };
  const wood = makeWood(noi, aniso, T.wood || null);
  yield { fine: true };
  const straw = makeStraw(noi, aniso, T.straw || null);
  yield { fine: true };
  const hay = yield* makeHay(aniso, T.straw || null, getDeviceTier() === 'mobile' ? 256 : 512);
  yield { fine: true };
  const structureWood = makeStructureDetail(noi, aniso, 'wood');
  yield { fine: true };
  const structureCanvas = makeStructureDetail(noi, aniso, 'canvas');
  const burlap = makeBurlapDetail(aniso); // the sandbags' hessian (the scenery lane, wave 52)
  yield { fine: true };
  const structureMetal = makeStructureDetail(noi, aniso, 'steel');
  yield { fine: true };
  const vehiclePaint = makeVehiclePaint(noi, Math.min(aniso, 4));
  yield { fine: true };

  // Paint before allocating materials or starting sourced replacements: new
  // row checkpoints must not suspend those not-yet-registered owners.
  // World-space grime breaks up every tiled hard-surface texture below.
  const grimeTex = yield* makeGrimeTexture(noi, aniso);
  // Round 75: the container / tank sheet-steel atlas (propsSteelAtlas.ts), sixteen rows per checkpoint — painted only
  // where the plan will draw the steel material (a container row, a yard kind, corrugated cladding); the mobile tier
  // paints it at half size (a quarter of the paint time and texture bytes). The timing record on the group is the
  // build-timing probe's evidence; a steel part on an unpredicted map falls back to a synchronous paint below.
  // Round 78 (the performance lane): the mobile tier paints no steel atlas at all — its `steel` material carries the
  // livery in the vertex colours alone (the path the maps without steel already take), which returns the phones'
  // props to the round-74 texture footprint (the round-71–77 audit read Whiteout on the mobile tier at +2.9 MB of
  // textures and +5 programs); the record says so (`fallback: 'mobile'`, painted false).
  const mobileProps = getDeviceTier() === 'mobile';
  const steelAtlasSize = mobileProps ? STEEL_ATLAS_SIZE_MOBILE : STEEL_ATLAS_SIZE;
  const steelAtlas = { needed: steelAtlasNeeded(P.plan, P.industrialCladding) && !mobileProps, painted: false, fallback: mobileProps ? 'mobile' : '', ms: 0, size: 0 };
  let steel: SteelAtlasTextures | null = null;
  if (steelAtlas.needed) {
    const painter = makeSteelAtlas(noi, aniso, steelAtlasSize);
    let rowStart = performance.now();
    let step = painter.next();
    while (!step.done) {
      steelAtlas.ms += performance.now() - rowStart; // synchronous paint time only, not the awaited ticks between rows
      yield step.value;
      rowStart = performance.now();
      step = painter.next();
    }
    steelAtlas.ms += performance.now() - rowStart;
    steel = step.value;
    steelAtlas.painted = true;
    steelAtlas.size = steelAtlasSize;
  }
  // Round 75 item 6: the boulders' triplanar detail tile (rockDressing.ts), sixteen rows per checkpoint; the map's
  // lithology draws it, and its lichen colonies come with it (the scenery lane, 2026-10-04).
  const rockDetail = yield* makeRockDetail(noi, aniso, rockLithologyFor(mapId));
  // The scenery lane (2026-10-03): the dry-stone field walls draw their own rubble print, never the house masonry (the
  // coursed stone print, or a regional kit's brick, block or dressed stone, which laid brick courses over fieldstone);
  // a map whose walls are mud or brick keeps them on the stone print and paints nothing.
  const fieldWallBucket = P.wallStyle === 'adobe' || sourcedStoneIsBrick(mapId) ? 'stone' : 'fieldStone';
  const fieldStone = fieldWallBucket === 'fieldStone'
    ? yield* makeFieldStone(aniso, T.stone || null, mobileProps ? 256 : 512, rockLithologyFor(mapId) === 'chalk' ? 'chalk' : 'fieldstone')
    : stone;
  // (and a mud-walled map's walls their own worn render over their courses, not the house plaster)
  const adobeWallBucket = P.wallStyle === 'adobe' ? 'fieldMud' : 'plaster';
  const fieldMud = adobeWallBucket === 'fieldMud'
    ? yield* makeFieldMud(aniso, T.plaster || null, mobileProps ? 256 : 512,
      mudEarthOfGround((cfg as { sky?: { lighting?: { groundAlbedoHex?: number } } } | null)?.sky?.lighting?.groundAlbedoHex))
    : plaster;

  // Deep-hunt 2026-07: sourced CC0 PBR building sets (ambientCG, see
  // docs/ATTRIBUTION.md) swap into plaster/roof/wood (and stone -> brick on
  // urban) in place when they load; procedural stays the fallback of record.
  // A regional kit keeps its own roof and masonry painters; it opts into the plaster and timber photo sets.
  // The scenery lane (gauntlet wave 66): the boulders wear the map's own terrain rock layer, photographed, in place of
  // their procedural tile (the fallback of record); the stone's mean, when it lands, is what their material divides the
  // stone's structure out about. The map's texture readiness waits for it with the buildings'.
  const rockStoneMean = new THREE.Vector3(0.214, 0.214, 0.214);
  const sourcedTexturesReady = Promise.all([
    applySourcedBuildings(
      regionalArchitecture
        ? {
          ...(regionalArchitecture.surfaces.sourced.plaster ? { plaster } : {}),
          ...(regionalArchitecture.surfaces.sourced.wood ? { wood } : {}),
        }
        : { plaster, roof: roofT, wood, stone },
      mapId, P, sourceApplication,
    ),
    applySourcedRock({ albedo: rockDetail.albedo, normal: rockDetail.normal }, mapId,
      (cfg as { splat?: SourcedTerrainSettings } | null)?.splat ?? {}, sourceApplication,
      (mean) => rockStoneMean.set(mean[0], mean[1], mean[2])),
  ]).then(([buildings, boulders]) => [...buildings, ...boulders]);

  const windowStyle = resolveStructureWindowStyle(mapId);
  const mats: Record<string, THREE.MeshStandardMaterial> = {
    plaster: new THREE.MeshStandardMaterial({ map: plaster.albedo, normalMap: plaster.normal,
      roughnessMap: plaster.surface, aoMap: plaster.surface, roughness: 1, metalness: 0 }),
    plaster2: new THREE.MeshStandardMaterial({ map: plaster2.albedo, normalMap: plaster2.normal,
      roughnessMap: plaster2.surface, aoMap: plaster2.surface, roughness: 1, metalness: 0 }),
    plaster3: new THREE.MeshStandardMaterial({ map: plaster3.albedo, normalMap: plaster3.normal,
      roughnessMap: plaster3.surface, aoMap: plaster3.surface, roughness: 1, metalness: 0 }),
    roof: makeRoofMaterial(roofT, mapId),
    stone: new THREE.MeshStandardMaterial({ map: stone.albedo, normalMap: stone.normal,
      roughnessMap: stone.surface, aoMap: stone.surface, roughness: 1, metalness: 0 }),
    // the scenery lane (2026-10-03): the dry-stone field walls' rubble print (fieldStoneSurface.ts)
    fieldStone: new THREE.MeshStandardMaterial({ map: fieldStone.albedo, normalMap: fieldStone.normal,
      roughnessMap: fieldStone.surface, aoMap: fieldStone.surface, roughness: 1, metalness: 0 }),
    // the scenery lane (2026-10-03): the mud walls' worn render over their courses (fieldMudSurface.ts)
    fieldMud: new THREE.MeshStandardMaterial({ map: fieldMud.albedo, normalMap: fieldMud.normal,
      roughnessMap: fieldMud.surface, aoMap: fieldMud.surface, roughness: 1, metalness: 0 }),
    wood: new THREE.MeshStandardMaterial({ map: wood.albedo, normalMap: wood.normal,
      roughnessMap: wood.surface, aoMap: wood.surface, roughness: 1, metalness: 0 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x161a1d, roughness: 0.35, metalness: 0.15 }),
    // content_breadth r3: window PANES get real materials — the old shared
    // near-black 'dark' slabs read as unframed voids at establishing
    // distance (critique). 'glass' is a low-roughness slate that picks up
    // sky/env specular; 'curtain' is a muted warm fill (daytime curtained /
    // shuttered interiors) that breaks the all-black grid without turning
    // into the white/emissive rectangles seen under Ruinspires' exposure.
    // world-dressing r1 + AA agent's FINAL measured glass spec (4eccce8):
    // roughness floor 0.35 (sub-pixel sky-glints shimmered under AA at
    // range — the sky-catch read comes from envMapIntensity, not tightness),
    // metalness <= 0.2, envMapIntensity capped at 1.0 below (1.5 pushed
    // glints past the 1.78 bloom threshold).
    glass: new THREE.MeshPhysicalMaterial({ color: windowStyle.glassColor,
      roughness: windowStyle.glassRoughness, metalness: windowStyle.glassMetalness,
      clearcoat: windowStyle.glassClearcoat,
      clearcoatRoughness: windowStyle.glassClearcoatRoughness,
      envMapIntensity: windowStyle.glassEnvMapIntensity }),
    curtain: new THREE.MeshStandardMaterial({ color: windowStyle.curtainColor,
      roughness: 0.94, metalness: 0, emissive: windowStyle.curtainEmissive,
      emissiveIntensity: windowStyle.curtainEmissiveIntensity }),
    straw: new THREE.MeshStandardMaterial({ map: straw.albedo, normalMap: straw.normal,
      roughnessMap: straw.surface, aoMap: straw.surface, roughness: 1, metalness: 0 }),
    // (b15) the straw destructibles — bales, stooks, the field stacks — wear the hay print's bands (makeHay); the
    // straw bucket (thatched roofs, reeds) keeps the straw print. The same shader as the straw (its program)
    hay: new THREE.MeshStandardMaterial({ map: hay.albedo, normalMap: hay.normal,
      roughnessMap: hay.surface, aoMap: hay.surface, roughness: 1, metalness: 0 }),
    // round 75 item 6: the tile rides the map slots so the library owns it; the rock hook samples it triplanar
    // (a displaced sphere has no UVs), the vertex tone stays the stone's colour
    rock: new THREE.MeshStandardMaterial({
      map: rockDetail.albedo, normalMap: rockDetail.normal, roughnessMap: rockDetail.surface, aoMap: rockDetail.surface,
      vertexColors: true, roughness: 0.95, metalness: 0,
    }),
    baked: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }),
    // the ground lane (wave 234): the rail kit's bed and shoulders, the baked material's tones under crushed stone and
    // the track's grime (railBallast.ts; its parts' UVs carry their place across the track)
    ballast: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 }),
    // the scenery lane (after wave 57): the telegraph poles' weathered timber, painted by its hook (poleTimber.ts)
    pole: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }),
    // Round 75: painted corrugated steel — the atlas luminance under a vertex-colour livery, its ORM blue channel
    // the rust mask the weathering hook below mixes toward rust.
    steel: new THREE.MeshStandardMaterial({
      ...(steel ? { map: steel.albedo, normalMap: steel.normal, roughnessMap: steel.surface, aoMap: steel.surface } : {}),
      vertexColors: true, roughness: 1, metalness: 0.06,
    }),
    vehicle: new THREE.MeshStandardMaterial({
      map: vehiclePaint.albedo,
      normalMap: vehiclePaint.normal,
      roughnessMap: vehiclePaint.surface,
      vertexColors: true,
      roughness: 0.84,
      metalness: 0.045,
    }),
    structureWood: new THREE.MeshStandardMaterial({
      map: structureWood.albedo, normalMap: structureWood.normal,
      roughnessMap: structureWood.surface, aoMap: structureWood.surface,
      vertexColors: true, roughness: 1, metalness: 0,
    }),
    structureCanvas: new THREE.MeshStandardMaterial({
      map: structureCanvas.albedo, normalMap: structureCanvas.normal,
      roughnessMap: structureCanvas.surface, aoMap: structureCanvas.surface,
      vertexColors: true, roughness: 1, metalness: 0,
    }),
    // the scenery lane (wave 52): the sandbags' hessian, the canvas material's program on its own weave
    burlap: new THREE.MeshStandardMaterial({
      map: burlap.albedo, normalMap: burlap.normal,
      roughnessMap: burlap.surface, aoMap: burlap.surface,
      vertexColors: true, roughness: 1, metalness: 0,
    }),
    structureMetal: new THREE.MeshStandardMaterial({
      map: structureMetal.albedo, normalMap: structureMetal.normal,
      roughnessMap: structureMetal.surface, aoMap: structureMetal.surface,
      vertexColors: true, roughness: 1, metalness: 0.08,
    }),
    // regional kits (maps/regional/weather.ts), on a map that adopted one: the same plaster, stone and roof textures
    // (a sourced swap replaces the shared Texture's source in place, so these follow it) under each building's
    // per-vertex tint and weathering. A map without a kit owns none of them.
    ...(regionalArchitecture ? {
      regionalPlaster: new THREE.MeshStandardMaterial({ map: plaster.albedo, normalMap: plaster.normal,
        roughnessMap: plaster.surface, aoMap: plaster.surface, vertexColors: true, roughness: 1, metalness: 0 }),
      regionalPlaster2: new THREE.MeshStandardMaterial({ map: plaster2.albedo, normalMap: plaster2.normal,
        roughnessMap: plaster2.surface, aoMap: plaster2.surface, vertexColors: true, roughness: 1, metalness: 0 }),
      regionalPlaster3: new THREE.MeshStandardMaterial({ map: plaster3.albedo, normalMap: plaster3.normal,
        roughnessMap: plaster3.surface, aoMap: plaster3.surface, vertexColors: true, roughness: 1, metalness: 0 }),
      regionalStone: new THREE.MeshStandardMaterial({ map: stone.albedo, normalMap: stone.normal,
        roughnessMap: stone.surface, aoMap: stone.surface, vertexColors: true, roughness: 1, metalness: 0 }),
      regionalRoof: Object.assign(makeRoofMaterial(roofT, mapId), { vertexColors: true }),
    } : {}),
  };
  function configureSurfaceMaterials(): void {
    for (const key of ['plaster', 'plaster2', 'plaster3', 'roof', 'stone', 'fieldStone', 'fieldMud', 'wood',
      'straw', 'hay', 'structureWood', 'structureCanvas', 'burlap', 'structureMetal', 'steel', 'regionalPlaster', 'regionalPlaster2', 'regionalPlaster3', 'regionalStone', 'regionalRoof']) {
      if (mats[key]) mats[key].aoMapIntensity = 0.82;
    }
    // the scenery lane (wave 52, Verdant's village wall: its face in shade "a flat extruded slab with a near-black blocky
    // texture"): the field print's occlusion takes half the skylight in a joint, not four fifths, so a wall's shaded face
    // keeps its stones (the sunlit face, lit directly, hardly changes)
    if (mats.fieldStone) mats.fieldStone.aoMapIntensity = 0.5;
    // (2026-10-08, the world-ibl lane: every surface here takes the sky's full image-based light, the share the grounded
    // light model calibrates the shade with. The trims these materials used to author (steel 0.42, rock 0.35, baked 0.5,
    // pole 0.4, vehicle 0.58, structure wood 0.34, canvas 0.22, burlap 0.18, structure metal 0.48) never applied: three
    // overwrote them with the scene's intensity, so the approved look is the full sky. Honored, they took 82-99 % of a
    // shaded face's light with them, three times deeper shade than the ground beside them; engine/materialEnvIntensity.ts
    // now applies an authored value, so a trim here is a real, visible change.)
    // capped (AA glass spec 4eccce8 — glints above 1.0 crossed the 1.78 bloom threshold; the post-side firefly clamp is a
    // safety net, not a design allowance). A cap, not a value: a style's own lower share would stay, and the trims' revival
    // (engine/materialEnvIntensity.ts) applies it (wave 309: Ruinspires' 0.22 read as black voids, so its style takes 1).
    mats.glass.envMapIntensity = Math.min(mats.glass.envMapIntensity, 1.0);
    // (the ground lane's rail ballast authored 0.4 on a branch where no trim applied; it takes the full sky as every
    // other surface here does, the look its wave 300 judged)
    // map revival lane 2 (2026-10-05): a kit's finer, shallower render (ArchitectureSurfaces.relief; absent: unchanged)
    const relief = regionalArchitecture?.surfaces.relief;
    if (relief) {
      for (const key of ['regionalPlaster', 'regionalPlaster2', 'regionalPlaster3'] as const) {
        mats[key].normalScale.set(relief.normal, relief.normal);
        mats[key].aoMapIntensity = relief.ao;
      }
    }
  }
  configureSurfaceMaterials();

  // Empty geometry buckets still have CSM-registered materials; shader-only
  // uGrime is also invisible to a mesh/material-property traversal. Declare
  // both on their world owner so eviction releases every shadow registration
  // and texture, while GPU suspension retains the same reusable CPU objects.
  const retainedSurfaceMaterials: THREE.Material[] = Object.values(mats);
  registerRetainedObject3DResources(group, {
    materials: retainedSurfaceMaterials, textures: [grimeTex, rockDetail.lichen],
  });
  yield { fine: true, stage: 'grime-texture' };
  // r5 terrain_environment: WINTER SNOW-CAP — on the winter map every prop
  // material whitens its UP-FACING fragments toward drifted snow (clumpy,
  // noise-broken). This is what fixes the physically-contradictory "fully
  // snow-free saturated orange roofs in a deep-snow scene" critique: roofs,
  // wall tops, chimneys, carts, sourced baked models and rocks all carry a
  // slope-masked snow load, while vertical faces keep their material.
  const snowCap = mapId === 'winter' || !!P.snowCap;
  // (the facades lane, round 10; gauntlet wave 301 on Steinburg's render: "blotchy brown staining", "cloud-like blotch
  // noise standing in for lime render"; on its ashlar: "the same dark grime blotch in every block") a kit's walls keep the
  // neighbourhood drift but not the props' grime: the 1-3 m blotches darkening a fifth (gB) and the clouds swinging the
  // tone by 15 % (gA) were the stains, laid over the render's own mottling and the stone's own soiling. Their tone swings
  // a twentieth, and the rain's runs streak the face instead: 10-30 cm wide, metres long, a few per cent darker. Not on
  // Verdant (the owner's favourite village keeps its look).
  const grimeHook: MaterialShaderHook = (shader) => grimeShader(shader, false);
  const wallGrimeHook: MaterialShaderHook = (shader) => grimeShader(shader, true);
  const wallGrime = !!regionalArchitecture && mapId !== 'verdant' && !kitLegacy(mapId);
  const isKitWall = (kind: string) => wallGrime && (kind === 'regionalPlaster' || kind === 'regionalPlaster2'
    || kind === 'regionalPlaster3' || kind === 'regionalStone');
  function grimeShader(shader: MaterialShader, walls: boolean): void {
    shader.uniforms.uGrime = { value: grimeTex };
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nvarying vec3 vGrimeW;\nvarying vec3 vGrimeN;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <worldpos_vertex>', /* glsl */`#include <worldpos_vertex>
{
  vec4 gw = vec4(transformed, 1.0);
  vec3 gn = objectNormal;
  #ifdef USE_INSTANCING
  gw = instanceMatrix * gw;
  gn = mat3(instanceMatrix) * gn;
  #endif
  vGrimeW = (modelMatrix * gw).xyz;
  vGrimeN = normalize(mat3(modelMatrix) * gn);
}`);
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <common>',
      '#include <common>\nvarying vec3 vGrimeW;\nvarying vec3 vGrimeN;\nuniform sampler2D uGrime;');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <map_fragment>', /* glsl */`#include <map_fragment>
{
  float gA = texture2D(uGrime, vGrimeW.xz * 0.021 + vGrimeW.y * 0.013).r;
${walls ? `
  // (the runs along the wall's own horizontal, so a wall turned 45 degrees streaks as an axis-aligned one does)
  vec2 gT = normalize(vec2(-vGrimeN.z, vGrimeN.x) + vec2(1e-3, 0.0));
  float gR = texture2D(uGrime, vec2(dot(vGrimeW.xz, gT) * 0.7, vGrimeW.y * 0.05)).g;
  diffuseColor.rgb *= 0.95 + gA * 0.10;
  diffuseColor.rgb *= 1.0 - smoothstep(0.6, 0.92, gR) * 0.07 * (1.0 - abs(vGrimeN.y));` : `
  float gB = texture2D(uGrime, vec2(vGrimeW.x + vGrimeW.z, vGrimeW.y * 1.7) * 0.055).g;
  diffuseColor.rgb *= 0.84 + gA * 0.30;
  diffuseColor.rgb *= 1.0 - smoothstep(0.58, 0.95, gB) * 0.20;`}
  // r3 terrain_environment: smooth ~25-60 m warm/cool + value drift so
  // adjacent buildings stop sharing one identical facade/roof tone (the
  // "whole town shares 3-4 materials" tell). Low frequency = no seams
  // across a single wall, but neighbouring houses land on different tints.
  float gC = texture2D(uGrime, vGrimeW.xz * 0.0058 + vec2(0.31, 0.67)).b;
  diffuseColor.rgb *= 0.92 + gC * 0.16;
  diffuseColor.rgb = mix(diffuseColor.rgb,
    diffuseColor.rgb * (gC > 0.5 ? vec3(1.05, 1.0, 0.93) : vec3(0.95, 0.99, 1.06)),
    abs(gC - 0.5) * 1.1);
  // Round 75 weathering law (v7), shared by every props surface:
  //  - sun fade: upward faces bleach and desaturate a little (roofs, container tops, drum lids)
  //  - rust: an ORM blue-channel mask (the steel atlas paints one; every other atlas carries zero) mixed toward
  //    rust with a world-space break-up so two identical panels never rust alike, with runs pulled down the face
  {
    float fadeUp = smoothstep(0.55, 0.92, vGrimeN.y) * 0.11;
    float luma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(luma) * 1.06 + diffuseColor.rgb * 0.06, fadeUp);
    #ifdef USE_ROUGHNESSMAP
    float rustMask = texture2D(roughnessMap, vRoughnessMapUv).b;
    if (rustMask > 0.002) {
      float runs = texture2D(uGrime, vec2((vGrimeW.x + vGrimeW.z) * 0.9, vGrimeW.y * 0.06)).g;
      float breakup = 0.55 + 0.45 * texture2D(uGrime, vGrimeW.xz * 0.37 + vGrimeW.y * 0.21).r;
      float rust = clamp(rustMask * breakup * (0.7 + 0.6 * runs) * (1.0 - 0.5 * max(0.0, vGrimeN.y)), 0.0, 1.0);
      vec3 rustColor = mix(vec3(0.26, 0.10, 0.04), vec3(0.46, 0.20, 0.07), breakup);
      diffuseColor.rgb = mix(diffuseColor.rgb, rustColor, rust);
    }
    #endif
  }
${snowCap ? `
  // winter: slope-masked snow load on upward faces (clumpy, wind-tailed)
  {
    float swN = texture2D(uGrime, vGrimeW.xz * 0.11 + vec2(0.13, 0.71)).r;
    float sw = smoothstep(0.52, 0.80, vGrimeN.y + (swN - 0.5) * 0.22);
    sw *= 0.72 + 0.28 * texture2D(uGrime, vGrimeW.xz * 0.031).g;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.795, 0.835, 0.90), sw * 0.88);
  }` : ''}
}`);
  }
  // Round 75 item 6: the boulders' dressing (moss on wet maps, dust on arid ones, the soil skirt everywhere; the scenery
  // lane, 2026-10-04: the map's beds, lichen and varnish, the contact darkening)
  const rockDressing = rockDressingFor(mapId, P.rockSoilTone ?? null, snowCap);
  const rockHook: MaterialShaderHook = (shader) => { grimeHook(shader); applyRockShaderHook(shader, rockDressing, rockDetail.lichen, rockStoneMean); };
  // the telegraph poles (the scenery lane, after wave 57): creosote-dark to silvered timber, grain, checks, a stained foot;
  // the dusty maps' sun-bleached
  const poleHook: MaterialShaderHook = (shader) => { grimeHook(shader); applyPoleTimberHook(shader, rockDressing.dust >= 0.5); };
  // the ground lane (wave 234): the track bed's crushed stone, its four-foot's oil and cinder, the rails' rust
  const ballastHook: MaterialShaderHook = (shader) => { grimeHook(shader); applyRailBallastHook(shader, true, !snowCap); };
  // the scenery lane (wave 48, "the same stone pattern clearly tiles going right"): a run repeats the kit's one wall
  // module, so the field print's window shifts along the wall by a hash of each module's place (sixteen steps of seven
  // sixteenths of a tile, u only: the print's bands lie in v) — every module's stones take tones of their own. Only the
  // instanced modules shift; the merged heads and foot stones keep their windows.
  // (b14; gauntlet wave 97: "a dead-level top", "stacked ... slabs"): and the dry-stone modules' stones settle, their
  // copes drop and lichen grows by world place (stoneWallShader.ts); the module's top is the pool geometry's
  const stoneShape: THREE.IUniform<THREE.Vector4> = { value: new THREE.Vector4(1.15, STONE_SETTLE_M, snowCap ? 0 : 1, 0) };
  const fieldStoneHook: MaterialShaderHook = (shader) => {
    grimeHook(shader);
    applyStoneWallHook(shader, stoneShape);
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <uv_vertex>', /* glsl */`#include <uv_vertex>
#ifdef USE_INSTANCING
{
  vec2 cotStoneShift = vec2(floor(fract(dot(instanceMatrix[3].xz, vec2(0.0731, 0.1193))) * 16.0) * 0.4375, 0.0);
  #ifdef USE_MAP
  vMapUv += cotStoneShift;
  #endif
  #ifdef USE_NORMALMAP
  vNormalMapUv += cotStoneShift;
  #endif
  #ifdef USE_ROUGHNESSMAP
  vRoughnessMapUv += cotStoneShift;
  #endif
  #ifdef USE_AOMAP
  vAoMapUv += cotStoneShift;
  #endif
}
#endif`);
  };
  // the scenery lane (b14; gauntlet wave 97: the mud walls' "wave-top silhouette and rust-colored staining repeat
  // identically roughly eight times across the frame", "stamped rectangle decals"): the pool draws one module for every
  // module, so the mud material lays the crown's slumps, the render's losses over the courses and the rain's stains in
  // world space (mudWallShader.ts). The module's top and shoulder are the pool geometry's (set when it is built); the
  // shadow pass runs the same crown (its depth material).
  const mudShape: THREE.IUniform<THREE.Vector3> = { value: new THREE.Vector3(1.2, 0.66, MUD_SLUMP_M) };
  const mudHook: MaterialShaderHook = (shader) => { grimeHook(shader); applyMudWallHook(shader, mudShape); };
  // (round 7) a kit's tile sheet — the regional roofs' and, on a kit's map, the base roofs' (the same sheet) — half a mip
  // softer (applyTileLodBias)
  const tileBiased = (kind: string) => kind === 'regionalRoof' || (kind === 'roof' && !!regionalArchitecture);
  const roofHook: MaterialShaderHook = (shader) => { grimeHook(shader); applyTileLodBias(shader, ROOF_TILE_LOD_BIAS); };
  function installSurfaceShaderHooks(): void {
    for (const [materialKind, material] of Object.entries(mats)) {
      // (round 7) a kit's tile sheet takes the biased roof hook; (round 10) a kit's walls the walls' grime
      const kitHook = tileBiased(materialKind) ? roofHook : isKitWall(materialKind) ? wallGrimeHook : null;
      engineCtx.setupShadowMaterial(material, kitHook ?? (
        materialKind === 'dark' || materialKind === 'glass' ? null : materialKind === 'rock' ? rockHook
          : materialKind === 'fieldStone' ? fieldStoneHook : materialKind === 'pole' ? poleHook
            : materialKind === 'ballast' ? ballastHook
            : materialKind === 'fieldMud' ? mudHook : grimeHook));
      // (the hessian is the canvas's shader with another map, and the hay the straw's: they share their programs; the
      // field print has its own, for the modules' shifted windows, and the mud print its own, for its world-space
      // weathering)
      const programKind = materialKind === 'burlap' ? 'structureCanvas' : materialKind === 'hay' ? 'straw' : materialKind;
      // (round 7: a biased roof is its own program, so a map without a kit never reuses a kit map's)
      const biasKey = (tileBiased(materialKind) ? '-lodb' : '') + (isKitWall(materialKind) ? '-wall' : '');
      material.customProgramCacheKey = () =>
        'world-props-' + programKind + '-v7' + (snowCap ? 's' : '') + biasKey; // round 75: the weathering law
    }
  }
  installSurfaceShaderHooks();

  const buckets: CompletePropsBuckets = {
    plaster: [], plaster2: [], plaster3: [], stone: [], fieldStone: [], fieldMud: [], roof: [], wood: [], dark: [],
    glass: [], curtain: [], straw: [], baked: [], steel: [], structureMetal: [], structureWood: [],
    regionalPlaster: [], regionalPlaster2: [], regionalPlaster3: [], regionalStone: [], regionalRoof: [],
    // (the phones keep the rail bed on the baked material: no ballast program there)
    ...(mobileProps ? {} : { ballast: [] }),
  };
  // the scenery lane (2026-10-03): a map whose field walls are its own rock tints their rubble print (Saltwind: the
  // karst limestone of its outcrops, for its dry-stone walls and their posts). Never the stone print: a regional kit
  // paints its own masonry there (the Dalmatian limestone under the tint burned out white)
  const masonryTint = (cfg as SceneryMapConfig | null)?.scenery?.masonryTint;
  if (masonryTint) mats.fieldStone.color.setRGB(masonryTint[0], masonryTint[1], masonryTint[2]);
  group.userData.steelAtlas = steelAtlas;
  /** A steel part on a map the plan-time predicate did not foresee: paint the atlas now, in one slice, and say so. */
  function ensureSteelAtlas(reason: string): void {
    if (steel || mobileProps) return; // round 78: the phones never paint it
    const started = performance.now();
    const painter = makeSteelAtlas(noi, aniso, steelAtlasSize);
    let step = painter.next();
    while (!step.done) step = painter.next();
    steel = step.value;
    steelAtlas.painted = true;
    steelAtlas.fallback = reason;
    steelAtlas.ms = performance.now() - started;
    steelAtlas.size = steelAtlasSize;
    mats.steel.map = steel.albedo;
    mats.steel.normalMap = steel.normal;
    mats.steel.roughnessMap = steel.surface;
    mats.steel.aoMap = steel.surface;
    mats.steel.needsUpdate = true;
  }
  const obstacles: PropsCollisionRecord[] = [];
  // the scenery pass (2026-10-03) keeps its rock fields off the trees; the vegetation is released before it runs
  const sceneryTrees = vegetation?.treeObstacles ?? [];
  const sceneryTreeKinds = (vegetation as { _trees?: ReadonlyArray<{ species: TreeSpecies }> } | null)?._trees ?? null;
  const colliders: CollisionRecord[] = [];
  // crushables — the main.ts hull-radius contact loop (effects_combat r1).
  // Entries are telegraph poles ({index} into the pole InstancedMesh) OR
  // world-dressing r1 'loop'-contact destructibles ({recIdx} into the
  // destructible records below): flat/small clutter a hull brushes aside.
  const crushables: CrushableRecord[] = []; // [{x,y,z,r,h,toppled, index?|recIdx?}]
  // One renderer-free topology + one InstancedMesh for every conductor
  // segment. Only spans touching a falling pole are rewritten during impact.
  let utilityNetwork: UtilityNetwork | null = null;
  let wireIM: THREE.InstancedMesh | null = null;

  // -------------------------------------------------------------------------
  // DESTRUCTIBLE SMALL-PROP LAYER (world-dressing r1) — "just like trees".
  //
  // Every inhabiting object (carts, crates, barrels, fences, stalls, bales,
  // troughs, lamps, ...) is an instance in a per-type InstancedMesh pool with
  // a destructible RECORD. Three trigger paths, all landing in breakRecord():
  //  1. hull overrun of a tagged CRUSHABLE OBSTACLE — the exact tree seam:
  //     state.ts SAT detects, queues, calls world.crushObstacle → propIdx
  //     routes here (map.ts); state.ts applies the speed bite + emits
  //     prop:crushed (generic dust via main.ts fx.propCrush);
  //  2. hull-radius contact via the main.ts crushables loop ('loop' class —
  //     sapling-grade clutter with NO obstacle at all);
  //  3. shells — src/fx/effects.ts forwards per-frame flight segments and
  //     world-impact points through src/world/destructibles.ts; light props
  //     are shoot-through (no colliders — a hay bale never eats a shell) and
  //     break cosmetically, HE clears a radius.
  // Break classes: 'break' zero-scales the intact instance and activates a
  // pre-built flattened debris instance in the type's broken pool (no
  // per-frame cost once settled, no respawn); 'topple' runs the pole-style
  // eased hinge fall and persists tipped. Kind-flavored particle bursts ride
  // the destructibles.ts seam into fx.propBreak (splinters/staves/hay puff).
  // -------------------------------------------------------------------------
  const drng = mulberry32(seed + 9001); // own stream — never shifts placements
  const pendingClutter: CrushableClutter[] = [];
  const destructibles: DestructibleRecord[] = []; // records: {kind,cls,x,y,z,yaw,sc,r,h,slot,state,ob}
  const autumnCropRows: AutumnCropRow[] | null = mapId === 'autumn' ? [] : null;
  let autumnFieldContext: FieldScatterContext | null = null;
  let autumnFieldStart = 0, autumnFieldEnd = 0;
  const looseRecords: LooseDestructibleRecord[] = []; // physics-class records; sleeping records cost no update work
  const activeLoose: LooseDestructibleRecord[] = []; // only awake records, bounded by the local interaction area
  const dPools = new Map<string, DestructiblePool>(); // kind -> {meta, mats4: Matrix4[], imI, imB, nBroken}
  const wallSpans = new Map<DestructibleRecord, WallSpan>();
  const _dq = new THREE.Quaternion();
  const _de = new THREE.Euler();
  const _structureTint = new THREE.Color();
  // DESTRUCTIBLES r1: kinds whose INTACT geometry is a licensed baked model
  // (props-models.json) — they cannot live in inhabitKit (no bakedGeometry
  // there). Same meta shape; the shared broken state is the burst-bag heap.
  // keep 0.97: driving a sandbag line barely registers on the speedo.
  // (the hitbox lane, 2026-10-07: and a stack stops shells and sight lines — collision.ts names sandbags dense cover, but
  // the stacks published no shell record, so 70-94 % of the rays through a stack passed it; their shell records are the
  // stack's own slabs, refitDestructibleColliders)
  // the scenery lane (2026-10-03): the stacks are laid bag by bag in the sourced models' envelopes (maps/sceneryKit.ts
  // buildSandbagStack) on the hessian (wave 52); a breached stack still spends the old remnant's draws
  const LOCAL_TYPES: Record<string, PropsDestructibleMeta> = {
    sandbagbig: {
      cls: 'break', mat: 'burlap', contact: 'ob', collider: true, r: 2.0, h: 1.35, keep: 0.97,
      build: () => buildSandbagStack('sandbagbig'),
      broken: (rng) => buildSandbagHeap('sandbagbig', () => bSandbagBroken(rng).dispose()),
    },
    sandbagsmall: {
      cls: 'break', mat: 'burlap', contact: 'ob', collider: true, r: 1.7, h: 1.05, keep: 0.975,
      build: () => buildSandbagStack('sandbagsmall'),
      broken: (rng) => buildSandbagHeap('sandbagsmall', () => bSandbagBroken(rng).dispose()),
    },
    sandbagwall: {
      cls: 'break', mat: 'burlap', contact: 'ob', collider: true, r: 1.5, h: 1.0, keep: 0.975,
      build: () => buildSandbagStack('sandbagwall'),
      broken: (rng) => buildSandbagHeap('sandbagwall', () => bSandbagBroken(rng).dispose()),
    },
    // the field wall is dry stone (inhabitKit.ts) on its own rubble print, except under a brick print, which keeps the
    // coursed module on the stone print
    // (wave 20, "no snow on top in a snow-buried valley": a snow map's dry-stone module carries the snow load along its
    // top, so a breached module loses it with its stones)
    ...(sourcedStoneIsBrick(mapId) ? { wallstone: COURSED_WALLSTONE }
      : { wallstone: { ...DESTRUCTIBLE_TYPES.wallstone, mat: fieldWallBucket, ...(snowCap ? { build: snowLoadedWallstone } : {}) } }),
    // the mud wall on its own worn render (fieldMudSurface.ts), never the house plaster
    walladobe: { ...DESTRUCTIBLE_TYPES.walladobe, mat: adobeWallBucket },
    // regional-buildings lane: a kit's own versions of the light families (the Bengal tin homestead for the longhouse,
    // the Angami house, ...): same key, footprint, class and debris, the region's build (structureKit)
    ...(regionalArchitecture ? REGIONAL_DESTRUCTIBLE_TYPES[regionalArchitecture.id] ?? {} : {}),
    // the map-vehicles lane (2026-10-05): the eight vehicle roles as the map's fleet builds them (same records)
    ...civilianVehicleTypes(mapId, mobileProps),
    // (b42, the scenery lane; wave 260's "misplaced modern caravan" on Frosthollow) a map with a period draws each modern
    // roadside kind that came into use after it in its period form, at the same seats (maps/periodClutterKit.ts); its
    // keys (barrier, roadsign, cone, transformer, cablespool) never meet the vehicle roles' on any map (batch 6 merge)
    ...periodClutterTypes(mapId),
    // (b16) and the map's own variants by name, last (the ksar gate post at Sirocco Wadi's and Redrock's gates)
    ...Object.fromEntries(Object.entries(P.structureVariants ?? {}).map(([key, name]) => {
      const variant = STRUCTURE_VARIANTS[name];
      if (!variant) throw new Error(`world/props: unknown structure variant ${name} for ${key}`);
      return [key, variant];
    })),
  };
  /** The dry-stone module with the winter's snow load along its top (fieldWallDressing.ts; one stream of its own). */
  function snowLoadedWallstone(buildRng: () => number): THREE.BufferGeometry {
    const wall = DESTRUCTIBLE_TYPES.wallstone.build(buildRng);
    const snow = buildSnowLoad(wall, 0x5a0c1, { seamless: true });
    // (b14: the snow load settles with the wall vertex by vertex: its stone tag is the snow's kind)
    if (wall.getAttribute('aStone')) {
      const n = snow.attributes.position.count, tag = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) tag[i * 4 + 3] = DRY_STONE_KIND.snow;
      snow.setAttribute('aStone', new THREE.BufferAttribute(tag, 4));
    }
    const loaded = mergeGeometries([wall.index ? wall.toNonIndexed() : wall, snow], false);
    wall.dispose(); snow.dispose();
    if (!loaded) throw new Error('props: the snow-loaded wall merge produced no geometry');
    return loaded;
  }
  const destructibleContext: DestructibleBuildContext = {
    heightField,
    seed,
    localTypes: LOCAL_TYPES,
    pools: dPools,
    records: destructibles,
    looseRecords,
    obstacles,
    colliders,
    crushables,
    quaternion: _dq,
    euler: _de,
  };
  // The landmarks lane (round 2, 2026-10-06): the ground of the set pieces set into a finished map (a placement's
  // `ground: 'veto'`, landmarks/compose.ts). The passes after the composer draw as on the map without them; what they
  // would stand on a piece's ground is left out here — its draws already taken, and no record, pool slot, body or
  // contact made — so nothing else they place moves for the piece. The pieces' own furniture is exempt.
  const landmarkVetoes: Array<{ x: number; z: number; c: number; s: number; hw: number; hd: number }> = [];
  const landmarkVetoed: Record<string, number> = {};
  let landmarkFurniture = false;
  // the scatter round a deployment slot (a building, a regional structure and a set piece's furniture keep their seats:
  // a slot they stand on moves off them with its rotated partner in the match placement)
  const deploymentVetoed: Record<string, number> = {};
  const structureKinds = new Set([...Object.keys(DESTRUCTIBLE_BUILDING_TYPES),
    ...Object.values(REGIONAL_DESTRUCTIBLE_TYPES).flatMap((region) => Object.keys(region))]);
  function addDestructible(
    kind: string,
    x: number,
    y: number,
    z: number,
    yaw = 0,
    sc = 1,
    tiltX = 0,
    tiltZ = 0,
  ): DestructibleRecord {
    if (landmarkVetoes.length && !landmarkFurniture) {
      // (what stands on the ground: its centre inside, or within half a metre of the edge — a long wall or fence module
      // whose end only touches a piece keeps its place, so a run is not opened beside the piece)
      const meta = resolveDestructibleMeta(destructibleContext, kind), r = meta.r * sc, reach = Math.min(r, 0.5);
      for (const v of landmarkVetoes) {
        const dx = x - v.x, dz = z - v.z;
        if (Math.abs(dx * v.c - dz * v.s) < v.hw + reach && Math.abs(dx * v.s + dz * v.c) < v.hd + reach) {
          landmarkVetoed[kind] = (landmarkVetoed[kind] ?? 0) + 1;
          return { kind, cls: meta.cls, x, y, z, yaw, sc, r, h: meta.h * sc, slot: -1, state: 0, ob: null, groundSupport: null };
        }
      }
    }
    if (deploymentSlots.length && !landmarkFurniture && !structureKinds.has(kind)) {
      const meta = resolveDestructibleMeta(destructibleContext, kind), r = meta.r * sc, reach = DEPLOYMENT_CLEAR_M + r;
      for (const slot of deploymentSlots) {
        if ((x - slot.x) ** 2 + (z - slot.z) ** 2 >= reach * reach) continue;
        deploymentVetoed[kind] = (deploymentVetoed[kind] ?? 0) + 1;
        return { kind, cls: meta.cls, x, y, z, yaw, sc, r, h: meta.h * sc, slot: -1, state: 0, ob: null, groundSupport: null };
      }
    }
    return addDestructibleRecord(
      destructibleContext, kind, x, y, z, yaw, sc, tiltX, tiltZ,
    );
  }
  // A destructible's placed obstacle is refitted at pool finalization to the solids its built geometry bears on the
  // ground (refitDestructibleColliders), and that band can outreach the metadata box: a bunker's reaches 5.3 m from its
  // centre, its box 4.0 m. The band's half extents (across, along) at scale 1 are measured once per kind on a
  // fixed-seed build, outside every placement stream.
  const destructibleFootprints = new Map<string, readonly [number, number]>();
  function destructibleFootprint(kind: string): readonly [number, number] {
    let extents = destructibleFootprints.get(kind);
    if (!extents) {
      const meta = resolveDestructibleMeta(destructibleContext, kind);
      const geometry = meta.build(mulberry32(0x0f0f7));
      const band = deriveRuntimeStructureContactBand({ baked: [geometry] });
      geometry.dispose();
      const bounds = setCompoundShape({ min: [0, 0, 0], max: [0, 0, 0] }, band.parts);
      extents = band.parts.length
        ? [Math.max(-bounds.min[0], bounds.max[0]), Math.max(-bounds.min[2], bounds.max[2])]
        : [meta.hw ?? meta.r, meta.hl ?? meta.r];
      destructibleFootprints.set(kind, extents);
    }
    return extents;
  }
  /** Whether a destructible's whole contact footprint at this seat stays out of the road core (roadFootprint.ts). */
  function destructibleClearOfRoad(kind: string, x: number, z: number, yaw: number, sc: number): boolean {
    const [hw, hl] = destructibleFootprint(kind);
    return boxClearOfRoadCore(heightField, x, z, hw * sc + 0.05, hl * sc + 0.05, yaw);
  }
  /**
   * March destructible fence MODULES (FENCE_SEG pitch) along a ground line —
   * the wooden-fence side of the wall kit. Modules pitch to the terrain,
   * skip road crossings (natural gaps), and can hang an open GATE module at
   * a skip or at the far end. Every module is an independent destructible:
   * drive-through-able like saplings, breakable by shells.
   * @param {string} kind fence type ('fenceplank'|'fencepicket'|'fencewattle'|'fencerail')
   * @param {number} gateChance chance the first road-gap edge gets a gate
   */
  function placeFenceRun(
    kind: string,
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    gateChance = 0.35,
    path?: readonly (readonly [number, number])[],
  ): void {
    const curved = path ? fencePathSampler(path) : null;
    const along = curved?.length ?? Math.hypot(x1 - x0, z1 - z0);
    // A module or gate never stands where a bridge deck spans (maps lane B, 2026-10-02): the ground there is the bed or
    // the wall under the span, so a roadside run along a viaduct hung down its gorge. The run still takes the module's
    // draws, so every other placement keeps its seat. (Declared inside the run: roadStations executes this function.)
    function underBridgeDeck(x: number, z: number): boolean {
      for (const deck of heightField.bridgeDecks ?? []) {
        const dx = x - deck.x, dz = z - deck.z;
        if (Math.abs(dx * deck.ux + dz * deck.uz) <= deck.halfLength + 2
          && Math.abs(dx * deck.uz - dz * deck.ux) <= deck.halfWidth + 2) return true;
      }
      return false;
    }
    const n = Math.max(1, Math.round(along / FENCE_SEG));
    const tx = (x1 - x0) / along, tz = (z1 - z0) / along;
    const straightYaw = Math.atan2(tx, tz); // module runs along local +z
    let gated = false;
    let openRun = false;
    for (let k = 0; k < n; k++) {
      const a = curved?.at(k * along / n), b = curved?.at((k + 1) * along / n);
      const ax = a?.[0] ?? x0 + tx * (k * FENCE_SEG), az = a?.[1] ?? z0 + tz * (k * FENCE_SEG);
      const bx = b?.[0] ?? x0 + tx * ((k + 1) * FENCE_SEG), bz = b?.[1] ?? z0 + tz * ((k + 1) * FENCE_SEG);
      const yaw = curved ? Math.atan2(bx - ax, bz - az) : straightYaw;
      const cx = (ax + bx) / 2, cz = (az + bz) / 2;
      if (Math.max(Math.abs(cx), Math.abs(cz)) > 478) { openRun = false; continue; }
      if (heightField._roadDist(cx, cz) < 4.6 || noVeg(cx, cz)) {
        if (openRun && !gated && drng() < gateChance) {
          // hang an open gate at the field entrance the road cuts
          const gy = heightField.getHeightAt(ax, az);
          if (!underBridgeDeck(ax, az)) addDestructible('gate', ax, gy - 0.06, az, yaw, 1);
          gated = true;
        }
        openRun = false;
        continue;
      }
      if (drng() < 0.05) { openRun = false; continue; } // the odd missing module
      const ya = heightField.getHeightAt(ax, az), yb = heightField.getHeightAt(bx, bz);
      const cy = Math.min(ya, yb);
      const tiltX = Math.atan2(yb - ya, FENCE_SEG) * 0.85;
      const scale = 0.96 + drng() * 0.10, tiltZ = (drng() - 0.5) * 0.03;
      if (!underBridgeDeck(cx, cz)) addDestructible(kind, cx, cy - 0.06, cz, yaw, scale, tiltX, tiltZ);
      openRun = true;
    }
  }

  /** Seeded ring scatter of destructibles around a point (yards, markets). */
  function scatterDestructibles(
    kind: string,
    cx: number,
    cz: number,
    count: number,
    rMin: number,
    rMax: number,
    minRoad = 3.5,
  ): number {
    let placed = 0;
    for (let t = 0; t < count * 7 && placed < count; t++) {
      const a = drng() * Math.PI * 2, r = rMin + drng() * (rMax - rMin);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (Math.max(Math.abs(x), Math.abs(z)) > 478) continue;
      if (heightField._roadDist(x, z) < minRoad || noVeg(x, z)) continue;
      if (heightField.getNormalAt(x, z).y < 0.88) continue;
      let onB = false;
      for (const pb of placedB) {
        if (Math.hypot(x - pb.x, z - pb.z) < pb.rr - 0.5) { onB = true; break; }
      }
      if (onB) continue;
      const y = heightField.getHeightAt(x, z);
      addDestructible(kind, x, y - 0.03, z, drng() * Math.PI * 2, 0.9 + drng() * 0.2);
      placed++;
    }
    return placed;
  }

  const buildingFeatures: PlacedBuilding[] = [];
  let wharfFishery: FisheryPacket | null = null;
  const foundryDonors: FoundryDonor[] | null = mapId === 'foundry' && P.foundryServiceCourt ? [] : null;
  let reconformFoundryFoundations: (() => void) | null = null;
  const tacticalBeatFeatures: TacticalBeatFeature[] = [];
  // sourced-model instancing: name -> { geo, list: [Matrix4, ...] }
  const bakedInstances = new Map<string, BakedInstanceGroup>();
  function addBakedInstance(
    name: string,
    geo: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    yaw: number,
    sc = 1,
    tiltX = 0,
    tiltZ = 0,
  ): void {
    let e = bakedInstances.get(name);
    if (!e) { e = { geo, list: [] }; bakedInstances.set(name, e); }
    _quat.setFromEuler(_euler.set(tiltX, yaw, tiltZ, 'YXZ'));
    _mat4.compose(_posv.set(x, y, z), _quat, _scalev.set(sc, sc, sc));
    e.list.push(_mat4.clone());
  }

  // (facades lane, round 6) the sun a regional kit's roofs weather by: their slopes turned from it grow the moss
  // (maps/regional/weather.ts). Outside the placement stage the receipts reduce: they mirror it in their own scope
  // (roadBuildingFrontage, orchardBathhouse, regionalArchitecture)
  const sunAzimuthDeg = (cfg as { sky?: { sunAzimuthDeg?: number } } | null)?.sky?.sunAzimuthDeg;
  const regionalSun = sunAzimuthDeg !== undefined ? { sunAzimuthDeg } : {};

  function groundFit(x: number, z: number, w: number, d: number, rot: number) {
    const cs = Math.abs(Math.cos(rot)), sn = Math.abs(Math.sin(rot));
    const hx = (w * cs + d * sn) / 2, hz = (w * sn + d * cs) / 2;
    const support = sampleObbGround(heightField, x, z, w / 2, d / 2, rot);
    return { y: support.y, spread: support.spread, hx, hz };
  }

  // facades lane (2026-10-07; the coordinator: "put the ground sampler in the build context and lay the strip on
  // terrain"): the ground a kit building is seated on (x, z, rot at baseY), in the building's frame: the rendered terrain
  // (the contact surface, its triangles as drawn) over the seat; the discs its wall-foot strip keeps the grass, tall grass
  // and litter off go with the yards' (map.ts reads them as one list)
  const surfaceAt = heightField.getContactHeightAt
    ? (x: number, z: number) => heightField.getContactHeightAt!(x, z) : (x: number, z: number) => heightField.getHeightAt(x, z);
  function regionalGround(x: number, z: number, rot: number, baseY: number,
    holes: GroundCoverHole[] = (group.userData.regionalYardHoles ??= [])): RegionalGround {
    const c = Math.cos(rot), s = Math.sin(rot);
    return {
      at: (lx, lz) => surfaceAt(x + lx * c + lz * s, z - lx * s + lz * c) - baseY,
      hole: (lx, lz, r) => { holes.push({ x: x + lx * c + lz * s, z: z - lx * s + lz * c, r }); },
    };
  }

  // destruction (docs/DESTRUCTION.md §3.1): every structure placement is one group, numbered in build order; its records
  // and its parts carry the number (the shards pack it; the presentation reads it off the merged geometry)
  let structureSerial = 0;
  const structureDamage = new Map<number, WorldStructureDamage>();
  const structureSpans = new Map<number, StructureSpan[]>();
  const structureMaterials: StructureMaterialEntry[] = [];
  /** One depth material per bucket that casts a structure's shadow (its map and side follow the bucket's material). */
  const structureDepthMaterials = new Map<string, THREE.MeshDepthMaterial>();
  const structureDepthMaterial = (key: string): THREE.MeshDepthMaterial => {
    let depth = structureDepthMaterials.get(key);
    if (!depth) {
      depth = new THREE.MeshDepthMaterial({ name: 'props-structure-depth-' + key, depthPacking: THREE.RGBADepthPacking });
      structureDepthMaterials.set(key, depth);
      retainedSurfaceMaterials.push(depth);
    }
    return depth;
  };
  /** Where each structure's placement is read back after the passes that move buildings (the carriageway clearance,
   * the service court, the wharf): its feature's x, z, yaw, and its contact record's base less the band's own. */
  const structurePlacements = new Map<number, { feature: PlacedBuilding | null; contact: CollisionRecord; contactMinY: number }>();
  /** Describe a structure through its kit chain (§16): parts in its body frame, before the merge places them. */
  function describeStructureAt(structureIdx: number, builder: string, parts: PropsBuckets, x: number, y: number, z: number,
    yaw: number, groupObstacles: CollisionRecord[], groupColliders: CollisionRecord[]): void {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = 0;
    for (const list of Object.values(parts)) for (const geometry of list as THREE.BufferGeometry[]) {
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      if (!box || box.isEmpty()) continue;
      minX = Math.min(minX, box.min.x); maxX = Math.max(maxX, box.max.x);
      minZ = Math.min(minZ, box.min.z); maxZ = Math.max(maxZ, box.max.z);
      maxY = Math.max(maxY, box.max.y);
    }
    if (!Number.isFinite(minX)) return;
    const table = createStructureDamage(groupObstacles, groupColliders);
    const state = table.structures[0];
    if (!state) return;
    const style = regionalArchitecture?.id ?? null;
    const anatomy = describeStructure({
      structureIdx, mapId, builder, style, parts: parts as Readonly<Record<string, readonly THREE.BufferGeometry[]>>,
      w: maxX - minX, d: maxZ - minZ, h: maxY, placement: { x, y, z, yaw }, massClass: state.massClass,
    });
    structureDamage.set(structureIdx, { builder, style, anatomy });
  }
  function addStructureCollision(
    id: string, tmp: PropsBuckets, x: number, baseY: number, z: number, yaw: number,
  ) {
    let profile;
    try {
      profile = deriveRuntimeStructureCollisionProfile(tmp);
    } catch (error) {
      throw new Error(`${id}: unable to derive structure collision`, { cause: error });
    }
    const structureIdx = structureSerial++;
    const contact = appendStructureCollisionBand(obstacles, profile.contact, x, baseY, z, yaw);
    contact.kind = 'structure';
    contact.structureIdx = structureIdx;
    const shells: CollisionRecord[] = [];
    for (const band of profile.shell) {
      const shell = appendStructureCollisionBand(colliders, band, x, baseY, z, yaw);
      shell.kind = 'structure';
      shell.structureIdx = structureIdx;
      shells.push(shell);
    }
    for (const list of Object.values(tmp)) for (const geometry of list as THREE.BufferGeometry[]) {
      geometry.userData.structureIdx = structureIdx;
    }
    structurePlacements.set(structureIdx, { feature: null, contact, contactMinY: profile.contact.minY });
    describeStructureAt(structureIdx, id, tmp, x, baseY, z, yaw, [contact], shells);
    return profile;
  }
  /** The building just pushed onto the features is the structure just placed (its placement reads back from it). */
  function linkStructureFeature(): void {
    const entry = structurePlacements.get(structureSerial - 1);
    const feature = buildingFeatures[buildingFeatures.length - 1];
    if (entry && feature && !entry.feature) entry.feature = feature;
  }

  yield { stage: 'yard-clutter' };
  // --- village buildings along the roads ---
  const roads = L.roads;
  // regional-buildings lane: each kit-built house's solid body (plot-local), for its yard to start at its walls
  // (maps/regional/yards.ts; keyed by the building's feature, which stays as the base placed it)
  const regionalBodies = new Map<PlacedBuilding, { minX: number; maxX: number; minZ: number; maxZ: number }>();
  // junction/plaza: the road crossing nearest the village/town center
  function resolveVillageJunction(): { x: number; z: number } {
    if (mapId === 'verdant') return { x: 20, z: 73 };
    return roadSettlementJunction(roads, { x: town.cx, z: town.cz });
  }
  const junction = resolveVillageJunction();
  // point-to-segment distance (local twin of terrain.js segDist)
  function segD(
    px: number,
    pz: number,
    ax: number,
    az: number,
    bx: number,
    bz: number,
  ): number {
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
    t = clamp(t, 0, 1);
    const ex = ax + dx * t - px, ez = az + dz * t - pz;
    return Math.hypot(ex, ez);
  }
  // distance to the nearest road EXCLUDING index `skip` (keeps crossings open)
  function distToOtherRoads(x: number, z: number, skip = -1): number {
    let best = 1e9;
    for (let ri = 0; ri < roads.length; ri++) {
      if (ri === skip) continue;
      const nodes = roads[ri];
      for (let sg = 0; sg < nodes.length - 1; sg++) {
        const d = segD(x, z, nodes[sg][0], nodes[sg][1], nodes[sg + 1][0], nodes[sg + 1][1]);
        if (d < best) best = d;
      }
    }
    return best;
  }

  // content_breadth r3: wall-material picker — stone share still follows
  // P.wallStoneChance (desert adobe stays all-sandstone), but the plaster
  // share now splits across the three render families, and a cap stops the
  // SAME plaster print appearing on 3+ consecutive placements (the "same
  // white box repeats dozens of times" critique).
  const _wallHist: Array<string | null> = [null, null];
  function pickWall(rr: Rng): string {
    let b = rr() < P.wallStoneChance ? 'stone'
      : (() => { const q = rr(); return q < 0.5 ? 'plaster' : q < 0.8 ? 'plaster2' : 'plaster3'; })();
    if (b !== 'stone' && _wallHist[0] === b && _wallHist[1] === b) {
      b = b === 'plaster' ? 'plaster2' : b === 'plaster2' ? 'plaster3' : 'plaster';
    }
    _wallHist[1] = _wallHist[0]; _wallHist[0] = b;
    return b;
  }

  function collectBuildingCandidates(): Array<{ x: number; z: number; tx: number; tz: number }> {
    const result: Array<{ x: number; z: number; tx: number; tz: number }> = [];
    for (let road = 0; road < roads.length; road++) {
      const nodes = roads[road];
      for (const i of buildingRoadStationIndices(L, road)) {
        const [nx, nz] = nodes[i];
        if (nx < town.x0 + 6 || nx > town.x1 - 6 || nz < town.z0 + 6 || nz > town.z1 - 6) continue;
        if (Math.hypot(nx - junction.x, nz - junction.z) < 22) continue; // keep the plaza open
        const tx = nodes[i + 1][0] - nodes[i - 1][0], tz = nodes[i + 1][1] - nodes[i - 1][1];
        const tl = Math.hypot(tx, tz);
        result.push({ x: nx, z: nz, tx: tx / tl, tz: tz / tl });
      }
    }
    return result;
  }
  const candidates = collectBuildingCandidates();
  // NOTE: sourced barn/church models were trialed here and lost the
  // side-by-side judging to the procedural set (docs/ATTRIBUTION.md).
  const BUILDER_BY_NAME: Record<string, PropsStructureBuilder> = {
    cottage: makeCottage, barn: makeBarn, tower: makeTower, ruin: makeRuin,
    adobe: makeAdobe, rowhouse: makeRowhouse,
    ...URBAN_BUILDERS, // church / factory landmarks (maps/urbanKit.ts)
    // world-dressing r1: per-theme catalog — farmhouse/granary/chapel/mill,
    // logcabin/alpine/onionchurch/woodshed, minaret, cornershop, depot
    ...VILLAGE_BUILDERS,
    // Map-quality structure pass: eight new heavyweight landmarks. They use
    // the same bucket merge path, so detail rises without one mesh per house.
    ...STRUCTURE_BUILDERS,
    bathhouse: P.bathhouseStyle === 'timber' ? makeTimberBathhouse : STRUCTURE_BUILDERS.bathhouse,
  };
  const builders = P.plan.map((n) => BUILDER_BY_NAME[n] || makeCottage);
  let bi = 0;
  const placedB: PlacedRadius[] = [];
  // props.settlementOverWater (Suzhou Creek): whether a footprint (grown by a metre) reaches the course's water
  const overWater = !!P.settlementOverWater;
  const footprintWet = (x: number, z: number, w: number, d: number, rot: number): boolean => {
    if (!overWater) return false;
    const c = Math.cos(rot), sn = Math.sin(rot);
    for (const a of [-1, -0.5, 0, 0.5, 1]) for (const b of [-1, -0.5, 0, 0.5, 1]) {
      const lx = a * (w / 2 + 1), lz = b * (d / 2 + 1);
      if (heightField.getWaterMaskAt(x + lx * c + lz * sn, z - lx * sn + lz * c) > 0) return true;
    }
    return false;
  };
  function collectTacticalReservations(): PlacedRadius[] {
    const result: PlacedRadius[] = [];
    for (const beat of [...(P.tacticalBeats || []), ...(P.orbitalSettlement || [])]) {
      if (!beat.structure) continue;
      const meta = DESTRUCTIBLE_BUILDING_TYPES[beat.structure];
      if (!meta) continue;
      result.push({
        x: beat.x, z: beat.z,
        // Orbital sites precede the scatter pass; reserve enough room for
        // the largest yard gantry's radius as well as the authored facility.
        rr: Math.hypot(meta.hw, meta.hl) * 0.72 + ('role' in beat ? beat.reservePad ?? 2.5 : 10),
      });
    }
    return result;
  }
  const tacticalReservations = collectTacticalReservations();
  const conflictsTacticalReservation = (x: number, z: number, clearance = 10): boolean => tacticalReservations
    .some((site) => Math.hypot(x - site.x, z - site.z) < site.rr + clearance);
  type BuildingCandidate = (typeof candidates)[number];
  function isRoadBuildingSiteClear(x: number, z: number): boolean {
    return !placedB.some((placed) => Math.hypot(x - placed.x, z - placed.z) < placed.rr + P.spacingPad);
  }
  function jitterBuildingUvs(tmp: PropsBuckets, stream: Rng = rng): void {
    for (const bucketName of Object.keys(tmp)) {
      for (const geometry of tmp[bucketName]) {
        // Round 75: atlas-mapped parts (propsSteelAtlas.ts) keep their UVs. A part that stood in the seeded stream
        // before the atlas (a container body) still takes its four draws so every later placement keeps its seat;
        // parts new to the stream take none.
        const source = geometry.userData?.detailUv ? detailUvRng : stream;
        const atlas = geometry.userData?.uvJitter;
        if (atlas === 'consume') { source(); source(); source(); source(); continue; }
        if (atlas === 'none' || geometry.userData?.atlasUv) continue;
        jitterUV(geometry, source);
      }
    }
  }
  // Round 75: what a plan builder may read about this battlefield (maps/exteriorDetailKit.ts StructureBuildContext).
  const structureContext: StructureBuildContext = {
    mapId, snowCap: mapId === 'winter' || !!P.snowCap, seed, cladding: P.industrialCladding ?? 'brick',
  };
  /** A building stands in a carriageway when its footprint comes within the road core (the layout brief's 3.5 m,
   * tools/map-layout-metrics.mjs ROAD_CORE_M) of a road's line; a move clears it by a further 0.75 m. */
  const CARRIAGEWAY_CORE = 3.5, CARRIAGEWAY_CLEARANCE = 4.25;
  type CarriagewayPacket = {
    kind: string; buckets: PropsBuckets; profile: ReturnType<typeof addStructureCollision>; records: CollisionRecord[];
    feature: (typeof buildingFeatures)[number]; placement: PlacedRadius; source: { x: number; y: number; z: number; rot: number };
    w: number; d: number; chimneys: [number, number, number][];
  };
  const carriagewayPackets: CarriagewayPacket[] = [];
  /** A building's footprint as its geometry stands (wings and porches reach past the kit's nominal size) when it stands
   * in a carriageway, else null. */
  /** A building's whole footprint (its plot or its geometry's reach about the origin, whichever is larger). */
  function footprintOf(tmp: PropsBuckets, info: { w: number; d: number }): { w: number; d: number } {
    let w = info.w, d = info.d;
    for (const geometry of Object.values(tmp).flat()) {
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      if (!bounds) continue;
      w = Math.max(w, 2 * Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)));
      d = Math.max(d, 2 * Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)));
    }
    return { w, d };
  }
  function carriagewayFootprint(tmp: PropsBuckets, info: { w: number; d: number }, x: number, z: number,
    rot: number): { w: number; d: number } | null {
    const { w, d } = footprintOf(tmp, info);
    return buildingFootprintClearsRoads({ x, z, rot }, w, d, roads, CARRIAGEWAY_CORE) ? null : { w, d };
  }
  const roadClearanceMoves: { kind: string; from: [number, number]; to: [number, number] | null }[] = [];
  if (P.roadBuildingClearance) group.userData.roadClearanceMoves = roadClearanceMoves;
  function placePlannedBuilding(px: number, pz: number, rot: number, roadSite?: RoadFrontageSite, explicitStructure?: string,
    fromRoad = false, plot?: { w: number; d: number }, vacated = false, stream: Rng = rng): boolean {
    let tmp: PropsBuckets = {
      plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [],
      glass: [], curtain: [], straw: [], baked: [], steel: [], structureMetal: [],
    };
    const structureId = explicitStructure ?? P.plan[bi] ?? 'cottage';
    attachStructureBuildContext(tmp, plot ? { ...structureContext, plot } : structureContext);
    const builder = explicitStructure ? BUILDER_BY_NAME[explicitStructure] : builders[bi];
    if (!builder) throw new Error(`Unknown planned structure ${structureId}`);
    const wallBucket = pickWall(stream);
    const info = builder(stream, tmp, wallBucket);
    if (tmp.steel?.length) ensureSteelAtlas('plan:' + structureId);
    addCatalogExterior(tmp, { id: structureId, info, variant: bi,
      bathhouseStyle: structureId === 'bathhouse' ? P.bathhouseStyle : undefined });
    let fit = groundFit(px, pz, info.w, info.d, rot);
    if (fit.spread > P.maxSpread) return false;
    jitterBuildingUvs(tmp, stream);
    // Keep the original eligibility/build/UV draws. Only an already accepted
    // ordinary roadside building can change parcel-facing; block fill and
    // authored landmark/wharf/court owners never enter this branch.
    if (roadSite && roadBuildingDoorAxis(structureId) !== undefined) {
      const before = { x: px, z: pz, rot };
      // The farmhouse's side wing and some porches are asymmetric: nominal
      // kit dimensions alone do not bound their distance from the origin.
      let w = info.w, d = info.d;
      for (const geometry of Object.values(tmp).flat()) {
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        const bounds = geometry.boundingBox;
        if (!bounds) continue;
        w = Math.max(w, 2 * Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)));
        d = Math.max(d, 2 * Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)));
      }
      w += 0.3; d += 0.3;
      const proposed = roadBuildingFrontage(structureId, roadSite, before, w, d);
      const acceptPose = (proposed: { x: number; z: number; rot: number }): boolean => {
        if (!buildingFootprintClearsRoads(proposed, w, d, roads)) return false;
        const c = Math.cos(proposed.rot), s = Math.sin(proposed.rot);
        const cornersDry = [-1, 1].every(sx => [-1, 1].every(sz => {
          const x = proposed.x + sx * w / 2 * c + sz * d / 2 * s;
          const z = proposed.z - sx * w / 2 * s + sz * d / 2 * c;
          return x >= town.x0 && x <= town.x1 && z >= town.z0 && z <= town.z1 && !noVeg(x, z);
        }));
        const revisedFit = groundFit(proposed.x, proposed.z, w, d, proposed.rot);
        const radius = Math.hypot(w, d) / 2;
        if (cornersDry && !noVeg(proposed.x, proposed.z) && revisedFit.spread <= P.maxSpread
          && !conflictsTacticalReservation(proposed.x, proposed.z, radius)
          && placedB.every(p => Math.hypot(proposed.x - p.x, proposed.z - p.z) >= p.rr + radius + 1)) {
          px = proposed.x; pz = proposed.z; rot = proposed.rot; fit = revisedFit; return true;
        }
        return false;
      };
      let status = proposed && acceptPose(proposed) ? 'corrected' : 'retained-authored-pose';
      if (status !== 'corrected' && !buildingFootprintClearsRoads(before, w, d, roads)) {
        status = 'unresolved-road-conflict';
        const futureParcels: [[number, number], [number, number]][] = [];
        const current = candidates.findIndex(site => site.x === roadSite.x && site.z === roadSite.z
          && site.tx === roadSite.tx && site.tz === roadSite.tz);
        for (let i = current; i >= 0 && i < candidates.length; i++) for (const side of [-1, 1]) {
          if (i === current && side <= roadSite.side) continue;
          const site = candidates[i], nx = -site.tz * side, nz = site.tx * side;
          futureParcels.push([[site.x + nx * P.buildingLat[0], site.z + nz * P.buildingLat[0]],
            [site.x + nx * (P.buildingLat[0] + P.buildingLat[1]), site.z + nz * (P.buildingLat[0] + P.buildingLat[1])]]);
        }
        for (const candidate of roadBuildingClearanceCandidates(roadSite, before)) {
          if (!roadParcelAddsNoExclusion(before, candidate, Math.max(info.w, info.d) * .75 + P.spacingPad, futureParcels)) continue;
          if (acceptPose(candidate)) { status = 'clearance-repaired'; break; }
        }
      }
      const receipt = group.userData.roadBuildingFrontage ??= [];
      receipt.push({ kind: structureId, before, after: { x: px, z: pz, rot },
        w, d, status });
    }
    // regional-buildings lane: every draw, the ground fit and the frontage above saw the base geometry, so the pose is
    // settled; the map's kit now swaps in the region's version of this structure (the wharf fishery and the foundry
    // court donors keep theirs: later passes re-seat those exact parts)
    const regionalDonor = (mapId === 'mangrove' && structureId === 'fishery' && !wharfFishery)
      || (!!foundryDonors && !!P.foundryServiceCourt?.sites.some(site => site.planIndex === bi && site.kind === structureId));
    // (the facades lane, 2026-10-08; gauntlet wave 260 on Mangrove Reach: its shed read as "Western clapboard") the wharf
    // fishery stands its boards upright. The wharf keeps the base fishery's own parts and re-seats exactly them
    // (mangroveFisheryWharf.ts), so the Mekong kit cannot rebuild it: only the texture of its timber walls and gables turns
    // a quarter (u, v -> v, -u: a turn, not a mirror, so the planks' relief keeps its light) and the photo set's planks
    // stand on end, a Ca Mau fish shed's boarding. Wall faces only: the roof, the deck's top and the short posts keep
    // theirs (the wharf stretches the posts' v down to the mud). No position, normal, index or part changes.
    if (regionalArchitecture?.id === 'mekong' && mapId === 'mangrove' && structureId === 'fishery' && !wharfFishery) {
      for (const g of tmp.wood ?? []) {
        g.computeBoundingBox();
        const box = g.boundingBox;
        const uv = g.getAttribute('uv'), normal = g.getAttribute('normal');
        if (!box || box.min.y < 0 || box.max.y - box.min.y < 1 || !uv || !normal) continue;
        for (let i = 0; i < uv.count; i++) {
          if (Math.abs(normal.getY(i)) >= 0.5) continue;
          const u = uv.getX(i), v = uv.getY(i);
          uv.setXY(i, v, -u);
        }
        uv.needsUpdate = true;
      }
    }
    let body: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;
    // a building that stands in a carriageway is packed for the move after every settlement building stands; whether it
    // stands there, and the footprint it moves with, are the base geometry's, so a kit never changes which buildings move
    // or how far (the map-revival lanes, 2026-10-05: the owner's town-plan ruling)
    const carriageway = fromRoad && P.roadBuildingClearance ? carriagewayFootprint(tmp, info, px, pz, rot) : null;
    if (regionalArchitecture && !regionalDonor) {
      // (a building a carriageway may still move takes no ground: its strip lies level)
      const rebuilt = rebuildRegionalStructure(regionalArchitecture, structureId, tmp, info, wallBucket,
        { mapId, snowCap: structureContext.snowCap, seed, ...regionalSun,
          ground: fromRoad && P.roadBuildingClearance ? undefined : regionalGround(px, pz, rot, fit.y + 0.05) }, px, pz, rot);
      if (rebuilt) {
        tmp = rebuilt;
        const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
        for (const list of Object.values(tmp)) for (const g of list as THREE.BufferGeometry[]) {
          if (g.userData.noCollision) continue;
          g.computeBoundingBox();
          const bb = g.boundingBox;
          if (!bb || bb.isEmpty()) continue;
          b.minX = Math.min(b.minX, bb.min.x); b.maxX = Math.max(b.maxX, bb.max.x);
          b.minZ = Math.min(b.minZ, bb.min.z); b.maxZ = Math.max(b.maxZ, bb.max.z);
        }
        if (Number.isFinite(b.minX)) body = b;
      }
    }
    if (vacated) {
      // a set piece stands here (the landmarks lane): the plan's draws were taken and the site keeps its footprint, its
      // geometry and collision are dropped
      for (const list of Object.values(tmp)) for (const geometry of list as THREE.BufferGeometry[]) geometry.dispose();
      buildingFeatures.push({ x: px, z: pz, w: info.w, d: info.d, rot, kind: structureId });
      placedB.push({ x: px, z: pz, rr: Math.max(info.w, info.d) * 0.75 });
      if (!explicitStructure) bi++;
      return true;
    }
    const obstacleStart = obstacles.length, colliderStart = colliders.length;
    const profile = addStructureCollision(structureId, tmp, px, fit.y + 0.05, pz, rot);
    const chimneysBefore = carriageway ? exteriorChimneyTops(buckets).length : 0;
    _quat.setFromAxisAngle(_upAxis, rot);
    _mat4.compose(_posv.set(px, fit.y + 0.05, pz), _quat, _one);
    mergeInto(buckets, tmp, _mat4);
    buildingFeatures.push({ x: px, z: pz, w: info.w, d: info.d, rot, kind: structureId });
    linkStructureFeature();
    if (body) regionalBodies.set(buildingFeatures[buildingFeatures.length - 1], body);
    if (mapId === 'mangrove' && structureId === 'fishery' && !wharfFishery) {
      wharfFishery = { buckets: tmp, source: { x: px, y: fit.y + 0.05, z: pz, yaw: rot },
        records: [...obstacles.slice(obstacleStart), ...colliders.slice(colliderStart)],
        feature: buildingFeatures[buildingFeatures.length - 1] };
    }
    placedB.push({ x: px, z: pz, rr: Math.max(info.w, info.d) * 0.75 });
    if (carriageway) {
      carriagewayPackets.push({ kind: structureId, buckets: tmp, profile,
        records: [obstacles[obstacleStart], ...colliders.slice(colliderStart)], feature: buildingFeatures[buildingFeatures.length - 1],
        placement: placedB[placedB.length - 1], source: { x: px, y: fit.y + 0.05, z: pz, rot }, w: carriageway.w, d: carriageway.d,
        chimneys: exteriorChimneyTops(buckets).slice(chimneysBefore) as [number, number, number][] });
    }
    if (foundryDonors && P.foundryServiceCourt?.sites.some(site => site.planIndex === bi && site.kind === structureId)) {
      foundryDonors.push({ planIndex: bi, kind: structureId, buckets: tmp, profile,
        source: { x: px, y: fit.y + 0.05, z: pz, yaw: rot },
        records: [...obstacles.slice(obstacleStart), ...colliders.slice(colliderStart)],
        feature: buildingFeatures[buildingFeatures.length - 1], placement: placedB[placedB.length - 1] });
    }
    if (!explicitStructure) bi++;
    return true;
  }
  function placeRoadBuilding(cand: BuildingCandidate, side: number): void {
    if (rng() < P.sideSkip) return;
    const lat = P.buildingLat[0] + rng() * P.buildingLat[1];
    const px = cand.x - cand.tz * side * lat;
    const pz = cand.z + cand.tx * side * lat;
    if (px < town.x0 || px > town.x1 || pz < town.z0 || pz > town.z1) return;
    if (heightField._roadDist(px, pz) < 7.5 || noVeg(px, pz)) return;
    if (P.roadBuildingKeepouts?.some((keep) => Math.hypot(px - keep.x, pz - keep.z) < keep.r)) return;
    if (conflictsTacticalReservation(px, pz) || !isRoadBuildingSiteClear(px, pz)) return;
    const rot = Math.atan2(cand.tx, cand.tz) + (rng() - 0.5) * 0.10;
    // 2026-10-02: Mangrove Reach, rebuilt to the layout brief, takes the frontage law as well
    const roadSite = mapId !== 'verdant' && mapId !== 'foundry'
      && !P.streetRows && !P.orbitalSettlement ? { ...cand, side } : undefined;
    placePlannedBuilding(px, pz, rot, roadSite, undefined, true);
  }
  function* placeRoadBuildings(): Generator<PropsBuildSlice, void, void> {
    // Monumental-city maps place their landmark plan first, then let the
    // rowhouse strips knit dense street walls around those reserved masses.
    if (P.streetRows && !P.streetRowsAfterLandmarks) return;
    for (const cand of candidates) {
      if (bi >= builders.length) return;
      for (const side of [-1, 1]) {
        if (bi >= builders.length) return;
        placeRoadBuilding(cand, side);
        yield { fine: true };
      }
    }
  }
  // A recorded town plan: every building from its own stream at its recorded pose, and nothing generated after it.
  function placeRecordedBuilding(entry: TownPlanEntry): void {
    const stream = mulberry32(entry.rng);
    let tmp: PropsBuckets = {
      plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [],
      glass: [], curtain: [], straw: [], baked: [], steel: [], structureMetal: [],
    };
    attachStructureBuildContext(tmp, structureContext);
    const builder = BUILDER_BY_NAME[entry.structure] || makeCottage;
    const info = builder(stream, tmp, entry.wall);
    if (tmp.steel?.length) ensureSteelAtlas('plan:' + entry.structure);
    addCatalogExterior(tmp, { id: entry.structure, info, variant: entry.planIndex,
      bathhouseStyle: entry.structure === 'bathhouse' ? P.bathhouseStyle : undefined });
    jitterBuildingUvs(tmp, stream);
    const fit = groundFit(entry.x, entry.z, info.w, info.d, entry.rot);
    // a replayed building takes the map's regional kit as a generated one does (the foundry court's donors keep theirs)
    const regionalDonor = !!foundryDonors
      && !!P.foundryServiceCourt?.sites.some(site => site.planIndex === entry.planIndex && site.kind === entry.structure);
    // (the carriageway footprint is the base geometry's, as for a generated building)
    // (props.settlementOverWater: one the course's water reaches is packed alike, its new place dry)
    const carriageway = (P.roadBuildingClearance ? carriagewayFootprint(tmp, info, entry.x, entry.z, entry.rot) : null)
      ?? (footprintWet(entry.x, entry.z, info.w, info.d, entry.rot) ? footprintOf(tmp, info) : null);
    if (regionalArchitecture && !regionalDonor) {
      tmp = rebuildRegionalStructure(regionalArchitecture, entry.structure, tmp, info, entry.wall,
        { mapId, snowCap: structureContext.snowCap, seed, ...regionalSun,
          ground: P.roadBuildingClearance ? undefined : regionalGround(entry.x, entry.z, entry.rot, fit.y + 0.05) },
        entry.x, entry.z, entry.rot) ?? tmp;
    }
    const obstacleStart = obstacles.length, colliderStart = colliders.length;
    const profile = addStructureCollision(entry.structure, tmp, entry.x, fit.y + 0.05, entry.z, entry.rot);
    const chimneysBefore = carriageway ? exteriorChimneyTops(buckets).length : 0;
    _quat.setFromAxisAngle(_upAxis, entry.rot);
    _mat4.compose(_posv.set(entry.x, fit.y + 0.05, entry.z), _quat, _one);
    mergeInto(buckets, tmp, _mat4);
    buildingFeatures.push({ x: entry.x, z: entry.z, w: info.w, d: info.d, rot: entry.rot, kind: entry.structure });
    linkStructureFeature();
    placedB.push({ x: entry.x, z: entry.z, rr: Math.max(info.w, info.d) * 0.75 });
    if (carriageway) {
      carriagewayPackets.push({ kind: entry.structure, buckets: tmp, profile,
        records: [obstacles[obstacleStart], ...colliders.slice(colliderStart)], feature: buildingFeatures[buildingFeatures.length - 1],
        placement: placedB[placedB.length - 1], source: { x: entry.x, y: fit.y + 0.05, z: entry.z, rot: entry.rot },
        w: carriageway.w, d: carriageway.d, chimneys: exteriorChimneyTops(buckets).slice(chimneysBefore) as [number, number, number][] });
    }
    // Ironworks' service court relocates its donors after the plan stands, as it does for a generated plan
    if (foundryDonors && P.foundryServiceCourt?.sites.some(site => site.planIndex === entry.planIndex && site.kind === entry.structure)) {
      foundryDonors.push({ planIndex: entry.planIndex, kind: entry.structure, buckets: tmp, profile,
        source: { x: entry.x, y: fit.y + 0.05, z: entry.z, yaw: entry.rot },
        records: [...obstacles.slice(obstacleStart), ...colliders.slice(colliderStart)],
        feature: buildingFeatures[buildingFeatures.length - 1], placement: placedB[placedB.length - 1] });
    }
  }
  if (P.townPlan?.length) {
    for (const entry of P.townPlan) {
      placeRecordedBuilding(entry);
      yield { fine: true };
    }
    for (const entry of P.townPlanAdditions ?? []) {
      placeRecordedBuilding(entry);
      yield { fine: true };
    }
    bi = builders.length;
  }
  for (const [index, site] of (P.townPlan?.length || P.plannedSitesAfterPlan ? [] : P.plannedSites ?? []).entries()) {
    if (heightField._roadDist(site.x, site.z) < 7.5 || noVeg(site.x, site.z)) continue;
    if (!site.terrace && !isRoadBuildingSiteClear(site.x, site.z)) continue;
    // a terrace house draws from a stream of its own (its index in the plan): every later placement keeps its seat
    placePlannedBuilding(site.x, site.z, THREE.MathUtils.degToRad(site.yawDeg), undefined, site.structure, false, site.plot,
      site.vacated, site.terrace ? mulberry32(seed + 104729 * (index + 1)) : rng);
    yield { fine: true };
  }
  yield* placeRoadBuildings();
  // (the map-revival lane, 2026-10-07) the sites that close a square stand last, between the plan's houses
  for (const [index, site] of (P.plannedSitesAfterPlan ? P.plannedSites ?? [] : []).entries()) {
    if (heightField._roadDist(site.x, site.z) < 7.5 || noVeg(site.x, site.z)) continue;
    if (!site.terrace && !isRoadBuildingSiteClear(site.x, site.z)) continue;
    placePlannedBuilding(site.x, site.z, THREE.MathUtils.degToRad(site.yawDeg), undefined, site.structure, false, site.plot,
      site.vacated, site.terrace ? mulberry32(seed + 104729 * (index + 1)) : rng);
    yield { fine: true };
  }

  // heaped masonry chunks + a jutting charred beam (shared by the street
  // rubble scatter and the collapsed rowhouse slots).
  // r3 terrain_environment: chunks are no longer axis-clean boxes — each box
  // gets a consistent PER-CORNER offset (shared corners move together, so
  // faces stay welded) turning it into an irregular broken-masonry
  // hexahedron; a scatter of small brick shards rings the pile base.
  const _rubbleOff = new Float32Array(24);
  function roughenChunk<T extends THREE.BufferGeometry>(chunk: T, rrng: Rng, amt: number): T {
    for (let c = 0; c < 8; c++) {
      _rubbleOff[c * 3] = (rrng() - 0.5) * amt;
      _rubbleOff[c * 3 + 1] = (rrng() - 0.5) * amt * 0.7;
      _rubbleOff[c * 3 + 2] = (rrng() - 0.5) * amt;
    }
    const cp = chunk.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const ci = (cp.getX(i) > 0 ? 1 : 0) + (cp.getY(i) > 0 ? 2 : 0) + (cp.getZ(i) > 0 ? 4 : 0);
      cp.setXYZ(i, cp.getX(i) + _rubbleOff[ci * 3], cp.getY(i) + _rubbleOff[ci * 3 + 1],
        cp.getZ(i) + _rubbleOff[ci * 3 + 2]);
    }
    chunk.computeVertexNormals();
    return chunk;
  }
  function addRubblePile(x: number, z: number, pr: number, rrng: Rng): void {
    const y = heightField.getHeightAt(x, z);
    const stoneStart = buckets.stone.length, woodStart = buckets.wood.length;
    const n = 6 + ((rrng() * 5) | 0);
    for (let k = 0; k < n; k++) {
      const a = rrng() * Math.PI * 2, rr = Math.sqrt(rrng()) * pr;
      const cs = 0.35 + rrng() * 0.8;
      // mix chunk classes: blocky masonry / flat slab / brick-proportioned
      const cls = rrng();
      const chunk = cls < 0.55
        ? box(cs, cs * (0.5 + rrng() * 0.5), cs * (0.6 + rrng() * 0.6), 0.9)
        : cls < 0.8
          ? box(cs * 1.3, cs * 0.22, cs * (0.8 + rrng() * 0.5), 0.9)   // wall slab
          : box(cs * 0.7, cs * 0.3, cs * 0.35, 0.9);                    // brick clump
      roughenChunk(chunk, rrng, cs * 0.34);
      jitterUV(chunk, rrng);
      chunk.rotateY(rrng() * Math.PI);
      chunk.rotateX((rrng() - 0.5) * 0.5);
      chunk.translate(x + Math.cos(a) * rr, y + 0.12 + (1 - rr / pr) * pr * 0.35, z + Math.sin(a) * rr);
      buckets.stone.push(chunk);
    }
    // brick-shard apron: small debris feathering the pile into the ground
    for (let k = 0; k < 7; k++) {
      const a = rrng() * Math.PI * 2, rr = pr * (0.8 + rrng() * 0.6);
      const bs = 0.10 + rrng() * 0.16;
      const shard = roughenChunk(box(bs * 1.7, bs * 0.7, bs, 1.2), rrng, bs * 0.4);
      shard.rotateY(rrng() * Math.PI);
      shard.translate(x + Math.cos(a) * rr, y + 0.05, z + Math.sin(a) * rr);
      buckets.stone.push(shard);
    }
    if (rrng() < 0.6) { // charred beam jutting out
      const beam = box(0.14, 0.14, 2.2 + rrng() * 1.4, 1.0);
      beam.rotateX(-0.5 - rrng() * 0.4);
      beam.rotateY(rrng() * Math.PI * 2);
      beam.translate(x, y + pr * 0.4, z);
      buckets.wood.push(beam);
    }
    const ob = setCircleShape({ min: [x - pr, y, z - pr],
      max: [x + pr, y + pr * .7, z + pr], kind: 'rubble' }, x, z, pr);
    const col = cloneCollisionRecord(ob);
    obstacles.push(ob); colliders.push(col);
    const clutter = new CrushableClutter('rubble', x, y, z, pr, pr * .7, [ob], [col]);
    for (const piece of buckets.stone.slice(stoneStart)) clutter.ownPiece(piece);
    for (const piece of buckets.wood.slice(woodStart)) clutter.ownPiece(piece);
    pendingClutter.push(clutter);
  }

  yield;
  // --- contiguous rowhouse strips along the streets (town maps): buildings
  // butt against each other with shared walls, doors on the street, varied
  // heights/facades, the odd collapsed slot spilling rubble into the street ---
  function* placeStreetRows(): Generator<PropsBuildSlice, void, void> {
    if (!P.streetRows) return;
    // a recorded settlement's rows stand at their recorded poses from their own streams, and the pass draws nothing
    // (props.townRowPlan; props.settlementOverWater leaves out a row its water reaches, and its rubble)
    if (P.townRowPlan) {
      // a row addition's plot: dry, its corners and edge midpoints off every road's core, no record inside it
      const rowPlotClear = (entry: TownRowEntry): boolean => {
        const c = Math.cos(entry.rot), sn = Math.sin(entry.rot), hw = entry.w / 2 + 0.6, hd = entry.d / 2 + 0.6;
        const local = (x: number, z: number): [number, number] => { const dx = x - entry.x, dz = z - entry.z; return [dx * c - dz * sn, dx * sn + dz * c]; };
        for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0], [0, 0]]) {
          const lx = a * hw, lz = b * hd, x = entry.x + lx * c + lz * sn, z = entry.z - lx * sn + lz * c;
          if (heightField._roadDist(x, z) < 4.5) return false;
        }
        // a record inside the plot: its centre in it (a crate, a lamp), or its own footprint over the plot's points (a
        // building beside it is judged by its shape, not its turned box)
        const ex = Math.abs(c) * hw + Math.abs(sn) * hd, ez = Math.abs(sn) * hw + Math.abs(c) * hd;
        const pts: Array<[number, number]> = [];
        for (let a = -hw; a <= hw + 1e-6; a += hw / Math.max(1, Math.round(hw / 0.75))) for (let b = -hd; b <= hd + 1e-6; b += hd / Math.max(1, Math.round(hd / 0.75))) {
          pts.push([entry.x + a * c + b * sn, entry.z - a * sn + b * c]);
        }
        return !obstacles.some((o) => {
          if (o.dead || o.max[0] < entry.x - ex || o.min[0] > entry.x + ex || o.max[2] < entry.z - ez || o.min[2] > entry.z + ez) return false;
          const [lx, lz] = local((o.min[0] + o.max[0]) / 2, (o.min[2] + o.max[2]) / 2);
          if (Math.abs(lx) < hw && Math.abs(lz) < hd) return true;
          return pts.some(([x, z]) => collisionFootprintContainsPoint(o, x, z, 0));
        });
      };
      const rows = [...P.townRowPlan.map((entry) => ({ entry, added: false })), ...(P.townRowPlanAdditions ?? []).map((entry) => ({ entry, added: true }))];
      for (const { entry, added } of rows) {
        if (added && (footprintWet(entry.x, entry.z, entry.w, entry.d, entry.rot) || !rowPlotClear(entry))) continue;
        const stream = mulberry32(entry.rng);
        let tmp: PropsBuckets = {
          plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [],
          glass: [], curtain: [], straw: [], baked: [], steel: [], structureMetal: [],
        };
        const info = entry.ruined ? makeRuin(stream, tmp)
          : makeRowhouse(stream, tmp, entry.wall, { w: entry.w, d: entry.d, lowContrastTrim: mapId === 'ruinspires' });
        const fit = groundFit(entry.x, entry.z, info.w, info.d, entry.rot);
        jitterBuildingUvs(tmp, stream);
        if (footprintWet(entry.x, entry.z, info.w, info.d, entry.rot)) continue;
        if (regionalArchitecture) {
          tmp = rebuildRegionalStructure(regionalArchitecture, entry.ruined ? 'ruin' : 'rowhouse', tmp, info, entry.wall,
            { mapId, snowCap: structureContext.snowCap, seed, ...regionalSun }, entry.x, entry.z, entry.rot) ?? tmp;
        }
        addStructureCollision(entry.ruined ? 'ruin' : 'rowhouse', tmp, entry.x, fit.y + 0.05, entry.z, entry.rot);
        _quat.setFromAxisAngle(_upAxis, entry.rot);
        _mat4.compose(_posv.set(entry.x, fit.y + 0.05, entry.z), _quat, _one);
        mergeInto(buckets, tmp, _mat4);
        buildingFeatures.push({ x: entry.x, z: entry.z, w: info.w, d: info.d, rot: entry.rot });
        placedB.push({ x: entry.x, z: entry.z, rr: Math.max(info.w, info.d) * 0.75 });
        if (entry.rubbleRng !== undefined && entry.rubbleX !== undefined && entry.rubbleZ !== undefined && entry.rubbleR !== undefined) {
          addRubblePile(entry.rubbleX, entry.rubbleZ, entry.rubbleR, mulberry32(entry.rubbleRng));
        }
        yield { fine: true };
      }
      return;
    }
    const srng = mulberry32(seed + 505);
    interface StreetBounds { x: number; z: number; hx: number; hz: number }
    type RoadPoint = [number, number, number, number];
    type RoadPointSampler = (distance: number) => RoadPoint;
    const stripAABBs: StreetBounds[] = [];
    const frontageReservations = placedB.slice();
    const createRoadSampler = (pts: (typeof roads)[number]): { total: number; pointAt: RoadPointSampler } => {
      const cum = [0];
      for (let i = 1; i < pts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      }
      const total = cum[cum.length - 1];
      const pointAt = (t: number): RoadPoint => {
        let i = 1;
        while (i < cum.length - 1 && cum[i] < t) i++;
        const f = (t - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
        const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f;
        const z = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f;
        let tx = pts[i][0] - pts[i - 1][0], tz = pts[i][1] - pts[i - 1][1];
        const tl = Math.hypot(tx, tz) || 1;
        return [x, z, tx / tl, tz / tl];
      };
      return { total, pointAt };
    };
    const outsideStreetRowArea = (x: number, z: number): boolean =>
      x < town.x0 + 8 || x > town.x1 - 8 || z < town.z0 + 8 || z > town.z1 - 8;
    const blockedStreetRowSite = (
      x: number,
      z: number,
      roadIndex: number,
      width: number,
      depth: number,
    ): boolean => distToOtherRoads(x, z, roadIndex) < 9.5
      || Math.hypot(x - junction.x, z - junction.z) < 26
      || noVeg(x, z)
      || conflictsTacticalReservation(x, z, Math.hypot(width, depth) * 0.5)
      || (P.streetRowKeepouts?.some((keep) => {
        const reach = Math.hypot(width, depth) * 0.5;
        return 'r' in keep ? Math.hypot(x - keep.x, z - keep.z) < keep.r + reach
          : x > keep.x0 - reach && x < keep.x1 + reach && z > keep.z0 - reach && z < keep.z1 + reach;
      }) ?? false);
    const conflictsFrontage = (x: number, z: number, width: number, depth: number): boolean =>
      frontageReservations.some((site) =>
        Math.hypot(x - site.x, z - site.z) < site.rr + Math.hypot(width, depth) * 0.34);
    const intersectsStreetRow = (x: number, z: number, hx: number, hz: number): boolean =>
      stripAABBs.some((bounds) => Math.abs(x - bounds.x) < hx + bounds.hx - 1.0
        && Math.abs(z - bounds.z) < hz + bounds.hz - 1.0);
    const addStreetRubble = (
      ruined: boolean,
      rx: number,
      rz: number,
      nx: number,
      nz: number,
      offset: number,
      depth: number,
    ): void => {
      if (!ruined) return;
      const x = rx + nx * (offset - depth * 0.55), z = rz + nz * (offset - depth * 0.55);
      if (heightField._roadDist(x, z) <= 3.4) return;
      // The spill keeps its whole pile out of the road core, moved back toward the ruin when it reaches in. Where no
      // seat within 8 m clears (a dense street grid), the pile keeps its old seat: it is drive-through rubble, and
      // its draws feed the next street-row slots.
      const pr = 1.8 + srng() * 1.2;
      const seat = shiftClearOfRoadCore(heightField, x, z, (px, pz) => discClearOfRoadCore(heightField, px, pz, pr))
        ?? [x, z];
      addRubblePile(seat[0], seat[1], pr, srng);
    };
    const placeStreetRowSlot = (
      distance: number,
      roadIndex: number,
      side: number,
      pointAt: RoadPointSampler,
    ): number => {
      const width = 8.2 + srng() * 3.0, depth = 8.5 + srng() * 3.5;
      const [rx, rz, tx, tz] = pointAt(distance + width / 2);
      if (outsideStreetRowArea(rx, rz)) return distance + width;
      const nx = -tz * side, nz = tx * side;
      const offset = 5.7 + srng() * 1.8 + depth / 2;
      const x = rx + nx * offset, z = rz + nz * offset;
      if (blockedStreetRowSite(x, z, roadIndex, width, depth)) return distance + 6;
      if (conflictsFrontage(x, z, width, depth)) return distance + width;
      const roll = srng();
      if (roll < 0.14) return distance + 4 + srng() * 7;
      const rot = Math.atan2(-nx, -nz);
      const cs = Math.abs(Math.cos(rot)), sn = Math.abs(Math.sin(rot));
      const hx = (width * cs + depth * sn) / 2, hz = (width * sn + depth * cs) / 2;
      if (intersectsStreetRow(x, z, hx, hz)) return distance + width * 0.6;
      const ruined = roll < (P.ruinChance ?? 0.24);
      let tmp: PropsBuckets = {
        plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [],
        glass: [], curtain: [], straw: [], baked: [], steel: [], structureMetal: [],
      };
      // the wall draw stays where the rowhouse call evaluated it (a ruin draws none)
      const rowWall = ruined ? 'stone' : pickWall(srng);
      const info = ruined
        ? makeRuin(rng, tmp)
        : makeRowhouse(rng, tmp, rowWall, {
          w: width, d: depth, lowContrastTrim: mapId === 'ruinspires',
        });
      const fit = groundFit(x, z, info.w, info.d, rot);
      if (fit.spread > 3.2) return distance + width;
      jitterBuildingUvs(tmp);
      // regional-buildings lane: the street row's draws and pose are settled; the map's kit swaps in its row house
      if (regionalArchitecture) {
        tmp = rebuildRegionalStructure(regionalArchitecture, ruined ? 'ruin' : 'rowhouse', tmp, info, rowWall,
          { mapId, snowCap: structureContext.snowCap, seed, ...regionalSun, ground: regionalGround(x, z, rot, fit.y + 0.05) }, x, z, rot) ?? tmp;
      }
      addStructureCollision(ruined ? 'ruin' : 'rowhouse', tmp, x, fit.y + 0.05, z, rot);
      _quat.setFromAxisAngle(_upAxis, rot);
      _mat4.compose(_posv.set(x, fit.y + 0.05, z), _quat, _one);
      mergeInto(buckets, tmp, _mat4);
      buildingFeatures.push({ x, z, w: info.w, d: info.d, rot });
      placedB.push({ x, z, rr: Math.max(info.w, info.d) * 0.75 });
      stripAABBs.push({ x, z, hx, hz });
      addStreetRubble(ruined, rx, rz, nx, nz, offset, depth);
      return distance + width - 0.25;
    };
    function* placeStreetSide(
      roadIndex: number,
      side: number,
      total: number,
      pointAt: RoadPointSampler,
    ): Generator<PropsBuildSlice, void, void> {
      let distance = 3 + srng() * 9;
      while (distance < total - 10) {
        distance = placeStreetRowSlot(distance, roadIndex, side, pointAt);
        yield { fine: true };
      }
    }
    function* placeStreetRoad(roadIndex: number): Generator<PropsBuildSlice, void, void> {
      if (roadIndex % Math.max(1, P.streetRowRoadStride || 1) !== 0) return;
      const { total, pointAt } = createRoadSampler(roads[roadIndex]);
      for (const side of [-1, 1]) {
        yield* placeStreetSide(roadIndex, side, total, pointAt);
      }
    }
    for (let roadIndex = 0; roadIndex < roads.length; roadIndex++) {
      yield* placeStreetRoad(roadIndex);
    }

    // --- street furniture + battle litter (town maps) --------------------
    // Cast-iron lampposts march both pavements; small masonry spill, roof-
    // tile shards and the odd toppled post litter the kerb line — the shelled
    // town finally carries its own street-level texture instead of bare
    // asphalt ribbons between facades.
    function placeStreetFurniture(): void {
      const frng = mulberry32(seed + 606);
      function placeStreetLamps(): void {
        for (let ri = 0; ri < roads.length; ri++) {
          const pts = roads[ri], count = authoredRoadStationCount(L, ri);
          for (let i = 1; i < count - 1; i += 1) { // r5: every original node (~32 m spacing)
          const at = authoredRoadStationIndex(L, ri, i);
          if (at < 0) continue;
          const [ax, az] = pts[at], [bx, bz] = pts[at + 1];
          const tl = Math.hypot(bx - ax, bz - az) || 1;
          const txn = (bx - ax) / tl, tzn = (bz - az) / tl;
          const side = (i % 2) ? 1 : -1; // alternate pavements
          const lx = ax - tzn * side * 5.9, lz = az + txn * side * 5.9;
          if (lx < town.x0 + 4 || lx > town.x1 - 4 || lz < town.z0 + 4 || lz > town.z1 - 4) continue;
          if (distToOtherRoads(lx, lz, ri) < 7 || noVeg(lx, lz)) continue;
          const ly = heightField.getHeightAt(lx, lz);
          if (frng() < 0.18) { // toppled post lying across the pavement
            const fall = box(0.09, 0.09, 4.6, 1.4);
            fall.rotateY(frng() * Math.PI * 2);
            fall.translate(lx, ly + 0.1, lz);
            buckets.dark.push(fall);
            continue;
          }
          // world-dressing r1: standing lamps are DESTRUCTIBLE instances —
          // a moving hull hinge-topples them (tree seam), shells knock them
          // down; the felled post persists across the pavement.
          // lamp kit's arm runs along local +x; the old post aimed local +z
          // over the carriageway with yaw -atan2(tzn,txn) — shift by -pi/2
          const yawL = -Math.atan2(tzn, txn) - Math.PI / 2;
          addDestructible('lamp', lx, ly - 0.02, lz, yawL, 0.95 + frng() * 0.1);
          }
        }
      }
      // kerb-line battle litter: masonry chips + slate shards along frontages
      const placeStreetLitter = (): void => {
        for (let i = 0, placed = 0; i < 900 && placed < 150; i++) {
          const x = town.x0 + frng() * (town.x1 - town.x0);
          const z = town.z0 + frng() * (town.z1 - town.z0);
          const rd = heightField._roadDist(x, z);
          if (rd < 3.2 || rd > 7.5) continue; // hugs the kerb/pavement band
          if (noVeg(x, z)) continue;
          const y = heightField.getHeightAt(x, z);
          const cs = 0.14 + frng() * 0.34;
          const chip = box(cs, cs * (0.4 + frng() * 0.4), cs * (0.5 + frng() * 0.8), 1.6);
          jitterUV(chip, frng);
          chip.rotateY(frng() * Math.PI);
          chip.rotateX((frng() - 0.5) * 0.4);
          chip.translate(x, y + cs * 0.2, z);
          if (frng() < 0.72) buckets.stone.push(chip); else buckets.roof.push(chip);
          placed++;
        }
      };
      placeStreetLamps();
      placeStreetLitter();
    }
    placeStreetFurniture();
  }
  yield* placeStreetRows();

  yield;
  // --- town block fill (urban): place remaining plan buildings on a coarse
  // grid BETWEEN the streets so blocks read built-up, not just road-fronted ---
  function* placeTownBlockFill(): Generator<PropsBuildSlice, void, void> {
    if (!P.blockFill || bi >= builders.length) return;
    const brng = mulberry32(seed + 404);
    const step = 27;
    const tryPlaceTownBuilding = (gx: number, gz: number): void => {
      if (bi >= builders.length) return;
      const px = gx + (brng() - 0.5) * 10, pz = gz + (brng() - 0.5) * 10;
      const roadDistance = heightField._roadDist(px, pz);
      if (roadDistance < 11 || roadDistance > 60 || noVeg(px, pz)) return;
      if (conflictsTacticalReservation(px, pz)) return;
      if (Math.hypot(px - junction.x, pz - junction.z) < 24) return;
      if (!isRoadBuildingSiteClear(px, pz)) return;
      const rot = (brng() < 0.5 ? 0 : Math.PI / 2) + (brng() - 0.5) * 0.06;
      placePlannedBuilding(px, pz, rot, undefined, undefined, true);
    };
    for (let gz = town.z0 + 14; gz < town.z1 - 14 && bi < builders.length; gz += step) {
      for (let gx = town.x0 + 14; gx < town.x1 - 14 && bi < builders.length; gx += step) {
        tryPlaceTownBuilding(gx, gz);
        yield { fine: true };
      }
    }
  }
  yield* placeTownBlockFill();

  // Once every settlement building stands, each one packed as standing in a carriageway moves by the least distance
  // that clears it: rings of 0.5 m out to 30 m, the bearing away from the nearest road first, then turning by 15
  // degrees at a time to either side; the new place keeps its ground fit and stays clear of every other building and
  // strongpoint. A map can author the place instead (props.roadClearanceTargets), checked alike. Its geometry,
  // collision bands, footprint record and chimney tops move with it.
  /** Whether two footprints (centre, size, yaw) come within `gap` metres of each other: separating axes of the two
   * rectangles, each grown by half the gap. */
  function footprintsMeet(a: { x: number; z: number; w: number; d: number; rot: number },
    b: { x: number; z: number; w: number; d: number; rot: number }, gap: number): boolean {
    const axes = [a.rot, a.rot + Math.PI / 2, b.rot, b.rot + Math.PI / 2];
    for (const angle of axes) {
      const ux = Math.cos(angle), uz = -Math.sin(angle);
      const reach = (f: typeof a) => {
        const c = Math.cos(f.rot), sn = Math.sin(f.rot);
        // the footprint's half extents projected on the axis (its local x along (cos, -sin), local z along (sin, cos))
        return Math.abs((f.w / 2 + gap / 2) * (c * ux - sn * uz)) + Math.abs((f.d / 2 + gap / 2) * (sn * ux + c * uz));
      };
      const separation = Math.abs((b.x - a.x) * ux + (b.z - a.z) * uz);
      if (separation > reach(a) + reach(b)) return false;
    }
    return true;
  }
  function moveBuildingsOffCarriageways(): void {
    for (const packet of carriagewayPackets) {
      const { source, w, d } = packet;
      let best = Infinity, ax = 0, az = 1;
      for (const road of roads) for (let i = 1; i < road.length; i++) {
        const [x0, z0] = road[i - 1], [x1, z1] = road[i];
        const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz;
        const t = l2 > 0 ? clamp(((source.x - x0) * dx + (source.z - z0) * dz) / l2, 0, 1) : 0;
        const cx = x0 + dx * t, cz = z0 + dz * t, dd = Math.hypot(source.x - cx, source.z - cz);
        if (dd < best) {
          best = dd;
          if (dd > 1e-6) { ax = (source.x - cx) / dd; az = (source.z - cz) / dd; } else { const l = Math.sqrt(l2) || 1; ax = -dz / l; az = dx / l; }
        }
      }
      let target: { x: number; z: number } | null = null;
      const clearsAt = (x: number, z: number): boolean => {
        if (x < v.x0 || x > v.x1 || z < v.z0 || z > v.z1 || noVeg(x, z)) return false;
        if (footprintWet(x, z, w, d, source.rot)) return false;
        if (!buildingFootprintClearsRoads({ x, z, rot: source.rot }, w, d, roads, CARRIAGEWAY_CLEARANCE)) return false;
        if (groundFit(x, z, w, d, source.rot).spread > P.maxSpread || conflictsTacticalReservation(x, z)) return false;
        const footprint = { x, z, w, d, rot: source.rot };
        return !buildingFeatures.some((other) => other !== packet.feature && footprintsMeet(footprint, other, 1));
      };
      const authored = P.roadClearanceTargets?.find((entry) =>
        Math.hypot(entry.from[0] - source.x, entry.from[1] - source.z) <= 1.5);
      if (authored && clearsAt(authored.to[0], authored.to[1])) target = { x: authored.to[0], z: authored.to[1] };
      const turns = [0];
      for (let k = 1; k <= 12; k++) turns.push(k * Math.PI / 12, -k * Math.PI / 12);
      // (props.settlementOverWater: a building the course's water reaches looks out to 80 m for dry ground)
      for (let step = 1; step <= (overWater ? 160 : 60) && !target; step++) {
        const dist = step * 0.5;
        for (const turn of turns) {
          const c = Math.cos(turn), sn = Math.sin(turn);
          const x = source.x + (ax * c - az * sn) * dist, z = source.z + (ax * sn + az * c) * dist;
          if (!clearsAt(x, z)) continue;
          target = { x, z };
          break;
        }
      }
      roadClearanceMoves.push({ kind: packet.kind, from: [source.x, source.z], to: target ? [target.x, target.z] : null });
      if (!target) continue;
      const y = groundFit(target.x, target.z, w, d, source.rot).y + 0.05;
      const dx = target.x - source.x, dy = y - source.y, dz = target.z - source.z;
      const transform = new THREE.Matrix4().makeTranslation(dx, dy, dz);
      for (const geometries of Object.values(packet.buckets)) for (const geometry of geometries) geometry.applyMatrix4(transform);
      [packet.profile.contact, ...packet.profile.shell].forEach((band, i) => {
        const record = packet.records[i];
        record.min[1] = y + band.minY; record.max[1] = y + band.maxY;
        applyStructureCollisionBand(record, band, target.x, target.z, source.rot, y);
      });
      Object.assign(packet.feature, { x: target.x, z: target.z });
      Object.assign(packet.placement, { x: target.x, z: target.z });
      for (const top of packet.chimneys) { top[0] += dx; top[1] += dy; top[2] += dz; }
    }
    carriagewayPackets.length = 0;
  }
  moveBuildingsOffCarriageways();

  // The landmarks lane (2026-10-05): the map's set pieces (src/world/landmarks/compose.ts), once the settlement, the
  // strongpoints and the light buildings stand (so none of those moves for a piece: the composer refuses a piece on
  // their solids) and before every scatter pass, which keeps off the ground each piece reserves. Built from streams of
  // their own; a map without set pieces runs nothing there.
  function* placeLandmarks(): Generator<PropsBuildSlice, void, void> {
    if (!P.landmarks?.length) return;
    const receipt = yield* composeLandmarks({
      mapId, landmarks: P.landmarks, heightField, spawns: [L.spawns.player, ...L.spawns.enemies],
      obstacles, colliders, architecture: regionalArchitecture, snowCap: structureContext.snowCap, seed,
      structureIndex: () => structureSerial++,
      describeStructure: (structureIdx, kind, parts, x, y, z, yaw, groupObstacles, groupColliders) =>
        describeStructureAt(structureIdx, kind, parts as unknown as PropsBuckets, x, y, z, yaw, groupObstacles, groupColliders),
      hardKinds: new Set(Object.keys(DESTRUCTIBLE_BUILDING_TYPES)),
      tier: mobileProps ? 'mobile' : 'desktop',
      merge: (parts, matrix) => mergeInto(buckets, parts as unknown as PropsBuckets, matrix),
      reserve: (x, z, r) => { placedB.push({ x, z, rr: r, landmark: true }); },
      veto: (x, z, yaw, hw, hd) => { landmarkVetoes.push({ x, z, c: Math.cos(yaw), s: Math.sin(yaw), hw, hd }); },
      groundHole: (x, z, r) => { landmarkGroundHoles.push({ x, z, r }); },
      publish: (x, z, w, d, rot, kind) => { buildingFeatures.push({ x, z, w, d, rot, landmark: kind }); },
      // a piece's benches and lamps join the props' destructibles once every seeded pass is done (below): so the pools
      // and records every later pass makes keep their order, and their arrangements, as on the map without the piece
      addDestructible: (kind, x, y, z, yaw, scale) => { landmarkDestructibles.push([kind, x, y, z, yaw, scale]); },
    });
    group.userData.landmarks = receipt;
    if (landmarkGroundHoles.length) group.userData.landmarkGroundHoles = landmarkGroundHoles;
  }
  const landmarkDestructibles: Array<[string, number, number, number, number, number]> = [];
  // the paved pieces' ground (map.ts keeps the grass off it with the scenery's and the yards' holes)
  const landmarkGroundHoles: Array<{ x: number; z: number; r: number }> = [];

  // the scenery lane (wave 34, "a stacked prop on a bare mound — no berm, trench or spilled sand"): each nest's spoil
  // banked against it and the spill of a burst bag (sceneryKit.ts buildSandbagBedding), a stream of its own named by
  // its place, in the map's soil (its earth on an arid map); drawn as one receive-only mesh of their own
  const sandbagBeds: THREE.BufferGeometry[] = [];
  const bedSoil = ((): readonly [number, number, number] => {
    // (wave 34 re-shoot: a props surface of the soil's albedo rendered twice as bright as the terrain's dirt beside it —
    // sRGB 169,119,73 against 118,83,54 on Frontier — so the spoil takes half the soil's linear albedo)
    const earth = mudEarthOfGround((cfg as { sky?: { lighting?: { groundAlbedoHex?: number } } } | null)?.sky?.lighting?.groundAlbedoHex);
    const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const soil = earth ? [lin(earth[0]), lin(earth[1]), lin(earth[2])] : rockDressingFor(mapId, P.rockSoilTone ?? null).soil;
    return [soil[0] * 0.5, soil[1] * 0.5, soil[2] * 0.5];
  })();
  function bedSandbagNest(kind: string, x: number, z: number, yaw: number, scale: number,
    toward: readonly [number, number] | null = null): void {
    if (kind !== 'sandbagbig' && kind !== 'sandbagsmall' && kind !== 'sandbagwall') return;
    sandbagBeds.push(buildSandbagBedding(kind, heightField, x, z, yaw, scale,
      (Math.round(x * 100) * 73856093) ^ (Math.round(z * 100) * 19349663) ^ 0x5bed, bedSoil, mobileProps, toward));
  }
  // Map-specific strongpoints. Random dressing is still valuable between
  // lanes, but critical cover cannot be left to a scatter pass: these beats
  // deliberately anchor the brawl, scout and support routes authored by each
  // expansion map. Structures and redoubts reuse destructible pools, so the
  // pass adds no new material or draw-call family.
  function* placeTacticalBeats(): Generator<PropsBuildSlice, void, void> {
    if (!P.tacticalBeats?.length && !P.orbitalSettlement?.length) return;
    type TacticalBeat = NonNullable<typeof P.tacticalBeats>[number];
    const placeTacticalStructure = (beat: TacticalBeat, yaw: number): boolean => {
      if (!beat.structure) return false;
      const meta = DESTRUCTIBLE_BUILDING_TYPES[beat.structure];
      if (!meta) throw new Error(`world/props: unknown tactical structure ${beat.structure}`);
      const fit = groundFit(beat.x, beat.z, meta.hw * 2, meta.hl * 2, yaw);
      const rr = Math.hypot(meta.hw, meta.hl) * 0.72;
      const blocked = placedB.some((placed) =>
        Math.hypot(beat.x - placed.x, beat.z - placed.z) < placed.rr + rr + 1.5);
      const tooSteep = fit.spread > Math.max(P.maxSpread, beat.maxSpread ?? 3.8);
      if (tooSteep || noVeg(beat.x, beat.z) || blocked) return false;
      addDestructible(beat.structure, beat.x, fit.y + 0.04, beat.z, yaw);
      buildingFeatures.push({ x: beat.x, z: beat.z, w: meta.hw * 2, d: meta.hl * 2, rot: yaw });
      placedB.push({ x: beat.x, z: beat.z, rr });
      return true;
    };
    const placeTacticalRedoubt = (beat: TacticalBeat, yaw: number): void => {
      if (!beat.redoubt) return;
      const fwdX = Math.sin(yaw), fwdZ = Math.cos(yaw);
      const sideX = Math.cos(yaw), sideZ = -Math.sin(yaw);
      const offset = beat.redoubtOffset ?? 8.5;
      const cx = beat.x + fwdX * offset, cz = beat.z + fwdZ * offset;
      for (let sideIndex = -1; sideIndex <= 1; sideIndex++) {
        const sx = cx + sideX * sideIndex * 3.05, sz = cz + sideZ * sideIndex * 3.05;
        const sy = heightField.getHeightAt(sx, sz);
        const kind = sideIndex === 0 ? 'sandbagbig' : 'sandbagsmall';
        addDestructible(kind, sx, sy - 0.04, sz, yaw + sideIndex * 0.12, 1.18);
        bedSandbagNest(kind, sx, sz, yaw + sideIndex * 0.12, 1.18, [fwdX, fwdZ]); // (its spoil thrown forward)
      }
      scatterDestructibles('ammobox', cx - fwdX * 2.2, cz - fwdZ * 2.2, 2, 0.8, 2.2, 0);
      scatterDestructibles('crate', cx - fwdX * 3.0, cz - fwdZ * 3.0, 1, 0.5, 1.5, 0);
    };
    for (const site of P.orbitalSettlement || []) {
      placeTacticalStructure(site, THREE.MathUtils.degToRad(site.yawDeg));
      yield { fine: true };
    }
    for (const beat of P.tacticalBeats) {
      const yaw = THREE.MathUtils.degToRad(beat.yawDeg || 0);
      const structurePlaced = placeTacticalStructure(beat, yaw);
      placeTacticalRedoubt(beat, yaw);
      tacticalBeatFeatures.push({
        id: beat.id, role: beat.role, x: beat.x, z: beat.z,
        structurePlaced, redoubt: !!beat.redoubt,
      });
      yield { fine: true };
    }
  }
  yield* placeTacticalBeats();

  // Light-building pass: huts, shelters, tents and camp infrastructure are
  // individually destructible, unlike the heavyweight merged landmarks.
  // A separate seeded stream keeps the established village layout stable.
  // Each type becomes one intact InstancedMesh plus an empty broken-state
  // pool, bounded to the handful of families authored by the active map.
  function* placeDestructibleBuildings(): Generator<PropsBuildSlice, void, void> {
    // a recorded settlement's light buildings stand at their recorded poses, and the pass draws nothing
    if (P.townLightPlan) {
      for (const entry of P.townLightPlan) {
        const kind = P.townLightPlanSwaps?.[entry.kind] ?? entry.kind;
        const meta = DESTRUCTIBLE_BUILDING_TYPES[kind];
        if (!meta) continue;
        const fit = groundFit(entry.x, entry.z, meta.hw * 2, meta.hl * 2, entry.rot);
        // (props.settlementOverWater: one the course's water reaches is left out)
        if (footprintWet(entry.x, entry.z, meta.hw * 2, meta.hl * 2, entry.rot)) continue;
        addDestructible(kind, entry.x, fit.y + 0.04, entry.z, entry.rot);
        buildingFeatures.push({ x: entry.x, z: entry.z, w: meta.hw * 2, d: meta.hl * 2, rot: entry.rot });
        placedB.push({ x: entry.x, z: entry.z, rr: Math.hypot(meta.hw, meta.hl) * 0.72 });
        yield { fine: true };
      }
      return;
    }
    if (!P.destructibleBuildings?.length) return;
    const srng = mulberry32(seed + 17041);
    const lateral = P.destructibleBuildingLat || [9.5, 9.0];
    interface DestructibleBuildingSite { x: number; z: number; rot: number }
    const sampleDestructibleBuildingSite = (attempt: number): DestructibleBuildingSite | null => {
      if (attempt < 52 && candidates.length) {
        const cand = candidates[(srng() * candidates.length) | 0];
        const side = srng() < 0.5 ? -1 : 1;
        const lat = lateral[0] + srng() * lateral[1];
        return {
          x: cand.x - cand.tz * side * lat,
          z: cand.z + cand.tx * side * lat,
          rot: Math.atan2(cand.tx, cand.tz) + (srng() - 0.5) * 0.16,
        };
      }
      const x = town.x0 + 10 + srng() * Math.max(1, town.x1 - town.x0 - 20);
      const z = town.z0 + 10 + srng() * Math.max(1, town.z1 - town.z0 - 20);
      const rot = (srng() < 0.5 ? 0 : Math.PI / 2) + (srng() - 0.5) * 0.14;
      const roadDistance = heightField._roadDist(x, z);
      return roadDistance < 7.5 || roadDistance > 48 ? null : { x, z, rot };
    };
    const placeDestructibleBuilding = (kind: string): void => {
      const meta = DESTRUCTIBLE_BUILDING_TYPES[kind];
      if (!meta) return;
      const rr = Math.hypot(meta.hw, meta.hl) * 0.72;
      for (let attempt = 0; attempt < 80; attempt++) {
        const site = sampleDestructibleBuildingSite(attempt);
        if (!site) continue;
        const { x, z, rot } = site;
        const margin = Math.max(meta.hw, meta.hl) + 2;
        const outsideVillage = x < town.x0 + margin || x > town.x1 - margin
          || z < town.z0 + margin || z > town.z1 - margin;
        if (outsideVillage || Math.hypot(x - junction.x, z - junction.z) < 18 || noVeg(x, z)) continue;
        const fit = groundFit(x, z, meta.hw * 2, meta.hl * 2, rot);
        if (fit.spread > Math.max(P.maxSpread, 1.9)) continue;
        const blocked = placedB.some((placed) => Math.hypot(x - placed.x, z - placed.z) < placed.rr + rr + 2.0);
        if (blocked) continue;
        addDestructible(kind, x, fit.y + 0.04, z, rot);
        buildingFeatures.push({ x, z, w: meta.hw * 2, d: meta.hl * 2, rot });
        placedB.push({ x, z, rr });
        return;
      }
    };
    for (const kind of P.destructibleBuildings) {
      placeDestructibleBuilding(kind);
      yield { fine: true };
    }
  }
  yield* placeDestructibleBuildings();
  // the set pieces (placeLandmarks above), on the ground the settlement, the strongpoints and the light buildings left
  yield* placeLandmarks();

  // --- yard set-dressing (r2 terrain_environment): woodpiles, barrels and
  // short garden-fence runs around every free-standing building. The village
  // read as boxes dropped on pristine lawn — lived-in clutter grounds them.
  function placeYardClutter(): void {
    if (!(P.yardClutter ?? !P.streetRows)) return;
    const yrng = mulberry32(seed + 808);
    function yardSpot(pb: PlacedRadius, rMin: number, rMax: number): [number, number] | null {
      for (let t = 0; t < 8; t++) {
        const a = yrng() * Math.PI * 2, r = pb.rr + rMin + yrng() * (rMax - rMin);
        const x = pb.x + Math.cos(a) * r, z = pb.z + Math.sin(a) * r;
        if (heightField._roadDist(x, z) < 4.5 || noVeg(x, z)) continue;
        if (heightField.getNormalAt(x, z).y < 0.9) continue;
        let clear = true;
        for (const ob of placedB) {
          if (ob !== pb && Math.hypot(x - ob.x, z - ob.z) < ob.rr) { clear = false; break; }
        }
        if (clear) return [x, z];
      }
      return null;
    }
    // world-dressing r1: yard dressing is now the DESTRUCTIBLE inhabiting-
    // object layer — firewood stacks, barrels, troughs, churns, benches,
    // laundry lines and hand carts placed per the map's inhabit config, all
    // instanced + crushable (see the destructible layer above). The garden
    // fence keeps its role as a fence-kit run of breakable modules.
    const INH = P.inhabit || {};
    const yardFence = INH.yardFence || 'fencepicket';
    const placeYardFirewood = (building: PlacedRadius): void => {
      if (yrng() >= 0.6) return;
      const spot = yardSpot(building, 1.2, 3.4);
      if (!spot) return;
      const y = heightField.getHeightAt(spot[0], spot[1]);
      addDestructible('firewood', spot[0], y - 0.03, spot[1], yrng() * Math.PI * 2, 0.9 + yrng() * 0.25);
    };
    const placeYardBarrels = (building: PlacedRadius): void => {
      if (yrng() >= 0.7) return;
      const spot = yardSpot(building, 0.8, 2.6);
      if (!spot) return;
      const count = 1 + ((yrng() * 2) | 0);
      for (let barrelIndex = 0; barrelIndex < count; barrelIndex++) {
        const x = spot[0] + (yrng() - 0.5) * 1.4, z = spot[1] + (yrng() - 0.5) * 1.4;
        const y = heightField.getHeightAt(x, z);
        addDestructible('barrel', x, y - 0.02, z, yrng() * Math.PI * 2, 0.9 + yrng() * 0.25);
      }
    };
    const placeYardTrough = (building: PlacedRadius): void => {
      if (!(INH.troughs ?? 1) || yrng() >= 0.35) return;
      const spot = yardSpot(building, 1.4, 3.2);
      if (!spot) return;
      const y = heightField.getHeightAt(spot[0], spot[1]);
      addDestructible('trough', spot[0], y - 0.03, spot[1], yrng() * Math.PI * 2, 1);
    };
    const placeYardChurns = (building: PlacedRadius): void => {
      if (!(INH.churns ?? 0) || yrng() >= 0.4) return;
      const spot = yardSpot(building, 0.7, 2.0);
      if (!spot) return;
      const y = heightField.getHeightAt(spot[0], spot[1]);
      addDestructible('churn', spot[0], y - 0.01, spot[1], yrng() * Math.PI, 1);
      if (yrng() < 0.6) {
        addDestructible('churn', spot[0] + 0.5,
          heightField.getHeightAt(spot[0] + 0.5, spot[1] + 0.2) - 0.01,
          spot[1] + 0.2, yrng() * Math.PI, 0.95);
      }
    };
    const placeYardLaundry = (building: PlacedRadius): void => {
      if (!(INH.laundry ?? 0) || yrng() >= 0.30) return;
      const spot = yardSpot(building, 2.4, 4.4);
      if (!spot) return;
      const y = heightField.getHeightAt(spot[0], spot[1]);
      addDestructible('laundry', spot[0], y - 0.02, spot[1], yrng() * Math.PI * 2, 1);
    };
    const placeYardHandcart = (building: PlacedRadius): void => {
      if (!(INH.handcarts ?? 1) || yrng() >= 0.25) return;
      const spot = yardSpot(building, 1.6, 3.6);
      if (!spot) return;
      const y = heightField.getHeightAt(spot[0], spot[1]);
      addDestructible('handcart', spot[0], y - 0.02, spot[1], yrng() * Math.PI * 2, 1);
    };
    const placeYardFence = (building: PlacedRadius): void => {
      if (yrng() >= 0.5) return;
      const spot = yardSpot(building, 2.6, 4.4);
      if (!spot) return;
      const yaw = yrng() * Math.PI * 2;
      const tx = Math.cos(yaw), tz = Math.sin(yaw);
      const len = 4.8 + yrng() * 4.8;
      placeFenceRun(yardFence, spot[0] - tx * len / 2, spot[1] - tz * len / 2,
        spot[0] + tx * len / 2, spot[1] + tz * len / 2, 0.2);
    };
    // Settlement detail pass (2026-09-15, owner: "environment and settlement detail beyond the
    // frontline layer"): the lived-in tells that sit close to the walls, all from the existing
    // destructible kinds — a bench with its back to the wall and pots (or a bucket where the map
    // keeps no pottery) on the doorstep, a second woodpile stacked along the wall with its
    // splitting crate, and a bale-and-crate stack by the yard gate on farm maps (crates and a
    // barrel elsewhere).
    // Their own random stream: the batch-1 yard dressing above keeps its exact positions on every
    // seed (the reservoir's waterworks planned around those positions — a shifted barrel at seed
    // 2049 sat in the kiosk footprint when the new rows shared yrng).
    const detailRng = mulberry32(seed + 809);
    const hasPots = (INH.pots ?? 0) > 0;
    const hasBales = (INH.bales ?? 0) > 0;
    // The reservoir's authored waterworks (kiosk, bank, intake and the pipe runs between them)
    // plan their bodies against every destructible already placed; the settlement details stay
    // out of those footprints so the assembly never reads a doorstep bench as a blocker.
    const waterworks = P.reservoirWaterworks;
    const waterworksClear = (x: number, z: number): boolean => {
      if (!waterworks) return true;
      const near = (point: readonly [number, number], radius: number): boolean =>
        Math.hypot(x - point[0], z - point[1]) < radius;
      if (near(waterworks.kiosk, 6) || near(waterworks.bank, 8.5) || near(waterworks.intake, 3.5)) return false;
      const corridor = (a: readonly [number, number], b: readonly [number, number]): boolean => {
        const dx = b[0] - a[0], dz = b[1] - a[1], len2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len2));
        return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < 2.5;
      };
      return !corridor(waterworks.kiosk, waterworks.bank) && !corridor(waterworks.bank, waterworks.intake);
    };
    const detailSpot = (building: PlacedRadius, rMin: number, rMax: number): [number, number] | null => {
      for (let t = 0; t < 8; t++) {
        const a = detailRng() * Math.PI * 2, r = building.rr + rMin + detailRng() * (rMax - rMin);
        const x = building.x + Math.cos(a) * r, z = building.z + Math.sin(a) * r;
        if (heightField._roadDist(x, z) < 4.5 || noVeg(x, z)) continue;
        if (heightField.getNormalAt(x, z).y < 0.9) continue;
        if (!waterworksClear(x, z)) continue;
        let clear = true;
        for (const ob of placedB) {
          if (ob !== building && Math.hypot(x - ob.x, z - ob.z) < ob.rr) { clear = false; break; }
        }
        if (clear) return [x, z];
      }
      return null;
    };
    const placeYardDoorstep = (building: PlacedRadius): void => {
      if (!(INH.doorsteps ?? 1) || detailRng() >= 0.5) return;
      const spot = detailSpot(building, 0.35, 1.1);
      if (!spot) return;
      const y = heightField.getHeightAt(spot[0], spot[1]);
      const toWall = Math.atan2(building.x - spot[0], building.z - spot[1]);
      addDestructible('bench', spot[0], y - 0.03, spot[1], toWall + Math.PI, 0.9 + detailRng() * 0.2);
      const along = toWall + Math.PI / 2;
      const count = 1 + ((detailRng() * 2) | 0);
      for (let i = 0; i < count; i++) {
        const px = spot[0] + Math.sin(along) * (0.95 + i * 0.5), pz = spot[1] + Math.cos(along) * (0.95 + i * 0.5);
        if (heightField._roadDist(px, pz) < 4.0 || noVeg(px, pz)) continue;
        addDestructible(hasPots ? 'pot' : 'bucket', px, heightField.getHeightAt(px, pz) - 0.02, pz,
          detailRng() * Math.PI * 2, hasPots ? 0.7 + detailRng() * 0.3 : 1);
      }
    };
    const placeYardWoodpile = (building: PlacedRadius): void => {
      if (!(INH.woodpiles ?? 1) || detailRng() >= 0.3) return;
      const spot = detailSpot(building, 0.6, 1.8);
      if (!spot) return;
      const y = heightField.getHeightAt(spot[0], spot[1]);
      const yaw = Math.atan2(building.x - spot[0], building.z - spot[1]) + Math.PI / 2;
      addDestructible('firewood', spot[0], y - 0.03, spot[1], yaw, 0.85 + detailRng() * 0.2);
      if (detailRng() < 0.6) {
        const cx = spot[0] + Math.sin(yaw) * 1.3, cz = spot[1] + Math.cos(yaw) * 1.3;
        if (heightField._roadDist(cx, cz) >= 4.0 && !noVeg(cx, cz)) {
          addDestructible('crate', cx, heightField.getHeightAt(cx, cz) - 0.03, cz, yaw + (detailRng() - 0.5) * 0.4, 0.8 + detailRng() * 0.2);
        }
      }
    };
    const placeYardGateStack = (building: PlacedRadius): void => {
      if (!(INH.gateStacks ?? 1) || detailRng() >= 0.25) return;
      const spot = detailSpot(building, 2.0, 3.6);
      if (!spot) return;
      const y = heightField.getHeightAt(spot[0], spot[1]);
      const yaw = detailRng() * Math.PI * 2;
      addDestructible(hasBales ? 'bale' : 'crate', spot[0], y - 0.03, spot[1], yaw, 0.9 + detailRng() * 0.2);
      const sx = spot[0] + Math.sin(yaw) * 1.4, sz = spot[1] + Math.cos(yaw) * 1.4;
      if (heightField._roadDist(sx, sz) >= 4.0 && !noVeg(sx, sz)) {
        addDestructible(hasBales ? 'crate' : 'barrel', sx, heightField.getHeightAt(sx, sz) - 0.03, sz, yaw + 0.3, 0.85 + detailRng() * 0.2);
      }
    };
    for (const building of placedB) {
      if (building.landmark) continue; // a set piece keeps its own ground (the landmarks pass)
      placeYardFirewood(building);
      placeYardBarrels(building);
      placeYardTrough(building);
      placeYardChurns(building);
      placeYardLaundry(building);
      placeYardHandcart(building);
      placeYardFence(building);
      placeYardDoorstep(building);
      placeYardWoodpile(building);
      placeYardGateStack(building);
    }
  }
  placeYardClutter();

  yield;
  // --- low boundary walls (cover) ---
  // world-dressing r1 built these as a styled merged kit; DESTRUCTIBLES r1
  // rebuilds every run as WALL_SEG (3 m) DESTRUCTIBLE MODULES: a tank at
  // speed plows through (crushable obstacle, per-kind momentum scrub, never
  // a hard stop), shells + HE splash breach them LOCALLY (module-granular),
  // and each broken module leaves low crumbled rubble that persists for the
  // battle. Intact modules keep REAL cover value — a per-module collider
  // blocks shells/LOS until it dies with the module. Square END/CORNER POSTS
  // stay static dressing (they anchor breach lips visually), as does the
  // authored gapAt breach (crumbled courses + tumbled blocks).
  // the scenery lane (wave 20, "how things meet the ground"): the walls' feet, drifts and snow loads (fieldWallDressing.ts)
  // (b18; gauntlet wave 121, Verdant's yard walls: "it meets the turf in a clean line with no settling or weeds at its
  // foot") the soil and turf banked against the dry-stone walls' feet (fieldWallDressing buildWallTurf), for the
  // ground's own material beside the boulders' beds — not on a snow map (its drifts), a sandy one (its dust), a
  // brick-print one (its coursed module), nor the phones
  const wallTurfOn = !mobileProps && !snowCap && rockDressing.dust < 0.5 && !sourcedStoneIsBrick(mapId);
  const turfFoldAt = (heightField as { _foldAt?: (x: number, z: number) => number })._foldAt ?? null;
  const wallDressing = createWallDressing({
    ground: heightField, snow: snowCap, mobile: mobileProps, adobeBucket: adobeWallBucket, mudUv: ADOBE_UV_PER_M,
    plainV: adobeWallBucket === 'fieldMud' ? FIELD_MUD_PLAIN_V : undefined,
    adobeApronCoarse: P.adobeApronCoarse === true,
    sand: adobeWallBucket === 'fieldMud' && !!mudEarthOfGround((cfg as { sky?: { lighting?: { groundAlbedoHex?: number } } } | null)?.sky?.lighting?.groundAlbedoHex),
    turf: wallTurfOn ? {
      meshAt: (x, z) => terrainNearMeshHeightAt(nearMeshVertexHeight, x, z), foldAt: turfFoldAt,
    } : undefined,
  });
  function addWallRun(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    gapAt = -1,
  ): void {
    const style = P.wallStyle || 'fieldstone';
    // the posts, the breach stubs and the tumbled blocks are the wall's own stone (the field walls' rubble print) or mud
    const wallB = style === 'adobe' ? wallDressing.adobeBucket : fieldWallBucket;
    const breachUv = style === 'adobe' ? wallDressing.mudUv : 0.7; // (the mud print is one tile a module)
    // brick-style maps route to the stone module (urban's 'stone' texture IS
    // the brick print); adobe keeps its own thicker mud module
    const wallKind = style === 'adobe' ? 'walladobe' : 'wallstone';
    const along = Math.hypot(x1 - x0, z1 - z0);
    const nSeg6 = Math.max(1, Math.round(along / 6)); // legacy gapAt frame
    const nMod = Math.max(1, Math.round(along / WALL_SEG));
    const tx = (x1 - x0) / along, tz = (z1 - z0) / along;
    const yaw = Math.atan2(tx, tz); // module runs along local +z
    const thick = style === 'adobe' ? 0.52 : 0.46;
    const runH = 1.0 + rng() * 0.15; // family height scale
    let prevBuilt = false;
    // the scenery lane (wave 20, "how things meet the ground"): each built island of the run gets its foot — the
    // stones settled at a dry-stone wall's foot, half sunk on both faces, or the mud apron and spalled lumps round an
    // adobe wall — and on a snow map the drift the wind banks against the windward face. Streams of their own, named by
    // the island's place; the props stream draws exactly what it drew.
    let islandFrom = 0;
    function dressIsland(ta: number, tb: number): void {
      if (style !== 'adobe' && sourcedStoneIsBrick(mapId)) return;
      const dressed = wallDressing.island(style === 'adobe', x0 + tx * ta, z0 + tz * ta, x0 + tx * tb, z0 + tz * tb, style === 'adobe' ? thick * 0.5 : 0.23);
      for (const part of dressed.wall) buckets[wallB].push(part);
    }
    function endPost(px: number, pz: number, out: 1 | -1): void {
      const py = heightField.getHeightAt(px, pz) - 0.15;
      const ph = runH * 1.05 + 0.3;
      // the scenery lane (wave 16, "a miniature castle battlement"): a dry-stone run ends in a rubble wall head and a mud
      // wall in an eroded pier, each from a stream named by its place; a square post capped with a slab stays for the
      // brick-print walls. The props stream spends the same draws either way (jitterUV's four).
      if (style === 'adobe' || !sourcedStoneIsBrick(mapId)) {
        const seedAt = (Math.round(px * 73.1) * 92821) ^ Math.round(pz * 41.7) * 68917;
        // (gauntlet wave 52, Verdant's village walls: "the field wall abruptly changes from tan stone to dark … with a hard
        // vertical seam" — two runs meeting at a corner, one face in the sun and one in shade, and nothing between them):
        // where runs meet, the first head there is a corner pier, broader and taller than either wall and bonded like a
        // quoin, and the others are spent unbuilt (the props stream draws the same either way)
        const corner = wallCorners.find((c) => Math.hypot(c.x - px, c.z - pz) < WALL_CORNER_M);
        const pier = !!corner && !corner.built;
        // (a pier stands a stone's breadth proud of both faces and a course over the tallest module: the module is 1.15 m
        // at its family height, scaled up to 6 % more)
        let head = style === 'adobe'
          ? buildAdobePilaster(seedAt, pier ? thick * 1.9 : thick, (ph - 0.15) * (pier ? 1.12 : 1))
          : buildDryStoneWallHead(seedAt, pier ? thick * 2.1 : thick, pier ? runH * 1.15 * 1.06 + 0.24 : runH * 0.98 + 0.12);
        if (wallB === 'fieldStone') wallDressing.stoneUv(head, rng); else jitterUV(head, rng);
        if (corner && !pier) { head.dispose(); return; }
        if (corner) corner.built = true;
        if (wallDressing.snow && style !== 'adobe') head = wallDressing.loadHead(head, seedAt); // its snow, like its module's
        head.rotateY(yaw);
        buckets[wallB].push(head.translate(corner ? corner.x : px, py, corner ? corner.z : pz));
        if (corner) return; // (a corner sheds no stones past an end it does not have)
        // (wave 34, "nothing bedded": the stones the head lost tumbled out past the end; a stream named by its place)
        const fallen = wallDressing.tumble(style === 'adobe', px, pz, tx * out, tz * out, thick * 0.5);
        if (fallen) buckets[wallB].push(fallen);
        return;
      }
      const post = box(thick + 0.22, ph, thick + 0.22, 0.7);
      jitterUV(post, rng);
      buckets[wallB].push(post.translate(px, py + ph / 2, pz));
      buckets[wallB].push(box(thick + 0.34, 0.12, thick + 0.34, 0.8)
        .translate(px, py + ph + 0.05, pz)); // cap slab
    }
    function addBrokenBreach(t0: number, t1: number): void {
      for (const breachT of [0.18, 0.82]) {
        const x = x0 + tx * (t0 + breachT * (t1 - t0));
        const z = z0 + tz * (t0 + breachT * (t1 - t0));
        const y = heightField.getHeightAt(x, z) - 0.15;
        const height = 0.30 + rng() * 0.25;
        const stub = box(thick, height, WALL_SEG * 0.4, breachUv);
        if (wallB === 'fieldStone') wallDressing.stoneUv(stub, rng); else jitterUV(stub, rng);
        stub.rotateY(yaw);
        buckets[wallB].push(stub.translate(x, y + height / 2, z));
      }
      for (let blockIndex = 0; blockIndex < 5; blockIndex++) {
        const breachT = 0.2 + rng() * 0.6;
        const x = x0 + tx * (t0 + breachT * (t1 - t0)) + (rng() - 0.5) * 1.6;
        const z = z0 + tz * (t0 + breachT * (t1 - t0)) + (rng() - 0.5) * 1.6;
        const size = 0.16 + rng() * 0.22;
        const block = roughenChunk(
          box(size * 1.5, size * 0.8, size, style === 'adobe' ? wallDressing.mudUv * 1.6 : 1.2), rng, size * 0.4,
        );
        if (wallB === 'fieldStone') wallDressing.stoneUv(block, rng); else jitterUV(block, rng);
        block.rotateY(rng() * Math.PI);
        block.translate(x, heightField.getHeightAt(x, z) + size * 0.3, z);
        buckets[wallB].push(block);
      }
    }
    function isGapModule(center: number): boolean {
      return gapAt >= 0
        && center >= gapAt * (along / nSeg6)
        && center < (gapAt + 1) * (along / nSeg6);
    }
    function beginsGap(moduleIndex: number, center: number): boolean {
      return moduleIndex === 0 || gapAt < 0
        || (center - WALL_SEG) < gapAt * (along / nSeg6);
    }
    // Classify the original indexed slots before fitting the retained islands.
    // Exclusion boundaries and their posts stay fixed, not merely the number
    // of skipped slots: distributing the entire run would narrow road gaps.
    const exclusions = new Uint8Array(nMod);
    for (let k = 0; k < nMod; k++) {
      const decisionT = (k * WALL_SEG + Math.min((k + 1) * WALL_SEG, along)) / 2;
      const decisionX = x0 + tx * decisionT, decisionZ = z0 + tz * decisionT;
      const inGap = isGapModule(decisionT);
      const skip = heightField._roadDist(decisionX, decisionZ) < 5.5 || noVeg(decisionX, decisionZ)
        || Math.max(Math.abs(decisionX), Math.abs(decisionZ)) > 478;
      exclusions[k] = (inGap ? 1 : 0) | (skip ? 2 : 0);
    }
    const spanEdges = wallIslandEdges(along, exclusions, WALL_SEG);
    for (let k = 0; k < nMod; k++) {
      const inGap = (exclusions[k] & 1) !== 0, skip = (exclusions[k] & 2) !== 0;
      const decisionT = (k * WALL_SEG + Math.min((k + 1) * WALL_SEG, along)) / 2;
      const t0 = exclusions[k] ? k * WALL_SEG : spanEdges[k];
      const t1 = exclusions[k] ? Math.min((k + 1) * WALL_SEG, along) : spanEdges[k + 1];
      const tc = (t0 + t1) / 2;
      const cx = x0 + tx * tc, cz = z0 + tz * tc;
      if (inGap || skip) {
        if (!skip && inGap && beginsGap(k, decisionT)) addBrokenBreach(t0, t1);
        if (prevBuilt) { endPost(x0 + tx * t0, z0 + tz * t0, 1); dressIsland(islandFrom, t0); } // post at the lip
        prevBuilt = false;
        continue;
      }
      if (!prevBuilt) { endPost(x0 + tx * t0, z0 + tz * t0, -1); islandFrom = t0; } // run (re)start
      const ya = heightField.getHeightAt(x0 + tx * t0, z0 + tz * t0);
      const yb = heightField.getHeightAt(x0 + tx * t1, z0 + tz * t1);
      const cy = Math.min(ya, yb);
      const tiltX = Math.atan2(yb - ya, t1 - t0) * 0.85;
      // (wave 20: a run turns some of its modules round — a hash of the module's place, never the props stream — so the
      // kit's one module does not show the same crown and face every three metres; neighbours stand 4 mm apart across
      // the run, so two turned ends never share a face where they overlap)
      const turn = (Math.imul(k + 1, 0x9e3779b1) ^ Math.imul(Math.round(x0 * 8 + z0 * 5), 0x85ebca6b)) >>> 31 ? Math.PI : 0;
      const nudge = k % 2 ? 0.004 : -0.004;
      const record = addDestructible(wallKind, cx + tz * nudge, cy - 0.13, cz - tx * nudge, yaw + turn,
        runH * (0.94 + rng() * 0.12), tiltX, (rng() - 0.5) * 0.02);
      // Preserve seeded placement/breaches. Once the shared kit is built,
      // fit this same slot to a continuous, grounded masonry span.
      wallSpans.set(record, { x0: x0 + tx * t0, z0: z0 + tz * t0,
        x1: x0 + tx * t1, z1: z0 + tz * t1 });
      prevBuilt = true;
    }
    if (prevBuilt) { endPost(x1, z1, 1); dressIsland(islandFrom, along); } // closing post
  }
  const wallCorners: Array<{ x: number; z: number; built: boolean }> = [];
  const wallRuns: WallRun[] = P.wallRuns || [
    [town.x0 + 4, 8, town.x0 + 4, 64, 2],
    [town.x0 + 4, 8, town.x0 + 40, 8, 3],
    [town.x1 - 6, 30, town.x1 - 6, 96, 4],
    [-8, town.z1 - 10, 52, town.z1 - 10, 2],
    [38, town.z0 + 6, 74, town.z0 + 6, 1],
    [-44, 108, -10, 108, 0],
    // midfield field-boundary walls: hull-down/cover lines in the open ground
    [-186, -62, -118, -62, 3],
    [-118, -62, -118, -14, 1],
    [148, -196, 148, -132, 2],
    [-64, 218, 8, 218, 4],
    [196, 108, 258, 108, 2],
    [-266, 66, -212, 66, 1],
    [96, -320, 158, -320, 3],
  ];
  function placeBoundaryWalls(): void {
    // the corners: where two runs' ends meet
    const ends = wallRuns.flatMap((run) => [[run[0], run[1]], [run[2], run[3]]] as Array<[number, number]>);
    for (const [x, z] of ends) {
      if (wallCorners.some((c) => Math.hypot(c.x - x, c.z - z) < WALL_CORNER_M)) continue;
      if (ends.filter(([ex, ez]) => Math.hypot(ex - x, ez - z) < WALL_CORNER_M).length >= 2) wallCorners.push({ x, z, built: false });
    }
    for (const wallRun of wallRuns) {
      addWallRun(wallRun[0], wallRun[1], wallRun[2], wallRun[3], wallRun[4] ?? -1);
    }
  }
  placeBoundaryWalls();

  yield { fine: true, stage: 'boundary-walls' };

  // --- village well near the junction ---
  function placeVillageWell(): void {
    if (!P.well) return;
    let wx = junction.x + 9, wz = junction.z + 7;
    for (let i = 0; i < 20 && heightField._roadDist(wx, wz) < 6.5; i++) { wx += 2; wz += 1; }
    if (heightField._roadDist(wx, wz) < 6.5) {
      // the walk ran out inside a dense street grid and left the well in the carriageway: take the nearest seat round
      // the junction whose ring clears the roads (and the buildings), or no well
      let seat: [number, number] | null = null;
      for (let radius = 10; radius <= 60 && !seat; radius += 5) {
        for (let k = 0; k < 16 && !seat; k++) {
          const a = (k / 16) * Math.PI * 2;
          const px = junction.x + Math.cos(a) * radius, pz = junction.z + Math.sin(a) * radius;
          if (heightField._roadDist(px, pz) >= 6.5
            && !placedB.some((building) => Math.hypot(px - building.x, pz - building.z) < building.rr + 1.5)) seat = [px, pz];
        }
      }
      if (!seat) return;
      [wx, wz] = seat;
    }
    const wy = heightField.getHeightAt(wx, wz);
    const ring = new THREE.CylinderGeometry(1.0, 1.1, 0.9, 10, 1);
    scaleUV(ring, 3, 0.5);
    ring.translate(wx, wy + 0.45, wz);
    buckets.stone.push(ring);
    for (const s of [-1, 1]) {
      const post = box(0.14, 1.9, 0.14);
      post.translate(wx + s * 0.85, wy + 0.95, wz);
      buckets.wood.push(post);
    }
    const wroof = gablePrism(2.4, 0.7, 1.4);
    wroof.rotateY(Math.PI / 2);
    wroof.translate(wx, wy + 1.9, wz);
    buckets.roof.push(wroof);
    obstacles.push(setCircleShape(
      { min: [wx - 1.1, wy, wz - 1.1], max: [wx + 1.1, wy + 2.6, wz + 1.1] }, wx, wz, 1.1));
    colliders.push(setCircleShape(
      { min: [wx - 1.1, wy, wz - 1.1], max: [wx + 1.1, wy + 2.6, wz + 1.1] }, wx, wz, 1.1));
  }
  placeVillageWell();

  yield { fine: true, stage: 'village-well' };

  // --- INHABITING OBJECTS (world-dressing r1): themed destructible dressing
  // per map config zones — market ring on the plaza, working clutter through
  // the village core, hay bales/stooks on the open farmland, oil drums +
  // pallets on industrial aprons, souk pottery/rugs, winter sleds. Density
  // knobs live in cfg.props.inhabit; everything placed here is instanced and
  // destructible (drive-through/knock-over/breakable per class). ---
  function placeInhabitingObjects(): void {
    const inh = P.inhabit || {};
    const overlapsBuilding = (
      x: number,
      z: number,
      padding: number,
      except: PlacedRadius | null = null,
    ): boolean => placedB.some((building) => building !== except
      && Math.hypot(x - building.x, z - building.z) < building.rr + padding);
    // market: stall ring + goods clutter around the junction plaza
    const placeMarketStalls = (): void => {
      const nStalls = richCount(inh.stalls);
      if (nStalls <= 0) return;
      const placeMarketGoods = (x: number, z: number): void => {
        if (drng() < 0.8) scatterDestructibles('crate', x, z, 1, 1.6, 2.6);
        if (drng() < 0.6) scatterDestructibles('barrel', x, z, 1 + ((drng() * 2) | 0), 1.4, 2.8);
        if (drng() < 0.5) {
          scatterDestructibles((inh.pots ?? 0) > 0 ? 'pot' : 'pallet', x, z, 1, 1.5, 2.5);
        }
      };
      let placedSt = 0;
      for (let t = 0; t < nStalls * 14 && placedSt < nStalls; t++) {
        const a = drng() * Math.PI * 2, r = 9 + drng() * 9;
        const x = junction.x + Math.cos(a) * r, z = junction.z + Math.sin(a) * r;
        if (heightField._roadDist(x, z) < 4.2 || noVeg(x, z)) continue;
        if (heightField.getNormalAt(x, z).y < 0.92) continue;
        if (overlapsBuilding(x, z, 0.5)) continue;
        const y = heightField.getHeightAt(x, z);
        // stall faces the plaza center
        addDestructible('stall', x, y - 0.03, z, Math.atan2(junction.x - x, junction.z - z), 0.95 + drng() * 0.15);
        placeMarketGoods(x, z);
        placedSt++;
      }
      // benches around the square
      scatterDestructibles('bench', junction.x, junction.z, richCount(inh.benches, 2), 7, 15, 4.0);
    };
    // village-core work clutter: crates/barrels/pallets between the houses
    const placeCoreClutter = (): void => {
      const coreClutter = richCount(inh.coreClutter);
      if (coreClutter <= 0) return;
      for (let k = 0; k < coreClutter; k++) {
        const x = town.x0 + drng() * (town.x1 - town.x0);
        const z = town.z0 + drng() * (town.z1 - town.z0);
        if (heightField._roadDist(x, z) < 4.0 || noVeg(x, z)) continue;
        if (heightField.getNormalAt(x, z).y < 0.90) continue;
        if (overlapsBuilding(x, z, 0.3)) continue;
        const y = heightField.getHeightAt(x, z);
        const roll = drng();
        const kind = roll < 0.4 ? 'crate' : roll < 0.7 ? 'barrel' : roll < 0.85 ? 'pallet' : 'handcart';
        addDestructible(kind, x, y - 0.03, z, drng() * Math.PI * 2, 0.9 + drng() * 0.25);
      }
    };
    // Open-farmland hay: round bales + harvest stooks scattered on worked land.
    const placeFieldObjects = (): void => {
      const fieldContext: FieldScatterContext = {
        rng: drng,
        village: v,
        heightField,
        noVegetation: noVeg,
        spawns: [L.spawns.player, ...L.spawns.enemies],
        addDestructible,
      };
      const baleCount = richCount(inh.bales);
      const stookCount = richCount(inh.stooks);
      const sledCount = richCount(inh.sleds);
      if (autumnCropRows) {
        autumnFieldContext = fieldContext;
        autumnFieldStart = destructibles.length;
      }
      if (baleCount > 0) scatterFieldProps(fieldContext, 'bale', baleCount);
      if (stookCount > 0) scatterFieldProps(fieldContext, 'stook', stookCount);
      if (autumnCropRows) autumnFieldEnd = destructibles.length;
      if (sledCount > 0) scatterFieldProps(fieldContext, 'sled', sledCount);
    };
    // industrial dressing: oil drums + pallet spots along streets/aprons
    const placeIndustrialDrums = (): void => {
      const drumCount = richCount(inh.drums);
      if (drumCount <= 0) return;
      for (let t = 0, placed = 0; t < drumCount * 16 && placed < drumCount; t++) {
        const x = town.x0 + drng() * (town.x1 - town.x0);
        const z = town.z0 + drng() * (town.z1 - town.z0);
        const rd = heightField._roadDist(x, z);
        if (rd < 3.4 || rd > 14 || noVeg(x, z)) continue;
        if (overlapsBuilding(x, z, 0.3)) continue;
        const y = heightField.getHeightAt(x, z);
        addDestructible('drum', x, y - 0.02, z, drng() * Math.PI * 2, 0.95 + drng() * 0.12);
        if (drng() < 0.5) scatterDestructibles('pallet', x, z, 1 + ((drng() * 2) | 0), 1.0, 2.4);
        if (drng() < 0.35) scatterDestructibles('crate', x, z, 1, 1.2, 2.2);
        placed++;
      }
    };
    // souk dressing: pottery clusters + rug display frames near buildings
    const placeSoukObjects = (): void => {
      const potCount = richCount(inh.pots ?? 0);
      if (potCount <= 0) return;
      // the buildings alone: a set piece's reserved ground (the landmarks pass) is no doorstep, and counting it among the
      // buildings would turn every pick after it — a map's pots, then the rest of the dressing stream
      const soukSites = placedB.some((b) => b.landmark) ? placedB.filter((b) => !b.landmark) : placedB;
      for (let t = 0, placed = 0; t < potCount * 16 && placed < potCount; t++) {
        const pb = soukSites.length ? soukSites[(drng() * soukSites.length) | 0] : null;
        if (!pb) break;
        const a = drng() * Math.PI * 2, r = pb.rr + 0.8 + drng() * 2.6;
        const x = pb.x + Math.cos(a) * r, z = pb.z + Math.sin(a) * r;
        if (heightField._roadDist(x, z) < 3.6 || noVeg(x, z)) continue;
        if (overlapsBuilding(x, z, 0, pb)) continue;
        const y = heightField.getHeightAt(x, z);
        addDestructible(drng() < 0.7 ? 'pot' : 'rugframe', x, y - 0.02, z, drng() * Math.PI * 2, 0.9 + drng() * 0.25);
        placed++;
      }
    };
    placeMarketStalls();
    placeCoreClutter();
    placeFieldObjects();
    placeIndustrialDrums();
    placeSoukObjects();
  }
  placeInhabitingObjects();

  // --- DESTRUCTIBLES r1: soft-vehicle + military-clutter dressing ----------
  yield { stage: 'settlement-dressing' };
  // Supply trucks and utility 4x4s parked on roadside pull-offs and yards
  // (destructible to burnt hulks), fuel-drum clusters with the rare RED
  // explosive drum, ammo-box stacks, and campsite/supply-dump story clusters
  // (tents + firewood + crates + drums) in the off-road clearings where
  // battles funnel. Everything rides the instanced destructible layer.
  function placeMilitaryClutter(): void {
    const inh = P.inhabit || {};
    const vrng = mulberry32(seed + 12007);
    const roadsideContext: RoadsideSpotContext = {
      rng: vrng, roads, heightField, noVegetation: noVeg,
      spawns: L.spawns, placedBuildings: placedB,
    };
    // Heavy roadside vehicles: map-flavored cargo, box-body, and flatbed
    // families. The selector is seeded and bounded to three pools per lane.
    const placeHeavyRoadTraffic = (): void => {
    for (let k = 0, cap = richCount(inh.trucks); k < cap; k++) {
      const spot = findRoadsideSpot(roadsideContext, 5.6, 9.5);
      if (!spot) continue;
      const y = heightField.getHeightAt(spot[0], spot[1]);
      const kind = pickCivilianVehicleKind(mapId, 'heavy', vrng());
      addDestructible(kind, spot[0], y - 0.04, spot[1],
        spot[2] + (vrng() < 0.25 ? (vrng() - 0.5) * 1.6 : (vrng() - 0.5) * 0.3),
        0.96 + vrng() * 0.10);
      // truck stops spill cargo: crates/ammo beside the tailgate
      if (vrng() < 0.6) scatterDestructibles('crate', spot[0], spot[1], 1, 2.6, 4.2);
      if (vrng() < 0.45) scatterDestructibles('ammobox', spot[0], spot[1], 1, 2.4, 4.0);
    }
    };
    placeHeavyRoadTraffic();
    // Light traffic: distinct sedans, wagons, pickups, vans, and utility 4x4s
    // replace the repeated single jeep while keeping the authored count.
    const placeLightRoadTraffic = (): void => {
    for (let k = 0, cap = richCount(inh.jeeps); k < cap; k++) {
      const spot = findRoadsideSpot(roadsideContext, 4.8, 7.5);
      if (!spot) continue;
      const y = heightField.getHeightAt(spot[0], spot[1]);
      const kind = pickCivilianVehicleKind(mapId, 'light', vrng());
      addDestructible(kind, spot[0], y - 0.03, spot[1],
        spot[2] + (vrng() - 0.5) * 0.9, 0.95 + vrng() * 0.1);
    }
    };
    placeLightRoadTraffic();
    // fuel-drum clusters (2-4 drums; ~12% carry one RED explosive drum)
    const placeFuelDrumClusters = (): void => {
    for (let k = 0, cap = richCount(inh.drumClusters); k < cap; k++) {
      const spot = findRoadsideSpot(roadsideContext, 5.0, 12);
      if (!spot) continue;
      const n = 2 + ((vrng() * 3) | 0);
      let redDone = false;
      for (let d = 0; d < n; d++) {
        const a = vrng() * Math.PI * 2, r = vrng() * 1.4;
        const x = spot[0] + Math.cos(a) * r, z = spot[1] + Math.sin(a) * r;
        const y = heightField.getHeightAt(x, z);
        const red = !redDone && vrng() < 0.12;
        if (red) redDone = true;
        addDestructible(red ? 'drumred' : 'drum', x, y - 0.02, z, vrng() * Math.PI * 2, 0.95 + vrng() * 0.1);
      }
      if (vrng() < 0.4) scatterDestructibles('pallet', spot[0], spot[1], 1, 1.6, 3.0);
    }
    };
    placeFuelDrumClusters();
    // Persistent loose dressing: the galvanized churn was the original
    // visually "bouncy gray can". Expand that interaction language into
    // bins, bottles, pails, jerry cans and detached wheels, with a deliberate
    // map-flavored mix. These are sleeping instanced bodies: the count adds
    // scene detail but no per-frame physics until a hull or shell wakes one.
    const industrialLoose = ['trashcan', 'gasbottle', 'jerrycan', 'loosewheel', 'bucket', 'drum'];
    const ruralLoose = ['churn', 'bucket', 'jerrycan', 'loosewheel', 'gasbottle', 'trashcan'];
    const dryLoose = ['jerrycan', 'gasbottle', 'bucket', 'loosewheel', 'trashcan', 'cone'];
    const isIndustrial = mapId === 'urban' || mapId === 'railyard' || mapId === 'foundry' || mapId === 'caldera'
      || mapId === 'copper_mesa' || mapId === 'airfield' || mapId === 'whiteout';
    const isDry = mapId === 'desert' || mapId === 'badlands' || mapId === 'frontier' || mapId === 'oasis';
    const looseKinds: readonly string[] = inh.looseKinds ?? (isIndustrial ? industrialLoose : isDry ? dryLoose : ruralLoose);
    const looseCap = richCount(inh.looseClutter, P.streetRows ? 20 : P.plan.length >= 14 ? 18 : 14);
    const loosePlacement = { authoredSites: looseCap, acceptedSites: 0, placedMembers: 0, kinds: [] as string[] };
    const placedLooseKinds = new Set<string>();
    const placeLooseRoadsideClutter = (): void => {
    for (let k = 0; k < looseCap; k++) {
      const spot = findRoadsideSpot(
        roadsideContext, isIndustrial ? 4.6 : 5.2, isIndustrial ? 12 : 15, 52,
      );
      if (!spot) continue;
      const members = vrng() < 0.42 ? 2 : 1;
      let acceptedMembers = 0;
      for (let j = 0; j < members; j++) {
        const a = vrng() * Math.PI * 2;
        const rr = j ? 0.65 + vrng() * 0.75 : 0;
        const x = spot[0] + Math.cos(a) * rr, z = spot[1] + Math.sin(a) * rr;
        if (noVeg(x, z)) continue;
        const kind = looseKinds[(vrng() * looseKinds.length) | 0];
        addDestructible(kind, x, heightField.getHeightAt(x, z) - 0.015, z,
          vrng() * Math.PI * 2, 0.88 + vrng() * 0.18);
        acceptedMembers++;
        placedLooseKinds.add(kind);
      }
      if (acceptedMembers) loosePlacement.acceptedSites++;
      loosePlacement.placedMembers += acceptedMembers;
    }
    };
    placeLooseRoadsideClutter();
    loosePlacement.kinds = [...placedLooseKinds].sort();
    group.userData.looseClutterPlacement = loosePlacement;
    // campsites / supply dumps: tents, firewood, crates, drums — the "life"
    // clusters at village outskirts and along the approach woods
    const placeSupplyCamps = (): void => {
    const placeSecondCampTent = (cx: number, cz: number, yaw: number): void => {
      if (vrng() >= 0.7) return;
      const angle = yaw + Math.PI * (0.6 + vrng() * 0.5);
      const x = cx + Math.cos(angle) * (4 + vrng() * 2);
      const z = cz + Math.sin(angle) * (4 + vrng() * 2);
      if (heightField._roadDist(x, z) <= 4.5 || noVeg(x, z)) return;
      addDestructible('tent', x, heightField.getHeightAt(x, z) - 0.03, z,
        angle + Math.PI + (vrng() - 0.5) * 0.5, 0.9 + vrng() * 0.15);
    };
    const placeCampFireRing = (cx: number, cz: number): void => {
      const stoneCount = 5 + ((vrng() * 3) | 0);
      const y = heightField.getHeightAt(cx + 2.6, cz + 1.4);
      for (let stoneIndex = 0; stoneIndex < stoneCount; stoneIndex++) {
        const angle = (stoneIndex / stoneCount) * Math.PI * 2;
        const stone = box(0.22 + vrng() * 0.1, 0.18, 0.2, 1.4);
        jitterUV(stone, vrng);
        stone.rotateY(vrng() * Math.PI);
        stone.translate(cx + 2.6 + Math.cos(angle) * 0.55,
          y + 0.08, cz + 1.4 + Math.sin(angle) * 0.55);
        buckets.stone.push(stone);
      }
    };
    const placeCampCargo = (cx: number, cz: number): void => {
      scatterDestructibles('firewood', cx, cz, 1, 2.2, 4.5);
      scatterDestructibles('crate', cx, cz, 1 + ((vrng() * 2) | 0), 2.4, 5.5);
      scatterDestructibles('ammobox', cx, cz, 1 + ((vrng() * 2) | 0), 2.0, 5.0);
      if (vrng() < 0.5) {
        scatterDestructibles('drum', cx, cz, 1 + ((vrng() * 2) | 0), 3.0, 6.0);
      }
    };
    const placeParkedCampVehicle = (cx: number, cz: number): void => {
      if (vrng() >= 0.35) return;
      const angle = vrng() * Math.PI * 2;
      const x = cx + Math.cos(angle) * (6.5 + vrng() * 2);
      const z = cz + Math.sin(angle) * (6.5 + vrng() * 2);
      const supported = heightField._roadDist(x, z) > 4.6
        && !noVeg(x, z) && heightField.getNormalAt(x, z).y > 0.9;
      if (!supported) return;
      const lane = vrng() < 0.5 ? 'light' : 'heavy';
      addDestructible(pickCivilianVehicleKind(mapId, lane, vrng()), x,
        heightField.getHeightAt(x, z) - 0.04, z, vrng() * Math.PI * 2, 0.95);
    };
    for (let k = 0, cap = richCount(inh.camps); k < cap; k++) {
      const spot = findRoadsideSpot(roadsideContext, 10, 26, 60);
      if (!spot) continue;
      const [cx, cz] = spot;
      const yawC = vrng() * Math.PI * 2;
      const y0 = heightField.getHeightAt(cx, cz);
      addDestructible('tent', cx, y0 - 0.03, cz, yawC, 0.95 + vrng() * 0.15);
      placeSecondCampTent(cx, cz, yawC);
      placeCampFireRing(cx, cz);
      placeCampCargo(cx, cz);
      placeParkedCampVehicle(cx, cz);
    }
    };
    placeSupplyCamps();
    // Modern roadside and industrial vocabulary: concrete vehicle barriers,
    // signs, cones, transformer cabinets and cable reels. Every piece uses an
    // existing instanced destructible pool, so a count of 40 still costs five
    // draw calls rather than forty and remains idle until actually hit.
    const modernCfg = inh.modernClutter ?? 0;
    const authoredModernKinds = typeof modernCfg === 'object' && modernCfg
      ? Object.entries(modernCfg).flatMap(([kind, count]) =>
        Array.from({ length: Math.max(0, count | 0) }, () => kind))
      : null;
    // Authored legacy-map backports guarantee every vocabulary family while
    // retaining seeded variety in where those families land. Numeric budgets
    // keep the original weighted selection path byte-for-byte unchanged.
    const shuffleAuthoredModernKinds = (): void => {
      if (!authoredModernKinds) return;
      for (let i = authoredModernKinds.length - 1; i > 0; i--) {
        const j = (vrng() * (i + 1)) | 0;
        [authoredModernKinds[i], authoredModernKinds[j]] =
          [authoredModernKinds[j], authoredModernKinds[i]];
      }
    };
    shuffleAuthoredModernKinds();
    const modernCap = authoredModernKinds
      ? authoredModernKinds.length : typeof modernCfg === 'number' ? modernCfg : 0;
    const selectModernKind = (index: number): string => {
      if (authoredModernKinds) return authoredModernKinds[index];
      const roll = vrng();
      if (roll < 0.25) return 'barrier';
      if (roll < 0.45) return 'roadsign';
      if (roll < 0.70) return 'cone';
      return roll < 0.84 ? 'transformer' : 'cablespool';
    };
    const extendModernArrangement = (
      kind: string,
      x: number,
      z: number,
      yaw: number,
    ): void => {
      if (kind === 'barrier' && vrng() < 0.6) {
        const lx = Math.cos(yaw), lz = -Math.sin(yaw);
        const partners = 1 + ((vrng() * 2) | 0);
        for (let index = 1; index <= partners; index++) {
          const bx = x + lx * 2.75 * index, bz = z + lz * 2.75 * index;
          if (noVeg(bx, bz)) continue;
          addDestructible('barrier', bx, heightField.getHeightAt(bx, bz) - 0.03,
            bz, yaw + (vrng() - 0.5) * 0.12, 0.92 + vrng() * 0.12);
        }
      } else if (kind === 'cone') {
        scatterDestructibles('cone', x, z, 1 + ((vrng() * 3) | 0), 0.7, 2.5);
      }
    };
    const placeModernRoadsideClutter = (): void => {
    for (let k = 0; k < modernCap; k++) {
      const spot = findRoadsideSpot(roadsideContext, 5.0, 13.5, 52);
      if (!spot) continue;
      const [mx, mz, myaw] = spot;
      const kind = selectModernKind(k);
      const y = heightField.getHeightAt(mx, mz);
      addDestructible(kind, mx, y - 0.03, mz,
        myaw + (vrng() - 0.5) * (kind === 'barrier' ? 0.18 : 0.7),
        0.9 + vrng() * 0.18);
      // Checkpoint barriers and work-zone cones read as arrangements rather
      // than isolated props. Partners keep the same seeded placement path.
      extendModernArrangement(kind, mx, mz, myaw);
    }
    };
    placeModernRoadsideClutter();
  }
  placeMilitaryClutter();

  yield { fine: true, stage: 'military-clutter' };

  // --- hay bales + crates near buildings (world-dressing r1: instanced
  // DESTRUCTIBLES — a hull crushes them, shells burst them, hay puffs) ---
  function placeHayAndCrates(): void {
    // environment density pass 2 (2026-09-12): farm maps dress more yards
    // (a map's own props.hayCrateSites overrides the table)
    const hayCrateSites = Math.max(0, Math.round(P.hayCrateSites ?? HAY_CRATE_SITES[mapId] ?? 5));
    for (let i = 0; P.hayCrates && i < Math.min(hayCrateSites, placedB.length); i++) {
      const pb = placedB[i];
      if (pb.landmark) continue;
      const n = 1 + ((rng() * 3) | 0);
      for (let k = 0; k < n; k++) {
        const a = rng() * Math.PI * 2, r = pb.rr + 2 + rng() * 4;
        const x = pb.x + Math.cos(a) * r, z = pb.z + Math.sin(a) * r;
        if (heightField._roadDist(x, z) < 4.5) continue;
        const y = heightField.getHeightAt(x, z);
        addDestructible(rng() < 0.5 ? 'bale' : 'crate', x, y - 0.03, z,
          rng() * Math.PI, 0.9 + rng() * 0.3);
      }
    }
  }
  placeHayAndCrates();

  yield { fine: true, stage: 'hay-and-crates' };

  // --- wooden fence runs + telegraph poles along the roads ---
  // world-dressing r1: road fences are now DESTRUCTIBLE fence-kit modules
  // (per-map type, drive-through-able like saplings, shell-breakable) with
  // the odd open gate where field entrances meet the road.
  const utilityPolePlacements: UtilityPolePlacementReceipt[] = [];
  function placeRoadsideUtilities(): UtilityNetwork | null {
    const roadsL = L.roads;
    const roadFence = (P.inhabit && P.inhabit.roadFence) || 'fenceplank';
    function fenceRun(
      road: number,
      i0: number,
      i1: number,
      side: number,
    ): void {
      const nodes = roadsL[road], count = authoredRoadStationCount(L, road);
      for (let i = i0; i < i1 && i < count - 1; i++) {
        const at = authoredRoadStationIndex(L, road, i);
        if (at < 0) continue;
        if (L.roadStations?.[road]?.indices) {
          const next = authoredRoadStationIndex(L, road, i + 1, 0, 0);
          if (next <= at) continue;
          const path = roadFencePath(nodes, at, next, side * 7.6);
          const first = path[0], last = path[path.length - 1];
          // One run/seeded module sequence per physical station interval,
          // regardless of how many chords tessellate its turning arc.
          placeFenceRun(roadFence, first[0], first[1], last[0], last[1], 0.30, path);
          continue;
        }
        const [ax, az] = nodes[at], [bx, bz] = nodes[at + 1];
        const dx = bx - ax, dz = bz - az;
        const len = Math.hypot(dx, dz);
        const tx = dx / len, tz = dz / len;
        const ox = -tz * side * 7.6, oz = tx * side * 7.6;
        placeFenceRun(roadFence, ax + ox, az + oz, bx + ox, bz + oz, 0.30);
      }
    }
    function placeRoadFenceLines(): void {
      if (!P.fences || roadsL.length < 2) return;
      fenceRun(0, 11, 14, -1); // village approach, west side
      fenceRun(0, 20, 23, 1);  // north exit, east side
      fenceRun(1, 9, 12, -1);  // west field edge
      fenceRun(1, 20, 23, 1);  // east field edge
    }
    placeRoadFenceLines();
    // telegraph poles marching along road A — tapered round poles with twin
    // cross-arms and a brace, planted dead vertical
    // r7 terrain_environment: whiteCap remaps the model's 0.90-white insulator
    // caps to dark glazed glass-green — they rendered as blown "daytime
    // streetlamp" blobs on every pole (player_view critique)
    // The source model is a whole two-station segment: two posts roughly
    // 9.5 source metres apart plus conductor faces between them. Use its
    // near-post slice as the physical primitive, then let terrain policy and
    // the live utility network decide whether a station has one or two posts.
    // the scenery lane (after wave 57, Frosthollow's "beige column"): its wood is marked for the poles' timber material
    // (poleTimber.ts) on a clone — the baked source stays cached unmarked; wave 66 ("a straight, flat-faced,
    // constant-width beam"): its shaft round, smooth and tapered first
    const poleGeo = SOURCED.poles && P.telegraph
      ? markPoleTimber(roundPoleShaft(bakedGeometry('telephone_pole_polygoogle',
        {
          targetH: 7.4, sink: 0.15, sourceZMin: -1,
          whiteCap: [0.14, 0.21, 0.16],
        }).clone())) : null;
    // r4 terrain_environment: record pole stations — catenary WIRES are strung
    // between consecutive poles below (the bare pole line was a critique item:
    // "telephone poles have no visible wires, they read as bare sticks")
    const poleLine: Array<{
      x: number;
      y: number;
      z: number;
      yaw: number;
      sourced: boolean;
      attachH: number;
      instanceIndex?: number;
    }> = [];
    type UtilityPoleStation = ReturnType<typeof planUtilityPoleStation>;
    type UtilityPolePost = UtilityPoleStation['primary'];
    const addUtilityPole = (post: UtilityPolePost, station: UtilityPoleStation): void => {
      const networkIndex = poleLine.length;
      const poleRec: (typeof poleLine)[number] = {
        x: post.x, y: post.y, z: post.z, yaw: station.yaw,
        sourced: !!SOURCED.poles, attachH: SOURCED.poles ? 6.5 : 5.75,
      };
      poleLine.push(poleRec);
      if (SOURCED.poles) {
        addBakedInstance('pole', poleGeo!, post.x, post.y, post.z, station.yaw, 1);
        poleRec.instanceIndex = bakedInstances.get('pole')!.list.length - 1;
        crushables.push({
          x: post.x, y: post.y, z: post.z, r: 0.45, h: 7.4,
          index: poleRec.instanceIndex, wirePoleIndex: networkIndex, toppled: false,
        });
        return;
      }
      const pole = new THREE.CylinderGeometry(0.09, 0.17, 6.2, 7, 1);
      scaleUV(pole, 0.8, 3.0);
      pole.translate(post.x, post.y + 3.0, post.z);
      buckets.wood.push(pole);
      for (const armY of [5.75, 5.15]) {
        const arm = box(1.5, 0.11, 0.09, 1.0);
        arm.rotateY(station.yaw);
        arm.translate(post.x, post.y + armY, post.z);
        buckets.wood.push(arm);
        for (const side of [-1, 1]) {
          const peg = box(0.07, 0.16, 0.07, 2.0);
          peg.rotateY(station.yaw);
          peg.translate(post.x + Math.cos(station.yaw) * 0.6 * side,
            post.y + armY + 0.13, post.z - Math.sin(station.yaw) * 0.6 * side);
          buckets.wood.push(peg);
        }
      }
      const brace = box(0.06, 1.1, 0.06, 1.5);
      brace.rotateZ(0.6);
      brace.rotateY(station.yaw);
      brace.translate(post.x + Math.cos(station.yaw) * 0.26,
        post.y + 4.8, post.z - Math.sin(station.yaw) * 0.26);
      buckets.wood.push(brace);
    };
    // r5 terrain_environment: poles every node (~32 m, was every 2nd). The
    // 64 m spans cut CHORDS across the road's curves — one span slashed
    // diagonally through the default chase-cam frame as a hard black line
    // (critique). Short spans follow the carriageway; the wires read as
    // roadside infrastructure instead of a graphical artifact.
    function placeUtilityPoles(): void {
    for (let i = 8; P.telegraph && i < authoredRoadStationCount(L, 0) - 1; i += 1) {
      const at = authoredRoadStationIndex(L, 0, i);
      if (at < 0) continue;
      const [ax, az] = roadsL[0][at], [bx, bz] = roadsL[0][at + 1];
      const tl = Math.hypot(bx - ax, bz - az);
      const tx = (bx - ax) / tl, tz = (bz - az) / tl;
      const px = ax - tz * 6.9, pz = az + tx * 6.9;
      if (Math.max(Math.abs(px), Math.abs(pz)) > 470 || noVeg(px, pz)) continue;
      const partnerX = px + tx * 6.5, partnerZ = pz + tz * 6.5;
      const allowPair = Math.max(Math.abs(partnerX), Math.abs(partnerZ)) <= 470
        && !noVeg(partnerX, partnerZ);
      const station = planUtilityPoleStation(heightField, px, pz, tx, tz, { allowPair });
      const physicalPoles = station.partner
        ? [station.primary, station.partner] : [station.primary];
      utilityPolePlacements.push({
        station: i,
        paired: station.paired,
        pairRelief: station.pairRelief,
        yaw: station.yaw,
        poles: physicalPoles.map((post) => ({
          x: post.x, y: post.y, z: post.z,
          supportMin: post.support.min,
          supportMax: post.support.max,
          supportSpread: post.support.spread,
        })),
      });
      for (const post of physicalPoles) {
        addUtilityPole(post, station);
      }
    }
    }
    placeUtilityPoles();
    // Catenary topology. Geometry is instantiated after material finalization;
    // keeping the spans out of the static dark bucket lets adjacent wires be
    // pulled down by a toppled pole without unmerging the rest of the world.
    function collectWireSpans(): Array<readonly [number, number]> {
      const wireSpans: Array<readonly [number, number]> = [];
      for (let pi = 0; pi + 1 < poleLine.length; pi++) {
        const A = poleLine[pi], B = poleLine[pi + 1];
        const spanL = Math.hypot(B.x - A.x, B.z - A.z);
        if (spanL > 52 || spanL < 6) continue; // a skipped pole leaves the span unstrung
        wireSpans.push([pi, pi + 1]);
      }
      return wireSpans;
    }
    const wireSpans = collectWireSpans();
    const network = wireSpans.length ? createUtilityNetwork(poleLine, wireSpans) : null;
    // DESTRUCTIBLES r1: telegraph-pole DEBRIS — every pole line lost a few
    // to the shelling: a snapped stump, the felled pole across the verge
    // with its crossarm splayed, a coil of downed wire. Static dressing
    // (no collision) that sells the fought-over road.
    function placeFelledUtilityPoles(): void {
      if (!P.telegraph || poleLine.length <= 3) return;
      const prng2 = mulberry32(seed + 4407);
      const nDebris = Math.min(3, (poleLine.length / 5) | 0);
      for (let d = 0; d < nDebris; d++) {
        const pl = poleLine[(prng2() * poleLine.length) | 0];
        const ox = pl.x + (prng2() - 0.5) * 4, oz = pl.z + (prng2() - 0.5) * 4;
        if (Math.max(Math.abs(ox), Math.abs(oz)) > 460 || noVeg(ox, oz)) continue;
        if (heightField._roadDist(ox, oz) < 4.2) continue;
        const stumpSupport = sampleDiscGround(heightField, ox, oz, 0.17, 0.03);
        const oy = stumpSupport.y;
        const yawD = prng2() * Math.PI * 2;
        // snapped stump
        const stump = new THREE.CylinderGeometry(0.13, 0.17, 0.9 + prng2() * 0.6, 7, 1);
        scaleUV(stump, 0.8, 1.0);
        stump.rotateZ((prng2() - 0.5) * 0.24);
        stump.translate(ox, oy + 0.45, oz);
        buckets.wood.push(stump);
        // Felled poles are long enough to span a verge shoulder. Align the
        // rigid body to terrain at both ends instead of floating its far end
        // from the stump's one center sample.
        const fallLength = 5.6 + prng2() * 1.2;
        const dirX = Math.sin(yawD), dirZ = Math.cos(yawD);
        const fallX = ox + dirX * (fallLength * 0.5 + 0.4);
        const fallZ = oz + dirZ * (fallLength * 0.5 + 0.4);
        const fallPose = planGroundedSegment(
          heightField, fallX, fallZ, dirX, dirZ, fallLength, 0.13, 0.02,
        );
        const fall = new THREE.CylinderGeometry(0.09, 0.15, fallLength, 7, 1);
        scaleUV(fall, 0.8, 3.0);
        _quat.setFromUnitVectors(_upAxis,
          _posv.set(fallPose.axisX, fallPose.axisY, fallPose.axisZ));
        fall.applyQuaternion(_quat);
        fall.translate(fallPose.x, fallPose.y, fallPose.z);
        buckets.wood.push(fall);
        decorationGroundingReceipts.push({
          kind: 'felled-utility-pole', x: fallPose.x, y: fallPose.y, z: fallPose.z,
          relief: fallPose.relief, baseClearance: -0.02,
          start: fallPose.start, end: fallPose.end,
        });
        const arm = box(1.4, 0.10, 0.09, 1.0); // crossarm knocked loose
        arm.rotateY(yawD + 0.5 + prng2());
        arm.translate(fallPose.end.x, fallPose.end.support.min + 0.05, fallPose.end.z);
        buckets.wood.push(arm);
      }
    }
    placeFelledUtilityPoles();
    return network;
  }
  utilityNetwork = placeRoadsideUtilities();

  yield { fine: true, stage: 'roadside-utilities' };

  // --- rocks (instanced, 3 variants) ---
  // The r3/r7 displaced icosahedra (three noise octaves and a ridged crease octave) no longer draw: they are the legacy
  // rocks whose projected hulls the collision shards carry and whose height their colliders stand for, so they are
  // still built for both. The visual rock is rockDressing.ts buildBoulderForm, fitted inside them (the scenery lane,
  // 2026-10-04).
  const rockClutter = new Map<THREE.Matrix4, CrushableClutter>();
  const rockGeos: THREE.BufferGeometry[] = [];
  // the scenery lane (wave 74, the cascade trim): on the desktop each rock's phone form too (270 triangles against 672),
  // for the far rocks and the far shadow cascades
  const rockGeosFar: THREE.BufferGeometry[] = [];
  const rockHulls: number[][] = [];
  // the hitbox lane (2026-10-07): each variant's collision form (rockCollision.ts) and every stone's seat; the colliders
  // come from the stone's own mesh once every placement pass has run (refitRockColliders)
  const rockForms: RockForm[] = [];
  const rockSeats: RockSeat[] = [];
  function buildRockVariants(): void {
  for (let vi = 0; vi < 3; vi++) {
    const g = mergeVertices(new THREE.IcosahedronGeometry(1, vi === 2 ? 3 : 2));
    const p = g.attributes.position;
    const tmpv = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      tmpv.set(p.getX(i), p.getY(i), p.getZ(i));
      const ridge = 1 - Math.abs(noi.noise3d(
        tmpv.x * 2.2 + vi * 31, tmpv.y * 2.2 - 7, tmpv.z * 2.2 + 13));
      const crease = Math.pow(ridge, 5); // sharp valley lines
      const f = 1
        + noi.noise3d(tmpv.x * 1.4 + vi * 9, tmpv.y * 1.4, tmpv.z * 1.4) * 0.30
        + noi.noise3d(tmpv.x * 3.1 - vi * 17, tmpv.y * 3.1 + 40, tmpv.z * 3.1) * 0.13
        + noi.noise3d(tmpv.x * 6.8 + 91, tmpv.y * 6.8 - vi * 5, tmpv.z * 6.8) * 0.05
        - crease * 0.115; // carved fracture valleys
      tmpv.multiplyScalar(f);
      tmpv.y = Math.max(tmpv.y, -0.55);
      p.setXYZ(i, tmpv.x, tmpv.y * 0.82, tmpv.z);
    }
    const projected: Array<[number, number]> = [];
    for (let i = 0; i < p.count; i++) projected.push([p.getX(i), p.getZ(i)]);
    const hull = convexHull2(projected);
    rockHulls.push(hull); // the collision proxy of the placement laws (the road core, the talus, the no-overlap law); the colliders are the stone's own (rockCollision.ts)
    // the scenery lane (wave 52, "low-poly polyhedra … a hard diagonal shading seam … none sunk into the ground"): the
    // visual rock is a block its joints cut and the weather rounded (rockDressing.ts buildBoulderForm: the smooth maximum
    // of its joint planes, lumped, its foot flared under the ground line, the surface's own normals), fitted inside the
    // legacy hull above the ground line and as tall as the legacy rock; its tone by face, fracture and arris (paintBoulder)
    let legacyTop = 0;
    for (let i = 0; i < p.count; i++) legacyTop = Math.max(legacyTop, p.getY(i));
    const lithology = rockLithologyFor(mapId);
    const angular = rockAngularityFor(mapId);
    const form = buildBoulderForm(vi, noi, mulberry32(seed + 60 + vi), hull, mobileProps ? 4 : 6, legacyTop, boulderKindFor(lithology, vi), lithology, angular);
    paintBoulder(form, P.rockTone, lithology);
    rockGeos.push(form.geometry);
    // (the desktop form on every tier, so every host derives the same colliders; its own stream, so no draw moves)
    const collisionForm = mobileProps
      ? buildBoulderForm(vi, noi, mulberry32(seed + 60 + vi), hull, 6, legacyTop, boulderKindFor(lithology, vi), lithology).geometry
      : form.geometry;
    rockForms.push(rockFormOf(collisionForm));
    if (collisionForm !== form.geometry) collisionForm.dispose();
    if (!mobileProps) {
      const far = buildBoulderForm(vi, noi, mulberry32(seed + 60 + vi), hull, 4, legacyTop, boulderKindFor(lithology, vi), lithology, angular);
      paintBoulder(far, P.rockTone, lithology);
      rockGeosFar.push(far.geometry);
    }
    g.dispose();
  }
  }
  buildRockVariants();

  yield { fine: true, stage: 'rock-variants' };
  const rockPlacements: THREE.Matrix4[][] = [[], [], []];
  const rockTalus = P.rockTalusDeg === undefined ? TALUS_DEG : P.rockTalusDeg;
  // The no-overlap law (the mountains lane, 2026-10-04, gauntlet wave 52: "polyhedra that pass through each other"):
  // the scaled, turned hulls of the boulders placed so far, on a 16 m grid. A candidate whose hull reaches more than
  // 5 cm into one of them is pushed clear of it (tryRock), else left out.
  const placedRockHulls = new Map<number, Array<{ x: number; z: number; r: number; pts: number[] }>>();
  let placedRockReach = 0;
  const rockCell = (c: number): number => Math.floor(c / 16);
  const rockCellKey = (cx: number, cz: number): number => (cx + 512) * 1024 + (cz + 512);
  function deepestPlacedOverlap(x: number, z: number, r: number, pts: number[]): { depth: number; ax: number; az: number } | null {
    const reach = r + placedRockReach;
    let deepest: { depth: number; ax: number; az: number } | null = null;
    for (let cx = rockCell(x - reach); cx <= rockCell(x + reach); cx++) {
      for (let cz = rockCell(z - reach); cz <= rockCell(z + reach); cz++) {
        for (const o of placedRockHulls.get(rockCellKey(cx, cz)) ?? []) {
          if (Math.hypot(o.x - x, o.z - z) >= o.r + r) continue;
          const sep = hullSeparation(pts, o.pts);
          if (sep && sep.depth > 0.05 && (!deepest || sep.depth > deepest.depth)) deepest = sep;
        }
      }
    }
    return deepest;
  }
  function addPlacedRock(x: number, z: number, r: number, pts: number[]): void {
    const key = rockCellKey(rockCell(x), rockCell(z));
    let list = placedRockHulls.get(key);
    if (!list) placedRockHulls.set(key, list = []);
    list.push({ x, z, r, pts });
    placedRockReach = Math.max(placedRockReach, r);
  }
  // A boulder's site: inside the square's scatter margin, off the village and the road, on firm ground clear of the
  // vegetation, away from the spawns — and, for a re-site, clear of the road core and resting on the talus.
  // the map-revival lane (2026-10-06, Tidegate Polders): a map may keep its scattered stone off the zone-control discs
  // (their authored hints, 33 m), so a rock re-rolled by its rebuilt ground never pushes a zone off its apron
  const rockKeepDiscs = P.rocksKeepOffZones
    ? (MATCH_OBJECTIVE_LAYOUTS[mapId]?.zones ?? []).map((zone) => [zone.x, zone.z, 33] as const) : [];
  function rockSiteOpen(x: number, z: number): boolean {
    if (Math.max(Math.abs(x), Math.abs(z)) > 485) return false;
    for (const [dx, dz, r] of rockKeepDiscs) if (Math.hypot(x - dx, z - dz) < r) return false;
    if (x > v.x0 - 8 && x < v.x1 + 8 && z > v.z0 - 8 && z < v.z1 + 8) return false;
    if (heightField._roadDist(x, z) < 6) return false;
    if (heightField.getGroundType(x, z) === 'soft' || noVeg(x, z)) return false;
    for (const s of [L.spawns.player, ...L.spawns.enemies]) {
      if (Math.hypot(x - s.x, z - s.z) < 16) return false;
    }
    return true;
  }
  function rockResiteHolds(x: number, z: number, reach: number): boolean {
    return rockSiteOpen(x, z) && discClearOfRoadCore(heightField, x, z, reach)
      && (rockTalus === null || restsOnTalus(heightField, x, z, reach, rockTalus));
  }
  // The talus law's re-site: a block that cannot rest where it fell slides down its fall line in 2 m steps, up to 40 m,
  // to the first ground it rests on (the foot of the wall, where real talus lies); null when none holds.
  function slideToTalus(x: number, z: number, reach: number): [number, number] | null {
    let px = x, pz = z;
    for (let step = 0; step < 20; step++) {
      const n = heightField.getNormalAt(px, pz), hx = n.x, hz = n.z, h = Math.hypot(hx, hz);
      if (h < 1e-4) return null;
      px += hx / h * 2; pz += hz / h * 2;
      if (rockResiteHolds(px, pz, reach)) return [px, pz];
    }
    return null;
  }
  function tryRock(
    x: number,
    z: number,
    scMin: number,
    scMax: number,
    slopePref: boolean,
    sink = 0.22,
    tactical = false,
    // (the hitbox lane, 2026-10-08: an authored outcrop draws on its own stream, so no stone placed after it moves)
    draw: Rng = rng,
  ): boolean {
    const vv = (draw() * 3) | 0;
    const yawR = draw() * Math.PI * 2;
    const sc = scMin + Math.pow(draw(), 1.6) * (scMax - scMin);
    if (!rockSiteOpen(x, z)) return false;
    if (slopePref) {
      const steep = heightField.getNormalAt(x, z).y < 0.93;
      if (!steep && draw() > 0.30) return false; // prefer rocky slopes
    }
    // (the stone's height scale, drawn where the seat's matrix always drew it, so a re-site takes no draw of its own)
    const scaleY = sc * (0.8 + draw() * 0.35);
    // The boulder keeps its whole footprint (the collision hull) out of the road core. One that would reach into it is
    // left out, its draws still taken and its count kept, so every later placement keeps its seat.
    const hull = rockHulls[vv];
    let hullReach = 0;
    for (let i = 0; i < hull.length; i += 2) hullReach = Math.max(hullReach, Math.hypot(hull[i], hull[i + 1]));
    const reach = hullReach * sc;
    if (!discClearOfRoadCore(heightField, x, z, reach)) return true;
    // symmetric deployments: a scatter boulder in a deployment slot's clearing is left out the same way (the pads' 16 m)
    if (!tactical && deploymentSlots.some((slot) => Math.hypot(x - slot.x, z - slot.z) < 16)) return true;
    // The talus law (rockTalusDeg, default 35 degrees): a boulder whose footprint falls away more steeply than a talus
    // slope — on a wall, astride a ledge's lip or on a narrow bench — slides down its fall line to the first ground it
    // rests on (2 m steps, 40 m at most), every site rule rechecked; left out the same way only when none holds. The
    // re-site draws nothing, so every later placement keeps its seat.
    if (rockTalus !== null && !restsOnTalus(heightField, x, z, reach, rockTalus)) {
      const foot = slideToTalus(x, z, reach);
      if (!foot) return true;
      [x, z] = foot;
    }
    // The no-overlap law: a boulder that would pass through one placed before it is pushed clear along their separation
    // (the depth and 0.2 m, three tries at most, every site rule rechecked); left out only when it cannot clear.
    let footprint = turnedRockHull(hull, x, z, sc, yawR);
    for (let push = 0; ; push++) {
      const hit = deepestPlacedOverlap(x, z, reach, footprint);
      if (!hit) break;
      if (push === 3) return true;
      x += hit.ax * (hit.depth + 0.2); z += hit.az * (hit.depth + 0.2);
      if (!rockResiteHolds(x, z, reach)) return true;
      footprint = turnedRockHull(hull, x, z, sc, yawR);
    }
    const y = heightField.getHeightAt(x, z) - sink * sc;
    _quat.setFromAxisAngle(_upAxis, yawR);
    // (b14; Sonnet, wave 97: "the smaller boulders … identical in shape and size") one of the stone's horizontal axes
    // drawn in by its place's hash, to three quarters: three forms read as many, and the stone stays inside the hull its
    // collider carries (no draw, so every later placement keeps its seat)
    const stretchRoll = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
    const stretch = 0.74 + 0.26 * ((stretchRoll * 7.31) % 1);
    _mat4.compose(_posv.set(x, y, z), _quat, _scalev.set(stretchRoll < 0.5 ? sc * stretch : sc, scaleY, stretchRoll < 0.5 ? sc : sc * stretch));
    const placement = _mat4.clone();
    rockPlacements[vv].push(placement);
    addPlacedRock(x, z, reach, footprint);
    // (the hitbox lane: every stone's seat; the records below are the legacy ones every placement pass reads)
    const seat: RockSeat = { vv, placement, x, y, z, sc, sink, tactical, rec: null, col: null, clutter: null, profile: null };
    rockSeats.push(seat);
    // sink <= 0.5: half-drifted surface rocks keep their cover role; only the
    // deep-embedded ground-clutter class (0.60) is drive-over
    if (sc >= 1.25 && sink <= 0.5) {
      // The old square ±1.15*scale AABB made its four empty corners solid;
      // at a 3 m outcrop that stopped a hull more than a metre from the
      // visible stone. Use the displaced mesh's actual projected convex hull.
      // (the hitbox lane, 2026-10-07: the legacy record every later placement pass reads; refitRockColliders gives it the
      // stone's own colliders once they have all run)
      const c = Math.cos(yawR), s = Math.sin(yawR);
      const local = rockHulls[vv];
      const points = new Array(local.length);
      for (let i = 0; i < local.length; i += 2) {
        const lx = local[i] * sc, lz = local[i + 1] * sc;
        points[i] = x + lx * c + lz * s;
        points[i + 1] = z - lx * s + lz * c;
      }
      const rec = setConvexShape(
        { min: [x, y, z], max: [x, y + sc * 1.1, z] }, points);
      const col = cloneCollisionRecord(rec);
      obstacles.push(rec); colliders.push(col);
      letGroundCoverLap(rec); // (b14: the turf grows against the stone's foot)
      seat.rec = rec; seat.col = col;
      if (isLooseSurfaceRock(sc, sink, tactical)) {
        rec.kind = col.kind = 'small-rock';
        const clutter = new CrushableClutter('small-rock', x, y + sink * sc, z, sc, sc * 1.1, [rec], [col]);
        rockClutter.set(placement, clutter); pendingClutter.push(clutter);
        seat.clutter = clutter;
      }
    }
    return true;
  }
  // Hard cover belonging to the authored tactical beats is added before the
  // general scatter. It lands in the same three rock instances and therefore
  // costs geometry instances, not draw calls. A broken crescent leaves two
  // peek routes instead of forming an impassable wall.
  function placeTacticalOutcrops(): void {
  for (const beat of P.tacticalBeats || []) {
    if (!beat.outcrop) continue;
    const count = beat.outcrop.count ?? 5;
    const radius = beat.outcrop.radius ?? 9;
    const yaw = THREE.MathUtils.degToRad(beat.yawDeg || 0);
    for (let i = 0; i < count; i++) {
      const arc = count === 1 ? 0 : (i / (count - 1) - 0.5) * Math.PI * 0.92;
      const a = yaw + Math.PI + arc;
      const rr = radius * (0.72 + 0.28 * Math.abs(Math.sin(i * 2.17 + seed)));
      tryRock(beat.x + Math.cos(a) * rr, beat.z + Math.sin(a) * rr,
        beat.outcrop.scaleMin ?? 1.55, beat.outcrop.scaleMax ?? 3.1, false, 0.24, true);
    }
  }
  }
  placeTacticalOutcrops();
  // The maps-and-layouts lane (2026-10-03): boulder aprons, the blocks a knoll's walls shed onto its talus and fans
  // (its geology.boulders; landformGeology.ts geologyBoulderSite crowds them towards the wall's foot). A map without
  // them draws nothing here, so its scatter keeps every seat.
  function placeLandformBoulders(): void {
    // The blocks keep off the trees the vegetation pass planted before them (the scenery lane, 2026-10-03: six trunks
    // stood inside Redrock's blocks): a site within a trunk's reach plus the largest block's is skipped, its draws taken.
    const forms = L.terrain.landforms.filter((form) => form.kind !== 'ridge' && (form.geology?.boulders ?? 0) > 0);
    if (!forms.length) return;
    const trunks = (vegetation?.treeObstacles ?? []).map((tree) => ({
      x: (tree.min[0] + tree.max[0]) / 2, z: (tree.min[2] + tree.max[2]) / 2,
      reach: Math.max(tree.max[0] - tree.min[0], tree.max[2] - tree.min[2]) / 2 + 3.2,
    }));
    const onTree = (x: number, z: number): boolean => trunks.some((t) => Math.abs(x - t.x) < t.reach
      && Math.abs(z - t.z) < t.reach && Math.hypot(x - t.x, z - t.z) < t.reach);
    // (b12, wave 72 on Redrock: the fallen blocks "soap bars" — angular, size-graded, half-buried, sand drifted) the talus
    // sorted by size as a rockfall sorts it, the small blocks near the wall's foot and the big ones rolled out to the toe;
    // on a dusty map the drifted sand holds them deeper
    const apronSink = rockDressing.dust >= 0.5 ? 0.4 : 0.3;
    for (const form of forms) {
      const count = form.geology?.boulders ?? 0;
      for (let i = 0, placed = 0; i < count * 6 && placed < count; i++) {
        const u = rng(), reach = rng();
        const [x, z] = geologyBoulderSite(form, u, reach);
        if (onTree(x, z)) continue;
        if (tryRock(x, z, 0.9 * (0.7 + 0.6 * reach), 3.0 * (0.6 + 0.6 * reach), false, apronSink)) placed++;
      }
    }
  }
  placeLandformBoulders();

  yield { fine: true, stage: 'tactical-outcrops' };
  // r3: per-map surface-rock sink (winter buries boulders deeper so they
  // read as drift-covered rock shoulders, not loose balls ON the snow)
  const surfSink = P.rockSink ?? 0.22;
  function scatterSurfaceRocks(): void {
    for (let i = 0, placed = 0; i < P.rocks * 9 && placed < P.rocks; i++) {
      if (tryRock((rng() * 2 - 1) * 485, (rng() * 2 - 1) * 485, 0.9, 2.8, true, surfSink)) placed++;
    }
  }
  scatterSurfaceRocks();

  yield { fine: true, stage: 'surface-rocks' };
  // r3 terrain_environment: embedded half-buried boulders — sunk to ~60% so
  // the ground reads like it HOLDS rock instead of hosting loose balls; no
  // colliders (drive-over ground clutter), pairs with the new heightfield
  // micro-relief for a believable near-field ground
  function scatterEmbeddedRocks(): void {
    for (let i = 0, placed = 0; i < P.rocks * 5 && placed < Math.round(P.rocks * 0.7); i++) {
      if (tryRock((rng() * 2 - 1) * 470, (rng() * 2 - 1) * 470, 0.55, 1.5, false, 0.60)) placed++;
    }
  }
  scatterEmbeddedRocks();

  yield { fine: true, stage: 'embedded-rocks' };
  // boulder outcrop clusters: chunky hull-down cover groups in the open field
  function scatterBoulderOutcrops(): void {
  for (let c = 0, made = 0; c < P.outcrops * 8 && made < P.outcrops; c++) {
    const cx = (rng() * 2 - 1) * 420, cz = (rng() * 2 - 1) * 420;
    if (heightField._roadDist(cx, cz) < 12) continue;
    const n = 3 + (rng() * 3) | 0;
    let got = 0;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, rr = 1.5 + rng() * 6;
      if (tryRock(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, 1.3, 3.2, false)) got++;
    }
    if (got > 0) made++;
  }
  }
  scatterBoulderOutcrops();
  // The hitbox lane (2026-10-08): the layout brief's cover where the stones' own colliders left a sector short of it
  // (the cover the legacy records' empty corners had counted; docs/MAP-LAYOUT-BRIEF.md, tools/map-layout-metrics.mjs):
  // authored outcrops of the map's own boulders, each a crescent bulging toward its threat as a tactical beat's does,
  // hard cover (never crushable), on their own seeded draws so no stone placed before or after them moves.
  function placeCoverOutcrops(): void {
    (P.coverOutcrops ?? []).forEach((spot, index) => {
      const draw = mulberry32(seed + 7919 + index * 104729);
      const count = spot.count ?? 4, radius = spot.radius ?? 6;
      const toward = THREE.MathUtils.degToRad(spot.towardDeg ?? 0);
      for (let i = 0; i < count; i++) {
        const arc = count === 1 ? 0 : (i / (count - 1) - 0.5) * Math.PI * 0.8;
        const rr = radius * (0.72 + 0.28 * Math.abs(Math.sin(i * 2.17 + index)));
        tryRock(spot.x + Math.cos(toward + arc) * rr, spot.z + Math.sin(toward + arc) * rr,
          spot.scaleMin ?? 1.6, spot.scaleMax ?? 3.0, false, 0.24, true, draw);
      }
    });
  }
  placeCoverOutcrops();

  yield { fine: true, stage: 'boulder-outcrops' };
  // The hitbox lane (2026-10-07; owner: "rock hitboxes are way too big and inaccurate"): every stone's colliders from its
  // own mesh over its own ground (rockCollision.ts). The legacy records stand through every placement pass below, so no
  // prop moves; refitRockColliders swaps these profiles in once all of them have run. Here, before the pools are laid,
  // the crushable class follows the stones that keep a collider: a stone a hull drives over drops its clutter, and a
  // stone that rises past the drive-over line with no collider (a small or a deep-set one) becomes a crushable rock.
  function* settleRockColliders(): Generator<PropsBuildSlice, void, void> {
    const groundAt = rockGroundAt(heightField);
    let settled = 0;
    for (const seat of rockSeats) {
      // (a tenth of a millisecond a stone or less: a loading frame carries 48 of them at most, 5-13 ms on a desktop core)
      if (++settled % 48 === 0) yield { fine: true, progress: false, stage: 'rock-colliders' };
      seat.profile = rockCollisionProfile(rockForms[seat.vv], seat.placement.elements, groundAt);
      if (!seat.profile) {
        if (seat.clutter) {
          rockClutter.delete(seat.placement);
          const at = pendingClutter.indexOf(seat.clutter);
          if (at >= 0) pendingClutter.splice(at, 1);
          seat.clutter = null;
        }
        continue;
      }
      if (seat.rec) continue;
      const rec: CollisionRecord = { min: [seat.x, seat.y, seat.z], max: [seat.x, seat.y, seat.z] };
      const col: CollisionRecord = { min: [seat.x, seat.y, seat.z], max: [seat.x, seat.y, seat.z] };
      seat.rec = rec; seat.col = col; seat.added = true;
      if (rockStaysCrushable(seat.sc, seat.tactical)) {
        rec.kind = col.kind = 'small-rock';
        const clutter = new CrushableClutter('small-rock', seat.x, seat.y + seat.sink * seat.sc, seat.z, seat.sc, seat.sc * 1.1, [rec], [col]);
        rockClutter.set(seat.placement, clutter); pendingClutter.push(clutter);
        seat.clutter = clutter;
      }
    }
  }
  yield* settleRockColliders();
  function instantiateRockVariants(): void {
  for (let vi = 0; vi < 3; vi++) {
    if (rockPlacements[vi].length === 0) continue;
    // round 75 item 6: the ground height under every instance, for the soil skirt and dust laws; the scenery lane (wave
    // 57, "its right end lifts off the slope with no contact shadow"): and the slope of that ground across the rock's
    // reach, so the soil band and the contact darkening meet a slope all round, and the rock's foot its contact patch
    const ground = new Float32Array(rockPlacements[vi].length), slope = new Float32Array(rockPlacements[vi].length * 2);
    const hull = rockHulls[vi];
    let reach = 0;
    for (let k = 0; k < hull.length; k += 2) reach = Math.max(reach, Math.hypot(hull[k], hull[k + 1]));
    for (let i = 0; i < ground.length; i++) {
      const e = rockPlacements[vi][i].elements, x = e[12], z = e[14];
      const r = Math.max(0.5, reach * Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[8], e[9], e[10])));
      ground[i] = heightField.getHeightAt(x, z);
      slope[i * 2] = (heightField.getHeightAt(x + r, z) - heightField.getHeightAt(x - r, z)) / (2 * r);
      slope[i * 2 + 1] = (heightField.getHeightAt(x, z + r) - heightField.getHeightAt(x, z - r)) / (2 * r);
      if (rockContact) {
        const spot = { x, z, r: r * (1.22 + 0.16 * ((Math.imul(i + 1, 0x9e3779b1) >>> 0) / 4294967296)) };
        rockSpots.push(spot);
        rockSpotOf.set(rockPlacements[vi][i], spot);
      }
    }
    // round 79; the scenery lane: the height a shadow can show, from the deepest seat (0.6 of a scale under the centre),
    // not the skirt the rock carries deep under the ground
    const box = rockGeos[vi].boundingBox ?? (rockGeos[vi].computeBoundingBox(), rockGeos[vi].boundingBox!);
    let maxScale = 0;
    for (const placement of rockPlacements[vi]) maxScale = Math.max(maxScale, placement.getMaxScaleOnAxis());
    const heightM = (box.max.y - Math.max(box.min.y, -0.6)) * maxScale;
    const pool = (geometry: THREE.BufferGeometry, name: string, count: number): THREE.InstancedMesh => {
      const mesh = new THREE.InstancedMesh(geometry, mats.rock, count);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // (b14, wave 96: "an 8-16 px seam of lit sand" at a stone's shaded foot) drawn a little inside itself in the shadows
      mesh.customDepthMaterial = rockDepth;
      mesh.matrixAutoUpdate = false;
      mesh.name = name; // round 75: the probes and captures find the boulders by name
      return mesh;
    };
    if (mobileProps) {
      rockGeos[vi].setAttribute('aRockGround', new THREE.InstancedBufferAttribute(ground, 1));
      rockGeos[vi].setAttribute('aRockSlope', new THREE.InstancedBufferAttribute(slope, 2));
      const im = pool(rockGeos[vi], 'rock-variant-' + vi, rockPlacements[vi].length);
      for (let i = 0; i < rockPlacements[vi].length; i++) {
        const placement = rockPlacements[vi][i];
        im.setMatrixAt(i, placement); rockClutter.get(placement)?.bindInstance(im, i);
      }
      im.computeBoundingSphere();
      setShadowCasterProfile(im, { heightM, instanced: true });
      group.add(im);
      continue;
    }
    // the scenery lane (wave 74, the cascade trim: 672-triangle rocks drawn into every cascade): the desktop form near the
    // camera, the phone form past ROCK_FAR_M (rockLod below), both into the near cascades only; the far cascades take the
    // phone form of every rock from a shadow-only pool. The crushable rocks keep the first near slots for good (their
    // clutter writes its slot), cast into the near cascades alone (small, and gone when crushed)
    const n = rockPlacements[vi].length;
    const pinned = rockPlacements[vi].filter((placement) => rockClutter.has(placement)).length;
    const near = pool(rockGeos[vi], 'rock-variant-' + vi, n);
    const far = pool(rockGeosFar[vi], 'rock-variant-' + vi + '-far', n);
    const nearGround = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    const nearSlope = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
    const farGround = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    const farSlope = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
    rockGeos[vi].setAttribute('aRockGround', nearGround);
    rockGeos[vi].setAttribute('aRockSlope', nearSlope);
    rockGeosFar[vi].setAttribute('aRockGround', farGround);
    rockGeosFar[vi].setAttribute('aRockSlope', farSlope);
    const shadowGeo = new THREE.BufferGeometry();
    for (const key of ['position', 'normal', 'color'] as const) shadowGeo.setAttribute(key, rockGeosFar[vi].getAttribute(key));
    shadowGeo.setIndex(rockGeosFar[vi].index);
    const order: number[] = [], loose: number[] = [];
    for (let i = 0; i < n; i++) (rockClutter.has(rockPlacements[vi][i]) ? order : loose).push(i);
    const shadowGround = new Float32Array(n - pinned), shadowSlope = new Float32Array((n - pinned) * 2);
    const shadow = pool(shadowGeo, 'rock-variant-' + vi + '-shadow', n - pinned);
    loose.forEach((i, k) => {
      shadow.setMatrixAt(k, rockPlacements[vi][i]);
      shadowGround[k] = ground[i]; shadowSlope[k * 2] = slope[i * 2]; shadowSlope[k * 2 + 1] = slope[i * 2 + 1];
    });
    shadowGeo.setAttribute('aRockGround', new THREE.InstancedBufferAttribute(shadowGround, 1));
    shadowGeo.setAttribute('aRockSlope', new THREE.InstancedBufferAttribute(shadowSlope, 2));
    shadow.receiveShadow = false;
    markShadowOnly(shadow);
    setShadowCasterCascades(shadow, ROCK_FAR_CASCADES);
    setShadowCasterCascades(near, ROCK_NEAR_CASCADES);
    setShadowCasterCascades(far, ROCK_NEAR_CASCADES);
    for (const [k, i] of order.entries()) {
      // (the crushable rocks: their slots, their attributes, their clutter's binding, written once)
      near.setMatrixAt(k, rockPlacements[vi][i]);
      nearGround.setX(k, ground[i]); nearSlope.setXY(k, slope[i * 2], slope[i * 2 + 1]);
      rockClutter.get(rockPlacements[vi][i])!.bindInstance(near, k);
    }
    // (every loose rock in the near pool until the first camera repartitions them: the pools are whole from the build)
    const lod: RockLodPools = {
      near, far, pinned, loose: Int32Array.from(loose), placements: rockPlacements[vi], ground, slope, high: new Uint8Array(n).fill(1),
    };
    writeRockLod(lod);
    rockLod.push(lod);
    for (const mesh of [near, far, shadow]) {
      setShadowCasterProfile(mesh, { heightM, instanced: true });
      group.add(mesh);
    }
  }
  }
  /**
   * The scenery lane (b14; gauntlet wave 97: "no burial, soil lip, or grass and moss creeping up its skirt", "sitting on
   * the dune along a clean seam instead of in drifted sand"): every boulder's bed — the ground built up against its
   * foot: a soil lip all round, uneven; on a sandy map the sand drifted up its windward side and trailing in its lee
   * (the map's wind, its ripples' rippleDir); on a snowy map the snow banked the same way. A ring of the ground's own
   * surface round the stone: from inside the stone (hidden) out along each of 24 directions — the stone's face at the
   * lip's height (its section there, boulderSections; the lip never climbs where the stone draws in), then the lip
   * falling away as a fillet to 5 cm under the drawn ground a lip's width out (the ground covers its edge, and the two
   * cross steeply enough to keep their depths apart) — conformed to the nearest terrain mesh at every vertex. Merged
   * world-space geometry in 256 m cells, which the world draws with the terrain's material, so the bed's colour, grain
   * and light are the ground's at that place; it casts nothing. Not under the crushable stones (a tank flattens them),
   * nor on the phones.
   */
  /**
   * (b37; the whole-PR census: "rock-beds" 0 -> 9-21 colour-pass draws a view, each on the terrain's heavy ground
   * material) the beds' and the wall-foot turf's cells: 512 m, one geometry a cell for both — up to four on a map, two or
   * three in a view (bedCellKey)
   */
  const BED_CELL_M = 512;
  const bedCellKey = (x: number, z: number): number => Math.floor((x + 512) / BED_CELL_M) * 64 + Math.floor((z + 512) / BED_CELL_M);
  function* buildRockBeds(): Generator<PropsBuildSlice, THREE.BufferGeometry[], void> {
    const SEGMENTS = 24, RINGS = 5;
    const meshAt = (x: number, z: number): number => terrainNearMeshHeightAt(nearMeshVertexHeight, x, z);
    const ripple = (cfg as { splat?: { rippleDir?: readonly [number, number] } } | null)?.splat?.rippleDir ?? [0.8, 0.6];
    const windL = Math.hypot(ripple[0], ripple[1]) || 1, wx = ripple[0] / windL, wz = ripple[1] / windL;
    const sandy = rockDressing.dust >= 0.5, snowy = snowCap;
    const sections = rockGeos.map((g) => boulderSections(g));
    // (b16) the ground's fold under every vertex, as the terrain's chunks carry it (terrain.ts: one normalised byte, -1
    // crest .. +1 hollow): the ground material's hollow moisture, fold occlusion and crest dryness read it, so a bed
    // without it drew the plain ground round a stone that sits in a hollow or on a crest
    const foldAt = (heightField as { _foldAt?: (x: number, z: number) => number })._foldAt;
    const foldByte = (x: number, z: number): number => {
      if (!foldAt) return 0;
      const f = foldAt(x, z);
      return Math.max(-127, Math.min(127, Math.round((f > 1 ? 1 : f < -1 ? -1 : f) * 127)));
    };
    const cells = new Map<number, { pos: number[]; fold: number[]; idx: number[] }>();
    const radius = new Float64Array(SEGMENTS), ground = new Float64Array(SEGMENTS), local = new Float64Array(SEGMENTS * 3);
    let built = 0;
    for (let vi = 0; vi < 3; vi++) {
      for (const placement of rockPlacements[vi]) {
        if (rockClutter.has(placement)) continue;
        const e = placement.elements, px = e[12], py = e[13], pz = e[14];
        const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
        const c = e[0] / sx, sn = -e[2] / sx; // the yaw's cosine and sine (three's rotation about +y)
        const salt = Math.abs(Math.sin(px * 3.1 + pz * 7.7) * 4375.85) % 1;
        // the stone's foot round it: its section at the ground under each direction (twice: the ground where the face is)
        let meanR = 0;
        for (let k = 0; k < SEGMENTS; k++) {
          const phi = (k / SEGMENTS) * Math.PI * 2, dx = Math.cos(phi), dz = Math.sin(phi);
          const lx = c * dx - sn * dz, lz = sn * dx + c * dz;
          const ux = lx / sx, uz = lz / sz, toWorld = 1 / Math.hypot(ux, uz), theta = Math.atan2(uz, ux);
          let r = boulderSectionRadius(sections[vi], (meshAt(px, pz) - py) / sy, theta) * toWorld, g = 0;
          for (let it = 0; it < 2; it++) {
            g = meshAt(px + dx * r, pz + dz * r);
            r = boulderSectionRadius(sections[vi], (g - py) / sy, theta) * toWorld;
          }
          radius[k] = r; ground[k] = g; local[k * 3] = theta; local[k * 3 + 1] = toWorld; local[k * 3 + 2] = 0;
          meanR += r / SEGMENTS;
        }
        if (meanR < 0.3) continue;
        const size = Math.min(1.2, Math.max(0.35, meanR / 1.2));
        const key = bedCellKey(px, pz);
        let cell = cells.get(key);
        if (!cell) cells.set(key, cell = { pos: [], fold: [], idx: [] });
        const base = cell.pos.length / 3;
        // (b16) the stone's contact patch over its bed: the disc's soil at the same place (its uv and its share of the
        // darkness at the same distance from its centre), a few centimetres over the bed's rings from the face out, gone
        // where the bed has sunk under the ground the disc itself lies on
        const spot = rockContact ? rockSpotOf.get(placement) : undefined;
        const shadePos: number[] = [], shadeUv: number[] = [], shadeTint: number[] = [];
        for (let k = 0; k < SEGMENTS; k++) {
          const phi = (k / SEGMENTS) * Math.PI * 2, dx = Math.cos(phi), dz = Math.sin(phi);
          const windward = Math.max(0, -(dx * wx + dz * wz)), lee = Math.max(0, dx * wx + dz * wz);
          const wobble = 0.5 + 0.3 * Math.sin(phi * 2 + salt * 6.3) + 0.2 * Math.sin(phi * 3 + salt * 17.1);
          let lip: number, width: number;
          if (sandy) {
            lip = size * (0.04 + 0.2 * windward * windward + 0.07 * lee * lee * lee) * (0.8 + 0.4 * wobble);
            width = 0.3 + size * (0.9 * windward * windward + 0.6 * lee * lee * lee) + 0.1 * wobble;
          } else if (snowy) {
            lip = size * (0.07 + 0.16 * windward * windward) * (0.8 + 0.4 * wobble);
            width = 0.35 + size * 0.6 * windward * windward + 0.1 * wobble;
          } else {
            lip = size * (0.035 + 0.05 * wobble);
            width = 0.24 + 0.2 * size + 0.12 * wobble;
          }
          const r = radius[k], theta = local[k * 3], toWorld = local[k * 3 + 1];
          // (the lip never climbs past where the stone draws in: at most where its section is 85 % of its foot's)
          let atLip = boulderSectionRadius(sections[vi], (ground[k] + lip - py) / sy, theta) * toWorld;
          for (let it = 0; it < 4 && atLip < r * 0.85; it++) {
            lip *= 0.6;
            atLip = boulderSectionRadius(sections[vi], (ground[k] + lip - py) / sy, theta) * toWorld;
          }
          // the face at the lip's top, a hair inside the stone, and the ring inside it
          const face = atLip - 0.015;
          const ringR = [face * 0.7, face, r + width * 0.25, r + width * 0.55, r + width];
          const ringY = [lip, lip, lip * 0.5625, lip * 0.2025, -0.05];
          for (let j = 0; j < RINGS; j++) {
            const x = px + dx * ringR[j], z = pz + dz * ringR[j], y = (j < 2 ? ground[k] : meshAt(x, z)) + ringY[j];
            cell.pos.push(x, y, z);
            cell.fold.push(foldByte(x, z));
            if (spot && j >= 1) {
              const rho = Math.hypot(x - spot.x, z - spot.z) / spot.r;
              shadePos.push(x, y + 0.03, z);
              const toRim = rho > 1 ? 1 / rho : 1; // (past the rim, where the shade is clear, the disc's edge texel)
              shadeUv.push(0.5 + 0.5 * toRim * (x - spot.x) / spot.r, 0.5 + 0.5 * toRim * (z - spot.z) / spot.r);
              shadeTint.push(1, 1, 1, j === RINGS - 1 ? 0 : contactShare(rho));
            }
          }
        }
        for (let k = 0; k < SEGMENTS; k++) {
          const a = base + k * RINGS, b = base + ((k + 1) % SEGMENTS) * RINGS;
          for (let j = 0; j < RINGS - 1; j++) cell.idx.push(a + j, b + j, a + j + 1, a + j + 1, b + j, b + j + 1);
        }
        if (spot) {
          const rings = RINGS - 1, idx: number[] = [];
          for (let k = 0; k < SEGMENTS; k++) {
            const a = k * rings, b = ((k + 1) % SEGMENTS) * rings;
            for (let j = 0; j < rings - 1; j++) idx.push(a + j, b + j, a + j + 1, a + j + 1, b + j, b + j + 1);
          }
          const shade = new THREE.BufferGeometry();
          shade.setAttribute('position', new THREE.Float32BufferAttribute(shadePos, 3));
          shade.setAttribute('uv', new THREE.Float32BufferAttribute(shadeUv, 2));
          shade.setAttribute('color', new THREE.Float32BufferAttribute(shadeTint, 4));
          shade.setIndex(idx);
          shade.computeVertexNormals();
          rockBedShades.push(shade);
        }
        if (++built % 48 === 0) yield { fine: true, progress: false, stage: 'rock-beds' };
      }
    }
    const out: THREE.BufferGeometry[] = [];
    for (const { pos, fold, idx } of cells.values()) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geometry.setAttribute('fold', new THREE.BufferAttribute(Int8Array.from(fold), 1, true));
      geometry.setIndex(idx);
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      out.push(geometry);
    }
    return out;
  }

  // the scenery lane (wave 57, "a ruler-straight base line on the grass with no soil collar"): every boulder's contact
  // patch, a ragged disc of soil a fifth to a third wider than its reach, to the ground decals below (none on a snow map,
  // where the snow lies against the stone, nor on sand, where the dust skirt meets the dune)
  const rockContact = !snowCap && rockDressing.dust < 0.5;
  const rockSpots: Array<{ x: number; z: number; r: number }> = [];
  // (b16; gauntlet wave 121: boulders "on pale halos or texture seams") each stone's contact patch by its placement, and
  // the patch carried over its bed: the bed (the ground's own material, risen round the foot) hid the patch's inner rings
  // and showed the clean ground as a pale ring between the stone and its soil. The patch's rings and their shares of its
  // darkness are the disc's (conformedDisc, ROCK_PATCH); a shade over the bed takes the same at the same place
  const rockSpotOf = new Map<THREE.Matrix4, { x: number; z: number; r: number }>();
  const CONTACT_PATCH_RINGS: readonly number[] = [0, 0.4, 0.7, 1.0];
  const ROCK_PATCH_SHARES: readonly number[] = [0.3, 0.35, 0.5, 1];
  const rockBedShades: THREE.BufferGeometry[] = [];
  /** The contact patch's share of its darkness at a distance from its centre (a share of its radius): the disc's rings'
   * shares, linear between them as the disc's triangles draw them, none past its rim. */
  function contactShare(rho: number): number {
    if (rho >= 1) return 0;
    for (let i = 1; i < CONTACT_PATCH_RINGS.length; i++) {
      if (rho <= CONTACT_PATCH_RINGS[i]) {
        const t = (rho - CONTACT_PATCH_RINGS[i - 1]) / (CONTACT_PATCH_RINGS[i] - CONTACT_PATCH_RINGS[i - 1]);
        return ROCK_PATCH_SHARES[i - 1] + (ROCK_PATCH_SHARES[i] - ROCK_PATCH_SHARES[i - 1]) * t;
      }
    }
    return 0;
  }
  const rockDepth = createRockDepthMaterial();
  retainedSurfaceMaterials.push(rockDepth);
  const rockLod: RockLodPools[] = [];
  instantiateRockVariants();
  // (b14) every boulder's bed, for the world to draw with the ground's own material (map.ts assembleWorld)
  if (!mobileProps) group.userData.rockBeds = yield* buildRockBeds();
  rockClutter.clear();
  // the map-revival lane (round 2b, wave 335): a snow map's lee drifts against its closed buildings and the windrows along
  // its ploughed roads, as fillets of the snow itself (maps/buildingSnowDrifts.ts): merged with the turf below into the
  // beds' cells, drawn with the terrain's own material — its albedo, grain, tone and light — on the desktop
  if (snowCap && !mobileProps && (P.buildingDrifts || P.ploughBanks)) {
    const roadDistAt = (x: number, z: number): number => heightField._roadDist(x, z);
    if (P.buildingDrifts) {
      wallDressing.turfs.push(...buildBuildingDrifts(heightField, buildingFeatures,
        { open: structureCollisionOpenIds, landmarkAllow: new Set(P.driftLandmarks ?? []), roadDist: roadDistAt }));
    }
    if (P.ploughBanks) wallDressing.turfs.push(...buildPloughBanks(heightField, L.roads, town, roadDistAt));
  }
  // (b18) and the turf banked against the dry-stone walls' feet, the same ground material's: (b37) merged into its cell's
  // bed, one geometry a 512 m cell for both (bedCellKey), so a cell costs one draw, not two
  if (wallDressing.turfs.length) {
    const byCell = new Map<number, THREE.BufferGeometry[]>();
    const add = (g: THREE.BufferGeometry) => {
      if (!g.boundingSphere) g.computeBoundingSphere();
      const c = g.boundingSphere!.center, key = bedCellKey(c.x, c.z), list = byCell.get(key);
      if (list) list.push(g); else byCell.set(key, [g]);
    };
    for (const bed of (group.userData.rockBeds as THREE.BufferGeometry[] | undefined) ?? []) add(bed);
    for (const turf of wallDressing.turfs) add(turf);
    const beds: THREE.BufferGeometry[] = [];
    for (const list of byCell.values()) {
      const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!merged) { beds.push(...list); continue; }
      if (merged !== list[0]) for (const g of list) g.dispose();
      merged.computeBoundingSphere();
      beds.push(merged);
    }
    group.userData.rockBeds = beds;
    wallDressing.turfs.length = 0;
  }

  yield { fine: true, stage: 'rock-instances' };

  // --- field haystacks: classic WoT soft-cover silhouettes in the open ---
  const stackSpots: Array<{ x: number; z: number; r: number }> = []; // r6: fed to the grounding-decal pass below
  // b15 (gauntlet wave 106: the cone "a leftover debug marker"): the region's own stack where its fields stack hay
  // (maps/haystackKit.ts), none where they do not — the default; a map that authors a count and no region keeps the cone
  // (the steppe, whose rick is the maps lane's). The draws stay as they were — the authored count's, or the old default's
  // fifteen — so every later placement keeps its seat; a stack the region does not build, or one too big for its site,
  // takes its draws and stands nowhere.
  const authoredHaystacks = (cfg as { props?: { haystacks?: number } } | null)?.props?.haystacks;
  const haystackStyle: HaystackStyle = P.haystackStyle ?? HAYSTACK_STYLE_BY_MAP[mapId] ?? (authoredHaystacks !== undefined ? 'haystack' : 'none');
  const haystackDraws = authoredHaystacks ?? 15;
  function placeFieldHaystacks(): void {
  const form = haystackStyle === 'none' ? null : HAYSTACK_STYLE_KINDS[haystackStyle];
  const meta = form ? PROP_TYPE_REGISTRY[form.kind] : null;
  /**
   * A region's stack stands where its builder would have built it: on the most level ground within fourteen metres of
   * its seat — the seat itself if the ground under its foot is within 0.35 m from side to side, else the levellest of
   * sixteen stands round it within 0.6 m — clear of the village, the spawns and the road by its reach; null where none
   * is. The ground under the foot: eight points round a round stack's foot, a hooiberg's or a Diemen's corners and
   * sides. No draws (every later placement keeps its seat).
   */
  function haystackStand(x0: number, z0: number, yaw: number, sc: number): { x: number; z: number; y: number } | null {
    if (!meta) return null;
    const box = meta.hw != null && meta.hl != null, footR = ((meta.collisionR ?? meta.r) + 0.25) * sc;
    const hw = (meta.hw ?? 0) * sc, hl = (meta.hl ?? 0) * sc, c = Math.cos(yaw), s = Math.sin(yaw);
    let best: { x: number; z: number; y: number } | null = null, bestSpread = 0.6;
    for (let k = 0; k < 17; k++) {
      const ring = k === 0 ? 0 : k <= 8 ? 7 : 14, a = ((k - 1) % 8) * (Math.PI / 4) + (k > 8 ? Math.PI / 8 : 0);
      const x = x0 + Math.cos(a) * ring, z = z0 + Math.sin(a) * ring;
      if (Math.abs(x) > 430 || Math.abs(z) > 430) continue;
      if (x > v.x0 - 10 && x < v.x1 + 10 && z > v.z0 - 10 && z < v.z1 + 10) continue;
      if (heightField._roadDist(x, z) < Math.max(9, 6 + meta.r * sc)) continue;
      if (heightField.getGroundType(x, z) === 'soft' || noVeg(x, z)) continue;
      if (heightField.getNormalAt(x, z).y < 0.92) continue;
      if ([L.spawns.player, ...L.spawns.enemies].some((spawn) => Math.hypot(x - spawn.x, z - spawn.z) < 18)) continue;
      const y = heightField.getHeightAt(x, z);
      let lo = y, hi = y;
      for (let p = 0; p < 8; p++) {
        let px: number, pz: number;
        if (box) {
          const u = [1, 1, -1, -1, 1, -1, 0, 0][p] * hw, w = [1, -1, 1, -1, 0, 0, 1, -1][p] * hl;
          px = x + u * c + w * s; pz = z - u * s + w * c;
        } else {
          px = x + Math.cos((p * Math.PI) / 4) * footR; pz = z + Math.sin((p * Math.PI) / 4) * footR;
        }
        const h = heightField.getHeightAt(px, pz);
        lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
      const spread = hi - lo;
      if (k === 0 && spread <= 0.35) return { x, z, y };
      if (spread < bestSpread) { bestSpread = spread; best = { x, z, y }; }
    }
    return best;
  }
  for (let i = 0, placed = 0; i < haystackDraws * 22 && placed < haystackDraws; i++) {
    const x = (rng() * 2 - 1) * 430, z = (rng() * 2 - 1) * 430;
    if (x > v.x0 - 10 && x < v.x1 + 10 && z > v.z0 - 10 && z < v.z1 + 10) continue;
    if (heightField._roadDist(x, z) < 9) continue;
    if (heightField.getGroundType(x, z) === 'soft' || noVeg(x, z)) continue;
    if (heightField.getNormalAt(x, z).y < 0.92) continue;
    let nearSpawn = false;
    for (const s of [L.spawns.player, ...L.spawns.enemies]) {
      if (Math.hypot(x - s.x, z - s.z) < 18) { nearSpawn = true; break; }
    }
    if (nearSpawn) continue;
    const y = heightField.getHeightAt(x, z);
    // world-dressing r1: haystacks are DESTRUCTIBLE instances now — a hull
    // plows through (crushable obstacle, WoT hay behavior) and shells pass
    // through cosmetically instead of being EATEN (the old collider made a
    // hay pile stop AP rounds; colliders are gone for hay).
    const sc = 0.85 + rng() * 0.4;
    const yaw = rng() * Math.PI * 2;
    placed++;
    if (!form || !meta) continue;
    const stand = form.kind === 'haystack' ? { x, z, y } : haystackStand(x, z, yaw, sc);
    if (!stand) continue;
    addDestructible(form.kind, stand.x, stand.y - 0.10, stand.z, yaw, sc);
    stackSpots.push({ x: stand.x, z: stand.z, r: form.spotR * sc });
  }
  }
  placeFieldHaystacks();

  yield { fine: true, stage: 'field-haystacks' };

  // --- field clutter: fallen logs + stumps (visual ground detail) ---
  function beginFieldTimberCapture(): FieldTimberPiece[] | null {
    return P.loggingYard ? [] : null;
  }
  const fieldTimber = beginFieldTimberCapture();
  function placeFieldLogsAndStumps(): void {
  // environment density pass 2 (2026-09-12): the cap is per map (forest and
  // farm maps carry 44-60, snow and volcanic ground 30-36; a map's own
  // props.logCount overrides the table), attempts scale with it
  const logCap = Math.max(0, Math.round(P.logCount ?? FIELD_LOG_COUNTS[mapId] ?? 26));
  // the authored logging yard keeps its original donor budget (composeLoggingYard's
  // bounded allocation of 26 pieces); every log and stump past it stays in the field
  const yardDonors = 26;
  for (let i = 0, placed = 0; P.logs && i < logCap * 10 && placed < logCap; i++) {
    const x = (rng() * 2 - 1) * 460, z = (rng() * 2 - 1) * 460;
    if (x > v.x0 - 6 && x < v.x1 + 6 && z > v.z0 - 6 && z < v.z1 + 6) continue;
    if (heightField._roadDist(x, z) < 7) continue;
    if (heightField.getGroundType(x, z) === 'soft' || noVeg(x, z)) continue;
    if (rng() < 0.6) { // log
      const r = 0.16 + rng() * 0.13, len = 2.2 + rng() * 1.9;
      const yaw = rng() * Math.PI * 2;
      const pose = planGroundedSegment(
        heightField, x, z, Math.cos(yaw), -Math.sin(yaw), len, r * 0.85, r * 0.1,
      );
      const log = new THREE.CylinderGeometry(r * 0.85, r, len, 7, 1);
      scaleUV(log, 1.0, len * 0.5);
      _quat.setFromUnitVectors(_upAxis, _posv.set(pose.axisX, pose.axisY, pose.axisZ));
      log.applyQuaternion(_quat);
      log.translate(pose.x, pose.y, pose.z);
      buckets.wood.push(log);
      decorationGroundingReceipts.push({
        kind: 'fallen-log', x: pose.x, y: pose.y, z: pose.z,
        relief: pose.relief, baseClearance: -r * 0.1,
        start: pose.start, end: pose.end,
      });
      if (fieldTimber && fieldTimber.length < yardDonors) fieldTimber.push({ geometry: log, grounding: decorationGroundingReceipts.at(-1)!, radius: r, length: len, height: 0, yaw });
    } else { // stump
      const r = 0.22 + rng() * 0.15, h = 0.35 + rng() * 0.3;
      const support = sampleDiscGround(heightField, x, z, r, 0.06);
      const st = new THREE.CylinderGeometry(r * 0.92, r * 1.15, h, 8, 1);
      scaleUV(st, 1.5, 0.5);
      const yaw = rng() * Math.PI;
      st.rotateY(yaw);
      st.translate(x, support.y + h / 2, z);
      buckets.wood.push(st);
      decorationGroundingReceipts.push({
        kind: 'stump', x, y: support.y, z, relief: support.spread, baseClearance: -0.06,
        supportMin: support.min, supportMax: support.max,
      });
      if (fieldTimber && fieldTimber.length < yardDonors) fieldTimber.push({ geometry: st, grounding: decorationGroundingReceipts.at(-1)!, radius: r, length: 0, height: h, yaw });
    }
    placed++;
  }
  }
  placeFieldLogsAndStumps();

  // --- standing crop fields (r6 terrain_environment) ------------------------
  yield { stage: 'field-logs-and-stumps' };
  // The open farmland carried no crops at all ("summer fields have no crops"
  // critique) — WoT maps stage their fields with standing grain. Each plot is
  // a fan of parallel crop-card rows (terrain-conformed vertical strips, one
  // merged alpha-tested mesh) plus the field's own haystack-ready clearing.
  // ~350 tris/plot — establishing-shot scale dressing at negligible cost.
  const cropLandSample = {} as Parameters<NonNullable<HeightField['_landUseAt']>>[2];
  function placeCropFields(): void {
    if ((P.cropFields ?? 0) <= 0) return;
    const crng = mulberry32(seed + 515);
    const cropTex = createCropTexture(crng);
    const cropGeos: THREE.BufferGeometry[] = [];
    for (let p = 0, made = 0; p < P.cropFields * 30 && made < P.cropFields; p++) {
      if (tryPlaceCropPlot(crng, cropGeos)) made++;
    }
    finalizeCropFields(cropTex, cropGeos);
  }

  function paintWetCropLeaves(cctx: CanvasRenderingContext2D, x: number, hgt: number, lean: number, width: number): void {
    for (let leaf = 0; leaf < 2; leaf++) {
      const t = .36 + leaf * .25;
      // Exact points on the stalk quadratic, including its 2px buried start.
      const lx = x + lean * (.8 * t + .2 * t * t);
      const ly = 258 - (1.2 * hgt + 4) * t + (.2 * hgt + 2) * t * t;
      const reach = (leaf ? -1 : 1) * (22 + Math.abs(lean) * 2);
      cctx.beginPath();
      cctx.moveTo(lx, ly);
      cctx.quadraticCurveTo(lx + reach * .5, ly - hgt * .18 - width, lx + reach, ly - hgt * .22);
      cctx.quadraticCurveTo(lx + reach * .5, ly - hgt * .18 + width, lx, ly);
      cctx.fill();
    }
  }

  function paintCropPanicle(cctx: CanvasRenderingContext2D, x: number, y: number, length: number, spread: number): void {
    cctx.beginPath();
    cctx.moveTo(x, y);
    cctx.quadraticCurveTo(x + spread * .2, y - length * .7, x + spread * .4, y - length);
    for (let branch = 0; branch < 5; branch++) {
      const t = (branch + 1) / 6, side = branch % 2 ? -1 : 1;
      const bx = x + spread * .4 * t, by = y - length * (1.4 * t - .4 * t * t);
      cctx.moveTo(bx, by);
      cctx.quadraticCurveTo(bx + side * spread, by - length * .18,
        bx + side * spread * .85, by - length * .06);
    }
    cctx.stroke();
  }

  function biomeCropHeight(wet: boolean, standing: boolean, growth: number, headLength: number): number {
    // Admission keeps the upper40% of this draw; restore its full height span.
    if (wet) return 256 * (.64 + ((growth - .60) / .40) * .25);
    return 256 * (standing ? .55 + headLength * .28 : .10 + growth * .19);
  }

  function biomeCropLean(wet: boolean, standing: boolean, bend: number): number {
    return (bend - .5) * (wet ? 10 : standing ? 20 : 8);
  }

  function paintCropStalk(cctx: CanvasRenderingContext2D, x: number, hgt: number, lean: number, width: number): void {
    cctx.lineWidth = width;
    cctx.beginPath();
    cctx.moveTo(x, 258);
    cctx.quadraticCurveTo(x + lean * .4, 256 - hgt * .6, x + lean, 256 - hgt);
    cctx.stroke();
  }

  function finishStandingCrop(cctx: CanvasRenderingContext2D, x: number, y: number,
    wet: boolean, headLength: number, headWidth: number): void {
    // Small branching heads, not the legacy broad elliptical wheat pegs.
    paintCropPanicle(cctx, x, y,
      (wet ? 12 : 7) + headLength * 5, (wet ? 3 : 1.2) + headWidth * 1.2);
  }

  function finishBrokenCrop(cctx: CanvasRenderingContext2D, x: number, y: number, width: number): void {
    // A broken, oblique cut at the actual shortened stalk tip.
    cctx.beginPath();
    cctx.moveTo(x - width * .6, y + width);
    cctx.lineTo(x + width * .6, y);
    cctx.stroke();
  }

  function paintBiomeCrop(cctx: CanvasRenderingContext2D, crng: () => number, form: NonNullable<PropsSettings['cropForm']>): void {
    for (let b = 0; b < 260; b++) {
      // Keep all nine legacy draws in their original order: this same stream
      // selects plots immediately after the atlas, including cut/headless stems.
      const x = crng() * 256, growth = crng(), bend = crng();
      const lum = .17 + crng() * .11, hue = crng(), girth = crng();
      const headHue = crng(), headWidth = crng(), headLength = crng();
      const wet = form === 'wet-upright';
      // Admit wet stems after all draws: open gaps between whole attached
      // plants without changing the following plot/row placement stream.
      if (wet && growth < .60) continue;
      if (form === 'grain') { paintGrainStalk(cctx, x, growth, bend, lum, hue, girth, headHue, headWidth, headLength); continue; }
      const standing = wet || growth > .88;
      const hgt = biomeCropHeight(wet, standing, growth, headLength);
      const lean = biomeCropLean(wet, standing, bend);
      const width = (wet ? .55 : .65) + girth * .45;
      _col.setHSL(wet ? .20 + hue * .035 : .105 + hue * .025, wet ? .40 : .30, lum);
      cctx.strokeStyle = cctx.fillStyle = _col.getStyle();
      paintCropStalk(cctx, x, hgt, lean, width);
      if (wet) paintWetCropLeaves(cctx, x, hgt, lean, .8 + girth * .6);
      _col.setHSL(wet ? .17 + headHue * .025 : .10 + headHue * .02, .34, lum + .045);
      cctx.strokeStyle = _col.getStyle();
      if (standing) finishStandingCrop(cctx, x + lean, 256 - hgt, wet, headLength, headWidth);
      else finishBrokenCrop(cctx, x + lean, 256 - hgt, width);
    }
  }

  // Ground lane (2026-10-04, wave 71 on Verdant's close-up: the crop "a picket fence of chopsticks — evenly spaced beige
  // dowels with flat cut tops and no ears, awns or leaves"; the coordinator: "irregular spacing and ears would fix most
  // of it"): a field of ripe grain. The stalks stand in uneven clumps along the row (three incommensurate waves over
  // the card's width admit them — the drill's row thinned and lodged in places, never the legacy card's four punched
  // windows), every stalk its own height and lean, a leaf down the stem on the stouter ones, an ear on every one a
  // shade deeper than its straw and a beard of awns on most. The nine draws a stalk stay as they were (the plot stream
  // after the atlas is exact), and the card covers less than the legacy one at every mip (cropBiomeIdentity).
  function paintGrainStalk(cctx: CanvasRenderingContext2D, x: number, growth: number, bend: number, lum: number,
    hue: number, girth: number, headHue: number, headWidth: number, headLength: number): void {
    const clump = .5 + .5 * Math.sin(x * .071 + 1.3) * Math.sin(x * .187 + .4) + .22 * Math.sin(x * .43 + 2.1);
    if (growth > .18 + .42 * clump) return;
    const hgt = 256 * (.50 + headLength * .30 + (growth - .3) * .14);
    const lean = (bend - .5) * 22;
    // (stems thick enough to hold through the card's 64 px mip: fewer and stouter, the coverage at the legacy's)
    const width = 1.05 + girth * .55;
    _col.setHSL(.110 + hue * .022, .32, lum);
    cctx.strokeStyle = cctx.fillStyle = _col.getStyle();
    paintCropStalk(cctx, x, hgt, lean, width);
    if (girth > .55) {
      // a leaf off the stem's lower half, arching out and drooping
      const t = .34 + girth * .16, lx = x + lean * (.8 * t + .2 * t * t), ly = 258 - (1.2 * hgt + 4) * t + (.2 * hgt + 2) * t * t;
      const reach = (headHue > .5 ? 1 : -1) * (10 + girth * 8);
      cctx.lineWidth = .9;
      cctx.beginPath();
      cctx.moveTo(lx, ly);
      cctx.quadraticCurveTo(lx + reach * .6, ly - hgt * .10, lx + reach, ly - hgt * .03);
      cctx.stroke();
    }
    // the ear: a slim spike along the stalk's own lean at its tip, a shade deeper and warmer than the straw
    const ex = x + lean, ey = 256 - hgt, len = 8 + headLength * 7, wid = 1.6 + headWidth * 1.0;
    const ang = Math.atan2(lean, hgt) * .9;
    _col.setHSL(.098 + headHue * .02, .40, Math.min(.34, lum + .035));
    cctx.fillStyle = cctx.strokeStyle = _col.getStyle();
    cctx.beginPath();
    cctx.ellipse(ex + Math.sin(ang) * len * .4, ey - Math.cos(ang) * len * .4, wid, len * .55, ang, 0, Math.PI * 2);
    cctx.fill();
    if (headWidth > .28) {
      // its awns: a fan of fine bristles past the ear's tip
      cctx.lineWidth = .6;
      cctx.beginPath();
      const tx = ex + Math.sin(ang) * len * .9, ty = ey - Math.cos(ang) * len * .9;
      for (let a = -2; a <= 2; a++) {
        const aa = ang + a * .16, al = 4 + headLength * 5;
        cctx.moveTo(tx, ty);
        cctx.lineTo(tx + Math.sin(aa) * al, ty - Math.cos(aa) * al);
      }
      cctx.stroke();
    }
  }

  function createCropTexture(crng: () => number): THREE.CanvasTexture {
    const cs = 256;
    const cc = document.createElement('canvas');
    cc.width = cc.height = cs;
    const cctx = canvas2d(cc, { willReadFrequently: true });
    cctx.clearRect(0, 0, cs, cs);
    if (P.cropForm) paintBiomeCrop(cctx, crng, P.cropForm);
    else for (let b = 0; b < 260; b++) { // legacy wheat: other maps stay byte-identical
      const x = crng() * cs;
      const hgt = cs * (0.50 + crng() * 0.42);
      const lean = (crng() - 0.5) * 16;
      const lum = 0.17 + crng() * 0.11;
      _col.setHSL(0.115 + crng() * 0.02, 0.34, lum);
      cctx.strokeStyle = _col.getStyle();
      cctx.lineWidth = 1.2 + crng() * 1.1;
      cctx.beginPath();
      cctx.moveTo(x, cs + 2);
      cctx.quadraticCurveTo(x + lean * 0.4, cs - hgt * 0.6, x + lean, cs - hgt);
      cctx.stroke();
      _col.setHSL(0.105 + crng() * 0.02, 0.38, Math.min(0.35, lum + 0.065));
      cctx.fillStyle = _col.getStyle();
      cctx.beginPath();
      cctx.ellipse(x + lean, cs - hgt, 1.7 + crng(), 4.5 + crng() * 2.5, lean * 0.03, 0, Math.PI * 2);
      cctx.fill();
    }
    const cid = cctx.getImageData(0, 0, cs, cs);
    for (let i = 0; i < cs * cs; i++) {
      const x = i % cs, y = Math.floor(i / cs);
      // Dense stalk bases formerly merged into luminous rectangular walls.
      // Four coarse gaps remain resolved in the existing 64px mip, while
      // each clump retains the original seeded stems and seed heads. This
      // pixel-only cut consumes no random draws or extra rows/materials.
      if (!P.cropForm && x % 64 < 24) cid.data[i * 4 + 3] = 0;
      const rootShade = 0.98 - y / cs * 0.18;
      for (let channel = 0; channel < 3; channel++) cid.data[i * 4 + channel] *= rootShade;
      // Muted mean-tone flood prevents bright RGB fringes in transparent mips.
      if (cid.data[i * 4 + 3] < 24) {
        cid.data[i * 4] = P.cropForm === 'wet-upright' ? 88 : 126;
        cid.data[i * 4 + 1] = P.cropForm === 'wet-upright' ? 112 : 110;
        cid.data[i * 4 + 2] = P.cropForm === 'wet-upright' ? 56 : 66;
      }
    }
    cctx.putImageData(cid, 0, 0);
    const cropTex = new THREE.CanvasTexture(cc);
    cropTex.colorSpace = THREE.SRGBColorSpace;
    cropTex.wrapS = THREE.RepeatWrapping;
    cropTex.anisotropy = aniso;
    return cropTex;
  }

  function cropPlotAvoidsSpawns(cx: number, cz: number, radius: number): boolean {
    return ![L.spawns.player, ...L.spawns.enemies].some((spawn) =>
      Math.hypot(cx - spawn.x, cz - spawn.z) < radius + 24);
  }

  function cropPlotCornersAreLevel(
    cx: number, cz: number, pw: number, pd: number,
    dx: number, dz: number, px2: number, pz2: number,
  ): boolean {
    const y0 = heightField.getHeightAt(cx, cz);
    for (const [ex, ez] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const qx = cx + dx * ex * pw * 0.5 + px2 * ez * pd * 0.5;
      const qz = cz + dz * ex * pw * 0.5 + pz2 * ez * pd * 0.5;
      if (Math.abs(heightField.getHeightAt(qx, qz) - y0) > 3.2) return false;
    }
    return true;
  }

  function appendCropRowGeometry(
    cropGeos: THREE.BufferGeometry[], crng: () => number,
    rx: number, rz: number, half: number, rowH: number, tintL: number,
    dx: number, dz: number,
  ): void {
    const nSt = Math.max(3, Math.ceil((half * 2) / 3.4));
    const pos: number[] = [], uv: number[] = [], idx: number[] = [], col: number[] = [];
    for (let sIt = 0; sIt <= nSt; sIt++) {
      const t = sIt / nSt;
      const sx2 = rx + dx * (t * 2 - 1) * half;
      const sz2 = rz + dz * (t * 2 - 1) * half;
      const gy = heightField.getHeightAt(sx2, sz2);
      const hh = rowH * (0.86 + crng() * 0.28);
      pos.push(sx2, gy + 0.02, sz2, sx2, gy + hh, sz2);
      uv.push(t * half * 0.8, 0, t * half * 0.8, 1);
      const cshade = tintL * (0.9 + crng() * 0.2);
      col.push(cshade, cshade, cshade, cshade, cshade, cshade);
      if (sIt > 0) {
        const b0 = (sIt - 1) * 2, b1 = sIt * 2;
        // Plot-center qualification cannot see a shoreline crossing its edge.
        // Keep every seeded draw and original row vertex, but emit only dry,
        // grounded spans. Clipped plots are not refilled with extra attempts.
        const p0 = b0 * 3;
        if (cropRowSegmentIsSupported(heightField,
          pos[p0], pos[p0 + 2], pos[p0 + 1] - 0.02, sx2, sz2, gy)) {
          idx.push(b0, b1, b0 + 1, b0 + 1, b1, b1 + 1);
        }
      }
    }
    if (idx.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    geometry.setIndex(idx);
    cropGeos.push(geometry);
  }

  function appendCropRows(
    cropGeos: THREE.BufferGeometry[], crng: () => number,
    cx: number, cz: number, pw: number, pd: number,
    dx: number, dz: number, px2: number, pz2: number,
  ): void {
    const rowPitch = 2.5 + crng() * 0.5;
    const nRows = Math.floor(pd / rowPitch);
    const rowH = 1.05 + crng() * 0.2;
    const tintL = 0.9 + crng() * 0.25;
    for (let row = 0; row < nRows; row++) {
      const offset = (row - (nRows - 1) / 2) * rowPitch;
      const rx = cx + px2 * offset, rz = cz + pz2 * offset;
      const half = pw * (0.44 + crng() * 0.08);
      const before = cropGeos.length;
      appendCropRowGeometry(cropGeos, crng, rx, rz, half, rowH, tintL, dx, dz);
      if (autumnCropRows && cropGeos.length > before) {
        captureAutumnCropRow(autumnCropRows, cropGeos[before], cx, cz, dx, dz, row);
      }
    }
  }

  function tryPlaceCropPlot(
    crng: () => number,
    cropGeos: THREE.BufferGeometry[],
  ): boolean {
    const cx = (crng() * 2 - 1) * 380, cz = (crng() * 2 - 1) * 380;
    const pw = 34 + crng() * 26, pd = 26 + crng() * 22;
    const radius = Math.hypot(pw, pd) * 0.5;
    const overlapsVillage = cx > v.x0 - radius - 14 && cx < v.x1 + radius + 14
      && cz > v.z0 - radius - 14 && cz < v.z1 + radius + 14;
    if (overlapsVillage || heightField._roadDist(cx, cz) < radius + 9) return false;
    if (heightField.getGroundType(cx, cz) === 'soft' || noVeg(cx, cz)) return false;
    let supported = heightField.getNormalAt(cx, cz).y > 0.965;
    if (!cropPlotAvoidsSpawns(cx, cz, radius)) supported = false;

    // Keep this seeded draw before the support decision: rejected flatness
    // candidates historically consume their row angle too.
    const dirA = crng() * Math.PI;
    let dx = Math.cos(dirA), dz = Math.sin(dirA);
    // ground lane (2026-10-04, wave 71 on Verdant's close-up): on a map with fields (the height field's land-use hook)
    // a plot of standing grain stands only inside a field of ripe wheat or barley (landUse.ts LAND_CROP 1, 2), well
    // inside its margin, its rows along the field's own — not at any angle over whatever crop the land use laid there
    const landAt = heightField._landUseAt;
    // the plot as it stands in its field: along its rows (fw) and across them (fd)
    let fw = pw, fd = pd;
    if (landAt) {
      const f = landAt(cx, cz, cropLandSample);
      if (!f.active || (f.crop !== 1 && f.crop !== 2)) supported = false;
      else {
        // (mr4, 2026-10-06: a strip field 36 m across never held a plot of 34–60 × 26–48 m, so an openfield's or a Gewann's
        // strips carried no standing grain at all — Amberford 8 plots → 0, Frontier's Gewann row 2 → 0) the plot fits its
        // field instead of being refused by it: across its rows to the field's nearer edge, along them to the nearer row
        // end, each 2 m inside the margin; a field that leaves less than 12 m across or 20 m along holds none. A plot that
        // fitted before keeps its size (the fit only shortens what the edge would have refused), and the draws are the ones
        // they were (the plots' own stream)
        fd = Math.min(pd, 2 * (f.edgeM - f.marginM - 2));
        fw = Math.min(pw, 2 * (f.endM - f.marginM - 2));
        if (fd < 12 || fw < 20) supported = false;
        else { dx = f.rowX; dz = f.rowZ; }
      }
    }
    const px2 = -dz, pz2 = dx;
    if (supported && !cropPlotCornersAreLevel(cx, cz, fw, fd, dx, dz, px2, pz2)) {
      supported = false;
    }
    if (!supported) return false;
    appendCropRows(cropGeos, crng, cx, cz, fw, fd, dx, dz, px2, pz2);
    return true;
  }

  function finalizeCropFields(
    cropTex: THREE.CanvasTexture,
    cropGeos: THREE.BufferGeometry[],
  ): void {
    if (cropGeos.length === 0) { cropTex.dispose(); return; }
    const cropMat = new THREE.MeshStandardMaterial({
      map: cropTex, alphaTest: 0.42, alphaToCoverage: true, side: THREE.DoubleSide,
      vertexColors: true, roughness: 1.0, metalness: 0.0,
    });
    // (2026-10-08: the crops take the sky's full light, as they always drew; their 0.5 trim never applied, materialEnvIntensity.ts)
    engineCtx.setupShadowMaterial(cropMat, cropAttributeNormal);
    cropMat.customProgramCacheKey = () => 'world-crop-authored-normal-v1';
    const merged = mergeGeometries(cropGeos, false);
    // Explicit up normals avoid alpha-strip lighting and missing-normal crashes.
    const nPos = merged.attributes.position.count;
    const nUp = new Float32Array(nPos * 3);
    for (let i = 0; i < nPos; i++) nUp[i * 3 + 1] = 1;
    merged.setAttribute('normal', new THREE.BufferAttribute(nUp, 3));
    const cropMesh = new THREE.Mesh(merged, cropMat);
    cropMesh.name = 'crop-fields';
    cropMesh.castShadow = false;
    cropMesh.receiveShadow = false;
    cropMesh.matrixAutoUpdate = false;
    cropMesh.userData.aoExclude = true;
    group.add(cropMesh);
  }
  placeCropFields();

  // --- street lampposts (r6 terrain_environment, town maps) -----------------
  yield;
  // Cast-iron posts marching along the paved grid — the missing street
  // furniture scale cue ("urban streets missing furniture" critique).
  function placeTownLampposts(): void {
    if (!P.lampposts) return;
    const lrng = mulberry32(seed + 611);
    let lampCount = 0;
    const placeLampAtRoadNode = (roadIndex: number, nodeIndex: number): boolean => {
      const nodes = L.roads[roadIndex];
      const at = authoredRoadStationIndex(L, roadIndex, nodeIndex);
      if (at < 0) return false;
      const [ax, az] = nodes[at], [bx, bz] = nodes[at + 1];
      const tl = Math.hypot(bx - ax, bz - az) || 1;
      const side = ((nodeIndex >> 1) % 2) ? 1 : -1;
      const lx = ax - ((bz - az) / tl) * 6.3 * side;
      const lz = az + ((bx - ax) / tl) * 6.3 * side;
      const outsideTown = lx < town.x0 - 12 || lx > town.x1 + 12
        || lz < town.z0 - 12 || lz > town.z1 + 12;
      if (outsideTown || heightField._roadDist(lx, lz) < 4.6) return false;
      const blocked = placedB.some((building) =>
        Math.hypot(lx - building.x, lz - building.z) < building.rr + 1.2);
      if (blocked) return false;
      const y = heightField.getHeightAt(lx, lz);
      const armAngle = Math.atan2(ax - lx, az - lz);
      addDestructible('lamp', lx, y - 0.02, lz,
        armAngle - Math.PI / 2, 0.95 + lrng() * 0.12);
      return true;
    };
    for (let ri = 0; ri < L.roads.length && lampCount < 44; ri++) {
      const count = authoredRoadStationCount(L, ri);
      for (let i = 2; i < count - 1 && lampCount < 44; i += 2) {
        if (placeLampAtRoadNode(ri, i)) lampCount++;
      }
    }
  }
  placeTownLampposts();

  // --- anti-tank hedgehogs (r6 terrain_environment) --------------------------
  // Steel-beam obstacles on the streets/approaches — the classic shelled-town
  // debris silhouette WoT urban maps scatter at intersections.
  function placeHedgehogs(): void {
    if ((P.hedgehogs ?? 0) <= 0) return;
    const hrng = mulberry32(seed + 613);
    const placeHedgehog = (hedgehogId: number): boolean => {
      const inTown = hrng() < 0.7;
      const hx = inTown ? town.x0 + hrng() * (town.x1 - town.x0) : (hrng() * 2 - 1) * 320;
      const hz = inTown ? town.z0 + hrng() * (town.z1 - town.z0) : (hrng() * 2 - 1) * 320;
      const roadDistance = heightField._roadDist(hx, hz);
      if (roadDistance > 8.5 || (roadDistance < 2.2 && hrng() < 0.5)) return false;
      const blocked = placedB.some((building) =>
        Math.hypot(hx - building.x, hz - building.z) < building.rr + 1.5);
      if (blocked || noVeg(hx, hz)) return false;
      const nearSpawn = [L.spawns.player, ...L.spawns.enemies]
        .some((spawn) => Math.hypot(hx - spawn.x, hz - spawn.z) < 20);
      if (nearSpawn) return false;
      const yaw = hrng() * Math.PI * 2;
      const scale = 0.85 + hrng() * 0.35;
      const y = sampleDiscGround(heightField, hx, hz, 1.08 * scale, 0.035).y;
      const yawOffsets = [
        (hrng() - 0.5) * 0.3,
        (hrng() - 0.5) * 0.3,
        (hrng() - 0.5) * 0.3,
      ];
      const beams = hedgehogBeamSpecs(hx, y, hz, yaw, scale, yawOffsets);
      const clutterObs: CollisionRecord[] = [], clutterCols: CollisionRecord[] = [];
      const clutter = new CrushableClutter('hedgehog', hx, y, hz, 1.2 * scale, 1.7 * scale, clutterObs, clutterCols);
      for (const beamSpec of beams) {
        const beam = box(0.16 * scale, 0.16 * scale, 2.1 * scale, 1.2);
        beam.rotateX(beamSpec.tilt);
        beam.rotateY(beamSpec.yaw);
        beam.translate(hx, y + 0.62 * scale, hz);
        buckets.dark.push(beam); clutter.ownPiece(beam);
        const record: PropsCollisionRecord = {
          min: [hx, beamSpec.minY, hz], max: [hx, beamSpec.maxY, hz],
          kind: 'hedgehog', hedgehogId,
        };
        // (the hitbox lane, 2026-10-07: the beam's own slabs, which lean with it; its whole projection extruded from foot
        // to tip stopped a quarter of the sight lines that met it 10+ cm clear of the steel)
        _hedgehogBeam.makeRotationY(beamSpec.yaw).multiply(_hedgehogTilt.makeRotationX(beamSpec.tilt))
          .setPosition(hx, y + 0.62 * scale, hz);
        const slabs = convexSlabs(boxCorners(0.08 * scale + 0.025, 0.08 * scale, 1.05 * scale + 0.025, _hedgehogBeam.elements),
          HEDGEHOG_SLAB_M, 8);
        if (slabs.length) {
          setCompoundShape(record, slabParts(slabs));
          record.min[1] = slabs[0].y0; record.max[1] = slabs[slabs.length - 1].y1;
        } else setObbShape(record, hx, hz, beamSpec.halfWidth + 0.025, beamSpec.halfLength + 0.025, beamSpec.yaw);
        const collider = cloneCollisionRecord(record);
        obstacles.push(record); colliders.push(collider);
        clutterObs.push(record); clutterCols.push(collider);
      }
      pendingClutter.push(clutter);
      return true;
    };
    // 2026-09-14 campaign flavour: desktop tiers field more anti-tank obstacles (authored x1.35).
    const hedgehogCap = richCount(P.hedgehogs);
    for (let i = 0, placed = 0; i < hedgehogCap * 20 && placed < hedgehogCap; i++) {
      if (placeHedgehog(placed)) placed++;
    }
  }
  placeHedgehogs();

  // --- carts along the roads (world-dressing r1: DESTRUCTIBLE hay carts +
  // hand carts — a moving hull smashes them to debris, shells burst them;
  // no collider so they never eat a shell) ---
  function placeRoadCarts(): void {
    const cartCap = (P.inhabit && P.inhabit.carts) ?? 2;
    let carts = 0;
    for (let i = 4; P.carts && L.roads.length >= 2 && i < authoredRoadStationCount(L, 1) - 1 && carts < cartCap; i += 5) {
      const at = authoredRoadStationIndex(L, 1, i);
      if (at < 0) continue;
      const [ax, az] = L.roads[1][at];
      const cxp = ax + 8.5, czp = az + 6.5;
      if (Math.max(Math.abs(cxp), Math.abs(czp)) > 440) continue;
      if (heightField._roadDist(cxp, czp) < 6) continue;
      if (heightField.getGroundType(cxp, czp) === 'soft' || noVeg(cxp, czp)) continue;
      const kind = carts % 2 ? 'handcart' : 'haycart';
      const yaw = rng() * Math.PI * 2, sc = 0.95 + rng() * 0.12;
      // (wave 211) a station steeper than the carts' tilt cap passes its cart to the nearest neighbouring station that
      // is not, along the same road, short of the next cart station either way; with none, the cart is not placed (its
      // draws are spent either way)
      const meta = resolveDestructibleMeta(destructibleContext, kind);
      const hwK = (meta.hw ?? meta.r) * sc, hlK = (meta.hl ?? meta.r) * sc;
      let seat: [number, number] | null = null;
      // each station on its own side of the road first, then across it
      for (const step of [0, 1, -1, 2, -2, 3, -3, 4, -4]) for (const side of [1, -1]) {
        if (seat) break;
        const near = step === 0 ? at : authoredRoadStationIndex(L, 1, i + step);
        if (near < 0) continue;
        const [nx, nz] = L.roads[1][near];
        const sx = nx + side * 8.5, sz = nz + side * 6.5;
        if ((step !== 0 || side < 0) && (Math.max(Math.abs(sx), Math.abs(sz)) > 440 || heightField._roadDist(sx, sz) < 6
          || heightField.getGroundType(sx, sz) === 'soft' || noVeg(sx, sz))) continue;
        if (!cartGroundPose(heightField, sx, sz, yaw, hwK, hlK).steep) seat = [sx, sz];
      }
      if (seat) addDestructible(kind, seat[0], heightField.getHeightAt(seat[0], seat[1]) - 0.04, seat[1], yaw, sc);
      carts++;
    }
  }
  placeRoadCarts();

  // --- sandbag emplacements: defensive clusters along the main road + plaza ---
  // DESTRUCTIBLES r1: sandbags no longer wall a hull OR eat shells — every
  // emplacement is a destructible record (crushKeep ~0.97: you barely feel
  // them) that bursts into spilled bags. The three sourced silhouettes ride
  // the LOCAL_TYPES pools; a tank at speed just drives over the position.
  function placeSandbagEmplacements(): void {
    if (!SOURCED.sandbags) return;
    const srng = mulberry32(seed + 401);
    const sbKind = (pick: number): string => (
      pick < 0.45 ? 'sandbagbig' : pick < 0.8 ? 'sandbagsmall' : 'sandbagwall'
    );
    let placedS = 0;
    const sandbagCap = richCount(P.sandbagLines, 9); // 2026-09-14 campaign flavour: more nests on desktop
    const roadA = L.roads[0];
    const placeSandbagAtRoadNode = (nodeIndex: number): boolean => {
      const at = authoredRoadStationIndex(L, 0, nodeIndex);
      if (at < 0) return false;
      const [ax, az] = roadA[at], [bx, bz] = roadA[at + 1];
      if (Math.abs(az) > 330) return false;
      const tl = Math.hypot(bx - ax, bz - az);
      const side = (nodeIndex % 2) ? 1 : -1;
      const sx = ax - ((bz - az) / tl) * 8.6 * side, sz = az + ((bx - ax) / tl) * 8.6 * side;
      if (Math.max(Math.abs(sx), Math.abs(sz)) > 460) return false;
      if (heightField._roadDist(sx, sz) < 5.5) return false;
      if (heightField.getGroundType(sx, sz) === 'soft' || noVeg(sx, sz)) return false;
      if (heightField.getNormalAt(sx, sz).y < 0.9) return false;
      const blocked = placedB.some((building) =>
        Math.hypot(sx - building.x, sz - building.z) < building.rr + 4);
      if (blocked) return false;
      const y = heightField.getHeightAt(sx, sz);
      const yaw = Math.atan2(bx - ax, bz - az) + (srng() - 0.5) * 0.3;
      const kind = sbKind(srng()), scale = 1.25 + srng() * 0.3;
      addDestructible(kind, sx, y - 0.04, sz, yaw, scale);
      bedSandbagNest(kind, sx, sz, yaw, scale);
      if (srng() < 0.55) scatterDestructibles('ammobox', sx, sz, 1, 1.8, 3.2);
      if (srng() < 0.3) scatterDestructibles('crate', sx, sz, 1, 1.8, 3.0);
      return true;
    };
    for (let i = 6; i < authoredRoadStationCount(L, 0) - 2 && placedS < sandbagCap; i += 3) {
      if (placeSandbagAtRoadNode(i)) placedS++;
    }
    // plaza corner nest by the well
    {
      const nx = junction.x - 11, nz = junction.z - 8;
      const y = heightField.getHeightAt(nx, nz);
      addDestructible('sandbagbig', nx, y - 0.04, nz, Math.PI * 0.7, 1.4);
      addDestructible('sandbagsmall', nx + 3.4,
        heightField.getHeightAt(nx + 3.4, nz + 1.6) - 0.04, nz + 1.6, Math.PI * 0.25, 1.3);
      bedSandbagNest('sandbagbig', nx, nz, Math.PI * 0.7, 1.4);
      bedSandbagNest('sandbagsmall', nx + 3.4, nz + 1.6, Math.PI * 0.25, 1.3);
      scatterDestructibles('ammobox', nx + 1.5, nz + 1, 2, 1.2, 2.6);
    }
  }
  placeSandbagEmplacements();

  // --- campaign slice 5 (2026-09-14, owner: "I still don't see campaign gameplay"): trench works.
  // The assault-trenches variant carves the three fire trenches into the height field; this
  // dresses their lips so they read as dug-in positions — a sandbag parapet on the enemy-facing
  // lip, ammunition and crates on the friendly lip, a drum or barrier at each end. Every piece is
  // an existing destructible (no collider), so a hull can still cross the works. Standard fields
  // carry no trench plan and place nothing.
  function placeTrenchWorks(): void {
    // 2026-09-17: the field trenches every standard map carries (terrain fieldTrenchLines) take the same
    // dressing as the assault sector lines — parapet, ammunition lip, end drums and the wire belt.
    // each line's works sit just outside its own bank: the fortified sector section or the field fire-trench section
    const entries = [
      ...(heightField.assaultTrenchLines?.lines ?? []).map((line) => ({ line, lip: ASSAULT_TRENCH.floorHalfWidthM + ASSAULT_TRENCH.wallRunM + 0.45 })),
      ...(heightField.fieldTrenchLines?.lines ?? []).map((line) => ({ line, lip: FIELD_TRENCH.profile.floorHalfWidthM + FIELD_TRENCH.profile.wallRunM + 0.45 })),
    ];
    if (!entries.length || !SOURCED.sandbags) return;
    const trng = mulberry32(seed + 7301);
    let placed = 0;
    for (const { line, lip } of entries) {
      const yaw = Math.atan2(line.lx, line.lz);
      const reach = line.halfLengthM - 6;
      for (let along = -reach; along <= reach; along += 5.2 + trng() * 1.6) {
        // enemy-facing parapet
        const px = line.x + line.lx * along + line.ax * lip, pz = line.z + line.lz * along + line.az * lip;
        if (Math.max(Math.abs(px), Math.abs(pz)) > 455 || heightField._roadDist(px, pz) < 5) continue;
        if (heightField.getGroundType(px, pz) === 'soft' || noVeg(px, pz)) continue;
        const roll = trng();
        const kind = roll < 0.5 ? 'sandbagwall' : roll < 0.8 ? 'sandbagbig' : 'sandbagsmall';
        // every piece keeps its whole footprint out of the road core: one that would reach into it is left out, its
        // draws still taken and its station counted, so the rest of the works keep their seats
        const parapetYaw = yaw + (trng() - 0.5) * 0.12, parapetScale = 1.15 + trng() * 0.25;
        if (destructibleClearOfRoad(kind, px, pz, parapetYaw, parapetScale)) {
          addDestructible(kind, px, heightField.getHeightAt(px, pz) - 0.04, pz, parapetYaw, parapetScale);
        }
        placed++;
        // friendly lip: ammunition and crates every third station
        if (placed % 3 === 0) {
          const fx = line.x + line.lx * along - line.ax * (lip + 0.6), fz = line.z + line.lz * along - line.az * (lip + 0.6);
          if (Math.max(Math.abs(fx), Math.abs(fz)) <= 455 && heightField._roadDist(fx, fz) >= 5 && !noVeg(fx, fz)) {
            const lipKind = trng() < 0.6 ? 'ammobox' : 'crate';
            const lipYaw = yaw + (trng() - 0.5) * 0.9, lipScale = 0.95 + trng() * 0.15;
            if (destructibleClearOfRoad(lipKind, fx, fz, lipYaw, lipScale)) {
              addDestructible(lipKind, fx, heightField.getHeightAt(fx, fz) - 0.03, fz, lipYaw, lipScale);
            }
          }
        }
      }
      // a drum or barrier closes each end of the works
      for (const end of [-1, 1]) {
        const ex = line.x + line.lx * end * (line.halfLengthM - 2), ez = line.z + line.lz * end * (line.halfLengthM - 2);
        if (Math.max(Math.abs(ex), Math.abs(ez)) > 455 || heightField._roadDist(ex, ez) < 5 || noVeg(ex, ez)) continue;
        const endKind = trng() < 0.5 ? 'drum' : 'barrier';
        if (!destructibleClearOfRoad(endKind, ex, ez, yaw + Math.PI / 2, 1)) continue;
        addDestructible(endKind, ex, heightField.getHeightAt(ex, ez) - 0.03, ez, yaw + Math.PI / 2, 1);
      }
      // owner 2026-09-17 ("extra in Frontline Assault"): a barbed-wire belt 7.5 m ahead of every parapet
      for (let along = -reach; along <= reach; along += 2.65) {
        const wx = line.x + line.lx * along + line.ax * (lip + 7.5), wz = line.z + line.lz * along + line.az * (lip + 7.5);
        if (Math.max(Math.abs(wx), Math.abs(wz)) > 455 || heightField._roadDist(wx, wz) < 5) continue;
        if (heightField.getGroundType(wx, wz) === 'soft' || noVeg(wx, wz)) continue;
        const wireYaw = yaw + (trng() - 0.5) * 0.1, wireScale = 0.95 + trng() * 0.15;
        if (destructibleClearOfRoad('barbedwire', wx, wz, wireYaw, wireScale)) {
          addDestructible('barbedwire', wx, heightField.getHeightAt(wx, wz) - 0.02, wz, wireYaw, wireScale);
        }
      }
    }
  }
  placeTrenchWorks();

  // --- fortifications on every map (owner 2026-09-17: "more trenches/barbed wire/AA guns/bunkers on ALL maps,
  // extra in Frontline Assault"): field works between the spawns — a breastwork facing the threat (sourced sandbag
  // modules, concrete barriers where the bags are absent), a barbed-wire belt in front of it, and a pillbox at one
  // end of every second work. Own rng stream (seed + 7411) so no existing placement shifts; the assault variant
  // (trench plan present) fields two more works on top of its wired parapets.
  function placeFieldWorks(): void {
    const wrng = mulberry32(seed + 7411);
    const player = L.spawns.player;
    const enemies = L.spawns.enemies;
    if (!player || !enemies.length) return;
    let ex = 0, ez = 0;
    for (const enemy of enemies) { ex += enemy.x; ez += enemy.z; }
    ex /= enemies.length; ez /= enemies.length;
    const dx = ex - player.x, dz = ez - player.z;
    const axis = Math.hypot(dx, dz);
    if (axis < 120) return;
    const ax = dx / axis, az = dz / axis;   // attack direction (player → enemy)
    const lx = -az, lz = ax;                // lateral along the front
    const trenchLines = [...(heightField.assaultTrenchLines?.lines ?? []), ...(heightField.fieldTrenchLines?.lines ?? [])];
    const target = richCount(P.fieldWorks, 3) + (heightField.assaultTrenchLines?.lines.length ? 2 : 0);
    // the carved fire trenches (assault variant) keep a 16 m berth so no work lands in a trench floor
    const nearTrench = (x: number, z: number): boolean => trenchLines.some((line) => {
      const along = (x - line.x) * line.lx + (z - line.z) * line.lz;
      const across = (x - line.x) * line.ax + (z - line.z) * line.az;
      return Math.abs(along) <= line.halfLengthM + 8 && Math.abs(across) <= 16;
    });
    const clear = (x: number, z: number): boolean => Math.max(Math.abs(x), Math.abs(z)) <= 455
      && heightField._roadDist(x, z) >= 6 && heightField.getGroundType(x, z) !== 'soft' && !noVeg(x, z)
      && heightField.getNormalAt(x, z).y >= 0.86 && !nearTrench(x, z)
      && ![player, ...enemies].some((spawn) => Math.hypot(x - spawn.x, z - spawn.z) < 45)
      && !placedB.some((building) => Math.hypot(x - building.x, z - building.z) < building.rr + 6);
    const trunks = P.pillboxClearOfTrees ? (vegetation?.treeObstacles ?? []).map((tree) => ({
      x: (tree.min[0] + tree.max[0]) / 2, z: (tree.min[2] + tree.max[2]) / 2,
      reach: Math.max(tree.max[0] - tree.min[0], tree.max[2] - tree.min[2]) / 2 + 6.2,
    })) : [];
    const pillboxOnTree = (x: number, z: number): boolean => trunks.some((t) => Math.abs(x - t.x) < t.reach
      && Math.abs(z - t.z) < t.reach);
    let placed = 0;
    for (let attempt = 0; attempt < target * 30 && placed < target; attempt++) {
      const along = 0.22 + wrng() * 0.56;
      const lateral = (wrng() * 2 - 1) * Math.min(170, axis * 0.35);
      const cx = player.x + ax * axis * along + lx * lateral, cz = player.z + az * axis * along + lz * lateral;
      if (!clear(cx, cz)) continue;
      const facing = along < 0.5 ? 1 : -1;  // the near half faces the enemy, the far half faces the player
      const fx = ax * facing, fz = az * facing;
      const yaw = Math.atan2(lx, lz);
      const modules = 3 + Math.floor(wrng() * 3);
      const stations: Array<readonly [number, number]> = [];
      for (let m = 0; m < modules; m++) {
        const off = (m - (modules - 1) / 2) * 2.7;
        stations.push([cx + lx * off, cz + lz * off]);
      }
      if (!stations.every(([bx, bz]) => clear(bx, bz))) continue;
      for (const [bx, bz] of stations) {
        const kind = SOURCED.sandbags ? (wrng() < 0.6 ? 'sandbagwall' : 'sandbagbig') : 'barrier';
        // every piece keeps its whole footprint out of the road core: one that would reach into it is left out, its
        // draws still taken, so the rest of the works keep their seats
        const moduleYaw = yaw + (wrng() - 0.5) * 0.1, moduleScale = SOURCED.sandbags ? 1.15 + wrng() * 0.2 : 1;
        if (!destructibleClearOfRoad(kind, bx, bz, moduleYaw, moduleScale)) continue;
        addDestructible(kind, bx, heightField.getHeightAt(bx, bz) - 0.04, bz, moduleYaw, moduleScale);
        bedSandbagNest(kind, bx, bz, moduleYaw, moduleScale, [fx, fz]); // (its spoil thrown toward the threat)
      }
      // wire belt 14–18 m toward the threat, one module wider than the breastwork on each side
      const wireDist = 14 + wrng() * 4;
      for (let m = -1; m <= modules; m++) {
        const off = (m - (modules - 1) / 2) * 2.6;
        const wx = cx + fx * wireDist + lx * off, wz = cz + fz * wireDist + lz * off;
        if (!clear(wx, wz)) continue;
        const wireYaw = yaw + (wrng() - 0.5) * 0.12, wireScale = 0.95 + wrng() * 0.15;
        if (!destructibleClearOfRoad('barbedwire', wx, wz, wireYaw, wireScale)) continue;
        addDestructible('barbedwire', wx, heightField.getHeightAt(wx, wz) - 0.02, wz, wireYaw, wireScale);
      }
      // a pillbox closes one end of every second work (either end, else the centre) 3–4 m behind the breastwork line
      // (on a map with pillboxClearOfTrees its 8 m square keeps off every trunk, as the landform boulders do)
      if (placed % 2 === 0) {
        const first = wrng() < 0.5 ? 1 : -1;
        const reach = modules * 1.35 + 4.4;
        for (const [ox, oz] of [[lx * first * reach, lz * first * reach], [-lx * first * reach, -lz * first * reach], [-fx * 4, -fz * 4]]) {
          const px = cx + ox - fx * 3, pz = cz + oz - fz * 3;
          // the pillbox's whole footprint (an 8 m square) keeps out of the road core, not just its centre
          if (!clear(px, pz) || heightField.getNormalAt(px, pz).y < 0.9 || pillboxOnTree(px, pz)
            || !destructibleClearOfRoad('bunker', px, pz, Math.atan2(fx, fz), 1)) continue;
          addDestructible('bunker', px, heightField.getHeightAt(px, pz) - 0.08, pz, Math.atan2(fx, fz), 1);
          if (wrng() < 0.7) scatterDestructibles('ammobox', px - fx * 4.5, pz - fz * 4.5, 1, 1.5, 3);
          break;
        }
      }
      placed++;
    }
  }
  placeFieldWorks();

  // --- knocked-out TANK WRECKS: real roster vehicles, baked static ----------
  yield;
  // DESTRUCTIBLES r1 replaces the r7 generic box hulks with the game's own
  // tank models: era-appropriate roster vehicles built through tankFactory,
  // posed by the factory's settled-wreck machinery (turret tossed or unseated,
  // gun drooped), charred/rust-painted and BAKED into ONE static merged mesh
  // per map (src/world/wrecks.ts — no live tank cost, no articulation).
  // They are pure DRESSING: solid obstacles + shell colliders, never in
  // game.tanks, invisible to spotting and the minimap. Placement stays the
  // storytelling read: roadside kills along the advance routes, plus paired
  // "duel" beats where two hulks face each other off the same verge.
  const wreckScorch: Array<[number, number]> = [];
  const tankWreckSpots: TankWreckSpot[] = []; // probe/debug: {specId,x,z,yaw,hx,hz,h} per hulk
  function* placeTankWrecks(): Generator<PropsBuildSlice, void, void> {
    const wCfg = P.tankWrecks || null;
    const requestedWrecks = wCfg ? (wCfg.count ?? 3) : (P.wrecks ?? 0);
    // Loading-speed r1: the third mobile hulk was one independent 284 ms
    // hidden-prefetch atom. Two keep the paired roadside story beat on a
    // small screen while removing two transient live-tank factories; desktop
    // content stays unchanged. A second similarly sized roster atom was
    // exposed after this one disappeared and is scheduled separately.
    // (every tier since 2026-10-08: a hulk is a record, so the phones stand the desktop's; layout identity)
    const wreckCount = requestedWrecks;
    if (wreckCount > 0) {
      const wrng = mulberry32(seed + 909);
      const era = (wCfg && wCfg.era) || 'ww2';
      const pool = resolveWreckRoster(era, wCfg?.ids);
      if (pool.length === 0) return;
      const bakeCache = new Map<string, WreckBake | null>(); // specId|pop -> bake result
      // maps lane B (2026-10-03, the physics lane's road-crossing sweep): a hulk keeps 10 m off a road's sharp bends
      // (turns over 40 degrees), the ground a hull that misses the turn runs straight on to. Copper Mesa's haul road
      // met a BMP-3 4.8 m past its 73-degree corner on the causeway; no other map had a hulk within 10 m of one.
      const sharpBends = sharpRoadBends(roads);
      const wreckGeos: THREE.BufferGeometry[] = [];
      const wreckShadowGeos: THREE.BufferGeometry[] = []; // factory shadow proxies, wreck-posed
      let bakedTris = 0;
      let wreckSerial = 0;
      let wreckPickSerial = 0;
      function* bakeFor(specId: string, pop: boolean): Generator<PropsBuildSlice, WreckBake | null, void> {
        const key = specId + (pop ? '|p' : '');
        if (bakeCache.has(key)) return bakeCache.get(key) ?? null;
        // the map-vehicles lane (P4): the paint this map's tanks wore survives in patches on the burnt hull
        const options = { seed: seed + bakeCache.size * 131, pop, remnant: wreckRemnantPaint(mapId) };
        let baked: WreckBake | null;
        if (workerWrecks) {
          const request: NonNullable<PropsBuildSlice['wreckBake']> = { specId, options, result: null };
          try {
            yield { fine: true, progress: false, stage: `wreck-${specId}:worker`, wreckBake: request };
            baked = request.result;
            request.result = null; // cache below becomes the sole owner
          } finally {
            // A cancelled tick may close us after transfer but before next().
            if (request.result) {
              disposeWreckGeometry(request.result.geo);
              if (request.result.shadowGeo) disposeWreckGeometry(request.result.shadowGeo);
            }
          }
        } else {
          baked = yield* bakeTankWreckSteps(engineCtx, specId, options);
        }
        bakeCache.set(key, baked);
        return baked;
      }
      function* placeWreck(
        x: number,
        z: number,
        yaw: number,
      ): Generator<PropsBuildSlice, boolean, void> {
        // Explicit map pools are deliberate story casts: consume them in
        // order so new silhouettes are used across the battlefield roster,
        // including the two-wreck mobile cap. Unauthored pools stay seeded.
        const specId = wCfg?.ids?.length
          ? pool[wreckPickSerial % pool.length]
          : pool[(wrng() * pool.length) | 0];
        const pop = wrng() < 0.45; // mix ammo-rack tosses with unseated kills
        // The async world builder resolves only the selected wreck's authored
        // family before this cooperative bake resumes. No full-fleet barrier,
        // speculative preload, or legacy fallback is involved.
        yield { fine: true, tankBuilder: specId };
        const baked = yield* bakeFor(specId, pop);
        if (!baked) return false;
        // The whole hulk keeps out of the road core, not just its centre: a hull that reaches into the carriageway
        // moves straight off the road (up to 8 m), and one that cannot is not placed here.
        const seat = shiftClearOfRoadCore(heightField, x, z,
          (px, pz) => boxClearOfRoadCore(heightField, px, pz, baked.hx + 0.2, baked.hz + 0.2, yaw));
        if (!seat) return false;
        if (seat[0] !== x || seat[1] !== z) {
          [x, z] = seat;
          if (Math.max(Math.abs(x), Math.abs(z)) > 440
            || placedB.some((building) => Math.hypot(x - building.x, z - building.z) < building.rr + 2)) return false;
        }
        if (!boxClearOfPoints(sharpBends, x, z, baked.hx + 0.2, baked.hz + 0.2, yaw, 10)) return false;
        // the map-vehicles lane (2026-10-08, the placement audit over the merge): a hulk never stands inside a building,
        // a hut, a garage, a wall, a fence, a barrier or a boulder placed before it (Orchard's Merkava stood in a
        // checkpoint hut, Airfield's hulks in a quonset hut and a motor pool, Urban's T-72 2 m through a plank fence):
        // its footprint against every solid over half a metre tall, a hand's breadth of slack, nor with a tree through
        // it (Verdant's KV-2s); such a seat is refused and the donor tried at the next site (a hulk may still lie
        // against the low things, a kerb, a log, a crate on its side)
        if (hulkMeetsTallSolid(x, z, baked.hx, baked.hz, yaw)) return false;
        // nor on a match objective's disc (the authored zone hints, 30 m, and the kickoff, 12 m, each with 3 m of margin,
        // as the field works keep them: scenery.ts fieldWorksKeepOut). Both authorities relocate a blocked hint by a
        // bounded search: a hulk seated 25 m from Steinburg's eastern zone sent it 280 m away and broke the layout's
        // symmetry (matchPlacement, mapLayoutBrief)
        if (hulkOnObjective(x, z, Math.hypot(baked.hx, baked.hz))) return false;
        const support = planGroundedObbPose(
          heightField, x, z, baked.hx, baked.hz, yaw, 0.14,
        );
        // A rigid hulk cannot conform to a cliff lip or deep ditch. Reject
        // those candidates and let the seeded road pass find a supported
        // site instead of either floating a track or burying half the tank.
        if (support.maxEmbed > (wCfg?.maxGroundEmbed ?? 1.1)) return false;
        bakedTris += baked.tris; // budget counts PLACED tris (clones render too)
        const y = support.y;
        _quat.setFromUnitVectors(_upAxis,
          _posv.set(support.normalX, support.normalY, support.normalZ));
        const g = baked.geo.clone();
        g.rotateY(yaw);
        g.applyQuaternion(_quat);
        g.translate(x, y, z); // settled on dead suspension across its whole footprint
        wreckGeos.push(g);
        // Secondary destruction stays inside the same static merged wreck
        // mesh: torn track runs, wheels and armor plates improve the scene
        // read without adding draw calls, animation, or live vehicle state.
        let debrisTris = 0;
        if (wCfg?.debris !== false) {
          const debris = bakeWreckDebris(seed + 17001 + wreckSerial * 97, {
            modern: isPostwarVehicleEra(era),
          });
          wreckSerial++;
          debris.geo.rotateY(yaw);
          debris.geo.applyQuaternion(_quat);
          debris.geo.translate(x, y + 0.01, z);
          wreckGeos.push(debris.geo);
          debrisTris = debris.tris;
          bakedTris += debrisTris;
        }
        if (baked.shadowGeo) {
          const sg = baked.shadowGeo.clone();
          sg.rotateY(yaw);
          sg.applyQuaternion(_quat);
          sg.translate(x, y, z);
          wreckShadowGeos.push(sg);
        }
        // Separate hull/turret solids follow the exact visible yaw and slope pose.
        // A sideways gun must never turn the empty space beside a wreck into a wall.
        const placement = new THREE.Matrix4().makeRotationFromQuaternion(_quat)
          .multiply(new THREE.Matrix4().makeRotationY(yaw));
        placement.setPosition(x, y, z);
        const rec = placeWreckCollision(baked.solids, placement);
        const hx = (rec.max[0] - rec.min[0]) * 0.5;
        const hz = (rec.max[2] - rec.min[2]) * 0.5;
        obstacles.push(rec);
        // (the hitbox lane, 2026-10-07: shells and sight lines meet the solids in slabs that lean with them)
        colliders.push(placeWreckShellCollision(baked.shellSolids ?? baked.solids, placement));
        wreckScorch.push([x, z]);
        tankWreckSpots.push({
          specId, x, y, z, yaw, hx, hz, h: baked.h, debrisTris,
          supportMin: support.min, supportMax: support.max, supportSpread: support.spread,
          supportMaxEmbed: support.maxEmbed, supportMaxFloat: support.maxFloat,
        });
        decorationGroundingReceipts.push({
          kind: 'tank-wreck', specId, x, y, z, relief: support.spread,
          baseClearance: support.maxFloat,
          supportMin: support.min, supportMax: support.max,
        });
        // A rejected slope/bake is not a placed wreck. Retry this donor on the
        // next supported site instead of skipping it and later repeating one.
        wreckPickSerial++;
        return true;
      }
      const objectiveLayout = MATCH_OBJECTIVE_LAYOUTS[mapId];
      const objectiveDiscs: readonly (readonly [number, number, number])[] = [
        ...(objectiveLayout?.zones ?? []).map((zone) => [zone.x, zone.z, 30 + 3] as const),
        ...(objectiveLayout?.kickoff ? [[objectiveLayout.kickoff.x, objectiveLayout.kickoff.z, 12 + 3] as const] : []),
        // (2026-10-08, over modes' symmetric deployments) nor in a deployment slot's clearing, which every placed
        // destructible keeps (addDestructible's veto: DEPLOYMENT_CLEAR_M and its radius); Delta's Type 59 stood 2.75 m in one
        ...deploymentSlots.map((slot) => [slot.x, slot.z, DEPLOYMENT_CLEAR_M] as const),
      ];
      function hulkOnObjective(x: number, z: number, r: number): boolean {
        return objectiveDiscs.some(([cx, cz, radius]) => Math.hypot(x - cx, z - cz) < radius + r);
      }
      function hulkMeetsTallSolid(x: number, z: number, hx: number, hz: number, yaw: number): boolean {
        const s = Math.sin(yaw), c = Math.cos(yaw), r = Math.hypot(hx, hz);
        const hull: FootprintPolygon = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) =>
          [x + u * hx * c + v * hz * s, z - u * hx * s + v * hz * c] as const);
        for (const list of [obstacles, sceneryTrees] as const) {
          for (const ob of list) {
            if (ob.kind === 'tank-wreck' || ob.max[1] - ob.min[1] < 0.5) continue;
            if (ob.max[0] < x - r || ob.min[0] > x + r || ob.max[2] < z - r || ob.min[2] > z + r) continue;
            for (const poly of shapePolygons(ob)) if (polygonGap(hull, poly).gap < -0.1) return true;
          }
        }
        return false;
      }
      let placedW = 0;
      function* placeAuthoredWrecks(): Generator<PropsBuildSlice, void, void> {
        // Story-critical wrecks mark crossfires and failed assaults at authored
        // lane anchors before the seeded road pass supplies organic variation.
        for (const beat of P.tacticalBeats || []) {
          if (!beat.wreck || placedW >= wreckCount || bakedTris > 260000) continue;
          const yawW = THREE.MathUtils.degToRad(beat.wreckYawDeg ?? beat.yawDeg ?? 0);
          if (yield* placeWreck(beat.x + (beat.wreckOffsetX || 0),
            beat.z + (beat.wreckOffsetZ || 0), yawW)) {
            placedW++;
            yield { fine: true };
          }
        }
      }
      function wreckSpotIsClear(px: number, pz: number): boolean {
        if (Math.max(Math.abs(px), Math.abs(pz)) > 440) return false;
        if (heightField._roadDist(px, pz) < 5.2) return false;
        if (heightField.getGroundType(px, pz) === 'soft' || noVeg(px, pz)) return false;
        if (heightField.getNormalAt(px, pz).y < 0.88) return false;
        const nearSpawn = [L.spawns.player, ...L.spawns.enemies]
          .some((spawn) => Math.hypot(px - spawn.x, pz - spawn.z) < 30);
        if (nearSpawn) return false;
        const nearBuilding = placedB
          .some((building) => Math.hypot(px - building.x, pz - building.z) < building.rr + 4);
        return !nearBuilding && Math.hypot(px - junction.x, pz - junction.z) >= 20;
      }
      function duelSpotIsClear(qx: number, qz: number): boolean {
        return Math.max(Math.abs(qx), Math.abs(qz)) <= 440
          && heightField._roadDist(qx, qz) >= 5.2
          && heightField.getGroundType(qx, qz) !== 'soft'
          && !noVeg(qx, qz)
          && heightField.getNormalAt(qx, qz).y >= 0.88;
      }
      function* placePairedWreck(px: number, pz: number): Generator<PropsBuildSlice, void, void> {
        if (placedW >= wreckCount || wrng() >= 0.4) return;
        const da = wrng() * Math.PI * 2;
        const dd = 9 + wrng() * 5;
        const qx = px + Math.cos(da) * dd, qz = pz + Math.sin(da) * dd;
        if (!duelSpotIsClear(qx, qz)) return;
        const yaw = Math.atan2(px - qx, pz - qz) + (wrng() - 0.5) * 0.3;
        if (yield* placeWreck(qx, qz, yaw)) {
          placedW++;
          yield { fine: true };
        }
      }
      function* tryPlaceRoadWreck(
        roadIndex: number,
        nodeIndex: number,
      ): Generator<PropsBuildSlice, void, void> {
        const side = wrng() < 0.5 ? -1 : 1;
        const offset = 6.5 + wrng() * 4.5;
        const at = authoredRoadStationIndex(L, roadIndex, nodeIndex);
        if (at < 0) return;
        const nodes = roads[roadIndex];
        const [ax, az] = nodes[at], [bx, bz] = nodes[at + 1];
        const length = Math.hypot(bx - ax, bz - az) || 1;
        const px = ax - ((bz - az) / length) * offset * side;
        const pz = az + ((bx - ax) / length) * offset * side;
        if (!wreckSpotIsClear(px, pz)) return;
        const yaw = Math.atan2(bx - ax, bz - az) + (wrng() - 0.5) * 0.9;
        if (!(yield* placeWreck(px, pz, yaw))) return;
        placedW++;
        yield { fine: true };
        yield* placePairedWreck(px, pz);
      }
      function* placeRoadWrecks(): Generator<PropsBuildSlice, void, void> {
        for (let ri = 0; ri < roads.length && placedW < wreckCount; ri++) {
          const count = authoredRoadStationCount(L, ri);
          for (let i = 5; i < count - 1 && placedW < wreckCount;
            i += 3 + ((wrng() * 2) | 0)) {
            if (bakedTris > 260000) break;
            yield* tryPlaceRoadWreck(ri, i);
          }
        }
      }
      function finalizeWreckMeshes(): void {
        if (wreckGeos.length === 0) return;
        const wm = new THREE.Mesh(mergeWreckGeometries(wreckGeos), mats.baked);
        wm.name = 'tank-wrecks';
        // PERF: the full hulks never enter the shadow passes — the factory's
        // own low-poly proxies (baked below in the same pose) cast instead,
        // exactly like live procedural tanks (installProceduralShadowProxies)
        wm.castShadow = false;
        wm.receiveShadow = true;
        wm.matrixAutoUpdate = false;
        group.add(wm);
        disposePlacedWreckGeometries(wreckGeos);
        if (wreckShadowGeos.length > 0) {
          const shadowMat = new THREE.MeshBasicMaterial({
            name: 'TankWreckShadowProxy', colorWrite: false, depthWrite: false,
          });
          const sm = new THREE.Mesh(mergeGeometries(wreckShadowGeos, false), shadowMat);
          sm.name = 'tank-wrecks-shadow';
          setShadowCasterProfile(sm, partsShadowProfile(wreckShadowGeos)); // round 79: one sphere per wreck
          sm.castShadow = true;
          sm.receiveShadow = false;
          sm.matrixAutoUpdate = false;
          markShadowOnly(sm);
          group.add(sm);
          disposePlacedWreckGeometries(wreckShadowGeos);
        }
      }
      function disposeWreckBakeCache(): void {
        for (const [key, baked] of bakeCache) {
          bakeCache.delete(key);
          if (!baked) continue;
          disposeWreckGeometry(baked.geo);
          if (baked.shadowGeo) disposeWreckGeometry(baked.shadowGeo);
        }
      }
      function disposeWreckGeometry(geometry: THREE.BufferGeometry): void {
        try { geometry.dispose(); } catch (_) { /* drain remaining owners */ }
      }
      function disposePlacedWreckGeometries(geometries: THREE.BufferGeometry[]): void {
        while (geometries.length) disposeWreckGeometry(geometries.pop()!);
      }
      try {
        yield* placeAuthoredWrecks();
        yield* placeRoadWrecks();
        finalizeWreckMeshes();
      } finally {
        // A rejected loading tick closes all delegated work. Cached bakes and
        // placed clones still waiting for the final merge remain ours, not the
        // world root's. Completed merged meshes own separate geometry buffers.
        disposeWreckBakeCache();
        disposePlacedWreckGeometries(wreckGeos);
        disposePlacedWreckGeometries(wreckShadowGeos);
      }
    }
  }
  yield* placeTankWrecks();
  yield { fine: true, stage: 'wrecks-finalized' };

  // regional-buildings lane (2026-10-03): the yards round a kit's houses (maps/regional/yards.ts), once every building,
  // wall, rock and wreck stands: a yard on each house's freest side, its fence or wall modules (destructibles) with a
  // gate, an outbuilding the kit builds and kitchen-garden beds, each placed only where it clears the road frontage,
  // the other plots, the solids, the objective discs and the spawn pads. Its own stream: nothing placed earlier moves.
  function placeRegionalYards(): void {
    if (!regionalArchitecture) return;
    if (regionalArchitecture.yard) placeYards(regionalArchitecture.yard, seed + 1307);
    // (the facades lane, 2026-10-06) the churchyard after the house yards, on a stream of its own (they stand as before),
    // its counts under their own key
    if (P.churchyard && regionalArchitecture.churchyard) {
      const houseYards = group.userData.regionalYards;
      delete group.userData.regionalYards;
      placeYards(regionalArchitecture.churchyard, seed + 1311);
      group.userData.regionalChurchyards = group.userData.regionalYards;
      if (houseYards) group.userData.regionalYards = houseYards;
      else delete group.userData.regionalYards;
    }
  }
  function placeYards(yard: YardStyle, streamSeed: number): void {
    if (!regionalArchitecture) return;
    const style = regionalArchitecture;
    const kinds = new Set(yard.kinds);
    const houses = buildingFeatures.filter((b) => b.kind && kinds.has(b.kind));
    if (!houses.length) return;
    const yrngYard = mulberry32(streamSeed);
    const keepOut = yardKeepOut(mapId, L.spawns,
      (cfg as { terrain?: { hardstands?: SceneryHardstand[] } } | null)?.terrain?.hardstands ?? [],
      heightField.bridgeDecks ?? []);
    const world: YardWorld = {
      ground: {
        roadDist: (x, z) => heightField._roadDist(x, z),
        water: (x, z) => heightField.getWaterMaskAt(x, z),
        normalY: (x, z) => heightField.getNormalAt(x, z).y,
      },
      plots: buildingFeatures, solids: obstacles, destructibles, keepOut,
    };
    const fenceMeta = resolveDestructibleMeta(destructibleContext, yard.fence);
    const seg = fenceMeta.wall ? WALL_SEG : FENCE_SEG, sink = fenceMeta.wall ? 0.1 : 0.06;
    // the stage's counts on the props group (receipts and captures read them)
    const stats = { houses: houses.length, yards: 0, streetYards: 0, modules: 0, gates: 0, sheds: 0, gardens: 0 };
    group.userData.regionalYards = stats;
    // a yard's ground grows no crop, tall grass or litter (map.ts holds these holes with the scenery's): discs over the
    // enclosure, from the house wall to its outer run (the close yard pairs of 2026-10-03: a Hessian farmyard full of
    // the field's wheat, its beds hidden in it)
    const holes: Array<{ x: number; z: number; r: number }> = group.userData.regionalYardHoles ?? [];
    group.userData.regionalYardHoles = holes;
    /** each yard's enclosure in its house's frame (the sown rows stop at it, trimCropRowsInYards) */
    const rects: Array<{ x: number; z: number; c: number; s: number; x0: number; x1: number; z0: number; z1: number }> = [];
    for (const house of houses) {
      const plan = planYard(house, world, yard, yrngYard, seg, regionalBodies.get(house));
      if (!plan) continue;
      stats.yards++;
      {
        const c = Math.cos(house.rot), s = Math.sin(house.rot);
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const p of [...plan.modules, ...(plan.gate ? [plan.gate] : []), ...(plan.shed ? [plan.shed] : []), ...(plan.garden ? [plan.garden] : [])]) {
          const dx = p.x - house.x, dz = p.z - house.z, lx = dx * c - dz * s, lz = dx * s + dz * c;
          x0 = Math.min(x0, lx); x1 = Math.max(x1, lx); z0 = Math.min(z0, lz); z1 = Math.max(z1, lz);
        }
        rects.push({ x: house.x, z: house.z, c, s, x0: x0 - 0.3, x1: x1 + 0.3, z0: z0 - 0.3, z1: z1 + 0.3 });
        const along = x1 - x0 >= z1 - z0, long = Math.max(x1 - x0, z1 - z0), short = Math.max(1, Math.min(x1 - x0, z1 - z0));
        const n = Math.max(1, Math.ceil(long / (short * 0.9)));
        const r = Math.hypot(short / 2, long / (2 * n)) + 0.3;
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          const lx = along ? x0 + (x1 - x0) * t : (x0 + x1) / 2, lz = along ? (z0 + z1) / 2 : z0 + (z1 - z0) * t;
          holes.push({ x: house.x + lx * c + lz * s, z: house.z - lx * s + lz * c, r });
        }
      }
      if (plan.street) stats.streetYards++;
      stats.modules += plan.modules.length;
      if (plan.gate && yard.gate) stats.gates++;
      for (const m of plan.modules) {
        const ya = heightField.getHeightAt(m.x - Math.sin(m.yaw) * seg / 2, m.z - Math.cos(m.yaw) * seg / 2);
        const yb = heightField.getHeightAt(m.x + Math.sin(m.yaw) * seg / 2, m.z + Math.cos(m.yaw) * seg / 2);
        addDestructible(yard.fence, m.x, Math.min(ya, yb) - sink, m.z, m.yaw, 0.96 + yrngYard() * 0.08, Math.atan2(yb - ya, seg) * 0.85);
      }
      if (plan.gate && yard.gate) addDestructible(yard.gate, plan.gate.x, heightField.getHeightAt(plan.gate.x, plan.gate.z) - 0.06, plan.gate.z, plan.gate.yaw, 1);
      if (plan.shed && yard.shed && style.builders[yard.shed]) {
        const { x, z, yaw, w: sw, d: sd } = plan.shed;
        const fit = groundFit(x, z, sw, sd, yaw);
        if (fit.spread <= 1.0) {
          const shedHoles: GroundCoverHole[] = [];
          const ctx: RegionalBuildContext = {
            structureId: yard.shed, info: { w: sw, d: sd, h: YARD_SHED.h }, wallBucket: 'plaster',
            bounds: { minX: -sw / 2, maxX: sw / 2, minZ: -sd / 2, maxZ: sd / 2, maxY: YARD_SHED.h },
            rng: streamFrom(hashSeed(`${style.id}:yardshed:${mapId}`, seed, x, z, yaw)),
            variant: streamFrom(hashSeed(`${style.id}:yardshed-variant:${mapId}`, seed, x, z, yaw)),
            mapId, snowCap: structureContext.snowCap, tier: mobileProps ? 'mobile' : 'desktop',
            // (the shed's strip holes wait for the shed to keep to its plot)
            ground: regionalGround(x, z, yaw, fit.y + 0.05, shedHoles),
          };
          const parts = buildRegionalParts(style, ctx, streamFrom(hashSeed(`${style.id}:yardshed-weather:${mapId}`, seed, x, z, yaw)));
          const solid = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
          for (const list of Object.values(parts)) for (const g of list) {
            if (g.userData.noCollision) continue;
            g.computeBoundingBox();
            const b = g.boundingBox;
            if (!b) continue;
            solid.minX = Math.min(solid.minX, b.min.x); solid.maxX = Math.max(solid.maxX, b.max.x);
            solid.minZ = Math.min(solid.minZ, b.min.z); solid.maxZ = Math.max(solid.maxZ, b.max.z);
          }
          // the kit's shed must keep to the shed's plot (its corner was cleared for that plot, not for more)
          if (Math.max(-solid.minX, solid.maxX) <= sw / 2 + 0.35 && Math.max(-solid.minZ, solid.maxZ) <= sd / 2 + 0.35) {
            const tmp = parts as unknown as PropsBuckets;
            addStructureCollision(yard.shed, tmp, x, fit.y + 0.05, z, yaw);
            _quat.setFromAxisAngle(_upAxis, yaw);
            _mat4.compose(_posv.set(x, fit.y + 0.05, z), _quat, _one);
            mergeInto(buckets, tmp, _mat4);
            buildingFeatures.push({ x, z, w: sw, d: sd, rot: yaw });
            for (const h of shedHoles) holes.push(h);
            stats.sheds++;
          } else {
            for (const list of Object.values(parts)) for (const g of list) g.dispose();
          }
        }
      }
      if (plan.garden && !mobileProps) {
        const { x, z, yaw, w, d } = plan.garden;
        const fit = groundFit(x, z, w, d, yaw);
        if (fit.spread <= 0.5) {
          const parts = (yard.graves ? graveParts : gardenParts)(w, d, mulberry32(hashSeed(`${style.id}:garden:${mapId}`, seed, x, z)), fit.spread);
          _quat.setFromAxisAngle(_upAxis, yaw);
          _mat4.compose(_posv.set(x, fit.y + fit.spread, z), _quat, _one);
          mergeInto(buckets, parts as unknown as PropsBuckets, _mat4);
          stats.gardens++;
        }
      }
    }
    trimCropRowsInYards(rects);
  }
  /**
   * A field's sown rows stop at a yard's fence (the close yard pairs of 2026-10-03: a Hessian farmyard standing in a
   * wheat plot, its beds hidden in the crop): every crop row span with a corner inside an enclosure leaves the merged
   * rows' index. The rows' vertices and their seeded draws stay as they were.
   */
  function trimCropRowsInYards(rects: ReadonlyArray<{ x: number; z: number; c: number; s: number; x0: number; x1: number; z0: number; z1: number }>): void {
    const crop = group.children.find((o) => o.name === 'crop-fields') as THREE.Mesh | undefined;
    const index = crop?.geometry.index;
    if (!crop || !index || !rects.length) return;
    const position = crop.geometry.getAttribute('position');
    const inYard = (v: number) => {
      const x = position.getX(v), z = position.getZ(v);
      for (const r of rects) {
        const dx = x - r.x, dz = z - r.z, lx = dx * r.c - dz * r.s, lz = dx * r.s + dz * r.c;
        if (lx > r.x0 && lx < r.x1 && lz > r.z0 && lz < r.z1) return true;
      }
      return false;
    };
    const kept: number[] = [];
    for (let t = 0; t + 2 < index.count; t += 3) {
      const a = index.getX(t), b = index.getX(t + 1), c = index.getX(t + 2);
      if (!inYard(a) && !inYard(b) && !inYard(c)) kept.push(a, b, c);
    }
    if (kept.length < index.count) crop.geometry.setIndex(kept);
  }
  placeRegionalYards();
  yield { fine: true, progress: false, stage: 'regional-yards' };

  // --- street rubble piles (urban): heaped masonry chunks + broken beams ---
  // r6: every 4th candidate may land in a 90 m OUTSKIRT band around the town
  // rect — shelled approaches carry debris too; the establishing camera used
  // to frame nothing but clean lawn between itself and the first block
  function beginWaterworksRubbleCapture(): WaterworksRubblePacket[] | null {
    return mapId === 'reservoir' && P.reservoirWaterworks ? [] : null;
  }
  const waterworksRubble = beginWaterworksRubbleCapture();
  function placeStreetRubble(): void {
    if (P.rubblePiles <= 0) return;
    const rrng = mulberry32(seed + 403);
    const placeRubbleCandidate = (candidateIndex: number): boolean => {
      const extension = candidateIndex % 4 === 0 ? 90 : 0;
      const x = town.x0 - extension + rrng() * (town.x1 - town.x0 + extension * 2);
      const z = town.z0 - extension + rrng() * (town.z1 - town.z0 + extension * 2);
      const outskirt = x < town.x0 || x > town.x1 || z < town.z0 || z > town.z1;
      const roadDistance = heightField._roadDist(x, z);
      if (roadDistance < 4.5 || roadDistance > (outskirt ? 70 : 16)) return false;
      const blocked = placedB.some((building) =>
        Math.hypot(x - building.x, z - building.z) < building.rr + 2.5);
      if (blocked) return false;
      const nearSpawn = [L.spawns.player, ...L.spawns.enemies]
        .some((spawn) => Math.hypot(x - spawn.x, z - spawn.z) < 20);
      if (nearSpawn || Math.hypot(x - junction.x, z - junction.z) < 16) return false;
      // a pile stands on dry ground, never in a channel or a lake
      if (heightField.getWaterMaskAt(x, z) > 0) return false;
      // The pile keeps its whole footprint out of the road core, moved off the road when it reaches in. Where no seat
      // within 8 m clears, it keeps its old seat: it is drive-through rubble, and its draws feed the next candidates.
      const pr = 1.6 + rrng() * 1.3;
      const seat = shiftClearOfRoadCore(heightField, x, z, (px, pz) => discClearOfRoadCore(heightField, px, pz, pr))
        ?? [x, z];
      // the map-vehicles lane (2026-10-08, the placement audit over the merge): a pile keeps half a metre off a tank
      // hulk placed before it (Skybridge's Sheridan lay 2.7 m deep in one); a refused pile skips its own draws, so the
      // later candidates' seats move, on the maps where a pile met a hulk only
      if (tankWreckSpots.some((w) => Math.hypot(Math.max(0, Math.abs(seat[0] - w.x) - w.hx), Math.max(0, Math.abs(seat[1] - w.z) - w.hz)) < pr + 0.5)) {
        return false;
      }
      const capture = waterworksRubble && waterworksRubble.length < 3;
      const stoneStart = capture ? buckets.stone.length : 0;
      const woodStart = capture ? buckets.wood.length : 0;
      addRubblePile(seat[0], seat[1], pr, rrng);
      if (capture) waterworksRubble!.push({
        stone: buckets.stone.slice(stoneStart), wood: buckets.wood.slice(woodStart),
        obstacle: obstacles[obstacles.length - 1], collider: colliders[colliders.length - 1],
      });
      return true;
    };
    for (let i = 0, placed = 0; i < P.rubblePiles * 14 && placed < P.rubblePiles; i++) {
      if (placeRubbleCandidate(i)) placed++;
    }
  }
  placeStreetRubble();
  yield { fine: true, progress: false, stage: 'street-rubble' };

  // --- street curbs (town maps): raised stone kerb lines along both sides of
  // every street inside the town rect, broken at crossings ---
  function placeStreetCurbs(): void {
    if (!P.curbs) return;
    // r6: urban kerbs/pavements read as CONCRETE, not planks — the urban
    // stone bucket is Bricks097 and its elongated courses on thin slabs read
    // as wooden boardwalk; route them to the plaster bucket on urban only
    // lighting_post r4: urban plaster (~0.88 albedo) on sun-facing horizontal
    // slabs rendered ~100% white ("sidewalks read emissive") — stone reads as
    // concrete-gray on every map.
    const kerbBucket = 'stone';
    // mr1 (2026-10-05): the kerb is seated on the carriageway, not stacked on the terrain. The critics' "town behind a
    // knee-high kerb" was the old seat: a level kerb 0.19 m over the terrain at its centre and a pavement pitched to the
    // terrain 6.35 m out, which stood up to 0.5 m over the road where the ground rose behind it (0.9 m on Blackglass's
    // banks). Now the kerb shows a KERB_FACE_M face over the carriageway beside it and follows the road's grade, the
    // pavement's inner edge is flush with the kerb's top, its outer edge climbs toward rising ground by at most
    // WALK_RISE_MAX_M, and both slabs reach down into lower ground instead of floating over it. A piece on a bridge
    // deck's span is left to the bridge's parapets. The kerbs are render geometry only (no collision record), and the
    // pieces skipped still draw their UV jitter, so every later draw of the dressing stream keeps its seat.
    const KERB_OFFSET_M = 5.05, KERB_DEPTH_M = 0.34, KERB_FACE_M = 0.12, KERB_EMBED_M = 0.10;
    const WALK_OFFSET_M = 6.35, WALK_DEPTH_M = 2.25, WALK_EMBED_M = 0.06, WALK_RISE_MAX_M = 0.25;
    const decks = heightField.bridgeDecks ?? [];
    const onDeckSpan = (x: number, z: number): boolean => decks.some((deck) => {
      const ox = x - deck.x, oz = z - deck.z;
      return Math.abs(ox * deck.ux + oz * deck.uz) < deck.halfLength + 1
        && Math.abs(ox * deck.uz - oz * deck.ux) < deck.halfWidth + 6;
    });
    /**
     * Seat a slab built along local x (its length) and z (across, +z = `outward` away from the road): each vertex takes
     * its end's height (x < 0 the piece's start, x > 0 its end) — the top from `top(end, outer)`, the bottom from
     * `foot(end)` — so the slab follows the grade along the road without a level step at its joints.
     */
    const seatSlab = (geometry: THREE.BufferGeometry, outward: number,
      top: (end: 0 | 1, outer: boolean) => number, foot: (end: 0 | 1) => number): void => {
      const position = geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const end = position.getX(i) > 0 ? 1 : 0;
        const outer = position.getZ(i) * outward > 0;
        position.setY(i, position.getY(i) > 0 ? top(end, outer) : foot(end));
      }
      position.needsUpdate = true;
      geometry.computeVertexNormals();
    };
    for (let ri = 0; ri < roads.length; ri++) {
      const nodes = roads[ri];
      for (let i = 0; i < nodes.length - 1; i++) {
        const [ax, az] = nodes[i], [bx, bz] = nodes[i + 1];
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (mx < town.x0 - 6 || mx > town.x1 + 6 || mz < town.z0 - 6 || mz > town.z1 + 6) continue;
        const dx = bx - ax, dz = bz - az;
        const len = Math.hypot(dx, dz);
        const tx = dx / len, tz = dz / len;
        const nSub = Math.max(1, Math.ceil(len / 5.2));
        const segLen = (len / nSub) * 1.03;
        const yaw = -Math.atan2(tz, tx);
        for (let k = 0; k < nSub; k++) {
          const tt0 = k / nSub, tt = (k + 0.5) / nSub, tt1 = (k + 1) / nSub;
          const cx = ax + dx * tt, cz = az + dz * tt;
          for (const side of [-1, 1]) {
            const px = cx - tz * side * KERB_OFFSET_M, pz = cz + tx * side * KERB_OFFSET_M;
            if (distToOtherRoads(px, pz, ri) < 6.8) continue; // open corners
            // the ground at the piece's start (end 0) and end (end 1), `offset` metres off the centreline on this side
            const ground = (end: 0 | 1, offset: number): number => {
              const t = end ? tt1 : tt0;
              return heightField.getHeightAt(ax + dx * t - tz * side * offset, az + dz * t + tx * side * offset);
            };
            // the carriageway at the kerb's face, the ground behind the kerb, and the pavement's two edges
            const road = [ground(0, KERB_OFFSET_M - KERB_DEPTH_M / 2), ground(1, KERB_OFFSET_M - KERB_DEPTH_M / 2)];
            const behind = [ground(0, KERB_OFFSET_M + KERB_DEPTH_M / 2), ground(1, KERB_OFFSET_M + KERB_DEPTH_M / 2)];
            const inner = [ground(0, WALK_OFFSET_M - WALK_DEPTH_M / 2), ground(1, WALK_OFFSET_M - WALK_DEPTH_M / 2)];
            const outer = [ground(0, WALK_OFFSET_M + WALK_DEPTH_M / 2), ground(1, WALK_OFFSET_M + WALK_DEPTH_M / 2)];
            const kerbTop = [road[0] + KERB_FACE_M, road[1] + KERB_FACE_M];
            const kerbFoot = [Math.min(road[0], behind[0]) - KERB_EMBED_M, Math.min(road[1], behind[1]) - KERB_EMBED_M];
            const rise = [clamp(outer[0] + 0.03 - kerbTop[0], 0, WALK_RISE_MAX_M), clamp(outer[1] + 0.03 - kerbTop[1], 0, WALK_RISE_MAX_M)];
            const walkFoot = [Math.min(inner[0], outer[0], kerbTop[0]) - WALK_EMBED_M, Math.min(inner[1], outer[1], kerbTop[1]) - WALK_EMBED_M];
            const spanned = onDeckSpan(cx, cz);
            const g = slabBox(segLen, (kerbTop[0] - kerbFoot[0] + kerbTop[1] - kerbFoot[1]) / 2, KERB_DEPTH_M, 1.3);
            jitterUV(g, rng);
            // r5: PAVEMENT slab behind the kerb — a 2.2 m sidewalk strip flanking every street. The critique's "town =
            // boxes dropped on a lawn" came straight from streets with no built edge between asphalt and grass.
            const walk = slabBox(segLen, (kerbTop[0] + rise[0] / 2 - walkFoot[0] + kerbTop[1] + rise[1] / 2 - walkFoot[1]) / 2,
              WALK_DEPTH_M, 0.9); // r2: un-stretched paving
            jitterUV(walk, rng);
            if (spanned) { g.dispose(); walk.dispose(); continue; }
            seatSlab(g, side, (end) => kerbTop[end], (end) => kerbFoot[end]);
            g.rotateY(yaw);
            g.translate(px, 0, pz);
            buckets[kerbBucket].push(g);
            seatSlab(walk, side, (end, isOuter) => kerbTop[end] + (isOuter ? rise[end] : 0), (end) => walkFoot[end]);
            walk.rotateY(yaw);
            walk.translate(cx - tz * side * WALK_OFFSET_M, 0, cz + tx * side * WALK_OFFSET_M);
            buckets[kerbBucket].push(walk);
          }
        }
      }
    }
  }
  placeStreetCurbs();
  yield { fine: true, progress: false, stage: 'street-curbs' };

  // --- central-square monument (town maps): stepped stone obelisk ---
  function placeCentralMonument(): void {
    if (!P.monument) return;
    let ox = junction.x - 8, oz = junction.z - 9;
    for (let i = 0; i < 24 && heightField._roadDist(ox, oz) < 6; i++) { ox -= 1.5; oz -= 1; }
    const oy = heightField.getHeightAt(ox, oz);
    buckets.stone.push(box(2.4, 0.5, 2.4, 0.8).translate(ox, oy + 0.2, oz));
    buckets.stone.push(box(1.5, 0.6, 1.5, 0.8).translate(ox, oy + 0.72, oz));
    const shaft = box(0.72, 3.4, 0.72, 1.2);
    jitterUV(shaft, rng);
    buckets.stone.push(shaft.translate(ox, oy + 2.7, oz));
    const tip = new THREE.ConeGeometry(0.5, 0.7, 4, 1);
    tip.rotateY(Math.PI / 4);
    scaleUV(tip, 1, 1);
    tip.translate(ox, oy + 4.75, oz);
    buckets.stone.push(tip);
    obstacles.push({ min: [ox - 1.3, oy, oz - 1.3], max: [ox + 1.3, oy + 5.1, oz + 1.3] });
    colliders.push({ min: [ox - 1.3, oy, oz - 1.3], max: [ox + 1.3, oy + 5.1, oz + 1.3] });
  }
  placeCentralMonument();
  yield { fine: true, stage: 'street-details' };

  // --- ground-blend decals: dirt/AO ring under buildings + shell craters ---
  function* placeGroundBlendDecals(): Generator<PropsBuildSlice, void, void> {
    // r5 terrain_environment: TRACK-TEAR strip texture — churned dark earth
    // with two ragged tread lanes running along V; laid as conformed strips
    // on the AI drive corridors so the approaches read fought-over.
    function makeChurnTexture(): THREE.CanvasTexture {
      const w = 128, h = 256;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = canvas2d(c, { willReadFrequently: true });
      ctx.clearRect(0, 0, w, h);
      const trng = mulberry32(9131);
      // churned base band
      for (let y = 0; y < h; y += 2) {
        const wob = noi.noise(y * 0.05, 3.7) * 10;
        const grd = ctx.createLinearGradient(0, 0, w, 0);
        grd.addColorStop(0, 'rgba(60,48,32,0)');
        grd.addColorStop(0.22, 'rgba(52,41,27,0.62)');
        grd.addColorStop(0.5, 'rgba(58,46,30,0.72)');
        grd.addColorStop(0.78, 'rgba(52,41,27,0.62)');
        grd.addColorStop(1, 'rgba(60,48,32,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(wob, y, w - wob * 2, 2.4);
      }
      // twin tread lanes: darker compacted ruts with lug chatter
      for (const lane of [0.32, 0.68]) {
        for (let y = 0; y < h; y += 3) {
          const wobL = noi.noise(y * 0.07, lane * 9) * 5;
          ctx.fillStyle = `rgba(28,22,15,${0.55 + (trng() * 0.3)})`;
          ctx.fillRect(w * lane - 7 + wobL, y, 14, 2.2);
        }
        for (let y = 0; y < h; y += 7) { // lug marks across the rut
          ctx.fillStyle = 'rgba(20,16,11,0.5)';
          ctx.fillRect(w * lane - 8 + trng() * 3, y + trng() * 3, 16, 1.6);
        }
      }
      // fade both ends + ragged alpha
      const id = ctx.getImageData(0, 0, w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const vv = y / h;
        const endFade = smoothstep(0, 0.14, vv) * smoothstep(1, 0.86, vv);
        const nse = noi.noise(x * 0.12 + 80, y * 0.12) * 0.5 + 0.5;
        id.data[(y * w + x) * 4 + 3] *= endFade * clamp(0.75 + nse * 0.5, 0, 1);
      }
      ctx.putImageData(id, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      return t;
    }
    // terrain-conformed rectangular strip (track tears): stations every ~2.4 m
    function conformedStrip(
      ax: number,
      az: number,
      bx: number,
      bz: number,
      wS: number,
    ): THREE.BufferGeometry {
      const len = Math.hypot(bx - ax, bz - az);
      const nSt = Math.max(3, Math.ceil(len / 2.4));
      const tx = (bx - ax) / len, tz = (bz - az) / len;
      const nx = -tz, nz = tx;
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      for (let i = 0; i <= nSt; i++) {
        const t = i / nSt;
        const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
        for (const sd of [-1, 1]) {
          const px = cx + nx * sd * wS / 2, pz = cz + nz * sd * wS / 2;
          pos.push(px, heightField.getHeightAt(px, pz) + 0.05, pz);
          uv.push(sd < 0 ? 0 : 1, t);
        }
        if (i > 0) {
          const b0 = (i - 1) * 2, b1 = i * 2;
          idx.push(b0, b1, b0 + 1, b0 + 1, b1, b1 + 1);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return geo;
    }
    // terrain-conformed disc; profile[] lifts each ring above the ground
    // the scenery lane (Coastal boulder-a, gauntlet wave 74: "a hard, straight dark line along the grass bank's edge …
    // the rock looks cut in two"): the ground as the nearest terrain mesh draws it (terrain.ts terrainNearMeshHeightAt:
    // its finest grid and its cells' diagonal), not the analytic height, which stands above the mesh on a bank's lip — a
    // patch conformed to that floated over the drawn lip and showed edge-on
    const groundHeightAt = (px: number, pz: number): number => heightField.getHeightAt(px, pz);
    const meshHeightAt = (px: number, pz: number): number => terrainNearMeshHeightAt(nearMeshVertexHeight, px, pz);
    // (b12, the coordinator after the Coastal re-shoot: "lighten the patch's inner ring") the ground contact patches carry
    // each ring's share of their darkness in a vertex alpha; a boulder's patch keeps its soft outer shadow but lightens
    // toward the stone, whose foot covers the inner rings and leaves only a sliver showing at a bank's lip (a crease, not a
    // contact). Only the contact layer passes shares; the other decals keep their geometry as it was.
    const FULL_PATCH: readonly number[] = [1, 1, 1, 1];
    const ROCK_PATCH = ROCK_PATCH_SHARES; // (b16: the bed shades take the same, buildRockBeds)
    // (b44) each kind's share of the contact layer's darkening, carried in the patch's vertex RGB (the contact material
    // reads its red): a boulder's foot full (its bed's shades too: they carry 1), a crushable prop's and a field stack's
    // less, a building's foundation least (its walls stand on it, and a village keeps its yards' own ground)
    const CONTACT_STRENGTH = Object.freeze({ rock: 1, prop: 0.75, stack: 0.75, foundation: 0.45 });
    function conformedDisc(
      x: number,
      z: number,
      r: number,
      profile: readonly number[],
      onMesh = false,
      shares: readonly number[] | null = null,
      strength = 1,
    ): THREE.BufferGeometry {
      const rings = CONTACT_PATCH_RINGS, segs = 18;
      const nv = 1 + (rings.length - 1) * segs;
      const pos = new Float32Array(nv * 3);
      const uv = new Float32Array(nv * 2);
      // (the alpha of every vertex is its ring's share, written below; the RGB the kind's strength)
      const tint = shares ? new Float32Array(nv * 4).fill(strength) : null;
      const groundAt = onMesh ? meshHeightAt : groundHeightAt;
      pos[0] = x; pos[1] = groundAt(x, z) + profile[0]; pos[2] = z;
      uv[0] = 0.5; uv[1] = 0.5;
      if (tint && shares) tint[3] = shares[0];
      let vi = 1;
      for (let ri = 1; ri < rings.length; ri++) {
        for (let k = 0; k < segs; k++) {
          const a = (k / segs) * Math.PI * 2;
          const px = x + Math.cos(a) * r * rings[ri], pz = z + Math.sin(a) * r * rings[ri];
          pos[vi * 3] = px;
          pos[vi * 3 + 1] = groundAt(px, pz) + profile[ri];
          pos[vi * 3 + 2] = pz;
          uv[vi * 2] = 0.5 + Math.cos(a) * 0.5 * rings[ri];
          uv[vi * 2 + 1] = 0.5 + Math.sin(a) * 0.5 * rings[ri];
          if (tint && shares) tint[vi * 4 + 3] = shares[ri];
          vi++;
        }
      }
      const idx: number[] = [];
      for (let k = 0; k < segs; k++) idx.push(0, 1 + k, 1 + ((k + 1) % segs));
      for (let ri = 1; ri < rings.length - 1; ri++) {
        const a0 = 1 + (ri - 1) * segs, b0 = 1 + ri * segs;
        for (let k = 0; k < segs; k++) {
          const k1 = (k + 1) % segs;
          idx.push(a0 + k, b0 + k, a0 + k1, a0 + k1, b0 + k, b0 + k1);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      if (tint) geo.setAttribute('color', new THREE.BufferAttribute(tint, 4));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return geo;
    }
    // r6 (content_breadth): terrain-conformed ROTATED RECT (building aprons)
    // — 5x5 vertex grid so the sheet follows the ground; uv spans 0..1 for
    // the square-falloff apron texture.
    function conformedRect(
      cx: number,
      cz: number,
      hw: number,
      hd: number,
      rot: number,
    ): THREE.BufferGeometry {
      const nx = 5, nz = 5;
      const cosR = Math.cos(rot), sinR = Math.sin(rot);
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      for (let iz = 0; iz < nz; iz++) {
        for (let ix = 0; ix < nx; ix++) {
          const u = ix / (nx - 1), vv = iz / (nz - 1);
          const lx = (u - 0.5) * 2 * hw, lz = (vv - 0.5) * 2 * hd;
          const px = cx + lx * cosR + lz * sinR;
          const pz = cz - lx * sinR + lz * cosR;
          pos.push(px, heightField.getHeightAt(px, pz) + 0.06, pz);
          uv.push(u, vv);
        }
      }
      for (let iz = 0; iz < nz - 1; iz++) {
        for (let ix = 0; ix < nx - 1; ix++) {
          const a = iz * nx + ix, b = a + 1, c2 = a + nx, d2 = c2 + 1;
          idx.push(a, c2, b, b, c2, d2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return geo;
    }
    function addDecalMesh(geos: THREE.BufferGeometry[], tex: THREE.Texture, {
      receiveShadow = true,
      groundContact = false,
      decalKind = 'surface',
    }: {
      receiveShadow?: boolean;
      groundContact?: boolean;
      decalKind?: string;
    } = {}) {
      if (geos.length === 0) return null;
      // (b44) the contact layer darkens the ground it lies on (contactDarkeningMaterial); the other decals are lit
      const mat: THREE.Material = groundContact ? contactDarkeningMaterial(tex) : new THREE.MeshStandardMaterial({
        map: tex, transparent: true, depthWrite: false,
        roughness: 0.97, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      if (receiveShadow && !groundContact) engineCtx.setupShadowMaterial(mat as THREE.MeshStandardMaterial);
      // (the contact layer's per-ring shares ride its vertex alpha)
      if (geos[0].getAttribute('color')) mat.vertexColors = true;
      const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
      // Foundation/contact tint already supplies the small-scale grounding
      // term. Letting the live CSM shade that translucent layer again stacks
      // two darkening systems and makes cascade movement read as a flashing
      // ground texture. Authored surface decals (craters, aprons, churn) still
      // receive directional shadows; only the contact layer opts out.
      mesh.receiveShadow = receiveShadow;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = 1;
      mesh.userData.groundContactDecal = groundContact;
      mesh.userData.terrainDecal = true;
      mesh.userData.terrainDecalKind = decalKind;
      mesh.userData.decalParts = geos.length;
      group.add(mesh);
      return mesh.geometry;
    }
    function* collectFoundationDecals(
      dirtDiscs: THREE.BufferGeometry[],
      apronGeos: THREE.BufferGeometry[],
    ): Generator<PropsBuildSlice, void, void> {
      for (const building of buildingFeatures) {
        if (building.landmark) continue; // a set piece is grounded by its own plinths
        if (P.streetRows) {
          apronGeos.push(conformedRect(building.x, building.z,
            building.w / 2 + 2.8, building.d / 2 + 2.8, building.rot || 0));
        } else {
          dirtDiscs.push(conformedDisc(building.x, building.z,
            Math.max(building.w, building.d) * 1.2, [0.05, 0.05, 0.05, 0.04], false, FULL_PATCH, CONTACT_STRENGTH.foundation));
        }
        yield { fine: true, progress: false, stage: 'ground-foundation-instances' };
      }
      for (const prop of crushables) {
        dirtDiscs.push(conformedDisc(prop.x, prop.z, 1.15, [0.05, 0.05, 0.04, 0.03], false, FULL_PATCH, CONTACT_STRENGTH.prop));
        yield { fine: true, progress: false, stage: 'ground-foundation-instances' };
      }
      for (const stack of stackSpots) {
        dirtDiscs.push(conformedDisc(stack.x, stack.z, stack.r, [0.05, 0.05, 0.04, 0.03], false, FULL_PATCH, CONTACT_STRENGTH.stack));
        yield { fine: true, progress: false, stage: 'ground-foundation-instances' };
      }
      for (const spot of rockSpots) {
        dirtDiscs.push(conformedDisc(spot.x, spot.z, spot.r, [0.04, 0.04, 0.04, 0.03], true, ROCK_PATCH, CONTACT_STRENGTH.rock));
        yield { fine: true, progress: false, stage: 'ground-foundation-instances' };
      }
      // (b16) and over each bed, its patch's soil where the bed stands above the ground the disc lies on
      for (const shade of rockBedShades) dirtDiscs.push(shade);
    }
    function courtyardDecalIsClear(x: number, z: number): boolean {
      const roadDistance = heightField._roadDist(x, z);
      if (roadDistance < 7 || roadDistance > 40) return false;
      const onBuilding = placedB.some((building) =>
        Math.hypot(x - building.x, z - building.z) < building.rr + 1);
      return !onBuilding && !noVeg(x, z);
    }
    function* collectCourtyardDecals(apronGeos: THREE.BufferGeometry[]): Generator<PropsBuildSlice, void, void> {
      if (!P.streetRows) return;
      const crng2 = mulberry32(seed + 771);
      for (let i = 0, placed = 0; i < 700 && placed < 84; i++) {
        const x = town.x0 + crng2() * (town.x1 - town.x0);
        const z = town.z0 + crng2() * (town.z1 - town.z0);
        if (!courtyardDecalIsClear(x, z)) continue;
        apronGeos.push(conformedDisc(x, z,
          4.5 + crng2() * 7.0, [0.04, 0.04, 0.04, 0.03]));
        placed++;
        yield { fine: true, progress: false, stage: 'ground-foundation-instances' };
      }
    }
    function* placeFoundationDecals(): Generator<PropsBuildSlice, void, void> {
      const dirtDiscs: THREE.BufferGeometry[] = [];
      const apronGeos: THREE.BufferGeometry[] = [];
      let collected = false;
      try {
        yield* collectFoundationDecals(dirtDiscs, apronGeos);
        yield* collectCourtyardDecals(apronGeos);
        collected = true;
      } finally {
        if (!collected) {
          // Only private inputs exist at these checkpoints. Drain every input
          // on IteratorClose without masking the owning build's cancellation.
          for (const geometries of [dirtDiscs, apronGeos]) {
            for (const geometry of geometries) {
              try { geometry.dispose(); } catch (_) { /* continue releasing private inputs */ }
            }
          }
        }
      }
      const contactGeometry = addDecalMesh(dirtDiscs, makeGroundDecalTexture(noi, aniso, 'dirt'), {
        receiveShadow: false,
        groundContact: true,
        decalKind: 'ground-contact',
      });
      if (foundryDonors && !P.streetRows && contactGeometry) {
        // Keep the same merged decal and vertex windows. Only the six moved
        // foundations are resampled against their new terrain after dressing.
        const windows = foundryDonors.map(donor => {
          const index = buildingFeatures.indexOf(donor.feature);
          let offset = 0;
          for (let i = 0; i < index; i++) offset += dirtDiscs[i].attributes.position.count;
          return { feature: donor.feature, offset };
        });
        reconformFoundryFoundations = () => {
          for (const { feature, offset } of windows) {
            const replacement = conformedDisc(feature.x, feature.z,
              Math.max(feature.w, feature.d) * 1.2, [0.05, 0.05, 0.05, 0.04]);
            for (const name of ['position', 'normal']) {
              const from = replacement.getAttribute(name), to = contactGeometry.getAttribute(name);
              for (let i = 0; i < from.count; i++) to.setXYZ(offset + i, from.getX(i), from.getY(i), from.getZ(i));
              to.needsUpdate = true;
            }
            replacement.dispose();
          }
          contactGeometry.computeBoundingBox();
          contactGeometry.computeBoundingSphere();
        };
      }
      addDecalMesh(apronGeos, makeGroundDecalTexture(noi, aniso, 'apron'), {
        decalKind: 'apron',
      });
    }
    // craters: scattered shell holes with a raised rim mound. Town maps
    // (P.townCraters) let them pock the streets and squares themselves —
    // the contract's shelled-town read needs impact scars ON the asphalt,
    // not just in the fields outside the rect.
    // r5 terrain_environment: CRATER KIT rebuild. The old soft scorch smudge
    // + 0.14-0.26 m rim never registered ("zero battle scarring ... pristine
    // lawns", critique). Now: (a) a dedicated crater texture (black pit, raw
    // rim earth, ejecta rays), (b) a REAL raised rim mound (0.26-0.48 m at
    // the 0.7 ring — catches sun/shadow so the scar reads in silhouette),
    // (c) 3 radius classes, (d) ~55% of craters CLUSTER along the AI drive
    // corridors (spawn -> objective) where the eye actually looks, and (e) a
    // debris-clod ring around the larger holes.
    const CR_R = [2.3, 3.6, 5.2, 6.8];
    type DriveCorridor = [number, number, number, number];
    function addCraterClods(x: number, z: number, radius: number): void {
      const count = 4 + ((rng() * 3) | 0);
      for (let index = 0; index < count; index++) {
        const angle = rng() * Math.PI * 2;
        const distance = radius * (0.68 + rng() * 0.45);
        const size = 0.14 + rng() * 0.26;
        const clod = roughenChunk(box(size * 1.4, size * 0.7, size, 1.3), rng, size * 0.4);
        jitterUV(clod, rng);
        clod.rotateY(rng() * Math.PI);
        const clodX = x + Math.cos(angle) * distance;
        const clodZ = z + Math.sin(angle) * distance;
        clod.translate(clodX, heightField.getHeightAt(clodX, clodZ) + size * 0.25, clodZ);
        buckets.stone.push(clod);
      }
    }
    function randomCraterCenter(corridors: DriveCorridor[]): [number, number] {
      let x, z;
      if (rng() < 0.55 && corridors.length) { // corridor-clustered scarring
        const co = corridors[(rng() * corridors.length) | 0];
        const t = 0.16 + rng() * 0.74;
        const lat = (rng() - 0.5) * 44;
        const dx = co[2] - co[0], dz = co[3] - co[1];
        const dl = Math.hypot(dx, dz) || 1;
        x = co[0] + dx * t - (dz / dl) * lat;
        z = co[1] + dz * t + (dx / dl) * lat;
      } else {
        x = (rng() * 2 - 1) * 420; z = (rng() * 2 - 1) * 420;
      }
      return [x, z];
    }
    function craterCenterIsClear(x: number, z: number): boolean {
      if (Math.max(Math.abs(x), Math.abs(z)) > 430) return false;
      const inTown = x > v.x0 - 4 && x < v.x1 + 4 && z > v.z0 - 4 && z < v.z1 + 4;
      if (inTown && !P.townCraters) return false;
      if (heightField._roadDist(x, z) < (inTown ? 1.5 : 5.5)) return false;
      if (inTown) {
        const onBuilding = placedB.some((building) =>
          Math.hypot(x - building.x, z - building.z) < building.rr + 1.5);
        if (onBuilding) return false;
      }
      if (heightField.getGroundType(x, z) === 'soft' || noVeg(x, z)) return false;
      return ![L.spawns.player, ...L.spawns.enemies]
        .some((spawn) => Math.hypot(x - spawn.x, z - spawn.z) < 20);
    }
    function tryPlaceBattleScar(
      corridors: DriveCorridor[],
      craterDiscs: THREE.BufferGeometry[],
      burnDiscs: THREE.BufferGeometry[],
    ): boolean {
      const [x, z] = randomCraterCenter(corridors);
      if (!craterCenterIsClear(x, z)) return false;
      const roll = rng();
      if (roll < 0.24) { // burnt patch, no rim — HE strike / burn scar
        burnDiscs.push(conformedDisc(x, z, 2.6 + rng() * 2.6, [0.03, 0.03, 0.04, 0.02]));
        return true;
      }
      const r = CR_R[(rng() * CR_R.length) | 0] * (0.85 + rng() * 0.3);
      const rim = 0.26 + rng() * 0.22;
      craterDiscs.push(conformedDisc(x, z, r, [0.03, 0.02, rim, 0.02]));
      if (r > 3.2) addCraterClods(x, z, r);
      return true;
    }
    function placeBattleScars(corridors: DriveCorridor[]): void {
      const craterDiscs: THREE.BufferGeometry[] = [];
      const burnDiscs: THREE.BufferGeometry[] = [];
      // 2026-09-14 campaign flavour: desktop tiers carry 35 % more shell craters and burn scars.
      const craterCap = richCount(P.craters);
      for (let i = 0, placed = 0; i < craterCap * 14 && placed < craterCap; i++) {
        if (tryPlaceBattleScar(corridors, craterDiscs, burnDiscs)) placed++;
      }
      for (const [wx, wz] of wreckScorch) {
        burnDiscs.push(conformedDisc(wx, wz, 5.6, [0.03, 0.04, 0.05, 0.02]));
      }
      addDecalMesh(craterDiscs, makeGroundDecalTexture(noi, aniso, 'crater'), {
        decalKind: 'crater',
      });
      addDecalMesh(burnDiscs, makeGroundDecalTexture(noi, aniso, 'scorch'), {
        decalKind: 'scorch',
      });
    }
    // r5 terrain_environment: TRACK-TEAR strips along the AI corridors —
    // tread-churned earth runs (14-26 m) with twin rut lanes, conformed to
    // the terrain, so the approaches read driven-over ("no tread-torn earth
    // beyond faint road ruts", critique).
    function placeTrackTears(corridors: DriveCorridor[]): void {
      const trng = mulberry32(seed + 5115);
      const tearGeos: THREE.BufferGeometry[] = [];
      const nTears = richCount(P.streetRows ? 10 : 16); // 2026-09-14 campaign flavour: more tread-torn approaches on desktop
      for (let i = 0, placed = 0; i < nTears * 10 && placed < nTears; i++) {
        const co = corridors[(trng() * corridors.length) | 0];
        const t = 0.18 + trng() * 0.66;
        const dx = co[2] - co[0], dz = co[3] - co[1];
        const dl = Math.hypot(dx, dz) || 1;
        const lat = (trng() - 0.5) * 30;
        const cx = co[0] + dx * t - (dz / dl) * lat;
        const cz = co[1] + dz * t + (dx / dl) * lat;
        if (Math.max(Math.abs(cx), Math.abs(cz)) > 420) continue;
        if (heightField._roadDist(cx, cz) < 6) continue;
        if (heightField.getGroundType(cx, cz) === 'soft' || noVeg(cx, cz)) continue;
        if (heightField.getNormalAt(cx, cz).y < 0.86) continue;
        let onB = false;
        for (const pb of placedB) {
          if (Math.hypot(cx - pb.x, cz - pb.z) < pb.rr + 2) { onB = true; break; }
        }
        if (onB) continue;
        const ang = Math.atan2(dz, dx) + (trng() - 0.5) * 0.5;
        const hl = 7 + trng() * 6; // half length
        tearGeos.push(conformedStrip(
          cx - Math.cos(ang) * hl, cz - Math.sin(ang) * hl,
          cx + Math.cos(ang) * hl, cz + Math.sin(ang) * hl,
          3.2 + trng() * 0.8));
        placed++;
      }
      addDecalMesh(tearGeos, makeChurnTexture(), { decalKind: 'churn' });
    }
    const corridors: DriveCorridor[] = [L.spawns.player, ...L.spawns.enemies]
      .map((spawn) => [spawn.x, spawn.z, town.cx ?? 10, town.cz ?? 40]);
    yield* placeFoundationDecals();
    // Yield only after a complete family transfers its meshes to the props
    // group. Foundation inputs above stay private until collection completes.
    yield { fine: true, progress: false, stage: 'ground-foundations' };
    placeBattleScars(corridors);
    yield { fine: true, progress: false, stage: 'ground-scars' };
    placeTrackTears(corridors);
  }
  yield* placeGroundBlendDecals();
  // The map-revival lane (2026-10-05): paint on the paved ground (P.groundMarkings; groundMarkings.ts) — one merged,
  // receive-only decal mesh: no shadow cast, the cascades' light on it like the ground's own decals, seated on the
  // terrain mesh as drawn (the scenery lane's meshHeightAt law) 3.5 cm up, over every other ground decal.
  function placeGroundMarkings(markings: GroundMarkingsConfig): void {
    const groundAt = (px: number, pz: number): number => heightField.getHeightAt(px, pz);
    // paint only on ground the material draws as paving (groundMarkings.ts pavedGround: an apron's rect, a road's line)
    const paved = pavedGround((cfg as { terrain?: { hardstands?: SceneryHardstand[] } } | null)?.terrain?.hardstands ?? [], L.roads);
    const built = buildGroundMarkingGeometry(markings, (px, pz) => terrainNearMeshHeightAt(groundAt, px, pz), 0.035, paved);
    if (!built) return;
    const mat = new THREE.MeshStandardMaterial({
      map: wornPaintTexture(aniso), vertexColors: true, transparent: true, depthWrite: false,
      roughness: 0.92, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    engineCtx.setupShadowMaterial(mat);
    const mesh = new THREE.Mesh(built.geometry, mat);
    mesh.name = 'ground-markings';
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 2;
    mesh.userData.terrainDecal = true;
    mesh.userData.terrainDecalKind = 'paint';
    mesh.userData.decalParts = built.pieces;
    group.add(mesh);
  }
  if (P.groundMarkings) placeGroundMarkings(P.groundMarkings);
  yield { fine: true, stage: 'ground-decals' };

  // --- sourced-model InstancedMeshes (one per model, shared baked material) ---
  let poleIM: PoleMatrixWriter | null = null; // effects_combat r1: virtual writer for hinge-topple matrices
  let poleFullIM: THREE.InstancedMesh | null = null;
  let poleDistanceIM: THREE.InstancedMesh | null = null;
  let poleMatrices: THREE.Matrix4[] | null = null;
  let poleHigh: Uint8Array | null = null;
  let poleLodDirty = false;
  const lastPoleCamera = new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN);

  function rebuildPoleInstances(): void {
    if (!poleFullIM || !poleDistanceIM || !poleMatrices || !poleHigh) return;
    let fullCount = 0, distanceCount = 0;
    for (let i = 0; i < poleMatrices.length; i++) {
      if (poleHigh[i]) poleFullIM.setMatrixAt(fullCount++, poleMatrices[i]);
      else poleDistanceIM.setMatrixAt(distanceCount++, poleMatrices[i]);
    }
    poleFullIM.count = fullCount;
    poleDistanceIM.count = distanceCount;
    poleFullIM.visible = fullCount > 0;
    poleDistanceIM.visible = distanceCount > 0;
    poleFullIM.instanceMatrix.needsUpdate = true;
    poleDistanceIM.instanceMatrix.needsUpdate = true;
    poleLodDirty = false;
  }

  function movedPoleCamera(cameraPos: THREE.Vector3): boolean {
    return !Number.isFinite(lastPoleCamera.x)
      || lastPoleCamera.distanceToSquared(cameraPos) > 64;
  }

  function reclassifyPoleInstances(cameraPos: THREE.Vector3): boolean {
    if (!poleMatrices || !poleHigh) return false;
    let changed = false;
    lastPoleCamera.copy(cameraPos);
    for (let i = 0; i < poleMatrices.length; i++) {
      const e = poleMatrices[i].elements;
      const d = Math.hypot(e[12] - cameraPos.x, e[14] - cameraPos.z);
      // Hysteresis keeps a moving chase camera from repartitioning at the
      // boundary. The full model remains exact through 105 m and only
      // yields after 120 m, where the compact crossarm is screen-equivalent.
      const wasHigh = poleHigh[i] !== 0;
      const high = wasHigh ? d <= 120 : d < 105;
      if (high !== wasHigh) { poleHigh[i] = high ? 1 : 0; changed = true; }
    }
    return changed;
  }

  // the scenery lane (wave 74, the cascade trim): the rocks' near and far pools, repartitioned when the camera has moved
  // 8 m, with hysteresis (the desktop form through ROCK_FAR_M, the phone form beyond ROCK_FAR_M + 10). A pass allocates
  // nothing: index loops over the build's typed arrays, the placements' own matrices, the pools' own buffers
  const lastRockCamera = new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN);
  // (the passes' start and duration, the last 64 of them, for the probes: a chase drive lines its long tasks up with them)
  const rockLodTrace = { at: new Float64Array(64), ms: new Float32Array(64), n: 0 };
  group.userData.rockLodTrace = rockLodTrace;
  function updateRockLod(cameraPos: THREE.Vector3 | null, force = false): void {
    if (rockLod.length === 0 || !cameraPos || !Number.isFinite(cameraPos.x) || !Number.isFinite(cameraPos.z)) return;
    if (!force && Number.isFinite(lastRockCamera.x) && lastRockCamera.distanceToSquared(cameraPos) <= 64) return;
    const startedAt = performance.now();
    const first = !Number.isFinite(lastRockCamera.x);
    lastRockCamera.copy(cameraPos);
    for (let p = 0; p < rockLod.length; p++) {
      const lod = rockLod[p], loose = lod.loose, high = lod.high, placements = lod.placements;
      let changed = first || force;
      for (let k = 0; k < loose.length; k++) {
        const i = loose[k], e = placements[i].elements;
        const dx = e[12] - cameraPos.x, dz = e[14] - cameraPos.z, d = Math.sqrt(dx * dx + dz * dz);
        const wasHigh = high[i] !== 0, isHigh = wasHigh ? d <= ROCK_FAR_M + 10 : d < ROCK_FAR_M;
        if (isHigh !== wasHigh) { high[i] = isHigh ? 1 : 0; changed = true; }
      }
      if (changed) writeRockLod(lod);
    }
    const slot = rockLodTrace.n++ % 64;
    rockLodTrace.at[slot] = startedAt;
    rockLodTrace.ms[slot] = performance.now() - startedAt;
  }
  function writeRockLod(lod: RockLodPools): void {
    const near = lod.near, far = lod.far;
    const nearGround = near.geometry.getAttribute('aRockGround') as THREE.InstancedBufferAttribute;
    const nearSlope = near.geometry.getAttribute('aRockSlope') as THREE.InstancedBufferAttribute;
    const farGround = far.geometry.getAttribute('aRockGround') as THREE.InstancedBufferAttribute;
    const farSlope = far.geometry.getAttribute('aRockSlope') as THREE.InstancedBufferAttribute;
    const loose = lod.loose, high = lod.high, placements = lod.placements, ground = lod.ground, slope = lod.slope;
    let nearCount = lod.pinned, farCount = 0;
    for (let k = 0; k < loose.length; k++) {
      const i = loose[k];
      if (high[i] !== 0) {
        near.setMatrixAt(nearCount, placements[i]);
        nearGround.setX(nearCount, ground[i]);
        nearSlope.setXY(nearCount, slope[i * 2], slope[i * 2 + 1]);
        nearCount++;
      } else {
        far.setMatrixAt(farCount, placements[i]);
        farGround.setX(farCount, ground[i]);
        farSlope.setXY(farCount, slope[i * 2], slope[i * 2 + 1]);
        farCount++;
      }
    }
    near.count = nearCount;
    far.count = farCount;
    near.visible = nearCount > 0;
    far.visible = farCount > 0;
    near.instanceMatrix.needsUpdate = true;
    far.instanceMatrix.needsUpdate = true;
    near.computeBoundingSphere();
    far.computeBoundingSphere();
    nearGround.needsUpdate = true; nearSlope.needsUpdate = true; farGround.needsUpdate = true; farSlope.needsUpdate = true;
  }

  function updatePoleLod(cameraPos: THREE.Vector3 | null, force = false): void {
    if (!poleMatrices || !poleHigh) return;
    let changed = force;
    if (cameraPos && Number.isFinite(cameraPos.x) && Number.isFinite(cameraPos.z)) {
      if (movedPoleCamera(cameraPos) || force) changed = reclassifyPoleInstances(cameraPos) || changed;
    }
    if (changed || poleLodDirty) rebuildPoleInstances();
  }
  // r3 terrain_environment: the pale-sand baked sandbag models rendered as
  // raw white lumps on the winter snowfield (probed: the "foreground white
  // icosphere" of the critique was a sack_trench instance at 87 m). Per-map
  // instance tint pulls them to dark wet hessian so they read as emplaced
  // defenses against the snow.
  const bakedTint = snowCap ? new THREE.Color(0.52, 0.50, 0.47) : null;
  function instantiateBakedModels(): void {
  for (const [name, e] of bakedInstances) {
    if (e.list.length === 0) continue;
    if (name === 'pole') {
      const matrixStore = e.list.map((matrix: THREE.Matrix4) => matrix.clone());
      poleMatrices = matrixStore;
      poleHigh = new Uint8Array(e.list.length);
      poleHigh.fill(1);
      poleFullIM = new THREE.InstancedMesh(e.geo, mats.pole, e.list.length);
      poleDistanceIM = new THREE.InstancedMesh(
        markPoleTimber(makeTelephonePoleDistanceGeometry()), mats.pole, e.list.length);
      for (const mesh of [poleFullIM, poleDistanceIM]) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.frustumCulled = false;
        group.add(mesh);
      }
      poleFullIM.name = 'baked-pole-full';
      poleDistanceIM.name = 'baked-pole-distance';
      for (const mesh of [poleFullIM, poleDistanceIM]) setShadowCasterProfile(mesh, { heightM: casterHeightM(mesh.geometry, matrixStore), instanced: true }); // round 79
      poleFullIM.userData.distanceSplitM = 120;
      poleDistanceIM.userData.distanceSplitM = 105;
      poleDistanceIM.count = 0;
      poleDistanceIM.visible = false;
      rebuildPoleInstances();
      // Crush/topple records retain their stable authored index. The renderer
      // is free to pack near/far instances independently behind this writer.
      poleIM = {
        instanceMatrix: { needsUpdate: false },
        getMatrixAt(index: number, target: THREE.Matrix4): void { target.copy(matrixStore[index]); },
        setMatrixAt(index: number, matrix: THREE.Matrix4): void {
          matrixStore[index].copy(matrix);
          poleLodDirty = true;
        },
      };
      continue;
    }
    const im = new THREE.InstancedMesh(e.geo, mats.baked, e.list.length);
    const tint = bakedTint && name.startsWith('sb') ? bakedTint : null;
    for (let i = 0; i < e.list.length; i++) {
      im.setMatrixAt(i, e.list[i]);
      if (tint) im.setColorAt(i, tint);
    }
    im.castShadow = true;
    im.receiveShadow = true;
    im.matrixAutoUpdate = false;
    im.computeBoundingSphere();
    im.name = `baked-${name}`;
    setShadowCasterProfile(im, { heightM: casterHeightM(e.geo, e.list), instanced: true }); // round 79
    group.add(im);
  }
  }
  instantiateBakedModels();

  // Linked utility conductors: one four-sided unit cylinder, instanced along
  // all sampled catenaries. No shadow casting avoids sub-pixel CSM shimmer;
  // matrices move only while a connected pole is actively toppling.
  const _wirePoints = utilityNetwork
    ? new Float64Array((utilityNetwork.segments + 1) * 3) : null;
  const _wireA = new THREE.Vector3(), _wireB = new THREE.Vector3();
  const _wireMid = new THREE.Vector3(), _wireDir = new THREE.Vector3();
  const _wireUp = new THREE.Vector3(0, 1, 0), _wireScale = new THREE.Vector3();
  const _wireQuat = new THREE.Quaternion(), _wireMatrix = new THREE.Matrix4();
  function writeWireSpan(spanIndex: number): void {
    const points = _wirePoints;
    if (!wireIM || !utilityNetwork || !points) return;
    for (let side = 0; side < 2; side++) {
      utilityNetwork.writeSpanPoints(spanIndex, side, points);
      for (let seg = 0; seg < utilityNetwork.segments; seg++) {
        const a = seg * 3, b = a + 3;
        _wireA.set(points[a], points[a + 1], points[a + 2]);
        _wireB.set(points[b], points[b + 1], points[b + 2]);
        _wireDir.subVectors(_wireB, _wireA);
        const len = _wireDir.length();
        if (len < 1e-5) continue;
        _wireQuat.setFromUnitVectors(_wireUp, _wireDir.multiplyScalar(1 / len));
        _wireMid.addVectors(_wireA, _wireB).multiplyScalar(0.5);
        _wireScale.set(0.020, len * 1.02, 0.020);
        _wireMatrix.compose(_wireMid, _wireQuat, _wireScale);
        wireIM.setMatrixAt(utilityNetwork.instanceIndex(spanIndex, side, seg), _wireMatrix);
      }
    }
  }
  function rebuildWireSpans(indices: readonly number[] | null = null): void {
    if (!wireIM || !utilityNetwork) return;
    if (indices) {
      for (const spanIndex of indices) writeWireSpan(spanIndex);
    } else {
      for (let i = 0; i < utilityNetwork.spans.length; i++) writeWireSpan(i);
    }
    wireIM.instanceMatrix.needsUpdate = true;
  }
  function instantiateUtilityWires(): void {
    if (!utilityNetwork?.instanceCount) return;
    const wireGeo = new THREE.CylinderGeometry(1, 1, 1, 4, 1);
    wireIM = new THREE.InstancedMesh(wireGeo, mats.dark, utilityNetwork.instanceCount);
    wireIM.name = 'utility-wires';
    wireIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    wireIM.castShadow = false;
    wireIM.receiveShadow = false;
    wireIM.frustumCulled = false;
    wireIM.matrixAutoUpdate = false;
    group.add(wireIM);
    rebuildWireSpans();
  }
  instantiateUtilityWires();

  // content_breadth r2: map-specific set dressing (Frosthollow lake basin —
  // shoreline reeds / refrozen pressure ridges / rowboat / jetty). Soft
  // dressing pushes into existing buckets; small coal piles share rock collision.
  const wharfDressingStart = buckets.wood.length;
  const wharfPaintedStart = buckets.baked.length; // the map-vehicles lane (P2): the creek boat is a painted hull
  // Round 67 (2026-09-24): dressing the renderer poses every frame (the moored hulls, maps/mooredHullMotion.ts) —
  // the kit lays it into the wood bucket as before and hands the same geometries here; they leave the merged mesh
  // below for one mesh each on the shared wood material.
  const animatedDressing: AnimatedDressing[] = [];
  dressMapExtras({
    mapId, extraKits: P.extraKits, riverLandings: P.riverLandings, L, heightField, rng, buckets,
    groundingReceipts: decorationGroundingReceipts,
    obstacles, colliders, animated: animatedDressing, vehicleSetPieces: P.vehicleSetPieces, trees: sceneryTrees, buildings: buildingFeatures,
  });
  yield { fine: true, stage: 'map-extras' };
  // the landmarks lane: the set pieces' furniture, after every seeded pass (placeLandmarks above)
  landmarkFurniture = true;
  for (const [kind, x, y, z, yaw, scale] of landmarkDestructibles) addDestructible(kind, x, y, z, yaw, scale);
  landmarkFurniture = false;
  // (what the veto left out, by kind, on the receipt: the authoring sees what a vetoed piece displaced)
  if (landmarkVetoes.length && group.userData.landmarks) group.userData.landmarks.vetoed = { ...landmarkVetoed };
  group.userData.deploymentClearance = { slots: deploymentSlots.length, vetoed: { ...deploymentVetoed } };

  // All seeded decoration has finished. Relocate accepted records before
  // merging, pool collider refits and spatial indexing; never resample RNG.
  function composeAuthoredLoggingYard(): void {
    if (!fieldTimber) return;
    group.userData.loggingYard = composeLoggingYard(P.loggingYard, heightField, fieldTimber,
      [...obstacles, ...colliders], destructibles, dPools);
    fieldTimber.length = 0;
  }
  composeAuthoredLoggingYard();

  // Reservoir reuses three accepted street-rubble packets, never a synthetic
  // quota. Plan against all late props before changing any geometry or slot.
  function composeAuthoredReservoirWaterworks(): void {
    if (!waterworksRubble) return;
    group.userData.reservoirWaterworks = composeReservoirWaterworks(mapId, P.reservoirWaterworks,
      heightField, waterworksRubble, buckets, [...obstacles, ...colliders], regionalArchitecture);
    waterworksRubble.length = 0;
  }
  composeAuthoredReservoirWaterworks();

  function composeAuthoredFisheryWharf(): void {
    if (mapId !== 'mangrove') return;
    group.userData.fisheryWharf = composeMangroveFisheryWharf(mapId, heightField, wharfFishery,
      P.riverLandings?.find(site => site.lakeIndex === FISHERY_WHARF_LAKE_INDEX), [...obstacles, ...colliders],
      vegetation, [...buckets.wood.slice(wharfDressingStart), ...buckets.baked.slice(wharfPaintedStart)]);
    wharfFishery = null;
  }
  composeAuthoredFisheryWharf();
  function composeAuthoredFoundryCourt(): void {
    if (!foundryDonors) return;
    const receipt = composeFoundryServiceCourt(mapId, P.foundryServiceCourt, heightField,
      foundryDonors, [...obstacles, ...colliders], vegetation);
    group.userData.foundryServiceCourt = receipt;
    if (receipt?.status === 'placed') reconformFoundryFoundations?.();
    foundryDonors.length = 0;
    reconformFoundryFoundations = null;
  }
  composeAuthoredFoundryCourt();
  if (autumnCropRows && autumnFieldContext) {
    composeAutumnHeadlandDressing(destructibleContext, autumnFieldContext,
      autumnCropRows, placedB, autumnFieldStart, autumnFieldEnd, vegetation?.treeObstacles ?? []);
    autumnCropRows.length = 0;
    autumnFieldContext = null;
  }
  vegetation = null;

  // Delta uses two resident procedural plaster families. Fold the incidental
  // third paint tone after authoring so river-supported placement cannot add
  // another uploaded atlas/shader, or change geometry, UV jitter or RNG order.
  if (mapId === 'delta') {
    buckets.plaster2.push(...buckets.plaster3);
    buckets.plaster3.length = 0;
  }

  // --- merge buckets into one mesh per material ---
  // (Round 67 landing, 2026-09-24: this block sits below the merge comment so the deltaPlasterPalette receipt's
  // fold slice — the text between the Delta palette comment and the merge comment — stays the fold alone; the
  // detach still runs before the merge loop below.)
  // Round 67: the animated dressing gets its own mesh (the pivot at the mooring point, the hull's yaw on the mesh, so
  // the frame update rolls and pitches it about its own axes) and leaves the merged wood bucket. One draw call per
  // moored hull. The world freezes every descendant's matrix after the build and makes the root's updateMatrixWorld
  // a no-op (map.ts, the static-world governor), so the frame update composes the hull's local and world matrices
  // itself, as the instanced crush animations write their matrices.
  const mooredHulls: { mesh: THREE.Mesh; y: number; phase: number }[] = [];
  const waterContacts: WaterDisturbance[] = [];
  function detachAnimatedDressing(): void {
    const rings: Array<{ x: number; z: number; yaw: number; halfLength: number; halfWidth: number; surfaceY: number }> = [];
    for (const record of animatedDressing) {
      const bucket = buckets[record.bucket];
      for (const g of record.geometries) {
        const at = bucket.indexOf(g);
        if (at >= 0) bucket.splice(at, 1);
      }
      const parts = record.geometries.map((g) => g.toNonIndexed());
      const merged = mergeGeometries(parts, false);
      for (const g of parts) g.dispose();
      for (const g of record.geometries) g.dispose();
      merged.translate(-record.x, -record.y, -record.z);
      merged.rotateY(-record.yaw);
      const mesh = new THREE.Mesh(merged, mats[record.bucket]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(record.x, record.y, record.z);
      mesh.rotation.order = 'YXZ';
      mesh.rotation.y = record.yaw;
      group.add(mesh);
      mooredHulls.push({ mesh, y: record.y, phase: record.phase });
      // its contact with the water: a standing hull (no speed), lying along its length (the mesh's local +x, turned by
      // its yaw), lapping the water round it as a standing tank's does
      waterContacts.push({ x: record.x, z: record.z, strength: 0.55, dirX: Math.cos(record.yaw), dirZ: -Math.sin(record.yaw),
        speed: 0, halfLength: record.halfLength, halfWidth: record.halfWidth });
      // round 4 (wave 260): its foam, contact and ripples on the surface it floats in (desktop: a transparent decal)
      const surfaceY = heightField.getWaterSurfaceHeightAt?.(record.x, record.z)
        ?? heightField.getHeightAt(record.x, record.z) + (heightField.getWaterDepthAt?.(record.x, record.z) ?? 0);
      rings.push({ x: record.x, z: record.z, yaw: record.yaw, halfLength: record.halfLength, halfWidth: record.halfWidth, surfaceY });
    }
    animatedDressing.length = 0;
    const ringMesh = mobileProps ? null : buildHullWaterRings(rings, aniso);
    if (ringMesh) group.add(ringMesh);
  }
  detachAnimatedDressing();

  // the map-vehicles lane (2026-10-05): no parked vehicle stands inside another (parkedVehicleSeparation.ts). Two
  // roadside picks could land on one station and side; the later vehicle of such a pair slides along its heading onto
  // clear verge (the roadside rules, the road core, every other obstacle and tree), or is dropped. No stream draws.
  // It runs once every record has its seat (the wharf, the Foundry court and the Autumn headlands relocate above) and
  // before anything plans against the vehicles (the yard dressing, the scenery) or refits and indexes the pools.
  function separateParkedVehicleRecords(): void {
    const roles = new Set(Object.keys(CIVILIAN_VEHICLE_RECEIPTS));
    const vehicles = destructibles.filter((record) => roles.has(record.kind) && record.state === 0);
    if (vehicles.length < 2) return;
    const roadside = { rng: () => 0, roads: L.roads, heightField, noVegetation: noVeg, spawns: L.spawns, placedBuildings: placedB };
    const trees = sceneryTrees; // the vegetation is released above; the trees were captured with the scenery's
    const footprint = (kind: string) => ({ hw: LOCAL_TYPES[kind].hw ?? LOCAL_TYPES[kind].r, hl: LOCAL_TYPES[kind].hl ?? LOCAL_TYPES[kind].r });
    group.userData.parkedVehicleSeparation = separateParkedVehicles(vehicles, {
      footprint,
      seatClear: (record, x, z) => {
        const { hw, hl } = footprint(record.kind);
        if (!isRoadsideSpotClear(roadside, x, z)) return false;
        if (!boxClearOfRoadCore(heightField, x, z, hw * record.sc + 0.05, hl * record.sc + 0.05, record.yaw)) return false;
        // the seat's footprint (with half the clearance) against each blocker's box: separating axes (the world's two
        // and the vehicle's own), so a vehicle on a diagonal verge is not held off by its own bounding square
        const g = PARKED_VEHICLE_CLEARANCE / 2, fx = Math.sin(record.yaw), fz = Math.cos(record.yaw);
        const fhw = hw * record.sc + g, fhl = hl * record.sc + g;
        const ex = fhw * Math.abs(fz) + fhl * Math.abs(fx), ez = fhw * Math.abs(fx) + fhl * Math.abs(fz);
        const blocks = (ob: CollisionRecord) => {
          const kind = (ob as { kind?: string }).kind;
          if (ob === record.ob || ob === record.col || (kind && roles.has(kind))) return false;
          if (!(x + ex > ob.min[0] && x - ex < ob.max[0] && z + ez > ob.min[2] && z - ez < ob.max[2])) return false;
          const bx = (ob.min[0] + ob.max[0]) / 2 - x, bz = (ob.min[2] + ob.max[2]) / 2 - z;
          const hx = (ob.max[0] - ob.min[0]) / 2, hz = (ob.max[2] - ob.min[2]) / 2;
          for (const [ax, az, half] of [[fx, fz, fhl], [fz, -fx, fhw]] as const) {
            if (Math.abs(bx * ax + bz * az) >= half + hx * Math.abs(ax) + hz * Math.abs(az)) return false;
          }
          return true;
        };
        return !obstacles.some(blocks) && !colliders.some(blocks) && !trees.some(blocks);
      },
      move: (record, x, z) => relocateParkedVehicleRecord(destructibleContext, record, x, z),
      drop: (record) => dropParkedVehicleRecord(destructibleContext, record),
    });
  }
  separateParkedVehicleRecords();

  // 2026-10-06 (the integrator's ruling): no cart stands inside anything. A handcart, haycart or sled whose body (its
  // wheels, sides and load; the shafts and handles are dressing) meets an obstacle (a fence, a wall, firewood, a trough,
  // a building, rubble, a rock), a tree, a vehicle or a cart seated before it slides the smallest way that clears it,
  // within 3 m and on its own lot (its way out crosses nothing it did not already stand in), or is dropped
  // (parkedVehicleSeparation.ts seatCartsClear). Longleaf's haycart stood in a fence line. No stream draws.
  // 2026-10-08 (the map-vehicles lane's placement audit over the merge): the parked vehicles too, within 6 m. The
  // lampposts, the sandbag emplacements, the hulks, the street rubble and the kerbs are placed after the roadside
  // traffic and never looked for it (a lamp post through a Ruinspires box truck, a flatbed 3 m into rubble, a Verdant
  // truck 0.9 m into sandbags); this pass runs after all of them.
  function seatCartRecords(): void {
    const cartKinds = new Set(Object.keys(CART_RECEIPTS));
    const vehicleKinds = new Set(Object.keys(CIVILIAN_VEHICLE_RECEIPTS));
    const carts = destructibles.filter((record) => (cartKinds.has(record.kind) || vehicleKinds.has(record.kind)) && record.state === 0
      && !record.dropped);
    if (!carts.length) return;
    const parked = new Map<CollisionRecord, DestructibleRecord>();
    for (const record of destructibles) {
      if (record.ob && (cartKinds.has(record.kind) || CIVILIAN_VEHICLE_RECEIPTS[record.kind as keyof typeof CIVILIAN_VEHICLE_RECEIPTS])) {
        parked.set(record.ob, record);
      }
    }
    const trees = sceneryTrees, pads = [L.spawns.player, ...L.spawns.enemies];
    const slideOf = (record: DestructibleRecord) => (vehicleKinds.has(record.kind) ? VEHICLE_SLIDE_MAX_M : CART_SLIDE_MAX_M);
    const CART_CLEARANCE = 0.05;
    // a destructible building still wears its placement box here; the finalization refits it to its ground-bearing
    // solids, which can stand up to ~0.8 m past that box (Skybridge's quonset hut, a porch, a step), so a cart keeps a
    // metre more off a building's box than off a solid that is final already
    const BUILDING_REFIT_MARGIN_M = 1;
    const buildings = new Set<CollisionRecord>();
    for (const record of destructibles) if (record.ob && DESTRUCTIBLE_BUILDING_TYPES[record.kind]) buildings.add(record.ob);
    const buildingPolys = (ob: CollisionRecord): FootprintPolygon[] => {
      const shape = ob.shape2;
      if (shape?.kind === 'obb') {
        return shapePolygons({ ...ob, shape2: { ...shape, hw: shape.hw + BUILDING_REFIT_MARGIN_M, hl: shape.hl + BUILDING_REFIT_MARGIN_M } });
      }
      return shapePolygons(ob).map((poly) => {
        let cx = 0, cz = 0;
        for (const [px, pz] of poly) { cx += px; cz += pz; }
        cx /= poly.length; cz /= poly.length;
        return poly.map(([px, pz]) => {
          const d = Math.hypot(px - cx, pz - cz) || 1, grow = (BUILDING_REFIT_MARGIN_M * Math.SQRT2) / d;
          return [px + (px - cx) * grow, pz + (pz - cz) * grow] as const;
        });
      });
    };
    const bodyAt = (record: DestructibleRecord, x: number, z: number): FootprintPolygon => {
      const type = LOCAL_TYPES[record.kind];
      const c = Math.cos(record.yaw), s = Math.sin(record.yaw), out: [number, number][] = [];
      const hull = type.bodyHull?.length ? type.bodyHull
        : [-(type.hw ?? type.r), -(type.hl ?? type.r), type.hw ?? type.r, -(type.hl ?? type.r), type.hw ?? type.r, type.hl ?? type.r, -(type.hw ?? type.r), type.hl ?? type.r];
      for (let k = 0; k + 1 < hull.length; k += 2) {
        const lx = hull[k] * record.sc, lz = hull[k + 1] * record.sc;
        out.push([x + lx * c + lz * s, z - lx * s + lz * c]);
      }
      return out;
    };
    // (2026-10-08) a destructible's placed box is refitted at finalization to the solids its geometry bears on the ground,
    // which can outreach the box (a bunker's band 5.3 m from its centre, its box 4.0 m: Cinder Junction's estate car
    // stood 0.88 m inside one once its pillbox was refitted): any other destructible meets a seat by its box and by its
    // band's extent at its pose (destructibleFootprint, measured once per kind outside every stream)
    const owners = new Map<CollisionRecord, DestructibleRecord>();
    for (const record of destructibles) if (record.ob && !parked.has(record.ob) && !buildings.has(record.ob)) owners.set(record.ob, record);
    const bandPolys = (ob: CollisionRecord, record: DestructibleRecord): FootprintPolygon[] => {
      const [ax, al] = destructibleFootprint(record.kind);
      const c = Math.cos(record.yaw), s = Math.sin(record.yaw), hw = ax * record.sc, hl = al * record.sc;
      const band: FootprintPolygon = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) =>
        [record.x + u * hw * c + v * hl * s, record.z - u * hw * s + v * hl * c] as const);
      return [...shapePolygons(ob), band];
    };
    type Near = { ob: CollisionRecord; polys: FootprintPolygon[] | null; parked: DestructibleRecord | null };
    // (2026-10-08, over batch 5's hitbox lane) a stone that rises past the drive-over line but had no legacy record takes
    // its collider only at refitRockColliders, after this pass: a cart meets it here by the stone's own contact
    // footprint, so none is seated over a stone that then turns solid (an Alpine sled stood 0.56 m into one)
    const risenStones = rockSeats.filter((seat) => seat.added && seat.profile && seat.rec).map((seat) => {
      const c = seat.profile!.contact, poly: (readonly [number, number])[] = [];
      let sx0 = Infinity, sx1 = -Infinity, sz0 = Infinity, sz1 = -Infinity;
      for (let i = 0; i + 1 < c.length; i += 2) {
        poly.push([c[i], c[i + 1]] as const);
        sx0 = Math.min(sx0, c[i]); sx1 = Math.max(sx1, c[i]); sz0 = Math.min(sz0, c[i + 1]); sz1 = Math.max(sz1, c[i + 1]);
      }
      return { ob: seat.rec!, poly: poly as FootprintPolygon, sx0, sx1, sz0, sz1 };
    });
    const nearOf = new Map<DestructibleRecord, Near[]>();
    for (const cart of carts) {
      const near: Near[] = [];
      const type = LOCAL_TYPES[cart.kind], reach = slideOf(cart) + Math.max(type.hw ?? type.r, type.hl ?? type.r) * cart.sc + 6;
      const x0 = cart.x - reach, x1 = cart.x + reach, z0 = cart.z - reach, z1 = cart.z + reach;
      for (const list of [obstacles, trees] as const) {
        for (const ob of list) {
          if (ob === cart.ob || ob === cart.col || ob.max[0] < x0 || ob.min[0] > x1 || ob.max[2] < z0 || ob.min[2] > z1) continue;
          const owner = parked.get(ob) ?? null;
          const prop = owners.get(ob);
          near.push({ ob, polys: owner ? null : buildings.has(ob) ? buildingPolys(ob) : prop ? bandPolys(ob, prop) : shapePolygons(ob), parked: owner });
        }
      }
      for (const stone of risenStones) {
        if (stone.sx1 < x0 || stone.sx0 > x1 || stone.sz1 < z0 || stone.sz0 > z1) continue;
        near.push({ ob: stone.ob, polys: [stone.poly], parked: null });
      }
      nearOf.set(cart, near);
    }
    // the cart's body at a seat against what stands near it: a vehicle or a cart keeps the parked clearance, the rest
    // a hand's breadth; `seen` collects each meeting's way out
    // round 5 (wave 278: the Frosthollow horn sled "jammed against the birch trunk where it couldn't have been drawn"): a
    // cart was pulled to its seat, so the ground its puller stood on — 2.5 m ahead of its front (local +z: the shafts,
    // the handles, the horns), at least 1.2 m wide — stays clear of the trees and of every solid over half a metre tall,
    // and so does the track a sled ran in on, 4 m behind it (each with 25 cm to spare)
    const approachAt = (record: DestructibleRecord, x: number, z: number): FootprintPolygon[] => {
      if (!cartKinds.has(record.kind)) return [];
      const type = LOCAL_TYPES[record.kind], hw = (type.hw ?? type.r) * record.sc, hl = (type.hl ?? type.r) * record.sc;
      const c = Math.cos(record.yaw), s = Math.sin(record.yaw);
      const rect = (x0: number, x1: number, z0: number, z1: number): FootprintPolygon =>
        [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([lx, lz]) => [x + lx * c + lz * s, z - lx * s + lz * c] as const);
      // a horse or a man stands there: at least 1.2 m wide, 2.5 m long, and a hand's breadth more round both lanes —
      // where a horse stands (a wagon, a hay sledge); a man pulling a sled by its rope 2.25 m, and a hand cart's is
      // pushed from between its handles, a man's width and a pace beyond them (the lane rule alone dropped 5 of
      // Cliffbridge's 35 parked carts from its lanes and steps)
      const man = record.kind === 'handcart', lane = man ? Math.max(hw, 0.45) + 0.15 : Math.max(hw, 0.6) + 0.25;
      const out = [rect(-lane, lane, hl, hl + (man ? 1.2 : record.kind === 'sled' ? 2.25 : 2.75))];
      if (type.runners) out.push(rect(-hw - 0.25, hw + 0.25, -hl - 4, -hl));
      return out;
    };
    const tall = (ob: CollisionRecord) => ob.max[1] - ob.min[1] > 0.5;
    const meets = (cart: DestructibleRecord, x: number, z: number, seen?: (nx: number, nz: number, depth: number) => void) => {
      const body = bodyAt(cart, x, z);
      const approach = approachAt(cart, x, z);
      let met = false;
      // (2026-10-08, over modes' symmetric deployments) its placing kept it out of every deployment slot's clearing
      // (addDestructible's veto); a seat it slides to does too: the way out is straight away from the slot
      for (const slot of deploymentSlots) {
        const dx = x - slot.x, dz = z - slot.z, d = Math.hypot(dx, dz), reach = DEPLOYMENT_CLEAR_M + cart.r;
        if (d >= reach) continue;
        if (!seen) return true;
        met = true;
        seen(d > 1e-6 ? dx / d : 1, d > 1e-6 ? dz / d : 0, reach - d);
      }
      for (const n of nearOf.get(cart)!) {
        if (n.parked && (n.parked.dropped || n.parked === cart)) continue;
        // (round 5) a cart keeps half a metre of air to anything over half a metre tall (a trunk, a wall, a barrier, a
        // lamp post): a hand's breadth read as jammed against it (a parked vehicle keeps its old gap)
        const clearance = n.parked ? PARKED_VEHICLE_CLEARANCE
          : cartKinds.has(cart.kind) && tall(n.ob) ? (cart.kind === 'handcart' ? 0.12 : 0.5) : CART_CLEARANCE;
        for (const poly of n.polys ?? shapePolygons(n.ob)) {
          const g = polygonGap(body, poly);
          if (g.gap < clearance) {
            if (!seen) return true;
            met = true;
            seen(g.nx, g.nz, clearance - g.gap);
            continue;
          }
          if (n.parked || !approach.length || !tall(n.ob)) continue;
          for (const lane of approach) {
            const a = polygonGap(lane, poly);
            if (a.gap >= 0) continue;
            if (!seen) return true;
            met = true;
            seen(a.nx, a.nz, -a.gap);
          }
        }
      }
      return met;
    };
    // a vehicle's seat is ground it can stand on (2026-10-08): within the 12-degree tilt cap, and neither twisted nor
    // humped under it — a corner, its middle or the middle of a side 15-20 cm off the plane through its four corners
    // (an Orchard truck on a broken bank stood with one wheel 0.44 m in the air and another in the slope)
    const groundBad = (record: DestructibleRecord, x: number, z: number): boolean => {
      if (!vehicleKinds.has(record.kind)) return false;
      const type = LOCAL_TYPES[record.kind], hw = (type.hw ?? type.r) * record.sc, hl = (type.hl ?? type.r) * record.sc;
      if (cartGroundPose(heightField, x, z, record.yaw, hw, hl).steep) return true;
      const c = Math.cos(record.yaw), s = Math.sin(record.yaw);
      const at = (lx: number, lz: number) => heightField.getHeightAt(x + lx * c + lz * s, z - lx * s + lz * c);
      const fl = at(-hw, hl), fr = at(hw, hl), bl = at(-hw, -hl), br = at(hw, -hl);
      if (Math.abs(fl - fr - bl + br) / 4 > 0.15) return true;
      const mean = (fl + fr + bl + br) / 4, sx = (fr + br - fl - bl) / (4 * hw), sz = (fl + fr - bl - br) / (4 * hl);
      for (const [lx, lz] of [[0, 0], [0, hl], [0, -hl], [hw, 0], [-hw, 0]] as const) {
        if (Math.abs(at(lx, lz) - (mean + lx * sx + lz * sz)) > 0.2) return true;
      }
      return false;
    };
    group.userData.cartSeats = seatCartsClear(carts, {
      blocked: (cart, x, z) => meets(cart, x, z) || groundBad(cart, x, z),
      away: (cart) => {
        let ax = 0, az = 0;
        meets(cart, cart.x, cart.z, (nx, nz, depth) => { ax += nx * depth; az += nz * depth; });
        return [ax, az];
      },
      seatOk: (cart, x, z) => {
        if (Math.max(Math.abs(x), Math.abs(z)) > 455) return false;
        if (heightField.getNormalAt(x, z).y < Math.min(0.9, heightField.getNormalAt(cart.x, cart.z).y - 0.02)) return false;
        if (heightField.getGroundType(x, z) === 'soft' && heightField.getGroundType(cart.x, cart.z) !== 'soft') return false;
        for (const pad of pads) {
          if (Math.hypot(x - pad.x, z - pad.z) < Math.min(24, Math.hypot(cart.x - pad.x, cart.z - pad.z))) return false;
        }
        const type = LOCAL_TYPES[cart.kind], hw = (type.hw ?? type.r) * cart.sc, hl = (type.hl ?? type.r) * cart.sc;
        if (!boxClearOfRoadCore(heightField, x, z, hw + 0.05, hl + 0.05, cart.yaw)) return false;
        // its own lot: the way from its seat crosses nothing it did not already stand in
        const steps = Math.ceil(Math.hypot(x - cart.x, z - cart.z) / 0.1);
        for (const n of nearOf.get(cart)!) {
          if (n.parked || collisionFootprintContainsPoint(n.ob, cart.x, cart.z)) continue;
          for (let k = 1; k <= steps; k++) {
            const t = k / steps;
            if (collisionFootprintContainsPoint(n.ob, cart.x + (x - cart.x) * t, cart.z + (z - cart.z) * t)) return false;
          }
        }
        return true;
      },
      move: (cart, x, z) => relocateParkedVehicleRecord(destructibleContext, cart, x, z),
      drop: (cart) => dropParkedVehicleRecord(destructibleContext, cart),
      maxSlide: slideOf,
    });
  }
  seatCartRecords();

  // -------------------------------------------------------------------------
  // Round 75: YARD DRESSING — pallets, crates, drums, cable drums, tyre stacks, fuel tanks and skips in the apron
  // band around the industrial structures (world/yardDressing.ts plans, maps/yardClutterKit.ts builds). Dressing,
  // not obstacles: no collision or destructible record, its own seeded stream, and every solid the map already
  // placed is kept clear. Follow-up 2 (2026-09-26): the yard adds no draw of its own — every piece is a transformed
  // copy of its family geometry with the livery baked into its vertex colours, pushed into the map's wood / steel /
  // baked bucket and merged with the structures into that bucket's one static mesh. Nine instanced families cost
  // nine draws a pass (each drawn again by every shadow cascade); folded into the buckets the yard costs triangles
  // only, so it runs after every solid is placed and just before the bucket merge.
  // -------------------------------------------------------------------------
  const YARD_BUCKET: Readonly<Record<YardMaterial, 'wood' | 'steel' | 'baked'>> = { wood: 'wood', steel: 'steel', baked: 'baked' };
  /** mergeGeometries wants one attribute set per bucket: shape the piece after the bucket's first part. */
  function conformYardPiece(piece: THREE.BufferGeometry, bucket: readonly THREE.BufferGeometry[]): void {
    const model = bucket[0];
    if (!model) return;
    for (const name of Object.keys(piece.attributes)) if (!model.attributes[name]) piece.deleteAttribute(name);
    const n = piece.getAttribute('position').count;
    for (const name of Object.keys(model.attributes)) {
      if (piece.attributes[name]) continue;
      const itemSize = model.attributes[name].itemSize;
      if (name === 'normal') piece.computeVertexNormals();
      else piece.setAttribute(name, new THREE.BufferAttribute(new Float32Array(n * itemSize).fill(name === 'color' ? 1 : 0), itemSize));
    }
  }
  function* placeYardDressing(): Generator<PropsBuildSlice, void, void> {
    const kinds = new Set(yardStructureKinds());
    const structures: YardStructure[] = [];
    for (const b of buildingFeatures) {
      if (b.kind && kinds.has(b.kind)) structures.push({ kind: b.kind, x: b.x, z: b.z, w: b.w, d: b.d, rot: b.rot });
    }
    const budget = P.yardDressing ?? Math.min(140, Math.round(structures.length * 4.5));
    if (!structures.length || !(budget > 0)) return;
    const palette = mapId === 'mars' ? 'martian' : snowCap || mapId === 'whiteout' ? 'polar' : 'brownfield';
    const plan = planYardDressing(structures, heightField, obstacles, seed, { budget, palette });
    const families = new Map<YardFamily, ReturnType<typeof buildYardFamily>>();
    const perMaterial: Record<string, { bucket: string; pieces: number; families: string[]; vertices: number }> = {};
    const pos = new THREE.Vector3(), scl = new THREE.Vector3(), q = new THREE.Quaternion(), m = new THREE.Matrix4();
    const tint = new THREE.Color();
    let triangles = 0, count = 0;
    for (const p of plan.placements) {
      let built = families.get(p.family);
      if (!built) {
        built = buildYardFamily(p.family);
        if (built.material === 'steel') ensureSteelAtlas('yard:' + p.family);
        families.set(p.family, built);
      }
      const piece = built.geometry.clone();
      q.setFromAxisAngle(_upAxis, p.yaw);
      m.compose(pos.set(p.x, p.y - 0.02, p.z), q, scl.set(p.scale, p.scale, p.scale));
      piece.applyMatrix4(m);
      const livery = yardInstanceLivery(p.family, p.variant, palette);
      const color = piece.getAttribute('color');
      if (livery !== null && color) {
        tint.set(livery);
        for (let i = 0; i < color.count; i++) color.setXYZ(i, color.getX(i) * tint.r, color.getY(i) * tint.g, color.getZ(i) * tint.b);
      }
      const bucket = YARD_BUCKET[built.material];
      conformYardPiece(piece, buckets[bucket]);
      buckets[bucket].push(piece);
      let row = perMaterial[built.material];
      if (!row) row = perMaterial[built.material] = { bucket, pieces: 0, families: [], vertices: 0 };
      row.pieces++;
      if (!row.families.includes(p.family)) row.families.push(p.family);
      row.vertices += piece.index ? piece.index.count : piece.getAttribute('position').count; // as merged (non-indexed)
      triangles += built.triangles;
      if (++count % 24 === 0) yield { fine: true, progress: false, stage: 'yard' };
    }
    for (const built of families.values()) built.geometry.dispose();
    for (const row of Object.values(perMaterial)) row.families.sort();
    group.userData.yardDressing = {
      structures: structures.length, budget, placed: plan.placements.length, families: families.size,
      attempts: plan.attempts, triangles, draws: 0, perMaterial,
    };
  }
  yield* placeYardDressing();

  // -------------------------------------------------------------------------
  // 2026-10-03 (the scenery lane): the map's authored landscape features and landmarks (world/scenery.ts) — its rock
  // formations on one mesh on the rock material (one draw for the map), its landmark destructibles in the pools, its
  // pylon lines folded into the baked bucket. Own streams, after every other placement and before the bucket merge,
  // so a map without a `scenery` block builds exactly as before.
  // -------------------------------------------------------------------------
  function* placeScenery(): Generator<PropsBuildSlice, void, void> {
    const scenery = (cfg as (PropsMapConfig & SceneryMapConfig) | null)?.scenery;
    if (!scenery) return;
    // the trees' crown tops, for the pylon lines' towers to stand over (a crown's height from its trunk's, by species)
    const treeKinds = sceneryTreeKinds;
    const treeTops: Array<{ x: number; z: number; top: number }> = [];
    if (treeKinds && scenery.powerLines?.length) {
      for (const ob of sceneryTrees) {
        const kind = ob.treeIdx == null ? undefined : treeKinds[ob.treeIdx];
        const a = kind && TREE_ARCHETYPES[kind.species];
        if (!a) continue;
        // (the instance's scale from its trunk's collider; the crown's height from the archetype under the species'
        // geometry scale, and a sixth more for the tallest card of the crown)
        const scaleY = (ob.max[1] - ob.min[1]) / a.trunkHeightM;
        const crown = Math.max(a.fallHeightM, a.canopyCenterM + a.canopyRadiusM) * TREE_GEOMETRY_SCALE[kind.species][1] * 1.16;
        treeTops.push({ x: (ob.min[0] + ob.max[0]) / 2, z: (ob.min[2] + ob.max[2]) / 2, top: ob.min[1] + crown * scaleY });
      }
    }
    const built = yield* composeScenery({
      mapId, scenery, heightField, spawns: [L.spawns.player, ...L.spawns.enemies],
      obstacles, colliders, trees: sceneryTrees, treeTops, baked: buckets.baked, conform: conformYardPiece,
      addDestructible: (kind, x, y, z, yaw, scale) => addDestructible(kind, x, y, z, yaw, scale),
      seed, mobile: mobileProps,
    });
    if (built.rockPieces.length) {
      const profile = bucketShadowProfile(built.rockPieces);
      const merged = mergeGeometries(built.rockPieces, false);
      for (const piece of built.rockPieces) piece.dispose();
      const mesh = new THREE.Mesh(merged, mats.rock);
      mesh.name = 'props-scenery-rock';
      setShadowCasterProfile(mesh, profile);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    // the scenery lane (wave 48, "the power cables break into dashes"): the power lines' conductors as one mesh on the
    // wire material (wireMaterial.ts: a pixel wide at the least, its alpha the share the true wire covers)
    if (built.wires.length) {
      const merged = mergeGeometries(built.wires, false);
      for (const piece of built.wires) piece.dispose();
      if (merged) {
        const wires = createWireMesh(merged);
        wires.name = 'props-pylon-wires';
        wires.matrixAutoUpdate = false;
        group.add(wires);
      }
    }
    group.userData.scenery = built.receipt;
  }
  yield* placeScenery();

  // facades lane (round 5, 2026-10-07; wave 199: the khatas' "thatch that reads like carpet"): a kit's thatched roofs take
  // the thatch print (makeThatch: courses, bundles, strands down the slope, in the straw print's own colour) in a mesh of
  // their own. Its material is the straw's shader under the straw's program key, so it compiles nothing new: one draw
  // more on a map with thatch. The bales, stooks and stacks keep the straw print.
  {
    // (round 10) a map gated back to the older craft keeps the straw print on its thatch (KIT_LEGACY_MAPS)
    const kitThatch = kitLegacy(mapId) ? [] : buckets.straw.filter((g) => g.userData.regional === true);
    if (kitThatch.length) {
      buckets.straw = buckets.straw.filter((g) => g.userData.regional !== true);
      buckets.thatch = kitThatch;
      const thatch = makeThatch(aniso, T.straw || null, (seed ^ 0x7a7c4) >>> 0, regionalArchitecture?.surfaces.thatch?.kind);
      const material = new THREE.MeshStandardMaterial({ map: thatch.albedo, normalMap: thatch.normal,
        roughnessMap: thatch.surface, aoMap: thatch.surface, roughness: 1, metalness: 0 });
      material.aoMapIntensity = 0.82;
      engineCtx.setupShadowMaterial(material, grimeHook);
      material.customProgramCacheKey = () => 'world-props-straw-v7' + (snowCap ? 's' : '');
      mats.thatch = material;
      retainedSurfaceMaterials.push(material);
    }
  }
  function* mergeMaterialBuckets(): Generator<PropsBuildSlice, void, void> {
    // regional-buildings lane (2026-10-03, the urban GPU A B B A: +5 ms at the town's establishing view): a kit's
    // joinery and metalwork dressing (window frames and bars, shutters, timbers, boards, gutters and downpipes; a few
    // centimetres proud of a wall) receives shadows but casts none. It merges into its own receive-only mesh, so the
    // shadow cascades skip ~0.3 M of Steinburg's triangles; dressing whose shadow reads (a slatted mat) keeps casting
    // (geometry.ts EmitOptions.shadow).
    const RECEIVE_ONLY_DETAIL = new Set(['structureWood', 'structureMetal']);
    const castsNoShadow = (g: THREE.BufferGeometry) => g.userData.regional === true && g.userData.noCollision === true && g.userData.castsShadow !== true;
    // regional-buildings lane (2026-10-03, the urban perf blocker): the fine joinery (geometry.ts EmitOptions.fine:
    // frames, glazing bars, rails, door panels, downpipes, and the sides and caps of timbers, shutter leaves, surrounds,
    // sills and quoins) is drawn only within the quality preset's fine-detail distance of the camera (updateFineDetail):
    // at the town's establishing range it is sub-pixel, and ~0.3 M of Steinburg's triangles went to it. It merges by
    // 120 m cell (60 m cells drew as many fine triangles at Steinburg's establishing view, and 9-10 cells stood in a
    // street view's frustum), and each bucket's cells are the instances of one multi-draw batch (THREE.BatchedMesh,
    // culled by the frustum per instance), the bucket's always-drawn receive-only dressing one more: one draw call
    // whatever the number of cells. A phone builds no fine joinery (regional/index.ts) and culls the rest of its timber dressing by
    // the same cells, at its own shorter distances.
    // facades lane (2026-10-05): the facade craft's fine metalwork (gutter hangers, hopper heads, the downpipes) and its
    // fine render work on the main render (paint, the dirt run off the sills, pilasters) cull by the same cells on a
    // desktop build (maps/regional/facade.ts); the metal's batch takes the place of its always-drawn mesh, so it costs no
    // draw, the render's one (the second and third renders' few fine pieces stay in their meshes). A phone builds none.
    const CELLED = new Set(['structureWood', 'regionalStone']);
    const DESKTOP_CELLED = new Set(['structureMetal', 'regionalPlaster']);
    const FINE_CELL_M = 120;
    // facades lane (2026-10-06, Steinburg's round-2 cost: 124k of the craft's 164k fine triangles at the chase view lay
    // past 80 m, a 120 m cell showing from 120 m off): the craft's finest pieces (geometry.ts EmitOptions.fine 'near': a
    // flower box, a shop's lettering, a gutter's hangers) merge by 40 m cell and show within half the fine-detail
    // distance (updateFineDetail): more instances of the same batches, no draw or program more
    const NEAR_CELL_M = 40;
    const culled = (g: THREE.BufferGeometry, key: string) => (CELLED.has(key) || (DESKTOP_CELLED.has(key) && !mobileProps)) && castsNoShadow(g)
      && (g.userData.fine === true || (mobileProps && RECEIVE_ONLY_DETAIL.has(key)));
    type Cell = { list: THREE.BufferGeometry[]; minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number; near?: true };
    const fineCells = (list: THREE.BufferGeometry[], size = FINE_CELL_M): Cell[] => {
      const cells = new Map<number, Cell>();
      for (const g of list) {
        if (!g.boundingBox) g.computeBoundingBox();
        const b = g.boundingBox;
        if (!b || b.isEmpty()) continue;
        const key = (Math.floor((b.min.x + b.max.x) * 0.5 / size) + 4096) * 8192 + Math.floor((b.min.z + b.max.z) * 0.5 / size) + 4096;
        let cell = cells.get(key);
        if (!cell) {
          cell = { list: [], minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
          if (size !== FINE_CELL_M) cell.near = true;
          cells.set(key, cell);
        }
        cell.list.push(g);
        cell.minX = Math.min(cell.minX, b.min.x); cell.maxX = Math.max(cell.maxX, b.max.x);
        cell.minY = Math.min(cell.minY, b.min.y); cell.maxY = Math.max(cell.maxY, b.max.y);
        cell.minZ = Math.min(cell.minZ, b.min.z); cell.maxZ = Math.max(cell.maxZ, b.max.z);
      }
      return [...cells.values()];
    };
    /** the batches and their cells' instances (updateFineDetail shows a cell's instance by its box) */
    const fineDetail: Array<{ mesh: THREE.BatchedMesh; cells: Array<{ id: number; box: Omit<Cell, 'list' | 'near'>; near?: true }> }> = [];
    group.userData.fineDetail = fineDetail;
    for (const key of Object.keys(buckets)) {
      if (buckets[key].length === 0) continue;
      if (key === 'curtain') for (const geometry of buckets[key]) ensureWorldNightEmissionMask(geometry);
      if (key === 'glass') prepareWorldStaticNightFixture(buckets[key], mats[key]);
      const all = buckets[key];
      const fine = all.filter((g) => culled(g, key));
      const receiveOnly = RECEIVE_ONLY_DETAIL.has(key);
      // (2026-10-10, the map-revival lane, the Tarkhan landing's trim) a piece tagged userData.receiveOnly (a mud wall's
      // apron on a map that opts in, fieldWallDressing.ts adobeApronCoarse) joins any bucket's non-casting mesh; nothing
      // else is tagged, so every other bucket merges as before
      const groundOnly = (g: THREE.BufferGeometry) => g.userData.receiveOnly === true;
      const cast = receiveOnly ? all.filter((g) => !castsNoShadow(g)) : all.filter((g) => !culled(g, key) && !groundOnly(g));
      const coarse = receiveOnly ? all.filter((g) => castsNoShadow(g) && !culled(g, key)) : all.filter(groundOnly);
      const meshes: Array<[THREE.BufferGeometry[], boolean, string]> = [[cast, true, '']];
      if (!fine.length) meshes.push([coarse, false, '-detail']);
      for (const [list, casts, suffix] of meshes) {
        if (!list.length) continue;
        // mergeGeometries requires uniform indexing (ExtrudeGeometry is non-indexed)
        const profile = bucketShadowProfile(list); // round 79: the pieces' cells, before the merge owns them
        const merged = yield* mergePropsMaterialGeometrySteps(list, key);
        bindClutterBatch(list, merged);
        // destruction (§16): the per-vertex structure tag, and where each structure's parts landed
        const holdsStructure = tagStructureVertices(list, merged);
        const mesh = new THREE.Mesh(merged, mats[key]);
        bindStructureSpans(list, merged.getAttribute('position') as THREE.BufferAttribute, mesh, key, structureSpans);
        structureMaterials.push({ material: mats[key], bucket: key, role: 'surface', mesh, batched: false });
        // a bucket that casts a structure's shadow casts it through its own depth material (the same RGBA-packed depth
        // three's shared one is flipped to), so the presentation's structure patch moves the shadow with the building
        if (holdsStructure && casts) {
          const depth = structureDepthMaterial(key);
          mesh.customDepthMaterial = depth;
          structureMaterials.push({ material: depth, bucket: key, role: 'depth', mesh, batched: false });
        }
        mesh.name = 'props-bucket-' + key + suffix; // round 75: the perf inventories attribute the merged buckets by name
        setShadowCasterProfile(mesh, profile);
        mesh.castShadow = casts;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
        yield { fine: true }; // loading-speed r1: merge one material family per idle slice
      }
      if (!fine.length) continue;
      // the batch: the always-drawn receive-only dressing (instance 0, when there is any) and one instance per cell of
      // fine joinery; every instance starts visible, so the deployment warm uploads and links it with the rest
      const cells = [...fineCells(fine.filter((g) => g.userData.fineNear !== true)),
        ...fineCells(fine.filter((g) => g.userData.fineNear === true), NEAR_CELL_M)];
      const parts: THREE.BufferGeometry[] = [];
      if (coarse.length) parts.push(yield* mergePropsMaterialGeometrySteps(coarse, key));
      for (const cell of cells) parts.push(yield* mergePropsMaterialGeometrySteps(cell.list, key));
      // destruction (§16): a batch's geometries share one attribute set: all of them tagged when any holds a structure
      {
        const sourceLists = [...(coarse.length ? [coarse] : []), ...cells.map((cell) => cell.list)];
        const any = sourceLists.some((list) => list.some((g) => typeof g.userData.structureIdx === 'number'));
        if (any) sourceLists.forEach((list, i) => tagStructureVertices(list, parts[i]!, true));
      }
      const vertices = parts.reduce((n, g) => n + g.getAttribute('position').count, 0);
      const indices = parts.reduce((n, g) => n + (g.index ? g.index.count : 0), 0);
      // the batch draws through its own copy of the bucket's material: one material shared by a batched and a plain
      // mesh re-resolves its program at every switch between them (three's batching parameter), several times a frame
      const batchMaterial = mats[key].clone();
      // (round 10) a kit wall's batch wears its walls' grime (wallGrimeHook), as its plain mesh does
      const wallBatch = isKitWall(key);
      engineCtx.setupShadowMaterial(batchMaterial, wallBatch ? wallGrimeHook : grimeHook);
      batchMaterial.customProgramCacheKey = () => 'world-props-' + key + '-v7' + (snowCap ? 's' : '') + '-batch' + (wallBatch ? '-wall' : '');
      retainedSurfaceMaterials.push(batchMaterial);
      const batch = new THREE.BatchedMesh(parts.length, vertices, Math.max(indices, 1), batchMaterial);
      batch.name = 'props-bucket-' + key + '-batch';
      // no per-instance culling or sorting: three would walk and re-upload the draw list every frame. The batch is
      // culled whole by its own sphere; its cells by the fine-detail distance (updateFineDetail), so the list is
      // rebuilt only on the frames a cell shows or hides
      batch.sortObjects = false;
      batch.perObjectFrustumCulled = false;
      batch.castShadow = false;
      batch.receiveShadow = true;
      batch.matrixAutoUpdate = false;
      const geometryIds = parts.map((g) => batch.addGeometry(g));
      const ids = geometryIds.map((geometryId) => batch.addInstance(geometryId));
      // destruction (§16): the batch holds every geometry in its own attributes: a span's range is absolute there
      structureMaterials.push({ material: batchMaterial, bucket: key, role: 'surface', mesh: batch, batched: true });
      {
        const position = batch.geometry.getAttribute('position') as THREE.BufferAttribute;
        const sourceLists = [...(coarse.length ? [coarse] : []), ...cells.map((cell) => cell.list)];
        sourceLists.forEach((list, i) => bindStructureSpans(list, position, batch, key, structureSpans, geometryIds[i]!,
          !(coarse.length && i === 0), batch.getGeometryRangeAt(geometryIds[i]!)!.vertexStart, ids[i]!));
      }
      for (const g of parts) g.dispose();
      fineDetail.push({ mesh: batch, cells: cells.map((cell, i) => ({ id: ids[i + (coarse.length ? 1 : 0)],
        box: { minX: cell.minX, maxX: cell.maxX, minY: cell.minY, maxY: cell.maxY, minZ: cell.minZ, maxZ: cell.maxZ },
        ...(cell.near ? { near: true as const } : {}) })) });
      group.add(batch);
      yield { fine: true };
    }
  }
  yield* mergeMaterialBuckets();
  // the scenery lane (wave 34): the snow drifts banked against the walls draw as one mesh of their own on the plaster
  // (a drift is a low ramp: it receives the cascades and casts none), so a frame can show and hide them
  if (wallDressing.drifts.length) {
    const drifts = mergeGeometries(wallDressing.drifts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    for (const g of wallDressing.drifts) g.dispose();
    wallDressing.drifts.length = 0;
    if (drifts) {
      const mesh = new THREE.Mesh(drifts, mats.plaster);
      mesh.name = 'props-snow-drifts';
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
  }
  if (sandbagBeds.length) {
    const beds = mergeGeometries(sandbagBeds, false);
    for (const g of sandbagBeds) g.dispose();
    sandbagBeds.length = 0;
    if (beds) {
      const mesh = new THREE.Mesh(beds, mats.rock); // (the bocage banks' material: detail, grime and the wet maps' moss)
      mesh.name = 'props-sandbag-beds';
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
  }
  // The hitbox lane (2026-10-07): every placement pass has read the stones' legacy records; now each stone takes the
  // colliders of its own mesh (settleRockColliders above), a stone a hull drives over leaves both lists, and a stone
  // that rose past the drive-over line with none joins them — before the clutter takes its network identity below.
  // The ground cover keeps the footprints it has always been sealed against: each legacy record's twin, cosmetic only
  // (map.ts adds them to the grass, litter, tall-grass and shrub admission), so no tuft or shrub moves with a collider.
  const rockGroundCover: CollisionRecord[] = [];
  function refitRockColliders(): void {
    const dropped = new Set<CollisionRecord>();
    for (const seat of rockSeats) {
      if (!seat.rec || !seat.col) continue;
      if (!seat.added) {
        const twin = cloneCollisionRecord(seat.rec);
        letGroundCoverLap(twin);
        rockGroundCover.push(twin);
      }
      if (!seat.profile) { dropped.add(seat.rec); dropped.add(seat.col); continue; }
      applyRockCollisionProfile(seat.rec, seat.col, seat.profile, seat.y);
      if (!seat.added) continue;
      obstacles.push(seat.rec); colliders.push(seat.col);
      letGroundCoverLap(seat.rec);
    }
    if (dropped.size) {
      for (const list of [obstacles, colliders] as CollisionRecord[][]) {
        let kept = 0;
        for (const record of list) if (!dropped.has(record)) list[kept++] = record;
        list.length = kept;
      }
    }
    rockSeats.length = 0;
    group.userData.rockGroundCover = rockGroundCover;
  }
  refitRockColliders();
  // Append after every ordinary prop so existing network prop identities stay stable.
  for (const clutter of pendingClutter) {
    if (!clutter.activate(destructibles.length)) continue;
    destructibles.push({kind: clutter.kind, cls: 'break', x: clutter.x, y: clutter.y, z: clutter.z,
      yaw: 0, sc: 1, r: clutter.r, h: clutter.h, slot: -1, state: 0,
      ob: clutter.obstacles[0]!, col: clutter.colliders[0], groundSupport: null, clutter});
  }
  pendingClutter.length = 0;

  // -------------------------------------------------------------------------
  yield;
  // DESTRUCTIBLE POOL FINALIZATION (world-dressing r1): one InstancedMesh per
  // type for the intact instances, one (initially empty) for the broken
  // debris states. Geometry is built ONCE per type per map from the kit's
  // seeded builders; per-instance variety rides matrix scale/yaw + the
  // world-space grime shader. Break = zero-scale the intact slot + activate a
  // broken slot: two matrix writes, no per-frame cost once settled.
  // -------------------------------------------------------------------------
  const _zeroScale = new THREE.Vector3(1e-4, 1e-4, 1e-4);
  const groundCoverDetails = {
    families: 0, solidCount: 0, profileBytes: 0,
    placements: 0, placementBytes: 0, unsupportedTransforms: 0, buildMs: 0,
  };
  group.userData.groundCoverDetails = groundCoverDetails;
  function refitDestructibleColliders(
    geometry: THREE.BufferGeometry,
    pool: DestructiblePool,
    kind: string,
  ): GroundCoverSolidProfile | null {
    const positions = geometry.getAttribute('position');
    if (!positions || !pool.records.length) return null;
    // Refit every destructible obstacle to the actual ground-bearing solids.
    // Roof overhangs, open bays and support gaps remain visually and
    // physically open instead of inheriting the metadata placement box.
    // Reuse this extraction only for building families. Crates, moving props,
    // walls (including their later terrain fit) and trees retain the cheap path.
    const source = DESTRUCTIBLE_BUILDING_TYPES[kind]
      ? deriveRuntimeStructureCollisionWithSolids({ baked: [geometry] }) : null;
    const contactBand = source?.profile.contact ?? pool.meta?.contactBand
      ?? deriveRuntimeStructureContactBand({ baked: [geometry] });
    const shellSlabs = SLAB_SHELL_KINDS.has(kind) ? localShellSlabs(geometry) : null;
    for (const record of pool.records) {
      if (!record.ob) continue;
      const scaledExtent = (part: SimpleCollisionShape) => (part.y0 !== undefined && part.y1 !== undefined
        ? { y0: part.y0 * record.sc, y1: part.y1 * record.sc }
        : {});
      const scaledBand = record.sc === 1 ? contactBand : {
        ...contactBand,
        parts: contactBand.parts.map((part) => part.kind === 'circle'
          ? { ...part, cx: part.cx * record.sc, cz: part.cz * record.sc, r: part.r * record.sc, ...scaledExtent(part) }
          : part.kind === 'obb'
            ? {
              ...part, cx: part.cx * record.sc, cz: part.cz * record.sc,
              hw: part.hw * record.sc, hl: part.hl * record.sc, ...scaledExtent(part),
            }
            : {
              ...part,
              cx: part.cx * record.sc,
              cz: part.cz * record.sc,
              points: part.points.map((value) => value * record.sc),
              ...scaledExtent(part),
            }),
      };
      applyStructureCollisionBand(record.ob, scaledBand, record.x, record.z, record.yaw, record.y);
      if (record.col) {
        applyStructureCollisionBand(record.col, scaledBand, record.x, record.z, record.yaw, record.y);
        // (the hitbox lane, 2026-10-07) a dense stack's shells and sight lines meet its own slabs, not the contact prism
        if (shellSlabs?.length) placeLocalShellSlabs(record.col, shellSlabs, record.x, record.y, record.z, record.yaw, record.sc);
      }
    }
    if (!source) return null;
    const start = performance.now();
    const detail = createGroundCoverSolidProfile(source.solids, source.contactTop);
    groundCoverDetails.buildMs += performance.now() - start;
    return detail;
  }
  function sealGroundCoverPlacements(pool: DestructiblePool, detail: GroundCoverSolidProfile): void {
    const start = performance.now();
    groundCoverDetails.families++;
    groundCoverDetails.solidCount += detail.solidCount;
    groundCoverDetails.profileBytes += detail.byteLength;
    for (const record of pool.records) {
      if (!record.ob) continue;
      if (attachGroundCoverSolidProfile(record.ob, detail, pool.mats4[record.slot].elements)) {
        groundCoverDetails.placements++;
        groundCoverDetails.placementBytes += GROUND_COVER_PLACEMENT_BYTES;
      } else groundCoverDetails.unsupportedTransforms++;
    }
    groundCoverDetails.buildMs += performance.now() - start;
  }
  function tintDestructibleInstances(
    kind: string,
    pool: DestructiblePool,
    imI: THREE.InstancedMesh,
  ): void {
    if (kind.startsWith('sandbag')) {
      // the scenery lane: every stack its own weathering (the bags vary within a stack, this varies the stacks), a
      // little greyer under snow
      const tint = new THREE.Color();
      for (let i = 0; i < pool.mats4.length; i++) {
        const h = Math.sin((i + 1) * 12.9898 + seed * 0.000731 + kind.length * 78.233) * 43758.5453;
        const u = h - Math.floor(h), w = (h * 7.31) - Math.floor(h * 7.31);
        const l = (snowCap ? 0.84 : 0.9) + u * 0.2;
        tint.setRGB(l * (1 + (w - 0.5) * 0.06), l, l * (1 - (w - 0.5) * 0.08));
        imI.setColorAt(i, tint);
      }
      imI.instanceColor!.needsUpdate = true;
    }
    if (pool.meta.instancePaint) {
      // the map-vehicles lane: each copy's livery (the vehicle material carries it onto the body paint only)
      for (let i = 0; i < pool.mats4.length; i++) {
        const record = pool.records[i];
        pool.meta.instancePaint(_structureTint, record.x, record.z, i);
        imI.setColorAt(i, _structureTint);
      }
      imI.instanceColor!.needsUpdate = true;
      return;
    }
    if (!pool.meta.instanceTintStrength) return;
    for (let i = 0; i < pool.mats4.length; i++) {
      writeStructureInstanceTint(_structureTint, kind, i, seed, pool.meta.instanceTintStrength);
      imI.setColorAt(i, _structureTint);
    }
    imI.instanceColor!.needsUpdate = true;
  }
  function* prepareDestructiblePoolGeometry(
    kind: string, pool: DestructiblePool,
  ): Generator<PropsBuildSlice, {
    geoI: THREE.BufferGeometry; groundCoverDetail: GroundCoverSolidProfile | null;
  }, void> {
    const geoI = pool.meta.build(drng);
    let transferred = false;
    try {
      const groundCoverDetail = refitDestructibleColliders(geoI, pool, kind);
      let fitted = 0;
      for (let index = 0; index < pool.records.length; index++) {
        const record = pool.records[index];
        const span = wallSpans.get(record);
        if (!span) continue;
        // Complete each terrain fit in the original order; only the boundary
        // between records changes. Micro-batches do not advance loading progress.
        fitWallSpan(pool.mats4[record.slot], geoI, heightField, span, record, WALL_SEG);
        if (++fitted % 8 === 0 && index + 1 < pool.records.length) {
          yield { fine: true, progress: false, stage: 'wall-fit-' + kind };
        }
      }
      transferred = true;
      return { geoI, groundCoverDetail };
    } finally {
      // No mesh owns this geometry yet. IteratorClose on cancellation must
      // release it before the next pool can build or be published.
      if (!transferred) geoI.dispose();
    }
  }
  // the map-vehicles lane (2026-10-05): one clone of the vehicle material for the rebuilt vehicles, its program reading
  // their per-vertex surface stream (vehicleSurface.ts) and wearing each copy's livery through the paint mask
  let vehicleSurface: typeof mats.vehicle | null = null;
  function vehicleSurfaceMaterial(): typeof mats.vehicle {
    if (vehicleSurface) return vehicleSurface;
    const material = mats.vehicle.clone();
    engineCtx.setupShadowMaterial(material, (shader) => { grimeHook(shader); applyVehicleSurfaceHook(shader); });
    material.customProgramCacheKey = () => `world-props-vehicle-${VEHICLE_SURFACE_PROGRAM}-v7${snowCap ? 's' : ''}`;
    retainedSurfaceMaterials.push(material);
    vehicleSurface = material;
    return material;
  }
  function* finalizeDestructiblePool(
    kind: string, pool: DestructiblePool,
  ): Generator<PropsBuildSlice, void, void> {
    const meta = pool.meta;
    // Wall modules use the map-toned masonry materials; other objects keep
    // the wood, straw, vehicle, or baked family selected by their metadata
    // (b15: a straw object wears the hay print's material).
    let material = (meta.mat === 'straw' ? mats.hay : mats[meta.mat]) || mats.baked;
    if (meta.mat === 'vehicle' && meta.instancePaint) material = vehicleSurfaceMaterial();
    if (kind === 'lamp') {
      // One material for the whole instanced lamp family, not per fixture.
      // Other baked props keep their existing non-emissive shader.
      material = material.clone();
      engineCtx.setupShadowMaterial(material, grimeHook);
      material.customProgramCacheKey = () => 'world-streetlamp-v1' + (snowCap ? 's' : '');
      configureWorldLampMaterial(material);
      retainedSurfaceMaterials.push(material);
    }
    const { geoI, groundCoverDetail } = yield* prepareDestructiblePoolGeometry(kind, pool);
    if (groundCoverDetail) sealGroundCoverPlacements(pool, groundCoverDetail);
    const imI = new THREE.InstancedMesh(geoI, material, pool.mats4.length);
    if (material === mats.fieldStone && kind === 'wallstone' && geoI.getAttribute('aStone')) {
      // (b14: the dry-stone walls' settling and copes by world place, and the same in the shadows)
      if (!geoI.boundingBox) geoI.computeBoundingBox();
      stoneShapeFor(geoI.boundingBox!, snowCap, stoneShape.value);
      const depth = createStoneWallDepthMaterial(grimeTex, stoneShape);
      retainedSurfaceMaterials.push(depth);
      imI.customDepthMaterial = depth;
    }
    if (material === mats.fieldMud && kind === 'walladobe') {
      // (b14: the mud walls' crown in world space: the module's top and shoulder, and the same crown in the shadows)
      if (!geoI.boundingBox) geoI.computeBoundingBox();
      mudShapeFor(geoI.boundingBox!, mudShape.value);
      const depth = createMudWallDepthMaterial(grimeTex, mudShape);
      retainedSurfaceMaterials.push(depth);
      imI.customDepthMaterial = depth;
    }
    for (let i = 0; i < pool.mats4.length; i++) imI.setMatrixAt(i, pool.mats4[i]);
    tintDestructibleInstances(kind, pool, imI);
    const castsDynamicShadow = destructibleCastsShadow(meta);
    imI.castShadow = castsDynamicShadow;
    imI.receiveShadow = true;
    imI.matrixAutoUpdate = false;
    if (meta.cls === 'topple' || meta.cls === 'toss' || meta.cls === 'physics') imI.frustumCulled = false; // instances animate
    else imI.computeBoundingSphere();
    imI.name = 'destructible-' + kind;
    // the map-vehicles lane (2026-10-05): a vehicle casts through its coarse stand-in on the pool's own matrices
    const shadowGeo = castsDynamicShadow && meta.shadowBuild ? meta.shadowBuild() : null;
    if (shadowGeo) group.add(vehicleShadowCaster(imI, shadowGeo, casterHeightM(shadowGeo, pool.mats4)));
    else if (castsDynamicShadow) setShadowCasterProfile(imI, { heightM: casterHeightM(geoI, pool.mats4), instanced: true }); // round 79
    if (DESTRUCTIBLE_BUILDING_TYPES[kind]) prepareWorldStructureNightFixture(imI, true);
    group.add(imI);
    pool.imI = imI;
    if (meta.broken) {
      const geoB = meta.broken(drng);
      const imB = new THREE.InstancedMesh(geoB, material, pool.mats4.length);
      imB.count = 0;
      imB.visible = false;
      imB.castShadow = castsDynamicShadow;
      imB.receiveShadow = true;
      imB.matrixAutoUpdate = false;
      imB.frustumCulled = false; // slots appended over the battle
      imB.name = 'destructible-' + kind + '-broken';
      if (castsDynamicShadow) setShadowCasterProfile(imB, { heightM: casterHeightM(geoB, pool.mats4), instanced: true }); // round 79
      if (DESTRUCTIBLE_BUILDING_TYPES[kind]) prepareWorldStructureNightFixture(imB, false);
      group.add(imB);
      pool.imB = imB;
    }
  }
  function* finalizeDestructiblePools(): Generator<PropsBuildSlice | undefined, void, void> {
    for (const [kind, pool] of dPools) {
      yield; // perf-r3: one instanced-pool build per slice (geometry per kind)
      yield* finalizeDestructiblePool(kind, pool);
    }
  }
  yield* finalizeDestructiblePools();
  // the map-vehicles lane (2026-10-05): the ground darkened under every parked vehicle (desktop tiers)
  if (!mobileProps) {
    const contact = buildVehicleContactShadows(destructibles, heightField, aniso, (kind) => {
      const meta = LOCAL_TYPES[kind];
      return meta?.instancePaint && meta.hw !== undefined && meta.hl !== undefined ? { hw: meta.hw, hl: meta.hl } : null;
    }, (record) => !record.dropped);
    if (contact) group.add(contact);
    // round 3 (the map-vehicles lane, 2026-10-07): the tracks the sleds' runners pressed into the snow behind them
    const tracks = buildRunnerTracks(destructibles, heightField, aniso, (kind) => LOCAL_TYPES[kind]?.runners ?? null,
      (record) => !record.dropped && record.state === 0);
    if (tracks) group.add(tracks);
    // round 5 (wave 278: the horn sled "with no runner tracks or trampling behind it"): the puller's boot prints between
    // a sled's runners, from its track behind it up to where he stood ahead of it
    const trample = buildRunnerTracks(destructibles, heightField, aniso, (kind) => {
      const lay = LOCAL_TYPES[kind]?.runners;
      if (!lay) return null;
      return { xs: [lay.xs.reduce((a, b) => a + b, 0) / lay.xs.length], z0: lay.z0, z1: lay.z1 + 2, width: 0.26 };
    }, (record) => !record.dropped && record.state === 0, { texture: 'trample', name: 'props-runner-trample', pitch: 1.4 });
    if (trample) group.add(trample);
    // round 5 (wave 278: the LRV with "no wheel tracks"): the rover's chevroned wheel prints, one pair of tracks (each
    // rear wheel ran in its front wheel's), out behind it the way it drove in
    const rovers = (P.vehicleSetPieces ?? []).filter((piece) => piece.kind === 'lrv' && !piece.wrecked)
      .map((piece) => ({ kind: 'lrv', x: piece.x, z: piece.z, yaw: (piece.yawDeg * Math.PI) / 180, sc: 1 }));
    const wheelTracks = buildRunnerTracks(rovers, heightField, aniso, () => ({ xs: [-0.915, 0.915], z0: -1.145 - 11, z1: 1.145 + 0.2, width: 0.12 }),
      () => true, { texture: 'chevron', name: 'props-wheel-tracks', pitch: 0.24 });
    if (wheelTracks) group.add(wheelTracks);
    // round 3: the mud a landing's hauled-out boat lies in (mapKits.ts beachedBoat's receipt), lit and shadowed
    const hauled = decorationGroundingReceipts.filter((r) => r.kind === 'beached-boat' && r.mud === true)
      .map((r) => ({ x: r.x, z: r.z, yaw: r.yaw as number, halfLength: r.halfLength as number, halfWidth: r.halfWidth as number }));
    const mud = buildBoatMud(hauled, heightField, aniso);
    if (mud) {
      engineCtx.setupShadowMaterial(mud.material as THREE.MeshStandardMaterial);
      group.add(mud);
      // no blade grows up through the mud or the hull lying in it (map.ts holds these with the scenery's holes): discs
      // along each boat, the patch's run toward the water included
      group.userData.boatMudHoles = boatMudHoles(hauled, heightField);
      // round 4 (wave 260): the mud each hull pushed up round itself as it settled
      const rims = buildBoatMudRims(hauled, heightField);
      if (rims) {
        engineCtx.setupShadowMaterial(rims.material as THREE.MeshStandardMaterial);
        group.add(rims);
      }
    }
  }

  // the scenery lane (2026-10-03): the field boundaries' walls and banks (world/scenery.ts composeFieldWorks), once
  // every solid is final — the pools' refit above reshapes the buildings' records, and the works keep off the objective
  // discs where the match placement seats them on these very solids — and off the aprons and the yards (the yard
  // structures, as placeYardDressing reads them). Low and long, grounded by their own shading and dark foot (no shadow).
  function* placeFieldBoundaryWorks(): Generator<PropsBuildSlice, void, void> {
    const scenery = (cfg as (PropsMapConfig & SceneryMapConfig) | null)?.scenery;
    if (!scenery?.fieldWorks) return;
    const yardKinds = new Set(yardStructureKinds());
    const built = yield* composeFieldWorks({
      mapId, scenery, heightField, spawns: [L.spawns.player, ...L.spawns.enemies], obstacles, trees: sceneryTrees,
      seed, mobile: mobileProps,
      hardstands: (cfg as { terrain?: { hardstands?: SceneryHardstand[] } } | null)?.terrain?.hardstands ?? [],
      yards: buildingFeatures.filter((b) => b.kind && yardKinds.has(b.kind)).map((b) => ({ x: b.x, z: b.z, w: b.w, d: b.d })),
    });
    const receipt = group.userData.scenery as { fieldWorks?: unknown } | undefined;
    if (receipt && built.receipt) receipt.fieldWorks = built.receipt;
    if (!built.wallCells.length && !built.bankGeometry) return;
    // (b13: the walls on their own dry stone — the face print, a lit material on the cascades like every other; the
    // banks on the rock material)
    const place = (geometry: THREE.BufferGeometry, material: THREE.Material, name: string): void => {
      const works = new THREE.Mesh(geometry, material);
      works.name = name;
      works.castShadow = false;
      works.receiveShadow = true;
      works.matrixAutoUpdate = false;
      group.add(works);
    };
    if (built.wallCells.length) {
      const print = yield* makeDryWall(aniso, mobileProps ? 256 : 512);
      const wallMaterial = new THREE.MeshStandardMaterial({
        map: print.albedo, normalMap: print.normal, roughnessMap: print.surface, aoMap: print.surface,
        vertexColors: true, roughness: 1, metalness: 0,
      });
      wallMaterial.name = 'props-field-walls';
      // (b14, wave 97: "uniform polygon cells": the print's two-metre tile varies by world place under the props' grime,
      // and lichen grows by world place, as on the dry-stone modules)
      engineCtx.setupShadowMaterial(wallMaterial, (shader) => { grimeHook(shader); applyStoneWallHook(shader, stoneShape); });
      wallMaterial.customProgramCacheKey = () => 'world-props-field-walls-v1';
      retainedSurfaceMaterials.push(wallMaterial);
      // (the coordinator, after the first b13 count: "full stones within a near radius, merged per cell, with a simpler
      // mid and far form"; the joinery's law) the walls by 64 m cell: two batches of one draw each, the near form's and
      // the far form's, one instance a cell in each; a cell shows its near form within the quality's near distance of
      // the camera (updateFieldWallLod) and its far form past it. Every far instance starts shown, every near one hidden
      // (the same material and program: the far draw links it for both)
      const batchOf = (forms: Array<THREE.BufferGeometry | null>, name: string) => {
        const list = forms.filter((g): g is THREE.BufferGeometry => !!g);
        if (!list.length) return null;
        const vertices = list.reduce((n, g) => n + g.getAttribute('position').count, 0);
        const indices = list.reduce((n, g) => n + (g.index ? g.index.count : 0), 0);
        const batch = new THREE.BatchedMesh(list.length, vertices, Math.max(1, indices), wallMaterial);
        batch.name = name;
        batch.sortObjects = false;
        // (b13's cost hold, Saltwind chase: the walls drew every cell's far form, behind the camera too; a cell outside
        // the frustum is culled, a few hundred sphere tests a frame against the draws they save)
        batch.perObjectFrustumCulled = true;
        batch.castShadow = false;
        batch.receiveShadow = true;
        batch.matrixAutoUpdate = false;
        const ids = forms.map((g) => (g ? batch.addInstance(batch.addGeometry(g)) : -1));
        for (const g of list) g.dispose();
        group.add(batch);
        return { batch, ids };
      };
      const near = batchOf(built.wallCells.map((c) => c.near), 'props-field-works');
      const far = batchOf(built.wallCells.map((c) => c.far), 'props-field-works-far');
      const cells = built.wallCells.map((c, i) => ({ box: c.box, near: near ? near.ids[i] : -1, far: far ? far.ids[i] : -1, nearShown: false,
        key: c.key, stones: null, midShown: false }));
      for (const cell of cells) if (near && cell.near >= 0) near.batch.setVisibleAt(cell.near, false);
      // (the switch reads the cells through the group, as the fine joinery's does: updateFieldWallLod)
      group.userData.fieldWallLod = { near: near?.batch ?? null, far: far?.batch ?? null, cells, fine: built.fine, material: wallMaterial } satisfies FieldWallLod;
    }
    if (built.bankGeometry) place(built.bankGeometry, mats.rock, built.wallCells.length ? 'props-field-banks' : 'props-field-works');
  }
  yield* placeFieldBoundaryWorks();
  // Construction-only spans are now sealed into matrices/support/colliders;
  // runtime destruction closures must not retain the placement graph.
  wallSpans.clear();
  // spatial hash over destructible records for the shell paths (8 m cells)
  // settlement pass 2 (2026-09-12): every placed building's chimney tops, world space (hearth smoke).
  const hearthAnchors = exteriorChimneyTops(buckets).map(([x, y, z]) => [x, y, z] as [number, number, number]);
  const D_CELL = 8;
  const dHash = new Map<string, number[]>();
  function indexDestructibleRecords(): void {
    for (let i = 0; i < destructibles.length; i++) {
      const rec = destructibles[i];
      const kx = Math.floor(rec.x / D_CELL), kz = Math.floor(rec.z / D_CELL);
      const key = kx + ':' + kz;
      let cell = dHash.get(key);
      if (!cell) { cell = []; dHash.set(key, cell); }
      cell.push(i);
      rec._dKey = key;
      rec._destructibleIndex = i;
    }
  }
  indexDestructibleRecords();

  // Loose bodies can cross the shell hash's 8 m cells. Re-key only on a cell
  // boundary crossing (rare); the steady-state fixed step remains allocation
  // free and shell hits never target a stale/ghost position.
  function refreshDestructibleCell(rec: DestructibleRecord): void {
    const key = Math.floor(rec.x / D_CELL) + ':' + Math.floor(rec.z / D_CELL);
    if (key === rec._dKey) return;
    const old = rec._dKey ? dHash.get(rec._dKey) : undefined;
    if (old) {
      const at = rec._destructibleIndex == null ? -1 : old.indexOf(rec._destructibleIndex);
      if (at >= 0) old.splice(at, 1);
    }
    let cell = dHash.get(key);
    if (!cell) { cell = []; dHash.set(key, cell); }
    if (rec._destructibleIndex != null) cell.push(rec._destructibleIndex);
    rec._dKey = key;
  }
  // Dedicated static broad phase for awake clutter. It uses its own stamp so
  // it cannot interfere with map.ts's movement grid over the same records.
  const LOOSE_CELL = 12;
  const looseCells = new Map<number, PropsCollisionRecord[]>();
  const looseCellKey = (x: number, z: number): number => (x + 32768) * 65536 + (z + 32768);
  function indexLoosePropObstacles(): void {
    for (const obstacle of obstacles) {
      const x0 = Math.floor(obstacle.min[0] / LOOSE_CELL), x1 = Math.floor(obstacle.max[0] / LOOSE_CELL);
      const z0 = Math.floor(obstacle.min[2] / LOOSE_CELL), z1 = Math.floor(obstacle.max[2] / LOOSE_CELL);
      for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
        const key = looseCellKey(cx, cz);
        let cell = looseCells.get(key);
        if (!cell) { cell = []; looseCells.set(key, cell); }
        cell.push(obstacle);
      }
    }
  }
  indexLoosePropObstacles();
  const looseObstacleScratch: PropsCollisionRecord[] = [];
  let looseObstacleStamp = 0;
  function queryLooseObstacles(x: number, z: number, r: number): PropsCollisionRecord[] {
    looseObstacleScratch.length = 0;
    looseObstacleStamp++;
    const x0 = Math.floor((x - r) / LOOSE_CELL), x1 = Math.floor((x + r) / LOOSE_CELL);
    const z0 = Math.floor((z - r) / LOOSE_CELL), z1 = Math.floor((z + r) / LOOSE_CELL);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const cell = looseCells.get(looseCellKey(cx, cz));
      if (!cell) continue;
      for (const ob of cell) {
        if (ob.__looseStamp === looseObstacleStamp) continue;
        ob.__looseStamp = looseObstacleStamp;
        if (ob.max[0] < x - r || ob.min[0] > x + r || ob.max[2] < z - r || ob.min[2] > z + r) continue;
        looseObstacleScratch.push(ob);
      }
    }
    return looseObstacleScratch;
  }

  // hinge-topple animation state (effects_combat r1 pole pattern, generalized
  // world-dressing r1): every entry rebuilds its instance matrix per tick from
  // the ORIGINAL placement so the hinge never compounds. Poles and topple-
  // class destructibles share the runner. Cap simultaneous anims — overflow
  // entries snap the oldest to its final pose.
  const crushAnims: CrushAnimation[] = [];
  const MAX_CRUSH_ANIMS = 14;
  const _cm = new THREE.Matrix4(), _cq = new THREE.Quaternion();
  const _cax = new THREE.Vector3();
  // Topple/toss poses run inside the RAF-driven world update. Reuse the same
  // composition matrices for every bounded animation instead of allocating
  // three Matrix4 objects per prop per frame.
  const _animM = new THREE.Matrix4();
  const _animR = new THREE.Matrix4();
  const _animT = new THREE.Matrix4();
  let fxBudget = 6; // kind-flavored break bursts per frame (refilled each tick)

  function poseToppled(a: ToppleAnimation, ang: number): void {
    if (!a.placement) return;
    _cax.set(a.ax, 0, a.az).normalize();
    _cq.setFromAxisAngle(_cax, ang);
    _animM.makeTranslation(a.x, a.y, a.z)
      .multiply(_animR.makeRotationFromQuaternion(_cq))
      .multiply(_animT.makeTranslation(-a.x, -a.y, -a.z))
      .multiply(a.placement);
    a.im.setMatrixAt(a.index, _animM);
    a.im.instanceMatrix.needsUpdate = true;
    if (a.wirePoleIndex != null && utilityNetwork) {
      const spans = utilityNetwork.setPoleFall(a.wirePoleIndex, a.ax, a.az, ang);
      rebuildWireSpans(spans);
    }
  }
  function pushCrushAnim(a: CrushAnimation): void {
    if (crushAnims.length >= MAX_CRUSH_ANIMS) {
      const old = crushAnims.shift(); // snap-finish the oldest
      if (!old) return;
      if (!old.placement) { old.im.getMatrixAt(old.index, _cm); old.placement = _cm.clone(); }
      if (old.type === 'toss') {
        if (old.spin == null) { old.spin = 6; old.r = old.h * 0.35; }
        poseTossed(old, old.dur);
      } else {
        poseToppled(old, old.maxAng);
      }
    }
    crushAnims.push(a);
  }

  // DESTRUCTIBLES r1: explosive chain queue — a red fuel drum detonating
  // inside breakRecord must not recurse into shellImpact mid-iteration, so
  // blasts are deferred one tick (also naturally staggers chained drums).
  const pendingBlasts: PendingBlast[] = [];

  function ensureLooseActive(rec: LooseDestructibleRecord): void {
    if (rec.looseListed) return;
    rec.looseListed = true;
    activeLoose.push(rec);
  }

  function kickLooseRecord(
    idx: number,
    dx: number,
    dz: number,
    speed: number,
    cause: LoosePropKickCause,
  ): boolean {
    const rec = destructibles[idx];
    if (!rec?.body || rec.looseIndex == null || rec.looseListed == null
      || !kickLooseProp(rec.body, dx, dz, speed, cause)) return false;
    ensureLooseActive(rec as LooseDestructibleRecord);
    // audio seam (2026-10-06): a knocked drum, bucket or bin clangs (the body's own kick cooldown spaces the reports)
    emitDestroyed({ kind: rec.kind, pos: [rec.x, rec.y, rec.z], cause, loose: true });
    return true;
  }

  function animateBrokenRecord(
    rec: DestructibleRecord,
    pool: DestructiblePool,
    dx: number,
    dz: number,
    speed: number,
    directionLength: number,
    settled = false,
  ): void {
    // settled (multiplayer world state, 2026-10-01): the animation starts at its end — the runner writes the final
    // pose once on the next tick and retires it — for destruction that predates this viewer's view
    if (rec.cls === 'topple') {
      setToppleAxis(_cax, dx, dz);
      pushCrushAnim({
        im: pool.imI!, index: rec.slot, x: rec.x, y: rec.y, z: rec.z,
        ax: _cax.x, az: _cax.z, t: settled ? 1.1 : 0, placement: null,
        maxAng: settledToppleAngle(heightField, rec.x, rec.y, rec.z, dx, dz,
          rec.h, Math.max(0.05, Math.min(0.22, rec.r * 0.18))),
      });
      return;
    }
    if (rec.cls === 'toss') {
      // DESTRUCTIBLES r1: rammed drums/churns go FLYING — short ballistic
      // arc along the impact direction (speed-scaled), tumbling in flight,
      // settling on their side. Persists via the anim's final pose.
      const th = 2.2 + Math.min(speed, 12) * 0.55;
      setToppleAxis(_cax, dx, dz);
      pushCrushAnim({
        type: 'toss', im: pool.imI!, index: rec.slot,
        x: rec.x, y: rec.y, z: rec.z, h: rec.h,
        vx: (dx / directionLength) * th + (drng() - 0.5) * 1.2,
        vz: (dz / directionLength) * th + (drng() - 0.5) * 1.2,
        vy: 2.6 + Math.min(speed, 12) * 0.30,
        ax: _cax.x, az: _cax.z,
        t: settled ? 1.5 : 0, placement: null, dur: 1.5,
      });
      return;
    }
    // swap-out: zero-scale the intact slot, activate a broken slot in place
    _quat.setFromAxisAngle(_upAxis, rec.yaw);
    _mat4.compose(_posv.set(rec.x, rec.y, rec.z), _quat, _zeroScale);
    pool.imI!.setMatrixAt(rec.slot, _mat4);
    pool.imI!.instanceMatrix.needsUpdate = true;
    if (!pool.imB) return;
    const bi = pool.nBroken++;
    if (bi >= pool.mats4.length) return;
    pool.imB.setMatrixAt(bi, pool.mats4[rec.slot]);
    if (pool.meta.instanceTintStrength) {
      writeStructureInstanceTint(
        _structureTint, rec.kind, rec.slot, seed, pool.meta.instanceTintStrength,
      );
      pool.imB.setColorAt(bi, _structureTint);
      pool.imB.instanceColor!.needsUpdate = true;
    }
    pool.imB.count = pool.nBroken;
    pool.imB.visible = true;
    pool.imB.instanceMatrix.needsUpdate = true;
  }

  /**
   * Break/topple/toss one destructible record. All trigger paths land here
   * (hull-overrun obstacle seam, hull-radius loop, shell sweep/impact).
   * @param {number} idx destructibles index
   * @param {number} dx break direction (XZ, need not be unit)
   * @param {number} [speed=0] impact speed m/s (hull overrun) — debris throw
   *   inherits it; 0 = shell-grade base energy
   * @param {string} [cause='shell'] 'ram' | 'shell' | 'blast'
   * @returns {boolean} true if the record broke now
   */
  function breakRecord(
    idx: number,
    dx: number,
    dz: number,
    speed = 0,
    cause: LoosePropKickCause = 'shell',
    settled = false,
  ): boolean {
    const rec = destructibles[idx];
    if (!rec || rec.state) return false;
    const pool = dPools.get(rec.kind);
    if (!rec.clutter && (!pool || !pool.imI)) return false;
    // Loose dressing is displaced, never consumed. Shells/blasts kick it too,
    // and a later tank can push the exact same object again after it settles.
    if (rec.cls === 'physics') return kickLooseRecord(idx, dx, dz, speed, cause);
    rec.state = 1;
    if (pool?.imI) setWorldNightFixtureActive(pool.imI, rec.slot, false);
    if (rec.ob) rec.ob.crushed = true;          // ghost for collision + AI
    if (rec.col) rec.col.dead = true;           // shells/LOS pass the breach
    if (rec.loopRef) rec.loopRef.toppled = true; // stop the main.ts loop
    const l = Math.hypot(dx, dz) || 1;
    if (rec.clutter) rec.clutter.setCrushed(true);
    else if (pool) animateBrokenRecord(rec, pool, dx, dz, speed, l, settled);
    // Late joiners restore persistent destruction without replaying its blast.
    if (settled) return true;
    // Explosive decoration chains next tick through the cosmetic-only impact
    // path. Collidable cover still requires an authoritative direct hit/ram.
    if (pool?.meta.explosive) {
      pendingBlasts.push({ x: rec.x, y: rec.y + rec.h * 0.4, z: rec.z });
    }
    if (fxBudget > 0) {
      fxBudget--;
      // debris inherits the rammer's velocity: dir magnitude carries energy
      // (1 = shell-grade break; a 14 m/s overrun throws ~2.6x as hard)
      const throwK = 1 + Math.min(speed, 14) * 0.115;
      emitBreakFx(rec.kind, rec.x, rec.y + Math.min(0.5, rec.h * 0.3), rec.z,
        (dx / l) * throwK, (dz / l) * throwK, rec.h);
    }
    // audio seam (DESTRUCTIBLES r1): every destruction reports on the bus
    emitDestroyed({ kind: rec.kind, pos: [rec.x, rec.y, rec.z], cause });
    return true;
  }

  /** main.ts crushables-loop contract (poles + 'loop'-class destructibles). */
  function crushProp(i: number, dx: number, dz: number, speed = 0): boolean {
    const c = crushables[i];
    if (!c || c.toppled) return false;
    if (c.recIdx != null) {
      const rec = destructibles[c.recIdx];
      if (rec && rec.body) return kickLooseRecord(c.recIdx, dx, dz, speed, 'ram');
      c.toppled = true;
      return breakRecord(c.recIdx, dx, dz, speed, 'ram');
    }
    if (!poleIM || c.index == null) return false;
    c.toppled = true;
    setToppleAxis(_cax, dx, dz);
    // Hinge axis is perpendicular to travel and oriented so a positive
    // right-handed rotation makes the pole fall along the ram direction.
    pushCrushAnim({
      im: poleIM, index: c.index, x: c.x, y: c.y, z: c.z,
      wirePoleIndex: c.wirePoleIndex,
      ax: _cax.x, az: _cax.z, t: 0, placement: null,
      maxAng: settledToppleAngle(heightField, c.x, c.y, c.z, dx, dz, c.h, 0.12),
    });
    // audio seam (2026-10-06): the pole's foot cracks, its wires whip, it lands — every pole carries the line's wires
    emitDestroyed({ kind: 'utility_pole', pos: [c.x, c.y, c.z], cause: 'ram' });
    return true;
  }

  /** map.ts crushObstacle seam for prop-tagged crushable obstacles. */
  function crushDestructible(
    propIdx: number,
    dx: number,
    dz: number,
    speed = 0,
    cause: LoosePropKickCause = 'ram',
    settled = false,
  ): boolean {
    return breakRecord(propIdx, dx, dz, speed, cause, settled);
  }

  // Cosmetic shell paths (effects.ts forwards flight/impact presentation).
  // Never mutate movement or shell cover here: solo hit resolution and network
  // destruction events own those records through crushDestructible above.
  const _dCells: number[][] = [];
  function cellsAround(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    pad: number,
  ): number[][] {
    _dCells.length = 0;
    const minX = Math.floor((Math.min(x0, x1) - pad) / D_CELL);
    const maxX = Math.floor((Math.max(x0, x1) + pad) / D_CELL);
    const minZ = Math.floor((Math.min(z0, z1) - pad) / D_CELL);
    const maxZ = Math.floor((Math.max(z0, z1) + pad) / D_CELL);
    // cap the scan: a chained flight segment can span tens of meters (an
    // APFSDS covers ~28 m per sim tick), so allow a generous window — empty
    // cells are a Map miss each; a pathological hitch-length span still bails
    if ((maxX - minX + 1) * (maxZ - minZ + 1) > 220) return _dCells;
    for (let kx = minX; kx <= maxX; kx++) {
      for (let kz = minZ; kz <= maxZ; kz++) {
        const cell = dHash.get(kx + ':' + kz);
        if (cell) _dCells.push(cell);
      }
    }
    return _dCells;
  }
  const _slabRange = [0, 1];
  function clipShellAxis(origin: number, delta: number, min: number, max: number): boolean {
    if (Math.abs(delta) < 1e-9) return origin >= min && origin <= max;
    const inv = 1 / delta;
    let near = (min - origin) * inv, far = (max - origin) * inv;
    if (near > far) { const swap = near; near = far; far = swap; }
    if (near > _slabRange[0]) _slabRange[0] = near;
    if (far < _slabRange[1]) _slabRange[1] = far;
    return _slabRange[0] <= _slabRange[1];
  }
  function shellSegmentHitsRecord(
    rec: DestructibleRecord,
    ax: number,
    ay: number,
    az: number,
    dx: number,
    dy: number,
    dz: number,
  ): boolean {
    _slabRange[0] = 0;
    _slabRange[1] = 1;
    return clipShellAxis(ax, dx, rec.x - rec.r, rec.x + rec.r)
      && clipShellAxis(ay, dy, rec.y - 0.4, rec.y + rec.h)
      && clipShellAxis(az, dz, rec.z - rec.r, rec.z + rec.r);
  }
  function shellSweep(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
  ): void {
    let broke = 0;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    for (const cell of cellsAround(ax, az, bx, bz, 2.5)) {
      for (const idx of cell) {
        const rec = destructibles[idx];
        if (rec.state || rec.ob || rec.col) continue;
        // Slab test: segment vs the record's AABB (x/z ± r, y .. y+h).
        if (shellSegmentHitsRecord(rec, ax, ay, az, dx, dy, dz)
          && breakRecord(idx, dx, dz, 0, 'shell') && ++broke >= 3) return;
      }
    }
  }
  function shellImpact(
    x: number,
    y: number,
    z: number,
    opts: ShellImpactSettings = {},
  ): void {
    const r = opts.r ?? (opts.he ? 4.6 : 1.0);
    const cause = opts.cause || 'blast';
    let broke = 0;
    for (const cell of cellsAround(x, z, x, z, r + 2.5)) {
      for (const idx of cell) {
        const rec = destructibles[idx];
        if (rec.state || rec.ob || rec.col) continue;
        const ddx = rec.x - x, ddz = rec.z - z;
        if (Math.hypot(ddx, ddz) > r + rec.r) continue;
        if (y < rec.y - r || y > rec.y + rec.h + r) continue;
        if (breakRecord(idx, ddx, ddz, 0, cause) && ++broke >= 6) return;
      }
    }
  }
  const registerDestructibles = (): (() => void) => registerWorldDestructibles({
    key: mapId,
    isActive: () => {
      for (let o: THREE.Object3D | null = group; o; o = o.parent) {
        if (o.visible === false) return false;
      }
      return !!group.parent; // only once assembled into a scene
    },
    sweep: shellSweep,
    impact: shellImpact,
  });

  // DESTRUCTIBLES r1: tossed-prop pose — ballistic arc along the impact
  // direction with tumble, composed about the prop's own center against the
  // ORIGINAL placement (same non-compounding rule as the hinge topple).
  const _tq = new THREE.Quaternion();
  function poseTossed(a: TossAnimation, t: number): void {
    if (!a.placement) return;
    const u = Math.min(t / a.dur, 1);
    const ox = a.vx * t, oz = a.vz * t;
    let oy = a.vy * t - 4.9 * t * t;
    // rest pose: lying on its side — center drops from h/2 to its radius
    const rest = (a.r ?? a.h * 0.34) - a.h * 0.5;
    const gd = heightField.getHeightAt(a.x + ox, a.z + oz)
      - heightField.getHeightAt(a.x, a.z);
    if (oy < rest + gd) oy = rest + gd;
    // tumble, easing into a flat-lying quarter-turn multiple by touchdown
    const rawAng = (a.spin ?? 0) * t;
    const lieAng = (Math.floor(rawAng / Math.PI) + 0.5) * Math.PI;
    const ang = u < 0.72 ? rawAng : rawAng + (lieAng - rawAng) * ((u - 0.72) / 0.28);
    _cax.set(a.ax, 0, a.az).normalize();
    _tq.setFromAxisAngle(_cax, ang);
    // M = T(flight offset) * T(center) * R * T(-center) * placement — tumble
    // about the prop's own mid-height, carried along the ballistic offset
    const cy = a.y + a.h * 0.5;
    _animM.makeTranslation(a.x + ox, cy + oy, a.z + oz)
      .multiply(_animR.makeRotationFromQuaternion(_tq))
      .multiply(_animT.makeTranslation(-a.x, -cy, -a.z))
      .multiply(a.placement);
    a.im.setMatrixAt(a.index, _animM);
    a.im.instanceMatrix.needsUpdate = true;
  }

  // Persistent loose-body pose: rotate the authored placement about its
  // scaled mid-height, then carry that center with the body. Shared matrices
  // keep every awake-body step allocation-free.
  const _looseQ = new THREE.Quaternion();
  const _looseM = new THREE.Matrix4();
  const _looseR = new THREE.Matrix4();
  function poseLooseRecord(rec: LooseDestructibleRecord): void {
    const b = rec.body, pool = dPools.get(rec.kind);
    if (!b || !pool || !pool.imI) return;
    _looseQ.set(b.qx, b.qy, b.qz, b.qw);
    _looseM.makeTranslation(b.x, b.y, b.z);
    _looseR.makeRotationFromQuaternion(_looseQ);
    _looseM.multiply(_looseR);
    _looseR.makeTranslation(-b.homeX, -(b.homeBaseY + b.height * 0.5), -b.homeZ);
    _looseM.multiply(_looseR).multiply(pool.mats4[rec.slot]);
    pool.imI.setMatrixAt(rec.slot, _looseM);
    pool.imI.instanceMatrix.needsUpdate = true;
  }

  function syncLooseRecord(rec: LooseDestructibleRecord): void {
    const b = rec.body;
    rec.x = b.x; rec.y = b.y - b.height * 0.5; rec.z = b.z;
    if (rec.loopRef) {
      rec.loopRef.x = b.x;
      rec.loopRef.y = b.y - b.radius;
      rec.loopRef.z = b.z;
    }
    refreshDestructibleCell(rec);
    poseLooseRecord(rec);
  }

  let looseAcc = 0;
  function integrateLooseProps(): void {
    for (let i = activeLoose.length - 1; i >= 0; i--) {
      const rec = activeLoose[i], b = rec.body;
      stepLoosePropBody(b, LOOSE_PROP_STEP_S,
        heightField.getHeightAt, heightField.getNormalAt);
      for (const ob of queryLooseObstacles(b.x, b.z, b.radius + 0.08)) {
        resolveLoosePropObstacle(b, ob);
      }
    }
  }
  function resolveLoosePropPairs(): void {
    for (let i = 0; i < activeLoose.length; i++) {
      const rec = activeLoose[i], a = rec.body;
      for (let j = 0; j < looseRecords.length; j++) {
        const other = looseRecords[j];
        if (other === rec || (other.body.active && other.looseIndex < rec.looseIndex)) continue;
        const wakes = resolveLoosePropPair(a, other.body);
        if ((wakes & 1) && !rec.looseListed) ensureLooseActive(rec);
        if (wakes & 2) ensureLooseActive(other);
      }
    }
  }
  function syncAndRetireLooseProps(): void {
    for (let i = activeLoose.length - 1; i >= 0; i--) {
      const rec = activeLoose[i];
      syncLooseRecord(rec);
      if (!rec.body.active) {
        rec.looseListed = false;
        activeLoose.splice(i, 1);
      }
    }
  }
  function updateLooseProps(dt: number): void {
    if (!activeLoose.length || dt <= 0) return;
    looseAcc = Math.min(0.1, looseAcc + dt);
    while (looseAcc >= LOOSE_PROP_STEP_S) {
      looseAcc -= LOOSE_PROP_STEP_S;
      // Integrate + collide with static cover first.
      integrateLooseProps();
      // Momentum transfer wakes neighboring sleeping clutter. Active/active
      // pairs are resolved once by looseIndex ordering.
      resolveLoosePropPairs();
      syncAndRetireLooseProps();
    }
  }

  let animatedTimeS = 0; // round 67: the world clock the moored hulls ride
  const _hullPose: MooredHullPose = { heave: 0, roll: 0, pitch: 0 };
  // regional-buildings lane (2026-10-03): the fine joinery's cells shown within the quality preset's fine-detail distance
  // of the camera (3D, to the cell's box), hidden 15 m past it (hysteresis); the preset re-read once a second. At High
  // (900-1080 rows) a 7 cm frame is half a pixel at ~120 m.
  const FINE_DETAIL_M: Readonly<Record<string, number>> = {
    ultra: 180, high: 120, medium: 90, low: 70, 'mobile-high': 70, mobile: 60, 'mobile-low': 45,
  };
  // the scenery lane (b13): the field walls' cells, their near form within the quality's near distance of the camera
  // (3D, to the cell's box), their far form past it, 10 m of hysteresis; the preset re-read once a second. At High a
  // top stone's 5 cm step is under half a pixel at 80 m (the cost hold's chase view read 100 m's near cells).
  const FIELD_WALL_NEAR_M: Readonly<Record<string, number>> = {
    ultra: 110, high: 80, medium: 65, low: 50, 'mobile-high': 45, mobile: 35, 'mobile-low': 25,
  };
  // (b17; gauntlet wave 121, Saltwind's walls "a smooth extruded strip ... mortared, not dry-stone") within a nearer
  // distance still a cell draws its stone form (fieldWorks.ts buildFieldWallFineSteps: every stone, its joints, the
  // through-stones, the coping), built when the camera comes within it — one cell at a time, a few milliseconds a frame,
  // its mid form showing until it is done — and let go when it leaves (8 m of hysteresis); its mid form hides while it
  // shows. Every cell's stone form at once would hold millions of triangles (Saltwind: 4.2 M), so only the few near the
  // camera are ever built. None on a phone, none at Low.
  // (at High a stone is ten pixels tall at 30 m, a cell's box within 30 m of the camera is one to four cells, 20-25 k
  // triangles each on Saltwind: the mid form takes over past it)
  const FIELD_WALL_FINE_M: Readonly<Record<string, number>> = {
    ultra: 45, high: 30, medium: 22, low: 0, 'mobile-high': 0, mobile: 0, 'mobile-low': 0,
  };
  /** A frame's share of the stone form being built (ms). */
  const FIELD_WALL_STONE_BUDGET_MS = 2;
  type WallCell = FieldWallLod['cells'][number];
  let wallJob: { cell: WallCell; steps: Generator<unknown, THREE.BufferGeometry | null, void> } | null = null;
  let wallNear = 80, wallFine = 45, wallFrames = 0;
  function updateFieldWallLod(cameraPos: THREE.Vector3 | null): void {
    const lod = group.userData.fieldWallLod as FieldWallLod | undefined;
    if (!lod || !cameraPos) return;
    if (wallFrames-- <= 0) {
      const preset = resolvePresetName();
      wallNear = FIELD_WALL_NEAR_M[preset] ?? 80; wallFine = lod.fine ? FIELD_WALL_FINE_M[preset] ?? 0 : 0; wallFrames = 60;
    }
    const { near, far, cells } = lod;
    // the stone form being built: a few milliseconds of it a frame
    if (wallJob) {
      const start = performance.now();
      let step = wallJob.steps.next();
      while (!step.done && performance.now() - start < FIELD_WALL_STONE_BUDGET_MS) step = wallJob.steps.next();
      if (step.done) {
        const { cell } = wallJob, g = step.value;
        wallJob = null;
        if (g) {
          const mesh = new THREE.Mesh(g, lod.material);
          mesh.name = 'props-field-works-stones';
          mesh.castShadow = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
          group.add(mesh);
          cell.stones = mesh;
        } else cell.stones = false;
      }
    }
    let pending = 0;
    for (const cell of cells) {
      const b = cell.box;
      const dx = Math.max(b.minX - cameraPos.x, 0, cameraPos.x - b.maxX);
      const dy = Math.max(b.minY - cameraPos.y, 0, cameraPos.y - b.maxY);
      const dz = Math.max(b.minZ - cameraPos.z, 0, cameraPos.z - b.maxZ);
      const d = Math.hypot(dx, dy, dz);
      const wantStones = wallFine > 0 && (cell.stones ? d < wallFine + 8 : d < wallFine + (wallJob?.cell === cell ? 8 : 0));
      if (wantStones && cell.stones === null && !wallJob && lod.fine) {
        wallJob = { cell, steps: buildFieldWallFineSteps(lod.fine, cell.key) };
      } else if (!wantStones && wallJob?.cell === cell) {
        wallJob.steps.return(null); // (the camera turned away before it was done)
        wallJob = null;
      } else if (!wantStones && cell.stones !== null) {
        if (cell.stones) { group.remove(cell.stones); cell.stones.geometry.dispose(); }
        cell.stones = null;
      }
      if (wantStones && cell.stones === null) pending++;
      const show = cell.nearShown ? d < wallNear + 10 : d < wallNear;
      const midShown = show && !cell.stones;
      if (midShown !== cell.midShown) { cell.midShown = midShown; if (near && cell.near >= 0) near.setVisibleAt(cell.near, midShown); }
      if (show === cell.nearShown) continue;
      cell.nearShown = show;
      if (far && cell.far >= 0) far.setVisibleAt(cell.far, !show);
    }
    lod.pending = pending;
  }
  let fineFar = 120, fineFrames = 0;
  function updateFineDetail(cameraPos: THREE.Vector3 | null): void {
    const batches = group.userData.fineDetail as Array<{ mesh: THREE.BatchedMesh; cells: Array<{ id: number; box: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }; near?: true }> }> | undefined;
    if (!batches?.length || !cameraPos) return;
    if (fineFrames-- <= 0) { fineFar = FINE_DETAIL_M[resolvePresetName()] ?? 90; fineFrames = 60; }
    for (const { mesh, cells } of batches) for (const { id, box: b, near } of cells) {
      const dx = Math.max(b.minX - cameraPos.x, 0, cameraPos.x - b.maxX);
      const dy = Math.max(b.minY - cameraPos.y, 0, cameraPos.y - b.maxY);
      const dz = Math.max(b.minZ - cameraPos.z, 0, cameraPos.z - b.maxZ);
      // the craft's near cells (mergeMaterialBuckets NEAR_CELL_M) show within half the distance
      const d = Math.hypot(dx, dy, dz), shown = mesh.getVisibleAt(id), far = near ? fineFar * 0.5 : fineFar;
      if (shown ? d > far + 15 : d < far) mesh.setVisibleAt(id, !shown);
    }
  }

  function updateProps(dt: number, cameraPos: THREE.Vector3 | null = null): void {
    updatePoleLod(cameraPos);
    updateRockLod(cameraPos);
    updateFineDetail(cameraPos);
    updateFieldWallLod(cameraPos);
    if (mooredHulls.length) {
      animatedTimeS += dt;
      for (let i = 0; i < mooredHulls.length; i++) {
        const hull = mooredHulls[i];
        mooredHullPose(animatedTimeS, hull.phase, _hullPose);
        const mesh = hull.mesh;
        mesh.position.y = hull.y + _hullPose.heave;
        mesh.rotation.x = _hullPose.pitch;
        mesh.rotation.z = _hullPose.roll;
        mesh.updateMatrix();
        if (mesh.parent) mesh.matrixWorld.multiplyMatrices(mesh.parent.matrixWorld, mesh.matrix);
        else mesh.matrixWorld.copy(mesh.matrix);
      }
    }
    if (stepDestruction(dt)) updatePoleLod(cameraPos);
  }

  /**
   * The destruction's own clock (2026-10-06, split out of updateProps for the Scene Studio, whose hulls crush what
   * they overrun on its timeline while its world update holds dt at 0): the kind-burst budget, the drum blasts, the
   * loose dressing and the crush animations. Returns whether a crush animation ran (a toppled pole needs its LOD).
   */
  function stepDestruction(dt: number): boolean {
    fxBudget = 6; // per-frame kind-burst cap refill
    // DESTRUCTIBLES r1: deferred explosive-drum blasts (max 2/tick so chains
    // ripple instead of detonating as one frame spike)
    for (let b = 0; b < 2 && pendingBlasts.length; b++) {
      const bl = pendingBlasts.shift();
      if (!bl) break;
      emitBreakFx('drumblast', bl.x, bl.y, bl.z, 0, 0, 1.4); // flavored fireball
      shellImpact(bl.x, bl.y, bl.z, { r: 5.4, he: true, cause: 'blast' });
    }
    updateLooseProps(dt);
    if (!crushAnims.length) return false; // zero per-frame cost when idle
    for (let k = crushAnims.length - 1; k >= 0; k--) {
      const a = crushAnims[k];
      if (!a.placement) {
        // capture the ORIGINAL placement on the first tick so the hinge/arc
        // composes against it, never an already-rotated matrix
        a.im.getMatrixAt(a.index, _cm);
        a.placement = _cm.clone();
        if (a.type === 'toss') {
          a.spin = 5.0 + mulberry32((a.index + 3) * 2654435761)() * 4.5;
          a.r = a.h * 0.35;
        } else {
          // random hinge-axis wobble so simultaneous topples de-sync
          const wob = (mulberry32((a.index + 1) * 2654435761)() - 0.5) * 0.22;
          const cw = Math.cos(wob), sw = Math.sin(wob);
          const nx = a.ax * cw - a.az * sw, nz = a.ax * sw + a.az * cw;
          a.ax = nx; a.az = nz;
        }
      }
      if (a.type === 'toss') {
        a.t = Math.min(a.t + dt, a.dur);
        poseTossed(a, a.t);
        if (a.t >= a.dur) crushAnims.splice(k, 1);
        continue;
      }
      a.t = Math.min(a.t + dt, 1.1);
      // eased fall to ~83-85deg with a small end bounce
      const u = Math.min(a.t / 0.8, 1);
      let ang = a.maxAng * u * u * (3 - 2 * u);
      if (a.t > 0.8) ang = a.maxAng - 0.06 * Math.sin((a.t - 0.8) * 18) * Math.exp(-(a.t - 0.8) * 6);
      poseToppled(a, ang);
      if (a.t >= 1.1) crushAnims.splice(k, 1);
    }
    return true;
  }
  function advanceDestructibles(dt: number): void {
    if (stepDestruction(dt)) updatePoleLod(null);
  }

  /**
   * DESTRUCTIBLES r1: rematch restore — worlds are cached and reused across
   * battles, so startBattle() calls this to stand every broken/toppled/
   * tossed destructible back up: records reset, intact instance matrices
   * restored, broken pools emptied, obstacle/collider ghosts revived, pole
   * topples righted and any in-flight anims dropped.
   */
  function restoreDestructibleRecord(rec: DestructibleRecord): void {
    if (rec.ob) {
      rec.ob.crushed = false;
      rec.ob._pressS = 0;
      rec.ob._pressT = -1e9;
    }
    if (rec.col) rec.col.dead = false;
    if (rec.loopRef) rec.loopRef.toppled = false;
    if (rec.body) {
      resetLoosePropBody(rec.body);
      rec.looseListed = false;
      rec.x = rec.body.homeX; rec.y = rec.body.homeBaseY; rec.z = rec.body.homeZ;
      if (rec.loopRef) {
        rec.loopRef.x = rec.x; rec.loopRef.y = rec.y; rec.loopRef.z = rec.z;
      }
      refreshDestructibleCell(rec);
      const pool = dPools.get(rec.kind);
      if (pool && pool.imI) {
        pool.imI.setMatrixAt(rec.slot, pool.mats4[rec.slot]);
        pool.imI.instanceMatrix.needsUpdate = true;
      }
      return;
    }
    if (!rec.state) return;
    rec.state = 0;
    if (rec.clutter) rec.clutter.setCrushed(false);
    const pool = dPools.get(rec.kind);
    if (pool && pool.imI) {
      setWorldNightFixtureActive(pool.imI, rec.slot, true);
      pool.imI.setMatrixAt(rec.slot, pool.mats4[rec.slot]);
      pool.imI.instanceMatrix.needsUpdate = true;
    }
  }
  function resetBrokenPools(): void {
    for (const pool of dPools.values()) {
      pool.nBroken = 0;
      if (pool.imB) {
        pool.imB.count = 0;
        pool.imB.visible = false;
        pool.imB.instanceMatrix.needsUpdate = true;
      }
    }
  }
  function restoreToppledPoles(): void {
    // felled telegraph poles stand back up (their placement matrices are
    // authoritative in bakedInstances; the topple only ever composed on top)
    if (!poleIM) return;
    let dirty = false;
    for (const c of crushables) {
      if (c.recIdx != null || c.index == null) continue;
      if (!c.toppled) continue;
      c.toppled = false;
      const e = bakedInstances.get('pole');
      if (e && e.list[c.index]) {
        poleIM.setMatrixAt(c.index, e.list[c.index]);
        dirty = true;
      }
    }
    if (dirty) poleIM.instanceMatrix.needsUpdate = true;
    updatePoleLod(lastPoleCamera, true);
  }
  function resetDestructibles(): void {
    crushAnims.length = 0;
    pendingBlasts.length = 0;
    activeLoose.length = 0;
    looseAcc = 0;
    for (const rec of destructibles) restoreDestructibleRecord(rec);
    resetBrokenPools();
    restoreToppledPoles();
    if (utilityNetwork) {
      utilityNetwork.reset();
      rebuildWireSpans();
    }
  }

  registerWorldNightLighting(group, mats.curtain, destructibles, mapId, [
    { material: mats.glass, intensity: 2 },
    { material: mats.structureWood, intensity: 1.2 },
    { material: mats.structureMetal, intensity: 1.2 },
    { material: mats.structureCanvas, intensity: 1.2 },
  ]);
  // destruction (§16): every structure's placement as the passes that move buildings left it
  for (const [structureIdx, entry] of structurePlacements) {
    const described = structureDamage.get(structureIdx);
    if (!described) continue;
    const placement = described.anatomy.placement;
    if (entry.feature) { placement.x = entry.feature.x; placement.z = entry.feature.z; placement.yaw = entry.feature.rot; }
    placement.y = entry.contact.min[1] - entry.contactMinY;
  }
  nearMeshVertexHeights = null; // (a query after the build asks the field)
  return { group, obstacles, colliders, crushables, crushProp, crushDestructible, structureDamage, structureSpans, structureMaterials,
    destructibles, looseRecords, updateProps, advanceDestructibles, resetDestructibles, tankWreckSpots, utilityNetwork,
    utilityPolePlacements, decorationGroundingReceipts,
    sourcedTexturesReady, registerDestructibles, waterContacts,
    getLoosePropStats: () => ({ total: looseRecords.length, active: activeLoose.length }),
    features: { buildings: buildingFeatures, tacticalBeats: tacticalBeatFeatures, hearths: hearthAnchors } };
}
