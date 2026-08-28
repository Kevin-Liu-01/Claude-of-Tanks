import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import '../game/rosterPlanning.selftest.mjs';
import {
  FEATURED_IMAGES,
  FEATURED_SHOTS,
  TRANSITION_SHOTS,
  featuredShotForMap,
  nextFeaturedShot,
} from './featuredShots.js';
import { BOOT_HERO_SHOTS } from './bootScreen.ts';
import { MAP_HEROES, MAP_THUMBS } from './mapThumbs.js';
import { MAP_IDS } from '../world/maps/index.js';

function webpDimensions(buffer) {
  assert.equal(buffer.subarray(0, 4).toString(), 'RIFF', 'map image must be RIFF WebP');
  assert.equal(buffer.subarray(8, 12).toString(), 'WEBP', 'map image must be WebP');
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const kind = buffer.subarray(offset, offset + 4).toString();
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (kind === 'VP8 ') {
      return [buffer.readUInt16LE(data + 6) & 0x3fff, buffer.readUInt16LE(data + 8) & 0x3fff];
    }
    if (kind === 'VP8L') {
      const bits = buffer.readUInt32LE(data + 1);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    if (kind === 'VP8X') {
      return [buffer.readUIntLE(data + 4, 3) + 1, buffer.readUIntLE(data + 7, 3) + 1];
    }
    offset = data + size + (size & 1);
  }
  throw new Error('map image is missing a WebP dimensions chunk');
}

assert.deepEqual(Object.keys(MAP_HEROES), Object.keys(MAP_THUMBS),
  'every map picker image must have a matching high-resolution hero');
for (const mapId of MAP_IDS) {
  const hero = await readFile(new URL(`../../public${MAP_HEROES[mapId]}`, import.meta.url));
  const thumb = await readFile(new URL(`../../public${MAP_THUMBS[mapId]}`, import.meta.url));
  assert.deepEqual(webpDimensions(hero), [3840, 2160], `${mapId} hero must remain native 4K`);
  assert.deepEqual(webpDimensions(thumb), [1280, 720], `${mapId} picker must remain 720p`);
  assert.ok(hero.length > thumb.length * 3,
    `${mapId} picker must remain a materially lighter derivative than its hero`);
}

const minimapAssets = await Promise.all(MAP_IDS.map(async (mapId) => ({
  mapId,
  asset: await stat(new URL(`../../public/minimaps/${mapId}.webp`, import.meta.url)),
})));
for (const { mapId, asset } of minimapAssets) {
  assert.ok(asset.size > 10_000,
    `${mapId} must ship a non-placeholder supersampled tactical-map asset`);
}

assert.equal(FEATURED_SHOTS.length, 20, 'the handmade and owner-approved galleries stay available');
assert.equal(TRANSITION_SHOTS.length, 10, 'only lightweight handmade and owner-approved captures rotate');
assert.deepEqual(FEATURED_IMAGES, TRANSITION_SHOTS.map((shot) => shot.img));
assert.deepEqual(
  BOOT_HERO_SHOTS,
  TRANSITION_SHOTS,
  'the first percentage loading screen must use the current curated captures',
);
assert.equal(
  BOOT_HERO_SHOTS[0].img,
  '/media/featured/f7_studio_t90_column_fire.webp',
  'the handmade landing hero must be the first boot-screen option',
);
assert.equal(
  BOOT_HERO_SHOTS[0].bootImg,
  '/media/featured/f7_studio_t90_column_fire.boot.webp',
  'the first visit must use the screen-sized derivative while retaining the gallery original',
);
const bootHeroAsset = await stat(new URL(`../../public${BOOT_HERO_SHOTS[0].bootImg}`, import.meta.url));
const fullHeroAsset = await stat(new URL(`../../public${BOOT_HERO_SHOTS[0].img}`, import.meta.url));
assert.ok(bootHeroAsset.size < fullHeroAsset.size * 0.4,
  'the boot hero must be materially smaller than its gallery source');
assert.deepEqual(
  BOOT_HERO_SHOTS.slice(0, 3).map((shot) => shot.img),
  [
    '/media/featured/f7_studio_t90_column_fire.webp',
    '/media/featured/f6_studio_strv_steinburg_duel.webp',
    '/media/featured/f9_studio_fjord_firefight.webp',
  ],
  'handmade Studio frames must lead the boot-screen rotation',
);
assert.equal(new Set(FEATURED_IMAGES).size, FEATURED_IMAGES.length, 'featured URLs must be unique');
assert.ok(FEATURED_IMAGES.every((img) => /\/(?:featured\/f\d+_studio_|presentation-r1\/\d+_)/.test(img)),
  'only handmade Studio or owner-approved presentation captures may enter the loading-screen rotation');
assert.ok(FEATURED_SHOTS.slice(0, 5).every((shot) => shot.handmade),
  'the complete handmade set must lead the featured gallery');
assert.equal(FEATURED_SHOTS.filter((shot) => shot.animated).length, 0,
  'the image-backed garage gallery must not decode animated GIF assets');
assert.ok(FEATURED_SHOTS.some((shot) => shot.img === '/media/feature-evidence-r2/studio-action.webp'),
  'the garage gallery keeps the native 4K Studio evidence frame');
const approved = [
  '02_desert_rooftop_dive', '03_desert_muzzle_worm', '05_winter_ice_breaker',
  '08_winter_village_hell', '10_urban_overpass_dive', '12_urban_crossfire_x',
  '15_verdant_column_massacre', '16_verdant_meadow_duel', '23_autumn_gold_inferno',
  '24_autumn_orchard_stand', '25_steppe_horizon_charge',
  '32_desert_ram_abramsx_t90m', '33_desert_overwatch_line',
];
for (const id of approved) {
  assert.ok(FEATURED_SHOTS.some((shot) => shot.img.endsWith(`/${id}.webp`)),
    `owner-approved frame dropped from gallery: ${id}`);
}

for (const shot of FEATURED_SHOTS) {
  assert.ok(shot.cap && shot.focal, `missing loading-screen metadata for ${shot.img}`);
  const asset = fileURLToPath(new URL(`../../public${shot.img}`, import.meta.url));
  assert.ok((await stat(asset)).size > 50_000, `featured capture is missing or undersized: ${shot.img}`);
}

assert.ok(TRANSITION_SHOTS.every((shot) => shot.maps?.length),
  'every transition capture must declare its battlefield coverage');

for (const mapId of Object.keys(MAP_THUMBS)) {
  const shot = featuredShotForMap(mapId);
  assert.ok(shot.maps.includes(mapId), `no curated loading capture for ${mapId}`);
}

assert.equal(
  featuredShotForMap('fjord').img,
  '/media/featured/f9_studio_fjord_firefight.webp',
  'the handmade Fjord firefight should headline Glacier Fjord',
);
assert.equal(
  featuredShotForMap('urban').img,
  '/media/featured/f6_studio_strv_steinburg_duel.webp',
  'the handmade Strv duel should headline Steinburg',
);

const cycleSize = TRANSITION_SHOTS.length;
const rotation = Array.from({ length: cycleSize * 2 }, () => nextFeaturedShot().img);
for (let i = 1; i < rotation.length; i++) {
  assert.notEqual(rotation[i], rotation[i - 1], 'curated rotation must not repeat immediately');
}
assert.equal(new Set(rotation.slice(0, cycleSize)).size, cycleSize,
  'each rotation cycle visits every capture');
assert.equal(new Set(rotation.slice(cycleSize)).size, cycleSize,
  'refilled rotation visits every capture');

await import('./imagePreload.selftest.mjs');

const mainSource = await readFile(new URL('../main.js', import.meta.url), 'utf8');
const networkBattleLaunchSource = await readFile(
  new URL('../net/networkBattleLaunchRuntime.ts', import.meta.url), 'utf8');
const battlePresentationSource = await readFile(
  new URL('../game/battlePresentationRuntime.ts', import.meta.url), 'utf8',
);
const battleWarmSource = await readFile(
  new URL('../game/battleWarmRuntime.ts', import.meta.url), 'utf8',
);
const deploymentShadowWarmSource = await readFile(
  new URL('../engine/deploymentShadowWarm.ts', import.meta.url), 'utf8',
);
const soloDeploymentSource = await readFile(
  new URL('../game/soloBattleDeploymentRuntime.ts', import.meta.url), 'utf8',
);
const soloLoadingSource = await readFile(
  new URL('../game/soloBattleLoadingRuntime.ts', import.meta.url), 'utf8',
);
const battleVisualStreamerSource = await readFile(
  new URL('../game/battleVisualStreamer.ts', import.meta.url), 'utf8',
);
const deferredWarmSource = await readFile(
  new URL('../game/deferredCombatWarmRuntime.ts', import.meta.url), 'utf8',
);
const pedestalRuntimeSource = await readFile(
  new URL('../game/garagePedestalRuntime.ts', import.meta.url), 'utf8',
);
const studioSource = await readFile(new URL('../game/studio.js', import.meta.url), 'utf8');
const hudSource = await readFile(new URL('./hud.js', import.meta.url), 'utf8');
const minimapRuntimeSource = await readFile(
  new URL('./minimapAssetRuntime.ts', import.meta.url), 'utf8',
);
const worldActivationSource = await readFile(
  new URL('../world/worldActivationRuntime.ts', import.meta.url), 'utf8',
);
const playerFrameInputSource = await readFile(
  new URL('../game/playerFrameInput.ts', import.meta.url), 'utf8',
);
const battleFrameRuntimeSource = await readFile(
  new URL('../game/battleFrameRuntime.ts', import.meta.url), 'utf8',
);
const garageReturnRuntimeSource = await readFile(
  new URL('../game/garageReturnRuntime.ts', import.meta.url), 'utf8',
);
const battleEntryLifecycleSource = await readFile(
  new URL('../game/battleEntryLifecycle.ts', import.meta.url), 'utf8',
);
assert.match(mainSource,
  /bus\.on\('ui:battleStart', \(\) => \{[\s\S]{0,120}playSurface\.hideForBattle\(\)/,
  'every battle entry must dismiss the play modal without closing a retained room');
assert.match(mainSource,
  /function warmStudioPipelineChunked[\s\S]{0,600}battleWarm\.warmStudioEffects\(/,
  'Studio entry must delegate FX preparation to the lazy typed warm owner');
assert.match(battleWarmSource,
  /function warmStudioEffects[\s\S]{0,1400}createOpaqueLoadingYielder\(10, 64\)[\s\S]{0,1400}warmTexturesChunked\(yieldForLoad\)/,
  'direct Studio entry must prepare full-quality FX through the opaque frame-budget scheduler');
assert.match(studioSource,
  /async function load\([\s\S]{0,900}createFrameBudgetYielder\(10\)[\s\S]{0,900}addActor\(cfg\);[\s\S]{0,100}await yieldForFrameBudget\(\)/,
  'Studio scene JSON loads must yield between full-quality procedural actors');
assert.match(studioSource, /hud\?\.setMode\?\.\('hidden'\)/,
  'a pristine direct Studio visit must not require the battle-only HUD runtime');
assert.match(mainSource,
  /clearBattle: \(\) => \{[\s\S]{0,500}hud\?\.setMode\?\.\('hidden'\)/,
  'direct Studio exit cleanup must not require the battle-only HUD runtime');
assert.match(mainSource,
  /function veilHud\(on\)[\s\S]{0,400}hud\?\.root[\s\S]{0,300}damagePanel\?\.root/,
  'shared presentation cleanup must tolerate an unloaded battle HUD and damage panel');
assert.match(garageReturnRuntimeSource, /ui\.hideHud\(\)/,
  'the Garage return owner must hide the optional battle HUD');
assert.match(mainSource, /hideHud: \(\) => hud\?\.setMode\?\.\('hidden'\)/,
  'returning from pristine Studio must reach the garage without a battle HUD');
assert.match(studioSource,
  /actors\.push\(a\);[\s\S]{0,260}if \(!loading\) bindStoryboardTracks\(\)/,
  'Studio batch loads must not rebuild timeline bindings for every intermediate actor');
assert.match(mainSource,
  /if \(!STUDIO_BOOT_INTENT\) lighting\.setFarCascadeDormant\(true\);/,
  'cold garage boot must request long-range shadow dormancy after native-map priming');
assert.match(mainSource,
  /function setGarageSpots\(on\)[\s\S]{0,180}if \(!on\) lighting\.setFarCascadeDormant\(false\);/,
  'battle lighting must wake full-range shadows inside the covered entry');
assert.match(garageReturnRuntimeSource, /world\.setFarCascadeDormant\(true\)/,
  'the Garage return owner must request long-range shadow dormancy');
assert.match(mainSource,
  /setFarCascadeDormant: \(dormant\) => lighting\.setFarCascadeDormant\(dormant\)/,
  'returning to the enclosed garage must suspend long-range shadow redraws');
const pedestalWarmBody = pedestalRuntimeSource.slice(
  pedestalRuntimeSource.indexOf('const warmPrograms = async'),
  pedestalRuntimeSource.indexOf('const set = ('),
);
const pedestalWarmCode = pedestalWarmBody.replace(/\/\/.*$/gm, '');
assert.doesNotMatch(pedestalWarmBody, /renderer\.compileAsync/,
  'cold garage switches must not enter ANGLE completion polling');
assert.doesNotMatch(pedestalWarmCode, /(?:\.getUniforms|getProgramParameter)\s*\(/,
  'cold garage switches must not force ANGLE program-completion queries');
assert.match(pedestalWarmBody, /compilePrograms\(visual\.root\)/,
  'cold garage switches submit exact production-target programs before reveal');
const openingWarmBody = battleWarmSource.slice(
  battleWarmSource.indexOf('export function* createCombatOpeningWarmSteps('),
  battleWarmSource.indexOf('function* warmCombatDestructionEffectSteps('),
);
const openingWarmCode = openingWarmBody.replace(/\/\/.*$/gm, '');
assert.doesNotMatch(openingWarmCode, /(?:\.getUniforms|getProgramParameter)\s*\(/,
  'opening combat warm must not force ANGLE program-completion queries');
assert.match(openingWarmBody, /createIsolatedForwardWarmBatches\(\{[\s\S]*root: fx\.group/,
  'fallback opening warm must still bind FX through real isolated renders');
const coveredSubmissionBody = soloDeploymentSource.slice(
  soloDeploymentSource.indexOf(
    'const combatFxSubmission = await battleWarm.stageCombatFxProgramSubmission({',
  ),
  soloDeploymentSource.indexOf('trace.deploymentCompileMs'),
);
assert.match(coveredSubmissionBody,
  /forwardProgramWarm\.compile\(scene\)[\s\S]*createIsolatedForwardWarmBatches\(\{[\s\S]*root: fx\.group/,
  'player battle entry must submit and bind exact FX against the gameplay target');
const worldReadyAt = soloLoadingSource.indexOf("battleLoad.progress(0.555, 'Battlefield ready')");
const rosterAssemblyAt = soloLoadingSource.indexOf(
  "battleLoad.progress(0.56, 'Assembling rosters')", worldReadyAt,
);
const preRosterBattleLoad = soloLoadingSource.slice(
  soloLoadingSource.indexOf('async begin(specId'), rosterAssemblyAt,
);
assert.ok(worldReadyAt >= 0 && rosterAssemblyAt > worldReadyAt,
  'battlefield completion must paint before roster construction begins');
assert.doesNotMatch(preRosterBattleLoad, /renderer\.compile\(world\.group, camera, scene\)/,
  'the world must not compile against the garage spotlight program family before battle mode');
assert.match(preRosterBattleLoad,
  /battleLoad\.progress\(0\.55, 'Uploading battlefield textures'\)[\s\S]{0,280}battleVisuals\.stageRootTextureUploads\([\s\S]{0,80}getWorld\(\)\.group,[\s\S]{0,80}loadYield/,
  'battle entry must stage current world textures before the first full deployment frame');
assert.match(preRosterBattleLoad,
  /const plannedRoster = planRoster[\s\S]{0,1200}const rosterTexture = battleIntent\.prepareRoster\(\{[\s\S]{0,300}rosterIds: plannedRoster[\s\S]{0,3000}acquisition\.acquireSolo\(\[[\s\S]{0,900}\(\) => rosterTexture/,
  'exact cold roster camouflage and texture preparation must overlap battlefield construction');
assert.match(preRosterBattleLoad,
  /const fxTexture = ensureFx\(\)\.then[\s\S]{0,500}live\.preloadTextures[\s\S]{0,180}live\.warmTextures[\s\S]{0,260}battleVisuals\.stageRootTextureUploads\(live\.group, loadYield\)[\s\S]{0,1200}\(\) => fxTexture/,
  'exact combat atlases must install and upload alongside the independent world build');
const stageRevealBody = battleVisualStreamerSource;
assert.match(stageRevealBody, /forwardProgramWarm\.compile\(root\)[\s\S]{0,1400}await yieldForBudget\(true\)/,
  'each streamed vehicle must submit its production-target shaders before yielding');
assert.match(stageRevealBody,
  /forwardProgramWarm\.compile\(root\)[\s\S]*if \(initiallyHidden\)[\s\S]*visual\.setVisible\?\.\(false\)[\s\S]*root\.removeFromParent\(\)[\s\S]*battleVisibilityDetached = true[\s\S]*await yieldForBudget\(true\)/,
  'countdown-streamed opponents must compile exactly, then detach before the next painted frame');
assert.match(battlePresentationSource,
  /const setVisualResident = \(visual: TankVisual, resident: boolean\)[\s\S]{0,500}battleVisibilityDetached && !root\.parent\)[\s\S]{0,80}scene\.add\(root\)[\s\S]{0,500}if \(root\.parent === scene\)[\s\S]{0,100}root\.removeFromParent\(\)/,
  'fully hidden opponents must leave the scene hierarchy and only the visibility owner may restore them');
assert.match(battlePresentationSource,
  /actorVisible = entity\._spotFade > 0\.02;[\s\S]*setVisualResident\(visual, actorVisible\)[\s\S]*visual\.setVisible\(actorVisible\)[\s\S]*if \(!actorVisible\) \{[\s\S]{0,260}continue;[\s\S]{0,20}\}/,
  'spotting must restore scene residency before the first visible pose sync');
const deferredEnemyAt = deferredWarmSource.indexOf('getBattleVisuals().stream(');
const deferredOpeningAt = deferredWarmSource.indexOf(
  'combatWarm.warmOpeningChunked(6, guardedYield)',
);
const deferredNavigationAt = deferredWarmSource.indexOf('prepareNextOpeningRoute(game)');
const deferredTerrainAt = deferredWarmSource.indexOf('battleWarm.warmBattleTerrainTiles({');
const deferredRareAt = deferredWarmSource.indexOf(
  'combatWarm.warmRareChunked(6, guardedYield)',
);
assert.ok(deferredEnemyAt >= 0
  && deferredOpeningAt > deferredEnemyAt
  && deferredNavigationAt > deferredOpeningAt
  && deferredTerrainAt > deferredNavigationAt
  && deferredRareAt > deferredTerrainAt,
'opponent receipts and fallback opening/rare work must retain countdown order');
const coveredFxBody = soloDeploymentSource.slice(
  soloDeploymentSource.indexOf(
    'const combatFxSubmission = await battleWarm.stageCombatFxProgramSubmission({',
  ),
  soloDeploymentSource.indexOf('await entryLifecycle.primeReveal()'),
);
assert.match(coveredFxBody,
  /combatFxSubmission\.staged[\s\S]*combatWarm\.markOpeningReady\(\);[\s\S]*setDestructionWarmed\(true\);/,
  'a successful covered FX bind must prevent duplicate countdown staging');
const revealWarmBody = soloDeploymentSource.slice(
  soloDeploymentSource.indexOf("battleLoad.progress(0.969, 'Priming deployment shadows')"),
  soloDeploymentSource.indexOf('revealPrimed = true'),
);
const shadowWarmAt = revealWarmBody.indexOf('getDeploymentShadowWarm().prime(coveredYield)');
const postWarmAt = revealWarmBody.indexOf('post.warmFirstFrame(coveredYield)');
const revealFrameAt = revealWarmBody.indexOf('entryLifecycle.primeReveal()');
assert.ok(shadowWarmAt >= 0 && postWarmAt > shadowWarmAt && revealFrameAt > postWarmAt,
  'solo entry must split cascade and post warming before the first full deployment frame');
assert.match(soloLoadingSource,
  /ensureWorld\([\s\S]{0,500}resolved,[\s\S]{0,360}\{ precompile: false, services: false \}/,
  'solo entry must activate a battlefield without synchronous world services');
assert.match(soloLoadingSource,
  /startBattle\(specId, resolved,[\s\S]{0,500}prepareBattleWorldServices\(getWorld\(\)\)/,
  'solo entry must defer battle-only services until the real battle light set is active');
assert.match(worldActivationSource,
  /const prepareBattleServices[\s\S]{0,700}servicesMapId = world\.mapId[\s\S]{0,120}queueMinimap\(world\)/,
  'battle entry must queue the preloaded exact map without resampling the heightfield');
assert.match(worldActivationSource,
  /createMinimapAssetRuntime<World>\(\{[\s\S]{0,700}loadAsset: options\.loadMinimapAsset/,
  'the typed world owner must route exact minimap loading through its injected adapter');
assert.match(mainSource,
  /loadMinimapAsset: \(next, url\) => hud\.buildMinimapFromAsset\(next\.heightField, url\)/,
  'main composition must connect the HUD asset loader to the typed world owner');
assert.match(minimapRuntimeSource,
  /const isCurrent[\s\S]{0,1100}await loadAsset[\s\S]{0,700}buildFallback\(world\)/,
  'the exact map must be a lazy static asset with procedural cartography only as its error fallback');
assert.match(hudSource,
  /function installMinimapAsset[\s\S]{0,900}mmBg = image;[\s\S]{0,120}drawMinimapBackground\(\)/,
  'the pre-baked minimap must retain its decoded image instead of duplicating a purge-prone iPad canvas');
assert.match(deploymentShadowWarmSource,
  /const prime = async[\s\S]{0,6500}preservePrimedCascadesForNextFrame\(\)/,
  'covered cascade slices must hand their exact maps to the first full frame');
assert.match(deploymentShadowWarmSource,
  /createCasterBatches\(scene, camera\)[\s\S]{0,4200}shadowOnlyWarm\(\)[\s\S]{0,2200}for \(const light of lights\)/,
  'deployment shadows must bind caster resources in bounded depth-only batches before full cascade renders');
assert.match(deploymentShadowWarmSource,
  /scene\.overrideMaterial = uploadMaterial;[\s\S]{0,160}warmRender\(\)[\s\S]{0,180}scene\.overrideMaterial = priorOverrideMaterial/,
  'deployment geometry must upload through one shared shader and always restore production materials');
assert.match(deploymentShadowWarmSource,
  /for \(const \{ object \} of casterState\.casters\) object\.castShadow = true;[\s\S]{0,1200}preservePrimedCascadesForNextFrame\(\)/,
  'all shadow casters must be restored before the primed maps are handed to the live frame');
assert.match(deploymentShadowWarmSource,
  /preservePrimedCascadesForNextFrame\(\);[\s\S]{0,180}casterState\.lods[\s\S]{0,100}autoUpdate = autoUpdate/,
  'shadow-only full cascades must keep live-camera LODs pinned until every exact map is rendered');
assert.match(soloLoadingSource,
  /const resolved = battleIntent\.consumeMap\(specId, requestedMapId\)/,
  'the Battle click must consume the exact Random world chosen during intent');
assert.match(mainSource, /onBattleIntent: battleIntent\.preload/,
  'the composition root must wire explicit Battle intent');
const soloLoaderBody = soloLoadingSource.slice(soloLoadingSource.indexOf('async begin(specId'));
const loaderShowAt = soloLoaderBody.indexOf('battleLoad.show({');
const visualStreamerAwaitAt = soloLoaderBody.indexOf('await ensureBattleVisuals();');
const audioResumeAt = soloLoaderBody.indexOf('audio.resume();', loaderShowAt);
const loadingSoundAt = soloLoaderBody.indexOf('audio.loadingOn(true);', audioResumeAt);
const firstYieldAt = soloLoaderBody.indexOf('await nextFrame();', loaderShowAt);
const loadingStopAt = soloLoaderBody.indexOf('audio.loadingOn(false);', loadingSoundAt);
const ambienceAt = soloLoaderBody.indexOf('audio.ambientOn(true);', loadingStopAt);
assert.ok(loaderShowAt >= 0 && audioResumeAt > loaderShowAt && loadingSoundAt > audioResumeAt &&
  firstYieldAt > loadingSoundAt,
  'solo battle loading audio must unlock and start inside the Battle gesture before the first yield');
assert.ok(visualStreamerAwaitAt > firstYieldAt,
  'solo battle entry must show and paint its boot-critical veil before a lazy presentation import');
assert.ok(loadingStopAt > loadingSoundAt && ambienceAt > loadingStopAt,
  'loader audio must crossfade into battlefield ambience before reveal');
const cameraPrepareAt = soloLoaderBody.indexOf('prepareRevealCamera();');
const revealPrimeAt = soloLoaderBody.indexOf('await lifecycle.primeReveal();');
const loaderFadeAt = soloLoaderBody.indexOf('await battleLoad.hide();', revealPrimeAt);
const battleOpenAt = soloLoaderBody.indexOf('openBattle(visiblePreBattleSeconds);', loaderFadeAt);
assert.ok(cameraPrepareAt >= 0 && revealPrimeAt > cameraPrepareAt &&
  loaderFadeAt > revealPrimeAt && battleOpenAt > loaderFadeAt,
  'solo battle entry must lock the chase camera and paint it before the roster loader fades');
assert.match(mainSource,
  /post\.render\(dtR\);\s*if \(game\.phase === 'garage'\) garagePresentationDirty = false;\s*if \(game\.phase === 'battle'\) battleEntryLifecycle\.noteBattleFrame\(\);/,
  'the reveal barrier must advance only after a real battle frame is rendered');
assert.match(battleEntryLifecycleSource,
  /noteBattleFrame\(\) \{ presentedBattleFrameSerial \+= 1; \}[\s\S]*firstRequiredSerial = presentedBattleFrameSerial \+ 1/,
  'the typed reveal owner must wait for a newer presented battle frame');
assert.match(mainSource,
  /battleFrame\.advance\([\s\S]{0,180}game\.phase === 'battle' && battleLoad\?\.covering === true,/,
  'camera input must stay locked through the complete loader fade');
assert.match(battleFrameRuntimeSource,
  /inputSample\.cameraLocked = cameraLocked;[\s\S]{0,180}input\.poll\(inputSample\);/,
  'the render loop must pass the complete loader fade lock to the frame-input owner');
assert.match(playerFrameInputSource,
  /input\.consumeMouseDelta\(mouse,[\s\S]{0,180}camera\.mouseDX = paused \|\| cameraLocked \? 0 : mouse\.x;/,
  'queued mouse input must be drained without moving the covered battle camera');
const openBattleBody = mainSource.slice(
  mainSource.indexOf('function openBattle()'),
  mainSource.indexOf('const PRE_BATTLE_HOLD_S'),
);
assert.doesNotMatch(openBattleBody, /snapArcade/,
  'openBattle must never visibly re-snap the camera after the loader fade');
assert.match(mainSource,
  /enterGarage\(\);\s*battleEntryLifecycle\.uncoverRendering\(\);\s*await nextFrame\(\);\s*await battleLoad\?\.hide\?\.\(\);/,
  'battle-entry failures must paint the restored Garage before fading the loader');
const networkEntryBody = networkBattleLaunchSource.slice(
  networkBattleLaunchSource.indexOf('async beginPrivate('),
  networkBattleLaunchSource.indexOf('async beginRematch('),
);
assert.match(networkBattleLaunchSource,
  /const showRoomLoad =[\s\S]*battleLoad\.show\(\{/,
  'the typed network launch owner must synchronously present the boot-critical veil');
assert.ok(networkEntryBody.indexOf('showRoomLoad(') >= 0 &&
  networkEntryBody.indexOf('showRoomLoad(') < networkEntryBody.indexOf('await loadPrivateMatch();'),
  'network entry must synchronously show its boot-critical veil before its first lazy import');
console.log('loading screen featured-capture selftest: PASS');
