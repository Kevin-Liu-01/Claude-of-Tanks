// Media r5 "Lineup" reveals: each of the newest main battle tanks alone on a home battlefield,
// a slow low orbit while the turret comes round — the beat-cut lineup teaser and trailer inserts.
//   node tools/media-r5/reveal.mjs <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildShot, dust, exhaust, flare, fireField, H } from './setups.mjs';
import { T, pictureFor, setById, RIG, LIGHT_READY, sunFor } from './sets.mjs';
import { CAST, CAST_NAMES } from './cast.mjs';

// [id, tank, set, orbit from->to, extra]
export const REVEALS = [
  ['x01-ztz100', CAST.ztz100, 'monsoon-morning-ford', [30, 52]],
  ['x02-kf51', CAST.kf51, 'glacier-dawn-lake', [-40, -18]],
  ['x03-leclerc', CAST.leclerc, 'redrock-golden-canyon', [28, 50]],
  ['x04-sepv3', CAST.sepv3, 'kestrel-dawn-runway', [-32, -12]],
  ['x05-leo2a7v', CAST.leo, 'steinburg-night-street', [-12, 12], { radius: 12 }],
  ['x06-t90m', CAST.t90m, 'verdant-day-assault', [-36, -14]],
  ['x07-ariete', CAST.ariete, 'saltwind-day-harbor', [30, 52]],
  ['x08-t14', CAST.t14, 'ironworks-night-yard', [-34, -12]],
  ['x09-k2', CAST.k2, 'amberford-golden-ford', [30, 50]],
  ['x10-type10', CAST.type10, 'saltmere-sunset-strand', [-30, -10]],
  ['x11-merkava', CAST.merkava, 'sirocco-noon-village', [32, 54]],
  ['x12-t72b3m', CAST.t72b3m, 'frosthollow-night-village', [-32, -12]],
];

export function revealScene([id, tank, setId, [o0, o1], opt = {}]) {
  const set = setById(setId);
  const base = { ...set, lineup: [tank], formation: 'solo', count: 1, enemies: null, turret: 0,
    time: T(set.time), picture: pictureFor(set, set.time === 'night' ? { exposure: 0.4 } : {}), light: set.light };
  // night reveals bring their own practical light: a flare overhead and a fire off the camera side
  const night = set.time === 'night' ? [flare(H(-10, 30), 0, { heightM: 70, burnS: 40, intensity: 1.3, driftMps: 0.6 }), fireField(H(o0 + o1 > 0 ? 9 : -9, 7), 0, { radiusM: 2.5 })] : [];
  const scene = buildShot(base, { durMs: 2600, speed: 0, turretSweep: o0 + o1 > 0 ? -14 : 14, effects: [exhaust('hero', 100), ...night],
    cam: RIG.orbit({ radius: opt.radius ?? 11.5, from: o0, to: o1, lift: 0.85, fov: 30, look: [0, 0.6, 1.5] }) });
  if (set.autoPlace === false) scene.autoPlace = false;
  if (set.allowWater) for (const a of scene.actors) a.allowWater = true;
  const az = LIGHT_READY ? sunFor(scene, 135, set.time) : null; // reveals: front-side key light (sun behind the lens, off to one side) where the sun is low
  if (az != null && ['dawn', 'golden', 'sunset', 'morning'].includes(set.time)) scene.light = { ...(scene.light ?? {}), sunAzimuthDeg: az };
  scene.meta = { reveal: id, tank, name: CAST_NAMES[tank][0], nation: CAST_NAMES[tank][1], set: setId, map: set.map, time: set.time };
  return scene;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] ?? 'shots/media-r5/reveal-scenes';
  mkdirSync(out, { recursive: true });
  for (const r of REVEALS) writeFileSync(join(out, `${r[0]}.json`), JSON.stringify(revealScene(r), null, 1));
  console.log(`${REVEALS.length} reveals -> ${out} (light ${LIGHT_READY ? 'ready' : 'fallback'})`);
}
