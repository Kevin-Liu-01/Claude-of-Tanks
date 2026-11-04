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
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';

const seats = [
  { seat: 0, playerId: 'ifv', name: 'IFV', team: 'alpha', specId: 'm2a2_bradley', consumables: ['track_links', 'foliage', 'ir_jammer'] },
  { seat: 1, playerId: 'mbt', name: 'MBT', team: 'bravo', specId: 'leclerc_s2' },
];
await ensureAuthorityFleet(seats.map((seat) => seat.specId));
const world = () => ({ mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [] });
const inputs = new Map();
const era = createEraIndexer();
const frameOf = (actor, tick) => {
  const authority = actor.authority, battleTimeMs = Math.round(authority.timeS * 1000);
  const snap = authority.snapshot({ tick, serverTimeMs: battleTimeMs, viewerId: 'migration', ackInputSeq: null });
  return { tick, serverTimeMs: battleTimeMs, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127, meta: captureMeta({ ...snap.meta, battleTimeMs }, false), destroyed: [], entities: authority.entities.map((entity) => captureEntityRow(entity, actor.wireIdOf(entity.id), era, tick)), shells: [], viewer: null, modeStateJson: null };
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
function handoff({ ruleset, killBeforeKeyframe, respawnsTold, keyframeLife = null }) {
  const make = (resume) => createMatchActor({ roomId: 'revive-migration', mapId: 'verdant', mode: ruleset.mode, ruleset, seed: 5, seats, bots: [], world: world(), countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });
  const old = make(null), sim = old.authority;
  sim.onMatchReady();
  let tick = 0;
  const step = (n, onTick = () => {}) => { for (let k = 0; k < n; k++) { sim.step({ dt: 1 / 60, inputs }); tick++; onTick(); } };
  step(60);
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
    keyframe = keyframeOf(old, tick);
    // the keyframe's word on the hull's life, where a case names one (a hull the mode had benched at the keyframe)
    if (keyframeLife) keyframe.modeCheckpoint.mode.lives = keyframe.modeCheckpoint.mode.lives.map(([id, life]) => [id, id === 'ifv' ? keyframeLife : life]);
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
  const { state } = resumeStateFromRetained(keyframe, 0, latest, 1500, [], [], respawnsTold ? [['ifv', respawnTick], ['mbt', keyframe.tick - 30]] : []);
  const fresh = make({ tick: state.tick, battleTimeMs: state.battleTimeMs });
  applyResumeState(fresh, state);
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
// does not outlive the revive the rows show (integration IR2)
const fromBench = handoff({ ruleset: zone, killBeforeKeyframe: true, respawnsTold: false, keyframeLife: 'benched' });
judge('zone control, benched at the keyframe', fromBench);

// ---- died and revived inside the gap: both rows alive, the mode_respawn this seat was told of names it
const quick = { ...zone, respawnS: 2 };
const fromEvents = handoff({ ruleset: quick, killBeforeKeyframe: false, respawnsTold: true });
judge('zone control at respawnS 2, died and revived after the keyframe', fromEvents);
assert.equal(fromEvents.state.revivedEntityIds, undefined, 'both rows alive: the rows name no revive');
assert.deepEqual(fromEvents.state.respawnTicks?.map(([id]) => id), ['ifv'], 'only a respawn after the keyframe is carried');

console.log('reviveMigration: a hull revived between the keyframe and the newest frame keeps its fresh crew, modules, kit and tallies, and is not revived again, whether its rows or its mode_respawn name the revive');
