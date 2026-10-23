// media-page-unique.selftest.mjs — no still twice on one page, no source twice across the social cards (brand-ui SPEC
// 8.2, 12.3.2 "each still appears once per page"; SHOWCASE §4.10 "unique source per card", §5.7; BUI-F7).
//
// A still is one picture across its rungs (<name>, <name>-thumb, -640, -1280, -1920, -2560; a map and its card). A
// page's markup and the media its script writes (the manual's topic headers and figures) are counted per element: an
// <img> naming three rungs of one still is one use; its preload link and its social card are not uses. Community
// avatars repeat with their author and are not showcase stills. Duplicates that predate this receipt are ledgered with
// the package that removes them; a new duplicate fails, and a ledgered one that is gone fails until it is unlisted.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, pageMedia, publicPages, stillIdentity, topicPageMedia, topicSlug } from './media-page-scan.mjs';

/** The uses of each still on one page: identity -> number of elements. */
function stillUses(records) {
  const uses = new Map();
  for (const record of records) {
    if (record.tag === 'link' || record.tag === 'meta') continue;
    const ids = new Set(record.stills.filter((still) => !still.startsWith('/media/social-proof/')).map(stillIdentity));
    for (const id of ids) uses.set(id, (uses.get(id) ?? 0) + 1);
  }
  return uses;
}

// The rule on fixtures.
{
  const page = pageMedia(`<link rel="preload" as="image" href="/media/a/x.webp"><img src="/media/a/x.webp" srcset="/media/a/x-640.webp 640w, /media/a/x.webp 1920w">`
    + `<img src="/maps/cards/fjord.webp"><img data-deferred-src="/maps/fjord.webp"><img src="/media/social-proof/me.jpg"><img src="/media/social-proof/me.jpg">`);
  assert.deepEqual([...stillUses(page)], [['/media/a/x', 1], ['/maps/fjord', 2]],
    'a preload and its picture are one use; rungs are one still; a map and its card are one picture; avatars do not count');
}

/** Duplicates that predate the receipt, with the package that removes them (the count may only fall). */
const KNOWN_DUPLICATES = Object.freeze({
  'site/docs.html': {
    task: 'the Field Manual overhaul (its chapter cards and figures reuse the interface pictures S12 retires)',
    stills: {
      '/media/showcase-r2/11_gallery_hero': 2,
      '/media/showcase-r2/15_studio_workspace': 2,
      '/media/showcase-r2/16_mobile_garage': 2,
      '/media/showcase-r2/17_live_player_hud': 2,
      '/media/showcase-r2/25_live_killcam_xray': 2,
    },
  },
  'site/home.html': {
    task: 'the landing rebuild (BUI-W2: the 10-19 landing shows six versus stills in the hero rail and again on the versus wall)',
    stills: Object.fromEntries(['vs01-desert-abrams-t90m-r6', 'vs02-verdant-challenger-t80u-r6', 'vs03-reservoir-k2-ztz99-r6',
      'vs04-railyard-leclerc-t14-r6', 'vs05-oasis-merkava-t72b3-r6', 'vs06-coastal-type10-ztz99a2-r6'].map((id) => [`/media/versus-r1/${id}`, 2])),
  },
});
/** Social cards that share one source today, each until its package re-sources it (BUI-W4: social cards). */
const KNOWN_SHARED_CARDS = new Set(['studio|docs-studio', 'docs-ai|404']);

const failures = [];
let pages = 0, stills = 0, ledgered = 0;
for (const page of publicPages()) {
  const records = pageMedia(readFileSync(join(ROOT, page), 'utf8'));
  const slug = topicSlug(page);
  if (slug) {
    const { hero, figures } = await topicPageMedia(slug);
    records.push(...hero, ...figures);
  }
  pages++;
  const known = KNOWN_DUPLICATES[page]?.stills ?? {};
  const uses = stillUses(records);
  stills += uses.size;
  for (const [id, count] of uses) {
    if (count <= 1) continue;
    if (known[id] === undefined) failures.push(`${page}: ${id} is used ${count} times (each still once per page)`);
    else if (count > known[id]) failures.push(`${page}: ${id} is used ${count} times, more than its ledgered ${known[id]}`);
    else ledgered++;
  }
  for (const [id, count] of Object.entries(known)) {
    if ((uses.get(id) ?? 0) < count) failures.push(`${page}: ${id} is no longer used ${count} times: lower or remove its KNOWN_DUPLICATES entry`);
  }
}

// The social cards: one source each (tools/marketing-shots/generate-og-images.mjs; the zh twins share their card's).
const generator = readFileSync(join(ROOT, 'tools/marketing-shots/generate-og-images.mjs'), 'utf8');
const cards = [...generator.matchAll(/^\s*\['([\w-]+)', '[^']*', '([^']+)'/gm)].map(([, id, source]) => [id, source]);
assert.ok(cards.length >= 20, `found ${cards.length} social cards in generate-og-images.mjs`);
const sources = new Map();
for (const [id, source] of cards) {
  const identity = stillIdentity(`/${source.replace(/^public\//, '')}`);
  if (sources.has(identity) && !KNOWN_SHARED_CARDS.has(`${sources.get(identity)}|${id}`)) {
    failures.push(`social cards ${sources.get(identity)} and ${id} share the source ${source}`);
  } else if (!sources.has(identity)) sources.set(identity, id);
}

assert.deepEqual(failures, [], `stills used twice:\n  ${failures.join('\n  ')}`);
console.log(`media-page-unique.selftest: ${pages} pages, ${stills} distinct stills, none twice on a page `
  + `(${ledgered} ledgered on site/docs.html until ${KNOWN_DUPLICATES['site/docs.html'].task.split(' (')[0]}); `
  + `${cards.length} social cards, ${sources.size} distinct sources`);
