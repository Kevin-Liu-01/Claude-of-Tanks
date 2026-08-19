import { strict as assert } from 'node:assert';
import { createVoiceRadio } from './voices.js';

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sources = [];
    this.active = 0;
    this.maxActive = 0;
  }

  createBufferSource() {
    const ctx = this;
    const src = {
      buffer: null,
      playbackRate: { value: 1 },
      onended: null,
      active: false,
      connect() {},
      start(at) {
        this.startAt = at;
        this.endAt = at + this.buffer.duration / this.playbackRate.value;
        this.active = true;
        ctx.active++;
        ctx.maxActive = Math.max(ctx.maxActive, ctx.active);
      },
      stop() { this.finish(); },
      finish() {
        if (!this.active) return;
        this.active = false;
        ctx.active--;
        if (this.onended) this.onended();
      },
    };
    this.sources.push(src);
    return src;
  }

  createGain() {
    return { gain: { value: 1 }, connect() {}, disconnect() {} };
  }

  decodeAudioData() { return Promise.resolve({ duration: 1 }); }

  advance(t) {
    this.currentTime = t;
    for (const src of this.sources) {
      if (src.active && src.endAt <= t) src.finish();
    }
  }
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });

try {
  const ctx = new FakeAudioContext();
  const radio = createVoiceRadio(() => 0);
  radio.load(ctx, { connect() {} });
  for (let i = 0; i < 6 && !radio.loaded; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(radio.loaded, true, 'voice buffers load in the harness');

  radio.say('battle_start', { delayS: 0.5 });
  ctx.advance(0.49); radio.update();
  assert.equal(radio.log.length, 0, 'delayed line does not play early');
  ctx.advance(0.5); radio.update();
  assert.equal(radio.log.at(-1).id, 'battle_start', 'delayed line plays at its presentation edge');

  ctx.advance(2);
  radio.say('firing');
  const flavorSrc = ctx.sources.at(-1);
  ctx.advance(2.1);
  radio.say('fire');
  assert.equal(flavorSrc.active, false, 'urgent survival line cuts low-priority chatter');
  assert.equal(radio.log.at(-1).id, 'fire', 'urgent line starts immediately');
  assert.equal(ctx.maxActive, 1, 'radio never overlaps two speech sources');

  ctx.advance(4);
  radio.say('penetration', { delayS: 0.2 });
  radio.say('enemy_crit', { delayS: 0.2 });
  ctx.advance(4.2); radio.update();
  assert.equal(radio.log.at(-1).id, 'enemy_crit', 'newer same-moment shot report replaces the queued generic one');

  const genericResultSrc = ctx.sources.at(-1);
  ctx.advance(4.3);
  radio.say('target_destroyed', { delayS: 0.22 });
  ctx.advance(4.52); radio.update();
  assert.equal(genericResultSrc.active, false, 'confirmed kill cuts an older generic shot report');
  assert.equal(radio.log.at(-1).id, 'target_destroyed', 'confirmed kill is not lost behind combat chatter');

  ctx.advance(6);
  const beforeStale = radio.log.length;
  radio.say('enemy_spotted', { delayS: 1 });
  ctx.advance(8); radio.update();
  assert.equal(radio.log.length, beforeStale, 'expired delayed call is dropped instead of spoken late');

  ctx.advance(9);
  radio.say('enemy_spotted');
  const awarenessSrc = ctx.sources.at(-1);
  radio.say('sixth_sense', { delayS: 0.3 });
  ctx.advance(9.3); radio.update();
  assert.equal(awarenessSrc.active, false, 'delayed urgent call interrupts flavor when its cue becomes ready');
  assert.equal(radio.log.at(-1).id, 'sixth_sense', 'delayed urgent call stays aligned to its cue');

  ctx.advance(12);
  radio.say('reloaded');
  const firstVariant = radio.log.at(-1).file;
  ctx.advance(16);
  radio.say('reloaded');
  assert.notEqual(radio.log.at(-1).file, firstVariant, 'repeat calls rotate away from the last take');

  radio.say('sixth_sense', { delayS: 3 });
  radio.cancelPending();
  assert.equal(radio.debugState().pending.length, 0, 'battle transitions can clear calls whose moment passed');
  const obsoleteActive = ctx.sources.at(-1);
  radio.cancelPending([], true);
  assert.equal(obsoleteActive.active, false, 'battle end can stop active obsolete chatter');

  console.log('voices.selftest: scheduler timing, priority, kill confirmation, staleness, rotation, and non-overlap passed');
} finally {
  globalThis.fetch = originalFetch;
}
