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
import { buildShot, fire, kill, pen, burn, smoke, boom, dust, mg, barrage, exhaust, flare, smokeScreen, embers, debris, fireField, huge, H } from './setups.mjs';
import { setById, T, pictureFor, LIGHT_READY, FILM_LENS, sunFor, RIG } from './sets.mjs';
import { CAST, CAST_NAMES } from './cast.mjs';

export const LOOP_MS = 6000, XFADE_MS = 600, DUR = LOOP_MS + XFADE_MS;
export const KINDS = Object.freeze(['tank', 'battle', 'scene']);
const NIGHT_FLARE = (at, h = 100) => flare(at, 0, { heightM: h, burnS: 40, driftMps: 1.2 });
const hold = (a, b) => [{ tMs: 0, ...a }, { tMs: 'end', ...b }];

// Staging for battlefields the earlier rounds never filmed (anchors from the 13-map scout, 2026-10-02). The scout's
// own camera rigs put +side on the opposite hand to setups.mjs, so the side views below are its views mirrored in sign.
const stage = (id, map, time, seed, anchor, heading, more = {}) => ({ id, map, time, seed, anchor, heading, camo: 'factory', ...more });
const DESERT_DAY = { exposure: -0.4, contrast: 1.12 };
const NEW = {
  steppeRoad: stage('tarkhan-golden-road', 'steppe', 'golden', 431, [-211.5, -154], 98, { formation: 'column', lineup: [CAST.leo, CAST.kf51, CAST.leo], count: 3 }),
  steppeRidge: stage('tarkhan-golden-ridge', 'steppe', 'golden', 432, [264.4, 98], -3, { formation: 'wedge', lineup: [CAST.leo, CAST.kf51, CAST.leo, CAST.kf51, CAST.lynx] }),
  deltaRiver: stage('jade-morning-river', 'delta', 'morning', 433, [135.3, 144.3], 37, { formation: 'pair', lineup: [CAST.ztz100, CAST.type96b] }),
  deltaVillage: stage('jade-morning-village', 'delta', 'morning', 434, [24, 42], 106, { formation: 'column', lineup: [CAST.ztz100, CAST.type96b, CAST.ztz100], count: 3 }),
  frontierFarm: stage('frontier-morning-farm', 'frontier', 'morning', 435, [36, 105.3], 11, { formation: 'pair', lineup: [CAST.type10, CAST.k2] }),
  titanMesa: stage('titan-golden-mesa', 'titan_gorge', 'golden', 436, [-25, -178.8], 27, { formation: 'column', lineup: [CAST.merkava, CAST.leclerc, CAST.merkava], count: 3 }),
  oasisMinaret: stage('sunscar-day-minaret', 'oasis', 'day', 437, [92, 80], 261, { formation: 'pair', lineup: [CAST.merkava, CAST.leclerc], picture: DESERT_DAY }),
  whiteoutPeak: stage('whiteout-morning-peak', 'whiteout', 'morning', 438, [5.1, 279.3], 188, { formation: 'pair', lineup: [CAST.t14, CAST.t90m] }),
  calderaFight: stage('obsidian-dusk-fight', 'caldera', 'dusk', 439, [10, 14], 188, { formation: 'pair', lineup: [CAST.t90m, CAST.t14],
    enemies: { along: 90, lat: 6, count: 2, formation: 'pair', lineup: [CAST.leo, CAST.kf51], states: ['burning', 'intact'] } }),
  poldersMill: stage('tidegate-morning-mill', 'polders', 'morning', 440, [-95.4, -152], 17, { formation: 'column', lineup: [CAST.leo, CAST.cv90, CAST.leo], count: 3 }),
  reservoirShore: stage('reservoir-sunset-shore', 'reservoir', 'sunset', 441, [93.7, 132.3], 263, { formation: 'pair', lineup: [CAST.leo, CAST.kf51] }),
};

// [n, id, kind, title, set (id or own staging), film (buildShot fields; durMs defaults to DUR), still { tMs, exposureMs }]
export const SHOTS = [
  // ---------------------------------------------------------------- tanks
  [1, 'lake-glide', 'tank', 'A KF51 Panther glides across the frozen lake at dawn', 'glacier-dawn-lake',
    { speed: 4.6, effects: [exhaust('hero', 100), exhaust('ally1', 200), dust('hero', 1200, 8, 0.6)], cam: RIG.follow({ side: [11, 9.5], along: [2.2, -0.8], lift: 0.7, fov: 34, look: [0, 0.3, 1.5] }) },
    { tMs: 3300, exposureMs: 33 }],
  [2, 'runway-lead', 'tank', 'An M1A2 SEPv3 leads the wedge down the runway at dawn', 'kestrel-dawn-runway',
    { speed: 6.2, count: 3, effects: [smokeScreen('ally1', 700, { durationS: 20 }), smokeScreen('ally2', 1000, { durationS: 20 }), dust('hero', 900, 10, 0.8)],
      cam: RIG.lead({ side: 1.1, along: [24, 16], lift: 0.7, fov: 27, look: [0, -4, 1.6] }) },
    { tMs: 4200, exposureMs: 33 }],
  [3, 'canyon-orbit', 'tank', 'A slow orbit of the Leclerc XLR on the canyon floor at golden hour', 'redrock-golden-canyon',
    { speed: 3.2, effects: [dust('hero', 800, 10, 0.8)], cam: RIG.orbit({ radius: 14.5, from: 28, to: 88, lift: 1.05, fov: 34 }) },
    { tMs: 3600, exposureMs: 25 }],
  [4, 'surf-run', 'tank', 'A Leclerc XLR runs the surf line at sunset', 'saltmere-sunset-strand',
    { speed: 4.6, effects: [dust('hero', 900, 10, 0.8)], cam: RIG.follow({ side: [12.5, 10.5], along: [3, 0.2], lift: 1.0, fov: 32, look: [0, 0, 1.6] }) },
    { tMs: 3500, exposureMs: 33 }],
  [5, 'fjord-pass', 'tank', 'A Leopard 2A7V rolls past the fjord at blue hour', 'nordhavn-dusk-fjord',
    { speed: 4, pinMs: 3300, effects: [], cam: RIG.passby({ side: 9, along: 0, lift: 0.62, fov: 42, look: [0, 0, 1.6] }) },
    { tMs: 3300, exposureMs: 33 }],
  [6, 'mars-lead', 'tank', 'A ZTZ-100 leads the convoy under the Martian sky', 'olympus-mars-convoy',
    { speed: 4.6, effects: [dust('hero', 800, 12, 1), dust('ally1', 900, 10, 0.9)], cam: RIG.lead({ side: 2, along: [20, 14], lift: 0.75, fov: 24, look: [0, -3, 2] }) },
    { tMs: 3800, exposureMs: 25 }],
  [7, 'earthrise-climb', 'tank', 'A KF51 Panther climbs toward the rising Earth', 'earthrise-moon',
    { speed: 2.4, effects: [dust('hero', 900, 8, 0.6)], cam: RIG.chase({ side: -3.6, along: [-22, -27], lift: 1.4, fov: 44, look: [0, 60, 11] }) },
    { tMs: 3600, exposureMs: 20 }],
  [8, 'river-ford', 'tank', 'A ZTZ-100 fords the monsoon river', 'monsoon-morning-ford',
    { speed: 2.6, effects: [], cam: RIG.follow({ side: [14.5, 12.5], along: [3.5, 0.5], lift: 1.0, fov: 30, look: [0, 0, 1.4] }) },
    { tMs: 3300, exposureMs: 25 }],
  [9, 'viaduct-deck', 'tank', 'A C2 Ariete column crosses the high viaduct', 'aegis-morning-viaduct',
    { speed: 3, absY: true, sun: 'front', effects: [], cam: RIG.follow({ side: [13.5, 11.5], along: [3.4, 0.4], lift: 4.0, fov: 31, look: [0, 0, 3.7] }) },
    { tMs: 3300, exposureMs: 33 }],
  [10, 'harbor-road', 'tank', 'Ariete and Leclerc tanks along the harbor road', 'saltwind-day-harbor',
    // the harbor sandbags sit 7 m ahead of the column: a slow creep stops short of them
    { speed: 0.9, effects: [dust('hero', 800, 8, 0.6)], cam: RIG.follow({ side: [12.5, 10.5], along: [3, -0.4], lift: 3.2, fov: 32, look: [0, 0, 1.4] }) },
    { tMs: 3300, exposureMs: 33 }],
  [11, 'tower-roll', 'tank', 'A KF51 Panther rolls beneath the arcology towers', 'blackglass-day-towers',
    { speed: 2.9, effects: [burn('foe0', 0)], cam: RIG.follow({ side: [7, 6.2], along: [7.5, 4], lift: 0.6, fov: 54, look: [-1, 3, 3.2] }) },
    { tMs: 3300, exposureMs: 33 }],
  [12, 'yard-line', 'tank', 'A Leopard and KF51 line crosses the rail yard at golden hour', 'cinder-dusk-tracks',
    // golden, not the set's dusk: at dusk the yard swallowed the line
    { time: 'golden', speed: 3.4, effects: [dust('hero', 900, 10, 0.8)], cam: RIG.follow({ side: [13.5, 11.5], along: [3.6, 0.6], lift: 1.0, fov: 30 }) },
    { tMs: 3300, exposureMs: 33 }],
  [13, 'street-advance', 'tank', 'A Leopard 2A7V advances up the street under flare light', 'steinburg-night-street',
    { speed: 1.9, effects: [NIGHT_FLARE([40, 10]), burn('foe0', 0), smoke('foe0', 0), embers('foe0', 0), mg('ally1', 2400, 9)], cam: RIG.follow({ side: [-4.9, -4.6], along: [6.8, 4.6], lift: 1.3, fov: 48, look: [0, 0, 1.6] }) },
    { tMs: 3300, exposureMs: 40 }],
  [14, 'village-night', 'tank', 'A Leopard 2A7V through Frosthollow at night', 'frosthollow-night-village',
    { speed: 2.3, count: 2, effects: [flare([-80, -40], 0, { heightM: 105, burnS: 40, driftMps: 1.2 }), burn('foe0', 0), embers('foe0', 0)], cam: RIG.chase({ side: -3.4, along: [-17, -13.5], lift: 2.2, fov: 42, look: [0, 30, 2] }) },
    { tMs: 3300, exposureMs: 40 }],
  [15, 'avenue-armata', 'tank', 'A T-14 Armata moves down the ruined avenue at dusk', 'ruinspires-dusk-avenue',
    { speed: 2.2, count: 1, picture: { exposure: 0.8 }, effects: [burn('foe0', 0), smoke('foe0', 0)], cam: RIG.chase({ side: 0.5, along: [-12, -9], lift: 2.2, fov: 42, look: [0, 40, 3] }) },
    { tMs: 3300, exposureMs: 33 }],
  [16, 'mine-shelf', 'tank', 'M1A2 SEPv3 and K2 tanks on the ore shelf at golden hour', 'copper-golden-mine',
    { speed: 1.8, count: 3, effects: [burn('foe0', 0), dust('hero', 900, 10, 0.8)], cam: RIG.orbit({ radius: 13, from: 32, to: 70, lift: 1.2, fov: 36 }) },
    { tMs: 3300, exposureMs: 25 }],
  [17, 'steppe-road', 'tank', 'A Leopard 2A7V column on the autumn road across the steppe', NEW.steppeRoad,
    { speed: 3.6, effects: [dust('hero', 700, 10, 0.9), dust('ally1', 760, 10, 0.9), exhaust('hero', 100)], cam: RIG.follow({ side: [-14, -12], along: [3, 0.5], lift: 1.6, fov: 34, look: [0, 0, 1.6] }) },
    { tMs: 3300, exposureMs: 33 }],
  [18, 'delta-river', 'tank', 'A ZTZ-100 along the river in the Jade River Delta', NEW.deltaRiver,
    { speed: 2.8, effects: [dust('hero', 800, 8, 0.6)], cam: RIG.follow({ side: [-15, -13], along: [2.5, 0], lift: 2.2, fov: 32, look: [0, 0, 1.6] }) },
    { tMs: 3300, exposureMs: 33 }],
  [19, 'frontier-farm', 'tank', 'A Type 10 rolls past the red-roofed farm in Frontier Basin', NEW.frontierFarm,
    // solo: the K2 wing drives into the farm buildings
    { speed: 3, pinMs: 3300, count: 1, effects: [dust('hero', 900, 8, 0.7)], cam: RIG.passby({ side: -12, along: 0, lift: 1.4, fov: 38, look: [0, 0, 1.7] }) },
    { tMs: 3300, exposureMs: 33 }],
  [20, 'titan-mesa', 'tank', 'A Merkava Mk 4 column under the striped mesas of Titan Gorge', NEW.titanMesa,
    { speed: 3.4, effects: [dust('hero', 700, 12, 1), dust('ally1', 760, 10, 0.9)], cam: RIG.follow({ side: [-14.5, -12.5], along: [3, 0.5], lift: 1.4, fov: 32, look: [0, 0, 1.8] }) },
    { tMs: 3300, exposureMs: 33 }],
  [21, 'oasis-minaret', 'tank', 'A Merkava Mk 4 passes the minaret at Sunscar Oasis', NEW.oasisMinaret,
    { speed: 3, effects: [dust('hero', 700, 12, 1)], cam: RIG.follow({ side: [-15, -13], along: [2, 0], lift: 1.8, fov: 34, look: [0, 0, 1.8] }) },
    { tMs: 3300, exposureMs: 33 }],
  [22, 'whiteout-peak', 'tank', 'A T-14 Armata crosses the snowfield below the peak at Whiteout Station', NEW.whiteoutPeak,
    { speed: 2.4, effects: [dust('hero', 800, 10, 0.7)], cam: RIG.follow({ side: [-9, -8], along: [12, 10], lift: 1.3, fov: 40, look: [0, 2, 1.8] }) },
    { tMs: 3300, exposureMs: 33 }],

  // ---------------------------------------------------------------- battles
  [23, 'fields-assault', 'battle', 'A T-90M wedge assaults through the fields under fire', 'verdant-day-assault',
    { speed: 2.4, effects: [burn('foe0', 0), burn('foe1', 0), smoke('foe1', 0), fire('ally1', 1100), huge([-6, 52], 2100), fire('hero', 3600), boom([-20, 40], 4600, 'large')],
      cam: RIG.follow({ side: [3.3, 2.8], along: [-10, -7.5], lift: 3.2, fov: 44, look: [-4, 60, 2] }) },
    { tMs: 3720, exposureMs: 25 }],
  [24, 'fields-fire', 'battle', 'A T-90M fires across the burning fields', 'verdant-day-assault',
    { speed: 0, effects: [burn('foe0', 0), burn('foe1', 0), smoke('foe1', 0), fire('hero', 1500), huge([-6, 52], 2600), fire('ally1', 4200), mg('ally2', 3200, 9)],
      cam: hold({ side: 4.6, along: 9.8, lift: 0.45, fov: 38 }, { side: 4.1, along: 8.8, lift: 0.48, fov: 36 }) },
    { tMs: 1580, exposureMs: 16 }],
  [25, 'yard-barrage', 'battle', 'An artillery barrage walks across the foundry yard at night', 'ironworks-night-yard',
    { speed: 0, effects: [flare([40, -110], 0, { heightM: 90, burnS: 40, intensity: 1.4, driftMps: 1.0 }), barrage([40, -122], 900, 7, 16), barrage([30, -112], 3300, 6, 14), fire('hero', 2500), fire('ally1', 4300)],
      cam: hold({ side: -20, along: -30, lift: 4, fov: 40, lookHero: [0, 40, 6] }, { side: -17, along: -24.5, lift: 4.8, fov: 40, lookHero: [0, 40, 6] }) },
    { tMs: 2200, exposureMs: 120 }],
  [26, 'yard-salvo', 'battle', 'T-14 Armatas fire a rippling salvo under flare light', 'ironworks-night-yard',
    { speed: 0, effects: [flare(H(0, 30), 0, { heightM: 70, burnS: 40, intensity: 1.6, driftMps: 0.6 }), fireField(H(-7, 10), 0, { radiusM: 3 }), fireField(H(21, 8), 0, { radiusM: 3 }), fire('hero', 1100), fire('ally1', 1900), fire('ally2', 2700), fire('ally3', 3500), embers(H(-7, 10), 0)],
      cam: hold({ side: 9.2, along: 14.4, lift: 1.2, fov: 40, lookHero: [-9, 0, 1.8] }, { side: 8.2, along: 12.6, lift: 1.3, fov: 38, lookHero: [-9, 0, 1.8] }) },
    { tMs: 2780, exposureMs: 140 }],
  [27, 'furnace-advance', 'battle', 'T-14 Armatas advance between burning furnaces', 'ironworks-night-yard',
    // the line's right-hand tank stood where a right-side camera sits: shoot from between the hero and its left wing
    { speed: 2.4, effects: [flare(H(0, 30), 0, { heightM: 70, burnS: 40, intensity: 1.6, driftMps: 0.6 }), fireField(H(-9, 9), 0, { radiusM: 3 }), embers(H(-9, 9), 0), fireField(H(-8, 22), 0, { radiusM: 3 }), fire('ally1', 3400)],
      cam: RIG.follow({ side: [-6.5, -6], along: [9, 6.5], lift: 1.4, fov: 38, look: [0, 1, 1.6] }) },
    { tMs: 3480, exposureMs: 60 }],
  [28, 'street-kill', 'battle', 'A telephoto view of a kill at the end of the street', 'steinburg-night-street',
    { speed: 0, effects: [NIGHT_FLARE([40, 10]), burn('foe0', 0), smoke('foe0', 0), fire('hero', 1500), pen('foe1', 1850), kill('foe1', 1970), debris('foe1', 1990)],
      cam: hold({ side: 0.8, along: 200, lift: 2.2, fov: 10, lookHero: [0, 120, 2] }, { side: 0.8, along: 194, lift: 2.5, fov: 10, lookHero: [0, 120, 2] }) },
    { tMs: 2150, exposureMs: 33 }],
  [29, 'street-fire', 'battle', 'A Leopard 2A7V fires down the night street', 'steinburg-night-street',
    { speed: 0, effects: [NIGHT_FLARE([40, 10]), burn('foe0', 0), smoke('foe0', 0), fire('hero', 1700), mg('ally1', 900, 9), mg('ally1', 3600, 9), fire('ally1', 4600)],
      cam: hold({ side: 2.5, along: 12.5, lift: 1.1, fov: 40 }, { side: 2.2, along: 11, lift: 1.15, fov: 38 }) },
    { tMs: 1790, exposureMs: 25 }],
  [30, 'flare-rise', 'battle', 'An illumination flare climbs over the street fight', 'steinburg-night-street',
    { speed: 1.4, effects: [flare([36, 30], 800, { heightM: 55, launch: true, intensity: 1.5 }), burn('foe0', 0), smoke('foe0', 0), mg('ally1', 3000, 9), fire('hero', 4700)],
      cam: hold({ side: -3, along: -10.5, lift: 0.9, fov: 46, lookHero: [0, 60, 26] }, { side: -3, along: -7, lift: 1.1, fov: 44, lookHero: [0, 40, 3] }) },
    { tMs: 3000, exposureMs: 200 }],
  [31, 'noon-kill', 'battle', 'A Leclerc XLR fires at high noon in the wadi village', 'sirocco-noon-village',
    { speed: 1.2, effects: [burn('foe0', 0), smoke('foe0', 0), fire('hero', 2300), dust('hero', 2200, 12, 1), fire('ally1', 4300), mg('ally2', 3500, 9)],
      cam: hold({ side: 9.4, along: 13.6, lift: 1.3, fov: 40 }, { side: 8.2, along: 11.6, lift: 1.4, fov: 38 }) },
    { tMs: 2380, exposureMs: 16 }],
  [32, 'slow-kill', 'battle', 'Slow motion: an ammunition rack goes up in the canyon', 'redrock-golden-kill',
    { speed: 0, effects: [fire('hero', 900), pen('foe0', 980), kill('foe0', 1030), debris('foe0', 1050)],
      film: { fps: 30, shutterDeg: 180, samples: 12, maxSamples: 64, speed: [{ tMs: 0, speed: 1 }, { tMs: 940, speed: 1 }, { tMs: 1020, speed: 0.25, ease: 'smooth' }, { tMs: 2420, speed: 0.25 }] },
      durMs: 2420, // timeline ms; the 0.25x ramp stretches it to a ~6.7 s film
      cam: hold({ side: -2.2, along: -9, lift: 3.4, fov: 22, lookHero: [3, 72, 1.6] }, { side: -1.9, along: -7.2, lift: 3.3, fov: 20, lookHero: [3, 72, 2.4] }) },
    { tMs: 1160, exposureMs: 25 }],
  [33, 'shelf-firefight', 'battle', 'A firefight on the copper mine shelf', 'copper-golden-mine',
    { speed: 0, effects: [burn('foe0', 0), fire('hero', 1300), fire('foe1', 2700), fire('ally1', 3600), fire('hero', 4900)],
      cam: hold({ side: 4.6, along: 9.6, lift: 0.45, fov: 38 }, { side: 4.0, along: 8.4, lift: 0.5, fov: 36 }) },
    { tMs: 1380, exposureMs: 16 }],
  [34, 'ford-duel', 'battle', 'K2 and Type 10 tanks trade fire across the ford', 'amberford-golden-ford',
    // static: the Type 10's wingman slot runs into the ford's stone wall when the pair drives
    { speed: 0, effects: [burn('foe0', 0), fire('foe1', 1000), fire('hero', 2500), fire('ally1', 4300)],
      cam: hold({ side: 4.6, along: 9.6, lift: 0.5, fov: 38 }, { side: 4.1, along: 8.6, lift: 0.52, fov: 36 }) },
    { tMs: 2590, exposureMs: 20 }],
  [35, 'crossroads-fire', 'battle', 'Fire at the Steinburg crossroads at noon', 'steinburg-day-crossroads',
    { speed: 0, effects: [burn('foe0', 0), fire('hero', 1600), fire('ally1', 3900)],
      cam: hold({ side: -14.5, along: 16.5, lift: 7.2, fov: 40 }, { side: -13, along: 14.6, lift: 6.6, fov: 38 }) },
    { tMs: 1680, exposureMs: 16 }],
  [36, 'towers-fire', 'battle', 'A KF51 fires beneath the towers', 'blackglass-day-towers',
    { speed: 1.6, effects: [burn('foe0', 0), fire('hero', 2900), fire('ally1', 4700)],
      cam: hold({ side: 6.2, along: 12.5, lift: 1.0, fov: 46, lookHero: [-1, 8, 1.6] }, { side: 5.6, along: 10.6, lift: 1.0, fov: 44, lookHero: [-1, 8, 1.6] }) },
    { tMs: 2990, exposureMs: 16 }],
  [37, 'smoke-wall', 'battle', 'Smoke screens bloom behind the column on the runway', 'kestrel-dawn-runway',
    { speed: 6, pinMs: 3300, formation: [[0, 0], [1.5, -22], [-1, -44]], count: 3, effects: [smokeScreen('ally1', 900, { durationS: 20 }), smokeScreen('ally2', 1300, { durationS: 20 })],
      cam: RIG.pan({ side: 60, along: 0, lift: 1.6, fov: 14, look: [0, -6, 1.6] }) },
    { tMs: 3800, exposureMs: 25 }],
  [38, 'lighthouse-fire', 'battle', 'An M1A2 SEPv3 fires past the lighthouse at sunset', 'saltmere-sunset-lighthouse',
    { speed: 3, pinMs: 3000, effects: [fire('hero', 3200), dust('hero', 3150, 10, 0.9)], cam: RIG.passby({ side: 10.5, along: 0, lift: 0.7, fov: 42, look: [0, 0, 1.7] }) },
    { tMs: 3290, exposureMs: 25 }],
  [39, 'village-fire', 'battle', 'A Leopard fires through the snow at night', 'frosthollow-night-village',
    { speed: 2.2, count: 2, effects: [flare([-80, -40], 0, { heightM: 105, burnS: 40, driftMps: 1.2 }), burn('foe0', 0), embers('foe0', 0), fire('hero', 3100), dust('hero', 3050, 10, 0.9)],
      cam: hold({ side: 9, along: 13, lift: 1.4, fov: 40 }, { side: 7.8, along: 10.6, lift: 1.5, fov: 38 }) },
    { tMs: 3180, exposureMs: 40 }],
  [40, 'caldera-fight', 'battle', 'T-90M and T-14 tanks fire across Obsidian Caldera at golden hour', NEW.calderaFight,
    // golden, not dusk: the caldera's black rock swallowed the fight at dusk; low sun behind the ridge reads
    { time: 'golden', speed: 0, effects: [burn('foe0', 0), smoke('foe0', 0), embers('foe0', 0), fire('hero', 1500), fire('foe1', 2600), fire('ally1', 3800), mg('ally1', 4600, 9)],
      cam: hold({ side: -15, along: 2, lift: 2.2, fov: 32, lookHero: [0, 4, 1.6] }, { side: -13.5, along: 1.4, lift: 2.1, fov: 30, lookHero: [0, 4, 1.6] }) },
    { tMs: 1580, exposureMs: 25 }],

  // ---------------------------------------------------------------- scenes
  [41, 'lake-shore', 'scene', 'Glacier Pass at dawn: the column on the frozen lake', 'glacier-dawn-lake',
    { speed: 4.2, pinMs: 3300, effects: [exhaust('hero', 100), exhaust('ally1', 200)], cam: RIG.pan({ side: 64, along: 0, lift: 2.4, fov: 16, look: [0, -12, 1.6] }) },
    { tMs: 3300, exposureMs: 33 }],
  [42, 'lake-crane', 'scene', 'Craning up over the frozen lake', 'glacier-dawn-lake',
    { speed: 4, effects: [], cam: RIG.crane({ side: -5, along: [-21, -28], lift: [1.4, 13], fov: 44, look: [0, 36, 1] }) },
    { tMs: 4600, exposureMs: 25 }],
  [43, 'gorge-wide', 'scene', 'Aegis Crossing seen from the gorge', 'aegis-morning-viaduct',
    { speed: 3, pinMs: 3300, sun: 'front', effects: [], cam: RIG.pan({ side: -104, along: 6, lift: 44, fov: 28, look: [0, -16, 39.5] }) },
    { tMs: 3300, exposureMs: 25 }],
  [44, 'mars-drone', 'scene', 'High over the Martian convoy', 'olympus-mars-convoy',
    { speed: 4.6, effects: [dust('hero', 800, 12, 1), dust('ally1', 820, 10, 0.9)], cam: RIG.drone({ side: 8, along: [-30, -12], lift: [24, 19], fov: 46, look: [0, 34, 0] }) },
    { tMs: 3300, exposureMs: 25 }],
  [45, 'earthrise-wide', 'scene', 'Earthrise Basin: the Earth over the lunar plain', 'earthrise-moon',
    { speed: 2, effects: [], cam: hold({ side: 16, along: -14, lift: 1.4, fov: 50, lookHero: [-2, 50, 11] }, { side: 14, along: -11, lift: 1.5, fov: 48, lookHero: [-2, 50, 11] }) },
    { tMs: 3300, exposureMs: 20 }],
  [46, 'canyon-rim', 'scene', 'Redrock Divide: a Leclerc wedge from the canyon rim', 'redrock-golden-canyon',
    { speed: 3, effects: ['hero', 'ally1', 'ally2', 'ally3', 'ally4'].map((a, i) => dust(a, 700 + i * 40, 14, 1.1)), cam: RIG.crane({ side: 30, along: [6, -2], lift: [9, 16], fov: 34, look: [0, -10, 1.5] }) },
    { tMs: 3300, exposureMs: 25 }],
  [47, 'steppe-ridge', 'scene', 'Tarkhan Steppe: a wedge crests the grass ridge at golden hour', NEW.steppeRidge,
    // slower: the wedge's wings reach the ridge-top obstacles after 5 s at 3.2 m/s
    { speed: 2.5, effects: ['hero', 'ally1', 'ally2', 'ally3', 'ally4'].map((a, i) => dust(a, 700 + i * 40, 12, 1)), cam: RIG.crane({ side: -26, along: [26, 18], lift: [4, 13], fov: 40, look: [0, -8, 1.5] }) },
    { tMs: 3300, exposureMs: 25 }],
  [48, 'delta-village', 'scene', 'The river village in the Jade River Delta, mountains beyond', NEW.deltaVillage,
    { speed: 2.6, pinMs: 3300, effects: [], cam: RIG.pan({ side: -40, along: 0, lift: 3, fov: 24, look: [0, -6, 1.6] }) },
    { tMs: 3300, exposureMs: 33 }],
  [49, 'polders-mill', 'scene', 'Tidegate Polders: a column on the dike road past the windmill', NEW.poldersMill,
    // close pass: from 45 m out the windmill side of the dike is a tree grove
    { speed: 3, pinMs: 3300, effects: [dust('hero', 800, 8, 0.6)], cam: RIG.passby({ side: -16, along: 0, lift: 1.6, fov: 36, look: [0, 0, 1.8] }) },
    { tMs: 3300, exposureMs: 33 }],
  [50, 'reservoir-shore', 'scene', 'Highland Reservoir at sunset: tanks on the glittering shore', NEW.reservoirShore,
    // slow and solo: at 2.4 m/s the hero reaches the waterline after 4.5 s
    { speed: 1.3, count: 1, sun: 'back', effects: [dust('hero', 800, 8, 0.6)], cam: RIG.crane({ side: -10, along: [14, 11], lift: [1.5, 7], fov: 40, look: [0, 0, 1.5] }) },
    { tMs: 3300, exposureMs: 33 }],
];

/** Builds one site shot's scene JSON (storyboard + still moment + meta). */
export function siteScene([n, id, kind, title, setRef, film, still]) {
  const set = typeof setRef === 'string' ? setById(setRef) : setRef;
  const time = film.time ?? set.time;
  const base = { ...set, time: T(time), picture: pictureFor({ ...set, time }, { ...FILM_LENS, anamorphic: 0.5, ...(film.picture ?? {}) }), light: set.light,
    ...(film.formation ? { formation: film.formation } : {}), ...(film.count ? { count: film.count } : {}),
    ...(film.lineup ? { lineup: film.lineup } : {}), ...('enemies' in film ? { enemies: film.enemies } : {}),
    ...(film.anchor ? { anchor: film.anchor } : {}), ...(film.heading != null ? { heading: film.heading } : {}) };
  const scene = buildShot(base, { durMs: DUR, ...film, still });
  if (set.autoPlace === false) scene.autoPlace = false;
  if (set.allowWater) for (const a of scene.actors) a.allowWater = true;
  const az = LIGHT_READY ? sunFor(scene, film.sun ?? set.sun, time) : null;
  if (az != null) scene.light = { ...(scene.light ?? {}), sunAzimuthDeg: az };
  const hero = scene.actors[0]?.id;
  scene.meta = { n, id: `s${String(n).padStart(2, '0')}-${id}`, kind, title, set: set.id, map: set.map, time, hero, heroName: CAST_NAMES[hero]?.[0] ?? hero,
    loopMs: LOOP_MS, xfadeMs: XFADE_MS, still };
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
