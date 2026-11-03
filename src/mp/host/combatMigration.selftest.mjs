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
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { selectShell } from '../../sim/damage.ts';
import { FORTIFIED_HP_SP, createFortifiedCoverLedger } from '../../sim/fortifiedCover.ts';
import { captureEntityExtras, encodeMigrationKeyframe, decodeMigrationKeyframe, applyResumeState } from './migrationState.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';

const seats = [
  { seat: 0, playerId: 'ifv', name: 'IFV', team: 'alpha', specId: 'm2a2_bradley', consumables: ['track_links', 'foliage', 'ir_jammer'] },
  { seat: 1, playerId: 'mbt', name: 'MBT', team: 'bravo', specId: 'leclerc_s2' },
];
await ensureAuthorityFleet(seats.map((seat) => seat.specId));
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
console.log('combatMigration: reload channels, module hp, fire ticks, magazine, salvo, consumables, smoke and pillbox points survive a serialized host handoff');
