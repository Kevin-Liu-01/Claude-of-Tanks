import assert from 'node:assert/strict';
import { createFakeContext, fakeBuffer } from './fakeAudioContext.test-support.mjs';
import { createMixer } from './mixer.ts';
import { createNoiseBank } from './procedural.ts';
import { createCrewRadio } from './crewRadio.ts';
import { resolveCrewLanguage } from './voiceLines.ts';
import { mulberry32 } from './audioMath.ts';

function harness({ languages = ['en-US', 'de'], missing = [] } = {}) {
  const ctx = createFakeContext();
  const mixer = createMixer({ context: ctx, reverb: false, channelVolumes: { engine: 1, combat: 1, ambience: 1, ui: 1, voice: 1 }, masterVolume: 0.8, muted: false });
  const loaded = [];
  const library = {
    voice(lang, line) {
      if (!languages.includes(lang) || missing.includes(`${lang}/${line}`)) return null;
      return fakeBuffer(1.0, 24000);
    },
    has: () => false,
    pick: () => null,
    loadVoice(lang) { loaded.push(lang); return Promise.resolve(); },
  };
  const random = mulberry32(7);
  const radio = createCrewRadio({ mixer, library, noise: createNoiseBank(ctx, random), random });
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
  const highpass = filters.find((n) => n.type === 'highpass');
  const lowpass = filters.find((n) => n.type === 'lowpass' && n.frequency.events.some((e) => e[1] === 2100));
  assert.ok(highpass && highpass.frequency.value >= 600, 'damaged set loses the low band');
  assert.ok(lowpass, 'damaged set loses the high band');
}

// Language resolution: national by default, English or the interface on request.
assert.equal(resolveCrewLanguage('Germany'), 'de');
assert.equal(resolveCrewLanguage('Germany', 'english'), 'en-US');
assert.equal(resolveCrewLanguage('Germany', 'interface', 'zh-CN'), 'zh');
assert.equal(resolveCrewLanguage('Germany', 'interface', 'en-US'), 'en-US');
assert.equal(resolveCrewLanguage('Germany', 'interface', 'pt-BR'), 'en-US', 'unsupported interface languages fall back');

console.log('crewRadio.selftest: radio discipline, interrupts, stale drops, national packs with fallback, damage and language resolution passed');
