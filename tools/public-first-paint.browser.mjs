#!/usr/bin/env node
// public-first-paint.browser.mjs — the public pages lay out at first paint, before and without JavaScript (brand-ui
// SPEC §5.5, PLAN BUI-F3). Copyright © 2026 Kevin B. Liu.
//
// Each page opens in a fresh context per viewport with JavaScript disabled and enabled (reduced motion, so no rail or
// reel moves). Every element of the served markup is keyed by its document-order index under <body>: the JavaScript
// side tags the elements when parsing ends, before any module runs (readyState 'interactive'); the no-JavaScript side
// never changes its DOM. Boxes come from DOMSnapshot (which works with JavaScript off). The layouts match when every
// element present in both, whose own text JavaScript does not rewrite, keeps its box within the tolerance: x and width
// everywhere on the page, and x, y, width and height inside the first viewport.
//
//   node tools/public-first-paint.browser.mjs --url=http://127.0.0.1:4173 [--out=.qa-dev/first-paint]
//     [--pages=home,docs,docs/vehicles,gallery,404] [--viewports=390x844] [--tolerance=2] [--playwright-module=...]
//     [--compare=<another run's first-paint.json>]   (also diff this run's JavaScript layouts against an earlier run)
// Writes first-paint.json and first-viewport screenshots; exits 1 when a page's two layouts differ (or, with --compare,
// when a JavaScript layout moved).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const arg = (name, fallback) => process.argv.find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const { chromium } = await import(arg('playwright-module', 'playwright'));
const origin = arg('url', 'http://127.0.0.1:4173');
const out = resolve(arg('out', '.qa-dev/first-paint'));
const pages = arg('pages', 'home,docs,docs/vehicles,gallery,404').split(',');
const viewports = arg('viewports', '390x844').split(',').map((v) => v.split('x').map(Number));
const tolerance = Number(arg('tolerance', '2'));
const compare = arg('compare', '');
await mkdir(out, { recursive: true });

const TAG = `(() => {
  const tag = () => { let i = 0; for (const el of document.body ? document.body.getElementsByTagName('*') : []) el.setAttribute('data-fp', String(i++)); };
  document.addEventListener('readystatechange', () => { if (document.readyState === 'interactive') tag(); });
})();`;

/** Boxes and own text of the served elements, keyed by their document-order index under <body>. */
async function layout(page, jsOn) {
  const cdp = await page.context().newCDPSession(page);
  const snap = await cdp.send('DOMSnapshot.captureSnapshot', { computedStyles: ['display', 'visibility'], includeDOMRects: true });
  await cdp.detach();
  const doc = snap.documents[0];
  const str = (i) => (i >= 0 ? snap.strings[i] : '');
  const { nodes, layout: lay } = doc;
  const bounds = new Map();
  lay.nodeIndex.forEach((n, k) => bounds.set(n, lay.bounds[k]));
  const children = new Map();
  nodes.parentIndex.forEach((p, i) => { if (!children.has(p)) children.set(p, []); children.get(p).push(i); });
  const name = (i) => str(nodes.nodeName[i]).toLowerCase();
  const attr = (i, key) => { const a = nodes.attributes[i] || []; for (let k = 0; k < a.length; k += 2) if (str(a[k]) === key) return str(a[k + 1]); return null; };
  const text = (i) => (children.get(i) ?? []).filter((c) => nodes.nodeType[c] === 3).map((c) => str(nodes.nodeValue[c])).join('').replace(/\s+/g, ' ').trim();
  const pseudo = new Set(nodes.pseudoType?.index ?? []); // ::before/::after/::marker nodes: never tagged
  const body = nodes.nodeName.findIndex((n) => str(n) === 'BODY');
  const out = {};
  let index = 0;
  // document order under <body>; a noscript's children are elements only without JavaScript (the JavaScript side holds
  // them as text, so the tagger never numbered them): neither side descends into one
  const walk = (i) => {
    for (const c of children.get(i) ?? []) {
      if (nodes.nodeType[c] !== 1 || pseudo.has(c)) continue;
      const key = jsOn ? attr(c, 'data-fp') : String(index++);
      const b = bounds.get(c);
      if (key !== null) out[key] = { tag: name(c), cls: (attr(c, 'class') || '').split(/\s+/)[0], box: b ? b.map((v) => Math.round(v * 10) / 10) : null, text: text(c).slice(0, 80) };
      if (name(c) !== 'noscript') walk(c);
    }
  };
  walk(body);
  return out;
}

/** Elements whose boxes differ beyond the tolerance (both laid out, own text unchanged). */
function differences(a, b, height) {
  const rows = [];
  let compared = 0;
  for (const [key, x] of Object.entries(a)) {
    const y = b[key];
    if (!y || x.tag !== y.tag || x.text !== y.text) continue;
    const shown = (e) => e.box && (e.box[2] > 0 || e.box[3] > 0);
    if (!shown(x) && !shown(y)) continue;
    compared++;
    if (shown(x) !== shown(y)) { rows.push({ key, tag: x.tag, cls: x.cls, text: x.text.slice(0, 40), a: x.box ?? ['hidden'], b: y.box ?? ['hidden'] }); continue; }
    const d = x.box.map((v, k) => Math.abs(v - y.box[k]));
    const inView = x.box[1] < height || y.box[1] < height;
    const moved = d[0] > tolerance || d[2] > tolerance || (inView && (d[1] > tolerance || d[3] > tolerance));
    if (moved) rows.push({ key, tag: x.tag, cls: x.cls, text: x.text.slice(0, 40), a: x.box, b: y.box });
  }
  return { compared, rows };
}

const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-gpu', '--hide-scrollbars'] });
const report = { origin, tolerance, pages: {} };
let failed = 0;
try {
  for (const path of pages) {
    for (const [width, height] of viewports) {
      const touch = width <= 900;
      const shots = {};
      for (const jsOn of [false, true]) {
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch,
          javaScriptEnabled: jsOn, reducedMotion: 'reduce', locale: 'en-US' });
        if (jsOn) await context.addInitScript(TAG);
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        await page.goto(`${origin}/${path}`, { waitUntil: 'load' });
        await page.waitForTimeout(jsOn ? 2500 : 1200);
        const label = `${path.replaceAll('/', '_')}-${width}x${height}-${jsOn ? 'js' : 'nojs'}`;
        await page.screenshot({ path: `${out}/${label}.png` });
        shots[jsOn ? 'js' : 'nojs'] = await layout(page, jsOn);
        await context.close();
      }
      const diff = differences(shots.nojs, shots.js, height);
      const key = `${path} ${width}x${height}`;
      report.pages[key] = { compared: diff.compared, moved: diff.rows.length, rows: diff.rows.slice(0, 40), js: shots.js };
      if (diff.rows.length) failed++;
      console.log(`${key}: ${diff.compared} elements compared, ${diff.rows.length} moved without JavaScript`);
      for (const r of diff.rows.slice(0, 8)) console.log(`  #${r.key} <${r.tag}${r.cls ? `.${r.cls}` : ''}> "${r.text}" no-JS ${r.a.join(',')} vs JS ${r.b.join(',')}`);
    }
  }
} finally {
  await browser.close();
}
if (compare) {
  const earlier = JSON.parse(await readFile(compare, 'utf8'));
  report.compare = {};
  for (const [key, page] of Object.entries(report.pages)) {
    const was = earlier.pages[key]?.js;
    if (!was) continue;
    const [, size] = key.split(' ');
    const diff = differences(was, page.js, Number(size.split('x')[1]));
    report.compare[key] = { compared: diff.compared, moved: diff.rows.length, rows: diff.rows.slice(0, 40) };
    if (diff.rows.length) failed++;
    console.log(`${key} against ${compare}: ${diff.compared} elements compared, ${diff.rows.length} moved`);
    for (const r of diff.rows.slice(0, 8)) console.log(`  #${r.key} <${r.tag}${r.cls ? `.${r.cls}` : ''}> "${r.text}" then ${r.a.join(',')} now ${r.b.join(',')}`);
  }
}
await writeFile(`${out}/first-paint.json`, JSON.stringify(report));
console.log(failed ? `public-first-paint: ${failed} layout(s) differ` : 'public-first-paint: every page lays out at first paint as it does with JavaScript');
process.exit(failed ? 1 : 0);
