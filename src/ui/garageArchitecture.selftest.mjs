import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import { GARAGE_HERO_HEADING_RAD } from '../game/garagePresentationPose.ts';
import { createGarageArchitectureController } from './garageArchitecture.ts';
import { GARAGE_ENVIRONMENT_RECIPES } from './garageEnvironmentRecipes.ts';
import { GARAGE_FACILITY_AXIS_YAW_RAD } from './garageFacilityDetails.ts';
import { GARAGE_WRECK_ASSET } from './garageWreckGeometry.generated.ts';

const kitSource = await readFile(new URL('./garageEnvironmentKit.ts', import.meta.url), 'utf8');
const facilitySource = await readFile(new URL('./garageFacilityDetails.ts', import.meta.url), 'utf8');
const recipeSource = await readFile(new URL('./garageEnvironmentRecipes.ts', import.meta.url), 'utf8');
const stageSource = await readFile(new URL('./garageStage.ts', import.meta.url), 'utf8');
assert.doesNotMatch(`${kitSource}\n${recipeSource}`,
  /\b(createWorld|createMap|createVegetation|createProps)\s*\(|heightField\.update|from ['"]\.\.\/world\/terrain|fleetFactory|tankFactory|world\/wrecks/i,
  'Garage packs may reuse renderer assets, never battlefield runtime services');
assert.match(kitSource, /garageTerrainPatches\.generated\.ts/,
  'Garage terrain must use build-time battlefield excerpts');
assert.match(kitSource, /garageWreckGeometry\.generated\.ts/,
  'Garage wrecks must use a build-time first-party proxy instead of a fleet runtime');
assert.doesNotMatch(kitSource, /createSkyGeometry|garage_shared_sky/,
  'outdoor Garage packs must expose the shared engine sky, not occlude it with a local sphere');
assert.match(recipeSource, /world\/maps\/(structureKit|railKit|villageKit|urbanKit)/,
  'Garage recipes must use the real connected map structure builders');
assert.match(kitSource,
  /map: handle\.color,[\s\S]{0,100}normalMap: handle\.normal/,
  'Garage structure buckets must retain their surface-specific albedo and normal textures');
for (const [architecture, recipe] of Object.entries(GARAGE_ENVIRONMENT_RECIPES)) {
  for (const placement of recipe.structures) {
    const axisDelta = Math.atan2(
      Math.sin(placement.yaw - GARAGE_HERO_HEADING_RAD),
      Math.cos(placement.yaw - GARAGE_HERO_HEADING_RAD),
    );
    assert.ok(Math.abs(axisDelta) < 1e-9,
      `${architecture}/${placement.label}: structure shares the immutable hero axis`);
  }
}
assert.match(facilitySource, /createWorkshopPartLibrary/,
  'outdoor facilities must reuse the first-party workshop part vocabulary');
assert.equal(GARAGE_FACILITY_AXIS_YAW_RAD, GARAGE_HERO_HEADING_RAD,
  'service bays must align their rear plane with the hero tank stern plane');
assert.doesNotMatch(facilitySource, /GARAGE_CAMERA_AZIMUTH_RAD|VIEW_YAW/,
  'service-facility orientation must never be coupled to the opening camera');
assert.doesNotMatch(facilitySource, /fleetFactory|tankFactory/,
  'baked service vehicles must not import the playable fleet into Garage boot');
assert.match(stageSource, /light\.visible = true;[\s\S]*light\.intensity = isVerdant/,
  'Verdant fixtures must preserve a stable light count across environment switches');
assert.match(stageSource, /garage_outdoor_shader_seed/,
  'Verdant boot must seed the shared outdoor PBR/CSM program under cover');
assert.match(stageSource, /podTopMat\.color\.setHex\(variant\.platformTint\)/,
  'each Garage must apply its authored turntable deck finish without rebuilding geometry');
assert.match(stageSource, /podSideMat\.color\.copy\(platformEdge\)/,
  'each Garage must apply its authored accent to the shared platform edge');
assert.match(stageSource, /tree-alpha-instance[\s\S]{0,420}alphaTest: 0\.38[\s\S]{0,240}alphaToCoverage: true/,
  'Verdant boot must seed the exact detailed-tree alpha shader before outdoor reveal');
assert.equal(GARAGE_WRECK_ASSET.sourceSpecId, 'm1a2');
assert.ok(GARAGE_WRECK_ASSET.sourceTriangles > 30_000,
  'the tiny Garage wreck proxy must originate from a complete first-party vehicle');
assert.ok(GARAGE_WRECK_ASSET.triangles > 100 && GARAGE_WRECK_ASSET.triangles < 500,
  'the generated Garage wreck silhouette must remain deliberately tiny');

const scene = new THREE.Group();
const controller = createGarageArchitectureController({}, scene);
const signatures = new Set();
let maxBuildMs = 0;
let maxColdTransactionMs = 0;
for (const variant of GARAGE_VARIANTS) {
  const startedAt = performance.now();
  controller.setVariant(variant);
  const stats = await controller.whenReady();
  maxColdTransactionMs = Math.max(maxColdTransactionMs, performance.now() - startedAt);
  maxBuildMs = Math.max(maxBuildMs, stats.lastBuildMs);
  assert.equal(stats.key, variant.architecture);
  assert.equal(stats.mapId, variant.mapId);
  if (variant.id === 'verdant_motor_pool') {
    assert.equal(stats.mode, 'verdant-workshop');
    assert.equal(stats.enclosingSurfaces, 4,
      'Verdant must keep its restored enclosed workshop shell');
    assert.equal(stats.source, 'verdant-workshop');
    assert.equal(stats.terrainVertices, 0,
      'Verdant must not allocate the replacement outdoor terrain pack');
    assert.equal(stats.facilityStations, 4);
    assert.ok(stats.platformGroundClearanceM >= 0.02,
      'Verdant floor must remain below the complete turntable base');
    assert.equal(stats.cached, 1);
    signatures.add(stats.signature);
    continue;
  }
  assert.equal(stats.mode, 'garage-environment');
  assert.equal(stats.enclosingSurfaces, 0,
    `${variant.id} must remain an open Garage environment`);
  assert.equal(stats.source, 'authentic-garage-scene-pack');
  assert.ok(stats.objects >= 8 && stats.drawCalls <= 26,
    `${variant.id} must merge its scene into a bounded draw-call graph`);
  assert.ok(stats.triangles > 0 && stats.triangles <= 50_000,
    `${variant.id} must stay inside the Garage environment geometry budget`);
  assert.equal(stats.terrainVertices, 41 * 37,
    `${variant.id} must use its compact battlefield-derived terrain excerpt`);
  assert.ok(stats.platformGroundClearanceM >= 0.02,
    `${variant.id} terrain and hardstand must remain below the complete turntable base`);
  assert.equal(stats.terrainSourceAnchor?.length, 2);
  assert.ok(stats.sourceStructure && stats.sourceBeat,
    `${variant.id} must identify its real landmark and presentation beat`);
  assert.ok(stats.terrainProfile.length > 24,
    `${variant.id} must identify the battlefield-derived terrain`);
  assert.ok(stats.serviceFrame.length > 16);
  assert.ok(stats.distinctiveElements.length >= 4);
  assert.ok(stats.landmarkHeightM >= 7);
  assert.equal(stats.sourceLandmarkLocal?.[1], stats.landmarkHeightM);
  assert.ok(stats.textureSets.length >= 6,
    `${variant.id} must use real PBR surface sets`);
  assert.ok(stats.treeSpecies.length >= 2 && stats.trees >= 5,
    `${variant.id} must use battlefield tree geometry`);
  assert.equal(stats.backdropLayers, 3,
    `${variant.id} must close the view with three map-derived terrain bands`);
  assert.notEqual(stats.horizonStyle, 'none');
  assert.ok(stats.horizonMaxHeightM > 0 && stats.horizonMaxHeightM <= 13.2,
    `${variant.id} skyline must stay inside its authored biome ceiling`);
  assert.equal(stats.treeDetailTier, 'battlefield-far',
    'headless Garage audits must retain the DOM-free battlefield tree fallback');
  assert.ok(stats.groundCover >= 48,
    `${variant.id} must retain bounded static biome ground cover`);
  assert.equal(stats.wrecks, 2,
    `${variant.id} must stage two first-party background wrecks`);
  assert.equal(stats.structures, 7,
    `${variant.id} must surround the hero with seven connected map structures`);
  assert.ok(stats.connectedExteriorBuildings >= 3,
    `${variant.id} must apply connected exterior detail to its building district`);
  assert.ok(stats.connectedExteriorParts >= 120,
    `${variant.id} must retain high-detail supported facades`);
  assert.ok(stats.maxExteriorSupportGapM <= 0.065,
    `${variant.id} exterior fixtures must touch their authored supports`);
  assert.ok(stats.approachConnected && stats.approachSegments >= 8,
    `${variant.id} must carry one continuous map-authored approach to the platform`);
  assert.ok(stats.approachDetails >= 20,
    `${variant.id} approach must include route-specific infrastructure`);
  assert.ok(stats.approachGroundErrorM <= 0.01,
    `${variant.id} approach must follow the sampled battlefield terrain`);
  assert.ok(stats.facilityProps >= 100,
    `${variant.id} must distribute a complete service facility around the hero`);
  assert.equal(stats.facilityStations, 2,
    `${variant.id} must have two complete maintenance stations`);
  assert.equal(stats.openingViewFrames, 2,
    `${variant.id} must stage two connected service frames in the opening view`);
  assert.equal(stats.openingViewTankParts, 2,
    `${variant.id} opening service portals must hold first-party turret-and-gun assemblies`);
  assert.ok(stats.looseParts >= 40,
    `${variant.id} must include workshop equipment and stocked spare parts`);
  assert.ok(stats.serviceVehicles >= 1,
    `${variant.id} must include at least one baked service vehicle or running assembly`);
  assert.ok(stats.placementZones >= 7,
    `${variant.id} must distribute its authored service islands around the perimeter`);
  assert.equal(stats.placementOverlaps, 0,
    `${variant.id} must keep map structures clear of service equipment`);
  assert.ok(stats.maxGroundContactErrorM <= 0.1,
    `${variant.id} equipment must sit on its terrain terrace (${stats.maxGroundContactErrorM} m)`);
  if (variant.architecture === 'rail_roundhouse') {
    assert.ok(stats.railSegments >= 80,
      'Cinder Junction must be a real rail facility with three complete roads');
  }
  if (['brick_arsenal', 'naval_drydock', 'rail_roundhouse', 'factory_line']
    .includes(variant.architecture)) {
    assert.ok(stats.horizonMaxHeightM <= 3.8,
      `${variant.id} flat facility must not inherit a mountain wall`);
  }
  if (variant.architecture === 'rock_cavern') {
    assert.equal(stats.horizonStyle, 'alpine');
    assert.ok(stats.horizonMaxHeightM >= 10,
      'Glacier Deployment must retain a real layered mountain skyline');
  }
  assert.ok(stats.cached <= stats.cacheLimit && stats.cacheLimit === 2,
    `${variant.id} must obey the two-pack transition cache`);
  signatures.add(stats.signature);
}
assert.equal(signatures.size, GARAGE_VARIANTS.length,
  'every Garage choice must have a distinct environment signature');
assert.equal(controller.stats().cached, 2);
assert.ok(controller.stats().residentTextureSets <= 9,
  'PBR residency must remain bounded after visiting every environment');
assert.ok(maxBuildMs < 100,
  `headless environment geometry construction exceeded budget (${maxBuildMs.toFixed(1)} ms)`);
assert.ok(maxColdTransactionMs < 750,
  `cold asynchronous Garage module transaction exceeded budget (${maxColdTransactionMs.toFixed(1)} ms)`);
controller.dispose();
assert.equal(scene.children.length, 0);

console.log('garageArchitecture.selftest: ok');
