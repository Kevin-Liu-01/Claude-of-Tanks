#!/usr/bin/env node
// bundle-budget.mjs — static, host-independent bundle budget (frontend audit FE-P5).
//
// Reads a finished dist/ (run `npm run build` first: this tool never builds) and
// measures what each page makes the browser download before its entry runs: the
// module entries, modulepreload links and stylesheets the HTML names, plus every
// chunk those modules import statically. `import()` edges are lazy and excluded.
// Each page reports raw, gzip (zlib level 6) and brotli (quality 11) bytes and its
// request count; the game page also reports its entry chunk.
//
//   node tools/bundle-budget.mjs              print the measurement
//   node tools/bundle-budget.mjs --check      fail when a page exceeds tools/bundle-budget.json
//   node tools/bundle-budget.mjs --write      rewrite the budgets at +3 % over this build
//   --dist=<dir>  measure another build output; --json  machine-readable output
//
// `npm run check:bundle` runs --check. Ratchet the budget down with --write after a
// deliberate saving; raising it is a reviewed decision, never a reflex.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { parseAst } from 'rolldown/parseAst';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET_FILE = join(ROOT, 'tools', 'bundle-budget.json');
const HEADROOM = 0.03;

/** Budgeted pages: the playable game, the public pages and the Chinese game document. */
export const BUNDLE_PAGES = Object.freeze({
  game: 'index.html',
  home: 'home.html',
  docs: 'docs.html',
  gallery: 'gallery.html',
  notFound: '404.html',
  cn: 'cn/index.html',
});

const TOTAL_METRICS = Object.freeze(['requests', 'raw', 'gzip', 'brotli']);
// Only the game documents start with an application entry chunk; a public page's first module script is
// whichever shared chunk Rolldown lists first, too small and arbitrary to budget on its own.
const ENTRY_BUDGET_PAGES = new Set(['game', 'cn']);

/** The metrics budgeted for one page. */
export function budgetMetrics(name) {
  return ENTRY_BUDGET_PAGES.has(name) ? [...TOTAL_METRICS, 'entryRaw', 'entryBrotli'] : TOTAL_METRICS;
}

function tagAttributes(tag) {
  const attributes = {};
  for (const match of tag.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g)) {
    const name = match[1].toLowerCase();
    if (name === 'script' || name === 'link') continue;
    const raw = match[2] ?? '';
    attributes[name] = raw.replace(/^["']|["']$/g, '');
  }
  return attributes;
}

/** The bundle files one HTML document requests up front, as dist-relative paths. */
export function htmlResources(html) {
  const local = (url) => {
    const path = String(url || '').split(/[?#]/, 1)[0];
    return path.startsWith('/assets/') ? path.slice(1) : null;
  };
  const entries = [];
  const preloads = [];
  const stylesheets = [];
  const source = String(html).replace(/<!--[\s\S]*?-->/g, '');
  for (const [tag] of source.matchAll(/<script\b[^>]*>/gi)) {
    const attributes = tagAttributes(tag);
    const file = attributes.type === 'module' ? local(attributes.src) : null;
    if (file) entries.push(file);
  }
  for (const [tag] of source.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = tagAttributes(tag);
    const rel = String(attributes.rel || '').toLowerCase().split(/\s+/);
    const file = local(attributes.href);
    if (!file) continue;
    if (rel.includes('modulepreload')) preloads.push(file);
    else if (rel.includes('stylesheet')) stylesheets.push(file);
  }
  return { entries, preloads, stylesheets };
}

/** Relative specifiers of the static `import`/`export … from` statements of one built chunk. */
export function staticImportSpecifiers(code, file = 'chunk.js') {
  const program = parseAst(String(code), { lang: 'js' }, file);
  const specifiers = [];
  for (const node of program.body) {
    const isEdge = node.type === 'ImportDeclaration'
      || ((node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') && node.source);
    const value = isEdge ? node.source?.value : null;
    if (typeof value === 'string' && (value.startsWith('./') || value.startsWith('../'))) specifiers.push(value);
  }
  return specifiers;
}

function createFileCache(distDir) {
  const cache = new Map();
  return (file) => {
    let entry = cache.get(file);
    if (entry) return entry;
    const path = join(distDir, file);
    if (!existsSync(path)) throw new Error(`bundle-budget: ${file} is referenced but missing from ${distDir}`);
    const bytes = readFileSync(path);
    let compressed = null;
    entry = {
      bytes,
      get compressed() {
        compressed ??= {
          gzip: gzipSync(bytes, { level: 6 }).length,
          brotli: brotliCompressSync(bytes, { params: {
            [constants.BROTLI_PARAM_QUALITY]: 11,
            [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
          } }).length,
        };
        return compressed;
      },
      imports: null,
    };
    cache.set(file, entry);
    return entry;
  };
}

/** One page's up-front download set (JS static closure + stylesheets) and its byte totals. */
export function measurePage(distDir, page, fileCache = createFileCache(distDir)) {
  const htmlPath = join(distDir, page);
  if (!existsSync(htmlPath)) throw new Error(`bundle-budget: ${page} is missing from ${distDir}; run npm run build first`);
  const { entries, preloads, stylesheets } = htmlResources(readFileSync(htmlPath, 'utf8'));
  if (!entries.length) throw new Error(`bundle-budget: ${page} names no module entry`);
  const scripts = new Set();
  const queue = [...entries, ...preloads];
  while (queue.length) {
    const file = queue.shift();
    if (scripts.has(file)) continue;
    scripts.add(file);
    const entry = fileCache(file);
    entry.imports ??= staticImportSpecifiers(entry.bytes.toString('utf8'), file)
      .map((specifier) => posix.normalize(posix.join(posix.dirname(file), specifier)));
    queue.push(...entry.imports);
  }
  const styles = [...new Set(stylesheets)];
  const totals = { raw: 0, gzip: 0, brotli: 0 };
  for (const file of [...scripts, ...styles]) {
    const entry = fileCache(file);
    totals.raw += entry.bytes.length;
    totals.gzip += entry.compressed.gzip;
    totals.brotli += entry.compressed.brotli;
  }
  const entryFile = fileCache(entries[0]);
  return {
    page,
    entry: entries[0],
    scripts: [...scripts].sort(),
    stylesheets: styles,
    preloadLinks: preloads.length,
    requests: scripts.size + styles.length,
    ...totals,
    entryRaw: entryFile.bytes.length,
    entryBrotli: entryFile.compressed.brotli,
  };
}

/** Measure every budgeted page of one dist directory, sharing per-file work. */
export function measureDist(distDir, pages = BUNDLE_PAGES) {
  const fileCache = createFileCache(distDir);
  return Object.fromEntries(Object.entries(pages).map(([name, page]) => [name, measurePage(distDir, page, fileCache)]));
}

/** Budgets a fixed headroom above a measurement (rounded up; requests stay whole). */
export function budgetsFrom(measures, headroom = HEADROOM) {
  return Object.fromEntries(Object.entries(measures).map(([name, measure]) => [name,
    Object.fromEntries(budgetMetrics(name).map((metric) => [metric, Math.ceil(measure[metric] * (1 + headroom))]))]));
}

/** Every metric above its budget, plus pages measured without one. Empty means within budget. */
export function budgetViolations(measures, budgets) {
  const violations = [];
  for (const [name, measure] of Object.entries(measures)) {
    const budget = budgets?.[name];
    if (!budget) {
      violations.push(`${name}: no budget recorded (run node tools/bundle-budget.mjs --write after a reviewed build)`);
      continue;
    }
    for (const metric of budgetMetrics(name)) {
      if (!Number.isFinite(budget[metric])) violations.push(`${name}.${metric}: budget missing`);
      else if (measure[metric] > budget[metric]) {
        violations.push(`${name}.${metric}: ${measure[metric]} exceeds the budget ${budget[metric]} by ${measure[metric] - budget[metric]}`);
      }
    }
  }
  return violations;
}

function formatBytes(value) {
  return value.toLocaleString('en-US');
}

function printTable(measures) {
  const rows = [['page', 'requests', 'raw', 'gzip', 'brotli-11', 'entry raw', 'entry br-11']];
  for (const [name, m] of Object.entries(measures)) {
    rows.push([`${name} (${m.page})`, String(m.requests), formatBytes(m.raw), formatBytes(m.gzip), formatBytes(m.brotli),
      formatBytes(m.entryRaw), formatBytes(m.entryBrotli)]);
  }
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  for (const row of rows) console.log(row.map((cell, column) => column ? cell.padStart(widths[column]) : cell.padEnd(widths[column])).join('  '));
}

function main(argv) {
  const distArg = argv.find((arg) => arg.startsWith('--dist='));
  const distDir = resolve(ROOT, distArg ? distArg.slice('--dist='.length) : 'dist');
  const measures = measureDist(distDir);
  if (argv.includes('--json')) console.log(JSON.stringify(measures, null, 2));
  else printTable(measures);
  if (argv.includes('--write')) {
    const record = {
      note: 'Static bundle budget (tools/bundle-budget.mjs): the bytes and requests each page loads before its entry runs. '
        + `Generated at +${Math.round(HEADROOM * 100)} % over a reviewed build; npm run check:bundle enforces it after npm run build.`,
      headroom: HEADROOM,
      pages: budgetsFrom(measures),
    };
    writeFileSync(BUDGET_FILE, `${JSON.stringify(record, null, 2)}\n`);
    console.log(`bundle-budget: wrote ${posix.relative(ROOT, BUDGET_FILE)}`);
  }
  if (argv.includes('--check')) {
    const budgets = JSON.parse(readFileSync(BUDGET_FILE, 'utf8')).pages;
    const violations = budgetViolations(measures, budgets);
    if (violations.length) {
      console.error(`bundle-budget: FAIL (${violations.length})\n  - ${violations.join('\n  - ')}`);
      process.exitCode = 1;
      return;
    }
    console.log(`bundle-budget: PASS — ${Object.keys(measures).length} pages within tools/bundle-budget.json`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2));
