#!/usr/bin/env node
// The combat round's frame check (owner 2026-10-13: "show more tanks and show the actual tank combat"): for each take,
// sampled every 100 ms through the Studio's own rail and tracks, which tanks the lens holds (a hull's box centre inside
// 95 % of a 16:9 frame), how large each reads, how near the lens comes to any hull (its contact box and gun), and
// whether a building or a crown stands between the lens and the hero's target, beside lens-check's own report on the
// hero (blocked, lens inside a record). A take passes when
//   - the hero and its target (foe0) share the frame for at least 75 % of it,
//   - every knockout shows its shooter and its victim both, at the shot and at the kill,
//   - the take holds its tanks: on average at least 2 in a 1v2 (of 3) and 3 in a 2v2 (of 4),
//   - neither the hero nor its target is a speck (each at least 5 % of the frame's height on average),
//   - the lens keeps 1.5 m off every hull and gun, and
//   - the target is in clear sight for at least 90 % of the take, the hero blocked for at most 5 % and the lens never
//     inside a record.
//   MEDIA_R5_LIGHT=1 node tools/media-r5/combat-check.mjs <scenesDir> [ids,...]   (COMBAT_TRACE=1 prints the samples)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sampleActorTrack, sampleCameraRail } from '../../src/game/studioTimeline.ts';
import { ROADSIDE_SHRINE, absoluteShots, lensReport } from './lens-check.mjs';
import { hullOf, routeProblems } from './route-check.mjs';
import { CRUSH_MIN_MPS, insideRecord, sightBlockers, worldModel } from './world-model.mjs';
import { fxBodies, fxCoverAt, fxItems } from './fx-cover.mjs';
import { SHOTS as SHOTS_DIR } from './paths.mjs';

// fxCover / fxCoverMs / burstCap (owner 2026-10-14: "make sure tanks are still visible and its not just a ton of
// explosions"; the coordinator: a nearer burst may cover a small share of a tank, beyond a flash of 0.2 s at most, and
// the bursts burning at once are capped)
const PASS = { together: 0.75, held: { 2: 2, 3: 2, 4: 3 }, heightShare: 0.05, clearM: 1.5, targetSight: 0.9, wireTop: Number(process.env.WIRE_TOP ?? 0.35),
  fxCover: Number(process.env.FX_COVER ?? 0.25), fxCoverMs: 200, burstCap: Number(process.env.BURST_CAP ?? 3) };
const LOW_COVER_M = 1.2;

/** One take: per `stepMs`, each tank's box projected through the lens, its share of the frame and the lens's clearance. */
export function combatFrames(scene, model, { stepMs = 100, aspect = 16 / 9 } = {}) {
  const shots = absoluteShots(scene, model), dur = scene.storyboard?.durationMs ?? 0, cam = {}, pose = {}, rows = [];
  const tanks = scene.actors.map((a) => ({ a, keys: scene.storyboard?.actorTracks?.find((t) => t.actor === a.name)?.keys ?? null, dims: hullOf(a.id) }));
  const blockers = [], fx = fxItems(scene), groundAt = (x, z) => (model ? model.heightAt(x, z) : 0);
  for (let t = 0; t <= dur; t += stepMs) {
    if (!sampleCameraRail(shots, t, cam)) continue;
    const f = [cam.lookX - cam.x, cam.lookY - cam.y, cam.lookZ - cam.z], fl = Math.hypot(...f) || 1, fw = f.map((v) => v / fl);
    const rl = Math.hypot(fw[2], fw[0]) || 1, right = [-fw[2] / rl, 0, fw[0] / rl];
    const up = [right[1] * fw[2] - right[2] * fw[1], right[2] * fw[0] - right[0] * fw[2], right[0] * fw[1] - right[1] * fw[0]];
    const ty = Math.tan((cam.fov ?? 40) * Math.PI / 360), tx = ty * aspect;
    const proj = (p) => {
      const d = [p[0] - cam.x, p[1] - cam.y, p[2] - cam.z], depth = d[0] * fw[0] + d[1] * fw[1] + d[2] * fw[2];
      if (depth <= 0.5) return null;
      return [(d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / depth / tx, (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / depth / ty];
    };
    const row = { tMs: t, cam: [cam.x, cam.y, cam.z, cam.lookX, cam.lookY, cam.lookZ, cam.fov ?? 40], tanks: {} };
    for (const { a, keys, dims: [hl, hw, reach = hl + 2.4, h = 2.4] } of tanks) {
      let x = a.pos[0], z = a.pos[1], yaw = (a.facingDeg ?? 0) * Math.PI / 180;
      if (keys?.length && sampleActorTrack(keys, t, pose)) { x = pose.x; z = pose.z; yaw = (pose.facingDeg ?? 0) * Math.PI / 180; }
      const gy = model ? (model.supportAt ?? model.heightAt)(x, z) : 0, sx = Math.sin(yaw), cz = Math.cos(yaw);
      const corners = [];
      for (const along of [-hl, hl]) for (const side of [-hw, hw]) for (const y of [gy, gy + h]) corners.push([x + sx * along + cz * side, y, z + cz * along - sx * side]);
      const pts = corners.map(proj).filter(Boolean);
      const box = pts.length ? [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))] : null;
      const centre = box ? [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2] : null;
      const inFrame = !!centre && Math.abs(centre[0]) < 0.95 && Math.abs(centre[1]) < 0.95 && pts.length === corners.length;
      const share = box ? (Math.min(1, box[3]) - Math.max(-1, box[1])) / 2 : 0;
      // area: the hull's box clipped to the frame, as a share of the frame
      const area = box ? Math.max(0, Math.min(1, box[2]) - Math.max(-1, box[0])) * Math.max(0, Math.min(1, box[3]) - Math.max(-1, box[1])) / 4 : 0;
      // the lens off the hull's contact box, the gun's reach ahead of it: in the hull's frame [across, along]
      const dx = cam.x - x, dz = cam.z - z, across = dx * cz - dz * sx, ahead = dx * sx + dz * cz;
      const u = Math.abs(across) - hw, v = ahead > 0 ? ahead - Math.max(hl, reach) : -ahead - hl;
      const clear = cam.y > gy + h + 1 ? Infinity : (u > 0 || v > 0 ? Math.hypot(Math.max(u, 0), Math.max(v, 0)) : Math.max(u, v));
      // a building or crown between the lens and the hull's centre
      const sight = model ? !sightBlockers(model, [cam.x, cam.y, cam.z], [x, gy + 1.4, z], { ignore: (r) => r.crushable && r.max[1] - r.min[1] < LOW_COVER_M, out: blockers }).length : true;
      const by = sight ? null : `${blockers[0].kind ?? 'record'}${blockers[0].canopyR ? ' crown' : ''} at ${Math.round((blockers[0].min[0] + blockers[0].max[0]) / 2)},${Math.round((blockers[0].min[2] + blockers[0].max[2]) / 2)} up to ${blockers[0].max[1].toFixed(1)}`;
      // front: the cosine between the hull's nose and the lens (1 head-on, 0 broadside, −1 from behind)
      const front = (dx * sx + dz * cz) / (Math.hypot(dx, dz) || 1);
      const seen = box ? [Math.max(-1, box[0]), Math.max(-1, box[1]), Math.min(1, box[2]), Math.min(1, box[3])] : null;
      const viewDepth = (x - cam.x) * fw[0] + (gy + h / 2 - cam.y) * fw[1] + (z - cam.z) * fw[2];
      row.tanks[a.name] = { inFrame, share: Math.max(0, share), area, clear, sight, by, front, centre, at: [x, z], yawDeg: yaw * 180 / Math.PI,
        seen, depthM: Math.hypot(x - cam.x, z - cam.z), viewDepth };
    }
    // the effects over the tanks (fx-cover.mjs): each tank's share a nearer burst, smoke or fire covers, the frame's share
    // the effects fill, and the bursts burning at once
    const proj3 = (p) => {
      const d = [p[0] - cam.x, p[1] - cam.y, p[2] - cam.z], depth = d[0] * fw[0] + d[1] * fw[1] + d[2] * fw[2];
      return depth <= 0.5 ? null : [(d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / depth / tx, (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / depth / ty, depth];
    };
    const boxes = Object.entries(row.tanks).map(([name, q]) => ({ name, box: q.inFrame && q.seen && q.seen[2] > q.seen[0] && q.seen[3] > q.seen[1] ? q.seen : null, depth: q.viewDepth }));
    row.fx = fxCoverAt(fxBodies(fx, t, groundAt), boxes, { proj: proj3, tx, ty });
    // the hero hidden by a nearer tank: the largest share of its visible box another hull's box covers
    const h = row.tanks.hero;
    row.heroBehind = 0;
    if (h?.seen && h.seen[2] > h.seen[0] && h.seen[3] > h.seen[1]) {
      const heroArea = (h.seen[2] - h.seen[0]) * (h.seen[3] - h.seen[1]);
      for (const [name, o] of Object.entries(row.tanks)) {
        if (name === 'hero' || !o.seen || o.depthM >= h.depthM) continue;
        const ow = Math.min(o.seen[2], h.seen[2]) - Math.max(o.seen[0], h.seen[0]), oh = Math.min(o.seen[3], h.seen[3]) - Math.max(o.seen[1], h.seen[1]);
        if (ow > 0 && oh > 0) row.heroBehind = Math.max(row.heroBehind, (ow * oh) / heroArea);
      }
    }
    rows.push(row);
  }
  return rows;
}

/** The knockouts: [{ killer, victim, shotMs, killMs }] (the killer: the last other tank to fire before the kill). */
export function knockouts(scene) {
  return scene.effects.filter((e) => e.type === 'tank_kill').map((k) => {
    const shot = scene.effects.filter((e) => e.type === 'fire' && e.tMs <= k.tMs && e.actor !== k.actor).at(-1);
    return { killer: shot?.actor ?? null, victim: k.actor, shotMs: shot?.tMs ?? k.tMs, killMs: k.tMs };
  });
}

/**
 * Where the fight stands (the lab places a combat take as built, autoPlace off): every hull clear of the records with
 * 0.4 m to spare where it starts (and of the solid ones wherever it drives), on ground under 0.25 slope and dry; and
 * every round's line from the shooter's gun to where it lands clear of solid records (a wall, a house; crowns and the
 * props a round would shred are let through). With the battlefield's features, every track also keeps route-check's
 * rules (3 m off the buildings, out of the woods and the water, off the map's edge, hulls 7 m apart): the previz had a
 * CV90 drive into a wood's crowns, which the records do not hold. Returns the faults.
 */
export function fightFaults(scene, model, rows = combatFrames(scene, model), features = null) {
  const faults = new Set(), contacts = [], blockers = [];
  if (features) for (const p of routeProblems(scene, features)) faults.add(`${p.actor} ${p.what} at ${p.tMs}`);
  const pose = (name, tMs) => {
    const r = rows.reduce((best, x) => (Math.abs(x.tMs - tMs) < Math.abs(best.tMs - tMs) ? x : best), rows[0]);
    return r?.tanks[name];
  };
  for (const a of scene.actors) {
    const [hl, hw] = hullOf(a.id);
    let prev = null;
    for (const r of rows.filter((x) => x.tMs % 500 === 0)) {
      const q = r.tanks[a.name], start = r.tMs === 0, pad = start ? 0.4 : 0;
      // a hull at speed crushes the props it overruns, as a battle hull does; slower, it would stand in them
      const speed = prev ? Math.hypot(q.at[0] - prev[0], q.at[1] - prev[1]) / 0.5 : 0;
      prev = q.at;
      for (const rec of model.hullContacts(q.at[0], q.at[1], q.yawDeg * Math.PI / 180, hl + pad, hw + pad, contacts)) {
        if (start || !rec.crushable || speed <= (rec.crushMin ?? CRUSH_MIN_MPS)) faults.add(`${a.name} on a ${rec.kind ?? 'record'}${start ? '' : ` at ${r.tMs}`}`);
      }
      if (start && model.slopeAt(q.at[0], q.at[1]) > 0.25) faults.add(`${a.name} on a ${model.slopeAt(q.at[0], q.at[1]).toFixed(2)} slope`);
      if (start && !a.allowWater && model.wetAt(q.at[0], q.at[1]) > 0.3) faults.add(`${a.name} in water`);
    }
  }
  for (const fx of scene.effects) {
    if (fx.type !== 'barrage' || !Array.isArray(fx.at)) continue;
    const [x, z] = fx.at.length >= 3 ? [fx.at[0], fx.at[2]] : fx.at, inside = insideRecord(model, [x, model.heightAt(x, z) + 1, z], 2);
    if (inside && !inside.crushable) faults.add(`the barrage at ${fx.tMs} centred in a ${inside.kind ?? 'record'}`);
  }
  for (const [i, fx] of scene.effects.entries()) {
    if (fx.type !== 'fire' || !fx.actor) continue;
    // where the round lands: the next impact or burst within 120 ms, else its target's hull
    const hit = scene.effects.slice(i + 1).find((e) => e.tMs - fx.tMs <= 120 && (e.type === 'impact' || e.type === 'explosion') && Array.isArray(e.at));
    const shooter = scene.actors.find((a) => a.name === fx.actor), q = pose(fx.actor, fx.tMs);
    if (!hit || !shooter || !q) continue;
    const [hl, , reach = hl + 2.4, h = 2.4] = hullOf(shooter.id), gy = (model.supportAt ?? model.heightAt)(q.at[0], q.at[1]);
    const end = hit.at.length >= 3 ? hit.at : [hit.at[0], (model.supportAt ?? model.heightAt)(hit.at[0], hit.at[1]) + 0.5, hit.at[1]];
    const dir = [end[0] - q.at[0], end[2] - q.at[1]], dl = Math.hypot(...dir) || 1;
    const muzzle = [q.at[0] + dir[0] / dl * reach, gy + h * 0.8, q.at[1] + dir[1] / dl * reach];
    const solid = sightBlockers(model, muzzle, end, { skipNearB: 3, ignore: (r) => r.crushable || !!r.canopyR, out: blockers });
    if (solid.length) faults.add(`${fx.actor}'s round at ${fx.tMs} through a ${solid[0].kind ?? 'record'}`);
  }
  return [...faults];
}

/** The verdict on one take: { ok, line, faults, rows }. */
export function combatVerdict(scene, model, features = null) {
  const rows = combatFrames(scene, model), n = rows.length || 1, count = scene.actors.length;
  const at = (tMs) => rows.reduce((best, r) => (Math.abs(r.tMs - tMs) < Math.abs(best.tMs - tMs) ? r : best), rows[0]);
  const both = (r, a, b) => !!r && !!r.tanks[a]?.inFrame && !!r.tanks[b]?.inFrame;
  const together = rows.filter((r) => both(r, 'hero', 'foe0')).length / n;
  const held = rows.reduce((s, r) => s + Object.values(r.tanks).filter((x) => x.inFrame).length, 0) / n;
  const mean = (name) => rows.reduce((s, r) => s + (r.tanks[name]?.share ?? 0), 0) / n;
  const nearest = Math.min(...rows.flatMap((r) => Object.values(r.tanks).map((x) => x.clear)));
  const targetSight = rows.filter((r) => r.tanks.foe0?.sight).length / n;
  const kos = knockouts(scene).map((k) => ({ ...k, shown: both(at(k.shotMs), k.killer, k.victim) && both(at(k.killMs), k.killer, k.victim) }));
  const lens = model ? lensReport(scene, model) : null, heroBlocked = lens ? lens.blocked : 0;
  const placement = model ? fightFaults(scene, model, rows, features) : [];
  const faults = [];
  if (together < PASS.together) faults.push(`hero and foe0 together ${Math.round(together * 100)} %`);
  for (const k of kos) if (!k.shown) faults.push(`${k.killer} on ${k.victim} at ${k.killMs} not both in frame`);
  if (held < (PASS.held[count] ?? 2) - 1e-9) faults.push(`holds ${held.toFixed(2)} of ${count}`);
  for (const name of ['hero', 'foe0']) if (mean(name) < PASS.heightShare) faults.push(`${name} ${(mean(name) * 100).toFixed(1)} % of the height`);
  if (nearest < PASS.clearM) faults.push(`lens ${nearest.toFixed(1)} m off a hull`);
  if (targetSight < PASS.targetSight) faults.push(`foe0 in sight ${Math.round(targetSight * 100)} %`);
  if (heroBlocked > 0.05) faults.push(`hero blocked ${Math.round(heroBlocked * 100)} %`);
  if (lens?.inside) faults.push(`lens inside a record ${lens.inside} samples`);
  // a standing thing in front of the hero hiding a quarter of its visible box for 0.3 s or more, or a roadside shrine
  // hiding a twentieth of it or filling a tenth of the frame in front of it (lens-check's cover and shrine; the wayside
  // cross in front of s225's Leopard, 2026-10-13, filled a quarter of the frame and then crossed the hull)
  const runOf = (hit) => {
    let run = 0, worst = 0, kind = null, until = null;
    for (const p of lens?.perSample ?? []) {
      const k = hit(p.fore ?? {});
      run = k ? run + 1 : 0;
      if (run > worst) { worst = run; kind = k; until = p.tMs; }
    }
    return worst >= 3 ? `a ${kind} covers the hero for ${worst * 100} ms (to ${until})` : null;
  };
  const shrineIn = (f) => (f.shrine ?? 0) >= 0.05 ? f.shrineKind : ROADSIDE_SHRINE.test(f.kind ?? '') && (f.share ?? 0) >= 0.1 ? f.kind : null;
  for (const f of [runOf((f) => ((f.cover ?? 0) >= 0.25 ? f.coverKind : null)), runOf(shrineIn)]) if (f) faults.push(f);
  // the overhead wires (2026-10-14, the coordinator on the 224 review: wires and cables are occluders; s225 and s226
  // ended under a telephone line): one passing across the hero, or one conductor reading across WIRE_TOP of the frame's
  // upper half, for 0.3 s or more (lens-check's wire and wireHero)
  const wireRun = (hit, what) => {
    let run = 0, worst = 0, kind = null, until = null;
    for (const p of lens?.perSample ?? []) {
      const k = hit(p);
      run = k ? run + 1 : 0;
      if (run > worst) { worst = run; kind = k; until = p.tMs; }
    }
    return worst >= 3 ? `a ${kind} ${what} for ${worst * 100} ms (to ${until})` : null;
  };
  for (const f of [wireRun((p) => p.wireHero, 'crosses the hero'), wireRun((p) => ((p.wire ?? 0) >= PASS.wireTop ? p.wireKind : null), `crosses ${Math.round(PASS.wireTop * 100)} % of the frame's top`)]) if (f) faults.push(f);
  const wireMost = Math.max(0, ...(lens?.perSample ?? []).map((p) => p.wire ?? 0));
  // the tanks behind the fire (fx-cover.mjs; owner 2026-10-14): each tank's longest run under nearer effects covering
  // PASS.fxCover of its box, past a flash of PASS.fxCoverMs; and the bursts burning at once, PASS.burstCap at most
  // (a tank past its own knockout is a wreck: the smoke over it no longer hides the fight)
  const fxRun = {}, deadAt = new Map(scene.effects.filter((e) => e.type === 'tank_kill' && e.actor).map((e) => [e.actor, e.tMs]));
  for (const name of scene.actors.map((a) => a.name)) {
    let run = 0, worst = 0, until = null, kind = null;
    for (const r of rows.filter((x) => x.tMs <= (deadAt.get(name) ?? Infinity))) {
      const c = r.fx?.cover?.[name];
      run = c && c.share >= PASS.fxCover ? run + 1 : 0;
      if (run > worst) { worst = run; until = r.tMs; kind = c.by; }
    }
    fxRun[name] = { ms: worst * 100, until, kind };
    if (worst * 100 > PASS.fxCoverMs) faults.push(`a nearer ${kind} covers ${name} for ${worst * 100} ms (to ${until})`);
  }
  const burstsMost = Math.max(0, ...rows.map((r) => r.fx?.bursts ?? 0));
  if (burstsMost > PASS.burstCap) faults.push(`${burstsMost} bursts at once (at ${rows.find((r) => (r.fx?.bursts ?? 0) === burstsMost).tMs})`);
  const fxFrame = rows.reduce((s, r) => s + (r.fx?.frame ?? 0), 0) / n, fxFrameMost = Math.max(0, ...rows.map((r) => r.fx?.frame ?? 0));
  faults.push(...placement);
  // the hero half behind a nearer tank at its knockout shot or for a second of the take (2026-10-13: s228's file put
  // the T-72B3 across the AbramsX on the telephoto)
  const heroKoShot = kos.find((k) => k.killer === 'hero');
  if (heroKoShot && at(heroKoShot.killMs).heroBehind >= 0.35) faults.push(`a nearer tank hides ${Math.round(at(heroKoShot.killMs).heroBehind * 100)} % of the hero at its knockout`);
  let behindRun = 0, behindWorst = 0;
  for (const r of rows) { behindRun = r.heroBehind >= 0.5 ? behindRun + 1 : 0; behindWorst = Math.max(behindWorst, behindRun); }
  if (behindWorst >= 10) faults.push(`a nearer tank hides half the hero for ${behindWorst * 100} ms`);
  // the telephoto over a near foe's shoulder (coordinator 2026-10-13, s228): at the hero's knockout the shooter holds at
  // least 10 % of the frame and the nearest foe at most 30 %
  const heroKo = kos.find((k) => k.killer === 'hero');
  let tele = '';
  if (scene.meta?.combat?.lens === 'reverseTele' && heroKo) {
    const r = at(heroKo.killMs), foes = Object.entries(r.tanks).filter(([name]) => name.startsWith('foe'));
    const near = foes.reduce((best, [, t]) => Math.max(best, t.area), 0), hero = r.tanks.hero?.area ?? 0;
    tele = `, at the knockout the hero holds ${Math.round(hero * 100)} % of the frame and the near foe ${Math.round(near * 100)} %`;
    if (hero < 0.1) faults.push(`the hero holds ${Math.round(hero * 100)} % of the frame at the knockout (10 % at least)`);
    if (near > 0.3) faults.push(`the near foe fills ${Math.round(near * 100)} % of the frame at the knockout (30 % at most)`);
  }
  const line = `together ${Math.round(together * 100)} %, holds ${held.toFixed(2)}/${count}, knockouts ${kos.map((k) => `${k.killer}>${k.victim}@${k.killMs} ${k.shown ? 'shown' : 'MISSED'}`).join(' ')}, `
    + `hero ${(mean('hero') * 100).toFixed(1)} % / foe0 ${(mean('foe0') * 100).toFixed(1)} % of the height, nearest hull ${nearest.toFixed(1)} m, `
    + `foe0 in sight ${Math.round(targetSight * 100)} %, hero blocked ${Math.round(heroBlocked * 100)} %${tele}`
    + (wireMost > 0 ? `, wires up to ${Math.round(wireMost * 100)} % across the top` : '')
    + `, effects fill ${Math.round(fxFrame * 100)} % of the frame (${Math.round(fxFrameMost * 100)} % at most), ${burstsMost} bursts at once at most`;
  const heroFront = rows.reduce((sum, r) => sum + (r.tanks.hero?.front ?? 0), 0) / n;
  return { ok: !faults.length, line, faults, rows, metrics: { together, held, count, hero: mean('hero'), foe0: mean('foe0'), nearest, targetSight, heroBlocked, heroFront,
    fxFrame, fxFrameMost, burstsMost, fxRun } };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [dir, onlyArg] = process.argv.slice(2);
  const only = onlyArg?.split(',') ?? null;
  const worlds = new Map();
  const worldOf = (map) => {
    if (!worlds.has(map)) {
      const f = join(process.env.MEDIA_R5_FEATURES ?? join(SHOTS_DIR, 'features'), `features-${map}.json`);
      const features = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
      worlds.set(map, { features, model: features ? worldModel(features) : null });
    }
    return worlds.get(map);
  };
  const files = readdirSync(dir).filter((f) => /^s\d{2,3}-.*\.json$/.test(f) && (!only || only.some((o) => f.includes(o)))).sort();
  let failed = 0;
  for (const f of files) {
    const scene = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const { model, features } = worldOf(scene.map);
    // (a check without its battlefield cannot pass: the frames and the lens need the dump's ground and records)
    if (!model) { failed++; console.log(`FAIL ${scene.meta?.id ?? f}: no features dump for ${scene.map}`); continue; }
    const { ok, line, faults, rows } = combatVerdict(scene, model, features);
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${scene.meta?.id ?? f}: ${line}${faults.length ? `\n    faults: ${faults.join('; ')}` : ''}`);
    // COMBAT_FX=1: the effects over the tanks every 200 ms (fx-cover.mjs)
    if (process.env.COMBAT_FX) for (const r of rows.filter((x) => x.tMs % 200 === 0)) {
      const cov = Object.entries(r.fx?.cover ?? {}).filter(([, c]) => c.share > 0).map(([k, c]) => `${k} ${Math.round(c.share * 100)}% (${c.by})`);
      console.log(`  t${r.tMs} bursts ${r.fx?.bursts ?? 0}, effects ${Math.round((r.fx?.frame ?? 0) * 100)} % of the frame${cov.length ? ` | covered: ${cov.join(', ')}` : ''}`);
    }
    if (process.env.COMBAT_TRACE) for (const r of rows.filter((x) => x.tMs % 600 === 0)) {
      console.log(`  t${r.tMs} cam ${r.cam.slice(0, 3).map((v) => v.toFixed(1))} look ${r.cam.slice(3, 6).map((v) => v.toFixed(1))} fov ${r.cam[6].toFixed(0)} | `
        + Object.entries(r.tanks).map(([k, v]) => `${k} ${v.inFrame ? 'in' : 'OUT'} ${v.centre ? v.centre.map((c) => c.toFixed(2)) : '-'} ${(v.share * 100).toFixed(0)}%${v.sight ? '' : ` hidden by ${v.by}`}`).join(' | '));
    }
  }
  console.log(`== combat-check: ${files.length - failed} of ${files.length} pass`);
  process.exitCode = failed ? 1 : 0;
}
