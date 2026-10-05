#!/usr/bin/env node
// Derive a film's diegetic SFX cue list from the edit (edl.json) and each cut's Studio scene: every effect inside a
// cut's source window becomes an event at its global time with its camera distance, resolved the way the game
// resolves its sound (score.mjs plays them from the recorded library): the shooter's gun class and calibre
// (weaponAudio.ts), the hero's engine family and track set (vehicleAudioProfiles.ts), and the map's gun-echo tail
// and ambience bed (environmentScenes.ts), one bed per cut.
//   node sfx-cues.mjs <edl.json> <sceneDir> <cues-in.json> <cues-out.json>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
await import('../../../src/vehicles/fleetRegistration.ts');
const { getSpec } = await import('../../../src/vehicles/specs.ts');
const { resolveVehicleAudioIdentity } = await import('../../../src/audio/vehicleAudioProfiles.ts');
const { resolveWeaponReport } = await import('../../../src/audio/weaponAudio.ts');
const { sceneForMap } = await import('../../../src/audio/environmentScenes.ts');
const specOf = (id) => { try { return getSpec(id); } catch { return null; } };
const unknown = new Set();
function gunOf(id) {
  const spec = specOf(id);
  if (!spec?.gun) { unknown.add(id); return { cls: 'gun_120', caliberMm: 120, rate: 1, gainDb: 0, twin: false }; }
  const r = resolveWeaponReport(spec.gun.caliberMm, spec.gun.soundProfile);
  return { cls: r.cls.id, caliberMm: spec.gun.caliberMm, rate: r.rate, gainDb: r.gainDb, twin: r.twin };
}
// the ground under the tracks, by battlefield (the game reads it from the terrain under each road wheel)
const SURFACE = { desert: 'sand', oasis: 'sand', badlands: 'sand', winter: 'snow', alpine: 'snow', whiteout: 'snow',
  monsoon: 'mud', delta: 'mud', mangrove: 'mud', urban: 'hard', railyard: 'hard', foundry: 'hard' };
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
      const identity = specOf(heroId) ? resolveVehicleAudioIdentity(specOf(heroId)) : null;
      const ev = { kind: 'drive', t: +cut.start.toFixed(3), dur: +cut.dur.toFixed(3), speed: +speed.toFixed(1),
        engine: identity?.engine ?? (TURBINE.test(heroId) ? 'turbine_agt' : 'diesel_v12_modern'), tracks: identity?.tracks ?? 'heavy', surface: SURFACE[scene.map] ?? 'earth' };
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
  const env = sceneForMap(scene.map);
  sfx.push({ kind: 'bed', t: +cut.start.toFixed(3), dur: +cut.dur.toFixed(3), asset: env.bed, db: env.bedDb, ...(env.layer ? { layer: env.layer.asset, layerDb: env.layer.db } : {}) });
  for (const e of scene.effects ?? []) {
    if (e.tMs < inMs || e.tMs >= outMs) continue;
    const t = +(cut.start + (e.tMs - inMs) / 1000 / rate).toFixed(3);
    const cam = camAt(scene.storyboard ?? {}, e.tMs), pos = e.at ?? (e.actor ? actorAt(scene, e.actor, e.tMs) : null);
    const d = cam && pos ? Math.hypot(cam[0] - pos[0], cam[2] - pos[1]) : 40;
    const distM = +d.toFixed(1), pan = 0, shooter = scene.actors.find(a => a.name === (e.actor ?? 'hero'))?.id ?? '';
    const heavy = gunOf(shooter).caliberMm >= 100;
    if (e.type === 'fire') sfx.push({ kind: 'cannon', t, ...gunOf(shooter), distM, tail: env.tail, pan });
    else if (e.type === 'tank_kill') sfx.push({ kind: 'kill', t, distM, pop: e.params?.pop !== false });
    else if (e.type === 'impact' && e.params?.kind === 'pen') sfx.push({ kind: 'pen', t, distM, heavy });
    else if (e.type === 'impact' && e.params?.kind === 'nonpen') sfx.push({ kind: 'nonpen', t, distM });
    else if (e.type === 'impact' && e.params?.kind === 'ricochet') sfx.push({ kind: 'ricochet', t, distM, heavy });
    else if (e.type === 'sparks') sfx.push({ kind: 'ricochet', t, distM, heavy: false, gain: 0.8 });
    else if (e.type === 'explosion') sfx.push({ kind: 'he', t, distM, size: e.params?.size ?? 'medium' });
    else if (e.type === 'barrage') for (let k = 0; k < (e.params?.count ?? 5); k++) sfx.push({ kind: 'he', t: +(t + k * 0.22).toFixed(3), distM: distM + 30, size: 'medium', gain: 0.8 });
    else if (e.type === 'mg_burst') for (let k = 0; k < Math.min(9, e.params?.count ?? 7); k++) sfx.push({ kind: 'mg', t: +(t + k * 0.075).toFixed(3), cls: 'mg_heavy', caliberMm: 12.7, distM, tail: env.tail, burstHead: k === 0, gain: 0.8 });
  }
}
sfx.sort((a, b) => a.t - b.t);
// thin dense clusters: keep the nearest one-shot within 60 ms of the same kind (beds and drives stay)
const loud = (e) => (e.gain ?? 1) / Math.max(25, e.distM ?? 30);
const thinned = sfx.filter((e, i) => e.kind === 'bed' || e.kind === 'drive' || e.kind === 'mg' || !sfx.some((o, j) => j !== i && o.kind === e.kind && Math.abs(o.t - e.t) < 0.06 && (loud(o) > loud(e) || (loud(o) === loud(e) && j < i))));
if (unknown.size) console.warn(`sfx-cues: no spec for ${[...unknown].join(', ')} (their guns read as 120 mm)`);
writeFileSync(cuesOut, JSON.stringify({ ...cues, sfx: thinned }, null, 1));
console.log(`${thinned.length} sfx cues (${sfx.length - thinned.length} thinned) -> ${cuesOut}`);
