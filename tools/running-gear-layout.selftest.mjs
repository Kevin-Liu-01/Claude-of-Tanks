import assert from 'node:assert/strict';
import {
  createTank,
  FRONT_DRIVE_EXCEPTION_IDS,
  MODERN_TERMINAL_RISE_FLOOR_M,
  runningGearLayoutReceipt,
} from '../src/vehicles/tankFactory.js';
import { TANK_SPECS } from '../src/vehicles/specs.js';

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
assert.throws(
  () => runningGearLayoutReceipt('t90m', {
    sprocket: { z: -3.2, y: 0.72, r: 0.28 },
    idler: { z: 3.3, y: 0.54, r: 0.24 },
    wheelR: 0.40, wheelY: 0.51,
    wheelZs: [-2.4, -1.6, -0.8, 0, 0.8, 1.6, 2.4],
  }),
  /modern idler and final-drive centers must rise/,
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
  ['ariete', 'idler'],
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
  if (layouts[0].terminalRiseFloor != null) {
    assert.ok(layouts[0].idlerRise >= MODERN_TERMINAL_RISE_FLOOR_M, `${id} idler rises above road wheels`);
    assert.ok(layouts[0].sprocketRise >= MODERN_TERMINAL_RISE_FLOOR_M, `${id} final drive rises above road wheels`);
  }
  tank.dispose();
}

{
  const t90m = createTank('t90m', engineCtx, {
    geometryReceipt: true, proceduralOnly: true, quality: 'low', staticPreview: true,
  });
  const layouts = t90m.root.getObjectByName('rig_hull')?.userData?.nativeRunningGearLayouts;
  assert.equal(layouts?.length, 1, 'T-90M replacement hull publishes exactly one live native course');
  assert.ok(layouts[0].idlerRise >= MODERN_TERMINAL_RISE_FLOOR_M, 'T-90M has an elevated leading idler');
  t90m.dispose();
}

// Full modern roster regression: profile registration happens through the
// tankFactory import above, so Object.keys includes active playables and the
// two delisted procedural comparison variants audited by the geometry tools.
// Some decoration-only builders require a browser DOM; unrelated environment
// failures are left to the browser release gate, but no running-gear failure
// may be hidden behind that distinction.
let modernReceipts = 0;
for (const id of Object.keys(TANK_SPECS).filter((id) => TANK_SPECS[id]?.era === 'modern')) {
  let tank;
  try {
    tank = createTank(id, engineCtx, {
      geometryReceipt: true, proceduralOnly: true, quality: 'low', staticPreview: true,
    });
  } catch (err) {
    assert.doesNotMatch(String(err?.message || err), /running-gear|idler|final-drive|road-wheel/,
      `${id} must not hide a running-gear law failure behind a builder exception`);
    continue;
  }
  const layouts = tank.root.getObjectByName('rig_hull')?.userData?.nativeRunningGearLayouts || [];
  for (const layout of layouts) {
    if (layout.terminalRiseFloor == null) continue;
    assert.ok(layout.idlerRise >= layout.terminalRiseFloor, `${id} idler rises above road wheels`);
    assert.ok(layout.sprocketRise >= layout.terminalRiseFloor, `${id} final drive rises above road wheels`);
    modernReceipts++;
  }
  tank.dispose();
}
assert.ok(modernReceipts >= 70, `full modern roster publishes terminal-rise receipts (${modernReceipts})`);

console.log(`running-gear-layout: ${modernReceipts} modern receipts plus representative order/scale/terminal checks verified`);
