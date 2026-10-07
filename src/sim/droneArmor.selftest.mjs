import assert from 'node:assert/strict';
import { Vector3, Euler } from 'three';
import { DRONE_WARHEAD } from './matchRuleset.ts';
import { createShell } from './ballistics.ts';
import { createCombatState, resolveShellHit, isHeClass } from './damage.ts';
import { traceTank, tankPoseFromState } from './armor.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';

const face=(name,z,mm,extra={})=>({name,verts:[[-1,0,z],[1,0,z],[1,2,z],[-1,2,z]],
  physicalMm:mm,keMm:mm,ceMm:mm,kind:'main',...extra});
const main=face('hull_front',0,300);
const make=(plates,screens)=>{
  const spec={id:'fixture',hp:5000,gun:{reloadS:1,shells:[DRONE_WARHEAD]},
    armor:{boundingRadiusM:3,turretPivot:[0,0,0],gunPivot:[0,0,0],hullPlates:plates,modules:[],crew:[],droneScreens:screens}};
  return {id:'target',spec,state:{pos:new Vector3(),yaw:0,turretYaw:0,gunPitch:0,visualPitch:0,visualRoll:0},combat:createCombatState(spec)};
};
function strike(target,from,to,rng=()=>.5,round=DRONE_WARHEAD){
  const dir=to.clone().sub(from).normalize();
  const shot=createShell(round,'pilot',true,from,dir,1);shot.pos.copy(to);
  const hits=traceTank(from,to,tankPoseFromState(target.state),target.spec.armor,target.combat.eraSpent,round.tracer==='DRONE');
  assert.ok(hits.length,'airframe actually reaches a surface before resolving the payload');
  return {event:resolveShellHit(shot,target,hits,rng),shot};
}
const from=new Vector3(0,1,2),to=new Vector3(0,1,-.2);
assert.equal(isHeClass(DRONE_WARHEAD.type),false,'FPV must not bypass shaped-charge protection as artillery HE');
assert.equal(strike(make([main]),from,to).event.kind,'pen','an unprotected penetrable plate remains vulnerable');
const skirt=face('side_skirt',1,20,{kind:'spaced'});
assert.equal(strike(make([main,skirt]),from,to).event.damage,0,'actual skirt thickness and air gap can stop the jet');
const era=face('reactive_tile',.4,15,{kind:'era',era:{keReduction:0,ceFlatMm:500}});
const reactive=make([main,era]);
assert.equal(strike(reactive,from,to).event.kind,'era');
assert.ok(reactive.combat.eraSpent.has('reactive_tile'),'the tile is consumed');
assert.equal(strike(reactive,from,to).event.kind,'pen','a spent tile cannot protect the same position again');

const cage=face('drone_cage',1,6,{kind:'spaced',droneInterception:.8});
const screened=()=>make([face('roof',0,20)],{hull:[cage]});
const shortFrom=new Vector3(0,1,1.1),shortTo=new Vector3(0,1,.9);
const stopped=strike(screened(),shortFrom,shortTo);
assert.equal(stopped.event.kind,'spaced_absorb');assert.equal(stopped.event.damage,0);assert.ok(stopped.shot.dead);
assert.ok(Math.abs(stopped.event.pos[2]-1)<1e-8,'intercept feedback is on the screen, not inside the hull');
const breached=strike(screened(),shortFrom,shortTo,()=>.95);
assert.equal(breached.event.kind,'pen','failed interception still resolves the jet through the gap beyond the slow airframe sweep');
assert.ok(breached.event.damage>0);assert.ok(breached.shot.dead,'the drone cannot continue flying through the target');
const behind=make([face('hull_front',0,20),face('rear_screen',-.5,6,{kind:'spaced',droneInterception:1})]);
assert.equal(strike(behind,from,new Vector3(0,1,-1)).event.kind,'pen','armor already penetrated cannot be retrospectively saved by a screen behind it');
const shape=tankPoseFromState(screened().state);
assert.equal(traceTank(shortFrom,shortTo,shape,screened().spec.armor).length,0,'drone-only lattice never becomes a solid anti-bullet sheet');
assert.equal(traceTank(new Vector3(1.2,1,1.1),new Vector3(1.2,1,.9),shape,screened().spec.armor,new Set(),true).length,0,'outside the actual cage footprint is unprotected');

await ensureAuthorityFleet(['ua_m1a1','ua_m1a1_x','t90m','m1a3']);
for(const id of ['ua_m1a1','ua_m1a1_x']){
  const spec=getSpec(id),panels=spec.armor.droneScreens?.turret;
  assert.ok(panels?.length>=8,`${id}: authored roof/flank/rear coverage is registered`);
  for(const plate of panels){
    const a=new Vector3(...plate.verts[0]),b=new Vector3(...plate.verts[1]),c=new Vector3(...plate.verts[2]);
    const normal=b.sub(a).cross(c.sub(a)).normalize();
    for(const point of plate.verts)assert.ok(Math.abs(new Vector3(...point).sub(a).dot(normal))<1e-8,`${id}/${plate.name}: finite planar contact face`);
    const center=plate.verts.reduce((out,p)=>out.add(new Vector3(...p)),new Vector3()).multiplyScalar(1/plate.verts.length).add(new Vector3(...spec.armor.turretPivot));
    const contacts=traceTank(center.clone().addScaledVector(normal,.02),center.clone().addScaledVector(normal,-.02),
      tankPoseFromState(make([]).state),spec.armor,new Set(),true);
    assert.ok(contacts.some(hit=>hit.kind==='plate'&&hit.plate.name===plate.name),`${id}/${plate.name}: each roof, flank and rear face can receive contact`);
  }
  for(const yaw of [-1.2,0,1.4]){
    const target={id,spec,state:{pos:new Vector3(9,2,-4),yaw:.3,turretYaw:yaw,gunPitch:0,visualPitch:.12,visualRoll:-.08},combat:createCombatState(spec)};
    const plate=panels.find(p=>p.name.startsWith('drone_cage_roof'));
    const center=plate.verts.reduce((out,p)=>out.add(new Vector3(...p)),new Vector3()).multiplyScalar(1/plate.verts.length);
    const normal=new Vector3().subVectors(new Vector3(...plate.verts[1]),new Vector3(...plate.verts[0]))
      .cross(new Vector3().subVectors(new Vector3(...plate.verts[2]),new Vector3(...plate.verts[0]))).normalize();
    const world=p=>p.applyAxisAngle(new Vector3(0,1,0),yaw).add(new Vector3(...spec.armor.turretPivot))
      .applyEuler(new Euler(-.12,.3,-.08,'YXZ')).add(target.state.pos);
    const result=strike(target,world(center.clone().addScaledVector(normal,.1)),world(center.clone().addScaledVector(normal,-.1)));
    assert.equal(result.event.kind,'spaced_absorb',`${id}: cage follows turret and hull attitude`);
    assert.equal(result.event.damage,0);
  }
}
const ua=getSpec('ua_m1a1'),pivot=new Vector3(...ua.armor.turretPivot);
const corridor=traceTank(new Vector3(0,3,1).add(pivot),new Vector3(0,1.1,1).add(pivot),
  tankPoseFromState(make([]).state),ua.armor,new Set(),true);
assert.ok(!corridor.some(h=>h.kind==='plate'&&h.plate.droneInterception),'open front gun corridor stays open');
assert.ok([...getSpec('m1a3').armor.hullPlates,...getSpec('m1a3').armor.turretPlates].some(p=>p.droneInterception===.55),'M1A3: authored slat screens also intercept FPV hits');
assert.ok(getSpec('t90m').armor.hullPlates.some(p=>p.name==='slat_cage'&&p.kind==='spaced'&&!p.droneInterception),'legacy inherited screen definitions retain normal spaced-armor protection without an unaudited interception bonus');
console.log('droneArmor: ERA consumption, spaced armor, cage interception/failure, short-sweep jet, gaps, both Ukrainian Abrams and articulated coverage passed');
