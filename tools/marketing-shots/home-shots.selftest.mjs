// The home page's own shots and the two sections they fill (home r2, 2026-10-12; owner: "update all of these images to use
// new shots that are a lot beter! and add far more mechanics ... and make a new section highlighting all game modes with
// custom shots for all of them"): every slot is a pick in tools/media-r5/site-media/picks.json, wired by
// tools/media-r5/site-media-wire.mjs to its delivered shot (home/<group>/<id>.webp) or, until then, its stand-in still;
// the modes section shows every mode in the battle setup's order with its own name and icon and no rule numbers (they
// live in src/sim/matchRuleset.ts); the retired captures (old tier naming and interface) are gone.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BATTLE_MODE_IDS, GAME_MODE_DEFINITIONS } from '../../src/sim/matchModes.ts';
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
const GROUPS = ['features', 'mechanics', 'modes'];
const slots = [...home.matchAll(/<(img|video|div) data-home-slot="([^"]+)"[^>]*>/g)].map((m) => ({ tag: m[0], kind: m[1], slot: m[2] }));
const picked = GROUPS.flatMap((group) => picks.home[group].map((entry) => ({ group, entry, slot: `${group}/${entry.id}` })));
assert.deepEqual(slots.map((s) => s.slot).sort(), [...picked.map((p) => p.slot), 'features/studio'].sort(),
  'home.html carries exactly the picked slots');
assert.equal(new Set(slots.map((s) => s.slot)).size, slots.length, 'no slot appears twice');
for (const { group, entry, slot } of picked) {
  const { tag } = slots.find((s) => s.slot === slot);
  const own = `${C}/home/${group}/${entry.id}.webp`;
  assert.ok(entry.alt?.en && entry.alt?.zh, `${slot} has its shot's alt text in both languages`);
  assert.equal(en[`media.home.${group}.${camel(entry.id)}`], entry.alt.en, `${slot} alt text is in the en-US catalog`);
  assert.equal(zh[`media.home.${group}.${camel(entry.id)}`], entry.alt.zh, `${slot} alt text is in the zh-CN catalog`);
  if (!built.has(own) && !entry.standIn) {
    // no stand-in may show the wrong subject (the coordinator, 2026-10-13): a mechanic or mode card waiting for its shot
    // keeps its title and copy over the plain panel and shows no image; a feature's own section hides
    assert.equal(tag, `<div data-home-slot="${slot}" class="v5-slot-pending" data-home-pending aria-hidden="true">`, `${slot} waits on the plain panel`);
    if (group === 'features') {
      assert.ok(new RegExp(`<(?:article|figure)\\b[^>]* hidden><div data-home-slot="${slot}"`).test(home), `${slot}: its section is hidden until its shot lands`);
    } else {
      const card = home.match(new RegExp(`<article[^>]*><div data-home-slot="${slot}"[\\s\\S]*?<\\/article>`))?.[0] ?? '';
      assert.ok(card && !/ hidden>/.test(card.slice(0, card.indexOf('<div'))), `${slot}: its card shows, title and copy`);
      assert.doesNotMatch(card, /src="\/media\//, `${slot}: no stand-in image`);
    }
    continue;
  }
  assert.equal(attr(tag, 'loading'), 'lazy', `${slot} loads lazily`);
  assert.ok(!new RegExp(`<(?:article|figure)\\b[^>]* hidden><img data-home-slot="${slot}"`).test(home), `${slot}: its section shows`);
  if (built.has(own)) {
    assert.equal(attr(tag, 'src'), own, `${slot} shows its delivered shot`);
    assert.equal(attr(tag, 'data-i18n-alt'), `media.home.${group}.${camel(entry.id)}`, `${slot} describes its own shot`);
  } else {
    const still = `${C}/stills/${entry.standIn.id}${entry.standIn.still === 'close' ? '-close' : ''}.webp`;
    assert.ok(picks.takes[entry.standIn.id], `${slot} stands in on a site fifty take`);
    assert.equal(attr(tag, 'src'), still, `${slot} shows its stand-in until its shot is delivered`);
    assert.equal(attr(tag, 'data-i18n-alt'), titleKey(entry.standIn.id), `${slot} describes the stand-in it shows`);
  }
  for (const url of [attr(tag, 'src'), ...attr(tag, 'srcset').split(', ').map((c) => c.split(' ')[0])]) {
    assert.ok(built.has(url) && existsSync(join(ROOT, 'public', url)), `${slot}: ${url} is published`);
  }
  assert.ok(en[attr(tag, 'data-i18n-alt')] && zh[attr(tag, 'data-i18n-alt')], `${slot} alt key is in both catalogs`);
}
// a stand-in only where it shows the slot's own subject: the Scene Studio presets are the site's takes
const HONEST_STAND_INS = new Set(['mechanics/presets']);
for (const { entry, slot } of picked) if (entry.standIn) assert.ok(HONEST_STAND_INS.has(slot), `${slot}: a stand-in only where it shows the slot's own subject`);
const standIns = picked.filter((p) => p.entry.standIn).map((p) => `${p.entry.standIn.id}:${p.entry.standIn.still}`);
assert.equal(new Set(standIns).size, standIns.length, 'no stand-in still repeats');
const studio = slots.find((s) => s.slot === 'features/studio');
assert.equal(studio.kind, 'video', 'the Scene Studio card keeps its loop');
const studioVideo = home.match(/<video data-home-slot="features\/studio"[^\n]*?<\/video>/)[0];
const ownLoop = `${C}/home/features/studio.mp4`;
assert.ok(studioVideo.includes(`data-src="${built.has(ownLoop) ? ownLoop : picks.home.studio.standIn.video}"`),
  'the Studio card plays its delivered loop, or the landing-r1 recording until it is delivered');

// --- the retired captures (the X tier naming and the old interface) are gone ---------------------------------------
for (const retired of ['/media/home/garage-m1a3-fleet.webp', '/media/multiplayer-r1/dual-perspective.webp',
  '/media/showcase-r2/13_gallery_modules.webp', '/media/showcase-r2/25_live_killcam_xray.webp',
  '/media/feature-evidence-r2/mechanic-mbt70-missile.webp', '/media/feature-evidence-r2/mechanic-strv-suspension.webp']) {
  assert.ok(!home.includes(retired), `the home page no longer shows ${retired}`);
}

// --- the modes: every mode, in the battle setup's order, with its own name and icon ----------------------------------
const modesSection = home.match(/<section class="v5-modes"[\s\S]*?\n {4}<\/section>/)?.[0] ?? '';
// (a mode whose shot has not landed keeps its card in the markup, hidden: the order holds)
const cards = [...modesSection.matchAll(/<article class="v5-mode[^"]*" data-mode="([a-z0-9_]+)"(?: hidden)?>([\s\S]*?)<\/article>/g)];
assert.deepEqual(cards.map((c) => c[1]), [...BATTLE_MODE_IDS], 'one card per battle mode, in BATTLE_MODE_IDS order (the practice modes are not battles)');
assert.deepEqual(picks.home.modes.map((m) => m.id), [...BATTLE_MODE_IDS], 'one mode shot per battle mode');
for (const [, id, body] of cards) {
  assert.ok(body.includes(`data-ui-icon="${GAME_MODE_DEFINITIONS[id].icon}"`), `${id} wears the battle setup's icon`);
  assert.ok(body.includes(`data-i18n="playMenu.matchMode.${id}.label">${en[`playMenu.matchMode.${id}.label`]}<`),
    `${id} is named as the battle setup names it`);
  const key = `home.modes.${id}.body`;
  assert.ok(body.includes(`data-i18n="${key}"`), `${id} has its line`);
  for (const [locale, catalog] of [['en-US', en], ['zh-CN', zh]]) {
    // rule numbers (score targets, respawn seconds, clocks, gravity) live in matchRuleset.ts, never in the page's copy
    assert.doesNotMatch(catalog[key], /[0-9０-９]/, `${locale} ${key} hard-codes no rule number`);
  }
}
assert.match(modesSection, /data-i18n="home\.modes\.title" data-i18n-vars='\{"count":"\{\{COT_BATTLE_MODES\}\}"\}'/,
  'the modes heading counts the registry (productStats.ts, BATTLE_MODE_IDS)');
assert.equal((modesSection.match(/v5-mode--hero/g) || []).length, 1, 'one lead mode card');

// --- the mechanics: four groups, twenty to twenty-eight cards, each with copy in both languages ----------------------
const mechanicsSection = home.match(/<section class="v5-mechanics"[\s\S]*?\n {4}<\/section>/)?.[0] ?? '';
const groups = [...mechanicsSection.matchAll(/<section class="v5-mechanics-group" aria-labelledby="([^"]+)">[\s\S]*?<\/section>/g)];
assert.equal(groups.length, 4, 'four groups of mechanics');
// (a card waiting for its shot carries the plain panel where its image goes: the rows hold)
const mechanicCards = [...mechanicsSection.matchAll(/<article(?: class="is-wide")?><(?:img|div) data-home-slot="mechanics\/([a-z0-9-]+)"[^>]*>(?:<\/div>)?<div><h4 data-i18n="([^"]+)">[^<]+<\/h4><p data-i18n="([^"]+)">[^<]+<\/p><\/div><\/article>/g)];
assert.ok(mechanicCards.length >= 20 && mechanicCards.length <= 28, `${mechanicCards.length} mechanics`);
assert.deepEqual(mechanicCards.map((m) => m[1]), picks.home.mechanics.map((m) => m.id), 'the cards follow the picks');
for (const [, id, titleKeyName, bodyKey] of mechanicCards) {
  assert.equal(titleKeyName, `home.mechanics.${camel(id)}.title`);
  assert.equal(bodyKey, `home.mechanics.${camel(id)}.body`);
  for (const key of [titleKeyName, bodyKey]) assert.ok(en[key] && zh[key] && en[key] !== zh[key], `${key} in both languages`);
}
// a group's row stays full: its wide cards make up what its narrow ones leave of the last four-card row
for (const [section] of groups) {
  const narrow = (section.match(/<article><(?:img|div) data-home-slot/g) || []).length, wide = (section.match(/<article class="is-wide">/g) || []).length;
  assert.equal((narrow + 2 * wide) % 4, 0, `${section.slice(0, 80)}: rows of four`);
}

// --- the page as served: vite's HTML transforms (vite.config.ts: the app version, then cot-product-stats) leave no
// {{...}} token behind (the coordinator, 2026-10-13: a raw "{{COT_BATTLE_MODES}}" heading must never ship)
{
  const served = renderProductStats(replaceAppVersionTokens(home, 'v0.0.0+selftest'));
  const left = [...new Set(served.match(/\{\{[^{}]*\}\}/g) ?? [])];
  assert.deepEqual(left, [], `site/home.html as served carries no unresolved token (${left.join(', ')})`);
  const modesHeading = served.match(/<h2 id="modes-title"[^>]*>([^<]*)</)?.[1] ?? '';
  assert.match(modesHeading, new RegExp(`\\b${BATTLE_MODE_IDS.length}\\b`), `the modes heading as served counts the modes (${modesHeading})`);
}
console.log(`home-shots.selftest: ${picked.length + 1} slots (${picked.filter(({ group, entry }) => built.has(`${C}/home/${group}/${entry.id}.webp`)).length} delivered), ${cards.length} modes, ${mechanicCards.length} mechanics`);
