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

function beforeRollers(source,readHelper){
  const imported="import { merkavaXReturnRollers, lineMerkavaXUpperBand } from './merkavaXReturnRollers.ts';\n";
  if(!source.includes('merkavaXReturnRollers'))return source;
  assert.equal(count(source,'merkavaXReturnRollers'),4,'One roller import path/symbol and two exact calls');
  assert.equal(count(source,imported),1,'One exact roller helper import');
  assert.equal(hash(readHelper('merkavaXReturnRollers.ts')),
    '75afb5ab186d62ebb2a5ece37071b2298f855f865831f3c50891da19c0069df2','Complete reviewed roller helper');
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
    ['    // Existing road axles stay fixed; supports sit between their swept wheels.\n',
      '    topY:1.105,botY:.0956,paintedEnds:true,arms:true,coveredTop:true',
      '},[-1.6645,-.733,.27,2.017],.945,.29,.0063,true));'],
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
  let before=beforeRollers(beforePaintedBasketFloor(beforeMeshBasket(source),readHelper),readHelper);
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
