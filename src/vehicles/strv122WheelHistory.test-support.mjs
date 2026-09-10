// Test-only inverse of the qualified 72 -> 48 radial-side reduction. Every
// original whole-model golden remains fixed; no wheel or track is omitted.
import assert from 'node:assert/strict';
import { KIT } from './tankFactoryCore.ts';
import { strv122SuppliedWheelSolids } from './profiles/strv122XSuppliedGear.ts';

function equalGeometry(actual, expected) {
  assert.deepEqual(Object.keys(actual.attributes), Object.keys(expected.attributes));
  for (const key of Object.keys(expected.attributes)) {
    const a = actual.attributes[key], b = expected.attributes[key];
    assert.deepEqual([a.itemSize, a.normalized], [b.itemSize, b.normalized]);
    assert.deepEqual(a.array, b.array, 'only the exact current 48-sided Strv wheel may be inverted');
  }
  assert.deepEqual(actual.index?.array, expected.index?.array);
}

export function historicalStrv122WheelConfig(config) {
  const current = strv122SuppliedWheelSolids(48), prior = strv122SuppliedWheelSolids(72);
  let transferred = false;
  try {
    assert.equal(config.wheelCoreGeometry.dark, undefined);
    equalGeometry(config.wheelCoreGeometry.disc, current.core);
    assert.equal(config.wheelFaceLayers.length, 2);
    const faces = [current.left, current.right], replacements = [prior.left, prior.right];
    config.wheelFaceLayers.forEach((layer, index) => {
      assert.equal(layer.side, index === 0 ? -1 : 1);
      equalGeometry(layer.geometry, faces[index]);
    });
    config.wheelFaceLayers.forEach(layer => layer.geometry.dispose());
    transferred = true;
    return { ...config, wheelFaceLayers: config.wheelFaceLayers.map((layer, index) =>
      ({ ...layer, geometry: replacements[index] })) };
  } finally {
    Object.values(current).forEach(geometry => geometry.dispose());
    prior.core.dispose();
    if (!transferred) { prior.left.dispose(); prior.right.dispose(); }
  }
}

export function withHistoricalStrv122Wheels(build) {
  const original = KIT.buildRunningGear;
  let calls = 0;
  KIT.buildRunningGear = (P, config) => {
    assert.equal(P.spec.id, 'strv122_x', 'the inverse is restricted to Strv 122 X');
    calls++;
    return original(P, historicalStrv122WheelConfig(config));
  };
  try {
    const tank = build();
    try { assert.equal(calls, 1); return tank; }
    catch (error) { tank.dispose(); throw error; }
  } finally { KIT.buildRunningGear = original; }
}
