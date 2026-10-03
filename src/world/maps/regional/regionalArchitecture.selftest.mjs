// Regional architecture kits (regional-buildings lane, 2026-10-03): every kit's builders build sound geometry, and a
// map that adopts a kit keeps every placement, draw and collision record count of its settlement stage.
//
//   - each builder: deterministic, finite, one attribute set per bucket (vertex colours in the coloured buckets, the
//     night mask on curtain panes), regional tags, dressing flagged noCollision, every part grounded through a chain of
//     contacts (structureAssemblyAudit), a derivable collision profile within the 64-part band cap, a triangle budget,
//     no inverted faces seen from outside (ray casts), and a mobile build whose collision equals the desktop one;
//   - the surfaces: deterministic painters, values in range, the session cache returning the same pixels;
//   - placement: the real road-building stage of props.ts (the frontage receipt's section harness) run with and
//     without each kit-adopting map's architecture places the same buildings, draws the same stream and builds the
//     same number of collision records.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { ARCHITECTURE_STYLES, ARCHITECTURE_STYLE_IDS, buildRegionalParts, rebuildRegionalStructure, resolveRegionalArchitecture } from './index.ts';
import { streamFrom } from './geometry.ts';
import { auditStructureAssembly } from '../structureAssemblyAudit.ts';
import { deriveRuntimeStructureCollisionProfile, appendStructureCollisionBand } from '../../structureCollision.ts';
import { paintRegionalSurfaceBuffers } from '../../regionalSurfaces.ts';
import { NIGHT_EMISSION_ATTRIBUTE } from '../../../engine/nightEmissionMaterial.ts';
import { buildingRoadStationIndices } from '../roadStations.ts';
import { roadSettlementJunction } from '../../roadSettlementJunction.ts';
import { roadBuildingFrontage, roadBuildingDoorAxis, buildingFootprintClearsRoads, roadBuildingClearanceCandidates, roadParcelAddsNoExclusion } from '../../roadBuildingFrontage.ts';
import { VILLAGE_BUILDERS } from '../villageKit.ts';
import { URBAN_BUILDERS } from '../urbanKit.ts';
import { STRUCTURE_BUILDERS, DESTRUCTIBLE_BUILDING_TYPES, makeTimberBathhouse } from '../structureKit.ts';
import { addCatalogExterior, attachStructureBuildContext, carryExteriorChimneyTops } from '../exteriorDetailKit.ts';
import { jitterUV } from '../../propGeometry.ts';
import { sampleObbGround } from '../../propPlacement.ts';
import { createHeightField } from '../../terrain.ts';
import { MAP_IDS, getMapConfig } from '../index.ts';
import { registerHooks } from 'node:module';

const STYLES = ARCHITECTURE_STYLES;
assert.deepEqual([...ARCHITECTURE_STYLE_IDS].sort(), STYLES.map((s) => s.id).sort(), 'the registry keys are the kits\' ids');
assert.ok(STYLES.length >= 13, 'a kit for every map rebuilt to the layout brief');
assert.equal(resolveRegionalArchitecture(undefined), null);
assert.throws(() => resolveRegionalArchitecture('atlantean'), /Unknown architecture style/);

const COLOURED = new Set(['structureMetal', 'structureWood', 'regionalPlaster', 'regionalPlaster2', 'regionalPlaster3', 'regionalStone', 'regionalRoof']);
/** After the weathering pass the plain wall and roof buckets are empty: every wall and roof is weathered. */
const WEATHERED_SOURCES = ['plaster', 'plaster2', 'plaster3', 'stone', 'roof'];
/** Representative base footprints (info) of the plan ids, measured from the base builders. */
const INFO = {
  cottage: [6.0, 8.4, 5.0], farmhouse: [13.4, 9.9, 6.0], tavern: [9.7, 14.9, 8.4], schoolhouse: [9.1, 16.1, 11],
  cornershop: [9.0, 9.0, 7.3], barn: [8.4, 12.3, 6.2], granary: [4.2, 6.4, 4.7], woodshed: [4.3, 5.4, 3.1],
  depot: [11, 20, 6], ruin: [6.8, 9.0, 3.0], church: [9.6, 23.1, 20.4], chapel: [5.8, 8.6, 8.0], mill: [6.6, 6.6, 9.9],
  boatshed: [9.0, 12.0, 5.0], tower: [3.8, 3.8, 9.4], foundryoffice: [13.5, 14.4, 9.8], warehouse: [16, 24, 7.5],
  rangerlodge: [12.8, 16.4, 10.7], marketRow: [9, 16, 4], fishery: [18, 20, 7], rowhouse: [9.6, 10.2, 11],
  adobe: [6.6, 7.6, 4.2], caravanserai: [21.4, 19.4, 7.4], compound: [23, 14.5, 5.6], compoundSouk: [22, 16, 6],
  minaret: [4, 4, 13], bathhouse: [11, 10, 7], factory: [16, 26, 15], watertower: [5.6, 5.6, 14],
};
// triangles per building, the three-storey tavern included (its forty windows cut into the wall with reveals, sills,
// frames, bars and shutters, its window boxes, bench, woodpile, roof ladder and aerial, and a stripped roof patch when
// the wear pass damages it)
const BUDGET = 12000;
const ray = new THREE.Raycaster();

function build(style, id, seed, wallBucket, tier = 'desktop') {
  const [w, d, h] = INFO[id] ?? [7, 9, 6];
  return buildRegionalParts(style, {
    structureId: id, info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
    wallBucket, rng: streamFrom(seed), mapId: 'selftest', snowCap: false, tier,
  }, streamFrom(seed * 3 + 5));
}
const all = (parts) => Object.values(parts).flat();
function positions(parts) {
  return Object.entries(parts).map(([bucket, list]) => [bucket, list.map((g) => Array.from(g.getAttribute('position').array))]);
}

let builders = 0, triangles = 0, worst = 0;
for (const style of STYLES) {
  assert.ok(style.region.length > 20, `${style.id}: the kit names its region`);
  for (const id of Object.keys(style.builders)) {
    for (const [seed, wallBucket] of [[11, 'stone'], [29, 'plaster2']]) {
      const parts = build(style, id, seed, wallBucket);
      const again = build(style, id, seed, wallBucket);
      assert.deepEqual(positions(again), positions(parts), `${style.id}/${id}: deterministic for one seed`);
      let tris = 0, decor = 0, structural = 0, lit = 0;
      for (const [bucket, list] of Object.entries(parts)) {
        const sets = new Set();
        for (const g of list) {
          const names = Object.keys(g.attributes).sort().join(',');
          sets.add(names);
          assert.equal(g.index, null, `${style.id}/${id}/${bucket}: non-indexed`);
          assert.ok(g.userData.regional && g.userData.uvJitter === 'none', `${style.id}/${id}/${bucket}: regional tags`);
          assert.ok(g.hasAttribute('uv') && g.hasAttribute('normal'), `${style.id}/${id}/${bucket}: uv + normal`);
          assert.equal(g.hasAttribute('color'), COLOURED.has(bucket), `${style.id}/${id}/${bucket}: vertex colour exactly in the coloured buckets`);
          assert.equal(g.hasAttribute(NIGHT_EMISSION_ATTRIBUTE), bucket === 'curtain', `${style.id}/${id}/${bucket}: night mask exactly on curtain panes`);
          for (const v of g.getAttribute('position').array) assert.ok(Number.isFinite(v), `${style.id}/${id}: finite`);
          tris += g.getAttribute('position').count / 3;
          if (g.userData.noCollision) decor++; else structural++;
          if (bucket === 'curtain') lit += Array.from(g.getAttribute(NIGHT_EMISSION_ATTRIBUTE).array).filter((m) => m === 1).length;
        }
        assert.ok(sets.size <= 1, `${style.id}/${id}/${bucket}: one attribute set (${[...sets].join(' | ')})`);
        if (WEATHERED_SOURCES.includes(bucket)) assert.equal(list.length, 0, `${style.id}/${id}/${bucket}: weathered into its regional bucket`);
      }
      if (parts.curtain.length) assert.ok(lit >= 6, `${style.id}/${id}: curtain panes carry a lit outward face`);
      assert.ok(structural > 0, `${style.id}/${id}: structural geometry for collision`);
      assert.ok(tris <= BUDGET, `${style.id}/${id}: ${tris} triangles within ${BUDGET}`);
      const audit = auditStructureAssembly(parts);
      assert.equal(audit.unsupportedParts, 0, `${style.id}/${id}: every part reaches the ground through contacts`);
      const profile = deriveRuntimeStructureCollisionProfile(parts);
      assert.ok(profile.contact.parts.length >= 1, `${style.id}/${id}: a ground-contact band`);
      for (const band of profile.shell) assert.ok(band.parts.length <= 64, `${style.id}/${id}: shell band within the 64-part cap`);
      // the phones leave out dressing only: the collision a host certifies is tier-independent
      const mobile = build(style, id, seed, wallBucket, 'mobile');
      assert.deepEqual(JSON.stringify(deriveRuntimeStructureCollisionProfile(mobile)), JSON.stringify(profile),
        `${style.id}/${id}: mobile collision equals desktop`);
      assert.ok(all(mobile).reduce((n, g) => n + g.getAttribute('position').count / 3, 0) <= tris, `${style.id}/${id}: mobile builds no more`);
      // inverted faces: rays from outside must first hit a face that looks back at them
      const meshes = [];
      for (const [bucket, list] of Object.entries(parts)) for (const g of list) {
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); m.userData.bucket = bucket; meshes.push(m);
      }
      const [w, d, h] = INFO[id] ?? [7, 9, 6];
      const rng = streamFrom(seed * 7 + 1);
      let hits = 0, back = 0;
      for (let i = 0; i < 400; i++) {
        const az = rng() * Math.PI * 2, el = (rng() * 0.9 - 0.15) * Math.PI / 2;
        const dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
        const target = new THREE.Vector3((rng() - 0.5) * w, rng() * h * 1.3, (rng() - 0.5) * d);
        ray.set(target.clone().addScaledVector(dir, 60), dir.clone().negate());
        const hit = ray.intersectObjects(meshes, false)[0];
        if (!hit) continue;
        hits++;
        if (hit.face.normal.dot(dir) < -0.05) back++;
      }
      assert.ok(back <= Math.max(2, hits * 0.005), `${style.id}/${id}: ${back} of ${hits} first hits see an inverted face`);
      triangles += tris; worst = Math.max(worst, tris); builders++;
      for (const g of [...all(parts), ...all(again), ...all(mobile)]) g.dispose();
    }
  }
}
console.log(`regional builders: ${builders} builds sound, ${Math.round(triangles / builders)} triangles mean, ${worst} worst`);

// Surfaces: deterministic, in range, cached.
for (const [target, kind] of [['roof', 'beavertail'], ['roof', 'canal'], ['roof', 'slate'], ['stone', 'sandstone'], ['stone', 'limestone'], ['stone', 'granite']]) {
  const paint = () => { const g = paintRegionalSurfaceBuffers(target, kind, [0.5, 0.4, 0.3], 7); let s = g.next(); while (!s.done) s = g.next(); return s.value; };
  const a = paint(), b = paint();
  assert.deepEqual(Buffer.from(a.px.buffer), Buffer.from(b.px.buffer), `${kind}: deterministic pixels`);
  for (let i = 0; i < a.hgt.length; i += 97) {
    assert.ok(a.hgt[i] >= 0 && a.hgt[i] <= 1 && a.rough[i] >= 0 && a.rough[i] <= 1.05, `${kind}: height and roughness in range`);
  }
  // seamless: the wrap from the last column (row) into the first is no harsher than the harshest interior neighbour
  // pair — tile joints included — so the repeat shows no seam line
  const s = a.size, lum = (x, y) => { const j = (y * s + x) * 4; return a.px[j] + a.px[j + 1] + a.px[j + 2]; };
  const colDiff = (x0, x1) => { let d = 0; for (let y = 0; y < s; y++) d += Math.abs(lum(x0, y) - lum(x1, y)); return d; };
  const rowDiff = (y0, y1) => { let d = 0; for (let x = 0; x < s; x++) d += Math.abs(lum(x, y0) - lum(x, y1)); return d; };
  let colMax = 0, rowMax = 0;
  for (let k = 0; k + 1 < s; k++) { colMax = Math.max(colMax, colDiff(k, k + 1)); rowMax = Math.max(rowMax, rowDiff(k, k + 1)); }
  // (a joint falling exactly on the wrap splits its darkness differently from one at a fractional pixel: 15 % slack)
  assert.ok(colDiff(s - 1, 0) <= colMax * 1.15, `${kind}: the tile wraps across u without a seam`);
  assert.ok(rowDiff(s - 1, 0) <= rowMax * 1.15, `${kind}: the tile wraps across v without a seam`);
}
console.log('regional surfaces: deterministic, in range, seamless');

// Placement: the production road-building stage with and without each adopting map's kit.
const propsUrl = new URL('../../props.ts', import.meta.url).href;
const hooks = registerHooks({ load(url, context, next) {
  const result = next(url, context);
  if (url !== propsUrl) return result;
  return { ...result, source: result.source.toString() + '\nexport { makeCottage, makeBarn, makeTower, makeRuin, makeAdobe, makeRowhouse };' };
} });
const originals = await import('../../props.ts');
hooks.deregister();
const source = readFileSync(new URL('../../props.ts', import.meta.url), 'utf8');
const names = ['plaster', 'plaster2', 'plaster3', 'stone', 'roof', 'wood', 'dark', 'glass', 'curtain', 'straw', 'baked', 'steel', 'structureMetal', 'structureWood',
  'regionalPlaster', 'regionalPlaster2', 'regionalPlaster3', 'regionalStone', 'regionalRoof'];
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, start); return source.slice(a, b);
}
const dependencies = { roadSettlementJunction, buildingRoadStationIndices, THREE, VILLAGE_BUILDERS, URBAN_BUILDERS, STRUCTURE_BUILDERS, DESTRUCTIBLE_BUILDING_TYPES,
  makeTimberBathhouse, addCatalogExterior, attachStructureBuildContext, carryExteriorChimneyTops, jitterUV,
  sampleObbGround, deriveRuntimeStructureCollisionProfile, appendStructureCollisionBand,
  rebuildRegionalStructure, resolveRegionalArchitecture,
  buildingFootprintClearsRoads, roadBuildingFrontage, roadBuildingDoorAxis, roadBuildingClearanceCandidates, roadParcelAddsNoExclusion,
  ...Object.fromEntries(['mulberry32', 'makeCottage', 'makeBarn', 'makeTower', 'makeRuin', 'makeAdobe', 'makeRowhouse'].map((key) => [key, originals[key]])),
};
const stage = new Function(...Object.keys(dependencies), `return ${stripTypeScriptTypes(`function* place(config, heightField) {
  const P = { sideSkip: 0.25, spacingPad: 9, buildingLat: [10, 4], maxSpread: 1.7, wallStoneChance: 0.25, ...config.props };
  const L = heightField._layout, v = L.village, mapId = config.id, noVeg = heightField._noVeg;
  const seed = 2002, rng = mulberry32(seed), detailUvRng = () => 0.5;
  const buckets = Object.fromEntries(${JSON.stringify(names)}.map(name => [name, []]));
  const group = new THREE.Group(), obstacles = [], colliders = [], buildingFeatures = [];
  const foundryDonors = null; let wharfFishery = null;
  const _mat4 = new THREE.Matrix4(), _quat = new THREE.Quaternion(), _posv = new THREE.Vector3();
  const _upAxis = new THREE.Vector3(0,1,0), _one = new THREE.Vector3(1,1,1);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const ensureSteelAtlas = () => {};
  const regionalArchitecture = resolveRegionalArchitecture(P.architecture);
  ${section('function mergeInto(', 'type GroundDecalKind')}
  ${section('  function groundFit(', "  yield { stage: 'yard-clutter' };\n")}
  ${section('  const roads = L.roads;', '  // heaped masonry chunks')}
  const triangles = Object.fromEntries(Object.entries(buckets).map(([k, list]) => [k, list.reduce((n, g) => n + (g.index ? g.index.count : g.getAttribute('position').count) / 3, 0)]));
  for (const list of Object.values(buckets)) for (const g of list) g.dispose();
  return { buildings: buildingFeatures, rngTail: rng(), obstacles: obstacles.length, colliders: colliders.length, triangles };
}`)}`)(...Object.values(dependencies));
function run(config) {
  const iterator = stage(config, createHeightField(1337, config));
  let step = iterator.next(); while (!step.done) step = iterator.next();
  return step.value;
}
const adopting = MAP_IDS.filter((id) => getMapConfig(id).props?.architecture);
assert.ok(adopting.length >= 3, 'the kits are in use');
for (const id of adopting) {
  const config = getMapConfig(id);
  assert.ok(resolveRegionalArchitecture(config.props.architecture), `${id}: names a known kit`);
  const without = { ...config, props: { ...config.props, architecture: undefined } };
  const before = run(without), after = run(config);
  assert.deepEqual(after.buildings, before.buildings, `${id}: every building keeps its pose, footprint and kind`);
  assert.equal(after.rngTail, before.rngTail, `${id}: the placement stream draws exactly as before`);
  assert.equal(after.obstacles, before.obstacles, `${id}: one ground-contact record per building, as before`);
  const tb = Object.values(before.triangles).reduce((a, b) => a + b, 0), ta = Object.values(after.triangles).reduce((a, b) => a + b, 0);
  console.log(`${id} (${config.props.architecture}): ${after.buildings.length} buildings in place, stream exact; settlement triangles ${tb} → ${ta}, shell records ${before.colliders} → ${after.colliders}`);
}
console.log('regional architecture: kits sound, placements preserved');
