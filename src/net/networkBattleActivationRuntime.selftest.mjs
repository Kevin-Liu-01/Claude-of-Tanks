import assert from 'node:assert/strict';
import { createNetworkBattleActivationRuntime } from './networkBattleActivationRuntime.ts';

function createHarness({ spectator = false, observerReady = true } = {}) {
  const calls = [];
  let constructing = true;
  const world = { resetDestructibles: () => calls.push(['resetWorld']) };
  const game = {
    mapId: null,
    phase: 'garage',
    player: { spec: { id: 'm1a2' }, visual: { id: 'visual' }, equip: { rammer: true }, state: { yaw: 1.2 } },
  };
  const bridge = { setPerspective: (id) => calls.push(['perspective', id]) };
  const runtime = createNetworkBattleActivationRuntime({
    game,
    settings: {
      isOpen: () => true,
      close: (options) => calls.push(['settings', options]),
    },
    killcam: {
      cancel: () => calls.push(['killcam']),
      spectate: {
        targetId: 'ally-2',
        startObserver: () => {
          calls.push(['observer']);
          return observerReady;
        },
      },
    },
    driveTest: { resetAim: () => calls.push(['aim']) },
    getHud: () => {
      assert.equal(constructing, false, 'battle HUD stays lazy through boot composition');
      return {
        shotInfo: { setPlayer: (id) => calls.push(['shotPlayer', id]) },
        setMode: (mode) => calls.push(['hud', mode]),
      };
    },
    playerActions: {
      setTank: (spec) => calls.push(['tank', spec.id]),
      resetConsumables: () => calls.push(['consumables']),
    },
    getDamagePanel: () => {
      assert.equal(constructing, false, 'damage panel stays lazy through boot composition');
      return {
        setTank: (spec, visual) => calls.push(['damageTank', spec.id, visual.id]),
        setEquipment: (equip) => calls.push(['equipment', equip.rammer]),
      };
    },
    rig: {
      release: () => calls.push(['release']),
      snapArcade: (...args) => calls.push(['arcade', ...args]),
    },
    presentation: {
      setShotMode: (value) => calls.push(['shotMode', value]),
      setCaptureHidden: (value) => calls.push(['capture', value]),
      setNetworkSpectator: (value) => calls.push(['spectator', value]),
      setSelectedSpecId: (id) => calls.push(['select', id]),
      rememberSpecId: (id) => calls.push(['remember', id]),
      setWorldDormant: (value) => calls.push(['dormant', value]),
      getWorld: () => world,
      setCamoBiome: (id) => calls.push(['camo', id]),
      hideGarage: () => calls.push(['garage']),
      hideEndOverlay: () => calls.push(['end']),
      resetBattleResult: () => calls.push(['result']),
      setGarageSpots: (value) => calls.push(['spots', value]),
      setGarageSunTrim: (value) => calls.push(['sun', value]),
      emitPhaseChange: (phase) => calls.push(['phase', phase]),
      emitConsumableReset: () => calls.push(['consumableEvent']),
      stopShowroom: () => calls.push(['showroom']),
    },
    arcadeDistance: 2,
    arcadePitchRad: -0.5,
  });
  constructing = false;
  runtime.activate({
    viewerId: 'player-1',
    own: { id: 'player-1', specId: 'm1a2' },
    spectator,
    mapId: 'verdant',
    bridge,
    fx: {
      setFrozen: (value) => calls.push(['fxFrozen', value]),
      resetAll: () => calls.push(['fxReset']),
    },
  });
  return { calls, game };
}

const player = createHarness();
assert.equal(player.game.mapId, 'verdant');
assert.equal(player.game.phase, 'battle');
for (const expected of [
  ['select', 'm1a2'], ['remember', 'm1a2'], ['resetWorld'],
  ['tank', 'm1a2'], ['damageTank', 'm1a2', 'visual'],
  ['equipment', true], ['phase', 'battle'], ['arcade', 2, 1.2, -0.5],
]) assert.deepEqual(player.calls.find((call) => call[0] === expected[0]), expected);
assert.equal(player.calls.some(([name]) => name === 'observer'), false);

const observer = createHarness({ spectator: true });
assert.equal(observer.calls.some(([name]) => name === 'select'), false);
assert.equal(observer.calls.some(([name]) => name === 'tank'), false);
assert.deepEqual(observer.calls.find(([name]) => name === 'perspective'), ['perspective', 'ally-2']);

assert.throws(
  () => createHarness({ spectator: true, observerReady: false }),
  /No live vehicle is available to spectate/,
);

console.log('networkBattleActivationRuntime.selftest: player, spectator, and activation order pass');
