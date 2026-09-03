import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import { GARAGE_HERO_HEADING_RAD } from '../game/garagePresentationPose.ts';
import { createGarageArchitectureController } from './garageArchitecture.ts';
import { GARAGE_ENVIRONMENT_RECIPES } from './garageEnvironmentRecipes.ts';
import { GARAGE_FACILITY_AXIS_YAW_RAD } from './garageFacilityDetails.ts';

const kitSource = await readFile(new URL('./garageEnvironmentKit.ts', import.meta.url), 'utf8');
const facilitySource = await readFile(new URL('./garageFacilityDetails.ts', import.meta.url), 'utf8');
const recipeSource = await readFile(new URL('./garageEnvironmentRecipes.ts', import.meta.url), 'utf8');
const stageSource = await readFile(new URL('./garageStage.ts', import.meta.url), 'utf8');
assert.doesNotMatch(`${kitSource}\n${recipeSource}`,
  /\b(createWorld|createMap|createVegetation|createProps)\s*\(|heightField\.update|from ['"]\.\.\/world\/terrain|fleetFactory|tankFactory|world\/wrecks/i,
  'Garage packs may reuse renderer assets, never battlefield runtime services');
assert.match(kitSource, /garageTerrainPatches\.generated\.ts/,
  'Garage terrain must use build-time battlefield excerpts');
assert.doesNotMatch(`${kitSource}\n${facilitySource}`,
  /garageWreckGeometry|GARAGE_WRECK_ASSET|createWorkshopPartLibrary|workshopParts/,
  'Garage scene packs must not retain silhouette-only vehicle or component proxies');
assert.doesNotMatch(kitSource, /createSkyGeometry|garage_shared_sky/,
  'outdoor Garage packs must expose the shared engine sky, not occlude it with a local sphere');
assert.match(recipeSource, /world\/maps\/(structureKit|railKit|villageKit|urbanKit)/,
  'Garage recipes must use the real connected map structure builders');
assert.doesNotMatch(kitSource, /builder\.name/,
  'production Garage facades must never depend on minifiable function names');
for (const [architecture, recipe] of Object.entries(GARAGE_ENVIRONMENT_RECIPES)) {
  for (const placement of recipe.structures) {
    assert.ok(placement.catalogId.length > 2,
      `${architecture}/${placement.label}: stable exterior catalog id is required`);
  }
}
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
assert.equal(GARAGE_FACILITY_AXIS_YAW_RAD, GARAGE_HERO_HEADING_RAD,
  'service bays must align their rear plane with the hero tank stern plane');
assert.doesNotMatch(facilitySource, /GARAGE_CAMERA_AZIMUTH_RAD|VIEW_YAW/,
  'service-facility orientation must never be coupled to the opening camera');
assert.doesNotMatch(facilitySource, /fleetFactory|tankFactory/,
  'static facility scenery must not import the playable fleet into Garage boot');
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
    assert.ok(stats.structuralConnections >= 60);
    assert.equal(stats.unsupportedParts, 0);
    assert.ok(stats.heavyLiftSystems >= 2);
    assert.ok(stats.operationalMachines >= 3);
    assert.ok(stats.servicePurposeTags.length >= 5);
    assert.ok(stats.facilityMaterialClasses >= 4);
    assert.equal(stats.openingSightlineIntrusions, 0);
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
  assert.ok(stats.distinctiveElements.length >= 10);
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
  assert.ok(stats.structures >= 9,
    `${variant.id} must surround the hero with at least nine connected map structures`);
  assert.equal(stats.collisionAuditedStructures, stats.structures,
    `${variant.id} must derive every hitbox from its real structure geometry`);
  assert.ok(stats.collisionEnvelopeFill > 0 && stats.collisionEnvelopeFill <= 1,
    `${variant.id} collision coverage receipt must remain normalized`);
  assert.ok(stats.openCollisionMaxFill >= 0 && stats.openCollisionMaxFill <= 0.82,
    `${variant.id} open-structure compounds must preserve intentional free space`);
  assert.equal(stats.structureUnsupportedParts, 0,
    `${variant.id} every wall, roof and fixture must connect into a grounded assembly`);
  assert.ok(stats.maxStructureConnectionGapM <= 0.09,
    `${variant.id} structure contact chains must stay inside the strict nine-centimetre gate`);
  assert.ok(stats.structurePerimeterSectors >= 4,
    `${variant.id} structure composition must survive at least four orbit sectors`);
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
  assert.ok(stats.structuralConnections >= 60,
    `${variant.id} must certify a connected facility frame`);
  assert.equal(stats.unsupportedParts, 0,
    `${variant.id} must not contain a floating facility member`);
  assert.ok(stats.heavyLiftSystems >= 2,
    `${variant.id} must present working heavy-lift equipment`);
  assert.ok(stats.operationalMachines >= 3,
    `${variant.id} must present at least three assembled service machines`);
  assert.ok(stats.servicePurposeTags.length >= 5,
    `${variant.id} must communicate a real maintenance workflow`);
  assert.ok(stats.facilityMaterialClasses >= 4,
    `${variant.id} facility must retain steel, paint, equipment and masonry readings`);
  assert.equal(stats.openingSightlineIntrusions, 0,
    `${variant.id} facility must preserve the default hero sightline`);
  assert.ok(stats.looseParts >= 40,
    `${variant.id} must include workshop equipment and stocked spare parts`);
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
  if (variant.architecture === 'brick_arsenal') {
    assert.equal(stats.horizonStyle, 'urban');
    assert.ok(stats.horizonMaxHeightM >= 8 && stats.horizonMaxHeightM <= 10,
      `${variant.id} must retain a readable but bounded city skyline`);
  }
  if (['naval_drydock', 'rail_roundhouse'].includes(variant.architecture)) {
    assert.ok(stats.horizonMaxHeightM <= 6.5,
      `${variant.id} flat facility must keep its low working horizon`);
  }
  if (variant.architecture === 'factory_line') {
    assert.ok(stats.horizonMaxHeightM <= 8.5,
      `${variant.id} industrial stacks must stay below a mountain-scale wall`);
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

// Reproduce the production white-void race: one selector prewarm is still
// compiling while a newly selected pack finishes. The cache may temporarily
// contain three builds, but the selected handoff target must never be the one
// retired between preparation completion and presentation.
const verdant = GARAGE_VARIANTS[0];
const selectedVariant = GARAGE_VARIANTS[1];
const blockedPrewarmVariant = GARAGE_VARIANTS[2];
let releaseBlockedCompile;
let reportBlockedCompile;
const blockedCompile = new Promise((resolve) => { releaseBlockedCompile = resolve; });
const blockedCompileStarted = new Promise((resolve) => { reportBlockedCompile = resolve; });
const disposedArchitectures = [];
const fakeAssets = {
  retainedTextures: () => [],
  diagnostics: () => ({ residentSets: 0, referencedSets: 0 }),
  dispose() {},
};
const fakeKit = {
  createGarageEnvironmentAssetLibrary: () => fakeAssets,
  prepareGarageEnvironmentAssets: async () => {},
  buildGarageEnvironment: (_engineCtx, _assets, variant) => {
    const root = new THREE.Group();
    root.add(new THREE.Group());
    Object.assign(root.userData, {
      architectureKey: variant.architecture,
      ready: true,
      mode: 'garage-environment',
      source: 'authentic-garage-scene-pack',
      signature: `fake:${variant.architecture}`,
      objects: 1,
      drawCalls: 1,
      triangles: 1,
    });
    return {
      root,
      stats: root.userData,
      dispose() {
        disposedArchitectures.push(variant.architecture);
        root.removeFromParent();
        root.clear();
      },
    };
  },
};
const originalDocument = globalThis.document;
globalThis.document = {};
try {
  const raceScene = new THREE.Group();
  const raceController = createGarageArchitectureController({
    renderer: {
      initTexture() {},
      compileAsync(root) {
        if (root.userData.architectureKey === blockedPrewarmVariant.architecture) {
          reportBlockedCompile();
          return blockedCompile;
        }
        return Promise.resolve();
      },
    },
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
  }, raceScene, () => {}, async () => fakeKit);
  raceController.setVariant(verdant);
  await raceController.whenReady();
  const blockedPrewarm = raceController.prepareVariant(blockedPrewarmVariant);
  await blockedCompileStarted;
  raceController.setVariant(selectedVariant);
  const selectedStats = await raceController.whenReady();
  assert.equal(selectedStats.ready, true);
  assert.equal(selectedStats.presented, true,
    'selected pack must remain mounted and visible through concurrent cache trim');
  assert.equal(disposedArchitectures.includes(selectedVariant.architecture), false,
    'cache trim must pin the selected async handoff target');
  releaseBlockedCompile();
  await blockedPrewarm;
  raceController.dispose();
} finally {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
}

// A rejected lazy chunk must be retryable; retaining the rejected import
// promise would strand every later Garage selection until a page refresh.
let kitLoadAttempts = 0;
const retryScene = new THREE.Group();
const retryController = createGarageArchitectureController({}, retryScene, () => {}, async () => {
  kitLoadAttempts += 1;
  if (kitLoadAttempts === 1) throw new Error('transient Garage chunk failure');
  return fakeKit;
});
retryController.setVariant(selectedVariant);
await assert.rejects(retryController.whenReady(), /transient Garage chunk failure/);
const retryStats = await retryController.whenReady();
assert.equal(kitLoadAttempts, 2, 'failed Garage kit imports must be requested again');
assert.equal(retryStats.ready, true);
retryController.dispose();

console.log('garageArchitecture.selftest: ok');
