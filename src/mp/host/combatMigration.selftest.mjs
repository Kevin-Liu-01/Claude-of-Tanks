// Proof (implicit state machine audit M1, 2026-11-02): a fight's combat state across a serialized host handoff. The
// keyframe carried the shell slot without moving the reload pointer onto that slot's channel, module states without
// their hit points, a fire without its tick budget, and nothing of magazines, salvo counts, consumable cooldowns and
// charges, smoke charges or pillbox damage. Built the way sixModesMigration builds a handoff: one actor plays, a keyframe
// is captured, encoded, decoded and applied to a second actor on the same roster, and the combat state compared.
//   - a Bradley with its TOW launcher selected: the launcher keeps its cycle and the cannon its own (they swapped: the
//     launcher's remaining time was written onto the cannon channel, reload still pointing at it);
//   - a red gun keeps 0 hp and its repair progress, a yellow engine its hp (a full-hp red module turned ok at the
//     next hit, and the realistic "disabled beyond repair" read full hp);
//   - a fire keeps its tick budget (it went out on its first tick);
//   - an autoloader magazine, the launcher's salvo count, consumable cooldowns, charges and active windows, smoke
//     charges and their cooldown, and a pillbox's booked points carry over (they refilled or reset);
//   - restored timers count in the new host's time (it starts its authority clock at 0).
// Review round 1 (2026-11-03), two more handoffs:
//   - the usual one (resumeStateFromRetained): the elected seat's newest frame, a second after the keyframe, overlays
//     the keyframe's rows. A newer row wins for what it carries (a shot fired since: the reload, the ammunition, the
//     magazine and the salvo count; a fire lit or still burning; a smoke salvo), and the keyframe's extras fill the rest
//     aged by the gap (a launcher reloading in the background, a red module's repair, consumable cooldowns and windows,
//     a fire's tick budget). The keyframe's channels and counts were written over the newer row: a tank that fired
//     after the keyframe came back loaded with its magazine full, and the extras did not age. A row this seat holds
//     from before the keyframe does not replace the keyframe's own;
//   - a mode's reload stamps survive the restore (Juggernaut boss x0.5, AC-130 escorts x2): every restore rebuilt the
//     multipliers from the consumables' base, taken before the mode stamped them. A timed item still active folds its
//     own factor onto the stamped value.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { FIRE_BASE_TICKS, selectShell, startPostShotReload } from '../../sim/damage.ts';
import { consumeAmmunition } from '../../sim/ammunition.ts';
import { SMOKE_COOLDOWN_S } from '../../sim/auxiliarySystems.ts';
import { RATIONS_AIM_MULT, RATIONS_RELOAD_MULT } from '../../sim/consumableRules.ts';
import { matchRulesetFor } from '../../sim/matchRuleset.ts';
import { FORTIFIED_HP_SP, createFortifiedCoverLedger } from '../../sim/fortifiedCover.ts';
import { captureEntityExtras, encodeMigrationKeyframe, decodeMigrationKeyframe, applyResumeState, resumeStateFromRetained } from './migrationState.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';

const seats = [
  { seat: 0, playerId: 'ifv', name: 'IFV', team: 'alpha', specId: 'm2a2_bradley', consumables: ['track_links', 'foliage', 'ir_jammer'] },
  { seat: 1, playerId: 'mbt', name: 'MBT', team: 'bravo', specId: 'leclerc_s2' },
];
await ensureAuthorityFleet([...seats.map((seat) => seat.specId), 'ztz100_prototype']);
// a pillbox (sim/fortifiedCover.ts: kind 'pillbox') far off the field, booked by prop index
const pillbox = { min: [900, 0, 900], max: [904, 2, 904], kind: 'pillbox', propIdx: 41, crushable: false };
const world = () => ({ mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [pillbox] });
const make = (resume) => createMatchActor({ roomId: 'combat-migration', mapId: 'verdant', seed: 21, seats, bots: [], world: world(), countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });
const inputs = new Map();

const first = make(null), sim = first.authority;
sim.onMatchReady();
// a pillbox the old host had half broken: booked through the checkpoint restore at the start (no round reaches one here)
sim.restoreModeCheckpoint({ ...sim.captureModeCheckpoint(), fortified: [[41, 3.5]] });
for (let n = 0; n < 300; n++) sim.step({ dt: 1 / 60, inputs });
const ifv = sim.entityById.get('ifv'), mbt = sim.entityById.get('mbt');
const t0 = sim.timeS;

// ---- the fight the old host was in
const towSlot = ifv.spec.gun.shells.findIndex((shell) => shell.guided === true);
assert.ok(towSlot > 0 && ifv.combat.reloadChannels[towSlot] !== ifv.combat.gunReload, 'setup: the Bradley launcher has its own reload channel');
assert.equal(selectShell(ifv.combat, towSlot, ifv.spec), true, 'setup: the TOW is selected');
Object.assign(ifv.combat.reloadChannels[towSlot], { t: 7.5, totalS: 10, kind: 'shell' });
Object.assign(ifv.combat.gunReload, { t: 0.25, totalS: 0.4, kind: 'intraClip' });
ifv.combat.launcherSalvoShots = 1;
const gun = ifv.combat.modules.gun, engine = ifv.combat.modules.engine;
gun.hp = 0; gun.state = 'red'; gun.repairT = 6;
engine.hp = engine.maxHp * 0.3; engine.state = 'yellow';
Object.assign(ifv.combat.fire, { burning: true, ticksLeft: 7, tickTimer: 0.4 });
ifv.consumables.readyAt[0] = t0 + 9; ifv.consumables.charges[0] = 1;
ifv.consumables.until.foliage = t0 + 12; ifv.consumables.readyAt[1] = t0 + 50; ifv.consumables.charges[1] = 1;
ifv.combat.auxiliary.smokeCharges = 1; ifv.combat.auxiliary.smokeReadyAt = t0 + 20;
mbt.combat.magazine.rounds = 1;
const pillboxBefore = sim.captureModeCheckpoint().fortified ?? null;

// ---- the handoff (MatchHostCore.buildKeyframe's shape)
const tick = Math.round(sim.timeS * 60), battleTimeMs = Math.round(sim.timeS * 1000), era = createEraIndexer();
const snapshot = sim.snapshot({ tick, serverTimeMs: battleTimeMs, viewerId: 'migration', ackInputSeq: null });
const keyframe = { tick, battleTimeMs, phase: 'playing', modeCheckpoint: sim.captureModeCheckpoint(), entities: captureEntityExtras(first), frame: { tick, serverTimeMs: battleTimeMs, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127, meta: captureMeta({ ...snapshot.meta, battleTimeMs }, false), destroyed: [], entities: sim.entities.map((entity) => captureEntityRow(entity, first.wireIdOf(entity.id), era, tick)), shells: [], viewer: null, modeStateJson: null } };
const saved = decodeMigrationKeyframe(encodeMigrationKeyframe(keyframe));
const second = make({ tick, battleTimeMs });
applyResumeState(second, saved);
const next = second.authority, t1 = next.timeS;
const ifv2 = next.entityById.get('ifv'), mbt2 = next.entityById.get('mbt');
const near = (actual, expected, what) => { if (!(Math.abs(actual - expected) < 1e-6)) lost.push(`${what}: old host ${expected}, new host ${actual}`); };
const lost = [];

// reload channels: the selected slot's own, the cannon's its own
if (ifv2.combat.shellSlot !== towSlot) lost.push(`shell slot: ${ifv2.combat.shellSlot}`);
if (ifv2.combat.reload !== ifv2.combat.reloadChannels[ifv2.combat.shellSlot]) lost.push('reload no longer the selected slot\'s channel');
near(ifv2.combat.reloadChannels[towSlot].t, 7.5, 'launcher reload');
near(ifv2.combat.gunReload.t, 0.25, 'cannon reload');
if (ifv2.combat.gunReload.kind !== 'intraClip') lost.push(`cannon reload kind ${ifv2.combat.gunReload.kind}`);
near(ifv2.combat.launcherSalvoShots ?? 0, 1, 'salvo shots');
// modules: hp, the law's state, repair progress
near(ifv2.combat.modules.gun.hp, 0, 'gun hp');
if (ifv2.combat.modules.gun.state !== 'red') lost.push(`gun state ${ifv2.combat.modules.gun.state}`);
near(ifv2.combat.modules.gun.repairT, 6, 'gun repair progress');
near(ifv2.combat.modules.engine.hp, engine.hp, 'engine hp');
if (ifv2.combat.modules.engine.state !== 'yellow') lost.push(`engine state ${ifv2.combat.modules.engine.state}`);
// fire
if (!ifv2.combat.fire.burning) lost.push('fire out');
near(ifv2.combat.fire.ticksLeft, 7, 'fire ticks left');
near(ifv2.combat.fire.tickTimer, 0.4, 'fire tick timer');
// magazine
near(mbt2.combat.magazine.rounds, 1, 'autoloader magazine rounds');
// consumables, in the new host's time
near(ifv2.consumables.readyAt[0] - t1, 9, 'track links cooldown left');
near(ifv2.consumables.charges[0] ?? -1, 1, 'track links charges');
near(ifv2.consumables.until.foliage - t1, 12, 'foliage window left');
near(ifv2.consumables.readyAt[1] - t1, 50, 'foliage cooldown left');
near(ifv2.consumables.charges[1] ?? -1, 1, 'foliage charges');
// smoke
near(ifv2.combat.auxiliary.smokeCharges, 1, 'smoke charges');
near(ifv2.combat.auxiliary.smokeReadyAt - t1, 20, 'smoke cooldown left');
// the pillbox's damage
const pillboxAfter = next.captureModeCheckpoint().fortified ?? null;
if (!pillboxBefore || JSON.stringify(pillboxAfter) !== JSON.stringify(pillboxBefore)) lost.push(`pillbox points: old host ${JSON.stringify(pillboxBefore)}, new host ${JSON.stringify(pillboxAfter)}`);

if (lost.length) {
  console.error(`combatMigration: ${lost.length} pieces of combat state lost across the host handoff:\n  ${lost.join('\n  ')}`);
  assert.fail('combat state must survive a host migration');
}

// ---- the restored channels run: each cycle counts down on its own timer
next.onMatchReady();
const cannonBefore = ifv2.combat.gunReload.t;
for (let n = 0; n < 6; n++) next.step({ dt: 1 / 60, inputs });
assert.ok(ifv2.combat.reloadChannels[towSlot].t < 7.5 && ifv2.combat.reloadChannels[towSlot].t > 7.3, 'the launcher cycle runs on its own channel');
assert.ok(ifv2.combat.gunReload.t < cannonBefore, 'the cannon cycle runs on its own channel');
// the ledger itself: restored points count toward the fall (sim/fortifiedCover.ts)
const ledger = createFortifiedCoverLedger();
ledger.restore?.([[7, FORTIFIED_HP_SP - 1], [8, -1], [-1, 3]]);
assert.deepEqual(ledger.capture?.(), [[7, FORTIFIED_HP_SP - 1]], 'only valid entries are restored');
assert.equal(ledger.pointsOf({ propIdx: 7 }), FORTIFIED_HP_SP - 1);
first.stop(); second.stop();

// ---- review round 1: the newest frame overlays the keyframe (MatchSession's resume through resumeStateFromRetained)
const era2 = createEraIndexer();
const frameOf = (actor, tick, rowOf = (entity) => captureEntityRow(entity, actor.wireIdOf(entity.id), era2, tick)) => {
  const authority = actor.authority, battleTimeMs = Math.round(authority.timeS * 1000);
  const snap = authority.snapshot({ tick, serverTimeMs: battleTimeMs, viewerId: 'migration', ackInputSeq: null });
  return { tick, serverTimeMs: battleTimeMs, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127, meta: captureMeta({ ...snap.meta, battleTimeMs }, false), destroyed: [], entities: authority.entities.map(rowOf), shells: [], viewer: null, modeStateJson: null };
};
{
  const overlaySeats = [
    ...seats,
    { seat: 2, playerId: 'ztz', name: 'ZTZ', team: 'bravo', specId: 'ztz100_prototype' },
    { seat: 3, playerId: 'far', name: 'Far', team: 'alpha', specId: 'leclerc_s2' },
  ];
  const makeOverlay = (resume) => createMatchActor({ roomId: 'combat-overlay', mapId: 'verdant', seed: 22, seats: overlaySeats, bots: [], world: world(), countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });
  const old = makeOverlay(null), oldSim = old.authority;
  oldSim.onMatchReady();
  for (let n = 0; n < 90; n++) oldSim.step({ dt: 1 / 60, inputs });
  const [ifvA, mbtA, ztzA, farA] = ['ifv', 'mbt', 'ztz', 'far'].map((id) => oldSim.entityById.get(id));
  // a far tank's row as a viewer holds it from before the keyframe (an interest tier held it over)
  farA.state.pos.x = 10;
  const heldTick = Math.round(oldSim.timeS * 60);
  const farHeld = captureEntityRow(farA, old.wireIdOf(farA.id), era2, heldTick);
  for (let n = 0; n < 30; n++) oldSim.step({ dt: 1 / 60, inputs });
  farA.state.pos.x = 20;
  // the keyframe: the cannon loaded, magazine full, a fire 9 ticks from its end; the Bradley's TOW reloading behind the
  // selected cannon, a red gun 3 s into its repair, consumables cooling down, all smoke; the ZTZ's salvo rack loaded
  const tA = oldSim.timeS;
  const towSlotA = ifvA.spec.gun.shells.findIndex((shell) => shell.guided === true);
  assert.equal(selectShell(ifvA.combat, 0, ifvA.spec), true);
  Object.assign(ifvA.combat.reloadChannels[towSlotA], { t: 5, totalS: 10, kind: 'shell' });
  Object.assign(ifvA.combat.modules.gun, { hp: 0, state: 'red', repairT: 3 });
  ifvA.consumables.readyAt[0] = tA + 9; ifvA.consumables.until.foliage = tA + 12;
  Object.assign(mbtA.combat.fire, { burning: true, ticksLeft: 9, tickTimer: 0 });
  const salvoSlot = ztzA.spec.gun.shells.findIndex((shell) => shell.guided === true);
  assert.ok(ztzA.spec.gun.launcherSalvo?.rounds === 2 && salvoSlot >= 0, 'setup: the ZTZ-100 prototype fires a two-round salvo');
  assert.equal(selectShell(ztzA.combat, salvoSlot, ztzA.spec), true);
  assert.ok(mbtA.combat.magazine.rounds === 3 && mbtA.combat.reload.kind === 'ready', 'setup: the Leclerc is loaded');
  const kTick = Math.round(oldSim.timeS * 60);
  const sealed = decodeMigrationKeyframe(encodeMigrationKeyframe({ tick: kTick, battleTimeMs: Math.round(tA * 1000), timeS: tA, phase: 'playing', modeCheckpoint: oldSim.captureModeCheckpoint(), entities: captureEntityExtras(old), frame: frameOf(old, kTick) }));
  // one second on: the Leclerc and the ZTZ fire (their own laws), a fire is lit on the Bradley, it pops smoke, the
  // Leclerc's fire still burns two ticks shorter
  for (let n = 0; n < 60; n++) oldSim.step({ dt: 1 / 60, inputs });
  for (const shooter of [mbtA, ztzA]) { assert.equal(consumeAmmunition(shooter.combat, shooter.combat.shellSlot), true); startPostShotReload(shooter.combat, shooter.spec); }
  Object.assign(mbtA.combat.fire, { burning: true, ticksLeft: 7 });
  Object.assign(ifvA.combat.fire, { burning: true, ticksLeft: 10, tickTimer: 0 });
  ifvA.combat.auxiliary.smokeCharges = 2; ifvA.combat.auxiliary.smokeReadyAt = oldSim.timeS + SMOKE_COOLDOWN_S;
  const lTick = kTick + 60;
  const latest = frameOf(old, lTick, (entity) => (entity === farA ? farHeld : captureEntityRow(entity, old.wireIdOf(entity.id), era2, lTick)));
  const { state } = resumeStateFromRetained(sealed, 0, latest, 1000, [], []);
  const fresh = makeOverlay({ tick: state.tick, battleTimeMs: state.battleTimeMs });
  applyResumeState(fresh, state);
  const nowB = fresh.authority.timeS;
  const [ifvB, mbtB, ztzB, farB] = ['ifv', 'mbt', 'ztz', 'far'].map((id) => fresh.authority.entityById.get(id));
  const wrong = [];
  const close = (actual, expected, what, tolerance = 1e-6) => { if (!(Math.abs(actual - expected) <= tolerance)) wrong.push(`${what}: old host ${expected}, new host ${actual}`); };
  // the newer row's: the shot (reload 2 ms steps on the wire), the magazine, the salvo count, burning, the smoke salvo
  close(mbtB.combat.reload.t, mbtA.combat.reload.t, 'Leclerc reload after its shot', 0.002);
  if (mbtB.combat.reload.kind !== mbtA.combat.reload.kind) wrong.push(`Leclerc reload kind: old host ${mbtA.combat.reload.kind}, new host ${mbtB.combat.reload.kind}`);
  close(mbtB.combat.ammo[0], mbtA.combat.ammo[0], 'Leclerc ammunition');
  close(mbtB.combat.magazine.rounds, 2, 'Leclerc magazine rounds');
  close(ztzB.combat.launcherSalvoShots ?? 0, ztzA.combat.launcherSalvoShots, 'ZTZ salvo shots');
  close(ztzB.combat.reload.t, ztzA.combat.reload.t, 'ZTZ launcher cycle', 0.002);
  if (!mbtB.combat.fire.burning) wrong.push('Leclerc fire out');
  close(mbtB.combat.fire.ticksLeft, 7, 'Leclerc fire ticks left (9 at the keyframe, two fire ticks since)');
  if (!ifvB.combat.fire.burning) wrong.push('Bradley fire (lit since the keyframe) out');
  close(ifvB.combat.fire.ticksLeft, Math.max(2, Math.round(FIRE_BASE_TICKS * (ifvB.combat.equipMults?.fireTicks ?? 1))), 'Bradley fire budget');
  close(ifvB.combat.auxiliary.smokeCharges, 2, 'Bradley smoke charges');
  close(ifvB.combat.auxiliary.smokeReadyAt - nowB, ifvA.combat.auxiliary.smokeReadyAt - oldSim.timeS, 'Bradley smoke cooldown left', 1e-3);
  // the extras aged by the gap, as the old host's own laws ran them
  close(ifvB.combat.reloadChannels[towSlotA].t, ifvA.combat.reloadChannels[towSlotA].t, 'Bradley TOW reload behind the cannon');
  close(ifvB.combat.modules.gun.repairT, ifvA.combat.modules.gun.repairT, 'Bradley gun repair progress');
  close(ifvB.consumables.readyAt[0] - nowB, ifvA.consumables.readyAt[0] - oldSim.timeS, 'Bradley track links cooldown left');
  close(ifvB.consumables.until.foliage - nowB, ifvA.consumables.until.foliage - oldSim.timeS, 'Bradley foliage window left');
  // the keyframe's own row of the far tank, not the older one this seat held
  close(farB.state.pos.x, 20, 'far tank position');
  if (wrong.length) {
    console.error(`combatMigration (overlay): ${wrong.length} readings wrong after the newest frame overlaid the keyframe:\n  ${wrong.join('\n  ')}`);
    assert.fail('a newer row must win for what it carries, and the extras must age by the gap');
  }
  old.stop(); fresh.stop();
}

// ---- review round 1: a mode's reload stamps across the handoff
for (const mode of ['juggernaut', 'ac130']) {
  const kit = ['track_links', 'foliage', 'rations'];
  const modeSeats = [
    { seat: 0, playerId: 'a', name: 'A', team: 'alpha', specId: 'leclerc_s2', consumables: kit },
    { seat: 1, playerId: 'b', name: 'B', team: 'bravo', specId: 'leclerc_s2', consumables: kit },
  ];
  const bots = mode === 'ac130' ? [{ playerId: 'escort', name: 'Escort', team: 'alpha', specId: 'leclerc_s2' }] : [];
  const makeMode = (resume) => createMatchActor({ roomId: 'combat-modes', mapId: 'verdant', mode, ruleset: matchRulesetFor(mode), seed: 23, seats: modeSeats, bots, world: world(), countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });
  const old = makeMode(null), oldSim = old.authority;
  oldSim.onMatchReady();
  for (let n = 0; n < 60; n++) oldSim.step({ dt: 1 / 60, inputs });
  const stamped = mode === 'juggernaut' ? oldSim.entityById.get('a') : oldSim.entityById.get('escort');
  assert.ok(stamped.combat.equipMults.reload !== stamped.consumables.base.reload, `setup (${mode}): the mode stamped a reload multiplier past the consumables' base`);
  // the other alpha tank's crew has its rations on (an active item folds onto what the new host holds)
  const fed = oldSim.entityById.get(mode === 'juggernaut' ? 'b' : 'a');
  fed.consumables.until.rations = oldSim.timeS + 30;
  const tick = Math.round(oldSim.timeS * 60);
  const sealed = decodeMigrationKeyframe(encodeMigrationKeyframe({ tick, battleTimeMs: Math.round(oldSim.timeS * 1000), timeS: oldSim.timeS, phase: 'playing', modeCheckpoint: oldSim.captureModeCheckpoint(), entities: captureEntityExtras(old), frame: frameOf(old, tick) }));
  const fresh = makeMode({ tick, battleTimeMs: sealed.battleTimeMs });
  const held = new Map(fresh.authority.entities.map((entity) => [entity.id, { ...entity.combat.equipMults }]));
  applyResumeState(fresh, sealed);
  for (const entity of fresh.authority.entities) {
    const before = held.get(entity.id), after = entity.combat.equipMults;
    const item = entity.id === fed.id;
    const expect = (key, factor) => assert.ok(Math.abs(after[key] - before[key] * factor) < 1e-9, `${mode} ${entity.id}: ${key} ${before[key]} before the restore, ${after[key]} after (want x${factor})`);
    expect('reload', item ? RATIONS_RELOAD_MULT : 1);
    expect('aimTime', item ? RATIONS_AIM_MULT : 1);
    expect('repair', 1);
    expect('power', 1);
    if (!item) assert.equal(after.reload, oldSim.entityById.get(entity.id).combat.equipMults.reload, `${mode} ${entity.id}: the old host's reload multiplier`);
  }
  assert.ok(fresh.authority.entityById.get(fed.id).consumables.until.rations > fresh.authority.timeS, `${mode}: the rations stay on`);
  old.stop(); fresh.stop();
}
console.log('combatMigration: reload channels, module hp, fire ticks, magazine, salvo, consumables, smoke and pillbox points survive a serialized host handoff; a newer frame\'s rows win over the keyframe\'s extras, which age by the gap; mode reload stamps hold');
