// 2026-11-02 audit F11 (machine 12): the engine's smaller latches. A caption for a cue heard later (an aircraft's
// pass) is due on the audio clock, not a wall-clock timer, and never lands in the next battle; the caption stream's
// cooldowns start afresh with each battle (captions.reset was never called); a gunship player, who has no rig of its
// own, does not keep the engine start-up armed for the whole battle.
import assert from 'node:assert/strict';
import { createBus } from '../game/stateCore.ts';
import { installFetch, namedContext, terrain, tank, listener, probeOf } from './engineHarness.test-support.mjs';

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
bus.emit('phase:change', { phase: 'garage' });

console.log('audioLatches.selftest: captions on the audio clock and per battle, the gunship start-up disarmed passed');
