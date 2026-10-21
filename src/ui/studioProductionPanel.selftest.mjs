import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { sceneLinkPath } from '../game/studioSceneLink.ts';
import { LAST_TANK_STORAGE_KEY } from '../game/tankIdStorageMigration.ts';
import { resolveTankId, TANK_IDS } from '../vehicles/tankIdAliases.ts';
import { t } from './i18n.ts';
import { SCENE_LINK_GLYPHS, browserSceneLinkEnv, copySceneLink } from './studioSceneLinkUi.ts';

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
  { id: 'one', map: 'coastal', title: 'First film', description: 'First sequence', durationMs: 12000, shots: ['Opening', 'Tracking'] },
  { id: 'two', map: 'desert', title: 'Second film', description: 'Second sequence', durationMs: 15000, shots: ['Opening'] },
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
// are reached by the Director's finder, never listed with the site's takes. Seven Leopards exceed one page of results.
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
const stored = new Map([[LAST_TANK_STORAGE_KEY, 't90sm_2013']]); // the tank last selected in the Garage
const localStorage = { getItem: (key) => stored.get(key) ?? null };
const context = { document, window, Event, PRODUCTION_PRESETS: presets, getLocale: () => locale, console, Promise, Error, fetch, sceneLinkPath,
  t, LAST_TANK_STORAGE_KEY, localStorage, resolveTankId, SCENE_LINK_GLYPHS, browserSceneLinkEnv, copySceneLink };
runInNewContext(`${executable}\nglobalThis.mount = mountStudioProductionPanel; globalThis.label = productionLabel; globalThis.siteFleetTakes = siteFleetTakes;`, context);
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
const panel = context.mount(S, root, dock, () => calls.push(['refresh']));
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
// The site's takes: listed once, the first time the Director opens; a card stages its scene through S.load, as Load
// JSON does; a scene on another origin is never fetched. (Each step chains fetch, json and load: two ticks.)
await tick();
assert.deepEqual(fetches, ['/media/site50-r14/scenes/index.json'], 'the takes index is fetched once, when the Studio opens');
const streetTake = byData('siteTake', 's01-street');
assert.ok(streetTake, 'each take of the index becomes a card');
assert.ok(streetTake.children.some(child => child.textContent === 'Street push'), 'a card carries the take\'s short title');
assert.ok(streetTake.children.some(child => child.textContent === 'urban'), 'and its map');
streetTake.fire('click'); await tick(); await tick();
assert.equal(fetches.at(-1), '/media/site50-r14/scenes/s01-street.scene.json', 'a card fetches its own scene');
assert.deepEqual(calls.filter(call => call[0] === 'load').map(call => call[1]), [takeScene], 'the take is staged through the Studio\'s load');
assert.equal(streetTake.attributes['aria-pressed'], 'true', 'the staged take is marked');
assert.ok(all().some(element => element.textContent === 'Take staged as filmed. Play it, change it, or film it again.'));
byData('siteTake', 's02-foreign').fire('click'); await tick(); await tick();
assert.ok(!fetches.includes('https://example.com/take.scene.json'), 'a scene on another origin is refused');
assert.equal(calls.filter(call => call[0] === 'load').length, 1);
// Every tank's own take: the fleet entries stay out of the site's list and are reached through the finder, a page of
// cards at a time; with no query it offers the take of the Director's featured tank, else the Garage's last tank.
const siteLibrary = all().find(element => element.className === 'production-library' && element.children.includes(streetTake));
assert.deepEqual(siteLibrary.children.map(card => card.dataset.siteTake), ['s01-street', 's02-foreign'], 'the default list is the site\'s takes');
const fleetSection = all().find(element => element.className === 'production-takes production-fleet');
assert.equal(fleetSection.hidden, false, 'an index with fleet takes shows the finder');
assert.ok(fleetSection.children.some(child => child.textContent === t('studio.director.fleet.intro', { count: 9 })), 'it counts the tanks');
const fleetCards = () => all().filter(element => element.dataset.siteTake?.includes('-fleet-'));
const fleetStatus = () => fleetSection.children.find(child => child.className === 'production-status').textContent;
assert.deepEqual(fleetCards().map(card => card.dataset.siteTake), ['s60-fleet-t90sm_2013'], 'the Garage tank\'s take, alone');
assert.equal(fleetStatus(), t('studio.director.fleet.yourTank'));
const search = byData('fleetSearch');
search.value = 'Leopard'; search.fire('input');
assert.equal(fleetCards().length, 6, 'a search shows one page of cards');
assert.equal(fleetStatus(), t('studio.director.fleet.more', { shown: 6, count: 7 }), 'and says how many more match');
search.value = 'fjord'; search.fire('input');
assert.deepEqual(fleetCards().map(card => card.dataset.siteTake), ['s61-fleet-m1a1_abrams_hc', 's63-fleet-leo2a2', 's65-fleet-leo2a4', 's67-fleet-leo2pl'],
  'a map finds the takes filmed on it');
assert.equal(fleetStatus(), '');
search.value = '2A8'; search.fire('input');
assert.equal(fleetCards()[0].children[0].src, '/maps/cards/verdant.webp', 'a take without a card picture shows its map');
search.value = 'zzz'; search.fire('input');
assert.equal(fleetCards().length, 0);
assert.equal(fleetStatus(), t('studio.director.fleet.none', { query: 'zzz' }));
search.value = ''; search.fire('input');
assert.deepEqual(fleetCards().map(card => card.dataset.siteTake), ['s60-fleet-t90sm_2013']);
const featuredTank = byData('productionTank');
featuredTank.value = 'leo2a4'; featuredTank.fire('change');
assert.deepEqual(fleetCards().map(card => card.dataset.siteTake), ['s65-fleet-leo2a4'], 'the Director\'s featured tank comes first');
featuredTank.value = ''; featuredTank.fire('change');
stored.clear(); search.fire('input');
assert.equal(fleetCards().length, 0, 'no tank selected anywhere: no card');
assert.equal(fleetStatus(), t('studio.director.fleet.hint'), 'but a hint');
stored.set(LAST_TANK_STORAGE_KEY, 't90sm_2013'); search.fire('input');
const loadsBefore = calls.filter(call => call[0] === 'load').length;
fleetCards()[0].fire('click'); await tick(); await tick();
assert.equal(fetches.at(-1), '/media/site50-r14/scenes/s60-fleet-t90sm_2013.scene.json', 'a fleet card fetches its own scene');
assert.equal(calls.filter(call => call[0] === 'load').length, loadsBefore + 1, 'and stages it as filmed');
assert.equal(fleetCards()[0].attributes['aria-pressed'], 'true');
search.value = 'T-90'; search.fire('input');
assert.equal(fleetCards()[0].attributes['aria-pressed'], 'true', 'the staged take stays marked through a new search');
assert.equal(streetTake.attributes['aria-pressed'], 'false');
search.value = ''; search.fire('input');
panel.setVisible(true); panel.setVisible(false); await tick();
assert.equal(fetches.filter(url => url.endsWith('/scenes/index.json')).length, 1, 'reopening the Studio does not fetch the index again');
// The shipped index is unstamped (schema 1): its t90sm is the T-90SM obr. 2013, today's t90sm_2013, and its t90sm_x is
// the T-90SM X, today's t90sm; read through the stamp, neither offers the other tank's take (SSOT 2.19).
{
  const fleetTake = (vehicle) => ({ id: `fleet-${vehicle}`, group: 'fleet', vehicle });
  const legacy = context.siteFleetTakes({ takes: [fleetTake('t90sm'), fleetTake('t90sm_x'), { id: 's01', vehicle: 'm1a2' }] });
  assert.deepEqual(legacy.map((take) => [take.id, take.vehicle]),
    [['fleet-t90sm', resolveTankId('t90sm', 1)], ['fleet-t90sm_x', resolveTankId('t90sm_x', 1)]], 'an unstamped index is schema 1');
  const current = context.siteFleetTakes({ tankIdSchema: TANK_IDS.schema, takes: [fleetTake('t90sm')] });
  assert.equal(current[0].vehicle, 't90sm', 'a current index is read as written');
}
byData('productionPreset', 'two').fire('click');
const frame = byData('productionFormat'); frame.value = 'portrait'; frame.fire('change');
assert.ok(calls.some(call => call[0] === 'format' && call[1] === 'portrait'), 'format selection informs the runtime camera framing');
byData('productionTank').value = 'm1a1_abrams_hc';
const stage = byData('productionStage'); stage.fire('click'); stage.fire('click');
assert.equal(calls.filter(call => call[0] === 'stage').length, 1, 'one scene transaction despite repeated clicks');
assert.equal(JSON.stringify(calls.find(call => call[0] === 'stage')[1]), JSON.stringify({ presetId: 'two', format: 'portrait', vehicleId: 'm1a1_abrams_hc' }));
assert.equal(frame.disabled, true, 'the format cannot race a scene build');
resolveStage(); await tick();
assert.equal(stage.disabled, false, 'staging releases its controls on success');
stage.fire('click'); rejectStage(new Error('GPU unavailable')); await tick();
assert.equal(stage.disabled, false, 'staging releases its controls on rejection');
assert.ok(all().some(element => element.textContent === 'GPU unavailable' && element.dataset.error === 'true'));
byText('Capture PNG').fire('click'); await tick();
assert.equal(JSON.stringify(calls.find(call => call[0] === 'capture')[1]), JSON.stringify({ width: 2160, height: 3840, download: true }));
byText('Record film').fire('click'); await tick();
assert.equal(JSON.stringify(calls.find(call => call[0] === 'video')[1]), JSON.stringify({ fps: 30, download: true }), 'native recorder receives no unsupported resizing options');
byData('productionShot', 'b').fire('click'); assert.ok(calls.some(call => call[0] === 'seek' && call[1] === 4000));
byData('productionRig', 'rear').fire('click');
assert.deepEqual(calls.slice(-4).map(call => call[0]), ['pause', 'rig', 'saveCamera', 'refresh'], 'rig pose is saved before refresh can resample the timeline');
const lens = byData('productionLens'); lens.value = '28'; lens.fire('change');
assert.deepEqual(calls.slice(-4).map(call => call[0]), ['pause', 'camera', 'saveCamera', 'refresh'], 'lens edit is saved at the playhead before timeline refresh');
const shots = all().find(element => element.className === 'production-shots'); const count = shots.replacements;
panel.refresh(); panel.refresh(); assert.equal(shots.replacements, count, 'unchanged timeline does not rebuild shot buttons');
S.recordingStatus = () => ({ active: true, supported: true }); panel.refresh();
assert.equal(stage.disabled, true); assert.equal(byText('Stop recording').disabled, false);
assert.equal(byText('Hide controls').disabled, true, 'recording keeps a stable native canvas size');
assert.equal(byData('siteTake', 's01-street').disabled, true, 'a take cannot be loaded over a recording');
assert.ok(fleetCards().length && fleetCards().every(card => card.disabled), 'nor a tank\'s own take');
S.productionFormat = 'square'; panel.refresh();
assert.equal(frame.value, 'square', 'loading or scripting a different format synchronizes the export selector');
locale = 'zh-CN'; assert.equal(context.label('director'), '导演台');
console.log('studioProductionPanel.selftest: workspace selection, the site\'s takes, every tank\'s take, staging races, exports, transport, recording locks and localization passed');
