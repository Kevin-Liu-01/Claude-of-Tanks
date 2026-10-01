import assert from 'node:assert/strict';
import '../src/vehicles/fleetFactory.ts';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.ts';
import { createDedicatedWorldCollision } from './dedicatedWorldCollision.ts';
import { PLAYER_ACTION_BITS } from '../src/net/protocol.ts';
import { SIM_DT } from '../src/sim/movement.ts';

// Real terrain, structures, routes, objective controllers and fall physics.
// Pure CPU simulation: no renderer or external model can hide a failed route.
const maps=['verdant','cliffbridge','moon','alpine'];
const modes=['capture_the_flag','zone_control','mars','turbo_ball','frontline_assault','endless_horde'];
let totalFalls=0, totalJumps=0;
const jumpsByMode = new Map();
for(const mapId of maps){
  for(const gameMode of modes){
    const world=createDedicatedWorldCollision(mapId);
    const players=[{id:'human',specId:'m1a2',team:'alpha'}];
    for(let i=0;i<7;i++)players.push({id:`bot-${i}`,specId:['m1a2','t90m','leo2a7v'][i%3],team:i<3?'alpha':'bravo',bot:true});
    const match=createAuthoritativeMatch({mapId,gameMode,seed:57001,countdownS:0,worldCollision:world,players});
    match.onMatchReady();
    const starts=new Map(match.entities.map(e=>[e.id,e.state.pos.clone()]));
    const moved=new Set(), active=new Set(), inputs=new Map();
    let falls=0,jumps=0,worstFall=0,routeDecisions=0;
    for (const bot of match.entities.filter(e => e.bot)) {
      const update = bot.aiCtl.update.bind(bot.aiCtl);
      bot.aiCtl.update = (dt, timeS) => {
        update(dt, timeS);
        if (bot.input.actionBits & PLAYER_ACTION_BITS.SELF_RIGHT && !bot.state.overturned) jumps++;
      };
    }
    for(let tick=0;tick<90*60&&!match.result;tick++){
      match.step({dt:SIM_DT,inputs});
      for(const bot of match.entities){
        if(!bot.bot||bot.modeActive===false||bot.combat.destroyed)continue;
        active.add(bot.id);
        if(bot.state.pos.distanceTo(starts.get(bot.id))>10)moved.add(bot.id);
        assert.ok(Number.isFinite(bot.state.pos.x)&&Number.isFinite(bot.state.pos.y)&&Number.isFinite(bot.state.pos.z),'finite bot pose');
        if(tick%60===0&&match.modeController.botObjective(bot))routeDecisions++;
      }
      if(tick%15===0){
        const snapshot=match.snapshot({tick,serverTimeMs:tick*1000/60});
        for(const event of snapshot.events){
          if(event.type==='tank_impact'&&event.cause==='fall'&&event.damage>0&&match.entityById.get(event.id)?.bot){
            falls++;worstFall=Math.max(worstFall,event.damage);
          }
        }
        match.afterSnapshotBroadcast();
      }
    }
    assert.ok(moved.size>=Math.ceil(active.size/2),`${mapId}/${gameMode}: mission movement ${moved.size}/${active.size}`);
    assert.ok(routeDecisions>0,`${mapId}/${gameMode}: bots receive live mission assignments`);
    assert.ok(worstFall<800,`${mapId}/${gameMode}: catastrophic bot fall (${worstFall} HP)`);
    totalFalls+=falls;totalJumps+=jumps;
    jumpsByMode.set(gameMode, (jumpsByMode.get(gameMode) ?? 0) + jumps);
    console.log(`${mapId}/${gameMode}: moving=${moved.size}/${active.size} objectiveReads=${routeDecisions} damagingFalls=${falls} worstFall=${worstFall} jumpCommands=${jumps}`);
  }
}
for (const mode of ['mars', 'turbo_ball']) {
  assert.ok(jumpsByMode.get(mode) > 0, `${mode}: real-map combat must exercise the grounded jump decision`);
}
console.log(`botModes.selftest: ${maps.length*modes.length} real-map mode scenarios passed; damagingFalls=${totalFalls}, jumpCommands=${totalJumps}`);
