// The zombie modes (owner 2026-10-17: "the way that endless horde is supposed to work is that all the zombies actually
// have low hp. rn its humans with low hp and a bunch of overpowered glowing zombies that can steam roll them, which needs
// to be fixed to make this more fun!"). Pins the rule values, the invariants behind them (the zombies are fodder at
// spawn and stay fodder deep into a run; no fire-rate buff; the humans are the sturdy side), the controller behaviour
// (the infected hunt the nearest survivor; a Horde hostile revives at its fodder hull; the tier-down step itself, whose
// wiring into both bot builders game/zombieBotTier.selftest pins), and the measured balance band: the recorded headless
// runs (tools/mode-balance-probe.mjs, zombieBalance.measured.json: 72 Infected and 32 Horde seeds, each with a hold-out
// of the seeds no rule was tuned on) must have been measured on exactly these rules and must sit inside the band.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMatchModeController } from './matchModes.ts';
import {
  cacheHealChance, hordeHostileHull, hordeWaveHealthScale, hordeWaveSize, matchRulesetFor, modeCopyValues, rulesetBotDifficulty, rulesetLines,
} from './matchRuleset.ts';

const near = (a, b) => Math.abs(a - b) < 1e-9;
const infected = matchRulesetFor('infected');
const horde = matchRulesetFor('endless_horde');

// --- the rules ------------------------------------------------------------------------------------------------------
assert.deepEqual({ ...infected.infection }, { infectedSpeed: 1.3, survivorHpScale: 1.5, infectedHpScale: 0.3, infectedReloadScale: 1, hunt: true },
  'Infected: sturdy survivors, fragile infected that hunt at +30 % speed with no reload bonus');
assert.equal('infectedRespawnS' in infected.infection, false, 'one respawn clock: the dead infectedRespawnS is gone');
assert.equal(infected.respawnS, 5); assert.equal(infected.hpScale, 1); assert.equal(infected.timeLimitS, 420); assert.equal(infected.ammo, 'unlimited');
assert.equal(infected.enemies, 5, 'five initial infected: the outbreak comes on numbers'); assert.equal(matchRulesetFor('infected', null, { enemies: 1 }).enemies, 3, 'at least three');
assert.equal(matchRulesetFor('infected', null, { enemies: 8 }).enemies, 8, 'an arranged outbreak keeps its size');
assert.equal(horde.hpScale, 2, 'Horde: the humans\' hull doubled'); assert.equal(horde.horde.hostileHpScale, 0.15, 'the zombies at 15 % of their own');
assert.equal(horde.horde.hpPerWave, 0.02); assert.equal(horde.horde.hostileDifficultyStep, 1); assert.equal(horde.ammo, 'unlimited');
assert.equal(horde.allies, 4); assert.equal(horde.enemies, 20);

// --- the invariants: zombies are fodder, humans are sturdy, numbers carry the pressure --------------------------------
assert.ok(infected.infection.infectedHpScale * 4 <= infected.infection.survivorHpScale, 'a survivor outlasts four infected');
assert.ok(infected.infection.infectedReloadScale >= 1, 'the infected fire no faster than the survivors');
assert.ok(infected.infection.survivorHpScale >= 1, 'survivors are never fragile');
for (let wave = 1; wave <= 10; wave++) {
  const hull = hordeHostileHull(horde.horde, wave);
  assert.ok(hull <= 0.2, `wave ${wave}: a Horde hostile stays fodder (${hull.toFixed(3)} of its own hull)`);
  assert.ok(hull * 8 < horde.hpScale, `wave ${wave}: a human outlasts eight hostiles`);
}
assert.ok(hordeHostileHull(horde.horde, 50) < horde.hpScale / 4, 'fifty waves in, still a quarter of a human hull');
assert.ok(hordeWaveSize(horde.horde, 2) - hordeWaveSize(horde.horde, 1) >= 2, 'each wave brings at least two more');
assert.deepEqual(rulesetLines(infected).slice(0, 3).map((line) => [line.key, line.values.value]), [['infection', undefined], ['hp', '+50 % / -70 %'], ['ammoUnlimited', undefined]],
  'the Infected card shows both hulls in one chip (own / hostile), no line of their own');
assert.ok(rulesetLines(infected).every((line) => line.key !== 'hostileHull') && rulesetLines(horde).every((line) => line.key !== 'hostileHull'));
assert.deepEqual([modeCopyValues('infected').survivorHp, modeCopyValues('infected').infectedHp], [150, 30], 'the card copy quotes the table');

// --- the controller ---------------------------------------------------------------------------------------------------
function tank(id, team, x, z, bot = true) {
  return { id, team, bot, state: { pos: { x, y: 0, z }, yaw: 0, speed: 0 }, combat: { hp: 1000, maxHp: 1000, destroyed: false, ammo: [20], ammoCapacity: [20] } };
}
function controller(mode, entities) {
  return createMatchModeController({ mode, entities, seed: 77, terrainHeight: () => 0,
    setActive(target, active) { target.modeActive = active; },
    // the authority's and the solo revive's ruleset stamp: a fresh hull times hpScale times the controller's scale
    revive(target, spawn, healthScale) {
      Object.assign(target.state.pos, { x: spawn.x, z: spawn.z });
      target.combat = { hp: 0, maxHp: Math.round(1000 * matchRulesetFor(mode).hpScale * healthScale), destroyed: false, ammo: [20], ammoCapacity: [20] };
      target.combat.hp = target.combat.maxHp;
    } });
}
{
  const near1 = tank('near', 'alpha', 40, -20), far1 = tank('far', 'alpha', -200, -200), player = tank('player', 'alpha', 300, -100, false);
  const zombie = tank('zombie', 'bravo', 50, 60), other = tank('other', 'bravo', -190, -150);
  const mode = controller('infected', [player, near1, far1, zombie, other]);
  assert.equal(near1.combat.maxHp, 1500); assert.equal(zombie.combat.maxHp, 300, 'the stamp: 150 % survivors, 30 % infected');
  assert.deepEqual(mode.botTarget(zombie), { x: 40, z: -20 }, 'an infected bot drives at the nearest survivor');
  assert.deepEqual(mode.botTarget(other), { x: -200, z: -200 });
  assert.equal(mode.botTarget(near1), null, 'survivors roam free');
  near1.combat.destroyed = true; mode.step(1 / 60, 1);
  assert.equal(near1.team, 'bravo', 'the survivor converts');
  assert.deepEqual(mode.botTarget(zombie), { x: 300, z: -100 }, 'the hunt moves to the next nearest survivor, the human player included');
  mode.step(1 / 60, 1 + infected.respawnS);
  assert.equal(near1.combat.destroyed, false); assert.equal(near1.combat.maxHp, 300, 'a converted survivor returns as a fragile infected');
  assert.equal(near1.modeSpeedMultiplier, infected.infection.infectedSpeed);
}
{
  const player = tank('player', 'alpha', 0, -150, false);
  const hostiles = Array.from({ length: 20 }, (_, i) => tank(`h${i}`, 'bravo', i * 6, 150));
  const mode = controller('endless_horde', [player, ...hostiles]);
  const active = () => hostiles.filter((h) => h.modeActive !== false);
  let clock = 0;
  for (let wave = 1; wave <= 4; wave++) {
    assert.equal(active().length, Math.min(20, hordeWaveSize(horde.horde, wave)), `wave ${wave}: the wave law`);
    for (const h of active()) assert.equal(h.combat.maxHp, Math.round(1000 * horde.hpScale * hordeWaveHealthScale(horde, horde.horde, wave)));
    assert.ok(near(active()[0].combat.maxHp / 1000, Math.round(1000 * hordeHostileHull(horde.horde, wave)) / 1000), `wave ${wave}: the fodder hull`);
    assert.equal(mode.state.horde.healChance, cacheHealChance(horde, wave));
    for (const h of active()) h.combat.destroyed = true;
    clock += 0.5; mode.step(1 / 60, clock); clock += 6.01; mode.step(1 / 60, clock);
  }
  assert.equal(rulesetBotDifficulty(horde, 'bravo', 'normal'), 'easy', 'the zombies\' bots play a tier down (the step; zombieBotTier.selftest pins the builders)');
}

// --- the measured balance band ----------------------------------------------------------------------------------------
const measured = JSON.parse(readFileSync(new URL('./zombieBalance.measured.json', import.meta.url), 'utf8'));
/** The rules a measurement depends on: change one and the band must be measured again. */
const balanceRules = (rules) => JSON.parse(JSON.stringify({ hpScale: rules.hpScale, reloadScale: rules.reloadScale, damageScale: rules.damageScale,
  speedMultiplier: rules.speedMultiplier, ammo: rules.ammo, respawnS: rules.respawnS, timeLimitS: rules.timeLimitS, allies: rules.allies, enemies: rules.enemies,
  infection: rules.infection ?? null, horde: rules.horde ?? null }));
for (const mode of ['infected', 'endless_horde']) {
  assert.deepEqual(measured.rules[mode], balanceRules(matchRulesetFor(mode)), `${mode}: the recorded band was measured on today's rules (re-run tools/mode-balance-probe.mjs)`);
}
const inf = measured.after.infected, hrd = measured.after.endless_horde;
const infBefore = measured.before.infected, hrdBefore = measured.before.endless_horde;
// Seeds (critic 2026-10-17: the first band was fitted to the seeds the starter count was chosen on and failed on seeds
// 101-108): many seeds a mode, and a hold-out — every seed outside the ones a rule was tuned on — checked on its own.
for (const [label, run, minRuns, minHoldout] of [['Infected', inf, 48, 32], ['Horde', hrd, 24, 16]]) {
  assert.equal(new Set(run.seeds).size, run.runs, `${label}: one row a seed`);
  assert.ok(run.runs >= minRuns, `${label}: at least ${minRuns} seeds (${run.runs})`);
  assert.ok(run.tunedSeeds?.length && run.holdout, `${label}: the tuning seeds are named and the hold-out aggregated`);
  assert.equal(run.holdout.runs, run.seeds.filter((seed) => !run.tunedSeeds.includes(seed)).length, `${label}: the hold-out is every untuned seed`);
  assert.ok(run.holdout.runs >= minHoldout, `${label}: at least ${minHoldout} hold-out seeds (${run.holdout.runs})`);
}
for (const [label, run] of [['all seeds', inf], ['hold-out', inf.holdout]]) {
  // Infected: the survivors win a fair share, never all (not a steamroll either way), and kill several infected per loss
  const share = run.humanWins / run.runs;
  assert.ok(share >= 0.2 && share <= 0.7, `Infected (${label}): survivors win 20-70 % (${run.humanWins}/${run.runs})`);
  assert.ok(run.killsPerMin.ratio >= 3, `Infected (${label}): survivors kill at least three infected per survivor lost (${run.killsPerMin.ratio})`);
}
for (const [label, run] of [['all seeds', hrd], ['hold-out', hrd.holdout]]) {
  // Horde: the humans mow the zombies down and last minutes and waves, yet the numbers still overrun them
  assert.ok(run.humanSeatS.mean >= 240, `Horde (${label}): the human seat lasts 4:00 or more (${run.humanSeatS.mean} s)`);
  assert.ok(run.waves.mean >= 3, `Horde (${label}): three waves or more on average (${run.waves.mean})`);
  assert.ok(run.killsPerMin.ratio >= 5, `Horde (${label}): five zombies or more per human loss (${run.killsPerMin.ratio})`);
  assert.ok(run.overrun / run.runs >= 0.75, `Horde (${label}): the numbers still overrun the human seat in most runs (${run.overrun}/${run.runs})`);
}
// before: the steamroll the owner reported, the other way
assert.ok(infBefore.runs >= 8 && hrdBefore.runs >= 8, 'before: eight seeds a mode');
assert.equal(infBefore.humanWins, 0, 'before: the survivors never won'); assert.ok(infBefore.killsPerMin.ratio < 0.5);
assert.ok(hrdBefore.killsPerMin.ratio < 0.5 && hrdBefore.waves.mean < 1.5, 'before: the Horde overran the humans in wave one or two');

console.log(`zombieBalance: fragile zombies and sturdy humans in Infected and Endless Horde; hunt, fodder revive and the tier-down step; measured band — Infected survivors ${inf.humanWins}/${inf.runs} (hold-out ${inf.holdout.humanWins}/${inf.holdout.runs}) at ${inf.killsPerMin.ratio}:1, Horde human ${hrd.humanSeatS.mean} s over ${hrd.waves.mean} waves at ${hrd.killsPerMin.ratio}:1 (hold-out ${hrd.holdout.humanSeatS.mean} s, ${hrd.holdout.waves.mean} waves)`);
