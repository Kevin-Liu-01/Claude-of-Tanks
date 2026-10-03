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
      const base = fr.at((e.lat ?? 0) + lat * (e.spread ?? 1), (e.along ?? 160) - lon * (e.spread ?? 1) * 0.5);
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
const catmull1 = (p0, p1, p2, p3, u) => 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
const CAM_FIELDS = ['side', 'along', 'lift', 'fov', 'roll', 'ls', 'la', 'll', 'orbit', 'radius'];
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
 * roll, lookHero [ls, la, ll]; `orbit` (deg around the hero) + `radius` replace side/along.
 * Shot: { durMs, speed, curveDegS, foeSpeed, stepMs, ease, keepWidth, pinMs, turretSweep,
 *   turretKeys: [[tMs, deg]], turrets: { [actor]: deg | [[tMs, deg]] }, guns: { [actor]: deg | [[tMs, deg]] },
 *   cam: [...], cues, effects, film, still: { tMs, exposureMs } }
 * `turrets` / `guns` pose any actor (turret relative to its hull, + toward the hull's left; gun elevation): a number
 * holds, keys ease (smoothstep) from one to the next. */
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
  const step = fit(m.stepMs ?? (curve || (m.cam ?? []).length > 2 || m.keepWidth || keyedPose ? 100 : 250), STUDIO_MAX_ACTOR_KEYS);
  const grid = sampled(step), camGrid = sampled(fit(step, STUDIO_MAX_CAMERA_SHOTS));
  if (grid.length > STUDIO_MAX_ACTOR_KEYS || camGrid.length > STUDIO_MAX_CAMERA_SHOTS) throw new Error(`buildShot: ${grid.length} track keys / ${camGrid.length} lens keys exceed the Studio's caps`);
  const hero0 = scene.actors[0];
  const heroPath = pathOf(hero0.pos, s.heading, sp, curve);
  // each actor: hero-relative rigid offset (allies) or its own straight path (foes)
  const paths = new Map();
  for (const a of scene.actors) {
    if (a.name.startsWith('foe')) { paths.set(a.name, pathOf(a.pos, a.facingDeg, fsp, 0)); continue; }
    const f0 = frame(hero0.pos, s.heading);
    const d = [a.pos[0] - hero0.pos[0], a.pos[1] - hero0.pos[1]];
    const lat = d[0] * f0.r[0] + d[1] * f0.r[1], lon = d[0] * f0.f[0] + d[1] * f0.f[1], yaw = a.facingDeg - s.heading;
    paths.set(a.name, t => { const hp = heroPath(t); const fr = frame(hp.p, hp.h); return { p: fr.at(lat, lon), h: hp.h + yaw }; });
  }
  const moving = sp > 0 || fsp > 0 || m.turretKeys || m.turretSweep || keyedPose;
  const gunAt = (a, t) => (m.guns?.[a.name] != null ? +keyAt(m.guns[a.name], t).toFixed(2) : a.gunDeg);
  const turretAt = (a, t) => {
    if (m.turrets?.[a.name] != null) return +keyAt(m.turrets[a.name], t).toFixed(2);
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
  const evalKey = (c, t) => { // world pose [x, y, z, lx, ly, lz, fov, roll] of a key at time t
    const own = paths.get(c.actor ?? 'hero')(t), pinned = paths.get(c.actor ?? 'hero')(m.pinMs ?? 0);
    const fr = frameMode(c) === 'world' ? frame(pinned.p, pinned.h) : frame(own.p, own.h);
    const lookP = c.lookActor ? paths.get(c.lookActor)(t) : lookMode(c) === 'world' ? pinned : own;
    const lf = frame(lookP.p, lookP.h);
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
    return { id: `cam-${n}`, label: `t${t}`, tMs: t, pos: [x, y, z], lookAt: [lx, ly, lz], fov, rollDeg: roll, transition: 'linear', ...(m.absY ? { absY: true } : {}) };
  });
  if (m.keepWidth) { // dolly zoom: hold the subject's framed width while the camera travels
    const d = sh => Math.hypot(sh.pos[0] - sh.lookAt[0], sh.pos[2] - sh.lookAt[2]);
    const d0 = d(shots[0]), w0 = Math.tan(rad(shots[0].fov) / 2) * d0;
    for (const sh of shots) sh.fov = 2 * Math.atan(w0 / Math.max(0.5, d(sh))) * 180 / Math.PI;
  }
  scene.storyboard = { version: 1, durationMs: dur, groundRel: true, groundSmooth: m.groundSmooth ?? (shots.length > 6 ? 3 : 0), shots, actorTracks: tracks, cameraCues: m.cues ?? [] };
  scene.film = m.film ?? s.film ?? { fps: 30, shutterDeg: 180, samples: 8, maxSamples: 48 };
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
