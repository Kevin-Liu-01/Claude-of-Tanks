// Media r5 setup DSL -> Studio scene JSON (groundRel cameras, absolute actors).
// A setup is staged around a hero tank: anchor [x,z] + heading (deg, 0 = +Z,
// increases toward +X). Formation offsets are [lateral (+ = hero's right), along
// (+ = ahead)]. Cameras are placed in the hero frame: side (+ = right), along
// (+ = ahead), lift (m above terrain), lookAt in the hero frame too.
const rad = d => d * Math.PI / 180;
export const FORMATIONS = {
  wedge: [[0, 0], [-9, -12], [10, -15], [-19, -27], [21, -31]],
  column: [[0, 0], [1.5, -16], [-1, -32], [2, -48], [0, -64]],
  line: [[0, 0], [-14, -2], [14, -3], [-28, -6], [28, -5]],
  echelon: [[0, 0], [11, -11], [22, -22], [33, -33], [44, -44]],
  pair: [[0, 0], [11, -9]],
  solo: [[0, 0]],
};
export function frame(anchor, heading) {
  const f = [Math.sin(rad(heading)), Math.cos(rad(heading))];
  // "right" of a hull heading +Z is -X in this world (screen-right looking +Z is -X)
  const r = [-f[1], f[0]];
  const at = (lat, lon) => [anchor[0] + r[0] * lat + f[0] * lon, anchor[1] + r[1] * lat + f[1] * lon];
  return { f, r, at };
}
const yawTo = (from, to) => Math.atan2(to[0] - from[0], to[1] - from[1]) * 180 / Math.PI;

/** Build one scene (with cameraVariants) from a setup. */
export function buildScene(s) {
  const fr = frame(s.anchor, s.heading);
  const lineup = s.lineup;
  const offsets = Array.isArray(s.formation) ? s.formation : FORMATIONS[s.formation ?? 'wedge'];
  const actors = [], effects = [];
  const count = s.count ?? offsets.length;
  for (let i = 0; i < Math.min(count, offsets.length); i++) {
    const [lat, lon, extra = {}] = offsets[i];
    actors.push({ id: extra.id ?? lineup[i % lineup.length], name: i ? `ally${i}` : 'hero', pos: fr.at(lat, lon),
      facingDeg: s.heading + (extra.yaw ?? (s.spreadYaw ? (i % 2 ? 1 : -1) * s.spreadYaw * Math.ceil(i / 2) : 0)),
      turretDeg: extra.turret ?? (i ? (s.turret ?? 0) + (i % 2 ? 4 : -5) : (s.turret ?? 0)), gunDeg: extra.gun ?? s.gun ?? 1,
      camo: s.camo, camoSeed: (s.seed ?? 1) * 7 + i, ...(extra.state ? { state: extra.state } : {}) });
  }
  // enemies: placed relative to the hero frame
  const foes = [];
  if (s.enemies) {
    const e = s.enemies, efr = frame(fr.at(e.lat ?? 0, e.along ?? 160), 0);
    const eOffsets = FORMATIONS[e.formation ?? 'line'];
    for (let i = 0; i < Math.min(e.count ?? 3, eOffsets.length); i++) {
      const [lat, lon] = eOffsets[i];
      // `nudge[i]`: a world-space shift off the props (site50.mjs parkNudges), applied before every gun aims at it
      const at = fr.at((e.lat ?? 0) + lat * (e.spread ?? 1), (e.along ?? 160) - lon * (e.spread ?? 1) * 0.5), shift = e.nudge?.[i];
      const base = shift ? [at[0] + shift[0], at[1] + shift[1]] : at;
      const facing = yawTo(base, s.anchor) + (e.yaw ?? 0);
      const st = e.states?.[i];
      foes.push({ id: (e.lineup ?? lineup)[i % (e.lineup ?? lineup).length], name: `foe${i}`, pos: base, facingDeg: facing,
        turretDeg: e.turret ?? 0, gunDeg: 1, camo: e.camo ?? s.camo, camoSeed: (s.seed ?? 1) * 13 + i, ...(st && st !== 'intact' ? { state: st, stateAgeS: e.stateAge ?? 30 } : {}) });
    }
    void efr;
  }
  actors.push(...foes);
  // aim the allied guns at the foes (turret relative to hull)
  if (foes.length && s.aimAtFoes !== false) for (const a of actors.filter(a => !a.name.startsWith('foe'))) {
    const target = foes[actors.indexOf(a) % foes.length].pos;
    a.turretDeg = ((yawTo(a.pos, target) - a.facingDeg + 540) % 360) - 180;
  }
  for (const fx of s.effects ?? []) {
    if (!fx.at?.hero) { effects.push(fx); continue; }
    const q = frame(actors[0].pos, s.heading).at(fx.at.hero[0], fx.at.hero[1]);
    effects.push({ ...fx, at: [+q[0].toFixed(2), +q[1].toFixed(2)], heroRel: true });
  }
  const T = s.fxTime ?? 0;
  // camera variants in the hero frame
  const hero = actors[0];
  const look = c => {
    if (Array.isArray(c.look)) return { lookAt: [c.look[0], c.look[1], c.look[2]] };
    const [ls, la, ll] = c.lookHero ?? [0, 2, 1.8];
    const p = fr.at(ls, la);
    return { lookAt: [p[0], ll, p[1]] };
  };
  const cameras = (s.cameras ?? []).map(c => {
    const p = c.pos ? [c.pos[0], c.pos[2]] : fr.at(c.side ?? 0, c.along ?? 0);
    return { name: c.name, pos: [p[0], c.lift ?? 2, p[1]], ...look(c), fov: c.fov ?? 40, rollDeg: c.roll ?? 0, groundRel: true };
  });
  const scene = { map: s.map, timeOfDay: s.time ?? 'day', seed: s.seed ?? 5000, actors, effects, fxTime: T, timeScale: 0,
    camera: cameras[0] ?? { pos: [hero.pos[0] + 10, 3, hero.pos[1] + 10], lookAt: [hero.pos[0], 2, hero.pos[1]], fov: 40, groundRel: true },
    cameraVariants: cameras };
  if (s.picture) scene.picture = s.picture;
  if (s.light) scene.light = s.light;
  scene.fx = { quality: 'cinematic', trackDust: true, ...(s.fx ?? {}) };
  if (s.film) scene.film = s.film;
  if (s.storyboard) scene.storyboard = s.storyboard;
  return scene;
}

// --- effect helpers ------------------------------------------------------------
export const fire = (actor, tMs, extra = {}) => ({ type: 'fire', actor, tMs, params: { slot: 0, tracer: true, recoil: true, ...extra } });
export const kill = (actor, tMs, extra = {}) => ({ type: 'tank_kill', actor, tMs, params: { cause: 'ammorack', pop: true, ...extra } });
export const pen = (actor, tMs, caliberMm = 120) => ({ type: 'impact', actor, tMs, params: { kind: 'pen', caliberMm } });
export const burn = (actor, tMs) => ({ type: 'burning', actor, tMs, params: {} });
export const smoke = (actor, tMs) => ({ type: 'engine_smoke', actor, tMs, params: {} });
export const boom = (at, tMs, size = 'large', extra = {}) => ({ type: 'explosion', at, tMs, params: { size, ...extra } });
export const dust = (actor, tMs, count = 10, intensity = 0.9) => ({ type: 'dust', actor, tMs, params: { count, intensity } });
export const mg = (actor, tMs, count = 9) => ({ type: 'mg_burst', actor, tMs, params: { count } });
export const barrage = (at, tMs, count = 6, radiusM = 14, extra = {}) => ({ type: 'barrage', at, tMs, params: { count, radiusM: Math.min(16, radiusM), size: 'mixed', durationS: 3.5, ...extra } });
export const sparks = (actor, tMs) => ({ type: 'sparks', actor, tMs, params: { caliberMm: 120 } });
export const exhaust = (actor, tMs) => ({ type: 'exhaust', actor, tMs, params: { count: 14, intensity: 0.95 } });
// media r5 cinematic types (fx lane)
export const flare = (at, tMs, extra = {}) => ({ type: 'flare', ...(typeof at === 'string' ? { actor: at } : { at }), tMs, params: { heightM: 90, burnS: 26, intensity: 1.2, driftMps: 1.4, fallMps: 2.6, color: 'white', launch: false, ...extra } });
export const smokeScreen = (actor, tMs, extra = {}) => ({ type: 'smoke_screen', actor, tMs, params: { durationS: 24, density: 1, ...extra } });
export const embers = (at, tMs, extra = {}) => ({ type: 'embers', ...(typeof at === 'string' ? { actor: at } : { at }), tMs, params: { radiusM: 4, rate: 40, durationS: 20, rise: 3, ...extra } });
export const debris = (at, tMs, extra = {}) => ({ type: 'debris', ...(typeof at === 'string' ? { actor: at } : { at }), tMs, params: { count: 30, speedMps: 18, hot: 0.6, scale: 1, ...extra } });
export const shockwave = (at, tMs, extra = {}) => ({ type: 'shockwave', at, tMs, params: { radiusM: 22, strength: 1.2, ...extra } });
export const fireField = (at, tMs, extra = {}) => ({ type: 'fire_field', at, tMs, params: { radiusM: 5, durationS: 30, intensity: 1, smoke: true, ...extra } });
export const huge = (at, tMs, extra = {}) => ({ type: 'explosion', at, tMs, params: { size: 'huge', ...extra } });
/** A point in the hero's frame at the effect's own time (resolved by buildShot): boom(H(-3, 4), t). */
export const H = (lat, lon) => ({ hero: [lat, lon] });

/** Path of a tank driving at constant speed (m/s) from `anchor` on `heading`,
 * turning at `curveDegS` (deg/s; + raises the heading, i.e. toward +X from +Z). t in ms. */
export function pathOf(anchor, heading, speed = 0, curveDegS = 0) {
  const h0 = rad(heading), w = rad(curveDegS);
  return t => {
    const T = t / 1000;
    if (Math.abs(w) < 1e-6 || !speed) return { p: [anchor[0] + Math.sin(h0) * speed * T, anchor[1] + Math.cos(h0) * speed * T], h: heading };
    return { p: [anchor[0] + speed / w * (Math.cos(h0) - Math.cos(h0 + w * T)), anchor[1] + speed / w * (Math.sin(h0 + w * T) - Math.sin(h0))], h: heading + curveDegS * T };
  };
}
/**
 * Route of a tank driving its own curve (owner 2026-10-05: "tanks should be moving in crazy directions with a lot of
 * speed"): waypoints `pts` [[lat, lon], ...] in the frame `fr` (the set's anchor and heading at t = 0), joined by a
 * centripetal Catmull-Rom (no cusps or loops between close points) and driven by arc length: standing until `startMs`,
 * then from `v0` (default `speed`) toward `speed` m/s at `accel` m/s². Past the last waypoint the tank carries on along
 * its final tangent — unless `stop`: then it brakes evenly over the last `brakeM` metres (default 14) and halts on the
 * last waypoint (a duel in a street, a tank pulling up to fire). The hull follows the curve's tangent. Returns t (ms) →
 * { p: [x, z], h: deg }.
 */
export function routePath(route, fr) {
  const pts = route.pts.map(([lat, lon]) => fr.at(lat, lon));
  if (pts.length < 2) throw new Error('routePath: a route needs two waypoints or more');
  const ext = [[2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]], ...pts,
    [2 * pts[pts.length - 1][0] - pts[pts.length - 2][0], 2 * pts[pts.length - 1][1] - pts[pts.length - 2][1]]];
  const dense = [[...pts[0], 0]];
  for (let i = 1; i < ext.length - 2; i++) {
    const [p0, p1, p2, p3] = [ext[i - 1], ext[i], ext[i + 1], ext[i + 2]];
    const kn = (a, b) => Math.max(1e-4, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
    const t1 = kn(p0, p1), t2 = t1 + kn(p1, p2), t3 = t2 + kn(p2, p3);
    const lerp2 = (a, b, ta, tb, t) => [0, 1].map((k) => ((tb - t) * a[k] + (t - ta) * b[k]) / (tb - ta));
    const n = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.4));
    for (let j = 1; j <= n; j++) { // Barry-Goldman pyramid on the centripetal knots
      const t = t1 + (t2 - t1) * j / n;
      const a1 = lerp2(p0, p1, 0, t1, t), a2 = lerp2(p1, p2, t1, t2, t), a3 = lerp2(p2, p3, t2, t3, t);
      const b1 = lerp2(a1, a2, 0, t2, t), b2 = lerp2(a2, a3, t1, t3, t);
      const q = lerp2(b1, b2, t1, t2, t), last = dense[dense.length - 1];
      dense.push([q[0], q[1], last[2] + Math.hypot(q[0] - last[0], q[1] - last[1])]);
    }
  }
  const total = dense[dense.length - 1][2];
  const end = dense[dense.length - 1], before = dense[Math.max(0, dense.length - 4)];
  const endDir = [end[0] - before[0], end[1] - before[1]].map((v, _, d) => v / Math.max(1e-6, Math.hypot(d[0], d[1])));
  const at = (d) => {
    if (d >= total) return [end[0] + endDir[0] * (d - total), end[1] + endDir[1] * (d - total)];
    if (d <= 0) return [dense[0][0], dense[0][1]];
    let lo = 0, hi = dense.length - 1;
    while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (dense[mid][2] <= d) lo = mid; else hi = mid; }
    const a = dense[lo], b = dense[hi], u = (d - a[2]) / Math.max(1e-9, b[2] - a[2]);
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  };
  const vmax = route.speed ?? 0, v0 = route.v0 ?? vmax, acc = Math.abs(route.accel ?? 0), startS = (route.startMs ?? 0) / 1000;
  const rampS = acc > 0 ? Math.abs(vmax - v0) / acc : 0, sign = Math.sign(vmax - v0);
  const free = (T) => (T <= rampS ? v0 * T + 0.5 * sign * acc * T * T : v0 * rampS + 0.5 * sign * acc * rampS * rampS + vmax * (T - rampS));
  // braking to a halt on the last waypoint: from the moment the free run reaches total - brakeM, an even deceleration
  // from the speed it has then
  const brakeM = Math.min(route.brakeM ?? 14, total * 0.5);
  let brakeT = Infinity, brakeV = vmax;
  if (route.stop) {
    let lo = 0, hi = 600;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (free(mid) < total - brakeM) lo = mid; else hi = mid; }
    brakeT = hi; brakeV = Math.max(0.1, (free(hi + 0.01) - free(hi)) / 0.01);
  }
  const dist = (t) => {
    const T = Math.max(0, t / 1000 - startS);
    if (T <= brakeT) return free(T);
    const a = brakeV * brakeV / (2 * brakeM), tau = Math.min(T - brakeT, brakeV / a);
    return total - brakeM + brakeV * tau - 0.5 * a * tau * tau;
  };
  const endH = Math.atan2(endDir[0], endDir[1]) * 180 / Math.PI;
  return (t) => {
    const d = dist(t), p = at(d);
    if (route.stop && d >= total - 0.05) return { p, h: endH };
    const q0 = at(Math.max(0, d - 0.8)), q1 = at(d + 0.8);
    const h = Math.atan2(q1[0] - q0[0], q1[1] - q0[1]) * 180 / Math.PI;
    return { p, h };
  };
}

const catmull1 = (p0, p1, p2, p3, u) => 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
// (aheadM interpolates like the rest: held key to key it stepped the route leads' distance, S01's previz 2026-10-08)
const CAM_FIELDS = ['side', 'along', 'lift', 'fov', 'roll', 'ls', 'la', 'll', 'orbit', 'radius', 'aheadM'];
/** Sample sparse camera keys (Catmull-Rom across keys, C1) at time t. */
function sampleKeys(keys, t, ease) {
  const ks = keys;
  if (t <= ks[0].tMs) return ks[0];
  if (t >= ks[ks.length - 1].tMs) return ks[ks.length - 1];
  let i = 0; while (i < ks.length - 2 && ks[i + 1].tMs <= t) i++;
  const a = ks[i], b = ks[i + 1], p0 = ks[Math.max(0, i - 1)], p3 = ks[Math.min(ks.length - 1, i + 2)];
  let u = (t - a.tMs) / Math.max(1, b.tMs - a.tMs);
  if (ease === 'inout') u = u * u * (3 - 2 * u);
  const out = { ...a, tMs: t };
  for (const k of CAM_FIELDS) if (a[k] != null && b[k] != null) out[k] = catmull1(p0[k] ?? a[k], a[k], b[k], p3[k] ?? b[k], u);
  return out;
}

/** Film shot: a setup plus motion. Tanks cruise at constant speed along straight or
 * curving paths (rigid formation, `linear` keys every `stepMs`), so they never stop
 * between keys. Camera keys are sparse offsets in the hero frame at their own time
 * (follow / chase / lead / orbit / crane), or pinned to the hero's frame at `pinMs`
 * (`frame:'world'` = tripod: pan / whip / pass-by) while `lookFrame:'hero'` (or
 * `lookActor`) keeps the lens on a moving tank. They are resampled densely on the
 * same grid as the tanks so the lens stays locked. Fields: side, along, lift, fov,
 * roll, lookHero [ls, la, ll]; `orbit` (deg around the hero) + `radius` replace side/along; `aheadM` rides the lens on
 * its actor's own path that many metres ahead of it (on past the take's end along its last heading) while the look
 * stays on the actor: a lead shot that follows the road's curve, on ground the route keeps clear.
 * Shot: { durMs, speed, curveDegS, foeSpeed, stepMs, ease, keepWidth, pinMs, turretSweep,
 *   turretKeys: [[tMs, deg]], turrets: { [actor]: deg | [[tMs, deg]] }, guns: { [actor]: deg | [[tMs, deg]] },
 *   routes: { [actor]: { pts, speed, v0, accel, startMs } }, aim: { [actor]: actor }, rail,
 *   cam: [...], cues, effects, film, still: { tMs, exposureMs } }
 * `turrets` / `guns` pose any actor (turret relative to its hull, + toward the hull's left; gun elevation): a number
 * holds, keys ease (smoothstep) from one to the next. `routes` drive actors on their own curves (routePath; waypoints in
 * the set's frame); allies without one keep the hero-relative formation, foes without one their straight path. `aim`
 * keeps an actor's gun on another actor's hull while it swerves (a stabilised gun). `rail: 'spline'` hands the lens keys
 * to the Studio's time-aware spline (C1 in position, aim, lens and roll) instead of linear segments. */
/** The Studio's storyboard caps (src/game/studioTimeline.ts): keys past them are dropped without a word. */
export const STUDIO_MAX_ACTOR_KEYS = 64, STUDIO_MAX_CAMERA_SHOTS = 32;
const keyAt = (spec, t) => {
  if (!Array.isArray(spec)) return spec;
  if (t <= spec[0][0]) return spec[0][1];
  if (t >= spec[spec.length - 1][0]) return spec[spec.length - 1][1];
  let i = 0; while (spec[i + 1][0] < t) i++;
  const u = (t - spec[i][0]) / (spec[i + 1][0] - spec[i][0]);
  return spec[i][1] + (spec[i + 1][1] - spec[i][1]) * u * u * (3 - 2 * u);
};
export function buildShot(s, m) {
  const scene = buildScene({ ...s, cameras: [] });
  delete scene.cameraVariants;
  const dur = m.durMs, sp = m.speed ?? 0, fsp = m.foeSpeed ?? 0, curve = m.curveDegS ?? 0;
  const keyedPose = [...Object.values(m.turrets ?? {}), ...Object.values(m.guns ?? {})].some(Array.isArray);
  const routes = new Map(Object.entries(m.routes ?? {}).map(([name, route]) => [name, routePath(route, frame(s.anchor, s.heading))]));
  for (const name of routes.keys()) if (!scene.actors.some(a => a.name === name)) throw new Error(`buildShot: a route for ${name}, who is not in the set`);
  for (const a of scene.actors) { // a routed actor starts where its route does
    const route = routes.get(a.name);
    if (route) { const q = route(0); a.pos = q.p.map(v => +v.toFixed(2)); a.facingDeg = +q.h.toFixed(2); }
  }
  for (const a of scene.actors) {
    if (m.turrets?.[a.name] != null) a.turretDeg = +keyAt(m.turrets[a.name], 0).toFixed(2);
    if (m.guns?.[a.name] != null) a.gunDeg = +keyAt(m.guns[a.name], 0).toFixed(2);
  }
  // The Studio keeps at most 64 keys per actor track and 32 camera shots (src/game/studioTimeline.ts) and silently
  // drops the rest: a 100 ms grid over a 6.6 s take froze the lens at 3.1 s and every turret at 6.3 s (2026-10-03).
  // Tracks sample on the finest step that fits 64 keys, the lens on the finest that fits 32, both with the lens's own
  // key times.
  const fit = (want, max) => Math.max(want, Math.ceil(dur / (max - 4) / 10) * 10);
  const camTimes = m.cam.map(c => (c.tMs === 'end' ? dur : c.tMs));
  const sampled = st => { const g = []; for (let t = 0; t < dur; t += st) g.push(Math.round(t)); g.push(dur); for (const t of camTimes) if (!g.includes(t)) g.push(t); return g.sort((a, b) => a - b); };
  const step = fit(m.stepMs ?? (curve || routes.size || (m.cam ?? []).length > 2 || m.keepWidth || keyedPose ? 100 : 250), STUDIO_MAX_ACTOR_KEYS);
  const grid = sampled(step), camGrid = sampled(fit(step, STUDIO_MAX_CAMERA_SHOTS));
  if (grid.length > STUDIO_MAX_ACTOR_KEYS || camGrid.length > STUDIO_MAX_CAMERA_SHOTS) throw new Error(`buildShot: ${grid.length} track keys / ${camGrid.length} lens keys exceed the Studio's caps`);
  const hero0 = scene.actors[0];
  const heroPath = routes.get('hero') ?? pathOf(hero0.pos, s.heading, sp, curve);
  // each actor: its own route, else a hero-relative rigid offset (allies) or its own straight path (foes)
  const paths = new Map();
  for (const a of scene.actors) {
    if (routes.has(a.name)) { paths.set(a.name, routes.get(a.name)); continue; }
    if (a.name.startsWith('foe')) { paths.set(a.name, pathOf(a.pos, a.facingDeg, fsp, 0)); continue; }
    const f0 = frame(hero0.pos, s.heading);
    const d = [a.pos[0] - hero0.pos[0], a.pos[1] - hero0.pos[1]];
    const lat = d[0] * f0.r[0] + d[1] * f0.r[1], lon = d[0] * f0.f[0] + d[1] * f0.f[1], yaw = a.facingDeg - s.heading;
    paths.set(a.name, t => { const hp = heroPath(t); const fr = frame(hp.p, hp.h); return { p: fr.at(lat, lon), h: hp.h + yaw }; });
  }
  const moving = sp > 0 || fsp > 0 || routes.size > 0 || m.turretKeys || m.turretSweep || keyedPose || m.aim;
  const gunAt = (a, t) => (m.guns?.[a.name] != null ? +keyAt(m.guns[a.name], t).toFixed(2) : a.gunDeg);
  const turretAt = (a, t) => {
    if (m.turrets?.[a.name] != null) return +keyAt(m.turrets[a.name], t).toFixed(2);
    if (m.aim?.[a.name]) { // a stabilised gun: the turret holds the target's bearing while the hull swerves
      const own = paths.get(a.name)(t), target = paths.get(m.aim[a.name])?.(t);
      if (!target) throw new Error(`buildShot: ${a.name} aims at ${m.aim[a.name]}, who is not in the set`);
      return +((((yawTo(own.p, target.p) - own.h) % 360) + 540) % 360 - 180).toFixed(2);
    }
    if (a.name === 'hero' && m.turretKeys) {
      const tk = m.turretKeys; if (t <= tk[0][0]) return tk[0][1]; if (t >= tk[tk.length - 1][0]) return tk[tk.length - 1][1];
      let i = 0; while (tk[i + 1][0] < t) i++; const u = (t - tk[i][0]) / (tk[i + 1][0] - tk[i][0]); return tk[i][1] + (tk[i + 1][1] - tk[i][1]) * (u * u * (3 - 2 * u));
    }
    return a.turretDeg + (m.turretSweep ?? 0) * t / dur;
  };
  const tracks = moving ? scene.actors.map(a => ({ actor: a.name, keys: grid.map((t, i) => {
    const q = paths.get(a.name)(t);
    return { id: `${a.name}-${i}`, tMs: t, pos: q.p, facingDeg: q.h, turretDeg: turretAt(a, t), gunDeg: gunAt(a, t), transition: 'linear' };
  }) })) : [];
  const keys = m.cam.map(c => {
    const [ls, la, ll] = c.lookHero ?? [0, 2, 1.8];
    return { ...c, tMs: c.tMs === 'end' ? dur : c.tMs, ls, la, ll };
  });
  const frameMode = c => c.frame ?? m.frame ?? 'hero';
  const lookMode = c => c.lookFrame ?? m.lookFrame ?? frameMode(c);
  const sig = c => `${frameMode(c)}|${lookMode(c)}|${c.lookActor ?? ''}|${c.actor ?? ''}|${c.pos ? 'abs' : ''}|${c.orbit != null}`;
  // 'travel' frames ride with an actor but steer by its heading averaged over ±travelS (default 1.5 s), so a lens keyed
  // around a swerving tank flows with its course instead of swinging with every zig-zag of the hull
  const travelW = (m.travelS ?? 1.5) * 1000;
  const travelHeading = (name, t) => {
    let sx = 0, sz = 0;
    for (let k = -4; k <= 4; k++) { const h = rad(paths.get(name)(Math.min(dur, Math.max(0, t + k * travelW / 4))).h); sx += Math.sin(h); sz += Math.cos(h); }
    return Math.atan2(sx, sz) * 180 / Math.PI;
  };
  const poseFrame = (mode, name, q, t) => frame(q.p, mode === 'travel' ? travelHeading(name, t) : q.h);
  // the point `dist` metres along an actor's path ahead of time t, continued along its last heading past the take's end
  // (a stopped hull keeps its lens that far ahead instead of meeting it)
  const aheadOn = (name, t, dist) => {
    let prev = paths.get(name)(t), left = dist;
    for (let tt = t + 100; tt <= dur; tt += 100) {
      const q = paths.get(name)(tt), d = Math.hypot(q.p[0] - prev.p[0], q.p[1] - prev.p[1]);
      if (d >= left) { const u = left / d; return { p: [prev.p[0] + (q.p[0] - prev.p[0]) * u, prev.p[1] + (q.p[1] - prev.p[1]) * u], h: q.h }; }
      left -= d; prev = q;
    }
    const h = rad(prev.h);
    return { p: [prev.p[0] + Math.sin(h) * left, prev.p[1] + Math.cos(h) * left], h: prev.h };
  };
  const evalKey = (c, t) => { // world pose [x, y, z, lx, ly, lz, fov, roll] of a key at time t
    const now = paths.get(c.actor ?? 'hero')(t), pinned = paths.get(c.actor ?? 'hero')(m.pinMs ?? 0);
    // (composition re-plan, 2026-10-08: Steinburg's streets had no clear low lens; one on the hull's own path is clear)
    const own = c.aheadM ? aheadOn(c.actor ?? 'hero', t, c.aheadM) : now;
    const fr = frameMode(c) === 'world' ? frame(pinned.p, pinned.h) : poseFrame(frameMode(c), c.actor ?? 'hero', own, t);
    const lookP = c.lookActor ? paths.get(c.lookActor)(t) : lookMode(c) === 'world' ? pinned : now;
    const lf = poseFrame(lookMode(c), c.lookActor ?? c.actor ?? 'hero', lookP, t);
    let side = c.side ?? 0, along = c.along ?? 0;
    if (c.orbit != null) { side = (c.radius ?? 12) * Math.sin(rad(c.orbit)); along = (c.radius ?? 12) * Math.cos(rad(c.orbit)); }
    const p = c.pos ? [c.pos[0], c.pos[2]] : fr.at(side, along);
    const q = lf.at(c.ls, c.la);
    return [p[0], c.pos ? c.pos[1] : (c.lift ?? 2), p[1], q[0], c.ll, q[1], c.fov ?? 40, c.roll ?? 0];
  };
  const keyIndex = t => { let i = 0; while (i < keys.length - 2 && keys[i + 1].tMs <= t) i++; return i; };
  const shots = camGrid.map((t, n) => {
    let pose;
    if (keys.length === 1 || t <= keys[0].tMs) pose = evalKey(keys[0], t);
    else if (t >= keys[keys.length - 1].tMs) pose = evalKey(keys[keys.length - 1], t);
    else {
      const i = keyIndex(t), a = keys[i], b = keys[i + 1];
      if (sig(a) === sig(b)) pose = evalKey(sampleKeys(keys, t, m.ease), t);
      else { // the look target or frame changes between keys: blend the two world poses (whip pans)
        let u = (t - a.tMs) / Math.max(1, b.tMs - a.tMs); u = u * u * (3 - 2 * u);
        const pa = evalKey(a, t), pb = evalKey(b, t);
        pose = pa.map((v, k) => v + (pb[k] - v) * u);
      }
    }
    const [x, y, z, lx, ly, lz, fov, roll] = pose;
    return { id: `cam-${n}`, label: `t${t}`, tMs: t, pos: [x, y, z], lookAt: [lx, ly, lz], fov, rollDeg: roll, transition: m.rail ?? 'linear', ...(m.absY ? { absY: true } : {}) };
  });
  if (m.keepWidth) { // dolly zoom: hold the subject's framed width while the camera travels
    const d = sh => Math.hypot(sh.pos[0] - sh.lookAt[0], sh.pos[2] - sh.lookAt[2]);
    const d0 = d(shots[0]), w0 = Math.tan(rad(shots[0].fov) / 2) * d0;
    for (const sh of shots) sh.fov = 2 * Math.atan(w0 / Math.max(0.5, d(sh))) * 180 / Math.PI;
  }
  scene.storyboard = { version: 1, durationMs: dur, groundRel: true, groundSmooth: m.groundSmooth ?? (shots.length > 6 ? 3 : 0), shots, actorTracks: tracks, cameraCues: m.cues ?? [] };
  // a 120° shutter (1/90 s at 30 fps; owner 2026-10-06: "make sure the videos are a lot higher quality and not blurry"):
  // with hulls at 9-15 m/s and the lens sweeping past at 7 m, 180° smeared the detail; a third less blur keeps the
  // motion smooth and the hulls crisp
  // a 90° shutter (media wave m1, 2026-10-07: at 120° the critics read fast moves as smear, and the owner asked for
  // videos "not blurry")
  // a 60° shutter (shutter wave s1, 2026-10-08: S13 rendered at 60° and 90° and judged blind in three frame pairs; both
  // critics called 60° clearer in all three, on the near-lens ground, the foliage and the road wheels, and read its
  // streaks as camera motion rather than a filter)
  scene.film = m.film ?? s.film ?? { fps: 30, shutterDeg: 60, samples: 8, maxSamples: 48 };
  scene.effects = [...(s.effects ?? []), ...(m.effects ?? [])].sort((a, b) => a.tMs - b.tMs).map(fx => {
    if (!fx.at?.hero) return fx;
    const hp = heroPath(fx.tMs), q = frame(hp.p, hp.h).at(fx.at.hero[0], fx.at.hero[1]);
    return { ...fx, at: [+q[0].toFixed(2), +q[1].toFixed(2)], heroRel: true };
  });
  scene.fxTime = 0;
  scene.camera = { pos: shots[0].pos, lookAt: shots[0].lookAt, fov: shots[0].fov, groundRel: true };
  if (m.still) scene.still = m.still;
  return scene;
}
