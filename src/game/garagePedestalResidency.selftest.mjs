// 2026-11-02 audit R5 (hero residency): each pedestal visual carries one declared residency (staging, onStage,
// parked, lent, retired) instead of a state read back from its transform. The hero lent to a battle stays lent until
// the return adopts it: the watchdog no longer re-stages it on the podium during the return's yields, a battle that
// kept or released it without an adoption hands it back explicitly, and pose writers no longer change the state.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGaragePedestalRuntime } from './garagePedestalRuntime.ts';

const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };

function harness() {
  const scene = new THREE.Scene();
  const garagePosition = new THREE.Vector3(10, 5, -12);
  const debugTarget = {};
  const visuals = [];
  let player = null;
  let phase = 'garage';
  let selected = 'alpha';
  let watchdog = null;
  let clock = 0;
  const entities = new Map();
  const makeVisual = (specId) => {
    const root = new THREE.Object3D();
    const visual = {
      specId,
      root,
      setVisible(visible) { root.visible = visible; },
      seatRunningGearOnFloor(y) { root.position.y = y; },
      centerOnPresentationPoint(x, z) { root.position.x = x; root.position.z = z; },
      dispose() { root.removeFromParent(); },
    };
    visuals.push(visual);
    return visual;
  };
  const runtime = createGaragePedestalRuntime({
    scene,
    garagePosition,
    podiumTopY: 0.36,
    trackAxisYawRad: 0,
    residentLimit: 3,
    anisotropy: 4,
    createVisual: makeVisual,
    *createVisualSteps(specId) { return makeVisual(specId); },
    getSpec: (specId) => ({ id: specId }),
    ensureTankBuilder: async () => undefined,
    ensureTankBuilders: async () => undefined,
    prebakeSharedTextures: async () => undefined,
    discardSharedTextures: () => undefined,
    createBudgetYield: () => async () => undefined,
    compilePrograms: () => undefined,
    nextFrame: async () => undefined,
    getDeviceTier: () => 'desktop',
    getPhase: () => phase,
    isBootComplete: () => true,
    getSelectedId: () => selected,
    getNeighborIds: () => [],
    getBattlePlayer: () => player,
    getBattleEntity: (specId) => entities.get(specId),
    scheduleDelay: () => 0,
    scheduleWatchdog: (callback) => { watchdog = callback; return 'w'; },
    cancelWatchdog: () => undefined,
    now: () => clock,
    debugTarget,
  });
  return {
    runtime, scene, garagePosition, debugTarget, visuals, entities,
    tick: () => watchdog(),
    setPlayer(value) { player = value; },
    setPhase(value) { phase = value; },
    setSelected(value) { selected = value; },
    advance(ms) { clock += ms; },
  };
}

// The watchdog leaves a lent hero to the return's adoption.
{
  const h = harness();
  await h.runtime.set('alpha');
  const hero = h.runtime.current;
  assert.equal(h.runtime.residencyOf(hero), 'onStage');
  h.entities.set('alpha', {});
  assert.equal(h.runtime.lendToBattle('alpha'), true);
  assert.equal(h.runtime.residencyOf(hero), 'lent', 'the lend edge is declared on the visual');
  assert.equal(h.runtime.switchPending, false, 'a lent hero settles the selection: no pending switch into battle');
  h.setPlayer({ visual: hero });
  h.setPhase('battle');
  h.advance(90_000);
  hero.root.position.set(84, 19, 121);
  // The return: phase flips to garage, then the return yields before it adopts the player's visual.
  h.setPhase('garage');
  h.tick();
  await flush();
  assert.deepEqual(hero.root.position.toArray(), [84, 19, 121],
    'the watchdog must not re-stage the battle-held hero on the podium before the return adopts it');
  assert.equal(h.debugTarget.__PED_TRACE.some((row) => row.ev === 'watchdog-resync'), false);
  assert.equal(h.runtime.isOnStage(hero), false, 'a lent hero is not on stage, wherever its transform sits');
  assert.equal(h.runtime.adoptBattlePlayer('alpha'), true);
  assert.equal(h.runtime.residencyOf(hero), 'onStage');
  assert.equal(h.runtime.current, hero);
  assert.ok(Math.abs(hero.root.position.x - h.garagePosition.x) < 1e-6, 'the adoption poses it');
}

// A lend that ends without an adoption (the battle released or kept the visual) hands it back explicitly.
{
  const h = harness();
  await h.runtime.set('alpha');
  const hero = h.runtime.current;
  h.entities.set('alpha', {});
  assert.equal(h.runtime.lendToBattle('alpha'), true);
  h.setPlayer({ visual: hero });
  h.setPhase('battle');
  h.advance(90_000);
  h.setPhase('garage');
  // clearBattleAfterExit severs every entity's visual when nothing adopted it
  h.setPlayer({ visual: null });
  h.entities.get('alpha').visual = null;
  h.tick();
  await flush();
  assert.equal(h.runtime.residencyOf(hero), 'released', 'the battle kept the visual: the pedestal drops it');
  assert.equal(h.runtime.hasCached('alpha') && h.runtime.current === hero, false,
    'a visual the battle kept is never re-staged as the Garage hero');
  assert.notEqual(h.runtime.current, hero);
  assert.equal(h.runtime.current?.specId, 'alpha', 'the watchdog builds the selected hero afresh');
  assert.equal(h.runtime.residencyOf(h.runtime.current), 'onStage');
}

// A pose written onto a parked visual (any external writer) does not make it reusable or on stage.
{
  const h = harness();
  await h.runtime.set('alpha');
  const alpha = h.runtime.current;
  h.setSelected('bravo');
  await h.runtime.set('bravo');
  assert.equal(h.runtime.residencyOf(alpha), 'parked');
  alpha.root.position.copy(h.garagePosition);
  alpha.root.visible = true;
  assert.equal(h.runtime.isOnStage(alpha), false, 'state is declared, not inferred from a transform');
  h.setSelected('alpha');
  await h.runtime.set('alpha');
  assert.equal(h.runtime.current, alpha, 'the parked hero still returns through its declared state');
  assert.equal(h.runtime.residencyOf(alpha), 'onStage');
  assert.equal(h.runtime.residencyOf(h.visuals.find((visual) => visual.specId === 'bravo')), 'parked');
}

// Past the grace with no adoption while the battle entity still names it, the watchdog takes the hero back.
{
  const h = harness();
  await h.runtime.set('alpha');
  const hero = h.runtime.current;
  h.entities.set('alpha', {});
  assert.equal(h.runtime.lendToBattle('alpha'), true);
  h.setPlayer({ visual: hero });
  h.setPhase('battle');
  h.advance(90_000);
  h.setPhase('garage');
  h.tick();
  await flush();
  assert.equal(h.runtime.residencyOf(hero), 'lent', 'inside the grace the lend stands');
  h.advance(9_000);
  h.tick();
  await flush();
  assert.equal(h.runtime.current, hero, 'the reclaimed hero is the same cached visual, not a rebuild');
  assert.equal(h.runtime.residencyOf(hero), 'onStage');
  assert.equal(h.visuals.length, 1);
}

// Disposal retires: a retired visual never returns.
{
  const h = harness();
  await h.runtime.set('alpha');
  const alpha = h.runtime.current;
  alpha.dispose();
  assert.equal(h.runtime.residencyOf(alpha), 'retired');
  assert.equal(h.runtime.current, null);
}

console.log('garagePedestalResidency.selftest: declared hero residency, lend/adopt edges and the watchdog PASS');
