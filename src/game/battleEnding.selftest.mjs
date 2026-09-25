// Battle endings (owner 2026-09-25: "handle battle ends better and consider all modes"): the director's beat
// matrix over every mode × verdict reason × result × who fired the last blow — the chosen beat, its duration,
// its focus and the HUD clock flash — plus the observed facts that pick the deciding objective and the beat
// clock (progress, skip, end).
import assert from 'node:assert/strict';
import { GAME_MODE_IDS } from '../sim/matchModes.ts';
import {
  planBattleEnding, resolveCameraBeat, createBattleEndingDirector, ENDING_BEAT_S,
} from './battleEnding.ts';
import { selectResultReplay } from './killcamSelection.ts';

assert.equal(ENDING_BEAT_S, 2.5, 'every camera beat runs the owner\'s 2.5 s');

const modeState = {
  id: 'zone_control', perspectiveTeam: 'alpha', respawns: true,
  flags: [
    { team: 'alpha', x: -300, z: -300, baseX: -320, baseZ: -310, status: 'home' },
    { team: 'bravo', x: 300, z: 300, baseX: 320, baseZ: 310, status: 'home' },
  ],
  zones: [
    { id: 'A', x: -100, y: 12, z: 0, control: 1, owner: 'alpha', contested: false },
    { id: 'B', x: 0, y: 14, z: 0, control: -0.4, owner: null, contested: true },
    { id: 'C', x: 100, y: 9, z: 0, control: -1, owner: 'bravo', contested: false },
  ],
  goals: [{ team: 'alpha', x: -400, y: 5, z: 0 }, { team: 'bravo', x: 400, y: 5, z: 0 }],
  line: { index: 1, total: 3, holdS: 0 },
  horde: { wave: 7, alive: 2, total: 8, nextWaveInS: 0, healChance: 0 },
};
const player = { x: 10, z: -20, y: 3 };
const verdict = (over = {}) => ({ result: 'victory', reason: 'elimination', mode: 'standard', playerDestroyed: false, player, ...over });

// who fired the last blow: how the killcam answers a replay request (killcamSelection is receipted on its own;
// here it only decides whether the director's camera beat or its replay runs)
const snap = (label, timeS) => ({ label, timeS });
const WHO_FIRED = {
  player: { pendingVictory: snap('mine', 100), lastLethal: snap('mine', 100) },
  ally: { lastLethal: snap('ally', 100) },
  bot: { lastLethal: snap('bot', 100) },
  ram: { lastLethal: snap('ram', 100) },
  fire: { lastDestroyed: { id: 'b7', cause: 'fire', timeS: 100, killerId: null }, lastHitOn: () => snap('lit', 80) },
  none: {},
  ownDeath: { pendingDeath: snap('myDeath', 99.5) },
};
const replayAnswer = (plan, result, who) => {
  if (!plan.replay) return false;
  return !!selectResultReplay({
    result, timeS: 100, finalKill: plan.replay.finalKill, playerId: 'me',
    pendingDeath: null, lastHitOnPlayer: null, pendingVictory: null, lastLethal: null, lastDestroyed: null,
    lastHitOn: () => null, timeOf: (s) => s.timeS, ...WHO_FIRED[who],
  });
};

// the matrix: every mode × every reason the sim and the authority emit × every result × who fired
const REASONS = ['elimination', 'time_limit', 'flag_limit', 'score_limit', 'goal_limit', 'horde_overrun', 'line_held',
  'assault_overrun', 'network_disconnect', 'something_new', null];
const RESULTS = ['victory', 'defeat', 'draw'];
const rows = [];
for (const mode of [...GAME_MODE_IDS, 'bogus']) {
  for (const reason of REASONS) {
    for (const result of RESULTS) {
      for (const who of Object.keys(WHO_FIRED)) {
        const plan = planBattleEnding(verdict({ mode, reason, result }), { ...modeState, id: mode });
        assert.equal(plan.skippable, true, `${mode}/${reason}/${result}: every beat is skippable`);
        const played = replayAnswer(plan, result, who);
        const resolved = resolveCameraBeat(plan, played);
        rows.push({ mode, reason, result, who, beat: plan.beat, plays: resolved.beat, durationS: resolved.durationS });
        if (resolved.beat === 'replay') {
          assert.equal(resolved.durationS, 0, 'the killcam owns the replay clock');
        } else if (resolved.beat === 'none') {
          assert.ok(reason === 'network_disconnect', `${mode}/${reason}/${result}/${who}: only a disconnect ends without a beat`);
        } else {
          assert.equal(resolved.durationS, ENDING_BEAT_S, `${mode}/${reason}/${result}/${who}: a camera beat runs 2.5 s`);
          assert.ok(plan.focus, `${mode}/${reason}/${result}/${who}: a camera beat frames something`);
        }
        assert.equal(plan.clockFlash, reason === 'time_limit', `${mode}/${reason}/${result}: the clock flashes for time's up only`);
      }
    }
  }
}
assert.equal(rows.length, (GAME_MODE_IDS.length + 1) * REASONS.length * RESULTS.length * Object.keys(WHO_FIRED).length);
const row = (mode, reason, result, who) => rows.find((r) => r.mode === mode && r.reason === reason && r.result === result && r.who === who);

// elimination: the final-kill replay whoever fired, for victory, defeat and draw alike
for (const result of RESULTS) {
  for (const who of ['player', 'ally', 'bot', 'ram', 'fire']) {
    const r = row('standard', 'elimination', result, who);
    assert.equal(r.beat, 'finalKill', `${result}/${who}: an elimination asks for the final kill`);
    assert.equal(r.plays, 'replay', `${result}/${who}: the killcam has the ${who} chain and plays it`);
  }
  assert.equal(row('standard', 'elimination', result, 'none').plays, 'pullBack', `${result}: no chain at all → a pull-back, never a bare cut`);
}
assert.equal(row('standard', 'elimination', 'defeat', 'ownDeath').plays, 'replay', 'a fresh own death still plays the death replay');
assert.equal(row('standard', 'elimination', 'victory', 'ownDeath').plays, 'pullBack', 'a stale own death decides no victory');
assert.equal(row('standard', null, 'victory', 'ally').beat, 'finalKill', 'a missing reason reads as elimination (the bridge default)');
assert.deepEqual(planBattleEnding(verdict(), null).replay, { finalKill: true });

// time's up: the pull-back over the player's tank with the clock flash, for every mode and every result
for (const mode of GAME_MODE_IDS) {
  for (const result of RESULTS) {
    const plan = planBattleEnding(verdict({ mode, reason: 'time_limit', result }), { ...modeState, id: mode });
    assert.equal(plan.beat, 'timesUp');
    assert.equal(plan.replay, null, 'no replay for a clock ending');
    assert.equal(plan.clockFlash, true);
    assert.deepEqual(plan.focus, { kind: 'player', x: 10, z: -20, y: 3, radiusM: 6, id: null });
    assert.deepEqual(plan.caption, { key: 'ending.timesUp' });
    assert.equal(row(mode, 'time_limit', result, 'player').plays, 'timesUp', 'a player kill seconds earlier does not replace the clock beat');
  }
}

// objective endings: the deciding objective from the observed facts, the winner's when nothing was observed
{
  const director = createBattleEndingDirector();
  director.observe('mode:flag_captured', { team: 'bravo', by: 'e3', score: 3 });
  const flag = director.plan(verdict({ mode: 'capture_the_flag', reason: 'flag_limit', result: 'defeat' }), { ...modeState, id: 'capture_the_flag' });
  assert.equal(flag.beat, 'objective');
  assert.deepEqual(flag.focus, { kind: 'objective', x: 320, z: 310, y: null, radiusM: 18, id: 'flag:bravo' },
    'the base the last capture ran home to');
  const flagUnknown = planBattleEnding(verdict({ mode: 'capture_the_flag', reason: 'flag_limit', result: 'victory' }), { ...modeState, id: 'capture_the_flag' });
  assert.equal(flagUnknown.focus.id, 'flag:alpha', 'without an observed capture the winner\'s own base is the deciding one');
  assert.deepEqual(flag.caption, { key: 'ending.flagCaptured' });

  director.observe('mode:zone_captured', { zoneId: 'C', team: 'bravo' });
  const zoneLost = director.plan(verdict({ mode: 'zone_control', reason: 'score_limit', result: 'defeat' }), modeState);
  assert.equal(zoneLost.focus.id, 'C', 'the zone the winner took last');
  const zoneWon = director.plan(verdict({ mode: 'zone_control', reason: 'score_limit', result: 'victory' }), modeState);
  assert.equal(zoneWon.focus.id, 'A', 'a capture by the loser is not the deciding zone: the winner\'s strongest hold is');
  assert.equal(zoneWon.focus.y, 12, 'the mode state\'s own height rides along');
  const zoneDraw = director.plan(verdict({ mode: 'mars', reason: 'score_limit', result: 'draw' }), { ...modeState, id: 'mars' });
  assert.equal(zoneDraw.focus.id, 'C', 'a draw keeps the last observed capture');
  assert.equal(zoneDraw.beat, 'objective');

  director.observe('mode:goal_scored', { team: 'alpha', by: 'me', score: 5 });
  const goal = director.plan(verdict({ mode: 'turbo_ball', reason: 'goal_limit', result: 'victory' }), { ...modeState, id: 'turbo_ball' });
  assert.deepEqual(goal.focus, { kind: 'objective', x: 400, z: 0, y: 5, radiusM: 20, id: 'goal:bravo' },
    'the goal the ball entered is the goal of the team scored against');
  assert.deepEqual(goal.caption, { key: 'ending.winningGoal' });

  const bare = planBattleEnding(verdict({ mode: 'turbo_ball', reason: 'goal_limit' }), { id: 'turbo_ball', goals: [] });
  assert.equal(bare.beat, 'pullBack', 'an objective ending without objective state pulls back over the player');
  const nothing = planBattleEnding(verdict({ mode: 'turbo_ball', reason: 'goal_limit', player: null }), { id: 'turbo_ball', goals: [] });
  assert.equal(nothing.beat, 'none', 'nothing to frame at all: present the report at once');
}

// horde: the last stand — the death replay first, the wreck orbit otherwise, and the wave milestone
{
  const director = createBattleEndingDirector();
  director.observe('mode:wave_started', { wave: 7, enemies: 11, healthScale: 1.96 });
  director.observe('tank:destroyed', { id: 'me', specId: 't90m', pos: [12, 4, -21], killerId: 'e2', cause: 'ammorack' });
  const plan = director.plan(verdict({ mode: 'endless_horde', reason: 'horde_overrun', result: 'defeat', playerDestroyed: true }), { ...modeState, id: 'endless_horde' });
  assert.equal(plan.beat, 'lastStand');
  assert.deepEqual(plan.replay, { finalKill: false }, 'the last stand is the player\'s own death, never a bot\'s kill');
  assert.equal(plan.fallback, 'wreckOrbit');
  assert.deepEqual(plan.focus, { kind: 'wreck', x: 12, z: -21, y: 4, radiusM: 6, id: 'me' });
  assert.deepEqual(plan.caption, { key: 'ending.lastStand', values: { wave: '7' } });
  assert.deepEqual(resolveCameraBeat(plan, false), { beat: 'wreckOrbit', durationS: 2.5 });
  assert.deepEqual(resolveCameraBeat(plan, true), { beat: 'replay', durationS: 0 });
}

// frontline: the line's last sector — the final one when held, the active one when the assault fell
{
  const held = planBattleEnding(verdict({ mode: 'frontline_assault', reason: 'line_held', result: 'victory' }), { ...modeState, id: 'frontline_assault' });
  assert.equal(held.beat, 'lineOverview');
  assert.equal(held.replay, null);
  assert.deepEqual(held.focus, { kind: 'sector', x: 100, z: 0, y: 9, radiusM: 30, id: 'C' });
  assert.deepEqual(held.caption, { key: 'ending.lineHeld' });
  const lost = planBattleEnding(verdict({ mode: 'frontline_assault', reason: 'assault_overrun', result: 'defeat', playerDestroyed: true }), { ...modeState, id: 'frontline_assault' });
  assert.equal(lost.beat, 'lastStand');
  assert.deepEqual(lost.replay, { finalKill: false }, 'the assault fell with the player: their death first');
  assert.equal(lost.fallback, 'lineOverview');
  assert.deepEqual(lost.focus, { kind: 'sector', x: 0, z: 0, y: 14, radiusM: 30, id: 'B' }, 'the sector under assault');
  assert.equal(row('frontline_assault', 'assault_overrun', 'defeat', 'ownDeath').plays, 'replay');
  assert.equal(row('frontline_assault', 'assault_overrun', 'defeat', 'bot').plays, 'lineOverview',
    'a bot\'s kill on an ally is not the story of a fallen assault: the line overview runs');
  // campaign (an operation on a ladder map) is the same Frontline ruleset: the same beats before the debrief
  const campaignClock = planBattleEnding(verdict({ mode: 'frontline_assault', reason: 'time_limit', result: 'defeat' }), { ...modeState, id: 'frontline_assault' });
  assert.equal(campaignClock.beat, 'timesUp', 'a campaign clock-out gets the time\'s-up beat before the debrief');
}

// draws never cut bare; a disconnect never plays a beat; an unknown reason pulls back
assert.equal(planBattleEnding(verdict({ reason: 'time_limit', result: 'draw' }), null).beat, 'timesUp');
assert.equal(planBattleEnding(verdict({ mode: 'zone_control', reason: 'score_limit', result: 'draw' }), modeState).beat, 'objective');
assert.deepEqual(planBattleEnding(verdict({ reason: 'network_disconnect' }), modeState),
  { beat: 'none', replay: null, fallback: 'none', durationS: 0, focus: null, caption: null, clockFlash: false, skippable: true });
assert.equal(planBattleEnding(verdict({ reason: 'something_new' }), null).beat, 'pullBack');
assert.deepEqual(planBattleEnding(verdict({ reason: 'something_new' }), null).caption, { key: 'ending.battleOver' });

// the beat clock: progress, skip and end
{
  const director = createBattleEndingDirector();
  const plan = director.plan(verdict({ reason: 'time_limit' }), null);
  assert.equal(director.active, false);
  assert.equal(director.progress(0), 1, 'no running beat reads as finished');
  director.begin(plan, 1000);
  assert.equal(director.active, true);
  assert.equal(director.current, plan);
  assert.equal(director.progress(1000), 0);
  assert.ok(Math.abs(director.progress(2250) - 0.5) < 1e-9, 'half way through 2.5 s');
  assert.equal(director.finished(3499), false);
  assert.equal(director.finished(3500), true);
  assert.equal(director.progress(9000), 1);
  director.begin(plan, 5000);
  director.skip();
  assert.equal(director.progress(5100), 1, 'a skip completes the beat at once');
  assert.equal(director.finished(5100), true);
  director.end();
  assert.equal(director.active, false);
  director.observe('tank:destroyed', { id: 'x', pos: [1, 2, 3], cause: 'shot' });
  director.observe('tank:destroyed', { id: 'bad', pos: null, cause: 'shot' });
  assert.equal(director.facts.lastDestroyed.id, 'x', 'a destruction without a position is not a wreck to orbit');
  director.observe('mode:wave_started', { wave: 'seven' });
  assert.equal(director.facts.wave, null, 'a malformed wave is ignored');
  director.reset();
  assert.deepEqual(director.facts, { lastFlagTeam: null, lastZone: null, lastGoalTeam: null, lastDestroyed: null, wave: null });
}

console.log(`battleEnding.selftest: ${rows.length}-row beat matrix (modes × reasons × results × who fired), objective facts, horde last stand, frontline sectors and the beat clock pass`);
