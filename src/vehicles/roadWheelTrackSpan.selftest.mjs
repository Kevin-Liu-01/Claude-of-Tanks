// A road wheel over unsupported ground rides the track between its supported neighbours (physics lane round 8, ruling 2
// of 2026-10-04): the band runs taut between the wheels on either side that reach their ground, and the wheel over a
// trench or a ditch rides on it. It used to drop to its full droop, 0.22 m under the hull, with daylight under the
// band's line from the wheels beside it. The visual's own frame path drives it here (setGroundSampler, syncFromState),
// as the battle does; flat ground, where every wheel is supported, is the control.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { createTankState } from '../sim/movement.ts';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';

const restoreCanvas = installCanvasFixture();

const results = [];
for (const id of ['t90m', 'm1a2', 'bmp2']) {
  const spec = getSpec(id);
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242 });
  try {
    let roadWheels = null;
    tank.root.traverse((object) => {
      if (!roadWheels && typeof object.userData?.runningGearRoadWheels === 'function') {
        roadWheels = object.userData.runningGearRoadWheels;
      }
    });
    assert.ok(roadWheels, `${id}: the running gear publishes its road wheels`);
    const stations = roadWheels(1).filter((wheel) => !wheel.source && !wheel.rec).map((wheel) => wheel.z).sort((a, b) => a - b);
    assert.ok(stations.length >= 5, `${id}: ${stations.length} road wheels a side`);
    // a 1.2 m ditch, 3 m deep, under one middle wheel: its neighbours fore and aft stand on the ground either side
    const middle = stations[Math.floor(stations.length / 2)];
    const run = (sampler) => {
      const state = createTankState(spec, new THREE.Vector3(0, 0, 0), 0);
      tank.setGroundSampler(sampler);
      for (let frame = 0; frame < 120; frame++) tank.syncFromState(state, 1 / 60);
      return roadWheels(1).concat(roadWheels(-1)).filter((wheel) => !wheel.source && !wheel.rec);
    };
    const flat = run(() => 0);
    for (const wheel of flat) assert.ok(Math.abs(wheel.off) < 0.01, `${id}: on flat ground the wheel at ${wheel.z.toFixed(2)} rests at its seat (${wheel.off.toFixed(3)})`);
    const ditch = run((_x, z) => (Math.abs(z - middle) < 0.6 ? -3 : 0));
    const over = ditch.filter((wheel) => Math.abs(wheel.z - middle) < 0.3);
    assert.ok(over.length >= 2, `${id}: a wheel on each side over the ditch`);
    for (const wheel of over) {
      assert.ok(wheel.off > -0.05, `${id}: the wheel over the ditch at ${wheel.z.toFixed(2)} rides the track between its neighbours `
        + `(travel ${wheel.off.toFixed(3)} m; full droop is -0.22)`);
    }
    for (const wheel of ditch) {
      if (Math.abs(wheel.z - middle) < 0.3) continue;
      assert.ok(Math.abs(wheel.off) < 0.02, `${id}: the supported wheel at ${wheel.z.toFixed(2)} keeps its seat (${wheel.off.toFixed(3)})`);
    }
    results.push(`${id} ${over.map((wheel) => wheel.off.toFixed(3)).join('/')}`);
  } finally {
    tank.dispose?.();
  }
}
restoreCanvas();
console.log(`roadWheelTrackSpan.selftest: a wheel over a ditch rides the track between its neighbours (${results.join(', ')})`);
