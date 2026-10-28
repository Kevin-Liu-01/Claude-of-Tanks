import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { sceneLinkPath } from '../game/studioSceneLink.ts';
import { PRODUCTION_PRESETS, productionAspect } from '../game/studioProduction.ts';
import { sequenceTemplates, takeTemplates } from './studioTemplates.ts';
import { resolveTankId, TANK_IDS } from '../vehicles/tankIdAliases.ts';
import { notice } from './components/notice.ts';
import { wireRovingKeys } from './components/components.ts';
import { pickerText } from './pickerText.ts';
import { tankThumbUrl } from './icons.ts';
import { t } from './i18n.ts';
import { SCENE_LINK_GLYPHS, browserSceneLinkEnv, copySceneLink } from './studioSceneLinkUi.ts';
import { uiIconSVG } from './uiIcons.ts';

// Exercise the actual DOM adapter with a small browser port. The renderer remains
// outside this test: only user intent, asynchronous locking and exact export
// options are owned by this UI.
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.events = {}; this.style = { setProperty() {} }; this.value = ''; this.disabled = false; this.textContent = ''; }
  append(...children) { this.children.push(...children); }
  prepend(...children) { this.children.unshift(...children); }
  replaceChildren(...children) { this.replacements = (this.replacements || 0) + 1; this.children = children; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(type, handler) { this.events[type] = handler; }
  focus() { document.activeElement = this; }
  querySelectorAll(selector) {
    if (selector.startsWith(':scope >')) return this.children.filter((child) => child.dataset.group && (!selector.includes('="') || child.dataset.group === selector.split('="')[1].split('"')[0]));
    const all = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
    return selector === 'button' ? all.filter(child => child.tagName === 'button') : all;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  fire(type) { if (type !== 'click' || !this.disabled) this.events[type]?.({ preventDefault() {}, key: '' }); }
}
const document = { createElement: tag => new Element(tag), activeElement: null, body: new Element('body') };
const viewportEvents = [];
const window = { dispatchEvent: event => viewportEvents.push({ type: event.type, mode: document.body.dataset.studioWorkspace }) };
let locale = 'en-US';
const presets = [
  { id: 'one', map: 'coastal', title: 'First film', description: 'First sequence', durationMs: 12000, timeOfDay: 'day', category: 'showcase',
    shots: ['Opening', 'Tracking', 'Reveal'] },
  { id: 'two', map: 'desert', title: 'Second film', description: 'Second sequence', durationMs: 15000, timeOfDay: 'night', category: 'combat',
    shots: ['Opening', 'Exchange', 'Aftermath'] },
];
const source = readFileSync(new URL('./studioProductionPanel.ts', import.meta.url), 'utf8');
const executable = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, '').replace(/^export /gm, ''));
// The site's takes (the Director's second library): a small index, one scene, and a take whose scene is on another
// origin, which a scene link must refuse.
// The fixture names vehicles in today's ids, so it carries today's tank id schema (an unstamped index is schema 1).
const siteIndex = { tankIdSchema: TANK_IDS.schema, takes: [
  { id: 's01-street', title: { en: 'A tank pushes up the street', zh: '坦克沿街推进' }, short: { en: 'Street push', zh: '街道推进' },
    map: 'urban', durationMs: 6600, scene: '/media/site50-r14/scenes/s01-street.scene.json', thumb: '/media/site50-r14/stills/s01-street-thumb.webp' },
  { id: 's02-foreign', title: { en: 'Elsewhere', zh: '别处' }, short: { en: 'Elsewhere', zh: '别处' },
    map: 'desert', durationMs: 6600, scene: 'https://example.com/take.scene.json', thumb: '/media/site50-r14/stills/s02-foreign-thumb.webp' },
] };
// Every tank's own take (owner 2026-10-12): fleet entries join the same index (group 'fleet', the vehicle's spec id) and
// are the template browser's (its Every tank chip and its search), never the shelf's.
const SPEC_NAMES = { t90sm_2013: 'T-90SM', m1a1_abrams_hc: 'M1A2 Abrams', leo1: 'Leopard 1', leo2a2: 'Leopard 2A4', leo2a4_v: 'Leopard 2A5',
  leo2a4: 'Leopard 2A6', leo2_improved: 'Leopard 2A7V', leo2pl: 'Leopard 2PL', leo2a8: 'Leopard 2A8' };
const fleetEntry = (vehicle, index) => ({ id: `s${60 + index}-fleet-${vehicle}`, group: 'fleet', vehicle,
  title: { en: `A ${SPEC_NAMES[vehicle]} in action`, zh: `${SPEC_NAMES[vehicle]} 实战` }, short: { en: SPEC_NAMES[vehicle], zh: SPEC_NAMES[vehicle] },
  map: index % 2 ? 'fjord' : 'verdant', durationMs: 6600, scene: `/media/site50-r14/scenes/s${60 + index}-fleet-${vehicle}.scene.json`,
  ...(vehicle === 'leo2a8' ? {} : { thumb: `/media/site50-r14/fleet/${vehicle}.jpg` }) });
siteIndex.takes.push(...Object.keys(SPEC_NAMES).map(fleetEntry));
const takeScene = { map: 'urban', actors: [{ id: 'leo2a4', name: 'hero' }] };
const fetches = [];
const fetch = (url) => {
  fetches.push(url);
  const body = url.endsWith('/scenes/index.json') ? siteIndex : takeScene;
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
};
// the template browser (studioTemplateSheet.ts) needs the top layer: a stand-in records what it was opened with
const sheets = [];
const createTemplateSheet = (options) => {
  const sheet = { options, opened: [], open(items, value) { sheet.opened.push({ items, value }); }, close() {}, isOpen: false };
  sheets.push(sheet);
  return sheet;
};
// the picker menu (pickerMenu.ts) needs the top layer: a stand-in records its options and chooses through them
const menus = {};
const createPickerMenu = (host, options) => {
  const trigger = document.createElement('button');
  trigger.dataset.pickerMenu = options.id;
  host.append(trigger);
  const menu = { options, trigger, value: options.value, setItems() {}, setValue(id) { menu.value = id; },
    setDisabled(disabled) { trigger.disabled = disabled; }, open() {}, close() {}, dispose() {},
    choose(id) { menu.value = id; options.onChoose(options.items.find((item) => item.id === id) ?? { id, name: id }); } };
  menus[options.id] = menu;
  return menu;
};
const productionPreset = (id) => presets.find((preset) => preset.id === id);
const context = { document, window, Event, createPickerMenu, createTemplateSheet, pickerText, PRODUCTION_PRESETS: presets, productionAspect, productionPreset,
  productionShotNames: (preset) => preset.shots, sequenceTemplates, takeTemplates, getLocale: () => locale, console, Promise, Error, fetch,
  sceneLinkPath, t, resolveTankId, SCENE_LINK_GLYPHS, browserSceneLinkEnv, copySceneLink, notice, uiIconSVG, wireRovingKeys,
  tankThumbUrl };
runInNewContext(`${executable}\nglobalThis.mount = mountStudioProductionPanel; globalThis.label = productionLabel; globalThis.siteTakes = siteTakes;`, context);
const calls = [];
let resolveStage, rejectStage;
const S = {
  productionFormat: 'landscape',
  TANK_IDS: ['m1a1_abrams_hc'], getMapInfo: id => ({ name: id }),
  getSpecInfo: id => { if (!SPEC_NAMES[id]) throw new Error(`unknown vehicle ${id}`); return { name: SPEC_NAMES[id] }; },
  _internal: { actors: [{}] }, fxTimeMs: 0, durationMs: 12000, playing: false, selectedShotId: 'a',
  recordingStatus: () => ({ active: false, supported: true }),
  getStoryboard: () => ({ shots: [{ id: 'a', label: 'Opening', tMs: 0 }, { id: 'b', label: 'Tracking', tMs: 4000 }] }),
  directProduction: options => { calls.push(['stage', options]); return new Promise((resolve, reject) => { resolveStage = resolve; rejectStage = reject; }); },
  capture: options => { calls.push(['capture', options]); },
  recordVideo: options => { calls.push(['video', options]); return Promise.resolve({ size: 4000 }); },
  stopRecording() { calls.push(['stopRecording']); },
  play() { this.playing = true; calls.push(['play']); }, pause() { this.playing = false; calls.push(['pause']); },
  stop() { this.playing = false; calls.push(['stop']); }, seek(time) { this.fxTimeMs = time; calls.push(['seek', time]); },
  selectCameraShot(id) { this.selectedShotId = id; calls.push(['shot', id]); },
  addCameraShot() { calls.push(['saveCamera']); },
  setProductionFormat(format) { this.productionFormat = format; calls.push(['format', format]); },
  applyProductionCamera(rig) { calls.push(['rig', rig]); }, setCamera(camera) { calls.push(['camera', camera]); },
  load(json) { calls.push(['load', json]); return Promise.resolve(json); },
};
const root = new Element('div'), dock = new Element('div'); root.append(dock);
const panelSource = readFileSync(new URL('./studioPanel.ts', import.meta.url), 'utf8');
// Read the integration's real group ids, including automation overrides. This
// catches a workspace tab silently targeting a group that the panel renamed.
const integratedGroups = [...panelSource.matchAll(/const (\w+Group) = panelGroup\('[^']+', '([^']+)'/g)].map(([, variable, id]) => {
  const override = panelSource.match(new RegExp(variable + "\\.root\\.dataset\\.group = '([^']+)'"));
  return override?.[1] ?? id;
});
assert.equal(integratedGroups.length, 5);
for (const id of integratedGroups) { const group = new Element('section'); group.dataset.group = id; dock.append(group); }
// what an action did reaches the Studio's toast (the kit's notices), never a status line of the panel's own
const notices = [];
const panel = context.mount(S, root, dock, () => calls.push(['refresh']), { notice: (...args) => notices.push(args) });
const all = () => root.querySelectorAll('*');
const byData = (key, value = '') => all().find(element => element.dataset[key] === value);
const byText = text => all().find(element => element.tagName === 'button' && element.textContent === text);
const tick = async () => { for (let index = 0; index < 5; index++) await Promise.resolve(); };
assert.equal(byData('workspace', 'director').attributes['aria-selected'], 'true');
assert.equal(document.body.dataset.studioWorkspace, undefined, 'constructing the hidden UI never resizes the game');
panel.setVisible(true);
assert.equal(document.body.dataset.studioWorkspace, 'open');
byText('Hide controls').fire('click');
assert.equal(document.body.dataset.studioWorkspace, 'collapsed');
byText('Show controls').fire('click');
assert.equal(document.body.dataset.studioWorkspace, 'open');
panel.setVisible(false);
assert.equal(document.body.dataset.studioWorkspace, undefined, 'exit releases the shared renderer container');
assert.deepEqual(viewportEvents.map(event => event.mode), ['open', 'collapsed', 'open', undefined], 'layout notification follows each actual state update');
assert.ok(viewportEvents.every(event => event.type === 'cot:layoutchange'));
assert.match(panelSource, /show\(\)\s*\{[^}]*productionPanel\.setVisible\(true\)/, 'Studio show owns viewport entry');
assert.match(panelSource, /hide\(\)\s*\{[^}]*productionPanel\.setVisible\(false\)/, 'Studio hide always restores viewport');
for (const [workspace, group] of [['director', 'director'], ['battlefield', 'battlefield'], ['tanks', 'tanks'], ['effects', 'effects'], ['cinematics', 'global'], ['output', 'output']]) {
  byData('workspace', workspace).fire('click');
  const visible = dock.children.filter(element => element.dataset.group && !element.hidden);
  assert.equal(visible.length, 1, `${workspace} opens exactly one real panel`);
  assert.equal(visible[0].dataset.group, group);
  assert.equal(byData('workspace', workspace).attributes['aria-controls'], visible[0].id);
}
byData('workspace', 'effects').fire('click');
assert.equal(byData('group', 'effects').hidden, false);
assert.equal(byData('group', 'director').hidden, true);
// The shelf: the sequences, then the site's filmed scenes once the index arrives (fetched once, when the Studio opens); a
// scene's card stages its scene through S.load, as Load JSON does; a scene on another origin is never fetched. (Each step
// chains fetch, json and load: two ticks.)
await tick();
assert.deepEqual(fetches, ['/media/site50-r14/scenes/index.json'], 'the takes index is fetched once, when the Studio opens');
const shelf = all().find(element => element.className === 'production-library');
assert.deepEqual(shelf.children.map(card => card.dataset.productionPreset ?? card.dataset.siteTake), ['one', 'two', 's01-street', 's02-foreign'],
  'the shelf lays out the sequences, then the filmed scenes; every tank\'s take waits in the browser');
const streetTake = byData('siteTake', 's01-street');
assert.ok(streetTake.children.some(child => child.textContent === 'Street push'), 'a card carries the take\'s short title');
assert.ok(streetTake.children.some(child => child.textContent === t('map.urban')), 'and its map, in the reader\'s language');
assert.ok(byData('productionPreset', 'two').children.some(child => child.textContent === t('studio.ws.seconds', { s: '15' })), 'a sequence card carries its length');
streetTake.fire('click'); await tick(); await tick();
assert.equal(fetches.at(-1), '/media/site50-r14/scenes/s01-street.scene.json', 'a card fetches its own scene');
assert.deepEqual(calls.filter(call => call[0] === 'load').map(call => call[1]), [takeScene], 'the take is staged through the Studio\'s load');
assert.equal(streetTake.attributes['aria-pressed'], 'true', 'the staged take is marked');
assert.deepEqual(notices.at(-1), ['Take staged as filmed. Play it, change it, or film it again.', 'info']);
byData('siteTake', 's02-foreign').fire('click'); await tick(); await tick();
assert.ok(!fetches.includes('https://example.com/take.scene.json'), 'a scene on another origin is refused');
assert.equal(calls.filter(call => call[0] === 'load').length, 1);
// The browser: one set of every template (the sequences, the scenes, every tank's own take), opened on the one staged
// last, by the Director's door or the feature card.
const sheet = sheets[0];
assert.ok(sheet, 'the Director builds one template browser');
assert.deepEqual([...sheet.options.filters].map((filter) => filter.id), ['sequence', 'scene', 'tank', 'showcase', 'combat', 'environment', 'night']);
assert.equal(byData('productionBrowse').children[0].textContent, t('studio.director.ui.browse', { count: 2 + 2 + 9 }), 'the door counts every template');
byData('productionBrowse').fire('click');
const opened = sheet.opened.at(-1);
assert.equal(opened.value, 'take:s01-street', 'the browser opens on the template staged last');
assert.deepEqual([...opened.items].map((item) => item.kind).filter((kind, i, list) => list.indexOf(kind) === i), ['sequence', 'scene', 'tank']);
assert.equal(opened.items.length, 13);
const leopard = opened.items.find((item) => item.id === 'take:s65-fleet-leo2a4');
assert.equal(leopard.name, 'Leopard 2A6', 'a tank\'s take is named for its tank');
assert.equal(leopard.loop, '/media/site50-r14/fleet/leo2a4.webm', 'and plays its own loop in the preview');
assert.ok(leopard.tags.includes('tank'));
assert.equal(opened.items.find((item) => item.id === 'seq:two').tags.includes('night'), true, 'a night sequence answers the Night chip');
assert.deepEqual([...opened.items.find((item) => item.id === 'seq:one').acts].map(([name]) => name), ['Opening', 'Tracking', 'Reveal'], 'a sequence lists its acts');
const loadsBefore = calls.filter(call => call[0] === 'load').length;
sheet.options.onChoose(leopard); await tick(); await tick();
assert.equal(fetches.at(-1), '/media/site50-r14/scenes/s65-fleet-leo2a4.scene.json', 'a tank\'s take chosen in the browser fetches its scene');
assert.equal(calls.filter(call => call[0] === 'load').length, loadsBefore + 1, 'and stages it as filmed');
assert.equal(streetTake.attributes['aria-pressed'], 'false', 'the shelf no longer marks the scene before it');
byData('productionFeature').fire('click');
assert.equal(sheet.opened.at(-1).value, 'take:s65-fleet-leo2a4', 'the feature card is the browser\'s door too');
panel.setVisible(true); panel.setVisible(false); await tick();
assert.equal(fetches.filter(url => url.endsWith('/scenes/index.json')).length, 1, 'reopening the Studio does not fetch the index again');
// The shipped index is unstamped (schema 1): its t90sm is the T-90SM obr. 2013, today's t90sm_2013, and its t90sm_x is
// the T-90SM X, today's t90sm; read through the stamp, neither offers the other tank's take (SSOT 2.19).
{
  const fleetTake = (vehicle) => ({ id: `fleet-${vehicle}`, group: 'fleet', vehicle });
  const legacy = context.siteTakes({ takes: [fleetTake('t90sm'), fleetTake('t90sm_x'), { id: 's01', vehicle: 'm1a2' }] });
  assert.deepEqual(legacy.map((take) => [take.id, take.vehicle]),
    [['fleet-t90sm', resolveTankId('t90sm', 1)], ['fleet-t90sm_x', resolveTankId('t90sm_x', 1)], ['s01', 'm1a2']], 'an unstamped index is schema 1');
  const current = context.siteTakes({ tankIdSchema: TANK_IDS.schema, takes: [fleetTake('t90sm')] });
  assert.equal(current[0].vehicle, 't90sm', 'a current index is read as written');
}
// the frame and the lens are the kit's segmented controls (a radio per option), every choice in view
const frame = byData('productionFormat', 'portrait'); frame.fire('click');
assert.ok(calls.some(call => call[0] === 'format' && call[1] === 'portrait'), 'format selection informs the runtime camera framing');
assert.equal(frame.attributes['aria-checked'], 'true', 'the chosen frame is the checked radio');
assert.deepEqual(all().filter((element) => element.dataset.productionFormat).map((element) => element.dataset.productionFormat),
  ['landscape', 'portrait', 'square', 'card'], 'the frames include the 1.91:1 card');
const featuredTank = menus['studio-featured-tank'];
assert.equal(featuredTank.options.items[0].id, 'default', "the Director's default leads");
featuredTank.choose('m1a1_abrams_hc');
assert.equal(sheet.options.stars(), t('studio.director.ui.stars', { tank: 'M1A2 Abrams' }), 'the browser says whom a sequence stars');
// a sequence's card stages it at once, casting the featured tank
byData('productionPreset', 'two').fire('click');
const stage = byData('productionStage'); stage.fire('click'); stage.fire('click');
assert.equal(calls.filter(call => call[0] === 'stage').length, 1, 'one scene transaction despite repeated clicks');
assert.equal(JSON.stringify(calls.find(call => call[0] === 'stage')[1]), JSON.stringify({ presetId: 'two', format: 'portrait', vehicleId: 'm1a1_abrams_hc' }));
assert.equal(frame.disabled, true, 'the format cannot race a scene build');
resolveStage(); await tick();
assert.equal(stage.disabled, false, 'staging releases its controls on success');
stage.fire('click'); rejectStage(new Error('GPU unavailable')); await tick();
assert.equal(stage.disabled, false, 'staging releases its controls on rejection');
assert.deepEqual(notices.at(-1), ['GPU unavailable', 'error'], 'a failure is the toast\'s error');
assert.ok(!all().some(element => /production-status/.test(element.className ?? '')), 'the panel keeps no status line of its own');
byText('Capture PNG').fire('click'); await tick();
assert.equal(JSON.stringify(calls.find(call => call[0] === 'capture')[1]), JSON.stringify({ width: 2160, height: 3840, download: true }));
byText('Record film').fire('click'); await tick();
assert.equal(JSON.stringify(calls.find(call => call[0] === 'video')[1]), JSON.stringify({ fps: 30, download: true }), 'native recorder receives no unsupported resizing options');
byData('productionShot', 'b').fire('click'); assert.ok(calls.some(call => call[0] === 'seek' && call[1] === 4000));
byData('productionRig', 'rear').fire('click');
assert.deepEqual(calls.slice(-4).map(call => call[0]), ['pause', 'rig', 'saveCamera', 'refresh'], 'rig pose is saved before refresh can resample the timeline');
const lens = byData('productionLens', '28'); lens.fire('click');
assert.deepEqual(calls.slice(-4).map(call => call[0]), ['pause', 'camera', 'saveCamera', 'refresh'], 'lens edit is saved at the playhead before timeline refresh');
const shots = all().find(element => element.className === 'production-shots'); const count = shots.replacements;
panel.refresh(); panel.refresh(); assert.equal(shots.replacements, count, 'unchanged timeline does not rebuild shot buttons');
S.recordingStatus = () => ({ active: true, supported: true }); panel.refresh();
assert.equal(stage.disabled, true); assert.equal(byText('Stop recording').disabled, false);
assert.equal(byText('Hide controls').disabled, true, 'recording keeps a stable native canvas size');
assert.equal(byData('siteTake', 's01-street').disabled, true, 'a take cannot be loaded over a recording');
assert.equal(byData('productionBrowse').disabled, true, 'nor the browser opened');
const openedBefore = sheet.opened.length; byData('productionBrowse').fire('click');
assert.equal(sheet.opened.length, openedBefore);
S.productionFormat = 'square'; panel.refresh();
assert.equal(byData('productionFormat', 'square').attributes['aria-checked'], 'true', 'loading or scripting a different format synchronizes the export selector');
const zhCatalog = JSON.parse(readFileSync(new URL('./i18nCatalog.zh-CN.json', import.meta.url), 'utf8'));
assert.equal(context.label('director'), 'Director');
assert.equal(zhCatalog['studio.director.ui.director'], '导演台', 'the Director\'s words are in both catalogs');
// Every sequence shows its own frame (public/media/studio-r1, rendered by the engine with the Studio chrome hidden): a
// 640 x 400 card and a 1280 x 800 preview, sized, with the battlefield's card behind a missing still.
const studioMedia = JSON.parse(readFileSync(new URL('../../public/media/studio-r1/manifest.json', import.meta.url), 'utf8'));
assert.match(source, /photo\.addEventListener\('error', \(\) => \{ photo\.src = `\/maps\/cards\/\$\{template\.map\}\.webp`; \}, \{ once: true \}\);/,
  'a missing still falls back to the battlefield card once');
for (const preset of PRODUCTION_PRESETS.map((entry) => entry.id)) {
  for (const [width, height] of [[640, 400], [1280, 800]]) {
    const item = studioMedia.items.find((entry) => entry.preset === preset && entry.width === width);
    assert.ok(item && item.src === `/media/studio-r1/sequence-${preset}-${width}.webp` && item.height === height,
      `the studio-r1 manifest carries ${preset}'s ${width} x ${height} frame`);
  }
}
console.log('studioProductionPanel.selftest: workspace selection, the templates (shelf, browser, every tank\'s take), staging races, exports, transport, recording locks and localization passed');
