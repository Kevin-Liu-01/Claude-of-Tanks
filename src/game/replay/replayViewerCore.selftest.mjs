// The replay viewer's core, no DOM and no world (replay-system, docs/REPLAY.md §5): the timeline's marks, the transport
// clock and its keys, and the posing step that writes a track's moment onto the battle's hulls.
//  - marks: categorised (a kill, a penetration, a fire, a capture, a strike, a respawn, a ram, the end), in team colours
//    (the actor's, else the subject's, else a team a mode event names), filtered (all, kills, one tank), hit at 44 px on a
//    phone and 16 px with a mouse, and a click seeks 3 s before and rides the shooter; a non-penetrating hit is not marked;
//  - the clock: plays at 0.25x-4x, stops at the end and starts over from it, never passes what the indexer reached, frame
//    steps by one track sample, jumps 5 s, goes to the next and previous mark (a press just after a mark goes to the one
//    before), and re-emits marks only on a continuous advance (not a seek, not a stalled frame); the keys map by code;
//  - the poser: writes pose, speed, hp and flags, reports a hull leaving the field and coming back, and a kill's edge both
//    ways (a seek back across it shows the living tank again).
import assert from 'node:assert/strict';
import { filterMarks, markAt, markSeek, markTargetPx, markX, timeAtX, timelineMarks } from './replayTimeline.ts';
import { applyReplayKey, createReplayClock, crossedMarks, FRAME_STEP_S, replayKeyAction } from './replayPlayback.ts';
import { createTrackPoser } from './replayPosing.ts';
import { createReplayTrackBuilder } from './replayTrack.ts';

// --- marks
const roster = [
  { id: 'p', specId: 'm1a2', team: 'alpha', bot: false },
  { id: 'b1', specId: 't90m', team: 'bravo', bot: true },
  { id: 'b2', specId: 'leopard2a7', team: 'bravo', bot: true },
];
const events = [
  [600, 'hit:pen', 'b1', 'p', 10, 20],
  [610, 'hit:nonpen', 'b1', 'p', 10, 20],
  [1200, 'kill:ammo', 'b1', 'p', 11, 21],
  [900, 'fire', 'b2', '', 5, 5],
  [1500, 'zone_captured', 'alpha', '', 0, 0],
  [1800, 'strike_called', 'bravo', 'b2', 0, 0],
  [2100, 'respawn', 'b1', '', 1, 1],
  [2400, 'zone_contested', 'alpha', '', 0, 0],
  [3000, 'end', '', '', 0, 0],
];
const marks = timelineMarks(events, roster);
assert.deepEqual(marks.map((m) => m.category), ['pen', 'fire', 'kill', 'objective', 'strike', 'respawn', 'end'],
  'marked in time order; a non-penetration and a contest are not marked');
const kill = marks.find((m) => m.category === 'kill');
assert.equal(kill.timeS, 20);
assert.equal(kill.team, 'alpha', 'a kill takes its shooter\'s colour');
assert.deepEqual(kill.label, { key: 'replay.mark.kill', actorSpec: 'm1a2', subjectSpec: 't90m', cause: 'ammo' });
assert.equal(marks.find((m) => m.category === 'fire').team, 'bravo', 'no actor: the subject\'s colour');
assert.equal(marks.find((m) => m.category === 'objective').team, 'alpha', 'a mode event naming a team takes that team');
assert.equal(marks.find((m) => m.category === 'strike').team, 'bravo');
assert.equal(marks.at(-1).team, '', 'the end is nobody\'s');

assert.deepEqual(filterMarks(marks, 'kills').map((m) => m.category), ['kill']);
assert.deepEqual(filterMarks(marks, { hull: 'b1' }).map((m) => m.category), ['pen', 'kill', 'respawn'], 'one tank: its own marks');
assert.equal(filterMarks(marks, 'all').length, marks.length);

// the bar: 50 s on 1000 px; the kill at 20 s sits at 400 px
const DURATION = 50, WIDTH = 1000;
assert.equal(markX(20, DURATION, WIDTH), 400);
assert.equal(markTargetPx(true), 44);
assert.equal(markTargetPx(false), 16);
assert.equal(markAt(marks, 420, DURATION, WIDTH, markTargetPx(true)), kill, 'a finger 20 px off still takes the mark');
assert.equal(markAt(marks, 420, DURATION, WIDTH, markTargetPx(false)), null, 'a mouse 20 px off does not');
assert.equal(markAt(marks, 405, DURATION, WIDTH, markTargetPx(false)), kill);
assert.equal(timeAtX(250, DURATION, WIDTH), 12.5);
assert.equal(timeAtX(-5, DURATION, WIDTH), 0);
assert.equal(timeAtX(5000, DURATION, WIDTH), DURATION);
assert.deepEqual(markSeek(kill), { timeS: 17, ride: 'p' }, 'a click: 3 s before, riding the shooter');
assert.deepEqual(markSeek(marks.find((m) => m.category === 'fire')), { timeS: 12, ride: 'b2' }, 'no shooter: ride the subject');
assert.deepEqual(markSeek(marks[0]), { timeS: 7, ride: 'p' });

// --- the clock
const clock = createReplayClock(DURATION, 30);
assert.equal(clock.speed, 1);
assert.deepEqual(clock.advance(0.1), { fromS: 0, toS: 0, continuous: false }, 'paused: nothing moves');
clock.play();
let step = clock.advance(0.1);
assert.ok(Math.abs(clock.timeS - 0.1) < 1e-9 && step.continuous);
clock.setSpeedIndex(4);
assert.equal(clock.speed, 4);
step = clock.advance(0.1);
assert.ok(Math.abs(step.toS - 0.5) < 1e-9, '4x: a tenth of a second plays four tenths');
assert.equal(clock.advance(1).continuous, false, 'a stalled frame moves on but crosses nothing');
clock.setSpeedIndex(99);
assert.equal(clock.speed, 4, 'speed clamps');
clock.seek(100);
assert.equal(clock.timeS, 30, 'never past what the indexer reached');
clock.setAvailable(10);
assert.equal(clock.availableS, 30, 'what the indexer reached only grows');
clock.setAvailable(DURATION);
clock.seek(DURATION - 0.05);
clock.setSpeedIndex(2);
clock.play();
clock.advance(0.1);
assert.equal(clock.timeS, DURATION);
assert.equal(clock.playing, false, 'it stops at the end');
clock.play();
assert.equal(clock.timeS, 0, 'play at the end starts over');

clock.seek(1.01);
clock.frameStep(1);
assert.ok(Math.abs(clock.timeS - 21 * FRAME_STEP_S) < 1e-9 && !clock.playing, 'a frame step pauses and lands on the next sample');
clock.frameStep(-1);
assert.ok(Math.abs(clock.timeS - 20 * FRAME_STEP_S) < 1e-9, 'and back');
clock.seek(4);
clock.jump(5);
assert.equal(clock.timeS, 9);
clock.jump(-50);
assert.equal(clock.timeS, 0, 'a jump clamps');

const times = marks.map((m) => m.timeS);
clock.seek(12);
assert.equal(clock.toMark(times, 1), true);
assert.equal(clock.timeS, 15, 'the next mark: the fire at 15 s');
assert.equal(clock.toMark(times, -1), true);
assert.equal(clock.timeS, 10, 'a press just after a mark goes to the one before');
assert.equal(clock.toMark(times, -1), false, 'none before the first');
clock.seek(DURATION);
assert.equal(clock.toMark(times, 1), false, 'none after the last');

// crossing: only a continuous advance crosses marks
assert.deepEqual(crossedMarks(marks, { fromS: 19.9, toS: 20.1, continuous: true }), [kill]);
assert.deepEqual(crossedMarks(marks, { fromS: 19.9, toS: 20.1, continuous: false }), [], 'a seek or a stall re-emits nothing');
assert.deepEqual(crossedMarks(marks, { fromS: 20, toS: 20.1, continuous: true }), [], 'a mark exactly at the start was already crossed');

// keys by code
assert.equal(replayKeyAction('Space'), 'toggle');
assert.equal(replayKeyAction('BracketRight'), 'markNext');
assert.equal(replayKeyAction('Digit1'), 'speed:0');
assert.equal(replayKeyAction('Digit5'), 'speed:4');
assert.equal(replayKeyAction('Digit6'), null, 'only as many digits as speeds');
assert.equal(replayKeyAction('KeyW'), null, 'the camera keeps its keys');
const keyed = createReplayClock(DURATION);
applyReplayKey(keyed, 'speed:0', times);
assert.equal(keyed.speed, 0.25);
applyReplayKey(keyed, 'forward', times);
applyReplayKey(keyed, 'forward', times);
assert.equal(keyed.timeS, 10);
applyReplayKey(keyed, 'markNext', times);
assert.equal(keyed.timeS, 15);
applyReplayKey(keyed, 'toggle', times);
assert.equal(keyed.playing, true);

// --- the poser, on a synthetic track: a hull that drives, is killed at step 60, parked off the field at 90 and back at 105
const live = (id, team) => ({ id, specId: `${id}_spec`, team,
  state: { pos: { x: 0, y: 0, z: 0 }, yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0, speed: 0 },
  combat: { hp: 100, maxHp: 100, destroyed: false, fire: { burning: false } } });
const a = live('a', 'alpha'), b = live('b', 'bravo');
const game = { tanks: [a, b], shells: [], tick: 0 };
const builder = createReplayTrackBuilder(game);
const bState = b.state;
for (let tick = 1; tick <= 120; tick++) {
  game.tick = tick;
  a.state.pos.x = tick;
  a.state.speed = 6;
  a.state.turretYaw = 0.5;
  if (tick === 60) { a.combat.destroyed = true; a.combat.fire.burning = true; a.combat.hp = 0; }
  b.state = tick >= 90 && tick < 105 ? null : bState;
  builder.afterStep(game);
}
const track = builder.finish();
const view = [live('a', 'alpha'), live('b', 'bravo'), live('c', 'alpha')];
const seen = [];
const poser = createTrackPoser(track, view, {
  onPresence: (hull, present) => seen.push(['presence', hull.id, present]),
  onCondition: (hull, destroyed, burning) => seen.push(['condition', hull.id, destroyed, burning]),
});
assert.equal(poser.indexOf('b'), 1);
assert.equal(poser.indexOf('c'), -1, 'a hull the track does not carry');
poser.apply(30 / 60);
assert.equal(view[0].state.pos.x, 30);
assert.equal(view[0].state.speed, 6);
assert.equal(view[0].state.turretYaw, Math.fround(0.5));
assert.equal(view[0].combat.destroyed, false);
assert.deepEqual(seen, [['presence', 'a', true], ['condition', 'a', false, false], ['presence', 'b', true], ['condition', 'b', false, false]],
  'the first frame reports every hull once');
seen.length = 0;
poser.apply(60 / 60);
assert.deepEqual(seen, [['condition', 'a', true, true]], 'the kill: destroyed and burning');
assert.equal(view[0].combat.hp, 0);
seen.length = 0;
poser.apply(96 / 60);
assert.deepEqual(seen, [['presence', 'b', false]], 'parked off the field');
seen.length = 0;
poser.apply(111 / 60);
assert.deepEqual(seen, [['presence', 'b', true]], 'and back');
seen.length = 0;
poser.apply(30 / 60);
assert.deepEqual(seen, [['condition', 'a', false, false]], 'a seek back across the kill shows the living tank');
assert.equal(view[0].combat.hp, 100);
assert.equal(view[0].combat.destroyed, false);
seen.length = 0;
poser.apply(30 / 60);
assert.deepEqual(seen, [], 'nothing changed, nothing reported');

console.log(`replayViewerCore.selftest: ${marks.length} marks of ${events.length} events (categorised, team-coloured, filtered, hit at 44/16 px, `
  + 'a click 3 s before riding the shooter); the clock (speeds, the end, the indexed span, frame steps, jumps, marks, crossings, keys); '
  + `the poser over ${track.samples} samples (pose, flags, presence, a kill both ways)`);
