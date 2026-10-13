#!/usr/bin/env node
// Live-battle candidate frames for the home page's mode and mechanic slots (home r2, 2026-10-12).
//
// For each shot-list slot it boots the game, starts a solo battle in the slot's mode on its map at its hour, lets the
// bots fight while a recipe (tools/marketing-shots/mode-battle-recipes.mjs) drives the player, waits on the mode state
// the slot needs (a flag carried, a zone contested, a wave reached ...) and poses the camera: the game's chase or scope
// view with the live HUD, or an external cinematic pose through rig.setExternalPose. Candidate frames are frozen on
// the exact frame an event produced (a muzzle flash, a hit, a crush; tools/marketing-shots/mode-battle-director.mjs)
// plus a periodic sample, written as PNGs (3840x2160 by default) with a metadata line each and contact sheets.
// `--pick` copies the chosen candidate to the slot's delivery path.
//
//   node tools/marketing-shots/mode-battle-shots.mjs --only=modes/standard,modes/zone_control
//   node tools/marketing-shots/mode-battle-shots.mjs --queue=<file>     (one slot per line, '#' comments; re-read
//        before every slot, so slots can be added, reordered or removed while the run waits for the lock)
//     options: [--list=shots/media-r5/home-r2/shot-list.json] [--out=<dir>] [--port=7613] [--cache-dir=<dir>]
//        [--base=http://127.0.0.1:<port>] [--hold-max-min=9] [--headroom-gb=8] [--dpr=2] [--lock-timeout-min=600]
//        [--ticket-stamp=<ms of one of this lane's own waiting normal tickets>] [--rooms-double]
//   node tools/marketing-shots/mode-battle-shots.mjs --pick=modes/standard:12[,<slot>:<n>...] [--alt="what the frame shows"]
//   node tools/marketing-shots/mode-battle-shots.mjs --sheet=modes/standard   (rebuild a slot's contact sheets)
//
// Recipes and the director are imported afresh for every slot, so a long run that is still queued for the lock picks
// up recipe edits. Output: <out>/<group>/<id>/c###.png, meta.jsonl (one line per candidate: why it froze, the game
// time, the camera, what was on screen, the mode state), sheet-##.jpg, run.json; <out>/lock-holds.jsonl.
//
// Shared machine rules (2026-10-12): every capture takes the shared capture lock (tools/capture-lock.mjs) with a
// normal ticket, holds it for at most --hold-max-min minutes before releasing it (and re-queueing at the back) so
// other jobs interleave, and closes its Chrome while it waits; a memory-guard WARN or a `headroom can-start`
// refusal waits, a PAUSE stops the run; one Chrome and one dev server.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { spawnSync } from 'node:child_process';
import {
  appendFileSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, closeSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCaptureLock, ticketAt } from '../capture-lock.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const argv = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  if (hit.includes('=')) return hit.slice(hit.indexOf('=') + 1);
  const next = argv[argv.indexOf(hit) + 1];
  return next && !next.startsWith('--') ? next : 'true';
};
const LIST = resolve(ROOT, opt('list', 'shots/media-r5/home-r2/shot-list.json'));
const OUT = resolve(ROOT, opt('out', join(dirname(LIST), 'candidates')));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const stamp = () => new Date().toTimeString().slice(0, 8);
const log = (...parts) => console.log(`[mode-battle ${stamp()}]`, ...parts);

const shotList = JSON.parse(readFileSync(LIST, 'utf8'));
const entryBySlot = new Map(shotList.shots.map((shot) => [shot.slot, shot]));
const slotDir = (slot) => join(OUT, ...slot.split('/'));

/** Fresh copies of the recipes and the director (edits land on the next slot). */
async function loadModules() {
  const v = `v=${Date.now()}`;
  const recipes = await import(`${pathToFileURL(join(HERE, 'mode-battle-recipes.mjs')).href}?${v}`);
  const director = await import(`${pathToFileURL(join(HERE, 'mode-battle-director.mjs')).href}?${v}`);
  return { recipeFor: recipes.recipeFor, RECIPES: recipes.RECIPES, installModeBattleDirector: director.installModeBattleDirector };
}

// ------------------------------------------------------------------------------------------------ PNG header checks
function pngSize(path) {
  const header = Buffer.alloc(24);
  const handle = openSync(path, 'r');
  try { readSync(handle, header, 0, 24, 0); } finally { closeSync(handle); }
  if (!header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error(`not a PNG: ${path}`);
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

function readMeta(slot) {
  const path = join(slotDir(slot), 'meta.jsonl');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

// ------------------------------------------------------------------------------------------------ --pick
if (opt('pick')) {
  const picksPath = join(OUT, 'picks.json');
  const picks = existsSync(picksPath) ? JSON.parse(readFileSync(picksPath, 'utf8')) : {};
  // --alt="<what the delivered frame shows>" (the lead, 2026-10-13: the home alts are written from the frames, never
  // from the shot list's plan): the mode or feature, the map's display name, the hour if it shows, the vehicles one can
  // name and the action. Stored with the pick and logged; one slot per --pick when an alt is given.
  const alt = opt('alt');
  if (alt != null && opt('pick').split(',').filter(Boolean).length !== 1) throw new Error('--alt describes one pick: give one <slot>:<n>');
  for (const pair of opt('pick').split(',').filter(Boolean)) {
    const at = pair.lastIndexOf(':');
    // <slot>:<n> or <slot>:<n>-<variant> (a recipe's alternate crop of candidate n, e.g. c003-tight.png)
    const slot = pair.slice(0, at), [num, ...variant] = pair.slice(at + 1).split('-'), n = Number(num);
    const entry = entryBySlot.get(slot);
    if (!entry || !Number.isInteger(n)) throw new Error(`--pick wants <slot>:<candidate number>[-variant], got ${pair}`);
    const source = join(slotDir(slot), `c${String(n).padStart(3, '0')}${variant.length ? `-${variant.join('-')}` : ''}.png`);
    const { width, height } = pngSize(source);
    const want = /24:7/.test(entry.frame || '') ? 24 / 7 : 16 / 9;
    if (width < 1280 || Math.abs(width / height - want) > 0.01) throw new Error(`${source}: ${width}x${height} does not fit ${entry.frame}`);
    const deliver = resolve(ROOT, entry.deliver.split(' ')[0]);
    mkdirSync(dirname(deliver), { recursive: true });
    copyFileSync(source, deliver);
    picks[slot] = { candidate: n, source, deliver, width, height, pickedAt: new Date().toISOString(),
      ...(alt != null ? { alt } : {}), meta: readMeta(slot).find((m) => m.n === n) || null };
    log(`picked ${slot} #${n} (${width}x${height}) -> ${deliver}`);
    if (alt != null) log(`alt: ${alt}`);
  }
  writeFileSync(picksPath, `${JSON.stringify(picks, null, 1)}\n`);
  process.exit(0);
}

// ------------------------------------------------------------------------------------------------ contact sheets
async function buildSheets(browser, slot, { tile = 320, cols = 5, rows = 6 } = {}) {
  const dir = slotDir(slot);
  const metas = readMeta(slot);
  if (!metas.length) return [];
  const thumbDir = join(dir, 'thumbs');
  mkdirSync(thumbDir, { recursive: true });
  const tiles = [];
  for (const meta of metas) {
    const png = join(dir, meta.file);
    const jpg = join(thumbDir, meta.file.replace(/\.png$/, '.jpg'));
    if (!existsSync(png)) continue;
    if (!existsSync(jpg)) {
      spawnSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '72', '-Z', String(Math.round(tile * 1.5)), png, '--out', jpg], { stdio: 'ignore' });
    }
    if (!existsSync(jpg)) continue;
    const r = meta.reason || {};
    const label = `#${meta.n} ${typeof meta.timeS === 'number' ? meta.timeS.toFixed(1) : ''}s ${r.type || ''}${r.delayMs != null ? `+${r.delayMs}` : ''}`
      + ` ${meta.camera?.kind || ''} e${meta.onScreen?.enemy ?? '?'} s${meta.shellsOnScreen ?? 0}`;
    tiles.push({ uri: `data:image/jpeg;base64,${readFileSync(jpg).toString('base64')}`, label });
  }
  if (!tiles.length) return [];
  const page = await browser.newPage();
  const out = [];
  try {
    await page.setContent('<canvas id="c"></canvas>');
    const per = cols * rows;
    for (let start = 0, sheet = 1; start < tiles.length; start += per, sheet++) {
      const chunk = tiles.slice(start, start + per);
      const data = await page.evaluate(async (items, tileW, columns) => {
        const images = [];
        for (const item of items) {
          const image = new Image();
          await new Promise((ok, fail) => { image.onload = ok; image.onerror = fail; image.src = item.uri; });
          images.push(image);
        }
        const tileH = Math.round(tileW * images[0].height / images[0].width);
        const labelH = 18;
        const canvas = document.getElementById('c');
        const c = Math.min(columns, images.length);
        canvas.width = tileW * c;
        canvas.height = (tileH + labelH) * Math.ceil(images.length / c);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        images.forEach((image, i) => {
          const x = (i % c) * tileW, y = Math.floor(i / c) * (tileH + labelH);
          ctx.drawImage(image, x, y + labelH, tileW, tileH);
          ctx.fillStyle = '#ffd27a';
          ctx.font = 'bold 12px monospace';
          ctx.fillText(items[i].label, x + 4, y + 13);
        });
        return canvas.toDataURL('image/jpeg', 0.82);
      }, chunk, tile, cols);
      const path = join(dir, `sheet-${String(sheet).padStart(2, '0')}.jpg`);
      writeFileSync(path, Buffer.from(data.split(',')[1], 'base64'));
      out.push(path);
    }
  } finally { await page.close(); }
  return out;
}

if (opt('sheet')) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  try {
    for (const slot of opt('sheet').split(',').filter(Boolean)) log(slot, (await buildSheets(browser, slot)).join(' '));
  } finally { await browser.close(); }
  process.exit(0);
}

// ------------------------------------------------------------------------------------------------ machine guards
const MEMGUARD = join(homedir(), 'cot-launch-state', 'memguard');
async function machineGate(label, gb) {
  for (let waited = 0; ; waited += 30) {
    if (existsSync(join(MEMGUARD, 'PAUSE'))) throw Object.assign(new Error('memory guard PAUSE: stopping'), { code: 'PAUSE' });
    const warn = existsSync(join(MEMGUARD, 'WARN'));
    let headroomOk = true;
    const headroom = spawnSync('headroom', ['can-start', '--gb', String(gb), '--label', label], { encoding: 'utf8' });
    if (!headroom.error && headroom.status === 1) headroomOk = false;
    if (!warn && headroomOk) return;
    // a WARN can last hours on a shared machine (swap from other sessions): wait it out without a ticket or a server
    const limitS = Number(opt('gate-wait-min', '240')) * 60;
    if (waited >= limitS) throw Object.assign(new Error(`machine busy for ${limitS / 60} min (WARN ${warn}, headroom ${headroomOk ? 'ok' : 'hold'})`), { code: 'BUSY' });
    if (waited % 600 === 0) log(`waiting: memory guard WARN ${warn}, headroom ${headroomOk ? 'ok' : 'hold'} (${waited}s)`);
    await sleep(30000);
  }
}

// ------------------------------------------------------------------------------------------------ lock and browser
const lock = createCaptureLock();
// --ticket-stamp=<ms>: the first acquisition rejoins the queue at that place (capture-lock ticketAt), for a run that
// replaces one of this lane's own queued runs (its stamp, from the waiting ticket's name). Normal band only: the
// priority bands (the cinema's 1791397979999, perf's 1791397983200x) are refused.
let firstTicketStamp = opt('ticket-stamp') ? Number(opt('ticket-stamp')) : null;
if (firstTicketStamp != null && !(Number.isSafeInteger(firstTicketStamp) && firstTicketStamp > 1791400000000)) {
  console.error('--ticket-stamp takes a normal-band stamp from one of this lane\'s own waiting tickets, never a priority band');
  process.exit(2);
}
let heldSince = 0;
let lockRefresh = null;
let browser = null;
const holds = [];
const holdLog = join(OUT, 'lock-holds.jsonl');
async function launchBrowser() {
  if (browser) return browser;
  browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 600000,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio',
      '--autoplay-policy=no-user-gesture-required'],
  });
  log(`chrome pid ${browser.process()?.pid}`);
  return browser;
}
async function closeBrowser() {
  if (!browser) return;
  const pid = browser.process()?.pid;
  await browser.close().catch(() => {});
  browser = null;
  log(`chrome ${pid} closed`);
}
async function takeLock(label) {
  for (;;) {
    if (heldSince) return;
    await machineGate(label, Number(opt('headroom-gb', '8')));
    log(`queueing for the capture lock (normal ticket) for ${label}`);
    const asked = Date.now();
    const place = firstTicketStamp ? { ticket: ticketAt(firstTicketStamp) } : {};
    firstTicketStamp = null;
    await lock.acquire(Number(opt('lock-timeout-min', '600')) * 60 * 1000, place);
    heldSince = Date.now();
    lockRefresh = setInterval(() => lock.refresh(), 30000);
    log(`lock held after ${Math.round((heldSince - asked) / 1000)} s in the queue`);
    // the machine may have changed while we queued: a PAUSE stops the run, a WARN gives the turn back and waits
    if (existsSync(join(MEMGUARD, 'PAUSE'))) {
      await dropLock('memory guard PAUSE at acquisition');
      throw Object.assign(new Error('memory guard PAUSE at acquisition'), { code: 'PAUSE' });
    }
    if (!existsSync(join(MEMGUARD, 'WARN'))) return;
    await dropLock('memory guard WARN at acquisition');
  }
}
async function dropLock(reason) {
  if (!heldSince) return;
  await closeBrowser();
  await stopServer();
  clearInterval(lockRefresh);
  lock.release();
  const ms = Date.now() - heldSince;
  const hold = { startedAt: new Date(heldSince).toISOString(), ms, reason };
  holds.push(hold);
  mkdirSync(OUT, { recursive: true });
  appendFileSync(holdLog, `${JSON.stringify(hold)}\n`);
  log(`lock released after ${(ms / 60000).toFixed(1)} min (${reason}); this run ${(holds.reduce((a, h) => a + h.ms, 0) / 60000).toFixed(1)} min`);
  heldSince = 0;
}
process.on('exit', () => { if (heldSince) lock.release(); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { if (heldSince) lock.release(); process.exit(130); });

// ------------------------------------------------------------------------------------------------ the run
const queueFile = opt('queue') ? resolve(ROOT, opt('queue')) : null;
const onlyList = (opt('only', '') || '').split(',').filter(Boolean);
if (!queueFile && !onlyList.length) {
  console.error('usage: --only=<slot,...> | --queue=<file> | --pick=<slot>:<n> | --sheet=<slot>');
  process.exit(2);
}
const attempted = new Set();
async function nextSlot() {
  const { recipeFor } = await loadModules();
  const lines = queueFile ? readFileSync(queueFile, 'utf8').split('\n') : onlyList;
  for (const raw of lines) {
    const slot = raw.replace(/#.*/, '').trim();
    if (!slot || attempted.has(slot)) continue;
    if (!entryBySlot.has(slot) || !recipeFor(slot)) { log(`skipping ${slot}: no shot-list entry or no recipe`); attempted.add(slot); continue; }
    return slot;
  }
  return null;
}

const holdMaxMs = Number(opt('hold-max-min', '9')) * 60 * 1000;
const port = Number(opt('port', '7613'));
let server = null;
let base = opt('base');
// --rooms-double: the multiplayer slot's room signaling double (tools/mp-p2p-room-double.ts), started before the dev
// server so the pages are built against it (VITE_ROOMS_URL), as tools/mp-p2p-e2e.mjs does.
let rooms = null;
if (opt('rooms-double') === 'true' && !base) {
  const { createP2pRoomDouble } = await import('../mp-p2p-room-double.ts');
  const { randomBytes } = await import('node:crypto');
  rooms = await createP2pRoomDouble({ host: '127.0.0.1', port: 0, seatSecret: randomBytes(24).toString('hex'), hostGraceMs: 3000 });
  process.env.VITE_ROOMS_URL = rooms.url;
  log(`room double ${rooms.url}`);
}
// The dev server runs only while the lock is held (a queued run keeps no idle server): started on acquisition, closed
// with the browser when the lock is released.
const fixedBase = base;
async function startServer() {
  if (fixedBase) { base = fixedBase; return; }
  if (server) return;
  const cacheDir = resolve(ROOT, opt('cache-dir', 'shots/.vite-mode-battle-shots'));
  server = await createServer({
    root: ROOT,
    cacheDir,
    logLevel: 'error',
    clearScreen: false,
    server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } },
  });
  await server.listen();
  base = `http://127.0.0.1:${server.config.server.port}`;
  log(`vite dev server ${base} (node pid ${process.pid}, cache ${cacheDir})`);
}
async function stopServer() {
  if (!server) return;
  await server.close().catch(() => {});
  server = null;
  log('vite dev server closed');
}

const summary = [];
let stopReason = null;
try {
  for (;;) {
    let slot = await nextSlot();
    if (!slot) break;
    const estMs = (((await loadModules()).recipeFor(slot).windowS ?? 75) + 110) * 1000;
    if (heldSince && Date.now() - heldSince + estMs > holdMaxMs) {
      await dropLock('hold budget');
      await sleep(5000); // the next ticket in the queue takes its turn
    }
    try { await takeLock(slot); await startServer(); }
    catch (error) { stopReason = error.message; break; }
    // the queue file and the recipes may have changed while the run waited for the lock
    slot = await nextSlot();
    if (!slot) break;
    attempted.add(slot);
    const entry = entryBySlot.get(slot);
    const modules = await loadModules();
    const recipe = modules.recipeFor(slot);
    const started = Date.now();
    let result;
    try { result = await runEntry(await launchBrowser(), base, slot, entry, recipe, modules.installModeBattleDirector); }
    catch (error) { result = { slot, error: String(error?.stack || error).slice(0, 1500) }; log(`${slot} FAILED: ${error?.message || error}`); }
    result.wallS = Math.round((Date.now() - started) / 1000);
    summary.push(result);
    try { result.sheets = await buildSheets(await launchBrowser(), slot); } catch (error) { result.sheetError = String(error); }
    mkdirSync(slotDir(slot), { recursive: true });
    writeFileSync(join(slotDir(slot), 'run.json'), `${JSON.stringify(result, null, 1)}\n`);
    log(`${slot}: ${result.count ?? 0} candidates in ${result.wallS} s${result.error ? ' (ERROR)' : ''}${result.notes?.length ? `; notes: ${result.notes.join(' | ')}` : ''}`);
    if (existsSync(join(MEMGUARD, 'PAUSE'))) { stopReason = 'memory guard PAUSE'; break; }
    if (existsSync(join(MEMGUARD, 'WARN'))) await dropLock('memory guard WARN');
  }
} finally {
  await dropLock('run end');
  await closeBrowser();
  await stopServer();
  if (rooms) await rooms.close().catch(() => {});
  const totalMin = holds.reduce((a, h) => a + h.ms, 0) / 60000;
  log(`done: ${summary.map((s) => `${s.slot}=${s.error ? 'ERROR' : s.count}`).join(' ')}; lock ${totalMin.toFixed(1)} min in ${holds.length} holds${stopReason ? `; stopped: ${stopReason}` : ''}`);
}
process.exit(stopReason ? 3 : 0);

// ------------------------------------------------------------------------------------------------ one slot
async function runEntry(browserHandle, baseUrl, slot, entry, recipe, installModeBattleDirector) {
  const dir = slotDir(slot);
  mkdirSync(dir, { recursive: true });
  const config = entry.tool?.config || {};
  const battle = {
    specId: recipe.battle?.specId ?? config.specId,
    mapId: recipe.battle?.mapId ?? config.mapId,
    gameMode: recipe.battle?.gameMode ?? config.gameMode ?? 'standard',
  };
  const hour = recipe.hour ?? config.hour ?? 'day';
  const notes = [];
  const errors = [];
  const page = await browserHandle.newPage();
  try {
    await page.bringToFront();
    page.setDefaultTimeout(180000);
    page.on('pageerror', (error) => errors.push(String(error).slice(0, 400)));
    page.on('console', (message) => {
      if (message.type() === 'error' && !/favicon|github-stars|telemetry|insights|api\/jev/i.test(message.text())) errors.push(message.text().slice(0, 400));
    });
    if (recipe.emulate) await page.emulate(recipe.emulate);
    else await page.setViewport(recipe.viewport ?? { width: 1920, height: 1080, deviceScaleFactor: Number(opt('dpr', '2')) });
    const storage = {
      'cot.battle.times.v2': JSON.stringify([hour]),
      ...(battle.specId ? { 'cot.lastTank.v1': battle.specId } : {}),
      'cot.game.mode.v1': battle.gameMode,
      'cot.locale': 'en-US',
      ...(recipe.preset === null ? {} : { 'cot.gfxPreset': recipe.preset ?? 'ultra' }),
      ...(recipe.storage || {}),
    };
    await page.evaluateOnNewDocument((seed) => {
      try {
        localStorage.clear();
        for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      } catch { /* storage blocked: defaults apply */ }
    }, storage);
    await page.evaluateOnNewDocument(installModeBattleDirector);

    if (recipe.custom) {
      // UI and multi-page slots (Garage, Gallery, Studio, Service Record, a two-client room): the recipe drives the
      // pages itself; the harness supplies the lock, the browser, the dev server and the candidate bookkeeping.
      const ctx = makeContext({ page, slot, entry, recipe, dir, notes, errors, battle, hour });
      Object.assign(ctx, { browser: browserHandle, baseUrl, storage, rooms, installDirector: installModeBattleDirector });
      await recipe.custom(ctx);
      return { slot, custom: true, count: ctx.count(), notes, errors: [...new Set(errors)].slice(0, 30),
        lockHeldAtEndS: heldSince ? Math.round((Date.now() - heldSince) / 1000) : 0 };
    }

    const t0 = Date.now();
    await page.goto(`${baseUrl}/?nosplash=1${recipe.query || ''}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await page.waitForFunction(() => window.__GAME_READY === true && !!window.__DEBUG && !!window.__MB, { timeout: 240000, polling: 250 });
    await page.evaluate(() => window.__MB.attach());
    log(`${slot}: game ready in ${Math.round((Date.now() - t0) / 1000)} s; starting ${battle.gameMode} on ${battle.mapId} at ${hour} in ${battle.specId}`);

    const ctx = makeContext({ page, slot, entry, recipe, dir, notes, errors, battle, hour });
    if (recipe.beforeBattle) await recipe.beforeBattle(ctx);
    await page.evaluate((request) => {
      window.__MB_BEGIN = Promise.resolve(window.__DEBUG.beginSoloBattle(request))
        .catch((error) => { window.__MB_BEGIN_ERROR = String(error?.stack || error); });
    }, battle);
    await page.waitForFunction(() => {
      if (window.__MB_BEGIN_ERROR) return true;
      const g = window.__DEBUG?.game;
      return !!g && g.phase === 'battle' && !!g.player && !(g.preBattleS > 0);
    }, { timeout: 300000, polling: 250 });
    const beginError = await page.evaluate(() => window.__MB_BEGIN_ERROR || null);
    if (beginError) throw new Error(`beginSoloBattle failed: ${beginError}`);
    const reached = await page.evaluate(() => {
      const D = window.__DEBUG;
      D.post?.pinDynScale?.(1);
      D.post?.resetPerfTrims?.();
      D.post?.setAdaptiveSuspended?.(true);
      window.__MB.attach();
      return {
        mapId: D.world?.mapId ?? D.world?.config?.id ?? null, mode: D.game.gameMode, player: D.game.player?.specId,
        timeOfDay: D.battleAtmosphere?.current?.weather?.timeOfDay ?? null, tanks: D.game.tanks.length,
        enemies: D.game.tanks.filter((t) => t.team !== D.game.player.team).length,
        canvas: [D.renderer.domElement.width, D.renderer.domElement.height],
      };
    });
    log(`${slot}: battle live after ${Math.round((Date.now() - t0) / 1000)} s ${JSON.stringify(reached)}`);
    if (reached.timeOfDay && reached.timeOfDay !== hour) {
      const applied = await page.evaluate((time) => window.__SHOTS.battleTime(time), hour).catch(() => null);
      notes.push(`battle drew ${reached.timeOfDay}; applied ${hour} with __SHOTS.battleTime -> ${applied}`);
    }
    if (reached.mapId && battle.mapId && reached.mapId !== battle.mapId) notes.push(`asked for ${battle.mapId}, the battle is on ${reached.mapId}`);
    await page.evaluate((mode) => window.__MB.setHud(mode), recipe.hud ?? 'full');
    try {
      await recipe.run(ctx);
    } finally {
      await page.evaluate(() => { try { window.__MB.arm(null); window.__MB.resume(); } catch { /* page gone */ } }).catch(() => {});
      const tail = await page.evaluate(() => ({ hookErrors: window.__MB.hookErrors.slice(-8), notes: window.__MB.notes.slice(-8) })).catch(() => null);
      if (tail?.hookErrors?.length) errors.push(...tail.hookErrors.map((e) => `hook ${e}`));
      if (tail?.notes?.length) notes.push(...tail.notes);
    }
    return { slot, battle, hour, reached, count: ctx.count(), notes, errors: [...new Set(errors)].slice(0, 30),
      lockHeldAtEndS: heldSince ? Math.round((Date.now() - heldSince) / 1000) : 0 };
  } catch (error) {
    error.message = `${error.message}${errors.length ? `; page errors: ${[...new Set(errors)].slice(0, 5).join(' | ')}` : ''}`;
    throw error;
  } finally {
    await page.close().catch(() => {});
  }
}

function makeContext({ page, slot, entry, recipe, dir, notes, errors, battle, hour }) {
  let n = readMeta(slot).reduce((max, m) => Math.max(max, m.n), 0);
  let captured = 0;
  const metaPath = join(dir, 'meta.jsonl');
  const ctx = {
    page, slot, entry, recipe, battle, hour, dir,
    log: (...parts) => log(`${slot}:`, ...parts),
    note: (text) => { notes.push(text); log(`${slot}: NOTE ${text}`); },
    count: () => captured,
    /** Reserve the next candidate number (for a direct page capture outside the freeze loop). */
    bump: () => { n += 1; captured += 1; return n; },
    eval: (fn, ...args) => page.evaluate(fn, ...args),
    mb: (method, ...args) => page.evaluate((m, a) => window.__MB[m](...a), method, args),
    sleep,
    /** Advance the authoritative battle without rendering (bots fight on; nothing is drawn). */
    ff: (seconds) => page.evaluate((s) => window.__DEBUG.fastForward(s), seconds),
    /** A direct page capture (no freeze): paused UI states, menus. */
    async snap(label, extra = {}) {
      const k = ctx.bump();
      const file = `c${String(k).padStart(3, '0')}.png`;
      writeFileSync(join(dir, file), await page.screenshot({ type: 'png', captureBeyondViewport: false }));
      appendFileSync(metaPath, `${JSON.stringify({ n: k, file, label, reason: { type: 'snap' }, ...extra })}\n`);
      return file;
    },
    /**
     * Wait until `predicate` (a page function returning truthy) holds: real time by default, or in fastForward steps
     * of `ffStepS` (cheap: no rendering) up to `timeoutS` of game time. Returns the predicate's last value.
     */
    async until(predicate, { timeoutS = 60, ffStepS = 0, label = 'condition', args = [] } = {}) {
      const begin = Date.now();
      let gameS = 0;
      for (;;) {
        const value = await page.evaluate(predicate, ...args).catch((error) => { errors.push(`until ${label}: ${error.message}`); return null; });
        if (value) return value;
        if (ffStepS > 0) {
          if (gameS >= timeoutS) break;
          await page.evaluate((s) => window.__DEBUG.fastForward(s), ffStepS);
          gameS += ffStepS;
          await sleep(30);
        } else {
          if (Date.now() - begin > timeoutS * 1000) break;
          await sleep(250);
        }
      }
      ctx.note(`${label} not reached within ${timeoutS} s${ffStepS ? ' of fast-forwarded play' : ''}`);
      return null;
    },
    /**
     * Run a candidate window. `cameras` rotate every `cameraEvery` candidates (each switch snaps the new pose);
     * `triggers` are the director's event rules; `stopWhen` (page function) ends the window early.
     */
    async capture({
      windowS = recipe.windowS ?? 75, everyS = recipe.everyS ?? 1.6, max = recipe.max ?? 48, triggers = [],
      cameras = null, cameraEvery = 1, minGapMs = 450, stopWhen = null, hud = null, label = 'window',
    } = {}) {
      if (hud) await page.evaluate((mode) => window.__MB.setHud(mode), hud);
      let cameraIndex = 0;
      if (cameras?.length) await page.evaluate((spec) => window.__MB.setCamera(spec), cameras[0]);
      await page.evaluate((cfg) => window.__MB.arm(cfg), { triggers, periodicMs: everyS > 0 ? everyS * 1000 : 0, minGapMs });
      const begin = Date.now();
      let local = 0;
      let lastStopCheck = 0;
      while (Date.now() - begin < windowS * 1000 && local < max) {
        const state = await page.evaluate(() => window.__MB.poll());
        if (!state.frozen) {
          if (stopWhen && local > 0 && Date.now() - lastStopCheck > 1000) {
            lastStopCheck = Date.now();
            const stop = await page.evaluate(stopWhen).catch(() => false);
            if (stop) { ctx.log(`${label}: stop condition met`); break; }
          }
          await sleep(25);
          continue;
        }
        n += 1; local += 1; captured += 1;
        const file = `c${String(n).padStart(3, '0')}.png`;
        const buffer = await page.screenshot({ type: 'png', optimizeForSpeed: true, captureBeyondViewport: false });
        writeFileSync(join(dir, file), buffer);
        const line = { n, file, label, ...(state.meta || {}) };
        appendFileSync(metaPath, `${JSON.stringify(line)}\n`);
        if (cameras?.length > 1 && local % cameraEvery === 0) {
          cameraIndex = (cameraIndex + 1) % cameras.length;
          await page.evaluate((spec) => window.__MB.setCamera(spec), cameras[cameraIndex]);
        }
        await page.evaluate(() => window.__MB.resume());
        if (recipe.afterEach) await recipe.afterEach(ctx, line).catch((error) => errors.push(`afterEach: ${error.message}`));
      }
      await page.evaluate(() => { window.__MB.arm(null); window.__MB.resume(); });
      ctx.log(`${label}: ${local} candidates in ${Math.round((Date.now() - begin) / 1000)} s`);
      return local;
    },
  };
  return ctx;
}
