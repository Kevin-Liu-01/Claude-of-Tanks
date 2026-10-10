import { buildingRoadStationIndices } from './maps/roadStations.ts';
import { roadSettlementJunction } from './roadSettlementJunction.ts';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { roadBuildingFrontage, roadBuildingDoorAxis, buildingFootprintClearsRoads, roadBuildingClearanceCandidates, roadParcelAddsNoExclusion } from './roadBuildingFrontage.ts';
import { VILLAGE_BUILDERS } from './maps/villageKit.ts';
import { URBAN_BUILDERS } from './maps/urbanKit.ts';
import { STRUCTURE_BUILDERS, DESTRUCTIBLE_BUILDING_TYPES, makeTimberBathhouse } from './maps/structureKit.ts';
import { addCatalogExterior, attachStructureBuildContext, carryExteriorChimneyTops, exteriorChimneyTops } from './maps/exteriorDetailKit.ts';
import { jitterUV } from './propGeometry.ts';
import { sampleObbGround } from './propPlacement.ts';
import { deriveRuntimeStructureCollisionProfile, appendStructureCollisionBand } from './structureCollision.ts';
import { createHeightField } from './terrain.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { rebuildRegionalStructure, resolveRegionalArchitecture } from './maps/regional/index.ts';
// destruction (2026-10-07): a placed structure is described and tagged where it is built (props.ts describeStructureAt)
import { bindStructureSpans, describeStructure, tagStructureVertices } from './structureDamageSeam.ts';
import { createStructureDamage } from '../sim/structureDamage.ts';

for (const [tx, tz] of [[0, 1], [1, 0], [0.6, 0.8]]) for (const side of [-1, 1]) {
  for (const kind of ['cottage', 'farmhouse', 'woodshed']) {
    const site = { x: 0, z: 0, tx, tz, side };
    const original = { x: -tz * side * 11, z: tx * side * 11, rot: Math.atan2(tx, tz) };
    const pose = roadBuildingFrontage(kind, site, original, 9, 18);
    assert.ok(pose);
    const axis = roadBuildingDoorAxis(kind);
    const towardRoad = [-pose.x, -pose.z];
    const facing = [Math.sin(pose.rot + axis), Math.cos(pose.rot + axis)];
    assert.ok((facing[0] * towardRoad[0] + facing[1] * towardRoad[1]) / Math.hypot(...towardRoad) > 0.999999,
      `${kind}: actual local entrance faces the carriageway from either side`);
    assert.ok(buildingFootprintClearsRoads(pose, 9, 18, [[[-tx * 100, -tz * 100], [tx * 100, tz * 100]]]),
      'dimension-aware depth never intrudes on the road corridor');
  }
}
assert.equal(roadBuildingFrontage('fishery', { x: 0, z: 0, tx: 0, tz: 1, side: 1 },
  { x: -11, z: 0, rot: 0 }, 9, 18), null, 'waterfront working frontage is not an ordinary door');
assert.equal(buildingFootprintClearsRoads({ x: 0, z: 0, rot: 0 }, 20, 20, [[[-30, 0], [30, 0]]]), false,
  'a cross street through the building fails even when all four corners are clear');
assert.equal(buildingFootprintClearsRoads({ x: 0, z: 0, rot: Math.PI / 4 }, 20, 20,
  [[[17, -30], [17, 30]]]), false, 'rotated building corners are protected');
assert.equal(buildingFootprintClearsRoads({ x: 0, z: 0, rot: 0 }, 20, 20,
  [[[0, 0], [0, 0]]]), false, 'a zero-length authored road point inside the footprint is unsafe');

// Repairs stay on their original side, keep the door orientation and try the
// smallest displacement first. This checks the parcel policy independently of
// any particular map's accepted candidate.
for (const side of [-1, 1]) {
  const site = { x: 0, z: 0, tx: 0, tz: 1, side };
  const original = { x: -12 * side, z: 7, rot: 0.3 };
  const candidates = roadBuildingClearanceCandidates(site, original);
  assert.deepEqual(candidates, roadBuildingClearanceCandidates(site, original));
  let previousDistance = 0;
  for (const pose of candidates) {
    const distance = Math.hypot(pose.x - original.x, pose.z - original.z);
    assert.ok(distance >= previousDistance - 1e-9 && distance <= 24 + 1e-9);
    assert.ok((pose.x - original.x) * -side >= 0, 'repair never steps toward the road');
    assert.equal(pose.rot, original.rot, 'repair preserves the authored door axis');
    previousDistance = distance;
  }
}
const originPose = { x: 0, z: 0, rot: 0 };
assert.equal(roadParcelAddsNoExclusion(originPose, { x: 8, z: 0, rot: 0 }, 3,
  [[[7, -2], [7, 2]]]), false, 'do not consume a later parcel across any of its setback interval');
assert.equal(roadParcelAddsNoExclusion(originPose, { x: 1, z: 0, rot: 0 }, 3,
  [[[-8, 0], [8, 0]]]), false, 'moving a partial exclusion boundary still rejects previously available offsets');
assert.equal(roadParcelAddsNoExclusion(originPose, { x: 1, z: 0, rot: 0 }, 3,
  [[[-1, -1], [1, 1]]]), true, 'an already fully occupied interval remains occupied');
assert.equal(roadParcelAddsNoExclusion(originPose, { x: 10, z: 0, rot: 0 }, 3,
  [[[0, 0], [0, 0]]]), true, 'vacating a reservation does not newly block another proposal');
assert.equal(roadParcelAddsNoExclusion(originPose, { x: 10, z: 0, rot: 0 }, 3,
  [[[10, 0], [10, 0]]]), false, 'degenerate future stations also protect their parcel');

// Run the actual road candidate/build/ground/collision production stage, with
// real kits and map height fields. Only its enclosing construction scope is
// reduced; there is no alternate building-placement implementation.
const propsUrl = new URL('./props.ts', import.meta.url).href;
const hooks = registerHooks({ load(url, context, next) {
  const result = next(url, context);
  if (url !== propsUrl) return result;
  return { ...result, source: result.source.toString() + '\nexport { makeCottage, makeBarn, makeTower, makeRuin, makeAdobe, makeRowhouse };' };
} });
const originals = await import('./props.ts');
hooks.deregister();
const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const names = ['plaster', 'plaster2', 'plaster3', 'stone', 'roof', 'wood', 'dark', 'glass', 'curtain', 'straw', 'baked', 'steel', 'structureMetal', 'structureWood',
  'regionalPlaster', 'regionalPlaster2', 'regionalPlaster3', 'regionalStone', 'regionalRoof'];
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, start); return source.slice(a, b);
}
const dependencies = { roadSettlementJunction, buildingRoadStationIndices, THREE, VILLAGE_BUILDERS, URBAN_BUILDERS, STRUCTURE_BUILDERS, DESTRUCTIBLE_BUILDING_TYPES,
  // the carriageway post-pass packs a building's chimney tops with it (props.ts roadBuildingClearance, 2026-10-03)
  makeTimberBathhouse, addCatalogExterior, attachStructureBuildContext, carryExteriorChimneyTops, exteriorChimneyTops, jitterUV,
  sampleObbGround, deriveRuntimeStructureCollisionProfile, appendStructureCollisionBand,
  // regional-buildings lane: the map's architecture kit swaps a placed building's geometry before its collision
  rebuildRegionalStructure, resolveRegionalArchitecture,
  bindStructureSpans, describeStructure, tagStructureVertices, createStructureDamage,
  buildingFootprintClearsRoads, roadBuildingFrontage, roadBuildingDoorAxis, roadBuildingClearanceCandidates, roadParcelAddsNoExclusion,
  ...Object.fromEntries(['mulberry32', 'makeCottage', 'makeBarn', 'makeTower', 'makeRuin', 'makeAdobe', 'makeRowhouse']
    .map(key => [key, originals[key]])),
};
function build(config, enable) {
  const body = `function* place(config, heightField) {
    const P = { sideSkip: 0.25, spacingPad: 9, buildingLat: [10, 4], maxSpread: 1.7, wallStoneChance: 0.25, ...config.props };
    const L = heightField._layout, v = L.village, mapId = config.id, noVeg = heightField._noVeg;
    const town = P.town ? { ...v, ...P.town } : v; // the settlement the props dress (props.ts)
    const seed = 2002, rng = mulberry32(seed), detailUvRng = () => 0.5;
    const buckets = Object.fromEntries(${JSON.stringify(names)}.map(name => [name, []]));
    const group = new THREE.Group(), obstacles = [], colliders = [], buildingFeatures = [];
    const foundryDonors = null; let wharfFishery = null;
    const _mat4 = new THREE.Matrix4(), _quat = new THREE.Quaternion(), _posv = new THREE.Vector3();
    const _upAxis = new THREE.Vector3(0,1,0), _one = new THREE.Vector3(1,1,1);
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
    const ensureSteelAtlas = () => {};
    const regionalSun = config.sky?.sunAzimuthDeg !== undefined ? { sunAzimuthDeg: config.sky.sunAzimuthDeg } : {}; // props.ts: the sun the kit's roofs weather by
    const regionalArchitecture = resolveRegionalArchitecture(P.architecture);
    ${section('function mergeInto(', 'type GroundDecalKind')}
    ${section('  function groundFit(', "  yield { stage: 'yard-clutter' };\n")}
    ${section('  const roads = L.roads;', '  // heaped masonry chunks')}
    return { buildings: buildingFeatures, receipt: group.userData.roadBuildingFrontage ?? [],
      rngTail: rng(), buckets, obstacles };
  }`;
  const factory = new Function(...Object.keys(dependencies), `return ${stripTypeScriptTypes(enable ? body :
    body.replace('placePlannedBuilding(px, pz, rot, roadSite);', 'placePlannedBuilding(px, pz, rot);'))}`)(...Object.values(dependencies));
  const field = createHeightField(1337, config), iterator = factory(config, field);
  let step = iterator.next(); while (!step.done) step = iterator.next();
  for (const geometry of Object.values(step.value.buckets).flat()) geometry.dispose();
  delete step.value.buckets;
  return step.value;
}
// Locate the farmhouse's actual entrance leaf (not its gable window).
const farmhouse = Object.fromEntries(names.map(name => [name, []]));
VILLAGE_BUILDERS.farmhouse(() => 0.5, farmhouse);
const entrance = farmhouse.dark.find(g => g.parameters?.width === 0.06 && g.parameters?.height === 2.0 && g.parameters?.depth === 0.85);
assert.ok(entrance, 'farmhouse real door geometry exists');
entrance.computeBoundingBox();
assert.ok(entrance.boundingBox.max.x < -3, 'farmhouse door is on the negative X wall');
assert.equal(roadBuildingDoorAxis('farmhouse'), -Math.PI / 2, 'farmhouse frontage follows its porch, not the gable');
for (const g of Object.values(farmhouse).flat()) g.dispose();
// Independent Euclidean segment/rectangle distance for review receipts; this
// is deliberately separate from the production conservative corridor test.
function footprintRoadDistance(pose, w, d, roads) {
  const c = Math.cos(pose.rot), s = Math.sin(pose.rot);
  const corners = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z]) =>
    [pose.x+x*w/2*c+z*d/2*s, pose.z-x*w/2*s+z*d/2*c]);
  const pointSegment = (p,a,b) => {
    const dx=b[0]-a[0], dz=b[1]-a[1], length=dx*dx+dz*dz;
    const t=length ? Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/length)) : 0;
    return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);
  };
  let best=Infinity;
  for (const road of roads) for(let k=1;k<road.length;k++) {
    const a=road[k-1],b=road[k];
    for(const p of [a,b]) {
      const dx=p[0]-pose.x,dz=p[1]-pose.z;
      if(Math.abs(dx*c-dz*s)<=w/2 && Math.abs(dx*s+dz*c)<=d/2)return 0;
    }
    for(let j=0;j<4;j++) {
      const p=corners[j],q=corners[(j+1)%4];
      const rx=b[0]-a[0],rz=b[1]-a[1],sx=q[0]-p[0],sz=q[1]-p[1];
      const cross=rx*sz-rz*sx;
      if(Math.abs(cross)>1e-10) {
        const dx=p[0]-a[0],dz=p[1]-a[1],t=(dx*sz-dz*sx)/cross,u=(dx*rz-dz*rx)/cross;
        if(t>=0&&t<=1&&u>=0&&u<=1)return 0;
      }
      best=Math.min(best,pointSegment(a,p,q),pointSegment(b,p,q),pointSegment(p,a,b),pointSegment(q,a,b));
    }
  }
  return best;
}
const audit = {};
for (const id of MAP_IDS) {
  const config = getMapConfig(id), before = build(config, false), after = build(config, true);
  if (id === 'saltwind') assert.equal(after.buildings.length, config.props.plan.length,
    'Saltwind accepts its complete authored plan on real dry supported road parcels');
  if (id === 'verdant') assert.deepEqual(after, before, 'Verdant geometry, placement and RNG remain exact');
  else {
    if (['coastal', 'saltwind', 'desert'].includes(id)) assert.ok(after.receipt.some(r => r.status === 'corrected'), `${id}: real production sites improve`);
    for (const row of after.receipt) if (row.status === 'corrected') {
      assert.ok(buildingFootprintClearsRoads(row.after, row.w, row.d, createHeightField(1337, config)._layout.roads));
      assert.notEqual(row.before.rot, row.after.rot);
    }
  }
  assert.equal(after.rngTail, before.rngTail, `${id}: frontage correction preserves every original road-stage RNG draw`);
  assert.equal(after.buildings.length, before.buildings.length, `${id}: no building churn`);
  const roads = createHeightField(1337, config)._layout.roads;
  for (const row of after.receipt) {
    row.beforeRoadClearanceM = footprintRoadDistance(row.before,row.w,row.d,roads);
    row.afterRoadClearanceM = footprintRoadDistance(row.after,row.w,row.d,roads);
    assert.notEqual(row.status, 'unresolved-road-conflict', `${id}/${row.kind}: shipping roadside parcels must have a safe fallback`);
    assert.ok(row.afterRoadClearanceM>=5.5-1e-7,
      `${id}/${row.kind}: independently measured real footprint clears the road`);
  }
  audit[id] = { before: before.buildings, after: after.buildings, frontage: after.receipt,
    rngTailUnchanged: before.rngTail === after.rngTail,
    corrected: after.receipt.filter(r => r.status === 'corrected').length,
    repaired: after.receipt.filter(r => r.status === 'clearance-repaired').length,
    unresolved: after.receipt.filter(r => r.status === 'unresolved-road-conflict').length,
    retained: after.receipt.filter(r => r.status === 'retained-authored-pose').length };
  console.log(`${id}: ${audit[id].corrected} facing, ${audit[id].repaired} setback, ${audit[id].retained} retained, ${audit[id].unresolved} unresolved; buildings ${before.buildings.length}→${after.buildings.length}; RNG tail ${audit[id].rngTailUnchanged ? 'exact' : 'changed'}`);
}
if (process.env.COT_FRONTAGE_RECEIPT) writeFileSync(process.env.COT_FRONTAGE_RECEIPT, JSON.stringify(audit, null, 2));
console.log('road building frontage: facing, safe fallback, all-map production clearance and Verdant preservation passed');
