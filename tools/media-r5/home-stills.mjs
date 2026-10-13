#!/usr/bin/env node
// The home page's staged mechanic stills (owner 2026-10-12: "update all of these images to use new shots that are a lot
// better! and add far more mechanics"; shots/media-r5/home-r2/shot-list.json, kind studio-still). Each is a Studio scene
// built like the site's key-art stills (setups.mjs buildScene): its tanks on a battlefield set, the effect that shows the
// mechanic timed to the still's moment (fxTime), and low front three-quarter lenses to choose from (cameraVariants).
// The lab renders them (review, then 3840 px); the pick is copied to the slot's deliver path. Crushing, map vehicles and
// the night are frames from delivered takes instead (a real crush, a real truck flattened, a real night fight).
//
// Round 3 (2026-10-13, after the second review): a Studio impact on an actor lands at the hull's centre with its normal
// straight up, so the ricochet and ERA hits read as a white crown over the turret. Hits now stand on the armour
// (`armor`: a point and its plate's outward normal in the hull or turret frame, seated on the surveyed ground), the
// ricochet throws its round off along the reflected line, and the lenses stand in the hero's own frame (round 2's sat in
// the set's frame, so a hull yawed 40° to it was filmed from the side).
//   node tools/media-r5/home-stills.mjs [outDir=shots/media-r5/home-r2/scenes] [ids]
//   node tools/media-r5/home-stills.mjs --check [ids]   the lenses and footprints against the survey, no files written
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import '../../src/vehicles/tankFactory.ts';
import { TANK_SPECS } from '../../src/vehicles/specs.ts';
import { signatureCamoPatternId, stockCamoPatternIdFor } from '../../src/vehicles/camoPolicy.ts';
import { buildScene, fire, dust, exhaust, debris, shockwave, smokeScreen, boom, H } from './setups.mjs';
import { worldModel, sightBlockers, insideRecord } from './world-model.mjs';
import { SHOTS } from './paths.mjs';

const DEG = Math.PI / 180;
const own = (id) => signatureCamoPatternId(id) ?? stockCamoPatternIdFor(id, TANK_SPECS[id]?.nation, TANK_SPECS[id]?.era);
const CLEAN = { grain: { amount: 0.05, size: 1, color: 0.1, response: 0.7 }, vignette: { amount: 0.22, roundness: 0.55, softness: 0.65 }, dof: { enabled: false }, chromaticAberration: 0 };
// autoPlace off: the lab's placement moves any hull within 9 m of another or 4 m of a record, which pulled round 2's
// rammed Leopard 3-6 m clear of the T-90M and would leave the armour points behind; `--check` holds the footprints instead
const still = (id, map, time, seed, anchor, heading, hero, more) => ({ id, map, time, seed, anchor, heading, lineup: [hero],
  formation: [[0, 0]], camo: own(hero), picture: CLEAN, aimAtFoes: true, autoPlace: false, ...more });

/** A point on an actor's armour: [side (+ right), up (over the ground under the hull), along (+ forward)] in its hull
 * frame, or in its turret's when `turret` names the ring's distance ahead of the hull centre (m); `normal` is the
 * plate's outward normal in the same frame; the point stands `out` m off the plate. */
const armor = (actor, at, normal = [0, 1, 0], { turret = null, out = 0.06 } = {}) => ({ armor: { actor, at, normal, turret, out } });
const hit = (at, tMs, kind, caliberMm = 120) => ({ type: 'impact', at, tMs, params: { kind, caliberMm } });
/** The round glancing off along the reflected line (the shooter's muzzle to the plate, mirrored in its normal). */
const deflect = (at, shooter, tMs, extra = {}) => ({ type: 'tracer', deflect: { at, shooter }, tMs, params: { shellType: 'APFSDS', speedMps: 700, caliberMm: 120, ...extra } });
const moment = (actor, tMs, ageS, slot = 0) => ({ type: 'firing_moment', actor, tMs, params: { ageS, slot } });
/** A lens in the hero's own frame: side (+ right), along (+ forward), lift over the ground; look = [side, along, height]. */
const lens = (name, side, along, lift, fov, look = [0, 1.5, 1.6]) => ({ name, side, along, lift, fov, look });

/** A point on a building's wall: the surveyed building nearest `near` ([x, z]), where the line from its centre to the
 * hero leaves its footprint, `up` m up the wall and `out` m off it. */
const wall = (near, up = 2.5, out = 0.3) => ({ wall: { near, up, out } });
/** The rammed hull (extraActors): its flank met by the hero's front-right corner `angleDeg` off square, the contact
 * `aftM` behind its centre, its turret fore. */
const rammed = (id, angleDeg, aftM) => (scene) => {
  const hero = scene.actors[0], hd = TANK_SPECS[hero.id].dims, fd = TANK_SPECS[id].dims, a = angleDeg * DEG, { f, r } = axes(hero.facingDeg);
  // in the hero frame [side, along]: the corner, the flank's run (to the hero's left and on) and its outward normal
  const q = [hd.widthM / 2, hd.hullLengthM / 2 + 0.03], u = [-Math.cos(a), Math.sin(a)], m = [-Math.sin(a), -Math.cos(a)];
  const c = [q[0] - m[0] * fd.widthM / 2 + u[0] * aftM, q[1] - m[1] * fd.widthM / 2 + u[1] * aftM];
  const pos = [hero.pos[0] + r[0] * c[0] + f[0] * c[1], hero.pos[1] + r[1] * c[0] + f[1] * c[1]];
  const dir = [r[0] * u[0] + f[0] * u[1], r[1] * u[0] + f[1] * u[1]];
  return [{ id, name: 'foe0', pos: pos.map(r2), facingDeg: r2(Math.atan2(dir[0], dir[1]) / DEG), turretDeg: 0, gunDeg: 1, camo: own(id), camoSeed: 4217 }];
};
// the T-90M's upper glacis (sloped 54° from vertical), mid-plate
const T90M_GLACIS = [[0, 1.08, 3.0], [0, 0.81, 0.585]];
// Verdant's farmhouse, 16 m by 9 m (features-verdant.json)
const FARMHOUSE = [26.5, -34.2];

export const HOME_STILLS = [
  // a 120 mm round glancing off the T-90M's sloped glacis, the hull angled 40° to the shooter: the spark fan off the
  // plate and the round itself skipping off on the reflected line
  still('ricochet', 'winter', 'day', 801, [-78, -13.3], 4, 't90m_x', { formation: [[0, 0, { yaw: 40 }]],
    enemies: { along: 280, lat: 25, count: 1, formation: 'line', lineup: ['leo2a7v_x'], camo: own('leo2a7v_x') },
    effects: [fire('foe0', 0, { tracer: false }), hit(armor('hero', ...T90M_GLACIS), 250, 'ricochet'),
      deflect(armor('hero', ...T90M_GLACIS), 'foe0', 250), dust('hero', 0, 6, 0.6)],
    fxTime: 295, lenses: [lens('front-r', 5, 8.5, 0.7, 40, [0, 2.6, 1.5]), lens('front-l', -5, 8.5, 0.7, 40, [0, 2.6, 1.5]),
      lens('low', 3, 7, 0.4, 46, [0, 2.5, 1.8])] }),
  // the firing line on open steppe at golden hour (round 2's rail yard hid the third tank behind its sheds from every
  // lens): the lead Abrams' APFSDS leaving in its blast, the second's HEAT a beat older, the Challenger's HE older still,
  // and an enemy HE round throwing soil short of the wedge
  // round 4: round 3 was lit from behind the wedge (silhouettes in the glare); the sun now stands behind the lens
  still('ammunition', 'steppe', 'golden', 802, [-41, -181.3], 280.3, 'm1a2_sepv3_x', { lineup: ['m1a2_sepv3_x', 'm1a2_sepv3_x', 'challenger_3x'],
    light: { sunAzimuthDeg: 300 },
    formation: [[0, 0], [-6, -12], [11, -14]], count: 3,
    enemies: { along: 500, lat: 0, count: 2, formation: 'pair', lineup: ['t90m_x', 't72b3m'], camo: own('t90m_x') },
    effects: [boom(H(8, -3), 150, 'small', { munition: 'he', cause: 'shot' }), dust('hero', 380, 8, 0.7),
      moment('hero', 400, 0.035, 0), moment('ally1', 400, 0.09, 1), moment('ally2', 400, 0.16, 2)],
    fxTime: 400, lenses: [lens('front', -2, 15, 0.5, 46, [0, -7, 2.0]), lens('front-close', -1.5, 11, 0.45, 52, [0, -6, 2.1]),
      lens('low', 0, 13, 0.35, 50, [0, -6, 2.2])] }),
  // explosive reactive armor firing on the T-72B3M's left turret cheek, the side its turret has swung to the shooter
  still('era', 'verdant', 'day', 803, [6.7, -64], 191, 't72b3m', { formation: [[0, 0, { yaw: -15 }]],
    enemies: { along: 250, lat: -10, count: 1, formation: 'line', lineup: ['leo2a6_x'], camo: own('leo2a6_x') },
    effects: [fire('foe0', 0, { tracer: false }), hit(armor('hero', [-0.8, 1.85, 1.25], [-0.45, 0.2, 0.87], { turret: 0.3 }), 300, 'era'),
      debris(armor('hero', [-0.8, 1.85, 1.25], [-0.45, 0.2, 0.87], { turret: 0.3, out: 0.2 }), 305, { count: 18, speedMps: 14, hot: 0.6, scale: 0.8 })],
    fxTime: 340, lenses: [lens('front-l', -5, 8.5, 0.75, 38, [-0.4, 1.6, 1.8]), lens('left-low', -6, 6, 0.45, 40, [-0.4, 1.3, 1.7]),
      lens('front', -2, 10, 0.9, 34, [-0.3, 1.5, 1.7])] }),
  // the Leopard 2A7V's smoke salvo blooming into a wall as it reverses (round 2's 'right' lens is the pick: unchanged)
  still('smoke', 'urban', 'day', 804, [-150, 0], 90, 'leo2a7v_x', { autoPlace: true,
    effects: [smokeScreen('hero', 0), exhaust('hero', 0), dust('hero', 0, 10, 0.8)], fxTime: 2800,
    lenses: [lens('right', 6, 11, 0.9, 40, [0, 0, 1.6])] }),
  // an FPV drone bursting on the M1A1's roof cage (round 2's T-84 behind stood in a yard's props, out of every lens: gone)
  still('field-kit', 'saltwind', 'morning', 805, [5.9, 5], 343.8, 'ua_m1a1', {
    effects: [hit(armor('hero', [0.3, 3.3, 0.2]), 0, 'he', 40),
      boom(armor('hero', [0.3, 3.35, 0.2], [0, 1, 0], { out: 0.1 }), 0, 'small', { munition: 'drone_fpv', cause: 'shot' }),
      debris(armor('hero', [0.3, 3.35, 0.2], [0, 1, 0], { out: 0.2 }), 10, { count: 16, speedMps: 10, hot: 0.5, scale: 0.7 })],
    fxTime: 70, lenses: [lens('low', -3.6, 7.2, 0.54, 41, [0, 0, 2.6]), lens('left', -6, 9, 0.9, 38, [0, 0, 2.4]),
      lens('low-r', 3.6, 7.2, 0.54, 41, [0, 0, 2.6])] }),
  // Verdant's farmhouse (16 m by 9 m) coming down behind the T-14 that put an HE round into it as it drove clear, its
  // turret still turned back on it and the muzzle smoke hanging: the roof gone, the walls crumbling along the collapse
  // front 1.6 s into its 4.2 s (fx/structureMask.ts COLLAPSE_S), the blast's dust rolling out. Two stands from the survey
  // probe (shots/media-r5/tmp/house-probe.mjs), each clear of records with the house 20-22° beside the hero in the lens.
  // round 4: round 3's medium HE burst smoked the house out of every lens at 1.6 s, and stand B's lenses met a tree and
  // a wall; stand A only, a small burst, the collapse at 0.8, 1.2 and 1.6 s, and a wider lens for more of the house
  ...[['buildings', 1900], ['buildings-12', 1500], ['buildings-08', 1100]].map(([id, fxTime]) =>
    still(id, 'verdant', 'day', 807, [19.8, -9.1], 345, 't14_x', { slot: 'buildings', aimAtFoes: false, turret: 180,
      effects: [fire('hero', 250, { tracer: false }),
        boom(wall(FARMHOUSE, 2.5), 290, 'small', { munition: 'he', cause: 'shot' }),
        { type: 'structure', at: FARMHOUSE, tMs: 300, params: { stage: 'collapsed', cause: 'blast', munition: 'he', dirDeg: 165, hitH: 2.5 } },
        debris(wall(FARMHOUSE, 3), 300, { count: 40, speedMps: 16, hot: 0.3, scale: 1.2 }), shockwave(wall(FARMHOUSE, 0.5), 300, { radiusM: 18 }),
        exhaust('hero', fxTime - 200), dust('hero', fxTime - 150, 8, 0.7)],
      fxTime, lenses: [lens('front-r', 4.5, 7.8, 0.7, 46, [1, -8, 3]), lens('front-r-wide', 6, 12.5, 0.8, 50, [3, -12, 3.5])] })),
  // round 5: from stand A the house stood 34-39 m off the lens, a fifth of the frame's height, and its collapse read as a
  // smoke puff behind the T-14; stand C keeps the T-14 12 m south of the house (7.5 m off its wall, turret reversed on
  // it), so the house fills a third of the frame; its moment comes from a time series (600-2400 ms)
  still('buildings-c', 'verdant', 'day', 807, [20.5, -44.6], 210, 't14_x', { slot: 'buildings', aimAtFoes: false, turret: 180,
    effects: [fire('hero', 250, { tracer: false }),
      boom(wall(FARMHOUSE, 2.5), 290, 'small', { munition: 'he', cause: 'shot' }),
      { type: 'structure', at: FARMHOUSE, tMs: 300, params: { stage: 'collapsed', cause: 'blast', munition: 'he', dirDeg: 30, hitH: 2.5 } },
      debris(wall(FARMHOUSE, 3), 300, { count: 40, speedMps: 16, hot: 0.3, scale: 1.2 }), shockwave(wall(FARMHOUSE, 0.5), 300, { radiusM: 18 }),
      exhaust('hero', 1000), dust('hero', 1050, 8, 0.7)],
    fxTime: 1200, lenses: [lens('r40', 5.8, 6.9, 0.7, 46, [2, -8, 3]), lens('l40', -5.8, 6.9, 0.7, 46, [-2, -8, 3]),
      lens('r30w', 6, 10.4, 0.8, 50, [2.5, -10, 3.5])] }),
  // a T-90M ramming a Leopard 2A6 at the moment of contact: its front-right corner meets the Leopard's flank 22° off
  // square, 1.5 m behind the Leopard's centre, in a shower of sparks out of the wedge between nose and flank (a square
  // T-bone hides the contact behind the rammed hull from every front three-quarter lens)
  still('impact', 'desert', 'golden', 808, [0, 0], 118.4, 't90m_x', { aimAtFoes: false, extraActors: rammed('leo2a6_x', 22, 1.5),
    effects: [{ type: 'sparks', at: armor('hero', [1.75, 0.95, 3.46], [-0.375, 0.3, -0.927], { out: 0.1 }), tMs: 0, params: { caliberMm: 120 } },
      { type: 'sparks', at: armor('hero', [1.6, 1.1, 3.5], [-0.3, 0.45, -0.85], { out: 0.1 }), tMs: 25, params: { caliberMm: 90 } },
      debris(armor('hero', [1.75, 0.95, 3.46], [-0.375, 0.3, -0.927], { out: 0.2 }), 5, { count: 8, speedMps: 6, hot: 0.3, scale: 0.4 }),
      dust('hero', 0, 14, 1), { type: 'dust', actor: 'foe0', tMs: 0, params: { count: 14, intensity: 1, dirDeg: 118.4 } },
      { type: 'armor_scar', actor: 'foe0', tMs: 0, params: {} }],
    fxTime: 50, lenses: [lens('front-l', -5.5, 7.5, 0.6, 44, [0.8, 3.6, 1.0]), lens('front-l2', -4, 9.5, 0.45, 46, [0.8, 3.6, 1.1]),
      lens('left-low', -6.5, 5, 0.4, 46, [0.5, 3.4, 1.0]), lens('front-l3', -7, 9.5, 0.5, 40, [0.5, 3.5, 1.0])] }),
  // the Strv 103 aimed up on its hydropneumatic suspension, firing
  still('suspension', 'winter', 'day', 809, [-78, 26.7], 4, 'strv103', { aimAtFoes: false,
    enemies: { along: 320, lat: -30, count: 1, formation: 'line', lineup: ['t90m_x'], camo: own('t90m_x') },
    effects: [moment('hero', 300, 0.04, 0), dust('hero', 290, 3, 0.4)], suspensionAimDeg: 10,
    fxTime: 300, lenses: [lens('front-l', -5.5, 8, 0.5, 40, [0, 1.5, 1.4]), lens('front-r', 5.5, 8, 0.5, 40, [0, 1.5, 1.4]),
      lens('low', -2.5, 9, 0.35, 44, [0, 1.5, 1.6])] }),
];

/** The battlefield as the lens checks hold it (the lab's features dump) and its world model, one per map. */
const featuresOf = (() => {
  const cache = new Map();
  return (map) => {
    if (!cache.has(map)) {
      const file = join(SHOTS, 'features', `features-${map}.json`);
      const features = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
      cache.set(map, features ? { features, model: worldModel(features) } : { features: null, model: null });
    }
    return cache.get(map);
  };
})();
const modelOf = (map) => featuresOf(map).model;
/** A wall marker's world point (the footprint as world-model.mjs turns an OBB: across = w, along = d, by rot). */
function wallPoint(scene, map, { near, up, out }) {
  const { features, model } = featuresOf(map), hero = scene.actors[0];
  const b = features.buildings.reduce((best, x) => (Math.hypot(x.x - near[0], x.z - near[1]) < Math.hypot(best.x - near[0], best.z - near[1]) ? x : best));
  const dx = hero.pos[0] - b.x, dz = hero.pos[1] - b.z, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
  const c = Math.cos(b.rot), s = Math.sin(b.rot), lx = ux * c - uz * s, lz = ux * s + uz * c;
  const t = Math.min(Math.abs(lx) > 1e-6 ? b.w / 2 / Math.abs(lx) : Infinity, Math.abs(lz) > 1e-6 ? b.d / 2 / Math.abs(lz) : Infinity) + out;
  const x = b.x + ux * t, z = b.z + uz * t;
  return [x, model.heightAt(x, z) + up, z];
}
const axes = (yawDeg) => { const f = [Math.sin(yawDeg * DEG), Math.cos(yawDeg * DEG)]; return { f, r: [-f[1], f[0]] }; };
const r2 = (v) => +v.toFixed(2);

/** Seat an armour marker on the scene's actors: the world point and the plate's world normal. */
function seat(scene, model, m) {
  const a = scene.actors.find((x) => x.name === m.actor);
  if (!a) throw new Error(`${scene.meta?.id ?? '?'}: no actor ${m.actor}`);
  const hull = axes(a.facingDeg), frame = m.turret != null ? axes(a.facingDeg + (a.turretDeg ?? 0)) : hull;
  const ox = a.pos[0] + (m.turret != null ? hull.f[0] * m.turret : 0), oz = a.pos[1] + (m.turret != null ? hull.f[1] * m.turret : 0);
  const [side, up, along] = m.at, [ns, nu, na] = m.normal;
  let nx = frame.r[0] * ns + frame.f[0] * na, ny = nu, nz = frame.r[1] * ns + frame.f[1] * na;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  const ground = model ? model.supportAt(a.pos[0], a.pos[1]) : 0;
  return { p: [ox + frame.r[0] * side + frame.f[0] * along + nx * m.out, ground + up + ny * m.out, oz + frame.r[1] * side + frame.f[1] * along + nz * m.out], n: [nx, ny, nz] };
}

/**
 * The lab's placement (lab.mjs autoPlace), replayed on the survey: each actor in turn to the nearest spot on a widening
 * spiral (3 m rings, 16 bearings) under the slope limit, dry, 4 m clear of every record's box over 0.6 m and 9 m from
 * the actors placed before it; the lenses follow the hero. cinema.mjs renders a scene as written, so a still the lab
 * reviewed with placement on is baked with it before its final.
 */
export function labPlace(scene) {
  const { features, model } = featuresOf(scene.map), moves = [];
  if (!model || scene.autoPlace === false) return moves;
  const boxes = features.obstacles.map((o) => o.b).filter((b) => b[4] - b[1] > 0.6);
  const blocked = (x, z, r = 4) => boxes.some((b) => x > b[0] - r && x < b[3] + r && z > b[2] - r && z < b[5] + r);
  const placed = [], ok = (x, z, a) => model.slopeAt(x, z) < (scene.maxSlope ?? 0.16) && !blocked(x, z)
    && (a.allowWater || model.wetAt(x, z) < 0.3) && placed.every((p) => Math.hypot(p[0] - x, p[1] - z) > 9);
  for (const a of scene.actors) {
    let best = ok(a.pos[0], a.pos[1], a) ? a.pos : null;
    for (let ring = 1; ring < 14 && !best; ring++) for (let k = 0; k < 16 && !best; k++) {
      const ang = k / 16 * Math.PI * 2 + ring * 0.37, x = a.pos[0] + Math.cos(ang) * ring * 3, z = a.pos[1] + Math.sin(ang) * ring * 3;
      if (ok(x, z, a)) best = [x, z];
    }
    if (best && best !== a.pos) moves.push({ name: a.name, from: a.pos, to: best, m: +Math.hypot(best[0] - a.pos[0], best[1] - a.pos[1]).toFixed(1) });
    if (best) a.pos = best;
    placed.push(a.pos);
  }
  const hero = moves.find((m) => m.name === 'hero');
  if (hero) {
    const dx = hero.to[0] - hero.from[0], dz = hero.to[1] - hero.from[1];
    for (const c of [scene.camera, ...(scene.cameraVariants ?? [])]) {
      if (!c) continue;
      c.pos = [r2(c.pos[0] + dx), c.pos[1], r2(c.pos[2] + dz)];
      if (c.lookAt) c.lookAt = [r2(c.lookAt[0] + dx), c.lookAt[1], r2(c.lookAt[2] + dz)];
    }
    for (const fx of scene.effects) if (fx.heroRel && Array.isArray(fx.at) && fx.at.length === 2) fx.at = [r2(fx.at[0] + dx), r2(fx.at[1] + dz)];
  }
  for (const a of scene.actors) a.pos = a.pos.map(r2);
  scene.autoPlace = false;
  return moves;
}

/** One still's scene: buildScene, then its armour points seated, its deflections aimed, its lenses in the hero frame. */
export function homeScene(s) {
  const scene = buildScene(s), model = modelOf(s.map);
  scene.meta = { id: s.id, kind: 'home-still', slot: `mechanics/${s.slot ?? s.id}` };
  for (const extra of s.extraActors?.(scene, model) ?? []) scene.actors.push(extra);
  if (s.suspensionAimDeg != null) scene.actors[0].suspensionAimDeg = s.suspensionAimDeg;
  if (s.autoPlace === false) scene.autoPlace = false;
  scene.effects = scene.effects.map((fx) => {
    if (fx.at?.wall) {
      const { at: _at, ...rest } = fx;
      return { ...rest, at: wallPoint(scene, s.map, fx.at.wall).map(r2) };
    }
    if (fx.at?.armor) {
      const { p, n } = seat(scene, model, fx.at.armor), { at: _at, ...rest } = fx;
      // the actor it stands on, for the check (its own hull is not in its way); not written to the scene
      return Object.defineProperty({ ...rest, at: p.map(r2), params: { ...fx.params, ...(fx.type === 'impact' || fx.type === 'sparks' ? { normal: n.map(r2) } : {}) } },
        'onActor', { value: fx.at.armor.actor, enumerable: false });
    }
    if (fx.deflect) {
      const { p, n } = seat(scene, model, fx.deflect.at.armor), shooter = scene.actors.find((x) => x.name === fx.deflect.shooter);
      const gy = model ? model.supportAt(shooter.pos[0], shooter.pos[1]) : 0, muzzleY = gy + (TANK_SPECS[shooter.id]?.dims?.heightM ?? 2.4) * 0.8;
      let d = [p[0] - shooter.pos[0], p[1] - muzzleY, p[2] - shooter.pos[1]];
      const dl = Math.hypot(...d);
      d = d.map((v) => v / dl);
      const dn = d[0] * n[0] + d[1] * n[1] + d[2] * n[2], out = d.map((v, k) => v - 2 * dn * n[k]);
      const from = p.map((v, k) => v + n[k] * 0.25), { deflect: _d, ...rest } = fx;
      return { ...rest, from: from.map(r2), to: from.map((v, k) => r2(v + out[k] * 400)) };
    }
    return fx;
  });
  const hero = scene.actors[0], { f, r } = axes(hero.facingDeg);
  const at = (side, along) => [hero.pos[0] + r[0] * side + f[0] * along, hero.pos[1] + r[1] * side + f[1] * along];
  scene.cameraVariants = (s.lenses ?? []).map((c) => {
    const p = at(c.side, c.along), q = at(c.look[0], c.look[1]);
    return { name: c.name, pos: [r2(p[0]), c.lift, r2(p[1])], lookAt: [r2(q[0]), c.look[2], r2(q[1])], fov: c.fov, rollDeg: 0, groundRel: true };
  });
  if (scene.cameraVariants.length) scene.camera = { ...scene.cameraVariants[0] };
  return scene;
}

// --- the survey check: footprints, lenses, sightlines ---------------------------------------------------------------
const boxHit = (a, b, min, max) => {
  let t0 = 0, t1 = 1;
  for (let k = 0; k < 3; k++) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-9) { if (a[k] < min[k] || a[k] > max[k]) return false; continue; }
    let u0 = (min[k] - a[k]) / d, u1 = (max[k] - a[k]) / d;
    if (u0 > u1) [u0, u1] = [u1, u0];
    t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
    if (t0 > t1) return false;
  }
  return true;
};
/** Does the segment a→b cross an actor's hull box (its hull length and width, its height, seated on the ground)? */
function hullBlocks(model, actor, a, b) {
  const dims = TANK_SPECS[actor.id]?.dims;
  if (!dims) return false;
  const gy = model.supportAt(actor.pos[0], actor.pos[1]), c = Math.cos(actor.facingDeg * DEG), s = Math.sin(actor.facingDeg * DEG);
  const local = (p) => { const dx = p[0] - actor.pos[0], dz = p[2] - actor.pos[1]; return [dx * c - dz * s, p[1], dx * s + dz * c]; };
  return boxHit(local(a), local(b), [-dims.widthM / 2, gy + 0.2, -dims.hullLengthM / 2], [dims.widthM / 2, gy + (dims.silhouetteHeightM ?? dims.heightM), dims.hullLengthM / 2]);
}
function effectPoint(scene, model, fx) {
  if (Array.isArray(fx.at)) return fx.at.length >= 3 ? fx.at : [fx.at[0], model.heightAt(fx.at[0], fx.at[1]) + 0.4, fx.at[1]];
  const a = fx.actor != null && scene.actors.find((x) => x.name === fx.actor);
  if (a) return [a.pos[0], model.supportAt(a.pos[0], a.pos[1]) + (TANK_SPECS[a.id]?.dims?.heightM ?? 2.4) * 0.55, a.pos[1]];
  return null;
}
export function checkScene(scene) {
  const model = modelOf(scene.map), lines = [];
  if (!model) return [`${scene.meta.id}: no survey for ${scene.map}`];
  for (const a of scene.actors) {
    const dims = TANK_SPECS[a.id]?.dims, contacts = dims ? model.hullContacts(a.pos[0], a.pos[1], a.facingDeg * DEG, dims.hullLengthM / 2, dims.widthM / 2) : [];
    if (contacts.length || model.wetAt(a.pos[0], a.pos[1]) > 0.3 || model.slopeAt(a.pos[0], a.pos[1]) > 0.15) {
      lines.push(`  ${a.name} (${a.id}): footprint ${contacts.map((r) => r.kind).join(', ') || 'clear'}, slope ${model.slopeAt(a.pos[0], a.pos[1]).toFixed(2)}, wet ${model.wetAt(a.pos[0], a.pos[1]).toFixed(2)}`);
    }
  }
  const hero = scene.actors[0], { f } = axes(hero.facingDeg);
  const targets = [['hero', [hero.pos[0], model.supportAt(hero.pos[0], hero.pos[1]) + 1.2, hero.pos[1]], hero],
    ...scene.effects.map((fx) => [`${fx.type}@${fx.tMs}`, effectPoint(scene, model, fx), scene.actors.find((x) => x.name === (fx.actor ?? fx.onActor))]).filter(([, p]) => p)];
  for (const c of scene.cameraVariants) {
    const eye = [c.pos[0], model.heightAt(c.pos[0], c.pos[2]) + c.pos[1], c.pos[2]];
    const inside = insideRecord(model, eye, 0.3), off = Math.atan2(eye[0] - hero.pos[0], eye[2] - hero.pos[1]) / DEG - hero.facingDeg;
    const bearing = Math.abs(((off % 360) + 540) % 360 - 180);
    const faults = [];
    if (inside) faults.push(`eye inside ${inside.kind}`);
    for (const [name, p, own] of targets) {
      const records = sightBlockers(model, eye, p).filter((r) => r.kind !== 'tree' || Math.hypot((r.min[0] + r.max[0]) / 2 - eye[0], (r.min[2] + r.max[2]) / 2 - eye[2]) < 40);
      const hulls = scene.actors.filter((a) => a !== own && hullBlocks(model, a, eye, p)).map((a) => a.name);
      const where = (r) => process.env.HOME_STILLS_VERBOSE ? `${r.kind} [${r.min.map((v) => v.toFixed(1))}]-[${r.max.map((v) => v.toFixed(1))}]` : r.kind;
      if (records.length || hulls.length) faults.push(`${name} behind ${[...records.map(where), ...hulls].join(', ')}`);
    }
    const near = model.queryShrubs(eye[0] - 2, eye[2] - 2, eye[0] + 2, eye[2] + 2).filter((sh) => Math.hypot(sh.x - eye[0], sh.z - eye[2]) < sh.r + 1.2);
    if (near.length) faults.push(`${near.length} shrub crown${near.length > 1 ? 's' : ''} at the lens`);
    lines.push(`  ${c.name}: ${bearing.toFixed(0)}° off the nose, ${Math.hypot(eye[0] - hero.pos[0], eye[2] - hero.pos[1]).toFixed(1)} m — ${faults.join('; ') || 'clear'}`);
    // where each tank and effect falls in the 16:9 frame (x, y from -1 to 1; a pinhole at the lens's fov)
    const look = [c.lookAt[0], model.heightAt(c.lookAt[0], c.lookAt[2]) + c.lookAt[1], c.lookAt[2]];
    const fw = look.map((v, k) => v - eye[k]), fl = Math.hypot(...fw), w = fw.map((v) => v / fl);
    const right = [-w[2], 0, w[0]].map((v) => v / Math.hypot(w[2], w[0])), up = [right[1] * w[2] - right[2] * w[1], right[2] * w[0] - right[0] * w[2], right[0] * w[1] - right[1] * w[0]];
    const tanV = Math.tan(c.fov * DEG / 2), tanH = tanV * 16 / 9;
    const screen = (p) => {
      const d = p.map((v, k) => v - eye[k]), z = d[0] * w[0] + d[1] * w[1] + d[2] * w[2];
      if (z <= 0.1) return 'behind the lens';
      const sx = (d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / z / tanH, sy = (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / z / tanV;
      return `${sx >= 0 ? '+' : ''}${sx.toFixed(2)},${sy >= 0 ? '+' : ''}${sy.toFixed(2)}${Math.abs(sx) > 1 || Math.abs(sy) > 1 ? ' (out)' : ''} at ${z.toFixed(0)} m`;
    };
    lines.push(`     ${[...scene.actors.map((a) => [a.name, [a.pos[0], model.supportAt(a.pos[0], a.pos[1]) + 1.2, a.pos[1]]]), ...targets.slice(1).map(([n, p]) => [n, p])]
      .map(([n, p]) => `${n} ${screen(p)}`).join(' · ')}`);
    void f;
  }
  return [`${scene.meta.id} (${scene.map}, fx ${scene.fxTime} ms)`, ...lines];
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()) && process.argv[2] === '--final') {
  // the picks as their finals: each still's scene with the lab's placement baked in and its one lens, as cinema.mjs
  // renders it (--stills at the scene's fxTime), written to <outDir>/<slot>.json
  //   node tools/media-r5/home-stills.mjs --final id:lens[,id:lens...] [outDir=shots/media-r5/home-r2/finals] [--by-pick]
  // --by-pick names each file <id>__<lens>.json (review variants of one slot side by side) instead of <slot>.json
  const byPick = process.argv.includes('--by-pick'), rest = process.argv.slice(3).filter((a) => a !== '--by-pick');
  const out = rest[1] ?? 'shots/media-r5/home-r2/finals';
  mkdirSync(out, { recursive: true });
  for (const pick of rest[0].split(',')) {
    const [id, name] = pick.split(':'), s = HOME_STILLS.find((x) => x.id === id);
    if (!s) throw new Error(`no still ${id}`);
    const scene = homeScene(s), moves = labPlace(scene), cam = scene.cameraVariants.find((c) => c.name === name);
    if (!cam) throw new Error(`${id}: no lens ${name} (${scene.cameraVariants.map((c) => c.name).join(', ')})`);
    scene.camera = { ...cam };
    scene.cameraVariants = [cam];
    scene.meta = { ...scene.meta, lens: name, pick: `${id}:${name}` };
    const file = byPick ? `${id}__${name}` : s.slot ?? s.id;
    writeFileSync(join(out, `${file}.json`), JSON.stringify(scene, null, 1));
    console.log(`[home-stills] ${file}: ${id} through ${name} at ${scene.fxTime} ms${moves.length ? ` (placed: ${moves.map((m) => `${m.name} ${m.m} m`).join(', ')})` : ''}`);
  }
} else if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()) && process.argv[2] === '--check-file') {
  // a written scene (an earlier round's, say) through the same check
  for (const file of process.argv.slice(3)) {
    const scene = JSON.parse(readFileSync(file, 'utf8'));
    scene.meta ??= { id: file };
    console.log(checkScene(scene).join('\n'));
  }
} else if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const check = process.argv.includes('--check'), rest = process.argv.slice(2).filter((a) => a !== '--check');
  const out = check ? null : rest[0] ?? 'shots/media-r5/home-r2/scenes', only = (check ? rest[0] : rest[1])?.split(',');
  const stills = HOME_STILLS.filter((x) => !only || only.includes(x.id));
  if (!check) mkdirSync(out, { recursive: true });
  for (const s of stills) {
    const scene = homeScene(s);
    if (check) console.log(checkScene(scene).join('\n'));
    else writeFileSync(join(out, `${s.id}.json`), JSON.stringify(scene, null, 1));
  }
  if (!check) console.log(`[home-stills] ${stills.length} scenes -> ${out}`);
}
