// 2026-11-02 audit F11 (machine 1): the audio engine's battle mode is one declared state with one transition
// function (battleMode.ts). Drives the real engine: a network match's next round (a battle phase edge from a battle)
// opens a new battle (its rollout horn, no pause or wreck fires carried over); a re-sent `tank:destroyed` adds no
// second wreck or kill call and a second `battle:presented` no second stinger; a destroyed event without a position
// cannot throw into the emitter; phase, rollout, pause and kill-cam facts that arrive before the graph exists are
// kept and replayed when it does (the engine directly and through the lazy facade's deferred load).
import assert from 'node:assert/strict';
import { createBus } from '../game/stateCore.ts';
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
    cold.bindBus(bus);
    bus.emit('phase:change', { phase: 'battle' });
    bus.emit('battle:rollout', { late: true });
    bus.emit('ui:pause', { on: true });
    bus.emit('killcam:begin', { kind: 'death' });
    cold.resume(); // the graph arrives mid-battle
    const probe = probeOf();
    const frame = (dt = 1 / 30) => { ctx.advance(dt); cold.update(dt, listener, tanks); };
    frame();
    assert.equal(probe.snapshot, 'paused', 'a pause raised before the graph existed is kept');
    bus.emit('ui:pause', { on: false });
    frame();
    assert.equal(probe.snapshot, 'killcam', 'and so is the kill-cam');
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
  assert.equal(step({ kind: 'killcam', on: true }), 'killcam');
  assert.equal(step({ kind: 'phase', phase: 'battle' }), 'enter-battle', 'a battle edge from a battle opens a new one');
  assert.deepEqual([m.stage, m.battle, m.paused, m.killcam, m.over, m.result, m.rolledOut], ['loading', 2, false, false, false, null, false]);
  assert.equal(step({ kind: 'presented', result: 'draw' }), 'presented', 'a presentation that comes without its verdict carries it');
  assert.deepEqual([m.over, m.result], [true, 'draw']);
  step({ kind: 'pause', on: true });
  assert.equal(step({ kind: 'phase', phase: 'garage' }), 'leave-battle');
  assert.deepEqual([m.stage, m.paused, m.over], ['garage', false, false]);
  assert.equal(step({ kind: 'phase', phase: 'garage' }), 'phase');
  const late = createAudioBattleMode('battle');
  assert.deepEqual([late.phase, late.stage, late.battle], ['battle', 'loading', 1], 'a mixer adopted mid-battle starts in its loading stage');
}

console.log('battleMode.selftest: one battle mode (next round, duplicate deaths and presentations, facts before the graph, the lazy carry, the transitions) passed');
