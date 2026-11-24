// The replay viewer's controller with stub ports, no DOM and no world (replay-system, docs/REPLAY.md §5): a played index
// poses the hulls, hands their edges to the visuals and puts the kills it crosses into the kill feed once (a seek back
// and over the kill puts nothing in); a mark click seeks 3 s before and rides the shooter (the drone when that hull cannot
// be ridden); the keys drive the transport over the shown marks; a 'this tank' filter follows the ridden tank; a refused
// replay keeps its timeline and names the version, a drifted one stops where it drifted, and neither poses anything.
import assert from 'node:assert/strict';
import { createReplayTrackBuilder } from './replayTrack.ts';
import { createReplayViewer } from './replayViewer.ts';

const hull = (id, team) => ({ id, specId: `${id}_spec`, team,
  state: { pos: { x: 0, y: 0, z: 0 }, yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0, speed: 0 },
  combat: { hp: 100, maxHp: 100, destroyed: false, fire: { burning: false } } });

// a 10 s battle: a kills b at step 300
const a = hull('a', 'alpha'), b = hull('b', 'bravo');
const game = { tanks: [a, b], shells: [], tick: 0 };
const builder = createReplayTrackBuilder(game);
for (let tick = 1; tick <= 600; tick++) {
  game.tick = tick;
  a.state.pos.x = tick / 60;
  if (tick === 300) { b.combat.destroyed = true; b.combat.hp = 0; }
  builder.afterStep(game);
}
const track = builder.finish();
const header = { roster: [{ id: 'a', specId: 'a_spec', team: 'alpha', bot: false }, { id: 'b', specId: 'b_spec', team: 'bravo', bot: true }] };
const events = [[120, 'hit:pen', 'b', 'a', 0, 0], [300, 'kill:shot', 'b', 'a', 0, 0], [450, 'fire', 'a', '', 0, 0]];
const index = { header, end: { ticks: 600 }, events, track, indexedSteps: 600, lastTick: 600, problem: null };

const view = [hull('a', 'alpha'), hull('b', 'bravo')];
const log = [];
let focus = null, rideable = new Set(['a', 'b']);
const ports = {
  hulls: view,
  watch: {
    rideId: (id) => { log.push(['ride', id]); if (!rideable.has(id)) return false; focus = id; return true; },
    drone: () => { log.push(['drone']); focus = null; },
    get focusId() { return focus; },
  },
  visuals: {
    setPresent: (h, present) => log.push(['present', h.id, present]),
    setCondition: (h, destroyed, burning) => log.push(['condition', h.id, destroyed, burning]),
  },
  feed: { kill: (mark) => log.push(['feed', mark.actor, mark.subject]) },
};
const viewer = createReplayViewer(index, ports);
assert.equal(viewer.bar.durationS, 10);
assert.equal(viewer.bar.notice, null);
assert.equal(viewer.marks.length, 3);
assert.ok(log.some((e) => e[0] === 'present' && e[1] === 'a'), 'the first pose shows every hull');
log.length = 0;

// before the battle frame poses it (its entry's load screen still up) the transport is refused: a Play there would run a
// clock nobody sees; the first posed frame offers it, and one Play then moves the clock on the next frame
assert.equal(viewer.posing, false);
viewer.key('toggle');
viewer.scrub(4);
viewer.pickMark(viewer.marks[1]);
assert.equal(viewer.clock.playing, false, 'a Play under the load screen is refused');
assert.equal(viewer.bar.timeS, 0, 'and so are a scrub and a mark');
assert.deepEqual(log.filter((e) => e[0] === 'ride' || e[0] === 'drone'), [], 'nothing is ridden');
viewer.advance(1 / 60);
assert.equal(viewer.posing, true, 'the first posed frame offers the transport');
assert.equal(viewer.bar.timeS, 0, 'a paused clock stays at the start');
viewer.key('toggle');
assert.equal(viewer.bar.playing, true, 'one Play plays');
viewer.advance(1 / 60);
assert.ok(viewer.bar.timeS > 0, 'and the clock moves on the next frame');
viewer.scrub(0);
log.length = 0;

// play: 6 s in 0.1 s frames crosses the kill once
for (let i = 0; i < 60; i++) viewer.advance(0.1);
assert.ok(Math.abs(viewer.bar.timeS - 6) < 1e-6);
assert.ok(Math.abs(view[0].state.pos.x - 6) < 0.06, 'the hull is posed from the track');
assert.deepEqual(log.filter((e) => e[0] === 'feed'), [['feed', 'a', 'b']], 'the kill reaches the feed once');
assert.deepEqual(log.filter((e) => e[0] === 'condition'), [['condition', 'b', true, false]], 'and its wreck is set');
log.length = 0;

// a seek back over the kill: the wreck reset, nothing in the feed; playing over it again feeds it again
viewer.scrub(2);
assert.deepEqual(log, [['condition', 'b', false, false]], 'a seek back shows the living tank and feeds nothing');
assert.equal(view[1].combat.destroyed, false);
log.length = 0;

// a mark click: 3 s before the kill, riding its shooter
const kill = viewer.marks.find((m) => m.category === 'kill');
viewer.pickMark(kill);
assert.equal(viewer.bar.timeS, 2);
assert.deepEqual(log.filter((e) => e[0] === 'ride'), [['ride', 'a']]);
assert.equal(viewer.bar.focusId, 'a');
log.length = 0;
rideable = new Set();
viewer.pickMark(viewer.marks.find((m) => m.category === 'fire'));
assert.deepEqual(log.filter((e) => e[0] !== 'condition' && e[0] !== 'present'), [['ride', 'a'], ['drone']], 'a hull that cannot be ridden: the drone');
rideable = new Set(['a', 'b']);

// filters and keys over the shown marks
viewer.setFilter('kills');
assert.deepEqual(viewer.bar.marks.map((m) => m.category), ['kill']);
viewer.scrub(0);
viewer.key('markNext');
assert.equal(viewer.bar.timeS, 5, 'the next mark of the filter: the kill');
viewer.key('markNext');
assert.equal(viewer.bar.timeS, 5, 'no later kill: it stays');
viewer.pickMark(kill);
viewer.setFilter({ hull: 'a' });
focus = 'b';
viewer.advance(0);
assert.deepEqual(viewer.bar.filter, { hull: 'b' }, "'this tank' follows the ridden tank");
assert.deepEqual(viewer.bar.marks.map((m) => m.category), ['pen', 'kill'], "b's own marks");
viewer.key('speed:4');
assert.equal(viewer.bar.speed, 4);

// refused: no track, the timeline kept, the version named, nothing posed
log.length = 0;
const refused = createReplayViewer({ ...index, track: null, indexedSteps: 0,
  problem: { code: 'refused', tick: 0, message: 'replay recorded on 274.3' } }, ports);
assert.deepEqual(refused.bar.notice, { kind: 'refused', version: '274.3' });
assert.equal(refused.bar.durationS, 10, 'the recorded span');
assert.equal(refused.marks.length, 3, 'the timeline is kept');
refused.advance(0);
refused.key('toggle');
refused.advance(0.1);
assert.ok(refused.bar.timeS > 0, 'its clock still runs over the marks');
assert.deepEqual(log.filter((e) => e[0] === 'present' || e[0] === 'condition'), [], 'nothing is posed');

// drifted: the track up to the checksum, the bar says where
const drifted = createReplayViewer({ ...index, problem: { code: 'checksum', tick: 600, message: 'drifted' } }, ports);
assert.deepEqual(drifted.bar.notice, { kind: 'drifted', timeS: 10 });
const lost = createReplayViewer({ ...index, track: null, problem: { code: 'roster', tick: 0, message: 'x' } }, ports);
assert.deepEqual(lost.bar.notice, { kind: 'unavailable' });

console.log('replayViewer.selftest: no transport before the first posed frame, then one Play moves the clock; posed from the track, a kill fed once and its wreck set, a seek back feeds nothing and shows the '
  + 'living tank, a mark rides its shooter (else the drone), filters and keys, refused and drifted replays keep their timeline');
