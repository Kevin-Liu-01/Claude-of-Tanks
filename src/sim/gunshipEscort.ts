import type { MatchModeEntity, MatchModeResult } from './matchModes.ts';

export const ESCORT_RULES = Object.freeze({ hpScale:.9, reloadScale:2, speedScale:.65, radiusM:26 });
export interface EscortState {
  total:number; alive:number; rescued:number; required:number; progress:number;
  x:number; y:number; z:number;
}
/** Ground troops use the normal navigation, combat and destruction simulation.
 * Arrival is spatial, never a timer pretending that the convoy moved. */
export function createGunshipEscort<Entity extends MatchModeEntity>(entities:Entity[], destination:{x:number;y:number;z:number}, setActive:(entity:Entity,active:boolean)=>void) {
  const friends=entities.filter(e=>e.bot && e.team!=='bravo' && e.team!=='enemy');
  const rescued=new Set<string>();
  const starting=new Map(friends.map(e=>[e.id,Math.max(1,Math.hypot(e.state.pos.x-destination.x,e.state.pos.z-destination.z))]));
  const state:EscortState={...destination,total:friends.length,alive:friends.length,rescued:0,required:Math.max(1,Math.ceil(friends.length/2)),progress:0};
  for(const friend of friends){
    friend.combat.maxHp=Math.max(1,Math.round(friend.combat.maxHp*ESCORT_RULES.hpScale));friend.combat.hp=friend.combat.maxHp;
    const mults=friend.combat.equipMults??(friend.combat.equipMults={});mults.reload=(mults.reload??1)*ESCORT_RULES.reloadScale;
  }
  function update():void {
    let alive=0,progress=0;
    for(const friend of friends){
      if(rescued.has(friend.id)){progress++;continue;}
      if(friend.combat.destroyed)continue;
      alive++;
      const distance=Math.hypot(friend.state.pos.x-state.x,friend.state.pos.z-state.z);
      progress+=Math.max(0,Math.min(1,1-distance/(starting.get(friend.id)??1)));
    }
    state.alive=alive;state.rescued=rescued.size;state.progress=friends.length?progress/friends.length:0;
  }
  function hideRescued(friend:Entity):void { friend.modeActive=false;friend.state.speed=0;setActive(friend,false); }
  return {
    state,
    step(timeS:number,limitS:number):MatchModeResult|null {
      for(const friend of friends)if(!rescued.has(friend.id)&&!friend.combat.destroyed&&Math.hypot(friend.state.pos.x-state.x,friend.state.pos.z-state.z)<=ESCORT_RULES.radiusM){rescued.add(friend.id);hideRescued(friend);}
      update();
      if(state.rescued>=state.required)return {result:'alpha',reason:'escort_extracted'};
      if(state.total>0 && state.alive+state.rescued<state.required)return {result:'bravo',reason:'escort_lost'};
      if(timeS>=limitS)return {result:'bravo',reason:'escort_time_expired'};
      return null;
    },
    target(entity:Entity):{x:number;z:number;mission:'carrier'|'raid'}|null {
      if(friends.includes(entity))return {x:state.x,z:state.z,mission:'carrier'};
      if(entity.team!=='bravo'&&entity.team!=='enemy')return null;
      let nearest:Entity|null=null,best=Infinity;
      for(const friend of friends){
        if(friend.combat.destroyed||rescued.has(friend.id))continue;
        const distance=Math.hypot(friend.state.pos.x-entity.state.pos.x,friend.state.pos.z-entity.state.pos.z);
        if(distance<best){nearest=friend;best=distance;}
      }
      return nearest?{x:nearest.state.pos.x,z:nearest.state.pos.z,mission:'raid'}:null;
    },
    capture(){return [...rescued];},
    restore(ids:readonly string[]){rescued.clear();for(const friend of friends)if(ids.includes(friend.id)){rescued.add(friend.id);hideRescued(friend);}update();},
  };
}
