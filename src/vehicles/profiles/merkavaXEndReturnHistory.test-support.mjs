// Test-only composition of two separately qualified additive bodywork seams.
// Neither sibling is an inverse for physical geometry or a refreshed golden.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

export const MERKAVA_END_RETURN_BEFORE_SHA256 =
  'a7cb2366ce25ac6c6e3ff9c9d78ad7bf4c8fa2a6b0f6211ef9d92e6391d127f6';
export const MERKAVA_END_RETURN_SEAMS = Object.freeze([
  Object.freeze({id:'merkava3d_x',symbol:'addMerkava3dXFrontReturns',file:'merkava3dXFrontReturn.ts',
    sha256:'31f87c0c11deb1fc86f5fa1ffede512494f2cf2fec0e0e1a555626889c3c5479'}),
  Object.freeze({id:'merkava4_x',symbol:'addMerkava4XEndReturns',file:'merkava4XEndReturns.ts',
    sha256:'28c6b33721161a0c601b1e561a58c635e6d0c242b4be45a7fce6a67ba66da39d'}),
]);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const count=(source,part)=>source.split(part).length-1;
const read=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8');

function beforeModernIsraeliFleet(source){
  if(!source.includes("merkava4_trophy: { build: buildMerkava4Trophy }"))return source;
  const removeExact=(part,label)=>{
    assert.equal(count(source,part),1,`One exact ${label}`);
    source=source.replace(part,'');
  };
  const replaceExact=(current,before,label)=>{
    assert.equal(count(source,current),1,`One exact ${label}`);
    source=source.replace(current,before);
  };
  const removeHashedBlock=(start,end,sha256,label)=>{
    const startAt=source.indexOf(start),endAt=source.indexOf(end,startAt);
    assert.ok(startAt>=0&&endAt>startAt,`${label}: exact bounded block exists`);
    const block=source.slice(startAt,endAt);
    assert.equal(hash(block),sha256,`${label}: complete reviewed block`);
    source=source.slice(0,startAt)+source.slice(endAt);
  };
  const replaceHashedBlock=(start,end,sha256,before,label)=>{
    const startAt=source.indexOf(start),endAt=source.indexOf(end,startAt);
    assert.ok(startAt>=0&&endAt>startAt,`${label}: exact bounded block exists`);
    const block=source.slice(startAt,endAt);
    assert.equal(hash(block),sha256,`${label}: complete reviewed block`);
    source=source.slice(0,startAt)+before+source.slice(endAt);
  };
  removeExact("import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';\n",'LOW track-shoe helper import');
  removeExact("const NAMER: Frame = { y: 2.10, z: -1.15, ground: 0, center: 0 };\n",'Namer frame datum');
  removeExact(`function hullBar(P: TankBuilderPort, a: [number,number,number], b: [number,number,number], width = .025, slot = 'hullDark'): void {
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);
  const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());
  const g=box(width,delta.length(),width).applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(rotation));
  const mid=start.add(end).multiplyScalar(.5);
  P.addEquipment(slot,g,mid.x,mid.y,mid.z);
}

`,'Barak bow-cable helper');
  removeHashedBlock('function merkava4BarakRoof','function merkava4Roof',
    'cb49f53b427ddd34f7ff5e4fead34be703d042293a2acd250ebb6a121fb5de0a','Barak roof');
  replaceExact("function merkava4Roof(P: TankBuilderPort, candidate: 'merkava4_x'|'merkava4_trophy'|'merkava4_barak'): void {\n  if(candidate==='merkava4_barak'){\n    merkava4BarakRoof(P);\n    return;\n  }\n",
    'function merkava4Roof(P: TankBuilderPort): void {\n','configuration-specific roof seam');
  removeExact(`    if(candidate==='merkava4_trophy')
      put('turretDetail',box(.29,.24,.59),side*1.06,2.45,.285,0,0,side*.08);
`,'Trophy smoke-support stocks');
  replaceHashedBlock("  if(candidate==='merkava4_trophy'){\n    type WhipStation",
    'for(const [x,z,base,tip] of [',
    '5942561d3649509c67ad3db76463b1e2850355a1e4b0cba6c280fc79ec9d1490',
    '  ','Trophy source whip construction');
  removeHashedBlock('type TrophyConfiguration','function merkava4Shell',
    'c3ecdd9dfb8a5ba15589c485da2e8c111e8e1544f93e94c6681b7004b5bcc797','modern Merkava fittings');
  replaceExact("function buildMerkava4Family(P: TankBuilderPort, candidate: 'merkava4_x'|'merkava4_trophy'|'merkava4_barak'): void {",
    'export function buildMerkava4X(P: TankBuilderPort): void {','modern Merkava family entry');
  replaceExact(`  // The Trophy study's canonical ground recipe seats the complete assembly
  // 10 mm above the clean family datum; retain that measured registration.
  const sourceY=candidate==='merkava4_trophy'?.01:0;
  P.hullG.position.set(0,sourceY,0);P.turretG.position.set(0,MK4.y+sourceY,MK4.z);
`, `  P.hullG.position.set(0,0,0);P.turretG.position.set(0,MK4.y,MK4.z);
`, 'Trophy source seating');
  removeExact("  if(candidate==='merkava4_trophy')P.add('hull',trophyMerkavaGlacisCap());\n",
    'modern glacis extension call');
  replaceExact(`  const trophyGear=candidate==='merkava4_trophy';
  const barakGear=candidate==='merkava4_barak';
  const wheelZs=trophyGear?[-2.334,-1.566,-.494,.444,1.408,2.189]
    :barakGear?[-2.0557,-1.2559,-.2015,.7238,1.5850,2.3770]:[...MERKAVA4_X_DATUMS.wheelStations];
  const wheelR=trophyGear?.364:barakGear?.332:.3467;
  const wheelY=trophyGear?.398:barakGear?.3788:.387;
  P.gear=KIT.buildRunningGear(P,merkavaXReturnRollers(P,{style:'rubber',wheelR,wheelW:.34,wheelY,xc:1.444,
    // LOW keeps the family shoe envelope with coarser relief; HIGH and the
    // established Mk.4 X retain their original native shoe construction.
    ...(!P.q && candidate!=='merkava4_x'?{trackShoeBuilder:buildFleetTrackShoe}:{}),
    wheelZs,trackW:.548,trackTh:.064,
    sprocket:trophyGear?{z:3.267,y:.787,r:.359}:barakGear?{z:3.2069,y:.830,r:.353}:{z:3.285,y:.761,r:.336},
    idler:trophyGear?{z:-3.119,y:.758,r:.355}:barakGear?{z:-2.9871,y:.7946,r:.333}:{z:-3.020,y:.722,r:.314},
    // Existing road axles stay fixed; supports sit between their swept wheels.
    // 4.7 mm seat: with the 19 mm heavy pins the rollers still meet the near-shoe stock within 2 mm (2026-09-17)
    topY:trophyGear?1.125:barakGear?1.145:1.105,botY:.0956,paintedEnds:true,arms:true,coveredTop:true},[-1.6645,-.733,.27,2.017],.945,.29,.0047,true));
`, `  P.gear=KIT.buildRunningGear(P,merkavaXReturnRollers(P,{style:'rubber',wheelR:.3467,wheelW:.34,wheelY:.387,xc:1.444,
    wheelZs:[...MERKAVA4_X_DATUMS.wheelStations],trackW:.548,trackTh:.064,
    sprocket:{z:3.285,y:.761,r:.336},idler:{z:-3.020,y:.722,r:.314},
    // Existing road axles stay fixed; supports sit between their swept wheels.
    // 4.7 mm seat: with the 19 mm heavy pins the rollers still meet the near-shoe stock within 2 mm (2026-09-17)
    topY:1.105,botY:.0956,paintedEnds:true,arms:true,coveredTop:true},[-1.6645,-.733,.27,2.017],.945,.29,.0047,true));
`, 'source-specific modern running gear');
  replaceExact('  merkava4Roof(P,candidate);\n','  merkava4Roof(P);\n','configuration-specific roof call');
  replaceExact(`  if(candidate!=='merkava4_barak'){
    const coax=FITTINGS.pintleMG({mats:P.mats,cls:'m2',scale:1.10,seed:445,tone:'two-tone',ammo:false,shield:false,ring:false});
    coax.position.set(.0221,.26418,-.3127);P.gunG.add(coax);
  }
  if(candidate!=='merkava4_barak')merkava4CoaxMount(P);
`, `  const coax=FITTINGS.pintleMG({mats:P.mats,cls:'m2',scale:1.10,seed:445,tone:'two-tone',ammo:false,shield:false,ring:false});
  coax.position.set(.0221,.26418,-.3127);P.gunG.add(coax);
  merkava4CoaxMount(P);
`, 'Barak source weapon exclusions');
  replaceExact(`  P.muzzleZ=2.8755;P.topY=2.75-MK4.y;
  if(candidate==='merkava4_trophy'){
    P.add('hull',trophyMerkavaLowerKeel());
    addTrophyHullEndEquipment(P);
    addModernMerkavaRearClosure(P,true);
    addTrophyGlacisSignature(P);
    addTrophySuite(P,MK4,'mk4');
  }
  if(candidate==='merkava4_barak'){
    addModernMerkavaEndGuards(P,4.03,-4.02,.74);
    addModernMerkavaRearClosure(P,false);
    addBarakHullSignature(P);
    addBarakTurretArmor(P);
    addBarakRearMissionModule(P);
    addTrophySuite(P,MK4,'barak');
    addBarakSensorSuite(P);
    addBarakRearStowage(P);
    // Certified source width is 3.72 m. Keep the independently authored
    // turret unchanged while pulling the Mk.4 running-gear/hull course into
    // Barak's visibly tighter side envelope.
    P.hullG.scale.x=.972;
  }
  P.hullG.userData.xRebuild={candidate,independent:candidate==='merkava4_x',familyRecipe:'merkava4-first-party',datumVersion:1,sourceLocalOnly:true};
}`,
  `  P.muzzleZ=2.8755;P.topY=2.75-MK4.y;
  P.hullG.userData.xRebuild={candidate:'merkava4_x',independent:true,datumVersion:1,sourceLocalOnly:true};
}`,'modern Merkava configuration tail');
  replaceExact(`

export function buildMerkava4X(P: TankBuilderPort): void { buildMerkava4Family(P,'merkava4_x'); }
export function buildMerkava4Trophy(P: TankBuilderPort): void { buildMerkava4Family(P,'merkava4_trophy'); }
export function buildMerkava4Barak(P: TankBuilderPort): void { buildMerkava4Family(P,'merkava4_barak'); }

`,'\n\n','modern Merkava exported wrappers');
  removeHashedBlock('function namerSuperstructure','export const MERKAVA_X_PROFILES',
    'b0c2bec65ec8b7ec07c9ed15aa50a6636ade6a36a526065d7e7905b0ecea641f','Namer implementation');
  removeExact("  merkava4_trophy: { build: buildMerkava4Trophy },\n  merkava4_barak: { build: buildMerkava4Barak },\n  namer_ifv: { build: buildNamerIfv },\n",
    'modern Israeli profile registrations');
  return source;
}

function beforeMerkava3dRightCheekRepair(source){
  // 2026-09-18: authenticate the complete approved +X Dor-Dalet repair and
  // recover only that exact additive block before checking the older shared
  // profile hash. The historical golden stays frozen; geometry, material role,
  // stations, ownership receipt, or call-site drift cannot be normalized.
  const repair=`function addMerkava3dRightCheekModule(P: TankBuilderPort): void {
  // The supplied display tree leaves the vehicle-right (+X) Dor-Dalet cheek
  // course off the forward casting.  The naked shell is intentionally
  // asymmetric around the sight and gun tunnel, but the fielded Mk.3D wraps
  // that shell in fourth-generation modular side armor.  Keep the source
  // casting untouched and add the missing, independently closed module as
  // permanent structural armor.  World-space stations are converted into the
  // turret-local frame so the complete course follows turret yaw.
  const module = sectionSolid([
    {z:-.05-MK3.z,ring:[
      [.28,1.92-MK3.y],[1.82,1.90-MK3.y],
      [1.76,2.30-MK3.y],[.38,2.54-MK3.y],
    ]},
    {z:.65-MK3.z,ring:[
      [.24,1.91-MK3.y],[1.72,1.86-MK3.y],
      [1.66,2.27-MK3.y],[.34,2.52-MK3.y],
    ]},
    {z:1.30-MK3.z,ring:[
      [.18,1.90-MK3.y],[1.36,1.86-MK3.y],
      [1.28,2.18-MK3.y],[.28,2.37-MK3.y],
    ]},
  ]);
  // This is passive Dor-Dalet composite, not one of the three depleted ERA
  // cassettes authored below. Keep it in the permanent turret hit shell so a
  // right-side ERA strike cannot erase the repaired silhouette.
  P.add('turret', module);
  P.turretG.userData.merkava3dRightCheekReceipt = Object.freeze({
    side: '+X',
    configuration: 'Dor-Dalet modular forward cheek course',
    stationWorldZ: Object.freeze([-.05,.65,1.30]),
    outerWorldX: Object.freeze([1.82,1.72,1.36]),
  });
}

`;
  const call='  addMerkava3dRightCheekModule(P);\n';
  assert.equal(count(source,repair),1,'One exact approved permanent Mk3D +X cheek repair');
  assert.equal(count(source,call),1,'One exact Mk3D +X cheek repair call');
  return source.replace(repair,'').replace(call,'');
}

function beforeRollers(source,readHelper){
  const imported="import { merkavaXReturnRollers, lineMerkavaXUpperBand } from './merkavaXReturnRollers.ts';\n";
  if(!source.includes('merkavaXReturnRollers'))return source;
  assert.equal(count(source,'merkavaXReturnRollers'),4,'One roller import path/symbol and two exact calls');
  assert.equal(count(source,imported),1,'One exact roller helper import');
  assert.equal(hash(readHelper('merkavaXReturnRollers.ts')),
    '1cd30d9515a866a3e79a927abe0bef34b8b5841d75255580d9d670c4baa6d3f1','Complete reviewed roller helper'); // 2026-09-14: helper passes the outer road wheels to the loop (tangent wrap)
  assert.equal(hash(readHelper('../upperReturnBandStock.ts')),
    '3de12aa98490a81195866eb36baf263f54fc73e7d3866e6466ee3cdce69629ea','Complete reviewed closed upper stock leaf');
  const lining='  lineMerkavaXUpperBand(P,[-1.6645,-.733,.27,2.017],.0038);\n';
  assert.equal(count(source,'lineMerkavaXUpperBand'),2,'Only one import and one native lining call');
  assert.equal(count(source,lining+'  merkava4HullDetails(P);'),1,'Lining stays at its immutable Mk4 gear seam');
  let before=source.replace(imported,'');
  before=before.replace(lining,'');
  const prefix='P.gear=KIT.buildRunningGear(P,merkavaXReturnRollers(P,{';
  assert.equal(count(before,prefix),2,'Only the two known gear calls');
  before=before.replaceAll(prefix,'P.gear=KIT.buildRunningGear(P,{');
  // a6a3c8570 changes only the qualified support stations and their comments.
  // Authenticate each complete tail before recovering the immutable old call;
  // do not normalize arbitrary comments, geometry inputs or station drift.
  for(const [comment,tail,suffix] of[
    ['    // Inferred supports occupy existing axle gaps at full suspension stroke.\n',
      '    topY:1.230,botY:.0976,paintedEnds:true,arms:true,coveredTop:true',
      '},[-1.8821825,-.8756825,.9765675,1.8323175],1.075,.25,.0027));'],
    // 2026-09-17: the Mk4 seat moved .0063 → .0047 with the 19 mm heavy pins and gained its own dated comment line;
    // both lines are authenticated here and recovered together, so the immutable old call still hashes exactly.
    ['    // Existing road axles stay fixed; supports sit between their swept wheels.\n'
      +'    // 4.7 mm seat: with the 19 mm heavy pins the rollers still meet the near-shoe stock within 2 mm (2026-09-17)\n',
      '    topY:1.105,botY:.0956,paintedEnds:true,arms:true,coveredTop:true',
      '},[-1.6645,-.733,.27,2.017],.945,.29,.0047,true));'],
  ]){
    assert.equal(count(before,comment),1,'One exact support comment');
    assert.equal(count(before,comment+tail+suffix),1,'Support comment stays at its own immutable gear seam');
    assert.equal(count(before,suffix),1,'Exact independently tested station/seat seam');
    before=before.replace(comment+tail+suffix,tail+'});');
  }
  return before;
}

function beforePaintedBasketFloor(source,readHelper){
  // 2026-09-11 fleet paint standard: the Mk4 basket floor carries camouflage
  // through the material-only painted-detail bucket. Authenticate the exact
  // helper import and the single migrated put() call, then recover the
  // immutable original line; no geometry, station or other drift is normalized.
  const imported="import {markFixedPaintedPanel} from './fixedPaintedPanel.ts';\n";
  if(!source.includes('markFixedPaintedPanel'))return source;
  assert.equal(count(source,'markFixedPaintedPanel'),2,'One painted-panel import and one exact floor call');
  assert.equal(count(source,imported),1,'One exact painted-panel helper import');
  assert.equal(hash(readHelper('fixedPaintedPanel.ts')),
    'd9a7bbdc298b5ae6833078d422bc64535830e5675687dadb8beb5e39bdc8492f','Complete reviewed painted-panel helper');
  const painted="  put('turretPaintedDetail',markFixedPaintedPanel(box(1.882,.009,.601),'merkava4-x-basket-floor','turretDetail'),.022,1.8225,-3.3205);\n";
  const original="  put('turretDetail',box(1.882,.009,.601),.022,1.8225,-3.3205);\n";
  assert.equal(count(source,painted),1,'Only the one known basket-floor put() is migrated');
  assert.equal(count(source,original),0,'The original floor line is not duplicated');
  return source.replace(imported,'').replace(painted,original);
}

function beforeMeshBasket(source){
  // 2026-09-12 fleet visual standard: the Mk4 basket is a painted frame closed
  // with dark mesh strands and the chain-curtain balls are bare steel. Three
  // exact authored blocks are authenticated (the slot-aware cageBar, the dark
  // ball line and the mesh basket) and each is recovered to its immutable
  // original text; no station, geometry or other drift is normalized.
  const newCage="type LatticeSlot='turretOpenLattice'|'turretOpenLatticeDark';\nfunction cageBar(P: TankBuilderPort, frame: Frame, a: [number,number,number], b: [number,number,number], width = .025, slot: LatticeSlot = 'turretOpenLattice'): void {\n";
  const oldCage="function cageBar(P: TankBuilderPort, frame: Frame, a: [number,number,number], b: [number,number,number], width = .025): void {\n";
  const newCageEmit="  topPart(P,frame,slot,g,mid.x,mid.y,mid.z);\n}\n\nfunction chainCurtain(";
  const oldCageEmit="  topPart(P,frame,'turretOpenLattice',g,mid.x,mid.y,mid.z);\n}\n\nfunction chainCurtain(";
  const newBall="    // 2026-09-12: the balls are bare steel like their chains; painted spheres\n    // read as a white picket fence under the bustle on every study.\n    topPart(P,frame,'turretOpenLatticeDark',new THREE.SphereGeometry(.030,8,6),x,railY-drop-.033,rear);\n";
  const oldBall="    topPart(P,frame,'turretOpenLattice',new THREE.SphereGeometry(.030,8,6),x,railY-drop-.033,rear);\n";
  const newBasket=`  // 2026-09-12 fleet visual standard: the real basket is a painted frame
  // closed with dark welded mesh; six identical painted rails read as louvres
  // on every study. The frame (floor and top rails, corner and door posts)
  // stays painted at .024; the four intermediate courses are thin dark mesh
  // strands and dark verticals close each panel about every 0.31 m. Every
  // rail height, corner station and the basket floor are unchanged.
  const Y0=1.826,Y1=2.348,MESH=.011,DARK:LatticeSlot='turretOpenLatticeDark';
  for(const y of[Y0,1.93,2.034,2.138,2.242,Y1]){
    const frame=y===Y0||y===Y1,slot:LatticeSlot=frame?'turretOpenLattice':DARK,w=frame?.024:MESH;
    put(slot,box(1.86,w,w),.022,y,backAt(y));
    for(const side of[-1,1]){
      cageBar(P,MK4,[side*.930+.022,y,backAt(y)],[side*1.167+.022,y,-3.015],w,slot);
      cageBar(P,MK4,[side*1.167+.022,y,-3.015],[side*1.58+.022,y,-1.98],w,slot);
    }
  }
  for(const x of[-.62,-.31,0,.31,.62])
    cageBar(P,MK4,[x+.022,Y0,backAt(Y0)],[x+.022,Y1,backAt(Y1)],MESH,DARK);
  for(const side of[-1,1]){
    cageBar(P,MK4,[side*.930+.022,Y0,backAt(Y0)],[side*.930+.022,Y1,backAt(Y1)]);
    for(const [x,z]of[[1.167,-3.015],[1.40,-2.43],[1.58,-1.98]])
      cageBar(P,MK4,[side*x+.022,Y0,z],[side*x+.022,Y1,z]);
    // Mesh verticals on the two slanted side panels: the front panel between
    // the corner post and the door post, and the long panel to the shoulder.
    for(const t of[.5])cageBar(P,MK4,
      [side*(.930+t*(1.167-.930))+.022,Y0,backAt(Y0)+t*(-3.015-backAt(Y0))],
      [side*(.930+t*(1.167-.930))+.022,Y1,backAt(Y1)+t*(-3.015-backAt(Y1))],MESH,DARK);
    for(const t of[.25,.5,.75])cageBar(P,MK4,
      [side*(1.167+t*(1.58-1.167))+.022,Y0,-3.015+t*(-1.98+3.015)],
      [side*(1.167+t*(1.58-1.167))+.022,Y1,-3.015+t*(-1.98+3.015)],MESH,DARK);
    for(let i=0;i<19;i++){
      const z=-3.61+i*.086,x=.944+(z+3.645)*.365;
      put('turretOpenLatticeDark',cylY(.009,.145,6),side*x+.022,1.735,z);
      put('turretOpenLatticeDark',new THREE.SphereGeometry(.030,8,6),side*x+.022,1.647,z);
    }
  }
`;
  const oldBasket=`  for(const y of[1.826,1.93,2.034,2.138,2.242,2.348]){
    put('turretOpenLattice',box(1.86,.024,.024),.022,y,backAt(y));
    for(const side of[-1,1]){
      cageBar(P,MK4,[side*.930+.022,y,backAt(y)],[side*1.167+.022,y,-3.015]);
      cageBar(P,MK4,[side*1.167+.022,y,-3.015],[side*1.58+.022,y,-1.98]);
    }
  }
  for(const side of[-1,1]){
    cageBar(P,MK4,[side*.930+.022,1.826,backAt(1.826)],[side*.930+.022,2.348,backAt(2.348)]);
    for(const [x,z]of[[1.167,-3.015],[1.40,-2.43],[1.58,-1.98]])
      cageBar(P,MK4,[side*x+.022,1.826,z],[side*x+.022,2.348,z]);
    for(let i=0;i<19;i++){
      const z=-3.61+i*.086,x=.944+(z+3.645)*.365;
      put('turretOpenLatticeDark',cylY(.009,.145,6),side*x+.022,1.735,z);
      put('turretOpenLattice',new THREE.SphereGeometry(.030,8,6),side*x+.022,1.647,z);
    }
  }
`;
  if(!source.includes(newCage))return source;
  for(const [part,label] of[[newCage,'slot-aware cageBar'],[newCageEmit,'slot-aware cageBar emit'],
    [newBall,'dark chain balls'],[newBasket,'mesh basket']])
    assert.equal(count(source,part),1,`Exactly one authored ${label} block`);
  for(const [part,label] of[[oldCage,'cageBar'],[oldBall,'chain ball'],[oldBasket,'basket']])
    assert.equal(count(source,part),0,`The original ${label} text is not duplicated`);
  assert.equal(count(source,'LatticeSlot'),4,'The lattice slot type has exactly its four authored uses');
  return source.replace(newCage,oldCage).replace(newCageEmit,oldCageEmit)
    .replace(newBall,oldBall).replace(newBasket,oldBasket);
}

export function authenticateMerkavaEndReturnHistory(requiredId, {
  source=read('merkavaX.ts'), readHelper=read,
}={}) {
  assert.ok(MERKAVA_END_RETURN_SEAMS.some(s=>s.id===requiredId),'Known physical test owner');
  source=beforeModernIsraeliFleet(source);
  let before=beforeMerkava3dRightCheekRepair(
    beforeRollers(beforePaintedBasketFloor(beforeMeshBasket(source),readHelper),readHelper));
  const present=[];
  for(const s of MERKAVA_END_RETURN_SEAMS){
    const imported=`import { ${s.symbol} } from './${s.file}';\n`;
    const anchor=`  addMerkavaXShoulderReturns(P, '${s.id}');\n`;
    const call=`  ${s.symbol}(P);\n`;
    const occurrences=count(source,s.symbol);
    if(occurrences===0){
      assert.notEqual(s.id,requiredId,'The physical test owner must actually be emitted');
      continue;
    }
    assert.equal(occurrences,2,`${s.id}: exactly one import and one call`);
    assert.equal(count(source,imported),1,`${s.id}: exact single import`);
    assert.equal(count(source,anchor+call),1,`${s.id}: call at its own immutable builder seam`);
    assert.equal(hash(readHelper(s.file)),s.sha256,`${s.id}: entire independently reviewed helper`);
    before=before.replace(imported,'').replace(anchor+call,anchor);
    present.push(s.id);
  }
  assert.equal(hash(before),MERKAVA_END_RETURN_BEFORE_SHA256,
    'Complete original shared profile: no other source change is normalized');
  return Object.freeze({beforeSha256:MERKAVA_END_RETURN_BEFORE_SHA256,present:Object.freeze(present)});
}
