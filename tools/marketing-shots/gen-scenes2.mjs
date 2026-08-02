// tools/marketing-shots/gen-scenes2.mjs — authors the SECOND 30-shot set (31-60).
//
// Owner brief (2026-08-02): "more like the Strv street duel and the T-90
// column under fire — crazy angles and zooms, a lot of explosions and sparks
// and debris and fire and smoke. Use only actual models." So: the sourced
// GLB fleet only (same cast as the first production — Leclerc, T-90A/M,
// AbramsX, KF51, M1A2/SEPv2, Leopard 2A5/2A6/2A7V, Challenger 1), heavier
// pyro stacking, low/worm/top-down/dutch cameras, long-lens compression.
// This set also opens the four newer maps (coastal/autumn/steppe/railyard).
//
//   node tools/marketing-shots/gen-scenes2.mjs        # writes scenes2/*.json
//   node tools/marketing-shots/shoot.mjs --scenes tools/marketing-shots/scenes2 \
//       --out shots/marketing2/raw [--width 1600]
//
// Everything else (schema, aim solver, timing + composition rules) follows
// gen-scenes.mjs — see its header. Camera may carry rollDeg (dutch tilt),
// which studio applyCamera() honors.
//
// SCOUTED GEOMETRY for the new maps (map configs, r1 shoot verified):
//   coastal  — village flat x 40..250, z -80..150 (c 150,30); roads x=-90 &
//              x=168 N-S, z=-52 & z=96 E-W (E-W clip at x<=262: the strand).
//   autumn   — village flat x -60..80, z -40..120 (c 10,40); N-S road ford
//              at x=-20 in the southern river third.
//   steppe   — hamlet flat x -70..70, z -20..110 (c 0,45); the plain itself
//              is stage-safe (micro-folds only); windbreak tree LINES.
//   railyard — depot flat x -200..200, z -170..190 (flatten .93 — safest
//              floor in the game); roads xs[-120,0,130] zs[-110,30,150].

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'scenes2');
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
const cam = (pos, lookAt, fov, rollDeg) => {
  const c = { pos, lookAt, groundRel: true, fov };
  if (rollDeg) c.rollDeg = rollDeg;
  return c;
};

const SCENES = {};

// -- DESERT (4) ---------------------------------------------------------------

// 31 — wadi gauntlet: ambushed column between the mesa walls. Lead M1A2
// firing back past camera, mid T-90A mid-ammo-rack (turret airborne), the
// Leclerc swerving out of the smoke behind. Long lens from low in the wadi.
SCENES['31_desert_wadi_gauntlet'] = {
  map: 'desert',
  seed: 6131,
  actors: [
    { id: 'm1a2', name: 'lead', pos: [44, 73], facingDeg: 88, aimAt: [78, 70], gunDeg: 0.5, camo: 'desert', camoSeed: 311 },
    { id: 't90a', name: 'mid', pos: [24, 71], facingDeg: 84, turretDeg: 30, camo: 'factory' },
    { id: 'leclerc', name: 'tail', pos: [2, 74], facingDeg: 106, turretDeg: -40, gunDeg: 1, camo: 'digital', camoSeed: 312 },
  ],
  effects: [
    { type: 'tank_kill', actor: 'mid', tMs: 140, params: { cause: 'ammorack', pop: true } },
    { type: 'dust', at: [6, 76], tMs: 300, params: { count: 16, intensity: 1.4, dirDeg: 286 } },
    { type: 'dust', at: [40, 70], tMs: 340, params: { count: 12, intensity: 1.0, dirDeg: 268 } },
    { type: 'sparks', actor: 'tail', tMs: 520, params: { caliberMm: 125, hFrac: 0.65 } },
    { type: 'fire', actor: 'lead', tMs: 615, params: { slot: 0, tracer: true } },
  ],
  camera: cam([56, 2.0, 66], [20, 2.6, 72.5], 38, 3),
  fxTime: 640,
  timeScale: 0,
};

// 32 — vertical kill: straight-down drone on the adobe crossroads, KF51
// fireball punching up at the camera, the SEPv2 tearing through the frame
// corner with a dust wake.
SCENES['32_desert_rooftop_dive'] = {
  map: 'desert',
  seed: 6132,
  actors: [
    { id: 'kf51', name: 'victim', pos: [16, 71], facingDeg: 320, turretDeg: 25, camo: 'factory' },
    { id: 'm1a2_sepv2', name: 'runner', pos: [7, 62], facingDeg: 242, turretDeg: 168, gunDeg: 1, camo: 'desert', camoSeed: 321 },
  ],
  effects: [
    { type: 'tank_kill', actor: 'victim', tMs: 118, params: { cause: 'ammorack', pop: true } },
    { type: 'dust', at: [9, 64], tMs: 260, params: { count: 20, intensity: 1.6, dirDeg: 62 } },
    { type: 'dust', at: [12, 67], tMs: 420, params: { count: 10, intensity: 0.9, dirDeg: 55 } },
    { type: 'fire', actor: 'runner', tMs: 585, params: { slot: 0, tracer: true } },
  ],
  camera: cam([11, 38, 65], [14.2, 0, 69.5], 46, 15),
  fxTime: 610,
  timeScale: 0,
};

// 33 — worm's-eye under the muzzle: Leclerc firing directly over the lens,
// flash core + shock dust ring, mesa wall behind. The most aggressive
// camera in the set.
SCENES['33_desert_muzzle_worm'] = {
  map: 'desert',
  seed: 6133,
  actors: [
    { id: 'leclerc', name: 'hero', pos: [10, 64], facingDeg: 205, turretDeg: -14, gunDeg: -2, camo: 'desert', camoSeed: 331 },
  ],
  effects: [
    { type: 'dust', at: [9, 59], tMs: 60, params: { count: 14, intensity: 1.3, dirDeg: 200 } },
    { type: 'dust', at: [12, 67], tMs: 200, params: { count: 8, intensity: 0.7, dirDeg: 230 } },
    { type: 'firing_moment', actor: 'hero', tMs: 340, params: { ageS: 0.07 } },
  ],
  camera: cam([12.4, 0.9, 55.2], [9.4, 2.8, 65.6], 54, 3),
  fxTime: 340,
  timeScale: 0,
};

// 34 — last stand at the wall: Challenger 1 backed against the adobe
// compound trading fire with two attackers, ricochet screaming off its
// turret, HE burst on the wall behind it. Over-the-shoulder camera.
SCENES['34_desert_last_stand'] = {
  map: 'desert',
  seed: 6134,
  actors: [
    { id: 'challenger1', name: 'holdout', pos: [-48, 44], facingDeg: 96, aimAt: [30, 40], gunDeg: 0.5, camo: 'desert', camoSeed: 341 },
    { id: 'abramsx', name: 'atk1', pos: [30, 40], facingDeg: 275, aimAt: [-48, 44], gunDeg: 0.5, camo: 'digital', camoSeed: 342 },
    { id: 'm1a2', name: 'atk2', pos: [18, 66], facingDeg: 246, aimAt: [-46, 46], gunDeg: 0.5, camo: 'desert', camoSeed: 343 },
  ],
  effects: [
    { type: 'explosion', at: [-56, 50], tMs: 160, params: { size: 'medium' } },
    { type: 'sparks', actor: 'holdout', tMs: 545, params: { caliberMm: 120, hFrac: 0.75 } },
    { type: 'fire', actor: 'holdout', tMs: 608, params: { slot: 0, tracer: true } },
    { type: 'fire', actor: 'atk1', tMs: 622, params: { slot: 0, tracer: true } },
    { type: 'dust', at: [24, 52], tMs: 380, params: { count: 12, intensity: 1.0, dirDeg: 260 } },
  ],
  camera: cam([-59, 3.1, 34], [-22, 2.0, 45], 40, -3),
  fxTime: 645,
  timeScale: 0,
};

// -- WINTER (4) ---------------------------------------------------------------

// 35 — ice breaker: DOUBLE kill on the frozen lake — two fireballs at
// staggered ages, the whitewash 2A7V still mid-recoil between them. Lens
// flat on the ice.
SCENES['35_winter_ice_breaker'] = {
  map: 'winter',
  seed: 6135,
  actors: [
    { id: 'leo2a7v', name: 'shooter', pos: [176, -108], facingDeg: 122, aimAt: [206, -126], gunDeg: 0.5, camo: 'washworn', camoSeed: 351 },
    { id: 't90a', name: 'kill1', pos: [206, -126], facingDeg: 300, turretDeg: 20, camo: 'factory' },
    { id: 't90m', name: 'kill2', pos: [188, -142], facingDeg: 350, turretDeg: -35, camo: 'amoeba', camoSeed: 352 },
  ],
  effects: [
    { type: 'tank_kill', actor: 'kill1', tMs: 60, params: { cause: 'ammorack', pop: true } },
    { type: 'tank_kill', actor: 'kill2', tMs: 230, params: { cause: 'fuel', pop: false } },
    { type: 'fire', actor: 'shooter', tMs: 610, params: { slot: 0, tracer: true } },
  ],
  camera: cam([163, 1.1, -132], [193, 2.4, -124], 30, 0),
  fxTime: 635,
  timeScale: 0,
};

// 36 — birch-line ambush over the wreck: camera shooting across a charred
// hull in the foreground, KF51 muzzle flash beyond it, tracer crossing the
// frame over the dead armor.
SCENES['36_winter_birch_ambush'] = {
  map: 'winter',
  seed: 6136,
  actors: [
    { id: 't90a', name: 'pyre', pos: [-26, -36], facingDeg: 318, turretDeg: 40, state: 'turret-popped', stateAgeS: 220, burning: true },
    { id: 'challenger1', name: 'advancer', pos: [-21, -12], facingDeg: 192, turretDeg: 4, gunDeg: 0.5, camo: 'winter', camoSeed: 361 },
  ],
  effects: [
    { type: 'engine_smoke', actor: 'pyre', tMs: 0 },
    { type: 'dust', at: [-22, -6], tMs: 2550, params: { count: 12, intensity: 1.0, dirDeg: 12 } },
    { type: 'fire', actor: 'advancer', tMs: 2872, params: { slot: 0, tracer: true } },
  ],
  camera: cam([-30.5, 1.8, -45], [-22.5, 2.2, -24], 42, -4),
  fxTime: 2900,
  timeScale: 0,
};

// 37 — road charge head-on: M1A2 coming straight at the lens down the west
// road, snow wake, firing on the move, an incoming round bursting off the
// verge beside it.
SCENES['37_winter_road_charge'] = {
  map: 'winter',
  seed: 6137,
  actors: [
    { id: 'm1a2', name: 'charger', pos: [-20, -82], facingDeg: 187, turretDeg: 6, gunDeg: 0.5, camo: 'winter', camoSeed: 371 },
    { id: 'leo2a5', name: 'wing', pos: [-26, -66], facingDeg: 194, turretDeg: -8, gunDeg: 1, camo: 'splinter', camoSeed: 372 },
  ],
  effects: [
    { type: 'explosion', at: [-14, -88], tMs: 170, params: { size: 'small' } },
    { type: 'dust', at: [-21, -74], tMs: 240, params: { count: 20, intensity: 1.6, dirDeg: 7 } },
    { type: 'dust', at: [-27, -58], tMs: 300, params: { count: 14, intensity: 1.2, dirDeg: 14 } },
    { type: 'fire', actor: 'charger', tMs: 475, params: { slot: 0, tracer: true } },
  ],
  camera: cam([-18.5, 1.3, -94], [-21.5, 2.3, -82], 40, 4),
  fxTime: 500,
  timeScale: 0,
};

// 38 — village hell: the farm crossing on fire — turret-popped 2A5 burning
// in the snow, Leopard 2A6 and Leclerc converging on the whitewash T-90M
// through the smoke, HE burst between them. Oblique drone.
SCENES['38_winter_village_hell'] = {
  map: 'winter',
  seed: 6138,
  actors: [
    { id: 'leo2a5', name: 'pyre', pos: [8, 36], facingDeg: 130, state: 'turret-popped', stateAgeS: 200, burning: true },
    { id: 'leo2a6', name: 'a1', pos: [-12, 60], facingDeg: 132, aimAt: [30, 32], gunDeg: 0.5, camo: 'winter', camoSeed: 381 },
    { id: 'leclerc', name: 'a2', pos: [2, 14], facingDeg: 52, aimAt: [30, 32], gunDeg: 0.5, camo: 'digital', camoSeed: 382 },
    { id: 't90m', name: 'foe', pos: [30, 32], facingDeg: 262, aimAt: [-12, 60], gunDeg: 1, camo: 'washworn', camoSeed: 383 },
  ],
  effects: [
    { type: 'explosion', at: [14, 46], tMs: 2480, params: { size: 'medium' } },
    { type: 'impact', actor: 'foe', tMs: 2790, params: { kind: 'pen', caliberMm: 120, hFrac: 0.6 } },
    { type: 'fire', actor: 'a2', tMs: 2872, params: { slot: 0, tracer: true } },
    { type: 'fire', actor: 'foe', tMs: 2882, params: { slot: 0, tracer: true } },
  ],
  camera: cam([-8, 22, -6], [12, 0, 38], 44, -6),
  fxTime: 2905,
  timeScale: 0,
};

// -- URBAN (5) ------------------------------------------------------------------

// 39 — point-blank alley: AbramsX and T-90A twenty metres apart on the
// x=112 street, BOTH guns lit, sparks showering between them. Side lens
// from the cross street.
SCENES['39_urban_alley_flash'] = {
  map: 'urban',
  seed: 6139,
  actors: [
    { id: 'abramsx', name: 'south', pos: [112, 52], facingDeg: 4, aimAt: [113, 74], gunDeg: 0, camo: 'urbanblock', camoSeed: 391 },
    { id: 't90a', name: 'north', pos: [113, 74], facingDeg: 186, aimAt: [112, 52], gunDeg: 0, camo: 'factory' },
  ],
  effects: [
    { type: 'sparks', actor: 'south', tMs: 520, params: { caliberMm: 125, hFrac: 0.7 } },
    { type: 'sparks', actor: 'north', tMs: 545, params: { caliberMm: 120, hFrac: 0.6 } },
    { type: 'fire', actor: 'south', tMs: 612, params: { slot: 0, tracer: true } },
    { type: 'fire', actor: 'north', tMs: 622, params: { slot: 0, tracer: true } },
    { type: 'dust', at: [112.5, 63], tMs: 420, params: { count: 10, intensity: 0.9, dirDeg: 95 } },
  ],
  camera: cam([130, 2.0, 63], [104, 2.2, 63], 46, 0),
  fxTime: 645,
  timeScale: 0,
};

// 40 — the intersection from directly above, rolled 20°: kill fireball and
// airborne turret at (36,60), the Leopard 2A7V cutting the corner through
// its own dust.
SCENES['40_urban_overpass_dive'] = {
  map: 'urban',
  seed: 6140,
  actors: [
    { id: 'leclerc', name: 'victim', pos: [36, 60], facingDeg: 40, turretDeg: -20, camo: 'digital', camoSeed: 401 },
    { id: 'leo2a7v', name: 'cutter', pos: [22, 44], facingDeg: 32, turretDeg: 55, gunDeg: 0.5, camo: 'urbanblock', camoSeed: 402 },
  ],
  effects: [
    { type: 'tank_kill', actor: 'victim', tMs: 122, params: { cause: 'ammorack', pop: true } },
    { type: 'dust', at: [24, 47], tMs: 280, params: { count: 18, intensity: 1.5, dirDeg: 32 } },
    { type: 'fire', actor: 'cutter', tMs: 590, params: { slot: 0, tracer: true } },
  ],
  camera: cam([33, 48, 54], [35.5, 0, 59.5], 42, 20),
  fxTime: 615,
  timeScale: 0,
};

// 41 — rubble stalk: lens buried at the ruined corner, the 2A7V crossing
// the street silhouetted against a burning T-90A hull and its smoke column.
SCENES['41_urban_ruin_stalk'] = {
  map: 'urban',
  seed: 6141,
  actors: [
    { id: 't90a', name: 'pyre', pos: [58, -16], facingDeg: 205, turretDeg: 60, state: 'wrecked-burnt', stateAgeS: 260, burning: true },
    { id: 'leo2a7v', name: 'crosser', pos: [24, -17], facingDeg: 88, turretDeg: 14, gunDeg: 0.5, camo: 'urbanblock', camoSeed: 411 },
  ],
  effects: [
    { type: 'engine_smoke', actor: 'pyre', tMs: 0 },
    { type: 'dust', at: [18, -18], tMs: 2550, params: { count: 12, intensity: 1.0, dirDeg: 268 } },
    { type: 'fire', actor: 'crosser', tMs: 2875, params: { slot: 0, tracer: true } },
  ],
  camera: cam([6, 1.1, -28], [42, 2.2, -15], 38, -3),
  fxTime: 2900,
  timeScale: 0,
};

// 42 — crossfire X: three shooters hammering the (36,-16) crossing from
// three streets while the Leclerc dies in the middle of it. Rolled oblique
// drone — tracers crossing under the lens.
SCENES['42_urban_crossfire_x'] = {
  map: 'urban',
  seed: 6142,
  actors: [
    { id: 'leclerc', name: 'doomed', pos: [36, -16], facingDeg: 300, turretDeg: 10, camo: 'digital', camoSeed: 421 },
    { id: 'm1a2_sepv2', name: 's1', pos: [36, -68], facingDeg: 2, aimAt: [36, -18], gunDeg: 0.5, camo: 'urbanblock', camoSeed: 422 },
    { id: 'challenger1', name: 's2', pos: [-8, -16], facingDeg: 88, aimAt: [34, -16], gunDeg: 0.5, camo: 'ambushdot', camoSeed: 423 },
    { id: 'kf51', name: 's3', pos: [36, 30], facingDeg: 182, aimAt: [37, -14], gunDeg: 0.5, camo: 'flecktarn', camoSeed: 424 },
  ],
  effects: [
    { type: 'tank_kill', actor: 'doomed', tMs: 145, params: { cause: 'ammorack', pop: true } },
    { type: 'fire', actor: 's1', tMs: 585, params: { slot: 0, tracer: true } },
    { type: 'fire', actor: 's2', tMs: 600, params: { slot: 0, tracer: true } },
    { type: 'fire', actor: 's3', tMs: 615, params: { slot: 0, tracer: true } },
  ],
  camera: cam([12, 28, -44], [32, 0, -16], 46, -8),
  fxTime: 640,
  timeScale: 0,
};

// 43 — close hero: Leopard 2A6 in urban block camo firing down the z=60
// canyon, flash core in frame, dust rolling off the setts. Low 3/4.
SCENES['43_urban_hero_leo2a6'] = {
  map: 'urban',
  seed: 6143,
  actors: [
    { id: 'leo2a6', name: 'hero', pos: [-40, 60], facingDeg: 118, turretDeg: 0, gunDeg: 0.5, camo: 'urbanblock', camoSeed: 431 },
  ],
  effects: [
    { type: 'dust', at: [-44, 56], tMs: 60, params: { count: 10, intensity: 0.9, dirDeg: 118 } },
    { type: 'dust', at: [-36, 63], tMs: 220, params: { count: 6, intensity: 0.6, dirDeg: 60 } },
    { type: 'firing_moment', actor: 'hero', tMs: 320, params: { ageS: 0.05 } },
  ],
  camera: cam([-28, 1.25, 55], [-42, 2.6, 61.5], 50, 0),
  fxTime: 320,
  timeScale: 0,
};

// -- VERDANT (4) ----------------------------------------------------------------

// 44 — hedgerow breakout: KF51 punching through the field margin head-on,
// dirt wall still climbing, gun already lit.
SCENES['44_verdant_hedgerow_breakout'] = {
  map: 'verdant',
  seed: 6144,
  actors: [
    { id: 'kf51', name: 'breaker', pos: [22, -96], facingDeg: 262, turretDeg: 4, gunDeg: 0.5, camo: 'flecktarn', camoSeed: 441 },
  ],
  effects: [
    { type: 'dust', at: [26, -95], tMs: 220, params: { count: 24, intensity: 1.8, dirDeg: 82 } },
    { type: 'dust', at: [18, -98], tMs: 360, params: { count: 12, intensity: 1.1, dirDeg: 95 } },
    { type: 'firing_moment', actor: 'breaker', tMs: 430, params: { ageS: 0.05 } },
  ],
  camera: cam([10, 1.5, -102], [24, 2.4, -95], 44, 3),
  fxTime: 430,
  timeScale: 0,
};

// 45 — column massacre (the f7 homage, escalated): road column caught on
// the southern straight — lead firing, mid detracked with links airborne,
// tail mid-ammo-rack. Elevated long lens stacks all three plus the smoke.
SCENES['45_verdant_column_massacre'] = {
  map: 'verdant',
  seed: 6145,
  actors: [
    { id: 'leo2a7v', name: 'lead', pos: [10, -160], facingDeg: 8, aimAt: [-40, -110], gunDeg: 0.5, camo: 'summer', camoSeed: 451 },
    { id: 'm1a2', name: 'mid', pos: [13, -136], facingDeg: 4, turretDeg: -70, gunDeg: 1, camo: 'desert', camoSeed: 452 },
    { id: 't90a', name: 'tail', pos: [15, -112], facingDeg: 12, turretDeg: 25, camo: 'factory' },
  ],
  effects: [
    { type: 'tank_kill', actor: 'tail', tMs: 80, params: { cause: 'ammorack', pop: true } },
    { type: 'detrack', actor: 'mid', tMs: 310, params: { side: 'L' } },
    { type: 'dust', at: [11, -140], tMs: 320, params: { count: 16, intensity: 1.3, dirDeg: 190 } },
    { type: 'impact', actor: 'mid', tMs: 500, params: { kind: 'nonpen', caliberMm: 125, hFrac: 0.5 } },
    { type: 'fire', actor: 'lead', tMs: 610, params: { slot: 0, tracer: true } },
  ],
  camera: cam([-10, 6.0, -178], [12, 1.6, -132], 34, -3),
  fxTime: 635,
  timeScale: 0,
};

// 46 — over-the-barrel duel at dawn range: lens riding the T-90M's engine
// deck, outgoing tracer streaking to a distant answering flash across the
// west meadows. Extreme compression.
SCENES['46_verdant_meadow_duel'] = {
  map: 'verdant',
  seed: 6146,
  actors: [
    { id: 't90m', name: 'near', pos: [-20, -100], facingDeg: 272, aimAt: [-86, -94], gunDeg: 0.5, camo: 'summer', camoSeed: 461 },
    { id: 'm1a2', name: 'far', pos: [-86, -94], facingDeg: 94, aimAt: [-20, -100], gunDeg: 0.5, camo: 'desert', camoSeed: 462 },
  ],
  effects: [
    { type: 'fire', actor: 'near', tMs: 575, params: { slot: 0, tracer: true } },
    { type: 'fire', actor: 'far', tMs: 552, params: { slot: 0, tracer: true } },
    { type: 'dust', at: [-24, -101], tMs: 380, params: { count: 8, intensity: 0.7, dirDeg: 270 } },
  ],
  camera: cam([-8, 2.8, -104], [-52, 2.2, -97], 28, 0),
  fxTime: 600,
  timeScale: 0,
};

// 47 — farm siege from the rooftops: two attackers collapsing on the 2A5
// holdout at the cottage crossroads, HE burst and pen sparks, camera at
// eave height between the roofs.
SCENES['47_verdant_farm_siege'] = {
  map: 'verdant',
  seed: 6147,
  actors: [
    { id: 'leo2a5', name: 'holdout', pos: [44, 78], facingDeg: 255, aimAt: [6, 70], gunDeg: 1, camo: 'dpm', camoSeed: 471 },
    { id: 't90m', name: 'atk1', pos: [6, 70], facingDeg: 82, aimAt: [44, 78], gunDeg: 0.5, camo: 'summer', camoSeed: 472 },
    { id: 'abramsx', name: 'atk2', pos: [34, 104], facingDeg: 168, aimAt: [45, 82], gunDeg: 0.5, camo: 'digital', camoSeed: 473 },
  ],
  effects: [
    { type: 'explosion', at: [30, 90], tMs: 155, params: { size: 'medium' } },
    { type: 'impact', actor: 'holdout', tMs: 540, params: { kind: 'pen', caliberMm: 125, hFrac: 0.65 } },
    { type: 'fire', actor: 'atk1', tMs: 610, params: { slot: 0, tracer: true } },
    { type: 'fire', actor: 'holdout', tMs: 625, params: { slot: 0, tracer: true } },
  ],
  camera: cam([18, 3.4, 58], [36, 1.8, 80], 46, -3),
  fxTime: 650,
  timeScale: 0,
};

// -- COASTAL (4) ----------------------------------------------------------------

// 48 — coast-road column: three abreast charging north up the sandy lane,
// dust wakes over the dune band, the lead gun firing past camera, the bay
// sheen behind.
SCENES['48_coastal_beach_storm'] = {
  map: 'coastal',
  seed: 6148,
  actors: [
    { id: 'm1a2', name: 'lead', pos: [168, -54], facingDeg: 356, turretDeg: -6, gunDeg: 0.5, camo: 'desert', camoSeed: 481 },
    { id: 'leclerc', name: 'w1', pos: [161, -70], facingDeg: 4, turretDeg: 10, gunDeg: 1, camo: 'naval', camoSeed: 482 },
    { id: 'challenger1', name: 'w2', pos: [176, -74], facingDeg: 350, turretDeg: -5, gunDeg: 1, camo: 'tropic', camoSeed: 483 },
  ],
  effects: [
    { type: 'dust', at: [167, -60], tMs: 240, params: { count: 18, intensity: 1.4, dirDeg: 176 } },
    { type: 'dust', at: [162, -76], tMs: 300, params: { count: 14, intensity: 1.2, dirDeg: 184 } },
    { type: 'dust', at: [175, -80], tMs: 280, params: { count: 14, intensity: 1.2, dirDeg: 170 } },
    { type: 'fire', actor: 'lead', tMs: 495, params: { slot: 0, tracer: true } },
  ],
  camera: cam([166, 1.6, -40], [168.5, 2.5, -58], 46, 3),
  fxTime: 520,
  timeScale: 0,
};

// 49 — harbor kill: T-90A erupting at the whitewashed village crossing,
// fireball light on the walls, the Leclerc's silhouette holding the
// foreground corner. Dutch tilt.
SCENES['49_coastal_harbor_kill'] = {
  map: 'coastal',
  seed: 6149,
  actors: [
    { id: 'leclerc', name: 'fg', pos: [150, 78], facingDeg: 62, aimAt: [172, 96], gunDeg: 0.5, camo: 'naval', camoSeed: 491 },
    { id: 't90a', name: 'victim', pos: [172, 96], facingDeg: 244, turretDeg: 30, camo: 'factory' },
  ],
  effects: [
    { type: 'tank_kill', actor: 'victim', tMs: 112, params: { cause: 'ammorack', pop: true } },
    { type: 'dust', at: [154, 80], tMs: 340, params: { count: 10, intensity: 0.8, dirDeg: 240 } },
    { type: 'fire', actor: 'fg', tMs: 588, params: { slot: 0, tracer: true } },
  ],
  camera: cam([137, 3.6, 64], [164, 2.0, 90], 38, 4),
  fxTime: 612,
  timeScale: 0,
};

// 50 — dune-crest silhouette: AbramsX hull-down on the dune band firing
// over the crest, blast ring of sand, the Challenger burning below on the
// coast road. Camera low on the road looking up at the sky-lined hull.
SCENES['50_coastal_dune_ambush'] = {
  map: 'coastal',
  seed: 6150,
  actors: [
    { id: 'abramsx', name: 'crest', pos: [230, 50], facingDeg: 262, gunDeg: -5, turretDeg: 2, camo: 'desert', camoSeed: 501 },
    { id: 'challenger1', name: 'pyre', pos: [213, 45], facingDeg: 10, turretDeg: 55, state: 'turret-popped', stateAgeS: 180, burning: true },
  ],
  effects: [
    { type: 'engine_smoke', actor: 'pyre', tMs: 0 },
    { type: 'dust', at: [227, 49.5], tMs: 2530, params: { count: 16, intensity: 1.4, dirDeg: 262 } },
    { type: 'fire', actor: 'crest', tMs: 2872, params: { slot: 0, tracer: true } },
  ],
  camera: cam([203, 1.5, 51], [223, 2.8, 48], 46, -3),
  fxTime: 2900,
  timeScale: 0,
};

// 51 — seafront duel, super-telephoto: KF51 and M1A2 exchanging down the
// z=-52 shore road, both flashes lit in one 26° frame, the turquoise bay
// stacked behind.
SCENES['51_coastal_seafront_duel'] = {
  map: 'coastal',
  seed: 6151,
  actors: [
    { id: 'kf51', name: 'west', pos: [156, -52], facingDeg: 88, aimAt: [214, -50], gunDeg: 0.5, camo: 'tropic', camoSeed: 511 },
    { id: 'm1a2', name: 'east', pos: [214, -50], facingDeg: 268, aimAt: [156, -52], gunDeg: 0.5, camo: 'naval', camoSeed: 512 },
  ],
  effects: [
    { type: 'sparks', actor: 'west', tMs: 510, params: { caliberMm: 120, hFrac: 0.6 } },
    { type: 'fire', actor: 'east', tMs: 572, params: { slot: 0, tracer: true } },
    { type: 'fire', actor: 'west', tMs: 590, params: { slot: 0, tracer: true } },
  ],
  camera: cam([146, 3.4, -57], [216, 2.0, -49], 30, 0),
  fxTime: 615,
  timeScale: 0,
};

// -- AUTUMN (3) -----------------------------------------------------------------

// 52 — ford ambush: T-90M on the causeway taking a ricochet across the
// turret while the 2A5 fires from the gold treeline; burst off the water
// line behind.
SCENES['52_autumn_ford_ambush'] = {
  map: 'autumn',
  seed: 6152,
  actors: [
    { id: 't90m', name: 'forder', pos: [10, 8], facingDeg: 8, turretDeg: -58, gunDeg: 1, camo: 'autumn', camoSeed: 521 },
    { id: 'leo2a5', name: 'ambusher', pos: [-30, 30], facingDeg: 128, aimAt: [10, 8], gunDeg: 0.5, camo: 'flecktarn', camoSeed: 522 },
  ],
  effects: [
    { type: 'sparks', actor: 'forder', tMs: 530, params: { caliberMm: 120, hFrac: 0.75 } },
    { type: 'explosion', at: [20, 2], tMs: 180, params: { size: 'small' } },
    { type: 'dust', at: [9, 14], tMs: 320, params: { count: 10, intensity: 0.8, dirDeg: 190 } },
    { type: 'fire', actor: 'ambusher', tMs: 615, params: { slot: 0, tracer: true } },
  ],
  camera: cam([24, 1.6, -8], [0, 2.3, 18], 40, 3),
  fxTime: 640,
  timeScale: 0,
};

// 53 — gold inferno: AbramsX mid-ammo-rack among the orange broadleafs,
// fire against fall color, the Leclerc rolling past close across the lens.
SCENES['53_autumn_gold_inferno'] = {
  map: 'autumn',
  seed: 6153,
  actors: [
    { id: 'abramsx', name: 'victim', pos: [52, 58], facingDeg: 210, turretDeg: 15, camo: 'factory' },
    { id: 'leclerc', name: 'passer', pos: [30, 40], facingDeg: 66, turretDeg: 40, gunDeg: 0.5, camo: 'autumn', camoSeed: 531 },
  ],
  effects: [
    { type: 'tank_kill', actor: 'victim', tMs: 70, params: { cause: 'ammorack', pop: true } },
    { type: 'dust', at: [33, 42], tMs: 300, params: { count: 14, intensity: 1.2, dirDeg: 66 } },
    { type: 'fire', actor: 'passer', tMs: 590, params: { slot: 0, tracer: true } },
  ],
  camera: cam([18, 1.5, 30], [44, 2.6, 52], 44, -4),
  fxTime: 615,
  timeScale: 0,
};

// 54 — orchard stand: Challenger 1 firing between the farm fence lines,
// HE burst walking in behind it, leaves and dust kicked over the yard.
SCENES['54_autumn_orchard_stand'] = {
  map: 'autumn',
  seed: 6154,
  actors: [
    { id: 'challenger1', name: 'hero', pos: [-40, 30], facingDeg: 108, turretDeg: 0, gunDeg: 0.5, camo: 'dpm', camoSeed: 541 },
  ],
  effects: [
    { type: 'explosion', at: [-48, 38], tMs: 160, params: { size: 'medium' } },
    { type: 'dust', at: [-44, 26], tMs: 300, params: { count: 12, intensity: 1.0, dirDeg: 108 } },
    { type: 'firing_moment', actor: 'hero', tMs: 400, params: { ageS: 0.05 } },
  ],
  camera: cam([-34.5, 1.25, 24.5], [-42.5, 2.4, 32], 52, 3),
  fxTime: 400,
  timeScale: 0,
};

// -- STEPPE (3) -----------------------------------------------------------------

// 55 — horizon charge: echelon of three tearing through the feather grass
// head-on, dust wakes glowing, the lead gun firing over the lens. Camera
// buried in the grass.
SCENES['55_steppe_horizon_charge'] = {
  map: 'steppe',
  seed: 6155,
  actors: [
    { id: 't90a', name: 'lead', pos: [-100, -60], facingDeg: 184, turretDeg: 5, gunDeg: -1, camo: 'amoeba', camoSeed: 551 },
    { id: 't90m', name: 'w1', pos: [-86, -48], facingDeg: 190, turretDeg: -10, gunDeg: 1, camo: 'summer', camoSeed: 552 },
    { id: 'leo2a6', name: 'w2', pos: [-116, -46], facingDeg: 178, turretDeg: 12, gunDeg: 1, camo: 'dpm', camoSeed: 553 },
  ],
  effects: [
    { type: 'dust', at: [-100, -52], tMs: 260, params: { count: 20, intensity: 1.6, dirDeg: 4 } },
    { type: 'dust', at: [-86, -40], tMs: 320, params: { count: 14, intensity: 1.2, dirDeg: 10 } },
    { type: 'dust', at: [-116, -38], tMs: 300, params: { count: 14, intensity: 1.2, dirDeg: 358 } },
    { type: 'fire', actor: 'lead', tMs: 500, params: { slot: 0, tracer: true } },
  ],
  camera: cam([-101, 2.0, -84], [-100.5, 2.7, -58], 42, 3),
  fxTime: 525,
  timeScale: 0,
};

// 56 — khutor brawl: the whitewashed hamlet crossing — T-90A and 2A6
// closing on the SEPv2, medium burst between the crofts, dust rolling
// through the yard. Oblique drone.
SCENES['56_steppe_khutor_brawl'] = {
  map: 'steppe',
  seed: 6156,
  actors: [
    { id: 'm1a2_sepv2', name: 'holdout', pos: [34, 62], facingDeg: 252, aimAt: [-24, 44], gunDeg: 0.5, camo: 'desert', camoSeed: 561 },
    { id: 't90a', name: 'a1', pos: [-24, 44], facingDeg: 74, aimAt: [34, 62], gunDeg: 0.5, camo: 'amoeba', camoSeed: 562 },
    { id: 'leo2a6', name: 'a2', pos: [-2, 92], facingDeg: 142, aimAt: [34, 64], gunDeg: 0.5, camo: 'summer', camoSeed: 563 },
  ],
  effects: [
    { type: 'explosion', at: [10, 68], tMs: 150, params: { size: 'medium' } },
    { type: 'sparks', actor: 'holdout', tMs: 535, params: { caliberMm: 125, hFrac: 0.7 } },
    { type: 'fire', actor: 'a1', tMs: 605, params: { slot: 0, tracer: true } },
    { type: 'fire', actor: 'holdout', tMs: 620, params: { slot: 0, tracer: true } },
  ],
  camera: cam([-12, 16, 26], [16, 0, 64], 46, -5),
  fxTime: 645,
  timeScale: 0,
};

// 57 — windbreak snipe: Leclerc's muzzle poking out of a planted tree
// line, tracer streaking the full width of the frame to a fireball on the
// open plain. Side-on telephoto.
SCENES['57_steppe_windbreak_snipe'] = {
  map: 'steppe',
  seed: 6157,
  actors: [
    { id: 'leclerc', name: 'sniper', pos: [-114, -52], facingDeg: 92, aimAt: [-84, -56], gunDeg: 0.5, camo: 'dpm', camoSeed: 571 },
    { id: 't90m', name: 'victim', pos: [-84, -56], facingDeg: 275, turretDeg: 20, camo: 'factory' },
  ],
  effects: [
    { type: 'tank_kill', actor: 'victim', tMs: 112, params: { cause: 'ammorack', pop: true } },
    { type: 'fire', actor: 'sniper', tMs: 588, params: { slot: 0, tracer: true } },
  ],
  camera: cam([-99, 2.4, -75], [-99, 2.6, -54], 46, 0),
  fxTime: 612,
  timeScale: 0,
};

// -- RAILYARD (3) ----------------------------------------------------------------

// 58 — container gauntlet: AbramsX firing down the corridor between the
// container ranks, sparks screaming off the steel, T-90A erupting at the
// corridor's end under the cranes.
SCENES['58_railyard_container_gauntlet'] = {
  map: 'railyard',
  seed: 6158,
  actors: [
    { id: 'abramsx', name: 'gunner', pos: [-9, -64], facingDeg: 4, aimAt: [-8, -34], gunDeg: 0.5, camo: 'urbanblock', camoSeed: 581 },
    { id: 't90a', name: 'victim', pos: [-8, -34], facingDeg: 188, turretDeg: 15, camo: 'factory' },
  ],
  effects: [
    { type: 'tank_kill', actor: 'victim', tMs: 132, params: { cause: 'ammorack', pop: true } },
    { type: 'sparks', actor: 'gunner', tMs: 520, params: { caliberMm: 125, hFrac: 0.7 } },
    { type: 'dust', at: [-12, -58], tMs: 380, params: { count: 10, intensity: 0.9, dirDeg: 186 } },
    { type: 'fire', actor: 'gunner', tMs: 608, params: { slot: 0, tracer: true } },
  ],
  camera: cam([-24, 14, -76], [-7, 0, -42], 44, -6),
  fxTime: 632,
  timeScale: 0,
};

// 59 — gantry dive: near-vertical from crane height over the sidings —
// kill fireball punching up between the container ranks, the Leopard 2A7V
// crossing the tracks below through its own dust. Rolled frame.
SCENES['59_railyard_crane_dive'] = {
  map: 'railyard',
  seed: 6159,
  actors: [
    { id: 'leclerc', name: 'victim', pos: [66, 30], facingDeg: 350, turretDeg: -25, camo: 'digital', camoSeed: 591 },
    { id: 'leo2a7v', name: 'crosser', pos: [52, 18], facingDeg: 58, turretDeg: 30, gunDeg: 0.5, camo: 'urbanblock', camoSeed: 592 },
  ],
  effects: [
    { type: 'tank_kill', actor: 'victim', tMs: 75, params: { cause: 'ammorack', pop: true } },
    { type: 'dust', at: [55, 20], tMs: 300, params: { count: 16, intensity: 1.3, dirDeg: 58 } },
    { type: 'fire', actor: 'crosser', tMs: 585, params: { slot: 0, tracer: true } },
  ],
  camera: cam([57, 32, 19], [63.5, 0, 28.5], 44, 12),
  fxTime: 610,
  timeScale: 0,
};

// 60 — sodium dusk hero: KF51 on the tracks mid-firing-moment, muzzle star
// against the overcast, an M1A2 hull smoking between the warehouse rows
// behind. The set closer.
SCENES['60_railyard_sodium_dusk'] = {
  map: 'railyard',
  seed: 6160,
  actors: [
    { id: 'kf51', name: 'hero', pos: [-30, 30], facingDeg: 150, turretDeg: -20, gunDeg: 1, camo: 'washworn', camoSeed: 601 },
    { id: 'm1a2', name: 'pyre', pos: [-74, 46], facingDeg: 320, turretDeg: 40, state: 'wrecked-burnt', stateAgeS: 420, smoking: true },
  ],
  effects: [
    { type: 'engine_smoke', actor: 'pyre', tMs: 0 },
    { type: 'dust', at: [-33, 26], tMs: 2550, params: { count: 8, intensity: 0.7, dirDeg: 244 } },
    { type: 'firing_moment', actor: 'hero', tMs: 2800, params: { ageS: 0.05 } },
  ],
  camera: cam([-21, 1.3, 22], [-33, 2.5, 31.5], 48, -3),
  fxTime: 2800,
  timeScale: 0,
};

// ---------------------------------------------------------------------------

let n = 0;
for (const [name, scene] of Object.entries(SCENES)) {
  solveAims(scene);
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(scene, null, 2) + '\n');
  n++;
}
console.log(`[gen-scenes2] wrote ${n} scene(s) to ${OUT}`);
