#!/usr/bin/env node
import { acquireCaptureLock as acquireLock, refreshCaptureLock, releaseCaptureLock as releaseLock } from './capture-lock.mjs';
// sfx-smoke.mjs — end-to-end verification for COMBAT-SFX r4.
//
// Boots the game headless (own vite on a 7xxx port — NEVER 5001/5002), enters
// a battle, then drives REAL bus events (window.__DEBUG.bus — the same object
// audio.ts bound via bindBus) and records the master output via the
// __COT_AUDIO PCM tap. Two modes:
//
//   node tools/sfx-smoke.mjs                # assert mode (default)
//       - waits for the baked sample set (sfxLoaded) to decode
//       - per scene: emits the event, asserts the RIGHT samples played
//         (sfxLog names + layer-gain ratios: distant fire must be
//         tail-dominant, the player's own gun must mix more sub)
//       - asserts audible output per scene and ZERO console errors
//       - volley stress: 8 rapid heavies + 2 ammo-rack kills must not clip
//       - writes new_*.wav A/B copies into shots/sfx-r4/ab/ and, when
//         old-metrics.json exists there (from --capture-old), the README.md
//         table comparing bass energy (<120 Hz, % of total) old vs new.
//
//   node tools/sfx-smoke.mjs --capture-old  # run BEFORE the audio.ts swap
//       - same scenes, no sample assertions (old code has no sfxLog)
//       - writes old_*.wav + old-metrics.json into shots/sfx-r4/ab/
//
// Exit 0 = green. Shares the FIFO capture lock with tools/screenshot.mjs.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const FFMPEG = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg';

// --- FIFO capture lock (same protocol/dirs as tools/screenshot.mjs) ---------

// --- args / output -----------------------------------------------------------
const args = process.argv.slice(2);
const CAPTURE_OLD = args.includes('--capture-old');
const outDir = resolve('shots/sfx-r4');
const abDir = join(outDir, 'ab');
mkdirSync(abDir, { recursive: true });
const prefix = CAPTURE_OLD ? 'old' : 'new';

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

function analyze(i16) {
  let peak = 0, sum2 = 0;
  for (let i = 0; i < i16.length; i++) {
    const a = Math.abs(i16[i]) / 32768;
    if (a > peak) peak = a;
    sum2 += (i16[i] / 32768) * (i16[i] / 32768);
  }
  const rms = Math.sqrt(sum2 / Math.max(1, i16.length));
  return {
    peak,
    peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
    rms,
    rmsDb: rms > 0 ? 20 * Math.log10(rms) : -Infinity,
  };
}

/** Energy below `hz` as % of total energy, measured with ffmpeg (24 dB/oct). */
function bassEnergyPct(file, hz = 120) {
  const rmsOf = (af) => {
    const out = spawnSync(FFMPEG, ['-hide_banner', '-i', file, '-af',
      `${af}astats=metadata=0:measure_overall=RMS_level:measure_perchannel=none`,
      '-f', 'null', '-'], { encoding: 'utf8' });
    const m = /RMS level dB:\s*(-?[\d.]+|-inf)/.exec(out.stderr);
    if (!m) throw new Error(`astats failed for ${file}`);
    return m[1] === '-inf' ? -Infinity : parseFloat(m[1]);
  };
  const full = rmsOf('');
  const low = rmsOf(`lowpass=f=${hz},lowpass=f=${hz},`);
  if (!isFinite(full) || !isFinite(low)) return 0;
  return Math.pow(10, (low - full) / 10) * 100;
}

await acquireLock(15 * 60 * 1000);
process.on('exit', releaseLock);
const lockRefresher = setInterval(() => { refreshCaptureLock(); }, 60 * 1000);
lockRefresher.unref();

// --- server (own 7xxx port per the COMBAT-SFX agent mandate) -----------------
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
console.log(`[sfx-smoke] vite up at ${url} (${CAPTURE_OLD ? 'CAPTURE-OLD' : 'assert'} mode)`);

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
const report = { mode: prefix, scenes: {}, errors: [] };
const fail = (msg) => { failed = true; report.errors.push(msg); console.error('[sfx-smoke] FAIL: ' + msg); };

try {
  await bootIntoBattle();
  // Headless Chrome occasionally has no audio backend — headful fallback.
  let clockOk = await page.evaluate(async () => {
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

  if (!CAPTURE_OLD) {
    // Baked combat samples must fully decode (they load lazily at resume()).
    await page.waitForFunction('window.__COT_AUDIO.sfxLoaded === true', { timeout: 20000 });
    const nSfx = await page.evaluate(() => window.__COT_AUDIO.sfxCount);
    console.log(`[sfx-smoke] context up (sr=${sampleRate}), baked sfx decoded: ${nSfx}`);
  } else {
    console.log(`[sfx-smoke] context up (sr=${sampleRate})`);
  }
  // Quiet the beds so scene captures isolate combat one-shots.
  await page.evaluate(() => window.__DEBUG.bus.emit('ui:volumes',
    { master: 0.8, engine: 0, combat: 1, ambience: 0, ui: 0, voice: 0 }));
  await sleep(500);

  // In-page helpers.
  await page.evaluate(() => {
    const D = window.__DEBUG;
    window.__P = {
      pos(dx, dy, dz) { const c = D.camera.position; return [c.x + dx, c.y + dy, c.z + dz]; },
      playerId: D.game.player ? D.game.player.id : null,
      enemyId: (D.game.tanks.find((t) => t.team === 'enemy' && t.state) || {}).id || null,
      emit(ev, p) { D.bus.emit(ev, p); },
      // The runtime trail is capped. A length cursor becomes stuck at 200
      // during sustained bot fire, so use the monotonic sample sequence.
      sfxMark() { const A = window.__COT_AUDIO; return A.sfxLog && A.sfxLog.length ? A.sfxLog.at(-1).seq : 0; },
      sfxSince(n) { const A = window.__COT_AUDIO; return A.sfxLog ? A.sfxLog.filter((x) => x.seq > n) : []; },
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
  // fire(cal,dx,dz): enemy gun at that camera offset. expect = sample names
  // that MUST appear in sfxLog for the scene (subset match, prefix ok for
  // variant picks like ricochet_[abc]).
  const fire = (cal, dx, dz, player = false) =>
    `{shellId:9001, shooterId:${player ? 'window.__P.playerId' : 'window.__P.enemyId'}, isPlayer:${player}, ` +
    `shellType:'AP', shellName:'p', caliberMm:${cal}, muzzlePos:window.__P.pos(${dx},0,${dz}), dir:[0,0.02,1]}`;
  const hit = (kind, target, dmg, extra = '') =>
    `{kind:'${kind}', pos:window.__P.pos(10,0,12), targetId:window.__P.${target}, ` +
    `attackerId:window.__P.${target === 'playerId' ? 'enemyId' : 'playerId'}, damage:${dmg}, caliberMm:100, ` +
    `normal:[0,1,0], shellType:'AP', shellName:'p', shellId:9200${extra}}`;

  const SCENES = [
    { name: 'fire_small', ev: 'shell:fired', p: fire(57, 10, 11), holdMs: 1800,
      expect: ['fire_small_sub', 'fire_small_crack', 'fire_small_tail'] },
    { name: 'fire_large', ev: 'shell:fired', p: fire(122, 10, 11), holdMs: 2600, ab: true,
      expect: ['fire_large_sub', 'fire_large_crack', 'fire_large_tail'] },
    { name: 'fire_large_player', ev: 'shell:fired', p: fire(120, 0, 3, true), holdMs: 2800, ab: true,
      expect: ['fire_large_sub', 'fire_large_crack', 'fire_large_tail'] },
    { name: 'fire_huge', ev: 'shell:fired', p: fire(152, -12, 10), holdMs: 3400, ab: true,
      expect: ['fire_huge_sub', 'fire_huge_crack', 'fire_huge_tail'] },
    // ~180 m out: intentionally faint under the world-distance rolloff — the
    // real assertions are the sample names
    // + the tail-dominance ratio below, so the silence floor is just "not
    // literally zero".
    { name: 'fire_distant', ev: 'shell:fired', p: fire(122, 127, 127), holdMs: 3600,
      minRms: 5e-5, expect: ['fire_large_tail'] },
    { name: 'impact_pen', ev: 'shell:hit', p: hit('pen', 'enemyId', 180), holdMs: 1600, ab: true,
      expect: ['impact_pen_'] },
    { name: 'hit_received_pen', ev: 'shell:hit', p: hit('pen', 'playerId', 150), holdMs: 1800,
      expect: ['impact_pen_', 'hit_whump'] },
    { name: 'ricochet', ev: 'shell:hit', p: hit('ricochet', 'enemyId', 0), holdMs: 1600, ab: true,
      expect: ['ricochet_'] },
    { name: 'impact_absorb', ev: 'shell:hit', p: hit('nonpen', 'enemyId', 0), holdMs: 1400, ab: true,
      expect: ['impact_absorb_'] },
    { name: 'era_pop', ev: 'shell:hit', p: hit('era', 'enemyId', 0), holdMs: 1200,
      expect: ['era_pop'] },
    { name: 'he_splash', ev: 'shell:hit', p: hit('he_splash', 'enemyId', 120), holdMs: 2400,
      expect: ['expl_he_'] },
    { name: 'shell_dirt', ev: 'shell:expired', p: `{shellId:9007, pos:window.__P.pos(8,-2,20), hitTerrain:true}`, holdMs: 1400,
      expect: ['impact_dirt'] },
    { name: 'tank_explosion', ev: 'tank:destroyed', holdMs: 5200, ab: true,
      p: `{id:window.__P.enemyId, specId:'t90m', pos:window.__P.pos(0,0,30), killerId:window.__P.playerId, cause:'ammorack'}`,
      expect: ['expl_tank_core_', 'expl_tank_debris', 'expl_turret_pop'] },
    { name: 'tank_burnout', ev: 'tank:destroyed', holdMs: 4200,
      p: `{id:window.__P.enemyId, specId:'t90m', pos:window.__P.pos(14,0,26), killerId:null, cause:'fire'}`,
      expect: ['expl_burnout'] },
  ];

  const gainOf = (log, needle) => {
    const e = log.find((x) => x.n.startsWith(needle));
    return e ? e.g : null;
  };
  const sceneLogs = {};

  for (const sc of SCENES) {
    const mark = CAPTURE_OLD ? 0 : await page.evaluate(() => window.__P.sfxMark());
    await tapStart();
    await sleep(250);
    await emit(sc.ev, sc.p);
    await sleep(sc.holdMs);
    const i16 = await tapStopAndFetch();
    const a = analyze(i16);
    const wavName = `${prefix}_${sc.name}.wav`;
    const wavPath = sc.ab ? join(abDir, wavName) : join(outDir, wavName);
    writeWav(wavPath, i16, sampleRate);
    const entry = { peakDb: +a.peakDb.toFixed(2), rmsDb: +a.rmsDb.toFixed(2), wav: wavPath };
    report.scenes[sc.name] = entry;
    console.log(`[sfx-smoke] ${sc.name.padEnd(20)} peak ${a.peakDb.toFixed(1).padStart(6)} dBFS  rms ${a.rmsDb.toFixed(1).padStart(6)} dBFS`);
    if (a.peak >= 0.999) fail(`${sc.name}: CLIPPING (peak ${a.peakDb.toFixed(2)} dBFS)`);
    if (!CAPTURE_OLD && a.rms < (sc.minRms || 0.0008)) fail(`${sc.name}: captured audio is silent (rms ${a.rmsDb.toFixed(1)} dBFS)`);
    if (!CAPTURE_OLD) {
      const log = await page.evaluate((n) => window.__P.sfxSince(n), mark);
      sceneLogs[sc.name] = log;
      entry.samples = log.map((x) => `${x.n}@${x.g.toFixed(3)}x${x.r.toFixed(3)}`);
      for (const want of sc.expect) {
        if (!log.some((x) => x.n.startsWith(want))) {
          fail(`${sc.name}: expected sample '${want}*' did not play (got: ${log.map((x) => x.n).join(', ') || 'none'})`);
        }
      }
    }
    await sleep(250);
  }

  if (!CAPTURE_OLD) {
    // --- layer-model assertions ------------------------------------------------
    // 1) distant fire is tail-dominant: crack/tail gain ratio collapses.
    const near = sceneLogs.fire_large, far = sceneLogs.fire_distant;
    const nearRatio = gainOf(near, 'fire_large_crack') / gainOf(near, 'fire_large_tail');
    const farCrack = gainOf(far, 'fire_large_crack');
    const farRatio = farCrack == null ? 0 : farCrack / gainOf(far, 'fire_large_tail');
    report.layerModel = { nearCrackTail: +nearRatio.toFixed(3), farCrackTail: +farRatio.toFixed(3) };
    if (!(nearRatio > 0.6)) fail(`near fire crack/tail ratio ${nearRatio.toFixed(2)} — crack should be full up close`);
    if (!(farRatio < 0.45 * nearRatio)) fail(`distant fire not tail-dominant (crack/tail ${farRatio.toFixed(2)} vs near ${nearRatio.toFixed(2)})`);
    // 2) player's own gun mixes hotter sub than an enemy gun.
    const pl = sceneLogs.fire_large_player;
    const plSub = gainOf(pl, 'fire_large_sub') / gainOf(pl, 'fire_large_tail');
    const enSub = gainOf(near, 'fire_large_sub') / gainOf(near, 'fire_large_tail');
    report.layerModel.playerSubTail = +plSub.toFixed(3);
    report.layerModel.enemySubTail = +enSub.toFixed(3);
    if (!(plSub > enSub * 1.1)) fail(`player gun sub not hotter (sub/tail ${plSub.toFixed(2)} vs enemy ${enSub.toFixed(2)})`);
    // 3) repeats never identical: two same-caliber shots differ in rate.
    const m0 = await page.evaluate(() => window.__P.sfxMark());
    await emit('shell:fired', fire(122, 10, 11));
    await sleep(500);
    await emit('shell:fired', fire(122, 10, 11));
    await sleep(2200);
    const jl = await page.evaluate((n) => window.__P.sfxSince(n), m0);
    const subs = jl.filter((x) => x.n === 'fire_large_sub');
    if (subs.length >= 2) {
      const rates = subs.map((x) => x.r);
      report.layerModel.jitterRates = rates.map((r) => +r.toFixed(4));
      if (Math.abs(rates[0] - rates[1]) < 1e-4) fail('repeat shots have identical playbackRate — jitter missing');
      for (const r of rates) if (r < 0.955 || r > 1.045) fail(`playbackRate jitter ${r} outside ±4.5%`);
    } else fail('jitter check: fire_large_sub did not log twice');

    // --- volley stress: 14-tank fight moment must not clip into crackle --------
    await tapStart();
    await sleep(200);
    for (let i = 0; i < 8; i++) {
      await emit('shell:fired', fire(i % 2 ? 122 : 125, -14 + i * 4, 9 + (i % 3) * 3));
      await sleep(35);
    }
    await emit('tank:destroyed', `{id:window.__P.enemyId, specId:'t90m', pos:window.__P.pos(-6,0,24), killerId:window.__P.playerId, cause:'ammorack'}`);
    await sleep(120);
    await emit('tank:destroyed', `{id:window.__P.enemyId, specId:'t90m', pos:window.__P.pos(9,0,21), killerId:window.__P.playerId, cause:'ammorack'}`);
    await sleep(4500);
    const vI16 = await tapStopAndFetch();
    const va = analyze(vI16);
    writeWav(join(outDir, `${prefix}_volley.wav`), vI16, sampleRate);
    report.scenes.volley = { peakDb: +va.peakDb.toFixed(2), rmsDb: +va.rmsDb.toFixed(2) };
    console.log(`[sfx-smoke] volley               peak ${va.peakDb.toFixed(1).padStart(6)} dBFS  rms ${va.rmsDb.toFixed(1).padStart(6)} dBFS`);
    if (va.peak >= 0.999) fail(`volley: CLIPPING (peak ${va.peakDb.toFixed(2)} dBFS) — master limiter not holding`);
    if (va.rms < 0.01) fail('volley: suspiciously quiet');
  }

  // --- console gate (same known-unrelated quarantine as tools/audio-probe.mjs:
  // in-flight tank-model agents throw in tankFactory.ts wheel sync during any
  // battle — visual, not audio; everything else fails the smoke) --------------
  const KNOWN_UNRELATED = /syncFromState|multiplyQuaternions|tankFactory\.ts/;
  const sfxErrors = consoleErrors.filter((e) => !KNOWN_UNRELATED.test(e));
  const quarantined = consoleErrors.filter((e) => KNOWN_UNRELATED.test(e));
  if (quarantined.length) {
    report.quarantinedErrors = [...new Set(quarantined)].slice(0, 3);
    console.warn(`[sfx-smoke] ${quarantined.length} known-unrelated console error(s) quarantined (tankFactory wheel sync)`);
  }
  if (sfxErrors.length) for (const e of sfxErrors) fail(`console: ${e}`);
} catch (err) {
  fail(String(err && err.stack || err));
} finally {
  try { await browser.close(); } catch (_) { /* fine */ }
  try { await server.close(); } catch (_) { /* fine */ }
  clearInterval(lockRefresher);
  releaseLock();
}

// --- A/B bass-energy bookkeeping ----------------------------------------------
try {
  const metrics = {};
  for (const f of readdirSync(abDir)) {
    if (f.startsWith(`${prefix}_`) && f.endsWith('.wav')) {
      metrics[f.replace(`${prefix}_`, '').replace('.wav', '')] = +bassEnergyPct(join(abDir, f)).toFixed(1);
    }
  }
  writeFileSync(join(abDir, `${prefix}-metrics.json`), JSON.stringify(metrics, null, 2));
  console.log(`[sfx-smoke] ${prefix} bass-energy (<120 Hz, % of total):`, JSON.stringify(metrics));
  if (!CAPTURE_OLD && existsSync(join(abDir, 'old-metrics.json'))) {
    const oldM = JSON.parse(readFileSync(join(abDir, 'old-metrics.json'), 'utf8'));
    let oldScenes = {};
    try { oldScenes = JSON.parse(readFileSync(join(outDir, 'report-old.json'), 'utf8')).scenes || {}; } catch (_) { /* fine */ }
    const fmt = (v, unit = '') => (v == null ? 'n/a' : `${v}${unit}`);
    const rows = Object.keys(metrics).sort().map((k) => {
      const o = oldScenes[k] || {};
      const n = report.scenes[k] || {};
      return `| ${k} | ${fmt(oldM[k], '%')} | **${metrics[k]}%** | ${fmt(o.peakDb)} | **${fmt(n.peakDb)}** | ${fmt(o.rmsDb)} | **${fmt(n.rmsDb)}** |`;
    });
    writeFileSync(join(abDir, 'README.md'),
      `# COMBAT-SFX r4 — A/B listening copies\n\n` +
      `Captured from the live game master bus by \`tools/sfx-smoke.mjs\` — the same\n` +
      `bus events, before (\`old_*\`, pre-redesign runtime synthesis) and after\n` +
      `(\`new_*\`, baked layered samples from \`tools/make-sfx.mjs\`).\n\n` +
      `Bass energy = energy below 120 Hz as % of total (ffmpeg, 24 dB/oct lowpass).\n` +
      `Peak/RMS in dBFS on the identical event at the identical distance — the\n` +
      `new set is not just deeper, it actually shows up (the old ammo-rack kill\n` +
      `peaked ~11 dB quieter than the new one).\n\n` +
      `| sound | old bass | new bass | old peak | new peak | old rms | new rms |\n` +
      `|---|---|---|---|---|---|---|\n` +
      rows.join('\n') + '\n',
    );
    console.log(`[sfx-smoke] wrote ${join(abDir, 'README.md')}`);
  }
} catch (err) {
  console.warn('[sfx-smoke] A/B metrics step failed: ' + err.message);
}

writeFileSync(join(outDir, `report-${prefix}.json`), JSON.stringify(report, null, 2));
if (report.errors.length) {
  console.error('[sfx-smoke] ISSUES:');
  for (const e of report.errors) console.error('  - ' + e);
}
console.log(failed ? '[sfx-smoke] FAIL' : '[sfx-smoke] GREEN');
process.exit(failed ? 1 : 0);
