import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { battleSideStack, battleNotificationRows, battleRosterHeight, installBattleHudLayout, objectiveWidth, battleReportDock, REPORT_MAP_GAP } from './battleHudLayout.ts';
import { mouseNoticePlanWork } from './mouseNoticePlan.ts';

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
  assert.ok((width-w)/2>25, 'objective clears both clipped scoreboard corners');
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
  globalThis.document={body,documentElement:{clientWidth:1366},querySelector:()=>null,querySelectorAll:()=>visibleNodes};
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
  const before=properties.get('--hud-right-height');
  viewport.height=420;listeners.get('cot:layoutchange')();flush();
  assert.notEqual(properties.get('--hud-right-height'),before,'virtual keyboard changes available space');
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
  const mounted={'.cot-ear.r':()=>earRight,'.cot-mp-status.battle':()=>stripMounted?strip:null,
    '.cot-mp-status.battle .cot-mp-strip':()=>stripMounted?stripButton:null,'.cot-net':()=>plateShown?plate:null,'.cot-top':()=>score};
  globalThis.document.querySelector=selector=>mounted[selector]?.()??null;
  assert.equal(properties.has('--hud-roster-top-right'),false,'no strip, no roster lane variable');
  listeners.get('cot-hud-relayout')();assert.equal(frames.size,1,'the strip\'s relayout request schedules one measurement');flush();
  assert.equal(properties.has('--hud-roster-top-right'),false,'the corner-row strip leaves the enemies roster on its own lane');
  assert.equal(properties.get('--hud-right-top'),'106px','the report budget keeps the default roster start');
  assert.equal(properties.get('--hud-network-corner-right'),'10px','without the fps/ping plate the strip takes the corner itself');
  plateShown=true;plate.getBoundingClientRect=()=>rect(8,36,1248,1356);
  callbacks.resize();flush();
  assert.equal(properties.get('--hud-network-corner-right'),'134px','the strip sits 16 px left of a shown fps/ping plate, in the same row');
  assert.equal(properties.has('--hud-roster-top-right'),false);
  assert.equal(strip.hasAttribute('data-compact'),false,'room for every cell between the score and the plate');
  score.getBoundingClientRect=()=>rect(0,64,300,1100);
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
  assert.equal(properties.get('--hud-right-top'),'106px','the report budget returns to the default roster start');
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
  function harness({width=1366,height=768,touch=false,tab=false,elements={},inRoot={},extra=()=>({})}={}){
    const frames=new Map();let nextFrame=1;let observer=null;const properties=new Map();
    const classes=list=>{const set=new Set(list);return {set,contains:c=>set.has(c),add:c=>set.add(c),remove:c=>set.delete(c),
      toggle(c,on){const want=on??!set.has(c);if(want)set.add(c);else set.delete(c);return want;}};};
    const node=(list=[],box=null)=>({attrs:{},dataset:{},childElementCount:0,classList:classes(list),offsetWidth:0,offsetHeight:0,
      style:{getPropertyValue:k=>properties.get(k)||'',setProperty:(k,v)=>properties.set(k,v),removeProperty:k=>properties.delete(k)},
      getAttribute(k){return this.attrs[k]??null;},hasAttribute(k){return k in this.attrs;},
      toggleAttribute(k,on){const want=on??!(k in this.attrs);if(want)this.attrs[k]='';else delete this.attrs[k];return want;},
      getClientRects(){return [{}];},getBoundingClientRect(){return typeof box==='function'?box():box??rect(0,0,0,0);},
      dispatchEvent(){return true;},querySelector(){return null;},querySelectorAll(){return [];}});
    const root=node(tab?['cot-hud','rosters-expanded']:['cot-hud']);root.querySelector=sel=>inRoot[sel]?.()??null;
    const body=node(touch?['cot-touch-layout']:[]);const html=node();html.clientWidth=width;
    const parts={'.cot-top':node([],rect(width/2-172,0,344,62)),...Object.fromEntries(Object.entries(elements).map(([k,f])=>[k,node([],()=>f(root))])),...extra(node)};
    globalThis.document={body,documentElement:html,querySelector:sel=>parts[sel]??null,querySelectorAll:()=>[]};
    globalThis.window={innerWidth:width,innerHeight:height,visualViewport:{width,height,scale:1},document:globalThis.document,addEventListener(){}};
    globalThis.getComputedStyle=()=>({visibility:'visible'});
    globalThis.requestAnimationFrame=fn=>{const id=nextFrame++;frames.set(id,fn);return id;};
    globalThis.setTimeout=()=>0;globalThis.clearTimeout=()=>{};
    globalThis.ResizeObserver=class{observe(){}};
    globalThis.MutationObserver=class{constructor(fn){observer=fn;}observe(){}};
    installBattleHudLayout(root);
    const flush=()=>{const work=[...frames.values()];frames.clear();for(const fn of work)fn();};
    flush();
    return {root,body,html,properties,frames,flush,mutate:records=>observer(records),node,parts};
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
    // main's rule: under the score at 12 % of the height (no instrument in the way), the alert 8 px under a 48 px detection
    assert.equal(touch.properties.get('--hud-notice-top'),`${Math.floor(Math.max(62+8,768*.12))}px`);
    assert.equal(touch.properties.get('--hud-alert-top'),`${Math.floor(Math.max(62+8,768*.12)+48+8)}px`);
    // the mouse layout of the same window plans and carries it (the check above is not blind)
    mouseNoticePlanWork.bands=-1;
    const mouse=harness();
    assert.ok(mouseNoticePlanWork.bands>0,'the mouse layout plans');
    assert.equal(mouse.body.hasAttribute('data-hud-notices'),true);
    assert.match(mouse.body.dataset.hudNoticeTiers,/^d2 a2 /);
    // the scope flag (hud.ts, on the document element) schedules nothing while no medal card waits
    mouse.mutate([{type:'attributes',target:mouse.html,attributeName:'data-cot-scoped'}]);
    assert.equal(mouse.frames.size,0,'a scope toggle relayouts nothing');
    // Tab held for the first plan: the rosters' resting boxes, read with the class lifted, give the plan releasing keeps
    const ears={'.cot-ear.l':r=>r.classList.contains('rosters-expanded')?rect(0,52,560,420):rect(0,52,194,189),
      '.cot-ear.r':r=>r.classList.contains('rosters-expanded')?rect(1366-560,52,560,420):rect(1366-194,52,194,189)};
    const keys=h=>['notice-x','notice-top','alert-x','alert-top','alert-width'].map(k=>h.properties.get(`--hud-${k}`)).join(' ');
    const held=harness({tab:true,elements:ears}),rest=harness({elements:ears});
    assert.equal(held.root.classList.contains('rosters-expanded'),true,'the class is back on after the read');
    assert.equal(keys(held),keys(rest),'the plan made while Tab is held is the resting one');
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
      const card={x:px(P('banner-x'))-cw/2,y:px(P('banner-top')),w:cw,h:ch};
      const s=Number(P('revive-scale')),count={x:px(P('revive-x'))-revive.offsetWidth*s/2,y:px(P('revive-top')),w:revive.offsetWidth*s,h:revive.offsetHeight*s};
      const meet=card.x<count.x+count.w+8&&card.x+card.w>count.x-8&&card.y<count.y+count.h+8&&card.y+card.h>count.y-8;
      if(meet)met++;else apart++;
      assert.equal(banner.dataset.placement,meet?'deferred':'ready',`${w}x${h}: the medal card ${meet?'waits on':'shows beside'} the revive count`);
      assert.equal(run.body.dataset.hudNoticeTiers.endsWith('w'),meet,`${w}x${h}: the tiers mark the waiting card`);
    }
    assert.ok(met>0,`the medal card met the revive count somewhere (${met} met, ${apart} apart)`);
  } finally {
    for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
}

const layout=readFileSync(new URL('./battleHudLayout.ts',import.meta.url),'utf8');
const hud=readFileSync(new URL('./hud.ts',import.meta.url),'utf8');
assert.match(layout,/new ResizeObserver\(\(entries\) => \{[^}]*?\n[^}]*?\n\s*schedule\(\);\n\s*\}\);/,'map zoom and roster size changes relayout the lanes (and mark the mouse notice plan\'s inputs)');
assert.match(layout,/window\.addEventListener\('cot:layoutchange', schedule\)/,'virtual keyboard/visual viewport changes reflow through the shared layout event');
assert.match(layout,/layoutViewportSize\(window\)/,'lanes measure the shared pinch-independent viewport');
assert.doesNotMatch(layout,/visualViewport\?\.(width|height)/,'no raw visual viewport size (a pinch shrinks it)');
assert.match(layout,/window\.addEventListener\('cot-hud-relayout', schedule\)/,'the network strip can request a relayout from outside the root');
assert.match(hud,/\.cot-ear\.r\{right:0;top:var\(--hud-roster-top-right,52px\);\}/,'the right roster reads its lane from the layout, with its own lane as the fallback');
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
