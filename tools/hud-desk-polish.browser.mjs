#!/usr/bin/env node
// r10f (the notices session's blind critic on integ/229 11a74e4906): three rendered checks no other receipt makes.
// - A mouse layout's inline tray keeps 12 px from the drive gauge (the damage panel's gap to it): at 1024 wide the gauge
//   sat 4 px from the APFSDS slot.
// - A wrapped alert breaks before its "·" separator, never after it: "AMMUNITION TYPE EMPTY ·" ended a line at 1024x600
//   and on the phones.
// - The medal card's description never leaves one word on its last line ("last." alone at 1920x1080).
// No screenshot. node tools/hud-desk-polish.browser.mjs --url=http://127.0.0.1:5189 [--out=outputs/hud-desk-polish]
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const arg = (name, fallback) => process.argv.find((v) => v.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || fallback;
const url = arg('url', 'http://127.0.0.1:5189');
const out = resolve(arg('out', 'outputs/hud-desk-polish'));
const { chromium } = await import(arg('playwright-module', 'playwright'));
// [width, height, touch, checks]
const CASES = [
  [1000, 600, false, ['tray', 'alert', 'medal']], [1024, 600, false, ['tray', 'alert', 'medal']],
  [1024, 768, false, ['tray', 'alert', 'medal']], [1280, 720, false, ['tray', 'alert', 'medal']],
  [1366, 768, false, ['alert', 'medal']], [1920, 1080, false, ['alert', 'medal']],
  [320, 568, true, ['alert']], [360, 640, true, ['alert']], [390, 844, true, ['alert']], [740, 360, true, ['alert']],
  [667, 375, true, ['alert']], [844, 390, true, ['alert']],
];

/** In the page: the visual lines of an element's text, as the words that end each line. */
function lineEnds(selector) {
  const node = document.querySelector(selector);
  if (!node || !node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return null;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const words = [];
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const value = text.textContent;
    const pattern = /[^\s ]+/g;
    for (let match = pattern.exec(value); match; match = pattern.exec(value)) {
      const range = document.createRange();
      range.setStart(text, match.index);
      range.setEnd(text, match.index + match[0].length);
      const rect = range.getClientRects()[0];
      if (rect) words.push({ word: match[0], top: Math.round(rect.top) });
    }
  }
  const lines = [];
  for (const { word, top } of words) {
    const line = lines.find((l) => Math.abs(l.top - top) < 3);
    if (line) line.words.push(word); else lines.push({ top, words: [word] });
  }
  return lines.sort((a, b) => a.top - b.top).map((l) => l.words);
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-gpu'] });
const reports = [];
const failures = [];
try {
  for (const [width, height, touch, checks] of CASES) {
    const size = `${width}x${height}${touch ? ' touch' : ''}`;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1,
      reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', (error) => failures.push(`${size}: ${error.message}`));
    await page.goto(`${url}/tools/fixtures/battle-hud-layout.html?locale=en-US`, { waitUntil: 'networkidle', timeout: 300_000 });
    await page.waitForFunction(() => !!window.__HUD_LAYOUT, null, { timeout: 300_000 });
    await page.evaluate(() => document.fonts?.ready);
    const report = { size };
    if (checks.includes('tray')) {
      report.tray = await page.evaluate(async () => {
        window.__HUD_LAYOUT.state('ammo-dry-autoloader');
        for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame);
        await new Promise((done) => setTimeout(done, 400));
        const shown = (s) => [...document.querySelectorAll(s)].filter((e) => e.checkVisibility({ checkOpacity: true }));
        const gauge = shown('.cot-drive')[0]?.getBoundingClientRect();
        const slots = shown('.cot-shell').map((e) => e.getBoundingClientRect());
        if (!gauge || !slots.length) return null;
        return Math.min(...slots.map((b) => Math.max(b.left - gauge.right, gauge.left - b.right, b.top - gauge.bottom, gauge.top - b.bottom)));
      });
      if (report.tray === null) failures.push(`${size}: no gauge or tray`);
      else if (report.tray < 12 - 0.5) failures.push(`${size}: the drive gauge keeps ${report.tray.toFixed(1)} px from the tray (12)`);
    }
    if (checks.includes('alert')) {
      report.alert = await page.evaluate(async (lineEndsSource) => {
        const lineEnds = new Function(`return ${lineEndsSource}`)();
        const f = window.__HUD_LAYOUT;
        f.state('ammo-dry-cannon');
        f.bus.emit('ammo:empty', { id: f.frame.player.id });
        for (let i = 0; i < 30; i++) { f.frame.timeS += 1 / 60; f.hud.update(f.frame); }
        for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame);
        await new Promise((done) => setTimeout(done, 400));
        return lineEnds('.cot-alert.show .cot-alert-copy');
      }, lineEnds.toString());
      if (!report.alert) failures.push(`${size}: no alert shown`);
      else for (const words of report.alert.slice(0, -1)) {
        if (words[words.length - 1] === '·') failures.push(`${size}: the alert's line ends with its separator: "${words.join(' ')}"`);
      }
    }
    if (checks.includes('medal')) {
      report.medal = await page.evaluate(async (lineEndsSource) => {
        const lineEnds = new Function(`return ${lineEndsSource}`)();
        const { MEDALS } = await import('/src/game/serviceRecord.ts');
        const f = window.__HUD_LAYOUT;
        f.state('ammo-reload');
        f.bus.emit('battle:presented');
        f.bus.emit('service:medal', { id: MEDALS[0].id });
        for (let i = 0; i < 12; i++) await new Promise(requestAnimationFrame);
        await new Promise((done) => setTimeout(done, 600));
        return lineEnds('.cot-medal-toast small');
      }, lineEnds.toString());
      if (report.medal && report.medal.length > 1 && report.medal[report.medal.length - 1].length === 1) {
        failures.push(`${size}: the medal's description leaves "${report.medal[report.medal.length - 1][0]}" alone on its last line`);
      }
    }
    reports.push(report);
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(resolve(out, 'report.json'), JSON.stringify({ reports, failures }, null, 1));
}
console.log(`${reports.length} sizes; ${failures.length} failures. ${out}`);
if (failures.length) { console.log(failures.join('\n')); process.exitCode = 1; }
