import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { battleSideStack, battleNotificationRows, battleRosterHeight, installBattleHudLayout, objectiveWidth, battleReportDock, REPORT_MAP_GAP,
  portraitSightClearTop, SIGHT_BAND_ABOVE, SIGHT_BAND_BELOW, SCOPE_BAND_BELOW } from './battleHudLayout.ts';
import { DETECTION_H, MOUSE_NOTICE_GAP_PX, mouseNoticePlanWork } from './mouseNoticePlan.ts';
import { sightFurniture, sightNotice } from './sightFurniture.ts';
const layoutSourceR10 = readFileSync(new URL('./battleHudLayout.ts', import.meta.url), 'utf8');

for (const space of [0, 80, 124, 320, 500]) {
  const height = battleRosterHeight(600, space, 124);
  assert.ok(height <= space, 'grid minimum never exceeds the available side lane');
  assert.ok(height >= Math.min(space, 124), 'crowded grid retains readable icon rows');
  if (space >= 320) assert.ok(space - height >= 192, 'grid keeps room for kill notices and the combat report');
}

for (const count of [1, 2, 3, 7, 10, 14]) {
  const normal = battleRosterHeight(1080, 700, 48, count);
  const expanded = battleRosterHeight(1080, 700, 48, count, true);
  assert.equal(normal, 22 + count * 24, 'fewer players do not inflate normal rows');
  assert.equal(expanded, 22 + count * 30, 'only Tab requests taller rows');
  assert.ok(700 - expanded >= 112, 'expanded list still reserves the diagram readout');
  assert.ok(battleRosterHeight(600, 320, 48, count) <= 208, 'short layout preserves readout plus gap');
}

for(const width of [240,280,344,420]) {
  const w=objectiveWidth(width);
  assert.ok((width-w)/2>16, 'objective clears both clipped scoreboard corners');
}

for(const height of [0,30,62,100,150,200,320,600])for(const chat of [false,true])for(const count of [0,1,3,8]){
  const layout=battleSideStack(height,chat,count);
  assert.ok(layout.toastRows<=8&&layout.toastRows<=count);
  assert.ok(layout.toastHeight<=height);
  assert.ok(layout.chatOffset+layout.chatHeight<=height);
  if(chat&&height>=62)assert.ok(layout.chatHeight>=54,'the composer retains room below the alerts');
}
assert.equal(battleSideStack(100,true,3).toastRows,1,'a compact notice fits beside the reserved chat input');
assert.equal(battleSideStack(320,false,3).toastRows,3);
assert.equal(battleSideStack(320,false,20).toastRows,8);
for(let height=0;height<500;height++){
  const rows=battleNotificationRows(height,20);
  assert.ok(rows<=8&&rows>=0);
  assert.ok(!rows||rows*29-3<=height,'only complete notification rows fit');
  assert.ok(rows>=battleNotificationRows(height-1,20),'more space never reduces capacity');
}
assert.equal(battleNotificationRows(84,20),3);
assert.equal(battleNotificationRows(229,20),8);

for(const height of [390,600,720,1080])for(const space of [0,40,100,300,600]) {
  const roster=battleRosterHeight(height,space);
  assert.ok(roster>=0&&roster<=space,'roster cannot exceed its available side lane');
  if(space>=300)assert.ok(space-roster>=180,'large rosters preserve space for combat feedback');
}

// Changing notification counts cannot change this dock: only physical space
// and the deliberate compact report presentation affect its height.
assert.equal(REPORT_MAP_GAP,12);
for (const bottom of [120,240,480,800]) for (const ceiling of [80,180,400]) for (const compact of [false,true]) {
  const dock=battleReportDock(bottom,ceiling,compact);
  assert.equal(dock.bottom,bottom);
  assert.equal(dock.top+dock.height,bottom);
  assert.ok(dock.height>=0&&dock.height<=(compact?160:260));
  assert.ok(dock.height===0||dock.top>=ceiling);
}

// Owner 2026-10-17 (out of ammo, critic r3): a portrait phone's systems row never crosses the sight's band — its
// countdown, rack, struck empty round, aim warning and scope readouts. Measured portrait phones (tools/fixtures/
// battle-hud-layout.html, Chrome): 390x844 parks the row at 416 above its tray (468), across the 422 centre; 360x640
// parks it at 212, clear; 430x932 at 504, across 466; the 768x1024 tablet at 596, under the battle furniture (cy+80).
// The floor is the lower cluster (speedometer, fire, aim hint).
{
  const crossing = (top, height, centre) => top < centre + SIGHT_BAND_BELOW && top + height > centre - SIGHT_BAND_ABOVE;
  assert.equal(portraitSightClearTop(212, 44, 320, 406, 208), 212, '360x640: already clear, untouched');
  assert.equal(portraitSightClearTop(596, 44, 512, 689, 232), 596, '768x1024: already clear of the sight, untouched');
  const tall = portraitSightClearTop(416, 44, 422, 560, 208);
  assert.ok(!crossing(tall, 44, 422) && tall >= 208, `390x844: the row leaves the band within the free space (${tall})`);
  assert.equal(tall, 422 - SIGHT_BAND_ABOVE - 44, 'no room under the scope readouts above the cluster: above the ring');
  assert.ok(!crossing(portraitSightClearTop(504, 44, 466, 626, 208), 44, 466), '430x932: clear too');
  assert.equal(portraitSightClearTop(560, 44, 520, 900, 208), 520 + SCOPE_BAND_BELOW,
    'a tall portrait moves it below the scope readouts too, nearer the thumbs');
  assert.equal(portraitSightClearTop(300, 44, 300, 380, 280), 300, 'no room on either side: the row stays');
  for (let centre = 280; centre <= 560; centre += 7) for (let top = 100; top <= 700; top += 13) {
    const placed = portraitSightClearTop(top, 44, centre, 760, 160);
    if (placed !== top) {
      assert.ok(crossing(top, 44, centre) && placed >= 160 && placed + 44 <= 760
        && (placed >= centre + SCOPE_BAND_BELOW || placed + 44 <= centre - SIGHT_BAND_ABOVE), `moved rows land clear (${top}, ${centre})`);
    } else if (crossing(top, 44, centre)) assert.ok(centre + SCOPE_BAND_BELOW + 44 > 760 && centre - SIGHT_BAND_ABOVE - 44 < 160);
  }
}
const layoutSource = readFileSync(new URL('./battleHudLayout.ts', import.meta.url), 'utf8');
// (battle-camera-264) on the battle sight, the centre's unless the chase framing raises it (battleSight.ts); the scope's
// band stays the centre's
assert.match(layoutSource, /if \(touch && width < height && systemsHeight\) \{[\s\S]{0,900}portraitSightClearTop\(systemsTop, systemsHeight, height \/ 2, floor, ceiling, height \/ 2 - battleSightShift\(\)\)/,
  'the solver applies it to touch portraits, on the battle sight');
assert.match(layoutSource, /Math\.min\(laneSystemsTop, systemsTop\) - 8/, 'the side lanes never gain the row\'s old space');

// Observer lifecycle in a deterministic DOM: no-op attribute records must not
// turn layout into a per-frame job, but real state/viewport changes still do.
const originals = new Map(['document','window','ResizeObserver','MutationObserver',
  'requestAnimationFrame','getComputedStyle','setTimeout','clearTimeout'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
try {
  const frames=new Map(); let nextFrame=1; let measures=0; let writes=0;
  const callbacks={}; const watched=[]; const listeners=new Map();
  const properties=new Map();
  const node=(attrs={})=>({
    attrs:{...attrs},dataset:{},childElementCount:0,visible:true,
    classList:{contains:()=>false,toggle:()=>false},
    style:{getPropertyValue:key=>properties.get(key)||'',setProperty:(key,value)=>{writes++;properties.set(key,value);},removeProperty:key=>{writes++;properties.delete(key);}},
    getAttribute(key){return this.attrs[key]??null;},
    hasAttribute(key){return this.getAttribute(key)!==null;},
    toggleAttribute(key,on){if(on)this.attrs[key]='';else delete this.attrs[key];},
    getClientRects(){measures++;return this.visible?[{}]:[];},
    getBoundingClientRect(){return {top:600,bottom:660,left:0,right:100};},
    querySelector(){return null;},
  });
  const root=node({style:''}); const body=node({class:''});
  const special=node({class:'cot-special deny'});
  const visibleNodes=[special];
  const viewport={height:768,width:1366,addEventListener:(type,fn)=>listeners.set(`viewport:${type}`,fn)};
  // documentElement.clientWidth is the layout viewport a pinch leaves alone
  // (local-fps-265) the side panels' lane heights live on their own rule (battleHudLayout.ts PANEL_VARS): its style element
  // as ensureStyle leaves it, the layer order and the layer block holding the one rule
  const panelProperties=new Map();
  const panelStyle={tagName:'STYLE',sheet:{cssRules:[{},{cssRules:[{style:{getPropertyValue:key=>panelProperties.get(key)||'',
    setProperty:(key,value)=>{writes++;panelProperties.set(key,value);},removeProperty:key=>{writes++;panelProperties.delete(key);}}}]}]}};
  globalThis.document={body,head:{},documentElement:{clientWidth:1366},querySelector:()=>null,querySelectorAll:()=>visibleNodes,
    getElementById:id=>id==='cot-hud-panel-vars'?panelStyle:null};
  globalThis.window={innerHeight:768,innerWidth:1366,visualViewport:viewport,document:globalThis.document,
    addEventListener:(type,fn)=>listeners.set(type,fn)};
  globalThis.getComputedStyle=()=>({visibility:'visible'});
  globalThis.requestAnimationFrame=fn=>{const id=nextFrame++;frames.set(id,fn);return id;};
  const timers=new Map(); let nextTimer=1;
  globalThis.setTimeout=fn=>{const id=nextTimer++;timers.set(id,fn);return id;};
  globalThis.clearTimeout=id=>{timers.delete(id);};
  globalThis.ResizeObserver=class{constructor(fn){callbacks.resize=fn;}observe(){}};
  globalThis.MutationObserver=class{constructor(fn){callbacks.mutation=fn;}observe(target,options){watched.push({target,options});}};
  const flush=()=>{const work=[...frames.values()];frames.clear();for(const fn of work)fn();};
  const change=(target,name,oldValue)=>callbacks.mutation([{type:'attributes',target,attributeName:name,oldValue}]);
  installBattleHudLayout(root);
  assert.equal(frames.size,1); flush();
  const initialMeasures=measures; const initialWrites=writes;
  const transientClass=(target,initial,intermediate)=>callbacks.mutation([
    {type:'attributes',target,attributeName:'class',oldValue:initial},
    {type:'attributes',target,attributeName:'class',oldValue:intermediate},
  ]);
  transientClass(special,'cot-special deny','cot-special');
  assert.equal(frames.size,0,
    'the FIRST callback ignores a deny remove/re-add batch with unchanged final class');
  assert.equal(measures,initialMeasures);
  for(let i=0;i<600;i++)change(special,'class','cot-special deny');
  assert.equal(frames.size,0,'600 unchanged pending-class removals schedule no layout');
  for(let i=0;i<600;i++)transientClass(special,'cot-special deny','cot-special');
  assert.equal(frames.size,0,'600 transient remove/re-add pulses schedule no lane measurements');
  assert.equal(measures,initialMeasures);
  assert.ok(watched.every(({options})=>!options.attributeOldValue),'retained final values avoid capturing redundant old strings on every frame');
  special.attrs.class='cot-special show';change(special,'class','cot-special deny');
  listeners.get('resize')();callbacks.resize();
  assert.equal(frames.size,1,'real mutations and resize coalesce');flush();
  assert.equal(writes,initialWrites,'unchanged geometry does not rewrite CSS properties');
  // Every attribute in the batch must update its baseline, even after the
  // first real change. Subsequent unchanged batches must not schedule again.
  special.attrs.class='cot-special show deny';body.attrs.class='cot-touch-layout';
  callbacks.mutation([
    {type:'attributes',target:special,attributeName:'class',oldValue:'cot-special show'},
    {type:'attributes',target:body,attributeName:'class',oldValue:''},
  ]);
  assert.equal(frames.size,1,'multiple real attribute changes share one measurement');flush();
  transientClass(special,'cot-special show deny','cot-special show');
  transientClass(body,'cot-touch-layout','');
  assert.equal(frames.size,0,'all final attribute values were retained');
  root.visible=false;root.attrs.style='display:none';change(root,'style','');flush();
  assert.equal(body.hasAttribute('data-cot-battle-layout'),false,'hidden battle releases side lanes');
  root.visible=true;root.attrs.style='';change(root,'style','display:none');flush();
  assert.equal(body.hasAttribute('data-cot-battle-layout'),true);
  // a trackpad pinch shrinks the visual viewport by its scale but not the layout the HUD root is sized to: the
  // lanes keep their geometry and nothing is rewritten
  const beforePinch=writes;
  Object.assign(viewport,{scale:2,width:683,height:384});listeners.get('cot:layoutchange')();flush();
  assert.equal(writes,beforePinch,'a 2x pinch leaves every HUD lane where it was');
  // iOS page zoom rests at a scale above 1 with no pinch: the lanes use the visible size as it is
  Object.assign(viewport,{scale:1.25,width:1366,height:768});listeners.get('cot:layoutchange')();flush();
  assert.equal(writes,beforePinch,'a resting page scale is not a pinch either');
  Object.assign(viewport,{scale:1,width:1366,height:768});
  assert.equal(listeners.has('viewport:resize'),false,'no direct visual viewport listener: cot:layoutchange carries real changes');
  // (the right column's report dock is held only while a report shows: the left lane's height carries the change)
  const before=panelProperties.get('--hud-left-height');
  viewport.height=420;listeners.get('cot:layoutchange')();flush();
  assert.notEqual(panelProperties.get('--hud-left-height'),before,'virtual keyboard changes available space');
  // (local-fps-265) a body custom property restyles every element under the body: the lane heights only the side panels
  // read are written on the panels' rule, the rest of the layout on the body as before
  assert.ok(panelProperties.has('--hud-left-height')&&panelProperties.has('--hud-chat-height'),'the panels\' lane heights are on their rule');
  assert.equal(properties.has('--hud-left-height')||properties.has('--hud-chat-height'),false,'the body never carries the panels\' lane heights');
  assert.ok(properties.has('--hud-left-top')&&properties.has('--hud-chat-top')&&!panelProperties.has('--hud-left-top'),'every other lane variable stays on the body');
  const late=node({class:'cot-room-chat quiet'});visibleNodes.push(late);
  callbacks.mutation([{type:'childList',target:body}]);
  assert.equal(frames.size,1,'late-added chat/panels still trigger discovery');flush();
  assert.ok(watched.some(entry=>entry.target===late),'newly discovered controls are observed');
  transientClass(late,'cot-room-chat quiet','cot-room-chat');
  assert.equal(frames.size,0,'late-mounted controls also start with a seeded final-value baseline');
  late.attrs.hidden='';change(late,'hidden',null);
  assert.equal(frames.size,1,'real visibility changes on late controls still reflow');flush();
  listeners.get('cot:layoutchange')();assert.equal(frames.size,1);flush();
  listeners.get('transitionend')({target:node()});
  assert.equal(frames.size,0,'unrelated decorative transitions do not measure HUD');
  listeners.get('transitionend')({target:special});
  assert.equal(frames.size,1,'settled panel transforms update lane position');flush();
  listeners.get('transitioncancel')({target:special});assert.equal(frames.size,1);flush();
  // The multiplayer v2 network strip mounts outside the HUD root and asks for a relayout. It is bare text in the
  // top-right corner row (multiplayerStatus.ts: top 8px), above the enemies roster's own lane, so the roster stays
  // level with the allies roster; only the strip's open details reader reaches into that lane and pushes it down.
  const rect=(top,bottom,left,right)=>({top,bottom,left,right,width:right-left,height:bottom-top});
  const earRight=node({class:'cot-ear r'});earRight.getBoundingClientRect=()=>rect(52,120,1172,1366);
  const strip=node({class:'cot-mp-status battle'});strip.getBoundingClientRect=()=>rect(8,36,1210,1356);
  const stripButton=node({class:'cot-mp-strip good'});stripButton.getBoundingClientRect=()=>rect(8,36,1210,1356);
  const plate=node({class:'cot-net'});const score=node({class:'cot-top'});score.getBoundingClientRect=()=>rect(0,64,511,855);
  let stripMounted=true;let plateShown=false;
  // (a report shows: the dock is held only while one does)
  const cards=node({class:'cot-si-cardhost'});cards.childElementCount=1;cards.getBoundingClientRect=()=>rect(106,366,1050,1350);
  const mounted={'.cot-si-cardhost':()=>cards,'.cot-ear.r':()=>earRight,'.cot-mp-status.battle':()=>stripMounted?strip:null,
    '.cot-mp-status.battle .cot-mp-strip':()=>stripMounted?stripButton:null,'.cot-net':()=>plateShown?plate:null,'.cot-top':()=>score};
  globalThis.document.querySelector=selector=>mounted[selector]?.()??null;
  assert.equal(properties.has('--hud-roster-top-right'),false,'no strip, no roster lane variable');
  listeners.get('cot-hud-relayout')();assert.equal(frames.size,1,'the strip\'s relayout request schedules one measurement');flush();
  assert.equal(properties.has('--hud-roster-top-right'),false,'the corner-row strip leaves the enemies roster on its own lane');
  // (the report leaves the feed one row under the roster: REPORT_FEED_ROOM, gauntlet r3)
  assert.equal(properties.get('--hud-right-top'),'116px','the report budget keeps the default roster start');
  assert.equal(properties.get('--hud-network-corner-right'),'10px','without the fps/ping plate the strip takes the corner itself');
  plateShown=true;plate.getBoundingClientRect=()=>rect(8,36,1248,1356);
  callbacks.resize();flush();
  assert.equal(properties.get('--hud-network-corner-right'),'106px','the strip, the band\'s next plate, reaches 12 px under a shown fps/ping plate\'s slant, in the same row');
  assert.equal(properties.has('--hud-roster-top-right'),false);
  assert.equal(strip.hasAttribute('data-compact'),false,'room for every cell between the score and the plate');
  score.getBoundingClientRect=()=>rect(0,64,300,1120);
  callbacks.resize();flush();
  assert.equal(strip.hasAttribute('data-compact'),true,'a row too narrow for every cell folds the strip to its ping');
  stripButton.getBoundingClientRect=()=>rect(8,36,1258,1313);
  callbacks.resize();flush();
  assert.equal(strip.hasAttribute('data-compact'),true,'the folded strip keeps its full width as the measure: no fold/unfold flicker');
  score.getBoundingClientRect=()=>rect(0,64,511,855);stripButton.getBoundingClientRect=()=>rect(8,36,1210,1356);
  callbacks.resize();flush();
  assert.equal(strip.hasAttribute('data-compact'),false,'a wide enough row unfolds it');
  strip.getBoundingClientRect=()=>rect(8,360,1066,1356);
  callbacks.resize();flush();
  assert.equal(properties.get('--hud-roster-top-right'),'366px','the open details reader pushes the roster 6 px below itself');
  plateShown=false;
  strip.getBoundingClientRect=()=>rect(140,168,20,180);
  listeners.get('cot-hud-relayout')();flush();
  assert.equal(properties.has('--hud-roster-top-right'),false,'a strip on the left lane (touch portrait) leaves the right roster alone');
  assert.equal(properties.get('--hud-right-top'),'116px','the report budget returns to the default roster start');
  // A phone-width mouse window has no roster: the folded strip takes the right lane under the objective, and the
  // right kill feed starts below it.
  body.dataset.cotWidth='phone';mounted['.cot-ear.r']=()=>null;
  viewport.width=390;globalThis.document.documentElement.clientWidth=390;
  strip.getBoundingClientRect=()=>rect(72,100,325,380);
  listeners.get('cot-hud-relayout')();flush();
  assert.equal(properties.get('--hud-kill-right-top'),'108px','the right feed clears the strip under the 64 px objective');
  assert.equal(properties.get('--hud-network-corner-right'),'10px','the phone lane is not the corner row');
  stripMounted=false;
  listeners.get('cot-hud-relayout')();flush();
  assert.equal(properties.get('--hud-kill-right-top'),'72px','without the strip the feed returns under the objective');
  delete body.dataset.cotWidth;mounted['.cot-ear.r']=()=>earRight;
  viewport.width=1366;globalThis.document.documentElement.clientWidth=1366;
  listeners.get('cot-hud-relayout')();flush();
  assert.equal(properties.has('--hud-roster-top-right'),false,'the strip\'s dispose removes the variable');
  assert.equal(properties.get('--hud-network-corner-right'),'10px','and returns the corner offset');
  const map=node({class:'cot-minimap'});
  globalThis.document.querySelector=selector=>selector==='.cot-minimap'?map:null;
  for(const size of [160,220,300]){
    map.getBoundingClientRect=()=>rect(viewport.height-size-16,viewport.height-16,viewport.width-size-16,viewport.width-16);
    callbacks.resize();flush();
    assert.equal(properties.get('--hud-flight-right-clearance'),`${size+28}px`,'aircraft rack reserves the actual resized minimap plus a gap');
  }
  map.getBoundingClientRect=()=>rect(8,100,8,100);callbacks.resize();flush();
  assert.equal(properties.get('--hud-flight-right-clearance'),'12px','a top-left mobile map releases the lower rack lane');
  // The sizes above arrived in one rapid run: the mouse notice plan (mouseNoticePlan.ts) waited for it to settle, on one
  // timer, and the settled window relayouts once.
  assert.equal(timers.size,1,'a resize in progress leaves the notice plan to one settle timer');
  for(const fn of [...timers.values()])fn();timers.clear();
  assert.equal(frames.size,1,'the settled resize relayouts once');flush();
} finally {
  for(const [key,descriptor] of originals){
    if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  }
}
// The notice plan in a deterministic DOM with real class lists (desk-notices 229): the touch layout never plans and
// writes none of the plan's attributes; a scope toggle relayouts nothing unless a queued medal card waits on it; the
// first plan made while Tab is held is the one releasing Tab keeps.
{
  const saved=new Map(['document','window','ResizeObserver','MutationObserver','requestAnimationFrame','getComputedStyle',
    'setTimeout','clearTimeout'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height,x:left,y:top});
  function harness({width=1366,height=768,touch=false,tab=false,elements={},inRoot={},extra=()=>({}),bodyData={}}={}){
    const frames=new Map();let nextFrame=1;let observer=null;const properties=new Map();
    const classes=list=>{const set=new Set(list);return {set,contains:c=>set.has(c),add:c=>set.add(c),remove:c=>set.delete(c),
      toggle(c,on){const want=on??!set.has(c);if(want)set.add(c);else set.delete(c);return want;}};};
    const node=(list=[],box=null)=>({attrs:{},dataset:{},childElementCount:0,classList:classes(list),offsetWidth:0,offsetHeight:0,
      style:{getPropertyValue:k=>properties.get(k)||'',setProperty:(k,v)=>properties.set(k,v),removeProperty:k=>properties.delete(k)},
      getAttribute(k){return k==='class'?[...this.classList.set].join(' '):this.attrs[k]??null;},hasAttribute(k){return k in this.attrs;},
      toggleAttribute(k,on){const want=on??!(k in this.attrs);if(want)this.attrs[k]='';else delete this.attrs[k];return want;},
      getClientRects(){return [{}];},getBoundingClientRect(){return typeof box==='function'?box():box??rect(0,0,0,0);},
      dispatchEvent(){return true;},querySelector(){return null;},querySelectorAll(){return [];}});
    const root=node(tab?['cot-hud','rosters-expanded']:['cot-hud']);root.querySelector=sel=>inRoot[sel]?.()??null;
    const body=node(touch?['cot-touch-layout']:[]);Object.assign(body.dataset,bodyData);const html=node();html.clientWidth=width;
    const parts={'.cot-top':node([],rect(width/2-172,0,344,62)),...Object.fromEntries(Object.entries(elements).map(([k,f])=>[k,node([],()=>f(root))])),...extra(node,{root,properties})};
    globalThis.document={body,documentElement:html,querySelector:sel=>parts[sel]??null,querySelectorAll:()=>[]};
    globalThis.window={innerWidth:width,innerHeight:height,visualViewport:{width,height,scale:1},document:globalThis.document,addEventListener(){}};
    globalThis.getComputedStyle=()=>({visibility:'visible'});
    globalThis.requestAnimationFrame=fn=>{const id=nextFrame++;frames.set(id,fn);return id;};
    globalThis.setTimeout=()=>0;globalThis.clearTimeout=()=>{};
    let resized=null;
    globalThis.ResizeObserver=class{constructor(fn){resized=fn;}observe(){}};
    globalThis.MutationObserver=class{constructor(fn){observer=fn;}observe(){}};
    installBattleHudLayout(root);
    const flush=()=>{const work=[...frames.values()];frames.clear();for(const fn of work)fn();};
    flush();
    // a frame's layout: the ResizeObserver reports each measured part whose box changed since the last one, as browsers do
    const boxes=new Map();const sized=()=>{const changed=[];for(const part of Object.values(parts)){if(!part.getBoundingClientRect)continue;const b=JSON.stringify(part.getBoundingClientRect());
      if(boxes.has(part)&&boxes.get(part)!==b)changed.push({target:part});boxes.set(part,b);}return changed;};
    sized();
    const settle=()=>{flush();for(let i=0;i<4;i++){const changed=sized();if(!changed.length)break;resized(changed);flush();}};
    return {root,body,html,properties,frames,flush,settle,mutate:records=>observer(records),resize:entries=>resized(entries),node,parts};
  }
  try {
    // touch: no plan (mouseNoticePlanWork untouched), no plan attribute, variable or class, and main's own notice tops
    mouseNoticePlanWork.bands=-1;
    const touch=harness({touch:true});
    assert.equal(mouseNoticePlanWork.bands,-1,'the touch layout makes no notice plan');
    assert.equal(touch.body.hasAttribute('data-hud-notices'),false,'the touch layout carries no plan attribute');
    assert.equal(touch.body.dataset.hudNoticeTiers,undefined,'nor the receipt\'s tiers');
    for(const name of ['notice-x','alert-x','alert-width','alert-shift','banner-x','countdown-x','countdown-top','countdown-scale',
      'revive-x','revive-top','revive-scale','roster-wide-left','roster-wide-right'])
      assert.equal(touch.properties.has(`--hud-${name}`),false,`the touch layout writes no --hud-${name}`);
    assert.deepEqual([...touch.root.classList.set].sort(),['cot-hud'],'nor a class on the HUD root');
    // main's rule: under the score at 12 % of the height (no instrument in the way), the alert 8 px under the detection's
    // one 32 px row
    assert.equal(touch.properties.get('--hud-notice-top'),`${Math.floor(Math.max(62+8,768*.12))}px`);
    assert.equal(touch.properties.get('--hud-alert-top'),`${Math.floor(Math.max(62+8,768*.12)+32+8)}px`);
    // the mouse layout of the same window plans and carries it (the check above is not blind)
    mouseNoticePlanWork.bands=-1;
    const mouse=harness();
    assert.ok(mouseNoticePlanWork.bands>0,'the mouse layout plans');
    assert.equal(mouse.body.hasAttribute('data-hud-notices'),true);
    assert.match(mouse.body.dataset.hudNoticeTiers,/^d2 a2 /);
    // the scope flag (hud.ts, on the document element) schedules nothing while no medal card waits
    mouse.mutate([{type:'attributes',target:mouse.html,attributeName:'data-cot-scoped'}]);
    assert.equal(mouse.frames.size,0,'a scope toggle relayouts nothing');
    // Tab, with the rosters sized as the CSS sizes them: their width by the class, their height by
    // --hud-roster-*-height, which a pass writes after it has read them (so the pass just after a release still measures
    // the held height, 30 px a row against 24). With 1366 x 768's census instruments and both notices and the revive
    // count up, no notice moves when Tab is pressed or released, nor when it was held for the first plan.
    const tabRun=(firstHeld)=>{
      const revive={offsetWidth:390,offsetHeight:129},shown={};let ears=[];
      const run=harness({tab:firstHeld,inRoot:{'.cot-revive':()=>revive,'.cot-revive.on':()=>revive,'.cot-sixth.on':()=>shown,'.cot-alert.show':()=>shown,
        '.cot-ear.l':()=>ears[0],'.cot-ear.r':()=>ears[1]},extra:(node,{root,properties})=>{
        const ear=(side)=>{const e=node(['cot-ear',side],()=>{const w=root.classList.contains('rosters-expanded')?Math.min(320,1366/2-184):194;
          return rect(side==='l'?0:1366-w,52,w,parseFloat(properties.get(`--hud-roster-${side==='l'?'left':'right'}-height`))||.28*768);});
          e.dataset.count='7';return e;};
        ears=[ear('l'),ear('r')];
        return {'.cot-ear.l':ears[0],'.cot-ear.r':ears[1],'.cot-mode-status.show':node([],rect(544,62,278,41)),'.cot-dp':node([],rect(12,573,160,183)),
          '.cot-drive':node([],rect(184,648,108,108)),'.cot-vehicle-controls':node([],rect(491,648,382,32)),'.cot-shells':node([],rect(467,688,433,64)),
          '.cot-si-cardhost':Object.assign(node([],rect(1050,260,300,260)),{childElementCount:1}),'.cot-net':node([],rect(1229,8,127,28)),'.cot-minimap':node([],rect(1130,532,220,220))};}});
      run.settle();return run;};
    const placed=h=>['revive-top','revive-scale','notice-top','alert-top','alert-width'].map(k=>h.properties.get(`--hud-${k}`)).join(' ');
    const tab=(h,on)=>{if(on)h.root.classList.add('rosters-expanded');else h.root.classList.remove('rosters-expanded');
      h.mutate([{type:'attributes',target:h.root,attributeName:'class'}]);};
    const rest=tabRun(false),still=placed(rest);
    // the plan's resting rosters are the real resting ones: the left lane never starts under the held height (52 + 232
    // + 8; the revive count on the centre line crosses neither lane), and starts under the resting roster after a release
    assert.notEqual(rest.properties.get('--hud-kill-left-top'),`${52+232+8}px`,'the left kill rows never start under the held roster at rest');
    tab(rest,true);rest.flush();assert.equal(placed(rest),still,'pressing Tab moves no notice (its first relayout)');
    rest.settle();assert.equal(placed(rest),still,'nor once the held rosters have resized');
    tab(rest,false);rest.flush();assert.equal(placed(rest),still,'releasing Tab moves no notice (its first relayout still measures the held height)');
    rest.settle();assert.equal(placed(rest),still,'nor once the rosters are back at rest');
    assert.equal(rest.properties.get('--hud-kill-left-top'),`${52+parseFloat(rest.properties.get('--hud-roster-left-height'))+8}px`,
      'and the left kill rows start under the resting roster after the release');
    const held=tabRun(true);
    assert.equal(held.root.classList.contains('rosters-expanded'),true,'the class is back on after the resting read');
    assert.equal(placed(held),still,'the plan made while Tab is held from the first pass is the resting one');
    tab(held,false);held.flush();assert.equal(placed(held),still,'and releasing it moves nothing');
    // Every planned element keeps to the centre line (noticeCentreLine.ts): 1366 x 768, whose flank set the detection
    // left of the scope's arm, writes tops and widths only, never an x or an anchor shift.
    {
      const run=harness({extra:node=>({'.cot-mode-status.show':node([],rect(544,62,278,41)),'.cot-dp':node([],rect(12,573,160,183)),
        '.cot-drive':node([],rect(184,648,108,108)),'.cot-vehicle-controls':node([],rect(491,648,382,32)),'.cot-shells':node([],rect(467,688,433,64)),
        '.cot-si-cardhost':Object.assign(node([],rect(1050,260,300,260)),{childElementCount:1}),'.cot-net':node([],rect(1229,8,127,28)),'.cot-minimap':node([],rect(1130,532,220,220))})});
      for(const name of ['notice-x','alert-x','alert-shift','banner-x','revive-x','countdown-x'])
        assert.equal(run.properties.has(`--hud-${name}`),false,`1366 x 768 writes no --hud-${name}`);
      assert.ok(run.properties.has('--hud-notice-top')&&run.properties.has('--hud-alert-top'),'and writes the notices\' tops');
    }
    // A queued card placed clear of the battle sight only (a cramped 1000 x 551 window, the census's: on the centre line
    // tier 1) waits while the scope is up: the scope flag on the document element relayouts then, and only then (above:
    // no such card, no relayout).
    {
      let banner;
      const run=harness({width:1000,height:551,extra:node=>({'.cot-medal-toasts':(banner=node(),banner.childElementCount=1,banner),
        '.cot-mode-status.show':node([],rect(370,62,260,41)),'.cot-dp':node([],rect(12,356,160,183)),'.cot-drive':node([],rect(184,431,108,108)),
        '.cot-vehicle-controls':node([],rect(308,431,382,32)),'.cot-shells':node([],rect(284,471,433,64)),'.cot-si-cardhost':Object.assign(node([],rect(684,196,300,151)),{childElementCount:1}),
        '.cot-net':node([],rect(863,8,127,28)),'.cot-minimap':node([],rect(808,359,176,176))})});
      assert.match(run.body.dataset.hudNoticeTiers,/ m[01]/,'the card here clears less than the whole reticle');
      assert.equal(banner.dataset.placement,'ready','and shows with the scope down');
      const scope=on=>{run.html.toggleAttribute('data-cot-scoped',on);run.mutate([{type:'attributes',target:run.html,attributeName:'data-cot-scoped'}]);};
      scope(true);
      assert.equal(run.frames.size,1,'the scope coming up relayouts while such a card is queued');run.flush();
      assert.equal(banner.dataset.placement,'deferred','the card waits in the scope');
      assert.match(run.body.dataset.hudNoticeTiers,/ m[01]s?w$/,'marked waiting');
      scope(false);
      assert.equal(run.frames.size,1,'the scope going down relayouts too');run.flush();
      assert.equal(banner.dataset.placement,'ready','and the card shows again');
    }
    // The layout marks a wait on the feed ('f') only where the card's place cuts the lane that shows a row: at 390 x 844
    // (the phone's census boxes, the bottom filled by a stretched ammunition rail so that, as on the census, every place
    // for the card cuts a lane; on the centre line it cuts both) a kill row in either lane holds the card, marked, and an
    // empty feed neither holds nor marks it (the receipt's medalWaitCause trusts this mark).
    {
      const feed=(left,right,detected=false)=>{
        let banner;const lane=n=>({childElementCount:n,children:Array.from({length:n},()=>({hidden:false})),classList:{contains:()=>false}});
        const run=harness({width:390,height:844,bodyData:{cotWidth:'phone'},
          inRoot:{'.cot-kill-lane.l':()=>lane(left),'.cot-kill-lane.r':()=>lane(right),'.cot-sixth.on':()=>detected?{}:null},
          extra:node=>({'.cot-medal-toasts':(banner=node(),banner.childElementCount=1,banner),'.cot-mode-status.show':node([],rect(77,61,236,41)),
            '.cot-dp':node([],rect(8,579,120,137)),'.cot-drive':node([],rect(140,635,81,81)),'.cot-vehicle-controls':node([],rect(12,744,366,32)),
            '.cot-shells':node([],rect(12,500,366,332)),'.cot-si-cardhost':Object.assign(node([],rect(203,375,175,260)),{childElementCount:1}),'.cot-net':node([],rect(120,109,88,20)),
            '.cot-minimap':node([],rect(8,109,104,104))})});
        return [run.body.dataset.hudNoticeTiers.split(' ').pop(),banner.dataset.placement,run.properties,banner.dataset.size];
      };
      const [right,rightPlace]=feed(0,3),[left,leftPlace]=feed(3,0),[none,nonePlace]=feed(0,0);
      assert.match(right,/^m\d\w*wf$/,`a right-lane kill row holds the card, marked as the feed's (${right})`);
      assert.equal(rightPlace,'deferred');
      assert.match(left,/^m\d\w*wf$/,`a left-lane kill row holds the centred card too, marked as the feed's (${left})`);
      assert.equal(leftPlace,'deferred');
      assert.ok(!/w/.test(none)&&nonePlace==='ready','an empty feed neither holds nor marks it');
      // with the detection lit and no kill row: it waits exactly where its written place meets the detection's, never
      // marked as the feed's
      const [lit,litPlace,props,size]=feed(0,0,true);
      const px=v=>parseFloat(props.get(v)),dw=px('--hud-center-notice-width'),cw=size==='compact'?250:Math.min(380,390-32);
      const det={x:390/2-dw/2,y:px('--hud-notice-top'),w:dw,h:DETECTION_H};
      const card={x:390/2-cw/2,y:px('--hud-banner-top'),w:cw,h:size==='compact'?40:76},g=MOUSE_NOTICE_GAP_PX;
      const meets=card.x<det.x+det.w+g&&card.x+card.w>det.x-g&&card.y<det.y+det.h+g&&card.y+card.h>det.y-g;
      assert.ok(!/f$/.test(lit)&&(litPlace==='deferred')===meets&&/w$/.test(lit)===meets,
        `the lit detection holds the card exactly where their places meet, never marked as the feed's (${lit}, ${litPlace}, meets ${meets})`);
    }
    // A medal card queued while the revive count shows (a medal can arrive after the death) waits exactly where the two
    // places meet: the written places (the card's centre and top, the count's centre, top and scale) decide it.
    let met=0,apart=0;
    const px=v=>parseFloat(v);
    for(const [w,h] of [[1366,768],[1920,1080],[1024,600],[1280,720],[1600,900],[1024,768],[1440,900],[2560,1440]]){
      const revive={offsetWidth:Math.min(390,w-32),offsetHeight:129};let banner=null;
      const run=harness({width:w,height:h,inRoot:{'.cot-revive':()=>revive,'.cot-revive.on':()=>revive},
        extra:node=>{banner=node();banner.childElementCount=1;return {'.cot-medal-toasts':banner};}});
      const P=k=>run.properties.get(`--hud-${k}`);
      const compact=banner.dataset.size==='compact',cw=compact?Math.min(250,w-24):Math.min(380,w-32),ch=compact?40:(w>640?85:76);
      const card={x:w/2-cw/2,y:px(P('banner-top')),w:cw,h:ch};
      const s=Number(P('revive-scale')),count={x:w/2-revive.offsetWidth*s/2,y:px(P('revive-top')),w:revive.offsetWidth*s,h:revive.offsetHeight*s};
      const meet=card.x<count.x+count.w+8&&card.x+card.w>count.x-8&&card.y<count.y+count.h+8&&card.y+card.h>count.y-8;
      if(meet)met++;else apart++;
      assert.equal(banner.dataset.placement,meet?'deferred':'ready',`${w}x${h}: the medal card ${meet?'waits on':'shows beside'} the revive count`);
      assert.equal(run.body.dataset.hudNoticeTiers.endsWith('w'),meet,`${w}x${h}: the tiers mark the waiting card`);
    }
    assert.ok(met>0,`the medal card met the revive count somewhere (${met} met, ${apart} apart)`);
    // the systems row as the vehicle's controls mount into it: drawn first where its empty box stood, it jumped 271 px
    // across a phone's window a frame later (the loading census, CLS 0.031). The resize that brings its box into being
    // holds it hidden; the pass that seats it shows it, the same frame its seat is written.
    {
      const arrival=harness({touch:true,width:390,height:844});
      const row=arrival.parts['.cot-vehicle-controls']??arrival.node();
      const other=arrival.node();
      row.matches=sel=>sel==='.cot-vehicle-controls';other.matches=()=>false;
      arrival.resize([{target:row,contentRect:rect(0,0,0,0)},{target:other,contentRect:rect(0,0,0,0)}]);arrival.flush();
      assert.equal(arrival.properties.has('visibility'),false,'an empty row is not held');
      arrival.resize([{target:row,contentRect:rect(0,0,232,44)},{target:other,contentRect:rect(0,0,80,40)}]);
      assert.equal(arrival.properties.get('visibility'),'hidden','the row that comes into being stands hidden until its pass');
      assert.equal(arrival.frames.size,1,'and asks for that pass');
      arrival.flush();
      assert.equal(arrival.properties.has('visibility'),false,'the pass that seats it shows it');
      arrival.resize([{target:row,contentRect:rect(0,0,276,44)}]);
      assert.equal(arrival.properties.has('visibility'),false,'a row that only changes size is not held');
      arrival.flush();
    }
    // the battle decided (endScreen.ts body.cot-es-armed): the HUD holds its seats until the report covers it (the census,
    // CLS 0.028 on a phone: the countdown's fading dial and the alert under it seated again twice); a new battle lifts it
    {
      const decided=harness({touch:true,width:390,height:844});
      const seat=decided.properties.get('--hud-alert-top');
      assert.ok(seat,'the alert has its seat before the decision');
      decided.body.classList.add('cot-es-armed');
      decided.mutate([{type:'attributes',attributeName:'class',target:decided.body}]);
      decided.properties.delete('--hud-alert-top');
      decided.flush();
      assert.equal(decided.properties.has('--hud-alert-top'),false,'a pass after the decision writes no seat');
      decided.body.classList.remove('cot-es-armed');
      decided.mutate([{type:'attributes',attributeName:'class',target:decided.body}]);
      decided.flush();
      assert.equal(decided.properties.get('--hud-alert-top'),seat,'the class lifted, the pass seats the HUD again');
    }
  } finally {
    for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
}

// Touch portrait, solved end to end (critic r3: the source pins above let the wiring drift). The measured 390x844
// phone (tools/fixtures/battle-hud-layout.html in Chrome, layout-r3): the tray's collapsed slot at 468-520 parks the
// systems row at 416, across the sight centred at 422; the lower cluster (speedometer 594, left FIRE 628, stick 702)
// leaves no room under the scope readouts, so the row moves above the ring (314). The side kill lanes then end above
// the moved row. A taller portrait moves the row below the scope readouts, level with the tray and left of it, and the
// lanes keep the floor the row's natural place gave them: a moved row lends them nothing.
{
  const saved = new Map(['document','window','ResizeObserver','MutationObserver','requestAnimationFrame','getComputedStyle',
    'setTimeout','clearTimeout']
    .map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const box = (top,bottom,left,right) => ({top,bottom,left,right,width:right-left,height:bottom-top,x:left,y:top});
  function solvePortrait(width, height, rects, rowWidth) {
    const props = new Map(); let frame = null;
    const element = (rect, extra={}) => ({ getClientRects: () => [rect], getBoundingClientRect: () => rect, children: [],
      childElementCount: 0, dataset: {}, getAttribute: () => null, hasAttribute: () => false, toggleAttribute() {}, ...extra });
    const lane = (rect) => { const children = Array.from({length:8}, () => ({hidden:false}));
      return element(rect, {children, childElementCount: children.length}); };
    const nodes = Object.fromEntries(Object.entries(rects).map(([selector, rect]) => [selector, element(rect)]));
    nodes['.cot-vehicle-controls'] = element(rects['.cot-vehicle-controls'], {scrollWidth: rowWidth - 2});
    const kills = {'.cot-kill-lane.l': lane(box(0,84,0,171)), '.cot-kill-lane.r': lane(box(0,84,219,390))};
    const body = { dataset: {}, classList: { contains: (name) => name === 'cot-touch-layout' },
      style: { getPropertyValue: (key) => props.get(key) ?? '', setProperty: (key, value) => props.set(key, value),
        removeProperty: (key) => props.delete(key) },
      hasAttribute: () => true, toggleAttribute() {}, getAttribute: () => '' };
    globalThis.document = { body, documentElement: { clientWidth: width },
      querySelector: (selector) => nodes[selector] ?? kills[selector] ?? null, querySelectorAll: () => [] };
    globalThis.window = { innerWidth: width, innerHeight: height, visualViewport: { width, height }, document: globalThis.document,
      addEventListener() {} };
    globalThis.getComputedStyle = () => ({ visibility: 'visible' });
    globalThis.requestAnimationFrame = (fn) => { frame = fn; return 1; };
    // (a mouse pass arms the notice plan's resize-settle timer, mouseNoticePlan.ts: it must not outlive these stubs)
    globalThis.setTimeout = () => 0; globalThis.clearTimeout = () => {};
    globalThis.ResizeObserver = class { observe() {} };
    globalThis.MutationObserver = class { observe() {} };
    const root = { getClientRects: () => [{}], dataset: {}, classList: { contains: () => false, toggle() {} },
      getAttribute: () => null, querySelector: (selector) => kills[selector] ?? null };
    installBattleHudLayout(root);
    frame();
    const px = (name) => parseFloat(props.get(`--hud-${name}`));
    return { px, kills };
  }
  try {
    // 390x844, the measured phone
    const phone = solvePortrait(390, 844, {
      '.cot-top': box(0,62,23,367), '.cot-mode-status.show': box(62,103,56,334), '.cot-minimap': box(111,203,8,100),
      '.cot-touch.on .mobile-chrome': box(111,155,240,380), '.cot-shells': box(468,520,332,380),
      '.cot-vehicle-controls': box(416,460,12,378), '.cot-drive': box(593.76,678,14,98.24),
      '.cot-touch.on .fire.alt': box(628,684,137,193), '.cot-touch.on .joy': box(702,820,14,132),
      '.cot-dp': box(797,836,136.5,253.5), '.cot-net': box(822,842,14,102),
    }, 366);
    const centre = 844 / 2;
    assert.equal(phone.px('systems-top'), centre - SIGHT_BAND_ABOVE - 44, '390x844: the row moves above the ring (314)');
    // (on the window's centre line by its rendered width, 364 px: gauntlet r5 found it pressed to the right edge)
    assert.deepEqual([phone.px('systems-left'), phone.px('systems-width')], [13, 366], '390x844: whole, on the centre line');
    // the kill lanes end 8 px above the moved row (306): three rows a side under the map and the touch chrome
    // (under the map on the right lane's 29 px row pitch, 163 + 2 x 29: the lanes' rows interleaved 10-14 px apart,
    // gauntlet r5)
    assert.equal(phone.px('kill-left-top'), 221, 'the left lane starts under the map, on the right lane\'s pitch');
    assert.equal(phone.px('kill-left-height'), 3 * 29 - 3, '390x844: the left kill lane stops above the moved row');
    assert.equal(phone.px('kill-right-top'), 163, 'the right lane starts under the touch chrome');
    // (a 171 px half lane would stack its rows 41 px apart beside the personal lane's 29, on no common baseline, gauntlet
    // r14: the global feed takes one row the width right of the map instead, above the personal lane)
    assert.equal(phone.px('kill-right-height'), 29 - 3, '390x844: one wide row of the global feed, above the personal lane');
    assert.equal(phone.px('kill-right-width'), 390 - 100 - 8, '390x844: the global feed the width right of the map');
    assert.deepEqual(phone.kills['.cot-kill-lane.l'].children.map((row) => row.hidden).filter((hidden) => !hidden).length, 3,
      'the left lane shows only the rows that fit');
    // a taller portrait: room under the scope readouts above the cluster, level with the tray (the map and the touch
    // chrome expanded, so the lanes hold fewer than their eight rows and their floor shows)
    const tall = solvePortrait(430, 1000, {
      '.cot-top': box(0,62,43,387), '.cot-minimap': box(111,403,8,300), '.cot-touch.on .mobile-chrome': box(111,400,280,420),
      '.cot-shells': box(620,672,374,422), '.cot-vehicle-controls': box(568,612,52,418), '.cot-drive': box(820,904,14,98),
      '.cot-touch.on .fire.alt': box(850,906,137,193), '.cot-touch.on .joy': box(860,978,14,132), '.cot-dp': box(952,991,156,274),
    }, 366);
    assert.equal(tall.px('systems-top'), 500 + SCOPE_BAND_BELOW, 'tall: the row moves below the scope readouts (640)');
    assert.deepEqual([tall.px('systems-left'), tall.px('systems-width')], [12, 374 - 12 - 8],
      'tall: level with the tray, the row sits left of it, whole within the space');
    // the lanes start under the map and the chrome, the right lane's moved 3 px down onto the left's row (one pitch: their
    // rows sat 3 px apart, gauntlet r5); and they end above the reticle's band (500 - SIGHT_BAND_ABOVE - 8 = 428), never
    // the row's moved floor (632) nor its natural one (560): a portrait lane crosses the sight, and under the expanded map
    // no row fits above it (Watch's ride ran a row through the ring at 320x568, gauntlet r14)
    assert.deepEqual([tall.px('kill-left-top'), tall.px('kill-right-top')], [411, 411], 'tall: under the map and the chrome');
    assert.equal(tall.px('kill-left-height'), 0, 'tall: no left lane row through the reticle');
    assert.equal(tall.px('kill-right-height'), 0, 'tall: no right lane row through the reticle');
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
}
// r10 (critic r9; owner 2026-10-17, out of ammo): every pass measures the furniture the reticle keeps clear of
// (sightFurniture.ts), so the scope readouts follow the stylesheet; and it seats the scope's vision switch. A mouse
// layout keeps the switch right of the sight; a shot report's host (it takes the pointer over its whole box while it
// holds a card) or the open combat log over that seat sends it to the mirror seat left of the sight when nothing there
// comes within 3 px (900x700, measured: the card at 584-884 x 196-452, the switch 166x48 at 563-729 x 326-374); where
// the left lane's speedometer sits level with the marker (800x400: 184-292 x 164-272) it waits hidden. Touch never moves
// it, and the touch chip the reticle seats under the sight (data-seat) is the reticle's own mark, never furniture.
{
  const saved = new Map(['document','window','ResizeObserver','MutationObserver','requestAnimationFrame','getComputedStyle',
    'DOMMatrixReadOnly','setTimeout','clearTimeout']
    .map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const box = (left,top,right,bottom) => ({top,bottom,left,right,width:right-left,height:bottom-top,x:left,y:top});
  // (`styles`: a selector's computed style (or one a node), where it differs from shown, opaque and unmoved; the solver's window keeps its
  // listeners, and `dispatch` sends one an event on the selector's node and runs the relayout it asks for, if any)
  function solve(width, height, rects, { touch = false, hidden = false, styles = {} } = {}) {
    const nodes = new Map();
    for (const [selector, list] of Object.entries(rects)) nodes.set(selector, list.map((rect, i) => ({ rect, hidden: false,
      offsetWidth: rect.width, offsetHeight: rect.height, getClientRects: () => [rect], getBoundingClientRect: () => rect,
      contains(other) { return other === this; }, children: [], childElementCount: 0, dataset: {}, getAttribute: () => null,
      hasAttribute: () => false, toggleAttribute() {},
      computed: (Array.isArray(styles[selector]) ? styles[selector][i] : styles[selector]) ?? null,
      matches: (list) => list.split(',').some((part) => part.trim() === selector) })));
    const listeners = new Map();
    const vision = nodes.get('.cot-scope-vision')?.[0];
    if (vision) vision.hidden = hidden;
    const all = (selector) => [...new Set(selector.split(',').flatMap((part) => nodes.get(part.trim()) ?? []))];
    const body = { dataset: {}, classList: { contains: (name) => touch && name === 'cot-touch-layout' },
      style: { getPropertyValue: () => '', setProperty() {}, removeProperty() {} },
      hasAttribute: () => true, toggleAttribute() {}, getAttribute: () => '' };
    let frame = null;
    globalThis.document = { body, documentElement: { clientWidth: width },
      querySelector: (selector) => all(selector)[0] ?? null, querySelectorAll: all };
    globalThis.window = { innerWidth: width, innerHeight: height, visualViewport: { width, height }, document: globalThis.document,
      addEventListener(type, listener) { listeners.set(type, listener); } };
    globalThis.getComputedStyle = (node) => node?.computed ?? { visibility: 'visible', opacity: '1', transform: 'none' };
    globalThis.DOMMatrixReadOnly = class { constructor(text) { this.m42 = Number(/matrix\((.*)\)/.exec(text)[1].split(',')[5]); } };
    globalThis.requestAnimationFrame = (fn) => { frame = fn; return 1; };
    // (a mouse pass arms the notice plan's resize-settle timer, mouseNoticePlan.ts: it must not outlive these stubs)
    globalThis.setTimeout = () => 0; globalThis.clearTimeout = () => {};
    globalThis.ResizeObserver = class { observe() {} };
    globalThis.MutationObserver = class { observe() {} };
    const root = { getClientRects: () => [{}], dataset: {}, classList: { contains: () => false, toggle() {} },
      getAttribute: () => null, querySelector: () => null };
    installBattleHudLayout(root);
    frame();
    const read = () => ({ seat: body.dataset.scopeVision ?? '', boxes: sightFurniture.boxes.slice(0, sightFurniture.count)
      .map((b) => [b.x0, b.y0, b.x1, b.y1]), notice: sightNotice.on ? [sightNotice.x0, sightNotice.y0, sightNotice.x1, sightNotice.y1] : null,
      version: sightFurniture.version });
    return { ...read(), nodes, dispatch(type, selector, index = 0, propertyName = 'opacity') {
      frame = null;
      listeners.get(type)?.({ target: nodes.get(selector)[index], propertyName });
      if (!frame) return null;
      frame();
      return read();
    } };
  }
  try {
    const right = (width, height) => { const left = Math.min(width / 2 + Math.max(Math.min(width, height) * 0.15 + 8, 80), width - 180);
      return box(left, height / 2 - 24, left + 166, height / 2 + 24); };
    const base = { '.cot-shell': [box(12, 636, 76, 688)], '.cot-top': [box(287, 0, 613, 62)], '.cot-dp': [box(12, 389, 172, 572)],
      '.cot-drive': [box(184, 464, 292, 572)], '.cot-aim-warning:not([hidden]):not([data-seat])': [box(8, 118, 114, 142)] };
    // every kind of furniture the reticle keeps clear of is published (r10 critic: dropping .cot-con, the 667x375 defect,
    // went unnoticed): one box a selector, nowhere near the seats
    const kinds = ['.cot-vehicle-controls>button', '.cot-con', '.cot-touch.on .round', '.cot-touch.on .joy', '.cot-touch.on .quick',
      '.cot-minimap', '.cot-mode-status.show', '.flight-identity', '.cot-ear'];
    const every = Object.fromEntries(kinds.map((selector, i) => [selector, [box(300 + i * 30, 600, 320 + i * 30, 620)]]));
    const published = solve(900, 700, { ...every, '.cot-scope-vision': [right(900, 700)] }).boxes;
    for (const [i, selector] of kinds.entries()) {
      // (a round control published 5 px out on every side, ROUND_CONTROL_PAD: its ring keeps the marks 8 px off, r14)
      const pad = selector === '.cot-touch.on .round' ? 5 : 0;
      assert.ok(published.some((got) => got[0] === 300 + i * 30 - pad && got[1] === 600 - pad), `${selector} is furniture`);
    }
    let solved = solve(900, 700, { ...base, '.cot-scope-vision': [right(900, 700)] });
    assert.equal(solved.seat, '', '900x700: nothing over the seat right of the sight, the switch stays');
    for (const b of [[12, 636, 76, 688], [287, 0, 613, 62], [12, 389, 172, 572], [184, 464, 292, 572], [8, 118, 114, 142],
      [right(900, 700).left, 326, right(900, 700).right, 374]]) {
      assert.ok(solved.boxes.some((got) => got.every((v, i) => Math.abs(v - b[i]) < 1e-9)), `the furniture holds ${b}`);
    }
    assert.equal(solved.boxes.length, 6, 'one box a shown panel');
    solved = solve(900, 700, { ...base, '.cot-scope-vision': [right(900, 700)], '.cot-si-cardhost:not(:empty)': [box(584, 196, 884, 452)] });
    assert.equal(solved.seat, 'left', '900x700: a shot report over the seat sends the switch left of the sight');
    solved = solve(900, 700, { ...base, '.cot-scope-vision': [right(900, 700)], '.cot-si-log.open': [box(584, 74, 884, 452)] });
    assert.equal(solved.seat, 'left', '900x700: so does the open combat log');
    solved = solve(900, 700, { ...base, '.cot-scope-vision': [right(900, 700)], '.cot-si-cardhost:not(:empty)': [box(584, 196, 884, 452)],
      '.cot-kill-lane.l .cot-kf:not([hidden])': [box(0, 330, 240, 356)] });
    assert.equal(solved.seat, 'none', '900x700: a kill notice level with the marker leaves no mirror seat: hidden');
    solved = solve(800, 400, { '.cot-drive': [box(184, 164, 292, 272)], '.cot-scope-vision': [right(800, 400)],
      '.cot-si-cardhost:not(:empty)': [box(484, 74, 784, 244)] });
    assert.equal(solved.seat, 'none', '800x400: the speedometer beside the marker on the left: hidden while the report is up');
    solved = solve(900, 700, { ...base, '.cot-scope-vision': [right(900, 700)], '.cot-si-cardhost:not(:empty)': [box(584, 196, 884, 452)] },
      { hidden: true });
    assert.equal(solved.seat, '', 'no scope (the switch hidden): no seat');
    solved = solve(390, 844, { '.cot-scope-vision': [box(25, 399, 129, 445)], '.cot-si-cardhost:not(:empty)': [box(12, 380, 378, 520)] },
      { touch: true });
    assert.equal(solved.seat, '', 'touch keeps its own seat left of the sight');
    assert.ok(!layoutSourceR10.includes("'.cot-aim-warning:not([hidden])',") && layoutSourceR10.includes(".cot-aim-warning:not([hidden]):not([data-seat])"),
      'the seated touch chip is the reticle\'s mark, not furniture');
    // r10e: the sixth-sense notice is published for the touch chip to yield to (320x568, measured: the DETECTED notice at
    // 70-250 x 215-262.9, the chip seated over the sight at 82-238 x 233-257 under it), at its settled place whatever frame
    // of its 6 px slide the pass lands on; never on a mouse layout, whose canvas marks never dodge a notice
    const detected = { '.cot-sixth.on': [box(70, 211, 250, 258.875)] };
    const sliding = { '.cot-sixth.on': { visibility: 'visible', opacity: '0', transform: 'matrix(1, 0, 0, 1, -90, -4)' } };
    const before = solve(320, 568, base, { touch: true });
    assert.equal(before.notice, null, '320x568 touch: no notice, none published');
    solved = solve(320, 568, { ...base, ...detected }, { touch: true, styles: sliding });
    assert.deepEqual(solved.notice, [70, 215, 250, 262.875], '320x568 touch: the notice published where it settles');
    assert.ok(solved.version > before.version, 'the notice repaints the reticle');
    assert.equal(solved.boxes.length, before.boxes.length, 'the notice is no furniture: the canvas marks never dodge it');
    assert.equal(solve(900, 700, { ...base, ...detected }, { styles: sliding }).notice, null, 'a mouse layout never publishes it');
    // r10e: a pass that lands while the touch tray's collapsed shell slots fade out (opacity on its way to 0, scale .94)
    // measures them; the end of their fade measures again, and they are gone (two "panel" boxes the furniture recorder
    // caught at 8 touch sizes on integ ce8b634668, at 390x844: 334.57-380 x 469.39-518.61)
    const fading = { visibility: 'visible', opacity: '0.4', transform: 'matrix(0.94, 0, 0, 0.94, 0, 0)' };
    const slots = [box(332, 468, 380, 520), box(334.57, 469.39, 380, 518.61), box(334.57, 469.39, 380, 518.61)];
    const tray = solve(390, 844, { ...base, '.cot-shell': slots }, { touch: true, styles: { '.cot-shell': [null, fading, fading] } });
    assert.equal(tray.boxes.filter((b) => b[0] > 330).length, 3, 'mid-fade, the pass measures the selected slot and the fading two');
    fading.opacity = '0';
    assert.equal(tray.dispatch('transitionend', '.cot-shell', 1, 'background-color'), null, 'another property\'s end asks for nothing');
    assert.equal(tray.dispatch('transitionend', '.cot-shell', 1, 'transform'), null, 'nor its scale\'s (the idle receipt\'s window)');
    const settled = tray.dispatch('transitionend', '.cot-shell', 1);
    assert.ok(settled, 'the end of a furniture\'s fade asks for a relayout');
    assert.deepEqual(settled.boxes.filter((b) => b[0] > 330), [[332, 468, 380, 520]], 'and only the selected slot is furniture');
    // the sheets seat what the solver measures: the touch chip under the sight is the canvas chip's ink box, 24 px tall,
    // placed by its custom properties; the vision switch's mirror seat mirrors the mouse seat (its 180 px edge, 112 px
    // for the compact plate), and waits hidden (r10 critic: no receipt read either rule)
    const layoutCss = readFileSync(new URL('./battleHudLayout.css', import.meta.url), 'utf8');
    const aerialCss = readFileSync(new URL('./aerialHud.css', import.meta.url), 'utf8');
    assert.ok(layoutCss.includes(".cot-aim-warning[data-seat='sight']:not([hidden]){left:var(--hud-aim-warning-x);top:var(--hud-aim-warning-y);"
      + 'width:var(--hud-aim-warning-w);height:24px;min-height:0;padding-block:0;transform:none;'), 'the seated chip\'s rule');
    assert.ok(aerialCss.includes("body[data-scope-vision='left'] .cot-hud .cot-scope-vision{left:auto;right:min(calc(50% + max(15vmin + 8px,80px)),calc(100% - 180px))}")
      && aerialCss.includes("@media(max-width:539px){body[data-scope-vision='left'] .cot-hud .cot-scope-vision{right:min(calc(50% + max(15vmin + 8px,80px)),calc(100% - 112px))}}")
      && aerialCss.includes("body[data-scope-vision='none'] .cot-hud .cot-scope-vision{visibility:hidden}")
      && aerialCss.includes('left:min(calc(50% + max(15vmin + 8px,80px)),calc(100% - 180px))'), 'the switch\'s seats mirror each other');
    assert.ok(aerialCss.includes("body[data-scope-vision='left'] .cot-hud .cot-scope-vision{transform:translate(calc(0px - var(--hud-vision-shift,0px)),calc(-50% - var(--hud-vision-rise,0px)))}"),
      'the left seat rises over what meets its foot alone, its left edge on that one\'s');
    assert.ok(layoutSourceR10.includes('const edge = width < 540 ? 112 : 180;') && layoutSourceR10.includes('const reach = Math.max(Math.min(width, height) * 0.15 + 8, 80);'),
      'the solver models those seats');
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
}
const layout=readFileSync(new URL('./battleHudLayout.ts',import.meta.url),'utf8');
const hud=readFileSync(new URL('./hud.ts',import.meta.url),'utf8');
// the touch dial keeps its seat and scale once it stands down (it fades out after GO where it stood: set to the plan's
// default under it, it jumped 98 px over the alert as it faded, the loading census on a phone)
assert.match(layout,/'touch-countdown-top': touchCountdownShown && touchPlan \? touchPlan\.countdownTop\s+: parseFloat\(document\.body\.style\.getPropertyValue\('--hud-touch-countdown-top'\)\)/,
  'the touch dial keeps its seat while it stands down');
assert.match(layout,/const countdownScale = touchCountdownShown \? String\(touchPlan\?\.countdownScale \?\? 1\)\s+: document\.body\.style\.getPropertyValue\('--hud-touch-countdown-scale'\)/,
  'and its scale');
// the load card's foe heading grows leftward from its own right edge as the roster's flags arrive (the census: its box
// moved 26 px as its flag came)
assert.match(readFileSync(new URL('./battleLoad.ts',import.meta.url),'utf8'),/\.cot-bl \.team\.foe \.thead\{color:var\(--text-enemy\);direction:rtl;\}\n\.cot-bl \.team\.foe \.thead>\*\{direction:ltr;\}/,
  'the foe heading reads from its right edge, its words and flags in their own direction');
assert.match(layout,/new ResizeObserver\(\(entries\) => \{[\s\S]{0,900}?planInput\(entry\.target\);[\s\S]{0,900}?\n\s*schedule\(\);\n\s*\}\);/,'map zoom and roster size changes relayout the lanes (and mark the mouse notice plan\'s inputs)');
assert.match(layout,/window\.addEventListener\('cot:layoutchange', schedule\)/,'virtual keyboard/visual viewport changes reflow through the shared layout event');
assert.match(layout,/layoutViewportSize\(window\)/,'lanes measure the shared pinch-independent viewport');
assert.doesNotMatch(layout,/visualViewport\?\.(width|height)/,'no raw visual viewport size (a pinch shrinks it)');
assert.match(layout,/window\.addEventListener\('cot-hud-relayout', schedule\)/,'the network strip can request a relayout from outside the root');
assert.match(hud,/\.cot-ear\.r\{right:0;top:var\(--hud-roster-top-right,var\(--hud-ears-top,calc\(var\(--hud-band-h\) \+ 8px\)\)\);\}/,'the right roster reads its lane from the layout, with its own lane (under the corner plate) as the fallback');
assert.match(hud,/installBattleHudLayout\(root\)/);
const shot=readFileSync(new URL('./shotInfo.ts',import.meta.url),'utf8');
assert.doesNotMatch(shot,/t\('shotInfo\.(yourShots|yourShotsLast|damageReceived)'/,'log headings use existing GT catalog entries');

// Execute the maintained browser probe's standalone measurement callback
// without launching its CLI/browser. Its nested helper must survive page
// serialization and preserve thresholds, order and failure-only evidence.
const browserProbe=readFileSync(new URL('../../tools/battle-hud-layout.browser.mjs',import.meta.url),'utf8');
const measureStart=browserProbe.indexOf('function measure(state){');
const measureEnd=browserProbe.indexOf('\ntry {',measureStart);
assert.ok(measureStart>=0&&measureEnd>measureStart);
// The receipt's reading of a waiting medal card (medalWaitCause): a hidden card needs a cause the layout can name. A wait
// on a kill row stands only where the layout marked it ('f': a lane its place cuts shows a row), on a phone-width window,
// with the lane's shown rows meeting the card's place; a card held back by any kill row elsewhere (critic M7) fails.
{
  const start=browserProbe.indexOf('function medalWaitCause(');
  const end=browserProbe.indexOf('\nfunction noticeMeasure(',start);
  assert.ok(start>=0&&end>start,'the receipt names why a medal card waits in one function');
  const cause=runInNewContext(`${browserProbe.slice(start,end)}\nmedalWaitCause`,{});
  const lane=(x0,x1,y0,y1,shown)=>({staged:shown||3,shown,x:[x0,x1],y:[y0,y1]});
  const stage=(tiers,lanes,notices={})=>({tiers,waitingMedal:[120,148,250,40],notices,lanes});
  const phoneLanes={l:lane(0,171,221,308,3),r:lane(219,390,148,235,3)};
  assert.equal(cause(stage('d2 a2 c? r? m2swf',phoneLanes),false,390),true,'a phone-width card waits on the rows of the lane its place cuts');
  assert.equal(cause(stage('d2 a2 c? r? m2sw',phoneLanes),false,390),false,'not without the layout\'s mark (critic M7: a card held by any kill row)');
  assert.equal(cause(stage('d2 a2 c? r? m2swf',phoneLanes),false,844),false,'nor on a desktop window (the receipt\'s desktop cases always leave the card a place that keeps the lanes whole: mouseNoticePlan.selftest.mjs 4c, 4f)');
  assert.equal(cause(stage('d2 a2 c? r? m2swf',{l:lane(0,171,221,308,3),r:lane(219,390,148,235,0)}),false,390),false,'nor on a lane showing no row');
  assert.equal(cause(stage('d2 a2 c? r? m2swf',{l:lane(0,171,221,308,3),r:lane(219,390,260,347,3)}),false,390),false,'nor on rows clear of its place');
  assert.equal(cause(stage('d2 a2 c? r? m2sw',phoneLanes,{d:{box:[56,150,164,48]}}),false,390),true,'a shown notice on its place is a cause');
  assert.equal(cause(stage('d2 a2 c? r? m1w',{}),true,844),true,'so is the scope over a place that clears the battle sight only');
}
function measurementFixture(nodes){
  const queries=[];let styleReads=0;
  const dataset={mode:'battle'};
  const document={body:{dataset},querySelectorAll(selector){queries.push(selector);return nodes[selector]||[];}};
  const measure=runInNewContext(`${browserProbe.slice(measureStart,measureEnd)}\nmeasure`,{
    document,innerWidth:100,innerHeight:80,
    getComputedStyle(){styleReads++;return {opacity:'0.5',transform:'matrix(1,0,0,1,2,3)'};},
  });
  return {measure,queries,dataset,get styleReads(){return styleReads;}};
}
function measurementNode(name,x,y,width,height,visible=true){
  return {className:name,
    checkVisibility(options){assert.deepEqual(Object.keys(options),['checkOpacity','checkVisibilityCSS']);return visible;},
    getBoundingClientRect(){return {x,y,width,height,right:x+width,bottom:y+height};},
  };
}
{
  const f=measurementFixture({'.cot-ear.l':[
    measurementNode('left',0,0,20,20),measurementNode('hidden',0,0,90,90,false),
    measurementNode('zero',0,0,0,20)],'.cot-ear.r':[measurementNode('right',30,0,20,20)]});
  const result=f.measure('idle');
  assert.deepEqual(Array.from(result.rects,rect=>rect.name),['left','right']);
  assert.equal(result.failures.length,0);assert.equal(result.ammoTransitions,undefined);
  assert.equal(result.body,f.dataset);assert.equal(f.styleReads,0,'success avoids failure-only animation/style reads');
}
for(const [state,selector] of [['settings','.cot-set-hdr'],['ended','.es-hero']]){
  const f=measurementFixture({[selector]:[measurementNode(state,0,0,20,20)]});
  assert.equal(f.measure(state).rects[0].name,state);
  assert.equal(f.queries.includes('.cot-ear.l'),false,'alternate surfaces retain their own selectors');
}
{
  const shell={className:'cot-shell sel',getAttribute:()=>'false',parentElement:{classList:{contains:()=>true}},
    getAnimations:()=>[{playState:'running',currentTime:25,effect:{getComputedTiming:()=>({duration:180})}}]};
  const f=measurementFixture({'.cot-ear.l':[measurementNode('left',-1,0,20,20)],'.cot-shell':[shell]});
  shell.checkVisibility=()=>false;
  const result=f.measure('idle');
  assert.equal(result.failures[0],'offscreen: left');assert.equal(result.ammoTransitions.length,1);
  assert.equal(result.ammoTransitions[0].drawerOpen,true);assert.equal(result.ammoTransitions[0].opacity,'0.5');
  assert.equal(result.ammoTransitions[0].animations[0].timing.duration,180);
}
for(const [x,expected] of [[19,0],[18.9,1]]){
  const f=measurementFixture({'.cot-ear.l':[measurementNode('a',0,0,20,20)],
    '.cot-ear.r':[measurementNode('b',x,0,20,20)]});
  const result=f.measure('idle');
  assert.equal(result.failures.length,expected,'overlap must exceed one pixel on both axes');
  if(expected)assert.equal(result.failures[0],'a overlaps b');
}
assert.equal(measurementFixture({}).measure('idle').failures[0],'no visible UI checked');
console.log('battleHudLayout.selftest: bounded lanes, responsive ownership and localized headers passed');
