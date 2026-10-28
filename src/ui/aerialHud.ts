import { createDroneFeedTransition } from './droneFeedTransition.ts';
import type { HudTank, HudMatchModeState } from './hud.ts';
import type { EventBus } from '../game/stateCore.ts';
import { AERIAL_RULES, matchRulesetFor } from '../sim/matchRuleset.ts';
import { createVehicleCooldownReader } from './vehicleControlCooldown.ts';
import { dronePhase } from './droneControlState.ts';
import { uiIconSVG, type UiIconId } from './uiIcons.ts';
import { vehicleAction } from '../game/vehicleActions.ts';
import { markDatum } from './dom.ts';
import { t, getLocale } from './i18n.ts';
import { setAttr, setData, setDisabled, setHidden, setStyle, setText } from './domWrite.ts';
import { getAerialVision, nextAerialVision, setAerialVision, getScopeVision, cycleScopeVision, setScopeVision, type AerialVision } from '../engine/aerialVision.ts';
import { segmented, setRoving, wireRoving } from './components/components.ts';
import type { IconId } from './icons/icon.ts';
import { scratchCanvas } from './uiCanvas.ts';

const GUNSHIP_UNLIMITED=matchRulesetFor('ac130').ammo==='unlimited';
function node<K extends keyof HTMLElementTagNameMap>(tag:K,cls:string,parent:HTMLElement):HTMLElementTagNameMap[K]{
  const element=document.createElement(tag);element.className=cls;parent.append(element);return element;
}
/** A flight's controls line (owner 2026-10-25: only "when its needed"): each kind's first FLIGHT_HINTS flights show it
 *  for FLIGHT_HINT_S seconds, counted in the browser (cot.flight.hints.v1); the keys are Settings > Controls' after that. */
const FLIGHT_HINTS=2,FLIGHT_HINT_S=12,FLIGHT_HINTS_KEY='cot.flight.hints.v1';
function takeFlightHint(kind:string):boolean{
  try{
    const seen=JSON.parse(localStorage.getItem(FLIGHT_HINTS_KEY)||'{}') as Record<string,number>;
    const count=Number(seen[kind])||0;
    if(count>=FLIGHT_HINTS)return false;
    seen[kind]=count+1;localStorage.setItem(FLIGHT_HINTS_KEY,JSON.stringify(seen));
    return true;
  }catch{return false;}
}
function icon(parent:HTMLElement,name:UiIconId,cls='flight-icon'):HTMLElement {
  const host=node('span',cls,parent);host.innerHTML=uiIconSVG(name,22);host.setAttribute('aria-hidden','true');return host;
}
function instrument(parent:HTMLElement,name:UiIconId,label:string){
  const host=node('span','flight-instrument',parent);host.dataset.tip=label;host.setAttribute('aria-label',label);
  icon(host,name);const value=node('b','num',host);return {host,value};
}
/** The gunship's line beside its name: nothing (owner UI rules: no eyebrow, "FIRE SUPPORT" said what the name does; an
 *  escort's progress is the objective plate's, UI-LOCKDOWN B9). */
function gunshipDesignation(_escort:HudMatchModeState['escort']):string {
  return '';
}
/** The ground under the drone for its altitude readout (the HUD's terrain height field), or null before a map loads. */
type AerialGround=()=>{getHeightAt(x:number,z:number):number}|null;
/** Height above the ground a pilot reads: whole metres, one decimal below 10 m (the low-flight band where a metre
 * matters), never negative (the sim keeps the airframe above the ground; a probe a few centimetres off reads 0). */
export function formatDroneAltitude(heightM:number):string{
  // (its unit after a narrow space, as the HUD's "200 m" and "3.2 s" read: gauntlet r2)
  const h=Math.max(0,heightM);return h<9.95?`${h.toFixed(1)}\u202fm`:`${Math.round(h)}\u202fm`;
}
/** The scope's four views in the switch's order, left to right (the I key steps through them in AERIAL_VIEWS's ring). */
const SCOPE_VIEWS=['daylight','infrared','thermal','night'] as const satisfies readonly AerialVision[];
/** Mode-specific instruments keep the shared amber/slate HUD language and real controls. */
export function createAerialHud(parent:HTMLElement,bus:EventBus,ground:AerialGround=()=>null){
  const signal=node('div','cot-drone-signal-loss',parent);signal.hidden=true;
  signal.setAttribute('role','status');signal.textContent=t('flight.signalLost');
  const transition=createDroneFeedTransition();
  const grain=scratchCanvas(64,64);
  const context=grain.getContext('2d');if(context){const pixels=context.createImageData(64,64);let seed=593;for(let i=0;i<pixels.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const n=seed>>>24;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=n;pixels.data[i+3]=180;}context.putImageData(pixels,0,0);signal.style.setProperty('--signal-noise',`url(${grain.toDataURL()})`);}
  // The scope's vision switch: the kit's segmented control on the HUD's plate (the owner's audit, 2026-10-27: "audit all
  // dropdowns and ui surfaces and make sure they share components"), a glyph a view, the lit view's tag beside its glyph
  // (critic 236: the view is never a bare symbol); a press picks a view outright, the I key steps through them.
  const scopeView=node('div','cot-scope-vision',parent);scopeView.hidden=true;
  // (glyphs of both sets: the kit's sprite for the switch, the HUD's for the flight console)
  const scopeIcons={daylight:'timeDay',infrared:'visionInfrared',thermal:'visionThermal',night:'regionNight'} as const satisfies Record<AerialVision,UiIconId&IconId>;
  scopeView.insertAdjacentHTML('beforeend',segmented({label:t('flight.view.action'),className:'cot-scope-vision-seg',value:getScopeVision(),
    options:SCOPE_VIEWS.map(view=>({value:view,label:t('flight.view.'+view),icon:scopeIcons[view],iconOnly:true}))}));
  const scopeSeg=scopeView.querySelector<HTMLElement>('.cot-scope-vision-seg')!;
  const scopeOptions=[...scopeSeg.querySelectorAll<HTMLElement>('.cot-c-seg__opt')];
  const scopeTags=scopeOptions.map(option=>{const tag=node('span','scope-vision-tag',option);tag.setAttribute('aria-hidden','true');return tag;});
  const scopeKey=node('kbd','flight-key',scopeView);scopeKey.setAttribute('aria-hidden','true');
  let priorScope:AerialVision|null=null,priorScopeKey='',priorScopeLocale='';
  // A sensor change the optics actually made (a press or the key) is announced once, for its sound.
  const announceScope=()=>bus.emit('ui:visionChanged',{});
  const switchScope=()=>{if(!scopeView.hidden){cycleScopeVision();announceScope();}};bus.on('ui:aerialVision',switchScope);
  // (a touch window too short or too narrow for the views two by two shows the lit one alone, a finger's 44 px, and a tap
  // on it steps on: aerialHud.css; at 568x256 the four met the speedometer, at 320x568 the scope readouts' seats)
  const scopeSingle=typeof matchMedia==='function'?matchMedia('(pointer:coarse) and (max-height:300px),(pointer:coarse) and (max-width:340px)'):null;
  wireRoving(scopeSeg,value=>{
    if(value!==getScopeVision()){setScopeVision(value as AerialVision);announceScope();}
    else if(scopeSingle?.matches){cycleScopeVision();announceScope();}
  });
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
  const role=node('span','gunship-role',designation);role.hidden=true;
  const heading=node('div','flight-heading',panel),emblem=icon(heading,'modeDrone','flight-emblem');
  const identity=node('button','flight-identity flight-view-switch',heading),title=node('strong','',identity);
  identity.type='button';
  const flightGlyph=icon(identity,'visionInfrared','flight-optic-icon');
  const feed=node('span','flight-feed',identity),viewLabel=node('span','',feed);icon(feed,'undo','flight-cycle-icon');
  const visionKey=node('kbd','flight-key flight-view-key',feed);visionKey.textContent='I';
  const flightTrack=node('span','scope-vision-track flight-view-track',identity);flightTrack.setAttribute('aria-hidden','true');
  // (the lit step is the track's view, aerialHud.css: the track shows, it does not choose)
  for(const view of SCOPE_VIEWS){const step=node('span','scope-vision-step',flightTrack);step.dataset.view=view;}
  let priorFlightVision:AerialVision|null=null;
  const switchView=()=>{if(!root.hidden&&!identity.disabled){setAerialVision(nextAerialVision());bus.emit('ui:visionChanged',{});}};
  identity.addEventListener('click',switchView);bus.on('ui:aerialVision',switchView);
  const telemetry=node('div','flight-telemetry',heading);
  const timer=instrument(telemetry,'reload',t('flight.battery'));
  // DR.05 (#100): the height above the ground under the airframe (terrain AGL), beside the battery.
  const altimeter=instrument(telemetry,'altitude',t('flight.altitude'));
  const link=instrument(telemetry,'radio',t('flight.link'));
  const speedometer=instrument(telemetry,'speed',t('flight.speed'));markDatum(speedometer.host,'speed');
  const support=node('div','flight-support',heading);
  // the supplies' glyphs and keys are the vehicle-action table's (src/game/vehicleActions.ts FLIGHT_ACTIONS)
  const supplyButtons=([{kind:'ammo',action:'supplyAmmo'},{kind:'heal',action:'supplyHeal'}] as const).map(entry=>{
    const def=vehicleAction(entry.action),item={...entry,glyph:def.glyph,key:def.key.slice(3)};
    const button=node('button','flight-supply',support);button.type='button';button.dataset.supply=item.kind;
    icon(button,item.glyph);const status=node('small','',button),key=node('kbd','flight-key',button);key.textContent=item.key;
    button.addEventListener('click',()=>{if(!root.hidden&&root.dataset.kind==='gunship'&&!button.disabled)bus.emit('ui:'+item.action,{});});return{...item,button,status,key};
  });
  // (the charge's bar under its own figure, one readout: across the console it read as a second battery, UI-LOCKDOWN B11)
  const battery=node('meter','flight-battery',timer.host);battery.min=0;battery.max=AERIAL_RULES.drone.batteryS;battery.setAttribute('aria-label',t('flight.battery'));
  const weapons=markDatum(node('div','flight-weapons',panel),'ammo');
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
  const actions=node('div','flight-actions',panel),hint=markDatum(node('span','flight-hint',actions),'hints');
  const back=node('button','cot-drone-return',actions);back.type='button';icon(back,'undo');
  const backLabel=node('span','',back);backLabel.textContent=t('flight.return');
  const backKey=node('kbd','flight-key',back);backKey.textContent='V';
  back.addEventListener('click',()=>bus.emit('ui:drone',{}));
  const reload=createVehicleCooldownReader();
  let priorTime=0,priorX=0,priorY=0,priorZ=0,speed=0,wasActive=false,kind='';
  /** Until when this flight shows its controls line (a first flight's), or -1. */
  let hintUntil=-1;
  let priorRecallLocked:boolean|null=null;
  let batteryCharge=NaN;
  function updateWeapons(player:HudTank|null|undefined,now:number):void {
    for(let slot=0;slot<cards.length;slot++){
      const card=cards[slot]!,wait=reload(player?.combat,slot,now),selected=player?.combat?.shellSlot===slot;
      setAttr(card.button,'aria-pressed',String(selected));card.button.classList.toggle('reloading',wait>0);
      const ammo=player?.combat?.ammo?.[slot];
      setText(card.status,wait>0?`${wait.toFixed(1)}s`:t('flight.ready',{ammo:GUNSHIP_UNLIMITED||ammo===Infinity?'∞':String(ammo??0)}));
      setAttr(card.button,'aria-label',`${t(`flight.weapon.${slot}`)} · ${card.status.textContent}`);
      const total=player?.combat?.reloadChannels?.[slot]?.totalS??player?.spec?.gun.shells[slot]?.reloadS??1;
      // (the ring steps in hundredths: an unchanged step writes nothing)
      setStyle(card.button,'--weapon-ready',(1-Math.min(1,wait/Math.max(.01,total))).toFixed(2));
      if(selected){
        setData(root,'weapon',String(slot));root.classList.toggle('weapon-reloading',wait>0);
        // (its reload is the selected weapon card's, never the lens's as well: UI-LOCKDOWN B10)
        setText(solutionLabel,t(`flight.weapon.${slot}`));
      }
    }
  }
  function updateScopeControls(visible:boolean,active:boolean,scoped:boolean,viewKey:string):void {
    setHidden(scopeView,!visible||active||!scoped);
    const scope=getScopeVision(),scopeLocale=getLocale();
    if(scopeLocale!==priorScopeLocale){
      scopeSeg.setAttribute('aria-label',t('flight.view.action'));
      scopeOptions.forEach((option,index)=>{const view=SCOPE_VIEWS[index]!;option.setAttribute('aria-label',t('flight.view.'+view));scopeTags[index]!.textContent=t(`flight.view.tag.${view}`);});
    }
    if(scope!==priorScope||viewKey!==priorScopeKey||scopeLocale!==priorScopeLocale){
      setRoving(scopeSeg,scope);scopeView.dataset.view=scope;scopeKey.textContent=viewKey;
      scopeSeg.setAttribute('aria-keyshortcuts',viewKey);
      priorScope=scope;priorScopeKey=viewKey;priorScopeLocale=scopeLocale;
    }
  }
  function updateSupplyControls(supplies?:{ammoReadyInS:number;healReadyInS:number},supplyKeys?:{ammo:string;heal:string}):void {
    for(const item of supplyButtons){
      const remaining=item.kind==='ammo'?supplies?.ammoReadyInS??0:supplies?.healReadyInS??0;
      setDisabled(item.button,remaining>0);setText(item.status,remaining>0?`${Math.ceil(remaining)}s`:t('flight.supply.short.'+item.kind));
      setText(item.key,supplyKeys?.[item.kind]??(item.kind==='ammo'?'J':'K'));
      setAttr(item.button,'aria-keyshortcuts',item.key.textContent||'');
      const name=t('flight.supply.'+item.kind);setData(item.button,'tip',name);setAttr(item.button,'aria-label',name+(remaining>0?` · ${Math.ceil(remaining)}s`:''));
    }
  }
  return {
    update(player:HudTank|null|undefined,now:number,fov:number,dist:number,visible:boolean,key='V',thermalReady=false,viewKey='I',supplies?:{ammoReadyInS:number;healReadyInS:number},supplyKeys?:{ammo:string;heal:string},scoped=false,escort?:HudMatchModeState['escort'],lensUp=true){
      const view=player?.aerial,active=!!view?.active&&visible;
      // A recall the authority accepted closes the feed cleanly (the airframe is flying home); a loss breaks it in static.
      const signalLevel=transition.step(active&&view?.kind==='drone'&&thermalReady,active,visible,performance.now(),(view?.returnS??0)>0);
      setHidden(signal,signalLevel<=0);if(signalLevel>0)setStyle(signal,'opacity',Math.min(1,signalLevel*2).toFixed(2));
      updateScopeControls(visible,active,scoped,viewKey);
      // (the root's attribute only on a change: written each frame it invalidated the whole document's style)
      setHidden(root,!active);setData(document.documentElement,'flight',active?view!.kind:'');
      if(!active||!view){wasActive=false;return;}
      setDisabled(identity,!thermalReady);setText(visionKey,viewKey);
      const flightVision=getAerialVision();
      setText(viewLabel,t('flight.view.'+flightVision));
      setData(root,'view',flightVision);
      if(flightVision!==priorFlightVision){
        flightGlyph.innerHTML=uiIconSVG(scopeIcons[flightVision],22);
        flightTrack.dataset.view=flightVision;
        priorFlightVision=flightVision;
      }
      setAttr(identity,'aria-keyshortcuts',viewKey);
      setData(identity,'tip',t('flight.view.next',{view:t('flight.view.'+nextAerialVision())}));
      setAttr(identity,'aria-label',t('flight.view.switch',{current:t('flight.view.'+getAerialVision()),next:t('flight.view.'+nextAerialVision())}));
      const drone=view.kind==='drone';setHidden(support,drone);
      // (ac130-fx-228 r2) the gimbal's sight and solution belong to its lens: an external camera (the ending's orbit, a
      // replay) keeps the console and drops them
      setHidden(solution,drone||!lensUp);setHidden(sight,!drone&&!lensUp);
      const designationLine=drone?'':gunshipDesignation(escort);setText(role,designationLine);setHidden(role,!designationLine);
      updateSupplyControls(supplies,supplyKeys);
      setData(root,'kind',view.kind);setText(backKey,key);
      setAttr(back,'aria-keyshortcuts',key);
      if(kind!==view.kind){kind=view.kind;emblem.innerHTML=uiIconSVG(drone?'modeDrone':'modeAc130',24);designationIcon.innerHTML=uiIconSVG(drone?'modeDrone':'modeAc130',22);}
      setText(title,drone?t(view.launching?'flight.launching':'flight.drone'):t('flight.gunship'));
      // (the console's eyebrow only with its escort's role: alone it repeated the mode plate's "AC-130" and "Drone",
      // gauntlet r3)
      setHidden(designation,!designationLine);setText(designationLabel,title.textContent||'');
      const elapsed=now-priorTime;
      if(wasActive&&elapsed>0)speed+=.2*(Math.hypot(view.x-priorX,view.y-priorY,view.z-priorZ)/elapsed-speed);
      if(!wasActive)hintUntil=takeFlightHint(view.kind)?now+FLIGHT_HINT_S:-1;
      priorTime=now;priorX=view.x;priorY=view.y;priorZ=view.z;wasActive=true;
      const carrier=player?.state?.pos,range=carrier?Math.hypot(view.x-carrier.x,view.z-carrier.z):0;
      setHidden(timer.host,!drone);setHidden(link.host,!drone);setHidden(speedometer.host,!drone);
      const field=drone?ground():null;
      // (no ground under it yet, no reading: a dash stood for the altitude, gauntlet r5; a battle's field lands with its map)
      setHidden(altimeter.host,!field);if(field)setText(altimeter.value,formatDroneAltitude(view.y-field.getHeightAt(view.x,view.z)));
      setHidden(zoom.host,drone);setHidden(distance.host,drone);
      setText(timer.value,`${Math.ceil(view.batteryS)}\u202fs`);setText(link.value,`${Math.round(range)}\u202fm`);setText(speedometer.value,`${Math.round(speed*3.6)}\u202fkm/h`);
      setText(zoom.value,`×${(55/fov).toFixed(1)}`);setText(distance.value,`${Math.round(dist)}\u202fm`);
      setHidden(battery,!drone);const charge=Math.round(view.batteryS*4)/4;if(charge!==batteryCharge){battery.value=charge;batteryCharge=charge;} // (in quarter seconds, against the last value written: a meter reads back clamped to its max)
      root.classList.toggle('low-battery',drone&&view.batteryS<10);
      setHidden(weapons,drone);setHidden(back,!drone);
      // Owner 2026-10-14: the authority accepts a recall only once the pilot is in the drone's feed; until then the return
      // control stands disabled and says why.
      const recallLocked=drone&&dronePhase(view)==='locked';
      if(recallLocked!==priorRecallLocked){
        priorRecallLocked=recallLocked;back.disabled=recallLocked;back.classList.toggle('recall-locked',recallLocked);
        back.dataset.tip=t(recallLocked?'flight.return.locked':'flight.return');
      }
      setText(hint,t(drone?(recallLocked?'flight.hint.recallLocked':'flight.hint.drone'):'flight.hint.gunship'));
      setHidden(hint,!(now<hintUntil));
      updateWeapons(player,now);
    },
  };
}
