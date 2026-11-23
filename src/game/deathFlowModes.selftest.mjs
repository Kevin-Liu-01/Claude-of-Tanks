// death-flow-275 (Kevin approved 2026-11-21): every mode's death → after-death → end, as one table. For each game mode:
// what a death shows (the full cam, the quick cam inside the respawn wait, or the card alone), the respawn dial's words and
// clock, and every verdict the mode can reach with its ending beat (a kill-decided verdict replays its final kill, a
// clock its time's-up beat, an objective its orbit) and its caption, present in both authored catalogs. A new mode or a
// new verdict reason fails here until it has a row. Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME_MODE_IDS } from '../sim/gameModeCatalog.ts';
import { matchRulesetFor } from '../sim/matchRuleset.ts';
import { deathShapeFor, quickReplayBudgetS } from './battleResultPresentationRuntime.ts';
import { planBattleEnding } from './battleEnding.ts';
import { respawnViewOf } from '../ui/respawnDial.ts';

const catalog = (name) => JSON.parse(readFileSync(new URL(`../ui/i18nCatalog.${name}.json`, import.meta.url), 'utf8'));
const en = catalog('en-US');
const zh = catalog('zh-CN');

/**
 * Per mode: the death's shape for a destroyed player (the Juggernaut's hunters respawn, its boss does not: its own row),
 * and every verdict reason the mode reaches with the beat it ends on. 'replay' = the kill that decided it, replayed.
 */
const MODES = {
  standard: { shape: 'full', reasons: { elimination: 'replay', time_limit: 'timesUp', left: null } },
  realistic: { shape: 'full', reasons: { elimination: 'replay', time_limit: 'timesUp', left: null } },
  capture_the_flag: { shape: 'quick', reasons: { flag_limit: 'objective', time_limit: 'timesUp', left: null } },
  zone_control: { shape: 'quick', reasons: { score_limit: 'objective', time_limit: 'timesUp', left: null } },
  mars: { shape: 'quick', reasons: { score_limit: 'objective', time_limit: 'timesUp', left: null } },
  air_support: { shape: 'quick', reasons: { score_limit: 'objective', time_limit: 'timesUp', left: null } },
  turbo_ball: { shape: 'card', reasons: { goal_limit: 'objective', time_limit: 'timesUp', left: null } },
  gun_game: { shape: 'card', reasons: { weapon_ladder_complete: 'replay', time_limit: 'timesUp', left: null } },
  drone: { shape: 'quick', reasons: { drone_score_limit: 'replay', time_limit: 'timesUp', left: null } },
  juggernaut: { shape: 'quick', reasons: { juggernaut_destroyed: 'replay', juggernaut_survived: 'timesUp', left: null } },
  infected: { shape: 'quick', reasons: { outbreak_complete: 'replay', survivors_extracted: 'timesUp', left: null } },
  endless_horde: { shape: 'full', reasons: { horde_overrun: 'lastStand', left: null } },
  frontline_assault: { shape: 'full', reasons: { line_held: 'lineOverview', assault_overrun: 'lastStand', assault_time: 'lineOverview', left: null } },
  ac130: { shape: 'full', reasons: { escort_extracted: 'pullBack', escort_lost: 'replay', escort_time_expired: 'timesUp', left: null } },
  proving_ground: { shape: 'card', reasons: {} },
  training: { shape: 'card', reasons: {} },
};

assert.deepEqual(Object.keys(MODES).sort(), [...GAME_MODE_IDS].sort(), 'every game mode has its death-flow row');

const verdict = (mode, reason, result) => ({
  mode, reason, result, playerDestroyed: true, player: { x: 0, z: 0, y: 0 },
});
const facts = { lastDestroyed: { id: 'me', x: 4, z: 5, y: 1, cause: 'shot' }, wave: 9, lastFlagTeam: null, lastZone: null, lastGoalTeam: null };
const modeState = (mode) => ({
  id: mode, flags: [{ team: 'alpha', x: -100, z: 0 }, { team: 'bravo', x: 100, z: 0 }],
  zones: [{ id: 'A', x: 0, z: 0, owner: 'alpha' }, { id: 'B', x: 50, z: 0, owner: 'bravo' }],
  goals: [{ team: 'alpha', x: -200, z: 0 }, { team: 'bravo', x: 200, z: 0 }], line: { index: 1, total: 3 },
});

for (const [mode, row] of Object.entries(MODES)) {
  const ruleset = matchRulesetFor(mode);
  // the death
  assert.equal(deathShapeFor(ruleset.respawnS), row.shape, `${mode}: a death shows the ${row.shape} shape (respawn ${ruleset.respawnS})`);
  if (row.shape === 'quick') {
    const budget = quickReplayBudgetS(ruleset.respawnS);
    assert.ok(budget >= 2 && budget <= 4.5 + 1e-9, `${mode}: the quick cam's budget ${budget} s fits its ${ruleset.respawnS} s wait`);
    assert.ok(budget + 1 + 1.5 <= ruleset.respawnS + 1e-9, `${mode}: the beat and the replay end before the revive`);
  }
  // the dial: a wait while down; none once the verdict is in
  if (ruleset.respawnS != null) {
    const view = respawnViewOf({ inS: ruleset.respawnS }, { id: mode, perspectiveTeam: 'alpha' }, false);
    assert.deepEqual(view, { inS: ruleset.respawnS, nextWave: false, infected: false }, `${mode}: the dial counts the revive`);
    assert.equal(respawnViewOf({ inS: 2 }, { id: mode }, true), null, `${mode}: the verdict takes the dial down`);
  }
  // the end
  for (const [reason, beat] of Object.entries(row.reasons)) {
    if (beat === null) continue; // a Leave: recorded as a defeat, no beat (the player is on the way to the Garage)
    for (const result of ['victory', 'defeat']) {
      const plan = planBattleEnding(verdict(mode, reason, result), modeState(mode), facts);
      if (beat === 'replay') {
        assert.equal(plan.beat, 'finalKill', `${mode} ${reason}: the kill that decided it is replayed`);
        assert.deepEqual(plan.replay, { finalKill: true });
      } else assert.equal(plan.beat, beat, `${mode} ${reason} ${result}: the ${beat} beat`);
      assert.ok(plan.caption, `${mode} ${reason}: a caption`);
      assert.notEqual(plan.caption.key, 'ending.battleOver', `${mode} ${reason}: its own caption, never the generic one`);
      assert.ok(en[plan.caption.key] && zh[plan.caption.key], `${mode} ${reason}: ${plan.caption.key} in en-US and zh-CN`);
    }
  }
}

// the dial's cases
assert.deepEqual(respawnViewOf({ inS: null, nextWave: true }, { id: 'endless_horde' }, false),
  { inS: null, nextWave: true, infected: false }, 'a room\'s Horde: back with the next wave');
assert.deepEqual(respawnViewOf({ inS: 4.2 }, { id: 'infected', perspectiveTeam: 'bravo' }, false),
  { inS: 5, nextWave: false, infected: true }, 'Infected: the outbreak took the player');
assert.equal(respawnViewOf(null, { id: 'standard' }, false), null, 'one life: no dial');
assert.equal(respawnViewOf({ inS: null }, { id: 'zone_control' }, false), null, 'no wait, no dial');
for (const key of ['respawn.in', 'respawn.infected', 'respawn.nextWave', 'respawn.event.infected', 'settings.leaveDefeat']) {
  assert.ok(en[key] && zh[key], `${key} in en-US and zh-CN`);
}
// a draw at the score target is a dead heat, not "score target reached"
assert.deepEqual(planBattleEnding(verdict('zone_control', 'score_limit', 'draw'), modeState('zone_control'), facts).caption,
  { key: 'ending.deadHeat' });
// the Horde reads as a run
assert.deepEqual(planBattleEnding(verdict('endless_horde', 'horde_overrun', 'defeat'), modeState('endless_horde'), facts).caption,
  { key: 'ending.runOver', values: { wave: '9' } });

console.log(`deathFlowModes.selftest: ${Object.keys(MODES).length} modes' death shapes, respawn dials and ending beats and captions pass`);
