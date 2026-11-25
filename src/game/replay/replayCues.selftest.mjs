// A replay plays its battle's effects back (replay-fixes-277; Kevin 11-25: "the battle isnt actually happening"): the
// indexer keeps the picture's and the sound's events as the re-simulation emits them (copied: the emitters reuse their
// objects; entities left out), and the viewer hands each one a forward play crosses to the page's bus once, in order, at
// its step, never on a seek and never again on a replay of the same span after a seek back. Stub ports, no DOM.
import assert from 'node:assert/strict';
import { createReplayTrackBuilder } from './replayTrack.ts';
import { createReplayViewer } from './replayViewer.ts';
import { firstCueFrom, replayCueOf, REPLAY_CUE_EVENTS } from './replayCues.ts';

// 1. which events, and copied as data
assert.equal(replayCueOf('battle:ended', {}, 5), null, 'the result is not an effect');
assert.equal(replayCueOf('player:reload', {}, 5), null);
for (const type of ['shell:fired', 'shell:hit', 'tank:destroyed', 'tank:fire']) assert.ok(REPLAY_CUE_EVENTS.has(type), type);
const reused = { shellId: 7, shooterId: 'a', muzzlePos: [1, 2, 3], dir: new Float32Array([0, 0, 1]), pos: { x: 4, y: 5, z: 6 },
  entity: Object.assign(Object.create({ kind: 'entity' }), { visual: {}, state: {} }), timeS: Infinity };
const cue = replayCueOf('shell:fired', reused, 42);
reused.shellId = 8; reused.muzzlePos[0] = 99; reused.pos.x = 99;
assert.deepEqual(cue, { tick: 42, type: 'shell:fired', payload: { shellId: 7, shooterId: 'a', muzzlePos: [1, 2, 3], dir: [0, 0, 1],
  pos: { x: 4, y: 5, z: 6 }, timeS: null } }, 'a copy as the event was emitted; an entity left out');
const cues = [10, 10, 20, 35].map((tick, i) => ({ tick, type: 'shell:fired', payload: { shellId: i } }));
assert.equal(firstCueFrom(cues, 0), 0);
assert.equal(firstCueFrom(cues, 11), 2);
assert.equal(firstCueFrom(cues, 36), 4);

// 2. the viewer plays them at their steps: a 5 s battle with a shot at 0.5 s, a hit at 1 s, a kill at 3 s
const hull = (id) => ({ id, specId: `${id}_spec`, team: 'alpha',
  state: { pos: { x: 0, y: 0, z: 0 }, yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0, speed: 0 },
  combat: { hp: 100, maxHp: 100, destroyed: false, fire: { burning: false } } });
const game = { tanks: [hull('a'), hull('b')], shells: [], tick: 0 };
const builder = createReplayTrackBuilder(game);
for (let tick = 1; tick <= 300; tick++) { game.tick = tick; builder.afterStep(game); }
const index = {
  header: { roster: [{ id: 'a', specId: 'a_spec', team: 'alpha', bot: false }, { id: 'b', specId: 'b_spec', team: 'alpha', bot: true }] },
  end: { ticks: 300 }, events: [], track: builder.finish(), indexedSteps: 300, lastTick: 300, problem: null,
  cues: [{ tick: 30, type: 'shell:fired', payload: { shellId: 1 } }, { tick: 60, type: 'shell:hit', payload: { shellId: 1 } },
    { tick: 180, type: 'tank:destroyed', payload: { id: 'b' } }],
};
const played = [];
const viewer = createReplayViewer(index, {
  hulls: [hull('a'), hull('b')], watch: { rideId: () => true, drone: () => {}, focusId: null },
  visuals: { setPresent: () => {}, setCondition: () => {} }, feed: { kill: () => {} },
  cue: (c) => played.push(`${c.tick}:${c.type}`),
});
viewer.advance(0); // posed (the battle in view)
viewer.key('toggle'); // play
for (let k = 0; k < 40; k++) viewer.advance(0.05); // 2 s
assert.deepEqual(played, ['30:shell:fired', '60:shell:hit'], 'the cues crossed so far, once, in order');
viewer.scrub(4); // a seek over the kill
assert.deepEqual(played, ['30:shell:fired', '60:shell:hit'], 'a seek plays nothing');
viewer.scrub(0.2);
viewer.clock.play();
for (let k = 0; k < 20; k++) viewer.advance(0.05);
assert.deepEqual(played, ['30:shell:fired', '60:shell:hit', '30:shell:fired', '60:shell:hit'], 'played again from before them, again');
viewer.clock.pause();
viewer.advance(0.5);
assert.equal(played.length, 4, 'paused, nothing plays');
viewer.scrub(2.9);
viewer.clock.play();
for (let k = 0; k < 4; k++) viewer.advance(0.05);
assert.equal(played.at(-1), '180:tank:destroyed', 'the kill plays at its step');

console.log('replayCues: PASS (the picture\'s events kept as copies; played at their steps on a forward play, never on a seek)');
