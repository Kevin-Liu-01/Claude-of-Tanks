import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bakedGeometry, preloadPropModels } from './props.ts';
import { createUtilityPoleMaterial, textureUtilityPoleGeometry } from './utilityPoleSurface.ts';
import { makeTelephonePoleDistanceGeometry } from './propGeometry.ts';
const source = makeTelephonePoleDistanceGeometry();
const before = source.attributes.uv.array.slice();
const mapped = textureUtilityPoleGeometry(source);
assert.deepEqual(source.attributes.uv.array, before, 'shared source remains untouched');
assert.deepEqual(mapped.attributes.position.array, source.attributes.position.array, 'texture mapping does not change pole seating or silhouette');
let wood = 0, ceramic = 0;
for(let i=0;i<mapped.attributes.uv.count;i++) {
 const u=mapped.attributes.uv.getX(i),v=mapped.attributes.uv.getY(i);
 assert.ok(Number.isFinite(u)&&Number.isFinite(v));
 if(mapped.attributes.color.getX(i)>mapped.attributes.color.getY(i)*1.05) {
  assert.ok(u>=.039&&u<=.721);wood++;
 } else { assert.equal(u,.9375);ceramic++; }
}
assert.ok(wood>0&&ceramic>0,'timber and insulators use separate texture regions');
const a=createUtilityPoleMaterial(4),b=createUtilityPoleMaterial(4);
assert.deepEqual(a.map.image.data,b.map.image.data,'texture is deterministic');
assert.equal(a.map,a.bumpMap,'one shared texture supplies color and shallow grain relief');
const values=new Set();
for(let y=0;y<128;y++)for(let x=0;x<128;x++) {
 const i=(y*128+x)*4;
 if(x>=100)assert.equal(a.map.image.data[i],255,'insulator region stays neutral');
 else values.add(a.map.image.data[i]);
}
assert.ok(values.size>30,'grain has graded weathering rather than a flat fill');
source.dispose();mapped.dispose();for(const mat of [a,b]){mat.map.dispose();mat.dispose();}
console.log('utilityPoleSurface: stable geometry, ceramic masking, deterministic shared texture passed');

// Exercise the actual detailed pole, including its red metal fittings.
const originalFetch = globalThis.fetch;
try {
 globalThis.fetch = async url => new Response(readFileSync(url));
 await preloadPropModels();
} finally { globalThis.fetch = originalFetch; }
const detailed = bakedGeometry('telephone_pole_polygoogle', {targetH:7.4,sink:.15,sourceZMin:-1,whiteCap:[.14,.21,.16]});
const textured = textureUtilityPoleGeometry(detailed);
assert.equal(textured.attributes.position.count,detailed.index.count,'detailed triangle count is unchanged');
let timberCount=0,metalCount=0;
for(let i=0;i<textured.attributes.position.count;i++) {
 const c=textured.attributes.color,u=textured.attributes.uv.getX(i);
 if(c.getX(i)>.3) {assert.ok(u<.75);timberCount++;}
 if(c.getX(i)>.15&&c.getY(i)<.1) {assert.equal(u,.9375);metalCount++;}
}
assert.ok(timberCount>0&&metalCount>0);
assert.equal(detailed.getAttribute('uv'),undefined,'cached detailed source stays immutable');
textured.dispose();
console.log('utilityPoleSurface: detailed pole timber and metal regions passed');
