import { bridgeBallFloor } from '../../sim/bridgeBallSupport.ts';
import assert from 'node:assert/strict';
import {createHeightField,mulberry32} from '../terrain.ts';
import {getMapConfig,RANDOM_BATTLE_MAP_IDS} from './index.ts';
import {dressMapExtras} from './mapKits.ts';
import {structureTopAt} from '../../sim/structureSupport.ts';
import {trackSurfacePolicy} from '../trackSurface.ts';
const moon=getMapConfig('moon');
assert.equal(moon.sky.earth,1);assert.ok(moon.sky.planetDeg>=12);
// (the Earthrise 228 rebuild, 2026-10-18) the Earth apart from the sun: authored (round 2: over the North Massif in the
// north-north-east, in the south deployment's frame and over the station's rows; earthriseStation.ts EARTH_SKY), at least
// 90 degrees from the sun so its own lit limb shows, 12-14 degrees across, the sun low (15-20 up)
{const r=Math.PI/180,d=(az,el)=>[Math.sin(az*r)*Math.cos(el*r),Math.sin(el*r),Math.cos(az*r)*Math.cos(el*r)];
 assert.ok(Number.isFinite(moon.sky.earthAzimuthDeg)&&Number.isFinite(moon.sky.earthElevationDeg),'the Earth\'s direction is authored');
 const e=d(moon.sky.earthAzimuthDeg,moon.sky.earthElevationDeg),s=d(moon.sky.sunAzimuthDeg,moon.sky.sunElevationDeg);
 assert.ok(Math.acos(e[0]*s[0]+e[1]*s[1]+e[2]*s[2])/r>=90,'the Earth stands at least 90 degrees from the sun');
 assert.ok(moon.sky.planetDeg>=12&&moon.sky.planetDeg<=14,'the Earth 12-14 degrees across');
 assert.ok(moon.sky.sunElevationDeg>=15&&moon.sky.sunElevationDeg<=20,'a low sun, 15-20 degrees up');
 assert.ok(moon.sky.earthElevationDeg-moon.sky.planetDeg/2>=12,'the whole disc clear of the skyline');}
assert.equal(moon.sky.cloudOpacity+moon.sky.cloudOpacity2,0);
assert.equal(moon.sky.fogDensity,0);assert.equal(moon.vegetation.grassDensity,0);
// (round 2, 2026-10-18; the blind critics: "the distant hills are bright blue-white and read as snow or ice", the shaded
// scarps and berms blue, "the tan halos round the craters look like glowing sand rings") no air, no blue, no sand:
{const {readFileSync}=await import('node:fs');const post=readFileSync(new URL('../../engine/post.ts',import.meta.url),'utf8');
 // the aerial pass: an airless map (a FogExp2 of density 0) takes no legacy distance law, scatter-in or far hue clamp
 assert.match(post,/uAirless\.value = scene\.fog instanceof THREE\.FogExp2 && scene\.fog\.density === 0 \? 1 : 0;/,'airless: the fog of density 0 flags it');
 for(const gate of ['mix( texel.rgb, hazy, f * ( 1.0 - uAirless ) )','mix( texel.rgb, hazeCol, f2 * ( 1.0 - uAirless ) )','hueW * gDom * hzLayer * ( 1.0 - uAirless )'])
  assert.ok(post.includes(gate),`the legacy aerial law stands down airless: ${gate}`);
 // the far range: no striations on an airless map's faces (palisades at 2.6 km) and no sky's blue on a face the sun leaves
 const far=readFileSync(new URL('../../world/horizonFarRange.ts',import.meta.url),'utf8');
 assert.match(far,/uFAirless: \{ value: options\.airless \? 1 : 0 \}/,'the far range takes the airless flag');
 assert.ok(far.includes('* 3.0 * (1.0 - uFAirless);')&&far.includes('clamp(-ndl, 0.0, 1.0) * 0.35 * (1.0 - uFAirless)'),'airless: no striations, no cool shade');
 assert.ok(far.includes('rib * 0.14 * (1.0 - uFAirless)')&&/if \(options\.airless\) \{\s*const smooth = new Float32Array\(n\);/.test(far),'airless: the rows smoothed along their columns, no rib stripes');
 {const {sampleHorizonFarRange}=await import('../../world/horizonFarRange.ts');const {resolveHorizonRelief}=await import('../../world/horizonRelief.ts');
  const base={seed:4242,settings:resolveHorizonRelief('martian').far,deckBaseM:4000,seaOpenings:[],nearEdge:null,massif:null,escarpment:null};
  const rough=(g)=>{let s=0,c=0;for(let row=1;row<g.rowCount;row++)for(let k=0;k<g.columns;k++){const o=row*g.columns;const d=g.heights[o+k]-(g.heights[o+(k+g.columns-1)%g.columns]+g.heights[o+(k+1)%g.columns])/2;s+=d*d;c++;}return Math.sqrt(s/c);};
  const a=rough(sampleHorizonFarRange({...base,airless:true})),b=rough(sampleHorizonFarRange(base));
  assert.ok(a<b*0.6,`airless far rows: column-to-column relief ${a.toFixed(1)} m against ${b.toFixed(1)} m`);}
 // the far country's panorama (its shell is the visible far range; round 3): airless, the ring's outer height and skyline
 // the far country eases out of, caps its near band under and lifts its layers over are blended between the columns'
 // nine-column means either side of each bearing, so no range steps a tread at each of the ring's 431 columns (the
 // palisade); and the Moon's far country takes no erosion gullies
 const pano=readFileSync(new URL('../../world/horizonPanorama.ts',import.meta.url),'utf8');
 assert.ok(/if \(options\.fogDensity === 0\) \{\s*const f = \(angle \/ \(Math\.PI \* 2\)\) \* n, k0 = Math\.floor\(f\), t = f - k0;/.test(pano)
   &&pano.includes('sky = mean(ringSkyline, k0, 0) * (1 - t) + mean(ringSkyline, k0 + 1, 0) * t;')
   &&pano.includes('mean(options.ringEdge.heights, k0, start) * (1 - t) + mean(options.ringEdge.heights, k0 + 1, start) * t'),'airless: the ring edge blended between its columns');
 {const moonCfg=(await import('./moon.ts')).default;assert.equal(moonCfg.horizon.panorama.gullyM,0,'the Moon\'s far massifs gardened smooth: no gullies');}
 // the fog pole: an airless map's own grey, never the black dome's horizon nor the hue guard's blue-grey
 const skySrc=readFileSync(new URL('../../engine/sky.ts',import.meta.url),'utf8');
 assert.match(skySrc,/const fogColor = airless \? new THREE\.Color\(preset\.fogTintHex\) :/,'airless: the fog pole is the authored tint');
 assert.ok(skySrc.includes('if (!airless && fogColor.g > fogColor.b) {'),'airless: no blue-grey hue guard');
 // the shade light: the regolith's grey at the cool sky's own level (the key:fill ratios kept), every other map's sky blue
 const {resolveLightModel,hexToLinear}=await import('../../engine/lightModelCore.ts');
 const L=resolveLightModel(moon.sky,null,null),D=resolveLightModel({...moon.sky,shadeHex:null},null,null);
 const lum=(c)=>.2126*c[0]+.7152*c[1]+.0722*c[2];
 assert.ok(L.hemiSky[2]/L.hemiSky[0]<1.05&&L.hemiGround[2]/L.hemiGround[0]<1.05,`the Moon's shade light neutral (B/R ${(L.hemiSky[2]/L.hemiSky[0]).toFixed(2)})`);
 assert.ok(Math.abs(lum(L.hemiSky)-lum(D.hemiSky))<1e-6&&Math.abs(lum(L.hemiGround)-lum(D.hemiGround))<1e-6,'at the cool sky\'s own luminance');
 assert.deepEqual(D.hemiSky,hexToLinear(0xaac8f5),'unauthored, the cool sky as before');
 // the craters' soil: the regolith's grey whatever the ground classifies as, under the sand's cover
 const {craterSoil}=await import('../../fx/craterMarks.ts');
 for(const surface of ['sand','soil','rock']){const c=craterSoil(surface,'regolith',[0,0,0,0]);
  assert.ok(c[2]/c[0]>0.92&&c[2]/c[0]<1.0&&c[0]<0.1&&c[3]<0.8,`${surface}: the regolith's grey, never the sand's tan (${c.map((v)=>v.toFixed(3)).join(', ')})`);}}
assert.equal(moon.vegetation.clusterCount+moon.vegetation.loneCount+moon.vegetation.rimCount,0);
assert.equal(trackSurfacePolicy(moon.splat.sourcedPalette),'sand','lunar regolith is powder, never snow');
assert.ok(!RANDOM_BATTLE_MAP_IDS.includes('moon'));assert.ok(RANDOM_BATTLE_MAP_IDS.includes('cliffbridge'));
const cfg=getMapConfig('cliffbridge');
for(const seed of [1337,19,8821]){
  const field=createHeightField(seed,cfg);const [deck]=field.bridgeDecks;
  assert.equal(field.bridgeDecks.length,1);assert.ok(deck.deckY-deck.bedY>30);
  for(let z=-100;z<=100;z+=.25)for(const x of [-7,0,7]){
    assert.ok(field.getHeightAt(x,z)<=deck.deckY+.1,`${seed}: no buried deck at ${x},${z}`);
    assert.equal(field.getWaterMaskAt(x,z),0,'dry gorge cannot produce water FX');
  }
  for(const sign of [-1,1])for(let z=101;z<=194;z+=.25){
    const grade=Math.abs(field.getHeightAt(0,sign*(z+.25))-field.getHeightAt(0,sign*z))/.25;
    assert.ok(grade<.22,`${seed}: driveable approach grade ${grade}`);
  }
  const names=['plaster','plaster2','plaster3','roof','stone','wood','dark','glass','curtain','straw','baked'];
  const buckets=Object.fromEntries(names.map(n=>[n,[]])),obstacles=[],colliders=[];
  dressMapExtras({mapId:'cliffbridge',extraKits:[],L:field._layout,heightField:field,rng:mulberry32(seed),buckets,obstacles,colliders});
  const bridges=colliders.filter(x=>x.kind==='bridge');assert.ok(bridges.length>1);
  assert.ok(bridges.every(r=>r.shape2.parts.length<=64),'every bridge record fits server format');
  for(let z=-98;z<=98;z+=2)for(const x of [-7,0,7])assert.equal(structureTopAt(bridges,bridges.length,x,z,deck.deckY+.1),deck.deckY,'continuous real deck support');
  assert.equal(bridgeBallFloor(field,0,0,deck.deckY+.1),deck.deckY,'rolling ball stays on bridge');
  assert.equal(bridgeBallFloor(field,0,0,deck.bedY+2),field.getHeightAt(0,0),'ball below bridge is not teleported up');
  assert.equal(bridgeBallFloor(field,25,0,deck.deckY),field.getHeightAt(25,0),'ball falls when it leaves the span');
  for(const list of Object.values(buckets))for(const g of list)g.dispose();
}
console.log('earthriseCrossing: lunar policy and full-width dry viaduct approaches/collision passed');

// Exercise real exported collision support through the fixed-step movement loop.
import {Vector3} from 'three';
import '../../vehicles/fleetFactory.ts';
import {TANK_SPECS} from '../../vehicles/specs.ts';
import {createDedicatedWorldCollision} from '../../../server/dedicatedWorldCollision.ts';
import {createStructureSupportField} from '../../sim/structureSupport.ts';
import {createTankState,updateTank,SIM_DT} from '../../sim/movement.ts';
import {createMatchPlacement,matchPlacementAnchors} from '../../sim/matchPlacement.ts';
const world=createDedicatedWorldCollision('cliffbridge'), field=world.heightField;
const support=createStructureSupportField(field,world);
for(const direction of [1,-1]) {
 const spec=TANK_SPECS.m1a1_abrams_hc;
 const e={id:'drive',spec,state:createTankState(spec,new Vector3(0,field.getHeightAt(0,-direction*180),-direction*180),direction===1?0:Math.PI),input:{throttle:0,steer:0,brake:false,aimPoint:null},combat:null};
 for(let tick=0;tick<3000;tick++){
  e.input.throttle=tick<120?0:.6;
  support.beginHull(e.state.pos.x,e.state.pos.z,e.state.pos.y);
  updateTank(e,support,SIM_DT);
  if(Math.abs(e.state.pos.z)<95)assert.ok(e.state.pos.y>field.bridgeDecks[0].deckY-.6,'tracks cannot fall through deck');
  if(direction*e.state.pos.z>180)break;
 }
 assert.ok(direction*e.state.pos.z>180,`crossed both approaches: ${JSON.stringify(e.state.pos)}`);
 console.log('crossed',direction,e.state.pos.toArray());
}
for(const mapId of ['moon','cliffbridge']){
 const w=createDedicatedWorldCollision(mapId),cfg=getMapConfig(mapId);
 for(const mode of ['capture_the_flag','zone_control','turbo_ball','mars']){
  const p=createMatchPlacement({mapId,mode,anchors:matchPlacementAnchors(cfg.spawns),heightField:w.heightField,obstacles:w.getObstacles(),queryObstacles:w.queryObstacles});
  console.log(mapId,mode,JSON.stringify({zones:p.zones,middle:p.middle}));
 }
}
