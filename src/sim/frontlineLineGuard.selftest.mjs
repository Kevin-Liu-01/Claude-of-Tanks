// Frontline's line guard (268, Main item 9): on 64 seeds across the eight rotation maps, no defender of the opening line
// stands within the guard's minAttackM of a living attacker or in an attacker's terrain sight, measured on the match's
// own opening ground (the map's pre-placed craters on the base, as freshMatchGround lays it) with the wave law's sight
// constants. The old guard stepped back four times and then placed the defender anyway (and judged the slot before the
// placement moved the hull): this sweep put 74 of its 192 defenders in sight on 40 seeds. The guard now searches the
// defender's ground, judged where the placement stands the hull (sim/matchModes.ts lineSlot).
import assert from 'node:assert/strict';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { matchRulesetFor, terrainVariantFor } from './matchRuleset.ts';
import { createDeformedHeightField, createTerrainDeformation } from './terrainDeformation.ts';
import { mapCraterStampsOf, stampMapCraters } from '../world/mapCraters.ts';
import { createRoom } from '../mp/room/roomPolicy.ts';
import { planFromRoom } from '../mp/host/hostPlan.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

await ensureAuthorityFleet();
const MAPS = ['verdant', 'badlands', 'urban', 'desert', 'winter', 'autumn', 'steppe', 'coastal'];
const SEEDS = 64;
const ruleset = matchRulesetFor('frontline_assault');
const guard = ruleset.assault.lineGuard;
const sight = ruleset.horde ?? matchRulesetFor('endless_horde').horde;
assert.ok(guard && guard.outOfSight && guard.minAttackM > 0, 'Frontline guards its line');

/** A defender's exposure at the start: the nearest living attacker, and whether one sees it (the mode's own march). */
function exposure(field, attackers, x, z) {
  let nearestM = Infinity, seen = false;
  for (const attacker of attackers) {
    const fx = attacker.state.pos.x, fz = attacker.state.pos.z, d = Math.hypot(x - fx, z - fz);
    nearestM = Math.min(nearestM, d);
    if (seen || d > sight.sightRangeM) continue;
    const fy = attacker.state.pos.y + sight.sightEyeM, ty = field.getHeightAt(x, z) + sight.sightHullM;
    let clear = true;
    for (let step = sight.sightStepM; step < d - sight.sightStepM * 0.5; step += sight.sightStepM) {
      const f = step / d;
      if (field.getHeightAt(fx + (x - fx) * f, fz + (z - fz) * f) > fy + (ty - fy) * f + sight.sightMarginM) { clear = false; break; }
    }
    if (clear) seen = true;
  }
  return { nearestM, seen };
}

const failures = [];
let defenders = 0, controls = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  const mapId = MAPS[(seed - 1) % MAPS.length];
  const room = createRoom({ roomCode: 'GUARD1', mode: 'private', creator: { id: 'lead', name: 'Lead' }, selection: { specId: 'm1a1_abrams_hc' },
    settings: { teamSize: 2, gameMode: 'frontline_assault', mapId }, now: 1000 });
  const plan = planFromRoom(room, { seed });
  const world = createDedicatedWorldCollision(mapId, { variant: terrainVariantFor('frontline_assault') });
  const players = [...plan.seats.filter((seat) => seat.team !== 'spectator').map((seat) => ({ id: seat.playerId, specId: seat.specId, team: seat.team, equipment: [] })),
    ...plan.bots.map((bot) => ({ id: bot.playerId, specId: bot.specId, team: bot.team, bot: true }))];
  const match = createAuthoritativeMatch({ mapId, seed, countdownS: 0, gameMode: 'frontline_assault', worldCollision: world, players });
  match.onMatchReady();
  const ground = createTerrainDeformation();
  stampMapCraters(ground, mapCraterStampsOf(world));
  const field = createDeformedHeightField(world.heightField, ground);
  const alive = (entity) => entity.modeActive !== false && !entity.combat.destroyed;
  const attackers = match.entities.filter((entity) => entity.team === 'alpha' && alive(entity));
  const line = match.entities.filter((entity) => entity.team === 'bravo' && alive(entity));
  assert.equal(line.length, ruleset.assault.initialActive, `seed ${seed} (${mapId}): the opening line is fielded`);
  for (const defender of line) {
    defenders++;
    const { nearestM, seen } = exposure(field, attackers, defender.state.pos.x, defender.state.pos.z);
    if (nearestM < guard.minAttackM || seen) failures.push({ seed, mapId, id: defender.id, nearestM: Math.round(nearestM), seen });
  }
  // the measure itself sees: a point 60 m in front of the attack is inside the guard and in its sight
  const lead = attackers[0];
  const probe = exposure(field, attackers, lead.state.pos.x + Math.sin(lead.state.yaw) * 60, lead.state.pos.z + Math.cos(lead.state.yaw) * 60);
  if (probe.nearestM < guard.minAttackM && probe.seen) controls++;
  world.release?.();
}
assert.deepEqual(failures, [], `no defender of the opening line inside ${guard.minAttackM} m of the attack or in its sight (${failures.length} of ${defenders})`);
assert.equal(controls, SEEDS, `the measure sees a point in front of the attack on every seed (${controls} of ${SEEDS})`);
console.log(`frontlineLineGuard.selftest: ${SEEDS} seeds on ${MAPS.length} maps, ${defenders} defenders of the opening line, none within ${guard.minAttackM} m of `
  + `the attack or in its terrain sight (${sight.sightRangeM} m) on the match's own ground; the measure sees a point in front of the attack on every seed`);
