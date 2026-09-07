import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';

// Use the normal eager fleet entry point; a missing registration or fallback
// cannot be papered over by installing the tested builders within this test.
// Numerical assertions inspect real vertices, rays and instance transforms.

const SOURCE = {
  t90a_x: { turret:[2.9522,-1.4561,1.3596], roof:2.2049, gunY:1.8174, muzzle:6.2642, height:2.8266,
    hullRays:[[-2.57,1.417],[-.43,1.479],[1.28,1.480],[2.57,1.235],[3.30,.893]],
    roofRays:[[0,-.58,2.2041],[0,.05,2.1464],[.45,.84,2.0562],[.45,1.18,1.9524]],
    aperture:{y:1.8174,centerZ:1.110,shoulderZ:1.360},
    wheels:[-1.848,-1.002,-.147,.728,1.590,2.464], rear:-4.1944 },
  t90a_vladimir_x: { turret:[2.8997,-1.2180,1.4372], roof:2.2595, gunY:1.7287, muzzle:6.5964, height:3.8069,
    hullRays:[[-2.57,1.514],[-.43,1.495],[1.28,1.455],[2.57,1.222],[3.30,1.036]],
    roofRays:[[.15,-.55,2.249],[.15,.12,2.227],[.15,.80,2.140],[.45,1.18,2.0171]],
    wheels:[-1.828225,-.94808,-.067935,.812205,1.69235,2.572495], rear:-4.1899 },
  t90m_x: { turret:[2.9532,-2.5966,1.4264], roof:2.0309, gunY:1.60825, muzzle:6.2542, height:2.9739,
    hullRays:[[-2.57,1.165],[-.43,1.339],[1.28,1.339],[2.57,1.097],[3.30,.835]],
    roofRays:[[0,-1.90,1.9988],[0,-.61,2.0225],[0,.30,1.993],[.45,1.18,1.8766]],
    aperture:{y:1.608251,centerZ:.982,shoulderZ:1.426},
    wheels:[-1.814,-.9455,-.0512,.8188,1.6715,2.5242], rear:-4.0972 },
  t90sm_x: { turret:[2.8712,-1.4766,1.7345], roof:2.2893, gunY:1.90309, muzzle:7.0399, height:3.1501,
    hullRays:[[-2.57,1.562],[-.43,1.574],[1.28,1.571],[2.57,1.242],[3.30,.936]],
    roofRays:[[.15,-1.30,2.220],[.15,-.47,2.2893],[.15,.56,2.226],[.15,1.34,2.145]],
    wheels:[-1.93988,-.98038,-.02818,.87757,1.77558,2.70061],
    wheelYs:[.47202,.45513,.45513,.45513,.45513,.51461], rear:-4.0973 },
};

function near(value,target,tolerance,label) {
  assert.ok(Number.isFinite(value)&&Math.abs(value-target)<=tolerance,
    `${label}: actual ${value}, source ${target} ± ${tolerance}`);
}

function vertices(mesh) {
  const attribute=mesh.geometry.getAttribute('position');
  return Array.from({length:attribute.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(attribute,i).applyMatrix4(mesh.matrixWorld));
}

function ray(mesh,x,z,up=false) {
  return new THREE.Raycaster(new THREE.Vector3(x,up?-.2:5,z),new THREE.Vector3(0,up?1:-1,0),0,6)
    .intersectObject(mesh,false)[0]?.point.y??NaN;
}

function assertCaps(mesh,id) {
  const points=vertices(mesh),index=mesh.geometry.index;
  for(const [z,sign] of [[-3.43,-1],[3.43,1]]) {
    let count=0;
    for(let i=0;i<(index?.count??points.length);i+=3) {
      const tri=[0,1,2].map(j=>points[index?index.getX(i+j):i+j]);
      if(!tri.every(p=>Math.abs(p.z-z)<1e-4))continue;
      const normal=tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0]));
      assert.ok(normal.z*sign>0,`${id}: structural cap at ${z} faces outside`);count++;
    }
    assert.ok(count>=6,`${id}: closed structural cap at ${z}`);
  }
}

function assertWheelInstances(tank,source,id) {
  const layouts=[];
  tank.root.traverse(mesh=>{
    if(!mesh.isInstancedMesh||!/RoadWheel|roadWheel|wheelTyre|WheelTyre|wheelRubber|WheelRubber/i.test(mesh.name))return;
    const matrix=new THREE.Matrix4();
    for(let i=0;i<mesh.count;i++) {
      mesh.getMatrixAt(i,matrix);const p=new THREE.Vector3().setFromMatrixPosition(matrix).applyMatrix4(mesh.matrixWorld);
      if(Math.abs(p.x)>1.2&&p.y<.6)layouts.push(p);
    }
  });
  // The moving shoe course itself is independently located and counted.
  const shoes=tank.root.getObjectByName('gearTrackPads');
  assert.ok(shoes?.isInstancedMesh&&shoes.count>=80,`${id}: one actual moving track shoe course`);
  assert.equal(tank.root.getObjectByName('gearTrackInnerLinks'),undefined,`${id}: no duplicate inner/static shoe course`);
  assert.ok(layouts.length>=12,`${id}: actual road-wheel instances were located`);
  for(const side of [-1,1])for(const z of source.wheels) {
    assert.ok(layouts.some(p=>Math.sign(p.x)===side&&Math.abs(p.z-z)<.045),`${id}: native wheel station ${side}/${z}`);
  }
  if(source.wheelYs) {
    const tires=tank.root.getObjectByName('gearRoadWheelTires'),matrix=new THREE.Matrix4();
    for(let i=0;i<tires.count;i++) {
      tires.getMatrixAt(i,matrix);const p=new THREE.Vector3().setFromMatrixPosition(matrix);
      const station=source.wheels.findIndex(z=>Math.abs(z-p.z)<.004);
      assert.ok(station>=0,`${id}: exact source terminal station`);
      near(p.y,source.wheelYs[station],.004,`${id}: source absolute axle height ${station}`);
      near(Math.abs(p.x),p.x<0?1.42072:1.422495,.004,`${id}: road axle distinct from track lane`);
    }
    const right=new THREE.Box3().setFromObject(tank.root.getObjectByName('gearTrackBandR'));
    near(right.min.x,1.16031,.004,`${id}: source inner band lane`);
    near(right.max.x,1.64922,.004,`${id}: source outer band lane`);
  }
}

function assertSourceEquipmentSections(tank,id) {
  const mesh=name=>tank.root.getObjectByName(name);
  if(id==='t90a_x') {
    const guard=mesh('hull');
    near(ray(guard,1.45,3.40),1.247,.018,'A: source arched front guard at idler wrap');
    const plate=mesh('hullExternalArmor');
    near(ray(plate,1.862,2.52),1.1146,.023,'A: source cross-plane inclined side armor, not filled bounding-box armor');
    const detail=mesh('hullDetail');
    near(ray(detail,.65,-3.829),1.781,.026,'A: measured drum body radius, independent from bracket envelope');
    near(ray(detail,-1.5327,-1.65),1.53935,.012,'A: independently raised left aft fender case and latch');
    near(ray(detail,.5956,-3.6273),1.82427,.014,'A: separate raised drum strap tensioner');
    near(ray(mesh('turretDetail'),-.390,-1.00694),2.64861,.006,'A: mast neck shoulder, not widened or translated silhouette');
  } else if(id==='t90a_vladimir_x') {
    near(ray(mesh('gunMount'),0,1.23),2.086,.020,'Vladimir: rounded rear canvas boot crown');
    near(ray(mesh('gunMount'),0,1.60),1.920,.020,'Vladimir: tucked circular front canvas cuff');
  } else if(id==='t90m_x') {
    near(ray(mesh('hullExternalArmor'),.70,2.40),1.226,.025,'M: stepped measured middle glacis field');
    near(ray(mesh('turretDetail'),-1.45,.50),1.88519,.024,'M: real inner folded carrier roof');
    near(ray(mesh('turretDetail'),-1.60,.50),1.83105,.024,'M: source measured carrier crossfall');
    near(ray(mesh('turretDetail'),-1.70,.70),1.65502,.024,'M: outer return fold, not full-height carrier AABB');
    near(ray(mesh('hullExternalArmor'),1.843,.525),1.32474,.012,'M: separately seated outer curtain');
    near(ray(mesh('turret'),.90,-.80),1.96962,.015,'M: broad nearly level aft roof shoulder');
    near(ray(mesh('turret'),.90,.507),1.92279,.015,'M: independently inclined forward roof shoulder');
    near(ray(mesh('gunMount'),-.27,1.80),1.71804,.016,'M: source forward canvas cradle cover');
  } else if(id==='t90sm_x') {
    const casing=mesh('hullDetail');
    const hit=new THREE.Raycaster(new THREE.Vector3(-1.30,1.10,-2.70),new THREE.Vector3(0,1,0),0,.40)
      .intersectObject(casing,false)[0];
    near(hit?.point.y??NaN,1.3196,.015,'SM: actual raised exhaust underside over drive-wheel sweep');
    for(const [z,low,high]of [[-4,1.18285,1.25654],[-3.9,1.16479,1.23833],[-3.8,1.17071,1.24556]]) {
      const lower=new THREE.Raycaster(new THREE.Vector3(.374,1,z),new THREE.Vector3(0,1,0),0,.5)
        .intersectObject(casing,false)[0];
      near(lower?.point.y??NaN,low,.008,'SM: genuine curved empty-drum cradle lower web');
      near(ray(casing,.374,z),high,.008,'SM: separately curved bearing rail, not horizontal box');
    }
    near(ray(mesh('turretDetail'),.425,-1.55),3.031,.045,'SM: folded rear hood slope, not full-height extrusion');
    near(ray(mesh('turretExternalArmor'),.52,2.03),1.957,.025,'SM: independent forward-facing cheek closure');
    near(ray(mesh('hull'),1.40,3.83),1.13420,.014,'SM: measured rounded guard crown station');
    assert.ok(!Number.isFinite(ray(mesh('hull'),1.60,3.90)),'SM: source taper leaves air outside the rounded mudguard tip');
    near(ray(mesh('hullOpenLattice'),-1.88,-2.218),1.01608,.012,'SM: outboard cage extremum belongs to short bracket foot only');
    near(ray(mesh('turretDetail'),.554,-.80265),2.53193,.012,'SM: rounded RWS base, not full-height box end');
    near(ray(mesh('turretCupola'),.70,.30),2.37103,.012,'SM: commander hatch uses measured forward-shifted seat');
    near(ray(mesh('turretDetail'),-.55403,.60),2.46374,.012,'SM: genuine narrow forward optic retainer');
    near(ray(mesh('turretDetail'),-1.69,.60),2.03170,.016,'SM: folded outer left body remains substantive armor support');
    near(ray(mesh('turretDetail'),1.69,.60),2.03885,.016,'SM: independent asymmetric right support crossfall');
    near(ray(mesh('gunMount'),0,1.9),2.20677,.006,'SM: genuine raised narrow cradle sight, not a flattened boot');
    near(ray(mesh('turretDetail'),-.9516,-.20),2.60081,.006,'SM: measured capped warning pedestal');
    near(ray(mesh('turretDetail'),.33,-1.40),2.89323,.008,'SM: left RWS hood outer facet is independent from lower edge');
    near(ray(mesh('turretDetail'),.35,-1.40),2.94025,.008,'SM: held-out supported hood lateral crossfall');
  }
}

for(const [id,source] of Object.entries(SOURCE)) {
  const tank=createTank(id,null,{proceduralOnly:true,geometryReceipt:true,quality:'high'});
  try {
    tank.root.updateMatrixWorld(true);
    const hull=tank.root.getObjectByName('hull'),shell=tank.root.getObjectByName('turret'),gun=tank.root.getObjectByName('gun');
    assert.ok(hull?.isMesh&&shell?.isMesh&&gun?.isMesh,`${id}: independently generated component solids`);
    assertCaps(hull,id);
    for(const [z,y] of source.hullRays) {
      // SM's real recessed carrier now supports a separately closed engine
      // cover. Test that physical cover at the same source plane, not the
      // deliberately lower hidden carrier beneath it.
      const cover=id==='t90sm_x'&&z>=-3.142&&z<=-1.447
        ? ray(tank.root.getObjectByName('hullDetail'),0,z) : -Infinity;
      near(Math.max(ray(hull,0,z),cover),y,.066,`${id}: source body roof station ${z}`);
      assert.ok(ray(hull,0,z)>ray(hull,0,z,true)+.001,`${id}: positive enclosed hull skin at ${z}`);
    }
    for(const [x,z,y] of source.roofRays)near(ray(shell,x,z),y,.055,`${id}: source turret roof station ${x}/${z}`);
    if(source.aperture)for(const [x,z] of [[0,source.aperture.centerZ],[.30,source.aperture.shoulderZ]]) {
      const hit=new THREE.Raycaster(new THREE.Vector3(x,source.aperture.y,4),new THREE.Vector3(0,0,-1),0,6)
        .intersectObject(shell,false)[0];
      near(hit?.point.z??NaN,z,.04,`${id}: actual open gun seat ${x}`);
    }
    const sb=new THREE.Box3().setFromObject(shell);
    near(sb.max.x-sb.min.x,source.turret[0],.10,`${id}: main-shell width`);
    near(sb.min.z,source.turret[1],.08,`${id}: main-shell rear`);
    near(sb.max.z,source.turret[2],.08,`${id}: main-shell front`);
    const gp=vertices(gun),front=Math.max(...gp.map(p=>p.z));
    near(front,source.muzzle,.028,`${id}: physical muzzle endpoint`);
    const tip=new THREE.Box3().setFromPoints(gp.filter(p=>p.z>front-.025));
    near(tip.getCenter(new THREE.Vector3()).y,source.gunY,.035,`${id}: true bore height`);
    assert.ok(tip.max.x-tip.min.x>.14&&tip.max.x-tip.min.x<.27,`${id}: circular full-size muzzle, not a point`);
    const mount=tank.root.getObjectByName('gunMount');
    assert.ok(new THREE.Box3().setFromObject(mount,true).max.z<2.4,
      `${id}: thermal sleeves, evacuator and muzzle fixtures cannot remain on the non-recoiling mantlet`);
    assert.equal(gun.parent.name,'rig_recoil',`${id}: the full detailed tube follows native recoil`);
    assertWheelInstances(tank,source,id);
    assertSourceEquipmentSections(tank,id);
    const all=new THREE.Box3().setFromObject(tank.root);
    near(all.max.x-all.min.x,3.78,.12,`${id}: exterior width`);
    near(all.max.y,source.height,.095,`${id}: measured roof-equipment height`);
    near(all.min.z,source.rear,.10,`${id}: uncompressed rear equipment extent`);
    const yaw=tank.root.getObjectByName('rig_turret'),pitch=tank.root.getObjectByName('rig_gun'),muzzle=tank.root.getObjectByName('rig_muzzle');
    assert.equal(pitch.parent,yaw,`${id}: native articulated barrel in turret`);
    const pivot=yaw.getWorldPosition(new THREE.Vector3()),before=muzzle.getWorldPosition(new THREE.Vector3()).sub(pivot);
    yaw.rotation.y=Math.PI/2;tank.root.updateMatrixWorld(true);
    const after=muzzle.getWorldPosition(new THREE.Vector3()).sub(pivot);
    near(after.x,before.z,.001,`${id}: physical muzzle follows yaw`);
    near(after.z,-before.x,.001,`${id}: pitch assembly remains seated through yaw`);
  } finally {tank.dispose();}
}

function boxGap(a,b) {
  return Math.hypot(...['x','y','z'].map(axis=>Math.max(0,a.min[axis]-b.max[axis],b.min[axis]-a.max[axis])));
}

for(const id of Object.keys(SOURCE)) {
  const tank=createTank(id,null,{proceduralOnly:true,geometryReceipt:true,quality:'low',camoSeed:4242,batchStatic:false});
  try {
    const spec=getSpec(id),gun=tank.root.getObjectByName('rig_gun');
    const mount=gun.getObjectByName('gunMount'),recoil=gun.getObjectByName('rig_recoil');
    const shell=tank.root.getObjectByName('rig_turret').getObjectByName('turret');
    assert.ok(mount?.isMesh&&mount.geometry.getAttribute('position').count>0,`${id}: real low-quality pitching mantlet mesh`);
    const poses=[];
    for(const pitch of [-spec.gunDepressionDeg,0,spec.gunElevationDeg]) {
      gun.rotation.x=-pitch*Math.PI/180;tank.root.updateMatrixWorld(true);
      const mountBox=new THREE.Box3().setFromObject(mount,true);
      assert.ok(boxGap(mountBox,new THREE.Box3().setFromObject(shell,true))<=.125,`${id}: mantlet remains seated at ${pitch} degrees`);
      assert.ok(boxGap(mountBox,new THREE.Box3().setFromObject(recoil,true))<=.10,`${id}: barrel remains attached at ${pitch} degrees`);
      poses.push(mount.matrixWorld.elements.slice());
    }
    assert.notDeepEqual(poses[0],poses[1],`${id}: visible cradle pitches down`);
    assert.notDeepEqual(poses[2],poses[1],`${id}: visible cradle pitches up`);
  } finally {tank.dispose();}
}
console.log('t90XGeometry.selftest: four source-measured solids, bore endpoints, moving wheel stations and articulation pass');
