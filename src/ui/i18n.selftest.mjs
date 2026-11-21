#!/usr/bin/env node
// i18n.selftest.mjs — Node-runnable integrity check for the i18n catalog.
//
// Validates that:
//   - every locale table (localeRouting.ts LOCALE_RECORDS) shares the English key set
//   - every translation is a non-empty string
//   - placeholder references in templates are valid identifiers
//   - sampled keys diverge between locales (catches accidental copy-paste)
//   - placeholders that appear in English appear in every locale's peer
//
// Registered through tools/selftest-suites.mjs and run by `npm test`.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { messageArguments, parseMessage } from '../../tools/i18n-catalog-shape.mjs';
import { PREFIXED_LOCALES } from './localeRouting.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const REPO = path.resolve(HERE, '..', '..');

// JSON is the source format consumed by both the runtime and General
// Translation. The integrity gate deliberately parses the shipping files.
const localeFile = (locale) => path.join(HERE, `i18nCatalog.${locale}.json`);

function readLocale(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(Object.getPrototypeOf(parsed), Object.prototype, `${file}: catalog must be an object`);
  return new Map(Object.entries(parsed));
}

const en = readLocale(localeFile('en-US'));
assert.ok(en.size > 0, 'catalog is empty');
const enKeys = new Set(en.keys());
/** Every translated catalog, by locale. */
const translations = new Map(PREFIXED_LOCALES.map((locale) => [locale, readLocale(localeFile(locale))]));

for (const [locale, table] of translations) {
  const missing = [...enKeys].filter((key) => !table.has(key));
  const extra = [...table.keys()].filter((key) => !enKeys.has(key));
  assert.deepEqual(missing, [], `${locale} missing ${missing.length} key(s): ${missing.slice(0, 20).join(', ')}`);
  assert.deepEqual(extra, [], `${locale} has ${extra.length} key(s) en-US lacks: ${extra.slice(0, 20).join(', ')}`);
}

// Arguments are read ICU-aware (tools/i18n-catalog-shape.mjs): `{count}` and `{count, plural, one {…} other {…}}` name
// the argument `count`; a plural or select branch body is a message, never an argument.
function checkPlaceholders(table, label) {
  for (const [key, value] of table) {
    assert.equal(typeof value, 'string', label + ' ' + key + ': not a string');
    assert.ok(value.length > 0, label + ' ' + key + ': empty translation');
    const { args, errors } = parseMessage(value);
    assert.deepEqual(errors, [], label + ' ' + key + ': ICU syntax');
    for (const ph of args) {
      assert.ok(/^[a-zA-Z][a-zA-Z0-9_]*$/.test(ph),
        label + ' ' + key + ': bad placeholder {' + ph + '}');
    }
  }
}

checkPlaceholders(en, 'en-US');
for (const [locale, table] of translations) checkPlaceholders(table, locale);

// Sample check: a handful of high-traffic keys must produce a non-empty string
// in every locale, and differ from English (catches an untranslated copy).
const SAMPLE_KEYS = [
  'garage.battle',
  'settings.title',
  'hud.battleBeginsIn',
  'endScreen.victory',
  'boot.tip.angling.heading',
];
for (const k of SAMPLE_KEYS) {
  assert.ok(en.has(k), 'sample key missing from en-US: ' + k);
  for (const [locale, table] of translations) {
    assert.ok(table.has(k), `sample key missing from ${locale}: ${k}`);
    assert.notEqual(en.get(k), table.get(k), `translation is identical for ${k} in ${locale} (likely an untranslated copy)`);
  }
}

// Placeholder parity: every argument an English message names (plain or ICU) appears in each locale's peer, and a peer
// names no argument English lacks.
for (const [locale, table] of translations) {
  for (const [key, value] of en) {
    const args = messageArguments(value);
    const peerArgs = messageArguments(table.get(key) ?? '');
    for (const ph of args) {
      assert.ok(peerArgs.has(ph), `placeholder {${ph}} in en-US:${key} missing from the ${locale} peer`);
    }
    for (const ph of peerArgs) {
      assert.ok(args.has(ph), `placeholder {${ph}} in ${locale}:${key} is not in en-US`);
    }
  }
}

// HTML tag parity check: if en-US value embeds any inline tags (e.g. <b>,
// <span>, <a href>), each locale's value must embed the SAME tag set (order may
// differ because of reordering, but every opening/closing tag in en must also
// appear in the translation). Catches translations that drop an opening or
// closing tag while paraphrasing.
const tagRegex = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^<>]*?)?>/g;
function tagMultiset(value) {
  const out = new Map();
  for (const m of value.matchAll(tagRegex)) {
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    // Ignore void elements and known-safe structural tags that commonly
    // diverge between locales (e.g. <br> is split/joined by translators).
    if (['br', 'wbr'].includes(name)) continue;
    const key = closing ? '/' + name : name;
    out.set(key, (out.get(key) || 0) + 1);
  }
  return out;
}
for (const [locale, table] of translations) {
  for (const [key, enVal] of en) {
    const val = table.get(key);
    if (!val) continue;
    const enTags = tagMultiset(enVal);
    const tags = tagMultiset(val);
    const missing = [];
    for (const [tag, n] of enTags) {
      if ((tags.get(tag) || 0) < n) missing.push('<' + tag + '>×' + n);
    }
    const extra = [];
    for (const [tag, n] of tags) {
      if ((enTags.get(tag) || 0) < n) extra.push('<' + tag + '>×' + n);
    }
    assert.ok(missing.length === 0 && extra.length === 0,
      `HTML tag mismatch at ${key} (${locale}) | missing: [${missing.join(', ')}] | extra: [${extra.join(', ')}]`);
  }
}

// Attributes too (security audit 2026-10-22): a translated catalog comes back from the translation service and
// reaches innerHTML and the localized <title>, and the name-only parity above skips `<img/src=x/onerror=…>` and ignores
// attributes. Every markup `<` in a translated value must open a tag this check can read, and each such tag must repeat
// an en-US tag of the same key exactly (name and attributes; <br>/<wbr> free).
const fullTagRegex = /<\/?([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^<>]*?)?\/?>/g;
function fullTagMultiset(value) {
  const out = new Map();
  for (const m of value.matchAll(fullTagRegex)) {
    if (['br', 'wbr'].includes(m[1].toLowerCase())) continue;
    const tag = m[0].replace(/\s+/g, ' ');
    out.set(tag, (out.get(tag) || 0) + 1);
  }
  return out;
}
/** What a translated value adds over the en-US value that HTML would read as markup; empty when nothing. */
function markupProblems(enVal, val) {
  const problems = [];
  // a `<` that HTML would read as markup (a letter, `/`, `!` or `?` after it); `< 80 mm` stays text
  if (/<[a-zA-Z/!?]/.test(val.replace(fullTagRegex, ''))) problems.push('unreadable markup');
  const enTags = fullTagMultiset(enVal);
  for (const [tag, n] of fullTagMultiset(val)) {
    if ((enTags.get(tag) || 0) < n) problems.push('tag not in en-US: ' + tag);
  }
  return problems;
}
for (const [locale, table] of translations) {
  for (const [key, val] of table) {
    const problems = markupProblems(en.get(key) ?? '', val);
    assert.deepEqual(problems, [], `${locale} markup at ${key}: ${problems.join('; ')}`);
  }
}
// the four forms the name-only parity let through, and the text it must keep allowing
const docsLink = 'See <a href="/docs#studio">the Studio guide</a>.';
assert.ok(markupProblems('Made by Kevin', '作者 Kevin<img/src="x"/onerror="alert(1)">').length);
assert.ok(markupProblems(docsLink, '见 <a href="javascript:alert(1)">工作室指南</a>。').length);
assert.ok(markupProblems('Local only.', '仅本地。<img src="x" onerror="alert(1)">').length);
assert.ok(markupProblems('Claude of Tanks', '坦克</title/><img/src="x"/onerror="alert(1)">').length);
assert.deepEqual(markupProblems(docsLink, '见<a href="/docs#studio">工作室指南</a>。'), []);
assert.deepEqual(markupProblems('Armor < 80 mm', '装甲 < 80 mm'), []);
assert.deepEqual(markupProblems('One<br>two', '一<br/>二'), []);

// Plain text translation hosts must not own nested markup. textContent would
// erase links, emphasis, output values, or other controls on first apply.
const rootHtmlFiles = fs.readdirSync(REPO).filter((name) => name.endsWith('.html'));
for (const name of rootHtmlFiles) {
  const source = fs.readFileSync(path.join(REPO, name), 'utf8');
  const hostRegex = /<([a-z][\w-]*)\b([^>]*\bdata-i18n="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/gi;
  for (const match of source.matchAll(hostRegex)) {
    const [, , , key, body] = match;
    assert.ok(en.has(key), `${name}: unknown data-i18n key ${key}`);
    assert.ok(!/<[a-z][\s\S]*?>/i.test(body),
      `${name}: data-i18n=${key} owns nested markup; split children or use vetted data-i18n-html`);
  }
  const keyRegex = /\bdata-i18n(?:-html|-placeholder|-title|-alt|-aria-label|-aria)?="([^"]+)"/g;
  for (const match of source.matchAll(keyRegex)) {
    assert.ok(en.has(match[1]), `${name}: unknown static translation key ${match[1]}`);
  }
}

// The landing-page catalog used to exist without any home.html bindings,
// which made the page claim zh-CN while rendering English. Every home.* key
// must therefore be connected to a supported static-i18n attribute.
const homeSource = fs.readFileSync(path.join(REPO, 'site/home.html'), 'utf8');
const homeBindings = new Set(
  [...homeSource.matchAll(/\bdata-i18n(?:-html|-placeholder|-title|-alt|-aria-label|-aria)?="([^"]+)"/g)]
    .map((match) => match[1]),
);
for (const key of enKeys) {
  if (key.startsWith('home.')) {
    assert.ok(homeBindings.has(key), `home.html: unbound landing-page translation ${key}`);
  }
}

const garageCss = fs.readFileSync(path.join(REPO, 'src/ui/garage.css'), 'utf8');
assert.doesNotMatch(garageCss, /content\s*:\s*['"]Combat stats['"]/i,
  'garage.css: compact dossier heading must use the locale-backed CSS variable');

const gallerySource = fs.readFileSync(path.join(REPO, 'src/gallery/gallery.ts'), 'utf8');
// The Gallery's per-section help buttons left with the Premiere port (less is more, 2026-10-22); none may come back keyed
// by rendered text.
assert.doesNotMatch(gallerySource, /GALLERY_SECTION_INFO\[['"]?label/,
  'gallery contextual help must not index help content by translated display text');

const studioSource = fs.readFileSync(path.join(REPO, 'src/ui/studioPanel.ts'), 'utf8');
// (247, less is more) the Studio's help-only info panels left, as the Gallery's did; the scene file keeps its JSON panel
assert.doesNotMatch(studioSource, /studioPanel\.info\.group\./, 'no help panels on the Studio workspaces');
assert.match(studioSource, /if \(id === 'output'\) h\.appendChild\(createInfoButton\(/, 'the scene file keeps its JSON panel, by its stable id');
assert.doesNotMatch(studioSource, /STUDIO_(?:GROUP|SECTION)_INFO\[title\]/,
  'Studio contextual help must not index help content by translated display text');

// The map roster changes independently of the Garage. Keep every registered
// battlefield name localized so newly merged maps cannot display raw map.*
// identifiers in the selector.
// 2026-09-28: the identity slice (MAP_IDS and the names) lives in maps/mapIds.ts; catalog.ts re-exports it
const mapCatalogSource = fs.readFileSync(path.join(REPO, 'src/world/maps/mapIds.ts'), 'utf8');
const mapIdsBlock = mapCatalogSource.match(/export const MAP_IDS = Object\.freeze\(\[([\s\S]*?)\]\s+as const\);/);
assert.ok(mapIdsBlock, 'src/world/maps/mapIds.ts: unable to read MAP_IDS');
const mapIds = [...mapIdsBlock[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
assert.ok(mapIds.length > 0, 'src/world/maps/mapIds.ts: MAP_IDS is empty');
for (const id of mapIds) {
  assert.ok(en.has(`map.${id}`), `en-US missing registered battlefield map.${id}`);
  for (const [locale, table] of translations) assert.ok(table.has(`map.${id}`), `${locale} missing registered battlefield map.${id}`);
}

console.log(`i18n.selftest.mjs: ${en.size} keys verified across en-US and ${PREFIXED_LOCALES.join(', ')}`);

// (gauntlet 250, the coordinator's copy rule) no player-facing string in either catalog carries an em dash, typed or as an
// entity: a pause is a colon, a full stop, a comma, parentheses or the " · " separator
{
  const { readFileSync: readCatalog } = await import('node:fs');
  for (const file of ['en-US', ...PREFIXED_LOCALES].map((locale) => `i18nCatalog.${locale}.json`)) {
    const catalog = JSON.parse(readCatalog(new URL(`./${file}`, import.meta.url), 'utf8'));
    const dashed = Object.entries(catalog).filter(([, text]) => typeof text === 'string' && /—|&mdash;|&#8212;|&#x2014;/i.test(text)).map(([key]) => key);
    assert.deepEqual(dashed, [], `${file}: em dashes in ${dashed.join(', ')}`);
  }
}
