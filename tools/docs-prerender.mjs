#!/usr/bin/env node
// docs-prerender.mjs — writes every Field Manual chapter's markup into its page at build time (brand-ui SPEC 12.4:
// prerendered topics in both locales, no client-only "Loading technical manual…" stub; the nav lane measured CLS 0.95
// when the chapter appeared after the first paint). Copyright © 2026 Kevin B. Liu.
//
// The markup is src/docs/topics.ts's topicPageMarkup(), with its icons filled (docsIcons.ts fillDocsIcons):
//   - English goes into site/docs-<topic>.html, as <main id="topicRoot" data-prerendered=… data-prerendered-locale=…>;
//   - Chinese goes into src/docs/topicPrerender.zh-CN.json, which src/presentation/localizedHtml.ts puts in the /cn
//     page (the build's generate-localized-pages step and the dev server's /cn routes);
//   - the search index per locale goes into src/docs/searchIndex.<locale>.json (src/docs/searchIndex.ts builds it).
// The data-built chapters (src/docs/chapters) run here only: no page imports their builders.
// topics.ts keeps the markup it finds and only wires the behaviour. Run `node tools/public-shell.mjs --write` after a
// write: the shell inlines the symbols the chapter's icons reference.
//
//   node tools/docs-prerender.mjs           check (exit 1 when a page or the zh fragments are stale; topics.selftest runs it)
//   node tools/docs-prerender.mjs --write   rewrite them
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { heroLqip } from './hero-lqip.mjs';

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
  const { TOPIC_GROUPS, TOPIC_ORDER, topicHeroLadder, topicPageMarkup, topics, setTopicHeroLqips } = await import('../src/docs/topics.ts');
  // each banner's inline preview (tools/hero-lqip.mjs: throws on a missing or stale one)
  setTopicHeroLqips(Object.fromEntries(Object.values(topics).map(({ hero }) => topicHeroLadder(hero)?.poster ?? hero)
    .map((path) => [path, heroLqip(path)])));
  const { t } = await import('../src/ui/i18n.ts');
  const { richSections } = await import('../src/docs/chapters/index.ts');
  const { manualRecords } = await import('../src/docs/searchIndex.ts');
  const { fillDocsIcons } = await import('../src/docs/docsIcons.ts');
  // exit only once the pipe has taken the whole payload (an early exit cuts a piped stdout at 64 KB)
  const pages = Object.fromEntries(TOPIC_ORDER.map((slug) => [slug, fillDocsIcons(topicPageMarkup(slug, false, richSections(slug)))]));
  const groups = TOPIC_GROUPS.map(({ key, icon, topics }) => ({ key, icon, topics, label: t(`docs.group.${key}`) }));
  process.stdout.write(JSON.stringify({ pages, index: manualRecords(), groups }), () => process.exit(0));
  await new Promise(() => {});
}

const render = (locale) => JSON.parse(execFileSync(process.execPath, ['--max-old-space-size=2048', SELF, `--emit=${locale}`],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

// The index's banner (its LCP picture) and its chapter cards carry their inline previews on their boxes
// (tools/hero-lqip.mjs, docs.css), as each chapter's banner does: a picture fades in over its preview once decoded.
const INDEX_BANNER = /<header class="docs-hero docs-hero--visual"(?: style="[^"]*")?>(\s*<img src="([^"]+)")/;
const CARD_MEDIA = /<span class="docs-chapter-media" data-reveal(?: style="[^"]*")?><img src="([^"]+)"/g;
function indexPreviews(html) {
  const banner = INDEX_BANNER.exec(html);
  if (!banner) throw new Error('docs-prerender: site/docs.html has no banner picture');
  return html.replace(INDEX_BANNER, (_, img, src) => `<header class="docs-hero docs-hero--visual" style="--docs-hero-lqip:url(&quot;${heroLqip(src)}&quot;)">${img}`)
    .replace(CARD_MEDIA, (_, src) => `<span class="docs-chapter-media" data-reveal style="--card-lqip:url(&quot;${heroLqip(src)}&quot;)"><img src="${src}"`);
}

// The manual's index is the chapter map: site/docs.html's <!--docs:map--> region holds one card per chapter (its picture,
// title and lede; tools/add-chapter writes a new chapter's card there) and this step shelves them as TOPIC_GROUPS does.
const MAP = /<!--docs:map-->[\s\S]*?<!--\/docs:map-->/;
const CARD = /<a (?:class="[^"]*" )?href="\/docs\/([a-z]+)">[\s\S]*?<\/a>/g;
function chapterMap(html, groups) {
  const region = MAP.exec(html)?.[0];
  if (!region) throw new Error('docs-prerender: site/docs.html has no <!--docs:map--> region');
  const cards = new Map([...region.matchAll(CARD)].map(([card, slug]) => [slug, card]));
  // each card's number is its chapter's place in the manual, in shelf order
  const order = groups.flatMap((group) => group.topics);
  const numbered = (slug) => cards.get(slug).replace(/<b>\d+<\/b>/, `<b>${String(order.indexOf(slug) + 1).padStart(2, '0')}</b>`);
  const shelves = groups.map((group) => {
    const missing = group.topics.filter((slug) => !cards.has(slug));
    if (missing.length) throw new Error(`docs-prerender: site/docs.html has no card for ${missing.join(', ')}`);
    return `      <section class="docs-shelf" id="${group.key}" aria-labelledby="shelf-${group.key}">\n`
      + `        <h2 id="shelf-${group.key}"><span data-doc-icon="${group.icon}"></span><span data-i18n="docs.group.${group.key}">${group.label}</span></h2>\n`
      + `        <div class="docs-chapter-grid">\n${group.topics.map((slug) => `          ${numbered(slug)}`).join('\n')}\n        </div>\n      </section>`;
  });
  return html.replace(MAP, () => `<!--docs:map-->\n${shelves.join('\n')}\n    <!--/docs:map-->`);
}

/** Bring every chapter page and the zh fragments to the current markup (`write`), or list the stale ones. */
function prerender(write) {
  const { pages: en, index: enIndex, groups } = render('en-US');
  const { pages: zh, index: zhIndex } = render('zh-CN');
  const stale = [];
  // a generated file: written when it changed, or listed as stale
  const keep = (path, text) => {
    let current = '';
    try { current = readFileSync(join(ROOT, path), 'utf8'); } catch { /* first write */ }
    if (current === text) return;
    if (write) writeFileSync(join(ROOT, path), text); else stale.push(path);
  };
  for (const [slug, markup] of Object.entries(en)) {
    const path = join(ROOT, `site/docs-${slug}.html`);
    const html = readFileSync(path, 'utf8');
    if (!ROOT_ELEMENT.test(html)) throw new Error(`docs-prerender: site/docs-${slug}.html has no #topicRoot`);
    const next = html.replace(ROOT_ELEMENT, () => `<main id="topicRoot" data-prerendered="${slug}" data-prerendered-locale="en-US">${markup}</main>`);
    if (next === html) continue;
    if (write) writeFileSync(path, next); else stale.push(`site/docs-${slug}.html`);
  }
  keep('site/docs.html', indexPreviews(chapterMap(readFileSync(join(ROOT, 'site/docs.html'), 'utf8'), groups)));
  keep(ZH_FRAGMENTS, `${JSON.stringify(zh, null, 1)}\n`);
  // the search index per locale (src/docs/docsSearch.ts loads the reader's with the field's first use)
  keep('src/docs/searchIndex.en-US.json', `${JSON.stringify(enIndex, null, 1)}\n`);
  keep('src/docs/searchIndex.zh-CN.json', `${JSON.stringify(zhIndex, null, 1)}\n`);
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
