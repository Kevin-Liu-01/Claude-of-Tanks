// Proof (implicit state machine audit, round 2 U2, 2026-11-04): smoke screens across a host migration. Two defects:
//   - a migrated host restored no smoke: every screen still standing on the old host was gone, so the hulls behind it
//     were in sight at once (the authority's spotting and roof guns read its screens: smokeBlocks) and every peer's
//     smoke vanished with the next frame;
//   - a resumed host's frames carried each screen's launch time on its own authority clock, which starts at 0, while a
//     client ages a network screen by the battle clock (battlePresentation.ts game.timeS = meta.battleTimeMs): every
//     screen read as launched the old hosts' whole battle ago, past SMOKE_DURATION_S, and was never drawn.
// The frame meta carries the compact screens (smokeReceipt.ts packSmokeScreen) on the battle clock now (matchActor.ts
// metaOnBattleClock, the keyframe's meta too), and applyResumeState lays them down on the new authority's clock
// (restoreSmokeScreens). Built as combatMigration's handoff, with a loopback client reading the new host's frames.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { createLoopbackLink } from '../../../server/match/link.ts';
import { MESSAGE_TYPE, PROTOCOL_VERSION, TICK_MS } from '../wire/constants.ts';
import { applySnapshotPacket, decodeMessage } from '../wire/codec.ts';
import { PLAYER_ACTION_BITS } from '../../sim/playerActions.ts';
import { SMOKE_DURATION_S } from '../../sim/smokeScreen.ts';
import { applyResumeState, captureEntityExtras, decodeMigrationKeyframe, encodeMigrationKeyframe } from './migrationState.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';

const seats = [
  { seat: 0, playerId: 'screen', name: 'Screen', team: 'alpha', specId: 'leclerc_s2' },
  { seat: 1, playerId: 'watch', name: 'Watch', team: 'bravo', specId: 'leclerc_s2', spawn: { x: 60, z: 0, yaw: Math.PI } },
];
await ensureAuthorityFleet(seats.map((seat) => seat.specId));
const world = () => ({ mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [] });
let nowMs = 1000;
const make = (resume, autoStart = false) => createMatchActor({ roomId: 'resume-smoke', mapId: 'verdant', seed: 61, seats, bots: [], world: world(), countdownS: 0, autoStart, now: () => nowMs, schedule: () => () => {}, resume });
const still = { throttle: 0, steer: 0, brake: true, fire: false, aimLocked: true, shellSlot: 0, actionBits: 0 };
const smokeInputs = new Map([['screen', { ...still, actionBits: PLAYER_ACTION_BITS.SMOKE }], ['watch', still]]);
const stillInputs = new Map([['screen', still], ['watch', still]]);
const screensOf = (authority) => authority.snapshotMeta('watch').smokeScreens ?? [];

/** The frames a seat's client reads from an actor: each one's battle clock (s) and its smoke screens' launch times. */
function watchFrames(actor) {
  const link = createLoopbackLink('watch');
  const frames = [];
  let history = new Map();
  link.client.onMessage((bytes) => {
    const decoded = decodeMessage(bytes, { resolveBaseline: (tick) => history.get(tick) ?? null });
    if (!decoded.ok || decoded.message.type !== MESSAGE_TYPE.SNAPSHOT) return;
    let frame;
    try { frame = applySnapshotPacket(decoded.message, decoded.message.keyframe ? null : history.get(decoded.message.baseTick) ?? null); } catch { return; }
    history.set(frame.tick, frame);
    frames.push({ clockS: frame.meta.battleTimeMs / 1000, born: frame.meta.smokeJson ? JSON.parse(frame.meta.smokeJson).map((screen) => screen.born) : [] });
  });
  const hello = { type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 1, token: 'issued-elsewhere', clientBuild: 'selftest' };
  const claims = { v: 1, roomId: actor.roomId, seat: 1, playerId: 'watch', name: 'Watch', team: 'bravo', specId: 'leclerc_s2', iat: 0, exp: 1 };
  actor.attach(link.server, hello, claims);
  return frames;
}
const advance = (actor, ticks) => { for (let n = 0; n < ticks; n++) { nowMs += TICK_MS; actor.advance(nowMs); } };

// ---- the old host: a screen launched, two seconds old at the keyframe
const old = make(null), sim = old.authority;
sim.onMatchReady();
for (let n = 0; n < 60; n++) sim.step({ dt: 1 / 60, inputs: stillInputs });
sim.step({ dt: 1 / 60, inputs: smokeInputs });
assert.equal(screensOf(sim).length, 1, 'setup: the old host launched a smoke screen');
for (let n = 0; n < 120; n++) sim.step({ dt: 1 / 60, inputs: stillInputs });
const ageOld = sim.timeS - screensOf(sim)[0].born;
const tick = Math.round(sim.timeS * 60), battleTimeMs = Math.round(sim.timeS * 1000), era = createEraIndexer();
const snap = sim.snapshot({ tick, serverTimeMs: battleTimeMs, viewerId: 'migration', ackInputSeq: null });
const frame = { tick, serverTimeMs: battleTimeMs, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127, meta: captureMeta({ ...snap.meta, battleTimeMs }, false),
  destroyed: [], entities: sim.entities.map((entity) => captureEntityRow(entity, old.wireIdOf(entity.id), era, tick)), shells: [], viewer: null, modeStateJson: null };
assert.ok(frame.meta.smokeJson, 'setup: the keyframe\'s meta carries the screen');
const sealed = decodeMigrationKeyframe(encodeMigrationKeyframe({ tick, battleTimeMs, timeS: sim.timeS, phase: 'playing', modeCheckpoint: sim.captureModeCheckpoint(), entities: captureEntityExtras(old), frame }));

// ---- the new host: the screen stands on, as old as it was, on the authority and in every frame
const fresh = make({ tick, battleTimeMs });
applyResumeState(fresh, sealed);
const restored = screensOf(fresh.authority);
assert.equal(restored.length, 1, `the new host keeps the screen still standing (it has ${restored.length}: the hulls behind it were in sight at once)`);
const ageNew = fresh.authority.timeS - restored[0].born;
assert.ok(Math.abs(ageNew - ageOld) < 0.002, `as old as it was (${ageNew.toFixed(3)} s on the new host, ${ageOld.toFixed(3)} s on the old)`);
fresh.start();
const frames = watchFrames(fresh);
advance(fresh, 6);
const seen = frames.filter((entry) => entry.born.length);
assert.ok(seen.length, 'the new host\'s frames carry the screen');
const ageSeen = seen.at(-1).clockS - seen.at(-1).born[0];
assert.ok(Math.abs(ageSeen - (ageOld + 6 / 60)) < 0.05, `a client ages it by its battle clock as the old host had it (${ageSeen.toFixed(3)} s, want ${(ageOld + 6 / 60).toFixed(3)} s)`);
fresh.stop(); old.stop();

// ---- a screen launched on a resumed host (a minute of battle already played): every client draws it
{
  nowMs = 5000;
  const resumed = make({ tick: 3600, battleTimeMs: 60_000 });
  resumed.start();
  const seenFrames = watchFrames(resumed);
  advance(resumed, 30);
  resumed.authority.step({ dt: 1 / 60, inputs: smokeInputs });
  advance(resumed, 12);
  const latest = seenFrames.filter((entry) => entry.born.length).at(-1);
  assert.ok(latest, 'the resumed host\'s frames carry its screen');
  const age = latest.clockS - latest.born[0];
  assert.ok(age >= 0 && age < 1, `a screen launched a fraction of a second ago reads that young to a client (${age.toFixed(3)} s on its battle clock; past ${SMOKE_DURATION_S} s it is never drawn)`);
  resumed.stop();
}
console.log('resumeSmoke: a migrated host keeps the smoke screens still standing, as old as they were, and a resumed host\'s frames carry every screen on the battle clock its clients age it by');
