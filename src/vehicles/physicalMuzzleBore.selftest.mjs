import assert from 'node:assert/strict';
import * as THREE from 'three';
import { verifyPhysicalMuzzleBore } from './physicalMuzzleBore.ts';

const spec = { outerRadiusM: .08, innerRadiusM: .05, depthM: .2 };
const frame = new THREE.Group();
const material = new THREE.MeshBasicMaterial();
const rim = new THREE.Mesh(new THREE.RingGeometry(.05, .08, 24), material);
rim.position.z = 1;
const end = new THREE.Mesh(new THREE.CircleGeometry(.05, 24), material);
end.position.z = .8;
const wallGeometry = new THREE.CylinderGeometry(.05,.05,.2,24,1,true).rotateX(Math.PI/2);
const wallIndex = wallGeometry.index;
const reverse = () => { for(let i=0;i<wallIndex.count;i+=3){ const a=wallIndex.getX(i+1);wallIndex.setX(i+1,wallIndex.getX(i+2));wallIndex.setX(i+2,a); } };
reverse(); wallGeometry.computeVertexNormals();
const wall = new THREE.Mesh(wallGeometry,material); wall.position.z=.9;
frame.add(rim, end, wall);
try {
  for (const scale of [1, 1.1]) {
    frame.position.set(2, 3, -4); frame.rotation.set(.2, .7, -.1); frame.scale.setScalar(scale);
    const result = verifyPhysicalMuzzleBore(frame, 1, spec);
    assert.ok(Math.abs(result.minimumDepthM - .2) < 1e-8, 'measurements stay in the physical gun frame');
    assert.ok(result.maximumRimOffsetM < 1e-8);
  }
  assert.throws(() => verifyPhysicalMuzzleBore(frame, 1, { ...spec, outerRadiusM: .1 }), /outer stock/, 'a midpoint rim hit cannot justify an oversized lip');
  const lipGeometry = new THREE.BoxGeometry(.01,.01,.0371);
  const lip = new THREE.Mesh(lipGeometry,material);lip.position.set(.069,0,1+.0371/2);frame.add(lip);
  const withLip = {...spec,rimProjectionM:.0371};
  assert.ok(Math.abs(verifyPhysicalMuzzleBore(frame,1,withLip).measuredProjectionM-.0371)<1e-7);
  assert.throws(()=>verifyPhysicalMuzzleBore(frame,1,spec),/projecting stock/,'an undeclared long lip cannot silently alter the muzzle');
  lip.position.x=0;
  assert.throws(()=>verifyPhysicalMuzzleBore(frame,1,withLip),/projecting stock|capped/,'projecting metal cannot intrude into the aperture');
  frame.remove(lip);lipGeometry.dispose();
  const invisible = material.clone(); invisible.transparent = true; invisible.opacity = 0;
  end.material = invisible;
  assert.throws(() => verifyPhysicalMuzzleBore(frame, 1, spec), /backstop/,
    'zero-opacity stock must not certify an invisible backstop');
  end.material = material; rim.material = [material, invisible];
  assert.throws(() => verifyPhysicalMuzzleBore(frame, 1, spec), /outer stock|annular/,
    'mixed invisible groups must not certify rendered terminal stock');
  rim.material = material; invisible.dispose();
  end.position.z = 1;
  assert.throws(() => verifyPhysicalMuzzleBore(frame, 1, spec), /capped/, 'a flush disc is not a recess');
  end.position.z = .8; end.visible = false;
  assert.throws(() => verifyPhysicalMuzzleBore(frame, 1, spec), /backstop/, 'an unbounded empty ray is not a complete bore');
  end.visible = true; rim.visible = false;
  assert.throws(() => verifyPhysicalMuzzleBore(frame, 1, spec), /outer stock|annular/, 'the claimed mouth must have real rim stock');
  rim.visible = true;
  wall.visible=false;
  assert.throws(() => verifyPhysicalMuzzleBore(frame, 1, spec), /wall stock/, 'rim and backstop alone do not make a tube');
  wall.visible=true; reverse();
  assert.throws(() => verifyPhysicalMuzzleBore(frame, 1, spec), /wall stock/, 'the physical wall must face the bore interior');
  reverse();
  checkProjectedAnnulus();
  assert.throws(() => verifyPhysicalMuzzleBore(frame, 1, { ...spec, depthM: NaN }));
  assert.throws(() => verifyPhysicalMuzzleBore(frame, 1, { ...spec, innerRadiusM: .09 }));
} finally { rim.geometry.dispose(); end.geometry.dispose(); wallGeometry.dispose(); material.dispose(); }
console.log('physicalMuzzleBore: transformed open bore passes; capped, missing and malformed stock fails');

function checkProjectedAnnulus() {
  // Keep real terminal outer-wall vertices when removing the annulus, so
  // these negatives cannot pass merely by tripping the radius precondition.
  const outerGeometry = new THREE.CylinderGeometry(.08, .08, .2, 24, 1, true).rotateX(Math.PI / 2);
  const outerWall = new THREE.Mesh(outerGeometry, material); outerWall.position.z = .9;
  const lipGeometry = new THREE.BoxGeometry(.004, .004, .0371);
  const lip = new THREE.Mesh(lipGeometry, material);
  lip.position.set(Math.cos(.173) * .065, Math.sin(.173) * .065, 1 + .0371 / 2);
  const projected = { ...spec, rimProjectionM: .0371 };
  frame.add(outerWall, lip);
  const extraGeometries = [];
  const putRing = (inner, outer, z) => {
    const geometry = new THREE.RingGeometry(inner, outer, 24); extraGeometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.z = z; frame.add(mesh); return mesh;
  };
  try {
    const valid = verifyPhysicalMuzzleBore(frame, 1, projected);
    assert(valid.maximumRimOffsetM < 1e-7, 'projecting lip cannot replace the actual seated rim result');
    assert.throws(() => verifyPhysicalMuzzleBore(frame, 1, spec), /projecting stock/,
      'the alternate witness requires a measured declared projection');
    for (const offset of [-.006, .006]) {
      rim.position.z = 1 + offset;
      assert.throws(() => verifyPhysicalMuzzleBore(frame, 1, projected), /seated annular/,
        'a real projecting lip cannot excuse a rim displaced more than5mm');
    }
    rim.position.z = 1; rim.visible = false;
    assert.throws(() => verifyPhysicalMuzzleBore(frame, 1, projected), /seated annular/,
      'visible outer walls and lip cannot substitute for the missing face');
    const innerOnly = putRing(.05, .061, 1);
    assert.throws(() => verifyPhysicalMuzzleBore(frame, 1, projected), /seated annular/,
      'an exposed inner ring cannot excuse missing midpoint stock behind the lip');
    frame.remove(innerOnly);
    const middleOnly = putRing(.061, .08, 1);
    assert.throws(() => verifyPhysicalMuzzleBore(frame, 1, projected), /first-visible inner annulus/,
      'seated midpoint stock alone cannot excuse missing exposed inner stock');
    frame.remove(middleOnly); rim.visible = true;
    const hiddenMaterial = material.clone(); hiddenMaterial.transparent = true; hiddenMaterial.opacity = 0;
    rim.material = hiddenMaterial;
    assert.throws(() => verifyPhysicalMuzzleBore(frame, 1, projected), /seated annular/,
      'invisible annular stock remains ineligible behind a projection');
    rim.material = material; hiddenMaterial.dispose();
    const coveredInner = putRing(.05, .061, 1 + .0371);
    assert.throws(() => verifyPhysicalMuzzleBore(frame, 1, projected), /first-visible inner annulus/,
      'a brake covering the inner face fails even when a seated face exists behind it');
    frame.remove(coveredInner);
    // All bar vertices lie outside the radial metrology window, but its face
    // crosses the sampled ray. The ray-level bound must still reject it.
    const barGeometry = new THREE.BoxGeometry(.30, .004, .002); extraGeometries.push(barGeometry);
    const bar = new THREE.Mesh(barGeometry, material);
    bar.position.set(lip.position.x, lip.position.y, 1.06); bar.rotation.z = .173 + Math.PI / 2;
    frame.add(bar);
    assert.throws(() => verifyPhysicalMuzzleBore(frame, 1, projected), /occluder exceeds/,
      'front face beyond declared projection fails even without in-window metrology vertices');
    frame.remove(bar);
    assert(verifyPhysicalMuzzleBore(frame, 1, projected).maximumRimOffsetM < 1e-7,
      'restoring actual stock restores the original finite seat');
  } finally {
    frame.remove(outerWall, lip); outerGeometry.dispose(); lipGeometry.dispose();
    for (const geometry of extraGeometries) geometry.dispose();
    rim.visible = true; rim.position.z = 1; rim.material = material;
  }
}
