import assert from 'node:assert/strict';
import { BALANCE_SCENARIOS } from './balanceScenarios.ts';
import { runBalanceDuel, runBalanceSeries } from './balanceSimulation.ts';

const deterministicA = runBalanceDuel({ aId: 'm1a2', bId: 'm1a2', seed: 8675309 });
const deterministicB = runBalanceDuel({ aId: 'm1a2', bId: 'm1a2', seed: 8675309 });
assert.deepEqual(deterministicA, deterministicB,
  'the same roster, seed and range setup reproduce an identical duel');

for (const scenario of BALANCE_SCENARIOS) {
  const { id, purpose, minAScore = 0, maxAScore = 1, ...options } = scenario;
  const receipt = runBalanceSeries(options);
  assert.equal(receipt.duels, receipt.seeds.length * 2,
    `${id}: every seed runs from both range ends`);
  assert.equal(receipt.aWins + receipt.bWins + receipt.draws, receipt.duels,
    `${id}: every duel has a recorded outcome`);
  assert.ok(receipt.aScore >= minAScore && receipt.aScore <= maxAScore,
    `${id}: ${purpose} score ${receipt.aScore} stays in reviewed band ${minAScore}-${maxAScore}`);
  assert.ok(Number.isFinite(receipt.averageDurationS) && receipt.averageDurationS > 0,
    `${id}: records a finite battle duration`);
}

console.log(`balanceMatchups.selftest: ${BALANCE_SCENARIOS.length} deterministic matchup scenarios passed`);
