// referenceTakes.selftest.mjs — the field manual's fleet reference shows each vehicle's own take (src/docs/referenceTakes.ts
// over src/ui/fleetTakes.ts; owner 2026-10-12). The manual presents a single vehicle only as a record of /docs/vehicles'
// reference: the first opening of a record loads the takes (never the page itself), a vehicle the index has gains its
// "In action" figure once, a vehicle it lacks shows nothing, and the loop plays only while the open record is on screen.
// The fixture index is fake and lives only here; its files are the site fifty's s21.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFakeDom, settle } from '../ui/fleetTakes.test-support.mjs';
import { staticImportClosure } from '../../tools/static-import-closure.mjs';
import { scanPageCatalogs } from '../../tools/i18n-page-catalogs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const dom = createFakeDom();
const uninstall = dom.install();
const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'en-US', languages: ['en-US'] } });

const take = {
  take: 's60-fixture-fields', map: 'verdant',
  title: { en: 'A T-90SM wedge assaults through the burning fields', zh: '一组 T-90SM 楔形编队冲过燃烧的田野' },
  short: { en: 'T-90SM wedge assault', zh: 'T-90SM 楔形突击' },
  loop: '/media/site50-r14/loops/s21-fields-assault.webm',
  poster: '/media/site50-r14/loops/s21-fields-assault.jpg',
  scene: '/media/site50-r14/scenes/s21-fields-assault.scene.json',
};
dom.respond('/media/site50-r14/fleet/index.json', { collection: 'site50-r14', vehicles: { t90sm: take } });

const { watchVehicleTakes } = await import('./referenceTakes.ts');
const records = dom.document.createElement('div');
const record = (vehicle) => {
  const details = dom.document.createElement('details');
  details.className = 'manual-record';
  if (vehicle) details.setAttribute('data-vehicle', vehicle);
  details.append(dom.document.createElement('summary'), dom.document.createElement('dl'));
  records.append(details);
  return details;
};
const toggle = (details, open) => { details.open = open; details.dispatchEvent({ type: 'toggle' }); };
const withTake = record('t90sm');
const withoutTake = record('m1a2');
const notAVehicle = record('');
watchVehicleTakes(records);
await settle();
assert.deepEqual(dom.state.fetches, [], 'the reference loads no takes until a record opens');

toggle(notAVehicle, true);
await settle();
assert.deepEqual(dom.state.fetches, [], 'a record without a vehicle loads nothing');
toggle(withTake, true);
await settle(16);
assert.deepEqual(dom.state.fetches, ['/media/site50-r14/fleet/index.json'], 'the first opening loads the index');
const figure = withTake.querySelector('.manual-take');
assert.ok(figure, 'the vehicle gains its take');
assert.equal(withTake.children.at(-1), figure, 'under the record\'s values');
assert.equal(figure.querySelector('.manual-take-label').textContent, 'In action');
assert.equal(figure.querySelector('.fleet-take-title').textContent, take.title.en, 'captioned with the take\'s title');
assert.equal(figure.querySelector('.fleet-take-studio').getAttribute('href'), `/studio?scene=${take.scene}`, 'opens in the Studio');
assert.equal(figure.querySelector('.fleet-take-studio').textContent, 'Open in the Studio');
assert.equal(withTake.dataset.take, take.take);

const frame = figure.querySelector('.fleet-take-frame');
const video = frame.querySelector('video');
assert.equal(video.src, '', 'no loop before the open record is on screen');
dom.intersect(frame, 0.8);
assert.equal(video.poster, take.poster);
assert.equal(video.src, take.loop, 'on screen: the loop plays');
toggle(withTake, false);
dom.intersect(frame, 0, false); // a closed record's content leaves the layout
assert.equal(video.paused, true, 'closing the record stops the loop');
toggle(withTake, true);
await settle(16);
assert.equal(withTake.querySelectorAll('.manual-take').length, 1, 'reopening keeps the one figure');

toggle(withoutTake, true);
await settle(16);
assert.equal(withoutTake.querySelector('.manual-take'), null, 'a vehicle the index lacks shows nothing');
assert.equal(withoutTake.dataset.take, 'none');
assert.equal(dom.state.fetches.length, 1, 'the index loads once per page');

// (A missing or malformed index reads as no takes at all: src/ui/fleetTakes.selftest.mjs.)

// Wiring: reference.ts marks every vehicle record and watches the list; the manual's graph stays lazy.
const reference = read('src/docs/reference.ts');
assert.match(reference, /<details class="manual-record" data-vehicle="\$\{escape\(v\.id\)\}"/, 'each vehicle record names its spec id');
assert.match(reference, /\.join\(''\);\n\s+watchVehicleTakes\(records\);/, 'the vehicles reference watches its records');
assert.equal(reference.match(/watchVehicleTakes\(/g).length, 1, 'only the vehicles reference');
const data = JSON.parse(read('src/docs/reference.generated.json'));
assert.equal(new Set(data.vehicles.map((vehicle) => vehicle.id)).size, data.vehicles.length, 'one record per vehicle id');
assert.match(read('src/docs/topics.ts'), /void import\('\.\/reference\.ts'\)/, 'the reference itself loads on demand');
for (const entry of ['src/docs/topics.ts', 'src/docs/reference.ts', 'src/docs/referenceTakes.ts']) {
  assert.ok(!staticImportClosure(entry, { root: ROOT }).has('src/ui/fleetTakes.ts'), `${entry} never loads the takes statically`);
}
assert.ok(!staticImportClosure('src/docs/topics.ts', { root: ROOT }).has('src/docs/referenceTakes.ts'));
const docsCss = read('src/docs/docs.css');
assert.match(docsCss, /\.manual-take \[hidden\]\{display:none!important\}/, 'a hidden loop or control stays hidden');
assert.match(docsCss, /\.manual-take \.fleet-take-toggle\{[^}]*width:44px;height:44px/, 'a full-size play control');

// The page catalog: the figure's strings ride the manual's lazy chunk, not its boot catalog.
const scan = scanPageCatalogs({ root: ROOT, pages: ['site/docs-vehicles.html'] });
assert.deepEqual(scan.issues, [], 'no raw key on the manual');
const { keys, lazyKeys } = scan.catalogs.docsTopic;
for (const key of ['docs.reference.inAction', 'docs.reference.openStudio', 'media.fleet.play', 'media.fleet.pause']) {
  assert.ok(lazyKeys.includes(key) && !keys.includes(key), `${key} loads with the reference, not with the page`);
}

uninstall();
if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator);
console.log('referenceTakes.selftest: a record\'s first opening loads its take, once; no take shows nothing; the loop plays '
  + 'only while the open record is on screen; the manual stays lazy');
