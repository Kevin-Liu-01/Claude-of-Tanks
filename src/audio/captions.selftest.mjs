// captions.selftest.mjs — the caption stream for radio, alarms and key sound effects (brand-ui SPEC 10 and 14; PLAN
// BUI-F9). Copyright © 2026 Kevin B. Liu.
//
//  1. The caption tables are generated from the crew script (tools/audio/build-captions.mjs, no drift): every radio line
//     names its speaking role and says the same call in en-US and zh-CN take for take, as many takes as every crew pack.
//  2. Direction: a listener-relative point becomes a bearing (0 ahead, 90 right, -90 left, 180 behind), one of eight
//     sectors and a distance; inside our tank there is no direction.
//  3. The stream: a radio caption carries the line, the spoken take, the crew language and the speaker; a cue carries its
//     kind, priority and direction and respects its cooldown; the log is bounded.
//  4. Wiring: the crew radio reports every keyed transmission with the take it spoke; the engine raises every
//     CAPTION_SOUNDS cue somewhere and names no other, and publishes them on the bus as 'audio:caption'.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CREW_LINES, SCRIPT_TS, SPEAKERS_TS, generate } from '../../tools/audio/build-captions.mjs';
import { CAPTION_EVENT, CAPTION_SOUNDS, captionDirection, captionSpeaker, createCaptionStream } from './captions.ts';
import { CAPTION_SPEAKERS } from './captionSpeakers.generated.ts';
import { CAPTION_SCRIPT } from './captionScript.generated.ts';
import { VOICE_LINES } from './voiceLines.ts';
import { VOICE_PACKS } from './voiceManifest.generated.ts';
import { createFakeContext, fakeBuffer } from './fakeAudioContext.test-support.mjs';
import { createMixer } from './mixer.ts';
import { createCrewRadio } from './crewRadio.ts';
import { mulberry32 } from './audioMath.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/* 1. tables ------------------------------------------------------------------------------------------------------- */
const files = generate();
for (const path of [SPEAKERS_TS, SCRIPT_TS]) {
  assert.equal(readFileSync(path, 'utf8'), files[path], `${path.slice(ROOT.length)} drifted from the crew script: run node tools/audio/build-captions.mjs`);
}
const script = JSON.parse(readFileSync(CREW_LINES, 'utf8'));
assert.deepEqual(Object.keys(CAPTION_SPEAKERS).sort(), script.lines.map((l) => l.id).sort(), 'every scripted line has a speaker');
for (const id of Object.keys(VOICE_LINES)) {
  assert.ok(CAPTION_SPEAKERS[id], `radio line ${id} has a speaking role`);
  const text = CAPTION_SCRIPT[id];
  assert.ok(text, `radio line ${id} has caption text`);
  assert.equal(text['en-US'].length, text['zh-CN'].length, `${id}: as many zh-CN takes as en-US`);
  for (const [lang, pack] of Object.entries(VOICE_PACKS)) {
    if (pack[id]) assert.equal(pack[id].length, text['en-US'].length, `${id}: the ${lang} pack's take n is caption take n`);
  }
  for (const take of [...text['en-US'], ...text['zh-CN']]) assert.ok(take.trim().length > 0, `${id}: no empty caption`);
}
assert.throws(() => generate({ lines: [{ id: 'x', role: 'medic', 'en-US': ['a'], zh: ['b'] }] }), /no known role/);
assert.throws(() => generate({ lines: [{ id: 'x', role: 'gunner', 'en-US': ['a', 'b'], zh: ['c'] }] }), /same number of takes/);

/* 2. direction ---------------------------------------------------------------------------------------------------- */
const at = (right, ahead) => ({ right, ahead, distance: Math.hypot(right, ahead) });
const expect = [
  [at(0, 100), 0, 'front'], [at(70, 70), 45, 'frontRight'], [at(100, 0), 90, 'right'], [at(70, -70), 135, 'rearRight'],
  [at(0, -100), 180, 'rear'], [at(-70, -70), -135, 'rearLeft'], [at(-100, 0), -90, 'left'], [at(-70, 70), -45, 'frontLeft'],
  [at(20, 100), 11, 'front'], [at(-1, -100), -181 + 2, 'rear'],
];
for (const [source, bearing, sector] of expect) {
  const d = captionDirection(source);
  assert.equal(d.sector, sector, `${JSON.stringify(source)} is ${sector}`);
  assert.equal(Math.abs(d.bearingDeg - bearing) <= 1 || Math.abs(Math.abs(d.bearingDeg) - 180) <= 1 && Math.abs(bearing) >= 179, true,
    `${JSON.stringify(source)} bears ${bearing} (got ${d.bearingDeg})`);
  assert.equal(d.distanceM, Math.round(source.distance));
}

/* 3. the stream ---------------------------------------------------------------------------------------------------- */
{
  let now = 10;
  const emitted = [];
  const stream = createCaptionStream({ emit: (e) => emitted.push(e), now: () => now });
  const radio = stream.radio('ammo_rack', 1, 'de', 1.4, 3);
  assert.deepEqual(radio, { kind: 'radio', id: 'ammo_rack', speaker: 'loader', take: 1, lang: 'de', direction: null, priority: 3, holdS: 2.6, atS: 10 },
    'a radio caption: line, speaker (the loader calls the rack), take, crew language, priority, time to read');
  assert.equal(captionSpeaker('battle_start'), 'commander');
  assert.equal(stream.sound('fire', null).direction, null, 'an alarm inside our tank has no direction');
  assert.equal(stream.sound('fire', null), null, 'and its cooldown swallows a repeat');
  now += CAPTION_SOUNDS.fire.cooldownS;
  assert.ok(stream.sound('fire', null), 'until the cooldown has passed');
  const gun = stream.sound('gunfire', at(-120, 40));
  assert.equal(gun.kind, 'sound');
  assert.equal(gun.direction.sector, 'left', 'a cue carries where it came from');
  assert.equal(gun.priority, CAPTION_SOUNDS.gunfire.priority);
  assert.equal(emitted.length, 4, 'every caption is published');
  for (let i = 0; i < 80; i++) stream.radio('firing', 0, 'en-US', 0.5, 0);
  assert.equal(stream.log.length, 48, 'the debug log is bounded');
  stream.reset();
  assert.equal(stream.log.length, 0);
  assert.ok(stream.sound('fire', null), 'reset forgets the cooldowns');
}
for (const [id, cue] of Object.entries(CAPTION_SOUNDS)) {
  assert.ok(cue.kind === 'alarm' || cue.kind === 'sound', `${id}: alarm or sound`);
  assert.ok(cue.priority >= 0 && cue.priority <= 4 && cue.cooldownS > 0 && cue.holdS >= 1.5, `${id}: priority 0-4, a cooldown, time to read`);
}

/* 4. wiring -------------------------------------------------------------------------------------------------------- */
{
  const ctx = createFakeContext();
  const mixer = createMixer({ context: ctx, reverb: false, channelVolumes: { engine: 1, combat: 1, ambience: 1, ui: 1, voice: 1 }, masterVolume: 0.8, muted: false });
  const takes = new Map();
  const library = {
    voice(lang, line, random, take) {
      const n = take ?? 1; // this fake crew always speaks the second take when free to choose
      takes.set(`${lang}/${line}`, n);
      return fakeBuffer(1.2, 24000);
    },
    voiceTake: (lang, line) => takes.get(`${lang}/${line}`) ?? -1,
    has: () => false, pick: () => null, variant: () => null, record: () => undefined,
    load: () => Promise.resolve(), loadVoice: () => Promise.resolve(), voiceReady: () => true,
  };
  const heard = [];
  const radio = createCrewRadio({ mixer, library, random: mulberry32(3), initialLanguage: 'de',
    onTransmit: (...args) => heard.push(args) });
  assert.equal(radio.say('ammo_rack'), true);
  assert.deepEqual(heard[0].slice(0, 3), ['ammo_rack', 1, 'de'], 'the radio reports the line, the take it spoke and the crew language');
  assert.ok(Math.abs(heard[0][3] - 1.2) < 0.05 && heard[0][4] === VOICE_LINES.ammo_rack.pri, 'with its length and priority');
  ctx.advance(5);
  radio.update();
  radio.say('miss', { take: 0 });
  assert.equal(heard.at(-1)[1], 0, 'a requested take is the one captioned');
}
const engine = readFileSync(`${ROOT}src/audio/audioEngine.ts`, 'utf8');
// every quoted id inside a caption(...) call (a call may choose between two: the hull hit or the bounce)
const raised = new Set([...engine.matchAll(/\bcaption\(([^;]*?)\);/g)].flatMap((m) => [...m[1].matchAll(/'([A-Za-z]+)'/g)].map((q) => q[1])));
assert.deepEqual([...raised].sort(), Object.keys(CAPTION_SOUNDS).sort(), 'the engine raises every caption cue and no other');
assert.match(engine, /captionBus\?\.emit\(CAPTION_EVENT, event\)/, 'captions go out on the game bus');
assert.match(engine, /onTransmit: \(id, take, lang, durationS, priority\) => \{ captions\.radio\(id, take, lang, durationS, priority\); \}/,
  'every keyed transmission is captioned');
assert.equal(CAPTION_EVENT, 'audio:caption');

console.log(`captions: ${Object.keys(CAPTION_SPEAKERS).length} radio lines with speakers and en-US/zh-CN text take for take, `
  + `${Object.keys(CAPTION_SOUNDS).length} alarm and sound cues raised by the engine, 8 sectors, cooldowns, bounded log`);
