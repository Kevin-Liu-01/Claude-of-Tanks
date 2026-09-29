import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

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
const context = { document, window, Event, PRODUCTION_PRESETS: presets, getLocale: () => locale, console, Promise, Error };
runInNewContext(`${executable}\nglobalThis.mount = mountStudioProductionPanel; globalThis.label = productionLabel;`, context);
const calls = [];
let resolveStage, rejectStage;
const S = {
  productionFormat: 'landscape',
  TANK_IDS: ['m1a2'], getMapInfo: id => ({ name: id }), getSpecInfo: id => ({ name: id }),
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
byData('productionPreset', 'two').fire('click');
const frame = byData('productionFormat'); frame.value = 'portrait'; frame.fire('change');
assert.ok(calls.some(call => call[0] === 'format' && call[1] === 'portrait'), 'format selection informs the runtime camera framing');
byData('productionTank').value = 'm1a2';
const stage = byData('productionStage'); stage.fire('click'); stage.fire('click');
assert.equal(calls.filter(call => call[0] === 'stage').length, 1, 'one scene transaction despite repeated clicks');
assert.equal(JSON.stringify(calls.find(call => call[0] === 'stage')[1]), JSON.stringify({ presetId: 'two', format: 'portrait', vehicleId: 'm1a2' }));
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
S.productionFormat = 'square'; panel.refresh();
assert.equal(frame.value, 'square', 'loading or scripting a different format synchronizes the export selector');
locale = 'zh-CN'; assert.equal(context.label('director'), '导演台');
console.log('studioProductionPanel.selftest: workspace selection, staging races, exports, transport, recording locks and localization passed');
