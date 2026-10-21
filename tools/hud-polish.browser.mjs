#!/usr/bin/env node
// r10f and r10g (the notices session's blind critic on integ/229 11a74e4906, and the r10e critic): rendered checks no
// other receipt makes.
// - A mouse layout's inline tray keeps 12 px from the drive gauge (the damage panel's gap to it): at 1024 wide the gauge
//   sat 4 px from the APFSDS slot.
// - A wrapped alert breaks before its "·" separator, never after it: "AMMUNITION TYPE EMPTY ·" ended a line at 1024x600
//   and on the phones; and the separator sits midway between its words (r10g: the no-break space that kept it with the
//   next word was set narrower, "EMPTY ·SELECT").
// - The medal card's description never leaves one word on its last line ("last." alone at 1920x1080).
// - A small portrait phone's systems row shows whole (at 320 wide it scrolled "Auto gun" off the screen), and through the
//   scope, at full bloom and at rest, with the gun travel warning, the reticle's ink and the seated chip keep 3 px from its
//   buttons (the readouts landed on its labels at 320x568, the chip on its key badges at 360x640) and the ink keeps 3 px
//   from the round touch buttons (the rack and the struck round sat on the left FIRE button at 320x568).
// - A portrait phone 340 px wide or less parks the gun travel chip under the map (the coordinator, r10g: seated by the
//   sight it ran 12 px into the left FIRE button at 320x568), in battle and through the scope, at full bloom and at rest:
//   it keeps 3 px from the reticle's ink, the controls and the panels, and the struck round or rack is painted with no
//   DOM chip, notice or panel over it. At 360x640 the chip stays seated by the sight.
// No screenshot. node tools/hud-polish.browser.mjs --url=http://127.0.0.1:5189 [--out=outputs/hud-polish]
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { recordReticle } from './hud-ammo-capture.mjs';

const arg = (name, fallback) => process.argv.find((v) => v.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || fallback;
const url = arg('url', 'http://127.0.0.1:5189');
const out = resolve(arg('out', 'outputs/hud-polish'));
const { chromium } = await import(arg('playwright-module', 'playwright'));
// [width, height, touch, checks]
// the controls and panels a parked chip keeps clear of (hud-touch-notices.browser.mjs FURNITURE)
const FURNITURE = ['.cot-vehicle-controls>button', '.cot-shell', '.cot-con', '.cot-touch.on .round', '.cot-touch.on .round>.lb',
  '.cot-touch.on .joy', '.cot-touch.on .quick', '.cot-dp', '.cot-drive', '.cot-minimap', '.cot-top', '.cot-mode-status.show',
  '.cot-ear', '.flight-identity', '.cot-scope-vision'];
const CASES = [
  [1000, 600, false, ['tray', 'alert', 'medal']], [1024, 600, false, ['tray', 'alert', 'medal']],
  [1024, 768, false, ['tray', 'alert', 'medal']], [1280, 720, false, ['tray', 'alert', 'medal']],
  [1366, 768, false, ['alert', 'medal']], [1920, 1080, false, ['alert', 'medal']],
  [320, 568, true, ['alert', 'systems', 'chip']], [360, 640, true, ['alert', 'systems', 'chip']], [375, 667, true, ['systems']],
  [390, 844, true, ['alert']], [740, 360, true, ['alert']],
  [667, 375, true, ['alert']], [844, 390, true, ['alert']],
];

/** In the page: the visual lines of an element's text, as its words (`boxes`: each word's left and right too). */
function lineEnds(selector, boxes = false) {
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
      if (rect) words.push({ word: match[0], top: Math.round(rect.top), x0: rect.left, x1: rect.right });
    }
  }
  const lines = [];
  for (const entry of words) {
    const line = lines.find((l) => Math.abs(l.top - entry.top) < 3);
    const item = boxes ? entry : entry.word;
    if (line) line.words.push(item); else lines.push({ top: entry.top, words: [item] });
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
    await context.addInitScript(recordReticle);
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
        return lineEnds('.cot-alert.show .cot-alert-copy', true);
      }, lineEnds.toString());
      if (!report.alert) failures.push(`${size}: no alert shown`);
      else for (const [index, words] of report.alert.entries()) {
        const text = words.map((w) => w.word.replace(/\u2060/g, '')).join(' ');
        if (index < report.alert.length - 1 && words[words.length - 1].word === '·') {
          failures.push(`${size}: the alert's line ends with its separator: "${text}"`);
        }
        // (a separator between two words on its line sits midway: the spaces either side within a pixel and a half)
        for (let i = 1; i < words.length - 1; i++) {
          if (words[i].word !== '·') continue;
          const before = words[i].x0 - words[i - 1].x1;
          const after = words[i + 1].x0 - words[i].x1;
          if (Math.abs(before - after) > 1.5) {
            failures.push(`${size}: the alert's separator sits off its middle, ${before.toFixed(1)} px after "${words[i - 1].word}" and ${after.toFixed(1)} px before "${words[i + 1].word.replace(/\u2060/g, '')}"`);
          }
        }
      }
      report.alert = report.alert?.map((words) => words.map((w) => w.word));
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
    if (checks.includes('systems')) {
      report.systems = [];
      for (const [stage, bloom] of [['ammo-reload-autoloader-sniper', 'full'], ['ammo-dry-cannon', 'full'], ['ammo-reload-sniper-warn', 'rest']]) {
        const seen = await page.evaluate(async ([stage, bloom]) => {
          const f = window.__HUD_LAYOUT;
          f.state(stage);
          f.frame.mode = 'sniper';
          f.hud.setMode('sniper');
          Object.assign(f.frame.aim, { zoom: 25, distM: 1500, dispersionRadM: bloom === 'full' ? 1e4 : 1e-4, gunLimitSpec: true });
          for (let i = 0; i < 90; i++) { f.frame.timeS += 1 / 60; f.hud.update(f.frame); }
          window.dispatchEvent(new Event('cot-hud-relayout'));
          for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame);
          await new Promise((done) => setTimeout(done, 400));
          f.frame.timeS += 1 / 60;
          f.hud.update(f.frame);
          for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
          const row = document.querySelector('.cot-vehicle-controls');
          const buttons = [...row.children].filter((b) => b.checkVisibility()).map((b) => {
            const r = b.getBoundingClientRect();
            return { label: b.textContent.trim(), x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
          });
          const chip = document.querySelector('.cot-aim-warning[data-seat]:not([hidden])')?.getBoundingClientRect();
          const marks = window.__RETICLE_LOG.paint.filter((op) => op.box).map((op) => ({ ...op.box, what: op.text ?? (op.ring ? 'ring' : op.op) }));
          if (chip) marks.push({ x0: chip.left, y0: chip.top, x1: chip.right, y1: chip.bottom, what: 'the seated chip' });
          const apart = (a, b) => Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
          let least = [Infinity, ''];
          for (const button of buttons) for (const mark of marks) {
            const gap = apart(button, mark);
            if (gap < least[0]) least = [gap, `${mark.what} and the ${button.label.replace(/\s+/g, ' ')} button`];
          }
          // (the ink only: the seated chip's tight window at 320 wide is the selftest's TIGHT_FLOOR)
          let control = [Infinity, ''];
          for (const node of document.querySelectorAll('.cot-touch.on .round')) {
            if (!node.checkVisibility()) continue;
            const r = node.getBoundingClientRect();
            const box = { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
            for (const mark of marks) {
              if (mark.what === 'the seated chip') continue;
              const gap = apart(box, mark);
              if (gap < control[0]) control = [gap, `${mark.what} and the ${node.textContent.trim().replace(/\s+/g, ' ') || node.className} touch button`];
            }
          }
          const offscreen = buttons.filter((b) => b.x0 < -0.5 || b.x1 > innerWidth + 0.5).map((b) => b.label);
          return { scroll: row.scrollWidth - row.clientWidth, offscreen, least, control };
        }, [stage, bloom]);
        report.systems.push({ stage, bloom, ...seen });
        if (seen.scroll > 1 || seen.offscreen.length) failures.push(`${size} ${stage}: the systems row runs past its box or the screen (${seen.offscreen.join(', ') || `${seen.scroll} px`})`);
        for (const [gap, what] of [seen.least, seen.control]) {
          if (gap < 3 - 1e-6) failures.push(`${size} ${stage} at ${bloom} bloom: ${what} keep ${gap.toFixed(2)} px apart`);
        }
      }
    }
    if (checks.includes('chip')) {
      report.chip = [];
      const parks = width <= 340 && height >= width;
      for (const [stage, sight, bloom] of [['ammo-dry-cannon', 'battle', 'full'], ['ammo-dry-cannon', 'scope', 'rest'],
        ['ammo-dry-autoloader', 'battle', 'rest'], ['ammo-dry-autoloader', 'scope', 'full']]) {
        const seen = await page.evaluate(async ([stage, sight, bloom, furniture]) => {
          const f = window.__HUD_LAYOUT;
          f.state(stage);
          f.frame.mode = sight === 'scope' ? 'sniper' : 'battle';
          f.hud.setMode(f.frame.mode);
          Object.assign(f.frame.aim, { zoom: sight === 'scope' ? 25 : 1, distM: 1500, dispersionRadM: bloom === 'full' ? 1e4 : 1e-4, gunLimitSpec: true });
          for (let i = 0; i < 90; i++) { f.frame.timeS += 1 / 60; f.hud.update(f.frame); }
          window.dispatchEvent(new Event('cot-hud-relayout'));
          for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame);
          await new Promise((done) => setTimeout(done, 400));
          f.frame.timeS += 1 / 60;
          f.hud.update(f.frame);
          for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
          const apart = (a, b) => Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
          const box = (node) => { const r = node.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; };
          const shown = (node) => node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
          const chipNode = document.querySelector('.cot-aim-warning:not([hidden])');
          if (!chipNode || !shown(chipNode)) return { chip: null };
          const chip = box(chipNode);
          const map = document.querySelector('.cot-minimap');
          // (a scope tick keeps 2 px from what it passes, hud.ts SCOPE_TICK_GAP; every other mark 3)
          const ink = window.__RETICLE_LOG.paint.filter((op) => op.box).map((op) => ({ ...op.box, what: op.text ?? (op.ring ? 'ring' : op.op),
            shell: op.n === 7, keep: op.op === 'stroke' && op.n === 2 ? 2 : 3 }));
          const blocks = furniture.flatMap((selector) => [...document.querySelectorAll(selector)].filter(shown)
            .map((node) => ({ ...box(node), what: selector, keep: 3 })));
          // (the least gap less what that mark keeps, and the gap itself)
          let least = [Infinity, '', Infinity];
          for (const other of [...ink, ...blocks]) {
            const gap = apart(chip, other);
            if (gap - other.keep < least[0]) least = [gap - other.keep, other.what, gap];
          }
          // (the empty gun's marks: the struck round's or the rack's shells, magazineShellPath, and what covers them)
          const shells = ink.filter((mark) => mark.shell);
          const covers = [];
          for (const node of document.querySelectorAll('.cot-aim-warning:not([hidden]),.cot-sixth.on,.cot-alert.show,.cot-prebattle.on,.cot-medal-toast,.cot-vehicle-controls>button,.cot-touch.on .round,.cot-touch.on .round>.lb,.cot-scope-vision')) {
            if (!shown(node)) continue;
            const b = box(node);
            for (const mark of shells) if (apart(b, mark) < 0) { covers.push(node.className); break; }
          }
          return { chip, seated: chipNode.dataset.seat === 'sight', underMap: !!map && chip.y0 >= map.getBoundingClientRect().bottom,
            least, shells: shells.length, covers };
        }, [stage, sight, bloom, FURNITURE]);
        report.chip.push({ stage, sight, bloom, ...seen });
        const at = `${size} ${stage} ${sight} at ${bloom} bloom`;
        if (!seen.chip) { failures.push(`${at}: no gun travel chip shown`); continue; }
        if (parks && (seen.seated || !seen.underMap)) failures.push(`${at}: the gun travel chip is ${seen.seated ? 'seated by the sight' : 'not under the map'}, not parked under the map`);
        if (!parks && !seen.seated) failures.push(`${at}: the gun travel chip left its seat by the sight`);
        if (seen.least[0] < -1e-6) failures.push(`${at}: the gun travel chip keeps ${seen.least[2].toFixed(2)} px from ${seen.least[1]}`);
        if (!seen.shells) failures.push(`${at}: no struck round or rack painted`);
        if (seen.covers.length) failures.push(`${at}: the struck round or rack lies under ${seen.covers.join(', ')}`);
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
