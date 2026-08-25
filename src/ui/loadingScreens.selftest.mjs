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
import { BOOT_HERO_SHOTS } from './bootScreen.js';
import { MAP_THUMBS } from './mapThumbs.js';

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
assert.match(mainSource,
  /if \(!STUDIO_BOOT_INTENT\) lighting\.setFarCascadeDormant\(true\);/,
  'cold garage boot must request long-range shadow dormancy after native-map priming');
assert.match(mainSource,
  /function setGarageSpots\(on\)[\s\S]{0,180}if \(!on\) lighting\.setFarCascadeDormant\(false\);/,
  'battle lighting must wake full-range shadows inside the covered entry');
assert.match(mainSource,
  /function enterGarage[\s\S]{0,3600}setFarCascadeDormant\(true\)/,
  'returning to the enclosed garage must suspend long-range shadow redraws');
const pedestalWarmBody = mainSource.slice(
  mainSource.indexOf('async function warmPedestalPrograms('),
  mainSource.indexOf('let garageActivityAt'),
);
const pedestalWarmCode = pedestalWarmBody.replace(/\/\/.*$/gm, '');
assert.doesNotMatch(pedestalWarmBody, /renderer\.compileAsync/,
  'cold garage switches must not enter ANGLE completion polling');
assert.doesNotMatch(pedestalWarmCode, /(?:\.getUniforms|getProgramParameter)\s*\(/,
  'cold garage switches must not force ANGLE program-completion queries');
assert.match(pedestalWarmBody, /renderer\.compile\(vis\.root, camera, scene\)/,
  'cold garage switches still submit their exact shader programs before reveal');
const openingWarmBody = mainSource.slice(
  mainSource.indexOf('function* warmCombatOpeningPipelineSteps('),
  mainSource.indexOf('function* warmCombatRarePipelineSteps('),
);
const openingWarmCode = openingWarmBody.replace(/\/\/.*$/gm, '');
assert.doesNotMatch(openingWarmCode, /(?:\.getUniforms|getProgramParameter)\s*\(/,
  'opening combat warm must not force ANGLE program-completion queries');
assert.match(openingWarmBody, /renderer\.compile\(fx\.group, camera, scene\)/,
  'opening combat warm must still submit the exact FX programs');
assert.match(openingWarmBody, /warmRenderIsolated\(fx\.group\)/,
  'opening combat warm must still bind FX through a real offscreen render');
const worldReadyAt = mainSource.indexOf("battleLoad.progress(0.555, 'Battlefield ready')");
const rosterAssemblyAt = mainSource.indexOf("battleLoad.progress(0.56, 'Assembling rosters')", worldReadyAt);
const preRosterBattleLoad = mainSource.slice(
  mainSource.indexOf('async function startBattleLoading('), rosterAssemblyAt,
);
assert.ok(worldReadyAt >= 0 && rosterAssemblyAt > worldReadyAt,
  'battlefield completion must paint before roster construction begins');
assert.doesNotMatch(preRosterBattleLoad, /renderer\.compile\(world\.group, camera, scene\)/,
  'the world must not compile against the garage spotlight program family before battle mode');
assert.match(preRosterBattleLoad,
  /battleLoad\.progress\(0\.55, 'Uploading battlefield textures'\)[\s\S]{0,180}stageRootTextureUploads\(world\.group, loadYield\)/,
  'battle entry must stage current world textures before the first full deployment frame');
assert.match(preRosterBattleLoad,
  /const plannedRoster = planBattleParticipantIds[\s\S]{0,900}const rosterTextureP = \(async \(\) => \{[\s\S]{0,800}applyCamoPatternsChunked[\s\S]{0,500}preloadBattleRosterTextures[\s\S]{0,2200}Promise\.all\(\[[\s\S]{0,500}rosterTextureP/,
  'exact cold roster camouflage and texture preparation must overlap battlefield construction');
assert.match(preRosterBattleLoad,
  /const fxTextureP = ensureFxRuntime\(\)\.then[\s\S]{0,500}live\.preloadTextures[\s\S]{0,180}live\.warmTextures[\s\S]{0,220}stageRootTextureUploads\(live\.group, loadYield\)[\s\S]{0,1000}fxTextureP/,
  'exact combat atlases must install and upload alongside the independent world build');
const stageRevealBody = mainSource.slice(
  mainSource.indexOf('async function stageBattleVisualReveal('),
  mainSource.indexOf('// --- fx', mainSource.indexOf('async function stageBattleVisualReveal(')),
);
assert.match(stageRevealBody, /renderer\.compile\(root, camera, scene\)[\s\S]{0,700}await yieldForBudget\(true\)/,
  'each streamed vehicle must submit its shaders before yielding to later roster construction');
assert.match(stageRevealBody,
  /renderer\.compile\(root, camera, scene\)[\s\S]{0,700}if \(initiallyHidden\) visual\.setVisible\?\.\(false\)[\s\S]{0,100}await yieldForBudget\(true\)/,
  'countdown-streamed opponents must compile exactly, then hide before the next painted frame');
const deferredWarmBody = mainSource.slice(
  mainSource.indexOf('function scheduleDeferredCombatWarm('),
  mainSource.indexOf('function* warmCombatOpeningPipelineSteps('),
);
assert.match(deferredWarmBody,
  /streamBattleVisuals\([\s\S]{0,180}ent\.team === 'enemy'[\s\S]{0,500}warmCombatOpeningPipelineChunked\(6, guardedYield\)[\s\S]{0,3200}warmCombatRarePipelineChunked\(6, guardedYield\)/,
  'opponents and first-shot pipelines must use the frozen countdown before rare variants');
assert.match(mainSource,
  /battleLoad\.progress\(0\.969, 'Priming deployment shadows'\);[\s\S]{0,180}primeDeploymentShadowMaps\(coveredYield\)[\s\S]{0,180}primeSoloBattleRevealFrame\(\)/,
  'solo entry must split cascade warming before the first full deployment frame');
assert.match(mainSource,
  /async function primeDeploymentShadowMaps[\s\S]{0,6000}preservePrimedCascadesForNextFrame\(\)/,
  'covered cascade slices must hand their exact maps to the first full frame');
assert.match(mainSource,
  /deploymentShadowCasterBatches\(\)[\s\S]{0,4200}shadowOnlyWarmRender\(\)[\s\S]{0,2200}for \(const light of lights\)/,
  'deployment shadows must bind caster resources in bounded depth-only batches before full cascade renders');
assert.match(mainSource,
  /scene\.overrideMaterial = deploymentUploadMaterial;[\s\S]{0,160}warmRender\(\)[\s\S]{0,180}scene\.overrideMaterial = priorOverrideMaterial/,
  'deployment geometry must upload through one shared shader and always restore production materials');
assert.match(mainSource,
  /for \(const \{ object \} of casterState\.casters\) object\.castShadow = true;[\s\S]{0,1200}preservePrimedCascadesForNextFrame\(\)/,
  'all shadow casters must be restored before the primed maps are handed to the live frame');
assert.match(mainSource,
  /preservePrimedCascadesForNextFrame\(\);[\s\S]{0,180}casterState\.lods[\s\S]{0,100}autoUpdate = autoUpdate/,
  'shadow-only full cascades must keep live-camera LODs pinned until every exact map is rendered');
assert.match(mainSource,
  /const plannedMapId = specId && mapId[\s\S]*resolveBattleIntentMap\(specId, mapId\)[\s\S]*prefetchWorld\(plannedMapId(?:,[^;]*)?\)/,
  'explicit Battle intent must turn the default Random card into a prefetchable concrete world');
assert.match(mainSource,
  /const plannedMap = requestedMapId === 'random'[\s\S]*battleIntentMapPlan\.resolved[\s\S]*const resolved = plannedMap \|\| resolveMapId\(requestedMapId\)/,
  'the Battle click must consume the exact Random world chosen during intent');
const soloLoaderBody = mainSource.slice(
  mainSource.indexOf('async function startBattleLoading('),
  mainSource.indexOf('// Headless probes drive the battle entry'),
);
const loaderShowAt = soloLoaderBody.indexOf('battleLoad.show({');
const audioResumeAt = soloLoaderBody.indexOf('audio.resume();', loaderShowAt);
const loadingSoundAt = soloLoaderBody.indexOf('audio.loadingOn(true);', audioResumeAt);
const firstYieldAt = soloLoaderBody.indexOf('await nextFrame();', loaderShowAt);
const loadingStopAt = soloLoaderBody.indexOf('audio.loadingOn(false);', loadingSoundAt);
const ambienceAt = soloLoaderBody.indexOf('audio.ambientOn(true);', loadingStopAt);
assert.ok(loaderShowAt >= 0 && audioResumeAt > loaderShowAt && loadingSoundAt > audioResumeAt &&
  firstYieldAt > loadingSoundAt,
  'solo battle loading audio must unlock and start inside the Battle gesture before the first yield');
assert.ok(loadingStopAt > loadingSoundAt && ambienceAt > loadingStopAt,
  'loader audio must crossfade into battlefield ambience before reveal');
const cameraPrepareAt = mainSource.indexOf('prepareBattleRevealCamera();');
const revealPrimeAt = mainSource.indexOf('await primeSoloBattleRevealFrame();');
const loaderFadeAt = mainSource.indexOf('await battleLoad.hide();', revealPrimeAt);
const battleOpenAt = mainSource.indexOf('openBattle();', loaderFadeAt);
assert.ok(cameraPrepareAt >= 0 && revealPrimeAt > cameraPrepareAt &&
  loaderFadeAt > revealPrimeAt && battleOpenAt > loaderFadeAt,
  'solo battle entry must lock the chase camera and paint it before the roster loader fades');
assert.match(mainSource,
  /post\.render\(dtR\);\s*if \(game\.phase === 'battle'\) presentedBattleFrameSerial\+\+;/,
  'the reveal barrier must advance only after a real battle frame is rendered');
assert.match(mainSource,
  /const battleEntryCameraLocked = inBattle && battleLoad\.covering;/,
  'camera input must stay locked through the complete loader fade');
assert.match(mainSource,
  /camInput\.mouseDX = \(paused \|\| battleEntryCameraLocked\) \? 0 : _mouse\.x;/,
  'queued mouse input must be drained without moving the covered battle camera');
const openBattleBody = mainSource.slice(
  mainSource.indexOf('function openBattle()'),
  mainSource.indexOf('const PRE_BATTLE_HOLD_S'),
);
assert.doesNotMatch(openBattleBody, /snapArcade/,
  'openBattle must never visibly re-snap the camera after the loader fade');
assert.match(mainSource,
  /enterGarage\(\);\s*battleLoadRenderingCovered = false;\s*await nextFrame\(\);\s*await battleLoad\.hide\(\);/,
  'battle-entry failures must paint the restored Garage before fading the loader');
console.log('loading screen featured-capture selftest: PASS');
