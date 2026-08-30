import assert from 'node:assert/strict';

import { createBattlePhasePolicy } from './battlePhasePolicy.ts';

const state = {
  phase: 'garage',
  result: false,
  controllable: true,
  killcam: false,
  loading: false,
};
const policy = createBattlePhasePolicy({
  getPhase: () => state.phase,
  hasResult: () => state.result,
  hasControllablePlayer: () => state.controllable,
  isKillcamActive: () => state.killcam,
  isBattleLoadVisible: () => state.loading,
});

assert.equal(policy.isGarage(), true);
assert.equal(policy.isBattle(), false);
assert.equal(policy.canOpenBattleSettings(), false);
assert.equal(policy.canLeaveBattle(), false);
assert.equal(policy.shouldPresentDisconnect(), false);

state.phase = 'battle';
assert.equal(policy.isBattle(), true);
assert.equal(policy.canOpenBattleSettings(), true);
assert.equal(policy.canLeaveBattle(), true);
assert.equal(policy.isPauseEligible(), true);
assert.equal(policy.isBattleStageVisible(), true);
assert.equal(policy.shouldPresentDisconnect(), true);
assert.equal(policy.canRecapturePointer({ settingsOpen: false, spectating: false }), true);

state.loading = true;
assert.equal(policy.isBattleStageVisible(), false);
state.loading = false;
state.killcam = true;
assert.equal(policy.isPauseEligible(), false);
assert.equal(policy.canRecapturePointer({ settingsOpen: false, spectating: false }), false);
state.killcam = false;
assert.equal(policy.canRecapturePointer({ settingsOpen: true, spectating: false }), false);
assert.equal(policy.canRecapturePointer({ settingsOpen: false, spectating: true }), false);

state.controllable = false;
assert.equal(policy.canOpenBattleSettings(), false);
assert.equal(policy.canRecapturePointer({ settingsOpen: false, spectating: false }), false);
assert.equal(policy.shouldPresentDisconnect(), true,
  'a dead player still sees a live network-disconnect recovery state');
state.controllable = true;
state.result = true;
assert.equal(policy.canOpenBattleSettings(), false);
assert.equal(policy.isPauseEligible(), false);
assert.equal(policy.shouldPresentDisconnect(), false);
assert.equal(policy.canLeaveBattle(), true);

assert.throws(() => createBattlePhasePolicy({}), /requires every state reader/);

console.log('battlePhasePolicy.selftest: phase consumers share one live-battle policy');
