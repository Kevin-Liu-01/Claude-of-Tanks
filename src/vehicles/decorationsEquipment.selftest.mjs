import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  DECOR_KITS,
  FLEET_EQUIPMENT_VARIANTS,
  decorManifestFor,
  fleetEquipmentNationStyle,
  resolveDecorMode,
} from './decorations.ts';
import { ALL_TANK_IDS, getSpec } from './specs.ts';

assert.ok(FLEET_EQUIPMENT_VARIANTS.length >= 20,
  `fleet cargo vocabulary has ${FLEET_EQUIPMENT_VARIANTS.length} variants; expected at least 20`);
assert.equal(new Set(FLEET_EQUIPMENT_VARIANTS).size, FLEET_EQUIPMENT_VARIANTS.length,
  'fleet cargo variant ids are unique');
assert.equal(resolveDecorMode({ proceduralOnly: true }), false,
  'unadorned procedural metrology builds remain bare by default');
assert.equal(resolveDecorMode({ proceduralOnly: true, decor: true }), true,
  'the first-party gallery can explicitly show procedural field equipment');

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
  'beer cooler owns a separate neutral lid');
assert.ok(coolerColors.every(([r, g, b]) => Math.max(r, g, b) < 0.78),
  'beer cooler avoids bright high-contrast authored colors');
assert.ok(cooler.length >= 18,
  `beer cooler has molded panels, ribs, latches, hinges, and weather bands (${cooler.length} parts)`);
for (const part of cooler) part.geo.dispose();

for (const variant of ['nato-fuel-can', 'blue-water-can', 'twin-can-cradle']) {
  const pair = DECOR_KITS.cargo({ rng: () => 0.37, v: variant });
  const bodies = pair.filter((part) => part.mat === 'cans');
  assert.ok(bodies.length >= 12, `${variant}: portable vessel variant contains a modeled pair`);
  const bounds = new THREE.Box3();
  for (const part of pair) {
    part.geo.computeBoundingBox();
    bounds.union(part.geo.boundingBox);
    part.geo.dispose();
  }
  assert.ok(bounds.max.x - bounds.min.x >= 0.38,
    `${variant}: paired vessels occupy a visibly two-can cradle`);
}

const extinguisher = DECOR_KITS.cargo({
  rng: () => 0.37,
  v: 'fire-extinguisher',
  nation: 'USA',
});
const extinguisherBounds = new THREE.Box3();
for (const part of extinguisher) {
  part.geo.computeBoundingBox();
  extinguisherBounds.union(part.geo.boundingBox);
  part.geo.dispose();
}
const extinguisherSize = extinguisherBounds.getSize(new THREE.Vector3());
assert.ok(extinguisherSize.x > extinguisherSize.y * 1.7,
  'fleet fire extinguishers rest horizontally instead of standing upright');
assert.ok(extinguisherBounds.min.y >= -0.005,
  'horizontal extinguisher and its cradle remain planted at the seat plane');

const nationStyles = new Set([
  'USA', 'UK', 'Germany', 'France', 'Italy', 'Sweden', 'Poland',
  'Russia', 'Ukraine', 'China', 'Israel',
].map((nation) => fleetEquipmentNationStyle(nation)));
assert.equal(nationStyles.size, 11,
  'major fleet nations resolve to distinct field-equipment palette families');
const averageCargoColor = (nation) => {
  const parts = DECOR_KITS.cargo({
    rng: () => 0.37,
    v: 'fifty-cal-ammo-can',
    nation,
  });
  const sums = [0, 0, 0];
  let count = 0;
  for (const part of parts) {
    if (part.mat === 'cans' && part.geo.attributes.color) {
      const color = part.geo.attributes.color;
      for (let i = 0; i < color.count; i++) {
        sums[0] += color.getX(i); sums[1] += color.getY(i); sums[2] += color.getZ(i);
        count++;
      }
    }
    part.geo.dispose();
  }
  return sums.map((value) => value / Math.max(1, count));
};
const americanCargo = averageCargoColor('USA');
const sovietCargo = averageCargoColor('Russia');
assert.ok(americanCargo.some((value, index) => Math.abs(value - sovietCargo[index]) > 0.004),
  'the same shared cargo primitive receives a visibly distinct national finish');

const basket = DECOR_KITS.basket({ rng: () => 0.37, w: 1.35, d: 0.44, h: 0.34 });
assert.ok(basket.length >= 30,
  `shared decorative basket exposes a real lattice and shaped cargo (${basket.length} parts)`);
assert.ok(!basket.some((part) => part.geo instanceof THREE.PlaneGeometry),
  'decorative basket no longer uses opaque/texture-plane proxy walls');
assert.ok(basket.filter((part) => part.mat === 'canvas').length >= 7,
  'decorative basket includes shaped packs, flaps, pockets, straps, and a tarp roll');
assert.equal(basket.meta?.basket, true, 'decorative basket retains placement metadata');
for (const part of basket) part.geo.dispose();

const distributed = new Set();
for (const id of ALL_TANK_IDS) {
  const manifest = decorManifestFor(getSpec(id), () => 0.5);
  const cargo = manifest.filter((row) => row.kit === 'cargo' && (row.p ?? 1) > 0);
  assert.equal(cargo.length, 7, `${id}: deterministic manifest includes a seven-piece field load`);
  assert.equal(new Set(cargo.map((row) => row.v?.v)).size, 7,
    `${id}: equipment set does not repeat the same prop`);
  assert.ok(cargo.every((row) => row.slot[0] === 'fleetCargo' && row.slot[1].routes.length >= 4),
    `${id}: every equipment piece owns a four-station placement fallback`);
  assert.ok(cargo.every((row) => row.v?.nation === getSpec(id).nation),
    `${id}: field equipment inherits the vehicle nation palette`);
  const preferred = cargo.map((row) => row.slot[1].routes[0]);
  assert.deepEqual([...new Set(preferred.map((route) => route[0]))].sort(),
    ['hullRearRack', 'turretRear'],
    `${id}: preferred equipment stays on the bustle and hull rear rack`);
  const routeStations = new Set(cargo.flatMap((row) => row.slot[1].routes.map((route) => route[0])));
  assert.deepEqual([...routeStations].sort(),
    ['fender', 'hullRearRack', 'rearDeck', 'turretRear', 'turretRoof', 'turretSide'].sort(),
    `${id}: fallback network covers aft equipment stations only`);
  assert.ok(cargo.every((row) => row.slot[1].routes.every(([station, args]) =>
    station !== 'turretRoof' || args.rear === true)),
  `${id}: every turret-roof fallback is on the rear roof`);
  assert.ok(cargo.every((row) => row.slot[1].routes.every(([station, args]) =>
    station !== 'rearDeck' || args.back === true)),
  `${id}: every hull-deck fallback is on the rear engine deck`);
  assert.ok(cargo.every((row) => row.slot[1].routes.every(([station, args]) =>
    station !== 'turretSide' || args.rear === true)),
  `${id}: every turret-side fallback stays on the rear quarter`);
  assert.ok(cargo.every((row) => row.slot[1].routes.every(([station, args]) =>
    station !== 'fender' || args.zFrac < 0)),
  `${id}: every fender fallback stays aft of the turret`);
  for (const row of cargo) distributed.add(row.v?.v);
}
assert.equal(distributed.size, FLEET_EQUIPMENT_VARIANTS.length,
  `${distributed.size} cargo variants are visibly distributed across the playable fleet`);

const m48 = {
  id: 'm48', nation: 'USA', era: 'cold-war',
  dims: { widthM: 3.63, heightM: 3.09, hullLengthM: 6.95, overallLengthM: 9.30 },
  armor: { turretless: false },
};
const m48Cargo = decorManifestFor(m48, () => 0.5)
  .filter((row) => row.kit === 'cargo');
const hardCaseIds = new Set([
  'beer-cooler-blue', 'cooler-red', 'insulated-chest-olive',
  'fifty-cal-ammo-can', 'wood-ammo-crate', 'ration-case', 'medical-case',
  'mechanics-tool-chest', 'spare-optics-case', 'thermos-crate',
]);
const m48HardCases = m48Cargo.filter((row) => hardCaseIds.has(row.v?.v));
assert.equal(m48HardCases.length, 2, 'M48 keeps two useful hard cases');
assert.ok(m48HardCases.every((row) => row.slot[1].routes.every(([station]) =>
  station !== 'turretRoof' && station !== 'turretRear')),
'M48 hard cases stay off the commander cupola and turret crown');

const uaM1A1 = {
  id: 'ua_m1a1', nation: 'Ukraine', era: 'modern',
  dims: { widthM: 3.66, heightM: 2.44, hullLengthM: 7.93, overallLengthM: 9.83 },
  armor: { turretless: false },
};
const uaCargo = decorManifestFor(uaM1A1, () => 0.5);
assert.equal(uaCargo.length, 1, 'Ukrainian M1A1 generic decor is reduced to one useful cargo item');
assert.equal(uaCargo[0].kit, 'cargo');
assert.equal(uaCargo[0].v?.v, 'twin-can-cradle',
  'Ukrainian M1A1 retains only a paired gas-can cradle');
assert.ok(!uaCargo.some((row) => row.v?.v === 'folding-chair'),
  'Ukrainian M1A1 no longer receives the chair-like field prop');

console.log(`decorationsEquipment.selftest: ${FLEET_EQUIPMENT_VARIANTS.length} authored variants, `
  + `${signatures.size} geometry signatures, ${distributed.size} playable-fleet variants passed`);
