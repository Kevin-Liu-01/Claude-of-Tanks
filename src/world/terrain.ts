import { smoothRoadGradesByDistance, blendRoadNetworkGrades } from './maps/roadGradeSmoothing.ts';
import { fadeDistantCoastShadows } from './coastShadow.ts';
import { bindAutumnHorizonGround, refreshHorizonGroundTone } from './horizonAutumnGround.ts';
import { continueHorizonFold } from './horizonSeam.ts';
import { continuedGroundAt } from './horizonSurface.ts';
import { planAssaultTrenchLines, planFieldTrenchLines, assaultTeamCenters, assaultTrenchCarveDepth, FIELD_TRENCH, type AssaultTrenchPlan } from '../sim/assaultLines.ts';
import type { NavigationWaterPolicy } from '../sim/botRoutePlanner.ts';
// src/world/terrain.ts — 1 km simplex heightfield + chunked LOD meshes + splat-blended
// procedural PBR ground material. Pure part (createHeightField) is node-runnable.
// Contract: docs/ARCHITECTURE.md §2.7, §3.2; visuals per docs/research/graphics-aaa.md §6–7.

import * as THREE from 'three';
import { createTerrainContactSampler } from './terrainContactSurface.ts';
import {
  chooseTerrainLodBuild,
  initialTerrainLods,
  terrainLodForDistance,
  type TerrainLodBuild,
  type TerrainLodLevel,
} from './terrainLodPolicy.ts';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { applySourcedTerrain, prepareSourcedTerrain, resolveSourcedTerrainPalette, sourcedTerrainLayerPlanned, sourcedTerrainLayerSet,
  type TerrainPaletteId, type TerrainSourcePreparation } from './sourcedTextures.ts';
import type { HorizonMapConfig, HorizonRingPipeline } from './maps/horizon.ts';
// The visual horizon installs its ring (horizonRingHook.ts); the authority's height field must not carry it.
import { horizonRing, horizonRingSupplyFor, type HorizonRing } from './horizonRingHook.ts';
// MOBILE r1: central tier texture scale (desktop returns sizes unchanged)
import { onPresetChange, resolvePresetName, texSize } from '../engine/quality.ts';
import { terrainWallSkyLift } from '../engine/groundBounce.ts';
import { registerRetainedObject3DResources } from '../engine/resourceLifetime.ts';
import { shorelineDistance, shorelineRadiusAt, shorelineWetness, sampleShorelineMask } from './shoreline.ts';
import { alignLiquidLakeLevels, buildLiquidLakeBanks, buildLiquidMarshSurfaces, LIQUID_MARSH_CORE, LIQUID_MARSH_STRIDE } from './liquidMarshSurface.ts';
import { composeLakeHeight, type LakeHeightResult } from './lakeHeightComposition.ts';
import { buildLiquidMarshIndex, liquidMarshIndexBucket, sampleIndexedMarshWetness } from './liquidMarshIndex.ts';
import { createHardstandVegetationExclusion, stampHardstandRoadGrids, stampHardstandRoadMask, type HardstandConfig } from './hardstandSurface.ts';
import {
  RAIL_OPEN_RANGES_BACK_M, RAIL_OPEN_RUN_M, createRailSpurExclusion, railCuttingExcludes, railCuttingFaceSeedAt, railCuttingHeight,
  railCuttingSeatWeight, resolveRailCuttings, resolveRailOpenLine,
  type RailOpenLine, type RailSpurConfig,
} from './railSpurs.ts';
import { roadCoreMask, roadLaneSharpness } from './roadMaskProfile.ts';
import {
  MAP_PATH_SURFACES, MAP_PAVED_SURFACES, ROAD_SURFACE_CODE, pavedSurfaceUniforms, roadSurfaceUniforms,
  type PavedSurfaceConfig, type RoadSurface, type RoadSurfaceWork,
} from './roadSurfaces.ts';
import { trackSurfaceAt, trackSurfacePolicy, type TrackSurface } from './trackSurface.ts';
import { completeRoadEndpoints, gradeRoadPortals, alignHardstandRoadPortals,
  usesInheritedRoadGrades, remapInheritedRoadElevations, alignAddedRoadJunctionGrades,
  originalRoadPlacementConfig } from './maps/roadEndpoints.ts';
import { alignFjordNorthernRoadGrades, alignCopperNorthernRoadGrades, alignPoldersNorthernRoadGrades,
  stampRoadBorderCorridors, usesBoundedRoadShoulders } from './maps/roadBorderCorridor.ts';
import { buildRoadStationOrigins, usesPhysicalRoadStations, buildPhysicalRoadStationOrigins, type RoadStationOrigin } from './maps/roadStations.ts';
import { stampShoreDirtMask } from './shoreDirtMask.ts';
import { stampWorkedGroundMask, type WorkedGroundPatch } from './workedGroundMask.ts';
import { COPPER_QUARRY, insideCopperQuarry, sampleCopperQuarrySurface } from './copperQuarrySurface.ts';
import { preparePlayableRelief, samplePlayableRelief, type PlayableRelief, type PreparedPlayableRelief } from './playableRelief.ts';
import { createGeologyRockSampler, createGeologyZoneSampler, knollGeologyHeight, ridgeGeologyHeight, type GeologyZones, type LandformGeology } from './landformGeology.ts';
import { sampleRedrockCanyon } from './redrockCanyon.ts';
import { createBorderLandform, resolveBorderLandform, type BorderLandformSettings } from './borderLandform.ts';
import type { FarmsteadStyle } from './borderFarmsteads.ts';
import { shallowWaterDepth, waterContactProfile } from './waterContact.ts';
import { createShallowWaterSurface, shallowWaterGeometrySteps } from './shallowWater.ts';
import { createWaterRippleField } from './waterRipples.ts';
import { createOceanField, oceanFieldSupported, oceanGridSize, type OceanField } from './oceanFft.ts';
import { oceanSpectrumSteps, resolveOceanState, type OceanConfig, type OceanSpectrumTexels } from './oceanSpectrum.ts';
import type { CloudscapeConfig } from '../engine/cloudscapes.ts';
import { buildOutlandWaterGeometry, resolveSeaOpenings, seaOpeningUniforms, seaBankUniforms, seaSectorBlend, SEA_COAST_GLSL, type SeaOpening } from './edgeWater.ts';
// Round 73 (2026-09-25): the ground redux profile — transitions, folds, snow, glint and the shoreline clock (no sampler)
import { cinderYardWeedsAt, groundReduxUniformValues, resolveGroundReduxProfile } from './groundRedux.ts';
import { LAND_BAKE_LAYERS, LAND_USE_GLSL, bakeLandUseSteps, landUseAt, landUseTierOf, landUseUniformValues, resolveLandUseProfile, type LandFieldSample } from './landUse.ts';
import {
  normalTextureFromHeight as normalFromHeight,
  textureFromRgbaPixels as canvasToTexture,
  tileableTorusNoise as torusNoise,
} from './proceduralTexture.ts';

/** The installed horizon ring's builder (horizonRingHook.ts): this module never imports the visual horizon. It sits
 * above the chunk section on purpose: receipts that compile the chunk section on its own (from the CHUNKS constant to
 * the end) supply their own buildHorizonRingSteps stub, which a later declaration would override. Keep the chunk
 * constant's declaration text out of this note: those receipts find the section by its first occurrence. */
function buildHorizonRingSteps(...args: Parameters<HorizonRing['buildHorizonRingSteps']>): ReturnType<HorizonRing['buildHorizonRingSteps']> {
  return horizonRing().buildHorizonRingSteps(...args);
}

type GroundType = 'hard' | 'medium' | 'soft';
type RoadPoint = [number, number];
type RoadLine = RoadPoint[];
type ToneFunction = (hue: number, saturation: number, lightness: number) => readonly [number, number, number];
type ColorTriple = readonly [number, number, number];
type MaterialShader = Parameters<THREE.MeshStandardMaterial['onBeforeCompile']>[0];
type MaterialShaderHook = (shader: MaterialShader) => void;

interface RoadBound {
  at: number;
  lo?: number;
  hi?: number;
}

interface GridRoadConfig {
  xs: readonly (number | RoadBound)[];
  zs: readonly (number | RoadBound)[];
  jitter?: number;
}

interface AuthoredRoadConfig {
  grid?: GridRoadConfig;
  paths?: readonly (readonly (readonly [number, number])[])[];
  /** 2026-10-05: pathStyles[i] styles paths[i] (its endpoint completion too); null or absent, the map's own road. */
  pathStyles?: readonly (RoadPathStyle | null | undefined)[];
}

/**
 * Ground lane (2026-10-05; Ruinspires first — Shanghai's lilong lanes, Ronda's streets and the Lorraine villages want
 * the same): a road path's own surface and carriageway width. The terrain draws it — the core's width in the ground
 * mask, the surface from the mask stack's road layer (one texel: the nearest path's class, half-width and heading) —
 * and nothing else reads it: placement keeps ROAD_FOOTPRINT_CLEAR_M, grading and collision are unchanged.
 */
export interface RoadPathStyle {
  /** asphalt: dark and even, with lane wear; cobble: setts in courses across the road; patched: asphalt with paler
   * and darker patches and cracks; dirt: packed earth (the country road); (roads lane, 2026-10-09) clinker: a dyke road's
   * klinkers in herringbone; concrete: a lane road in sawn slabs; brick: brick soling in herringbone, broken and
   * mud-dressed. Absent: the map's roadTint / roadTexMix. */
  surface?: RoadSurface;
  /** The carriageway's full width (m), 4–18; absent: the map's ~7.7 m gauge. */
  widthM?: number;
  /** Roads lane (2026-10-09): set on a style the period catalogue gave (roadSurfaces.ts MAP_PATH_SURFACES), never
   * authored — the road layer marks it so the Low tier draws the path as the map's own road. */
  catalogue?: boolean;
}
/** The road frame layer's running-length unit (texel value per metre): 15 bits wrap at 512 m, a whole number of the
 * along-road patterns' periods (0.16 m tread, 0.128 m chevrons, 0.8 m washboard). */
export const ROAD_FRAME_ARC_UNITS = 64;
/** A styled path's carriageway half-width (m), its wandering edge within the mask's 12 m distance ramp. */
function roadStyleHalfWidth(style: RoadPathStyle | null | undefined): number {
  return style?.widthM ? clamp(style.widthM / 2, 2, 9) : 0;
}

interface VillageConfig {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  cx: number;
  cz: number;
  feather: number;
  flatten: number;
  relief?: number;
}

interface SpawnPoint {
  x: number;
  z: number;
  yaw?: number;
  /** Presence opts Alpha into vehicle-right columns and backward-facing rows. */
  formation?: { columnSpacingM: number; rowSpacingM: number };
}

interface SpawnConfig {
  player: SpawnPoint;
  enemies: SpawnPoint[];
}

interface MarshSourceConfig {
  x: number;
  z: number;
  r: number;
  /** Round 47 follow-up: a shore ring that mirrors an authored bay contour (Saltmere's strand ramp). */
  radii?: import('./shoreline.ts').ShorelineRadii;
  dip?: number;
  depth?: number;
  level?: number;
  /** Round 61 (2026-09-24, Amberford's bridge): the road that crosses this station does so on a BRIDGE — a level deck
   * over the water (resolveBridgeDecks below) instead of the 14–18 m dry band every other crossing is graded through. */
  crossing?: 'bridge';
  /** Maps lane B (2026-10-03): a sor station — part of the flat `sorFlat` (stations with one id are one flat). A sor is
   * a closed basin its last water filled with silt and salt. Each station digs a flat-bottomed pan `dip` deep (its
   * bank over the outer SOR_BANK of the radius; overlapping stations take the deepest, not the sum), and inside the
   * stations every point under the flat's level is filled to it: one level, dead flat, `sorSinkM` (default 0.35 m)
   * under the lowest point of the flat's rim (the ground on the stations' outer edge), so the rim stands over the floor
   * all round and the shore is the contour where the dug ground meets the level. The micro relief stands down over
   * the stations and an apron round them. */
  sorFlat?: number;
  sorSinkM?: number;
  /** Round 61: the deck's clearance over the water surface (m, default 2.4), its width between the parapets (m,
   * default 12.4) and the approach length beyond each abutment over which the road plane grades to the deck (m;
   * by default the length a 7 % grade needs from the road plane past the abutment, 8–60 m). */
  deckClearM?: number;
  deckWidthM?: number;
  approachM?: number;
}

/**
 * Round 61 (2026-09-24): a bridge deck resolved from a marsh station authored `crossing: 'bridge'` — the level plane
 * the road crosses the water on. The kit (maps/mapKits.ts) builds the span, the abutments and the parapets from it and
 * publishes the collision record the ride stands on; the navigation grid (sim/botRoutePlanner.ts) reads the deck as dry
 * ground and the water beside it as liquid; the height field under the deck is the river bed.
 */
export interface BridgeDeckPlane {
  /** The deck centre (the road's nearest point to the station) and the road's unit bearing there. */
  x: number;
  z: number;
  ux: number;
  uz: number;
  /** Half the span along the road (the abutment faces) and half the deck width across it (the parapet line). */
  halfLength: number;
  halfWidth: number;
  /** The level deck plane, the river bed under it (the liquid plane at the centre) and the water surface over the bed. */
  deckY: number;
  bedY: number;
  waterY: number;
  /** The approach length beyond each abutment over which the road plane grades to the deck. */
  approachM: number;
  /** The road route the deck carries (the kit's ford posts skip it). */
  route: number;
}
/** Round 61: the abutment depth inside the span — the terrain climbs from the bed to the deck through it. */
const BRIDGE_ABUTMENT_M = 3;
const BRIDGE_DECK_CLEAR_M = 2.4;
const BRIDGE_DECK_WIDTH_M = 12.4;
/** An approach grades the road plane to the deck at no more than this rise per metre, within these lengths. */
const BRIDGE_APPROACH_GRADE = 0.07;
const BRIDGE_APPROACH_MIN_M = 8;
const BRIDGE_APPROACH_MAX_M = 60;
/** The road's own dry band is 18 m; nothing wider than that is graded or dried, so nothing wider is exempted. */
const BRIDGE_CORRIDOR_HALF_WIDTH_M = 18;
const EMPTY_BRIDGE_DECKS: readonly BridgeDeckPlane[] = [];

interface MarshConfig extends MarshSourceConfig {
  dip: number;
}

interface LakeConfig {
  x: number;
  z: number;
  r: number;
  depth?: number;
  level?: number;
  radii?: import('./shoreline.ts').ShorelineRadii;
  /** Round 40: the wet shelf's width in metres from the authored shoreline to the waterline (shoreline.ts). */
  shelfM?: number;
  /** Round 47 follow-up: the outer bank band in units of the local radius (≥ 0.96), replacing the fitted ≥ 1.32 band —
   * a big authored bay grades its bank over metres, not over a third of its radius (liquidMarshSurface.ts). */
  bankBand?: number;
  /** Round 47 follow-up: beached boats on this shore (mapKits.ts; default 3 on a ≥ 110 m disc, else 1). */
  boats?: number;
}

/** One terrace zone (TerrainSettings.terraces). */
export interface TerraceZoneConfig {
  /** The zone's outline (x, z), metres: the steps come in over `feather` m inside it. */
  polygon: readonly (readonly [number, number])[];
  feather?: number;
  /** A riser's height, metres (a bench every `stepM` of ground height). */
  stepM: number;
  /** The steepest a riser stands (rise per run, default 0.6): on steeper ground the risers take more of the slope. */
  riserGrade?: number;
  /** The ground grade (of the smooth relief) under which the steps fade out, and over which they are whole (defaults
   * 0.05 and 0.1): level ground keeps its own shape instead of breaking into islands at a bench's level. */
  minGrade?: number;
  fullGrade?: number;
}

/** A splat's two-formation bedrock (TerrainSplatConfig.formation). */
interface TerrainFormation {
  atFrac: number; wobbleM?: number; pale?: number; red?: number;
  /** The Redrock lane (2026-10-07): the boundary's absolute height (m) in place of atFrac's share of the height span. */
  atY?: number;
  /** Each formation's colour: a tint on the rock's own luminance (rgb) and how far the rock takes it (w, 0..1) — by
   * default the lower one paled by `pale` toward buff, the upper one reddened by `red`. */
  lowerTint?: readonly [number, number, number, number];
  upperTint?: readonly [number, number, number, number];
  /** The boundary's half-width (m; default 1.2). */
  edgeM?: number;
}

interface LandformConfig {
  kind: string;
  x: number;
  z: number;
  height: number;
  yawDeg?: number;
  length?: number;
  width?: number;
  rx?: number;
  rz?: number;
  r?: number;
  corridorScale?: number;
  settlementScale?: number;
  wetScale?: number;
  _c?: number;
  _s?: number;
  /** Final authored surface; original fields still define road/water/pad support initialization. */
  relief?: PlayableRelief;
  _relief?: PreparedPlayableRelief;
  /** Geological structure of a knoll, basin or ridge: outline, profile, gullies, strata, roughness
   * (landformGeology.ts). Without it a landform keeps its smooth shape exactly. */
  geology?: LandformGeology;
  /** The Redrock lane (2026-10-07, owner: "redrock is really rough"): landforms marked `union` stand as one rock — the
   * terrain takes the greatest of their heights at a point, not their sum (a massif and the lobe against its flank summed
   * into a horn where the lobe's cap met the massif's wall). Every other landform still adds; absent on every other map. */
  union?: boolean;
  /** Gorges only (map revival lane 2, 2026-10-05): the wall's foot and its top as fractions of the half-width — the
   * floor runs level out to the foot and the wall climbs from there to the rim (default [0.65, 1], the smooth trough);
   * a narrow band is a sheer wall. Absent = the trough exactly as before. */
  wall?: readonly [number, number];
  /** Gorges only: how far the walls step in from the authored line, in metres — buttresses and bays along the gorge
   * (a few incommensurate sines of the distance along it), the two walls together, never wider than authored, the
   * middle 30 m either side on the authored line. Absent = straight. */
  meander?: number;
}

interface DuneConfig {
  amp: number;
}

interface MesaConfig {
  amp: number;
  thr0: number;
  thr1: number;
  wallWidth?: number;
  tierWidth?: number;
  tierScale?: number;
  corridorFloor?: number;
}

interface TerrainSettings {
  /** Dry viaducts: deck and approaches share one support plane with collision/navigation. */
  bridges?: readonly { x: number; z: number; yawDeg: number; spanM: number; widthM: number; approachM: number; route: number }[];
  hillScale: number;
  microScale: number;
  rimH: number;
  /** Round 47 follow-up: metres from a bay's shoreline over which the border rim lift fades in (0 = rim beside water). */
  coastRimFadeM?: number;
  /** The map-borders lane (2026-10-03): the land around the square (borderLandform.ts) — overrides of the horizon
   * style's defaults. The rim inside the playable square may only be lowered by it. */
  border?: Partial<BorderLandformSettings>;
  village: VillageConfig;
  marshes: MarshSourceConfig[];
  lakes: LakeConfig[];
  frozenMarshes: boolean;
  dunes: DuneConfig | null;
  mesas: MesaConfig | null;
  /** The maps-and-layouts lane (2026-10-03): a map without a mesa field whose rock gate reads its authored rock
   * landforms instead (butte, inselberg and flow profiles: landformGeology.ts geologyRockWeight), so the gate stays
   * on and its dune slip faces stay sand. */
  landformRock?: boolean;
  landforms: LandformConfig[];
  roads: 'country' | AuthoredRoadConfig;
  softLakes?: boolean;
  clearMarshVeg?: boolean;
  hardstands?: readonly HardstandConfig[];
  /** Round 57 (2026-09-24): authored rail spurs — maps/mapKits.ts lays the track, the berth keeps vegetation and scattered props off it. */
  railSpurs?: readonly RailSpurConfig[];
  workedGround?: readonly WorkedGroundPatch[];
  /** Use authored activity footprints instead of blanket settlement wear; 'plots' lays the village's ground out in
   * garden plots running back from its streets (makeMaskTexture villagePlotWear). */
  villageWear?: 'activity-patches' | 'plots';
  /** The map-revival lane (2026-10-05, Orchard Valley's terraces): contour terraces stepped into the ground inside each
   * zone (applyTerraces) — level benches, risers `stepM` high and no steeper than `riserGrade` — before the roads and pads
   * are graded, so a road cuts its graded way through them. Absent: none, and every other map's field is unchanged. */
  terraces?: readonly TerraceZoneConfig[];
  quarryBenches?: boolean;
  /** Authored Redrock regional ground participates in initial road/pad seating. */
  redrockCanyon?: boolean;
  /** Runtime-only (assault-trenches world variant): carve the Frontline Assault trench system. */
  assaultTrenches?: boolean;
  /** Field trenches on every map (2026-09-17); a map opts out with false. */
  fieldTrenches?: boolean;
}

interface SplatConfig {
  sourcedPalette?: TerrainPaletteId;
  grassTone?: ToneFunction | null;
  dirtTone?: ToneFunction | null;
  rockTone?: ToneFunction | null;
  mudTone?: ToneFunction | null;
  mudRough?: number;
  /** Round 70 (2026-09-25): per-layer multiplier on the SOURCED photo albedo that renders — the tone laws above grade
   * the procedural fallback only (sourcedTextures TERRAIN_PLAN). Whiteout grades its inherited winter snow with it. */
  sourcedTint?: Partial<Record<'G' | 'D' | 'R' | 'M', ColorTriple>>;
  sandstone?: boolean;
  /** Ground lane (wave 62, Redrock: "smooth, plaster-like … identical wavy dark squiggles … a stamped pattern rather than
   * sandstone"): the sandstone tile's thin dark marker beds and the shaded parting at every bed boundary, 0..1 (default
   * 1). The tile repeats every 6.45 m up a wall, so its markers printed the same wavy lines on every face; a map whose
   * bedding the material draws at the wall's scale (strata: beds, joints, varnish) sets 0. */
  sandstoneMarkers?: number;
  /** Ground lane (2026-10-03, Redrock's inselbergs "like extruded clay"): a two-formation bedrock — the beds under the
   * boundary (at `atFrac` of the field's height span, wandering ±`wobbleM`) paler by `pale`, those above it redder by
   * `red` (Wadi Rum: the Umm Ishrin's red over the paler Disi). Absent = one formation. */
  formation?: TerrainFormation;
  iceLake?: boolean;
  seaLake?: boolean;
  /** Round 42: sky light on steep faces turned from the sun, as a fraction of the horizon sky colour (default 2.0). */
  wallSkyLift?: number;
  tintA?: ColorTriple;
  tintB?: ColorTriple;
  tintC?: ColorTriple;
  roadTint?: ColorTriple;
  /** Ground lane (wave 79): the dirt layer's tint where it is drawn as the land's soil — the worn ground, verges, tracks,
   * the turned fields — not as the strand (a coast's dirt layer doubles as its beach) nor on a dirt road (Dalmatia's
   * are white limestone gravel). */
  soilTint?: ColorTriple;
  /** Ground lane (wave 83): a turned field's tone over the darkened soil (default 1) — a loam's plough a mid brown
   * (Frontier 1.3), a chernozem's the near-black of its soil (1). */
  ploughLift?: number;
  marshGloss?: number;
  microAmp?: number;
  strata?: number;
  pavedRoads?: boolean;
  /** Maps lane B (2026-10-03, the gauntlet: Kestrel Airfield's apron "reads as a cobbled plaza"): the paved layer drawn
   * as airfield concrete — square slabs `slabM` across with sealed expansion joints (`jointM` half-width), a tone per
   * slab, oil stains (`stains`, 0..1) and rubber streaks along the x axis, the runway's (`tyres`, 0..1). */
  pavement?: { slabM: number; jointM?: number; stains?: number; tyres?: number };
  /** Map revival lane 2 (2026-10-05, Aegis Crossing's Ronda): the roads and hardstands inside the village rect take the
   * paved path (pavedRoads' setts, kerb line and gutter, `pavement` when authored) while the country roads past it stay
   * earth; the road mask also leaves the ground under a dry viaduct's deck unpainted. Absent = off. */
  townPaving?: boolean;
  /** Maps lane B (2026-10-03, the gauntlet: Tarkhan Steppe's pans "read as snow patches or grey mud"): the dry marsh
   * layer drawn as a sor's salt crust — white-grey salt with faint desiccation polygons (`crackM` across) over the
   * floor, the damp darker silt of its margin (`damp`, 0..1) outside the crust. */
  saltCrust?: { crackM?: number; damp?: number };
  roadTexMix?: number;
  townWear?: number;
  iceDrift?: number;
  seaFoam?: number;
  seaRamp?: readonly [number, number];
  /** Construction-only 3–10m earthy bank in existing mask A; water is unchanged. */
  shoreDirt?: boolean;
  midRelief?: number;
  /** Round 45: slope (1 − n.y) subtracted before the grass→rock thresholds — wet tropical hills keep turf on steeper ground (default 0). */
  slopeGrassHold?: number;
  /** Round 49: slope band (1 − n.y) over which a RING face past the square becomes landform rock on landform-gated
   * maps (default [0.22, 0.48] ≈ 39°–59°); Titan authors [0.15, 0.36] so its bedded walls start at ~34°. */
  ringRockSlope?: readonly [number, number];
  /** Ground lane (wave 65, Titan Gorge's e-wall-300: "soft mauve slabs with an identical yellow outline traced along
   * every ledge and crest"): past the square a ring face is rock by its slope alone, so every ledge and crest — where
   * the face flattens — turned the sand layer, a sand-yellow line along each. A landform-gated map whose ring rises in
   * bedded walls sets this: the ring's ground more than this many metres above the field's highest ground is caprock
   * (the rock layer on its ledges and tops, a little sand in its hollows), ramping in over 14 m. Absent = off. */
  ringCaprockM?: number;
  /** The Redrock lane (2026-10-07, owner: "redrock is really rough"; the inselbergs' level caps took the sand and read as
   * cakes with frosting): inside the square too, ground above this absolute height band [from, to] (m) is caprock — the
   * rock layer whatever its slope, a little sand in its hollows. Absent = off (every other map). */
  caprockY?: readonly [number, number];
  /** The Redrock lane (2026-10-07: a sheer face lit head-on went flat salmon): the joint blocks' tone step and the
   * varnish streaks' darkening on the bedded cliffs (default [0.26, 0.50]). */
  wallWeather?: readonly [number, number];
  /** The Redrock lane, round 9 (2026-10-08, the gauntlet's wave 261: the faces "smooth salmon plaster with painted
   * horizontal bands", "contour lines like a topographic map"; owner: the bedding as relief, not paint): Wadi Rum's jebel
   * faces — [flutes, tafoni, varnish], each 0..1. With it the painted beds, partings and far ledge ladder drop to under a
   * third, the caprock is bare rock whatever its hollows, and the face carries vertical flutes of three widths in its
   * normal, honeycomb pits low on the near faces and desert-varnish streaks of every width down it. Absent = off. */
  jebelFace?: readonly [number, number, number];
  /** Ground lane (2026-10-05, mr2's Glacier round 2: "the col's steep and convex ground stays white"): on a snow map the
   * snow lies on the rock layer up to this slope (degrees), fading out by snowRockFadeDeg, and a crest (the fold
   * attribute's −1) loses it snowRockCrest of slope (1 − n.y) sooner, a hollow keeps it as much longer. Absent = today's
   * law (45.6°, 63.9°, 0.12) in today's exact shader text: the fields swap the numbers into the source only when set. */
  snowRockSlopeDeg?: number;
  snowRockFadeDeg?: number;
  snowRockCrest?: number;
  /** Ground lane (2026-10-05, Longleaf's wave: "a mirror-like specular streak baked into the centre of every dirt road"):
   * the share of the water standing in a vegetated map's ruts and the mud ringing it (default 1; a dry month's roads 0). */
  roadPuddles?: number;
  fieldPatch?: number;
  sandMacro?: number;
  iceSky?: ColorTriple;
  midReliefFar?: number;
  rippleDir?: readonly [number, number];
  rippleAmp?: number;
  /** The Redrock lane (round 10, the gauntlet's wave 270: "a featureless sand plane with no ripples"): the near ripple
   * trains' own strength (the 0.38 m crests to ~45 m and the 11 m megaripples), apart from the dune bedforms rippleAmp
   * also sets. Absent = rippleAmp's (every other map, unchanged). */
  rippleNear?: number;
  /** The Redrock lane (round 10: the roads "a soft, low-resolution smear with no ruts, stones or eroded edges"): [the wheel
   * lanes' relief gain, their darkening, gravel strewn on the carriageway]. Absent = [1, 0, 0] (unchanged). */
  roadRuts?: readonly [number, number, number];
  /** Mixed grassy coasts: sand relief follows the existing beach blend only. */
  rippleShoreOnly?: boolean;
  /** Noise-driven dirt blend only; authored road/town/shore coverage is separate. */
  wornDirtStrength?: number;
  /** Scale of the bare-dirt road shoulder (1 = full). Snow passes keep their verges white with a low value. */
  shoulderDirt?: number;
  /** Roads lane (2026-10-09): the worked carriageway's gains over the map's climate row (RoadSurfaceWork). */
  roadSurface?: Partial<RoadSurfaceWork>;
  /** Roads lane R1c (2026-10-09): the paved surfaces in place of the R layer's print (PavedSurfaceConfig); the roads take
   * the paved path whole (uRoadTex 1) where it is set. */
  pavedSurface?: PavedSurfaceConfig;
}

export interface TerrainMapConfig extends HorizonMapConfig {
  /** Runtime-only (assault-trenches world variant): carve the Frontline Assault trench system. */
  assaultTrenches?: boolean;
  /** Field trenches on every map (2026-09-17); a map opts out with false. */
  fieldTrenches?: boolean;
  /** Opt-in bot route preference. Omission preserves existing wading semantics. */
  navigationWaterPolicy?: NavigationWaterPolicy;
  terrain?: Partial<TerrainSettings>;
  spawns?: SpawnConfig;
  splat?: SplatConfig;
  /** Round 66: the authored sea state of the map's water (oceanSpectrum.ts); omitted fields default per water kind. */
  ocean?: OceanConfig;
  /** Round 71: the authored cloudscape of the volumetric layer (engine/cloudscapes.ts); omitted knobs default per regime. */
  clouds?: CloudscapeConfig;
}

export interface TerrainLayout {
  village: VillageConfig;
  marshes: MarshConfig[];
  lakes: LakeConfig[];
  spawns: SpawnConfig;
  roads: RoadLine[];
  /** 2026-10-05: each road line's style (terrain.roads.pathStyles), aligned with `roads`; absent when no path is styled. */
  roadStyles?: readonly (RoadPathStyle | null)[];
  roadStations?: (RoadStationOrigin | null)[];
  /** Round 57: the authored rail spurs, carried to the dressing kit like the lake discs; absent when the map lays none. */
  railSpurs?: readonly RailSpurConfig[];
  terrain: TerrainSettings;
}

export interface TerrainWarmPoint {
  x: number;
  z: number;
  radiusM?: number;
}

/** The map-borders lane: the road exits on a built ring (terrain.ts roadExitOnRing) — the carriageway attribute there and
 * the exit lines cut at their ends. */
interface RoadExitsOnRing {
  at(x: number, z: number, out: [number, number]): [number, number];
  lines: readonly { xs: ArrayLike<number>; zs: ArrayLike<number>; length: number }[];
}

export interface HeightField {
  readonly navigationWaterPolicy?: NavigationWaterPolicy;
  getHeightAt(x: number, z: number): number;
  /** Round 36: the map's own macro relief evaluated PAST the playable square (hill noise, dunes, mesas, landforms,
   * the rim lift) with no roads, corridors, villages, lakes, pads or micro-relief — the horizon ring seats its near
   * rows on it so the geology continues across the border instead of switching to the authored ring relief. */
  getOutlandHeightAt?(x: number, z: number): number;
  /** Round 63: 0..1 — where the horizon ring's near rows must seat on the outland itself (a railway cutting's mouth:
   * the rim's interior gradient would carry the notch's faces across it); absent on a map without cuttings. */
  getOutlandSeatWeightAt?(x: number, z: number): number;
  /** The map-borders lane: the near ring's share of the continued ground (1) against the authored ranges (0). */
  getBorderHandOverAt?(x: number, z: number): number;
  /** The map-borders lane: the border's woods (0 open … 1 wooded) — the ring forest and the rim trees past 470 m stand by it. */
  getBorderWoodsAt?(x: number, z: number): number;
  /** The map-borders lane: the border's hedgerows (0 … 1 on a field boundary's tree line past the edge). */
  getBorderHedgeAt?(x: number, z: number): number;
  /** The map-borders lane: the crop of the field past the edge, premultiplied by its weight (the ring's borderTint). */
  _borderParcelAt?(x: number, z: number, out: [number, number, number, number]): [number, number, number, number];
  /** The map-borders lane: the hedged stretches of the field boundaries past the edge (borderHedgerows.ts). */
  _borderHedgeLines?(maxOut: number, keep?: (x: number, z: number) => boolean): { xs: number[]; zs: number[]; w: number[] }[];
  /** The map-borders lane: the farmsteads past the edge (borderFarmsteads.ts), built with the ring. */
  _borderFarmsteads?: { count: number; style: FarmsteadStyle; fieldAngle: number; buildings?: boolean };
  /** The map-borders lane: the farm tracks past the edge (the ring's borderTrack attribute, borderLandform.ts trackAt). */
  _borderTrackAt?(x: number, z: number, out: [number, number, number, number]): [number, number, number, number];
  getHeightAtFast(x: number, z: number): number;
  /** Near-mesh triangle surface shared by movement and visible suspension. */
  getContactHeightAt?(x: number, z: number): number;
  /** That triangle's unit normal into `out` (terrainContactSurface.ts normalAt): the slope the player sees. */
  getContactNormalAt?<T extends { x: number; y: number; z: number }>(x: number, z: number, out: T): T;
  warmFastTilesAround(points: readonly TerrainWarmPoint[]): Generator<number, void, void>;
  getNormalAt(x: number, z: number): THREE.Vector3;
  getGroundType(x: number, z: number): GroundType;
  /** Driving traction at the visible waterline; construction keeps its wider ground exclusions. */
  getDriveGroundType?(x: number, z: number): GroundType;
  getWaterMaskAt(x: number, z: number): number;
  /** Authored shallow depth used to build the sheet. Zero on ice/dry ground. */
  getWaterDepthAt?(x: number, z: number): number;
  /** Exact rendered triangle height, installed when the liquid mesh is built. */
  getWaterSurfaceHeightAt?(x: number, z: number): number;
  /** Round 47 (2026-09-23): the map's bay contours evaluated anywhere, the square included — wetness 0..1 and the bay's
   * water level — so the horizon ring, the terrain material and the sheet apron continue the coast past the red line. */
  getOutlandWaterAt?(x: number, z: number): { wetness: number; level: number } | null;
  /** Water pass 8: one splash into the reactive field (shell impacts); absent without the field. */
  addWaterImpulse?(x: number, z: number, radiusM: number, amplitudeM: number, foam?: number): void;
  /** Water pass 8: true when the reactive field carries the wakes (the FX layer then skips its ring prints). */
  waterRipplesActive?(): boolean;
  /** Presentation-only; simulation/headless fields may omit this query. */
  getTrackSurfaceAt?(x: number, z: number): TrackSurface;
  /** Round 61 (2026-09-24): the bridge decks resolved from the stations authored `crossing: 'bridge'` (empty on every
   * other map) — the kit, the navigation grid and the FX read the same planes the height field is exempted under. */
  bridgeDecks?: readonly BridgeDeckPlane[];
  size: number;
  minY: number;
  maxY: number;
  _roadDist(x: number, z: number): number;
  _villageMask(x: number, z: number): number;
  _noVeg(x: number, z: number): boolean;
  /** Round 67: the seeding weight of a railway cutting's batter face (railSpurs.ts railCuttingFaceSeedAt) — grass
   * and scrub take the upper part of a face where it is positive, thinned by railCuttingSeedAdmits, and relax their
   * slope gates to it; absent on a map without cuttings, so every other map's seeding is what it was. */
  _batterSeedAt?(x: number, z: number): number;
  /** Round 73 (2026-09-25): the baked fold term of the terrain build (−1 crest .. +1 hollow, the 8 m / 24 m Laplacian
   * of the relief the chunk vertices carry) — the tall-grass tier thickens and lifts the sward in the hollows. */
  _foldAt?(x: number, z: number): number;
  /** Ground lane (2026-10-03): the field the terrain material draws at (x, z) (landUse.ts) — absent on a map without
   * fields; the tiers that grow on the ground (tall grass, tufts) stand as its crop. */
  _landUseAt?(x: number, z: number, out: LandFieldSample): LandFieldSample;
  /** Ground lane (2026-10-03): the canopy's cover (0..1) once the vegetation is placed (terrain applyWoodsMask). */
  _woodsAt?(x: number, z: number): number;
  /** Ground lane (2026-10-08): a cinder yard's weed clumps (groundRedux.ts cinderYardWeedsAt, 0..1) — present only on a
   * map whose ground profile floors its village in cinder; the tall grass and the tufts keep to them inside the yard. */
  _yardWeedsAt?(x: number, z: number): number;
  /** The maps-and-layouts lane (2026-10-03): the authored landforms' geological zones at (x, z), each 0..1 —
   * [lava flow, cinder cone, talus fan] (landformGeology.ts geologyZoneWeights); absent on a map without them. */
  _geologyZoneAt?(x: number, z: number, out: GeologyZones): GeologyZones;
  /** Ground lane (2026-10-08, wave 274): the sward follows its ground (groundRedux.ts swardSlope) — the map's sun in world
   * xz (unit) and the law's strength; present only on a map whose profile has it. */
  _swardSlope?: readonly [number, number, number];
  /** The map-borders lane (2026-10-03): the ring's carriageway attribute — [signed offset from a road exit line (m), presence]. */
  _roadExitAt?(x: number, z: number, out: [number, number]): [number, number];
  /** The map-borders lane: the roads that leave the square, as their exit lines past the edge (40 m steps, ~720 m). */
  _roadExitLines?(): readonly { xs: ArrayLike<number>; zs: ArrayLike<number>; length: number }[];
  /** The map-borders lane: the exits as they lie on a built ring (its vertices) — each ending at the foot of the ranges
   * unless they open a pass for it (terrain.ts roadExitOnRing). */
  _roadExitOnRing?(ring: { positions: ArrayLike<number>; heights: ArrayLike<number> }): RoadExitsOnRing;
  /** The map-borders lane: a railway's open line past the edge on the ring — [signed offset (m), presence], faded where
   * the ring's own height there (`surfaceY`) leaves the line's bed. */
  _railExitAt?(x: number, z: number, out: [number, number], surfaceY?: number): [number, number];
  _layout: TerrainLayout;
  /** Frontline Assault trench plan carved into this field (assault-trenches variant), else null. */
  assaultTrenchLines?: AssaultTrenchPlan | null;
  /** Field trenches carved into every standard field (2026-09-17), null when none fit or the map opts out. */
  fieldTrenchLines?: AssaultTrenchPlan | null;
  _mesaW: ((x: number, z: number) => number) | null;
  _waterWetnessAt?: (x: number, z: number) => number;
  /** Maps lane B (2026-10-03): the sors' crust / damp-margin wetness for the splat mask (maps with sor stations). */
  _sorWetnessAt?: (x: number, z: number) => number;
  /** Construction-only seed admission; never used for gameplay or seating. */
  _createRoadPlacementSampler?: () => Generator<number, TerrainPlacementSampler, void>;
}

export type TerrainPlacementSampler = Pick<HeightField,
  'getHeightAt' | 'getNormalAt' | 'getGroundType' | '_roadDist'>;

interface TerrainEngineContext {
  anisotropy?: number;
  /** Water pass 8: the reactive water field renders its own pass; receipts and the mobile tier build without it. */
  renderer?: THREE.WebGLRenderer;
  setupShadowMaterial(material: THREE.MeshStandardMaterial, hook: MaterialShaderHook): void;
}

interface TerrainTextureLayer {
  albedo: THREE.Texture;
  normal: THREE.Texture;
}

interface SandstoneBed {
  y0: number;
  y1: number;
  marker: boolean;
  tone: number;
  hueJ: number;
  hard: number;
}

interface SplatNoiseSample {
  n1: number;
  n2: number;
  mA: number;
}

interface SplatFields {
  a: Float32Array;
  b: Float32Array;
}

interface FineGrid {
  hgrid: Float64Array;
  pn: number;
  stepF: number;
}

interface TerrainIndexRecord {
  attribute: THREE.BufferAttribute;
  references: number;
}

type TerrainIndexPool = Map<number, TerrainIndexRecord>;
type TerrainSourceCheckpoint = () => Promise<void>;
type TerrainBuildProgress = readonly [number, number, boolean, TerrainSourceCheckpoint?];
type TerrainBuildTick = (completed: number, total: number) => Promise<void> | void;

interface TerrainProgressState {
  done: number;
  total: number;
}

interface TerrainChunk {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  lods: Array<THREE.BufferGeometry | null>;
  fine: FineGrid | null;
  level: TerrainLodLevel;
  cx: number;
  cz: number;
  cx0: number;
  cz0: number;
}

interface TerrainStreamOptions {
  streamFarLods?: boolean;
  focus?: SpawnPoint;
}

interface TerrainStreamingStats {
  enabled: boolean;
  totalGeometryCount: number;
  initialGeometryCount: number;
  initialFineGridCount: number;
  streamedGeometryCount: number;
  indexPool?: ReturnType<typeof terrainIndexPoolReceipt>;
}

function require2DContext(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', options);
  if (!context) throw new Error('Terrain texture canvas requires a 2D context');
  return context;
}

export function mulberry32(a: number): () => number {return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const HALF = 512;
const MAP_SIZE = 1024;

/** A prepared terrace zone: its outline, bounds and defaults (TerraceZoneConfig). */
interface TerraceZone {
  xs: Float64Array; zs: Float64Array;
  minX: number; maxX: number; minZ: number; maxZ: number;
  feather: number; stepM: number; riserGrade: number; minGrade: number; fullGrade: number;
}
interface TerraceZoneHit { zone: TerraceZone; weight: number }

function prepareTerraceZones(zones: readonly TerraceZoneConfig[] | undefined): TerraceZone[] {
  return (zones ?? []).filter((z) => z.polygon.length >= 3 && z.stepM > 0).map((z) => {
    const xs = Float64Array.from(z.polygon.map((p) => p[0])), zs = Float64Array.from(z.polygon.map((p) => p[1]));
    return {
      xs, zs, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs),
      feather: Math.max(1, z.feather ?? 24), stepM: z.stepM, riserGrade: z.riserGrade ?? 0.6,
      minGrade: z.minGrade ?? 0.05, fullGrade: Math.max((z.minGrade ?? 0.05) + 0.01, z.fullGrade ?? 0.1),
    };
  });
}

/** The material's terrace uniforms (T2): each zone's bounding rect (up to four) and the riser band — a face whose slope
 * (1 − n.y) passes 0.035 → 0.09 (a grade of ~0.27 → ~0.44: a riser, smoothed or not by the far mesh; the benches lie under
 * it) takes the rock layer. Count 0 without terraces: the shader's branch stays dark. */
function terrainTerraceUniforms(zones: readonly TerraceZoneConfig[] | undefined): { uTerraceRect: { value: THREE.Vector4[] }; uTerraceParam: { value: THREE.Vector4 } } {
  const rects = Array.from({ length: 4 }, () => new THREE.Vector4());
  const prepared = prepareTerraceZones(zones).slice(0, 4);
  prepared.forEach((zone, i) => rects[i].set(zone.minX, zone.minZ, zone.maxX, zone.maxZ));
  const feather = prepared.reduce((m, zone) => Math.max(m, zone.feather), 1);
  return { uTerraceRect: { value: rects }, uTerraceParam: { value: new THREE.Vector4(prepared.length, feather, 0.035, 0.09) } };
}

/** The strongest terrace zone over (x, z) and its weight — 1 deeper than `feather` inside the outline, easing to 0 at it. */
function terraceZoneWeight(zones: readonly TerraceZone[], x: number, z: number): TerraceZoneHit | null {
  let best: TerraceZoneHit | null = null;
  for (const zone of zones) {
    if (x < zone.minX || x > zone.maxX || z < zone.minZ || z > zone.maxZ) continue;
    const { xs, zs } = zone, n = xs.length;
    let inside = false, d2 = Infinity;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = xs[i], zi = zs[i], xj = xs[j], zj = zs[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      const ex = xj - xi, ez = zj - zi, len2 = ex * ex + ez * ez;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - xi) * ex + (z - zi) * ez) / len2)) : 0;
      const dx = x - xi - ex * t, dz = z - zi - ez * t;
      d2 = Math.min(d2, dx * dx + dz * dz);
    }
    if (!inside) continue;
    const weight = smoothstep(0, zone.feather, Math.sqrt(d2));
    if (!best || weight > best.weight) best = { zone, weight };
  }
  return best && best.weight > 0 ? best : null;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function clamp(x: number, a: number, b: number): number { return x < a ? a : x > b ? b : x; }

function sampleHeightGridCell(arr: ArrayLike<number>, stride: number, i: number, fx: number, fz: number): number {
  const a = arr[i] + (arr[i + 1] - arr[i]) * fx;
  const b = arr[i + stride] + (arr[i + stride + 1] - arr[i + stride]) * fx;
  return a + (b - a) * fz;
}

// Road support is sampled once per query, including pre-road construction
// where an inward cutting needs distance but the pavement is not enabled.
function sampleRoadSupportDistance(roadsOn: boolean, bounded: boolean,
  grid: ArrayLike<number>, stride: number, index: number, fx: number, fz: number): number {
  return roadsOn || bounded ? sampleHeightGridCell(grid, stride, index, fx, fz) : Infinity;
}

function roadCorridorDistanceWeight(bounded: boolean, corridorWeight: number, distance: number): number {
  return bounded && corridorWeight > 0 ? 1 - smoothstep(18, 64, distance) : 1;
}

function roadRimWeight(start: number | null, roadsOn: boolean, bounded: boolean,
  corridorWeight: number, distanceWeight: number): number {
  // Final inward queries grade the road plane once below. Pre-road node
  // authoring instead opens the rim here before any road elevations exist.
  return start === null || (roadsOn && bounded) ? 1 : 1 - corridorWeight * distanceWeight;
}

function roadShoulderWeight(start: number | null, mapId: string | undefined, roadsOn: boolean,
  radius: number, corridorWeight: number, distanceWeight: number): number {
  if (start === null || corridorWeight <= 0) return 0;
  const admission = smoothstep(start, start + 32, radius);
  // These steep exit banks intersect recovery gradients with the same zero set.
  // This is C0, not a global C1 or arbitrary terrain-slope guarantee.
  const intersect = mapId === 'alpine' || mapId === 'blackglass'
    || mapId === 'titan_gorge' || mapId === 'skybridge' || mapId === 'badlands';
  return intersect && roadsOn ? Math.min(admission, corridorWeight, distanceWeight)
    : admission * corridorWeight * distanceWeight;
}

// ---------------------------------------------------------------------------
// Map layout — seed-independent composition (roads, village, spawns, marshes,
// lakes, drivable corridors), built from a map config (src/world/maps/*).
// Shared by the other world modules via heightField._layout.
// ---------------------------------------------------------------------------

function buildCountryRoads(): RoadLine[] {
  const roadA: RoadLine = []; // roughly N-S, curving through the village
  for (let z = -HALF; z <= HALF; z += 32) {
    roadA.push([10 + 26 * Math.sin(z * 0.0062) + 8 * Math.sin(z * 0.017 + 2.1), z]);
  }
  const roadB: RoadLine = []; // roughly E-W
  for (let x = -HALF; x <= HALF; x += 32) {
    roadB.push([x, 46 + 34 * Math.sin(x * 0.0043 + 1.0) + 7 * Math.sin(x * 0.013 - 0.6)]);
  }
  return [roadA, roadB];
}

// straight-ish grid streets (urban): N-S lines at xs[], E-W lines at zs[].
// maps r1 (ADDITIVE): an entry may be an OBJECT {at, lo?, hi?} clipping the
// line's along-axis extent (coastal roads must END at the shore, not pave
// across the bay). Plain numbers keep the classic full-map span.
function buildGridRoads(grid: GridRoadConfig, originalCounts: number[], completeRoads = true): RoadLine[] {
  const roads: RoadLine[] = [];
  const jit = grid.jitter ?? 2.5;
  const parse = (e: number | RoadBound): Required<RoadBound> => (typeof e === 'number'
    ? { at: e, lo: -HALF, hi: HALF }
    : { at: e.at, lo: e.lo ?? -HALF, hi: e.hi ?? HALF });
  for (let gi = 0; gi < grid.xs.length; gi++) {
    const { at: gx, lo, hi } = parse(grid.xs[gi]);
    const line: RoadLine = [];
    for (let z = lo; z <= hi; z += 32) {
      line.push([gx + Math.sin(z * 0.011 + gi * 2.3) * jit, z]);
    }
    originalCounts.push(line.length);
    if (completeRoads && line.length && line[line.length - 1][1] < hi) {
      line.push([gx + Math.sin(hi * 0.011 + gi * 2.3) * jit, hi]);
    }
    roads.push(line);
  }
  for (let gi = 0; gi < grid.zs.length; gi++) {
    const { at: gz, lo, hi } = parse(grid.zs[gi]);
    const line: RoadLine = [];
    for (let x = lo; x <= hi; x += 32) {
      line.push([x, gz + Math.sin(x * 0.011 + gi * 1.7) * jit]);
    }
    originalCounts.push(line.length);
    if (completeRoads && line.length && line[line.length - 1][0] < hi) {
      line.push([hi, gz + Math.sin(hi * 0.011 + gi * 1.7) * jit]);
    }
    roads.push(line);
  }
  return roads;
}

// Authored route networks for maps whose identity depends on something more
// legible than the shared country cross or an infinite street grid. Designers
// provide a few control points; this resamples them to the same ~32 m spacing
// as the legacy roads so road-distance queries and prop placement keep their
// established cost/behavior.
function buildPathRoads(paths: AuthoredRoadConfig['paths']): RoadLine[] {
  const roads: RoadLine[] = [];
  for (const path of paths || []) {
    if (!Array.isArray(path) || path.length < 2) continue;
    const line: RoadLine = [];
    for (let pi = 0; pi < path.length - 1; pi++) {
      const [ax, az] = path[pi], [bx, bz] = path[pi + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 32));
      for (let step = 0; step < steps; step++) {
        const t = step / steps;
        line.push([ax + (bx - ax) * t, az + (bz - az) * t]);
      }
    }
    const last = path[path.length - 1];
    line.push([last[0], last[1]]);
    roads.push(line);
  }
  return roads;
}

// The map-borders lane (2026-10-03): the line a road that reaches the playable edge takes on past it — the road's own
// heading at the edge, walked out in 40 m steps that wander a few degrees (never turning back toward the square) for
// ~720 m. Geometry only (the border landform opens a valley along it; the height field grades it later). Pure and
// deterministic per seed; two roads meeting at one portal leave as one.
interface RoadExitLine { xs: Float64Array; zs: Float64Array; ss: Float64Array; route: number; minX: number; maxX: number; minZ: number; maxZ: number }
const ROAD_EXIT_STEP_M = 40, ROAD_EXIT_STEPS = 18;
function buildRoadExitLines(roads: readonly RoadLine[], seed: number): RoadExitLine[] {
  const exitNoise = new SimplexNoise({ random: mulberry32((seed ^ 0x2E21D5) >>> 0) });
  const lines: RoadExitLine[] = [], seen: number[][] = [];
  for (let r = 0; r < roads.length; r++) {
    const nodes = roads[r];
    if (nodes.length < 2) continue;
    for (const end of [0, nodes.length - 1]) {
      const [ex, ez] = nodes[end];
      if (Math.max(Math.abs(ex), Math.abs(ez)) < HALF - 24) continue;
      const back = nodes[end === 0 ? Math.min(nodes.length - 1, 2) : Math.max(0, nodes.length - 3)];
      let dx = ex - back[0], dz = ez - back[1];
      const len = Math.hypot(dx, dz);
      if (len < 1) continue;
      dx /= len; dz /= len;
      const major = Math.abs(ex) >= Math.abs(ez);
      const nx = major ? Math.sign(ex) : 0, nz = major ? 0 : Math.sign(ez);
      if (dx * nx + dz * nz < 0.35) continue; // a road along the edge is not leaving the square
      if (seen.some(([sx, sz]) => Math.hypot(sx - ex, sz - ez) < 30)) continue;
      seen.push([ex, ez]);
      const xs = new Float64Array(ROAD_EXIT_STEPS + 1), zs = new Float64Array(ROAD_EXIT_STEPS + 1), ss = new Float64Array(ROAD_EXIT_STEPS + 1);
      xs[0] = ex; zs[0] = ez;
      let heading = Math.atan2(dz, dx);
      const outward = Math.atan2(nz, nx);
      for (let i = 1; i <= ROAD_EXIT_STEPS; i++) {
        heading += exitNoise.noise(i * 0.43 + r * 3.1, end * 7.7 + 0.5) * 0.16;
        heading = outward + clamp(Math.atan2(Math.sin(heading - outward), Math.cos(heading - outward)), -0.95, 0.95);
        xs[i] = xs[i - 1] + Math.cos(heading) * ROAD_EXIT_STEP_M;
        zs[i] = zs[i - 1] + Math.sin(heading) * ROAD_EXIT_STEP_M;
        ss[i] = ss[i - 1] + ROAD_EXIT_STEP_M;
      }
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i <= ROAD_EXIT_STEPS; i++) {
        minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i]); minZ = Math.min(minZ, zs[i]); maxZ = Math.max(maxZ, zs[i]);
      }
      lines.push({ xs, zs, ss, route: r, minX, maxX, minZ, maxZ });
    }
  }
  return lines;
}

const DEFAULT_TERRAIN: TerrainSettings = {
  hillScale: 1.0,
  microScale: 1.0,
  rimH: 24, // tall enough that the rim crest hides the fogged outer floor
  village: { x0: -60, x1: 80, z0: -40, z1: 120, cx: 10, cz: 40, feather: 42, flatten: 0.85 },
  marshes: [
    { x: 220, z: -140, r: 38 },
    { x: -190, z: -210, r: 48 },
    { x: -330, z: 330, r: 30 },
  ],
  lakes: [],           // [{x,z,r,depth}] — flattened frozen/ice sheets
  frozenMarshes: false, // marsh/lake ground reads 'hard' (ice) instead of 'soft'
  dunes: null,          // {amp} — long ridged sand dunes
  mesas: null,          // {amp, thr0, thr1} — flat-topped plateaus
  // Broad authored tactical forms. These are analytical (no meshes or draw
  // calls) and are shared by the rendered and headless height fields.
  // ridge: {kind:'ridge',x,z,length,width,height,yawDeg}; knoll/basin use
  // {rx,rz,height,yawDeg}. Negative height creates a basin.
  landforms: [],
  roads: 'country',     // 'country' | {grid?,paths?}; both may be combined
};

const DEFAULT_SPAWNS: SpawnConfig = {
  player: { x: 14, z: -78 },
  enemies: [
    { x: -30, z: 320 }, { x: 140, z: 350 }, { x: 265, z: 235 }, { x: -215, z: 270 },
    { x: -330, z: 140 }, { x: 330, z: 130 }, { x: 15, z: 430 },
  ],
};

/**
 * Build the seed-independent layout object for a map config.
 * @param {?object} cfg map config (src/world/maps/*) or null for defaults
 * @returns {{village:object,marshes:Array,lakes:Array,spawns:object,roads:Array}}
 */
export function createLayout(cfg: TerrainMapConfig | null = null, completeRoads = true): TerrainLayout {
  const t: TerrainSettings = { ...DEFAULT_TERRAIN, ...(cfg?.terrain ?? {}) };
  t.landforms = (t.landforms || []).map((form) => {
    const yaw = THREE.MathUtils.degToRad(form.yawDeg || 0);
    if (form.relief) return { ...form, _c: Math.cos(yaw), _s: Math.sin(yaw), _relief: preparePlayableRelief(form.relief) };
    return { ...form, _c: Math.cos(yaw), _s: Math.sin(yaw) };
  });
  const village = { ...DEFAULT_TERRAIN.village, ...(t.village || {}) };
  const spawnsSrc = (cfg && cfg.spawns) || DEFAULT_SPAWNS;
  const player = { ...spawnsSrc.player };
  const enemies = spawnsSrc.enemies.map((e) => ({ ...e }));
  // Deployment orientation is tactical, not decorative: both spawn zones
  // face the opposing zone. The former "face the village" rule pointed some
  // far-side arcs away from their opponents (and network authority then
  // inverted that yaw a second time). Allies inherit the player yaw; each
  // enemy pad faces the player-team centroid directly.
  let enemyCx = 0, enemyCz = 0;
  for (const enemy of enemies) { enemyCx += enemy.x; enemyCz += enemy.z; }
  enemyCx /= enemies.length || 1;
  enemyCz /= enemies.length || 1;
  player.yaw = Math.atan2(enemyCx - player.x, enemyCz - player.z);
  for (const enemy of enemies) {
    enemy.yaw = Math.atan2(player.x - enemy.x, player.z - enemy.z);
  }
  let roads: RoadLine[];
  let roadStyles: (RoadPathStyle | null)[] | null = null;
  const originalCounts: number[] = [];
  if (t.roads === 'country' || !t.roads) {
    roads = buildCountryRoads();
  } else {
    roads = [];
    if (t.roads.grid) roads.push(...buildGridRoads(t.roads.grid, originalCounts, completeRoads));
    const gridCount = roads.length;
    if (t.roads.paths) roads.push(...buildPathRoads(t.roads.paths));
    // (buildPathRoads keeps every path of two or more points, in order: a style follows its path)
    // (roads lane, 2026-10-09: a path the catalogue surfaces — roadSurfaces.ts MAP_PATH_SURFACES, by the map's year — is
    // styled with that surface where the map's own pathStyles leave it unstyled)
    const catalogue = (cfg?.id && MAP_PATH_SURFACES[cfg.id]) || null;
    if (t.roads.paths && (t.roads.pathStyles?.some((st) => !!st) || catalogue?.some((sf) => !!sf))) {
      roadStyles = new Array<RoadPathStyle | null>(gridCount).fill(null);
      t.roads.paths.forEach((path, i) => {
        if (!Array.isArray(path) || path.length < 2) return;
        const own = t.roads !== 'country' ? t.roads?.pathStyles?.[i] ?? null : null;
        const surface = catalogue?.[i] ?? null;
        roadStyles!.push(own ?? (surface ? { surface, catalogue: true } : null));
      });
    }
  }
  if (roads.length === 0) roads = buildCountryRoads();
  const completed = completeRoads ? completeRoadEndpoints(cfg?.id, roads) : roads;
  const roadStations = buildPhysicalRoadStationOrigins(cfg?.id, roads, completed,
    buildRoadStationOrigins(roads, completed, originalCounts));
  return {
    village,
    // maps r1 (ADDITIVE): per-marsh carve depth `dip` (m). Default 2.6 = the
    // classic soggy bowl every pre-existing map bakes; river maps author
    // shallow fordable channels by chaining small-dip marshes along a curve.
    marshes: (t.marshes || []).map((m) => Object.assign({ dip: 2.6 }, m) as MarshConfig),
    lakes: (t.lakes || []).map((l) => ({ ...l })),
    spawns: { player, enemies },
    roads: completed,
    ...(roadStyles && roadStyles.length === completed.length ? { roadStyles } : {}),
    ...(roadStations ? { roadStations } : {}),
    // Round 57 (2026-09-24): authored rail spurs ride the layout to the dressing kit; no key on a map without one.
    ...(t.railSpurs?.length ? { railSpurs: t.railSpurs } : {}),
    terrain: t,
  };
}

// Only the selected construction path temporarily keeps the original lines.
// Reuse the lines already authored above, including trimmed smoothing neighbors;
// they never become an extra retained layout field or a second road grid.
function completeInheritedRoadLayout(layout: TerrainLayout, mapId: string | undefined): RoadLine[] | null {
  if (!usesInheritedRoadGrades(mapId)) return null;
  const original = layout.roads, completed = completeRoadEndpoints(mapId, original);
  if (completed === original) return null; // historical no-completion control
  layout.roads = completed;
  const stations = buildRoadStationOrigins(original, completed);
  if (stations) layout.roadStations = stations;
  return original;
}

// squared point-to-segment distance, returning t of the projection
function segDist(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { d: number; t: number } {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  const ex = ax + dx * t - px, ez = az + dz * t - pz;
  return { d: Math.sqrt(ex * ex + ez * ez), t };
}

/** Pure analytical height contribution for an authored tactical landform. */
export function sampleLandformHeight(form: LandformConfig, x: number, z: number,
  phase: 'legacy-support' | 'authored-relief' = 'authored-relief'): number {
  if (phase === 'authored-relief' && form._relief) return (form.height || 0) * samplePlayableRelief(form._relief, x, z);
  const dx = x - form.x, dz = z - form.z;
  const c = form._c ?? Math.cos(THREE.MathUtils.degToRad(form.yawDeg || 0));
  const s = form._s ?? Math.sin(THREE.MathUtils.degToRad(form.yawDeg || 0));
  const lx = dx * c + dz * s;
  const lz = -dx * s + dz * c;
  const height = form.height || 0;
  if (form.kind === 'gorge') {
    const along = 1 - smoothstep((form.length || 700) * .36, (form.length || 700) * .5, Math.abs(lx));
    if (!form.wall && !form.meander) {
      const across = 1 - smoothstep((form.width || 90) * .65, form.width || 90, Math.abs(lz));
      return height * along * across;
    }
    const w = form.width || 90, foot = form.wall ? form.wall[0] : .65, top = form.wall ? form.wall[1] : 1;
    // the walls step in together in buttresses and bays (a mirror-symmetric layout stays symmetric; never wider than
    // authored, so whatever stands back from the rim stays back); the middle holds the authored line (a crossing there
    // keeps its abutments), the steps growing over 30 m either side
    const wave = 0.55 * Math.sin(lx / 41 + 0.7) + 0.3 * Math.sin(lx / 17.3 + 2.3) + 0.15 * Math.sin(lx / 7.9 + 4.1);
    const wander = -(form.meander || 0) * smoothstep(0, 30, Math.abs(lx)) * (0.5 + 0.5 * wave);
    const across = 1 - smoothstep(w * foot + wander, w * top + wander, Math.abs(lz));
    return height * along * across;
  }
  if (form.kind === 'ridge') {
    const half = Math.max(1, (form.length || 100) * 0.5);
    const width = Math.max(1, form.width || 45);
    const along = 1 - smoothstep(half * 0.72, half, Math.abs(lx));
    if (form.geology) return ridgeGeologyHeight(form, lx, lz, along) ?? 0;
    const across = 1 - smoothstep(width * 0.22, width, Math.abs(lz));
    // A wide crown plus a softer shoulder reads as a natural fold and keeps
    // tanks stable on the crest; the squared falloff avoids cliff walls.
    const shoulder = across * across * (3 - 2 * across);
    return height * along * shoulder;
  }
  if (form.geology) return knollGeologyHeight(form, lx, lz) ?? 0;
  const rx = Math.max(1, form.rx || form.r || 70);
  const rz = Math.max(1, form.rz || form.r || rx);
  const q = Math.sqrt((lx * lx) / (rx * rx) + (lz * lz) / (rz * rz));
  const w = 1 - smoothstep(0.12, 1, q);
  return height * w * w * (3 - 2 * w);
}

// ---------------------------------------------------------------------------
// createHeightField — PURE, node-runnable
// ---------------------------------------------------------------------------

/**
 * Build the deterministic heightfield for the 1024 m map.
 * @param {number} [seed=1337] terrain seed (mulberry32)
 * @param {?object} [cfg=null] map config (src/world/maps/*); null = classic verdant
 * @returns {{getHeightAt:function(number,number):number,
 *   getNormalAt:function(number,number):THREE.Vector3,
 *   getGroundType:function(number,number):('hard'|'medium'|'soft'),
 *   getWaterMaskAt:function(number,number):number,
 *   size:number, minY:number, maxY:number}} HeightField (ARCHITECTURE §2.7)
 */
export function createHeightField(
  seed = 1337,
  cfg: TerrainMapConfig | null = null,
): HeightField {
  const steps = heightFieldBuildSteps(seed, cfg);
  let step = steps.next();
  while (!step.done) step = steps.next();
  if (!('size' in step.value)) throw new Error('Incomplete live terrain field');
  return step.value;
}

/** Same exact field, with completed construction work paced by its caller. */
export async function createHeightFieldAsync(
  seed = 1337,
  cfg: TerrainMapConfig | null = null,
  tick: ((fraction: number) => Promise<void> | void) | null = null,
): Promise<HeightField> {
  const steps: Iterator<number, HeightField | TerrainPlacementSampler, void> = heightFieldBuildSteps(seed, cfg);
  let completed = false;
  try {
    let step = steps.next();
    while (!step.done) {
      if (tick) await tick(step.value);
      step = steps.next();
    }
    completed = true;
    if (!('size' in step.value)) throw new Error('Incomplete live terrain field');
    return step.value;
  } finally {
    if (!completed) {
      // A rejected pacing callback must close delegated work without masking
      // its error. Private CPU grids never become a partially published field.
      try { steps.return?.(); } catch { /* preserve the original failure */ }
    }
  }
}

function* heightFieldBuildSteps(
  seed = 1337,
  cfg: TerrainMapConfig | null = null,
  placementOnly = false,
): Generator<number, HeightField | TerrainPlacementSampler, void> {
  const layout = createLayout(cfg, !placementOnly && !usesInheritedRoadGrades(cfg?.id));
  let inheritedRoads = placementOnly ? null : completeInheritedRoadLayout(layout, cfg?.id);
  const T = layout.terrain;
  const redrockCanyon = cfg?.id === 'badlands' && T.redrockCanyon === true;
  const hardstandNoVeg = createHardstandVegetationExclusion(T.hardstands);
  const railSpurNoVeg = createRailSpurExclusion(T.railSpurs); // round 57: the spur's berth joins noVeg below
  // Round 63 (2026-09-24): the spurs' cuttings (railSpurs.ts) — terrain work: from a portal the bed is graded at a rail
  // grade through the rim band to the edge and on into the outland, the ground above it cut to a floor between batter
  // faces. Applied to every final query once the portals' ground is frozen (below); null on every map without one.
  const railCuttings = resolveRailCuttings(T.railSpurs);
  const railCuttingPortalYs = new Float64Array(railCuttings ? railCuttings.length : 0);
  // the open lines past the edge (resolved once the portals stand, from the uncut outland)
  let railOpenLines: (RailOpenLine | null)[] | null = null;
  let railCuttingsOn = false, railCuttingsSuspended = false;
  const _VILLAGE = layout.village;
  const _MARSHES = layout.marshes;
  const terraceZones = prepareTerraceZones(T.terraces);
  // maps lane B (2026-10-03): a sor pan's bank — the outer share of each station's radius over which its dig deepens to
  // `dip`, as (t / SOR_BANK)² (t = 1 − distance in radii): no slope at the rim, so the bank leaves the ground smoothly,
  // and its steepest where the floor's level meets it, so the shoreline is crisp.
  const SOR_BANK = 0.3;
  // the apron round a sor (in radii past its stations' edges) over which the micro relief returns: the flat lies in a
  // smooth sediment apron, so its rim is the gentle macro ground and its bank one even height, not a berm's crest
  const SOR_APRON = 0.6;
  // a sor flat's level: the lowest ground on its rim (the stations' shorelines, every 2 m, where no other sor station
  // covers them: the field's base and landforms under the pipeline's own corridor and village weights; the micro relief
  // is calm there, and roads and pads keep away) less the flat's sink, so every point of the rim stands over the floor
  // and the basin is closed. Computed on first use and kept.
  const _sorLevels = new Map<number, number>();
  function sorLevel(mi: number): number {
    const key = _MARSHES[mi].sorFlat as number;
    const known = _sorLevels.get(key);
    if (known !== undefined) return known;
    let lowest = Infinity, sink = 0;
    for (const station of _MARSHES) {
      if (station.sorFlat !== key) continue;
      sink = Math.max(sink, station.sorSinkM ?? 0.35);
      const samples = Math.max(12, Math.ceil(Math.PI * station.r));
      for (let k = 0; k < samples; k++) {
        const angle = (k / samples) * Math.PI * 2, reach = shorelineRadiusAt(station, angle);
        const x = station.x + Math.cos(angle) * reach, z = station.z + Math.sin(angle) * reach;
        if (_MARSHES.some((other) => other !== station && other.sorFlat !== undefined
          && shorelineDistance(other, x, z, 1) < 0.999)) continue;
        const cw = gridSample(gCorridor, x, z), vm = villageMask(x, z);
        lowest = Math.min(lowest, applyMacroTerrain(x, z, baseTerrainHeight(x, z, cw, vm), cw, vm, 0));
      }
    }
    const level = lowest - sink;
    _sorLevels.set(key, level);
    return level;
  }
  // the floor's weight at (x, z) over a flat's stations, and the station that gives it (the height field and the crust
  // mask share it)
  let _sorPanStation = -1;
  function sorPanAt(x: number, z: number): number {
    let pan = 0;
    _sorPanStation = -1;
    for (let mi = 0; mi < _MARSHES.length; mi++) {
      const m = _MARSHES[mi];
      if (m.sorFlat === undefined) continue;
      const md = shorelineDistance(m, x, z, 1);
      if (md >= 1) continue;
      const u = Math.min(1, (1 - md) / SOR_BANK), w = u * u;
      if (w > pan) { pan = w; _sorPanStation = mi; }
    }
    return pan;
  }
  // maps lane B: the sors' wetness for the splat mask — the salt crust (0.36..1) where the ground stands at the flat's
  // level (the floor), a damp margin (0.26 → 0) up the first 0.35 m of its banks, nothing beyond the stations
  const _sorStations = _MARSHES.some((m) => m.sorFlat !== undefined);
  function sorWetnessAt(x: number, z: number): number {
    const pan = sorPanAt(x, z);
    if (_sorPanStation < 0) return 0;
    const above = getHeightAt(x, z) - sorLevel(_sorPanStation);
    const reach = Math.sqrt(pan); // 0 at the rim, 1 from the bank's foot in
    return above <= 0.02 ? 0.36 + 0.64 * reach : 0.26 * Math.min(1, reach * 3) * (1 - smoothstep(0.02, 0.35, above));
  }
  const _LAKES = layout.lakes;
  const _SPAWN_PLAYER = layout.spawns.player;
  const _SPAWN_ENEMIES = layout.spawns.enemies;
  // Frontline Assault 2026-09-13: the assault-trenches world variant carves
  // three fire trenches and a communication trench along the alpha→bravo
  // axis into the height field itself, so terrain, collision, grass and
  // props all follow the cut. The standard field is byte-identical.
  // Resolved on first height query (every construction constant exists by
  // then): a fire trench whose centre falls inside the settlement is dropped
  // rather than half-carved under the houses; the sector marker still stands.
  let _trenchPlan: AssaultTrenchPlan | null | undefined;
  const trenchPlan = (): AssaultTrenchPlan | null => {
    if (_trenchPlan !== undefined) return _trenchPlan;
    if (!cfg?.assaultTrenches) return (_trenchPlan = null);
    const { alpha, bravo } = assaultTeamCenters({ x: _SPAWN_PLAYER.x, z: _SPAWN_PLAYER.z },
      _SPAWN_ENEMIES.map((point) => ({ x: point.x, z: point.z })));
    const planned = planAssaultTrenchLines(alpha, bravo);
    const kept = planned.lines.map((line) => villageMask(line.x, line.z) < 0.4);
    const lines = planned.lines.filter((_line, index) => kept[index]);
    // Sector list stays index-aligned with the fractions: a dropped (settlement) sector reads
    // null so the mode falls back to its own axis fraction instead of the next line's centre.
    const sectors = planned.lines.map((line, index) => (kept[index] ? { x: line.x, z: line.z } : null));
    _trenchPlan = lines.length ? { lines, connector: planned.connector, sectors } : null;
    return _trenchPlan;
  };
  // owner 2026-09-17 ("more trenches … on ALL maps, extra in Frontline Assault"): every field carries short
  // fire trenches — two per side of the axis at 30 % and 70 % of the way to the enemy — unless the map opts
  // out (`fieldTrenches: false`). A line is dropped where the settlement, a road (< 26 m at any of five
  // stations — clear of the graded shoulder as well as the pavement), the map edge or an assault sector line
  // would cross it. Resolved on the first FINAL height query (roads and pads on): raw authoring queries — road
  // node grades, pad seats, lake levels, marsh inputs — read the untrenched ground, so the plan never feeds back
  // into the roads it keeps clear of and a completed-roads variant authors the same raw inputs.
  const FIELD_TRENCH_ROAD_BERTH_M = 26;
  let _fieldPlan: AssaultTrenchPlan | null | undefined;
  const fieldTrenchPlan = (): AssaultTrenchPlan | null => {
    if (_fieldPlan !== undefined) return _fieldPlan;
    if (cfg?.fieldTrenches === false) return (_fieldPlan = null);
    // The marsh bank widths come from the liquid surfaces, which the dry construction pass has not built
    // yet: a plan drawn during that pass is provisional (bank band 1) and only the plan drawn once the
    // surfaces exist is cached — the final heights, the props and the receipts all read that one.
    // Round 59 (2026-09-24, performance audit): only a liquid-water map ever builds those surfaces. A map
    // whose marshes are dry (Tarkhan Steppe's takyr crusts, round 48) never does, so its plan stayed
    // provisional for the world's whole life and every height query with roads and pads on re-planned the
    // trenches (lines × five samples × every marsh's shoreline distance): 11.8 µs per sample against
    // 1.0 µs at deploy 66, a 9.9 s world build. The bank-band-1 plan IS a dry map's final plan (nothing
    // later changes it), so it is cached like every other map's — byte-identical heights and plan.
    const provisional = liquidWater && !liquidSurfaces && _MARSHES.length > 0;
    const { alpha, bravo } = assaultTeamCenters({ x: _SPAWN_PLAYER.x, z: _SPAWN_PLAYER.z },
      _SPAWN_ENEMIES.map((point) => ({ x: point.x, z: point.z })));
    const sectors = trenchPlan();
    // the carve is damped by the settlement and marsh weights heightAt applies; a station under 75 % dry
    // would leave a shallow ditch instead of a trench, so the line is dropped (same marsh/bank law as heightAt)
    const dryFactor = (x: number, z: number): number => {
      let marshW = 0;
      for (let mi = 0; mi < _MARSHES.length; mi++) {
        const bankBand = liquidSurfaces ? liquidSurfaces[mi * LIQUID_MARSH_STRIDE + 3] : 1;
        const md = shorelineDistance(_MARSHES[mi], x, z, bankBand);
        if (md < 1) marshW = Math.max(marshW, 1 - md);
        if (liquidSurfaces && md < bankBand) marshW = Math.max(marshW, smoothstep(bankBand, LIQUID_MARSH_CORE, md));
      }
      return (1 - villageMask(x, z)) * (1 - marshW);
    };
    const lines = planFieldTrenchLines(alpha, bravo).lines.filter((line) => {
      for (let k = -2; k <= 2; k++) {
        const s = (k / 2) * line.halfLengthM;
        const px = line.x + line.lx * s, pz = line.z + line.lz * s;
        if (Math.max(Math.abs(px), Math.abs(pz)) > 455) return false;
        if (villageMask(px, pz) >= 0.4) return false;
        if (gridSample(gRoadDist, px, pz) < FIELD_TRENCH_ROAD_BERTH_M) return false;
        // wet ground never takes a trench (the carve fades to nothing in marsh and water anyway):
        // the same wetness law the splat mask and the wakes read, plus a dry berth around every sheet
        if (waterWetnessAt(px, pz) > 0.02) return false;
        if (dryFactor(px, pz) < 0.75) return false;
        if (_LAKES.some((lake) => shorelineDistance(lake, px, pz, 1.25) < 1.25)) return false;
        if (_MARSHES.some((marsh) => shorelineDistance(marsh, px, pz, 1.25) < 1.25)) return false;
      }
      return !sectors || !sectors.lines.some((sector) =>
        Math.hypot(sector.x - line.x, sector.z - line.z) < sector.halfLengthM + line.halfLengthM + 10);
    });
    const plan = lines.length ? { lines, connector: null, profile: FIELD_TRENCH.profile } : null;
    if (!provisional) _fieldPlan = plan;
    return plan;
  };
  const noi = new SimplexNoise({ random: mulberry32((seed ^ 0x9e3779b9) >>> 0) });
  // The map-borders lane (2026-10-03): the land around the square — the rim lift's landform (borderLandform.ts). Its
  // own noise stream: the terrain's `noi` sequence is untouched.
  // a road that leaves the square leaves through a valley (the land opens along its line past the edge), and so does a
  // railway: it runs on in the open along its last edge's heading (railSpurs.ts RAIL_OPEN_*; the round-67 tunnel and
  // the classic-rim hill it bored are retired), with the ranges held back from its line. The valley follows the spur
  // that leaves the square (its path ending on the edge), not whether it is cut, so a field with the cutting and one
  // without it share their landform and differ only in the corridor.
  const roadExitLines = buildRoadExitLines(layout.roads, seed);
  const railExitValleys = (T.railSpurs ?? []).flatMap((spur) => {
    const end = spur.path[spur.path.length - 1], prev = spur.path[spur.path.length - 2];
    if (!end || !prev || Math.max(Math.abs(end[0]), Math.abs(end[1])) < HALF - 4) return [];
    const len = Math.hypot(end[0] - prev[0], end[1] - prev[1]) || 1;
    const ux = (end[0] - prev[0]) / len, uz = (end[1] - prev[1]) / len;
    const xs: number[] = [], zs: number[] = [];
    for (let s = 0; s <= RAIL_OPEN_RUN_M; s += 40) { xs.push(end[0] + ux * s); zs.push(end[1] + uz * s); }
    return [{ xs, zs, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs),
      holdM: RAIL_OPEN_RANGES_BACK_M }];
  });
  const border = createBorderLandform(seed, T.rimH, resolveBorderLandform(cfg?.horizon?.style, T.border, cfg?.id),
    [...roadExitLines, ...railExitValleys]);
  /** The classic rim lift rimH · s(r)² (s = smoothstep(430, 512, r)): what the authoring queries read (roads off). */
  const classicRimLift = (r: number): number => { const s = smoothstep(430, 512, r); return s * s * T.rimH; };
  // the map-borders lane (wave 2): set while buildRoadElevationGrid authors its second pass of road nodes on the
  // landform's rim (heightAt's rim lift)
  let authoringOnLandform = false;

  // --- base noise: fBm detail + domain-warped ridge, and a smooth variant ---
  function core(x: number, z: number): { d: number; s: number } {
    const wx = noi.noise(x * 0.0016 + 13.7, z * 0.0016 - 4.2) * 80;
    const wz = noi.noise(x * 0.0016 - 27.1, z * 0.0016 + 9.3) * 80;
    let rr = 1 - Math.abs(noi.noise((x + wx) * 0.0026 + 51, (z + wz) * 0.0026 - 33));
    const ridge = rr * rr * 6.5;
    const o0 = noi.noise(x * 0.0038 + 101, z * 0.0038 - 71) * 8.5;
    const o1 = noi.noise(x * 0.0079 - 11, z * 0.0079 + 177) * 4.1;
    let d = ridge + o0 + o1;
    d += noi.noise(x * 0.0152 + 301, z * 0.0152 + 41) * 1.9;
    d += noi.noise(x * 0.0313 - 222, z * 0.0313 - 97) * 0.85;
    d += noi.noise(x * 0.064 + 77, z * 0.064 + 13) * 0.35;
    d += noi.noise(x * 0.131 - 8, z * 0.131 + 259) * 0.14;
    const s = ridge * 0.5 + o0 + o1 * 0.45;
    return { d, s };
  }

  // --- precomputed field grid: road distance/elevation + corridor weight ---
  const GN = 257, CELL = MAP_SIZE / (GN - 1); // 4 m cells
  const gRoadDist = new Float32Array(GN * GN).fill(1e9);
  const gRoadElev = new Float32Array(GN * GN);
  let gSegRoad: Int16Array | null = new Int16Array(GN * GN);
  let gSegIdx: Int16Array | null = new Int16Array(GN * GN);
  let gSegT: Float32Array | null = new Float32Array(GN * GN);
  const gCorridor = new Float32Array(GN * GN);

  const roads = layout.roads;
  // Count completed segments, corridor rows, support setup and range rows;
  // this is construction progress, not elapsed-time or work-cost prediction.
  const totalHeightSlices = roads.reduce((sum, nodes) => sum + Math.max(0, nodes.length - 1), 0)
    + GN + 1 + 129;
  let completedHeightSlices = 0;
  const corridors = [_SPAWN_PLAYER, ..._SPAWN_ENEMIES].map(
    (s) => [s.x, s.z, _VILLAGE.cx, _VILLAGE.cz]
  );

  function stampRoadLookupSegment(route: number, segment: number,
    ax: number, az: number, bx: number, bz: number): void {
    // Hoist segment constants, retaining segDist's exact arithmetic and each
    // cell's route/segment order. Every winner still rounds through Float32;
    // squared-distance comparisons would change near-equal ownership ties.
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    for (let gz = 0; gz < GN; gz++) {
      const z = gz * CELL - HALF;
      for (let gx = 0; gx < GN; gx++) {
        const x = gx * CELL - HALF;
        const i = gz * GN + gx;
        let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
        t = clamp(t, 0, 1);
        const ex = ax + dx * t - x, ez = az + dz * t - z;
        const d = Math.sqrt(ex * ex + ez * ez);
        if (d < gRoadDist[i]) {
          gRoadDist[i] = d; gSegRoad![i] = route; gSegIdx![i] = segment; gSegT![i] = t;
        }
      }
    }
  }

  function* buildRoadLookupGrid(): Generator<number, void, void> {
    for (let r = 0; r < roads.length; r++) {
      const nodes = roads[r];
      for (let s = 0; s < nodes.length - 1; s++) {
        stampRoadLookupSegment(r, s, nodes[s][0], nodes[s][1], nodes[s + 1][0], nodes[s + 1][1]);
        yield ++completedHeightSlices / totalHeightSlices;
      }
    }
    // Deployment corridors do not depend on road-grid writes. Keep their
    // original per-cell accumulation and store only the final Float32 value.
    for (let gz = 0; gz < GN; gz++) {
      const z = gz * CELL - HALF;
      for (let gx = 0; gx < GN; gx++) {
        const x = gx * CELL - HALF;
        const i = gz * GN + gx;
        let cw = 0;
        for (const c of corridors) {
          const { d } = segDist(x, z, c[0], c[1], c[2], c[3]);
          cw = Math.max(cw, 1 - smoothstep(8, 30, d));
        }
        gCorridor[i] = cw;
      }
      yield ++completedHeightSlices / totalHeightSlices;
    }
  }
  yield* buildRoadLookupGrid();
  function buildRoadBorderCorridors(): number | null {
    if (placementOnly || T.roads === 'country' || !T.roads.paths) return null;
    return stampRoadBorderCorridors(cfg?.id, roads, T.roads.paths,
      T.roads.grid ? T.roads.grid.xs.length + T.roads.grid.zs.length : 0,
      T.rimH, gCorridor, GN, MAP_SIZE);
  }
  let borderCorridorStart = inheritedRoads ? null : buildRoadBorderCorridors();
  // Ownership is authored, not inferred from how far an exit used to detour.
  let boundedRoadCorridor = borderCorridorStart !== null
    && usesBoundedRoadShoulders(cfg?.id);


  function gridSample(arr: ArrayLike<number>, x: number, z: number): number {
    const gx = clamp((x + HALF) / CELL, 0, GN - 1.0001);
    const gz = clamp((z + HALF) / CELL, 0, GN - 1.0001);
    const x0 = gx | 0, z0 = gz | 0, fx = gx - x0, fz = gz - z0;
    const i = z0 * GN + x0;
    const a = arr[i] + (arr[i + 1] - arr[i]) * fx;
    const b = arr[i + GN] + (arr[i + GN + 1] - arr[i + GN]) * fx;
    return a + (b - a) * fz;
  }

  function sampleMesaNoise(x: number, z: number): number {
    const mwp = noi.noise(x * 0.0009 + 77, z * 0.0009 - 31) * 95;
    return noi.noise((x + mwp) * 0.0014 - 310,
      (z - mwp * 0.8) * 0.0014 + 208) * 0.5 + 0.5;
  }

  const villageY = core(_VILLAGE.cx, _VILLAGE.cz).s;

  function villageMask(x: number, z: number): number {
    const dx = Math.max(_VILLAGE.x0 - x, x - _VILLAGE.x1, 0);
    const dz = Math.max(_VILLAGE.z0 - z, z - _VILLAGE.z1, 0);
    return (1 - smoothstep(0, _VILLAGE.feather, Math.hypot(dx, dz))) * (_VILLAGE.flatten ?? 0.85);
  }

  const padYs = new Float64Array(8); // filled below (player + 7 enemies)
  const padPts = [_SPAWN_PLAYER, ..._SPAWN_ENEMIES];
  const lakeLevels = new Float64Array(Math.max(1, _LAKES.length)); // filled below
  const liquidWater = !!cfg?.splat?.seaLake && !T.frozenMarshes;
  const liquidDepthM = liquidWater ? waterContactProfile(cfg?.id || '').depthM : 0;
  const waterRampStart = cfg?.splat?.seaRamp?.[0] ?? 0.40;
  const waterRampEnd = cfg?.splat?.seaRamp?.[1] ?? 0.78;
  let liquidSurfaces: Float64Array | null = null;
  let liquidLakeBanks: Float64Array | null = null;
  // Authored drainage contours may have wide grading aprons that overlap a
  // different basin. Keep their composition continuous and order-independent;
  // every legacy lake retains the original sequential arithmetic below.
  const continuousLakeAprons = _LAKES.some(lake => lake.radii !== undefined);
  const lakeHeightResult: LakeHeightResult = { height: 0, wetness: 0 };
  let liquidIndex: Uint32Array | null = null;
  let quarryFloorY: number | null = null;
  let landformPhase: 'legacy-support' | 'authored-relief' = 'legacy-support';
  const liquidIndexWords = Math.ceil(_MARSHES.length / 32);
  // Round 61 (2026-09-24): the bridge decks, resolved after the road plane and the liquid surfaces are frozen (below);
  // every construction query before that sees none, so the road grid, the pads and the liquid fit are untouched.
  let bridgeDecks: readonly BridgeDeckPlane[] = EMPTY_BRIDGE_DECKS;
  const _bridgeTerms = { span: 0, approach: 0, deckY: 0 };
  /**
   * The bridge terms at a point, allocation-free: `span` is 1 under the deck and falls to 0 through the abutment (the
   * road plane and the dry band are exempted by it), `approach` is 1 at the abutment face and falls to 0 at the end of
   * the approach (the road plane grades toward `deckY` by it); both are 0 off every deck's corridor.
   */
  function bridgeTermsAt(x: number, z: number): typeof _bridgeTerms {
    const out = _bridgeTerms;
    out.span = 0; out.approach = 0; out.deckY = 0;
    for (let i = 0; i < bridgeDecks.length; i++) {
      const deck = bridgeDecks[i];
      const dx = x - deck.x, dz = z - deck.z;
      const along = Math.abs(dx * deck.ux + dz * deck.uz);
      if (along >= deck.halfLength + deck.approachM) continue;
      if (Math.abs(dx * deck.uz - dz * deck.ux) > BRIDGE_CORRIDOR_HALF_WIDTH_M) continue;
      out.deckY = deck.deckY;
      if (along < deck.halfLength) {
        out.span = 1 - smoothstep(deck.halfLength - BRIDGE_ABUTMENT_M, deck.halfLength, along);
        out.approach = 1;
      } else out.approach = 1 - smoothstep(deck.halfLength, deck.halfLength + deck.approachM, along);
      return out;
    }
    return out;
  }
  /** The deck standing over (x, z) — inside the span and between the parapets — or null. */
  function bridgeDeckOver(x: number, z: number): BridgeDeckPlane | null {
    for (let i = 0; i < bridgeDecks.length; i++) {
      const deck = bridgeDecks[i];
      const dx = x - deck.x, dz = z - deck.z;
      if (Math.abs(dx * deck.ux + dz * deck.uz) <= deck.halfLength
        && Math.abs(dx * deck.uz - dz * deck.ux) <= deck.halfWidth) return deck;
    }
    return null;
  }

  function applyMacroTerrain(
    x: number,
    z: number,
    h: number,
    corridorWeight: number,
    settlementWeight: number,
    marshWeight: number,
  ): number {
    let spawnClear = 1;
    // Unlike the held decorative relief pilot, these are the actual support
    // heights from the first construction sample onward. Roads and pads below
    // therefore conform to the canyon instead of retaining obsolete mesa levels.
    if (redrockCanyon) h += sampleRedrockCanyon(x, z);
    if (T.dunes || T.mesas || T.landforms.length) {
      for (let p = 0; p < padPts.length; p++) {
        const dx = x - padPts[p].x, dz = z - padPts[p].z;
        if (dx * dx + dz * dz >= 90 * 90) continue;
        const pd = Math.hypot(dx, dz);
        if (pd < 90) spawnClear = Math.min(spawnClear, smoothstep(36, 90, pd));
      }
    }
    if (T.dunes) {
      // r5 terrain_environment: ASYMMETRIC dune profile. Real transverse
      // dunes ramp gently up the windward side and drop on a steep slip face
      // downwind of the brink; the old symmetric ridge^3 read as featureless
      // blobby mounds (critique). Compare the ridge field against a sample
      // ~16 m UPWIND (global wind [0.8,0.6], matching the splat rippleDir):
      // windward faces (higher than upwind) fill toward the crest, lee faces
      // (lower than upwind) drop away faster — a slip-face brink. A short
      // ~24 m crest-ripple octave roughens the brink line so dune tops stop
      // reading as airbrushed domes from the establishing camera.
      const dn = 1 - Math.abs(noi.noise(x * 0.0021 + 402, z * 0.0046 + 91));
      const dnu = 1 - Math.abs(noi.noise((x - 12.8) * 0.0021 + 402, (z - 9.6) * 0.0046 + 91));
      const dn2 = noi.noise(x * 0.0064 - 55, z * 0.0064 + 233) * 0.5 + 0.5;
      const dnb = dn * 0.62 + dnu * 0.38;
      const dnub = dnu * 0.65 + dn * 0.35;
      const dnc = dnb * dnb * (3 - 2 * dnb);
      const dnuc = dnub * dnub * (3 - 2 * dnub);
      const skew = clamp((dnc - dnuc) * 2.0, -0.28, 0.28);
      let duneH = dnc * T.dunes.amp * (0.7 + dn2 * 0.5) * (1 + skew * 0.55);
      duneH += smoothstep(0.55, 0.95, dnc) * noi.noise(x * 0.041 + 17, z * 0.041 - 63)
        * 0.45 * T.dunes.amp * 0.08;
      h += duneH * (1 - corridorWeight * 0.7) * (1 - settlementWeight) * spawnClear;
    }
    if (T.mesas) {
      const mn = sampleMesaNoise(x, z);
      const band = T.mesas.thr1 - T.mesas.thr0;
      const wallWidth = T.mesas.wallWidth ?? 0.42;
      const tierWidth = T.mesas.tierWidth ?? 0.045;
      const wall = smoothstep(T.mesas.thr0, T.mesas.thr0 + band * wallWidth, mn);
      const tier2 = smoothstep(T.mesas.thr1 + 0.04, T.mesas.thr1 + 0.04 + tierWidth, mn);
      const tierScale = T.mesas.tierScale ?? 0.45;
      const capNoise = 0.97 + 0.03 * noi.noise(x * 0.012 + 31, z * 0.012 - 74);
      const corridorFloor = T.mesas.corridorFloor ?? 0;
      const corridorProtect = 1 - corridorWeight * (1 - corridorFloor);
      h += (wall + tier2 * tierScale) * T.mesas.amp * capNoise
        * corridorProtect * (1 - settlementWeight) * (1 - marshWeight) * spawnClear;
    }
    let unionTop = 0;
    for (let li = 0; li < T.landforms.length; li++) {
      const form = T.landforms[li];
      const corridorScale = form.corridorScale ?? 0.62;
      const settlementScale = form.settlementScale ?? 0.45;
      const wetScale = form.wetScale ?? 0.30;
      const protect = (1 - corridorWeight * (1 - corridorScale))
        * (1 - settlementWeight * (1 - settlementScale))
        * (1 - marshWeight * (1 - wetScale));
      const add = sampleLandformHeight(form, x, z, landformPhase) * spawnClear * protect;
      // (the Redrock lane: a union's members stand as one rock, the greatest of them; unionTop stays 0 on every other map)
      if (form.union) { if (add > unionTop) unionTop = add; } else h += add;
    }
    return h + unionTop;
  }

  function applyHeightConstraints(
    x: number,
    z: number,
    h: number,
    marshWeight: number,
    settlementWeight: number,
    lakesOn: boolean,
    padsOn: boolean,
    roadsOn: boolean,
    gridIndex: number,
    gridFx: number,
    gridFz: number,
    borderShoulderWeight: number,
    rd: number,
    roadRimShift = 0,
  ): number {
    let roadElevation = 0, elevationSampled = false;
    // Earthworks share the existing road plane, not the pavement footprint.
    // Apply before lakes/pads so their established support remains final;
    // marsh cores were already composed above and must not be lifted here.
    if (roadsOn && borderShoulderWeight > 0 && marshWeight < 1) {
      roadElevation = sampleHeightGridCell(gRoadElev, GN, gridIndex, gridFx, gridFz) + roadRimShift;
      elevationSampled = true;
      h += (roadElevation - h) * borderShoulderWeight * (1 - marshWeight);
    }
    let lakeWetness = 0;
    if (lakesOn) {
      composeLakeHeight(_LAKES, lakeLevels, liquidLakeBanks, continuousLakeAprons,
        x, z, h, settlementWeight, lakeHeightResult);
      h = lakeHeightResult.height;
      lakeWetness = lakeHeightResult.wetness;
    }
    let padWetness = 1;
    if (padsOn) {
      const padRadiusSquared = lakeWetness > 0 ? 26 * 26 : 22 * 22;
      for (let p = 0; p < padPts.length; p++) {
        const dx = x - padPts[p].x, dz = z - padPts[p].z;
        if (dx * dx + dz * dz >= padRadiusSquared) continue;
        const pd = Math.hypot(dx, dz);
        if (pd < 22) h += (padYs[p] - h) * (1 - smoothstep(9, 22, pd));
        if (lakeWetness > 0) padWetness *= smoothstep(22, 26, pd);
      }
    }
    if (!roadsOn) return h;
    if (rd < 14) {
      if (!elevationSampled) roadElevation = sampleHeightGridCell(gRoadElev, GN, gridIndex, gridFx, gridFz) + roadRimShift;
      if (bridgeDecks.length) {
        // round 61: under a bridge deck the road plane yields to the river bed; over each approach it grades to the deck
        const bridge = bridgeTermsAt(x, z);
        roadElevation += (bridge.deckY - roadElevation) * bridge.approach;
        h += (roadElevation - h) * (1 - smoothstep(3.8, 14, rd)) * (1 - bridge.span);
      } else h += (roadElevation - h) * (1 - smoothstep(3.8, 14, rd));
    }
    const detailed = applyRoadShoulderDetail(x, z, h, rd, settlementWeight, marshWeight, lakeWetness, padWetness);
    // Dry viaduct abutments cut any sub-metre shoulder noise flush with the
    // supported deck. The gorge below remains the original excavated surface.
    const dryDeck = T.bridges?.length ? bridgeDeckOver(x, z) : null;
    return dryDeck ? Math.min(detailed, dryDeck.deckY) : detailed;
  }

  function applyRoadShoulderDetail(x: number, z: number, h: number, rd: number,
    settlementWeight: number, marshWeight: number, lakeWetness: number, padWetness: number): number {
    if (rd > 4 && rd < 22) {
      // Road detail is dry-ground relief, not a ripple generator for a lake
      // flattened above. Reuse contour/pad work and the same protected water
      // ramp as the splat/wake mask; dry shoulders and ice keep every term.
      const liquidDetail = lakeWetness > 0
        ? 1 - smoothstep(waterRampStart, waterRampEnd,
          lakeWetness * smoothstep(14, 18, rd) * padWetness) : 1;
      if (liquidDetail === 0 || marshWeight === 1) return h;
      const bermA = 0.5 + 0.5 * noi.noise(x * 0.031 + 71, z * 0.031 - 44);
      const berm = Math.exp(-(((rd - 7.0) / 1.9) ** 2)) * 0.26 * bermA;
      const ditch = -Math.exp(-(((rd - 11.5) / 2.4) ** 2)) * 0.20 * (1 - bermA * 0.5);
      h += (berm + ditch) * (1 - settlementWeight) * (1 - marshWeight) * liquidDetail;
    }
    return h;
  }

  // Round 36 (owner 2026-09-21, "it looked like a completely new geography"): the same composition as heightAt for a
  // point OUTSIDE the square — the hill noise at full weight (no corridor pull), the map's macro landforms and the rim
  // lift, which is 1 beyond the edge — without roads, corridors, villages, lakes, pads or the tactical micro-terrain.
  // The horizon ring's near rows seat on this so the border is a rule, not a change of geology. Pure function of
  // (x, z): no grid, no clamp, no allocation.
  // Round 47 follow-up (2026-09-23): a headland beside a bay rose to the full border rim within 82 m of the water (a
  // 26–42 m block against a -4…-8 m sheet). Within `coastRimFadeM` of a bay's shoreline the rim lift fades in, so a
  // headland climbs away from the strand instead of standing on it. Pure function of (x, z); off unless the map authors it.
  function coastRimKeep(x: number, z: number): number {
    const coastRimFadeM = T.coastRimFadeM ?? 0;
    if (coastRimFadeM <= 0) return 1;
    let keep = 1;
    for (let li = 0; li < _LAKES.length; li++) {
      const lake = _LAKES[li];
      const dx = x - lake.x, dz = z - lake.z;
      const outside = Math.hypot(dx, dz) - shorelineRadiusAt(lake, Math.atan2(dz, dx)) * 0.96;
      keep = Math.min(keep, smoothstep(0, coastRimFadeM, outside));
    }
    return keep;
  }
  function outlandBaseHeightAt(x: number, z: number): number {
    // Round 47 follow-up (2026-09-23): the composition heightAt applies inside the square continues past the red line —
    // the shore rings' liquid surfaces (their dip, their bank pull, their flat core), the border rim gated by that water
    // weight, then the bay banks with the SAME per-lake band the square uses (authored or fitted — a narrower band
    // out here left Saltwind's headlands standing as slabs on the line). Without it a shore ring flattened the square
    // to the sea level while the ring's first outer row stood at the geology's full height: a 25 m step on the red
    // line north of Saltmere's bay, the "28 m block" of round 47. Roads, pads and the micro relief stay inside.
    let liquidDip = 0, marshW = 0, waterWeight = 0, waterLevelSum = 0, waterWeightSum = 0, waterCoreSum = 0, waterCoreCount = 0;
    if (liquidSurfaces) for (let mi = 0; mi < _MARSHES.length; mi++) {
      const m = _MARSHES[mi], surfaceOffset = mi * LIQUID_MARSH_STRIDE, bankBand = liquidSurfaces[surfaceOffset + 3];
      const md = shorelineDistance(m, x, z, bankBand);
      if (md < 1) { const t = 1 - md; liquidDip += m.dip * t * t * (3 - 2 * t); marshW = Math.max(marshW, t); }
      if (md < bankBand) {
        const weight = smoothstep(bankBand, LIQUID_MARSH_CORE, md);
        const level = liquidSurfaces[surfaceOffset] + liquidSurfaces[surfaceOffset + 1] * x + liquidSurfaces[surfaceOffset + 2] * z;
        waterWeight = Math.max(waterWeight, weight);
        const priority = weight / Math.max(1e-9, 1 - weight);
        waterWeightSum += priority; waterLevelSum += level * priority;
        if (md <= LIQUID_MARSH_CORE) { waterCoreSum += level; waterCoreCount++; }
      }
    }
    let h: number;
    if (waterCoreCount) h = waterCoreSum / waterCoreCount;
    else {
      h = baseTerrainHeight(x, z, 0, 0) - liquidDip;
      h = applyMacroTerrain(x, z, h, 0, 0, marshW);
      const borderRadius = Math.max(Math.abs(x), Math.abs(z));
      // round 47 (2026-09-23): the border rim yields to the water so a shore continues past the square instead of a wall
      // the map-borders lane (2026-10-03): the lift is the border landform's — the outland's own hills, not a plateau
      // standing rimH over the battlefield
      const lift = border.liftAt(x, z, borderRadius);
      h += lift * (1 - waterWeight) * (lift > 0 ? coastRimKeep(x, z) : 1);
      if (!clearanceBuilding) h -= clearanceReduction(x, z, h);
      if (waterWeight > 0) h += (waterLevelSum / waterWeightSum - h) * waterWeight;
    }
    if (liquidLakeBanks !== null) {
      composeLakeHeight(_LAKES, lakeLevels, liquidLakeBanks, continuousLakeAprons, x, z, h, 0, outlandLakeHeight);
      h = outlandLakeHeight.height;
    }
    return h;
  }
  const outlandLakeHeight: LakeHeightResult = { height: 0, wetness: 0 };

  // The map-borders lane (2026-10-03, gauntlet wave 0: "the border reads as an enclosing clay wall rather than land
  // continuing"): the foreground clearance. The border census's eye views met 13–25° banks a few metres past the red
  // line — the geology's own hills, the landform's crests, a corner's rise. Past the playable edge the ground rises at
  // most ~2.5° over the square's own edge (its outland composition along the 470 m square, smoothed over ±40 m) for its
  // first ~260 m and is released by ~540 m, so from inside the square the eye runs over the near country to the woods,
  // farms and foothills behind. A smooth minimum (no crease) that never raises anything; inside the playable square
  // nothing changes.
  const CLEARANCE_SIDE_M = 940, CLEARANCE_STEP_M = 10, CLEARANCE_SOFT_M = 4;
  let clearanceRef: Float32Array | null = null, clearanceBuilding = false;
  function clearanceReference(): Float32Array {
    if (clearanceRef) return clearanceRef;
    const n = (4 * CLEARANCE_SIDE_M) / CLEARANCE_STEP_M, raw = new Float32Array(n), half = CLEARANCE_SIDE_M / 2;
    clearanceBuilding = true;
    for (let i = 0; i < n; i++) {
      const s = i * CLEARANCE_STEP_M, side = Math.floor(s / CLEARANCE_SIDE_M), p = s - side * CLEARANCE_SIDE_M;
      const x = side === 0 ? -half + p : side === 1 ? half : side === 2 ? half - p : -half;
      const z = side === 0 ? half : side === 1 ? half - p : side === 2 ? -half : -half + p;
      raw[i] = outlandBaseHeightAt(x, z);
    }
    clearanceBuilding = false;
    const ref = new Float32Array(n), reach = 4;
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -reach; k <= reach; k++) sum += raw[(i + k + n) % n];
      ref[i] = sum / (2 * reach + 1);
    }
    clearanceRef = ref;
    return ref;
  }
  /**
   * How far (m) the ground past the playable edge comes down under the clearance at (x, z), given its height there and
   * the distance to the nearest road: it ramps in over the first 40 m past the red line (no step at the square's edge),
   * and a road's own band keeps its ground — the road hold (borderLandform.ts) grades it to the landform by the edge.
   */
  function clearanceReduction(x: number, z: number, h: number, roadDistance = Infinity): number {
    const half = CLEARANCE_SIDE_M / 2;
    if (Math.max(Math.abs(x), Math.abs(z)) <= half || border.settings.classic) return 0;
    const cx = clamp(x, -half, half), cz = clamp(z, -half, half), dist = Math.hypot(x - cx, z - cz);
    const release = smoothstep(260, 540, dist);
    if (release >= 1) return 0;
    const ref = clearanceReference(), n = ref.length;
    const s = cz >= half ? cx + half : cx >= half ? CLEARANCE_SIDE_M + (half - cz)
      : cz <= -half ? 2 * CLEARANCE_SIDE_M + (half - cx) : 3 * CLEARANCE_SIDE_M + (cz + half);
    const f = s / CLEARANCE_STEP_M, i0 = Math.floor(f), t = f - i0;
    const edge = ref[((i0 % n) + n) % n] * (1 - t) + ref[(((i0 + 1) % n) + n) % n] * t;
    const excess = h - (edge + 2 + dist * 0.044);
    if (excess <= -CLEARANCE_SOFT_M) return 0;
    const soft = excess >= CLEARANCE_SOFT_M ? excess : (excess + CLEARANCE_SOFT_M) ** 2 / (4 * CLEARANCE_SOFT_M);
    const roadBand = roadDistance < 95 ? 1 - smoothstep(18, 95, roadDistance) : 0;
    return soft * smoothstep(0, 40, dist) * (1 - release) * (1 - roadBand);
  }

  // The map-borders lane (2026-10-03, owner: "roads ... continue and fade naturally"): every road that reaches the
  // playable edge runs on past it. The border census showed each one ending where the square ends — the mask's clamped
  // edge texel dragged the carriageway 24–96 m out and the ring's ground closed over it, so a road led into a hedge or
  // a hillside and stopped. An exit is the road's own heading at the edge, walked out in 40 m steps that wander a few
  // degrees (never turning back toward the square) for ~720 m; its grade starts at the square's road at the edge and
  // follows the smoothed outland (cut and fill, at most 7 %); the outland lies on that grade within 5 m of the line and
  // eases back to its own ground by 30 m, and the whole corridor dissolves over the exit's last third. The ring carries
  // the carriageway itself as a vertex attribute (roadExitAt: the signed offset from the line and its presence), so the
  // splat program draws the road with the square's own road law and no sampler or loop. Lazy: resolved on the first
  // outland query, when the square's roads are final. Pure, deterministic per seed.
  interface RoadExit { xs: Float64Array; zs: Float64Array; ys: Float64Array; ss: Float64Array; length: number; minX: number; maxX: number; minZ: number; maxZ: number }
  const ROAD_EXIT_REACH_M = 34;
  let _roadExits: RoadExit[] | null = null;
  function roadExits(): RoadExit[] {
    if (_roadExits) return _roadExits;
    const exits: RoadExit[] = [];
    _roadExits = exits; // the outland queries below read the base ground, never the corridors being built
    for (const line of roadExitLines) {
      const { xs, zs, ss } = line;
      // a road that reaches a shore past the edge ends there (no carriageway on the sea floor)
      if (liquidWater && (outlandWaterAt(xs[1], zs[1])?.wetness ?? 0) > 0.2) continue;
      // the grade: the square's road at the edge, then the outland smoothed along the line, at most 7 %
      const ys = new Float64Array(ROAD_EXIT_STEPS + 1), raw = new Float64Array(ROAD_EXIT_STEPS + 1);
      for (let i = 0; i <= ROAD_EXIT_STEPS; i++) raw[i] = outlandBaseHeightAt(xs[i], zs[i]);
      ys[0] = heightAt(clamp(xs[0], -HALF, HALF), clamp(zs[0], -HALF, HALF), true, true);
      for (let i = 1; i <= ROAD_EXIT_STEPS; i++) {
        let sum = 0, count = 0;
        for (let k = Math.max(1, i - 2); k <= Math.min(ROAD_EXIT_STEPS, i + 2); k++) { sum += raw[k]; count++; }
        const grade = ROAD_EXIT_STEP_M * 0.07;
        ys[i] = clamp(sum / count, ys[i - 1] - grade, ys[i - 1] + grade);
      }
      exits.push({ xs, zs, ys, ss, length: ss[ROAD_EXIT_STEPS], minX: line.minX, maxX: line.maxX, minZ: line.minZ, maxZ: line.maxZ });
    }
    return exits;
  }
  /** The nearest exit line to (x, z): signed lateral offset (m, + to the line's left), grade there and distance along. */
  const _exitHit = { exit: -1, offset: 0, y: 0, along: 0 };
  function nearestRoadExit(x: number, z: number, reach: number): typeof _exitHit {
    const exits = roadExits(), hit = _exitHit;
    hit.exit = -1; let best = reach;
    for (let e = 0; e < exits.length; e++) {
      const ex = exits[e];
      if (x < ex.minX - reach || x > ex.maxX + reach || z < ex.minZ - reach || z > ex.maxZ + reach) continue;
      for (let i = 0; i < ROAD_EXIT_STEPS; i++) {
        const ax = ex.xs[i], az = ex.zs[i], bx = ex.xs[i + 1] - ax, bz = ex.zs[i + 1] - az;
        const l2 = bx * bx + bz * bz;
        const t = clamp(((x - ax) * bx + (z - az) * bz) / l2, 0, 1);
        const px = x - (ax + bx * t), pz = z - (az + bz * t);
        const d = Math.hypot(px, pz);
        if (d >= best) continue;
        best = d; hit.exit = e;
        hit.offset = (bx * pz - bz * px) >= 0 ? d : -d;
        hit.y = ex.ys[i] + (ex.ys[i + 1] - ex.ys[i]) * t;
        hit.along = ex.ss[i] + ROAD_EXIT_STEP_M * t;
      }
    }
    return hit;
  }
  function outlandHeightAt(x: number, z: number): number {
    const h = outlandBaseHeightAt(x, z);
    const hit = nearestRoadExit(x, z, ROAD_EXIT_REACH_M);
    if (hit.exit < 0) return h;
    const exit = _roadExits![hit.exit];
    const w = (1 - smoothstep(5, 30, Math.abs(hit.offset))) * (1 - smoothstep(exit.length * 0.62, exit.length, hit.along));
    return h + (hit.y - h) * w;
  }
  /** The ring's carriageway attribute at (x, z): [signed offset from the exit line (m), presence 0..1]. */
  function roadExitAt(x: number, z: number, out: [number, number]): [number, number] {
    out[0] = 0; out[1] = 0;
    const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - HALF;
    if (edgeOut < -2) return out;
    const hit = nearestRoadExit(x, z, 40);
    if (hit.exit < 0) return out;
    const exit = _roadExits![hit.exit];
    out[0] = hit.offset;
    // the carriageway fades where the ring hands its continued ground over to the authored ranges (gauntlet wave 1,
    // Cinder Junction: an exit drawn on up a range's face read as a road climbing the backdrop)
    out[1] = smoothstep(-2, 6, edgeOut) * (1 - smoothstep(exit.length * 0.55, exit.length * 0.95, hit.along))
      * smoothstep(0.45, 0.9, border.handOverAt(x, z));
    return out;
  }

  /**
   * The exits as they lie on a built ring (its vertices' `positions` and `heights`). Each ends at the foot of the ranges —
   * the nearest point along it where a ring vertex within ROAD_EXIT_FOOT_REACH_M of its line stands off its continued
   * ground (horizonSurface.ts continuedGroundAt, the ring's own law) by more than ROAD_EXIT_FOOT_M — narrowing and fading
   * over the ROAD_EXIT_TAPER_M before it, so a road runs out where the ground starts to rise instead of being painted up
   * a face (the mountains lane, 2026-10-03: with the ranges' pass turned off at Frosthollow's north exit the carriageway
   * climbed ~300 m of the massif). The vertices themselves are compared, not the surface between them, which cannot
   * follow the corridor's cut and fill across the line. Where the ranges open a pass for an exit (horizon.ts) the ring
   * lies on the road's ground and the exit runs on. `at` is the carriageway attribute (roadExitAt's) on that ring; `lines`
   * the exit lines cut at their ends, for what stands along a road (the villages, the avenues).
   */
  const ROAD_EXIT_FOOT_M = 1.5, ROAD_EXIT_FOOT_REACH_M = 12, ROAD_EXIT_TAPER_M = 100;
  function roadExitOnRing(ring: { positions: ArrayLike<number>; heights: ArrayLike<number> }): RoadExitsOnRing {
    const exits = roadExits();
    const ground = { getHeightAt, getOutlandHeightAt: publicOutlandHeightAt };
    const feet = new Float64Array(exits.length).fill(Infinity);
    if (exits.length) {
      for (let i = 0; i < ring.heights.length; i++) {
        const x = ring.positions[i * 3], z = ring.positions[i * 3 + 2];
        if (Math.max(Math.abs(x), Math.abs(z)) < HALF + 2) continue;
        const hit = nearestRoadExit(x, z, ROAD_EXIT_FOOT_REACH_M);
        if (hit.exit < 0 || hit.along >= feet[hit.exit]) continue;
        if (Math.abs(ring.heights[i] - continuedGroundAt(ground, x, z)) > ROAD_EXIT_FOOT_M) feet[hit.exit] = hit.along;
      }
    }
    const lines = exits.map((exit, e) => {
      const foot = feet[e];
      if (!Number.isFinite(foot)) return { xs: exit.xs, zs: exit.zs, length: exit.length };
      // the line as far as its end (with the 40 m step the end falls in)
      const keep = Math.min(ROAD_EXIT_STEPS, Math.ceil(foot / ROAD_EXIT_STEP_M)) + 1;
      return { xs: exit.xs.slice(0, keep), zs: exit.zs.slice(0, keep), length: Math.min(exit.length, foot) };
    });
    return {
      at(x: number, z: number, out: [number, number]): [number, number] {
        roadExitAt(x, z, out);
        if (out[1] <= 0) return out;
        // (roadExitAt leaves its nearest exit in _exitHit)
        const foot = feet[_exitHit.exit];
        if (Number.isFinite(foot)) out[1] *= 1 - smoothstep(foot - ROAD_EXIT_TAPER_M, foot, _exitHit.along);
        return out;
      },
      lines,
    };
  }

  /**
   * The ring's ballast attribute at (x, z): [signed offset from a railway's open line (m), presence 0..1]. The offset is
   * kept 40 m either side of the line (and 40 m before and past it) even where the presence is 0, so a ring triangle
   * that straddles the line interpolates the true offset (the ring's faces are 8-20 m across). Given the ring's own
   * height there (`surfaceY`), the ballast also fades where the ring leaves the line's bed — where the ranges' foot
   * blends into the continued ground, a line painted on would climb the backdrop.
   */
  function railExitAt(x: number, z: number, out: [number, number], surfaceY = Number.NaN): [number, number] {
    out[0] = 0; out[1] = 0;
    if (!railCuttings || !railOpenLines) return out;
    const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - HALF;
    if (edgeOut < -40) return out;
    let reach = 40;
    for (const cut of railCuttings) {
      const dx = x - cut.ex, dz = z - cut.ez, past = dx * cut.ux + dz * cut.uz;
      if (past < -40 || past > RAIL_OPEN_RUN_M + 40) continue;
      const lateral = dx * -cut.uz + dz * cut.ux;
      if (Math.abs(lateral) >= reach) continue;
      reach = Math.abs(lateral);
      out[0] = lateral;
      // fading where the ring hands its continued ground over to the ranges, as a road exit does
      out[1] = smoothstep(-2, 6, edgeOut) * (1 - smoothstep(RAIL_OPEN_RUN_M * 0.55, RAIL_OPEN_RUN_M * 0.9, past))
        * smoothstep(0.45, 0.9, border.handOverAt(x, z));
    }
    if (out[1] > 0 && Number.isFinite(surfaceY)) {
      const bed = railCuttingHeight(railCuttings, railCuttingPortalYs, x, z, outlandHeightAt(x, z), railOpenLines);
      out[1] *= 1 - smoothstep(0.6, 2.0, Math.abs(surfaceY - bed));
    }
    return out;
  }

  function heightAt(
    x: number,
    z: number,
    padsOn: boolean,
    roadsOn: boolean,
    lakesOn = true,
  ): number {
    x = clamp(x, -HALF, HALF); z = clamp(z, -HALF, HALF);
    // These three grids share a position and cell. Keep the original clamp and
    // interpolation order; portal-plane samples have independent coordinates.
    const gx = clamp((x + HALF) / CELL, 0, GN - 1.0001);
    const gz = clamp((z + HALF) / CELL, 0, GN - 1.0001);
    const x0 = gx | 0, z0 = gz | 0, fx = gx - x0, fz = gz - z0;
    const gridIndex = z0 * GN + x0;
    const cw = sampleHeightGridCell(gCorridor, GN, gridIndex, fx, fz);
    // Reuse this single distance sample for rim/shoulder support and the
    // final road constraints. Inward pilots also need it when constructing
    // pre-road node heights; no new distance grid or live geometric query.
    const rd = sampleRoadSupportDistance(roadsOn, boundedRoadCorridor, gRoadDist, GN, gridIndex, fx, fz);
    const vm = villageMask(x, z);
    const surfaces = lakesOn ? liquidSurfaces : null;
    const index = surfaces ? liquidIndex : null;
    const bucket = index ? liquidMarshIndexBucket(x, z, MAP_SIZE, liquidIndexWords) : 0;
    let word = 0, bits = index ? index[bucket] : 0;
    let h = surfaces ? 0 : baseTerrainHeight(x, z, cw, vm);
    let liquidDip = 0;
    let sorDig = 0, sorPanW = 0, sorCalmW = 0, sorStation = -1;
    let marshW = 0;
    let waterWeight = 0, waterLevelSum = 0, waterWeightSum = 0;
    let waterCoreSum = 0, waterCoreCount = 0;
    for (let mi = 0; mi < _MARSHES.length; mi++) {
      if (index) {
        while (!bits && ++word < liquidIndexWords) bits = index[bucket + word];
        if (!bits) break;
        const bit = bits & -bits;
        mi = word * 32 + 31 - Math.clz32(bit);
        bits ^= bit;
      }
      const m = _MARSHES[mi];
      const surfaceOffset = mi * LIQUID_MARSH_STRIDE;
      const bankBand = surfaces ? surfaces[surfaceOffset + 3] : 1;
      const md = shorelineDistance(m, x, z, bankBand);
      if (m.sorFlat !== undefined) {
        // maps lane B (2026-10-03): a sor station — its pan's dig (applied with the fill after the micro relief, below)
        // and the micro relief's calm over the station and its apron; no marsh dip, no hold on the landforms
        const sd = md < 1 ? md : shorelineDistance(m, x, z, 1 + SOR_APRON);
        if (sd < 1) {
          const u = Math.min(1, (1 - sd) / SOR_BANK), pan = u * u;
          sorDig = Math.max(sorDig, m.dip * pan);
          if (pan > sorPanW || sorStation < 0) { sorPanW = pan; sorStation = mi; }
        }
        if (sd < 1 + SOR_APRON) sorCalmW = Math.max(sorCalmW, 1 - smoothstep(1, 1 + SOR_APRON, sd));
      } else if (md < 1) {
        const t = 1 - md;
        const dip = m.dip * t * t * (3 - 2 * t);
        if (surfaces) liquidDip += dip;
        else h -= dip; // retain the original dry/frozen arithmetic order
        marshW = Math.max(marshW, t);
      }
      if (surfaces && md < bankBand) {
        const weight = smoothstep(bankBand, LIQUID_MARSH_CORE, md);
        const level = surfaces[surfaceOffset]
          + surfaces[surfaceOffset + 1] * x + surfaces[surfaceOffset + 2] * z;
        waterWeight = Math.max(waterWeight, weight);
        // Bank-only neighbors must lose influence continuously as this sheet
        // reaches its flat core. Plain normalized weights left a height jump
        // when switching from an overlapping bank average to the core level.
        const priority = weight / Math.max(1e-9, 1 - weight);
        waterWeightSum += priority; waterLevelSum += level * priority;
        if (md <= LIQUID_MARSH_CORE) { waterCoreSum += level; waterCoreCount++; }
      }
    }
    if (waterCoreCount) {
      // All base/micro/macro relief is overwritten by a fully flat core.
      // Keep the canonical lake, pad and road constraints, without spending
      // thirteen simplex evaluations on a value that cannot reach the mesh.
      return applyHeightConstraints(x, z, waterCoreSum / waterCoreCount, 1, vm,
        lakesOn, padsOn, roadsOn, gridIndex, fx, fz, 0, rd);
    }
    if (surfaces) h = baseTerrainHeight(x, z, cw, vm) - liquidDip;
    // map-specific macro forms: long ridged sand dunes / flat-topped mesas —
    // both attenuated on drive corridors and in the village so play flows.
    // r9 SPAWN CLEARANCE: macro landforms also fade out around every spawn
    // pad — a mesa wall rising through the 9-22 m pad blend used to notch a
    // flat shelf into the cliff face with the spawned tank half-EMBEDDED in
    // the rock (desert establishing shot: green hull sunk in the mesa flank).
    h = applyMacroTerrain(x, z, h, cw, vm, marshW);
    // tactical micro-terrain: berm crests + shallow scrapes every ~70-110 m so
    // the open midfield offers hull-down folds instead of a flat golf course.
    // Attenuated (not zeroed) on drive corridors so they stay drivable, and
    // suppressed in the village/marshes.
    {
      const f1 = noi.noise(x * 0.0104 + 610, z * 0.0104 - 320);
      const f2 = noi.noise(x * 0.0233 - 105, z * 0.0233 + 77);
      let crest = 1 - Math.abs(f1);
      crest *= crest;
      let micro = smoothstep(0.42, 0.92, crest) * (2.1 + f2 * 0.8) // berms/ridgelines
        - smoothstep(0.55, 0.92, f2) * 1.5;                        // shallow depressions
      micro *= (1 - cw * 0.55) * (1 - vm) * (1 - Math.max(marshW, sorCalmW)) * T.microScale;
      // the map-revival lane (2026-10-05): a terrace zone's benches are level — its berms and scrapes stand down
      const tz = terraceZones.length ? terraceZoneWeight(terraceZones, x, z) : null;
      if (tz) micro *= 1 - 0.85 * tz.weight;
      h += micro;
      if (tz) h = applyTerraces(tz, x, z, h, cw, vm, marshW);
    }
    // r3 terrain_environment: near-field micro-relief — 3-8 m humps, scrapes
    // and settling (~10-25 cm) so the ground stops reading as a smooth
    // blanket under every prop and tank. Small enough not to disturb play;
    // suppressed in the village and softened in marshes. Roads/pads flatten
    // over it via their blends below.
    {
      const m1 = noi.noise(x * 0.143 + 88, z * 0.143 - 141);
      const m2 = noi.noise(x * 0.317 - 260, z * 0.317 + 33);
      h += (m1 * 0.16 + m2 * 0.07) * (1 - vm) * (1 - Math.max(marshW * 0.7, sorCalmW)) * T.microScale;
    }
    // maps lane B (2026-10-03): a sor — its pan dug, and everything under its flat's level filled dead flat to it
    if (sorStation >= 0) {
      h -= sorDig;
      const level = sorLevel(sorStation);
      if (h < level) h = level;
    }
    const borderRadius = Math.max(Math.abs(x), Math.abs(z));
    // the map-borders lane (2026-10-03): the rim lift is the border landform's (borderLandform.ts) — inside the playable
    // square the classic S-curve, only ever lowered; past it, the outland's hills. Authoring queries (roads off: road
    // node grades, lake levels, marsh and lake banks, bridge beds) keep the classic rim, so every water level and every
    // grade inside 430 m is what it was; the road grades past it take a second authoring pass on the landform's rim
    // (buildRoadElevationGrid) — the first pass kept them on the classic rim, so a road authored up the old 20-40 m rim
    // stood on a causeway that high where the land beside it came down (67 of the 223 road exits over 5 m, Ruin Spires'
    // and Olympus Basin's 25-33 m at the edge).
    const rimLift = roadsOn || authoringOnLandform ? border.liftAt(x, z, borderRadius) : classicRimLift(borderRadius);
    const rimKeep = rimLift > 0 ? coastRimKeep(x, z) : 1;
    // CW also contains old deployment lanes. Only the two inward pilots
    // limit the new earthwork to actual road shoulders, with a smooth join.
    const roadCorridorWeight = roadCorridorDistanceWeight(boundedRoadCorridor, cw, rd);
    // Keep the pilot's exact pre-road opening when authoring node heights.
    // Final inward-pilot queries retain the rim here: the road-plane blend
    // below already grades it once. Other maps retain the R3 composition.
    // Round 47 (2026-09-23, owner: "evident right angle with shore and water at the border"): the square rim lift is a
    // Chebyshev square, so inside a bay's bank band it forced the waterline parallel to the red line and raised a wall
    // where the shore should run on; the lift yields to the water weight, so the shore keeps the bay's own contour.
    h += rimLift * (1 - waterWeight) * rimKeep * roadRimWeight(borderCorridorStart, roadsOn, boundedRoadCorridor, cw, roadCorridorWeight);
    // the foreground clearance past the red line (final queries; the road plane below comes down with its ground)
    const clearance = roadsOn && borderRadius > 470 ? clearanceReduction(x, z, h, rd) * (1 - waterWeight) : 0;
    h -= clearance;
    // The road grades past 430 m are authored on the landform's rim (buildRoadElevationGrid's second pass), so a final
    // query's road plane comes down only with the foreground clearance (a road's own band is exempt from it:
    // clearanceReduction) — past the red line at most on a gentle ramp (level at the line, 12 % from 20 m on), so no
    // road drops off the square's edge
    let roadRimShift = -clearance;
    if (roadRimShift < 0 && borderRadius > 470) {
      const over = borderRadius - 470;
      roadRimShift = Math.max(roadRimShift, -0.12 * (over < 20 ? (over * over) / 40 : over - 10));
    }
    if (waterWeight > 0) {
      const target = waterLevelSum / waterWeightSum;
      h += (target - h) * waterWeight;
      marshW = Math.max(marshW, waterWeight); // road berm noise cannot ripple liquid cores
    }
    // frozen/ice lakes: pull the terrain to a flat sheet at the lake level.
    // The flat sheet runs almost to the shore (0.94 r), and the grade toward
    // the surrounding terrain extends well OUTSIDE the sheet (1.32 r): the
    // lake level tracks the lowest shore, so on the uphill side the raw
    // terrain can sit 10+ m above the sheet — graded over ~35 m that is a
    // snowy bank; over the old few-meter band it was a sheer quarry wall.
    const borderShoulderWeight = roadShoulderWeight(borderCorridorStart, cfg?.id,
      roadsOn, borderRadius, cw, roadCorridorWeight);
    h = applyHeightConstraints(x, z, h, marshW, vm, lakesOn, padsOn, roadsOn, gridIndex, fx, fz,
      borderShoulderWeight, rd, roadRimShift);
    if (quarryFloorY !== null && insideCopperQuarry(x, z)) {
      h = sampleCopperQuarrySurface(x, z, h, quarryFloorY, gridSample(gRoadDist, x, z));
    }
    // Frontline Assault trenches: carved after every road, pad and lake
    // constraint so the cut survives road grading (a road meets a real ditch),
    // never into water or under the settlement.
    const trenches = trenchPlan();
    if (trenches) {
      const carve = assaultTrenchCarveDepth(x, z, trenches);
      if (carve > 0) h -= carve * (1 - vm) * (1 - marshW);
    }
    // field trenches (2026-09-17) are dug after the roads and pads exist: only final queries see the carve
    if (roadsOn && padsOn) {
      const fieldTrenches = fieldTrenchPlan();
      if (fieldTrenches) {
        const carve = assaultTrenchCarveDepth(x, z, fieldTrenches);
        if (carve > 0) h -= carve * (1 - vm) * (1 - marshW);
      }
    }
    // round 63: the rail cutting is dug last, through the rim band and every constraint above, on final queries only
    if (railCuttingsOn && roadsOn && padsOn && !railCuttingsSuspended) {
      h = railCuttingHeight(railCuttings!, railCuttingPortalYs, x, z, h, railOpenLines);
    }
    return h;
  }

  /**
   * The map-revival lane (2026-10-05, Orchard Valley's terraces): the ground inside a terrace zone stepped into contour
   * benches. The levels are absolute (a bench every `stepM` of height), so the benches follow the contours; each riser
   * takes the share of its step the slope needs to stand no steeper than `riserGrade` (a smoothstep through the top of the
   * step), so on a gentle slope the benches are wide and on a steep one narrow. The steps fade on level ground (the smooth
   * relief's grade, base and landforms, under `minGrade`) and where the landforms are held back — the drive corridors, the
   * settlement, the marshes.
   */
  function applyTerraces(tz: TerraceZoneHit, x: number, z: number, h: number, cw: number, vm: number, marshW: number): number {
    const zone = tz.zone;
    const protect = (1 - cw * 0.85) * (1 - vm) * (1 - marshW);
    if (protect <= 0.001) return h;
    const smooth = (px: number, pz: number) => applyMacroTerrain(px, pz, baseTerrainHeight(px, pz, cw, vm), cw, vm, marshW);
    const h0 = smooth(x, z);
    const grade = Math.hypot(smooth(x + 2, z) - h0, smooth(x, z + 2) - h0) / 2;
    const w = tz.weight * protect * smoothstep(zone.minGrade, zone.fullGrade, grade);
    if (w <= 0.001) return h;
    const r = clamp(grade / zone.riserGrade, 0.12, 0.85);
    const t = h / zone.stepM, k = Math.floor(t), f = t - k;
    const stepped = (k + smoothstep(1 - r, 1, f)) * zone.stepM;
    return h + (stepped - h) * w;
  }

  function baseTerrainHeight(x: number, z: number, corridorWeight: number, settlementWeight: number): number {
    const { d, s } = core(x, z);
    let h = (d + (s - d) * (corridorWeight * 0.72)) * T.hillScale;
    // Keep authored town relief and the existing dry/frozen operation order.
    if (settlementWeight > 0) h += (villageY * T.hillScale
      + (s - villageY) * (_VILLAGE.relief ?? 0.10) - h) * settlementWeight;
    return h;
  }

  function smoothRoadElevations(nodeElev: number[][]): void {
    if (usesPhysicalRoadStations(cfg?.id)) { smoothRoadGradesByDistance(inheritedRoads ?? roads, nodeElev); return; }
    for (const elev of nodeElev) {
      for (let pass = 0; pass < 4; pass++) {
        const prev = elev.slice();
        for (let i = 1; i < elev.length - 1; i++) {
          elev[i] = prev[i - 1] * 0.25 + prev[i] * 0.5 + prev[i + 1] * 0.25;
        }
      }
    }
  }
  const _junctionScratch = [0, 0, 1e9];
  function findRoadJunction(ra: number, rb: number, gradeRoads: RoadLine[] = roads): number[] {
    let jA = 0, jB = 0, best = 1e9;
    for (let a = 0; a < gradeRoads[ra].length; a++) for (let b = 0; b < gradeRoads[rb].length; b++) {
      const dd = Math.hypot(gradeRoads[ra][a][0] - gradeRoads[rb][b][0], gradeRoads[ra][a][1] - gradeRoads[rb][b][1]);
      if (dd < best) { best = dd; jA = a; jB = b; }
    }
    _junctionScratch[0] = jA;
    _junctionScratch[1] = jB;
    _junctionScratch[2] = best;
    return _junctionScratch;
  }
  function blendRoadJunctions(nodeElev: number[][], gradeRoads: RoadLine[] = roads): void {
    if (usesPhysicalRoadStations(cfg?.id)) { blendRoadNetworkGrades(gradeRoads, nodeElev); return; }
    // Blend every road pair to a common elevation at their crossing.
    for (let ra = 0; ra < gradeRoads.length; ra++) for (let rb = ra + 1; rb < gradeRoads.length; rb++) {
      const [jA, jB, best] = findRoadJunction(ra, rb, gradeRoads);
      if (best > 40) continue; // roads never actually cross
      const jElev = (nodeElev[ra][jA] + nodeElev[rb][jB]) * 0.5;
      for (let k = -3; k <= 3; k++) {
        const w = (1 - Math.abs(k) / 4) * 0.85;
        if (nodeElev[ra][jA + k] !== undefined) nodeElev[ra][jA + k] += (jElev - nodeElev[ra][jA + k]) * w;
        if (nodeElev[rb][jB + k] !== undefined) nodeElev[rb][jB + k] += (jElev - nodeElev[rb][jB + k]) * w;
      }
    }
  }
  // 2026-10-02 (maps lane B, Aegis Crossing): a dry viaduct's road rides its deck, not the gorge bed under it. Its nodes
  // over the span take the line between the ground just beyond the two abutments before the grading runs, or the
  // smoothing drags the road into the gorge's lips on both sides of the bridge. Like the northern-grade alignments it
  // is a finished-road law, so the construction-only placement sampler keeps the original grading.
  function levelViaductSpanNodes(gradeRoads: RoadLine[], nodeElev: number[][]): void {
    for (const bridge of T.bridges ?? []) {
      const nodes = gradeRoads[bridge.route], elev = nodeElev[bridge.route];
      if (!nodes || !elev) continue;
      const a = bridge.yawDeg * Math.PI / 180, ux = Math.cos(a), uz = Math.sin(a);
      const halfLength = bridge.spanM / 2, end = halfLength + 4;
      const y0 = heightAt(bridge.x - ux * end, bridge.z - uz * end, false, false);
      const y1 = heightAt(bridge.x + ux * end, bridge.z + uz * end, false, false);
      for (let i = 0; i < nodes.length; i++) {
        const dx = nodes[i][0] - bridge.x, dz = nodes[i][1] - bridge.z, along = dx * ux + dz * uz;
        if (Math.abs(along) > halfLength || Math.abs(dx * uz - dz * ux) > bridge.widthM / 2) continue;
        elev[i] = y0 + (y1 - y0) * (along + end) / (2 * end);
      }
    }
  }
  function buildRoadElevationGrid(): void {
    const authoringRoads = inheritedRoads ?? roads;
    const nodeElev = authoringRoads.map((nodes) => nodes.map(([nx, nz]) => heightAt(nx, nz, false, false)));
    if (!placementOnly && T.bridges?.length) levelViaductSpanNodes(authoringRoads, nodeElev);
    // the map-borders lane (wave 2): the same law run a second time on the landform's rim; from 430 m, where the rim
    // begins, the grades follow it (blended in by 460 m below), inside it every grade is the classic pass's to the bit
    authoringOnLandform = !placementOnly;
    const rimElev = placementOnly ? null : authoringRoads.map((nodes) => nodes.map(([rx, rz]) => heightAt(rx, rz, false, false)));
    authoringOnLandform = false;
    if (rimElev) levelViaductSpanNodes(authoringRoads, rimElev);
    // (the landform pass's portal tails continue the authored grade to the edge — gradeRoadPortals' shallow cut through
    // the classic rim's berm — and where that grade climbs over the landform's own ground the tail comes down to it, at
    // most 1.5 m over it: the road leaves the square on the land, not on a causeway; a cut is kept. A classic border is
    // the rim the grades were authored on, so its tails stand as authored.)
    const capPortalTails = (elev: number[][], lines: readonly (readonly RoadPoint[])[]): void => {
      if (border.settings.classic) return;
      authoringOnLandform = true;
      for (let r = 0; r < lines.length; r++) {
        const row = elev[r], nodes = lines[r];
        let capped = false;
        for (let i = 0; i < nodes.length; i++) {
          const [tx, tz] = nodes[i];
          if (Math.max(Math.abs(tx), Math.abs(tz)) < 430) continue;
          const land = heightAt(tx, tz, false, false) + 1.5;
          if (row[i] > land) { row[i] = land; capped = true; }
        }
        // ... at a grade a tank can drive: where the cap drops the tail faster than 15 %, the nodes come back up to it
        if (!capped) continue;
        for (let pass = 0; pass < 2; pass++) for (let k = 1; k < nodes.length; k++) {
          const i = pass ? nodes.length - 1 - k : k, j = pass ? i + 1 : i - 1;
          const run = Math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1]);
          row[i] = Math.max(row[i], row[j] - 0.15 * run);
        }
      }
      authoringOnLandform = false;
    };
    if (!placementOnly && !inheritedRoads && T.roads !== 'country' && T.roads.paths) {
      const offset = T.roads.grid ? T.roads.grid.xs.length + T.roads.grid.zs.length : 0;
      gradeRoadPortals(cfg?.id, roads, nodeElev, T.roads.paths, offset);
      if (rimElev) { gradeRoadPortals(cfg?.id, roads, rimElev, T.roads.paths, offset); capPortalTails(rimElev, roads); }
    }
    smoothRoadElevations(nodeElev);
    if (rimElev) smoothRoadElevations(rimElev);
    blendRoadJunctions(nodeElev, authoringRoads);
    if (rimElev) blendRoadJunctions(rimElev, authoringRoads);
    if (inheritedRoads) {
      borderCorridorStart = buildRoadBorderCorridors();
      boundedRoadCorridor = borderCorridorStart !== null && usesBoundedRoadShoulders(cfg?.id);
      remapInheritedRoadElevations(inheritedRoads, roads, nodeElev);
      if (rimElev) remapInheritedRoadElevations(inheritedRoads, roads, rimElev);
      if (T.roads !== 'country' && T.roads.paths) {
        const offset = T.roads.grid ? T.roads.grid.xs.length + T.roads.grid.zs.length : 0;
        gradeRoadPortals(cfg?.id, roads, nodeElev, T.roads.paths, offset);
        if (rimElev) { gradeRoadPortals(cfg?.id, roads, rimElev, T.roads.paths, offset); capPortalTails(rimElev, roads); }
      }
      alignAddedRoadJunctionGrades(cfg?.id, inheritedRoads, roads, nodeElev);
      if (rimElev) alignAddedRoadJunctionGrades(cfg?.id, inheritedRoads, roads, rimElev);
    }
    if (!placementOnly) {
      alignFjordNorthernRoadGrades(cfg?.id, roads, nodeElev);
      alignCopperNorthernRoadGrades(cfg?.id, roads, nodeElev);
      alignPoldersNorthernRoadGrades(cfg?.id, roads, nodeElev);
    }
    if (rimElev) {
      alignFjordNorthernRoadGrades(cfg?.id, roads, rimElev);
      alignCopperNorthernRoadGrades(cfg?.id, roads, rimElev);
      alignPoldersNorthernRoadGrades(cfg?.id, roads, rimElev);
      for (let r = 0; r < roads.length; r++) for (let i = 0; i < roads[r].length; i++) {
        const w = smoothstep(430, 460, Math.max(Math.abs(roads[r][i][0]), Math.abs(roads[r][i][1])));
        if (w > 0) nodeElev[r][i] += (rimElev[r][i] - nodeElev[r][i]) * w;
      }
    }
    for (let i = 0; i < GN * GN; i++) {
      const e = nodeElev[gSegRoad![i]];
      const s = gSegIdx![i];
      gRoadElev[i] = e[s] + (e[s + 1] - e[s]) * gSegT![i];
    }
  }
  // --- road node elevations: pre-road height sampled + smoothed + junction blend ---
  buildRoadElevationGrid();
  inheritedRoads = null;
  function alignRoadHardstands(): void {
    if (!T.hardstands?.length) return;
    stampHardstandRoadGrids(T.hardstands, gRoadDist, gRoadElev, GN, MAP_SIZE,
      (x, z) => gridSample(gRoadElev, x, z));
    if (!placementOnly && T.roads !== 'country' && T.roads.paths && hardstandNoVeg) {
      const offset = T.roads.grid ? T.roads.grid.xs.length + T.roads.grid.zs.length : 0;
      alignHardstandRoadPortals(cfg?.id, roads, T.roads.paths, offset, {
        size: GN, mapSize: MAP_SIZE, route: gSegRoad!, segment: gSegIdx!,
        elevation: gRoadElev, sample: (x, z) => gridSample(gRoadElev, x, z),
      }, hardstandNoVeg);
    }
  }
  alignRoadHardstands();

  // Allocation-site WeakRef/GC proof shows these construction-only arrays
  // otherwise stay in the live heightAt closure context (528392 bytes).
  // Their last consumer is final-priority hardstand/portal alignment above.
  gSegRoad = null; gSegIdx = null; gSegT = null;

  // --- lake sheet levels (pipeline without lakes/pads), then spawn pads ---
  function initializeLakeLevels(): void {
    for (let li = 0; li < _LAKES.length; li++) {
      const lk = _LAKES[li];
      let lo = Infinity;
      // sample the SHORELINE ring (not 0.6 r): the sheet sits just below the
      // lowest bank point, so bank height stays ~depth everywhere instead of
      // stacking the full cross-lake terrain drop onto the near shore
      for (let a = 0; a < 12; a++) {
        const angle = a * Math.PI / 6;
        const radius = shorelineRadiusAt(lk, angle) * 0.95;
        const hh = heightAt(lk.x + Math.cos(angle) * radius,
          lk.z + Math.sin(angle) * radius, false, false, false);
        if (hh < lo) lo = hh;
      }
      // maps r1 (ADDITIVE): lk.level pins the sheet elevation absolutely — a
      // multi-circle SEA must share one waterline (per-circle auto levels step
      // where the sheets overlap). Default stays the auto shoreline formula.
      lakeLevels[li] = lk.level ?? (Math.min(lo, heightAt(lk.x, lk.z, false, false, false)) - (lk.depth ?? 1.4));
    }
  }
  function initializeSpawnPadLevels(): void {
    for (let p = 0; p < padPts.length; p++) {
      padYs[p] = heightAt(padPts[p].x, padPts[p].z, false, true);
    }
  }
  initializeLakeLevels();
  initializeSpawnPadLevels();
  // Freeze authored road/pad support first, then resolve liquid joins in the
  // existing buffer. Frozen sheets retain their original independent levels.
  if (liquidWater && _LAKES.length) alignLiquidLakeLevels(_LAKES, lakeLevels);
  const liquidLakes = liquidWater ? _LAKES.map((lake, index) => ({ ...lake, level: lakeLevels[index] })) : [];
  if (liquidWater && _MARSHES.length) {
    // Fit against the old dry/road/pad pipeline before activating the policy.
    // Roads and spawn pads keep their original levels and final priority.
    liquidSurfaces = buildLiquidMarshSurfaces(_MARSHES,
      (x, z) => heightAt(x, z, false, false, false),
      liquidLakes);
    liquidIndex = buildLiquidMarshIndex(_MARSHES, liquidSurfaces, MAP_SIZE);
  }
  if (liquidLakes.length) {
    // Activate after road/pad heights are fixed. Sample the same pre-sheet
    // terrain as the marsh policy; tiny connected drainage cells must not
    // cram a multi-metre bank into the fixed ice lake's 0.38-radius apron.
    liquidLakeBanks = buildLiquidLakeBanks(liquidLakes,
      (x, z) => heightAt(x, z, false, false, false));
  }

  // Round 61 (2026-09-24, Amberford's bridge over the river): a marsh station authored `crossing: 'bridge'` carries
  // its road over the water on a deck instead of through the 14–18 m dry band. Resolved once the road plane and the
  // liquid surfaces are frozen: the deck centre is the road's nearest point to the station and its axis the road
  // bearing there; the span is the river's own wet reach along that axis (the liquid union before the dry band, marched
  // at 0.25 m) plus an abutment at each end; the plane is the road plane lifted clear of the water surface by the
  // authored clearance. Under the span heightAt keeps the river bed and waterWetnessAt keeps the river (bridgeTermsAt);
  // over each approach the road plane grades to the deck at no more than 7 % (the same length on both sides: the
  // steeper side's). A station without a road inside its radius is an authoring error and fails here rather than
  // silently drying a crossing.
  function resolveBridgeDecks(): readonly BridgeDeckPlane[] {
    const decks: BridgeDeckPlane[] = [];
    for (const station of _MARSHES) {
      if (station.crossing !== 'bridge') continue;
      let best = Infinity, cx = station.x, cz = station.z, ux = 1, uz = 0, route = -1;
      for (let r = 0; r < roads.length; r++) {
        const nodes = roads[r];
        for (let s = 0; s < nodes.length - 1; s++) {
          const { d, t } = segDist(station.x, station.z, nodes[s][0], nodes[s][1], nodes[s + 1][0], nodes[s + 1][1]);
          if (d >= best) continue;
          const dx = nodes[s + 1][0] - nodes[s][0], dz = nodes[s + 1][1] - nodes[s][1];
          const length = Math.hypot(dx, dz);
          if (length <= 0) continue;
          best = d; route = r; ux = dx / length; uz = dz / length;
          cx = nodes[s][0] + dx * t; cz = nodes[s][1] + dz * t;
        }
      }
      if (best > station.r) throw new Error(`bridge station at ${station.x},${station.z} has no road inside its radius`);
      let reach = 0;
      for (const sign of [-1, 1]) {
        for (let along = 0; along <= station.r * 2; along += 0.25) {
          if (sampleShorelineMask(_MARSHES, _LAKES, cx + ux * along * sign, cz + uz * along * sign) > waterRampStart) {
            reach = Math.max(reach, along);
          }
        }
      }
      const halfLength = reach + BRIDGE_ABUTMENT_M;
      const bedY = heightAt(cx, cz, false, false);
      const waterY = bedY + liquidDepthM;
      const deckY = Math.max(gridSample(gRoadElev, cx, cz), waterY + (station.deckClearM ?? BRIDGE_DECK_CLEAR_M));
      let approachM = BRIDGE_APPROACH_MIN_M;
      for (const sign of [-1, 1]) {
        const rise = Math.abs(deckY - gridSample(gRoadElev, cx + ux * halfLength * sign, cz + uz * halfLength * sign));
        approachM = Math.max(approachM, Math.min(BRIDGE_APPROACH_MAX_M, rise / BRIDGE_APPROACH_GRADE));
      }
      decks.push({
        x: cx, z: cz, ux, uz, route, halfLength,
        halfWidth: (station.deckWidthM ?? BRIDGE_DECK_WIDTH_M) / 2,
        deckY, bedY, waterY,
        approachM: station.approachM ?? approachM,
      });
    }
    return decks.length ? Object.freeze(decks) : EMPTY_BRIDGE_DECKS;
  }
  if (liquidWater && liquidSurfaces) bridgeDecks = resolveBridgeDecks();
  if (T.bridges?.length) {
    const authored = T.bridges.map(bridge => {
      const a = bridge.yawDeg * Math.PI / 180, ux = Math.cos(a), uz = Math.sin(a);
      const halfLength = bridge.spanM / 2;
      const bedY = heightAt(bridge.x, bridge.z, false, false);
      // A curved/noisy bank can stand higher than its road centre. Fit the
      // whole deck footprint so neither tracks nor bots meet buried rock.
      let deckY = -Infinity;
      for (let along = -halfLength; along <= halfLength; along += 2) {
        for (const across of [-bridge.widthM / 2, 0, bridge.widthM / 2]) {
          deckY = Math.max(deckY, heightAt(bridge.x + ux * along - uz * across,
            bridge.z + uz * along + ux * across, true, false));
        }
      }
      deckY += .08;
      return { ...bridge, ux, uz, halfLength, halfWidth: bridge.widthM / 2, deckY, bedY, waterY: bedY };
    });
    bridgeDecks = Object.freeze([...bridgeDecks, ...authored]);
  }

  // Freeze original road, junction, pad and water support before activating
  // this single-map excavation. No new height grid or alternate collision
  // surface: mesh, exact physics and the existing fast cache read heightAt.
  if (cfg?.id === 'copper_mesa' && T.quarryBenches) {
    quarryFloorY = heightAt(COPPER_QUARRY.x, COPPER_QUARRY.z, true, true);
  }
  // Round 63 (2026-09-24): the rail cuttings' portals read the finished authored surface — every road, pad, lake and
  // trench constraint frozen above — and the rule then applies to every final query, inside the square and past it.
  if (railCuttings !== null) {
    landformPhase = 'authored-relief';
    for (let i = 0; i < railCuttings.length; i++) {
      railCuttingPortalYs[i] = heightAt(railCuttings[i].px, railCuttings[i].pz, true, true);
    }
    railCuttingsOn = true;
    railOpenLines = railCuttings.map((cut, i) => resolveRailOpenLine(cut, railCuttingPortalYs[i], outlandHeightAt));
  }
  // Explicit second phase: all legacy support targets above are frozen.
  // Exact mesh/physics and the existing one-metre live cache share this surface.
  landformPhase = 'authored-relief';
  const getHeightAt = (x: number, z: number): number => heightAt(x, z, true, true);
  const _scratchN = new THREE.Vector3();
  const NEPS = 1.2;
  // Stop before allocating the gameplay fast cache or scanning render bounds.
  // The original Float32 road grids and analytic query arithmetic are retained.
  if (placementOnly) return {getHeightAt,getNormalAt,getGroundType,
    _roadDist:(x,z)=>gridSample(gRoadDist,x,z)};

  const getContactHeightAt = createTerrainContactSampler(getHeightAt);

  // perf-r3b (CPU profile): every height query runs the full 9-octave simplex
  // stack — a live battle makes ~3.9 k queries per FRAME (LOS ray marches, AI
  // terrain probes), ~2.4 ms of every frame on the probe box. Hot NON-GEOMETRY
  // consumers read this lazily-baked 1 m bilinear grid instead (≤ ~1 cm from
  // the analytic surface — far tighter than the rendered mesh's own 2.7 m
  // discretization of the same function). Everything that SEATS visible
  // geometry (wheel conform, spawns, staged captures, world builders) keeps
  // the exact analytic getHeightAt above, so frozen screenshot/metrology
  // contracts are untouched. Deployment tiles are warmed behind the battle
  // loading veil. A later first-touch sample evaluates only its four grid
  // vertices, not a whole 17x17 tile for every new part of a camera ray.
  // Float32 storage and bilinear operation order remain unchanged.
  const FGN = MAP_SIZE + 1;                 // 1 m verts, 1025^2 ≈ 4.2 MB
  const FTILE = 16;                          // bake granularity (cells)
  const FTN = Math.ceil(MAP_SIZE / FTILE);   // tiles per axis
  const fGrid = new Float32Array(FGN * FGN);
  const fBaked = new Uint8Array(FTN * FTN);
  // Separate validity preserves legitimate zero/NaN heights and costs one bit
  // per vertex (~128 KiB/world), not another byte-sized full-world grid.
  const vertexReady = new Uint8Array(Math.ceil(FGN * FGN / 8));
  function ensureFastVertex(gx: number, gz: number): void {
    const index = gz * FGN + gx;
    const byte = index >>> 3;
    const mask = 1 << (index & 7);
    if (vertexReady[byte] & mask) return;
    fGrid[index] = heightAt(gx - HALF, gz - HALF, true, true);
    vertexReady[byte] |= mask;
  }
  function bakeFastTile(tx: number, tz: number): void {
    const x0 = tx * FTILE, z0 = tz * FTILE;
    const x1 = Math.min(MAP_SIZE, x0 + FTILE), z1 = Math.min(MAP_SIZE, z0 + FTILE);
    for (let gz = z0; gz <= z1; gz++) {
      for (let gx = x0; gx <= x1; gx++) {
        ensureFastVertex(gx, gz);
      }
    }
    fBaked[tz * FTN + tx] = 1;
  }
  function getHeightAtFast(x: number, z: number): number {
    const gx = clamp(x + HALF, 0, MAP_SIZE - 1e-4);
    const gz = clamp(z + HALF, 0, MAP_SIZE - 1e-4);
    const x0 = gx | 0, z0 = gz | 0;
    const tx = (x0 / FTILE) | 0, tz = (z0 / FTILE) | 0;
    // Completed deployment tiles keep the existing cheap hot path. Else fill
    // exactly the four vertices read below, sharing validity across borders.
    if (!fBaked[tz * FTN + tx]) {
      ensureFastVertex(x0, z0);
      ensureFastVertex(x0 + 1, z0);
      ensureFastVertex(x0, z0 + 1);
      ensureFastVertex(x0 + 1, z0 + 1);
    }
    const fx = gx - x0, fz = gz - z0;
    const i = z0 * FGN + x0;
    const a = fGrid[i] + (fGrid[i + 1] - fGrid[i]) * fx;
    const b = fGrid[i + FGN] + (fGrid[i + FGN + 1] - fGrid[i + FGN]) * fx;
    return a + (b - a) * fz;
  }

  /**
   * Bake fast-grid tiles around known deployment points. This is a generator
   * so loading-screen callers can yield between tiles and preserve progress
   * paints on constrained devices. Each point may provide `radiusM`. A tile
   * touched only by fast reads still yields once when its remaining vertices
   * finish; only fully completed tiles may be skipped on subsequent warmup.
   */
  function* warmFastTilesAround(
    points: readonly TerrainWarmPoint[],
  ): Generator<number, void, void> {
    const queued = new Set<number>();
    for (const point of points || []) {
      if (!point) continue;
      const radius = Math.max(0, Number(point.radiusM) || 0);
      const gx0 = clamp(finiteCoord(point.x) + HALF - radius, 0, MAP_SIZE - 1e-4);
      const gz0 = clamp(finiteCoord(point.z) + HALF - radius, 0, MAP_SIZE - 1e-4);
      const gx1 = clamp(finiteCoord(point.x) + HALF + radius, 0, MAP_SIZE - 1e-4);
      const gz1 = clamp(finiteCoord(point.z) + HALF + radius, 0, MAP_SIZE - 1e-4);
      const tx0 = ((gx0 | 0) / FTILE) | 0;
      const tz0 = ((gz0 | 0) / FTILE) | 0;
      const tx1 = ((gx1 | 0) / FTILE) | 0;
      const tz1 = ((gz1 | 0) / FTILE) | 0;
      for (let tz = tz0; tz <= tz1; tz++) {
        for (let tx = tx0; tx <= tx1; tx++) queued.add(tz * FTN + tx);
      }
    }
    for (const key of queued) {
      const tx = key % FTN;
      const tz = (key / FTN) | 0;
      if (fBaked[key]) continue;
      bakeFastTile(tx, tz);
      yield key;
    }
  }

  function finiteCoord(value: number): number {
    return Number.isFinite(value) ? value : 0;
  }

  function getNormalAt(x: number, z: number): THREE.Vector3 {
    const hl = getHeightAt(x - NEPS, z), hr = getHeightAt(x + NEPS, z);
    const hd = getHeightAt(x, z - NEPS), hu = getHeightAt(x, z + NEPS);
    return _scratchN.set(hl - hr, 2 * NEPS, hd - hu).normalize();
  }

  const trackPolicy = trackSurfacePolicy(resolveSourcedTerrainPalette(cfg?.id ?? 'verdant', cfg?.splat));
  function getTrackSurfaceAt(x: number, z: number): TrackSurface {
    if (trackPolicy === 'earth') return 0;
    const roadDistance = gridSample(gRoadDist, x, z);
    if (roadDistance < 14) return 0;
    const wetness = liquidWater ? waterWetnessAt(x, z)
      : sampleShorelineMask(_MARSHES, _LAKES, x, z);
    return trackSurfaceAt(trackPolicy, roadDistance, wetness, waterRampStart, waterRampEnd);
  }

  function getGroundType(x: number, z: number): GroundType {
    if (gridSample(gRoadDist, x, z) < 4.3) return 'hard';
    if (bridgeDecks.length && bridgeDeckOver(x, z) !== null) return 'hard'; // round 61: stone across the whole deck
    for (const lk of _LAKES) {
      // maps r1 (ADDITIVE): terrain.softLakes = liquid-water sheets (coastal
      // shallows) drive as bogged 'soft' ground; default stays 'hard' (ice).
      if (shorelineDistance(lk, x, z, 0.95) < 0.95) return T.softLakes ? 'soft' : 'hard';
    }
    for (const m of _MARSHES) {
      if (shorelineDistance(m, x, z, 0.65) < 0.65) return T.frozenMarshes ? 'hard' : 'soft';
    }
    return 'medium';
  }

  function getDriveGroundType(x: number, z: number): GroundType {
    const ground = getGroundType(x, z);
    // Lake/marsh placement bands include dry sand, road shoulders and pads.
    // Release their water resistance at the same liquid boundary as wakes.
    // Ordinary bogs, ice, roads and bridge decks keep their authored traction.
    return ground === 'soft' && liquidWater && getWaterMaskAt(x, z) <= 0.02
      ? 'medium' : ground;
  }

  /**
   * Return the authored liquid-water coverage at a world-space point.
   *
   * This deliberately mirrors the sea/lake splat inputs instead of sampling
   * pixels or allocating a surface descriptor. Battle hot paths use it for
   * track wakes, so the query stays numeric, deterministic and allocation
   * free. Frozen marshes/lakes remain solid ground even when they reuse the
   * wetness channel for ice rendering.
   *
   * @returns {number} 0 for dry/ice, otherwise a 0..1 liquid coverage mask
   */
  function getWaterMaskAt(x: number, z: number): number {
    if (!liquidWater) return 0;
    const wetness = waterWetnessAt(x, z);
    // Match the material's authored water ramp, including overlapping sheets.
    // The renderer additionally rejects steep bank fragments via their normal.
    return smoothstep(waterRampStart, waterRampEnd, wetness);
  }

  function getWaterDepthAt(x: number, z: number): number {
    return liquidDepthM ? shallowWaterDepth(getWaterMaskAt(x, z), liquidDepthM) : 0;
  }

  /** Round 47: the bay contour and its water level at any point (the ring, the material bake and the apron read it). */
  function outlandWaterAt(x: number, z: number): { wetness: number; level: number } | null {
    let best = 0, level = 0;
    for (let li = 0; li < _LAKES.length; li++) {
      const wetness = shorelineWetness(_LAKES[li], x, z, true);
      if (wetness > best) { best = wetness; level = lakeLevels[li]; }
    }
    // Shore shelves and river mouths are authored as liquid marshes too. The
    // former lake-only query dropped these contributions exactly at the edge.
    if (liquidSurfaces) for (let mi = 0; mi < _MARSHES.length; mi++) {
      const wetness = shorelineWetness(_MARSHES[mi], x, z, false);
      if (wetness > best) {
        best = wetness;
        const offset = mi * LIQUID_MARSH_STRIDE;
        level = liquidSurfaces[offset] + liquidSurfaces[offset + 1] * x + liquidSurfaces[offset + 2] * z;
      }
    }
    return best > 0 ? { wetness: best, level } : null;
  }

  function waterWetnessAt(x: number, z: number): number {
    let wetness = liquidIndex
      ? sampleIndexedMarshWetness(_MARSHES, liquidIndex,
        liquidMarshIndexBucket(x, z, MAP_SIZE, liquidIndexWords), liquidIndexWords, x, z)
      : sampleShorelineMask(_MARSHES, _LAKES, x, z);
    if (liquidIndex && wetness < 1) for (const lake of _LAKES) {
      wetness = Math.max(wetness, shorelineWetness(lake, x, z, true));
      if (wetness === 1) break;
    }
    if (wetness <= 0) return 0;
    // Surface heights deliberately yield to these dry height constraints.
    // The identical callback feeds the existing mask bake and wake queries;
    // neither may paint water over the resulting ford/pad ramps.
    // round 61: under a bridge deck the river keeps its wetness — the deck, not a causeway, carries the road
    const roadDry = smoothstep(14, 18, gridSample(gRoadDist, x, z));
    wetness *= bridgeDecks.length ? roadDry + (1 - roadDry) * bridgeTermsAt(x, z).span : roadDry;
    if (wetness <= 0) return 0;
    for (const pad of padPts) {
      const dx = x - pad.x, dz = z - pad.z;
      if (dx * dx + dz * dz >= 26 * 26) continue;
      const distance = Math.hypot(dx, dz);
      if (distance < 26) wetness *= smoothstep(22, 26, distance);
    }
    return wetness;
  }

  // vegetation/prop exclusion: open water/ice + marsh cores
  function noVeg(x: number, z: number): boolean {
    if (railSpurNoVeg !== null && railSpurNoVeg(x, z)) return true; // round 57: the rail spur's berth
    // round 63: the cutting's floor, cess and faces — the daylight line is read on the ground before the cut
    if (railCuttingsOn && railCuttingExcludes(railCuttings!, railCuttingPortalYs, x, z, uncutHeightAt, T.rimH + 8, railOpenLines)) {
      return true;
    }
    for (const lk of _LAKES) {
      if (lk.radii) {
        if (shorelineDistance(lk, x, z, 1.04) < 1.04) return true;
        continue;
      }
      const dx = x - lk.x, dz = z - lk.z;
      if (dx * dx + dz * dz < (lk.r * 1.04) ** 2) return true;
    }
    for (const m of _MARSHES) {
      // maps lane B (2026-10-03): a sor station clears its crust (below), not a share of its radius
      if (m.sorFlat !== undefined) continue;
      const dx = x - m.x, dz = z - m.z;
      const distanceSquared = dx * dx + dz * dz;
      if (T.frozenMarshes && distanceSquared < m.r * m.r) return true;
      // maps r1 (ADDITIVE): river maps keep the CHANNEL clear — tufts spawned
      // mid-stream read as flooded stubble. The outer soft band keeps its
      // sparse bank reeds. Default off => pre-existing maps unchanged.
      const clearRadius = m.r * (liquidWater ? 1 : 0.55);
      if ((T.clearMarshVeg || liquidWater) && distanceSquared < clearRadius * clearRadius) return true;
    }
    // maps lane B (2026-10-03, the capture: tall grass stood in the salt): nothing grows on a sor's crust — the floor at
    // its flat's level (read on the 1 m fast grid: the tall-grass tier asks per blade) — while its damp margin keeps the
    // sward
    if (_sorStations) {
      sorPanAt(x, z);
      if (_sorPanStation >= 0 && getHeightAtFast(x, z) - sorLevel(_sorPanStation) <= 0.03) return true;
    }
    return false;
  }

  /** Round 63: the final surface with the rail cuttings suspended (the exclusion measures the cut against it). */
  function uncutHeightAt(x: number, z: number): number {
    railCuttingsSuspended = true;
    const h = heightAt(x, z, true, true);
    railCuttingsSuspended = false;
    return h;
  }

  function* measureHeightRange(): Generator<number, [number, number], void> {
    let minY = Infinity, maxY = -Infinity;
    for (let gz = 0; gz <= 128; gz++) {
      for (let gx = 0; gx <= 128; gx++) {
        const h = getHeightAt(gx * 8 - HALF, gz * 8 - HALF);
        if (h < minY) minY = h;
        if (h > maxY) maxY = h;
      }
      yield ++completedHeightSlices / totalHeightSlices;
    }
    return [minY, maxY];
  }
  // --- min/max over a coarse scan ---
  yield ++completedHeightSlices / totalHeightSlices;
  const [minY, maxY] = yield* measureHeightRange();

  // r6 terrain_environment: LANDFORM weight — 1 where the MESA field (and the
  // rocky map rim) shapes the terrain, 0 on dunes/flats. The splat shader's
  // slope-driven sandstone takeover keyed on steepness alone, so every steep
  // DUNE slip face inherited the bedded sandstone layer and rendered as
  // horizontal terracing (the "heightmap quantization" critique). Baked to a
  // small mask (createSplatMaterial) so rock/strata live only on real mesas.
  const mesas = T.mesas;
  // the authored landforms' geological zones (pure; for the terrain material and CPU-side dressing)
  const geologyZones = createGeologyZoneSampler(T.landforms);
  // The maps-and-layouts lane (2026-10-03): a map whose landforms author lava flows gates its rock on their footprints
  // too, the zone's 4 m edge the basalt's (the ground lane's volcanic zoning reads a flow as basalt over its whole
  // surface through mask B and rockGate). Maps without flows keep the mesa wall and rim alone, byte for byte.
  const flowZones = geologyZones && T.landforms.some((form) => form.kind === 'ridge' && form.geology?.profile === 'flow')
    ? geologyZones : null;
  // a map that opts in (landformRock) gates its rock on every authored rock landform's footprint instead of a mesa field
  const rockLandforms = T.landformRock ? createGeologyRockSampler(T.landforms) : null;
  function createMesaWeightSampler(): HeightField['_mesaW'] {
    if (!mesas && !flowZones && !rockLandforms) return null;
    const zone: GeologyZones = [0, 0, 0];
    return (x: number, z: number): number => {
      let wall = 0;
      if (mesas) {
        const mn = sampleMesaNoise(x, z);
        const band = mesas.thr1 - mesas.thr0;
        // low edge pulled 0.55 band below thr0: the talus apron at the mesa foot
        // keeps its rock identity, the open dune field beyond it does not
        wall = smoothstep(mesas.thr0 - band * 0.55,
          mesas.thr0 + band * (mesas.wallWidth ?? 0.42), mn);
      }
      // the map-borders lane: the rim is rock only where the border landform keeps it (an open sector's low rim is ground)
      const rim = smoothstep(408, 468, Math.max(Math.abs(x), Math.abs(z))) * smoothstep(0.35, 0.8, border.rimFactorAt(x, z));
      if (rockLandforms) return Math.max(wall, rim, rockLandforms(x, z));
      return flowZones ? Math.max(wall, rim, flowZones(x, z, zone)[0]) : Math.max(wall, rim);
    };
  }
  const mesaWeight = createMesaWeightSampler();
  const landUseProfile = resolveLandUseProfile(cfg?.id); // ground lane
  const legacyGroundLanes = typeof location !== 'undefined' && /[?&]ground=legacy(&|$)/.test(location.search ?? '');

  // round 63: the rail cutting continues past the red line — the ring's near rows seat on the same notch (and the road
  // exits read the outland as the ring does: roadExitOnRing)
  const publicOutlandHeightAt = railCuttings !== null
    ? (x: number, z: number): number => railCuttingHeight(railCuttings, railCuttingPortalYs, x, z, outlandHeightAt(x, z), railOpenLines)
    : outlandHeightAt;
  return {
    getHeightAt, getHeightAtFast, getContactHeightAt, warmFastTilesAround, getNormalAt, getGroundType, getDriveGroundType,
    getContactNormalAt: getContactHeightAt.normalAt,
    getOutlandHeightAt: publicOutlandHeightAt,
    ...(railCuttings !== null ? { getOutlandSeatWeightAt: (x: number, z: number): number =>
      railCuttingSeatWeight(railCuttings, railCuttingPortalYs, x, z, outlandHeightAt, railOpenLines) } : {}),
    getWaterMaskAt, getWaterDepthAt, getTrackSurfaceAt,
    // the map-borders lane: where the near ring hands its continued ground over to the authored ranges
    getBorderHandOverAt: border.handOverAt,
    // (a receipt's classic border — the rim before the landform — publishes no woods, hedges or parcels)
    ...(border.settings.classic ? {} : { getBorderWoodsAt: border.woodsAt, getBorderHedgeAt: border.hedgeAt, _borderParcelAt: border.parcelTintAt,
      _borderTrackAt: border.trackAt,
      _borderHedgeLines: border.traceHedgeLines,
      _borderFarmsteads: { count: border.settings.farms, style: border.settings.buildings, fieldAngle: border.fieldAngle,
        buildings: border.settings.farmBuildings !== false } }),
    _roadExitAt: roadExitAt,
    _roadExitLines: () => roadExits().map((exit) => ({ xs: exit.xs, zs: exit.zs, length: exit.length })),
    _roadExitOnRing: roadExitOnRing,
    ...(railCuttings !== null ? { _railExitAt: railExitAt } : {}),
    // the maps-and-layouts lane (2026-10-03): the authored landforms' geological zones, on a map that authors them
    ...(geologyZones ? { _geologyZoneAt: geologyZones } : {}),
    ...(cfg?.navigationWaterPolicy
      ? { navigationWaterPolicy: cfg.navigationWaterPolicy } : {}),
    bridgeDecks, // round 61
    size: MAP_SIZE, minY, maxY,
    _roadDist: (x: number, z: number) => gridSample(gRoadDist, x, z),
    _villageMask: villageMask,
    // ground lane (2026-10-03): the field system the terrain material draws (landUse.ts) — on the field itself, so the
    // client, the browser host and the server's collision shards place hedgerow trees and field bushes alike;
    // `?ground=legacy` draws no fields and grows no crops
    ...(landUseProfile && !legacyGroundLanes ? { _landUseAt: (x: number, z: number, out: LandFieldSample): LandFieldSample =>
      landUseAt(landUseProfile, x, z, out) } : {}),
    // ground lane (2026-10-08, the gauntlet's wave 260): a cinder yard's weeds in clumps, on the map whose ground profile
    // floors its village so (Cinder Junction); `?ground=legacy` grows the old scatter
    ...((resolveGroundReduxProfile(cfg?.id).cinderYard ?? 0) > 0 && !legacyGroundLanes ? { _yardWeedsAt: cinderYardWeedsAt } : {}),
    // Frontline Assault trenches (assault-trenches variant), null on the standard field.
    assaultTrenchLines: trenchPlan(),
    // Field trenches on every standard field (2026-09-17), also on the assault variant clear of its sector lines.
    fieldTrenchLines: fieldTrenchPlan(),
    // Keep pavement clear without excluding vegetation along unrelated roads.
    _noVeg: hardstandNoVeg ? (x, z) => hardstandNoVeg(x, z) || noVeg(x, z) : noVeg,
    // ground lane (2026-10-08, wave 274's Monsoon slope): the sward follows its slopes and the map's sun, on a map whose
    // ground profile asks it; `?ground=legacy` keeps the even carpet
    ...((resolveGroundReduxProfile(cfg?.id).swardSlope ?? 0) > 0 && !legacyGroundLanes ? { _swardSlope: ((): readonly [number, number, number] => {
      const sun = skySunDirection(cfg?.sky), l = Math.hypot(sun.x, sun.z) || 1;
      return Object.freeze([sun.x / l, sun.z / l, Math.min(1, resolveGroundReduxProfile(cfg?.id).swardSlope ?? 0)] as const);
    })() } : {}),
    // round 67: the cut faces' seeding weight, read on the uncut ground like the exclusion
    ...(railCuttings !== null ? { _batterSeedAt: (x: number, z: number): number =>
      railCuttingFaceSeedAt(railCuttings, railCuttingPortalYs, x, z, uncutHeightAt, T.rimH + 8, railOpenLines) } : {}),
    _layout: layout,
    ...(layout.roadStations ? {_createRoadPlacementSampler:function* () {
      return yield* heightFieldBuildSteps(seed,originalRoadPlacementConfig(cfg),true);
    }} : {}),
    _mesaW: mesaWeight,
    ...(liquidWater ? { _waterWetnessAt: waterWetnessAt, getOutlandWaterAt: outlandWaterAt } : {}),
    ...(_sorStations ? { _sorWetnessAt: sorWetnessAt } : {}),
  };
}

// ---------------------------------------------------------------------------
// applyTone — per-map HSL retint of a generated RGBA pixel buffer (alpha kept:
// it packs roughness in the terrain layers, coverage in foliage cards).
// ---------------------------------------------------------------------------
const _toneCol = new THREE.Color();
const _toneHsl = { h: 0, s: 0, l: 0 };
/**
 * Retint pixels in place through an HSL transform.
 * @param {Uint8ClampedArray} px RGBA buffer
 * @param {?function(number,number,number):number[]} fn (h,s,l) => [h,s,l]
 * @returns {Uint8ClampedArray} the same buffer
 */
export function applyTone(
  px: Uint8ClampedArray,
  fn: ToneFunction | null | undefined,
): Uint8ClampedArray {
  if (!fn) return px;
  for (let i = 0; i < px.length; i += 4) {
    _toneCol.setRGB(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255);
    _toneCol.getHSL(_toneHsl);
    const [h, s, l] = fn(_toneHsl.h, _toneHsl.s, _toneHsl.l);
    _toneCol.setHSL(((h % 1) + 1) % 1, clamp(s, 0, 1), clamp(l, 0, 1));
    px[i] = _toneCol.r * 255; px[i + 1] = _toneCol.g * 255; px[i + 2] = _toneCol.b * 255;
  }
  return px;
}

// ---------------------------------------------------------------------------
// Procedural PBR texture layers (browser-only; called from buildTerrainMeshes)
// ---------------------------------------------------------------------------

// CPU twin of the splat shader's uNoise samples (seed 3011 matches
// makeShaderNoiseTexture in createSplatMaterial). Lets vegetation placement
// read the same dirt-patch/clump fields the ground shader blends with, so
// grass thins out exactly where the terrain shows dirt.
let _splatFields: SplatFields | null = null; // { a, b: Float32Array } — see splatFields()
// PERF (performance_budget r6): the CPU twin used to evaluate ~10 analytic
// torusNoise (4D simplex) calls per query; vegetation scatter makes 1.18 M
// queries per boot (measured) = 10.6 M noise4d + ~42 M sin/cos — ~1.5-2 s of
// every load. The GPU never sees those analytic values: the splat shader
// samples the SAME two field formulas from the 256^2 uNoise texture,
// bilinearly, 8-bit quantized. Bake the two fields ONCE into Float32 grids
// (identical formulas, identical seed, identical rng stream) and serve BOTH
// consumers: sampleSplatNoise becomes 5 bilinear grid reads — the exact
// sampling model the shader applies, at float precision — and
// makeShaderNoiseTexture quantizes the same arrays into its RGBA bytes
// (bit-identical texture to the old analytic bake). The analytic->bilinear
// delta on these smooth fields only flips statistically-marginal tuft
// placements; grass<->dirt correlation is exact-by-construction now.
const SPLAT_FIELD_S = 256;
function splatFields(): SplatFields {
  if (_splatFields) return _splatFields;
  const steps = splatFieldSteps();
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/** Private rows until complete; a synchronous consumer may win between slices. */
function* splatFieldSteps(): Generator<void, SplatFields, void> {
  if (_splatFields) return _splatFields;
  const s = SPLAT_FIELD_S;
  const noi = new SimplexNoise({ random: mulberry32(3011) });
  const a = new Float32Array(s * s);
  const b = new Float32Array(s * s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const u = x / s, v = y / s, j = y * s + x;
      a[j] = torusNoise(noi, u, v, 4, 4, 3) * 0.6 + torusNoise(noi, u, v, 9, 9, 27) * 0.4;
      b[j] = torusNoise(noi, u, v, 2, 2, 55) * 0.7 + torusNoise(noi, u, v, 5, 5, 91) * 0.3;
    }
    yield;
    // Reuse the exact published identity without finishing a redundant bake.
    // In particular, cancellation after the final row must not publish ours.
    if (_splatFields) return _splatFields;
  }
  _splatFields = { a, b };
  return _splatFields;
}
// bilinear + wrap at texel centers — the sampling GL applies to the repeat-
// wrapped uNoise texture, so the CPU twin sees what the shader sees.
function fieldSample(g: Float32Array, u: number, v: number): number {
  const s = SPLAT_FIELD_S;
  let x = u * s - 0.5, y = v * s - 0.5;
  let x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  // SPLAT_FIELD_S is a power of two and callers pass wrapped coordinates.
  // Masking keeps the exact repeat-wrap result while avoiding four modulo
  // operations for each of the millions of grass-scatter grid reads.
  const mask = s - 1;
  x0 &= mask; y0 &= mask;
  const x1 = (x0 + 1) & mask, y1 = (y0 + 1) & mask;
  const g00 = g[y0 * s + x0], g10 = g[y0 * s + x1];
  const g01 = g[y1 * s + x0], g11 = g[y1 * s + x1];
  return g00 + (g10 - g00) * fx + (g01 - g00) * fy + (g00 - g10 - g01 + g11) * fx * fy;
}
function wrapUnit(t: number): number { return t - Math.floor(t); }
export function sampleSplatNoise(
  x: number,
  z: number,
  out: SplatNoiseSample | null = null,
): SplatNoiseSample {
  const f = splatFields();
  // r6: mirror the shader's domain warp (wOff in splatCompute) — the dirt/
  // clump fields are sampled at WARPED coordinates on the GPU, so vegetation
  // thinning must read the same warped fields or grass and dirt de-correlate
  const uw = wrapUnit(x * 0.0009 + 0.53), vw = wrapUnit(z * 0.0009 + 0.17);
  const wr = fieldSample(f.a, uw, vw);
  const wg = fieldSample(f.b, uw, vw);
  const wx = x + wr * 0.5 * 48, wz = z + wg * 0.5 * 48;
  const n1 = fieldSample(f.a, wrapUnit(wx * 0.0117), wrapUnit(wz * 0.0117));
  const n2 = fieldSample(f.b, wrapUnit(wx * 0.0031 + 0.41), wrapUnit(wz * 0.0031 + 0.13));
  // mA: the CPU twin of the shader's meadowA field — the dry-straw patchwork
  // tint. Grass tufts read it so the blade carpet carries the same yellow-
  // brown patches the ground albedo shows. r7: TWO-SCALE composite matching
  // the shader (0.0121 .r x0.62 + 0.00779 .g x0.38 — the 83 m repeat break).
  const mA = fieldSample(f.a, wrapUnit(wx * 0.0121 + 0.63), wrapUnit(wz * 0.0121 + 0.29)) * 0.62
    + fieldSample(f.b, wrapUnit(wx * 0.00779 + 0.19), wrapUnit(wz * 0.00779 + 0.71)) * 0.38;
  const result: SplatNoiseSample = out || { n1: 0, n2: 0, mA: 0 };
  result.n1 = n1 * 0.5 + 0.5;
  result.n2 = n2 * 0.5 + 0.5;
  result.mA = mA * 0.5 + 0.5;
  return result;
}

/**
 * Ground lane (2026-10-03): the bedded rock's wander, in metres of height — the CPU twin of the terrain material's
 * gBedWob (its beds lie at bedY = y − terrainBedWobbleAt(x, z)), so a bedrock skin or a prop striped by the same law
 * reads as one rock with the terrain's strata (the scenery lane's domes). The shader reads the 8-bit noise texture at
 * the footprint's mip; the twin reads the same float fields bilinearly (a level-0 sample, sampleSplatNoise's
 * convention): within a few centimetres of the shader near the camera. (2026-10-06, Titan's zigzag strata: both terms
 * read the smooth field b at the scales the shader's comment meant, ~50 m and ~17 m — field a carries half its power at
 * 2–8 texels, which 0.0588 drew as ±0.55 m teeth every metre or two along every bed.)
 */
export function terrainBedWobbleAt(x: number, z: number): number {
  const f = splatFields();
  const b = fieldSample(f.b, wrapUnit(x * 0.0050 + 0.37), wrapUnit(z * 0.0050 + 0.83));
  const b2 = fieldSample(f.b, wrapUnit(x * 0.0147 + 0.71), wrapUnit(z * 0.0147 + 0.19));
  return b * 1.6 + b2 * 0.55;
}

/**
 * Ground lane (2026-10-03): where a two-formation bedrock's boundary lies at (x, z), in the beds' own height (compare it
 * with y − terrainBedWobbleAt(x, z)) — the twin of the material's uFormation step for a splat `formation` (the field's
 * min/max heights and the row's atFrac and wobbleM). Below it the paler formation, above it the redder one.
 */
export function terrainFormationBoundaryY(x: number, z: number, minY: number, maxY: number,
  formation: { atFrac: number; wobbleM?: number; atY?: number }): number {
  const b = fieldSample(splatFields().b, wrapUnit(x * 0.0071 + 0.83), wrapUnit(z * 0.0071 + 0.41));
  return (formation.atY ?? minY + (maxY - minY) * formation.atFrac) - b * (formation.wobbleM ?? 2.5);
}

const _col = new THREE.Color();
function _css(h: number, s: number, l: number): string { _col.setHSL(h, s, l); return _col.getStyle(); }

// draw a canvas path callback at all 9 wrap offsets so the tile stays seamless
function drawWrapped(ctx: CanvasRenderingContext2D, s: number, fn: () => void): void {
  for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
    ctx.save();
    ctx.translate(ox, oy);
    fn();
    ctx.restore();
  }
}

// Painted grass layer: noise macro base + thousands of individual blade
// strokes so the near field reads as turf, not single-frequency speckle.
function makeGrassLayer(
  seed: number,
  anisotropy: number,
  tone: ToneFunction | null = null,
): TerrainTextureLayer {
  const s = texSize(256); // loading-speed r1: sourced 1K set replaces this fallback
  const noi = new SimplexNoise({ random: mulberry32(seed) });
  const rng = mulberry32(seed ^ 0x7f4a);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = require2DContext(c, { willReadFrequently: true });
  // macro base: soil showing through + moss/dry patches at 3-7 tile frequency
  const base = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) {
    const v = y / s;
    for (let x = 0; x < s; x++) {
      const u = x / s, j = (y * s + x) * 4;
      const macro = torusNoise(noi, u, v, 3, 3, 11) * 0.6 + torusNoise(noi, u, v, 7, 7, 23) * 0.4;
      const fine = torusNoise(noi, u, v, 43, 43, 61) * 0.5 + 0.5;
      const m01 = macro * 0.5 + 0.5;
      // r7 terrain_environment: MIXED STRAW/OLIVE/SOIL base instead of one
      // spring green (critique: "one saturated spring green... pull grass
      // albedo toward WoT's mixed straw/olive/brown range"). Wider dry band
      // (0.54 start), a soil-through family on the low end of the macro
      // field, and the living green pulled toward olive.
      const dry = smoothstep(0.54, 0.88, m01);
      const soil = smoothstep(0.34, 0.10, m01); // bare-earth showing through
      _col.setHSL(
        0.192 + macro * 0.030 - dry * 0.075 - soil * 0.085,
        0.245 - dry * 0.075 - soil * 0.10,
        0.16 + m01 * 0.07 + fine * 0.05 - soil * 0.015);
      base.data[j] = _col.r * 255; base.data[j + 1] = _col.g * 255; base.data[j + 2] = _col.b * 255;
      base.data[j + 3] = 255;
    }
  }
  ctx.putImageData(base, 0, 0);
  // blade strokes: short curved tapers in varied greens + scattered dry blades
  // r7: dry share 0.14 -> 0.24 and living hue pulled toward olive with a
  // wider spread — the blade carpet must mix straw into the green, not read
  // as one lawn tone (ground-cover critique)
  ctx.lineCap = 'round';
  for (let b = 0; b < 3400; b++) {
    const x = rng() * s, y = rng() * s;
    const dry = rng() < 0.24;
    const lum = 0.16 + rng() * 0.17 + (dry ? 0.12 : 0);
    ctx.strokeStyle = dry
      ? _css(0.10 + rng() * 0.035, 0.26 + rng() * 0.08, lum)
      : _css(0.175 + rng() * 0.075, 0.26 + rng() * 0.13, lum);
    ctx.lineWidth = 1.1 + rng() * 1.4;
    const len = 7 + rng() * 12;
    const a = rng() * Math.PI * 2;
    const bend = (rng() - 0.5) * 8;
    drawWrapped(ctx, s, () => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(a) * len * 0.5 - Math.sin(a) * bend,
        y + Math.sin(a) * len * 0.5 + Math.cos(a) * bend,
        x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    });
  }
  // tiny clover/weed dots
  for (let b = 0; b < 420; b++) {
    const x = rng() * s, y = rng() * s, r = 1 + rng() * 2;
    ctx.fillStyle = _css(0.26 + rng() * 0.05, 0.4, 0.2 + rng() * 0.16);
    drawWrapped(ctx, s, () => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  const out = ctx.getImageData(0, 0, s, s);
  const px = new Uint8ClampedArray(out.data);
  const hgt = new Float32Array(s * s);
  for (let i = 0; i < s * s; i++) {
    const g = px[i * 4 + 1] / 255;
    hgt[i] = g;
    px[i * 4 + 3] = clamp(0.90 - g * 0.10, 0.03, 1) * 255; // roughness in alpha (0.80-0.90: low-gloss turf sheen so sun angle reads)
  }
  applyTone(px, tone);
  return {
    albedo: canvasToTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 2.4, anisotropy), // lighting_post r2: stronger micro-normal
  };
}

// Painted dirt layer: clods + drawn pebbles + cracks — real macro structure
// for the sub-10 m ground and the road gravel pass.
function makeDirtLayer(
  seed: number,
  anisotropy: number,
  tone: ToneFunction | null = null,
): TerrainTextureLayer {
  const s = texSize(256); // loading-speed r1: sourced 1K set replaces this fallback
  const noi = new SimplexNoise({ random: mulberry32(seed) });
  const rng = mulberry32(seed ^ 0x2e91);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = require2DContext(c, { willReadFrequently: true });
  const base = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) {
    const v = y / s;
    for (let x = 0; x < s; x++) {
      const u = x / s, j = (y * s + x) * 4;
      const clods = torusNoise(noi, u, v, 4, 4, 7) * 0.65 + torusNoise(noi, u, v, 9, 9, 31) * 0.35;
      const grain = torusNoise(noi, u, v, 47, 47, 3) * 0.5 + 0.5;
      const c01 = clods * 0.5 + 0.5;
      _col.setHSL(0.077 + clods * 0.014, 0.25 - grain * 0.05, 0.16 + c01 * 0.10 + grain * 0.045);
      base.data[j] = _col.r * 255; base.data[j + 1] = _col.g * 255; base.data[j + 2] = _col.b * 255;
      base.data[j + 3] = 255;
    }
  }
  ctx.putImageData(base, 0, 0);
  // soft clod shading blobs
  for (let b = 0; b < 110; b++) {
    const x = rng() * s, y = rng() * s;
    const rw = 8 + rng() * 22, rh = rw * (0.5 + rng() * 0.7), rot = rng() * Math.PI;
    const dark = rng() < 0.5;
    ctx.globalAlpha = 0.14 + rng() * 0.14;
    ctx.fillStyle = _css(0.075 + rng() * 0.015, 0.24, dark ? 0.12 : 0.30);
    drawWrapped(ctx, s, () => {
      ctx.beginPath();
      ctx.ellipse(x, y, rw, rh, rot, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;
  // cracks: dark meandering polylines
  ctx.lineCap = 'round';
  for (let k = 0; k < 26; k++) {
    let x = rng() * s, y = rng() * s;
    let a = rng() * Math.PI * 2;
    ctx.strokeStyle = _css(0.07, 0.25, 0.075 + rng() * 0.035);
    ctx.lineWidth = 0.9 + rng() * 1.2;
    const segs = 4 + (rng() * 5) | 0;
    const ptsX = [x], ptsY = [y];
    for (let q = 0; q < segs; q++) {
      a += (rng() - 0.5) * 1.2;
      x += Math.cos(a) * (7 + rng() * 12);
      y += Math.sin(a) * (7 + rng() * 12);
      ptsX.push(x); ptsY.push(y);
    }
    drawWrapped(ctx, s, () => {
      ctx.beginPath();
      ctx.moveTo(ptsX[0], ptsY[0]);
      for (let q = 1; q < ptsX.length; q++) ctx.lineTo(ptsX[q], ptsY[q]);
      ctx.stroke();
    });
  }
  // pebbles with a contact-shadow offset
  for (let b = 0; b < 640; b++) {
    const x = rng() * s, y = rng() * s, r = 0.8 + Math.pow(rng(), 1.8) * 3.2;
    const lum = 0.2 + rng() * 0.2;
    const sh = _css(0.075, 0.2, 0.08);
    const fill = _css(0.075 + rng() * 0.02, 0.10 + rng() * 0.12, lum);
    drawWrapped(ctx, s, () => {
      ctx.beginPath();
      ctx.arc(x + r * 0.4, y + r * 0.5, r, 0, Math.PI * 2);
      ctx.fillStyle = sh;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
    });
  }
  const out = ctx.getImageData(0, 0, s, s);
  const px = new Uint8ClampedArray(out.data);
  const hgt = new Float32Array(s * s);
  for (let i = 0; i < s * s; i++) {
    const l = (px[i * 4] * 0.45 + px[i * 4 + 1] * 0.4 + px[i * 4 + 2] * 0.15) / 255;
    hgt[i] = l;
    px[i * 4 + 3] = clamp(0.98 - l * 0.09, 0.03, 1) * 255;
  }
  applyTone(px, tone);
  return {
    albedo: canvasToTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 3.0, anisotropy),
  };
}

// Lake-ice layer (winter): pale blue-grey sheet with darker depth blotches,
// dark meandering pressure-crack lines, faint wind-blown snow drift streaks.
// Roughness (packed in alpha) is LOW on clear ice, high on the drifts, so the
// sheet picks up sun/sky specular and reads as ice, not mud.
export function makeIceLayer(seed: number, anisotropy: number): TerrainTextureLayer {
  const s = texSize(256); // loading-speed r1: distant/fallback terrain tile
  const noi = new SimplexNoise({ random: mulberry32(seed) });
  const rng = mulberry32(seed ^ 0x1cE5);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = require2DContext(c, { willReadFrequently: true });
  const base = ctx.createImageData(s, s);
  const hgt = new Float32Array(s * s);
  for (let y = 0; y < s; y++) {
    const v = y / s;
    for (let x = 0; x < s; x++) {
      const u = x / s, j = (y * s + x) * 4;
      // Broad clear-ice fields. Torus frequency scales both circle angle and
      // radius, so the former 5/11 octaves still produced texel-scale mottling.
      const depth = torusNoise(noi, u, v, 1, 1, 9) * 0.6 + torusNoise(noi, u, v, 2, 2, 41) * 0.4;
      const fine = torusNoise(noi, u, v, 3, 3, 77) * 0.5 + 0.5;
      const d01 = depth * 0.5 + 0.5;
      const deep = smoothstep(0.45, 0.88, 1 - d01); // dark water under thin ice
      // Refrozen pigment is not relief. Reuse the already sampled broad
      // field so white seams never emboss an etched normal-map network.
      hgt[y * s + x] = 0.5 + depth * 0.12;
      // r5: GRAY-WHITE ice, not swimming-pool blue. Real lake ice under an
      // overcast sky is a desaturated gray sheet with faint blue-green depth
      // cues — the old s=0.15..0.25 base (then squared by the shader's
      // self-multiplying macro overlay) rendered a garish saturated blue
      // ellipse that clashed with the sepia sky. Keep the value step below
      // the 0.8+ snow albedo so the sheet still reads as a lake.
      // r6: saturation halved again (0.045+0.05 -> 0.025+0.03) — even the
      // r5 sheet compounded into garish blue speckle at range
      // r9: VALUE contrast up, saturation still low — the sheet read as a
      // slightly-blue snow patch; darker clear-ice fields (0.58 base, deeper
      // 0.19 depth drop) separate ICE from the 0.8+ snow albedo around it
      // while staying grey enough to sit under the overcast sky
      // terrain_environment r3: darker still (0.44 base, 0.24 drop) with a
      // touch more blue-green — the sheet needs real VALUE separation from
      // the snowfield so the new fresnel sky sheen has something to play
      // against; at 0.58 it read as a pale stain with no material identity
      // r4: 0.44/0.24 -> 0.37/0.27 — the engine's bright winter fill washes
      // the sheet toward white, so the authored fields must sit DARKER for
      // any ice identity to survive to screen (critique: "matte pale splat")
      _col.setHSL(0.535 + depth * 0.015, 0.055 + deep * 0.06,
        0.37 - deep * 0.27 + fine * 0.03);
      base.data[j] = _col.r * 255; base.data[j + 1] = _col.g * 255; base.data[j + 2] = _col.b * 255;
      base.data[j + 3] = 255;
    }
  }
  ctx.putImageData(base, 0, 0);
  // Broad, feathered wind-swept fields leave quiet clear ice between them.
  // All random choices precede wrapping so opposite tile edges agree.
  const unit = s / 256;
  for (let k = 0; k < 10; k++) {
    const x = rng() * s, y = rng() * s;
    const rx = (38 + rng() * 38) * unit, ry = (10 + rng() * 14) * unit;
    ctx.globalAlpha = 0.22 + rng() * 0.20;
    drawWrapped(ctx, s, () => {
      ctx.translate(x, y);
      ctx.rotate(0.6);
      ctx.scale(rx, ry);
      const drift = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      drift.addColorStop(0, 'rgba(232,238,242,1)');
      drift.addColorStop(1, 'rgba(232,238,242,0)');
      ctx.fillStyle = drift;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // Three dominant stress seams, each with at most one short secondary fork.
  // This same atlas is sampled at 5 m and 75 m: many recursively branching
  // strokes became a uniformly scratched print at both scales.
  ctx.lineCap = 'round';
  function crack(x: number, y: number, a: number, segs: number, w: number): void {
    const ptsX = [x], ptsY = [y];
    for (let q = 0; q < segs; q++) {
      a += (rng() - 0.5) * 0.65;
      const step = (22 + rng() * 14) * unit;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      ptsX.push(x); ptsY.push(y);
    }
    drawWrapped(ctx, s, () => {
      // dark stress shadow under a BRIGHT refrozen core: from distance real
      // pressure cracks read as white veins across darker ice (the old dark-
      // core version read as mud cracks). Both desaturated (r5).
      ctx.strokeStyle = _css(0.58, 0.10, 0.36);
      ctx.lineWidth = w + 1.8 * unit;
      ctx.globalAlpha = 0.30;
      ctx.beginPath();
      ctx.moveTo(ptsX[0], ptsY[0]);
      for (let q = 1; q < ptsX.length; q++) ctx.lineTo(ptsX[q], ptsY[q]);
      ctx.stroke();
      ctx.strokeStyle = _css(0.575, 0.05, 0.90);
      ctx.lineWidth = w;
      ctx.globalAlpha = 0.86;
      ctx.beginPath();
      ctx.moveTo(ptsX[0], ptsY[0]);
      for (let q = 1; q < ptsX.length; q++) ctx.lineTo(ptsX[q], ptsY[q]);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    if (segs > 3 && rng() < 0.35) {
      const heading = Math.atan2(ptsY[2] - ptsY[1], ptsX[2] - ptsX[1]);
      crack(ptsX[2], ptsY[2], heading + (rng() < 0.5 ? 0.8 : -0.8), 2, w * 0.45);
    }
  }
  for (let k = 0; k < 3; k++) {
    crack(((k + 0.2 + rng() * 0.5) / 3) * s, rng() * s,
      k * 2.1 + rng() * 0.6, 6, (2.6 + rng() * 0.8) * unit);
  }
  ctx.globalAlpha = 1;
  const out = ctx.getImageData(0, 0, s, s);
  const px = new Uint8ClampedArray(out.data);
  for (let i = 0; i < s * s; i++) {
    const l = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.45 + px[i * 4 + 2] * 0.25) / 255;
    // bright texels = snow drift (rough); dark clear ice = glossy
    const snowy = smoothstep(0.72, 0.9, l);
    px[i * 4 + 3] = clamp(0.10 + snowy * 0.72, 0.05, 1) * 255;
  }
  return {
    albedo: canvasToTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 0.8, anisotropy),
  };
}

// Liquid waves are independent of pigment. Painted foam used to become
// embossed scratches in both the detail normal and its 75-metre reprojection.
// Bank foam/whitecaps already belong to the shoreline-aware shader below.
export function makeSeaLayer(
  seed: number,
  anisotropy: number,
  tone: ToneFunction | null = null,
): TerrainTextureLayer {
  const s = texSize(256); // loading-speed r1: distant/fallback terrain tile
  const noi = new SimplexNoise({ random: mulberry32(seed) });
  const px = new Uint8ClampedArray(s * s * 4);
  const hgt = new Float32Array(s * s);
  for (let y = 0; y < s; y++) {
    const v = y / s;
    for (let x = 0; x < s; x++) {
      const u = x / s, j = (y * s + x) * 4;
      // swell: long-wavelength anisotropic fields (stretched u) so the tone
      // drift reads as rolling water, not blobs; chop: fine isotropic octave
      const swell = torusNoise(noi, u, v, 2, 3, 19) * 0.6 + torusNoise(noi, u, v, 5, 7, 47) * 0.4;
      const chop = torusNoise(noi, u, v, 23, 23, 83) * 0.5 + 0.5;
      const s01 = swell * 0.5 + 0.5;
      const deep = smoothstep(0.60, 0.90, 1 - s01); // dark deep-water fields
      _col.setHSL(
        0.545 - s01 * 0.035,             // teal -> blue-green drift
        0.30 + deep * 0.10 - chop * 0.05,
        0.135 + s01 * 0.075 - deep * 0.05 + chop * 0.025);
      px[j] = _col.r * 255; px[j + 1] = _col.g * 255; px[j + 2] = _col.b * 255;
      px[j + 3] = (0.10 + chop * 0.035) * 255;
      hgt[y * s + x] = swell * 0.075 + (chop - 0.5) * 0.003;
    }
  }
  applyTone(px, tone);
  return {
    albedo: canvasToTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 1.0, anisotropy),
  };
}

// Stratified sandstone layer (r7, desert cliffs). The generic rock layer —
// and the sourced Rock063 set that replaced it — both read as swirly
// Perlin-marble smears on the canyon walls ("wet-sand swirls" critique).
// This layer is authored as SEDIMENT: near-horizontal beds of variable
// thickness with per-bed tone/hue, thin dark marker beds, ledge relief at
// the bed boundaries and only granular (never swirly) fine texture. The
// splat shader's wall projection maps v to world height, so the beds land
// horizontal on every cliff face regardless of orientation.
function makeSandstoneLayer(
  seed: number,
  anisotropy: number,
  tone: ToneFunction | null = null,
  markers = 1,
): TerrainTextureLayer {
  const s = texSize(256); // loading-speed r1: distant/fallback terrain tile
  const noi = new SimplexNoise({ random: mulberry32(seed) });
  const rng = mulberry32(seed ^ 0x5a4d);
  // bed table: resistant ledges, soft recessed beds, occasional dark markers
  const beds: SandstoneBed[] = [];
  {
    let y = 0;
    while (y < s) {
      // (the draws keep their order whatever the markers' strength; without them a marker's slot is a bed like the rest)
      const marker = rng() < 0.16 && markers > 0.5;
      // r4: thicker beds (20-80 -> 34-110 px) — the old thin-bed ladder
      // repeated every couple of meters on the walls and read as marble veins
      const th = marker ? 4 + rng() * 6 : 34 + rng() * 76;
      beds.push({
        y0: y, y1: y + th, marker,
        tone: rng(),            // per-bed lightness
        hueJ: rng(),            // per-bed hue drift (tan <-> rust)
        hard: rng(),            // resistance -> ledge relief
      });
      y += th;
    }
  }
  function bedAt(yw: number): SandstoneBed {
    for (const b of beds) if (yw >= b.y0 && yw < b.y1) return b;
    return beds[beds.length - 1];
  }
  // (ground lane, wave 62: Redrock's walls, "identical wavy dark squiggles") a bed's tone and hue step at its
  // boundary; seen on an inclined, gullied face the step traces the contour into every gully (the rule of Vs) — a
  // hard-edged ladder of squiggles. Without the markers (markers 0) the steps are softened over ~6 px (15 cm of
  // wall) and their contrast halved, so the beds read as broad weathered bands under the material's own bedding.
  const soften = markers > 0.5 ? 0 : 6;
  const toneRow = new Float32Array(s), hueRow = new Float32Array(s), hardRow = new Float32Array(s);
  for (let y = 0; y < s; y++) {
    const b = bedAt(y);
    toneRow[y] = b.tone; hueRow[y] = b.hueJ; hardRow[y] = b.hard;
  }
  if (soften > 0) {
    // (the beds' ledge relief too: a step in the tile's height is a line in its normal map — the squiggles' dark
    // outlines on the wall-projected faces)
    const t0 = Float32Array.from(toneRow), h0 = Float32Array.from(hueRow), r0 = Float32Array.from(hardRow);
    for (let y = 0; y < s; y++) {
      let ts = 0, hs = 0, rs = 0, ws = 0;
      for (let k = -soften; k <= soften; k++) {
        const w = 1 - Math.abs(k) / (soften + 1), yy = ((y + k) % s + s) % s;
        ts += t0[yy] * w; hs += h0[yy] * w; rs += r0[yy] * w; ws += w;
      }
      toneRow[y] = 0.5 + (ts / ws - 0.5) * 0.5; hueRow[y] = 0.5 + (hs / ws - 0.5) * 0.5; hardRow[y] = 0.5 + (rs / ws - 0.5) * 0.5;
    }
  }
  const px = new Uint8ClampedArray(s * s * 4);
  const hgt = new Float32Array(s * s);
  for (let yy = 0; yy < s; yy++) {
    for (let xx = 0; xx < s; xx++) {
      const u = xx / s, v = yy / s, i = yy * s + xx, j = i * 4;
      // gentle boundary wobble — LOW turbulence, long wavelength; this is
      // the only warp in the layer, so beds stay legible strata
      // r4: 4.2/1.6 -> 2.2/0.8 — the deeper wobble bent the beds into the
      // "marble-vein" waviness the desert critique flagged; near-straight
      // beds read as sediment
      const wob = torusNoise(noi, u, v, 2, 2, 7) * 2.2 + torusNoise(noi, u, v, 6, 6, 33) * 0.8;
      const yw = ((yy + wob) % s + s) % s;
      const bed = bedAt(yw);
      const bedT = (yw - bed.y0) / Math.max(1, bed.y1 - bed.y0);
      // distance to nearest bed boundary (px) -> recess/shadow line
      const dEdge = Math.min(yw - bed.y0, bed.y1 - yw);
      const seam = 1 - clamp(dEdge / 3.2, 0, 1);
      // granular grain only — isotropic, two octaves, small amplitude
      const grain = torusNoise(noi, u, v, 38, 38, 61) * 0.5 + 0.5;
      const grain2 = torusNoise(noi, u, v, 13, 13, 99) * 0.5 + 0.5;
      // broad along-bed tone drift so a bed is not one flat stripe
      const drift = torusNoise(noi, u, v * 0.15, 3, 1, 145) * 0.5 + 0.5;
      // r4: sat 0.42+0.12 -> 0.33+0.08 — the saturated ochre beds were the
      // PINK cast in the "contour-band marbling" read
      const ywi = Math.min(s - 1, Math.floor(yw));
      const bedTone = soften > 0 ? toneRow[ywi] : bed.tone, bedHue = soften > 0 ? hueRow[ywi] : bed.hueJ;
      let hue = 0.062 + bedHue * 0.022 - 0.006 * grain2;
      let sat = 0.33 + bedHue * 0.08 - grain * 0.06;
      let lum = bed.marker
        ? 0.185 + bed.tone * 0.05
        : 0.315 + bedTone * 0.20 + (bedT - 0.5) * 0.03 * markers + grain * 0.05 + (drift - 0.5) * 0.07;
      lum *= 1 - seam * 0.38 * markers; // shadowed parting line at every bed boundary
      _col.setHSL(hue, clamp(sat, 0, 1), clamp(lum, 0.04, 0.75));
      px[j] = _col.r * 255; px[j + 1] = _col.g * 255; px[j + 2] = _col.b * 255;
      // relief: hard beds ledge out, soft/marker beds recess, seams notch
      let hn = 0.40 + (soften > 0 ? hardRow[ywi] : bed.hard) * 0.42 + grain * 0.10 - (bed.marker ? 0.26 : 0);
      hn -= seam * 0.30 * markers;
      hgt[i] = clamp(hn, 0, 1);
      px[j + 3] = clamp(0.86 - grain * 0.06, 0.45, 1) * 255; // matte rough
    }
  }
  applyTone(px, tone);
  return {
    albedo: canvasToTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 2.6, anisotropy),
  };
}

function makeGroundLayer(
  seed: number,
  kind: 'rock' | 'mud',
  anisotropy: number,
  tone: ToneFunction | null = null,
  roughMul = 1,
): TerrainTextureLayer {
  const steps = makeGroundLayerSteps(seed, kind, anisotropy, tone, roughMul);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

function* makeGroundLayerSteps(
  seed: number,
  kind: 'rock' | 'mud',
  anisotropy: number,
  tone: ToneFunction | null = null,
  roughMul = 1,
): Generator<void, TerrainTextureLayer, void> {
  const s = texSize(256); // loading-speed r1: sourced 1K set replaces this fallback
  const noi = new SimplexNoise({ random: mulberry32(seed) });
  const px = new Uint8ClampedArray(s * s * 4);
  const hgt = new Float32Array(s * s);
  let nStrength = 2.0;
  for (let y = 0; y < s; y++) {
    const v = y / s;
    for (let x = 0; x < s; x++) {
      const u = x / s, i = y * s + x, j = i * 4;
      let rough = 0.9, hn = 0.5;
      if (kind === 'rock') {
        const tone = torusNoise(noi, u, v, 3, 3, 17) * 0.5 + 0.5;
        const r1 = 1 - Math.abs(torusNoise(noi, u, v, 6, 6, 41));
        const r2 = 1 - Math.abs(torusNoise(noi, u, v, 15, 15, 8));
        const ridge = r1 * 0.62 + r2 * 0.38;
        const crack = smoothstep(0.86, 0.985, ridge);
        hn = 0.72 - crack * 0.62 + (tone - 0.5) * 0.34;
        _col.setHSL(0.082, 0.055 + tone * 0.035, (0.40 + tone * 0.14) * (1 - crack * 0.45));
        rough = 0.76 + crack * 0.12 - tone * 0.06;
        nStrength = 3.0;
      } else { // mud
        const macro = torusNoise(noi, u, v, 3, 3, 29) * 0.5 + 0.5;
        const rip = torusNoise(noi, u, v, 42, 42, 13) * 0.5 + 0.5;
        const puddle = smoothstep(0.56, 0.76, macro);
        hn = macro * 0.55 + rip * 0.18 - puddle * 0.28 + 0.25;
        _col.setHSL(0.068, 0.27 - puddle * 0.12, 0.145 + (1 - puddle) * 0.075 + rip * 0.028);
        // matte floor ~0.74: puddle texels used to dip to 0.46 and bloomed
        // into white glitter patches under the sun at grazing angles
        rough = 0.84 - puddle * 0.10;
        nStrength = 1.5;
      }
      hn = clamp(hn, 0, 1);
      hgt[i] = hn;
      const cav = 0.72 + 0.28 * hn; // cavity darkening baked into albedo
      px[j] = _col.r * cav * 255; px[j + 1] = _col.g * cav * 255; px[j + 2] = _col.b * cav * 255;
      // 0.45 floor: 0.03 was mirror-glossy — at grazing view·sun geometry the
      // GGX lobe blew the whole sun-facing midground to white sparkle (flyby)
      px[j + 3] = clamp(rough * roughMul, 0.45, 1) * 255; // roughness packed in albedo alpha
    }
    // Preserve the exact pixel/noise order while letting covered terrain work
    // reach its existing pacing/cancellation owner every eight painted rows.
    // No texture or partially completed layer is published across these yields.
    if ((y & 7) === 7) yield;
  }
  applyTone(px, tone);
  return {
    albedo: canvasToTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, nStrength, anisotropy),
  };
}

// R = road core, G = wheel ruts, B = marsh wetness, A = worn village/bank soil.
// Road coverage is filtered to the actual 2–4 metre texel footprint. Keeping
// sub-texel hard borders here causes repeated scallops after interpolation.
export function makeMaskTexture(
  seedNoi: SimplexNoise,
  layout: TerrainLayout,
  landformW: HeightField['_mesaW'] = null,
  waterWetnessAt: HeightField['_waterWetnessAt'] | null = null,
  shoreDirtStart: number | null = null,
  sorWetnessAt: HeightField['_sorWetnessAt'] | null = null,
  viaductCut = false,
): THREE.DataTexture {
  const _VILLAGE = layout.village;
  const activityWear = layout.terrain.villageWear === 'activity-patches';
  const plotWear = layout.terrain.villageWear === 'plots' ? createVillagePlotWear(layout) : null;
  // MOBILE r1: tier-scaled mask (features derive from T = s/MAP_SIZE, so the
  // bake is resolution-relative; mobile trades 0.5 m/texel road-edge crispness
  // for a 16 MB saving on its ~192 MB budget)
  // Loading-speed r1: the mask covers a 1024 m battlefield; 512² gives one
  // texel per 2 m, still finer than the rendered terrain grid (~2.7 m).
  // The former 2048² bake spent 16x the pixels on sub-grid information.
  const s = texSize(512), T = s / MAP_SIZE;
  // r6 terrain_environment: landform (mesa/rim) weight pre-sampled on a
  // coarse grid (the field is ~700 m wavelength; 4 m texels bilerped) so the
  // 2048^2 mask bake stays cheap — B channel carries it on landformW maps.
  const LG = 257, LCELL = MAP_SIZE / (LG - 1);
  function createLandGrid(): Float32Array | null {
    if (!landformW) return null;
    const grid = new Float32Array(LG * LG);
    for (let gz = 0; gz < LG; gz++) {
      for (let gx = 0; gx < LG; gx++) {
        grid[gz * LG + gx] = clamp(landformW(gx * LCELL - HALF, gz * LCELL - HALF), 0, 1);
      }
    }
    return grid;
  }
  const landGrid = createLandGrid();
  function landAt(x: number, z: number): number {
    const grid = landGrid;
    if (!grid) return 0;
    const gx = clamp((x + HALF) / LCELL, 0, LG - 1.0001);
    const gz = clamp((z + HALF) / LCELL, 0, LG - 1.0001);
    const x0 = gx | 0, z0 = gz | 0, fx = gx - x0, fz = gz - z0;
    const i = z0 * LG + x0;
    const a = grid[i] + (grid[i + 1] - grid[i]) * fx;
    const b = grid[i + LG] + (grid[i + LG + 1] - grid[i + LG]) * fx;
    return a + (b - a) * fz;
  }
  const dist = new Float32Array(s * s).fill(1e9);
  // 2026-10-05: a styled road net keeps each texel's nearest line and that segment's heading (the road layer below)
  const roadStyles = layout.roadStyles ?? null;
  const nearestRoad = roadStyles ? new Int16Array(s * s).fill(-1) : null;
  // roads lane (2026-10-09): every map's roads keep each texel's nearest segment's heading and the running length of its
  // nearest point along that line (the road frame layer below: the surface's along-road coordinate, exact on a bend)
  const frameOn = layout.roads.length > 0;
  const nearestHeading = roadStyles || frameOn ? new Float32Array(s * s) : null;
  const nearestArc = frameOn ? new Float32Array(s * s) : null;
  const nearestSide = frameOn ? new Int8Array(s * s) : null;
  function rasterizeRoadDistances(): void {
    for (let ri = 0; ri < layout.roads.length; ri++) {
      const nodes = layout.roads[ri];
      let arc0 = 0;
      for (let sg = 0; sg < nodes.length - 1; sg++, arc0 += Math.hypot(nodes[sg][0] - nodes[sg - 1][0], nodes[sg][1] - nodes[sg - 1][1])) {
        const [ax, az] = nodes[sg], [bx, bz] = nodes[sg + 1];
        const heading = Math.atan2(bz - az, bx - ax), segLen = Math.hypot(bx - ax, bz - az);
        const x0 = clamp(Math.floor((Math.min(ax, bx) - 14 + HALF) * T), 0, s - 1);
        const x1 = clamp(Math.ceil((Math.max(ax, bx) + 14 + HALF) * T), 0, s - 1);
        const z0 = clamp(Math.floor((Math.min(az, bz) - 14 + HALF) * T), 0, s - 1);
        const z1 = clamp(Math.ceil((Math.max(az, bz) + 14 + HALF) * T), 0, s - 1);
        for (let tz = z0; tz <= z1; tz++) for (let tx = x0; tx <= x1; tx++) {
          const { d, t: along } = segDist((tx + 0.5) / T - HALF, (tz + 0.5) / T - HALF, ax, az, bx, bz);
          const i = tz * s + tx;
          if (d < dist[i]) {
            dist[i] = d;
            if (nearestRoad) nearestRoad[i] = ri;
            if (nearestHeading) nearestHeading[i] = heading;
            if (nearestArc) nearestArc[i] = arc0 + along * segLen;
            // (the side of the line the texel centre stands on: + left of the heading)
            if (nearestSide) {
              const px0 = (tx + 0.5) / T - HALF, pz0 = (tz + 0.5) / T - HALF;
              nearestSide[i] = (bx - ax) * (pz0 - az) - (bz - az) * (px0 - ax) >= 0 ? 1 : -1;
            }
          }
        }
      }
    }
  }
  rasterizeRoadDistances();
  const px = new Uint8ClampedArray(s * s * 4);
  function paintRoadMask(x: number, z: number, i: number, j: number): void {
    const d = dist[i];
    if (d >= 13) return;
    // edge wobble + a slow width modulation so the road narrows/widens
    // along its length instead of running at one constant gauge
    const wob = seedNoi.noise(x * 0.055, z * 0.055) * 0.8 + seedNoi.noise(x * 0.21, z * 0.21) * 0.35;
    const wid = seedNoi.noise(x * 0.011 + 41, z * 0.011 - 17) * 1.5;
    // (a styled path's own carriageway: the core's edge moves by its half-width less the map's 3.85 m gauge)
    const styleHalf = nearestRoad && nearestRoad[i] >= 0 ? roadStyleHalfWidth(roadStyles![nearestRoad[i]]) : 0;
    const core = roadCoreMask(d, wob, wid + (styleHalf > 0 ? styleHalf - 3.85 : 0), 1 / T);
    px[j] = core * 255;
    // road pass 2026-09-12 (owner: "the roads are so flat"): G is the
    // centreline DISTANCE field (12 m -> byte 0, 0 m -> 255). Bilinear
    // filtering of a distance ramp is exact away from the centre kink, so the
    // shader evaluates the carriageway edge, the twin wheel lanes and the
    // crown analytically per pixel. The former Gaussian lane bytes could not
    // survive 2 m texels: they read as beads along every straight road.
    px[j + 1] = Math.max(0, 1 - d / 12) * 255;
  }
  // maps lane B (2026-10-03): a sor's crust follows its fill (sorWetnessAt), not its stations' circles
  const discMarshes = sorWetnessAt ? layout.marshes.filter((m) => m.sorFlat === undefined) : layout.marshes;
  function sampleMarshMask(x: number, z: number): number {
    const wet = waterWetnessAt ? waterWetnessAt(x, z)
      : sampleShorelineMask(discMarshes, layout.lakes, x, z);
    return sorWetnessAt ? Math.max(wet, sorWetnessAt(x, z)) : wet;
  }
  function paintVillageMask(x: number, z: number, j: number): void {
    const dx = Math.max(_VILLAGE.x0 - x, x - _VILLAGE.x1, 0);
    const dz = Math.max(_VILLAGE.z0 - z, z - _VILLAGE.z1, 0);
    const vm = 1 - smoothstep(0, 26, Math.hypot(dx, dz));
    if (vm <= 0) return;
    if (plotWear) {
      // the plots' edges box-filtered over the 2 m texel (four samples): a plot's boundary crosses the texel grid at any
      // angle along a curving street, and a point sample stair-stepped it
      const q = 0.25 / T;
      px[j + 3] = vm * 0.25 * (plotWear(x - q, z - q) + plotWear(x + q, z - q) + plotWear(x - q, z + q) + plotWear(x + q, z + q)) * 255;
      return;
    }
    const patch = 0.45 + 0.55 * (seedNoi.noise(x * 0.045 - 19, z * 0.045 + 8) * 0.5 + 0.5);
    px[j + 3] = vm * patch * 0.8 * 255;
  }
  // map revival lane 2 (townPaving): the ground under a dry viaduct's deck (its span, to the road field's 12 m) is the gorge's
  // bed and walls, not the road that rides the deck over them
  const viaducts = viaductCut ? (layout.terrain.bridges ?? []).map((b) => ({ x: b.x, z: b.z, ux: Math.cos(b.yawDeg * Math.PI / 180),
    uz: Math.sin(b.yawDeg * Math.PI / 180), hl: b.spanM / 2, hw: Math.max(b.widthM / 2, 12) })) : [];
  function underViaduct(x: number, z: number): boolean {
    for (const v of viaducts) {
      const dx = x - v.x, dz = z - v.z;
      if (Math.abs(dx * v.ux + dz * v.uz) <= v.hl && Math.abs(dx * v.uz - dz * v.ux) <= v.hw) return true;
    }
    return false;
  }
  function paintMaskPixels(): void {
    for (let tz = 0; tz < s; tz++) {
      const z = (tz + 0.5) / T - HALF;
      for (let tx = 0; tx < s; tx++) {
        const x = (tx + 0.5) / T - HALF, i = tz * s + tx, j = i * 4;
        if (!underViaduct(x, z)) paintRoadMask(x, z, i, j);
        px[j + 2] = (landGrid ? landAt(x, z) : sampleMarshMask(x, z)) * 255;
        // Existing roads and liquid margins keep every original mask channel.
        // Only dry, off-road settlement soil moves to authored yard footprints.
        if (!activityWear || px[j] || px[j + 2]) paintVillageMask(x, z, j);
      }
    }
  }
  paintMaskPixels();
  // roads lane (2026-10-10): the road layers read the road raster (dist) — build them before the shore stamp below reuses
  // that raster for its own distances (Tidegate Polders' clinker, Amberford's and Mangrove's frames were empty: every
  // texel read its distance to the water)
  // 2026-10-05: the road layer (stacked under the mask: stackLandUseBake), a texel per mask texel within the 12 m ramp of a
  // styled net's roads — R the nearest path's class (ROAD_SURFACE_CODE, 0 its map's own), G its half-width in decimetres
  // (0 the map's gauge), B A the segment's heading (16 bits of a turn)
  let roadLayerData: Uint8Array | null = null;
  if (nearestRoad) {
    const road = new Uint8Array(s * s * 4);
    for (let i = 0; i < s * s; i++) {
      const ri = nearestRoad[i];
      if (ri < 0 || dist[i] >= 11.9) continue; // (inside the distance ramp: G > 0 wherever a class is)
      const style = roadStyles![ri];
      if (!style) continue;
      road[i * 4] = (style.surface ? ROAD_SURFACE_CODE[style.surface] ?? 0 : 0) | (style.catalogue ? 128 : 0);
      road[i * 4 + 1] = Math.round(roadStyleHalfWidth(style) * 10);
      const turn = nearestHeading![i] / (2 * Math.PI);
      const code = Math.round((turn - Math.floor(turn)) * 65536) & 65535;
      road[i * 4 + 2] = code >> 8; road[i * 4 + 3] = code & 255;
    }
    roadLayerData = road;
  }
  // roads lane (2026-10-09): the road frame layer (stacked under the mask after the road layer), a texel per mask texel
  // within 14 m of any road — R G the running length of the nearest line at its nearest point (15 bits, 1/64 m, wrapping
  // at 512 m) under the side bit (R's top bit: the texel centre stands right of the heading), B A the segment's heading
  // (16 bits of a turn). The shader adds the pixel's offset from the texel's centre along that heading, so a pattern laid
  // along the road (wheel tread, washboard, sett courses) keeps its pitch on a bend, where dot(wp, heading) runs fast or
  // backwards (|wp| / radius); and the texel centre's own exact distance (the mask's G at that texel) on its side plus the
  // pixel's offset across the heading gives the exact signed offset from the centreline, where the bilinear distance
  // field reads up to a texel high (a centre line, the wheel paths of a paved street)
  let roadFrameData: Uint8Array | null = null;
  if (nearestArc) {
    const frame = new Uint8Array(s * s * 4);
    for (let i = 0; i < s * s; i++) {
      if (dist[i] >= 14) continue;
      const arc = (Math.round(nearestArc[i] * ROAD_FRAME_ARC_UNITS) & 32767) | (nearestSide![i] < 0 ? 32768 : 0);
      frame[i * 4] = arc >> 8; frame[i * 4 + 1] = arc & 255;
      const turn = nearestHeading![i] / (2 * Math.PI);
      const code = Math.round((turn - Math.floor(turn)) * 65536) & 65535;
      frame[i * 4 + 2] = code >> 8; frame[i * 4 + 3] = code & 255;
    }
    roadFrameData = frame;
  }
  if (layout.terrain.hardstands?.length) {
    stampHardstandRoadMask(layout.terrain.hardstands, px, s, MAP_SIZE);
  }
  if (shoreDirtStart !== null) {
    // The road-distance raster has no further consumers. Reuse it without
    // touching the height field's separate persistent road/water queries.
    stampShoreDirtMask(px, dist, s, MAP_SIZE, shoreDirtStart);
  }
  if (layout.terrain.workedGround?.length) {
    stampWorkedGroundMask(px, s, MAP_SIZE, layout.terrain.workedGround, seedNoi);
  }
  // DataTexture, NOT canvas: this texture carries DATA in its channels with
  // alpha (village wear) near 0 over most of the map — the 2D canvas backing
  // store is premultiplied, so putImageData ZEROES the road/rut/marsh RGB
  // wherever alpha == 0. Every mask-driven feature (road core texture, ruts,
  // the winter lake ICE channel) silently vanished through the canvas path.
  const t = new THREE.DataTexture(new Uint8Array(px.buffer), s, s, THREE.RGBAFormat);
  // flipY=false: row 0 (z=-512) must land at V=0 — mUV.y=(z+512)/1024. (The
  // old canvas path uploaded flipped, i.e. z-MIRRORED — verified live: the
  // lake's mask disc rendered at (x,+z) instead of (x,-z).)
  t.flipY = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  // (the road and road frame layers, built from the road raster before the shore stamp reused it)
  if (roadLayerData) t.userData.roadLayer = { data: roadLayerData, n: s };
  if (roadFrameData) t.userData.roadFrame = { data: roadFrameData, n: s };
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/**
 * Ground lane (2026-10-04, wave 69 on Verdant's establishing view: "the mid-field has several near-circular blotches of
 * slightly different green/yellow tone that read as round texture-paint strokes rather than the rectilinear hedge- and
 * fence-bounded plots a real farmed valley would show"): the village's worn ground laid out as its plots instead of
 * 22 m noise patches. Every point fronts its nearest street; along it the plots run 15–21 m wide, and back from it a
 * yard (the house's, trodden), a kitchen garden or a paddock behind, and beyond them the open ground. Each plot is
 * worked its own way by its hash — a dug garden, a trodden yard, a grass paddock, an orchard's sward — with a path
 * between neighbours. Returns the wear (the mask's A) at (x, z); the caller scales it by the village rect's feather.
 */
function createVillagePlotWear(layout: TerrainLayout): (x: number, z: number) => number {
  const v = layout.village, reach = 26 + 60;
  // the streets near the village: every road segment within reach of its rect, with its running length
  const segs: { ax: number; az: number; tx: number; tz: number; len: number; s0: number; road: number }[] = [];
  layout.roads.forEach((nodes, road) => {
    let acc = 0;
    for (let i = 0; i + 1 < nodes.length; i++) {
      const [ax, az] = nodes[i], [bx, bz] = nodes[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len > 1e-6 && Math.max(Math.min(ax, bx) - v.x1, v.x0 - Math.max(ax, bx), Math.min(az, bz) - v.z1, v.z0 - Math.max(az, bz)) < reach) {
        segs.push({ ax, az, tx: (bx - ax) / len, tz: (bz - az) / len, len, s0: acc, road });
      }
      acc += len;
    }
  });
  const hash = (a: number, b: number, c: number): number => {
    let h = Math.imul(a + 0x9e37, 0x85ebca6b) ^ Math.imul(b + 0x7f4a, 0xc2b2ae35) ^ Math.imul(c + 0x2545, 0x27d4eb2f);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
    return (h >>> 8) / 16777216;
  };
  return (x: number, z: number): number => {
    let best = Infinity, along = 0, side = 1, road = -1;
    for (const g of segs) {
      const px = x - g.ax, pz = z - g.az;
      const t = Math.min(g.len, Math.max(0, px * g.tx + pz * g.tz));
      const ex = px - t * g.tx, ez = pz - t * g.tz, d = ex * ex + ez * ez;
      if (d < best) { best = d; along = g.s0 + t; side = g.tx * pz - g.tz * px >= 0 ? 1 : -1; road = g.road; }
    }
    if (road < 0) return 0.15;
    const back = Math.sqrt(best);
    // the plot along the street (its width by its own hash) and its edges
    const w = 15 + 6 * hash(road, side, Math.floor(along / 21));
    const idx = Math.floor(along / w), u = along - idx * w, edgeU = Math.min(u, w - u);
    const h = hash(road, side * 7 + 3, idx);
    const yardD = 18 + 10 * h, gardenD = yardD + 26 + 18 * hash(road, side * 7 + 5, idx);
    if (back < 6) return 0.55; // the street's own trodden verge (the road mask draws the carriageway)
    let wear: number, kind: number;
    // (hold 26: three yards in four trodden and nearly half the back plots dug read as a village of bare earth — most
    // yards are grass with a trodden path, a third of the back plots dug)
    if (back < yardD) { kind = 0; wear = h < 0.40 ? 0.46 : 0.10; } // a trodden yard, or a front garden left to grass
    else if (back < gardenD) {
      kind = 1;
      const g = hash(road, side * 7 + 9, idx);
      wear = g < 0.34 ? 0.86 : g < 0.56 ? 0.16 : 0.07; // a dug kitchen garden, an orchard's sward, a paddock
    } else { kind = 2; wear = 0.10; } // the open ground behind
    // the path or fence line between neighbours, and the cross path behind the yard
    const edgeV = Math.min(Math.abs(back - yardD), kind > 0 ? Math.abs(back - gardenD) : Infinity);
    if (kind < 2 && (edgeU < 0.7 || edgeV < 0.7)) wear = Math.max(wear, 0.42);
    return wear;
  };
}

/** Rows of gutter between the ground mask and the land-use bake in their stack (a 64-row alignment for the mips). */
const MASK_STACK_GUTTER = 64;
/**
 * The ground mask with the land-use bake stacked under it (2026-10-03, the GPU fix): one RGBA8 texture, so the material
 * reads the bake through the mask's own sampler (it sits at the 16-unit limit). Rows [0, W) the mask, then 64 rows
 * repeating its last row, 64 repeating the bake's first, then the bake's layers of n rows each (landUse.ts
 * bakeLandUseSteps: the field, its edge offsets, the warp's Jacobian; every row padded to W with its last texel). The mask and the bake start and end on 64-row
 * boundaries, so the mip chain's box filter never mixes them below level 6 and the mask keeps its own mips; its reads
 * clamp half a texel inside its rows (maskAt) and the bake is fetched exactly at level 0 (lu_field). Without a bake the
 * mask goes through unchanged (the stack's uniforms then address it whole).
 * 2026-10-05: a styled road net's road layer (makeMaskTexture: the nearest path's class, half-width and heading, one
 * texel per mask texel over the square) goes under the bake's layers, or in their place, fetched exactly as they are
 * (uRoadClass = (its texels a side, its first row, 1, 0); (1, 0, 0, 0) without one).
 * 2026-10-09 (roads lane): every map's road frame layer (makeMaskTexture: the nearest line's running length and heading)
 * goes last, fetched exactly (uRoadFrame, the same form).
 */
export function stackLandUseBake(ground: THREE.DataTexture, bake: Uint8Array | null, n: number,
  road: { data: Uint8Array; n: number } | null = null, frame: { data: Uint8Array; n: number } | null = null): {
  texture: THREE.DataTexture; stack: THREE.Vector4; bake: THREE.Vector4; road: THREE.Vector4; frame: THREE.Vector4;
} {
  const W = ground.image.width, rows = ground.image.height;
  if (!bake && !road && !frame) {
    return { texture: ground, stack: new THREE.Vector4(1, 0.5 / W, 1 - 0.5 / W, 1 / rows), bake: new THREE.Vector4(1, MAP_SIZE, 0, 1 / W),
      road: new THREE.Vector4(1, 0, 0, 0), frame: new THREE.Vector4(1, 0, 0, 0) };
  }
  const layers = bake ? bake.length / (n * n * 4) : 0;
  if (bake && (n > W || !Number.isInteger(layers) || layers < 1)) throw new Error('stackLandUseBake: the bake must be whole n × n RGBA8 layers with n ≤ the mask width');
  if (road && (road.n > W || road.data.length !== road.n * road.n * 4)) throw new Error('stackLandUseBake: the road layer must be one n × n RGBA8 layer with n ≤ the mask width');
  if (frame && (frame.n > W || frame.data.length !== frame.n * frame.n * 4)) throw new Error('stackLandUseBake: the road frame layer must be one n × n RGBA8 layer with n ≤ the mask width');
  const row0 = rows + 2 * MASK_STACK_GUTTER, roadRow0 = row0 + layers * n, frameRow0 = roadRow0 + (road ? road.n : 0);
  const H = frameRow0 + (frame ? frame.n : 0);
  const data = new Uint8Array(W * H * 4);
  const src = ground.image.data as Uint8Array;
  data.set(src.subarray(0, W * rows * 4));
  const last = src.subarray((rows - 1) * W * 4, rows * W * 4);
  for (let r = 0; r < MASK_STACK_GUTTER; r++) data.set(last, (rows + r) * W * 4);
  const padded = new Uint8Array(W * 4);
  const layerRow = (src: Uint8Array, m: number, j: number): Uint8Array => {
    padded.set(src.subarray(j * m * 4, (j + 1) * m * 4));
    const edge = src.subarray(((j + 1) * m - 1) * 4, (j + 1) * m * 4);
    for (let i = m; i < W; i++) padded.set(edge, i * 4);
    return padded;
  };
  if (bake) layerRow(bake, n, 0); else if (road) layerRow(road.data, road.n, 0); else layerRow(frame!.data, frame!.n, 0);
  for (let r = 0; r < MASK_STACK_GUTTER; r++) data.set(padded, (rows + MASK_STACK_GUTTER + r) * W * 4);
  if (bake) for (let j = 0; j < layers * n; j++) data.set(layerRow(bake, n, j), (row0 + j) * W * 4);
  if (road) for (let j = 0; j < road.n; j++) data.set(layerRow(road.data, road.n, j), (roadRow0 + j) * W * 4);
  if (frame) for (let j = 0; j < frame.n; j++) data.set(layerRow(frame.data, frame.n, j), (frameRow0 + j) * W * 4);
  const texture = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  texture.flipY = false;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = ground.minFilter; texture.magFilter = ground.magFilter;
  texture.generateMipmaps = ground.generateMipmaps; texture.anisotropy = ground.anisotropy;
  texture.needsUpdate = true; texture.name = 'terrain:maskStack';
  return { texture, stack: new THREE.Vector4(rows / H, 0.5 / W, 1 - 0.5 / W, 1 / H),
    bake: bake ? new THREE.Vector4(n, MAP_SIZE, row0, 1 / W) : new THREE.Vector4(1, MAP_SIZE, 0, 1 / W),
    road: road ? new THREE.Vector4(road.n, roadRow0, 1, 0) : new THREE.Vector4(1, 0, 0, 0),
    frame: frame ? new THREE.Vector4(frame.n, frameRow0, 1, 0) : new THREE.Vector4(1, 0, 0, 0) };
}

function makeShaderNoiseTexture(_seed: number): THREE.CanvasTexture {
  // seed stays 3011: the RG channels quantize the SAME Float32 fields the
  // CPU twin (sampleSplatNoise) samples — shared bake, see splatFields().
  const s = SPLAT_FIELD_S;
  const { a, b } = splatFields();
  const px = new Uint8ClampedArray(s * s * 4);
  for (let j = 0; j < s * s; j++) {
    px[j * 4] = (a[j] * 0.5 + 0.5) * 255;
    px[j * 4 + 1] = (b[j] * 0.5 + 0.5) * 255;
    px[j * 4 + 2] = 0; px[j * 4 + 3] = 255; // ground lane: B carries the woods mask (applyWoodsMask), empty until then
  }
  // r5: aniso 16 (was 1) — this texture feeds UNCONDITIONAL albedo terms
  // (0.90 + n2*0.20, far mottling, meadow tints). At aniso 1 every steep face
  // seen at a grazing angle smeared those terms into long downslope "rain
  // streak" strands — the furry mesa-flank artifact.
  const texture = canvasToTexture(px, s, { anisotropy: 16 });
  // Ground lane (2026-10-05, the lab's readback over 200 m of Saltwind: the shader's R and G against the twin's fields,
  // mean |Δ| 0.126 as the twin reads them and 0.0013 with v turned over): a canvas uploads flipped (its top row at v = 1),
  // so the shader read every field mirrored in z against its CPU twin — the tufts and the tall grass thinned where the
  // ground drew green and stood on its bare patches, and the karst twin's soil was another place's. Row 0 at v = 0, as
  // the land-use mask (its own z-mirror, fixed the same way) and the twin's fieldSample read it.
  texture.flipY = false;
  return texture;
}

/**
 * Ground lane (2026-10-05): the woods mask (vegetation.ts _woodsMask, size² cells over the square, row j at z from
 * -512) into the noise texture's blue channel — row j into canvas row j, the row the shader's woods read
 * (nz(wp.xz, 1/1024, 0.5).b) samples now the texture uploads unflipped (makeShaderNoiseTexture).
 */
function stampWoodsMaskRows(data: Uint8ClampedArray, mask: Float32Array, size: number): void {
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) data[(j * size + i) * 4 + 2] = Math.round(Math.max(0, Math.min(1, mask[j * size + i])) * 255);
  }
}

// ---------------------------------------------------------------------------
// Splat material
// ---------------------------------------------------------------------------

function _mustReplace(src: string, anchor: string, replacement: string): string {
  const out = src.replace(anchor, replacement);
  if (out === src) throw new Error(`world/terrain: shader anchor missing: ${anchor}`);
  return out;
}

/** World direction toward the sun for a map's sky preset — the same formula the vista ring uses (horizon.ts). */
function skySunDirection(sky: { sunAzimuthDeg?: number; sunElevationDeg?: number } | null | undefined): THREE.Vector3 {
  const sunAz = (sky?.sunAzimuthDeg ?? 115) * Math.PI / 180;
  const sunEl = (sky?.sunElevationDeg ?? 32) * Math.PI / 180;
  return new THREE.Vector3(Math.sin(sunAz) * Math.cos(sunEl), Math.sin(sunEl), Math.cos(sunAz) * Math.cos(sunEl));
}
const SPLAT_COMMON_FRAG = /* glsl */`
#define MID_SWARD_GAIN 0.5
varying vec3 vWPos;
varying vec3 vWNormal;
uniform sampler2D uAlbG, uAlbD, uAlbR, uAlbM;
uniform sampler2D uNrmG, uNrmD, uNrmR, uNrmM;
uniform sampler2D uMask, uNoise;
uniform float uMaskSize;
// ground lane (2026-10-03, the land-use bake): uMask holds the ground mask in its first rows and the land use baked under
// it (stackLandUseBake) — uMaskStack = (the mask's share of the stack's height, the half-texel clamp, 1 − it, 1 / the
// stack's height); every mask read goes through maskAt, half a texel inside the mask's rows
uniform vec4 uMaskStack;
// 2026-10-05: a styled road net's road layer in the stack (stackLandUseBake): (its texels a side, its first row, 1, 0)
uniform vec4 uRoadClass;
float gRoadTex = 0.0;        // the road's paved share here: the map's uRoadTex, 1 inside a paved town rect (SplatConfig
                             // townPaving, map revival lane 2), or a styled path's own surface (asphalt, setts) over both
float gRoadClass = 0.0;      // a styled path's surface (terrain.ts ROAD_SURFACE_CODE): 0 the map's own road
// roads lane (2026-10-09): the road frame (uRoadFrame, the stack's frame layer): the nearest line's heading, the running
// length along it at this pixel (m, wrapping at 1024 m) and 1 where the frame holds (inside the square, on a road's ramp)
uniform vec4 uRoadFrame;
vec2 gRoadAlong = vec2(1.0, 0.0);
float gRoadS = 0.0;
float gRoadY = 0.0; // the signed offset from the centreline (m, + left of the heading), exact where the frame holds
float gRoadYOk = 0.0; // 1 where gRoadY agrees with the distance field (no pad stamp, no other road's texel)
float gRoadFrameW = 0.0;
vec2 gRoadDir = vec2(1.0, 0.0); // the styled path's heading here (world xz)
vec4 maskAt(vec2 uv) {
  return texture2D(uMask, vec2(clamp(uv.x, uMaskStack.y, uMaskStack.z), clamp(uv.y, uMaskStack.y, uMaskStack.z) * uMaskStack.x));
}
// Terrain v2 (2026-10-01, the cost pass): each albedo layer's linear tile mean (rgb) and mean packed roughness (a),
// measured from the layer's own image (terrain.ts layerAlbedoMean) when it is painted or swapped for its sourced set.
// They stand in for the deep-mip "tile mean" fetches the far variant and the zero-mean octaves used to take.
uniform vec4 uMeanG, uMeanD, uMeanR, uMeanM;
uniform vec3 uTintA, uTintB, uTintC, uRoadTint;
uniform vec3 uSoilTint; // ground lane (wave 79): the land's soil where the dirt layer is drawn as soil (SplatConfig soilTint)
uniform float uPloughLift; // ground lane (wave 83): a turned field's tone over the darkened soil (SplatConfig ploughLift)
uniform float uMarshGloss;
uniform vec4 uFormation; // ground lane: (boundary y, its wander m, the boundary's half-width m, -); x < -1e8 = one formation
uniform vec4 uFormationLow; // the lower formation: a tint on the rock's luminance (rgb) and the share it takes (w)
uniform vec4 uFormationUp;  // the upper formation: likewise
uniform float uMicroAmp, uStrata, uRoadTex, uTownWear, uWornDirtStrength, uShoulderDirt, uLaneK, uIceDrift, uMidRelief, uFieldPatch;
uniform vec2 uWallWeather; // the Redrock lane: the joint blocks' tone step and the varnish streaks' darkening (default 0.26, 0.50)
uniform vec4 uJebelFace;   // the Redrock lane, round 9: x on (1) / off (0); y flutes, z tafoni, w varnish (splat.jebelFace)
uniform float uRippleNear; // the Redrock lane, round 10: the near ripple trains' strength (splat.rippleNear; rippleAmp's by default)
uniform vec3 uRoadRuts;    // the Redrock lane, round 10: the wheel lanes' relief gain, darkening and the carriageway's gravel
uniform float uRoadPuddle; // ground lane: the map's share of the ruts' puddles and their mud (splat.roadPuddles, default 1)
// roads lane (2026-10-09, terrain.ts roadSurfaceUniforms): the worked carriageway — (relief, stones, potholes, tread
// imprints) and (washboard, the dry road's tone floor against the field, the lanes' albedo share near the camera, the
// grader's windrow)
uniform vec4 uRoadSurf, uRoadSurfB;
// roads lane R1c (2026-10-09, terrain.ts pavedSurfaceUniforms): the paved surfaces — (street class, square class, setts in
// arcs, the gutter's width) by ROAD_SURFACE_CODE (0: the R layer's print), (patches, cracks, iron covers, —), and the
// kerbed town rect (centre xz, half-size xz; z 0 = no kerbs)
uniform vec4 uPaveClass, uPaveWear, uPaveTown;
// (R2) the procedural paving's (stone tone, a kerbed town's street class, centre lines, shell-hole fills)
uniform vec4 uPaveExtra;
// the map-borders lane (2026-10-03): 1 when the map's R layer is its paving (a cobble set: Cinder Junction, Steinburg,
// Ironworks, Kestrel) — its natural steep faces then take the D layer (bare ground) instead of drawing cobbles
uniform float uPavedRock;
uniform vec4 uPaveSlab;   // maps lane B (2026-10-03): airfield concrete (slab m, joint half-width m, stains, tyres); x 0 = off
uniform vec4 uTownPave;   // map revival lane 2 (2026-10-05): the paved town rect (centre xz, half-size xz); z 0 = off
// ground lane (2026-10-08): the village is a rail yard floored in cinder (groundRedux.ts cinderYard, Cinder Junction); 0 = off
uniform float uYardCinder;
// ground lane (2026-10-08, wave 274): the thatch and soil under a thick sward near the camera (groundRedux.ts thatch); 0 = off
uniform float uThatch;
uniform vec4 uSaltCrust;  // maps lane B (2026-10-03): a sor's salt crust (on, polygon cell m, damp margin, unused)
uniform vec4 uRipple; // xy = wind dir, z = ripple amplitude, w = shore-only
uniform float uSandMacro; // r3: desert macro variation (gravel basins / scour sheets)
uniform vec3 uIceSky;     // r3: fresnel sky tint reflected by clear lake ice
uniform float uMidFar;    // r3: far edge of the mid-relief dapple band (m)
uniform float uSlopeGrassHold; // round 45: shifts the slope→rock thresholds (tropical hills hold turf longer)
uniform vec2 uRingRock;        // round 49: slope band over which a ring face past the square becomes landform rock
uniform vec2 uRingCap;         // ground lane (wave 65): the height band over which the ring's ground becomes caprock (x > 1e8: off)
uniform vec2 uCaprockY;        // the Redrock lane: the height band over which the square's ground becomes caprock (x > 1e8: off)
uniform float uBeddedR;        // round 55: 1 when the R layer is the procedural bedded sandstone tile (no sourced R)
uniform vec3 uSunDirW;    // round 42: world direction toward the sun (the vista ring's uSunDirW)
uniform float uWallSkyLift; // round 42: sky light a steep face turned from the sun receives (0 = off)
float gWallSky = 0.0;     // round 42: steep × turned-from-the-sun weight, read by the indirect-light hook
float gVolcShade = 0.0;   // ground lane (wave 85): a volcanic basin's slope turned from the sun (its warm bounce, the lights hook)
// round 72b: the horizon ring's baked surface atlas (horizonRelief.ts: the fine relief's gradient, its occlusion and the
// sun's visibility over the annulus), read by the ring's terrain-material bands past the square so the first ridge
// carries the same striations, rock breaks, snow line, folds and cast shadows as the vista ranges behind it.
// This program sits at the GPU's sampler limit (ten layer samplers, four cascades, the environment map and three's DFG
// LUT = 16 = MAX_TEXTURE_IMAGE_UNITS): a seventeenth sampler fails to link. The atlas rides in the M (marsh/ice)
// normal's unit instead — the ring bands' draw binds it there (horizonAutumnGround.ts) with uRingDraw = 1, and the
// marsh normal is off during that draw (past the square its 19 cm tile is sub-pixel at every ring distance).
uniform float uRingDraw; uniform vec2 uRingReliefR; uniform float uRingReliefGrad; uniform float uRingReliefAmp;
float gRingAo = 1.0; float gRingSun = 1.0; vec2 gRingGrad = vec2(0.0);
// terrain v3: the slope band (of the ring's own geometric face) over which the atlas's fine-relief GRADIENT fades — the
// height-field relief is a slope's detail; on a near-vertical wall it printed dimples and chevrons (the occlusion and
// the sun visibility keep their full weight). (2, 3) = no fade.
uniform vec2 uRingReliefWall;
uniform float uRockGate;  // r6: 1 = slope-rock takeover keyed to the mask-B landform weight (desert mesas)
// the map-revival lane (2026-10-05): the terrace zones' bounding rects (x0, z0, x1, z1) and (count, feather m, the riser
// slope band's low and high edge) — terrainTerraceUniforms; count 0 on every map without terraces
uniform vec4 uTerraceRect[4];
uniform vec4 uTerraceParam;
float terraceZoneW(vec2 p) {
  float w = 0.0;
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uTerraceParam.x) break;
    vec4 r = uTerraceRect[i];
    vec2 d = min(p - r.xy, r.zw - p);
    w = max(w, smoothstep(0.0, uTerraceParam.y, min(d.x, d.y)));
  }
  return w;
}
uniform float uSea;       // maps r1: 1 = M layer is OPEN WATER (sea/river), 0 = legacy mud/ice
uniform float uSeaFoam;   // maps r1: surf/whitecap strength (0 disables)
uniform vec2 uSeaRamp;    // maps r1: fM band that ramps to open water (sea wide, river tight)
uniform vec4 uSeaOpenings[4]; // round 40: sea openings past the square (direction angle, half-width, shoulder, 0)
uniform vec4 uSeaBanks[4];
uniform float uSeaOpeningCount;
// Round 73 (2026-09-25, the ground redux — groundRedux.ts): four packed vectors and a clock, no sampler (the material
// sits at the 16-unit budget). uReduxA = (height-blend strength, mid-detail octave, scree band, snow glint);
// uReduxFold = (hollow moisture, fold occlusion, crest dryness, the ground lane's volcanic zoning); uReduxSwash = (swash rate rad/s or 0 for a still
// bank, band width in mask units, wet strength, 0); uReduxSnow = (scour/powder macro, drift amplitude, 0).
uniform vec4 uReduxA;
uniform vec4 uReduxFold;
uniform vec4 uReduxSwash;
uniform vec3 uReduxSnow;
uniform float uGroundTime;   // round 73: the world clock the swash breathes on (the water sheet's own time)
// Round 73b (2026-09-26, the second pass — the integrator's eye-check: the terrain terms and the strand were invisible
// at the ground-mid and strand views): two more packed vectors, still no sampler. uReduxB = (border lip, road verge,
// outcrop rim, mid albedo octave); uReduxC = (the outcrop rim's climate tint rgb, the snow drifts' lee edge).
// uReduxSwash.y is now the swash's mean reach in METRES (the band is read off the baked shore distance, not the mask's
// two-metre apron) and uReduxSwash.w the foam / wrack line strength.
uniform vec4 uReduxB;
uniform vec4 uReduxC;
// Terrain v2 (2026-10-01, grounded realism): uReduxD = (exposure strength, climate class 0 vegetated / 1 arid / 2 snow,
// bed irregularity 0..1, the cover's 2–8 m patchwork) — the slope-aspect ecology, the non-periodic bedding and the
// patchwork (groundRedux.ts), no sampler.
uniform vec4 uReduxD;
// ground lane (2026-10-03): the land use's field layout (landUse.ts) — three vec4 uniforms, no sampler
${LAND_USE_GLSL}
varying float vShore;        // metres landward of the waterline (32 = no shore near)
varying vec2 vRoadExit;      // the map-borders lane: [signed offset from a road exit line (m), presence] on the ring
varying vec2 vRailExit;      // the map-borders lane: [signed offset from a railway's open line (m), presence] on the ring
varying vec4 vBorderTint;    // the map-borders lane: the ring's field crop [colour / sward luminance x w, 1 - w] (default: none)
varying vec4 vBorderTrack;   // the map-borders lane: the ring's farm tracks, per family [1000 + metres, boundary] (0 = none)
float gScour = 0.0;          // round 73b: the wind-scoured crust (a satin sheen in the roughness stage)
float gStrandFoam = 0.0;     // round 73b: the foam line the last run-up left (matte in the roughness stage)
float gRoadPuddle = 0.0;     // ground lane: water standing in a road's ruts (smooth in the roughness stage)
float gFieldWater = 0.0;     // ground lane: a flooded paddy's or a polder ditch's water (smooth in the roughness stage)
float gCropW = 0.0;          // ground lane: a sown field's weight (not pasture or hay): the sward's own relief stands down there
float gCropReliefW = 0.0;    // ground lane (wave 274): gCropW for the sward's relief — none on a young green crop (a short sward)
float gSoilW = 0.0;          // ground lane: a bare field's weight (plough, terra rossa, a vineyard's earth, slag, ballast, gravel)
float gJebelMatte = 0.0;     // the Redrock lane, round 11b: a jebel face's weight (its sheen cut in the aomap stage)
float gLaneSheen = 0.0;      // ground lane (wave 86): a field track's pressed lane floor (its faint satin in the roughness stage)
float gYardOil = 0.0;        // ground lane (2026-10-08): a cinder yard's oil stains (a satin in the roughness stage)
vec3 gMeadowTint = vec3(1.0); // ground lane: the meadow's macro tint the base took (a field divides it back out)
varying float vFold;         // round 73: the baked fold attribute (−1 crest .. +1 hollow) the chunk vertices carry
float gFoldAO = 1.0;         // round 73: indirect occlusion in the folds, read by the aomap hook
vec3 gSplatAlbedo; float gSplatRough; vec3 gSplatNrm; float gSplatFar; float gSplatSteepAtt;
float gSeaFoam; // maps r1: foam coverage this fragment (mattes the water gloss)
// r7 axis-triplanar wall basis (set in splatCompute): two FIXED world-axis
// projections + a pow-sharpened blend weight. The r6 tangent projection built
// its U axis from the interpolated normal — on undulating cliff walls that
// frame rotated per-fragment, dragging the sample coordinate back and forth
// across the face (the melted-taffy smear on the desert mesas).
vec2 gWallUVx; vec2 gWallUVz; vec2 gWallSigns; float gWallW;
float gSnowRock = 0.0; // ground lane (wave 62): the snow lying on a snow map's rock (the rock passes below stand down under it)
float gRingCap = 0.0;  // ground lane (wave 65): the ring's caprock weight (ledges and tops high on its bedded walls)
float gCinderW = 0.0;  // ground lane (wave 62): a volcanic basin's cinder (the cones' flanks and their talus) — dead matte
float gTileMix; // r8 anti-tiling: stochastic rotation-blend weight (set in splatCompute)
float gCliffJ;  // r8: per-cliff jitter field (set with the wall basis)
float gBedWob = 0.0; // ground lane: the beds' wander in metres of height (set with the wall basis)
// Terrain v2 (2026-10-01, the cost pass — the material was ~60 % of Whiteout's GPU frame): the shared 256 px noise
// texture is read at an explicit isotropic level of detail. Its fields are smooth at every scale the material reads
// them (features of 9 m and up), yet the anisotropic sampler (x16, kept for the few near taps that still use the
// implicit path) spent up to sixteen trilinear probes per tap at a grazing view — the far ground of every skyline view.
// gNoiseLog is log2 of the fragment's footprint in noise texels at scale 1 (set once in splatCompute); a field read
// at scale s sits at level log2(footprint × s × 256), the level the hardware would pick for an isotropic footprint.
float gNoiseLog = 0.0;
vec4 nz(vec2 p, float s, vec2 o) { return textureLod(uNoise, p * s + o, max(0.0, gNoiseLog + log2(s))); }
// Ground lane (2026-10-03, the gauntlet's "moiré of concentric arcs in the grass"): a tiled texture read at a world
// period P is a periodic signal however well its mip chain is filtered — once one period spans only a few pixels of the
// fragment's footprint, the tile repeat itself beats against the pixel grid (concentric arcs from a raised camera, the
// round-73 mid octave's 1.08 m tile at 100–190 m). gFootM is the footprint's major axis (m per pixel, set once in
// splatCompute); tileVis(P) keeps a term whole while a period spans 10 px or more and fades it out by 4 px.
float gFootM = 0.01;
float tileVis(float periodM) { return smoothstep(4.0, 10.0, periodM / max(gFootM, 1e-4)); }
// ground lane (farmland): the world xz a pixel steps across and down the screen — a stripe of period P across the unit
// direction dir spans P / (|dFdx·dir| + |dFdy·dir|) px, so a field's furrows along the view hold their lines where furrows
// across it, foreshortened, fade (tileVis's major axis is the worst case of every direction)
vec2 gDwX = vec2(0.01, 0.0), gDwY = vec2(0.0, 0.01);
float stripeVis(float periodM, vec2 dir) {
  return smoothstep(4.0, 10.0, periodM / max(abs(dot(gDwX, dir)) + abs(dot(gDwY, dir)), 1e-4));
}
// (wave 69, the establishing views' ploughed foregrounds: "the ploughed field nearest the camera smears") stripeVis fades
// a stripe from 10 px a period, so a turned field's furrows and lands were mostly a blurred tone at 30–80 m. The pixel's
// own box filter of a sine keeps sinc(r) of it, r its footprint across the stripe in periods — 0.98 at 10 px a period,
// 0.90 at 4, 0.76 at 3 — and below 3.3 px a period, where the sampled stripe would beat into moiré, it fades out by 1.8
// (wave 81, Verdant's establishing view: the furrows still "smear into streaky, motion-blur-like banding and moiré" at
// the frame's bottom corners) at a grazing view the footprint is a long sliver along the view: a furrow nearly along it
// is resolved across but its phase races along the sliver, and the pixel's sample aliases there. The contrast goes to
// its mean as a period nears ~2 px along the footprint's LONG axis (gFootM) as well as across the stripe
float stripeAA(float periodM, vec2 dir) {
  float r = (abs(dot(gDwX, dir)) + abs(dot(gDwY, dir))) / periodM;
  float x = 3.14159 * min(r, 0.95);
  return (x < 1e-3 ? 1.0 : sin(x) / x) * (1.0 - smoothstep(0.30, 0.55, r)) * (1.0 - smoothstep(0.32, 0.50, gFootM / periodM));
}
// a ploughed land's tone is a band, not a sine: a square wave of period P across dir (its phase the sine's), its edges
// box-filtered over the pixel's footprint — crisp where a period spans pixels, fading as stripeAA does
float bandAA(float phase, float periodM, vec2 dir) {
  float r = (abs(dot(gDwX, dir)) + abs(dot(gDwY, dir))) / periodM;
  return clamp(sin(phase) / max(r * 6.2832, 1e-3), -1.0, 1.0) * (1.0 - smoothstep(0.30, 0.55, r))
    * (1.0 - smoothstep(0.32, 0.50, gFootM / periodM));
}
float gFarVis = 1.0; // ground lane: tileVis of the far variants' shortest tile (the base layer's 18 m)
// Ground lane: a field of the shared noise with no world period — the same texture read twice, at incommensurate
// scales and turned 42° apart, summed (its variance restored), so no blotch repeats on a grid (the round-73b
// patchwork's 17.5 m tile read as "softly repeating blotches at a readable, regular interval")
vec2 nzq(vec2 p, float s, vec2 o) {
  vec2 a = nz(p, s, o).rg;
  vec2 b = nz(vec2(0.7431 * p.x - 0.6691 * p.y, 0.6691 * p.x + 0.7431 * p.y), s * 0.7243, o.yx + vec2(0.37, 0.19)).gr;
  return clamp((a + b - 1.0) * 0.72 + 0.5, 0.0, 1.0);
}
// maps lane B (2026-10-03): two hash values in [0, 1) per integer cell, for the airfield's slab tones and the salt
// crust's desiccation polygons
vec2 cellHash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}
// the flat normal a layer's normal tile averages to (x, z perturbation 0; the packed third channel is unused)
const vec4 NRM_MEAN = vec4(0.5, 0.5, 0.5, 1.0);
vec4 splatSamp(sampler2D t, vec2 uv, float df, float mb, vec4 mean) {
  // Terrain v2: the near tap is skipped once the far variant owns the fragment (df ~ 1 past ~160 m), and the far
  // variant's deep-mip tile-mean tap is the layer's measured mean (a uniform) — one fetch at range instead of three.
  if (df < 0.004) return texture2D(t, uv, mb);
  // r5 terrain_environment: the far variant re-samples the SAME hand-painted
  // blade-stroke sheet at 0.2317x scale — its 7-12 px curved strokes became
  // half-meter Van Gogh brush swirls across the whole 45-160 m band (the
  // "painterly swirl" critique on the player_view midfield). A constant
  // +1.6 mip bias melts the stroke shapes into isotropic tonal breakup while
  // the macro clump variation the far variant exists for survives.
  // Keep resolved mid-range albedo grains; retain the former horizon blur.
  // This reuses the same fetch rather than adding another detail octave.
  vec4 farS = texture2D(t, uv * 0.2317 + vec2(0.5), mb + mix(0.85, 1.6, min(mb * 0.5, 1.0)));
  // r8: past the mid ring, ease the far variant toward its tile MEAN (deep
  // mip). The 16x anisotropic sampler otherwise keeps the ~18 m repeat's
  // blade/clod features crisp to the horizon, where they resolve as periodic
  // stipple rows on bright sand/snow albedo (mb tracks farM: 0 inside 90 m,
  // 2 by 330 m -> mean weight 0..0.66).
  // r6: mean weight floor 0.18 -> 0.30 — the far variant's 2-6 m macro blobs
  // repeated on the 18 m tile grid as a visible mottled-blotch print across
  // the 50-150 m midground (critique); softer far contrast + the uncorrelated
  // octave in splatCompute carry that band instead
  farS = mix(farS, mean, min(0.24 + mb * 0.30, 0.64));
  // ground lane: at a grazing view the far tile's own 18–40 m repeat shrinks to a few pixels deep (the stipple rows
  // past 300 m) — it eases to the tile mean there
  farS = mix(mean, farS, gFarVis);
  if (df > 0.996) return farS;
  return mix(texture2D(t, uv, mb), farS, df);
}
// r8 anti-tiling ground samplers: every ground layer tiles at ONE fixed world
// period (4.2 m near / 18 m far variant) — from the establishing camera the
// repeats compress into periodic stipple ROWS and the far variant's macro
// blobs stamp a hard-edged patchwork grid (worst on the winter snow set).
// Blend a second sampling of the SAME texture, rotated ~42 deg and rescaled
// x1.16 with an offset, masked by the warped ~10-20 m noise patches (n1w):
// no world-periodic feature survives more than ~one tile in any direction.
const mat2 TILEROT = mat2(0.7431, 0.6691, -0.6691, 0.7431);
// Fixed heightfield chart. Camera/normal-derived axes move pigment across a
// stationary surface. Its sampled normal must return to the world-XZ frame
// used by the existing terrain normal accumulator, via this chart's transpose.
vec2 groundChartUv(vec2 xz) {
  return vec2(TILEROT[0].x * xz.x + TILEROT[1].x * xz.y,
              TILEROT[0].y * xz.x + TILEROT[1].y * xz.y);
}
vec2 groundChartNormalXZ(vec2 encoded) {
  float u = encoded.x * 2.0 - 1.0;
  float v = encoded.y * 2.0 - 1.0;
  return vec2(TILEROT[0].x * u + TILEROT[0].y * v,
              TILEROT[1].x * u + TILEROT[1].y * v);
}
// Terrain v2: the rotation blend fetches only the sampling(s) its mask needs — the warped 10–20 m patches are fully
// one sampling or the other over about half the ground, so half the second fetches were multiplied by zero.
vec4 groundSamp(sampler2D t, vec4 mean, vec2 uv, float df, float mb) {
  if (gTileMix < 0.003) return splatSamp(t, uv, df, mb, mean);
  vec4 sB = splatSamp(t, TILEROT * uv * 1.16 + vec2(0.37, 0.61), df, mb, mean);
  if (gTileMix > 0.997) return sB;
  return mix(splatSamp(t, uv, df, mb, mean), sB, gTileMix);
}
// normal-map variant: the rotated sample's tangent-space xy must be counter-
// rotated back into the world frame or its bump lighting points 42 deg off
vec4 groundNrm(sampler2D t, vec2 uv, float df, float mb) {
  vec4 sA = vec4(0.5), sB = vec4(0.5);
  if (gTileMix < 0.997) sA = splatSamp(t, uv, df, mb, NRM_MEAN);
  if (gTileMix > 0.003) {
    sB = splatSamp(t, TILEROT * uv * 1.16 + vec2(0.37, 0.61), df, mb, NRM_MEAN);
    vec2 nB = sB.xy * 2.0 - 1.0;
    sB.xy = vec2(0.7431 * nB.x + 0.6691 * nB.y, -0.6691 * nB.x + 0.7431 * nB.y) * 0.5 + 0.5;
  }
  // Packed detail uses world X,Z,Y, not the normal texture's unused blue.
  // A horizontal projection has no vertical perturbation.
  sA.z = 0.5; sB.z = 0.5;
  return mix(sA, sB, gTileMix);
}
// Each wall projection has a different horizontal tangent, but both V axes
// point down world Y. Transform before blending: mixing encoded texture
// normals first incorrectly sends vertical wall relief along world Z.
vec3 wallNormalDelta(vec2 xNormal, vec2 zNormal) {
  vec2 nx = xNormal * 2.0 - 1.0;
  vec2 nz = zNormal * 2.0 - 1.0;
  return vec3(-gWallSigns.y * nz.x * gWallW,
    gWallSigns.x * nx.x * (1.0 - gWallW), -mix(nx.y, nz.y, gWallW));
}
// Terrain v2: the sharpened axis weight (pow 6) leaves most wall fragments on one projection; the other is fetched
// only inside the crossover band.
vec4 wallNrm(sampler2D t, float sc, float df, float mb) {
  vec4 sx = vec4(0.5), sz = vec4(0.5);
  if (gWallW < 0.997) sx = splatSamp(t, gWallUVx * sc, df, mb, NRM_MEAN);
  if (gWallW > 0.003) sz = splatSamp(t, gWallUVz * sc, df, mb, NRM_MEAN);
  return vec4(wallNormalDelta(sx.xy, sz.xy) * 0.5 + 0.5, mix(sx.a, sz.a, gWallW));
}
vec4 wallSamp(sampler2D t, vec4 mean, float sc, float df, float mb) {
  if (gWallW < 0.003) return splatSamp(t, gWallUVx * sc, df, mb, mean);
  if (gWallW > 0.997) return splatSamp(t, gWallUVz * sc, df, mb, mean);
  return mix(splatSamp(t, gWallUVx * sc, df, mb, mean), splatSamp(t, gWallUVz * sc, df, mb, mean), gWallW);
}
vec3 wallTex(sampler2D t, float sc) {
  if (gWallW < 0.003) return texture2D(t, gWallUVx * sc).xyz;
  if (gWallW > 0.997) return texture2D(t, gWallUVz * sc).xyz;
  return mix(texture2D(t, gWallUVx * sc).xyz, texture2D(t, gWallUVz * sc).xyz, gWallW);
}
float wallNoiseG(float sc, vec2 off) {
  if (gWallW < 0.003) return nz(gWallUVx, sc, off).g;
  if (gWallW > 0.997) return nz(gWallUVz, sc, off).g;
  return mix(nz(gWallUVx, sc, off).g, nz(gWallUVz, sc, off).g, gWallW);
}
// Terrain v2 (2026-10-01, grounded realism — the beds read as a printed ladder: every bed and ledge was a sine of the
// world height, one spacing per face): a non-periodic bed signal in -1..1 along the world height. Two lines through
// the shared noise texture at incommensurate scales (its 4- and 9-cell fields), offset per cliff, so the beds run in
// unequal thicknesses — a thick bed, two thin ones, a parting — and no two faces share a sequence. \`scale\` sets the
// mean spacing as the sine it replaces did (a 9-cell feature is a ninth of 1 / scale metres).
float bedSignal(float y, float scale, float ph) {
  float a = nz(vec2(y, ph * 37.0), scale, vec2(0.13, 0.71)).r;
  float b = nz(vec2(y, ph * 23.0 + 11.0), scale * 0.405, vec2(0.57, 0.29)).g;
  return clamp((a * 0.65 + b * 0.35 - 0.5) * 3.4, -1.0, 1.0);
}
// Terrain v2 (2026-10-01, grounded realism — the census close-ups of Sirocco, Titan, Sunscar, Olympus and Earthrise:
// concentric dark contour loops, "marble", on every sand floor): oriented sand waves without the phase explosion.
// Round 43 turned the wind per position and kept the global phase dot(world, wind); a turn of a tenth of a radian
// 300 m from the origin moved that phase by 30 m of travel, so the crests ran along the ISOLINES of the turn field —
// closed contour loops around its every extremum. Each wave train now lives in its own cell (a local origin, a heading
// within ±swing of the map's wind, its own phase) and the four nearest cells blend smoothly: the heading wanders by
// region, the crests stay parallel inside a train and meet the next train in a soft interference band (the junctions
// a real ripple field shows). Two wave numbers share one cell's heading (ripples and megaripples); the result is the
// surface slope along each train's wind, summed (a normal perturbation), and the first wave's tone.
vec2 sandWaves(vec2 p, vec2 w0, float cellM, float swing, float warp, vec2 k, vec2 amp, out float tone) {
  vec2 g = p / cellM - 0.5;
  vec2 c0 = floor(g);
  vec2 f = g - c0;
  vec2 bl = f * f * (3.0 - 2.0 * f);
  vec2 slopeV = vec2(0.0);
  tone = 0.0;
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec2 c = c0 + vec2(float(i), float(j));
      float h1 = fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453);
      float h2 = fract(sin(dot(c, vec2(269.5, 183.3))) * 43758.5453);
      float ang = (h1 - 0.5) * 2.0 * swing;
      float ca = cos(ang), sa = sin(ang);
      vec2 w = vec2(w0.x * ca - w0.y * sa, w0.x * sa + w0.y * ca);
      float d = dot(p - (c + 0.5) * cellM, w);
      float wt = (i == 0 ? 1.0 - bl.x : bl.x) * (j == 0 ? 1.0 - bl.y : bl.y);
      float s1 = sin(d * k.x + h2 * 6.2832 + warp);
      float s2 = sin(d * k.y + h1 * 6.2832 + warp * 0.4);
      slopeV += w * (s1 * amp.x + s2 * amp.y) * wt;
      tone += s1 * wt;
    }
  }
  return slopeV;
}
// Round 73 (2026-09-25, the ground redux): height-and-noise transitions. Every layer's local relief is read as its
// albedo's luminance against the tile's own mean (the painters bake cavity shade into the colour and the sourced sets
// carry their AO — no packed height channel, no sampler), and the incoming layer wins where its relief stands high
// over the base's: grass pokes through the dirt at a patch edge, a rock's top clears the snow. The modulation
// vanishes at full and zero coverage (a road stays a road) and fades with the far variant (no shimmer at range).
float reduxLuma(vec3 c) { return dot(c, vec3(0.36, 0.42, 0.22)); }
float reduxHeightMix(float f, float hBase, float hLayer, float k) {
  if (k < 0.001 || f < 0.002 || f > 0.998) return f;
  float x = f + (hLayer - hBase) * k * 4.0 * f * (1.0 - f);
  return smoothstep(0.0, 1.0, clamp(x, 0.0, 1.0));
}
// Round 55: the bedded sandstone maps' coarse wall relief (see the uBeddedR branch) — a height field over the wall
// plane (q.x along the wall, q.y world height, both metres) of ~17 m buttresses leaning with height, ~6 m ribs and
// ~33 m ledges of mass, from incommensurate sines with a slow per-cliff phase; no texture, so no mip speckle and no
// bed boundary. wallCragTilt is its tangent-space tilt (-A * gradient) by a half-metre central difference.
float wallCragField(vec2 q, float ph) {
  float lean = sin(q.y * 0.11 + ph * 2.0) * 0.9;
  float a = sin(q.x * 0.37 + ph * 6.0 + lean);
  float b = sin(q.x * 1.05 + ph * 11.0 + sin(q.y * 0.31 + ph) * 0.8);
  float c = sin(q.y * 0.19 + ph * 3.0 + sin(q.x * 0.23) * 0.7);
  return a * (0.62 + 0.38 * c) * 0.65 + b * 0.35;
}
vec2 wallCragTilt(vec2 q, float ph) {
  float h0 = wallCragField(q, ph);
  return -vec2(wallCragField(q + vec2(0.5, 0.0), ph) - h0, wallCragField(q + vec2(0.0, 0.5), ph) - h0) * 1.1;
}
// The Redrock lane, round 10 (the gauntlet's wave 270: "a single-tone maroon curtain with soft, blurred vertical streaks
// of identical width and spacing"; "thin wavy lines drawn over a soft surface read as texture overlay"): Wadi Rum's faces
// as relief in the normal. Hoskins' hash11 for the beds' and joints' draws.
float jh1(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
// One wall projection of a jebel face: u along the wall and y the bed height (both metres), ph the cliff's slow phase;
// returns (tilt along the wall, tilt up, albedo factor). The beds ~6.5 m (±35 %) parted by grooves (the upper lip facing
// down, the floor up, faintly dark in the groove, some partings near gone), each bed a shade of its own and cross-bedded
// (inclined laminae at ±30°); the joints vertical fractures through the beds, 6.5-13.5 m apart and wandering a little,
// a crack showing where a bed still holds it (two beds in three) — never offset bed by bed, which laid the face in a
// running bond — each a V (its walls turned a little into the crack, dark at its root); each column between two joints a
// face of its own; and low on the near faces the honeycomb (tafoni), bowl pits 0.4-1.2 m across in patches. footM is the
// pixel's footprint (m): the partings and cracks never narrow under about two pixels.
vec3 jebelFaceV2(float u, float y, float ph, float nearW, float tafW, float footM) {
  float yb = y + 1.6 * sin(u * 0.011 + ph * 6.0);
  float T = 6.5, k = floor(yb / T);
  float b0 = (k + 0.35 * (jh1(k * 1.7 + 3.1) - 0.5)) * T;
  if (yb < b0) { k -= 1.0; b0 = (k + 0.35 * (jh1(k * 1.7 + 3.1) - 0.5)) * T; }
  float b1 = (k + 1.0 + 0.35 * (jh1((k + 1.0) * 1.7 + 3.1) - 0.5)) * T;
  if (yb >= b1) { k += 1.0; b0 = b1; b1 = (k + 1.0 + 0.35 * (jh1((k + 1.0) * 1.7 + 3.1) - 0.5)) * T; }
  float dBot = yb - b0, dTop = b1 - yb, f = dBot / max(b1 - b0, 0.1);
  float w = max(0.24, 2.0 * footM);
  float sk = 0.15 + 0.85 * jh1(k * 2.3 + 0.7), sk1 = 0.15 + 0.85 * jh1((k + 1.0) * 2.3 + 0.7);
  float gB = clamp(1.0 - dBot / w, 0.0, 1.0), gT = clamp(1.0 - dTop / w, 0.0, 1.0);
  float tv = -0.6 * sk * gB + 0.6 * sk1 * gT;
  float shade = (1.0 - 0.2 * sk * gB * gB) * (1.0 - 0.2 * sk1 * gT * gT);
  // the bed's own shade, and its cross-bedding near
  shade *= 0.94 + 0.12 * jh1(k * 5.1 + 2.0);
  float ang = (jh1(k * 3.7 + 1.1) - 0.5) * 1.05, sp = 0.35 + 0.45 * jh1(k * 4.3 + 9.2);
  float lam = fract((u * sin(ang) + yb * cos(ang)) / sp);
  shade *= 1.0 - 0.11 * nearW * smoothstep(0.80, 0.97, lam) * (1.0 - smoothstep(0.78, 1.0, f));
  // the joints: vertical through the beds (their lines shared by every bed, wandering a metre down the face)
  float W = 10.0, uj = u + 1.1 * sin(yb * 0.045 + ph * 5.0), j = floor(uj / W);
  float c0 = (j + 0.7 * (jh1(j * 1.37 + 8.0) - 0.5)) * W;
  if (uj < c0) { j -= 1.0; c0 = (j + 0.7 * (jh1(j * 1.37 + 8.0) - 0.5)) * W; }
  float c1 = (j + 1.0 + 0.7 * (jh1((j + 1.0) * 1.37 + 8.0) - 0.5)) * W;
  if (uj >= c1) { j += 1.0; c0 = c1; c1 = (j + 1.0 + 0.7 * (jh1((j + 1.0) * 1.37 + 8.0) - 0.5)) * W; }
  // (round 11, the gauntlet's wave 282: "hairline drawn cracks" — the terrain's own clefts carry the joints now: here a
  // soft dark seam half a metre to a metre wide on about half the beds' stretches of each line, turned a little)
  float dl = uj - c0, dr = c1 - uj, hw = max(0.5, 3.0 * footM);
  float pl = step(0.55, jh1(j * 7.7 + k * 1.3)), pr = step(0.55, jh1((j + 1.0) * 7.7 + k * 1.3));
  float vl = pl * clamp(1.0 - dl / hw, 0.0, 1.0), vr = pr * clamp(1.0 - dr / hw, 0.0, 1.0);
  float tu = -0.35 * pl * step(dl, hw) + 0.35 * pr * step(dr, hw);
  shade *= (1.0 - 0.3 * vl * vl) * (1.0 - 0.3 * vr * vr);
  // the column's own face: a lean and a shade per column, whole down the cliff
  tu += (jh1(j * 3.3 + 1.9) - 0.5) * 0.22;
  // (round 11, the gauntlet's wave 282: "no fluting") its flutes: one to three rounded grooves across the column, each
  // column its own count, depth and phase, in the red below the pale formation (whose domes are not fluted)
  float fu = clamp((uj - c0) / max(c1 - c0, 0.5), 0.0, 1.0), fn = 1.0 + floor(3.0 * jh1(j * 4.9 + 0.3));
  float fA = 0.3 * jh1(j * 8.3 + 2.6) * (1.0 - smoothstep(46.0, 60.0, y)) * smoothstep(0.0, 0.12, fu) * smoothstep(0.0, 0.12, 1.0 - fu);
  tu += fA * sin(6.2831853 * (fn * fu + 0.5 * jh1(j * 2.2 + 5.1)));
  tv += (jh1(j * 5.9 + 0.4) - 0.5) * 0.05;
  shade *= 0.95 + 0.10 * jh1(j * 2.9 + 6.1);
  // the honeycomb: pits in 1.3 m cells, in patches
  if (tafW > 0.003) {
    // (round 11, the gauntlet's wave 282: "a stamped pattern of evenly sized, evenly spaced elliptical pits, like Swiss
    // cheese", "pale decals" — each stretch of rock its own cell size, 1-2.2 m; a pit in two cells of five; most pits
    // small, a few large; dark in their hollows; in patches)
    float cs = 1.0 + 1.2 * jh1(floor(u / 13.0) * 5.7 + floor(yb / 9.0) * 3.3 + 0.7);
    vec2 p = vec2(u, yb) / cs, cell = floor(p);
    // (not 'patch': a word GLSL ES 3.00 reserves for future use, so the program would not compile)
    float pitPatch = smoothstep(0.45, 0.8, jh1(floor(u / 7.0) * 3.1 + floor(yb / 5.0) * 7.3 + 1.9));
    for (int i = -1; i <= 1; i++) for (int m = -1; m <= 1; m++) {
      vec2 c = cell + vec2(float(i), float(m));
      float hc = jh1(c.x * 12.9 + c.y * 78.2);
      if (hc < 0.6) continue;
      vec2 ctr = c + 0.5 + 0.8 * (vec2(jh1(c.x * 3.9 + c.y * 1.7), jh1(c.x * 5.3 + c.y * 9.1)) - 0.5);
      float rk = jh1(c.x * 7.1 + c.y * 2.3), R = 0.1 + 0.42 * rk * rk;
      vec2 dpv = p - ctr;
      float r = length(dpv) / R;
      if (r < 1.0) {
        float wpit = tafW * pitPatch;
        tu -= dpv.x / R * 0.9 * wpit;
        tv -= dpv.y / R * 0.9 * wpit;
        shade *= 1.0 - wpit * 0.78 * (1.0 - r * r);
      }
    }
  }
  return vec3(tu, tv, shade);
}
// Round 40 (2026-09-22, AAA program check 13 "water at the edge: same level and shader beyond"): the horizon ring's
// faces inside a sea opening (edgeWater.ts) render with this material as the square's own open water — the same
// mask-driven path, deep tint, fresnel and whitecaps — so the sea does not change shader one metre past the edge.
// round 47: each opening's .w is the bay contour's reach past the edge (m); the sector opens beyond that reach
${SEA_COAST_GLSL}
float outlandSeaWeight(vec2 xz, float edgeOut) {
  float weight = 0.0;
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uSeaOpeningCount) break;
    vec4 o = uSeaOpenings[i];
    vec4 profile = uSeaBanks[i];
    float far = profile.y > profile.x + 1.0 ? smoothstep(0.0, 24.0, edgeOut) : smoothstep(o.w * 0.12, o.w * 0.5 + 8.0, edgeOut);
    weight = max(weight, seaCoastWeight(xz, o, profile, 512.0) * far);
  }
  return weight;
}
void splatCompute() {
  vec3 wp = vWPos;
  vec3 wn = normalize(vWNormal);
  vec2 mUV = wp.xz / uMaskSize + 0.5;
  vec4 mk = maskAt(mUV);
  // ground lane (the GPU cut, hold 16): the land use's bake goes out with the ground mask's own read
  vec4 luA = vec4(0.0), luB = vec4(0.0), luK = vec4(0.5); ivec2 luT = ivec2(0);
  if (uLandA.x > 0.001) lu_fetch(wp.xz, luA, luB, luK, luT);
  // map revival lane 2 (townPaving): the paved town rect reads as a textured road (after the two fetches above, which
  // go out together)
  gRoadTex = uRoadTex;
  if (uTownPave.z > 0.0) {
    vec2 townQ = abs(wp.xz - uTownPave.xy) - uTownPave.zw;
    gRoadTex = max(gRoadTex, 1.0 - smoothstep(0.0, 6.0, max(townQ.x, townQ.y)));
  }
  // vista pass (2026-09-19): the horizon ring's rim bands render with this material past the playable square,
  // where the clamped mask edge would drag any rim road, shoulder or town wear outward as a radial streak;
  // fade those channels to open ground there (the landform/marsh channel keeps its edge value)
  float edgeOut = max(abs(wp.x), abs(wp.z)) - 512.0;
  float outsideW = smoothstep(0.0, 36.0, edgeOut);
  // round 72b: past the square the ring's atlas relieves the slope the splat reads (rock breaks and the snow line
  // follow the striations), darkens the folds and lays the ridges' cast shadows; the atlas is neutral within 90 m of
  // the seam (the bake fades it there), so the seam row stays the terrain's own
  if (uRingDraw > 0.5 && uRingReliefAmp > 0.001 && edgeOut > 0.0) {
    // The coastal apron extends beyond the relief bake. Clamping its final row
    // extruded the same normal/AO texels into kilometre-long stripes. The beach
    // was also reading mountain relief after its geometry had become sea floor.
    float ringV = (length(wp.xz) - uRingReliefR.x) * uRingReliefR.y;
    float ringW = smoothstep(0.0, 40.0, edgeOut) * (1.0 - smoothstep(0.9, 1.0, ringV)) * uRingReliefAmp;
    if (uSea > 0.5 && uSeaOpeningCount > 0.5) ringW *= 1.0 - smoothstep(0.0, 0.25, outlandSeaWeight(wp.xz, edgeOut));
    vec4 ringRel = textureLod(uNrmM, vec2(atan(wp.z, wp.x) * 0.15915494309, ringV), 0.0);
    gRingGrad = (ringRel.xy * 2.0 - 1.0) * uRingReliefGrad * ringW
      * (1.0 - smoothstep(uRingReliefWall.x, uRingReliefWall.y, 1.0 - clamp(wn.y, 0.0, 1.0)));
    vec2 ringG0 = -wn.xz / max(wn.y, 0.05);
    wn = normalize(vec3(-(ringG0.x + gRingGrad.x), 1.0, -(ringG0.y + gRingGrad.y)));
    gRingAo = 1.0 - (1.0 - pow(ringRel.z, 1.4)) * 0.8 * ringW;
    gRingSun = 1.0 - (1.0 - ringRel.w) * 0.85 * ringW;
  }
  // Round 29 (owner 2026-09-20, "see where the texture just stops"): a road that reaches the playable edge runs on
  // into the ring on its clamped edge texels — a straight continuation of the carriageway and its shoulder — and
  // fades out between 24 and 96 m instead of ending dead on the seam; wear still fades with the 36 m ramp.
  // the map-borders lane (2026-10-03): the clamped texel no longer drags a road out (it bent every oblique road to the
  // perpendicular and left it in the ground 96 m out); a road leaving the square runs on across the ring from the exit
  // attribute (terrain.ts roadExits), with the square's own road law
  float outsideRoadW = smoothstep(0.0, 10.0, edgeOut);
  mk = vec4(mk.r * (1.0 - outsideRoadW), mk.g * (1.0 - outsideRoadW), mk.b, mk.a * (1.0 - outsideW));
  if (vRoadExit.y > 0.002) {
    float dE = abs(vRoadExit.x);
    // a road running out narrows to a track as it fades (to 45 % of its width), so it ends as a lane petering out at the
    // foot of the ranges or in the fields rather than as a full-width carriageway dimming away
    float wE = mix(0.45, 1.0, vRoadExit.y);
    mk.g = max(mk.g, max(0.0, 1.0 - dE / (12.0 * wE)) * vRoadExit.y);
    mk.r = max(mk.r, (1.0 - smoothstep(3.2 * wE, 4.6 * wE, dE)) * vRoadExit.y);
  }
  // round 40: past the square, inside a sea opening, the ring face is this map's water. It starts with the wetness
  // the square carries at its edge (the clamped texel — the bay may still be a turquoise shoal there) and deepens to
  // open sea over the next 320 m, so the seam has no step and the sea reads as a sea offshore.
  // round 47 (2026-09-23, owner: the shore met the border at a right angle): the bay's own contour (baked) rules the
  // first 120–360 m past the edge, the derived sector carries the open sea beyond it — the coast runs on as itself
  float outlandSea = 0.0;
  if (uSea > 0.5 && uSeaOpeningCount > 0.5 && edgeOut > 0.0) {
    outlandSea = outlandSeaWeight(wp.xz, edgeOut);
  }
  // round 47: on a sea map the ring's wetness past the edge IS the contour/sector — a land face beyond a wet edge
  // texel used to inherit the clamped mask's water and render as a dark wet slab (the coast's banks and headlands)
  if (uSea > 0.5 && uSeaOpeningCount > 0.5 && edgeOut > 0.0) mk.b += outlandSea * (1.0 - mk.b);
  else mk.b = max(mk.b, outlandSea * mix(mk.b, 1.0, smoothstep(0.0, 320.0, edgeOut)));
  // r6 terrain_environment: on landform-gated maps (desert) the mask B
  // channel carries the MESA/RIM weight instead of marsh/ice — decode it and
  // zero the marsh weight so none of the wet/ice paths fire on sand.
  float mkB = mk.b;
  float rockGate = 1.0;
  if (uRockGate > 0.5) {
    // Round 35 (owner 2026-09-21, "the sides of mountains in stuff like redrock divide … look so so bare"): past the
    // playable square the landform channel is its clamped edge texel, so a steep RING face on a landform-gated map
    // (Redrock, Titan, Skybridge, Caldera, the desert, Mars) rendered as a sand slip face — a dark, ripple-striated,
    // bare wall — instead of the bedded rock the same slope carries inside the square. Outside, the ring's own slope
    // supplies the landform weight: steep faces are mesa rock with their strata, floors stay sand.
    // Round 49 (owner audit 2026-09-23, Titan "smooth beige ridge faces without strata"): the band was fixed at
    // 0.22–0.48 (39°–59°), so a ring face of 35–50° stayed the wall-projected sand set — smooth beige, no beds. The
    // band is authored per map (splat.ringRockSlope); Titan's bedded walls start at ~34° and are rock by ~47°.
    mkB = max(mkB, smoothstep(uRingRock.x, uRingRock.y, 1.0 - clamp(wn.y, 0.0, 1.0)) * outsideW);
    // (ground lane, wave 65: the ring's ledges and crests high on its walls are the walls' caprock, not sand)
    gRingCap = smoothstep(uRingCap.x, uRingCap.y, wp.y) * outsideW;
    mkB = max(mkB, gRingCap);
    rockGate = smoothstep(0.10, 0.45, mkB);
    mkB = 0.0;
  }
  float camDist = distance(wp, cameraPosition);
  // FOV-aware detail distance: meters-per-pixel footprint normalized to the
  // 60-deg/1080p arcade view, so x8 sniper zoom re-resolves near-scale
  // detail instead of magnifying the blurred far variant (hud_ui r2).
  // min() keeps wide establishing shots byte-identical (footprint >= camDist
  // there); only narrow-FOV (zoomed) frames take the shorter effective
  // distance.
  float effDist = min(camDist, length(fwidth(wp.xz)) * 935.0);
  // terrain v2: the noise reads' level of detail — the major axis of the fragment's world footprint (a wall's vertical
  // footprint counts too: the wall projections read the same texture) in texels of the 256 px noise at scale 1
  gNoiseLog = log2(max(max(length(dFdx(wp)), length(dFdy(wp))) * 256.0, 1e-6));
  gFootM = exp2(gNoiseLog) / 256.0; // ground lane: the same footprint, in metres per pixel, for tileVis
  gDwX = dFdx(wp.xz); gDwY = dFdy(wp.xz); // ground lane (farmland): its axes, for stripeVis
  gFarVis = tileVis(18.0);
  float df = smoothstep(45.0, 160.0, effDist);
  // Round 35 (owner 2026-09-21, "stuff in background should never be flat"): a wall is seen face-on, so its texels
  // stay dense on screen far longer than a grazing floor's — the near variant holds twice as far on steep faces
  // (the fur-under-a-low-sun fix lives in gSplatSteepAtt, not here, and stays as it was).
  float steepFace = smoothstep(0.30, 0.55, 1.0 - clamp(wn.y, 0.0, 1.0));
  float farM = mix(smoothstep(90.0, 330.0, effDist), smoothstep(180.0, 660.0, effDist), steepFace);
  // Round 42 (AAA program checks 4 and 11, owner audit "shaded slopes go black" on Caldera / Skybridge / Mars): a
  // steep face turned away from the sun sees half the sky dome, yet the hemisphere light hands it a fixed preset
  // colour that never follows the rendered sky (Caldera's inner east wall measured 3 % of the sky's brightness).
  // Weight the faces that qualify here; the indirect-light hook below adds the sky's own colour to them.
  gWallSky = smoothstep(0.12, 0.50, 1.0 - clamp(wn.y, 0.0, 1.0)) * (1.0 - smoothstep(-0.08, 0.30, dot(wn, uSunDirW)));
  // ground lane (wave 85, Caldera's backlit rim): the volcanic slopes that face the sunlit ash floor — from ~14°, not only
  // the walls (the rim's 33° slope sat at the foot of the wall sky light's ramp) — turned from the sun
  gVolcShade = uReduxFold.w * smoothstep(0.03, 0.20, 1.0 - clamp(wn.y, 0.0, 1.0)) * (1.0 - smoothstep(-0.08, 0.30, dot(wn, uSunDirW)));
  // Resolve detail by screen footprint and distance everywhere. Forcing the
  // far variant on exterior floors exposed the square as a quality boundary.
  // detail fade: positive mip bias at range kills the single-frequency
  // speckle shimmer that anisotropic filtering keeps resolving
  float mipB = farM * 2.0;
  vec2 uv = wp.xz;
  float n1 = nz(uv, 0.0117, vec2(0.0)).r;
  float n1h = nz(uv, 0.047, vec2(0.0)).r; // high-freq edge breaker
  float n2 = nz(uv, 0.0031, vec2(0.41, 0.13)).g;
  // r6 DOMAIN WARP for every macro-variation threshold below: thresholding
  // the bilinear-filtered 256px noise texture directly bakes axis-aligned
  // staircase borders into the dirt/meadow patches (the checkerboard blotch
  // artifact at 10-40 m). Warping the sample coordinates by a smooth low-
  // frequency vector field makes every patch border organic. CPU twin:
  // sampleSplatNoise in this file MUST keep the same warp so vegetation
  // thinning stays aligned with the visible dirt.
  vec2 wOff = (nz(uv, 0.0009, vec2(0.53, 0.17)).rg - 0.5) * 48.0;
  vec2 uvW = uv + wOff;
  float n1w = nz(uvW, 0.0117, vec2(0.0)).r;
  float n2w = nz(uvW, 0.0031, vec2(0.41, 0.13)).g;
  // r8: rotation-blend mask for the anti-tiling ground samplers — the warped
  // ~10-20 m n1w patches are aperiodic at exactly the scale the detail tiles
  // repeat, so neither sampling's period can line up across more than a tile
  gTileMix = smoothstep(0.36, 0.64, n1w);
  float slope = 1.0 - clamp(wn.y, 0.0, 1.0);
  // Ground lane (2026-10-03, wave 11, Sunscar Oasis from the air: "the mesa cliff faces in the background carry the same
  // horizontal sand-dune ripple texture as the desert floor"): on a sand map without the landform gate the ring's
  // normals lean to the sky, so its cliffs read as gentle sand and printed the planar ripple trains as horizontal
  // stripes. Past the edge the face's own slope decides there: a mesa wall is rock, its ripples and sand gone.
  vec3 faceNrmT = normalize(cross(dFdx(wp), dFdy(wp)));
  if (uRockGate < 0.5 && uRipple.z > 0.001 && uRipple.w < 0.5) slope = max(slope, (1.0 - abs(faceNrmT.y)) * outsideW);
  // distance-attenuated edge breaker: full crispness near the camera, eased
  // toward its mean at range so the road blend never shows dither stipple
  // at 50-100 m
  float n1hs = mix(n1h, 0.5, farM * 0.85);
  // road masks: crisp noise-broken compacted core + wider soft dirt shoulder
  // road pass 2026-09-12: G decodes to metres from the road centreline. The
  // compacted core ends on an analytic, noise-wobbled gauge; the twin wheel
  // lanes sit 1.55 m either side of the centre; the crown is the dusty strip
  // between them. Everything below that used to read the 2 m-texel Gaussian
  // lane bytes now reads these continuous profiles instead.
  float dRoad = (1.0 - mk.g) * 12.0;
  // (2026-10-05) a styled road net: the nearest path's surface, half-width and heading from the stack's road layer
  // (one exact texel a 2 m mask texel); a map without one reads nothing and keeps its own road
  // (gRoadTex was set after the paired fetches: the map's uRoadTex, or the paved town rect's; a styled path's own surface
  // takes its place on the path)
  float roadHalfW = 0.0;
  if (uRoadClass.z > 0.5 && dRoad < 11.9) {
    float rn = uRoadClass.x;
    ivec2 rt = clamp(ivec2(floor((wp.xz / 1024.0 + 0.5) * rn)), ivec2(0), ivec2(int(rn) - 1));
    vec4 rc = texelFetch(uMask, rt + ivec2(0, int(uRoadClass.y + 0.5)), 0);
    gRoadClass = floor(rc.r * 255.0 + 0.5);
    // (roads lane: a class the period catalogue gave a path carries bit 7 — the Low tier draws that path as the map's own)
    if (gRoadClass > 127.5) gRoadClass = uLandTier > 0.5 ? gRoadClass - 128.0 : 0.0;
    roadHalfW = floor(rc.g * 255.0 + 0.5) * 0.1;
    float rTurn = (rc.b * 65280.0 + rc.a * 255.0) * (6.2831853 / 65536.0);
    gRoadDir = vec2(cos(rTurn), sin(rTurn));
    if (gRoadClass > 0.5) gRoadTex = abs(gRoadClass - 4.0) < 0.5 ? 0.0 : 1.0; // (4 dirt; 5–7 clinker, concrete, brick)
  }
  // roads lane (2026-10-09): the road frame from the stack's frame layer — one exact texel a mask texel: the nearest line's
  // heading and its running length at the texel's centre, the pixel's own offset added along the heading (exact on a bend,
  // where dot(wp, heading) runs fast or backwards by |wp| / radius). Past the square's edge the clamped texel is no frame
  // (the tier, landUseTierOf: Low — the phones' default — reads no frame and keeps the old road and paving law)
  if (uRoadFrame.z > 0.5 && dRoad < 11.9 && outsideRoadW < 0.999 && uLandTier > 0.5) {
    float fn = uRoadFrame.x;
    ivec2 ft = clamp(ivec2(floor((wp.xz / 1024.0 + 0.5) * fn)), ivec2(0), ivec2(int(fn) - 1));
    vec4 fc = texelFetch(uMask, ft + ivec2(0, int(uRoadFrame.y + 0.5)), 0);
    float fTurn = (fc.b * 65280.0 + fc.a * 255.0) * (6.2831853 / 65536.0);
    gRoadAlong = vec2(cos(fTurn), sin(fTurn));
    vec2 fC = ((vec2(ft) + 0.5) / fn - 0.5) * 1024.0;
    float fArc = fc.r * 65280.0 + fc.g * 255.0;
    float fSide = fArc > 32767.5 ? -1.0 : 1.0;
    gRoadS = (fArc - (fSide < 0.0 ? 32768.0 : 0.0)) * (1.0 / 64.0) + dot(wp.xz - fC, gRoadAlong);
    float fDc = (1.0 - texelFetch(uMask, ft, 0).g) * 12.0;
    gRoadY = fSide * fDc + dot(wp.xz - fC, vec2(-gRoadAlong.y, gRoadAlong.x));
    // (the CPU twin, .qa-dev/frame-probe.mjs: within 2 m of a line a few centimetres off; a texel whose distance a pad's
    // stamp cleared, or whose nearest line is another road's at a junction, disagrees with the pixel's own distance)
    gRoadYOk = step(fDc, 11.9) * step(abs(abs(gRoadY) - dRoad), 1.2);
    gRoadFrameW = 1.0 - outsideRoadW;
  }
  float roadHalf = (roadHalfW > 0.05 ? roadHalfW : 3.85) + (n1hs - 0.5) * 1.1 + (n2 - 0.5) * 1.5;
  float roadCore = 1.0 - smoothstep(roadHalf - 0.55, roadHalf + 0.55, dRoad);
  float shoulder = smoothstep(0.04, 0.60, mk.r + (n1hs - 0.5) * 0.20);
  // Ground lane (wave 69, Frontier's establishing view: the dirt road read as "a perfectly regular diagonal stripe
  // texture with no clod variation or color break"): a country road's wheel tracks are not ruled — the lanes swing a
  // quarter metre either way along it, and they come and go: deep and dark down one stretch, nearly gone on a hard dry
  // one (a 100–300 m field), never two unbroken lines from one end of the map to the other
  // (roads lane, 2026-10-09: the swing reads field b at a 250 m tile — features past 16 m. n1's field a carries half its
  // power at metre scale, which the soft lanes hid and the crisp grooves below drew as a wriggle)
  // (a map on the old road law — uRoadSurf.x 0, the owner's protected maps — keeps the old swing exactly)
  float laneWob = uRoadSurf.x > 0.0 && uLandTier > 0.5 ? (nz(uv, 0.004, vec2(0.37, 0.11)).g - 0.5) * 0.55 : (n1 - 0.5) * 0.55;
  float laneD = (dRoad - 1.55 - laneWob) * uLaneK;
  // uLaneK == 0 marks a coarse (4 m) mask: one bead-free compaction plateau.
  float lane = uLaneK > 0.0 ? exp(-laneD * laneD) : 1.0 - smoothstep(2.6, 3.6, dRoad);
  float rutAmp = (0.22 + 0.78 * smoothstep(0.28, 0.70, n2 * 0.55 + n1 * 0.45)) * (0.72 + 0.28 * n1hs);
  float rut = lane * roadCore * rutAmp;
  float crown = (1.0 - smoothstep(0.0, 1.25, dRoad)) * roadCore;
  // r7: the road mask is an XZ projection — where a road runs along a mesa
  // rim it painted its compacted-earth tint DOWN the cliff face below as a
  // vertical light streak; no road holds on a >30-deg face
  {
    float notCliff = 1.0 - smoothstep(0.28, 0.45, slope);
    roadCore *= notCliff; shoulder *= notCliff; rut *= notCliff;
  }
  // Ground lane (2026-10-03, the gauntlet: "roads are flat painted strips of constant width with hard edges: no verges,
  // ruts, mud, puddles or broken edges"). Where its texels can be seen, a country road's edge wanders by the metre — the
  // turf bites into it in tongues, the wheels spill past it — and it is a sharper line than the 1.1 m feather the gauge
  // keeps at range; the trodden verge beside it ends on a ragged line of its own. Paved streets keep their kerb law.
  float roadVis = tileVis(2.6) * (1.0 - gRoadTex);
  vec2 roadBite = nzq(uv, 0.38, vec2(0.17, 0.53)) - 0.5; // a 2.6 m tile of 0.3–0.7 m tongues
  float roadHalfB = roadHalf + roadBite.x * 1.7 * roadVis;
  if (roadVis > 0.002) {
    float notCliffB = 1.0 - smoothstep(0.28, 0.45, slope);
    float featherB = mix(0.55, 0.22, roadVis);
    float coreB = (1.0 - smoothstep(roadHalfB - featherB, roadHalfB + featherB, dRoad)) * notCliffB;
    roadCore = mix(roadCore, coreB, roadVis);
    rut = lane * roadCore * rutAmp;
    crown = (1.0 - smoothstep(0.0, 1.25, dRoad)) * roadCore;
    float vergeOut = roadHalfB + 1.3 + roadBite.y * 2.2;
    float vergeB = (1.0 - smoothstep(vergeOut - 0.45, vergeOut + 0.45, dRoad)) * (0.55 + 0.45 * smoothstep(0.30, 0.70, n1h))
      * notCliffB;
    shoulder = mix(shoulder, max(roadCore, vergeB), roadVis * smoothstep(0.02, 0.10, mk.g));
  }
  // dirt patches: noise-broken threshold => small worn patches with ragged
  // edges instead of giant airbrushed smears. r6: warped samples + slightly
  // softer band — the hard 0.62-0.78 step on unwarped texels was the
  // axis-aligned checkerboard tell beside the player tank
  // r4 terrain_environment: worn band widened (0.60-0.82 -> 0.55-0.80) and
  // weight 0.62 -> 0.74 — the gameplay-camera near field read as one uniform
  // green noise carpet with "no macro albedo variation" (critique); more
  // visible dirt/dry-patch breakup is the cheapest macro signal at 5-60 m
  // r7: 0.74 -> 0.84 — bare-dirt splats must read as real ground breakup
  // between the road decals (ground-cover critique), not a faint stain
  float worn = smoothstep(0.55, 0.80, n2w + (n1w - 0.5) * 0.45);
  // Ground lane (2026-10-03, the gauntlet: the winter snowfield "marked with swirly brown smudge decals"): snow lies thin
  // and blows off where the wind scours it — the crests — not in patches across the flats, and what shows through is the
  // dead sward, not mud (the tint is laid on the D sample below). On a snow map the worn field opens only over a crest.
  if (uReduxD.y > 1.5) worn *= smoothstep(0.10, 0.50, -vFold) * 0.85;
  // Coastal D doubles as pale beach sand: inland worn turf uses less of it.
  // Keep road/town coverage independent and raw worn aligned with grass scatter.
  // map pass 2026-09-12: uShoulderDirt scales the bare shoulder so snow passes
  // keep white verges beside a packed road instead of a 10 m mud slash.
  // Ground lane (wave 71, every grass view: "bare, blurry soil between tufts … the sward isn't reaching it"): a
  // meadow's worn patch is grazed turf — shorter, yellowed — and its soil shows only at the trodden core: the dirt layer
  // takes the core, the turf's tone the rim (grazeT, laid on the base tile below; the grass tiers thin over the whole
  // patch). The arid maps' sand patches and the snow maps' scoured crests keep the whole patch.
  float wornCore = (uSandMacro > 0.001 || uReduxD.y > 1.5) ? worn : smoothstep(0.78, 1.0, n2w + (n1w - 0.5) * 0.45);
  float grazeT = worn - wornCore;
  // Ground lane (2026-10-07, wave 182's Frosthollow bird view: "dark untextured rectangles" — the two 56 m graded
  // hardstands the zone discs sit on): a hardstand is stamped as the carriageway's full coverage (R) with no centreline
  // near it (G 0, hardstandSurface.ts), so the whole pad was shoulder and none of it road — the dirt layer laid bare
  // over 56 m, which a snow map's wear lets through as bare ground. A pad is graded road ground: the carriageway's own
  // packed surface (dW below: the map's packed earth, or on a snow map packed, trodden snow) with no wheel lanes, ruts
  // or crown (they follow a centreline), and its feather the ground around it — the shoulder's dirt stands down over the
  // whole pad (a ring of bare ground outlined it). A paved map's pads stay paved; a road crossing a pad keeps its own
  // paint (its centreline's G)
  float padK = (1.0 - smoothstep(0.05, 0.25, mk.g)) * (1.0 - step(0.5, gRoadTex));
  float apronK = smoothstep(0.50, 0.90, mk.r) * padK;
  float apronRim = smoothstep(0.04, 0.50, mk.r) * padK;
  // (2026-10-07, wave 235's Monsoon chase: "a flat, uniform brown dirt plane … cut by a ruler-straight edge against a flat
  // green strip"; Whiteout's "no … tracks") a pad's edge is broken into the turf in tongues within its feather (the
  // stamp's own spill already wanders 0–4 m out), and the pad is worked ground: the tracks of the vehicles that formed up
  // on it — pairs of ruts 0.6 m wide, 2.9 m apart, along two families of gently curving lines that come and go across it.
  // Its ruts are the road's ruts: darkened as a road's wheel lanes are, puddled on a wet map, slush on a snow map
  float apronN = nz(uv, 0.21, vec2(0.13, 0.71)).r * 0.6 + n1h * 0.4;
  apronK = smoothstep(0.30, 0.85, mk.r + (apronN - 0.5) * 0.60 * tileVis(4.8)) * padK; // (into the stamp's spill: its tongues)
  float padRut = 0.0;
  vec2 padRutN = vec2(0.0);
  if (apronK > 0.003) {
    // roads lane (2026-10-09; the gauntlet's "near-black swirl apron" on Frontier, Monsoon's "dead-flat brown plane"):
    // each family keeps one heading — a heading read off metre-scale noise turned q = dot(wp, dir), |wp| some 300 m,
    // into that noise's own contour lines, a swirl of ruts every metre that blackened the whole pad. A family's lines
    // wander 3.5 m over tens of metres (field b at 0.0024: features past 26 m), and its tracks are single vehicles' pairs —
    // a tank's 2.9 m gauge or a lorry's 1.8 m, at a random place in each 9–12 m strip, a quarter of the strips empty —
    // each coming and going along its line over 5–20 m (field b at 0.012), not a comb of ruts every 3 m
    float rutVis = smoothstep(0.12, 0.40, 0.30 / max(gFootM, 1e-3)); // gone as the footprint outgrows a rut
    for (int k = 0; k < 2; k++) {
      float t = 0.62 + float(k) * 1.15;
      vec2 dP = vec2(-sin(t), cos(t)); // across the family's lines
      float q = dot(wp.xz, dP) + 3.5 * (nz(uv, 0.0024, vec2(0.53 + float(k) * 0.21, 0.29)).g - 0.5);
      float per = 9.0 + 3.0 * float(k);
      vec2 ch = cellHash2(vec2(floor(q / per), 41.0 + float(k) * 13.0));
      float gauge = ch.y > 0.45 ? 2.9 : 1.8;
      float f = fract(q / per) * per - (0.9 + ch.x * (per - gauge - 1.8)); // (3 sigma clear of the strip's edges)
      float r1 = f / 0.30, r2 = (f - gauge) / 0.30;
      float pres = smoothstep(0.40, 0.62, nz(uv, 0.012, vec2(0.11 + float(k) * 0.37, 0.83)).g)
        * step(0.25, fract(ch.x * 7.31 + ch.y)) * rutVis;
      float e1 = exp(-r1 * r1), e2 = exp(-r2 * r2);
      padRut = max(padRut, (e1 + e2) * pres);
      padRutN += dP * (r1 * e1 + r2 * e2) * pres;
    }
    padRut *= apronK;
    padRutN *= apronK;
    rut = max(rut, padRut * rutAmp * 1.2);
  }
  float fD = clamp(max(wornCore * uWornDirtStrength, max(shoulder * uShoulderDirt * (1.0 - apronRim), mk.a * uTownWear * (0.35 + 0.65 * n1))), 0.0, 1.0);
  float fM = mkB;
  // marsh/ice sheets only live on near-flat ground: without this the graded
  // banks around a frozen lake inherit the sheet's glossy blue ice response
  // and read as icy walls — anything steeper than ~10 deg is snow bank
  // Liquid water follows its authored contour even when a cliff's smooth
  // vertex normals lean across the submerged bed. The legacy slope gate
  // otherwise paints triangular grass patches through the transparent sea.
  fM *= mix(1.0 - smoothstep(0.03, 0.08, slope), 1.0, uSea);
  // >>> maps r1 (ADDITIVE, uSea-gated — uSea is 0 on every pre-existing map,
  // so fMs == fM and everything below is bit-identical there). Open-water
  // mode splits fM's wide shore ramp into: a bare sand/mud apron (seaSand,
  // fed from the D layer), a surf waterline, and the open-water weight fMs.
  gSeaFoam = 0.0;
  float fMs = fM;
  float seaSand = 0.0;
  if (uSea > 0.5) {
    fMs = smoothstep(uSeaRamp.x, uSeaRamp.y, fM);
    seaSand = smoothstep(0.02, uSeaRamp.x, fM) * (1.0 - fMs);
  }
  // <<< maps r1 ---------------------------------------------------------------
  // r6 terrain_environment LANDFORM ROCK GATE (rockGate, decoded above): with
  // uRockGate on (desert), the slope-driven rock/sandstone takeover only
  // fires where the mask-B landform weight says the terrain IS mesa/rim rock.
  // Slope alone cannot tell a mesa wall from a dune slip face, so every steep
  // DUNE face used to inherit the BEDDED sandstone layer and print horizontal
  // terracing — the critique's "heightmap quantization" bands on the dunes.
  // Dunes now stay sand at any slope (the steep-sand ripple/grain pass below
  // carries their detail).
  // r5: breakup widened 0.07 -> 0.16 — the moderate-slope band used to hold
  // 30-60% rock alpha EVERYWHERE, dusting whole hill flanks with uniform
  // speckle fur; with stronger noise the same band resolves into distinct
  // rock outcrop patches separated by clean ground
  // Round 45 (AAA checks 3/15, owner audit "monsoon: smooth bare brown mound at the SW corner"): a wet tropical hill
  // keeps its turf to far steeper slopes than a temperate one; the map's hold shifts every slope threshold below.
  // the map-borders lane (2026-10-03, gauntlet wave 1: "a purple ground splotch", the before frames' "blue-grey patch
  // read as a frozen pond"): round the playable edge the faces of 20-35 degrees are the rim's remnants and small banks,
  // not cliffs — a rock patch on them reads as a stain, so there the turf holds to ~35 degrees; real walls stay rock
  float rimBandR = max(abs(wp.x), abs(wp.z));
  float rimBandW = smoothstep(415.0, 445.0, rimBandR) * (1.0 - smoothstep(650.0, 800.0, rimBandR));
  float slopeR = slope - uSlopeGrassHold - 0.085 * rimBandW;
  float fR = smoothstep(0.095, 0.235, slopeR + (n1 - 0.5) * 0.16) * rockGate;
  // rock takeover on steep faces: cliff walls and cut banks always read as
  // rock. r3: WIDE, noise-dithered band — the old razor 0.32-0.50 threshold
  // cut giant hard-edged maroon swaths diagonally across the dunes; the low-
  // freq n1 term wanders the boundary while n1hs keeps near-field raggedness
  fR = max(fR, smoothstep(0.28, 0.58, slopeR + (n1 - 0.5) * 0.10 + (n1hs - 0.5) * 0.08) * rockGate);
  // ...except inside marsh/ice sheet margins: lake banks are snow/soil
  // slumps, and the pale winter rock on them read as a glassy blue cliff
  // wall ringing the frozen lake
  fR *= 1.0 - mkB * 0.85;
  // r6: any face steep enough for the wall-plane projection below is FULLY
  // rock — partial-fR bands left the planar-projected sand layer showing
  // through mid-flank, and its UV stretch was the residual melted-wax smear
  // r8: 0.18-0.40 -> 0.14-0.34 (with the matching steepW change below) — the
  // 15-30 deg mesa flank band still held planar XZ sand UVs and its texture
  // stretched downslope as taffy; wall projection now owns faces from ~28 deg
  // r4 terrain_environment: 0.14-0.34 -> 0.20-0.42 — at 0.14 every moderate
  // DUNE flank flipped to the banded sandstone layer and carried its beds as
  // "pink contour marbling on sand" (desert critique). Rock now takes over
  // from ~37 deg; the 30-37 deg band stays sand (ripples own it).
  fR = max(fR, smoothstep(0.20, 0.42, slopeR) * (1.0 - mkB * 0.85) * 0.95 * rockGate);
  // (the Redrock lane, round 11, the gauntlet's wave 282: the talus "a painted triangle laid on the wall with a seam where
  // it meets the sand" — on a jebel-face map the talus band under the walls, below 13-20 m, is sand drifted between its
  // blocks: the rock gives way to sand in ragged patches 4-20 m across, so the rock's edge wanders up and down the slope)
  if (uJebelFace.x > 0.0) {
    float talusBand = smoothstep(0.16, 0.26, slopeR) * (1.0 - smoothstep(0.40, 0.55, slopeR)) * (1.0 - smoothstep(13.0, 20.0, wp.y));
    float drift = nz(wp.xz, 0.11, vec2(0.27, 0.61)).b * 0.6 + n1h * 0.4;
    fR *= 1.0 - talusBand * (1.0 - smoothstep(0.38, 0.62, drift)) * 0.85;
  }
  // ground lane (wave 65): the caprock is rock whatever its slope — its ledges and tops — a little sand in its hollows
  fR = max(fR, gRingCap * rockGate * (0.72 + 0.28 * smoothstep(0.30, 0.70, n1h)));
  // the Redrock lane: the square's own caprock (splat.caprockY) — the jebels' and domes' tops are bare rock, not sand
  // (past the square too: the canyon's heads and plateau are the same massifs — their ring rows took sand on every
  // facet flatter than the rock band, a patchwork of triangles on the north head)
  // (round 9, the gauntlet: "sand caked on their tops like icing": with the jebel faces on, bare rock in the hollows too)
  if (uCaprockY.x < 1e8) fR = max(fR, smoothstep(uCaprockY.x, uCaprockY.y, wp.y) * rockGate * (1.0 - roadCore)
    * mix(0.72 + 0.28 * smoothstep(0.30, 0.70, n1h), 1.0, uJebelFace.x));
  // triplanar side projection on steep faces: planar XZ UVs smear vertically
  // down cliff walls (the classic heightmap-stretch tell on the mesa cliffs)
  // — resample the rock layer in the wall's own plane and take it over as
  // the slope rises, so cliffs read as stratified rock instead of dragged
  // paint
  float steepW = smoothstep(0.20, 0.42, slope) * (1.0 - mkB * 0.85) * rockGate; // r4: tracks the fR band (marbling fix); r6: landform-gated
  // Ground lane (2026-10-03, the gauntlet: Saltwind's road cut read as "a drainage ditch filled with a flat, unlit
  // blue-grey plane", Cinder Junction's hill as "white blobs and smears", rock as "hard-edged decal patches"). On the
  // vegetated battlefields a steep face beside a road or inside a village is an earthwork — the cut and fill banks the
  // grading left, a yard's terrace — dug soil the turf takes back within a season, never bedrock: only a true cliff
  // (past ~60°) keeps its rock there. Elsewhere the turf holds the moderate slopes (to ~45°) outside the outcrops'
  // own patches, so rock breaks the sod in places instead of printing one slope band over every hill flank. What the
  // earthworks lose to soil is laid back below as a patchy bank of the D layer (bankSoil).
  float bankSoil = 0.0;
  if (uReduxD.y < 0.5 && uRockGate < 0.5) {
    float earthwork = max(smoothstep(0.02, 0.14, mk.g), smoothstep(0.10, 0.35, mk.a)) * (1.0 - smoothstep(0.44, 0.60, slope));
    // (wave 21, Sonnet on the coastal and Verdant chase: "grey rock outcrops with hard unblended edges on green
    // hillsides") a vegetated hill's sod holds its moderate slopes: an outcrop patch shows rock only where the patch is
    // strong (half as many patches), the rock breaks through the turf there in a ragged partial cover rather than one
    // solid grey decal, and a fringe of bare soil and scree rings it into the sward (the bank's D layer, below)
    float outN = nzq(uvW, 0.0093, vec2(0.21, 0.67)).x + (n1h - 0.5) * 0.22;
    float outcrop = smoothstep(0.50, 0.80, outN) * (0.40 + 0.60 * smoothstep(0.35, 0.70, n1hs));
    float moderate = 1.0 - smoothstep(0.24, 0.38, slopeR);
    float held = mix(1.0, outcrop, moderate);
    float rockKeep = (1.0 - earthwork) * held;
    float fringe = moderate * smoothstep(0.38, 0.58, outN) * (1.0 - outcrop) * 0.55;
    bankSoil = max(fR, steepW) * max(earthwork, fringe) * (0.30 + 0.50 * smoothstep(0.35, 0.75, n1h * 0.6 + n1 * 0.4));
    fR *= rockKeep;
    steepW *= rockKeep;
  }
  // the map-revival lane (2026-10-05, Orchard Valley's terraces T2): a terrace zone's risers are its dry-stone walls — the
  // faces the steps stand steeper than the benches (applyTerraces) take the rock layer whatever the turf's hold, the
  // benches keep their ground; the carriageways stay road
  if (uTerraceParam.x > 0.5) fR = max(fR, terraceZoneW(wp.xz) * (1.0 - roadCore) * smoothstep(uTerraceParam.z, uTerraceParam.w, slope));
  // Ground lane (2026-10-03, Caldera's gauntlet: the lava shelves' fronts "read as long dark trenches"): on a volcanic
  // basin (groundRedux VOLCANIC) a lava flow — the landform channel, the maps lane's flowCover in the mask — is basalt
  // over its whole surface, its top, levees and front alike, not only where it is steep
  if (uReduxFold.w > 0.001 && uRockGate > 0.5) fR = max(fR, rockGate * uReduxFold.w * (1.0 - roadCore));
  // r7: SHARPENED AXIS TRIPLANAR replaces the r6 tangent projection. The
  // tangent frame was derived from the interpolated normal, so on undulating
  // walls it rotated per-fragment and the sample coordinate wandered — the
  // melted-taffy smear. Two fixed world-axis projections keep every texel
  // anchored in world space; pow(|n|,6) weights keep the crossover band on
  // diagonal faces narrow enough to be invisible on self-similar rock.
  {
    float wSx = pow(abs(wn.x) + 1e-5, 6.0);
    float wSz = pow(abs(wn.z) + 1e-5, 6.0);
    gWallW = wSz / (wSx + wSz);
    gWallSigns = sign(wn.xz);
    gWallUVx = vec2(wp.z * sign(wn.x), -wp.y);
    gWallUVz = vec2(-wp.x * sign(wn.z), -wp.y);
    // r8 per-cliff bed de-sync: the sandstone layer's bed sequence repeats
    // every ~6.5 m of altitude and every face at the same world height showed
    // the SAME stripes ("uniform synthetic strata on every cliff"). A slow
    // world-XZ field (constant down a vertical column, drifting along the
    // wall run) offsets the V coordinate and stretches bed thickness ±13%
    // per cliff, so bed sequences undulate and never sync between faces.
    float cliffJ = nz(wp.xz, 0.0013, vec2(0.57, 0.23)).g;
    float cliffJ2 = nz(wp.xz, 0.0047, vec2(0.91, 0.13)).g;
    float wallVScale = 0.87 + cliffJ * 0.26;
    float wallVOff = cliffJ * 9.7 + cliffJ2 * 2.3;
    // Ground lane (2026-10-03, Redrock's inselbergs "like extruded clay"): the beds wander along the wall (±1.6 m over
    // ~50 m, ±0.55 m over ~17 m) and swell and thin by region (±18 %), so no wall prints one level ladder
    // (2026-10-06, Titan's zigzag strata: the noise texture's r field carries half its power at 2–8 texels, so the wander's
    // second term (r at 0.0588) drew ±0.55 m teeth every metre or two along every bed, and cliffJ2's r and the swell's
    // the same at their scales; the slow fields read g — its power sits past 16 texels — at the scales the line above names.
    // And the thickness stretch multiplied the ABSOLUTE height: v = −y · k(x, z) sheared every wall read by y · ∇k, about 2
    // at 50 m and 11 at 250 m (the skies lane's emulation) — the beds sawn into slivers and the noise read under its mip.
    // The stretch now lives on a periodic band of the height, zero mean over 48 m: bed sets thicken and thin up a wall and
    // the shear stays under 7.6 m · ∇k anywhere)
    gBedWob = (nz(wp.xz, 0.0050, vec2(0.37, 0.83)).g - 0.5) * 3.2 + (nz(wp.xz, 0.0147, vec2(0.71, 0.19)).g - 0.5) * 1.1;
    float bedSwell = 1.0 + 0.36 * (nz(wp.xz, 0.0031, vec2(0.17, 0.53)).g - 0.5);
    // Skies lane (2026-10-06, the gauntlet's waves 127 and 128: Glacier's and Frosthollow's ring faces "a featureless,
    // vertically smeared grey sheet"): the stretch and the swell multiply the ABSOLUTE height, so their gradients along
    // the wall shear its v by the height itself — about 2 m of v per metre along the wall at 50 m up, 7 at 150 m, 11 at
    // 250 m; the snow maps' steep ring faces stand 50–390 m up, every wall projection there squeezed into vertical slivers.
    // Their walls carry no strata: a snow map keeps the per-cliff offset and the beds' wander and no stretch.
    if (uReduxD.y > 1.5) { wallVScale = 1.0; bedSwell = 1.0; }
    float wallV = wp.y + (wallVScale * bedSwell - 1.0) * 7.6394 * sin((wp.y + wallVOff) * 0.13090);
    gWallUVx.y = -wallV + wallVOff + gBedWob;
    gWallUVz.y = -wallV + wallVOff + gBedWob;
    gCliffJ = cliffJ;
  }
  // r5 terrain_environment: TRUE TRIPLANAR for the GROUND layers, decoupled
  // from the rock takeover. The 24-45 deg dune/mesa-flank band stayed sand
  // (fR/steepW only start at ~37 deg) but kept PLANAR XZ UVs — the 16x aniso
  // sampler dutifully resolved the 1/cos-stretched texels into long downslope
  // strands: the "vertical corduroy" striations on every desert dune face
  // (top critique item). From ~28 deg the base layer re-samples in the two
  // fixed wall planes (same texture, world-anchored), so steep sand reads as
  // bedded sand instead of dragged paint. MATERIAL choice keeps its own
  // thresholds; only the PROJECTION switches early.
  float triW = smoothstep(0.12, 0.30, slope);
  float projW = max(steepW, triW); // gate for every planar-projected extra
  // dirt patches are an XZ-projected field — on slopes they compressed into
  // downslope smears ("dirt/grime streaks" critique); steep faces run clean.
  // Round 47 (2026-09-23, owner: Sirocco/Sunscar "ground patterns too black"): the 30 % residue left on steep faces
  // was the darker worn-sand D set drawn along the contour lines of every ring face — the layer-flag probe showed the
  // dark swirls as the D mask's blend zones. Steep faces now run fully clean; flats keep their patches.
  fD *= 1.0 - triW;
  // Round 47 (2026-09-23, owner: Sirocco/Sunscar "the squigglies on the ground are so black"): on the arid maps the
  // darker worn-sand D set is XZ-projected, so on a dune face its 85 m patches foreshorten into black contour
  // lines. Arid maps (uSandMacro > 0) keep D on the floor only: it fades from ~9° and is gone by ~28°.
  if (uSandMacro > 0.001) fD *= 1.0 - smoothstep(0.012, 0.12, slope);
  // round 73: the scree band — where a map authors it, the D layer (dirt, scree) runs in a noise-broken band on the
  // 12°–30° slopes under the rock take-over, so a snowfield or a meadow meets its cliffs through a talus apron and
  // not on one smoothstep line; then the dirt border itself is a height-and-noise transition (reduxHeightMix)
  float scree = uReduxA.z * smoothstep(0.10, 0.20, slopeR + (n1h - 0.5) * 0.10) * (1.0 - smoothstep(0.32, 0.46, slopeR))
    * (1.0 - mkB * 0.85) * rockGate;
  fD = max(fD, scree * (0.55 + 0.45 * n1hs));
  // Terrain v2 (2026-10-01, the cost pass): coverage-gated sampling. Every coverage weight is known here (the height
  // transitions below keep a weight of 0 at 0 and of 1 at 1), so a layer is fetched only when it shows: the base tile
  // where the dirt, sand, water, rock and wall layers above it leave any of it, the dirt only on worn ground, the water
  // layer only on wet ground, the rock only on rock. The old order sampled all four layers, twice each (albedo and
  // normal), at every fragment and multiplied most of them by zero. Past the far band (farM ~ 1) the layers' detail
  // normals are not fetched at all — at a quarter metre a texel they are sub-pixel there, the geometric normal and the
  // coarse relief terms below carry the shading (SPLAT_NORMAL_FRAG had already faded them to a third).
  bool nrmOn = farM < 0.98;
  float keepS = 1.0 - steepW;                      // what the steep wall projection leaves of everything below it
  float keepR = keepS * (1.0 - fR);                 // ... and the rock above the water and the soil
  float keepM = keepR * (1.0 - fMs);
  float covG = keepM * (1.0 - seaSand) * (1.0 - fD); // the base tile's share of the final albedo
  vec4 a = uMeanG; // a skipped base tile reads as its own mean (any residual share neutral, the height transition flat)
  vec4 n = NRM_MEAN;
  if (covG > 0.002) {
    a = groundSamp(uAlbG, uMeanG, uv * 0.240, df, mipB);
    if (nrmOn) n = groundNrm(uNrmG, uv * 0.240, df, mipB);
    // r5 anti-tiling: the ground texture's clump pattern repeats at ONE fixed
    // world scale, so every distance ring shows same-size dark blobs — the
    // "camo carpet" read. Re-sample the same layer at a ~2.3x coarser scale and
    // blend it in over ~35 m noise patches: the characteristic pattern scale
    // now wanders across the map instead of stamping uniformly.
    float scMix = smoothstep(0.40, 0.78, nz(uvW, 0.0071, vec2(0.23, 0.51)).g);
    if (scMix > 0.003) {
      a = mix(a, groundSamp(uAlbG, uMeanG, uv * 0.1043, df, mipB), scMix * 0.7);
      if (nrmOn) n = mix(n, groundNrm(uNrmG, uv * 0.1043, df, mipB), scMix * 0.7);
    }
    if (triW > 0.003) {
      a = mix(a, wallSamp(uAlbG, uMeanG, 0.240, df, mipB), triW);
      if (nrmOn) n = mix(n, wallNrm(uNrmG, 0.240, df, mipB), triW);
    }
    // the worn patch's rim: grazed turf, its green yellowed and a shade lighter (cropped short to the light)
    // (wave 88: the ground between the grass "a pale sandy grey-beige, neither Prokhorovka's black chernozem nor Hesse's
    // brown loam") and the place's soil showing through the cropped sward — four tenths of it, its hue a third greyed
    if (grazeT > 0.003) {
      vec3 grazeSoil = uMeanD.rgb * uSoilTint;
      grazeSoil = mix(grazeSoil, vec3(reduxLuma(grazeSoil)), 0.33);
      a.rgb = mix(a.rgb, mix(a.rgb * vec3(1.14, 1.05, 0.76), grazeSoil, 0.40), grazeT * 0.60 * (1.0 - shoulder) * (1.0 - triW));
    }
  }
  // round 73: the base layer's relief against its tile mean, and the transition strength — full inside
  // the near variant, gone with the far one, off the wall projections whose UVs are not the planar tiles'
  float hK = uReduxA.x * 2.5 * (1.0 - farM) * (1.0 - projW);
  float hBase = 0.0;
  if (hK > 0.001) hBase = reduxLuma(a.rgb) - reduxLuma(uMeanG.rgb);
  // Ground lane (2026-10-03, the coordinator from Glacier Pass and the gauntlet's wave 4 on Winter: "brown swirled
  // smears with a combed brush-stroke pattern"): on a snow map, wear — a yard, a verge, a scoured crest — is snow
  // trampled and compacted, grey-white, slushy in its hollows, not bare soil; the ground shows through only where the
  // wear is strong, and sooner on a slope turned to the sun
  if (uReduxD.y > 1.5 && fD > 0.002) {
    float slush = smoothstep(0.55, 0.82, n1h * 0.6 + n1 * 0.4) * smoothstep(0.0, 0.4, vFold + 0.1);
    vec3 trampled = a.rgb * vec3(0.80, 0.81, 0.84) * (0.93 + 0.10 * n1h);
    trampled = mix(trampled, a.rgb * vec3(0.58, 0.60, 0.63), slush * 0.6);
    a.rgb = mix(a.rgb, trampled, min(1.0, fD * 1.4));
    float sunSide = smoothstep(0.15, 0.65, dot(wn, uSunDirW));
    fD = smoothstep(0.70, 0.95, fD) * mix(0.45, 1.0, sunSide);
  }
  // ground lane (2026-10-08, the gauntlet's wave 260 on Cinder Junction's yard: "a dead-flat plane of dark mulch with
  // evenly spaced identical grass blades" — the dirt photo's forest litter, its twigs and leaf, on a rail yard): a yard's
  // floor is cinder, the engines' ash and clinker spread and trodden, in its own patches — coal dust black where the coal
  // was handled, the spent ash a paler grey where it lay and dried, rust off the scrap and the brake blocks — with oil
  // where the engines stood, and its clinker near the camera (the works' slag grain). The yard is the village mask's on a
  // map whose ground profile floors it so (groundRedux.ts cinderYard); 0 everywhere else, and the block is skipped.
  float yardW = uYardCinder * smoothstep(0.10, 0.55, mk.a);
  float cinN = 0.5, cinVis = 0.0;
  if (fD > 0.002 && keepM * (1.0 - seaSand) > 0.002) {
    vec4 aD = groundSamp(uAlbD, uMeanD, uv * 0.210, df, mipB);
    aD.rgb *= uSoilTint; // (wave 79: the place's own soil, not the strand's sand)
    if (yardW > 0.002) {
      vec3 dM = uMeanD.rgb * uSoilTint;
      // the photo's litter at a sixth of its contrast near the camera, where its twigs read as twigs (the grain below
      // takes their place), and at four fifths of it from ~8 m, where what is left of them is the ground's texture (the
      // anisotropic tap keeps it across a grazing view, where no procedural term of this block survives the footprint);
      // most of its brown taken out, a shade darker
      // (the lab's second and third frames, the yard's low view: a sixth, then a half, left the floor from 5 m on one flat
      // grey plane)
      vec3 cin = dM + (aD.rgb - dM) * mix(0.16, 0.80, smoothstep(0.012, 0.035, gFootM));
      // (a cinder's grey is a little warm — the lab's cold grey read as asphalt)
      cin = mix(cin, vec3(reduxLuma(cin)), 0.6) * vec3(0.88, 0.85, 0.83);
      // the floor's own lumps and hollows, trodden and spread: ~25 cm and ~60 cm of tone (the noise with no period), a
      // twelfth each way, faded before they can shimmer; and its ~3 m spreads, darker and paler by a sixth, which still
      // read at a grazing 30 m where the finer terms are gone
      vec2 yL = nzq(uv, 0.90, vec2(0.41, 0.19));
      vec2 yM = nzq(uv, 0.071, vec2(0.67, 0.31));
      cin *= 1.0 + ((yL.x - 0.5) * 0.34 * tileVis(0.25) + (yL.y - 0.5) * 0.30 * tileVis(0.6) + (yM.x - 0.5) * 0.36 * tileVis(3.0));
      // the patches (~8 m, the noise with no period): coal dust, dried ash, rust
      vec2 yP = nzq(uv, 0.021, vec2(0.17, 0.43));
      float coal = smoothstep(0.56, 0.78, yP.x);
      float ash = smoothstep(0.58, 0.80, 1.0 - yP.x) * smoothstep(0.30, 0.62, yP.y);
      float rust = smoothstep(0.62, 0.82, yP.y) * (1.0 - coal);
      cin *= mix(1.0, 0.48, coal);
      cin = mix(cin, vec3(reduxLuma(dM) * 1.65) * vec3(1.0, 0.98, 0.95), ash * 0.62);
      cin *= mix(vec3(1.0), vec3(1.30, 0.98, 0.76), rust * 0.55);
      // the oil: stains a metre or two across where the engines stood — kept to some stretches of the yard (the ~14 m
      // field), ragged at their edges (a 16 cm read), black and a little smooth, faded before their edges can shimmer
      float oilY = smoothstep(0.70, 0.82, nz(uv, 0.083, vec2(0.61, 0.29)).g + (nz(uv, 0.61, vec2(0.23, 0.77)).r - 0.5) * 0.22)
        * smoothstep(0.42, 0.66, n1) * tileVis(1.5);
      cin *= 1.0 - 0.5 * oilY;
      // the grain near the camera: cinder and ash in ~3 cm grains, each its own tone (a few rusty, a few pale ash), the
      // gaps between them dark and each grain's face its own tilt (the clinker's relief, below) — the nearest of a
      // jittered cell grid's points by an integer hash (exact anywhere on the map), faded to the pattern's mean while a
      // grain still spans two or three pixels
      cinVis = 1.0 - smoothstep(0.012, 0.028, gFootM);
      if (cinVis > 0.001) {
        vec2 gq = uv / 0.03, gc = floor(gq), gf = gq - gc;
        float d1 = 9.0, d2 = 9.0;
        vec2 h1 = vec2(0.5);
        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            vec2 o = vec2(float(i), float(j));
            uvec2 q = uvec2(ivec2(gc + o) + ivec2(1 << 20)) * uvec2(1597334673u, 3812015801u);
            uint hn = (q.x ^ q.y) * 1597334673u;
            vec2 h = vec2(uvec2(hn, hn * 16807u) >> 8u) * (1.0 / 16777216.0);
            vec2 r = o + 0.15 + 0.70 * h - gf;
            float d = dot(r, r);
            if (d < d1) { d2 = d1; d1 = d; h1 = h; } else if (d < d2) { d2 = d; }
          }
        }
        // (the lab's second frames: every grain one size, packed edge to edge, read as a mosaic) a third of the cells are
        // the fines between the grains — the ash's own tone, no edge, no face
        float fines = step(0.10, h1.y) * step(h1.y, 0.42);
        float gap = (1.0 - smoothstep(0.03, 0.10 + 0.12 * h1.x, sqrt(d2) - sqrt(d1))) * (1.0 - fines);
        vec3 gTone = vec3(mix(0.68 + 0.64 * h1.x, 0.97, fines)) * (1.0 - 0.50 * gap);
        gTone *= h1.y > 0.88 ? vec3(1.28, 0.96, 0.74) : h1.y < 0.10 ? vec3(1.30) : vec3(1.0);
        cin *= mix(vec3(1.0), gTone / 0.95, cinVis);
        cinN = mix(h1.x * 0.5 + h1.y * 0.5, 0.5, fines);
      }
      aD.rgb = mix(aD.rgb, cin, yardW);
      gYardOil = oilY * yardW;
    }
    // ground lane: under thin snow the ground that shows is the winter sward — flattened straw and heather, a dull
    // khaki — not the photo's brown mud
    if (uReduxD.y > 1.5) {
      float dL = dot(aD.rgb, vec3(0.36, 0.42, 0.22));
      aD.rgb = mix(aD.rgb, vec3(dL) * vec3(1.16, 1.06, 0.80) * 1.08, 0.62);
    }
    // the relief taps and the mix only where the transition runs (the far field and the ?ground=legacy A/B keep
    // the plain mask: with k = 0 reduxHeightMix would still S-curve it)
    if (hK > 0.001) {
      float hD = reduxLuma(aD.rgb) - reduxLuma(uMeanD.rgb * uSoilTint);
      fD = reduxHeightMix(fD, hBase, hD, hK);
      hBase = mix(hBase, hD, fD);
    }
    a = mix(a, aD, fD);
    if (nrmOn) n = mix(n, groundNrm(uNrmD, uv * 0.210, df, mipB), fD);
    // (the cinder yard: the photo's twig relief mostly flattened, the grains' faces in its place)
    if (nrmOn && yardW > 0.002) {
      float yd = yardW * fD;
      n.xy = mix(n.xy, vec2(0.5), 0.7 * yd) + vec2(cinN - 0.5, fract(cinN * 7.31) - 0.5) * 0.45 * cinVis * yd;
    }
    gYardOil *= fD;
  }
  if (seaSand > 0.003) { // maps r1: bare shoreline apron under the surf line
    a = mix(a, groundSamp(uAlbD, uMeanD, uv * 0.210, df, mipB), seaSand);
    if (nrmOn) n = mix(n, groundNrm(uNrmD, uv * 0.210, df, mipB), seaSand);
  }
  if (fMs > 0.002 && keepR > 0.002) {
    a = mix(a, groundSamp(uAlbM, uMeanM, uv * 0.190, df, mipB), fMs);
    if (nrmOn && uRingDraw < 0.5) n = mix(n, groundNrm(uNrmM, uv * 0.190, df, mipB), fMs);
  }
  // maps lane B (2026-10-03, the gauntlet: Tarkhan Steppe's pans "read as snow patches or grey mud"): a sor's floor is
  // crusted with salt — white-grey, thinner where the silt shows through, broken into faint desiccation polygons —
  // and its margin is damp silt, darker and smoother than the steppe around it. The crust's edge sits on the floor's
  // shore (the fill in the height field), so the white ends where the hollow's own ground meets the floor.
  if (uSaltCrust.x > 0.5 && fM > 0.002) {
    float crustW = smoothstep(0.26, 0.36, fM);
    float dampW = smoothstep(0.015, 0.09, fM) * (1.0 - crustW) * uSaltCrust.z;
    if (crustW > 0.002) {
      vec3 crustC = vec3(0.44, 0.43, 0.40);
      crustC *= 0.82 + nzq(uv, 0.083, vec2(0.23, 0.59)).x * 0.30;
      crustC = mix(crustC, crustC * vec3(0.78, 0.75, 0.70), smoothstep(0.62, 0.82, nz(uv, 0.031, vec2(0.67, 0.21)).g) * 0.7);
      vec2 cp = wp.xz / uSaltCrust.y;
      vec2 ci = floor(cp);
      vec2 cf = fract(cp);
      float d1 = 8.0;
      float d2 = 8.0;
      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec2 g = vec2(float(i), float(j));
          vec2 r = g + cellHash2(ci + g) * 0.8 + 0.1 - cf;
          float d = dot(r, r);
          if (d < d1) {
            d2 = d1;
            d1 = d;
          } else if (d < d2) {
            d2 = d;
          }
        }
      }
      float edgeM = (sqrt(d2) - sqrt(d1)) * uSaltCrust.y;
      float crackFw = max(length(fwidth(wp.xz)), 1e-4);
      float crack = (1.0 - smoothstep(0.03, 0.03 + crackFw * 1.5, edgeM)) * tileVis(uSaltCrust.y);
      // faint and uneven: a crack shows where the crust has curled (a 5 m patchwork), barely where it has not
      crustC *= 1.0 - crack * (0.06 + 0.14 * nzq(uv, 0.19, vec2(0.61, 0.13)).x);
      a.rgb = mix(a.rgb, crustC, crustW);
      a.a = mix(a.a, 0.93, crustW);
      if (nrmOn) n = mix(n, NRM_MEAN, crustW * 0.75);
    }
    a.rgb *= 1.0 - dampW * 0.40;
    a.rgb = mix(a.rgb, a.rgb * vec3(0.93, 0.89, 0.81), dampW);
    a.a = mix(a.a, a.a * 0.72, dampW);
  }
  // rock layer: pre-blend planar/wall by triW so the partial-fR band (24-45
  // deg) never lays stretched planar rock over the triplanar sand
  if (fR > 0.002 && keepS > 0.002) {
    vec4 aR, nR = NRM_MEAN;
    vec4 meanR = uMeanR;
    if (uPavedRock > 0.5) {
      // the map-borders lane: a paved map's hillside is its bare ground, not its cobbles (the census's white streaks)
      meanR = uMeanD;
      aR = groundSamp(uAlbD, uMeanD, uv * 0.210, df, mipB);
      if (nrmOn) nR = groundNrm(uNrmD, uv * 0.210, df, mipB);
      if (triW > 0.003) {
        aR = mix(aR, wallSamp(uAlbD, uMeanD, 0.210, df, mipB), triW);
        if (nrmOn) nR = mix(nR, wallNrm(uNrmD, 0.210, df, mipB), triW);
      }
    } else {
      // (the Redrock lane, round 10, the gauntlet's wave 270: the domes' "crumbly speckled skin" — on Redrock the rock tile
      // reads a level and a third coarser, its sand-grain speckle gone, and the jebel faces' beds and joints carry the
      // rock's detail instead: jebelFaceV2; the bias is the rock's alone, taken off again after it)
      mipB += 1.3 * uJebelFace.x;
      aR = groundSamp(uAlbR, uMeanR, uv * 0.155, df, mipB);
      if (nrmOn) nR = groundNrm(uNrmR, uv * 0.155, df, mipB);
      if (triW > 0.003) {
        aR = mix(aR, wallSamp(uAlbR, uMeanR, 0.155, df, mipB), triW);
        if (nrmOn) nR = mix(nR, wallNrm(uNrmR, 0.155, df, mipB), triW);
      }
      mipB -= 1.3 * uJebelFace.x;
    }
    // round 73: the rock border is a height transition too — the outcrop's high faces clear the turf or the snow,
    // its seams stay buried
    if (hK > 0.001) {
      float hR = reduxLuma(aR.rgb) - reduxLuma(meanR.rgb);
      fR = reduxHeightMix(fR, hBase, hR, hK * 0.8);
      hBase = mix(hBase, hR, fR);
    }
    a = mix(a, aR, fR); n = mix(n, nR, fR);
  }
  // wall-coherent low-freq noise: the planar n2 field is near-degenerate down
  // a vertical face (grazing-angle gradient = wavy banding along cliff tops)
  float n2Wall = wallNoiseG(0.0031, vec2(0.41, 0.13));
  if (steepW > 0.001) {
    if (uPavedRock > 0.5) {
      a = mix(a, wallSamp(uAlbD, uMeanD, 0.210, df, mipB), steepW);
      if (nrmOn) n = mix(n, wallNrm(uNrmD, 0.210, df, mipB), steepW);
    } else {
      vec4 aS = wallSamp(uAlbR, uMeanR, 0.155, df, mipB + 1.3 * uJebelFace.x);
      a = mix(a, aS, steepW);
      if (nrmOn) n = mix(n, wallNrm(uNrmR, 0.155, df, mipB), steepW);
    }
  }
  // Ground lane (wave 80, Titan Gorge's and Redrock's establishing views: "a glaring magenta/pink wavy decal stripe
  // across the ground" — the 38–76° scarps of their ridges and knolls seen edge-on 350–770 m out, each one flat,
  // saturated ribbon of the rock tone): on an arid map a rock face at range is its weathered skin — half its colour's
  // saturation, pulled a quarter toward the ground around it at its own luminance (the dust on it and the aerial depth
  // between), and streaked along the band by the varnish running down its fall line (the wall projections' noise
  // stretched along the height), so it reads as weathered rock, not a painted ribbon
  float rockFar = max(fR, steepW) * smoothstep(150.0, 450.0, camDist) * step(0.5, uReduxD.y) * step(uReduxD.y, 1.5);
  if (rockFar > 0.003) {
    float lodV = max(0.0, gNoiseLog + log2(0.05));
    float varnish = mix(textureLod(uNoise, gWallUVx * vec2(0.05, 0.006) + vec2(0.29, 0.53), lodV).r,
                        textureLod(uNoise, gWallUVz * vec2(0.05, 0.006) + vec2(0.29, 0.53), lodV).r, gWallW);
    float rockL = reduxLuma(a.rgb);
    vec3 skin = mix(vec3(rockL), a.rgb, 0.50);
    skin = mix(skin, uMeanG.rgb * rockL / max(reduxLuma(uMeanG.rgb), 1e-3), 0.25);
    a.rgb = mix(a.rgb, skin * (0.84 + 0.32 * varnish), rockFar);
  }
  // Ground lane (wave 62, Glacier Pass street-b, 2.2, the worst view: "a blue-and-white swirled marble/agate texture …
  // a broken material", Frosthollow's walls the same): a snow map's rock layer was Rock058 lifted half again and
  // blued (sourcedTextures: "snow-dusted rock"), and its veins became polished marble wherever a slope turned rock. The
  // rock is grey rock again, and snow lies on it as snow lies on a mountain: everywhere up to ~45°, then held in the
  // hollows and the gullies down the fall line (the wall projections' noise stretched along the height, as the
  // cinder's streaks), the ribs and the sheer faces standing out of it — the snow layer itself, its own grain, never a
  // tint over the rock's veins.
  if (uReduxD.y > 1.5) {
    float rockW = max(fR, steepW) * (1.0 - fMs);
    if (rockW > 0.002) {
      // Skies lane (2026-10-06, the gauntlet's waves 127 and 128 — Glacier's and Frosthollow's ring faces "a featureless,
      // vertically smeared grey sheet", "draped cloth"; with the ground lane's ack): the gullies were one field stretched
      // 8:1 down the height at a 22 m repeat, and a steep face lies wholly inside the hold's 45–64° band, so the face printed
      // that field as fine vertical hatching and hung a fringe of snow tongues under every crest. A face now holds its snow
      // in structures: couloirs — the crests of a coarse 3:1 field down the fall line (~25 m across, ~80 m long), only in
      // the systems the slow wall field picks; the hold's own breakup at a quarter of its swing; and from ~48° a lean to
      // bare rock outside the couloirs, so the steep band is rock carrying its snow on ledges (below). The hold line is the
      // ground lane's law, unchanged (snowRockHoldLine swaps it per map).
      float lodG = max(0.0, gNoiseLog + log2(0.006));
      float coulN = mix(textureLod(uNoise, gWallUVx * vec2(0.006, 0.002) + vec2(0.41, 0.17), lodG).g,
                        textureLod(uNoise, gWallUVz * vec2(0.006, 0.002) + vec2(0.41, 0.17), lodG).g, gWallW);
      float couloir = smoothstep(0.55, 0.68, coulN) * smoothstep(0.35, 0.60, 1.0 - n2Wall);
      float gully = 0.5 + (coulN - 0.5) * 0.25 - 0.30 * smoothstep(0.34, 0.48, slope) * (1.0 - couloir) + couloir * 0.55;
      float hold = 1.0 - smoothstep(0.30, 0.56, slope + (0.5 - gully) * 0.40 - vFold * 0.12);
      // ledges: snow on the shelves of round 35's warped height ladder (non-periodic beds ~14–30 m apart, the per-cliff
      // phase, ±2 m of along-wall wander), in runs where the slow wall field is high (the couloirs' systems are where it
      // is low), on the steep band only and gone from the sheerest faces
      float ledgeWarp = wallNoiseG(0.02, vec2(0.31, 0.77));
      float ledge = bedSignal(wp.y + ledgeWarp * 2.2, 0.008, gCliffJ + 0.53);
      float ledgeHold = smoothstep(0.0, 0.35, ledge) * smoothstep(0.38, 0.56, n2Wall)
        * smoothstep(0.26, 0.40, slope) * (1.0 - smoothstep(0.74, 0.86, slope));
      hold = max(hold, ledgeHold * 0.9);
      gSnowRock = hold * rockW;
      if (gSnowRock > 0.002) {
        vec4 snowA = groundSamp(uAlbG, uMeanG, uv * 0.240, df, mipB);
        vec4 snowN = nrmOn ? groundNrm(uNrmG, uv * 0.240, df, mipB) : NRM_MEAN;
        if (triW > 0.003) {
          snowA = mix(snowA, wallSamp(uAlbG, uMeanG, 0.240, df, mipB), triW);
          if (nrmOn) snowN = mix(snowN, wallNrm(uNrmG, 0.240, df, mipB), triW);
        }
        a = mix(a, snowA, gSnowRock);
        if (nrmOn) n = mix(n, snowN, gSnowRock);
      }
    }
  }
  // meadow macro variation, three scales (~80 m, ~230 m, ~600 m): dry-straw
  // patches, dark clover, and broad field-to-field tone shifts so open ground
  // never reads as one continuous green wash at any distance
  // r7 terrain_environment: meadowA is a TWO-SCALE composite. The single
  // 0.0121 sample of the 256-texel noise repeats every ~83 m and the dry-
  // straw patchwork visibly restamped on that period (critique: "mottle
  // pattern visibly repeats, ~50-70 m period"). A second incommensurate
  // scale (~128 m, other channel) breaks the period; CPU twin
  // (sampleSplatNoise) mirrors this exactly for grass/dirt correlation.
  float meadowA = nz(uvW, 0.0121, vec2(0.63, 0.29)).r * 0.62
                + nz(uvW, 0.00779, vec2(0.19, 0.71)).g * 0.38;
  float meadowB = nz(uvW, 0.0043, vec2(0.11, 0.87)).g;
  float meadowC = nz(uvW, 0.0016, vec2(0.37, 0.55)).r;
  // strength capped ~0.30-0.35 with n1 edge breakup so patch borders are
  // ragged at the ~10 m scale — full-strength smoothstep bands read as a
  // broken cloud-shadow projector in wide shots. DARK-CLOVER (uTintB, the
  // only darkening tint) capped at ~0.22 (lighting_post r1): stacked with
  // canopy shadows + grade contrast the old 0.34 max read as amorphous
  // dark masses / a broken cloud-shadow projector in battlefield.png.
  // r7: meadow tints are planar-projected — on cliff walls they stretched
  // into full-height tint stripes (a big taffy-smear contributor); gate them
  // off steep faces and let the wall macro octave below carry the variation
  float meadowG = (1.0 - fD) * (1.0 - projW) * (1.0 - fMs);
  // r4: tint strengths raised ~30% (A 0.22+0.18 -> 0.28+0.20, B 0.14+0.08 ->
  // 0.17+0.09, C 0.16+0.14 -> 0.21+0.16) — the macro dry-straw/clover fields
  // were too subtle to register from the chase camera and the ground read as
  // one continuous green wash (critique: "no macro albedo variation")
  // r7: band recentred for the two-scale composite's lower variance + one
  // more strength step — the dry-straw fields must read from the chase cam
  // (ground lane, wave 69: one product, kept — a sown or grazed field divides it back out: its tone is its own, not the
  // meadow's round patches)
  gMeadowTint = mix(vec3(1.0), uTintA, smoothstep(0.52, 0.80, meadowA) * (0.33 + 0.20 * n1) * meadowG)
    * mix(vec3(1.0), uTintB, smoothstep(0.58, 0.85, 1.0 - meadowB) * (0.17 + 0.09 * n1) * meadowG)
    * mix(vec3(1.0), uTintC, smoothstep(0.52, 0.9, meadowC) * (0.21 + 0.16 * n1) * meadowG)
    * mix(0.93 + meadowC * 0.14, 1.0, projW);
  a.rgb *= gMeadowTint;
  // ground lane (2026-10-08, the gauntlet's wave 274 on Monsoon Ridge's foot: "a smooth, flat, saturated lawn-green surface
  // with no soil, litter or dry thatch" between the tufts): under a thick sward the ground is last season's thatch — dead
  // blades lying flat, a dull straw-brown — and the dark soil between the tussocks, not lawn. Where the sward stands thick
  // (the tall grass's own density field: n1), in patches of ~0.5–1.5 m; at a distance the blades' tops carry the
  // hillside's green and the ground between them shows less, so it eases to under half by 120 m (never to nothing: a
  // ring of brown round the camera would follow it)
  if (uThatch > 0.001 && meadowG > 0.002) {
    vec2 thQ = nzq(uv, 0.55, vec2(0.21, 0.67));
    float thW = uThatch * meadowG * mix(1.0, 0.45, smoothstep(30.0, 120.0, camDist)) * (0.35 + 0.65 * smoothstep(0.30, 0.75, n1))
      * (1.0 - fR) * (1.0 - roadCore);
    if (thW > 0.002) {
      vec3 thatchCol = vec3(0.118, 0.098, 0.052) * (0.85 + 0.30 * thQ.y);
      vec3 soilCol = uMeanD.rgb * uSoilTint * 0.80;
      vec3 under = mix(thatchCol, soilCol, smoothstep(0.58, 0.82, thQ.x));
      a.rgb = mix(a.rgb, under, thW * (0.50 + 0.35 * smoothstep(0.30, 0.70, thQ.x)));
    }
  }
  // ground lane: the earthworks' bank — patchy dug soil between the turf the bank keeps (bankSoil, above), in the
  // ground plane on a gentle bank and the walls' projection on a steep one, so its texels never stretch downslope
  if (bankSoil > 0.003) {
    vec4 aB = groundSamp(uAlbD, uMeanD, uv * 0.210, df, mipB);
    vec4 nB = NRM_MEAN;
    if (nrmOn) nB = groundNrm(uNrmD, uv * 0.210, df, mipB);
    if (triW > 0.003) {
      aB = mix(aB, wallSamp(uAlbD, uMeanD, 0.210, df, mipB), triW);
      if (nrmOn) nB = mix(nB, wallNrm(uNrmD, 0.210, df, mipB), triW);
    }
    a = mix(a, aB, bankSoil);
    n = mix(n, nB, bankSoil);
  }
  // Ground lane (2026-10-03, Caldera's gauntlet: "dunes on a volcanic basin — every slope one monotone tan-brown, no lava
  // flows, cinder cones or colour zoning"): a volcanic basin's ground zoned by its landforms' slopes and folds, never by
  // a wind (groundRedux VOLCANIC, uReduxFold.w). The level basin is pumice and ash, a pale warm grey; a cone's flanks —
  // the angle of repose — black cinder, oxidised red in patches, with paler weathered streaks down the fall line (the
  // wall projections' noise stretched along the height: lines of constant x on an x-facing flank are its fall lines);
  // the gentle hollow aprons at the cones' feet a talus of cinder and lighter fragments. The basalt (the rock layer:
  // the flows, the crater walls) keeps its own.
  if (uReduxFold.w > 0.001) {
    float vw = uReduxFold.w * (1.0 - roadCore) * (1.0 - fR);
    if (vw > 0.002) {
      float ashW = 1.0 - smoothstep(0.05, 0.15, slope);
      float coneW = smoothstep(0.13, 0.30, slope);
      float fanW = smoothstep(0.06, 0.13, slope) * (1.0 - smoothstep(0.20, 0.30, slope)) * smoothstep(0.02, 0.30, vFold);
      // ash: pale pumice, a breath of warmth, its own 20–40 m drifts of paler and darker fall
      vec2 af = nzq(uvW, 0.026, vec2(0.47, 0.81));
      a.rgb = mix(a.rgb, a.rgb * vec3(1.32, 1.28, 1.20) * (0.90 + 0.20 * af.x), ashW * vw);
      // cinder: black, oxidised red in ~15–30 m patches, streaked paler down the fall line
      float ox = smoothstep(0.50, 0.78, nzq(uvW, 0.017, vec2(0.13, 0.37)).y);
      // (wave 62, Caldera street-a: "a near-black featureless dome … white specular glints … sparkles with bright
      // pixels", read as "wet asphalt or crumpled foil") scoria is porous and dead matte, and black only fresh: a
      // shade lighter (≈0.09 against the ash's 0.15) so its own streaks and oxidised patches read, and no sheen
      vec3 cinderCol = a.rgb * mix(vec3(0.68, 0.65, 0.62), vec3(0.90, 0.62, 0.48), ox);
      float lodF = max(0.0, gNoiseLog + log2(0.035));
      float fall = mix(textureLod(uNoise, gWallUVx * vec2(0.035, 0.0035) + vec2(0.23, 0.71), lodF).r,
                       textureLod(uNoise, gWallUVz * vec2(0.035, 0.0035) + vec2(0.23, 0.71), lodF).r, gWallW);
      cinderCol *= 1.0 + 0.32 * smoothstep(0.56, 0.80, fall) * tileVis(28.0);
      a.rgb = mix(a.rgb, cinderCol, coneW * vw);
      // talus fans: cinder strewn with paler fragments in metre-scale blotches
      // (wave 62: the talus fans' paler fragments under a low sun were the "white specular glints" on the cone's lower
      // third — the lighter lapilli a step paler than the cinder, never paler than the ash)
      a.rgb = mix(a.rgb, a.rgb * mix(vec3(0.66, 0.63, 0.62), vec3(0.92, 0.88, 0.84), smoothstep(0.45, 0.70, n1h)), fanW * vw * 0.8);
      gCinderW = max(coneW, fanW) * vw;
    }
    // (waves 62 and 76, Caldera street-a and street-b: the rim's 33° slope "a near-black featureless dome") the rim is old
    // basalt in the rock layer, not a cone's fresh cinder: its face weathered and dusted with the ash it stands in — half
    // way to the ash's own tone, a breath warmer — and streaked down the fall line (the wall projections' noise stretched
    // along the height, as the cinder's), faded as a streak nears the pixel
    float rimW = uReduxFold.w * fR * (1.0 - roadCore);
    if (rimW > 0.002) {
      float lodR = max(0.0, gNoiseLog + log2(0.035));
      float fallR = mix(textureLod(uNoise, gWallUVx * vec2(0.035, 0.0035) + vec2(0.61, 0.19), lodR).g,
                        textureLod(uNoise, gWallUVz * vec2(0.035, 0.0035) + vec2(0.61, 0.19), lodR).g, gWallW);
      // (wave 85: the shaded rim "nearly texture-less") the weathering shifts the basalt's tone half way to the ash's —
      // a scale on the rock's own colour, so its grain (the lapilli, the scoria's colour) stays whole in the shade
      vec3 ashShift = mix(vec3(1.0), uMeanG.rgb * vec3(1.08, 1.0, 0.90) / max(uMeanR.rgb, vec3(0.02)), 0.45);
      vec3 weathered = a.rgb * ashShift * (0.88 + 0.30 * smoothstep(0.40, 0.80, fallR) * tileVis(28.0));
      a.rgb = mix(a.rgb, weathered, rimW * 0.75);
    }
  }
  // Ground lane (2026-10-03, the gauntlet: "WoT's Prokhorovka and the Breton bocage photo show patchworks of fields in
  // distinct crops and colours, with boundaries, tracks and hedgerows. Ours is one uniform plain."): the land use
  // (landUse.ts, lu_field) over the open, level ground — off the roads, villages, water, rock and slopes past ~12°.
  // A field takes its crop's colour over the local sward's own tone (the texture's grain survives): ripe wheat, pale
  // barley, young green crop, stubble, dark sunflower, or the soil layer for a plough of black earth; every crop
  // carries its own rows — furrows, tramlines, combine swaths, mowing stripes — each faded by its period over the
  // footprint; a grass margin rings every field, and dirt tracks with two ruts run along the long boundaries.
  // The woods: the stands' cover from the placed trees (vegetation.ts _woodsMask in the noise texture's blue channel,
  // 4 m texels over the square, 0 until the world's assembly applies it — terrain applyWoodsMask). No field is sown
  // under a closed canopy; the forest floor is drawn below.
  float woods = 0.0;
  if (max(abs(wp.x), abs(wp.z)) < 511.0) woods = nz(wp.xz, 1.0 / 1024.0, vec2(0.5)).b;
  float landW = 0.0;
  if (uLandA.x > 0.001) {
    // (farmland, waves 46–47: "a smudged mosaic of green, tan and dark-brown blotches") a field is sown across the
    // sward's worn patches — the meadow's own dirt (fD's worn term) no longer opens holes in it; its yards, verges and
    // rock still do (mk.a, shoulder, fR below)
    // (2026-10-05, Ruinspires: an urban land use — uLandE.w, landUse.ts LandUseProfile.urban — lies inside the village,
    // its yards, courts, allotments and parks under the town's own wear, laid over them below; elsewhere the village and
    // its wear keep the fields off)
    // (Ironworks: a works' ground is uLandE.w 2 — the village's gate reads it as the urban 1)
    landW = uLandA.x * (1.0 - projW) * (1.0 - fMs) * (1.0 - fR) * (1.0 - outsideW) * (1.0 - smoothstep(0.05, 0.30, mk.a) * (1.0 - step(0.5, uLandE.w)))
      * (1.0 - shoulder) * (1.0 - smoothstep(0.040, 0.100, slope)) * (1.0 - smoothstep(0.02, 0.10, fM))
      * (1.0 - smoothstep(0.35, 0.70, woods));
    // (wave 81, Frontier's establishing view: "an edgeless blotch of mud-brown, sand and lawn") a field ended wherever
    // its ground passed ~11° — along the contours, so on a rolling map every field was a blob — and around every lone
    // tree (a single crown's 4 m cover read 0.1–0.45). A field is worked up to ~16° and gone by ~25°, and only a closed
    // stand stops it (tallGrass.ts and vegetation.ts read the same slope gate; the trees' own layout is the trees lane's)
    if (landW > 0.003) {
      // (the GPU cut, hold 13: the block was bound by its rounds of reads — a read that waited on another's answer cost a
      // whole fetch latency at this material's occupancy, its ALU next to nothing. Two rounds now: the field-wide reads
      // go out with the bake's own — the rows' bend (past a 1.5 m footprint only the faint 13 m passes and the tramlines'
      // lines are left of the rows, so it stands down and skips its read) and the field's wet and dry — and what the
      // texel decides, the edge zone's three reads and the soil, go out together after it)
      float bendW = 1.0 - smoothstep(1.0, 1.5, gFootM);
      // (the tier, landUseTierOf: Low reads the bake alone, Medium adds the field's wet and dry, High everything)
      // (farmland: the rows' bend is a field's contour over tens of metres — one coarse read of the noise, no detail
      // octave: at its own level of detail the 77 m read wobbled the furrows into wood grain beside the tank)
      float nBend = bendW > 0.001 && uLandTier > 1.5 ? textureLod(uNoise, uvW * 0.0021 + vec2(0.47, 0.13), 4.0).r : 0.5;
      float crop, edgeM, track, jit, hedgeL; vec2 rowDir;
      lu_decode(wp.xz, luA, luB, luK, luT, crop, edgeM, track, rowDir, jit, hedgeL);
      landW *= step(crop, 30.5); // (a zoned land use's texel in no zone — landUse.ts LAND_CROP_NONE: no field there)
      // the region's boundary (landUse.ts BOUNDARIES): 0 a grass margin with tracks, 1 a polder's water ditches on the
      // long lines, 2 a paddy's earth bund, 3 a karst field's dry stone wall
      float bnd = uLandE.z;
      float marginM = uLandB.y * (0.7 + 0.6 * n1h);
      // (wave 14: "a sharp diagonal straight-line seam … a texture-blend bug, not a land-use boundary") a grass margin's
      // field edge wanders ±2–3 m along its boundary and the crop thins raggedly into the margin over 4 m, by a field of no
      // period — the boundary is a strip of rank grass between two worked fields, never a line between two colours. A
      // bund's or a wall's footing keeps its own straight line.
      // (the wander, the headland and the hedge bank reach at most 9 m + 1.3 margins into a field — past that the crop is
      // whole, the headland gone and the hedge far whatever the noise reads, and a bund's or a wall's field never reads
      // them — so the field's interior skips the three reads, exactly; and the wander, the headland's width and the
      // hedge bank's break are a pixel's detail: past a 1–2 m footprint they stand at their means and skip them too)
      bool luEdge = bnd < 1.5 && edgeM < 9.0 + 1.3 * uLandB.y;
      float luNear = 1.0 - smoothstep(1.0, 2.0, gFootM);
      vec3 nEdge = vec3(0.5); // the wander, the headland's width, the hedge bank's break
      if (luEdge && luNear > 0.001 && uLandTier > 1.5) nEdge = mix(vec3(0.5), vec3(nzq(uvW, 0.045, vec2(0.21, 0.83)).y,
        nzq(uvW, 0.031, vec2(0.11, 0.59)).y, nzq(uvW, 0.17, vec2(0.83, 0.37)).x), luNear);
      bool soilCrop = (crop > 3.5 && crop < 4.5) || (crop > 6.5 && crop < 8.5) || (crop > 10.5 && crop < 12.5) || (crop > 16.5 && crop < 17.5);
      // (the soil is read where it is drawn — a soil crop but the flooded paddy's water, a track's ruts (not a polder's
      // ditch), a bund's half metre; a wall's field and a paddy's water never read it, exactly — and its photo's grain
      // is the layer's mean past a 1–2 m footprint, a turned field's own lines carrying it from there)
      // (the plough reads no photo: its tone is its mean and its own lines — farmland, waves 46–47)
      bool soilRead = (soilCrop && (crop < 3.5 || crop > 4.5) && (crop < 7.5 || crop > 8.5))
        || (track > 0.01 && (bnd < 0.5 || bnd > 1.5)) || (bnd > 1.5 && bnd < 2.5 && edgeM < 0.56);
      vec4 soil = uMeanD;
      if (soilRead && luNear > 0.001 && uLandTier > 1.5) soil = mix(uMeanD, groundSamp(uAlbD, uMeanD, uv * 0.210, df, mipB), luNear);
      float edgeW = edgeM + (n1h - 0.5) * 1.6 + (nEdge.x - 0.5) * 4.4;
      // (waves 46–47, frontier's establishing view: "a smudged mosaic … without crisp parcel edges") the crop's 4 m
      // ragged thinning into its margin is a near-field read; past a footprint of a few decimetres it narrows to a
      // pixel or two, so a field ends on its edge seen from the ridge
      // (never wider than the near field's 4 m: the interior's exact skip below holds at every footprint)
      float fadeM = min(4.0, mix(4.0, max(0.6, 1.5 * gFootM), smoothstep(0.12, 0.60, gFootM)));
      // (2026-10-08, wave 287, Saltwind: the red field "a flat decal with hard edges") a karst field's red earth ends
      // raggedly against its margin — ±0.4 m by the breaker and the metre noise, over 0.9 m — where no wall stands over
      // the line (most of a wall's line is hidden under it where one does); a paddy's bund keeps its line
      float inField = bnd > 2.5 ? smoothstep(0.85, 1.75, edgeM + (n1h - 0.5) * 0.45 + (n1 - 0.5) * 0.40)
                    : bnd > 1.5 ? smoothstep(0.50, 0.85, edgeM)
                                : smoothstep(marginM, marginM + fadeM, edgeW);
      // (2026-10-05, Ruinspires' lab: an urban land use's lots are 8–24 m across, and a field's 4 m ragged thinning into
      // its margin left most of a lot the margin's — its hardstanding showed nowhere) a lot ends on its line, as a kerb,
      // a fence or a pour's edge does: its wander a sixth, its fade 0.6 m (every other map's uLandE.w is 0)
      if (uLandE.w > 0.5 && bnd < 1.5) {
        edgeW = mix(edgeM, edgeW, 0.15);
        inField = smoothstep(marginM, marginM + 0.6, edgeW);
      }
      inField *= 1.0 - track;
      // one row direction a field (landUse.ts: its long side's axis turned by its own hash), its lines bent a little
      // over tens of metres — never ruled stripes repeating field to field (wave 14's "regular crosshatch weave")
      float across = dot(wp.xz, vec2(-rowDir.y, rowDir.x)) + (nBend - 0.5) * 8.0 * bendW;
      // (wave 8, saltwind chase: "an unnaturally regular striped banding pattern"; the verdant plough "a low-resolution
      // repeating texture"): every ruled period a field drew — furrows, the tractor's passes, tramlines, swaths, mown
      // stripes — read as synthetic at full strength. They stand down to a breath of themselves, and where they show
      // at all they come and go by a field of no period (a wet pass, a dry one, the light across them)
      // (waves 46–47: "no crop rows") a field's tillage is its mid-range structure: the rows' tone stays a breath of
      // itself at the tank (wave 8's "regular striped banding" near the camera) and rises to a plain read from 30–40 m
      // on, where their periods still span pixels; a field of no period still varies it field to field
      // (wave 69, Verdant's establishing view: "near-circular blotches … round texture-paint strokes rather than the
      // rectilinear … plots") a field's rows show more or less by the field — its own draw — not by a round noise patch
      float jit2 = fract(jit * 7.31 + 0.13), jit3 = fract(jit * 3.17 + 0.71);
      float rowsShow = uLandTier > 0.5 ? mix(0.22, 0.55, smoothstep(0.08, 0.40, gFootM)) * (0.45 + 0.55 * jit3) : 0.0;
      // (wave 8: "flat tinted patches … a painted map") a field is never one tone: its wetter and drier ground, thinner
      // and thicker stands, ±10 % over tens of metres by the same field of no period
      // (wave 69: the same) a field is never one tone, but its wet and dry follow its ground — darker and greener in its
      // hollows, paler on its crowns (the baked fold) — over a shade of its own; no round noise patch crosses it. And the
      // meadow's macro tint (gMeadowTint: its 80–600 m dry-straw, clover and broad patches) is divided back out of the
      // field: inside its margin a field's tone is its crop's and its husbandry's
      float fieldVar = (0.93 + 0.14 * jit2) * (1.0 - 0.07 * clamp(vFold, -1.0, 1.0));
      vec3 aF = a.rgb / max(gMeadowTint, vec3(0.05));
      float baseL = reduxLuma(aF);
      float sw = baseL / 0.075; // the local sward against the calibrated one: a crop's albedo keeps the photo's grain
      float bright = 0.90 + 0.20 * jit;
      // pasture: a grazed field paler and yellower, a shut-up one lusher, by the field
      vec3 cropCol = aF * mix(vec3(0.95, 1.0, 0.97), vec3(1.08, 1.04, 0.86), jit2);
      float rows = 0.0; // the crop's row tone, signed
      // the soil photo's own mottle (pebbles, clods, dry crust) halved toward its mean and a third of its hue taken out:
      // a turned field reads as one dark, even soil with its lines, not a sandy blotch (Amberford) or red clay (Frontier)
      vec3 soilF = mix(soil.rgb, uMeanD.rgb, 0.5) * uSoilTint;
      soilF = mix(soilF, vec3(reduxLuma(soilF)), 0.35);
      // (the karst's terra rossa and its vines' earth carry their own calibrated red over the soil's luminance: their hue
      // is the photo's, untinted, or the place's red soil would redden them twice)
      vec3 soilHue = mix(mix(soil.rgb, uMeanD.rgb, 0.5), vec3(reduxLuma(mix(soil.rgb, uMeanD.rgb, 0.5))), 0.35);
      float water = 0.0; // a flooded paddy's water (mirrors the sky in the roughness stage)
      // (2026-10-05, Ironworks: slag round the furnaces and along the works roads, ballast on the sidings, gravel in the
      // courts) a tipped or spread stone's grain near the camera — the noise read at a 0.32 m tile, its finest octave
      // ~4 cm: the lumps of cinder, the crushed stones, the gravel and their gaps (High, gone by a 4 cm footprint; a
      // works' ground only, uLandE.w 2: every other map's slag and ballast are what they were)
      float stoneVis = uLandTier > 1.5 && uLandE.w > 1.5 && ((crop > 14.5 && crop < 16.5) || (crop > 18.5 && crop < 19.5))
        ? 1.0 - smoothstep(0.02, 0.04, gFootM) : 0.0;
      float stoneN = stoneVis > 0.001 ? nz(uv, 3.1, vec2(0.29, 0.61)).r : 0.5;
      float stoneLump = (smoothstep(0.52, 0.68, stoneN) - (1.0 - smoothstep(0.30, 0.44, stoneN))) * stoneVis;
      if (crop < 0.5) {
        // pasture: half the meadows are hay — mown in stripes up and down the field
        rows = jit > 0.5 ? sin(across * 2.094) * 0.06 * tileVis(3.0) : 0.0;
        // (wave 177 and 2026-10-08's wave 287, Saltwind: "a lush lawn-green carpet", "patchy dry grass and scrub") a
        // karst's grazing is garrigue, never mown: cured yellow-grey grass in tussocks over the thin red-brown soil, which
        // shows between them in patches of decimetres (a fifth of its far mean)
        if (bnd > 2.5) {
          rows = 0.0;
          float bareVis = tileVis(1.5);
          float bareG = uLandTier > 0.5 ? smoothstep(0.52, 0.72, nzq(uvW, 0.29, vec2(0.61, 0.17)).x) : 0.0;
          vec3 redSoil = soilHue / max(reduxLuma(soilHue), 1e-3) * vec3(2.11, 1.24, 1.04) * 0.095 * bright;
          cropCol = mix(vec3(2.30, 2.10, 1.30) * baseL * bright, redSoil, bareG * 0.70 * bareVis + 0.20 * (1.0 - bareVis));
        }
      } else if (crop < 1.5) {
        // albedo calibration (with the light lane): a ripe crop is cured straw, 0.20–0.25 against the sward's ~0.075
        cropCol = vec3(1.375, 0.994, 0.399) * baseL * 2.8 * bright; // ripe wheat
      } else if (crop < 2.5) {
        cropCol = vec3(1.239, 1.043, 0.530) * baseL * 3.0 * bright; // barley
      } else if (crop < 3.5) {
        cropCol = vec3(0.906, 1.416, 0.362) * baseL * 1.25 * bright; // young green crop
      } else if (crop < 4.5) {
        // plough: the black earth, turned in furrows across the field, pressed into bands by the tractor's passes; the
        // plough's lands (3.2 m) and the tractor's passes (13 m) carry the lines to the far field
        // (the round-2 census: at half strength the soil photo's straw and clods still read as a sandy mottle — a
        // turned field's own lines must carry it, so the soil goes four fifths of the way to its mean)
        // (waves 46–47, the establishing foregrounds: "a blurred, brush-stroke smear … less resolvable detail than fields a
        // kilometre away") the photo's last fifth was that smear at a grazing view — a turned field is its mean, and its
        // structure is its own: the furrows' relief and tone, the lands, the passes, the clods (the near micro grain on top)
        // (wave 83: Hesse's plough "a neutral charcoal grey, a black-earth colour wrong for Hesse's brown loess and
        // red-sandstone soils", Verdant's "a cold blue-black surface") a third of the soil's hue greyed out and a cool-
        // neutral darkening left a dull grey that the sky's blue light turned charcoal: the turned soil keeps its hue
        // (an eighth greyed) and darkens warm, as damp earth does — the place's own tone (soilTint) sets the rest
        vec3 ploughSoil = uMeanD.rgb * uSoilTint;
        ploughSoil = mix(ploughSoil, vec3(reduxLuma(ploughSoil)), 0.12);
        cropCol = ploughSoil * vec3(0.62, 0.55, 0.47) * uPloughLift * bright;
        // (waves 46–47, the establishing views: "no crop rows", "less resolvable detail than fields a kilometre away")
        // a turned field seen from a ridge is its lands — the plough's passes turned alternately toward and away from
        // the light, light and dark bands 3–13 m wide — so they carry a plain ±15 % from 20–30 m on; the furrows'
        // tone stays a breath near the tank (wave 8's banding) and the furrows read there as relief instead
        vec2 acrossDir = vec2(-rowDir.y, rowDir.x);
        // (wave 69: "the ploughed field nearest the camera smears") the furrows' tone and relief filtered by the pixel's
        // own box (stripeAA), so they hold their lines to ~3 px a period instead of fading from 10; the lands are crisp
        // bands (bandAA) a little softer than the old sines' peaks, and the tractor's 13 m passes a breath
        // (wave 83: "an identical diagonal tilling stripe at a visibly regular interval") every field is ploughed to its
        // own widths (±14 %) and phase, and across it the lands drift ±9 % in width over ~37 m and wander ±0.4 m along
        // the rows (the tractor's line is never ruled) — no period repeats field to field
        float kP = 0.86 + 0.28 * fract(jit * 5.77 + 0.29);
        // (2026-10-06, the cost trim: the furrows' wander along their run and their depth's stretches — four sines a
        // fragment, wave 86's — are gone again; the rows keep their field-by-field widths and phase)
        // (2026-10-08, waves 285–286a on Amberford and Steinburg: "wavy, meandering black ripples like wind-blown sand
        // rather than straight furrows", "dune corduroy") the phase took ±0.45 m of the material's n1 noise, whose power
        // sits at 0.7–2.7 m — more than half a 0.8 m furrow, so every furrow meandered along its run every metre or two.
        // A plough's line is straight over metres; it bends only with the field (the rows' bend above, tens of metres).
        float acrossP = (across + 0.55 * sin(across * 0.17 + jit * 6.2832)) / kP + jit * 9.7;
        float furrowVis = uLandTier > 0.5 ? stripeAA(0.8 * kP, acrossDir) : 0.0;
        rows = sin(acrossP * 7.854) * 0.16 * furrowVis + sin(acrossP * 3.927 + jit * 2.0) * 0.07 * stripeAA(1.6 * kP, acrossDir)
          + bandAA(acrossP * 1.963 + jit * 3.0, 3.2 * kP, acrossDir) * 0.11
          + sin(acrossP * 0.483 + jit * 6.0) * 0.07 * stripeAA(13.0 * kP, acrossDir);
        rowsShow = max(rowsShow, uLandTier > 0.5 ? 0.80 * smoothstep(0.05, 0.20, gFootM) : 0.0);
        // (wave 46, Verdant's establishing foreground: "a blurred, brush-stroke smear of dark brown soil … if the streaks
        // are intended furrows, keep their direction and give them ridge-and-furrow relief and clods") the sward's own
        // relief (the base layers' blade strokes, smeared at a grazing view) stands down on the turned earth, and the
        // furrows are relief instead: flanks of ±27° that catch the light while a furrow spans 4–10 px across its own
        // direction (a furrow seen along the view keeps its line much farther than one seen across it). The furrow slice
        // leans — a lit face and a steeper shaded one (the profile sin x + 0.35 sin 2x) — and the clods break each ridge
        // along its run (n1h, the high-frequency breaker the material already read); the soil layer's own clod relief
        // (the dirt normal, 0.93 m) lies on it near the tank, further down
        float soilHere = inField * landW;
        float ridge = (cos(acrossP * 7.854) + 0.70 * cos(acrossP * 15.708) * stripeAA(0.4 * kP, acrossDir)) * (0.55 + 0.90 * n1h);
        if (nrmOn) n.xy = mix(n.xy, vec2(0.5), soilHere) + acrossDir * ridge * 0.20 * furrowVis * soilHere;
        // (wave 86, Verdant's establishing view: "a smeared, streaky charcoal texture with no clods or furrow relief") past
        // the furrows' own reach the plough keeps its relief: the lands' low crowns, each 3.2 m land a gentle ridge lit and
        // shaded with the sun (2026-10-06, the cost trim: wave 88's clods — a near read of the noise — are gone again)
        if (nrmOn) n.xy += acrossDir * sin(acrossP * 1.963 + jit * 3.0) * 0.14 * stripeAA(3.2 * kP, acrossDir) * soilHere;
      } else if (crop < 5.5) {
        cropCol = vec3(1.218, 1.010, 0.627) * baseL * 2.8 * bright; // stubble
        // (wave 88: "a pale sandy grey-beige, which is neither Prokhorovka's black chernozem nor Hesse's brown loam")
        // between the cut stalks lies the place's soil — a third of the stubble field's tone
        cropCol = mix(cropCol, soilF * 1.10, 0.35);
        // the combine's swaths, 6 m: a field's own lines from the ridge (waves 46–47, "no … stubble rows")
        rows = sin(across * 1.047 + jit * 6.0) * 0.10 * stripeVis(6.0, vec2(-rowDir.y, rowDir.x));
        rowsShow = max(rowsShow, uLandTier > 0.5 ? 0.70 * smoothstep(0.05, 0.20, gFootM) : 0.0);
      } else if (crop < 6.5) {
        cropCol = vec3(0.942, 1.330, 0.466) * baseL * 0.70 * bright; // sunflower
        rows = sin(across * 8.976) * 0.10 * tileVis(0.7);
      } else if (crop < 7.5) {
        // row crop (potato, beet, vegetables): ridges 0.75 m apart, dark foliage on the crowns, soil in the furrows —
        // their mean (two parts leaf to one of soil) past the footprint that can hold a row
        vec3 leaf = vec3(0.667, 1.400, 0.400) * baseL * bright;
        float ridge = smoothstep(-0.35, 0.35, sin(across * 8.378));
        cropCol = mix(mix(soilF * 0.72, leaf, ridge), mix(soilF * 0.72, leaf, 0.67), 1.0 - tileVis(0.75));
        rows = sin(across * 0.483 + jit * 6.0) * 0.05 * tileVis(13.0);
      } else if (crop < 8.5) {
        // a flooded paddy: muddy water over the soil, the young rice a faint green haze in it (the roughness stage
        // makes it a mirror of the sky)
        cropCol = mix(vec3(0.040, 0.046, 0.040), vec3(0.060, 0.095, 0.035), 0.25 + 0.20 * jit);
        water = 1.0;
      } else if (crop < 9.5) {
        cropCol = vec3(1.333, 3.067, 0.600) * baseL * bright; // growing rice: one even, bright green
        rows = sin(across * 20.94) * 0.05 * tileVis(0.3);
      } else if (crop < 10.5) {
        cropCol = vec3(3.467, 2.933, 1.133) * baseL * bright; // ripe rice: gold-green
      } else if (crop < 11.5) {
        // terra rossa: the karst's red earth, turned (its grain the soil layer's)
        // (the round-2 chase frame: at 0.19/0.09/0.07 it read as a flat orange floor — the real soil is a duller brick)
        // (wave 8, saltwind establishing: "implausible salmon and rust tones … flat tinted patches") a karst field is
        // stony red earth: a little less red, and strewn with the limestone the plough brings up (grey, 0.3–1 m
        // stones in drifts, a field of no period, faded as they near the pixel)
        // (wave 83, Saltwind's plots: "pastel pink, mauve and beige rather than rust-red terra rossa among grey-white
        // limestone"; the coordinator: the calibrated red "reads too light and desaturated from above") the red earth
        // deeper and redder (~0.22 / 0.064 / 0.032 over the sand's hue, luminance ~0.095), its stones' grey a smaller
        // share of its far mean
        // (2026-10-08, waves 286b–287 on Saltwind: "a flat, saturated red or vermilion decal", "one flat, saturated
        // orange-red in every frame"; it rendered ~104 / 49 / 29 sRGB, saturation 0.72 — red 3.4× its green in albedo)
        // Dalmatian terra rossa is a deeper rust or brick red-brown, dulled by dust and broken by limestone: the base a
        // dusty brick (~0.265 / 0.128 / 0.074 over the sand's hue: red 2.1× its green, green 1.7× its blue — never the
        // bluer mauve of wave 83, 1.6 / 1.33), its dry crust paler and a third greyer on the crowns of the noise and the
        // damp ground a shade darker (decimetres to metres), and the plough's limestone over about a third of the field
        // near the camera — pale cream-grey clasts in drifts — and a fifth of its far mean. No new reads: the crust is
        // the breaker's and n2's, the clasts the two noise reads the stones always took.
        cropCol = soilHue / max(reduxLuma(soilHue), 1e-3) * vec3(2.11, 1.24, 1.04) * 0.105 * bright;
        float crust = smoothstep(0.42, 0.78, n1h);
        cropCol = mix(cropCol * (0.88 + 0.10 * n2), mix(cropCol, vec3(reduxLuma(cropCol)), 0.32) * 1.14, crust);
        vec3 clast = vec3(0.215, 0.205, 0.182) * bright;
        float karstStone = 0.0;
        if (uLandTier > 0.5) {
          vec2 sq = nzq(uvW, 0.61, vec2(0.37, 0.71));
          float drift = smoothstep(0.20, 0.60, nzq(uvW, 0.043, vec2(0.13, 0.29)).y);
          karstStone = max(smoothstep(0.50, 0.66, sq.x) * (0.40 + 0.60 * drift), smoothstep(0.64, 0.74, sq.y) * 0.65);
        }
        float clastVis = tileVis(0.8);
        cropCol = mix(cropCol, clast, karstStone * 0.85 * clastVis);
        cropCol = mix(cropCol, clast, 0.18 * (1.0 - clastVis)); // the clasts' share of the far mean
        float kR = 0.86 + 0.28 * fract(jit * 5.77 + 0.29);
        // (2026-10-08: the plough's law — the furrows straight along their run, no metre-scale meander from n1)
        float acrossR = (across + 0.55 * sin(across * 0.17 + jit * 6.2832)) / kR + jit * 9.7;
        rows = sin(acrossR * 7.854) * 0.10 * tileVis(0.8 * kR) + sin(acrossR * 0.483 + jit * 6.0) * 0.06 * tileVis(13.0 * kR);
        // the turned red earth's relief is its furrows, not the sward's blade strokes (as the plough's, a little softer)
        // (a breath of relief, broken along its run: wave 8's "unnaturally regular striped banding" was this field's)
        if (nrmOn) n.xy = mix(n.xy, vec2(0.5), 0.80 * inField * landW) + vec2(-rowDir.y, rowDir.x) * cos(acrossR * 7.854) * 0.08
          * (0.55 + 0.90 * n1h) * (uLandTier > 0.5 ? stripeVis(0.8 * kR, vec2(-rowDir.y, rowDir.x)) : 0.0) * inField * landW;
      } else if (crop < 12.5) {
        // a vineyard: rows 2.2 m apart, the vines' dark canopy 0.9 m wide over the earth between them (red on the
        // karst, the soil layer elsewhere)
        // (the saltwind sky-w pair, wave 5 and hold 3: "a red-and-green striped crop texture" — a lawn-green canopy band
        // over bare red earth, half and half: a vine's canopy is a dusty olive, about 0.7 m of a 2.2 m row, the
        // inter-row carries its weeds and dust, and the canopy shades a strip of it)
        // (2026-10-08: the karst's red earth the terra rossa's dusty brick, as above)
        vec3 earth = bnd > 2.5 ? soilHue / max(reduxLuma(soilHue), 1e-3) * vec3(2.11, 1.24, 1.04) * 0.105 : soilF * 0.85;
        earth = mix(earth, aF * vec3(1.10, 1.02, 0.80), 0.30);
        vec3 vine = vec3(0.860, 1.300, 0.560) * baseL * bright;
        float vf = fract(across / 2.2 + jit);
        float vrow = 1.0 - smoothstep(0.24, 0.32, abs(vf - 0.5));
        float vshade = (1.0 - smoothstep(0.32, 0.42, abs(vf - 0.5))) * (1.0 - vrow) * step(0.5, vf);
        // (wave 8: soft to near-invisible — the canopy's average with a trace of its rows near the camera)
        cropCol = mix(mix(earth, vine, 0.36), mix(earth * (1.0 - 0.30 * vshade), vine, vrow), 0.30 * tileVis(2.2));
      } else if (crop < 13.5) {
        // hay: a mown meadow, paler and yellower than the standing sward, its windrows every 6 m a greener line
        cropCol = aF * vec3(1.30, 1.12, 0.80);
        float wr = 1.0 - smoothstep(0.35, 0.65, abs(mod(across + jit * 11.0, 6.0) - 3.0));
        rows = -wr * 0.14 * tileVis(6.0) + sin(across * 2.094) * 0.04 * tileVis(3.0);
      } else if (crop < 14.5) {
        cropCol = vec3(0.600, 1.600, 0.427) * baseL * bright; // jute: tall, dark green
      } else if (crop < 15.5) {
        // slag tipped from the furnaces: black-grey, granular, a little blue in the fresh and rust in the weathered
        cropCol = mix(vec3(0.068, 0.068, 0.072), vec3(0.090, 0.072, 0.060), smoothstep(0.40, 0.75, n1h)) * (0.85 + 0.30 * jit);
        // its clinker near the camera: lumps a third paler where the glass catches, the gaps black
        cropCol *= 1.0 + stoneLump * 0.34;
        if (nrmOn) n.xy += vec2(stoneN - 0.5, 0.5 - stoneN) * 0.40 * stoneVis * inField * landW;
      } else if (crop < 16.5) {
        cropCol = vec3(0.16, 0.155, 0.15) * (0.88 + 0.24 * n1h) * bright; // ballast and hardcore: grey crushed stone
        cropCol *= 1.0 + stoneLump * 0.26; // its stones near the camera, their gaps shaded
        if (nrmOn) n.xy += vec2(stoneN - 0.5, 0.5 - stoneN) * 0.45 * stoneVis * inField * landW;
      } else if (crop > 18.5 && crop < 19.5) {
        // (2026-10-05, Ironworks) a court's gravel: river gravel and its fines, a warm grey, a shade paler on its dry
        // crowns; the lorries' wheels pressed into it in pairs of darker, smoother lanes along the court's run, each
        // pair its own by the court's draw, every 5–8 m (Medium and High); its stones near the camera
        vec3 grav = vec3(0.150, 0.140, 0.122) * (0.90 + 0.20 * n1h) * bright;
        if (uLandTier > 0.5) {
          float pitch = 5.0 + 3.0 * fract(jit * 5.31 + 0.17);
          float lw = abs(fract(across / pitch + jit * 1.7) - 0.5) * pitch;
          float lq = (lw - 0.85) / 0.22;
          float lanes = exp(-lq * lq) * smoothstep(0.12, 0.45, 0.45 / max(gFootM, 1e-3));
          grav *= 1.0 - 0.18 * lanes;
          stoneLump *= 1.0 - 0.7 * lanes; // the wheels' lanes pressed smooth
        }
        cropCol = grav * (1.0 + stoneLump * 0.30);
        if (nrmOn) n.xy = mix(n.xy, vec2(0.5), inField * landW * 0.6) + vec2(stoneN - 0.5, 0.5 - stoneN) * 0.35 * stoneVis * inField * landW;
      } else if (crop > 17.5) {
        // (2026-10-05, Ruinspires) hardstanding: the city's patched asphalt and concrete pours between the street rows —
        // a field one pour (asphalt, or concrete in 4 m slabs, by its draw), repaired in rectangles along its rows (newer
        // darker, older paler and greyer, their seams sealed), the old surface cracked with weeds in the cracks near the
        // camera, oil stains and the town's dust (the tier gate: Low draws the pour, its slabs and repairs — no read;
        // Medium adds its grain and stains, High its cracks)
        vec2 hq = vec2(dot(wp.xz, rowDir), dot(wp.xz, vec2(-rowDir.y, rowDir.x)));
        bool concretePour = fract(jit * 7.31 + 0.13) > 0.64;
        vec3 hard = concretePour ? vec3(0.150, 0.147, 0.140) : vec3(0.084, 0.084, 0.087);
        float hGrain = uLandTier > 0.5 ? nz(uv, 1.9, vec2(0.31, 0.57)).r : 0.5;
        hard *= 0.92 + 0.16 * hGrain;
        if (concretePour) {
          vec2 sl = fract(hq / 4.0);
          vec2 sd = min(sl, 1.0 - sl) * 4.0;
          hard *= 1.0 - 0.45 * (1.0 - smoothstep(0.02, 0.05 + gFootM, min(sd.x, sd.y))) * tileVis(4.0);
          hard *= 0.92 + 0.16 * cellHash2(floor(hq / 4.0) + vec2(jit * 97.0, 3.0)).x;
        }
        vec2 hp = hq / vec2(5.2, 3.1), hpI = floor(hp), hpF = fract(hp);
        vec2 hh = cellHash2(hpI + vec2(91.0 + jit * 53.0, 13.0));
        float repair = step(hh.x, 0.30);
        vec2 he = min(hpF, 1.0 - hpF) * vec2(5.2, 3.1);
        float seamH = (1.0 - smoothstep(0.03, 0.06 + gFootM, min(he.x, he.y))) * repair * tileVis(0.6);
        hard = mix(hard, hh.y > 0.5 ? hard * 0.78 : mix(hard, vec3(0.13, 0.128, 0.122), 0.5), repair);
        hard *= 1.0 - 0.45 * seamH;
        float crackH = uLandTier > 1.5 ? (1.0 - smoothstep(0.0, 0.02 + gFootM, abs(nz(uv, 0.9, vec2(0.71, 0.29)).r - 0.5) * 0.12))
          * (1.0 - repair) * tileVis(0.5) : 0.0;
        hard = mix(hard * (1.0 - 0.45 * crackH), vec3(0.060, 0.070, 0.036), crackH * 0.35 * (1.0 - smoothstep(0.03, 0.08, gFootM)));
        float hStain = uLandTier > 0.5 ? smoothstep(0.62, 0.82, nzq(uv, 0.17, vec2(0.37, 0.83)).x) : 0.0;
        hard *= 1.0 - 0.22 * hStain;
        cropCol = hard;
        if (nrmOn) n.xy = mix(n.xy, vec2(0.5), inField * landW * 0.85);
      } else {
        // brownfield grass: a patchy, cured sward with bare ground between its clumps
        float bare = uLandTier > 0.5 ? smoothstep(0.52, 0.72, nzq(uvW, 0.11, vec2(0.71, 0.23)).x) : 0.0;
        cropCol = mix(aF * vec3(1.35, 1.15, 0.72), soilF * 0.95, bare);
      }
      if (crop > 0.5 && crop < 3.5 && uLandTier > 0.5 && gFootM < 0.04) {
        // (wave 83, Verdant's tree view: "sparse, headless straw blades over bare pale sand") a standing crop seen between
        // the grass tier's blades is more crop, not bare ground: its canopy of ears and their shade, a 5–6 cm mottle of
        // the noise read at its own level of detail (it averages to the field's calibrated tone with range, and is gone
        // by a 4 cm footprint) — the gaps dark and their colour deeper, the ears paler
        vec2 uE = vec2(0.8090 * uv.x - 0.5878 * uv.y, 0.5878 * uv.x + 0.8090 * uv.y);
        float ear = nz(uv, 1.7, vec2(0.31, 0.77)).r * 0.55 + nz(uE, 1.13, vec2(0.62, 0.18)).g * 0.45;
        float ec = clamp((ear - 0.5) * 2.4, -1.0, 1.0) * (1.0 - smoothstep(0.015, 0.04, gFootM));
        cropCol *= 1.0 + ec * vec3(0.50, 0.53, 0.62);
      }
      if (crop > 0.5 && crop < 3.5 && uLandTier > 0.5) {
        // tramlines: the sprayer's wheel tracks, a pair every 18–24 m, a darker crushed line each (a line 0.5 m wide
        // fades as the footprint outgrows it)
        float period = 18.0 + floor(jit * 4.0) * 2.0;
        float dT = abs(mod(across + jit * 37.0, period) - period * 0.5);
        float tq = (dT - 0.9) / 0.25;
        float tram = exp(-tq * tq) * smoothstep(0.12, 0.45, 0.5 / max(gFootM, 1e-3));
        rows -= tram * 0.22;
      }
      // (Ironworks: a works' ballast and gravel under its soot — a third darker)
      if (uLandE.w > 1.5 && ((crop > 15.5 && crop < 16.5) || (crop > 18.5 && crop < 19.5))) cropCol *= 0.66;
      cropCol *= (1.0 + rows * rowsShow) * fieldVar;
      a.rgb = mix(a.rgb, cropCol, inField * landW);
      // (an urban land use: the town's wear lies over its parcels — trodden, dusty, dug — at four tenths of the wear the
      // village draws on its bare ground)
      if (uLandE.w > 0.5) a.rgb = mix(a.rgb, uMeanD.rgb * vec3(1.02, 0.98, 0.92),
        clamp(mk.a * uTownWear * (0.35 + 0.65 * n1), 0.0, 1.0) * 0.40 * inField * landW);
      // (wave 21, the Verdant boundary at tank eye: "a dead-straight, unblended seam between the green grass field and the
      // golden wheat field") a worked field's edge is a feature: inside its grass margin lies the headland, 3–5.5 m where
      // the drill turned — the crop pressed flat and thinner with the soil showing in it, and the turning wheels' two arcs
      // along the edge (the tall-grass tier flattens and weeds the same strip; the margin itself grows rank and tall)
      if (bnd < 0.5 && crop > 0.5 && water < 0.5 && luEdge && uLandTier > 0.5) {
        float headW = 3.0 + 2.5 * nEdge.y;
        float into = edgeW - marginM;
        float headL = inField * (1.0 - smoothstep(headW - 1.2, headW, into)) * (1.0 - track);
        vec3 soilM = mix(uMeanD.rgb * uSoilTint, vec3(reduxLuma(uMeanD.rgb * uSoilTint)), 0.35);
        vec3 worn = mix(cropCol, soilM, 0.25 + 0.20 * n1h) * vec3(1.05, 1.02, 0.96);
        float hq1 = (into - 1.1) / 0.32, hq2 = (into - 2.9) / 0.32;
        float arcs = (exp(-hq1 * hq1) + exp(-hq2 * hq2)) * smoothstep(0.12, 0.45, 0.5 / max(gFootM, 1e-3));
        a.rgb = mix(a.rgb, worn * (1.0 - 0.22 * arcs), headL * landW * 0.80);
      }
      // (the verdant establishing pair, hold 3: a turned field read as gravel or crumpled paper — the meadow's blade,
      // tussock and coarse-turf relief and their photo tone ran on under the soil; a sown field carries its own rows)
      gCropW = (crop > 0.5 && (crop < 12.5 || crop > 13.5)) ? inField * landW : 0.0;
      // (wave 274, Verdant's slope: a young crop's "bald, flat olive ground" between its tufts) a young green crop is a
      // short leafy sward: its ground keeps the sward's own blade, tussock and turf relief (a pasture's and a hay meadow's
      // do); its meadow patches, worn lips and sheet stay down with every sown field's (gCropW)
      gCropReliefW = (crop > 2.5 && crop < 3.5) ? 0.0 : gCropW;
      gSoilW = ((crop > 3.5 && crop < 4.5) || (crop > 10.5 && crop < 12.5) || (crop > 14.5 && crop < 16.5) || (crop > 18.5 && crop < 19.5))
        ? inField * landW : 0.0;
      gFieldWater = water * inField * landW;
      if (water > 0.5 && nrmOn) n = mix(n, NRM_MEAN, gFieldWater);
      if (uLandTier < 0.5) {
        // (Low draws no boundary feature: the field's crop meets the sward of its margin and nothing else)
      } else if (bnd < 1.5) {
        // the margin: an uncultivated strip of rank grass, a shade darker and greener than the fields either side, lumpy
        // with its tussocks; a hedged boundary carries its hedge bank — the shrubs' dark base and their shade, broken
        // along its run, under the hedge's own trees and bushes (the vegetation tier seats them on the same line)
        // (waves 46–47: "without crisp parcel edges … hedgerows or farm lanes") the margin's rank grass is the boundary's
        // line from the ridge: a shade darker and greener than either field, so the strip reads at range
        // (2026-10-05, Ironworks — a works' ground, uLandE.w 2: no grass between its lots) a works' margin is its trodden
        // dirt, the soil half greyed and darkened, a little lumpy
        vec3 marginCol = uLandE.w > 1.5 ? mix(soilF, vec3(reduxLuma(soilF)), 0.5) * (0.62 + 0.20 * n1h)
                                         : a.rgb * vec3(0.80, 0.93, 0.74) * (0.86 + 0.28 * n1h);
        a.rgb = mix(a.rgb, marginCol, (1.0 - inField) * (1.0 - track) * landW * (uLandE.w > 1.5 ? 0.90 : 0.80));
        if (hedgeL > 0.01) {
          float hb = hedgeL * (0.55 + 0.45 * smoothstep(0.30, 0.70, nEdge.z));
          a.rgb = mix(a.rgb, a.rgb * vec3(0.52, 0.60, 0.46), hb * (1.0 - track) * landW * 0.85);
        }
      } else if (bnd < 2.5) {
        // a paddy's bund: a raised earth line half a metre wide, grassed on its top, between the water and the rice
        float bund = (1.0 - smoothstep(0.30, 0.55, edgeM)) * (1.0 - track);
        a.rgb = mix(a.rgb, mix(soilF * 0.95, a.rgb * vec3(0.95, 1.0, 0.85), 0.40 + 0.25 * n1h), bund * landW);
      } else {
        // a dry stone wall's footing: limestone rubble 0.8 m wide, broken into its stones and gaps and grown over in
        // places, its foot shaded on the field side (the round-2 chase frame: a pale unbroken strip read as a painted
        // path — the walls themselves are the scenery lane's to raise on this grid)
        // (wave 8: "separated by uniform pale-gray lines") a shade darker, more broken, grown over in more places
        // (2026-10-08, wave 287, Saltwind's close view: "a grey seam strip along its front edge") the scenery lane's walls
        // keep off the boulders, their aprons, the roads and the objective discs (fieldWorks.ts), so on many lines no wall
        // stands over this footing, and its unbroken band (a quarter strength at its weakest) read as a seam. It is the
        // clearance stones a karst field's edge carries with or without its wall: rubble in clumps with gaps between
        // them (about half the line bare, over decimetres and metres), the field's clasts' cream-grey, and the foot's
        // shade only where the stones lie
        float rubble = smoothstep(0.46, 0.66, n1h) * (0.45 + 0.55 * smoothstep(0.30, 0.70, n1));
        float wall = (1.0 - smoothstep(0.30, 0.55, edgeM + (n1h - 0.5) * 0.25)) * (1.0 - track) * rubble;
        vec3 stone = vec3(0.215, 0.205, 0.182) * (0.72 + 0.36 * fract(n1h * 7.3)) * (1.0 - 0.30 * smoothstep(0.55, 0.80, n1));
        a.rgb = mix(a.rgb, stone, wall * landW * 0.85);
        a.rgb *= 1.0 - 0.18 * (smoothstep(0.55, 0.75, edgeM) * (1.0 - smoothstep(0.85, 1.35, edgeM))) * rubble * landW;
      }
      if (track > 0.01 && uLandTier > 0.5) {
        if (bnd > 0.5 && bnd < 1.5) {
          // a polder's ditch along the long boundary: a metre and a half of still water between wet, rank banks
          float ditch = 1.0 - smoothstep(0.55, 0.85, edgeM);
          float bank = (1.0 - smoothstep(0.85, 1.9, edgeM)) * (1.0 - ditch);
          a.rgb = mix(a.rgb, a.rgb * vec3(0.72, 0.82, 0.70), bank * track * landW);
          a.rgb = mix(a.rgb, vec3(0.030, 0.036, 0.032), ditch * track * landW);
          gFieldWater = max(gFieldWater, ditch * track * landW);
        } else {
          // a track along the boundary line: trodden soil, two wheel ruts 1.7 m apart astride the line, grass on the crown
          // (wave 71, Frontier's close-up: the track "a ring of dirt … like a decal mask" — "its edge is too clean and too
          // red") a field track is two worn ruts in the grass, not a band of soil: grass stands on the crown between them
          // and mostly on their outer verges, the band's edge comes and goes along it (the edge-zone noise and the fine
          // breaker), and the trodden soil is the soil's own tone half greyed — a farm track's dust, not the clay's red
          // (wave 83: the lanes still "two thin, uniform grey-purple stripes painted flat onto pale sandy ground, with no
          // sunken tyre lanes, raised crown, berms or soil-matched mud"; Verdant: "crisp, uniform dark-grey stripes
          // straight into the distance like painted rails") a wheel lane is a groove: its floor 8 cm down between walls
          // of ~45°, a low berm of thrown-up soil along its outer lip. The walls' relief follows the cross-section, so
          // under the map's sun one wall is lit and the other shaded; the floor carries the sun-side lip's shadow (its
          // length the lip's height over the sun's elevation, across the lane) and the walls' occlusion; its soil is the
          // place's own, darker and damper toward the bottom — no tint of its own. Each lane wanders about its line and
          // swells and narrows along the track (landUse.ts trackLaneCentre / trackLaneHalfWidth: the grass tiers keep the
          // same lanes bare), and the track's wear comes and goes along it over tens of metres.
          float uT = dot(wp.xz, uLandRot);
          float sV = lu_sV(wp.xz, luB, luK, luT) - lu_laneM(uT); // across the lanes' meandering mid-line
          float side = sV < 0.0 ? -1.0 : 1.0;
          vec2 vW = vec2(-uLandRot.y, uLandRot.x) * side; // across the lane, away from the lanes' mid-line
          // (its edge ragged by the decimetre near the camera: the edge-zone noise swells and pinches it ±20 %)
          float lw = lu_laneW(uT, side) * (1.0 + (nEdge.z - 0.5) * 0.40);
          float qx = (abs(sV) - lu_laneC(uT, side)) / lw; // across the lane in its half-widths, + outward
          float aq = abs(qx);
          float crownG = 1.0 - smoothstep(0.30, 0.62, abs(sV));
          float bandT = track * smoothstep(0.0, 0.45, track + (nEdge.z - 0.5) * 0.9 + (n1h - 0.5) * 0.5);
          float use = 0.60 + 0.40 * smoothstep(0.25, 0.65, n1);
          // (wave 86: "constant-width strips edged by identical black lines on both sides over a flat grey-brown floor") a
          // lane's edge is broken by the stretch — its walls crumbled in places, its lip there and gone — by two
          // incommensurate waves along it
          float brk = 0.45 + 0.55 * smoothstep(-0.25, 0.55, sin(uT * 1.73 + side * 2.9) * sin(uT * 0.47 + side * 0.8 + 1.0));
          // the pixel's footprint across the lane (in half-widths): the lane, its floor and its wet bottom are box-filtered
          // over it (exact coverage of each interval), the walls' relief and the shadow's edge hold while a wall spans ~2 px
          float fq = max((abs(dot(gDwX, vW)) + abs(dot(gDwY, vW))) / lw, 0.25);
          float laneM = (clamp(qx + 0.5 * fq, -1.0, 1.0) - clamp(qx - 0.5 * fq, -1.0, 1.0)) / fq;
          // (the floor's share of the lane inside the pixel: at range the lane's colour is its floor and walls averaged)
          float floorM = (clamp(qx + 0.5 * fq, -0.6, 0.6) - clamp(qx - 0.5 * fq, -0.6, 0.6)) / fq / max(laneM, 1e-3);
          float wallVis = 1.0 - smoothstep(0.30, 0.65, fq);
          vec3 soilL = soil.rgb * uSoilTint;
          // (wave 88: "pinkish-brown") the trodden soil half greyed, a breath of warmth left — the local soil, darker
          vec3 trodden = mix(soilL, vec3(reduxLuma(soilL)), 0.50) * vec3(1.02, 0.98, 0.92);
          // the floor: the same soil pressed, a shade darker, and damp in its wet stretches — never ink (wave 86)
          vec3 damp = mix(trodden * 0.80, mix(pow(max(soilL, vec3(1e-4)), vec3(1.25)) * 1.35, trodden * 0.70, 0.5), 0.6);
          // (wet and dry stretches of the floor along the lane, a few metres each: the breaker's two fields)
          float wetF = 0.55 + 0.45 * smoothstep(0.30, 0.70, n1h);
          // the light (wave 86: "no inner-wall shading"): only the wall turned from the sun goes dark, by how far it is
          // turned — a wall faces the lane's middle, −vW on the outer side, +vW on the inner — and the sun-side lip's shadow
          // lies on the floor beside it ((8 cm + the 2 cm berm) over the sun's elevation, across the lane); the other wall
          // catches the sun. A sun at the horizon or below shades no wall.
          float sA = dot(uSunDirW.xz, vW);
          float sunW = smoothstep(0.02, 0.15, uSunDirW.y);
          // (2026-10-08, waves 285–286a: "two hard black lines run edge to edge", "the wheel ruts are two hard black crack
          // lines rather than soft muddy tracks") the wall turned from the sun was darkened twice — by its relief normal
          // (below: a ~19° tilt off the sun) and by 0.45 of its colour here — over a band of 0.2 half-widths, so it drew an
          // ink line one or two pixels wide. The relief now carries the wall's own shade over a wider wall (0.40–1.05 of
          // a half-width), its colour a quarter darker at most, and the floor's shadow has a soft penumbra.
          float wallT = smoothstep(0.35, 0.70, aq) * (1.0 - smoothstep(0.90, 1.15, aq));
          float faceSun = -sign(qx) * sA;
          float wallDark = wallT * smoothstep(0.0, 0.5, -faceSun) * 0.22;
          float wallLit = wallT * smoothstep(0.0, 0.5, faceSun) * 0.08;
          float sLq = 0.10 * abs(sA) / max(uSunDirW.y, 0.08) / lw;
          float sh = (sA > 0.0 ? smoothstep(1.0 - sLq - 0.40, 1.0 - sLq + 0.25, qx) : 1.0 - smoothstep(-1.0 + sLq - 0.25, -1.0 + sLq + 0.40, qx))
            * (1.0 - smoothstep(0.85, 1.10, aq));
          float shade = mix(min(0.22 * sLq, 0.26), max(sh * 0.28, wallDark), wallVis) * brk * sunW; // unresolved: its mean
          vec3 laneCol = mix(trodden * 0.86, damp, floorM * wetF) * (1.0 - shade) * (1.0 + wallLit * wallVis * brk * sunW);
          float laneW = bandT * landW * laneM * use;
          // the band: the trodden soil on the lanes' verges (the crown between them keeps its grass), then the lanes;
          // the berm, a faint paler lip of thrown-up soil along a lane's outer edge where the lip stands
          float berm = qx > 0.0 ? smoothstep(0.95, 1.15, qx) * (1.0 - smoothstep(1.35, 1.75, qx)) * wallVis * (brk - 0.45) / 0.55 : 0.0;
          a.rgb = mix(a.rgb, trodden * (1.0 + 0.05 * berm), bandT * landW * clamp(0.22 * (1.0 - crownG) + 0.30 * berm * use, 0.0, 1.0));
          a.rgb = mix(a.rgb, laneCol, laneW);
          a.a = mix(a.a, a.a * mix(0.86, 0.70, floorM), laneW);
          gLaneSheen = laneW * floorM; // (wave 86: "no compacted sheen") the pressed floor's faint satin, in the roughness stage
          if (nrmOn && bandT * landW > 0.01 && wallVis > 0.001) {
            // the cross-section's slope along vW (m per m): the walls rise 8 cm over 0.65 of a half-width (2026-10-08: was
            // half a half-width — a steeper, narrower wall that drew as a line), the berm 2 cm — a breath of it in the
            // relief (the walls' light is the sun's own, above), broken with the walls
            float tw = clamp((aq - 0.40) / 0.65, 0.0, 1.0);
            float tb1 = clamp((qx - 0.95) * 5.0, 0.0, 1.0), tb2 = clamp((qx - 1.35) * 2.5, 0.0, 1.0);
            float hx = (sign(qx) * 0.08 * 9.23 * tw * (1.0 - tw) + 0.02 * (30.0 * tb1 * (1.0 - tb1) - 15.0 * tb2 * (1.0 - tb2))) / lw;
            n.xy = mix(n.xy, vec2(0.5), 0.6 * laneW) - vW * (0.32 * hx * wallVis * bandT * landW * use * brk);
          }
        }
      }
    }
  }
  // Ground lane (2026-10-03, round 77's open item "no floor darkening under the canopy"): the forest floor — leaf
  // litter over the soil, browner and a shade darker than the turf, broken by moss and by the sward that holds on in
  // the light gaps (a ~12 m field with no world period); on a snow map the snow lies thin under the conifers and the
  // needles and the soil show in the wells. Rock and the roads keep their own.
  if (woods > 0.02) {
    float gap = nzq(uvW, 0.021, vec2(0.13, 0.59)).x;
    float floorW = woods * (1.0 - 0.8 * fR) * (1.0 - roadCore);
    vec3 soilF = groundSamp(uAlbD, uMeanD, uv * 0.210, df, mipB).rgb;
    if (uReduxD.y > 1.5) {
      a.rgb = mix(a.rgb, soilF * vec3(0.80, 0.70, 0.62), floorW * smoothstep(0.55, 0.95, woods) * smoothstep(0.35, 0.75, gap) * 0.55);
    } else {
      vec3 litter = soilF * vec3(1.06, 0.86, 0.64) * (0.92 + 0.16 * n1h);
      vec3 floorCol = mix(litter, a.rgb * vec3(0.78, 0.96, 0.66), smoothstep(0.55, 0.80, gap) * 0.7);
      a.rgb = mix(a.rgb, floorCol, floorW * (uReduxD.y < 0.5 ? 0.85 : 0.5));
    }
  }
  // Terrain v2 (2026-10-01, grounded realism): the cover's own patchwork at 2–8 m. A meadow is never one green — paler
  // yellow-green swards, darker blue-green clumps, dead patches; a desert floor has its lag and its blown sand; a
  // snowfield its crust and its powder — at a scale below the macro fields and above the tile, where the tile's repeat
  // would otherwise be the only pattern. One non-repeating field (the 4- and 9-cell noise at a 17.5 m tile), inside the
  // gameplay band, by the climate's own hues and the map's strength (uReduxD.w).
  {
    // (ground lane, wave 46: the fields' "green, tan and dark-brown blotches") the sward's own 2–8 m patchwork is the
    // meadow's; a sown or turned field keeps its own tone (its wet and dry are the land use's fieldVar)
    float patchW = uReduxD.w * meadowG * (1.0 - smoothstep(70.0, 240.0, camDist)) * (1.0 - 0.85 * max(gCropW, gSoilW));
    if (patchW > 0.003) {
      vec2 hp = nzq(uvW, 0.057, vec2(0.31, 0.47)) - 0.5; // ground lane: no 17.5 m repeat (nzq)
      vec3 warmP = uReduxD.y < 0.5 ? vec3(1.07, 1.045, 0.84) : uReduxD.y < 1.5 ? vec3(1.035, 1.015, 0.97) : vec3(1.0, 1.0, 1.0);
      vec3 coolP = uReduxD.y < 0.5 ? vec3(0.88, 0.97, 0.93) : uReduxD.y < 1.5 ? vec3(0.96, 0.96, 0.975) : vec3(0.975, 0.985, 1.0);
      a.rgb *= mix(vec3(1.0), hp.x > 0.0 ? warmP : coolP, min(abs(hp.x) * 2.4, 1.0) * 0.55 * patchW);
      a.rgb *= 1.0 + hp.y * 0.12 * patchW;
    }
  }
  // Round 73b (2026-09-26): the borders themselves. Round 73 broke the transition's LINE (a height-and-noise mix) but
  // left both sides their own tone, so at 40–120 m — where the normals have mipped flat — a dirt patch met its turf
  // with nothing to see. A worn patch's edge is where the sod is torn and the soil lies open, darker and damper than
  // the patch's dusty middle; an outcrop's edge carries a rim of lichen or moss (by climate) where its high faces
  // stand out of the turf; a road's shoulder is trodden and gravelled. All three are albedo (they survive the mip
  // fade), all three vanish at full and zero coverage (a road stays a road, a field a field) and off the walls.
  {
    float lipG = uReduxB.x * (1.0 - projW) * (1.0 - farM * 0.7) * (1.0 - roadCore) * (1.0 - fMs)
      * (1.0 - max(gCropW, gSoilW)); // ground lane (farmland): a sown or turned field carries no worn patch's lip
    if (lipG > 0.002) {
      float lip = 4.0 * fD * (1.0 - fD) * (0.40 + 0.60 * n1h) * lipG;
      a.rgb *= 1.0 - 0.15 * lip;
      a.rgb = mix(a.rgb, a.rgb * vec3(0.93, 0.90, 0.85), lip * 0.5);
    }
    float rimG = uReduxB.z * (1.0 - fMs) * (1.0 - farM * 0.5) * (1.0 - roadCore);
    if (rimG > 0.002) {
      float rim = 4.0 * fR * (1.0 - fR) * smoothstep(0.25, 0.70, n1h * 0.55 + n2 * 0.45) * rimG;
      a.rgb = mix(a.rgb, a.rgb * uReduxC.rgb, rim * 0.85);
    }
    float vergeW = uReduxB.y * shoulder * fD * (1.0 - roadCore) * (1.0 - projW) * (1.0 - fMs)
      * (1.0 - smoothstep(90.0, 160.0, camDist)) * (1.0 - gRoadTex * 0.5);
    vergeW *= tileVis(1.2); // ground lane
    if (vergeW > 0.003) {
      // the road's own grit (the carriageway's clamped zero-mean rock grain) and a dusty, paler tone on the trodden verge
      float vgL = dot(texture2D(uAlbR, uv * 0.83).rgb, vec3(0.34, 0.45, 0.21));
      float vgM = dot(uMeanR.rgb, vec3(0.34, 0.45, 0.21)); // terrain v2: the rock tile's measured mean
      a.rgb *= 1.0 + clamp((vgL - vgM) * 1.3, -0.16, 0.20) * vergeW;
      a.rgb = mix(a.rgb, a.rgb * vec3(1.09, 1.06, 0.99), vergeW * 0.45 * (0.6 + 0.4 * n1hs));
      a.a = mix(a.a, max(a.a, 0.95), vergeW);
    }
  }
  // Round 73 (2026-09-25, the ground redux): snow. A snowfield is not one white sheet — the wind scours it to a
  // harder, cooler crust on the exposed patches and leaves powder in the lees (the macro), and combs it into sastrugi
  // and drift waves (the normal), both on the snow maps' own wind (a per-cell swing so no two trains share a heading,
  // the round-43 rule). Off the arid ripple path: the sand branch keeps its own gates and receipts.
  if (uReduxSnow.x > 0.001) {
    float scour = smoothstep(0.55, 0.85, n2w + (n1w - 0.5) * 0.30) * meadowG * (1.0 - fR);
    float powder = smoothstep(0.60, 0.92, meadowC) * meadowG * (1.0 - fR);
    a.rgb = mix(a.rgb, a.rgb * vec3(0.90, 0.93, 0.98), scour * 0.55 * uReduxSnow.x);
    a.rgb *= 1.0 + powder * 0.035 * uReduxSnow.x;
    gScour = scour * uReduxSnow.x; // round 73b: the crust is hard and takes a satin sheen
  }
  if (uReduxSnow.y > 0.001) {
    vec2 swind = normalize(vec2(0.62, 0.78) + (nz(uv, 0.0025, vec2(0.37, 0.91)).rg - 0.5) * 0.9);
    float sph = dot(uv, swind);
    float sast = sin(sph * 3.4 + n1h * 5.0) * (1.0 - smoothstep(30.0, 120.0, camDist));
    sast *= tileVis(1.85); // ground lane: the 1.85 m sastrugi wave
    // round 73b: the drift is a sawtooth — a long stoss slope climbing to a sharp lee crest that drops in a fifth of
    // the wavelength — so the drifts carry an EDGE (a shaded lee face under the lit crest line) that reads at range in
    // albedo where the normal has mipped away; round 73's sine was one more soft undulation
    float dwave = fract(sph * 0.0669 * (0.78 + 0.44 * n2) + n1 * 0.9 + n2w * 0.5); // the wavelength swings ±22 % per ~320 m cell, the phase on two fields
    float drift = (dwave < 0.8 ? dwave / 0.8 : (1.0 - dwave) / 0.2) * 2.0 - 1.0;
    float driftD = 1.0 - smoothstep(120.0, 420.0, effDist);
    float sw = uReduxSnow.y * meadowG * (1.0 - fR) * (1.0 - triW) * (1.0 - roadCore);
    n.xy += swind * clamp(sast * 0.5 + drift * driftD * 0.9, -0.3, 0.3) * sw;
    float lee = smoothstep(0.78, 0.84, dwave) * (1.0 - smoothstep(0.88, 0.98, dwave));
    a.rgb *= 1.0 + drift * 0.05 * sw * smoothstep(40.0, 120.0, effDist) * driftD;
    a.rgb *= 1.0 - lee * 0.13 * sw * uReduxC.w * smoothstep(15.0, 50.0, effDist) * (0.6 + 0.4 * n1hs);
  }
  // Round 73: the folds. The chunk vertices carry the relief's own curvature (an 8 m and a 24 m Laplacian baked
  // at build, terrainBuildSteps): a hollow holds moisture — darker, a shade greener on turf, less rough — and takes
  // less of the sky (gFoldAO, the indirect hook); a crest dries and lightens. Low frequency, so no distance fade.
  // round 73b: the thresholds reach further down the curvature (a gentle map's folds sit under 0.4) and the
  // drainage darkening / crest bleaching read stronger — macro variation the ground-mid view can see
  float hollow = smoothstep(0.06, 0.50, vFold);
  float crest = smoothstep(0.06, 0.50, -vFold);
  {
    float moist = hollow * uReduxFold.x * (1.0 - projW) * (1.0 - fMs) * (1.0 - roadCore);
    a.rgb *= 1.0 - 0.22 * moist;
    a.rgb = mix(a.rgb, a.rgb * vec3(0.94, 1.0, 0.92), moist * 0.5 * meadowG);
    a.rgb *= 1.0 + 0.09 * crest * uReduxFold.z * (1.0 - projW) * (1.0 - fMs);
    gFoldAO = 1.0 - uReduxFold.y * 0.35 * hollow * (1.0 - fMs);
  }
  // Terrain v2 (2026-10-01, grounded realism): exposure. A slope turned to the sun dries — its turf thins and pales,
  // straw shows, its soil is dust — and a slope turned away holds its moisture: darker, greener, mossier. On snow the
  // sun side crusts (a satin sheen) and the lee keeps its powder; on a desert the shaded side keeps its varnish. The
  // largest colour pattern of a real landscape follows its relief, so the ground keeps reading as terrain where the
  // tile detail has mipped away. The smooth geometric normal against the map's own sun; no fetch.
  if (uReduxD.x > 0.001) {
    float tilt = length(wn.xz);
    float facing = tilt > 1e-4 ? dot(wn.xz / tilt, normalize(uSunDirW.xz + vec2(1e-5))) : 0.0;
    float expo = facing * smoothstep(0.02, 0.26, slope) * uReduxD.x * (1.0 - fMs) * (1.0 - roadCore);
    vec3 sunMul = uReduxD.y < 0.5 ? vec3(1.07, 1.035, 0.89) : uReduxD.y < 1.5 ? vec3(1.06, 1.045, 1.01) : vec3(0.965, 0.975, 0.99);
    vec3 shadeMul = uReduxD.y < 0.5 ? vec3(0.88, 0.96, 0.90) : uReduxD.y < 1.5 ? vec3(0.91, 0.88, 0.86) : vec3(1.025, 1.025, 1.03);
    a.rgb *= mix(vec3(1.0), sunMul, max(expo, 0.0));
    a.rgb *= mix(vec3(1.0), shadeMul, max(-expo, 0.0));
    if (uReduxD.y > 1.5) gScour = max(gScour, max(expo, 0.0) * 0.6);
  }
  // mid-frequency relief + mottle (25-450 m): stroke-free bump from the
  // SMOOTH noise field gradient (texture normals reused at giant scales read
  // as scratch marks), so the midground never collapses into smooth felt
  {
    // r3: far edge is per-map (uMidFar; desert extends it to ~820 m so the
    // dapple carries the open erg past the old 480 m cutoff)
    float dMid = smoothstep(20.0, 55.0, effDist) * (1.0 - smoothstep(uMidFar * 0.46, uMidFar, effDist));
    // terrain v2: the gradient taps at the field's own isotropic level (the explicit-LOD noise reads above)
    vec2 uvA = uv * 0.017;
    float lodA = max(0.0, gNoiseLog + log2(0.017));
    float ha = textureLod(uNoise, uvA, lodA).r;
    vec2 ga = vec2(textureLod(uNoise, uvA + vec2(0.006, 0.0), lodA).r - ha,
                   textureLod(uNoise, uvA + vec2(0.0, 0.006), lodA).r - ha);
    vec2 uvB = uv * 0.0052;
    float lodB = max(0.0, gNoiseLog + log2(0.0052));
    float hb = textureLod(uNoise, uvB, lodB).g;
    vec2 gb = vec2(textureLod(uNoise, uvB + vec2(0.005, 0.0), lodB).g - hb,
                   textureLod(uNoise, uvB + vec2(0.0, 0.005), lodB).g - hb);
    // uMidRelief: per-map scale — bright low-sun sand turns this dapple into
    // a leopard-spot shadow field, so the desert runs it well under 1.0 and
    // leans on the anisotropic wind ripples for mid-frequency character.
    // This is landform relief, not road relief. Applying it to the compacted
    // carriageway made the smooth noise gradients behave like oversized
    // normal-map dents: black circular splotches remained even with CSM,
    // GTAO, tree shadows, and decals all disabled.
    // r5 terrain_environment: planar-noise dapple gated off slopes — its
    // gradient is meaningless down a face and printed streaks (corduroy kin)
    float dapG = (1.0 - triW * 0.85) * (1.0 - roadCore * 0.5); // 2026-09-12: half the landform dapple stays on the carriageway
    // These signed gradients are added before the final normal decode (x2).
    // Large gains made shallow turf look like crumpled metal. Soil relief
    // must also stop at the waterline: water owns its own wave normals.
    // terrain relief pass 2 (2026-09-12, owner: "flat, undetailed, less
    // textured than 1049e4e"): the 1049e4e midground ran this landform dapple
    // at 1.4 / 2.0; the later cut to 0.40 / 0.58 is what flattened the
    // 25-450 m band. Back to ~80 % of the reference, keeping the slope and
    // carriageway gates and the waterline stop the reference did not have.
    // ground lane (farmland, waves 46–47: the establishing views' "brush-stroke smear" on the fields): the 59 m octave's
    // gradient is a dapple of 1–5 m spots — on a sown or turned field it was the mottle, a meadow's tussocks where no
    // meadow grows. A field keeps the 192 m octave (its landform's roll) and its own tone (fieldVar)
    float dapField = 1.0 - 0.9 * max(gCropW, gSoilW);
    // (wave 69, Saltwind's tree view: "visible flat terracing bands in its slope, a stepped-heightmap look"; hold 27
    // turned the candidate terms off one at a time in the game's renderer and the bands went with uMidRelief alone)
    // the dapple is a field in plan: on a slope seen at a grazing angle its 1–5 m spots foreshorten into long bands
    // across the face, lit and shaded by a low sun — a ladder of terraces. On a slope the relief fades as the view
    // grazes it (flat ground keeps all of it)
    float midGraze = mix(1.0, smoothstep(0.15, 0.55, saturate(dot(normalize(cameraPosition - wp), wn))), smoothstep(0.01, 0.08, slope));
    // ground lane (2026-10-05, local contrast, step 2 (b''): the dapple at twice its map's scale was the second ground
    // term, +11 % on Verdant's establishing view): a vegetated map's sward carries more of it — its tussocks' and hollows'
    // roll — where a field (dapField) and an arid or snow map (the leopard spots under a low sun) keep their own
    float swardGain = 1.0 + MID_SWARD_GAIN * meadowG * dapField * (1.0 - step(0.5, uReduxD.y));
    n.xy -= (ga * 1.1 * dapField + gb * 1.55) * dMid * uMidRelief * dapG * swardGain * (1.0 - fMs) * midGraze;
    float midN2 = nz(uv, 0.0089, vec2(0.71, 0.23)).g;
    a.rgb *= 1.0 + ((ha - 0.5) * 0.09 * dMid
                 + (midN2 - 0.5) * 0.12 * smoothstep(30.0, 90.0, camDist)) * uMidRelief * dapG * swardGain * (1.0 - fMs) * dapField;
    // rock gets its own coarse relief so cliff faces stay craggy at range —
    // wall-plane sample takes over on steep faces (r5). Mix the SAMPLES, not
    // the coordinates: coordinate blending smeared diagonal fur across every
    // partially-steep slope.
    // terrain v2: only on rock inside the mid band (three rock-normal taps ran under every fragment at weight zero)
    float rockRelW = fR * 0.6 * dMid * (1.0 - fMs) * (1.0 - gSnowRock);
    if (rockRelW > 0.002) {
    vec3 dnRa = vec3(texture2D(uNrmR, uv * 0.041).xy * 2.0 - 1.0, 0.0);
    vec3 dnR = dnRa;
    // (ground lane, 2026-10-07, with the strata's gates: the wall-plane tap where it has weight — at steepW 0 the mix
    // below returned dnRa exactly)
    if (steepW > 0.0) {
      vec3 dnRb;
      if (uBeddedR > 0.5) {
        // Round 55 (2026-09-24, round 49's open item: Titan's "fine wavy partings" on every ring wall inside 300 m).
        // The one-normal-map-at-a-time probe named uNrmR and the tap experiment named THIS sample: the procedural
        // sandstone tile is bedded (a 3 px seam notch at every bed boundary, normal strength 2.6), so projected in the
        // wall plane at a 24 m period it printed a parting every 0.9–2.8 m of world height, contour-tracing the relief
        // on every face, and no mip bias could remove it (a step's derivative stays a line at every level). On the
        // bedded maps the wall crag is analytic instead — buttress masses and ribs along the wall, leaning and ledged
        // with height (wallCragTilt), phased per cliff by one slow noise fetch per wall plane — so the walls keep
        // buttresses and recesses with no line locked to world height and no texture in the gradient (a
        // screen-derivative bump of the mip-sampled noise field was tried first and speckled the whole wall). The
        // planar ground tap (dnRa) and the photo-rock maps keep the tile.
        float phx = nz(gWallUVx, 0.0031, vec2(0.63, 0.21)).r;
        float phz = nz(gWallUVz, 0.0031, vec2(0.63, 0.21)).r;
        vec2 nxv = wallCragTilt(gWallUVx, phx);
        vec2 nzv = wallCragTilt(gWallUVz, phz);
        dnRb = vec3(-gWallSigns.y * nzv.x * gWallW, gWallSigns.x * nxv.x * (1.0 - gWallW), -mix(nxv.y, nzv.y, gWallW));
      } else {
        dnRb = wallNormalDelta(texture2D(uNrmR, gWallUVx * 0.041).xy,
                               texture2D(uNrmR, gWallUVz * 0.041).xy);
      }
      dnR = mix(dnRa, dnRb, steepW);
    }
    n.xyz += dnR * rockRelW; // relief pass 2: 0.24 -> 0.6 (1049e4e ran 0.9), craggy rock at range
    }
  }
  // The Redrock lane, round 10 (uJebelFace.y): the jebel faces' beds, cross-bedding, joints, column facets and honeycomb in
  // the normal and the albedo (jebelFaceV2) — on the walls and the domes alike, to ~600 m
  if (uJebelFace.y > 0.0 && steepW > 0.0) {
    float jw = steepW * fR * (1.0 - gSnowRock) * (1.0 - smoothstep(380.0, 640.0, camDist));
    gJebelMatte = steepW * fR * (1.0 - gSnowRock);
    if (jw > 0.002) {
      // (its own slow phase field, not the crag's read: a cliff's joints and its buttresses wander independently)
      float fpx = nz(gWallUVx, 0.0031, vec2(0.29, 0.83)).r, fpz = nz(gWallUVz, 0.0031, vec2(0.29, 0.83)).r;
      float nearJ = 1.0 - smoothstep(30.0, 80.0, camDist);
      // (round 11: the honeycomb low on the walls and the domes' feet, where the salts work — not over whole domes)
      float tafJ = uJebelFace.z * (1.0 - smoothstep(40.0, 85.0, camDist)) * (1.0 - smoothstep(9.0, 17.0, wp.y));
      float yJ = wp.y - gBedWob;
      vec3 jx = vec3(0.0, 0.0, 1.0), jz = vec3(0.0, 0.0, 1.0);
      if (gWallW < 0.997) jx = jebelFaceV2(gWallUVx.x, yJ, fpx, nearJ, tafJ, gFootM);
      if (gWallW > 0.003) jz = jebelFaceV2(gWallUVz.x, yJ, fpz, nearJ, tafJ, gFootM);
      n.xyz += vec3(-gWallSigns.y * jz.x * gWallW, gWallSigns.x * jx.x * (1.0 - gWallW), mix(jx.y, jz.y, gWallW))
        * jw * uJebelFace.y * 0.5;
      a.rgb *= mix(1.0, mix(jx.z, jz.z, gWallW), jw);
    }
  }
  // horizontal strata banding on steep faces (mesa cliff walls), world-Y driven
  // r4 terrain_environment: band start 0.24 -> 0.36 slope (~31 deg -> ~40 deg)
  // — moderate DUNE flanks fell inside the old band and carried the sin-bed
  // stripes as "pink contour-band marbling over the sand" (desert critique);
  // strata now live only on genuine cliff faces
  if (uStrata > 0.001) {
    float steep = smoothstep(0.36, 0.58, slope) * rockGate; // r6: beds only on real mesa rock
    // (ground lane, 2026-10-07 — mr2's Aegis toggle hold: the block cost ~1.6 ms GPU p25 at Aegis' chase and bird. Every
    // term below is scaled by steep, so a fragment off the cliffs — most of a frame — ran the beds' six noise reads, the
    // formation's and the wall macro's for a zero result. The beds, the joints and the face tints run where steep > 0, the
    // formation where it has weight (max(fR, steep) > 0: it tints the rock wherever the rock shows); each skipped term was
    // an exact identity (a product with 1, a mix at weight 0), so the frame is unchanged to the bit)
    float bedY = wp.y - gBedWob;
    float pale = 0.0;
    if (steep > 0.0) {
      // r7: bed phase warped by the WALL-plane noise, not planar n2 — planar
      // n2 is sampled at grazing angles down a vertical face, so its rapid
      // horizontal gradient sheared the beds into wavy taffy along cliff tops.
      // n2Wall drifts slowly ALONG the wall: beds wander gently, stay bedded.
      // r8: per-cliff frequency/phase modulation — the fixed 1.9/0.57 wp.y
      // frequencies printed the SAME band ladder on every face at equal
      // altitude ("uniform synthetic strata"); gCliffJ wanders the frequency
      // ±30% and slides the phase several radians per cliff, and the band
      // amplitude itself breathes so some faces are strongly bedded, others
      // nearly massive rock.
      float bedF = 0.76 + gCliffJ * 0.60;
      // (ground lane: the beds weather away on the sheerest faces — the clefts and the joints' walls run massive)
      float bedAmp = uStrata * steep * (0.65 + gCliffJ * 0.7) * (1.0 - 0.6 * smoothstep(0.80, 0.97, slope))
        * (1.0 - 0.72 * uJebelFace.x); // (round 9: a jebel face's bedding is its relief, the paint under a third)
      // (2026-10-06, Titan's zigzag strata: bedF multiplied the absolute height as the wall basis's stretch did — the beds
      // tilted by y · ∇bedF, ~0.85 at 250 m) the per-cliff frequency as a bed-set stretch on the same 48 m band of the height,
      // the beds' phases at the mean frequency: a cliff's sets still thicken and thin by its own ±28 %, the shear bounded
      float bedH = bedY + (bedF / 1.06 - 1.0) * 7.6394 * sin((bedY + gCliffJ * 9.7) * 0.13090);
      // Round 49 (owner 2026-09-23, "Titan's marbled near walls — the round-35 wall texture reads as flowing water at
      // 300 m"): the uniform-isolation probe pinned the swirl on THIS block (zeroing uStrata calmed the sw-corner ring
      // wall; flat normals changed nothing). A continuous 3.3 m sine ladder (±30 %) lay over the bed tile's own 4–12 m
      // beds, and every band traced the smooth face's contours with nothing breaking it along the wall — dense, even,
      // wavy: water. Bedded sandstone reads as rock through a FEW thick beds of unequal thickness and tone, thin
      // recessed partings, joint blocks whose weathering tone steps along the wall, and dark varnish streaks below the
      // ledges. The fine laminae stay inside ~200 m, where they are laminae and not moiré.
      // (B1/B2 captures: a face-on wall's XZ pixel footprint is tiny, so effDist read the 300 m wall as near and the
      // laminae still drew the fine wavy lines there — they are gated by the TRUE camera distance, gone by 120 m)
      float lamW = 1.0 - smoothstep(40.0, 120.0, camDist);
      // terrain v2: the beds' height signals are non-periodic (bedSignal) by the map's irregularity (uReduxD.z)
      float lamina = mix(sin(bedH * 1.9 * 1.06 + n2Wall * 2.2 + gCliffJ * 9.3), bedSignal(bedH + n2Wall * 1.2, 0.067 * 1.06, gCliffJ), uReduxD.z);
      a.rgb *= 1.0 + lamina * bedAmp * 0.30 * lamW;
      // marker beds: the two long-period terms thresholded into discrete beds — a rust-stained bed 2–5 m thick every
      // 11–17 m on one term, a bleached caprock bed on the other — phase and thickness per cliff (gCliffJ) so no two
      // faces share a sequence, and a thin recessed parting under each rust bed inside 700 m
      float bedA = mix(sin(bedH * 0.57 * 1.06 + n2Wall * 1.9 + gCliffJ * 5.1), bedSignal(bedH + n2Wall * 3.3, 0.020 * 1.06, gCliffJ + 0.31), uReduxD.z);
      float bedB = mix(sin(bedH * 0.23 * 1.06 + n2Wall * 1.1 + 0.8 + gCliffJ * 3.7), bedSignal(bedH + n2Wall * 4.8, 0.0083 * 1.06, gCliffJ + 0.67), uReduxD.z);
      float rust = smoothstep(0.50, 0.82, bedA) * (0.55 + 0.45 * smoothstep(-0.3, 0.4, bedB));
      pale = smoothstep(0.55, 0.90, bedB) * (1.0 - rust);
      float parting = smoothstep(0.84, 0.97, -bedA) * (1.0 - smoothstep(300.0, 700.0, effDist));
      a.rgb = mix(a.rgb, a.rgb * vec3(0.80, 0.68, 0.62), rust * min(bedAmp * 2.6, 0.7));
      a.rgb = mix(a.rgb, a.rgb * vec3(1.16, 1.12, 1.04), pale * steep * 0.40 * (1.0 - 0.72 * uJebelFace.x));
      a.rgb *= 1.0 - parting * min(bedAmp * 1.6, 0.35);
    }
    // ground lane: two formations — under the boundary (wandering with the beds and its own ±m) the paler, harder
    // sandstone, above it the redder; the step is one bed thick, and it reads on the rock wherever the rock shows
    if (uFormation.x > -1e8 && max(fR, steep) > 0.0) {
      float fy = bedY - uFormation.x + (nz(wp.xz, 0.0071, vec2(0.83, 0.41)).g - 0.5) * 2.0 * uFormation.y
        + (nz(wp.xz, 0.031, vec2(0.17, 0.53)).g - 0.5) * 0.7 * uFormation.y;
      float upper = smoothstep(-uFormation.z, uFormation.z, fy);
      // (round 11, the gauntlet's wave 282: "one hard, smeared horizontal band running straight across every wall segment
      // at the same height" — the contact ragged at a 140 m and a 32 m wander, and on the walls the pale formation's wash
      // hanging below it in drips, a metre or two wide and 3-14 m long, down the fall line)
      if (steep > 0.0 && fy < 0.0 && fy > -16.0) {
        float lodP = max(0.0, gNoiseLog + log2(0.09));
        float drip = mix(textureLod(uNoise, gWallUVx * vec2(0.09, 0.0) + vec2(0.41, 0.77), lodP).r,
                         textureLod(uNoise, gWallUVz * vec2(0.09, 0.0) + vec2(0.41, 0.77), lodP).r, gWallW);
        float dlen = 3.0 + 11.0 * mix(textureLod(uNoise, gWallUVx * vec2(0.023, 0.0) + vec2(0.63, 0.12), lodP).g,
                                      textureLod(uNoise, gWallUVz * vec2(0.023, 0.0) + vec2(0.63, 0.12), lodP).g, gWallW);
        upper = max(upper, smoothstep(0.62, 0.84, drip) * (1.0 - smoothstep(0.3 * dlen, dlen, -fy)) * steep * 0.85);
      }
      // (the Redrock lane, 2026-10-07: each formation is a colour on the rock's own luminance — a pale sandstone a buff or
      // cream, not a lighter red; Redrock, the one map with a formation, sets both)
      // (round 10, the gauntlet's wave on Redrock: the tiers' ledges, sunlit over a shadowed face, took the pale tint on
      // their bright planar sample to near white — the luminance the tint reads is capped at a red sandstone's)
      float formL = min(dot(a.rgb, vec3(0.30, 0.59, 0.11)), 0.2);
      vec3 formCol = mix(mix(a.rgb, formL * uFormationLow.rgb, uFormationLow.w),
                         mix(a.rgb, formL * uFormationUp.rgb, uFormationUp.w), upper);
      a.rgb = mix(a.rgb, formCol, max(fR, steep));
    }
    if (steep > 0.0) {
      // joint blocks and varnish where the beds are authored strongly (Titan 0.22 and Skybridge 0.18 full, Copper Mesa
      // and Mars 0.12 six tenths, the desert's 0.10 four tenths, Caldera / Badlands none)
      float jointAmp = smoothstep(0.06, 0.16, uStrata) * steep;
      if (jointAmp > 0.002) {
        // blocks ~9 m along the wall and ~5 m tall, one weathering tone per block: the noise texture read at block
        // centres in BOTH wall projections and mixed by the axis weight (samples, never coordinates); the block index
        // steps 95 / 158 texels so neighbouring blocks decorrelate, and the smooth noise's ±0.2 is stretched to a tone
        // terrain v2: one texel per block (level 0) — the implicit level spiked at every block border, where floor() jumps
        float block = mix(textureLod(uNoise, floor(gWallUVx / vec2(9.0, 5.0) + gCliffJ * 3.0) * vec2(0.373, 0.617) + vec2(0.31, 0.77), 0.0).r,
                          textureLod(uNoise, floor(gWallUVz / vec2(9.0, 5.0) + gCliffJ * 3.0) * vec2(0.373, 0.617) + vec2(0.31, 0.77), 0.0).r, gWallW);
        block = clamp((block - 0.5) * 2.4, -0.5, 0.5);
        a.rgb *= 1.0 + block * uWallWeather.x * jointAmp;
        // varnish: along-wall noise stretched ~17:1 down the face, darkest under the pale caprock beds
        float lodS = max(0.0, gNoiseLog + log2(0.010));
        float streak = mix(textureLod(uNoise, gWallUVx * vec2(0.010, 0.0006) + vec2(0.61, 0.29), lodS).g,
                           textureLod(uNoise, gWallUVz * vec2(0.010, 0.0006) + vec2(0.61, 0.29), lodS).g, gWallW);
        streak = smoothstep(0.50, 0.80, streak) * (0.5 + 0.5 * pale);
        a.rgb = mix(a.rgb, a.rgb * vec3(0.66, 0.64, 0.66), streak * uWallWeather.y * jointAmp);
      }
      // The Redrock lane, round 10 (uJebelFace.w; the gauntlet's wave 270: "desert-varnish streaks running down from the
      // rim, dark and patchy"): the run-off from the pale Disi over the red cliffs — streaks of every width (narrow
      // 0.4-1.5 m, broad 2-8 m), each starting at the formation's contact and running 8-60 m down its own length, dark
      // brown-black, patchy along it; under the contact only (the Disi above stays pale)
      if (uJebelFace.w > 0.0) {
        float lodV1 = max(0.0, gNoiseLog + log2(0.040)), lodV2 = max(0.0, gNoiseLog + log2(0.011));
        float v1 = mix(textureLod(uNoise, gWallUVx * vec2(0.040, 0.0016) + vec2(0.17, 0.41), lodV1).r,
                       textureLod(uNoise, gWallUVz * vec2(0.040, 0.0016) + vec2(0.17, 0.41), lodV1).r, gWallW);
        float v2 = mix(textureLod(uNoise, gWallUVx * vec2(0.011, 0.00055) + vec2(0.53, 0.07), lodV2).g,
                       textureLod(uNoise, gWallUVz * vec2(0.011, 0.00055) + vec2(0.53, 0.07), lodV2).g, gWallW);
        float vl = mix(textureLod(uNoise, gWallUVx * vec2(0.021, 0.0) + vec2(0.71, 0.23), lodV2).b,
                       textureLod(uNoise, gWallUVz * vec2(0.021, 0.0) + vec2(0.71, 0.23), lodV2).b, gWallW);
        float below = (uFormation.x > -1e8 ? uFormation.x : 60.0) - bedY;
        float len = 8.0 + 52.0 * vl;
        float run = smoothstep(-1.5, 2.0, below) * (1.0 - smoothstep(len * 0.55, len, below));
        float varn = max(smoothstep(0.54, 0.80, v1) * 0.8, smoothstep(0.48, 0.74, v2)) * run;
        a.rgb = mix(a.rgb, a.rgb * vec3(0.42, 0.37, 0.36), varn * uJebelFace.w * steep * 0.85);
        float wash = (1.0 - smoothstep(0.10, 0.24, v2)) * (1.0 - varn) * smoothstep(0.0, 6.0, below);
        a.rgb = mix(a.rgb, a.rgb * vec3(1.10, 1.06, 1.02), wash * uJebelFace.w * steep * 0.25);
      }
      // r8 per-cliff color drift: warm iron-stained faces vs paler washed faces
      // r4: 0.5 -> 0.30 and flush 0.22 -> 0.12 — the stacked warm shifts were
      // the residual PINK cast in the marbled-cliff read
      a.rgb = mix(a.rgb, a.rgb * vec3(1.07, 0.985, 0.91), steep * gCliffJ * 0.30);
      a.rgb = mix(a.rgb, a.rgb * vec3(1.03, 0.95, 0.88), steep * 0.12); // baked iron-oxide faces
      // r7 macro-variation octave (wall-space): breaks the uniform band print
      // into distinct rock masses / weathered faces along the wall run
      float wallMac = wallNoiseG(0.011, vec2(0.19, 0.67));
      a.rgb *= 1.0 + (wallMac - 0.5) * 0.30 * steep;
    }
  }
  // far-cliff detail rescue: the mip-biased macro fade flattens steep rock
  // faces past ~300 m into featureless sheets — re-project the rock layer at
  // a coarse world scale + its normals so distant mesa/cut walls stay craggy
  {
    float farRock = fR * farM * (1.0 - gSnowRock); // ground lane (wave 62): not the rock's grain on the snow lying on it
    if (farRock > 0.003) {
      // wall-plane sample takes over on steep faces (r5). Mix SAMPLES, not
      // coordinates — coordinate blending smeared diagonal fur streaks across
      // every partially-steep slope (the gold "furry" mesa flanks).
      // (ground lane, 2026-10-07, with the strata's gates: the wall-plane work here — the albedo's two projections, the
      // masses', the ledges' noise and bed signal, the normal's two — runs where the wall projection has weight; at
      // steepW 0 each was an exact identity, a mix at weight 0 or a product with 1)
      vec3 rrC = texture2D(uAlbR, uv * 0.031).rgb;
      if (steepW > 0.0) rrC = mix(rrC, wallTex(uAlbR, 0.031), steepW);
      vec4 rr = vec4(rrC, 1.0);
      // LUMINANCE-only modulation at reduced strength (r3): the rgb multiply
      // compounded the rock tint with itself and saturated far walls toward
      // maroon; value-only variation keeps the crag without the color drift
      float rrL = dot(rr.rgb, vec3(0.36, 0.42, 0.22));
      a.rgb = mix(a.rgb, a.rgb * (0.80 + rrL * 0.40), farRock * 0.45);
      // Round 35 (owner 2026-09-21, "stuff in background should never be flat"): a wall at 300–700 m kept one
      // luminance octave and a fifth of a coarse normal, so Redrock's outland walls read as one brown sheet. Three
      // more structures, all in the wall plane and all gated to STEEP rock at range so the near cliffs keep their
      // look: (a) rock masses — buttresses and recesses ~90 m across from the same layer sampled coarser;
      // (b) bed ledges — a ~14 m world-height ladder, its shelf lit and its seam shaded, warped along the wall by
      // the per-cliff field so no two faces share a band, carried in albedo where the normals have mipped away
      // (full strength on bedded maps, half on the rest); (c) the coarse normal at wall strength.
      float wallFar = farRock * steepW;
      if (steepW > 0.0) {
        float rrM = dot(wallTex(uAlbR, 0.011), vec3(0.36, 0.42, 0.22));
        a.rgb *= 1.0 + (rrM - 0.5) * 0.36 * wallFar;
        // Round 49: the ladder's along-wall wander 2.6 → 1.0 rad (±5.8 m per 50 m was a third wave system on top of
        // the tile beds and the marker beds; ±2.2 m reads as a gentle fault, not a swell)
        float ledgeWarp = wallNoiseG(0.02, vec2(0.31, 0.77));
        float ledgePhase = wp.y * 0.45 + gCliffJ * 7.0 + ledgeWarp * 1.0;
        float ledge = mix(sin(ledgePhase), bedSignal(wp.y + ledgeWarp * 2.2, 0.016, gCliffJ + 0.53), uReduxD.z); // terrain v2
        float ledgeAmp = mix(0.5, 1.0, smoothstep(0.02, 0.12, uStrata)) * wallFar;
        // (skies lane, 2026-10-06: a snow map's exposed rock keeps its beds at full strength — the snow ledges above lie on
        // these shelves, the seams between them stay dark rock)
        if (uReduxD.y > 1.5) ledgeAmp = wallFar;
        ledgeAmp *= 1.0 - 0.75 * uJebelFace.x; // (round 9: the jebel faces' far ladder too)
        a.rgb *= 1.0 + (smoothstep(0.35, 0.9, ledge) * 0.10 - smoothstep(0.35, 0.9, -ledge) * 0.16) * ledgeAmp;
      }
      vec3 rn = vec3(texture2D(uNrmR, uv * 0.019).xy * 2.0 - 1.0, 0.0);
      if (steepW > 0.0) {
        vec3 rnWall = wallNormalDelta(texture2D(uNrmR, gWallUVx * 0.019).xy,
                                      texture2D(uNrmR, gWallUVz * 0.019).xy);
        rn = mix(rn, rnWall, steepW);
      }
      // 0.55 (r5, was 0.9): under a low sun the full-strength coarse normals
      // rendered far flanks as glittery fur instead of crag; round 35 adds back a quarter on genuine walls only
      n.xyz += rn * farRock * (0.22 + 0.24 * steepW);
    }
  }
  // wind-aligned sand ripples: anisotropic normal waves instead of dot noise.
  // Two wavelengths: ~2 m gameplay-range ripples + ~11 m dune-face waves that
  // still resolve in establishing shots.
  // Coastal maps use grass as G and beach sand as D. Their wind ripples
  // belong only to the existing shore apron, not inland pasture/road dust.
  // Dry dune maps retain full coverage and their exact existing response.
  float sandCoverage = uRipple.w > 0.5 ? seaSand : 1.0;
  if (uRipple.z * sandCoverage > 0.001) {
    // Round 43 (AAA program check 8, owner audit "dune faces carry dark parallel ripple bands at every range — a
    // corduroy repeat" on the desert and Oasis): every ripple and bedform wave below was phase-locked to ONE authored
    // wind vector, so the whole basin printed parallel bands of one heading and one spacing at any distance. A dune
    // field's local wind swings with the dunes themselves: rotate the authored wind per ~400 m cell (±25°) and again
    // per ~90 m cell (±10°), and stretch the wavelength ±25 % per ~250 m cell, so no two trains share a heading or a
    // spacing. The authored direction stays the mean; near-field grain and the shore gate are unchanged.
    // terrain v2: the trains (sandWaves above) — the 2.2 m ripples to 150 m and the 11 m dune-face waves to 300 m (the
    // round-43 field's own two wave numbers and amplitudes) share 36 m cells turned within ±20° of the map's wind, bent
    // by one bounded sinuosity field; the dune bedforms (26 m) ride 260 m cells within ±26°. Same gates and tilt cap.
    vec2 wind0 = uRipple.xy;
    float rMod = 0.55 + 0.9 * nz(uv, 0.0064, vec2(0.83, 0.41)).g;
    float sinuosity = nz(uv, 0.019, vec2(0.0)).r * 1.6;
    float rw = uRippleNear * (1.0 - fR) * (1.0 - triW * 0.9) * (1.0 - fMs) * sandCoverage;
    // (wave 11, Sunscar Oasis: the ring's mesas striped by the floor's ripple trains) a gate-less sand map keeps its trains
    // and bedforms on the battlefield: past the edge its ring is a backdrop of mesas and dunes at 0.5–3 km
    float ringNoTrains = uRockGate < 0.5 && uRipple.w < 0.5 ? 1.0 - outsideW : 1.0;
    rw *= ringNoTrains;
    // Ground lane (2026-10-03, the coordinator's Sirocco smoke frames: "regular, high-contrast dark stripe bands across
    // the whole valley floor at chase range, a few metres apart"): the near train ran at 2.2 m (a megaripple's spacing,
    // not a ripple's) with a 0.34 tilt cap, phase-locked over 36 m cells. Real wind ripples are fine crests — the near
    // train now runs at 0.38 m and fades out by 45 m; the 11 m megaripples are a third as strong; the cells are 22 m
    // and swing ±0.6 rad; the tilt caps at 0.12; and both ride the loose sand sheets only — between them a valley floor
    // is smooth, lag-strewn sand
    float sheet = smoothstep(0.42, 0.68, nzq(uvW, 0.0061, vec2(0.29, 0.61)).x);
    float nearRip = (1.0 - smoothstep(12.0, 45.0, camDist)) * sheet * 0.5;
    float megaRip = 0.36 * (1.0 - smoothstep(80.0, 220.0, camDist)) * rMod * (0.3 + 0.7 * sheet);
    nearRip *= tileVis(0.38); megaRip *= tileVis(11.4); // ground lane: each train fades as its period nears the pixel
    // (wave 8, coastal sky-w: "perfectly regular parallel ripple stripes" on the strand) the arid maps' sand seas keep
    // their trains; a green map's dune band keeps a trace of them
    if (uReduxD.y < 0.5) { nearRip *= 0.25; megaRip *= 0.4; }
    if (rw * max(nearRip, megaRip) > 0.0005) {
      float rTone;
      vec2 rSlope = sandWaves(uv, wind0, 22.0, 0.6, sinuosity, vec2(16.5, 0.55), vec2(nearRip, megaRip), rTone);
      rSlope *= rw;
      float rLen = length(rSlope);
      if (rLen > 0.12) rSlope *= 0.12 / rLen;
      n.xy += rSlope * (1.0 - 0.8 * smoothstep(0.004, 0.035, slope));
    }
    float bedMod = smoothstep(0.30, 0.72, nz(uvW, 0.0035, vec2(0.67, 0.23)).r);
    // terrain v3 (2026-10-02, the ring census): dune bedforms belong to the sand sea, not to the flanks of a range — on
    // the ring's moderate faces (15–28°, below the wall band) the 26 m trains printed a corrugated chevron sheet over
    // every desert mountain at 1–2 km. Gentle sand only.
    float bedW = min(uRipple.z * 2.2, 1.0) * bedMod * (1.0 - fR) * (1.0 - roadCore)
               * (1.0 - triW) * smoothstep(60.0, 170.0, effDist) * (1.0 - smoothstep(0.035, 0.09, slope))
               * ringNoTrains * (1.0 - fMs) * sandCoverage;
    if (bedW > 0.002) {
      float bed;
      vec2 bedSlope = sandWaves(uv, wind0, 260.0, 0.45, nz(uv, 0.0021, vec2(0.19, 0.57)).g * 2.0, vec2(0.24, 0.0), vec2(1.0, 0.0), bed);
      // Round 43: the albedo band is what survives to the horizon; past ~320 m it eases to half so the far basin reads as
      // dune trains fading with distance rather than a printed sheet (the normal wave already mips away out there).
      float bedFar = 1.0 - 0.5 * smoothstep(320.0, 640.0, effDist);
      a.rgb *= 1.0 + bed * 0.08 * bedW * bedFar; // ground lane: a low-contrast undulation, not a painted band (was 0.15)
      n.xy += bedSlope * 0.35 * bedW;
    }
    float sandFaceW = triW * (1.0 - fR) * (1.0 - fMs) * sandCoverage;
    if (sandFaceW > 0.01) {
      vec3 wg1 = texture2D(uNrmG, gWallUVx * 0.55).xyz;
      vec3 wg2 = texture2D(uNrmG, gWallUVz * 0.55).xyz;
      vec3 wgn = wallNormalDelta(wg1.xy, wg2.xy);
      // r7: fade 320 -> 560 m — the 300-500 m dune flanks lost every detail
      // pass at once and any residual shading isoline printed bare (part of
      // the "terracing" read); the wall-plane grain now carries those faces
      n.xyz += wgn * 0.65 * sandFaceW * (1.0 - smoothstep(160.0, 560.0, effDist));
      // slope-aligned ripple detail on the same faces: anisotropic waves in
      // the wall frame (V = world height, so crests run along the contour —
      // real wind ripples on a slip face) mask any residual banding
      {
        float wRip = mix(sin(gWallUVx.y * 7.3 + nz(gWallUVx, 0.05, vec2(0.0)).r * 4.0),
                         sin(gWallUVz.y * 7.3 + nz(gWallUVz, 0.05, vec2(0.0)).r * 4.0), gWallW);
        // terrain v2: a slip face carries grain flows, not contour ripples — the contour wave runs at a third
        // terrain v3: and by the TRUE camera distance as well (round 49's lesson: a face-on wall's footprint reads near,
        // so a 0.9 m contour wave survived on the ring's sand faces at a kilometre and aliased into chevrons)
        float wRipW = sandFaceW * (1.0 - smoothstep(200.0, 620.0, effDist)) * (1.0 - smoothstep(150.0, 450.0, camDist)) * 0.10;
        wRipW *= tileVis(0.86); // ground lane
        vec2 hDir = wn.xz / max(length(wn.xz), 1e-4); // fall-line in the map plane
        a.rgb *= 1.0 + wRip * 0.12 * wRipW;
        n.xy += hDir * wRip * wRipW;
      }
      // avalanche flow tongues: value streaks running down the fall line
      // (variation ALONG the wall run = vertical flow structure)
      float flow = mix(
        sin(gWallUVx.x * 1.7 + nz(gWallUVx, 0.06, vec2(0.0)).r * 5.0),
        sin(gWallUVz.x * 1.7 + nz(gWallUVz, 0.06, vec2(0.0)).r * 5.0), gWallW);
      float wgA = mix(texture2D(uAlbG, gWallUVx * 0.10, 1.0).g,
                      texture2D(uAlbG, gWallUVz * 0.10, 1.0).g, gWallW);
      // terrain v3: the 3.7 m flow sine fades by the true camera distance (unmipped, it aliased on the far sand faces)
      flow *= 1.0 - smoothstep(250.0, 600.0, camDist);
      flow *= tileVis(3.7); // ground lane
      a.rgb *= (1.0 + flow * 0.05 * sandFaceW) * (0.88 + wgA * 0.24 * sandFaceW + (1.0 - sandFaceW) * 0.12);
      a.rgb *= 1.0 - sandFaceW * 0.07; // slip-face definition vs the blown flats
    }
  }
  // r3 terrain_environment: desert macro sheet variation — the bowl between
  // the mesas was near-uniform pale cream at establishing range. Broad
  // (~120-400 m) warped fields: darker granular gravel-lag basins and pale
  // wind-scoured sheets, gated off rock/road so the landforms keep their own
  // material response.
  if (uSandMacro > 0.001) {
    float smA = nz(uvW, 0.0024, vec2(0.13, 0.83)).r;
    float smB = nz(uvW, 0.0009, vec2(0.77, 0.31)).g;
    float openW = (1.0 - fR) * (1.0 - roadCore) * (1.0 - projW) * uSandMacro * (1.0 - fMs);
    float gravelW = smoothstep(0.56, 0.82, smA + (n1 - 0.5) * 0.24) * openW;
    float grainG = texture2D(uNoise, uv * 0.11 + vec2(0.41, 0.09)).r;
    vec3 gravelCol = a.rgb * vec3(0.80, 0.755, 0.70) * (0.90 + grainG * 0.20);
    a.rgb = mix(a.rgb, gravelCol, gravelW * 0.8);
    a.a = mix(a.a, max(a.a, 0.92), gravelW * 0.5); // lag surfaces run matte
    float scourW = smoothstep(0.60, 0.90, smB) * openW * (1.0 - gravelW);
    a.rgb = mix(a.rgb, a.rgb * vec3(1.055, 1.035, 1.0), scourW * 0.55);
    // r6: brightest-texel shoulder — open sand at ~1.2+ linear tonemapped to
    // blown paper (critique: "bright sand faces partially blown out"); trim
    // only the top of the albedo range so texture survives the ACES shoulder
    float sandLum = dot(a.rgb, vec3(0.34, 0.42, 0.24));
    a.rgb *= 1.0 - smoothstep(0.60, 0.95, sandLum) * 0.10 * uSandMacro;
  }
  // r6 terrain_environment: UNCORRELATED mid-band octave. Every macro term
  // above keys off the SAME two noise fields (n1/n2 and their warps), and the
  // far-variant tile repeats at ~18 m — together the 50-150 m midground read
  // as one repeating mottled-blotch print (critique). A third pair of fields
  // at fresh offsets/scales (~34 m and ~13 m), band-limited to 35-260 m,
  // decorrelates the repeat without touching the near field.
  {
    float decoW = smoothstep(35.0, 90.0, effDist) * (1.0 - smoothstep(160.0, 260.0, effDist))
      * (1.0 - fM) * (1.0 - roadCore);
    if (decoW > 0.004) {
      float dcA = nzq(uv, 0.0293, vec2(0.83, 0.07)).x; // ground lane: no 34 m / 13.5 m repeat (nzq)
      float dcB = nzq(uv, 0.0741, vec2(0.29, 0.63)).y;
      a.rgb *= 1.0 + ((dcA - 0.5) * 0.11 + (dcB - 0.5) * 0.07) * decoW;
    }
  }
  // 0-48 m detail pass: layered micro normals + albedo speckle + road gravel
  float dNear = 1.0 - smoothstep(18.0, 48.0, camDist);
  if (dNear > 0.001) {
    vec3 dn = texture2D(uNrmD, uv * 1.07).xyz * 2.0 - 1.0;
    dn.xy *= tileVis(0.935); // ground lane: the 0.93 m clod tile fades before it beats against the pixels
    // Open soil benefits from clod-scale relief, but the same normal contains
    // isolated cavities that read as black potholes on a compacted road.
    // Keep every near-detail octave off the carriageway; the dedicated road
    // pass below supplies its own shallow, continuous surface response.
    float openNear = dNear * (1.0 - roadCore);
    // 2026-09-12 owner verdict ("everything looks flat"): open ground runs the
    // 1049e4e clod relief again (0.85 there, 0.70 here); the carriageway keeps
    // its own shallow packed-earth response below, so no source cavity is ever
    // decoded as a pothole on a road.
    // ground lane (farmland): on turned earth the clods are a near read — a little stronger beside the tank, gone by
    // 32 m, where at a grazing view the tile smeared into the establishing frames' "brush-stroke smear"
    float dnW = mix(openNear, (1.0 - smoothstep(12.0, 32.0, camDist)) * 1.45 * (1.0 - roadCore), gSoilW);
    // The Redrock lane, round 9 (the gauntlet's wave 261 at cistern-west: "a blurry, vertically smeared texture ...
    // brushed plastic"): this pass's planar projection runs down a wall as vertical streaks; on a jebel face it stands
    // down by the face's steepness, and the rock tile and the grain, projected in the wall's own plane, carry the near
    // relief instead (uJebelFace; absent, wallNear is 0 and the pass is unchanged)
    float wallNear = steepW * uJebelFace.x;
    n.xy += dn.xy * 0.85 * dnW * (1.0 - fMs) * (1.0 - wallNear); // relief pass 2 (2026-09-12): the full 1049e4e clod relief
    float micro = texture2D(uNoise, uv * 0.171).r;
    a.rgb *= 1.0 + (micro - 0.5) * 0.40 * openNear * uMicroAmp * (1.0 - fMs) * (1.0 - wallNear);
    if (wallNear > 0.002) {
      vec3 dw = wallNrm(uNrmR, 0.62, df, mipB).xyz * 2.0 - 1.0;
      n.xyz += dw * 0.6 * openNear * wallNear;
      float wm = wallNoiseG(0.171, vec2(0.21, 0.49)), wm2 = wallNoiseG(0.43, vec2(0.67, 0.13));
      a.rgb *= 1.0 + ((wm - 0.5) * 0.30 + (wm2 - 0.5) * 0.18) * openNear * wallNear;
    }
    // Compacted gravel grain on the carriageway: a CLAMPED zero-mean luminance
    // high-pass of the rock tile, so grit resolves under the hull while the
    // tile's dark cavities cannot return as repeated black marks.
    float gvL = dot(texture2D(uAlbR, uv * 0.83).rgb, vec3(0.34, 0.45, 0.21));
    float gvM = dot(uMeanR.rgb, vec3(0.34, 0.45, 0.21)); // terrain v2: the rock tile's measured mean
    gvL = mix(gvM, gvL, tileVis(1.2)); // ground lane: the 1.2 m grit tile (zero-mean, so it eases to nothing)
    a.rgb *= 1.0 + clamp((gvL - gvM) * 1.4, -0.16, 0.20) * roadCore * dNear * (1.0 - gRoadTex);
    // sub-10 m second octave: clod/blade relief right under the camera
    // r6 terrain_environment: band widened (5-15 -> 6-26 m) and the octave
    // now carries ALBEDO as well as normal — the 5-20 m meadow read as one
    // smeared macro-noise wash with "no visible detail" (critique). The
    // ~0.9 m re-projection of the ground layer is the blade/clod-scale
    // signal that resolves right in front of the hull.
    float dNear2 = 1.0 - smoothstep(6.0, 26.0, camDist);
    dNear2 *= tileVis(0.369); // ground lane: the 0.37 m blade tile at a grazing view
    if (dNear2 > 0.001) {
      vec3 dn2 = texture2D(uNrmG, uv * 2.71).xyz * 2.0 - 1.0;
      float openNear2 = dNear2 * (1.0 - roadCore);
      // Detail belongs to the remaining base layer. Reapplying turf after
      // the dirt/rock blend made worked yards inherit the meadow's grain.
      // The same coverage also keeps base snow/sand off exposed soil/rock.
      float nearG = openNear2 * meadowG * (1.0 - fR) * (1.0 - max(gSoilW, 0.6 * gCropReliefW)); // ground lane: no blades on a turned field
      n.xy += dn2.xy * 0.75 * nearG; // relief pass 2 (2026-09-12): the full 1049e4e blade/clod relief
      // zero-mean albedo octave: deep-mip sample = local tile mean, so the
      // modulation is exposure-neutral on every map palette (sand vs turf)
      float gl2 = dot(texture2D(uAlbG, uv * 2.71).rgb, vec3(0.36, 0.42, 0.22));
      float glM = dot(uMeanG.rgb, vec3(0.36, 0.42, 0.22)); // terrain v2: the base tile's measured mean
      a.rgb *= 1.0 + clamp((gl2 - glM) * 1.9, -0.28, 0.32) * nearG;
    }
  }
  // Round 73: the mid-distance octave. The near passes end by 48 m and the coarse turf relief begins with the far
  // variant at 90 m; between them the ground shaded on the base tile alone. One re-projection of the ground normal at
  // ~1.1 m carries the 26–150 m band (open ground, off the carriageway), fading out before the far band's own relief.
  {
    float dMidN = smoothstep(20.0, 40.0, camDist) * (1.0 - smoothstep(110.0, 190.0, camDist)) * uReduxA.y; // round 73b: 26–150 → 20–190 m
    dMidN *= 1.0 - max(0.85 * gCropReliefW, gSoilW); // ground lane: the tussock octave is the sward's (none on turned earth)
    dMidN *= tileVis(1.075); // ground lane: its 1.08 m tile, seen from a raised camera, was the gauntlet's moiré
    if (dMidN > 0.003) {
      vec3 dnM = texture2D(uNrmG, uv * 0.93).xyz * 2.0 - 1.0;
      n.xy += dnM.xy * 0.42 * dMidN * meadowG * (1.0 - fR) * (1.0 - roadCore);
      // round 73b: the same octave in albedo — the tussocks and clods of the 26–150 m band read by tone where the
      // normal's shading has mipped flat (a zero-mean high-pass of the tile against its deep mip, exposure-neutral)
      float midA = uReduxB.w * dMidN * meadowG * (1.0 - fR) * (1.0 - roadCore);
      if (midA > 0.003) {
        float gmL = dot(texture2D(uAlbG, uv * 0.93).rgb, vec3(0.36, 0.42, 0.22));
        float gmM = dot(uMeanG.rgb, vec3(0.36, 0.42, 0.22)); // terrain v2: the base tile's measured mean
        a.rgb *= 1.0 + clamp((gmL - gmM) * 2.4, -0.30, 0.34) * midA;
      }
    }
  }
  // the distance field's gradient: the across-road direction, away from the centreline (~unit; small over the centre's kink).
  // (roads lane, 2026-10-09: read once here — the worked carriageway below and the lanes' relief after it both use it)
  vec2 gradD = vec2(0.0);
  if (roadCore > 0.002 || (gRoadTex > 0.01 && dRoad < 11.9 && uLandTier > 0.5)) { // (and a paved surface's side of its centreline)
    float texel = 1.0 / 1024.0;
    gradD.x = maskAt(mUV - vec2(texel, 0.0)).g - maskAt(mUV + vec2(texel, 0.0)).g;
    gradD.y = maskAt(mUV - vec2(0.0, texel)).g - maskAt(mUV + vec2(0.0, texel)).g;
    gradD *= 6.0; // byte ramp over a 2 m baseline -> metres per metre, ~unit across the road
  }
  float rutShade = 1.0;   // roads lane: the lanes' albedo darkening kept (below), where the grooves' own relief carries them
  float grooveRel = 0.0;  // roads lane: the share of the lanes' relief the crisp groove profile draws (the soft one the rest)
  {
    // compacted earth road: two-track profile — lightened compacted core,
    // dark wheel ruts, damp borders. uRoadTex (0..1) cross-fades to PAVED
    // town streets: the rock layer (cobble/sett) laid across the full
    // carriageway at every distance, ruts nearly gone.
    float dW = max(roadCore, apronK) * 0.9 * (1.0 - gRoadTex); // (a pad is the carriageway's packed ground too)
    // Build the compacted core from a deliberately low-frequency dirt
    // sample. Keeping only a quarter of the underlying terrain preserves
    // local variation without baking the source texture's AO/cavity blobs
    // into what should read as one continuous, traffic-smoothed surface.
    // A deep mip provides the dirt palette without preserving any individual
    // source clod. Very-low-frequency noise restores gentle soil variation
    // without stamping round marks repeatedly down the road.
    // terrain v2: only on the carriageway (the packed-earth taps ran under every fragment at weight zero)
    if (dW > 0.002) {
      vec3 packedRoad = groundSamp(uAlbD, uMeanD, uv * 0.210, df, mipB + 4.0).rgb;
      packedRoad *= 0.985 + (n2w - 0.5) * 0.035;
      vec3 roadCol = mix(packedRoad, a.rgb, 0.30) * uRoadTint
        + vec3(0.014, 0.010, 0.006);
      // (roads lane, 2026-10-09: the gauntlet's "flat grey or near-black roads") a dry packed road is never darker than the
      // field it crosses — the traffic's dust and the cleared surface reflect more than the soil or the sward beside it;
      // only its wet ruts and puddles go darker (below) — and it keeps more of its soil's hue than the old grey pull
      // (the tier: Low keeps the old law)
      float floorK = uLandTier > 0.5 ? uRoadSurfB.y : 0.0;
      float roadFloorL = floorK * dot(a.rgb, vec3(0.34, 0.45, 0.21));
      roadCol *= clamp(roadFloorL / max(dot(roadCol, vec3(0.34, 0.45, 0.21)), 1e-4), 1.0, 2.2);
      roadCol = mix(roadCol, vec3(dot(roadCol, vec3(0.34, 0.45, 0.21))), floorK > 0.0 ? 0.12 : 0.26);
      // ground lane (2026-10-03, the gauntlet: the winter road was "a flat chocolate-brown slab laid into pristine
      // snow"): a winter road is packed snow, greyer and smoother than the field, with brown slush churned into the two
      // wheel tracks and spattered between them
      if (uReduxD.y > 1.5) {
        vec3 packedSnow = uMeanG.rgb * vec3(0.84, 0.85, 0.87) * (0.94 + 0.12 * n1h);
        // (roads lane, wave 341's packing note: the pads' ruts "dark brown stripes on white snow") a pad's vehicle tracks
        // are snow pressed hard — greyer, glazed — with slush churned through to the ground only in stretches
        float padSlush = padRut * smoothstep(0.55, 0.80, nz(uv, 0.05, vec2(0.61, 0.17)).g);
        float slush = clamp(lane * rutAmp * 1.25 + padSlush * 1.10 + crown * 0.10 + (roadBite.y + 0.5) * 0.18, 0.0, 1.0);
        roadCol = mix(packedSnow, roadCol * 1.05, slush);
        roadCol = mix(roadCol, packedSnow * vec3(0.80, 0.82, 0.86), (padRut - padSlush) * 0.85);
      }
      a.rgb = mix(a.rgb, roadCol, dW);
      // (the Redrock lane, round 10, splat.roadRuts: the wheel lanes darker where they are worn deep, and gravel strewn on
      // the crown between them near the camera — the carriageway's own stones, not a smooth smear)
      if (uRoadRuts.y + uRoadRuts.z > 0.0) {
        a.rgb *= 1.0 - uRoadRuts.y * lane * rutAmp * dW;
        float grit = nz(uv, 2.3, vec2(0.71, 0.13)).r;
        float gritW = uRoadRuts.z * dW * (1.0 - 0.7 * lane) * (1.0 - smoothstep(25.0, 70.0, camDist)) * tileVis(0.43);
        a.rgb *= 1.0 - 0.30 * smoothstep(0.66, 0.88, grit) * gritW + 0.14 * (1.0 - smoothstep(0.04, 0.22, grit)) * gritW;
      }
      // (a pad's vehicle ruts darken its packed ground here: a road's own wheel lanes give way to their trodden middle
      // past a 0.08 m footprint, which a pad seen low across its 30-60 m loses at once)
      a.rgb *= 1.0 - padRut * (uReduxD.y > 1.5 ? 0.06 : 0.20); // (roads lane: the rut tone below darkens them a second time)
      // (and the ground the tracks churned: darker, damper patches along them)
      a.rgb *= 1.0 - 0.14 * apronK * smoothstep(0.50, 0.80, nzq(uv, 0.12, vec2(0.37, 0.61)).x) * (1.0 - gRoadTex);
      // The sourced dirt normal contains deep clod/pothole forms intended for
      // open ground. Repeating it at full strength down a road produced the
      // alternating chain of black ovals visible in Verdant. Use a strongly
      // mip-smoothed, shallow packed-earth normal for the road core; the mask
      // gradient below adds the authored wheel-rut relief afterwards.
      vec2 packedRoadN = nrmOn ? groundNrm(uNrmD, uv * 0.210, df, mipB + 4.0).xy : vec2(0.5);
      packedRoadN = mix(vec2(0.5), packedRoadN, 0.30);
      n.xy = mix(n.xy, packedRoadN, dW);
    }
    // Ground lane (2026-10-03): the road's own surface. Its tone drifts along it — a damp stretch, a dusty one, a
    // gravelled patch every 10–40 m; on stretches of a vegetated map's farm road a weedy crown grows between the wheel
    // tracks; and water stands in the ruts' low spots as puddles ringed with mud (dark, smooth, a mirror of the sky).
    if (dW > 0.002) {
      vec2 drift = nzq(uv, 0.034, vec2(0.61, 0.29));
      a.rgb *= mix(1.0, 0.86 + drift.x * 0.28, dW);
      a.rgb = mix(a.rgb, a.rgb * vec3(1.04, 1.02, 0.95), smoothstep(0.55, 0.85, drift.y) * dW * 0.6);
      if (uReduxD.y < 0.5) {
        float crownGrass = crown * dW * smoothstep(0.48, 0.66, drift.y) * smoothstep(0.30, 0.62, n1h + roadBite.y * 0.4);
        if (crownGrass > 0.01) {
          vec4 cg = groundSamp(uAlbG, uMeanG, uv * 0.240, df, mipB);
          a = mix(a, cg * vec4(0.92, 0.95, 0.85, 1.0), crownGrass * 0.80);
        }
        float wet = rut * dW * (1.0 - farM * 0.6) * uRoadPuddle;
        float pool = smoothstep(0.62, 0.78, nzq(uv, 0.071, vec2(0.83, 0.11)).x + hollow * 0.18);
        gRoadPuddle = wet * pool;
        float mud = wet * smoothstep(0.52, 0.66, nzq(uv, 0.071, vec2(0.83, 0.11)).x + hollow * 0.18) * (1.0 - gRoadPuddle);
        a.rgb *= 1.0 - 0.30 * mud;
        a.rgb = mix(a.rgb, a.rgb * 0.34 + vec3(0.006, 0.008, 0.010), gRoadPuddle);
        n.xy = mix(n.xy, vec2(0.5), gRoadPuddle);
      }
    }
    // roads lane R1a (2026-10-09; owner: "make sure roads and stuff are really good", R029 "the roads are so flat"; the
    // gauntlet: "flat grey or near-black roads", "a flat smeared pink-brown band with no ruts, ridges or tyre marks",
    // Redrock's "smeared tracks"): the carriageway as a worked surface — the wheel ruts as grooves (a floor, steep walls,
    // the soil squeezed up in a lip beside each, the floor beside the sun's wall in the wall's shadow) instead of two soft
    // painted bands; the vehicles' treads printed in their floors; the crown and camber; the grader's windrow of loose
    // stone at the edge; stones strewn on the crown and the edges and swept out of the wheel paths; potholes, puddled on
    // a wet map; washboard on an arid track. Each term holds while its feature spans enough pixels across its own
    // direction (stripeVis: a groove seen down the road holds far past tileVis's grazing major axis) and fades to tone
    vec2 acrU = gradD / max(length(gradD), 0.25);
    float wR = roadCore * (1.0 - gRoadTex);
    // (the tier: Low draws none of it, Medium the grooves alone, High everything)
    if (dW > 0.002 && wR > 0.002 && uRoadSurf.x + uRoadSurf.y + uRoadSurf.z + uRoadSurfB.x > 0.0 && uLandTier > 0.5) {
      float e = dRoad - 1.55 - laneWob, ae = abs(e), se = e < 0.0 ? -1.0 : 1.0;
      float fwA = max(abs(dot(gDwX, acrU)) + abs(dot(gDwY, acrU)), 1e-4);
      float relV = stripeVis(0.60, acrU) * uRoadSurf.x;
      grooveRel = relV * wR;
      rutShade = mix(1.0, uRoadSurfB.z, grooveRel);
      // (1) the profile across the road, metres: h = -depth·groove + lip·lip + crown + windrow
      float wg = 0.30, sw = max(0.09, 1.6 * fwA);
      float tW = clamp((ae - (wg - sw)) / (2.0 * sw), 0.0, 1.0);
      float groove = 1.0 - tW * tW * (3.0 - 2.0 * tW);
      float depth = (0.035 + 0.05 * rutAmp) * min(uRoadRuts.x, 1.5);
      float lipX = (ae - wg - sw - 0.08) / 0.11;
      float lip = exp(-lipX * lipX) * (se > 0.0 ? 1.0 : 0.7) * rutAmp;
      float hwv = max(roadHalfB, 2.6);
      float wX = (dRoad - hwv + 0.10) / 0.28;
      float windrow = exp(-wX * wX) * uRoadSurfB.w * roadCore;
      float dh = depth * 6.0 * tW * (1.0 - tW) / (2.0 * sw) * se
        - 0.04 * 2.0 * lipX / 0.11 * lip * se
        - 0.10 * dRoad / (hwv * hwv) * roadCore
        - 0.035 * 2.0 * wX / 0.28 * windrow;
      // (R2, the first frames: seen from 12–16 m up the grooves' walls and their shadow drew two thin dark lines — the
      // gauntlet's old "ink lines") a wall ~0.15 m across holds while it spans enough pixels across the road; past that the
      // groove is its soft floor tone alone
      float wallV = stripeVis(2.4, acrU);
      if (nrmOn) n.xy -= 0.5 * dh * acrU * relV * wallV * (1.0 - gRoadTex);
      // the floor compacted and cleaner, the lip loose and paler; the floor beside the wall on the sun's side shaded by it
      float sunA = dot(uSunDirW.xz, acrU);         // > 0: the sun stands outward of the road, its light falls inward
      float shL = depth * abs(sunA) / max(uSunDirW.y, 0.08);
      float uS = sunA >= 0.0 ? e : -e;             // the wall on the sun's side at uS = +wg
      float shade = groove * smoothstep(wg - shL - sw, wg - shL + sw, uS) * step(0.02, abs(sunA));
      // (r4 frames: near the camera the grooves read as black channels on Monsoon and Amberford) the wall's shadow and the
      // floor's tone held soft — the relief's own shading carries most of the groove
      a.rgb *= 1.0 - (0.045 * groove * rutAmp + (0.14 * shade - 0.05 * lip) * wallV - 0.05 * windrow) * relV * wR;
      // (2) the treads printed in a rut's floor: a tank's track plates (0.16 m pitch) or a lorry's chevrons (0.128 m),
      // one vehicle's print a 9 m stretch (both its ruts), some stretches worn smooth — laid in the road frame
      if (gRoadFrameW > 0.5 && uRoadSurf.w > 0.0 && uLandTier > 1.5) {
        // (R2: the first frames' treads read as a ruled ladder down whole ruts) a print holds a few metres where the last
        // vehicle passed, worn in and out (field b at 0.09), its bars uneven, centred in the groove's floor
        vec2 ph = cellHash2(vec2(floor(gRoadS / 9.0), 7.0));
        float chevron = step(0.55, ph.x);
        float pitch = mix(0.16, 0.128, chevron);
        float floorW = 1.0 - smoothstep(0.08, 0.24, ae);
        float hold = smoothstep(0.45, 0.70, nz(vec2(gRoadS, ae * 4.0), 0.09, vec2(0.17, 0.59)).g);
        float tv = stripeVis(pitch, gRoadAlong) * floorW * hold * step(ph.x, 0.62) * rutAmp * uRoadSurf.w * gRoadFrameW * wR;
        if (tv > 0.01) {
          float barI = floor((gRoadS + chevron * 0.55 * ae) / pitch);
          float phase = 6.2831853 * ((gRoadS + chevron * 0.55 * ae) / pitch + ph.y);
          float barK = 0.45 + 0.55 * cellHash2(vec2(barI, ph.y * 97.0)).x;
          if (nrmOn) n.xy += 0.5 * 0.006 * (6.2831853 / pitch) * sin(phase) * gRoadAlong * tv * barK;
          a.rgb *= 1.0 - 0.03 * (0.5 - 0.5 * cos(phase)) * tv * barK;
        }
      }
      // (3) stones: one candidate a 0.12 m cell, strewn on the crown and the edges, swept out of the wheel paths; past
      // their own pixels, their speckle
      if (uRoadSurf.y > 0.0 && uLandTier > 1.5) {
        float crownW = 1.0 - smoothstep(0.5, 1.1, dRoad);
        float edgeW = smoothstep(hwv - 1.4, hwv - 0.2, dRoad);
        float dens = uRoadSurf.y * (0.06 + 0.30 * crownW + 0.34 * edgeW + 0.40 * windrow) * (1.0 - 0.8 * groove);
        float sv = tileVis(0.12);
        if (sv > 0.01) {
          vec2 sp = wp.xz / 0.12, sci = floor(sp), scf = fract(sp);
          vec2 h1 = cellHash2(sci + vec2(19.0, 3.0));
          if (h1.x < dens) {
            vec2 h2 = cellHash2(sci + vec2(-7.0, 41.0));
            vec2 dv = (scf - (0.30 + 0.40 * h2)) / (0.14 + 0.16 * h1.y);
            float q = dot(dv, dv);
            if (q < 1.6) {
              float body = 1.0 - smoothstep(0.80, 1.0, q);
              vec3 stoneC = mix(uMeanR.rgb, a.rgb, 0.35) * (0.70 + 0.55 * h2.x);
              a.rgb = mix(a.rgb, stoneC, body * sv * wR);
              a.rgb *= 1.0 - 0.30 * smoothstep(0.85, 1.0, q) * (1.0 - smoothstep(1.0, 1.6, q)) * sv * wR; // its seat's shadow
              if (nrmOn) n.xy += 0.5 * dv * 0.9 * body * sv * wR;
            }
          }
        }
        float gritV = tileVis(0.43) * (1.0 - sv) * (1.0 - smoothstep(30.0, 80.0, camDist));
        if (gritV > 0.01) {
          float grit = nz(uv, 2.3, vec2(0.71, 0.13)).r;
          a.rgb *= 1.0 - (0.22 * smoothstep(0.66, 0.88, grit) - 0.10 * (1.0 - smoothstep(0.04, 0.22, grit))) * min(dens * 1.6, 1.0) * gritV * wR;
        }
      }
      // (4) potholes: one candidate a 5 m world cell, an oval bowl 0.6–1.8 m long down the road, its floor damp and, on a
      // wet map, holding water; its rim of crumbs paler
      if (uRoadSurf.z > 0.0 && uLandTier > 1.5) {
        float hv = tileVis(1.2);
        vec2 pci = floor(wp.xz / 5.0);
        vec2 p1 = cellHash2(pci + vec2(61.0, 17.0));
        if (hv > 0.01 && p1.x < 0.16 * uRoadSurf.z) {
          vec2 p2 = cellHash2(pci + vec2(5.0, 89.0));
          vec2 pc = (pci + 0.25 + 0.5 * p2) * 5.0;
          vec2 al = gRoadFrameW > 0.5 ? gRoadAlong : vec2(-acrU.y, acrU.x);
          vec2 dq = wp.xz - pc;
          vec2 pe = vec2(dot(dq, al) / (0.30 + 0.60 * p1.y), dot(dq, vec2(-al.y, al.x)) / (0.28 + 0.40 * p2.y));
          float q = dot(pe, pe);
          if (q < 1.5) {
            float bowl = q < 1.0 ? (1.0 - q) * (1.0 - q) : 0.0;
            float rim = smoothstep(0.85, 1.05, q) * (1.0 - smoothstep(1.05, 1.5, q));
            float pw = hv * wR;
            if (nrmOn && q < 1.0) {
              vec2 gq = 2.0 * vec2(pe.x / (0.30 + 0.60 * p1.y), pe.y / (0.28 + 0.40 * p2.y));
              vec2 gw = gq.x * al + gq.y * vec2(-al.y, al.x);    // ∇q in world xz
              n.xy -= 0.5 * (0.10 * 2.0 * (1.0 - q)) * gw * pw;  // h = -0.10·(1 - q)², ∇h = 0.20·(1 - q)·∇q
            }
            a.rgb *= 1.0 - (0.22 * bowl - 0.07 * rim) * pw;
            if (uReduxD.y < 0.5) {
              // (R2: a whole-sky mirror in a small oval read as a blue paint dot) muddy water — its own brown, half the gloss
              float pond = smoothstep(0.30, 0.70, bowl) * uRoadPuddle * pw;
              a.rgb = mix(a.rgb, a.rgb * 0.42 + uMeanD.rgb * 0.10, pond);
              n.xy = mix(n.xy, vec2(0.5), pond);
              gRoadPuddle = max(gRoadPuddle, pond * 0.45);
            }
          }
        }
      }
      // (5) washboard: corrugations across an arid track every 0.8 m, in stretches, strongest in the wheel paths
      if (uRoadSurfB.x > 0.0 && gRoadFrameW > 0.5 && uLandTier > 1.5) {
        float wv = stripeVis(0.8, gRoadAlong) * uRoadSurfB.x * gRoadFrameW * wR
          * smoothstep(0.42, 0.62, nz(uv, 0.011, vec2(0.27, 0.59)).g) * (0.55 + 0.45 * lane);
        if (wv > 0.01) {
          float wph = 6.2831853 * gRoadS / 0.8;
          if (nrmOn) n.xy += 0.5 * 0.025 * (6.2831853 / 0.8) * sin(wph) * gRoadAlong * wv;
          a.rgb *= 1.0 + 0.04 * cos(wph) * wv;
        }
      }
    }
    // Keep compacted wheel lanes legible without painting near-black marks
    // into the road albedo. The previous 55% dirt-road multiplier turned the
    // low-resolution rut mask into a repeating chain of oval stains on every
    // country-road map. Dirt now relies primarily on shallow normal relief;
    // paved roads retain a little more tonal wear.
    // road pass 2026-09-12: the two-track read is back (1049e4e ran 0.55/0.30)
    // now that the lanes are analytic and continuous: dark damp compacted
    // lanes that run slightly less rough, a paler dusty crown between them,
    // and the far boost that keeps the lanes legible once the tiles mip away.
    // (wave 69: the far boost drew the two lanes as ruled lines across a whole establishing view — hold 26 still showed
    // them ruled at 150–300 m) a lane half a metre wide spans under three pixels past a 0.15 m footprint, and seen from a
    // ridge a country road's two tracks merge into one trodden, darker middle — so past it the lanes give way to a broad
    // soft band over the carriageway's middle third (no stripes), the tracks' own darkening near the camera
    float laneFar = smoothstep(0.08, 0.28, gFootM) * (1.0 - gRoadTex);
    float trodMid = (1.0 - smoothstep(0.6, 2.4, dRoad)) * roadCore * rutAmp;
    a.rgb *= 1.0 - min(mix(rut * rutShade, trodMid * 0.55, laneFar), 1.0) * mix(0.34, 0.26, gRoadTex);
    a.a = mix(a.a, a.a * 0.86, rut * (1.0 - gRoadTex));
    a.rgb *= 1.0 + crown * 0.05 * (1.0 - gRoadTex);
    if (gRoadTex > 0.01) {
      // r5: HARDER pavement edge (0.10-0.26 with less noise wobble) — paved
      // town streets end at a kerb line, they do not alpha-fade into lawn.
      // Patch/repair tone variation breaks the uniform sett sheet.
      // r6: harder pavement edge (0.15-0.24, noise wobble halved) — the wide
      // noise-feathered 0.10-0.26 ramp read as water-eroded banks; a paved
      // street must end on a near-kerb line
      float paveCore = smoothstep(0.15, 0.24, mk.r + (n1hs - 0.5) * 0.025) * gRoadTex;
      // roads lane R1c (2026-10-09; owner: the roads "need to look a lot better, especially paved ones"; the gauntlet:
      // Steinburg's street "a flat near-black band … no cobble, kerb, wear", its square "a uniform grey cobble plane",
      // Suzhou Creek's "navy-black asphalt plane", Ruinspires' "featureless blue-grey asphalt"): the surface here is a
      // styled path's own, else the map's paved class (splat.pavedSurface: its streets, and its squares off any
      // centreline), else the R layer's print as before (and the airfield's slabs) — each drawn in the road's frame
      // a kerbed town's streets paved out to the kerbs' face (props.ts KERB_OFFSET_M 5.05: splat.pavedSurface.kerbs)
      float paveTownW = 0.0;
      if (uPaveTown.z > 0.0 && uLandTier > 0.5) {
        vec2 tq = abs(wp.xz - uPaveTown.xy) - uPaveTown.zw;
        paveTownW = 1.0 - smoothstep(0.0, 6.0, max(tq.x, tq.y));
        paveCore = max(paveCore, paveTownW * (1.0 - smoothstep(4.95, 5.10, dRoad)) * gRoadTex * step(dRoad, 11.9));
      }
      float onStreet = max(1.0 - smoothstep(roadHalf + 0.6, roadHalf + 2.4, dRoad), paveTownW * (1.0 - smoothstep(5.1, 5.4, dRoad)));
      float streetCls = paveTownW > 0.5 && uPaveExtra.y > 0.5 ? uPaveExtra.y : uPaveClass.x;
      float pCls = gRoadClass > 0.5 && abs(gRoadClass - 4.0) > 0.5 ? gRoadClass : (onStreet > 0.5 ? streetCls : uPaveClass.y);
      if (uLandTier < 0.5) pCls = gRoadClass > 0.5 && gRoadClass < 3.5 ? gRoadClass : 0.0; // (Low: the old law)
      vec4 pav = vec4(0.0), pnn = NRM_MEAN;
      if (pCls < 0.5) {
        pav = splatSamp(uAlbR, uv * 0.31, df, mipB, uMeanR);
        pnn = splatSamp(uNrmR, uv * 0.31, df, mipB, NRM_MEAN);
        pnn.z = 0.5;
        float pvar = nz(uv, 0.037, vec2(0.77, 0.19)).r; // NB: "patch" is a reserved word in GLSL ES
        // r6: 0.86+0.26 -> 0.72+0.22 — the near-white sett sheet under a blue
        // sky ambient read as a frozen canal; darker worn stone keeps the
        // street below the facade value range
        pav.rgb *= 0.72 + smoothstep(0.35, 0.75, pvar) * 0.22;
        if (uPaveSlab.x > 0.0) {
          // maps lane B (2026-10-03, the gauntlet: Kestrel Airfield's apron "reads as a cobbled plaza"): airfield
          // concrete in place of the map's sett print — square slabs with sealed expansion joints, a tone per slab (pours
          // of different age), the aggregate's mottle, oil and fuel stains, and rubber streaks along the runway's axis
          vec2 slabP = wp.xz / uPaveSlab.x;
          vec2 slabH = cellHash2(floor(slabP));
          vec2 slabF = fract(slabP);
          vec2 jointD = min(slabF, 1.0 - slabF) * uPaveSlab.x;
          vec2 jointFw = max(fwidth(wp.xz), vec2(1e-4));
          vec2 jointL = 1.0 - smoothstep(vec2(uPaveSlab.y) - jointFw, vec2(uPaveSlab.y) + jointFw, jointD);
          float joint = max(jointL.x, jointL.y) * tileVis(uPaveSlab.x);
          vec3 conc = vec3(dot(uMeanR.rgb, vec3(0.30, 0.59, 0.11))) * vec3(1.03, 1.01, 0.97);
          conc *= 0.88 + slabH.x * 0.18;
          conc *= 0.92 + nz(uv, 0.23, vec2(0.29, 0.63)).r * 0.16;
          float stain = smoothstep(0.64, 0.84, nzq(uv, 0.11, vec2(0.17, 0.41)).x) * uPaveSlab.z;
          stain = max(stain, smoothstep(0.80, 0.96, slabH.y) * smoothstep(0.45, 0.75, nz(uv, 0.37, vec2(0.83, 0.07)).g) * uPaveSlab.z);
          conc *= 1.0 - stain * 0.40;
          // (the noise stretched 150:1 along the runway's x axis, read at the across-axis scale's explicit LOD; faint, as
          // the slab roads up from the valleys run across that axis)
          float tyre = smoothstep(0.70, 0.86, nz(vec2(wp.x * 0.00677, wp.z), 0.31, vec2(0.0)).r)
            * smoothstep(0.40, 0.66, nz(uv, 0.006, vec2(0.37, 0.91)).g) * uPaveSlab.w;
          conc *= 1.0 - tyre * 0.22;
          conc *= 1.0 - joint * 0.55;
          pav = vec4(conc, mix(0.86, 0.60, stain));
          pnn = NRM_MEAN;
        }
      } else if (uLandTier < 0.5) {
        // (the Low tier — the phones' default — draws a styled path by the law before the roads lane, verbatim)
        // (2026-10-05) a styled path's own surface (terrain.ts RoadPathStyle), in the road's frame: setts in courses
        // across it, or asphalt — dark and even, the wheel paths polished paler, oil down the lanes' middles — and, patched,
        // its repairs (newer darker, older paler and greyer, their seams sealed) and the old surface's cracks
        if (gRoadClass > 0.5 && gRoadClass < 3.5) {
          vec2 rq = vec2(dot(wp.xz, gRoadDir), dot(wp.xz, vec2(-gRoadDir.y, gRoadDir.x)));
          if (gRoadClass > 1.5 && gRoadClass < 2.5) {
            // setts: courses 0.16 m along the road, setts 0.18–0.26 m across, the joints staggered course to course
            float course = rq.x / 0.16, ci = floor(course);
            vec2 cr = cellHash2(vec2(ci, 17.0));
            float sw = 0.18 + 0.08 * cr.y;
            float sc = (rq.y + cr.x * sw) / sw, si = floor(sc);
            vec2 sh = cellHash2(vec2(ci, si + 311.0));
            vec2 sf = vec2(fract(course) * 0.16, fract(sc) * sw);
            float edgeD = min(min(sf.x, 0.16 - sf.x), min(sf.y, sw - sf.y));
            float settVis = tileVis(0.35);
            float jointS = (1.0 - smoothstep(0.010, 0.018 + 0.5 * gFootM, edgeD)) * settVis;
            vec3 sett = vec3(0.128, 0.125, 0.119) * (0.78 + 0.44 * sh.x) * vec3(1.0 + 0.08 * (sh.y - 0.5), 1.0, 1.0 - 0.06 * (sh.y - 0.5));
            pav = vec4(mix(mix(vec3(0.112, 0.109, 0.104), sett, settVis), vec3(0.040, 0.036, 0.031), jointS), 0.88);
            // a sett's worn, rounded top
            vec2 st2 = vec2(sf.x / 0.16 - 0.5, sf.y / sw - 0.5);
            pnn = vec4(vec2(0.5) + (st2.x * gRoadDir + st2.y * vec2(-gRoadDir.y, gRoadDir.x)) * 0.45 * settVis * (1.0 - jointS), 0.5, 1.0);
          } else {
            float agg = nz(uv, 1.9, vec2(0.31, 0.57)).r;
            vec3 asph = vec3(0.068, 0.068, 0.072) * (0.92 + 0.16 * agg);
            float laneP = abs(fract(rq.y / 3.5) - 0.5) * 3.5; // metres from a 3.5 m lane's middle
            float wheelP = (laneP - 0.95) / 0.35;
            asph *= 1.0 + 0.10 * exp(-wheelP * wheelP) * tileVis(1.0);
            asph *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.45, laneP)) * smoothstep(0.55, 0.80, nz(uv, 0.21, vec2(0.13, 0.71)).g);
            if (gRoadClass > 2.5) {
              vec2 pc = vec2(rq.x / 4.2, rq.y / 2.4), pcI = floor(pc), pcF = fract(pc);
              vec2 ph = cellHash2(pcI + vec2(53.0, 7.0));
              float inPatch = step(ph.x, 0.38);
              vec2 pe = min(pcF, 1.0 - pcF) * vec2(4.2, 2.4);
              float seam = (1.0 - smoothstep(0.03, 0.06 + gFootM, min(pe.x, pe.y))) * inPatch * tileVis(0.6);
              asph = mix(asph, ph.y > 0.5 ? asph * 0.78 : mix(asph, vec3(0.13, 0.128, 0.122), 0.55), inPatch);
              asph *= 1.0 - 0.45 * seam;
              float crack = (1.0 - smoothstep(0.0, 0.02 + gFootM, abs(nz(uv, 0.9, vec2(0.71, 0.29)).r - 0.5) * 0.12))
                * (1.0 - inPatch) * tileVis(0.5) * 0.5;
              asph *= 1.0 - crack;
            }
            pav = vec4(asph, 0.80);
            pnn = NRM_MEAN;
          }
        }
      } else {
        // the road's own frame on a street (along: the running length; across: signed metres off the centreline, its side
        // from the distance field's gradient), the world's axes on a square off any centreline
        bool fr = gRoadFrameW > 0.5 && onStreet > 0.5;
        vec2 al = fr ? gRoadAlong : vec2(1.0, 0.0), pr = vec2(-al.y, al.x);
        vec2 rq = fr ? vec2(gRoadS, gRoadYOk > 0.5 ? gRoadY : dRoad * (dot(gradD, pr) < 0.0 ? -1.0 : 1.0)) : wp.xz;
        float fwP = max(gFootM, 1e-3);
        // the wheel paths of a two-lane street: 0.85 m either side of each 3.2 m lane's middle
        float wpX = (abs(abs(rq.y) - 1.6) - 0.85) / 0.32;
        float wheelW = fr ? exp(-wpX * wpX) : 0.0;
        vec2 pN = vec2(0.0);
        if (abs(pCls - 2.0) < 0.5) {
          // SETTS — courses across the road (or the segmental arcs of a German street, uPaveClass.z), a course 0.17 m
          // along, its setts 0.17–0.26 m across and staggered course to course; each sett its own stone of one rock (its
          // greys ±12 %, a faint warm or cool cast on some), its top domed and worn round, the wheel tracks grimed darker,
          // some sunk or tilted, one in a hundred and twenty lost; the joints sand and grit, mossed where no wheel runs.
          // (R2, the first frames: Ironworks' setts read "a tiled bathroom" near and a smooth pale band past 20 m.) Each
          // joint direction holds while its own lines span enough pixels — the joints along the road (between a course's
          // setts) stay as streaks far down the street where the courses' joints, foreshortened, fade — and past both the
          // stone's tone and the joints' average carry an irregular drift of the ground (relaid stretches, wear) and the
          // map's own stone tone (uPaveExtra.x: Ironworks' sooty basalt, Ronda's pale limestone)
          vec2 sq = rq;
          if (mod(uPaveClass.z, 2.0) > 0.5) { float cc = (fract(sq.y / 2.6) - 0.5) * 2.6; sq.x += 1.7 - sqrt(2.89 - cc * cc); }
          float course = sq.x / 0.17, ci = floor(course);
          vec2 cr = cellHash2(vec2(ci, 17.0));
          float swd = 0.17 + 0.09 * cr.y;
          float sc = (sq.y + cr.x * swd) / swd, si = floor(sc);
          vec2 sh = cellHash2(vec2(ci, si + 311.0));
          vec2 sf = vec2(fract(course) * 0.17, fract(sc) * swd);
          float vC = stripeVis(0.17, al), vL = stripeVis(0.22, pr);
          float sv = max(vC, vL), svs = min(vC, vL);
          float jw = 0.007 + 0.005 * sh.y;
          float jC = (1.0 - smoothstep(jw, jw + 0.004 + 0.6 * fwP, min(sf.x, 0.17 - sf.x))) * vC;
          float jL = (1.0 - smoothstep(jw, jw + 0.004 + 0.6 * fwP, min(sf.y, swd - sf.y))) * vL;
          // (r4 frames: a square's joints along the view still ruled it in fine stripes 20–50 m out — a corduroy) the joints'
          // dust lightens them toward the stones' own tone with distance
          float jointS = max(jC, jL) * (1.0 - 0.7 * smoothstep(9.0, 32.0, camDist));
          vec3 stone = vec3(0.150, 0.146, 0.139) * (0.88 + 0.24 * sh.x)
            * mix(vec3(1.0), sh.y > 0.5 ? vec3(1.04, 1.0, 0.95) : vec3(0.96, 0.99, 1.04), 0.6 * fract(sh.x * 3.7));
          stone *= 1.0 - 0.12 * wheelW; // (wave 333: worn wheel tracks darker, grimed with rubber and oil)
          float mossy = (1.0 - wheelW) * smoothstep(0.45, 0.75, nz(uv, 0.08, vec2(0.21, 0.63)).g);
          vec3 jointC = mix(mix(stone * 0.42, uMeanD.rgb * 0.55, 0.5), uMeanG.rgb * 0.62, mossy * 0.6);
          float lost = step(0.992, sh.y) * svs;
          vec3 settMean = mix(vec3(0.150, 0.146, 0.139), jointC, 0.20) * (1.0 - 0.10 * wheelW);
          vec3 col = mix(settMean, stone, sv);
          col = mix(col, jointC, jointS);
          col *= 0.94 + 0.12 * nzq(uv, 0.35, vec2(0.23, 0.41)).x;
          if (fr) col *= 1.0 - 0.14 * (1.0 - smoothstep(0.0, 0.45, abs(abs(rq.y) - 1.6))) * smoothstep(0.50, 0.78, nz(uv, 0.21, vec2(0.13, 0.71)).g);
          col = mix(col, jointC * 0.6, lost);
          col *= uPaveExtra.x;
          pav = vec4(col, mix(0.86, 0.68, wheelW * (1.0 - jointS)));
          vec2 st2 = vec2(sf.x / 0.17 - 0.5, sf.y / swd - 0.5);
          vec2 tilt = (cellHash2(vec2(si, ci) + 3.7) - 0.5) * 0.18;
          pN = ((st2.x * 0.55 + tilt.x) * al + (st2.y * 0.55 + tilt.y) * pr) * (1.0 - jointS) * (1.0 - lost) * svs;
        } else if ((pCls > 4.5 && pCls < 5.5) || pCls > 6.5) {
          // BRICK — clinker (5: the Dutch dyke road's klinkers in herringbone across the road, sand-jointed, red-brown to
          // purple) or brick soling (7: the char's herringbone of common brick, broken and mud-dressed)
          bool soling = pCls > 6.5;
          float bw = soling ? 0.115 : 0.10;
          vec2 hq = vec2(rq.x + rq.y, rq.y - rq.x) * 0.70710678 / bw;   // 45° to the road
          vec2 hc = floor(hq), hf = fract(hq);
          float hd = mod(hc.x - hc.y, 4.0);
          vec2 lp, sz = vec2(2.0, 1.0), bid = hc;
          if (hd < 0.5) lp = hf;
          else if (hd < 1.5) { lp = vec2(hf.x + 1.0, hf.y); bid = hc - vec2(1.0, 0.0); }
          else if (hd < 2.5) { lp = vec2(hf.x, hf.y + 1.0); sz = vec2(1.0, 2.0); bid = hc - vec2(0.0, 1.0); }
          else { lp = hf; sz = vec2(1.0, 2.0); }
          vec2 bh = cellHash2(bid + vec2(sz.x * 13.0, 5.0));
          float bEdge = min(min(lp.x, sz.x - lp.x), min(lp.y, sz.y - lp.y)) * bw;
          float bv = tileVis(bw * 2.0);
          float jointB = (1.0 - smoothstep(0.005, 0.009 + 0.6 * fwP, bEdge)) * bv;
          // (R2, the first frames: Jade River's soling a saturated orange tile floor near and a smooth salmon band past
          // 10 m) weathered brick — dust-browned, ±18 % brick to brick, the joints filled with the road's own dust — under
          // an irregular drift, the wheel tracks smoothed and darkened, and on a soling road its broken stretches: holes
          // 0.5–2 m where the bricks are gone, mud in their floors, loose bricks round them
          vec3 brick = soling ? vec3(0.212, 0.122, 0.086) : vec3(0.150, 0.082, 0.066);
          brick *= 0.88 + 0.24 * bh.x;
          brick = mix(brick, brick * vec3(0.82, 0.80, 0.90), step(0.88, bh.y));     // the burnt purple ones
          brick = mix(brick, brick * vec3(1.14, 1.08, 0.96), step(0.90, fract(bh.x * 6.7)) * (soling ? 1.0 : 0.0));
          vec3 jointC = soling ? mix(brick * 0.75, uMeanD.rgb * 0.95, 0.6) : vec3(0.22, 0.20, 0.16);
          vec3 bMean = mix(soling ? vec3(0.195, 0.116, 0.084) : vec3(0.140, 0.080, 0.067), jointC, 0.22);
          vec3 col = mix(bMean, mix(brick, jointC, jointB), bv);
          col *= 0.92 + 0.16 * nzq(uv, 0.35, vec2(0.61, 0.23)).x;
          col *= 1.0 - 0.12 * wheelW;
          float broken = soling ? step(0.90, bh.y) * bv : 0.0;           // a brick gone or broken: the mud under it
          if (soling) {
            vec2 hci = floor(wp.xz / 4.0);
            vec2 hh = cellHash2(hci + vec2(37.0, 71.0));
            if (hh.x < 0.22) {
              vec2 hh2 = cellHash2(hci + vec2(3.0, 19.0));
              vec2 hc0 = (hci + 0.25 + 0.5 * hh2) * 4.0;
              float hr = 0.35 + 0.65 * hh.y;
              // (r4 frames: the holes read as smooth dark ovals) their edges as ragged as lost bricks leave them — the outline
              // stepped along the brick courses and broken by two noise octaves, the mud's edge soft where it creeps out
              float hdist = length((wp.xz - hc0) * vec2(1.0, 1.0 + 0.6 * hh2.x)) + (nz(uv, 1.3, vec2(0.71, 0.43)).g - 0.5) * 0.50
                + (nz(uv, 4.3, vec2(0.29, 0.13)).r - 0.5) * 0.18 + (bh.x - 0.5) * 0.16;
              float hole = 1.0 - smoothstep(hr - 0.10, hr + 0.06 + fwP, hdist);
              float loose = (1.0 - smoothstep(hr, hr + 0.35, hdist)) * (1.0 - hole) * step(0.6, bh.x);
              broken = max(broken, hole * tileVis(0.6));
              col = mix(col, col * 0.85, loose * 0.6);
            }
          }
          col = mix(col, uMeanD.rgb * 0.58, broken);
          // the dust and mud the traffic spreads over it (a soling road between its fields; a dyke road's sand in the joints)
          float dressing = soling ? 0.25 + 0.35 * smoothstep(0.40, 0.70, nz(uv, 0.06, vec2(0.33, 0.17)).g) : 0.10;
          col = mix(col, uMeanD.rgb * vec3(1.0, 0.97, 0.92), dressing * (1.0 - 0.5 * wheelW));
          pav = vec4(col, mix(0.88, 0.95, broken));
          vec2 bq = (lp / sz - 0.5);
          vec2 hb = vec2(bq.x - bq.y, bq.x + bq.y) * 0.70710678;          // back from the 45° frame
          vec2 tiltB = (bh - 0.5) * (soling ? 0.22 : 0.08);
          pN = ((hb.x * 0.35 + tiltB.x) * al + (hb.y * 0.35 + tiltB.y) * pr) * (1.0 - jointB) * bv * (1.0 - broken);
        } else if (abs(pCls - 6.0) < 0.5) {
          // CONCRETE — a lane road in slabs: sawn transverse joints every 4.5 m, the centre joint, each slab its own pour
          // (tone), the aggregate's speckle, a corner crack in some, rubber darkening the wheel paths, the joints sealed
          float slabL = 4.5;
          float si2 = floor(rq.x / slabL), side2 = rq.y < 0.0 ? 0.0 : 1.0;
          vec2 slh = cellHash2(vec2(si2, side2 + 37.0));
          float jx = abs(fract(rq.x / slabL) - 0.5) * slabL;
          float jT = 1.0 - smoothstep(slabL * 0.5 - 0.012, slabL * 0.5 - 0.012 + fwP + 0.004, jx);
          float jL = fr ? 1.0 - smoothstep(0.012, 0.016 + fwP, abs(rq.y)) : 0.0;
          float jointC2 = max(jT, jL) * tileVis(0.5);
          vec3 conc = vec3(0.30, 0.295, 0.28) * (0.86 + 0.20 * slh.x);
          conc *= 1.0 + (nz(uv, 3.1, vec2(0.41, 0.23)).r - 0.5) * 0.22 * tileVis(0.08);
          conc *= 1.0 - 0.16 * wheelW;
          float lc = fract(rq.x / slabL) - 0.5;
          float crackLine = abs((lc * slabL) - (rq.y - (side2 - 0.5) * 2.0) * (slh.y - 0.5) * 2.0);
          float cornerCrack = step(0.70, slh.y) * (1.0 - smoothstep(0.004, 0.006 + fwP, crackLine)) * step(abs(lc), 0.30) * tileVis(0.3);
          conc *= 1.0 - 0.55 * max(jointC2, cornerCrack);
          float stainC = smoothstep(0.66, 0.86, nzq(uv, 0.11, vec2(0.17, 0.41)).x);
          conc *= 1.0 - 0.25 * stainC;
          pav = vec4(conc, mix(0.88, 0.70, wheelW));
        } else {
          // ASPHALT (1) / PATCHED (3) — an aged binder course, mid grey with its aggregate showing; paler and smoother in the
          // wheel paths, dark with drip down the lanes' middles; the centre seam and transverse cracks sealed with tar, a
          // crazed net in the worn wheel paths; repairs cut square along it (a patched street's rule, a few on any), and on
          // a patched street the round fills of old holes; iron covers on the crown and the lanes
          float agg = nz(uv, 1.9, vec2(0.31, 0.57)).r;
          float big = nz(uv, 0.021, vec2(0.17, 0.83)).g;
          vec3 asph = vec3(0.118, 0.116, 0.111) * (0.90 + 0.16 * agg) * (0.88 + 0.24 * big);
          float aggF = nz(uv, 6.1, vec2(0.13, 0.77)).r;
          asph *= 1.0 + (smoothstep(0.62, 0.86, aggF) * 0.45 - smoothstep(0.30, 0.10, aggF) * 0.18) * tileVis(0.06);
          // (R2: the first frames' asphalt "smooth plastic") the aggregate's second octave, the binder bled dark in blotches
          // of a few metres, and on a country road its edge ravelled — the binder gone, the stone paler and broken — before
          // the verge
          float aggG = nz(uv, 13.0, vec2(0.53, 0.29)).r;
          asph *= 1.0 + (aggG - 0.5) * 0.22 * tileVis(0.03);
          asph *= 1.0 - 0.13 * smoothstep(0.56, 0.84, nzq(uv, 0.09, vec2(0.71, 0.37)).x);
          if (fr) {
            float ravel = smoothstep(roadHalf - 1.0, roadHalf - 0.15, dRoad) * (1.0 - paveTownW)
              * smoothstep(0.40, 0.70, nz(uv, 1.1, vec2(0.37, 0.61)).r);
            asph = mix(asph, asph * vec3(1.20, 1.19, 1.15), ravel);
          }
          float laneP = abs(abs(rq.y) - 1.6);
          asph *= 1.0 + 0.09 * wheelW;
          if (fr) asph *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, 0.45, laneP)) * smoothstep(0.50, 0.78, nz(uv, 0.21, vec2(0.13, 0.71)).g);
          float rough = mix(0.82, 0.66, wheelW);
          float crk = 0.0;
          if (fr) {
            float wv = (nz(vec2(rq.x, 0.0), 0.37, vec2(0.71, 0.29)).r - 0.5) * 0.10;
            crk = (1.0 - smoothstep(0.018, 0.018 + fwP, abs(rq.y + wv))) * step(0.5, uPaveWear.y);
            float tci = floor(rq.x / 7.0);
            vec2 th = cellHash2(vec2(tci, 23.0));
            float tx = (tci + 0.15 + 0.7 * th.x) * 7.0 + (nz(vec2(0.0, rq.y), 0.6, vec2(0.11, 0.47)).r - 0.5) * 0.25;
            crk = max(crk, (1.0 - smoothstep(0.008, 0.008 + fwP, abs(rq.x - tx))) * step(0.35, th.y) * step(abs(rq.y), 1.0 + 3.0 * th.y) * uPaveWear.y);
          }
          vec2 cq = rq / 0.26 + (vec2(nz(uv, 0.7, vec2(0.3, 0.1)).g, nz(uv, 0.7, vec2(0.6, 0.9)).g) - 0.5) * 0.9;
          vec2 cf = fract(cq);
          float cE = min(min(cf.x, 1.0 - cf.x), min(cf.y, 1.0 - cf.y)) * 0.26;
          crk = max(crk, (1.0 - smoothstep(0.003, 0.003 + fwP, cE)) * wheelW * smoothstep(0.55, 0.75, big) * uPaveWear.y * tileVis(0.26));
          crk *= tileVis(0.12);
          asph *= 1.0 - 0.55 * crk;
          rough = mix(rough, 0.45, crk * 0.6);
          // the repairs (wave 333 on Suzhou Creek: the patched style's "large pale rectangles read as pasted blocks"): each a
          // cut reinstated by hand — an outline that wanders (field b at 1.4: tongues of 0.2–0.7 m), a newer fill darker and
          // smoother sealed with a thin tar seam, an older one barely off the road's own grey; trench strips along the lanes
          float patchRate = (pCls > 2.5 ? 0.30 : 0.08) * uPaveWear.x;
          vec2 cellS = vec2(7.0, 3.2);
          vec2 pcI = floor(rq / cellS);
          vec2 ph = cellHash2(pcI + vec2(53.0, 7.0));
          float seam = 0.0;
          if (ph.x < patchRate) {
            vec2 ph2 = cellHash2(pcI + vec2(11.0, 29.0));
            vec2 hs = ph2.x > 0.7 ? vec2(2.6 + 0.8 * ph2.y, 0.35 + 0.15 * ph.y) : vec2(0.6 + 1.6 * ph2.y, 0.45 + 0.9 * ph.y);
            vec2 pc0 = (pcI + 0.5) * cellS + (ph2 - 0.5) * max(cellS - 2.0 * hs, vec2(0.0)) * vec2(1.0, 0.8);
            vec2 bd = abs(rq - pc0) - hs;
            float sd = length(max(bd, 0.0)) + min(max(bd.x, bd.y), 0.0) - 0.12;
            sd += (nz(uv, 1.4, vec2(0.19, 0.73)).g - 0.5) * 0.30 + (nz(uv, 4.1, vec2(0.61, 0.07)).r - 0.5) * 0.06;
            float inPatch = 1.0 - smoothstep(-0.01, 0.01 + fwP, sd);
            float newer = step(0.45, ph.y);
            seam = (1.0 - smoothstep(0.012, 0.024 + fwP, abs(sd))) * tileVis(0.4) * newer;
            asph = mix(asph, newer > 0.5 ? asph * 0.84 : asph * vec3(1.05, 1.05, 1.03), inPatch);
            rough = mix(rough, newer > 0.5 ? 0.70 : 0.84, inPatch);
          }
          asph *= 1.0 - 0.30 * seam;
          if (pCls > 2.5 && uPaveExtra.w > 0.0) {
            // the fills of shell holes (uPaveExtra.w: a shelled city's), their edges as ragged as the holes were
            vec2 rci = floor(rq / 6.0);
            vec2 rh = cellHash2(rci + vec2(91.0, 13.0));
            float on = step(rh.y, 0.22 * uPaveExtra.w);
            float rr = 0.35 + 0.55 * fract(rh.x * 7.3);
            float rd = length(rq - (rci + 0.3 + 0.4 * rh) * 6.0) + (nz(uv, 1.7, vec2(0.43, 0.29)).g - 0.5) * 0.40
              + (nz(uv, 5.3, vec2(0.17, 0.83)).r - 0.5) * 0.10;
            asph = mix(asph, asph * 0.84, on * (1.0 - smoothstep(rr - 0.03, rr + 0.03 + fwP, rd)));
            asph *= 1.0 - 0.22 * on * (1.0 - smoothstep(0.015, 0.035 + fwP, abs(rd - rr))) * tileVis(0.5);
          }
          // a road's centre line (uPaveExtra.z, a map from the 1950s on): worn white paint, 6 m dashes with 12 m gaps along
          // the running length, flaked in patches — on the country roads (a kerbed town's streets carry none)
          if (fr && uPaveExtra.z > 0.0 && paveTownW < 0.5 && gRoadYOk > 0.5) {
            float dash = step(fract(gRoadS / 18.0), 6.0 / 18.0);
            float lineW = 1.0 - smoothstep(0.06, 0.06 + fwP, abs(rq.y));
            float paint = dash * lineW * stripeVis(0.12, pr) * (0.55 + 0.45 * smoothstep(0.30, 0.60, nz(uv, 2.7, vec2(0.83, 0.19)).r))
              * uPaveExtra.z;
            asph = mix(asph, vec3(0.46, 0.46, 0.43), paint * 0.85);
            rough = mix(rough, 0.60, paint);
          }
          if (fr && uPaveWear.z > 0.0 && paveTownW > 0.5) {
            float mci = floor(rq.x / 34.0);
            vec2 mh = cellHash2(vec2(mci, 71.0));
            vec2 mc = vec2((mci + 0.2 + 0.6 * mh.x) * 34.0, mh.y > 0.5 ? 0.0 : (mh.y > 0.25 ? 1.6 : -1.6));
            float md = length(rq - mc);
            float cover = (1.0 - smoothstep(0.31, 0.31 + fwP, md)) * step(fract(mh.x * 9.1), uPaveWear.z) * tileVis(0.62);
            if (cover > 0.0) {
              float boss = step(0.5, fract(floor((rq.x - mc.x) / 0.055) * 0.5 + floor((rq.y - mc.y) / 0.055) * 0.5)) * tileVis(0.11);
              vec3 iron = vec3(0.070, 0.064, 0.058) * (1.0 + 0.25 * boss) * mix(vec3(1.0), vec3(1.25, 0.95, 0.75), smoothstep(0.6, 0.9, agg));
              iron *= 1.0 - 0.5 * (1.0 - smoothstep(0.012, 0.02 + fwP, abs(md - 0.29)));
              asph = mix(asph, iron, cover);
              rough = mix(rough, 0.52, cover);
              pN += (rq - mc) / max(md, 1e-3) * 0.3 * (1.0 - smoothstep(0.0, 0.03 + fwP, abs(md - 0.31))) * cover;
            }
          }
          pav = vec4(asph * uPaveExtra.x, rough);
          pN = (pN.x * al + pN.y * pr) * 1.0;
        }
        // the gutter: rows of small setts along the kerb, the street's dirt and leaves gathered in them (a kerbed street,
        // uPaveClass.w its width)
        float gutW = uPaveClass.w;
        if (gutW > 0.0 && fr && abs(pCls - 2.0) > 0.5) {
          float gIn = dRoad - (5.0 - gutW);
          float gutB = smoothstep(-0.01, 0.01 + fwP, gIn) * (1.0 - smoothstep(5.1, 5.3, dRoad)) * paveTownW;
          if (gutB > 0.001) {
            float row = floor(gIn / 0.12), colI = floor(gRoadS / 0.12 + row * 0.5);
            vec2 gh2 = cellHash2(vec2(colI, row + 61.0));
            vec2 gf = vec2(fract(gRoadS / 0.12 + row * 0.5), fract(gIn / 0.12)) * 0.12;
            float gE = min(min(gf.x, 0.12 - gf.x), min(gf.y, 0.12 - gf.y));
            float gv = tileVis(0.12);
            float gJ = (1.0 - smoothstep(0.006, 0.010 + 0.6 * fwP, gE)) * gv;
            vec3 gStone = vec3(0.19, 0.185, 0.175) * (0.78 + 0.44 * gh2.x);
            vec3 gDirt = uMeanD.rgb * 0.55;
            vec3 gCol = mix(mix(vec3(0.165), gDirt, 0.2), mix(gStone, gDirt, gJ), gv);
            gCol = mix(gCol, gDirt * 0.8, 0.35 * smoothstep(gutW * 0.5, gutW, gIn) * smoothstep(0.45, 0.7, nz(uv, 0.09, vec2(0.61, 0.13)).g));
            pav = mix(pav, vec4(gCol, 0.86), gutB);
            pN = mix(pN, ((gf.y / 0.12 - 0.5) * pr * 0.35 + (gf.x / 0.12 - 0.5) * al * 0.35) * (1.0 - gJ) * gv, gutB);
          }
        }
        // (wave 333: "flat single-material planes … no wear, kerb spill or contact darkening") the grime against a kerb —
        // the street's dirt and leaves washed to its foot, darkest at the face; on a square off any centreline its edges
        // trodden darker and weedy, its middle worn in broad stains
        if (fr && paveTownW > 0.0) {
          float kg = smoothstep(4.35, 5.0, dRoad) * (1.0 - smoothstep(5.05, 5.25, dRoad)) * paveTownW;
          pav.rgb *= 1.0 - 0.24 * kg * (0.7 + 0.3 * nz(uv, 0.9, vec2(0.37, 0.53)).r);
          pav.rgb = mix(pav.rgb, uMeanD.rgb * 0.5, 0.25 * kg * smoothstep(0.55, 0.8, nz(uv, 2.6, vec2(0.11, 0.91)).r) * tileVis(0.2));
        }
        if (!fr && uLandTier > 0.5) {
          float edgeG = 1.0 - smoothstep(0.55, 0.95, mk.r);
          pav.rgb *= 1.0 - 0.18 * edgeG;
          pav.rgb = mix(pav.rgb, uMeanG.rgb * 0.7, 0.30 * edgeG * smoothstep(0.55, 0.80, nz(uv, 0.31, vec2(0.71, 0.23)).g) * tileVis(0.3));
          pav.rgb *= 1.0 - 0.12 * smoothstep(0.52, 0.80, nzq(uv, 0.05, vec2(0.47, 0.19)).x);
        }
        // standing water (uPaveWear.w, a wet town's): in the gutters and the worn wheel paths' low spots, dark and smooth
        if (uPaveWear.w > 0.0 && fr) {
          float lowSpot = max(smoothstep(4.3, 4.9, dRoad) * paveTownW, wheelW * 0.7);
          float pond = smoothstep(0.62, 0.80, nzq(uv, 0.06, vec2(0.29, 0.83)).x + 0.12 * lowSpot) * lowSpot * uPaveWear.w * uRoadPuddle;
          pav.rgb = mix(pav.rgb, pav.rgb * 0.45, pond);
          pav.a = mix(pav.a, 0.08, pond);
          pN *= 1.0 - pond;
          gRoadPuddle = max(gRoadPuddle, pond * paveCore);
        }
        pnn = vec4(vec2(0.5) + pN, 0.5, 1.0);
      }
      // ground lane (2026-10-03, the gauntlet: the cobble road "meets meadow at a knife edge with no verge, mud or broken
      // stones"): a country sett road's margin is broken — setts lost in runs along the edge with soil in the gaps (the
      // shoulder's own soil shows through), grass and moss climbing into the joints of the outer setts, and a strip of
      // trodden mud and grit beyond the last of them
      {
        float paveVis = tileVis(1.6);
        float paveN = nzq(uv, 0.62, vec2(0.71, 0.37)).x;
        // (maps lane B: an airfield's concrete keeps a straight edge — no setts to lose)
        float paveKept = smoothstep(0.15, 0.24, mk.r + (n1hs - 0.5) * 0.025
          + (paveN - 0.5) * 0.20 * paveVis * (1.0 - step(0.001, uPaveSlab.x))
          * (uLandTier < 0.5 ? (gRoadClass > 0.5 && gRoadClass < 3.5 && abs(gRoadClass - 2.0) > 0.5 ? 0.0 : 1.0)
            : (abs(pCls - 1.0) < 0.5 || abs(pCls - 3.0) < 0.5 || abs(pCls - 6.0) < 0.5 ? (paveTownW > 0.5 ? 0.0 : 0.35) : 1.0))) * gRoadTex;
        paveCore = min(paveCore, paveKept);
        float outer = paveCore * (1.0 - smoothstep(0.24, 0.46, mk.r));
        float pavL = dot(pav.rgb, vec3(0.34, 0.45, 0.21)) / max(dot(uMeanR.rgb, vec3(0.34, 0.45, 0.21)) * 0.8, 1e-3);
        float joint = 1.0 - smoothstep(0.55, 0.95, pavL);
        pav.rgb = mix(pav.rgb, pav.rgb * vec3(0.70, 0.96, 0.50), joint * outer * 0.85);
        float margin = smoothstep(0.02, 0.15, mk.r + (paveN - 0.5) * 0.06) * (1.0 - paveCore) * gRoadTex;
        a.rgb = mix(a.rgb, a.rgb * vec3(0.80, 0.76, 0.68), margin * 0.65);
        a.a = mix(a.a, max(a.a, 0.94), margin);
      }
      // (a procedural surface carries its own albedo, a third of the map's road hue over it; the map's tint calibrates its
      // sett print)
      vec3 paveHue = mix(vec3(1.0), uRoadTint / max(dot(uRoadTint, vec3(0.34, 0.45, 0.21)), 0.05), 0.33);
      a.rgb = mix(a.rgb, pav.rgb * (pCls > 0.5 ? (uLandTier < 0.5 ? vec3(1.0) : paveHue) : uRoadTint), paveCore * 0.94);
      a.a = mix(a.a, pav.a, paveCore * 0.85);
      n = mix(n, pnn, paveCore * 0.85);
      // gutter shading: a darkened seam just inside the pavement edge gives
      // the street a built profile even before the kerb geometry resolves
      float gutter = smoothstep(0.06, 0.20, mk.r) * (1.0 - smoothstep(0.22, 0.42, mk.r));
      a.rgb *= 1.0 - gutter * 0.18 * gRoadTex;
    }
  }
  // r4: 0.09 -> 0.16 + a dusty desaturation pull — road shoulders must read
  // as worn verge (tracked dirt spilling off the carriageway), not clean lawn
  // running flush to the wheel ruts (critique: "no decals along road edges")
  // r7: NOISE-RAGGED edge band + gravel spill — the road met the grass as
  // one uniform soft feather (decal-ecosystem critique); the worn verge now
  // breaks up on the ~6 m noise and scatters gravel speckle off the
  // carriageway shoulder
  float edgeBand = shoulder * (1.0 - roadCore) * (0.55 + 0.90 * n1hs);
  a.rgb *= 1.0 - edgeBand * 0.16;
  a.rgb = mix(a.rgb, vec3(dot(a.rgb, vec3(0.34, 0.45, 0.21))) * vec3(1.06, 1.0, 0.88), edgeBand * 0.22);
  {
    float gravSpill = shoulder * (1.0 - roadCore) * smoothstep(0.58, 0.9, n1h)
      * (1.0 - smoothstep(30.0, 90.0, effDist));
    gravSpill *= tileVis(1.2); // ground lane
    if (gravSpill > 0.004) {
      vec4 gravE = texture2D(uAlbR, uv * 0.83);
      a.rgb = mix(a.rgb, gravE.rgb * vec3(1.02, 0.97, 0.88), gravSpill * 0.5);
    }
  }
  // (a pad's ruts: two grooves across each line, their walls turned to the light)
  if (nrmOn && padRut > 0.003) n.xy -= padRutN * 0.35;
  // wheel-lane relief and tyre streaks from the distance field: its gradient
  // is the across-road direction and the lane profile's analytic slope shapes
  // two smooth grooves, so a straight road carries no per-texel bumps.
  if (roadCore > 0.002) {
    float laneSlope = -2.0 * laneD * uLaneK * lane;
    n.xy += gradD * laneSlope * 0.14 * roadCore * rutAmp * (1.0 - df * 0.72) * uRoadRuts.x * (1.0 - grooveRel);
    vec2 along = vec2(-gradD.y, gradD.x);
    float streak = texture2D(uNoise, vec2(dot(uv, along) * 0.31, dot(uv, gradD) * 2.7)).r;
    a.rgb *= 1.0 + (streak - 0.5) * 0.16 * max(lane, 0.35 * crown) * roadCore * (1.0 - df);
  }
  // wind-blown snow drifts across the ice sheet + snowbank shoreline blend
  // (maps r1: the whole sheet block reads fMs — identical to fM everywhere
  // uSea is 0, i.e. on every pre-existing map)
  float driftW = 0.0;
  if (uIceDrift > 0.001 && fMs > 0.02) {
    // macro ice re-projection: the detail ice layer tiles every ~5 m, so its
    // cracks/depth blotches average away by 150 m and the whole sheet read
    // as snowfield in establishing shots — overlay the same texture at a
    // ~75 m tile so pressure cracks and dark clear-ice patches survive at
    // range and the lake reads as ICE from the wide camera
    // LUMINANCE-only macro modulation (r5): multiplying the sheet by its own
    // RGB squared the blue saturation — the garish swimming-pool ellipse.
    // Value variation alone keeps the gray-white ice albedo authored in the
    // layer while the cracks/depth blotches still read at range.
    vec4 iceMacro = texture2D(uAlbM, uv * 0.0134);
    float iceLum = dot(iceMacro.rgb, vec3(0.30, 0.45, 0.25));
    // r6: macro contrast up (0.55+0.80 -> 0.45+1.00) so the 75 m-scale
    // pressure cracks and clear-ice fields dominate at range...
    // r4: 0.45+1.00 -> 0.36+1.18 — one more contrast step (see makeIceLayer)
    a.rgb = mix(a.rgb, a.rgb * (0.36 + iceLum * 1.18), fMs * 0.9 * (1.0 - uSea));
    // ...and DESATURATE the sheet with distance: the 5 m detail tile can only
    // resolve as blue salt-speckle from the establishing camera — pull the
    // far sheet toward a cool gray so it reads as one ice surface with crack
    // veins, not a blue static field
    float iceGrey = dot(a.rgb, vec3(0.30, 0.45, 0.25));
    a.rgb = mix(a.rgb, vec3(iceGrey) * vec3(0.965, 1.0, 1.05), fMs * farM * 0.6 * (1.0 - uSea));
    // ground lane (2026-10-03, the gauntlet: "grey frozen ponds dotted with white blobs"): snow on lake ice lies in
    // drifts the wind combs out along itself — long tongues and streaks three times their width — not round blots
    vec2 iceWind = vec2(0.6220, 0.7830); // the snow maps' sastrugi wind (the drift waves above)
    vec2 iceQ = vec2(dot(uv, iceWind) * 0.32, dot(uv, vec2(-iceWind.y, iceWind.x)));
    float driftN = uSea > 0.5 ? nz(uv, 0.021, vec2(0.31, 0.77)).r : nz(iceQ, 0.034, vec2(0.31, 0.77)).r;
    float drift = smoothstep(0.52, 0.78, driftN + (n1h - 0.5) * 0.30);
    float bank = 1.0 - smoothstep(0.25, 0.75, fMs); // shoreline band drifts hardest
    driftW = clamp(drift * uIceDrift * (0.48 + bank * 0.52), 0.0, 1.0) * fMs;
    // maps r1: sand/mud shoals belong in the SHALLOWS — deep-water "drift"
    // read as pale mottling across the whole sheet (uSea=0: multiplier 1)
    driftW *= mix(1.0, 0.30 + bank * 0.70, uSea);
    if (uSea > 0.5) { // maps r1: open water "drifts" are sand shoals, not snow
      a = mix(a, groundSamp(uAlbD, uMeanD, uv * 0.210, df, mipB), driftW * 0.85);
      n = mix(n, groundNrm(uNrmD, uv * 0.210, df, mipB), driftW * 0.85);
    } else {
      a = mix(a, groundSamp(uAlbG, uMeanG, uv * 0.240, df, mipB), driftW);
      n = mix(n, groundNrm(uNrmG, uv * 0.240, df, mipB), driftW);
    }
    // r6: pressure ridges — concentric normal waves + a bright refrozen crest
    // following the shoreline contour (fM isolines via the mask-B gradient).
    // Real lake ice buckles against its banks; the flat noise disc was the
    // last tell. Ridges fade where snow drifts bury the sheet.
    float ridgeBand = smoothstep(0.08, 0.38, fMs) * (1.0 - smoothstep(0.55, 0.88, fMs))
      * (1.0 - uSea); // maps r1: pressure ridges are an ICE feature
    if (ridgeBand > 0.004) {
      float texelR = 2.0 / 1024.0;
      vec2 gM;
      gM.x = maskAt(mUV + vec2(texelR, 0.0)).b - maskAt(mUV - vec2(texelR, 0.0)).b;
      gM.y = maskAt(mUV + vec2(0.0, texelR)).b - maskAt(mUV - vec2(0.0, texelR)).b;
      float gl = length(gM);
      if (gl > 1e-5) {
        vec2 gd = gM / gl;
        // ~14 cycles across the shore ramp (the first 44 aliased into a
        // moire groove pattern from the establishing camera); n1 breaks the
        // ring phase so buckle lines wander instead of tracing isolines
        float ridge = sin(fMs * 14.0 + n1h * 2.2 + n1 * 4.0) * ridgeBand * (1.0 - driftW);
        n.xy += gd * ridge * 0.45;
        a.rgb *= 1.0 + max(ridge, 0.0) * 0.07;
      }
    }
    // r3 terrain_environment: FRESNEL sky sheen on clear ice — the sheet had
    // no view-dependent response at all and read as a flat blue stain. At the
    // near-grazing establishing camera the clear-ice fields now pick up the
    // cold sky tint (drifted snow stays matte), which together with the
    // lowered roughness floor below gives the lake a real ice identity.
    // (first cut at 0.55 toward a bright tint WASHED the sheet whiter than
    // the snow — the sheen must stay a cool mid-tone glaze over DARK ice)
    // r6 terrain_environment: BLUE DEPTH GRADIENT — the sheet read as one
    // flat single-tone disc (critique). Deep water under the interior ice
    // darkens and cools it; the drifted shore band stays snow-toned. Plus a
    // macro normal waviness from the ice layer's own normal map so the
    // fresnel/sun response breaks into streaks instead of one flat sheen.
    {
      float deepW = smoothstep(0.45, 0.95, fMs) * (1.0 - driftW);
      // maps r1: open water deepens toward a darker blue-green (uSea-gated);
      // ice keeps its pale blue depth cue
      vec3 deepTint = mix(vec3(0.74, 0.86, 1.05), vec3(0.34, 0.56, 0.66), uSea);
      a.rgb *= mix(vec3(1.0), deepTint, deepW * mix(0.5, 0.72, uSea));
      vec3 iceN = texture2D(uNrmM, uv * 0.0134).xyz * 2.0 - 1.0;
      n.xy += iceN.xy * mix(0.5, 0.04, uSea) * fMs * (1.0 - driftW) * (1.0 - uRingDraw);
    }
    {
      vec3 vDirIce = normalize(cameraPosition - wp);
      float fresI = pow(1.0 - clamp(dot(vDirIce, wn), 0.0, 1.0), 3.0);
      float clearIce = fMs * (1.0 - driftW);
      // r4: 0.30 -> 0.48 — the sheet still read as a matte pale splat from
      // the establishing camera; a stronger grazing sky sheen (plus the 0.14
      // roughness floor below) finally gives it a specular ice identity
      // lighting_post r4: 0.48 -> 0.62 — winter.js envIntensity dropped
      // 0.60 -> 0.32 to kill the albedo-independent pale wash on props; the
      // ice sheet keeps its DIRECTIONAL sheen by leaning harder on its own
      // fresnel term instead of the scene-wide env (ice vs snow separation).
      // maps r1: open water runs the sheen a step weaker than clear ice —
      // at establishing grazing angles the full 0.62 painted the whole
      // sea/river pale sky-grey (uSea=0 keeps the winter value exactly)
      // Liquid water should reflect the sky without becoming a white sheet.
      // The sea keeps the same draw path as ice, but uses a lower-energy
      // grazing glaze so the authored depth and chop remain visible.
      a.rgb = mix(a.rgb, uIceSky, fresI * clearIce * mix(0.62, 0.16, uSea));
    }
    // >>> maps r1 (uSea-gated): surf line + sparse whitecaps. The surf band
    // rides the RAW fM ramp (it peaks just shoreward of where fMs starts),
    // broken by two noise octaves so the foam edge is ragged, never a ring.
    if (uSea > 0.5 && uSeaFoam > 0.001) {
      // the surf band hugs the fMs waterline whatever ramp the map runs
      float surfBand = smoothstep(0.012, 0.10, fMs) * (1.0 - smoothstep(0.30, 0.62, fMs));
      float fno = nz(uv, 0.045, vec2(0.63, 0.17)).r * 0.55
                + texture2D(uNoise, uv * 0.17 + vec2(0.29, 0.83)).g * 0.45;
      float foam = surfBand * smoothstep(0.42, 0.78, fno + (n1h - 0.5) * 0.20) * uSeaFoam;
      float caps = fMs * smoothstep(0.87, 0.97, nz(uvW, 0.031, vec2(0.51, 0.07)).r)
                 * 0.45 * uSeaFoam * (1.0 - farM * 0.6);
      gSeaFoam = clamp(foam + caps, 0.0, 1.0);
      a.rgb = mix(a.rgb, vec3(0.68, 0.80, 0.84), gSeaFoam * 0.72);
    }
    // <<< maps r1 -------------------------------------------------------------
  }
  // r7: the unconditional macro term reads the PLANAR n2 field — degenerate
  // down vertical faces, it printed full-height value stripes (taffy smear);
  // steep faces take the wall-coherent sample instead
  a.rgb *= 0.90 + mix(n2, n2Wall, projW) * 0.20;
  // wet/dark shoreline band where ground meets a marsh or ice sheet: the
  // sheet blends into darkened damp banks instead of ending on a hard seam
  // maps r1: in open-water mode the damp band hugs the waterline instead of
  // spanning the whole beach apron (which would read as one wet smear)
  float shoreW = uSea > 0.5
    ? smoothstep(0.16, 0.36, fM) * (1.0 - smoothstep(0.48, 0.78, fM))
    : smoothstep(0.04, 0.30, fM) * (1.0 - smoothstep(0.55, 0.95, fM));
  a.rgb *= 1.0 - shoreW * 0.30 * (1.0 - driftW) * (1.0 - uSaltCrust.x);
  // Round 73 (2026-09-25, the ground redux; round 66's open note "run-up whitens the sheet but does not wet the
  // sand"): the wet strand. Below the sheet's waterline the sand apron is dark and glossy where the swash just ran
  // (a film whose reach breathes on the world clock with the map's swell period, arriving at a different phase along
  // the beach), damp up to the high-water mark and dry above it, with a ragged wrack line at the mark; a lake or a
  // river (no period) keeps a steady damp mud band. The terrain cannot read the sheet's run-up field (16 samplers),
  // so the band is analytic on the same clock the sheet's own run-up runs on.
  // Round 73b (2026-09-26): the strand in METRES. Round 73 read its band off the mask's wetness ramp, and on a real
  // beach that ramp is two or three metres wide (Saltwind: a 20 m shelf on a 165 m local radius leaves a 13 m ramp
  // whose 0.02–0.16 apron is two metres), so the wet sand was a line under the surf whatever width the profile asked
  // for. Every vertex now carries its distance landward of the waterline (the shore byte, baked from the map's own shoreline
  // contours) and the swash runs up the beach by metres: a dark, saturated, glossy film to the run-up's breathing
  // reach, a damp band to the high-water mark, a foam line left at the reach, a wrack line of debris at the mark and
  // pebbles in the wet sand; a lake or a river (no period) keeps a steady muddy margin.
  float wetSand = 0.0;
  if (uSea > 0.5 && uReduxSwash.z > 0.001) {
    float strand = (1.0 - fMs) * (1.0 - steepW) * (1.0 - roadCore) * (1.0 - smoothstep(24.0, 31.0, vShore));
    float reachM = uReduxSwash.y;
    float swashPh = uGroundTime * uReduxSwash.x + n1 * 6.0 + n1h * 1.5;
    if (uReduxSwash.x > 0.0) reachM *= 0.55 + 0.45 * sin(swashPh);
    float edgeM = vShore + (n1h - 0.5) * 1.2 + (n1 - 0.5) * 0.6;
    float film = 1.0 - smoothstep(reachM - 0.25, reachM + 0.25, edgeM); // the last wave's line: sharp, ragged
    float markM = uReduxSwash.y * 1.3 + 0.8;
    float damp = 1.0 - smoothstep(markM - 1.0, markM + 0.5, edgeM);
    wetSand = strand * uReduxSwash.z * max(film, damp * 0.55);
    // the foam the last run-up left at its reach and the wrack at the mark: ragged lines a chase camera reads
    float foamM = vShore + (n1h - 0.5) * 0.7; // the foam line wanders less than the film's edge
    gStrandFoam = exp(-pow((foamM - reachM) / 0.30, 2.0)) * smoothstep(0.50, 0.78, n1h * 0.55 + n2 * 0.45) * strand * uReduxSwash.w
      * step(0.001, uReduxSwash.x);
    float wrack = exp(-pow((edgeM - markM) / 0.7, 2.0)) * smoothstep(0.30, 0.70, n1h * 0.5 + n1 * 0.5) * strand * uReduxSwash.w;
    a.rgb *= 1.0 - 0.50 * wetSand;
    float wl = dot(a.rgb, vec3(0.36, 0.42, 0.22));
    a.rgb = max(wl + (a.rgb - wl) * (1.0 + 0.15 * min(wetSand, 1.0)), 0.0); // wet sand is darker and a shade more saturated
    a.rgb = mix(a.rgb, a.rgb * vec3(0.90, 0.95, 1.0), min(wetSand, 1.0) * 0.6); // the water film's cool cast
    if (uReduxSwash.x == 0.0) a.rgb = mix(a.rgb, a.rgb * vec3(0.80, 0.72, 0.58), min(wetSand, 1.0) * 0.6); // a still bank is mud
    a.rgb = mix(a.rgb, vec3(0.78, 0.80, 0.80), gStrandFoam * 0.40);
    a.rgb *= 1.0 - 0.38 * wrack;
    float pebW = (min(wetSand, 1.0) * 0.45 + wrack * 0.7) * (1.0 - smoothstep(30.0, 90.0, camDist));
    pebW *= tileVis(0.77); // ground lane
    if (pebW > 0.01) {
      // pebbles and shell in the wet sand and along the wrack line: the rock tile's clamped zero-mean grain
      float pbL = dot(texture2D(uAlbR, uv * 1.3).rgb, vec3(0.34, 0.45, 0.21));
      float pbM = dot(uMeanR.rgb, vec3(0.34, 0.45, 0.21)); // terrain v2: the rock tile's measured mean
      a.rgb *= 1.0 + clamp((pbL - pbM) * 1.8, -0.30, 0.34) * pebW;
    }
    n.xy = mix(n.xy, vec2(0.5), film * strand * 0.7); // the water smooths the ripples it ran over
  }
  // >>> terrain_environment r2: agrarian field patchwork + far turf relief. --
  // The 150-800 m band used to collapse into one smooth green wash (the bald
  // "gumdrop" midground hills behind the village): by 330 m every detail
  // layer is mip-faded flat and the soft meadow tints carry no structure.
  // (a) per-plot crop-tone variation on a ~92 m warped grid with darker
  //     field-margin lines (hedgerow/verge read from the air),
  // (b) straight mowing/crop strips inside each plot (~20 m pitch),
  // (c) a coarse re-projection of the grass layer's normal+albedo (same trick
  //     as the far-cliff rescue) so distant hills shade like turf-covered
  //     terrain instead of smooth clay.
  {
    // r4: band pulled in 70-150 -> 40-110 m — plowed/mowed field patches must
    // be visible from the gameplay camera, not only in establishing shots
    float fieldW = uFieldPatch * smoothstep(40.0, 110.0, effDist)
      * (1.0 - fD) * (1.0 - fM) * (1.0 - shoulder) * (1.0 - fR) * (1.0 - projW)
      * (1.0 - mk.a);
    if (fieldW > 0.004) {
      vec2 plotUv = uvW * (1.0 / 92.0);
      vec2 pid = floor(plotUv);
      // terrain v2: one texel per plot (level 0): the implicit level spiked along every plot border, where floor() jumps
      float pr = textureLod(uNoise, pid * 0.1371 + vec2(0.29, 0.71), 0.0).r;
      float pg = textureLod(uNoise, pid * 0.2117 + vec2(0.61, 0.37), 0.0).g;
      // per-plot crop tone: hay-gold / dark clover / neutral pasture
      float cropSel = smoothstep(0.40, 0.72, pr);
      vec3 cropTint = mix(vec3(1.0),
        pg > 0.5 ? vec3(1.10, 1.04, 0.80) : vec3(0.84, 0.94, 0.82),
        cropSel * 0.55);
      a.rgb *= mix(vec3(1.0), cropTint, fieldW);
      // straight mowing strips: direction + pitch vary per plot
      float mAng = pr * 6.2832 + pg * 2.1;
      vec2 mdir = vec2(cos(mAng), sin(mAng));
      float strip = sin(dot(uv, mdir) * (0.24 + pg * 0.22));
      strip *= tileVis(13.6); // ground lane
      a.rgb *= 1.0 + strip * 0.05 * fieldW * (0.35 + cropSel);
      // darker margin line along plot borders
      vec2 fr2 = abs(fract(plotUv) - 0.5);
      float margin = smoothstep(0.44, 0.492, max(fr2.x, fr2.y));
      a.rgb *= 1.0 - margin * 0.10 * fieldW;
    }
    // the map-borders lane (2026-10-03): the farmland past the edge in parcels between the hedgerows (stubble, plough,
    // pasture, fallow — the ring's borderTint attribute; zero on the battlefield's own chunks)
    // (calibrated with the ground lane's fields, landUse.ts: the crop's colour as a multiple of the sward's own luminance;
    // the interpolated colour is premultiplied, so two fields blend along their boundary; none on slopes past ~30 degrees)
    float cropWeight = 1.0 - vBorderTint.w;
    if (cropWeight > 0.002) {
      float cropW = cropWeight * (1.0 - fR) * (1.0 - roadCore) * (1.0 - fMs) * (1.0 - projW) * (1.0 - smoothstep(0.07, 0.15, slope));
      a.rgb = mix(a.rgb, vBorderTint.rgb / cropWeight * reduxLuma(a.rgb), cropW);
    }
    // ... and the farm tracks down some of the field boundaries (borderLandform.ts trackAt): 3 m of packed dirt beside the
    // hedge, ragged at the edges, anti-aliased by the pixel's footprint and gone beyond ~1.2 km so it never shimmers
    if (vBorderTrack.x > 0.5) {
      vec2 dc = abs(vBorderTrack.xz - 1000.0);
      vec2 same = 1.0 - step(0.02, abs(vBorderTrack.yw - floor(vBorderTrack.yw + 0.5)));
      vec2 tw = (1.0 - smoothstep(vec2(1.1), vec2(1.9) + fwidth(dc), dc + (n1hs - 0.5) * 0.9)) * same;
      float trackW = max(tw.x, tw.y) * (1.0 - fR) * (1.0 - roadCore) * (1.0 - fMs) * (1.0 - projW)
        * (1.0 - smoothstep(700.0, 1500.0, camDist));
      a.rgb = mix(a.rgb, uMeanD.rgb * vec3(1.06, 1.0, 0.92), trackW * 0.78);
    }
    // ... and a railway's open line past the edge (railSpurs.ts RAIL_OPEN_*; the kit lays its first 240 m): grey-brown
    // ballast 3.6 m wide, a cess of trodden soil either side, the two rails as thin steel lines faded by the footprint
    if (vRailExit.y > 0.002) {
      float dR = abs(vRailExit.x);
      float ballastW = (1.0 - smoothstep(1.5, 2.1, dR)) * vRailExit.y * (1.0 - fMs);
      float cessW = (smoothstep(1.5, 2.1, dR) - smoothstep(2.6, 3.8, dR)) * vRailExit.y * (1.0 - fMs);
      a.rgb = mix(a.rgb, vec3(0.125, 0.121, 0.115) * (0.88 + 0.24 * n1hs), ballastW);
      a.rgb = mix(a.rgb, uMeanD.rgb * vec3(0.92, 0.88, 0.82), cessW * 0.55);
      float railAa = fwidth(dR) + 0.02;
      float rail = (1.0 - smoothstep(0.035, 0.035 + railAa, abs(dR - 0.72))) * vRailExit.y * (1.0 - smoothstep(60.0, 220.0, camDist));
      a.rgb = mix(a.rgb, vec3(0.30, 0.29, 0.28), rail * 0.8);
    }
    // coarse turf relief at range (all maps): the far band keeps macro
    // normal structure where the per-texel detail normals have faded out
    float farG = farM * (1.0 - fR) * meadowG * (1.0 - roadCore) * (1.0 - max(0.85 * gCropReliefW, gSoilW)); // ground lane: nor the coarse turf
    if (farG > 0.003) {
      // Coarse turf is low relief, not another giant clod normal. Albedo
      // retains the source detail while the actual hills own broad shading.
      // ground lane: the coarse turf normal and tone were ONE tile of the grass photo blown up to 48 m and 73 m — its
      // clumps repeated across every far field on that grid; a second read of the same tile, turned 42° and at an
      // incommensurate scale, averaged in (contrast restored), leaves no period to read
      vec2 gnA = texture2D(uNrmG, uv * 0.021).xy * 2.0 - 1.0;
      vec2 gnB = texture2D(uNrmG, TILEROT * uv * 0.0163 + vec2(0.41, 0.23)).xy * 2.0 - 1.0;
      gnB = vec2(0.7431 * gnB.x + 0.6691 * gnB.y, -0.6691 * gnB.x + 0.7431 * gnB.y);
      vec3 gnF = vec3((gnA + gnB) * 0.68, 0.0);
      // 2026-09-12 visual restoration: 0.24 -> 0.45. The 1049e4e meadow ran
      // this coarse relief at 1.5 and read as turf to the horizon; 0.24 left
      // every far field a flat sheet. 0.45 keeps the relief without the
      // clod-normal shimmer the cut was made for.
      // relief pass 2 (2026-09-12): 0.45 -> 0.9 — halfway back to the
      // reference; the far fields still read as felt at 0.45.
      n.xy += gnF.xy * farG * 0.9;
      float gL0 = dot(uMeanG.rgb, vec3(0.36, 0.42, 0.22));
      float gLA = dot(texture2D(uAlbG, uv * 0.0137).rgb, vec3(0.36, 0.42, 0.22));
      float gLB = dot(texture2D(uAlbG, TILEROT * uv * 0.0109 + vec2(0.29, 0.53)).rgb, vec3(0.36, 0.42, 0.22));
      float gLum = gL0 + ((gLA + gLB) * 0.5 - gL0) * 1.41;
      a.rgb *= mix(1.0, 0.86 + gLum * 0.30, farG * 0.55);
    }
  }
  // <<< terrain_environment r2 ------------------------------------------------
  // distant mottling: forest-floor/heather patches keep far hills from reading
  // as one flat green wash
  float mot = nz(uv, 0.0022, vec2(0.17, 0.71)).g;
  // r7: planar-projected far mottling gated off steep faces (vertical stripes)
  // ground lane (farmland): a field's tone at range is its own fieldVar, not the meadow's mottle
  float motG = farM * (1.0 - projW) * (1.0 - 0.75 * max(gCropW, gSoilW));
  // r8: darkening 0.20 -> 0.13 with a wider, later ramp — at 0.20 the term
  // stamped muddy cloud-shadow blotches across mid-distance sand/meadow
  a.rgb *= 1.0 - motG * 0.17 * smoothstep(0.55, 0.95, mot);
  a.rgb *= 1.0 + motG * 0.17 * smoothstep(0.55, 0.85, n1) * (1.0 - smoothstep(0.48, 0.82, mot));
  // >>> grazing-view meadow detail. -----------------------------------------
  // The activation/LOD weights remain view-dependent; the sampled chart does
  // not. This fixed world-XZ chart is intended for heightfield meadow, not a
  // replacement for vertical-rock triplanar mapping. Hardware filtering owns
  // the grazing footprint instead of a moving counter-stretched texture axis.
  {
    vec3 vDirN = normalize(cameraPosition - wp);
    float dNV = saturate(dot(vDirN, wn));
    // r6 terrain_environment: band tightened 0.16-0.40 -> 0.07-0.22. The
    // rescue exists for NEAR-TANGENT chase views (dNV < ~0.1, where the 16x
    // aniso sampler genuinely runs out); at 0.40 it was still partially
    // active for the ~30-70 deg establishing camera and its counter-
    // stretched resample printed the directional "combed fabric" weave
    // across the 80-150 m midground (the mottled-blotch critique).
    float grazeW = (1.0 - smoothstep(0.07, 0.22, dNV))
                 * smoothstep(30.0, 70.0, camDist)
                 * (1.0 - smoothstep(320.0, 480.0, camDist))
                 * (1.0 - projW)
                 * (1.0 - fD) * (1.0 - fM) * (1.0 - roadCore) * (1.0 - fR)
                 * (1.0 - max(gCropW, gSoilW)); // ground lane (farmland): no meadow sheet on a sown or turned field
    if (grazeW > 0.004) {
      vec2 uvG = groundChartUv(wp.xz);
      vec4 aG = splatSamp(uAlbG, uvG * 0.240, df, 0.0, uMeanG);
      vec4 nG = splatSamp(uNrmG, uvG * 0.240, df, 0.0, NRM_MEAN);
      nG.z = 0.5;
      nG.xy = groundChartNormalXZ(nG.xy) * 0.5 + 0.5;
      // Pigment breakup shares the same stationary chart.
      float n1G = nz(uvG, 0.0117, vec2(0.0)).r;
      float n2G = nz(uvG, 0.0031, vec2(0.41, 0.13)).g;
      aG.rgb *= (0.88 + n1G * 0.18) * (0.94 + n2G * 0.12);
      // isotropic planar patch tone re-applied over the stretched sample so
      // the band cannot read as one combed direction
      aG.rgb *= 0.92 + n1w * 0.16;
      // r2: 0.80 -> 0.62 — full-strength replacement stamped its own combed
      // texture band; a partial blend keeps the planar patchwork visible
      // r3: 0.62 -> 0.48, same reasoning one more step
      float gMix = grazeW * 0.38;
      a = mix(a, aG, gMix);
      n = mix(n, nG, gMix);
    }
    // Near climb faces retain their bounded relief in the same fixed chart;
    // an interpolated-normal-derived UV basis would fold across the slope.
    float faceW = smoothstep(0.02, 0.085, slope) * (1.0 - steepW)
                * (1.0 - smoothstep(20.0, 60.0, camDist))
                * (1.0 - fD) * (1.0 - fM) * (1.0 - roadCore) * (1.0 - fR) * (1.0 - gSoilW);
    faceW *= tileVis(0.935); // ground lane (and none on turned earth: its relief is its furrows and clods)
    if (faceW > 0.004) {
      vec2 uvFace = groundChartUv(wp.xz);
      vec2 dnF = groundChartNormalXZ(texture2D(uNrmD, uvFace * 1.07).xy);
      n.xy += dnF * 0.5 * faceW; // relief pass 2 (2026-09-12): 0.22 -> 0.5 (1049e4e ran 0.85 on climb faces)
    }
  }
  // <<< gameplay_feel r4 -----------------------------------------------------
  gSplatAlbedo = a.rgb;
  float iceW = clamp(fMs * uMarshGloss * 1.3, 0.0, 1.0) * (1.0 - driftW);
  float rough0 = clamp(a.a * (1.0 - roadCore * 0.12) * (1.0 + rut * 0.1)
    * (1.0 - fMs * uMarshGloss * (1.0 - driftW)), 0.05, 1.0);
  // ice roughness floor: at 0.05 the grazing-angle Fresnel term mirrors the
  // bright sky across the whole sheet and buries the crack/depth albedo —
  // ~0.45 keeps a satin sheen while the ice texture stays legible from the
  // near-grazing establishing camera
  // r6: 0.45 -> 0.30 — under the overcast winter sky the 0.45 floor killed
  // the sheet's specular response entirely (flat noise disc critique); 0.30
  // gives a believable satin ice sheen while the macro cracks stay legible
  // r9: 0.30 -> 0.20 — with the raised winter envIntensity the sheet still
  // read matte from the establishing camera; 0.20 picks up a real sky sheen
  // on the clear-ice fields while drifted snow (driftW) stays matte
  // terrain_environment r3: 0.20 -> 0.17 — pairs with the fresnel sky tint
  // above; the clear-ice fields need a genuine specular identity (0.13 let
  // the bright overcast env reflection blow the sheet out to snow-white)
  // r4: 0.17 -> 0.14 — one step glossier with the stronger fresnel term
  // Liquid keeps a tighter reflected-sun lobe than the old 0.54 satin floor,
  // which spread a pale leather-like sheen across an entire calm river.
  // Wind chop is carried by the shallow normal field; clear ice is unchanged.
  rough0 = max(rough0, iceW * mix(0.14, 0.22, uSea));
  rough0 = max(rough0, gSeaFoam * 0.88); // maps r1: foam is matte (0 off sea maps)
  // Dry terrain stays truly matte. The previous 0.78 floor left a broad GGX
  // sun lobe on dirt/snow at grazing angles, making the ground look wet even
  // when its albedo and normal detail were correct. Ice and open water keep
  // their authored response through iceW; every dry texel is >= 0.92.
  gSplatRough = max(rough0, 0.92 * (1.0 - iceW) + shoreW * -0.04);
  // ground lane: a puddle is still water — it mirrors the sky; (Longleaf's wave, "a mirror-like specular streak … regardless
  // of viewing angle") past ~20 m its mirror at a grazing view was a bright streak down every road: there it is wet
  // ground (a damp matte by ~36 m), only a near puddle holding the sky
  gSplatRough = mix(gSplatRough, mix(0.12, 0.62, smoothstep(16.0, 36.0, camDist)), gRoadPuddle);
  gSplatRough = mix(gSplatRough, 0.08, gFieldWater); // ... and so is a paddy's or a ditch's
  // Round 73: micro-roughness. Wet sand glosses (the swash band above), a hollow's damp ground a step less matte, and
  // snow sparkles — sparse near texels of a high-frequency noise drop to a tight lobe, so under a grazing sun a few
  // glints light per square metre and move with the camera; gone by 42 m, where a glint would be a shimmer.
  gSplatRough = mix(gSplatRough, 0.30, min(wetSand, 1.0) * 0.95); // round 73b: the film's sheen (0.22 mirrored the whole sky at the strand view's grazing angle and lifted the band pale)
  gSplatRough = mix(gSplatRough, 0.92, gStrandFoam); // round 73b: the foam line is matte
  gSplatRough = mix(gSplatRough, 0.62, gScour * 0.55); // round 73b: the wind-scoured crust takes a satin sheen
  gSplatRough = mix(gSplatRough, 0.74, gLaneSheen * 0.6); // ground lane (wave 86): a track lane's pressed floor, a faint satin
  // ground lane (2026-10-08): a cinder yard's oil, a satin (never a mirror), off the roads and the hardstands laid over it
  gSplatRough = mix(gSplatRough, 0.58, gYardOil * 0.8 * (1.0 - fR) * (1.0 - fMs) * (1.0 - roadCore));
  gSplatRough = mix(gSplatRough, gSplatRough * 0.93, hollow * uReduxFold.x * (1.0 - fMs));
  gSplatRough = mix(gSplatRough, 1.0, gCinderW); // ground lane (wave 62): the cinder's glitter was a sheen on black — none
  // (and the "white specular glints" on the cone's lower third were the detail normals' sun-facing facets lit full on a
  // flank turned from the sun: loose cinder lies at its angle of repose, a fine even surface — half the relief)
  if (nrmOn) n.xy = mix(n.xy, vec2(0.5), 0.5 * gCinderW);
  if (uReduxA.w > 0.001) {
    // read near the finest level: the mip chain averages the peaks away at the 1–3 cm pixel footprint, and a glint
    // that twinkles with the camera's motion is the look (sparse, and gone by 42 m)
    float gs = texture2D(uNoise, uv * 2.9 + vec2(0.13, 0.77), -6.0).r;
    float glint = pow(smoothstep(0.60, 1.0, gs), 4.0) * uReduxA.w * (1.0 - smoothstep(14.0, 42.0, camDist))
      * (1.0 - fD) * (1.0 - fR) * (1.0 - fMs) * (1.0 - roadCore);
    gSplatRough = mix(gSplatRough, 0.14, glint);
  }
  // Liquid's actual sheen now belongs to the translucent surface above this
  // bed. Two reflective layers washed the whole bay white at grazing angles.
  // Retain the authored pigment/detail below the water, but make it matte and
  // dimmer; dry ground and the complete legacy ice response remain unchanged.
  gSplatRough = mix(gSplatRough, 0.95, fMs * uSea);
  gSplatAlbedo *= 1.0 - fMs * uSea * 0.42;
  gSplatNrm = n.xyz * 2.0 - 1.0;
  gSplatFar = farM;
  // steep faces beyond gameplay range: their per-texel normal shading is the
  // strand-noise generator under a low sun — hand the shading to the
  // geometric normal early (from ~50 m out) on cliffs specifically
  gSplatSteepAtt = smoothstep(0.20, 0.45, slope) * smoothstep(50.0, 160.0, camDist) * 0.62;
}
`;

const SPLAT_NORMAL_FRAG = /* glsl */`
#define DK_RANGE_GAIN 1.0
{
  vec3 dN = gSplatNrm;
  vec3 gN = normalize(vWNormal);
  // round 72b: the ring bands' lighting normal carries the atlas gradient the splat slope already read
  if (dot(gRingGrad, gRingGrad) > 0.0) {
    vec2 ringG0 = -gN.xz / max(gN.y, 0.05);
    gN = normalize(vec3(-(ringG0.x + gRingGrad.x), 1.0, -(ringG0.y + gRingGrad.y)));
  }
  // r5: detail-normal strength falls off with distance (0.9 -> ~0.30 by the
  // far band). Past ~300 m per-texel normal shading cannot resolve — on
  // steep faces under a low sun it rendered as high-contrast bright/dark
  // strand noise ("furry" mesa flanks); the geometric normal carries the
  // far shading instead.
  float dk = 1.0 * (1.0 - max(gSplatFar * 0.62, gSplatSteepAtt));
  // Ground lane (2026-10-05, local contrast, step 2 (b'): the ground's mid-scale contrast measured at 0.17–0.28 against
  // photographs' 0.6–0.8; the detail normal at twice its strength was the strongest single ground term, +13 % on Verdant's
  // establishing view): the relief the detail normal carries is raised where its shading mips flat — from ~20 m, whole by
  // ~45 m, to ~300 m, gone by 600 m — and left as it was beside the camera (where "crumpled metal" set its strength),
  // wherever the steep-face attenuation holds it down (the furry flanks under a low sun stay as they were) and on a field
  {
    float camDk = distance(vWPos, cameraPosition);
    // (hold 54: the gain on a field's crop rows and turned soil was the shimmer — their stripes sit near the pixel's own
    // frequency at range, +2.1 points of a one-pixel jitter's flips on Frontier's establishing view; a field keeps its own)
    dk *= 1.0 + DK_RANGE_GAIN * smoothstep(18.0, 45.0, camDk) * (1.0 - smoothstep(300.0, 600.0, camDk))
      * (1.0 - clamp(gSplatSteepAtt / 0.62, 0.0, 1.0)) * (1.0 - max(gCropW, gSoilW));
  }
  // (waves 62 and 76, Caldera's rim: "white specular glints … crumpled foil" — not specular: a dry texel's roughness is
  // floored at 0.92) on a slope turned from the sun the detail normals' sun-facing facets lit full, where on the ground
  // the grains' own neighbours shade them: the bright speckle of a backlit flank. On a volcanic map the detail relief
  // fades as the surface turns from the sun (its fine ash and basalt grain; the light's own shading carries the slope)
  // (wave 85, the backlit ash after that: "a crushed, nearly texture-less blue-black fill with no skylight fill, rim
  // light or grain") fading the whole relief took its grain out of the sky's light too. Only the facets' tilt toward the
  // sun goes now — the perturbation's component along the sun's heading, where it is positive — so no grain catches the
  // sun its slope is turned from, while every other tilt still shades the sky's and the bounce's light
  vec3 pN = vec3(dN.x, dN.z, dN.y) * dk; // the detail perturbation in world axes (horizontal: the third channel is unused)
  // (the Redrock lane, round 11b, the gauntlet's wave 298b: "bright white jagged flecks" on the backlit jebel faces —
  // the joints' and honeycomb's detail facets tilted to a sun the face is turned from: a jebel face takes the same law)
  float avertW = max(uReduxFold.w, gJebelMatte);
  if (avertW > 0.001) {
    float avert = (1.0 - smoothstep(-0.06, 0.32, dot(gN, uSunDirW))) * avertW;
    vec2 sH = uSunDirW.xz / max(length(uSunDirW.xz), 1e-4);
    pN.xz -= sH * max(dot(pN.xz, sH), 0.0) * avert;
  }
  vec3 wN = normalize(vec3(gN.x + pN.x, max(gN.y, 0.02) + pN.y, gN.z + pN.z));
  normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
}
`;

/** The shared B channel cannot hold both landform gating and liquid coverage. */
export function selectTerrainLandformMask(
  splat: SplatConfig | null | undefined,
  landform: HeightField['_mesaW'],
): HeightField['_mesaW'] {
  return splat?.seaLake || splat?.iceLake ? null : landform;
}

/** The snow-on-rock hold as the shader carries it (terrain.ts SPLAT_COMMON_FRAG): slope 0.30 (45.6°) to 0.56 (63.9°). */
export const SNOW_ROCK_HOLD_LINE = 'float hold = 1.0 - smoothstep(0.30, 0.56, slope + (0.5 - gully) * 0.40 - vFold * 0.12);';
/**
 * Ground lane (2026-10-05): a map's own snow-on-rock law — the hold line with its slope thresholds (degrees turned to the
 * shader's 1 − n.y) and its crest weight, each field it leaves out at today's value — or null when it sets none of
 * them, so its material compiles the shared source unchanged.
 */
export function snowRockHoldLine(S: Pick<SplatConfig, 'snowRockSlopeDeg' | 'snowRockFadeDeg' | 'snowRockCrest'> | null | undefined): string | null {
  if (S?.snowRockSlopeDeg === undefined && S?.snowRockFadeDeg === undefined && S?.snowRockCrest === undefined) return null;
  const slopeOf = (deg: number): number => 1 - Math.cos(deg * Math.PI / 180);
  const s0 = S.snowRockSlopeDeg !== undefined ? slopeOf(S.snowRockSlopeDeg) : 0.30;
  const s1 = S.snowRockFadeDeg !== undefined ? slopeOf(S.snowRockFadeDeg) : 0.56;
  const k = S.snowRockCrest ?? 0.12;
  if (!(s1 > s0) || !(k >= 0)) throw new Error(`snowRock: the fade must end past its start and the crest weight be non-negative (${s0}, ${s1}, ${k})`);
  return `float hold = 1.0 - smoothstep(${s0.toFixed(4)}, ${s1.toFixed(4)}, slope + (0.5 - gully) * 0.40 - vFold * ${k.toFixed(4)});`;
}

function createWetSplatLayer(S: SplatConfig, aniso: number): TerrainTextureLayer {
  return S.iceLake
    ? makeIceLayer(3003, aniso)
    : S.seaLake // maps r1 (ADDITIVE): open-water sheet (coastal sea / rivers)
      ? makeSeaLayer(3003, aniso, S.mudTone || null)
      : makeGroundLayer(3003, 'mud', aniso, S.mudTone || null, S.mudRough ?? 1);
}

function* createWetSplatLayerSteps(
  S: SplatConfig,
  aniso: number,
): Generator<void, TerrainTextureLayer, void> {
  if (S.iceLake || S.seaLake) return createWetSplatLayer(S, aniso);
  return yield* makeGroundLayerSteps(3003, 'mud', aniso, S.mudTone || null, S.mudRough ?? 1);
}

function* createSplatMaterialSteps(
  engineCtx: TerrainEngineContext,
  layout: TerrainLayout,
  splatCfg: SplatConfig | null | undefined,
  mapId = 'verdant',
  landformW: HeightField['_mesaW'] = null,
  waterWetnessAt: HeightField['_waterWetnessAt'] | null = null,
  sourcePreparation: TerrainSourcePreparation | null = null,
  seaOpenings: readonly SeaOpening[] = [],
  sky: { sunAzimuthDeg?: number; sunElevationDeg?: number } | null = null,
  outlandWaterAt: HeightField['getOutlandWaterAt'] | null = null,
  sorWetnessAt: HeightField['_sorWetnessAt'] | null = null,
): Generator<void | TerrainSourceCheckpoint, {
  material: THREE.MeshStandardMaterial; textures: THREE.Texture[];
  waterMask: THREE.Texture; waterNormal: THREE.Texture;
  /** Round 47: the baked bay-contour mask past the square and the world size it spans (m). */
  outlandWater: { texture: THREE.Texture; sizeM: number };
  /** Settles when the sourced textures have replaced the procedural layers in place (or failed to). */
  sourcedReady?: Promise<void>;
}, void> {
  const S = splatCfg || {};
  // ground lane (2026-10-05): the map's own snow-on-rock law, or null — today's exact source (snowRockHoldLine)
  const snowHold = snowRockHoldLine(S);
  // ground lane: the two-formation bedrock's boundary — the build sets it from the field's height span (S.formation)
  const formationUniform = { value: new THREE.Vector4(-1e9, 0, 0, 0) };
  // the Redrock lane: the formations' own tints (set by the build with the boundary; inert while uFormation.x is off)
  const formationLowUniform = { value: new THREE.Vector4(1.40, 1.14, 0.82, 0.32) };
  const formationUpUniform = { value: new THREE.Vector4(1.50, 0.92, 0.66, 0.18) };
  const ringCapUniform = { value: new THREE.Vector2(1e9, 1e9 + 1) }; // ground lane (wave 65): off until the build sets it
  const rockMask = selectTerrainLandformMask(S, landformW);
  // r6 terrain_environment: the mesa/rim landform weight rides the MASK's
  // BLUE channel on maps that provide landformW (desert — it has no marshes
  // or lakes, so B is free there). A dedicated sampler blew the 16-unit
  // fragment texture limit; uRockGate tells the shader how to read B.
  // r5: terrain layers get the FULL 16x anisotropy regardless of the global
  // default — the 4x cap was the root of the long "rain streak" smears down
  // every steep face seen at grazing angles (mesa flanks, cut banks): past a
  // 4:1 footprint the sampler can only blur along the compressed axis.
  const aniso = Math.max(16, engineCtx.anisotropy ?? 4);
  function* prepareSourceLayer(key: 'G' | 'D' | 'R'): Generator<TerrainSourceCheckpoint, void, void> {
    if (sourcePreparation?.prepareLayer) yield () => sourcePreparation.prepareLayer!(key);
  }
  yield* prepareSourceLayer('G');
  const grass = sourcePreparation?.tryCreateLayer('G', aniso)
    ?? makeGrassLayer(3000, aniso, S.grassTone || null);
  yield;
  yield* prepareSourceLayer('D');
  const dirt = sourcePreparation?.tryCreateLayer('D', aniso)
    ?? makeDirtLayer(3001, aniso, S.dirtTone || null);
  yield;
  // r7: cfg.splat.sandstone routes the R layer to the stratified
  // sedimentary painter (desert cliffs). The sourced Rock063 set is
  // disabled for that map in sourcedTextures.ts — its wavy metamorphic
  // structure was the "wet-sand swirl" artifact on every canyon wall.
  yield* prepareSourceLayer('R');
  const rock = sourcePreparation?.tryCreateLayer('R', aniso) ?? (S.sandstone
    ? makeSandstoneLayer(3002, aniso, S.rockTone || null, S.sandstoneMarkers ?? 1)
    : makeGroundLayer(3002, 'rock', aniso, S.rockTone || null));
  yield;
  const wet = yield* createWetSplatLayerSteps(S, aniso);
  yield;
  const layers = { G: grass, D: dirt, R: rock, M: wet };
  // Deep-hunt 2026-07: sourced CC0 PBR sets (ambientCG/Poly Haven, see
  // docs/ATTRIBUTION.md) replace the procedural layer textures in place when
  // available; procedural stays the synchronous fallback behind the flag in
  // sourcedTextures.ts and on any load failure.
  const sourcedTexturesReady = sourcePreparation
    ? sourcePreparation.apply(layers) : applySourcedTerrain(mapId, layers, S);
  // Terrain v2 (2026-10-01, the cost pass): each albedo layer's linear mean colour and mean packed roughness, measured
  // from the layer's own image now and again when the sourced sets replace it in place. The shader reads them where it
  // took a deep-mip "tile mean" fetch (the far variant, the height transitions, the zero-mean octaves). Built inline:
  // the streaming receipts re-evaluate these steps in a sandbox where a module-level helper is a ReferenceError.
  const layerMeans = {
    G: new THREE.Vector4(0.25, 0.25, 0.2, 0.92), D: new THREE.Vector4(0.25, 0.2, 0.15, 0.95),
    R: new THREE.Vector4(0.25, 0.25, 0.25, 0.85), M: new THREE.Vector4(0.12, 0.12, 0.1, 0.8),
  };
  const measureLayerMean = (texture: THREE.Texture | undefined, out: THREE.Vector4): void => {
    const image = texture?.image as (CanvasImageSource & { width?: number; height?: number }) | undefined;
    if (!image || !image.width || !image.height || typeof document === 'undefined') return;
    try {
      const n = 32, canvas = document.createElement('canvas');
      canvas.width = n; canvas.height = n;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(image, 0, 0, n, n);
      const px = ctx.getImageData(0, 0, n, n).data;
      const srgb = texture!.colorSpace === THREE.SRGBColorSpace;
      const lin = (c: number): number => {
        const v = c / 255;
        return !srgb ? v : v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      let r = 0, g = 0, b = 0, a = 0;
      for (let i = 0; i < n * n; i++) { r += lin(px[i * 4]); g += lin(px[i * 4 + 1]); b += lin(px[i * 4 + 2]); a += px[i * 4 + 3] / 255; }
      const k = 1 / (n * n);
      if (Number.isFinite(r) && a > 0) out.set(r * k, g * k, b * k, a * k);
    } catch { /* an unreadable image keeps the neutral fallback */ }
  };
  const measureLayerMeans = (): void => {
    measureLayerMean(layers.G.albedo, layerMeans.G); measureLayerMean(layers.D.albedo, layerMeans.D);
    measureLayerMean(layers.R.albedo, layerMeans.R); measureLayerMean(layers.M.albedo, layerMeans.M);
  };
  measureLayerMeans();
  sourcedTexturesReady.then(measureLayerMeans, measureLayerMeans);
  const maskNoi = new SimplexNoise({ random: mulberry32(3010) });
  const mask = makeMaskTexture(maskNoi, layout, rockMask, waterWetnessAt,
    S.shoreDirt ? (S.seaRamp?.[0] ?? 0.40) : null, sorWetnessAt, !!S.townPaving);
  yield;
  if (!_splatFields) yield* splatFieldSteps();
  const noiseTex = makeShaderNoiseTexture(3011);
  yield;
  const tintA = S.tintA || [1.16, 1.08, 0.76];
  const tintB = S.tintB || [0.78, 0.90, 0.72];
  const tintC = S.tintC || [1.10, 1.04, 0.84];
  // neutral packed-earth default (the old 1.20/1.12/0.96 pushed roads orange)
  const roadTint = S.roadTint || [1.08, 1.04, 0.96];
  // Round 73 (2026-09-25): the ground redux profile (groundRedux.ts) resolved from the map id here, so the material
  // call keeps its shape (the receipts re-evaluate the build steps in a sandbox); the clock the swash breathes on is
  // shared with the water sheet's own time by terrainBuildSteps
  const groundProfile = resolveGroundReduxProfile(mapId);
  const redux = groundReduxUniformValues(groundProfile);
  // ground lane (2026-10-03): the map's land use (landUse.ts) — its field system's three packed vectors (zero
  // strength on a map without a row)
  const landUseProfile = resolveLandUseProfile(mapId);
  const landUse = landUseUniformValues(landUseProfile);
  // ground lane (2026-10-08): the village floored in cinder (groundRedux.ts cinderYard: Cinder Junction's yard)
  let yardCinder = Math.min(1, Math.max(0, groundProfile.cinderYard ?? 0));
  // ground lane (2026-10-08, wave 274): the thatch under a thick sward (groundRedux.ts thatch)
  let thatchV = Math.min(1, Math.max(0, groundProfile.thatch ?? 0));
  // `?ground=legacy`: every redux term at zero on the same build — the round's before / after captures A/B against it
  if (typeof location !== 'undefined' && /[?&]ground=legacy(&|$)/.test(location.search ?? '')) {
    thatchV = 0;
    redux.reduxA.fill(0); redux.reduxFold.fill(0); redux.reduxSwash.fill(0); redux.reduxSnow.fill(0);
    redux.reduxB.fill(0); redux.reduxC.fill(0); // round 73b
    redux.reduxD.fill(0); // terrain v2
    landUse.landA[0] = 0; // ground lane: no fields
    yardCinder = 0;
  }
  // ground lane (2026-10-03, the GPU fix): the land use baked once from its CPU twin at the interior mask's texel scale
  // (landUse.ts bakeLandUseSteps), stacked under the ground mask below (stackLandUseBake) — 64 rows a build step
  const landBakeN = mask.image.width;
  // ground lane (2026-10-04): the land use's tier (landUseTierOf) from the live preset, kept current across changes
  const landTier = { value: landUseTierOf(resolvePresetName()) };
  const offLandTier = onPresetChange(() => { landTier.value = landUseTierOf(resolvePresetName()); });
  const landBake = landUse.landA[0] > 0 ? new Uint8Array(landBakeN * landBakeN * 4 * LAND_BAKE_LAYERS) : null;
  if (landBake) yield* bakeLandUseSteps(landUseProfile, landBakeN, MAP_SIZE, landBake, 64);
  const groundClock = { value: 0 };
  // the live uniform objects (a probe zeroes a term to isolate its cost or its look)
  const reduxUniforms = {
    uReduxA: { value: new THREE.Vector4(...redux.reduxA) },
    uReduxFold: { value: new THREE.Vector4(...redux.reduxFold) },
    uReduxSwash: { value: new THREE.Vector4(...redux.reduxSwash) },
    uReduxSnow: { value: new THREE.Vector3(...redux.reduxSnow) },
    uReduxB: { value: new THREE.Vector4(...redux.reduxB) }, // round 73b: lip / verge / rim / mid albedo
    uReduxC: { value: new THREE.Vector4(...redux.reduxC) }, // round 73b: rim tint rgb, drift edge
    uReduxD: { value: new THREE.Vector4(...redux.reduxD) }, // terrain v2: exposure, climate class, bed irregularity
  };

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, metalness: 0.0 });
  mat.addEventListener('dispose', () => { offLandTier(); });
  // round 72b: the ring's surface atlas uniforms — off (amplitude 0, uRingDraw 0) until the ring binds its bake
  // (horizonAutumnGround.bindAutumnHorizonGround). The program has no unit to spare for the atlas (see the fragment's
  // uRingDraw note): the M normal's uniform object is shared here so the ring bands' draw can point that unit at the
  // atlas and put the marsh normal back after it. Built inline: the streaming receipts re-evaluate these steps in a
  // sandbox where a module-level helper is a ReferenceError (the round-42 trap).
  const ringReliefUniforms: Record<string, THREE.IUniform> = {
    uRingDraw: { value: 0 }, uRingReliefR: { value: new THREE.Vector2(0, 1) },
    uRingReliefGrad: { value: 1 }, uRingReliefAmp: { value: 0 },
    // terrain v3 (2026-10-02): the slope band over which the atlas gradient fades on the ring's walls; (2, 3) = none —
    // the ring's bind (horizonAutumnGround.ts) sets it per relief character
    uRingReliefWall: { value: new THREE.Vector2(2, 3) },
    uNrmM: { value: layers.M.normal },
  };
  mat.userData.ringReliefUniforms = ringReliefUniforms;
  // r3: DoubleSide — at chunk borders where LOD levels disagree on a steep
  // cliff edge, the higher chunk's skirt ribbon can face AWAY from a camera
  // looking across the boundary; the culled backface opened a fog-bright
  // sliver through the desert canyon pass (battlefield_desert center).
  mat.side = THREE.DoubleSide;
  function assignSplatTextureUniforms(shader: MaterialShader): void {
    shader.uniforms.uAlbG = { value: layers.G.albedo };
    shader.uniforms.uAlbD = { value: layers.D.albedo };
    shader.uniforms.uAlbR = { value: layers.R.albedo };
    shader.uniforms.uAlbM = { value: layers.M.albedo };
    shader.uniforms.uNrmG = { value: layers.G.normal };
    shader.uniforms.uNrmD = { value: layers.D.normal };
    shader.uniforms.uNrmR = { value: layers.R.normal };
    shader.uniforms.uNrmM = ringReliefUniforms.uNrmM; // round 72b: shared with the ring bands' atlas swap
    shader.uniforms.uMask = { value: maskStack.texture };
    shader.uniforms.uMaskStack = { value: maskStack.stack };
    shader.uniforms.uLandBake = { value: maskStack.bake };
    shader.uniforms.uRoadClass = { value: maskStack.road };
    shader.uniforms.uRoadFrame = { value: maskStack.frame }; // roads lane (2026-10-09): the road frame layer's size and first row
    shader.uniforms.uLandTier = landTier;
    shader.uniforms.uLandRot = { value: new THREE.Vector2(Math.cos(landUse.landA[1]), Math.sin(landUse.landA[1])) };
    shader.uniforms.uMaskSize = { value: groundMask === mask ? MAP_SIZE : OUTLAND_WATER_MASK_SIZE_M };
    shader.uniforms.uNoise = { value: noiseTex };
    // terrain v2: the layers' measured means (the same vectors measureLayerMeans refreshes after the sourced swap)
    shader.uniforms.uMeanG = { value: layerMeans.G };
    shader.uniforms.uMeanD = { value: layerMeans.D };
    shader.uniforms.uMeanR = { value: layerMeans.R };
    shader.uniforms.uMeanM = { value: layerMeans.M };
  }
  function assignSplatToneUniforms(shader: MaterialShader): void {
    shader.uniforms.uTintA = { value: new THREE.Vector3(...tintA) };
    shader.uniforms.uTintB = { value: new THREE.Vector3(...tintB) };
    shader.uniforms.uTintC = { value: new THREE.Vector3(...tintC) };
    shader.uniforms.uRoadTint = { value: new THREE.Vector3(...roadTint) };
    shader.uniforms.uSoilTint = { value: new THREE.Vector3(...(S.soilTint ?? [1, 1, 1])) };
    shader.uniforms.uPloughLift = { value: S.ploughLift ?? 1 };
    shader.uniforms.uMarshGloss = { value: S.marshGloss ?? 0 };
    shader.uniforms.uMicroAmp = { value: S.microAmp ?? 1 };
    shader.uniforms.uRoadPuddle = { value: S.roadPuddles ?? 1 }; // ground lane: the ruts' puddles and their mud (1 = every vegetated map's today)
    shader.uniforms.uStrata = { value: S.strata ?? 0 };
    // the Redrock lane: a sheer wall's weathering under a grazing sun (splat.wallWeather; absent = today's 0.26, 0.50)
    shader.uniforms.uWallWeather = { value: new THREE.Vector2(...(S.wallWeather ?? [0.26, 0.50])) };
    // the Redrock lane, round 9: Wadi Rum's jebel faces (splat.jebelFace; absent = off)
    shader.uniforms.uJebelFace = { value: S.jebelFace ? new THREE.Vector4(1, ...S.jebelFace) : new THREE.Vector4(0, 0, 0, 0) };
    shader.uniforms.uFormation = formationUniform; // ground lane: set by the build from the field's height span
    shader.uniforms.uFormationLow = formationLowUniform; // the Redrock lane
    shader.uniforms.uFormationUp = formationUpUniform;
    // (roads lane R1c: a map's paved surfaces — its splat's, else the catalogue's — take its roads whole, or its town's)
    const pavedCfg: PavedSurfaceConfig | undefined = S.pavedSurface ?? MAP_PAVED_SURFACES[mapId];
    shader.uniforms.uRoadTex = { value: S.pavedRoads || (pavedCfg?.street && !pavedCfg.townOnly) ? 1 : clamp(S.roadTexMix ?? 0, 0, 1) };
    const town = layout.village; // map revival lane 2: the paved town rect (townPaving), off unless the map authors it
    shader.uniforms.uTownPave = { value: S.townPaving || pavedCfg?.townOnly ? new THREE.Vector4((town.x0 + town.x1) / 2, (town.z0 + town.z1) / 2,
      (town.x1 - town.x0) / 2, (town.z1 - town.z0) / 2) : new THREE.Vector4(0, 0, 0, 0) };
    // roads lane R1c (2026-10-09): the paved surfaces (pavedSurfaceUniforms)
    const paved = pavedSurfaceUniforms(pavedCfg, town);
    shader.uniforms.uPaveClass = { value: new THREE.Vector4(...paved.cls) };
    shader.uniforms.uPaveWear = { value: new THREE.Vector4(...paved.wear) };
    shader.uniforms.uPaveTown = { value: new THREE.Vector4(...paved.town) };
    shader.uniforms.uPaveExtra = { value: new THREE.Vector4(...paved.extra) };
    shader.uniforms.uTownWear = { value: S.townWear ?? 1 };
    shader.uniforms.uYardCinder = { value: yardCinder };
    shader.uniforms.uThatch = { value: thatchV };
    shader.uniforms.uWornDirtStrength = { value: clamp(S.wornDirtStrength ?? 0.84, 0, 1) };
    shader.uniforms.uShoulderDirt = { value: clamp(S.shoulderDirt ?? 1, 0, 1) };
    shader.uniforms.uLaneK = { value: roadLaneSharpness(mask.image.width) }; // road pass 2026-09-12
    shader.uniforms.uIceDrift = { value: (S.iceLake || S.seaLake) ? (S.iceDrift ?? 0.85) : 0 };
  }
  // Round 47: the map's bay contours baked once over ±1536 m at the interior mask's 2 m precision — R = wetness. A 1×1 zero texture on
  // maps without open sea keeps the sampler bound and the fetch a constant.
  const OUTLAND_WATER_MASK_SIZE_M = 3072;
  const outlandWaterMask = ((): THREE.DataTexture => {
    const active = !!(splatCfg?.seaLake && seaOpenings.length && outlandWaterAt);
    const n = active ? mask.image.width * 3 : 1; // preserve the interior texel scale on every tier
    const data = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const wetness = active ? outlandWaterAt!(((i + 0.5) / n - 0.5) * OUTLAND_WATER_MASK_SIZE_M,
          ((j + 0.5) / n - 0.5) * OUTLAND_WATER_MASK_SIZE_M)?.wetness ?? 0 : 0;
        data[k] = Math.round(Math.min(1, Math.max(0, wetness)) * 255);
      }
    }
    const texture = new THREE.DataTexture(data, n, n, THREE.RedFormat);
    texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping; texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false; texture.needsUpdate = true; texture.name = 'terrain:outlandWater';
    return texture;
  })();
  // A continuous mask keeps the ring's shelf shading at the same precision as
  // the battlefield. Interpolated per-vertex coast weights made triangular
  // dark patches along narrow banks. Reuse the mask sampler, not a 17th unit.
  const groundMask = ((): THREE.DataTexture => {
    if (outlandWaterMask.image.width === 1) return mask;
    const n = outlandWaterMask.image.width, inner = mask.image.width;
    const data = new Uint8Array(n * n * 4), offset = (n - inner) / 2;
    const outer = outlandWaterMask.image.data!;
    for (let i = 0; i < n * n; i++) data[i * 4 + 2] = outer[i];
    // Roads and frontage wear continue on the boundary texel before their
    // existing 36/96 m shader fade. Water always uses the actual outer contour.
    const roadBorder = Math.ceil(n * 96 / OUTLAND_WATER_MASK_SIZE_M);
    for (let row = -roadBorder; row < inner + roadBorder; row++) for (let col = -roadBorder; col < inner + roadBorder; col++) {
      const src = (Math.min(inner-1,Math.max(0,row))*inner + Math.min(inner-1,Math.max(0,col)))*4;
      const dst = ((row+offset)*n+col+offset)*4;
      data[dst]=mask.image.data![src]; data[dst+1]=mask.image.data![src+1]; data[dst+3]=mask.image.data![src+3];
    }
    for (let row = 0; row < inner; row++) {
      data.set(mask.image.data!.subarray(row * inner * 4, (row + 1) * inner * 4), ((row + offset) * n + offset) * 4);
    }
    const texture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
    texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = true; texture.anisotropy = 4; texture.needsUpdate = true;
    texture.name = 'terrain:continuousCoastMask';
    return texture;
  })();
  const maskStack = stackLandUseBake(groundMask, landBake, landBakeN,
    (mask.userData as { roadLayer?: { data: Uint8Array; n: number } }).roadLayer ?? null,
    (mask.userData as { roadFrame?: { data: Uint8Array; n: number } }).roadFrame ?? null);
  function assignSplatBiomeUniforms(shader: MaterialShader): void {
    // maps r1 (ADDITIVE, uSea-gated in the shader — 0 on every pre-existing
    // map): open-water mode. Remaps the wide marsh-mask shore ramp into a
    // bare sand/mud apron + surf line + open-water weight; the "drift" field
    // becomes sand shoals (D layer) instead of snow (G layer).
    shader.uniforms.uSea = { value: S.seaLake ? 1 : 0 };
    // round 40: the sea openings past the square (edgeWater.ts) — the ring's faces inside them render as open water
    shader.uniforms.uSeaOpenings = { value: seaOpeningUniforms(seaOpenings) };
    shader.uniforms.uSeaBanks = { value: seaBankUniforms(seaOpenings) };
    shader.uniforms.uSeaOpeningCount = { value: Math.min(4, seaOpenings.length) };
    shader.uniforms.uSeaFoam = { value: S.seaLake ? (S.seaFoam ?? 0.8) : 0 };
    shader.uniforms.uSeaRamp = { value: new THREE.Vector2(...(S.seaRamp || [0.40, 0.78])) };
    shader.uniforms.uMidRelief = { value: S.midRelief ?? 1 };
    shader.uniforms.uSlopeGrassHold = { value: S.slopeGrassHold ?? 0 }; // round 45
    shader.uniforms.uRingRock = { value: new THREE.Vector2(...(S.ringRockSlope ?? [0.22, 0.48])) }; // round 49
    shader.uniforms.uRingCap = ringCapUniform; // ground lane (wave 65): set by the build from the field's highest ground
    shader.uniforms.uCaprockY = { value: new THREE.Vector2(...(S.caprockY ?? [1e9, 1e9 + 1])) }; // the Redrock lane
    // round 55: the bedded sandstone R (no sourced R in the map's plan) carries the noise wall crag, not the tile's beds
    shader.uniforms.uBeddedR = { value: S.sandstone && !sourcedTerrainLayerPlanned(mapId, S, 'R') ? 1 : 0 };
    shader.uniforms.uPavedRock = { value: sourcedTerrainLayerSet(mapId, S, 'R') === 'cobble' ? 1 : 0 }; // the map-borders lane
    // maps lane B (2026-10-03): airfield concrete and a sor's salt crust (both off unless the map authors them)
    shader.uniforms.uPaveSlab = { value: new THREE.Vector4(S.pavement ? S.pavement.slabM : 0, S.pavement?.jointM ?? 0.04,
      S.pavement?.stains ?? 1, S.pavement?.tyres ?? 1) };
    shader.uniforms.uSaltCrust = { value: new THREE.Vector4(S.saltCrust ? 1 : 0, S.saltCrust?.crackM ?? 1.8,
      S.saltCrust?.damp ?? 1, 0) };
    // r2: agrarian field patchwork — only sensible on temperate farmland maps
    // ground lane (2026-10-03): a map with a land-use row (landUse.ts) draws its real fields instead
    shader.uniforms.uFieldPatch = { value: landUseProfile ? 0 : S.fieldPatch ?? 0 };
    shader.uniforms.uLandA = { value: new THREE.Vector4(...landUse.landA) };
    shader.uniforms.uLandB = { value: new THREE.Vector4(...landUse.landB) };
    shader.uniforms.uLandC = { value: new THREE.Vector4(...landUse.landC) };
    shader.uniforms.uLandD = { value: new THREE.Vector4(...landUse.landD) };
    shader.uniforms.uLandE = { value: new THREE.Vector4(...landUse.landE) };
    // r3: desert macro sheet variation + ice fresnel sky tint
    shader.uniforms.uSandMacro = { value: S.sandMacro ?? 0 };
    shader.uniforms.uIceSky = { value: new THREE.Vector3(...(S.iceSky || [0.66, 0.72, 0.82])) };
    shader.uniforms.uMidFar = { value: S.midReliefFar ?? 480 };
    // r6: landform rock gate — 1 = rock/strata keyed to the mask-B landform
    // weight (desert), 0 = slope-only legacy behavior (B stays marsh/ice)
    shader.uniforms.uRockGate = { value: rockMask ? 1 : 0 };
    // the map-revival lane (2026-10-05): the terrace zones' rects and riser band (T2; count 0 without terraces)
    const terraceUniforms = terrainTerraceUniforms(layout.terrain.terraces);
    shader.uniforms.uTerraceRect = terraceUniforms.uTerraceRect;
    shader.uniforms.uTerraceParam = terraceUniforms.uTerraceParam;
    const rd = S.rippleDir || [0.8, 0.6];
    const rl = Math.hypot(rd[0], rd[1]) || 1;
    shader.uniforms.uRipple = {
      // terrain v2: the wind's share of the authored ripples (groundRedux windRipple: 0 on an airless map)
      value: new THREE.Vector4(rd[0] / rl, rd[1] / rl, (S.rippleAmp ?? 0) * Math.max(0, groundProfile.windRipple ?? 1), S.rippleShoreOnly ? 1 : 0),
    };
    // the Redrock lane, round 10: the near trains' own strength (rippleAmp's on every map that sets none) and the roads' ruts
    shader.uniforms.uRippleNear = { value: (S.rippleNear ?? S.rippleAmp ?? 0) * Math.max(0, groundProfile.windRipple ?? 1) };
    shader.uniforms.uRoadRuts = { value: new THREE.Vector3(...(S.roadRuts ?? [1, 0, 0])) };
    // roads lane (2026-10-09): the worked carriageway (relief, stones, potholes, treads) and (washboard, tone floor, lanes'
    // albedo share, windrow) — the map's override, else its climate's row under its splat.roadSurface
    const roadWork = roadSurfaceUniforms(mapId, groundProfile.climate, S.roadSurface);
    shader.uniforms.uRoadSurf = { value: new THREE.Vector4(...roadWork.a) };
    shader.uniforms.uRoadSurfB = { value: new THREE.Vector4(...roadWork.b) };
    // round 42: the sun the vista ring shades with, and the sky-light weight for steep faces turned from it
    shader.uniforms.uSunDirW = { value: skySunDirection(sky) };
    // media r5: the first compile's sun uniform is shared by every later program variant (a light-count recompile
    // included), so Scene Studio can turn the wall sky light with a moved sun and restore it; battles keep the
    // authored value in it, exactly as each compile computed before
    if (mat.userData.sunDirUniform) Object.assign(shader.uniforms, { uSunDirW: mat.userData.sunDirUniform });
    else mat.userData.sunDirUniform = shader.uniforms.uSunDirW;
    // (2026-10-04: the light rig's live gain — round 42's on the legacy rig, none on the grounded rig, groundBounce.ts
    // WALL_SKY_LIFT_LEGACY; a map's own splat.wallSkyLift stays its own on both)
    shader.uniforms.uWallSkyLift = S.wallSkyLift != null ? { value: S.wallSkyLift } : terrainWallSkyLift;
    // round 72b: the ring's surface atlas — neutral until horizonAutumnGround.bindAutumnHorizonGround points these at the
    // ring's own bake (the same uniform objects, so a bind after the compile still reaches the program)
    shader.uniforms.uRingDraw = ringReliefUniforms.uRingDraw;
    shader.uniforms.uRingReliefR = ringReliefUniforms.uRingReliefR;
    shader.uniforms.uRingReliefGrad = ringReliefUniforms.uRingReliefGrad;
    shader.uniforms.uRingReliefAmp = ringReliefUniforms.uRingReliefAmp;
    // round 73 (2026-09-25): the ground redux terms — four packed vectors and the shoreline clock, no sampler
    shader.uniforms.uReduxA = reduxUniforms.uReduxA;
    shader.uniforms.uReduxFold = reduxUniforms.uReduxFold;
    shader.uniforms.uReduxSwash = reduxUniforms.uReduxSwash;
    shader.uniforms.uReduxSnow = reduxUniforms.uReduxSnow;
    shader.uniforms.uReduxB = reduxUniforms.uReduxB; // round 73b
    shader.uniforms.uReduxC = reduxUniforms.uReduxC; // round 73b
    shader.uniforms.uReduxD = reduxUniforms.uReduxD; // terrain v2
    shader.uniforms.uRingReliefWall = ringReliefUniforms.uRingReliefWall; // terrain v3: the atlas gradient's wall fade
    // terrain v3: the probes' runtime handle on the program's uniforms (the ring lab varies terms without a rebuild)
    mat.userData.splatUniforms = shader.uniforms;
    shader.uniforms.uGroundTime = groundClock;
  }
  const splatHook: MaterialShaderHook = (shader) => {
    assignSplatTextureUniforms(shader);
    assignSplatToneUniforms(shader);
    assignSplatBiomeUniforms(shader);
    // round 73: the baked fold attribute rides the chunk vertices (the horizon ring's faces carry none and read 0)
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;\nattribute float fold;\nvarying float vFold;\nattribute float shore;\nvarying float vShore;\nattribute vec2 roadExit;\nvarying vec2 vRoadExit;\nattribute vec4 borderTint;\nvarying vec4 vBorderTint;\nattribute vec4 borderTrack;\nvarying vec4 vBorderTrack;\nattribute vec2 railExit;\nvarying vec2 vRailExit;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);\nvFold = fold;\nvShore = (1.0 - shore) * 32.0;\nvRoadExit = roadExit;\nvBorderTint = borderTint;\nvBorderTrack = borderTrack;\nvRailExit = railExit;'); // round 73b: the shore byte is inverted so a geometry without it (the ring bands) reads 32 m; the map-borders lane: roadExit (a geometry without it reads no road)
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <common>',
      '#include <common>\n' + (snowHold ? _mustReplace(SPLAT_COMMON_FRAG, SNOW_ROCK_HOLD_LINE, snowHold) : SPLAT_COMMON_FRAG));
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <map_fragment>',
      'splatCompute();\ndiffuseColor.rgb *= gSplatAlbedo;');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <roughnessmap_fragment>',
      'float roughnessFactor = roughness * gSplatRough;');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <normal_fragment_maps>',
      SPLAT_NORMAL_FRAG);
    // Round 42: the sky's light on steep faces turned from the sun. The fog colour is the horizon sky average the
    // sky probe publishes every frame (round 37), so the term follows the rendered sky — bright hazy sky, brighter
    // shaded walls; a dim night sky, next to nothing — and the material's own albedo keeps a basalt wall dark and a
    // limestone wall pale. Faces the sun lights are untouched (gWallSky is 0 there).
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <lights_fragment_end>',
      '#include <lights_fragment_end>\n#ifdef USE_FOG\nreflectedLight.indirectDiffuse += fogColor * (uWallSkyLift * gWallSky) * BRDF_Lambert(diffuseColor.rgb);\n#endif'
      // ground lane (wave 85, Caldera's backlit rim: "a crushed, nearly texture-less blue-black fill with no skylight fill"):
      // a slope turned from the sun on a volcanic basin faces the sunlit ash floor below it, and the light model's ground
      // (a constant tone at half the zoned ash's albedo) under-counts that warm bounce — the face's indirect light is drawn
      // two thirds of the way to a warm grey-brown of its own luminance and lifted 45 % (gVolcShade: from ~14°, turned from
      // the sun; 0 on every other map, and a sunlit face is untouched)
      + '\nif (uReduxFold.w > 0.001) { float cotWarm = gVolcShade; vec3 cotInd = reflectedLight.indirectDiffuse;'
      + ' reflectedLight.indirectDiffuse = mix(cotInd, vec3(dot(cotInd, vec3(0.299, 0.587, 0.114))) * vec3(1.20, 1.0, 0.76), 0.65 * cotWarm) * (1.0 + 0.45 * cotWarm); }'
      // round 72b: the ring bands' baked cast shadows on the sun's light and their occlusion on the sky's
      + '\nreflectedLight.directDiffuse *= gRingSun; reflectedLight.directSpecular *= gRingSun; reflectedLight.indirectDiffuse *= gRingAo;');
    // Round 73: the folds' occlusion joins Three's own ambient-occlusion stage — indirect light only, as an aoMap would
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <aomap_fragment>',
      '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= gFoldAO;'
      // ground lane (wave 83, Verdant's plough: "a cold blue-black surface" — on screen a near-neutral grey, 66/65/69, where
      // its albedo is a warm near-black): at a field's ~0.035 albedo the grazing view's sky reflection outweighs the soil's
      // own colour; a turned field's clods mask most of that sheen, so its specular light keeps three tenths (wave 88: at
      // half the sky's blue still turned the warm earth maroon) — gSoilW: the plough, the terra rossa, a vineyard's earth,
      // slag and ballast
      + '\nreflectedLight.directSpecular *= 1.0 - 0.7 * gSoilW; reflectedLight.indirectSpecular *= 1.0 - 0.7 * gSoilW;'
      // the Redrock lane, round 11b (the gauntlet's wave 298b: "white smears down its fins" on the backlit walls): a fin's
      // side seen edge-on against the sun took the grazing Fresnel sheen of the sun and the bright sky by it, near white
      // over the red; dry sandstone is matte — a jebel face keeps a tenth of its specular light (gJebelMatte)
      + '\nreflectedLight.directSpecular *= 1.0 - 0.9 * gJebelMatte; reflectedLight.indirectSpecular *= 1.0 - 0.9 * gJebelMatte;');
    if (seaOpenings.length) shader.fragmentShader = fadeDistantCoastShadows(shader.fragmentShader, 'vWPos');
  };
  // the scenery lane (visual/shadow-bias, 2026-10-04): the ground casts no shadow (its chunks and the horizon ring that
  // draws its faces with this material keep castShadow false), so it takes no caster's acne bias: its shadows meet each
  // caster at the contact (lighting.ts RECEIVER_ONLY_SHADOW_NOTE)
  mat.userData.cotShadowReceiverOnly = true;
  engineCtx.setupShadowMaterial(mat, splatHook);
  // (a map's own snow-on-rock law compiles its own source, so it keys its own program; every other map keeps the key)
  mat.customProgramCacheKey = () => `world-terrain-splat-v54-${seaOpenings.length ? 'coast' : 'land'}${snowHold ? `-${snowHold.replace(/[^0-9.]+/g, '_')}` : ''}`; // terrain v3 (2026-10-02): v54
  mat.userData.sourcedTexturesReady = sourcedTexturesReady;
  mat.userData.formationUniform = formationUniform;
  mat.userData.formationLowUniform = formationLowUniform;
  mat.userData.formationUpUniform = formationUpUniform;
  mat.userData.ringCapUniform = ringCapUniform;
  mat.userData.groundClock = groundClock; // round 73: advanced with the water sheet's clock (terrainBuildSteps)
  mat.userData.reduxUniforms = reduxUniforms; // round 73: the probes' term isolation (zero a vector, recapture)
  mat.userData.layerMeans = layerMeans; // terrain v2: the measured layer means (probes read and override them)
  // onBeforeCompile closures are invisible to scene resource traversal.
  // Sourced images replace these Texture objects' backing image in place,
  // so the same ten identities remain valid through async loading/reupload.
  // the first ten owners keep their positions (refreshHorizonGroundTone reads [0] grass and [4] rock albedo); the
  // round-47 outland bay mask is the eleventh
  return { material: mat, waterMask: mask, waterNormal: wet.normal,
    outlandWater: { texture: outlandWaterMask, sizeM: OUTLAND_WATER_MASK_SIZE_M }, textures: [
    grass.albedo, grass.normal, dirt.albedo, dirt.normal,
    rock.albedo, rock.normal, wet.albedo, wet.normal, mask, noiseTex,
    outlandWaterMask, ...(groundMask === mask ? [] : [groundMask]),
    ...(maskStack.texture === groundMask ? [] : [maskStack.texture]),
  ], sourcedReady: sourcedTexturesReady.then(() => undefined, () => undefined) };
}

// ---------------------------------------------------------------------------
// Chunked LOD terrain meshes
// ---------------------------------------------------------------------------

const CHUNKS = 8, CHUNK_SIZE = MAP_SIZE / CHUNKS;
const LOD_SEGS = [96, 48, 24];
// r3: 2.5 -> 6.5 — on the 38 m desert mesa walls the far-LOD (5.3 m verts)
// vs near-LOD height mismatch across a chunk border exceeded the old skirt
// and the gap flashed the fog-bright backdrop through as a white sliver in
// the canyon pass (battlefield_desert center). Deeper skirts cover the
// worst cliff-edge mismatch at every LOD pairing.
const SKIRT_DROP = 6.5;

// r7 terrain_environment TERRACING FIX: one FINE height grid per chunk (the
// LOD0 resolution, 1.33 m step) serves position AND normal sampling for all
// three LODs. The old per-LOD grids computed central-difference normals at
// the LOD's own step — 2.7/5.3 m on the mid/far LODs — and on high-curvature
// dune brinks/mesa shoulders the O(step^2 * curvature) normal error alternates
// sign row to row, printing horizontal Mach-band terraces along every contour
// (the desert critique's "heightfield quantization stair-step isolines").
// Normals now come from 1.33 m central differences at every LOD, so coarse
// meshes shade like the true surface; positions are unchanged (same heightAt
// values at the same world coords). Bonus: 9.8k height evaluations per chunk
// instead of 12.1k — boot gets slightly faster.
const FINE_SEGS = 96; // must equal LOD_SEGS[0]; strides 1/2/4 stay integral
// Live checkpoints reuse one receipt: only covered startup needs progress
// fractions. A live generator allocates buffers once, not a tuple each row.
const LIVE_TERRAIN_CHECKPOINT: TerrainBuildProgress = [0, 0, false];
function* buildFineGridSteps(
  hf: HeightField,
  cx0: number,
  cz0: number,
  progress: TerrainProgressState | null = null,
  rowsPerSlice = 8,
): Generator<TerrainBuildProgress, FineGrid, void> {
  const stepF = CHUNK_SIZE / FINE_SEGS;
  const pn = FINE_SEGS + 3; // +1 vertex row, +2 padding rows
  const hgrid = new Float64Array(pn * pn);
  for (let gz = 0; gz < pn; gz++) {
    for (let gx = 0; gx < pn; gx++) {
      hgrid[gz * pn + gx] = hf.getHeightAt(
        cx0 + (gx - 1) * stepF, cz0 + (gz - 1) * stepF,
      );
    }
    // One near chunk performs almost ten thousand procedural height samples.
    // On a throttled CPU that previously became a 0.4-1.1 s atomic task even
    // though the outer terrain builder yielded between chunks. Expose exact
    // row checkpoints to the async builder; the synchronous/capture path just
    // drains the same generator and receives byte-identical arrays.
    if ((gz + 1) % rowsPerSlice === 0 && (progress || rowsPerSlice === 1)) {
      yield progress
        ? [progress.done + 0.3 * (gz + 1) / pn, progress.total, false]
        : LIVE_TERRAIN_CHECKPOINT;
    }
  }
  return { hgrid, pn, stepF };
}

/**
 * Every chunk at one LOD has identical triangle topology. Keep exactly one
 * immutable index attribute per resolution inside a battlefield instead of
 * allocating/uploading the same array for every chunk. The largest grid is
 * under 10k vertices, so Uint16 is exact and halves the old Uint32 footprint.
 *
 * The pool is intentionally world-local: disposing one cached battlefield
 * can never invalidate a buffer still referenced by another world.
 */
/**
 * The scenery lane (gauntlet wave 74, Coastal boulder-a's line): the ground as the nearest terrain mesh draws it — the
 * chunks' finest grid (CHUNK_SIZE / LOD_SEGS[0] a cell, from −HALF) and each cell's two triangles split as
 * acquireTerrainChunkIndex below splits them (a c b and b c d: the diagonal from the cell's +x corner to its +z corner).
 * A ground decal conformed to the analytic height floats over a bank's drawn lip; one conformed to this lies on it.
 */
export function terrainNearMeshHeightAt(heightAt: (x: number, z: number) => number, x: number, z: number): number {
  const cell = CHUNK_SIZE / LOD_SEGS[0];
  const u = (x + HALF) / cell, w = (z + HALF) / cell;
  const gx = Math.floor(u), gz = Math.floor(w), fx = u - gx, fz = w - gz;
  const x0 = -HALF + gx * cell, z0 = -HALF + gz * cell;
  if (fx + fz <= 1) {
    const ha = heightAt(x0, z0);
    return ha + (heightAt(x0 + cell, z0) - ha) * fx + (heightAt(x0, z0 + cell) - ha) * fz;
  }
  const hd = heightAt(x0 + cell, z0 + cell);
  return hd + (heightAt(x0, z0 + cell) - hd) * (1 - fx) + (heightAt(x0 + cell, z0) - hd) * (1 - fz);
}

export function acquireTerrainChunkIndex(
  pool: TerrainIndexPool,
  segs: number,
): THREE.BufferAttribute {
  const cached = pool.get(segs);
  if (cached) {
    cached.references++;
    return cached.attribute;
  }
  const n = segs + 1;
  const perim = 4 * segs;
  const ring: number[] = [];
  for (let gx = 0; gx < segs; gx++) ring.push(gx);
  for (let gz = 0; gz < segs; gz++) ring.push(gz * n + (n - 1));
  for (let gx = segs; gx > 0; gx--) ring.push((n - 1) * n + gx);
  for (let gz = segs; gz > 0; gz--) ring.push(gz * n);
  const idx = new Uint16Array(segs * segs * 6 + perim * 6);
  let ii = 0;
  for (let gz = 0; gz < segs; gz++) {
    for (let gx = 0; gx < segs; gx++) {
      const a = gz * n + gx, b = a + 1, c = a + n, d = c + 1;
      idx[ii++] = a; idx[ii++] = c; idx[ii++] = b;
      idx[ii++] = b; idx[ii++] = c; idx[ii++] = d;
    }
  }
  for (let k = 0; k < perim; k++) {
    const t0 = ring[k], t1 = ring[(k + 1) % perim];
    const s0 = n * n + k, s1 = n * n + ((k + 1) % perim);
    idx[ii++] = t0; idx[ii++] = s0; idx[ii++] = t1;
    idx[ii++] = t1; idx[ii++] = s0; idx[ii++] = s1;
  }
  const attribute = new THREE.BufferAttribute(idx, 1);
  pool.set(segs, { attribute, references: 1 });
  return attribute;
}

function terrainIndexPoolReceipt(pool: TerrainIndexPool): {
  attributes: number;
  references: number;
  uniqueBytes: number;
  logicalUint16Bytes: number;
  avoidedBytes: number;
  previousUint32Bytes: number;
  totalBytesAvoided: number;
} {
  let references = 0;
  let uniqueBytes = 0;
  let logicalBytes = 0;
  for (const record of pool.values()) {
    const bytes = record.attribute.array.byteLength;
    references += record.references;
    uniqueBytes += bytes;
    logicalBytes += bytes * record.references;
  }
  return {
    attributes: pool.size,
    references,
    uniqueBytes,
    logicalUint16Bytes: logicalBytes,
    avoidedBytes: logicalBytes - uniqueBytes,
    previousUint32Bytes: logicalBytes * 2,
    totalBytesAvoided: logicalBytes * 2 - uniqueBytes,
  };
}

/** The Redrock lane, round 11d (the gauntlet's waves 298b and 314: "bright white streaks and smears running down" the
 * shaded ravine wall, "white flecks along its crest"): a joint's V side or a ledge's tread turned to a sun its wall is turned
 * from lies in the wall's own shadow — the sun reaches it only through the rock — but the shadow map's texels, metres wide
 * at a ravine's range, cannot see a 2 m notch, and the vertex normal lit it full: a sunlit sliver down every joint of a
 * backlit wall, near white at the backlit exposure. Where the wall's 8 m normal (the folds' heights) is turned from the
 * sun or grazing it, a vertex keeps no more of the sun than its wall: the normal's sun-ward excess over the wall's is
 * dropped. A sunlit wall's notches, the domes and the floor are untouched; the joints keep their shade from the sky. */
interface JebelLit { clamp(x: number, z: number, nrm: Float32Array, o: number): void }
function makeJebelLit(heights: Float32Array, n: number, origin: number, step: number, sun: THREE.Vector3): JebelLit {
  const gx = new Float32Array(n * n), gz = new Float32Array(n * n);
  const h = (i: number, j: number) => heights[Math.max(0, Math.min(n - 1, j)) * n + Math.max(0, Math.min(n - 1, i))];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      gx[j * n + i] = (h(i + 1, j) - h(i - 1, j)) / (2 * step);
      gz[j * n + i] = (h(i, j + 1) - h(i, j - 1)) / (2 * step);
    }
  }
  const lx = sun.x, ly = sun.y, lz = sun.z;
  const bilerp = (g: Float32Array, i0: number, j0: number, fu: number, fv: number) => {
    const a = g[j0 * n + i0], b = g[j0 * n + i0 + 1], c = g[(j0 + 1) * n + i0], d = g[(j0 + 1) * n + i0 + 1];
    return (a + (b - a) * fu) * (1 - fv) + (c + (d - c) * fu) * fv;
  };
  return {
    clamp(x, z, nrm, o) {
      const fy = nrm[o + 1];
      if (fy >= 0.92) return; // the floor, the domes' tops and the benches (under ~23 degrees): untouched
      const u = (x - origin) / step, v = (z - origin) / step;
      const i0 = Math.max(0, Math.min(n - 2, Math.floor(u))), j0 = Math.max(0, Math.min(n - 2, Math.floor(v)));
      const fu = Math.max(0, Math.min(1, u - i0)), fv = Math.max(0, Math.min(1, v - j0));
      const mx = -bilerp(gx, i0, j0, fu, fv), mz = -bilerp(gz, i0, j0, fu, fv);
      const ml = 1 / Math.sqrt(mx * mx + 1 + mz * mz);
      // the wall: an 8 m normal steeper than ~30 degrees; turned from the sun or grazing it (its sun cosine under 0.2)
      const wall = 1 - Math.max(0, Math.min(1, (ml - 0.72) / 0.16));
      const dM = (mx * lx + ly + mz * lz) * ml;
      const t = Math.max(0, Math.min(1, (dM + 0.05) / 0.25)), backlit = 1 - t * t * (3 - 2 * t);
      const fx = nrm[o], fz = nrm[o + 2];
      const f = Math.max(0, (fy - 0.8) / 0.12), steep = 1 - f * f * (3 - 2 * f); // eased out from ~37 to ~23 degrees
      const excess = (fx * lx + fy * ly + fz * lz - Math.max(dM, 0)) * wall * backlit * steep;
      if (excess <= 0) return;
      const ax = fx - lx * excess, ay = fy - ly * excess, az = fz - lz * excess;
      const al = 1 / Math.sqrt(ax * ax + ay * ay + az * az);
      nrm[o] = ax * al; nrm[o + 1] = ay * al; nrm[o + 2] = az * al;
    },
  };
}

function* buildChunkGeometrySteps(
  hf: HeightField,
  cx0: number,
  cz0: number,
  segs: number,
  fine: FineGrid | null,
  progress: TerrainProgressState | null = null,
  indexPool: TerrainIndexPool | null = null,
  rowsPerSlice = 8,
  foldAt: ((x: number, z: number) => number) | null = null,
  shoreAt: ((x: number, z: number) => number) | null = null,
  jebelLit: JebelLit | null = null,
): Generator<TerrainBuildProgress, THREE.BufferGeometry, void> {
  const n = segs + 1, step = CHUNK_SIZE / segs;
  const stride = FINE_SEGS / segs;
  const hgrid = fine?.hgrid || null;
  const pn = fine?.pn || 0;
  const stepF = fine?.stepF || CHUNK_SIZE / FINE_SEGS;
  const perim = 4 * segs;
  const vcount = n * n + perim;
  const pos = new Float32Array(vcount * 3);
  const nrm = new Float32Array(vcount * 3);
  // Round 73 (2026-09-25): the baked fold term (−1 crest .. +1 hollow) as one normalised byte per vertex — the
  // material's hollow moisture, fold occlusion and crest dryness read it as `fold`; a build without the sampler
  // (receipt sandboxes) writes zeros
  const fold = new Int8Array(vcount);
  // Round 73b (2026-09-26): the shore distance — metres landward of the sheet's waterline, one byte per vertex,
  // INVERTED (255 = at the waterline, 0 = 32 m or more / no shore) so a geometry without the attribute (the horizon
  // ring's bands share this material) reads as far from any shore; the wet strand runs up the beach by it
  const shore = new Uint8Array(vcount);
  const inv2e = 1 / (2 * stepF);
  function writeSurfaceRow(gz: number, startIndex: number): number {
    let vi = startIndex;
    for (let gx = 0; gx < n; gx++) {
      const wx = cx0 + gx * step, wz = cz0 + gz * step;
      const fi = hgrid ? (gz * stride + 1) * pn + (gx * stride + 1) : 0;
      const h = hgrid ? hgrid[fi] : hf.getHeightAt(wx, wz);
      pos[vi * 3] = wx; pos[vi * 3 + 1] = h; pos[vi * 3 + 2] = wz;
      if (foldAt) {
        const f = foldAt(wx, wz);
        fold[vi] = Math.max(-127, Math.min(127, Math.round((f > 1 ? 1 : f < -1 ? -1 : f) * 127)));
      }
      if (shoreAt) {
        const m = shoreAt(wx, wz);
        shore[vi] = m >= 32 ? 0 : 255 - Math.round(Math.max(0, m) * (255 / 32));
      }
      const hl = hgrid ? hgrid[fi - 1] : hf.getHeightAt(wx - stepF, wz);
      const hr = hgrid ? hgrid[fi + 1] : hf.getHeightAt(wx + stepF, wz);
      const hd = hgrid ? hgrid[fi - pn] : hf.getHeightAt(wx, wz - stepF);
      const hu = hgrid ? hgrid[fi + pn] : hf.getHeightAt(wx, wz + stepF);
      const nx = (hl - hr) * inv2e, nz = (hd - hu) * inv2e;
      const il = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
      nrm[vi * 3] = nx * il; nrm[vi * 3 + 1] = il; nrm[vi * 3 + 2] = nz * il;
      if (jebelLit) jebelLit.clamp(wx, wz, nrm, vi * 3);
      vi++;
    }
    return vi;
  }
  function* writeSurfaceVertices(): Generator<TerrainBuildProgress, void, void> {
    let vi = 0;
    for (let gz = 0; gz < n; gz++) {
      vi = writeSurfaceRow(gz, vi);
      if ((gz + 1) % rowsPerSlice === 0 && (progress || rowsPerSlice === 1)) {
        yield progress
          ? [progress.done + 0.8, progress.total, false]
          : LIVE_TERRAIN_CHECKPOINT;
      }
    }
  }
  yield* writeSurfaceVertices();
  // perimeter vertex indices in ring order (S, E, N, W edges)
  const ring: number[] = [];
  for (let gx = 0; gx < segs; gx++) ring.push(gx);                       // z=min, x asc
  for (let gz = 0; gz < segs; gz++) ring.push(gz * n + (n - 1));         // x=max, z asc
  for (let gx = segs; gx > 0; gx--) ring.push((n - 1) * n + gx);         // z=max, x desc
  for (let gz = segs; gz > 0; gz--) ring.push(gz * n);                   // x=min, z desc
  // content_breadth r3: skirt normals point OUTWARD-DOWN instead of copying
  // the (mostly up-facing) top-vertex normal. A skirt revealed through an
  // LOD T-junction crack used to shade like fully sunlit flat ground — on a
  // shadowed dune face that rendered as a blown-white sliver (the desert
  // establishing-shot artifact at the z=250 chunk border). Wall-like normals
  // shade a revealed skirt as a dark seam line instead, and the splat
  // shader's slope response paints it as rock/cliff material.
  const ccx = cx0 + CHUNK_SIZE / 2, ccz = cz0 + CHUNK_SIZE / 2;
  for (let k = 0; k < perim; k++) {
    const src = ring[k], dst = n * n + k;
    pos[dst * 3] = pos[src * 3]; pos[dst * 3 + 1] = pos[src * 3 + 1] - SKIRT_DROP; pos[dst * 3 + 2] = pos[src * 3 + 2];
    let ox = pos[src * 3] - ccx, oz = pos[src * 3 + 2] - ccz;
    const ol = Math.hypot(ox, oz) || 1;
    ox /= ol; oz /= ol;
    // outward + strong down bias: crack-revealed skirts read as shaded seams
    const oy = -0.55, oil = 1 / Math.hypot(ox, oy, oz);
    nrm[dst * 3] = ox * oil; nrm[dst * 3 + 1] = oy * oil; nrm[dst * 3 + 2] = oz * oil;
    fold[dst] = fold[src]; // round 73: a skirt continues its top vertex's fold
    shore[dst] = shore[src]; // round 73b: and its shore distance
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('fold', new THREE.BufferAttribute(fold, 1, true)); // round 73: one normalised byte per vertex
  geo.setAttribute('shore', new THREE.BufferAttribute(shore, 1, true)); // round 73b: the inverted shore byte
  geo.setIndex(acquireTerrainChunkIndex(indexPool || new Map(), segs));
  geo.computeBoundingSphere();
  return geo;
}

// ---------------------------------------------------------------------------
// Horizon mountain ring — per-map styled skylines with baked sun shading,
// altitude-banded rock detail texture, snow caps and aerial perspective.
// Lives in ./maps/horizon.ts, which installs it through horizonRingHook.ts
// (never imported here: the authority's height field must not carry it); do
// NOT reintroduce the old inline low-poly ring here — the map configs
// (cfg.horizon.style/snowline/banding/treeline) target the styled builder.
// ---------------------------------------------------------------------------

/**
 * Build the chunked-LOD terrain mesh group with the splat-blended PBR material.
 * The returned group exposes `group.userData.updateLOD(camPos)` for map.ts.
 * @param {object} heightField HeightField from createHeightField
 * @param {object} engineCtx EngineCtx (ARCHITECTURE §2.8)
 * @param {?object} [cfg=null] map config (uses cfg.splat for the palette)
 * @returns {THREE.Group} terrain chunk group
 */
export function buildTerrainMeshes(
  heightField: HeightField,
  engineCtx: TerrainEngineContext,
  cfg: TerrainMapConfig | null = null,
): THREE.Group {
  const g = terrainBuildSteps(heightField, engineCtx, cfg);
  let r = g.next();
  while (!r.done) r = g.next();
  // (2026-10-08) a supplied build left its horizon ring for the world build's end (finishHorizonRingAsync); a synchronous
  // build has no such end, so it finishes the ring here
  const stage = r.value.userData.finishHorizonRing as (() => Generator<TerrainBuildProgress, void, void>) | undefined;
  if (stage) {
    delete r.value.userData.finishHorizonRing;
    const steps = stage();
    while (!steps.next().done) { /* drained */ }
  }
  return r.value;
}

/**
 * perf-r3 (play-session probe): chunked twin of {@link buildTerrainMeshes} —
 * the one-call build was a single ~2.4 s task behind the loading bar (64
 * chunk grids x 3 LODs in one gulp). Awaits `tick(done, total)` after every
 * chunk ROW so the loading screen keeps painting and its bar can creep.
 * Byte-identical output: both wrappers drain the same generator.
 * @param {?function(number, number): (Promise<void>|void)} tick
 */
export async function buildTerrainMeshesAsync(
  heightField: HeightField,
  engineCtx: TerrainEngineContext,
  cfg: TerrainMapConfig | null = null,
  tick: TerrainBuildTick | null = null,
  fineSlices = false,
  streamOpts: TerrainStreamOptions | null = null,
  sourcePreparation = prepareSourcedTerrain(cfg?.id || 'verdant', cfg?.splat || {}, { worker: true }),
): Promise<THREE.Group> {
  const g: Iterator<TerrainBuildProgress, THREE.Group, void> =
    terrainBuildSteps(heightField, engineCtx, cfg, streamOpts, sourcePreparation);
  let completed = false;
  try {
    let r = g.next();
    while (!r.done) {
      if (tick && (fineSlices || r.value[2] || r.value[3])) await tick(r.value[0], r.value[1]);
      if (r.value[3]) {
        await r.value[3]();
        // Recheck the caller's generation/pacing guard before allocating the
        // layer textures, including cancellation during native worker work.
        if (tick) await tick(r.value[0], r.value[1]);
      }
      r = g.next();
    }
    completed = true;
    return r.value;
  } finally {
    if (!completed) {
      try { sourcePreparation.cancel?.(); } catch { /* preserve the original build failure */ }
      // Close private CPU continuations; this is not partial asset disposal.
      try { g.return?.(); } catch { /* preserve the original pacing failure */ }
    }
  }
}

/**
 * The world build's last terrain step (2026-10-08, the time-to-battle lane): the horizon ring a supplied build left on
 * the terrain group (terrainBuildSteps: userData.finishHorizonRing), drained with the build's pacing; a no-op for any
 * other group.
 */
export async function finishHorizonRingAsync(
  group: THREE.Group, tick: TerrainBuildTick | null = null, fineSlices = false,
): Promise<void> {
  const stage = group.userData.finishHorizonRing as (() => Generator<TerrainBuildProgress, void, void>) | undefined;
  if (!stage) return;
  delete group.userData.finishHorizonRing;
  const steps = stage();
  let completed = false;
  try {
    let step = steps.next();
    while (!step.done) {
      if (tick && (fineSlices || step.value[2])) await tick(step.value[0], step.value[1]);
      step = steps.next();
    }
    completed = true;
  } finally {
    // a cancelled build (its pacing threw): close the stage's private continuations
    if (!completed) { try { steps.return?.(); } catch { /* preserve the original failure */ } }
  }
}

// (buildHorizonRingSteps, the installed ring's builder, sits above the chunk section: d6103be04)
/** The installed ring's geometry pipeline (the perf lane, 2026-10-08): the ring built where it stands. */
function horizonRingGeometrySteps(
  ...args: Parameters<HorizonRing['horizonRingGeometrySteps']>
): ReturnType<HorizonRing['horizonRingGeometrySteps']> {
  return horizonRing().horizonRingGeometrySteps(...args);
}

function* terrainBuildSteps(
  heightField: HeightField,
  engineCtx: TerrainEngineContext,
  cfg: TerrainMapConfig | null,
  streamOpts: TerrainStreamOptions | null = null,
  sourcePreparation: TerrainSourcePreparation | null = null,
): Generator<TerrainBuildProgress, THREE.Group, void> {
  const group = new THREE.Group();
  group.name = 'terrain';
  // round 40: where the square's water reaches the edge the ring opens to a sea apron (edgeWater.ts); the terrain
  // material renders those ring faces as open water and the shallow-water sheet continues over them
  const seaOpenings = cfg?.splat?.seaLake && !heightField._layout.terrain.frozenMarshes
    ? resolveSeaOpenings(cfg.horizon?.seaOpening, heightField, cfg.id || '') : [];
  const materialSteps = createSplatMaterialSteps(
    engineCtx,
    heightField._layout,
    cfg ? cfg.splat : null,
    (cfg && cfg.id) || 'verdant',
    heightField._mesaW || null,
    heightField._waterWetnessAt || null,
    sourcePreparation,
    seaOpenings,
    cfg?.sky ?? null,
    heightField.getOutlandWaterAt ?? null,
    heightField._sorWetnessAt ?? null,
  );
  let materialStep = materialSteps.next();
  try {
    while (!materialStep.done) {
      yield [1, CHUNKS * CHUNKS + 2, false, materialStep.value || undefined];
      materialStep = materialSteps.next();
    }
  } finally {
    if (!materialStep.done) {
      const pending: Iterator<void | TerrainSourceCheckpoint, object, void> = materialSteps;
      try { pending.return?.(); } catch { /* preserve the original pacing failure */ }
    }
  }
  const { material: mat, textures: splatTextures, sourcedReady } = materialStep.value;
  // ground lane: the two-formation bedrock's boundary at its share of the field's height span (S.formation)
  {
    const form = (cfg?.splat as { formation?: TerrainFormation } | undefined)?.formation;
    const userData = mat.userData as { formationUniform?: { value: THREE.Vector4 }; formationLowUniform?: { value: THREE.Vector4 };
      formationUpUniform?: { value: THREE.Vector4 } };
    const u = userData.formationUniform;
    if (form && u) {
      const pale = form.pale ?? 0.16, red = form.red ?? 0.12;
      u.value.set(form.atY ?? heightField.minY + (heightField.maxY - heightField.minY) * form.atFrac, form.wobbleM ?? 2.5,
        form.edgeM ?? 1.2, 0);
      const low = form.lowerTint ?? [1.40, 1.14, 0.82, Math.min(1, pale * 2)];
      userData.formationLowUniform?.value.set(low[0], low[1], low[2], low[3]);
      const up = form.upperTint ?? [1.50, 0.92, 0.66, Math.min(1, red * 1.5)];
      userData.formationUpUniform?.value.set(up[0], up[1], up[2], up[3]);
    }
    // (wave 65) the ring's caprock above the field's highest ground (S.ringCaprockM)
    const capM = (cfg?.splat as { ringCaprockM?: number } | undefined)?.ringCaprockM;
    const cap = (mat.userData as { ringCapUniform?: { value: THREE.Vector2 } }).ringCapUniform;
    if (capM != null && cap && Number.isFinite(heightField.maxY)) cap.value.set(heightField.maxY + capM, heightField.maxY + capM + 14);
  }
  const chunks: TerrainChunk[] = [];
  const terrainIndexPool: TerrainIndexPool = new Map();
  // Round 73 (2026-09-25, the ground redux): the relief's folds, baked once per world. An 8 m grid of the map's own
  // heights (±528 m, sliced) yields a signed curvature — the 8 m and 24 m Laplacians, hollows positive — that every
  // chunk vertex carries as its `fold` byte and the tall-grass tier reads through `_foldAt`; a height field without
  // heights (receipt sandboxes) bakes nothing and the vertices carry zeros.
  let foldAt: ((x: number, z: number) => number) | null = null;
  let jebelLit: JebelLit | null = null;
  if (typeof heightField.getHeightAt === 'function') {
    const FOLD_STEP = 8, FOLD_MARGIN = 3;
    const FOLD_N = MAP_SIZE / FOLD_STEP + 1 + 2 * FOLD_MARGIN;
    const FOLD_ORIGIN = -HALF - FOLD_MARGIN * FOLD_STEP;
    const foldHeights = new Float32Array(FOLD_N * FOLD_N);
    for (let j = 0; j < FOLD_N; j++) {
      for (let i = 0; i < FOLD_N; i++) {
        foldHeights[j * FOLD_N + i] = heightField.getHeightAt(FOLD_ORIGIN + i * FOLD_STEP, FOLD_ORIGIN + j * FOLD_STEP);
      }
      if ((j & 15) === 15) yield [1, CHUNKS * CHUNKS + 2, false];
    }
    const foldGrid = new Float32Array(FOLD_N * FOLD_N);
    const hAt = (i: number, j: number): number =>
      foldHeights[Math.max(0, Math.min(FOLD_N - 1, j)) * FOLD_N + Math.max(0, Math.min(FOLD_N - 1, i))];
    for (let j = 0; j < FOLD_N; j++) {
      for (let i = 0; i < FOLD_N; i++) {
        const h = hAt(i, j);
        const lap1 = (hAt(i - 1, j) + hAt(i + 1, j) + hAt(i, j - 1) + hAt(i, j + 1)) * 0.25 - h;
        const lap3 = (hAt(i - 3, j) + hAt(i + 3, j) + hAt(i, j - 3) + hAt(i, j + 3)) * 0.25 - h;
        const f = lap1 / 1.2 + lap3 / 3.6;
        foldGrid[j * FOLD_N + i] = f > 1 ? 1 : f < -1 ? -1 : f;
      }
    }
    foldAt = (x: number, z: number): number => {
      const u = (x - FOLD_ORIGIN) / FOLD_STEP, v = (z - FOLD_ORIGIN) / FOLD_STEP;
      const i0 = Math.max(0, Math.min(FOLD_N - 2, Math.floor(u))), j0 = Math.max(0, Math.min(FOLD_N - 2, Math.floor(v)));
      const fu = Math.max(0, Math.min(1, u - i0)), fv = Math.max(0, Math.min(1, v - j0));
      const a = foldGrid[j0 * FOLD_N + i0], b = foldGrid[j0 * FOLD_N + i0 + 1];
      const c = foldGrid[(j0 + 1) * FOLD_N + i0], d = foldGrid[(j0 + 1) * FOLD_N + i0 + 1];
      return (a + (b - a) * fu) * (1 - fv) + (c + (d - c) * fu) * fv;
    };
    heightField._foldAt = foldAt;
    if (cfg?.splat?.jebelFace) jebelLit = makeJebelLit(foldHeights, FOLD_N, FOLD_ORIGIN, FOLD_STEP, skySunDirection(cfg.sky));
  }
  // Ground lane (2026-10-03): the vegetation's woods mask (vegetation.ts _woodsMask, 256² over the square) lands in the
  // noise texture's free blue channel — one 4 m texel per mask cell, the field read at the square's own scale — and on
  // the height field for the ground tiers. Called by the world's assembly once the trees are placed.
  group.userData.applyWoodsMask = (mask: Float32Array): void => {
    const size = Math.round(Math.sqrt(mask.length));
    const noise = splatTextures[9] as THREE.Texture | undefined;
    const canvas = noise?.image as HTMLCanvasElement | undefined;
    if (canvas && typeof canvas.getContext === 'function' && canvas.width === size && canvas.height === size) {
      const context = canvas.getContext('2d');
      if (context) {
        const image = context.getImageData(0, 0, size, size);
        stampWoodsMaskRows(image.data, mask, size);
        context.putImageData(image, 0, 0);
        noise!.needsUpdate = true;
      }
    }
    const cell = 1024 / size;
    heightField._woodsAt = (x: number, z: number): number => {
      const u = Math.max(0, Math.min(size - 1.001, (x + 512) / cell - 0.5));
      const v = Math.max(0, Math.min(size - 1.001, (z + 512) / cell - 0.5));
      const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * size + i;
      const a = mask[k] + (mask[k + 1] - mask[k]) * fu;
      const b = mask[k + size] + (mask[k + size + 1] - mask[k + size]) * fu;
      return a + (b - a) * fv;
    };
  };
  // Round 73b (2026-09-26): the shore distance the strand reads — metres landward of the sheet's waterline from the
  // map's own shoreline contours (the discs the mask bake and the sheet share; the waterline is where the contour's
  // wetness ramp crosses the map's sea ramp). The mask's ramp is two or three metres wide on a real beach, so the
  // band could never be sized in it; an exact per-vertex evaluation (bounded early-outs per disc) costs the build
  // nothing it can measure. Sea and lake maps only; a frozen map or a dry one bakes nothing.
  let shoreAt: ((x: number, z: number) => number) | null = null;
  if (cfg?.splat?.seaLake && !heightField._layout.terrain.frozenMarshes) {
    const rampStart = cfg.splat.seaRamp?.[0] ?? 0.40;
    // the contour fraction t at which the wetness ramp 1 − t²(3 − 2t) crosses the sea ramp's start (bisection)
    let lo = 0, hi = 1;
    for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if (1 - m * m * (3 - 2 * m) > rampStart) lo = m; else hi = m; }
    const tLine = (lo + hi) / 2;
    const discs = [
      ...(heightField._layout.lakes ?? []).map((d) => ({ d, lake: true })),
      ...(heightField._layout.marshes ?? []).map((d) => ({ d, lake: false })),
    ];
    if (discs.length) {
      shoreAt = (x: number, z: number): number => {
        let best = 32;
        for (let i = 0; i < discs.length; i++) {
          const { d, lake } = discs[i];
          const dist = shorelineDistance(d, x, z, 1.32);
          if (!Number.isFinite(dist)) continue;
          const radius = shorelineRadiusAt(d, Math.atan2(z - d.z, x - d.x));
          const shelf = (d as { shelfM?: number }).shelfM;
          const start = lake ? (shelf !== undefined ? Math.min(0.94, 1 - shelf / Math.max(1, radius)) : 0.80) : 0.45;
          const m = (dist - (start + tLine * ((lake ? 0.96 : 1) - start))) * radius;
          if (m < best) best = m;
        }
        return best < 0 ? 0 : best;
      };
    }
  }
  // Alternative LOD geometries are retained in `chunks` even when another
  // level is mounted on the mesh. Register the complete live set so world
  // eviction releases uploaded dormant buffers as well as the visible tree.
  const retainedLodGeometries = new Set<THREE.BufferGeometry>();
  registerRetainedObject3DResources(group, {
    geometries: retainedLodGeometries,
    textures: splatTextures,
  });
  const streamFarLods = streamOpts?.streamFarLods === true;
  const focus = streamOpts?.focus || heightField._layout?.spawns?.player || { x: 0, z: 0 };
  let initialGeometryCount = 0;
  let initialFineGridCount = 0;
  yield [1, CHUNKS * CHUNKS + 2, true]; // splat canvas bake done
  function* buildTerrainRow(cz: number): Generator<TerrainBuildProgress, void, void> {
    for (let cx = 0; cx < CHUNKS; cx++) {
      const cx0 = -HALF + cx * CHUNK_SIZE, cz0 = -HALF + cz * CHUNK_SIZE;
      const ccx = cx0 + CHUNK_SIZE / 2, ccz = cz0 + CHUNK_SIZE / 2;
      const openingDistance = Math.hypot(focus.x - ccx, focus.z - ccz);
      const initialLevels: TerrainLodLevel[] = streamFarLods
        ? initialTerrainLods(openingDistance) : [0, 1, 2];
      // A far-only chunk computes the same height and fine-step normals just
      // at its 25×25 visible vertices; avoid paying for a dormant 99×99 grid.
      // Near/mid levels still share one fine grid, preserving their exact
      // cross-LOD shading and avoiding duplicate samples.
      const needsFineGrid = !streamFarLods || initialLevels.some((level) => level < 2);
      const progress = {
        done: 2 + cz * CHUNKS + cx,
        total: CHUNKS * CHUNKS + 2,
      };
      const fine = needsFineGrid
        ? yield* buildFineGridSteps(heightField, cx0, cz0, progress) : null;
      if (fine) initialFineGridCount++;
      const lods: Array<THREE.BufferGeometry | null> = [null, null, null];
      for (const level of initialLevels) {
        const geometry = yield* buildChunkGeometrySteps(
          heightField, cx0, cz0, LOD_SEGS[level], fine, progress, terrainIndexPool, 8, foldAt, shoreAt, jebelLit,
        );
        lods[level] = geometry;
        retainedLodGeometries.add(geometry);
        initialGeometryCount++;
      }
      const openingLevel = streamFarLods ? initialLevels[0] : 2;
      const mesh = new THREE.Mesh(lods[openingLevel]!, mat);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      chunks.push({
        mesh, lods,
        fine: streamFarLods && initialLevels.length < LOD_SEGS.length ? fine : null,
        level: openingLevel, cx: ccx, cz: ccz, cx0, cz0,
      });
      yield [2 + cz * CHUNKS + cx + 1, CHUNKS * CHUNKS + 2, cx === CHUNKS - 1];
    }
  }
  for (let cz = 0; cz < CHUNKS; cz++) yield* buildTerrainRow(cz);
  // (the time-to-battle lane, 2026-10-08) the horizon ring: its geometry pipeline (maps/horizon.ts horizonRingGeometrySteps),
  // then its material half, its attribute passes and its binding. A world build that supplies the ring through its hook
  // (map.ts, horizonRingHook.ts: a worker started with the build, or the kept ring of a rematch — horizonRingPrefetch.ts)
  // finishes it last, after the vegetation and the props (finishHorizonRingAsync), so the worker has the whole build to
  // answer; nothing waits for it — the pipeline is built here meanwhile when it has not answered, and its answer is taken
  // the moment it arrives. Any other build makes the ring here, after the chunks. The ring reads nothing the chunks, the
  // water, the vegetation or the props write, and stays the terrain's first child: the same ring.
  const ringSource = horizonRingSupplyFor(cfg);
  function* horizonRingStage(): Generator<TerrainBuildProgress, void, void> {
    let ringPipeline: HorizonRingPipeline | null = ringSource ? ringSource.take() : null;
    if (ringSource && !ringPipeline) {
      const pipelineSteps = horizonRingGeometrySteps(cfg, 1337, heightField, {
        vista: ringSource.request.vista, debugColors: ringSource.request.debugColors,
      });
      let pipelineStep = pipelineSteps.next();
      while (!pipelineStep.done) {
        yield [CHUNKS * CHUNKS + 1, CHUNKS * CHUNKS + 2, false];
        // the worker answered meanwhile: its pipeline (the same arrays; the steps made here are dropped)
        ringPipeline = ringSource.take();
        if (ringPipeline) break;
        pipelineStep = pipelineSteps.next();
      }
      if (!ringPipeline) {
        ringPipeline = (pipelineStep as IteratorReturnResult<HorizonRingPipeline>).value;
        ringSource.remember(ringPipeline);
      }
    }
    // every ring face draws with this battlefield's terrain material (bindAutumnHorizonGround below, continuousGround)
    const horizonSteps = buildHorizonRingSteps(engineCtx, cfg, 1337, heightField, { terrainBound: true, geometry: ringPipeline });
    let horizonStep = horizonSteps.next();
    while (!horizonStep.done) {
      yield [CHUNKS * CHUNKS + 1, CHUNKS * CHUNKS + 2, false];
      horizonStep = horizonSteps.next();
    }
    group.add(horizonStep.value);
    // (the terrain's first child, where it stood when it was built before the chunks)
    group.children.unshift(group.children.pop()!);
    yield [CHUNKS * CHUNKS + 1, CHUNKS * CHUNKS + 2, true]; // horizon ring built
    // The continued coast uses the same strand distances as the playable shore.
    // Leaving the ring's default attribute at zero made the sand/wrack band stop
    // on an exact square even when the bank geometry was continuous.
    if (shoreAt && horizonStep.value.userData.horizonRing) {
      const geometry = horizonStep.value.geometry;
      const position = geometry.getAttribute('position');
      const shore = new Uint8Array(position.count);
      for (let i = 0; i < position.count; i++) {
        const metres = shoreAt(position.getX(i), position.getZ(i));
        shore[i] = metres >= 32 ? 0 : 255 - Math.round(Math.max(0, metres) * (255 / 32));
      }
      geometry.setAttribute('shore', new THREE.BufferAttribute(shore, 1, true));
    }
    // The map-borders lane (2026-10-03): the roads that leave the square run on across the ring — the carriageway rides
    // the ring's vertices as [signed offset from the exit line, presence] (terrain.ts roadExits); set before the seam's
    // refinement, which carries every attribute into its new vertices
    if (heightField._roadExitAt && horizonStep.value.userData.horizonRing) {
      const geometry = horizonStep.value.geometry;
      const position = geometry.getAttribute('position');
      const exitAttr = new Float32Array(position.count * 2);
      const hit: [number, number] = [0, 0];
      // the exits as they lie on this ring (horizon.ts: each runs out at the foot of the ranges unless they open a pass)
      const ringExits = (horizonStep.value.userData.horizonRing as { roadExits?: RoadExitsOnRing | null }).roadExits;
      const exitAt = ringExits ? ringExits.at : heightField._roadExitAt;
      let any = false;
      for (let i = 0; i < position.count; i++) {
        exitAt(position.getX(i), position.getZ(i), hit);
        exitAttr[i * 2] = hit[0]; exitAttr[i * 2 + 1] = hit[1];
        if (hit[1] > 0) any = true;
      }
      if (any) geometry.setAttribute('roadExit', new THREE.BufferAttribute(exitAttr, 2));
    }
    // The map-borders lane (2026-10-03, owner: "rolling ground with field patterns"): the farmland past the edge in
    // parcels between the hedgerows — each ring vertex carries its field's crop, premultiplied (borderLandform.ts parcelTintAt)
    if (heightField._borderParcelAt && horizonStep.value.userData.horizonRing) {
      const geometry = horizonStep.value.geometry;
      const position = geometry.getAttribute('position');
      const tintAttr = new Float32Array(position.count * 4);
      const tint: [number, number, number, number] = [0, 0, 0, 1];
      let any = false;
      for (let i = 0; i < position.count; i++) {
        heightField._borderParcelAt(position.getX(i), position.getZ(i), tint);
        tintAttr.set(tint, i * 4);
        if (tint[3] < 1) any = true;
      }
      if (any) geometry.setAttribute('borderTint', new THREE.BufferAttribute(tintAttr, 4));
    }
    // ... and a railway's open line past the edge (terrain.ts railExitAt): its ballast rides the ring's vertices as
    // [signed offset from the line, presence]
    if (heightField._railExitAt && horizonStep.value.userData.horizonRing) {
      const geometry = horizonStep.value.geometry;
      const position = geometry.getAttribute('position');
      const railAttr = new Float32Array(position.count * 2);
      const hit: [number, number] = [0, 0];
      let any = false;
      for (let i = 0; i < position.count; i++) {
        heightField._railExitAt(position.getX(i), position.getZ(i), hit, position.getY(i));
        railAttr[i * 2] = hit[0]; railAttr[i * 2 + 1] = hit[1];
        if (hit[1] > 0) any = true;
      }
      if (any) geometry.setAttribute('railExit', new THREE.BufferAttribute(railAttr, 2));
    }
    // ... and the farm tracks down some of the field boundaries (borderLandform.ts trackAt): per family the metres from the
    // nearest track and its boundary, so the shader draws a 3 m dirt track beside the hedge
    if (heightField._borderTrackAt && horizonStep.value.userData.horizonRing) {
      const geometry = horizonStep.value.geometry;
      const position = geometry.getAttribute('position');
      const trackAttr = new Float32Array(position.count * 4);
      const track: [number, number, number, number] = [0, 0, 0, 0];
      let any = false;
      for (let i = 0; i < position.count; i++) {
        heightField._borderTrackAt(position.getX(i), position.getZ(i), track);
        trackAttr.set(track, i * 4);
        if (track[0] > 0) any = true;
      }
      if (any) geometry.setAttribute('borderTrack', new THREE.BufferAttribute(trackAttr, 4));
    }
    // All surrounding ground shares the live terrain material. Its distant
    // detail is controlled by screen footprint, not a map-boundary switch.
    {
      const horizonMesh = horizonStep.value;
      const ringInfo = horizonMesh.userData.horizonRing as { columns?: number; ridgeRow?: number } | undefined;
      // only a real ring reports its topology; a horizon-less build (receipt sandboxes, headless audits) has no bands
      if (ringInfo) {
        bindAutumnHorizonGround(horizonMesh, mat, splatTextures, {
          columns: ringInfo.columns ?? horizonRing().HORIZON_SEGMENTS, bands: Math.max(2, ringInfo.ridgeRow ?? 3),
          continuousGround: true, ground: heightField,
        });
        // Curvature also controls turf moisture and ambient light. A missing
        // attribute reset both at the map edge even with identical materials.
        if (foldAt) continueHorizonFold(horizonMesh.geometry, foldAt);
        // ground albedo mean → meadow tint (round 29); rock albedo mean → rock and scree tints (round 35)
        // (the ring's stage is a hoisted generator: it reads the material's promise, not the narrowed step)
        void sourcedReady?.then(() => refreshHorizonGroundTone(horizonMesh, splatTextures[0], splatTextures[4]));
      }
    }
  }
  if (ringSource) group.userData.finishHorizonRing = horizonRingStage;
  else yield* horizonRingStage();
  if (cfg?.splat?.seaLake && !heightField._layout.terrain.frozenMarshes) {
    const waterSteps = shallowWaterGeometrySteps(heightField);
    let step = waterSteps.next();
    while (!step.done) {
      yield [CHUNKS * CHUNKS + 1, CHUNKS * CHUNKS + 2, false];
      step = waterSteps.next();
    }
    if (step.value) {
      heightField.getWaterSurfaceHeightAt = step.value.heightAt;
      // round 47: the sheet fades its apron to open sea over the widest bay reach among the openings (computed inside
      // the sea block: the streaming receipts re-evaluate these build steps in a sandbox that knows no water helpers)
      const seaOpeningsSectorBlend = seaSectorBlend(Math.max(0, ...seaOpenings.map((o) => o.coastReachM ?? 0)));
      // Water pass 8 (2026-09-23): the world-anchored reactive field the sheet reads; null without a renderer
      // (receipts) or on the mobile tier, where the sheet keeps its procedural wake.
      const ripples = createWaterRippleField(engineCtx.renderer, {
        mask: materialStep.value.waterMask, mapSizeM: heightField.size, ramp: cfg.splat.seaRamp || [0.40, 0.78],
      });
      // Round 66 (2026-09-24): the FFT ocean — the map's authored sea state (its `ocean` block over the defaults of
      // its water kind) becomes a time-zero spectrum on the CPU (sliced per cascade) and a field of fragment-shader
      // transform passes on the renderer; null in receipts, on the mobile tier and without float colour buffers.
      let ocean: OceanField | null = null;
      if (oceanFieldSupported(engineCtx.renderer)) {
        const oceanState = resolveOceanState(waterContactProfile(cfg.id || '').kind, cfg.ocean);
        const oceanPreset = resolvePresetName();
        let oceanSpectrum: OceanSpectrumTexels | null = null;
        for (const slice of oceanSpectrumSteps(oceanState, oceanGridSize(oceanPreset))) {
          if (slice) oceanSpectrum = slice;
          else yield [CHUNKS * CHUNKS + 1, CHUNKS * CHUNKS + 2, false];
        }
        if (oceanSpectrum) ocean = createOceanField(engineCtx.renderer, oceanSpectrum, oceanState, { preset: oceanPreset });
      }
      const water = createShallowWaterSurface(step.value.geometry,
        materialStep.value.waterMask, materialStep.value.waterNormal,
        heightField.size, cfg.id || '', cfg.splat.seaRamp || [0.40, 0.78],
        // water pass 3 (2026-09-12): the sheet joins the cascaded-shadow setup like every lit world material
        (material, hook) => engineCtx.setupShadowMaterial(material, hook), ripples,
        // round 47: the apron fades along the same baked bay contour the ring faces read
        seaOpenings.length ? { ...materialStep.value.outlandWater, sectorBlend: seaOpeningsSectorBlend, openings: seaOpenings } : null,
        ocean); // round 66: the FFT ocean the sheet displaces and shades with
      group.add(water.mesh);
      if (ripples) {
        heightField.addWaterImpulse = ripples.addImpulse;
        heightField.waterRipplesActive = () => true;
        group.userData.disposeWater = ripples.dispose;
        group.userData.waterRipples = ripples; // read-only handle for probes (its sleep state, its steps)
      }
      if (ocean) {
        // round 66: the ocean's targets go with the field's (one disposer, called by the world's dispose)
        const disposeRipples = group.userData.disposeWater as (() => void) | undefined;
        const disposeOcean = ocean.dispose;
        group.userData.disposeWater = () => { disposeRipples?.(); disposeOcean(); };
      }
      // Round 40 (2026-09-22, "water at the edge: same level and shader beyond"): where the flattened water meets
      // the square edge the horizon ring opens to a sea apron (edgeWater.ts); the sheet continues over it with the
      // same material so fresnel, glitter and the deep colour do not end in a straight line at the red line.
      // Round 47 (2026-09-23): the apron follows the bay's own contour past the edge (a grid of wet cells), the derived
      // sector only carries the open sea from 120–360 m out — see edgeWater.ts buildOutlandWaterGeometry.
      const seaApron = buildOutlandWaterGeometry(seaOpenings, heightField.getOutlandWaterAt ?? null, heightField.size / 2,
        undefined, { cellM: 8, depthM: waterContactProfile(cfg.id || '').depthM, ramp: cfg.splat.seaRamp || [0.40, 0.78] });
      if (seaApron) {
        const apron = new THREE.Mesh(seaApron, water.mesh.material);
        apron.name = 'shallowWaterSeaApron';
        apron.renderOrder = water.mesh.renderOrder;
        apron.receiveShadow = water.mesh.receiveShadow;
        apron.matrixAutoUpdate = false;
        apron.updateMatrix();
        group.add(apron);
        water.mesh.userData.seaApron = apron;
      }
      // round 73: the terrain's swash band breathes on the same clock the sheet's run-up runs on
      const groundClock = mat.userData.groundClock as { value: number } | undefined;
      group.userData.updateWater = (dt: number, anchorX?: number, anchorZ?: number): void => {
        water.update(dt, anchorX, anchorZ);
        if (groundClock && Number.isFinite(dt) && dt > 0) groundClock.value += dt;
      };
      group.userData.setWaterTime = (t: number): void => {
        water.setTime(t);
        if (groundClock) groundClock.value = t;
      };
      group.userData.resetWater = () => { water.ripples?.clear(); water.setDisturbances([]); };
      group.userData.setWaterDisturbances = water.setDisturbances; // water pass 6: vehicle wakes
    }
  }
  const streamStats: TerrainStreamingStats = {
    enabled: streamFarLods,
    totalGeometryCount: CHUNKS * CHUNKS * LOD_SEGS.length,
    initialGeometryCount,
    initialFineGridCount,
    streamedGeometryCount: 0,
  };
  let streamFrame = 0;
  let streamCameraX = 0;
  let streamCameraZ = 0;
  const streamJob: TerrainLodBuild = { index: -1, level: 2, distanceM: 0, urgent: false };
  let pendingStream: Generator<TerrainBuildProgress, void, void> | null = null;
  function* buildStreamJob(job: TerrainLodBuild): Generator<TerrainBuildProgress, void, void> {
    const c = chunks[job.index];
    if (!c.fine && job.level < 2) {
      c.fine = yield* buildFineGridSteps(heightField, c.cx0, c.cz0, null, 1);
    }
    const geometry = yield* buildChunkGeometrySteps(
      heightField, c.cx0, c.cz0, LOD_SEGS[job.level], c.fine, null, terrainIndexPool, 1, foldAt, shoreAt, jebelLit,
    );
    // Publish only a complete geometry. Skirts, topology and bounds stay exact;
    // a camera move while rows were being built cannot mount an obsolete LOD.
    c.lods[job.level] = geometry;
    retainedLodGeometries.add(geometry);
    if (c.lods.every(Boolean)) c.fine = null;
    streamStats.streamedGeometryCount++;
    streamStats.indexPool = terrainIndexPoolReceipt(terrainIndexPool);
    const d = Math.hypot(streamCameraX - c.cx, streamCameraZ - c.cz);
    const want = terrainLodForDistance(d, c.level);
    if (want === job.level) {
      c.level = want;
      c.mesh.geometry = geometry;
    }
  }
  const startStreamJob = (): boolean => {
    if (!chooseTerrainLodBuild(chunks, streamCameraX, streamCameraZ, streamJob)) return false;
    pendingStream = buildStreamJob(streamJob);
    return true;
  };
  const advanceStreamJob = (): boolean => {
    if (!pendingStream?.next().done) return false;
    pendingStream = null;
    return true;
  };
  const warmStreamJobs = (camPos: THREE.Vector3, maxJobs: number): number => {
    if (!streamFarLods || !camPos) return 0;
    streamCameraX = camPos.x;
    streamCameraZ = camPos.z;
    const limit = Math.max(0, Math.floor(Number(maxJobs) || 0));
    let completed = 0;
    while (completed < limit) {
      if (!pendingStream && !startStreamJob()) break;
      // Countdown callers yield between COMPLETED jobs and stop on zero.
      // Finish shared partial work rather than restarting it or reporting a
      // checkpoint as a completion (or zero as a false end-of-work signal).
      while (!advanceStreamJob()) { /* drain the exact existing generator */ }
      completed++;
    }
    return completed;
  };
  group.userData.updateLOD = (camPos: THREE.Vector3): void => {
    for (const c of chunks) {
      const d = Math.hypot(camPos.x - c.cx, camPos.z - c.cz);
      const want = terrainLodForDistance(d, c.level);
      if (want !== c.level && c.lods[want]) {
        c.level = want;
        c.mesh.geometry = c.lods[want];
      }
    }
    if (!streamFarLods) return;
    streamCameraX = camPos.x;
    streamCameraZ = camPos.z;
    // Start at the established four-update cadence, then advance ONE pending
    // job on each update. No independent timer wakes a dormant world. The 2 ms
    // target is checked between one-row checkpoints, with a 32-checkpoint
    // ceiling even on a fast clock. A row or final skirt/index/bounds submission
    // is atomic and may overshoot the target; it is not a hard frame-time cap.
    const mayStart = (++streamFrame & 3) === 0;
    if (!pendingStream && (!mayStart || !startStreamJob())) return;
    const deadline = performance.now() + 2;
    for (let checkpoint = 0; checkpoint < 32; checkpoint++) {
      if (advanceStreamJob() || performance.now() >= deadline) break;
    }
  };
  // Countdown warm seam: the ordinary update path deliberately builds at
  // one pending geometry in bounded row slices. Deployment can instead call
  // this with a one-job budget between painted countdown frames, completing
  // the same exact meshes before controls unlock without a quality change.
  group.userData.warmStreaming = warmStreamJobs;
  group.userData.streamingStats = streamStats;
  streamStats.indexPool = terrainIndexPoolReceipt(terrainIndexPool);
  group.userData.sourcedTexturesReady = mat.userData.sourcedTexturesReady;
  group.userData.cancelSourcedTextures = sourcePreparation?.cancel;
  return group;
}
