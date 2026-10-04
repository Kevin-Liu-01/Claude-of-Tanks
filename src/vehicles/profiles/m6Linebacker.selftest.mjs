import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Vector3,Raycaster,Box3,Euler} from 'three';
import {createTank} from '../tankFactory.ts';
import {getSpec} from '../specs.ts';
import {tankTier} from '../tier.ts';
import {geometryHash,near} from '../../../tools/receipt-kit.test-support.mjs';
import {censusEquipment} from '../../../tools/source-equipment-policy.mjs';
import {LINEBACKER_MOUTHS,LINEBACKER_LAUNCHER as L} from '../m6LinebackerLayout.ts';
import {placeBradleyScoutCheekEra} from './bradleyScoutTurretShell.ts';
import {ensureInteriorFills,hasInteriorFills} from '../interiorFills.ts';
import {createEraGameplayRegistrationAudit} from '../eraGameplayRegistrationAudit.test-support.mjs';

const baseline=JSON.parse(readFileSync(new URL('./m6Linebacker.preservation.json',import.meta.url)));
const options={proceduralOnly:true,geometryReceipt:true,batchStatic:false,decor:false,camoSeed:4242};
for(const row of baseline.rows){
  const tank=createTank(row.id,null,{...options,quality:row.quality}),meshes=[];
  tank.root.traverse(o=>{if(o.geometry&&(row.scope==='all'||/^(hull|gear|track)/.test(o.name)))
    meshes.push([o.name,geometryHash(o.geometry),o.position.toArray(),o.quaternion.toArray(),o.scale.toArray()]);});
  const digest=createHash('sha256').update(JSON.stringify(meshes)).digest('hex');
  assert.equal(digest,row.sha256,`${row.id}/${row.quality}: preserved ${row.scope} from ${baseline.baseline}`);
  tank.dispose();
}
await ensureInteriorFills(['m6_linebacker','m3a3_bradley']);
for(const id of ['m6_linebacker','m3a3_bradley'])assert.ok(hasInteriorFills(id),`${id}: final interior geometry must be loaded before the opening/contact checks`);
const spec=getSpec('m6_linebacker');
assert.equal(tankTier(spec.id),10);
assert.equal(spec.name,'M6 Linebacker');
assert.equal(spec.gun.shells.filter(s=>s.guided).length,1);
const missile=spec.gun.shells.find(s=>s.guided);
assert.equal(missile.type,'HE','Stinger is fragmentation, not the Bradley donor’s anti-tank HEAT');
assert.equal(missile.launcherTubes,4);assert.equal(missile.count,12);
assert.ok(missile.pen100Mm<25,'no inherited TOW penetration');
assert.equal(spec.gun.launcherMuzzles.length,4);
assert.equal([...spec.armor.hullPlates,...spec.armor.turretPlates].some(p=>p.kind==='era'),false,
  'passive Linebacker armor must not grant protection from absent Bradley reactive arrays');
assert.equal(spec.armor.hullPlates.filter(p=>p.name.startsWith('linebacker_skirt_')&&p.kind==='spaced').length,6,
  'both three-section passive skirt assemblies retain their real spaced armor');
assert.ok(getSpec('m3a3_bradley').armor.hullPlates.some(p=>p.name==='m3a3_glacis_R'&&p.kind==='era'),
  'donor Bradley retains its actual reactive glacis');
near(L.halfWidth*2,.483,1e-6,'pod body reduced by 30 percent');
near(L.front-L.rear,1.218,1e-6,'pod length reduced by 30 percent');
for(const quality of ['high','low']){
  const tank=createTank(spec.id,null,{...options,quality});
  try{
    const root=tank.root,hull=root.getObjectByName('rig_hull'),turret=root.getObjectByName('rig_turret'),gun=root.getObjectByName('rig_gun');
    root.updateMatrixWorld(true);
    createEraGameplayRegistrationAudit().check(spec.id,tank);
    assert.equal(censusEquipment(root).mg,1,'one real remote M2, no inherited/random roof gun');
    const bounds=new Box3().setFromObject(root).getSize(new Vector3());
    near(bounds.x,4.178,.02,'complete cage width');near(bounds.z,6.59,.03,'retained Bradley hull length');
    let triangles=0;root.traverse(o=>{if(o.geometry)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.count??1);});
    assert.ok(triangles<110000,`${quality}: detailed Bradley budget, ${triangles} triangles`);
    const mesh=root.getObjectByName('turret');
    mesh.geometry.computeBoundingBox();
    near(mesh.geometry.boundingBox.max.x-mesh.geometry.boundingBox.min.x,2.68,.005,
      'broadened structural turret, independently of the launcher and decorations');
    const bay=new Raycaster(turret.localToWorld(new Vector3(0,.48,1.09)),new Vector3(0,0,-1),0,1.4).intersectObject(mesh)[0];
    assert.ok(bay,'closed rear wall behind elevation bay');
    assert.ok(turret.worldToLocal(bay.point.clone()).z<0,'no donor turret cap behind rocking mantlet');
    const mounting=root.getObjectByName('gunMount');
    assert.equal(mounting.parent,gun,'canister housing and mask share elevation');
    const stationaryTurret=[];
    turret.traverse(o=>{
      if(!o.isMesh||o.userData.shadowOnly||o.userData.authoredShadowProxy)return;
      for(let p=o;p&&p!==turret;p=p.parent)if(p===gun||!p.visible)return;
      stationaryTurret.push(o);
    });
    // The full inner wall of the pod stays outside the broadened turret and
    // its fitted equipment, including the upper rear corner at high elevation.
    for(const pitch of [-9,0,15,30,45]){
      gun.rotation.x=-pitch*Math.PI/180;root.updateMatrixWorld(true);
      for(const y of [L.y-L.halfWidth,L.y,L.y+L.halfWidth])for(const z of [L.rear-.028*L.scale,(L.rear+L.front)/2,L.front]){
        const inner=turret.worldToLocal(gun.localToWorld(new Vector3(L.x+L.halfWidth,y,z)));
        const from=turret.localToWorld(new Vector3(-3,inner.y,inner.z));
        const h=new Raycaster(from,new Vector3(1,0,0),0,6).intersectObjects(stationaryTurret,false)[0];
        if(h)assert.ok(turret.worldToLocal(h.point.clone()).x>inner.x+.01,
          `${quality}: pod clears stationary turret/equipment at ${pitch}, ${y}/${z}`);
      }
    }
    gun.rotation.x=0;root.updateMatrixWorld(true);
    // Probe the eight real optical channels through the entire visible model.
    // This catches painted-over glass, backward apertures, another sight in the
    // viewing path, and fittings accidentally assigned to the fixed hull.
    const optics=[
      [.58,1.255,.51,0],[.86,1.28,.51,0],[.86,1.15,.51,0],
      [.686,1.655,-.405,0],[.887,1.698,-.405,0],[.887,1.564,-.405,0],
      [-1.18,1.075,-.17,-Math.PI/2],[1.18,1.075,-.17,Math.PI/2],
    ];
    const visible=[];root.traverse(o=>{
      if(!o.isMesh||o.userData.shadowOnly||o.userData.authoredShadowProxy)return;
      for(let p=o;p;p=p.parent)if(!p.visible)return;
      visible.push(o);
    });
    for(const yaw of [0,-1.45,1.57]){
      turret.rotation.y=yaw;root.updateMatrixWorld(true);
      for(const [x,y,z,azimuth]of optics){
        const direction=new Vector3(Math.sin(azimuth),0,Math.cos(azimuth));
        const origin=turret.localToWorld(new Vector3(x,y,z).addScaledVector(direction,2));
        direction.transformDirection(turret.matrixWorld).negate();
        const hit=new Raycaster(origin,direction,0,2.1).intersectObjects(visible,false)[0];
        assert.ok(hit,`${quality}: optical channel at ${x}/${y}/${z} has glass`);
        assert.equal(hit.object.name,'turretGlass',
          `${quality}: optic ${x}/${y}/${z} first hits ${hit.object.name}`);
        near(hit.distance,2.043,.002,'lens visibly recessed 43 mm behind its metal rim');
        let owner=hit.object;while(owner&&owner!==turret)owner=owner.parent;
        assert.equal(owner,turret,'optical lens follows turret yaw');
      }
    }
    turret.rotation.y=0;root.updateMatrixWorld(true);
    const firingGeometry=[];gun.traverse(o=>{if(o.isMesh)firingGeometry.push(o);});
    for(const m of LINEBACKER_MOUTHS){
      const from=gun.localToWorld(new Vector3(m.x,m.y,m.z+.01));
      const hit=new Raycaster(from,new Vector3(0,0,-1),0,.3).intersectObjects(firingGeometry,false)[0];
      assert.ok(hit,'launcher recessed backstop exists');
      near(hit.distance,.21,.004,'launcher mouth remains open for 20 cm');
    }
    // Cage rails have real air between them; bounded rays stop before the armor.
    const hullMeshes=[];hull.traverse(o=>{if(o.isMesh)hullMeshes.push(o);});
    for(const side of [-1,1]){
      const ray=(y)=>new Raycaster(hull.localToWorld(new Vector3(side*2.22,y,-2.23)),new Vector3(-side,0,0),0,.18).intersectObjects(hullMeshes,false);
      assert.ok(ray(1.185).length,'cage rail stock');assert.equal(ray(1.25).length,0,'open cage bay');
    }
    const fixed=hull.matrixWorld.clone();
    let minimumRoofClearance=Infinity;
    // Lowest housing corners must clear actual hull/roof stock through the
    // entire rotation. Mouth alignment alone cannot expose this collision.
    for(let yaw=0;yaw<360;yaw+=15)for(const pitch of [-9,0,15,30,45]){
      turret.rotation.y=yaw*Math.PI/180;gun.rotation.x=-pitch*Math.PI/180;root.updateMatrixWorld(true);
      for(const x of [L.x-L.halfWidth,L.x,L.x+L.halfWidth])for(const z of [L.rear-.028*L.scale,(L.rear+L.front)/2,L.front]){
        const corner=gun.localToWorld(new Vector3(x,L.y-.3875*L.scale,z));
        const top=new Raycaster(corner.clone().add(new Vector3(0,4,0)),new Vector3(0,-1,0),0,8).intersectObjects(hullMeshes,false)[0];
        if(top){
          minimumRoofClearance=Math.min(minimumRoofClearance,corner.y-top.point.y);
          assert.ok(corner.y>top.point.y+.01,`${quality}: launcher must clear hull at yaw ${yaw}, pitch ${pitch}, corner ${x}/${z}: ${corner.y-top.point.y} m`);
        }
      }
    }
    console.log(`M6 ${quality}: minimum launcher-to-hull clearance ${(minimumRoofClearance*1000).toFixed(1)} mm across 120 poses.`);
    for(const yaw of [-1.45,0,1.57])for(const pitch of [-9,0,45]){
      turret.rotation.y=yaw;gun.rotation.x=-pitch*Math.PI/180;root.updateMatrixWorld(true);
      assert.ok(hull.matrixWorld.equals(fixed),'skirts remain hull-owned');
      LINEBACKER_MOUTHS.forEach((m,i)=>{
        const expected=gun.localToWorld(new Vector3(m.x,m.y,m.z));
        near(tank.gunMuzzleWorld(new Vector3(),i,true).distanceTo(expected),0,1e-6,'guided shot starts at its tube');
        assert.ok(expected.distanceTo(tank.gunMuzzleWorld(new Vector3()))>1,'missile never originates at main cannon');
      });
    }
  }finally{tank.dispose();}
  const scout=createTank('m3a3_bradley',null,{...options,quality});
  try{
    const turret=scout.root.getObjectByName('rig_turret');scout.root.updateMatrixWorld(true);
    const ray=new Raycaster(turret.localToWorld(new Vector3(-.06,.252,1.10)),new Vector3(0,0,-1),0,1.5);
    const hit=ray.intersectObject(scout.root.getObjectByName('turret'))[0];
    assert.ok(hit,'M3 rear bulkhead');assert.ok(turret.worldToLocal(hit.point.clone()).z<0,'M3 gun has an actual elevation cutout');
    const body=scout.root.getObjectByName('turret'),external=scout.root.getObjectByName('turretExternalArmor');
    for(const side of [-1,1]){
      const probes=[];
      placeBradleyScoutCheekEra(side,(x,y,z,rx,ry,rz)=>{
        const normal=new Vector3(0,0,1).applyEuler(new Euler(rx,ry,rz));
        const origin=turret.localToWorld(new Vector3(x,y-1.895,z+.36).addScaledVector(normal,.20));
        const probe=new Raycaster(origin,normal.negate(),0,.26);
        const backing=probe.intersectObject(body)[0],cassette=probe.intersectObject(external)[0];
        assert.ok(backing&&cassette,'each cheek cassette has visible stock and a real body backing');
        near(backing.distance,.23175,.008,'cassette back is seated within 8 mm of its sloped cheek');
        assert.ok(cassette.distance<backing.distance-.06,'cassette protrudes from the shell');
        probes.push({probe,distance:cassette.distance,backingDistance:backing.distance});
      });
      assert.ok(scout.stripEra(`m3a3_turret_cheek_${side>0?'R':'L'}`));
      for(const p of probes){
        const remaining=p.probe.intersectObject(external)[0];
        assert.ok(!remaining||remaining.distance>p.distance+.04,'spent ERA exposes its own backing');
        near(p.probe.intersectObject(body)[0].distance,p.backingDistance,1e-6,'permanent cheek survives the ERA hit');
      }
      scout.resetEra();
      for(const p of probes)near(p.probe.intersectObject(external)[0].distance,p.distance,1e-6,'round reset restores the cassette');
    }
  }finally{scout.dispose();}
}
console.log('M6/M3A3: preserved Bradley chassis and UA; open gun bays, four physical missile mouths, articulating launch origins, one M2 and real cage air pass.');
