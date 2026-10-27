// The home page's own shots and the beats they fill (home r2, 2026-10-12; owner: "update all of these images to use
// new shots that are a lot beter! and add far more mechanics ... and make a new section highlighting all game modes with
// custom shots for all of them"). Since 246 (owner 2026-10-24: "less clutter and overwhelming wording") the landing's
// generator, tools/home-premiere.mjs, writes them: the modes and the mechanics share one section behind one switch, each
// tile its picture and its name (the mechanics' paragraphs left the page); the kill cam and the Studio share one row.
// Every slot is a pick in tools/media-r5/site-media/picks.json; the mode tiles take the Deploy screen's own stills once
// public/media/deploy-r1 carries a mode's moment; the retired captures (old tier naming and interface, the pre-Premiere
// Garage and HUD) are gone. Since the 2026-10-25 redesign (owner: "use the videos and pics to show off game features")
// the features are the curated home-r2 set (public/media/home-r2/manifest.json, home-premiere.mjs) and the modes and
// mechanics are one rail of large cards behind the switch.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BATTLE_MODE_IDS, GAME_MODE_DEFINITIONS } from '../../src/sim/matchModes.ts';
import { MODE_PRESENTATION_ORDER } from '../../src/sim/gameModeCatalog.ts';
import { renderProductStats } from '../../src/productStats.ts';
import { replaceAppVersionTokens } from '../appVersion.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const picks = JSON.parse(read('tools/media-r5/site-media/picks.json'));
const C = `/media/${picks.collection}`;
const manifest = JSON.parse(read(`public${C}/manifest.json`));
const built = new Set(manifest.files.map((file) => `/${file.path}`));
const en = JSON.parse(read('src/ui/i18nCatalog.en-US.json'));
const zh = JSON.parse(read('src/ui/i18nCatalog.zh-CN.json'));
const home = read('site/home.html');
const camel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const titleKey = (id) => `media.site50.title.${camel(id)}`;
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

// --- every slot is a pick, every pick a slot -------------------------------------------------------------------
// (246) the Garage and multiplayer features showed the pre-Premiere Garage and HUD: they left the landing
const RETIRED_FEATURES = new Set(['garage', 'multiplayer']);
const GROUPS = ['mechanics', 'modes'];
const slots = [...home.matchAll(/<(img|video) data-home-slot="([^"]+)"[^>]*>/g)].map((m) => ({ tag: m[0], kind: m[1], slot: m[2] }));
const deployTile = (id) => new RegExp(`<figure class="play-tile[^"]*" data-mode="${id}"[^>]*><img src="/media/deploy-r1/${id}-(?:480|1280)\\.webp"`).test(home);
const picked = GROUPS.flatMap((group) => picks.home[group].map((entry) => ({ group, entry, slot: `${group}/${entry.id}` })))
  .filter(({ group, entry }) => !(group === 'features' && RETIRED_FEATURES.has(entry.id)))
  .filter(({ group, entry }) => !(group === 'modes' && deployTile(entry.id)));
assert.deepEqual(slots.map((s) => s.slot).sort(), picked.map((p) => p.slot).sort(),
  'home.html carries exactly the picked slots (a mode on its Deploy still carries none)');
assert.equal(new Set(slots.map((s) => s.slot)).size, slots.length, 'no slot appears twice');
for (const retired of RETIRED_FEATURES) assert.ok(!home.includes(`${C}/home/features/${retired}`), `the ${retired} feature left the landing`);
for (const { group, entry, slot } of picked) {
  const { tag } = slots.find((s) => s.slot === slot);
  const own = `${C}/home/${group}/${entry.id}.webp`;
  assert.ok(entry.alt?.en && entry.alt?.zh, `${slot} has its shot's alt text in both languages`);
  assert.equal(en[`media.home.${group}.${camel(entry.id)}`], entry.alt.en, `${slot} alt text is in the en-US catalog`);
  assert.equal(zh[`media.home.${group}.${camel(entry.id)}`], entry.alt.zh, `${slot} alt text is in the zh-CN catalog`);
  // the generator stops on a slot whose shot is not published, so every slot shows its own delivered shot
  assert.ok(built.has(own), `${slot}: its shot is published`);
  assert.equal(attr(tag, 'loading'), 'lazy', `${slot} loads lazily`);
  assert.ok([attr(tag, 'src'), ...attr(tag, 'srcset').split(', ').map((c) => c.split(' ')[0])].includes(own), `${slot} shows its delivered shot`);
  assert.equal(attr(tag, 'data-i18n-alt'), `media.home.${group}.${camel(entry.id)}`, `${slot} describes its own shot`);
  for (const url of [attr(tag, 'src'), ...attr(tag, 'srcset').split(', ').map((c) => c.split(' ')[0])]) {
    assert.ok(built.has(url) && existsSync(join(ROOT, 'public', url)), `${slot}: ${url} is published`);
  }
  assert.ok(en[attr(tag, 'data-i18n-alt')] && zh[attr(tag, 'data-i18n-alt')], `${slot} alt key is in both catalogs`);
}
// --- the retired captures (the X tier naming and the old interface) are gone ---------------------------------------
for (const retired of ['/media/home/garage-m1a3-fleet.webp', '/media/multiplayer-r1/dual-perspective.webp',
  '/media/showcase-r2/13_gallery_modules.webp', '/media/showcase-r2/25_live_killcam_xray.webp',
  '/media/feature-evidence-r2/mechanic-mbt70-missile.webp', '/media/feature-evidence-r2/mechanic-strv-suspension.webp']) {
  assert.ok(!home.includes(retired), `the home page no longer shows ${retired}`);
}

// --- the modes: every mode, in the battle setup's order, with its own name and icon and no copy ----------------------
const playSection = home.match(/<!--home:play-->([\s\S]*?)<!--\/home:play-->/)?.[1] ?? '';
// the switch is tabs over its rails: each rail a tab panel named by its tab
const panel = (name) => playSection.match(new RegExp(`<div class="play-rail" id="play-panel-${name}" data-play-panel="${name}" tabindex="0" role="tabpanel" aria-labelledby="play-tab-${name}"(?: hidden)?>([\\s\\S]*?)</div>(?=<div class="play-rail"|</div></section>)`))?.[1] ?? '';
const cards = [...panel('modes').matchAll(/<figure class="play-tile[^"]*" data-mode="([a-z0-9_]+)"[^>]*>([\s\S]*?)<\/figure>/g)];
assert.deepEqual(cards.map((c) => c[1]), [...MODE_PRESENTATION_ORDER], 'one tile per battle mode, in the one presentation order Deploy and the rooms show (the practice modes are not battles)');
assert.deepEqual([...MODE_PRESENTATION_ORDER].sort(), [...BATTLE_MODE_IDS].sort(), 'the presentation order holds every battle mode once');
assert.deepEqual(picks.home.modes.map((m) => m.id), [...BATTLE_MODE_IDS], 'one mode shot per battle mode');
for (const [, id, body] of cards) {
  assert.match(body, new RegExp(`<use href="#i-${GAME_MODE_DEFINITIONS[id].icon}(?:-s)?"/>`), `${id} wears the battle setup's icon`);
  assert.ok(body.includes(`data-i18n="playMenu.matchMode.${id}.label">${en[`playMenu.matchMode.${id}.label`]}<`),
    `${id} is named as the battle setup names it`);
  assert.doesNotMatch(body, /<p\b/, `${id} carries its name only`);
}
assert.equal((panel('modes').match(/play-tile--lead/g) || []).length, 0, 'every mode card is a large card: no lead');
assert.match(playSection, /data-play-tab="modes" aria-selected="true" tabindex="0">/, 'the modes open first, the tab list\'s stop');
// (2026-10-25 gauntlet) the hero's counts carry the numbers; the switch names its sets only
assert.doesNotMatch(playSection, /cot-c-tabs__count/, 'the switch repeats no count');

// --- the mechanics: three sets of nine behind the switch, each tile named in both languages ----------------------------
const sets = ['gunnery', 'battlefield', 'beyond'];
const mechanicCards = sets.flatMap((name) => [...panel(name).matchAll(/<img data-home-slot="mechanics\/([a-z0-9-]+)"[^>]*><figcaption class="play-tile__nm"><b data-i18n="([^"]+)">[^<]+<\/b><\/figcaption>/g)]
  .map((m) => ({ set: name, id: m[1], key: m[2] })));
assert.equal(mechanicCards.length, picks.home.mechanics.length, `${mechanicCards.length} mechanics, every pick`);
assert.deepEqual(mechanicCards.map((m) => m.id).sort(), picks.home.mechanics.map((m) => m.id).sort(), 'the tiles are the picks');
for (const { id, key } of mechanicCards) {
  assert.equal(key, `home.mechanics.${camel(id)}.title`);
  assert.ok(en[key] && zh[key] && en[key] !== zh[key], `${key} in both languages`);
}
for (const name of sets) {
  assert.equal((panel(name).match(/<figure class="play-tile/g) || []).length, 9, `${name}: nine large cards`);
  assert.ok(playSection.includes(`data-i18n="home.mechanics.group.${name}"`), `${name} names its set on the switch`);
}
assert.match(playSection, /data-rail-prev disabled[\s\S]*data-rail-next/, 'the rail has previous and next arrows');

// --- the page as served: vite's HTML transforms (vite.config.ts: the app version, then cot-product-stats) leave no
// {{...}} token behind (the coordinator, 2026-10-13: a raw "{{COT_BATTLE_MODES}}" heading must never ship)
{
  const served = renderProductStats(replaceAppVersionTokens(home, 'v0.0.0+selftest'));
  const left = [...new Set(served.match(/\{\{[^{}]*\}\}/g) ?? [])];
  assert.deepEqual(left, [], `site/home.html as served carries no unresolved token (${left.join(', ')})`);
  const modesCount = served.match(/<li>[^]*?<b>([^<]*)<\/b><span data-i18n="home\.stats\.modes">/)?.[1] ?? '';
  assert.equal(modesCount, String(BATTLE_MODE_IDS.length), `the hero's mode count as served counts the modes (${modesCount})`);
}
console.log(`home-shots.selftest: ${picked.length} slots (${picked.filter(({ group, entry }) => built.has(`${C}/home/${group}/${entry.id}.webp`)).length} delivered), ${cards.length} modes, ${mechanicCards.length} mechanics`);
