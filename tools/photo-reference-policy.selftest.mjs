import assert from 'node:assert/strict';
import {readPhotoReference} from './photo-reference-record.mjs';
import {readFileSync} from 'node:fs';
import {resolveTankId} from '../src/vehicles/tankIdAliases.ts';
import {ALL_TANK_IDS} from '../src/vehicles/specs.ts';
import {firstPartyConcept} from './first-party-concept-policy.mjs';
// the override maps the fidelity page spreads into its registry (held equal to the page's own list below)
import {SUPPLIED_SOURCE_REFERENCE_OVERRIDES} from './supplied-source-reference-overrides.mjs';
import {ARES_APC_X_REFERENCE_OVERRIDES} from './ares-apc-x-reference-overrides.ts';
import {OPLOT_BM_X_REFERENCE_OVERRIDES} from './oplot-bm-x-reference-overrides.ts';
import {SECOND_WAVE_X_REFERENCE_OVERRIDES} from './second-wave-x-reference-overrides.ts';
import {ABRAMS_X_REFERENCE_OVERRIDES} from './abrams-x-reference-overrides.ts';
import {T90_X_REFERENCE_OVERRIDES} from './t90-x-reference-overrides.ts';
import {LEOPARD_X_REFERENCE_OVERRIDES} from './leopard-x-reference-overrides.ts';
import {WEST_X_REFERENCE_OVERRIDES} from './west-x-reference-overrides.ts';
import {PHOTO_REFERENCE_IDS,PHOTO_REFERENCES,photoTarget,photoReceiptPassed,isPhotoReference,stageARoute,stageAPassed,
  assertNoPhotoOverride} from './photo-reference-policy.mjs';
import {roofEquipmentVerdict} from './source-equipment-policy.mjs';
import {tankReleaseSteps} from './tank-release-plan.mjs';
import {sourceOpeningsVerdict} from './source-openings-policy.mjs';
for(const id of ['unknown','puma_s1','type89','__proto__'])assert.throws(()=>readPhotoReference(id));
for(const id of PHOTO_REFERENCE_IDS){
  const doc=readPhotoReference(id),{target,packet,packetSha256,packetPath}=doc;
  const dimensions=['high','low'].map(quality=>({quality,fillLoaded:true,
    bounds:{min:[-target.widthM/2,0,-target.overallLengthM/2],max:[target.widthM/2,target.tallestM,target.overallLengthM/2]}}));
  const report={id,passed:true,comparisonPurpose:'photographic-reference',numerical3DComparison:'unverified',score:null,
    packetSha256,packetPath,startedAt:new Date(2000).toISOString(),test:{path:target.test,exitCode:0},
    inputSha256Before:'a'.repeat(64),inputSha256After:'a'.repeat(64),dimensions};
  assert(photoReceiptPassed(id,report,packet,packetSha256,1000));
  for(const patch of [{score:95},{numerical3DComparison:'passed'},{passed:false},{packetSha256:'b'.repeat(64)},
    {id:'type89'},{startedAt:new Date(0).toISOString()},{inputSha256After:'c'.repeat(64)},
    {test:{path:target.test,exitCode:1}},{dimensions:dimensions.slice(1)},
    {dimensions:[{...dimensions[0],fillLoaded:false},dimensions[1]]},
    {dimensions:[{...dimensions[0],bounds:{min:[0,0,0],max:[50,50,50]}},dimensions[1]]}])
    assert.equal(photoReceiptPassed(id,{...report,...patch},packet,packetSha256,1000),false);
  for(const patch of [{dimensionToleranceFraction:.04},{numerical3DComparison:'passed'},{targets:{...packet.targets,extra:target}},
    {targets:{...packet.targets,[id]:{...target,test:'skip.mjs'}}}])assert.equal(photoTarget(id,{...packet,...patch}),null);
  const config={id,comparisonPurpose:'photographic-reference',roofMachineGuns:target.roofMachineGuns,packetSha256};
  const receipt={id,verified:true,path:packetPath,sha256:packetSha256};
  const census={mg:target.roofMachineGuns,invalidWeaponMarkers:0};
  assert(roofEquipmentVerdict(id,census,config,receipt).passed);
  assert.equal(roofEquipmentVerdict(id,census,config,{...receipt,verified:false}).passed,false);
  assert.equal(roofEquipmentVerdict(id,census,config).passed,false);
  assert.equal(roofEquipmentVerdict(id,{...census,mg:target.roofMachineGuns+1},config,receipt).passed,false);
  assert.equal(sourceOpeningsVerdict({id,scan:{holeCells:1}}).passed,false,'photo targets cannot waive unexplained holes');
  const steps=tankReleaseSteps(id,true,'node');
  assert.equal(steps.length,18,'all physical, anatomy, test and build steps retained'); // (integ/226: + the vehicles' ledger and mission-seat checks, + the spare-track ledger; 2026-10-17: + the material registration; 2026-10-18 227 gun-gaps: + the gun-junction ledger; 266: + the id-scoped tanks receipts)
  assert.equal(steps.some(step=>step.args[0]==='tools/procedural-fidelity.mjs'),false,'do not fabricate 3D scores');
}
const mixed=tankReleaseSteps('cv9040c,puma_s1,type89,borsuk',true,'node');
assert(mixed.find(step=>step.args[0]==='tools/procedural-fidelity.mjs').args.includes('--ids=puma_s1,type89'));
// --- stage A's photo route (Main 2026-10-31): (a) a photo-class id passes through its packet; (b) an id with no packet and
// no oracle still fails a forced gate; (c) a registered oracle measures and a packet never overrides it ----------------
// The 3D registry as the fidelity page builds it: MODEL_SOURCE's glb entries and every override map it spreads.
const page=readFileSync(new URL('./procedural-fidelity.html',import.meta.url),'utf8');
const imports=Object.fromEntries([...page.matchAll(/^import \{ ([A-Z0-9_]+) \} from '\/tools\/([^']+)';/gm)].map(m=>[m[1],m[2]]));
const spread=[...page.match(/const LOCAL_REFERENCE_OVERRIDES = \{([\s\S]*?)\n\}/)[1].matchAll(/\.\.\.([A-Z0-9_]+)/g)].map(m=>m[1]);
const OVERRIDES={SUPPLIED_SOURCE_REFERENCE_OVERRIDES,ARES_APC_X_REFERENCE_OVERRIDES,OPLOT_BM_X_REFERENCE_OVERRIDES,
  SECOND_WAVE_X_REFERENCE_OVERRIDES,ABRAMS_X_REFERENCE_OVERRIDES,T90_X_REFERENCE_OVERRIDES,LEOPARD_X_REFERENCE_OVERRIDES,
  WEST_X_REFERENCE_OVERRIDES};
const OVERRIDE_FILES={SUPPLIED_SOURCE_REFERENCE_OVERRIDES:'supplied-source-reference-overrides.mjs',
  ARES_APC_X_REFERENCE_OVERRIDES:'ares-apc-x-reference-overrides.ts',OPLOT_BM_X_REFERENCE_OVERRIDES:'oplot-bm-x-reference-overrides.ts',
  SECOND_WAVE_X_REFERENCE_OVERRIDES:'second-wave-x-reference-overrides.ts',ABRAMS_X_REFERENCE_OVERRIDES:'abrams-x-reference-overrides.ts',
  T90_X_REFERENCE_OVERRIDES:'t90-x-reference-overrides.ts',LEOPARD_X_REFERENCE_OVERRIDES:'leopard-x-reference-overrides.ts',
  WEST_X_REFERENCE_OVERRIDES:'west-x-reference-overrides.ts'};
// the page spreads exactly these maps, from these files: a new override map on the page fails here until it is read
assert.deepEqual([...spread].sort(),Object.keys(OVERRIDES).sort(),'the fidelity page spreads exactly the override maps read here');
for(const name of spread)assert.equal(imports[name],OVERRIDE_FILES[name],`${name}: imported from ${OVERRIDE_FILES[name]}`);
const registered=new Set([...page.matchAll(/^ {2}([a-z0-9_]+): ?\{ ?source: ?'glb'/gm)].map(m=>m[1]));
for(const map of Object.values(OVERRIDES))for(const id of Object.keys(map))registered.add(id);
// the census reads the registry, not an empty parse: a comparison id, an override id and the T-64s' siblings' own prints
for(const id of ['leo2a6','t64bv1','t64bv_donbas',Object.keys(SUPPLIED_SOURCE_REFERENCE_OVERRIDES)[0]])
  assert(registered.has(id),`${id}: registered (registry census)`);
// (a) every photo id is unregistered, so its packet is its stage A route; each packet holds exactly its table rows
for(const id of PHOTO_REFERENCE_IDS){
  assert.equal(registered.has(id),false,`${id}: a photo id keeps no registered 3D oracle`);
  assert.equal(stageARoute(id),'photo');
}
for(const packet of new Set(Object.values(PHOTO_REFERENCES).map(row=>row.packet))){
  // the packet's keys in today's ids, as photoTarget reads them
  const {targets,tankIdSchema}=JSON.parse(readFileSync(packet,'utf8'));
  assert.deepEqual(Object.keys(targets).map(key=>resolveTankId(key,tankIdSchema)).sort(),
    PHOTO_REFERENCE_IDS.filter(id=>PHOTO_REFERENCES[id].packet===packet).sort(),`${packet}: exactly its members`);
}
// the T-64s' borrowed prints are deregistered (Main 2026-10-31); their siblings keep their own
for(const id of ['t64bm1m','t64bv','t64b1v_2022'])assert.equal(registered.has(id)||!isPhotoReference(id),false,id);
assertNoPhotoOverride([...PHOTO_REFERENCE_IDS,'t64bv1','t64bv_donbas'],registered);
// (b) control: no packet and no oracle is procedural-only: a forced gate fails it (N/A outside --gate, as before)
const bare=ALL_TANK_IDS.find(id=>!registered.has(id)&&!isPhotoReference(id)&&!firstPartyConcept(id));
assert.ok(bare,'the fleet has a procedural-only id to control with');
assert.equal(stageARoute(bare),'none');
assert.equal(stageAPassed('none',{forceGate:true}),false);
assert.equal(stageAPassed('none',{forceGate:false}),true);
assert.throws(()=>readPhotoReference(bare),/no complete explicit photographic target/);
// (c) control: a registered oracle measures and the packet never overrides it: the route stays the oracle's, a photo
// receipt cannot pass it, and the geometry gate refuses a packet beside a registered oracle
assert.equal(stageARoute('t64bv1',{registered:true}),'oracle');
assert.equal(stageARoute('t64bv',{registered:true}),'oracle','a packet never overrides a registered oracle');
assert.equal(stageAPassed('oracle',{forceGate:true,gateApplicable:false,photoProof:true}),false,'no fresh oracle packet');
assert.equal(stageAPassed('oracle',{forceGate:true,gateApplicable:true,exactGatePassed:false,photoProof:true}),false,'a failing oracle');
assert.equal(stageAPassed('oracle',{forceGate:true,gateApplicable:true,exactGatePassed:true}),true);
assert.throws(()=>assertNoPhotoOverride(['t64bv'],new Set(['t64bv'])),/cannot override a registered 3D target/);
// the photo route passes on its own fresh receipt only, never on a gate packet
assert.equal(stageAPassed('photo',{forceGate:true,photoProof:true}),true);
assert.equal(stageAPassed('photo',{forceGate:true,photoProof:false}),false);
assert.equal(stageAPassed('photo',{forceGate:true,gateApplicable:true,exactGatePassed:true}),false);
console.log(`photo qualification: ${PHOTO_REFERENCE_IDS.length} photo ids on ${new Set(Object.values(PHOTO_REFERENCES).map(r=>r.packet)).size} packets, `
  +`explicit membership, unchanged 3% dimensions, fresh physical proof, unverified 3D scores; stage A's photo route against `
  +`${registered.size} registered oracles (no packet overrides one; no packet and no oracle fails a forced gate) and negative controls PASS`);
