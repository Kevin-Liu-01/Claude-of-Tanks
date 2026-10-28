// The interaction census, its static half (INTERACTION-REDESIGN.md part D; owner 2026-10-26: "make map selection much
// more intituitve, as well as camo, i really mean update all legacy interaction surfaces and systems").
// Copyright © 2026 Kevin B. Liu.
//
// scanChoiceSites(root) reads every source a player meets (src/**/*.ts, site/**/*.html, index.html) and returns each
// "choose one of a set" it builds, as a mark `<kind>:<key>` per file:
// - picker: a createPicker() call (the kit's one choose-one) or a shared consumer's (createBattlefieldPicker), keyed by
//   the registry id it stamps as data-picker;
// - select: a raw <select> in markup, or one made by a call (document.createElement('select'), el('select'));
// - custom-select: a createCustomSelect() dropdown (the pre-Premiere select skin);
// - segmented: the kit's segmented control, made by its builder (segmented({ className })) and keyed by its own class,
//   or a hand-built .cot-c-seg radio group (the kit's look without the kit's builder);
// - radio-group, listbox: a hand-built radiogroup or listbox;
// - bespoke: a hand-rolled selection, where the chosen state is written by comparing each item with the current value
//   (aria-pressed/checked/selected or a .sel/.on class set from `a === b`), keyed by what it compares.
// Tabs are navigation, not a choice, and an <option> belongs to its <select>: neither is a mark. The registry
// (src/ui/interactionRegistry.ts) claims every mark through its rows; src/ui/interactionRegistry.selftest.mjs fails on a
// mark no row claims (a new bespoke choose-one) and on a row's mark the source no longer has.
//
//   node tools/interaction-census.mjs            every mark, by file
//   node tools/interaction-census.mjs --rows     the registry's rows by lane, failing first, with their marks' lines
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
/** The primitives' own homes: they define the constructs the census counts elsewhere. */
const DEFINITIONS = new Set(['src/ui/components/picker.ts', 'src/ui/components/components.ts', 'src/ui/selectPickerMenu.ts']);

/** Blank out comments, keeping every line break so line numbers hold. A `//` after a colon is a URL, not a comment. */
function stripComments(text, html = false) {
  const blank = (match) => match.replace(/[^\n]/g, ' ');
  if (html) return text.replace(/<!--[\s\S]*?-->/g, blank);
  return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:\\'"`])\/\/[^\n]*/g, (match, lead) => lead + blank(match.slice(lead.length)));
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/** The tag that opens at `index` (to its closing `>`, at most 600 characters). */
const tagAt = (text, index) => {
  const end = text.indexOf('>', index);
  return text.slice(index, end < 0 ? index + 600 : Math.min(end + 1, index + 600));
};

/** A tag's name for a mark: its id, name, own class (the kit's cot-c-* name only the primitive), data attribute or
 *  label, in that order. */
function tagKey(tag) {
  const attr = (name) => new RegExp(`\\b${name}=\\\\?["']([^"'\\\\]*)`).exec(tag)?.[1];
  const id = attr('id');
  if (id && /^[\w-]+$/.test(id)) return `#${id}`;
  const name = attr('name');
  if (name) return `[name=${name}]`;
  const classes = (attr('class') ?? '').split(/\s+/).filter((one) => /^[\w-]+$/.test(one));
  const own = classes.find((one) => !one.startsWith('cot-c-'));
  if (own) return `.${own}`;
  const data = /\b(data-(?!i18n)[\w-]+)/.exec(tag)?.[1];
  if (data) return `[${data}]`;
  const label = attr('data-i18n-aria-label') ?? attr('aria-labelledby') ?? /aria-label=\\?"\$\{t\('([\w.]+)'/.exec(tag)?.[1];
  if (label) return `~${label}`;
  return classes[0] ? `.${classes[0]}` : null;
}

/** The identifier a call on this line is assigned to (`const a = …`, `this.a = …`, `a.b = …`), or its first argument. */
function assignedTo(line, call) {
  const at = line.indexOf(call);
  const before = line.slice(0, at);
  const assigned = /(?:(?:const|let|var)\s+)?([\w$.]+)\s*=\s*(?:\[[^\]]*\]\.map\([^)]*=>\s*)?$/.exec(before.trimEnd() + ' ')?.[1]
    ?? /(?:(?:const|let|var)\s+)?([\w$.]+)\s*=[^=]/.exec(before)?.[1];
  if (assigned) return assigned.replace(/^this\./, '');
  return /^\(\s*([\w$.]+)/.exec(line.slice(at + call.length - 1))?.[1] ?? null;
}

/** What a selection compares, as its mark's key: a member expression names itself, element variable dropped
 *  (`x.dataset.mode` -> `dataset.mode`); a bare name (`id`, `index`) is too common alone, so it keeps the other side
 *  (`id===mapId`). */
function compared(expression) {
  const strip = (side) => side.trim().replace(/^[(!]+/, '').replace(/^(?:Number|String)\(/, '').replace(/\)+$/, '').replace(/\s+/g, '');
  const [leftRaw, rightRaw = ''] = expression.split(/[!=]==/);
  const left = strip(leftRaw);
  const dataset = /\.dataset\.([\w$]+)$/.exec(left);
  if (dataset) return `dataset.${dataset[1]}`;
  if (/^[\w$]+$/.test(left)) return `${left}===${strip(rightRaw).replace(/[?:].*$/, '').slice(0, 40)}`;
  return left;
}

/** A dataset key whose elements are tabs (role="tab" within the tag that writes data-<key>): navigation, not a choice. */
function datasetIsTab(text, key) {
  const dataset = /^dataset\.([\w$]+)$/.exec(key)?.[1];
  if (!dataset) return false;
  const attribute = `data-${dataset.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}=`;
  for (let at = text.indexOf(attribute); at >= 0; at = text.indexOf(attribute, at + 1)) {
    const open = text.lastIndexOf('<', at);
    if (/role=\\?["']tab["'\\]/.test(text.slice(open, text.indexOf('>', at) + 1))) return true;
  }
  return false;
}

const SELECTION_SYNC = [
  // aria state written in markup from a comparison: aria-pressed="${a === b}"
  /aria-(pressed|checked|selected)=\\?"\$\{([^}]*(?:===|!==)[^}]*)\}/g,
  // or set on an element: setAttribute('aria-pressed', String(a === b))
  /setAttribute\(\s*'aria-(pressed|checked|selected)',\s*String\(([^)]*(?:===|!==)[^)]*)\)/g,
  // a selected class toggled from a comparison: classList.toggle('sel', a === b)
  /classList\.toggle\(\s*'(sel|on|active|is-active|is-on|selected|chosen|current)',\s*([^)]*(?:===|!==)[^)]*)\)/g,
  // or through a module's own helper: press(button, a === b), setSelected(card, id === current)
  /\b(?:press|pressed|setPressed|select|setSelected|setChecked|check|markOn|setOn)\(\s*([\w$.]+)\s*,\s*((?:[^,()]|\([^()]*\))*(?:===|!==)(?:[^,()]|\([^()]*\))*)\)/g,
  // a selected class written in markup from a comparison: ${a === b ? ' sel' : ''}
  /\$\{([^}?]*(?:===|!==)[^}?]*)\?\s*'\s?(sel|on|active|is-active|is-on|selected|chosen|current)'/g,
];

/** The choose-one marks in one source (kind, key, line). */
export function scanSource(path, raw) {
  const html = path.endsWith('.html');
  const text = stripComments(raw, html);
  const lines = text.split('\n');
  const marks = [];
  const add = (kind, key, index) => marks.push({ kind, key: key ?? `@${lineOf(text, index)}`, line: lineOf(text, index) });

  // createPicker, or a shared consumer built on it (createBattlefieldPicker): keyed by the id its caller stamps. A
  // consumer's own createPicker takes its caller's id, so that call is not a site.
  // (the picker menu, components/pickerMenu.ts, is a shared consumer too: its sites are keyed by their callers' ids)
  const consumer = /export function create\w*Picker(?:Menu)?\(/.test(text);
  for (const match of text.matchAll(/\b(create\w*Picker(?:Menu)?)\(/g)) {
    if (/function\s+$/.test(text.slice(Math.max(0, match.index - 12), match.index))) continue;
    const head = text.slice(match.index, match.index + 800);
    const literal = /\bid:\s*['"`]([\w-]+)['"`]/.exec(head)?.[1];
    if (!literal && match[1] === 'createPicker' && consumer) continue;
    add('picker', literal ?? /\bid:\s*([\w$.]+)/.exec(head)?.[1], match.index);
  }
  for (const match of text.matchAll(/\bsegmented\(\s*\{/g)) {
    const head = text.slice(match.index, match.index + 600);
    const own = /\bclassName:\s*['"`]([\w-]+)/.exec(head)?.[1];
    add('segmented', own ? `.${own}` : null, match.index);
  }
  for (const match of text.matchAll(/<select\b/g)) add('select', tagKey(tagAt(text, match.index)), match.index);
  // a <select> made by a call: document.createElement('select'), or a module's own el('select', …) / node('select')
  for (const match of text.matchAll(/\b([\w$]+)\(\s*['"]select['"]\s*[,)]/g)) {
    if (/^(querySelector|querySelectorAll|closest|matches|getElementsByTagName)$/.test(match[1])) continue;
    add('select', assignedTo(lines[lineOf(text, match.index) - 1], `${match[1]}(`), match.index);
  }
  for (const match of text.matchAll(/\bcreateCustomSelect\(/g)) {
    if (/function\s+$/.test(text.slice(Math.max(0, match.index - 12), match.index))) continue;
    add('custom-select', assignedTo(lines[lineOf(text, match.index) - 1], 'createCustomSelect('), match.index);
  }
  for (const match of text.matchAll(/(\[)?role=\\?["']?(radiogroup|listbox)\b|setAttribute\(\s*'role',\s*'(radiogroup|listbox)'\)|role:\s*'(radiogroup|listbox)'/g)) {
    // a selector that finds one ('[role="listbox"]') is not one
    if (match[1]) continue;
    const role = match[2] ?? match[3] ?? match[4];
    const at = lineOf(text, match.index);
    const line = lines[at - 1];
    const open = text.lastIndexOf('<', match.index);
    const tag = open >= 0 && match.index - open < 400 && !text.slice(open, match.index).includes('>') ? tagAt(text, open) : line;
    // the kit's look built by hand: its class on the tag, or set on the element within three lines
    const seg = /cot-c-seg\b/.test(tag) || (tag === line && /cot-c-seg\b/.test(lines.slice(Math.max(0, at - 4), at + 3).join('\n')));
    const key = match[3] ? assignedTo(line, 'setAttribute(') ?? /([\w$.]+)\.setAttribute\(/.exec(line)?.[1] : tagKey(tag);
    add(role === 'listbox' ? 'listbox' : seg ? 'segmented' : 'radio-group', key, match.index);
  }
  const syncKeys = new Set();
  for (const pattern of SELECTION_SYNC) {
    for (const match of text.matchAll(pattern)) {
      const at = lineOf(text, match.index);
      const window = lines.slice(Math.max(0, at - 3), at + 1).join('\n');
      // a tab's selection is navigation; an <option>'s belongs to its <select>; the picker's own state is its own
      if (/role=\\?"tab"|role',\s*'tab'|cot-c-tabs__tab|<option\b/.test(window)) continue;
      const pressed = pattern === SELECTION_SYNC[4] ? match[1] : match[2];
      const key = compared(pressed);
      if (syncKeys.has(key) || datasetIsTab(text, key)) continue;
      syncKeys.add(key);
      add('bespoke', key, match.index);
    }
  }
  // one mark a key: a second <select data-arrange> is the same site's next field
  const seen = new Set();
  // the same, through a name: const on = a === b; ... setAttribute('aria-pressed', String(on)) / classList.toggle('on', on)
  for (const match of text.matchAll(/setAttribute\(\s*'aria-(pressed|checked|selected)',\s*String\(\s*([\w$]+)\s*\)\)|classList\.toggle\(\s*'(sel|on|active|is-active|is-on|selected|chosen|current)',\s*([\w$]+)\s*\)/g)) {
    const at = lineOf(text, match.index);
    const name = match[2] ?? match[4];
    const before = lines.slice(Math.max(0, at - 4), at).join('\n');
    const assigned = new RegExp(`\\b(?:const|let)\\s+${name.replace(/\$/g, '\\$')}\\s*=\\s*([^;\\n]*(?:===|!==)[^;\\n]*)`).exec(before)?.[1];
    if (!assigned) continue;
    const window = lines.slice(Math.max(0, at - 4), at + 1).join('\n');
    if (/role=\\?"tab"|role',\s*'tab'|cot-c-tabs__tab|<option\b/.test(window)) continue;
    const key = compared(assigned);
    if (syncKeys.has(key) || datasetIsTab(text, key)) continue;
    syncKeys.add(key);
    add('bespoke', key, match.index);
  }
  // a markup builder handed the selected state as a comparison: facetButton(attrs, selected === code, …)
  for (const match of text.matchAll(/\b([\w$]*(?:Button|Chip|Option|Tile|Card|Swatch|Item|button|chip|option|tile|card|swatch|item))\((?:[^;()]|\([^()]*\))*?,\s*([\w$.?!]+\s*(?:===|!==)\s*[\w$.?]+)\s*[,)]/g)) {
    // new Option(label, value, false, value === current) is an <option>: it belongs to its <select>
    if (match[1] === 'Option') continue;
    const key = compared(match[2]);
    if (syncKeys.has(key) || datasetIsTab(text, key)) continue;
    syncKeys.add(key);
    add('bespoke', key, match.index);
  }
  // a selected class moved by hand: previous.classList.remove('sel') … next.classList.add('sel')
  for (const match of text.matchAll(/([\w$.]+)(?:\.get\([^)]*\))?\??\.classList\.add\(\s*'(sel|on|active|is-on|is-sel|selected|chosen|current)'\s*\)/g)) {
    const at = lineOf(text, match.index);
    const before = lines.slice(Math.max(0, at - 4), at).join('\n');
    if (!before.includes(`classList.remove('${match[2]}')`)) continue;
    const key = match[1];
    if (syncKeys.has(key)) continue;
    syncKeys.add(key);
    add('bespoke', key, match.index);
  }
  return marks.sort((a, b) => a.line - b.line).filter((mark) => {
    const id = `${mark.kind}:${mark.key}`;
    return !seen.has(id) && seen.add(id);
  });
}

/** Every source the census reads, repo-relative. */
function censusSources(root = ROOT) {
  const files = [];
  const walk = (dir, test) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path, test);
      else if (test(name)) files.push(relative(root, path));
    }
  };
  walk(join(root, 'src'), (name) => /\.ts$/.test(name) && !/\.selftest\.|\.d\.ts$|\.test-support\.|\.test\.ts$/.test(name));
  walk(join(root, 'site'), (name) => name.endsWith('.html'));
  files.push('index.html');
  return files.filter((path) => !DEFINITIONS.has(path.split('\\').join('/'))).map((path) => path.split('\\').join('/')).sort();
}

/** Every choose-one mark in the checkout: [{ path, kind, key, line, mark }]. */
export function scanChoiceSites(root = ROOT) {
  const sites = [];
  for (const path of censusSources(root)) {
    for (const found of scanSource(path, readFileSync(join(root, path), 'utf8'))) {
      sites.push({ path, ...found, mark: `${found.kind}:${found.key}` });
    }
  }
  return sites;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const sites = scanChoiceSites();
  if (process.argv.includes('--rows')) {
    const { INTERACTION_SITES, sitePasses } = await import('../src/ui/interactionRegistry.ts');
    const at = new Map(sites.map((site) => [`${site.path} ${site.mark}`, site.line]));
    const rows = Object.entries(INTERACTION_SITES).sort(([, a], [, b]) => a.lane.localeCompare(b.lane) || Number(sitePasses(a)) - Number(sitePasses(b)));
    for (const [id, row] of rows) {
      const lines = row.marks.map((mark) => {
        const split = mark.indexOf(' ');
        const [owner, name] = split > 0 && /\.(ts|html)$/.test(mark.slice(0, split)) ? [mark.slice(0, split), mark.slice(split + 1)] : [row.owner, mark];
        return `${owner}:${at.get(`${owner} ${name}`) ?? '?'} ${name}`;
      }).join('; ');
      console.log(`${row.lane.padEnd(24)} ${sitePasses(row) ? 'PASS' : 'FAIL'} ${id.padEnd(28)} ${row.build.padEnd(14)} ${lines}`);
    }
  } else {
    let last = '';
    for (const site of sites) {
      if (site.path !== last) console.log(site.path);
      last = site.path;
      console.log(`  ${String(site.line).padStart(5)}  ${site.mark}`);
    }
    console.log(`${sites.length} marks in ${new Set(sites.map((site) => site.path)).size} files`);
  }
}
