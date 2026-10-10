#!/usr/bin/env node
// Derive a film's diegetic SFX cue list from the edit (edl.json) and each cut's Studio scene: every effect inside a
// cut's source window becomes an event at its global time with its camera distance, resolved the way the game
// resolves its sound (score.mjs plays them from the recorded library): the shooter's gun class and calibre
// (weaponAudio.ts), the hero's engine family and track set (vehicleAudioProfiles.ts), and the map's gun-echo tail
// and ambience bed (environmentScenes.ts), one bed per cut. The hero's crew calls its gun's work over the radio in
// its own nation's language (owner 2026-10-05: "we have voices and stuff now"; docs/AUDIO.md "Crew radio").
// --take scores one site-fifty take, whose lens tracks the fight (owner 2026-10-09: "make sure our videos have audio"):
// every sound pans against the camera's right at its instant, every moving hull (the hero and its three nearest) runs
// its own engine and tracks with level and pan following the lens, and burning wrecks and fire fields crackle with
// the game's own fire loops.
//   node sfx-cues.mjs <edl.json> <sceneDir> <cues-in.json> <cues-out.json> [--take]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
await import('../../../src/vehicles/fleetRegistration.ts');
const { getSpec } = await import('../../../src/vehicles/specs.ts');
const { resolveVehicleAudioIdentity } = await import('../../../src/audio/vehicleAudioProfiles.ts');
const { resolveWeaponReport } = await import('../../../src/audio/weaponAudio.ts');
const { sceneForMap } = await import('../../../src/audio/environmentScenes.ts');
const { VOICE_PACKS } = await import('../../../src/audio/voiceManifest.generated.ts');
const { VOICE_LINES, RADIO_DISCIPLINE } = await import('../../../src/audio/voiceLines.ts');
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
const TAKE = process.argv.includes('--take');
const [edlFile, sceneDir, cuesIn, cuesOut] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const edl = JSON.parse(readFileSync(edlFile, 'utf8')), cues = JSON.parse(readFileSync(cuesIn, 'utf8'));
const lerp = (a, b, t) => a + (b - a) * t;
/** A camera key's field (pos or lookAt) at tMs, linear between the storyboard's keys. */
const keyAt = (sb, tMs, field) => {
  const s = sb.shots; if (!s?.length) return null;
  if (tMs <= s[0].tMs) return s[0][field];
  for (let i = 1; i < s.length; i++) if (tMs <= s[i].tMs) { const u = (tMs - s[i - 1].tMs) / Math.max(1, s[i].tMs - s[i - 1].tMs); return s[i - 1][field].map((v, k) => lerp(v, s[i][field][k], u)); }
  return s.at(-1)[field];
};
const camAt = (sb, tMs) => keyAt(sb, tMs, 'pos');
/**
 * Where a source at [x, z] sits across the frame at tMs: -1 hard left, 1 hard right, softened to ±0.85 so nothing
 * leaves one ear. The camera's right is forward × up (three's convention), forward from its position to its look-at.
 */
const panAt = (sb, tMs, at) => {
  const c = camAt(sb, tMs), l = keyAt(sb, tMs, 'lookAt');
  if (!c || !l || !at) return 0;
  const fx = l[0] - c[0], fz = l[2] - c[2], fl = Math.hypot(fx, fz) || 1, dx = at[0] - c[0], dz = at[1] - c[2], dl = Math.hypot(dx, dz) || 1;
  return +Math.max(-0.85, Math.min(0.85, (dx * -fz + dz * fx) / (fl * dl) * 0.85)).toFixed(2);
};
/** A source's distance from the lens at tMs (m, across the ground). */
const distAt = (sb, tMs, at) => { const c = camAt(sb, tMs); return c && at ? Math.hypot(c[0] - at[0], c[2] - at[1]) : 40; };
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
/** A crushed prop's recorded sound by its kind, as audioEngine.ts propAsset picks it (a tall tree's fall follows). */
function propAsset(kind, height = 0) {
  const k = String(kind).toLowerCase();
  if (/tree|sapling|stump|trunk|palm|pine|bush|shrub/.test(k)) return { asset: 'tree_snap', ...(height > 4 ? { follow: 'tree_fall' } : {}) };
  if (/chain|wire|barbed/.test(k)) return { asset: 'wire_snag' };
  if (/fence|rail|gate|post/.test(k)) return { asset: /metal|steel|iron|chain/.test(k) ? 'fence_metal' : 'fence_wood' };
  if (/car|truck|van|bus|jeep|vehicle|tractor/.test(k)) return { asset: 'car_crush' };
  if (/container|barrel|drum|tank|cylinder/.test(k)) return { asset: 'container_crush' };
  if (/hedgehog|obstacle|tetra/.test(k)) return { asset: 'hedgehog_clang' };
  if (/sandbag|bag/.test(k)) return { asset: 'sandbag_thump' };
  if (/rubble|rock|stone|debris|brick/.test(k)) return { asset: 'rubble_crunch' };
  if (/glass|window|greenhouse/.test(k)) return { asset: 'glass_shatter' };
  if (/wall|pillar|column/.test(k)) return { asset: 'wall_brick' };
  if (/house|building|hut|shed|barn|tower|kiosk|shack|silo/.test(k)) return { asset: 'building_collapse' };
  if (/aagun|gun/.test(k)) return { asset: 'he_armor', follow: 'debris_metal' };
  return { asset: 'crate_break' };
}
const sfx = [], calls = [];
const seedOf = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
/**
 * The hero crew's calls in one cut, as crewRadio.ts would make them: the gunner's "firing" as the round goes, the
 * result once it lands (target destroyed, penetration, non-penetration, ricochet), a near miss when a shell bursts
 * close, an ally's kill. Candidates only: the radio discipline below places them.
 */
function crewCalls(scene, cut, cutIndex, inMs, outMs, rate) {
  const heroId = scene.actors.find((a) => a.name === 'hero')?.id ?? '', spec = specOf(heroId);
  const lang = spec ? resolveVehicleAudioIdentity(spec).crew : 'en-US';
  const fx = (scene.effects ?? []).filter((e) => e.tMs >= inMs - 400 && e.tMs < outMs).sort((a, b) => a.tMs - b.tMs);
  const at = (tMs) => +(cut.start + (tMs - inMs) / 1000 / rate).toFixed(3);
  const out = [], call = (line, tMs) => out.push({ line, lang, t: at(tMs), cutStart: cut.start, cutEnd: cut.start + cut.dur, cutIndex });
  for (const f of fx.filter((e) => e.type === 'fire')) {
    const after = fx.filter((e) => e.tMs > f.tMs && e.tMs <= f.tMs + 1600 && (e.actor ?? '').startsWith('foe'));
    const kill = after.find((e) => e.type === 'tank_kill'), hit = after.find((e) => e.type === 'impact');
    if (f.actor === 'hero') {
      call('firing', f.tMs - 520);
      if (kill) call('target_destroyed', kill.tMs + 380);
      else if (hit) call({ pen: 'penetration', nonpen: 'nonpen', ricochet: 'ricochet' }[hit.params?.kind] ?? 'penetration', hit.tMs + 280);
    } else if (kill && (f.actor ?? '').startsWith('ally')) call('ally_kill', kill.tMs + 420);
  }
  const heroAt = (tMs) => actorAt(scene, 'hero', tMs);
  for (const e of fx.filter((x) => x.type === 'explosion' && Array.isArray(x.at))) {
    const h = heroAt(e.tMs);
    if (h && Math.hypot(e.at[0] - h[0], e.at[1] - h[1]) < 16) call('near_miss', e.tMs + 260);
  }
  return out;
}
/**
 * A take's running gear: every hull that runs more than 1 m/s through the cut (the hero first, then the three nearest
 * the lens) plays its own family's recorded engine, at its family's pitch, over its track set's loop. Level and pan
 * follow the lens every 100 ms. A held lens that a hull passes within 18 m gets the Doppler pass-by instead.
 */
function takeDrives(scene, cut, inMs, outMs, rate) {
  const sb = scene.storyboard ?? {}, sh = sb.shots ?? [];
  const held = sh.length > 1 && Math.hypot(sh[0].pos[0] - sh.at(-1).pos[0], sh[0].pos[2] - sh.at(-1).pos[2]) < 0.5;
  const movers = [];
  for (const track of sb.actorTracks ?? []) {
    if (!(track.keys?.length >= 2)) continue;
    // the path run, not the displacement: a hull that turns still runs
    let path = 0, prev = actorAt(scene, track.actor, inMs), best = { d: Infinity, t: inMs };
    for (let tm = inMs; tm <= outMs; tm += 20) {
      const p = actorAt(scene, track.actor, tm), d = distAt(sb, tm, p);
      path += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p;
      if (d < best.d) best = { d, t: tm };
    }
    const speed = path / Math.max(0.1, (outMs - inMs) / 1000);
    if (speed > 1) movers.push({ name: track.actor, speed, best });
  }
  movers.sort((a, b) => (b.name === 'hero') - (a.name === 'hero') || a.best.d - b.best.d);
  for (const m of movers.slice(0, 4)) {
    const id = scene.actors.find((a) => a.name === m.name)?.id ?? '', spec = specOf(id);
    const identity = spec ? resolveVehicleAudioIdentity(spec) : null, level = m.name === 'hero' ? 1 : 0.7;
    const ev = { kind: 'drive', actor: m.name, t: +cut.start.toFixed(3), dur: +cut.dur.toFixed(3), speed: +m.speed.toFixed(1),
      engine: identity?.engine ?? (TURBINE.test(id) ? 'turbine_agt' : 'diesel_v12_modern'), pitch: +(identity?.enginePitch ?? 1).toFixed(4),
      tracks: identity?.tracks ?? 'heavy', surface: SURFACE[scene.map] ?? 'earth' };
    if (held && m.best.d < 18) {
      const c = camAt(sb, m.best.t), fx = sh[0].lookAt[0] - c[0], fz = sh[0].lookAt[2] - c[2];
      const a = actorAt(scene, m.name, m.best.t - 50), b2 = actorAt(scene, m.name, m.best.t + 50);
      const dir = Math.sign(-(b2[0] - a[0]) * fz + (b2[1] - a[1]) * fx) || 1;
      Object.assign(ev, { passAt: +((m.best.t - inMs) / 1000 / rate).toFixed(3), d0: +m.best.d.toFixed(1), gain: +(0.9 * level).toFixed(2), dir });
    } else {
      const keys = [];
      for (let tm = inMs; tm <= outMs + 1e-6; tm += 100) {
        const p = actorAt(scene, m.name, tm), d = distAt(sb, tm, p);
        keys.push([+((tm - inMs) / 1000 / rate).toFixed(3), +(Math.max(0.06, Math.min(0.6, 6 / Math.max(6, d))) * level).toFixed(3), panAt(sb, tm, p)]);
      }
      ev.keys = keys;
    }
    sfx.push(ev);
  }
}
/**
 * A take's fires as audioEngine.ts voices them: a burning wreck's wreck_fire_loop, a fire field's fire_small_loop
 * (louder with its intensity). Each runs from its effect's start (or the cut's) to its end, or to the cut's end, with
 * level and pan following the lens every 100 ms.
 */
function fireLoop(scene, cut, e, inMs, outMs, rate) {
  const start = e.tMs ?? 0, from = Math.max(inMs, start);
  const until = e.params?.durationS ? Math.min(outMs, start + e.params.durationS * 1000) : outMs;
  if (until - from < 200) return;
  const sb = scene.storyboard ?? {}, wreck = e.type === 'burning';
  const baseDb = wreck ? -14 : -15 + 4 * Math.log10(Math.max(0.25, e.params?.intensity ?? 1)), keys = [];
  for (let tm = from; tm <= until + 1e-6; tm += 100) {
    const at = e.at ?? (e.actor ? actorAt(scene, e.actor, tm) : null);
    if (!at) return;
    keys.push([+((tm - from) / 1000 / rate).toFixed(3), +(Math.pow(10, baseDb / 20) * Math.min(1, 12 / Math.max(12, distAt(sb, tm, at)))).toFixed(4), panAt(sb, tm, at)]);
  }
  sfx.push({ kind: 'loop', asset: wreck ? 'wreck_fire_loop' : 'fire_small_loop', actor: e.actor ?? null, t: +(cut.start + (from - inMs) / 1000 / rate).toFixed(3),
    dur: +((until - from) / 1000 / rate).toFixed(3), fadeIn: from > inMs ? 0.4 : 0, keys });
}
for (const cut of edl.shots) {
  const id = basename(cut.src, '.mp4').replace(/-p$/, ''); // portrait clips share the landscape scene's timing
  const cands = sceneDir.split(',').flatMap(d => [join(d, `${id}.resolved.json`), join(d, `${id}.json`)]); // first dir wins (re-renders first)
  const f = cands.find(existsSync) ?? cands[0];
  if (!existsSync(f)) continue;
  const scene = JSON.parse(readFileSync(f, 'utf8'));
  const rate = cut.rate ?? 1, inMs = (cut.in ?? 0) * 1000, outMs = inMs + cut.dur * 1000 * rate;
  // engines: a moving hero gets a running-gear bed, or a Doppler pass-by when a held camera sees it go past (a take:
  // every moving hull near the lens, takeDrives)
  const hk = scene.storyboard?.actorTracks?.find(t => t.actor === 'hero')?.keys;
  if (TAKE) takeDrives(scene, cut, inMs, outMs, rate);
  else if (hk?.length >= 2) {
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
  calls.push(...crewCalls(scene, cut, edl.shots.indexOf(cut), inMs, outMs, rate));
  // the hulls' crushes (the lab's resolved scene carries the Studio's plan, studioCrush.ts): each prop sounds as it goes
  for (const c of scene.crushes ?? []) {
    if (c.tMs < inMs || c.tMs >= outMs) continue;
    if (c.kind === 'pole') continue; // the battle topples a utility pole silently (crushNearbyProps emits no sound event)
    const cam = camAt(scene.storyboard ?? {}, c.tMs), d = cam ? Math.hypot(cam[0] - c.pos[0], cam[2] - c.pos[2]) : 40;
    const P = TAKE ? { pan: panAt(scene.storyboard ?? {}, c.tMs, [c.pos[0], c.pos[2]]) } : {};
    sfx.push({ kind: 'prop', t: +(cut.start + (c.tMs - inMs) / 1000 / rate).toFixed(3), ...propAsset(c.kind, c.heightM), distM: +d.toFixed(1), ...P });
  }
  for (const e of scene.effects ?? []) {
    if (TAKE && (e.type === 'burning' || e.type === 'fire_field')) { fireLoop(scene, cut, e, inMs, outMs, rate); continue; }
    if (e.tMs < inMs || e.tMs >= outMs) continue;
    const t = +(cut.start + (e.tMs - inMs) / 1000 / rate).toFixed(3);
    const cam = camAt(scene.storyboard ?? {}, e.tMs), pos = e.at ?? (e.actor ? actorAt(scene, e.actor, e.tMs) : null);
    const d = cam && pos ? Math.hypot(cam[0] - pos[0], cam[2] - pos[1]) : 40;
    const distM = +d.toFixed(1), pan = TAKE ? panAt(scene.storyboard ?? {}, e.tMs, pos) : 0, shooter = scene.actors.find(a => a.name === (e.actor ?? 'hero'))?.id ?? '';
    const heavy = gunOf(shooter).caliberMm >= 100, P = TAKE ? { pan } : {};
    if (e.type === 'fire') sfx.push({ kind: 'cannon', t, ...gunOf(shooter), distM, tail: env.tail, pan });
    else if (e.type === 'tank_kill') sfx.push({ kind: 'kill', t, distM, pop: e.params?.pop !== false, ...P });
    else if (e.type === 'impact' && e.params?.kind === 'pen') sfx.push({ kind: 'pen', t, distM, heavy, ...P });
    else if (e.type === 'impact' && e.params?.kind === 'nonpen') sfx.push({ kind: 'nonpen', t, distM, ...P });
    else if (e.type === 'impact' && e.params?.kind === 'ricochet') sfx.push({ kind: 'ricochet', t, distM, heavy, ...P });
    else if (e.type === 'sparks') sfx.push({ kind: 'ricochet', t, distM, heavy: false, gain: 0.8, ...P });
    else if (e.type === 'explosion') sfx.push({ kind: 'he', t, distM, size: e.params?.size ?? 'medium', ...P });
    else if (e.type === 'barrage') for (let k = 0; k < (e.params?.count ?? 5); k++) sfx.push({ kind: 'he', t: +(t + k * 0.22).toFixed(3), distM: distM + 30, size: 'medium', gain: 0.8, ...P });
    else if (e.type === 'mg_burst') for (let k = 0; k < Math.min(9, e.params?.count ?? 7); k++) sfx.push({ kind: 'mg', t: +(t + k * 0.075).toFixed(3), cls: 'mg_heavy', caliberMm: 12.7, distM, tail: env.tail, burstHead: k === 0, gain: 0.8, ...P });
  }
}
// The radio discipline (crewRadio.ts): one transmission at a time with a breath between, the more urgent call placed
// first, a call that cannot go out before it goes stale dropped rather than played late — and every transmission
// inside its own cut, since the next cut may be another nation's crew. A transmission is the key-up, the take, the
// release (score.mjs plays all three from the recorded library).
const KEY_LEAD_S = 0.1, KEY_TAIL_S = 0.32;
const placed = [];
for (const c of calls.map((c) => ({ ...c, meta: VOICE_LINES[c.line] })).filter((c) => c.meta && VOICE_PACKS[c.lang]?.[c.line]?.length)
  .sort((a, b) => b.meta.pri - a.meta.pri || a.t - b.t)) {
  const takes = VOICE_PACKS[c.lang][c.line], take = seedOf(`${edlFile}|${c.cutIndex}|${c.line}`) % takes.length;
  const span = KEY_LEAD_S + takes[take] + KEY_TAIL_S;
  for (let s = Math.max(c.t, c.cutStart + 0.15); s <= c.t + c.meta.staleS; s += 0.05) {
    if (s + span > c.cutEnd + 0.25) break;
    if (placed.some((p) => s < p.t + p.span + RADIO_DISCIPLINE.gapS && p.t < s + span + RADIO_DISCIPLINE.gapS)) continue;
    placed.push({ kind: 'radio', t: +s.toFixed(3), lang: c.lang, line: c.line, take, voiceDur: takes[take], span: +span.toFixed(3) });
    break;
  }
}
sfx.push(...placed);
sfx.sort((a, b) => a.t - b.t);
// thin dense clusters: keep the nearest one-shot within 60 ms of the same kind (beds and drives stay)
const loud = (e) => (e.gain ?? 1) / Math.max(25, e.distM ?? 30);
const thinned = sfx.filter((e, i) => e.kind === 'bed' || e.kind === 'drive' || e.kind === 'loop' || e.kind === 'mg' || e.kind === 'radio' || !sfx.some((o, j) => j !== i && o.kind === e.kind && Math.abs(o.t - e.t) < 0.06 && (loud(o) > loud(e) || (loud(o) === loud(e) && j < i))));
if (unknown.size) console.warn(`sfx-cues: no spec for ${[...unknown].join(', ')} (their guns read as 120 mm)`);
writeFileSync(cuesOut, JSON.stringify({ ...cues, sfx: thinned }, null, 1));
const langs = [...new Set(placed.map((p) => p.lang))];
console.log(`${thinned.length} sfx cues (${sfx.length - thinned.length} thinned), ${placed.length} of ${calls.length} crew calls on the radio (${langs.join(', ') || 'none'}) -> ${cuesOut}`);
