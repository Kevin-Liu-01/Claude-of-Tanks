#!/usr/bin/env node
// tools/zh-latin-audit.browser.mjs — zero visible English in zh-CN captures of the fixed screen set (BUI-F8, SPEC 15).
//
// OCR-free: every screen renders in Chrome with the zh-CN catalog, and the audit reads what the player can see as text —
// visible text nodes (clipped or hidden ones excluded), ::before/::after content (attr() resolved), visible input
// values and placeholders, and every string the page draws on a 2D canvas (fillText/strokeText are recorded) — then
// keeps only the Latin runs that are not names. The allowlist is names only: vehicle names from the fleet registry,
// units and numerals, keys, codes with digits, the wordmark and the few product names every locale keeps
// (tools/i18n-literal-lint.mjs englishWords). Fixture player names are user content and are skipped.
//
// Screens: the shell (tools/fixtures/zh-audit.html: Garage, battle setup, Settings, play menu, room, debrief, battle
// load) at 1366x768 and 390x844, and the battle HUD (tools/fixtures/battle-hud-layout.html) across its states at
// 1366x768 and 390x844 touch. Needs a dev server on --url (vite) and Playwright with Chrome.
//
//   node tools/zh-latin-audit.browser.mjs --url=http://127.0.0.1:5189 --out=/tmp/zh-audit [--locale=zh-CN] [--case=a,b]
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { englishWords } from './i18n-literal-lint.mjs';

const arg = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || fallback;
const url = arg('url', 'http://127.0.0.1:5189');
const out = resolve(arg('out', 'outputs/zh-latin-audit'));
const locale = arg('locale', 'zh-CN');
const only = arg('case', '').split(',').filter(Boolean);
await mkdir(out, { recursive: true });

// Vehicle names are names in every locale (every fleet id's name, display and short names and search aliases, from the
// generated tank asset manifest; the Node spec registry holds only the boot specs).
const manifest = JSON.parse(readFileSync(new URL('../public/icons/tank-assets.json', import.meta.url), 'utf8'));
const nameWords = new Set();
for (const spec of Object.values(manifest.tanks ?? {})) {
  for (const name of [spec.name, spec.label?.displayName, spec.label?.shortName, ...(spec.label?.searchAliases ?? [])]) {
    for (const word of String(name || '').match(/[A-Za-z][A-Za-z'’.\/-]*/g) ?? []) nameWords.add(word.toLowerCase());
  }
}
const USER_CONTENT = [/Commander_Long_Name_\d+/g, /Commander with a long name \d+/g, /Your commander/g];
// Keycap and gamepad legends (src/game/input.ts labelForCode / PAD_BUTTON_LABELS) are device labels: a short string made
// only of them is a keycap, not copy.
const KEY_LEGENDS = new Set(['space', 'esc', 'tab', 'caps', 'enter', 'num', 'bksp', 'shift', 'ctrl', 'alt', 'l-shift', 'r-shift',
  'l-ctrl', 'r-ctrl', 'l-alt', 'r-alt', 'lmb', 'mmb', 'rmb', 'mb', 'wheel', 'pad', 'lb', 'rb', 'lt', 'rt', 'ls', 'rs', 'select',
  'start', 'dpad', 'view', 'menu', 'del', 'ins', 'home', 'end', 'pgup', 'pgdn']);

/** The Latin words in a visible string that are not names. */
export function englishIn(text) {
  let clean = String(text);
  for (const pattern of USER_CONTENT) clean = clean.replace(pattern, ' ');
  const words = englishWords(clean).filter((word) => !nameWords.has(word.toLowerCase()) && !nameWords.has(word.toLowerCase().replace(/[.'’]+$/, '')));
  if (clean.trim().length <= 14 && words.every((word) => KEY_LEGENDS.has(word.toLowerCase()))) return [];
  return words;
}

/** In-page: every string the player can see as text, with where it came from. */
function collectVisibleText() {
  const vw = innerWidth;
  const vh = innerHeight;
  const onScreen = (r) => r.width > 0.5 && r.height > 0.5 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh;
  const visible = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && onScreen(el.getBoundingClientRect());
  const where = (el) => {
    const parts = [];
    for (let at = el; at && at !== document.body && parts.length < 3; at = at.parentElement) {
      parts.unshift(`${at.tagName.toLowerCase()}${at.id ? `#${at.id}` : ''}${typeof at.className === 'string' && at.className ? `.${at.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`);
    }
    return parts.join(' > ');
  };
  const items = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode());) {
    const text = node.nodeValue.replace(/\s+/g, ' ').trim();
    const el = node.parentElement;
    if (!text || !el || el.closest('script,style,noscript,template,title')) continue;
    if (!visible(el)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    if (![...range.getClientRects()].some(onScreen)) continue;
    // clipped away by an overflow-hidden ancestor
    let clipped = false;
    const rect = range.getBoundingClientRect();
    for (let at = el; at && at !== document.body; at = at.parentElement) {
      const style = getComputedStyle(at);
      if (/(hidden|clip|auto|scroll)/.test(style.overflow + style.overflowX + style.overflowY)) {
        const box = at.getBoundingClientRect();
        if (rect.right <= box.left || rect.left >= box.right || rect.bottom <= box.top || rect.top >= box.bottom) { clipped = true; break; }
      }
    }
    if (!clipped) items.push({ source: 'text', text, where: where(el) });
  }
  const resolveContent = (content, el) => {
    let text = '';
    for (const match of content.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|attr\(\s*([\w-]+)\s*\)/g)) {
      if (match[3]) text += el.getAttribute(match[3]) || '';
      else text += (match[1] ?? match[2]).replace(/\\([0-9a-f]{1,6})\s?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16))).replace(/\\(.)/g, '$1');
    }
    return text;
  };
  for (const el of document.body.querySelectorAll('*')) {
    if (!visible(el)) continue;
    for (const pseudo of ['::before', '::after']) {
      const style = getComputedStyle(el, pseudo);
      if (!style.content || style.content === 'none' || style.content === 'normal' || style.display === 'none'
        || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      const text = resolveContent(style.content, el).trim();
      if (text) items.push({ source: pseudo, text, where: where(el) });
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (['range', 'hidden', 'checkbox', 'radio', 'color'].includes(el.type)) continue;
      if (el.value) items.push({ source: 'value', text: el.value, where: where(el) });
      else if (el.placeholder) items.push({ source: 'placeholder', text: el.placeholder, where: where(el) });
    }
    if (el instanceof HTMLSelectElement && el.selectedOptions[0]) items.push({ source: 'select', text: el.selectedOptions[0].textContent.trim(), where: where(el) });
  }
  for (const text of new Set(window.__ZH_CANVAS_TEXT ?? [])) items.push({ source: 'canvas', text, where: 'canvas' });
  window.__ZH_CANVAS_TEXT = [];
  return items;
}

const recordCanvasText = () => {
  window.__ZH_CANVAS_TEXT = [];
  for (const proto of [CanvasRenderingContext2D.prototype, globalThis.OffscreenCanvasRenderingContext2D?.prototype].filter(Boolean)) {
    for (const method of ['fillText', 'strokeText']) {
      const original = proto[method];
      proto[method] = function recorded(text, ...rest) {
        const value = String(text ?? '').trim();
        if (value && window.__ZH_CANVAS_TEXT.length < 4000) window.__ZH_CANVAS_TEXT.push(value);
        return original.call(this, text, ...rest);
      };
    }
  }
};

const settle = async (page) => {
  await page.evaluate(async () => {
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
    const finite = document.getAnimations().filter((animation) => animation.playState === 'running'
      && Number.isFinite(animation.effect?.getComputedTiming().endTime));
    await Promise.race([Promise.all(finite.map((animation) => animation.finished.catch(() => {}))), new Promise((done) => setTimeout(done, 1500))]);
    await new Promise(requestAnimationFrame);
  });
};

const SHELL = ['garage', 'setup', 'settings', 'play', 'room', 'end', 'load'];
const HUD_STATES = ['idle', 'notifications', 'reports', 'combined', 'mode-capture_the_flag', 'mode-zone_control', 'mode-endless_horde',
  'special', 'spectator', 'settings', 'ended'];
const VIEWPORTS = [['desktop', 1366, 768, false], ['phone', 390, 844, true]];
const cases = [];
for (const [view, width, height, touch] of VIEWPORTS) {
  for (const surface of SHELL) cases.push({ name: `shell-${surface}-${view}`, width, height, touch, path: `/tools/fixtures/zh-audit.html?locale=${locale}&surface=${surface}`, ready: '__ZH_AUDIT' });
  cases.push({ name: `hud-${view}`, width, height, touch, path: `/tools/fixtures/battle-hud-layout.html?locale=${locale}`, ready: '__HUD_LAYOUT', states: view === 'desktop' ? HUD_STATES : ['idle', 'combined', 'settings'] });
}

const { chromium } = await import(arg('playwright-module', 'playwright'));
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-gpu'] });
const screens = [];
const errors = [];
try {
  for (const audit of cases) {
    if (only.length && !only.some((name) => audit.name.startsWith(name))) continue;
    const context = await browser.newContext({ viewport: { width: audit.width, height: audit.height }, hasTouch: audit.touch, isMobile: audit.touch,
      deviceScaleFactor: 1, reducedMotion: 'reduce', locale });
    await context.addInitScript(recordCanvasText);
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${audit.name}: ${error.message}`));
    await page.goto(`${url}${audit.path}`, { waitUntil: 'networkidle' });
    await page.waitForFunction((ready) => !!window[ready], audit.ready, { timeout: 30000 });
    for (const state of audit.states ?? [null]) {
      if (state) await page.evaluate((name) => window.__HUD_LAYOUT.state(name), state);
      if (state === 'ended') {
        await page.waitForFunction(() => document.querySelector('.es-hero')?.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }), null, { timeout: 10000 }).catch(() => {});
      }
      await settle(page);
      await page.waitForTimeout(250);
      const items = await page.evaluate(collectVisibleText);
      const findings = items.map((item) => ({ ...item, words: englishIn(item.text) })).filter((item) => item.words.length);
      const name = state ? `${audit.name}-${state}` : audit.name;
      screens.push({ name, width: audit.width, height: audit.height, items: items.length, findings });
      await page.screenshot({ path: resolve(out, `${name}.png`) });
      console.log(`${name}: ${items.length} visible strings, ${findings.length} with English${findings.length ? `\n  ${findings.map((f) => `[${f.source}] ${f.text.slice(0, 90)}  (${f.words.join(', ')}) @ ${f.where}`).join('\n  ')}` : ''}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
const total = screens.reduce((sum, screen) => sum + screen.findings.length, 0);
await writeFile(resolve(out, 'report.json'), `${JSON.stringify({ locale, screens, errors, total }, null, 2)}\n`);
console.log(`zh-latin-audit: ${screens.length} screens, ${screens.reduce((sum, s) => sum + s.items, 0)} visible strings, ${total} with English; ${errors.length} page error(s)`);
if (errors.length) console.log(errors.join('\n'));
process.exit(total || errors.length ? 1 : 0);
