// inAction.selftest.mjs — the Tank Gallery dossier's "In action" block (src/gallery/inAction.ts over src/ui/fleetTakes.ts;
// owner 2026-10-12: every tank's own take, "use that everywhere"). The block and the fleet index load after the first
// tank is on screen, never with the page; it stays hidden for a vehicle the index lacks, shows the take's poster,
// caption and Studio link, plays only while visible and stops the moment the vehicle changes. The fixture index is
// fake and lives only here; its files are the site fifty's s21 and s05.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFakeDom, settle } from '../ui/fleetTakes.test-support.mjs';
import { staticImportClosure } from '../../tools/static-import-closure.mjs';
import { t } from '../ui/i18n.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const dom = createFakeDom();
const uninstall = dom.install();
const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'en-US', languages: ['en-US'] } });

const fields = {
  take: 's60-fixture-fields', map: 'verdant',
  title: { en: 'A T-90SM wedge assaults through the burning fields', zh: '一组 T-90SM 楔形编队冲过燃烧的田野' },
  short: { en: 'T-90SM wedge assault', zh: 'T-90SM 楔形突击' },
  loop: '/media/site50-r14/loops/s21-fields-assault.webm',
  poster: '/media/site50-r14/loops/s21-fields-assault.jpg',
  scene: '/media/site50-r14/scenes/s21-fields-assault.scene.json',
};
const barns = { ...fields, take: 's61-fixture-barns', map: 'no-such-map', title: { en: 'A T-14 advances past the barns' },
  loop: '/media/site50-r14/loops/s05-barn-advance-960.webm', poster: '/media/site50-r14/loops/s05-barn-advance.jpg' };
dom.respond('/media/site50-r14/fleet/index.json', { collection: 'site50-r14', vehicles: { t90sm: fields, t14: barns } });

const { mountInAction } = await import('./inAction.ts');
assert.deepEqual(dom.state.fetches, [], 'loading the block\'s module fetches nothing');
const host = dom.document.createElement('div');
const block = mountInAction(host);
assert.deepEqual(dom.state.fetches, ['/media/site50-r14/fleet/index.json'], 'the index loads with the block');
const section = host.children[0];
assert.equal(section.localName, 'section');
assert.equal(section.className, 'dossier-section fleet-take-section', 'a dossier section in the dossier\'s language');
assert.equal(section.hidden, true, 'hidden until a vehicle with a take is shown');
assert.equal(section.getAttribute('aria-labelledby'), 'fleetTakeHeading');
const heading = section.querySelector('.section-label span');
assert.equal(heading.id, 'fleetTakeHeading');
assert.equal(heading.textContent, 'In action');
const place = section.querySelector('.section-label small');
const frame = section.querySelector('.fleet-take-frame');
const video = frame.querySelector('video');
const title = section.querySelector('.fleet-take-title');
const studio = section.querySelector('.fleet-take-studio');

block.show('t90sm');
await settle();
assert.equal(section.hidden, false, 'a vehicle with a take shows the block');
assert.equal(place.textContent, t('map.verdant'), 'the label names the take\'s battlefield');
assert.equal(title.textContent, fields.title.en, 'the caption is the take\'s title');
assert.equal(studio.getAttribute('href'), `/studio?scene=${fields.scene}`, 'the take opens in the Studio as a preset');
assert.equal(studio.textContent, 'Open in Studio');
assert.equal(video.src, '', 'no loop while the block is off screen');
dom.intersect(frame, 0, true);
assert.equal(video.poster, fields.poster, 'the poster first');
dom.intersect(frame, 0.7);
assert.equal(video.src, fields.loop, 'visible: the loop plays');
assert.equal(video.paused, false);
dom.intersect(frame, 0, true);
assert.equal(video.paused, true, 'scrolled out of the dossier: paused');
dom.intersect(frame, 0.7);

block.show(null);
assert.equal(section.hidden, true, 'a vehicle being replaced hides the block at once');
assert.equal(video.src, '', 'and releases its loop');
block.show('t14');
await settle();
assert.equal(section.hidden, false);
assert.equal(place.textContent, '', 'a map this build does not know is left unnamed');
assert.equal(title.textContent, barns.title.en);
assert.equal(video.src, barns.loop, 'the next vehicle\'s loop, while the block stays on screen');
block.show('m1a2');
await settle();
assert.equal(section.hidden, true, 'a vehicle the index lacks shows no block');
assert.equal(video.src, '', 'and no loop');
block.show('t90sm');
block.show('t14');
block.show(null);
await settle();
assert.equal(section.hidden, true, 'only the latest selection is shown');
block.show('t90sm');
block.show('t14');
await settle();
assert.equal(title.textContent, barns.title.en, 'a quick change of vehicle shows the last one');
assert.equal(dom.state.fetches.length, 1, 'one index request for the page');

// Wiring: gallery.ts loads the block after the first tank, places it after the summary and stops it with the tank.
const gallery = read('src/gallery/gallery.ts');
assert.match(gallery, /^import type \{ InActionBlock \} from '\.\/inAction\.ts';$/m, 'the block is typed, not imported, at load');
assert.match(gallery, /import\('\.\/inAction\.ts'\)/, 'it loads through import()');
assert.match(gallery, /\$\('#summaryHeading'\)\.closest\('section'\)!\.after\(inActionHost\);/, 'after the technical summary');
assert.match(read('site/gallery.html'), /<section class="dossier-section" aria-labelledby="summaryHeading">/);
assert.match(gallery, /function disposeTank\(\): void \{\n\s+inAction\?\.show\(null\);/, 'the outgoing vehicle\'s take stops first');
const loadTank = gallery.slice(gallery.indexOf('async function loadTank('), gallery.indexOf('function renderInspection('));
const order = ["loadingState.classList.add('hidden');", 'if (version === loadVersion) showInAction(id);', 'await loadDamageLab();'];
assert.deepEqual(order.map((step) => loadTank.indexOf(step) >= 0), [true, true, true], 'loadTank shows the take');
assert.ok(order.every((step, index) => index === 0 || loadTank.indexOf(order[index - 1]) < loadTank.indexOf(step)),
  'once the tank is on screen, before the damage lab loads');
const closure = staticImportClosure('src/gallery/gallery.ts', { root: ROOT });
for (const lazy of ['src/gallery/inAction.ts', 'src/ui/fleetTakes.ts']) {
  assert.ok(!closure.has(lazy), `the Gallery's first load never includes ${lazy}`);
}
const css = read('src/gallery/gallery.css');
assert.match(css, /\[hidden\]\{display:none!important\}/, 'a hidden block, loop or control stays hidden');
assert.match(css, /\.fleet-take-host\{display:contents\}/, 'the host adds no box between dossier sections');
assert.match(css, /body\[data-cot-input='coarse'\] \.fleet-take-toggle\{width:44px;height:44px\}/, 'a touch-size control');

// The page catalog (tools/i18n-page-catalogs.mjs): no module of the Gallery's first load spells the block's strings, so
// they ride its lazy chunk, not its boot catalog. (A full scan of the Gallery's graph takes seconds; npm run i18n:check
// and the build run it.)
const firstLoad = [...closure.keys()].filter((file) => /\.(?:ts|mjs)$/.test(file)).map(read).join('\n');
for (const key of ['gallery.dossier.section.inAction', 'gallery.dossier.inAction.studio', 'media.fleet.play', 'media.fleet.pause']) {
  assert.ok(!firstLoad.includes(`'${key}'`) && !firstLoad.includes(`"${key}"`), `${key} loads with the block, not with the page`);
  assert.ok(read('src/gallery/inAction.ts').includes(`'${key}'`) || read('src/ui/fleetTakes.ts').includes(`'${key}'`),
    `${key} is spelled where the scan finds it`);
}
assert.doesNotMatch(read('site/gallery.html'), /fleetTake|inAction/, 'the page markup carries none of the block');

uninstall();
if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator);
console.log('inAction.selftest: the In action block loads after the first tank, shows only a vehicle\'s own take, plays only '
  + 'while visible, stops with the vehicle and keeps the Gallery\'s first load and boot catalog unchanged');
