import assert from 'node:assert/strict';
import { roundRoadBends } from './roadBends.ts';
import { createLayout } from '../terrain.ts';
import { getMapConfig, MAP_IDS } from './index.ts';

const path = [[-120,0],[-80,0],[0,0],[0,80],[0,120]];
const before = JSON.stringify(path);
const bent = roundRoadBends([path])[0];
assert.equal(JSON.stringify(path), before, 'authoring inputs never mutated');
assert.deepEqual(bent.slice(0,2),path.slice(0,2));
assert.deepEqual(bent.slice(-2),path.slice(-2));
assert.equal(bent.length,9);
assert.deepEqual(bent[2],[-20,0]);
assert.deepEqual(bent[6],[0,20]);
assert.ok(bent.slice(2,7).every(([x,z])=> x>=-20 && x<=0 && z>=0 && z<=20),'curve cannot overshoot original bend triangle');
for(let i=2;i<bent.length-1;i++) {
 const a=bent[i-1],b=bent[i],c=bent[i+1],dx=b[0]-a[0],dz=b[1]-a[1],ex=c[0]-b[0],ez=c[1]-b[1];
 const angle=Math.acos(Math.max(-1,Math.min(1,(dx*ex+dz*ez)/Math.hypot(dx,dz)/Math.hypot(ex,ez))));
 assert.ok(angle<.5,'no sharp90-degree elbow survives the turn');
}
assert.deepEqual(roundRoadBends([path,[[0,-50],[0,50]]])[0],path,'intersection retains exact route alignment');
assert.deepEqual(roundRoadBends([path],0)[0],path,'opt-out keeps exact geometry');
assert.throws(()=>roundRoadBends([path],NaN));
assert.throws(()=>roundRoadBends([path],100));
const changed=['polders','copper_mesa','oasis','whiteout','orchard','longleaf','saltwind'];
for(const id of changed) {
 const routes=getMapConfig(id).terrain.roads.paths;
 assert.ok(routes.every(line=>line.every(p=>p.every(Number.isFinite))),`${id}: finite roads`);
 for(const line of createLayout(getMapConfig(id)).roads) for(let i=1;i<line.length;i++)
  assert.ok(Math.hypot(line[i][0]-line[i-1][0],line[i][1]-line[i-1][1])>1e-6,`${id}: no zero length segments`);
}
const white=getMapConfig('whiteout').terrain.roads.paths[0];
assert.ok(white.every(p=>p[1]<=-104),'Whiteout service street has no triangular104m detour');
const salt=getMapConfig('saltwind').terrain.roads.paths[3];
assert.deepEqual(salt[0],[-190,-36],'market street starts at existing harbor plaza');
assert.ok(salt.every((p,i)=>!i||p[0]>salt[i-1][0]),'market street progresses inland without doubled-back loops');
assert.equal(getMapConfig('verdant').terrain.roads,undefined,'Verdant keeps its existing country route generator');
assert.equal(MAP_IDS.length,31);
console.log('roadBends: bounded curves, preserved junctions/borders, coherent service routes,31-map registry');
