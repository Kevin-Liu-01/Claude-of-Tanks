import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { registerProfiledBuilders } from './tankFactoryCore.ts';
import { buildLeopard2A7VX } from './profiles/leopardX.ts';

const owners = ['hull', 'turret'];
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const key = row => `${row.owner}/${row.name}`;

function capture(id, quality) {
  const tank = createTank(id, null, {
    quality, geometryReceipt: true, proceduralOnly: true, camoSeed: 4242, batchStatic: false,
  });
  try {
    const hash = createHash('sha256');
    tank.root.traverse(mesh => {
      if (!mesh.isMesh || mesh.userData.shadowOnly || /^procShadow/.test(mesh.name)
        || mesh.userData.vehicleMarking) return;
      hash.update(mesh.name);
      const array = mesh.geometry.attributes.position.array;
      hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
    });
    return { receipt: tank.root.userData.eraVisualBindingReceipt, geometry: hash.digest('hex') };
  } finally { tank.dispose(); }
}

function canonicalArmor(armor) {
  const result = { ...armor };
  for (const owner of owners) {
    const seen = new Set();
    result[`${owner}Plates`] = armor[`${owner}Plates`].filter(plate => {
      if (plate.kind !== 'era') return true;
      if (seen.has(plate.name)) return false;
      seen.add(plate.name);
      return true;
    });
  }
  return result;
}

function expandedArmor(armor, receipt, reverse = false) {
  const result = { ...armor };
  for (const owner of owners) {
    result[`${owner}Plates`] = armor[`${owner}Plates`].flatMap(plate => {
      if (plate.kind !== 'era') return [plate];
      const row = receipt.plates.find(item => item.owner === owner && item.name === plate.name);
      return row.fittedSurfaces.map(face => ({ ...plate,
        verts: reverse ? [face[0], ...face.slice(1).reverse()] : face }));
    });
  }
  return result;
}

// This reproduces applyEraPlateReceipts' same-name expansion in memory, not
// a generated-file edit. Every exact source face survives in its owner zone;
// each zone is computed/stored once even with hundreds of input plate rows.
for (const quality of ['high', 'low']) {
  const spec = getSpec('t90sm_x'), original = spec.armor;
  try {
    const canonical = canonicalArmor(original);
    spec.armor = canonical;
    const baseline = capture(spec.id, quality);
    assert.equal(baseline.receipt.plates.length, 4);
    const surfaces = baseline.receipt.plates.map(row => [key(row), row.fittedSurfaces]);
    const faceCount = surfaces.reduce((sum, [, faces]) => sum + faces.length, 0);
    assert.equal(faceCount, 231, 'every selected SM cassette facet remains in its canonical zone');
    for (const reverse of [false, true]) {
      spec.armor = expandedArmor(canonical, baseline.receipt, reverse);
      const expanded = capture(spec.id, quality);
      assert.equal(owners.reduce((n, owner) => n + spec.armor[`${owner}Plates`]
        .filter(plate => plate.kind === 'era').length, 0), faceCount);
      assert.equal(expanded.receipt.plates.length, 4, 'expanded headers do not multiply exact zone receipts');
      assert.deepEqual(expanded.receipt.plates.map(row => [key(row), row.fittedSurfaces]), surfaces,
        'all exact faces, winding, positions and order survive expanded/reversed input frames');
      assert.equal(expanded.geometry, baseline.geometry, 'receipt compression never changes visible geometry');
      assert.ok(JSON.stringify(expanded.receipt).length < 100000,
        '231 real faces must not expand to the former 23,245 entries / 5.7 MB');
      for (const row of expanded.receipt.plates) {
        const prior = baseline.receipt.plates.find(item => key(item) === key(row));
        assert.equal(row.partCount, prior.partCount);
        assert.equal(row.cassetteCount, prior.cassetteCount);
        assert.equal(row.ownerMatches, true);
      }
    }
  } finally { spec.armor = original; }
}

// Keep the legacy fitting contract explicitly live: the same real geometry
// with two opposing authored plate normals has two different PCA results.
// Removing annotations is a test-only legacy/mixed builder fixture, restored
// in finally; no playable profile or generated calibration is modified.
const legacyHashes = [
  '0fadb493c1331a25da16b52624b4c9dc9c0fa857ac82dfbb30b20ef22f1c0174',
  '92c6204196ab00db5e1322d4df9e55ca5490e179f3923f808abf70943250ce1f',
];
// Pin the legacy frame independently of the generated calibration, which is
// intentionally regenerated after this test. These are fitting-test inputs,
// not a substitute source-geometry oracle or runtime plate override.
const legacyFrame = [[-1.5, 1.4717770034843207, 2.1], [1.5, 1.4717770034843207, 2.1],
  [1.5, 1.3154006968641117, 2.8399999999999994], [-1.5, 1.3154006968641114, 2.84]];
for (const quality of ['high', 'low']) for (const mode of ['legacy', 'mixed']) {
  const spec = getSpec('leo2a7v_x'), original = spec.armor;
  registerProfiledBuilders({ leo2a7v_x: port => {
    buildLeopard2A7VX(port);
    let part = 0;
    port.forEachBucketPart('hullExternalArmor', geometry => {
      if (mode === 'legacy' || part === 0) delete geometry.userData.eraHitFaceVertexStarts;
      part++;
    });
  } });
  try {
    const plate = { ...original.hullPlates.find(item => item.kind === 'era'), verts: legacyFrame };
    spec.armor = { ...original, hullPlates: [
      ...original.hullPlates.filter(item => item.kind !== 'era'),
      plate, { ...plate, verts: [...plate.verts].reverse() },
    ] };
    const rows = capture(spec.id, quality).receipt.plates;
    assert.equal(rows.length, 2, `${mode}: do not deduplicate authored legacy fitting frames`);
    const hashes = rows.map(row => digest(row.fittedSurfaces));
    assert.notEqual(hashes[0], hashes[1], `${mode}: each input normal must retain its own fitting result`);
    if (mode === 'legacy') assert.deepEqual(hashes, legacyHashes, 'legacy PCA surfaces remain byte-for-byte unchanged');
  } finally {
    spec.armor = original;
    registerProfiledBuilders({ leo2a7v_x: buildLeopard2A7VX });
  }
}
console.log('eraBindingReceipt: high/low exact expanded-state equivalence, 231 retained faces, unchanged geometry, legacy and mixed fitting frames pass');
