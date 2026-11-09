// 2026-11-02 audit F11 (machine 12): the engine's smaller latches. A caption for a cue heard later (an aircraft's
// pass) is due on the audio clock, not a wall-clock timer, and never lands in the next battle; the caption stream's
// cooldowns start afresh with each battle (captions.reset was never called); a gunship player, who has no rig of its
// own, does not keep the engine start-up armed for the whole battle; and a mode respawn starts the hull's audio module
// states whole, so its new life's first break of a module the last life broke sounds (round 4 merge review r1); a network
// restart forgets where the abandoned battle's drones were last heard (round 8 Y0 review r2).
import assert from 'node:assert/strict';
import { createBus } from '../game/stateCore.ts';
import { installFetch, namedContext, terrain, tank, listener, probeOf, mark, since, count } from './engineHarness.test-support.mjs';

globalThis.window = {};
installFetch();
const { createAudio } = await import('./audioEngine.ts');

const ctx = namedContext();
const audio = createAudio({ context: ctx, getMapId: () => 'verdant', getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop' });
const bus = createBus();
audio.bindBus(bus);
audio.resume();
const probe = probeOf();
await probe.libraryIdle();
const me = tank('me', { isPlayer: true });
const frames = (seconds, list = [me]) => { for (let t = 0; t < seconds - 1e-9; t += 1 / 30) { ctx.advance(1 / 30); audio.update(1 / 30, listener, list); } };
// the cue captions (an alarm, a sound), apart from the radio's own captions of its lines
const captionsOf = (id) => probe.captionLog.filter((e) => e.id === id && e.kind !== 'radio');
bus.emit('phase:change', { phase: 'battle' });
await audio.warmBattleEvents(['t72b3m_2022']);
await probe.libraryIdle();
frames(0.3);
bus.emit('battle:rollout', {});

// 1. an aircraft passing over us in ten seconds: its caption when it is heard, 6.5 s on the audio clock
const flyover = { p0: [-200, 150, 0], v: [20, 0, 0], durationS: 20, aircraft: 'jet' };
bus.emit('atmosphere:flyover', flyover);
frames(6);
assert.equal(captionsOf('aircraft').length, 0, 'not before the pass is heard');
frames(1);
assert.equal(captionsOf('aircraft').length, 1, 'captioned as the pass is heard, on the audio clock');
// a device the browser suspends holds its captions with its sound: no audio time passes, nothing is due
bus.emit('atmosphere:flyover', { ...flyover, p0: [-200, 160, 0] });
const held = captionsOf('aircraft').length;
await new Promise((resolve) => setTimeout(resolve, 120));
assert.equal(captionsOf('aircraft').length, held, 'wall time alone brings no caption');

// 2. a pass scheduled in one battle is never captioned in the next (a network match's next round)
bus.emit('phase:change', { phase: 'battle' });
assert.equal(probe.captionLog.length, 0, 'the caption stream starts afresh with each battle');
frames(8);
assert.equal(captionsOf('aircraft').length, 0, 'the last battle\'s pass is not captioned in this one');

// 3. the cooldowns are per battle: a fire just captioned is captioned again in the next battle
bus.emit('battle:rollout', {});
bus.emit('tank:fire', { id: 'me', burning: true });
assert.equal(captionsOf('fire').length, 1, 'our tank burns: captioned');
bus.emit('tank:fire', { id: 'me', burning: false });
frames(0.5);
bus.emit('phase:change', { phase: 'battle' });
const edgeAt = ctx.currentTime;
frames(0.3);
bus.emit('tank:fire', { id: 'me', burning: true });
assert.ok(captionsOf('fire').some((e) => e.atS >= edgeAt), 'a fire in the next battle is captioned, whatever the last battle\'s cooldown');
bus.emit('tank:fire', { id: 'me', burning: false });

// 4. a gunship player has no rig of its own: its start-up does not stay armed
bus.emit('phase:change', { phase: 'battle' });
const gunship = tank('me', { isPlayer: true, aerial: { kind: 'gunship', active: true } });
frames(0.5, [gunship]);
assert.equal(probe.engineState().some((rig) => rig.id === 'me'), false, 'the gunship has no ground rig');
assert.equal(probe.battleState().startEngineArmed, false, 'and no engine start-up waiting for one');
bus.emit('phase:change', { phase: 'battle' });
frames(0.5);
assert.equal(probe.battleState().startEngineArmed, false, 'a tank\'s own start-up fires with its rig\'s first frames');

// 5. a mode respawn starts the hull's new life whole (round four merge review r1): the presentation mends its modules at
// mode_respawn (battlePresentation reviveAtRespawn), so the new life's first break of a module the last life broke is a
// change: its track_break sounds, for our hull its crew call too (and the radio's damage, set to 0 at the respawn,
// follows a broken radio again). The 'respawn' mode case kept the hull's module states, so none of them came.
bus.emit('phase:change', { phase: 'battle' });
bus.emit('battle:rollout', {});
const foe = tank('foe', { team: 'bravo' });
const both = [me, foe];
frames(0.3, both);
const throwTrack = (id) => {
  const sfxAt = mark(probe), sayAt = probe.sayLog.length;
  bus.emit('module:state', { id, module: 'trackL', state: 'red', source: 'shot' });
  frames(0.1, both);
  return { trackBreak: count(since(sfxAt, probe), 'track_break'), crewCall: probe.sayLog.slice(sayAt).filter((e) => e.id === 'track_gone').length };
};
for (const id of ['me', 'foe']) {
  const firstLife = throwTrack(id);
  bus.emit('tank:destroyed', { id, killerId: 'x', cause: 'shot' });
  frames(0.1, both);
  const respawnAt = mark(probe);
  bus.emit('mode:respawn', { type: 'mode_respawn', id, team: id === 'me' ? 'alpha' : 'bravo' });
  frames(0.1, both);
  if (id === 'me') assert.equal(count(since(respawnAt, probe), 'ui_respawn'), 1, 'our respawn is heard (the respawn case ran)');
  const newLife = throwTrack(id);
  assert.equal(firstLife.trackBreak, 1, `${id}: the first life's thrown track sounds`);
  assert.equal(newLife.trackBreak, 1, `${id}: the new life's first thrown track sounds too (its module states start whole)`);
  if (id === 'me') assert.deepEqual([firstLife.crewCall, newLife.crewCall], [1, 1], 'our crew calls the thrown track in each life');
}
bus.emit('phase:change', { phase: 'garage' });

// 6. where each carrier's drone was last heard is the battle's play (round 8 Y0 review r2): a network battle's restart
// opens a new battle (restartLives runs resetBattlePlay), so a drone shot down before the restarted battle has heard it
// fly breaks up nowhere, as after a battle edge. droneLastAt was cleared only at a battle edge (resetBattleFields), so
// after 'battle:restarted' a carrier's drone shot down before its new flight's first audio frame broke up at the
// abandoned battle's spot.
bus.emit('phase:change', { phase: 'battle' });
bus.emit('battle:rollout', {});
const drone = { id: 7, dead: false, shooterId: 'c1', spec: { tracer: 'DRONE' }, pos: { x: 120, y: 30, z: 80 }, vel: { x: 0, y: 0, z: 0 } };
const fly = (seconds, shells) => { for (let t = 0; t < seconds - 1e-9; t += 1 / 30) { ctx.advance(1 / 30); audio.update(1 / 30, listener, [me], shells); } };
const downHeard = () => {
  const at = probe.soundLog.at(-1)?.seq ?? 0;
  bus.emit('drone:down', { id: 'c1', killerId: 'me' });
  return probe.soundLog.filter((e) => e.seq > at && e.type === 'drone:down').map((e) => e.heard);
};
fly(0.1, [drone]);
fly(0.1, []);
assert.deepEqual(downHeard(), [true], 'a drone shot down in its battle breaks up where it was last heard');
bus.emit('battle:restarted', {});
fly(0.1, []);
assert.deepEqual(downHeard(), [false], 'after a network restart, a drone the restarted battle has not heard fly breaks up nowhere');
fly(0.1, [drone]);
fly(0.1, []);
assert.deepEqual(downHeard(), [true], 'the restarted battle\'s own drone is heard where it flew');
bus.emit('phase:change', { phase: 'garage' });

console.log('audioLatches.selftest: captions on the audio clock and per battle, the gunship start-up disarmed, a respawned hull\'s module states whole, a restart forgetting the drones\' spots passed');
