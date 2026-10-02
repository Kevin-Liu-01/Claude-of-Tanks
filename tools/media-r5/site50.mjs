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

// [n, id, kind, title, set (id or own staging), film (buildShot fields; durMs defaults to DUR), still { tMs, exposureMs }]
export const SHOTS = [
  // ---------------------------------------------------------------- tanks
  [1, 'lake-glide', 'tank', 'A KF51 Panther glides across the frozen lake at dawn', 'glacier-dawn-lake',
    { speed: 4.6, effects: [exhaust('hero', 100), exhaust('ally1', 200), dust('hero', 1200, 8, 0.6)], cam: RIG.follow({ side: [9.5, 8], along: [2.2, -0.8], lift: 0.62, fov: 30, look: [0, 0.3, 1.5] }) },
    { tMs: 3300, exposureMs: 33 }],
  [2, 'runway-lead', 'tank', 'An M1A2 SEPv3 leads the wedge down the runway at dawn', 'kestrel-dawn-runway',
    { speed: 6.4, effects: [smokeScreen('ally3', 700, { durationS: 20 }), smokeScreen('ally4', 1000, { durationS: 20 }), dust('hero', 900, 10, 0.8)], cam: RIG.lead({ side: 1.1, along: [31, 22], lift: 0.7, fov: 27, look: [0, -4, 1.6] }) },
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
    { speed: 4.6, effects: [dust('hero', 800, 12, 1), dust('ally1', 900, 10, 0.9)], cam: RIG.lead({ side: 2.2, along: [26, 18], lift: 0.75, fov: 34, look: [0, -4, 2.2] }) },
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
    { speed: 3.4, effects: [dust('hero', 800, 8, 0.6)], cam: RIG.follow({ side: [12, 10.5], along: [2.6, -0.6], lift: 3.2, fov: 32, look: [0, 0, 1.4] }) },
    { tMs: 3300, exposureMs: 33 }],
  [11, 'tower-roll', 'tank', 'A KF51 Panther rolls beneath the arcology towers', 'blackglass-day-towers',
    { speed: 2.9, effects: [burn('foe0', 0)], cam: RIG.follow({ side: [7, 6.2], along: [7.5, 4], lift: 0.6, fov: 54, look: [-1, 3, 3.2] }) },
    { tMs: 3300, exposureMs: 33 }],
  [12, 'yard-line', 'tank', 'A Leopard and KF51 line crosses the rail yard at dusk', 'cinder-dusk-tracks',
    { speed: 3.4, effects: [dust('hero', 900, 10, 0.8)], cam: RIG.follow({ side: [9.5, 8.2], along: [3.2, 0.6], lift: 0.8, fov: 34 }) },
    { tMs: 3300, exposureMs: 33 }],
  [13, 'street-advance', 'tank', 'A Leopard 2A7V advances up the street under flare light', 'steinburg-night-street',
    { speed: 2.7, effects: [NIGHT_FLARE([40, 10]), burn('foe0', 0), smoke('foe0', 0), embers('foe0', 0), mg('ally1', 2400, 9)], cam: RIG.follow({ side: [-4.9, -4.6], along: [6.8, 4.6], lift: 1.3, fov: 48, look: [0, 0, 1.6] }) },
    { tMs: 3300, exposureMs: 40 }],
  [14, 'village-night', 'tank', 'A Leopard 2A7V through Frosthollow at night', 'frosthollow-night-village',
    { speed: 2.3, effects: [flare([-80, -40], 0, { heightM: 105, burnS: 40, driftMps: 1.2 }), burn('foe0', 0), embers('foe0', 0)], cam: RIG.chase({ side: -3.4, along: [-17, -13.5], lift: 2.2, fov: 42, look: [0, 30, 2] }) },
    { tMs: 3300, exposureMs: 40 }],
  [15, 'avenue-armata', 'tank', 'A T-14 Armata column moves down the ruined avenue at dusk', 'ruinspires-dusk-avenue',
    { speed: 2.4, effects: [burn('foe0', 0), smoke('foe0', 0)], cam: RIG.chase({ side: 0.5, along: [-15.5, -11.5], lift: 2.4, fov: 42, look: [0, 40, 3] }) },
    { tMs: 3300, exposureMs: 33 }],
  [16, 'mine-shelf', 'tank', 'M1A2 SEPv3 and K2 tanks on the ore shelf at golden hour', 'copper-golden-mine',
    { speed: 1.8, effects: [burn('foe0', 0), dust('hero', 900, 10, 0.8)], cam: RIG.orbit({ radius: 13, from: 32, to: 70, lift: 1.2, fov: 36 }) },
    { tMs: 3300, exposureMs: 25 }],
  [17, 'ford-push', 'tank', 'A K2 Black Panther at the Amberford crossing', 'amberford-golden-ford',
    { speed: 1.4, effects: [burn('foe0', 0), dust('hero', 1000, 8, 0.7)], cam: hold({ side: 12.5, along: 14.5, lift: 1.2, fov: 38, lookHero: [0, 2, 1.8] }, { side: 11, along: 12, lift: 1.1, fov: 36, lookHero: [0, 2, 1.8] }) },
    { tMs: 3300, exposureMs: 25 }],

  // ---------------------------------------------------------------- battles
  [18, 'fields-assault', 'battle', 'A T-90M wedge assaults through the fields under fire', 'verdant-day-assault',
    { speed: 2.4, effects: [burn('foe0', 0), burn('foe1', 0), smoke('foe1', 0), fire('ally1', 1100), huge([-6, 52], 2100), fire('hero', 3600), boom([-20, 40], 4600, 'large')],
      cam: RIG.follow({ side: [3.3, 2.8], along: [-10, -7.5], lift: 3.2, fov: 44, look: [-4, 60, 2] }) },
    { tMs: 3720, exposureMs: 25 }],
  [19, 'fields-fire', 'battle', 'A T-90M fires across the burning fields', 'verdant-day-assault',
    { speed: 0, effects: [burn('foe0', 0), burn('foe1', 0), smoke('foe1', 0), fire('hero', 1500), huge([-6, 52], 2600), fire('ally1', 4200), mg('ally2', 3200, 9)],
      cam: hold({ side: 4.6, along: 9.8, lift: 0.45, fov: 38 }, { side: 4.1, along: 8.8, lift: 0.48, fov: 36 }) },
    { tMs: 1580, exposureMs: 16 }],
  [20, 'yard-barrage', 'battle', 'An artillery barrage walks across the foundry yard at night', 'ironworks-night-yard',
    { speed: 0, effects: [flare([40, -110], 0, { heightM: 90, burnS: 40, intensity: 1.4, driftMps: 1.0 }), barrage([40, -122], 900, 7, 16), barrage([30, -112], 3300, 6, 14), fire('hero', 2500), fire('ally1', 4300)],
      cam: hold({ side: -20, along: -30, lift: 4, fov: 40, lookHero: [0, 40, 6] }, { side: -17, along: -24.5, lift: 4.8, fov: 40, lookHero: [0, 40, 6] }) },
    { tMs: 2200, exposureMs: 120 }],
  [21, 'yard-salvo', 'battle', 'T-14 Armatas fire a rippling salvo under flare light', 'ironworks-night-yard',
    { speed: 0, effects: [flare(H(0, 30), 0, { heightM: 70, burnS: 40, intensity: 1.6, driftMps: 0.6 }), fireField(H(-7, 10), 0, { radiusM: 3 }), fireField(H(21, 8), 0, { radiusM: 3 }), fire('hero', 1100), fire('ally1', 1900), fire('ally2', 2700), fire('ally3', 3500), embers(H(-7, 10), 0)],
      cam: hold({ side: 9.2, along: 14.4, lift: 1.2, fov: 40, lookHero: [-9, 0, 1.8] }, { side: 8.2, along: 12.6, lift: 1.3, fov: 38, lookHero: [-9, 0, 1.8] }) },
    { tMs: 2780, exposureMs: 140 }],
  [22, 'furnace-advance', 'battle', 'T-14 Armatas advance between burning furnaces', 'ironworks-night-yard',
    { speed: 2.4, effects: [flare(H(0, 30), 0, { heightM: 70, burnS: 40, intensity: 1.6, driftMps: 0.6 }), fireField(H(-9, 9), 0, { radiusM: 3 }), embers(H(-9, 9), 0), fireField(H(-8, 22), 0, { radiusM: 3 }), fire('ally1', 3400)],
      cam: RIG.follow({ side: [12.5, 11], along: [3.4, 1], lift: 1.4, fov: 34, look: [0, 1, 1.6] }) },
    { tMs: 3480, exposureMs: 60 }],
  [23, 'street-kill', 'battle', 'A telephoto view of a kill at the end of the street', 'steinburg-night-street',
    { speed: 0, effects: [NIGHT_FLARE([40, 10]), burn('foe0', 0), smoke('foe0', 0), fire('hero', 1500), pen('foe1', 1850), kill('foe1', 1970), debris('foe1', 1990)],
      cam: hold({ side: 0.8, along: 200, lift: 2.2, fov: 10, lookHero: [0, 120, 2] }, { side: 0.8, along: 194, lift: 2.5, fov: 10, lookHero: [0, 120, 2] }) },
    { tMs: 2150, exposureMs: 33 }],
  [24, 'street-fire', 'battle', 'A Leopard 2A7V fires down the night street', 'steinburg-night-street',
    { speed: 0, effects: [NIGHT_FLARE([40, 10]), burn('foe0', 0), smoke('foe0', 0), fire('hero', 1700), mg('ally1', 900, 9), mg('ally1', 3600, 9), fire('ally1', 4600)],
      cam: hold({ side: 2.5, along: 15.5, lift: 0.5, fov: 40 }, { side: 2.2, along: 13.6, lift: 0.55, fov: 38 }) },
    { tMs: 1790, exposureMs: 25 }],
  [25, 'flare-rise', 'battle', 'An illumination flare climbs over the street fight', 'steinburg-night-street',
    { speed: 1.4, effects: [flare([36, 30], 800, { heightM: 55, launch: true, intensity: 1.5 }), burn('foe0', 0), smoke('foe0', 0), mg('ally1', 3000, 9), fire('hero', 4700)],
      cam: hold({ side: -3, along: -10.5, lift: 0.9, fov: 46, lookHero: [0, 60, 26] }, { side: -3, along: -7, lift: 1.1, fov: 44, lookHero: [0, 40, 3] }) },
    { tMs: 3000, exposureMs: 200 }],
  [26, 'noon-kill', 'battle', 'A Leclerc XLR fires at high noon in the wadi village', 'sirocco-noon-village',
    { speed: 1.2, effects: [burn('foe0', 0), smoke('foe0', 0), fire('hero', 2300), dust('hero', 2200, 12, 1), fire('ally1', 4300), mg('ally2', 3500, 9)],
      cam: hold({ side: 9.4, along: 13.6, lift: 1.3, fov: 40 }, { side: 8.2, along: 11.6, lift: 1.4, fov: 38 }) },
    { tMs: 2380, exposureMs: 16 }],
  [27, 'slow-kill', 'battle', 'Slow motion: an ammunition rack goes up in the canyon', 'redrock-golden-kill',
    { speed: 0, effects: [fire('hero', 900), pen('foe0', 980), kill('foe0', 1030), debris('foe0', 1050)],
      film: { fps: 30, shutterDeg: 180, samples: 12, maxSamples: 64, speed: [{ tMs: 0, speed: 1 }, { tMs: 940, speed: 1 }, { tMs: 1020, speed: 0.25, ease: 'smooth' }, { tMs: 2420, speed: 0.25 }] },
      durMs: 2420, // timeline ms; the 0.25x ramp stretches it to a ~6.7 s film
      cam: hold({ side: -2.2, along: -9, lift: 3.4, fov: 22, lookHero: [3, 72, 1.6] }, { side: -1.9, along: -7.2, lift: 3.3, fov: 20, lookHero: [3, 72, 2.4] }) },
    { tMs: 1160, exposureMs: 25 }],
  [28, 'shelf-firefight', 'battle', 'A firefight on the copper mine shelf', 'copper-golden-mine',
    { speed: 0, effects: [burn('foe0', 0), fire('hero', 1300), fire('foe1', 2700), fire('ally1', 3600), fire('hero', 4900)],
      cam: hold({ side: 4.6, along: 9.6, lift: 0.45, fov: 38 }, { side: 4.0, along: 8.4, lift: 0.5, fov: 36 }) },
    { tMs: 1380, exposureMs: 16 }],
  [29, 'ford-duel', 'battle', 'K2 and Type 10 duel across the ford', 'amberford-golden-ford',
    { speed: 1.6, effects: [burn('foe0', 0), fire('foe1', 1000), fire('hero', 2500), fire('ally1', 4300)],
      cam: RIG.follow({ side: [12.5, 11], along: [14.5, 11.5], lift: 1.1, fov: 38, look: [0, 2, 1.8] }) },
    { tMs: 2590, exposureMs: 20 }],
  [30, 'crossroads-fire', 'battle', 'Fire at the Steinburg crossroads at noon', 'steinburg-day-crossroads',
    { speed: 0, effects: [burn('foe0', 0), fire('hero', 1600), fire('ally1', 3900)],
      cam: hold({ side: -14.5, along: 16.5, lift: 7.2, fov: 40 }, { side: -13, along: 14.6, lift: 6.6, fov: 38 }) },
    { tMs: 1680, exposureMs: 16 }],
  [31, 'towers-fire', 'battle', 'A KF51 fires beneath the towers', 'blackglass-day-towers',
    { speed: 1.6, effects: [burn('foe0', 0), fire('hero', 2900), fire('ally1', 4700)],
      cam: hold({ side: 6.2, along: 12.5, lift: 0.6, fov: 50, lookHero: [-4, 20, 8] }, { side: 5.6, along: 10.6, lift: 0.62, fov: 48, lookHero: [-4, 20, 8] }) },
    { tMs: 2990, exposureMs: 16 }],
  [32, 'smoke-wall', 'battle', 'Smoke screens bloom behind the column on the runway', 'kestrel-dawn-runway',
    { speed: 6, pinMs: 3300, formation: [[0, 0], [1.5, -22], [-1, -44]], count: 3, effects: [smokeScreen('ally1', 900, { durationS: 20 }), smokeScreen('ally2', 1300, { durationS: 20 })],
      cam: RIG.pan({ side: 84, along: 0, lift: 1.6, fov: 12, look: [0, -6, 1.6] }) },
    { tMs: 3800, exposureMs: 25 }],
  [33, 'lighthouse-fire', 'battle', 'An M1A2 SEPv3 fires past the lighthouse at sunset', 'saltmere-sunset-lighthouse',
    { speed: 3, pinMs: 3000, effects: [fire('hero', 3200), dust('hero', 3150, 10, 0.9)], cam: RIG.passby({ side: 10.5, along: 0, lift: 0.7, fov: 42, look: [0, 0, 1.7] }) },
    { tMs: 3290, exposureMs: 25 }],
  [34, 'village-fire', 'battle', 'A Leopard fires through the snow at night', 'frosthollow-night-village',
    { speed: 2.2, effects: [flare([-80, -40], 0, { heightM: 105, burnS: 40, driftMps: 1.2 }), burn('foe0', 0), embers('foe0', 0), fire('hero', 3100), dust('hero', 3050, 10, 0.9)],
      cam: hold({ side: 9, along: 13, lift: 1.4, fov: 40 }, { side: 7.8, along: 10.6, lift: 1.5, fov: 38 }) },
    { tMs: 3180, exposureMs: 40 }],

  // ---------------------------------------------------------------- scenes
  [35, 'lake-shore', 'scene', 'Glacier Pass at dawn: the column on the frozen lake', 'glacier-dawn-lake',
    { speed: 4.2, pinMs: 3300, effects: [exhaust('hero', 100), exhaust('ally1', 200)], cam: RIG.pan({ side: 64, along: 0, lift: 2.4, fov: 16, look: [0, -12, 1.6] }) },
    { tMs: 3300, exposureMs: 33 }],
  [36, 'lake-crane', 'scene', 'Craning up over the frozen lake', 'glacier-dawn-lake',
    { speed: 4, effects: [], cam: RIG.crane({ side: -5, along: [-21, -28], lift: [1.4, 13], fov: 44, look: [0, 36, 1] }) },
    { tMs: 4600, exposureMs: 25 }],
  [37, 'gorge-wide', 'scene', 'Aegis Crossing seen from the gorge', 'aegis-morning-viaduct',
    { speed: 3, pinMs: 3300, sun: 'front', effects: [], cam: RIG.pan({ side: -104, along: 6, lift: 44, fov: 28, look: [0, -16, 39.5] }) },
    { tMs: 3300, exposureMs: 25 }],
  [38, 'runway-drone', 'scene', 'Kestrel Airfield at dawn from the air', 'kestrel-dawn-runway',
    { speed: 6, effects: [dust('hero', 800, 10, 0.8), dust('ally1', 820, 10, 0.8), dust('ally2', 840, 10, 0.8)], cam: RIG.drone({ side: 6, along: [-30, -12], lift: [30, 24], fov: 46, look: [0, 30, 0] }) },
    { tMs: 3300, exposureMs: 25 }],
  [39, 'strand-drone', 'scene', 'Over the strand at sunset', 'saltmere-sunset-strand',
    { speed: 4.6, effects: [], cam: RIG.drone({ side: -10, along: [-18, -6], lift: [16, 13], fov: 46, look: [3, 16, 0] }) },
    { tMs: 3300, exposureMs: 25 }],
  [40, 'mars-drone', 'scene', 'High over the Martian convoy', 'olympus-mars-convoy',
    { speed: 4.6, effects: [dust('hero', 800, 12, 1), dust('ally1', 820, 10, 0.9)], cam: RIG.drone({ side: 8, along: [-30, -12], lift: [24, 19], fov: 46, look: [0, 34, 0] }) },
    { tMs: 3300, exposureMs: 25 }],
  [41, 'earthrise-wide', 'scene', 'Earthrise Basin: the Earth over the lunar plain', 'earthrise-moon',
    { speed: 2, effects: [], cam: hold({ side: 8.5, along: 15, lift: 0.6, fov: 44, lookHero: [0, 0, 4] }, { side: 7, along: 12.5, lift: 0.65, fov: 42, lookHero: [0, 0, 4.6] }) },
    { tMs: 3300, exposureMs: 20 }],
  [42, 'canyon-rim', 'scene', 'Redrock Divide: a Leclerc wedge from the canyon rim', 'redrock-golden-canyon',
    { speed: 3, effects: ['hero', 'ally1', 'ally2', 'ally3', 'ally4'].map((a, i) => dust(a, 700 + i * 40, 14, 1.1)), cam: RIG.crane({ side: 30, along: [6, -2], lift: [9, 16], fov: 34, look: [0, -10, 1.5] }) },
    { tMs: 3300, exposureMs: 25 }],
  [43, 'fjord-sea', 'scene', 'Nordhavn Fjord at blue hour from the water', 'nordhavn-dusk-fjord',
    { speed: 3.4, effects: [], cam: hold({ side: -20, along: 11, lift: 2, fov: 38, lookHero: [0, -12, 2] }, { side: -18, along: 7, lift: 2.2, fov: 36, lookHero: [0, -10, 2] }) },
    { tMs: 3300, exposureMs: 33 }],
  [44, 'foundry-night', 'scene', 'Ironworks at night: stacks, flares and fire', 'ironworks-night-yard',
    { speed: 1.2, effects: [flare([40, -60], 0, { heightM: 110, burnS: 40, intensity: 1.3, driftMps: 1.2 }), fireField([60, -110], 0), embers([60, -110], 0), fire('ally2', 3000)],
      cam: hold({ side: -21, along: -31, lift: 4.2, fov: 40, lookHero: [0, 40, 6] }, { side: -19, along: -27, lift: 5, fov: 38, lookHero: [0, 40, 6] }) },
    { tMs: 3300, exposureMs: 120 }],
  [45, 'harbor-sea', 'scene', 'Saltwind Narrows: the harbor road from the sea', 'saltwind-day-harbor',
    { speed: 3.2, effects: [], cam: hold({ side: 24, along: 11, lift: 2, fov: 38, lookHero: [0, -10, 2] }, { side: 22.5, along: 7, lift: 2.1, fov: 36, lookHero: [0, -10, 2] }) },
    { tMs: 3300, exposureMs: 33 }],
];

/** Builds one site shot's scene JSON (storyboard + still moment + meta). */
export function siteScene([n, id, kind, title, setRef, film, still]) {
  const set = typeof setRef === 'string' ? setById(setRef) : setRef;
  const time = film.time ?? set.time;
  const base = { ...set, time: T(time), picture: pictureFor({ ...set, time }, { ...FILM_LENS, anamorphic: 0.5, ...(film.picture ?? {}) }), light: set.light,
    ...(film.formation ? { formation: film.formation, count: film.count } : {}), ...(film.lineup ? { lineup: film.lineup } : {}), ...('enemies' in film ? { enemies: film.enemies } : {}),
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
void [CAST, kill];
