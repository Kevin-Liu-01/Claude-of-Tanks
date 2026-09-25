#!/usr/bin/env node
/**
 * Multiplayer v2 browser end-to-end: two pristine browsers on the real site
 * with `?mp=v2`, one in-process room host (server/rooms/serve.ts: rooms +
 * match on one port, the LAN helper's composition) and one Vite dev server of
 * this checkout with its own cache directory.
 *
 *   A opens the Garage, creates a LAN room (two seats per side), the invite
 *   link is read from the address bar (`?room=CODE&mode=lan&host=NAME&v=2`);
 *   B opens the link, joins and takes A's side (allies always see each other;
 *   bots fill the other side); both ready; A starts; both reach the battle
 *   (the first battle frame of each is screenshot); `--play` seconds of
 *   driving and one shot per side, asserting each browser saw the other move
 *   and the other's shell_fired (shots are counted by shooter id); A
 *   closes its tab; B keeps playing `--keep` seconds (snapshots still
 *   arriving, the match unowned by any browser) and the room's admin migrates
 *   to B; B leaves the battle to the Garage, reopens the room and leaves it
 *   cleanly. Any console error or page error on either browser fails the run.
 *
 *   npm run test:net:v2:browser                       # out: .qa-dev/mp-browser-e2e (gitignored)
 *   node tools/mp-browser-e2e.mjs --out=/tmp/mp-e2e --cache-dir=/tmp/mp-e2e/vite --play=30 --keep=15 --json
 *
 * Ports are OS-assigned (never 5197–5199); `--port=<n>` pins the Vite port.
 * Screenshots and report.json land in `--out`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer as createViteServer } from 'vite';
import { createRoomsServer } from '../server/rooms/serve.ts';

const root = new URL('..', import.meta.url).pathname;

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((entry) => entry.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : fallback;
}
const json = process.argv.includes('--json');
const headful = process.argv.includes('--headful');
const outputDir = resolve(argValue('out', join(root, '.qa-dev', 'mp-browser-e2e')));
const cacheDir = resolve(argValue('cache-dir', join(outputDir, 'vite-cache')));
const playS = Number(argValue('play', 30));
const keepS = Number(argValue('keep', 15));
const requestedVitePort = Number(argValue('port', 0));
const world = argValue('world', 'terrain');

/** An OS-assigned free TCP port (Vite treats port 0 as "unset" and would fall back to 5173). */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}
const log = (line) => { if (!json) process.stderr.write(`[mp-browser-e2e] ${line}\n`); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const startedAt = performance.now();
const elapsedMs = () => Math.round(performance.now() - startedAt);

const report = {
  pass: false, failures: [], errors: [], steps: [], screenshots: [], playS, keepS, world, wallMs: 0,
  room: null, load: {}, play: {}, afterHostLeft: {}, leave: {},
};
const failures = report.failures;
const step = (name, detail = {}) => { report.steps.push({ name, atMs: elapsedMs(), ...detail }); log(`${name} (${(elapsedMs() / 1000).toFixed(1)} s)${Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : ''}`); };

const errors = report.errors;
function observe(page, label) {
  page.on('pageerror', (error) => errors.push({ page: label, kind: 'pageerror', text: error.stack || error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push({ page: label, kind: 'console', text: message.text() });
  });
}

const BOOT_QUERY = 'nosplash=1&tier=desktop&gfxreset=1&mp=v2';

async function waitFor(page, predicate, label, timeoutMs, options = {}) {
  try {
    await page.waitForFunction(predicate, { timeout: timeoutMs, polling: options.polling ?? 100 }, ...(options.args ?? []));
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      url: location.href,
      phase: window.__DEBUG?.game?.phase ?? null,
      menuVisible: document.querySelector('.cot-play')?.classList.contains('show') ?? false,
      lobbyVisible: document.querySelector('.cot-play .lobby')?.classList.contains('show') ?? false,
      status: document.querySelector('.cot-play .status')?.textContent ?? '',
      loaderOn: document.querySelector('.cot-bl')?.classList.contains('on') ?? false,
      loaderLabel: document.querySelector('.cot-bl .label, .cot-bl .progress-label')?.textContent ?? '',
      v2: window.__MULTIPLAYER_V2?.stats?.() ?? null,
      entryFailure: window.__NETWORK_ENTRY_FAILURE ?? null,
    })).catch(() => null);
    throw new Error(`${label}: ${error.message}; diagnostics ${JSON.stringify(diagnostics)}`);
  }
}

const stats = (page) => page.evaluate(() => window.__MULTIPLAYER_V2?.stats?.() ?? null);
const gamePhase = (page) => page.evaluate(() => window.__DEBUG?.game?.phase ?? null);

async function shoot(page) {
  // No pointer lock in a headless page: a click on the game canvas is a legitimate fire press (input.ts, cursor-aim fallback).
  const canvas = await page.$('canvas');
  const box = canvas ? await canvas.boundingBox() : null;
  const x = box ? box.x + box.width / 2 : 400;
  const y = box ? box.y + box.height / 2 : 300;
  await page.mouse.click(x, y);
  await sleep(120);
  await page.mouse.click(x, y);
}

/** Drive for a while: forward with a bias to one side, one shot early, sampling the field once a second. */
async function play(page, label, seconds, samples, { turnKey }) {
  const own = await page.evaluate(() => window.__MULTIPLAYER_V2?.stats?.().room?.playerId ?? null);
  await page.keyboard.down('KeyW');
  await page.keyboard.down(turnKey);
  const until = performance.now() + seconds * 1000;
  let shot = false;
  let next = performance.now();
  while (performance.now() < until) {
    if (!shot && performance.now() - (until - seconds * 1000) > 2500) { await shoot(page); shot = true; }
    if (performance.now() >= next) {
      next += 1000;
      const sample = await page.evaluate((ownId) => {
        const game = window.__DEBUG?.game;
        const v2 = window.__MULTIPLAYER_V2?.stats?.() ?? null;
        const others = [];
        for (const [id, entity] of game?.tankById?.entries?.() ?? []) {
          if (id === ownId || id.startsWith('bot-')) continue;
          const pos = entity?.state?.pos;
          others.push({ id, x: pos?.x ?? null, z: pos?.z ?? null, visible: !!entity?.networkVisible });
        }
        const pos = game?.player?.state?.pos;
        return {
          atMs: Math.round(performance.now()), phase: game?.phase ?? null, result: game?.result ?? null,
          own: pos ? { x: pos.x, z: pos.z } : null, others,
          events: v2?.round?.events ?? {}, shotsBy: v2?.round?.shotsBy ?? {}, ownShots: v2?.round?.ownShots ?? 0, frames: v2?.round?.frames ?? 0,
          snapshots: v2?.session?.match?.snapshotsAccepted ?? 0, rttMs: v2?.session?.match?.rttMs ?? null,
        };
      }, own);
      samples.push(sample);
    }
    await sleep(50);
  }
  await page.keyboard.up(turnKey);
  await page.keyboard.up('KeyW');
  log(`${label}: ${samples.length} samples, last ${JSON.stringify(samples.at(-1))}`);
  if (!shot) await shoot(page);
}

function displacement(samples, pick) {
  let best = 0;
  let first = null;
  for (const sample of samples) {
    const pos = pick(sample);
    if (!pos || pos.x === null) continue;
    first ??= pos;
    best = Math.max(best, Math.hypot(pos.x - first.x, pos.z - first.z));
  }
  return best;
}

async function screenshot(page, name) {
  const path = join(outputDir, name);
  await page.screenshot({ path });
  report.screenshots.push(path);
  return path;
}

let rooms = null;
let vite = null;
let browser = null;
let pageA = null;
let pageB = null;
try {
  await mkdir(outputDir, { recursive: true });
  rooms = await createRoomsServer({ host: '127.0.0.1', port: 0, seatSecret: randomBytes(24).toString('hex'), world });
  process.env.VITE_ROOMS_URL = rooms.url;
  step('rooms-server', { url: rooms.url, world });
  const vitePort = requestedVitePort > 0 ? requestedVitePort : await freePort();
  vite = await createViteServer({
    root, cacheDir, logLevel: 'error',
    server: { host: '127.0.0.1', port: vitePort, strictPort: true, hmr: false },
  });
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  step('vite', { origin, cacheDir });

  browser = await puppeteer.launch({
    headless: !headful,
    protocolTimeout: 360_000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--use-gl=angle', '--enable-webgl', '--window-size=1100,720'],
  });
  // Two first-time machines: separate contexts share no storage, cookies, cache or player identity.
  const contextA = await browser.createBrowserContext();
  const contextB = await browser.createBrowserContext();
  pageA = await contextA.newPage();
  pageB = await contextB.newPage();
  for (const page of [pageA, pageB]) await page.setViewport({ width: 1024, height: 640, deviceScaleFactor: 1 });
  observe(pageA, 'A');
  observe(pageB, 'B');

  // ---- A: boot, open the LAN room from the Garage's battle menu, create
  await pageA.goto(`${origin}/?${BOOT_QUERY}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await waitFor(pageA, () => window.__GAME_READY === true && window.__DEBUG?.game?.phase === 'garage', 'A garage ready', 240_000);
  step('a-garage-ready');
  await pageA.click('.cot-battle-mode');
  await pageA.click('.cot-battle-choice[data-mode="lan"]');
  await pageA.click('.cot-battle');
  await waitFor(pageA, () => document.querySelector('.cot-play')?.classList.contains('show'), 'A play menu', 30_000);
  const signalUrl = await pageA.$eval('.cot-play [data-field="signal"]', (input) => input.value);
  if (signalUrl !== rooms.url) failures.push(`A's room host field reads ${signalUrl}, expected ${rooms.url}`);
  await pageA.evaluate(() => {
    const name = document.querySelector('.cot-play [data-field="name"]');
    if (name) name.value = 'Alpha Lead';
    // Two seats per side: both humans sit on alpha (allies always see each other), bots fill bravo.
    const size = document.querySelector('.cot-play [data-field="create-size"]');
    if (size) size.value = '2';
  });
  await pageA.click('.cot-play [data-action="create"]');
  await waitFor(pageA, () => document.querySelector('.cot-play .lobby')?.classList.contains('show') && /[?&]room=[A-Z0-9]{6}/.test(location.search), 'A room created', 30_000);
  const invite = new URL(await pageA.evaluate(() => location.href));
  const roomCode = invite.searchParams.get('room');
  report.room = { code: roomCode, inviteVersion: invite.searchParams.get('v'), mode: invite.searchParams.get('mode'), host: invite.searchParams.get('host'), signalUrl };
  if (invite.searchParams.get('v') !== '2') failures.push(`the invite link is not stamped v=2: ${invite.href}`);
  step('a-room-created', report.room);
  await screenshot(pageA, 'a-lobby.png');

  // ---- B: open the invite, join
  for (const [key, value] of new URLSearchParams(BOOT_QUERY)) invite.searchParams.set(key, value);
  await pageB.goto(invite.href, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await waitFor(pageB, () => window.__GAME_READY === true && window.__DEBUG?.game?.phase === 'garage', 'B garage ready', 240_000);
  step('b-garage-ready');
  await waitFor(pageB, () => document.querySelector('.cot-play .lobby.show .players')?.children.length === 2
    || document.querySelector('.cot-play .status')?.classList.contains('err'), 'B joined the lobby', 60_000);
  const joinError = await pageB.evaluate(() => (document.querySelector('.cot-play .status')?.classList.contains('err') ? document.querySelector('.cot-play .status').textContent : ''));
  if (joinError) throw new Error(`B could not join the room: ${joinError}`);
  await waitFor(pageA, () => document.querySelector('.cot-play .lobby.show .players')?.children.length === 2, 'A sees B', 30_000);
  step('b-joined');
  await screenshot(pageB, 'b-lobby.png');

  // ---- B joins A's side (the lobby's team select), then ready, start
  await pageB.evaluate(() => {
    const team = document.querySelector('.cot-play [data-control="team"]');
    team.value = 'alpha';
    team.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const sameTeam = () => rooms.roomService.rooms.get(roomCode)?.snapshot.players.every((player) => player.team === 'alpha') === true;
  for (let waited = 0; !sameTeam() && waited < 10_000; waited += 100) await sleep(100);
  if (!sameTeam()) throw new Error(`B could not join A's team: ${JSON.stringify(rooms.roomService.rooms.get(roomCode)?.snapshot.players.map((player) => [player.id, player.team]))}`);
  step('b-on-alpha');
  await pageB.click('.cot-play [data-action="ready"]');
  await pageA.click('.cot-play [data-action="ready"]');
  await waitFor(pageA, () => !document.querySelector('.cot-play [data-action="start"]')?.disabled, 'A start enabled', 30_000);
  await pageA.click('.cot-play [data-action="start"]');
  step('a-started');

  // ---- both reach the battle: activated, revealed, the loader off the screen
  const inBattle = () => window.__MULTIPLAYER_V2?.stats?.().inMatch === true && window.__DEBUG?.game?.phase === 'battle'
    && getComputedStyle(document.querySelector('.cot-bl')).display === 'none';
  await Promise.all([
    waitFor(pageA, inBattle, 'A battle revealed', 240_000),
    waitFor(pageB, inBattle, 'B battle revealed', 240_000),
  ]);
  const loadOf = (page) => page.evaluate(() => {
    const trace = window.__NETWORK_LOAD ?? null;
    const v2 = window.__MULTIPLAYER_V2?.stats?.() ?? null;
    return { trace, round: v2?.round ?? null, welcomed: v2?.session?.match?.welcomed ?? null, rttMs: v2?.session?.match?.rttMs ?? null, reveal: window.__BATTLE_REVEAL ?? null };
  });
  report.load.a = await loadOf(pageA);
  report.load.b = await loadOf(pageB);
  const [shotA, shotB] = await Promise.all([screenshot(pageA, 'a-battle-first-frame.png'), screenshot(pageB, 'b-battle-first-frame.png')]);
  step('battle-revealed', { aMs: report.load.a.trace?.totalMs, bMs: report.load.b.trace?.totalMs, actorsA: report.load.a.round?.actors, actorsB: report.load.b.round?.actors, shotA, shotB });
  for (const [label, load] of [['A', report.load.a], ['B', report.load.b]]) {
    if (load.trace?.status !== 'complete') failures.push(`${label} load trace ${load.trace?.status ?? 'missing'}`);
    if (!load.round?.revealed) failures.push(`${label} round not revealed: ${JSON.stringify(load.round)}`);
    if ((load.round?.actors ?? 0) < 2) failures.push(`${label} presents ${load.round?.actors ?? 0} actors`);
  }

  // ---- play: both drive, each shoots once, each sees the other move and the other's shot
  const samplesA = [];
  const samplesB = [];
  await Promise.all([
    play(pageA, 'A', playS, samplesA, { turnKey: 'KeyA' }),
    play(pageB, 'B', playS, samplesB, { turnKey: 'KeyD' }),
  ]);
  const playOf = (samples) => {
    const last = samples.at(-1) ?? {};
    const otherId = last.others?.[0]?.id ?? null;
    return {
      samples: samples.length, ownMovedM: displacement(samples, (s) => s.own), otherMovedM: displacement(samples, (s) => s.others?.[0] ?? null),
      otherId, otherVisibleSamples: samples.filter((s) => s.others?.[0]?.visible).length, events: last.events ?? {}, ownShots: last.ownShots ?? 0,
      shotsBy: last.shotsBy ?? {}, otherShots: otherId ? last.shotsBy?.[otherId] ?? 0 : 0,
      frames: last.frames ?? 0, snapshots: last.snapshots ?? 0, rttMs: last.rttMs, phase: last.phase, result: last.result,
    };
  };
  report.play.a = playOf(samplesA);
  report.play.b = playOf(samplesB);
  step('played', { a: report.play.a, b: report.play.b });
  for (const [label, summary] of [['A', report.play.a], ['B', report.play.b]]) {
    if (summary.otherMovedM < 2) failures.push(`${label} did not see the other tank move (${summary.otherMovedM.toFixed(2)} m over ${summary.otherVisibleSamples} disclosed samples)`);
    if (summary.ownMovedM < 2) failures.push(`${label}'s own tank did not move (${summary.ownMovedM.toFixed(2)} m)`);
    if (summary.ownShots < 1) failures.push(`${label} fired no accepted shot`);
    if (summary.otherShots < 1) failures.push(`${label} did not see the other's shell_fired (${JSON.stringify(summary.shotsBy)})`);
    if (summary.phase !== 'battle' || summary.result) failures.push(`${label} left the live battle early (phase ${summary.phase}, result ${summary.result})`);
  }
  await Promise.all([screenshot(pageA, 'a-after-play.png'), screenshot(pageB, 'b-after-play.png')]);

  // ---- A closes its tab; B keeps playing, the snapshots keep coming, the admin migrates to B
  const bId = (await stats(pageB))?.room?.playerId ?? null;
  const beforeClose = await stats(pageB);
  await pageA.close();
  pageA = null;
  const closedAt = performance.now();
  step('a-closed');
  await pageB.keyboard.down('KeyW');
  await sleep(keepS * 1000);
  await pageB.keyboard.up('KeyW');
  const afterKeep = await stats(pageB);
  report.afterHostLeft = {
    snapshotsBefore: beforeClose?.session?.match?.snapshotsAccepted ?? 0,
    snapshotsAfter: afterKeep?.session?.match?.snapshotsAccepted ?? 0,
    framesBefore: beforeClose?.round?.frames ?? 0, framesAfter: afterKeep?.round?.frames ?? 0,
    matchPhase: afterKeep?.session?.match?.phase ?? null, phase: await gamePhase(pageB), result: await pageB.evaluate(() => window.__DEBUG?.game?.result ?? null),
    adminBefore: beforeClose?.room?.adminId ?? null,
  };
  const snapshotsDuringKeep = report.afterHostLeft.snapshotsAfter - report.afterHostLeft.snapshotsBefore;
  if (snapshotsDuringKeep < keepS * 10) failures.push(`B received ${snapshotsDuringKeep} snapshots in ${keepS} s after A left (expected ≥ ${keepS * 10})`);
  if (report.afterHostLeft.matchPhase !== 'live') failures.push(`B's match link is ${report.afterHostLeft.matchPhase} after A left`);
  if (report.afterHostLeft.phase !== 'battle' || report.afterHostLeft.result) failures.push(`B's battle ended when A left (phase ${report.afterHostLeft.phase}, result ${report.afterHostLeft.result})`);
  // The room's admin follows A's disconnect after the reconnect grace (charter §5: 30 s), at once on an explicit leave.
  try {
    await waitFor(pageB, (id) => window.__MULTIPLAYER_V2?.stats?.().room?.adminId === id, 'admin migrated to B', 45_000, { args: [bId], polling: 250 });
    report.afterHostLeft.adminMigratedAfterMs = Math.round(performance.now() - closedAt);
  } catch (error) {
    failures.push(`admin did not migrate to B: ${error.message}`);
  }
  report.afterHostLeft.adminAfter = (await stats(pageB))?.room?.adminId ?? null;
  step('b-kept-playing', report.afterHostLeft);
  await screenshot(pageB, 'b-after-host-left.png');

  // ---- B leaves cleanly: battle → Garage (the room is kept), reopen the room, leave it
  await pageB.evaluate(() => window.__DEBUG.leaveBattleToGarage());
  await waitFor(pageB, () => window.__DEBUG?.game?.phase === 'garage' && window.__MULTIPLAYER_V2?.stats?.().active === false, 'B back in the Garage', 60_000);
  const garageStats = await stats(pageB);
  report.leave.roomKeptInGarage = !!garageStats?.room;
  if (!garageStats?.room) failures.push('B lost the room on the Garage return');
  await pageB.click('.cot-battle');
  await waitFor(pageB, () => document.querySelector('.cot-play')?.classList.contains('show') && document.querySelector('.cot-play .lobby')?.classList.contains('show'), 'B reopened the room', 30_000);
  await screenshot(pageB, 'b-room-after-battle.png');
  await pageB.click('.cot-play [data-action="leave"]');
  await waitFor(pageB, () => window.__MULTIPLAYER_V2?.stats?.().room === null && !document.querySelector('.cot-play .lobby')?.classList.contains('show'), 'B left the room', 30_000);
  const roomOnServer = rooms.roomService.rooms.get(roomCode)?.snapshot ?? null;
  report.leave.serverPlayersAfter = roomOnServer ? roomOnServer.players.map((player) => ({ id: player.id, connected: player.connected })) : null;
  report.leave.serverPhase = roomOnServer?.phase ?? null;
  if (roomOnServer && roomOnServer.players.some((player) => player.id === bId)) failures.push('the room still seats B after the explicit leave');
  step('b-left', report.leave);
  await screenshot(pageB, 'b-garage-after-leave.png');
  await waitFor(pageB, () => window.__DEBUG?.game?.phase === 'garage', 'B garage after leave', 10_000);
} catch (error) {
  failures.push(error instanceof Error ? error.stack || error.message : String(error));
} finally {
  report.wallMs = elapsedMs();
  if (errors.length) failures.push(`${errors.length} browser error(s): ${errors.slice(0, 3).map((entry) => `${entry.page} ${entry.kind}: ${entry.text.slice(0, 200)}`).join(' | ')}`);
  report.pass = failures.length === 0;
  await writeFile(join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  const teardown = async () => {
    try { await browser?.close(); } catch { /* already gone */ }
    try { await vite?.close(); } catch { /* already gone */ }
    try { await rooms?.close(); } catch { /* already gone */ }
  };
  await Promise.race([teardown(), sleep(20_000)]);
}

if (json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`mp browser e2e: room ${report.room?.code ?? '-'} (invite v=${report.room?.inviteVersion ?? '-'}), load A ${report.load.a?.trace?.totalMs ?? '-'} ms / B ${report.load.b?.trace?.totalMs ?? '-'} ms, ` +
    `play ${playS} s: A saw B move ${report.play.a?.otherMovedM?.toFixed(1) ?? '-'} m and fire ${report.play.a?.otherShots ?? '-'}×; B saw A move ${report.play.b?.otherMovedM?.toFixed(1) ?? '-'} m and fire ${report.play.b?.otherShots ?? '-'}×; ` +
    `after A left: +${(report.afterHostLeft.snapshotsAfter ?? 0) - (report.afterHostLeft.snapshotsBefore ?? 0)} snapshots in ${keepS} s, admin → B after ${report.afterHostLeft.adminMigratedAfterMs ?? '-'} ms; ` +
    `B left cleanly: ${report.leave.serverPlayersAfter ? JSON.stringify(report.leave.serverPlayersAfter) : '-'}; ${report.errors.length} browser errors; ${report.wallMs} ms wall`);
  for (const failure of failures) console.log(`  FAIL: ${failure}`);
  console.log(`  screenshots: ${report.screenshots.join(', ')}`);
  console.log(report.pass ? 'mp browser e2e: PASS' : 'mp browser e2e: FAIL');
}
process.exitCode = report.pass ? 0 : 1;
