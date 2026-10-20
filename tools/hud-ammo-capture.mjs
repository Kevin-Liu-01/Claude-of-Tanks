// The capture flow of tools/hud-ammo-states.browser.mjs, importable without a browser (owner 2026-10-17: "if you are
// out of ammo, the reload indicators should have a special edge case, including autoloader/missile indicators. and for
// special modes like juggernaut, ammo should be endless.").
//
// Rendered proof of the out-of-ammo and unlimited-rounds HUD states on the real HUD (tools/fixtures/battle-hud-layout,
// AMMO_STAGES): a normal reload, an empty cannon, an autoloader short of stowage and one empty between clips and
// mid-clip, an empty guided salvo rack, an empty ATGM launcher, Juggernaut with unlimited rounds, an AC-130 escort out
// of rounds, and the ×8 sight reloading and empty — on a 1440 px desktop, two stacked mouse trays (900 and 640 px,
// critic r6), the sight and a reload on six short mouse windows (800x500, 900x480, 700x460 and 1280x480, critic r7;
// 800x560 and 1280x440, critic r8) and a 480 px wide one, a portrait phone and three landscape phones, and the tray
// states on the two 44 px tall touch slots. The mouse windows' sight adds the gun travel warning (the canvas chip) and
// the widest ring, a rack reloading and empty under it (critic r8).
// Each frame is checked five ways:
//  - pixels on the reticle canvas (no amber reload sweep, countdown or ready shell on a dry weapon; the danger-ink
//    empty state present);
//  - geometry, from the reticle canvas's recorded calls (device transform applied): the empty mark never lands on a
//    text and its strike keeps 3 CSS px from every text; every mark under the marker — the empty marks, the rack's
//    shells (their dark contours), the countdown and the scope readouts — keeps 3 px from the dispersion ring's stroke
//    (its halo), and every text there keeps 3 px from the rack (critic r6: the desktop scope's countdown sat on the
//    ring and its digits touched the clip; a phone's clip touched the ring); the readouts never overlap each other,
//    and every mark of the sight, the warning chip and the zoom rules included, keeps 3 px from every DOM control (the
//    speedometer and the minimap among them) and the scope's vision switch (critic r8: the stack's foot ran into the
//    controls row, and onto the switch seated under the sight); the
//    switch keeps 3 px from every HUD panel and control, on the screen; a wide tray's controls row starts where hud.ts
//    models it; on a portrait phone the systems row stays clear of the sight's band (battleHudLayout SIGHT_BAND_*);
//  - the DOM: struck controls, ∞ counts at the numeral's size, every empty tray slot struck on a danger edge with its
//    0 in the danger ink (the phone's collapsed slot without its amber frame), and a dry gun's FIRE buttons dimmed on a
//    touch layout; every visible slot's descriptor names the marks the slot shows — its count, type label, the mouse
//    tray's key, an empty slot's strike, the phone's chevron (critic r6: a null label silently skipped every label read);
//  - the saved frame itself (hud-ammo-frame-ink.mjs slotFrameFindings, on the PNG bytes written): every mark a visible
//    tray slot shows is in the frame, a white count at full brightness, never under the reload shade (critic r7). Nothing
//    touches the page between the DOM read and the frame (critic r4b);
//  - rendered pixels of every visible tray slot, after the frame, from full-viewport shots (never clipped): its count,
//    type label and key each keep 3 CSS px of ink from its shell icon, and the count 3 px from the label and the key
//    (critic r6: at 900 px the ∞ printed 12 px into APFSDS).
// runCapture takes its browser and capture lock as arguments, so tools/hud-ammo-frame-ink.selftest.mjs drives the whole
// flow against a recording page.
import { resolve } from 'node:path';
import { cropImage, decodePng, encodePng, inkGap, slotFrameFindings } from './hud-ammo-frame-ink.mjs';

const SNIPER = ['ammo-reload-sniper', 'ammo-dry-cannon-sniper', 'ammo-reload-autoloader-sniper', 'ammo-dry-autoloader-sniper'];
// critic r8: the gun travel warning's chip on the sight (the canvas paints it on a mouse layout, a DOM chip on touch), with
// the default ring and with the widest (the ring's 15% ceiling), and a rack reloading or empty under the widest ring
const SNIPER_WIDE = ['ammo-reload-sniper-warn', 'ammo-reload-autoloader-sniper-warn-wide', 'ammo-reload-autoloader-sniper-wide',
  'ammo-dry-autoloader-sniper-wide'];
// r10: unlimited rounds through the scope (critic r9: no frame showed the ∞ readout), and the scope with a shot report and
// with the combat log open, which cover the vision switch's seat right of the sight on a mouse window under about 1200 px
// wide (the switch takes its mirror seat, or waits hidden: battleHudLayout seatScopeVision). The report stages run last:
// their cards and the open log stay up for the stages after them. (A touch layout shows no report or log at all.)
const SNIPER_LATE = ['ammo-unlimited-sniper', 'ammo-reload-sniper-report', 'ammo-reload-sniper-log'];
const BATTLE = ['ammo-reload', 'ammo-dry-cannon', 'ammo-low-autoloader', 'ammo-dry-autoloader', 'ammo-dry-autoloader-midclip',
  'ammo-dry-salvo', 'ammo-dry-atgm', 'ammo-unlimited', 'ammo-escort-dry'];
const TRAY = ['ammo-reload', 'ammo-dry-cannon', 'ammo-dry-atgm', 'ammo-unlimited'];
const CASES = Object.freeze([
  { name: 'desktop', width: 1440, height: 900, touch: false, scale: 2, stages: [...BATTLE, ...SNIPER, ...SNIPER_WIDE, ...SNIPER_LATE], crop: true },
  // critic r6: every mouse tray under 1000 px stacks (battleHudLayout data-hud-tray), 48x52 slots at 900 px, 44x52 at 640
  { name: 'stacked-900', width: 900, height: 700, touch: false, scale: 2, stages: [...BATTLE, ...SNIPER, ...SNIPER_WIDE, ...SNIPER_LATE], crop: true },
  { name: 'stacked-640', width: 640, height: 720, touch: false, scale: 2, stages: [...BATTLE, ...SNIPER, ...SNIPER_WIDE, ...SNIPER_LATE], crop: true },
  // critic r7: from 431 to about 525 px tall the scope's readout line sat on the rack's countdown; three stacked windows
  // the critic measured and a wide one, where the controls row sits under the sight. Critic r8: the scope's vision switch
  // ran under the tray and the controls row on these, and the readouts and the warning chip landed on it at 800x560; at
  // 1280x440 a rack reloading under the widest ring left the row no room above the controls
  { name: 'short-800', width: 800, height: 500, touch: false, scale: 2, stages: ['ammo-reload', ...SNIPER, ...SNIPER_WIDE, ...SNIPER_LATE], crop: true },
  { name: 'short-900', width: 900, height: 480, touch: false, scale: 2, stages: ['ammo-reload', ...SNIPER, ...SNIPER_WIDE], crop: true },
  { name: 'short-700', width: 700, height: 460, touch: false, scale: 2, stages: ['ammo-reload', ...SNIPER, ...SNIPER_WIDE], crop: true },
  { name: 'short-1280', width: 1280, height: 480, touch: false, scale: 2, stages: ['ammo-reload', ...SNIPER, ...SNIPER_WIDE], crop: true },
  { name: 'short-800-560', width: 800, height: 560, touch: false, scale: 2, stages: [...SNIPER, ...SNIPER_WIDE], crop: true },
  { name: 'short-1280-440', width: 1280, height: 440, touch: false, scale: 2, stages: [...SNIPER, ...SNIPER_WIDE], crop: true },
  // a mouse window under 540 px wide: the compact vision switch beside the sight
  { name: 'narrow-480', width: 480, height: 640, touch: false, scale: 2, stages: [...SNIPER, ...SNIPER_WIDE], crop: true },
  // (touch: the vision switch left of the sight, clear of the ammo and consumables column. r10: the gun travel warning's
  // DOM chip, which the reticle seats under the sight on a portrait phone (critic r9: at 50% + 48 px it met the scope's
  // countdown and a rack dropped below a wide ring), and the widest ring, whose readouts met the consumables at 667x375)
  { name: 'phone', width: 390, height: 844, touch: true, scale: 2, stages: [...BATTLE, ...SNIPER, ...SNIPER_WIDE, 'ammo-unlimited-sniper'], crop: true },
  // critic r3 measured the scope readout overlap at these three landscape phones
  { name: 'landscape-844', width: 844, height: 390, touch: true, scale: 2, stages: [...BATTLE, ...SNIPER, ...SNIPER_WIDE, 'ammo-unlimited-sniper'], crop: true },
  { name: 'landscape-932', width: 932, height: 430, touch: true, scale: 2, stages: SNIPER, crop: true },
  { name: 'landscape-667', width: 667, height: 375, touch: true, scale: 2, stages: [...BATTLE, ...SNIPER, ...SNIPER_WIDE, 'ammo-unlimited-sniper'], crop: true },
  // r10: a small portrait phone (its FIRE button under the sight) and a landscape phone under a browser's bars
  { name: 'phone-360', width: 360, height: 640, touch: true, scale: 2, stages: [...SNIPER, ...SNIPER_WIDE], crop: true },
  { name: 'landscape-740', width: 740, height: 360, touch: true, scale: 2, stages: [...SNIPER, ...SNIPER_WIDE], crop: true },
  // the 44 px tall touch slots (a portrait under 341 px wide, a landscape under 300 px tall; the r6 critic's probe)
  { name: 'portrait-320', width: 320, height: 568, touch: true, scale: 2, stages: TRAY, crop: true },
  { name: 'landscape-568', width: 568, height: 290, touch: true, scale: 2, stages: TRAY, crop: true },
]);
// What the reticle canvas must and must not show for each stage (pixel counts inside the sight's neighbourhood).
const EXPECT = Object.freeze({
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
  'ammo-reload-sniper-warn': { amberMin: 20, dangerMax: 4, warning: true },
  'ammo-reload-autoloader-sniper-warn-wide': { amberMin: 10, dangerMax: 4, warning: true },
  'ammo-reload-autoloader-sniper-wide': { amberMin: 10, dangerMax: 4 },
  'ammo-dry-autoloader-sniper-wide': { noReloadInk: true, dangerMin: 20, struckControl: null, dryMark: true },
  'ammo-unlimited-sniper': { amberMin: 10, dangerMax: 4, unlimited: true, noCountdown: true, scopeUnlimited: true },
  // (a shot report's own reds sit near the sight on a narrow window: no danger-ink ceiling)
  'ammo-reload-sniper-report': { amberMin: 20, report: true },
  'ammo-reload-sniper-log': { amberMin: 20, report: true, log: true },
});
// hud.ts RETICLE_AMMO_INK.dry / RELOAD_ACCENT; battleHudLayout.ts SIGHT_BAND_ABOVE / SIGHT_BAND_BELOW (the scope's
// readouts are checked against the row as furniture)
export const RULES = Object.freeze({
  DRY_INK: 'rgba(240,90,90,0.92)',
  RELOAD_INK: 'rgba(240,160,48,0.95)',
  SIGHT_BAND: { above: 64, below: 80, half: 90 },
  /** The least gap between the empty mark's strike and any text on the reticle (critic r3: 1.5 px from the range tag). */
  STRIKE_TEXT_GAP: 3,
  /** The least gap between the dispersion ring's stroke and any mark under the marker, and between the rack and any
   *  text there (critic r6: the desktop scope's countdown on the ring, its digits on the clip; a phone's clip on the
   *  ring). Sub-pixel slack for the recorded boxes' rounding. */
  FURNITURE_GAP: 3,
  SLACK: 0.05,
});
/** The least ink gap between any two of a tray slot's count, type label, key and shell icon (critic r4: the phone's 180
 *  ran into the dart; r4b: APFSDS crossed the dart's tail; r6: the stacked trays' ∞ and 0 printed over the label). */
export const TRAY_INK_GAP = 3;

/** Installed before the page boots: records the reticle canvas's calls in CSS px, one paint at a time. */
export function recordReticle() {
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
    // n: the path's points (a rack shell, magazineShellPath, is seven)
    log.paint.push({ op: 'stroke', style: String(ctx.strokeStyle), lineWidth: ctx.lineWidth, n: log.path.length,
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

/** Runs in the page: what the HUD shows, read off the DOM and the reticle's recorded paint (see the header). */
export function readHud(rules) {
  const { DRY_INK, RELOAD_INK, SIGHT_BAND, STRIKE_TEXT_GAP, FURNITURE_GAP, SLACK } = rules;
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
  const apart = (a, b) => Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
  const round = (value) => Math.round(value * 100) / 100;
  const struck = [...document.querySelectorAll('.cot-vehicle-controls>button.empty')].filter(visible);
  const shells = [...document.querySelectorAll('.cot-shell')].filter(visible);
  // --- geometry: the last reticle paint, by role ---
  const paint = window.__RETICLE_LOG?.paint ?? [];
  const cx = innerWidth / 2; const cy = innerHeight / 2;
  const ink = (op) => op.style.replace(/\s/g, '');
  const texts = paint.filter((op) => op.op === 'text' && op.text.trim());
  const dry = paint.filter((op) => op.op === 'stroke' && ink(op) === DRY_INK && !op.ring);
  const countdown = texts.filter((op) => ink(op) === RELOAD_INK && !op.text.startsWith('+'));
  const reloadInk = paint.filter((op) => ink(op) === RELOAD_INK && !(op.op === 'text' && op.text.startsWith('+'))).length;
  // the rack under the marker: its shells' dark contours (seven-point outlines, 3 px wide), where its ink ends
  const rack = paint.filter((op) => op.op === 'stroke' && op.n === 7 && op.lineWidth >= 2.5 && ink(op) !== DRY_INK
    && op.box.y0 > cy && op.box.x1 - op.box.x0 < 26 && Math.abs((op.box.x0 + op.box.x1) / 2 - cx) < 60);
  // the countdown, the scope's readout line and zoom plate, and its range tag off the ring's 4:30 rim (a cramped scope
  // sets the row right of the column under the marker: its zoom plate centres as far as 220 px from the marker; r10: or
  // above the ring), never a warning chip's own text
  const chipText = (op) => paint.some((chip) => chip.op === 'stroke' && chip.n === 6 && !chip.ring && chip.box.x0 <= op.box.x0
    && chip.box.x1 >= op.box.x1 && chip.box.y0 <= op.box.y0 && chip.box.y1 >= op.box.y1);
  const readouts = texts.filter((op) => Math.abs((op.box.x0 + op.box.x1) / 2 - cx) < 240 && Math.abs(op.box.y0 - cy) < innerHeight / 2
    && !chipText(op));
  // the zoom plate's rules either side of its text (hud.ts paintSniperZoom)
  const zoomRules = paint.filter((op) => op.op === 'stroke' && ink(op) === 'rgba(170,240,178,0.5)');
  const overlaps = [];
  for (const mark of dry) for (const text of texts) if (hit(mark.box, text.box)) overlaps.push(`empty mark over "${text.text}"`);
  // the strike (the 1.5 px danger diagonal over its dark contour) keeps its distance from every text
  for (const strike of dry.filter((op) => op.lineWidth === 1.5)) for (const text of texts) {
    if (!hit(strike.box, text.box) && apart(strike.box, text.box) < STRIKE_TEXT_GAP - SLACK) {
      overlaps.push(`the strike within ${STRIKE_TEXT_GAP} px of "${text.text}"`);
    }
  }
  // Every mark under the marker keeps FURNITURE_GAP from the dispersion ring's stroke, its halo included (the widest
  // of its full-circle strokes; critic r3: a phone's small ring through the struck round; r6: the desktop scope's
  // countdown on its dashes, a phone's clip touching it).
  const ringStrokes = paint.filter((op) => op.op === 'stroke' && op.circle);
  const halo = ringStrokes.reduce((best, op) => (!best || op.lineWidth > best.lineWidth ? op : best), null);
  const ringGaps = [];
  if (halo) {
    const { x, y, r } = halo.circle;
    const reach = halo.lineWidth / 2;
    const gap = (box) => {
      const near = Math.hypot(Math.max(box.x0 - x, 0, x - box.x1), Math.max(box.y0 - y, 0, y - box.y1));
      const far = Math.max(...[[box.x0, box.y0], [box.x1, box.y0], [box.x0, box.y1], [box.x1, box.y1]].map(([px, py]) => Math.hypot(px - x, py - y)));
      return Math.max(near - (r + reach), r - reach - far);
    };
    const marks = [...dry.map((op) => ({ what: op.lineWidth === 1.5 ? 'the empty strike' : 'an empty mark', box: op.box })),
      ...rack.map((op) => ({ what: 'a rack shell', box: op.box })),
      ...readouts.map((op) => ({ what: `"${op.text}"`, box: op.box })), ...zoomRules.map((op) => ({ what: 'a zoom rule', box: op.box }))];
    for (const mark of marks) {
      const g = gap(mark.box);
      ringGaps.push({ what: mark.what, gap: round(g) });
      if (g < FURNITURE_GAP - SLACK) overlaps.push(`${mark.what} ${round(g)} px from the ring`);
    }
  }
  for (let i = 0; i < readouts.length; i++) for (const other of readouts.slice(i + 1)) {
    if (hit(readouts[i].box, other.box)) overlaps.push(`"${readouts[i].text}" over "${other.text}"`);
  }
  // ... and every text there keeps FURNITURE_GAP from the rack's contours (critic r6: the countdown's digits on the clip)
  const rackGaps = [];
  for (const text of readouts) for (const shell of rack) {
    const g = apart(text.box, shell.box);
    rackGaps.push({ text: text.text, gap: round(g) });
    if (g < FURNITURE_GAP - SLACK) overlaps.push(`"${text.text}" ${round(g)} px from the rack`);
  }
  // the canvas warning chip, wherever it sits (under the marker, beside the readout line or above the ring): its outline,
  // the six-point stroke around its text
  const contains = (outer, inner) => outer.x0 <= inner.x0 && outer.x1 >= inner.x1 && outer.y0 <= inner.y0 && outer.y1 >= inner.y1;
  const chips = paint.filter((op) => op.op === 'stroke' && op.n === 6 && !op.ring && texts.some((text) => contains(op.box, text.box)));
  for (const chip of chips) for (const text of readouts) {
    if (!contains(chip.box, text.box) && hit(chip.box, text.box)) overlaps.push(`the warning chip over "${text.text}"`);
  }
  const furniture = [...dry, ...rack, ...readouts, ...zoomRules, ...chips];
  // (.cot-scope-vision: the scope's vision switch, which the aerial sheet seats beside the sight; .flight-identity: the
  // flight HUD's identity block; r10: every panel the layout measures for the reticle (battleHudLayout SIGHT_FURNITURE),
  // and the touch warning chip, which the reticle seats under the sight on a portrait phone. The shot report, the open
  // combat log and the centre notices are passing overlays the reticle never dodges (its marks would jump as they come
  // and go); only the vision switch, a control, keeps clear of them, below.)
  const controls = ['.cot-vehicle-controls>button', '.cot-shell', '.cot-con', '.cot-touch.on .round', '.cot-touch.on .joy',
    '.cot-touch.on .quick', '.cot-touch-aim.on .aimhint', '.cot-dp', '.cot-drive', '.cot-minimap', '.cot-top', '.cot-mode-status.show',
    '.cot-aim-warning:not([hidden])', '.cot-scope-vision', '.flight-identity', '.cot-ear'].flatMap((selector) => [...document.querySelectorAll(selector)].filter(visible)
    .map((el) => ({ name: selector, box: rect(el) })));
  // every mark of the sight keeps FURNITURE_GAP from every control (critic r8: the stack's foot 4.77 px into the row)
  for (const item of furniture) for (const control of controls) {
    const g = apart(item.box, control.box);
    if (g < FURNITURE_GAP - SLACK) {
      const what = item.op === 'text' ? `"${item.text}"` : item.n === 6 ? 'the warning chip' : zoomRules.includes(item) ? 'a zoom rule' : 'sight mark';
      overlaps.push(`${what} ${round(g)} px from ${control.name}`);
    }
  }
  // The touch warning chip the reticle seats under the sight is one of its marks: 3 px from every other control too.
  const seated = [...document.querySelectorAll('.cot-aim-warning[data-seat]:not([hidden])')].filter(visible);
  for (const chip of seated) for (const control of controls) {
    if (control.name === '.cot-aim-warning:not([hidden])') continue;
    const g = apart(rect(chip), control.box);
    if (g < FURNITURE_GAP - SLACK) overlaps.push(`the seated warning chip ${round(g)} px from ${control.name}`);
  }
  // The scope's vision switch keeps FURNITURE_GAP from every other HUD panel and control, on the screen (critic r8: seated
  // under the sight it ran under the tray slots, the consumables and the controls row on short mouse windows; beside the
  // sight on the right, touch met the ammo and consumables column). r10: the shot report and the open combat log share
  // the right lane; over the switch's seat they send it to its mirror seat, or hide it (battleHudLayout seatScopeVision).
  const vision = [...document.querySelectorAll('.cot-scope-vision')].filter(visible).map(rect);
  const panels = ['.cot-vehicle-controls>button', '.cot-shell', '.cot-con', '.cot-touch.on .round', '.cot-touch.on .joy',
    '.cot-touch.on .quick', '.cot-dp', '.cot-drive', '.cot-minimap', '.cot-top', '.cot-mode-status.show', '.cot-ear.l', '.cot-ear.r',
    '.cot-aim-warning:not([hidden])', '.cot-si-cardhost:not(:empty)', '.cot-si-log.open', '.flight-identity']
    .flatMap((selector) => [...document.querySelectorAll(selector)].filter(visible).map((el) => ({ name: selector, box: rect(el) })))
    .filter((panel) => panel.box.x1 - panel.box.x0 >= 1 && panel.box.y1 - panel.box.y0 >= 1);
  for (const box of vision) {
    if (box.x0 < 0 || box.y0 < 0 || box.x1 > innerWidth || box.y1 > innerHeight) overlaps.push('the vision switch leaves the screen');
    for (const panel of panels) {
      const g = apart(box, panel.box);
      if (g < FURNITURE_GAP - SLACK) overlaps.push(`the vision switch ${round(g)} px from ${panel.name}`);
    }
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
  // a type label and its count on one row (a desktop slot) keep their line boxes 3 px apart (critic r3: APFSDS180)
  const trayText = shells.map((el) => {
    const ty = el.querySelector('.ty'); const cnt = el.querySelector('.cnt');
    if (!ty || !cnt || !visible(ty) || !visible(cnt) || !ty.textContent || !cnt.textContent) return null;
    const range = document.createRange(); range.selectNodeContents(ty); const a = range.getBoundingClientRect();
    range.selectNodeContents(cnt); const b = range.getBoundingClientRect();
    const vertical = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0;
    return { text: `${ty.textContent}|${cnt.textContent}`, gap: vertical ? Math.round((b.left - a.right) * 10) / 10 : null };
  }).filter(Boolean);
  const fire = [...document.querySelectorAll('.cot-touch .fire')].filter(visible)
    .map((el) => ({ opacity: Number(getComputedStyle(el).opacity), border: getComputedStyle(el).borderTopColor }));
  const unlimitedSlot = shells.find((el) => el.classList.contains('unlimited'));
  const numeral = shells.find((el) => !el.classList.contains('unlimited'));
  // --- what each visible slot shows, for the saved frame's pixel read (critic r4b: the DOM passed, the frame did not) ---
  const allShells = [...document.querySelectorAll('.cot-shell')];
  const inkBox = (node) => {
    const range = document.createRange(); range.selectNodeContents(node);
    const r = range.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
  };
  const shown = (node) => !!node?.textContent && visible(node) && Number(getComputedStyle(node).opacity) > 0;
  const drawn = (el, pseudo) => {
    const style = getComputedStyle(el, pseudo);
    return style.content !== 'none' && style.content !== 'normal' && style.display !== 'none' ? style : null;
  };
  const slots = shells.map((el) => {
    const box = rect(el); const style = getComputedStyle(el);
    const border = ['Top', 'Right', 'Bottom', 'Left'].map((side) => parseFloat(style[`border${side}Width`]) || 0);
    const pad = { x0: box.x0 + border[3], y0: box.y0 + border[0], x1: box.x1 - border[1], y1: box.y1 - border[2] };
    const cnt = el.querySelector('.cnt'); const ty = el.querySelector('.ty'); const key = el.querySelector('.key');
    const strike = drawn(el, '::before'); const chevron = drawn(el, '::after');
    // a pseudo's resolved offset in px (a percentage of its slot when the engine leaves it unresolved)
    const px = (value, basis) => (/px$/.test(value) ? parseFloat(value) : /%$/.test(value) ? (basis * parseFloat(value)) / 100 : basis / 2);
    let strikeMark = null;
    if (strike && el.classList.contains('empty')) {
      const left = px(strike.left, pad.x1 - pad.x0); const right = px(strike.right, pad.x1 - pad.x0);
      const height = px(strike.height, 0) || 1.5; const top = px(strike.top, pad.y1 - pad.y0 - height);
      const length = pad.x1 - pad.x0 - left - right;
      const mx = pad.x0 + left + length / 2; const my = pad.y0 + top + height / 2;
      const reach = (length / 2 + height / 2) * Math.SQRT1_2;
      strikeMark = { length, box: { x0: mx - reach, y0: my - reach, x1: mx + reach, y1: my + reach } };
    }
    let chevronMark = null;
    if (chevron && el.classList.contains('sel')) {
      const size = parseFloat(chevron.fontSize); const x = pad.x0 + px(chevron.left, 0); const y = pad.y0 + px(chevron.top, pad.y1 - pad.y0);
      chevronMark = { box: { x0: x - 1, y0: y - size / 2, x1: x + size * 0.7, y1: y + size / 2 } };
    }
    const edge = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(style.borderTopColor);
    return {
      index: allShells.indexOf(el), name: `${ty?.textContent ?? ''}|${cnt?.textContent ?? ''}`, box,
      empty: el.classList.contains('empty'), selected: el.classList.contains('sel'),
      count: shown(cnt) ? { box: inkBox(cnt), danger: /240, 90, 90/.test(getComputedStyle(cnt).color) } : null,
      label: shown(ty) ? { box: inkBox(ty) } : null,
      key: shown(key) ? { box: rect(key) } : null,
      strike: strikeMark, chevron: chevronMark,
      edge: edge && border[0] >= 1 ? { box: { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y0 + border[0] }, rgb: edge.slice(1).map(Number) } : null,
    };
  });
  return {
    slots,
    amber, danger,
    struck: struck.map((el) => ({ label: el.getAttribute('aria-label'), disabled: el.disabled,
      strike: getComputedStyle(el.querySelector('.si'), '::after').content !== 'none' })),
    counts: shells.map((el) => el.querySelector('.cnt')?.textContent ?? ''),
    emptySlots: shells.filter((el) => el.classList.contains('empty')).length,
    emptySlot, emptyOut, trayText, fire, gunDry: document.body.classList.contains('cot-gun-dry'),
    touch: document.body.classList.contains('cot-touch-layout'), tray: document.body.dataset.hudTray ?? null,
    unlimitedCount: unlimitedSlot ? { size: parseFloat(getComputedStyle(unlimitedSlot.querySelector('.cnt')).fontSize),
      color: getComputedStyle(unlimitedSlot.querySelector('.cnt')).color,
      zIndex: getComputedStyle(unlimitedSlot.querySelector('.cnt')).zIndex } : null,
    numeralSize: numeral ? parseFloat(getComputedStyle(numeral.querySelector('.cnt')).fontSize) : null,
    paintOps: paint.length, dryMarks: dry.length, reloadInk, countdown: countdown.map((op) => op.text).join(''),
    readouts: readouts.map((op) => op.text), ringGaps, rackGaps, overlaps, chips: chips.map((op) => op.box),
    row: row && visible(row) ? rect(row) : null, vision: vision[0] ?? null, visionSeat: document.body.dataset.scopeVision ?? '',
    reportUp: [...document.querySelectorAll('.cot-si-cardhost > .cot-si-card, .cot-si-log.open')].some(visible),
    logOpen: [...document.querySelectorAll('.cot-si-log.open')].some(visible),
    seatedChip: seated.length > 0,
    warning: chips.length > 0 || [...document.querySelectorAll('.cot-aim-warning:not([hidden])')].some(visible),
  };
}

/** Runs in the page: stage an ammo state on the fixture. */
export function stageInPage(name) { window.__HUD_LAYOUT.state(name); }
/** Runs in the page: wait `count` animation frames. */
export async function framesInPage(count) { for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame); }
/** Runs in the page: until the tray's own CSS transitions (frame, opacity, transform) have run out, at most 1.5 s, then
 *  two frames. */
export async function settleTray() {
  const deadline = performance.now() + 1500;
  let waited = 0;
  for (;;) {
    const running = document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.target?.closest?.('.cot-shells')
      && Number.isFinite(a.effect.getComputedTiming().endTime));
    if (!running.length || performance.now() > deadline) {
      for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
      return { waited, left: running.length };
    }
    waited += running.length;
    await Promise.race([Promise.all(running.map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 200))]);
  }
}
/** Runs in the page: shows only `marks` (count, label, icon, key) of the slots at `indices`. */
export function showTrayMarks([indices, marks]) {
  const all = document.querySelectorAll('.cot-shell');
  for (const index of indices) {
    const el = all[index];
    el.querySelector('.cnt').style.visibility = marks.includes('count') ? '' : 'hidden';
    el.querySelector('.ty').style.visibility = marks.includes('label') ? '' : 'hidden';
    el.querySelector('canvas').style.visibility = marks.includes('icon') ? '' : 'hidden';
    el.querySelector('.key').style.visibility = marks.includes('key') ? '' : 'hidden';
  }
}

/**
 * What a visible slot's descriptor fails to name (critic r6: a descriptor without its label silently skipped the
 * saved-frame label read and the label's ink gap). Every slot prints a count and a type label; a mouse tray shows its
 * key; an empty slot is struck and its count is the danger 0; the phone's selected slot carries its chevron.
 */
function slotDescriptorIssues(slots, { touch }) {
  const issues = [];
  if (!slots.length) issues.push('no visible tray slot');
  for (const slot of slots) {
    const tag = `slot "${slot.name}"`;
    if (!slot.count) issues.push(`${tag}: the DOM read names no count`);
    else if (slot.count.danger !== slot.empty) issues.push(`${tag}: its count's danger ink ${slot.count.danger} does not match empty ${slot.empty}`);
    if (!slot.label) issues.push(`${tag}: the DOM read names no type label`);
    if (!touch && !slot.key) issues.push(`${tag}: the DOM read names no key`);
    if (slot.empty && !slot.strike) issues.push(`${tag}: the DOM read names no strike on an empty slot`);
    if (touch && slot.selected && !slot.chevron) issues.push(`${tag}: the DOM read names no chevron on the selected slot`);
  }
  return issues;
}

/** The ink-gap pairs: [first mark, second mark, first mark's brightness rise, second's]. A count is bright (40); a
 *  label, a key and an icon (dimmed on an empty slot) are dim (24). */
const GAP_PAIRS = [['count', 'icon', 40, 24], ['label', 'icon', 24, 24], ['key', 'icon', 24, 24], ['count', 'label', 40, 24],
  ['key', 'count', 24, 40]];

/**
 * Every visible tray slot's ink gaps (GAP_PAIRS), read in Node off full-viewport shots taken after the frame: the slots
 * bare, then with only their counts, labels, icons and keys. Never a clipped shot (critic r4b: clipped shots taken
 * before the frame left five phone frames without the slot's marks).
 */
async function trayInkGaps(page, slots, scale) {
  if (!slots.length) return [];
  const indices = slots.map((slot) => slot.index);
  const shot = async (marks) => { await page.evaluate(showTrayMarks, [indices, marks]); return decodePng(await page.screenshot()); };
  const shots = { bare: await shot([]), count: await shot(['count']), label: await shot(['label']), icon: await shot(['icon']) };
  if (slots.some((slot) => slot.key)) shots.key = await shot(['key']);
  await page.evaluate(showTrayMarks, [indices, ['count', 'label', 'icon', 'key']]);
  return slots.map((slot) => {
    const row = { index: slot.index, text: slot.name };
    for (const [a, b, aRise, bRise] of GAP_PAIRS) {
      if (!slot[a] || (b !== 'icon' && !slot[b])) continue;
      row[`${a}-${b}`] = inkGap({ bare: shots.bare, mark: shots[a], icon: shots[b] }, slot.box, scale, { markRise: aRise, iconRise: bRise });
    }
    return row;
  });
}

const amberish = (color) => {
  const [r, g, b] = (/rgba?\((\d+), (\d+), (\d+)/.exec(color)?.slice(1) ?? []).map(Number);
  return r > 200 && g > 140 && g < 210 && b < 120;
};

/**
 * One stage of one case: stage it, let the tray settle, read the DOM, save the frame with nothing in between, read the
 * frame, then measure the ink gaps. Returns the stage's report row (its `issues` are failures).
 */
async function captureStage({ page, c, stage, out, writeFile }) {
  const expect = EXPECT[stage];
  await page.evaluate(stageInPage, stage);
  // the layout solver runs a frame later; let it settle, then paint once more on the settled layout
  await page.evaluate(framesInPage, 4);
  await page.evaluate(stageInPage, stage);
  await page.evaluate(framesInPage, 3);
  // (a shot report lands about 0.6 s after its hits and stays 6.2 s; the layout then seats the switch a frame later)
  if (expect.report) {
    await page.waitForSelector('.cot-si-cardhost > .cot-si-card', { timeout: 5000 }).catch(() => {});
    await page.evaluate(framesInPage, 4);
  }
  await page.waitForTimeout(260); // the tray's border transitions (.12 s) settle before their colours are read
  const settled = await page.evaluate(settleTray);
  // the DOM is read, and nothing touches the page, until the frame is saved
  const hud = await page.evaluate(readHud, RULES);
  const file = `${c.name}-${stage}.png`;
  const frame = decodePng(await page.screenshot({ path: resolve(out, file) }));
  const issues = [...hud.overlaps, ...slotDescriptorIssues(hud.slots, { touch: c.touch })];
  if (hud.touch !== c.touch) issues.push(`the page's touch layout is ${hud.touch}, the case's ${c.touch}`);
  if (!c.touch && (hud.tray === 'stacked') !== c.width < 1000) issues.push(`a ${c.width} px mouse tray is ${hud.tray}`);
  if (expect.amberMin != null && hud.amber < expect.amberMin) issues.push(`reload amber ${hud.amber} < ${expect.amberMin}`);
  if (expect.amberMax != null && hud.amber > expect.amberMax) issues.push(`a dry weapon still shows reload amber (${hud.amber})`);
  if (expect.dangerMin != null && hud.danger < expect.dangerMin) issues.push(`empty-state ink ${hud.danger} < ${expect.dangerMin}`);
  if (expect.dangerMax != null && hud.danger > expect.dangerMax) issues.push(`unexpected empty-state ink (${hud.danger})`);
  if (expect.dryMark && !hud.dryMarks) issues.push('no struck empty mark was painted');
  if (expect.noReloadInk && hud.reloadInk) issues.push(`a dry sight still paints ${hud.reloadInk} reload-ink marks`);
  if (expect.noCountdown && hud.countdown) issues.push(`a clip cycle prints a countdown (${hud.countdown})`);
  if (expect.warning && !hud.warning) issues.push('the gun travel warning shows no chip');
  // (the switch waits hidden only while a shot report or the open log covers its seat and the mirror seat has no room)
  if (stage.includes('sniper') && !hud.vision && !(hud.visionSeat === 'none' && hud.reportUp)) issues.push('the scope shows no vision switch');
  if (hud.visionSeat && !hud.reportUp) issues.push(`the vision switch left its seat (${hud.visionSeat}) with no report over it`);
  if (expect.report && !hud.reportUp) issues.push('no shot report is up');
  if (expect.log && !hud.logOpen) issues.push('the combat log is not open');
  if (expect.scopeUnlimited && !hud.readouts.some((text) => text.trim() === '∞')) issues.push(`the scope readout prints no ∞ (${hud.readouts.join('|')})`);
  if (expect.warning && c.touch && c.height >= c.width && !hud.seatedChip) issues.push('the portrait warning chip is not seated under the sight');
  if (!hud.paintOps) issues.push('no reticle paint was recorded');
  if (expect.struckControl === true && !hud.struck.some((row) => row.strike && row.disabled)) issues.push('no struck, disabled launcher/magazine control');
  if (expect.struckControl === undefined && hud.struck.length) issues.push(`unexpected struck control ${JSON.stringify(hud.struck)}`);
  if (expect.unlimited) {
    if (hud.emptySlots || !hud.counts.length || hud.counts.some((text) => text !== '∞')) {
      issues.push(`unlimited rounds must print ∞ in every slot (${hud.counts.join(',')})`);
    }
    if (!hud.unlimitedCount || hud.unlimitedCount.size < (c.touch || c.width < 1000 ? 16 : 19) || hud.unlimitedCount.zIndex !== '4') {
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
  for (const row of hud.trayText) if (row.gap != null && row.gap < TRAY_INK_GAP) issues.push(`tray text "${row.text}" ${row.gap} px apart`);
  if (settled.left) issues.push(`${settled.left} tray transitions still running when the frame was taken`);
  // the saved frame shows every mark the DOM says each slot shows (critic r4b)
  const frameFindings = slotFrameFindings(frame, hud.slots, c.scale);
  for (const finding of frameFindings) issues.push(`saved frame: ${finding}`);
  if (c.crop) {
    const clip = { x: c.width / 2 - 170, y: c.height / 2 - 120, width: 340, height: Math.min(240, c.height / 2 + 100) };
    await writeFile(resolve(out, `${c.name}-${stage}-reticle.png`), encodePng(cropImage(frame, { x0: clip.x * c.scale,
      y0: clip.y * c.scale, x1: (clip.x + clip.width) * c.scale, y1: (clip.y + clip.height) * c.scale })));
  }
  const trayInk = await trayInkGaps(page, hud.slots, c.scale);
  for (const row of trayInk) {
    const slot = hud.slots.find((item) => item.index === row.index);
    for (const [a, b] of GAP_PAIRS) {
      if (!slot?.[a] || (b !== 'icon' && !slot[b])) continue;
      const gap = row[`${a}-${b}`];
      if (gap == null || gap < TRAY_INK_GAP) issues.push(`tray ${a} of "${row.text}" ${gap} px from its ${b === 'icon' ? 'shell icon' : b}`);
    }
  }
  if (c.touch) {
    // (the scope may hide the FIRE buttons: then only the body mark is read)
    const dim = hud.fire.every((button) => button.opacity < 0.7);
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
  return { case: c.name, stage, file, ...hud, settled, frameFindings, trayInk, issues };
}

/**
 * The whole capture: take the capture lock (`lock.acquire(timeoutMs, options)`, `lock.refresh()`, `lock.release()`),
 * open each case's page on the fixture and capture its stages, then write report.json. Returns the report.
 */
export async function runCapture({ chromium, lock, url, out, cases = CASES, stageFilter = '', caseFilter = '', lockTimeoutMs,
  lockOptions = {}, writeFile, mkdir }) {
  await mkdir(out, { recursive: true });
  const reports = [];
  const failures = [];
  await lock.acquire(lockTimeoutMs, lockOptions);
  const heartbeat = setInterval(() => lock.refresh(), 30_000);
  heartbeat.unref?.();
  const startedAt = Date.now();
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-gpu'] });
    for (const c of cases.filter((item) => !caseFilter || caseFilter.split(',').includes(item.name))) {
      const context = await browser.newContext({ viewport: { width: c.width, height: c.height }, hasTouch: c.touch,
        isMobile: c.touch, deviceScaleFactor: c.scale, reducedMotion: 'reduce' });
      await context.addInitScript(recordReticle);
      const page = await context.newPage();
      page.on('pageerror', (error) => failures.push(`${c.name}: ${error.message}`));
      await page.goto(`${url}/tools/fixtures/battle-hud-layout.html?locale=en-US`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.__HUD_LAYOUT);
      for (const stage of c.stages.filter((name) => !stageFilter || stageFilter.split(',').includes(name))) {
        const report = await captureStage({ page, c, stage, out, writeFile });
        reports.push(report);
        for (const issue of report.issues) failures.push(`${c.name}/${stage}: ${issue}`);
        lock.refresh();
      }
      await context.close();
    }
  } finally {
    await browser?.close();
    clearInterval(heartbeat);
    lock.release();
    await writeFile(resolve(out, 'report.json'), JSON.stringify({ heldMs: Date.now() - startedAt, reports, failures }, null, 2));
  }
  return { reports, failures, heldMs: Date.now() - startedAt };
}
