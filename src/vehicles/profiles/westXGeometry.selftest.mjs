import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import '../sourceXFleetSpecs.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { K2_X_PROFILES } from './k2X.ts';
import { KF51_X_PROFILES } from './kf51X.ts';
import { MERKAVA_X_PROFILES } from './merkavaX.ts';

registerProfiledBuilders(Object.fromEntries(Object.entries({
  ...K2_X_PROFILES, ...KF51_X_PROFILES, ...MERKAVA_X_PROFILES,
}).map(([id, profile]) => [id, profile.build])));

// Measurements are independently recorded from the owner input in the source
// packet, not copied out of builder-authored metadata. Native shoe wrap has a
// different nonzero pad thickness from the supplied static meshes; therefore
// the exact ground datum is tested through the actual factory contact surface.
const sources = {
  k2_x: { width: 3.71906, length: 10.8448, height: 4.73527,
    gunY: 1.99253, muzzle: 6.91807, boreR: .0878, roadR: .3225,
    wheels: [-2.17585, -1.28085, -.38585, .50915, 1.40415, 2.29915],
    roofs: [[-2.9, 1.7035], [0, 1.5775], [2.6, 1.4145], [3.58, 1.1519]] },
  kf51_x: { width: 3.5603123, length: 10.74975, height: 5.7214742,
    gunY: 1.85491175, muzzle: 6.89975, boreR: .0892, roadR: .328,
    wheels: [-2.2118, -1.4265, -.6365, .1300, .8573, 1.5808, 2.352],
    roofs: [[-2.6, 1.8272], [0, 1.6025], [2.5, 1.4145], [3.79, 1.2302]] },
  merkava3d_x: { width: 3.976352, length: 8.83824, height: 5.15869,
    gunY: 2.0898, muzzle: 4.855985, boreR: .08485, roadR: .371,
    wheels: [-2.3236825, -1.4406825, -.3106825, .5473175, 1.4058175, 2.2588175],
    roofs: [[-2.1, 1.7145], [-.5, 1.7073], [3.0, 1.4569], [3.73, 1.1646]] },
  merkava4_x: { width: 3.7768898, length: 8.705041, height: 4.9327283,
    gunY: 1.9934619, muzzle: 4.805527, boreR: .0811, roadR: .3467,
    wheels: [-2.062, -1.267, -.199, .739, 1.617, 2.417],
    roofs: [[-2.0, 1.604], [0, 1.604], [2.8, 1.347], [3.77, 1.0475]] },
};

const near = (value, expected, tolerance, label) => assert.ok(
  Number.isFinite(value) && Math.abs(value - expected) <= tolerance,
  `${label}: ${value} vs ${expected} ± ${tolerance}`,
);
const verticalHit = (object, x, z, up = false) => new THREE.Raycaster(
  new THREE.Vector3(x, up ? -.2 : 6, z), new THREE.Vector3(0, up ? 1 : -1, 0), 0, 7,
).intersectObject(object, false)[0]?.point.y;

for (const quality of ['high', 'low']) for (const [id, source] of Object.entries(sources)) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality });
  try {
    tank.root.updateMatrixWorld(true);
    const full = new THREE.Box3().setFromObject(tank.root), size = full.getSize(new THREE.Vector3());
    // This inspects the merged cylinders as well as separate fittings and
    // instances. A cylY(radius,height,segments) signature mistake previously
    // produced a 48 m ring and must fail before any camera framing can hide it.
    near(size.x, source.width, .13, `${id}/${quality}: all-geometry width`);
    near(size.z, source.length, .13, `${id}/${quality}: all-geometry length`);
    near(full.max.y, source.height, .12, `${id}/${quality}: highest physical fitting`);
    near(tank.contactGeom?.bottomYM, 0, .003, `${id}: physical native pad contact is ground zero`);
    for (const n of [...full.min.toArray(), ...full.max.toArray()]) assert.ok(Number.isFinite(n));

    const hull = tank.root.getObjectByName('hull');
    assert.ok(hull?.isMesh, `${id}: structural hull is an actual first-party mesh`);
    for (const [z, roof] of source.roofs) {
      const top = verticalHit(hull, 0, z), bottom = verticalHit(hull, 0, z, true);
      near(top, roof, .035, `${id}: measured structural roof station ${z}`);
      assert.ok(Number.isFinite(bottom) && top > bottom + .002,
        `${id}: closed, positive-thickness body at ${z}`);
    }
    if (id === 'k2_x') {
      for (const side of [-1, 1]) {
        near(verticalHit(hull, side * 1.75, 1.44), 1.3404, .012, `${id}: continuous inner skirt skin`);
        near(verticalHit(hull, side * 1.80, 1.44), 1.34064, .012, `${id}: separate outer skirt plate`);
      }
    } else if (id === 'kf51_x') {
      for (const [z, top, bottom] of [[-3.8,1.80405,1.48806],[-3.7,1.86889,1.14991],[-3.5,1.82725,.90884]]) {
        near(verticalHit(hull, .4, z), top, .008, `${id}: actual raised stern roof ${z}`);
        near(verticalHit(hull, .4, z, true), bottom, .008, `${id}: source upswept rear underfloor ${z}`);
      }
      const skirt=tank.root.getObjectByName('hullExternalArmor');
      assert.ok(skirt?.isMesh,'KF51: actual removable source skirts use external armor ownership');
      for (const side of [-1,1]) {
        near(verticalHit(skirt, side*1.65, -.5), 1.6025, .012, `${id}: inner flank roof plane`);
        near(verticalHit(skirt, side*1.735, -.5), 1.5769, .015, `${id}: separate upper flank chamfer`);
        near(verticalHit(skirt, side*1.779, -.5), 1.1465, .018, `${id}: outer flank is a lower belt, not a box wall`);
      }
    } else if (id === 'merkava4_x') {
      for (const side of [-1, 1]) {
        near(verticalHit(hull, side * 1.74, 2.84), 1.30775, .012, `${id}: source fender transition is enclosed`);
        near(verticalHit(hull, side * 1.44, 3.75), 1.04897, .015, `${id}: descending beak, not raised flat guard`);
      }
    }
    const armor = tank.root.getObjectByName('turret');
    assert.ok(armor?.isMesh, `${id}: first-party structural turret mesh`);
    // Physical ray hits reject a generic symmetrical loaf even if its overall
    // bounding box and author-declared dimensions happen to match the source.
    if (id === 'merkava3d_x') {
      const left = verticalHit(armor, -.9, .6), right = verticalHit(armor, .9, .6);
      near(left, 2.121, .035, `${id}: low left-forward gunner shoulder`);
      near(right, 2.433, .02, `${id}: high right-forward cheek`);
      assert.ok(right - left > .20, `${id}: genuine asymmetric forward armor`);
      const deck=tank.root.getObjectByName('hullEquipment'),fittings=tank.root.getObjectByName('hullDetail');
      for(const [x,z,y]of[[-.8,2,1.76797],[-.3,2,1.79161],[-.8,2.4,1.71453],[-.3,2.4,1.71405],[1.1,2,1.6954]])
        near(verticalHit(deck,x,z),y,.003,`${id}: physically raised asymmetric source armor ${x}/${z}`);
      for(const [x,z,y]of[[.7,2,1.69494],[.7,2.4,1.58405],[-.8,2.85,1.59043],[-.3,2.8,1.60508]])
        near(verticalHit(fittings,x,z),y,.003,`${id}: seated access-panel slope ${x}/${z}`);
      near(verticalHit(fittings,-.6,2.85),1.65492,.006,`${id}: shaped front clamp body`);
      near(verticalHit(fittings,-.8,2.85),1.59043,.003,`${id}: clamp does not fill its empty bounding rectangle`);
    } else if (id === 'merkava4_x') {
      for (const [z, roof] of [[-1, 2.562], [.5, 2.449], [1.5, 2.194]]) {
        near(verticalHit(armor, .5, z), roof, .02, `${id}: raised/sloping source roof ${z}`);
      }
      for(const [x,z,y]of[[1.2,-.8,2.43468],[1.4,-.8,2.27288],[1.6,-.8,2.11827],
        [1.4,0,2.24960],[1.6,0,2.09345],[1.4,.6,2.09979],[1.2,1,2.09828]])
        near(verticalHit(armor,x,z),y,.013,`${id}: rolling source rim, not broad raised applique ${x}/${z}`);
      const fittings=tank.root.getObjectByName('hullDetail');
      near(verticalHit(fittings,.7,1.3),1.63349,.001,`${id}: right engine access base cover`);
      near(verticalHit(fittings,1.0,1.5),1.65826,.001,`${id}: separate stepped sliding cover`);
      assert.equal(verticalHit(fittings,-.2,1.5),undefined,`${id}: no invented center-deck radiator grille`);
    } else if (id === 'kf51_x') {
      near(verticalHit(armor, 0, 1.48), 1.665, .025, `${id}: gun well floor is not a roof bridge`);
      near(verticalHit(armor,-.75,1.85),2.17568,.003,`${id}: separate sight recess has a real lower floor`);
      const fittings=tank.root.getObjectByName('turretDetail');
      near(verticalHit(fittings,-.75,1.65),2.56150,.003,`${id}: asymmetric faceted sight hood top`);
      near(verticalHit(fittings,-.45,1.30),2.52095,.003,`${id}: sloping rear hood face seats on the roof`);
      const aperture=new THREE.Raycaster(new THREE.Vector3(-.75,2.40,2.5),new THREE.Vector3(0,0,-1),0,2)
        .intersectObject(fittings,false)[0];
      near(aperture?.point.z,1.552,.003,`${id}: sight opening remains empty up to its true back wall`);
      near(verticalHit(fittings,1.0,.55),2.649,.003,`${id}: raised right periscope band cap`);
      near(verticalHit(tank.root.getObjectByName('turretCupola'),.60,.55),2.51254,.003,
        `${id}: right hatch center stays below its L-shaped vision bank`);
      for (const side of [-1, 1]) {
        near(verticalHit(armor, side * 1.2, 2.3), 2.15, .025, `${id}: independent pointed cheek ${side}`);
        const whip = tank.root.getObjectByName('turretDark');
        for (const [y,z] of [[3.7515,-2.14058],[4.4935,-2.1974]]) {
          const hit = new THREE.Raycaster(new THREE.Vector3(side*1.02234,y,0),new THREE.Vector3(0,0,-1),0,4)
            .intersectObject(whip,false)[0];
          near(hit?.point.z,z,.006,`${id}: actual bowed/tapered mast at ${y}`);
        }
      }
      const movingGun=tank.root.getObjectByName('gun'),recoil=tank.root.getObjectByName('rig_recoil');
      assert.equal(movingGun.parent,recoil,`${id}: tube and muzzle-reference sight own recoil`);
      assert.ok(new THREE.Box3().setFromObject(tank.root.getObjectByName('gunMount')).max.z<4.68,
        `${id}: far muzzle-reference sight is not hidden in the static mount bucket`);
      near(verticalHit(movingGun,0,6.70),2.0719,.003,`${id}: physical muzzle-reference sight height`);
      recoil.position.z-=.05;tank.root.updateMatrixWorld(true);
      near(verticalHit(movingGun,0,6.65),2.0719,.003,`${id}: sight translates with actual recoil`);
      recoil.position.z+=.05;tank.root.updateMatrixWorld(true);
    } else if (id === 'k2_x') {
      for (const side of [-1, 1]) {
        near(verticalHit(armor, side * 1.4, -.9), 2.3275, .01, `${id}: structural rear armor cassette ${side}`);
      }
    }
    const wheels = tank.root.getObjectByName('gearRoadWheelTires');
    assert.ok(wheels?.isInstancedMesh, `${id}: native road-wheel layer exists`);
    assert.equal(wheels.count, source.wheels.length * 2, `${id}: exact road-wheel count`);
    const matrix = new THREE.Matrix4(), points = [];
    for (let i = 0; i < wheels.count; i++) {
      wheels.getMatrixAt(i, matrix);
      points.push(new THREE.Vector3().setFromMatrixPosition(matrix).applyMatrix4(wheels.matrixWorld));
    }
    for (const side of [-1, 1]) for (const z of source.wheels) assert.ok(
      points.some(p => Math.sign(p.x) === side && Math.abs(p.z - z) < .0001),
      `${id}: actual road wheel at source station ${side}/${z}`,
    );
    const shoeLayers = [];
    tank.root.traverse(o => {
      if (o.isInstancedMesh && o.userData.runningGear && o.userData.trackShoeCountPerSide > 0) shoeLayers.push(o);
    });
    assert.ok(shoeLayers.length >= 1 && shoeLayers.length <= 3, `${id}: only native animated shoe layers`);
    assert.equal(tank.root.getObjectByName('gearTrackInnerLinks'), undefined, `${id}: no duplicate static track course`);

    const rig = tank.root.getObjectByName('rig_gun');
    // The last 20 mm of the hollow muzzle is in gunDark, not the painted
    // gun bucket. Inspect the complete pitch group, including that true lip.
    const gunBox = new THREE.Box3().setFromObject(rig);
    near(gunBox.max.z, source.muzzle, .012, `${id}: physical muzzle endpoint`);
    near(rig.getWorldPosition(new THREE.Vector3()).y, source.gunY, .001, `${id}: true bore/trunnion height`);
    const terminal = new THREE.Box3(), point = new THREE.Vector3();
    rig.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh) return;
      const positions = o.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(o.matrixWorld);
        if (point.z > gunBox.max.z - .022) terminal.expandByPoint(point);
      }
    });
    near(terminal.getCenter(point).y, source.gunY, .003, `${id}: physical muzzle is centered on its bore`);
    near((terminal.max.y - terminal.min.y) / 2, source.boreR, .013, `${id}: physical terminal radius`);
    if (id === 'kf51_x') {
      near(verticalHit(tank.root.getObjectByName('gun'), 0, 5), 1.95691, .006, `${id}: broad fore-tube jacket before reduced terminal`);
    }
    assert.equal(rig.parent, tank.root.getObjectByName('rig_turret'), `${id}: gun pitches within turret yaw`);
  } finally {
    tank.dispose();
  }
}
console.log('westXGeometry: four source datums, finite physical bounds, enclosed hulls, native wheel stations and articulated bores pass in both LODs');
