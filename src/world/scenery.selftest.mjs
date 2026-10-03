// The scenery lane (2026-10-03): the rock forms, the landmark kit and the composer that places them.
//
//   1. every rock form builds closed, finite, welded-then-split geometry with the attributes the props rock material
//      reads (position, normal, colour, aRockGround, uv), inside its triangle budget on both tiers, deterministically;
//      standing forms publish a convex collision mass, pavements and scree none (they lie under a hull's step); a
//      hill's bedrock rings only the flanks no hull climbs, faces outward and publishes no mass;
//   2. the kit's destructible landmarks keep their collision inside their visible geometry and certify like every
//      other small item, and the config-only footprints (sceneryPlan.ts) equal the kit's radii;
//   3. the composer admits a feature only inside the square, off the pads, out of the road core, out of the water and
//      off the hard solids, says why it refused, appends static masses, and draws only its own streams;
//   4. every map that authors scenery places all of it on its real ground (a headless props build), its standing
//      masses reach the collision lists, and no tree stands inside one;
//   5. props.ts and vegetation.ts carry the pass and the keep-out (source pins).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { buildBedrock, buildRockFormation } from './sceneryRocks.ts';
import { SCENERY_DESTRUCTIBLE_TYPES, buildConductor, buildPylon } from './maps/sceneryKit.ts';
import {
  BEDROCK_TREE_CLEAR, LANDMARK_RADIUS, STONE_LANDMARKS, isDestructibleLandmark, isStoneLandmark, pylonLegHalf, rockReach,
  sceneryClearances, withGroundCoverHoles,
} from './sceneryPlan.ts';
import { composeScenery } from './scenery.ts';
import { certifyStructureCollisionProfile, deriveRuntimeStructureCollisionProfile } from './structureCollision.ts';
import { collisionFootprintContainsPoint } from './collision.ts';

function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------- 1. the rock forms

const slope = { getHeightAt: (x, z) => 2 + 0.05 * x - 0.02 * z + Math.sin(z * 0.07) * 0.8 };
const noise = new SimplexNoise({ random: mulberry32(4242) });
const FORMS = [
  // form, geology, radius, height, desktop triangle cap, mobile cap, standing
  ['tor', 'granite', 7, 5.5, 9000, 3000, true],
  ['outcrop', 'sandstone', 8, 4.5, 3000, 1600, true],
  ['outcrop', 'limestone', 7, 3.2, 3000, 1600, true],
  ['crag', 'slate', 6, 5, 4500, 2200, true],
  ['pavement', 'limestone', 15, 0, 5000, 2600, false],
  ['scree', 'slate', 10, 0, 3500, 1500, false],
  ['menhir', 'granite', 1.2, 4.5, 1200, 500, true],
  ['cairn', 'limestone', 4.2, 2.6, 6000, 1400, true],
  ['calvary', 'granite', 1.6, 5.6, 1200, 400, true],
  ['hoodoo', 'sandstone', 3.2, 6, 3000, 1500, true],
];
for (const [form, geology, radius, height, capDesktop, capMobile, standing] of FORMS) {
  for (const mobile of [false, true]) {
    const spec = { form, geology, x: 30, z: -20, radius, height, yawDeg: 25 };
    const a = buildRockFormation(spec, slope, noise, mulberry32(77), { mobile });
    const b = buildRockFormation(spec, slope, noise, mulberry32(77), { mobile });
    const label = `${geology} ${form}${mobile ? ' (mobile)' : ''}`;
    assert.ok(a.geometry, `${label}: builds`);
    const g = a.geometry;
    for (const name of ['position', 'normal', 'color', 'aRockGround', 'uv']) assert.ok(g.attributes[name], `${label}: carries ${name}`);
    assert.equal(g.index, null, `${label}: non-indexed (per-corner cleavage normals)`);
    const p = g.attributes.position.array, n = g.attributes.normal.array, c = g.attributes.color.array;
    assert.ok(p.every(Number.isFinite) && n.every(Number.isFinite) && c.every(Number.isFinite), `${label}: finite`);
    for (let i = 0; i < n.length; i += 3) {
      const len = Math.hypot(n[i], n[i + 1], n[i + 2]);
      assert.ok(Math.abs(len - 1) < 1e-3, `${label}: unit normals`);
    }
    assert.ok(c.every((v) => v >= 0 && v <= 1), `${label}: colour in gamut`);
    assert.ok(a.triangles <= (mobile ? capMobile : capDesktop), `${label}: ${a.triangles} triangles within ${mobile ? capMobile : capDesktop}`);
    assert.deepEqual(Array.from(b.geometry.attributes.position.array), Array.from(p), `${label}: deterministic on its stream`);
    if (standing) {
      assert.equal(a.masses.length, 1, `${label}: one standing mass`);
      const mass = a.masses[0];
      assert.ok(mass.points.length >= 6 && mass.y1 > mass.y0, `${label}: a convex hull with height`);
      // the hull is counter-clockwise and convex
      let sign = 0;
      for (let i = 0; i < mass.points.length; i += 2) {
        const j = (i + 2) % mass.points.length, k = (i + 4) % mass.points.length;
        const cross = (mass.points[j] - mass.points[i]) * (mass.points[k + 1] - mass.points[j + 1]) - (mass.points[j + 1] - mass.points[i + 1]) * (mass.points[k] - mass.points[j]);
        if (Math.abs(cross) < 1e-9) continue;
        if (!sign) sign = Math.sign(cross);
        assert.equal(Math.sign(cross), sign, `${label}: convex hull`);
      }
      assert.ok(sign > 0, `${label}: counter-clockwise hull`);
    } else {
      assert.equal(a.masses.length, 0, `${label}: lies flat under a hull's step (no mass)`);
    }
    a.geometry.dispose(); b.geometry.dispose();
  }
}
// a tor reaches its authored height within a fifth; a pavement's clints stay under a hull's step
{
  const tor = buildRockFormation({ form: 'tor', geology: 'granite', x: 0, z: 0, radius: 6, height: 5 }, { getHeightAt: () => 0 }, noise, mulberry32(3));
  assert.ok(Math.abs(tor.masses[0].y1 - 5) < 1.0, `the tor stands its 5 m (${tor.masses[0].y1.toFixed(2)})`);
  const pave = buildRockFormation({ form: 'pavement', geology: 'limestone', x: 0, z: 0, radius: 12, height: 0 }, { getHeightAt: () => 0 }, noise, mulberry32(3));
  assert.equal(pave.masses.length, 0, 'a pavement without a scar publishes no mass');
  const top = Math.max(...pave.geometry.attributes.position.array.filter((_, i) => i % 3 === 1));
  assert.ok(top < 0.55, `the clints stay under a hull's 0.55 m step (${top.toFixed(2)})`);
}

// ---------------------------------------------------------------------------------------------- 2. the kit

for (const [kind, meta] of Object.entries(SCENERY_DESTRUCTIBLE_TYPES)) {
  assert.equal(LANDMARK_RADIUS[kind], meta.r, `${kind}: the config-only footprint radius is the kit's`);
  assert.ok(isDestructibleLandmark(kind) && !isStoneLandmark(kind), `${kind}: a destructible landmark`);
  const geometry = meta.build(() => 0.5);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const hw = (box.max.x - box.min.x) / 2, hl = (box.max.z - box.min.z) / 2;
  assert.ok(box.min.y > -0.3 && box.max.y <= meta.h + 0.05, `${kind}: stands on its origin within its record height (${box.max.y.toFixed(2)} <= ${meta.h})`);
  if (meta.shape === 'circle') assert.ok(meta.collisionR <= Math.hypot(hw, hl) + 0.08, `${kind}: round collision inside the visible geometry`);
  else {
    assert.ok(meta.hw <= hw + 0.10, `${kind}: collision width follows the geometry (${meta.hw} vs ${hw.toFixed(2)})`);
    assert.ok(meta.hl <= hl + 0.10, `${kind}: collision length follows the geometry (${meta.hl} vs ${hl.toFixed(2)})`);
  }
  // the textured materials read UVs, the vertex-coloured ones colour
  for (const name of ['wood', 'straw', 'stone', 'plaster'].includes(meta.mat) ? ['position', 'normal', 'uv'] : ['position', 'normal', 'color']) {
    assert.ok(geometry.attributes[name], `${kind}: the ${meta.mat} material's ${name}`);
  }
  const buckets = { baked: [meta.build(mulberry32(91))] };
  const profile = deriveRuntimeStructureCollisionProfile(buckets);
  const certification = certifyStructureCollisionProfile(buckets, profile);
  assert.ok(certification.minimumScore > 90, `${kind}: small-item collision certification above 90 (${certification.minimumScore.toFixed(1)})`);
  if (meta.broken) { const broken = meta.broken(() => 0.5); assert.ok(broken.attributes.position.count > 0, `${kind}: a broken state`); broken.dispose(); }
  geometry.dispose();
}
for (const kind of Object.keys(STONE_LANDMARKS)) assert.ok(isStoneLandmark(kind) && !isDestructibleLandmark(kind), `${kind}: a stone landmark`);
{
  const pylon = buildPylon(mulberry32(5), 34);
  assert.equal(pylon.legHalf, pylonLegHalf(34), 'the pylon footprint the vegetation reserves is the tower\'s');
  assert.ok(pylon.geometry.attributes.position.count / 3 < 4000, 'a pylon stays under 4000 triangles');
  assert.ok(pylon.arms.length >= 5, 'the pylon carries its phases and its earth wire');
  const wire = buildConductor(0, 20, 0, 300, 22, 0, 9, 18, 0.045);
  const ys = wire.attributes.position.array.filter((_, i) => i % 3 === 1);
  assert.ok(Math.min(...ys) < 13 && Math.min(...ys) > 10, 'a conductor sags between its towers');
}

// a hill's bedrock: a dome (the terrain's knoll profile) on a plain; the beds start above the highest ground a hull
// climbs (grade 0.9) and never below it, face out of the hill, and carry no mass; the phones draw fewer triangles
{
  const dome = { getHeightAt: (x, z) => {
    const q = Math.hypot(x / 34, z / 30), w = 1 - (q <= 0.12 ? 0 : q >= 1 ? 1 : ((q - 0.12) / 0.88) ** 2 * (3 - 2 * (q - 0.12) / 0.88));
    return 2 + 26 * w * w * (3 - 2 * w);
  } };
  // the highest ground a hull climbs: the outermost point on each ray steeper than 0.9
  let climbTop = -Infinity;
  for (let j = 0; j < 72; j++) {
    const a = j / 72 * Math.PI * 2;
    for (let r = 45; r > 1; r -= 0.25) {
      const h0 = dome.getHeightAt(Math.cos(a) * (r - 0.5), Math.sin(a) * (r - 0.5)), h1 = dome.getHeightAt(Math.cos(a) * (r + 0.5), Math.sin(a) * (r + 0.5));
      if (h0 - h1 > 0.9) { climbTop = Math.max(climbTop, dome.getHeightAt(Math.cos(a) * r, Math.sin(a) * r)); break; }
    }
  }
  const spec = { geology: 'sandstone', x: 0, z: 0, radius: 42 };
  const desk = buildBedrock(spec, dome, noise, mulberry32(91));
  const again = buildBedrock(spec, dome, noise, mulberry32(91));
  const phone = buildBedrock(spec, dome, noise, mulberry32(91), { mobile: true });
  assert.ok(desk.geometry && phone.geometry, 'the dome shows its bedrock on both tiers');
  assert.equal(desk.masses.length, 0, 'bedrock is a skin: no collision mass');
  assert.deepEqual(Array.from(again.geometry.attributes.position.array), Array.from(desk.geometry.attributes.position.array), 'bedrock: deterministic on its stream');
  for (const name of ['position', 'normal', 'color', 'aRockGround', 'uv']) assert.ok(desk.geometry.attributes[name], `bedrock: carries ${name}`);
  const p = desk.geometry.attributes.position.array, n = desk.geometry.attributes.normal.array;
  assert.ok(p.every(Number.isFinite) && n.every(Number.isFinite), 'bedrock: finite');
  let lowest = Infinity, outward = 0, faces = 0;
  for (let i = 0; i < p.length; i += 3) {
    lowest = Math.min(lowest, p[i + 1]);
    const r = Math.hypot(p[i], p[i + 2]);
    // the beds' faces (steep normals) point out of the hill
    if (r > 4 && Math.abs(n[i + 1]) < 0.5) { outward += (n[i] * p[i] + n[i + 2] * p[i + 2]) / r; faces++; }
  }
  assert.ok(lowest > climbTop + 1.2, `bedrock starts above the highest climbable ground (${lowest.toFixed(2)} > ${climbTop.toFixed(2)})`);
  assert.ok(faces > 100 && outward / faces > 0.5, `bedrock faces out of the hill (${(outward / faces).toFixed(2)})`);
  assert.ok(desk.triangles <= 14000, `bedrock: ${desk.triangles} triangles within 14000`);
  assert.ok(phone.triangles < desk.triangles, `bedrock: the phones draw fewer (${phone.triangles} < ${desk.triangles})`);
  // a plain shows none
  const flat = buildBedrock(spec, { getHeightAt: () => 3 }, noise, mulberry32(91));
  assert.equal(flat.geometry, null, 'a plain has no flank to show rock');
  for (const b of [desk, again, phone]) b.geometry.dispose();
}

// ---------------------------------------------------------------------------------------------- 3. the composer

const field = {
  getHeightAt: (x, z) => 0.02 * x,
  getWaterMaskAt: (x, z) => (Math.hypot(x - 200, z) < 40 ? 1 : 0),
  _roadDist: (x, _z) => Math.abs(x - 100),
};
function compose(scenery, solids = [], mobile = false) {
  const obstacles = [...solids], colliders = [], baked = [new THREE.BufferGeometry()], destructibles = [];
  baked[0].setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  baked[0].setAttribute('normal', new THREE.BufferAttribute(new Float32Array(9), 3));
  baked[0].setAttribute('color', new THREE.BufferAttribute(new Float32Array(9), 3));
  const steps = composeScenery({
    mapId: 'test', scenery, heightField: field, spawns: [{ x: 0, z: -300 }], obstacles, colliders, baked,
    conform: (piece, bucket) => { for (const name of Object.keys(piece.attributes)) if (!bucket[0].attributes[name]) piece.deleteAttribute(name); },
    addDestructible: (kind, x, y, z, yaw, scale) => destructibles.push({ kind, x, y, z, yaw, scale }),
    seed: 2002, mobile,
  });
  let step = steps.next();
  while (!step.done) step = steps.next();
  return { ...step.value, obstacles, colliders, baked, destructibles };
}
{
  const wall = { min: [-55, 0, 45], max: [-45, 3, 55], kind: 'structure' };
  const built = compose({
    rocks: [
      { form: 'tor', geology: 'granite', x: -100, z: 0, radius: 6, height: 5, name: 'free' },
      { form: 'tor', geology: 'granite', x: 98, z: 0, radius: 6, height: 5, name: 'on the road' },
      { form: 'tor', geology: 'granite', x: 200, z: 0, radius: 6, height: 5, name: 'in the lake' },
      { form: 'tor', geology: 'granite', x: 0, z: -290, radius: 6, height: 5, name: 'on the pad' },
      { form: 'tor', geology: 'granite', x: -50, z: 50, radius: 6, height: 5, name: 'in a building' },
      { form: 'tor', geology: 'granite', x: 470, z: 0, radius: 15, height: 5, name: 'past the square' },
      { form: 'pavement', geology: 'limestone', x: -200, z: 100, radius: 12, height: 0, name: 'flat' },
    ],
    landmarks: [
      { kind: 'calvary', x: -150, z: -100, name: 'calvary' },
      { kind: 'bildstock', x: -150, z: 100, yawDeg: 30, name: 'shrine' },
      { kind: 'windpump', x: 101, z: 100, name: 'pump on the road' },
    ],
    powerLines: [{ towers: [[-300, 200], [-20, 220]], name: 'line' }],
  }, [wall]);
  const by = Object.fromEntries(built.receipt.features.map((f) => [f.name + (f.family === 'powerLine' ? `@${f.x}` : ''), f]));
  assert.equal(by.free.status, 'placed');
  assert.equal(by['on the road'].reason, 'road');
  assert.equal(by['in the lake'].reason, 'water');
  assert.equal(by['on the pad'].reason, 'spawn pad');
  assert.equal(by['in a building'].reason, 'solid structure');
  assert.equal(by['past the square'].reason, 'outside the square');
  assert.equal(by.flat.status, 'placed');
  assert.equal(by.calvary.status, 'placed');
  assert.equal(by.shrine.status, 'placed');
  assert.equal(by['pump on the road'].reason, 'road');
  assert.equal(by['line@-300'].status, 'placed'); assert.equal(by['line@-20'].status, 'placed');
  assert.deepEqual(built.destructibles.map((d) => d.kind), ['bildstock'], 'the shrine joins the destructible pools');
  assert.equal(built.rockPieces.length, 3, 'one geometry per placed rock formation (tor, pavement, calvary)');
  // the pavement's ground is a hole in the ground cover (no blade grows through a clint); the standing forms seal theirs
  assert.deepEqual(built.receipt.groundCoverHoles.map((h) => [h.x, h.z]), [[-200, 100]], 'the pavement, and only it, is a ground-cover hole');
  const sealed = () => false, holed = withGroundCoverHoles(sealed, built.receipt.groundCoverHoles);
  assert.equal(holed(-200, 0, 100, 0.5, 0.2), true, 'a blade on the pavement is refused');
  assert.equal(holed(-180, 0, 100, 0.5, 0.2), false, 'a blade beyond it grows');
  assert.equal(withGroundCoverHoles(sealed, []), sealed, 'a world without holes keeps its admission');
  // two masses (tor, calvary) + eight pylon legs; the pavement publishes none
  assert.equal(built.receipt.colliders, 2 + 8);
  assert.equal(built.obstacles.length, 1 + 10); assert.equal(built.colliders.length, 10);
  assert.ok(built.obstacles.slice(1).every((r) => !r.crushable && r.shape2), 'static shaped masses');
  assert.ok(built.baked.length > 3, 'the towers and their conductors fold into the baked bucket');
  assert.ok(built.baked.slice(1).every((g) => !g.attributes.uv && g.attributes.color), 'baked pieces conformed to the bucket');
  // deterministic and independent of any outer stream: the same config builds the same bytes
  const again = compose({ rocks: [{ form: 'tor', geology: 'granite', x: -100, z: 0, radius: 6, height: 5, name: 'free' }] });
  assert.deepEqual(Array.from(again.rockPieces[0].attributes.position.array), Array.from(built.rockPieces[0].attributes.position.array),
    'a feature draws its own stream: other features do not move it');
}
{
  // the tiers lay the same colliders: the phones get fewer stones and facets, never fewer formations or landmarks
  const scenery = {
    rocks: [{ form: 'tor', geology: 'granite', x: -100, z: 0, radius: 6, height: 5 }],
    rockFields: [{ geology: 'limestone', x: -250, z: 150, radius: 60, count: 6, slopeBias: 0 }],
    landmarks: [{ kind: 'bildstock', x: -150, z: 100 }, { kind: 'menhir', x: -170, z: 60 }],
  };
  const desk = compose(scenery), phone = compose(scenery, [], true);
  assert.equal(phone.receipt.colliders, desk.receipt.colliders, 'the same standing masses on both tiers');
  assert.deepEqual(phone.destructibles, desk.destructibles, 'the same landmarks on both tiers');
  assert.ok(phone.receipt.rockTriangles < desk.receipt.rockTriangles * 0.75, 'the phones draw fewer rock triangles');
}
{
  // the vegetation keep-out covers every feature from the config alone
  const clear = sceneryClearances({
    rocks: [{ form: 'tor', geology: 'granite', x: 10, z: 20, radius: 6, height: 5 }, { form: 'scree', geology: 'slate', x: 0, z: 0, radius: 9, height: 0 }],
    landmarks: [{ kind: 'calvary', x: 50, z: 0 }, { kind: 'windpump', x: -50, z: 0, scale: 1.2 }],
    powerLines: [{ towers: [[100, 100], [300, 100]] }],
  });
  assert.equal(clear.length, 2 + 2 + 2);
  const hill = sceneryClearances({ bedrock: [{ geology: 'sandstone', x: 5, z: 6, radius: 40 }] });
  assert.deepEqual(hill.map((c) => [c.x, c.z, c.halfWidth]), [[5, 6, 40 * BEDROCK_TREE_CLEAR]], 'a bedrock hill keeps the trees off its flanks');
  assert.equal(clear[0].halfWidth, rockReach({ form: 'tor', radius: 6 }) + 1.5);
  assert.equal(clear[1].halfWidth, 9, 'a scree fan claims its own ground only');
  assert.ok(Math.abs(clear[3].halfWidth - (2.4 * 1.2 + 1.2)) < 1e-9);
  assert.deepEqual(sceneryClearances(undefined), []);
}

// ---------------------------------------------------------------------------------------------- 4. the maps

const { installWorldBuildFixture } = await import('../../tools/headlessWorldCollision.mjs');
installWorldBuildFixture();
const [maps, terrain, vegetationModule, props, fleet, models] = await Promise.all([
  import('./maps/index.ts'), import('./terrain.ts'), import('./vegetation.ts'), import('./props.ts'),
  import('../vehicles/fleetFactory.ts'), import('./propsModelStore.ts'),
]);
await models.preloadPropModels();
let mapsWithScenery = 0;
for (const mapId of maps.MAP_IDS) {
  const config = maps.getMapConfig(mapId);
  if (!config.scenery) continue;
  mapsWithScenery++;
  const wreckIds = config.props?.tankWrecks?.ids ?? [];
  if (wreckIds.length) await fleet.ensureTankBuilders(wreckIds);
  const engine = { anisotropy: 4, setupShadowMaterial() {} };
  const heightField = terrain.createHeightField(1337, config);
  const flora = vegetationModule.createVegetation(heightField, engine, 2001, config);
  const dressing = props.createProps(heightField, engine, 2002, config, flora);
  const receipt = dressing.group.userData.scenery;
  assert.ok(receipt, `${mapId}: the scenery pass ran`);
  for (const feature of receipt.features) {
    assert.equal(feature.status, 'placed', `${mapId}: ${feature.name ?? feature.kind} stands (${feature.reason ?? ''})`);
  }
  const authored = (config.scenery.rocks?.length ?? 0) + (config.scenery.landmarks?.length ?? 0)
    + (config.scenery.rockFields?.length ?? 0) + (config.scenery.bedrock?.length ?? 0)
    + (config.scenery.powerLines ?? []).reduce((n, line) => n + line.towers.length, 0);
  for (const feature of receipt.features.filter((f) => f.family === 'rockField')) {
    assert.ok(feature.placedOf[0] >= Math.ceil(feature.placedOf[1] * 0.75), `${mapId}: ${feature.name} lays most of its count (${feature.placedOf.join('/')})`);
  }
  assert.equal(receipt.placed, authored, `${mapId}: every authored feature placed`);
  const rock = dressing.group.getObjectByName('props-scenery-rock');
  assert.equal(!!rock, receipt.rockTriangles > 0, `${mapId}: one rock mesh when rock stands`);
  if (rock) assert.ok(rock.castShadow && rock.receiveShadow, `${mapId}: the rock mesh casts and receives`);
  // no tree trunk stands inside a standing mass
  const masses = dressing.obstacles.filter((r) => r.shape2?.kind === 'convex' && !r.crushable && r.kind === undefined && r.max[1] - r.min[1] > 2.4);
  for (const tree of flora.treeObstacles) {
    const x = (tree.min[0] + tree.max[0]) / 2, z = (tree.min[2] + tree.max[2]) / 2;
    for (const mass of masses) {
      if (x < mass.min[0] || x > mass.max[0] || z < mass.min[2] || z > mass.max[2]) continue;
      for (const feature of receipt.features) {
        if (feature.family !== 'rock' || Math.hypot(feature.x - x, feature.z - z) > 30) continue;
        assert.ok(!collisionFootprintContainsPoint(mass, x, z), `${mapId}: no tree inside ${feature.name}`);
      }
    }
  }
  console.log(`scenery.selftest: ${mapId} — ${receipt.placed} features, ${receipt.rockTriangles} rock + ${receipt.bakedTriangles} baked triangles, ${receipt.colliders} colliders`);
}

// ---------------------------------------------------------------------------------------------- 5. the wiring

const propsSource = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
assert.match(propsSource, /\{ \.\.\.DESTRUCTIBLE_TYPES, \.\.\.SCENERY_DESTRUCTIBLE_TYPES \}/, 'the kit\'s kinds follow the inhabiting kit\'s');
const yard = propsSource.indexOf('  yield* placeYardDressing();'), pass = propsSource.indexOf('  yield* placeScenery();');
const merge = propsSource.indexOf('  yield* mergeMaterialBuckets();');
assert.ok(yard > 0 && pass > yard && merge > pass, 'the pass runs after every placement and before the bucket merge');
assert.match(propsSource, /new THREE\.Mesh\(merged, mats\.rock\)/, 'the rock forms draw on the props rock material (its cascade setup and hook)');
const vegetationSource = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
assert.match(vegetationSource, /placedStructureClearances\([^;]*\(cfg as SceneryMapConfig \| null\)\?\.scenery\)/s, 'the trees keep off the scenery');
const clearanceSource = readFileSync(new URL('./vegetationClearance.ts', import.meta.url), 'utf8');
assert.match(clearanceSource, /\.\.\.sceneryClearances\(scenery\)/, 'the placed-structure keep-out carries the scenery footprints');

console.log(`scenery.selftest: ${FORMS.length} rock forms x 2 tiers, ${Object.keys(SCENERY_DESTRUCTIBLE_TYPES).length} landmark kinds, the composer's admission, ${mapsWithScenery} maps placed`);
