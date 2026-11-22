// Mission seat seeds (275): drop a sample of committed seat records, seat those ids again, and every one comes back
// valid, the very seat it lost. In the 274 integration the T-80U Kursk's record was replaced by main's stale row (now
// inside its narrowed M2 arc), and tools/gen-mission-attachment-seats.mjs could not find the seat from scratch: it had
// been bootstrapped by seeding both tables, and no grid lands between the arc and the stern racks (276,114 candidates).
// The generator now seeds its search from both committed rows, its own record first and then the boot-side
// projection's row (src/sim/missionDockSeats.generated.ts). This runs it as a part (--out-dir: nothing in the tree is
// written) with --drop-rows on the sample, so only the projection's row can seed each seat.
//
// The sample: the Kursk (seeded), the T-72B3 Bastion (its seat on the welded housing patch, rise 0.085) and the VT4A1
// (roof-gun heavy, rise 0.125), plus the Merkava 4B (exempt: it has no row and comes back with none).
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {MISSION_ATTACHMENT_SEATS} from '../src/sim/missionAttachmentSeats.generated.ts';
import {MISSION_DOCK_SEATS} from '../src/sim/missionDockSeats.generated.ts';
import {DRONE_DOCK_EXEMPT} from '../src/sim/droneDockExempt.ts';
import {missionAttachmentSignature} from '../src/sim/missionAttachment.ts';
// the generator's fleet facade (the eager tool fleet): the seat signature reads what it registers
import '../src/vehicles/tankFactory.ts';
import {TANK_SPECS} from '../src/vehicles/specs.ts';

const SAMPLE=['t80u_kursk','t72b3_bastion_m','vt4a1_baihu','merkava4b'];
const root=join(dirname(fileURLToPath(import.meta.url)),'..'),dir=mkdtempSync(join(tmpdir(),'cot-seat-seeds-'));
for(const id of SAMPLE){
 assert(Object.hasOwn(TANK_SPECS,id),`${id}: a fleet id`);
 if(Object.hasOwn(DRONE_DOCK_EXEMPT,id))assert(!MISSION_ATTACHMENT_SEATS[id]&&!MISSION_DOCK_SEATS[id],`${id}: an exempt id keeps no row`);
 else assert(MISSION_ATTACHMENT_SEATS[id]&&MISSION_DOCK_SEATS[id],`${id}: both tables carry its seat (the projection's row is the only seed left)`);
}
let rows;
try{
 const run=spawnSync(process.execPath,['tools/gen-mission-attachment-seats.mjs','--ids='+SAMPLE.join(','),
  '--drop-rows='+SAMPLE.join(','),'--out-dir='+dir],{cwd:root,stdio:['ignore','inherit','inherit']});
 assert.equal(run.status,0,`the seat generator's part exits 0 (signal ${run.signal})`);
 const part=JSON.parse(readFileSync(join(dir,'rows.json'),'utf8'));
 assert.equal(part.tool,'gen-mission-attachment-seats');rows=part.rows;
}finally{rmSync(dir,{recursive:true,force:true});}
assert.deepEqual(Object.keys(rows).sort(),[...SAMPLE].sort(),'one part row per sampled id');
for(const id of SAMPLE){
 const {record,report}=rows[id];
 assert.equal(report.pass,true,`${id}: seated again after its record was dropped (${report.reason??JSON.stringify(report.firstFailure??null)})`);
 if(Object.hasOwn(DRONE_DOCK_EXEMPT,id)){
  assert.equal(record,null,`${id}: exempt, no seat`);assert.equal(report.exempt,DRONE_DOCK_EXEMPT[id]);continue;
 }
 assert.deepEqual(report.validation?.failures,[],`${id}: every quality and camo seed validates the seat`);
 assert.equal(record.signature,missionAttachmentSignature(TANK_SPECS[id]),`${id}: current geometry signature`);
 assert.equal(JSON.stringify(record),JSON.stringify(MISSION_ATTACHMENT_SEATS[id]),
  `${id}: the seat it lost, byte-identical (a different row means the committed table is stale: run the generator's --check)`);
}
// the Kursk's seat is reached only through its seed: the projection's row is the first trial and holds
assert.equal(rows.t80u_kursk.report.checked,1,'t80u_kursk: found on the first trial, the projection row\'s seat');
console.log(`mission seat seeds: ${SAMPLE.length} ids seated again with their records dropped (${SAMPLE.filter(id=>!Object.hasOwn(DRONE_DOCK_EXEMPT,id)).length} seats byte-identical, 1 exempt); the T-80U Kursk from its projection row on the first trial`);
