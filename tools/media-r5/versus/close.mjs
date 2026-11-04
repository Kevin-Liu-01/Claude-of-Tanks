#!/usr/bin/env node
// Round 11 of the versus stills, the close group (the owner, 2026-11-02: "use cooler angles and make the shots closer to
// the tanks and make them together closer to center of the frame. more interesting perspectives too"). Rounds 6-10 split
// each pair to the frame's two sides with open ground between them. Here a duel is staged again as a group: the foe is
// brought in along its own bearing to 9-15 m from the hero (the first spot whose footprint is clear), the turrets laid on
// each other and the foe's hit and debris carried with it; then a lens is searched round the pair, in four families:
//   low    1.1-1.5 m up (lower, the lens sits in the grass), 9-20 m off, a Dutch roll allowed: the hulls tower over it
//   mid    2-3.2 m up, 10-25 m off: the eye of a crewman on the next hull
//   high   6-12 m up, 10-24 m off: a drone's look down on both decks
//   tele   1.5-6 m up, 35-60 m off, a long lens: the pair stacked and compressed
// Each candidate is aimed at the pair, its FOV fitted so the two boxes together span 1.55 of the frame's 2 (78 %), and
// re-aimed so that union sits on the frame's centre. It passes only when (rule set before the search): both tanks are
// whole inside 0.92 of every edge; the hero spans at least half the frame's width and the foe at least 22 %; each shows
// a front or three-quarter (hero within 40° of its nose, foe 65°); the nearer of the two covers at most 15 % of the
// hero's box or 35 % of the foe's; no other tank of the scene stands nearer over the pair; the view looks down at most
// 32°; no record, terrain or smoke source stands between the lens and either hull. (Review of the first 50, 11-02: at
// 55° the hero showed its side with the foe behind it, at 0.5 m the lens sat in the grass, a column's third tank laid
// its barrel across one lens, and 9 m up over 8 m read as a plan view.) Of the passes the score prefers a
// bigger hero, a bigger foe, a nearer lens, a view at least 30° from the round's own and the sun behind the lens.
//   node tools/media-r5/versus/close.mjs solve <id> [id ...]        the best lens of each family, with its boxes
//   node tools/media-r5/versus/close.mjs write <id>:<family> ... [--round=12]  -> v6/zz-close-r<round>.mjs, the picks
// Run from the repository root. The picks' scenes then go through versus6.mjs check and final like every other round.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SCENES, frameOf, tankBox, modelOf, dimsOf, bearingOf, polar, wrap, r2, axes, DEG, ground, fx } from './versus.mjs';
import { sightBlockers, insideRecord } from '../world-model.mjs';
import { TANK_IDS, TANK_ID_RENAMES } from '../../../src/vehicles/tankIdAliases.ts';
// a current id's schema-1 spelling (the renames undone, newest first): the spelling the hull dims are looked up by
const UNDO = TANK_ID_RENAMES.map((step) => Object.fromEntries(Object.entries(step).map(([from, to]) => [to, from]))).reverse();
const schema1Of = (id) => UNDO.reduce((x, undo) => undo[x] ?? x, id);

const FAMILIES = {
  low: { h: [1.1, 1.5], d: [9, 11, 13, 16, 20], roll: [0, 9, -9], fov: 45 },
  mid: { h: [2, 3.2], d: [10, 13, 16, 20, 25], roll: [0, 6, -6], fov: 45 },
  high: { h: [6, 9, 12], d: [10, 14, 18, 24], roll: [0], fov: 45 },
  tele: { h: [1.5, 3.5, 6], d: [35, 45, 60], roll: [0, 5, -5], fov: 14 },
  // round 13 (the owner, 2026-11-04: "for loading screens we need to use these elevated scenes with excellent framing
  // perspective effects explosions and visual effects/motion"): three elevated families, each with its own look-down
  // range (down, degrees), the pair's span, the least width each tank fills, and a shell burst in frame (burst)
  // (the least widths are a share of the span: the hero about half of the pair's, the foe about a quarter, so the guns'
  // 2 m clearance, which sets the foe 10-18 m off, still leaves a pair that fills the frame)
  drone: { h: [8, 11, 14], d: [12, 16, 20, 26], roll: [0, 6, -6], fov: 45, down: [22, 45], span: 1.55, hero: 0.75, foe: 0.36, burst: true },
  crane: { h: [16, 20, 26], d: [18, 24, 32], roll: [0, 4, -4], fov: 40, down: [30, 55], span: 1.4, hero: 0.62, foe: 0.3, burst: true, burstTop: 0.75 },
  ridge: { h: [10, 15, 22], d: [45, 60, 80], roll: [0, 4, -4], fov: 16, down: [10, 25], span: 1.55, hero: 0.75, foe: 0.36, burst: true },
};
const SPAN = 1.55, EDGE = 0.92;
// the families a solve searches (--families=a,b; default the four close families of rounds 11-12)
const FAMS = process.argv.find((a) => a.startsWith('--families='))?.slice(11).split(',') ?? ['low', 'mid', 'high', 'tele'];
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const byName = (s, n) => s.actors.find((a) => a.name === n);

/** The scene with its foe brought in to `gapM` from the hero along the same bearing, turrets laid on each other. */
export function regroup(s, gapM) {
  const hero = byName(s, 'hero'), foe = byName(s, 'foe0'), from = foe.pos, to = polar(hero.pos, bearingOf(hero.pos, from), gapM).map(r2);
  const dx = to[0] - from[0], dz = to[1] - from[1], dy = ground(s.map, ...to) - ground(s.map, ...from);
  foe.pos = to;
  hero.turretDeg = r2(wrap(bearingOf(hero.pos, foe.pos) - hero.facingDeg));
  foe.turretDeg = r2(wrap(bearingOf(foe.pos, hero.pos) - foe.facingDeg));
  // the foe's own hit, debris and embers (within 7 m of where it stood) move with it
  for (const e of s.effects) {
    if (!Array.isArray(e.at) || dist2([e.at[0], e.at.at(-1)], from) > 7) continue;
    e.at = e.at.length === 3 ? [r2(e.at[0] + dx), r2(e.at[1] + dy), r2(e.at[2] + dz)] : [r2(e.at[0] + dx), r2(e.at[1] + dz)];
  }
  for (const tr of s.storyboard?.actorTracks ?? []) {
    const a = byName(s, tr.actor);
    for (const k of tr.keys) {
      if (a === foe) k.pos = [r2(k.pos[0] + dx), r2(k.pos[1] + dz)];
      k.turretDeg = a.turretDeg;
    }
  }
  return s;
}

/** The first gap from 9 to 18 m whose foe footprint is clear (no record contact, slope ≤ 0.2, wet ≤ 0.3) and that keeps
 *  the two guns, laid on each other, 2 m apart muzzle to muzzle (round 13's elevated look showed 9 m crossing them:
 *  each gun reaches ~6 m from its hull's centre), or null. */
function clearGap(id) {
  for (let gap = 9; gap <= 18; gap++) {
    const s = regroup(SCENES[id](), gap), model = modelOf(s.map), foe = byName(s, 'foe0'), d = dimsOf(foe.id), h = dimsOf(byName(s, 'hero').id);
    const tooClose = dist2(foe.pos, byName(s, 'hero').pos) < Math.max((d[0] + h[0]) * 0.9, d[2] + h[2] + 2);
    if (!tooClose && !model.hullContacts(foe.pos[0], foe.pos[1], foe.facingDeg * DEG, d[0], d[1]).length
      && model.slopeAt(foe.pos[0], foe.pos[1]) <= 0.2 && model.wetAt(foe.pos[0], foe.pos[1]) <= 0.3) return gap;
  }
  return null;
}

// the lens's frame axes, as frameOf builds them (the eye and look point in world space, roll applied)
export function axesOf(model, c) {
  const eye = [c.pos[0], model.heightAt(c.pos[0], c.pos[2]) + c.pos[1], c.pos[2]];
  const look = [c.lookAt[0], model.heightAt(c.lookAt[0], c.lookAt[2]) + c.lookAt[1], c.lookAt[2]];
  const fw = look.map((x, k) => x - eye[k]), fl = Math.hypot(...fw), w = fw.map((x) => x / fl);
  const right0 = [-w[2], 0, w[0]].map((x) => x / Math.hypot(w[2], w[0]));
  const up0 = [right0[1] * w[2] - right0[2] * w[1], right0[2] * w[0] - right0[0] * w[2], right0[0] * w[1] - right0[1] * w[0]];
  const rr = (c.rollDeg ?? 0) * DEG, cr = Math.cos(rr), sr = Math.sin(rr);
  return { eye, look, fl, right: right0.map((x, k) => x * cr + up0[k] * sr), up: up0.map((x, k) => x * cr - right0[k] * sr) };
}
const unionOf = (bs) => ({ x0: Math.min(...bs.map((b) => b.x0)), x1: Math.max(...bs.map((b) => b.x1)),
  y0: Math.min(...bs.map((b) => b.y0)), y1: Math.max(...bs.map((b) => b.y1)) });
const boxesOf = (model, s, c) => { const F = frameOf(model, c); return [byName(s, 'hero'), byName(s, 'foe0')].map((a) => tankBox(model, F, a)); };

// terrain between the lens and a hull, as versus.mjs check tests it: five low rays, three cut is hidden
function terrainHides(model, eye, a) {
  const d = dimsOf(a.id), gy0 = model.supportAt(a.pos[0], a.pos[1]), ax = axes(a.facingDeg);
  let cut = 0;
  for (const [l, w2] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const q = [a.pos[0] + ax.f[0] * d[0] * l + ax.r[0] * d[1] * w2, gy0 + (l || w2 ? 0.3 : 1.0), a.pos[1] + ax.f[1] * d[0] * l + ax.r[1] * d[1] * w2];
    const dx = q[0] - eye[0], dy = q[1] - eye[1], dz = q[2] - eye[2], n = Math.max(2, Math.ceil(Math.hypot(dx, dz)));
    for (let k = 1; k < n - 1; k++) { const t = k / n; if (model.heightAt(eye[0] + dx * t, eye[2] + dz * t) > eye[1] + dy * t + 0.05) { cut++; break; } }
  }
  return cut >= 3;
}

/** Fit the candidate's FOV to the span and centre the union on the frame; null when it cannot. */
function fit(model, s, c, span = SPAN) {
  for (let pass = 0; pass < 3; pass++) {
    const bs = boxesOf(model, s, c);
    if (bs.some((b) => !b)) return null;
    const u = unionOf(bs), k = span / Math.max(u.x1 - u.x0, (u.y1 - u.y0) * 1.05);
    c.fov = r2(2 * Math.atan(Math.tan(c.fov * DEG / 2) / k) / DEG);
    if (c.fov < 7 || c.fov > 65) return null;
    const A = axesOf(model, c), tanV = Math.tan(c.fov * DEG / 2), tanH = tanV * 16 / 9;
    const cx = (u.x0 + u.x1) / 2 * k, cy = (u.y0 + u.y1) / 2 * k;
    const p = A.look.map((x, i) => x + (A.right[i] * cx * tanH + A.up[i] * cy * tanV) * A.fl);
    c.lookAt = [r2(p[0]), r2(p[1] - model.heightAt(p[0], p[2])), r2(p[2])];
  }
  return c;
}

function judge(model, s, c, ownBearing, fam = {}) {
  const hero = byName(s, 'hero'), foe = byName(s, 'foe0'), [H, Fo] = boxesOf(model, s, c);
  if (!H || !Fo) return null;
  const inside = (b) => b.x0 > -EDGE && b.x1 < EDGE && b.y0 > -EDGE && b.y1 < EDGE;
  const hw = H.x1 - H.x0, fw = Fo.x1 - Fo.x0, u = unionOf([H, Fo]);
  if (!inside(H) || !inside(Fo) || hw < (fam.hero ?? 1.0) || fw < (fam.foe ?? 0.44)) return null;
  if (Math.abs((u.x0 + u.x1) / 2) > 0.08 || Math.abs((u.y0 + u.y1) / 2) > 0.12) return null;
  const A = axesOf(model, c), eye2 = [A.eye[0], A.eye[2]];
  const offH = Math.abs(wrap(bearingOf(hero.pos, eye2) - hero.facingDeg)), offF = Math.abs(wrap(bearingOf(foe.pos, eye2) - foe.facingDeg));
  if (offH > 40 || offF > 65) return null;
  const ox = Math.max(0, Math.min(H.x1, Fo.x1) - Math.max(H.x0, Fo.x0)), oy = Math.max(0, Math.min(H.y1, Fo.y1) - Math.max(H.y0, Fo.y0));
  if (Fo.z < H.z && ox * oy > 0.15 * hw * (H.y1 - H.y0)) return null;
  if (H.z <= Fo.z && ox * oy > 0.35 * fw * (Fo.y1 - Fo.y0)) return null;
  const pairGround = model.supportAt(hero.pos[0], hero.pos[1]), [down0, down1] = fam.down ?? [-90, 32];
  const down = Math.atan2(A.eye[1] - pairGround, Math.hypot(A.eye[0] - hero.pos[0], A.eye[2] - hero.pos[1])) / DEG;
  if (down < down0 || down > down1) return null;
  const Fr = frameOf(model, c);
  for (const o of s.actors) {
    if (o === hero || o === foe || !dimsOf(o.id)) continue;
    const b = tankBox(model, Fr, o);
    if (b && b.z < Math.max(H.z, Fo.z) && b.x1 > u.x0 && b.x0 < u.x1 && b.y1 > u.y0 && b.y0 < u.y1) return null;
  }
  if (insideRecord(model, A.eye, 0.3)) return null;
  for (const a of [hero, foe]) {
    if (sightBlockers(model, A.eye, [a.pos[0], model.supportAt(a.pos[0], a.pos[1]) + 1.3, a.pos[1]]).length || terrainHides(model, A.eye, a)) return null;
  }
  // a smoke or fire source between the lens and a hull
  const F = frameOf(model, c);
  for (const e of s.effects) {
    if (!['explosion', 'fire_field', 'embers'].includes(e.type) || !Array.isArray(e.at)) continue;
    const q = F.project(e.at.length === 3 ? e.at : [e.at[0], model.heightAt(e.at[0], e.at[1]) + 1.5, e.at[1]]);
    if (q && [H, Fo].some((b) => q[2] < b.z - 1 && q[0] > b.x0 - 0.04 && q[0] < b.x1 + 0.04 && q[1] > b.y0 - 0.1 && q[1] < b.y1 + 0.25)) return null;
  }
  const view = bearingOf(eye2, [(hero.pos[0] + foe.pos[0]) / 2, (hero.pos[1] + foe.pos[1]) / 2]);
  const fresh = Math.abs(wrap(bearingOf([(hero.pos[0] + foe.pos[0]) / 2, (hero.pos[1] + foe.pos[1]) / 2], eye2) - ownBearing)) >= 30 ? 0.2 : 0;
  const lit = s.timeOfDay === 'night' || !s.light ? 0 : 0.15 * Math.cos(wrap(s.light.sunAzimuthDeg - view - 180) * DEG);
  const near = Math.hypot(A.eye[0] - hero.pos[0], A.eye[2] - hero.pos[1]);
  // (round 13) an elevated lens carries a shell burst beyond the pair, rising above it in frame, never over a hull
  let extra = [], fire = 0;
  if (fam.burst) {
    extra = burstFor(model, s, A, F, [H, Fo], fam.burstTop);
    if (!extra) return null;
    for (const e of [...s.effects, ...extra]) {
      if (!['explosion', 'fire_field', 'embers', 'debris'].includes(e.type) || !Array.isArray(e.at)) continue;
      const q = F.project(e.at.length === 3 ? e.at : [e.at[0], model.heightAt(e.at[0], e.at[1]) + 1.5, e.at[1]]);
      if (q && Math.abs(q[0]) < 0.95 && Math.abs(q[1]) < 0.95) fire++;
    }
  }
  return { score: Math.min(hw, 1.25) + 0.6 * Math.min(fw, 0.8) - 0.004 * near + fresh + lit + 0.08 * Math.min(fire, 4), hw, fw, offH, offF, near, down, H, Fo, extra };
}

/** A large HE burst 4-22 m beyond the pair (away from the lens), up to 13 m to a side, peaking at the still: the first
 *  spot on open, dry ground that lands inside the frame (no higher than `top`) beside the hulls or above their tops,
 *  clear of both boxes; null if none. */
function burstFor(model, s, A, F, boxes, top = 0.55) {
  const hero = byName(s, 'hero'), foe = byName(s, 'foe0'), mid = [(hero.pos[0] + foe.pos[0]) / 2, (hero.pos[1] + foe.pos[1]) / 2];
  const away = bearingOf([A.eye[0], A.eye[2]], mid), T = s.fxTime;
  for (const beyond of [4, 8, 12, 16, 22]) for (const side of [0, -5, 5, -9, 9, -13, 13]) {
    const p = polar(polar(mid, away, beyond), away + 90, side).map(r2), gy = model.heightAt(p[0], p[1]);
    if (model.wetAt(p[0], p[1]) > 0.3 || model.slopeAt(p[0], p[1]) > 0.35 || insideRecord(model, [p[0], gy + 1, p[1]], 2)) continue;
    const q = F.project([p[0], gy + 1, p[1]]);
    if (!q || Math.abs(q[0]) > 0.8 || q[1] > top || q[1] < -0.85) continue;
    if (boxes.some((b) => q[0] > b.x0 - 0.06 && q[0] < b.x1 + 0.06 && q[1] < b.y1 + 0.18)) continue;
    return [fx('explosion', p, T - 280, { size: 'large', munition: 'he', cause: 'shot' }),
      fx('debris', [p[0], r2(gy + 1.4), p[1]], T - 255, { count: 40, speedMps: 16, hot: 0.5, scale: 1.3 })];
  }
  return null;
}

function solve(id) {
  const gap = clearGap(id);
  if (gap === null) return { id, gap: null, best: {} };
  return { id, gap, best: lensesFor(regroup(SCENES[id](), gap)) };
}

/** (round 13) A fleet take (a filmed scene, site50/fleet-268/scenes/<id>.json) frozen at its still for the judge: every
 *  tracked actor where it stands then, named in schema-1 spellings (the dims' key), the hero and its nearest tank
 *  within 30 m as the pair (named hero and foe0, the judge's names), the take's own camera at the still as the round's
 *  lens; null when no tank is that near or the hero has no dims. */
function takeSnapshot(take) {
  const T = take.still?.tMs ?? take.meta?.still?.tMs, tracks = take.storyboard?.actorTracks ?? [];
  const at = (keys) => {
    const k = Math.max(0, keys.findLastIndex((x) => x.tMs <= T)), a = keys[k], b = keys[k + 1] ?? a, u = b.tMs > a.tMs ? (T - a.tMs) / (b.tMs - a.tMs) : 0;
    return { pos: [r2(a.pos[0] + (b.pos[0] - a.pos[0]) * u), r2(a.pos[1] + (b.pos[1] - a.pos[1]) * u)],
      facingDeg: r2(a.facingDeg + wrap(b.facingDeg - a.facingDeg) * u), turretDeg: a.turretDeg ?? 0 };
  };
  const actors = [];
  for (const a of take.actors) {
    const current = TANK_IDS.resolve(a.id, take.tankIdSchema ?? 1), id = schema1Of(current);
    if (TANK_IDS.resolve(id, 1) !== current) return null;
    const tr = tracks.find((t) => t.actor === a.name);
    actors.push({ ...a, id, ...(tr ? at(tr.keys) : {}) });
  }
  const hero = actors.find((a) => a.name === 'hero');
  const mate = actors.filter((a) => a !== hero && dimsOf(a.id) && !a.state).sort((a, b) => dist2(a.pos, hero.pos) - dist2(b.pos, hero.pos))[0];
  if (!hero || !dimsOf(hero.id) || !mate || dist2(mate.pos, hero.pos) > 30) return null;
  const mateName = mate.name;
  for (const a of actors) if (a.name === 'foe0') a.name = 'foe0-take';
  mate.name = 'foe0';
  const shots = take.storyboard?.shots ?? [], own = shots.findLast((c) => c.tMs <= T) ?? take.camera;
  return { map: take.map, timeOfDay: take.timeOfDay, light: take.light, actors, effects: take.effects ?? [], fxTime: T, lenses: [own], mate: mateName };
}

/** The take's scene through a round-13 lens: the lens held still (no camera shots or cues), the burst added, the
 *  placements as filmed (autoPlace off) and the still's time in meta.stillMs. */
function takeFinal(take, snap, fam, view, b) {
  const id = `${take.meta.id}-${fam}${view > 1 ? view : ''}-r${ROUND}`, lens = { ...b.lens, name: 'a' };
  return { ...take, autoPlace: false, camera: lens, cameraVariants: [lens], effects: [...(take.effects ?? []), ...b.extra],
    storyboard: { ...take.storyboard, shots: [], cameraCues: [] },
    meta: { ...take.meta, id, round: ROUND, source: take.meta.id, stillMs: snap.fxTime, pair: `hero and ${snap.mate}`,
      idea: `the elevated group, ${fam} lens over a fleet take` } };
}

function lensesFor(s) {
  const model = modelOf(s.map), hero = byName(s, 'hero'), foe = byName(s, 'foe0');
  const G = [hero.pos[0] * 0.55 + foe.pos[0] * 0.45, hero.pos[1] * 0.55 + foe.pos[1] * 0.45];
  const own = s.lenses[0], ownBearing = bearingOf(G, [own.pos[0], own.pos[2]]);
  // each family's best lens, and (--views=n, round 13) up to n-1 more, each at least 50° round the pair from the others
  const best = {};
  for (const fam of FAMS) {
    const F = FAMILIES[fam], passes = [];
    if (!F) throw Error(`no lens family ${fam}`);
    for (let az = 0; az < 360; az += 5) for (const d of F.d) for (const h of F.h) for (const roll of F.roll) {
      const eye = polar(G, az, d);
      const c = fit(model, s, { name: fam, pos: [r2(eye[0]), h, r2(eye[1])], lookAt: [r2(G[0]), 1.3, r2(G[1])], fov: F.fov, rollDeg: roll, groundRel: true }, F.span);
      const j = c && judge(model, s, c, ownBearing, F);
      if (j) passes.push({ ...j, lens: c, az });
    }
    const picks = [];
    for (const p of passes.sort((a, b) => b.score - a.score)) {
      if (picks.length < VIEWS && picks.every((q) => Math.abs(wrap(p.az - q.az)) >= 50)) picks.push(p);
    }
    if (picks.length) best[fam] = picks;
  }
  return best;
}
const VIEWS = Number(process.argv.find((a) => a.startsWith('--views='))?.slice(8) ?? 1);

// --round=<n> (default 11): the round a write names its scenes and rows file for (12: the second pass, 11-02)
const ROUND = Number(process.argv.find((a) => a.startsWith('--round='))?.slice(8) ?? 11);
const ROWS = `zz-close-r${ROUND}.mjs`;
const newId = (id, fam, view = 1) => `${id.replace(/-r\d+(-front)?$/, '')}-${fam}${view > 1 ? view : ''}-r${ROUND}`;
function cli([mode, ...args]) {
  const rest = args.filter((a) => !a.startsWith('--'));
  if (mode === 'solve') {
    for (const id of rest) {
      const { gap, best } = solve(id);
      console.log(`${id}: ${gap === null ? 'no clear spot for the foe within 18 m' : `foe at ${gap} m`}`);
      for (const [fam, views] of Object.entries(best)) for (const [k, b] of views.entries()) {
        const f = (x) => x.toFixed(2);
        console.log(`  ${`${fam}${k ? `:${k + 1}` : ''}`.padEnd(7)} score ${f(b.score)}  hero ${(50 * b.hw).toFixed(0)} %  foe ${(50 * b.fw).toFixed(0)} %  hero ${b.offH.toFixed(0)}° foe ${b.offF.toFixed(0)}° off nose  lens ${b.near.toFixed(1)} m from the hero, ${b.lens.pos[1]} m up, ${b.down.toFixed(0)}° down, fov ${b.lens.fov}, roll ${b.lens.rollDeg}${b.extra.length ? ', a burst beyond' : ''}`);
        console.log(`       ${JSON.stringify(b.lens)}`);
      }
    }
  } else if (mode === 'write') {
    const rows = [];
    for (const p of rest) {
      const [id, fam, view = '1'] = p.split(':'), { gap, best } = solve(id), b = best[fam]?.[Number(view) - 1];
      if (!b) throw Error(`${id}: no ${fam} lens ${view} passes`);
      rows.push([newId(id, fam, Number(view)), id, gap, fam, { ...b.lens, name: 'a' }, b.extra]);
      console.log(`[close] ${newId(id, fam, Number(view))}: ${id}, foe at ${gap} m, ${fam} ${view}`);
    }
    const body = rows.map((r) => `  ${JSON.stringify(r)},`).join('\n');
    writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'v6', ROWS), `// Round ${ROUND} (close.mjs write): each row is [id, source scene, foe gap in m, family, lens, added effects], picked
// from close.mjs solve. The source's staging, effects, light and picture stand; regroup() brings the foe in, the lens is
// the pick's, and an elevated family's burst beyond the pair joins the effects.
import { SCENES } from '../versus.mjs';
import { regroup } from '../close.mjs';

const ROWS = [
${body}
];
for (const [ID, SRC, GAP, FAMILY, LENS, EXTRA = []] of ROWS) {
  SCENES[ID] = () => {
    const s = regroup(SCENES[SRC](), GAP);
    return { ...s, effects: [...s.effects, ...EXTRA], lenses: [{ ...LENS }],
      meta: { ...s.meta, id: ID, round: ${ROUND}, source: SRC, idea: 'the ' + (EXTRA.length ? 'elevated' : 'close') + ' group, ' + FAMILY + ' lens' } };
  };
}
`);
    console.log(`[close] v6/${ROWS}: ${rows.length} scenes`);
  } else if (mode === 'take-solve' || mode === 'take-write') {
    // (round 13) fleet takes: take-solve <scene.json> ...; take-write <scene.json>:<family>[:view] ... --out=<dir>
    const out = args.find((a) => a.startsWith('--out='))?.slice(6);
    if (mode === 'take-write' && !out) throw Error('take-write needs --out=<dir>');
    for (const p of rest) {
      const [path, fam, view = '1'] = mode === 'take-write' ? p.split(':') : [p];
      const take = JSON.parse(readFileSync(path, 'utf8')), snap = takeSnapshot(take);
      if (!snap) { console.log(`${take.meta.id}: no tank within 30 m of the hero at the still, or an id outside the dims`); continue; }
      const best = lensesFor(snap);
      if (mode === 'take-solve') {
        console.log(`${take.meta.id}: the hero and ${snap.mate} at ${snap.fxTime} ms (${take.map})`);
        for (const [f, views] of Object.entries(best)) for (const [k, b] of views.entries()) {
          console.log(`  ${`${f}${k ? `:${k + 1}` : ''}`.padEnd(7)} score ${b.score.toFixed(2)}  hero ${(50 * b.hw).toFixed(0)} %  mate ${(50 * b.fw).toFixed(0)} %  lens ${b.near.toFixed(1)} m from the hero, ${b.lens.pos[1]} m up, ${b.down.toFixed(0)}° down, fov ${b.lens.fov}`);
        }
        continue;
      }
      const b = best[fam]?.[Number(view) - 1];
      if (!b) throw Error(`${take.meta.id}: no ${fam} lens ${view} passes`);
      const scene = takeFinal(take, snap, fam, Number(view), b);
      writeFileSync(join(out, `${scene.meta.id}.json`), JSON.stringify(scene, null, 1));
      console.log(`[close] ${scene.meta.id}: ${take.meta.id}, ${fam} ${view}`);
    }
  } else throw Error('mode: solve <id...> | write <id>:<family>... | take-solve <scene.json>... | take-write <scene.json>:<family>... --out=<dir>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const DIR = join(dirname(fileURLToPath(import.meta.url)), 'v6');
  // the sources only: a round's rows import this file, which is still loading here
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.mjs') && !x.startsWith('zz-close-')).sort()) {
    try { await import(pathToFileURL(join(DIR, f)).href); } catch (e) { console.error(`[close] skipped v6/${f}: ${String(e?.message ?? e).split('\n')[0]}`); }
  }
  cli(process.argv.slice(2));
}
