import assert from 'node:assert/strict';
import {drawAerialMinimap} from './aerialMinimap.ts';
import {projectWorldToMinimap} from './minimapOrientation.ts';
for(const kind of ['drone','gunship']){
 const calls=[],ctx=new Proxy({}, {get:(o,key)=>o[key]??((...args)=>calls.push([key,...args]))});
 const view={kind,x:150,z:-40,yaw:0},carrier={x:-120,z:50};
 const project=(x,z)=>projectWorldToMinimap(x,z,1000,250);
 drawAerialMinimap(ctx,view,carrier,{x:20,z:80},{x:0,z:1},project,.25);
 assert.deepEqual(calls.find(c=>c[0]==='translate'),['translate',...project(150,-40)],'glyph tracks aircraft, not parked hull');
 assert.equal(calls.some(c=>c[0]==='strokeRect'),kind==='drone','only drone marks the carrier');
 assert.equal(calls.some(c=>c[0]==='arc'&&c[3]===22.5),kind==='gunship','gunship has a 90m orbit');
 assert.ok(calls.some(c=>c[0]==='arc'&&c[3]===5),'ground aim point is marked');
 assert.equal(calls.at(-1)[0],'restore');
}
console.log('aerialMinimap: aircraft projection, carrier tether, orbit, sight and canvas state passed');

const edgeCalls=[],edgeCtx=new Proxy({}, {get:(o,k)=>o[k]??((...args)=>edgeCalls.push([k,...args]))});
drawAerialMinimap(edgeCtx,{kind:'drone',x:800,z:-800,yaw:0},{x:0,z:0},null,{x:0,z:1},(x,z)=>projectWorldToMinimap(x,z,1000,250),.25);
assert.deepEqual(edgeCalls.find(c=>c[0]==='translate'),['translate',9,241],'drone beyond ground-map boundary keeps a visible edge marker');
