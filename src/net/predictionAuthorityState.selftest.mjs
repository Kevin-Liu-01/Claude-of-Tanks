import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { getSpec } from '../vehicles/specs.ts';
import { createTank, ensureTankBuilder } from '../vehicles/fleetFactory.ts';
import { createCombatState } from '../sim/damage.ts';
import { createTankState, SIM_DT, updateTank } from '../sim/movement.ts';
import {
  applyPredictionAuthorityState,
  capturePredictionAuthorityState,
} from './predictionAuthorityState.ts';
import { createBrowserBattleBridge } from './browserBattleBridge.ts';
import { SnapshotBuffer, captureWorldSnapshot } from './snapshot.ts';

await ensureTankBuilder('m1a2');
await ensureTankBuilder('udes03');

const normal = new Vector3(0, 1, 0);
const terrain = {
  getHeightAt: () => 0,
  getHeightAtFast: () => 0,
  getNormalAt: () => normal,
  getGroundType: () => 'hard',
};

function tank(specId = 'm1a2') {
  const spec = getSpec(specId);
  const combat = createCombatState(spec);
  combat.equipMults = { traverse: 1, turret: 1, aimTime: 1, bloom: 1 };
  return {
    id: 'viewer', spec, state: createTankState(spec, new Vector3(), 0),
    combat, modeSpeedMultiplier: 1,
    input: { throttle: 1, steer: 0.4, brake: false, fire: false,
      shellSlot: 0, aimLocked: false, aimPoint: new Vector3(100, 20, 300) },
  };
}

test('malformed and mismatched mobility records cannot mutate a tank', () => {
  const entity = tank();
  const before = structuredClone(entity.combat);
  const good = capturePredictionAuthorityState(entity);
  for (const value of [
    null, [], 1, 'viewer', {}, { ...good, id: 'enemy' },
    { ...good, modules: null }, { ...good, crew: [] }, { ...good, equipment: 1 },
  ]) {
    assert.equal(applyPredictionAuthorityState(entity, value), false);
    assert.deepEqual(entity.combat, before);
    assert.equal(entity.modeSpeedMultiplier, 1);
  }
});

test('mobility capture is a detached, minimal viewer-only primitive record', () => {
  const entity = tank();
  entity.combat.modules.engine.state = 'yellow';
  entity.combat.crew.driver = false;
  entity.combat.equipMults.turret = 1.15;
  entity.modeSpeedMultiplier = 1.85;
  entity.hiddenEnemy = { id: 'classified-enemy', pos: { x: 421, z: 312 } };
  const captured = capturePredictionAuthorityState(entity);
  assert.deepEqual(Object.keys(captured).sort(),
    ['crew', 'equipment', 'id', 'modeSpeedMultiplier', 'modules']);
  assert.equal(captured.id, 'viewer');
  assert.equal(JSON.stringify(captured).includes('classified-enemy'), false);
  assert.equal(JSON.stringify(captured).includes('maxHp'), false);
  entity.combat.modules.engine.state = 'ok';
  entity.combat.crew.driver = true;
  entity.combat.equipMults.turret = 1;
  entity.modeSpeedMultiplier = 1;
  assert.equal(captured.modules.engine, 'yellow');
  assert.equal(captured.crew.driver, false);
  assert.equal(captured.equipment.turret, 1.15);
  assert.equal(captured.modeSpeedMultiplier, 1.85);
});

test('mobility damage, repair and respawn reset restore existing combat owners in place', () => {
  const server = tank();
  const client = tank();
  const combat = client.combat;
  const modules = combat.modules;
  const track = modules.trackL;
  const crew = combat.crew;
  const equipment = combat.equipMults;
  server.combat.modules.trackL.state = 'red';
  server.combat.modules.engine.state = 'yellow';
  server.combat.crew.driver = false;
  server.combat.equipMults.traverse = 1.1;
  server.modeSpeedMultiplier = 1.85;
  assert.equal(applyPredictionAuthorityState(client, capturePredictionAuthorityState(server)), true);
  assert.equal(track.state, 'red');
  assert.equal(crew.driver, false);
  assert.equal(equipment.traverse, 1.1);
  assert.equal(client.modeSpeedMultiplier, 1.85);
  assert.equal(applyPredictionAuthorityState(client, capturePredictionAuthorityState(tank())), true);
  assert.equal(client.combat, combat);
  assert.equal(client.combat.modules, modules);
  assert.equal(client.combat.modules.trackL, track);
  assert.equal(client.combat.crew, crew);
  assert.equal(client.combat.equipMults, equipment);
  assert.equal(track.state, 'ok');
  assert.equal(crew.driver, true);
  assert.equal(equipment.traverse, 1);
  assert.equal(client.modeSpeedMultiplier, 1);
});

test('casemate gunMount fallback survives mobility application without an invented turretRing', () => {
  const server = tank('udes03');
  const client = tank('udes03');
  assert.equal(client.combat.modules.turretRing, undefined);
  assert.ok(client.combat.modules.gunMount);
  server.combat.modules.gunMount.state = 'red';
  assert.equal(applyPredictionAuthorityState(client, capturePredictionAuthorityState(server)), true);
  assert.equal(client.combat.modules.turretRing, undefined);
  assert.equal(client.combat.modules.gunMount.state, 'red');
});

test('invalid field values remain bounded without creating unauthored modules', () => {
  const client = tank();
  client.combat.modules.engine.state = 'red';
  client.combat.crew.driver = false;
  const state = capturePredictionAuthorityState(client);
  state.modules.engine = 'invincible';
  state.modules.arbitrary = 'red';
  state.crew.driver = 'yes';
  state.equipment = { traverse: Infinity, turret: -2, aimTime: NaN, bloom: 999 };
  state.modeSpeedMultiplier = -1;
  assert.equal(applyPredictionAuthorityState(client, state), true);
  assert.equal(client.combat.modules.engine.state, 'red');
  assert.equal(client.combat.modules.arbitrary, undefined);
  assert.equal(client.combat.crew.driver, false);
  assert.deepEqual(client.combat.equipMults, {
    ...client.combat.equipMults, traverse: 1, turret: 1, aimTime: 1, bloom: 10,
  });
  assert.equal(client.modeSpeedMultiplier, 1);
});

test('all replicated damage, crew, equipment and mode fields preserve shared movement parity', () => {
  for (const specId of ['m1a2', 'udes03']) {
    for (const phase of ['damaged', 'immobilized', 'healthy']) {
      const authority = tank(specId);
      const predicted = tank(specId);
      if (phase !== 'healthy') {
        const modules = authority.combat.modules;
        modules.engine.state = 'yellow';
        modules.transmission.state = 'yellow';
        modules.trackL.state = phase === 'immobilized' ? 'red' : 'yellow';
        (modules.turretRing || modules.gunMount).state = 'red';
        modules.gun.state = 'yellow';
        authority.combat.crew.driver = false;
        authority.combat.crew.gunner = false;
        Object.assign(authority.combat.equipMults,
          { traverse: 1.1, turret: 1.15, aimTime: 0.85, bloom: 0.9 });
        authority.modeSpeedMultiplier = 1.85;
      }
      applyPredictionAuthorityState(predicted, capturePredictionAuthorityState(authority));
      for (let step = 0; step < 120; step++) {
        updateTank(authority, terrain, SIM_DT);
        updateTank(predicted, terrain, SIM_DT);
      }
      assert.ok(predicted.state.pos.distanceTo(authority.state.pos) < 1e-12,
        `${specId}/${phase} position parity`);
      for (const key of ['yaw', 'speed', 'turretYaw', 'gunPitch', 'bloomF', 'yawRate']) {
        assert.ok(Math.abs(predicted.state[key] - authority.state[key]) < 1e-12,
          `${specId}/${phase} ${key} parity`);
      }
      if (phase === 'immobilized') assert.equal(predicted.state.speed, 0);
      else assert.ok(predicted.state.pos.length() > 0.01,
        `${specId}/${phase} exercises moving dynamics`);
    }
  }
});

test('authored visual contact geometry cannot change network prediction terrain/grip physics', async () => {
  for (const specId of ['m1a2', 't90m', 'udes03']) {
    await ensureTankBuilder(specId);
    const visual = createTank(specId, null, { materialMode: 'geometry-only',
      quality: 'high', geometryQuality: 'high', proceduralOnly: true });
    const visualContact = visual.prepareForSimulation();
    assert.ok(visualContact && visualContact.bottomYM < -0.01,
      `${specId} uses the actual authored running-gear receipt`);
    const height = (x, z) => 0.25 * Math.sin(z / 2) + 0.15 * Math.sin(x / 2);
    const field = { ...terrain, getHeightAt: height, getHeightAtFast: height };
    const game = { tanks: [], tankById: new Map(), player: null, shells: [],
      spotting: null, allTanks: [], timeS: 0, preBattleS: 0, result: null, resultReason: null };
    const bridge = createBrowserBattleBridge({
      engineCtx: { scene: { add() {} } }, game, viewerId: 'viewer',
      worldCollision: { heightField: field },
      createTankVisual: () => ({ root: { position: new Vector3() },
        contactGeom: visualContact, setVisible() {}, syncFromState() {}, dispose() {} }),
      prepareVisualTextures: async () => {},
    });
    await bridge.prepareRoster([{ id: 'viewer', specId, team: 'alpha' }]);
    const authority = tank(specId);
    authority.input.steer = 0.2;
    authority.input.aimLocked = true;
    const initial = captureWorldSnapshot({ tick: 0, serverTimeMs: 0,
      entities: [authority], viewerId: 'viewer', ackInputSeq: null,
      meta: { phase: 'playing', localPrediction: capturePredictionAuthorityState(authority) } });
    const buffer = new SnapshotBuffer({ interpolationDelayMs: 0, immediateEntityId: 'viewer' });
    buffer.push(initial);
    bridge.apply(buffer.sample(0));
    assert.equal(game.player.predictor.simEntity.contactGeom, null,
      `${specId} cannot import a renderer-only support policy into prediction`);
    assert.equal(game.player.visual.contactGeom, visualContact,
      `${specId} render geometry metadata is preserved`);
    let maxPositionErrorM = 0;
    for (let step = 0; step < 600; step++) {
      updateTank(authority, field, SIM_DT);
      assert.equal(bridge.advancePrediction({ throttle: 1, steer: 0.2, brake: false,
        fire: false, aimLocked: true, aimYaw: 0, aimPitch: 0, shellSlot: 0 }, SIM_DT), true);
      const predicted = game.player.predictor.simEntity.state;
      maxPositionErrorM = Math.max(maxPositionErrorM, predicted.pos.distanceTo(authority.state.pos));
    }
    assert.ok(maxPositionErrorM < 1e-9,
      `${specId} 10-second wavy-ground authority/prediction parity: ${maxPositionErrorM} m`);
    bridge.dispose();
    visual.dispose();
  }
});
