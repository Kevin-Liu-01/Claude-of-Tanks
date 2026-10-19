// The honest hunt (gameplay-modes-228; the coordinator: "spotting-respecting, no cheating"). The Horde's zombies and
// the infected route on what their side has SPOTTED — the nearest spotted quarry, else the side's freshest sighting
// within HUNT_RULES.lastSeenMaxS, else a sweep — never on a hidden survivor's live position (the integ/228 hunt did
// in 19-26 % of its samples). Hunters spread over the quarry (one each before any doubles up) and approach on lanes;
// the Horde's allies stay within allyLeashM of the humans; Infected survivors close ranks.
import assert from 'node:assert/strict';
import { createMatchModeController } from './matchModes.ts';
import { HUNT_RULES, matchRulesetFor } from './matchRuleset.ts';

const tank = (id, team, x, z, bot = true) => ({ id, team, bot, state: { pos: { x, y: 0, z }, yaw: 0, speed: 0 },
  combat: { hp: 1000, maxHp: 1000, destroyed: false, ammo: [20], ammoCapacity: [20] } });
const spotted = new Set();
function make(mode, entities, ruleset = undefined) {
  return createMatchModeController({ mode, entities, seed: 5, terrainHeight: () => 0, ...(ruleset ? { ruleset } : {}),
    spotting: { isSpotted: (id) => spotted.has(id) },
    setActive(target, active) { target.modeActive = active; },
    revive(target, spawn) { Object.assign(target.state.pos, { x: spawn.x, z: spawn.z }); target.combat.destroyed = false; } });
}
const at = (point, target) => Math.hypot(point.x - target.state.pos.x, point.z - target.state.pos.z);

// Infected: a hidden survivor next to the hunter is never its objective; the spotted one far away is
{
  const hidden = tank('hidden', 'alpha', 30, 0), seen = tank('seen', 'alpha', 400, 0), player = tank('player', 'alpha', 380, 20, false);
  const infected = tank('infected', 'bravo', 0, 0);
  const mode = make('infected', [player, hidden, seen, infected], { ...matchRulesetFor('infected'), infectionBots: { ...matchRulesetFor('infected').infectionBots, arrival: null } });
  spotted.add('seen'); spotted.add('player');
  Object.assign(infected.state.pos, { x: 0, z: 0 });
  let t = 0; mode.step(1 / 60, t += 0.6);
  const objective = mode.botObjective(infected);
  assert.equal(objective.mission, 'hunt');
  assert.ok(at(objective, hidden) > 100, `the hunt never names the hidden survivor 30 m away (objective ${objective.x.toFixed(0)}, ${objective.z.toFixed(0)})`);
  assert.ok(Math.min(at(objective, seen), at(objective, player)) < 250, 'it hunts a spotted survivor (on its lane)');
  // the spotted survivor hides: the hunt keeps its last sighting for lastSeenMaxS, never the live position
  spotted.clear();
  seen.state.pos.x = -300; player.state.pos.x = -320;
  for (let i = 0; i < 4; i++) mode.step(1 / 60, t += 0.6);
  const memory = mode.botObjective(infected);
  assert.ok(at(memory, seen) > 300 && at(memory, player) > 300, 'a hidden survivor\'s new position is not leaked');
  assert.ok(Math.hypot(memory.x - 400, memory.z - 0) < 260, 'the hunt goes where the side last saw it');
  const lead = mode.freshestSighting(infected);
  assert.ok(lead && Math.hypot(lead.x - 390, lead.z - 10) < 30, 'the side\'s freshest sighting is where the survivors were seen');
  // past the memory: a sweep round the last contact or the survivors' deployment, still not the hidden live positions
  for (let i = 0; i < Math.ceil(HUNT_RULES.lastSeenMaxS / 0.6) + 2; i++) mode.step(1 / 60, t += 0.6);
  assert.equal(mode.freshestSighting(infected), null, 'the sighting has gone stale');
  const sweep = mode.botObjective(infected);
  assert.ok(at(sweep, hidden) > 40 && at(sweep, seen) > 40, 'the sweep is no live position either');
}
// the hunters spread: four hunters, two spotted survivors — two each, never four on one
{
  spotted.clear();
  const s1 = tank('s1', 'alpha', -200, 0), s2 = tank('s2', 'alpha', 200, 0), human = tank('human', 'alpha', 0, -300, false);
  const hunters = [0, 1, 2, 3].map((i) => tank(`h${i}`, 'bravo', -20 + i * 13, 150));
  const pool = Array.from({ length: 4 }, (_, i) => tank(`p${i}`, 'bravo', 300 + i * 8, 400));
  const mode = make('endless_horde', [human, s1, s2, ...hunters, ...pool], { ...matchRulesetFor('endless_horde'), horde: { ...matchRulesetFor('endless_horde').horde, spawnOutOfSight: false, waveSize: 4 } });
  spotted.add('s1'); spotted.add('s2');
  // the hunters stand equidistant from both (the crowd penalty decides, not the distance)
  const live = [...hunters, ...pool].filter((h) => h.modeActive !== false);
  live.forEach((h, k) => Object.assign(h.state.pos, { x: k % 2 ? 4 : -4, z: 200 + k }));
  mode.step(1 / 60, 0.6);
  const quarry = live.map((h) => { const o = mode.botObjective(h); return at(o, s1) < at(o, s2) ? 's1' : 's2'; });
  const counts = quarry.reduce((acc, q) => ({ ...acc, [q]: (acc[q] ?? 0) + 1 }), {});
  assert.deepEqual(Object.values(counts).sort(), [2, 2], `one quarry each before any doubles up (${JSON.stringify(counts)})`);
  // the allies stay with the humans: one beyond allyLeashM rejoins as an escort
  const ally = tank('ally', 'alpha', 0, -300);
  const withAlly = make('endless_horde', [human, ally, ...hunters], { ...matchRulesetFor('endless_horde'), horde: { ...matchRulesetFor('endless_horde').horde, spawnOutOfSight: false } });
  Object.assign(ally.state.pos, { x: 400, z: 300 });
  const rejoin = withAlly.botObjective(ally);
  assert.equal(rejoin.mission, 'escort', 'an ally beyond the leash rejoins the humans');
  assert.ok(at(rejoin, human) < 1, 'at the humans\' centroid');
}
// Infected survivors close ranks on their own centroid (own-side positions only)
{
  spotted.clear();
  const a = tank('a', 'alpha', 0, 0), b = tank('b', 'alpha', 20, 0), c = tank('c', 'alpha', 0, 20), d = tank('d', 'alpha', 20, 20);
  const straggler = tank('far', 'alpha', 200, 0), z = tank('z', 'bravo', 0, 400);
  const mode = make('infected', [a, b, c, d, straggler, z]);
  const rally = mode.botTarget(straggler);
  assert.ok(rally && Math.hypot(rally.x - 48, rally.z - 8) < 1, 'a straggler heads for the survivors\' centroid');
  assert.equal(rally.mission, undefined, 'unlabelled: an engaged survivor keeps fighting at range');
  assert.equal(mode.botTarget(a), null, 'a survivor with the group holds');
}
console.log('honestHunt.selftest: the hunt names only spotted quarry, then its last sighting, then a sweep; the hunters spread; the allies leash; survivors rally');
