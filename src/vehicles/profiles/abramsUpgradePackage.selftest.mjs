import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { ensureInteriorFills } from '../interiorFills.ts';
import { createTankState } from '../../sim/movement.ts';

await ensureInteriorFills(['m1a3']);

function verifyM1A3Mantlet(tank) {
  const spec = getSpec('m1a3');
  const state = createTankState(spec, new THREE.Vector3(), 0);
  const gun = tank.root.getObjectByName('rig_gun');
  const mount = tank.root.getObjectByName('gunMount');
  const recoil = tank.root.getObjectByName('rig_recoil');
  assert.ok(mount.parent === gun, 'whole shield pitches without sliding with recoil');
  const position = mount.geometry.attributes.position;
  const brow = new THREE.Vector3(.348, .39, .88);
  assert.ok(Array.from({length:position.count}, (_,i) => new THREE.Vector3().fromBufferAttribute(position,i))
    .some(point => point.distanceTo(brow)<1e-5), 'broad front shield belongs to gunMount, not just a hidden collar');
  const geometry = mount.geometry;
  const chinProbe = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  const chinRay = new THREE.Raycaster();
  chinRay.far = .12;
  for (const side of [-1,1]) {
    chinRay.set(new THREE.Vector3(side*.335,-.08,1.37),new THREE.Vector3(0,0,-1));
    assert.equal(chinRay.intersectObject(chinProbe).length,0,
      'mantlet lower corner has a real bevel matching the cheek underside');
    chinRay.set(new THREE.Vector3(side*.20,-.08,1.37),new THREE.Vector3(0,0,-1));
    assert.ok(chinRay.intersectObject(chinProbe)[0], 'center chin remains closed armor');
  }
  chinProbe.material.dispose();
  const ray = new THREE.Raycaster();
  ray.far = .5;
  const poses = [];
  for (const yaw of [0, 90, 180, -90]) {
    // Sweep intermediate angles as well as both mechanical stops.
    for (const pitch of [-spec.gunDepressionDeg, -5, 0, 8, 16, spec.gunElevationDeg]) {
      state.turretYaw = THREE.MathUtils.degToRad(yaw);
      state.gunPitch = THREE.MathUtils.degToRad(pitch);
      tank.syncFromState(state, 0);
      tank.root.updateMatrixWorld(true);
      const worldBrow = mount.localToWorld(brow.clone());
      assert.ok(worldBrow.distanceTo(gun.localToWorld(brow.clone()))<1e-6,
        'the visible shield follows the actual gun joint');
      if (yaw===0) poses.push(worldBrow.y);
      // Actual first-hit triangles must be moving armor; a fixed duplicate
      // shield or stale interior fill in front would fail this sightline.
      for (const x of [-.22, .22]) {
        ray.set(gun.localToWorld(new THREE.Vector3(x,-.06,1.45)),
          new THREE.Vector3(0,0,-1).transformDirection(gun.matrixWorld));
        const hit = ray.intersectObjects(tank.root.children,true).find(hit => {
          if (hit.object.userData.shadowOnly || hit.object.userData.authoredShadowProxy) return false;
          for(let p=hit.object;p;p=p.parent) if(!p.visible) return false;
          return true;
        });
        assert.ok(hit?.object === mount,
          `visible shield stays attached at yaw ${yaw}, pitch ${pitch}; hit ${hit?.object?.name}`);
      }
      // In the forward arc, the lowest actual mantlet vertex clears the
      // 1.66 m deck. This catches the old long chin cutting through it.
      if (yaw===0) {
        const point = new THREE.Vector3();
        for(let i=0;i<position.count;i++) {
          point.fromBufferAttribute(position,i).applyMatrix4(mount.matrixWorld);
          assert.ok(point.y>1.66, `mantlet clears the hull at pitch ${pitch}`);
        }
      }
      assert.ok(mount.geometry === geometry, 'aiming reuses the geometry');
    }
  }
  assert.ok(poses.at(-1)-poses[0]>.45, 'broad shield visibly rocks through the full elevation sweep');
  const mountPosition = mount.position.clone();
  tank.recoilKick(0,1);
  tank.syncFromState(state,.12);
  assert.ok(recoil.position.z<-.05, '130 mm barrel actually recoils');
  assert.deepEqual(mount.position, mountPosition, 'mantlet stays on its bearing during recoil');
  tank.syncFromState(state,1);
  assert.ok(Math.abs(recoil.position.z)<1e-8, 'barrel returns inside the mantlet');
}

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
    for (const x of [1.10,1.45]) {
      const trayBottom = verticalHit(m1, ['turretEquipment'], side*x, .62, -1.52, -1);
      const stock = verticalHit(m1, ['turret','turretExternalArmor'], side*x, 1, -1.52, -1);
      assert.ok(trayBottom<.60 && trayBottom<=stock, `service tray bridges real stock at ${side*x}: bottom ${trayBottom}, receiving ${stock}`);
    }
    for (const z of [1.05,.65]) {
      const plateTop = verticalHit(m1, ['turretEquipment'], side*1.04, .75, z, -1);
      const stock = verticalHit(m1, ['turret','turretExternalArmor'], side*1.04, .75, z, -1);
      assert.ok(plateTop>stock && plateTop-stock<.026, 'lifting-eye base is seated on the sloped cheek');
    }
  }
  // The exact marked front caps are removed as solids, not clipped faces.
  const externalArmor = m1.root.getObjectByName('turretExternalArmor').geometry;
  externalArmor.computeBoundingBox();
  assert.ok(externalArmor.boundingBox.max.z < 0, 'no added cheek cap remains on either side');
  const sideProbe = new THREE.Mesh(m1.root.getObjectByName('turret').geometry,
    new THREE.MeshBasicMaterial({side: THREE.DoubleSide}));
  const sideRay = new THREE.Raycaster();
  for (const side of [-1, 1]) for (const z of [0, -1.3, -2.3]) {
    const hits = [.15, .60].map(y => {
      sideRay.set(new THREE.Vector3(side*3,y,z),new THREE.Vector3(-side,0,0));
      const hit = sideRay.intersectObject(sideProbe)[0];
      assert.ok(hit, 'sloped turret remains closed');
      return Math.abs(hit.point.x);
    });
    assert.ok(hits[0]-hits[1]>.20, 'both turret sides visibly slope inward toward the roof');
  }
  sideProbe.material.dispose();
  // Finite first-hit probes of the actual closed hull stock. These samples
  // sat inside the old front/rear holes; thin detached dressing cannot win.
  const hullProbe = new THREE.Mesh(m1.root.getObjectByName('hull').geometry,
    new THREE.MeshBasicMaterial());
  const closureRay = new THREE.Raycaster();
  for (const side of [-1,1]) {
    // The end covers must not leave the old middle seam enclosed between
    // the central hull and skirt crown. Check its stock and underside air.
    for (const z of [-2.20,-1.1,0.11,1.2,2.70]) {
      closureRay.set(new THREE.Vector3(side*1.8087375,1.8,z),new THREE.Vector3(0,-1,0));
      closureRay.far=.28;
      assert.ok(closureRay.intersectObject(hullProbe)[0], 'center sponson joins the skirt crown');
      // The strict animated-shoe audit reaches 1.473 m. At the front join
      // the shoulder underside is 1.505 m, below the center bridge itself.
      closureRay.set(new THREE.Vector3(side*1.8087375,1.475,z),new THREE.Vector3(0,1,0));
      closureRay.far=.025;
      assert.equal(closureRay.intersectObject(hullProbe).length,0, 'roof bridge stays clear of return shoes');
    }
    for (const x of [1.16,1.45,1.80,1.98]) {
      for (const z of [2.80,3.25,3.70,-2.50,-3.10,-3.70,-4.02]) {
        closureRay.set(new THREE.Vector3(side*x,1.9,z), new THREE.Vector3(0,-1,0));
        closureRay.far = .45;
        assert.ok(closureRay.intersectObject(hullProbe)[0],
          `joined fender roof over track at ${side*x},${z}`);
      }
      for (const [originZ, direction] of [[4.3,-1],[-4.4,1]]) {
        closureRay.far = .6;
        for (const y of [1.28,1.44]) {
          closureRay.set(new THREE.Vector3(side*x,y,originZ), new THREE.Vector3(0,0,direction));
          assert.ok(closureRay.intersectObject(hullProbe)[0],
            `finite end cover at ${side*x},${y},${originZ}`);
        }
      }
    }
    // Air below each apron remains available for the animated end wrap.
    for (const [z,direction] of [[4.2,-1],[-4.3,1]]) {
      closureRay.far = .3;
      closureRay.set(new THREE.Vector3(side*1.46,1.05,z), new THREE.Vector3(0,0,direction));
      assert.equal(closureRay.intersectObject(hullProbe).length,0,'lower track opening remains clear');
    }
  }
  hullProbe.material.dispose();
  const cheekProbe = new THREE.Mesh(m1.root.getObjectByName('turret').geometry,
    new THREE.MeshBasicMaterial());
  closureRay.far = 1;
  for (const side of [-1,1]) {
    closureRay.set(new THREE.Vector3(side*.50,-.5,1.90),new THREE.Vector3(0,1,0));
    const chin = closureRay.intersectObject(cheekProbe)[0];
    assert.ok(chin && chin.point.y>-.005 && chin.point.y<.06,
      'front underside rises into the cheek instead of remaining flat at -.10 m');
    closureRay.set(new THREE.Vector3(side*1.10,-.5,.96),new THREE.Vector3(0,1,0));
    const aft = closureRay.intersectObject(cheekProbe)[0];
    assert.ok(aft && Math.abs(aft.point.y+.10)<1e-5,
      'rear cheek foot remains seated at the unchanged lower shell datum');
  }
  cheekProbe.material.dispose();
  verifyM1A3Mantlet(m1);
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
console.log('abramsUpgradePackage: circular bearing, turret seating, articulated M1A3 mantlet/recoil and backed heavy ERA pass');
