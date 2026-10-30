#!/usr/bin/env node
// The battle's key caps follow the live bindings (owner 2026-10-28: "make sure to relabel if a person changes it in
// settings"). Copyright (c) 2026 Kevin B. Liu. First-party tool; see NOTICE.md.
//
// On a built dist, every key cap the battle shows (each element marked data-key-cap="<action>": the tray's shell digits
// and consumables, the controls row, the minimap's, the gear's, the controls-hint strip's) must read its action's live
// binding (src/game/battleKeyCaps.ts). The receipt:
//   1. rebinds every action through Settings (its chip, a key press) to a key no default takes;
//   2. enters a battle and reads each cap against input.labelFor of its binding;
//   3. rebinds the ATGM again mid-battle from the pause menu and reads its cap;
//   4. turns the layout pad (a stand-in gamepad, its stick moving) and reads each cap against input.padLabelFor of its
//      pad binding, the hull's own system (the ATGM, else the reload, on a hull without suspension) naming LB where its
//      action has no pad button of its own.
// Exit 1 on any cap that does not read its binding.
//   node tools/battle-key-caps.browser.mjs --dist=<built dist> [--width=1440 --height=900]
import { spawn } from 'node:child_process';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { launchGuardedBrowser } from './browser-launch.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const option = (name, fallback = '') => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const dist = option('dist') && resolve(option('dist'));
if (!dist) throw new Error('Required: --dist=<built dist>');
const width = Number(option('width', '1440')), height = Number(option('height', '900'));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
/** The actions Settings rebinds, each to a key no default takes (the gear's Escape stays: the pause menu opens with it). */
const REBIND = [['selfRight', 'KeyU'], ['specialAction', 'KeyO'], ['atgm', 'KeyP'], ['reloadMagazine', 'KeyZ'], ['drone', 'KeyX'],
  ['smoke', 'Comma'], ['lights', 'Period'], ['roofGun', 'Slash'], ['aerialVision', 'Semicolon'], ['supplyAmmo', 'Quote'],
  ['supplyHeal', 'BracketLeft'], ['rangeReset', 'BracketRight'], ['rangeMoving', 'Backslash'], ['minimapZoom', 'Minus'],
  ['shell1', 'Digit7'], ['shell2', 'Digit8'], ['shell3', 'Digit9'], ['consumable1', 'Numpad1'], ['consumable2', 'Numpad2'],
  ['consumable3', 'Numpad3']];
const MID_BATTLE = ['atgm', 'Numpad5'];

const freePort = () => new Promise((done, fail) => {
  const probe = net.createServer(); probe.once('error', fail);
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)); });
});
const port = await freePort();
const server = spawn(process.execPath, [join(HERE, 'vercel-static-preview.mjs'), `--dist=${dist}`, `--port=${port}`, `--vercel-json=${join(HERE, '..', 'vercel.json')}`],
  { stdio: 'ignore' });
const origin = `http://127.0.0.1:${port}`;
for (let i = 0; i < 300 && !await fetch(origin).then(() => true, () => false); i++) await sleep(100);

const problems = [];
const browser = await launchGuardedBrowser(puppeteer, { headless: 'new', protocolTimeout: 900_000, defaultViewport: null,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', `--window-size=${width + 20},${height + 100}`] },
{ label: 'battle-key-caps' });
try {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.evaluateOnNewDocument(() => {
    Document.prototype.hasFocus = () => true;
    try { localStorage.setItem('cot.telemetry', 'off'); } catch { /* none */ }
  });
  await page.goto(`${origin}/?telemetry=off&debug=1`, { waitUntil: 'domcontentloaded', timeout: 600_000 });
  await page.waitForSelector('.cot-garage .cot-cards', { visible: true, timeout: 600_000 });
  await page.waitForFunction(() => !!window.__DEBUG?.input, { timeout: 120_000 });
  await sleep(1500);
  await page.evaluate(() => window.__PERF_HUD?.setVisible(false));

  // 1. every action rebound through Settings: its chip, then a key
  const rebind = async (action, key) => {
    const chip = `.cot-settings [data-bind="${action}:0"]`;
    await page.waitForSelector(chip, { timeout: 30_000 });
    await page.evaluate((sel) => { const el = document.querySelector(sel); el.scrollIntoView({ block: 'center' }); el.click(); }, chip);
    await sleep(150);
    await page.keyboard.press(key);
    await sleep(250);
    const bound = await page.evaluate((a) => window.__DEBUG.input.getBinding(a, 0), action);
    if (bound !== key) problems.push(`Settings did not rebind ${action} to ${key} (it holds ${bound})`);
  };
  await page.click('.cot-settings-slot button');
  await page.waitForSelector('.cot-set-panel', { visible: true, timeout: 30_000 });
  await page.evaluate(() => document.querySelector('.cot-set-tab[data-tab="controls"]')?.click());
  for (const [action, key] of REBIND) await rebind(action, key);
  await page.evaluate(() => document.querySelector('.cot-set-close')?.click());
  await sleep(600);

  // 2. a battle: each cap reads its binding
  await page.click('[data-nav="deploy"]').catch(() => page.click('.cot-battle-mode'));
  await page.waitForSelector('#cot-battle-menu.open [data-battle-launch]', { visible: true, timeout: 60_000 });
  await sleep(800);
  await page.click('#cot-battle-menu.open [data-battle-launch]');
  await page.waitForFunction(() => window.__DEBUG?.frameInfo?.player?.combat && !document.querySelector('.cot-bl.on'), { timeout: 600_000, polling: 250 });
  await page.waitForFunction(() => (window.__DEBUG.frameInfo.timeS ?? 0) > 0.5, { timeout: 120_000, polling: 250 });
  await sleep(1500);
  const read = (pad) => page.evaluate((onPad) => {
    const input = window.__DEBUG.input, spec = window.__DEBUG.frameInfo.player?.spec, shells = spec?.gun?.shells ?? [];
    const mixed = shells.some((s) => s?.guided === true) && shells.some((s) => s?.guided !== true);
    const system = spec?.hydropneumaticAim ? null : mixed ? 'atgm' : spec?.gun?.autoloader ? 'reloadMagazine' : null;
    const rows = [];
    for (const cap of document.querySelectorAll('[data-key-cap]')) {
      const action = cap.dataset.keyCap;
      // (the controls-hint strip names keyboard keys: a pad layout never shows it)
      if (onPad && cap.closest('.cot-hints')) continue;
      let expected;
      if (!onPad) expected = input.labelFor(input.getBinding(action, 0) ?? input.getBinding(action, 1));
      else {
        const index = input.getPadBinding(action) ?? (action === system ? input.getPadBinding('specialAction') : null);
        expected = index == null ? '' : input.padLabelFor(index);
      }
      rows.push({ action, shown: cap.textContent, expected, where: cap.closest('[class]')?.className?.split(' ')[0] ?? '' });
    }
    return rows;
  }, pad);
  const check = (rows, phase) => {
    if (!rows.length) problems.push(`${phase}: no key cap found`);
    for (const row of rows) if (row.shown !== row.expected) problems.push(`${phase}: ${row.action} (${row.where}) reads "${row.shown}", its binding "${row.expected}"`);
    console.log(`${phase}: ${rows.length} caps, ${rows.filter((row) => row.shown === row.expected).length} read their binding`);
  };
  check(await read(false), 'keyboard, rebound in Settings');

  // 3. mid-battle, from the pause menu
  await page.keyboard.press('Escape');
  await page.waitForSelector('.cot-set-panel', { visible: true, timeout: 30_000 }).catch(() => page.click('.cot-hud-gear'));
  await page.waitForSelector('.cot-set-panel', { visible: true, timeout: 30_000 });
  await page.evaluate(() => document.querySelector('.cot-set-tab[data-tab="controls"]')?.click());
  await rebind(...MID_BATTLE);
  await page.evaluate(() => document.querySelector('.cot-set-close')?.click());
  await sleep(1200);
  const mid = (await read(false)).filter((row) => row.action === MID_BATTLE[0]);
  check(mid, 'mid-battle rebind from the pause menu');

  // 4. a pad layout: a stand-in gamepad whose stick moves, so the input layer reads it as in use
  await page.evaluate(() => {
    const pad = { id: 'stand-in', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    let tick = 0;
    navigator.getGamepads = () => { tick++; pad.axes[0] = tick % 2 ? 0.4 : -0.4; pad.timestamp = performance.now(); return [pad]; };
    const connected = new Event('gamepadconnected');
    Object.defineProperty(connected, 'gamepad', { value: pad });
    window.dispatchEvent(connected);
  });
  await page.waitForFunction(() => window.__DEBUG.input.padActive(), { timeout: 30_000, polling: 100 }).catch(() => problems.push('the stand-in pad never read as in use'));
  await sleep(1200);
  check(await read(true), 'pad layout');
} finally {
  await browser.close().catch(() => {});
  server.kill();
}
if (problems.length) {
  console.log(`battle-key-caps: FAIL (${problems.length})`);
  for (const line of problems.slice(0, 60)) console.log(`  - ${line}`);
  process.exit(1);
}
console.log('battle-key-caps: PASS (every cap reads its binding: rebound in Settings, mid-battle, and on a pad layout)');
