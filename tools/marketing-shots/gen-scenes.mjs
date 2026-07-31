// tools/marketing-shots/gen-scenes.mjs — authors the 30 marketing scene JSONs.
//
// The scene JSONs in tools/marketing-shots/scenes/ are the checked-in source
// of truth for the marketing set (docs/STUDIO.md schema). This generator is
// the master editor for them: tweak a scene here, re-run, re-shoot.
//
//   node tools/marketing-shots/gen-scenes.mjs          # writes scenes/*.json
//
// Aim helper: actors may carry `aimAt: [x, z]` instead of `turretDeg` — the
// generator solves the turret yaw so the gun points at that world position
// (facing 0 = +Z, increasing toward +X, per the studio contract).
//
// `cameraVariants`: while a shot is being tuned it may carry an array of
// candidate cameras — tools/marketing-shots/shoot.mjs captures one image per
// candidate (_vN suffix) off a single scene load. Bake the winner into
// `camera` (gen: keep the winner as the single entry / drop the array) before
// the production 3840 pass.
//
// SCOUTED GEOMETRY (shots/marketing/scout + preview passes — hard-won):
//   desert  — the "flat pink pan" on the scout is a MESA TOP (do not stage
//             there). Reliable stages: the flattened village rect (buildings
//             ~x -70..70, z 25..101; crossroads ≈ (16, 71); E-W road z≈70-75;
//             N-S road x≈13..18 through the village), and the WADI ROAD
//             running south out of the village (x≈8..22, z -40..-140) between
//             mesa walls W (x<-5) and E (x>32). Dune bands = heavy grass.
//   winter  — frozen lake c(195,-120) r~85 (stage well inside r-15); village
//             crossroads ≈ (17,48); N-S road at x≈-20, z -190..0; scrub band
//             west of x≈-100; power poles line the roads.
//   urban   — street grid xs[-112,-40,36,112] zs[-96,-16,60,136]; keep tanks
//             AND cameras within ~±4 m of a carriageway centerline or at
//             intersections; blocks are walled courtyards (cameras inside
//             blocks see only walls).
//   verdant — village cottages near (31,67),(34,96),(-41,54),(-46,80),(3,-32),
//             (29,-5); crossroads ≈ (25,75); N-S road x 8..20 down to the
//             southern barns (0..12, -150..-170); open meadows W of the road
//             (x -60..0, z -140..-60) and far-west fields (-120..-60, -40..40);
//             tree clusters E (46..106, -84..-164).
//
// EFFECT-TIMING RULES (validated on preview passes):
//   fire            age 20-30 ms   (tMs = fxTime - 25: flash lit, tracer near)
//   firing_moment   tMs = fxTime   (composer ages itself via params.ageS; any
//                                   extra advance double-ages it)
//   tank_kill       age 450-650 ms (fireball bloom + debris + risen column)
//   explosion       age 400-550 ms
//   dust            age 250-450 ms
//   detrack         age 250-350 ms (links mid-air)
//   impact/sparks   age 80-140 ms
//   burning/smoke   additive from tMs 0; fxTime >= 2500 develops the column
//
// COMPOSITION RULES (validated):
//   - muzzle flash pointing away from camera is invisible — give firing tanks
//     a gun heading within ~±70° of the camera bearing, or show it in profile
//   - same-green camo on green maps merges — mix desert/digital/factory for
//     subject separation
//   - hero stills: include the muzzle + flash core IN frame or the bloom
//     washes the frame edge
//   - the drone band that reads best is 24-40 m, fov 40-46

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'scenes');
mkdirSync(OUT, { recursive: true });

const deg = (rad) => (rad * 180) / Math.PI;
const norm180 = (a) => {
  let x = a % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
};
const headingTo = (from, to) => deg(Math.atan2(to[0] - from[0], to[1] - from[1]));

function solveAims(scene) {
  for (const a of scene.actors) {
    if (a.aimAt) {
      const h = headingTo(a.pos, a.aimAt);
      a.turretDeg = Math.round(norm180(h - a.facingDeg) * 10) / 10;
      delete a.aimAt;
    }
  }
  return scene;
}
const cam = (pos, lookAt, fov) => ({ pos, lookAt, groundRel: true, fov });

const SCENES = {};

// -- DESERT (8) --------------------------------------------------------------

// 01 — wadi-road duel: Leclerc firing south down the road, T-90A erupting
// against the west mesa wall.
SCENES['01_desert_duel_leclerc_kill'] = {
  map: 'desert',
  seed: 5101,
  actors: [
    { id: 'leclerc', name: 'hero', pos: [0, -14], facingDeg: 100, aimAt: [30, -18], gunDeg: 0.5, camo: 'desert', camoSeed: 101 },
    { id: 't90a', name: 'victim', pos: [30, -18], facingDeg: 285, turretDeg: 15, gunDeg: 0, camo: 'factory' },
  ],
  effects: [
    { type: 'tank_kill', actor: 'victim', tMs: 40, params: { cause: 'ammorack', pop: true } },
    { type: 'dust', at: [2, -19], tMs: 300, params: { count: 12, intensity: 1.0, dirDeg: 280 } },
    { type: 'fire', actor: 'hero', tMs: 598, params: { slot: 0, tracer: true, recoil: true } },
  ],
  camera: cam([-9, 1.6, -22], [10, 2.2, -15], 46),
  fxTime: 620,
  timeScale: 0,
};

// 02 — crossroads ram: AbramsX nose buried in the T-90M's flank at the
// adobe crossing, thrown track, dust wall.
SCENES['02_desert_ram_abramsx_t90m'] = {
  map: 'desert',
  seed: 5102,
  actors: [
    { id: 'abramsx', name: 'rammer', pos: [18, 68], facingDeg: 66, turretDeg: 3, gunDeg: -3, camo: 'digital', camoSeed: 77 },
    { id: 't90m', name: 'victim', pos: [23.8, 70.6], facingDeg: 155, turretDeg: -55, gunDeg: 2, camo: 'factory' },
  ],
  effects: [
    { type: 'detrack', actor: 'victim', tMs: 150, params: { side: 'L' } },
    { type: 'dust', at: [21, 69.3], tMs: 140, params: { count: 22, intensity: 1.6, dirDeg: 66 } },
    { type: 'dust', at: [15, 66], tMs: 60, params: { count: 12, intensity: 1.1, dirDeg: 246 } },
    { type: 'impact', actor: 'victim', tMs: 330, params: { kind: 'nonpen', caliberMm: 40, hFrac: 0.45 } },
  ],
  camera: cam([27, 1.4, 57], [20.5, 1.6, 70], 46),
  fxTime: 460,
  timeScale: 0,
};

// 03 — overwatch line south of the village: SEPv2 / 2A7V / Challenger 1
// hammering the compounds, long lens from behind the line.
SCENES['03_desert_overwatch_line'] = {
  map: 'desert',
  seed: 5103,
  actors: [
    { id: 'm1a2_sepv2', name: 'left', pos: [-14, -18], facingDeg: 10, aimAt: [-8, 60], gunDeg: 1.5, camo: 'desert', camoSeed: 31 },
    { id: 'leo2a7v', name: 'mid', pos: [2, -24], facingDeg: 4, aimAt: [10, 60], gunDeg: 2, camo: 'desert', camoSeed: 32 },
    { id: 'challenger1', name: 'right', pos: [18, -16], facingDeg: 358, aimAt: [26, 60], gunDeg: 1.5, camo: 'desert', camoSeed: 33 },
  ],
  effects: [
    { type: 'fire', actor: 'right', tMs: 100, params: { slot: 0, tracer: true } },
    { type: 'fire', actor: 'mid', tMs: 552, params: { slot: 0, tracer: true } },
    { type: 'fire', actor: 'left', tMs: 578, params: { slot: 0, tracer: true } },
  ],
  camera: cam([-26, 2.6, -34], [2, 2.6, -10], 34),
  fxTime: 600,
  timeScale: 0,
};

// 04 — crossroads brawl: KF51 + Leclerc converging on a T-90A, tracers both
// ways, HE burst behind, ricochet off the KF51.
SCENES['04_desert_village_brawl'] = {
  map: 'desert',
  seed: 5104,
  actors: [
    { id: 'kf51', name: 'push1', pos: [8, 50], facingDeg: 60, aimAt: [40, 64], gunDeg: 0.5, camo: 'desert', camoSeed: 41 },
    { id: 'leclerc', name: 'push2', pos: [20, 94], facingDeg: 165, aimAt: [40, 64], gunDeg: 0.5, camo: 'digital', camoSeed: 42 },
    { id: 't90a', name: 'defender', pos: [40, 64], facingDeg: 285, aimAt: [20, 94], gunDeg: 1, camo: 'factory' },
  ],
  effects: [
    { type: 'explosion', at: [30, 78], tMs: 145, params: { size: 'medium' } },
    { type: 'sparks', actor: 'push1', tMs: 550, params: { caliberMm: 125, hFrac: 0.7 } },
    { type: 'fire', actor: 'defender', tMs: 612, params: { slot: 0, tracer: true } },
    { type: 'fire', actor: 'push1', tMs: 622, params: { slot: 0, tracer: true } },
  ],
  camera: cam([6, 2.2, 44], [32, 2.0, 68], 46),
  fxTime: 645,
  timeScale: 0,
};

// 05 — wadi-road aftermath: burning turretless T-90A and charred 2A5 on the
// road, the M1A2 advancing between the smoke columns.
SCENES['05_desert_aftermath_sunline'] = {
  map: 'desert',
  seed: 5105,
  actors: [
    { id: 't90a', name: 'wreck1', pos: [38, -72], facingDeg: 150, state: 'turret-popped', stateAgeS: 120, burning: true },
    { id: 'leo2a5', name: 'wreck2', pos: [52, -80], facingDeg: 345, turretDeg: 30, state: 'wrecked-burnt', stateAgeS: 320, smoking: true },
    { id: 'm1a2', name: 'survivor', pos: [68, -92], facingDeg: 262, turretDeg: -14, gunDeg: 1, camo: 'desert', camoSeed: 51 },
  ],
  effects: [
    { type: 'engine_smoke', actor: 'wreck2', tMs: 0 },
    { type: 'dust', at: [76, -90], tMs: 2820, params: { count: 10, intensity: 0.8, dirDeg: 82 } },
  ],
  camera: cam([72, 1.8, -104], [46, 2.4, -74], 42),
  fxTime: 3200,
  timeScale: 0,
};

// 06 — close hero: KF51 Panther low 3/4, composed firing still, muzzle
// flash core IN frame, adobe walls + mesas behind.
SCENES['06_desert_hero_kf51'] = {
  map: 'desert',
  seed: 5106,
  actors: [
    { id: 'kf51', name: 'hero', pos: [0, 0], facingDeg: 205, turretDeg: 0, gunDeg: 1, camo: 'desert', camoSeed: 61 },
  ],
  effects: [
    { type: 'dust', at: [-2.5, -5.6], tMs: 20, params: { count: 8, intensity: 0.8, dirDeg: 205 } },
    { type: 'firing_moment', actor: 'hero', tMs: 300, params: { ageS: 0.05 } },
  ],
  camera: cam([5.9, 1.35, -9.4], [-1.4, 2.35, 1.8], 46),
  fxTime: 300,
  timeScale: 0,
};

// 07 — drone over the crossroads: Challenger 1 firing across the village,
// Leopard 2A6 erupting on the crossing itself.
SCENES['07_desert_drone_mesa_duel'] = {
  map: 'desert',
  seed: 5107,
  actors: [
    { id: 'challenger1', name: 'shooter', pos: [-40, 20], facingDeg: 60, aimAt: [24, 72], gunDeg: 0.5, camo: 'desert', camoSeed: 71 },
    { id: 'leo2a6', name: 'victim', pos: [24, 72], facingDeg: 250, turretDeg: 15, camo: 'digital', camoSeed: 72 },
  ],
  effects: [
    { type: 'tank_kill', actor: 'victim', tMs: 60, params: { cause: 'ammorack', pop: true } },
    { type: 'dust', actor: 'shooter', tMs: 320, params: { count: 10, intensity: 0.9, dirDeg: 240 } },
    { type: 'fire', actor: 'shooter', tMs: 635, params: { slot: 0, tracer: true } },
  ],
  camera: cam([30, 36, 22], [16, 0, 64], 44),
  fxTime: 660,
  timeScale: 0,
};

// 08 — the charge: three abreast up the wadi road toward the village, dust
// wakes, the lead M1A2 firing on the move.
SCENES['08_desert_dune_charge'] = {
  map: 'desert',
  seed: 5108,
  actors: [
    { id: 'm1a2', name: 'lead', pos: [-2, -2], facingDeg: 208, turretDeg: -8, gunDeg: 0.5, camo: 'desert', camoSeed: 81 },
    { id: 'leclerc', name: 'wing1', pos: [10, 4], facingDeg: 215, turretDeg: 6, gunDeg: 1, camo: 'desert', camoSeed: 82 },
    { id: 'abramsx', name: 'wing2', pos: [-14, 4], facingDeg: 198, turretDeg: 3, gunDeg: 1, camo: 'digital', camoSeed: 83 },
  ],
  effects: [
    { type: 'dust', at: [1, 4], tMs: 220, params: { count: 20, intensity: 1.5, dirDeg: 28 } },
    { type: 'dust', at: [13, 10], tMs: 260, params: { count: 16, intensity: 1.3, dirDeg: 35 } },
    { type: 'dust', at: [-11, 10], tMs: 240, params: { count: 16, intensity: 1.3, dirDeg: 18 } },
    { type: 'dust', at: [-1, 8], tMs: 60, params: { count: 10, intensity: 0.9, dirDeg: 28 } },
    { type: 'fire', actor: 'lead', tMs: 478, params: { slot: 0, tracer: true } },
  ],
  camera: cam([-8, 1.2, -14], [-1, 2.4, 0], 50),
  fxTime: 500,
  timeScale: 0,
};

// -- WINTER (8) ---------------------------------------------------------------

// 09 — frozen-lake duel: Leopard 2A7V firing across the ice, T-90M erupting.
SCENES['09_winter_lake_duel'] = {
  map: 'winter',
  seed: 5109,
  actors: [
    { id: 'leo2a7v', name: 'shooter', pos: [166, -98], facingDeg: 118, aimAt: [206, -124], gunDeg: 0.5, camo: 'winter', camoSeed: 91 },
    { id: 't90m', name: 'victim', pos: [206, -124], facingDeg: 300, turretDeg: 40, camo: 'winter', camoSeed: 92 },
  ],
  effects: [
    { type: 'tank_kill', actor: 'victim', tMs: 60, params: { cause: 'ammorack', pop: true } },
    { type: 'fire', actor: 'shooter', tMs: 595, params: { slot: 0, tracer: true } },
  ],
  camera: cam([216, 1.8, -136], [176, 2.2, -106], 40),
  fxTime: 620,
  timeScale: 0,
};

// 10 — snowfield ram: Leopard 2A6 punching into the Challenger's flank.
SCENES['10_winter_ram_leo2a6'] = {
  map: 'winter',
  seed: 5110,
  actors: [
    { id: 'leo2a6', name: 'rammer', pos: [76, -44], facingDeg: 65, turretDeg: 0, gunDeg: -2, camo: 'winter', camoSeed: 15 },
    { id: 'challenger1', name: 'victim', pos: [81.4, -41.6], facingDeg: 15, turretDeg: 100, gunDeg: 3, camo: 'factory' },
  ],
  effects: [
    { type: 'detrack', actor: 'victim', tMs: 120, params: { side: 'L' } },
    { type: 'dust', at: [79, -43], tMs: 180, params: { count: 26, intensity: 1.8, dirDeg: 65 } },
    { type: 'dust', at: [72, -48], tMs: 200, params: { count: 12, intensity: 1.1, dirDeg: 245 } },
    { type: 'impact', actor: 'victim', tMs: 330, params: { kind: 'nonpen', caliberMm: 30, hFrac: 0.35 } },
  ],
  camera: cam([75, 1.1, -33.5], [79.5, 1.5, -42.8], 48),
  fxTime: 460,
  timeScale: 0,
};

// 11 — column under fire on the west road: the T-90 pair advancing east,
// the near tank firing across the camera axis, incoming round bursting off
// the roadside.
SCENES['11_winter_overwatch_birch'] = {
  map: 'winter',
  seed: 5111,
  actors: [
    { id: 't90m', name: 'far', pos: [-120, 60], facingDeg: 95, aimAt: [0, 52], gunDeg: 1, camo: 'winter', camoSeed: 111 },
    { id: 't90a', name: 'near', pos: [-112, 42], facingDeg: 100, turretDeg: -35, gunDeg: 1, camo: 'winter', camoSeed: 112 },
  ],
  effects: [
    { type: 'explosion', at: [-101, 53], tMs: 180, params: { size: 'small' } },
    { type: 'dust', at: [-119, 41], tMs: 260, params: { count: 12, intensity: 1.0, dirDeg: 280 } },
    { type: 'fire', actor: 'far', tMs: 200, params: { slot: 0, tracer: true } },
    { type: 'fire', actor: 'near', tMs: 578, params: { slot: 0, tracer: true } },
  ],
  camera: cam([-150, 4.2, 62], [-100, 2.0, 44], 27),
  fxTime: 600,
  timeScale: 0,
};

// 12 — village brawl in the snow: SEPv2 and KF51 converging on a dark-green
// Leclerc at the farm crossing.
SCENES['12_winter_village_brawl'] = {
  map: 'winter',
  seed: 5112,
  actors: [
    { id: 'leclerc', name: 'foe', pos: [30, 30], facingDeg: 325, aimAt: [4, 52], gunDeg: 0.5, camo: 'factory', camoSeed: 123 },
    { id: 'kf51', name: 'ally2', pos: [4, 52], facingDeg: 145, aimAt: [30, 30], gunDeg: 0.5, camo: 'digital', camoSeed: 122 },
    { id: 'm1a2_sepv2', name: 'ally1', pos: [-14, 24], facingDeg: 50, aimAt: [30, 30], gunDeg: 0.5, camo: 'winter', camoSeed: 121 },
  ],
  effects: [
    { type: 'explosion', at: [18, 44], tMs: 145, params: { size: 'medium' } },
    { type: 'impact', actor: 'foe', tMs: 550, params: { kind: 'pen', caliberMm: 120, hFrac: 0.65 } },
    { type: 'fire', actor: 'foe', tMs: 625, params: { slot: 0, tracer: true } },
    { type: 'fire', actor: 'ally2', tMs: 612, params: { slot: 0, tracer: true } },
  ],
  camera: cam([18, 2.4, 12], [20, 2.0, 46], 50),
  fxTime: 650,
  timeScale: 0,
};

// 13 — burnout on the ice: turret-popped AbramsX burning, the 2A5 holding
// silhouette beyond the smoke.
SCENES['13_winter_aftermath_burnout'] = {
  map: 'winter',
  seed: 5113,
  actors: [
    { id: 'abramsx', name: 'wreck', pos: [198, -118], facingDeg: 240, state: 'turret-popped', stateAgeS: 160, burning: true },
    { id: 'leo2a5', name: 'survivor', pos: [172, -86], facingDeg: 205, turretDeg: -20, gunDeg: 0.5, camo: 'winter', camoSeed: 131 },
  ],
  effects: [
    { type: 'engine_smoke', actor: 'wreck', tMs: 0 },
    { type: 'dust', actor: 'survivor', tMs: 3000, params: { count: 8, intensity: 0.6, dirDeg: 25 } },
  ],
  camera: cam([187, 1.8, -147], [183, 2.7, -95], 37),
  fxTime: 3400,
  timeScale: 0,
};

// 14 — close hero: T-90M in whitewash out on the ice, low 3/4 composed
// firing still.
SCENES['14_winter_hero_t90m'] = {
  map: 'winter',
  seed: 5114,
  actors: [
    { id: 't90m', name: 'hero', pos: [162, -78], facingDeg: 205, turretDeg: 0, gunDeg: 0.5, camo: 'factory', camoSeed: 141 },
  ],
  effects: [
    { type: 'dust', at: [160, -84], tMs: 50, params: { count: 6, intensity: 0.5, dirDeg: 205 } },
    { type: 'firing_moment', actor: 'hero', tMs: 300, params: { ageS: 0.05 } },
  ],
  camera: cam([168.2, 1.3, -87.6], [161, 2.2, -77], 48),
  fxTime: 300,
  timeScale: 0,
};

// 15 — drone over the lake battle: Challenger 1 and the 2A7V trading fire
// across the ice while the KF51 dies between them.
SCENES['15_winter_drone_lake_battle'] = {
  map: 'winter',
  seed: 5115,
  actors: [
    { id: 'challenger1', name: 'shooter', pos: [170, -150], facingDeg: 25, aimAt: [235, -100], gunDeg: 0.5, camo: 'winter', camoSeed: 151 },
    { id: 'leo2a7v', name: 'foe', pos: [235, -100], facingDeg: 235, aimAt: [170, -150], gunDeg: 0.5, camo: 'digital', camoSeed: 152 },
    { id: 'kf51', name: 'casualty', pos: [205, -158], facingDeg: 330, turretDeg: 30, camo: 'factory' },
  ],
  effects: [
    { type: 'tank_kill', actor: 'casualty', tMs: 60, params: { cause: 'ammorack', pop: true } },
    { type: 'fire', actor: 'shooter', tMs: 640, params: { slot: 0, tracer: true } },
    { type: 'fire', actor: 'foe', tMs: 652, params: { slot: 0, tracer: true } },
  ],
  camera: cam([146, 24, -172], [206, 0, -126], 46),
  fxTime: 675,
  timeScale: 0,
};

// 16 — the chase down the west road: Leopard 2A5 running a fleeing T-90A
// south, firing on the move. Side tracking shot, long lens.
SCENES['16_winter_flank_chase'] = {
  map: 'winter',
  seed: 5116,
  actors: [
    { id: 'leo2a5', name: 'hunter', pos: [-20, -48], facingDeg: 187, aimAt: [-18, -84], gunDeg: 0.5, camo: 'winter', camoSeed: 161 },
    { id: 't90a', name: 'prey', pos: [-18, -84], facingDeg: 190, turretDeg: 170, gunDeg: 1, camo: 'factory' },
  ],
  effects: [
    { type: 'dust', at: [-21, -40], tMs: 140, params: { count: 12, intensity: 1.1, dirDeg: 7 } },
    { type: 'dust', at: [-19, -75], tMs: 100, params: { count: 12, intensity: 1.1, dirDeg: 10 } },
    { type: 'dust', at: [-20, -62], tMs: 280, params: { count: 8, intensity: 0.8, dirDeg: 8 } },
    { type: 'fire', actor: 'hunter', tMs: 475, params: { slot: 0, tracer: true } },
  ],
  camera: cam([14, 2.3, -100], [-28, 2.3, -64], 44),
  fxTime: 500,
  timeScale: 0,
};

// -- URBAN (7) ----------------------------------------------------------------

// 17 — street-canyon duel: M1A2 firing straight up the x=36 street, T-90M
// erupting between the rowhouses.
SCENES['17_urban_street_duel'] = {
  map: 'urban',
  seed: 5117,
  actors: [
    { id: 'm1a2', name: 'hero', pos: [36, -64], facingDeg: 0, aimAt: [37, 20], gunDeg: 0.5, camo: 'auto' },
    { id: 't90m', name: 'victim', pos: [37, 6], facingDeg: 182, turretDeg: 10, camo: 'digital', camoSeed: 171 },
  ],
  effects: [
    { type: 'tank_kill', actor: 'victim', tMs: 0, params: { cause: 'ammorack', pop: true } },
    { type: 'fire', actor: 'hero', tMs: 595, params: { slot: 0, tracer: true } },
  ],
  camera: cam([31, 2.2, -78], [38, 2.5, -6], 40),
  fxTime: 620,
  timeScale: 0,
};

// 18 — intersection ram: KF51 T-boning the Leclerc through the (36,-16)
// crossing, track thrown over the setts.
SCENES['18_urban_ram_plaza'] = {
  map: 'urban',
  seed: 5118,
  actors: [
    { id: 'kf51', name: 'rammer', pos: [30, -20], facingDeg: 78, turretDeg: -8, gunDeg: -2, camo: 'auto' },
    { id: 'leclerc', name: 'victim', pos: [36.2, -18.6], facingDeg: 350, turretDeg: -95, gunDeg: 2, camo: 'digital', camoSeed: 181 },
  ],
  effects: [
    { type: 'detrack', actor: 'victim', tMs: 150, params: { side: 'L' } },
    { type: 'dust', at: [33, -19.5], tMs: 130, params: { count: 18, intensity: 1.4, dirDeg: 78 } },
    { type: 'dust', at: [27, -21.5], tMs: 60, params: { count: 10, intensity: 1.0, dirDeg: 258 } },
    { type: 'impact', actor: 'victim', tMs: 330, params: { kind: 'nonpen', caliberMm: 40, hFrac: 0.4 } },
  ],
  camera: cam([40, 1.3, -27], [31.5, 1.6, -17.5], 52),
  fxTime: 460,
  timeScale: 0,
};

// 19 — holding the line: Challenger 1 + SEPv2 firing east down the z=60
// street, flashes lighting the canyon toward the camera corner.
SCENES['19_urban_overwatch_church'] = {
  map: 'urban',
  seed: 5119,
  actors: [
    { id: 'challenger1', name: 'front', pos: [0, 58], facingDeg: 88, aimAt: [58, 50], gunDeg: 0.5, camo: 'auto' },
    { id: 'm1a2_sepv2', name: 'rear', pos: [-20, 63], facingDeg: 92, aimAt: [58, 70], gunDeg: 0.5, camo: 'digital', camoSeed: 191 },
  ],
  effects: [
    { type: 'fire', actor: 'front', tMs: 575, params: { slot: 0, tracer: true } },
    { type: 'fire', actor: 'rear', tMs: 555, params: { slot: 0, tracer: true } },
  ],
  camera: cam([28, 3.2, 60], [-16, 2.2, 60], 30),
  fxTime: 600,
  timeScale: 0,
};

// 20 — ruin brawl at the (112,60) crossing: AbramsX and Leopard 2A6
// cornering a T-90A, tracers crossing.
SCENES['20_urban_ruin_brawl'] = {
  map: 'urban',
  seed: 5120,
  actors: [
    { id: 'abramsx', name: 'a1', pos: [111, 40], facingDeg: 355, aimAt: [114, 66], gunDeg: 0.5, camo: 'auto' },
    { id: 'leo2a6', name: 'a2', pos: [90, 58], facingDeg: 92, aimAt: [114, 66], gunDeg: 0.5, camo: 'digital', camoSeed: 201 },
    { id: 't90a', name: 'cornered', pos: [114, 66], facingDeg: 250, aimAt: [90, 58], gunDeg: 1, camo: 'factory' },
  ],
  effects: [
    { type: 'explosion', at: [122, 72], tMs: 190, params: { size: 'small' } },
    { type: 'sparks', actor: 'a1', tMs: 540, params: { caliberMm: 125, hFrac: 0.7 } },
    { type: 'fire', actor: 'cornered', tMs: 605, params: { slot: 0, tracer: true } },
    { type: 'fire', actor: 'a1', tMs: 620, params: { slot: 0, tracer: true } },
  ],
  camera: cam([120, 3.2, 30], [106, 2.0, 60], 36),
  fxTime: 640,
  timeScale: 0,
};

// 21 — street aftermath: burning turretless 2A5 near, charred T-90A beyond,
// the KF51 advancing through the haze.
SCENES['21_urban_aftermath_factory'] = {
  map: 'urban',
  seed: 5121,
  actors: [
    { id: 'leo2a5', name: 'wreck2', pos: [-52, 64], facingDeg: 10, state: 'turret-popped', stateAgeS: 300, burning: true },
    { id: 't90a', name: 'wreck1', pos: [-34, 55], facingDeg: 130, turretDeg: 35, state: 'wrecked-burnt', stateAgeS: 400, burning: true },
    { id: 'kf51', name: 'survivor', pos: [-16, 59], facingDeg: 268, turretDeg: 5, gunDeg: 0.5, camo: 'auto' },
  ],
  effects: [
    { type: 'engine_smoke', actor: 'wreck1', tMs: 0 },
    { type: 'dust', actor: 'survivor', tMs: 2650, params: { count: 8, intensity: 0.7, dirDeg: 88 } },
  ],
  camera: cam([-68, 2.2, 64], [-24, 2.3, 60], 38),
  fxTime: 3000,
  timeScale: 0,
};

// 22 — close hero: AbramsX in urban grey at the (36,60) crossing, low 3/4
// composed firing still.
SCENES['22_urban_hero_abramsx'] = {
  map: 'urban',
  seed: 5122,
  actors: [
    { id: 'abramsx', name: 'hero', pos: [36, 60], facingDeg: 212, turretDeg: 0, gunDeg: 0.5, camo: 'auto' },
  ],
  effects: [
    { type: 'dust', at: [32, 54], tMs: 60, params: { count: 6, intensity: 0.6, dirDeg: 212 } },
    { type: 'firing_moment', actor: 'hero', tMs: 300, params: { ageS: 0.05 } },
  ],
  camera: cam([44.6, 1.1, 52], [34, 2.4, 61], 52),
  fxTime: 300,
  timeScale: 0,
};

// 23 — drone over the grid: Leclerc and the 2A7V duelling down the z=-16
// street, kill fireball punching up between the roofs.
SCENES['23_urban_drone_grid'] = {
  map: 'urban',
  seed: 5123,
  actors: [
    { id: 'leclerc', name: 'shooter', pos: [-38, -15], facingDeg: 80, aimAt: [28, -17], gunDeg: 0.5, camo: 'digital', camoSeed: 231 },
    { id: 'leo2a7v', name: 'victim', pos: [28, -16], facingDeg: 265, turretDeg: 8, camo: 'auto' },
  ],
  effects: [
    { type: 'tank_kill', actor: 'victim', tMs: 40, params: { cause: 'ammorack', pop: true } },
    { type: 'fire', actor: 'shooter', tMs: 615, params: { slot: 0, tracer: true } },
  ],
  camera: cam([-2, 40, -58], [10, 0, -16], 40),
  fxTime: 640,
  timeScale: 0,
};

// -- VERDANT (7) ----------------------------------------------------------------

// 24 — golden-field duel: Leopard 2A6 firing from the field margin, the
// Challenger dying at mid-field. Side lens keeps both on the thirds.
SCENES['24_verdant_field_duel'] = {
  map: 'verdant',
  seed: 5124,
  actors: [
    { id: 'leo2a6', name: 'shooter', pos: [-95, 10], facingDeg: 72, aimAt: [-38, 32], gunDeg: 0.5, camo: 'summer', camoSeed: 241 },
    { id: 'challenger1', name: 'victim', pos: [-38, 32], facingDeg: 250, turretDeg: -12, camo: 'factory' },
  ],
  effects: [
    { type: 'tank_kill', actor: 'victim', tMs: 60, params: { cause: 'ammorack', pop: true } },
    { type: 'dust', actor: 'shooter', tMs: 300, params: { count: 8, intensity: 0.8, dirDeg: 250 } },
    { type: 'fire', actor: 'shooter', tMs: 605, params: { slot: 0, tracer: true } },
  ],
  camera: cam([-105, 2.2, -6], [-64, 2.4, 24], 40),
  fxTime: 630,
  timeScale: 0,
};

// 25 — field-edge ram: T-90M smashing the tan SEPv2 sideways at the forest
// margin, dirt and thrown track.
SCENES['25_verdant_ram_hedgerow'] = {
  map: 'verdant',
  seed: 5125,
  actors: [
    { id: 't90m', name: 'rammer', pos: [90, 96], facingDeg: 120, turretDeg: 5, gunDeg: -2, camo: 'summer', camoSeed: 251 },
    { id: 'm1a2_sepv2', name: 'victim', pos: [95.4, 92.9], facingDeg: 40, turretDeg: 95, gunDeg: 2, camo: 'desert', camoSeed: 252 },
  ],
  effects: [
    { type: 'detrack', actor: 'victim', tMs: 150, params: { side: 'R' } },
    { type: 'dust', at: [92.5, 94.5], tMs: 140, params: { count: 18, intensity: 1.4, dirDeg: 120 } },
    { type: 'dust', at: [87, 98], tMs: 60, params: { count: 10, intensity: 1.0, dirDeg: 300 } },
    { type: 'impact', actor: 'victim', tMs: 330, params: { kind: 'nonpen', caliberMm: 30, hFrac: 0.4 } },
  ],
  camera: cam([83, 1.35, 83.4], [92.6, 1.6, 93.4], 52),
  fxTime: 460,
  timeScale: 0,
};

// 26 — overwatch in the west fields: NATO line (M1A2 / AbramsX / Leclerc)
// firing east toward the village, long-lens stack from behind.
SCENES['26_verdant_overwatch_ridge'] = {
  map: 'verdant',
  seed: 5126,
  actors: [
    { id: 'm1a2', name: 'left', pos: [-56, -14], facingDeg: 92, aimAt: [30, 10], gunDeg: 0.5, camo: 'summer', camoSeed: 261 },
    { id: 'abramsx', name: 'mid', pos: [-64, -30], facingDeg: 96, aimAt: [30, -14], gunDeg: 0.5, camo: 'digital', camoSeed: 262 },
    { id: 'leclerc', name: 'right', pos: [-46, -2], facingDeg: 88, aimAt: [30, 26], gunDeg: 0.5, camo: 'summer', camoSeed: 263 },
  ],
  effects: [
    { type: 'fire', actor: 'left', tMs: 578, params: { slot: 0, tracer: true } },
    { type: 'fire', actor: 'mid', tMs: 555, params: { slot: 0, tracer: true } },
    { type: 'fire', actor: 'right', tMs: 540, params: { slot: 0, tracer: true } },
  ],
  camera: cam([-18, 3.0, 2], [-52, 2.2, -12], 42),
  fxTime: 600,
  timeScale: 0,
};

// 27 — village-junction brawl: KF51 and T-90A collapsing on a Leopard 2A5
// among the cottages.
SCENES['27_verdant_village_brawl'] = {
  map: 'verdant',
  seed: 5127,
  actors: [
    { id: 'kf51', name: 'p1', pos: [8, 74], facingDeg: 75, aimAt: [46, 80], gunDeg: 0.5, camo: 'summer', camoSeed: 271 },
    { id: 't90a', name: 'p2', pos: [20, 106], facingDeg: 175, aimAt: [44, 82], gunDeg: 0.5, camo: 'factory' },
    { id: 'leo2a5', name: 'holdout', pos: [46, 80], facingDeg: 250, aimAt: [8, 74], gunDeg: 1, camo: 'digital', camoSeed: 272 },
  ],
  effects: [
    { type: 'explosion', at: [30, 94], tMs: 145, params: { size: 'medium' } },
    { type: 'impact', actor: 'holdout', tMs: 545, params: { kind: 'pen', caliberMm: 130, hFrac: 0.6 } },
    { type: 'fire', actor: 'holdout', tMs: 613, params: { slot: 0, tracer: true } },
    { type: 'fire', actor: 'p1', tMs: 625, params: { slot: 0, tracer: true } },
  ],
  camera: cam([-2, 2.7, 58], [30, 2.1, 82], 42),
  fxTime: 645,
  timeScale: 0,
};

// 28 — roadside aftermath: the Leclerc burning turretless on the southern
// road, the T-90M cresting the open field beyond.
SCENES['28_verdant_aftermath_meadow'] = {
  map: 'verdant',
  seed: 5128,
  actors: [
    { id: 'leclerc', name: 'wreck', pos: [11, -98], facingDeg: 195, state: 'turret-popped', stateAgeS: 140, burning: true },
    { id: 't90m', name: 'survivor', pos: [13, -116], facingDeg: 5, turretDeg: -10, gunDeg: 1, camo: 'summer', camoSeed: 281 },
  ],
  effects: [
    { type: 'dust', at: [14, -122], tMs: 2600, params: { count: 8, intensity: 0.7, dirDeg: 188 } },
  ],
  camera: cam([10, 2.0, -80], [12.5, 2.2, -102], 38),
  fxTime: 3000,
  timeScale: 0,
};

// 29 — close hero: Challenger 1 Mk.3 in the western fields, low 3/4
// composed firing still, sabot petals in frame.
SCENES['29_verdant_hero_challenger1'] = {
  map: 'verdant',
  seed: 5129,
  actors: [
    { id: 'challenger1', name: 'hero', pos: [-80, 30], facingDeg: 200, turretDeg: 0, gunDeg: 1, camo: 'summer', camoSeed: 291 },
  ],
  effects: [
    { type: 'dust', at: [-82, 24.4], tMs: 40, params: { count: 8, intensity: 0.8, dirDeg: 200 } },
    { type: 'firing_moment', actor: 'hero', tMs: 300, params: { ageS: 0.05 } },
  ],
  camera: cam([-74.6, 1.15, 21.4], [-81.2, 2.05, 30.8], 48),
  fxTime: 300,
  timeScale: 0,
};

// 30 — drone flank: the 2A7V and tan M1A2 sweeping east through the
// southwest fields in echelon, dust wakes, the lead gun firing.
SCENES['30_verdant_drone_flank'] = {
  map: 'verdant',
  seed: 5130,
  actors: [
    { id: 'leo2a7v', name: 'lead', pos: [13, -64], facingDeg: 8, aimAt: [40, -20], gunDeg: 0.5, camo: 'summer', camoSeed: 301 },
    { id: 'm1a2', name: 'wing', pos: [9, -84], facingDeg: 5, turretDeg: -12, gunDeg: 1, camo: 'desert', camoSeed: 302 },
  ],
  effects: [
    { type: 'explosion', at: [-2, -70], tMs: 190, params: { size: 'small' } },
    { type: 'dust', at: [12, -72], tMs: 200, params: { count: 14, intensity: 1.2, dirDeg: 186 } },
    { type: 'dust', at: [8, -92], tMs: 260, params: { count: 14, intensity: 1.2, dirDeg: 184 } },
    { type: 'fire', actor: 'lead', tMs: 575, params: { slot: 0, tracer: true } },
  ],
  camera: cam([28, 22, -104], [10, 0, -64], 42),
  fxTime: 600,
  timeScale: 0,
};

// ---------------------------------------------------------------------------

let n = 0;
for (const [name, scene] of Object.entries(SCENES)) {
  solveAims(scene);
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(scene, null, 2) + '\n');
  n++;
}
console.log(`[gen-scenes] wrote ${n} scene(s) to ${OUT}`);
