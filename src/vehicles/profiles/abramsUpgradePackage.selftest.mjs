import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { combatAnatomyCalibration } from '../combatAnatomyCalibrationRegistry.ts';
import { ensureInteriorFills } from '../interiorFills.ts';
import { createTankState } from '../../sim/movement.ts';
import { minimumMechanicalGunPitch } from '../../sim/gunPitchLimits.ts';

await ensureInteriorFills(['m1a3']);

// 2026-10-28 (m1e3-264): the M1E3's tapered mantlet nose (profiles/abrams.ts addM1E3Gun): its face's upper corner, the
// rotor and the collar pitch with the gun and never slide with recoil.
function verifyM1E3Mantlet(tank) {
  const spec = getSpec('m1a3');
  const state = createTankState(spec, new THREE.Vector3(), 0);
  const gun = tank.root.getObjectByName('rig_gun');
  const mount = tank.root.getObjectByName('gunMount');
  const recoil = tank.root.getObjectByName('rig_recoil');
  assert.ok(mount.parent === gun, 'whole shield pitches without sliding with recoil');
  const position = mount.geometry.attributes.position;
  const brow = new THREE.Vector3(.215, .15, .65);
  assert.ok(Array.from({length:position.count}, (_,i) => new THREE.Vector3().fromBufferAttribute(position,i))
    .some(point => point.distanceTo(brow)<1e-5), 'broad front shield belongs to gunMount, not just a hidden collar');
  const ray = new THREE.Raycaster();
  ray.far = 1.2;
  const hullRay = new THREE.Raycaster(), down = new THREE.Vector3(0,-1,0), up = new THREE.Vector3(0,1,0);
  const hullMeshes = ['hull','hullDetail','hullEquipment','hullDark'].map(name => tank.root.getObjectByName(name)).filter(Boolean);
  const poses = [];
  for (const yaw of [0, 90, 180, -90]) {
    // each pose at or above that yaw's published stop (the M1 family's rear-deck curves, m1a1GunLimits.ts)
    const stop = THREE.MathUtils.radToDeg(minimumMechanicalGunPitch(spec, THREE.MathUtils.degToRad(yaw)));
    for (const pitch of [-spec.gunDepressionDeg, -5, 0, 8, 16, spec.gunElevationDeg].map(p => Math.max(p, stop))) {
      state.turretYaw = THREE.MathUtils.degToRad(yaw);
      state.gunPitch = THREE.MathUtils.degToRad(pitch);
      tank.syncFromState(state, 0);
      tank.root.updateMatrixWorld(true);
      const worldBrow = mount.localToWorld(brow.clone());
      assert.ok(worldBrow.distanceTo(gun.localToWorld(brow.clone()))<1e-6,
        'the visible shield follows the actual gun joint');
      if (yaw===0) poses.push(worldBrow.y);
      // Actual first-hit triangles beside the tube are moving armor: a fixed duplicate shield or a stale interior fill
      // in front would fail this sightline.
      for (const x of [-.21, .26]) {
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
      // In the forward arc every low mantlet vertex keeps 4 cm over the hull under it (the collar reaches out over the
      // glacis at full depression), and no hull surface stands over it.
      if (yaw===0) {
        const point = new THREE.Vector3();
        for(let i=0;i<position.count;i++) {
          point.fromBufferAttribute(position,i).applyMatrix4(mount.matrixWorld);
          if (point.y>1.70) continue;
          hullRay.set(point, down); hullRay.far = .04;
          assert.equal(hullRay.intersectObjects(hullMeshes,false).length, 0, `mantlet clears the hull at pitch ${pitch}`);
          hullRay.set(point, up); hullRay.far = .5;
          assert.equal(hullRay.intersectObjects(hullMeshes,false).length, 0, `mantlet stays over the hull at pitch ${pitch}`);
        }
      }
    }
  }
  assert.ok(poses.at(-1)-poses[0]>.07, 'broad shield visibly rocks through the full elevation sweep');
  const mountPosition = mount.position.clone();
  tank.recoilKick(0,1);
  tank.syncFromState(state,.12);
  assert.ok(recoil.position.z<-.05, '120 mm barrel actually recoils');
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
  assert.ok(ax.root.getObjectByName('hullRunningGearTrack') === undefined,
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
  assert.ok(Math.abs(turret.position.y-(1.62 + .012))<1e-8, 'M1E3 turret seated at the M1 family ring height');
  assert.equal(turret.position.z,.35, 'turret at the M1A1 family ring station');
  assert.ok(m1.root.getObjectByName('rig_gun').parent === turret);
  // The circular bearing spans the deck (1.45, buried 3 cm) to the turret floor (-0.102, 3 mm overlap).
  const bearing = m1.root.getObjectByName('turret').geometry.attributes.position;
  const bottomLocal = 1.45 - turret.position.y;
  const bearingTopLocal = -.099;
  let bearingBottom=Infinity, bearingTop=-Infinity;
  for(let i=0;i<bearing.count;i++) {
    const r = Math.hypot(bearing.getX(i), bearing.getZ(i));
    if (Math.abs(r-1.25)>1e-3) continue;
    if(Math.abs(bearing.getY(i)-bottomLocal)<1e-5) bearingBottom=Math.min(bearingBottom,bearing.getY(i)+turret.position.y);
    if(Math.abs(bearing.getY(i)-bearingTopLocal)<1e-5) bearingTop=Math.max(bearingTop,bearing.getY(i)+turret.position.y);
  }
  assert.ok(bearingBottom<1.48 && bearingBottom>1.44, 'bearing overlaps the 1.48 m hull deck');
  assert.ok(bearingTop>turret.position.y-.102, 'bearing remains connected to the turret base');
  // The ring seam shows from both sides between the deck and the turret floor.
  m1.root.updateMatrixWorld(true);
  const sideRayT = new THREE.Raycaster();
  const visibleMeshes=[];
  m1.root.traverse(object => {
    if (!object.isMesh) return;
    for (let parent=object; parent; parent=parent.parent) if (!parent.visible) return;
    visibleMeshes.push(object);
  });
  // Between the 1.48 m deck (-0.152) and the turret floor (-0.102): the field net's drapes may cover one of a side's
  // three lines, nothing else may.
  for (const side of [-1,1]) {
    let seen=0;
    for (const y of [-.145,-.13,-.115]) {
      const origin=turret.localToWorld(new THREE.Vector3(side*8,y,0));
      sideRayT.set(origin,new THREE.Vector3(-side,0,0));
      const hit=sideRayT.intersectObjects(visibleMeshes,false)[0];
      if (hit && /_ghillie_/.test(hit.object.name)) continue;
      // (264: since 252 the turret seat's ring collar, turretSeatRace.ts addSeatCollar, ce10d80591, stands in the seam just
      // outside the bearing, in the turret's paint: the ring the sightline meets is the collar or the bearing)
      assert.ok(['turret', 'turretSeatCollar'].includes(hit?.object.name),'side sightline exposes the thin circular bearing');
      // (the bearing at r 1.25, or the collar at the race's outer edge, r 1.345: both inside the ring's rim, never a side
      // panel at 1.5)
      assert.ok(Math.abs(turret.worldToLocal(hit.point.clone()).x)<combatAnatomyCalibration('m1a3').turretRing.rimR,
        'visible stock is the bearing, not a turret side panel');
      seen++;
    }
    assert.ok(seen>=2,`side ${side}: the bearing shows on at least two of its three sightlines (${seen})`);
  }
  // Lifting eyes are seated on the body roof and on the bustle roof.
  for (const side of [-1, 1]) {
    for (const [x, z, y0] of [[1.05,-.30,.95],[.60,-1.85,1.05]]) {
      const plateTop = verticalHit(m1, ['turretEquipment'], side*x, y0, z, -1);
      const stock = verticalHit(m1, ['turret'], side*x, y0, z, -1);
      assert.ok(plateTop>stock && plateTop-stock<.026, `lifting-eye base is seated at ${side*x},${z}`);
    }
  }
  // Both turret sides slope inward toward the roof: the body's chamfer over its band, the bustle's shoulder chamfer.
  const sideProbe = new THREE.Mesh(m1.root.getObjectByName('turret').geometry,
    new THREE.MeshBasicMaterial({side: THREE.DoubleSide}));
  const sideRay = new THREE.Raycaster();
  for (const side of [-1, 1]) for (const [z, minimum, ys] of [[0,.12,[.15,.60]],[-.60,.12,[.15,.60]],[-2.5,.05,[.40,.84]]]) {
    const hits = ys.map(y => {
      sideRay.set(new THREE.Vector3(side*3,y,z),new THREE.Vector3(-side,0,0));
      const hit = sideRay.intersectObject(sideProbe)[0];
      assert.ok(hit, 'sloped turret remains closed');
      return Math.abs(hit.point.x);
    });
    assert.ok(hits[0]-hits[1]>minimum, `turret side at z ${z} slopes inward toward the roof`);
  }
  sideProbe.material.dispose();
  // Finite first-hit probes of the actual closed hull stock over the track: front shoulders and fender caps, the
  // rear shoulder roofs and side boxes; the end wraps keep their air.
  const hullProbe = new THREE.Mesh(m1.root.getObjectByName('hull').geometry,
    new THREE.MeshBasicMaterial());
  const closureRay = new THREE.Raycaster();
  for (const side of [-1,1]) {
    for (const x of [1.16,1.45,1.80]) {
      for (const z of [2.80,3.25,-2.60,-3.10,-3.50]) {
        closureRay.set(new THREE.Vector3(side*x,1.95,z), new THREE.Vector3(0,-1,0));
        closureRay.far = .60;
        assert.ok(closureRay.intersectObject(hullProbe)[0], `joined fender roof over track at ${side*x},${z}`);
      }
    }
    for (const z of [1.2,0.0,-1.4,-2.2]) {
      closureRay.set(new THREE.Vector3(side*1.80,1.95,z), new THREE.Vector3(0,-1,0));
      closureRay.far = .60;
      assert.ok(closureRay.intersectObject(hullProbe)[0], `fender ledge or side box closes the skirt top at ${side*1.80},${z}`);
    }
    for (const [z,direction] of [[4.2,-1],[-4.3,1]]) {
      closureRay.far = .3;
      closureRay.set(new THREE.Vector3(side*1.46,1.05,z), new THREE.Vector3(0,0,direction));
      assert.equal(closureRay.intersectObject(hullProbe).length,0,'lower track opening remains clear');
    }
  }
  hullProbe.material.dispose();
  verifyM1E3Mantlet(m1);
  m1.dispose();

  const sep = createTank('m1a2_abrams_sepv3',null,{proceduralOnly:true,quality,geometryReceipt:true});
  const armor=sep.root.getObjectByName('hullExternalArmor');
  armor.geometry.computeBoundingBox();
  assert.ok(armor.geometry.boundingBox.max.x>2.21, 'SEPv3 has the enlarged side package');
  assert.ok(armor.geometry.boundingBox.min.x< -2.21, 'both flanks are enlarged');
  assert.ok(getSpec('m1a2_abrams_sepv3').dims.widthM>=4.47, 'spec includes the heavy kit, preventing unwanted downscaling');
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
console.log('abramsUpgradePackage: circular bearing, turret seating, articulated M1E3 mantlet/recoil and backed heavy ERA pass');
