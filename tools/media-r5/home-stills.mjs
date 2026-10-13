#!/usr/bin/env node
// The home page's staged mechanic stills (owner 2026-10-12: "update all of these images to use new shots that are a lot
// better! and add far more mechanics"; shots/media-r5/home-r2/shot-list.json, kind studio-still). Each is a Studio scene
// built like the site's key-art stills (setups.mjs buildScene): its tanks on a battlefield set, the effect that shows the
// mechanic timed to the still's moment (fxTime), and three low front three-quarter lenses to choose from (cameraVariants).
// The lab renders them (review, then 3840 px); the pick is copied to the slot's deliver path. Crushing, map vehicles and
// the night are frames from delivered takes instead (a real crush, a real truck flattened, a real night fight).
//   node tools/media-r5/home-stills.mjs [outDir=shots/media-r5/home-r2/scenes] [ids]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import '../../src/vehicles/tankFactory.ts';
import { TANK_SPECS } from '../../src/vehicles/specs.ts';
import { signatureCamoPatternId, stockCamoPatternIdFor } from '../../src/vehicles/camoPolicy.ts';
import { buildScene, fire, sparks, dust, exhaust, debris, shockwave, smokeScreen, mg, boom, H } from './setups.mjs';

const own = (id) => signatureCamoPatternId(id) ?? stockCamoPatternIdFor(id, TANK_SPECS[id]?.nation, TANK_SPECS[id]?.era);
const impact = (actor, tMs, kind, caliberMm = 120) => ({ type: 'impact', actor, tMs, params: { kind, caliberMm } });
const CLEAN = { grain: { amount: 0.05, size: 1, color: 0.1, response: 0.7 }, vignette: { amount: 0.22, roundness: 0.55, softness: 0.65 }, dof: { enabled: false }, chromaticAberration: 0 };
// three low front three-quarter lenses on the hero, left, right and lower-wider
const LENSES = (along = 9, side = 6, lift = 0.8, fov = 38, look = [0, 0, 1.4]) => [
  { name: 'left', side: -side, along, lift, fov, lookHero: look },
  { name: 'right', side, along, lift, fov, lookHero: look },
  { name: 'low', side: -side * 0.6, along: along * 0.8, lift: lift * 0.6, fov: fov + 6, lookHero: [look[0], look[1], look[2] + 0.4] },
];
const still = (id, map, time, seed, anchor, heading, hero, more) => ({ id, map, time, seed, anchor, heading, lineup: [hero],
  formation: [[0, 0]], camo: own(hero), picture: CLEAN, aimAtFoes: true, ...more });

export const HOME_STILLS = [
  // a 120 mm round glancing off the T-90M's sloped glacis, the hull angled 40° to the shooter
  still('ricochet', 'winter', 'day', 801, [-78, -13.3], 4, 't90m_x', { formation: [[0, 0, { yaw: 40 }]],
    enemies: { along: 280, lat: 25, count: 1, formation: 'line', lineup: ['leo2a7v_x'], camo: own('leo2a7v_x') },
    effects: [fire('foe0', 0), impact('hero', 250, 'ricochet'), sparks('hero', 250), dust('hero', 0, 6, 0.6)], fxTime: 262,
    cameras: LENSES(9, 6, 0.8, 40) }),
  // three guns firing down the line, a penetration on the T-90M and an HE burst by the T-72B3M
  still('ammunition', 'railyard', 'golden', 802, [58.3, 68.3], 88, 'm1a2_sepv3_x', { lineup: ['m1a2_sepv3_x', 'm1a2_sepv3_x', 'challenger_3x'],
    formation: [[0, 0], [-7, -10], [7, -14]], count: 3,
    enemies: { along: 600, lat: 0, count: 2, formation: 'pair', lineup: ['t90m_x', 't72b3m'], camo: own('t90m_x') },
    effects: [fire('hero', 0), fire('ally1', 120), fire('ally2', 300), impact('foe0', 380, 'pen'), boom(H(14, 690), 330, 'small', { munition: 'he', cause: 'shot' }), dust('hero', 0, 8, 0.7)],
    fxTime: 318, cameras: LENSES(8, 4, 0.7, 44, [0, 40, 1.6]) }),
  // explosive reactive armor firing on the T-72B3M's turret front
  still('era', 'verdant', 'day', 803, [6.7, -64], 191, 't72b3m', { formation: [[0, 0, { yaw: -15 }]],
    enemies: { along: 250, lat: -10, count: 1, formation: 'line', lineup: ['leo2a6_x'], camo: own('leo2a6_x') },
    effects: [fire('foe0', 0), impact('hero', 300, 'era'), sparks('hero', 300), debris('hero', 305, { count: 18, speedMps: 14, hot: 0.6, scale: 0.8 })],
    fxTime: 330, cameras: LENSES(9, 6, 0.8, 35) }),
  // the Leopard 2A7V's smoke salvo blooming into a wall as it reverses
  still('smoke', 'urban', 'day', 804, [-150, 0], 90, 'leo2a7v_x', {
    effects: [smokeScreen('hero', 0), exhaust('hero', 0), dust('hero', 0, 10, 0.8)], fxTime: 900, cameras: LENSES(11, 6, 0.9, 38) }),
  // an FPV drone bursting on the M1A1's roof cage, the ghillie-netted T-84 Oplot-M in the treeline
  still('field-kit', 'saltwind', 'morning', 805, [5.9, 5], 343.8, 'ua_m1a1', { lineup: ['ua_m1a1', 'ua_t84_oplot_m'], formation: [[0, 0], [-14, -22]], count: 2,
    effects: [impact('hero', 0, 'he', 40), boom(H(0, 0.4), 0, 'small', { munition: 'drone_fpv', cause: 'shot' }), sparks('hero', 0),
      debris('hero', 10, { count: 16, speedMps: 10, hot: 0.5, scale: 0.7 })],
    fxTime: 70, cameras: LENSES(9, 6, 0.9, 35, [0, 0, 2.0]) }),
  // the Abrams' remote roof gun firing a burst
  still('roof-guns', 'oasis', 'golden', 806, [82.8, -70.5], 93, 'm1a2_sepv3_x', {
    enemies: { along: 140, lat: 12, count: 1, formation: 'line', lineup: ['t72b3m'], camo: own('t72b3m'), states: ['burning'] },
    effects: [mg('hero', 0, 14), sparks('foe0', 150)], fxTime: 180, cameras: LENSES(8, 5, 0.8, 35, [0, 0, 2.2]) }),
  // the farmhouse 49 m ahead of the T-14 collapsing under its HE round
  still('buildings', 'verdant', 'day', 807, [19.3, 48], 14, 't14_x', {
    effects: [fire('hero', 0), { type: 'structure', at: H(0, 49), tMs: 300, params: { stage: 'collapsed', cause: 'blast', munition: 'he', dirDeg: 14 } },
      debris(H(0, 47), 320, { count: 40, speedMps: 16, hot: 0.3, scale: 1.2 }), dust('hero', 0, 8, 0.7), shockwave(H(0, 47), 310, { radiusM: 18 })],
    fxTime: 1400, cameras: [
      { name: 'beside', side: -4, along: 5, lift: 0.9, fov: 40, lookHero: [0, 30, 4] },
      { name: 'beside-r', side: 4, along: 4, lift: 1.0, fov: 42, lookHero: [0, 30, 4] },
      { name: 'low', side: -3, along: 7, lift: 0.5, fov: 46, lookHero: [0, 28, 5] }] }),
  // a T-90M ramming a Leopard 2A6's flank
  still('impact', 'desert', 'golden', 808, [0, 0], 118.4, 't90m_x', {
    enemies: { along: 7.8, lat: 0, count: 1, formation: 'line', lineup: ['leo2a6_x'], yaw: 90, camo: own('leo2a6_x') },
    aimAtFoes: false, effects: [sparks('hero', 0), dust('hero', 0, 14, 1), { type: 'armor_scar', actor: 'foe0', tMs: 0, params: {} }],
    fxTime: 40, cameras: LENSES(11, 7, 0.9, 40, [0, 4, 1.4]) }),
  // the Stridsvagn 103B laying its gun by pitching its hull, firing uphill at a T-90M
  still('suspension', 'winter', 'day', 809, [-80, -100], 0, 'strv103', { formation: [[0, 0, { gun: 9 }]],
    enemies: { along: 220, lat: 10, count: 1, formation: 'line', lineup: ['t90m_x'], camo: own('t90m_x') },
    effects: [fire('hero', 0), dust('hero', 0, 12, 1)], fxTime: 45, cameras: LENSES(10, 6, 0.6, 38) }),
];

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const out = process.argv[2] ?? 'shots/media-r5/home-r2/scenes', only = process.argv[3]?.split(',');
  mkdirSync(out, { recursive: true });
  for (const s of HOME_STILLS.filter((x) => !only || only.includes(x.id))) {
    const scene = buildScene(s);
    scene.meta = { id: s.id, kind: 'home-still', slot: `mechanics/${s.id}` };
    writeFileSync(join(out, `${s.id}.json`), JSON.stringify(scene, null, 1));
  }
  console.log(`[home-stills] ${only?.length ?? HOME_STILLS.length} scenes -> ${out}`);
}
