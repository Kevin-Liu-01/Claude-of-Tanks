// runningGearGroundRun.selftest — the ground run as the gear draws it (2026-10-08, the contact-shadow lane; the owner:
// "fix the contact shadows for tracks on ground which are staticly on ground and look bad"). tankFactoryCore.ts publishes
// on the hull group, without allocating, each side's road wheels in z order as (z, travel) pairs: the travel the band's
// bottom run follows (deformBand reads voff). The aerial pass's ground occlusion (vehicleGroundOcclusion.ts) stands the
// track's contact on it each frame. Pinned: the pairs are the drawn wheels' own (at rest on flat ground; over a ditch,
// the travel each wheel rides at); a thrown track's side gives none; every unit on a hull joins in z order (two units a
// side on one hull group); the reader goes with a discarded gear (the T-90M's rebuilt course reads only its own wheels);
// and it writes no more pairs than it is given room for. The visual's own frame path drives it (setGroundSampler,
// syncFromState), as the battle does.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { KIT } from './tankFactoryCore.ts';
import { getSpec } from './specs.ts';
import { createTankState } from '../sim/movement.ts';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';

const restoreCanvas = installCanvasFixture();
const out = new Float32Array(64);
const pairsOf = (read, side) => {
  const n = read(side, out);
  return Array.from({ length: n }, (_, i) => [out[i * 2], out[i * 2 + 1]]);
};
const ascending = (pairs) => pairs.every((p, i) => i === 0 || pairs[i - 1][0] <= p[0]);

// ---- 1. real hulls on the battle's frame path: the pairs are the drawn wheels, read live
const rows = [];
for (const id of ['t90m', 'm1a2', 'bmp2']) {
  const spec = getSpec(id);
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242 });
  try {
    let read = null, wheels = null, owner = null;
    tank.root.traverse((object) => {
      if (!read && typeof object.userData?.runningGearGroundRun === 'function') {
        owner = object; read = object.userData.runningGearGroundRun; wheels = object.userData.runningGearRoadWheels;
      }
    });
    assert.ok(read && wheels, `${id}: the hull group publishes its ground run`);
    const drive = (sampler) => {
      const state = createTankState(spec, new THREE.Vector3(0, 0, 0), 0);
      tank.setGroundSampler(sampler);
      for (let frame = 0; frame < 120; frame++) tank.syncFromState(state, 1 / 60);
    };
    const same = (label) => {
      for (const side of [-1, 1]) {
        const pairs = pairsOf(read, side);
        const drawn = wheels(side).map((w) => [w.z, w.voff]).sort((a, b) => a[0] - b[0]);
        // the rebuilt T-90M course (discardRunningGear, then a new unit): only the drawn unit's wheels, never the
        // discarded one's as well
        assert.equal(pairs.length, drawn.length, `${id} side ${side} (${label}): one pair per drawn road wheel`);
        assert.ok(ascending(pairs), `${id} side ${side} (${label}): in z order`);
        for (let i = 0; i < pairs.length; i++) {
          assert.ok(Math.abs(pairs[i][0] - drawn[i][0]) < 1e-6 && Math.abs(pairs[i][1] - drawn[i][1]) < 1e-6,
            `${id} side ${side} (${label}): pair ${i} (${pairs[i].map((v) => v.toFixed(4))}) is the drawn wheel's (${drawn[i].map((v) => v.toFixed(4))})`);
        }
      }
    };
    drive(() => 0);
    same('flat ground');
    for (const side of [-1, 1]) {
      for (const [, travel] of pairsOf(read, side)) assert.ok(Math.abs(travel) < 0.01, `${id}: at rest on flat ground (${travel.toFixed(4)})`);
    }
    // a 1.2 m ditch, 3 m deep, under the middle wheels of both sides: the travel the band rides at, read the same frame
    const stations = pairsOf(read, 1).map((p) => p[0]);
    const middle = stations[Math.floor(stations.length / 2)];
    drive((_x, z) => (Math.abs(z - middle) < 0.6 ? -3 : 0));
    same('over a ditch');
    // a step up under the front half: the front wheels ride up, the pairs follow
    drive((_x, z) => (z > 0.5 ? 0.08 : 0));
    same('over a step');
    const front = pairsOf(read, 1).filter((p) => p[0] > 1.2);
    assert.ok(front.length && front.every((p) => p[1] > 0.04), `${id}: the wheels on the step ride up (${front.map((p) => p[1].toFixed(3))})`);
    // a thrown track: its side gives no pairs (the band is hidden: no run meets the ground there); repaired, it does again
    const n = pairsOf(read, -1).length;
    tank.setTrackState('trackL', true);
    assert.equal(read(-1, out), 0, `${id}: a thrown left track gives no pairs`);
    assert.equal(read(1, out), pairsOf(read, 1).length, `${id}: the right still does`);
    assert.ok(read(1, out) > 0, `${id}: the right run`);
    tank.setTrackState('trackL', false);
    assert.equal(read(-1, out), n, `${id}: repaired, the left again`);
    // no more pairs than there is room for
    assert.equal(read(1, new Float32Array(4)), 2, `${id}: room for two pairs, two written`);
    rows.push(`${id} ${n}+${pairsOf(read, 1).length} wheels, owner ${owner.name || owner.type}`);
  } finally {
    tank.dispose?.();
  }
}

// ---- 2. two units a side on one hull group (a four-track rig): the second unit joins the first in z order; a thrown
// side gives neither unit's; a discarded gear takes its reader with it
{
  const material = new THREE.MeshStandardMaterial();
  const mats = Object.fromEntries(['hull', 'wheels', 'wheelsRecessed', 'rubber', 'detail', 'dark', 'shadow', 'trackLink',
    'spareTrack', 'burnt', 'trackL', 'trackR'].map((key) => [key, material]));
  mats.trackTexL = new THREE.Texture(); mats.trackTexR = new THREE.Texture();
  const port = { spec: { id: 't90sm' }, disposables: [], mats, hullG: new THREE.Group(), geometryReceipt: true, q: true, batchStatic: false, add() {} };
  const BASE = { wheelR: 0.4, wheelW: 0.3, wheelY: 0.5, sprocket: { z: -2, y: 0.7, r: 0.3 }, idler: { z: 2, y: 0.7, r: 0.3 }, trackW: 0.5, topY: 1 };
  KIT.buildRunningGear(port, { ...BASE, xc: 1.0, wheelZs: [-1, 0.2, 1.4] });
  KIT.buildRunningGear(port, { ...BASE, xc: 1.6, wheelZs: [-1.4, -0.2, 1.0] });
  const read = port.hullG.userData.runningGearGroundRun;
  assert.equal(typeof read, 'function', 'the hull group publishes the run');
  for (const side of [-1, 1]) {
    const zs = pairsOf(read, side).map((p) => +p[0].toFixed(4));
    assert.deepEqual(zs, [-1.4, -1, -0.2, 0.2, 1, 1.4], `side ${side}: both units' wheels, in z order`);
  }
  port.gear.setBroken('trackR', true);
  assert.equal(read(1, out), 0, 'a thrown right track: neither unit\'s right wheels');
  assert.equal(read(-1, out), 6, 'the left: both units\'');
  port.gear.setBroken('trackR', false);
  assert.equal(read(1, out), 6, 'repaired');
  KIT.discardRunningGear(port);
  assert.equal(port.hullG.userData.runningGearGroundRun, undefined, 'a discarded gear takes its reader with it');
  KIT.buildRunningGear(port, { ...BASE, xc: 1.3, wheelZs: [-1, 0, 1] });
  assert.deepEqual(pairsOf(port.hullG.userData.runningGearGroundRun, 1).map((p) => +p[0].toFixed(4)), [-1, 0, 1],
    'a rebuilt gear reads only its own wheels');
  const resources = new Set(port.disposables);
  port.hullG.traverse((object) => {
    if (object.geometry) resources.add(object.geometry);
    for (const mat of [].concat(object.material || [])) resources.add(mat);
  });
  for (const resource of resources) resource.dispose?.();
  material.dispose(); mats.trackTexL.dispose(); mats.trackTexR.dispose();
}
restoreCanvas();
console.log(`runningGearGroundRun.selftest: the drawn ground run (${rows.join('; ')}), thrown and repaired sides, two units a side in z order, the discarded gear's reader gone PASS`);
