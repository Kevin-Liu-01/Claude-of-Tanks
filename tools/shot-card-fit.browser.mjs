#!/usr/bin/env node
// The shot card fits its text in every locale (owner 2026-11-01, "china goes to twolines in some text. fix"): the card
// sizes to its content and every row is one line by construction (its value never wraps or cuts; its label shows whole or
// out of view beside the row's glyph). On the HUD fixture, resolved shell:hit events per variant: APFSDS through screens
// (the SCREENS chip), HEAT through ERA (the ERA chip, and a four-digit roll), HE, ATGM with its blast footer over 0-3
// vehicles with and without blast damage, a missile's splash alone, and the card's figure from none (never −0) through
// −9,999. Each variant renders in every shipped locale and the pseudo-locale (English about 40 % longer and accented: the
// stand-in for a longer translation) at the narrowest card the mouse layout draws (176 px) and at each dock size: every
// line of the card holds one line box, a value is whole, a label is whole or wholly out of view, the glyph clears the
// value, the header sits inside the card, and the card stays inside its dock, dropping whole rows from its foot.
//   node tools/shot-card-fit.browser.mjs --url=http://127.0.0.1:5173 [--out=.qa-dev/shot-card-fit] [--shots]
//     [--locales=en-US,zh-CN,pseudo] [--only=<variant substring>]
import { launchGuardedBrowser } from './browser-launch.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { openCaptureHold } from './capture-hold.mjs';

const arg = (name, fallback) => process.argv.find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const { chromium } = await import(arg('playwright-module', 'playwright'));
const shots = process.argv.includes('--shots');
const only = arg('only', '');

/** The rounds: each one's resolved hit, as the sim stamps it (a cut roll draws the chip beside the pen). */
const WEAPONS = {
  APFSDS: { shellType: 'APFSDS', caliberMm: 120, kind: 'pen', penRollMm: 480, penRollFreshMm: 600 },
  HEAT: { shellType: 'HEAT', caliberMm: 120, kind: 'pen', eraPlate: true, penRollMm: 300, penRollFreshMm: 480 },
  'HEAT tandem': { shellType: 'HEAT', caliberMm: 152, kind: 'pen', eraPlate: true, penRollMm: 1100, penRollFreshMm: 1300 },
  HE: { shellType: 'HE', caliberMm: 152, kind: 'he_pen', penRollMm: 60, penRollFreshMm: 60 },
  ATGM: { shellType: 'ATGM', guided: true, caliberMm: 152, kind: 'he_pen', penRollMm: 560, penRollFreshMm: 560 },
};
const FIGURES = [0, 1, 45, 845, 1234, 9999];
/** [name, events, the card's figure]: a missile's blast victims each a [hpRemoved] after its direct hit. */
const VARIANTS = [];
for (const weapon of ['APFSDS', 'HEAT', 'HEAT tandem', 'HE']) {
  for (const figure of FIGURES) VARIANTS.push([`${weapon} −${figure}`, [{ ...WEAPONS[weapon], hpRemoved: figure }], figure]);
}
for (const vehicles of [0, 1, 2, 3]) {
  for (const blastDealt of vehicles ? [true, false] : [false]) {
    for (const figure of FIGURES) {
      if (blastDealt && figure < vehicles + 1) continue;
      const each = blastDealt ? Math.floor(figure * 0.4 / vehicles) || 1 : 0;
      const direct = figure - each * vehicles;
      VARIANTS.push([`ATGM −${figure} blast ${vehicles}${vehicles ? (blastDealt ? ' dealt' : ' none') : ''}`, [
        { ...WEAPONS.ATGM, hpRemoved: direct },
        ...Array.from({ length: vehicles }, (_, i) => ({ ...WEAPONS.ATGM, kind: 'he_splash', hpRemoved: each, victim: i + 1 })),
      ], figure]);
    }
  }
}
// a missile that met only its blast: the card reads the splash (no angle, armour or pen rows)
for (const figure of [45, 9999]) {
  VARIANTS.push([`ATGM splash only −${figure}`, [{ ...WEAPONS.ATGM, kind: 'he_splash', hpRemoved: figure }], figure]);
}
const DOCKS = ['1920x1080', '1440x900', '1366x768', '1280x720', '1024x600', '900x700', '600x1000'];
/** The frames a --shots run keeps: the widest values and the tallest card. */
const SHOTS = ['APFSDS −845', 'HEAT −1234', 'HEAT tandem −9999', 'ATGM −845 blast 1 dealt', 'ATGM −9999 blast 3 dealt'];
const LOCALES = arg('locales', 'en-US,zh-CN,pseudo').split(',');

/** Runs in the page: stage one variant's hits on a fresh shell id and measure the card. */
async function stage({ events, shellId }) {
  const f = window.__HUD_LAYOUT;
  const me = f.tanks.find((t) => t.isPlayer);
  const enemies = f.tanks.filter((t) => t.team !== me.team);
  const base = { attackerId: me.id, attackerSpecId: 'm1a3', zone: 'hullFront', flightDistM: 240, timeS: 60,
    pos: [0, 1, 50], localPos: [0, 1, 2], localDir: [0, 0, -1], impactAngleDeg: 34, targetMaxHp: 12000,
    effectiveMm: 350, nominalMm: 220, dmgRoll: 640, shellId };
  for (const { victim = 0, hpRemoved, ...hit } of events) {
    const target = enemies[victim];
    f.bus.emit('shell:hit', { ...base, ...hit, targetId: target.id, targetName: victim ? 'T-90AM' : 'Leopard 2A5',
      targetSpecId: victim ? 't90am' : 'leo2a4_v', pos: [victim * 6, 1, 50], damage: hpRemoved, hpRemoved,
      targetHpAfter: 12000 - hpRemoved });
  }
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  for (let i = 0; i < 3; i++) { f.hud.update(f.frame); await frame(); }
  // what of a text rect shows: clipped by every box between it and the line that hides its overflow
  const visible = (r, from, to) => {
    let top = r.top, bottom = r.bottom, left = r.left, right = r.right;
    for (let el = from; el; el = el === to ? null : el.parentElement) {
      if (getComputedStyle(el).overflow === 'visible') continue;
      const b = el.getBoundingClientRect();
      top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom); left = Math.max(left, b.left); right = Math.min(right, b.right);
    }
    return bottom - top > 0.5 && right - left > 0.5 ? { top, bottom } : null;
  };
  // line boxes: the shown text's client rects grouped by vertical overlap (a wrapped line is a second group)
  const lineBoxes = (el) => {
    const rects = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node; (node = walk.nextNode());) {
      if (!node.textContent.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        const shown = r.width > 0.5 && r.height > 0.5 && visible(r, node.parentElement, el);
        if (shown) rects.push(shown);
      }
    }
    const lines = [];
    for (const r of rects.sort((a, b) => a.top - b.top)) {
      const line = lines.find((l) => Math.min(l.bottom, r.bottom) - Math.max(l.top, r.top) > 0.5 * Math.min(l.bottom - l.top, r.bottom - r.top));
      if (line) { line.top = Math.min(line.top, r.top); line.bottom = Math.max(line.bottom, r.bottom); } else lines.push({ ...r });
    }
    return lines.length;
  };
  const box = (el) => el.getBoundingClientRect();
  const card = document.querySelector('.cot-si-cardhost .cot-si-card');
  if (!card) return { missing: true };
  const c = box(card), host = box(card.parentElement), header = card.querySelector('.cot-si-hd');
  // a value is cut when it ends in an ellipsis or runs past the card's edge
  const cut = (el) => !!el && (el.scrollWidth > el.clientWidth + 1 || box(el).right > c.right + 0.5 || box(el).left < c.left - 0.5);
  const h = box(header);
  const rowsBox = card.querySelector('.cot-si-rows') ? box(card.querySelector('.cot-si-rows')) : null;
  const shown = (el) => el.checkVisibility({ checkVisibilityCSS: true }) && box(el).height > 0;
  const rows = [];
  const add = (part, el, { whole = null, clip = c } = {}) => {
    if (!shown(el)) return;
    const r = box(el);
    const inside = r.top >= clip.top - 0.5 && r.bottom <= clip.bottom + 0.5 && r.left >= clip.left - 0.5 && r.right <= clip.right + 0.5;
    const outside = r.bottom <= clip.top + 0.5 || r.top >= clip.bottom - 0.5 || r.right <= clip.left + 0.5 || r.left >= clip.right - 0.5;
    // a row the dock dropped (wrapped past the rows' box) is out of view, never sliced
    if (outside && clip !== c) return;
    // a row's label: whole beside its glyph or wholly out of its one-line box; the glyph never under the value
    const label = el.querySelector('.cot-si-k>span'), glyph = el.querySelector('.cot-si-k>svg');
    let labelState = null, glyphUnderValue = false;
    if (label) {
      const l = box(label), k = box(label.parentElement);
      labelState = l.left >= k.left - 0.5 && l.right <= k.right + 0.5 && l.top >= k.top - 0.5 && l.bottom <= k.bottom + 0.5 ? 'whole'
        : l.top >= k.bottom - 0.5 ? 'out' : 'cut';
    }
    if (glyph && whole) glyphUnderValue = box(glyph).right > box(whole).left + 0.5 || box(glyph).width < 11.5;
    rows.push({ part, text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 60), lines: lineBoxes(el), sliced: !inside,
      valueCut: cut(whole), labelState, glyphUnderValue });
  };
  add('header', header, { whole: header.querySelector('.cot-si-dmg') });
  for (const cell of card.querySelectorAll('.cot-si-sub>span')) add('subtitle', cell);
  for (const row of card.querySelectorAll('.cot-si-kv')) add('row', row, { whole: row.querySelector('b'), clip: rowsBox });
  for (const line of card.querySelectorAll('.cot-si-missile-blast')) add('blast', line);
  return {
    width: Math.round(c.width), shown: card.dataset.shown, figure: card.querySelector('.cot-si-dmg')?.textContent || '',
    headerTopInside: h.top >= c.top - 0.5 && h.bottom <= c.bottom + 0.5,
    cardInsideDock: c.top >= host.top - 0.5 && c.bottom <= host.bottom + 0.5,
    contentFits: card.scrollHeight <= card.clientHeight + 1,
    rows,
  };
}

let hold;
hold = await openCaptureHold({ label: 'shot-card-fit', timeoutMs: Number(arg('lock-timeout', String(45 * 60 * 1000))), lockClass: 'render', holdCapMinutes: 15 });

let browser;
const failures = [];
const report = {};
try {
  browser = await launchGuardedBrowser(chromium, { channel: 'chrome', headless: true, args: ['--disable-gpu'] });
  const out = arg('out', '.qa-dev/shot-card-fit'); await mkdir(out, { recursive: true });
  let shellId = 1000;
  // (560 px and under the mouse layout's card stops at its 176 px floor beside the sight; 1000 tall docks every row)
  const passes = [['narrowest', '560x1000', VARIANTS], ...DOCKS.map((size) => ['dock', size, VARIANTS])];
  for (const locale of LOCALES) {
    for (const [pass, size, variants] of passes) {
      const [width, height] = size.split('x').map(Number);
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', (error) => errors.push(error.message));
      const query = locale === 'pseudo' ? 'locale=en-US&pseudo=1' : `locale=${locale}`;
      await page.goto(`${arg('url', 'http://127.0.0.1:5173')}/tools/fixtures/battle-hud-layout.html?${query}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!window.__HUD_LAYOUT);
      for (const [name, events, figure] of variants) {
        if (only && !name.includes(only)) continue;
        const seen = await page.evaluate(stage, { events, shellId: shellId++ });
        const key = `${locale} ${pass} ${size} ${name}`;
        report[key] = seen;
        const fail = (why) => failures.push(`${key}: ${why}`);
        if (seen.missing) { fail('no card'); continue; }
        if (pass === 'narrowest' && seen.width > 176) fail(`the card is ${seen.width} px, not the 176 px floor`);
        if (Number(seen.shown) !== figure) fail(`the card's figure reads ${seen.shown}, not ${figure}`);
        if (!figure && seen.figure) fail(`a shot that took nothing shows "${seen.figure}"`);
        if (!seen.headerTopInside) fail('the header is not inside the card');
        if (!seen.cardInsideDock) fail('the card is not inside its dock');
        for (const row of seen.rows) {
          if (row.lines !== 1) fail(`${row.part} "${row.text}" takes ${row.lines} lines`);
          if (row.sliced) fail(`${row.part} "${row.text}" is sliced by the card's edge`);
          if (row.valueCut) fail(`${row.part} "${row.text}": its value is cut`);
          if (row.labelState === 'cut') fail(`${row.part} "${row.text}": its label is cut`);
          if (row.glyphUnderValue) fail(`${row.part} "${row.text}": its glyph is lost under the value`);
        }
        if (pass === 'narrowest' && !seen.contentFits) fail('the card clips its own content');
        if (shots && SHOTS.includes(name)) {
          await page.locator('.cot-si-cardhost .cot-si-card').screenshot({
            path: `${out}/${locale}-${pass}-${size}-${name.replace(/[^\w-]+/g, '_')}.png` });
        }
      }
      if (errors.length) failures.push(`${locale} ${size}: page errors ${errors.join(' | ')}`);
      await context.close();
      console.log(`${locale} ${pass} ${size}: ${variants.length} variants`);
    }
  }
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 1));
} finally {
  await browser?.close();
  await hold?.release();
}
for (const failure of failures) console.error(`FAIL ${failure}`);
console.log(failures.length ? `FAIL shot-card-fit: ${failures.length}` : `PASS shot-card-fit: ${Object.keys(report).length} cards`);
process.exit(failures.length ? 1 : 0);
