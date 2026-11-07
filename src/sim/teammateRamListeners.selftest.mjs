// Round 5 S2 (2026-11-06), the default-tier half of src/sim/teammateRam.selftest.mjs. That receipt (MANUAL, test:heavy --
// sims: it seats a battle on Verdant and starts a room, tens of seconds) drives a teammate ram through the solo step and a
// room and follows its events to every listener on the page. This half keeps, at no cost, what that proof rests on:
//   1. the listeners: in src/ the page's bus has one listener for tank:ram, audio/audioEngine.ts onTankRam (the crunch,
//      the cab's knock, the crew's friendly_ram or 'rammed' call), and two for tank:impact, audioEngine.ts onTankImpact
//      (the thud) and pad/padCues.ts (the paired phone's buzz, which pad/padReceiver.ts sends). A new listener of either
//      fails here, so the manual proof's listener set cannot go stale unseen.
//   2. the paired phone: padCueOf, which padReceiver runs on every PAD_CUE_EVENTS event, gives a hull contact's thud (the
//      solo step's soft contact, game/state.ts: cause 'contact', hard false, damage 0) the own hull's 'impact' buzz and
//      nothing else: never 'hurt', 'module', 'dead' or 'kill', nothing for the teammate's hull; tank:ram is no cue event.
//      (The online page raises no tank:impact for a teammate ram: the manual receipt's recorded bus.)
// The sim halves (a teammate pair: zero damage, no module hit, no kill, on both drivers) are ramModuleLaw.selftest's
// (default tier); the friendly_ram call is voiceTriggers.selftest's. Run: node src/sim/teammateRamListeners.selftest.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PAD_CUE_EVENTS, padCueOf } from '../pad/padCues.ts';

// ---- 1. the page's listeners of the two events a teammate ram raises ---------------------------------------------------
const srcRoot = new URL('../', import.meta.url);
const files = readdirSync(srcRoot, { recursive: true }).map(String)
  .filter((file) => file.endsWith('.ts') && !/\.selftest\.|\.test-support\./.test(file));
const listenersOf = (name) => files.filter((file) => readFileSync(new URL(file, srcRoot), 'utf8').split('\n').some((line) => {
  const text = line.trim();
  return text.includes(`'${name}'`) && !text.startsWith('//') && !text.startsWith('*') && !new RegExp(`emit\\(\\s*'${name}'`).test(text);
})).sort();
assert.deepEqual(listenersOf('tank:ram'), ['audio/audioEngine.ts'],
  'tank:ram has one listener on the page, the audio engine\'s onTankRam (the crunch, the cab\'s knock, the crew\'s call): any new one is checked here');
assert.deepEqual(listenersOf('tank:impact'), ['audio/audioEngine.ts', 'pad/padCues.ts'],
  'tank:impact has two, the audio engine\'s thud and the paired phone\'s impact buzz: any new one is checked here');

// ---- 2. the paired phone's cue for a teammate ram ----------------------------------------------------------------------
const me = { id: 'me', player: true };
// the solo step's soft contact as game/state.ts emits it for each hull of the pair (the ram itself prices nothing)
const contact = (id) => ({ id, specId: 'm1a1_abrams_hc', isPlayer: id === 'me', speedMps: 8.2, pos: [0, 1, 0],
  cause: 'contact', hard: false, damage: 0 });
const ownCue = padCueOf('tank:impact', contact('me'), me);
assert.equal(ownCue?.c, 'impact', `the own hull's contact is the impact buzz (${JSON.stringify(ownCue)})`);
assert.equal(padCueOf('tank:impact', contact('mate'), me), null, 'the teammate\'s contact is its own business');
assert.ok(!PAD_CUE_EVENTS.includes('tank:ram'), 'the ram\'s report is no cue event: the phone feels the contact once, as its thud');
assert.equal(padCueOf('tank:ram', { aId: 'me', bId: 'mate', dmgA: 0, dmgB: 0, closingMps: 8.2, aIsPlayer: true }, me), null,
  'and maps to nothing');
// the class at every speed; the strength only as a buzz's range and its rise with the closing speed, so retuning the
// buzz (padCues.ts's floor or its full-jolt speed) is no red here (round 6 V9)
const strengths = [0.5, 4, 12, 30].map((speedMps) => {
  const cue = padCueOf('tank:impact', { ...contact('me'), speedMps }, me);
  assert.equal(cue?.c, 'impact', `a contact at ${speedMps} m/s buzzes as a contact, never as damage (${JSON.stringify(cue)})`);
  assert.ok(cue.m > 0 && cue.m <= 1, `a contact at ${speedMps} m/s buzzes within the phone's range, (0, 1] (${JSON.stringify(cue)})`);
  return cue.m;
});
assert.ok(strengths.every((m, i) => i === 0 || m >= strengths[i - 1]) && strengths[3] > strengths[0],
  `a harder contact buzzes no softer (${strengths.join(', ')} at 0.5, 4, 12 and 30 m/s)`);

console.log('teammateRamListeners.selftest: tank:ram has one listener in src (audioEngine.ts), tank:impact two (audioEngine.ts, '
  + 'padCues.ts); a teammate ram\'s contact buzzes the own hull\'s phone as an impact, never as damage, and its report is no cue event');
