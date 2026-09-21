import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { createTank } from '../vehicles/tankFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { createCombatState, startPostShotReload, selectShell, tickReload } from './damage.ts';
import { SIM_DT } from './movement.ts';
import { sustainedPrimaryDpm } from '../vehicles/balanceAudit.ts';
import { createTankState } from './movement.ts';
import { createGameState, createBus, simStep } from '../game/state.ts';
const flat={getHeightAt:()=>0,getGroundType:()=>'hard',getNormalAt:()=>new Vector3(0,1,0)};
const input={throttle:0,steer:0,brake:true,fire:true,aimYaw:0,aimPitch:.25,aimDistance:300,shellSlot:0,actionBits:0};
const roles={ztz100_prototype:[0,21,741,762],object695_x:[0,39,78,117,957,996],griffin_viper:Array.from({length:18},(_,i)=>i*60)};
for(const [id,expected]of Object.entries(roles)){
  const match=createAuthoritativeMatch({mapId:'verdant',countdownS:0,seed:12,
    worldCollision:{mapId:'verdant',heightField:flat,obstacles:[]},players:[
      {id:'shooter',specId:id,team:'alpha',spawn:{x:0,z:0,yaw:0}},
      {id:'target',specId:'m1a2',team:'bravo',spawn:{x:400,z:-400,yaw:0}},
    ]});
  match.onMatchReady();const entity=match.entityById.get('shooter'),events=[];
  entity.state.gunPitch=.25; entity.combat.equipMults={};
  const visual=createTank(id,null,{proceduralOnly:true,quality:'low',geometryReceipt:true});visual.prepareForSimulation();
  try{
    for(let tick=0;tick<=expected.at(-1);tick++){
      match.step({dt:SIM_DT,inputs:new Map([['shooter',input]])});
      const snap=match.snapshot({tick,serverTimeMs:tick*1000/60,viewerId:'shooter',ackInputSeq:tick});
      for(const event of snap.events.filter(e=>e.type==='shell_fired'&&e.shooterId==='shooter')){
        assert.equal(event.muzzleIndex,events.length%entity.spec.gun.launcherMuzzles.length);
        visual.syncFromState(entity.state,0);visual.root.updateMatrixWorld(true);
        const tip=visual.gunMuzzleWorld(new Vector3(),event.muzzleIndex,true);
        assert(tip.distanceTo(new Vector3(event.x,event.y,event.z))<.004,`${id} native mouth and authority`);
        events.push(tick);
      }
      match.afterSnapshotBroadcast();
    }
    assert.deepEqual(events,expected,`${id} exact 60Hz firing cadence`);
    assert.equal(entity.combat.ammo[0],entity.spec.gun.shells[0].count-expected.length);
  }finally{visual.dispose();}
  console.log(id,expected,'DPM',sustainedPrimaryDpm(getSpec(id)));
}
// Switching warhead or to the backup gun cannot reset a salvo or skip rack cooldown.
for(const id of ['ztz100_prototype','object695_x']){
  const spec=getSpec(id),c=createCombatState(spec);
  startPostShotReload(c,spec);const progress=c.launcherSalvoShots;
  assert.equal(c.reload.kind,'intraClip');
  selectShell(c,1,spec);assert.equal(c.reload.t,spec.gun.shells[1].reloadS);
  selectShell(c,2,spec);startPostShotReload(c,spec);
  assert.equal(c.launcherSalvoShots,progress);
  tickReload(c,1);selectShell(c,0,spec);assert.equal(c.reload.t,spec.gun.shells[0].reloadS);
  c.modules.missileRack.state='red';startPostShotReload(c,spec);
  assert(c.reload.t>spec.gun.launcherSalvo.intervalS,'damaged rack slows the firing cycle');
}
// Local combat uses the same finite missile inventory and salvo clock.
for (const id of Object.keys(roles)) {
  const spec = getSpec(id), slot = 0;
  const expected = roles[id], game = createGameState(), fired = [];
  const combat = createCombatState(spec); combat.equipMults = {};
  combat.shellSlot = slot; combat.reload = combat.reloadChannels[slot];
  const entity = { id:'solo', specId:id, spec, isPlayer:true, team:'player', combat,
    state:createTankState(spec,new Vector3(),0), input:{...input,shellSlot:slot},
    visual:{root:new Group(), gunMuzzleWorld(out,index,launcher) {
      assert.equal(launcher,true);
      return out.set(0,5,10);
    }, gunDirWorld(out) { return out.set(0,.25,1).normalize(); },
    recoilKick(age,scale,index,launcher) { assert.equal(launcher,true); return index ?? -1; }} };
  game.tanks=[entity];game.allTanks=[entity];game.tankById.set(entity.id,entity);
  let tick=0;
  const bus=createBus((name,payload)=>{if(name==='shell:fired')fired.push({tick,payload});});
  const collider={setSelf(){},collide(){return false;},pendingCrush:[],pendingRams:[],queueRam(){}};
  for(;tick<=expected.at(-1);tick++)simStep(game,bus,{heightField:flat,raycast:()=>null},null,collider);
  assert.deepEqual(fired.map(e=>e.tick),expected,`${id}: solo/authority timing parity`);
  assert.equal(combat.ammo[slot],spec.gun.shells[slot].count-expected.length);
  assert(fired.every(e=>e.payload.caliberMm===spec.gun.shells[slot].caliberMm));
}

console.log('missileRoles: exact paired/ripple/one-second solo and authority, finite inventory and switching PASS');
