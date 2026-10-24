// chapters.selftest.mjs — the manual's data-built chapters keep to the game's tables: the tanks chapter counts the whole
// fleet and lists every equipment item, the combat chapter's charts fall and rise the way the sim's rules do, the
// battlefields chapter shows every map; and every chapter's numbers print clean, with every picture it names on disk.
// Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../../ui/i18nCatalog.ts';
import { setLocale } from '../../ui/i18n.ts';
import { richSections } from './index.ts';
import { fleetTanks } from './fleet.ts';
import { EQUIPMENT_CATALOG } from '../../game/equipment.ts';
import { MAP_IDS } from '../../world/maps/mapIds.ts';
import { TOPIC_ORDER, topics } from '../topics.ts';
import { ROOM_MAX_SPECTATORS, ROOM_MAX_TEAM_SIZE } from '../../mp/room/protocol.ts';
import { BATTLE_MODE_IDS } from '../../sim/matchModes.ts';
import { CREW_LANGUAGES } from '../../audio/vehicleAudioProfiles.ts';
import { WEAPON_CLASSES } from '../../audio/weaponAudio.ts';
import { SCENE_EFFECT_TYPES } from '../../game/studioSceneShare.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
await setLocale('en-US');

const rich = TOPIC_ORDER.filter((slug) => topics[slug].rich);
for (const slug of rich) {
  const sections = richSections(slug);
  assert.ok(sections?.length, `${slug}: a rich chapter builds its sections`);
  assert.equal(new Set(sections.map((section) => section.id)).size, sections.length, `${slug}: section ids are unique`);
  const html = sections.map((section) => section.html).join('');
  const text = sections.map((section) => section.text).join(' ');
  assert.doesNotMatch(text, /\d\.\d{5,}/, `${slug}: no float noise in the copy`);
  assert.doesNotMatch(text, /\{[a-zA-Z]+\}/, `${slug}: every placeholder is filled`);
  assert.doesNotMatch(text, /\b(docs|equipment|garage|hud|map|nation)\.[a-z][A-Za-z]+\.[A-Za-z.]+/, `${slug}: no raw catalog key`);
  for (const [, src] of html.matchAll(/\s(?:src|srcset)="(\/[^"?\s]+)/g)) {
    assert.ok(existsSync(join(ROOT, 'public', src)), `${slug}: ${src} is in public/`);
  }
}

const sectionHtml = (slug, id) => richSections(slug).find((section) => section.id === id)?.html ?? '';

// tanks: the class cards count the fleet once, every equipment item is listed
const fleet = fleetTanks();
const classCounts = [...sectionHtml('tanks', 'classes').matchAll(/<\/span><b>(\d+)<\/b><\/h3>/g)].map(([, n]) => Number(n));
assert.ok(classCounts.length >= 3, 'the classes section shows each class');
assert.ok(classCounts.reduce((a, b) => a + b, 0) <= fleet.size, 'a tank is counted in at most one class');
assert.equal((sectionHtml('tanks', 'classes').match(/class="dm-hc cot-hc/g) ?? []).length, classCounts.length, 'every class card shows a hero card');
const equipment = sectionHtml('tanks', 'equipment');
assert.equal((equipment.match(/<li>/g) ?? []).length, EQUIPMENT_CATALOG.length, 'every equipment item sits under its category');
const tiers = [...sectionHtml('tanks', 'tiers').matchAll(/<span class="dm-bar" style="--dm-bar:([\d.]+)"><\/span><span class="num">(\d+)<\/span>/g)];
assert.equal(tiers.reduce((sum, [, , n]) => sum + Number(n), 0), fleet.size, 'the tier bars add up to the fleet');
assert.ok(tiers.some(([, share]) => share === '1.000'), 'the longest tier bar fills its track');

// combat: penetration falls with range, effective armour rises with the angle
const paths = (html) => [...html.matchAll(/<path class="l s-[a-d]" d="([^"]+)"/g)].map(([, d]) => [...d.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map(([, x, y]) => [Number(x), Number(y)]));
for (const line of paths(sectionHtml('combat', 'penetration'))) {
  for (let i = 1; i < line.length; i++) assert.ok(line[i][0] > line[i - 1][0] && line[i][1] >= line[i - 1][1], 'penetration never rises with range (SVG y grows downward)');
}
const angling = paths(sectionHtml('combat', 'angling'));
assert.ok(angling.length >= 3, 'the angle chart draws each shell kind');
for (const line of angling) {
  for (let i = 1; i < line.length; i++) assert.ok(line[i][1] <= line[i - 1][1], 'effective armour never falls as the angle grows');
}
assert.ok(paths(sectionHtml('combat', 'spotting')).length >= 2, 'the spot chart draws more than one view range');

// battlefields: every map has its card
const maps = sectionHtml('battlefields', 'maps');
for (const id of MAP_IDS) assert.ok(maps.includes(`id="map-${id}"`), `the maps section shows ${id}`);

// multiplayer: the seats are drawn to the room's caps, and every battle mode is a chip that opens its card
const seats = sectionHtml('multiplayer', 'seats');
assert.equal((seats.match(/<li(?: class="is-on")?><\/li>/g) ?? []).length, ROOM_MAX_TEAM_SIZE * 2 + ROOM_MAX_SPECTATORS, 'one pip per seat');
assert.equal((sectionHtml('multiplayer', 'modes').match(/<li><a href="[^"]*#/g) ?? []).length, BATTLE_MODE_IDS.length, 'a chip per battle mode a room plays');

// sound: a crew language each, a bar per gun report, both call tables quote the captions
assert.equal((sectionHtml('audio', 'radio').match(/class="cot-c-flag/g) ?? []).length, CREW_LANGUAGES.length, 'a flag per crew language');
assert.equal((sectionHtml('audio', 'gunfire').match(/class="dm-bar"/g) ?? []).length, Object.keys(WEAPON_CLASSES).length, 'a bar per report class');
for (const id of ['hits', 'warnings']) assert.ok((sectionHtml('audio', id).match(/<q>/g) ?? []).length >= 10, `the ${id} table quotes the crew`);

// studio: every effect the chapter names is one the Studio fires (studioSceneShare.ts, which equals studio.ts's handlers)
const catalog = JSON.parse(readFileSync(join(ROOT, 'src/ui/i18nCatalog.en-US.json'), 'utf8'));
const namedEffects = Object.keys(catalog).filter((key) => key.startsWith('studio.ws.fx.')).map((key) => key.slice('studio.ws.fx.'.length));
for (const type of namedEffects) assert.ok(SCENE_EFFECT_TYPES.includes(type), `the Studio fires ${type}`);
assert.equal((sectionHtml('studio', 'open').match(/<li><a href="[^"]*studio\?scene=/g) ?? []).length, 6, 'six of the site\'s films open in the Studio');

console.log(`chapters.selftest: ${rich.length} data-built chapters; ${fleet.size} tanks in ${classCounts.length} classes, ${EQUIPMENT_CATALOG.length} equipment items, ${MAP_IDS.length} maps`);
