import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
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
const pedestalWarmBody = mainSource.slice(
  mainSource.indexOf('async function warmPedestalPrograms('),
  mainSource.indexOf('let garageActivityAt'),
);
assert.doesNotMatch(pedestalWarmBody, /renderer\.compileAsync/,
  'cold garage switches must not enter ANGLE completion polling');
assert.match(pedestalWarmBody, /renderer\.compile\(vis\.root, camera, scene\)/,
  'cold garage switches still submit their exact shader programs before reveal');
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
