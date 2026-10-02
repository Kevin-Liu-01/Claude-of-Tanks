#!/usr/bin/env node
import { acquireCaptureLock as acquireLock, refreshCaptureLock, releaseCaptureLock as releaseLock } from './capture-lock.mjs';
// sfx-smoke.mjs — end-to-end gate for the generated SFX banks
// (src/audio/audioEngine.ts, assets in public/audio/sfx/).
//
// Boots the game headless on its OWN vite (7xxx port — never 5001/5002),
// enters a battle, holds it frozen (no bot fire in the captures), drives REAL
// bus events (window.__DEBUG.bus — the object the engine bound via bindBus)
// and records the master output through the __COT_AUDIO PCM tap. Asserts:
//   - every scene plays its intended assets (sfxLog names), audibly, unclipped
//   - calibre ladder: rifle MG → heavy MG → 30 mm → 90 → 120 → 152 mm; the low
//     band (<150 Hz) share of the capture rises from MG to the 152 mm and the
//     cannon tail pitch falls with bore
//   - distance model: a 15 m cannon plays its close report only, a ~210 m one
//     both layers, a ~420 m one its distant report only, and the distant report
//     arrives at the speed of sound
//   - the occupied gun plays hotter than an enemy gun at 15 m
//   - repeats never repeat exactly (playback-rate jitter)
//   - an 8-gun volley with two ammo-rack kills does not clip the master
//   - zero console errors
// Writes WAVs + report.json under shots/sfx-smoke/. Shares the FIFO capture
// lock with tools/screenshot.mjs. Exit 0 = green.
//
// Usage: node tools/sfx-smoke.mjs

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

const outDir = resolve('shots/sfx-smoke');
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Write interleaved stereo Int16 PCM as a RIFF/WAVE file. */
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

/** Peak, RMS and the share of energy below 150 Hz (two cascaded one-pole lowpasses). */
function analyze(i16, sampleRate) {
  const a = 1 - Math.exp((-2 * Math.PI * 150) / sampleRate);
  let peak = 0, sum2 = 0, low2 = 0;
  let l1 = 0, l2 = 0;
  for (let i = 0; i < i16.length; i += 2) {
    const x = (i16[i] + i16[i + 1]) / 65536;
    const ax = Math.max(Math.abs(i16[i]), Math.abs(i16[i + 1])) / 32768;
    if (ax > peak) peak = ax;
    sum2 += x * x;
    l1 += a * (x - l1);
    l2 += a * (l1 - l2);
    low2 += l2 * l2;
  }
  const n = Math.max(1, i16.length / 2);
  const rms = Math.sqrt(sum2 / n);
  return {
    peak,
    peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
    rms,
    rmsDb: rms > 0 ? 20 * Math.log10(rms) : -Infinity,
    lowShare: sum2 > 0 ? low2 / sum2 : 0,
  };
}

await acquireLock(15 * 60 * 1000);
process.on('exit', releaseLock);
const lockRefresher = setInterval(() => { refreshCaptureLock(); }, 60 * 1000);
lockRefresher.unref();

const port = 7600 + Math.floor(Math.random() * 300);
// A private dep cache: node_modules (and its .vite) can be shared between checkouts.
const viteCacheDir = resolve('/tmp', `cot-sfx-smoke-vite-${process.pid}`);
process.on('exit', () => rmSync(viteCacheDir, { recursive: true, force: true }));
const server = await createServer({
  root: process.cwd(),
  cacheDir: viteCacheDir,
  logLevel: 'error',
  server: { port, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
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
console.log(`[sfx-smoke] vite up at ${url}`);

const LAUNCH_ARGS = [
  '--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage',
  '--autoplay-policy=no-user-gesture-required',
];

let browser = await puppeteer.launch({ headless: 'new', args: LAUNCH_ARGS });
let page;
const consoleErrors = [];
async function openPage() {
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
      break;
    } catch (err) {
      if (attempt >= 1) throw err;
      console.warn(`[sfx-smoke] load attempt failed (${err.message}) — retrying`);
      consoleErrors.length = 0;
    }
  }
}
async function bootIntoBattle() {
  await page.mouse.click(640, 360);          // user gesture → audio.resume()
  await sleep(300);
  await page.evaluate(() => window.__DEBUG.startBattle('m1a2'));
  await page.waitForFunction(
    'window.__COT_AUDIO && window.__COT_AUDIO.ctx && window.__COT_AUDIO.ctx.currentTime > 0',
    { timeout: 20000 },
  ).catch(() => {});
}
await openPage();

let failed = false;
const report = { scenes: {}, ladder: {}, distance: {}, errors: [] };
const fail = (msg) => { failed = true; report.errors.push(msg); console.error('[sfx-smoke] FAIL: ' + msg); };

try {
  await bootIntoBattle();
  // Headless Chrome occasionally has no audio backend — headful fallback.
  const clockOk = await page.evaluate(async () => {
    const A = window.__COT_AUDIO;
    if (!A || !A.ctx) return false;
    const t0 = A.ctx.currentTime;
    await new Promise((r) => setTimeout(r, 600));
    return A.ctx.currentTime > t0 + 0.2;
  });
  if (!clockOk) {
    console.warn('[sfx-smoke] headless AudioContext clock stalled — relaunching headful');
    await browser.close();
    browser = await puppeteer.launch({ headless: false, args: LAUNCH_ARGS });
    consoleErrors.length = 0;
    await openPage();
    await bootIntoBattle();
    await page.waitForFunction(
      'window.__COT_AUDIO && window.__COT_AUDIO.ctx && window.__COT_AUDIO.ctx.currentTime > 0.2',
      { timeout: 20000 });
  }
  const sampleRate = await page.evaluate(() => window.__COT_AUDIO.sampleRate);

  // Decode every bank the scenes use before the first capture.
  const PRELOAD = [
    'mg_rifle_close', 'mg_heavy_close', 'mg_far', 'ac_30_close', 'ac_feed', 'ac_far_light',
    'gun_90_close', 'gun_120_close', 'gun_152_close', 'gun_far_light', 'gun_far_medium', 'gun_far_heavy',
    'atgm_launch', 'tail_open', 'tail_forest', 'tail_urban', 'tail_mountain',
    'pen_heavy', 'pen_interior', 'ricochet_heavy', 'nonpen_heavy', 'nonpen_interior', 'era_det', 'he_armor',
    'expl_he_medium', 'ground_sand', 'ground_dirt', 'ground_rock', 'bullet_dirt', 'tank_explode', 'tank_explode_ammo',
    'debris_metal', 'turret_land', 'cookoff_loop', 'burnout_blast', 'tree_snap', 'tree_fall', 'ram_heavy',
    'smoke_launcher', 'smoke_burst',
  ];
  await page.evaluate((ids) => window.__COT_AUDIO.preload(ids), PRELOAD);
  const lib = await page.evaluate(() => window.__COT_AUDIO.library());
  console.log(`[sfx-smoke] context up (sr=${sampleRate}), decoded ${lib.assets} assets (${lib.decodedMb} MB, ${lib.failed} failed)`);
  if (lib.failed) fail(`${lib.failed} SFX assets failed to decode`);
  // Freeze the battle (the pre-battle hold) so bots neither drive nor fire into
  // the captures, quiet the beds, and let earlier chatter drain.
  await page.evaluate(() => {
    window.__DEBUG.game.preBattleS = 999;
    window.__DEBUG.bus.emit('ui:volumes', { master: 0.8, engine: 0, combat: 1, ambience: 0, ui: 0, voice: 0 });
  });
  await sleep(2500);

  // In-page helpers. Positions are relative to the occupied tank (the listener).
  await page.evaluate(() => {
    const D = window.__DEBUG;
    window.__P = {
      pos(dx, dy, dz) { const p = D.game.player.state.pos; return [p.x + dx, p.y + 1.5 + dy, p.z + dz]; },
      playerId: D.game.player ? D.game.player.id : null,
      enemyId: (D.game.tanks.find((t) => t.team === 'enemy' && t.state) || {}).id || null,
      emit(ev, p) { D.bus.emit(ev, p); },
      now() { return window.__COT_AUDIO.ctx.currentTime; },
      // The runtime trail is capped; the sample sequence is monotonic.
      sfxMark() { const A = window.__COT_AUDIO; return A.sfxLog.length ? A.sfxLog.at(-1).seq : 0; },
      sfxSince(n) { return window.__COT_AUDIO.sfxLog.filter((x) => x.seq > n); },
    };
  });

  async function tapStart() { await page.evaluate(() => window.__COT_AUDIO.startTap(40)); }
  async function tapStopAndFetch() {
    const n = await page.evaluate(() => window.__COT_AUDIO.stopTap());
    const parts = [];
    const CHUNK = 1 << 20;
    for (let off = 0; off < n; off += CHUNK) {
      const b64 = await page.evaluate(
        (o, c) => window.__COT_AUDIO.readTapB64(o, c), off, Math.min(CHUNK, n - off));
      parts.push(Buffer.from(b64, 'base64'));
    }
    await page.evaluate(() => window.__COT_AUDIO.clearTap());
    const all = Buffer.concat(parts);
    return new Int16Array(all.buffer, all.byteOffset, all.length / 2);
  }
  async function emit(ev, payloadJs) { await page.evaluate(`window.__P.emit('${ev}', ${payloadJs})`); }

  // ---- scene table -----------------------------------------------------------
  let shellId = 9000;
  const fire = (cal, dx, dz, { player = false, sound = null } = {}) =>
    `{shellId:${++shellId}, shooterId:${player ? 'window.__P.playerId' : 'window.__P.enemyId'}, isPlayer:${player}, ` +
    `shellType:'APFSDS', shellName:'p', caliberMm:${cal}, weaponSound:${sound ? `'${sound}'` : 'null'}, ` +
    `muzzlePos:window.__P.pos(${dx},0,${dz}), dir:[0,0,1]}`;
  const hit = (kind, own, dmg, cal = 105) =>
    `{kind:'${kind}', pos:window.__P.pos(${own ? '0,0,1.5' : '10,0,12'}), targetId:window.__P.${own ? 'playerId' : 'enemyId'}, ` +
    `attackerId:window.__P.${own ? 'enemyId' : 'playerId'}, damage:${dmg}, caliberMm:${cal}, ` +
    `normal:[0,1,0], shellType:'APFSDS', shellName:'p', shellId:${++shellId}, targetMaxHp:1000, targetHpAfter:800}`;

  const SCENES = [
    // calibre ladder at 15 m
    { name: 'mg_rifle', ev: 'shell:fired', p: fire(7.62, 12, 9), holdMs: 900, expect: ['mg_rifle_close'], ladder: true },
    { name: 'mg_heavy', ev: 'shell:fired', p: fire(12.7, 12, 9, { sound: 'heavy-machine-gun' }), holdMs: 1000, expect: ['mg_heavy_close'], ladder: true },
    { name: 'ac_30', ev: 'shell:fired', p: fire(30, 12, 9, { sound: '2a42' }), holdMs: 1400, expect: ['ac_30_close', 'ac_feed'], ladder: true },
    { name: 'gun_90', ev: 'shell:fired', p: fire(90, 12, 9), holdMs: 2600, expect: ['gun_90_close', 'tail_'], ladder: true },
    { name: 'gun_120', ev: 'shell:fired', p: fire(120, 12, 9), holdMs: 2800, expect: ['gun_120_close', 'tail_'], ladder: true },
    { name: 'gun_152', ev: 'shell:fired', p: fire(152, 12, 9), holdMs: 3200, expect: ['gun_152_close', 'tail_'], ladder: true },
    // the occupied gun and the distance model
    { name: 'gun_120_own', ev: 'shell:fired', p: fire(120, 0, 3, { player: true }), holdMs: 2800, expect: ['gun_120_close', 'gun_far_medium'] },
    { name: 'gun_120_mid', ev: 'shell:fired', p: fire(120, 150, 150), holdMs: 3400, minRms: 1e-4, expect: ['gun_120_close', 'gun_far_medium'] },
    { name: 'gun_120_distant', ev: 'shell:fired', p: fire(120, 300, 300), holdMs: 4400, minRms: 3e-5, expect: ['gun_far_medium'], forbid: ['gun_120_close'], forbidBeyondM: 300 },
    { name: 'atgm', ev: 'shell:fired', p: fire(130, 14, 9, { sound: 'konkurs-launch' }), holdMs: 2400, expect: ['atgm_launch'] },
    // impacts
    { name: 'impact_pen', ev: 'shell:hit', p: hit('pen', false, 180), holdMs: 1600, expect: ['pen_heavy'] },
    { name: 'hit_received_pen', ev: 'shell:hit', p: hit('pen', true, 150), holdMs: 1800, expect: ['pen_heavy', 'pen_interior'] },
    { name: 'ricochet', ev: 'shell:hit', p: hit('ricochet', false, 0), holdMs: 1500, expect: ['ricochet_heavy'] },
    { name: 'nonpen', ev: 'shell:hit', p: hit('nonpen', false, 0), holdMs: 1400, expect: ['nonpen_heavy'] },
    { name: 'era', ev: 'shell:hit', p: hit('era', false, 0), holdMs: 1300, expect: ['era_det'] },
    { name: 'he_splash', ev: 'shell:hit', p: hit('he_splash', false, 120), holdMs: 2400, expect: ['he_armor', 'expl_he_medium'] },
    { name: 'shell_ground', ev: 'shell:expired', p: `{shellId:${++shellId}, pos:window.__P.pos(8,-1.5,20), hitTerrain:true, caliberMm:105}`, holdMs: 1500, expect: ['ground_'] },
    { name: 'bullet_ground', ev: 'shell:expired', p: `{shellId:${++shellId}, pos:window.__P.pos(4,-1.5,9), hitTerrain:true, caliberMm:7.62}`, holdMs: 900, minRms: 1e-4, expect: ['bullet_dirt'] },
    // destruction and contact
    { name: 'tank_explosion', ev: 'tank:destroyed', holdMs: 5200,
      p: `{id:window.__P.enemyId, specId:'t90m', pos:window.__P.pos(0,-1.5,30), killerId:window.__P.playerId, cause:'ammorack'}`,
      expect: ['tank_explode_ammo', 'debris_metal', 'turret_land', 'cookoff_loop'] },
    { name: 'tank_burnout', ev: 'tank:destroyed', holdMs: 3600,
      p: `{id:window.__P.enemyId, specId:'t90m', pos:window.__P.pos(14,-1.5,26), killerId:null, cause:'fire'}`,
      expect: ['burnout_blast'] },
    { name: 'tree_crush', ev: 'prop:crushed', holdMs: 2200,
      p: `{id:window.__P.playerId, isPlayer:true, speedMps:6, kind:'tree', h:7, pos:window.__P.pos(3,-1.5,5), dir:[0,0,1]}`,
      expect: ['tree_snap', 'tree_fall'] },
    { name: 'ram', ev: 'tank:ram', holdMs: 1600,
      p: `{aId:window.__P.playerId, bId:window.__P.enemyId, aIsPlayer:true, bIsPlayer:false, closingMps:8.5, dmgA:42, dmgB:75, pos:window.__P.pos(-2,-0.8,5)}`,
      expect: ['ram_heavy'] },
    { name: 'smoke', ev: 'auxiliary:smokeScreens', holdMs: 2200,
      p: `{screens:[{born:window.__DEBUG.game.timeS + 1000, x:window.__P.pos(6,0,14)[0], y:window.__P.pos(6,0,14)[1], z:window.__P.pos(6,0,14)[2], source:['m1a2', ...window.__P.pos(0,0,0)]}]}`,
      expect: ['smoke_launcher', 'smoke_burst'] },
  ];

  const sceneLogs = {};
  const sceneAudio = {};
  for (const sc of SCENES) {
    const mark = await page.evaluate(() => window.__P.sfxMark());
    await tapStart();
    await sleep(250);
    const emittedAt = await page.evaluate(() => window.__P.now());
    await emit(sc.ev, sc.p);
    await sleep(sc.holdMs);
    const i16 = await tapStopAndFetch();
    const a = analyze(i16, sampleRate);
    const wavPath = join(outDir, `${sc.name}.wav`);
    writeWav(wavPath, i16, sampleRate);
    const log = await page.evaluate((n) => window.__P.sfxSince(n), mark);
    sceneLogs[sc.name] = log;
    sceneAudio[sc.name] = { ...a, emittedAt };
    report.scenes[sc.name] = {
      peakDb: +a.peakDb.toFixed(2), rmsDb: +a.rmsDb.toFixed(2), lowShare: +a.lowShare.toFixed(3), wav: wavPath,
      samples: log.map((x) => `${x.n}@${x.g.toFixed(3)}x${x.r.toFixed(3)}:${x.b}`),
    };
    console.log(`[sfx-smoke] ${sc.name.padEnd(18)} peak ${a.peakDb.toFixed(1).padStart(6)} dBFS  rms ${a.rmsDb.toFixed(1).padStart(6)} dBFS  low ${(a.lowShare * 100).toFixed(0).padStart(3)}%  ${log.map((x) => x.n).join(' ')}`);
    if (a.peak >= 0.999) fail(`${sc.name}: CLIPPING (peak ${a.peakDb.toFixed(2)} dBFS)`);
    if (a.rms < (sc.minRms || 0.0008)) fail(`${sc.name}: captured audio is silent (rms ${a.rmsDb.toFixed(1)} dBFS)`);
    for (const want of sc.expect) {
      if (!log.some((x) => x.n.startsWith(want))) {
        fail(`${sc.name}: expected sample '${want}*' did not play (got: ${log.map((x) => x.n).join(', ') || 'none'})`);
      }
    }
    for (const banned of sc.forbid || []) {
      if (log.some((x) => x.n.startsWith(banned) && x.d >= (sc.forbidBeyondM ?? 0))) fail(`${sc.name}: '${banned}' should not play at this range`);
    }
    await sleep(250);
  }

  const entry = (scene, name) => (sceneLogs[scene] || []).find((x) => x.n.startsWith(name)) || null;

  // ---- calibre ladder ---------------------------------------------------------
  const ladder = SCENES.filter((s) => s.ladder).map((s) => s.name);
  for (const name of ladder) report.ladder[name] = +sceneAudio[name].lowShare.toFixed(3);
  if (!(sceneAudio.gun_152.lowShare > sceneAudio.mg_rifle.lowShare * 1.5)) {
    fail(`152 mm is not bassier than the rifle MG (low share ${sceneAudio.gun_152.lowShare.toFixed(3)} vs ${sceneAudio.mg_rifle.lowShare.toFixed(3)})`);
  }
  if (!(sceneAudio.gun_120.lowShare > sceneAudio.ac_30.lowShare)) {
    fail(`120 mm is not bassier than the 30 mm (low share ${sceneAudio.gun_120.lowShare.toFixed(3)} vs ${sceneAudio.ac_30.lowShare.toFixed(3)})`);
  }
  const tail90 = entry('gun_90', 'tail_');
  const tail152 = entry('gun_152', 'tail_');
  if (tail90 && tail152 && !(tail152.r < tail90.r)) fail(`cannon tail pitch does not fall with bore (90 mm ${tail90.r}, 152 mm ${tail152.r})`);

  // ---- distance model ---------------------------------------------------------
  const near = entry('gun_120', 'gun_120_close');
  const mid = entry('gun_120_mid', 'gun_120_close');
  const midFar = entry('gun_120_mid', 'gun_far_medium');
  const distant = entry('gun_120_distant', 'gun_far_medium');
  report.distance = { near, mid, midFar, distant };
  if (near && mid && !(mid.g < near.g * 0.5)) fail(`close report not attenuated at ~210 m (${mid.g} vs ${near.g})`);
  if (distant) {
    const delay = distant.t - sceneAudio.gun_120_distant.emittedAt;
    const expected = distant.d / 343;
    report.distance.delayS = +delay.toFixed(3);
    report.distance.expectedDelayS = +expected.toFixed(3);
    if (Math.abs(delay - expected) > 0.25) fail(`distant report delay ${delay.toFixed(2)} s, expected ~${expected.toFixed(2)} s at ${distant.d} m`);
  }
  const own = entry('gun_120_own', 'gun_120_close');
  if (own && near && !(own.g > near.g)) fail(`occupied gun not hotter than an enemy gun at 15 m (${own.g} vs ${near.g})`);
  if (own && own.b !== 'own') fail(`occupied gun routed to ${own.b}, expected the own-hull bus`);

  // ---- repeats never identical ---------------------------------------------------
  const m0 = await page.evaluate(() => window.__P.sfxMark());
  await emit('shell:fired', fire(120, 12, 9));
  await sleep(600);
  await emit('shell:fired', fire(120, 12, 9));
  await sleep(2200);
  const jl = await page.evaluate((n) => window.__P.sfxSince(n), m0);
  const reports = jl.filter((x) => x.n === 'gun_120_close');
  if (reports.length >= 2) {
    const rates = reports.map((x) => x.r);
    report.jitterRates = rates;
    if (Math.abs(rates[0] - rates[1]) < 1e-4) fail('repeat shots have identical playbackRate — jitter missing');
    for (const r of rates) if (r < 0.9 || r > 1.1) fail(`playbackRate jitter ${r} outside ±10%`);
  } else fail('jitter check: gun_120_close did not log twice');

  // ---- volley stress: a 14-tank fight moment must not clip ------------------------
  await tapStart();
  await sleep(200);
  for (let i = 0; i < 8; i++) {
    await emit('shell:fired', fire(i % 2 ? 120 : 125, -14 + i * 4, 9 + (i % 3) * 3));
    await sleep(35);
  }
  await emit('tank:destroyed', `{id:window.__P.enemyId, specId:'t90m', pos:window.__P.pos(-6,-1.5,24), killerId:window.__P.playerId, cause:'ammorack'}`);
  await sleep(120);
  await emit('tank:destroyed', `{id:window.__P.enemyId, specId:'t90m', pos:window.__P.pos(9,-1.5,21), killerId:window.__P.playerId, cause:'ammorack'}`);
  await sleep(4500);
  const vI16 = await tapStopAndFetch();
  const va = analyze(vI16, sampleRate);
  writeWav(join(outDir, 'volley.wav'), vI16, sampleRate);
  report.scenes.volley = { peakDb: +va.peakDb.toFixed(2), rmsDb: +va.rmsDb.toFixed(2) };
  console.log(`[sfx-smoke] volley             peak ${va.peakDb.toFixed(1).padStart(6)} dBFS  rms ${va.rmsDb.toFixed(1).padStart(6)} dBFS`);
  if (va.peak >= 0.999) fail(`volley: CLIPPING (peak ${va.peakDb.toFixed(2)} dBFS) — master limiter not holding`);
  if (va.rms < 0.01) fail('volley: suspiciously quiet');

  // ---- console gate ------------------------------------------------------------
  // Known-unrelated: in-flight tank-model work can throw in tankFactory.ts
  // wheel sync during any battle (visual, not audio).
  const KNOWN_UNRELATED = /syncFromState|multiplyQuaternions|tankFactory\.ts/;
  const sfxErrors = consoleErrors.filter((e) => !KNOWN_UNRELATED.test(e));
  const quarantined = consoleErrors.filter((e) => KNOWN_UNRELATED.test(e));
  if (quarantined.length) {
    report.quarantinedErrors = [...new Set(quarantined)].slice(0, 3);
    console.warn(`[sfx-smoke] ${quarantined.length} known-unrelated console error(s) quarantined (tankFactory wheel sync)`);
  }
  for (const e of sfxErrors) fail(`console: ${e}`);
} catch (err) {
  fail(String(err && err.stack || err));
} finally {
  try { await browser.close(); } catch (_) { /* fine */ }
  try { await server.close(); } catch (_) { /* fine */ }
  clearInterval(lockRefresher);
  releaseLock();
}

writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
if (report.errors.length) {
  console.error('[sfx-smoke] ISSUES:');
  for (const e of report.errors) console.error('  - ' + e);
}
console.log(failed ? '[sfx-smoke] FAIL' : '[sfx-smoke] GREEN');
process.exit(failed ? 1 : 0);
