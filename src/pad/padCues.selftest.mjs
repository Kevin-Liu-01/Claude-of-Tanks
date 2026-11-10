// The phone's buzzes (docs/PHONE-CONTROLLER.md "Haptics"): each battle event a paired phone feels is its own tank's
// (its gun, the hits it gives and takes, its modules, fire, crashes, kills and death), the events that name no tank are
// the page's player's alone, every cue survives the wire, and every buzz has a pattern and its ticks.
import assert from 'node:assert/strict';
import { padBuzzPattern, padBuzzTicks } from './padBuzz.ts';
import { PAD_CUE_EVENTS, padCueOf } from './padCues.ts';
import { PAD_CUES, readPadCtl } from './padProtocol.ts';

const me = { id: 'p1', player: true };
const seat = { id: 's3', player: false };
const cue = (type, payload, owner = me) => padCueOf(type, payload, owner);

// the gun: only this tank's, harder for a heavier gun
assert.equal(cue('shell:fired', { shooterId: 'p1', caliberMm: 120 }).c, 'shot');
assert.equal(cue('shell:fired', { shooterId: 'b2', caliberMm: 120 }), null, "another tank's shot is not felt");
assert.ok(cue('shell:fired', { shooterId: 'p1', caliberMm: 150 }).m > cue('shell:fired', { shooterId: 'p1', caliberMm: 30 }).m);

// hits taken: hurt (stronger for more damage) or glanced off
assert.equal(cue('shell:hit', { targetId: 'p1', attackerId: 'b2', damage: 240, kind: 'pen' }).c, 'hurt');
assert.ok(cue('shell:hit', { targetId: 'p1', damage: 500 }).m > cue('shell:hit', { targetId: 'p1', damage: 50 }).m);
assert.equal(cue('shell:hit', { targetId: 'p1', attackerId: 'b2', damage: 0, kind: 'ricochet' }).c, 'glance');
// hits given: a hit that hurt, or a deflection; a shell into the ground is nothing
assert.equal(cue('shell:hit', { targetId: 'b2', attackerId: 'p1', damage: 300, kind: 'pen' }).c, 'hit');
assert.equal(cue('shell:hit', { targetId: 'b2', attackerId: 'p1', damage: 0, kind: 'nonpen' }).c, 'deflect');
assert.equal(cue('shell:hit', { attackerId: 'p1', damage: 0, kind: 'terrain' }), null);
assert.equal(cue('shell:hit', { targetId: 'b2', attackerId: 'b3', damage: 300 }), null, 'two other tanks');
assert.equal(cue('shell:hit', { targetId: 'p1', damage: 100, kind: 'heal' }), null, 'a supply heal is no hit');

// the hull: modules knocked out (never a repair's report), fire, crashes
assert.equal(cue('module:state', { id: 'p1', module: 'tracks', state: 'red' }).c, 'module');
assert.equal(cue('module:state', { id: 'p1', module: 'tracks', state: 'yellow', repaired: true }), null);
assert.equal(cue('module:state', { id: 'p1', module: 'engine', state: 'ok', source: 'repair-kit' }), null);
assert.equal(cue('module:state', { id: 'b2', module: 'tracks', state: 'red' }), null);
assert.equal(cue('tank:fire', { id: 'p1', burning: true }).c, 'burning');
assert.equal(cue('tank:fire', { id: 'p1', burning: false }), null, 'a fire put out is not felt');
assert.ok(cue('tank:impact', { id: 'p1', speedMps: 14 }).m > cue('tank:impact', { id: 'p1', speedMps: 2 }).m, 'a harder crash, a harder jolt');

// kills and death
assert.equal(cue('tank:destroyed', { id: 'b2', killerId: 'p1' }).c, 'kill');
assert.equal(cue('tank:destroyed', { id: 'p1', killerId: 'b2' }).c, 'dead');
assert.equal(cue('tank:destroyed', { id: 'b2', killerId: 'b3' }), null);

// the events that name no tank are the player's: a couch seat feels none of them, but its own tank's all the same
assert.equal(cue('player:spotted', { timeS: 3 }).c, 'spotted');
assert.equal(cue('player:spotted', { timeS: 3 }, seat), null);
assert.equal(cue('ui:consumableDenied', {}).c, 'denied');
// (round 8 merge review r1) the input stage's refusal of a shell pick names its tank: that tank's phone feels it, a couch
// seat's included; no other tank's, and not the page player's for another seat's refusal
assert.equal(cue('ammo_selection_denied', { id: 's3', slot: 1, reason: 'AMMO_EMPTY', guided: false }, seat).c, 'denied');
assert.equal(cue('ammo_selection_denied', { id: 'p1', slot: 2, reason: 'AMMO_EMPTY', guided: true }).c, 'denied');
assert.equal(cue('ammo_selection_denied', { id: 's3', slot: 1 }), null, "another seat's refusal is not the player's");
assert.equal(cue('ammo_selection_denied', { id: 'p1', slot: 1 }, seat), null);
assert.equal(cue('ammo_selection_denied', { slot: 1 }, { id: null, player: true }), null, 'no tank, no cue');
assert.ok(PAD_CUE_EVENTS.includes('ammo_selection_denied'), 'a receiver listens for it');
assert.equal(cue('ui:autoAimState', { on: true }).c, 'lock');
assert.equal(cue('ui:autoAimState', { on: false, reason: 'AUTO-AIM OFF' }).c, 'unlock');
assert.equal(cue('ui:autoAimState', { on: true }, seat), null);
assert.equal(cue('shell:fired', { shooterId: 's3', caliberMm: 105 }, seat).c, 'shot');
assert.equal(cue('shell:fired', { shooterId: 's3' }, { id: null, player: true }), null, 'no tank yet, no cue');
assert.equal(cue('shell:hit', null), null, 'a malformed event is nothing');

// every event a receiver listens to can mean a cue, and every cue crosses the wire with its strength clamped
for (const type of PAD_CUE_EVENTS) assert.equal(typeof type, 'string');
for (const c of PAD_CUES) {
  assert.deepEqual(readPadCtl(JSON.stringify({ k: 'cue', c, m: 0.4 })), { k: 'cue', c, m: 0.4 });
  assert.ok(padBuzzPattern(c).length > 0, `${c} has a buzz`);
}
assert.deepEqual(readPadCtl(JSON.stringify({ k: 'cue', c: 'shot', m: 9 })), { k: 'cue', c: 'shot', m: 1 });
assert.deepEqual(readPadCtl(JSON.stringify({ k: 'cue', c: 'hit' })), { k: 'cue', c: 'hit' });
assert.equal(readPadCtl(JSON.stringify({ k: 'cue', c: 'explode' })), null, 'an unknown cue is refused');

// the buzzes: a pattern for each, the strong ones scaled, ticks for a phone without the Vibration API
for (const buzz of ['press', 'ready', 'unready']) assert.ok(padBuzzPattern(buzz).length > 0);
assert.ok(padBuzzPattern('shot', 1)[0] > padBuzzPattern('shot', 0)[0]);
assert.ok(padBuzzPattern('dead')[0] > padBuzzPattern('press')[0], 'death outweighs a press');
assert.deepEqual(padBuzzTicks([8]), [0], 'a press is one tick');
assert.deepEqual(padBuzzTicks([14, 50, 22]), [0, 64], 'each pulse starts a tick');
assert.ok(padBuzzTicks(padBuzzPattern('dead')).length > 3, 'a long buzz ticks on through its length');
assert.ok(padBuzzTicks([1000, 10, 1000]).length <= 6, 'and never past six ticks');

console.log('padCues: PASS — the gun, hits given and taken, modules, fire, crashes, kills and death are the tank\'s own; the player\'s own events; the wire; patterns and ticks');
