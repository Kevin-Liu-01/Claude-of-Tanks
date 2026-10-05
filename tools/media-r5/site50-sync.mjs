#!/usr/bin/env node
// Brings lab-resolved site shots up to the plan (site50.mjs) without a GPU pass — paint and turrets never move a tank:
//   - paint: each actor's camo and camoSeed from the planned scene, by name;
//   - turrets: the choreography (turret-choreo.mjs) planned again on the resolved geometry (the resolve may nudge a tank
//     a few metres, and a knockout round must stay laid on its target), every allied track rebuilt on a grid at
//     the resolved positions (within the Studio's 64-key cap; a track already cut at the cap runs on along its last
//     leg); the flank and lens shots' rounds go out on their resolved bearings;
//   - effect parameters from the planned twin of each resolved effect (a shell hit's blast cause, 2026-10-03);
//   - meta.paint and meta.turrets refreshed.
//   node tools/media-r5/site50-sync.mjs <resolvedDir> [<resolvedDir> ...]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOOP_MS, SHOTS, XFADE_MS, siteScene, turretStyle } from './site50.mjs';
import { choreograph, poseAt } from './turret-choreo.mjs';
import { STUDIO_MAX_ACTOR_KEYS } from './setups.mjs';

const byNumber = new Map(SHOTS.map(shot => [shot[0], shot]));
const sameFx = (a, b) => a.type === b.type && a.tMs === b.tMs && JSON.stringify(a.at) === JSON.stringify(b.at);
for (const dir of process.argv.slice(2)) {
  let synced = 0;
  for (const f of readdirSync(dir).filter(f => /^s\d\d-.*\.resolved\.json$/.test(f)).sort()) {
    const n = Number(f.slice(1, 3)), shot = byNumber.get(n);
    if (!shot) continue;
    const plan = siteScene(shot), file = join(dir, f), scene = JSON.parse(readFileSync(file, 'utf8'));
    const planned = new Map(plan.actors.map(a => [a.name, a]));
    for (const a of scene.actors) {
      const p = planned.get(a.name);
      if (!p || p.id !== a.id) throw new Error(`${f}: ${a.name} (${a.id}) is not in the plan — resolve this shot again`);
      a.camo = p.camo; a.camoSeed = p.camoSeed;
    }
    if (scene.actors.length !== plan.actors.length) throw new Error(`${f}: ${scene.actors.length} actors resolved, ${plan.actors.length} planned`);
    // effect parameters follow the plan (they never move a thing; positions stay as the lab placed them): each resolved
    // effect takes the params of its planned twin — same type, time and actor, the nearest when several match
    for (const e of scene.effects.filter(x => !x.choreo)) {
      const twins = plan.effects.filter(p => !p.choreo && p.type === e.type && p.tMs === e.tMs && (p.actor ?? null) === (e.actor ?? null));
      const d = p => (Array.isArray(p.at) && Array.isArray(e.at) ? Math.hypot(p.at[0] - e.at[0], p.at[1] - e.at[1]) : 0);
      const twin = twins.sort((a, b) => d(a) - d(b))[0];
      if (twin) e.params = { ...e.params, ...twin.params };
    }
    // turrets, planned again on the resolved geometry (flank rounds from an earlier sync come out first)
    const planFx = plan.effects.filter(e => e.choreo);
    scene.effects = scene.effects.filter(e => !e.choreo && !planFx.some(p => sameFx(p, e)));
    const style = turretStyle(n);
    const choreo = choreograph(scene, { loopMs: LOOP_MS, xfadeMs: XFADE_MS, style });
    const dur = scene.storyboard.durationMs, tracks = scene.storyboard.actorTracks ?? (scene.storyboard.actorTracks = []);
    // a track the Studio cut at its 64-key cap (a 100 ms grid ends at 6.3 s) runs on along its last leg — the shot
    // paths are straight at constant speed
    for (const tr of tracks) {
      const k = tr.keys, last = k[k.length - 1], prev = k[k.length - 2];
      if (!prev || last.tMs >= dur) continue;
      const r = (dur - last.tMs) / (last.tMs - prev.tMs);
      k.push({ ...last, id: `${tr.actor}-end`, tMs: dur, pos: [last.pos[0] + (last.pos[0] - prev.pos[0]) * r, last.pos[1] + (last.pos[1] - prev.pos[1]) * r], facingDeg: last.facingDeg + (last.facingDeg - prev.facingDeg) * r });
    }
    const step = Math.ceil(dur / (STUDIO_MAX_ACTOR_KEYS - 4) / 10) * 10;
    // any other track over the cap (an enemy's, cut and run on above) is resampled on the same grid
    for (const tr of tracks) {
      if (tr.keys.length <= STUDIO_MAX_ACTOR_KEYS || choreo.turrets[tr.actor]) continue;
      const k = tr.keys, lerp = (a, b, u) => a + (b - a) * u, out = [];
      for (let t = 0; ; t = Math.min(dur, t + step)) {
        let i = 0; while (i < k.length - 2 && k[i + 1].tMs <= t) i++;
        const a = k[i], b = k[i + 1] ?? a, u = Math.min(1, Math.max(0, (t - a.tMs) / Math.max(1, b.tMs - a.tMs)));
        out.push({ ...a, id: `${tr.actor}-${out.length}`, tMs: t, pos: [lerp(a.pos[0], b.pos[0], u), lerp(a.pos[1], b.pos[1], u)], facingDeg: lerp(a.facingDeg, b.facingDeg, u),
          turretDeg: lerp(a.turretDeg, b.turretDeg, u), gunDeg: lerp(a.gunDeg, b.gunDeg, u) });
        if (t === dur) break;
      }
      tr.keys = out;
    }
    for (const [name, keys] of Object.entries(choreo.turrets)) {
      const at = t => { let i = 0; while (i < keys.length - 2 && keys[i + 1][0] <= t) i++; const [t0, a0] = keys[i], [t1, a1] = keys[i + 1] ?? keys[i]; return a0 + (a1 - a0) * Math.min(1, Math.max(0, (t - t0) / Math.max(1, t1 - t0))); };
      const grid = []; for (let t = 0; t < dur; t += step) grid.push(t); grid.push(dur);
      const rebuilt = grid.map((t, i) => { const p = poseAt(scene, name, t); return { id: `${name}-${i}`, tMs: t, pos: p.p, facingDeg: p.h, turretDeg: +at(t).toFixed(2), gunDeg: choreo.guns[name], transition: 'linear' }; });
      const old = tracks.findIndex(tr => tr.actor === name);
      if (old >= 0) tracks[old] = { ...tracks[old], keys: rebuilt }; else tracks.push({ actor: name, keys: rebuilt });
      const a = scene.actors.find(x => x.name === name); a.turretDeg = rebuilt[0].turretDeg; a.gunDeg = choreo.guns[name];
    }
    scene.effects = [...scene.effects, ...choreo.effects.map((e, i) => ({ id: `choreo${i + 1}`, ...e }))].sort((a, b) => a.tMs - b.tMs);
    scene.meta = { ...scene.meta, paint: plan.meta.paint, turrets: { style, plan: choreo.notes } };
    writeFileSync(file, JSON.stringify(scene, null, 1));
    synced++;
  }
  console.log(`${synced} resolved shots synced (paint, turrets) in ${dir}`);
}
