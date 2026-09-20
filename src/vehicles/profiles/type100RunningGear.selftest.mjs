import assert from 'node:assert/strict';
import * as T from 'three';
import { createTank } from '../tankFactory.ts';
import { auditTankWheelQuality } from '../wheelQuality.ts';
import { ensureInteriorFills } from '../interiorFills.ts';

// Actual native stock, not receipt-only placement. This fixture deliberately
// permits the newly authored end roles while protecting the six load stations.
const stations = [2.32, 1.40, .48, -.44, -1.36, -2.28];
const near = root => {
  const camera = new T.PerspectiveCamera(); camera.position.set(0, 3, -10); camera.updateMatrixWorld();
  root.updateMatrixWorld(true); root.traverse(o => { if (o.isLOD) o.update(camera); });
};
function meshes(root, name) { const out = []; root.traverseVisible(o => { if (o.isMesh && o.name === name) out.push(o); }); return out; }
function hits(objects, origin, direction, far) {
  const material = new T.MeshBasicMaterial({ side: T.DoubleSide });
  const originals = objects.map(o => o.material); objects.forEach(o => { o.material = material; });
  try { return new T.Raycaster(new T.Vector3(...origin), new T.Vector3(...direction), 0, far).intersectObjects(objects, false); }
  finally { objects.forEach((o, i) => { o.material = originals[i]; }); material.dispose(); }
}
function wheelSeats(root) {
  const tires = meshes(root, 'gearRoadWheelTires'); assert.equal(tires.length, 1); assert.equal(tires[0].count, 12);
  const matrix = new T.Matrix4(), position = new T.Vector3(); const observed = [];
  for (let i = 0; i < tires[0].count; i++) {
    tires[0].getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix); observed.push(position.toArray());
    assert.ok(Math.abs(Math.abs(position.x) - 1.4) < 1e-6 && Math.abs(position.y - .431) < 1e-6, 'shared ground/road-wheel seating law');
    const x = position.x + Math.sign(position.x) * .08, z = position.z;
    const wheel = hits(tires, [x, 0, z], [0, 1, 0], .45)[0];
    const band = hits(meshes(root, position.x < 0 ? 'gearTrackBandL' : 'gearTrackBandR'), [x, .3, z], [0, -1, 0], .3)[0];
    assert.ok(wheel && band && Math.abs(wheel.point.y - band.point.y) < .001, 'finite rubber sole seats on the actual band upper face');
  }
  for (const side of [-1, 1]) assert.deepEqual(observed.filter(p => Math.sign(p[0]) === side).map(p => +p[2].toFixed(2)), stations);
}
function pinCircles(root) {
  const shoe = root.getObjectByName('gearTrackPads'), geometry = shoe.geometry, p = geometry.attributes.position;
  const pin = geometry.userData.type100Pin; assert.equal(pin?.count, 2); assert.equal(pin.segments, 6);
  const outer = .58 * .48 * .99; let count = 0;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(Math.abs(p.getX(i)) - outer) > 1e-6) continue;
    const radial = Math.hypot(p.getY(i) - pin.centerY, Math.abs(p.getZ(i)) - pin.halfSpacingM);
    if (radial < 1e-6 || radial > .022) continue;
    assert.ok(Math.abs(radial - .016) < 1e-6, 'true circular YZ pin cross-section survives both detail levels'); count++;
  }
  assert.ok(count >= 24, 'all four actual outer pin faces contain a complete six-sector rim');
  geometry.computeBoundingBox(); assert.ok(Math.abs(geometry.boundingBox.max.y - .031) < 1e-6, 'unchanged outsole reach owns ground seating');
}
function guideChannel(root) {
  for (const name of ['gearRoadWheelTires', 'gearRoadWheelDiscs']) {
    const stock = root.getObjectByName(name), probe = new T.Mesh(stock.geometry, stock.material);
    probe.updateMatrixWorld(true);
    for (const side of [-1, 1]) {
      const face = hits([probe], [0, -.315, 0], [side, 0, 0], .2)[0];
      assert.ok(face && Math.abs(face.point.x) >= .0499 && Math.abs(face.point.x) <= .0501,
        'both actual wheel halves preserve finite air for the 81.18mm guide horn');
    }
  }
}
function courseEnvelope(root) {
  const shoe = root.getObjectByName('gearTrackPads'), pos = shoe.geometry.attributes.position, matrix = new T.Matrix4(), p = new T.Vector3();
  let top = -Infinity, half = 0, minX = Infinity;
  for (let i = 0; i < shoe.count; i++) { shoe.getMatrixAt(i, matrix);
    // Covered return links intentionally collapse; they are not contact stock.
    if (new T.Vector3().setFromMatrixScale(matrix).lengthSq() < 1e-10) continue;
    for (let j = 0; j < pos.count; j++) { p.fromBufferAttribute(pos, j).applyMatrix4(matrix); top = Math.max(top, p.y); half = Math.max(half, Math.abs(p.x)); minX = Math.min(minX, Math.abs(p.x)); }
  }
  assert.ok(top < 1.30, `all real shoe corners clear the new sponson underside: ${top}`);
  assert.ok(minX > 1.05 && half < 1.83, 'real shoe stock clears the retained tub and outer skirts');
  return { top, innerX: minX, outerX: half };
}
function endSeats(root) {
  const band = meshes(root, 'gearTrackBandR'), bodies = meshes(root, 'gearEndWheelBody');
  const rows = [];
  for (const [z, y, radius, signs] of [[3.02, .86, .34, [0, Math.PI / 2]], [-3.02, .70, .28, [0, -Math.PI / 2]]]) {
    for (const angle of signs) {
      const dy = Math.cos(angle), dz = Math.sin(angle), center = [1.48, y, z];
      const face = hits(band, center, [0, dy, dz], .5)[0];
      const rim = hits(bodies, [center[0], y + dy * .5, z + dz * .5], [0, -dy, -dz], .5)[0];
      assert.ok(face && rim, 'real end-wheel stock and surrounding course exist');
      const bandR = face.distance, rimR = .5 - rim.distance;
      assert.ok(bandR >= radius - .004 && bandR <= radius + .02, 'unchanged native wrap law follows its declared end radius');
      const carrierRadius = radius * (z > 0 ? .88 : .97);
      assert.ok(Math.abs(rimR - carrierRadius) < .008 && rimR <= bandR + .005,
        'finite recessed carrier matches its real stock radius without burying the course');
      rows.push({ z, angle, bandR, rimR });
    }
  }
  const hardware = meshes(root, 'gearEndWheelHardware');
  const crown = hits(hardware, [1.6871, 1.4, 3.02], [0, -1, 0], .4)[0];
  assert.ok(crown && crown.point.y > 1.20 && crown.point.y < 1.25,
    'front drive has an actual toothed crown at the belt edge, beyond its recessed carrier');
  return rows;
}
function countTriangles(root) {
  let all = 0, gear = 0;
  root.traverseVisible(o => { if (!o.isMesh || o.userData.shadowOnly || o.userData.authoredShadowProxy) return;
    const n = (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
    all += n; if (o.userData.runningGear || /^gear/.test(o.name)) gear += n;
  }); return { all, gear };
}
await ensureInteriorFills(['type100']);
const results = [];
for (const quality of ['high', 'low']) {
  const tank = createTank('type100', null, { quality, proceduralOnly: true, geometryReceipt: true, batchStatic: false });
  try {
    near(tank.root); const hull = tank.root.getObjectByName('rig_hull'), rec = hull.userData.runningGearReceipts.at(-1);
    assert.deepEqual(rec.sprocket, { z: 3.02, y: .86, r: .34 }); assert.deepEqual(rec.idler, { z: -3.02, y: .70, r: .28 });
    assert.equal(hull.userData.wheelPatternReceipts.at(-1).id, 'pressed-six');
    assert.deepEqual(auditTankWheelQuality(tank.root).issues, []);
    wheelSeats(tank.root); pinCircles(tank.root); guideChannel(tank.root);
    const envelope = courseEnvelope(tank.root), ends = endSeats(tank.root);
    const tires = tank.root.getObjectByName('gearRoadWheelTires'), savedY = tires.position.y;
    tires.position.y -= .015; tank.root.updateMatrixWorld(true);
    assert.throws(() => wheelSeats(tank.root), /finite rubber sole/, 'a lowered wheel must fail actual contact');
    tires.position.y = savedY; tank.root.updateMatrixWorld(true);
    const shoe = tank.root.getObjectByName('gearTrackPads'), original = shoe.geometry;
    shoe.geometry = original.clone().scale(1, .4, 1);
    assert.throws(() => pinCircles(tank.root), /circular|complete/, 'flattened mechanical pins cannot pass');
    shoe.geometry.dispose(); shoe.geometry = original;
    const band = tank.root.getObjectByName('gearTrackBandR'); band.visible = false;
    assert.throws(() => endSeats(tank.root), /course exist/, 'removed end support is rejected'); band.visible = true;
    const cost = countTriangles(tank.root); assert.ok(cost.all <= (quality === 'high' ? 80000 : 55000), 'complete selected-scene budget');
    const camera = new T.PerspectiveCamera(); camera.position.set(0, 3, -150); camera.updateMatrixWorld();
    tank.root.traverse(o => { if (o.isLOD) o.update(camera); });
    assert.ok(countTriangles(tank.root).gear < cost.gear, 'far LOD relinquishes actual near shoe work');
    assert.equal(meshes(tank.root, 'gearTrackPads').length, 0, 'no stale duplicate near shoe draw at distance');
    near(tank.root); assert.equal(meshes(tank.root, 'gearTrackPads').length, 1, 'near shoe detail returns');
    results.push({ quality, ...cost, envelope, ends });
  } finally { tank.dispose(); }
}
assert.ok(results[1].all <= results[0].all * .75, 'LOW removes meaningful actual scene work');
console.log(JSON.stringify(results));
console.log('type100RunningGear: HIGH/LOW complete-scene contact, front-drive wraps, circular pins, clear course, cost and broken-stock controls PASS');
