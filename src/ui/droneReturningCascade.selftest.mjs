// The tank row's "Returning" cue (aerialHud.css, data-phase=returning while a recalled drone flies home and lands) must
// win the cascade wherever the row is drawn: the desktop strip, the touch strip, and the touch action dock of
// item/hud-actions-mobile, whose tile rules restate colour and shadow at (0,3,2), dim a cooling tile's icon at (0,5,2)
// and ring an open More panel's tiles at (0,5,2). A verifier found the first cue losing to all three on the dock, so the
// player saw an ordinary cooling tile. This receipt parses every stylesheet a battle loads that can reach the row
// (src/ui/*.css and the HUD's own sheet in hud.ts), matches each selector against a model of the row's DOM in each
// context (media queries evaluated), and resolves the winning declaration per property: the returning rule must
// outrank every other matching declaration by importance and specificity alone (never by source order, which the lazy
// loading of aerialHud.css does not fix). No dependencies: a small CSS tokenizer and selector matcher below.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { STYLE_LAYERS } from './styleLayers.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// ---------------------------------------------------------------------------------------------------------------
// Stylesheets. The dock's tile rules as published on item/hud-actions-mobile 2600fa32f stand in for the dock until it
// lands: once the live battleHudLayout.css carries [data-hud-dock] rules, the live ones are resolved instead.
const DOCK_RULES_2600FA32F = `
body.cot-touch-layout .cot-vehicle-controls>button{height:44px!important;min-height:44px;grid-template-rows:1fr;padding-block:5px}
body.cot-touch-layout[data-hud-dock] .cot-vehicle-controls{display:block;width:var(--hud-systems-width,0px);height:var(--hud-systems-height,0px);max-width:none;padding:0;overflow:visible}
body.cot-touch-layout[data-hud-dock] .cot-vehicle-controls>button{position:absolute!important;inset:var(--dock-y,0px) auto auto var(--dock-x,0px)!important;width:var(--hud-systems-tile,48px)!important;height:var(--hud-systems-tile,48px)!important;min-width:var(--hud-systems-tile,48px)!important;max-width:var(--hud-systems-tile,48px);min-height:var(--hud-systems-tile,48px);grid-template-columns:minmax(0,1fr);grid-template-rows:24px 12px;align-content:center;justify-items:center;gap:2px;padding:4px 2px 5px;overflow:hidden;touch-action:none;border:1px solid rgba(205,219,229,.34);border-bottom:2px solid rgba(205,219,229,.42);border-radius:6px!important;background:linear-gradient(180deg,rgba(29,38,45,.94),rgba(7,11,15,.92));color:#dce7ef;box-shadow:0 4px 13px rgba(0,0,0,.4),inset 0 1px rgba(255,255,255,.05);text-shadow:0 1px 2px #000;font:800 9px/12px var(--hud-font,system-ui);letter-spacing:.02em;text-transform:uppercase;transition:border-color 90ms ease,color 90ms ease}
body.cot-touch-layout[data-hud-dock] .cot-vehicle-controls>button.cot-special{inset:var(--dock-y,0px) auto auto var(--dock-x,0px)!important}
.cot-vehicle-controls>.cot-dock-more{display:none}
body.cot-touch-layout[data-hud-dock] .cot-vehicle-controls>.cot-dock-more{display:grid}
body.cot-touch-layout[data-hud-dock] .cot-vehicle-controls>button[data-dock-overflow]{visibility:hidden;pointer-events:none}
body.cot-touch-layout[data-hud-dock][data-hud-dock-open] .cot-vehicle-controls>button[data-dock-overflow]{visibility:visible;pointer-events:auto;z-index:2;box-shadow:0 6px 18px rgba(0,0,0,.62),0 0 0 1px rgba(240,173,69,.45)}
body.cot-touch-layout[data-hud-dock][data-hud-dock-open] .cot-vehicle-controls>.cot-dock-more{color:#ffd27a;border-color:#f0ad45}
body.cot-touch-layout[data-hud-dock][data-hud-dock-open] .cot-vehicle-controls{z-index:calc(var(--hud-layer-score) + 2)}
body.cot-touch-layout[data-hud-dock] .cot-vehicle-controls>button::after{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;border-radius:inherit;background:conic-gradient(transparent calc((1 - var(--cd,0)) * 360deg),rgba(2,6,9,.74) 0)}
body.cot-touch-layout[data-hud-dock] .cot-vehicle-controls>button .si{grid-column:1;grid-row:1;position:relative;z-index:1}
body.cot-touch-layout[data-hud-dock] .cot-vehicle-controls .si svg{width:22px!important;height:22px!important}
body.cot-touch-layout[data-hud-dock] .cot-vehicle-controls>button .sl{grid-column:1;grid-row:2;position:relative;z-index:1;max-width:44px;overflow:hidden;text-overflow:ellipsis;letter-spacing:0;text-transform:none;text-align:center}
body.cot-touch-layout[data-hud-dock] .cot-vehicle-controls>button .sk{display:none}
body.cot-touch-layout[data-hud-dock] .cot-vehicle-controls .system-status{display:block;grid-area:auto;position:absolute;z-index:2;top:3px;right:3px;font:800 8px/1 var(--hud-font,system-ui);letter-spacing:0;opacity:1}
body.cot-touch-layout[data-hud-dock] .cot-vehicle-controls .system-status:empty{display:none}
body.cot-touch-layout[data-hud-dock] .cot-vehicle-controls>button.active{color:#ffd27a;border-color:#f0ad45;background:radial-gradient(circle at 50% 35%,rgba(120,83,28,.92),rgba(42,27,10,.96) 70%);box-shadow:0 0 14px rgba(240,150,40,.4),inset 0 1px 4px rgba(255,225,170,.2)}
body.cot-touch-layout[data-hud-dock] .cot-vehicle-controls>button:active:not(:disabled){border-color:#f0ad45;color:#ffd27a}
body.cot-touch-layout[data-hud-dock] .cot-vehicle-controls>button:disabled{opacity:.5}
body.cot-touch-layout[data-hud-dock] .cot-vehicle-controls>button.cooling{opacity:1}
body.cot-touch-layout[data-hud-dock] .cot-vehicle-controls>button.cooling::before{content:'';position:absolute;inset:0;z-index:2;pointer-events:none;border-radius:inherit;padding:2px}
body.cot-touch-layout[data-hud-dock] .cot-vehicle-controls>button.cooling .si{opacity:.5}
body.cot-touch-layout[data-hud-dock] .cot-vehicle-controls>button.cooling .sl{color:#ffd27a;font-size:11px}
`;
const hudSource = read('./hud.ts');
const hudSheet = hudSource.match(/\nconst HUD_CSS = `([\s\S]*?)\n`;/);
assert.ok(hudSheet, 'the HUD keeps its own sheet in hud.ts (HUD_CSS)');
const sheets = readdirSync(new URL('.', import.meta.url)).filter((file) => file.endsWith('.css')).sort()
  .map((file) => ({ name: file, text: read(`./${file}`) }));
// CSS-in-TS declares its cascade layer at the ensureStyle() call (brand-ui SPEC §5); the stand-in dock rules land in
// battleHudLayout.css, so they take its layer.
const hudLayer = /ensureStyle\('cot-hud-style', HUD_CSS, '([a-z]+)'\)/.exec(hudSource)?.[1];
assert.ok(hudLayer, 'the HUD sheet is injected through ensureStyle with its layer');
sheets.push({ name: 'hud.ts HUD_CSS', text: `@layer ${hudLayer}{${hudSheet[1].replace(/\$\{[^}]*\}/g, 'x')}}` });
const liveDock = sheets.find((sheet) => sheet.name === 'battleHudLayout.css')?.text.includes('[data-hud-dock]');
const dockLayer = /@layer ([a-z]+)\{/.exec(sheets.find((sheet) => sheet.name === 'battleHudLayout.css')?.text ?? '')?.[1];
if (!liveDock) sheets.push({ name: 'dock rules (item/hud-actions-mobile 2600fa32f)', text: dockLayer ? `@layer ${dockLayer}{${DOCK_RULES_2600FA32F}}` : DOCK_RULES_2600FA32F });
for (const name of ['aerialHud.css', 'battleHudLayout.css', 'responsiveSurfaces.css']) {
  assert.ok(sheets.some((sheet) => sheet.name === name), `${name} is read`);
}

// ---------------------------------------------------------------------------------------------------------------
// CSS tokenizer: style rules with their media conditions (no nesting in these sheets; @keyframes and @font-face skipped).
function splitTop(text, separator) {
  const parts = []; let depth = 0, quote = null, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === separator && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts;
}
function blockEnd(text, open) {
  let depth = 0, quote = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  throw new Error('unbalanced block');
}
function parseSheet(text, sheet, media = [], rules = [], layer = null) {
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  while (i < text.length) {
    const brace = text.indexOf('{', i), semi = text.indexOf(';', i);
    if (brace < 0) break;
    if (semi >= 0 && semi < brace && /^\s*@(import|charset|namespace|layer)/.test(text.slice(i, semi))) { i = semi + 1; continue; }
    const prelude = text.slice(i, brace).trim();
    const end = blockEnd(text, brace);
    const body = text.slice(brace + 1, end);
    i = end + 1;
    if (prelude.startsWith('@')) {
      const at = prelude.match(/^@([\w-]+)\s*(.*)$/s);
      if (at[1] === 'media') parseSheet(body, sheet, [...media, at[2]], rules, layer);
      else if (at[1] === 'supports' || at[1] === 'container') parseSheet(body, sheet, media, rules, layer); // conservative: may apply
      else if (at[1] === 'layer') {
        // a named layer block (src/ui/styleLayers.ts order); nested layers would need dotted names
        assert.ok(layer === null && STYLE_LAYERS.includes(at[2].trim()), `${sheet}: @layer ${at[2]} is one of the document's layers`);
        parseSheet(body, sheet, media, rules, at[2].trim());
      } else if (at[1] === 'scope') throw new Error(`${sheet}: @${at[1]} changes the cascade; teach this receipt`);
      continue; // @keyframes, @font-face, @page, @property
    }
    assert.ok(!body.includes('{'), `${sheet}: no nested rules in "${prelude.slice(0, 60)}"`);
    const declarations = splitTop(body, ';').map((d) => d.trim()).filter(Boolean).map((d) => {
      const colon = d.indexOf(':');
      let value = d.slice(colon + 1).trim();
      const important = /!\s*important$/i.test(value);
      if (important) value = value.replace(/!\s*important$/i, '').trim();
      return { property: d.slice(0, colon).trim().toLowerCase(), value, important };
    });
    for (const selector of splitTop(prelude, ',')) {
      rules.push({ sheet, selector: selector.trim(), parsed: parseSelector(selector.trim()), media, declarations, order: rules.length, layer });
    }
  }
  return rules;
}

// ---------------------------------------------------------------------------------------------------------------
// Selectors: compounds joined by combinators; specificity per Selectors Level 4 (:is/:not/:has take their most
// specific argument, :where none).
function parseSelector(text) {
  const compounds = []; let compound = []; let i = 0, combinator = null;
  const ident = () => { const m = text.slice(i).match(/^-?[_a-zA-Z -￿\\-][\w -￿\\-]*/); assert.ok(m, `selector "${text}" at ${i}`); i += m[0].length; return m[0]; };
  const balanced = (open, close) => { let depth = 0; const start = i; for (; i < text.length; i++) { if (text[i] === open) depth++; else if (text[i] === close && --depth === 0) { i++; return text.slice(start + 1, i - 1); } } throw new Error(`unbalanced ${text}`); };
  const flush = () => { if (compound.length) { compounds.push({ combinator, simple: compound }); compound = []; combinator = null; } };
  while (i < text.length) {
    const c = text[i];
    if (/\s|>|\+|~/.test(c)) {
      let j = i, comb = ' ';
      while (j < text.length && /[\s>+~]/.test(text[j])) { if (text[j] !== ' ' && !/\s/.test(text[j])) comb = text[j]; j++; }
      if (compound.length) { flush(); combinator = comb; }
      i = j; continue;
    }
    if (c === '*') { i++; compound.push({ kind: 'universal' }); }
    else if (c === '.') { i++; compound.push({ kind: 'class', name: ident() }); }
    else if (c === '#') { i++; compound.push({ kind: 'id', name: ident() }); }
    else if (c === '[') {
      const inner = balanced('[', ']');
      const m = inner.match(/^\s*([\w-]+)\s*(?:([~|^$*]?=)\s*("[^"]*"|'[^']*'|[^\s\]]+)\s*([is])?)?\s*$/);
      assert.ok(m, `attribute selector [${inner}]`);
      compound.push({ kind: 'attr', name: m[1], op: m[2] ?? null, value: m[3]?.replace(/^["']|["']$/g, '') ?? null });
    } else if (c === ':') {
      const element = text[i + 1] === ':'; i += element ? 2 : 1;
      const name = ident().toLowerCase();
      const arg = text[i] === '(' ? balanced('(', ')') : null;
      if (element || ['before', 'after', 'first-line', 'first-letter'].includes(name)) compound.push({ kind: 'pseudo-element', name });
      else compound.push({ kind: 'pseudo', name, arg, list: ['not', 'is', 'where', 'has', 'matches'].includes(name) ? splitTop(arg, ',').map((s) => parseSelector(s.trim().replace(/^>\s*/, ''))) : null });
    } else compound.push({ kind: 'type', name: ident().toLowerCase() });
  }
  flush();
  return compounds;
}
function specificity(parsed) {
  const s = [0, 0, 0];
  for (const { simple } of parsed) {
    for (const part of simple) {
      if (part.kind === 'id') s[0]++;
      else if (part.kind === 'class' || part.kind === 'attr') s[1]++;
      else if (part.kind === 'type' || part.kind === 'pseudo-element') s[2]++;
      else if (part.kind === 'pseudo') {
        if (part.name === 'where') continue;
        if (part.list) { const best = part.list.map(specificity).sort(compareSpecificity).at(-1); for (let k = 0; k < 3; k++) s[k] += best[k]; }
        else s[1]++;
      }
    }
  }
  return s;
}
function compareSpecificity(a, b) { return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]; }

// Element model: { tag, classes, attrs, states, parent, children }.
function element(tag, { classes = [], attrs = {}, states = [] } = {}, children = []) {
  const node = { tag, classes: new Set(classes), attrs: new Map(Object.entries(attrs)), states: new Set(states), parent: null, children };
  for (const child of children) child.parent = node;
  return node;
}
const STATE_PSEUDOS = new Set(['disabled', 'enabled', 'hover', 'active', 'focus', 'focus-visible', 'focus-within', 'checked', 'visited', 'link', 'any-link', 'target', 'placeholder-shown', 'fullscreen']);
let unsupported = null;
function matchCompound(node, simple) {
  const pending = [];
  for (const part of simple) {
    switch (part.kind) {
      case 'universal': break;
      case 'type': if (node.tag !== part.name) return false; break;
      case 'class': if (!node.classes.has(part.name)) return false; break;
      case 'id': if (node.attrs.get('id') !== part.name) return false; break;
      case 'attr': {
        if (!node.attrs.has(part.name)) return false;
        const v = node.attrs.get(part.name), want = part.value;
        if (part.op === '=' && v !== want) return false;
        if (part.op === '~=' && !v.split(/\s+/).includes(want)) return false;
        if (part.op === '^=' && !v.startsWith(want)) return false;
        if (part.op === '$=' && !v.endsWith(want)) return false;
        if (part.op === '*=' && !v.includes(want)) return false;
        if (part.op === '|=' && !(v === want || v.startsWith(`${want}-`))) return false;
        break;
      }
      case 'pseudo-element': return false; // the declarations style a pseudo-element, not this element
      default: pending.push(part);
    }
  }
  for (const part of pending) {
    const siblings = node.parent?.children ?? [node];
    const index = siblings.indexOf(node);
    if (STATE_PSEUDOS.has(part.name)) {
      const on = part.name === 'enabled' ? !node.states.has('disabled') : part.name === 'focus-within' ? node.states.has('focus') : node.states.has(part.name);
      if (!on) return false;
    } else if (part.name === 'not') { if (part.list.some((s) => matches(node, s))) return false; }
    else if (part.name === 'is' || part.name === 'where' || part.name === 'matches') { if (!part.list.some((s) => matches(node, s))) return false; }
    else if (part.name === 'has') { const any = (n) => n.children.some((c) => part.list.some((s) => matches(c, s)) || any(c)); if (!any(node)) return false; }
    else if (part.name === 'root') { if (node.tag !== 'html') return false; }
    else if (part.name === 'empty') { if (node.children.length || node.attrs.has('#text')) return false; }
    else if (part.name === 'first-child') { if (index !== 0) return false; }
    else if (part.name === 'last-child') { if (index !== siblings.length - 1) return false; }
    else if (part.name === 'only-child') { if (siblings.length !== 1) return false; }
    else if (part.name === 'nth-child' || part.name === 'nth-last-child') {
      const position = part.name === 'nth-child' ? index + 1 : siblings.length - index;
      const m = part.arg.replace(/\s+/g, '').match(/^(?:(odd)|(even)|(-?\d*)n([+-]\d+)?|([+-]?\d+))$/);
      if (!m) { unsupported = `:${part.name}(${part.arg})`; return false; }
      const [a, b] = m[1] ? [2, 1] : m[2] ? [2, 0] : m[5] ? [0, +m[5]] : [m[3] === '' ? 1 : m[3] === '-' ? -1 : +m[3], +(m[4] ?? 0)];
      if (!(a === 0 ? position === b : (position - b) / a >= 0 && Number.isInteger((position - b) / a))) return false;
    } else { unsupported = `:${part.name}`; return false; }
  }
  return true;
}
function matches(node, parsed, at = parsed.length - 1) {
  if (!matchCompound(node, parsed[at].simple)) return false;
  if (at === 0) return true;
  const combinator = parsed[at].combinator;
  if (combinator === '>') return !!node.parent && matches(node.parent, parsed, at - 1);
  if (combinator === ' ') { for (let p = node.parent; p; p = p.parent) if (matches(p, parsed, at - 1)) return true; return false; }
  const siblings = node.parent?.children ?? [];
  const index = siblings.indexOf(node);
  if (combinator === '+') return index > 0 && matches(siblings[index - 1], parsed, at - 1);
  if (combinator === '~') return siblings.slice(0, index).some((s) => matches(s, parsed, at - 1));
  throw new Error(`combinator ${combinator}`);
}

// Media queries of these sheets: pointer, hover, width, height, orientation, reduced motion, colour scheme, contrast.
function mediaMatches(query, env) {
  return splitTop(query, ',').some((one) => {
    let q = one.trim().toLowerCase(); let negate = false;
    if (q.startsWith('not ')) { negate = true; q = q.slice(4); }
    q = q.replace(/^only\s+/, '');
    const result = q.split(/\s+and\s+/).every((term) => {
      term = term.trim();
      if (term === 'screen' || term === 'all') return true;
      if (term === 'print') return false;
      const m = term.match(/^\(\s*([\w-]+)\s*(?::\s*([^)]+?))?\s*\)$/);
      assert.ok(m, `media term "${term}"`);
      const [, feature, raw] = m; const value = raw?.trim();
      const px = () => { const n = value.match(/^([\d.]+)(px|em|rem)?$/); assert.ok(n, `media length ${value}`); return +n[1] * (n[2] === 'em' || n[2] === 'rem' ? 16 : 1); };
      switch (feature) {
        case 'pointer': case 'any-pointer': return value === env.pointer;
        case 'hover': case 'any-hover': return value === (env.pointer === 'fine' ? 'hover' : 'none');
        case 'max-width': return env.width <= px();
        case 'min-width': return env.width >= px();
        case 'max-height': return env.height <= px();
        case 'min-height': return env.height >= px();
        case 'orientation': return value === (env.width > env.height ? 'landscape' : 'portrait');
        case 'prefers-reduced-motion': return value === (env.reducedMotion ? 'reduce' : 'no-preference');
        case 'prefers-color-scheme': return value === 'dark';
        case 'prefers-contrast': case 'forced-colors': case 'inverted-colors': return value === 'no-preference' || value === 'none';
        case 'display-mode': return value === 'browser';
        default: throw new Error(`media feature ${feature}`);
      }
    });
    return negate ? !result : result;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// The row as hud.ts builds it, in one context.
const LONGHANDS = {
  color: ['color', 'all'],
  'box-shadow': ['box-shadow', 'all'],
  opacity: ['opacity', 'all'],
  'border-bottom-color': ['border-bottom-color', 'border-bottom', 'border-color', 'border', 'border-block-end-color', 'border-block-end', 'border-block-color', 'border-block', 'all'],
  'animation-name': ['animation-name', 'animation', 'all'],
};
function buildRow({ phase, cooling, disabled, overflow }) {
  const tile = (classes, attrs = {}, states = [], label = 'x') => element('button', { classes, attrs: { type: 'button', ...attrs }, states },
    [element('span', { classes: ['si'] }, [element('svg', { attrs: { viewBox: '0 0 24 24' } }, [element('path')])]),
      element('span', { classes: ['sl'], attrs: { '#text': label } }), element('span', { classes: ['sk'], attrs: { '#text': 'V' } })]);
  const drone = tile(['cot-auxiliary', 'cot-drone-control', ...(cooling ? ['cooling'] : [])],
    { 'data-phase': phase, 'aria-pressed': 'false', 'aria-label': 'Drone', style: '--cd:.6', ...(overflow ? { 'data-dock-overflow': '' } : {}) },
    disabled ? ['disabled'] : [], '12s');
  const smoke = tile(['cot-auxiliary', ...(cooling ? ['cooling'] : [])], { title: 'Smoke', ...(overflow ? { 'data-dock-overflow': '' } : {}) }, [], '12s');
  const row = element('div', { classes: ['cot-vehicle-controls'] }, [
    tile(['cot-jump', 'on']), tile(['cot-special', 'show']), drone, tile(['cot-auxiliary'], { hidden: '' }), smoke,
    tile(['cot-auxiliary']), tile(['cot-auxiliary']), element('button', { classes: ['cot-dock-more'], attrs: { type: 'button', hidden: '' } }),
  ]);
  return { row, drone, smoke };
}
function buildPage(context, rowState) {
  const { row, drone, smoke } = buildRow(rowState);
  const body = element('body', { classes: context.bodyClasses, attrs: context.bodyAttrs }, [
    element('div', { classes: ['cot-hud'] }, [element('canvas', { classes: ['cot-ret'] }), row]),
  ]);
  const html = element('html', { attrs: { lang: 'en-US', 'data-flight': '' } }, [element('head'), body]);
  void html;
  return { drone, smoke };
}
const rules = sheets.flatMap((sheet) => parseSheet(sheet.text, sheet.name));
function resolve(node, property, env) {
  const names = LONGHANDS[property];
  const hits = [];
  for (const rule of rules) {
    if (!rule.media.every((query) => mediaMatches(query, env))) continue;
    unsupported = null;
    const ok = matches(node, rule.parsed);
    assert.equal(unsupported, null, `selector "${rule.selector}" (${rule.sheet}) needs ${unsupported}; teach this receipt`);
    if (!ok) continue;
    for (const declaration of rule.declarations) {
      if (names.includes(declaration.property)) hits.push({ ...declaration, rule, specificity: specificity(rule.parsed) });
    }
  }
  hits.sort((a, b) => (a.important - b.important) || layerRank(a) - layerRank(b) || compareSpecificity(a.specificity, b.specificity) || a.rule.order - b.rule.order);
  return hits;
}
/** Cascade layers (CSS Cascade 5): a later layer wins normal declarations, an earlier one wins !important; unlayered beats every layer when normal and loses to every layer when important. */
function layerRank(hit) {
  const index = hit.rule.layer === null ? STYLE_LAYERS.length : STYLE_LAYERS.indexOf(hit.rule.layer);
  return hit.important ? -index : index;
}
const RETURNING = /\[data-phase=returning\]/;
const label = (hit) => hit ? `(${hit.specificity.join(',')})${hit.important ? '!' : ''}${hit.rule.layer ? ` @${hit.rule.layer}` : ''} ${hit.rule.sheet}: ${hit.rule.selector} { ${hit.property}: ${hit.value} }` : 'none (inherited/initial)';
/** The returning rule wins, and outranks every other declaration of the property by importance, layer and specificity. */
function assertReturningWins(hits, what) {
  const winner = hits.at(-1);
  assert.ok(winner && RETURNING.test(winner.rule.selector), `${what}: the returning cue wins (winner ${label(winner)})`);
  for (const other of hits) {
    if (RETURNING.test(other.rule.selector)) continue;
    assert.ok(winner.important > other.important || (winner.important === other.important && layerRank(winner) > layerRank(other))
      || (winner.important === other.important && layerRank(winner) === layerRank(other) && compareSpecificity(winner.specificity, other.specificity) > 0),
      `${what}: the returning cue outranks ${label(other)} by layer or specificity, not by source order`);
  }
  return winner;
}

const contexts = [
  { name: 'desktop strip', env: { pointer: 'fine', width: 1920, height: 1080, reducedMotion: false }, bodyClasses: [],
    bodyAttrs: { 'data-cot-battle-layout': '', 'data-cot-width': 'wide', 'data-cot-height': 'tall', 'data-cot-orientation': 'landscape' } },
  { name: 'desktop strip, reduced motion', env: { pointer: 'fine', width: 1366, height: 768, reducedMotion: true }, bodyClasses: [],
    bodyAttrs: { 'data-cot-battle-layout': '', 'data-cot-width': 'wide', 'data-cot-height': 'regular', 'data-cot-orientation': 'landscape' } },
  { name: 'touch strip (no dock spot)', env: { pointer: 'coarse', width: 390, height: 844, reducedMotion: false }, bodyClasses: ['cot-touch-layout'],
    bodyAttrs: { 'data-cot-battle-layout': '', 'data-cot-width': 'phone', 'data-cot-height': 'tall', 'data-cot-orientation': 'portrait' } },
  { name: 'touch dock, 390 x 844', dock: true, env: { pointer: 'coarse', width: 390, height: 844, reducedMotion: false }, bodyClasses: ['cot-touch-layout'],
    bodyAttrs: { 'data-cot-battle-layout': '', 'data-cot-width': 'phone', 'data-cot-height': 'tall', 'data-cot-orientation': 'portrait', 'data-hud-dock': '' } },
  { name: 'touch dock, 844 x 390', dock: true, env: { pointer: 'coarse', width: 844, height: 390, reducedMotion: false }, bodyClasses: ['cot-touch-layout'],
    bodyAttrs: { 'data-cot-battle-layout': '', 'data-cot-width': 'phone', 'data-cot-height': 'short', 'data-cot-orientation': 'landscape', 'data-hud-dock': '' } },
  { name: 'touch dock, behind More, panel open', dock: true, overflow: true, env: { pointer: 'coarse', width: 320, height: 568, reducedMotion: false }, bodyClasses: ['cot-touch-layout'],
    bodyAttrs: { 'data-cot-battle-layout': '', 'data-cot-width': 'phone', 'data-cot-height': 'regular', 'data-cot-orientation': 'portrait', 'data-hud-dock': '', 'data-hud-dock-open': '' } },
  { name: 'touch dock, reduced motion', dock: true, env: { pointer: 'coarse', width: 360, height: 640, reducedMotion: true }, bodyClasses: ['cot-touch-layout'],
    bodyAttrs: { 'data-cot-battle-layout': '', 'data-cot-width': 'phone', 'data-cot-height': 'regular', 'data-cot-orientation': 'portrait', 'data-hud-dock': '' } },
];
const table = [];
let dockCompetitors = 0;
for (const context of contexts) {
  // While returning the authority keeps the relaunch countdown running (cooling) and refuses a press (disabled).
  const { drone, smoke } = buildPage(context, { phase: 'returning', cooling: true, disabled: true, overflow: !!context.overflow });
  const si = drone.children[0], svg = si.children[0];
  const smokeSi = smoke.children[0];
  const props = ['color', 'box-shadow', 'opacity', ...(context.dock ? ['border-bottom-color'] : [])];
  const button = {};
  for (const property of props) {
    const hits = resolve(drone, property, context.env);
    if (context.dock) dockCompetitors += hits.filter((hit) => !RETURNING.test(hit.rule.selector) && hit.rule.selector.includes('data-hud-dock')).length;
    button[property] = assertReturningWins(hits, `${context.name}: the tile's ${property}`).value;
    table.push(`${context.name.padEnd(36)} button ${property.padEnd(19)} <- ${label(hits.at(-1))}`);
  }
  // The icon: full strength (no cooling dim reaches it), the row's amber by inheritance, settling onto the pad.
  const iconOpacity = resolve(si, 'opacity', context.env);
  if (iconOpacity.length) assertReturningWins(iconOpacity, `${context.name}: the icon's opacity`);
  assert.ok(!iconOpacity.length || iconOpacity.at(-1).value === '1', `${context.name}: the icon keeps full strength`);
  table.push(`${context.name.padEnd(36)} .si    opacity             <- ${label(iconOpacity.at(-1))}`);
  for (const node of [si, svg]) {
    const colour = resolve(node, 'color', context.env);
    assert.ok(!colour.length || RETURNING.test(colour.at(-1).rule.selector), `${context.name}: nothing recolours the icon away from the cue (${label(colour.at(-1))})`);
  }
  const animation = resolve(svg, 'animation-name', context.env);
  const motion = assertReturningWins(animation, `${context.name}: the icon's animation`);
  assert.equal(motion.value.split(/\s+/)[0], context.env.reducedMotion ? 'none' : 'drone-homing', `${context.name}: the drone settles onto the pad${context.env.reducedMotion ? ' (still, reduced motion)' : ''}`);
  table.push(`${context.name.padEnd(36)} svg    animation           <- ${label(animation.at(-1))}`);
  assert.equal(button.opacity, '1', `${context.name}: the tile keeps full strength`);
  assert.match(button.color, /^#ffdc94$/i, `${context.name}: amber`);
  // Distinct from a plain cooling control on the same row: another colour and, on the dock, an undimmed icon.
  const plain = resolve(smoke, 'color', context.env).at(-1);
  assert.notEqual(plain?.value, button.color, `${context.name}: a cooling smoke tile is not amber like the returning drone`);
  if (context.dock) {
    assert.equal(button['border-bottom-color'], '#efb84e', `${context.name}: an amber bottom edge (the shade cannot cover the border)`);
    assert.match(button['box-shadow'], /rgba\(239,184,78/, `${context.name}: an amber ring and glow`);
    assert.equal(resolve(smokeSi, 'opacity', context.env).at(-1)?.value, '.5', `${context.name}: a plain cooling tile's icon is dimmed, the returning one is not`);
  } else {
    assert.match(button['box-shadow'], /^inset 0 -2px #efb84e99$/, `${context.name}: the strip keeps its amber underline`);
  }
}
assert.ok(dockCompetitors >= 4, `the dock's own tile rules were matched and outranked (${dockCompetitors})`);
// Ready, launched and cooldown tiles never pick up the cue.
for (const phase of ['ready', 'locked', 'flying', 'cooldown']) {
  const { drone } = buildPage(contexts[3], { phase, cooling: phase === 'cooldown', disabled: phase !== 'ready' && phase !== 'flying' });
  for (const property of ['color', 'box-shadow', 'opacity', 'border-bottom-color']) {
    assert.ok(!resolve(drone, property, contexts[3].env).some((hit) => RETURNING.test(hit.rule.selector)), `${phase}: no returning cue`);
  }
}
console.log(`droneReturningCascade: the Returning cue wins ${contexts.length} contexts (desktop, touch strip, dock incl. an open More panel and reduced motion) over ${rules.length} rules from ${sheets.length} sheets${liveDock ? '' : ' (dock rules pinned from item/hud-actions-mobile 2600fa32f)'}\n  ${table.join('\n  ')}`);
