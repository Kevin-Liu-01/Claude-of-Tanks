#!/usr/bin/env node
import { acquireCaptureLock as acquireLock, refreshCaptureLock, releaseCaptureLock as releaseLock } from './capture-lock.mjs';
// audio-mix-balance.mjs — browser gate for the mix itself (src/audio/audioEngine.ts):
// what a player actually hears, measured on the master output through the
// __COT_AUDIO PCM tap with every settings channel at its default.
//
//   - the garage room tone is audible (not buried under the master);
//   - gunfire stands above the idle battle bed (own engine, ambience, other
//     hulls idling): a cannon at 150 m by at least 10 dB of short-term
//     loudness, at 400 m by at least 4 dB;
//   - the crew radio sits under a near cannon (at least 6 dB below);
//   - a live battle stays readable: sound starts per second over 20 s of
//     real bot combat stay under a ceiling.
//
// Exit 0 = green. Shares the FIFO capture lock with every browser harness.
// Usage: node tools/audio-mix-balance.mjs

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

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
  let total = 0;
  let windowSum = 0;
  let maxWindow = 0;
  const sq = new Float64Array(frames);
  for (let i = 0; i < frames; i++) {
    const x = (i16[2 * i] + i16[2 * i + 1]) / 65536;
    sq[i] = x * x;
    total += sq[i];
    windowSum += sq[i];
    if (i >= win) windowSum -= sq[i - win];
    if (i >= win - 1) maxWindow = Math.max(maxWindow, windowSum / win);
  }
  const db = (v) => (v > 0 ? 10 * Math.log10(v) : -120);
  return { rmsDb: db(total / Math.max(1, frames)), shortTermDb: db(maxWindow) };
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
const report = { garage: null, bed: null, shots: {}, radio: null, density: null, errors: [] };
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
    const m = measure(i16, sampleRate);
    console.log(`[mix] ${name.padEnd(18)} rms ${m.rmsDb.toFixed(1).padStart(6)} dBFS  loudest 400 ms ${m.shortTermDb.toFixed(1).padStart(6)} dBFS`);
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
  for (const [name, dx, dz, minOverBed] of [['cannon_15m', 12, 9, 16], ['cannon_150m', 106, 106, 10], ['cannon_400m', 283, 283, 4]]) {
    const m = await capture(name, 3500, shot(dx, dz));
    const over = m.shortTermDb - report.bed.rmsDb;
    report.shots[name] = { ...m, overBedDb: +over.toFixed(1) };
    if (over < minOverBed) fail(`${name} stands only ${over.toFixed(1)} dB over the battle bed (want ≥ ${minOverBed})`);
    await sleep(600);
  }
  // 3) The crew radio against a near cannon.
  await page.waitForFunction('window.__COT_AUDIO.voicesLoaded === true', { timeout: 20000 }).catch(() => fail('crew pack did not decode'));
  report.radio = await capture('radio_line', 2600, '(() => { window.__COT_AUDIO.clearVoiceQueue(); window.__COT_AUDIO.sayVoice("enemy_spotted"); })()');
  const radioUnder = report.shots.cannon_15m.shortTermDb - report.radio.shortTermDb;
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
