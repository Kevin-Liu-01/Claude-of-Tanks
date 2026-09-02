import assert from 'node:assert/strict';
import {
  CIVILIAN_VEHICLE_RECEIPTS,
  pickCivilianVehicleKind,
} from './maps/civilianVehicleKit.ts';
import { DESTRUCTIBLE_TYPES } from './maps/inhabitKit.ts';

function seeded(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const kinds = Object.keys(CIVILIAN_VEHICLE_RECEIPTS);
assert.deepEqual(kinds.sort(), [
  'jeep', 'pickup', 'sedan', 'truck', 'truckbox', 'truckflatbed', 'van', 'wagon',
], 'vehicle kit exposes eight distinct civilian/utility silhouettes');

for (const [kind, receipt] of Object.entries(CIVILIAN_VEHICLE_RECEIPTS)) {
  const metadata = DESTRUCTIBLE_TYPES[kind];
  assert.ok(metadata, `${kind} is registered as a world destructible`);
  assert.equal(metadata.mat, 'vehicle', `${kind} uses the shared textured vehicle PBR material`);
  assert.equal(metadata.build, receipt.build, `${kind} registry keeps the audited intact builder`);
  assert.equal(metadata.broken, receipt.broken, `${kind} registry keeps the audited wreck builder`);

  const geometry = receipt.build(seeded(0x91a7));
  const wreck = receipt.broken(seeded(0x5c31));
  for (const [state, candidate] of [['intact', geometry], ['broken', wreck]]) {
    for (const attribute of ['position', 'normal', 'uv', 'color']) {
      assert.ok(candidate.getAttribute(attribute), `${kind} ${state} geometry carries ${attribute}`);
    }
    const positions = candidate.getAttribute('position');
    for (let index = 0; index < positions.count; index++) {
      assert.ok(Number.isFinite(positions.getX(index))
        && Number.isFinite(positions.getY(index))
        && Number.isFinite(positions.getZ(index)), `${kind} ${state} geometry contains finite positions`);
    }
  }

  const triangles = geometry.getAttribute('position').count / 3;
  assert.ok(triangles <= receipt.triangleBudget,
    `${kind} stays within its ${receipt.triangleBudget}-triangle instanced-geometry budget (got ${triangles})`);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  assert.ok(bounds.min.y > -0.001 && bounds.min.y < 0.001,
    `${kind} tires are authored exactly onto the local ground plane`);
  assert.ok(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) <= receipt.halfWidth + 0.001,
    `${kind} authored width stays inside its placement receipt`);
  assert.ok(Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)) <= receipt.halfLength + 0.001,
    `${kind} authored length stays inside its placement receipt`);
  assert.ok(bounds.max.y <= receipt.height + 0.001,
    `${kind} authored height stays inside its placement receipt`);
  const colors = geometry.getAttribute('color');
  const colorZones = new Set();
  for (let index = 0; index < colors.count; index += Math.max(1, Math.floor(colors.count / 96))) {
    colorZones.add(`${colors.getX(index).toFixed(2)}:${colors.getY(index).toFixed(2)}:${colors.getZ(index).toFixed(2)}`);
  }
  assert.ok(colorZones.size >= 6,
    `${kind} carries distinct paint, glass, rubber, lamp, and metal zones`);
  geometry.dispose();
  wreck.dispose();
}

for (const [mapId, expectedLight, expectedHeavy] of [
  ['urban', ['sedan', 'van', 'pickup'], ['truckbox', 'truckflatbed', 'truck']],
  ['verdant', ['wagon', 'pickup', 'jeep'], ['truckflatbed', 'truck', 'truckbox']],
  ['desert', ['pickup', 'jeep', 'van'], ['truck', 'truckflatbed', 'truckbox']],
]) {
  const rolls = [0.01, 0.35, 0.70];
  assert.deepEqual(rolls.map((roll) => pickCivilianVehicleKind(mapId, 'light', roll)), expectedLight,
    `${mapId} gets its deterministic three-family light-traffic vocabulary`);
  assert.deepEqual(rolls.map((roll) => pickCivilianVehicleKind(mapId, 'heavy', roll)), expectedHeavy,
    `${mapId} gets its deterministic three-family heavy-traffic vocabulary`);
}

assert.equal(pickCivilianVehicleKind('urban', 'light', -4), 'sedan',
  'variant selection clamps malformed low rolls');
assert.equal(pickCivilianVehicleKind('urban', 'light', 8), 'pickup',
  'variant selection clamps malformed high rolls');

console.log('civilianVehicles.selftest: textured geometry, variants, footprints, and budgets passed');
