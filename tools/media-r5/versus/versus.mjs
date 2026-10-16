#!/usr/bin/env node
// Round 3 of the remakes and the owner's ten "versus" stills (owner, 2026-10-14 evening, verbatim through the
// coordinator: "for steinburg we should be using a leopard 2a6 with bundeswehr 3 tone camo with a far beetter angle and
// action shot of it moving, like the t90sm is on right side and the leopard shuld be on left. and for the t90sm one we
// need to get the t90 sm more in frame and use the digital camo on it. fdor both, use more sparks, muzzle flare and
// debris falling effects" ... "then make 10 more of these "versus" scenes!").
//
// A versus still is staged in its lens's own frame: the lens on a bearing, the left tank and the right tank placed
// [side, ahead] of it and angled so each shows a front three-quarter (the lens on the left tank's right and on the right
// tank's left: the two converge on the frame's middle), turrets laid on each other. A moving tank drives a storyboard
// track over the 2.6 s before the still (the Studio lays its track dust along it); both fire (muzzle flare); each hit
// sparks on the plate that faces its shooter, the fan thrown back toward the shooter and away from the lens; debris
// falls from a burst behind the pair; a cook-off column, a fire and embers stand behind. The still is at 7 s so the
// backdrop's smoke has risen. The f7 remake keeps its own column staging (round 2's), its hero now the T-90SM.
//   node tools/media-r5/versus/versus.mjs scenes [ids]          -> shots/media-r5/remake/scenes-v/<id>.json, lens variants
//   node tools/media-r5/versus/versus.mjs check [ids]           footprints, routes, sightlines, each tank's frame box, smoke
//                                                               in front of a tank
//   node tools/media-r5/versus/versus.mjs final <id>:<lens>...  -> shots/media-r5/remake/finals-v/<id>.json, the pick alone
//   node tools/media-r5/versus/versus.mjs jobs                  -> shots/media-r5/remake/finals-v/jobs-<id>.json, one cinema
//                                                               run per still (one map per page)
// versus6.mjs runs the same command line with round 6's scene modules (v6/) added. Run from the repository root: the
// jobs name their scene and renders by repository-relative paths. Generated scenes and renders stay in the git-ignored
// shots/media-r5/remake; the scenes of the stills that ship are kept in scenes/ beside this file.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TANK_ID_RENAMES, createTankIdResolver } from '../../../src/vehicles/tankIdAliases.ts';
import { SHOTS } from '../paths.mjs';
import { worldModel, sightBlockers, insideRecord } from '../world-model.mjs';
import { featuresFile } from './spots.mjs';
// (round 6) overhead wires as the engine strings them, from the combat tree's wire model (2026-10-14/15 lens rules)
import { wiresOf } from '../wire-model.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REMAKE = join(SHOTS, 'remake');
const DIMS = JSON.parse(readFileSync(join(HERE, '../hull-dims.json'), 'utf8'));
// The scenes name their tanks in schema-1 spellings (tank-id-codemod leaves tools/media-r5 as written, and an unstamped
// scene loads as schema 1), while hull-dims.json is keyed at the media record's schema (tank-id-schema.json, moved by
// fleet-rekey.mjs): a tank's dims are looked up through the renames between the two, so a swapped id never reads
// another vehicle's hull.
const DIMS_SCHEMA = (() => {
  try { return Number(JSON.parse(readFileSync(join(HERE, '../tank-id-schema.json'), 'utf8')).tankIdSchema) || 1; } catch { return 1; }
})();
const DIMS_IDS = createTankIdResolver({ schema: Math.min(DIMS_SCHEMA, TANK_ID_RENAMES.length + 1),
  renames: TANK_ID_RENAMES.slice(0, Math.min(DIMS_SCHEMA, TANK_ID_RENAMES.length + 1) - 1) });
/** A tank's [halfLength, halfWidth, muzzleReach, height] by its scene id (schema 1), or undefined. */
const dimsOf = (id) => DIMS[DIMS_IDS.resolve(id, 1)];
const DEG = Math.PI / 180;
const r2 = (v) => +(+v).toFixed(2);
const wrap = (d) => ((d % 360) + 540) % 360 - 180;
const CLEAN = { grain: { amount: 0.05, size: 1, color: 0.1, response: 0.7 }, vignette: { amount: 0.22, roundness: 0.55, softness: 0.65 },
  dof: { enabled: false }, chromaticAberration: 0 };
const models = new Map();
const feats = new Map();
const featsOf = (map) => { if (!feats.has(map)) feats.set(map, JSON.parse(readFileSync(featuresFile(map), 'utf8'))); return feats.get(map); };
const modelOf = (map) => { if (!models.has(map)) models.set(map, worldModel(JSON.parse(readFileSync(featuresFile(map), 'utf8')))); return models.get(map); };
const ground = (map, x, z) => modelOf(map).heightAt(x, z);
const polar = (p, deg, d) => [p[0] + Math.sin(deg * DEG) * d, p[1] + Math.cos(deg * DEG) * d];
const bearingOf = (a, b) => ((Math.atan2(b[0] - a[0], b[1] - a[1]) / DEG) % 360 + 360) % 360;
const axes = (yaw) => { const f = [Math.sin(yaw * DEG), Math.cos(yaw * DEG)]; return { f, r: [-f[1], f[0]] }; };
/** A point [side (+ right), ahead] in the frame at `o` facing bearing `yaw` (this world: right of +Z is -X). */
const inFrame = (o, yaw, side, ahead) => { const { f, r } = axes(yaw); return [o[0] + r[0] * side + f[0] * ahead, o[1] + r[1] * side + f[1] * ahead]; };
const fx = (type, at, tMs, params = {}) => ({ type, ...(typeof at === 'string' ? { actor: at } : { at }), tMs, params });
const moment = (actor, tMs, ageS) => fx('firing_moment', actor, tMs, { ageS, slot: 0 });
const SUN_UP = { day: 45, morning: 24, golden: 11, sunset: 4, night: 34, dawn: 5 };
const lensAt = (name, eye, lift, look, lookH, fov) => ({ name, pos: [r2(eye[0]), lift, r2(eye[1])], lookAt: [r2(look[0]), lookH, r2(look[1])], fov, rollDeg: 0, groundRel: true });

/** A hit on `me`'s plate facing `from`: the point 0.06 m off the armour at turret-ring height, its normal toward `from`. */
function plate(map, me, from, up = 0.62) {
  const d = dimsOf(me.id) ?? [3.5, 1.9, 6.5, 2.6], b = bearingOf(me.pos, from), u = polar([0, 0], b, 1), gy = ground(map, ...me.pos);
  // the hull's reach toward the shooter: the half length along its axis, the half width across, blended by the angle
  const rel = Math.abs(wrap(b - me.facingDeg)) * DEG, reach = Math.abs(Math.cos(rel)) * d[0] * 0.8 + Math.abs(Math.sin(rel)) * d[1] * 0.95;
  return { at: [r2(me.pos[0] + u[0] * reach), r2(gy + d[3] * up), r2(me.pos[1] + u[1] * reach)], normal: [r2(u[0] * 0.6), 0.66, r2(u[1] * 0.6)] };
}
/** Sparks, a ricochet's white-hot pop and hot spall off a plate. */
const hitFx = (map, me, from, tMs, kind = 'ricochet') => {
  const p = plate(map, me, from);
  return [fx('impact', p.at, tMs, { kind, caliberMm: 125, normal: p.normal }), fx('sparks', p.at, tMs + 25, { caliberMm: 120, normal: p.normal }),
    fx('debris', p.at, tMs + 10, { count: 14, speedMps: 8, hot: 0.9, scale: 0.45 })];
};

// --- a versus still ----------------------------------------------------------------------------------------------------
const MOVE_MS = 2600;
function versus(v) {
  const T = v.T ?? 7000, map = v.map;
  const place = (t, name) => {
    const pos = inFrame(v.eye, v.yaw, t.at[0], t.at[1]);
    // the lens `off` degrees off the tank's nose (+ on its left, as + yaw turns left): its heading is toward-lens - off
    return { t, name, pos, heading: bearingOf(pos, v.eye) - t.off };
  };
  const P = [place(v.left, 'hero'), place(v.right, 'foe0')];
  const actors = [], tracks = [], effects = [];
  for (const [i, me] of P.entries()) {
    const other = P[1 - i], aim = wrap(bearingOf(me.pos, other.pos) - me.heading);
    const a = { id: me.t.id, name: me.name, pos: me.pos.map(r2), facingDeg: r2(((me.heading % 360) + 360) % 360), turretDeg: r2(me.t.turret ?? aim),
      gunDeg: me.t.gun ?? 1, ...(me.t.camo ? { camo: me.t.camo } : {}), camoSeed: me.t.seed ?? 7101 + i };
    actors.push(a);
    if (me.t.speed) {
      const { f } = axes(a.facingDeg), s = me.t.speed, back = s * MOVE_MS / 1000, on = s * 0.6;
      const key = (k, tMs, p) => ({ id: `${me.name}-${k}`, tMs, pos: p.map(r2), facingDeg: a.facingDeg, turretDeg: a.turretDeg, gunDeg: a.gunDeg, transition: 'linear' });
      tracks.push({ actor: me.name, keys: [key(0, T - MOVE_MS, [me.pos[0] - f[0] * back, me.pos[1] - f[1] * back]), key(1, T + 600, [me.pos[0] + f[0] * on, me.pos[1] + f[1] * on])] });
      effects.push(fx('dust', me.name, T - 220, { count: 12, intensity: 1 }));
    }
  }
  for (const [i, me] of P.entries()) {
    const a = actors[i], o = actors[1 - i];
    if (me.t.fire != null) effects.push(moment(me.name, T, me.t.fire));
    if (me.t.hit !== false) effects.push(...hitFx(map, a, o.pos, T - (me.t.hitAgo ?? 130), me.t.hitKind ?? 'ricochet'));
    if (me.t.mg) effects.push(fx('mg_burst', me.name, T - 420, { count: 8 }));
  }
  // falling debris: a burst behind and between the pair 0.75 s before the still
  const mid = [(actors[0].pos[0] + actors[1].pos[0]) / 2, (actors[0].pos[1] + actors[1].pos[1]) / 2];
  const fall = inFrame(mid, v.yaw, v.fall?.[0] ?? 1.5, v.fall?.[1] ?? 13);
  effects.push(fx('explosion', fall.map(r2), T - 760, { size: 'small', munition: 'he', cause: 'shot' }));
  effects.push(fx('debris', [r2(fall[0]), r2(ground(map, ...fall) + 1.4), r2(fall[1])], T - 735, { count: 44, speedMps: 15, hot: 0.45, scale: 1.35 }));
  const more = [];
  for (const b of v.backdrop ?? []) { const e = b(v, mid); if (e.state) more.push(e); else effects.push(e); }
  for (const w of more) effects.push(fx('burning', w.name, 0));
  const time = v.time ?? 'day', sun = v.sun ?? [(v.yaw + 140) % 360, SUN_UP[time] ?? 40];
  const lens = (name, dSide, dAhead, lift, fov, dYaw = 0, lookAhead = v.lookAhead ?? 20, lookH = v.lookH ?? 3.4) => {
    const eye = inFrame(v.eye, v.yaw, dSide, dAhead), look = polar(eye, v.yaw + dYaw, lookAhead);
    return lensAt(name, eye, lift, look, lookH, fov);
  };
  const lenses = [lens('a', 0, 0, v.lift ?? 2.2, v.fov ?? 37, v.dYaw ?? 0), ...(v.lenses ?? []).map((l) => lens(...l))];
  return { map, timeOfDay: time, seed: v.seed ?? 900, light: { sunAzimuthDeg: r2(sun[0]), sunElevationDeg: sun[1] },
    actors: [...actors, ...more], effects, fxTime: T, timeScale: 0,
    storyboard: { version: 1, durationMs: T + 1500, shots: [], actorTracks: tracks },
    picture: { ...CLEAN, ...(v.picture ?? {}) }, fx: { quality: 'cinematic', trackDust: true }, autoPlace: false,
    lenses, meta: { id: v.id, kind: 'versus-still', pair: `${v.left.id} v ${v.right.id}` } };
}
const behind = (type, side, back, tMs, params) => (v, mid) => fx(type, inFrame(mid, v.yaw, side, back).map(r2), tMs, params);
const COLUMN = (side, back, tMs = 0) => behind('explosion', side, back, tMs, { size: 'huge' });
const FIRE = (side, back, r = 4) => behind('fire_field', side, back, 0, { radiusM: r, durationS: 40, intensity: 1, smoke: true });
const EMBERS = (side, back) => behind('embers', side, back, 0, { radiusM: 4, rate: 50, durationS: 20, rise: 3 });
const FLARE = (side, back) => behind('flare', side, back, 0, { heightM: 60, burnS: 40, intensity: 2.4, driftMps: 1, fallMps: 1.5, color: 'white', launch: false });
const WRECK = (id, side, back, yawOff = 40) => (v, mid) => ({ id, name: `wreck${Math.round(side)}`, pos: inFrame(mid, v.yaw, side, back).map(r2),
  facingDeg: r2((v.yaw + yawOff + 360) % 360), turretDeg: 35, gunDeg: 0, state: 'wrecked-burnt', stateAgeS: 50, camoSeed: 7300 });

// --- f7 round 3: the column, its hero the T-90SM in digital and whole in frame -------------------------------------------
function column(v) {
  const C = v.eye, beta = v.beta, T = 9000, map = v.map, heading = beta + 98;
  // (round 5, the owner 2026-10-15: "use the actual t-90m instead of the tank u switched with": the hero by id, the
  // original's cage-armoured T-90M, t90m_x)
  const hero = { id: v.heroId ?? 't90sm', name: 'hero', pos: polar(C, beta - 12, v.heroDist).map(r2), facingDeg: r2(heading % 360), turretDeg: v.turret, gunDeg: 2, camo: 'digital', camoSeed: 5701 };
  const ally = { id: 't90a_x', name: 'ally1', pos: polar(C, beta + 24, 17).map(r2), facingDeg: r2(heading % 360), turretDeg: -74, gunDeg: 2, camo: 'service_t90m', camoSeed: 5702 };
  const wreckAt = [[beta + 6, 110, 'leo2a6_x'], [beta - 13, 95, 'm1a2_sepv3_x'], [beta - 23, 74, 'leo2a7v_x']];
  const wrecks = wreckAt.map(([b, d, id], i) => ({ id, name: `wreck${i}`, pos: polar(C, b, d).map(r2), facingDeg: r2((beta + 150 + i * 37) % 360), turretDeg: 25 - i * 30,
    gunDeg: 0, state: 'wrecked-burnt', stateAgeS: 40 + i * 25, camo: 'service_leo2a6m', camoSeed: 6100 + i }));
  const target = { id: 'leo2a6_x', name: 'foe0', pos: polar(C, beta - 2, 72).map(r2), facingDeg: r2((beta + 160) % 360), turretDeg: 10, gunDeg: 0, camo: 'service_leo2a6m', camoSeed: 6200 };
  const field = polar(C, beta - 2, 72);
  const effects = [
    ...wrecks.map((w, i) => fx(i === 0 ? 'engine_smoke' : 'burning', w.name, 0)),
    fx('tank_kill', 'foe0', T - 550, { cause: 'ammorack', pop: true }),
    // round 3 (the owner: more sparks, muzzle flare and falling debris): the kill throws more debris, an HE round lands
    // in the field left of it and comes down as clods and fragments, a round off the field glances off the T-90SM's
    // turret (its fan thrown back toward the field, away from the lens), and both guns are 0.05-0.06 s from the shot
    fx('debris', [r2(field[0]), r2(ground(map, ...field) + 2.5), r2(field[1])], T - 520, { count: 46, speedMps: 17, hot: 0.6, scale: 1.4 }),
    fx('explosion', polar(C, beta + 9, 58).map(r2), T - 780, { size: 'small', munition: 'he', cause: 'shot' }),
    fx('debris', (() => { const p = polar(C, beta + 9, 58); return [r2(p[0]), r2(ground(map, ...p) + 1.4), r2(p[1])]; })(), T - 760, { count: 40, speedMps: 15, hot: 0.4, scale: 1.3 }),
    ...hitFx(map, hero, field, T - 120),
    moment('ally1', T, 0.05), moment('hero', T, 0.06),
    fx('dust', 'hero', T - 300, { count: 8, intensity: 0.6 }),
  ];
  const lenses = v.lenses.map(([name, lift, fov, pan]) => lensAt(name, C, lift, polar(C, beta + pan, 14), lift - 14 * Math.tan(9 * DEG), fov));
  return { map, timeOfDay: 'day', seed: 707, light: { sunAzimuthDeg: (beta + 150) % 360, sunElevationDeg: v.sunUp ?? 55 },
    actors: [hero, ally, ...wrecks, target], effects, fxTime: T, timeScale: 0, picture: { ...CLEAN, exposure: 0.15, temperature: 10, ...(v.picture ?? {}) },
    fx: { quality: 'cinematic', trackDust: true }, autoPlace: false, lenses,
    meta: { id: v.id, kind: 'remake-still', source: 'f7_studio_t90_column_fire', round: 3 } };
}

// --- the twelve --------------------------------------------------------------------------------------------------------
const SCENES = {};
// the pair: the left tank drives in toward the frame's middle, the right holds, its coax firing, both guns flashing
const L = (id, camo, x = {}) => ({ id, camo, at: [-3.4, 14], off: -42, speed: 5.5, fire: 0.05, ...x });
const R = (id, camo, x = {}) => ({ id, camo, at: [8.6, 28], off: 30, speed: 0, fire: 0.045, mg: true, ...x });
const vs = (v) => { SCENES[v.id] = () => versus(v); };
SCENES['f7-t90sm-column'] = () => column({ id: 'f7-t90sm-column', map: 'frontier', eye: [37.4, -207], beta: 154, heroDist: 12.2, turret: -69,
  lenses: [['a', 4.0, 36, -4], ['b', 3.6, 38, -5]] });
// f6 round 3: the Leopard 2A6 (its factory coat is the NATO three-tone the Bundeswehr wears) driving in on the left, the
// T-90SM in digital on the right, across Steinburg's square with the old town behind
vs({ id: 'f6-leo2a6-steinburg', map: 'urban', time: 'day', eye: [-36.9, 24.7], yaw: 255, seed: 811,
  left: L('leo2a6_x', 'paint_m1a1'), right: R('t90sm', 'digital'),
  backdrop: [COLUMN(-16, 70), COLUMN(18, 85, 1200), FIRE(10, 24), EMBERS(10, 24)], lenses: [['b', 0, -1, 1.6, 42, 0, 20, 3.4]] });
// --- round 5 (the owner 2026-10-15, on the two remakes: "zoom into those a lil more, and make the tanks a lil more
// illuminated and highlighted, also use the actual t-90m instead of the tank u switched with"): the original's T-90M
// (t90m_x, cage armour) in digital where round 3 had the T-90SM; the lens about a fifth tighter; a lower sun, so the hulls'
// fronts and flanks take the light rather than their roofs; half a stop more, more vibrance and a deeper vignette, so the
// tanks stand out of their ground. Round 3's two stay as they were (every version kept).
const LIT = { exposure: 0.3, vibrance: 0.14, contrast: 1.05, vignette: { amount: 0.36, roundness: 0.55, softness: 0.6 } };
vs({ id: 'f6-leo2a6-steinburg-r5', map: 'urban', time: 'day', eye: [-36.9, 24.7], yaw: 255, seed: 811, fov: 33, dYaw: 3, lookH: 2.8,
  sun: [(255 + 140) % 360, 32], picture: LIT,
  left: L('leo2a6_x', 'paint_m1a1'), right: R('t90m_x', 'digital'),
  backdrop: [COLUMN(-16, 70), COLUMN(18, 85, 1200), FIRE(10, 24), EMBERS(10, 24)] });
SCENES['f7-t90m-column-r5'] = () => column({ id: 'f7-t90m-column-r5', map: 'frontier', eye: [37.4, -207], beta: 154, heroDist: 12.2, turret: -69,
  heroId: 't90m_x', sunUp: 38, picture: { ...LIT, exposure: 0.42, temperature: 10 }, lenses: [['a', 4.0, 32, -8]] });
// --- round 6 (the owner 2026-10-15 17:45, on round 5: "wow im really impressed. just make the leopard 2a6 use the urban
// block camo instead."): round 5's Steinburg as it was, the Leopard in the catalog's Urban Block (camoPattern.urbanblock)
vs({ id: 'f6-leo2a6-steinburg-r6', map: 'urban', time: 'day', eye: [-36.9, 24.7], yaw: 255, seed: 811, fov: 33, dYaw: 3, lookH: 2.8,
  sun: [(255 + 140) % 360, 32], picture: LIT,
  left: L('leo2a6_x', 'urbanblock'), right: R('t90m_x', 'digital'),
  backdrop: [COLUMN(-16, 70), COLUMN(18, 85, 1200), FIRE(10, 24), EMBERS(10, 24)] });
vs({ id: 'vs01-desert-abrams-t90m', map: 'desert', time: 'golden', eye: [56.4, 16.4], yaw: 225, seed: 901,
  left: L('m1a2_sepv3_x', 'service_usa_desert'), right: R('t90m_x', 'service_t90m'),
  backdrop: [COLUMN(-14, 60), FIRE(10, 22), EMBERS(10, 22)], lenses: [['b', 0, -1, 1.6, 42, 0, 20, 3.4]] });
vs({ id: 'vs02-verdant-challenger-t80u', map: 'verdant', time: 'day', eye: [-75, 120.5], yaw: 150, seed: 902,
  left: L('challenger_3x', 'factory'), right: R('t80u_x', 'factory'),
  backdrop: [COLUMN(12, 70), FIRE(-9, 20), EMBERS(-9, 20)], lenses: [['b', 0, -1, 1.6, 42, 0, 20, 3.4]] });
vs({ id: 'vs03-reservoir-k2-type99a', map: 'reservoir', time: 'sunset', eye: [-5.3, -77.1], yaw: 345, seed: 903,
  left: L('k2_x', 'factory'), right: R('type99a', 'factory', { at: [10, 29] }),
  backdrop: [COLUMN(-10, 65), FIRE(9, 20), EMBERS(9, 20)], lenses: [['b', 0, -1, 1.6, 42, 0, 20, 3.4]] });
vs({ id: 'vs04-railyard-leclerc-t14', map: 'railyard', time: 'night', eye: [45.5, 1], yaw: 120, seed: 904, picture: { exposure: 0.35 },
  left: L('leclerc_xlr', 'factory'), right: R('t14_x', 'factory'),
  backdrop: [COLUMN(14, 55), FIRE(-8, 18, 5), EMBERS(-8, 18), FLARE(4, 40)], lenses: [['b', 0, -1, 1.6, 42, 0, 20, 3.4]] });
vs({ id: 'vs05-oasis-merkava-t72b3', map: 'oasis', time: 'day', eye: [29.8, 57.5], yaw: 150, seed: 905,
  left: L('merkava4_x', 'factory'), right: R('t72b3_x', 'factory'),
  backdrop: [COLUMN(-12, 60), FIRE(9, 20), EMBERS(9, 20)], lenses: [['b', 0, -1, 1.6, 42, 0, 20, 3.4]] });
vs({ id: 'vs06-coastal-type10-ztz99a2', map: 'coastal', time: 'golden', eye: [65, 80.5], yaw: 150, seed: 906,
  left: L('type10_x', 'factory'), right: R('ztz99a2', 'factory'),
  backdrop: [COLUMN(12, 65), FIRE(-9, 20), EMBERS(-9, 20)], lenses: [['b', 0, -1, 1.6, 42, 0, 20, 3.4]] });
vs({ id: 'vs07-autumn-ariete-t62', map: 'autumn', time: 'golden', eye: [3.1, 104.7], yaw: 255, seed: 907,
  left: L('ariete_c2_x', 'factory'), right: R('t62mv1_x', 'factory'),
  backdrop: [COLUMN(-12, 60), FIRE(9, 20), EMBERS(9, 20)], lenses: [['b', 0, -1, 1.6, 42, 0, 20, 3.4]] });
vs({ id: 'vs08-winter-cv90-bmp3', map: 'winter', time: 'day', eye: [-175, 60.5], yaw: 150, seed: 908,
  left: L('cv90_mkiv_x', 'winter', { at: [-3.0, 12.5] }), right: R('bmp3', 'winter', { at: [6.4, 24] }),
  backdrop: [COLUMN(12, 60), FIRE(-9, 18), EMBERS(-9, 18)], lenses: [['b', 0, -1, 1.6, 42, 0, 20, 3.4]] });
vs({ id: 'vs09-alpine-strv122-t80bv', map: 'alpine', time: 'morning', eye: [-39.5, -59], yaw: 240, seed: 909,
  left: L('strv122_x', 'winter'), right: R('t80bv', 'winter'),
  backdrop: [COLUMN(-12, 60), FIRE(9, 20), EMBERS(9, 20)], lenses: [['b', 0, -1, 1.6, 42, 0, 20, 3.4]] });
vs({ id: 'vs10-steppe-chieftain-t64', map: 'steppe', time: 'night', eye: [185.5, -129], yaw: 120, seed: 910, picture: { exposure: 0.35 },
  left: L('chieftain_mk10_x', 'factory', { speed: 3.5 }), right: R('t64bv1', 'factory'),
  backdrop: [COLUMN(12, 55), FIRE(-8, 18, 5), EMBERS(-8, 18), FLARE(-4, 40)], lenses: [['b', 0, -1, 1.6, 42, 0, 20, 3.4]] });

// --- the check -----------------------------------------------------------------------------------------------------------
function frameOf(model, c) {
  const eye = [c.pos[0], model.heightAt(c.pos[0], c.pos[2]) + c.pos[1], c.pos[2]];
  const look = [c.lookAt[0], model.heightAt(c.lookAt[0], c.lookAt[2]) + c.lookAt[1], c.lookAt[2]];
  const fw = look.map((x, k) => x - eye[k]), fl = Math.hypot(...fw), w = fw.map((x) => x / fl);
  const right = [-w[2], 0, w[0]].map((x) => x / Math.hypot(w[2], w[0]));
  const up = [right[1] * w[2] - right[2] * w[1], right[2] * w[0] - right[0] * w[2], right[0] * w[1] - right[1] * w[0]];
  const tanV = Math.tan(c.fov * DEG / 2), tanH = tanV * 16 / 9;
  const project = (p) => { const d = p.map((x, k) => x - eye[k]), z = d[0] * w[0] + d[1] * w[1] + d[2] * w[2];
    return z <= 0.1 ? null : [(d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / z / tanH, (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / z / tanV, z]; };
  return { eye, project };
}
function tankBox(model, F, a) {
  const d = dimsOf(a.id) ?? [3.5, 1.9, 6.5, 2.6], gy = model.supportAt(a.pos[0], a.pos[1]), { f, r } = axes(a.facingDeg), t = axes(a.facingDeg + (a.turretDeg ?? 0)).f;
  const pts = [];
  for (const sl of [-d[0], d[0]]) for (const sw of [-d[1], d[1]]) for (const y of [0.1, d[3]]) pts.push([a.pos[0] + f[0] * sl + r[0] * sw, gy + y, a.pos[1] + f[1] * sl + r[1] * sw]);
  pts.push([a.pos[0] + t[0] * d[2], gy + d[3] * 0.72, a.pos[1] + t[1] * d[2]]);
  const pr = pts.map(F.project);
  if (pr.some((p) => !p)) return null;
  const xs = pr.map((p) => p[0]), ys = pr.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), z: Math.hypot(a.pos[0] - F.eye[0], a.pos[1] - F.eye[2]), muzzle: pr[pr.length - 1] };
}
function check(id) {
  const s = SCENES[id](), model = modelOf(s.map), lines = [`${id} (${s.map} ${s.timeOfDay}, sun ${s.light.sunAzimuthDeg}/${s.light.sunElevationDeg}, still ${s.fxTime} ms)`];
  for (const a of s.actors) {
    const d = dimsOf(a.id); if (!d) { lines.push(`  ! ${a.name}: no dims for ${a.id}`); continue; }
    const c = model.hullContacts(a.pos[0], a.pos[1], a.facingDeg * DEG, d[0], d[1]), slope = model.slopeAt(a.pos[0], a.pos[1]);
    if (c.length || slope > 0.2 || model.wetAt(a.pos[0], a.pos[1]) > 0.3) lines.push(`  ! ${a.name} ${a.id} at ${a.pos}: ${c.map((r) => r.kind).join('+') || 'clear'}, slope ${slope.toFixed(2)}, wet ${model.wetAt(a.pos[0], a.pos[1]).toFixed(2)}`);
  }
  for (const tr of s.storyboard?.actorTracks ?? []) {
    const a = s.actors.find((x) => x.name === tr.actor), d = dimsOf(a.id), [k0, k1] = tr.keys, n = Math.ceil(Math.hypot(k1.pos[0] - k0.pos[0], k1.pos[1] - k0.pos[1]) / 1.5), hits = new Set();
    for (let i = 0; i <= n; i++) for (const r of model.hullContacts(k0.pos[0] + (k1.pos[0] - k0.pos[0]) * i / n, k0.pos[1] + (k1.pos[1] - k0.pos[1]) * i / n, a.facingDeg * DEG, d[0], d[1])) if (!model.crushes(r, 5.5)) hits.add(`${r.kind} [${r.min[0].toFixed(0)},${r.min[2].toFixed(0)}..${r.max[0].toFixed(0)},${r.max[2].toFixed(0)}] at ${(i / n * 100).toFixed(0)}%`);
    if (hits.size) lines.push(`  ! ${a.name} route meets ${[...hits].join('+')}`);
  }
  for (const c of s.lenses) {
    const F = frameOf(model, c), pair = s.actors.slice(0, 2), boxes = pair.map((a) => [a, tankBox(model, F, a)]), notes = [];
    if (insideRecord(model, F.eye, 0.3)) notes.push('! EYE INSIDE A RECORD');
    for (const [a, b] of boxes) {
      if (!b) { notes.push(`! ${a.name} BEHIND THE LENS`); continue; }
      const off = wrap(bearingOf(a.pos, [F.eye[0], F.eye[2]]) - a.facingDeg);
      const cut = b.x0 < -0.97 || b.x1 > 0.97 || b.y0 < -0.97 || b.y1 > 0.97;
      const sight = [...new Set(sightBlockers(model, F.eye, [a.pos[0], model.supportAt(a.pos[0], a.pos[1]) + 1.3, a.pos[1]]).map((r) => r.kind))];
      notes.push(`${cut || sight.length || Math.abs(off) > 75 ? '! ' : ''}${a.name} ${a.id} ${Math.abs(off).toFixed(0)}° off its nose (${off > 0 ? 'its left' : 'its right'}) at ${b.z.toFixed(0)} m, box x ${b.x0.toFixed(2)}..${b.x1.toFixed(2)} y ${b.y0.toFixed(2)}..${b.y1.toFixed(2)}${cut ? ' CUT BY THE FRAME' : ''}${sight.length ? ` SIGHT ${sight.join('+')}` : ''}${Math.abs(off) > 75 ? ' NOT FRONT/3-4' : ''}`);
    }
    if (boxes[0][1] && boxes[1][1]) { const [A, B] = [boxes[0][1], boxes[1][1]]; if (A.x1 > B.x0 && A.x0 < B.x1 && A.y1 > B.y0 && A.y0 < B.y1) notes.push(`overlap: the two boxes share x ${Math.max(A.x0, B.x0).toFixed(2)}..${Math.min(A.x1, B.x1).toFixed(2)}`); }
    for (const e of s.effects) {
      if (!['explosion', 'fire_field', 'embers', 'firing_moment'].includes(e.type)) continue;
      let p = null;
      if (Array.isArray(e.at)) p = e.at.length === 3 ? e.at : [e.at[0], model.heightAt(e.at[0], e.at[1]) + 1.5, e.at[1]];
      else if (e.type === 'firing_moment') { const a = s.actors.find((x) => x.name === e.actor), d = dimsOf(a.id), t = axes(a.facingDeg + a.turretDeg).f; p = [a.pos[0] + t[0] * d[2], model.supportAt(a.pos[0], a.pos[1]) + d[3] * 0.72, a.pos[1] + t[1] * d[2]]; }
      const q = p && F.project(p); if (!q) continue;
      for (const [a, b] of boxes) if (b && a.name !== e.actor && q[2] < b.z - 1 && q[0] > b.x0 - (e.type === 'firing_moment' ? 0.12 : 0.04) && q[0] < b.x1 + (e.type === 'firing_moment' ? 0.12 : 0.04) && q[1] > b.y0 - 0.1 && q[1] < b.y1 + 0.25) notes.push(`! ${e.type}${e.actor ? ':' + e.actor : ''}@${e.tMs} IN FRONT OF ${a.name}`);
      if (Math.abs(q[0]) > 1.05 || Math.abs(q[1]) > 1.05) continue;
    }
    // (round 6) an overhead wire drawn across the frame: a conductor counts once it draws a pixel wide at 1440 px (the
    // coordinator's 1 px rule, 2026-10-15); each wire segment sampled in eight steps, so a span crossing the frame between
    // two points outside it is caught
    try {
      const tanV = Math.tan(c.fov * DEG / 2); let worst = null;
      for (const w of wiresOf(featsOf(s.map), (x, z) => model.heightAt(x, z))) {
        for (let i = 1; i < w.pts.length; i++) for (let k = 0; k <= 8; k++) {
          const p = w.pts[i - 1].map((v, j) => v + (w.pts[i][j] - v) * k / 8), q = F.project(p);
          if (!q || Math.abs(q[0]) > 1 || Math.abs(q[1]) > 1) continue;
          const px = (2 * w.r / q[2]) / (2 * tanV) * 1440;
          if (px >= 1 && (!worst || px > worst.px)) worst = { kind: w.kind, px, y: q[1] };
        }
      }
      if (worst) notes.push(`! WIRE ${worst.kind} across the frame (${worst.px.toFixed(1)} px at 1440, at y ${worst.y.toFixed(2)})`);
    } catch (e) { notes.push(`! wires unknown: ${String(e.message ?? e).slice(0, 80)}`); }
    lines.push(`  lens ${c.name} (eye ${F.eye.map((x) => x.toFixed(1))}, fov ${c.fov})`, ...notes.map((n) => `    ${n}`));
  }
  return lines.join('\n');
}

// --- output --------------------------------------------------------------------------------------------------------------
const sceneJson = (s) => { const { lenses, ...rest } = s; return { ...rest, camera: { ...lenses[0] }, cameraVariants: lenses }; };
// (round 6, 2026-10-15: the command line is a function, so versus6.mjs can add each new scene module's SCENES first)
export function cli([mode = 'check', ...rest]) {
const pick = (ids) => Object.keys(SCENES).filter((id) => !ids?.length || ids.some((x) => id.startsWith(x)));
if (mode === 'scenes') {
  const dir = join(REMAKE, 'scenes-v'); mkdirSync(dir, { recursive: true });
  for (const id of pick(rest[0]?.split(','))) { writeFileSync(join(dir, `${id}.json`), JSON.stringify(sceneJson(SCENES[id]()), null, 1)); console.log(`[versus] scenes-v/${id}.json`); }
} else if (mode === 'check') {
  for (const id of pick(rest[0]?.split(','))) console.log(check(id));
} else if (mode === 'final') {
  const dir = join(REMAKE, 'finals-v'); mkdirSync(dir, { recursive: true });
  for (const p of rest) {
    const [id, name] = p.split(':'), s = SCENES[id]?.();
    if (!s) throw Error(`no scene ${id}`);
    const c = s.lenses.find((l) => l.name === name); if (!c) throw Error(`${id}: no lens ${name}`);
    const scene = sceneJson({ ...s, lenses: [c] }); scene.meta = { ...scene.meta, lens: name, pick: `${id}:${name}` };
    writeFileSync(join(dir, `${id}.json`), JSON.stringify(scene, null, 1)); console.log(`[versus] finals-v/${id}.json (${name})`);
  }
} else if (mode === 'jobs') {
  // one cinema run per still, so every page boots straight onto its own map (three's isReady race on a map switch)
  const dir = join(REMAKE, 'finals-v');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && !x.startsWith('jobs-'))) {
    const id = f.replace(/\.json$/, ''), s = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    writeFileSync(join(dir, `jobs-${id}.json`), JSON.stringify([{ scene: `shots/media-r5/remake/finals-v/${f}`, out: `shots/media-r5/remake/renders-v/${id}`,
      stills: String(s.fxTime), 'still-samples': 16, 'still-exposure-ms': 12, resolution: 1440, supersample: 1.5, film: 'false', master: 'none',
      // resumes only where a receipt already stands (a re-run keeps a finished still and redoes a failed one)
      resume: 'true' }], null, 1));
    console.log(`[versus] finals-v/jobs-${id}.json`);
  }
} else throw Error('mode: scenes | check | final | jobs');
}
export { SCENES, versus, column, check, sceneJson, fx, moment, hitFx, plate, polar, inFrame, bearingOf, axes, wrap, r2, lensAt, ground, modelOf,
  DIMS, dimsOf, DEG, CLEAN, LIT, SUN_UP, MOVE_MS, behind, COLUMN, FIRE, EMBERS, FLARE, WRECK, L, R, vs, frameOf, tankBox };
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) cli(process.argv.slice(2));
