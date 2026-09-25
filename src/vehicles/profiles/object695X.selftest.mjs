// 2026-09-22 round 35 (camoWorldScale.ts): every hull projects its camo at the fleet constant 0.5 repeats/m, so the uv attributes
// inside these frozen native buffers moved; the digests below are re-based on the round-35 staged tree (positions, order and frames unchanged).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as T from 'three';
import { createTank } from '../tankFactory.ts';
import { ensureInteriorFills } from '../interiorFills.ts';
import { createTankState } from '../../sim/movement.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { OBJECT695_X_PROFILES, OBJECT695_X_DATUMS as D } from './object695X.ts';
import { TANK_SPECS, MODEL_SOURCE } from '../specs.ts';
import { tankTier } from '../tier.ts';
import { verifyGunCradleSeats } from '../gunCradleSeats.test-support.mjs';

// Original concept, not a supplied-source or historical turret claim. The
// 2026-09-19 pre-redesign HIGH/LOW chassis payloads authenticate unchanged stock.
// 2026-09-22 nation wheel standard: object695_x draws the BMP-3M Dragun wheel (no dark inset layer, so 24 payload
// rows) and the fleet arm re-seats against that wheel's back; the payload diff against origin/main 14a3262ec is
// exactly the two road-wheel geometries, the dropped inset layer and the arm/boss instance matrices. Repinned.
const hullHashes = {
  high: '043bf6933e2cc6a3744a406294a395fa8b7d160e8db315db96f3c8367878a521',
  low: 'b38d7f9866782dc09c793252663956108368f4e1e9b3f9d3331904bec2738e20',
};
const profileSource = readFileSync(new URL('./object695X.ts', import.meta.url), 'utf8');
assert.ok(!profileSource.includes('epokhaTurret'), 'the counterpart turret is not assembled');
assert.deepEqual([...profileSource.matchAll(/^import .* from '([^']+)';$/gm)].map(m => m[1]).sort(),
  ['../profileBuilderAdapter.ts', '../tankFactoryCore.ts', '../vehicleNightLighting.ts', './kit.ts', './object695MissileTurret.ts', './sectionSolid.ts', 'three']);
const record = JSON.parse(readFileSync(new URL('../../../docs/references/tanks/object695_x.source-measurements.json', import.meta.url), 'utf8'));
const spec = TANK_SPECS.object695_x;
assert.equal(spec.name, 'Object 695'); assert.equal(spec.role, 'ifv'); assert.equal(tankTier(spec.id), 10);
assert.equal(MODEL_SOURCE.object695_x.source, 'procedural');
assert.equal(spec.gun.caliberMm, 30);
assert.deepEqual(spec.armor.turretPivot, [0, 2.15, -1.10]);
assert.deepEqual(spec.armor.gunPivot, [0, .88, .20]);
assert.equal(spec.armor.gunBarrel.lengthM, 1.35);
assert.equal(spec.gunDepressionDeg, 8); assert.equal(spec.gunElevationDeg, 35);
assert.deepEqual(spec.gun.shells.filter(s => s.guided).map(s => [s.name, s.launcherTubes]), [['9M-695 Tandem', 12], ['9M-695 Blast', 12]]);
assert(spec.gun.shells.filter(s => s.guided).every(s => s.count >= 12));
const backupIndex = spec.gun.shells.findIndex(s => s.name === '30 mm APFSDS-T');
assert(backupIndex >= 0 && !spec.gun.shells[backupIndex].guided);
assert.equal(spec.gun.shells[backupIndex].caliberMm, 30);
assert.deepEqual([...D.wheelStations], record.roadWheels.stationsZM);
assert.deepEqual(D.turretPivot, record.turretPivotM);
assert.equal(D.wheelR, record.roadWheels.radiusM);
assert.equal(D.muzzleZ, .45); assert.equal(D.launcherTopM, 3.719); assert.equal(D.mastTopM, 3.90);

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const bufferHash = a => sha(Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength));
function checkRadioVolume(armor) {
  const radios = armor.modules.filter(module => module.module === 'radio');
  assert.equal(radios.length, 1, 'the hull-operated radio remains a real damage module');
  const radio = radios[0];
  assert.equal(radio.turretLocal, false, 'radio stays with the hull crew when the launcher traverses');
  assert.notEqual(radio.external, true, 'an internal radio cannot evade depth/enclosure checks');
  assert(radio.max.every((value, axis) => value - radio.min[axis] >= .25),
    'radio has a volumetric equipment case, not the former 33.1875 mm calibrated sliver');
  assert(radio.shapes?.length, 'radio retains actual precise damage shapes');
  const fuel = armor.modules.find(module => module.module === 'fuelTank');
  const commander = armor.crew.find(crew => crew.crew === 'commander');
  assert(radio.min[1] > fuel.max[1] + .05, 'radio case clears the fuel cells below');
  assert(radio.max[2] < commander.min[2] - .10, 'radio sits aft of the operator station');
  for (const u of [0, .5, 1]) for (const v of [0, .5, 1]) for (const w of [0, .5, 1]) {
    const point = [u, v, w].map((t, axis) => radio.min[axis] + t * (radio.max[axis] - radio.min[axis]));
    assert(armor.collisionShells.hull.some(cell => cell.faces.every(face =>
      face.normal.reduce((sum, value, axis) => sum + value * point[axis], face.constant) <= 1e-6)),
    'all 27 radio case samples lie inside the actual calibrated hull cells');
  }
  // Match the unchanged release minimum for every actual internal volume.
  for (const volume of [...armor.modules, ...armor.crew]) {
    if (volume.external || ['trackL', 'trackR', 'optics', 'turretRing', 'gunMount'].includes(volume.module)) continue;
    for (const shape of volume.parts?.length ? volume.parts : [volume]) {
      assert(shape.max.every((value, axis) => value - shape.min[axis] >= .05),
        `${volume.module ?? volume.crew}: actual internal depth meets the release floor`);
    }
  }
  return { min: radio.min, max: radio.max, turretLocal: radio.turretLocal, samples: 27 };
}
const radioReceipt = checkRadioVolume(spec.armor);
for (const corruption of ['missing', 'thin', 'wrong-frame', 'outside-hull']) {
  const armor = structuredClone(spec.armor), radio = armor.modules.find(module => module.module === 'radio');
  if (corruption === 'missing') armor.modules = armor.modules.filter(module => module.module !== 'radio');
  if (corruption === 'thin') radio.max[1] = radio.min[1] + .0331875;
  if (corruption === 'wrong-frame') radio.turretLocal = true;
  if (corruption === 'outside-hull') { radio.min[0] += 4; radio.max[0] += 4; }
  assert.throws(() => checkRadioVolume(armor), assert.AssertionError, `${corruption}: bad radio placement fails`);
}
console.log('Object radio depth/owner/hull enclosure and four negatives PASS', JSON.stringify(radioReceipt));
function hullPayload(tank) {
  const meshes = [];
  tank.root.traverseVisible(m => {
    if (!m.isMesh || m.userData.shadowOnly || m.userData.authoredShadowProxy || m.userData.vehicleMarking || m.name.includes('InteriorFill')) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (mats.every(a => a.visible === false || a.colorWrite === false)) return;
    let owner = ''; for (let p = m; p; p = p.parent) if (['rig_hull', 'rig_turret'].includes(p.name)) owner = p.name;
    if (owner !== 'rig_hull') return;
    const g = m.geometry;
    meshes.push({name:m.name,owner,attrs:Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,{itemSize:a.itemSize,normalized:a.normalized,hash:bufferHash(a)}])),
      index:g.index?bufferHash(g.index):null,groups:g.groups,matrix:m.matrixWorld.toArray(),count:m.count,
      instances:m.instanceMatrix?sha(Buffer.from(m.instanceMatrix.array.buffer)):null,
      colors:m.instanceColor?sha(Buffer.from(m.instanceColor.array.buffer)):null,
      mats:mats.map(a=>({name:a.name,color:a.color?.getHex(),roughness:a.roughness,metalness:a.metalness,side:a.side,userData:a.userData}))});
  });
  return meshes;
}

function cast(tank, frame, start, direction, far = 2) {
  tank.root.updateMatrixWorld(true);
  const ray = new T.Raycaster(frame.localToWorld(new T.Vector3(...start)), new T.Vector3(...direction).transformDirection(frame.matrixWorld), 0, far);
  // Conservative finite-mesh broad phase keeps complete-scene first hits,
  // without ray-testing every road-wheel/shoe triangle above the roof.
  const candidates=[],box=new T.Box3();
  tank.root.traverseVisible(m=>{
    if(!m.isMesh||m.userData.shadowOnly)return;
    if(m.isInstancedMesh){if(!m.boundingBox)m.computeBoundingBox();box.copy(m.boundingBox);}
    else{if(!m.geometry.boundingBox)m.geometry.computeBoundingBox();box.copy(m.geometry.boundingBox);}
    box.applyMatrix4(m.matrixWorld);
    if(ray.ray.intersectsBox(box))candidates.push(m);
  });
  return ray.intersectObjects(candidates,false).find(hit=>{
    const mat=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;
    return mat.visible!==false&&mat.colorWrite!==false;
  });
}
function firstCoordinate(tank, frame, start, direction, axis, expected, far = 2) {
  const hit = cast(tank, frame, start, direction, far);
  assert(hit, `missing actual stock at ${start}`);
  const actual = frame.worldToLocal(hit.point.clone())[axis];
  assert(Math.abs(actual - expected) < .001, `${start}: ${axis}=${actual}, expected ${expected}`);
  return hit;
}
function withObstruction(tank, frame, mesh, check) {
  frame.add(mesh); tank.root.updateMatrixWorld(true);
  try { assert.throws(check, assert.AssertionError); }
  finally {frame.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();tank.root.updateMatrixWorld(true);}
}
function checkLaunchStock(tank) {
  const gun = tank.root.getObjectByName('rig_gun');
  for (const center of [-1.10, 1.10]) for (const dx of [-.285, 0, .285]) for (const y of [.25, .55]) {
    const x = center + dx;
    const hit = firstCoordinate(tank, gun, [x, y, 1.05], [0,0,-1], 'z', .729, .40);
    assert.equal(hit.object.name, 'gunMountDark', 'sealed terminal is real non-recoiling stock');
    firstCoordinate(tank, gun, [x + .12, y, 1.05], [0,0,-1], 'z', .82, .40);
  }
  // Complete scene must preserve the central sight corridor and under-cradle
  // air. A plate or broad fill added between the pods fails these finite rays.
  assert(!cast(tank, gun, [0,.40,-.50],[0,0,1],.95), 'air between launch pods');
  assert(!cast(tank, gun, [-.62,-.30,.45],[1,0,0],1.24), 'air below launch yokes');
  firstCoordinate(tank, gun, [1.10,-.30,-.50],[0,1,0],'y',.126,.60);
  // These finite side gaps are outside the nearest cylindrical tube, between
  // the actual front/rear frame stations. Composite fill spans must not turn
  // the open launcher into a rectangular casing.
  for(const side of [-1,1])for(const z of [-.20,.10,.25]){
    assert(!cast(tank,gun,[side*.60,.43,z],[side,0,0],.16),'real side gap beside upper launcher cells');
    firstCoordinate(tank,gun,[side*.60,.25,z],[side,0,0],'x',side*.691,.3);
  }
}
function checkFixedStock(tank) {
  const turret = tank.root.getObjectByName('rig_turret');
  for (const side of [-1, 1]) {
    firstCoordinate(tank,turret,[side*.47,.55,.8],[0,0,-1],'z',.33,.65);
    firstCoordinate(tank,turret,[side*.64,.50,-.2],[0,-1,0],'y',.32,.22);
    firstCoordinate(tank,turret,[side*.47,.50,-.04],[0,-1,0],'y',.3855,.22);
    firstCoordinate(tank,turret,[side*.47,.30,-.04],[0,1,0],'y',.3105,.08);
  }
  for (const [x,y,z] of [[0,1.60,-.497],[-.47,.76,.598],[.47,.755,.598]]) {
    const hit=firstCoordinate(tank,turret,[x,y,z+.20],[0,0,-1],'z',z,.25);
    assert.equal(hit.object.name,'turretGlass','actual unobscured optical surface');
  }
  assert.equal(tank.root.userData.combatGeometryParts.filter(p=>p.module==='optics'&&p.parent==='turretG').length,3);
  assert.equal(tank.root.userData.combatGeometryParts.filter(p=>p.module==='machineGun').length,0);
  assert.equal(tank.root.userData.combatGeometryParts.filter(p=>p.module==='missileRack'&&p.parent==='gunG').length,12,'actual individual tube bodies own the damage receipt');
}
function checkCannon(tank) {
  const recoil=tank.root.getObjectByName('rig_recoil');
  const verify=()=>firstCoordinate(tank,recoil,[0,0,1.40],[0,0,-1],'z',1.15,.3);
  verify();firstCoordinate(tank,recoil,[.025,0,1.40],[0,0,-1],'z',1.35,.1);
  const cap=new T.Mesh(new T.CircleGeometry(.04,20),new T.MeshBasicMaterial());cap.position.z=1.35;
  withObstruction(tank,recoil,cap,verify);
}
function checkNegativeControls(tank) {
  const gun=tank.root.getObjectByName('rig_gun');
  const dark=gun.getObjectByName('gunMountDark'), saved=dark.position.z;
  dark.position.z+=.035;
  try {assert.throws(()=>checkLaunchStock(tank),assert.AssertionError,'shifted launch terminals must fail');}
  finally {dark.position.z=saved;tank.root.updateMatrixWorld(true);}
  dark.visible=false;
  try {assert.throws(()=>checkLaunchStock(tank),assert.AssertionError,'missing actual terminals must fail');}
  finally {dark.visible=true;}
  const bridge=new T.Mesh(new T.BoxGeometry(.9,.3,.12),new T.MeshBasicMaterial());bridge.position.set(0,.4,.1);
  withObstruction(tank,gun,bridge,()=>checkLaunchStock(tank));
  const sideFill=new T.Mesh(new T.BoxGeometry(.06,.03,.08),new T.MeshBasicMaterial());sideFill.position.set(.70,.43,.10);
  withObstruction(tank,gun,sideFill,()=>checkLaunchStock(tank));
  const glass=tank.root.getObjectByName('turretGlass');glass.visible=false;
  try {assert.throws(()=>checkFixedStock(tank),assert.AssertionError,'missing actual optics must fail');}
  finally {glass.visible=true;tank.root.updateMatrixWorld(true);}
  const supports=tank.root.getObjectByName('turretEquipment');supports.visible=false;
  try {assert.throws(()=>verifyGunCradleSeats(tank.root),assert.AssertionError,'invisible fixed support stock cannot seat the moving carrier');}
  finally {supports.visible=true;tank.root.updateMatrixWorld(true);}
}
function checkRackClearance(tank, yaw, pitch) {
  // Exact triangle/closed-box tests against the unchanged tall rear rack and
  // rear deck fittings. The primary hull roof bound alone misses this stock.
  const hull=tank.root.getObjectByName('rig_hull');
  const inverse=hull.matrixWorld.clone().invert(), triangle=new T.Triangle(), bounds=new T.Box3();
  const fixed=parts.filter(p=>/^rear-rack-|^rear-right-box|^rear-roof-post/.test(p.part))
    .map(p=>({name:p.part,box:new T.Box3(new T.Vector3(...p.min),new T.Vector3(...p.max))}));
  for(const name of ['gunMount','gunMountDark','gun']){
    const mesh=tank.root.getObjectByName(name);if(!mesh)continue;
    const matrix=inverse.clone().multiply(mesh.matrixWorld),g=mesh.geometry,a=g.attributes.position;
    for(let i=0;i<(g.index?.count??a.count);i+=3){
      for(const [j,v] of [[0,triangle.a],[1,triangle.b],[2,triangle.c]])v.fromBufferAttribute(a,g.index?g.index.getX(i+j):i+j).applyMatrix4(matrix);
      bounds.setFromPoints([triangle.a,triangle.b,triangle.c]);
      for(const receiving of fixed)assert(!receiving.box.intersectsBox(bounds)||!receiving.box.intersectsTriangle(triangle),`${name} cuts retained ${receiving.name} at yaw=${yaw},pitch=${pitch}: ${JSON.stringify([triangle.a.toArray(),triangle.b.toArray(),triangle.c.toArray()])}`);
    }
  }
}

function checkArticulation(tank) {
  const state=createTankState(spec,new T.Vector3(),0),gun=tank.root.getObjectByName('rig_gun');
  const turret=tank.root.getObjectByName('rig_turret'),cradle=gun.getObjectByName('gunMount'),recoil=tank.root.getObjectByName('rig_recoil');
  assert(cradle.parent===gun,'actual carrier pitches independently from recoil');
  console.log('Checking installed poses',tank.root.userData.quality);
  for (const yaw of Array.from({length:24},(_,i)=>(i*15-180)*Math.PI/180)) for (const degrees of [-8,0,35]) {
    state.turretYaw=yaw;state.gunPitch=degrees*Math.PI/180;tank.syncFromState(state,1);tank.root.updateMatrixWorld(true);
    assert(Math.abs(turret.rotation.y-yaw)<1e-8);assert(Math.abs(gun.rotation.x+state.gunPitch)<1e-8);
    const receiving = verifyGunCradleSeats(tank.root);
    assert.equal(receiving?.rays, 18, 'both finite fixed support columns reach the actual moving crossbeam');
    checkLaunchStock(tank);checkRackClearance(tank,yaw,degrees);
    // Pod rear lower edge stays above the old hull's highest roof at all
    // legal poses. This checks actual installed mesh, not a receipt radius.
    const mountedBounds=new T.Box3().setFromObject(cradle);assert(mountedBounds.min.y>2.19,'moving carrier clears fixed hull roof');
    const stationary=cradle.position.clone(), rest=recoil.position.z;
    const centers=[-1.10,1.10].flatMap(x=>[-.285,0,.285].flatMap(dx=>[.25,.55].map(y=>[x+dx,y,.82])));
    for(let i=0;i<12;i++){
      assert(tank.gunMuzzleWorld(new T.Vector3(),i,true).distanceTo(gun.localToWorld(new T.Vector3(...centers[i])))<1e-6,'guided anchor matches actual rim axis');
      tank.recoilKick(0,.35,i,true);tank.syncFromState(state,.035);
      assert(Math.abs(recoil.position.z-rest)<1e-8,'guided launch never recoils backup cannon');
    }
    assert(tank.gunMuzzleWorld(new T.Vector3(),0,false).distanceTo(recoil.localToWorld(new T.Vector3(0,0,1.35)))<1e-6);
    tank.recoilKick(0,.35,undefined,false);tank.syncFromState(state,.035);tank.root.updateMatrixWorld(true);
    assert(recoil.position.z<rest-.01,'backup cannon physically recoils');
    assert(cradle.position.distanceTo(stationary)<1e-8,'launch carrier does not inherit recoil');
    tank.syncFromState(state,1);assert(Math.abs(recoil.position.z-rest)<1e-6);
  }
  state.turretYaw=0;state.gunPitch=0;tank.syncFromState(state,1);tank.root.updateMatrixWorld(true);
}

const parts=[];
let supportFault = null, alteredSupports = 0;
registerProfiledBuilders({object695_x:P=>OBJECT695_X_PROFILES.object695_x.build(new Proxy(P,{get(target,key){
  if(['add','addEquipment','addExternalArmor','addCupola','addGunExtra','addGunExtraDark','addModuleVisual'].includes(key))return(...args)=>{
    const geometry=args.find(a=>a&&a.isBufferGeometry);
    const fitting = geometry?.userData.object695Concept;
    if (supportFault && ((supportFault === 'missing-foot' && fitting === 'support-foot')
      || (supportFault === 'missing-tower' && fitting === 'support-tower')
      || (supportFault === 'missing-crossbeam' && fitting === 'pivot-crossbeam'))) {
      alteredSupports++; geometry.dispose(); return;
    }
    if (supportFault === 'shifted-tower' && fitting === 'support-tower') {
      alteredSupports++; geometry.translate(0, .20, 0);
    }
    if (supportFault === 'thin-tower' && fitting === 'support-tower') {
      alteredSupports++; geometry.scale(.05, 1, .05);
    }
    if(geometry?.userData.object695){geometry.computeBoundingBox();const b=geometry.boundingBox;const [x=0,y=0,z=0]=args.filter(a=>typeof a==='number');parts.push({part:geometry.userData.object695,min:[b.min.x+x,b.min.y+y,b.min.z+z],max:[b.max.x+x,b.max.y+y,b.max.z+z]});}
    return target[key](...args);
  };
  const value=target[key];return typeof value==='function'?value.bind(target):value;
}}))});
if(!process.argv.includes('--cold'))await ensureInteriorFills(['object695_x']);
const costs=[];
for(const quality of ['high','low']){
  parts.length=0;
  const tank=createTank(spec.id,null,{proceduralOnly:true,geometryReceipt:true,quality,batchStatic:false,camoSeed:4242});
  try{
    tank.root.updateMatrixWorld(true);
    const count=part=>parts.filter(p=>p.part===part).length,one=part=>parts.find(p=>p.part===part);
    const body = one('hull-body');
    assert.equal(count('hull-body'), 1, 'the hull is one station loft');
    assert.ok(body.min[2] <= -3.45 && body.max[2] >= 3.57, 'stern plate to nose');
    assert.ok(Math.abs(body.max[1] - 2.19) < 1e-6, 'the rear roof is the highest hull plane');
    assert.ok(body.min[1] >= 0.55, 'the belly clears the ground datum');
    assert.equal(count('side-module'), 14, 'seven side armour modules a side');
    assert.ok(Math.abs(Math.max(...parts.filter((p) => p.part === 'module-front-chamfer').map((p) => p.max[2])) - 3.40) < 1e-6, 'the prow apex reaches the measured z 3.40');
    const modules = parts.filter((p) => p.part === 'side-module');
    assert.ok(Math.abs(Math.max(...modules.map((p) => p.max[0])) - 1.99) < 1e-6, 'modules out to the measured 1.99');
    assert.ok(Math.abs(Math.min(...modules.map((p) => p.min[1])) - 0.80) < 1e-6 && Math.abs(Math.max(...modules.map((p) => p.max[1])) - 1.95) < 1e-6, 'module band y 0.80–1.95');
    assert.equal(count('module-rear-chamfer'), 2); assert.equal(count('module-front-chamfer'), 4, 'two prow wedges a side'); assert.equal(count('mudguard'), 4); assert.equal(count('ring-fitting'), 2);
    assert.equal(count('ramp-door'), 1, 'the ramp is closed'); assert.equal(count('stern-box'), 2); assert.equal(count('rear-roof-hatch'), 1); assert.equal(count('rear-roof-post'), 2); assert.equal(count('rear-right-box'), 1); assert.equal(count('rear-rack-lid'), 1); assert.equal(count('rear-rack-post'), 4);
    // 2026-09-18: the boxes end at the source's stern SILHOUETTE (z −3.56; the record's −3.60 is their outermost fitting) so the
    // geometry gate's body-extent law reads the same hull length as the source (dims 87.1 → 96.7)
    const sternBoxAft = Math.min(...parts.filter((p) => p.part === 'stern-box').map((p) => p.min[2]));
    assert.ok(sternBoxAft <= -3.55 && sternBoxAft >= -3.575, `stern boxes end at the source's stern silhouette (${sternBoxAft.toFixed(3)})`);
    assert.equal(count('driver-hatch'), 1); assert.equal(count('lamp-box'), 2); assert.equal(count('tow-eye'), 4); assert.equal(count('intake-drum'), 1);
    assert.equal(count('smoke-tube'), 10); assert.equal(count('deck-louvre'), 1); assert.equal(count('nose-lip'), 1);
    const payload=hullPayload(tank);
    assert.equal(payload.length,26); // 2026-09-25 FSP-03: +2 instanced return-roller layers (tires, discs) — four rollers per side fitted
    assert.equal(sha(JSON.stringify(payload)),hullHashes[quality],'every retained native hull/gear attribute, material, instance and transform is exact');
    console.log('Checking source-independent stock',quality);
    checkLaunchStock(tank);console.log('Launcher stock PASS');checkFixedStock(tank);console.log('Fixed stock PASS');checkCannon(tank);console.log('Cannon PASS');checkNegativeControls(tank);console.log('Negatives PASS');checkArticulation(tank);
    const rig=tank.root.getObjectByName('rig_hull').userData.object695Receipt;
    assert.equal(rig.architecture,'object695-missile-hunter-concept');assert.equal(rig.physicalLauncherTubes,12);
    assert.deepEqual(rig.launcherTubesByWeapon,{'9M-695 Tandem':12,'9M-695 Blast':12});
    const gear=tank.root.getObjectByName('rig_hull').userData.runningGearReceipts.at(-1);
    assert.deepEqual(gear.wheelZs,[...D.wheelStations]);assert.equal(gear.wheelR,D.wheelR);assert.equal(gear.trackTh,.028);
    let triangles=0,turretTriangles=0,meshes=0;
    tank.root.traverseVisible(m=>{if(!m.isMesh||m.userData.shadowOnly)return;const mats=Array.isArray(m.material)?m.material:[m.material];if(mats.every(a=>a.visible===false||a.colorWrite===false))return;const n=Math.min(m.geometry.index?.count??m.geometry.attributes.position.count,m.geometry.drawRange.count)/3*(m.isInstancedMesh?m.count:1);triangles+=n;meshes++;for(let p=m;p;p=p.parent)if(p.name==='rig_turret')turretTriangles+=n;});
    // 2026-09-22 nation wheel standard: the fourteen road wheels draw the BMP-3M Dragun construction (1728/944 tri per
    // wheel instead of the generic 704/480, +14336 HIGH / +6496 LOW); the filled-cost ceiling re-pins to the measured
    // 96482 / 81232 model (nothing else grew; the old ceilings kept their 160 cold-run margin).
    assert(triangles<=(quality==='high'?(process.argv.includes('--cold')?96506:96666):(process.argv.includes('--cold')?81072:81232)), // 2026-09-25 FSP-03: +184 HIGH for the four fitted return rollers per side
    `new complete model ${triangles}tri (turret ${turretTriangles}) does not exceed its prior filled cost`);
    const bounds=new T.Box3().setFromObject(tank.root);
    assert(bounds.min.x>=-2.01&&bounds.max.x<=2.01);assert(bounds.max.z<=3.67);assert(Math.abs(bounds.max.y-3.90)<.002);
    costs.push({quality,triangles,turretTriangles,meshes,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},filled:tank.root.userData.interiorFillRecordLoaded??!process.argv.includes('--cold')});
  }finally{tank.dispose();}
}
for (const quality of ['high', 'low']) for (const fault of ['missing-foot', 'missing-tower', 'shifted-tower', 'thin-tower', 'missing-crossbeam']) {
  supportFault = fault; alteredSupports = 0;
  const tank = createTank(spec.id, null, { proceduralOnly: true, geometryReceipt: true, quality, batchStatic: false, camoSeed: 4242 });
  try {
    assert(alteredSupports > 0, `${fault}: negative changes actual authored stock`);
    assert.throws(() => verifyGunCradleSeats(tank.root), assert.AssertionError,
      `${quality} ${fault}: damaged physical receiving chain fails even with unchanged overall mast bounds`);
  } finally { tank.dispose(); supportFault = null; }
}
assert(costs[1].turretTriangles<=costs[0].turretTriangles*.68,'LOW retains complete mechanical design with meaningful turret reduction');
console.log('object695X missile concept PASS: retained native chassis; 12 real terminals, 3 optics, physical30mm bore; air/stock negatives;144 legal poses and backup recoil',JSON.stringify(costs));
