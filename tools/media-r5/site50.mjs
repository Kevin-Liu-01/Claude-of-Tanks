#!/usr/bin/env node
// "Site fifty" (owner ask 2026-10-02): fifty new shots of tanks, battles and battlefields for the public site.
// Each shot is ONE continuous take of LOOP_MS + XFADE_MS (no cuts, unlike the current six-second rails that jump at
// the wrap): site-loops.mjs crossfades the tail into the head for a seamless loop, and the same scene renders a 4K
// still at its best moment. Shots reuse the staged sets (sets.mjs) or define their own on battlefields the earlier
// rounds never filmed. One-shot events (fire, kills) stay inside the loop body, clear of the crossfade window.
//   MEDIA_R5_LIGHT=1 node tools/media-r5/site50.mjs [outDir=shots/media-r5/site50/scenes] [ids,...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildShot, fire, kill, pen, burn, smoke, boom as blast, dust, mg, barrage, exhaust, flare, embers, debris, fireField, huge as hugeBlast, H } from './setups.mjs';
import { setById, T, pictureFor, LIGHT_READY, sunFor, RIG } from './sets.mjs';
import { CAST, CAST_NAMES } from './cast.mjs';
import { blockedFraction } from './camera-clearance.mjs';
import { choreograph } from './turret-choreo.mjs';

export const LOOP_MS = 6000, XFADE_MS = 600, DUR = LOOP_MS + XFADE_MS;
export const KINDS = Object.freeze(['tank', 'battle', 'scene']);
/** The site lens: a touch of streak and fringe, no anamorphic bokeh (the references read crisp edge to edge). */
const SITE_LENS = { streaks: { amount: 0.22, length: 0.6 }, chromaticAberration: 0.08 };
const hold = (a, b) => [{ tMs: 0, ...a }, { tMs: 'end', ...b }];
// night fights are lit the way the game lights them: an illumination flare drifting over the street, the wrecks' fires
const NIGHT_FLARE = (at, h = 90) => flare(at, 0, { heightM: h, burnS: 40, intensity: 1.4, driftMps: 1.0 });

// Round 2 of the fifty (owner 2026-10-02): the bar is the owner's own Open Graph key art (a T-90M column under fire on
// Verdant's country road) and the Steinburg street duel — a battle in full swing in daylight, the hero tank big in frame
// from a high three-quarter, explosions, smoke columns and debris, lived-in places around it. Every shot is staged as
// combat on the battlefields that look best (Steinburg, Verdant Fields, Glacier Pass, Sunscar Oasis, Nordhavn Fjord,
// Monsoon Ridge, Cinder Junction, Ironworks, Frontier Basin, Jade River Delta, Frosthollow, Orchard Valley, Highland
// Reservoir), by day, with deep focus so the street or field around the tank stays sharp. Anchors come from the
// validated sets and from road points whose next 70 m are clear of buildings (shots/media-r5/tmp/anchor-candidates.py).
const CLEAN = { grain: { amount: 0.05, size: 1, color: 0.1, response: 0.7 }, vignette: { amount: 0.22, roundness: 0.55, softness: 0.65 } };
const stage = (id, map, time, seed, anchor, heading, more = {}) => ({ id, map, time, seed, anchor, heading, camo: 'factory', fStop: 8, picture: CLEAN, ...more });
const from = (setId, more = {}) => ({ ...setById(setId), fStop: 8, picture: CLEAN, ...more });
const DESERT_DAY = { ...CLEAN, exposure: -0.4, contrast: 1.12 };
const pair = (a, b, states = ['burning', 'intact'], more = {}) => ({ along: 74, lat: 2, count: 2, formation: 'pair', lineup: [a, b], states, ...more });

const S = {
  // Steinburg: the street grid (x = -40 / 35 / 112, z = -96 / -15 / 59) through the brick town
  stMain: stage('steinburg-day-main', 'urban', 'day', 501, [36, -70], 0, { formation: 'column', lineup: [CAST.leo2a6, CAST.puma, CAST.leo2a6], count: 3, enemies: pair(CAST.t72b3, CAST.t80u, ['burning', 'intact'], { along: 80, lat: -2 }) }),
  stWest: stage('steinburg-day-west', 'urban', 'day', 502, [-39.3, -16], 0, { formation: 'pair', lineup: [CAST.kf51, CAST.lynx], enemies: pair(CAST.t80u, CAST.t90a, ['intact', 'wrecked-burnt'], { along: 70 }) }),
  stCross: from('steinburg-day-crossroads', { lineup: [CAST.strv122, CAST.leo2a5], enemies: { along: 70, lat: 4, count: 2, formation: 'pair', lineup: [CAST.t72b, CAST.t72b3], states: ['wrecked-burnt', 'burning'] } }),
  stEast: stage('steinburg-day-east', 'urban', 'day', 503, [112.3, -16], 0, { formation: 'column', lineup: [CAST.tusk, CAST.sepv2, CAST.griffin], count: 3, enemies: pair(CAST.t72b3m, CAST.t90a, ['burning', 'intact'], { along: 84, lat: -3 }) }),
  stSouth: stage('steinburg-day-south', 'urban', 'day', 504, [32, -95.7], 270, { formation: 'pair', lineup: [CAST.leo2a6m, CAST.amx56], enemies: pair(CAST.t90a, CAST.t72b, ['intact', 'burning'], { along: 64, lat: 1 }) }),
  stNorth: stage('steinburg-day-north', 'urban', 'day', 505, [35.3, 64], 0, { formation: 'column', lineup: [CAST.amx56, CAST.leclerc, CAST.amx56], count: 3,
    enemies: { along: 92, lat: 0, count: 3, formation: 'line', spread: 0.45, lineup: [CAST.t72b3, CAST.t80u, CAST.t72bu], states: ['wrecked-burnt', 'burning', 'burning'] } }),
  stSquare: stage('steinburg-day-square', 'urban', 'day', 506, [35.2, -30], 0, { formation: 'pair', lineup: [CAST.leclerc, CAST.lynx], enemies: pair(CAST.t90, CAST.t72b3, ['burning', 'wrecked-burnt'], { along: 78, lat: 3 }) }),
  // Verdant Fields: the country road and the farm village (the Open Graph battlefield)
  vRoad: stage('verdant-day-road', 'verdant', 'day', 511, [-64, 61.6], 82, { formation: 'column', lineup: [CAST.t90m, CAST.t90a, CAST.t72b3m], count: 3,
    enemies: { along: 86, lat: -26, count: 3, formation: 'line', spread: 0.6, lineup: ['leo2a6_x', 'm1a2_x', 'leo2a5_x'], states: ['burning', 'intact', 'wrecked-burnt'] } }),
  vAssault: from('verdant-day-assault', { lineup: [CAST.t90sm, CAST.t14, CAST.t90ms, CAST.obj695, CAST.kurganets] }),
  vVillage: stage('verdant-day-village', 'verdant', 'day', 512, [19.3, 48], 1, { formation: 'pair', lineup: [CAST.t14, CAST.t90m], enemies: pair(CAST.leo2a6m, CAST.sepv2, ['wrecked-burnt', 'intact'], { along: 80, lat: 3 }) }),
  vFarm: stage('verdant-day-farm', 'verdant', 'day', 513, [6.7, -64], 191, { formation: 'pair', lineup: [CAST.kf51, CAST.leo], enemies: pair(CAST.t90sm, CAST.t72b3m, ['burning', 'intact'], { along: 82, lat: -4 }) }),
  // Glacier Pass: the frozen lake and the alpine village
  gLake: from('glacier-dawn-lake', { time: 'day', count: 3, lineup: [CAST.strv122, CAST.cv9040, CAST.strv122], enemies: pair(CAST.t80u, CAST.t72bu, ['intact', 'burning'], { along: 78, lat: 8 }) }),
  gVillage: stage('glacier-day-village', 'alpine', 'day', 521, [-138, 147], 110, { formation: 'pair', lineup: [CAST.leo2a5, CAST.cv90105], enemies: pair(CAST.t72b, CAST.t80u, ['burning', 'intact'], { along: 74, lat: -3 }) }),
  // Sunscar Oasis: the minaret, the market street and the caravanserai
  oMinaret: stage('sunscar-day-minaret', 'oasis', 'day', 437, [92, 80], 261, { formation: 'pair', lineup: [CAST.merkava3d, CAST.sabra], picture: DESERT_DAY, enemies: pair(CAST.t72b, CAST.t62, ['burning', 'intact'], { along: 74, lat: 3 }) }),
  oMarket: stage('sunscar-day-market', 'oasis', 'day', 531, [72, -70], 93, { formation: 'column', lineup: [CAST.m1a2, CAST.tusk, CAST.m1a2], count: 3, picture: DESERT_DAY,
    enemies: pair(CAST.t62, CAST.t72b, ['wrecked-burnt', 'intact'], { along: 84, lat: -2 }) }),
  oCaravan: stage('sunscar-day-caravanserai', 'oasis', 'day', 532, [146.3, -72.8], 79, { formation: 'pair', lineup: [CAST.merkava, CAST.merkava3d], picture: DESERT_DAY, enemies: pair(CAST.t62, CAST.t72b, ['intact', 'burning'], { along: 62, lat: 2 }) }),
  // Nordhavn Fjord: the village, the harbor road and the north road (inland: the shore's border stays out of frame)
  fVillage: stage('nordhavn-day-village', 'fjord', 'day', 541, [-23.7, -87.7], 198, { formation: 'pair', lineup: [CAST.strv122, CAST.cv9040], enemies: pair(CAST.t90, CAST.t72b3, ['burning', 'intact'], { along: 74, lat: 2 }) }),
  fHarbor: stage('nordhavn-day-harbor', 'fjord', 'day', 542, [21.7, 59.2], 14, { formation: 'column', lineup: [CAST.leo, CAST.cv90105, CAST.leo], count: 3, enemies: pair(CAST.t90a, CAST.t80u, ['wrecked-burnt', 'intact'], { along: 90, lat: -6 }) }),
  fNorth: stage('nordhavn-day-north', 'fjord', 'day', 543, [62, 226], 188, { formation: 'pair', lineup: [CAST.leo2a5m, CAST.cv90], enemies: pair(CAST.t90, CAST.t72b3, ['intact', 'burning'], { along: 66, lat: 0 }) }),
  // Monsoon Ridge: the river ford and the temple village
  mFord: from('monsoon-morning-ford', { enemies: pair(CAST.t72b3m, CAST.t90m, ['burning', 'intact'], { along: 72, lat: 6 }) }),
  mVillage: stage('monsoon-morning-village', 'monsoon', 'morning', 551, [25, 34.7], 193, { formation: 'pair', lineup: [CAST.k1a1, CAST.k21], enemies: pair(CAST.t72b3, CAST.t72b, ['burning', 'intact'], { along: 70, lat: 2 }) }),
  // Cinder Junction: the tracks, the container rows and the water tower
  rTracks: from('cinder-dusk-tracks', { time: 'golden', lineup: [CAST.sepv3, CAST.sepv3, CAST.sepv3, CAST.griffin], count: 3, enemies: pair(CAST.t90m, CAST.t72b3m, ['burning', 'intact'], { along: 92, lat: 0 }) }),
  rYard: stage('cinder-day-yard', 'railyard', 'day', 561, [0.6, -48], 0, { formation: 'column', lineup: [CAST.challenger1, CAST.warrior, CAST.challenger1], count: 3, enemies: pair(CAST.t72b, CAST.t80u, ['wrecked-burnt', 'intact'], { along: 80, lat: 3 }) }),
  rFactory: stage('cinder-day-factory', 'railyard', 'day', 562, [-112, -110.6], 90, { formation: 'pair', lineup: [CAST.abramsUA, CAST.sepv2], enemies: pair(CAST.t72b3m, CAST.t90m, ['burning', 'intact'], { along: 76, lat: 0 }) }),
  // Ironworks: the furnace yard and the gantry road
  iYard: from('ironworks-night-yard', { time: 'day', enemies: { along: 86, lat: 0, count: 3, formation: 'line', spread: 0.6, lineup: ['leo2a6_x', 'm1a2_x', 'leo2a5_x'], states: ['burning', 'wrecked-burnt', 'intact'] } }),
  iGantry: stage('ironworks-day-gantry', 'foundry', 'day', 571, [-24.8, 79.7], 119, { formation: 'column', lineup: [CAST.t90ms, CAST.obj695, CAST.t90ms], count: 3, enemies: pair(CAST.leo2a6, CAST.m1a2, ['burning', 'intact'], { along: 80, lat: 2 }) }),
  // Frontier Basin: the farm village and the red-roofed farm
  frVillage: stage('frontier-morning-village', 'frontier', 'morning', 581, [3, 25.5], 93, { formation: 'pair', lineup: [CAST.type90, CAST.type89], enemies: pair(CAST.t90m, CAST.t72b3m, ['intact', 'burning'], { along: 72, lat: -2 }) }),
  frFarm: stage('frontier-golden-farm', 'frontier', 'golden', 435, [36, 105.3], 11, { formation: 'pair', lineup: [CAST.k2, CAST.type10], count: 1 }),
  // Jade River Delta: the river village
  dVillage: stage('jade-morning-village', 'delta', 'morning', 434, [24, 42], 106, { formation: 'column', lineup: [CAST.ztz100, CAST.type96b, CAST.ztz100], count: 3, enemies: pair(CAST.t72b3m, CAST.t90m, ['burning', 'intact'], { along: 80, lat: 0 }) }),
  // Frosthollow: the onion-domed church and the terrace village
  wChurch: stage('frosthollow-day-church', 'winter', 'day', 591, [-78, -13.3], 4, { formation: 'pair', lineup: [CAST.t90vladimir, CAST.t72bu], enemies: pair(CAST.leo2a6, CAST.m1a2, ['intact', 'burning'], { along: 72, lat: 2 }) }),
  wVillage: from('frosthollow-night-village', { time: 'day', lineup: [CAST.t80u, CAST.t72bu, CAST.t80u], enemies: pair(CAST.leo2a5, CAST.challenger1, ['burning', 'wrecked-burnt'], { along: 96, lat: -4 }) }),
  // Orchard Valley: the packing village
  orVillage: stage('orchard-day-village', 'orchard', 'day', 601, [-20, -12], 52, { formation: 'column', lineup: [CAST.arieteC1, CAST.arieteC2, CAST.arieteC1], count: 3, enemies: pair(CAST.t72b, CAST.t62, ['burning', 'intact'], { along: 84, lat: -3 }) }),
  // Highland Reservoir: the lakeside village
  reVillage: stage('reservoir-day-village', 'reservoir', 'day', 611, [-82, -42], 216, { formation: 'pair', lineup: [CAST.chieftain10, CAST.challenger1], enemies: pair(CAST.t80u, CAST.t72b, ['burning', 'intact'], { along: 70, lat: 2 }) }),
};
S.orGolden = { ...S.orVillage, id: 'orchard-golden-village', time: 'golden', lineup: [CAST.amx30, CAST.amx40, CAST.amx30] };
S.oGolden = { ...S.oMinaret, id: 'sunscar-golden-minaret', time: 'golden', lineup: [CAST.tusk, CAST.sabra] };

// combat beats: a burning wreck with its smoke column, a shell landing near the hero with flying debris, a knockout
const wreck = foe => [burn(foe, 0), smoke(foe, 0), embers(foe, 0)];
// Shell hits borrow the tank-destruction blast (owner 2026-10-03: "fine"), but as a shot, not an ammo-rack kill: the
// ammo-rack blast also lights a turret-ring fire, cook-off jets and a hatch at hull height, and with no tank under them
// that fire floated in mid-air ("the only weird thing is there's a floating fire").
const SHOT = { cause: 'shot' };
const boom = (at, tMs, size = 'large') => blast(at, tMs, size, SHOT);
const huge = (at, tMs) => hugeBlast(at, tMs, SHOT);
const hitNear = (lat, lon, tMs, size = 'large') => [boom(H(lat, lon), tMs, size), debris(H(lat, lon), tMs + 30, { count: 34, speedMps: 15, hot: 0.4, scale: 1.1 })];
const incoming = (foe, lat, lon, tMs) => [fire(foe, tMs), ...hitNear(lat, lon, tMs + 110)];
const knockout = (shooter, target, tMs) => [fire(shooter, tMs), pen(target, tMs + 90), kill(target, tMs + 210), debris(target, tMs + 230, { count: 44, speedMps: 20, hot: 0.7, scale: 1.2 })];
// lenses: the Open Graph high three-quarter (over the hero's right shoulder, the hull big in the lower frame, the fight
// ahead behind it) and the Steinburg high rear quarter (over the engine deck, down the street); k = -1 mirrors sides.
// Review 2026-10-02: the three-quarter first sat AHEAD of the hero looking further ahead, which put the hero behind the
// lens — a hero-and-fight frame needs the lens behind the hero's shoulder.
const OG = (k = 1, look = 22) => RIG.follow({ side: [6.5 * k, 6 * k], along: [-7, -6], lift: [3.6, 3.3], fov: 46, look: [-1.5 * k, look, 0.9] });
const OG_HOLD = (k = 1, look = 22) => hold({ side: 6.5 * k, along: -7.5, lift: 3.6, fov: 46, lookHero: [-1.5 * k, look, 0.9] }, { side: 5.9 * k, along: -6.8, lift: 3.4, fov: 44, lookHero: [-1.5 * k, look, 0.9] });
const REAR = (k = 1) => RIG.follow({ side: [-5.5 * k, -5 * k], along: [-8.5, -7.2], lift: [4.6, 4.3], fov: 46, look: [1.5 * k, 24, 0.8] });
const REAR_HOLD = (k = 1) => hold({ side: -6 * k, along: -9, lift: 4.8, fov: 44, lookHero: [1.5 * k, 22, 0.8] }, { side: -5.4 * k, along: -8, lift: 4.5, fov: 42, lookHero: [1.5 * k, 22, 0.8] });
const DRONE = (k = 1) => RIG.drone({ side: 9 * k, along: [-24, -12], lift: [24, 20], fov: 46, look: [0, 12, 0] });
const CRANE = (k = 1) => RIG.crane({ side: -6 * k, along: [-12, -17], lift: [1.8, 11], fov: 46, look: [0, 40, 1] });

// [n, id, kind, title, set (staging), film (buildShot fields; durMs defaults to DUR), still { tMs, exposureMs }]
export const SHOTS = [
  // ---------------------------------------------------------------- tanks: the hero on the move through the fight
  [1, 'main-street-push', 'tank', 'A Leopard 2A6 pushes up the main street of burning Steinburg', S.stMain,
    // over the engine deck, down the street's centre line: REAR() sat in the east row's walls, its mirror looked across
    // the street into them, and a right-shoulder lens still framed the west row's courtyard walls (reviews 2026-10-03)
    { speed: 2.4, sun: 'side', effects: [...wreck('foe0'), ...incoming('foe1', 5, 24, 1500), fire('hero', 3400), mg('ally1', 2600, 9), dust('hero', 800, 10, 0.8)],
      cam: RIG.follow({ side: [1.2, 1.0], along: [-10, -9], lift: [5.6, 5.3], fov: 46, look: [1.0, 45, 1.0] }) },
    { tMs: 3480, exposureMs: 25 }],
  [2, 'factory-road', 'tank', 'An M1A2 Abrams TUSK rolls past the factory under fire', S.stEast,
    { count: 2, speed: 2.8, sun: 'side', effects: [...wreck('foe0'), ...incoming('foe1', -5, 18, 2000), mg('ally1', 1200, 9), fire('hero', 3900), dust('hero', 700, 10, 0.8)], cam: OG() },
    { tMs: 3980, exposureMs: 25 }],
  [3, 'square-pass', 'tank', 'A Leclerc XLR crosses the burning square', S.stSquare,
    { speed: 0.9, pinMs: 3300, sun: 'side', effects: [...wreck('foe0'), burn('foe1', 0), smoke('foe1', 0), fireField(H(-9, 12), 0, { radiusM: 4 }), huge(H(10, 46), 2600), fire('hero', 4200)],
      cam: RIG.passby({ side: -8, along: 0, lift: 3, fov: 42, look: [0, 0, 1.6] }) },
    { tMs: 3300, exposureMs: 33 }],
  [4, 'column-under-fire', 'tank', 'A T-90M column drives into the fight on the country road', S.vRoad,
    { speed: 2.4, sun: 'side', effects: [...wreck('foe0'), burn('foe2', 0), smoke('foe2', 0), ...incoming('foe1', -4, 10, 1300), fire('hero', 2600), huge(H(-30, 70), 3300), barrage(H(-24, 46), 3900, 6, 14), mg('ally1', 4400, 9), fire('ally1', 5200)], cam: OG() },
    { tMs: 2700, exposureMs: 25 }],
  [5, 'barn-advance', 'tank', 'A T-14 Armata advances past the barns of Verdant Fields', S.vVillage,
    { speed: 2.6, sun: 'side', effects: [...wreck('foe0'), ...incoming('foe1', 6, 20, 2200), fire('hero', 3700), dust('hero', 800, 10, 0.8)], cam: OG() },
    { tMs: 3780, exposureMs: 25 }],
  [6, 'farm-charge', 'tank', 'A KF51 Panther charges past the farmhouse through artillery', S.vFarm,
    { count: 1, speed: 3.2, sun: 'side', effects: [...wreck('foe0'), barrage(H(-14, 28), 900, 6, 12), barrage(H(12, 44), 3200, 5, 12), fire('hero', 4300), dust('hero', 700, 12, 1)], cam: RIG.lead({ side: 2.5, along: [15, 10], lift: 2.2, fov: 38, look: [0, -2, 1.5] }) },
    { tMs: 4380, exposureMs: 25 }],
  [7, 'lake-shellfire', 'tank', 'A Stridsvagn 122 crosses the frozen lake through shellfire', S.gLake,
    { speed: 3.6, sun: 'side', effects: [burn('foe1', 0), smoke('foe1', 0), ...hitNear(-7, 16, 1400), ...hitNear(9, 32, 3000), fire('hero', 4500), huge(H(-18, 70), 4700), exhaust('hero', 100)],
      cam: RIG.follow({ side: [10, 8.5], along: [3, 0.5], lift: 1.8, fov: 36, look: [0, 4, 1.4] }) },
    { tMs: 3060, exposureMs: 25 }],
  [8, 'market-push', 'tank', 'An M1A2 Abrams column pushes through the market street of Sunscar Oasis', S.oMarket,
    { count: 1, speed: 2.6, sun: 'side', effects: [...wreck('foe0'), ...incoming('foe1', -5, 15, 1800), fire('hero', 3600), dust('hero', 700, 12, 1)], cam: REAR() },
    { tMs: 3680, exposureMs: 25 }],
  [9, 'harbor-run', 'tank', 'A Leopard 2A7V runs the harbor road at Nordhavn under fire', S.fHarbor,
    { speed: 3, sun: 'side', effects: [...wreck('foe0'), ...hitNear(8, 20, 1500), mg('ally1', 2400, 9), huge(H(-12, 70), 3200), fire('hero', 4100)], cam: OG() },
    { tMs: 4180, exposureMs: 25 }],
  [10, 'ford-shellfire', 'tank', 'A ZTZ-100 fords the river as shells land around it', S.mFord,
    { speed: 2.4, sun: 'side', effects: [...wreck('foe0'), ...hitNear(-6, 12, 1300), ...hitNear(7, 22, 3100), fire('hero', 4400)], cam: RIG.follow({ side: [12, 10.5], along: [3, 0.5], lift: 2.2, fov: 34, look: [0, 2, 1.4] }) },
    { tMs: 4480, exposureMs: 25 }],
  [11, 'container-rows', 'tank', 'A Challenger 1 weaves between the container rows at Cinder Junction', S.rYard,
    { speed: 2.8, sun: 'side', effects: [...wreck('foe0'), ...incoming('foe1', -4, 16, 2400), fire('hero', 3900)], cam: RIG.chase({ side: -2.5, along: [-15, -11], lift: 3.2, fov: 44, look: [0, 40, 1.6] }) },
    { tMs: 3980, exposureMs: 25 }],
  [12, 'gantry-advance', 'tank', 'A T-90MS Tagil column advances under the Ironworks gantries', S.iGantry,
    { speed: 2.4, sun: 'side', effects: [...wreck('foe0'), fireField(H(-8, 20), 0, { radiusM: 3 }), ...hitNear(6, 30, 2000), fire('hero', 3300)], cam: OG() },
    { tMs: 3380, exposureMs: 25 }],
  [13, 'farm-race', 'tank', 'A K2 Black Panther races past the red-roofed farm at sunset', S.frFarm,
    { time: 'sunset', speed: 3.0, pinMs: 3300, effects: [fireField(H(14, 36), 0, { radiusM: 5 }), embers(H(14, 36), 0), ...hitNear(-10, 40, 1700), fire('hero', 3300), dust('hero', 900, 10, 0.8)], cam: RIG.passby({ side: -12, along: 0, lift: 1.6, fov: 38, look: [0, 0, 1.7] }) },
    { tMs: 3380, exposureMs: 25 }],
  [14, 'snow-push', 'tank', 'A T-80U pushes through snowy Frosthollow', S.wVillage,
    { speed: 2.4, count: 2, sun: 'side', effects: [...wreck('foe0'), burn('foe1', 0), smoke('foe1', 0), ...hitNear(8, 24, 2100), mg('ally1', 1300, 9), fire('hero', 3600)], cam: RIG.chase({ side: -3, along: [-16, -12.5], lift: 3, fov: 44, look: [0, 30, 1.8] }) },
    { tMs: 3680, exposureMs: 25 }],
  [15, 'orchard-column', 'tank', 'A C1 Ariete column drives through the orchard village under fire', S.orVillage,
    { speed: 1.5, sun: 'side', effects: [...wreck('foe0'), ...incoming('foe1', 5, 18, 1700), fire('hero', 3500), dust('hero', 700, 10, 0.8)], cam: OG() },
    { tMs: 3580, exposureMs: 25 }],

  // ---------------------------------------------------------------- battles: firefights, hits and knockouts
  [16, 'street-duel', 'battle', 'Street duel at night: a KF51 Panther trades fire down a Steinburg street', S.stWest,
    { time: 'night', picture: { exposure: 0.6 }, speed: 0, effects: [NIGHT_FLARE(H(-6, 60), 90), burn('foe1', 0), smoke('foe1', 0), fire('hero', 1400), ...incoming('foe0', -3, 10, 2500), mg('ally1', 3200, 9), ...knockout('hero', 'foe0', 4200)], cam: REAR_HOLD() },
    { tMs: 4460, exposureMs: 16 }],
  [17, 'crossroads-fire', 'battle', 'Fire at the Steinburg crossroads at noon', S.stCross,
    { speed: 0, effects: [...wreck('foe0'), burn('foe1', 0), fire('hero', 1300), huge(H(-14, 60), 2400), fire('ally1', 3300), barrage(H(8, 85), 3900, 5, 12)],
      cam: hold({ side: -14.5, along: 16.5, lift: 7.2, fov: 40 }, { side: -12.5, along: 14, lift: 6.4, fov: 38 }) },
    { tMs: 1380, exposureMs: 16 }],
  [18, 'street-knockout', 'battle', 'A T-90A is knocked out at the end of a Steinburg street at night', S.stSouth,
    { time: 'night', picture: { exposure: 0.3 }, speed: 0, effects: [NIGHT_FLARE(H(4, 50), 90), ...wreck('foe1'), ...knockout('hero', 'foe0', 1700), mg('ally1', 3000, 9), fire('ally1', 4400)],
      cam: hold({ side: 6, along: -8, lift: 3.6, fov: 42, lookHero: [-1, 30, 1.2] }, { side: 5.4, along: -7.2, lift: 3.4, fov: 40, lookHero: [-1, 30, 1.2] }) },
    { tMs: 2060, exposureMs: 16 }],
  [19, 'roof-tiles', 'battle', 'Roof tiles rain down as a Leopard 2A6 fires up the street', S.stMain,
    { speed: 0, sun: 'side', effects: [...wreck('foe0'), ...incoming('foe1', -9, 22, 1200), debris(H(-10, 24), 1360, { count: 50, speedMps: 12, hot: 0.1, scale: 1.4 }), fire('hero', 2600), fire('ally1', 3900)],
      cam: hold({ side: 5, along: 9, lift: 1.9, fov: 40, lookHero: [0, 2, 1.6] }, { side: 4.5, along: 8, lift: 2, fov: 38, lookHero: [0, 2, 1.6] }) },
    { tMs: 2680, exposureMs: 16 }],
  [20, 'road-return-fire', 'battle', 'A T-90M column returns fire across the fields at sunset', S.vRoad,
    { time: 'sunset', picture: { exposure: 0.3 }, speed: 0, effects: [...wreck('foe0'), burn('foe2', 0), smoke('foe2', 0), fire('hero', 1300), fire('ally1', 1900), fire('ally2', 2500), ...incoming('foe1', -3, 8, 3200), huge(H(-30, 75), 4100), barrage(H(-20, 55), 4700, 6, 14)], cam: OG_HOLD() },
    { tMs: 1380, exposureMs: 16 }],
  [21, 'fields-assault', 'battle', 'A T-90SM wedge assaults through the burning fields', S.vAssault,
    { count: 4, speed: 2.4, sun: 'side', effects: [...wreck('foe0'), burn('foe1', 0), smoke('foe1', 0), fire('ally1', 1100), huge(H(-6, 52), 2100), fire('hero', 3600), boom(H(-20, 40), 4600, 'large')],
      cam: OG() },
    { tMs: 3720, exposureMs: 25 }],
  [22, 'walking-barrage', 'battle', 'Artillery walks across the fields toward the wedge at night', S.vAssault,
    { time: 'night', picture: { exposure: 0.6 }, speed: 0, effects: [NIGHT_FLARE(H(-10, 70), 100), ...wreck('foe0'), barrage(H(-10, 70), 800, 6, 14), barrage(H(-6, 48), 2200, 6, 14), barrage(H(-2, 28), 3600, 5, 12), fire('hero', 4600)],
      cam: hold({ side: -12, along: -14, lift: 6, fov: 46, lookHero: [0, 50, 1] }, { side: -11, along: -12.5, lift: 5.6, fov: 44, lookHero: [0, 50, 1] }) },
    { tMs: 3700, exposureMs: 25 }],
  [23, 'village-crossroads', 'battle', 'T-14 and T-90M tanks hold the village crossroads', S.vVillage,
    { speed: 0, sun: 'side', effects: [...wreck('foe0'), fire('hero', 1500), ...incoming('foe1', 4, 12, 2700), fire('ally1', 3900), ...knockout('hero', 'foe1', 5100)], cam: OG_HOLD(-1) },
    { tMs: 1580, exposureMs: 16 }],
  [24, 'ice-duel', 'battle', 'A duel on the frozen lake: a T-80U takes the hit', S.gLake,
    { speed: 0, sun: 'side', effects: [burn('foe1', 0), smoke('foe1', 0), ...knockout('hero', 'foe0', 1500), ...hitNear(-6, 14, 3300), fire('ally1', 4400)],
      cam: hold({ side: 4.5, along: -9, lift: 1.1, fov: 38, lookHero: [-1, 40, 1.2] }, { side: 4.1, along: -8.2, lift: 1.15, fov: 36, lookHero: [-1, 40, 1.2] }) },
    { tMs: 1860, exposureMs: 16 }],
  [25, 'alpine-village', 'battle', 'A Leopard 2A5 and a CV90105 fight through the alpine village', S.gVillage,
    { speed: 0, sun: 'side', effects: [...wreck('foe0'), fire('hero', 1400), ...incoming('foe1', 5, 14, 2600), fire('hero', 3200), fire('ally1', 3800)], cam: OG_HOLD() },
    { tMs: 3280, exposureMs: 16 }],
  [26, 'minaret-fire', 'battle', 'A Merkava Mk 3D fires past the minaret at Sunscar Oasis', S.oMinaret,
    // low and level: from the shoulder height the oasis floor's dark contour bands filled the frame and hid the minaret
    { speed: 0, sun: 'side', effects: [...wreck('foe0'), fire('hero', 1600), fire('ally1', 2900), ...incoming('foe1', -6, 18, 3600)],
      cam: hold({ side: 6.5, along: -7.5, lift: 1.6, fov: 44, lookHero: [-1.5, 30, 2.6] }, { side: 6, along: -6.9, lift: 1.6, fov: 42, lookHero: [-1.5, 30, 2.6] }) },
    { tMs: 1680, exposureMs: 16 }],
  [27, 'caravanserai-kill', 'battle', 'A T-62MV-1 is knocked out by the caravanserai', S.oCaravan,
    { speed: 0, sun: 'side', effects: [...wreck('foe1'), ...knockout('hero', 'foe0', 2000), fire('ally1', 3600)], cam: REAR_HOLD() },
    { tMs: 2160, exposureMs: 16 }],
  [28, 'fjord-village', 'battle', 'A Stridsvagn 122 and a CV9040C hold the fjord village', S.fVillage,
    { speed: 0, sun: 'side', effects: [...wreck('foe0'), fire('hero', 1500), fire('ally1', 2300), mg('ally1', 3100, 9), fire('hero', 3300), ...incoming('foe1', 4, 12, 4000)], cam: OG_HOLD() },
    { tMs: 3380, exposureMs: 16 }],
  [29, 'fjord-road-kill', 'battle', 'A T-90 burns on the road above the fjord', S.fNorth,
    { speed: 0, sun: 'side', effects: [...wreck('foe1'), ...knockout('hero', 'foe0', 1800), fire('ally1', 3800)], cam: REAR_HOLD(-1) },
    { tMs: 1960, exposureMs: 16 }],
  [30, 'temple-village', 'battle', 'A K1A1 and a K21 fight through the temple village of Monsoon Ridge', S.mVillage,
    { speed: 0, sun: 'side', effects: [...wreck('foe0'), fire('hero', 1500), ...incoming('foe1', -4, 12, 2600), fire('hero', 3200), fire('ally1', 3900)], cam: OG_HOLD() },
    { tMs: 3280, exposureMs: 16 }],
  [31, 'ford-fire', 'battle', 'A Type 96B fires across the river ford', S.mFord,
    { lineup: [CAST.type96b, CAST.aft10], speed: 0, sun: 'side', effects: [...wreck('foe0'), fire('hero', 1700), ...hitNear(6, 9, 2900), fire('ally1', 4300)], cam: OG_HOLD(-1) },
    { tMs: 1780, exposureMs: 16 }],
  [32, 'yard-salvo', 'battle', 'M1A2 SEPv3 tanks fire across the rail yard at golden hour', S.rTracks,
    { speed: 0, effects: [...wreck('foe0'), fire('hero', 1300), fire('ally1', 1900), fire('ally2', 2500), ...incoming('foe1', 6, 14, 3600)],
      cam: hold({ side: 9, along: -10, lift: 3.4, fov: 42, lookHero: [-4, 40, 1.4] }, { side: 8.2, along: -9, lift: 3.2, fov: 40, lookHero: [-4, 40, 1.4] }) },
    { tMs: 1380, exposureMs: 16 }],
  [33, 'water-tower', 'battle', 'The line advances past the burning water tower at night', S.rFactory,
    { count: 1, time: 'night', picture: { exposure: 0.6 }, speed: 2.2, effects: [NIGHT_FLARE(H(-4, 60), 90), ...wreck('foe0'), fireField(H(-12, 18), 0, { radiusM: 5 }), ...hitNear(-8, 25, 1900), fire('hero', 3600)], cam: RIG.chase({ side: -3, along: [-16, -12], lift: 3.4, fov: 44, look: [0, 40, 1.6] }) },
    { tMs: 3680, exposureMs: 25 }],
  [34, 'furnace-salvo', 'battle', 'T-14 Armatas fire a rippling salvo in the Ironworks yard at night', S.iYard,
    { time: 'night', picture: { exposure: 0.6 }, speed: 0, effects: [NIGHT_FLARE(H(0, 30), 70), ...wreck('foe0'), fireField(H(-7, 10), 0, { radiusM: 3 }), fireField(H(21, 8), 0, { radiusM: 3 }), embers(H(-7, 10), 0), fire('hero', 1100), fire('ally1', 1900), fire('ally2', 2700), fire('ally3', 3500)],
      cam: hold({ side: 9.2, along: 14.4, lift: 2.4, fov: 40, lookHero: [-9, 0, 1.8] }, { side: 8.2, along: 12.6, lift: 2.4, fov: 38, lookHero: [-9, 0, 1.8] }) },
    { tMs: 1180, exposureMs: 16 }],
  [35, 'farm-village', 'battle', 'A Type 90 and a Type 89 fight through the farm village of Frontier Basin', S.frVillage,
    { speed: 0, sun: 'side', effects: [...wreck('foe1'), fire('hero', 1500), ...incoming('foe0', 5, 13, 2700), fire('hero', 3300), fire('ally1', 3900)], cam: OG_HOLD() },
    { tMs: 3380, exposureMs: 16 }],
  [36, 'barn-knockout', 'battle', 'A Type 10 knocks out a T-90M beside the burning barn', S.frVillage,
    { lineup: [CAST.type10, CAST.k2], speed: 0, sun: 'side', effects: [...wreck('foe1'), fireField(H(-14, 22), 0, { radiusM: 6 }), embers(H(-14, 22), 0), ...knockout('hero', 'foe0', 1900), fire('ally1', 4100)], cam: REAR_HOLD() },
    { tMs: 2060, exposureMs: 16 }],
  [37, 'river-village', 'battle', 'ZTZ-100 tanks fight through the river village of the Jade River Delta', S.dVillage,
    { speed: 0, sun: 'side', effects: [...wreck('foe0'), fire('hero', 1400), fire('ally1', 2500), ...incoming('foe1', -5, 14, 3300), fire('ally2', 4300)], cam: OG_HOLD() },
    { tMs: 1480, exposureMs: 16 }],
  [38, 'church-knockout', 'battle', 'A Leopard 2A6 is knocked out beside the onion-domed church at night', S.wChurch,
    { time: 'night', picture: { exposure: 0.6 }, speed: 0, effects: [NIGHT_FLARE(H(-6, 55), 95), ...wreck('foe1'), ...knockout('hero', 'foe0', 1900), fire('ally1', 3800), mg('ally1', 4800, 9)], cam: OG_HOLD() },
    { tMs: 2060, exposureMs: 16 }],
  [39, 'lakeside-village', 'battle', 'A Chieftain Mk 10 fires across the village at Highland Reservoir', S.reVillage,
    { speed: 0, sun: 'side', effects: [...wreck('foe0'), fire('hero', 1500), ...incoming('foe1', 5, 13, 2700), fire('hero', 3300), fire('ally1', 3800)], cam: OG_HOLD() },
    { tMs: 3380, exposureMs: 16 }],

  // ---------------------------------------------------------------- scenes: the battlefield around the fight
  [40, 'rooftop-smoke', 'scene', 'Smoke columns rise over the rooftops of Steinburg', S.stNorth,
    // a street-level push behind the hero, looking up the street to the wrecks ~100 m on, so their columns rise over
    // the far rooftops: DRONE()'s look 12 m ahead of the hero never framed them (r4c), and a high drone 45 m back
    // (r4d) hid the hero behind a roof and shrank the columns to wisps on the horizon (reviews 2026-10-04)
    { speed: 2.4, sun: 'side', effects: [...wreck('foe0'), ...wreck('foe1'), ...wreck('foe2'), barrage(H(-20, 140), 2400, 6, 16), fire('hero', 4200)],
      cam: RIG.drone({ side: 1.5, along: [-22, -14], lift: [5, 4.2], fov: 44, look: [0, 100, 14] }) },
    { tMs: 3300, exposureMs: 25 }],
  [41, 'church-tower', 'scene', 'The night street fight seen from the church tower', S.stMain,
    { lineup: [CAST.leo2a6, CAST.puma, CAST.leo2a6], time: 'night', picture: { exposure: 0.6 }, speed: 0, effects: [NIGHT_FLARE(H(-8, 70), 100), ...wreck('foe0'), fire('hero', 1500), fire('ally1', 2500), ...incoming('foe1', -4, 16, 3500), fire('ally2', 4700)],
      cam: hold({ side: -12, along: -30, lift: 16, fov: 38, lookHero: [0, 40, 0] }, { side: -11, along: -27, lift: 15, fov: 37, lookHero: [0, 40, 0] }) },
    { tMs: 2700, exposureMs: 16 }],
  [42, 'assault-above', 'scene', 'Verdant Fields from above as the assault rolls in', S.vAssault,
    { count: 4, speed: 2.4, sun: 'side', effects: [...wreck('foe0'), burn('foe1', 0), smoke('foe1', 0), huge(H(-6, 52), 1800), barrage(H(-14, 70), 3000, 6, 16), fire('hero', 4300)], cam: DRONE(-1) },
    { tMs: 3300, exposureMs: 25 }],
  [43, 'lake-crane', 'scene', 'Glacier Pass at sunset: smoke rises over the frozen lake and the peaks', S.gLake,
    { time: 'sunset', speed: 3, effects: [burn('foe1', 0), smoke('foe1', 0), ...hitNear(-12, 40, 2000), fire('hero', 3600)], cam: CRANE() },
    { tMs: 4600, exposureMs: 25 }],
  [44, 'oasis-sunset', 'scene', 'Sunscar Oasis at sunset: smoke over the palms and the minaret', S.oGolden,
    { time: 'sunset', speed: 0, effects: [...wreck('foe0'), fire('hero', 1600), fire('ally1', 3000), ...incoming('foe1', -6, 18, 4000)],
      cam: RIG.crane({ side: -9, along: [-14, -20], lift: [2.4, 12], fov: 44, look: [0, 30, 2] }) },
    { tMs: 3300, exposureMs: 25 }],
  // golden, not sunset: the 3.5° sunset sun sits behind the fjord's and the ridge's mountains, so from the crane and
  // the drone the whole valley was in shadow and rendered nearly black (r4c review, 2026-10-04)
  [45, 'harbor-wide', 'scene', 'Nordhavn at golden hour: the battle on the harbor road below the mountains', S.fHarbor,
    { time: 'golden', speed: 3, effects: [...wreck('foe0'), ...hitNear(10, 30, 2000), fire('hero', 3800)], cam: RIG.crane({ side: 18, along: [6, 0], lift: [6, 14], fov: 40, look: [0, -10, 1.5] }) },
    { tMs: 3300, exposureMs: 25 }],
  // day light and an oblique drone: under a low sun the jungle canopy left the steep drone view black at sunset (r4c)
  // and still at golden hour (r4d) — only the river's glint read; the oblique lens adds the far ridge and the sky
  [46, 'river-drone', 'scene', 'Monsoon Ridge: shells land along the jungle river', S.mFord,
    { lineup: [CAST.aft10, CAST.type96b], time: 'day', picture: { exposure: 0.2 }, speed: 2.4, effects: [...wreck('foe0'), barrage(H(-10, 30), 1200, 6, 14), barrage(H(8, 50), 3400, 5, 12), fire('hero', 4600)],
      cam: RIG.drone({ side: 9, along: [-30, -20], lift: [18, 15], fov: 46, look: [0, 40, 0] }) },
    { tMs: 3300, exposureMs: 25 }],
  [47, 'ironworks-crane', 'scene', 'Ironworks at night: the yard burns between the smoke stacks', S.iYard,
    { time: 'night', picture: { exposure: 0.6 }, speed: 0, effects: [NIGHT_FLARE(H(6, 60), 90), ...wreck('foe0'), fireField(H(-7, 10), 0, { radiusM: 3 }), fireField(H(21, 8), 0, { radiusM: 3 }), fire('hero', 1500), fire('ally2', 3200), barrage(H(0, 90), 3800, 5, 14)], cam: CRANE(-1) },
    { tMs: 4600, exposureMs: 25 }],
  [48, 'delta-crane', 'scene', 'Jade River Delta: the river village under fire, mountains beyond', S.dVillage,
    { lineup: [CAST.type96b, CAST.aft10, CAST.type96b], speed: 0, sun: 'side', effects: [...wreck('foe0'), fire('hero', 1500), fire('ally1', 2600), barrage(H(4, 80), 3500, 6, 14)], cam: CRANE() },
    { tMs: 4600, exposureMs: 25 }],
  // day light and an oblique drone, as 46: the steep drone view of the orchard rows in long shadow rendered nearly black
  // at sunset (r4c) and still dark at golden hour (r4d, 2026-10-04)
  [49, 'orchard-sunset', 'scene', 'Orchard Valley: smoke drifts over the orchards', S.orGolden,
    { time: 'day', picture: { exposure: 0.2 }, speed: 1.5, effects: [...wreck('foe0'), ...incoming('foe1', 5, 18, 1700), fire('hero', 3500)],
      cam: RIG.drone({ side: -9, along: [-30, -20], lift: [18, 15], fov: 46, look: [0, 40, 0] }) },
    { tMs: 3300, exposureMs: 25 }],
  [50, 'reservoir-crane', 'scene', 'Highland Reservoir at sunset: the lake beyond the burning village', S.reVillage,
    { lineup: [CAST.chieftain5, CAST.warrior], time: 'sunset', speed: 0, effects: [...wreck('foe0'), fire('hero', 1500), ...incoming('foe1', 5, 13, 2700), fire('ally1', 3800)], cam: CRANE() },
    { tMs: 4600, exposureMs: 25 }],
];

// Paint (owner 2026-10-02: "all of our tanks have too similar camos"). On their stock coats twelve of the fifty heroes
// wore the same Russian digital and ten the same Leopard three-tone, and nearly every enemy the Russian digital. Each
// shot's unit now wears its own scheme from the catalog — no two shots alike — picked for its battlefield and hour:
// snow schemes only on the snow maps, sand and pixel-desert on Sunscar, urban blocks and dazzle in Steinburg, light
// coats for the night fights so the flare catches them. Its enemy wears a different scheme. The Studio paints per
// vehicle model, so no model may appear on both sides of one shot. n: [unit scheme, enemy scheme]
export const PAINT = Object.freeze({
  1: ['flecktarn', 'sig_t90a'], 2: ['berlin', 'service_soviet_coldwar'], 3: ['urbanblock', 'sig_t90'],
  4: ['sig_t90', 'service_leo2a6m'], 5: ['sig_object695_x', 'merdc'], 6: ['splinter', 'sig_t90a_vladimir'],
  7: ['winterbands', 'service_soviet_coldwar'], 8: ['chocchip', 'sig_t90ms'], 9: ['sig_leo2a4_otco', 'sig_t90a'],
  10: ['sig_type100', 'rasputitsa'], 11: ['desert', 'paint_ru_t80u_modern'], 12: ['sig_t90ms', 'summer'],
  13: ['sig_k2b', null], 14: ['winter', 'merdcwinter'], 15: ['autumn', 'service_soviet_coldwar'],
  16: ['dazzle', 'sig_t90a'], 17: ['service_strv122', 'sig_t72m1_jaguar'], 18: ['digitaldesert', 'service_soviet_coldwar'],
  19: ['ambushdot', 'paint_ru_t80u_modern'], 20: ['rasputitsa', 'merdc'], 21: ['sig_t90sm', 'service_leo2a6m'],
  22: ['sig_tos1a_tagil', 'summer'], 23: ['hexfield', 'service_usa_desert'], 24: ['merdcwinter', 'sig_t90a_vladimir'],
  25: ['washworn', 'service_soviet_coldwar'], 26: ['sig_merkava3c', 'paint_amx40'], 27: ['sig_merkava4b', 'sig_t90ms'],
  28: ['paint_cv90_mkiv', 'sig_t90'], 29: ['tigerstripe', 'sig_t90a_vladimir'], 30: ['jungleops', 'sig_t72m1_jaguar'],
  31: ['service_type99a', 'rasputitsa'], 32: ['service_usa_desert', 'sig_t90a'], 33: ['sig_ua_m1a1', 'sig_t90m'],
  34: ['sig_bmpt_t90', 'service_leo2a6m'], 35: ['sig_type90a', 'service_soviet_coldwar'], 36: ['amoeba', 'paint_ru_t80u_modern'],
  37: ['sig_ztz100_x', 'sig_t90'], 38: ['ardennes44', 'merdcwinter'], 39: ['dpm', 'sig_t90a'],
  40: ['sig_amx56', 'service_soviet_coldwar'], 41: ['sig_sabra_mk2_x', 'sig_t90'], 42: ['paint_ru_t80u_modern', 'service_leo2a6m'],
  43: ['m90', 'winter'], 44: ['pinkdesert', 'sig_t90ms'], 45: ['naval', 'sig_t90a'],
  46: ['tropic', 'rasputitsa'], 47: ['sig_t90a', 'summer'], 48: ['sig_ztz85_iii', 'sig_t72m1_jaguar'],
  49: ['oakleaf', 'service_soviet_coldwar'], 50: ['service_challenger_3', 'paint_ru_t80u_modern'],
});

// The hero's first round goes out on a flank (the barrel crosses the frame, away from the lens) in a third of the shots,
// spread over the kinds (owner 2026-10-03: "experiment with turrets being at unique angles and rotations").
export const FLANK = new Set([2, 5, 6, 8, 9, 12, 15, 19, 21, 25, 28, 30, 35, 39, 43, 45]);
// Close holds where the hero's first free round angles at the lens instead (the turret lab's strongest close frames).
export const LENS = new Set([16, 20, 26, 31, 37]);
export const turretStyle = n => (FLANK.has(n) ? 'flank' : LENS.has(n) ? 'lens' : 'sectors');

const CAMERA_BLOCKED_MAX = 0.1;
const mirrorCam = cam => cam.map(k => ({ ...k, ...(k.side != null ? { side: -k.side } : {}), ...(k.orbit != null ? { orbit: -k.orbit } : {}),
  ...(k.lookHero ? { lookHero: [-k.lookHero[0], k.lookHero[1], k.lookHero[2]] } : {}) }));
const tuckCam = cam => cam.map(k => ({ ...k, ...(k.side != null ? { side: k.side * 0.6 } : {}), ...(k.lift != null ? { lift: k.lift + 1.6 } : {}) }));
/** Builds one site shot's scene JSON (storyboard + still moment + meta). */
export function siteScene([n, id, kind, title, setRef, film, still]) {
  const set = typeof setRef === 'string' ? setById(setRef) : setRef;
  const time = film.time ?? set.time;
  const base = { ...set, time: T(time), picture: pictureFor({ ...set, time }, { ...SITE_LENS, ...(film.picture ?? {}) }), light: set.light,
    ...(film.formation ? { formation: film.formation } : {}), ...(film.count ? { count: film.count } : {}),
    ...(film.lineup ? { lineup: film.lineup } : {}), ...('enemies' in film ? { enemies: film.enemies } : {}),
    ...(film.anchor ? { anchor: film.anchor } : {}), ...(film.heading != null ? { heading: film.heading } : {}) };
  const [camo, foeCamo] = PAINT[n] ?? [];
  if (camo) base.camo = camo;
  if (foeCamo && base.enemies) base.enemies = { ...base.enemies, camo: foeCamo };
  // the lens must clear the battlefield's buildings: a camera path inside a wall or blind behind one is mirrored to the
  // hero's other side, tucked in and raised, or both — whichever clears the most (camera-clearance.mjs)
  let scene = buildShot(base, { durMs: DUR, ...film, still }), cameraFix = null, lens = film.cam;
  const blocked0 = blockedFraction(scene);
  if (blocked0 > CAMERA_BLOCKED_MAX) {
    let best = blocked0;
    for (const [name, cam] of [['mirrored', mirrorCam(film.cam)], ['tucked', tuckCam(film.cam)], ['mirrored+tucked', tuckCam(mirrorCam(film.cam))]]) {
      const alt = buildShot(base, { durMs: DUR, ...film, cam, still }), f = blockedFraction(alt);
      if (f < best) { best = f; scene = alt; cameraFix = name; lens = cam; }
    }
  }
  // turrets (turret-choreo.mjs): every gun watches its own sector, traverses to each of its targets and is home again
  // before the loop wraps; the FLANK shots swing the hero's first round out across the frame
  const style = turretStyle(n);
  const choreo = choreograph(scene, { loopMs: LOOP_MS, xfadeMs: XFADE_MS, style });
  scene = buildShot(base, { durMs: DUR, ...film, cam: lens, still, turrets: choreo.turrets, guns: choreo.guns,
    effects: [...(film.effects ?? []), ...choreo.effects] });
  if (set.autoPlace === false) scene.autoPlace = false;
  if (set.allowWater) for (const a of scene.actors) a.allowWater = true;
  const az = LIGHT_READY ? sunFor(scene, film.sun ?? set.sun, time) : null;
  if (az != null) scene.light = { ...(scene.light ?? {}), sunAzimuthDeg: az };
  const hero = scene.actors[0]?.id;
  scene.meta = { n, id: `s${String(n).padStart(2, '0')}-${id}`, kind, title, set: set.id, map: set.map, time, hero, heroName: CAST_NAMES[hero]?.[0] ?? hero,
    loopMs: LOOP_MS, xfadeMs: XFADE_MS, still,
    paint: { unit: base.camo, enemy: base.enemies ? base.enemies.camo ?? base.camo : null },
    turrets: { style, plan: choreo.notes }, ...(cameraFix ? { cameraFix } : {}) };
  return scene;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const out = process.argv[2] ?? 'shots/media-r5/site50/scenes';
  const only = process.argv[3]?.split(',');
  mkdirSync(out, { recursive: true });
  const manifest = [];
  for (const shot of SHOTS) {
    const scene = siteScene(shot);
    if (only && !only.some(o => scene.meta.id.includes(o))) continue;
    writeFileSync(join(out, `${scene.meta.id}.json`), JSON.stringify(scene, null, 1));
    manifest.push(scene.meta);
  }
  writeFileSync(join(out, '..', 'site50-manifest.json'), JSON.stringify(manifest, null, 1));
  console.log(`${manifest.length} site shots -> ${out} (light ${LIGHT_READY ? 'ready' : 'fallback'})`);
}
