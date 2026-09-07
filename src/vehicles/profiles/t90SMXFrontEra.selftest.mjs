import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { addT90SMFrontEra } from './t90SMXFrontEra.ts';

function near(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} vs source ${expected} ±${tolerance}`);
}
function ray(root, origin, direction, far = 12) {
  return new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, far)
    .intersectObject(root, true).find(hit => {
      for (let p = hit.object; p; p = p.parent) if (!p.visible) return false;
      return !hit.object.userData.geometryAuditIgnore && !/^procShadow/.test(hit.object.name);
    });
}
function normal(hit, expected, label) {
  const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  near(n.dot(new THREE.Vector3(...expected)), 1, .00008, `${label} source-facing normal`);
}

// Every new piece remains real hull-owned applique, never an empty non-armor
// census entry or structural hull replacement. Each transverse end is capped.
let pieces = 0;
const equipment = [];
const armor = [];
addT90SMFrontEra({ destructibleCluster(name,fill) {
  assert.ok(['glacis_era_L','glacis_era_R'].includes(name)); fill();
}, addExternalArmor(owner, geometry) {
  assert.equal(owner, 'hull'); pieces++;
  assert.equal(geometry.attributes.position.count, 36, 'closed six-face prism');
  const p = geometry.attributes.position;
  let volume = 0;
  for (let i = 0; i < p.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, i);
    const b = new THREE.Vector3().fromBufferAttribute(p, i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
    volume += a.dot(b.cross(c)) / 6;
  }
  assert.ok(volume > .00005, 'positive outward-wound physical volume');
  armor.push(geometry);
}, addEquipment(slot, geometry) {
  assert.equal(slot, 'hullDetail', 'all fittings use camouflaged hull equipment, never armor');
  assert.ok(geometry.attributes.uv && geometry.attributes.normal, 'merged equipment has complete attributes');
  const p = geometry.attributes.position;
  const edges = new Map();
  let volume = 0;
  for (let i = 0; i < p.count; i += 3) {
    const v = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(p, i + j));
    volume += v[0].dot(v[1].clone().cross(v[2])) / 6;
    for (let j = 0; j < 3; j++) {
      const a = v[j].toArray().map(x => x.toFixed(6)).join(','), b = v[(j + 1) % 3].toArray().map(x => x.toFixed(6)).join(',');
      const key = [a, b].sort().join('|');
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  assert.ok(volume > .0000001, 'fixture has positive closed outward-wound volume');
  assert.ok([...edges.values()].every(n => n === 2), 'no uncapped or non-manifold fixture edges');
  equipment.push(geometry);
} });
assert.equal(pieces, 13, 'nine retained armor solids plus four separately raised source panels');
assert.equal(equipment.length, 30, '16 ribs, four two-stage latches, two tabs with leaf and folded leg each');

function inside(geometry, point) {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.updateMatrixWorld(true);
  const hits = new THREE.Raycaster(new THREE.Vector3(...point), new THREE.Vector3(1, .132, .213).normalize(), .000001, 20)
    .intersectObject(mesh).filter((hit, i, hits) => i === 0 || hit.distance - hits[i - 1].distance > .000001);
  material.dispose();
  return hits.length % 2 === 1;
}
// Actual material intersections along the source's lateral load path. Merely
// placing a tab close to a support or growing a pedestal would not satisfy it.
for (const [tab, leaf, leg, mapX] of [[24, 26, 27, x => x], [25, 28, 29, x => -x + .020073295]]) {
  for (const index of [tab, leaf]) assert.ok(inside(equipment[index], [mapX(.895), 1.335, 2.60]), 'tab bears into lateral leaf');
  for (const index of [leaf, leg]) assert.ok(inside(equipment[index], [mapX(.94), 1.328, 2.62]), 'leaf bears into folded leg');
  assert.ok(inside(equipment[leg], [mapX(.94), 1.224, 2.59]), 'folded leg reaches the hull contact point');
}

for (const quality of ['high', 'low']) {
  const tank = createTank('t90sm_x', null, { quality, proceduralOnly: true, geometryReceipt: true });
  try {
    tank.root.updateMatrixWorld(true);
    const hull = tank.root.getObjectByName('rig_hull');
    const applique = hull.getObjectByName('hullExternalArmor');
    const detail = hull.getObjectByName('hullDetail');
    assert.ok(applique?.isMesh, 'actual rendered applique is under the hull rig');
    for (const [x, y, z, n] of [
      [-.33, .852, 3.433651108, [0, -.37197256, .92824373]],
      [.27, .875, 3.442867835, [0, -.37197256, .92824373]],
      [-.33, .916, 3.436621099, [0, -.38707680, .92204748]],
      [.27, .918, 3.437302011, [0, -.39955512, .91670917]],
      [-.33, .971, 3.362502944, [0, .93561585, .35301980]],
      [.27, 1.025, 3.216827024, [0, .93111555, .36472434]],
      [-.48, 1.095, 3.033863120, [0, .93561585, .35301980]],
      [.42, 1.095, 3.038121954, [0, .93111555, .36472434]],
    ]) {
      const hit = ray(hull, [x, y, 8], [0, 0, -1]);
      near(hit?.point.z, z, .0002, `${quality} held-out front cover/lip`);
      assert.equal(hit.object, applique, 'source armor face must not be imitated by equipment');
      normal(hit, n, quality);
    }
    for (const [x, z, y, n] of [
      [-.33, 2.36, 1.342229081, [0, .93608942, .35176212]],
      [.27, 2.63, 1.243270585, [0, .93606705, .35182166]],
      [-.48, 2.78, 1.184402182, [0, .93608942, .35176212]],
      [-.8, 2.42, 1.368582814, [0, .87832507, .47806388]],
      [.8, 2.62, 1.258216912, [0, .87832533, .47806340]],
      [.8, 2.22, 1.415104191, [0, .87832450, .47806493]],
    ]) {
      const hit = ray(applique, [x, 2, z], [0, -1, 0]);
      near(hit?.point.y, y, .0002, `${quality} held-out separate rear field`);
      normal(hit, n, quality);
    }
    for (const [x, floor, panelX, panelY, a, b] of [
      [-.275, 1.2827234506, -.30, 1.2896201148, -.28847849, -.26154882],
      [.311, 1.2852537226, .29, 1.2921312043, .29710391, .32403436],
    ]) {
      const hit = ray(hull, [x, 1.6, 2.5], [0, -1, 0]);
      near(hit?.point.y, floor, .0002, `${quality} true central seam floor`);
      assert.equal(hit.object, applique, 'seam exposes the actual lower armor base');
      assert.equal(ray(hull, [x, floor + .020, 2.5], [0, -1, 0], .018), undefined,
        'seam has measurable empty depth, not painted dark overlay');
      near(ray(hull, [panelX, 1.6, 2.5], [0, -1, 0])?.point.y, panelY, .0002, 'adjacent panel retains original plane');
      for (const [edgeX, y] of [[a - .001, panelY], [a + .001, floor], [b - .001, floor], [b + .001, panelY]]) {
        near(ray(hull, [edgeX, 1.6, 2.5], [0, -1, 0])?.point.y, y, .0002, 'independent measured seam width');
      }
    }
    for (const [x0, x1, z, ny, nz, d] of [
      [-.42, -.12, 2.310, .9378828521, .3469520943, 2.0823357073],
      [-.42, -.12, 2.425, .9378142171, .3471375725, 2.0820583882],
      [-.42, -.12, 2.540, .9378507091, .3470389712, 2.0812381153],
      [-.42, -.12, 2.657, .9365299797, .3505875029, 2.0883987918],
      [.16, .46, 2.314, .9371517501, .3489220503, 2.0882290746],
      [.16, .46, 2.429, .9377655023, .3472691502, 2.0846416491],
      [.16, .46, 2.544, .9378431907, .3470592883, 2.0836050321],
      [.16, .46, 2.660, .9397403659, .3418889362, 2.0715821655],
    ]) for (const x of [x0, x1]) {
      const hit = ray(hull, [x, 1.6, z], [0, -1, 0]);
      near(hit?.point.y, (d - nz * z) / ny, .00002, `${quality} independent rib crown`);
      assert.equal(hit.object, applique, 'rib follows its damageable hull cover, not permanent hull');
      normal(hit, [0, ny, nz], 'rib');
      const bearing=new THREE.Group();
      for(const g of armor)bearing.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial()));
      bearing.updateMatrixWorld(true);
      const support = ray(bearing, [x, 1.6, z], [0, -1, 0]);
      const i = x < 0 ? (Math.round((z - 2.310) / .116) * 2 + (x > -.2 ? 1 : 0))
        : 8 + Math.round((z - 2.314) / .116) * 2 + (x > .3 ? 1 : 0);
      assert.ok(inside(equipment[i], [x, support.point.y - .0002, z]), 'source rib penetrates its panel bearing');
      for(const mesh of bearing.children)mesh.material.dispose();
    }
    for (const [x, z, y] of [
      [-.637, 2.200, 1.4364436407], [.674, 2.202, 1.4351760249],
      [-.809, 2.228, 1.4315872200], [-.637, 2.228, 1.4315872200],
      [.674, 2.229, 1.4308640545], [.846, 2.229, 1.4308640545],
      [-.868, 2.640, 1.3788469537], [.887, 2.640, 1.3788469537],
      [-.900, 2.620, 1.3302136567], [.920, 2.620, 1.3302136567],
    ]) {
      const hit = ray(hull, [x, 1.65, z], [0, -1, 0]);
      near(hit?.point.y, y, .00003, `${quality} source latch/tab/carrier crown`);
      assert.equal(hit.object,z<2.3?applique:detail,
        'attached latch follows its cassette; independent tab and carrier remain permanent equipment');
    }
    for (const [x, index] of [[-.809, 16], [-.637, 18], [.674, 20], [.846, 22]]) {
      const z = x < 0 ? 2.228 : 2.229;
      const bearing=new THREE.Group();
      for(const g of armor)bearing.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial()));
      bearing.updateMatrixWorld(true);
      const support = ray(bearing, [x, 1.6, z], [0, -1, 0]);
      assert.ok(inside(equipment[index], [x, support.point.y - .0001, z]), 'latch base bears into its source armor face');
      const base = new THREE.Mesh(equipment[index], new THREE.MeshBasicMaterial());
      base.updateMatrixWorld(true);
      const y = ray(base, [x, 1.6, z], [0, -1, 0]).point.y;
      assert.ok(inside(equipment[index + 1], [x, y - .0001, z]), 'raised latch cap is attached to its base');
      base.material.dispose();
      for(const mesh of bearing.children)mesh.material.dispose();
    }
    for (const [x, z] of [[.94, 2.6219535099], [.955, 2.6200039544], [-.92, 2.6217698464], [-.935, 2.6201086882]]) {
      near(ray(hull, [x, 1.26, 2.69], [0, 0, -1], .16)?.point.z, z, .0006,
        `${quality} independent folded support front`);
    }
    for (const x of [.887, -.868]) assert.equal(ray(hull, [x, 1.28, 2.68], [0, 0, -1], .09), undefined,
      'source air remains underneath upright tab; no invented pedestal');
    for (const x of [.94, -.919926705]) {
      const contact = ray(hull.getObjectByName('hull'), [x, 1.5, 2.59], [0, -1, 0]);
      assert.ok(contact?.point.y >= 1.224, 'folded support is seated into original structural hull');
    }
    // Independent all-source ray at this exact left transition has no bronya
    // hit. The underlying hull is visible behind the narrow rib-to-cover air.
    assert.equal(ray(applique, [-.33, .900, 3.46], [0, 0, -1], .055), undefined,
      'genuine left bow transition air is not filled by a blanket crossbar');
    const core = ray(hull.getObjectByName('hull'), [-.33, .900, 8], [0, 0, -1]);
    assert.ok(core && core.point.z < 3.42 && core.point.z > 3.35,
      'original solid hull remains behind the source applique air');
    assert.equal(ray(applique, [0, .82, 3.46], [0, 0, -1], .03), undefined,
      'lip does not grow downward to fill the source space below it');
  } finally { tank.dispose(); }
}
for (const g of [...armor, ...equipment]) g.dispose();
console.log('t90SMXFrontEra: independent source planes, closed hull-owned covers, physical lip and adjacent air pass high/low');
