import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { isOpenLatticeMesh } from '../../../tools/standard-continuity-policy.mjs';

// Fixed measurements came from the owner source BEFORE authoring (see each
// reference packet and source-measurements.json). Do not replace these with
// LEOPARD_X_DATUMS or geometry/attachment receipts written by the builder.
const sources = {
  leo2a7v_x: { roof:2.67624, rear:-2.794, front:3.110, width:3.0947,
    bore:[0,2.032625,6.968598,.19814], wheelR:.375,
    stations:[-2.379,-1.569,-.759,.049,.858,1.667,2.476],
    roofProbes:[[-2.5,2.62586],[-1.5,2.65858],[-.5,2.68415],[.5,2.64631],[1.5,2.57985],[2.5,2.30606]] },
  leo2a6m_x: { roof:2.54631, rear:-2.702, front:3.281, width:2.5542,
    bore:[-.00051,2.089435,7.02546,.18485], wheelR:.357885,
    stations:[-2.38862,-1.59159,-.80394,.02123,.82764,1.62467,2.42169],
    roofProbes:[[-2.5,1.97827],[-1.5,2.55136],[-.5,2.54629],[.5,2.54630],[1.5,2.47661],[2.5,2.28960]] },
  leo2a4m_x: { roof:2.44859, rear:-2.833, front:3.024, width:2.9421,
    bore:[-.12731,1.90798,6.10,.16260], wheelR:.34591,
    stations:[-2.46924,-1.69277,-.84589,-.05430,.71890,1.51565,2.35278],
    roofProbes:[[-2.5,2.39353],[-1.5,2.44278],[-.5,2.44597],[.5,2.43936],[1.5,2.33162],[2.5,2.03443]] },
  leo2a5_x: { roof:2.63149, rear:-2.725, front:3.236, width:3.0467,
    bore:[.023815,1.99791,6.11,.16382], wheelR:.35159,
    stations:[-2.252,-1.414,-.580,.287,1.048,1.850,2.694],
    roofProbes:[[-1.5,2.51290],[-.5,2.51306],[.5,2.51868],[1.5,2.40398],[2.5,2.2139]] },
};

const near = (actual, target, tolerance, label) => assert.ok(
  Number.isFinite(actual) && Math.abs(actual-target) <= tolerance,
  `${label}: ${actual.toFixed(5)}; source ${target} ± ${tolerance} m`);
const vertices = (mesh) => {
  const p = mesh.geometry.getAttribute('position');
  return Array.from({length:p.count}, (_,i) => new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld));
};
const ray = (mesh, origin, direction) => new THREE.Raycaster(
  new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, 16,
).intersectObject(mesh,false)[0]?.point;
const sectionFloor = (mesh, z) => {
  const points=vertices(mesh), index=mesh.geometry.index;
  let minimum=Infinity;
  for(let i=0;i<(index?.count??points.length);i+=3) {
    const triangle=[0,1,2].map(j=>points[index?index.getX(i+j):i+j]);
    for(let edge=0;edge<3;edge++) {
      const a=triangle[edge], b=triangle[(edge+1)%3];
      if(z<Math.min(a.z,b.z)||z>Math.max(a.z,b.z)||Math.abs(a.z-b.z)<1e-8)continue;
      minimum=Math.min(minimum,a.y+(b.y-a.y)*(z-a.z)/(b.z-a.z));
    }
  }
  return minimum;
};
const instancedVertexBounds = (mesh) => {
  const result=new THREE.Box3(), matrix=new THREE.Matrix4(), point=new THREE.Vector3();
  const positions=mesh.geometry.getAttribute('position');
  for(let instance=0;instance<mesh.count;instance++) {
    mesh.getMatrixAt(instance,matrix);
    matrix.premultiply(mesh.matrixWorld);
    for(let i=0;i<positions.count;i++) result.expandByPoint(point.fromBufferAttribute(positions,i).applyMatrix4(matrix));
  }
  return result;
};

for (const [id, source] of Object.entries(sources)) {
  const tank = createTank(id, null, { proceduralOnly:true, geometryReceipt:true, quality:'high' });
  try {
    tank.root.updateMatrixWorld(true);
    const get = (name) => {
      const object=tank.root.getObjectByName(name);
      assert.ok(object,`${id}: ${name} exists on actual runtime assembly`);
      return object;
    };
    const hull=get('rig_hull'), turret=get('rig_turret'), gun=get('rig_gun');
    assert.equal(gun.parent,turret,`${id}: independent cannon pitches inside turret yaw`);
    const body=get('hull'), shell=get('turret'), barrel=get('gun');
    const mount=get('gunMount'), recoil=get('rig_recoil');
    assert.ok(mount.isMesh&&mount.geometry.getAttribute('position').count>=24,
      `${id}: real existing mantlet/cradle is in the pitching gunMount bucket`);
    assert.equal(mount.parent,gun,`${id}: physical gun housing pitches without barrel recoil`);
    assert.equal(barrel.parent,recoil,`${id}: barrel and muzzle-reference fixtures recoil together`);
    for (const mesh of [body,shell,barrel]) {
      assert.ok(mesh.isMesh && mesh.geometry.getAttribute('position').count>=24,
        `${id}/${mesh.name}: actual authored multi-plane geometry exists`);
      const p=mesh.geometry.getAttribute('position');
      for(const value of p.array) assert.ok(Number.isFinite(value),`${id}/${mesh.name}: finite mesh data`);
    }
    const shellBox=new THREE.Box3().setFromObject(shell);
    near(shellBox.max.y,source.roof,.082,`${id}: actual turret roof height`);
    near(shellBox.min.z,source.rear,.065,`${id}: rear shell station`);
    near(shellBox.max.z,source.front,.065,`${id}: front cheek station`);
    near(shellBox.max.x-shellBox.min.x,source.width,.085,`${id}: shell width`);
    for(const [z,y] of source.roofProbes) {
      near(ray(shell,[.8,6,z],[0,-1,0])?.y??NaN,y,.11,`${id}: source roof triangle x=.8 z=${z}`);
    }
    for(const z of [-2.6,-1.3,0,1.2,2.6,3.4]) {
      const top=ray(body,[0,5,z],[0,-1,0])?.y;
      const bottom=ray(body,[0,0,z],[0,1,0])?.y;
      assert.ok(Number.isFinite(top)&&Number.isFinite(bottom)&&top>bottom+.025,
        `${id}: closed roof and belly with positive thickness at z=${z}`);
    }

    const barrelPoints=vertices(barrel);
    const box=new THREE.Box3().setFromPoints(barrelPoints);
    const tip=new THREE.Box3().setFromPoints(barrelPoints.filter(p=>p.z>box.max.z-.031));
    const center=tip.getCenter(new THREE.Vector3());
    near(center.x,source.bore[0],.018,`${id}: physical bore lateral center`);
    near(center.y,source.bore[1],.018,`${id}: physical bore elevation`);
    near(box.max.z,source.bore[2],.035,`${id}: physical muzzle station`);
    near(tip.max.x-tip.min.x,source.bore[3],.018,`${id}: physical muzzle diameter`);

    const wheels=get('gearRoadWheelTires');
    assert.ok(wheels.isInstancedMesh,`${id}: native animated wheel ownership`);
    assert.equal(wheels.count,14,`${id}: seven road wheels on each side, no source gear duplicate`);
    const matrix=new THREE.Matrix4();
    const centers=[];
    for(let i=0;i<wheels.count;i++) {
      wheels.getMatrixAt(i,matrix);
      centers.push(new THREE.Vector3().setFromMatrixPosition(matrix).applyMatrix4(wheels.matrixWorld));
    }
    const stations=[...new Set(centers.map(p=>+p.z.toFixed(4)))].sort((a,b)=>a-b);
    assert.equal(stations.length,7,`${id}: exactly seven paired axle stations`);
    stations.forEach((z,i)=>near(z,source.stations[i],.035,`${id}: fixed source paired station ${i}`));
    wheels.geometry.computeBoundingBox();
    near(wheels.geometry.boundingBox.max.y-wheels.geometry.boundingBox.min.y,source.wheelR*2,.035,`${id}: physical road-wheel diameter`);
    const bands=[];
    hull.traverse(o=>{if(o.userData?.appearanceRole==='trackBand')bands.push(o);});
    assert.equal(bands.length,2,`${id}: exactly one native belt per side`);
    const shoes=get('gearTrackPads');
    assert.ok(shoes.isInstancedMesh,`${id}: moving linked shoes exist`);
    near(instancedVertexBounds(shoes).min.y,0,.018,
      `${id}: actual lowest linked shoe meets source ground zero`);
    assert.equal(tank.root.getObjectByName('gearTrackInnerLinks'),undefined,`${id}: no second static shoe course`);

    const roofGun=get(`${id}RoofMachineGun`);
    const crewFixture=roofGun;
    let owner=crewFixture;
    while(owner && owner!==turret)owner=owner.parent;
    assert.equal(owner,turret,`${id}: actual crew fixture has turret ownership`);
    const muzzle=get('rig_muzzle');
    const pivot=turret.getWorldPosition(new THREE.Vector3());
    const before=muzzle.getWorldPosition(new THREE.Vector3()).sub(pivot);
    turret.rotation.y=Math.PI/2;
    tank.root.updateMatrixWorld(true);
    const after=muzzle.getWorldPosition(new THREE.Vector3()).sub(pivot);
    near(after.x,before.z,.001,`${id}: muzzle rigidly follows 90-degree yaw`);
    near(after.z,-before.x,.001,`${id}: yaw never leaves cannon behind`);
    const flat=muzzle.getWorldPosition(new THREE.Vector3());
    gun.rotation.x=-.15;
    tank.root.updateMatrixWorld(true);
    assert.ok(muzzle.getWorldPosition(new THREE.Vector3()).distanceTo(flat)>.4,`${id}: gun pitch moves the physical muzzle`);
    turret.rotation.y=0;gun.rotation.x=0;tank.root.updateMatrixWorld(true);

    if(id!=='leo2a4m_x') {
      const ropes=[];
      hull.traverse(o=>{if(o.userData?.sourceEquipment==='recovery-cable')ropes.push(o);});
      assert.deepEqual(ropes.map(o=>o.name).sort(),
        [`${id}RecoveryCable_-1`,`${id}RecoveryCable_1`],`${id}: only two source-identified recovery ropes`);
      for(const rope of ropes) {
        assert.equal(rope.geometry.type,'TubeGeometry',`${id}: exterior role belongs to actual thin rope, not armor`);
        assert.ok(rope.geometry.parameters.radius<=.018,`${id}: no broad surface hidden in the cable role`);
        assert.ok(isOpenLatticeMesh(rope),`${id}: actual rope loop encloses source exterior air`);
        assert.equal(rope.parent,hull,`${id}: hull-owned rope remains in whole and hull source silhouettes`);
        assert.ok(rope.visible&&rope.material.visible&&rope.material.colorWrite!==false,
          `${id}: source-fidelity whole silhouette still renders the real rope`);
        assert.notEqual(rope.userData.runningGear,true,`${id}: rope still undergoes strict track clearance`);
      }
      for(const name of ['hull','turret','hullDetail','hullDark','gunMount']) {
        assert.equal(isOpenLatticeMesh(get(name)),false,`${id}: ${name} remains in the zero-hole structural scan`);
      }
      tank.root.traverse(o=>{
        if(['armor','externalArmor'].includes(o.userData?.combatHitboxRole))
          assert.notEqual(o.userData.continuityRole,'open-lattice',`${id}/${o.name}: no structural armor reclassified`);
        if(isOpenLatticeMesh(o))assert.ok(/OpenLattice/.test(o.name)||ropes.includes(o),
          `${id}/${o.name}: only measured cage bars and named recovery ropes qualify`);
      });
    }

    if(id==='leo2a7v_x') {
      for(const [z,y] of [[3.3,1.43897],[3.4,1.35682],[3.5,1.27468],[3.6,1.19254]])
        near(ray(body,[0,4,z],[0,-1,0])?.y??NaN,y,.003,`${id}: source supporting glacis at z=${z}`);
      for(const x of [-.911,.911])near(ray(get('hullGlass'),[x,1.2872,5],[0,0,-1])?.z??NaN,
        3.68501,.0015,`${id}: source paired circular headlamp optical front plane`);
      for(const x of [.40916,.57280,.73085]) {
        near(ray(get('hullDetail'),[x+.06314,4,3.342],[0,-1,0])?.y??NaN,
          1.49604,.003,`${id}: source upper shoe pin height at x=${x}`);
        near(ray(get('hullDetail'),[x+.06314,4,3.504],[0,-1,0])?.y??NaN,
          1.36291,.003,`${id}: source lower shoe pin height at x=${x}`);
      }
      near(ray(get('hullDetail'),[.47230,4,3.694037],[0,-1,0])?.y??NaN,
        1.20681,.003,`${id}: actual fourth lower shoe is separate from the three upper links`);
      for(const [x,z,y] of [[.3,2.1,2.56965],[1.1,2.1,2.39868],
        [.3,2.3,2.52886],[1.1,2.3,2.31405]])
        near(ray(shell,[x,4,z],[0,-1,0])?.y??NaN,y,.010,
          `${id}: actual source positive cheek crossfall at x=${x}, z=${z}`);
      const rack=get('leo2a7v_xFrontalRack');
      assert.equal(rack.parent,turret,`${id}: two-row frontal rack yaws with the physical turret`);
      const tubes=rack.children.filter(o=>o.name.startsWith('leo2a7v_xFrontalTube_'));
      assert.equal(tubes.length,17,`${id}: actual source nine-plus-eight staggered tube census`);
      for(const tube of tubes) {
        const center=tube.getWorldPosition(new THREE.Vector3());
        const axis=new THREE.Vector3(0,Math.sin(.27477),Math.cos(.27477)*.92099385).normalize();
        const mouthRay=new THREE.Raycaster(center.clone().addScaledVector(axis,.4),axis.clone().negate(),0,.8);
        assert.equal(mouthRay.intersectObject(tube,false).length,0,
          `${id}/${tube.name}: real open annular tube, no flat cap filling its mouth`);
      }
      const lowerTube=get('leo2a7v_xFrontalTube_9_0');
      const tubeBounds=new THREE.Box3().setFromPoints(vertices(lowerTube));
      near(tubeBounds.max.x-tubeBounds.min.x,.0960737,.001,
        `${id}: source tube diameter independent of row count`);
      near(tubeBounds.min.y,2.464594,.0015,`${id}: measured lower tube bank bottom`);
      near(tubeBounds.max.z,2.677997,.0015,`${id}: measured lower tube bank front extent`);
      near(ray(get('turretDetail'),[.8,4,2.85],[0,-1,0])?.y??NaN,2.5783193,.003,
        `${id}: actual broad inclined rack tray above the forward armor`);
      near(ray(get('turretDetail'),[.8,2.3,2.85],[0,1,0])?.y??NaN,2.5630257,.003,
        `${id}: rack tray is a thin skin with true underside air`);
      near(ray(body,[3,1.15,3.35],[-1,0,0])?.x??NaN,2,.004,
        `${id}: fourth source forward skirt module exists at full exposed width`);
      near(ray(body,[1.9,4,3.4],[0,-1,0])?.y??NaN,1.42004,.005,
        `${id}: source terminal skirt top, ahead of the three main modules`);
      near(ray(body,[1.9,0,3.5],[0,1,0])?.y??NaN,.97707,.012,
        `${id}: source terminal skirt rising lower edge`);
      near(sectionFloor(get('leo2a7v_xRecoveryCable_1'),-3.92),1.1222,.04,
        `${id}: real rear recovery cable reaches the source suspended stern envelope`);
      const weaponBounds=new THREE.Box3().setFromObject(roofGun);
      near(weaponBounds.min.z,-.455,.025,`${id}: source roof MG rear station`);
      near(weaponBounds.max.z,.92,.025,`${id}: source full-length roof MG muzzle`);
      near(weaponBounds.max.y,3.17,.02,`${id}: source roof MG silhouette elevation`);
      near(ray(get('turretDark'),[-1,4,0],[0,0,-1])?.z??NaN,-1.88403,.018,
        `${id}: source curved antenna rake at fixed height`);
      for(const x of [-.95,-.8,-.65]) near(ray(shell,[x,2.4,5],[0,0,-1])?.z??NaN,
        1.65004,.028,`${id}: source-fixed recessed optic rear wall x=${x}`);
      const pocket=ray(shell,[-.8,5,2.15],[0,-1,0]);
      assert.ok(pocket&&pocket.y<2.36,`${id}: real low floor beneath the open sight approach`);
      const neighbor=ray(shell,[-.5,2.4,5],[0,0,-1]);
      assert.ok(neighbor&&neighbor.z>2.32,`${id}: aperture is over .67 m deeper than adjacent armor`);
      const visible=[];
      tank.root.traverse(o=>{if(o.isMesh&&!/shadow/i.test(o.name)&&o.visible)visible.push(o);});
      const hits=new THREE.Raycaster(new THREE.Vector3(-.8,2.5,2.4),new THREE.Vector3(0,0,-1),0,.8).intersectObjects(visible,false);
      assert.ok(hits.length&&hits[0].point.z<1.73,`${id}: no glass decal or cover mesh fills the optic's exterior air`);
    }
    if(id==='leo2a6m_x') {
      for(const [z,y] of [[3.3,1.47173],[3.4,1.38043],[3.5,1.28914],[3.6,1.19784]])
        near(ray(body,[0,4,z],[0,-1,0])?.y??NaN,y,.003,`${id}: measured bow core support at z=${z}`);
      for(const [z,y] of [[3.3,1.48430],[3.4,1.39340],[3.5,1.30249]])
        near(ray(get('hullDetail'),[.40468,4,z],[0,-1,0])?.y??NaN,y,.002,
          `${id}: actual source upper/lower spare-link backing at z=${z}`);
      near(ray(body,[1.32,0,3.5],[0,1,0])?.y??NaN,1.37176,.0015,
        `${id}: true fender underside remains over exterior air, independent of the low central bow`);
      near(ray(get('hullRubber'),[1.32,4,3.8],[0,-1,0])?.y??NaN,1.27862,.002,
        `${id}: source folded front mudguard station`);
      for(const x of [-.81505,.83035])near(ray(get('hullGlass'),[x,1.3407,5],[0,0,-1])?.z??NaN,
        3.61059,.0015,`${id}: measured paired circular headlamp faces`);
      const sourceShoeBounds=instancedVertexBounds(shoes);
      near(sourceShoeBounds.min.y,0,.003,`${id}: source ground from actual moving shoe vertices`);
      near(sourceShoeBounds.max.y,1.36478,.010,`${id}: source high return envelope, not a road-wheel drape`);
      shoes.geometry.computeBoundingBox();
      near(shoes.geometry.boundingBox.max.y-shoes.geometry.boundingBox.min.y,.19449,.002,
        `${id}: source outer pad through inner guide depth, not a generic oversized shoe`);
      const returnRollers=get('gearReturnRollerTires');
      assert.ok(returnRollers.isInstancedMesh&&returnRollers.count===8,
        `${id}: four inferred native mechanical supports per side, not a floating high belt`);
      for(let i=0;i<returnRollers.count;i++) {
        returnRollers.getMatrixAt(i,matrix);
        const position=new THREE.Vector3().setFromMatrixPosition(matrix).applyMatrix4(returnRollers.matrixWorld);
        near(position.y+.105,1.27548,.006,`${id}: inferred roller crown seats at measured source broad-web plane`);
      }
      near(ray(get('hullDetail'),[0,4,-3.8],[0,-1,0])?.y??NaN,1.82361,.0015,
        `${id}: real source full-width rear top return skin`);
      near(ray(get('hullDetail'),[0,0,-3.8],[0,1,0])?.y??NaN,1.80415,.0015,
        `${id}: returned skin remains source-thin, not an invented deep stern apron`);
      const sourceCable=get('leo2a6m_xRecoveryCable_1');
      near(ray(sourceCable,[1.60965,4,-2.65],[0,-1,0])?.y??NaN,1.842,.006,
        `${id}: source high recovery cable extends forward along the rear deck`);
      near(ray(get('turretDark'),[-.9885,3,0],[0,0,-1])?.z??NaN,-1.86816,.0015,
        `${id}: actual slender source antenna shaft, not its wide foot`);
      near(ray(get('turretDetail'),[-.9885,2.58,0],[0,0,-1])?.z??NaN,-1.84127,.0018,
        `${id}: source antenna foot is a small seated cylinder`);
      const sourceRail=get('leo2a6m_xCrewHatchRail');
      assert.equal(sourceRail.parent,turret,`${id}: measured unarmed source rail remains turret-owned`);
      const railBox=new THREE.Box3().setFromObject(sourceRail);
      near(railBox.max.y,2.73974,.01,`${id}: measured crew rail top`);
      near(railBox.min.z,.50033,.012,`${id}: measured crew rail station`);
      for(const [z,y] of [[-.400,2.97555],[-.385,2.99083],[-.370,2.99741]])
        near(ray(get('turretDetail'),[-.2614,4,z],[0,-1,0])?.y??NaN,y,.003,
          `${id}: source panorama rear crown at fixed z=${z}`);
      near(ray(get('turretGlass'),[-.2614,2.91,0],[0,0,-1])?.z??NaN,-.16285,.0015,
        `${id}: source inset panorama optical plane, not protruding glass`);
      near(ray(get('turretDetail'),[-.36,2.91,0],[0,0,-1])?.z??NaN,-.15351,.0015,
        `${id}: source panorama front frame independently stands ahead of the pane`);
      const augmentationBox=new THREE.Box3().setFromObject(roofGun);
      near(augmentationBox.min.y,2.546,.004,`${id}: complete pintle foot directly seats on the actual roof`);
      near(ray(shell,[-.80,4,.12],[0,-1,0])?.y??NaN,augmentationBox.min.y,.005,
        `${id}: owner-required MG has a real roof carrier at its fixed station`);
      assert.ok(augmentationBox.max.y<2.78,`${id}: owner-required MG is low, not a source-inaccurate tall tower`);
      assert.ok(augmentationBox.max.z>.8&&augmentationBox.min.z<.05,`${id}: full forward-facing supported MG augmentation`);
      assert.ok(get('hullOpenLattice').geometry.getAttribute('position').count>500,`${id}: real thin hull slat bars exist`);
      const cageBraces=new THREE.Box3().setFromObject(get('hullOpenLatticeDark'));
      near(cageBraces.min.x,-1.99,.0005,`${id}: source cage brace remains inside actual negative outer width`);
      near(cageBraces.max.x,1.99,.0005,`${id}: source cage brace remains inside actual positive outer width`);
      assert.ok(get('turretOpenLattice').geometry.getAttribute('position').count>500,`${id}: independently yawing turret cage exists`);
      const visible=[];
      hull.traverse(o=>{if(o.isMesh&&!/shadow|track|wheel|gear/i.test(o.name))visible.push(o);});
      const hits=new THREE.Raycaster(new THREE.Vector3(1.88,4,-1.30),new THREE.Vector3(0,-1,0),0,5).intersectObjects(visible,false);
      assert.equal(hits.length,0,`${id}: stand-off space between cage and side armor is actual exterior air`);
    }
    if(id==='leo2a4m_x') {
      for(const [x,y] of [[.90,3.03976],[1.00,3.01360],[1.10,2.97733]])
        near(ray(get('turretDetail'),[x,4,-.90],[0,-1,0])?.y??NaN,y,.004,
          `${id}: source separate RWS outboard sloping body at x=${x}`);
      near(ray(get('turretDetail'),[.50,4,-.85],[0,-1,0])?.y??NaN,2.77643,.003,
        `${id}: measured full-width low RWS cradle is present independently of the MG`);
      near(ray(get('turretDark'),[-.954,3,0],[0,0,-1])?.z??NaN,-2.04698,.009,
        `${id}: source straight tapered antenna at fixed height`);
      const weaponBounds=new THREE.Box3().setFromObject(roofGun);
      near(weaponBounds.min.z,-1.214,.022,`${id}: source RWS receiver rear station`);
      near(weaponBounds.max.z,-.087,.022,`${id}: source RWS full barrel station`);
      near(weaponBounds.max.y,3.03048,.02,`${id}: source RWS receiver elevation`);
    }
    if(id==='leo2a5_x') {
      for(const side of [-1,1]) {
        const eye=get(`${id}BowTowEye_${side}`),bounds=new THREE.Box3().setFromPoints(vertices(eye));
        near(bounds.max.x-bounds.min.x,.09870,.0015,`${id}: source forged shackle transverse width`);
        near(bounds.min.y,1.04676,.006,`${id}: source hanging shackle lower envelope`);
        near(bounds.max.y,1.26149,.012,`${id}: source vertical shackle upper envelope`);
        near(bounds.max.z,3.95546,.002,`${id}: source actual forward shackle extent`);
        assert.equal(isOpenLatticeMesh(eye),false,`${id}: towing eye is still in the full continuity scan`);
        assert.ok(ray(eye,[side*.646,4,3.84],[0,-1,0]),
          `${id}: vertical forged bow shackle crosses the source top-down ray`);
        assert.equal(ray(eye,[3,1.151,3.855],[-1,0,0]),undefined,
          `${id}: source transverse eye opening is physical, not a filled block`);
      }
      for(const [z,y] of [[3.40,1.38614],[3.55,1.27006],[3.70,1.15456]])
        near(ray(body,[0,4,z],[0,-1,0])?.y??NaN,y,.004,
          `${id}: source descending central glacis at z=${z}`);
      near(ray(body,[1.3,4,3.55],[0,-1,0])?.y??NaN,1.3451,.003,
        `${id}: separate source front fender upper skin`);
      near(ray(body,[1.3,0,3.55],[0,1,0])?.y??NaN,1.32835,.003,
        `${id}: real air below the thin source fender, not a solid-wide bow`);
      for(const [z,y] of [[3.45,1.36654],[3.55,1.29125]])
        near(ray(get('hullDetail'),[.4055,4,z],[0,-1,0])?.y??NaN,y,.012,
          `${id}: source forward-raked spare-link backing at z=${z}`);
      near(ray(get('hullGlass'),[.8359,1.276,5],[0,0,-1])?.z??NaN,3.80062,.004,
        `${id}: measured low forward headlamp face`);
      near(ray(barrel,[.0238,0,3.35],[0,1,0])?.y??NaN,1.8619,.003,
        `${id}: source narrow rear evacuator collar is not missing below bore`);
      for(const z of [2.60,2.75])near(ray(barrel,[.024,0,z],[0,1,0])?.y??NaN,1.8486,.003,
        `${id}: source lower sleeve remains continuous at z=${z}, separate from the mantlet`);
      near(ray(barrel,[.0238,4,3.35],[0,-1,0])?.y??NaN,2.1276,.003,
        `${id}: actual source collar precedes the raised eccentric evacuator`);
      near(ray(barrel,[.0238,4,3.95],[0,-1,0])?.y??NaN,2.1913,.004,
        `${id}: source evacuator forward taper at fixed world station`);
      near(ray(barrel,[.0238,0,4.05],[0,1,0])?.y??NaN,1.8626,.004,
        `${id}: source forward collar remains concentric with the bore`);
      const shoeBounds=instancedVertexBounds(shoes);
      near(shoeBounds.min.z,-3.29343,.010,`${id}: source actual rear shoe envelope, separate from rim radius`);
      near(shoeBounds.max.z,3.81941,.010,`${id}: source actual front shoe envelope, unchanged idler axis`);
      near(shoeBounds.max.y,1.31448,.012,`${id}: source upper return shoe envelope`);
      near(shoeBounds.min.y,0,.003,`${id}: source ground contact from actual transformed shoe vertices`);
      for(const x of [-1.3,1.3]) near(ray(get('hullRubber'),[x,4,3.93],[0,-1,0])?.y??NaN,1.1707,.009,
        `${id}: source folded guard and outward face winding at x=${x}`);
      near(ray(barrel,[-1,1.998,5.985],[1,0,0])?.x??NaN,-.12749,.002,
        `${id}: actual source muzzle-reference box projects to negative X`);
      // The source main-hull island ends at -3.6927. The farther aft source
      // envelope is cable/marker geometry, not a broad solid armor apron.
      near(sectionFloor(body,-3.31677),.96975,.018,
        `${id}: actual main-hull island sloping stern underside`);
      assert.equal(sectionFloor(body,-3.71),Infinity,
        `${id}: no invented main armor behind the actual source stern`);
      near(sectionFloor(get('leo2a5_xRecoveryCable_1'),-3.71),1.3020,.04,
        `${id}: separate source recovery cable retains the aft envelope`);
      near(ray(get('hullDetail'),[.825,0,-1.77],[0,1,0])?.y??NaN,.41917,.009,
        `${id}: source inboard torsion housing is physical below the keel`);
      near(ray(get('turretDetail'),[-.49,4,-.37],[0,-1,0])?.y??NaN,2.7983,.007,
        `${id}: broad optic bearing ends below the narrow raised head`);
      near(ray(get('turretDetail'),[-.28,4,-.37],[0,-1,0])?.y??NaN,3.01667,.007,
        `${id}: actual source upper optic head elevation`);
      near(ray(get('turretDetail'),[-3,2.08,-1.21],[1,0,0])?.x??NaN,-1.39724,.009,
        `${id}: source asymmetric negative-side smoke tube station`);
      near(ray(get('turretDetail'),[-3,2.08,-.85],[1,0,0])?.x??NaN,-1.40530,.009,
        `${id}: source negative-side smoke-bank fan angle`);
      near(ray(get('turretDetail'),[-.962,2.70,0],[0,0,-1])?.z??NaN,-1.73477,.005,
        `${id}: source slender antenna neck, not a generic broad tower`);
      near(ray(get('turretDark'),[-.962,2.90,0],[0,0,-1])?.z??NaN,-1.76149,.003,
        `${id}: source antenna shaft at fixed height`);
      near(ray(body,[3,1.15,2],[-1,0,0])?.x??NaN,1.875,.009,
        `${id}: source full-width forward skirt is actual armor, not a bolt envelope`);
      near(ray(shell,[1.4,4,1],[0,-1,0])?.y??NaN,2.10588,.03,
        `${id}: arrowhead outer facet descends to the source edge, not a tall slab`);
      const weaponBounds=new THREE.Box3().setFromObject(roofGun);
      near(weaponBounds.min.z,-.437,.025,`${id}: source roof MG stock station`);
      near(weaponBounds.max.z,.820,.025,`${id}: source roof MG muzzle station`);
      near(weaponBounds.max.y,2.92573,.02,`${id}: source roof MG elevation`);
      // The source's separate 432-vertex basket island is a physical crew
      // carrier, not part of its exterior turret chin. Probe the real native
      // floor/side and full breech rather than a builder-authored receipt.
      const furniture=get('turretDetail');
      near(ray(furniture,[0,.5,.661],[0,1,0])?.y??NaN,.82029,.012,
        `${id}: actual rotating basket floor`);
      near(ray(furniture,[1.2,.95,.661],[-1,0,0])?.x??NaN,.98597,.015,
        `${id}: actual basket wall radius`);
      near(ray(furniture,[1.2,1.25,.661],[-1,0,0])?.x??NaN,-.28907,.015,
        `${id}: cardinal basket window remains open to interior divider`);
      near(ray(furniture,[.6,1.25,3],[0,0,-1])?.z??NaN,1.42921,.024,
        `${id}: source broad curved quadrant wall borders the basket window`);
      near(turret.position.z,.661,.004,`${id}: source basket-centered yaw axis`);
      near(gun.getWorldPosition(new THREE.Vector3()).z,1.659,.012,
        `${id}: source physical cross-trunnion station`);
      near(new THREE.Box3().setFromObject(barrel).min.z,-.0628,.022,
        `${id}: full rear breech travels with the cannon`);
      near(ray(barrel,[0,4,3.7],[0,-1,0])?.y??NaN,2.209,.035,
        `${id}: real offset bore evacuator profile`);
    }
  } finally { tank.dispose(); }
}

const authored=fs.readFileSync(new URL('./leopardX.ts',import.meta.url),'utf8');
assert.doesNotMatch(authored,/buildDonorVariant|buildCanonical|buildProfile\(|GLTFLoader|\.glb['"`]/,
  'X profiles contain no donor-family construction or source loading path');
console.log('leopardX.selftest: four source-fixed shells, real A7V optic air, bore/gear datums and articulation pass');
