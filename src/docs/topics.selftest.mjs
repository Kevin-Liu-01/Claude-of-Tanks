import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCS_ICON_SPECS } from './docsIcons.ts';
import { TOPIC_ORDER, ZH_TITLE_PHRASES, topicSectionId, topics } from './topics.ts';
import { richSections } from './chapters/index.ts';
import { CREW_LANGUAGES } from '../audio/vehicleAudioProfiles.ts';
import { WEAPON_CLASSES } from '../audio/weaponAudio.ts';
import { staleChapters } from '../../tools/docs-prerender.mjs';
import { heroFlagMaskCss } from '../ui/heroCardPolicy.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const expected = [
  'start', 'controls', 'modes', 'tanks', 'fleet', 'combat', 'battlefields', 'multiplayer', 'audio', 'studio', 'build', 'simulation', 'models', 'rendering', 'ai', 'filming',
];

assert.deepEqual([...TOPIC_ORDER], expected, 'the manual keeps one deliberate public topic order');
assert.deepEqual(Object.keys(topics).sort(), [...expected].sort(), 'every topic is present in navigation');
assert.deepEqual(
  [0, 1, 2, 3, 4, 5].map(topicSectionId),
  ['topic-section-1', 'topic-section-2', 'topic-section-3', 'topic-section-4', 'topic-section-5', 'topic-section-6'],
  'topic anchors stay unique and locale-independent when headings are translated',
);

const landing = readFileSync(join(ROOT, 'site/docs.html'), 'utf8');
const docsCss = readFileSync(join(ROOT, 'src/docs/docs.css'), 'utf8');
const topicsSource = readFileSync(join(ROOT, 'src/docs/topics.ts'), 'utf8');
for (const id of TOPIC_ORDER) {
  const topic = topics[id];
  assert.ok(topic, `${id} has a topic definition`);
  assert.ok(Object.hasOwn(DOCS_ICON_SPECS, topic.icon), `${id} has a typed custom icon`);
  const rich = richSections(id);
  if (rich) {
    // a chapter built from the game's tables (src/docs/chapters): its own sections, anchors and pictures
    // a chapter that is one whole-body section (the fleet's grid) holds every tank; any other has three sections or more
    if (topic.full) assert.ok(topic.rich && rich.length === 1, `${id} is one section that takes the body`);
    else assert.ok(topic.rich && rich.length >= 3, `${id} remains a substantive manual`);
    assert.equal(new Set(rich.map((section) => section.id)).size, rich.length, `${id}: one anchor per section`);
    for (const section of rich) {
      assert.match(section.id, /^[a-z][a-z0-9-]*$/, `${id}#${section.id}: a plain anchor`);
      assert.ok(section.title && section.html && section.text, `${id}#${section.id}: a heading, markup and text`);
      for (const [, src] of section.html.matchAll(/(?:src|srcset)="(\/[^" ,?]+)/g)) {
        assert.ok(existsSync(join(ROOT, 'public', src)), `${id}#${section.id}: ${src} is on disk`);
      }
    }
    assert.ok(existsSync(join(ROOT, 'public', topic.hero)), `${id}: its banner take exists`);
  } else {
    assert.ok(topic.sections.length >= 5, `${id} remains a substantive manual`);
    assert.equal(topic.sectionIcons.length, topic.sections.length, `${id} has an icon for every section`);
    for (const icon of topic.sectionIcons) {
      assert.ok(Object.hasOwn(DOCS_ICON_SPECS, icon), `${id} section icon ${icon} is registered`);
    }
    assert.equal(topic.media.length, 2, `${id} has two current visual evidence anchors`);
    const [firstFigureAt, secondFigureAt] = topic.mediaAt ?? [1, 3];
    assert.ok(firstFigureAt < secondFigureAt && secondFigureAt < topic.sections.length, `${id} places both figures after its own sections`);
    for (const asset of [topic.hero, ...topic.media.map(([src]) => src)]) {
      assert.ok(existsSync(join(ROOT, 'public', asset)), `${id}: referenced media exists (${asset})`);
    }
  }
  assert.ok(existsSync(join(ROOT, `site/docs-${id}.html`)), `${id} has an independently indexed HTML entry`);
  assert.match(landing, new RegExp(`href="/docs/${id}"`), `${id} is discoverable from the manual index`);
}

// (242, the direction's 08-docs) every chapter sits on the shelf beside the page, in its two groups; the narrow
// layout folds the shelf into one scrolling row that opens on the current chapter
assert.match(topicsSource, /const TOPIC_GROUPS[\s\S]*?'play'[\s\S]*?'behind'/, 'the shelf names its two groups: the player\'s chapters first, then behind the game');
const shelved = [...topicsSource.matchAll(/topics: \[([^\]]+)\]/g)].flatMap((m) => m[1].match(/'([a-z]+)'/g).map((q) => q.slice(1, -1)));
assert.deepEqual([...shelved].sort(), [...TOPIC_ORDER].sort(), 'every chapter is on the shelf exactly once');
assert.match(docsCss, /\.dm\{display:grid;grid-template-columns:var\(--docs-side-w\) minmax\(0,1fr\)/, 'wide manuals keep the shelf beside the page');
assert.match(docsCss, /\.dm-side\{position:static;flex-direction:row;flex-wrap:nowrap;[^}]*overflow-x:auto/, 'narrow manuals fold the shelf into a scrolling row');
assert.match(topicsSource, /shelf\.scrollLeft = Math\.min\(at\(lead\) - start, shelf\.scrollWidth - shelf\.clientWidth\)/,
  'narrow manuals reveal their current chapter without moving the page, an item\'s start on the gutter (no item cut at the left edge)');
assert.match(docsCss, /\.dm-side\{[^}]*padding:10px var\(--docs-gutter\) 10px calc\(var\(--docs-gutter\) - var\(--s3\)\);scroll-padding-inline:var\(--docs-gutter\) var\(--dm-fade\)/,
  'the narrow shelf row starts on the page gutter (its start padding gives back the first item\'s own) and scrolls its items to it');
assert.match(docsCss, /\.dm-side a\.dm-home,\.dm-side a:not\(\.dm-home\)\{[^}]*padding:4px var\(--s3\)/,
  'every item of the narrow shelf row, the index link too, keeps one horizontal padding (equal gaps around the selected plate)');
// the contents rail's first entry stands on the first heading's baseline: the article and the rail align on their first
// baselines (no item opts out to the top), and every chapter's article opens on its first section's heading
assert.match(docsCss, /\.dm-body\{display:grid;grid-template-columns:minmax\(0,1fr\) var\(--docs-toc-w\);align-items:baseline;/,
  'the article and the contents rail share their first baseline');
assert.doesNotMatch(docsCss.match(/\.dm-toc\{[^}]*\}/)?.[0] ?? '', /align-self/, 'the contents rail keeps the shared baseline');
assert.doesNotMatch(docsCss.match(/\.dm-article\{[^}]*\}/)?.[0] ?? '', /align-self/, 'the article keeps the shared baseline');
for (const slug of TOPIC_ORDER) {
  assert.match(readFileSync(join(ROOT, `site/docs-${slug}.html`), 'utf8'), /<article class="dm-article[^"]*"><section class="dm-section" id="[^"]+"><h2>/,
    `${slug} opens its article on a heading, so the rail's first entry has that heading's baseline to stand on`);
}
// a Chinese chapter title breaks only between its phrases (never 构/建): each phrase list spells its catalog title
const zhCatalog = JSON.parse(readFileSync(join(ROOT, 'src/ui/i18nCatalog.zh-CN.json'), 'utf8'));
for (const slug of TOPIC_ORDER) {
  assert.equal(ZH_TITLE_PHRASES[slug]?.join(''), zhCatalog[`docs.topic.${slug}.title`],
    `${slug}: topics.ts ZH_TITLE_PHRASES spells the Chinese title (cut it into phrases again after a copy change)`);
}
assert.doesNotMatch(topicsSource, / \/\/ \$\{title\}/, 'no "01 // title" index lines (the owner\'s no-separator rule)');
assert.doesNotMatch(topicsSource, /replace\(\/\[\^a-z0-9\]/, 'translated headings must not determine section anchors');

const buildText = [topics.build.lede, ...topics.build.sections.flat()].join(' ');
assert.match(buildText, /Claude Code and Codex/);
assert.match(buildText, /Git worktrees/);
assert.match(buildText, /origin\/main/);
assert.match(buildText, /AGENTS\.md/);

const modelText = [topics.models.lede, ...topics.models.sections.flat()].join(' ');
assert.match(modelText, /Kevin B\. Liu authored every playable tank|first-party procedural runtime geometry/);
assert.match(modelText, /Generate icons and technical cards/);
assert.match(modelText, /tank:anatomy:update/);
assert.match(modelText, /tank:release:check/);

// The sound chapter is built from the audio engine's own tables (src/docs/chapters/audio.ts); its counts follow the engine.
const audioSections = richSections('audio');
const audioText = audioSections.map((section) => section.text).join(' ');
assert.match(audioText, new RegExp(`\\b${Object.keys(WEAPON_CLASSES).length} report classes\\b`),
  'the sound chapter states the engine weapon report-class count');
const CREW_LANGUAGE_NAMES = {
  'en-US': 'American', 'en-GB': 'British', de: 'German', ru: 'Russian', uk: 'Ukrainian', zh: 'Chinese',
  fr: 'French', sv: 'Swedish', ja: 'Japanese', ko: 'Korean', it: 'Italian', pl: 'Polish', he: 'Hebrew',
};
const crewRadioText = audioSections.find((section) => section.id === 'radio')?.text ?? '';
for (const language of CREW_LANGUAGES) {
  const name = CREW_LANGUAGE_NAMES[language];
  assert.ok(name, `crew language ${language} needs a name in the sound chapter`);
  assert.match(crewRadioText, new RegExp(`\\b${name}\\b`), `the sound chapter names the ${name} crews`);
}
assert.match(audioText, /ElevenLabs/);
assert.match(audioText, /nothing is generated while you play/);
assert.match(audioText, /No interface sound tells you a shot hit/);
assert.match(audioText, /Short\. Adjusting\./);
assert.match(audioText, /National crews/);
assert.match(audioText, new RegExp(`\\b${CREW_LANGUAGES.length} existing national crews for every tank\\b`));
assert.match(audioText, /saved across battles and reloads/);
assert.doesNotMatch(audioText, /selftest|node (?:src|tools)\//, 'the sound chapter is written for players, not as a test checklist');

// brand-ui SPEC 12.4: every chapter ships in its page in both locales, so the first paint is the chapter (no stub)
assert.deepEqual(staleChapters(), [], 'the prerendered chapters match topics.ts (node tools/docs-prerender.mjs --write)');
for (const slug of TOPIC_ORDER) {
  assert.match(readFileSync(join(ROOT, `site/docs-${slug}.html`), 'utf8'), new RegExp(`<main id="topicRoot" data-prerendered="${slug}" data-prerendered-locale="en-US"><div class="dm">`),
    `site/docs-${slug}.html carries its chapter`);
}
assert.match(topicsSource, /root\.dataset\.prerendered === slug && root\.dataset\.prerenderedLocale === getLocale\(\)/,
  'the script keeps a chapter prerendered for its locale and only wires it');

// the fleet chapter: one tile per playable tank, each linking to its Gallery dossier by its display name (never an id),
// and each filter's choices counting every tank once
{
  const [grid] = richSections('fleet');
  const tiles = [...grid.html.matchAll(/<li class="dm-fleet__tile" data-id="([^"]+)"[\s\S]*?<\/li>/g)];
  const assets = JSON.parse(readFileSync(join(ROOT, 'public/icons/tank-assets.json'), 'utf8')).tanks;
  assert.deepEqual(tiles.map(([, id]) => id).sort(), Object.keys(assets).sort(), 'the fleet grid has one tile per playable tank');
  for (const [tile, id] of tiles) {
    assert.match(tile, new RegExp(`href="/gallery\\?id=${id}[&"]`), `${id}: its tile opens its Gallery dossier`);
    const name = tile.match(/<span class="dm-fleet__name">([\s\S]*?)<\/span><span class="dm-fleet__meta">/)?.[1]?.replace(/<[^>]+>/g, '').replace(/\u00a0/g, ' ');
    assert.equal(name, assets[id].label.displayName, `${id}: its tile names it by its display name, never its id`);
  }
  const data = JSON.parse(grid.html.match(/<script type="application\/json" id="dmFleetData">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data.total, tiles.length, 'the grid counts every tile');
  assert.deepEqual(data.facets.map((facet) => facet.key), ['nation', 'tier', 'era', 'class', 'role'], 'the grid filters by nation, tier, era, class and role');
  for (const facet of data.facets) {
    assert.equal(facet.options[0].id, '', `${facet.key}: its first choice is every value`);
    assert.equal(facet.options.slice(1).reduce((sum, option) => sum + option.count, 0), tiles.length, `${facet.key}: its choices count every tank once`);
  }
  assert.ok(!topics.fleet.full || !readFileSync(join(ROOT, 'site/docs-fleet.html'), 'utf8').includes('class="dm-toc"'), 'the fleet grid takes the body without a contents rail');
}

// the tanks chapter's hero cards feather their flags as the Garage does: the docs token is the policy's mask
const docsTokens = JSON.parse(readFileSync(join(ROOT, 'src/ui/tokens/tokens.json'), 'utf8')).component['surface-docs'];
assert.equal(docsTokens['docs-hc-flag-mask'].value, heroFlagMaskCss(undefined, 'left'),
  'tokens.json docs-hc-flag-mask is heroFlagMaskCss() (src/ui/heroCardPolicy.ts): copy it after a policy change');

console.log(`topics.selftest: ${TOPIC_ORDER.length} indexed manuals with complete icon, workflow, and audio coverage passed; every chapter prerendered in en-US and zh-CN`);
