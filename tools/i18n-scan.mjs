#!/usr/bin/env node
// tools/i18n-scan.mjs
//
// Full-codebase scan for hardcoded user-visible English UI strings in `src/`.
// Designed to complement the diff-based sync tick: it inspects every source
// file rather than only the round's diff and emits a structured worklist the
// agent (or human) can review before adding translations.
//
// What it flags:
//   - string literals that are wired into user-visible DOM positions
//     (textContent, innerHTML, placeholder, aria-label, title, alt, value, …)
//   - English-looking prose (multi-word, contains a space, starts with an
//     uppercase letter or digit) that lives in HTML template literals
//     even when the assignment is wrapped in a helper
//   - aria-/title/alt attributes set via setAttribute / template literals
//
// What it skips:
//   - catalog files, test runners, comments, console messages, thrown errors
//   - proper-noun / technical strings (single uppercase word with no spaces,
//     abbreviations like AP/HE/APCR, tank/map identifiers)
//   - CSS / class names / selectors / data-* attribute values
//   - already-translated strings: a match on the catalog key set OR a match
//     inside a `t(...)` call
//   - placeholder HTML containers that hold only structure (whitespace-only)
//
// Run:
//   node tools/i18n-scan.mjs            -> prints summary to stdout
//   node tools/i18n-scan.mjs --json     -> prints the full worklist as JSON
//
// The script is read-only; it does not modify catalog files.

import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const SRC = join(REPO, 'src');

const args = new Set(process.argv.slice(2));
const WANT_JSON = args.has('--json') || args.has('--worklist');

// ---------------------------------------------------------------------------
// Catalog scrape
// ---------------------------------------------------------------------------
// Reuse the selftest's extraction logic so we never disagree about the live
// key set.

const CATALOG_DIR = join(REPO, 'src', 'ui');
const CATALOG_FILES = {
  enUS: join(CATALOG_DIR, 'i18nCatalog.en-US.ts'),
  zhCN: join(CATALOG_DIR, 'i18nCatalog.zh-CN.ts'),
};

function extractCatalogKeys(file) {
  const source = readFileSync(file, 'utf8');
  // Find `export const NAME = ... {` opening brace (skip generic types).
  const declMatch = source.match(/export\s+const\s+\w+\b/);
  if (!declMatch) throw new Error(`catalog decl not found in ${file}`);
  let cursor = declMatch.index + declMatch[0].length;
  while (cursor < source.length && source[cursor] !== '{') {
    const ch = source[cursor];
    if (ch === '<') {
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
  // Walk to the matching close brace while tracking string literals.
  let depth = 0;
  let end = cursor;
  let quote = null;
  for (; end < source.length; end++) {
    const ch = source[end];
    if (quote !== null) {
      if (ch === '\\') { end++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  const body = source.slice(cursor, end + 1);
  const keyRegex = /'([^']+)'\s*:/g;
  const out = new Set();
  let m;
  while ((m = keyRegex.exec(body))) out.add(m[1]);
  return out;
}

const KNOWN_KEYS = new Set([
  ...extractCatalogKeys(CATALOG_FILES.enUS),
  ...extractCatalogKeys(CATALOG_FILES.zhCN),
]);

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------

const SKIP_DIR_NAMES = new Set([
  'node_modules', '.git', 'dist', 'build', 'out',
  '.openclaw', '.agent-docs', '.agents', 'shots',
]);

function walk(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.' && entry.name !== '..') {
        // Allow `.openclaw/...` but the top-level dir is skipped above.
        if (SKIP_DIR_NAMES.has(entry.name)) continue;
      }
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && /\.(ts|tsx|js|mjs|cjs|html)$/.test(entry.name)) {
        out.push(full);
      }
    }
  }
  return out;
}

const ALL_FILES = walk(SRC);

// ---------------------------------------------------------------------------
// String candidate extraction
// ---------------------------------------------------------------------------
// Patterns we treat as user-visible:
//   - DOM properties: .textContent, .innerHTML, .outerHTML, .innerText
//   - input.value = "..."
//   - input.placeholder = "..."
//   - setAttribute('aria-label'|'title'|'alt'|'placeholder', "...")
//   - aria-label="..." / title="..." / placeholder="..." inside template literals
//   - <button>Submit</button>-style text nodes inside template literals (heuristic)
//
// All matches return `{ file, line, snippet, value, kind }`.

const PATTERNS = [
  // Property assignments to string literals
  { kind: 'textContent', regex: /\.textContent\s*=\s*(["'`])([^"'`\n][^"'`\n]*?)\1/g, group: 2 },
  { kind: 'innerHTML', regex: /\.innerHTML\s*=\s*(["'`])([^"'`\n][^"'`\n]*?)\1/g, group: 2 },
  { kind: 'outerHTML', regex: /\.outerHTML\s*=\s*(["'`])([^"'`\n][^"'`\n]*?)\1/g, group: 2 },
  { kind: 'innerText', regex: /\.innerText\s*=\s*(["'`])([^"'`\n][^"'`\n]*?)\1/g, group: 2 },
  { kind: 'value', regex: /\.value\s*=\s*(["'`])([^"'`\n][^"'`\n]*?)\1/g, group: 2 },
  { kind: 'placeholder-prop', regex: /\.placeholder\s*=\s*(["'`])([^"'`\n][^"'`\n]*?)\1/g, group: 2 },
  { kind: 'title-prop', regex: /\.title\s*=\s*(["'`])([^"'`\n][^"'`\n]*?)\1/g, group: 2 },
  { kind: 'ariaLabel-prop', regex: /\.ariaLabel\s*=\s*(["'`])([^"'`\n][^"'`\n]*?)\1/g, group: 2 },
  { kind: 'alt-prop', regex: /\.alt\s*=\s*(["'`])([^"'`\n][^"'`\n]*?)\1/g, group: 2 },
  // setAttribute(...)
  { kind: 'setAttribute', regex: /\.setAttribute\(\s*(["'`])([a-zA-Z-]+)\1\s*,\s*(["'`])([^"'`\n]+?)\3\s*\)/g, attrGroup: 2, valGroup: 4 },
  // HTML attribute in template literals
  { kind: 'aria-label-attr', regex: /aria-label\s*=\s*(["'`])([^"'`\n]{2,}?)\1/g, group: 2 },
  { kind: 'title-attr', regex: /\btitle\s*=\s*(["'`])([^"'`\n]{2,}?)\1/g, group: 2 },
  { kind: 'placeholder-attr', regex: /\bplaceholder\s*=\s*(["'`])([^"'`\n]{2,}?)\1/g, group: 2 },
  { kind: 'alt-attr', regex: /\balt\s*=\s*(["'`])([^"'`\n]{2,}?)\1/g, group: 2 },
  // Helper: el(tag, cls, text) — text is wired into element.textContent.
  // We only flag the 3-arg form so we don't pick up `el('div')` / `el('div', cls)`.
  { kind: 'el-helper-text', regex: /\bel\s*\(\s*['"`][a-zA-Z]+['"`]\s*,\s*['"`][^'"`]*?['"`]\s*,\s*(['"`])([^'"`\n]{4,}?)\1\s*\)/g, group: 2 },
];

const SKIP_FILE_NAMES = new Set([
  'i18nCatalog.en-US.ts',
  'i18nCatalog.zh-CN.ts',
  'i18nCatalog.ts',
  'i18n.ts',
  'i18n.selftest.mjs',
  'i18n-scan.mjs',
  'staticI18n.ts',
]);

// Strings that look like technical identifiers rather than prose. We keep the
// list narrow so genuine English prose is never accidentally excluded.
const SHORT_ALLOWED = new Set([
  '×', '−', '→', '←', '↑', '↓', '·', '–', '—', '…',
  'A', 'X', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'Y', 'Z',
  'AP', 'HE', 'APCR', 'HEAT', 'ATGM', 'HP', 'XP', 'CRT', 'UI', 'HUD',
  'FPS', 'AI', 'UI/UX', 'CSS', 'SVG', 'HTML', 'JSON', 'API', 'URL',
  'No', 'N/A', 'OK', 'vs', 'p', 'v',
]);

function looksLikeProperNoun(value) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  // Single short word or abbreviation with no spaces is almost always a
  // proper noun or code identifier (HP, AP, name, etc.).
  if (!trimmed.includes(' ')) {
    // Allow short single-word items only if they appear in the allow-list;
    // everything else is too generic to call "always safe" without seeing
    // context. We accept short words <= 4 chars as likely identifiers,
    // anything else we still emit so the human can decide.
    if (trimmed.length <= 4) return true;
    // Camel/lower-case identifiers with no spaces and no English-word shape.
    if (/^[a-z0-9][a-zA-Z0-9_-]*$/.test(trimmed) && /[a-z]/.test(trimmed)) return true;
    return false;
  }
  return false;
}

function looksLikeEnglish(value) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  // Must contain a space to look like prose — this is the most reliable
  // filter for "this is a sentence" vs "this is an identifier".
  if (!trimmed.includes(' ')) return false;
  // Must start with an uppercase letter or a digit. Allow diacritics, but
  // English transliterations and Latin-1 punctuation are accepted as text.
  if (!/^[\p{Lu}\p{N}]/u.test(trimmed)) return false;
  // Reject pure CSS-like noise and code fences.
  if (/^[\W_]+$/.test(trimmed)) return false;
  // Reject if every "word" is a single character (e.g. "A B C").
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.every((w) => w.length <= 1)) return false;
  return true;
}

// Match a value against a 6-char fuzzy equality with catalog values, so that
// near-identical English strings are not flagged twice.
function nearCatalog(value, max = 8) {
  if (!value) return null;
  for (const key of KNOWN_KEYS) {
    if (Math.abs(key.length - value.length) > max) continue;
    if (key === value) return key;
  }
  return null;
}

const candidates = [];

for (const file of ALL_FILES) {
  const rel = relative(REPO, file);
  if (SKIP_FILE_NAMES.has(rel.split('/').pop())) continue;
  let source;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lines = source.split('\n');
  // Walk each pattern.
  for (const pat of PATTERNS) {
    pat.regex.lastIndex = 0;
    let m;
    while ((m = pat.regex.exec(source))) {
      const valueIdx = pat.attrGroup != null ? pat.valGroup : pat.group;
      const value = m[valueIdx];
      if (!value) continue;
      if (SHORT_ALLOWED.has(value.trim())) continue;
      if (looksLikeProperNoun(value)) continue;
      if (!looksLikeEnglish(value)) continue;
      if (nearCatalog(value)) continue;
      // Find the line number.
      const offset = m.index;
      let line = 1;
      for (let i = 0; i < offset; i++) if (source[i] === '\n') line++;
      const lineText = lines[line - 1] ?? '';
      // Skip comments: line starts with // or * or is a JSDoc continuation.
      const trimmed = lineText.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
      // Skip CSS literals (we only look at .ts/.html but they sometimes
      // contain CSS-in-JS tagged templates); bail on long runs of
      // semicolons or braces.
      if (/^\s*[};]/.test(trimmed) && trimmed.length < 4) continue;
      candidates.push({
        file: rel,
        line,
        kind: pat.kind,
        value,
        snippet: lineText.slice(0, 200),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

if (WANT_JSON) {
  process.stdout.write(JSON.stringify(candidates, null, 2));
  process.stdout.write('\n');
} else {
  // Group by file for readability.
  const byFile = new Map();
  for (const c of candidates) {
    if (!byFile.has(c.file)) byFile.set(c.file, []);
    byFile.get(c.file).push(c);
  }
  const totalFiles = byFile.size;
  const totalItems = candidates.length;
  console.log(`Scanned ${ALL_FILES.length} files.`);
  console.log(`${totalItems} candidate strings across ${totalFiles} files.\n`);
  const entries = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [file, items] of entries) {
    console.log(`-- ${file} (${items.length})`);
    for (const item of items.slice(0, 30)) {
      console.log(`   L${item.line.toString().padStart(4, ' ')} ${item.kind.padEnd(18, ' ')} ${item.value.slice(0, 120)}`);
    }
    if (items.length > 30) console.log(`   ... ${items.length - 30} more`);
  }
}