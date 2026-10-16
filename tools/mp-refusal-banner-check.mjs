#!/usr/bin/env node
// mp-refusal-banner-check.mjs [--out=<dir>] [--width=1024 --height=640]: the version refusal in a real browser
// (2026-10-14, deploy 223's MP window: an old tab's "Refresh the page to join" sat in the lobby status line, out of view
// at 1024x640, under a Rejoin battle that could only be refused again). The tool boots this tree's Garage (vite dev,
// headless Chrome), opens the real play menu module on a held room whose match runs, and checks:
//   1. before any refusal, Rejoin battle shows (the control);
//   2. a build refusal (build_host_newer) shows the banner with its localized words and a Refresh button, entirely inside
//      the viewport, and focused; the lobby's status line stays empty; Rejoin battle is hidden;
//   3. the banner stays in view after the panel scrolls to its end;
//   4. Refresh calls the page reload (injected here);
//   5. a non-version refusal (match_ended) uses the status line and leaves Rejoin to the room's rule.
// Screenshots land in --out. Run under memcap and a timeout, on a capture-lock ticket (a headless browser).
import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';
import net from 'node:net';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = (name, fallback) => (process.argv.find((value) => value.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).slice(name.length + 3);
const tree = resolve('.');
const outDir = resolve(arg('out', join(tree, '.qa-mp/refusal-banner')));
const width = Number(arg('width', 1024)), height = Number(arg('height', 640));
await mkdir(outDir, { recursive: true });
const freePort = () => new Promise((done) => { const probe = net.createServer(); probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)); }); });

const { createServer } = await import(pathToFileURL(join(tree, 'node_modules/vite/dist/node/index.js')).href);
const port = await freePort();
const server = await createServer({ root: tree, configFile: join(tree, 'vite.config.ts'), cacheDir: join(outDir, 'vite-cache'), logLevel: 'error',
  server: { host: '127.0.0.1', port, strictPort: true, hmr: false } });
await server.listen();
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 300_000,
  args: ['--no-sandbox', '--use-gl=angle', '--enable-webgl', `--window-size=${width},${height}`] });
const failures = [];
const check = (ok, label) => { if (!ok) failures.push(label); console.log(`${ok ? '  ok ' : 'FAIL '} ${label}`); };
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message ?? error)));
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/?nosplash=1&tier=desktop`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  await page.waitForFunction(() => window.__GAME_READY === true && window.__DEBUG?.game?.phase === 'garage', { timeout: 300_000, polling: 250 });
  // the real menu module, a held room whose match runs, and a session with this seat's match_start
  await page.evaluate(async () => {
    const { createPlayMenu } = await import('/src/ui/playMenu.ts');
    window.__reloads = 0;
    const menu = createPlayMenu({
      getSelection: () => ({ specId: 'm1a1_abrams_hc', equipment: [], camo: 'factory', mapId: null }),
      onSolo: () => {}, onNetworkStart: () => {}, reloadPage: () => { window.__reloads++; },
    });
    document.body.appendChild(menu.root);
    const player = (id, name, isHost) => ({ id, name, team: 'alpha', specId: 'm1a1_abrams_hc', equipment: [], camo: 'factory', ready: true, connected: true, isHost, rating: null });
    const state = { roomCode: 'ABC123', mode: 'private', gameMode: 'standard', phase: 'playing', hostId: 'p2', maxPlayers: 6, maxSpectators: 2,
      allowTeamSwitch: true, locked: false, mapId: 'verdant', teamSize: 3, arrangement: null, campaignOperationId: null, revision: 1,
      matchSeed: 7, round: 1, lastResult: null, players: [player('p1', 'Me', false), player('p2', 'Host', true)] };
    menu.attachActiveRoom({ state, playerId: 'p1', role: 'client', session: { lastMatchStart: { matchId: 'm1' } }, command() {}, leave() {} });
    window.__menu = menu;
  });
  const read = () => page.evaluate(() => {
    const root = window.__menu.root;
    const banner = root.querySelector('.version-refusal');
    const rect = banner && !banner.hidden ? banner.getBoundingClientRect() : null;
    const refresh = root.querySelector('[data-action="refresh-page"]');
    const refreshRect = refresh && !banner.hidden ? refresh.getBoundingClientRect() : null;
    const rejoin = root.querySelector('[data-action="rejoin"]');
    const status = root.querySelector('.status');
    return {
      banner: rect ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } : null,
      bannerText: banner?.textContent?.trim() ?? '', focused: document.activeElement === banner,
      refresh: refreshRect ? { top: refreshRect.top, bottom: refreshRect.bottom, visible: refreshRect.width > 0 && refreshRect.height > 0 } : null,
      rejoinHidden: !!rejoin?.hidden || getComputedStyle(rejoin).display === 'none',
      status: status?.hidden ? '' : (status?.textContent ?? ''),
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  const inView = (box, viewport) => !!box && box.top >= 0 && box.left >= 0 && box.bottom <= viewport.height && box.right <= viewport.width;

  await page.evaluate(() => window.__menu.showActiveRoom());
  const before = await read();
  check(!before.rejoinHidden, 'before a refusal, Rejoin battle shows while the match runs');
  check(!before.banner, 'no banner before a refusal');
  await page.screenshot({ path: join(outDir, 'before.png') });

  await page.evaluate(() => window.__menu.showActiveRoom('Refresh the page to join: your game version differs from the host\'s. A newer version of the game is out.', 'build_host_newer'));
  const refused = await read();
  check(inView(refused.banner, refused.viewport), `the banner is entirely in view at ${width}x${height} (${JSON.stringify(refused.banner)})`);
  check(/Refresh/i.test(refused.bannerText) && /newer version/i.test(refused.bannerText), `the banner carries the localized words (${refused.bannerText.slice(0, 140)})`);
  check(!!refused.refresh?.visible && refused.refresh.bottom <= refused.viewport.height, 'the Refresh button is visible in view');
  check(refused.focused, 'the banner takes focus');
  check(refused.rejoinHidden, 'Rejoin battle is hidden while the refusal stands');
  check(refused.status === '', 'the status line stays empty');
  await page.screenshot({ path: join(outDir, 'refused.png') });

  await page.evaluate(() => { const panel = window.__menu.root.querySelector('.panel'); panel.scrollTop = panel.scrollHeight; });
  const scrolled = await read();
  check(inView(scrolled.banner, scrolled.viewport), `scrolled to the panel's end, the banner stays in view (${JSON.stringify(scrolled.banner)})`);
  await page.screenshot({ path: join(outDir, 'refused-scrolled.png') });

  // the menu built here, not the app's own (the Garage holds another .cot-play). What a pointer at the button's centre
  // hits is reported (this page stacks two menus; the app's own is the one players see), and the button's own click
  // proves the wiring.
  const hit = await page.evaluate(() => {
    const button = window.__menu.root.querySelector('[data-action="refresh-page"]');
    const rect = button.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { onButton: !!top && button.contains(top), top: top ? `${top.tagName.toLowerCase()}.${String(top.className).slice(0, 60)}` : null };
  });
  check(hit.onButton, `scrolled, a pointer at Refresh hits the button, nothing covers it (${hit.top})`);
  await page.evaluate(() => window.__menu.root.querySelector('[data-action="refresh-page"]').click());
  check(await page.evaluate(() => window.__reloads) === 1, 'Refresh reloads the page');

  await page.evaluate(() => window.__menu.showActiveRoom('The match ended while you were joining.', 'match_ended'));
  const ended = await read();
  check(/ended/i.test(ended.status), `a non-version refusal keeps the status line (${ended.status.slice(0, 80)})`);
  check(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ')})`);
} catch (error) {
  failures.push(error instanceof Error ? error.stack || error.message : String(error));
} finally {
  await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
console.log(`mp refusal banner check: ${failures.length ? 'FAIL' : 'PASS'} at ${width}x${height}${failures.length ? `\n  ${failures.join('\n  ')}` : ''} (screenshots ${outDir})`);
process.exit(failures.length ? 1 : 0);
