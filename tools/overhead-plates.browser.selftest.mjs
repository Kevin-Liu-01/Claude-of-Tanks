#!/usr/bin/env node
// The readouts over the tanks hold still (overhead-labels-278; owner 2026-11-25: "for the lil things above tanks fix them,
// they can glitch out and have layout shifts", "like the name tank type stuff readouts"). Copyright © 2026 Kevin B. Liu.
// First-party tool; see NOTICE.md.
//
// On the HUD layout fixture's markers (tools/fixtures/battle-hud-layout.html?state=markers: the hull bars over the tanks in
// view and the target plate over the enemy under the gun), one HUD frame per animation frame, the camera fixed. It reads
// what is drawn: each shown plate's box and its text lines' boxes every frame, the z-index and faint state as written,
// and the page's layout-shift entries whose sources sit in a plate.
// - still: 60 frames with nothing changing move no plate and no line (0.05 px), show or hide none, restack none.
// - range: the player backs away 0.1 m a frame for 150 frames, from 93.5 m to 108.5 m of the target, so its plate's range
//   figure changes 15 times and crosses 99 to 100 with the camera and the target still: the plate, its name, tier and
//   vehicle lines and the figure's left edge move 0.5 px at most. A figure centred with the vehicle on its line walked the
//   vehicle's name half a digit left at 100 m (and at 1,000), the plate's width kept.
// - points: the target loses hull points in 40 steps: the plate and its name, tier and vehicle lines move 0.5 px at most,
//   and the points line changes width only where its character count does.
// - order: two enemy hulls side by side, their bars overlapping, their ranges crossing by 0.05 m every frame for 60 frames:
//   after the first 2 frames neither bar restacks nor turns faint or back. Sorted by range alone, the two swapped on top
//   every frame and each one's words flashed faint and full.
// - shifts: no layout-shift entry with a source inside the plates over all of it.
// --negative-control puts the mechanisms back in the page (the range figure in proportional digits on a centred line and
// the bars' stack by range alone, through the fixture's own HUD) and must see them: it exits 1 when range or order pass.
//   node tools/overhead-plates.browser.selftest.mjs [--url=http://127.0.0.1:5173] [--negative-control] [--sizes=1920x1080,390x844t]
// Takes the shared capture lock (render class); with no --url it serves this checkout on its own vite server and cache.
import puppeteer from 'puppeteer';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold } from './capture-hold.mjs';
let hold;

const option = (name, fallback = '') => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
let base = option('url').replace(/\/$/, '');
const negative = process.argv.includes('--negative-control');
const shots = option('shots');
const SIZES = option('sizes', '1920x1080,390x844t,844x390t').split(',').map((s) => {
  const touch = s.endsWith('t');
  const [width, height] = s.replace(/t$/, '').split('x').map(Number);
  return { name: s, width, height, touch };
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STILL_PX = 0.05, MOVE_PX = 0.5;
/** A phone's band between its panels holds one hull bar (the fixture's near ally); a desktop's the five seats'. */
const minBars = (s) => (s.width < 720 || s.height < 520 ? 1 : 2);

/** In the page: the probe's state and its helpers (installed once per page). */
function install() {
  // (the shifts inside the measured frames only: a staging step's relabel moves a plate's words once, by design)
  const probe = window.__PLATES = { shifts: [], windows: [] };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      for (const source of entry.sources ?? []) {
        const node = source.node?.nodeType === 1 ? source.node : source.node?.parentElement;
        if (node?.closest?.('.cot-hpbars, .cot-tgt') && probe.windows.some(([t0, t1]) => entry.startTime >= t0 && entry.startTime <= t1)) {
          probe.shifts.push(`${node.className || node.tagName} ${entry.value.toFixed(4)}`);
        }
      }
    }
  }).observe({ type: 'layout-shift', buffered: true });
  const box = (el) => {
    if (!el || !el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) return null;
    const r = el.getBoundingClientRect();
    return r.width || r.height ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  };
  /** Every shown plate: its box, its lines' boxes, its stack place and faint state, keyed by its name line. */
  probe.snap = () => {
    const plates = {};
    for (const el of document.querySelectorAll('.cot-hpbars .cot-hpb')) {
      const root = box(el);
      if (!root) continue;
      plates[`bar:${el.querySelector('.nm span')?.textContent ?? ''}`] = { root,
        lines: { name: box(el.querySelector('.nm span')), vehicle: box(el.querySelector('.vh')) },
        z: el.style.zIndex, under: el.classList.contains('under') };
    }
    const tgt = document.querySelector('.cot-tgt');
    const root = box(tgt);
    if (root) {
      const q = (s) => tgt.querySelector(s);
      plates.tgt = { root, z: '', under: false, points: q('.hp')?.textContent ?? '',
        lines: { name: box(q('.nick')), tier: box(q('.tier')), vehicle: box(q('.veh')), range: box(q('.rng')), points: box(q('.hp')) } };
    }
    return plates;
  };
  /** n frames, each one HUD update after `step(i)` and a paint; the snapshots after each. */
  probe.run = (n, step) => new Promise((done) => {
    const { frame, hud } = window.__HUD_LAYOUT;
    const out = [];
    const span = [performance.now(), Infinity];
    probe.windows.push(span);
    let i = 0;
    const tick = () => {
      step?.(i);
      hud.update(frame);
      out.push(probe.snap());
      if (++i < n) requestAnimationFrame(tick);
      else requestAnimationFrame(() => { span[1] = performance.now(); done(out); });
    };
    requestAnimationFrame(tick);
  });
}

/** The mechanisms put back (--negative-control): the range figure in proportional digits, centred on the vehicle's line;
 *  the bars' stack ordered by this frame's range alone (each frame's order written over the hold the HUD keeps). */
function regress() {
  const style = document.createElement('style');
  style.textContent = '.cot-tgt .rng{min-width:0!important;font-variant-numeric:proportional-nums!important;text-align:center!important}'
    + '.cot-tgt .mt{justify-content:center!important}';
  document.head.append(style);
  window.__PLATES.negative = true;
}

const STEPS = {
  still: () => null,
  /** The player backs away down the field, from 93.5 m of the target to 108.5 m: the figure crosses 99 to 100. */
  range: (i) => {
    const { tanks } = window.__HUD_LAYOUT, at = tanks[8].state.pos;
    tanks[0].state.pos.set(at.x, 0, at.z - 93.5 - i * 0.1);
  },
  /** The target under the gun loses hull points. */
  points: (i) => { const t = window.__HUD_LAYOUT.tanks[8]; if (i > 0) t.combat.hp = Math.max(1, t.combat.hp - t.combat.maxHp * 0.0137); },
};

/** In the page: two enemies side by side at one depth, their bars overlapping, their ranges crossing every frame. They
 *  stand on the near ally's seat (the one seat a phone's band between its panels holds a bar in, nearAlly in the fixture),
 *  with short callsigns as that seat's ally has, and the ally steps behind the camera. */
function stageOrder() {
  const { tanks } = window.__HUD_LAYOUT, a = tanks[9], b = tanks[10], seat = tanks[2].state.pos.clone();
  const probe = window.__PLATES;
  tanks[2].state.pos.set(0, 0, -80);
  a.displayName = 'Kite'; b.displayName = 'Moth';
  a.state.pos.copy(seat);
  probe.orderZ = seat.z;
  b.state.pos.set(seat.x + 1.5, 0, seat.z);
  probe.orderStep = (i) => {
    const d = i % 2 ? 0.05 : -0.05;
    a.state.pos.z = probe.orderZ + d; b.state.pos.z = probe.orderZ - d;
    // (the negative control: the order the HUD would write from this frame's range alone, the stack flipped by hand)
    if (probe.negative) {
      const bars = [...document.querySelectorAll('.cot-hpbars .cot-hpb')].filter((el) => /^(Kite|Moth)$/.test(el.querySelector('.nm span')?.textContent ?? ''));
      const near = i % 2 ? 0 : 1;
      bars.forEach((el, k) => { el.style.zIndex = String(k === near ? 50 : 49); el.classList.toggle('under', k !== near); });
    }
  };
  return [a.displayName, b.displayName];
}

/** Each plate's largest move of its box and of each line across the frames (by key), and its show/hide/restack/faint
 *  changes after `skip` frames. */
function motion(frames, skip = 0) {
  const out = {};
  const first = frames[skip] ?? {};
  for (let f = skip + 1; f < frames.length; f++) {
    const prev = frames[f - 1], cur = frames[f];
    for (const key of new Set([...Object.keys(prev), ...Object.keys(cur)])) {
      const m = out[key] ??= { root: 0, lines: {}, shown: 0, z: 0, under: 0, widthWithoutCount: 0 };
      const a = prev[key], b = cur[key];
      if (!a !== !b) { m.shown++; continue; }
      if (!a) continue;
      const d = (p, q) => Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y), Math.abs(p.w - q.w), Math.abs(p.h - q.h));
      m.root = Math.max(m.root, d(a.root, b.root));
      for (const line of Object.keys(b.lines)) {
        const p = a.lines[line], q = b.lines[line];
        if (!p || !q) { if (!p !== !q) m.lines[line] = Infinity; continue; }
        const move = line === 'range' ? Math.abs(p.x - q.x) : line === 'points' ? 0 : d(p, q);
        m.lines[line] = Math.max(m.lines[line] ?? 0, move);
        if (line === 'points' && a.points.length === b.points.length && Math.abs(p.w - q.w) > STILL_PX) m.widthWithoutCount++;
      }
      if (a.z !== b.z) m.z++;
      if (a.under !== b.under) m.under++;
    }
  }
  return { out, first };
}

hold = await openCaptureHold({ label: 'overhead-plates.browser.selftest', timeoutMs: 60 * 60 * 1000, lockClass: 'render', holdCapMinutes: 12 });
let server = null, cacheDir = null;
if (!base) {
  const { createServer } = await import('vite');
  cacheDir = mkdtempSync(join(tmpdir(), 'cot-overhead-plates-vite-'));
  server = await createServer({ root: process.cwd(), logLevel: 'error', cacheDir,
    server: { host: '127.0.0.1', port: 7600 + (process.pid % 90), strictPort: false, hmr: false, watch: null } });
  await server.listen();
  base = server.resolvedUrls.local[0].replace(/\/$/, '');
}
const found = { still: 0, range: 0, points: 0, order: 0, shifts: 0, staging: 0 };
const browser = await launchGuardedBrowser(puppeteer, { headless: true, protocolTimeout: 600_000,
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--hide-scrollbars', '--no-sandbox'] }, { label: 'overhead-plates' });
try {
  for (const s of SIZES) {
    const report = (part, problems) => {
      found[part] += problems.length;
      console.log(`${problems.length ? 'FAIL' : 'ok  '} ${s.name} ${part}${problems.length ? `: ${problems.slice(0, 6).join('; ')}${problems.length > 6 ? ` (+${problems.length - 6})` : ''}` : ''}`);
    };
    const page = await browser.newPage();
    await page.setViewport({ width: s.width, height: s.height, isMobile: s.touch, hasTouch: s.touch });
    page.on('pageerror', (error) => console.log(`pageerror ${s.name}: ${error.message}`));
    await page.evaluateOnNewDocument(install);
    await page.goto(`${base}/tools/fixtures/battle-hud-layout.html?state=markers${s.touch ? '&coarse=1' : ''}`, { waitUntil: 'networkidle0', timeout: 300_000 });
    await page.waitForFunction(() => !!window.__HUD_LAYOUT && !!window.__PLATES, { timeout: 120_000 });
    await page.evaluate(() => document.fonts.ready);
    if (negative) await page.evaluate(regress);
    // (the fixture's settling frames, fonts included, run in its first 1.5 s)
    await sleep(2500);
    const shot = async (name) => {
      if (!shots) return;
      mkdirSync(shots, { recursive: true });
      await page.screenshot({ path: join(shots, `${s.name}-${name}.png`) });
    };
    await shot('markers');

    // still
    {
      const frames = await page.evaluate(() => window.__PLATES.run(60));
      const { out, first } = motion(frames);
      const problems = [];
      if (!first.tgt) problems.push('no target plate shows');
      if (Object.keys(first).filter((k) => k.startsWith('bar:')).length < minBars(s)) problems.push(`fewer than ${minBars(s)} hull bars show`);
      for (const [key, m] of Object.entries(out)) {
        if (m.shown) problems.push(`${key} showed/hid ${m.shown}x`);
        if (m.root > STILL_PX) problems.push(`${key} box moved ${m.root.toFixed(2)} px`);
        for (const [line, v] of Object.entries(m.lines)) if (v > STILL_PX) problems.push(`${key} ${line} moved ${v.toFixed(2)} px`);
        if (m.z || m.under) problems.push(`${key} restacked ${m.z}x, faint ${m.under}x`);
      }
      report('still', problems);
    }
    // range, points
    for (const part of ['range', 'points']) {
      const n = part === 'range' ? 150 : 41;
      const frames = await page.evaluate((src, count) => window.__PLATES.run(count, new Function(`return (${src})`)()), STEPS[part].toString(), n);
      const { out, first } = motion(frames);
      const problems = [];
      const m = out.tgt;
      if (!first.tgt || !m) problems.push('no target plate shows');
      else {
        if (m.shown) problems.push(`the plate showed/hid ${m.shown}x`);
        if (m.root > MOVE_PX) problems.push(`the plate's box moved ${m.root.toFixed(2)} px`);
        for (const line of ['name', 'tier', 'vehicle', ...(part === 'range' ? ['range'] : [])]) {
          if ((m.lines[line] ?? 0) > MOVE_PX) problems.push(`its ${line} moved ${m.lines[line].toFixed(2)} px`);
        }
        if (m.widthWithoutCount) problems.push(`its points line changed width ${m.widthWithoutCount}x at one character count`);
        if (part === 'range') {
          const texts = new Set(frames.map((f) => f.tgt?.lines.range ? 1 : 0));
          if (!texts.has(1)) problems.push('no range figure shows');
        }
      }
      report(part, problems);
      if (part === 'range') await shot('range');
    }
    // order
    {
      const names = await page.evaluate(stageOrder);
      await page.evaluate(() => new Promise((done) => { let n = 4; const f = () => { window.__HUD_LAYOUT.hud.update(window.__HUD_LAYOUT.frame); if (--n) requestAnimationFrame(f); else requestAnimationFrame(() => done()); }; requestAnimationFrame(f); }));
      const frames = await page.evaluate(() => window.__PLATES.run(60, (i) => window.__PLATES.orderStep(i)));
      const { out } = motion(frames, 2);
      const problems = [];
      const keys = names.map((n) => `bar:${n}`);
      const both = frames.slice(2).every((f) => keys.every((k) => f[k]));
      if (!both) problems.push(`the two hulls' bars (${names.join(', ')}) do not both show every frame (staging)`);
      const overlap = frames.slice(2).some((f) => f[keys[0]]?.under || f[keys[1]]?.under);
      if (both && !overlap) problems.push('neither bar draws faint under the other (staging: they do not overlap)');
      for (const k of keys) {
        const m = out[k];
        if (!m) continue;
        if (m.z || m.under) problems.push(`${k} restacked ${m.z}x, turned faint or back ${m.under}x in 58 frames`);
      }
      if (problems.some((p) => p.includes('staging'))) found.staging++;
      report('order', problems);
      await shot('order');
    }
    await sleep(300);
    const shifts = await page.evaluate(() => window.__PLATES.shifts);
    report('shifts', shifts.map((x) => `layout-shift ${x}`));
    await page.close();
  }
} finally {
  await browser.close();
  await hold?.release();
  await server?.close();
  if (cacheDir) rmSync(cacheDir, { recursive: true, force: true });
}
const total = found.still + found.range + found.points + found.order + found.shifts;
const failed = negative ? !(found.range && found.order) : total > 0;
const summary = Object.entries(found).map(([k, v]) => `${k} ${v}`).join(', ');
console.log(negative
  ? `overhead-plates --negative-control: ${summary} (${failed ? 'FAIL: the receipt cannot see the mechanisms' : 'the receipt sees both'})`
  : `overhead-plates: ${summary} problems (${failed ? 'FAIL' : 'PASS'})`);
if (option('json')) writeFileSync(option('json'), JSON.stringify(found));
process.exit(failed ? 1 : 0);
