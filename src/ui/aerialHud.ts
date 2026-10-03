import type { HudTank } from './hud.ts';
import type { EventBus } from '../game/stateCore.ts';
import { AERIAL_RULES, matchRulesetFor } from '../sim/matchRuleset.ts';
import { createVehicleCooldownReader } from './vehicleControlCooldown.ts';
import { uiIconSVG, type UiIconId } from './uiIcons.ts';
import { t } from './i18n.ts';
import { getAerialVision, nextAerialVision, setAerialVision } from '../engine/aerialVision.ts';

const GUNSHIP_UNLIMITED=matchRulesetFor('ac130').ammo==='unlimited';
function node<K extends keyof HTMLElementTagNameMap>(tag:K,cls:string,parent:HTMLElement):HTMLElementTagNameMap[K]{
  const element=document.createElement(tag);element.className=cls;parent.append(element);return element;
}
function icon(parent:HTMLElement,name:UiIconId,cls='flight-icon'):HTMLElement {
  const host=node('span',cls,parent);host.innerHTML=uiIconSVG(name,22);host.setAttribute('aria-hidden','true');return host;
}
function instrument(parent:HTMLElement,name:UiIconId,label:string){
  const host=node('span','flight-instrument',parent);host.title=label;host.setAttribute('aria-label',label);
  icon(host,name);const value=node('b','',host);return {host,value};
}
/** Mode-specific instruments keep the shared amber/slate HUD language and real controls. */
export function createAerialHud(parent:HTMLElement,bus:EventBus){
  const root=node('section','cot-flight-hud',parent);root.hidden=true;
  const sight=node('div','flight-sight',root);sight.setAttribute('aria-hidden','true');
  const panel=node('div','flight-console',root);
  const heading=node('div','flight-heading',panel),emblem=icon(heading,'modeDrone','flight-emblem');
  const identity=node('button','flight-identity flight-view-switch',heading),title=node('strong','',identity);
  identity.type='button';
  const feed=node('span','flight-feed',identity),viewLabel=node('span','',feed);icon(feed,'undo','flight-cycle-icon');
  const visionKey=node('kbd','flight-key flight-view-key',feed);visionKey.textContent='I';
  const switchView=()=>{if(!root.hidden&&!identity.disabled)setAerialVision(nextAerialVision());};
  identity.addEventListener('click',switchView);bus.on('ui:aerialVision',switchView);
  const telemetry=node('div','flight-telemetry',heading);
  const timer=instrument(telemetry,'reload',t('flight.battery'));
  const link=instrument(telemetry,'radio',t('flight.link'));
  const speedometer=instrument(telemetry,'speed',t('flight.speed'));
  const zoom=instrument(telemetry,'zoomIn',t('flight.zoom'));
  const distance=instrument(telemetry,'scope',t('flight.range'));
  const battery=node('meter','flight-battery',panel);battery.min=0;battery.max=AERIAL_RULES.drone.batteryS;battery.setAttribute('aria-label',t('flight.battery'));
  const weapons=node('div','flight-weapons',panel);
  const weaponIcons:UiIconId[]=['roofGun','shell','missileRack'];
  const cards=weaponIcons.map((name,slot)=>{
    const button=node('button','flight-weapon',weapons);button.type='button';
    icon(button,name,'flight-weapon-icon');
    const copy=node('span','flight-weapon-copy',button),label=node('strong','',copy);label.textContent=t(`flight.weapon.${slot}`);
    const status=node('small','',copy),key=node('kbd','flight-key',button);key.textContent=String(slot+1);
    button.addEventListener('click',()=>bus.emit('ui:shellSelect',{slot}));
    return {button,status};
  });
  const actions=node('div','flight-actions',panel),hint=node('span','flight-hint',actions);
  const back=node('button','cot-drone-return',actions);back.type='button';icon(back,'undo');
  const backLabel=node('span','',back);backLabel.textContent=t('flight.return');
  const backKey=node('kbd','flight-key',back);backKey.textContent='V';
  back.addEventListener('click',()=>bus.emit('ui:drone',{}));
  const reload=createVehicleCooldownReader();
  let priorTime=0,priorX=0,priorY=0,priorZ=0,speed=0,wasActive=false,kind='';
  function updateWeapons(player:HudTank|null|undefined,now:number):void {
    for(let slot=0;slot<cards.length;slot++){
      const card=cards[slot]!,wait=reload(player?.combat,slot,now),selected=player?.combat?.shellSlot===slot;
      card.button.setAttribute('aria-pressed',String(selected));card.button.classList.toggle('reloading',wait>0);
      const ammo=player?.combat?.ammo?.[slot];
      card.status.textContent=wait>0?`${wait.toFixed(1)}s`:t('flight.ready',{ammo:GUNSHIP_UNLIMITED||ammo===Infinity?'∞':String(ammo??0)});
    }
  }
  return {
    update(player:HudTank|null|undefined,now:number,fov:number,dist:number,visible:boolean,key='V',thermalReady=false,viewKey='I'){
      const view=player?.aerial,active=!!view?.active&&visible;
      root.hidden=!active;document.documentElement.dataset.flight=active?view!.kind:'';
      if(!active||!view){wasActive=false;return;}
      identity.disabled=!thermalReady;visionKey.textContent=viewKey;
      viewLabel.textContent=t('flight.view.'+getAerialVision());
      identity.title=t('flight.view.next',{view:t('flight.view.'+nextAerialVision())});
      identity.setAttribute('aria-label',t('flight.view.switch',{current:t('flight.view.'+getAerialVision()),next:t('flight.view.'+nextAerialVision())}));
      const drone=view.kind==='drone';root.dataset.kind=view.kind;backKey.textContent=key;
      if(kind!==view.kind){kind=view.kind;emblem.innerHTML=uiIconSVG(drone?'modeDrone':'modeAc130',24);}
      title.textContent=drone?t(view.launching?'flight.launching':'flight.drone'):t('flight.gunship');
      const elapsed=now-priorTime;
      if(wasActive&&elapsed>0)speed+=.2*(Math.hypot(view.x-priorX,view.y-priorY,view.z-priorZ)/elapsed-speed);
      priorTime=now;priorX=view.x;priorY=view.y;priorZ=view.z;wasActive=true;
      const carrier=player?.state?.pos,range=carrier?Math.hypot(view.x-carrier.x,view.z-carrier.z):0;
      timer.host.hidden=link.host.hidden=speedometer.host.hidden=!drone;
      zoom.host.hidden=distance.host.hidden=drone;
      timer.value.textContent=`${Math.ceil(view.batteryS)}s`;link.value.textContent=`${Math.round(range)}m`;speedometer.value.textContent=`${Math.round(speed*3.6)}km/h`;
      zoom.value.textContent=`×${(55/fov).toFixed(1)}`;distance.value.textContent=`${Math.round(dist)}m`;
      battery.hidden=!drone;battery.value=view.batteryS;
      root.classList.toggle('low-battery',drone&&view.batteryS<10);
      weapons.hidden=drone;back.hidden=!drone;
      hint.textContent=t(drone?'flight.hint.drone':'flight.hint.gunship');
      updateWeapons(player,now);
    },
  };
}
