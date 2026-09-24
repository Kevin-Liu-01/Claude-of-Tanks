import assert from 'node:assert/strict';
import { Vector3, Euler } from 'three';
import { traceTank, queryAimArmor, blastTargets } from './armor.ts';
import { createCombatState, resolveShellHit, resolveHeBurst } from './damage.ts';
import { createShell } from './ballistics.ts';

const face = x => ({ name: `launcher_${x}`, verts: [[x-.2,2,1],[x+.2,2,1],[x+.2,2.4,1],[x-.2,2.4,1]],
  physicalMm: 10, keMm: 10, ceMm: 10, kind: 'external', moduleLink: 'missileRack',
  weaponHousing: true, convexPolygon: true });
const armor = { turretPivot: [0,0,0], gunPivot: [0,2,0],
  externalWeapons: [-1,1].map(x => ({ min:[x-.2,2,0],max:[x+.2,2.4,1],
    turretLocal:true,gunFollow:true,module:'missileRack',plates:[face(x)] })) };
const pose = {pos:new Vector3(),yaw:0,pitch:0,roll:0,turretYaw:0,gunPitch:0};
const hits = traceTank(new Vector3(1,2.2,3),new Vector3(1,2.2,-1),pose,armor);
assert.equal(hits.length,1,'external launcher housing is hittable outside the turret shell');
assert.equal(hits[0].plate.moduleLink,'missileRack');
assert(queryAimArmor(new Vector3(1,2.2,3),new Vector3(0,0,-1),4,pose,armor), 'aim feedback recognizes weapon housing');
assert.equal(traceTank(new Vector3(0,2.2,3),new Vector3(0,2.2,-1),pose,armor).length,0,'air between pods stays open');
assert(blastTargets(pose,armor).some(p=>p.name==='missileRack' && p.external),'blast can damage external launcher');
// Use independently transformed world rays through the elevated/yawed pod.
for (const yaw of [-1.2,0,.9]) for (const pitch of [-.1,0,.7]) {
  const moved = {...pose,yaw:.3,pitch:.12,roll:-.08,turretYaw:yaw,gunPitch:pitch,pos:new Vector3(8,2,-4)};
  const world = p => new Vector3(...p).sub(new Vector3(0,2,0)).applyAxisAngle(new Vector3(1,0,0),-pitch)
    .add(new Vector3(0,2,0)).applyAxisAngle(new Vector3(0,1,0),yaw)
    .applyEuler(new Euler(-moved.pitch,moved.yaw,moved.roll,'YXZ')).add(moved.pos);
  const hit = traceTank(world([1,2.2,1.2]),world([1,2.2,.8]),moved,armor);
  assert.equal(hit.length,1,'gun-follow housing moves with hull attitude, yaw and elevation');
  assert(hit[0].point.distanceTo(world([1,2.2,1]))<1e-8);
}
const round = {name:'probe',type:'AP',caliberMm:100,pen100Mm:500,pen1000Mm:500,dmg:100,velocityMps:800,moduleDmg:40};
const spec = {id:'fixture',hp:1000,gun:{reloadS:5,shells:[round]},
  armor:{...armor,modules:[{module:'missileRack',min:[-.2,0,-.2],max:[.2,.2,.2]}],crew:[]}};
const impact = (rng, extra = []) => {
  const combat=createCombatState(spec),target={id:'target',spec,state:{...pose,visualPitch:0,visualRoll:0},combat};
  const shell=createShell(round,'attacker',true,new Vector3(1,2.2,3),new Vector3(0,0,-1),1);
  shell.pos.set(1,2.2,-1);
  const event=resolveShellHit(shell,target,[...hits,...extra],rng);
  assert.equal(combat.hp,spec.hp,'external weapon hit does not invent a hull penetration');
  return {event,combat,shell,target};
};
const many=Array.from({length:20},(_,i)=>({...hits[0],t:.51+i*.01}));
const result=impact(()=>0,many);
assert.equal(result.event.modulesHit.length,1,'one shot rolls launcher damage once across all intersected stock');
assert(result.combat.modules.missileRack.hp<120,'damage reaches the actual combat module state');
const hpAfterFirstSegment=result.combat.modules.missileRack.hp;
assert.equal(result.shell.dead,false,'kinetic shell survives the external stock');
const continuation=resolveShellHit(result.shell,result.target,hits,()=>0);
assert.equal(continuation.modulesHit.length,0,'the next simulation segment cannot roll the same launcher again');
assert.equal(result.combat.modules.missileRack.hp,hpAfterFirstSegment,'continued flight preserves the first damage result');
const secondTarget={...result.target,id:'another-target',combat:createCombatState(spec)};
assert.equal(resolveShellHit(result.shell,secondTarget,hits,()=>0).modulesHit.length,1,
  'carry-through can still damage a different vehicle launcher');
let draws=0;const miss=impact(()=>{draws++;return .99;},many);
assert.equal(miss.event.modulesHit.length,0,'failed saving throw is not retried at each wall');
assert.equal(draws,3,'two projectile rolls and one module roll, independent of surface count');
resolveShellHit(miss.shell,miss.target,hits,()=>{draws++;return .99;});
assert.equal(draws,3,'a failed saving throw also stays final on later simulation steps');
miss.shell.penRollDone=false; // Same object returned by the solo shell pool.
const recycled=resolveShellHit(miss.shell,miss.target,hits,()=>0);
assert.equal(recycled.modulesHit.length,1,'a recycled projectile starts a fresh module damage ledger');
const explosive = {...round, type:'HE', pen100Mm:20, pen1000Mm:20};
const heCombat = createCombatState(spec);
const heTarget = {id:'target',spec,state:{...pose,visualPitch:0,visualRoll:0},combat:heCombat};
const he = createShell(explosive,'attacker',true,new Vector3(1,2.2,3),new Vector3(0,0,-1),1);
const heEvents = resolveHeBurst(he,hits[0].point,[heTarget],heTarget,[...hits,...many],()=>0);
assert.equal(heEvents[0].modulesHit.filter(h=>h.module==='missileRack').length,1,
  'direct explosive impact and blast sweep share one launcher damage roll');
assert(heCombat.modules.missileRack.hp<heCombat.modules.missileRack.maxHp,
  'explosions damage launcher module HP');
console.log('weaponHousing.selftest: articulated surfaces, gaps, aim feedback, blast targets and single-roll damage pass');
