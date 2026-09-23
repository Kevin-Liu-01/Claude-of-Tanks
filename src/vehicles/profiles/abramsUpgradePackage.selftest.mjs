import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';

// Probe rendered triangles in the owning rig's local frame, including
// equipment independently of the structural surface that must support it.
function verticalHit(tank, names, x, y, z, direction) {
  const material = new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const meshes = names.map(name => tank.root.getObjectByName(name)).filter(Boolean)
    .map(mesh => new THREE.Mesh(mesh.geometry, material));
  const ray = new THREE.Raycaster(new THREE.Vector3(x,y,z), new THREE.Vector3(0,direction,0));
  const hit = ray.intersectObjects(meshes)[0];
  material.dispose();
  assert.ok(hit, `missing receiving stock at ${x},${y},${z}`);
  return hit.point.y;
}

for (const quality of ['high', 'low']) {
  const ax = createTank('abramsx', null, {proceduralOnly:true, quality, geometryReceipt:true});
  const shell = ax.root.getObjectByName('turret');
  assert.ok(shell?.isMesh);
  assert.equal(ax.root.getObjectByName('hullRunningGearTrack'), undefined,
    `${quality}: no static underside strips duplicate the animated track`);
  // Probe the actual carrier below the shell from every azimuth. A broad
  // front frustum can pass an AABB check, but cannot pass these radial rays.
  const probe = new THREE.Mesh(shell.geometry, new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  const ray = new THREE.Raycaster();
  const radii = [];
  for (let k = 0; k < 48; k++) {
    const a = (k + .5) / 48 * Math.PI * 2;
    ray.set(new THREE.Vector3(Math.sin(a)*3,-.47,Math.cos(a)*3),new THREE.Vector3(-Math.sin(a),0,-Math.cos(a)));
    const hit = ray.intersectObject(probe)[0];
    assert.ok(hit, `${quality}: ring is continuous at azimuth ${k}`);
    radii.push(3-hit.distance);
  }
  assert.ok(Math.max(...radii)-Math.min(...radii)<.004,
    `${quality}: bearing has circular rather than rectangular cross-sections`);
  assert.ok(Math.min(...radii)>1.24 && Math.max(...radii)<1.26);
  probe.material.dispose();
  for (const side of [-1, 1]) {
    const caseBottom = verticalHit(ax, ['turretEquipment'], side*1.57, .29, -.93, 1);
    const roof = verticalHit(ax, ['turret'], side*1.57, .33, -.93, -1);
    assert.ok(caseBottom<=roof && roof-caseBottom<.015, 'AbramsX service case has finite roof contact');
  }
  ax.dispose();

  const m1 = createTank('m1a3', null, {proceduralOnly:true, quality, geometryReceipt:true});
  const turret = m1.root.getObjectByName('rig_turret');
  assert.ok(Math.abs(turret.position.y-(1.67 + .128 + .012))<1e-8, 'complete M1A3 turret reseated to leave a 50 mm ring seam');
  assert.equal(turret.position.z,.15, 'earlier forward seat preserved');
  assert.equal(m1.root.getObjectByName('rig_gun').parent,turret);
  assert.ok(m1.root.getObjectByName('turretExternalArmor').geometry.attributes.position.count>0);
  const bearing = m1.root.getObjectByName('turret').geometry.attributes.position;
  let bearingBottom=Infinity, bearingTop=-Infinity;
  for(let i=0;i<bearing.count;i++) {
    if(Math.abs(bearing.getY(i)+.153)<1e-5) bearingBottom=Math.min(bearingBottom,bearing.getY(i)+turret.position.y);
    if(Math.abs(bearing.getY(i)+.097)<1e-5) bearingTop=Math.max(bearingTop,bearing.getY(i)+turret.position.y);
  }
  assert.ok(Math.abs(bearingTop-bearingBottom-.056)<1e-6, 'bearing spans the 50 mm seam with 3 mm overlap at each end');
  assert.ok(bearingBottom<1.66 && bearingBottom>1.65, 'thin bearing still overlaps the hull deck');
  const visibleSeam=turret.position.y-.10-1.66;
  assert.ok(visibleSeam>.049 && visibleSeam<.051, 'roughly 50 mm of exposed ring remains');
  assert.ok(bearingTop>turret.position.y-.10, 'bearing remains connected to the turret base');
  // The thin circular seam must still be visible from both sides. Front
  // hatches can naturally hide a seam this low from a level front camera.
  m1.root.updateMatrixWorld(true);
  const frontRay = new THREE.Raycaster();
  const visibleMeshes=[];
  m1.root.traverse(object => {
    if (!object.isMesh) return;
    for (let parent=object; parent; parent=parent.parent) if (!parent.visible) return;
    visibleMeshes.push(object);
  });
  for (const side of [-1,1]) for (const y of [-.145,-.125,-.105]) {
    const origin=turret.localToWorld(new THREE.Vector3(side*8,y,0));
    frontRay.set(origin,new THREE.Vector3(-side,0,0));
    const hit=frontRay.intersectObjects(visibleMeshes,false)[0];
    assert.equal(hit?.object.name,'turret','side sightline exposes the thin circular bearing');
    assert.ok(Math.abs(turret.worldToLocal(hit.point.clone()).x)<1.3,'visible stock is the bearing, not a turret side panel');
  }
  for (const side of [-1, 1]) {
    for (const x of [1.36,1.68]) {
      const trayBottom = verticalHit(m1, ['turretEquipment'], side*x, .65, -1.52, -1);
      const stock = verticalHit(m1, ['turret','turretExternalArmor'], side*x, 1, -1.52, -1);
      assert.ok(trayBottom<.60 && trayBottom<=stock, 'service tray bridges real stock at both ends');
    }
    for (const z of [1.05,.65]) {
      const plateTop = verticalHit(m1, ['turretEquipment'], side*1.22, .75, z, -1);
      const stock = verticalHit(m1, ['turret','turretExternalArmor'], side*1.22, .75, z, -1);
      assert.ok(plateTop>stock && plateTop-stock<.026, 'lifting-eye base is seated on the sloped cheek');
    }
  }
  m1.dispose();

  const sep = createTank('m1a2_sepv3_x',null,{proceduralOnly:true,quality,geometryReceipt:true});
  const armor=sep.root.getObjectByName('hullExternalArmor');
  armor.geometry.computeBoundingBox();
  assert.ok(armor.geometry.boundingBox.max.x>2.21, 'SEPv3 has the enlarged side package');
  assert.ok(armor.geometry.boundingBox.min.x< -2.21, 'both flanks are enlarged');
  assert.ok(getSpec('m1a2_sepv3_x').dims.widthM>=4.47, 'spec includes the heavy kit, preventing unwanted downscaling');
  const pos=armor.geometry.attributes.position;
  const atRadius=r=>{let n=0;for(let i=0;i<pos.count;i++)if(Math.abs(Math.abs(pos.getX(i))-r)<.004)n++;return n;};
  const liveFaceCount=atRadius(2.215),backingCount=atRadius(1.915);
  assert.ok(liveFaceCount>0 && backingCount>0, 'separate reactive faces and permanent carriers exist');
  for(const side of ['L','R'])sep.stripEra(`m1a2_sepv3_skirt_era_${side}`);
  assert.equal(atRadius(2.215),0,'spent banks remove both outer cassette courses');
  assert.equal(atRadius(1.915),backingCount,'spent ERA retains permanent skirt carriers');
  sep.resetEra();
  assert.equal(atRadius(2.215),liveFaceCount,'reset restores actual reactive geometry');
  sep.dispose();
}
console.log('abramsUpgradePackage: circular bearing, underside removal, turret seating and backed heavy ERA pass');
