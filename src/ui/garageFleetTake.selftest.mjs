// garageFleetTake.selftest.mjs — the Garage's battle gallery shows the selected tank's own take (garage.ts's featured
// panel over src/ui/fleetTakes.ts; owner 2026-10-12). The panel's real code runs here on a small browser port: a
// pristine Garage loads nothing before it is playable, a hidden panel never fetches the index or decodes a loop, a tank
// the index has replaces the stills rotation with its poster and loop, a tank it lacks (or a missing index) keeps the
// rotation, and the loop pauses with the panel. The fixture index is fake and lives only here.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { createFakeDom, settle } from './fleetTakes.test-support.mjs';
import { runtimeImportSpecifiers } from '../../tools/static-import-closure.mjs';
import { t } from './i18n.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const garage = read('src/ui/garage.ts');
const start = garage.indexOf('  const featuredPanel = (() => {');
const end = garage.indexOf('\n  })();\n', start);
assert.ok(start > 0 && end > start, 'garage.ts holds the battle gallery panel');
const panelSource = garage.slice(start, end + '\n  })();'.length);
assert.equal(panelSource.match(/import\(/g).length, 1, 'the panel\'s one dynamic import');
const executable = stripTypeScriptTypes(panelSource.replace("import('./fleetTakes.ts')", '__importFleetTakes()'));
const escapeStart = garage.indexOf('function escapeHtmlAttribute(');
const escapeHelper = stripTypeScriptTypes(garage.slice(escapeStart, garage.indexOf('\n}\n', escapeStart) + 2));
assert.ok(escapeStart > 0, 'garage.ts holds escapeHtmlAttribute');

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
dom.respond('/media/site50-r14/fleet/index.json', { collection: 'site50-r14', vehicles: { t90sm_2013: take } });
const SHOTS = [
  { img: '/media/site50-r14/stills/s21-fields-assault-close.webp', bootImg: '/media/site50-r14/stills/s21-fields-assault-boot.webp', capKey: 'media.site50.title.s21FieldsAssault' },
  { img: '/media/site50-r14/stills/s07-lake-shellfire.webp', capKey: 'media.site50.title.s07LakeShellfire' },
  { img: '/media/site50-r14/stills/s19-roof-tiles-close.webp', capKey: 'media.site50.title.s19RoofTiles' },
];

/** Construct one Garage panel; `module` is the fleet-takes module its import() resolves to. */
function mountPanel(module) {
  const root = dom.document.createElement('div');
  const column = dom.document.createElement('div');
  column.className = 'cot-leftcol';
  root.append(column);
  const harness = { preloads: [], imports: 0, idle: [], intervals: new Map(), nextInterval: 1, window: { __GAME_READY: false } };
  const context = {
    root, FEATURED_SHOTS: SHOTS, document: dom.document, t, uiIconSVG: () => '',
    requiredElement(parent, selector) {
      const element = parent.querySelector(selector);
      if (!element) throw new Error(`Garage markup is missing ${selector}`);
      return element;
    },
    preloadImage(url) { harness.preloads.push(url); return Promise.resolve(url); },
    window: harness.window,
    requestIdleCallback(callback) { harness.idle.push(callback); },
    setTimeout: dom.setTimeout, clearTimeout: dom.clearTimeout,
    setInterval(callback) { const id = harness.nextInterval++; harness.intervals.set(id, callback); return id; },
    clearInterval(id) { harness.intervals.delete(id); },
    IntersectionObserver: dom.IntersectionObserver,
    __importFleetTakes() { harness.imports++; return module(); },
    Promise, console,
  };
  // (the panel names its dots through garage.ts's escapeHtmlAttribute since the lead's 261 follow-up: its own source joins)
  runInNewContext(`${escapeHelper}\n${executable}\nglobalThis.featuredPanel = featuredPanel;`, context);
  harness.panel = context.featuredPanel;
  // the take sits under the dossier on the Garage root (brand-ui S2), not in the left column
  harness.element = root.querySelector('.cot-featured');
  harness.shot = root.querySelector('.fshot');
  harness.caption = root.querySelector('.fcap');
  harness.video = () => harness.shot.querySelector('video');
  harness.play = async () => {
    harness.window.__GAME_READY = true;
    dom.runTimers(); // the readiness poll hands activation to the idle queue
    for (const callback of harness.idle.splice(0)) callback();
    await settle();
  };
  return harness;
}

// 1. A pristine Garage: nothing before it is playable, wherever the panel is.
const garagePanel = mountPanel(() => import('./fleetTakes.ts'));
garagePanel.panel.setVehicle('t90sm_2013'); // createGarage's first selection
dom.intersect(garagePanel.shot, 1);
await settle();
assert.equal(garagePanel.imports, 0, 'the cold Garage loads no fleet-takes code');
assert.deepEqual(dom.state.fetches, [], 'and fetches no index');
assert.deepEqual(garagePanel.preloads, [], 'and decodes no art');
assert.equal(garagePanel.video(), null, 'and creates no video');

// 2. Playable but hidden (short, narrow or overlay layouts): the stills preview as before, no index, no loop.
dom.intersect(garagePanel.shot, 0);
await garagePanel.play();
assert.equal(garagePanel.imports, 0, 'a hidden panel loads no fleet-takes code');
assert.deepEqual(dom.state.fetches, [], 'and fetches no index');
assert.deepEqual(garagePanel.preloads, [SHOTS[0].bootImg], 'the rotation\'s small preview, as before');
assert.equal(garagePanel.caption.textContent, t(SHOTS[0].capKey));

// 3. The panel comes on screen: the index loads once and the selected tank's take replaces the rotation.
dom.intersect(garagePanel.shot, 1);
await settle();
assert.equal(garagePanel.imports, 1, 'the fleet-takes code loads on screen');
assert.deepEqual(dom.state.fetches, ['/media/site50-r14/fleet/index.json'], 'with the index');
assert.ok(garagePanel.element.classList.contains('vehicle'), 'the panel shows the tank\'s own take');
assert.equal(garagePanel.caption.textContent, '', 'no second name: the band names the tank (UI-LOCKDOWN G1)');
assert.equal(garagePanel.shot.dataset.tip, take.title.en, 'its full title in the hover tip');
const video = garagePanel.video();
assert.ok(video, 'a video joins the shot');
assert.equal(video.getAttribute('aria-hidden'), 'true');
dom.intersect(garagePanel.shot, 1); // the player's own observers report the visible panel
assert.equal(video.poster, take.poster, 'poster first');
assert.equal(video.src, take.loop, 'then the silent loop');
assert.equal(video.paused, false);

// The rotation stays suspended under the take; a click pauses the loop instead of advancing.
garagePanel.shot.dispatchEvent({ type: 'pointerenter' });
assert.equal(garagePanel.intervals.size, 0, 'no rotation timer over the take');
const preloads = garagePanel.preloads.length;
garagePanel.shot.click();
assert.equal(video.paused, true, 'a click on the shot pauses the take');
assert.equal(garagePanel.preloads.length, preloads, 'and loads no still');
const control = garagePanel.shot.querySelector('.fleet-take-toggle');
control.click();
assert.equal(video.paused, false, 'the play control resumes it, once');

// 4. A tank the index lacks: the rotation returns with its caption and timer; the loop is released.
garagePanel.panel.setVehicle('m1a1_abrams_hc');
assert.ok(!garagePanel.element.classList.contains('vehicle'), 'the stills return');
assert.equal(garagePanel.caption.textContent, t(SHOTS[0].capKey), 'with the still\'s caption');
assert.equal(garagePanel.shot.getAttribute('title'), null);
assert.equal(video.hidden, true, 'the take hides');
assert.equal(video.src, '', 'and its loop is released');
assert.equal(garagePanel.intervals.size, 1, 'the rotation resumes for a viewer who engaged it');
[...garagePanel.intervals.values()][0]();
await settle();
assert.equal(garagePanel.preloads.at(-1), SHOTS[1].img, 'and advances');
garagePanel.panel.setVehicle('t90sm_2013');
assert.equal(garagePanel.intervals.size, 0, 'the take suspends it again');
assert.equal(video.src, take.loop);
assert.equal(dom.state.fetches.length, 1, 'one index request for the Garage\'s life');

// 5. Battle hides the Garage: the loop pauses at once and is released after the grace.
dom.intersect(garagePanel.shot, 0);
assert.equal(video.paused, true, 'a hidden Garage pauses the loop');
dom.runTimers();
assert.equal(video.src, '', 'and releases it');
dom.intersect(garagePanel.shot, 1);
assert.equal(video.src, take.loop, 'back in the Garage it plays again');

// 6. A missing index (main until the media lane ships it): the rotation as before, forever.
const missing = mountPanel(() => import('./fleetTakes.ts?missing-index'));
dom.state.responses.clear();
missing.panel.setVehicle('t90sm_2013');
dom.intersect(missing.shot, 1);
await missing.play();
assert.equal(missing.imports, 1);
assert.ok(!missing.element.classList.contains('vehicle'), 'no index: no take');
assert.equal(missing.video(), null, 'and no video');
assert.equal(missing.caption.textContent, t(SHOTS[0].capKey), 'the rotation\'s first still');

// Wiring: the selection feeds the panel; nothing in src loads the takes statically; the styles keep hidden parts hidden.
assert.match(garage, /renderStats\(spec\);\n\s+featuredPanel\?\.setVehicle\(specId\);/, 'each selection reaches the panel');
assert.match(garage, /^import type \{ FleetTake, FleetTakeIndex, FleetTakePlayer \} from '\.\/fleetTakes\.ts';$/m);
// Only the Gallery's own lazy block imports the takes statically; every other surface reaches them through import().
const sources = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src/*.ts'],
  { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter((file) => file && file !== 'src/ui/fleetTakes.ts');
const staticImporters = sources.filter((file) => {
  const text = read(file);
  return text.includes('fleetTakes.ts') && runtimeImportSpecifiers(text, file)
    .some((specifier) => resolve(ROOT, dirname(file), specifier) === join(ROOT, 'src/ui/fleetTakes.ts'));
});
assert.deepEqual(staticImporters, ['src/gallery/inAction.ts'], 'the takes load only through import()');
assert.ok(sources.includes('src/ui/garage.ts') && sources.includes('src/docs/referenceTakes.ts'));
const css = read('src/ui/garage.css');
assert.match(css, /\.cot-featured\.vehicle \.fdots,\.cot-featured\.vehicle \.fnav\{display:none;\}/, 'one take: no rotation controls');
assert.match(css, /\.cot-featured \.fleet-take-video\[hidden\],\.cot-featured \.fleet-take-toggle\[hidden\]\{display:none;\}/);

uninstall();
if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator);
console.log('garageFleetTake.selftest: a pristine or hidden Garage loads no takes; on screen the selected tank\'s take replaces '
  + 'the rotation, which returns for a tank without one; the loop pauses with the Garage');
