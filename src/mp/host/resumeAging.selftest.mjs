// Proof (implicit state machine audit, round 2 U2, 2026-11-04): how far a resumed entity's keyframe extras age. The
// elected seat's newest frame overlays the keyframe's rows (resumeStateFromRetained), and applyResumeState aged each
// entity's extras (the background reload channels, a red module's repair, consumable cooldowns and windows) by its row's
// tick gap. Two ways that was wrong:
//   - ticks are not sim time: the old host's fixed-step loop drops ticks on a stall (server/match/loop.ts) and the tick
//     keeps the wall grid while the sim stands, so a frame two seconds of ticks after the keyframe can be one second of
//     sim after it (its battle clock says so). The extras aged by the ticks: cooldowns a second short, reloads and repairs
//     a second ahead;
//   - a row a delta left untouched (or an interest tier held) keeps its older tick on the client, so the keyframe's row
//     stood for that entity with no gap and its extras came back unaged, although the world had moved on to the newest
//     frame: a parked tank's cooldowns, repair and background reload a keyframe interval behind.
// Built as combatMigration's overlay handoff: one actor plays, a keyframe is sealed through the codec, the old host plays
// on, its newest frame overlays the keyframe, and a second actor on the same roster takes the resume.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { selectShell } from '../../sim/damage.ts';
import { applyResumeState, captureEntityExtras, decodeMigrationKeyframe, encodeMigrationKeyframe, resumeStateFromRetained } from './migrationState.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';

const kit = ['track_links', 'foliage', 'ir_jammer'];
const seats = [
  { seat: 0, playerId: 'moving', name: 'Moving', team: 'alpha', specId: 'm2a2_bradley', consumables: kit },
  { seat: 1, playerId: 'parked', name: 'Parked', team: 'bravo', specId: 'm2a2_bradley', consumables: kit },
];
await ensureAuthorityFleet(seats.map((seat) => seat.specId));
const world = () => ({ mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [] });
const make = (resume) => createMatchActor({ roomId: 'resume-aging', mapId: 'verdant', seed: 31, seats, bots: [], world: world(), countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });
const inputs = new Map();
const era = createEraIndexer();
/** A frame of the old host at `tick` (the ticks may run ahead of its sim: dropped ticks), its meta on the sim's battle clock. */
const frameOf = (actor, tick, rowOf = (entity) => captureEntityRow(entity, actor.wireIdOf(entity.id), era, tick)) => {
  const authority = actor.authority, battleTimeMs = Math.round(authority.timeS * 1000);
  const snap = authority.snapshot({ tick, serverTimeMs: Math.round(tick * 1000 / 60), viewerId: 'migration', ackInputSeq: null });
  return { tick, serverTimeMs: Math.round(tick * 1000 / 60), ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127,
    meta: captureMeta({ ...snap.meta, battleTimeMs }, false), destroyed: [], entities: authority.entities.map(rowOf), shells: [], viewer: null, modeStateJson: null };
};

const old = make(null), sim = old.authority;
sim.onMatchReady();
for (let n = 0; n < 90; n++) sim.step({ dt: 1 / 60, inputs });
const moving = sim.entityById.get('moving'), parked = sim.entityById.get('parked');
// the parked tank's row as the elected seat holds it: last changed before the keyframe (a delta has left it untouched)
const heldTick = Math.round(sim.timeS * 60);
const parkedHeld = captureEntityRow(parked, old.wireIdOf(parked.id), era, heldTick);
for (let n = 0; n < 30; n++) sim.step({ dt: 1 / 60, inputs });

// the keyframe: on both hulls the TOW reloading behind the selected cannon, a red gun into its repair, a cooldown and a
// timed item running (none of which the wire row carries)
const tK = sim.timeS;
for (const tank of [moving, parked]) {
  const tow = tank.spec.gun.shells.findIndex((shell) => shell.guided === true);
  assert.equal(selectShell(tank.combat, 0, tank.spec), true, 'setup: the cannon is selected');
  Object.assign(tank.combat.reloadChannels[tow], { t: 6, totalS: 10, kind: 'shell' });
  Object.assign(tank.combat.modules.gun, { hp: 0, state: 'red', repairT: 2 });
  tank.consumables.readyAt[0] = tK + 9;
  tank.consumables.until.foliage = tK + 12;
}
const kTick = Math.round(tK * 60);
const sealed = decodeMigrationKeyframe(encodeMigrationKeyframe({ tick: kTick, battleTimeMs: Math.round(tK * 1000), timeS: tK, phase: 'playing',
  modeCheckpoint: sim.captureModeCheckpoint(), entities: captureEntityExtras(old), frame: frameOf(old, kTick) }));

// one second of sim on the old host, over two seconds of ticks (a one-second stall's dropped ticks)
for (let n = 0; n < 60; n++) sim.step({ dt: 1 / 60, inputs });
const lTick = kTick + 120;
const latest = frameOf(old, lTick, (entity) => (entity === parked ? parkedHeld : captureEntityRow(entity, old.wireIdOf(entity.id), era, lTick)));
assert.equal(latest.meta.battleTimeMs - sealed.battleTimeMs, 1000, 'setup: the newest frame is one second of sim after the keyframe');
const { state } = resumeStateFromRetained(sealed, 0, latest, 1000, [], []);
const fresh = make({ tick: state.tick, battleTimeMs: state.battleTimeMs });
applyResumeState(fresh, state);
const now = fresh.authority.timeS;

const wrong = [];
const close = (actual, expected, what, tolerance = 1e-6) => { if (!(Math.abs(actual - expected) <= tolerance)) wrong.push(`${what}: old host ${expected}, new host ${actual}`); };
for (const id of ['moving', 'parked']) {
  const before = sim.entityById.get(id), after = fresh.authority.entityById.get(id);
  const tow = before.spec.gun.shells.findIndex((shell) => shell.guided === true);
  const why = id === 'parked' ? ' (its row untouched since before the keyframe)' : ' (two seconds of ticks, one of sim)';
  close(after.combat.reloadChannels[tow].t, before.combat.reloadChannels[tow].t, `${id} TOW reload behind the cannon${why}`);
  close(after.combat.modules.gun.repairT, before.combat.modules.gun.repairT, `${id} gun repair progress${why}`);
  close(after.consumables.readyAt[0] - now, before.consumables.readyAt[0] - sim.timeS, `${id} track links cooldown left${why}`);
  close(after.consumables.until.foliage - now, before.consumables.until.foliage - sim.timeS, `${id} foliage window left${why}`);
}
if (wrong.length) {
  console.error(`resumeAging: ${wrong.length} readings aged wrong across the handoff:\n  ${wrong.join('\n  ')}`);
  assert.fail('the extras must age by the sim time to the resume frame, for every entity');
}

// the keyframe alone (no newer frame): nothing ages, the extras are exact
{
  const alone = make({ tick: sealed.tick, battleTimeMs: sealed.battleTimeMs });
  applyResumeState(alone, resumeStateFromRetained(sealed, 0, null, null, [], []).state);
  const after = alone.authority.entityById.get('parked'), tow = after.spec.gun.shells.findIndex((shell) => shell.guided === true);
  assert.equal(after.combat.reloadChannels[tow].t, 6, 'the keyframe alone: the TOW reload as sealed');
  assert.equal(after.consumables.readyAt[0] - alone.authority.timeS, 9, 'the keyframe alone: the cooldown as sealed');
  alone.stop();
}
old.stop(); fresh.stop();
console.log('resumeAging: a resumed entity\'s keyframe extras age by the sim time between the battle clocks, not the ticks, and every entity ages to the resume frame, an untouched row\'s too');
