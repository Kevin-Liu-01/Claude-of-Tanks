import assert from 'node:assert/strict';
import fs from 'node:fs';
// Load the eager facade's actual dependency list, but stop before its one-shot
// role/anatomy finalization so the initialization-only synchronizer really runs.
const factory=new URL('./tankFactory.ts',import.meta.url);
for(const match of fs.readFileSync(factory,'utf8').matchAll(/^import(?:[^;]*?\bfrom\s+)?\s*['"](\.[^'"]+)['"]\s*;/gm))await import(new URL(match[1],factory));
const {TANK_SPECS}=await import('./specs.ts');
const {isFleetBalanceFinalized}=await import('./fleetBalanceState.ts');
const {synchronizeSuppliedSourceCombatMetadata:sync}=await import('./suppliedSourceFleetSpecs.ts');
assert.equal(isFleetBalanceFinalized(TANK_SPECS),false,'pre-finalization path is exercised');
const saved=new Map(Object.entries(TANK_SPECS).map(([id,s])=>[id,structuredClone(s)]));
const owners=['hull','turret'];
const cases=[['type96b_x','type99a'],['aft10_x','m551_sheridan'],['sabra_mk2_x','m60a3']].map(([id,donorId])=>({id,spec:TANK_SPECS[id],donor:TANK_SPECS[donorId]}));
function check({id,spec,donor,frame,donorBefore}){
 assert.equal(spec.hp,donor.hp,`${id}: fresh donor tuning copied`);
 const ratios=['widthM','heightM','hullLengthM'].map(k=>spec.dims[k]/donor.dims[k]);
 assert.ok(ratios.some(r=>Math.abs(r-1)>.01),'nonidentity donor fitting is actually exercised');
 const fitted=structuredClone(donor.armor);
 for(const owner of owners)for(const plate of fitted[owner+'Plates'])plate.verts=plate.verts.map(v=>v.map((n,axis)=>n*ratios[axis]));
 for(const owner of owners){const key=owner+'Plates',permanent=fitted[key].filter(p=>p.kind!=='era');
  const identity=plates=>plates.map(({name,kind,physicalMm,keMm,ceMm,era})=>({name,kind,physicalMm,keMm,ceMm,era}));
  assert.deepEqual(identity(spec.armor[key]),identity(permanent),`${id}/${owner}: all permanent protection identities and strengths retained, no donor ERA`);
  const name='sync_probe_stock_'+owner;
  assert.deepEqual(spec.armor[key].find(p=>p.name===name).verts,permanent.find(p=>p.name===name).verts,'asymmetric sentinel independently fitted along all three axes');
  for(const plate of spec.armor[key]){const source=donor.armor[key].find(p=>p.name===plate.name);assert.notStrictEqual(plate,source);assert.notStrictEqual(plate.verts,source.verts);plate.verts.forEach((v,i)=>assert.notStrictEqual(v,source.verts[i],'independent vertex arrays'));}
 }
 assert.deepEqual(spec.dims,frame.dims,'native dimensions retained');
 assert.deepEqual(spec.armor.turretPivot,frame.turret,'native turret datum retained');
 assert.deepEqual(spec.armor.gunPivot,frame.gun,'native gun datum retained');
 assert.equal(spec.armor.gunBarrel.lengthM,frame.length,'native barrel length retained');
 assert.equal(JSON.stringify(donor),donorBefore,'synchronizer never modifies donor');
}
try{
 for(const c of cases){const {id,spec,donor}=c;c.frame={dims:structuredClone(spec.dims),turret:[...spec.armor.turretPivot],gun:[...spec.armor.gunPivot],length:spec.armor.gunBarrel.lengthM};
  donor.hp+=173;
  for(const owner of owners){const plates=donor.armor[owner+'Plates'];const donorEra=owners.flatMap(o=>donor.armor[o+'Plates']).find(p=>p.kind==='era');assert(donorEra,'real donor ERA control');
   const permanent=structuredClone(plates.find(p=>p.kind!=='era'));permanent.name='sync_probe_stock_'+owner;permanent.physicalMm+=7;permanent.verts=[[0,0,0],[1,.2,.6],[1,1.2,2],[0,1,1.4]];plates.push(permanent);
   const reactive=structuredClone(donorEra);reactive.name='sync_probe_era_'+owner;plates.push(reactive);
  }c.donorBefore=JSON.stringify(donor);
 }
 for(let pass=0;pass<2;pass++){sync();for(const c of cases)check(c);}
 for(const c of cases){const armor=structuredClone(c.spec.armor);
  const corruptions=[()=>c.spec.armor.hullPlates.pop(),()=>c.spec.armor.hullPlates.push(structuredClone(c.donor.armor.hullPlates.find(p=>p.kind==='era'))),()=>c.spec.armor.turretPivot[0]+=.1,()=>c.spec.armor.hullPlates.find(p=>p.name==='sync_probe_stock_hull').verts[1][2]+=.1,()=>{const p=c.spec.armor.hullPlates.find(p=>p.name==='sync_probe_stock_hull'),source=c.donor.armor.hullPlates.find(d=>d.name===p.name);assert.deepEqual(p.verts[0],source.verts[0]);p.verts[0]=source.verts[0];}];
  for(const corrupt of corruptions){corrupt();assert.throws(()=>check(c),assert.AssertionError,'real missing stock/ERA/frame/alias corruption rejected');c.spec.armor=structuredClone(armor);}
 }
}finally{for(const[id,s]of saved){const live=TANK_SPECS[id];for(const key of Object.keys(live))delete live[key];Object.assign(live,s);}}
console.log('supplied armor initialization: actual donor refresh, permanent identities/strengths, sentinel XYZ fit, ERA filtering, native frames and alias negatives PASS');
