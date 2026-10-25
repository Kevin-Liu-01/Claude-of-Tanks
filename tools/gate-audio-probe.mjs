#!/usr/bin/env node
// gate-audio-probe.mjs — the entry gate's first press and the audio device, in headed Chrome (UI-LOCKDOWN E, 2026-10-25).
//
// Main's ruling: on Chromium the gate's press paints first and the AudioContext opens one paint later, inside the
// press's user activation; the press must carry no stall, the console no autoplay warning, and the first sound must
// still play. Each run is a fresh headed browser (a cold audio service, as a first visit meets it) with --mute-audio
// (the device still opens; nothing is audible). Per build, A B B A, one capture ticket:
//   inp        the press's interaction (input to its next paint)
//   longTasks  every long task in the four seconds after the press
//   contexts   each AudioContext built: when (from the press) and its constructor's own time, its state afterwards
//   firstSound the first audio source started (from the press), and how many started
//   console    errors and warnings, the press's four seconds and the boot before it
//
//   node tools/gate-audio-probe.mjs --base=<label>=<url> --base=<label>=<url> --out=<dir> [--runs=4]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createCaptureLock } from './capture-lock.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const bases = argv.filter((a) => a.startsWith('--base=')).map((a) => {
  const value = a.slice(7), at = value.indexOf('=');
  return { label: value.slice(0, at), url: value.slice(at + 1) };
});
if (bases.length !== 2) throw new Error('pass --base=<label>=<url> twice');
const out = resolve(option('out', 'gate-audio-out'));
const runs = Number(option('runs', '4'));

/** Installed before the page's scripts: the gate shows (no webdriver), and the audio graph and timings are recorded. */
const PROBE = `(() => {
  Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
  const rec = window.__gateAudio = { contexts: [], sounds: [], interactions: [], longtasks: [], pressAt: null, gateGoneAt: null };
  const AC = window.AudioContext;
  if (AC) {
    window.AudioContext = function (...args) {
      const t0 = performance.now();
      const context = new AC(...args);
      rec.contexts.push({ at: t0, ms: performance.now() - t0, context, options: JSON.stringify(args[0] ?? null) });
      return context;
    };
    window.AudioContext.prototype = AC.prototype;
  }
  const start = AudioScheduledSourceNode.prototype.start;
  AudioScheduledSourceNode.prototype.start = function (...args) { rec.sounds.push(performance.now()); return start.apply(this, args); };
  new PerformanceObserver((list) => { for (const e of list.getEntries()) if (e.interactionId) rec.interactions.push({ at: e.startTime, ms: e.duration, name: e.name }); })
    .observe({ type: 'event', durationThreshold: 16, buffered: true });
  new PerformanceObserver((list) => { for (const e of list.getEntries()) rec.longtasks.push({ at: e.startTime, ms: e.duration }); })
    .observe({ type: 'longtask', buffered: true });
})();`;

async function probe(base) {
  const browser = await puppeteer.launch({ headless: false, defaultViewport: null,
    args: ['--mute-audio', '--window-size=1440,960', '--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist',
      // the builds are served as cot.test (a non-loopback name, as the other recorders serve them)
      `--host-resolver-rules=MAP ${new URL(base.url).hostname} 127.0.0.1`] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const consoleLog = [];
    page.on('console', (m) => { if (['error', 'warn'].includes(m.type()) && !/Cross-Origin-Opener-Policy header has been ignored/.test(m.text())) consoleLog.push({ type: m.type(), text: m.text().slice(0, 240) }); });
    page.on('pageerror', (e) => consoleLog.push({ type: 'error', text: `pageerror: ${String(e?.message || e).split('\n')[0]}` }));
    await page.evaluateOnNewDocument(PROBE);
    await page.goto(new URL('/', base.url).href, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__GAME_READY === true && document.querySelector('#cot-boot-gate.on'), { timeout: 240000, polling: 200 });
    await new Promise((r) => setTimeout(r, 1500));
    const bootConsole = consoleLog.splice(0);
    await page.evaluate(() => {
      window.__gateAudio.pressAt = performance.now();
      const tick = () => { if (!document.querySelector('#cot-boot-gate.on')) window.__gateAudio.gateGoneAt = performance.now(); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 4000));
    const result = await page.evaluate(() => {
      const rec = window.__gateAudio, from = rec.pressAt, rel = (t) => Math.round(t - from);
      return {
        inp: Math.round(Math.max(0, ...rec.interactions.filter((e) => e.at >= from - 5).map((e) => e.ms))),
        gateGoneMs: rec.gateGoneAt == null ? null : rel(rec.gateGoneAt),
        longTasks: rec.longtasks.filter((t) => t.at >= from - 5).map((t) => ({ at: rel(t.at), ms: Math.round(t.ms) })),
        contexts: rec.contexts.map((c) => ({ at: rel(c.at), ms: Math.round(c.ms), state: c.context.state, options: c.options })),
        firstSoundMs: rec.sounds.find((t) => t >= from) == null ? null : rel(rec.sounds.find((t) => t >= from)),
        soundsStarted: rec.sounds.filter((t) => t >= from).length,
      };
    });
    return { label: base.label, browser: await browser.version(), ...result, console: consoleLog, bootConsole };
  } finally {
    await browser.close().catch(() => {});
  }
}

const lock = createCaptureLock();
mkdirSync(out, { recursive: true });
await lock.acquire(150 * 60 * 1000, { place: 'gate-audio-probe' });
const refresher = setInterval(() => lock.refresh(), 30_000);
refresher.unref();
const results = [];
try {
  for (let i = 0; i < runs; i++) {
    const base = bases[[0, 1, 1, 0][i % 4]];
    const result = await probe(base).catch((error) => ({ label: base.label, error: String(error?.message || error).split('\n')[0] }));
    results.push(result);
    console.log(`${result.label.padEnd(10)} inp ${result.inp ?? '-'} ms  gate gone ${result.gateGoneMs ?? '-'} ms  long ${(result.longTasks ?? []).map((t) => `${t.ms}@${t.at}`).join(' ') || '-'}`
      + `  context ${(result.contexts ?? []).map((c) => `${c.ms} ms @${c.at} ${c.state}`).join(', ') || 'none'}  first sound ${result.firstSoundMs ?? '-'} ms (${result.soundsStarted ?? 0})`
      + `  console ${(result.console ?? []).length}${result.error ? `  ERROR ${result.error}` : ''}`);
  }
} finally {
  clearInterval(refresher);
  await lock.release();
}
writeFileSync(join(out, `gate-audio.${Date.now()}.json`), `${JSON.stringify(results, null, 1)}\n`);
