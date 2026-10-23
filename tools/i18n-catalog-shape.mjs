#!/usr/bin/env node
// tools/i18n-catalog-shape.mjs — the catalog-shape check (BUI-F8, SPEC 11.3 and 15).
//
// Numbers, dates and plurals go through Intl and the ICU subset src/ui/i18nDictionaries.ts formats, so the catalogs
// must be shaped for it:
//   1. every message parses: balanced braces, a known argument type (plural, select, date), a plural or select
//      with an `other` branch;
//   2. a translation uses exactly the English arguments (no dropped value, no invented one);
//   3. no ad-hoc plural pairs (`fooOne` / `fooMany`, `foo.one` / `foo.many|other`): one ICU plural message instead;
//   4. the "220 220 vehicles" duplication: a message never prints the same argument twice in a row, a static
//      `data-i18n` host's English fallback is exactly what the runtime renders (so a count printed beside the host
//      and inside its message fails), and source never prints `${n} ${t('key', { count: n })}`.
//
//   node tools/i18n-catalog-shape.mjs           report and exit 1 on any failure
//   node tools/i18n-catalog-shape.mjs --json    the failures as JSON
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = new Set(['plural', 'select', 'date']);

function closing(source, open) {
  for (let depth = 0, at = open; at < source.length; at++) {
    if (source[at] === '{') depth++;
    else if (source[at] === '}' && !--depth) return at;
  }
  return -1;
}

/**
 * Walk a message: the arguments it names (top level and inside plural/select branches; a branch body is a message,
 * never an argument) and its syntax errors. Text that is not an argument (`{{COT_*}}` tokens, a lone brace in prose)
 * is not an error: the runtime prints it as written.
 * @param {string} source
 * @returns {{ args: Set<string>, errors: string[], sequence: string[] }}
 */
export function parseMessage(source) {
  const args = new Set();
  const errors = [];
  const sequence = []; // argument names in print order with '' for non-blank text between them (duplication check)
  const walk = (text) => {
    for (let at = 0; at < text.length;) {
      if (text[at] !== '{') {
        const next = text.indexOf('{', at);
        const chunk = text.slice(at, next < 0 ? text.length : next);
        if (chunk.trim()) sequence.push('');
        at = next < 0 ? text.length : next;
        continue;
      }
      const end = closing(text, at);
      if (end < 0) { sequence.push(''); break; }
      const raw = text.slice(at, end + 1);
      const head = /^\{\s*(\w+)\s*(?:,\s*(\w+)\s*(?:,([\s\S]*))?)?\}$/.exec(raw);
      at = end + 1;
      if (!head) { sequence.push(''); continue; }
      const [, name, type, rest = ''] = head;
      args.add(name);
      sequence.push(name);
      if (!type) continue;
      if (!TYPES.has(type)) { errors.push(`{${name}, ${type}}: unknown argument type`); continue; }
      if (type !== 'plural' && type !== 'select') continue;
      const options = new Map();
      let i = 0;
      for (let m; (m = /^\s*(=?[\w-]+)\s*\{/.exec(rest.slice(i)));) {
        const open = i + m[0].length - 1;
        const close = closing(rest, open);
        if (close < 0) { errors.push(`{${name}, ${type}}: branch ${m[1]} is not closed`); break; }
        options.set(m[1], rest.slice(open + 1, close));
        i = close + 1;
      }
      if (rest.slice(i).trim()) errors.push(`{${name}, ${type}}: unreadable text after the branches ("${rest.slice(i).trim().slice(0, 24)}")`);
      if (!options.has('other')) errors.push(`{${name}, ${type}}: no "other" branch`);
      for (const body of options.values()) walk(body);
    }
  };
  walk(source);
  return { args, errors, sequence };
}

/** The argument names of a message (ICU-aware). */
export const messageArguments = (source) => parseMessage(source).args;

const AD_HOC_PLURALS = [
  [/One$/, 'Many'], [/One$/, 'Other'], [/\.one$/, '.many'], [/\.one$/, '.other'], [/Singular$/, 'Plural'],
];

/**
 * Catalog failures (rules 1-4 on the catalogs themselves).
 * @param {Record<string, string>} en
 * @param {Record<string, string>} zh
 */
export function catalogFailures(en, zh) {
  const failures = [];
  for (const [locale, table] of [['en-US', en], ['zh-CN', zh]]) {
    for (const [key, value] of Object.entries(table)) {
      const { errors, sequence } = parseMessage(value);
      for (const error of errors) failures.push(`${key} (${locale}): ${error}`);
      for (let i = 1; i < sequence.length; i++) {
        if (sequence[i] && sequence[i] === sequence[i - 1]) failures.push(`${key} (${locale}): prints {${sequence[i]}} twice in a row`);
      }
    }
  }
  for (const [key, value] of Object.entries(en)) {
    if (!Object.hasOwn(zh, key)) continue;
    const want = messageArguments(value);
    const got = messageArguments(zh[key]);
    for (const name of want) if (!got.has(name)) failures.push(`${key} (zh-CN): drops the argument {${name}}`);
    for (const name of got) if (!want.has(name)) failures.push(`${key} (zh-CN): invents the argument {${name}}`);
  }
  for (const key of Object.keys(en)) {
    for (const [pattern, other] of AD_HOC_PLURALS) {
      if (!pattern.test(key)) continue;
      const peer = key.replace(pattern, (match) => match.replace(/One|\.one|Singular/, other.replace(/^\./, '.')));
      if (peer !== key && Object.hasOwn(en, peer)) failures.push(`${key} / ${peer}: an ad-hoc plural pair; use one ICU plural message`);
    }
  }
  return failures;
}

const decodeEntities = (text) => text
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

/**
 * Static pages: each `data-i18n` host's fallback text equals the English rendering (product-stat tokens resolved),
 * and no host's message prints a value its markup prints right before it.
 * @param {string} name
 * @param {string} html
 * @param {(key: string, vars?: Record<string, string | number>) => string} render English rendering
 * @param {(text: string) => string} stats product-stat token resolver
 */
export function staticHostFailures(name, html, render, stats) {
  const failures = [];
  const hostRegex = /<([a-z][\w-]*)\b([^>]*\bdata-i18n="([^"]+)"[^>]*)>([^<]*)<\/\1>/gi;
  for (const match of html.matchAll(hostRegex)) {
    const [whole, , attrs, key, body] = match;
    let vars;
    const rawVars = /\bdata-i18n-vars=(?:'([^']*)'|"([^"]*)")/.exec(attrs);
    if (rawVars) {
      try { vars = JSON.parse(stats(decodeEntities(rawVars[1] ?? rawVars[2]))); } catch { failures.push(`${name}: ${key} has unreadable data-i18n-vars`); continue; }
    }
    const expected = stats(render(key, vars)).replace(/\s+/g, ' ').trim();
    const fallback = stats(decodeEntities(body)).replace(/\s+/g, ' ').trim();
    if (fallback !== expected) failures.push(`${name}: ${key} falls back to "${fallback}" but renders "${expected}"`);
    if (vars) {
      const before = stats(decodeEntities(html.slice(Math.max(0, match.index - 80), match.index).replace(/<[^>]*>/g, ' '))).trimEnd();
      for (const value of Object.values(vars)) {
        const text = String(value);
        if (text && before.endsWith(text) && expected.includes(text)) {
          failures.push(`${name}: ${key} prints "${text}" beside the host and again inside it ("${text} ${expected}")`);
        }
      }
    }
    void whole;
  }
  return failures;
}

/** Source: `${n} ${t('key', { count: n })}` prints a count beside a message that prints it too. */
export function sourceDuplicationFailures(file, source) {
  const failures = [];
  const pattern = /\$\{\s*([\w.]+)\s*\}\s*\$\{\s*t\(\s*['"`]([^'"`]+)['"`]\s*,\s*\{\s*count\s*:\s*\1\s*[,}]/g;
  for (const match of source.matchAll(pattern)) {
    failures.push(`${file}: prints \${${match[1]}} beside ${match[2]}, whose message prints the count too`);
  }
  return failures;
}

function walkFiles(dir, accept, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, accept, out);
    else if (accept(entry.name)) out.push(full);
  }
  return out;
}

/** Every failure across the repository's catalogs, static pages and sources. */
export async function repositoryShapeFailures() {
  const en = JSON.parse(readFileSync(join(ROOT, 'src/ui/i18nCatalog.en-US.json'), 'utf8'));
  const zh = JSON.parse(readFileSync(join(ROOT, 'src/ui/i18nCatalog.zh-CN.json'), 'utf8'));
  const { catalogText } = await import('../src/ui/i18nCatalog.ts');
  const { renderProductStats } = await import('../src/productStats.ts');
  const failures = catalogFailures(en, zh);
  const pages = [
    ...readdirSync(ROOT).filter((name) => name.endsWith('.html')).map((name) => join(ROOT, name)),
    ...walkFiles(join(ROOT, 'site'), (name) => name.endsWith('.html')),
  ];
  for (const file of pages) {
    failures.push(...staticHostFailures(relative(ROOT, file), readFileSync(file, 'utf8'),
      (key, vars) => catalogText('en-US', key, vars), renderProductStats));
  }
  for (const file of walkFiles(join(ROOT, 'src'), (name) => /\.ts$/.test(name) && !/\.selftest\./.test(name))) {
    failures.push(...sourceDuplicationFailures(relative(ROOT, file), readFileSync(file, 'utf8')));
  }
  return failures;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const failures = await repositoryShapeFailures();
  if (process.argv.includes('--json')) console.log(JSON.stringify(failures, null, 2));
  else if (failures.length) console.error(`i18n-catalog-shape: ${failures.length} failure(s)\n  ${failures.join('\n  ')}`);
  else console.log('i18n-catalog-shape: catalogs, static hosts and sources are shaped for ICU and Intl');
  if (failures.length) process.exit(1);
}
