import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const ids = ['leo2a4', 'leo2a4_otco'];
const EPS = 1e-9;

for (const id of ids) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  try {
    tank.root.updateMatrixWorld(true);
    const hullRig = tank.root.getObjectByName('rig_hull');
    const receipt = hullRig?.userData.leopard2A4SideSkirtReceipt;
    assert.ok(hullRig && receipt, `${id}: A4 side-skirt receipt exists`);
    assert.equal(receipt.architecture, 'raised-two-band-curtain-with-face-mounted-rails',
      `${id}: uses the raised A4 two-band skirt assembly`);
    assert.equal(receipt.liftY, 0.10, `${id}: complete skirt course is lifted 100 mm`);
    assert.equal(receipt.topY, 1.36, `${id}: skirt reaches the Leopard prototype mounting datum`);
    assert.equal(receipt.foreBottomY, 0.62, `${id}: front armor course moves with the top edge`);
    assert.equal(receipt.aftBottomY, 0.64, `${id}: rear two-band course moves with the top edge`);
    assert.equal(receipt.mirrored, true, `${id}: skirt and rail correction is mirrored`);
    assert.ok(Math.abs(receipt.outerRailInnerHalfWidth - receipt.panelOuterHalfWidth) <= EPS,
      `${id}: longitudinal rail seats directly on the skirt face`);
    assert.ok(Math.abs(receipt.outerRailTopY - receipt.topY) <= EPS,
      `${id}: longitudinal rail terminates at the raised skirt top`);
    assert.ok(receipt.hangerBottomY < receipt.topY && receipt.hangerTopY > receipt.topY,
      `${id}: hangers overlap the skirt and bridge upward into the fender`);
    assert.ok(receipt.frontMudguardCapInnerHalfWidth < 1.64
      && receipt.frontMudguardCapOuterHalfWidth > 1.64,
      `${id}: supported mudguard cap closes the former x=1.64 bow pocket`);
    assert.ok(receipt.frontMudguardCapZMin < 3.93 && receipt.frontMudguardCapZMax > 3.93,
      `${id}: supported mudguard cap closes the former z=3.93 bow pocket`);
    assert.equal(receipt.ghillieHemBaseY, 0.725,
      `${id}: tailored side camouflage follows the raised skirt hem`);
    assert.equal(receipt.ghillieBowShoulderHalfWidth, 0.84,
      `${id}: tailored bow blanket clears the animated idler shoes`);

    for (const side of [-1, 1]) {
      const direction = new THREE.Vector3(-side, 0, 0).transformDirection(hullRig.matrixWorld);
      const hitAt = (localY) => {
        const origin = hullRig.localToWorld(new THREE.Vector3(side * 2.05, localY, 0.40));
        return new THREE.Raycaster(origin, direction, 0, 0.50)
          .intersectObjects(hullRig.children.filter((child) => !child.name.includes('ghillie')), true)[0];
      };
      const railHit = hitAt(receipt.outerRailY);
      assert.ok(railHit, `${id}: ${side < 0 ? 'left' : 'right'} raised rail is present`);
      const railX = Math.abs(hullRig.worldToLocal(railHit.point.clone()).x);
      assert.ok(railX >= 1.81 && railX <= 1.82,
        `${id}: ${side < 0 ? 'left' : 'right'} rail is layered over the outer skirt face`);

      const skirtHit = hitAt(1.20);
      assert.ok(skirtHit, `${id}: ${side < 0 ? 'left' : 'right'} raised skirt is present below the rail`);
      const skirtX = Math.abs(hullRig.worldToLocal(skirtHit.point.clone()).x);
      assert.ok(skirtX >= 1.77 && skirtX <= 1.79,
        `${id}: ${side < 0 ? 'left' : 'right'} skirt retains its certified track-safe width`);
    }
  } finally {
    tank.dispose();
  }
}

console.log('leopard2A4SideSkirt.selftest: A4 and OTCO skirts are raised with face-mounted rails on both sides');
