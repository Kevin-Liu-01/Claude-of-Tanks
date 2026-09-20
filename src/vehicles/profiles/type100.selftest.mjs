import assert from 'node:assert/strict';
import * as T from 'three';
import { createTank } from '../tankFactory.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { TYPE100_PROFILES, TYPE100_DATUMS as D } from './type100.ts';
import { TANK_SPECS } from '../specs.ts';
import { tankTier } from '../tier.ts';
import { ensureInteriorFills } from '../interiorFills.ts';
import { createTankState } from '../../sim/movement.ts';
import { internalLayoutFor } from '../internalLayoutRegistry.ts';

const spec = TANK_SPECS.type100;
assert.equal(spec.name, 'Type 100 IFV'); assert.equal(spec.nation, 'China');
assert.equal(spec.role, 'ifv'); assert.equal(tankTier('type100'), 10);
assert.equal(spec.visual.scheme, 'digital'); assert.equal(spec.visual.number, 'LZ83');
assert.deepEqual(spec.armor.turretPivot, [0, 2.02, -.15]);
assert.deepEqual(spec.armor.gunPivot, [0, .53, .65]);
assert.equal(spec.gun.caliberMm, 30); assert.equal(spec.gun.shells[1].launcherTubes, 4);
assert.equal(spec.gun.shells[1].count, 8); assert.equal(spec.gun.launcherMuzzles.length, 4);
assert.deepEqual([spec.hp, spec.topSpeedKmh, spec.gun.shells[0].dmg], [2700, 76, 92]);
assert.deepEqual([spec.gunDepressionDeg, spec.gunElevationDeg], [10, 45]);
const layout = internalLayoutFor('type100');
assert.ok(layout.crew.every(c => c.frame === 'hull'));
assert.equal(layout.systems.engine.placement, 'front'); assert.equal(layout.systems.transmission.placement, 'front');
assert.equal(layout.systems.autoloader, null);

// Validate the generated finite damage shapes, not just authored box labels.
function damageBounds(shape) {
  if(shape.kind==='ellipsoid')return {min:shape.center.map((v,i)=>v-shape.radii[i]),max:shape.center.map((v,i)=>v+shape.radii[i])};
  assert.equal(shape.kind,'capsule');
  return {min:shape.a.map((v,i)=>Math.min(v,shape.b[i])-shape.radius),max:shape.a.map((v,i)=>Math.max(v,shape.b[i])+shape.radius)};
}
function separatedInternals(volumes) {
  const bounds=volumes.map(v=>{
    assert.ok(!v.turretLocal&&v.shapes.length,'hull crew/powerpack/storage have actual finite shapes');
    const parts=v.shapes.map(damageBounds);
    return {name:v.module??v.crew,min:[0,1,2].map(i=>Math.min(...parts.map(b=>b.min[i]))),max:[0,1,2].map(i=>Math.max(...parts.map(b=>b.max[i])))};
  });
  for(const b of bounds){
    assert.ok(b.min[0]>-1.05&&b.max[0]<1.05&&b.min[1]>.40&&b.max[1]<2&&b.min[2]>-3.3&&b.max[2]<2.52,`${b.name} inside closed hull prism`);
    if(b.max[2]>1.8)assert.ok(b.max[1]<2-(b.max[2]-1.8)*(.254/.72),'front module below actual glacis');
  }
  for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++){
    const a=bounds[i],b=bounds[j];
    assert.ok([0,1,2].some(k=>a.max[k]<b.min[k]||b.max[k]<a.min[k]),`${a.name}/${b.name} have a physical separating plane`);
  }
}
const internals=[...spec.armor.modules.filter(m=>['engine','transmission','ammoRack','fuelTank'].includes(m.module)),...spec.armor.crew];
assert.equal(internals.length,7);separatedInternals(internals);
const broken=structuredClone(internals),ammo=broken.find(m=>m.module==='ammoRack'),gunner=broken.find(m=>m.crew==='gunner');
ammo.shapes=structuredClone(gunner.shapes);
assert.throws(()=>separatedInternals(broken),assert.AssertionError,'ammo occupying a crew station must fail');

let pieces = [];
const double = new T.MeshBasicMaterial({ side: T.DoubleSide });
registerProfiledBuilders({ type100: p => TYPE100_PROFILES.type100.build(new Proxy(p, {
  get(target, key) {
    const value = target[key];
    if (['add', 'addEquipment', 'addExternalArmor', 'addHatch', 'addModuleVisual'].includes(key)) return (...args) => {
      const i = args.findIndex(a => a?.isBufferGeometry), g = args[i];
      if (g?.userData.type100) {
        const [x=0,y=0,z=0,rx=0,ry=0,rz=0] = args.slice(i+1);
        const mesh = new T.Mesh(g.clone(), double); mesh.position.set(x,y,z); mesh.rotation.set(rx,ry,rz); mesh.updateMatrixWorld(true);
        pieces.push({ name: g.userData.type100, bucket: args[i-1], mesh });
      }
      return value.apply(target,args);
    };
    return typeof value === 'function' ? value.bind(target) : value;
  },
})) });
function near(a,b,tol,label) { assert.ok(Number.isFinite(a) && Math.abs(a-b)<=tol, `${label}: ${a} vs ${b}`); }
function stock(name) { const a=pieces.filter(p=>p.name===name);assert.ok(a.length,`missing actual ${name}`);return a; }
function inside(mesh,p) {
  const ray=new T.Raycaster(new T.Vector3(...p),new T.Vector3(.376,.619,.690).normalize(),0,20);
  const hits=ray.intersectObject(mesh).map(h=>h.distance).filter((d,i,a)=>!i||d-a[i-1]>1e-6);
  return hits.length%2===1;
}
function joint(a,b,p,label) {assert.ok(stock(a).some(s=>inside(s.mesh,p))&&stock(b).some(s=>inside(s.mesh,p)),label);}
function visible(hit) { for(let n=hit.object;n;n=n.parent)if(!n.visible||n.userData.shadowOnly||n.userData.authoredShadowProxy)return false;return true; }
function cast(root,frame,o,d,far=4) {
  const ray=new T.Raycaster(frame.localToWorld(new T.Vector3(...o)),new T.Vector3(...d).transformDirection(frame.matrixWorld),0,far);
  return ray.intersectObject(root,true).find(visible);
}
function mouths(root,gun,recoil) {
  for(const x of D.launcherColumns)for(const y of D.launcherRows){
    const back=cast(root,gun,[x,y,1.025],[0,0,-1]);assert.ok(back,'physical cell backplate');
    near(gun.worldToLocal(back.point.clone()).z,-.5175,.001,'cell air to real rear plate');
    for(let i=0;i<8;i++){
      const a=(i+.173)*Math.PI/4;
      const rim=cast(root,gun,[x+Math.cos(a)*.128,y+Math.sin(a)*.128,1.02],[0,0,-1],.03);
      assert.ok(rim,'finite missile mouth annulus');near(gun.worldToLocal(rim.point.clone()).z,1,.001,'terminal plane');
      const side=cast(root,gun,[x,y,.1],[Math.cos(a),Math.sin(a),0],.15);
      assert.ok(side,'actual inward canister walls');const v=gun.worldToLocal(side.point.clone());
      near(Math.hypot(v.x-x,v.y-y),.115,.005,'canister bore including LOW chord');
    }
  }
  const bore=cast(root,recoil,[0,0,2.365],[0,0,-1],.3);assert.ok(bore);
  near(recoil.worldToLocal(bore.point.clone()).z,2.15,.001,'open 30 mm muzzle depth');
  assert.ok(cast(root,recoil,[.034,0,2.365],[0,0,-1],.03),'real barrel mouth annulus');
}
function clearShroud(root,gun) {
  // These pass entirely through two opposing side slots, above the tube.
  for(const z of [.44,.75,1.06,1.37,1.68]) { const hit=cast(root,gun,[-.15,.061,z],[1,0,0],.30); assert.ok(!hit,`shroud slot ${z}: blocked by ${hit?.object.name} at ${hit?.distance}`); }
}
function seats() {
  joint('turret-bearing','turret-body',[0,.052,-.40],'turret rests in finite bearing stock');
  assert.deepEqual(stock('turret-bearing')[0].mesh.position.toArray(),[0,.01,0],'bearing axis coincides with yaw axis');
  joint('side-armor','exhaust-recess',[1.80,1.67,1.25],'exhaust seated on forward armor');
  for(let i=0;i<4;i++) joint('exhaust-recess','exhaust-louvre',[1.815,1.61+.04*i,1.25],'exhaust louvers attach to recess');
  for(const side of [-1,1]) joint('hull-body','rear-mudflap',[side*1.4,1.312,-3.43],'rubber flap suspended from actual rear shoulder');
  joint('hull-body','ramp-gasket',[0,1.30,-3.626],'ramp frame seated on closed stern');
  joint('ramp-gasket','troop-ramp',[0,1.30,-3.65],'ramp panel joins its frame');
  joint('hull-body','driver-hatch',[-.87,1.998,1.12],'driver hatch seated on front-left deck');
  joint('turret-body','gunner-sight-seat',[-.48,.777,-.05],'gunner sight foot meets roof');
  joint('gunner-sight-seat','gunner-sight-frame',[-.48,.832,-.05],'optic housing on its foot');
  for(const x of D.launcherColumns) {
    joint('launcher-journal','launcher-saddle',[x-Math.sign(x)*.025,0,0],'launcher supported by real trunnion');
    joint('launcher-saddle','launcher-deck',[x,-.025,0],'launcher tray attached to saddle');
    joint('launcher-web','missile-canister',[x,.2595,.65],'lower cell attached to inter-cell web');
    joint('launcher-web','missile-canister',[x,.3005,.65],'upper cell attached to inter-cell web');
  }
}
function movingClearance(gun) {
  for(const p of pieces.filter(p=>p.bucket==='gunMount' && !['launcher-journal','launcher-saddle'].includes(p.name))) {
    const a=p.mesh.geometry.attributes.position;
    for(let i=0;i<a.count;i++){
      const world=new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(p.mesh.matrixWorld).applyMatrix4(gun.matrixWorld);
      assert.ok(world.y>2.085,`${p.name} clears highest deck furniture over full yaw: ${world.y}`);
    }
  }
}
function count(root) {
  let total=0;root.traverseVisible(m=>{if(!m.isMesh||m.userData.shadowOnly||m.userData.authoredShadowProxy)return;
    const mats=Array.isArray(m.material)?m.material:[m.material];if(mats.every(x=>x.colorWrite===false||x.visible===false))return;
    total+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3*(m.isInstancedMesh?m.count:1);
  });return total;
}
const result=[];
await ensureInteriorFills(['type100']);
for(const quality of ['high','low']) {
  pieces=[];const tank=createTank('type100',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
  tank.root.traverse(o=>{if(o.isLOD){o.autoUpdate=false;o.levels.forEach((l,i)=>l.object.visible=i===0);}});
  tank.root.traverse(o=>{if(o.isMesh)o.geometry.computeBoundingBox();});
  assert.equal(tank.root.userData.nightLightCoverage?.headlights,2,'both rebuilt headlights retain authored night emission');
  const state=createTankState(spec,new T.Vector3(),0);tank.syncFromState(state,1);tank.root.updateMatrixWorld(true);
  const gun=tank.root.getObjectByName('rig_gun'),recoil=tank.root.getObjectByName('rig_recoil');
  const hull=tank.root.getObjectByName('rig_hull'),turret=tank.root.getObjectByName('rig_turret');
  assert.equal(stock('missile-canister').length,4);assert.equal(stock('lower-skirt').length,12);
  assert.ok(!pieces.some(p=>p.name.startsWith('rws-')||p.name==='stern-grille'),'retired tank tower/rear engine absent');
  seats();mouths(tank.root,gun,recoil);clearShroud(tank.root,gun);
  const structural=stock('hull-body')[0].mesh;
  for(const p of [[0,1.5,-2.5],[0,1.5,0],[0,1.4,2.4],[1.45,1.5,-1]])assert.ok(inside(structural,p),'closed main hull volume');
  for(const p of [[1.4,.9,0],[-1.4,.9,0]])assert.ok(!inside(structural,p),'track lanes stay outside hull stock');
  // Missing/shifted support is detected, not merely a part-name census.
  const foot=stock('gunner-sight-seat')[0].mesh,oldY=foot.position.y;foot.position.y+=.20;foot.updateMatrixWorld(true);
  assert.throws(seats,assert.AssertionError,'floating optic negative control');foot.position.y=oldY;foot.updateMatrixWorld(true);
  const flap=stock('rear-mudflap')[0].mesh,flapY=flap.position.y;flap.position.y-=.30;flap.updateMatrixWorld(true);
  assert.throws(seats,assert.AssertionError,'detached mudflap negative');flap.position.y=flapY;flap.updateMatrixWorld(true);
  const mount=tank.root.getObjectByName('gunMount');mount.visible=false;
  assert.throws(()=>mouths(tank.root,gun,recoil),assert.AssertionError,'missing canister stock negative');mount.visible=true;
  const plug=new T.Mesh(new T.BoxGeometry(.28,.28,.03),double);plug.position.set(-1.18,.12,.98);gun.add(plug);tank.root.updateMatrixWorld(true);
  assert.throws(()=>mouths(tank.root,gun,recoil),assert.AssertionError,'capped launcher negative');gun.remove(plug);plug.geometry.dispose();
  let poses=0;
  for(const yaw of [-180,-90,0,90])for(const pitch of [-10,0,45]){
    state.turretYaw=yaw*Math.PI/180;state.gunPitch=pitch*Math.PI/180;tank.syncFromState(state,1);tank.root.updateMatrixWorld(true);
    mouths(tank.root,gun,recoil);clearShroud(tank.root,gun);movingClearance(gun);
    const before=mount.matrix.clone();tank.recoilKick(0,1);tank.syncFromState(state,.12);tank.root.updateMatrixWorld(true);
    assert.ok(recoil.position.z<-.005,'autocannon recoils');assert.deepEqual(mount.matrix.elements,before.elements,'launchers and shroud do not recoil');
    mouths(tank.root,gun,recoil);clearShroud(tank.root,gun);poses+=2;
  }
  tank.syncFromState(state,2);tank.root.updateMatrixWorld(true);
  for(let i=0;i<4;i++){tank.recoilKick(0,1,i,true);tank.syncFromState(state,.12);near(recoil.position.z,0,1e-6,'guided launch does not recoil cannon');}
  // The frame transform, not a hardcoded world coordinate, drives each launch point.
  for(let i=0;i<4;i++){const tip=tank.root.getObjectByName(`rig_launcher_tip_${i}`);assert.ok(tip,`physical launch anchor ${i}`);assert.equal(tip.parent,gun);near(tip.position.distanceTo(new T.Vector3(spec.gun.launcherMuzzles[i].x,spec.gun.launcherMuzzles[i].y,spec.gun.launcherMuzzles[i].z)),0,1e-9,'declared launch position');}
  state.turretYaw=0;state.gunPitch=0;tank.syncFromState(state,2);tank.root.updateMatrixWorld(true);
  const triangles=count(tank.root);assert.ok(triangles<=(quality==='high'?80000:55000),`${quality} whole-scene budget ${triangles}`);
  result.push({quality,triangles,poses,negatives:4});tank.dispose();for(const p of pieces)p.mesh.geometry.dispose();
}
assert.ok(result[1].triangles<=result[0].triangles*.75,'LOW costs at most75% of HIGH');
console.log('Type100: original Chinese IFV, finite seats/air, closed hull, full legal articulation, recoil, HIGH/LOW budget PASS',JSON.stringify(result));
