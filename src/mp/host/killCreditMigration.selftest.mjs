// killCreditMigration.selftest.mjs — a host migration keeps who gets the kill (279; death-flow-275 R7, R8). Copyright (c) 2026 Kevin B. Liu.
//
// The authority keeps two kill-credit ledgers (sim/fireCredit.ts): who set each burning hull alight (R8: a hull that burns
// out is its starter's kill) and each hull's last damaging enemy with when (R7: a crew that scuttles within
// SCUTTLE_CREDIT_S hands the kill to that enemy). Neither rode the migration keyframe until 279, so a burning hull that
// burned out after a migration was its own kill and a scuttle credited nobody. Built as combatMigration builds a handoff:
// one actor plays, its ledgers hold a fire's starter and a recent hit, a keyframe is sealed, encoded, decoded and applied
// to a second actor on the same roster, and both hosts step on through the burn-out and a scuttle on the same tick:
//   - the new host credits both deaths as the old host does (the starter's kill, the attacker's), events and kill counts;
//   - the ledgers ride NewModeCheckpoint.host on the battle clock (a migrated host's own clock restarts at 0), so a hit
//     2 s old on the old host is 2 s old on the new;
//   - a revive forgets both (reviveForMode, the solo revive too), and a hull revived after the keyframe is dropped from
//     what the keyframe carried (migrationState.ts checkpointAfterRevives).
// Negative control: the same handoff with the checkpoint's two ledgers dropped (the receipt's reverted fix): the burn-out is
// the hull's own and the scuttle credits nobody, on the new host alone.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { applyResumeState, captureEntityExtras, decodeMigrationKeyframe, encodeMigrationKeyframe } from './migrationState.ts';
import { PLAYER_ACTION_BITS } from '../../sim/playerActions.ts';
import { SCUTTLE_CREDIT_S } from '../../sim/matchRuleset.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';

const seats = [
  { seat: 0, playerId: 'shooter', name: 'Shooter', team: 'bravo', specId: 'leclerc_s2' },
  { seat: 1, playerId: 'burner', name: 'Burner', team: 'alpha', specId: 'leclerc_s2' },
  { seat: 2, playerId: 'scuttler', name: 'Scuttler', team: 'alpha', specId: 'leclerc_s2' },
];
await ensureAuthorityFleet(seats.map((seat) => seat.specId));
const world = () => ({ mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [] });
const make = (resume) => createMatchActor({ roomId: 'kill-credit', mapId: 'verdant', seed: 33, seats, bots: [], world: world(), countdownS: 0, autoStart: false,
  now: () => 0, schedule: () => () => {}, resume });
const DT = 1 / 60;

/** One step; the destructions it told, as [id, killerId, cause]. */
function step(sim, inputs = new Map()) {
  sim.step({ dt: DT, inputs });
  const told = sim.eventsForViewer('shooter').filter((event) => event.type === 'tank_destroyed').map((event) => [event.id, event.killerId, event.cause]);
  sim.afterEventBroadcast();
  return told;
}

/** The old host mid-fight and a new host from its keyframe; `drop` seals it without the two ledgers (the control). */
function handoff({ drop = false } = {}) {
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  for (let n = 0; n < 240; n++) step(sim);
  // the fight: the shooter set the burner alight and hit the scuttler 2 s ago (the ledgers as a hit leaves them)
  const checkpoint = sim.captureModeCheckpoint();
  sim.restoreModeCheckpoint({ ...checkpoint, host: { ...checkpoint.host, fireStarters: [['burner', 'shooter']], recentDamage: [['scuttler', 'shooter', sim.battleS - 2]] } });
  const burner = sim.entityById.get('burner');
  Object.assign(burner.combat.fire, { burning: true, ticksLeft: 40, tickTimer: 0 });
  burner.combat.hp = Math.min(burner.combat.hp, 1);
  const sealed = sim.captureModeCheckpoint();
  assert.deepEqual(sealed.host.fireStarters, [['burner', 'shooter']], 'setup: the old host holds the fire\'s starter');
  assert.deepEqual(sealed.host.recentDamage, [['scuttler', 'shooter', sim.battleS - 2]], 'setup: and the hit on the battle clock');
  if (drop) { delete sealed.host.fireStarters; delete sealed.host.recentDamage; }

  const tick = Math.round(sim.timeS * 60), battleTimeMs = Math.round(sim.timeS * 1000), era = createEraIndexer();
  const snapshot = sim.snapshot({ tick, serverTimeMs: battleTimeMs, viewerId: 'migration', ackInputSeq: null });
  const keyframe = { tick, battleTimeMs, timeS: sim.timeS, battleS: sim.battleS, phase: 'playing', modeCheckpoint: sealed, entities: captureEntityExtras(old),
    frame: { tick, serverTimeMs: battleTimeMs, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127,
      meta: captureMeta({ ...snapshot.meta, battleTimeMs }, false), destroyed: [], entities: sim.entities.map((entity) => captureEntityRow(entity, old.wireIdOf(entity.id), era, tick)),
      shells: [], viewer: null, modeStateJson: null } };
  const fresh = make({ tick, battleTimeMs, battleS: sim.battleS });
  applyResumeState(fresh, decodeMigrationKeyframe(encodeMigrationKeyframe(keyframe)));
  fresh.authority.onMatchReady();
  return { old, fresh };
}

/** Both hosts on: the scuttler scuttles on the next step, then the burner burns out; each host's deaths and the shooter's kills. */
function playOut({ old, fresh }) {
  const out = [];
  for (const actor of [old, fresh]) {
    const sim = actor.authority;
    const kills0 = sim.entityById.get('shooter').kills;
    const deaths = step(sim, new Map([['scuttler', { actionBits: PLAYER_ACTION_BITS.SCUTTLE }]]));
    for (let n = 0; n < 60 * 20 && !sim.entityById.get('burner').combat.destroyed; n++) deaths.push(...step(sim));
    out.push({ deaths: deaths.filter(([id]) => id === 'burner' || id === 'scuttler').sort(), kills: sim.entityById.get('shooter').kills - kills0 });
    actor.stop();
  }
  return out;
}

const [oldHost, newHost] = playOut(handoff());
assert.deepEqual(oldHost.deaths, [['burner', 'shooter', 'fire'], ['scuttler', 'shooter', 'scuttle']], 'the old host: the burn-out and the scuttle are the shooter\'s kills');
assert.equal(oldHost.kills, 2, 'the old host counts both for the shooter');
assert.deepEqual(newHost.deaths, oldHost.deaths, `the new host credits them alike (${JSON.stringify(newHost.deaths)})`);
assert.equal(newHost.kills, oldHost.kills, 'and counts them alike');

// ---- negative control: the keyframe without the ledgers (279's carry reverted)
const [, bare] = playOut(handoff({ drop: true }));
assert.deepEqual(bare.deaths, [['burner', 'burner', 'fire'], ['scuttler', 'scuttler', 'scuttle']],
  `negative control: without the ledgers the new host makes the burn-out the hull's own and the scuttle nobody's (${JSON.stringify(bare.deaths)})`);
assert.equal(bare.kills, 0, 'negative control: and the shooter scores neither');

// ---- the window: a hit older than SCUTTLE_CREDIT_S on the battle clock credits nobody on either host
{
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  for (let n = 0; n < 60 * (SCUTTLE_CREDIT_S + 2); n++) step(sim);
  const checkpoint = sim.captureModeCheckpoint();
  sim.restoreModeCheckpoint({ ...checkpoint, host: { ...checkpoint.host, recentDamage: [['scuttler', 'shooter', sim.battleS - SCUTTLE_CREDIT_S - 1]] } });
  const deaths = step(sim, new Map([['scuttler', { actionBits: PLAYER_ACTION_BITS.SCUTTLE }]]));
  assert.deepEqual(deaths.filter(([id]) => id === 'scuttler'), [['scuttler', 'scuttler', 'scuttle']], 'a hit past the window credits nobody (the battle clock\'s seconds)');
  old.stop();
}

console.log(`killCreditMigration: a migration keeps who set a fire and who hurt a hull last: the burn-out and the scuttle after it are the shooter's on the new host as on the old (${JSON.stringify(newHost.deaths)}); without the ledgers the new host gives the burn-out to the hull and the scuttle to nobody`);
