// 2026-11-02 audit F1 review: the app lifecycle's verdict hold and report in a network battle. battleSubPhase reaches
// 'report' from endingHoldExpired(ruleset, resultTimeS, timeS), but only the solo sim wrote resultTimeS: the network
// verdict (battlePresentation endMatch) wrote result and resultReason, so __APP_LIFECYCLE stayed 'verdict' for good in
// every network battle, and after a solo battle reached 'report' at a time that battle's leftover resultTimeS set.
// The authority's clock freezes at its verdict + endingHoldS (authoritativeMatch stepPlaying), so the client must count
// the hold from a time no later than the authority's verdict: the presented verdict arrives a grace and a few steps late.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createTankState } from '../sim/movement.ts';
import { getSpec } from '../vehicles/specs.ts';
import { matchRulesetFor } from '../sim/matchRuleset.ts';
import { PHASE, TEAM, VERDICT, quantizePosition, zeroEntityRow } from '../mp/wire/index.ts';
import { createEntitySample } from '../mp/match/interpolation.ts';
import { createBattlePresentation } from '../mp/presentation/index.ts';
import { resetRoundState } from '../mp/session/roundState.ts';
import { clearBattleAfterExit } from './garageTankLifecycle.ts';
import { battleSubPhase } from './appLifecycle.ts';

const STEP_S = 1 / 60;
const HOLD_S = matchRulesetFor('standard').endingHoldS;
assert.ok(HOLD_S > 0, 'the standard ruleset holds the field after its verdict');

function fakeVisual() {
  return {
    root: { position: new Vector3(), userData: {} },
    setVisible() {}, syncFromState(state) { this.root.position.copy(state.pos); }, recoilKick() { return 1; },
    gunMuzzleWorld(out) { return out.set(0, 3, 0); }, gunDirWorld(out) { return out.set(0, 0, 1); },
    strippedEra: [], stripEra() {}, resetEra() {}, setDestroyed() {}, resetDestroyed() {}, dispose() {},
  };
}
const roster = [
  { entityId: 1, seat: 0, team: TEAM.ALPHA, bot: false, connected: true, playerId: 'me', name: 'Me', specId: 'm1a1_abrams_hc' },
  { entityId: 2, seat: 1, team: TEAM.BRAVO, bot: false, connected: true, playerId: 'foe', name: 'Foe', specId: 'm1a1_abrams_hc' },
];
const context = { ownEntityId: 1, ownPlayerId: 'me', roomId: 'r', mapId: 'winter', mode: 'standard', rulesetJson: '{}' };
const ownState = createTankState(getSpec('m1a1_abrams_hc'), new Vector3(0, 1.2, 0), 0);
const viewerState = { entityId: 1, modules: new Array(15).fill(0), crewBits: 0, equipment: [1000, 1000, 1000, 1000], modeSpeedMultiplier: 1000, modeGravityScale: 1000, movementVersion: 0, movementFlags: 0, movementValues: [] };
function frame(tick, battleS, verdict = VERDICT.NONE) {
  const foe = createEntitySample(2);
  Object.assign(foe, { x: 40, y: 1.2, z: 40, hp: 1500, maxHp: 2000, flags: 0, eraSpent: [] });
  return {
    tick, renderTimeMs: tick * 50, entities: [foe], shells: [],
    // the authority's snapshot clock, as matchActor publishes it (whole milliseconds of its sim time)
    meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: Math.round(battleS * 1000), verdict, verdictReason: verdict ? 'elimination' : '', destructibleRevision: 0 },
    modeStateJson: null, destroyed: [], destructibleRevision: 0,
    viewer: { entityId: 1, playerId: 'me', state: ownState, row: { ...zeroEntityRow(1), x: quantizePosition(0), y: 1200, z: quantizePosition(0), hp: 1800, maxHp: 2000 }, viewer: viewerState, authorityTick: tick, authorityReceivedAtMs: 0, predictedShot: null },
    events: [], ownShots: [], extrapolatedMs: 0, phase: 'live',
  };
}
let nowMs = 0;
async function networkBattle(game) {
  const presentation = createBattlePresentation({
    engineCtx: { scene: { add() {} }, anisotropy: 1 }, game, bus: { emit() {} },
    createTankVisual: fakeVisual, prepareVisualTextures: async () => {}, clock: () => nowMs, verdictGraceMs: 500,
  });
  await presentation.applyRoster(roster, context);
  return presentation;
}
const networkGame = (extra = {}) => ({
  tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, allTanks: [],
  timeS: 0, preBattleS: 0, result: null, resultReason: null, resultTimeS: null, mapId: 'winter', ...extra,
});

// The authority decides two steps after a 12 s snapshot; the client sees it 50 ms later and presents it after the
// grace. The authority's clock then runs to its verdict + the hold and freezes there, still publishing.
const verdictS = 12 + 2 * STEP_S;
const frozenS = verdictS + Math.ceil(HOLD_S / STEP_S) * STEP_S;
for (const [label, presentVerdict] of [
  ['the snapshot verdict after its grace', (presentation) => {
    presentation.applyFrame(frame(241, 12.05, VERDICT.ALPHA));
    nowMs += 600;
    presentation.applyFrame(frame(242, 12.1, VERDICT.ALPHA));
  }],
  ['the match_ended event after its frame', (presentation) => {
    presentation.applyFrame(frame(241, 12.05, VERDICT.ALPHA));
    presentation.applyEvent({ kind: 'match_ended', payload: { result: 'alpha', reason: 'elimination' } }, { own: false, feedbackPredicted: false });
  }],
]) {
  // a leftover solo verdict time (a solo battle ended at 400 s) is not this battle's
  const game = networkGame({ resultTimeS: 400 });
  resetRoundState(game);
  assert.equal(game.resultTimeS, null, "a new round clears the previous battle's verdict time");
  const presentation = await networkBattle(game);
  presentation.applyFrame(frame(240, 12));
  assert.equal(battleSubPhase(game), 'live');
  presentVerdict(presentation);
  assert.equal(game.result, 'victory', label);
  assert.ok(Number.isFinite(game.resultTimeS) && game.resultTimeS <= verdictS, `${label}: the verdict's time is no later than the authority's (${game.resultTimeS})`);
  presentation.applyFrame(frame(300, verdictS + HOLD_S / 2, VERDICT.ALPHA));
  assert.equal(battleSubPhase(game), 'verdict', `${label}: the field holds after the verdict`);
  presentation.applyFrame(frame(400, frozenS, VERDICT.ALPHA));
  assert.equal(battleSubPhase(game), 'report', `${label}: the report follows the hold by the frozen authority clock`);
  presentation.applyFrame(frame(401, frozenS, VERDICT.ALPHA));
  assert.equal(battleSubPhase(game), 'report');
  presentation.dispose();
}

// A lost connection ends the battle with no authority field to hold: its report is due at once.
{
  const game = networkGame();
  const presentation = await networkBattle(game);
  presentation.applyFrame(frame(240, 30));
  assert.equal(presentation.endDisconnected(), true);
  assert.equal(game.resultReason, 'network_disconnect');
  assert.equal(battleSubPhase(game), 'report', 'no frames follow a disconnect, so no hold waits for them');
  presentation.dispose();
}

// The Garage return's battle clear takes the verdict's time with its battle.
{
  const game = { tanks: [], shells: [], player: null, spotting: null, result: 'victory', resultReason: 'elimination', resultTimeS: 400,
    preBattleS: 0, timeS: 410, fireTickAcc: 0, nextShellId: 9 };
  clearBattleAfterExit({ game });
  assert.equal(game.resultTimeS, null);
}

console.log('networkVerdictPhase.selftest: a network verdict owns its time (snapshot and event), the hold ends at the frozen authority clock, disconnects report at once, resets clear it');
