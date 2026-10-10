import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import * as THREE from 'three';
import {createHeightField, mulberry32} from '../terrain.ts';
import {MAP_IDS, getMapConfig} from './index.ts';
import {convexHull2, pushHullFromObstacle, rayCollisionRecord, collisionFootprintContainsPoint} from '../collision.ts';
import {dressMapExtras} from './mapKits.ts';
import {railCoalStageStations} from '../railSpurs.ts';

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
// The legacy yards' heaps belong to the unloading strip east of the outer siding; a spur's coal stage (2026-10-01,
// Cinder Junction) puts each heap on one of its stations beside the stub.
// The track a heap must leave drivable: the legacy yards' five north-south sidings at the heap's z, or the stub the
// stage stands beside (its nearest centreline point).
const legacyStrip = { contains: (x, z) => x > 81.5 && x < 93.5 && z > -55.5 && z < -6.5,
  tracks: (_x, z) => [40, 49, 58, 67, 76].map(railX => [railX, z]) };
function nearestOnPath(path, x, z) {
  let best = null, bestD = Infinity;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z);
    if (d < bestD) { bestD = d; best = [px, pz]; }
  }
  return best;
}
function coalStrip(field) {
  const stages = (field._layout.railSpurs ?? []).filter(spur => spur.coalStage);
  if (!stages.length) return legacyStrip;
  const stations = stages.flatMap(spur => railCoalStageStations(spur));
  return { contains: (x, z) => stations.some(station => Math.hypot(x - station.x, z - station.z) < 3.4),
    tracks: (x, z) => stages.map(spur => nearestOnPath(spur.path, x, z)) };
}
function validatePile(geometry, obstacle, collider, field, strip = legacyStrip) {
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
    assert.ok(strip.contains(x,z),'coal belongs to its service strip: east of the outer siding, or a stage station beside its stub');
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
  for(const [railX,railZ] of strip.tracks(x,z)) {
    assert.equal(pushHullFromObstacle({x:railX,z:railZ},0,1,1,0,2,1.5,obstacle,{x:0,z:0}),false,
      'the new solid footprint leaves every adjacent siding driveable');
  }
  const rayY=(low+high)/2;
  assert.ok(rayCollisionRecord({x:x-10,y:rayY,z},{x:1,y:0,z:0},collider,20,new THREE.Vector3())>=0);
  assert.equal(rayCollisionRecord({x:x-10,y:high+.01,z},{x:1,y:0,z:0},collider,20,new THREE.Vector3()),-1);
}
function dispose(result) {for(const geometries of Object.values(result.buckets)) for(const geometry of geometries) geometry.dispose();}
// (batch 4: Skybridge round 3, e53ee9c50 — Page never had a railway: the yard's lines, coal heaps and stores are gone)
// (2026-10-07, the map-revival lane's Caldera round 3: Obsidian Caldera lays no rail yard — its sidings and their coal
// stood across Aso's paddies)
const railMaps=['railyard','foundry'];
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
    // Amberford redesign (owner 2026-09-23, round 48): the river kit's water mill is the one other kit structure that
    // publishes a footprint (a convex prism in both sinks, like the coal heaps); every other kit stays soft dressing.
    const mills=candidate.obstacles.filter(record=>record.kind==='mill-house');
    assert.equal(mills.length,mapId==='autumn'?1:0,`${mapId}: only Amberford's river kit seats a mill house`);
    // the map-revival lane (2026-10-05): Suzhou Creek's street kit (shanghaiStreets.ts) and Ruinspires' (sarajevoStreets.ts)
    // block with their burnt trams (Ruinspires' container screens too), a convex footprint in both sinks like the heaps
    const street=record=>record.kind==='tram-wreck'||record.kind==='container-screen';
    const screens=candidate.obstacles.filter(street);
    assert.equal(screens.length>0,mapId==='blackglass'||mapId==='ruinspires',`${mapId}: only Suzhou Creek's and Ruinspires' street kits stand trams`);
    assert.equal(candidate.colliders.filter(street).length,screens.length);
    assert.equal(candidate.colliders.filter(record=>record.kind==='mill-house').length,mills.length);
    // Round 61 (2026-09-24): Amberford's arched bridge is the second — one compound record the ride stands on with the
    // two parapets above it; every other kit stays soft dressing. Round 63 (2026-09-24): the record's parts follow the
    // geometry (the deck from the crown line, the abutments and piers footed below the bed, the vaults' haunch bands,
    // the parapets last) — archedBridgeCollision.selftest certifies the openings; here only the footprint contract.
    // 2026-10-01: Cliffbridge's viaduct (its terrain.bridges deck over the gorge) is the second map whose deck the arched
    // stone builder dresses. A tall bridge's parts exceed the 64-part server wire limit and split into consecutive
    // records of at most 64 parts, so the footprint contract below holds for each deck's records read in order.
    const bridges=candidate.obstacles.filter(record=>record.kind==='bridge'), decks=field.bridgeDecks??[];
    // 2026-10-05 (the map-revival lane): Suzhou Creek's four bridges are the arched stone builder's third map
    assert.equal(bridges.length>0,mapId==='autumn'||mapId==='cliffbridge'||mapId==='blackglass',
      `${mapId}: only Amberford's river kit, Cliffbridge's viaduct and Suzhou Creek's bridges span a bridge`);
    assert.equal(candidate.colliders.filter(record=>record.kind==='bridge').length,bridges.length);
    const deckRecords=decks.map(()=>[]);
    for(const bridge of bridges){
      const cx=(bridge.min[0]+bridge.max[0])/2, cz=(bridge.min[2]+bridge.max[2])/2;
      let nearest=0;
      decks.forEach((deck,index)=>{if(Math.hypot(deck.x-cx,deck.z-cz)<Math.hypot(decks[nearest].x-cx,decks[nearest].z-cz)) nearest=index;});
      deckRecords[nearest].push(bridge);
    }
    deckRecords.forEach((records,index)=>{
      if(!bridges.length) return;
      const deck=decks[index];
      assert.ok(records.length>0,`${mapId}: every bridge deck is dressed`);
      assert.ok(records.every(record=>record.shape2.kind==='compound'),'every record of a bridge is a compound');
      assert.ok(records.every((record,at)=>record.shape2.parts.length<=64&&(at===records.length-1||record.shape2.parts.length===64)),
        'records split only at the 64-part wire limit');
      const parts=records.flatMap(record=>record.shape2.parts), [body]=parts, parapets=parts.slice(-2);
      assert.ok(parts.length>3,'the deck, abutments, piers, vault bands and two parapets');
      assert.equal(body.y1,deck.deckY,'the deck part\'s top is the deck plane');assert.ok(body.y0<deck.deckY-0.9,'the deck part is a standable floor (round 63: from the crown line)');
      assert.ok(body.hw===deck.halfWidth&&body.hl>deck.halfLength,'the deck spans the road and its abutments');
      assert.ok(parts.slice(1,3).every(part=>part.y0<deck.bedY&&part.hw===deck.halfWidth),'the abutments are footed below the bed');
      for(const record of records){
        assert.equal(Math.min(...parts.map(part=>part.y0)),record.min[1]);assert.equal(Math.max(...parts.map(part=>part.y1)),record.max[1]);
      }
      for(const parapet of parapets){assert.equal(parapet.y0,deck.deckY);assert.ok(parapet.y1-parapet.y0>=1,'a parapet stops a hull');}
    });
    // Round 67's tunnel portals (Tarkhan's spur, 2026-10-01 Cinder Junction's main line) are retired (2026-10-03, the
    // map-borders lane): a cutting's line runs on in the open past the edge and publishes no record (railCutting.selftest).
    assert.equal(candidate.obstacles.filter(record=>record.kind==='tunnel-portal').length,0,`${mapId}: no tunnel portal`);
    // the map-revival lane (2026-10-06): Ironworks' furnace line (saarWorks.ts) stands its high-line's trestle bents and
    // the receiving yard's ore and coke heaps, each a convex footprint in both sinks like the coal heaps
    const works=candidate.obstacles.filter(record=>record.kind==='trestle'||record.kind==='ore-heap'||record.kind==='gas-washer');
    assert.equal(works.length>0,mapId==='foundry',`${mapId}: only Ironworks' furnace line stands trestles, heaps and a gas washer`);
    assert.ok(works.every(record=>record.shape2?.kind==='convex'),`${mapId}: the works' solids are convex footprints`);
    // P5 (the map-vehicles lane): Cinder Junction's standing rolling stock carries its own solid records
    const stock=candidate.obstacles.filter(record=>record.kind==='rolling-stock');
    if(mapId!=='railyard') assert.equal(stock.length,0,`${mapId}: no rolling stock`);
    const solids=coal.length+mills.length+bridges.length+works.length+screens.length+stock.length;
    assert.equal(candidate.obstacles.length,solids);assert.equal(candidate.colliders.length,solids);
    if(railMaps.includes(mapId)) assert.ok(coal.length>0,`${mapId}: retain recognizable coal stockpiles`);
    else assert.equal(coal.length,0,`${mapId}: all26 other map outputs unchanged`);
    const soft=record=>record.kind!=='mill-house'&&record.kind!=='bridge'&&record.kind!=='rolling-stock'&&!street(record)
      &&record.kind!=='trestle'&&record.kind!=='ore-heap'&&record.kind!=='gas-washer';
    const heaps=candidate.obstacles.filter(soft), heapColliders=candidate.colliders.filter(soft);
    const strip=coalStrip(field);
    coal.forEach((geometry,index)=>validatePile(geometry,heaps[index],heapColliders[index],field,strip));
    totals[mapId]=coal.length;
  } finally {dispose(baseline);dispose(candidate);}
}
// The clear-site law fails closed on a legacy yard (Foundry's strip) and on Cinder Junction's two coal stages.
for(const [mapId,roadBlock,blocker] of [['foundry',x=>x>81?0:100,[{min:[80,-10,-60],max:[96,20,0]}]],
  ['railyard',()=>0,[{min:[-112,-10,-48],max:[112,20,48]}]]]) {
  const config=getMapConfig(mapId), real=createHeightField(1337,config);
  const flat={...real,getHeightAt:()=>0,_roadDist:()=>100,getWaterMaskAt:()=>0};
  const open=build(mapId,flat,2002);
  assert.ok(open.buckets.baked.filter(isCoal).length>0,`${mapId}: a flat dry clear field admits heaps`);dispose(open);
  for(const field of [{...flat,getWaterMaskAt:()=>1}, {...flat,getHeightAt:x=>x}, {...flat,_roadDist:roadBlock}]) {
    const result=build(mapId,field,2002);
    assert.equal(result.buckets.baked.filter(isCoal).length,0,`${mapId}: wet, steep or road-overlapping sites fail closed`);dispose(result);
  }
  const blocked=build(mapId,flat,2002,false,blocker);
  assert.equal(blocked.buckets.baked.filter(isCoal).length,0,`${mapId}: do not bury piles inside existing authored solids`);dispose(blocked);
}
const propsSource=readFileSync(new URL('../props.ts',import.meta.url),'utf8');
assert.match(propsSource,/baked: new THREE.MeshStandardMaterial\(\{ vertexColors: true, roughness: 0.88, metalness: 0 \}\)/);
assert.match(propsSource,/dark: new THREE.MeshStandardMaterial\(\{ color: 0x161a1d, roughness: 0.35, metalness: 0.15 \}\)/,
  'shared rail hardware material is not changed');
console.log('railCoalStockpiles.selftest: exact non-coal geometry/RNG across30maps; supported72-triangle stockpiles; actual convex movement/ray records:',totals);
