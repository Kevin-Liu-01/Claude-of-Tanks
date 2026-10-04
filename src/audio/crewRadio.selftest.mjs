import assert from 'node:assert/strict';
import { createFakeContext, fakeBuffer } from './fakeAudioContext.test-support.mjs';
import { createMixer } from './mixer.ts';
import { createCrewRadio } from './crewRadio.ts';
import { mulberry32 } from './audioMath.ts';

function harness({ languages = ['en-US', 'de'], missing = [], loading = [], radioAssets = true } = {}) {
  const ctx = createFakeContext();
  const mixer = createMixer({ context: ctx, reverb: false, channelVolumes: { engine: 1, combat: 1, ambience: 1, ui: 1, voice: 1 }, masterVolume: 0.8, muted: false });
  const loaded = [];
  // The net's recorded elements, tagged so a test can tell them from speech.
  const tagged = (tag, duration) => Object.assign(fakeBuffer(duration, 24000), { tag });
  const net = { radio_key_in: tagged('radio_key_in', 0.12), radio_key_out: tagged('radio_key_out', 0.55), radio_static_loop: tagged('radio_static_loop', 4.2) };
  const library = {
    voice(lang, line) {
      if (!languages.includes(lang) || missing.includes(`${lang}/${line}`)) return null;
      return fakeBuffer(1.0, 24000);
    },
    has: () => false,
    pick: (id) => (radioAssets ? net[id] ?? null : null),
    variant: (id) => (radioAssets ? net[id] ?? null : null),
    record: (id) => (id === 'radio_static_loop' ? { g: 'radio', n: 1, d: [4.2], c: 1, r: 24000, l: [0.085, 4.085], kb: 25 } : undefined),
    load: () => Promise.resolve(),
    loadVoice(lang) { loaded.push(lang); return Promise.resolve(); },
    voiceReady(lang) { return !loading.includes(lang); },
  };
  const random = mulberry32(7);
  const radio = createCrewRadio({ mixer, library, random });
  return { ctx, mixer, radio, loaded };
}

// One transmission at a time; flavour never queues behind speech.
{
  const { ctx, radio } = harness();
  assert.equal(radio.say('enemy_spotted'), true);
  assert.equal(radio.speaking, true);
  assert.equal(radio.say('firing'), false, 'priority-0 flavour is dropped while the net is busy');
  ctx.advance(2);
  radio.update();
  assert.equal(radio.say('enemy_spotted'), false, 'per-line cooldown');
  assert.equal(radio.log.length, 1);
}

// Every transmission is keyed with the recorded elements over the recorded net static (2026-10-03): the
// synthesized squelch, whose falling release tone read as a little boing after every line, is gone.
{
  const { ctx, radio } = harness();
  radio.say('enemy_spotted');
  const started = ctx.started.map((node) => node.buffer?.tag).filter(Boolean);
  assert.ok(started.includes('radio_key_in') && started.includes('radio_key_out'), `keyed in and out (${started})`);
  assert.ok(started.includes('radio_static_loop'), 'over the net static');
  assert.equal(ctx.nodes.filter((node) => node.kind === 'oscillator').length, 0, 'no synthesized tone');
  const keyIn = ctx.started.find((node) => node.buffer?.tag === 'radio_key_in');
  const keyOut = ctx.started.find((node) => node.buffer?.tag === 'radio_key_out');
  const speech = ctx.started.find((node) => node.buffer && !node.buffer.tag);
  assert.ok(speech.started.at > keyIn.started.at && keyOut.started.at > speech.started.at + 0.9, 'key-up, speech, release');
  const bed = ctx.started.find((node) => node.buffer?.tag === 'radio_static_loop');
  assert.ok(bed.loop && bed.loopStart === 0.085, 'the static loops between its manifest loop points');
  radio.silence();
  ctx.advance(8);
  radio.say('reloading');
  assert.equal(ctx.started.filter((node) => node.buffer?.tag === 'radio_static_loop').length, 1, 'one static bed for the net');
}
// A net whose recordings are still decoding still speaks: silently keyed, never with a stand-in tone.
{
  const { ctx, radio } = harness({ radioAssets: false });
  assert.equal(radio.say('enemy_spotted'), true);
  assert.equal(ctx.nodes.filter((node) => node.kind === 'oscillator').length, 0);
  assert.equal(ctx.started.filter((node) => node.buffer).length, 1, 'only the speech starts');
}

// Survival calls cut chatter; stale queued calls are dropped, not played late.
{
  const { ctx, radio } = harness();
  radio.say('penetration');
  assert.equal(radio.say('fire'), true, 'priority 4 interrupts priority 1');
  assert.equal(radio.log.at(-1).id, 'fire');
  assert.equal(radio.say('repairs', { delayS: 0.2 }), true, 'a lower call queues behind the fire call');
  ctx.advance(5);
  radio.update();
  assert.equal(radio.debugState().pending.length, 0, 'the stale call expired instead of playing late');
  assert.notEqual(radio.log.at(-1).id, 'repairs');
}

// The national pack speaks; a line missing from it falls back to the US crew.
{
  const { radio, loaded } = harness({ languages: ['en-US', 'de'], missing: ['de/fire'] });
  radio.setLanguage('de');
  assert.deepEqual(loaded, ['de'], 'switching loads only the national pack');
  radio.say('were_hit');
  assert.equal(radio.log.at(-1).lang, 'de');
  radio.silence();
  radio.say('fire', { force: true });
  assert.equal(radio.log.at(-1).lang, 'en-US', 'a missing national take falls back');
}

// Radio damage narrows the band and grows the static bed.
{
  const { radio, ctx } = harness();
  radio.setRadioDamage(2);
  radio.say('were_hit');
  const filters = ctx.nodes.filter((n) => n.kind === 'filter');
  // (the mixer's own high-passes, such as the ambience bus's, are not the radio's band)
  const highpass = filters.find((n) => n.type === 'highpass' && n.frequency.value >= 600);
  const lowpass = filters.find((n) => n.type === 'lowpass' && n.frequency.events.some((e) => e[1] === 2100));
  assert.ok(highpass, 'damaged set loses the low band');
  assert.ok(lowpass, 'damaged set loses the high band');
}

// Switching crews stops old speech and pending calls. A cold pack cannot
// accidentally play the already-loaded US crew while its own takes decode.
{
  const loading = ['de'];
  const languages = ['en-US'];
  const { radio, loaded } = harness({ languages, loading });
  radio.say('penetration');
  radio.say('repairs', { delayS: 0.2 });
  assert.equal(radio.debugState().pending.length, 1);
  radio.setLanguage('de');
  assert.equal(radio.speaking, false, 'old crew stops');
  assert.deepEqual(radio.debugState().pending, [], 'old crew queue clears');
  assert.equal(radio.say('were_hit', { force: true }), false, 'cold pack waits instead of speaking English');
  assert.deepEqual(loaded, ['de']);
  loading.length = 0;
  languages.push('de');
  assert.equal(radio.say('were_hit', { force: true }), true);
  assert.equal(radio.log.at(-1).lang, 'de');
  radio.setLanguage('de');
  assert.equal(radio.speaking, true, 'reapplying the same choice does not interrupt speech');
}

console.log('crewRadio.selftest: radio discipline, interrupts, stale drops, fallback, damage and live crew switching passed');
