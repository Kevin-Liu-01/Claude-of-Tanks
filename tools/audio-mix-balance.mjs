#!/usr/bin/env node
import { acquireCaptureLock as acquireLock, refreshCaptureLock, releaseCaptureLock as releaseLock } from './capture-lock.mjs';
// audio-mix-balance.mjs — browser gate for the mix itself (src/audio/audioEngine.ts):
// what a player actually hears, measured on the master output through the
// __COT_AUDIO PCM tap with every settings channel at its default.
//
//   - the garage room tone is audible (not buried under the master);
//   - gunfire stands above the idle battle bed (own engine, ambience, other
//     hulls idling), judged on its loudest 100 ms (a report is an impulse: a
//     400 ms window rewards a long boom over a crack): a cannon at 15 m by at
//     least 12 dB, at 150 m by 10, at 400 m by 4, our own gun by 14; and the
//     crack itself, a near cannon's and our own, peaks at least 22 dB over the
//     bed. (A near crack is bounded by the master's ceiling, and its 100 ms
//     sits its crest, about 11 dB, under that peak: 16 dB of 100 ms would mean
//     squashing it back into a blast; the quieter bed carries the rest.)
//   - the crew radio sits under a near cannon (at least 6 dB below);
//   - a live battle stays readable: sound starts per second over 20 s of
//     real bot combat stay under a ceiling;
//   - gunfire sounds like guns, not explosions (2026-10-02): every shot,
//     our own included, reports its transient anatomy (rise to its loudest
//     millisecond, energy in the first 10 ms, low boom under the body, crest,
//     samples at the master's soft-clip knee) from its arrival over the bed;
//     a near cannon must crack and then decay (its loudest 50 ms between
//     250 and 700 ms after arrival at least 8 dB under its loudest 50 ms in
//     the first 100: a blast holds near its peak for half a second; under
//     half its body below 100 Hz), and neither it nor our own
//     gun may ride the soft clip (at most 40 samples at its knee: the
//     compressor is no true-peak limiter, and a crack squared off by the clip
//     shows hundreds);
//   - flying the drone, the listener rides it: its motors lead (not the
//     tank's engine) and the feed brightens toward their buzz;
//   - an AC-130 battle opens on the gunship passing overhead, its crew hears
//     the cabin, and its howitzer fires inside the fuselage and throws its
//     case onto the deck.
//
// Exit 0 = green. Shares the FIFO capture lock with every browser harness.
// Usage: node tools/audio-mix-balance.mjs

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { bandEnergy, transientAnatomy } from './audio/pcm.mjs';

const outDir = resolve('shots/audio-mix-balance');
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function writeWav(path, i16, sampleRate) {
  const dataBytes = i16.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataBytes, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22); buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < i16.length; i++) buf.writeInt16LE(i16[i], 44 + i * 2);
  writeFileSync(path, buf);
}

/** RMS over the whole capture and the loudest 400 ms window (short-term loudness proxy), in dBFS. */
function measure(i16, sampleRate) {
  const frames = i16.length / 2;
  const win = Math.round(0.4 * sampleRate);
  const burst = Math.round(0.1 * sampleRate);
  let peak = 0;
  let total = 0;
  let windowSum = 0;
  let burstSum = 0;
  let maxWindow = 0;
  let maxBurst = 0;
  const sq = new Float64Array(frames);
  for (let i = 0; i < frames; i++) {
    const x = (i16[2 * i] + i16[2 * i + 1]) / 65536;
    peak = Math.max(peak, Math.abs(x));
    sq[i] = x * x;
    total += sq[i];
    windowSum += sq[i];
    burstSum += sq[i];
    if (i >= win) windowSum -= sq[i - win];
    if (i >= burst) burstSum -= sq[i - burst];
    if (i >= win - 1) maxWindow = Math.max(maxWindow, windowSum / win);
    if (i >= burst - 1) maxBurst = Math.max(maxBurst, burstSum / burst);
  }
  const db = (v) => (v > 0 ? 10 * Math.log10(v) : -120);
  return { rmsDb: db(total / Math.max(1, frames)), shortTermDb: db(maxWindow), burstDb: db(maxBurst), peakDb: db(peak * peak) };
}

/** Mono float of a stereo s16 capture. */
function mono(i16) {
  const out = new Float32Array(i16.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = (i16[2 * i] + i16[2 * i + 1]) / 65536;
  return out;
}

/** A shot's anatomy on the master, from its arrival over the bed: what reads as a gun, and how hard it rides the soft clip. */
function shotAnatomy(i16, sampleRate, masterLevel) {
  const m = mono(i16);
  const w = Math.round(0.001 * sampleRate);
  const bedN = Math.round(0.1 * sampleRate);
  let bed = 0;
  for (let i = 0; i < bedN; i++) bed += m[i] * m[i];
  const bedDb = 10 * Math.log10(bed / bedN + 1e-24);
  let arrival = 0;
  for (let k = Math.floor(bedN / w); (k + 1) * w < m.length; k++) {
    let e = 0;
    for (let i = k * w; i < (k + 1) * w; i++) e += m[i] * m[i];
    if (10 * Math.log10(e / w + 1e-24) > bedDb + 12) { arrival = Math.max(0, (k - 2) * w); break; }
  }
  const a = transientAnatomy(m.subarray(arrival), sampleRate);
  // Crack then decay: the loudest 50 ms early against the loudest 50 ms after a quarter of a second.
  const loudest50 = (fromS, toS) => {
    const n = Math.round(0.05 * sampleRate);
    let best = 0;
    for (let s = arrival + Math.round(fromS * sampleRate); s + n <= Math.min(m.length, arrival + Math.round(toS * sampleRate)); s += Math.round(0.005 * sampleRate)) {
      let e = 0;
      for (let i = s; i < s + n; i++) e += m[i] * m[i];
      best = Math.max(best, e / n);
    }
    return 10 * Math.log10(best + 1e-24);
  };
  const decayDb = loudest50(0, 0.1) - loudest50(0.25, 0.7);
  // The soft clip's knee (0.86) sits before the master volume the tap hears through.
  let atKnee = 0;
  for (let i = 0; i < i16.length; i++) if (Math.abs(i16[i]) / 32768 >= 0.86 * masterLevel) atKnee++;
  return { riseMs: a.riseMs, decayDb: +decayDb.toFixed(1), e10: +a.e10.toFixed(3), lowBody: +a.lowBody.toFixed(3), crestDb: +a.crestDb.toFixed(1), atKnee };
}

await acquireLock(30 * 60 * 1000);
process.on('exit', releaseLock);
const lockRefresher = setInterval(() => refreshCaptureLock(), 60 * 1000);
lockRefresher.unref();

const viteCacheDir = resolve('/tmp', `cot-audio-mix-vite-${process.pid}`);
process.on('exit', () => rmSync(viteCacheDir, { recursive: true, force: true }));
const server = await createServer({
  root: process.cwd(),
  cacheDir: viteCacheDir,
  logLevel: 'error',
  server: { port: 7300 + Math.floor(Math.random() * 300), strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
  optimizeDeps: {
    entries: ['index.html'],
    include: [
      'three',
      'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/utils/SkeletonUtils.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js',
    ],
  },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
console.log(`[mix] vite up at ${url}`);

const browser = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
const report = { garage: null, bed: null, shots: {}, radio: null, density: null, drone: null, gunship: null, errors: [] };
const fail = (msg) => { report.errors.push(msg); console.error('[mix] FAIL: ' + msg); };
const consoleErrors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  await page.mouse.click(640, 360);
  await page.waitForFunction('window.__COT_AUDIO && window.__COT_AUDIO.ctx && window.__COT_AUDIO.ctx.currentTime > 0.3', { timeout: 30000 });
  // Default mix, as a fresh player has it.
  await page.evaluate(() => window.__DEBUG.bus.emit('ui:volumes', { master: 0.8, engine: 1, combat: 1, ambience: 1, ui: 1, voice: 1 }));
  const sampleRate = await page.evaluate(() => window.__COT_AUDIO.sampleRate);
  let lastI16 = null;
  async function capture(name, ms, act) {
    await page.evaluate((s) => window.__COT_AUDIO.startTap(s), Math.ceil(ms / 1000) + 2);
    await sleep(120);
    if (act) await page.evaluate(act);
    await sleep(ms);
    const n = await page.evaluate(() => window.__COT_AUDIO.stopTap());
    const parts = [];
    for (let off = 0; off < n; off += 1 << 20) {
      const b64 = await page.evaluate((o, c) => window.__COT_AUDIO.readTapB64(o, c), off, Math.min(1 << 20, n - off));
      parts.push(Buffer.from(b64, 'base64'));
    }
    await page.evaluate(() => window.__COT_AUDIO.clearTap());
    const all = Buffer.concat(parts);
    const i16 = new Int16Array(all.buffer, all.byteOffset, all.length / 2);
    writeWav(join(outDir, `${name}.wav`), i16, sampleRate);
    lastI16 = i16;
    const m = measure(i16, sampleRate);
    console.log(`[mix] ${name.padEnd(18)} rms ${m.rmsDb.toFixed(1).padStart(6)} dBFS  loudest 400 ms ${m.shortTermDb.toFixed(1).padStart(6)} dBFS  100 ms ${m.burstDb.toFixed(1).padStart(6)} dBFS  peak ${m.peakDb.toFixed(1).padStart(6)} dBFS`);
    return m;
  }

  // 1) The garage room tone (wait for its bed to decode).
  await page.waitForFunction('window.__COT_AUDIO.ambientState().loops?.some((l) => l.playing)', { timeout: 20000 })
    .catch(() => fail('the garage bed never started'));
  await sleep(800);
  report.garage = await capture('garage', 5000);
  if (report.garage.rmsDb < -48) fail(`garage ambience inaudible (${report.garage.rmsDb.toFixed(1)} dBFS)`);

  // 2) Battle: the idle bed, then gunfire against it (the battle held so bots stay quiet).
  await page.evaluate(() => window.__DEBUG.startBattle('t90m'));
  await page.waitForFunction('window.__COT_AUDIO.snapshot === "battle"', { timeout: 60000 });
  await page.evaluate(() => window.__COT_AUDIO.preload(['gun_125_close', 'gun_120_close', 'gun_far_medium', 'tail_open', 'tail_forest', 'tail_urban', 'tail_mountain']));
  await page.evaluate(() => { window.__DEBUG.game.preBattleS = 999; window.__COT_AUDIO.clearVoiceQueue(); });
  await sleep(4000);
  report.bed = await capture('battle_bed', 3000);
  let shellId = 880000;
  const shot = (dx, dz) => `(() => { const D = window.__DEBUG; const p = D.game.player.state.pos; const e = D.game.tanks.find((t) => t.team === 'enemy' && t.state);
    D.bus.emit('shell:fired', { shellId: ${++shellId}, shooterId: e.id, isPlayer: false, shellType: 'APFSDS', caliberMm: 125, muzzlePos: [p.x + ${dx}, p.y + 1.5, p.z + ${dz}], dir: [0, 0, 1] }); })()`;
  for (const [name, dx, dz, minOverBed] of [['cannon_15m', 12, 9, 12], ['cannon_150m', 106, 106, 10], ['cannon_400m', 283, 283, 4]]) {
    const m = await capture(name, 3500, shot(dx, dz));
    const over = m.burstDb - report.bed.rmsDb;
    const anatomy = shotAnatomy(lastI16, sampleRate, 0.8);
    report.shots[name] = { ...m, overBedDb: +over.toFixed(1), peakOverBedDb: +(m.peakDb - report.bed.rmsDb).toFixed(1), anatomy };
    console.log(`[mix] ${''.padEnd(18)} anatomy ${JSON.stringify(anatomy)}`);
    if (over < minOverBed) fail(`${name} stands only ${over.toFixed(1)} dB over the battle bed (want ≥ ${minOverBed})`);
    // Let the shot's tails die away before the next capture measures against the bed.
    await sleep(4000);
  }
  const near = report.shots.cannon_15m.anatomy;
  if (near.decayDb < 8) fail(`a near cannon holds within ${near.decayDb} dB of its crack half a second later (want ≥ 8: a crack that decays, not a blast)`);
  if (near.lowBody > 0.5) fail(`a near cannon's body is ${(100 * near.lowBody).toFixed(0)} % below 100 Hz (want ≤ 50: a report, not a boom)`);
  if (near.atKnee > 40) fail(`a near cannon rides the soft clip (${near.atKnee} samples at its knee; the limiter should take the peak)`);
  if (report.shots.cannon_15m.peakOverBedDb < 22) fail(`a near cannon's crack peaks only ${report.shots.cannon_15m.peakOverBedDb} dB over the battle bed (want ≥ 22)`);
  // Our own gun, from the hatch beside it.
  const ownShot = `(() => { const D = window.__DEBUG; const me = D.game.player; const p = me.state.pos;
    D.bus.emit('shell:fired', { shellId: ${++shellId}, shooterId: me.id, isPlayer: true, shellType: 'APFSDS', caliberMm: 125, muzzlePos: [p.x, p.y + 2, p.z + 4], dir: [0, 0, 1] }); })()`;
  const own = await capture('cannon_own', 3500, ownShot);
  report.shots.cannon_own = { ...own, overBedDb: +(own.burstDb - report.bed.rmsDb).toFixed(1), peakOverBedDb: +(own.peakDb - report.bed.rmsDb).toFixed(1), anatomy: shotAnatomy(lastI16, sampleRate, 0.8) };
  console.log(`[mix] ${''.padEnd(18)} anatomy ${JSON.stringify(report.shots.cannon_own.anatomy)}`);
  if (report.shots.cannon_own.overBedDb < 14) fail(`our own gun stands only ${report.shots.cannon_own.overBedDb} dB over the battle bed (want ≥ 14)`);
  if (report.shots.cannon_own.anatomy.atKnee > 40) fail(`our own gun rides the soft clip (${report.shots.cannon_own.anatomy.atKnee} samples at its knee)`);
  if (report.shots.cannon_own.peakOverBedDb < 22) fail(`our own gun's crack peaks only ${report.shots.cannon_own.peakOverBedDb} dB over the battle bed (want ≥ 22)`);
  await sleep(4000);
  // 3) The crew radio against a near cannon.
  await page.waitForFunction('window.__COT_AUDIO.voicesLoaded === true', { timeout: 20000 }).catch(() => fail('crew pack did not decode'));
  report.radio = await capture('radio_line', 2600, '(() => { window.__COT_AUDIO.clearVoiceQueue(); window.__COT_AUDIO.sayVoice("enemy_spotted"); })()');
  const radioUnder = report.shots.cannon_15m.burstDb - report.radio.burstDb;
  report.radio.underCannonDb = +radioUnder.toFixed(1);
  if (radioUnder < 6) fail(`the radio is only ${radioUnder.toFixed(1)} dB under a near cannon (want ≥ 6)`);

  // 4) Density in real combat: release the battle and count sound starts over 20 s.
  await page.evaluate(() => { window.__DEBUG.game.preBattleS = 0; window.__DEBUG.flags.forceFire = true; });
  const from = await page.evaluate(() => (window.__COT_AUDIO.sfxLog.at(-1)?.seq ?? 0));
  const voiceFrom = await page.evaluate(() => window.__COT_AUDIO.voiceLog.length);
  await sleep(20000);
  const density = await page.evaluate(([seq, vFrom]) => {
    const A = window.__COT_AUDIO;
    const starts = A.sfxLog.filter((e) => e.seq > seq);
    const byName = {};
    for (const e of starts) byName[e.n] = (byName[e.n] || 0) + 1;
    return { starts: starts.length, top: Object.entries(byName).sort((a, b) => b[1] - a[1]).slice(0, 10), radioLines: A.voiceLog.length - vFrom };
  }, [from, voiceFrom]);
  await page.evaluate(() => { window.__DEBUG.flags.forceFire = false; });
  report.density = { ...density, perSecond: +(density.starts / 20).toFixed(1) };
  console.log(`[mix] live battle: ${report.density.perSecond} sound starts/s, ${density.radioLines} radio lines in 20 s; busiest ${density.top.map(([n, c]) => `${n}×${c}`).join(' ')}`);
  if (report.density.perSecond > 14) fail(`a live battle starts ${report.density.perSecond} sounds per second (want ≤ 14)`);
  if (density.radioLines > 8) fail(`${density.radioLines} radio lines in 20 s of combat (want ≤ 8)`);

  // 5) The drone: flying it, the listener rides it and its motors lead. A fresh Drone battle, captured before
  //    the bots engage: docked in the tank, then in flight.
  await page.evaluate(() => { setTimeout(() => window.__DEBUG.beginSoloBattle({ specId: 't90m', mapId: 'verdant', gameMode: 'drone' }), 0); });
  await page.waitForFunction('window.__DEBUG.game.phase === "battle" && window.__DEBUG.game.preBattleS <= 0 && window.__DEBUG.game.gameMode === "drone"', { timeout: 180000, polling: 250 });
  await page.evaluate(() => window.__COT_AUDIO.preload(['drone_fpv_loop', 'drone_fpv_hover_loop', 'drone_wind_loop', 'drone_spinup', 'drone_feed_static_loop', 'drone_link_lost']));
  await sleep(1500);
  const docked = await capture('drone_docked', 2000);
  const dockedI16 = lastI16;
  await page.mouse.click(640, 400);
  await page.keyboard.press('KeyV');
  await page.waitForFunction('window.__DEBUG.game.player.aerial?.active === true', { timeout: 10000 }).catch(() => fail('the drone never launched'));
  await page.waitForFunction('window.__DEBUG.game.player.aerial?.launching === false', { timeout: 10000 }).catch(() => {});
  // Read the state in flight (an FPV drone ends at the first thing it hits), then climb clear while recording.
  const droneState = await page.evaluate(() => {
    const A = window.__COT_AUDIO;
    const me = window.__DEBUG.game.player;
    return { listener: A.listenerState(), aerial: A.aerialState(), tank: A.engineState().find((e) => e.id === me.id) ?? null, flying: !!me.aerial?.active };
  });
  await page.keyboard.down('Space');
  const flight = await capture('drone_flight', 2000);
  await page.keyboard.up('Space');
  const buzz = (i16) => { const m = mono(i16); return bandEnergy(m, sampleRate, [[1500, 8000]])[0]; };
  report.drone = { docked, flight, buzzDocked: +buzz(dockedI16).toFixed(3), buzzFlight: +buzz(lastI16).toFixed(3), state: droneState };
  console.log(`[mix] drone: listener ${droneState.listener.kind}, own ${JSON.stringify(droneState.aerial.own)}, tank ${droneState.tank ? (droneState.tank.own ? 'own' : droneState.tank.lod) : 'out of range'}, 1.5–8 kHz ${report.drone.buzzDocked} → ${report.drone.buzzFlight}`);
  if (droneState.listener.kind !== 'player-drone') fail(`flying the drone, the listener is ${droneState.listener.kind}`);
  if (droneState.aerial.own?.kind !== 'drone' || droneState.aerial.own.gain < 0.5) fail(`the drone's motors do not lead (${JSON.stringify(droneState.aerial.own)})`);
  if (droneState.tank?.own) fail('flying the drone, our tank is still heard from inside');
  if (report.drone.buzzFlight < report.drone.buzzDocked + 0.1) fail(`the flight does not brighten toward the motors' buzz (${report.drone.buzzDocked} → ${report.drone.buzzFlight})`);
  await page.keyboard.press('KeyV');

  // 6) The AC-130: the opener, the cabin and the howitzer inside it.
  await page.evaluate(() => { setTimeout(() => window.__DEBUG.beginSoloBattle({ specId: 't90m', mapId: 'verdant', gameMode: 'ac130' }), 0); });
  await page.waitForFunction('window.__DEBUG.game.phase === "battle" && window.__DEBUG.game.preBattleS <= 0 && window.__DEBUG.game.gameMode === "ac130"', { timeout: 180000, polling: 250 });
  await sleep(1500);
  const gunshipFrom = await page.evaluate(() => (window.__COT_AUDIO.sfxLog.at(-1)?.seq ?? 0));
  await page.evaluate(() => { const D = window.__DEBUG; const me = D.game.player; const p = me.state.pos;
    D.bus.emit('shell:fired', { shellId: 990001, shooterId: me.id, isPlayer: true, shellType: 'HE', caliberMm: 152, weaponSound: 'gunship-howitzer', muzzlePos: [p.x, p.y - 2, p.z], dir: [0, -0.8, 0.6] }); });
  await sleep(1200);
  const gunship = await page.evaluate((from) => {
    const A = window.__COT_AUDIO;
    return { own: A.aerialState().own, names: A.sfxLog.filter((e) => e.seq > from).map((e) => e.n), opened: A.sfxLog.some((e) => e.n === 'gunship_flyover') };
  }, gunshipFrom);
  report.gunship = gunship;
  console.log(`[mix] AC-130: cabin ${JSON.stringify(gunship.own)}, opened on the flyover ${gunship.opened}, howitzer: ${gunship.names.join(' ')}`);
  if (gunship.own?.kind !== 'gunship') fail(`the AC-130 crew does not hear the cabin (${JSON.stringify(gunship.own)})`);
  if (!gunship.opened) fail('the AC-130 battle did not open on the gunship passing overhead');
  for (const id of ['gunship_howitzer_own', 'gunship_casing_drop']) if (!gunship.names.includes(id)) fail(`the gunship's howitzer did not play ${id} (${gunship.names.join(' ')})`);

  const KNOWN_UNRELATED = /syncFromState|multiplyQuaternions|tankFactory\.ts/;
  for (const e of consoleErrors.filter((x) => !KNOWN_UNRELATED.test(x))) fail(`console: ${e}`);
} catch (err) {
  fail(String(err && err.stack || err));
} finally {
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
  clearInterval(lockRefresher);
  releaseLock();
}
console.log(report.errors.length ? '[mix] FAIL' : '[mix] GREEN');
process.exit(report.errors.length ? 1 : 0);
