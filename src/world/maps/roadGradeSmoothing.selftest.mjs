import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import {smoothRoadGradesByDistance,blendRoadNetworkGrades} from './roadGradeSmoothing.ts';
import {alignPoldersNorthernRoadGrades} from './roadBorderCorridor.ts';
import { getMapConfig } from './index.ts';
import { createLayout, createHeightField } from '../terrain.ts';
import { roadNetworkComponentCount } from './roadEndpoints.ts';
import { routeDesertRoads, gradeDesertRoads, blendDesertRoadBanks } from './desertRoads.ts';
const road=Array.from({length:12},(_,i)=>[i*32,0]), values=road.map((_,i)=>Math.sin(i)*12), expected=values.slice();
for(let pass=0;pass<4;pass++) {const prev=expected.slice();for(let i=1;i<prev.length-1;i++)expected[i]=prev[i-1]*.25+prev[i]*.5+prev[i+1]*.25;}
const actual=[values.slice()];smoothRoadGradesByDistance([road],actual);assert.ok(actual[0].every((x,i)=>Math.abs(x-expected[i])<1e-12),'regular road keeps established32m smoothing');
const flat=[road.map(()=>7)];smoothRoadGradesByDistance([road],flat);assert.ok(flat[0].every(x=>x===7));
// Two intersections of a loop and spine: both must grade to shared levels.
const loop=[[-100,0],[0,0],[100,0],[100,100],[0,100],[-100,100]];
const spine=[[0,-100],[0,0],[0,50],[0,100],[0,200]];
const e=[loop.map(()=>10),spine.map(()=>2)];
blendRoadNetworkGrades([loop,spine],e);
assert.ok(Math.abs(e[0][1]-e[1][1])<1e-8,'firstloop crossing shares height');
assert.ok(Math.abs(e[0][4]-e[1][3])<1e-8,'secondloop crossing shares height');
const parallel=[[[-100,0],[100,0]],[[-100,10],[100,10]]],original=[[0,0],[20,20]],kept=structuredClone(original);
blendRoadNetworkGrades(parallel,kept);assert.deepEqual(kept,original,'nearbyparallel roads are notjunctions');
// Independently enumerate the actual seven road networks. Solve the two
// segment parameters, then interpolate each final elevation at that crossing;
// checking only nearby vertices would miss a step inside a painted junction.
const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];
const minus = (a, b) => [a[0] - b[0], a[1] - b[1]];
function exactCrossings(roads) {
  const crossings = [];
  for (let a = 0; a < roads.length; a++) for (let b = a + 1; b < roads.length; b++) {
    for (let i = 1; i < roads[a].length; i++) for (let j = 1; j < roads[b].length; j++) {
      const p = roads[a][i - 1], q = roads[a][i], r = roads[b][j - 1], s = roads[b][j];
      const forward = minus(q, p), other = minus(s, r), between = minus(r, p);
      const determinant = cross2(forward, other);
      if (Math.abs(determinant) < 1e-8) continue;
      const t = cross2(between, other) / determinant, u = cross2(between, forward) / determinant;
      if (t < -1e-8 || t > 1 + 1e-8 || u < -1e-8 || u > 1 + 1e-8) continue;
      const point = [p[0] + t * forward[0], p[1] + t * forward[1]];
      // Shared segment endpoints produce multiple identical hits. Deduplicate
      // at numerical precision, independently of the producer's metre radius.
      if (crossings.some(hit => hit.a === a && hit.b === b
        && Math.hypot(hit.point[0] - point[0], hit.point[1] - point[1]) < 1e-6)) continue;
      crossings.push({ a, b, i, j, t, u, point });
    }
  }
  return crossings;
}
const crossingCounts = { polders: 6, copper_mesa: 4, oasis: 6, whiteout: 6, orchard: 6, longleaf: 7, saltwind: 6 };
let checked = 0;
for (const [mapId, expectedCount] of Object.entries(crossingCounts)) {
  const roads = createLayout(getMapConfig(mapId)).roads;
  const crossings = exactCrossings(roads);
  assert.equal(crossings.length, expectedCount, `${mapId}: every authored crossing remains in the audit`);
  const levels = roads.map((nodes, route) => nodes.map(([x, z]) =>
    route * 4 + Math.sin(x * .01) * 8 + Math.cos(z * .008) * 4));
  const interpolated = (row, end, t) => row[end - 1] * (1 - t) + row[end] * t;
  assert.ok(crossings.some(hit => Math.abs(interpolated(levels[hit.a], hit.i, hit.t)
    - interpolated(levels[hit.b], hit.j, hit.u)) > 1), `${mapId}: fixture starts with unequal road levels`);
  blendRoadNetworkGrades(roads, levels);
  for (const hit of crossings) {
    assert.ok(Math.abs(interpolated(levels[hit.a], hit.i, hit.t)
      - interpolated(levels[hit.b], hit.j, hit.u)) < 1e-7,
    `${mapId}: roads ${hit.a}/${hit.b} share height at ${hit.point}`);
    checked++;
  }
}
assert.equal(checked, 41);
console.log('roadGradeSmoothing: physical smoothing and all 41 actual map crossings');

// Overlapping northeast causeways are not a geometric junction: their support
// nevertheless needs one continuous height plane in the shared boundary bank.
const poldersRoads = createLayout(getMapConfig('polders')).roads;
const poldersLevels = poldersRoads.map((nodes, route) => nodes.map(([x,z]) => route * 8 + z * .025));
const beforePolders = structuredClone(poldersLevels);
alignPoldersNorthernRoadGrades('polders', poldersRoads, poldersLevels);
assert.deepEqual(poldersLevels.slice(0,2), beforePolders.slice(0,2), 'unrelated routes remain exact');
for (const route of [2,3]) for (let i=0;i<poldersRoads[route].length;i++) {
  const z=poldersRoads[route][i][1];
  if(z<=398) assert.equal(poldersLevels[route][i],beforePolders[route][i], 'interior grades remain exact');
  if(z>=430) assert.ok(Math.abs(poldersLevels[route][i]-(20+z*.025))<1e-9, 'both banks use one shared z-plane');
}
const otherLevels=structuredClone(beforePolders);
alignPoldersNorthernRoadGrades('verdant',poldersRoads,otherLevels);
assert.deepEqual(otherLevels,beforePolders,'other maps are unchanged');
console.log('Polders shared boundary grade: unequal levels converge, interior and other routes stay exact');

// Desert's original north/south road climbed a mesa at35%, then reached44%
// near its northern approach. Sample the actual collision surface, not only
// authored control heights, so pad/grid composition cannot hide a steep road.
const desertConfig = getMapConfig('desert');
const desertRoads = createLayout(desertConfig).roads;
assert.deepEqual(desertRoads.map(r => r.length), [33,33], 'no road-node or decoration-count growth');
assert.equal(roadNetworkComponentCount(desertRoads),1,'both wadi routes stay connected');
const unmodifiedRoads=createLayout({...desertConfig,id:undefined}).roads;
assert.deepEqual(desertRoads[1],unmodifiedRoads[1],'east-west centreline preserved');
for(let i=0;i<desertRoads[0].length;i++) if(desertRoads[0][i][1]>=0&&desertRoads[0][i][1]<=96)
  assert.deepEqual(desertRoads[0][i],unmodifiedRoads[0][i],'central village frontage preserved');
const profile = desertRoads.map(nodes => nodes.map(([x,z]) => Math.sin(x*.017)*12+Math.cos(z*.012)*16));
const ungraded=structuredClone(profile);
gradeDesertRoads('desert',desertRoads,profile);
for(let r=0;r<profile.length;r++) {
  assert.ok(Math.abs(profile[r][0]-ungraded[r][0])<1e-10,'southern/western boundary levels preserved');
  assert.ok(Math.abs(profile[r].at(-1)-ungraded[r].at(-1))<1e-10,'northern/eastern boundary levels preserved');
  for(let i=0;i<desertRoads[r].length;i++) {
    const axis=desertRoads[r][i][r===0?1:0];
    if(axis>=(r===0?0:-64)&&axis<=96)assert.equal(profile[r][i],ungraded[r][i],'crossing platform levels preserved');
  }
}
const otherRoads=structuredClone(unmodifiedRoads);routeDesertRoads('verdant',otherRoads);
assert.deepEqual(otherRoads,unmodifiedRoads,'Verdant country road is unaffected');
// Independent unequal-plane grid: only overlapping outer banks may change.
{
  const size=65, extent=256, distances=new Float32Array(size*size), levels=new Float32Array(size*size);
  for(let i=0;i<levels.length;i++) {
    const z=Math.floor(i/size)*4-128;
    distances[i]=Math.min(Math.abs(z+32),Math.abs(z-32));levels[i]=z<0?0:20;
  }
  const before=levels.slice(),roads=[[[-128,-32],[128,-32]],[[-128,32],[128,32]]];
  blendDesertRoadBanks('desert',roads,[[0,0],[20,20]],distances,levels,size,extent,-128,-128);
  let changed=0;
  for(let i=0;i<levels.length;i++) {
    const x=(i%size)*4-128,z=Math.floor(i/size)*4-128;
    assert.ok(Number.isFinite(levels[i]),'finite outer bank surface');
    if(distances[i]<=14||Math.hypot(x+128,z+128)<=54)assert.equal(levels[i],before[i],'grid core and settlement support exact');
    if(levels[i]!==before[i])changed++;
  }
  assert.ok(changed>100,'unequal overlapping outer banks actually blend');
  const other=before.slice();blendDesertRoadBanks('verdant',roads,[[0,0],[20,20]],distances,other,size,extent,-128,-128);
  assert.deepEqual(other,before,'all non-Desert maps retain original bank plane');
}
const terrainUrl = new URL('../terrain.ts', import.meta.url).href;
const narrowBankUrl = terrainUrl + '?without-desert-earthworks';
const terrainSource = readFileSync(new URL(terrainUrl), 'utf8');
const bankPolicy = "cfg?.id === 'desert' ? 104 : 14";
assert.equal(terrainSource.split(bankPolicy).length, 2, 'one bounded Desert-only bank policy');
const bankHook = registerHooks({load(url,context,next) {
  return url===narrowBankUrl ? {format:'module-typescript',shortCircuit:true,
    source:terrainSource.replace(bankPolicy,'14').replace('    blendDesertRoadBanks(cfg?.id, roads, nodeElev, gRoadDist, gRoadElev, GN, MAP_SIZE, _VILLAGE.cx, _VILLAGE.cz);\n','')} : next(url,context);
}});
let narrowBankHeightField;
try { narrowBankHeightField=(await import(narrowBankUrl)).createHeightField; }
finally { bankHook.deregister(); }
const rejectedBanks = [
  {x:218.75561664874297,z:447.70032058848875,dx:226.9592271268789-218.35419539890077,dz:448-480},
  {x:-415.71421616023565,z:31.975915957601664,dx:-416+384,dz:23.77879994537608-29.853353096810764},
  {x:3.3730700467802315,z:-438.46503112805067,dx:6.2966829756935025-29.794336709300875,dz:-448+416},
];
function bankSlope(field,x,z,dx,dz) {
  const length=Math.hypot(dx,dz),nx=dz/length,nz=-dx/length;
  return Math.abs(field.getHeightAt(x+nx,z+nz)-field.getHeightAt(x-nx,z-nz))/2;
}
for(const seed of [1337,2025,7719]) {
  const field=createHeightField(seed,{...desertConfig,fieldTrenches:false});
  const original=createHeightField(seed,{...desertConfig,id:undefined,fieldTrenches:false});
  assert.deepEqual(field._layout.spawns,original._layout.spawns,'all deployment coordinates and headings preserved');
  let unchanged=0;
  const pads=[desertConfig.spawns.player,...desertConfig.spawns.enemies];
  for(let z=-480;z<=480;z+=32)for(let x=-480;x<=480;x+=32) {
    if(field._roadDist(x,z)<=108||original._roadDist(x,z)<=20
      ||pads.some(p=>Math.hypot(p.x-x,p.z-z)<=26))continue;
    assert.ok(Math.abs(field.getHeightAt(x,z)-original.getHeightAt(x,z))<1e-6,
      'mesa landscape outside road/pad support remains within one micrometre');
    assert.equal(field.getWaterMaskAt(x,z),original.getWaterMaskAt(x,z),'water identity unchanged');
    unchanged++;
  }
  assert.ok(unchanged>500,'broad unchanged landscape coverage outside the finite104m earthwork corridor');
  const narrow=narrowBankHeightField(seed,{...desertConfig,fieldTrenches:false});
  let villageProbes=0;
  for(let z=-46;z<=132;z+=8)for(let x=-92;x<=92;x+=8) {
    if(Math.hypot(x-desertConfig.terrain.village.cx,z-desertConfig.terrain.village.cz)>48)continue;
    assert.equal(field.getHeightAt(x,z),narrow.getHeightAt(x,z),'central48m settlement core receives no new bank grading');
    villageProbes++;
  }
  assert.ok(villageProbes>100,'central settlement-core grid is checked');
  if(seed===1337)for(const p of rejectedBanks) {
    assert.ok(bankSlope(narrow,p.x,p.z,p.dx,p.dz)>2.8,'negative control retains the rejected narrow fill wall');
    assert.ok(bankSlope(field,p.x,p.z,p.dx,p.dz)<.5,'the same photographed bank is graded below50%');
  }
  let worst=0,worstShoulder=0,nearShoulder=0,steepest=null;
  for(const road of desertRoads) for(let i=1;i<road.length;i++) {
    const a=road[i-1],b=road[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length,steps=Math.ceil(length/2);
    for(let j=0;j<steps;j++) {
      const t=(j+.5)/steps,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;
      if(Math.max(Math.abs(x),Math.abs(z))>510)continue;
      const grade=Math.abs(field.getHeightAt(x+2*dx,z+2*dz)-field.getHeightAt(x-2*dx,z-2*dz))/4;
      worst=Math.max(worst,grade);
      assert.equal(field.getHeightAt(x,z),narrow.getHeightAt(x,z),'road centreline height unchanged by wider earthworks');
      for(const offset of[6,10,14,18,24,32,48,64,80,96,104,108])for(const side of[-1,1]) {
        const px=x+dz*offset*side,pz=z-dx*offset*side;
        if(Math.max(Math.abs(px),Math.abs(pz))>510)continue;
        const slope=bankSlope(field,px,pz,dx,dz);
        if(slope>worstShoulder)steepest={x:px,z:pz,offset,slope,original:bankSlope(narrow,px,pz,dx,dz)};
        worstShoulder=Math.max(worstShoulder,slope);
        if(offset<=18)nearShoulder=Math.max(nearShoulder,slope);
        assert.ok(slope<=Math.max(1.4,bankSlope(narrow,px,pz,dx,dz)+.1),JSON.stringify({seed,px,pz,slope,old:bankSlope(narrow,px,pz,dx,dz)}));
      }
      assert.ok(grade<=.18,`Desert seed${seed}: road at${x},${z} grade${grade} <=18%`);
    }
  }
  assert.ok(nearShoulder<.85,'the 18m roadside bank stays below85% across every sampled approach');
  console.log(JSON.stringify({test:'desertRoadGrades',seed,worstGrade:worst,worstShoulder,nearShoulder,steepest,villageProbes,unchanged}));
}
