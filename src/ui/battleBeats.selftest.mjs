// battleBeats.selftest — the end screen's timeline (battleBeats.ts): what the log records and when, and which beats
// the line keeps and labels. Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { createBattleBeatLog, layoutBeats } from './battleBeats.ts';

// ---- the log ----------------------------------------------------------------------------------------------------
const log = createBattleBeatLog();
log.clock(12);
log.spot(41);
log.spot(60); // only the first spot is a beat
log.kill('e1', 't90am', 135);
log.clock(130); // the clock never runs back
assert.equal(log.nowS, 135, 'the clock keeps its latest reading');
log.kill('e2', 'leo2a4_v'); // a fire kill: no time on the event, the clock's
log.objective('zone', 'alpha', 'zone-2');
log.objective('zone', 'bravo', 'zone-1');
log.objective('zone', 'alpha', 'extraction'); // the escort's extraction has no letter: not a beat
log.objective('flag', 'bravo');
log.objective('goal', 'nobody'); // an unknown side is not a beat
log.loss('trackL', 200);
log.loss('trackL', 210); // a module counts once a life
log.death(220);
log.revive();
log.loss('trackL', 300); // the revived tank can lose it again
let beats = log.list();
assert.deepEqual(beats.map((beat) => [beat.kind, beat.t]), [
  ['spot', 41], ['kill', 135], ['kill', 135], ['zone', 135], ['zone', 135], ['flag', 135],
  ['loss', 200], ['death', 220], ['loss', 300],
]);
assert.deepEqual(beats.filter((beat) => beat.kind === 'zone').map((beat) => [beat.label, beat.own]), [['B', true], ['A', false]],
  'a zone carries its letter and whose it became');
assert.equal(beats.find((beat) => beat.kind === 'flag')?.own, false, 'the enemy took the flag');
assert.deepEqual(beats.filter((beat) => beat.kind === 'kill').map((beat) => [beat.id, beat.specId]),
  [['e1', 't90am'], ['e2', 'leo2a4_v']], 'a kill names its victim and vehicle');

log.clear();
log.setPerspective('bravo');
log.objective('zone', 'bravo', 'zone-3');
assert.deepEqual(log.list().map((beat) => [beat.label, beat.own]), [['C', true]], 'a bravo seat owns bravo captures');
log.clear();
assert.deepEqual(log.list(), [], 'a new battle starts empty');
assert.equal(log.nowS, 0, 'and its clock at zero');
for (let i = 0; i < 80; i++) log.kill(`e${i}`, 't90am', i);
assert.equal(log.list().length, 48, 'a battle keeps 48 beats at most');

// ---- the layout ---------------------------------------------------------------------------------------------------
assert.deepEqual(layoutBeats([{ t: 10, kind: 'kill' }], 0), [], 'no line without a duration');
const sample = [
  { t: 41, kind: 'spot' }, { t: 135, kind: 'kill', id: 'a' }, { t: 278, kind: 'zone', own: true, label: 'B' },
  { t: 362, kind: 'kill', id: 'b' }, { t: 400, kind: 'loss', id: 'trackL' }, { t: 455, kind: 'kill', id: 'c' },
  { t: 999, kind: 'kill', id: 'late' }, { t: -1, kind: 'kill', id: 'early' },
];
const placed = layoutBeats(sample, 480);
assert.deepEqual(placed.map((beat) => beat.t), [41, 135, 278, 362, 400, 455], 'sorted by time; beats off the line dropped');
for (let i = 1; i < placed.length; i++) assert.ok(placed[i].x >= placed[i - 1].x, 'positions follow time');
const labelled = placed.filter((beat) => beat.labelled).map((beat) => beat.x);
for (let i = 0; i < labelled.length; i++) {
  for (let j = i + 1; j < labelled.length; j++) assert.ok(Math.abs(labelled[i] - labelled[j]) >= 0.12, 'labels never meet');
  assert.ok(Math.abs(1 - 0.06 - labelled[i]) >= 0.12, 'nor the result\'s label at the end');
}
assert.equal(placed.find((beat) => beat.t === 455)?.labelled, false, 'a beat beside the result keeps its mark without words');
assert.equal(placed.find((beat) => beat.t === 400)?.labelled, false, 'a loss beside a kill yields its label to the kill');
assert.ok(placed.filter((beat) => beat.kind === 'kill').some((beat) => beat.labelled), 'kills label first');
for (const beat of placed) assert.ok(beat.x >= 0.02 && beat.x <= 0.96, 'every mark sits on the line');

const crowd = Array.from({ length: 20 }, (_, i) => ({ t: 10 + i, kind: i % 2 ? 'spot' : 'kill', id: String(i) }));
const kept = layoutBeats(crowd, 600);
assert.equal(kept.length, 8, 'the line keeps eight beats besides the result');
assert.ok(kept.every((beat) => beat.kind === 'kill'), 'the kills before the spots');
assert.equal(kept.filter((beat) => beat.labelled).length, 1, 'beats a second apart share one label');

// ---- a watched battle's line (watch-mode-243): every side's kills and objectives, no player in them ---------------
const watched = createBattleBeatLog();
watched.clock(10);
watched.battleKill('b1', 'm1a3', 'alpha', 30);
watched.battleKill('a1', 't90am', 'bravo', 60);
watched.battleKill('x', 'm1a3', null, 65); // a kill no side can claim is not a beat
watched.clock(70);
watched.objective('zone', 'bravo', 'zone-1');
assert.deepEqual(watched.battleList().map((beat) => [beat.kind, beat.t, beat.side, beat.id ?? beat.label]),
  [['kill', 30, 'alpha', 'b1'], ['kill', 60, 'bravo', 'a1'], ['zone', 70, 'bravo', 'A']], 'the battle line keeps every side\'s beats');
assert.deepEqual(watched.list().map((beat) => [beat.kind, beat.own]), [['zone', false]],
  'the player\'s line keeps only its own beats (the objective, from the Alpha seat\'s side)');
assert.ok(watched.battleList().every((beat) => beat.own === undefined), 'a battle beat has a side, never an "own"');
watched.clear();
assert.deepEqual(watched.battleList(), [], 'a new battle\'s line starts empty');
for (let i = 0; i < 600; i++) watched.battleKill(`e${i}`, 't90am', i % 2 ? 'alpha' : 'bravo', i);
assert.equal(watched.battleList().length, 512, 'a respawn battle\'s hundreds of kills stop at 512');

const fight = Array.from({ length: 40 }, (_, i) => ({ t: 10 + i * 10, kind: 'kill', id: `k${i}`, side: i % 2 ? 'alpha' : 'bravo' }));
const flags = [{ t: 100, kind: 'flag', side: 'alpha' }, { t: 250, kind: 'flag', side: 'bravo' }];
const line = layoutBeats([...fight, ...flags], 420, true);
assert.equal(line.length, 8, 'the battle line keeps eight beats besides the result');
assert.equal(line.filter((beat) => beat.kind === 'flag').length, 2, 'the objectives that decided it first');
const lineKills = line.filter((beat) => beat.kind === 'kill').map((beat) => beat.t);
assert.deepEqual(lineKills, [10, 90, 170, 240, 320, 400], 'then the last kill and kills spread from the first over the battle');
for (let i = 1; i < line.length; i++) assert.ok(line[i].t >= line[i - 1].t, 'sorted by time');
assert.deepEqual(layoutBeats([...fight, ...flags], 420).map((beat) => beat.t), [10, 20, 30, 40, 50, 60, 70, 80],
  'the player\'s line keeps its kills earliest first, as before');

console.log('battleBeats.selftest: the battle line (every side\'s kills and objectives, objectives first, kills spread) passed');
console.log('battleBeats.selftest: the log (first spot, kills, zone letters and sides, module losses per life, the cap) ' +
  'and the layout (eight kept by kind, labels clear of each other and the result) passed');
