#!/usr/bin/env node
// "Site fifty" (owner ask 2026-10-02): fifty new shots of tanks, battles and battlefields for the public site.
// Each shot is ONE continuous take of LOOP_MS + XFADE_MS (no cuts, unlike the current six-second rails that jump at
// the wrap): site-loops.mjs crossfades the tail into the head for a seamless loop, and the same scene renders a 4K
// still at its best moment. Shots reuse the staged sets (sets.mjs) or define their own on battlefields the earlier
// rounds never filmed. One-shot events (fire, kills) stay inside the loop body, clear of the crossfade window.
//   MEDIA_R5_LIGHT=1 node tools/media-r5/site50.mjs [outDir=shots/media-r5/site50/scenes] [ids,...]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildShot, fire, kill, pen, burn, smoke, boom as blast, dust, mg, barrage, exhaust, flare, embers, debris, fireField, huge as hugeBlast, H } from './setups.mjs';
import { setById, T, pictureFor, LIGHT_READY, sunFor, RIG } from './sets.mjs';
import { CAST, CAST_NAMES } from './cast.mjs';
import { blockedFraction } from './camera-clearance.mjs';
import { absoluteShots, stillMoments } from './lens-check.mjs';
import { sampleActorTrack, sampleCameraRail } from '../../src/game/studioTimeline.ts';
import { choreograph } from './turret-choreo.mjs';
import { SHOTS as SHOTS_DIR } from './paths.mjs';
import { worldModel } from './world-model.mjs';
import { hullOf, waterBlocks } from './route-check.mjs';

export const LOOP_MS = 6000, XFADE_MS = 600, DUR = LOOP_MS + XFADE_MS;
/** A site still's longest exposure (ms): crisp at round six's camera speeds (siteScene). */
export const STILL_EXPOSURE_MS = 2;
export const KINDS = Object.freeze(['tank', 'battle', 'scene']);
/** The site lens: a touch of streak; deep focus and no fringe (sets.mjs pictureFor), crisp edge to edge. */
const SITE_LENS = { streaks: { amount: 0.22, length: 0.6 } };
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
const stage = (id, map, time, seed, anchor, heading, more = {}) => ({ id, map, time, seed, anchor, heading, camo: 'factory', picture: CLEAN, ...more });
const from = (setId, more = {}) => ({ ...setById(setId), picture: CLEAN, ...more });
const DESERT_DAY = { ...CLEAN, exposure: -0.4, contrast: 1.12 };
const pair = (a, b, states = ['burning', 'intact'], more = {}) => ({ along: 74, lat: 2, count: 2, formation: 'pair', lineup: [a, b], states, ...more });

const S = {
  // Steinburg (PR #9's town plan): the ring road (x = -200 / 50, z = -75 / 75), the cross streets (x = -50, z = 0)
  // and the highways out of town
  stMain: stage('steinburg-day-main', 'urban', 'day', 501, [-150, 0], 90, { formation: 'column', lineup: [CAST.leo2a6, CAST.puma, CAST.leo2a6], count: 3, enemies: pair(CAST.t72b3, CAST.t80u, ['burning', 'intact'], { along: 80, lat: -2 }) }),
  stWest: stage('steinburg-day-west', 'urban', 'day', 502, [-150, -75], 90, { formation: 'pair', lineup: [CAST.kf51, CAST.lynx], enemies: pair(CAST.t80u, CAST.t90a, ['intact', 'wrecked-burnt'], { along: 70 }) }),
  stCross: from('steinburg-day-crossroads', { anchor: [-50, -60], heading: 0, lineup: [CAST.strv122, CAST.leo2a5], enemies: { along: 70, lat: 4, count: 2, formation: 'pair', lineup: [CAST.t72b, CAST.t72b3], states: ['wrecked-burnt', 'burning'] } }),
  stEast: stage('steinburg-day-east', 'urban', 'day', 503, [-200, 30], 180, { formation: 'column', lineup: [CAST.tusk, CAST.sepv2, CAST.griffin], count: 3, enemies: pair(CAST.t72b3m, CAST.t90a, ['burning', 'intact'], { along: 84, lat: -3 }) }),
  stSouth: stage('steinburg-day-south', 'urban', 'day', 504, [-50, 35], 180, { formation: 'pair', lineup: [CAST.leo2a6m, CAST.amx56], enemies: pair(CAST.t90a, CAST.t72b, ['intact', 'burning'], { along: 64, lat: 1 }) }),
  // the ring road's south side, east-bound, with the wrecks strung down the street (on the north highway the column's tail
  // stood in the wood south of town, and a line abreast put a wreck into the houses here; review 2026-10-05)
  stRing: stage('steinburg-day-ring', 'urban', 'day', 505, [-140, 75], 90, { formation: 'column', lineup: [CAST.amx56, CAST.leclerc, CAST.amx56], count: 3,
    enemies: { along: 40, lat: 0, count: 3, formation: 'column', spread: 1.2, lineup: [CAST.t72b3, CAST.t80u, CAST.t72bu], states: ['wrecked-burnt', 'burning', 'burning'] } }),
  stSquare: stage('steinburg-day-square', 'urban', 'day', 506, [-30, 0], 270, { formation: 'pair', lineup: [CAST.leclerc, CAST.lynx], enemies: pair(CAST.t90, CAST.t72b3, ['burning', 'wrecked-burnt'], { along: 78, lat: 3 }) }),
  // Verdant Fields: the country road and the farm village (the Open Graph battlefield)
  vRoad: stage('verdant-day-road', 'verdant', 'day', 511, [-64, 61.6], 82, { formation: 'column', lineup: [CAST.t90m, CAST.t90a, CAST.t72b3m], count: 3,
    enemies: { along: 86, lat: -26, count: 3, formation: 'line', spread: 0.6, lineup: ['leo2a6_x', 'm1a2_x', 'leo2a5_x'], states: ['burning', 'intact', 'wrecked-burnt'] } }),
  vAssault: from('verdant-day-assault', { anchor: [-124, 58], heading: 75, lineup: [CAST.t90sm, CAST.t14, CAST.t90ms, CAST.obj695, CAST.kurganets] }),
  vVillage: stage('verdant-day-village', 'verdant', 'day', 512, [19.3, 48], 1, { formation: 'pair', lineup: [CAST.t14, CAST.t90m], enemies: pair(CAST.leo2a6m, CAST.sepv2, ['wrecked-burnt', 'intact'], { along: 80, lat: 3 }) }),
  vFarm: stage('verdant-day-farm', 'verdant', 'day', 513, [6.7, -64], 191, { formation: 'pair', lineup: [CAST.kf51, CAST.leo], enemies: pair(CAST.t90sm, CAST.t72b3m, ['burning', 'intact'], { along: 82, lat: -4 }) }),
  // Glacier Pass: the frozen lake and the alpine village
  gLake: from('glacier-dawn-lake', { time: 'day', count: 3, lineup: [CAST.strv122, CAST.cv9040, CAST.strv122], enemies: pair(CAST.t80u, CAST.t72bu, ['intact', 'burning'], { along: 78, lat: 8 }) }),
  gVillage: stage('glacier-day-village', 'alpine', 'day', 521, [-138, 147], 110, { formation: 'pair', lineup: [CAST.leo2a5, CAST.cv90105], enemies: pair(CAST.t72b, CAST.t80u, ['burning', 'intact'], { along: 74, lat: -3 }) }),
  // Sunscar Oasis: the minaret, the market street and the caravanserai
  oMinaret: stage('sunscar-day-minaret', 'oasis', 'day', 437, [92, 80], 261, { formation: 'pair', lineup: [CAST.merkava3d, CAST.sabra], picture: DESERT_DAY, enemies: pair(CAST.t72b, CAST.t62, ['burning', 'intact'], { along: 74, lat: 3 }) }),
  oMarket: stage('sunscar-day-market', 'oasis', 'day', 531, [82.8, -70.5], 93, { formation: 'column', lineup: [CAST.m1a2, CAST.tusk, CAST.m1a2], count: 3, picture: DESERT_DAY,
    enemies: pair(CAST.t62, CAST.t72b, ['wrecked-burnt', 'intact'], { along: 84, lat: -2 }) }),
  oCaravan: stage('sunscar-day-caravanserai', 'oasis', 'day', 532, [155.1, -71], 69, { formation: 'pair', lineup: [CAST.merkava, CAST.merkava3d], picture: DESERT_DAY, enemies: pair(CAST.t62, CAST.t72b, ['intact', 'burning'], { along: 62, lat: 2 }) }),
  // Nordhavn Fjord: the village, the harbor road and the north road (inland: the shore's border stays out of frame)
  fVillage: stage('nordhavn-day-village', 'fjord', 'day', 541, [-23.7, -87.7], 198, { formation: 'pair', lineup: [CAST.strv122, CAST.cv9040], enemies: pair(CAST.t90, CAST.t72b3, ['burning', 'intact'], { along: 74, lat: 2 }) }),
  fHarbor: stage('nordhavn-day-harbor', 'fjord', 'day', 542, [21.7, 59.2], 14, { formation: 'column', lineup: [CAST.leo, CAST.cv90105, CAST.leo], count: 3, enemies: pair(CAST.t90a, CAST.t80u, ['wrecked-burnt', 'intact'], { along: 90, lat: -6 }) }),
  fNorth: stage('nordhavn-day-north', 'fjord', 'day', 543, [62, 226], 188, { formation: 'pair', lineup: [CAST.leo2a5m, CAST.cv90], enemies: pair(CAST.t90, CAST.t72b3, ['intact', 'burning'], { along: 66, lat: 0 }) }),
  // Monsoon Ridge: the river ford and the temple village
  mFord: from('monsoon-morning-ford', { enemies: pair(CAST.t72b3m, CAST.t90m, ['burning', 'intact'], { along: 72, lat: 6 }) }),
  // the K21 pulls in 4 m from the pair slot, whose centre stood on the chapel's wall line (review 2026-10-05)
  mVillage: stage('monsoon-morning-village', 'monsoon', 'morning', 551, [24, 30], 8, { formation: [[0, 0], [7, -8]], lineup: [CAST.k1a1, CAST.k21], enemies: pair(CAST.t72b3, CAST.t72b, ['burning', 'intact'], { along: 70, lat: 2 }) }),
  // Cinder Junction: the tracks, the container rows and the water tower
  rTracks: from('cinder-dusk-tracks', { anchor: [58.3, 68.3], heading: 88, time: 'golden', lineup: [CAST.sepv3, CAST.sepv3, CAST.sepv3, CAST.griffin], count: 3, enemies: pair(CAST.t90m, CAST.t72b3m, ['burning', 'intact'], { along: 92, lat: 0 }) }),
  rYard: stage('cinder-day-yard', 'railyard', 'day', 561, [-27, -42], 21, { formation: 'column', lineup: [CAST.challenger1, CAST.warrior, CAST.challenger1], count: 3, enemies: pair(CAST.t72b, CAST.t80u, ['wrecked-burnt', 'intact'], { along: 80, lat: 3 }) }),
  rFactory: stage('cinder-day-factory', 'railyard', 'day', 562, [-75, -69], 88, { formation: 'pair', lineup: [CAST.abramsUA, CAST.sepv2], enemies: pair(CAST.t72b3m, CAST.t90m, ['burning', 'intact'], { along: 76, lat: 0 }) }),
  // Ironworks: the furnace yard and the gantry road
  iYard: from('ironworks-night-yard', { time: 'day', enemies: { along: 86, lat: 0, count: 3, formation: 'line', spread: 0.6, lineup: ['leo2a6_x', 'm1a2_x', 'leo2a5_x'], states: ['burning', 'wrecked-burnt', 'intact'] } }),
  iGantry: stage('ironworks-day-gantry', 'foundry', 'day', 571, [7.4, 61.8], 119, { formation: 'column', lineup: [CAST.t90ms, CAST.obj695, CAST.t90ms], count: 3, enemies: pair(CAST.leo2a6, CAST.m1a2, ['burning', 'intact'], { along: 80, lat: 2 }) }),
  // Frontier Basin: the farm village and the red-roofed farm
  frVillage: stage('frontier-morning-village', 'frontier', 'morning', 581, [3, 25.5], 93, { formation: 'pair', lineup: [CAST.type90, CAST.type89], enemies: pair(CAST.t90m, CAST.t72b3m, ['intact', 'burning'], { along: 72, lat: -2 }) }),
  frFarm: stage('frontier-golden-farm', 'frontier', 'golden', 435, [36, 105.3], 11, { formation: 'pair', lineup: [CAST.k2, CAST.type10], count: 1 }),
  // Jade River Delta: the river village
  dVillage: stage('jade-morning-village', 'delta', 'morning', 434, [24, 42], 106, { formation: 'column', lineup: [CAST.ztz100, CAST.type96b, CAST.ztz100], count: 3, enemies: pair(CAST.t72b3m, CAST.t90m, ['burning', 'intact'], { along: 80, lat: 0 }) }),
  // Frosthollow: the onion-domed church and the terrace village
  wChurch: stage('frosthollow-day-church', 'winter', 'day', 591, [-78, -13.3], 4, { formation: 'pair', lineup: [CAST.t90vladimir, CAST.t72bu], enemies: pair(CAST.leo2a6, CAST.m1a2, ['intact', 'burning'], { along: 72, lat: 2 }) }),
  wVillage: from('frosthollow-night-village', { anchor: [-80, -100], heading: 0, time: 'day', lineup: [CAST.t80u, CAST.t72bu, CAST.t80u], enemies: pair(CAST.leo2a5, CAST.challenger1, ['burning', 'wrecked-burnt'], { along: 96, lat: -4 }) }),
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

/**
 * Bursts off the sightline (composition wave c1, 2026-10-07: dust and fire buried the hero in S04, S07, S17, S39 and S50).
 * The placed bursts were set for each set's first, standing staging; a routed hull now drives past them, and some land
 * between the lens and the hull. A placed explosion or barrage (no actor) whose spread reaches in front of the hull on
 * the lens's line at its moment (the barrage's midpoint) is reflected through the hull along that line, landing as far
 * behind it, clear of its own radius, the same distance to the side; its own debris and dust (placed within 3 m of it and
 * within 300 ms after it, as hitNear lays them) move with it. Returns how many moved.
 */
function clearBursts(scene, world) {
  const shots = absoluteShots(scene, world), hero = scene.storyboard?.actorTracks?.find((t) => t.actor === 'hero')?.keys;
  if (!shots.length || !hero?.length) return 0;
  const cam = {}, pose = {};
  let moved = 0;
  for (const e of scene.effects ?? []) {
    if (e.actor || !Array.isArray(e.at) || !/^(explosion|barrage)$/.test(e.type ?? '')) continue;
    const t = (e.tMs ?? 0) + (e.params?.durationS ?? 0) * 500;
    if (!sampleCameraRail(shots, t, cam) || !sampleActorTrack(hero, t, pose)) continue;
    const dx = pose.x - cam.x, dz = pose.z - cam.z, L = Math.hypot(dx, dz);
    if (L < 1) continue;
    const ux = dx / L, uz = dz / L, r = e.params?.radiusM ?? 0;
    const along = (e.at[0] - cam.x) * ux + (e.at[1] - cam.z) * uz, side = -(e.at[0] - cam.x) * uz + (e.at[1] - cam.z) * ux;
    const reach = r + (/huge|large/.test(e.params?.size ?? '') ? 12 : 8);
    if (along - r >= L || Math.abs(side) >= reach || along + r <= 0) continue;
    const back = L + Math.min(40, Math.max(8, L - along) + r), from = e.at;
    e.at = [+(cam.x + ux * back - uz * side).toFixed(2), +(cam.z + uz * back + ux * side).toFixed(2)];
    const dx2 = e.at[0] - from[0], dz2 = e.at[1] - from[1];
    for (const c of scene.effects) {
      if (c === e || c.actor || !Array.isArray(c.at) || !/^(debris|dust|shockwave)$/.test(c.type ?? '')) continue;
      if (c.tMs < (e.tMs ?? 0) || c.tMs > (e.tMs ?? 0) + 300 || Math.hypot(c.at[0] - from[0], c.at[1] - from[1]) > 3) continue;
      c.at = [+(c.at[0] + dx2).toFixed(2), +(c.at[1] + dz2).toFixed(2)];
    }
    moved++;
  }
  return moved;
}
/**
 * Action beats (composition wave c4, 2026-10-08: most of the critics' frames were drive-bys, "a tank driving with no shot,
 * target or hit"; over waves c2-c3 a burst in the frame lifted a frame's staging from 4.56 to 6.25). At each third of the
 * loop (BEAT_MS), unless a burst is already live in the frame (from its start to 1.2 s on), an incoming round lands where
 * the lens shows it: a live foe fires, and the shell bursts 0.45 s before the beat ahead of the hero's gun on screen (its
 * lead room first, the other side after), 12-28 m beyond the hull and 3.5-13 m to its side: on dry open ground, clear of
 * the hull's box on screen, off the lens's line (so the stills' burst rule, the hull's reach and the lens's line, holds).
 * Its debris follows; the film's sound places it as any burst. Returns the number of beats added.
 */
export const BEAT_MS = [1400, 3300, 5100];
const DUST_MS = 1500, DUST_R = 8;
// wave s3 (2026-10-09): both critics preferred the frames with a staged burst (Opus 14 of 19 pairs, 8 of 9 at the beat;
// Sonnet 19 of 19), and Opus marked one down where it stacked on the hero's own muzzle blast (S37), sat behind the turret
// once the lens had moved (S13), crowded another tank (S09) or left its column cut by the frame's corner (S05)
const SHOT_CLEAR_MS = [150, 500], FIREBALL_MS = 500, EDGE = { x: 0.78, y: 0.6 }, EDGE_LOOSE = { x: 0.8, y: 0.75 }, OTHER_DX = 0.12;
const BURST_TYPES = /^(explosion|barrage|tank_kill)$/;
/** The lens at `t` as a projection to the frame's -1..1 (null behind the lens), or null with no rail there. */
function lensAt(shots, t) {
  const cam = {};
  if (!sampleCameraRail(shots, t, cam)) return null;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const f = [cam.lookX - cam.x, cam.lookY - cam.y, cam.lookZ - cam.z], fl = Math.hypot(...f) || 1, fw = f.map((v) => v / fl);
  const rl = Math.hypot(fw[2], fw[0]) || 1, right = [-fw[2] / rl, 0, fw[0] / rl];
  const up = [right[1] * fw[2] - right[2] * fw[1], right[2] * fw[0] - right[0] * fw[2], right[0] * fw[1] - right[1] * fw[0]];
  const ty = Math.tan((cam.fov ?? 40) * Math.PI / 360), tx = ty * 16 / 9;
  return { cam, right, screen: (q) => { const d = [q[0] - cam.x, q[1] - cam.y, q[2] - cam.z], depth = dot(d, fw); return depth > 0.5 ? { x: dot(d, right) / depth / tx, y: dot(d, up) / depth / ty } : null; } };
}
/** Where an effect stands at `t`: its placed point, or its actor's on the timeline. */
function effectAt(scene, e, t) {
  if (Array.isArray(e.at)) return [e.at[0], e.at[1]];
  const keys = e.actor && scene.storyboard?.actorTracks?.find((k) => k.actor === e.actor)?.keys, q = {};
  if (keys?.length && sampleActorTrack(keys, t, q)) return [q.x, q.z];
  return scene.actors.find((x) => x.name === e.actor)?.pos ?? null;
}
/** The beats a take's frame carries: at each of BEAT_MS, whether a burst (from its start to 1.2 s on) is in the frame. */
export function beatCoverage(scene, world) {
  const shots = absoluteShots(scene, world);
  return BEAT_MS.map((T) => {
    const lens = lensAt(shots, T);
    return !!lens && (scene.effects ?? []).some((e) => {
      if (!BURST_TYPES.test(e.type) || e.tMs > T || e.tMs < T - 1200) return false;
      const p = effectAt(scene, e, T), q = p && lens.screen([p[0], world.heightAt(p[0], p[1]) + 2, p[1]]);
      return !!q && Math.abs(q.x) <= 0.9 && Math.abs(q.y) <= 0.9;
    });
  });
}
function stageBeats(scene, world) {
  const shots = absoluteShots(scene, world), heroKeys = scene.storyboard?.actorTracks?.find((t) => t.actor === 'hero')?.keys;
  const heroActor = scene.actors.find((a) => a.name === 'hero');
  if (!shots.length || !heroKeys?.length || !heroActor) return 0;
  const [hl, hw, reach = hl + 2.4] = hullOf(heroActor.id);
  const deadBy = (name, t) => scene.effects.some((e) => e.actor === name && e.tMs <= t && /^(tank_kill|burning)$/.test(e.type));
  const covered = beatCoverage(scene, world);
  const heroShots = scene.effects.filter((e) => e.type === 'fire' && e.actor === 'hero').map((e) => e.tMs);
  // the hull's box on screen (its x span) for a lens and a pose
  const hullSpan = (screen, p) => {
    const yaw = (p.facingDeg ?? 0) * Math.PI / 180, sx = Math.sin(yaw), sz = Math.cos(yaw), g = world.heightAt(p.x, p.z);
    let a0 = Infinity, a1 = -Infinity;
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) for (const h of [0, 2.6]) {
      const c = screen([p.x + sx * hl * a + sz * hw * b, g + h, p.z + sz * hl * a - sx * hw * b]);
      if (c) { a0 = Math.min(a0, c.x); a1 = Math.max(a1, c.x); }
    }
    return a1 > a0 ? [a0, a1] : null;
  };
  // A spot where an incoming round lands at beat i, or null. Strict, the s3 rules hold; loose (a take that would carry no
  // beat at all), the frame's edges and the hull's later span are the pre-s3 ones.
  const place = (i, strict) => {
    const T = BEAT_MS[i], tb = T - 450;
    if (heroShots.some((t) => t >= tb - SHOT_CLEAR_MS[0] && t <= tb + SHOT_CLEAR_MS[1])) return null;
    const lens = lensAt(shots, T), pose = {};
    if (!lens || !sampleActorTrack(heroKeys, T, pose)) return null;
    const { cam, right, screen } = lens;
    const span = hullSpan(screen, pose);
    if (!span) return null;
    const [x0, x1] = span, edge = strict ? EDGE : EDGE_LOOSE;
    const yaw = (pose.facingDeg ?? 0) * Math.PI / 180, gy = world.heightAt(pose.x, pose.z);
    const gunYaw = yaw + (pose.turretDeg ?? 0) * Math.PI / 180;
    const muzzle = screen([pose.x + Math.sin(gunYaw) * reach, gy + 2, pose.z + Math.cos(gunYaw) * reach]);
    const mid = (x0 + x1) / 2, gunSide = muzzle ? Math.sign(muzzle.x - mid) || 1 : 1;
    const ux0 = pose.x - cam.x, uz0 = pose.z - cam.z, ul = Math.hypot(ux0, uz0) || 1, ux = ux0 / ul, uz = uz0 / ul;
    const nx = -uz, nz = ux, near = [];
    // the other tanks on screen at the beat (escorts and foes; not infantry or trucks)
    const others = [];
    for (const track of scene.storyboard?.actorTracks ?? []) {
      if (track.actor === 'hero' || !scene.actors.some((a) => a.name === track.actor && !/^(infantry|truck|car)/.test(a.id ?? ''))) continue;
      const p = {};
      if (!sampleActorTrack(track.keys, T, p)) continue;
      const c = screen([p.x, world.heightAt(p.x, p.z) + 1.5, p.z]);
      if (c) others.push(c);
    }
    // A burst's dust spreads for a second and a half: through it the spot stays DUST_R further from the lens than the hero,
    // so the cloud stays behind it (S01's beat at 3.3 s filled the frame with dust as its lens passed the spot); and through
    // the fireball's first FIREBALL_MS it stays off the hull's span on screen (S13's sat behind the turret once the lens moved).
    const clearAfter = (px, pz) => {
      for (let t = tb; t <= tb + DUST_MS; t += 100) {
        const l = lensAt(shots, t), p = {};
        if (!l || !sampleActorTrack(heroKeys, t, p)) continue;
        if (Math.hypot(px - l.cam.x, pz - l.cam.z) < Math.hypot(p.x - l.cam.x, p.z - l.cam.z) + DUST_R) return false;
        if (!strict || t > tb + FIREBALL_MS) continue;
        const sp = hullSpan(l.screen, p), c = l.screen([px, world.heightAt(px, pz) + 2.5, pz]);
        if (sp && c && c.x > sp[0] && c.x < sp[1]) return false;
      }
      return true;
    };
    for (const side of [gunSide, -gunSide]) {
      // a street's facades leave only its own line: nearer the hull's track and further down it, last
      for (const [d, lat] of [[17, 10], [17, 7], [17, 13], [12, 10], [12, 7], [12, 13], [22, 10], [22, 7], [22, 13], [17, 5], [22, 5], [28, 5], [28, 3.5], [22, 3.5]]) {
        // screen x grows along `right`: pick the lateral sign that lands on this side of the frame
        const s = Math.sign(nx * right[0] + nz * right[2]) * side;
        const px = pose.x + ux * d + nx * lat * s, pz = pose.z + uz * d + nz * lat * s;
        if (world.wetAt(px, pz) > 0.3) continue;
        world.query(px - 3, pz - 3, px + 3, pz + 3, near);
        if (near.some((r) => r.max[1] - r.min[1] > 1.2 && r.kind !== 'bridge')) continue;
        // in the frame with room above for its column, off the hull's box, and not stacked on another tank
        const q = screen([px, world.heightAt(px, pz) + 2.5, pz]);
        if (!q || Math.abs(q.x) > edge.x || q.y < -0.7 || q.y > edge.y || (q.x > x0 - 0.08 && q.x < x1 + 0.08)) continue;
        if (others.some((c) => Math.abs(c.x - q.x) < OTHER_DX)) continue;
        if (!clearAfter(px, pz)) continue;
        return [+px.toFixed(2), +pz.toFixed(2)];
      }
    }
    return null;
  };
  let added = 0;
  const stage = (i, spot) => {
    const tb = BEAT_MS[i] - 450, foe = scene.actors.find((a) => a.name.startsWith('foe') && !deadBy(a.name, tb));
    // Named beat<n>-…: the Studio names an unnamed effect fx<n> as it loads the scene's effects in time order and fires
    // each name once, so an explicit fx<n> could take a planned effect's name and one of the two would never fire (r11
    // drew 12 of 17 staged beats not at all, 2026-10-08).
    if (foe) scene.effects.push({ ...fire(foe.name, tb - 110), id: `beat${i + 1}-shot` });
    // placed in the hero's frame like the plan's own bursts (heroRel: the lab moves them with the cameras when autoPlace
    // moves the hero)
    scene.effects.push({ ...blast(spot, tb, 'large', { cause: 'shot' }), id: `beat${i + 1}-boom`, heroRel: true });
    scene.effects.push({ ...debris(spot, tb + 30, { count: 34, speedMps: 15, hot: 0.4, scale: 1.1 }), id: `beat${i + 1}-debris`, heroRel: true });
    added++;
  };
  for (const i of BEAT_MS.keys()) {
    // a burst already live in the frame carries the beat
    if (covered[i]) continue;
    const spot = place(i, true);
    if (spot) stage(i, spot);
  }
  // a take with no burst in the frame at any beat gets one under the looser rules
  if (!covered.some(Boolean) && !added) {
    for (const i of BEAT_MS.keys()) { const spot = place(i, false); if (spot) { stage(i, spot); break; } }
  }
  if (added) scene.effects.sort((a, b) => a.tMs - b.tMs);
  return added;
}
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
// Front lenses (owner 2026-10-05: "all the tanks are back angles, it would be better to see the fronts and more angles
// then back which is kind of the least interesting"). Round 5 turns the fifty around: the lens leads the hero and looks
// back at its glacis, gun and tracks, with the fight landing beside and behind it — so the hits, barrages and fire that
// a rear lens saw ahead of the hero are re-staged into the frame. The kinds below, k = -1 mirrors the side:
//   LEAD     low head-on lead, the hull filling the frame as it bears down on the lens
//   FRONT34  front three-quarter lead at turret height;  FRONT34_HIGH the Open Graph height, from ahead
//   SIDE     a tracking profile;  ORBIT  an arc from the front quarter round to the flank
//   *_HOLD   the same lenses as slow push-ins on a stationary hero;  REVERSE  over the target's shoulder at the shooter
const LEAD = (k = 1, lift = 1.4) => RIG.lead({ side: 2 * k, along: [15, 11], lift, fov: 34, look: [0, 0, 1.8] });
const FRONT34 = (k = 1) => RIG.lead({ side: 7 * k, along: [12.5, 9.5], lift: 2.3, fov: 38, look: [-0.8 * k, 0, 1.6] });
const FRONT34_HIGH = (k = 1) => RIG.lead({ side: 9 * k, along: [15, 11.5], lift: 6.5, fov: 42, look: [-1 * k, -4, 1.2] });
const SIDE = (k = 1) => RIG.follow({ side: [10.5 * k, 9.5 * k], along: [3, 1], lift: 1.7, fov: 36, look: [0, 1, 1.5] });
const ORBIT = (k = 1, from = 25, to = 80) => RIG.orbit({ radius: 14, from: from * k, to: to * k, lift: 2.0, fov: 38, look: [0, 0, 1.5] });
const FRONT_HOLD = (k = 1, lift = 1.3) => hold({ side: 3 * k, along: 12.5, lift, fov: 35, lookHero: [0, 0, 1.8] }, { side: 2.7 * k, along: 11.2, lift, fov: 33, lookHero: [0, 0, 1.8] });
const FRONT34_HOLD = (k = 1) => hold({ side: 8 * k, along: 9.5, lift: 2.5, fov: 40, lookHero: [-0.6 * k, 0, 1.6] }, { side: 7.3 * k, along: 8.6, lift: 2.4, fov: 38, lookHero: [-0.6 * k, 0, 1.6] });
const HIGH34_HOLD = (k = 1) => hold({ side: 11 * k, along: 13, lift: 7, fov: 40, lookHero: [-1 * k, -2, 1.2] }, { side: 10 * k, along: 11.8, lift: 6.4, fov: 38, lookHero: [-1 * k, -2, 1.2] });
const PROFILE_HOLD = (k = 1) => hold({ side: 12.5 * k, along: 2.5, lift: 1.6, fov: 38, lookHero: [0, 1, 1.5] }, { side: 11.5 * k, along: 2, lift: 1.6, fov: 36, lookHero: [0, 1, 1.5] });
// a knockout seen from behind its target: the target big in the foreground as the round strikes, the shooter's muzzle
// flash down the range behind it (the duel is staged closer, `near`, so the shooter still reads)
const REVERSE = (lat, along, k = 1, lift = 2.8) => hold({ side: lat + 4.5 * k, along: along + 9, lift, fov: 30, lookHero: [0, 9, 1.8] }, { side: lat + 4.1 * k, along: along + 8.2, lift: lift - 0.1, fov: 29, lookHero: [0, 9, 1.8] });

// [n, id, kind, title, set (staging), film (buildShot fields; durMs defaults to DUR), still { tMs, exposureMs }]
export const SHOTS = [
  // ---------------------------------------------------------------- tanks: the hero on the move through the fight
  // Round 5 (owner 2026-10-05, "all the tanks are back angles"): the lens leads the hero or flanks it, and the hits a rear
  // lens saw ahead of the hero land beside and behind it instead, inside the frame.
  [1, 'main-street-push', 'tank', 'A Leopard 2A6 pushes up the main street of burning Steinburg', S.stMain,
    // a low head-on lead down the street's centre line, the Puma and the second Leopard behind the hero
    { speed: 2.4, sun: 'side', effects: [...wreck('foe0'), ...incoming('foe1', -4.5, -10, 1500), fireField(H(4.5, -30), 0, { radiusM: 3 }), fire('hero', 3400), mg('ally1', 2600, 9), dust('hero', 800, 10, 0.8)],
      cam: LEAD(1, 1.5) },
    { tMs: 3480, exposureMs: 25 }],
  [2, 'factory-road', 'tank', 'An M1A2 Abrams TUSK rolls past the factory under fire', S.stEast,
    { count: 2, speed: 2.8, sun: 'side', effects: [...wreck('foe0'), ...incoming('foe1', -6, -8, 2000), mg('ally1', 1200, 9), fire('hero', 3900), dust('hero', 700, 10, 0.8)], cam: FRONT34() },
    { tMs: 3980, exposureMs: 25 }],
  [3, 'square-pass', 'tank', 'A Leclerc XLR crosses the burning square', S.stSquare,
    // the lens waits in the mouth of the north street at the central crossing (PR #9's town has no wide square; a lens
    // on the main street's kerb sat against the facades, review 2026-10-05): the hero's front quarter coming on
    { speed: 0.9, pinMs: 3300, sun: 'side', effects: [...wreck('foe0'), burn('foe1', 0), smoke('foe1', 0), fireField(H(10, 2), 0, { radiusM: 4 }), huge(H(12, -10), 2600), fire('hero', 4200)],
      cam: RIG.passby({ side: -9, along: 22, lift: 2.6, fov: 36, look: [0, 0, 1.6] }) },
    { tMs: 3300, exposureMs: 33 }],
  [4, 'column-under-fire', 'tank', 'A T-90M column drives into the fight on the country road', S.vRoad,
    // the Open Graph height from ahead: the column bearing down the road, the barrage walking in behind it
    { speed: 2.4, sun: 'side', effects: [...wreck('foe0'), burn('foe2', 0), smoke('foe2', 0), ...incoming('foe1', -6, -5, 1300), fire('hero', 2600), huge(H(-26, -24), 3300), barrage(H(-18, -34), 3900, 6, 14), mg('ally1', 4400, 9), fire('ally1', 5200)], cam: FRONT34_HIGH() },
    { tMs: 2700, exposureMs: 25 }],
  [5, 'barn-advance', 'tank', 'A T-14 Armata advances past the barns of Verdant Fields', S.vVillage,
    // a tracking profile from the field side, the barns beyond the hero (the other side's lens passed behind a shed)
    { speed: 2.6, sun: 'side', effects: [...wreck('foe0'), ...incoming('foe1', -11, 5, 2200), fire('hero', 3700), dust('hero', 800, 10, 0.8)], cam: SIDE(1) },
    { tMs: 3780, exposureMs: 25 }],
  [6, 'farm-charge', 'tank', 'A KF51 Panther charges past the farmhouse through artillery', S.vFarm,
    { count: 1, speed: 3.2, sun: 'side', effects: [...wreck('foe0'), barrage(H(-12, -8), 900, 6, 12), barrage(H(10, -20), 3200, 5, 12), fire('hero', 4300), dust('hero', 700, 12, 1)], cam: RIG.lead({ side: 2.5, along: [15, 10], lift: 2.2, fov: 38, look: [0, -2, 1.5] }) },
    { tMs: 4380, exposureMs: 25 }],
  [7, 'lake-shellfire', 'tank', 'A Stridsvagn 122 crosses the frozen lake through shellfire', S.gLake,
    // a low front quarter across the ice, the shells bursting around and behind the hero
    { speed: 3.6, sun: 'side', effects: [burn('foe1', 0), smoke('foe1', 0), ...hitNear(6, -8, 1400), ...hitNear(-3, -18, 3000), fire('hero', 4500), huge(H(14, -36), 4700), exhaust('hero', 100)],
      cam: RIG.lead({ side: -6.5, along: [13, 9.5], lift: 1.6, fov: 36, look: [0.8, 0, 1.6] }) },
    { tMs: 3060, exposureMs: 25 }],
  [8, 'market-push', 'tank', 'An M6 Linebacker leads an Abrams column through the market street of Sunscar Oasis', S.oMarket,
    // a low lead looking up at the hull: the street facades and the sky behind it, the oasis floor (whose dark contour
    // bands marbled the sand in every frame, r4c) only a grazing strip under the tracks
    { count: 3, speed: 2.6, sun: 'side', effects: [...wreck('foe0'), ...incoming('foe1', 4.5, -11, 1800), fire('hero', 3600), dust('hero', 700, 12, 1)],
      cam: RIG.lead({ side: 1.8, along: [14, 10.5], lift: 0.9, fov: 32, look: [0, 0, 2.3] }) },
    { tMs: 3680, exposureMs: 25 }],
  [9, 'harbor-run', 'tank', 'A Leopard 2A7V runs the harbor road at Nordhavn under fire', S.fHarbor,
    { speed: 3, sun: 'side', effects: [...wreck('foe0'), ...hitNear(8, -9, 1500), mg('ally1', 2400, 9), huge(H(12, -30), 3200), fire('hero', 4100)], cam: FRONT34(-1) },
    { tMs: 4180, exposureMs: 25 }],
  [10, 'ford-shellfire', 'tank', 'A ZTZ-100 fords the river as shells land around it', S.mFord,
    // the river-level profile a few metres ahead: the bow wave and the glacis as well as the flank
    { speed: 2.4, sun: 'side', effects: [...wreck('foe0'), ...hitNear(-8, 0, 1300), ...hitNear(-10, -10, 3100), fire('hero', 4400)], cam: RIG.follow({ side: [12, 10.5], along: [6, 3.5], lift: 1.6, fov: 34, look: [0, 1, 1.4] }) },
    { tMs: 4480, exposureMs: 25 }],
  [11, 'container-rows', 'tank', 'A Challenger 1 column pushes through the rail yard at Cinder Junction', S.rYard,
    { speed: 2.8, sun: 'side', effects: [...wreck('foe0'), ...incoming('foe1', -3, -10, 2400), fire('hero', 3900)], cam: RIG.lead({ side: 3.2, along: [13, 9.5], lift: 2.6, fov: 38, look: [-0.5, 0, 1.6] }) },
    { tMs: 3980, exposureMs: 25 }],
  [12, 'gantry-advance', 'tank', 'A T-90MS Tagil column advances under the Ironworks gantries', S.iGantry,
    { speed: 2.4, sun: 'side', effects: [...wreck('foe0'), fireField(H(8, -18), 0, { radiusM: 3 }), ...hitNear(-5, -8, 2000), fire('hero', 3300)], cam: FRONT34_HIGH(-1) },
    { tMs: 3380, exposureMs: 25 }],
  [13, 'farm-race', 'tank', 'A K2 Black Panther races past the red-roofed farm at sunset', S.frFarm,
    // the lens waits ahead at the roadside: the K2's front quarter coming on, then its flank racing past
    { time: 'sunset', speed: 3.0, pinMs: 3300, effects: [fireField(H(14, 36), 0, { radiusM: 5 }), embers(H(14, 36), 0), ...hitNear(10, -6, 1700), fire('hero', 3300), dust('hero', 900, 10, 0.8)], cam: RIG.passby({ side: -12, along: 6, lift: 1.6, fov: 38, look: [0, 0, 1.7] }) },
    { tMs: 3380, exposureMs: 25 }],
  [14, 'snow-push', 'tank', 'A T-80U pushes through snowy Frosthollow', S.wVillage,
    { speed: 2.4, count: 2, sun: 'side', effects: [...wreck('foe0'), burn('foe1', 0), smoke('foe1', 0), ...hitNear(5, -12, 2100), mg('ally1', 1300, 9), fire('hero', 3600)], cam: LEAD(-1, 1.3) },
    { tMs: 3680, exposureMs: 25 }],
  [15, 'orchard-column', 'tank', 'A C1 Ariete column drives through the orchard village under fire', S.orVillage,
    // an arc from the front quarter round to the flank as the column rolls on
    { speed: 1.5, sun: 'side', effects: [...wreck('foe0'), ...incoming('foe1', -7, -6, 1700), fire('hero', 3500), dust('hero', 700, 10, 0.8)], cam: ORBIT(1, 25, 80) },
    { tMs: 3580, exposureMs: 25 }],

  // ---------------------------------------------------------------- battles: firefights, hits and knockouts
  [16, 'street-duel', 'battle', 'Street duel at night: a Griffin trades fire with a T-80U down a Steinburg street', S.stWest,
    // a low front quarter in the street: every round goes out at the lens, the answering fire lands around the hero
    { time: 'night', speed: 0, effects: [NIGHT_FLARE(H(-6, 60), 90), burn('foe1', 0), smoke('foe1', 0), fireField(H(4, -20), 0, { radiusM: 3 }), fire('hero', 1400), ...incoming('foe0', -4, -6, 2500), mg('ally1', 3200, 9), ...knockout('hero', 'foe0', 4200)],
      cam: hold({ side: 4.5, along: 11, lift: 1.5, fov: 36, lookHero: [-0.4, 0, 1.7] }, { side: 4.1, along: 10, lift: 1.5, fov: 34, lookHero: [-0.4, 0, 1.7] }) },
    { tMs: 4460, exposureMs: 16 }],
  [17, 'crossroads-fire', 'battle', 'Fire at the Steinburg crossroads at noon', S.stCross,
    { speed: 0, effects: [...wreck('foe0'), burn('foe1', 0), fire('hero', 1300), huge(H(10, -22), 2400), fire('ally1', 3300), barrage(H(14, -40), 3900, 5, 12)],
      cam: hold({ side: -10, along: 20, lift: 24, fov: 44 }, { side: -9, along: 18, lift: 23, fov: 42 }) },
    { tMs: 1380, exposureMs: 16 }],
  [18, 'street-knockout', 'battle', 'A T-90A is knocked out at the end of a Steinburg street at night', S.stSouth,
    // from behind the T-90A as the round strikes it, the shooter's flash down the street (the duel staged at 42 m)
    { time: 'night', speed: 0, enemies: pair(CAST.t90a, CAST.t72b, ['intact', 'burning'], { along: 42, lat: 1 }),
      effects: [NIGHT_FLARE(H(4, 30), 90), ...wreck('foe1'), ...knockout('hero', 'foe0', 1700), mg('ally1', 3000, 9), fire('ally1', 4400)], cam: REVERSE(1, 42) },
    { tMs: 2060, exposureMs: 16 }],
  [19, 'roof-tiles', 'battle', 'Roof tiles rain down as a PL-01 fires up the street', S.stMain,
    { speed: 0, sun: 'side', effects: [...wreck('foe0'), ...incoming('foe1', -9, -3, 1200), debris(H(-9.5, -2), 1360, { count: 50, speedMps: 12, hot: 0.1, scale: 1.4 }), fire('hero', 2600), fire('ally1', 3900)],
      cam: hold({ side: 5, along: 9, lift: 1.9, fov: 40, lookHero: [0, 2, 1.6] }, { side: 4.5, along: 8, lift: 2, fov: 38, lookHero: [0, 2, 1.6] }) },
    { tMs: 2680, exposureMs: 16 }],
  [20, 'road-return-fire', 'battle', 'A Challenger 2 leads a Ukrainian column returning fire across the fields at sunset', S.vRoad,
    { time: 'sunset', picture: { exposure: 0.3 }, speed: 0, effects: [...wreck('foe0'), burn('foe2', 0), smoke('foe2', 0), fire('hero', 1300), fire('ally1', 1900), fire('ally2', 2500), ...incoming('foe1', -6, -4, 3200), huge(H(-16, -26), 4100), barrage(H(-14, -16), 4700, 6, 14)], cam: HIGH34_HOLD() },
    { tMs: 1380, exposureMs: 16 }],
  [21, 'fields-assault', 'battle', 'A T-90SM wedge assaults through the burning fields', S.vAssault,
    { count: 4, speed: 2.4, sun: 'side', effects: [...wreck('foe0'), burn('foe1', 0), smoke('foe1', 0), fire('ally1', 1100), huge(H(18, -6), 2100), fire('hero', 3600), boom(H(3, -24), 4600, 'large')],
      cam: FRONT34_HIGH(-1) },
    { tMs: 3720, exposureMs: 25 }],
  [22, 'walking-barrage', 'battle', 'Artillery walks across the fields toward the wedge at night', S.vAssault,
    // from high ahead of the wedge: the barrage walks in off the left flank toward the tanks' fronts
    { time: 'night', speed: 0, effects: [NIGHT_FLARE(H(-10, 20), 100), ...wreck('foe0'), barrage(H(-40, 10), 800, 6, 14), barrage(H(-24, 4), 2200, 6, 14), barrage(H(-10, -2), 3600, 5, 12), fire('hero', 4600)],
      cam: hold({ side: 16, along: 24, lift: 10, fov: 46, lookHero: [-10, 0, 1] }, { side: 15, along: 22.5, lift: 9.4, fov: 44, lookHero: [-10, 0, 1] }) },
    { tMs: 3700, exposureMs: 25 }],
  [23, 'village-crossroads', 'battle', 'A T-80U Husarz and a PL-01 hold the village crossroads', S.vVillage,
    { speed: 0, sun: 'side', effects: [...wreck('foe0'), fire('hero', 1500), ...incoming('foe1', 5, -7, 2700), fire('ally1', 3900), ...knockout('hero', 'foe1', 5100)], cam: FRONT_HOLD(-1) },
    { tMs: 1580, exposureMs: 16 }],
  [24, 'ice-duel', 'battle', 'A duel on the frozen lake: a T-80U takes the hit', S.gLake,
    // from behind the T-80U as the Strv 122's round strikes it (the duel staged at 46 m)
    { speed: 0, sun: 'side', enemies: pair(CAST.t80u, CAST.t72bu, ['intact', 'burning'], { along: 46, lat: 8 }),
      effects: [burn('foe1', 0), smoke('foe1', 0), ...knockout('hero', 'foe0', 1500), ...hitNear(-6, 10, 3300), fire('ally1', 4400)], cam: REVERSE(8, 46) },
    { tMs: 1860, exposureMs: 16 }],
  [25, 'alpine-village', 'battle', 'A Leopard 2A5 and a CV90105 fight through the alpine village', S.gVillage,
    { speed: 0, sun: 'side', effects: [...wreck('foe0'), fire('hero', 1400), ...incoming('foe1', 9, 2, 2600), fire('hero', 3200), fire('ally1', 3800)], cam: PROFILE_HOLD(-1) },
    { tMs: 3280, exposureMs: 16 }],
  [26, 'minaret-fire', 'battle', 'A Merkava Mk 3D fires at Sunscar Oasis', S.oMinaret,
    // low under the glacis, looking up: the hull and gun against the sky; the oasis floor, whose contour bands marbled the
    // sand at shoulder height (r4c), only a grazing strip under the tracks
    { speed: 0, sun: 'side', effects: [...wreck('foe0'), fire('hero', 1600), fire('ally1', 2900), ...incoming('foe1', -7, -5, 3600)],
      cam: hold({ side: 4, along: 10.5, lift: 0.8, fov: 34, lookHero: [-0.3, 0, 2.5] }, { side: 3.6, along: 9.6, lift: 0.8, fov: 32, lookHero: [-0.3, 0, 2.5] }) },
    { tMs: 1680, exposureMs: 16 }],
  [27, 'caravanserai-kill', 'battle', 'A T-62MV-1 is knocked out by the caravanserai', S.oCaravan,
    // from low behind the T-62 as the round strikes it, the Merkava's flash beyond: the target's hull covers the marbled
    // sand (the duel staged at 44 m)
    { speed: 0, sun: 'side', enemies: pair(CAST.t62, CAST.t72b, ['intact', 'burning'], { along: 44, lat: 2 }),
      effects: [...wreck('foe1'), ...knockout('hero', 'foe0', 2000), fire('ally1', 3600)], cam: REVERSE(2, 44, -1, 2.0) },
    { tMs: 2160, exposureMs: 16 }],
  [28, 'fjord-village', 'battle', 'A Challenger 2E and a Challenger 3 hold the fjord village', S.fVillage,
    { speed: 0, sun: 'side', effects: [...wreck('foe0'), fire('hero', 1500), fire('ally1', 2300), mg('ally1', 3100, 9), fire('hero', 3300), ...incoming('foe1', 7, -6, 4000)], cam: FRONT34_HOLD(-1) },
    { tMs: 3380, exposureMs: 16 }],
  [29, 'fjord-road-kill', 'battle', 'A T-90 burns on the road above the fjord', S.fNorth,
    // the duel across the frame from the roadside, the round crossing between the two (staged at 24 m: at 32 m the two
    // tanks sat on the frame's edges with an empty field between, review 2026-10-05)
    { speed: 0, sun: 'side', enemies: pair(CAST.t90, CAST.t72b3, ['intact', 'burning'], { along: 24, lat: 0 }),
      effects: [...wreck('foe1'), ...knockout('hero', 'foe0', 1800), fire('ally1', 3800)],
      cam: hold({ side: -28, along: 12, lift: 4.2, fov: 44, lookHero: [0, 12, 1.6] }, { side: -27, along: 12, lift: 4, fov: 43, lookHero: [0, 12, 1.6] }) },
    { tMs: 1960, exposureMs: 16 }],
  [30, 'temple-village', 'battle', 'A K1A1 and a K21 fight through the temple village of Monsoon Ridge', S.mVillage,
    { speed: 0, sun: 'side', effects: [...wreck('foe0'), fire('hero', 1500), ...incoming('foe1', 6, -8, 2600), fire('hero', 3200), fire('ally1', 3900)], cam: HIGH34_HOLD(-1) },
    { tMs: 3280, exposureMs: 16 }],
  [31, 'ford-fire', 'battle', 'A Type 96B fires across the river ford', S.mFord,
    { lineup: [CAST.type96b, CAST.aft10], speed: 0, sun: 'side', effects: [...wreck('foe0'), fire('hero', 1700), ...hitNear(6, -6, 2900), fire('ally1', 4300)], cam: FRONT_HOLD(1, 1.1) },
    { tMs: 1780, exposureMs: 16 }],
  [32, 'yard-salvo', 'battle', 'M1A2 SEPv3 tanks fire across the rail yard at golden hour', S.rTracks,
    // from ahead of the firing line: the salvo ripples down the line toward the lens
    { speed: 0, effects: [...wreck('foe0'), fire('hero', 1300), fire('ally1', 1900), fire('ally2', 2500), ...incoming('foe1', -8, -8, 3600)],
      cam: hold({ side: 12, along: 15, lift: 2.6, fov: 40, lookHero: [-6, -4, 1.5] }, { side: 11, along: 13.6, lift: 2.5, fov: 38, lookHero: [-6, -4, 1.5] }) },
    { tMs: 1380, exposureMs: 16 }],
  [33, 'water-tower', 'battle', 'The line advances past the burning water tower at night', S.rFactory,
    { count: 2, time: 'night', speed: 2.2, effects: [NIGHT_FLARE(H(-4, 40), 90), ...wreck('foe0'), fireField(H(-12, 18), 0, { radiusM: 5 }), fireField(H(9, -16), 0, { radiusM: 4 }), ...hitNear(7, -10, 1900), fire('hero', 3600)], cam: FRONT34(-1) },
    { tMs: 3680, exposureMs: 25 }],
  [34, 'furnace-salvo', 'battle', 'TOS-1A launchers fire a rippling salvo in the Ironworks yard at night', S.iYard,
    { time: 'night', speed: 0, effects: [NIGHT_FLARE(H(0, 30), 70), ...wreck('foe0'), fireField(H(-7, 10), 0, { radiusM: 3 }), fireField(H(21, 8), 0, { radiusM: 3 }), embers(H(-7, 10), 0), fire('hero', 1100), fire('ally1', 1900), fire('ally2', 2700), fire('ally3', 3500)],
      cam: hold({ side: 9.2, along: 14.4, lift: 2.4, fov: 40, lookHero: [-9, 0, 1.8] }, { side: 8.2, along: 12.6, lift: 2.4, fov: 38, lookHero: [-9, 0, 1.8] }) },
    { tMs: 1180, exposureMs: 16 }],
  [35, 'farm-village', 'battle', 'A Type 90 and a Type 89 fight through the farm village of Frontier Basin', S.frVillage,
    { speed: 0, sun: 'side', effects: [...wreck('foe1'), fire('hero', 1500), ...incoming('foe0', -6, -6, 2700), fire('hero', 3300), fire('ally1', 3900)], cam: FRONT34_HOLD() },
    { tMs: 3380, exposureMs: 16 }],
  [36, 'barn-knockout', 'battle', 'A Type 10 knocks out a T-90M beside the burning barn', S.frVillage,
    // from behind the T-90M as the Type 10's round strikes it, the burning barn between them (the duel staged at 42 m)
    { lineup: [CAST.type10, CAST.k2], speed: 0, sun: 'side', enemies: pair(CAST.t90m, CAST.t72b3m, ['intact', 'burning'], { along: 42, lat: -2 }),
      effects: [...wreck('foe1'), fireField(H(-14, 22), 0, { radiusM: 6 }), embers(H(-14, 22), 0), ...knockout('hero', 'foe0', 1900), fire('ally1', 4100)], cam: REVERSE(-2, 42, -1) },
    { tMs: 2060, exposureMs: 16 }],
  [37, 'river-village', 'battle', 'A VT-4A1 and a ZTZ-100 fight through the river village of the Jade River Delta', S.dVillage,
    { speed: 0, sun: 'side', effects: [...wreck('foe0'), fire('hero', 1400), fire('ally1', 2500), ...incoming('foe1', -7, -5, 3300), fire('ally2', 4300)], cam: FRONT34_HOLD() },
    { tMs: 1480, exposureMs: 16 }],
  [38, 'church-knockout', 'battle', 'A Leopard 2A6 is knocked out beside the onion-domed church at night', S.wChurch,
    // one of the few rear lenses kept: the knockout happens beside the church ahead of the hero
    { time: 'night', speed: 0, effects: [NIGHT_FLARE(H(-6, 55), 95), ...wreck('foe1'), ...knockout('hero', 'foe0', 1900), fire('ally1', 3800), mg('ally1', 4800, 9)], cam: OG_HOLD() },
    { tMs: 2060, exposureMs: 16 }],
  [39, 'lakeside-village', 'battle', 'A Chieftain Mk 10 fires across the village at Highland Reservoir', S.reVillage,
    { speed: 0, sun: 'side', effects: [...wreck('foe0'), fire('hero', 1500), ...incoming('foe1', -9, 3, 2700), fire('hero', 3300), fire('ally1', 3800)], cam: PROFILE_HOLD() },
    { tMs: 3380, exposureMs: 16 }],

  // ---------------------------------------------------------------- scenes: the battlefield around the fight
  [40, 'rooftop-smoke', 'scene', 'Smoke columns rise over the rooftops of Steinburg', S.stRing,
    // from up the street past the burning wrecks, looking back: their columns rise over the rooftops as the column advances
    // on them (r4c's drone never framed them; r4d's street-level push behind the hero framed only wisps). The wrecks burn 40 to
    // 59 m ahead, 53 m and more from the lens: at 20 m their smoke smeared across the lens between the near rooftops, and the
    // barrage keeps to the street (review 2026-10-05). Motion (owner 2026-10-05): the lens cranes up out of the street,
    // 5 m to 27 m, dollying toward the wrecks, so the columns climb past the rooftops into the reveal over the town; the
    // column closes up toward the outer kerb (every tank 4 m clear of the houses) and creeps on (no route clears the street at speed)
    { speed: 3, sun: 'side', rail: 'spline', formation: [[0, 0], [1.5, -14], [2, -28]],
      effects: [...wreck('foe0'), ...wreck('foe1'), ...wreck('foe2'), barrage(H(0, 30), 2400, 4, 6), fire('hero', 4200)],
      cam: [{ tMs: 0, frame: 'world', lookFrame: 'hero', side: 6, along: 112, lift: 5, fov: 38, lookHero: [0, 30, 6] },
        { tMs: 3300, frame: 'world', lookFrame: 'hero', side: 4, along: 106, lift: 14, fov: 41, lookHero: [0, 30, 7] },
        { tMs: 'end', frame: 'world', lookFrame: 'hero', side: 2, along: 100, lift: 27, fov: 44, lookHero: [0, 30, 4] }] },
    { tMs: 3300, exposureMs: 25 }],
  [41, 'church-tower', 'scene', "A Leopard 2A6 UA halts in Steinburg's night street fight", S.stMain,
    // the tower view, 24 m up between the church and the street: the tanks' fronts from above, the street lit by the flare
    // (at 16 m the lens hovered inside the main street's tall houses, review 2026-10-05)
    { lineup: [CAST.leo2a6, CAST.puma, CAST.leo2a6], time: 'night', speed: 0, effects: [NIGHT_FLARE(H(-8, 20), 100), ...wreck('foe0'), fire('hero', 1500), fire('ally1', 2500), ...incoming('foe1', -4, 10, 3500), fire('ally2', 4700)],
      cam: hold({ side: -18, along: 20, lift: 24, fov: 40, lookHero: [0, 6, 0] }, { side: -17, along: 18.5, lift: 23, fov: 39, lookHero: [0, 6, 0] }) },
    { tMs: 2700, exposureMs: 16 }],
  [42, 'assault-above', 'scene', 'Verdant Fields from above as the assault rolls in', S.vAssault,
    // the drone ahead of the wedge, looking back down at it rolling in
    { count: 4, speed: 2.4, sun: 'side', effects: [...wreck('foe0'), burn('foe1', 0), smoke('foe1', 0), huge(H(14, 6), 1800), barrage(H(-12, -18), 3000, 6, 16), fire('hero', 4300)],
      cam: RIG.drone({ side: -8, along: [32, 24], lift: [22, 18], fov: 46, look: [0, -6, 0] }) },
    { tMs: 3300, exposureMs: 25 }],
  [43, 'lake-crane', 'scene', 'Glacier Pass at sunset: smoke rises over the frozen lake and the peaks', S.gLake,
    // a crane rising ahead of the hero, looking back over the lake and the burning ice behind it
    { time: 'sunset', speed: 3, effects: [burn('foe1', 0), smoke('foe1', 0), fireField(H(-10, -30), 0, { radiusM: 4 }), ...hitNear(10, -10, 2000), fire('hero', 3600)],
      cam: RIG.crane({ side: 6, along: [12, 19], lift: [1.8, 11], fov: 44, look: [0, -12, 1] }) },
    { tMs: 4600, exposureMs: 25 }],
  [44, 'oasis-sunset', 'scene', 'Sunscar Oasis at sunset: smoke over the palms and the minaret', S.oGolden,
    // low and backlit from ahead: the TUSK and its smoke against the sunset sky, the marbled sand (r4c) left in shadow
    { time: 'sunset', speed: 0, sun: 'back', effects: [...wreck('foe0'), fireField(H(-12, -24), 0, { radiusM: 4 }), fire('hero', 1600), fire('ally1', 3000), ...incoming('foe1', 8, -10, 4000)],
      cam: hold({ side: -5, along: 12, lift: 0.9, fov: 36, lookHero: [0.5, 0, 2.8] }, { side: -4.5, along: 11, lift: 0.9, fov: 34, lookHero: [0.5, 0, 2.8] }) },
    { tMs: 3300, exposureMs: 25 }],
  // golden, not sunset: the 3.5° sunset sun sits behind the fjord's mountains, so from the crane the whole valley was in
  // shadow and rendered nearly black (r4c review, 2026-10-04); the crane stays on the flank, ahead of the hero
  [45, 'harbor-wide', 'scene', 'Nordhavn at golden hour: the battle on the harbor road below the mountains', S.fHarbor,
    { time: 'golden', speed: 3, effects: [...wreck('foe0'), ...hitNear(10, 30, 2000), fire('hero', 3800)], cam: RIG.crane({ side: 18, along: [6, 0], lift: [6, 14], fov: 40, look: [0, -10, 1.5] }) },
    { tMs: 3300, exposureMs: 25 }],
  // day light and an oblique drone: under a low sun the jungle canopy left the steep drone view black (r4c, r4d); the
  // drone now leads the hero through the ford, looking back at it
  [46, 'river-drone', 'scene', 'Monsoon Ridge: shells land along the jungle river', S.mFord,
    { lineup: [CAST.aft10, CAST.type96b], time: 'day', picture: { exposure: 0.2 }, speed: 2.4, effects: [...wreck('foe0'), barrage(H(-10, 10), 1200, 6, 14), barrage(H(8, -12), 3400, 5, 12), fire('hero', 4600)],
      cam: RIG.drone({ side: 9, along: [34, 26], lift: [16, 13], fov: 46, look: [0, -8, 0] }) },
    { tMs: 3300, exposureMs: 25 }],
  [47, 'ironworks-crane', 'scene', 'Ironworks at night: the yard burns between the smoke stacks', S.iYard,
    // a crane rising ahead of the hero over the burning yard
    { time: 'night', speed: 0, effects: [NIGHT_FLARE(H(6, 20), 90), ...wreck('foe0'), fireField(H(-7, 10), 0, { radiusM: 3 }), fireField(H(21, 8), 0, { radiusM: 3 }), fireField(H(-8, -10), 0, { radiusM: 3 }), fireField(H(14, -6), 0, { radiusM: 3 }), fire('hero', 1500), fire('ally2', 3200), barrage(H(4, -36), 3800, 5, 14)],
      cam: RIG.crane({ side: 6, along: [12, 18], lift: [1.8, 10], fov: 46, look: [0, -12, 1] }) },
    { tMs: 4600, exposureMs: 25 }],
  [48, 'delta-crane', 'scene', 'Jade River Delta: the river village under fire, mountains beyond', S.dVillage,
    { lineup: [CAST.type96b, CAST.aft10, CAST.type96b], speed: 0, sun: 'side', effects: [...wreck('foe0'), fireField(H(8, -26), 0, { radiusM: 4 }), fire('hero', 1500), fire('ally1', 2600), barrage(H(-6, -40), 3500, 6, 14)],
      cam: RIG.crane({ side: -6, along: [12, 18], lift: [1.8, 11], fov: 46, look: [0, -14, 1] }) },
    { tMs: 4600, exposureMs: 25 }],
  // day light and an oblique drone, as 46: the steep drone view of the orchard rows in long shadow rendered nearly black
  // at sunset (r4c) and still dark at golden hour (r4d); the drone leads the column, looking back
  [49, 'orchard-sunset', 'scene', 'Orchard Valley: smoke drifts over the orchards', S.orGolden,
    { time: 'day', picture: { exposure: 0.2 }, speed: 1.5, effects: [...wreck('foe0'), fireField(H(-10, -22), 0, { radiusM: 4 }), ...incoming('foe1', 7, 2, 1700), fire('hero', 3500)],
      cam: RIG.drone({ side: -9, along: [34, 26], lift: [16, 13], fov: 46, look: [0, -8, 0] }) },
    { tMs: 3300, exposureMs: 25 }],
  // one of the few rear lenses kept: the lake lies beyond the burning village, ahead of the hero
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
// Media wave m1 (2026-10-07): the critics read the generic catalog patterns on heroes as toys (pixel-stepped blocks, a
// fabric-scale flecktarn); each such hero now wears a realistic vehicle-scale scheme of its own nation, one per shot.
export const PAINT = Object.freeze({
  1: ['paint_marder2', 'sig_t90a'], 2: ['paint_m1a1', 'service_soviet_coldwar'], 3: ['sig_leclerc', 'sig_t90'],
  4: ['sig_t90', 'service_leo2a6m'], 5: ['sig_object695_x', 'merdc'], 6: ['sig_kf51b', 'sig_t90a_vladimir'],
  7: ['service_strv122', 'service_soviet_coldwar'], 8: ['paint_m6_linebacker', 'sig_t90ms'], 9: ['sig_leo2a4_otco', 'sig_t90a'],
  10: ['sig_type100', 'rasputitsa'], 11: ['desert', 'paint_ru_t80u_modern'], 12: ['sig_t90ms', 'summer'],
  13: ['sig_k2b', null], 14: ['service_soviet_coldwar', 'merdcwinter'], 15: ['service_ariete_c1', 'service_soviet_coldwar'],
  16: ['paint_griffin_viper', 'sig_t90a'], 17: ['sig_challenger_3x', 'sig_t72m1_jaguar'], 18: ['service_leo2a6m', 'service_soviet_coldwar'],
  19: ['sig_pl01_105', 'paint_ru_t80u_modern'], 20: ['sig_ua_challenger2', 'sig_t90'], 21: ['sig_t90sm', 'service_leo2a6m'],
  22: ['sig_ua_t64bv', 'sig_t90a'], 23: ['paint_pl_t80u_modern', 'service_soviet_coldwar'], 24: ['paint_ares_apc_x', 'sig_t90a_vladimir'],
  25: ['service_leo2a4m', 'service_soviet_coldwar'], 26: ['sig_merkava3c', 'paint_amx40'], 27: ['sig_merkava4b', 'sig_t90ms'],
  28: ['sig_challenger2e', 'sig_t90'], 29: ['service_marder1a3', 'sig_t90a_vladimir'], 30: ['sig_k1a1', 'sig_t72m1_jaguar'],
  31: ['service_type99a', 'rasputitsa'], 32: ['service_usa_desert', 'sig_t90a'], 33: ['sig_ua_m1a1', 'sig_t90m'],
  34: ['sig_tos1a_tagil', 'service_leo2a6m'], 35: ['sig_type90a', 'service_soviet_coldwar'], 36: ['sig_type10b', 'paint_ru_t80u_modern'],
  37: ['sig_ztz99a2', 'sig_t90'], 38: ['sig_t90a_vladimir', 'merdcwinter'], 39: ['paint_chieftain5', 'sig_t90a'],
  40: ['sig_amx56', 'service_soviet_coldwar'], 41: ['sig_leo2a6_ua', 'sig_t90'], 42: ['merdc', 'paint_ru_t80u_modern'],
  43: ['sig_m551_sheridan', 'winter'], 44: ['sig_abramsx', 'sig_t90ms'], 45: ['sig_ares_apc_x', 'sig_t90a'],
  46: ['paint_cn_t80u_modern', 'rasputitsa'], 47: ['sig_t90a_burlak', 'summer'], 48: ['sig_ztz85_iii', 'sig_t72m1_jaguar'],
  49: ['sig_amx10p', 'service_soviet_coldwar'], 50: ['service_challenger_3', 'paint_ru_t80u_modern'],
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
// The motion plan (motion-search.mjs, owner 2026-10-05: the lens on a 3D track, fast tanks in every direction): a
// shot with an entry flies its routes and lens move in place of its own motion; SITE50_MOTION=0 restores the old.
const MOTION_PLAN_FILE = join(dirname(fileURLToPath(import.meta.url)), 'site50-motion.json');
const MOTION_PLAN = process.env.SITE50_MOTION !== '0' && existsSync(MOTION_PLAN_FILE) ? JSON.parse(readFileSync(MOTION_PLAN_FILE, 'utf8')) : {};
const OWN_MOTION = ['speed', 'curveDegS', 'foeSpeed', 'pinMs', 'cam', 'turrets', 'guns', 'turretKeys', 'turretSweep', 'keepWidth', 'frame', 'lookFrame', 'ease', 'stepMs'];
// Owner 2026-10-06 ("id like to see … as well!"): every vehicle on the list leads a take. A hero that led several takes
// (the Stridsvagn 122 five, the T-14 four, the Leopard 2A6 and the T-90SM three, six more two) keeps its first; the
// others go to the list, each on a battlefield and among allies of its own nation and kind, against an opposing
// force (`foes`, where the take's own enemies were the hero's side). The M6 Linebacker on the list joined the fleet with
// the 2026-10-07 merge: it leads the Abrams column through Sunscar's market street (s08) in its three-tone desert.
const RU_FOES = [CAST.t72b3, CAST.t90a, CAST.t80u];
const RECAST = {
  8: { lineup: [CAST.m6, CAST.m1a2, CAST.tusk] },
  16: { lineup: [CAST.griffin, CAST.sepv2] },
  17: { lineup: [CAST.challenger3, CAST.challenger2e, CAST.warrior] },
  19: { lineup: [CAST.pl01, CAST.husarz, CAST.leo2a5] },
  20: { lineup: [CAST.challenger2UA, CAST.leo2a6UA, CAST.hetman2], foes: [CAST.t72b3, CAST.t90m, CAST.t80u] },
  22: { lineup: [CAST.hetman2, CAST.challenger2UA, CAST.leo2a6UA], foes: RU_FOES },
  23: { lineup: [CAST.husarz, CAST.pl01, CAST.leo2a5], foes: [CAST.t90a, CAST.t72b3] },
  24: { lineup: [CAST.warrior, CAST.challenger2e, CAST.ajax] },
  28: { lineup: [CAST.challenger2e, CAST.challenger3, CAST.ajax] },
  34: { lineup: [CAST.tos1a, CAST.t90m, CAST.t90ms] },
  37: { lineup: [CAST.vt4a1, CAST.type96_72m, CAST.ztz100] },
  41: { lineup: [CAST.leo2a6UA, CAST.challenger2UA, CAST.abramsUA] },
  42: { lineup: [CAST.sepv2, CAST.sepv3, CAST.m1a3], foes: RU_FOES },
  43: { lineup: [CAST.m551, CAST.griffin] },
  44: { lineup: [CAST.m1a3, CAST.sepv3, CAST.griffin] },
  45: { lineup: [CAST.ajax, CAST.warrior, CAST.challenger3] },
  47: { lineup: [CAST.burlak, CAST.t90a, CAST.t14] },
  48: { lineup: [CAST.type96_72m, CAST.vt4a1, CAST.type96b] },
};
// The battlefield as the engine holds it (world-model.mjs, from a features dump that carries its records), per map;
// MEDIA_R5_FEATURES points at another dump (a fresh one under review).
const models = new Map();
const modelOf = (map) => {
  if (!models.has(map)) {
    const f = join(process.env.MEDIA_R5_FEATURES ?? join(SHOTS_DIR, 'features'), `features-${map}.json`);
    models.set(map, existsSync(f) ? worldModel(JSON.parse(readFileSync(f, 'utf8'))) : null);
  }
  return models.get(map);
};
/**
 * Where each parked foe moves to stand clear (lab.mjs autoPlace's spiral, offline, against the records): its own
 * contact rectangle (hull-dims.json) with 0.8 m to spare touches no record, the ground is under 0.2 slope, dry unless the set drives on
 * water, and 9 m from every other tank where it starts. [dx, dz] per foe index, or null when every foe is clear.
 */
function parkNudges(scene, model) {
  const water = waterBlocks(scene), half = (model.size ?? 1024) / 2 - 60, contacts = [];
  const others = scene.actors.filter((a) => !a.name.startsWith('foe')).map((a) => a.pos);
  const clear = (x, z, yawRad, [hl, hw]) => Math.abs(x) < half && Math.abs(z) < half && model.slopeAt(x, z) < 0.2
    && (!water || model.wetAt(x, z) < 0.3) && !model.hullContacts(x, z, yawRad, hl + 0.8, hw + 0.8, contacts).length
    && others.every(([ox, oz]) => Math.hypot(ox - x, oz - z) > 9);
  let moved = false;
  const nudge = scene.actors.filter((a) => a.name.startsWith('foe')).map((a) => {
    const [x, z] = a.pos, yaw = (a.facingDeg ?? 0) * Math.PI / 180, hull = hullOf(a.id);
    let spot = clear(x, z, yaw, hull) ? [x, z] : null;
    for (let ring = 1; ring < 14 && !spot; ring++) for (let k = 0; k < 16 && !spot; k++) {
      const ang = k / 16 * Math.PI * 2 + ring * 0.37, px = x + Math.cos(ang) * ring * 3, pz = z + Math.sin(ang) * ring * 3;
      if (clear(px, pz, yaw, hull)) spot = [px, pz];
    }
    others.push(spot ?? [x, z]);
    if (!spot || (spot[0] === x && spot[1] === z)) return [0, 0];
    moved = true;
    return [+(spot[0] - x).toFixed(2), +(spot[1] - z).toFixed(2)];
  });
  return moved ? nudge : null;
}
export function siteScene([n, id, kind, title, setRef, ownFilm, still]) {
  const planned = !ownFilm.routes ? MOTION_PLAN[n] : null;
  const film = planned ? { ...Object.fromEntries(Object.entries(ownFilm).filter(([k]) => !OWN_MOTION.includes(k))), ...Object.fromEntries(Object.entries(planned).filter(([k]) => k !== 'note' && k !== 'checks')) } : ownFilm;
  const set = typeof setRef === 'string' ? setById(setRef) : setRef;
  const time = film.time ?? set.time;
  const base = { ...set, time: T(time), picture: pictureFor({ ...set, time }, { ...SITE_LENS, ...(film.picture ?? {}) }), light: set.light,
    ...(film.formation ? { formation: film.formation } : {}), ...(film.count ? { count: film.count } : {}),
    ...(film.lineup ? { lineup: film.lineup } : {}), ...('enemies' in film ? { enemies: film.enemies } : {}),
    ...(film.anchor ? { anchor: film.anchor } : {}), ...(film.heading != null ? { heading: film.heading } : {}) };
  const recast = RECAST[n];
  if (recast) {
    base.lineup = recast.lineup;
    if (recast.foes && base.enemies) base.enemies = { ...base.enemies, lineup: recast.foes };
  }
  const [camo, foeCamo] = PAINT[n] ?? [];
  if (camo) base.camo = camo;
  if (foeCamo && base.enemies) base.enemies = { ...base.enemies, camo: foeCamo };
  // parked foes stand clear of the props (2026-10-06: with the lab's spiral nudge off for routed takes, two stood in
  // Verdant's schoolhouse): placed off them here, against the battlefield's own records, before any gun aims at them
  const model = base.enemies ? modelOf(set.map) : null;
  if (model) {
    const nudge = parkNudges(buildShot(base, { durMs: DUR, ...film, still }), model);
    if (nudge) base.enemies = { ...base.enemies, nudge };
  }
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
  // A moving shot that keys `aim` keeps its guns on their targets through the swerves (stabilised); the choreographer's
  // hull-relative sweeps would fight that, so it stands down and the shot's own rounds go where the guns point.
  const style = turretStyle(n);
  const choreo = film.aim ? { turrets: undefined, guns: undefined, effects: [], notes: ['stabilised: ' + Object.entries(film.aim).map(([a, b]) => `${a} on ${b}`).join(', ')] }
    : choreograph(scene, { loopMs: LOOP_MS, xfadeMs: XFADE_MS, style });
  scene = buildShot(base, { durMs: DUR, ...film, cam: lens, still, turrets: choreo.turrets, guns: choreo.guns,
    effects: [...(film.effects ?? []), ...choreo.effects] });
  // a routed take is placed and checked against the props by the planner (route-check.mjs propProblems): the lab's
  // spiral nudge would shift its routes off the checked lines
  if (set.autoPlace === false || film.routes) scene.autoPlace = false;
  const burstWorld = film.routes ? modelOf(set.map) : null;
  if (burstWorld) clearBursts(scene, burstWorld);
  // effects on a tank the take does not stage (2026-10-08: S38's re-plan dropped its ally to fit the route, and the ally's
  // two rounds left in its effects spun the Studio's page at 100 % CPU in two engine-review runs)
  const staged = new Set(scene.actors.map((a) => a.name));
  scene.effects = scene.effects.filter((e) => !e.actor || staged.has(e.actor));
  const beats = burstWorld ? stageBeats(scene, burstWorld) : 0;
  if (set.allowWater) for (const a of scene.actors) a.allowWater = true;
  const az = LIGHT_READY ? sunFor(scene, film.sun ?? set.sun, time) : null;
  if (az != null) scene.light = { ...(scene.light ?? {}), sunAzimuthDeg: az };
  const hero = scene.actors[0]?.id;
  // the stills the finals render at 4K (lens-check.mjs stillMoments; owner 2026-10-06: "the stills from those are nice,
  // will we use them too?"): the designated moment where the hero stands centred and clear, and the close portrait
  const world = modelOf(set.map), moments = world && scene.still ? stillMoments(scene, world, scene.still.tMs) : null;
  if (moments && moments[0] !== scene.still.tMs) scene.still = { ...scene.still, tMs: moments[0] };
  if (moments?.length > 1) scene.stillsExtra = moments.slice(1);
  // Crisp stills (owner 2026-10-06: "weird blur ... remove that"). The table's 25 to 33 ms exposures came from round
  // four's near-still cameras; round six's lens moves fast, so 25 ms smeared the whole 4K frame (more than twice the
  // film's own 11 ms shutter). A still exposes STILL_EXPOSURE_MS at most: motion reads, the frame stays sharp.
  if (scene.still && (scene.still.exposureMs ?? 0) > STILL_EXPOSURE_MS) scene.still = { ...scene.still, exposureMs: STILL_EXPOSURE_MS };
  scene.meta = { n, id: `s${String(n).padStart(2, '0')}-${id}`, kind, title, set: set.id, map: set.map, time, hero, heroName: CAST_NAMES[hero]?.[0] ?? hero,
    loopMs: LOOP_MS, xfadeMs: XFADE_MS, still: scene.still ?? still, ...(scene.stillsExtra ? { stillsExtra: scene.stillsExtra } : {}),
    paint: { unit: base.camo, enemy: base.enemies ? base.enemies.camo ?? base.camo : null },
    turrets: { style, plan: choreo.notes }, ...(cameraFix ? { cameraFix } : {}), ...(beats ? { beats } : {}) };
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
