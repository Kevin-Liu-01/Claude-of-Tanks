import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  DECOR_KITS,
  FLEET_EQUIPMENT_VARIANTS,
  decorManifestFor,
} from './decorations.ts';
import { ALL_TANK_IDS, getSpec } from './specs.ts';

assert.ok(FLEET_EQUIPMENT_VARIANTS.length >= 20,
  `fleet cargo vocabulary has ${FLEET_EQUIPMENT_VARIANTS.length} variants; expected at least 20`);
assert.equal(new Set(FLEET_EQUIPMENT_VARIANTS).size, FLEET_EQUIPMENT_VARIANTS.length,
  'fleet cargo variant ids are unique');

const signatures = new Set();
for (const variant of FLEET_EQUIPMENT_VARIANTS) {
  const parts = DECOR_KITS.cargo({ rng: () => 0.37, v: variant });
  assert.ok(parts.length >= 2, `${variant}: cargo is more than one anonymous primitive`);
  const bounds = new THREE.Box3();
  let vertices = 0;
  for (const part of parts) {
    assert.ok(part.geo.attributes.position?.count > 0, `${variant}: every part owns geometry`);
    part.geo.computeBoundingBox();
    assert.ok(part.geo.boundingBox, `${variant}: every part computes a bounding box`);
    bounds.union(part.geo.boundingBox);
    vertices += part.geo.attributes.position.count;
  }
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.x > 0.08 && size.y > 0.08 && size.z > 0.04,
    `${variant}: cargo has a visible three-dimensional silhouette`);
  signatures.add(`${parts.map((part) => part.mat).join(',')}:${vertices}:`
    + `${size.x.toFixed(3)}:${size.y.toFixed(3)}:${size.z.toFixed(3)}`);
  for (const part of parts) part.geo.dispose();
}
assert.ok(signatures.size >= 20,
  `${signatures.size} distinct geometry/material signatures cover the 20-variant floor`);

const cooler = DECOR_KITS.cargo({ rng: () => 0.37, v: 'beer-cooler-blue' });
const coolerColors = cooler
  .filter((part) => part.mat === 'cans' && part.geo.attributes.color)
  .map((part) => {
    const color = part.geo.attributes.color;
    const sum = [0, 0, 0];
    for (let i = 0; i < color.count; i++) {
      sum[0] += color.getX(i); sum[1] += color.getY(i); sum[2] += color.getZ(i);
    }
    return sum.map((value) => value / color.count);
  });
assert.ok(coolerColors.some(([r, g, b]) => b > r * 2.5 && b > g * 1.4),
  'beer cooler owns a clearly blue insulated body');
assert.ok(coolerColors.some(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) < 0.08),
  'beer cooler owns a separate white lid');
for (const part of cooler) part.geo.dispose();

const distributed = new Set();
for (const id of ALL_TANK_IDS) {
  const manifest = decorManifestFor(getSpec(id), () => 0.5);
  const cargo = manifest.find((row) => row.kit === 'cargo' && (row.p ?? 1) > 0);
  assert.ok(cargo, `${id}: deterministic manifest includes fleet cargo`);
  distributed.add(cargo.v?.v);
}
assert.ok(distributed.size >= 20,
  `${distributed.size} cargo variants are visibly distributed across the playable fleet`);

console.log(`decorationsEquipment.selftest: ${FLEET_EQUIPMENT_VARIANTS.length} authored variants, `
  + `${signatures.size} geometry signatures, ${distributed.size} playable-fleet variants passed`);
