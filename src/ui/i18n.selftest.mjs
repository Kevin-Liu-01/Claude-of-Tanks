#!/usr/bin/env node
// i18n.selftest.mjs — Node-runnable integrity check for the i18n catalog.
//
// Validates that:
//   - both locale tables share identical key sets
//   - every translation is a non-empty string
//   - placeholder references in templates are valid identifiers
//   - sampled keys diverge between locales (catches accidental copy-paste)
//   - placeholders that appear in English appear in the Chinese peer
//
// Registered through tools/selftest-suites.mjs and run by `npm test`.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const REPO = path.resolve(HERE, '..', '..');

// JSON is the source format consumed by both the runtime and General
// Translation. The integrity gate deliberately parses the shipping files.
const LOCALE_FILES = {
  enUS: path.join(HERE, 'i18nCatalog.en-US.json'),
  zhCN: path.join(HERE, 'i18nCatalog.zh-CN.json'),
};

function readLocale(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(Object.getPrototypeOf(parsed), Object.prototype, `${file}: catalog must be an object`);
  return new Map(Object.entries(parsed));
}

const en = readLocale(LOCALE_FILES.enUS);
const zh = readLocale(LOCALE_FILES.zhCN);

if (en.size !== zh.size) {
  const diff = [];
  for (const k of en.keys()) if (!zh.has(k)) diff.push('en-only:' + k);
  for (const k of zh.keys()) if (!en.has(k)) diff.push('zh-only:' + k);
  console.error('key diff:', diff.join('\n'));
}
assert.equal(en.size, zh.size, 'en-US has ' + en.size + ' keys, zh-CN has ' + zh.size + ' keys');
assert.ok(en.size > 0, 'catalog is empty');

const enKeys = new Set(en.keys());
const zhKeys = new Set(zh.keys());

for (const key of enKeys) {
  assert.ok(zhKeys.has(key), 'zh-CN missing key: ' + key);
}
for (const key of zhKeys) {
  assert.ok(enKeys.has(key), 'en-US missing key: ' + key);
}

const placeholderRegex = /\{(\w+)\}/g;

function checkPlaceholders(table, label) {
  for (const [key, value] of table) {
    assert.equal(typeof value, 'string', label + ' ' + key + ': not a string');
    assert.ok(value.length > 0, label + ' ' + key + ': empty translation');
    let match;
    const seen = new Set();
    placeholderRegex.lastIndex = 0;
    while ((match = placeholderRegex.exec(value))) seen.add(match[1]);
    for (const ph of seen) {
      assert.ok(/^[a-zA-Z][a-zA-Z0-9_]*$/.test(ph),
        label + ' ' + key + ': bad placeholder {' + ph + '}');
    }
  }
}

checkPlaceholders(en, 'en-US');
checkPlaceholders(zh, 'zh-CN');

// Sample check: a handful of high-traffic keys must produce a non-empty string
// in BOTH locales and the fallback behaviour must return a string.
const SAMPLE_KEYS = [
  'garage.battle',
  'settings.title',
  'hud.battleBeginsIn',
  'endScreen.victory',
  'boot.tip.angling.heading',
];
for (const k of SAMPLE_KEYS) {
  assert.ok(en.has(k), 'sample key missing from en-US: ' + k);
  assert.ok(zh.has(k), 'sample key missing from zh-CN: ' + k);
  assert.notEqual(en.get(k), zh.get(k),
    'translation is identical for ' + k + ' (likely a copy-paste oversight)');
}

// Placeholder smoke test: every translation that mentions {n} or {rating}
// must include the same key in its English peer (cross-locale consistency).
for (const [key, value] of en) {
  const matches = value.match(placeholderRegex);
  if (!matches) continue;
  const peer = zh.get(key);
  assert.ok(peer, 'zh-CN missing key ' + key + ' (placeholder sync check)');
  for (const ph of matches) {
    assert.ok(peer.includes(ph),
      'placeholder ' + ph + ' in en-US:' + key + ' missing from zh-CN peer');
  }
}

// HTML tag parity check: if en-US value embeds any inline tags (e.g. <b>,
// <span>, <a href>), the zh-CN value must embed the SAME tag set (order may
// differ because of Chinese reordering, but every opening/closing tag in en
// must also appear in zh). Catches translations that drop an opening or
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
for (const [key, enVal] of en) {
  const zhVal = zh.get(key);
  if (!zhVal) continue;
  const enTags = tagMultiset(enVal);
  const zhTags = tagMultiset(zhVal);
  const missing = [];
  for (const [tag, n] of enTags) {
    if ((zhTags.get(tag) || 0) < n) missing.push('<' + tag + '>×' + n);
  }
  const extra = [];
  for (const [tag, n] of zhTags) {
    if ((enTags.get(tag) || 0) < n) extra.push('<' + tag + '>×' + n);
  }
  assert.ok(missing.length === 0 && extra.length === 0,
    'HTML tag mismatch at ' + key +
    ' | missing in zh: [' + missing.join(', ') + ']' +
    ' | extra in zh: [' + extra.join(', ') + ']');
}

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
const homeSource = fs.readFileSync(path.join(REPO, 'home.html'), 'utf8');
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

// The map roster changes independently of the Garage. Keep every registered
// battlefield name localized so newly merged maps cannot display raw map.*
// identifiers in the selector.
const mapCatalogSource = fs.readFileSync(path.join(REPO, 'src/world/maps/catalog.ts'), 'utf8');
const mapIdsBlock = mapCatalogSource.match(/export const MAP_IDS = Object\.freeze\(\[([\s\S]*?)\]\s+as const\);/);
assert.ok(mapIdsBlock, 'src/world/maps/catalog.ts: unable to read MAP_IDS');
const mapIds = [...mapIdsBlock[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
assert.ok(mapIds.length > 0, 'src/world/maps/catalog.ts: MAP_IDS is empty');
for (const id of mapIds) {
  assert.ok(en.has(`map.${id}`), `en-US missing registered battlefield map.${id}`);
  assert.ok(zh.has(`map.${id}`), `zh-CN missing registered battlefield map.${id}`);
}

console.log('i18n.selftest.mjs: ' + en.size + ' keys verified across en-US and zh-CN');
