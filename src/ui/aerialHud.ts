import type { HudTank } from './hud.ts';
import type { EventBus } from '../game/stateCore.ts';
import { AERIAL_RULES, matchRulesetFor } from '../sim/matchRuleset.ts';
import { createVehicleCooldownReader } from './vehicleControlCooldown.ts';
import { t } from './i18n.ts';
import './aerialHud.css';

const GUNSHIP_UNLIMITED=matchRulesetFor('ac130').ammo==='unlimited';

function node<K extends keyof HTMLElementTagNameMap>(tag:K,cls:string,parent:HTMLElement):HTMLElementTagNameMap[K]{
  const element=document.createElement(tag);element.className=cls;parent.append(element);return element;
}
/** Flight owns its actual controls; the tank interface returns when the pilot returns. */
export function createAerialHud(parent:HTMLElement,bus:EventBus){
  const root=node('section','cot-flight-hud',parent);root.hidden=true;
  const sight=node('div','flight-sight',root);sight.setAttribute('aria-hidden','true');
  const panel=node('div','flight-console',root);
  const heading=node('div','flight-heading',panel),title=node('strong','',heading),telemetry=node('span','flight-telemetry',heading);
  const battery=node('meter','flight-battery',panel);battery.min=0;battery.max=AERIAL_RULES.drone.batteryS;battery.setAttribute('aria-label',t('flight.battery'));
  const weapons=node('div','flight-weapons',panel);
  const cards=Array.from({length:3},(_,slot)=>{
    const button=node('button','flight-weapon',weapons);button.type='button';
    const key=node('kbd','',button);key.textContent=String(slot+1);
    const label=node('span','',button);label.textContent=t(`flight.weapon.${slot}`);
    const status=node('small','',button);
    button.addEventListener('click',()=>bus.emit('ui:shellSelect',{slot}));
    return {button,status};
  });
  const actions=node('div','flight-actions',panel),hint=node('span','flight-hint',actions);
  const back=node('button','cot-drone-return',actions);back.type='button';back.textContent=t('flight.return');
  back.addEventListener('click',()=>bus.emit('ui:drone',{}));
  const reload=createVehicleCooldownReader();
  let priorTime=0,priorX=0,priorY=0,priorZ=0,speed=0,wasActive=false;
  return {
    update(player:HudTank|null|undefined,now:number,fov:number,dist:number,visible:boolean){
      const view=player?.aerial,active=!!view?.active&&visible;
      root.hidden=!active;
      document.documentElement.dataset.flight=active?view!.kind:'';
      if(!active||!view){wasActive=false;return;}
      const drone=view.kind==='drone';root.dataset.kind=view.kind;
      title.textContent=drone?t(view.launching?'flight.launching':'flight.drone'):t('flight.gunship');
      const elapsed=now-priorTime;
      if(wasActive&&elapsed>0) speed+=.2*(Math.hypot(view.x-priorX,view.y-priorY,view.z-priorZ)/elapsed-speed);
      priorTime=now;priorX=view.x;priorY=view.y;priorZ=view.z;wasActive=true;
      const carrier=player?.state?.pos;
      const range=carrier?Math.hypot(view.x-carrier.x,view.z-carrier.z):0;
      telemetry.textContent=drone?t('flight.telemetry.drone',{seconds:Math.ceil(view.batteryS),range:Math.round(range),speed:Math.round(speed*3.6)})
        :t('flight.telemetry.gunship',{zoom:(55/fov).toFixed(1),range:Math.round(dist)});
      battery.hidden=!drone;battery.value=view.batteryS;
      weapons.hidden=drone;back.hidden=!drone;
      hint.textContent=t(drone?'flight.hint.drone':'flight.hint.gunship');
      for(let slot=0;slot<cards.length;slot++){
        const card=cards[slot]!,wait=reload(player?.combat,slot,now),selected=player?.combat?.shellSlot===slot;
        card.button.setAttribute('aria-pressed',String(selected));
        const ammo=player?.combat?.ammo?.[slot];
        card.status.textContent=wait>0?`${wait.toFixed(1)}s`:t('flight.ready',{ammo:GUNSHIP_UNLIMITED||ammo===Infinity?'∞':String(ammo??0)});
      }
    },
  };
}
