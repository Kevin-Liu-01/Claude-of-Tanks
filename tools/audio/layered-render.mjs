#!/usr/bin/env node
// tools/audio/layered-render.mjs — what a shot sounds like in game, rendered offline (gun-reports-269, owner 2026-11-04:
// "the owner judges what plays in game"). The real audio engine (src/audio/audioEngine.ts) runs in Node on a fake
// AudioContext with real fleet specs and real events; every layer it starts (the recording and the variant, its start,
// level, rate, bus and cut) is taken from the engine and its pool, then mixed with ffmpeg: the weapons buses' +3 dB low
// shelf at 110 Hz and the master limiter, as the mixer applies them. The per-voice distance filters, the reverb and
// the scope snapshot are not rendered. The battle's ambience is off (no bed, no spot director), so a render holds the
// shot alone: until 11-04 the hangar scene the engine starts in kept playing its workshop spots under the shots.
//
//   node tools/audio/layered-render.mjs <out-dir> [--keys 120/combustible,7.62/belt]
//
// Writes <out-dir>/<key>_<scene>.webm for the scenes close (a gun 30 m away), own (our own, from the hatch), sight (our
// own, scoped) and far (800 m), and <out-dir>/layers.json (every layer of every render).

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = process.argv[2];
if (!out) { console.error('usage: layered-render.mjs <out-dir> [--keys a,b]'); process.exit(1); }
const keysArg = process.argv.includes('--keys') ? process.argv[process.argv.indexOf('--keys') + 1].split(',') : null;
mkdirSync(out, { recursive: true });

const { SFX_ASSETS } = await import(`${ROOT}/src/audio/sfxManifest.generated.ts`);
const { createFakeContext, fakeBuffer } = await import(`${ROOT}/src/audio/fakeAudioContext.test-support.mjs`);
const { createBus } = await import(`${ROOT}/src/game/stateCore.ts`);
await import(`${ROOT}/src/vehicles/authorityFleet.ts`);
const { TANK_SPECS } = await import(`${ROOT}/src/vehicles/specs.ts`);
const { weaponMounts, mountForRound, WEAPON_ROWS } = await import(`${ROOT}/src/audio/weaponAudio.ts`);

// A fetched file is its own URL; a decoded buffer carries the URL and the variant's real duration.
const enc = new TextEncoder();
const dec = new TextDecoder();
globalThis.fetch = async (url) => ({ ok: true, status: 200, arrayBuffer: async () => enc.encode(String(url)).buffer });
globalThis.window = {};
const durationOf = (url) => {
  const m = /\/audio\/sfx\/[^/]+\/(.+)_(\d+)\.webm/.exec(url);
  return m && SFX_ASSETS[m[1]] ? SFX_ASSETS[m[1]].d[Number(m[2])] : 1;
};
const ctx = createFakeContext({ decode: (bytes) => { const url = dec.decode(bytes); return Object.assign(fakeBuffer(durationOf(url)), { name: url }); } });
const { createAudio } = await import(`${ROOT}/src/audio/audioEngine.ts`);
const terrain = { getHeightAt: () => 0, getGroundType: () => 'medium', getTrackSurfaceAt: () => 0, getWaterDepthAt: () => 0 };
const audio = createAudio({ context: ctx, getMapId: () => 'verdant', getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop',
  getVehicleSpec: (id) => TANK_SPECS[id] ?? null });
const bus = createBus();
audio.bindBus(bus);
audio.resume();
const probe = globalThis.window.__COT_AUDIO;

// A representative vehicle and round for every row the fleet fires (and the AC-130's, the TOS-1A's, a TOW's).
const REPS = [
  ['7.62/belt', 'leo2a4', null, 7.62, [8, 0.09]], ['12.7/belt', 't90am', null, 12.7, [5, 0.12]],
  ['20/belt', 'marder1a3', 'DM63 APDS-T', null, [5, 0.21]], ['25/belt', 'm2a2_bradley', 'M919 APFSDS-T', null, [5, 0.36]],
  ['30/belt', 'bmp2', '3UBR8 APDS', null, [5, 0.38]], ['35/belt', 'cv9035dk', '35 mm APFSDS-T', null, [5, 0.5]],
  ['40/belt', 'cv90', '40 mm Slpprj m/90 APFSDS-T', null, [5, 0.44]], ['50/belt', 'marder2', 'Rh 503 50 mm APFSDS-T', null, [5, 0.56]],
  ['76/unitary_brass', 'm41a3', 'M331A2 HVAP-T'], ['84/unitary_brass', 'centurion3', 'L23A1 APFSDS'],
  ['90/unitary_brass', 'm48a3_patton', 'DM63 (105) APFSDS'], ['100/unitary_brass', 't55a', '3BM8 APDS'],
  ['100lp/unitary_brass', 'bmp3', '3UOF19 HE-FRAG'], ['105/unitary_brass', 'leo1a5', 'DM63 (105) APFSDS'],
  ['120/combustible', 'leo2a4', 'DM53 APFSDS'], ['120/separate_bag', 'challenger2', 'L27A1 CHARM-3'],
  ['125/two_piece', 't90am', '3BM60 Svinets-2'], ['130/combustible', 'kf51_panther', 'DM13 130mm APFSDS'],
  ['152/separate_case', 'kv2', 'OF-530 HE'], ['152/caseless', 'm551a1_tts', 'M409A1 TTS HEAT-MP'],
  ['165/separate_bag', 'centurion5_avre', 'L37 HESH'], ['170/separate_case', 'jpz_e100', '17cm PzGr APCBC'],
  ['220/rocket', 'tos1a_tagil', '220 mm Salvo HE'], ['guided/missile', 'm2a2_bradley', 'BGM-71 TOW-2A'],
];

function tank(id, specId, { x = 0, z = 0, team = 'enemy', isPlayer = false } = {}) {
  return {
    id, team, isPlayer, specId, spec: TANK_SPECS[specId],
    state: { pos: { x, y: 0, z }, speed: 0, yaw: 0, yawRate: 0, verticalSpeed: 0, grounded: true, turretYawRate: 0, gunPitch: 0 },
    input: { throttle: 0 },
    combat: { destroyed: false, hp: 1000, maxHp: 1000, modules: {}, ammo: [99, 99, 99], ammoCapacity: [99, 99, 99], shellSlot: 0 },
  };
}

const SKIP = /^(amb_|engine_|tracks_|radio_|ui_|sting_|interior_|turret_|elevation_|gear_|electric_|turbo_)|_loop$/;
let shellId = 1;

async function scene(key, specId, roundName, stationMm, burst, kind) {
  const spec = TANK_SPECS[specId];
  const round = roundName ? spec.gun.shells.find((s) => s.name === roundName) : null;
  const me = tank('me', specId, { team: 'player', isPlayer: true });
  const shooter = kind === 'own' || kind === 'sight' ? me : tank('gun', specId, { x: kind === 'far' ? 0 : 30, z: kind === 'far' ? 800 : 0 });
  const list = shooter === me ? [me] : [tank('me', 'leo2a4', { team: 'player', isPlayer: true }), shooter];
  const listener = { pos: { x: 0, y: 2, z: 0 }, forward: { x: 0, y: 0, z: 1 }, kind: 'player-tank', ownerId: 'me', scoped: kind === 'sight' };
  bus.emit('phase:change', { phase: 'battle' });
  // the shot alone: the battle's ambience off stops the hangar scene the engine opened in, its spots with it
  audio.ambientOn(false);
  await audio.warmBattleEvents(list.map((t) => t.specId));
  for (let i = 0; i < 20; i++) { ctx.advance(1 / 30); audio.update(1 / 30, listener, list); }
  await probe.libraryIdle();
  bus.emit('battle:rollout', {});
  ctx.advance(2);
  audio.update(1 / 60, listener, list);
  const since = probe.sfxLog.at(-1)?.seq ?? 0;
  const startedBefore = ctx.started.length;
  const t0 = ctx.currentTime;
  const [n, gap] = burst ?? [1, 0];
  const p = shooter.state.pos;
  const dir = kind === 'far' ? [1, 0, 0] : kind === 'close' ? [0, 0, 1] : [0, 0, 1];
  for (let i = 0; i < n; i++) {
    if (stationMm) bus.emit('auxiliary:fired', { id: shooter.id, x: p.x, y: 2.5, z: p.z, caliberMm: stationMm });
    else bus.emit('shell:fired', { shellId: shellId++, shooterId: shooter.id, isPlayer: shooter === me, muzzlePos: [p.x, 2, p.z + (shooter === me ? 3 : 0)], dir,
      caliberMm: round.caliberMm, shellType: round.type, shellName: round.name, weaponSound: round.soundProfile || spec.gun.soundProfile || null, velocityMps: round.velocityMps });
    ctx.advance(gap || 0.05);
    audio.update(gap || 0.05, listener, list);
  }
  const log = probe.sfxLog.filter((e) => e.seq > since && !SKIP.test(e.n));
  const sources = ctx.started.slice(startedBefore);
  const layers = [];
  const ambient = log.filter((e) => e.b === 'ambience');
  if (ambient.length) throw new Error(`${key} ${kind}: ambience under the shot (${ambient.map((e) => e.n).join(', ')})`);
  for (const e of log) {
    const src = sources.find((s) => s.buffer?.name?.includes(`/${e.n}_`) && Math.abs((s.started?.at ?? -1) - e.t) < 1e-3 && !s._used);
    if (!src) continue;
    src._used = true;
    const file = join(ROOT, 'public', src.buffer.name.replace(/^\//, ''));
    const cut = src.stopped != null && src.stopped > e.t ? src.stopped - e.t : null;
    layers.push({ n: e.n, file, t: +(e.t - t0).toFixed(3), g: e.g, r: e.r, b: e.b, d: e.d, cut: cut != null ? +cut.toFixed(3) : null });
  }
  return layers;
}

function mix(layers, file) {
  if (!layers.length) return null;
  const inputs = [];
  const filters = [];
  const length = Math.max(...layers.map((l) => l.t + (l.cut ?? 6))) + 0.5;
  layers.forEach((l, i) => {
    inputs.push('-i', l.file);
    const trim = l.cut != null ? `atrim=0:${l.cut},` : '';
    const ms = Math.max(0, Math.round(l.t * 1000));
    filters.push(`[${i}:a]aformat=channel_layouts=mono,${trim}asetrate=48000*${l.r.toFixed(4)},aresample=48000,volume=${l.g.toFixed(5)},adelay=${ms}:all=1[a${i}]`);
  });
  filters.push(`${layers.map((_, i) => `[a${i}]`).join('')}amix=inputs=${layers.length}:normalize=0,bass=g=3:f=110:w=0.7,`
    + `alimiter=limit=0.74:attack=2:release=250:level=false,apad=whole_dur=${length.toFixed(2)},atrim=0:${length.toFixed(2)}[out]`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filters.join(';'), '-map', '[out]', '-c:a', 'libopus', '-b:a', '96k', file]);
  return file;
}

const all = {};
for (const [key, specId, roundName, stationMm, burst] of REPS) {
  if (keysArg && !keysArg.includes(key)) continue;
  if (!TANK_SPECS[specId]) { console.warn(`${key}: no spec ${specId}`); continue; }
  const m = stationMm ? null : mountForRound(weaponMounts(TANK_SPECS[specId].gun), roundName);
  if (m && m.key !== key) console.warn(`${key}: ${specId} ${roundName} keys ${m.key}`);
  const row = WEAPON_ROWS[key];
  for (const kind of ['close', 'own', 'sight', 'far']) {
    if (kind === 'sight' && !row.interior) continue;
    const layers = await scene(key, specId, roundName, stationMm, burst, kind);
    const name = `${key.replace(/[^a-z0-9]+/gi, '_')}_${kind}.webm`;
    mix(layers, join(out, name));
    all[`${key} ${kind}`] = { file: name, layers: layers.map(({ file, ...rest }) => ({ ...rest, file: file.split('/').slice(-1)[0] })) };
    console.log(`${key.padEnd(22)} ${kind.padEnd(6)} ${layers.map((l) => `${l.n}${l.cut ? `[${l.cut}s]` : ''}@${l.t}s×${l.g}`).join(' ')}`);
  }
}
writeFileSync(join(out, 'layers.json'), JSON.stringify(all, null, 1));
console.log(`layered renders → ${out}`);
