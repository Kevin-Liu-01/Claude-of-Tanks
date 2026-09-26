// Battle endings (owner 2026-09-25: "handle battle ends better and consider all modes"): the verdict must not
// stop the world. The solo step keeps simulating for the ruleset's post-verdict hold (wrecks settle, fires
// burn, shells in flight land) with every gun silent, then stands still under the report. The hold itself is
// the ruleset's (sim/matchRuleset.ts endingHoldExpired, pinned in matchRuleset.selftest); this receipt pins
// where state.ts reads it and that the same rule reaches the network authority.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const state = readFileSync(new URL('./state.ts', import.meta.url), 'utf8');
const core = readFileSync(new URL('./stateCore.ts', import.meta.url), 'utf8');
const authority = readFileSync(new URL('../sim/authoritativeMatch.ts', import.meta.url), 'utf8');

// the verdict time lives on the session shell and is reset with the result
assert.match(core, /resultTimeS: number \| null;/, 'the session shell carries the verdict time');
assert.match(core, /result: null,\n\s*resultReason: null,\n\s*resultTimeS: null,/, 'a fresh session has no verdict time');
assert.match(state, /game\.result = null;\n\s*game\.resultReason = null;\n\s*game\.resultTimeS = null;/,
  'a new battle clears the verdict time with the result');
// (the Jev commander, 2026-09-25, stops its request loop between the stamp and the event)
assert.match(state, /if \(game\.result !== null\) \{\n\s*game\.resultTimeS = game\.timeS;\n(?:\s*game\.jev\?\.stop\(\);\n)?\s*emitBattleEnded\(game, bus\);\n\s*\}/,
  'the verdict stamps its sim time before battle:ended is emitted');

// the step: the hold guard is the first statement, the guns fall silent right after the AI writes its input
const simStep = state.slice(state.indexOf('export function simStep('), state.indexOf('export function createCollider('));
assert.match(simStep,
  /\): void \{\n\s*\/\/[^\n]*\n\s*if \(endingHoldExpired\(game\.ruleset, game\.resultTimeS, game\.timeS\)\) return;\n\s*game\.timeS \+= SIM_DT;/,
  'past the hold the step returns before the clock advances (the field stands still under the report)');
assert.match(simStep, /stepBotControllers\(game\);\n\s*silenceGunsAfterVerdict\(game\);\n\s*applyBotSupportActions\(game, bus\);/,
  'the verdict silences every trigger after the AI writes input and before weapons resolve');
assert.match(simStep, /stepShells\(game, bus, world\);\n\s*stepFireDamage\(game, bus\);/,
  'shells in flight and fires keep resolving through the hold');
assert.match(state, /function silenceGunsAfterVerdict\(game: SoloGameState\): void \{\n\s*if \(game\.result === null\) return;\n\s*for \(const entity of game\.tanks\) entity\.input\.fire = false;/,
  'the silence is the trigger only — steering, movement and repairs stay live');
assert.match(state, /hordeWave: game\.matchModeState\?\.horde \? game\.matchModeState\.horde\.wave : null,/,
  'the ended payload names the Horde wave for the report milestone');

// the network authority reads the same ruleset hold: silent guns through the hold, a frozen step past it
assert.match(authority, /endingHoldExpired\(ruleset, resultTimeS, timeS\)/, 'the authority reads the same hold rule');
assert.match(authority, /function finishMatch\(nextResult: MatchResult, reason: string\): void \{\n\s*result = nextResult;\n\s*resultReason = reason;\n\s*resultTimeS = timeS;/,
  'the authority stamps its verdict time');
assert.match(authority, /if \(result\) for \(const entity of entities\) entity\.input\.fire = false;/,
  'the authority silences every trigger after the verdict');

console.log('battleEndingHold.selftest: verdict time, hold guard, silent guns, live shells/fires, horde wave payload and authority parity pass');
