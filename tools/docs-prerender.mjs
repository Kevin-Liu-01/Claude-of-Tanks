#!/usr/bin/env node
// docs-prerender.mjs — writes every Field Manual chapter's markup into its page at build time (brand-ui SPEC 12.4:
// prerendered topics in both locales, no client-only "Loading technical manual…" stub; the nav lane measured CLS 0.95
// when the chapter appeared after the first paint). Copyright © 2026 Kevin B. Liu.
//
// The markup is src/docs/topics.ts's topicPageMarkup(), with its icons filled (docsIcons.ts fillDocsIcons):
//   - English goes into site/docs-<topic>.html, as <main id="topicRoot" data-prerendered=… data-prerendered-locale=…>;
//   - Chinese goes into src/docs/topicPrerender.zh-CN.json, which src/presentation/localizedHtml.ts puts in the /cn
//     page (the build's generate-localized-pages step and the dev server's /cn routes).
// topics.ts keeps the markup it finds and only wires the behaviour. Run `node tools/public-shell.mjs --write` after a
// write: the shell inlines the symbols the chapter's icons reference.
//
//   node tools/docs-prerender.mjs           check (exit 1 when a page or the zh fragments are stale; topics.selftest runs it)
//   node tools/docs-prerender.mjs --write   rewrite them
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);
export const ZH_FRAGMENTS = 'src/docs/topicPrerender.zh-CN.json';
const ROOT_ELEMENT = /<main id="topicRoot"[^>]*>[\s\S]*?<\/main>/;

const emit = process.argv.find((arg) => arg.startsWith('--emit='))?.slice('--emit='.length);
if (emit) {
  // one locale per process: topics.ts reads the catalog when it loads
  await import('../src/ui/i18nCatalog.ts');
  const { setLocale } = await import('../src/ui/i18n.ts');
  await setLocale(emit);
  const { TOPIC_ORDER, topicPageMarkup } = await import('../src/docs/topics.ts');
  const { fillDocsIcons } = await import('../src/docs/docsIcons.ts');
  // exit only once the pipe has taken the whole payload (an early exit cuts a piped stdout at 64 KB)
  process.stdout.write(JSON.stringify(Object.fromEntries(TOPIC_ORDER.map((slug) => [slug, fillDocsIcons(topicPageMarkup(slug, false))]))), () => process.exit(0));
  await new Promise(() => {});
}

const render = (locale) => JSON.parse(execFileSync(process.execPath, ['--max-old-space-size=2048', SELF, `--emit=${locale}`],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

/** Bring every chapter page and the zh fragments to the current markup (`write`), or list the stale ones. */
function prerender(write) {
  const en = render('en-US');
  const zh = render('zh-CN');
  const stale = [];
  for (const [slug, markup] of Object.entries(en)) {
    const path = join(ROOT, `site/docs-${slug}.html`);
    const html = readFileSync(path, 'utf8');
    if (!ROOT_ELEMENT.test(html)) throw new Error(`docs-prerender: site/docs-${slug}.html has no #topicRoot`);
    const next = html.replace(ROOT_ELEMENT, () => `<main id="topicRoot" data-prerendered="${slug}" data-prerendered-locale="en-US">${markup}</main>`);
    if (next === html) continue;
    if (write) writeFileSync(path, next); else stale.push(`site/docs-${slug}.html`);
  }
  const fragments = `${JSON.stringify(zh, null, 1)}\n`;
  let current = '';
  try { current = readFileSync(join(ROOT, ZH_FRAGMENTS), 'utf8'); } catch { /* first write */ }
  if (current !== fragments) {
    if (write) writeFileSync(join(ROOT, ZH_FRAGMENTS), fragments); else stale.push(ZH_FRAGMENTS);
  }
  return { chapters: Object.keys(en).length, stale };
}

/** The chapter pages and zh fragments that no longer match topics.ts (src/docs/topics.selftest.mjs). */
export const staleChapters = () => prerender(false).stale;

if (!emit && process.argv[1] === SELF) {
  const write = process.argv.includes('--write');
  const { chapters, stale } = prerender(write);
  if (stale.length) {
    console.error(`docs-prerender: stale ${stale.join(', ')} (node tools/docs-prerender.mjs --write)`);
    process.exit(1);
  }
  console.log(`docs-prerender: ${chapters} chapters ${write ? 'written' : 'current'} in en-US and zh-CN`);
}
