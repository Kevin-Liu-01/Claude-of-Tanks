// Media r5 sets (round 3): the newest main battle tanks staged across the maps at
// every time of day. Each set yields key-art stills (camera variants) and film shots
// whose tanks cruise at constant speed while follow / pan / lead / chase / orbit /
// crane / drone rigs stay locked on them (setups.mjs buildShot).
import { fire, kill, pen, burn, smoke, boom, dust, mg, barrage, sparks, exhaust, flare, smokeScreen, embers, debris, shockwave, fireField, huge, H } from './setups.mjs';
import { CAST } from './cast.mjs';

export const LIGHT_READY = process.env.MEDIA_R5_LIGHT === '1';
const FALLBACK = { dawn: 'sunset', morning: 'day', golden: 'sunset', dusk: 'sunset' };
export const T = t => (LIGHT_READY || !FALLBACK[t] ? t : FALLBACK[t]);

const C = { // reusable still cameras (hero frame)
  hero34: { name: 'hero34', side: 9, along: 13, lift: 1.4, fov: 40 },
  worm: { name: 'worm', side: 4.5, along: 9.5, lift: 0.45, fov: 38 },
  rear: { name: 'rear', side: -3.5, along: -24, lift: 2.6, fov: 42, lookHero: [0, 40, 2] },
  front: { name: 'front', side: 1.2, along: 17, lift: 1.1, fov: 34 },
};
// rig shorthands -> sparse camera keys (buildShot resamples them on the tanks' grid)
export const RIG = {
  follow: ({ side = 11, along = [1, -1], lift = 0.8, fov = 32, look = [0, 0.3, 1.4] } = {}) => [
    { tMs: 0, side: Array.isArray(side) ? side[0] : side, along: along[0], lift: Array.isArray(lift) ? lift[0] : lift, fov: Array.isArray(fov) ? fov[0] : fov, lookHero: look },
    { tMs: 'end', side: Array.isArray(side) ? side[1] : side, along: along[1], lift: Array.isArray(lift) ? lift[1] : lift, fov: Array.isArray(fov) ? fov[1] : fov, lookHero: look }],
  pan: ({ side = 60, along = 0, lift = 1.6, fov = 14, look = [0, 0, 1.5] } = {}) => [
    { tMs: 0, frame: 'world', lookFrame: 'hero', side, along, lift, fov, lookHero: look },
    { tMs: 'end', frame: 'world', lookFrame: 'hero', side, along, lift, fov, lookHero: look }],
  lead: ({ side = 1.2, along = [26, 18], lift = 0.7, fov = 28, look = [0, 0, 1.6] } = {}) => [
    { tMs: 0, side, along: along[0], lift, fov, lookHero: look }, { tMs: 'end', side, along: along[1], lift, fov, lookHero: look }],
  chase: ({ side = -2, along = [-15, -12], lift = 1.6, fov = 40, look = [0, 24, 1.6] } = {}) => [
    { tMs: 0, side, along: along[0], lift, fov, lookHero: look }, { tMs: 'end', side, along: along[1], lift, fov, lookHero: look }],
  orbit: ({ radius = 15, from = 35, to = 125, lift = 1.1, fov = 34, look = [0, 0, 1.5] } = {}) => [
    { tMs: 0, orbit: from, radius, lift, fov, lookHero: look }, { tMs: 'end', orbit: to, radius, lift, fov, lookHero: look }],
  crane: ({ side = -5, along = [-28, -40], lift = [1.5, 18], fov = 44, look = [0, -10, 0.5] } = {}) => [
    { tMs: 0, side, along: along[0], lift: lift[0], fov, lookHero: look }, { tMs: 'end', side, along: along[1], lift: lift[1], fov, lookHero: look }],
  drone: ({ side = 0, along = [-14, -6], lift = [28, 24], fov = 44, look = [0, 8, 0] } = {}) => [
    { tMs: 0, side, along: along[0], lift: lift[0], fov, lookHero: look }, { tMs: 'end', side, along: along[1], lift: lift[1], fov, lookHero: look }],
  passby: ({ side = 5, along = 0, lift = 0.6, fov = 44, look = [0, 0, 1.4] } = {}) => [
    { tMs: 0, frame: 'world', lookFrame: 'hero', side, along, lift, fov, lookHero: look },
    { tMs: 'end', frame: 'world', lookFrame: 'hero', side, along, lift, fov, lookHero: look }],
  hold: (c) => [{ tMs: 0, ...c }, { tMs: 'end', ...c }],
};
const W = (n, ...ids) => Array.from({ length: n }, (_, i) => ids[i % ids.length]);
const NIGHT_FLARE = (at, h = 100) => flare(at, 0, { heightM: h, burnS: 40, driftMps: 1.2 }); // FX lane night-firefight recipe

export const SETS = [
  { id: 'steinburg-night-street', map: 'urban', time: 'night', seed: 401, anchor: [20, -35], heading: 180, // 2.0 Steinburg: was [36, -70] at 0°, its start inside a block
    formation: [[0, 0], [-1.5, -18], [1.5, -36]], lineup: [CAST.leo, CAST.kf51, CAST.leo], camo: 'factory',
    enemies: { along: 120, lat: 0, count: 2, formation: 'column', spread: 0.6, lineup: [CAST.t90m, CAST.t72b3m], states: ['burning', 'intact'] },
    still: { fxTime: 2480, effects: [NIGHT_FLARE([40, 10]), burn('foe0', 0), smoke('foe0', 0), embers('foe0', 0), fire('hero', 2370), fire('foe1', 1300), mg('ally1', 2300, 9)],
      cameras: [{ name: 'street-low', side: -2.2, along: -9, lift: 1.1, fov: 40, lookHero: [0, 40, 2.2] }, { name: 'front-worm', side: 2, along: 16, lift: 0.5, fov: 40 }, { name: 'tele-street', side: 0.8, along: 220, lift: 2.2, fov: 8 }] },
    films: [
      { id: 't01-street-passby', durMs: 3200, speed: 4, pinMs: 0, effects: [NIGHT_FLARE([40, 10]), burn('foe0', 0), smoke('foe0', 0), embers('foe0', 0), mg('ally1', 700, 9), mg('ally1', 2200, 9), fire('foe1', 1500)],
        cam: RIG.passby({ side: -4.6, along: 6.5, lift: 0.9, fov: 44, look: [0, 1.5, 1.9] }) },
      { id: 't40-street-follow', durMs: 3000, speed: 6, effects: [NIGHT_FLARE([40, 10]), burn('foe0', 0), smoke('foe0', 0), mg('ally1', 1200, 9)],
        cam: RIG.follow({ side: [-4.8, -4.6], along: [6.5, 4.5], lift: 1.3, fov: 48, look: [0, 0, 1.6] }) },
      { id: 't02-street-fire', durMs: 2000, speed: 0, effects: [NIGHT_FLARE([40, 10]), burn('foe0', 0), smoke('foe0', 0), fire('hero', 1300), mg('ally1', 400, 9)],
        cam: [{ tMs: 0, side: 2.4, along: 15, lift: 0.5, fov: 40 }, { tMs: 2000, side: 2.3, along: 14, lift: 0.52, fov: 39 }] },
      { id: 't25-night-flare', durMs: 2500, speed: 2, effects: [flare([36, 30], 0, { heightM: 55, launch: true, intensity: 1.5 }), burn('foe0', 0), smoke('foe0', 0), mg('ally1', 1600, 9)],
        cam: [{ tMs: 0, side: -3, along: -10, lift: 0.9, fov: 46, lookHero: [0, 60, 30] }, { tMs: 2500, side: -3, along: -7, lift: 1.1, fov: 44, lookHero: [0, 40, 3] }] },
      { id: 't03-street-kill', durMs: 2500, speed: 0, effects: [NIGHT_FLARE([40, 10]), burn('foe0', 0), smoke('foe0', 0), fire('hero', 50), pen('foe1', 400), kill('foe1', 520), debris('foe1', 540)],
        cam: [{ tMs: 0, side: 0.8, along: 200, lift: 2.2, fov: 10, lookHero: [0, 120, 2] }, { tMs: 2500, side: 0.8, along: 196, lift: 2.4, fov: 10, lookHero: [0, 120, 2] }] },
    ] },
  { id: 'glacier-dawn-lake', map: 'alpine', time: 'dawn', seed: 402, anchor: [70, -44], heading: -90, formation: 'column',
    lineup: [CAST.kf51, CAST.leo, CAST.lynx, CAST.kf51, CAST.leo], camo: 'factory', turret: -8,
    still: { fxTime: 900, effects: [dust('hero', 300, 12, 1), dust('ally1', 320, 12, 1), dust('ally2', 340, 10, 0.9), exhaust('hero', 200), exhaust('ally1', 220)],
      cameras: [{ name: 'ice-worm', side: 7, along: 10, lift: 0.45, fov: 36, lookHero: [0, 0, 1.9] }, C.hero34, { name: 'rear-follow', side: -6, along: -86, lift: 5, fov: 42, lookHero: [0, 30, 1.4] }, { name: 'shore-wide', side: 60, along: -18, lift: 2.4, fov: 30, lookHero: [0, -24, 1.6] }] },
    films: [
      { id: 't04-lake-pan', durMs: 3500, speed: 8, pinMs: 1750, effects: [exhaust('hero', 100), exhaust('ally1', 200)],
        cam: RIG.pan({ side: 62, along: 0, lift: 2.2, fov: 11, look: [0, -10, 1.6] }) },
      { id: 't05-lake-track', durMs: 3100, speed: 10, effects: [exhaust('hero', 100)],
        cam: RIG.follow({ side: [12, 9.5], along: [0.8, -0.6], lift: 0.7, fov: 30, look: [0, 0.2, 1.4] }) },
      { id: 't06-lake-crane', durMs: 3400, speed: 8, effects: [],
        cam: RIG.crane({ side: -5, along: [-20, -26], lift: [1.4, 9], fov: 42, look: [0, 34, 1] }) },
    ] },
  { id: 'aegis-morning-viaduct', map: 'cliffbridge', time: 'morning', seed: 403, anchor: [0, -40], heading: 0,
    formation: [[0, 0], [2.5, -17], [-2.5, -34], [2, -51]], lineup: [CAST.ariete, CAST.leclerc, CAST.ariete, CAST.leclerc], camo: 'factory', autoPlace: false,
    still: { fxTime: 700, effects: [dust('hero', 300, 6, 0.6)],
      cameras: [{ name: 'gorge-wide', side: -110, along: 30, lift: 46, fov: 40, lookHero: [0, -10, 39] }, { name: 'flyover', side: 30, along: 60, lift: 70, fov: 50, lookHero: [0, -20, 38] }, { name: 'deck-front', side: 2.6, along: 22, lift: 39.4, fov: 38, lookHero: [0, 0, 39.6] }, { name: 'deck-worm', side: 3.2, along: 10, lift: 38.5, fov: 40, lookHero: [0, 0, 39.2] }] },
    films: [
      // deck top ~ y 2.5: absolute heights
      // the gorge-wide still's ground-relative heights (gorge floor ~ -36 m, deck top ~ +2.5 m), sun behind the lens
      { id: 't07-viaduct-pan', durMs: 3200, speed: 6, pinMs: 1600, sun: 'front', effects: [],
        cam: RIG.pan({ side: -104, along: 6, lift: 44, fov: 26, look: [0, -16, 39.5] }) },
      { id: 't41-viaduct-deck', durMs: 3000, speed: 6, absY: true, sun: 'front', effects: [],
        cam: RIG.follow({ side: [13.5, 12], along: [3, 0.5], lift: 4.0, fov: 30, look: [0, 0, 3.7] }) },
    ] },
  { id: 'monsoon-morning-ford', map: 'monsoon', time: 'morning', seed: 404, anchor: [2, -86], heading: 12, formation: 'pair', allowWater: true,
    lineup: [CAST.ztz100, CAST.type96b], camo: 'factory',
    still: { fxTime: 800, effects: [dust('hero', 400, 6, 0.6)], cameras: [{ name: 'river-low', side: 10, along: 18, lift: 0.7, fov: 36 }, C.hero34] },
    films: [
      { id: 't08-ford-wake', durMs: 2800, speed: 5, effects: [], cam: RIG.follow({ side: [15, 13], along: [3, 0], lift: 1.0, fov: 30, look: [0, 0, 1.4] }) },
    ] },
  { id: 'kestrel-dawn-runway', map: 'airfield', time: 'dawn', seed: 405, anchor: [0, -160], heading: 0,
    formation: [[0, 0], [-14, -14], [14, -14], [-28, -28], [28, -28]], lineup: [CAST.sepv3, CAST.sepv3, CAST.sepv3, CAST.griffin, CAST.griffin], camo: 'factory',
    still: { fxTime: 900, effects: [dust('hero', 400, 10, 0.9), dust('ally1', 420, 10, 0.9), dust('ally2', 440, 10, 0.9)], cameras: [C.hero34, C.worm, { name: 'runway-tele', side: 0, along: 180, lift: 1.5, fov: 9, lookHero: [0, -14, 2] }] },
    films: [
      { id: 't09-runway-lead', durMs: 3000, speed: 14, effects: [smokeScreen('ally3', 0, { durationS: 20 }), smokeScreen('ally4', 300, { durationS: 20 })],
        cam: RIG.lead({ side: 1.0, along: [27, 19], lift: 0.7, fov: 26, look: [0, -4, 1.6] }) },
      { id: 't34-runway-pan', durMs: 3000, speed: 14, pinMs: 1500, effects: [], formation: [[0, 0], [1.5, -22], [-1, -44]], count: 3,
        cam: RIG.pan({ side: 85, along: 0, lift: 3, fov: 10, look: [0, -6, 1.6] }) }, // PR #9 push 4: at 1.6 m the tele looked through the runway's tall grass
    ] },
  { id: 'sirocco-noon-village', map: 'desert', time: 'day', seed: 406, anchor: [10, -70], heading: 351.9, formation: 'wedge', picture: { exposure: -0.4, contrast: 1.12 }, // PR #9 push 4: was [6, -40] at 0°, the hero starting in a checkpoint hut and b26's lens blocked at its still
    lineup: [CAST.leclerc, CAST.merkava, CAST.sepv3], camo: 'factory', count: 3,
    enemies: { along: 95, lat: -6, count: 2, formation: 'pair', lineup: [CAST.t90m, CAST.t72b3m], states: ['burning', 'intact'] },
    still: { fxTime: 2460, effects: [burn('foe0', 0), smoke('foe0', 0), fire('hero', 2420), dust('hero', 2000, 12, 1), fire('ally1', 1600), mg('ally2', 2350, 9)], cameras: [C.hero34, C.worm] },
    films: [
      { id: 't27-wadi-pan', durMs: 1800, speed: 12, pinMs: 900, effects: [burn('foe0', 0)], formation: [[0, 0], [1.2, -24], [-1, -48]], count: 3,
        cam: RIG.pan({ side: 42, along: 0, lift: 2.6, fov: 18, look: [0, -6, 1.5] }) },
      { id: 't10-wadi-kill', durMs: 1250, speed: 1.5, effects: [burn('foe0', 0), smoke('foe0', 0), fire('hero', 300), dust('hero', 200, 12, 1)],
        cam: [{ tMs: 0, side: 9, along: 13, lift: 1.3, fov: 40 }, { tMs: 1250, side: 8.6, along: 12.4, lift: 1.35, fov: 39 }] },
    ] },
  { id: 'redrock-golden-canyon', map: 'badlands', time: 'golden', seed: 407, anchor: [-183.1, 139.7], heading: 177.6, formation: 'wedge', // PR #9 push 4: was [-150, 60] at 160°, the reshaped relief putting an ally on a 0.41 slope at the start
    lineup: [CAST.leclerc, CAST.leclerc, CAST.sepv3, CAST.leclerc, CAST.sepv3], camo: 'factory',
    still: { fxTime: 1000, effects: ['hero', 'ally1', 'ally2', 'ally3', 'ally4'].map((a, i) => dust(a, 600 + i * 30, 16, 1.2)), cameras: [{ name: 'front-low', side: 6, along: 22, lift: 0.8, fov: 36 }, { name: 'flank', side: 30, along: 4, lift: 2, fov: 30, lookHero: [0, -10, 1.5] }] },
    films: [
      { id: 't11-canyon-lead', durMs: 2800, speed: 11, effects: [], cam: RIG.lead({ side: 2.4, along: [20, 13], lift: 0.8, fov: 32, look: [0, -5, 1.6] }) },
      { id: 't36-canyon-orbit', durMs: 3500, speed: 8, effects: [], cam: RIG.orbit({ radius: 16, from: 40, to: 125, lift: 1.1, fov: 34 }) },
    ] },
  { id: 'copper-golden-mine', map: 'copper_mesa', time: 'golden', seed: 408, anchor: [150, 30], heading: 190, formation: 'wedge',
    lineup: [CAST.sepv3, CAST.k2, CAST.sepv3, CAST.k2], camo: 'factory', count: 4,
    enemies: { along: 110, lat: 10, count: 2, formation: 'pair', lineup: [CAST.t90m, CAST.t72b3m], states: ['burning', 'intact'] },
    still: { fxTime: 2460, effects: [burn('foe0', 0), fire('hero', 2420), fire('foe1', 1500), dust('hero', 2100, 12, 1)], cameras: [C.hero34, C.worm] },
    films: [
      { id: 't12-mine-fire', durMs: 1250, speed: 0, effects: [burn('foe0', 0), fire('hero', 250)], cam: [{ tMs: 0, side: 4.5, along: 9.5, lift: 0.45, fov: 38 }, { tMs: 1250, side: 4.4, along: 9.2, lift: 0.46, fov: 37 }] },
      { id: 't33-mine-noon', time: 'day', durMs: 1250, speed: 0, effects: [burn('foe0', 0), fire('hero', 500)], cam: [{ tMs: 0, side: 9, along: 13, lift: 1.4, fov: 40 }, { tMs: 1250, side: 8.7, along: 12.6, lift: 1.42, fov: 39 }] },
    ] },
  { id: 'amberford-golden-ford', map: 'autumn', time: 'golden', seed: 409, anchor: [-127.7, 162.1], heading: 344.1, formation: 'pair', // PR #9 push 4: was [-188, 142] at 88°, an ally starting in a stone wall (the nearest clear road turns the view 104°)
    lineup: [CAST.k2, CAST.type10], camo: 'factory',
    enemies: { along: 110, lat: 20, count: 2, formation: 'pair', lineup: [CAST.t90m, CAST.t72b3m], states: ['burning', 'intact'] },
    still: { fxTime: 2470, effects: [burn('foe0', 0), fire('hero', 2400), fire('foe1', 1500), dust('hero', 2300, 10, 1)], cameras: [{ name: 'riverbank', side: 12, along: 14, lift: 1.2, fov: 38 }, C.worm] },
    films: [
      { id: 't13-ford-fight', durMs: 2500, speed: 3, effects: [burn('foe0', 0), fire('foe1', 300), fire('hero', 1500)], cam: RIG.follow({ side: [12, 11], along: [14, 11], lift: 1.1, fov: 38, look: [0, 2, 1.8] }) },
    ] },
  { id: 'saltmere-sunset-lighthouse', map: 'coastal', time: 'sunset', seed: 410, anchor: [208, 94.4], heading: 90.9, formation: 'column', // PR #9 push 4: was [206, 92] at 92°, an ally starting in a fence rail
    lineup: [CAST.sepv3, CAST.griffin, CAST.sepv3, CAST.griffin], camo: 'factory', count: 4,
    still: { fxTime: 900, effects: [dust('hero', 400, 10, 0.8), dust('ally1', 420, 10, 0.8)], cameras: [{ name: 'worm', side: 5, along: 9, lift: 0.5, fov: 38 }, { name: 'lighthouse-side', side: 24, along: -14, lift: 2, fov: 36, lookHero: [0, -10, 4] }] },
    films: [
      { id: 't14-lighthouse-passby', durMs: 3000, speed: 6, pinMs: 1300, effects: [], cam: RIG.passby({ side: 10, along: 0, lift: 0.7, fov: 42, look: [0, 0, 1.7] }) },
    ] },
  { id: 'saltmere-sunset-strand', map: 'coastal', time: 'sunset', seed: 411, anchor: [266, -120], heading: 8, formation: 'echelon', allowWater: true,
    lineup: [CAST.leclerc, CAST.leo, CAST.ariete, CAST.k2], camo: 'factory', count: 4,
    still: { fxTime: 920, effects: [dust('hero', 500, 12, 1), fire('hero', 860), dust('ally1', 520, 12, 1)], cameras: [C.hero34, { name: 'dune-high', side: 40, along: 10, lift: 12, fov: 40, lookHero: [-10, 0, 0] }] },
    films: [
      { id: 't15-strand-follow', durMs: 3000, speed: 9, effects: [fire('hero', 1700)], cam: RIG.follow({ side: [13, 11], along: [2, 0], lift: 1.2, fov: 32, look: [0, 0, 1.6] }) },
      { id: 't43-strand-drone', durMs: 3500, speed: 9, effects: [], cam: RIG.drone({ side: -10, along: [-14, -6], lift: [15, 13], fov: 46, look: [3, 16, 0] }) },
    ] },
  { id: 'nordhavn-dusk-fjord', map: 'fjord', time: 'dusk', seed: 412, anchor: [208.2, -52.5], heading: 186.9, formation: 'column', // 2.0: was [205, -60] at 10°, in a hedgehog line
    lineup: [CAST.leo, CAST.cv90, CAST.leo], camo: 'factory', count: 3,
    still: { fxTime: 800, effects: [dust('hero', 400, 8, 0.8)], cameras: [C.worm, { name: 'sea-side', side: -20, along: 10, lift: 2, fov: 38, lookHero: [0, -12, 2] }] },
    films: [
      { id: 't16-fjord-passby', durMs: 3200, speed: 8, pinMs: 1400, effects: [], cam: RIG.passby({ side: 8.5, along: 0, lift: 0.6, fov: 44, look: [0, 0, 1.6] }) },
    ] },
  // (2026-10-06: no picture exposure lift — the Studio night's own camera sets its level, docs/STUDIO.md "The night's camera")
  { id: 'ironworks-night-yard', map: 'foundry', time: 'night', seed: 413, anchor: [40, -150], heading: 0, formation: 'line',
    lineup: [CAST.t14, CAST.t90m, CAST.t14, CAST.t90m], camo: 'factory', count: 4,
    still: { fxTime: 920, effects: [flare([40, -60], 0, { heightM: 110, burnS: 40, intensity: 1.3, driftMps: 1.2 }), fireField([60, -110], 0), embers([60, -110], 0), fire('hero', 860), fire('ally2', 700), dust('hero', 500, 10, 0.9)], cameras: [{ name: 'front-low', side: 4, along: 16, lift: 0.7, fov: 38 }, { name: 'stacks', side: -20, along: -30, lift: 4, fov: 40, lookHero: [0, 40, 6] }] },
    films: [
      { id: 't26-night-barrage', durMs: 2500, speed: 0, effects: [flare([40, -110], 0, { heightM: 90, burnS: 40, intensity: 1.4, driftMps: 1.0 }), barrage([40, -122], 200, 7, 16), fire('hero', 1500), fire('ally1', 1800)],
        cam: [{ tMs: 0, side: -20, along: -30, lift: 4, fov: 40, lookHero: [0, 40, 6] }, { tMs: 2500, side: -18, along: -26, lift: 4.6, fov: 40, lookHero: [0, 40, 6] }] },
      { id: 't17-yard-salvo', durMs: 1250, speed: 0, effects: [flare(H(0, 30), 0, { heightM: 70, burnS: 40, intensity: 1.6, driftMps: 0.6 }), fireField(H(-7, 10), 0, { radiusM: 3 }), fireField(H(21, 8), 0, { radiusM: 3 }), fire('hero', 200), fire('ally1', 450), fire('ally2', 700), fire('ally3', 950)],
        cam: [{ tMs: 0, side: 9, along: 14, lift: 1.2, fov: 40, lookHero: [-9, 0, 1.8] }, { tMs: 1250, side: 8.6, along: 13.4, lift: 1.25, fov: 39, lookHero: [-9, 0, 1.8] }] },
      { id: 't44-yard-follow', durMs: 3000, speed: 5, effects: [flare(H(0, 30), 0, { heightM: 70, burnS: 40, intensity: 1.6, driftMps: 0.6 }), fireField(H(-9, 9), 0, { radiusM: 3 }), embers(H(-9, 9), 0), fireField(H(-8, 22), 0, { radiusM: 3 })],
        cam: RIG.follow({ side: [12, 11], along: [3, 1], lift: 1.4, fov: 34, look: [0, 1, 1.6] }) },
    ] },
  { id: 'frosthollow-night-village', map: 'winter', time: 'night', seed: 414, anchor: [-80, -100], heading: 0, // 2.0: was [-84, -100] at 8°, an ally in a sauna hut
    formation: [[0, 0], [-2, -18], [2, -36]], lineup: [CAST.leo, CAST.kf51, CAST.leo], camo: 'factory',
    enemies: { along: 120, lat: -4, count: 1, lineup: [CAST.t90m], states: ['burning'] },
    still: { fxTime: 2480, effects: [flare([-80, -40], 0, { heightM: 105, burnS: 40, driftMps: 1.2 }), burn('foe0', 0), embers('foe0', 0), fire('hero', 2440), dust('hero', 2200, 10, 1)], cameras: [C.rear, C.hero34] },
    films: [
      { id: 't18-village-chase', durMs: 2800, speed: 5, effects: [flare([-80, -40], 0, { heightM: 105, burnS: 40, driftMps: 1.2 }), burn('foe0', 0), fire('hero', 1900)],
        cam: RIG.chase({ side: -3.5, along: [-17, -13], lift: 2.2, fov: 42, look: [0, 30, 2] }) },
    ] },
  { id: 'ruinspires-dusk-avenue', map: 'ruinspires', time: 'dusk', seed: 415, anchor: [-200, -116], heading: 0, // PR #9 push 4: was [-152, -120], allies starting in a bunker and a ruin
    formation: [[0, 0], [-3, -18], [3, -36]], lineup: [CAST.t14, CAST.t90m, CAST.t14], camo: 'factory',
    enemies: { along: 140, lat: 0, count: 2, formation: 'column', spread: 0.5, lineup: ['leo2a6_x', 'm1a2_x'], states: ['burning', 'intact'] },
    still: { fxTime: 2480, effects: [burn('foe0', 0), smoke('foe0', 0), fire('hero', 2440), fire('foe1', 1400)], cameras: [{ name: 'avenue-mid', side: 3.5, along: -12, lift: 1.4, fov: 42, lookHero: [0, 50, 6] }, C.rear, C.front] },
    films: [
      { id: 't19-avenue-chase', durMs: 2800, speed: 5, effects: [burn('foe0', 0), smoke('foe0', 0), fire('hero', 2000)], cam: RIG.chase({ side: 0.4, along: [-15, -11], lift: 2.4, fov: 42, look: [0, 40, 3] }) },
    ] },
  { id: 'cinder-dusk-tracks', map: 'railyard', time: 'dusk', seed: 416, anchor: [60, -40], heading: 92, formation: 'line',
    lineup: [CAST.leo, CAST.kf51, CAST.leo, CAST.kf51], camo: 'factory', count: 4,
    still: { fxTime: 920, effects: [dust('hero', 400, 10, 0.9), fire('hero', 860)], cameras: [C.hero34, C.worm] },
    films: [
      { id: 't20-tracks-follow', durMs: 2800, speed: 7, effects: [fire('hero', 1800)], cam: RIG.follow({ side: [9, 8], along: [3, 1], lift: 0.8, fov: 34 }) },
    ] },
  { id: 'earthrise-moon', map: 'moon', time: 'day', seed: 417, anchor: [60, -10], heading: 40, formation: 'wedge',
    lineup: [CAST.kf51, CAST.leo, CAST.kf51, CAST.lynx], camo: 'factory', count: 4,
    still: { fxTime: 800, effects: [dust('hero', 400, 10, 0.8)], cameras: [{ name: 'rear-earth', side: -4, along: -28, lift: 2, fov: 46, lookHero: [0, 60, 12] }, { name: 'low-sky', side: 8, along: 14, lift: 0.6, fov: 44, lookHero: [0, 0, 4] }] },
    films: [
      { id: 't21-earthrise-chase', durMs: 3000, speed: 4, effects: [], cam: RIG.chase({ side: -4, along: [-24, -30], lift: 1.6, fov: 46, look: [0, 60, 11] }) },
    ] },
  { id: 'olympus-mars-convoy', map: 'mars', time: 'day', seed: 418, anchor: [-90, 60], heading: 84, formation: 'column',
    lineup: [CAST.ztz100, CAST.ztz100, CAST.type96b, CAST.ztz100, CAST.type96b], camo: 'factory',
    still: { fxTime: 900, effects: [dust('hero', 400, 12, 1), dust('ally1', 420, 10, 0.9)], cameras: [{ name: 'sky-low', side: 6, along: 18, lift: 0.6, fov: 50, lookHero: [0, 0, 5] }, C.hero34, C.rear] },
    films: [
      { id: 't37-mars-drone', durMs: 3500, speed: 8, effects: [], cam: RIG.drone({ side: 8, along: [-26, -12], lift: [22, 18], fov: 46, look: [0, 34, 0] }) },
    ] },
  { id: 'steinburg-day-crossroads', map: 'urban', time: 'day', seed: 422, anchor: [21.5, -12], heading: 183.7, formation: 'pair', // 2.0: was [36, -20] at 90°
    lineup: [CAST.sepv3, CAST.leo], camo: 'factory',
    enemies: { along: 70, lat: 4, count: 1, lineup: [CAST.t90m], states: ['wrecked-burnt'] },
    still: { fxTime: 2480, effects: [burn('foe0', 0), fire('hero', 2440)], cameras: [{ name: 'corner-high', side: -14, along: 16, lift: 7, fov: 40 }, C.worm] },
    films: [
      { id: 't31-plaza-fire', durMs: 1250, speed: 0, effects: [burn('foe0', 0), fire('hero', 480)], cam: [{ tMs: 0, side: -14, along: 16, lift: 7, fov: 40 }, { tMs: 1250, side: -13.6, along: 15.4, lift: 6.8, fov: 39 }] },
    ] },
  { id: 'blackglass-day-towers', map: 'blackglass', time: 'day', seed: 423, anchor: [-96, 30], heading: 50, formation: 'pair',
    lineup: [CAST.kf51, CAST.leo], camo: 'factory',
    enemies: { along: 90, lat: 0, count: 1, lineup: [CAST.t72b3m], states: ['wrecked-burnt'] },
    still: { fxTime: 2480, effects: [burn('foe0', 0), fire('hero', 2440)], cameras: [{ name: 'tower-low', side: 6, along: 12, lift: 0.6, fov: 50, lookHero: [-4, 20, 8] }, C.hero34] },
    films: [
      { id: 't32-towers-follow', durMs: 2800, speed: 6, effects: [burn('foe0', 0), fire('hero', 1800)], cam: RIG.follow({ side: [7, 6.5], along: [7, 4], lift: 0.6, fov: 54, look: [-1, 3, 3.2] }) },
    ] },
  { id: 'saltwind-day-harbor', map: 'saltwind', time: 'day', seed: 421, anchor: [-182, 27.9], heading: 5.1, formation: 'column', // PR #9 push 4: was [-188, 20] at 0°, an ally starting in a market stall
    lineup: [CAST.ariete, CAST.leclerc, CAST.ariete, CAST.leclerc], camo: 'factory', count: 4,
    still: { fxTime: 800, effects: [dust('hero', 400, 8, 0.7)], cameras: [C.hero34, { name: 'sea-side', side: 24, along: 10, lift: 2, fov: 38, lookHero: [0, -10, 2] }] },
    films: [
      { id: 't30-harbor-follow', durMs: 2800, speed: 7, effects: [], cam: RIG.follow({ side: [12, 11], along: [2, -1], lift: 3.4, fov: 32, look: [0, 0, 1.4] }) },
    ] },
  // the slow-motion kill moved to the open canyon floor (Amberford's tree lines hid the target)
  { id: 'redrock-golden-kill', map: 'badlands', time: 'golden', seed: 420, anchor: [-150, 60], heading: 160, formation: 'pair',
    lineup: [CAST.leclerc, CAST.sepv3], camo: 'factory',
    enemies: { along: 72, lat: 3, count: 1, lineup: [CAST.t90m], states: ['intact'] },
    still: { fxTime: 560, effects: [fire('hero', 300), pen('foe0', 380), kill('foe0', 430), debris('foe0', 450)],
      cameras: [{ name: 'ots-kill', side: -2.2, along: -9, lift: 3.4, fov: 22, lookHero: [3, 72, 1.6] }, { name: 'target-side', side: 18, along: 64, lift: 1.6, fov: 34, lookHero: [3, 72, 2] }] },
    films: [
      { id: 't23-slowmo-kill', durMs: 2400, speed: 0, effects: [fire('hero', 300), pen('foe0', 380), kill('foe0', 430)],
        film: { fps: 30, shutterDeg: 180, samples: 12, maxSamples: 64, speed: [{ tMs: 0, speed: 1 }, { tMs: 340, speed: 1 }, { tMs: 420, speed: 0.22, ease: 'smooth' }, { tMs: 2400, speed: 0.22 }] },
        cam: [{ tMs: 0, side: -2.2, along: -9, lift: 3.4, fov: 22, lookHero: [3, 72, 1.6] }, { tMs: 2400, side: -2.0, along: -7.5, lift: 3.3, fov: 20, lookHero: [3, 72, 2.4] }] },
    ] },
  { id: 'verdant-day-assault', map: 'verdant', time: 'day', seed: 419, anchor: [-80.1, 59.8], heading: 263.8, formation: 'wedge', // 2.0: was [-80, 20] at 83°, an ally in a wood
    lineup: [CAST.t90m, CAST.t14, CAST.t90m, CAST.t14, CAST.kurganets], camo: 'factory',
    enemies: { along: 82, lat: 4, count: 3, formation: 'line', spread: 0.7, lineup: ['leo2a6_x', 'm1a2_x', 'leo2a5_x'], states: ['burning', 'wrecked-burnt', 'intact'] },
    still: { fxTime: 2480, effects: [burn('foe0', 0), burn('foe1', 0), smoke('foe1', 0), huge([-6, 52], 900), fire('hero', 2440), fire('ally1', 1900), fire('foe2', 1500), dust('hero', 2100, 12, 1), boom([-20, 40], 1800, 'large'), barrage([-10, 20], 1200, 5, 18)],
      cameras: [C.hero34, C.worm, { name: 'f7', side: 7, along: 6, lift: 3.2, fov: 46, lookHero: [-6, 60, 2] }] },
    films: [
      { id: 't29-verdant-fire', durMs: 1250, speed: 0, effects: [burn('foe0', 0), burn('foe1', 0), smoke('foe1', 0), fire('hero', 520), huge([-6, 52], 0)],
        cam: [{ tMs: 0, side: 4.5, along: 9.5, lift: 0.45, fov: 38 }, { tMs: 1250, side: 4.4, along: 9.2, lift: 0.46, fov: 37 }] },
      { id: 't22-assault-follow', durMs: 2800, speed: 5, effects: [burn('foe0', 0), burn('foe1', 0), smoke('foe1', 0), fire('ally1', 500), huge([-6, 52], 700), fire('hero', 1600), boom([-20, 40], 900, 'large')],
        cam: RIG.follow({ side: [3.2, 2.8], along: [-9.5, -7], lift: 3.2, fov: 44, look: [-4, 60, 2] }) },
    ] },
];

// Picture per time of day: the picture lane's recommended recipes (2026-10-01, d0e82362a):
// hero day = cinematic, sunset drama = golden-hour, night combat = ember; a set may override with `picture`.
const LOOK_BY_TIME = { dawn: 'vintage-print', morning: 'cinematic', day: 'cinematic', golden: 'cinematic', sunset: 'golden-hour', dusk: 'steel', night: 'ember' };
const EXTRA_BY_TIME = {
  morning: { exposure: 0.05 }, day: { exposure: 0.05 },
  sunset: { contrast: 1.1, toe: 0.25, streaks: { amount: 0.2 } },
  dusk: { exposure: 0.45 },
  golden: { saturation: 0.92 },
};
/** Film shots add the trailer lens's streaks (letterbox stays in the edit). */
export const FILM_LENS = { streaks: { amount: 0.4, length: 0.75 } };
// Deep focus (owner 2026-10-06: "a bunch of weird blur in front of tanks and stuff. remove that"). Depth of field,
// focused on the hero at f/1.4 to f/8, blurred everything nearer the lens than the hero's centre (a gun pointed at the
// lens, the front of the hull, fences and grass in the foreground). The presets' colour fringing, which softens the
// frame edges, goes with it, so every film and still is sharp from the lens to the horizon.
export const pictureFor = (set, extra = {}) => ({
  preset: LOOK_BY_TIME[set.time] ?? 'cinematic',
  dof: { enabled: false },
  chromaticAberration: 0,
  vignette: { amount: 0.32, roundness: 0.55, softness: 0.6 },
  grain: { amount: 0.08, size: 1.1, color: 0.15, response: 0.7 },
  ...(EXTRA_BY_TIME[set.time] ?? {}),
  ...(set.picture ?? {}),
  ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'anamorphic')),
});
// Sun placement against the shot's own lens (light lane: back = sun on the lens axis, rim = +32 deg,
// side = +90, front = +180). Low suns default to rim light; day/dusk/night keep the map's sky.
export const SUN_BY_TIME = { dawn: 'rim', morning: 'side', golden: 'rim', sunset: 'rim' };
const SUN_OFFSET = { back: 0, rim: 32, side: 90, front: 180 };
export function sunFor(scene, mode, time) {
  const m = mode ?? SUN_BY_TIME[time];
  if (!m || m === 'map' || !scene.storyboard?.shots?.length && !scene.camera?.pos) return null;
  const sh = scene.storyboard?.shots?.[Math.floor((scene.storyboard.shots.length - 1) / 2)] ?? scene.camera;
  const bearing = (Math.atan2(sh.lookAt[0] - sh.pos[0], sh.lookAt[2] - sh.pos[2]) * 180 / Math.PI + 360) % 360;
  return +((bearing + (typeof m === 'number' ? m : SUN_OFFSET[m] ?? 0)) % 360).toFixed(1);
}
export const setById = id => { const s = SETS.find(x => x.id === id); if (!s) throw Error(`no set ${id}`); return s; };
export const filmById = id => { for (const s of SETS) for (const f of s.films) if (f.id === id) return { set: s, film: f }; throw Error(`no film ${id}`); };
