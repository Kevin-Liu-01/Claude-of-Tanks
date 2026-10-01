import assert from 'node:assert/strict';
import { createBotTerrainSafety } from './botTerrainSafety.ts';
import { matchRulesetFor } from './matchRuleset.ts';

function tank(mode = 'standard') {
  const rules = matchRulesetFor(mode);
  return { spec: { weightTons: 60, dims: { widthM: 3.5, lengthM: 7 } },
    state: { pos: { x: 0, z: 0 }, yaw: 0, speed: 10, grounded: true },
    combat: { hp: 1000 }, modePhysics: rules.physics,
    modeGravityScale: rules.gravityScale, modeJumpMps: rules.jumpMps };
}
const cliff = createBotTerrainSafety({getHeightAt: (_x,z) => z > 12 ? -18 : 0});
assert.equal(cliff.corridorSafe(tank(),0,30),false,'sees a lethal drop inside the stopping envelope');
assert.equal(cliff.corridorSafe(tank(),Math.PI,30),true,'safe return route remains available');
assert.equal(cliff.corridorSafe(tank(),0,-30),true,'reverse checks behind the tank');
assert.equal(createBotTerrainSafety({getHeightAt: (_x,z) => -z*.15}).corridorSafe(tank(),0,30),true,
  'a continuous road descending a hill is not a free fall');
const deck = {x:0,z:20,ux:0,uz:1,halfLength:20,halfWidth:6,deckY:0,approachM:8};
assert.equal(createBotTerrainSafety({bridgeDecks:[deck],getHeightAt:()=>-30}).corridorSafe(tank(),0,30),true,
  'bridge users evaluate the road deck, not the river bottom');
assert.equal(createBotTerrainSafety({bridgeDecks:[deck],getHeightAt:()=>-30}).corridorSafe(tank(),Math.PI/2,30),false,
  'turning off the bridge edge is dangerous');
for (const mode of ['mars','turbo_ball']) {
  const bot=tank(mode); bot.modeJumpMps ??= mode==='mars'?9.5:12;
  const flat=createBotTerrainSafety({getHeightAt:()=>0});
  assert.equal(flat.jumpLandingSafe(bot,25),true,`${mode} uses its own forgiving jump landing physics`);
  assert.equal(createBotTerrainSafety({getHeightAt:(_x,z)=>z>10?-100:0}).jumpLandingSafe(bot,25),false,
    `${mode} still rejects a jump into a deep gorge`);
}
console.log('botTerrainSafety.selftest: drop cost, reverse, hills, bridge decks and mode-specific jump landings passed');
