import assert from 'node:assert/strict';
import { createFakeContext, fakeBuffer } from './fakeAudioContext.test-support.mjs';
import { createMixer } from './mixer.ts';
import { createCrewRadio } from './crewRadio.ts';
import { mulberry32 } from './audioMath.ts';
import { VOICE_LINES } from './voiceLines.ts';
import { VOICE_PACKS } from './voiceManifest.generated.ts';
import { CREW_LANGUAGES } from './vehicleAudioProfiles.ts';
import { CREW_LINE_GAP_LINES, CREW_LINE_GAP_PACKS, isCrewLineGap } from './crewLineGaps.test-support.mjs';

function harness({ languages = ['en-US', 'de'], missing = [], loading = [], radioAssets = true } = {}) {
  const ctx = createFakeContext();
  const mixer = createMixer({ context: ctx, reverb: false, channelVolumes: { engine: 1, combat: 1, ambience: 1, ui: 1, voice: 1 }, masterVolume: 0.8, muted: false });
  const loaded = [];
  const dropped = [];
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
    dropVoice(lang) { dropped.push(lang); },
    voiceReady(lang) { return !loading.includes(lang); },
  };
  const random = mulberry32(7);
  const radio = createCrewRadio({ mixer, library, random });
  return { ctx, mixer, radio, loaded, dropped };
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
  assert.equal(radio.say('fire'), true, 'priority 4 interrupts a report');
  assert.equal(radio.log.at(-1).id, 'fire');
  assert.equal(radio.say('repairs', { delayS: 0.2 }), true, 'a lower call queues behind the fire call');
  ctx.advance(5);
  radio.update();
  assert.equal(radio.debugState().pending.length, 0, 'the stale call expired instead of playing late');
  assert.notEqual(radio.log.at(-1).id, 'repairs');
}

// A report cuts the loader's flavour: the gunner's call on our round never waits behind "Firing" (2026-10-04, owner:
// the crew must be on top of penetrations), while flavour still never cuts or queues behind anything.
{
  const { ctx, radio } = harness();
  assert.equal(radio.say('firing'), true);
  ctx.advance(0.2);
  assert.equal(radio.say('penetration'), true, 'a report interrupts flavour');
  assert.equal(radio.log.at(-1).id, 'penetration');
  ctx.advance(0.2);
  radio.say('enemy_spotted');
  assert.equal(radio.log.at(-1).id, 'penetration', 'a situational call waits instead of cutting a report');
  ctx.advance(4);
  radio.update();
  assert.equal(radio.say('reloading'), true);
  ctx.advance(0.2);
  assert.equal(radio.say('nonpen', { delayS: 0.4 }), true, 'a delayed report queues');
  ctx.advance(0.45);
  radio.update();
  assert.equal(radio.log.at(-1).id, 'nonpen', 'and cuts the flavour when it is due instead of going stale behind it');
}

// A line that yields (the reasoning exchange) gives way to any real call, even a situational one, and the net reads
// quiet only once nothing waits and the last line and its gap are over.
{
  const { ctx, radio } = harness();
  assert.equal(radio.quiet, true);
  assert.equal(VOICE_LINES.think_step_by_step.yields, true);
  assert.equal(radio.say('think_step_by_step'), true);
  assert.equal(radio.quiet, false);
  ctx.advance(0.3);
  assert.equal(radio.say('enemy_spotted'), true, 'a situational call cuts a yielding line');
  assert.equal(radio.log.at(-1).id, 'enemy_spotted');
  ctx.advance(0.3);
  assert.equal(radio.say('firing'), false, 'while flavour still never cuts a situational call');
  ctx.advance(3);
  radio.update();
  assert.equal(radio.quiet, true);
}

// The national pack speaks, and only it (owner 2026-10-04, no fallbacks): a line missing from it is silent,
// never another nation's crew standing in.
{
  const { radio, loaded, dropped } = harness({ languages: ['en-US', 'de'], missing: ['de/fire'] });
  radio.setLanguage('de');
  assert.deepEqual(loaded, ['de'], 'switching loads only the national pack');
  assert.deepEqual(dropped, ['en-US'], 'and releases the pack it leaves: one pack held at a time');
  radio.say('were_hit');
  assert.equal(radio.log.at(-1).lang, 'de');
  radio.silence();
  assert.equal(radio.say('fire', { force: true }), false, 'a missing national take stays silent');
  assert.notEqual(radio.log.at(-1).id, 'fire');
  assert.deepEqual(loaded, ['de'], 'and never loads the US crew to cover it');
}

// So every shipped pack carries every line in the catalog (and nothing the catalog lacks), bar the one listed gap
// (crewLineGaps.test-support.mjs): a listed line missing from a listed pack is excused; a listed take that now exists fails
// so the list shrinks as takes land.
for (const lang of CREW_LANGUAGES) {
  const pack = VOICE_PACKS[lang];
  assert.ok(pack, `${lang} ships a pack`);
  const missing = Object.keys(VOICE_LINES).filter((id) => !(pack[id]?.length > 0));
  const expected = Object.keys(VOICE_LINES).filter((id) => isCrewLineGap(lang, id));
  assert.deepEqual(missing, expected, expected.length
    ? `${lang} lacks exactly the listed gap (a take that landed leaves crewLineGaps.test-support.mjs)`
    : `${lang} carries every crew line`);
  const unknown = Object.keys(pack).filter((id) => !VOICE_LINES[id]);
  assert.deepEqual(unknown, [], `${lang} ships no line the catalog lacks`);
}
// …and the gap names only real lines and packs (a renamed line or pack cannot hide behind it)
for (const id of CREW_LINE_GAP_LINES) assert.ok(VOICE_LINES[id], `gap line ${id} is in the catalog`);
for (const lang of CREW_LINE_GAP_PACKS) assert.ok(CREW_LANGUAGES.includes(lang), `gap pack ${lang} is a crew language`);

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

// A line commits when it plays (crew-languages-270). A call asked while its pack decodes waits in the queue and plays
// once the pack lands inside its staleS: the result after a crew switch, and an immediate call on a free net.
{
  const loading = ['de'];
  const languages = ['en-US'];
  const { ctx, radio } = harness({ languages, loading });
  radio.setLanguage('de');
  assert.equal(radio.say('victory', { delayS: 0.4 }), true, 'the result queues while the pack decodes');
  ctx.advance(3);
  radio.update();
  assert.equal(radio.log.length, 0, 'nothing plays before the pack lands');
  assert.deepEqual(radio.debugState().pending.map((q) => q.id), ['victory'], 'and the call stays queued');
  loading.length = 0;
  languages.push('de');
  ctx.advance(0.1);
  radio.update();
  assert.deepEqual([radio.log.at(-1)?.id, radio.log.at(-1)?.lang], ['victory', 'de'], 'it plays once the pack lands');
  assert.equal(radio.debugState().pending.length, 0);
}
{
  const loading = ['de'];
  const languages = ['en-US'];
  const { ctx, radio } = harness({ languages, loading });
  radio.setLanguage('de');
  assert.equal(radio.say('were_hit'), true, 'an immediate call on a free net queues instead of being lost');
  ctx.advance(0.5);
  loading.length = 0;
  languages.push('de');
  radio.update();
  assert.equal(radio.log.at(-1)?.id, 'were_hit');
}
// ...and expires if the pack lands after it; a pack that has landed without a take of the line stays silent at once.
{
  const loading = ['de'];
  const languages = ['en-US'];
  const { ctx, radio } = harness({ languages, loading });
  radio.setLanguage('de');
  radio.say('victory', { delayS: 0.4 });
  ctx.advance(8.5);
  radio.update();
  assert.equal(radio.debugState().pending.length, 0, 'stale before the pack landed');
  loading.length = 0;
  languages.push('de');
  ctx.advance(0.1);
  radio.update();
  assert.equal(radio.log.length, 0, 'never played late');
}
{
  const { radio } = harness({ missing: ['en-US/were_hit'] });
  assert.equal(radio.say('were_hit'), false);
  assert.equal(radio.debugState().pending.length, 0, 'nothing to wait for: no decode running');
}

// A refused sixth_sense arms nothing: the 20 s "once per exposure" is the line's cooldown, armed when it plays.
{
  const { ctx, radio } = harness();
  assert.equal(VOICE_LINES.sixth_sense.cdS, 20);
  assert.equal(radio.say('sixth_sense', { delayS: 3 }), true);
  ctx.advance(2.6);
  assert.equal(radio.say('fire'), true);
  ctx.advance(0.9);
  radio.update();
  ctx.advance(0.7);
  radio.update();
  assert.deepEqual(radio.log.map((e) => e.id), ['fire'], 'the fire call held the net through the sixth sense\'s stale time');
  assert.equal(radio.debugState().pending.length, 0, 'so it expired');
  ctx.advance(2);
  assert.equal(radio.say('sixth_sense', { delayS: 3 }), true, 'the next exposure is not blocked by the refused one');
  ctx.advance(3.1);
  radio.update();
  assert.equal(radio.log.at(-1).id, 'sixth_sense');
  ctx.advance(5);
  assert.equal(radio.say('sixth_sense', { delayS: 3 }), false, 'the call that played keeps its cooldown');
  ctx.advance(15.1);
  assert.equal(radio.say('sixth_sense', { delayS: 3 }), true);
}

// A due call that cannot play yet (its take still decoding) stays queued without holding back a lower one that can,
// then cuts it once its take lands.
{
  const missing = ['de/victory'];
  const loading = ['de'];
  const { ctx, radio } = harness({ missing, loading });
  radio.setLanguage('de');
  radio.say('victory', { delayS: 0.2 });
  radio.say('were_hit', { delayS: 0.2 });
  ctx.advance(0.3);
  radio.update();
  assert.equal(radio.log.at(-1)?.id, 'were_hit', 'the playable lower call goes');
  assert.deepEqual(radio.debugState().pending.map((q) => q.id), ['victory'], 'while the blocked one waits');
  missing.length = 0;
  loading.length = 0;
  ctx.advance(0.1);
  radio.update();
  assert.equal(radio.log.at(-1)?.id, 'victory', 'and cuts in once its take lands');
}

console.log('crewRadio.selftest: radio discipline, interrupts, stale drops, complete packs without fallback, damage, live crew switching and lines that commit when they play passed');
