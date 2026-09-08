import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MAP_IDS } from '../world/maps/catalog.ts';
import { createBus } from '../game/stateCore.ts';
import { createAudio } from './audio.ts';
import { MAX_VOICES } from './audioPolicy.ts';
import {
  AMBIENT_BUDGET, AMBIENT_PROFILES, MAP_AMBIENT_BIOMES,
  canScheduleAmbientCue, resolveAmbientProfile,
} from './ambientPolicy.ts';

assert.equal(MAP_IDS.length, 30, 'the ambient map table covers the complete thirty-map roster');
assert.deepEqual(Object.keys(MAP_AMBIENT_BIOMES).sort(), [...MAP_IDS].sort(),
  'every registered map chooses a biome explicitly');
assert.equal(new Set(Object.values(MAP_AMBIENT_BIOMES)).size, 8,
  'the battlefield roster uses eight distinct ambient sound palettes');
assert.equal(resolveAmbientProfile('missing').biome, 'field', 'unknown identities keep a safe neutral wind profile');
assert.equal(resolveAmbientProfile('coastal').cue.kind, 'gull', 'coasts use gull calls');
assert.equal(resolveAmbientProfile('delta').cue.kind, 'insect', 'wetlands use insect phrases');
assert.equal(resolveAmbientProfile('longleaf').cue.kind, 'bird', 'forests use bird phrases');
assert.equal(resolveAmbientProfile('foundry').cue.kind, 'metal', 'industrial areas use distant metallic resonance');
assert.equal(resolveAmbientProfile('whiteout').cue.kind, 'none', 'polar stations do not inherit temperate birds');
assert.deepEqual(AMBIENT_BUDGET, { timerMs: 700, loopNodes: 10, cueSources: 5, simultaneousCues: 1 },
  'ambience retains the existing timer and loop/call node ceilings');
for (const profile of Object.values(AMBIENT_PROFILES)) {
  const { wind, cue } = profile;
  assert.ok(Object.isFrozen(profile) && Object.isFrozen(wind) && Object.isFrozen(cue),
    `${profile.biome}: shared profiles cannot drift between cached worlds`);
  assert.ok(wind.gain <= 0.45 && wind.swellGain <= 0.16 && wind.gustGain <= 0.09
    && wind.gustSwellGain <= 0.05, `${profile.biome}: wind does not exceed the existing mix ceiling`);
  assert.ok(wind.gain > wind.swellGain && wind.gustGain > wind.gustSwellGain,
    `${profile.biome}: LFO modulation never inverts the wind envelope`);
  assert.ok(cue.notes <= AMBIENT_BUDGET.cueSources && cue.probability <= 0.32 && cue.gain <= 0.095,
    `${profile.biome}: environmental calls stay below former bird voice/node/gain ceilings`);
  assert.ok(!canScheduleAmbientCue(profile, 20, 0, 0, MAX_VOICES, MAX_VOICES),
    `${profile.biome}: ambience cannot steal a combat voice from a full pool`);
  assert.ok(!canScheduleAmbientCue(profile, 2, 3, 0, 0, MAX_VOICES), `${profile.biome}: minimum gap is enforced`);
  assert.ok(!canScheduleAmbientCue(profile, 20, 0, NaN, 0, MAX_VOICES), `${profile.biome}: invalid RNG does not schedule`);
}

class FakeParam {
  constructor(value = 0) { this.value = value; this.targets = []; }
  setValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; this.targets.push(value); }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  cancelScheduledValues() {}
}
class FakeNode {
  constructor(context, kind) {
    this.context = context; this.kind = kind; this.disconnected = false;
    this.started = false; this.stopAt = Infinity; this.ended = false;
    for (const key of ['gain', 'frequency', 'Q', 'playbackRate', 'pan', 'threshold', 'knee', 'ratio', 'attack', 'release']) {
      this[key] = new FakeParam();
    }
  }
  connect() {}
  disconnect() { this.disconnected = true; }
  start() { this.started = true; }
  stop(when = this.context.currentTime) { this.stopAt = Math.min(this.stopAt, when); }
}
class FakeContext {
  constructor() {
    this.currentTime = 0; this.sampleRate = 1000; this.state = 'running'; this.nodes = [];
    this.destination = this.node('destination');
  }
  node(kind) { const node = new FakeNode(this, kind); this.nodes.push(node); return node; }
  createGain() { return this.node('gain'); }
  createOscillator() { return this.node('oscillator'); }
  createBufferSource() { return this.node('buffer'); }
  createBiquadFilter() { return this.node('filter'); }
  createDynamicsCompressor() { return this.node('compressor'); }
  createWaveShaper() { return this.node('shaper'); }
  createStereoPanner() { return this.node('panner'); }
  createBuffer(channels, length, sampleRate) {
    const data = new Float32Array(length);
    return { getChannelData: () => data, duration: length / sampleRate };
  }
  async decodeAudioData() { return this.createBuffer(1, 100, this.sampleRate); }
  flush(time) {
    this.currentTime = time;
    for (const node of this.nodes) if (!node.ended && node.stopAt <= time) {
      node.ended = true; node.onended?.();
    }
  }
}

const previous = { window: globalThis.window, fetch: globalThis.fetch,
  setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval };
const intervals = new Map();
let nextInterval = 0;
try {
  globalThis.window = {};
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
  globalThis.setInterval = (callback, ms) => { const id = ++nextInterval; intervals.set(id, { callback, ms }); return id; };
  globalThis.clearInterval = (id) => intervals.delete(id);
  const context = new FakeContext();
  let mapId = 'coastal';
  const mixer = createAudio({ context, getMapId: () => mapId });
  const bus = createBus(); mixer.bindBus(bus);
  bus.emit('phase:change', { phase: 'battle' });
  mixer.resume();
  const beforeWind = context.nodes.length;
  mixer.ambientOn(true);
  const windNodes = context.nodes.slice(beforeWind);
  assert.equal(windNodes.length, AMBIENT_BUDGET.loopNodes, 'battle ambience creates exactly ten existing loop nodes');
  assert.equal(intervals.size, 1, 'battle ambience owns just one timer');
  const interval = [...intervals.values()][0];
  assert.equal(interval.ms, 700, 'the existing sparse timer cadence is retained');
  mixer.ambientOn(true);
  assert.equal(context.nodes.length, beforeWind + 10, 'duplicate starts allocate no additional rig');
  assert.equal(intervals.size, 1, 'duplicate starts allocate no additional timer');

  mapId = 'whiteout';
  interval.callback();
  assert.equal(context.nodes.length, beforeWind + 10, 'map changes retune the existing rig without extra nodes');
  assert.equal(window.__COT_AUDIO.ambientState().biome, 'polar', 'map changes reach the live audio rig');
  const filter = windNodes.find((node) => node.kind === 'filter');
  assert.equal(filter.frequency.value, resolveAmbientProfile('whiteout').wind.lowpassHz,
    'map changes apply the authored wind filter');
  for (let tick = 1; tick <= 30; tick++) { context.flush(tick * 0.7); interval.callback(); }
  assert.equal(context.nodes.length, beforeWind + 10, 'polar ambience remains wind-only without stray birds');

  mapId = 'mangrove'; interval.callback();
  for (let tick = 31; tick <= 100; tick++) {
    const before = context.nodes.length;
    context.flush(tick * 0.7); interval.callback();
    assert.ok(context.nodes.length - before <= 2 + AMBIENT_BUDGET.cueSources * 2,
      'each sparse cue stays inside the former five-source/envelope voice budget');
  }
  assert.ok(window.__COT_AUDIO.soundLog.some((event) => event.type === 'ambient:cue' && event.kind === 'insect'),
    'the real mixer synthesizes a wetland cue through the shared voice allocator');
  bus.emit('ui:pause', { on: true });
  const pausedNodes = context.nodes.length;
  for (let tick = 101; tick <= 125; tick++) { context.flush(tick * 0.7); interval.callback(); }
  assert.equal(context.nodes.length, pausedNodes, 'pause suppresses new environmental calls');
  assert.equal(window.__COT_AUDIO.ambientState().cueActive, false, 'pause cancels a currently scheduled cue');
  bus.emit('ui:pause', { on: false });

  bus.emit('phase:change', { phase: 'ended' });
  assert.equal(intervals.size, 0, 'leaving battle clears the ambient timer even without ambientOn(false)');
  assert.equal(window.__COT_AUDIO.ambientState().active, false, 'phase teardown clears the ambient rig owner');
  assert.equal(window.__COT_AUDIO.ambientState().cueActive, false, 'phase teardown clears scheduled cue ownership');
  context.flush(context.currentTime + 0.2);
  assert.ok(windNodes.every((node) => node.disconnected), 'phase teardown disconnects every wind node, not only output gains');
  assert.ok(windNodes.filter((node) => node.started).every((node) => node.ended),
    'phase teardown stops all four looping sources');
  const endedNodes = context.nodes.length;
  interval.callback(); mixer.ambientOn(true);
  assert.equal(context.nodes.length, endedNodes, 'stale timer callbacks and non-battle starts remain inert');

  bus.emit('phase:change', { phase: 'battle' });
  mixer.ambientOn(true);
  assert.equal(intervals.size, 1, 'a rematch recreates exactly one ambient timer');
  const rematchWind = context.nodes.slice(-10);
  mixer.loadingOn(true);
  assert.equal(intervals.size, 0, 'loading handoff tears down the battlefield timer');
  context.flush(context.currentTime + 0.2);
  assert.ok(rematchWind.every((node) => node.disconnected), 'loading handoff releases all battlefield wind nodes');
  mixer.loadingOn(false);
  mixer.ambientOn(false); mixer.ambientOn(false);
  assert.equal(intervals.size, 0, 'repeated teardown is idempotent');
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
} finally {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
}

const source = await readFile(new URL('./audio.ts', import.meta.url), 'utf8');
assert.doesNotMatch(source.slice(source.indexOf('function update('), source.indexOf('function setMasterVolume')),
  /syncAmbientProfile|maybeAmbientCue/, 'ambient richness adds no work to the frame update loop');
console.log('ambientPolicy.selftest: thirty map profiles, fixed node budgets, retuning and exhaustive phase teardown passed');
