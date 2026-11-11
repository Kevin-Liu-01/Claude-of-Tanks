// 2026-11-02 audit F11 (machine 1): the audio engine's battle mode is one declared state with one transition
// function (battleMode.ts). Drives the real engine: a network match's next round (a battle phase edge from a battle)
// opens a new battle (its rollout horn, no pause or wreck fires carried over); a re-sent `tank:destroyed` adds no
// second wreck or kill call and a second `battle:presented` no second stinger; a destroyed event without a position
// cannot throw into the emitter; phase, rollout, pause and kill-cam facts that arrive before the graph exists are
// kept and replayed when it does (the engine directly and through the lazy facade's deferred load).
import assert from 'node:assert/strict';
import { createBus } from '../game/stateCore.ts';
import { publishKillcamScreen } from '../game/killcamScreen.ts';
import {
  installFetch, namedContext, terrain, tank, listener, sounding, probeOf, mark, since, count, settle,
} from './engineHarness.test-support.mjs';

globalThis.window = {};
installFetch();
const { createAudio } = await import('./audioEngine.ts');
const { createLazyAudio } = await import('./lazyAudio.ts');

const ROSTER = ['t72b3m_2022', 'leo2a4'];
const me = tank('me', { isPlayer: true });
const foe = tank('foe', { specId: 'leo2a4', nation: 'Germany', x: -40, z: 120, team: 'enemy' });
const tanks = [me, foe];
const killCalls = (probe) => probe.sayLog.filter((e) => e.id === 'target_destroyed' || e.id === 'double_kill');
const destroyFoe = (bus) => bus.emit('tank:destroyed', { id: 'foe', killerId: 'me', pos: [-40, 0, 120], cause: 'ammorack' });

// ------------------------------------------------------------ 1. one battle, then a network match's next round
{
  const ctx = namedContext();
  const audio = createAudio({ context: ctx, getMapId: () => 'verdant', getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop' });
  const bus = createBus();
  audio.bindBus(bus);
  audio.resume();
  const probe = probeOf();
  const frame = (list = tanks, dt = 1 / 30) => { ctx.advance(dt); audio.update(dt, listener, list); };
  bus.emit('phase:change', { phase: 'battle' });
  await audio.warmBattleEvents(ROSTER);
  await probe.libraryIdle();
  audio.ambientOn(true);
  for (let i = 0; i < 10; i++) frame();
  let seq = mark(probe);
  bus.emit('battle:rollout', {});
  assert.equal(count(since(seq, probe), 'ui_countdown_go'), 1, 'the first round rolls out on its horn');

  // our kill: an ammo-rack cook-off, its fires looping on the wreck
  seq = mark(probe);
  destroyFoe(bus);
  for (let i = 0; i < 40; i++) frame();
  // the same event again, a second later (a network event re-sent after a host migration)
  destroyFoe(bus);
  for (let i = 0; i < 40; i++) frame();
  let names = since(seq, probe);
  assert.equal(count(names, 'tank_explode_ammo'), 1, `one hull, one blast (${names})`);
  assert.equal(count(names, 'cookoff_loop'), 1, `one wreck, one cook-off loop (${names})`);
  assert.equal(killCalls(probe).length, 1, `one kill call, never a "double kill" for one kill (${killCalls(probe).map((e) => e.id)})`);
  assert.ok(sounding(ctx).includes('cookoff_loop'), 'the wreck burns');

  // a destroyed event with no position (an older host's event for a hull this seat never presented) cannot throw
  assert.doesNotThrow(() => bus.emit('tank:destroyed', { id: 'unseen', killerId: 'x', pos: null }), 'a positionless death is tolerated');

  // a new life: the same hull respawns (seen destroyed, then alive) and dies again, and that death is heard
  for (let i = 0; i < 3; i++) frame([me, tank('foe', { specId: 'leo2a4', x: -40, z: 120, team: 'enemy', destroyed: true })]);
  for (let i = 0; i < 3; i++) frame();
  seq = mark(probe);
  bus.emit('tank:destroyed', { id: 'foe', killerId: 'ally', pos: [-40, 0, 120], cause: 'shot' });
  assert.equal(count(since(seq, probe), 'tank_explode'), 1, 'a respawned hull dies again, heard');
  for (let i = 0; i < 10; i++) frame();
  // and a respawn the mode announces re-arms one this seat never saw alive again
  bus.emit('mode:respawn', { id: 'foe', team: 'enemy' });
  seq = mark(probe);
  bus.emit('tank:destroyed', { id: 'foe', killerId: 'ally', pos: [-40, 0, 120], cause: 'shot' });
  assert.equal(count(since(seq, probe), 'tank_explode'), 1, 'a death after an announced respawn is heard');

  bus.emit('ui:pause', { on: true });
  frame();
  assert.equal(probe.snapshot, 'paused');

  // round 2: the network activation raises the battle phase again, with no garage between
  bus.emit('phase:change', { phase: 'battle' });
  for (let i = 0; i < 20; i++) frame();
  assert.equal(probe.snapshot, 'battle', 'the next round does not start under the last round\'s pause');
  assert.deepEqual(sounding(ctx).filter((n) => n === 'cookoff_loop' || n === 'wreck_fire_loop'), [], 'the last round\'s wrecks stop burning');
  seq = mark(probe);
  bus.emit('battle:rollout', {});
  names = since(seq, probe);
  assert.equal(count(names, 'ui_countdown_go'), 1, `the next round rolls out on its own horn (${names})`);
  assert.equal(count(names, 'sting_battle'), 1, 'and its opener');

  // the round's end: one verdict, one presentation, one stinger, the result call through the crew gate
  bus.emit('battle:ended', { result: 'victory' });
  seq = mark(probe);
  bus.emit('battle:presented', { result: 'victory' });
  for (let i = 0; i < 30; i++) frame();
  bus.emit('battle:presented', { result: 'victory' });
  assert.equal(count(since(seq, probe), 'sting_victory'), 1, 'a second presentation replays no stinger');
  assert.ok(probe.sayLog.some((e) => e.id === 'victory'), 'the result call goes through the crew radio gate (its sayLog)');
  bus.emit('phase:change', { phase: 'garage' });
  frame([]);
}

// ------------------------------------------------------------ 2. facts that arrive before the graph exists
{
  const ctx = namedContext();
  const previousAC = globalThis.AudioContext;
  globalThis.AudioContext = function FakeAudioContext() { return ctx; };
  try {
    const cold = createAudio({ context: null, getMapId: () => 'verdant', getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop' });
    const bus = createBus();
    let replayLive = false; // the replay controller's own flag (killcamScreen.ts): a kill-cam edge's fact
    publishKillcamScreen(bus, () => replayLive);
    cold.bindBus(bus);
    bus.emit('phase:change', { phase: 'battle' });
    bus.emit('battle:rollout', { late: true });
    bus.emit('ui:pause', { on: true });
    replayLive = true;
    bus.emit('killcam:begin', { kind: 'death' });
    cold.resume(); // the graph arrives mid-battle
    const probe = probeOf();
    const frame = (dt = 1 / 30) => { ctx.advance(dt); cold.update(dt, listener, tanks); };
    frame();
    assert.equal(probe.snapshot, 'paused', 'a pause raised before the graph existed is kept');
    bus.emit('ui:pause', { on: false });
    frame();
    assert.equal(probe.snapshot, 'killcam', 'and so is the kill-cam');
    replayLive = false;
    bus.emit('killcam:done', {});
    frame();
    assert.equal(probe.snapshot, 'battle', 'the battle mix, never the garage, once both end');
    assert.equal(probe.battleState().rolledOut, true, 'the rollout heard before the graph is kept (bells, the quiet radio)');
    {
      const at = mark(probe);
      bus.emit('battle:rollout', {});
      assert.equal(count(since(at, probe), 'ui_countdown_go'), 0, 'and a later edge in the same battle stays silent');
    }
    bus.emit('phase:change', { phase: 'garage' });
  } finally {
    if (previousAC === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previousAC;
  }
}

// ------------------------------------------------------------ 3. the lazy facade carries the mode across its deferred load
{
  const ctx = namedContext();
  let finish;
  const lazy = createLazyAudio({
    createContext: () => ctx,
    loadMixer: () => new Promise((resolve) => { finish = resolve; }),
    hasStickyActivation: () => true,
    getMapId: () => 'verdant',
    getGameMode: () => 'standard',
    getTerrain: () => terrain,
  });
  const bus = createBus();
  lazy.bindBus(bus);
  lazy.resume();
  bus.emit('phase:change', { phase: 'battle' });
  bus.emit('battle:rollout', {});
  bus.emit('ui:pause', { on: true });
  finish(await import('./audioEngine.ts'));
  await lazy.preload();
  await settle();
  const probe = probeOf();
  ctx.advance(1 / 30);
  lazy.update(1 / 30, listener, tanks);
  assert.equal(probe.snapshot, 'paused', 'a mixer loaded mid-battle starts under the pause it could not hear');
  assert.equal(probe.battleState().rolledOut, true, 'and rolled out');
  bus.emit('phase:change', { phase: 'garage' });
}

// ------------------------------------------------------------ 4. the transition function
{
  const { createAudioBattleMode, stepAudioBattleMode } = await import('./battleMode.ts');
  const m = createAudioBattleMode();
  const step = (event) => stepAudioBattleMode(m, event);
  assert.deepEqual({ ...m }, { phase: 'garage', stage: 'garage', battle: 0, rolledOut: false, over: false, result: null, paused: false, killcam: false });
  assert.equal(step({ kind: 'rollout', late: false }), null, 'no rollout outside a battle');
  assert.equal(step({ kind: 'ended', result: 'victory' }), null, 'no verdict outside a battle');
  assert.equal(step({ kind: 'presented', result: 'victory' }), null, 'no presentation outside a battle');
  assert.equal(step({ kind: 'phase', phase: 'battle' }), 'enter-battle');
  assert.deepEqual([m.stage, m.battle, m.rolledOut], ['loading', 1, false]);
  assert.equal(step({ kind: 'rollout', late: false }), 'rollout');
  assert.equal(step({ kind: 'rollout', late: false }), null, 'one rollout a battle');
  assert.equal(step({ kind: 'ended', result: 'defeat' }), 'ended');
  assert.equal(step({ kind: 'ended', result: 'victory' }), null, 'one verdict a battle');
  assert.deepEqual([m.stage, m.over, m.result], ['over', true, 'defeat']);
  assert.equal(step({ kind: 'rollout', late: false }), null, 'no rollout after the verdict');
  assert.equal(step({ kind: 'presented', result: null }), 'presented');
  assert.equal(m.result, 'defeat', 'a presentation without its own result keeps the verdict');
  assert.equal(step({ kind: 'presented', result: 'victory' }), null, 'one presentation a battle');
  assert.equal(step({ kind: 'pause', on: true }), 'pause');
  assert.equal(step({ kind: 'pause', on: true }), null, 'a pause already up is no move (U34, round 2)');
  assert.equal(step({ kind: 'killcam', on: true }), 'killcam');
  assert.equal(step({ kind: 'killcam', on: true }), null, 'a repeated kill-cam begin is no move: no second whoosh in');
  assert.equal(step({ kind: 'phase', phase: 'battle' }), 'enter-battle', 'a battle edge from a battle opens a new one');
  assert.deepEqual([m.stage, m.battle, m.paused, m.killcam, m.over, m.result, m.rolledOut], ['loading', 2, false, false, false, null, false]);
  assert.equal(step({ kind: 'presented', result: 'draw' }), 'presented', 'a presentation that comes without its verdict carries it');
  assert.deepEqual([m.over, m.result], [true, 'draw']);
  assert.equal(step({ kind: 'killcam', on: false }), null, 'a kill-cam done with no replay up is no move: no whoosh out');
  step({ kind: 'pause', on: true });
  assert.equal(step({ kind: 'phase', phase: 'garage' }), 'leave-battle');
  assert.deepEqual([m.stage, m.paused, m.over], ['garage', false, false]);
  assert.equal(step({ kind: 'phase', phase: 'garage' }), 'phase');
  assert.equal(step({ kind: 'pause', on: true }), null, 'no pause outside a battle (the overlays are a battle\'s)');
  assert.equal(step({ kind: 'killcam', on: true }), null, 'no kill-cam outside a battle');
  assert.deepEqual([m.paused, m.killcam], [false, false]);
  // one reading of a payload for both layers (the engine's and the facade's facts were built apart)
  const { audioBattleFact, AUDIO_BATTLE_FACT_EVENTS } = await import('./battleMode.ts');
  assert.deepEqual(audioBattleFact('phase:change', {}, () => false), { kind: 'phase', phase: 'garage' }, 'a phase edge naming no phase is the garage');
  assert.deepEqual(audioBattleFact('phase:change', undefined, () => false), { kind: 'phase', phase: 'garage' });
  assert.deepEqual(audioBattleFact('killcam:begin', {}, () => false), { kind: 'killcam', on: false }, 'a kill-cam edge carries the replay\'s flag');
  assert.deepEqual(audioBattleFact('killcam:done', {}, () => true), { kind: 'killcam', on: true }, 'a stale done while the replay is up');
  assert.equal(audioBattleFact('tank:destroyed', {}, () => false), null);
  assert.deepEqual([...AUDIO_BATTLE_FACT_EVENTS].sort(), ['battle:ended', 'battle:presented', 'battle:rollout', 'killcam:begin', 'killcam:done', 'phase:change', 'ui:pause']);
  const late = createAudioBattleMode('battle');
  assert.deepEqual([late.phase, late.stage, late.battle], ['battle', 'loading', 1], 'a mixer adopted mid-battle starts in its loading stage');
}

// ------------------------------------------------------------ 5. the kill-cam overlay reads the replay's own flag (IR15, U34, Q16)
{
  const ctx = namedContext();
  const audio = createAudio({ context: ctx, getMapId: () => 'verdant', getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop' });
  const bus = createBus();
  let replayLive = false;
  publishKillcamScreen(bus, () => replayLive);
  audio.bindBus(bus);
  audio.resume();
  const probe = probeOf();
  const frame = (dt = 1 / 30) => { ctx.advance(dt); audio.update(dt, listener, tanks); };
  bus.emit('phase:change', { phase: 'battle' });
  await audio.warmBattleEvents(ROSTER);
  await probe.libraryIdle();
  for (let i = 0; i < 5; i++) frame();
  bus.emit('battle:rollout', {});
  for (let i = 0; i < 5; i++) frame();
  let seq = mark(probe);
  const second = () => { for (let i = 0; i < 30; i++) frame(); }; // past any re-trigger cooldown of the cue itself
  replayLive = true;
  bus.emit('killcam:begin', { kind: 'death' });
  second();
  bus.emit('killcam:begin', { kind: 'death' }); // the same replay's begin again (a second playForResult over it)
  second();
  assert.equal(count(since(seq, probe), 'killcam_in'), 1, 'a repeated begin plays no second whoosh in');
  assert.equal(probe.snapshot, 'killcam');
  // the replay's teardown ran, but its done never reached this mixer: the next frame reads the flag
  seq = mark(probe);
  replayLive = false;
  frame();
  assert.equal(probe.snapshot, 'battle', 'a lost done does not keep the kill-cam mix for the rest of the battle');
  assert.equal(probe.battleState().killcam, false);
  assert.equal(count(since(seq, probe), 'killcam_out'), 1, 'the replay\'s end is heard once');
  second();
  seq = mark(probe);
  bus.emit('killcam:done', {}); // the late done itself, then a done whose begin was never heard
  second();
  bus.emit('killcam:done', {});
  second();
  assert.equal(count(since(seq, probe), 'killcam_out'), 0, 'a done with no replay up plays no whoosh out');
  // a stale done while a replay is still up keeps the replay's mix
  replayLive = true;
  bus.emit('killcam:begin', { kind: 'final' });
  bus.emit('killcam:done', {});
  frame();
  assert.equal(probe.snapshot, 'killcam', 'an edge never outvotes the replay\'s flag');
  replayLive = false;
  bus.emit('killcam:done', {});
  frame();
  // outside a battle (a staged replay frame in the Garage, shot tooling): no overlay, no whoosh
  bus.emit('phase:change', { phase: 'garage' });
  frame();
  seq = mark(probe);
  replayLive = true;
  bus.emit('killcam:begin', { kind: 'death' });
  for (let i = 0; i < 3; i++) frame();
  assert.equal(count(since(seq, probe), 'killcam_in'), 0, 'a replay staged in the Garage sounds no battle whoosh');
  assert.equal(probe.battleState().killcam, false);
  replayLive = false;
  bus.emit('killcam:done', {});
  frame();
}

// ------------------------------------------------------------ 6. the facade reads a payload as the mixer does
{
  const ctx = namedContext();
  let finish;
  const lazy = createLazyAudio({
    createContext: () => ctx,
    loadMixer: () => new Promise((resolve) => { finish = resolve; }),
    hasStickyActivation: () => true,
    getMapId: () => 'verdant',
    getGameMode: () => 'standard',
    getTerrain: () => terrain,
  });
  const bus = createBus();
  lazy.bindBus(bus);
  lazy.resume();
  bus.emit('phase:change', { phase: 'battle' });
  bus.emit('phase:change', {}); // a phase edge naming no phase: the garage, to the facade as to the mixer
  finish(await import('./audioEngine.ts'));
  await lazy.preload();
  await settle();
  const probe = probeOf();
  ctx.advance(1 / 30);
  lazy.update(1 / 30, listener, tanks);
  assert.equal(probe.battleState().phase, 'garage', 'a mixer loaded after a phase edge with no phase starts in the garage');
}

console.log('battleMode.selftest: one battle mode (next round, duplicate deaths and presentations, facts before the graph, the lazy carry, the transitions, the kill-cam flag, one payload reading) passed');
