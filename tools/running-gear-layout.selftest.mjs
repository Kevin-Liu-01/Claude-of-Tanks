import assert from 'node:assert/strict';
import {
  createTank,
  FRONT_DRIVE_EXCEPTION_IDS,
  runningGearLayoutReceipt,
} from '../src/vehicles/tankFactory.js';

const rearDrive = {
  sprocket: { z: -3.2 },
  idler: { z: 3.3 },
  wheelZs: [-2.4, -1.6, -0.8, 0, 0.8, 1.6, 2.4],
  rollers: [{ z: -1 }, { z: 0 }, { z: 1 }],
};
const normal = runningGearLayoutReceipt('layout_fixture', rearDrive);
assert.equal(normal.frontEnd, 'idler');
assert.equal(normal.rearEnd, 'sprocket');
assert.equal(normal.roadWheelStations, 7);
assert.equal(normal.supportRollers, 3);
assert.equal(normal.frontDriveException, false);

const frontDrive = {
  sprocket: { z: 3.2 },
  idler: { z: -3.3 },
  wheelZs: [-2.4, -1.2, 0, 1.2, 2.4],
  rollers: [{ z: -1 }, { z: 1 }],
  frontDrive: true,
};
assert.equal(runningGearLayoutReceipt('front_drive_fixture', frontDrive).frontEnd, 'sprocket');
assert.throws(
  () => runningGearLayoutReceipt('unmarked_front_drive', { ...frontDrive, frontDrive: false }),
  /running-gear order violates front idler/,
);
assert.throws(
  () => runningGearLayoutReceipt('bmp2', rearDrive),
  /front sprocket \/ rear idler exception/,
);
assert.throws(
  () => runningGearLayoutReceipt('layout_fixture', {
    ...rearDrive,
    wheelZs: [-3.4, -1, 1, 2.4],
  }),
  /road-wheel centers must remain between/,
);
assert.throws(
  () => runningGearLayoutReceipt('tiny_idler_fixture', {
    sprocket: { z: -3.2, r: 0.28 }, idler: { z: 3.3, r: 0.09 },
    wheelR: 0.36, wheelZs: [-2.4, -1.6, -0.8, 0, 0.8, 1.6, 2.4],
  }),
  /visibly distinct terminal wheels/,
);
assert.throws(
  () => runningGearLayoutReceipt('road_wheel_ahead_fixture', {
    sprocket: { z: -3.2, r: 0.28 }, idler: { z: 2.65, r: 0.24 },
    wheelR: 0.50, wheelZs: [-2.4, -1.6, -0.8, 0, 0.8, 1.6, 2.4],
  }),
  /road-wheel silhouette must remain between/,
);

assert.equal(new Set(FRONT_DRIVE_EXCEPTION_IDS).size, FRONT_DRIVE_EXCEPTION_IDS.length,
  'front-drive exception registry must not contain duplicate ids');
for (const id of ['m4a3e8', 'bmp2', 'fv510', 'merkava1b', 'merkava4']) {
  assert.ok(FRONT_DRIVE_EXCEPTION_IDS.includes(id), `${id} stays an explicit front-drive exception`);
}

// Integrated representatives prove that live builders publish the receipt,
// that the default modern MBT law is front-idler/rear-drive, and that named
// IFV/Merkava exceptions are deliberate rather than swapped parameters.
const engineCtx = { setupShadowMaterial: (m) => m, anisotropy: 1, renderer: null };
for (const [id, frontEnd] of [
  ['leo2a5', 'idler'],
  ['leclerc', 'idler'],
  ['t90', 'idler'],
  ['type10', 'idler'],
  ['bmp2', 'sprocket'],
  ['fv510', 'sprocket'],
  ['merkava3d', 'sprocket'],
]) {
  const tank = createTank(id, engineCtx, {
    geometryReceipt: true,
    proceduralOnly: true,
    quality: 'low',
    staticPreview: true,
  });
  const layouts = tank.root.getObjectByName('rig_hull')?.userData?.nativeRunningGearLayouts;
  assert.ok(layouts?.length, `${id} publishes native running-gear layout metadata`);
  assert.equal(layouts[0].frontEnd, frontEnd, `${id} terminal order`);
  assert.ok(layouts[0].idlerToRoadRatio >= 0.45, `${id} has a visibly readable idler`);
  assert.ok(layouts[0].sprocketToRoadRatio >= 0.45, `${id} has a visibly readable final-drive sprocket`);
  assert.ok(layouts[0].frontTerminalMargin >= 0, `${id} has no road wheel ahead of its front terminal`);
  assert.ok(layouts[0].rearTerminalMargin >= 0, `${id} has no road wheel behind its rear terminal`);
  tank.dispose();
}

{
  const t90m = createTank('t90m', engineCtx, {
    geometryReceipt: true, proceduralOnly: true, quality: 'low', staticPreview: true,
  });
  const layouts = t90m.root.getObjectByName('rig_hull')?.userData?.nativeRunningGearLayouts;
  assert.equal(layouts?.length, 1, 'T-90M replacement hull publishes exactly one live native course');
  t90m.dispose();
}

console.log('running-gear-layout: visible front idler, road-wheel span, support rollers, rear drive and explicit front-drive exceptions verified');
