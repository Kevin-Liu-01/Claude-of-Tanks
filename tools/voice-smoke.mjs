#!/usr/bin/env node
// voice-smoke.mjs — play-path smoke for the announcer voice set (VOICE r2).
//
// Boots the game headless on its OWN vite (7xxx port — never 5001/5002),
// resumes audio, and verifies the shipped voice payload end-to-end in the
// real engine path:
//   1. every file in src/audio/voices.ts decodes in WebAudio (radio.load
//      warns + mutes on any failure — that warning fails this probe),
//   2. the battle ENVELOPE plays through the game BUS: a re-driven
//      garage→battle phase edge must announce battle_start (the r2
//      listen-only wiring in voices.ts), and 'battle:ended' {victory} must
//      announce victory over the fanfare,
//   3. five combat event lines driven through the BUS actually reach the
//      radio and play (voiceLog) — spotting, track damage, reload-done,
//      sixth sense (player:spotted) and a player penetration (shell:hit) —
//      with the AudioContext clock advancing,
//   4. zero page console errors (known-unrelated tankFactory wheel-sync
//      errors quarantined, same as tools/audio-probe.mjs).
//
// Shares the FIFO capture lock with tools/screenshot.mjs so parallel
// harnesses never contend for the GPU. Exit 0 = green.
//
// Usage: node tools/voice-smoke.mjs

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, rmdirSync, statSync, writeFileSync, readdirSync, unlinkSync, utimesSync } from 'node:fs';
import { join } from 'node:path';

// --- FIFO capture lock (same protocol/dirs as tools/screenshot.mjs) ---------
const LOCK_DIR = '/tmp/cot-shots.lock';
const QUEUE_DIR = '/tmp/cot-shots.queue';
const LOCK_STALE_MS = 5 * 60 * 1000;
const TICKET_STALE_MS = 60 * 60 * 1000;
let lockHeld = false;
function ticketPid(name) {
  const m = name.match(/-(\d+)\.t$/);
  return m ? parseInt(m[1], 10) : -1;
}
function ticketAlive(name) {
  const pid = ticketPid(name);
  if (pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}
async function acquireLock(timeoutMs) {
  mkdirSync(QUEUE_DIR, { recursive: true });
  const myTicket = `${String(Date.now()).padStart(15, '0')}-${process.pid}.t`;
  writeFileSync(join(QUEUE_DIR, myTicket), String(process.pid));
  const t0 = Date.now();
  try {
    for (;;) {
      let head = null;
      let names = [];
      try { names = readdirSync(QUEUE_DIR).filter((n) => n.endsWith('.t')).sort(); } catch (_) { names = [myTicket]; }
      for (const n of names) {
        if (n === myTicket) { head = head || n; break; }
        let stale = false;
        try { stale = Date.now() - statSync(join(QUEUE_DIR, n)).mtimeMs > TICKET_STALE_MS; } catch (_) { continue; }
        if (stale || !ticketAlive(n)) { try { unlinkSync(join(QUEUE_DIR, n)); } catch (_) { /* raced */ } continue; }
        head = n; break;
      }
      if (head === myTicket) {
        try { mkdirSync(LOCK_DIR); lockHeld = true; return; } catch (_) { /* held */ }
        try {
          if (Date.now() - statSync(LOCK_DIR).mtimeMs > LOCK_STALE_MS) { try { rmdirSync(LOCK_DIR); } catch (e) { if (e.code === 'ENOTDIR') unlinkSync(LOCK_DIR); else throw e; } continue; }
        } catch (_) { continue; }
      }
      if (Date.now() - t0 > timeoutMs) throw new Error('cot-shots lock timeout');
      await new Promise((r) => setTimeout(r, head === myTicket ? 300 : 1000));
    }
  } finally {
    try { unlinkSync(join(QUEUE_DIR, myTicket)); } catch (_) { /* fine */ }
  }
}
function releaseLock() {
  if (!lockHeld) return;
  lockHeld = false;
  try { rmdirSync(LOCK_DIR); } catch (_) { /* fine */ }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await acquireLock(20 * 60 * 1000);
process.on('exit', releaseLock);
const lockRefresher = setInterval(() => {
  try { const now = new Date(); utimesSync(LOCK_DIR, now, now); } catch (_) { /* fine */ }
}, 60 * 1000);
lockRefresher.unref();

const port = 7600 + Math.floor(Math.random() * 300);
const server = await createServer({
  root: process.cwd(),
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
const consoleWarns = [];
async function openPage() {
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) consoleErrors.push(msg.text());
    if (msg.type() === 'warning') consoleWarns.push(msg.text());
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
  await page.evaluate(() => window.__DEBUG.startBattle('m1a2'));
  await page.waitForFunction(
    'window.__COT_AUDIO && window.__COT_AUDIO.ctx && window.__COT_AUDIO.ctx.currentTime > 0',
    { timeout: 20000 },
  ).catch(() => {});
}

await openPage();
let failed = false;
const errors = [];
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
    consoleWarns.length = 0;
    await openPage();
    await bootIntoBattle();
  }

  // 1) every voice file decoded (radio.load mutes failures with ONE warning)
  await page.waitForFunction('window.__COT_AUDIO.voicesLoaded === true', { timeout: 20000 });
  const muteWarn = consoleWarns.find((w) => w.includes('crew voice line'));
  if (muteWarn) { failed = true; errors.push(`WebAudio decode failure: "${muteWarn}"`); }
  console.log('[voice-smoke] voices loaded, decode warnings:', muteWarn ? muteWarn : 'none');

  // 2) battle START through the real game bus. The live boot entered battle
  //    via __DEBUG.startBattle before the voice payload finished decoding, so
  //    re-drive the garage→battle phase edge (all real bus events — audio.ts
  //    replays the horn, the r2 voices.ts wiring announces battle_start).
  await page.evaluate(() => {
    const D = window.__DEBUG;
    const playerId = D.game.player ? D.game.player.id : null;
    const enemy = D.game.tanks.find((t) => t.team === 'enemy' && t.state) || {};
    window.__P = {
      playerId,
      enemyId: enemy.id || null,
      enemyPos: enemy.state && enemy.state.pos
        ? [enemy.state.pos.x, enemy.state.pos.y + 1.2, enemy.state.pos.z] : [0, 1.2, 0],
      timeS: () => D.game.timeS,
      emit: (ev, p) => D.bus.emit(ev, p),
    };
    window.__P.emit('phase:change', { phase: 'garage' });
    window.__P.emit('ui:battleStart', { specId: 'm1a2', mapId: null });
    window.__P.emit('phase:change', { phase: 'battle' });
    window.__P.emit('battle:rollout', {});
  });
  await sleep(4200); // battle_start + audio.ts's own on_the_move follow-up drain

  // 3) five combat event lines through the bus (2 s gaps: every asserted line
  //    is ≤1.6 s + the 0.3 s radio gap). Organic battle chatter can front-run
  //    an id inside its cooldown — that still proves the line plays, so the
  //    assertion below checks the whole voiceLog, not per-emit responses.
  await page.evaluate(() => window.__P.emit('tank:spotted',
    { id: window.__P.enemyId, team: 'player', timeS: 1, spotterId: window.__P.playerId }));
  await sleep(2000);
  await page.evaluate(() => window.__P.emit('module:state',
    { id: window.__P.playerId, module: 'trackL', state: 'red' }));
  await sleep(2000);
  await page.evaluate(() => window.__P.emit('player:reload', { t: 0, total: 7, done: true }));
  await sleep(2000);
  await page.evaluate(() => window.__P.emit('player:spotted', { timeS: window.__P.timeS() }));
  await sleep(6000); // 3 s fuse + full warning line before lower-priority shot result
  // player pen on the enemy — full payload so every shell:hit listener
  // (fx impact/decals need pos+normal, shot-info stats, hud damage number)
  // takes its real path.
  await page.evaluate(() => window.__P.emit('shell:hit', {
    kind: 'pen', pos: window.__P.enemyPos, normal: [0, 1, 0],
    attackerId: window.__P.playerId, targetId: window.__P.enemyId,
    damage: 250, targetHpAfter: 700, targetMaxHp: 1400,
    caliberMm: 120, shellType: 'AP', timeS: window.__P.timeS(), modulesHit: [],
    destroyed: false,
  }));
  await sleep(2000);

  // 4) battle END: victory result over the fanfare.
  await page.evaluate(() => window.__P.emit('battle:ended',
    { result: 'victory', timeS: window.__P.timeS(), map: 'debug' }));
  await page.evaluate(() => window.__P.emit('battle:presented', { result: 'victory' }));
  await sleep(2600);

  const state = await page.evaluate(() => ({
    played: window.__COT_AUDIO.voiceLog.map((v) => v.id),
    ctxState: window.__COT_AUDIO.ctx.state,
    ctxTime: window.__COT_AUDIO.ctx.currentTime,
  }));
  console.log(`[voice-smoke] ctx=${state.ctxState} t=${state.ctxTime.toFixed(1)}s played: ${state.played.join(', ') || '(none)'}`);
  for (const id of ['battle_start', 'enemy_spotted', 'track_gone', 'reloaded',
    'sixth_sense', 'penetration', 'victory']) {
    if (!state.played.includes(id)) { failed = true; errors.push(`bus event never played voice line: ${id}`); }
  }
  if (state.ctxState !== 'running') { failed = true; errors.push(`AudioContext not running: ${state.ctxState}`); }

  // 5) console gate (quarantine the known-unrelated tankFactory wheel-sync)
  const KNOWN_UNRELATED = /syncFromState|multiplyQuaternions|tankFactory\.ts/;
  const audioErrors = consoleErrors.filter((e) => !KNOWN_UNRELATED.test(e));
  const quarantined = consoleErrors.filter((e) => KNOWN_UNRELATED.test(e));
  if (quarantined.length) console.warn(`[voice-smoke] ${quarantined.length} known-unrelated console error(s) quarantined`);
  if (audioErrors.length) { failed = true; errors.push(...audioErrors.map((e) => `console: ${e}`)); }
} catch (err) {
  failed = true;
  errors.push(String(err && err.stack || err));
} finally {
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
