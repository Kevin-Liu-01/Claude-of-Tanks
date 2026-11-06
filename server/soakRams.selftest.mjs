// soakRams.selftest — the bot soak's ram predicate judges real rams (round 3 B8, 2026-11-06). server/authoritativeBots'
// ally gate (no teammate contact at ram speed) and its per-ram viewer check (a ram reaches no viewer outside it that does
// not see both hulls) had never seen a ram: the soak's own battles produced none on any map run in rounds 2 and 3
// (verdant, steppe twice, urban, skybridge, railyard, titan_gorge, cliffbridge, foundry, ruinspires). Here the same
// predicate (soakRams.test-support.mjs, which the soak now calls) judges a staged battle on the authority's own step:
// one seat drives into a parked enemy, another into a parked teammate, and a third party far off sees neither. The gate
// counts the teammate's ram (so the soak's gate can fail), the viewer check judges the rams a near viewer reads, and the
// far viewer reads none. A hand-fed leak shows the check catches one.
import assert from 'node:assert/strict';
import { ensureAuthorityFleet } from '../src/vehicles/authorityFleet.ts';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.ts';
import { createRamTally, judgeRams } from './soakRams.test-support.mjs';

const SPEC = 'm1a1_abrams_hc';
await ensureAuthorityFleet([SPEC]); // the roster's calibration only, not the whole fleet's builders
const match = createAuthoritativeMatch({ mapId: 'verdant', seed: 4242, countdownS: 0, players: [
  { id: 'rammer', specId: SPEC, team: 'alpha', spawn: { x: -30, z: -60, yaw: 0 } },
  { id: 'enemy', specId: SPEC, team: 'bravo', spawn: { x: -30, z: -35, yaw: Math.PI / 2 } },
  { id: 'pusher', specId: SPEC, team: 'alpha', spawn: { x: 30, z: -60, yaw: 0 } },
  { id: 'mate', specId: SPEC, team: 'alpha', spawn: { x: 30, z: -35, yaw: Math.PI / 2 } },
  { id: 'watcher', specId: SPEC, team: 'bravo', spawn: { x: 0, z: -10, yaw: Math.PI } },
  { id: 'far', specId: SPEC, team: 'bravo', spawn: { x: 420, z: 420, yaw: Math.PI } },
] });
match.onMatchReady();
const teamById = new Map(match.entities.map((entity) => [entity.id, entity.team]));
const parked = { throttle: 0, steer: 0, brake: true, fire: false, aimYaw: 0, aimPitch: 0, shellSlot: 0, actionBits: 0 };
const drive = { ...parked, throttle: 1, brake: false };
const inputs = new Map([['rammer', drive], ['pusher', drive], ['enemy', parked], ['mate', parked], ['watcher', parked], ['far', parked]]);
const tally = createRamTally();
const farRams = [];
for (let tick = 0; tick < 8 * 60 && !match.result; tick++) {
  match.step({ dt: 1 / 60, inputs });
  if ((tick + 1) % 60 !== 0) continue;
  const snapshot = match.snapshot({ tick, serverTimeMs: tick * 1000 / 60 });
  judgeRams(match, teamById, snapshot, tick, tally);
  // the far seat's own reads, beside the predicate's
  farRams.push(...match.snapshot({ tick, serverTimeMs: tick * 1000 / 60, viewerId: 'far' }).events.filter((event) => event.type === 'tank_ram'));
  match.afterSnapshotBroadcast();
}
assert.ok(tally.rams >= 2, `the staged battle has rams (${tally.rams})`);
assert.ok(tally.alliedContacts >= 1, `the ally gate counts the teammate's ram (${tally.alliedContacts}): the soak's right-of-way gate can fail`);
assert.ok(tally.alliedContacts < tally.rams, 'and only the teammate\'s');
assert.ok(tally.viewerChecks >= 1, `the viewer check judged rams a third party read (${tally.viewerChecks})`);
assert.equal(tally.viewerFaults, 0, 'no ram reached a viewer that does not see both hulls');
assert.deepEqual(farRams, [], 'the far seat, which sees neither ram, reads none');

// the check's teeth: a viewer handed a ram it does not see is a fault (a hand-fed leak, not the authority's filter)
{
  const leak = { type: 'tank_ram', aId: 'a', bId: 'b' };
  const leaky = {
    entities: [{ id: 'v' }],
    observeForViewer(viewerId, seen) { seen.length = 0; },
    snapshot: () => ({ events: [] }),
    eventsForViewer: () => [leak],
  };
  const caught = createRamTally();
  judgeRams(leaky, new Map([['a', 'alpha'], ['b', 'alpha'], ['v', 'bravo']]), { events: [leak] }, 0, caught);
  assert.deepEqual(caught, { rams: 1, alliedContacts: 1, viewerChecks: 1, viewerFaults: 1 }, 'a leaked ram is a fault');
}

console.log(`soakRams: the soak's predicate over a staged battle: rams=${tally.rams} allyContacts=${tally.alliedContacts} `
  + `viewerChecks=${tally.viewerChecks} viewerFaults=0; the far seat read none; a leak is caught`);
