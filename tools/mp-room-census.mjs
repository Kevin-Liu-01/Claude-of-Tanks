#!/usr/bin/env node
// mp-room-census.mjs — UI-LOCKDOWN E's console census for the rooms flow (2026-10-25).
// Copyright (c) 2026 Kevin B. Liu. First-party tool; see NOTICE.md.
//
// Two first-time browsers on a built dist, and one in-process room host (server/rooms/serve.ts, the LAN helper's
// composition) on the port a local page looks for it on (127.0.0.1:8792, src/mp/session/endpoint.ts):
// - A creates a LAN room from the Garage;
// - B opens the invite and joins;
// - both ready, and A starts;
// - both reach the battle, then both leave to the Garage.
// Each stage records both pages' console errors (page errors and failed requests included) and warnings as a
// click-timeline census sample (kind lobby-<stage>: the 'rooms' surface) in <out>/<label>/mp-room.desktop.json, which
// check:frontend scores (a console error anywhere in the flow is a miss for premiere-site). The run exits non-zero on
// any console error.
//
//   node tools/mp-room-census.mjs --dist=<dir> --label=<label> --out=<dir> [--lock] [--budget-min=20]
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createRoomsServer } from '../server/rooms/serve.ts';
import { LAN_ROOMS_PORT } from '../src/mp/session/endpoint.ts';
import { createCaptureLock } from './capture-lock.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const dist = resolve(option('dist', 'dist'));
const label = option('label', 'build');
const out = resolve(option('out', 'mp-room-census'));
const useLock = argv.includes('--lock');
const budgetMin = Number(option('budget-min', '20'));
// --map=<id>: the room's battlefield (the lobby's map control, set by the host); without it the room keeps its default
const mapId = option('map', '');
const root = new URL('..', import.meta.url).pathname;
const BOOT_QUERY = 'nosplash=1&tier=desktop&gfxreset=1';
// the deployment's own headers on a plain-http host
const IGNORED = /Cross-Origin-Opener-Policy header has been ignored|origin-agent-cluster/i;

function freePort() {
  return new Promise((done, fail) => {
    const probe = net.createServer();
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)); });
  });
}
function portFree(port) {
  return new Promise((done) => {
    const probe = net.createServer();
    probe.once('error', () => done(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)));
  });
}

/** Each page's console since the last stage: errors (with page errors and failed requests) and warnings. */
function observe(page, name, log) {
  page.on('console', async (m) => {
    if (IGNORED.test(m.text())) return;
    // an Error logged with the message travels as an argument: its stack names where the entry failed
    if (m.type() === 'error') {
      log.errors.push(`${name}: ${m.text().slice(0, 240)}`);
      for (const arg of m.args()) {
        const stack = await arg.evaluate((value) => (value instanceof Error ? value.stack : null)).catch(() => null);
        if (stack) log.errors.push(`${name}:   stack ${stack.split('\n').slice(0, 9).join(' | ').slice(0, 900)}`);
      }
    }
    else if (m.type() === 'warn') log.warnings.push(`${name}: ${m.text().slice(0, 240)}`);
  });
  page.on('pageerror', (e) => log.errors.push(`${name}: pageerror ${String(e?.message || e).split('\n')[0]}`));
  page.on('requestfailed', (r) => { if (!/net::ERR_ABORTED/.test(r.failure()?.errorText ?? '')) log.errors.push(`${name}: request failed ${r.url()} ${r.failure()?.errorText ?? ''}`); });
  page.on('response', (r) => { if (r.status() >= 400) log.errors.push(`${name}: ${r.status()} ${r.url()}`); });
}

const samples = [];
const log = { errors: [], warnings: [] };
const stage = (name, startedAt) => {
  samples.push({ kind: `lobby-${name}`, census: { consoleErrors: log.errors.splice(0), consoleWarnings: log.warnings.length,
    consoleWarningTexts: log.warnings.splice(0) }, wallMs: Math.round(performance.now() - startedAt) });
  const last = samples.at(-1).census;
  console.log(`lobby-${name.padEnd(8)} ${String(last.consoleErrors.length).padStart(2)} errors ${String(last.consoleWarnings).padStart(2)} warnings`
    + `${last.consoleErrors.length ? `\n    ${last.consoleErrors.join('\n    ')}` : ''}`);
};

const lock = useLock ? createCaptureLock() : null;
let rooms = null, server = null, browser = null, pages = [];
try {
  if (lock) {
    await lock.acquire(150 * 60 * 1000, { place: `mp-room-census-${label}` });
    setInterval(() => lock.refresh(), 30_000).unref();
    setTimeout(() => { console.error(`mp-room-census: past its ${budgetMin} min budget`); process.exit(3); }, budgetMin * 60_000).unref();
  }
  if (!await portFree(LAN_ROOMS_PORT)) throw new Error(`port ${LAN_ROOMS_PORT} (the LAN room helper's) is in use`);
  rooms = await createRoomsServer({ host: '127.0.0.1', port: LAN_ROOMS_PORT, seatSecret: randomBytes(24).toString('hex'), world: 'terrain' });
  const port = await freePort();
  server = spawn(process.execPath, [join(root, 'tools/vercel-static-preview.mjs'), `--dist=${dist}`, `--port=${port}`], { stdio: 'ignore' });
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100 && !await fetch(origin).then(() => true, () => false); i++) await new Promise((r) => setTimeout(r, 100));

  browser = await puppeteer.launch({ headless: true, protocolTimeout: 360_000,
    args: ['--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      '--use-gl=angle', '--enable-webgl', '--js-flags=--max-old-space-size=3072', '--window-size=1100,720'] });
  // two first-time machines: separate contexts share no storage, cache or player identity
  const [pageA, pageB] = await Promise.all([1, 2].map(async () => (await browser.createBrowserContext()).newPage()));
  pages = [pageA, pageB];
  for (const page of [pageA, pageB]) await page.setViewport({ width: 1024, height: 640, deviceScaleFactor: 1 });
  observe(pageA, 'A', log);
  observe(pageB, 'B', log);
  const garage = () => window.__GAME_READY === true && window.__DEBUG?.game?.phase === 'garage';
  const inBattle = () => window.__MULTIPLAYER_V2?.stats?.().inMatch === true && window.__DEBUG?.game?.phase === 'battle'
    && getComputedStyle(document.querySelector('.cot-bl')).display === 'none';

  let at = performance.now();
  await pageA.goto(`${origin}/?${BOOT_QUERY}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await pageA.waitForFunction(garage, { timeout: 240_000, polling: 100 });
  stage('boot', at);

  at = performance.now();
  // the rooms open from Deploy's room tabs on every layout (the Garage's own entry button hides where the panels persist)
  const visible = (selector) => pageA.evaluate((sel) => [...document.querySelectorAll(sel)].some((el) => el.checkVisibility?.() ?? el.offsetParent !== null), selector);
  if (await visible('.cot-multiplayer-entry')) await pageA.click('.cot-multiplayer-entry');
  else {
    await pageA.evaluate(() => {
      const open = [...document.querySelectorAll('[data-nav=deploy], .cot-battle-mode')].find((el) => el.checkVisibility?.() ?? el.offsetParent !== null);
      open?.click();
    });
    await pageA.waitForSelector('#cot-battle-menu.open [data-deploy-room="lan"]', { timeout: 30_000 });
    await pageA.evaluate(() => document.querySelector('#cot-battle-menu [data-deploy-room="lan"]')?.click());
  }
  await pageA.waitForSelector('.cot-play.show .modes [data-mode="lan"]', { timeout: 30_000 });
  await pageA.click('.cot-play .modes [data-mode="lan"]');
  await pageA.evaluate(() => {
    const name = document.querySelector('.cot-play [data-field="name"]');
    if (name) name.value = 'Alpha Lead';
    const size = document.querySelector('.cot-play [data-field="create-size"]');
    if (size) size.value = '2';
  });
  await pageA.click('.cot-play [data-action="create"]');
  await pageA.waitForFunction(() => document.querySelector('.cot-play .lobby')?.classList.contains('show') && /[?&]room=[A-Z0-9]{6}/.test(location.search), { timeout: 30_000, polling: 100 });
  const invite = new URL(await pageA.evaluate(() => location.href));
  stage('create', at);

  at = performance.now();
  for (const [key, value] of new URLSearchParams(BOOT_QUERY)) invite.searchParams.set(key, value);
  await pageB.goto(invite.href, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await pageB.waitForFunction(garage, { timeout: 240_000, polling: 100 });
  await pageB.waitForFunction(() => document.querySelector('.cot-play .lobby.show .players')?.children.length === 2
    || document.querySelector('.cot-play .status')?.classList.contains('err'), { timeout: 60_000, polling: 100 });
  await pageA.waitForFunction(() => document.querySelector('.cot-play .lobby.show .players')?.children.length === 2, { timeout: 30_000, polling: 100 });
  stage('join', at);

  at = performance.now();
  await pageB.evaluate(() => {
    const team = document.querySelector('.cot-play [data-control="team"]');
    team.value = 'alpha';
    team.dispatchEvent(new Event('change', { bubbles: true }));
  });
  if (mapId) {
    await pageA.evaluate((id) => {
      const map = document.querySelector('.cot-play [data-control="map"]');
      map.value = id;
      map.dispatchEvent(new Event('change', { bubbles: true }));
    }, mapId);
  }
  await new Promise((r) => setTimeout(r, 1000));
  await pageB.click('.cot-play [data-action="ready"]');
  await pageA.click('.cot-play [data-action="ready"]');
  await pageA.waitForFunction(() => !document.querySelector('.cot-play [data-action="start"]')?.disabled, { timeout: 30_000, polling: 100 });
  stage('ready', at);

  at = performance.now();
  await pageA.click('.cot-play [data-action="start"]');
  await Promise.all([pageA, pageB].map((page) => page.waitForFunction(inBattle, { timeout: 240_000, polling: 100 })));
  await new Promise((r) => setTimeout(r, 3000));
  stage('battle', at);

  at = performance.now();
  for (const page of [pageB, pageA]) {
    await page.evaluate(() => window.__DEBUG.leaveBattleToGarage());
    await page.waitForFunction(() => window.__DEBUG?.game?.phase === 'garage', { timeout: 60_000, polling: 100 });
  }
  await new Promise((r) => setTimeout(r, 2000));
  stage('leave', at);
} catch (error) {
  // where each page stood when the stage gave up, and the stage's console so far
  const state = await Promise.all(pages.map((page) => page.evaluate(() => {
    const cover = document.querySelector('.cot-bl');
    return { inMatch: window.__MULTIPLAYER_V2?.stats?.().inMatch ?? null, phase: window.__DEBUG?.game?.phase ?? null,
      cover: cover ? getComputedStyle(cover).display : null, coverText: cover?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? null,
      // the network entry's own record of a failed round (main.ts recordEntryFailure) and its stage trace
      entryFailure: window.__NETWORK_ENTRY_FAILURE ?? null, entryTrace: window.__NETWORK_LOAD?.stages ?? null };
  }).catch((e) => ({ unreadable: String(e?.message || e).split('\n')[0] }))));
  samples.push({ kind: `lobby-${['boot', 'create', 'join', 'ready', 'battle', 'leave'][samples.length] ?? 'flow'}`, error: String(error?.message || error).split('\n')[0],
    pages: state, census: { consoleErrors: log.errors.splice(0), consoleWarnings: log.warnings.length, consoleWarningTexts: log.warnings.splice(0) } });
  console.error(`mp-room-census: ${samples.at(-1).error}`);
  for (const [i, s] of state.entries()) console.error(`  page ${'AB'[i]}: ${JSON.stringify(s)}`);
  for (const line of [...samples.at(-1).census.consoleErrors, ...samples.at(-1).census.consoleWarningTexts]) console.error(`  ${String(line).slice(0, 240)}`);
  process.exitCode = 2;
} finally {
  await browser?.close().catch(() => {});
  server?.kill();
  try { await rooms?.close(); } catch { /* already gone */ }
  await lock?.release();
}
mkdirSync(join(out, label), { recursive: true });
writeFileSync(join(out, label, 'mp-room.desktop.json'), `${JSON.stringify({ profile: 'desktop', dist, samples }, null, 1)}\n`);
const errors = samples.reduce((n, s) => n + (s.census?.consoleErrors.length ?? 0), 0);
console.log(`mp-room-census: ${samples.length} stages, ${errors} console errors -> ${join(out, label, 'mp-room.desktop.json')}`);
if (errors && !process.exitCode) process.exitCode = 1;
process.exit(process.exitCode ?? 0);
