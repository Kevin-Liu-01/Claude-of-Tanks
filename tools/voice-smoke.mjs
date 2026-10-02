#!/usr/bin/env node
import { acquireCaptureLock as acquireLock, refreshCaptureLock, releaseCaptureLock as releaseLock } from './capture-lock.mjs';
// voice-smoke.mjs — play-path smoke for the national crew radio
// (src/audio/crewRadio.ts, packs in public/audio/voice/<lang>/).
//
// Boots the game headless on its OWN vite (7xxx port — never 5001/5002),
// enters a battle in a Russian T-90M and verifies in the real engine path:
//   1. the crew is national: a Russian hull speaks Russian (crewLanguage
//      'ru') and its pack decodes with zero failures;
//   2. the battle envelope plays through the game bus: a re-driven
//      garage→battle edge announces battle_start, the presented victory
//      announces victory;
//   3. combat lines driven through the bus reach the radio: a spot (plain or
//      by bearing), track loss, reload done, sixth sense and a penetration;
//   4. the crew-voice setting switches live: 'english' → en-US, back to
//      'national' → ru;
//   5. all 13 crew packs decode and are audible through the radio chain,
//      band-limited like an intercom (one PCM capture per language);
//   6. zero page console errors (known-unrelated tankFactory wheel-sync
//      errors quarantined, same as tools/audio-probe.mjs).
// Writes the per-language captures under shots/voice-smoke/. Shares the FIFO
// capture lock with tools/screenshot.mjs. Exit 0 = green.
//
// Usage: node tools/voice-smoke.mjs

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

const LANGUAGES = ['en-US', 'en-GB', 'de', 'ru', 'uk', 'zh', 'fr', 'sv', 'ja', 'ko', 'it', 'pl', 'he'];
const outDir = resolve('shots/voice-smoke');
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

/** RMS plus the energy shares above 6 kHz and below 150 Hz (cascaded one-pole filters). */
function analyze(i16, sampleRate) {
  const aHi = 1 - Math.exp((-2 * Math.PI * 6000) / sampleRate);
  const aLo = 1 - Math.exp((-2 * Math.PI * 150) / sampleRate);
  let sum2 = 0, hi2 = 0, lo2 = 0;
  let h1 = 0, h2 = 0, l1 = 0, l2 = 0;
  for (let i = 0; i < i16.length; i += 2) {
    const x = (i16[i] + i16[i + 1]) / 65536;
    sum2 += x * x;
    h1 += aHi * (x - h1);
    h2 += aHi * (h1 - h2);
    const high = x - h2;
    hi2 += high * high;
    l1 += aLo * (x - l1);
    l2 += aLo * (l1 - l2);
    lo2 += l2 * l2;
  }
  const n = Math.max(1, i16.length / 2);
  const rms = Math.sqrt(sum2 / n);
  return {
    rms,
    rmsDb: rms > 0 ? 20 * Math.log10(rms) : -Infinity,
    highShare: sum2 > 0 ? hi2 / sum2 : 0,
    lowShare: sum2 > 0 ? lo2 / sum2 : 0,
  };
}

await acquireLock(20 * 60 * 1000);
process.on('exit', releaseLock);
const lockRefresher = setInterval(() => { refreshCaptureLock(); }, 60 * 1000);
lockRefresher.unref();

const port = 7600 + Math.floor(Math.random() * 300);
// A private dep cache: node_modules (and its .vite) can be shared between checkouts.
const viteCacheDir = resolve('/tmp', `cot-voice-smoke-vite-${process.pid}`);
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
console.log(`[voice-smoke] vite up at ${url}`);

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
      console.warn(`[voice-smoke] load attempt failed (${err.message}) — retrying`);
      consoleErrors.length = 0;
    }
  }
}

async function bootIntoBattle() {
  await page.mouse.click(640, 360);
  await sleep(300);
  await page.evaluate(() => window.__DEBUG.startBattle('t90m'));
  await page.waitForFunction(
    'window.__COT_AUDIO && window.__COT_AUDIO.ctx && window.__COT_AUDIO.ctx.currentTime > 0',
    { timeout: 20000 },
  ).catch(() => {});
}

await openPage();
let failed = false;
const errors = [];
const report = { languages: {}, played: [] };
const fail = (msg) => { failed = true; errors.push(msg); };
const played = () => page.evaluate(() => window.__COT_AUDIO.voiceLog.map((v) => v.id));
/** Re-emit until the line is in the voice log (probability-gated lines, cooldowns). */
async function untilSaid(ids, emitFn, { attempts = 4, settleMs = 1800, gapMs = 3000 } = {}) {
  for (let i = 0; i < attempts; i++) {
    await emitFn();
    await sleep(settleMs);
    const log = await played();
    if (log.some((id) => ids.includes(id))) return true;
    await sleep(gapMs);
  }
  return false;
}

try {
  await bootIntoBattle();
  // Headless Chrome occasionally has no audio backend — verify the context
  // clock advances, else relaunch headful (same fallback as audio-probe).
  const clockOk = await page.evaluate(async () => {
    const A = window.__COT_AUDIO;
    if (!A || !A.ctx) return false;
    const t0 = A.ctx.currentTime;
    await new Promise((r) => setTimeout(r, 600));
    return A.ctx.currentTime > t0 + 0.2;
  });
  if (!clockOk) {
    console.warn('[voice-smoke] headless AudioContext clock stalled — relaunching headful');
    await browser.close();
    browser = await puppeteer.launch({ headless: false, args: LAUNCH_ARGS });
    consoleErrors.length = 0;
    await openPage();
    await bootIntoBattle();
  }
  const sampleRate = await page.evaluate(() => window.__COT_AUDIO.sampleRate);

  // 1) the national crew
  await page.waitForFunction('window.__COT_AUDIO.voicesLoaded === true', { timeout: 20000 });
  const crew = await page.evaluate(() => window.__COT_AUDIO.crewLanguage);
  console.log(`[voice-smoke] T-90M crew speaks ${crew}`);
  if (crew !== 'ru') fail(`a Russian hull carries a ${crew} crew, expected ru`);

  // 2) battle START through the real game bus (the boot entered battle before
  //    the pack finished decoding, so re-drive the garage→battle edge).
  await page.evaluate(() => {
    const D = window.__DEBUG;
    const enemy = D.game.tanks.find((t) => t.team === 'enemy' && t.state) || {};
    window.__P = {
      playerId: D.game.player ? D.game.player.id : null,
      enemyId: enemy.id || null,
      enemyPos: enemy.state && enemy.state.pos
        ? [enemy.state.pos.x, enemy.state.pos.y + 1.2, enemy.state.pos.z] : [0, 1.2, 0],
      timeS: () => D.game.timeS,
      emit: (ev, p) => D.bus.emit(ev, p),
    };
    window.__P.emit('phase:change', { phase: 'garage' });
    window.__P.emit('ui:battleStart', { specId: 't90m', mapId: null });
    window.__P.emit('phase:change', { phase: 'battle' });
    window.__P.emit('battle:rollout', {});
  });
  await page.waitForFunction('window.__COT_AUDIO.voicesLoaded === true', { timeout: 20000 });
  await sleep(4200);

  // 3) combat lines through the bus. Organic battle chatter can front-run an
  //    id inside its cooldown; that still proves the line plays.
  const SPOTTED = ['enemy_spotted', 'spotted_front', 'spotted_left', 'spotted_right', 'spotted_rear', 'spotted_multiple'];
  if (!await untilSaid(SPOTTED, () => page.evaluate(() => window.__P.emit('tank:spotted',
    { id: window.__P.enemyId, team: 'player', timeS: 1, spotterId: window.__P.playerId })), { gapMs: 8000 })) {
    fail('tank:spotted never produced a spot call');
  }
  if (!await untilSaid(['track_gone'], () => page.evaluate(() => window.__P.emit('module:state',
    { id: window.__P.playerId, module: 'trackL', state: 'red' })), { gapMs: 5000 })) {
    fail('track loss never called');
  }
  if (!await untilSaid(['reloaded'], () => page.evaluate(() => window.__P.emit('player:reload',
    { t: 0, total: 7, kind: 'shell', caliberMm: 125, progress: 1, done: true })))) {
    fail('reload done never called');
  }
  if (!await untilSaid(['sixth_sense'], () => page.evaluate(() => window.__P.emit('player:spotted',
    { timeS: window.__P.timeS() })), { attempts: 2, settleMs: 5200, gapMs: 12000 })) {
    fail('sixth sense never called');
  }
  if (!await untilSaid(['penetration'], () => page.evaluate(() => window.__P.emit('shell:hit', {
    kind: 'pen', pos: window.__P.enemyPos, normal: [0, 1, 0],
    attackerId: window.__P.playerId, targetId: window.__P.enemyId,
    damage: 250, targetHpAfter: 700, targetMaxHp: 1400,
    caliberMm: 125, shellType: 'APFSDS', timeS: window.__P.timeS(), modulesHit: [],
    destroyed: false,
  })), { gapMs: 5000 })) {
    fail('penetration never called');
  }

  // 4) the crew-voice setting switches live.
  await page.evaluate(() => window.__P.emit('ui:volumes', { crewVoice: 'english' }));
  await page.waitForFunction('window.__COT_AUDIO.crewLanguage === "en-US" && window.__COT_AUDIO.voicesLoaded === true', { timeout: 20000 })
    .catch(() => fail('crew voice setting "english" did not switch to en-US'));
  await page.evaluate(() => window.__P.emit('ui:volumes', { crewVoice: 'national' }));
  await page.waitForFunction('window.__COT_AUDIO.crewLanguage === "ru"', { timeout: 5000 })
    .catch(() => fail('crew voice setting "national" did not return to ru'));
  // 4b) the same switch through the real Sound tab: persisted and live.
  const ui = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const S = window.__DEBUG.settings;
    S.open();
    await wait(300);
    const tab = S.root.querySelector('.cot-set-tab[data-tab="sound"]');
    tab?.click();
    await wait(250);
    const english = S.root.querySelector('.cot-set-seg button[data-mode="english"]');
    english?.click();
    await wait(250);
    const stored = JSON.parse(localStorage.getItem('cot.settings.v1') || '{}');
    const lang = window.__COT_AUDIO.crewLanguage;
    S.root.querySelector('.cot-set-seg button[data-mode="national"]')?.click();
    await wait(250);
    const back = window.__COT_AUDIO.crewLanguage;
    const toggles = S.root.querySelectorAll('.cot-set-row').length;
    S.close({ noRelock: true });
    return { found: !!tab && !!english, stored: stored.crewVoice, concussion: stored.audioConcussion, lang, back, toggles };
  });
  report.settingsUi = ui;
  console.log(`[voice-smoke] Sound tab: picker=${ui.found} stored=${ui.stored} lang=${ui.lang} back=${ui.back}`);
  if (!ui.found) fail('Sound tab has no crew-language picker');
  if (ui.stored !== 'english' || ui.lang !== 'en-US') fail(`Sound tab "English" did not persist and switch (stored ${ui.stored}, crew ${ui.lang})`);
  if (ui.back !== 'ru') fail(`Sound tab "National" did not return the crew to ru (${ui.back})`);

  // 5) every pack through the radio chain, isolated from the rest of the mix.
  await page.evaluate(() => window.__P.emit('ui:volumes', { master: 0.8, engine: 0, combat: 0, ambience: 0, ui: 0, voice: 1 }));
  await sleep(600);
  for (const lang of LANGUAGES) {
    await page.evaluate((l) => window.__COT_AUDIO.forceCrewLanguage(l), lang);
    const ok = await page.waitForFunction(
      (l) => window.__COT_AUDIO.crewLanguage === l && window.__COT_AUDIO.voicesLoaded === true,
      { timeout: 20000 }, lang,
    ).then(() => true, () => false);
    if (!ok) { fail(`${lang}: pack did not decode`); continue; }
    await page.evaluate(() => { window.__COT_AUDIO.clearVoiceQueue(); window.__COT_AUDIO.startTap(6); });
    await sleep(120);
    await page.evaluate(() => window.__COT_AUDIO.sayVoice('enemy_spotted'));
    await sleep(2300);
    const n = await page.evaluate(() => window.__COT_AUDIO.stopTap());
    const b64 = await page.evaluate((c) => window.__COT_AUDIO.readTapB64(0, c), n);
    await page.evaluate(() => window.__COT_AUDIO.clearTap());
    const bytes = Buffer.from(b64, 'base64');
    const i16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
    writeWav(join(outDir, `${lang}.wav`), i16, sampleRate);
    const a = analyze(i16, sampleRate);
    const last = await page.evaluate(() => window.__COT_AUDIO.voiceLog.at(-1) || null);
    report.languages[lang] = { rmsDb: +a.rmsDb.toFixed(1), highShare: +a.highShare.toFixed(4), lowShare: +a.lowShare.toFixed(4), line: last };
    console.log(`[voice-smoke] ${lang.padEnd(5)} rms ${a.rmsDb.toFixed(1).padStart(6)} dBFS  >6k ${(a.highShare * 100).toFixed(1)}%  <150 ${(a.lowShare * 100).toFixed(1)}%  ${last ? `${last.id}/${last.lang}` : '(no line)'}`);
    if (!last || last.lang !== lang || last.id !== 'enemy_spotted') fail(`${lang}: the line did not play from its own pack (${last ? `${last.id}/${last.lang}` : 'none'})`);
    if (a.rms < 0.003) fail(`${lang}: radio line inaudible (${a.rmsDb.toFixed(1)} dBFS)`);
    if (a.highShare > 0.06) fail(`${lang}: not band-limited like a radio (${(a.highShare * 100).toFixed(1)}% above 6 kHz)`);
    if (a.lowShare > 0.12) fail(`${lang}: radio low cut missing (${(a.lowShare * 100).toFixed(1)}% below 150 Hz)`);
  }
  await page.evaluate(() => window.__COT_AUDIO.forceCrewLanguage(null));
  await page.evaluate(() => window.__P.emit('ui:volumes', { master: 0.8, engine: 1, combat: 1, ambience: 1, ui: 1, voice: 1 }));
  const library = await page.evaluate(() => window.__COT_AUDIO.library());
  report.library = library;
  if (library.failed) fail(`${library.failed} audio assets failed to decode`);

  // 2b) battle END: victory over the fanfare.
  await page.evaluate(() => window.__P.emit('battle:ended', { result: 'victory', timeS: window.__P.timeS(), map: 'debug' }));
  await page.evaluate(() => window.__P.emit('battle:presented', { result: 'victory' }));
  await sleep(2600);

  const state = await page.evaluate(() => ({
    played: window.__COT_AUDIO.voiceLog.map((v) => v.id),
    ctxState: window.__COT_AUDIO.ctx.state,
    ctxTime: window.__COT_AUDIO.ctx.currentTime,
  }));
  report.played = state.played;
  console.log(`[voice-smoke] ctx=${state.ctxState} t=${state.ctxTime.toFixed(1)}s played: ${state.played.join(', ') || '(none)'}`);
  for (const id of ['battle_start', 'victory']) {
    if (!state.played.includes(id)) fail(`bus event never played voice line: ${id}`);
  }
  if (state.ctxState !== 'running') fail(`AudioContext not running: ${state.ctxState}`);

  // 6) console gate (quarantine the known-unrelated tankFactory wheel-sync)
  const KNOWN_UNRELATED = /syncFromState|multiplyQuaternions|tankFactory\.ts/;
  const audioErrors = consoleErrors.filter((e) => !KNOWN_UNRELATED.test(e));
  const quarantined = consoleErrors.filter((e) => KNOWN_UNRELATED.test(e));
  if (quarantined.length) console.warn(`[voice-smoke] ${quarantined.length} known-unrelated console error(s) quarantined`);
  for (const e of audioErrors) fail(`console: ${e}`);
} catch (err) {
  fail(String(err && err.stack || err));
} finally {
  writeFileSync(join(outDir, 'report.json'), JSON.stringify({ ...report, errors }, null, 2));
  try { await browser.close(); } catch (_) { /* fine */ }
  try { await server.close(); } catch (_) { /* fine */ }
  clearInterval(lockRefresher);
  releaseLock();
}

if (errors.length) {
  console.error('[voice-smoke] ISSUES:');
  for (const e of errors) console.error('  - ' + e);
}
console.log(failed ? '[voice-smoke] FAIL' : '[voice-smoke] GREEN');
process.exit(failed ? 1 : 0);
