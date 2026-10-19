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
    revive(target, spawn) { Object.assign(target.state.pos, { x: spawn.x, z: spawn.z }); target.state.yaw = spawn.yaw; target.combat.destroyed = false; } });
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
// Where the infected rise (infectionBots.arrival; round 2, the critic's E1 and M12). A bot rises on the ring round the
// survivors' live centroid (a game-director decision no client is sent); a converted HUMAN is sent its own pose, so its
// ring is centred on what its side has spotted and it faces that, and with nothing spotted it rises at the infected base
// — never a pose that names the hidden survivors' bearing and range.
{
  spotted.clear();
  const ring = matchRulesetFor('infected').infectionBots.arrival;
  const [ringMin, ringMax] = ring.spawnRingM, shift = ringMin * 0.15 + 1;
  const survivors = [tank('a', 'alpha', 0, 0), tank('b', 'alpha', 24, 0), tank('c', 'alpha', 0, 24), tank('far', 'alpha', 60, 30)];
  const player = tank('player', 'alpha', 12, 12, false);
  const infected = [0, 1].map((i) => tank(`i${i}`, 'bravo', i * 20, 400));
  const mode = make('infected', [player, ...survivors, ...infected]);
  const centroid = (list) => ({ x: list.reduce((s, e) => s + e.state.pos.x, 0) / list.length, z: list.reduce((s, e) => s + e.state.pos.z, 0) / list.length });
  const live = centroid([player, ...survivors]);
  for (const bot of infected) {
    const d = Math.hypot(bot.state.pos.x - live.x, bot.state.pos.z - live.z);
    assert.ok(d >= ringMin - shift && d <= ringMax + shift, `an infected bot rises on the ring round the survivors (${d.toFixed(0)} m), not at its base`);
  }
  let t = 0;
  const step = (seconds) => { for (let k = 0; k < Math.ceil(seconds / 0.25); k++) mode.step(1 / 60, t += 0.25); };
  step(1);
  // the player converts with nothing spotted: it rises at the infected base, out of the survivors' ring
  player.combat.destroyed = true; step(0.5);
  assert.equal(player.team, 'bravo', 'the player converted');
  step(matchRulesetFor('infected').respawnS + 1);
  assert.equal(player.combat.destroyed, false, 'and rose again');
  const base = centroid(infected.map(() => ({ state: { pos: { x: 10, z: 400 } } })));
  assert.ok(Math.hypot(player.state.pos.x - base.x, player.state.pos.z - base.z) < 60,
    `with nothing spotted the convert rises at the infected base (${player.state.pos.x.toFixed(0)}, ${player.state.pos.z.toFixed(0)}), not round the hidden survivors`);
  // its side spots survivor a: the convert's next rise rings that sighting and faces it, not the live centroid
  spotted.add('a'); step(1);
  player.combat.destroyed = true; step(matchRulesetFor('infected').respawnS + 1);
  assert.equal(player.combat.destroyed, false, 'the convert rose a second time');
  const seen = survivors[0].state.pos;
  const d = Math.hypot(player.state.pos.x - seen.x, player.state.pos.z - seen.z);
  assert.ok(d >= ringMin - shift && d <= ringMax + shift, `the convert rings its side's sighting (${d.toFixed(0)} m from it)`);
  const faces = Math.atan2(seen.x - player.state.pos.x, seen.z - player.state.pos.z);
  const yawError = Math.abs(Math.atan2(Math.sin(player.state.yaw - faces), Math.cos(player.state.yaw - faces)));
  assert.ok(yawError < 0.35, `and faces the sighting (${yawError.toFixed(2)} rad off its bearing)`);
}
// The network authority hands its own spotting to the hunt (round 2, the critic's M14: without the hook every survivor
// read as spotted, so a room's hunters would have routed on hidden survivors). Survivors 1.1 km from the infected on a
// flat field, past every view range: after the first seconds the infected side has no sighting at all.
{
  const { Vector3 } = await import('three');
  await import('../vehicles/tankFactory.ts');
  const { createAuthoritativeMatch } = await import('./authoritativeMatch.ts');
  const flat = { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) };
  const rules = matchRulesetFor('infected');
  const players = [
    ...[0, 1, 2].map((i) => ({ id: `s${i}`, specId: 'm1a1_abrams_hc', team: 'alpha', bot: true, spawn: { x: -400 + i * 14, z: -400, yaw: 0 } })),
    ...[0, 1].map((i) => ({ id: `z${i}`, specId: 'm1a1_abrams_hc', team: 'bravo', bot: true, spawn: { x: 400 - i * 14, z: 400, yaw: Math.PI } })),
  ];
  const match = createAuthoritativeMatch({ gameMode: 'infected', countdownS: 0, mapId: 'verdant', seed: 31,
    ruleset: { ...rules, infectionBots: { ...rules.infectionBots, arrival: null } },
    worldCollision: { mapId: 'verdant', heightField: flat, getObstacles: () => [] }, players });
  match.onMatchReady();
  const inputs = new Map();
  for (let i = 0; i < 180; i++) match.step({ dt: 1 / 60, inputs });
  const zombie = match.entityById.get('z0');
  assert.equal(match.modeController.freshestSighting(zombie), null, 'the authority\'s infected have seen no survivor 1.1 km away');
  const hunt = match.modeController.botObjective(zombie);
  for (const id of ['s0', 's1', 's2']) {
    const survivor = match.entityById.get(id);
    assert.ok(!hunt || Math.hypot(hunt.x - survivor.state.pos.x, hunt.z - survivor.state.pos.z) > 60, `the authority's hunt does not name hidden ${id}`);
  }
}
console.log('honestHunt.selftest: the hunt names only spotted quarry, then its last sighting, then a sweep; the hunters spread; the allies leash; survivors rally; the infected rise on the ring, a converted human only round its side\'s sighting');
