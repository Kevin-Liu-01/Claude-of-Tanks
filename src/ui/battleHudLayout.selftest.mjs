import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { battleSideStack, installBattleHudLayout } from './battleHudLayout.ts';

for(const height of [0,30,62,100,150,200,320,600])for(const chat of [false,true])for(const count of [0,1,3,8]){
  const layout=battleSideStack(height,chat,count);
  assert.ok(layout.toastRows<=3&&layout.toastRows<=count);
  assert.ok(layout.toastHeight<=height);
  assert.ok(layout.chatOffset+layout.chatHeight<=height);
  if(chat&&height>=62)assert.ok(layout.chatHeight>=54,'the composer retains room below the alerts');
}
assert.equal(battleSideStack(100,true,3).toastRows,0,'tight chat lanes collapse transient alerts, not the input');
assert.equal(battleSideStack(320,false,3).toastRows,3);

// Observer lifecycle in a deterministic DOM: no-op attribute records must not
// turn layout into a per-frame job, but real state/viewport changes still do.
const originals = new Map(['document','window','ResizeObserver','MutationObserver',
  'requestAnimationFrame','getComputedStyle'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
try {
  const frames=new Map(); let nextFrame=1; let measures=0; let writes=0;
  const callbacks={}; const watched=[]; const listeners=new Map();
  const properties=new Map();
  const node=(attrs={})=>({
    attrs:{...attrs},dataset:{},childElementCount:0,visible:true,
    classList:{contains:()=>false},
    style:{getPropertyValue:key=>properties.get(key)||'',setProperty:(key,value)=>{writes++;properties.set(key,value);}},
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
  globalThis.document={body,querySelector:()=>null,querySelectorAll:()=>visibleNodes};
  globalThis.window={innerHeight:768,innerWidth:1366,visualViewport:viewport,
    addEventListener:(type,fn)=>listeners.set(type,fn)};
  globalThis.getComputedStyle=()=>({visibility:'visible'});
  globalThis.requestAnimationFrame=fn=>{const id=nextFrame++;frames.set(id,fn);return id;};
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
  const before=properties.get('--hud-right-height');
  viewport.height=420;listeners.get('viewport:resize')();flush();
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
} finally {
  for(const [key,descriptor] of originals){
    if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  }
}
const layout=readFileSync(new URL('./battleHudLayout.ts',import.meta.url),'utf8');
assert.match(layout,/new ResizeObserver\(schedule\)/,'map zoom and roster size changes relayout the lanes');
assert.match(layout,/visualViewport\?\.addEventListener\('resize'/,'virtual keyboard/visual viewport changes reflow');
const hud=readFileSync(new URL('./hud.ts',import.meta.url),'utf8');
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
