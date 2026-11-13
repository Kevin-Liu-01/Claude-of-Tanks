// Proof (implicit state machine audit, round 2 U2, 2026-11-04): the keyframe extras carry only what differs from the
// state a fresh host builds. captureEntityExtras wrote every reload channel, the consumable block and the auxiliary kit
// of every entity, at rest or not, and the old host seals that keyframe for every peer every 2 s (it nearly doubled:
// 19 KB to 36 KB typical). restoreCombatExtras keeps the fresh entity's value for a field the extras leave out, so a
// field at its fresh value need not ride:
//   - at rest (loaded, nothing cooling down, kit untouched) an entry is its tallies, modules, crew, fire flag and charges;
//   - the restore is unchanged: a keyframe with entities at rest and in the middle of a fight, restored onto a fresh
//     actor and captured again there, reads the same, and the at-rest entities' channels, magazine, cooldowns and kit
//     are the old host's.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { consumeAmmunition } from '../../sim/ammunition.ts';
import { startPostShotReload } from '../../sim/damage.ts';
import { applyResumeState, captureEntityExtras, decodeMigrationKeyframe, encodeMigrationKeyframe } from './migrationState.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';

const kit = ['track_links', 'foliage', 'ir_jammer'];
const seats = [
  { seat: 0, playerId: 'ifv', name: 'IFV', team: 'alpha', specId: 'm2a2_bradley', consumables: kit },
  { seat: 1, playerId: 'auto', name: 'Auto', team: 'bravo', specId: 'leclerc_s2', consumables: kit },
  { seat: 2, playerId: 'mbt', name: 'MBT', team: 'alpha', specId: 'm1a1_abrams_hc', consumables: kit },
  { seat: 3, playerId: 'busy', name: 'Busy', team: 'bravo', specId: 'leclerc_s2', consumables: kit },
];
await ensureAuthorityFleet([...new Set(seats.map((seat) => seat.specId))]);
const world = () => ({ mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [] });
const make = (resume) => createMatchActor({ roomId: 'extras-size', mapId: 'verdant', seed: 51, seats, bots: [], world: world(), countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });
const inputs = new Map();
const old = make(null), sim = old.authority;
sim.onMatchReady();
for (let n = 0; n < 90; n++) sim.step({ dt: 1 / 60, inputs });

// ---- at rest: the entry is what a fresh host does not already have
const BASE_KEYS = new Set(['entityId', 'kills', 'damage', 'modules', 'crew', 'burning', 'consumables']);
const atRest = captureEntityExtras(old);
const extra = [];
for (const entry of atRest) {
  for (const key of Object.keys(entry)) if (!BASE_KEYS.has(key)) extra.push(`entity ${entry.entityId}: ${key} ${JSON.stringify(entry[key])}`);
  if (entry.consumables) for (const key of Object.keys(entry.consumables)) if (key !== 'charges') extra.push(`entity ${entry.entityId}: consumables.${key} ${JSON.stringify(entry.consumables[key])}`);
}
const bytes = JSON.stringify(atRest).length;
if (extra.length) {
  console.error(`migrationExtrasSize: ${extra.length} fields at their fresh value ride the keyframe (${bytes} bytes for ${atRest.length} entities at rest):\n  ${extra.join('\n  ')}`);
  assert.fail('an entity at rest carries only what a fresh host does not already have');
}
assert.ok(bytes / atRest.length < 130, `an entity at rest costs ${Math.round(bytes / atRest.length)} bytes of extras`);

// ---- in the middle of a fight beside entities at rest: the restore reads the same
const busy = sim.entityById.get('busy');
assert.equal(consumeAmmunition(busy.combat, busy.combat.shellSlot), true);
startPostShotReload(busy.combat, busy.spec);
busy.consumables.readyAt[0] = sim.timeS + 9;
busy.consumables.charges[0] = 1;
busy.consumables.until.foliage = sim.timeS + 12;
busy.combat.auxiliary.smokeCharges = 1;
busy.combat.auxiliary.smokeReadyAt = sim.timeS + 20;
busy.combat.auxiliary.lights = 1;
const tick = Math.round(sim.timeS * 60), battleTimeMs = Math.round(sim.timeS * 1000), era = createEraIndexer();
const snap = sim.snapshot({ tick, serverTimeMs: battleTimeMs, viewerId: 'migration', ackInputSeq: null });
const frame = { tick, serverTimeMs: battleTimeMs, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127, meta: captureMeta({ ...snap.meta, battleTimeMs }, false),
  destroyed: [], entities: sim.entities.map((entity) => captureEntityRow(entity, old.wireIdOf(entity.id), era, tick)), shells: [], viewer: null, modeStateJson: null };
const captured = captureEntityExtras(old);
const sealed = decodeMigrationKeyframe(encodeMigrationKeyframe({ tick, battleTimeMs, timeS: sim.timeS, phase: 'playing', modeCheckpoint: sim.captureModeCheckpoint(), entities: captured, frame }));
const busyEntry = captured.find((entry) => entry.entityId === old.wireIdOf('busy'));
assert.ok(busyEntry.reloads && busyEntry.magazineRounds !== undefined && busyEntry.consumables.readyIn && busyEntry.consumables.activeFor && busyEntry.auxiliary,
  `setup: the busy tank's fight rides the keyframe (${JSON.stringify(busyEntry)})`);
const fresh = make({ tick, battleTimeMs });
applyResumeState(fresh, sealed);
assert.equal(JSON.stringify(captureEntityExtras(fresh)), JSON.stringify(captured), 'captured again on the new host, the extras read the same');
const wrong = [];
for (const entity of sim.entities) {
  const after = fresh.authority.entityById.get(entity.id), a = entity.combat, b = after.combat, t0 = sim.timeS, t1 = fresh.authority.timeS;
  const same = (x, y, what) => { if (!(x === y || (typeof x === 'number' && typeof y === 'number' && Math.abs(x - y) < 1e-6))) wrong.push(`${entity.id} ${what}: old host ${x}, new host ${y}`); };
  a.reloadChannels.forEach((channel, slot) => { same(channel.t, b.reloadChannels[slot].t, `reload ${slot} t`); same(channel.kind, b.reloadChannels[slot].kind, `reload ${slot} kind`); });
  same(a.gunReload.t, b.gunReload.t, 'cannon reload t');
  same(a.magazine?.rounds ?? null, b.magazine?.rounds ?? null, 'magazine rounds');
  entity.consumables.readyAt.forEach((at, slot) => { same(Math.max(0, at - t0), Math.max(0, after.consumables.readyAt[slot] - t1), `slot ${slot} cooldown left`); same(entity.consumables.charges[slot], after.consumables.charges[slot], `slot ${slot} charges`); });
  for (const key of ['lights', 'gunOn', 'smokeCharges', 'shots']) same(a.auxiliary[key], b.auxiliary[key], `auxiliary ${key}`);
  same(Math.max(0, a.auxiliary.smokeReadyAt - t0), Math.max(0, b.auxiliary.smokeReadyAt - t1), 'smoke cooldown left');
}
if (wrong.length) {
  console.error(`migrationExtrasSize: ${wrong.length} readings changed across the handoff:\n  ${wrong.join('\n  ')}`);
  assert.fail('leaving fresh values out of the extras must not change the restore');
}
old.stop(); fresh.stop();
console.log(`migrationExtrasSize: an entity at rest carries ${Math.round(bytes / atRest.length)} bytes of extras (its tallies, modules, crew, fire flag and charges), and the restore of a keyframe with entities at rest and in a fight is unchanged`);
