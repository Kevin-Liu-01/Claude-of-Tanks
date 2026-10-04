import { createDroneFeedTransition } from './droneFeedTransition.ts';
import type { HudTank, HudMatchModeState } from './hud.ts';
import type { EventBus } from '../game/stateCore.ts';
import { AERIAL_RULES, matchRulesetFor } from '../sim/matchRuleset.ts';
import { createVehicleCooldownReader } from './vehicleControlCooldown.ts';
import { uiIconSVG, type UiIconId } from './uiIcons.ts';
import { t, getLocale } from './i18n.ts';
import { getAerialVision, nextAerialVision, setAerialVision, getScopeVision, cycleScopeVision, AERIAL_VIEWS, type AerialVision } from '../engine/aerialVision.ts';

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
function gunshipDesignation(escort:HudMatchModeState['escort']):string {
  return escort?t('flight.gunship.escort',{alive:escort.alive,rescued:escort.rescued,required:escort.required}):t('flight.gunship.role');
}
/** Mode-specific instruments keep the shared amber/slate HUD language and real controls. */
export function createAerialHud(parent:HTMLElement,bus:EventBus){
  const signal=node('div','cot-drone-signal-loss',parent);signal.hidden=true;
  signal.setAttribute('role','status');signal.textContent=t('flight.signalLost');
  const transition=createDroneFeedTransition();
  const grain=document.createElement('canvas');grain.width=grain.height=64;
  const context=grain.getContext('2d');if(context){const pixels=context.createImageData(64,64);let seed=593;for(let i=0;i<pixels.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const n=seed>>>24;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=n;pixels.data[i+3]=180;}context.putImageData(pixels,0,0);signal.style.setProperty('--signal-noise',`url(${grain.toDataURL()})`);}
  const scopeView=node('button','cot-scope-vision',parent);scopeView.type='button';scopeView.hidden=true;
  const scopeGlyph=icon(scopeView,'timeDay','scope-vision-emblem');
  const scopeCopy=node('span','scope-vision-copy',scopeView),scopeLabel=node('span','scope-vision-label',scopeCopy);
  const scopeTrack=node('span','scope-vision-track',scopeCopy);scopeTrack.setAttribute('aria-hidden','true');
  const scopeViews=['daylight','infrared','thermal','night'] as const;
  const scopeSteps=scopeViews.map(view=>{const step=node('span','scope-vision-step',scopeTrack);step.dataset.view=view;return step;});
  const scopeIcons:Record<AerialVision,UiIconId>={daylight:'timeDay',infrared:'visionInfrared',thermal:'visionThermal',night:'regionNight'};
  const scopeKey=node('kbd','flight-key',scopeView);scopeKey.setAttribute('aria-hidden','true');
  icon(scopeView,'undo','scope-vision-cycle');
  let priorScope:AerialVision|null=null,priorScopeKey='',priorScopeLocale='';
  // A sensor change the optics actually made (click or key) is announced once, for its sound.
  const switchScope=()=>{if(!scopeView.hidden){cycleScopeVision();bus.emit('ui:visionChanged',{});}};scopeView.addEventListener('click',switchScope);bus.on('ui:aerialVision',switchScope);
  const root=node('section' ,'cot-flight-hud',parent);root.hidden=true;
  const sight=node('div','flight-sight',root);sight.setAttribute('aria-hidden','true');
  const solution=node('div','gunship-solution',root);solution.hidden=true;
  const solutionLabel=node('span','gunship-solution-label',solution);
  const solutionTelemetry=node('div','gunship-solution-telemetry',solution);
  const zoom=instrument(solutionTelemetry,'zoomIn',t('flight.zoom'));
  const distance=instrument(solutionTelemetry,'scope',t('flight.range'));
  const panel=node('div','flight-console',root);
  const designation=node('div','flight-designation',panel);
  const designationIcon=icon(designation,'modeDrone');const designationLabel=node('span','',designation);
  const role=node('span','gunship-role',designation);role.hidden=true;role.textContent=t('flight.gunship.role');
  const heading=node('div','flight-heading',panel),emblem=icon(heading,'modeDrone','flight-emblem');
  const identity=node('button','flight-identity flight-view-switch',heading),title=node('strong','',identity);
  identity.type='button';
  const flightGlyph=icon(identity,'visionInfrared','flight-optic-icon');
  const feed=node('span','flight-feed',identity),viewLabel=node('span','',feed);icon(feed,'undo','flight-cycle-icon');
  const visionKey=node('kbd','flight-key flight-view-key',feed);visionKey.textContent='I';
  const flightTrack=node('span','scope-vision-track flight-view-track',identity);flightTrack.setAttribute('aria-hidden','true');
  const flightSteps=scopeViews.map(view=>{const step=node('span','scope-vision-step',flightTrack);step.dataset.view=view;return step;});
  let priorFlightVision:AerialVision|null=null;
  const switchView=()=>{if(!root.hidden&&!identity.disabled){setAerialVision(nextAerialVision());bus.emit('ui:visionChanged',{});}};
  identity.addEventListener('click',switchView);bus.on('ui:aerialVision',switchView);
  const telemetry=node('div','flight-telemetry',heading);
  const timer=instrument(telemetry,'reload',t('flight.battery'));
  const link=instrument(telemetry,'radio',t('flight.link'));
  const speedometer=instrument(telemetry,'speed',t('flight.speed'));
  const support=node('div','flight-support',heading);
  const supplyButtons=([{kind:'ammo',action:'supplyAmmo',glyph:'shell',key:'J'},{kind:'heal',action:'supplyHeal',glyph:'medkit',key:'K'}] as const).map(item=>{
    const button=node('button','flight-supply',support);button.type='button';button.dataset.supply=item.kind;
    icon(button,item.glyph);const status=node('small','',button),key=node('kbd','flight-key',button);key.textContent=item.key;
    button.addEventListener('click',()=>{if(!root.hidden&&root.dataset.kind==='gunship'&&!button.disabled)bus.emit('ui:'+item.action,{});});return{...item,button,status,key};
  });
  const battery=node('meter','flight-battery',panel);battery.min=0;battery.max=AERIAL_RULES.drone.batteryS;battery.setAttribute('aria-label',t('flight.battery'));
  const weapons=node('div','flight-weapons',panel);
  const weaponIcons:UiIconId[]=['roofGun','shell','missileRack'];
  const cards=weaponIcons.map((name,slot)=>{
    const button=node('button','flight-weapon',weapons);button.type='button';
    icon(button,name,'flight-weapon-icon');
    const copy=node('span','flight-weapon-copy',button),label=node('strong','',copy);label.textContent=t(`flight.weapon.${slot}`);
    const compact=node('strong','flight-weapon-compact',copy);compact.textContent=t(`flight.weapon.short.${slot}`);
    const status=node('small','',copy),key=node('kbd','flight-key',button);key.textContent=String(slot+1);
    button.setAttribute('aria-keyshortcuts',String(slot+1));
    button.addEventListener('click',()=>{if(!root.hidden&&root.dataset.kind==='gunship')bus.emit('ui:shellSelect',{slot});});
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
      card.button.setAttribute('aria-label',`${t(`flight.weapon.${slot}`)} · ${card.status.textContent}`);
      const total=player?.combat?.reloadChannels?.[slot]?.totalS??player?.spec?.gun.shells[slot]?.reloadS??1;
      card.button.style.setProperty('--weapon-ready',String(1-Math.min(1,wait/Math.max(.01,total))));
      if(selected){
        root.dataset.weapon=String(slot);root.classList.toggle('weapon-reloading',wait>0);
        solutionLabel.textContent=`${t(`flight.weapon.${slot}`)}${wait>0?` · ${wait.toFixed(1)}s`:''}`;
      }
    }
  }
  function updateScopeControls(visible:boolean,active:boolean,scoped:boolean,viewKey:string):void {
    scopeView.hidden=!visible||active||!scoped;
    const scope=getScopeVision(),scopeLocale=getLocale();
    if(scope!==priorScope||viewKey!==priorScopeKey||scopeLocale!==priorScopeLocale){
      const next=AERIAL_VIEWS[(AERIAL_VIEWS.indexOf(scope)+1)%AERIAL_VIEWS.length]!;
      scopeLabel.textContent=t('flight.view.'+scope);scopeKey.textContent=viewKey;
      scopeGlyph.innerHTML=uiIconSVG(scopeIcons[scope],22);scopeView.dataset.view=scope;
      for(const step of scopeSteps)step.classList.toggle('active',step.dataset.view===scope);
      scopeView.title=t('flight.view.next',{view:t('flight.view.'+next)});
      scopeView.setAttribute('aria-label',t('flight.view.switch',{current:t('flight.view.'+scope),next:t('flight.view.'+next)}));
      scopeView.setAttribute('aria-keyshortcuts',viewKey);
      priorScope=scope;priorScopeKey=viewKey;priorScopeLocale=scopeLocale;
    }
  }
  function updateSupplyControls(supplies?:{ammoReadyInS:number;healReadyInS:number},supplyKeys?:{ammo:string;heal:string}):void {
    for(const item of supplyButtons){
      const remaining=item.kind==='ammo'?supplies?.ammoReadyInS??0:supplies?.healReadyInS??0;
      item.button.disabled=remaining>0;item.status.textContent=remaining>0?`${Math.ceil(remaining)}s`:t('flight.supply.short.'+item.kind);
      item.key.textContent=supplyKeys?.[item.kind]??(item.kind==='ammo'?'J':'K');
      item.button.setAttribute('aria-keyshortcuts',item.key.textContent);
      item.button.title=t('flight.supply.'+item.kind);item.button.setAttribute('aria-label',item.button.title+(remaining>0?` · ${Math.ceil(remaining)}s`:''));
    }
  }
  return {
    update(player:HudTank|null|undefined,now:number,fov:number,dist:number,visible:boolean,key='V',thermalReady=false,viewKey='I',supplies?:{ammoReadyInS:number;healReadyInS:number},supplyKeys?:{ammo:string;heal:string},scoped=false,escort?:HudMatchModeState['escort']){
      const view=player?.aerial,active=!!view?.active&&visible;
      const signalLevel=transition.step(active&&view?.kind==='drone'&&thermalReady,active,visible,performance.now());
      signal.hidden=signalLevel<=0;signal.style.opacity=String(Math.min(1,signalLevel*2));
      updateScopeControls(visible,active,scoped,viewKey);
      root.hidden=!active;document.documentElement.dataset.flight=active?view!.kind:'';
      if(!active||!view){wasActive=false;return;}
      identity.disabled=!thermalReady;visionKey.textContent=viewKey;
      const flightVision=getAerialVision();
      viewLabel.textContent=t('flight.view.'+flightVision);
      root.dataset.view=flightVision;
      if(flightVision!==priorFlightVision){
        flightGlyph.innerHTML=uiIconSVG(scopeIcons[flightVision],22);
        for(const step of flightSteps)step.classList.toggle('active',step.dataset.view===flightVision);
        priorFlightVision=flightVision;
      }
      identity.setAttribute('aria-keyshortcuts',viewKey);
      identity.title=t('flight.view.next',{view:t('flight.view.'+nextAerialVision())});
      identity.setAttribute('aria-label',t('flight.view.switch',{current:t('flight.view.'+getAerialVision()),next:t('flight.view.'+nextAerialVision())}));
      const drone=view.kind==='drone';support.hidden=drone;solution.hidden=drone;role.hidden=drone;
      role.textContent=gunshipDesignation(escort);
      updateSupplyControls(supplies,supplyKeys);
      root.dataset.kind=view.kind;backKey.textContent=key;
      back.setAttribute('aria-keyshortcuts',key);
      if(kind!==view.kind){kind=view.kind;emblem.innerHTML=uiIconSVG(drone?'modeDrone':'modeAc130',24);designationIcon.innerHTML=uiIconSVG(drone?'modeDrone':'modeAc130',22);}
      title.textContent=drone?t(view.launching?'flight.launching':'flight.drone'):t('flight.gunship');
      designation.hidden=false;designationLabel.textContent=title.textContent;
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
