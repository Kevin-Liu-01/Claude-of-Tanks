// tools/marketing-shots/gen-modern-showcase.mjs
//
// Authors the 30-image modern-fleet presentation set used by /home and /docs.
// Every frame is a deterministic Scene Studio capture of the current
// first-party procedural vehicle — never a reference GLB or generated artwork.
//
//   node tools/marketing-shots/gen-modern-showcase.mjs
//   node tools/marketing-shots/shoot.mjs \
//     --scenes tools/marketing-shots/scenes-modern \
//     --out shots/marketing-modern/raw --width 1600

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'scenes-modern');
mkdirSync(OUT, { recursive: true });

const FLEET = [
  ['abramsx', 'AbramsX', 'USA', 'Next-generation demonstrator'],
  ['m1a2_sepv3', 'M1A2 SEPv3', 'USA', 'Main battle tank'],
  ['m1a2_sepv2', 'M1A2 SEPv2', 'USA', 'Main battle tank'],
  ['m1a2_tusk', 'M1A2 TUSK', 'USA', 'Urban assault package'],
  ['m1a1ha', 'M1A1HA', 'USA', 'Heavy armor package'],
  ['leo2a7v', 'Leopard 2A7V', 'Germany', 'Main battle tank'],
  ['leo2_revolution', 'Leopard 2 Revolution', 'Germany', 'Modular protection demonstrator'],
  ['leo2a6', 'Leopard 2A6', 'Germany', 'Main battle tank'],
  ['kf51', 'KF51 Panther', 'Germany', 'Next-generation demonstrator'],
  ['challenger_3', 'Challenger 3', 'United Kingdom', 'Main battle tank'],
  ['challenger2', 'Challenger 2', 'United Kingdom', 'Main battle tank'],
  ['leclerc', 'Leclerc', 'France', 'Main battle tank'],
  ['ariete', 'C1 Ariete', 'Italy', 'Main battle tank'],
  ['merkava3d', 'Merkava Mk.3D', 'Israel', 'Main battle tank'],
  ['k2', 'K2 Black Panther', 'South Korea', 'Main battle tank'],
  ['k1a1', 'K1A1', 'South Korea', 'Main battle tank'],
  ['t14', 'T-14 Armata', 'Russia', 'Next-generation main battle tank'],
  ['t90m', 'T-90M Proryv', 'Russia', 'Main battle tank'],
  ['t90ms', 'T-90MS', 'Russia', 'Export main battle tank'],
  ['t90sm', 'T-90SM', 'Russia', 'Modernized main battle tank'],
  ['t90a_burlak', 'T-90A Burlak', 'Russia', 'Prototype turret program'],
  ['t80u', 'T-80U', 'Russia', 'Gas-turbine main battle tank'],
  ['t72b3m', 'T-72B3M', 'Russia', 'Modernized main battle tank'],
  ['t84', 'T-84 Oplot', 'Ukraine', 'Main battle tank'],
  ['type99a', 'Type 99A', 'China', 'Main battle tank'],
  ['type10', 'Type 10', 'Japan', 'Main battle tank'],
  ['type90', 'Type 90', 'Japan', 'Main battle tank'],
  ['pt91m', 'PT-91M', 'Poland', 'Modernized main battle tank'],
  ['spz_puma', 'Puma IFV', 'Germany', 'Infantry fighting vehicle'],
  ['fv510', 'FV510 Warrior', 'United Kingdom', 'Infantry fighting vehicle'],
];

// Stages are proven-flat compositions from the existing marketing rigs. The
// camera stays close enough to read fittings and armor form without clipping
// long barrels. `groundRel` keeps the frame stable across procedural terrain.
const STAGES = [
  { map: 'desert', pos: [0, 0], facing: 205, turret: -3, cam: [5.9, 1.25, -9.4], look: [-1.4, 2.4, 1.8], fov: 48, camo: 'desert' },
  { map: 'winter', pos: [162, -78], facing: 205, turret: -3, cam: [168.2, 1.15, -87.6], look: [161, 2.35, -77], fov: 50, camo: 'winter' },
  { map: 'urban', pos: [36, 60], facing: 180, turret: 3, cam: [44.6, 1.05, 52], look: [34, 2.45, 61], fov: 51, camo: 'urbanblock' },
  { map: 'coastal', pos: [168, -54], facing: 330, turret: -5, cam: [166, 1.1, -43], look: [168.5, 2.45, -56], fov: 52, camo: 'digital' },
  { map: 'autumn', pos: [-40, 30], facing: 108, turret: 3, cam: [-34.5, 1.1, 24.5], look: [-42.5, 2.4, 32], fov: 54, camo: 'dpm' },
  { map: 'steppe', pos: [-100, -60], facing: 150, turret: 3, cam: [-101, 1.05, -69.5], look: [-100, 2.45, -59.5], fov: 52, camo: 'summer' },
  { map: 'railyard', pos: [-30, 30], facing: 195, turret: -5, cam: [-20, 1.15, 20], look: [-30, 2.45, 30], fov: 49, camo: 'washworn' },
  { map: 'verdant', pos: [-80, 30], facing: 200, turret: 3, cam: [-73, 1.1, 19], look: [-80, 2.45, 30], fov: 47, camo: 'summer' },
];

// Each portrait has a deliberately different combat pose. The previous set
// kept every turret within 5 degrees of the hull and every gun within 1
// degree of level, which made thirty distinct vehicles read like the same
// parked catalog shot. These values stay inside (or are truthfully clamped by)
// the vehicle's authored Studio limits while spanning broad search arcs,
// ridge-line depression, and high-angle elevation.
const POSES = [
  { turret: -42, gun: -6, label: 'ridge-down' },
  { turret: 58, gun: 12, label: 'high-right' },
  { turret: -74, gun: 5, label: 'left-search' },
  { turret: 82, gun: -5, label: 'right-ridge' },
  { turret: -96, gun: 10, label: 'rear-left-high' },
  { turret: 34, gun: -7, label: 'hull-down-right' },
  { turret: 108, gun: 13, label: 'rear-right-high' },
  { turret: -55, gun: -4, label: 'left-depression' },
  { turret: 70, gun: 4, label: 'right-sweep' },
  { turret: -30, gun: 11, label: 'left-elevation' },
  { turret: 94, gun: -6, label: 'rear-right-down' },
  { turret: -68, gun: 8, label: 'left-high' },
  { turret: 46, gun: -5, label: 'right-depression' },
  { turret: -112, gun: 13, label: 'rear-left-sky' },
  { turret: 62, gun: -7, label: 'right-hull-down' },
  { turret: -24, gun: 6, label: 'left-cover' },
  { turret: 78, gun: -4, label: 'right-cover' },
  { turret: -86, gun: 12, label: 'rear-left-elevation' },
  { turret: 40, gun: -7, label: 'right-ridge-down' },
  { turret: -104, gun: 4, label: 'rear-left-sweep' },
  { turret: 54, gun: 13, label: 'right-skyline' },
  { turret: -62, gun: -5, label: 'left-ridge-down' },
  { turret: 98, gun: 9, label: 'rear-right-elevation' },
  { turret: -36, gun: -7, label: 'left-hull-down' },
  { turret: 72, gun: 3, label: 'right-contact' },
  { turret: -90, gun: 11, label: 'rear-left-high' },
  { turret: 28, gun: -5, label: 'right-ridge' },
  { turret: -78, gun: 7, label: 'left-overwatch' },
  { turret: 88, gun: -7, label: 'rear-right-down' },
  { turret: -48, gun: 10, label: 'left-skyline' },
];

if (POSES.length !== FLEET.length) {
  throw new Error(`pose count ${POSES.length} must match fleet count ${FLEET.length}`);
}

const manifest = [];

for (let index = 0; index < FLEET.length; index += 1) {
  const [id, name, nation, role] = FLEET[index];
  const number = String(index + 1).padStart(2, '0');
  const stage = STAGES[index % STAGES.length];
  const pose = POSES[index];
  const slug = `${number}_${id}`;
  const actionMode = index % 5;
  const firing = actionMode === 0 || actionMode === 2;
  const actor = {
    id,
    name: 'hero',
    pos: stage.pos,
    facingDeg: stage.facing,
    turretDeg: pose.turret,
    gunDeg: pose.gun,
    camo: stage.camo,
    camoSeed: 8300 + index,
  };
  const effects = [
    {
      type: 'dust',
      at: [stage.pos[0] - 1.5, stage.pos[1] - 4],
      tMs: 30,
      params: { count: 9, intensity: 0.72, dirDeg: stage.facing },
    },
  ];
  if (actionMode === 0) {
    effects.push(
      { type: 'explosion_moment', at: [stage.pos[0] - 7, stage.pos[1] + 8], tMs: 70, params: { ageS: 0.42 } },
      { type: 'firing_moment', actor: 'hero', tMs: 240, params: { ageS: 0.055 } },
    );
  } else if (actionMode === 1) {
    effects.push(
      { type: 'armor_scar', actor: 'hero', tMs: 55, params: { count: 3, caliberMm: 120, seedDeg: 40 + index } },
      { type: 'explosion_moment', at: [stage.pos[0] + 7, stage.pos[1] + 6], tMs: 95, params: { ageS: 0.3 } },
      { type: 'sparks', actor: 'hero', tMs: 235, params: { caliberMm: 125, hFrac: 0.7 } },
    );
  } else if (actionMode === 2) {
    effects.push(
      { type: 'barrage', at: [stage.pos[0] - 9, stage.pos[1] + 9], tMs: 40, params: { count: 4, radiusM: 7, size: 'mixed', seedDeg: 70 + index } },
      { type: 'firing_moment', actor: 'hero', tMs: 270, params: { ageS: 0.06 } },
    );
  } else if (actionMode === 3) {
    effects.push(
      { type: 'explosion_moment', at: [stage.pos[0] + 6, stage.pos[1] + 8], tMs: 75, params: { ageS: 0.5 } },
      { type: 'mg_burst', actor: 'hero', tMs: 150, params: { count: 8, gapM: 5, spreadDeg: 0.7, caliberMm: 12.7, speedMps: 900 } },
      { type: 'sparks', actor: 'hero', tMs: 250, params: { caliberMm: 120, hFrac: 0.58 } },
    );
  } else {
    effects.push(
      { type: 'exhaust', actor: 'hero', tMs: 110, params: { count: 8, intensity: 0.65, sooty: true } },
      { type: 'armor_scar', actor: 'hero', tMs: 180, params: { count: 2, caliberMm: 90, seedDeg: 90 + index } },
    );
  }

  const cameraPos = [...stage.cam];
  // Look down on depressed guns so their angle reads against the hull roof;
  // stay low under elevated guns so the silhouette opens against the sky.
  cameraPos[1] += pose.gun < -2
    ? 1.35
    : pose.gun > 7
      ? -0.25
      : actionMode === 2
        ? 0.65
        : actionMode === 3
          ? -0.15
          : 0;
  const cameraLook = [...stage.look];
  cameraLook[1] += pose.gun > 7 ? 0.45 : pose.gun < -2 ? 0.12 : 0;

  const scene = {
    map: stage.map,
    seed: 8300 + index,
    meta: {
      id, name, nation, role, number: index + 1,
      pose: pose.label, turretDeg: pose.turret, gunDeg: pose.gun,
    },
    actors: [actor],
    effects,
    camera: {
      pos: cameraPos,
      lookAt: cameraLook,
      groundRel: true,
      fov: stage.fov
        + (pose.gun < -2 ? 3 : pose.gun > 7 ? 2 : 0)
        + (Math.abs(pose.turret) > 90 ? 2 : 0)
        + (actionMode === 2 ? -2 : actionMode === 3 ? 2 : 0),
      rollDeg: actionMode === 1 ? -2.5 : actionMode === 2 ? 3 : actionMode === 3 ? -3.5 : 0,
      mode: 'fly',
    },
    fxTime: actionMode === 2 ? 295 : 280,
    timeScale: 0,
  };

  writeFileSync(join(OUT, `${slug}.json`), `${JSON.stringify(scene, null, 2)}\n`);
  manifest.push({
    slug, id, name, nation, role, map: stage.map,
    pose: pose.label, turretDeg: pose.turret, gunDeg: pose.gun,
  });
}

writeFileSync(join(HERE, 'modern-showcase-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[gen-modern-showcase] wrote ${FLEET.length} scenes and manifest to ${OUT}`);
