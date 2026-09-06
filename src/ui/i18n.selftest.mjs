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

// The catalog is split: `i18nCatalog.ts` re-exports per-locale tables
// declared in `i18nCatalog.<locale>.ts`. The selftest inspects those
// per-locale files directly so the per-locale declaration remains the
// single source of truth (the aggregator imports them but does not
// redefine them).
const LOCALE_FILES = {
  enUS: path.join(HERE, 'i18nCatalog.en-US.ts'),
  zhCN: path.join(HERE, 'i18nCatalog.zh-CN.ts'),
};

// Crude extraction: locate each `const NAME = { ... }` table, walk braces to
// find its body, then scrape `'key': 'value'` pairs.
function extractLocale(name) {
  const source = fs.readFileSync(LOCALE_FILES[name], 'utf8');
  // Look for either `const NAME = {`, `const NAME: Type = {`, or
  // `export const NAME = {` / `export const NAME: Type = {`. The per-locale
  // catalogs now use the `export` form so they can be re-imported by the
  // aggregator.
  const declStart = source.search(new RegExp('(?:export\\s+)?const\\s+' + name + '\\b'));
  if (declStart < 0) throw new Error('locale table "' + name + '" not found in i18nCatalog.ts');
  // The declaration may carry a type annotation (e.g. `: Record<string,string>`)
  // that itself contains `{` and `}`. Find the opening `{` of the literal by
  // scanning forward while tracking generic `<...>` and `{...}` type blocks
  // so we don't latch onto a type body's brace.
  let cursor = declStart;
  // Skip past the identifier, optional type annotation, optional `=`.
  while (cursor < source.length && source[cursor] !== '{') {
    const ch = source[cursor];
    if (ch === '<') {
      // Skip generic params: balanced `<...>`.
      let depth = 1;
      cursor++;
      while (cursor < source.length && depth > 0) {
        if (source[cursor] === '<') depth++;
        else if (source[cursor] === '>') depth--;
        cursor++;
      }
    } else {
      cursor++;
    }
  }
  const braceStart = cursor;
  if (braceStart >= source.length) throw new Error('opening brace not found for locale "' + name + '"');
  // String-aware brace counter: catalog values are JS single/double-quoted
  // strings, and ICU placeholders may contain unbalanced braces inside
  // strings. Track quotes so we never count braces that live inside a string
  // literal. (Template literals are not used by the catalog.)
  let depth = 0;
  let end = braceStart;
  let quote = null;
  for (; end < source.length; end++) {
    const ch = source[end];
    if (quote !== null) {
      if (ch === '\\') { end++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error('unterminated locale table "' + name + '"');
  const body = source.slice(braceStart, end + 1);
  // First pass: collect every `'key':` declaration (catalog mixes single-line
  // and multi-line values, so we cannot assume the value lives on the same line).
  const keyRegex = /'([^']+)'\s*:/g;
  const declarations = [];
  let m;
  while ((m = keyRegex.exec(body))) {
    declarations.push({ key: m[1], index: m.index });
  }
  // Second pass: for each declaration, walk forward to the next quoted string.
  // Catalog values use either single or double quotes; both must work.
  const out = new Map();
  for (let i = 0; i < declarations.length; i++) {
    const decl = declarations[i];
    // Skip past the closing quote of the key, optional space, and colon.
    const matchLen = decl.key.length + 2 + (body[decl.index + decl.key.length + 2] === ' ' ? 1 : 0);
    let cursor = decl.index + matchLen + 1;
    while (cursor < body.length && /\s/.test(body[cursor])) cursor++;
    const quote = body[cursor];
    if (quote !== "'" && quote !== '"') {
      out.set(decl.key, '');
      continue;
    }
    cursor++;
    let value = '';
    while (cursor < body.length) {
      const ch = body[cursor];
      if (ch === '\\' && cursor + 1 < body.length) {
        value += ch + body[cursor + 1];
        cursor += 2;
        continue;
      }
      if (ch === quote) {
        cursor++;
        break;
      }
      value += ch;
      cursor++;
    }
    out.set(decl.key, value
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n'));
  }
  return out;
}

const en = extractLocale('enUS');
const zh = extractLocale('zhCN');

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

console.log('i18n.selftest.mjs: ' + en.size + ' keys verified across en-US and zh-CN');
