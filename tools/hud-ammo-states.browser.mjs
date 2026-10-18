#!/usr/bin/env node
// Owner 2026-10-17: "if you are out of ammo, the reload indicators should have a special edge case, including
// autoloader/missile indicators. and for special modes like juggernaut, ammo should be endless."
// Rendered proof of the out-of-ammo and unlimited-rounds HUD states on the real HUD (tools/fixtures/
// battle-hud-layout.html, AMMO_STAGES): a normal reload, an empty cannon, an autoloader short of stowage and one empty
// between clips and mid-clip, an empty guided salvo rack, an empty ATGM launcher, Juggernaut with unlimited rounds, an
// AC-130 escort out of rounds, and the ×8 sight reloading and empty — desktop, a portrait phone and three landscape
// phones. Each frame is checked three ways:
//  - pixels on the reticle canvas (no amber reload sweep, countdown or ready shell on a dry weapon; the danger-ink
//    empty state present);
//  - geometry: the canvas calls are recorded (device transform applied), so the empty mark never lands on a readout
//    and its strike keeps 3 CSS px from every text, no empty mark sits on the dispersion ring, the countdown, readouts
//    and zoom plate never overlap each other, and none of the sight's furniture lands on a DOM control; on a portrait
//    phone the systems row stays clear of the sight's band (battleHudLayout SIGHT_BAND_*);
//  - the DOM: struck controls, ∞ counts at the numeral's size, every empty tray slot struck on a danger edge with its
//    0 in the danger ink (the phone's collapsed slot without its amber frame), the tray's type label and count apart,
//    and a dry gun's FIRE buttons dimmed on a touch layout.
// Takes the capture lock (NORMAL band) and accepts an existing dev server. --ticket-stamp=<ms> rejoins the queue at an
// earlier ticket of the same run (capture-lock ticketAt: a relaunched run keeps its place):
// node tools/hud-ammo-states.browser.mjs --url=http://127.0.0.1:5189 --out=outputs/hud-ammo-states
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { acquireCaptureLock, refreshCaptureLock, releaseCaptureLock, ticketAt } from './capture-lock.mjs';

const arg = (name, fallback) => process.argv.find((v) => v.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || fallback;
const out = resolve(arg('out', 'outputs/hud-ammo-states'));
const url = arg('url', 'http://127.0.0.1:5189');
const SNIPER = ['ammo-reload-sniper', 'ammo-dry-cannon-sniper', 'ammo-reload-autoloader-sniper', 'ammo-dry-autoloader-sniper'];
const BATTLE = ['ammo-reload', 'ammo-dry-cannon', 'ammo-low-autoloader', 'ammo-dry-autoloader', 'ammo-dry-autoloader-midclip',
  'ammo-dry-salvo', 'ammo-dry-atgm', 'ammo-unlimited', 'ammo-escort-dry'];
const CASES = [
  { name: 'desktop', width: 1920, height: 1080, touch: false, scale: 2, stages: [...BATTLE, ...SNIPER], crop: true },
  { name: 'phone', width: 390, height: 844, touch: true, scale: 2, stages: [...BATTLE, ...SNIPER] },
  // critic r3 measured the scope readout overlap at these three landscape phones
  { name: 'landscape-844', width: 844, height: 390, touch: true, scale: 2, stages: [...BATTLE, ...SNIPER], crop: true },
  { name: 'landscape-932', width: 932, height: 430, touch: true, scale: 2, stages: SNIPER, crop: true },
  { name: 'landscape-667', width: 667, height: 375, touch: true, scale: 2, stages: [...BATTLE, ...SNIPER], crop: true },
];
const STAGE_FILTER = arg('stages', '');
const CASE_FILTER = arg('case', '');
// What the reticle canvas must and must not show for each stage (pixel counts inside the sight's neighbourhood).
const EXPECT = {
  'ammo-reload': { amberMin: 40, dangerMax: 4 },
  'ammo-dry-cannon': { amberMax: 4, dangerMin: 30, dryMark: true },
  'ammo-low-autoloader': { amberMin: 20, dangerMin: 10 },
  'ammo-dry-autoloader': { amberMax: 4, dangerMin: 30, struckControl: true, dryMark: true },
  'ammo-dry-autoloader-midclip': { amberMax: 4, dangerMin: 30, struckControl: true, dryMark: true },
  'ammo-dry-salvo': { amberMax: 4, dangerMin: 30, struckControl: true, dryMark: true },
  'ammo-dry-atgm': { dangerMax: 4, struckControl: true },
  'ammo-unlimited': { amberMin: 20, dangerMax: 4, unlimited: true, noCountdown: true },
  // the AC-130 refills its gunship only: an escort out of rounds reads empty, no ∞ anywhere
  'ammo-escort-dry': { amberMax: 4, dangerMin: 30, dryMark: true, finite: true },
  // through the scope the readout's APFSDS label is amber too: a dry sight is read by its recorded reload ink instead
  'ammo-reload-sniper': { amberMin: 20, dangerMax: 4 },
  'ammo-dry-cannon-sniper': { noReloadInk: true, dangerMin: 20, dryMark: true },
  'ammo-reload-autoloader-sniper': { amberMin: 10, dangerMax: 4 },
  // the scope may hide the controls row: its struck controls are the battle stages' (null skips the control checks)
  'ammo-dry-autoloader-sniper': { noReloadInk: true, dangerMin: 20, struckControl: null, dryMark: true },
};
// hud.ts RETICLE_AMMO_INK.dry / RELOAD_ACCENT; battleHudLayout.ts SIGHT_BAND_ABOVE / SIGHT_BAND_BELOW (the scope's
// readouts are checked against the row as furniture)
const DRY_INK = 'rgba(240,90,90,0.92)';
const DRY_RING = 'rgba(214,120,112,0.62)';
const RELOAD_INK = 'rgba(240,160,48,0.95)';
const SIGHT_BAND = { above: 64, below: 80, half: 90 };
/** The least gap between the empty mark's strike and any text on the reticle (critic r3: 1.5 px from the range tag). */
const STRIKE_TEXT_GAP = 3;

/** Installed before the page boots: records the reticle canvas's calls in CSS px, one paint at a time. */
function recordReticle() {
  const proto = CanvasRenderingContext2D.prototype;
  const log = { paint: [], path: [] };
  window.__RETICLE_LOG = log;
  const isReticle = (ctx) => ctx.canvas?.classList?.contains('cot-ret');
  const point = (ctx, x, y) => {
    const m = ctx.getTransform();
    const dpr = ctx.canvas.width / Math.max(1, ctx.canvas.clientWidth || innerWidth);
    return { x: (m.a * x + m.c * y + m.e) / dpr, y: (m.b * x + m.d * y + m.f) / dpr, s: Math.hypot(m.a, m.b) / dpr };
  };
  const wrap = (name, fn) => {
    const original = proto[name];
    proto[name] = function (...args) {
      if (isReticle(this)) fn(this, args);
      return original.apply(this, args);
    };
  };
  wrap('clearRect', (ctx, [x, y, w, h]) => { if (x <= 0 && y <= 0 && w >= ctx.canvas.width / 4 && h >= ctx.canvas.height / 4) log.paint = []; });
  wrap('beginPath', () => { log.path = []; });
  for (const name of ['moveTo', 'lineTo']) wrap(name, (ctx, [x, y]) => log.path.push(point(ctx, x, y)));
  wrap('quadraticCurveTo', (ctx, [cx, cy, x, y]) => log.path.push(point(ctx, cx, cy), point(ctx, x, y)));
  wrap('arc', (ctx, [x, y, r, a0, a1]) => {
    const c = point(ctx, x, y);
    const full = Math.abs(a1 - a0) >= Math.PI * 2 - 1e-3;
    log.path.push({ x: c.x - r * c.s, y: c.y - r * c.s, full, r: r * c.s }, { x: c.x + r * c.s, y: c.y + r * c.s, full, r: r * c.s });
  });
  wrap('stroke', (ctx) => {
    if (!log.path.length) return;
    const xs = log.path.map((p) => p.x); const ys = log.path.map((p) => p.y);
    const pad = ctx.lineWidth / 2;
    const circle = log.path.find((p) => p.full && p.r > 8);
    log.paint.push({ op: 'stroke', style: String(ctx.strokeStyle), lineWidth: ctx.lineWidth,
      ring: !!circle, circle: circle ? { x: circle.x + circle.r, y: circle.y + circle.r, r: circle.r } : null,
      box: { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad } });
  });
  wrap('fillText', (ctx, [text, x, y]) => {
    const p = point(ctx, x, y);
    const w = ctx.measureText(String(text)).width * p.s;
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] || 10) * p.s;
    const align = ctx.textAlign;
    const x0 = align === 'center' ? p.x - w / 2 : align === 'right' || align === 'end' ? p.x - w : p.x;
    log.paint.push({ op: 'text', text: String(text), style: String(ctx.fillStyle),
      box: { x0, y0: p.y - size * 0.74, x1: x0 + w, y1: p.y + size * 0.08 } });
  });
}

function readHud(rules) {
  const { DRY_INK, DRY_RING, RELOAD_INK, SIGHT_BAND, STRIKE_TEXT_GAP } = rules;
  const canvas = document.querySelector('.cot-ret');
  const ctx = canvas.getContext('2d');
  const sx = canvas.width / innerWidth;
  const half = Math.round(150 * sx);
  const x0 = Math.max(0, Math.round(canvas.width / 2) - half);
  const y0 = Math.max(0, Math.round(canvas.height / 2) - half);
  const data = ctx.getImageData(x0, y0, Math.min(canvas.width - x0, half * 2), Math.min(canvas.height - y0, half * 2)).data;
  let amber = 0;
  let danger = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]; const g = data[i + 1]; const b = data[i + 2]; const a = data[i + 3];
    if (a < 110) continue;
    if (r > 200 && g > 115 && g < 195 && b < 95) amber++;
    else if (r > 170 && r - g > 65 && g < 150 && Math.abs(g - b) < 45) danger++;
  }
  const visible = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; };
  const hit = (a, b, slack = 0.5) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > slack && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > slack;
  const struck = [...document.querySelectorAll('.cot-vehicle-controls>button.empty')].filter(visible);
  const shells = [...document.querySelectorAll('.cot-shell')].filter(visible);
  // --- geometry: the last reticle paint, by role ---
  const paint = window.__RETICLE_LOG?.paint ?? [];
  const cx = innerWidth / 2; const cy = innerHeight / 2;
  const texts = paint.filter((op) => op.op === 'text' && op.text.trim());
  const dry = paint.filter((op) => op.op === 'stroke' && op.style.replace(/\s/g, '') === DRY_INK && !op.ring);
  const countdown = texts.filter((op) => op.style.replace(/\s/g, '') === RELOAD_INK && !op.text.startsWith('+'));
  const reloadInk = paint.filter((op) => op.style.replace(/\s/g, '') === RELOAD_INK && !(op.op === 'text' && op.text.startsWith('+'))).length;
  // the sight's furniture under the marker: the empty marks, the rack's shells (one outline each, under 24 px wide),
  // the countdown and the scope readouts
  const rack = paint.filter((op) => op.op === 'stroke' && !op.ring && op.lineWidth <= 1.25 && op.box.y0 > cy + 4
    && op.box.y1 < cy + 90 && op.box.x1 - op.box.x0 < 24 && Math.abs((op.box.x0 + op.box.x1) / 2 - cx) < 40);
  // the countdown, the scope's readout line and zoom plate, and its range tag off the ring's 4:30 rim
  const readouts = texts.filter((op) => op.box.y0 > cy && Math.abs((op.box.x0 + op.box.x1) / 2 - cx) < 110);
  const overlaps = [];
  for (const mark of dry) for (const text of texts) if (hit(mark.box, text.box)) overlaps.push(`empty mark over "${text.text}"`);
  // the strike (the 1.5 px danger diagonal over its dark contour) keeps its distance from every text
  const grow = (box, by) => ({ x0: box.x0 - by, y0: box.y0 - by, x1: box.x1 + by, y1: box.y1 + by });
  for (const strike of dry.filter((op) => op.lineWidth === 1.5)) for (const text of texts) {
    if (!hit(strike.box, text.box) && hit(grow(strike.box, STRIKE_TEXT_GAP), text.box, 0)) {
      overlaps.push(`the strike within ${STRIKE_TEXT_GAP} px of "${text.text}"`);
    }
  }
  // no empty mark on the dispersion ring (same red: critic r3, a phone's small ring through the struck round)
  const rings = paint.filter((op) => op.op === 'stroke' && op.circle && op.style.replace(/\s/g, '') === DRY_RING);
  for (const ring of rings.slice(-1)) {
    const { x, y, r } = ring.circle;
    const reach = ring.lineWidth / 2 + 2;
    for (const mark of dry) {
      const near = Math.hypot(Math.max(mark.box.x0 - x, 0, x - mark.box.x1), Math.max(mark.box.y0 - y, 0, y - mark.box.y1));
      const far = Math.max(...[[mark.box.x0, mark.box.y0], [mark.box.x1, mark.box.y0], [mark.box.x0, mark.box.y1],
        [mark.box.x1, mark.box.y1]].map(([px, py]) => Math.hypot(px - x, py - y)));
      if (near <= r + reach && far >= r - reach) { overlaps.push('an empty mark on the dispersion ring'); break; }
    }
  }
  for (let i = 0; i < readouts.length; i++) for (const other of readouts.slice(i + 1)) {
    if (hit(readouts[i].box, other.box)) overlaps.push(`"${readouts[i].text}" over "${other.text}"`);
  }
  for (const text of readouts) for (const shell of rack) if (hit(text.box, shell.box)) overlaps.push(`"${text.text}" over the rack`);
  const furniture = [...dry, ...rack, ...readouts];
  // (.flight-identity: the scope's vision switch, which the aerial sheet seats beside the sight)
  const controls = ['.cot-vehicle-controls>button', '.cot-shell', '.cot-con', '.cot-touch.on .round', '.cot-dp',
    '.cot-aim-warning:not([hidden])', '.flight-identity'].flatMap((selector) => [...document.querySelectorAll(selector)].filter(visible)
    .map((el) => ({ name: selector, box: rect(el) })));
  for (const item of furniture) for (const control of controls) {
    if (hit(item.box, control.box)) overlaps.push(`${item.op === 'text' ? `"${item.text}"` : 'sight mark'} over ${control.name}`);
  }
  const row = document.querySelector('.cot-vehicle-controls');
  const portrait = innerWidth < innerHeight && document.body.classList.contains('cot-touch-layout');
  const band = { x0: cx - SIGHT_BAND.half, x1: cx + SIGHT_BAND.half, y0: cy - SIGHT_BAND.above, y1: cy + SIGHT_BAND.below };
  if (portrait && row && visible(row) && hit(rect(row), band)) overlaps.push('the systems row crosses the sight band');
  // --- the DOM: the phone's collapsed empty slot and the ∞ count ---
  const selectedEmpty = shells.find((el) => el.classList.contains('sel') && el.classList.contains('empty'));
  let emptySlot = null;
  if (selectedEmpty) {
    const style = getComputedStyle(selectedEmpty);
    const before = getComputedStyle(selectedEmpty, '::before');
    emptySlot = { borderTop: style.borderTopColor, borderBottom: style.borderBottomColor, shadow: style.boxShadow,
      strike: before.content !== 'none' && before.content !== '' && before.content !== 'normal',
      count: getComputedStyle(selectedEmpty.querySelector('.cnt')).color };
  }
  // every empty slot (desktop too, critic r3: a grey 0 on a thin edge read as disabled) reads OUT: struck, danger 0
  const emptyOut = shells.filter((el) => el.classList.contains('empty')).map((el) => {
    const before = getComputedStyle(el, '::before');
    return { strike: before.content !== 'none' && before.content !== '' && before.content !== 'normal',
      count: getComputedStyle(el.querySelector('.cnt')).color, edge: getComputedStyle(el).borderBottomColor };
  });
  // the type label and the count share the bottom row on a desktop slot (critic r3: APFSDS180)
  const trayText = shells.map((el) => {
    const ty = el.querySelector('.ty'); const cnt = el.querySelector('.cnt');
    if (!ty || !cnt || !visible(ty) || !visible(cnt) || !ty.textContent || !cnt.textContent) return null;
    const a = rect(ty); const b = rect(cnt);
    const range = document.createRange(); range.selectNodeContents(ty); const inkA = range.getBoundingClientRect();
    range.selectNodeContents(cnt); const inkB = range.getBoundingClientRect();
    const vertical = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0;
    return { text: `${ty.textContent}|${cnt.textContent}`, gap: vertical ? Math.round((inkB.left - inkA.right) * 10) / 10 : null };
  }).filter(Boolean);
  const fire = [...document.querySelectorAll('.cot-touch .fire')].filter(visible)
    .map((el) => ({ opacity: Number(getComputedStyle(el).opacity), border: getComputedStyle(el).borderTopColor }));
  const unlimitedSlot = shells.find((el) => el.classList.contains('unlimited'));
  const numeral = shells.find((el) => !el.classList.contains('unlimited'));
  return {
    amber, danger,
    struck: struck.map((el) => ({ label: el.getAttribute('aria-label'), disabled: el.disabled,
      strike: getComputedStyle(el.querySelector('.si'), '::after').content !== 'none' })),
    counts: shells.map((el) => el.querySelector('.cnt')?.textContent ?? ''),
    emptySlots: shells.filter((el) => el.classList.contains('empty')).length,
    emptySlot, emptyOut, trayText, fire, gunDry: document.body.classList.contains('cot-gun-dry'),
    unlimitedCount: unlimitedSlot ? { size: parseFloat(getComputedStyle(unlimitedSlot.querySelector('.cnt')).fontSize),
      color: getComputedStyle(unlimitedSlot.querySelector('.cnt')).color,
      zIndex: getComputedStyle(unlimitedSlot.querySelector('.cnt')).zIndex } : null,
    numeralSize: numeral ? parseFloat(getComputedStyle(numeral.querySelector('.cnt')).fontSize) : null,
    paintOps: paint.length, dryMarks: dry.length, reloadInk, countdown: countdown.map((op) => op.text).join(''),
    readouts: readouts.map((op) => op.text), overlaps,
    row: row && visible(row) ? rect(row) : null,
  };
}

const amberish = (color) => {
  const [r, g, b] = (/rgba?\((\d+), (\d+), (\d+)/.exec(color)?.slice(1) ?? []).map(Number);
  return r > 200 && g > 140 && g < 210 && b < 120;
};
const { chromium } = await import(arg('playwright-module', 'playwright'));
await mkdir(out, { recursive: true });
const reports = [];
const failures = [];
// NORMAL band: an ordinary FIFO ticket (or this run's earlier one); wait behind the queue (default three hours).
const stamp = Number(arg('ticket-stamp', '0'));
await acquireCaptureLock(Number(arg('lock-timeout-ms', String(3 * 3600 * 1000))), stamp > 0 ? { ticket: ticketAt(stamp) } : {});
const heartbeat = setInterval(refreshCaptureLock, 30_000);
heartbeat.unref();
const startedAt = Date.now();
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-gpu'] });
try {
  for (const c of CASES.filter((item) => !CASE_FILTER || CASE_FILTER.split(',').includes(item.name))) {
    const context = await browser.newContext({ viewport: { width: c.width, height: c.height }, hasTouch: c.touch,
      isMobile: c.touch, deviceScaleFactor: c.scale, reducedMotion: 'reduce' });
    await context.addInitScript(recordReticle);
    const page = await context.newPage();
    page.on('pageerror', (error) => failures.push(`${c.name}: ${error.message}`));
    await page.goto(`${url}/tools/fixtures/battle-hud-layout.html?locale=en-US`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__HUD_LAYOUT);
    for (const stage of c.stages.filter((name) => !STAGE_FILTER || STAGE_FILTER.split(',').includes(name))) {
      const expect = EXPECT[stage];
      await page.evaluate((name) => window.__HUD_LAYOUT.state(name), stage);
      // the layout solver runs a frame later; let it settle, then paint once more on the settled layout
      await page.evaluate(async () => { for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame); });
      await page.evaluate((name) => window.__HUD_LAYOUT.state(name), stage);
      await page.evaluate(async () => { for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); });
      await page.waitForTimeout(260); // the tray's border transitions (.12 s) settle before their colours are read
      const hud = await page.evaluate(readHud, { DRY_INK, DRY_RING, RELOAD_INK, SIGHT_BAND, STRIKE_TEXT_GAP });
      const issues = [...hud.overlaps];
      if (expect.amberMin != null && hud.amber < expect.amberMin) issues.push(`reload amber ${hud.amber} < ${expect.amberMin}`);
      if (expect.amberMax != null && hud.amber > expect.amberMax) issues.push(`a dry weapon still shows reload amber (${hud.amber})`);
      if (expect.dangerMin != null && hud.danger < expect.dangerMin) issues.push(`empty-state ink ${hud.danger} < ${expect.dangerMin}`);
      if (expect.dangerMax != null && hud.danger > expect.dangerMax) issues.push(`unexpected empty-state ink (${hud.danger})`);
      if (expect.dryMark && !hud.dryMarks) issues.push('no struck empty mark was painted');
      if (expect.noReloadInk && hud.reloadInk) issues.push(`a dry sight still paints ${hud.reloadInk} reload-ink marks`);
      if (expect.noCountdown && hud.countdown) issues.push(`a clip cycle prints a countdown (${hud.countdown})`);
      if (!hud.paintOps) issues.push('no reticle paint was recorded');
      if (expect.struckControl === true && !hud.struck.some((row) => row.strike && row.disabled)) issues.push('no struck, disabled launcher/magazine control');
      if (expect.struckControl === undefined && hud.struck.length) issues.push(`unexpected struck control ${JSON.stringify(hud.struck)}`);
      if (expect.unlimited) {
        if (hud.emptySlots || !hud.counts.length || hud.counts.some((text) => text !== '∞')) {
          issues.push(`unlimited rounds must print ∞ in every slot (${hud.counts.join(',')})`);
        }
        if (!hud.unlimitedCount || hud.unlimitedCount.size < (c.touch ? 16 : 19) || hud.unlimitedCount.zIndex !== '4') {
          issues.push(`the ammo ∞ is not set at the numeral's size above the reload shade (${JSON.stringify(hud.unlimitedCount)})`);
        }
      }
      const dryStage = (stage.startsWith('ammo-dry') && !stage.startsWith('ammo-dry-atgm')) || stage === 'ammo-escort-dry';
      if (dryStage && !hud.emptySlots) issues.push('no empty tray slot');
      if (expect.finite && hud.counts.some((text) => text === '∞')) issues.push(`an escort's slot prints ∞ (${hud.counts.join(',')})`);
      for (const slot of hud.emptyOut) {
        if (!slot.strike || !/240, 90, 90/.test(slot.count) || !/24\d, 9\d, 90/.test(slot.edge)) {
          issues.push(`an empty slot does not read OUT (${JSON.stringify(slot)})`);
        }
      }
      for (const row of hud.trayText) if (row.gap != null && row.gap < 2) issues.push(`tray text "${row.text}" ${row.gap} px apart`);
      if (c.touch) {
        const dim = hud.fire.length && hud.fire.every((button) => button.opacity < 0.7);
        if (hud.gunDry !== dryStage || (dryStage && !dim) || (!dryStage && hud.fire.some((button) => button.opacity < 0.8))) {
          issues.push(`FIRE dimming does not follow the dry gun (${JSON.stringify({ gunDry: hud.gunDry, fire: hud.fire })})`);
        }
      }
      if (c.touch && hud.emptySlot) {
        if (amberish(hud.emptySlot.borderTop) || /240, 160, 48|255, 189, 92/.test(hud.emptySlot.shadow)) {
          issues.push(`the collapsed empty slot keeps its amber frame (${JSON.stringify(hud.emptySlot)})`);
        }
        if (!hud.emptySlot.strike || !/240, 90, 90/.test(hud.emptySlot.borderBottom)) {
          issues.push(`the collapsed empty slot is not struck on a danger edge (${JSON.stringify(hud.emptySlot)})`);
        }
      }
      const file = `${c.name}-${stage}.png`;
      await page.screenshot({ path: resolve(out, file) });
      if (c.crop) {
        await page.screenshot({ path: resolve(out, `${c.name}-${stage}-reticle.png`),
          clip: { x: c.width / 2 - 170, y: c.height / 2 - 120, width: 340, height: Math.min(240, c.height / 2 + 100) } });
      }
      reports.push({ case: c.name, stage, file, ...hud, issues });
      for (const issue of issues) failures.push(`${c.name}/${stage}: ${issue}`);
      refreshCaptureLock();
    }
    await context.close();
  }
} finally {
  await browser.close();
  clearInterval(heartbeat);
  releaseCaptureLock();
  await writeFile(resolve(out, 'report.json'), JSON.stringify({ heldMs: Date.now() - startedAt, reports, failures }, null, 2));
}
console.log(`${reports.length} HUD ammo frames; ${failures.length} failures. ${out}`);
if (failures.length) { console.log(failures.join('\n')); process.exitCode = 1; }
