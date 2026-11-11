// 2026-11-02 audit F11 (machine 6): a transmission cut short takes its scheduled sounds with it. A survival call that
// interrupts a line used to get the old line's release click, its damaged-set crackle and its static swell-down at
// the old line's end time, in the middle of the new line: playNow scheduled them and stopCurrent never cancelled them.
import assert from 'node:assert/strict';
import { createFakeContext, fakeBuffer } from './fakeAudioContext.test-support.mjs';
import { createMixer } from './mixer.ts';
import { createCrewRadio } from './crewRadio.ts';

/** The automation a param would run, its cancellations applied: [kind, value, at] in schedule order. */
function effective(param) {
  const kept = [];
  for (const event of param.events) {
    if (event[0] === 'cancel') { for (let i = kept.length - 1; i >= 0; i--) if (kept[i][2] >= event[1]) kept.splice(i, 1); continue; }
    kept.push(event);
  }
  return kept;
}

function harness(seed) {
  const ctx = createFakeContext();
  const mixer = createMixer({ context: ctx, reverb: false, channelVolumes: { engine: 1, combat: 1, ambience: 1, ui: 1, voice: 1 }, masterVolume: 0.8, muted: false });
  const tagged = (tag, duration) => Object.assign(fakeBuffer(duration, 1000), { tag });
  const net = {
    radio_key_in: tagged('radio_key_in', 0.12), radio_key_out: tagged('radio_key_out', 0.55),
    radio_static_loop: tagged('radio_static_loop', 4.2), radio_interference: tagged('radio_interference', 0.3),
  };
  const library = {
    voice: () => Object.assign(fakeBuffer(2.0, 1000), { tag: 'speech' }),
    has: (id) => id === 'radio_interference',
    pick: (id) => net[id] ?? null,
    variant: (id) => net[id] ?? null,
    record: (id) => (id === 'radio_static_loop' ? { g: 'radio', n: 1, d: [4.2], c: 1, r: 24000, l: [0.085, 4.085], kb: 25 } : undefined),
    load: () => Promise.resolve(),
    loadVoice: () => Promise.resolve(),
    voiceReady: () => true,
  };
  // a seeded stream that always crackles (the 60 % draw) for a damaged set
  let n = seed;
  const random = () => { n = (n * 16807) % 2147483647; return (n % 1000) / 1000 * 0.5; };
  const radio = createCrewRadio({ mixer, library, random });
  return { ctx, radio };
}

const { ctx, radio } = harness(11);
radio.setRadioDamage(2);
assert.equal(radio.say('penetration'), true, 'a report keys the net');
const first = ctx.started.length;
const keyOut = ctx.started.find((node) => node.buffer?.tag === 'radio_key_out');
const crackle = ctx.started.find((node) => node.buffer?.tag === 'radio_interference');
const bed = ctx.started.find((node) => node.buffer?.tag === 'radio_static_loop');
const speech = ctx.started.find((node) => node.buffer?.tag === 'speech');
assert.ok(keyOut && crackle && bed && speech, 'the line is keyed in and out over the static, its damaged set crackling');
const bedGain = bed.outputs[0].outputs[0].gain; // static -> band-pass -> its gain
const oldEnd = speech.started.at + 2.0 / speech.playbackRate.value;
assert.ok(keyOut.started.at > oldEnd - 0.01, 'its release click is scheduled at its end');

ctx.advance(0.5);
assert.equal(radio.say('fire'), true, 'a survival call cuts it');
const now = ctx.currentTime;
assert.ok(keyOut.stopped != null && keyOut.stopped <= now + 0.1, `the cut line's release click never plays (stop ${keyOut.stopped})`);
assert.ok(crackle.started.at <= now || (crackle.stopped != null && crackle.stopped <= now + 0.1), 'nor its pending crackle');
const bedPlan = effective(bedGain);
assert.ok(!bedPlan.some(([kind, value, at]) => kind === 'target' && value === 0 && Math.abs(at - (oldEnd + 0.05)) < 1e-6),
  `the cut line's static swell-down is cancelled (${JSON.stringify(bedPlan)})`);
const fresh = ctx.started.slice(first);
const nextSpeech = fresh.find((node) => node.buffer?.tag === 'speech');
assert.ok(nextSpeech && bedPlan.some(([kind, value, at]) => kind === 'target' && value > 0 && at >= now), 'the new line swells the static in');
const nextOut = fresh.find((node) => node.buffer?.tag === 'radio_key_out');
assert.ok(nextOut && nextOut.stopped == null, 'the new line keeps its own release click');

// silence() clears the net the same way
radio.silence();
assert.ok(nextOut.stopped != null, 'silence takes the pending release click too');

console.log('crewRadioInterrupt.selftest: an interrupted transmission takes its release click, crackle and static swell with it passed');
