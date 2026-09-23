import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { ensureInteriorFills, hasInteriorFills } from '../interiorFills.ts';

// Fixed source-stock calipers, authenticated against the current source-derived stock.
// These are actual shadow extrema after the existing 50 mm body inset, not
// source-triangle ratios. Removing an armor/hatch opt-in must fail coverage.
const cases = {
  kurganets25_x: [['hull', 'min', 'x', -2.0145], ['hull', 'max', 'x', 2.0145]],
  ztz100_x: [['hull', 'min', 'z', -3.838]],
  // Restored Object_27 LEFT flange: source X=-2.1026399136 at Y1.76282.
  // Right authored armor stays +2.10; the 50 mm inset is asymmetric here.
  // Independent source/native proof: docs/research/stale-qa-witness-repair-20260918.md.
  fv510_milan_x: [['hull', 'min', 'x', -2.05264], ['hull', 'max', 'x', 2.05]],
  griffin50_x: [['hull', 'max', 'x', 1.75]],
  ajax_x: [], // Its lower side armor extends a diagonal, not an AABB extreme.
  kf41_lynx_x: [['hull', 'max', 'x', 1.75], ['hull', 'max', 'y', 2.26], ['turret', 'max', 'y', .823]],
  cv90_mkiv_x: [['hull', 'min', 'x', -1.5819], ['hull', 'max', 'x', 1.5106]],
  cv90105_tml_x: [['hull', 'max', 'x', 1.5085], ['turret', 'max', 'y', .9165]],
  sabra_mk2_x: [['hull', 'max', 'x', 1.805968], ['turret', 'max', 'y', 1.378]],
  aft10_x: [], // No additional fixed armor stock; preserve its existing caster.
  bmp3m_dragun125_x: [['hull', 'max', 'x', 1.96]],
  k21_x: [['hull', 'max', 'x', 1.684]],
  type96b_x: [['hull', 'max', 'z', 3.51476]],
};
const legacy = {
  leclerc: {
    hull: '1c52c8bbb62ffe889e5b14d31656418347c10304085c80b440f643c9cef9b1cd',
    turret: 'a45d016aef8a25dd19d15059cd62c6a6ffb0b4870ee71467486ce68132a06055',
    high: '16c6cfec678c9b4160cc4a22d1b2b548994aa25aac4968a9c462bcd637ea7e5c',
    low: 'ec2fb34c215ecfa66c5377b0d7ea81a4d1933a00950c616847c27bfec5c7cd8c',
  },
  m1a2: {
    hull: 'dd19e03480575b31968fd4ef28fb2aef251e726fe0dc57d4360be833f3e9e383',
    // September 23 owner-directed M1A1 HC bearing/lower-edge change.
    // The caster still derives from that real stock with the same inset;
    // hull and gun checksums remain unchanged.
    turret: '9eaa7ba9c8949e22429f5943bb039b3614f1d16c4ce5b09d81033c732333fa09',
    high: '7ef7f133f3ce8fe5121731661f7a6c5715d00a61df67bab5f4e527c82327fa64',
    low: '1b63cbc62e017cdd5a77b5467572754a099f78b57b46dc24ce07e4f5a9bc2db1',
  },
};
const ids = [...Object.keys(cases), ...Object.keys(legacy)];
await ensureInteriorFills(ids);
const point = new THREE.Vector3();
function support(meshes, owner, direction) {
  const inverse = owner.matrixWorld.clone().invert();
  let result = -Infinity;
  for (const mesh of meshes.filter(Boolean)) {
    const matrix = inverse.clone().multiply(mesh.matrixWorld);
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(matrix);
      result = Math.max(result, point.dot(direction));
    }
  }
  return result;
}
const receipts = [];
for (const quality of ['high', 'low']) for (const id of ids) {
  if (Object.hasOwn(cases, id)) assert.ok(hasInteriorFills(id), `${id}: real generated fills loaded`);
  const tank = createTank(id, null, { proceduralOnly: true, quality, camoSeed: 4242, geometryReceipt: true, batchStatic: false });
  try {
    const root = tank.root;
    root.updateMatrixWorld(true);
    const casters = [];
    root.traverse(object => { if (object.isMesh && object.castShadow) casters.push(object); });
    assert.equal(casters.length, 3, `${id}/${quality}: only three real shadow draws`);
    let total = 0;
    for (const part of ['hull', 'turret', 'gun']) {
      const mesh = root.getObjectByName(`procShadow_${part}`);
      assert.ok(casters.includes(mesh), `${id}: ${part} is an installed caster`);
      assert.equal(mesh.parent.name, `rig_${part}`, `${id}: caster follows the actual articulation owner`);
      assert.equal(mesh.material.colorWrite, false, `${id}: caster cannot alter visible stock`);
      assert.equal(mesh.userData.authoredShadowProxy, true);
      const geometry = mesh.geometry;
      const triangles = (geometry.index?.count ?? geometry.attributes.position.count) / 3;
      assert.ok(triangles > 0 && triangles <= 120, `${id}/${part}: bounded real shadow triangles (${triangles})`);
      total += triangles;
      geometry.computeBoundingBox();
      for (const vertex of geometry.attributes.position.array) assert.ok(Number.isFinite(vertex), `${id}: finite caster stock`);
      if (legacy[id]) {
        const a = geometry.attributes.position.array;
        const hash = createHash('sha256').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex');
        assert.equal(hash, legacy[id][part === 'gun' ? quality : part], `${id}/${quality}/${part}: legacy caster remains byte-exact`);
      }
    }
    assert.ok(total <= 320, `${id}/${quality}: total shadow triangles ${total} <= 320`);
    for (const [part, end, axis, expected] of cases[id] ?? []) {
      const actual = root.getObjectByName(`procShadow_${part}`).geometry.boundingBox[end][axis];
      assert.ok(Math.abs(actual - expected) < .0005, `${id}/${quality}: ${part} ${end}.${axis} ${actual} covers measured stock with 50 mm inset (${expected})`);
    }
    if (id === 'fv510_milan_x') {
      const armor = root.getObjectByName('hullExternalArmor').geometry;
      armor.computeBoundingBox();
      assert.ok(Math.abs(armor.boundingBox.min.x + 2.10264) < .000002, 'Warrior: restored source left flange remains real armor stock');
      assert.ok(Math.abs(armor.boundingBox.max.x - 2.10) < .000002, 'Warrior: unchanged right armor is not mirrored to the left extent');
      const caster = root.getObjectByName('procShadow_hull').geometry;
      assert.equal(caster.userData.shadowInsetM, .05, 'Warrior: existing 50 mm inset remains unchanged');
      assert.ok(Math.abs(caster.boundingBox.min.x - armor.boundingBox.min.x - .05) < .000002, 'Warrior: left caster derives from real stock with exactly 50 mm inset');
      assert.ok(Math.abs(armor.boundingBox.max.x - caster.boundingBox.max.x - .05) < .000002, 'Warrior: right caster retains the same physical inset');
    }
    if (id === 'ajax_x' || id === 'griffin50_x') {
      const owner = root.getObjectByName('rig_hull');
      const direction = new THREE.Vector3(.6143820296592883, -.7708333333333333, .16837664283966375);
      // The owner stretched Griffin's hull Z by 1.10. Apply the inverse
      // transpose to this fixed caliper direction (without renormalizing),
      // preserving the original source-stock support values and tolerances.
      if (id === 'griffin50_x') direction.z /= 1.10;
      const baseline = ['hull', 'hullTrackGuardL', 'hullTrackGuardR', 'hullRubber', 'hullFixedPaintedBodywork'].map(name => owner.getObjectByName(name));
      const original = support(baseline, owner, direction);
      const armor = support([owner.getObjectByName('hullExternalArmor')], owner, direction);
      const actual = support([root.getObjectByName('procShadow_hull')], owner, direction);
      // Ajax retains its original 422 mm witness. Griffin's source-derived
      // belly correction changes the baseline (unchanged armor buffer), so its
      // authenticated extension is now 194.167 mm, not the old 365.635 mm.
      // See docs/research/stale-qa-witness-repair-20260918.md. The inset
      // must retain that real lower-side silhouette without extending past it.
      const measuredExtension = id === 'ajax_x' ? .421735 : .194166655;
      assert.ok(Math.abs(armor - original - measuredExtension) < .001, `${id}: original source-stock witness stays fixed`);
      assert.ok(actual > original + measuredExtension - .10, `${id}: lower side armor participates in the shadow`);
      assert.ok(actual < armor, `${id}: caster remains inside the measured side armor`);
    }
    receipts.push({ id, quality, shadowTriangles: total, shadowDraws: casters.length });
  } finally { tank.dispose(); }
}
console.log(JSON.stringify(receipts));
console.log('suppliedShadowCoverage: filled HIGH/LOW measured armor/hatch/cupola coverage, inward seating, three-draw budgets and byte-exact legacy casters pass');
