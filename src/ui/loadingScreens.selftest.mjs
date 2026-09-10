import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript-compiler-api';
import {
  FEATURED_IMAGES,
  FEATURED_SHOTS,
  TRANSITION_SHOTS,
  featuredShotForMap,
  nextFeaturedShot,
} from './featuredShots.ts';
import { MAP_HEROES, MAP_THUMBS } from './mapThumbs.ts';
import { MAP_IDS } from '../world/maps/index.ts';
import { getLocalizedMapName } from '../world/maps/catalog.ts';

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
  assert.deepEqual(webpDimensions(thumb), [512, 288], `${mapId} picker must remain a crisp 16:9 card asset`);
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
assert.equal(
  TRANSITION_SHOTS[0].img,
  '/media/featured/f7_studio_t90_column_fire.webp',
  'the handmade T-90 frame must remain the first transition-screen option',
);
assert.equal(
  TRANSITION_SHOTS[0].bootImg,
  '/media/featured/f7_studio_t90_column_fire.boot.webp',
  'the featured panel must retain its screen-sized preview derivative',
);
const bootHeroAsset = await stat(new URL(`../../public${TRANSITION_SHOTS[0].bootImg}`, import.meta.url));
const fullHeroAsset = await stat(new URL(`../../public${TRANSITION_SHOTS[0].img}`, import.meta.url));
assert.ok(bootHeroAsset.size < fullHeroAsset.size * 0.4,
  'the featured preview must be materially smaller than its gallery source');
assert.deepEqual(
  TRANSITION_SHOTS.slice(0, 3).map((shot) => shot.img),
  [
    '/media/featured/f7_studio_t90_column_fire.webp',
    '/media/featured/f6_studio_strv_steinburg_duel.webp',
    '/media/featured/f9_studio_fjord_firefight.webp',
  ],
  'handmade Studio frames must lead the transition-screen rotation',
);
const bootHtml = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const bootSource = await readFile(new URL('./bootScreen.ts', import.meta.url), 'utf8');
assert.match(bootHtml, /id="cot-boot-hero" data-hero-state="idle"/,
  'the cold boot must retain its curated in-engine image surface');
assert.equal((bootHtml.match(/<img class="hly"/g) || []).length, 2,
  'the boot hero must use two hidden image layers for seamless crossfades');
assert.match(bootSource, /await preloadImage\(url, \{ priority: 'low', decode: true \}\)/,
  'boot imagery must decode at low priority before entering a visible layer');
assert.match(bootSource, /await afterPaint\(\);[\s\S]{0,180}classList\.add\('on'\)/,
  'decoded boot imagery must commit a hidden frame before fading in');
assert.match(bootSource, /if \(root && !bootGateSkipped\(\)\)/,
  'auto-skipped cold-load probes must not fetch decorative splash imagery');
assert.doesNotMatch(bootHtml, /#cot-boot::after/,
  'the first-paint boot surface must not restore the requested-removed grid');
assert.match(bootHtml,
  /id="cot-boot" class="cot-boot-enter" data-entrance-state="playing"/,
  'boot chrome must start its one-shot entrance in the inline first paint');
assert.match(bootHtml, /#cot-boot\.cot-boot-enter \.cot-boot-mark[\s\S]*?cot-boot-pop/,
  'the emblem must retain its one-shot entrance');
assert.match(bootHtml, /#cot-boot\.cot-boot-enter \.cot-boot-load[\s\S]*?cot-boot-rise/,
  'the progress surface must retain its one-shot entrance');
assert.match(bootSource,
  /classList\.remove\('cot-boot-enter'\);[\s\S]{0,100}entranceState = 'complete'/,
  'the boot controller must permanently retire the entrance class after one play');
assert.equal((bootHtml.match(/font-display:\s*optional/g) || []).length, 3,
  'all inline game fonts must avoid a late fallback-to-brand layout swap');
assert.match(bootHtml, /\.cot-boot-pct \{ width: 64px; flex: 0 0 64px;/,
  'boot percentage updates must keep a stable reserved width');
assert.match(bootHtml, /\.cot-boot-ticks \{[\s\S]*?min-height: 2px;/,
  'boot stage ticks must reserve their height before JavaScript mounts them');
assert.match(bootHtml, /\.cot-boot-tip \{[\s\S]*?height: 84px;[\s\S]*?overflow: hidden;/,
  'rotating boot tips must not resize the vertically centered splash');
assert.match(bootHtml,
  /:where\(body\[data-cot-width='compact'\],body\[data-cot-width='phone'\]\) \.cot-boot-tip \{ height: 144px; \}/,
  'narrow boot tip space must follow the centralized width policy rather than an independent breakpoint');
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
  assert.ok(shot.capKey && shot.focal, `missing loading-screen metadata for ${shot.img}`);
  const asset = fileURLToPath(new URL(`../../public${shot.img}`, import.meta.url));
  assert.ok((await stat(asset)).size > 50_000, `featured capture is missing or undersized: ${shot.img}`);
}

assert.ok(TRANSITION_SHOTS.every((shot) => shot.maps?.length),
  'every transition capture must declare its battlefield coverage');

for (const mapId of Object.keys(MAP_THUMBS)) {
  const shot = featuredShotForMap(mapId);
  assert.ok(shot.maps.includes(mapId), `no map-specific loading capture for ${mapId}`);
  assert.deepEqual(featuredShotForMap(` ${mapId.toUpperCase()} `), shot,
    `${mapId}: repeated room restaging must keep the same loading art`);
  if (!TRANSITION_SHOTS.some((entry) => entry.maps?.includes(mapId))) {
    assert.equal(shot.img, MAP_HEROES[mapId],
      `${mapId}: without a curated action still use its exact native 4K overview`);
    assert.equal(shot.capKey, 'garage.featuredShot.battlefieldOverview');
    assert.deepEqual(shot.capVars, { name: getLocalizedMapName(mapId) });
    assert.deepEqual(shot.maps, [mapId], 'an overview only depicts its own battlefield');
  }
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
assert.ok(TRANSITION_SHOTS.includes(featuredShotForMap('unknown-map')),
  'unknown map IDs retain the existing curated transition rotation');


const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
const mainBattleHudRuntimeSource = await readFile(
  new URL('../app/mainBattleHudRuntime.ts', import.meta.url), 'utf8',
);
const mainFrameSource = await readFile(
  new URL('../app/mainFrameRuntime.ts', import.meta.url), 'utf8');
const combatWarmCompositionSource = await readFile(
  new URL('../app/combatWarmComposition.ts', import.meta.url), 'utf8');
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
const studioSource = await readFile(new URL('../game/studio.ts', import.meta.url), 'utf8');
const hudSource = await readFile(new URL('./hud.ts', import.meta.url), 'utf8');
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
const garagePhasePresentationSource = await readFile(
  new URL('../game/garagePhasePresentationRuntime.ts', import.meta.url), 'utf8',
);
const battleEntryLifecycleSource = await readFile(
  new URL('../game/battleEntryLifecycle.ts', import.meta.url), 'utf8',
);
const battleRolloutSource = await readFile(
  new URL('../game/battleRolloutRuntime.ts', import.meta.url), 'utf8',
);
const soloBattleEntrySource = await readFile(
  new URL('../game/soloBattleEntryRuntime.ts', import.meta.url), 'utf8',
);
assert.match(mainSource,
  /bus\.on\('ui:battleStart', \(\) => \{[\s\S]{0,120}playSurface\.hideForBattle\(\)/,
  'every battle entry must dismiss the play modal without closing a retained room');
assert.match(combatWarmCompositionSource,
  /const warmStudioPipeline[\s\S]{0,600}battleWarm\.warmStudioEffects\(/,
  'Studio entry must delegate FX preparation to the lazy typed warm owner');
assert.match(mainSource, /createCombatWarmComposition\(\{/,
  'main must compose one renderer-lifetime combat warm owner');
assert.match(battleWarmSource,
  /function warmStudioEffects[\s\S]{0,1400}createOpaqueLoadingYielder\(10, 64\)[\s\S]{0,1400}warmTexturesChunked\(yieldForLoad\)/,
  'direct Studio entry must prepare full-quality FX through the opaque frame-budget scheduler');
assert.match(studioSource,
  /async function replaceLoadActors\([\s\S]{0,500}await yieldForFrameBudget\(\)[\s\S]{0,300}for \(const cfg of json\.actors \|\| \[\]\)[\s\S]{0,120}addActor\(cfg\);[\s\S]{0,100}await yieldForFrameBudget\(\)/,
  'Studio actor replacement must yield before and between full-quality procedural actors');
assert.match(studioSource,
  /async function load\([\s\S]{0,500}createFrameBudgetYielder\(10\)[\s\S]{0,300}await replaceLoadActors\(json, yieldForFrameBudget\)/,
  'Studio scene JSON loads must wire actor replacement to the frame-budget scheduler');
assert.match(studioSource, /hud\?\.setMode\?\.\('hidden'\)/,
  'a pristine direct Studio visit must not require the battle-only HUD runtime');
assert.match(mainSource,
  /clearBattle: \(\) => \{[\s\S]{0,500}currentHud\(\)\?\.setMode\?\.\('hidden'\)/,
  'direct Studio exit cleanup must not require the battle-only HUD runtime');
assert.match(mainSource,
  /function veilHud\(on(?::\s*boolean)?\)[\s\S]{0,180}battleHudRuntime\?\.veil\(on\)/,
  'shared presentation cleanup must delegate to the optional battle HUD owner');
assert.match(mainBattleHudRuntimeSource,
  /const veil = \(hidden: boolean\)[\s\S]{0,500}hud\?\.root[\s\S]{0,500}damagePanel\?\.root/,
  'the battle HUD owner must atomically veil both optional presentation surfaces');
assert.match(garageReturnRuntimeSource, /ui\.hideHud\(\)/,
  'the Garage return owner must hide the optional battle HUD');
assert.match(mainSource, /hideHud: \(\) => currentHud\(\)\?\.setMode\?\.\('hidden'\)/,
  'returning from pristine Studio must reach the garage without a battle HUD');
assert.match(studioSource,
  /actors\.push\(a\);[\s\S]{0,260}if \(!loading\) bindStoryboardTracks\(\)/,
  'Studio batch loads must not rebuild timeline bindings for every intermediate actor');
assert.match(mainSource,
  /if \(!STUDIO_BOOT_INTENT\) lighting\.setFarCascadeDormant\(true\);/,
  'cold garage boot must request long-range shadow dormancy after native-map priming');
assert.match(garagePhasePresentationSource,
  /const setActive = \(active: boolean\)[\s\S]{0,180}if \(!active\) lighting\.setFarCascadeDormant\(false\);/,
  'battle lighting must wake full-range shadows inside the covered entry');
assert.match(garageReturnRuntimeSource, /world\.setFarCascadeDormant\(true\)/,
  'the Garage return owner must request long-range shadow dormancy');
assert.match(mainSource,
  /setFarCascadeDormant: \(dormant(?::\s*boolean)?\) => lighting\.setFarCascadeDormant\(dormant\)/,
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
  /forwardProgramWarm\.compileSceneSteps\(\{[\s\S]*sliceMs: 8,[\s\S]*await guardedCoveredYield\(true\);[\s\S]*requireCurrent\(generation\);[\s\S]*createIsolatedForwardWarmBatches\(\{[\s\S]*root: fx\.group/,
  'player battle entry must stage exact scene programs before binding FX against the gameplay target');
assert.doesNotMatch(coveredSubmissionBody, /forwardProgramWarm\.compile\(scene\)/,
  'covered entry must not restore one atomic whole-scene program submission');
assert.match(coveredSubmissionBody.replace(/\/\/.*$/gm, ''),
  /\}\s*await guardedCoveredYield\(true\);\s*requireCurrent\(generation\);\s*fx\.group\.visible = false;/,
  'the final compiler batch must yield and revalidate before first FX binding');
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
  /const updateActorVisibility = \([\s\S]*actorVisible = entity\._spotFade > 0\.02;[\s\S]{0,180}setVisualResident\(visual, actorVisible\)[\s\S]{0,120}visual\.setVisible\(actorVisible\)[\s\S]{0,80}return actorVisible/,
  'spotting must restore scene residency before reporting the actor visible');
assert.match(battlePresentationSource,
  /const updateTank = \([\s\S]*if \(!updateActorVisibility\([\s\S]{0,240}return;[\s\S]{0,100}presentationStateFor/,
  'spotting must restore scene residency before the first visible pose sync');
const deferredEnemyAt = deferredWarmSource.indexOf('getBattleVisuals().stream(');
const deferredOpeningAt = deferredWarmSource.indexOf(
  'combatWarm.warmOpeningChunked(6, guardedYield)',
);
const deferredNavigationAt = deferredWarmSource.indexOf(
  'const consumed = prepareNextOpeningRoute();',
);
const deferredTerrainAt = deferredWarmSource.indexOf(
  'await warmBattleTerrainTiles(guardedYield)',
);
const deferredRareAt = deferredWarmSource.indexOf(
  'combatWarm.warmRareChunked(6, guardedYield)',
);
assert.ok(deferredEnemyAt >= 0
  && deferredOpeningAt > deferredEnemyAt
  && deferredNavigationAt > deferredOpeningAt
  && deferredTerrainAt > deferredNavigationAt
  && deferredRareAt > deferredTerrainAt,
'opponent receipts and fallback opening/rare work must retain countdown order');
assert.match(combatWarmCompositionSource,
  /warmBattleTerrainTiles:\s*\(yieldForBudget\)\s*=>\s*battleWarm\.warmBattleTerrainTiles\(\{[\s\S]{0,220}primePresentation:\s*false/,
  'the composition adapter must retain non-presenting terrain warm semantics');
const coveredFxBody = soloDeploymentSource.slice(
  soloDeploymentSource.indexOf(
    'const combatFxSubmission = await battleWarm.stageCombatFxProgramSubmission({',
  ),
  soloDeploymentSource.indexOf('await entryLifecycle.primeReveal()'),
);
assert.match(coveredFxBody,
  /combatFxSubmission\.staged[\s\S]*combatWarm\.markOpeningReady\(\);[\s\S]*setDestructionWarmed\(true\);/,
  'a successful covered FX bind must prevent duplicate countdown staging');
// Execute the actual owner block: callback names may change when lifetime
// guards are added, but shadow/post completion must still precede reveal.
const revealStart = soloDeploymentSource.indexOf("battleLoad.progress(0.969, 'Priming deployment shadows')");
const revealEnd = soloDeploymentSource.indexOf('revealPrimed = true;', revealStart);
assert.ok(revealStart >= 0 && revealEnd > revealStart, 'the actual deployment reveal block is present');
const revealWarmBody = soloDeploymentSource.slice(revealStart, revealEnd + 'revealPrimed = true;'.length);

function deferredWarmStep() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function verifyDeploymentWarmOrder(body) {
  const events = [], shadow = deferredWarmStep(), world = deferredWarmStep(), post = deferredWarmStep();
  const shadowReceipt = { cascades: 4 }, postReceipt = { passes: 3 }, trace = {};
  const options = {};
  const yieldForBudget = async () => { events.push('yield'); };
  const ports = {
    trace, options, generation: 7, scene: {}, lighting: {}, game: {},
    battleLoad: { progress() {} }, requireCurrent: value => assert.equal(value, 7),
    mark() {}, getWorld: () => null, getWarmRender: () => {}, now: () => 0,
    createDeploymentForwardWarmBatches: function* () {},
    prepareWorldPrograms: async (owner, receipt, yieldBefore, requireCurrent) => {
      assert.strictEqual(owner, options); assert.strictEqual(receipt, trace);
      events.push('world'); await yieldBefore(true); await world.promise;
      requireCurrent(); events.push('worldDone');
    },
    coveredYield: yieldForBudget, guardedCoveredYield: yieldForBudget,
    getDeploymentShadowWarm: () => ({ prime: async yieldBeforeCascade => {
      events.push('shadow'); await yieldBeforeCascade(true); await shadow.promise;
      events.push('shadowDone'); return shadowReceipt;
    } }),
    post: { warmFirstFrame: async yieldBeforePass => {
      events.push('post'); await yieldBeforePass(true); await post.promise;
      events.push('postDone'); return postReceipt;
    } },
    assertRevealReady: () => events.push('ready'),
    getEntryLifecycle: () => ({ primeReveal: async () => { events.push('reveal'); } }),
  };
  // Only tracked local source (and the explicit mutations below) is evaluated.
  const pending = runInNewContext(stripTypeScriptTypes(`(async () => { let revealPrimed = false;
    ${body}\nreturn revealPrimed; })()`), ports);
  const settled = pending.then(value => ({ value }), error => ({ error }));
  try {
    assert.equal(events.includes('shadow'), true, 'shadow preparation is submitted');
    assert.equal(events.includes('post'), false, 'post cannot start while shadows are pending');
    assert.equal(events.includes('reveal'), false, 'pending shadows cannot reveal');
    shadow.resolve();
    for (let step = 0; step < 30 && !events.includes('world'); step++) await Promise.resolve();
    assert.equal(events.includes('world'), true, 'world programs follow completed shadows');
    assert.equal(events.includes('post'), false, 'post cannot start while world programs are pending');
    assert.equal(events.includes('reveal'), false, 'pending world programs cannot reveal');
    world.resolve();
    for (let step = 0; step < 30 && !events.includes('post'); step++) await Promise.resolve();
    assert.equal(events.includes('post'), true, 'post preparation follows completed shadows');
    assert.equal(events.includes('reveal'), false, 'pending post passes cannot reveal');
    post.resolve();
    const result = await settled;
    if (result.error) throw result.error;
    assert.equal(result.value, true, 'the actual owner publishes a primed reveal');
    assert.deepEqual(events, ['shadow', 'yield', 'shadowDone', 'world', 'yield', 'worldDone',
      'post', 'yield', 'postDone', 'ready', 'reveal']);
    assert.strictEqual(trace.deploymentShadowWarm, shadowReceipt);
    assert.strictEqual(trace.deploymentPostWarm, postReceipt);
  } finally {
    shadow.resolve(); world.resolve(); post.resolve(); await settled;
  }
}

await verifyDeploymentWarmOrder(revealWarmBody);
for (const [pattern, replacement] of [
  [/await (?=getDeploymentShadowWarm\(\)\.prime\()/, ''],
  [/await (?=post\.warmFirstFrame\()/, ''],
  [/await (?=prepareWorldPrograms\()/, ''],
  [/await prepareWorldPrograms\([^;]+\);/, ''],
  [/trace\.deploymentShadowWarm = await getDeploymentShadowWarm\(\)\.prime\([^;]+\);/, ''],
  [/trace\.deploymentPostWarm = await post\.warmFirstFrame\([^;]+\);/, ''],
  [/await entryLifecycle\.primeReveal\(\);/, ''],
  [/trace\.deploymentPostWarm =/, 'await getEntryLifecycle().primeReveal();\ntrace.deploymentPostWarm ='],
]) {
  const mutant = revealWarmBody.replace(pattern, replacement);
  assert.notEqual(mutant, revealWarmBody, 'each negative control changes the actual owner block');
  await assert.rejects(verifyDeploymentWarmOrder(mutant),
    'missing, unawaited, or premature warm/reveal steps must fail the ordering oracle');
}
function verifyCoveredWorldOptions(source) {
  const parsed = ts.createSourceFile('soloLoading.ts', source, ts.ScriptTarget.Latest, true);
  const calls = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(parsed) === 'ensureWorld') calls.push(node);
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.equal(calls.length, 1, 'one canonical covered world acquisition');
  let captured;
  runInNewContext(calls[0].getText(parsed), {
    resolved: 'chosen-map', battleLoad: { progress() {} },
    ensureWorld(mapId, _progress, options) { captured = { mapId, ...options }; },
  });
  assert.equal(captured.mapId, 'chosen-map');
  assert.equal(captured.precompile, false, 'world acquisition defers program compilation');
  assert.equal(captured.services, false, 'world acquisition defers synchronous battle services');
  assert.equal(captured.atmosphere, 'covered-battle', 'covered battle owns its final lighting');
  return calls[0].getText(parsed);
}
const coveredWorldCall = verifyCoveredWorldOptions(soloLoadingSource);
for (const [from, to] of [
  ['precompile: false', 'precompile: true'],
  ['services: false', 'services: true'],
  ["atmosphere: 'covered-battle'", "atmosphere: 'garage'"],
]) {
  const mutant = coveredWorldCall.replace(from, to);
  assert.notEqual(mutant, coveredWorldCall, 'mutate the executed call, not an earlier TypeScript port declaration');
  assert.throws(() => verifyCoveredWorldOptions(mutant));
}
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
  /loadMinimapAsset: \(next, url\) => \([\s\S]{0,120}currentHud\(\)\?\.buildMinimapFromAsset\(next\.heightField, url\) \?\? false/,
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
  /async function warmCasterBatches\([\s\S]{0,1200}observeRender\('caster-batch', batchTimes\.length, firstLight\)[\s\S]{0,500}await yieldCovered\(yieldForBudget\)/,
  'deployment shadows must upload caster resources in bounded depth-only batches');
assert.match(deploymentShadowWarmSource,
  /const observeRender: ObserveShadowWarm = \(phase, index, light, render = shadowOnlyWarm\)/,
  'observed caster/cascade renders must retain the exact offscreen shadow renderer');
assert.match(deploymentShadowWarmSource,
  /casterState = createCasterBatches\(scene, camera\);[\s\S]{0,220}await warmCasterBatches\(casterState, lights\[0\], yieldForBudget, observeRender\);[\s\S]{0,160}await warmCascades\(lights, yieldForBudget, observeRender\)/,
  'deployment shadows must bind caster resources in bounded depth-only batches before full cascade renders');
assert.match(deploymentShadowWarmSource,
  /scene\.overrideMaterial = uploadMaterial;[\s\S]{0,160}observeRender\('geometry-upload', index\+\+, light, warmRender\)[\s\S]{0,180}scene\.overrideMaterial = priorOverrideMaterial/,
  'deployment geometry must upload through one shared shader and always restore production materials');
assert.match(deploymentShadowWarmSource,
  /function restoreCasterState\([\s\S]{0,240}object\.castShadow = true;[\s\S]{0,220}object\.autoUpdate = autoUpdate/,
  'deployment shadow warming must restore every caster and pinned LOD state');
assert.match(deploymentShadowWarmSource,
  /preservePrimedCascadesForNextFrame\(\);[\s\S]{0,100}restoreCasterState\(casterState\);[\s\S]{0,60}primed = true/,
  'all shadow casters must be restored before the primed warm transaction completes');
assert.match(deploymentShadowWarmSource,
  /casterState = createCasterBatches\(scene, camera\);[\s\S]{0,400}await warmCascades\(lights, yieldForBudget, observeRender\);[\s\S]{0,160}restoreCasterState\(casterState\)/,
  'shadow-only full cascades must keep live-camera LODs pinned until every exact map is rendered');
assert.match(soloLoadingSource,
  /const resolved = battleIntent\.consumeMap\(specId, requestedMapId\)/,
  'the Battle click must consume the exact Random world chosen during intent');
assert.match(mainSource,
  /onBattleIntent: \(options\) => \{[\s\S]{0,240}if \(!currentNetworkRoom\(\)\?\.prepareLobby\(\)\) battleIntent\.preload\(options\);/,
  'explicit Solo intent must yield to an existing authoritative room preparation');
const soloLoaderBody = soloLoadingSource.slice(soloLoadingSource.indexOf('async begin(specId'));
const loaderShowAt = soloLoaderBody.indexOf('battleLoad.show({');
const visualStreamerAwaitAt = soloLoaderBody.indexOf('await ensureBattleVisuals();');
const loadingSoundAt = soloLoaderBody.indexOf('await audio.startLoadingAfterPaint();', loaderShowAt);
const firstYieldAt = loadingSoundAt;
const loadingStopAt = soloLoaderBody.indexOf('audio.loadingOn(false);', loadingSoundAt);
const ambienceAt = soloLoaderBody.indexOf('audio.ambientOn(true);', loadingStopAt);
assert.ok(loaderShowAt >= 0 && loadingSoundAt > loaderShowAt,
  'solo loading must show its cover before awaiting the gesture-aware audio owner');
assert.ok(visualStreamerAwaitAt > firstYieldAt,
  'solo battle entry must show and paint its boot-critical veil before a lazy presentation import');
assert.ok(loadingStopAt > loadingSoundAt && ambienceAt > loadingStopAt,
  'loader audio must crossfade into battlefield ambience before reveal');
// The independently registered soloBattleLoadingRuntime suite exercises the
// real loading/audio composition: sticky activation, deferred acquisition,
// cancellation, and recovery. Do not nest registered self-tests here.
const cameraPrepareAt = soloLoaderBody.indexOf('prepareRevealCamera();');
const revealPrimeAt = soloLoaderBody.indexOf('await lifecycle.primeReveal();');
const loaderFadeAt = soloLoaderBody.indexOf('await battleLoad.hide();', revealPrimeAt);
const battleOpenAt = soloLoaderBody.indexOf('openBattle(visiblePreBattleSeconds);', loaderFadeAt);
assert.ok(cameraPrepareAt >= 0 && revealPrimeAt > cameraPrepareAt &&
  loaderFadeAt > revealPrimeAt && battleOpenAt > loaderFadeAt,
  'solo battle entry must lock the chase camera and paint it before the roster loader fades');
assert.match(mainFrameSource,
  /post\.render\(dtSeconds,\s*frameWallDtSeconds\);[\s\S]{0,320}if \(game\.phase === 'garage'\) clearGaragePresentationDirty\(\);\s*if \(frame\.inBattle\) battleEntryLifecycle\.noteBattleFrame\(\);/,
  'the reveal barrier must advance only after a real battle frame is rendered');
assert.match(battleEntryLifecycleSource,
  /noteBattleFrame\(\) \{ presentedBattleFrameSerial \+= 1; \}[\s\S]*firstRequiredSerial = presentedBattleFrameSerial \+ 1/,
  'the typed reveal owner must wait for a newer presented battle frame');
assert.match(mainFrameSource,
  /battleFrame\.advance\([\s\S]{0,180}game\.phase === 'battle' && isBattleLoadCovering\(\),/,
  'camera input must stay locked through the complete loader fade');
assert.match(battleFrameRuntimeSource,
  /inputSample\.cameraLocked = cameraLocked;[\s\S]{0,180}input\.poll\(inputSample\);/,
  'the render loop must pass the complete loader fade lock to the frame-input owner');
assert.match(playerFrameInputSource,
  /input\.consumeMouseDelta\(mouse,[\s\S]{0,180}camera\.mouseDX = paused \|\| cameraLocked \? 0 : mouse\.x;/,
  'queued mouse input must be drained without moving the covered battle camera');
assert.doesNotMatch(battleRolloutSource, /snapArcade/,
  'openBattle must never visibly re-snap the camera after the loader fade');
assert.match(soloBattleEntrySource,
  /enterGarage\(\);\s*lifecycle\.uncoverRendering\(\);\s*await nextFrame\(\);\s*await battleLoad\.hide\?\.\(\);/,
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
