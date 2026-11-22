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
import { MIGRATION_CHUNK_BYTES, applyResumeState, captureEntityExtras, decodeMigrationKeyframe, encodeMigrationKeyframe, encodeMigrationKeyframeWithin } from './migrationState.ts';
import { MIGRATION_MAX_CHUNKS } from '../match/migrationStore.ts';
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
// (276: and a live hull's hull exact, its pose and integrator to the bit, which no fresh host holds: MigrationEntityExtras.hull)
const BASE_KEYS = new Set(['entityId', 'kills', 'damage', 'modules', 'crew', 'burning', 'consumables', 'hull']);
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
// (the hull exact of a hull at rest: 224 characters, its pose and the few integrator numbers a hull standing still holds)
const hullBytes = atRest.reduce((sum, entry) => sum + (entry.hull ? entry.hull.length + 9 : 0), 0);
assert.ok(atRest.every((entry) => typeof entry.hull === 'string') && (bytes - hullBytes) / atRest.length < 130 && hullBytes / atRest.length < 240,
  `an entity at rest costs ${Math.round((bytes - hullBytes) / atRest.length)} bytes of extras and ${Math.round(hullBytes / atRest.length)} of hull`);

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
// ---- 275: a keyframe always fits the chunk cap. The brains, integrators and spotting a migration now carries brought a full
// field's keyframe (42 hulls, CTF, a minute in) to 47 of the 64 chunks; past the cap a blob is no keyframe at all
// (chunkMigrationBlob throws), so the encoder sheds those parts, the brains first, rather than the keyframe (276: the hulls
// exact in the integrators' place)
const capS = MIGRATION_CHUNK_BYTES * MIGRATION_MAX_CHUNKS - 12 - 16;
const plain = { tick, battleTimeMs, timeS: sim.timeS, phase: 'playing', modeCheckpoint: sim.captureModeCheckpoint(), entities: captured, frame };
const kept = encodeMigrationKeyframeWithin(plain);
assert.ok(kept.shed.length === 0 && kept.bytes.byteLength === encodeMigrationKeyframe(plain).byteLength, 'a keyframe within the cap sheds nothing');
// every entity's brain and hull padded far past the cap (a stand-in for a field of brains no room fields today)
const pad = 'A'.repeat(Math.ceil(capS / captured.length) + 64);
const swollen = { ...plain, entities: captured.map((entry) => ({ ...entry, brain: { v: 1, n: pad }, hull: 'AA' })) };
const fitted = encodeMigrationKeyframeWithin(swollen);
assert.ok(fitted.shed.join() === 'brains' && fitted.bytes.byteLength <= capS && decodeMigrationKeyframe(fitted.bytes).entities.every((e) => !e.brain && e.hull === 'AA'),
  `a keyframe past the cap sheds its brains first and fits (${fitted.shed.join(', ')}; ${fitted.bytes.byteLength} bytes of ${capS})`);
const both = { ...plain, entities: captured.map((entry) => ({ ...entry, brain: { v: 1, n: pad }, hull: pad })) };
const fittedBoth = encodeMigrationKeyframeWithin(both);
assert.ok(fittedBoth.shed.join() === 'brains,hulls' && fittedBoth.bytes.byteLength <= capS, `then its hulls (${fittedBoth.shed.join(', ')})`);
old.stop(); fresh.stop();
console.log(`migrationExtrasSize: an entity at rest carries ${Math.round(bytes / atRest.length)} bytes of extras (its tallies, modules, crew, fire flag and charges, and its hull exact), the restore of a keyframe with entities at rest and in a fight is unchanged, and a keyframe past the chunk cap sheds the brains, then the hulls, and fits`);
