#!/usr/bin/env node
// r10e (the coordinator, from the notices session's blind critic on integ/229 ce8b634668): on a touch layout the centre
// notices kept no distance from the reticle. The detection and the alert sat on the aim point, the ring, the struck round
// and rack, the scope's circle and readouts and its vision plate, the alert on the pre-battle countdown's digit, the
// countdown on the ring and the medal card on the scope's readout row. This rendered regression stages the critic's
// scenes (out-of-ammo states, the battle sight and the scope, at full bloom and at rest, with the detection, the alert,
// the countdown and a medal) at every touch size, records the reticle's real ink (recordReticle) and measures each notice
// against it, the seated warning chip, the vision plate, the aim hint and the other notices: each keeps 3 px. Where the
// layout found no place that keeps clear (body[data-touch-notices~='uncleared'], touchNoticePlan.ts) the gaps are notes,
// not failures, and the report lists them. No screenshot.
// node tools/hud-touch-notices.browser.mjs --url=http://127.0.0.1:5189 [--out=outputs/hud-touch-notices] [--case=360x640,...]
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { recordReticle } from './hud-ammo-capture.mjs';

const arg = (name, fallback) => process.argv.find((v) => v.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || fallback;
const url = arg('url', 'http://127.0.0.1:5189');
const out = resolve(arg('out', 'outputs/hud-touch-notices'));
const { chromium } = await import(arg('playwright-module', 'playwright'));
const TOUCH_NOTICE_SIZES = ['320x568', '360x640', '375x667', '390x844', '768x1024', '1024x768', '568x256', '568x290', '568x320',
  '640x360', '667x375', '740x360', '844x300', '844x390', '932x430'];
// [name, the fixture's out-of-ammo stage, sight, bloom, gun travel warning, what shows] (the critic's scenes, and two at rest)
const TOUCH_NOTICE_SCENES = [
  ['a-dry-gun-battle', 'ammo-dry-cannon', 'battle', 'full', true, 'det+alert'],
  ['b-rack-reloading-scope', 'ammo-reload-autoloader-sniper', 'scope', 'full', true, 'det+medal'],
  ['c-dry-rack-countdown', 'ammo-dry-autoloader', 'battle', 'rest', false, 'countdown+alert'],
  ['d-dry-gun-scope', 'ammo-dry-cannon', 'scope', 'full', false, 'det+alert'],
  ['e-dry-rack-battle-medal', 'ammo-dry-autoloader', 'battle', 'full', true, 'medal+alert'],
  ['f-reload-scope-rest', 'ammo-reload-sniper-warn', 'scope', 'rest', true, 'det+alert'],
  ['g-reload-battle-rest', 'ammo-reload', 'battle', 'rest', true, 'det+alert'],
];
const NOTICES = ['detection', 'alert', 'countdown', 'medal'];

/** In the page: stages a scene and returns the notices' boxes, the reticle's ink, the chip, the plate and the hint. */
async function stageScene([stage, sight, bloom, warn, set]) {
  const { MEDALS } = await import('/src/game/serviceRecord.ts');
  const f = window.__HUD_LAYOUT;
  document.querySelector('.cot-hud').classList.remove('rosters-expanded');
  f.bus.emit('battle:presented');
  f.state(stage);
  f.frame.mode = sight === 'scope' ? 'sniper' : 'battle';
  f.hud.setMode(f.frame.mode);
  Object.assign(f.frame.aim, { zoom: sight === 'scope' ? 25 : 1, distM: 1500, dispersionRadM: bloom === 'full' ? 1e4 : 1e-4, gunLimitSpec: warn });
  for (const part of set.split('+')) {
    if (part === 'det') f.bus.emit('player:spotted', { timeS: f.frame.timeS - 4 });
    else if (part === 'alert') f.bus.emit('ammo:empty', { id: f.frame.player.id });
    else if (part === 'countdown') f.hud.preBattleCountdown(5);
    else if (part === 'medal') f.bus.emit('service:medal', { id: MEDALS[0].id });
  }
  for (let i = 0; i < 150; i++) { f.frame.timeS += 1 / 60; f.hud.update(f.frame); }
  await new Promise((done) => setTimeout(done, 250));
  window.dispatchEvent(new Event('cot-hud-relayout'));
  for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
  const running = document.getAnimations().filter((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime));
  await Promise.race([Promise.all(running.map((a) => a.finished.catch(() => {}))), new Promise((done) => setTimeout(done, 1500))]);
  f.frame.timeS += 1 / 60;
  f.hud.update(f.frame);
  for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
  const box = (selector) => {
    const node = document.querySelector(selector);
    if (!node || !node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return null;
    const r = node.getBoundingClientRect();
    return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
  };
  return {
    detection: box('.cot-sixth.on'), alert: box('.cot-alert.show'), countdown: box('.cot-prebattle.on'),
    medal: document.querySelector('.cot-medal-toasts')?.dataset.placement === 'ready' ? box('.cot-medal-toasts .cot-medal-toast') : null,
    chip: box('.cot-aim-warning:not([hidden])'), vision: box('.cot-scope-vision'), hint: box('.cot-touch-aim.on .aimhint'),
    ink: window.__RETICLE_LOG.paint.filter((op) => op.box).map((op) => ({ ...op.box, what: op.text ?? (op.ring ? 'ring' : op.op) })),
    uncleared: (document.body.dataset.touchNotices ?? '').split(' ').includes('uncleared'),
  };
}

/** Every notice's least gap to the ink, the chip, the plate, the hint and the other notices, and to what. */
function noticeGaps(scene) {
  const apart = (a, b) => Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
  const gaps = {};
  for (const name of NOTICES) {
    const notice = scene[name];
    if (!notice) continue;
    let least = [Infinity, ''];
    for (const ink of scene.ink) { const gap = apart(notice, ink); if (gap < least[0]) least = [gap, `ink ${ink.what}`]; }
    for (const other of ['chip', 'vision', 'hint', ...NOTICES]) {
      if (other === name || !scene[other]) continue;
      const gap = apart(notice, scene[other]);
      if (gap < least[0]) least = [gap, other];
    }
    gaps[name] = least;
  }
  return gaps;
}

await mkdir(out, { recursive: true });
const sizes = TOUCH_NOTICE_SIZES.filter((size) => !arg('case', '') || arg('case', '').split(',').includes(size));
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-gpu'] });
const reports = [];
const failures = [];
try {
  for (const size of sizes) {
    const [width, height] = size.split('x').map(Number);
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
      reducedMotion: 'reduce' });
    await context.addInitScript(recordReticle);
    for (const [scene, ...staging] of TOUCH_NOTICE_SCENES) {
      const page = await context.newPage();
      page.on('pageerror', (error) => failures.push(`${size} ${scene}: ${error.message}`));
      await page.goto(`${url}/tools/fixtures/battle-hud-layout.html?locale=en-US`, { waitUntil: 'networkidle', timeout: 300_000 });
      await page.waitForFunction(() => !!window.__HUD_LAYOUT, null, { timeout: 300_000 });
      await page.evaluate(() => document.fonts?.ready);
      const staged = await page.evaluate(stageScene, staging);
      const gaps = noticeGaps(staged);
      const short = Object.entries(gaps).filter(([, [gap]]) => gap < 3 - 1e-6);
      for (const [name, [gap, what]] of short) {
        const line = `${size} ${scene}: the ${name} keeps ${gap.toFixed(2)} px from ${what}`;
        if (!staged.uncleared) failures.push(line);
      }
      reports.push({ size, scene, staging, gaps, uncleared: staged.uncleared, short: short.map(([name, [gap, what]]) => ({ name, gap, what })) });
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(resolve(out, 'report.json'), JSON.stringify({ reports, failures }, null, 1));
}
const notes = reports.filter((r) => r.uncleared && r.short.length);
console.log(`${reports.length} touch notice scenes; ${failures.length} failures; ${notes.length} scenes with no clear place. ${out}`);
for (const r of notes) console.log(`  note ${r.size} ${r.scene}: ${r.short.map((s) => `${s.name} ${s.gap.toFixed(2)} from ${s.what}`).join(', ')}`);
if (failures.length) { console.log(failures.join('\n')); process.exitCode = 1; }
