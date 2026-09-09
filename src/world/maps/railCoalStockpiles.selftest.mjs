import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import * as THREE from 'three';
import {createHeightField, mulberry32} from '../terrain.ts';
import {MAP_IDS, getMapConfig} from './index.ts';
import {convexHull2, pushHullFromObstacle, rayCollisionRecord, collisionFootprintContainsPoint} from '../collision.ts';
import {dressMapExtras} from './mapKits.ts';

const kitsUrl = new URL('./mapKits.ts', import.meta.url);
const controlUrl = new URL('./mapKits.ts?legacy-coal-control', import.meta.url);
const legacy = `function addRailYardCoalHeaps(heightField, rng, buckets) {
  for (let i = 0; i < 7; i++) {
    const x = 34 + rng() * 50, z = -140 + rng() * 280;
    if (heightField._roadDist(x, z) < 7) continue;
    const r = 2.2 + rng() * 2.4;
    const heap = new THREE.SphereGeometry(1, 10, 6);
    scaleUV(heap, 2, 1);
    heap.scale(r, r * 0.36, r * (0.7 + rng() * 0.4));
    heap.rotateY(rng() * Math.PI);
    heap.translate(x, heightField.getHeightAt(x, z) + r * 0.05, z);
    heap.name = 'rail-coal-stockpile'; // observer only
    buckets.dark.push(heap);
  }
}\n`;
registerHooks({load(url, context, next) {
  if (url !== controlUrl.href) return next(url, context);
  const result = next(kitsUrl.href, context), source = result.source.toString();
  const start = source.indexOf('function addRailYardCoalHeaps(');
  const end = source.indexOf('function addCableDrum(', start);
  assert.ok(start > 0 && end > start);
  return {...result, source: source.slice(0, start) + legacy + source.slice(end)};
}});
const {dressMapExtras: controlDress} = await import(controlUrl.href);
const names = ['plaster','plaster2','plaster3','roof','stone','wood','dark','glass','curtain','straw','baked'];
const isCoal = geometry => geometry.name === 'rail-coal-stockpile';
const bytes = value => Buffer.from(value.buffer, value.byteOffset, value.byteLength);
function hashGeometry(geometry) {
  const hash = createHash('sha256');
  for (const name of Object.keys(geometry.attributes).sort()) hash.update(name).update(bytes(geometry.attributes[name].array));
  if (geometry.index) hash.update(bytes(geometry.index.array));
  return hash.digest('hex');
}
function build(mapId, field, seed, legacy = false, blockers = []) {
  const config = getMapConfig(mapId), buckets = Object.fromEntries(names.map(name => [name, []]));
  const obstacles = blockers.slice(), colliders = [], random = mulberry32(seed);
  let calls = 0;
  (legacy ? controlDress : dressMapExtras)({mapId, extraKits:config.props.extraKits,
    riverLandings:config.props.riverLandings, L:field._layout, heightField:field,
    rng:()=>{calls++;return random();}, buckets, obstacles, colliders});
  return {buckets, obstacles, colliders, calls, next:random()};
}
function validatePile(geometry, obstacle, collider, field) {
  assert.equal(geometry.index, null);
  const position = geometry.attributes.position, normal = geometry.attributes.normal;
  assert.equal(position.count,216,'72 flat-shaded triangles per stockpile versus100 on the old ellipsoid');
  assert.equal(Object.values(geometry.attributes).reduce((n, attr)=>n+attr.array.byteLength,0),9504,
    'including color, merged vertex bytes do not exceed the old 9600-byte nonindexed sphere');
  assert.deepEqual(collider,obstacle);assert.notEqual(collider,obstacle);
  assert.notEqual(collider.shape2,obstacle.shape2);
  assert.equal(obstacle.kind,'coal-heap');assert.equal(obstacle.shape2.kind,'convex');
  const points=[];let low=Infinity, high=-Infinity;
  for(let i=0;i<position.count;i++) {
    const x=position.getX(i), y=position.getY(i), z=position.getZ(i);
    points.push([x,z]);low=Math.min(low,y);high=Math.max(high,y);
    assert.ok(y-field.getHeightAt(x,z)<0.9,'stockpiles stay below a metre above their support');
    assert.ok(x>81.5 && x<93.5 && z>-55.5 && z<-6.5,'coal belongs to the outer-siding service strip');
    assert.ok(field._roadDist(x,z)>=7-1e-5,'roads retain footprint clearance');
    assert.ok(field.getWaterMaskAt(x,z)<=0.01,'no floating or flooded piles');
    assert.ok(normal.getY(i)>0,'every open stockpile face has outward/upward winding');
  }
  assert.deepEqual(obstacle.shape2.points,convexHull2(points),'collision uses emitted packed vertices, no generic AABB');
  assert.equal(obstacle.min[1],low);assert.equal(obstacle.max[1],high);
  const {cx:x,cz:z}=obstacle.shape2;
  assert.equal(collisionFootprintContainsPoint(obstacle, x,z),true);
  assert.equal(collisionFootprintContainsPoint(obstacle, obstacle.min[0]+1e-4,obstacle.min[2]+1e-4),false,
    'empty rectangular corners remain driveable');
  const push={x:0,z:0};
  assert.ok(pushHullFromObstacle({x,z},0,1,1,0,2,1.5,obstacle,push),'a hull cannot drive through the pile');
  assert.ok(Math.hypot(push.x,push.z)>0);
  for(const railX of [40,49,58,67,76]) {
    assert.equal(pushHullFromObstacle({x:railX,z},0,1,1,0,2,1.5,obstacle,{x:0,z:0}),false,
      'the new solid footprint leaves every adjacent siding driveable');
  }
  const rayY=(low+high)/2;
  assert.ok(rayCollisionRecord({x:x-10,y:rayY,z},{x:1,y:0,z:0},collider,20,new THREE.Vector3())>=0);
  assert.equal(rayCollisionRecord({x:x-10,y:high+.01,z},{x:1,y:0,z:0},collider,20,new THREE.Vector3()),-1);
}
function dispose(result) {for(const geometries of Object.values(result.buckets)) for(const geometry of geometries) geometry.dispose();}
const railMaps=['railyard','foundry','skybridge','caldera'];
const totals={};
for(const mapId of MAP_IDS) {
  const field=createHeightField(1337,getMapConfig(mapId));
  const baseline=build(mapId,field,2002,true), candidate=build(mapId,field,2002);
  try {
    assert.equal(candidate.calls,baseline.calls);assert.equal(candidate.next,baseline.next,
      `${mapId}: every downstream seeded draw is preserved`);
    for(const name of names) assert.deepEqual(candidate.buckets[name].filter(g=>!isCoal(g)).map(hashGeometry),
      baseline.buckets[name].filter(g=>!isCoal(g)).map(hashGeometry),`${mapId}/${name}: unrelated geometry remains byte-exact`);
    const coal=candidate.buckets.baked.filter(isCoal);
    assert.equal(candidate.buckets.dark.filter(isCoal).length,0);
    assert.equal(candidate.obstacles.length,coal.length);assert.equal(candidate.colliders.length,coal.length);
    if(railMaps.includes(mapId)) assert.ok(coal.length>0,`${mapId}: retain recognizable coal stockpiles`);
    else assert.equal(coal.length,0,`${mapId}: all26 other map outputs unchanged`);
    coal.forEach((geometry,index)=>validatePile(geometry,candidate.obstacles[index],candidate.colliders[index],field));
    totals[mapId]=coal.length;
  } finally {dispose(baseline);dispose(candidate);}
}
const config=getMapConfig('railyard'), real=createHeightField(1337,config);
const flat={...real,getHeightAt:()=>0,_roadDist:()=>100,getWaterMaskAt:()=>0};
for(const field of [{...flat,getWaterMaskAt:()=>1}, {...flat,getHeightAt:x=>x},
  {...flat,_roadDist:x=>x>81?0:100}]) {
  const result=build('railyard',field,2002);
  assert.equal(result.buckets.baked.filter(isCoal).length,0,'wet, steep or road-overlapping sites fail closed');dispose(result);
}
const blocked=build('railyard',flat,2002,false,[{min:[80,-10,-60],max:[96,20,0]}]);
assert.equal(blocked.buckets.baked.filter(isCoal).length,0,'do not bury piles inside existing authored solids');dispose(blocked);
const propsSource=readFileSync(new URL('../props.ts',import.meta.url),'utf8');
assert.match(propsSource,/baked: new THREE.MeshStandardMaterial\(\{ vertexColors: true, roughness: 0.88, metalness: 0 \}\)/);
assert.match(propsSource,/dark: new THREE.MeshStandardMaterial\(\{ color: 0x161a1d, roughness: 0.35, metalness: 0.15 \}\)/,
  'shared rail hardware material is not changed');
console.log('railCoalStockpiles.selftest: exact non-coal geometry/RNG across30maps; supported72-triangle stockpiles; actual convex movement/ray records:',totals);
