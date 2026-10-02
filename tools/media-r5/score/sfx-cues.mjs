#!/usr/bin/env node
// Derive the trailer's diegetic SFX cue list from the edit (edl.json) and each cut's Studio scene:
// every effect inside a cut's source window becomes a game-SFX event at its global time, attenuated
// by camera distance.  node sfx-cues.mjs <edl.json> <sceneDir> <cues-in.json> <cues-out.json>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
const [edlFile, sceneDir, cuesIn, cuesOut] = process.argv.slice(2);
const edl = JSON.parse(readFileSync(edlFile, 'utf8')), cues = JSON.parse(readFileSync(cuesIn, 'utf8'));
const lerp = (a, b, t) => a + (b - a) * t;
const camAt = (sb, tMs) => {
  const s = sb.shots; if (!s?.length) return null;
  if (tMs <= s[0].tMs) return s[0].pos;
  for (let i = 1; i < s.length; i++) if (tMs <= s[i].tMs) { const u = (tMs - s[i - 1].tMs) / Math.max(1, s[i].tMs - s[i - 1].tMs); return s[i - 1].pos.map((v, k) => lerp(v, s[i].pos[k], u)); }
  return s.at(-1).pos;
};
const actorAt = (scene, name, tMs) => {
  const k = scene.storyboard?.actorTracks?.find(t => t.actor === name)?.keys;
  if (k?.length >= 2) {
    if (tMs <= k[0].tMs) return k[0].pos;
    for (let i = 1; i < k.length; i++) if (tMs <= k[i].tMs) { const u = (tMs - k[i - 1].tMs) / Math.max(1, k[i].tMs - k[i - 1].tMs); return [lerp(k[i - 1].pos[0], k[i].pos[0], u), lerp(k[i - 1].pos[1], k[i].pos[1], u)]; }
    return k.at(-1).pos;
  }
  return scene.actors.find(a => a.name === name)?.pos ?? null;
};
const TURBINE = /^(m1a|ua_m1|t80u|leclerc)/;
const sfx = [];
for (const cut of edl.shots) {
  const id = basename(cut.src, '.mp4').replace(/-p$/, ''); // portrait clips share the landscape scene's timing
  const cands = sceneDir.split(',').flatMap(d => [join(d, `${id}.resolved.json`), join(d, `${id}.json`)]); // first dir wins (re-renders first)
  const f = cands.find(existsSync) ?? cands[0];
  if (!existsSync(f)) continue;
  const scene = JSON.parse(readFileSync(f, 'utf8'));
  const rate = cut.rate ?? 1, inMs = (cut.in ?? 0) * 1000, outMs = inMs + cut.dur * 1000 * rate;
  // engines: a moving hero gets a running-gear bed, or a Doppler pass-by when a held camera sees it go past
  const hk = scene.storyboard?.actorTracks?.find(t => t.actor === 'hero')?.keys;
  if (hk?.length >= 2) {
    const p0 = actorAt(scene, 'hero', inMs), p1 = actorAt(scene, 'hero', outMs), moved = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const speed = moved / Math.max(0.1, (outMs - inMs) / 1000);
    if (speed > 1) {
      const sh = scene.storyboard.shots, held = Math.hypot(sh[0].pos[0] - sh.at(-1).pos[0], sh[0].pos[2] - sh.at(-1).pos[2]) < 0.5;
      let best = { d: Infinity, t: inMs };
      for (let tm = inMs; tm <= outMs; tm += 20) { const c = camAt(scene.storyboard, tm), h = actorAt(scene, 'hero', tm), d = Math.hypot(c[0] - h[0], c[2] - h[1]); if (d < best.d) best = { d, t: tm }; }
      const heroId = scene.actors.find(a => a.name === 'hero')?.id ?? '';
      const ev = { kind: 'drive', t: +cut.start.toFixed(3), dur: +cut.dur.toFixed(3), speed: +speed.toFixed(1), turbine: TURBINE.test(heroId) };
      if (held && best.d < 18) {
        // screen direction of travel: hero velocity against the camera's right vector (-fz, fx)
        const c = camAt(scene.storyboard, best.t), sh0 = scene.storyboard.shots[0], fx = sh0.lookAt[0] - c[0], fz = sh0.lookAt[2] - c[2];
        const a = actorAt(scene, 'hero', best.t - 50), b2 = actorAt(scene, 'hero', best.t + 50), dir = Math.sign(-(b2[0] - a[0]) * fz + (b2[1] - a[1]) * fx) || 1;
        Object.assign(ev, { passAt: +((best.t - inMs) / 1000 / rate).toFixed(3), d0: +best.d.toFixed(1), gain: 0.9, dir });
      }
      else Object.assign(ev, { gain: +Math.max(0.12, Math.min(0.55, 6 / Math.max(6, best.d))).toFixed(2) });
      sfx.push(ev);
    }
  }
  for (const e of scene.effects ?? []) {
    if (e.tMs < inMs || e.tMs >= outMs) continue;
    const t = +(cut.start + (e.tMs - inMs) / 1000 / rate).toFixed(3);
    const cam = camAt(scene.storyboard ?? {}, e.tMs), pos = e.at ?? (e.actor ? actorAt(scene, e.actor, e.tMs) : null);
    const d = cam && pos ? Math.hypot(cam[0] - pos[0], cam[2] - pos[1]) : 40;
    const near = Math.max(0, Math.min(1, 1 - (d - 8) / 220)); // 1 at 8 m, 0 at 228 m
    const gain = +(0.35 + 0.65 * near).toFixed(2), dist = +(1 - near).toFixed(2), pan = 0;
    if (e.type === 'fire') sfx.push({ kind: 'cannon', t, cls: d < 60 ? 'huge' : 'large', gain, dist, pan });
    else if (e.type === 'tank_kill') sfx.push({ kind: 'kill', t, gain: Math.min(1, gain + 0.15), pop: e.params?.pop !== false });
    else if (e.type === 'impact' && e.params?.kind === 'pen') sfx.push({ kind: 'pen', t, gain: gain * 0.8 });
    else if (e.type === 'impact' && e.params?.kind === 'ricochet') sfx.push({ kind: 'ricochet', t, gain: gain * 0.7, alt: sfx.length });
    else if (e.type === 'sparks') sfx.push({ kind: 'ricochet', t, gain: gain * 0.6, alt: sfx.length });
    else if (e.type === 'explosion') sfx.push({ kind: 'he', t, gain, alt: sfx.length % 2 });
    else if (e.type === 'barrage') for (let k = 0; k < (e.params?.count ?? 5); k++) sfx.push({ kind: 'he', t: +(t + k * 0.22).toFixed(3), gain: gain * 0.8, alt: k % 2 });
    else if (e.type === 'mg_burst') for (let k = 0; k < Math.min(9, e.params?.count ?? 7); k++) sfx.push({ kind: 'sample', name: 'fire_small_crack', t: +(t + k * 0.075).toFixed(3), gain: gain * 0.35, send: 0.1 });
  }
}
sfx.sort((a, b) => a.t - b.t);
// thin dense clusters: keep the loudest event within 60 ms of the same kind
const thinned = sfx.filter((e, i) => !sfx.some((o, j) => j !== i && o.kind === e.kind && Math.abs(o.t - e.t) < 0.06 && (o.gain > e.gain || (o.gain === e.gain && j < i))));
writeFileSync(cuesOut, JSON.stringify({ ...cues, sfx: thinned }, null, 1));
console.log(`${thinned.length} sfx cues (${sfx.length - thinned.length} thinned) -> ${cuesOut}`);
