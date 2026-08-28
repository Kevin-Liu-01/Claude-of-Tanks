import assert from 'node:assert/strict';

const { createTank } = await import('./tankFactory.js');
const { ALL_TANK_IDS } = await import('./specs.js');
const { NATIVE_FAMILY_ORDER, NATIVE_VARIANT_FAMILIES } = await import('./fleetOrder.ts');

for (const [name, family] of Object.entries(NATIVE_FAMILY_ORDER)) {
  const present = family.filter((id) => ALL_TANK_IDS.includes(id));
  const indexes = present.map((id) => ALL_TANK_IDS.indexOf(id));
  assert.deepEqual(indexes, indexes.slice().sort((a, b) => a - b), `${name} progression is out of order`);
  for (let i = 1; i < indexes.length; i++) {
    assert.equal(indexes[i], indexes[i - 1] + 1, `${name} is not contiguous`);
  }
}

assert.equal(new Set(ALL_TANK_IDS).size, ALL_TANK_IDS.length, 'roster contains duplicate ids');

const sovietOrder = NATIVE_FAMILY_ORDER.soviet_modern_mbt;
for (const [name, family] of Object.entries(NATIVE_VARIANT_FAMILIES)) {
  const indexes = family.map((id) => sovietOrder.indexOf(id));
  assert.ok(indexes.every((i) => i >= 0), `${name} contains a vehicle absent from the Soviet lineage`);
  assert.deepEqual(indexes, indexes.slice().sort((a, b) => a - b), `${name} variant order is wrong`);
  for (let i = 1; i < indexes.length; i++) {
    assert.equal(indexes[i], indexes[i - 1] + 1, `${name} variants are not contiguous`);
  }
}

const engineCtx = { setupShadowMaterial: (material) => material, anisotropy: 1 };
for (const [name, family] of Object.entries(NATIVE_VARIANT_FAMILIES)) {
  for (const id of family) {
    const tank = createTank(id, engineCtx, {
      quality: 'low',
      proceduralOnly: true,
      geometryReceipt: true,
    });
    const hull = tank.root.getObjectByName('rig_hull');
    assert.equal(hull?.userData.nativeRoadWheelStations, 6, `${id} must use the native six-wheel ${name} datum`);
    tank.dispose?.();
  }
}

console.log(`fleetOrder.selftest: ${Object.keys(NATIVE_FAMILY_ORDER).length} lineages ordered; T-72/T-80/T-90 variants contiguous with native six-wheel receipts`);
