import type { CombatState } from '../sim/damage.ts';
/** Network snapshots refresh the selected weapon; retain an absolute match-time
 * deadline for a deselected launcher, without mutating authoritative combat. */
export function createVehicleCooldownReader() {
  const samples=new WeakMap<object,{remaining:number;at:number}>();
  return (combat:CombatState|null|undefined,slot:number,now:number):number=>{
    const channel=combat?.reloadChannels?.[slot] ?? (combat?.shellSlot===slot?combat.reload:null);
    if(!channel)return 0;
    let sample=samples.get(channel);
    if(!sample){sample={remaining:channel.t,at:now};samples.set(channel,sample);}
    else if(channel.t!==sample.remaining||now<sample.at){sample.remaining=channel.t;sample.at=now;}
    return Math.max(0,sample.remaining-(now-sample.at));
  };
}
