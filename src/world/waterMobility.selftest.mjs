import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createHeightField } from './terrain.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { createStructureSupportField } from '../sim/structureSupport.ts';
import { createLiveHeightFieldProxy } from './liveHeightFieldProxy.ts';

const groundAt = (field, x, z) => (field.getDriveGroundType ?? field.getGroundType)(x, z);
const saltwind = createHeightField(1337, getMapConfig('saltwind'));
const wet = [-440, 0], dry = [-316, -48];
assert.ok(saltwind.getWaterMaskAt(...wet) > .9, 'actual Saltwind bay is wet');
assert.equal(saltwind.getWaterMaskAt(...dry), 0, 'actual Saltwind strand is dry');
assert.equal(saltwind.getGroundType(...dry), 'soft', 'retain construction placement exclusions');
assert.equal(groundAt(saltwind, ...dry), 'medium', 'dry strand releases water mobility resistance');
assert.equal(groundAt(saltwind, ...wet), 'soft', 'bay still slows the tracks');

// The dry shoulder used to inherit its lake disc despite the rendered road
// cutting a dry ford through it. Ice and ordinary bogs retain their policy.
const config = {
  terrain: { lakes: [{ x: 128, z: -180, r: 60, level: -2.3 }],
    marshes: [{ x: 128, z: 168, r: 48, dip: .8 }], softLakes: true,
    roads: { paths: [[[-480, -180], [480, -180]]] } },
  splat: { seaLake: true, seaRamp: [.12, .48] },
};
const ford = createHeightField(1337, config);
for (const z of [-173, -169, -166]) {
  assert.equal(ford.getWaterMaskAt(128, z), 0);
  assert.equal(groundAt(ford, 128, z), 'medium', 'dry ford shoulder releases water drag');
}
assert.equal(groundAt(ford, 128, -180), 'hard', 'road centre stays hard');
const bog = createHeightField(1337, { ...config, splat: { seaLake: false } });
assert.equal(groundAt(bog, 128, 168), 'soft', 'non-liquid mud stays soft');
const ice = createHeightField(1337, { ...config, terrain: { ...config.terrain, frozenMarshes: true, softLakes: false } });
assert.equal(groundAt(ice, 128, 168), 'hard', 'frozen marsh stays hard');
assert.equal(groundAt(ice, 128, -140), 'hard', 'frozen lake stays hard');

let released = 0;
for (const id of MAP_IDS) {
  const cfg = getMapConfig(id), field = createHeightField(1337, cfg);
  for (let z = -480; z <= 480; z += 12) for (let x = -480; x <= 480; x += 12) {
    const original = field.getGroundType(x, z), drive = groundAt(field, x, z);
    if (cfg.splat?.seaLake && !cfg.terrain?.frozenMarshes && original === 'soft'
      && field.getWaterMaskAt(x, z) <= .02) {
      assert.equal(drive, 'medium', `${id} dry shore at ${x},${z}`);
      released++;
    } else assert.equal(drive, original, `${id} retains other ground behaviour`);
  }
}
assert.ok(released > 200, 'exercise dry banks and ford margins throughout the registry');

const spec = {
  enginePowerHp: 500, weightTons: 33, topSpeedKmh: 42, reverseSpeedKmh: 15,
  hullTraverseDegS: 36, turretTraverseDegS: 36, gunPitchDegS: 24,
  gunElevationDeg: 25, gunDepressionDeg: 10, pivotStyle: 'pivot',
  terrainResistance: { hard: 1, medium: 1.2, soft: 2.2 },
  dims: { hullLengthM: 6.27, overallLengthM: 7.52, widthM: 3, heightM: 2.97 },
  gun: { caliberMm: 76, baseAccuracy: .38, aimTimeS: 2.3,
    bloom: { move: .2, hullRot: .2, turret: .12, afterShot: 4 } },
};
function tank(speed = 0, combat = null) {
  const state = createTankState(spec, new Vector3(), 0);
  state._spool = 1;
  state.speed = speed;
  return { spec, state, combat, input: { throttle: 1, steer: 0, brake: false, aimPoint: null } };
}

// Flatten height only to isolate traction from the real coast's uphill grade.
// Keep the actual production ground/water classification and integration.
let position = dry;
const flat = {
  size: 1024, minY: 0, maxY: 0, getHeightAt: () => 0, getNormalAt: () => new Vector3(0, 1, 0),
  getGroundType: () => saltwind.getGroundType(...position),
  getDriveGroundType: () => groundAt(saltwind, ...position),
  getWaterMaskAt: () => saltwind.getWaterMaskAt(...position),
};
const support = createStructureSupportField(flat, {});
const live = createLiveHeightFieldProxy({ getWorld: () => ({ heightField: flat }), useExactHeight: () => false,
  upNormal: new Vector3(0, 1, 0) });
for (const [path, field] of [['direct', flat], ['solo/authority support', support], ['prediction proxy', live]]) {
  for (const combat of [null, { modules: { engine: { state: 'yellow' } }, crew: {} }]) {
    const entity = tank(1, combat);
    for (let lap = 0; lap < 3; lap++) {
      position = wet;
      const before = entity.state.speed;
      updateTank(entity, field, SIM_DT);
      const waterGain = entity.state.speed - before;
      assert.equal(entity.state._groundType, 'soft', `${path}: enter/re-enter water`);
      position = dry;
      const control = tank(entity.state.speed, combat);
      const medium = { getHeightAt: () => 0, getGroundType: () => 'medium' };
      updateTank(control, medium, SIM_DT);
      const exitSpeed = entity.state.speed;
      updateTank(entity, field, SIM_DT);
      assert.equal(entity.state._groundType, 'medium', `${path}: exit clears water on first grounded tick`);
      assert.ok(entity.state.speed - exitSpeed > waterGain * 1.7, `${path}: dry acceleration recovers`);
      assert.ok(Math.abs(entity.state.speed - control.state.speed) < 1e-10,
        `${path}: matches dry control, including existing engine damage`);
    }
  }
}
console.log(`waterMobility.selftest: ${MAP_IDS.length} maps, ${released} dry bank samples, repeated wet/dry transitions and damage pass`);
