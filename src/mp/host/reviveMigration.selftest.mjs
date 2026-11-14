// Proof (implicit state machine audit M1, review round 2, 2026-11-03): a hull a mode revives between the keyframe and
// the elected seat's newest frame lives a life the keyframe's extras never saw. The revive (authoritativeMatch.ts
// reviveForMode) builds its combat state and kit anew; the resume (migrationState.ts resumeStateFromRetained, then
// applyResumeState) let the alive row replace the keyframe's destroyed one and then wrote the dead life's extras onto
// the revived hull: its dead crew, red modules (at 0 hp), spent kit charges and cooldowns, old reload channels. And the
// keyframe's mode checkpoint still held the hull's respawn, so the new host revived it a second time when that fell
// due: back on its spawn, its fight reset again.
//   - Zone Control, killed before the keyframe and revived 0.5 s after it (respawnS 6): the keyframe's row has it
//     destroyed, the newer row alive (HostResumeState.revivedEntityIds);
//   - Zone Control at respawnS 2 (the shortest a room may set), killed after the keyframe and revived before the newest
//     frame: both rows alive, so only the `mode_respawn` this seat was told of names the revive (respawnTicks);
//   - in both, the fresh hull keeps its tallies (kills, damage), its newer row's pose, and is not revived again;
//   - integration IR2 (2026-11-03, sim-modes-life's lives on the checkpoint): the restored mode life is the revive's
//     (alive, on the field), not the keyframe's: a hull down at the keyframe came back 'down' and was set alive only by
//     the death watch's restore side door; one benched at the keyframe came back benched and stayed off the field.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { matchRulesetFor } from '../../sim/matchRuleset.ts';
import { applyResumeState, captureEntityExtras, decodeMigrationKeyframe, encodeMigrationKeyframe, resumeStateFromRetained } from './migrationState.ts';
import { ENTITY_FLAGS } from '../wire/constants.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';

const seats = [
  { seat: 0, playerId: 'ifv', name: 'IFV', team: 'alpha', specId: 'm2a2_bradley', consumables: ['track_links', 'foliage', 'ir_jammer'] },
  { seat: 1, playerId: 'mbt', name: 'MBT', team: 'bravo', specId: 'leclerc_s2' },
];
await ensureAuthorityFleet(seats.map((seat) => seat.specId));
const world = () => ({ mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [] });
const inputs = new Map();
const era = createEraIndexer();
/**
 * The actor's frame at `tick` in the shape the host sends it (server/match/matchActor.ts frames, matchHostCore.ts's
 * keyframe), its mode state included (round 8 H9): a resume whose newest frame is newer than the keyframe writes that
 * state over the keyframe's checkpoint (migrationState.ts checkpointAtNewestFrame), and a frame without it skipped that
 * rewrite, the path every real migration in a mode takes (huntSearchMigration.selftest's hostFrame).
 */
const frameOf = (actor, tick) => {
  const authority = actor.authority, battleTimeMs = Math.round(authority.timeS * 1000);
  const snap = authority.snapshot({ tick, serverTimeMs: battleTimeMs, viewerId: 'migration', ackInputSeq: null });
  return { tick, serverTimeMs: battleTimeMs, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127, meta: captureMeta({ ...snap.meta, battleTimeMs }, false), destroyed: [], entities: authority.entities.map((entity) => captureEntityRow(entity, actor.wireIdOf(entity.id), era, tick)), shells: [], viewer: null,
    modeStateJson: snap.meta?.modeState ? JSON.stringify(snap.meta.modeState) : null };
};
/** A case is built only when its resume carries that path's inputs: a newest frame newer than the keyframe, with the mode
 *  state, over a mode checkpoint (applyResumeState restores one only when the resume carries it; checkpointAtNewestFrame
 *  rewrites a checkpoint with a mode). That the rewrite ran is handoff's score check. */
const throughNewestFrame = (state, keyframe) => state.frame.tick > (keyframe?.tick ?? Infinity) && typeof state.frame.modeStateJson === 'string'
  && !!state.modeCheckpoint?.mode;
const isDestroyedRow = (row) => (row.flags & ENTITY_FLAGS.DESTROYED) !== 0 || row.hp <= 0;
/** Bench a hull on the old host through its life's one writer (matchModes.ts setLife, by the restore a migrated host
 *  takes; Zone Control benches no hull itself): its life, its checkpoint's destroyed entry, combat.destroyed and its rows
 *  all say so, as on a host whose mode benched it. */
const bench = (sim, id) => {
  const checkpoint = sim.captureModeCheckpoint();
  sim.restoreModeCheckpoint({ ...checkpoint, mode: { ...checkpoint.mode, lives: checkpoint.mode.lives.map(([key, life]) => [key, key === id ? 'benched' : life]) } });
};
const keyframeOf = (actor, tick) => {
  const sim = actor.authority;
  return decodeMigrationKeyframe(encodeMigrationKeyframe({ tick, battleTimeMs: Math.round(sim.timeS * 1000), timeS: sim.timeS, phase: 'playing', modeCheckpoint: sim.captureModeCheckpoint(), entities: captureEntityExtras(actor), frame: frameOf(actor, tick) }));
};
/** The life the hull leaves: crew down, gun and engine at 0 hp, kit slot 0 spent with a minute's cooldown, two kills. */
const batter = (sim, entity) => {
  for (const id of Object.keys(entity.combat.crew)) entity.combat.crew[id] = false;
  Object.assign(entity.combat.modules.gun, { hp: 0, state: 'red', repairT: 0 });
  Object.assign(entity.combat.modules.engine, { hp: 0, state: 'red', repairT: 0 });
  entity.consumables.charges[0] = 0; entity.consumables.readyAt[0] = sim.timeS + 60;
  entity.kills = 2; entity.damage = 640;
};
const kill = (entity) => { entity.combat.hp = 0; entity.combat.destroyed = true; };

/** A match of `ruleset` played to a revive of the IFV inside the gap; returns the fresh host after the resume. */
function handoff({ ruleset, killBeforeKeyframe, respawnsTold, keyframeLives = null, benchBeforeKeyframe = [] }) {
  const make = (resume) => createMatchActor({ roomId: 'revive-migration', mapId: 'verdant', mode: ruleset.mode, ruleset, seed: 5, seats, bots: [], world: world(), countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  let tick = 0;
  const step = (n, onTick = () => {}) => { for (let k = 0; k < n; k++) { sim.step({ dt: 1 / 60, inputs }); tick++; onTick(); } };
  // the MBT takes the middle zone (a lone hull in 8 s: matchModes.ts ZONE_CAPTURE_S), so bravo scores through the gap
  // and the newest frame's score is newer than the keyframe's (the rewrite's check below)
  const middle = () => sim.modeController.serialize().zones[1];
  Object.assign(sim.entityById.get('mbt').state.pos, { x: middle().x, z: middle().z });
  step(9 * 60);
  assert.equal(middle().owner, 'bravo', `${ruleset.mode}: setup, the MBT took the middle zone`);
  let ifv = sim.entityById.get('ifv');
  batter(sim, ifv);
  let respawnTick = null;
  // what every seat is told (mode events reach every viewer), with the tick the actor delivers them at
  const listen = () => {
    for (const event of sim.eventsForViewer('mbt')) if (event.type === 'mode_respawn' && event.id === 'ifv') respawnTick = tick;
    sim.afterEventBroadcast();
  };
  let keyframe;
  if (killBeforeKeyframe) {
    kill(ifv);
    step(Math.round((ruleset.respawnS - 0.5) * 60), listen);
    for (const id of benchBeforeKeyframe) bench(sim, id);
    keyframe = keyframeOf(old, tick);
    // the keyframe's word on a dead hull's life, where a case names one (a hull the mode had benched at the keyframe),
    // with its destroyed entry as the capture writes a benched or down life (matchModes.ts captureCheckpoint)
    if (keyframeLives) {
      const mode = keyframe.modeCheckpoint.mode;
      mode.lives = mode.lives.map(([id, life]) => [id, keyframeLives[id] ?? life]);
      const lives = new Map(mode.lives);
      mode.destroyed = mode.destroyed.map(([id]) => [id, lives.get(id) === 'down' || lives.get(id) === 'benched']);
    }
    step(60, listen); // the respawn falls due 0.5 s after the keyframe
  } else {
    keyframe = keyframeOf(old, tick);
    step(6, listen);
    kill(sim.entityById.get('ifv'));
    step(Math.round((ruleset.respawnS + 0.3) * 60), listen);
  }
  ifv = sim.entityById.get('ifv');
  assert.ok(respawnTick !== null && respawnTick > keyframe.tick, `${ruleset.mode}: setup, the IFV respawned after the keyframe`);
  assert.equal(ifv.combat.destroyed, false, 'setup: the old host revived the IFV');
  assert.ok(Object.values(ifv.combat.crew).every(Boolean) && ifv.consumables.charges[0] > 0, 'setup: the revive gave the IFV a fresh crew and kit');
  // it drove off its spawn before the host went
  ifv.state.pos.x += 24; ifv.state.pos.z += 18;
  const latest = frameOf(old, tick);
  // a hull the keyframe benches is destroyed in its checkpoint and its keyframe row, and in its newest row while the old
  // host still benches it, as on a host whose mode benched it (the revived IFV's newest row is alive)
  for (const [id, life] of keyframe.modeCheckpoint?.mode?.lives ?? []) {
    if (life !== 'benched') continue;
    const rowOf = (frame) => frame.entities.find((row) => row.entityId === old.wireIdOf(id));
    const stillBenched = sim.entityById.get(id).modeLife === 'benched';
    assert.ok(new Map(keyframe.modeCheckpoint.mode.destroyed).get(id) && isDestroyedRow(rowOf(keyframe.frame)) && (!stillBenched || isDestroyedRow(rowOf(latest))),
      `${ruleset.mode}: setup, the keyframe's bench of ${id} agrees with its destroyed entry and its rows`);
  }
  const { state } = resumeStateFromRetained(keyframe, 0, latest, 1500, [], [], respawnsTold ? [['ifv', respawnTick], ['mbt', keyframe.tick - 30]] : []);
  const fresh = make({ tick: state.tick, battleTimeMs: state.battleTimeMs });
  applyResumeState(fresh, state);
  assert.ok(throughNewestFrame(state, keyframe), `${ruleset.mode}: setup, the resume runs through the newest frame's mode state `
    + `(checkpointAtNewestFrame): the newest frame (tick ${state.frame.tick}, mode state ${state.frame.modeStateJson ? 'carried' : 'missing'}) `
    + `against the keyframe (tick ${keyframe.tick})`);
  // the rewrite ran (round 8 H9 fix-up r2): the new host takes the score bravo's zone made in the gap, which only the
  // newest frame shows (a resume that restored the keyframe's checkpoint as it was had the keyframe's)
  const held = keyframe.modeCheckpoint.mode.score.bravo, shown = JSON.parse(state.frame.modeStateJson).score.bravo;
  const resumed = fresh.authority.captureModeCheckpoint().mode.score.bravo;
  assert.ok(shown > Math.round(held), `${ruleset.mode}: setup, bravo scored between the keyframe (${held}) and the newest frame (${shown})`);
  assert.equal(Math.round(resumed), shown, `${ruleset.mode}: the new host takes the newest frame's score (checkpointAtNewestFrame), not the keyframe's ${held}`);
  // the rewrite keeps the keyframe's lives (round 8 H9 fix-up): the MBT, which no revive names, lives the keyframe's
  // life on the new host. Where the keyframe benched it, a rewrite that lost the lives would bring it back 'down' (from
  // the destroyed list: restoreCheckpoint's fallback), on the field, so that case names the loss. Not pinned here: the
  // respawns and scored deaths the rewrite keeps, as no handoff has one for a hull no revive names; nor the destroyed
  // list, which the restore reads only where the lives are missing
  const mbtLife = keyframe.modeCheckpoint.mode.lives.find(([id]) => id === 'mbt')?.[1], mbt = fresh.authority.entityById.get('mbt');
  assert.ok(mbtLife && mbt.modeLife === mbtLife && mbt.modeActive === (mbtLife === 'alive' || mbtLife === 'down'),
    `${ruleset.mode}: the MBT keeps the keyframe's life through the resume (${mbtLife}; the new host has ${mbt.modeLife}${mbt.modeActive === false ? ', off the field' : ''})`);
  return { old, fresh, oldIfv: ifv, state };
}

function judge(label, { old, fresh, oldIfv }) {
  const next = fresh.authority, ifv = next.entityById.get('ifv');
  const wrong = [];
  if (ifv.combat.destroyed) wrong.push('destroyed');
  // its mode life is the revive's: alive and on the field (integration IR2)
  const lifeOf = (entity) => `${entity.modeLife}${entity.modeActive === false ? ' (off the field)' : ''}`;
  if (ifv.modeLife !== 'alive' || ifv.modeActive === false) wrong.push(`mode life ${lifeOf(ifv)} at the resume`);
  for (const [id, able] of Object.entries(ifv.combat.crew)) if (!able) wrong.push(`crew ${id} down`);
  for (const id of ['gun', 'engine']) {
    const module = ifv.combat.modules[id];
    if (module.state !== 'ok' || module.hp !== module.maxHp) wrong.push(`${id} ${module.state} at ${module.hp}/${module.maxHp} hp`);
  }
  const charges = JSON.stringify(ifv.consumables.charges), oldCharges = JSON.stringify(oldIfv.consumables.charges);
  if (charges !== oldCharges) wrong.push(`kit charges ${charges} (old host ${oldCharges})`);
  const cooldown = ifv.consumables.readyAt[0] - next.timeS;
  if (cooldown > 1e-6) wrong.push(`kit slot 0 cooling down ${cooldown.toFixed(1)} s`);
  if (ifv.kills !== 2 || Math.round(ifv.damage) !== 640) wrong.push(`tallies kills ${ifv.kills} damage ${ifv.damage}`);
  // the new host's mode does not revive it a second time when the keyframe's respawn falls due
  const at = { x: ifv.state.pos.x, z: ifv.state.pos.z };
  if (Math.hypot(at.x - oldIfv.state.pos.x, at.z - oldIfv.state.pos.z) > 0.05) wrong.push('not at its newer row\'s position');
  next.onMatchReady();
  let again = 0;
  for (let n = 0; n < 240; n++) {
    next.step({ dt: 1 / 60, inputs });
    for (const event of next.eventsForViewer('mbt')) if (event.type === 'mode_respawn' && event.id === 'ifv') again++;
    next.afterEventBroadcast();
  }
  const after = next.entityById.get('ifv').state.pos;
  if (again) wrong.push(`revived again on the new host (${again} mode_respawn)`);
  const later = next.entityById.get('ifv');
  if (later.modeLife !== 'alive' || later.modeActive === false) wrong.push(`mode life ${lifeOf(later)} 4 s after the resume`);
  if (Math.hypot(after.x - at.x, after.z - at.z) > 5) wrong.push(`moved ${Math.hypot(after.x - at.x, after.z - at.z).toFixed(1)} m in 4 s standing still`);
  old.stop(); fresh.stop();
  if (wrong.length) {
    console.error(`reviveMigration ${label}: the revived hull came back with the life it left:\n  ${wrong.join('\n  ')}`);
    assert.fail(`${label}: a hull revived in the gap keeps its fresh life`);
  }
}

// ---- revived from a death before the keyframe: the rows say so (destroyed, then alive)
const zone = matchRulesetFor('zone_control');
const fromRows = handoff({ ruleset: zone, killBeforeKeyframe: true, respawnsTold: false });
const ifvWireId = fromRows.fresh.wireIdOf('ifv');
judge('zone control, dead at the keyframe', fromRows);
assert.deepEqual(fromRows.state.revivedEntityIds, [ifvWireId], 'the overlay names the hull its rows show revived');

// ---- benched at the keyframe, then revived in the gap (a wave's draw, a stranded hull's return): the keyframe's bench
// does not outlive the revive the rows show (integration IR2); the MBT, benched on the old host before the keyframe and
// named by no revive, stays benched through the newest frame's rewrite (handoff's MBT check)
const fromBench = handoff({ ruleset: zone, killBeforeKeyframe: true, respawnsTold: false, keyframeLives: { ifv: 'benched' }, benchBeforeKeyframe: ['mbt'] });
judge('zone control, benched at the keyframe', fromBench);

// ---- died and revived inside the gap: both rows alive, the mode_respawn this seat was told of names it
const quick = { ...zone, respawnS: 2 };
const fromEvents = handoff({ ruleset: quick, killBeforeKeyframe: false, respawnsTold: true });
judge('zone control at respawnS 2, died and revived after the keyframe', fromEvents);
assert.equal(fromEvents.state.revivedEntityIds, undefined, 'both rows alive: the rows name no revive');
assert.deepEqual(fromEvents.state.respawnTicks?.map(([id]) => id), ['ifv'], 'only a respawn after the keyframe is carried');

console.log('reviveMigration: a hull revived between the keyframe and the newest frame keeps its fresh crew, modules, kit and tallies, and is not revived again, whether its rows or its mode_respawn name the revive');
