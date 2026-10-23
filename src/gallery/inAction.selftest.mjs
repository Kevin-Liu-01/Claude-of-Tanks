// inAction.selftest.mjs — the Tank Gallery dossier's take (src/gallery/inAction.ts over src/ui/fleetTakes.ts;
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
dom.respond('/media/site50-r14/fleet/index.json', { collection: 'site50-r14', vehicles: { t90sm_2013: fields, object148_proto: barns } });

const { mountInAction } = await import('./inAction.ts');
assert.deepEqual(dom.state.fetches, [], 'loading the block\'s module fetches nothing');
const frame = dom.document.createElement('div');
const actions = dom.document.createElement('div');
const block = mountInAction(frame, actions);
assert.deepEqual(dom.state.fetches, ['/media/site50-r14/fleet/index.json'], 'the index loads with the block');
const video = frame.querySelector('video');
const studio = actions.querySelector('a.take-studio');
assert.ok(video, 'the frame holds the take\'s player');
assert.equal(studio.hidden, true, 'no Studio link until a vehicle with a take is shown');
assert.equal(studio.getAttribute('aria-label'), 'Open in Studio');

block.show('t90sm_2013');
await settle();
assert.equal(frame.classList.contains('has-take'), true, 'a vehicle with a take shows it over the hero card');
assert.equal(frame.getAttribute('aria-label'), fields.title.en, 'the take\'s title names the frame');
assert.equal(studio.hidden, false);
assert.equal(studio.getAttribute('href'), `/studio?scene=${fields.scene}`, 'the take opens in the Studio as a preset');
assert.equal(video.src, '', 'no loop while the frame is off screen');
dom.intersect(frame, 0, true);
assert.equal(video.poster, fields.poster, 'the poster first');
dom.intersect(frame, 0.7);
assert.equal(video.src, fields.loop, 'visible: the loop plays');
assert.equal(video.paused, false);
dom.intersect(frame, 0, true);
assert.equal(video.paused, true, 'scrolled out of view: paused');
dom.intersect(frame, 0.7);

block.show(null);
assert.equal(frame.classList.contains('has-take'), false, 'a vehicle being replaced drops the take at once');
assert.equal(studio.hidden, true);
assert.equal(video.src, '', 'and releases its loop');
block.show('object148_proto');
await settle();
assert.equal(frame.getAttribute('aria-label'), barns.title.en);
assert.equal(video.src, barns.loop, 'the next vehicle\'s loop, while the frame stays on screen');
block.show('m1a1_abrams_hc');
await settle();
assert.equal(frame.classList.contains('has-take'), false, 'a vehicle the index lacks keeps its hero card');
assert.equal(studio.hidden, true);
assert.equal(video.src, '', 'and no loop');
block.show('t90sm_2013');
block.show('object148_proto');
block.show(null);
await settle();
assert.equal(frame.classList.contains('has-take'), false, 'only the latest selection is shown');
block.show('t90sm_2013');
block.show('object148_proto');
await settle();
assert.equal(frame.getAttribute('aria-label'), barns.title.en, 'a quick change of vehicle shows the last one');
assert.deepEqual([...(await block.ids)].sort(), ['object148_proto', 't90sm_2013'], 'the facet reads which vehicles have a take');
assert.equal(dom.state.fetches.length, 1, 'one index request for the page');

// Wiring: gallery.ts loads the block after the first tank, mounts it in the dossier's take frame and stops it with the tank.
const gallery = read('src/gallery/gallery.ts');
assert.match(gallery, /^import type \{ InActionBlock \} from '\.\/inAction\.ts';$/m, 'the block is typed, not imported, at load');
assert.match(gallery, /import\('\.\/inAction\.ts'\)/, 'it loads through import()');
assert.match(gallery, /mountInAction\(takeMedia, \$<HTMLElement>\('#takeActions'\)\)/, 'in the dossier\'s take frame');
assert.match(read('site/gallery.html'), /<div class="take-media" id="takeMedia"/);
assert.match(gallery, /function disposeTank\(\): void \{\n\s+inAction\?\.show\(null\);/, 'the outgoing vehicle\'s take stops first');
const loadTank = gallery.slice(gallery.indexOf('async function loadTank('), gallery.indexOf('function pickInspection('));
const order = ["loadingState.classList.add('hidden');", 'if (version === loadVersion) showInAction(id);', 'await loadDamageLab();'];
assert.deepEqual(order.map((step) => loadTank.indexOf(step) >= 0), [true, true, true], 'loadTank shows the take');
assert.ok(order.every((step, index) => index === 0 || loadTank.indexOf(order[index - 1]) < loadTank.indexOf(step)),
  'once the tank is on screen, before the damage lab loads');
const closure = staticImportClosure('src/gallery/gallery.ts', { root: ROOT });
for (const lazy of ['src/gallery/inAction.ts', 'src/ui/fleetTakes.ts']) {
  assert.ok(!closure.has(lazy), `the Gallery's first load never includes ${lazy}`);
}
const css = read('src/gallery/gallery.css');
assert.match(css, /\[hidden\]\{display:none!important\}/, 'a hidden loop or control stays hidden');
assert.match(css, /\.take-media\.has-take :is\(\.hc-flag,\.hc-tank,\.take-still\)\{visibility:hidden\}/, 'a take covers the hero card');
assert.match(css, /@media \(\(pointer: coarse\) or \(hover: none\)\)\{\s*:root body \.take-actions a,:root body \.take-media \.fleet-take-toggle\{width:44px;height:44px\}/, 'touch-size controls');

// The page catalog (tools/i18n-page-catalogs.mjs): no module of the Gallery's first load spells the block's strings, so
// they ride its lazy chunk, not its boot catalog.
const firstLoad = [...closure.keys()].filter((file) => /\.(?:ts|mjs)$/.test(file)).map(read).join('\n');
for (const key of ['gallery.dossier.inAction.studio', 'media.fleet.play', 'media.fleet.pause']) {
  assert.ok(!firstLoad.includes(`'${key}'`) && !firstLoad.includes(`"${key}"`), `${key} loads with the block, not with the page`);
  assert.ok(read('src/gallery/inAction.ts').includes(`'${key}'`) || read('src/ui/fleetTakes.ts').includes(`'${key}'`),
    `${key} is spelled where the scan finds it`);
}
assert.doesNotMatch(read('site/gallery.html'), /fleetTake|inAction/, 'the page markup carries none of the block');

uninstall();
if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator);
console.log('inAction.selftest: the dossier take loads after the first tank, shows only a vehicle\'s own take, plays only '
  + 'while visible, stops with the vehicle and keeps the Gallery\'s first load and boot catalog unchanged');
