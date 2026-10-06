import assert from 'node:assert/strict';
import {HUD_PARTS,hudCenter,hudProfile,normalizeHudPreferences,readHudPreferences,saveHudPreferences,HUD_LAYOUT_KEY} from './hudPreferences.ts';
assert.equal(hudProfile(1440,900,false),'desktop');
assert.equal(hudProfile(390,844,true),'portrait');
assert.equal(hudProfile(844,390,true),'landscape');
assert.equal(new Set(HUD_PARTS.map(p=>p.id)).size,HUD_PARTS.length);
for(const bad of [null,[],false,'garbage',{desktop:{map:{x:Infinity,y:NaN}}}])assert.deepEqual(normalizeHudPreferences(bad).portrait,{});
const data=normalizeHudPreferences({desktop:{map:{x:-5,y:8,hidden:true},score:{x:'bad',y:0},labels:{x:.5,y:.2},alien:{hidden:true}},portrait:{score:{x:.3,y:.2}}});
assert.deepEqual(data.desktop.map,{hidden:true,x:0,y:1});
assert.deepEqual(data.desktop.score,{hidden:false});
assert.deepEqual(data.desktop.labels,{hidden:false},'world-projected markers cannot be repositioned');
assert.equal(data.desktop.alien,undefined);
assert.deepEqual(data.landscape,{},'orientation profiles never leak into each other');
for(const [vw,vh] of [[1920,1080],[320,568],[568,256]])for(const x of [0,.5,1])for(const y of [0,.5,1]){
 const w=Math.min(230,vw-12),h=Math.min(200,vh-12),[cx,cy]=hudCenter(x,y,w,h,vw,vh);
 assert.ok(cx-w/2>=0&&cx+w/2<=vw&&cy-h/2>=0&&cy+h/2<=vh,'complete box stays onscreen');
}
const originalStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
try{
 const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};globalThis.window=new EventTarget();
 let notifications=0;window.addEventListener('cot:hud-preferences',()=>notifications++);
 assert.equal(saveHudPreferences(data),true);assert.equal(notifications,1);assert.deepEqual(readHudPreferences(),data);
 storage.set(HUD_LAYOUT_KEY,'broken JSON');assert.deepEqual(readHudPreferences(),{desktop:{},portrait:{},landscape:{}});
 localStorage.setItem=()=>{throw Error('quota');};assert.equal(saveHudPreferences(data),false);assert.equal(notifications,1,'failed save does not claim to apply');
}finally{for(const [key,desc]of [['localStorage',originalStorage],['window',originalWindow]]){if(desc)Object.defineProperty(globalThis,key,desc);else delete globalThis[key];}}
console.log('HUD preferences: validation, profile isolation, bounds, persistence and storage failure pass');
