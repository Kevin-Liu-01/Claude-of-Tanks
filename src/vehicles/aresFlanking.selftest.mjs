import assert from 'node:assert/strict';
import {Vector3} from 'three';
import './tankFactory.ts';
import {getSpec} from './specs.ts';
import {decorManifestFor} from './decorations.ts';
import {penAtDistanceMm,createShell} from '../sim/ballistics.ts';
import {traceTank,tankPoseFromState} from '../sim/armor.ts';
import {createCombatState,resolveShellHit} from '../sim/damage.ts';
const ares=getSpec('ares_apc_x'),ap=ares.gun.shells[0];
assert.equal(ares.gun.reloadS,.14);assert.equal(ap.dmg,24);
for(const id of ['m1a2','t90m','leo2a6','challenger_3','k2_x']){
 const spec=getSpec(id),rear=spec.armor.hullPlates.find(p=>p.name==='hull_rear');assert.ok(rear);
 // Exercise the actual authored rear plate and combat resolver at 500 m.
 const center=rear.verts.reduce((v,p)=>v.add(new Vector3(...p)),new Vector3()).multiplyScalar(1/rear.verts.length);
 const from=center.clone().add(new Vector3(0,0,-10)),to=center.clone().add(new Vector3(0,0,1));
 const armor={boundingRadiusM:spec.armor.boundingRadiusM,turretPivot:[0,0,0],gunPivot:[0,0,0],gunBarrel:null,hullPlates:[rear],turretPlates:[],modules:[],crew:[]};
 const target={id:'rear-target',spec:{...spec,armor},state:{pos:new Vector3(),yaw:0,turretYaw:0,gunPitch:0,visualPitch:0,visualRoll:0},combat:createCombatState(spec)};
 const shell=createShell(ap,'ares',true,from,new Vector3(0,0,1),1);shell.prevPos.copy(from);shell.pos.copy(to);shell.distM=511;
 const hits=traceTank(from,to,tankPoseFromState(target.state),armor);
 const event=resolveShellHit(shell,target,hits,()=>.5);
 assert.ok(event.damage>0,`${id}: Ares AP must damage a square rear hit at 500 m (${JSON.stringify(event)})`);
 const front=spec.armor.hullPlates.find(p=>p.name==='upper_glacis');
 if(front)assert.ok(penAtDistanceMm(ap,100)<front.keMm,`${id}: front remains protected`);
}
for(const roll of [0,.3,.6,.99]){
 const manifest=decorManifestFor(ares,()=>roll);
 assert.ok(!manifest.some(row=>row.kit==='packs'||row.kit==='sandbags'));
 assert.ok(!manifest.some(row=>row.kit==='cargo'&&['long-duffel','large-rucksack','bedroll-pair','folded-tarp-pack','camo-net-bag','crew-backpack'].includes(row.v.v)));
 assert.ok(manifest.length>0,'retain the rest of the field equipment');
}
console.log('aresFlanking: rear penetration, retained cadence/damage, frontal protection and stowage pass');
