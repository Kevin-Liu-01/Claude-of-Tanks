import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { VILLAGE_BUILDERS } from './maps/villageKit.ts';
import { URBAN_BUILDERS } from './maps/urbanKit.ts';
import {
  DESTRUCTIBLE_BUILDING_TYPES, STRUCTURE_BUILDERS,
} from './maps/structureKit.ts';
import { DESTRUCTIBLE_TYPES } from './maps/inhabitKit.ts';
import { SOURCED_STRUCTURE_TYPES } from './sourcedStructureTypes.ts';
import {
  certifyStructureCollisionProfile, deriveRuntimeStructureCollisionProfile,
} from './structureCollision.ts';

const BUCKET_NAMES = [
  'plaster', 'plaster2', 'plaster3', 'stone', 'roof', 'wood', 'dark',
  'glass', 'curtain', 'straw', 'baked',
];
const STRICT_SCORE = 90;
const sourcedModels = JSON.parse(fs.readFileSync(
  new URL('./props-models.json', import.meta.url), 'utf8',
));

function buildSourcedCollisionGeometry(spec) {
  const model = sourcedModels[spec.model];
  assert.ok(model, `${spec.model}: sourced structure model exists`);
  const [minX, minY, minZ] = model.bbox.min;
  const [maxX, maxY, maxZ] = model.bbox.max;
  const scale = spec.targetH / Math.max(1e-6, maxY - minY);
  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const positions = new Float32Array(model.positions.length);
  for (let index = 0; index < positions.length; index += 3) {
    positions[index] = (model.positions[index] - centerX) * scale;
    positions[index + 1] = (model.positions[index + 1] - minY) * scale - spec.sink;
    positions[index + 2] = (model.positions[index + 2] - centerZ) * scale;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(model.indices), 1));
  return geometry;
}

function seeded(initial) {
  let state = initial >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const families = [];
let concaveFamilies = 0;
let minimumScore = Infinity;
let maximumParts = 0;

for (const seed of [0x51a7c7, 0xa1139e]) {
  for (const [id, build] of Object.entries({
    ...VILLAGE_BUILDERS,
    ...URBAN_BUILDERS,
    ...STRUCTURE_BUILDERS,
  })) {
    const buckets = Object.fromEntries(BUCKET_NAMES.map((name) => [name, []]));
    build(seeded(seed), buckets, 'plaster');
    const profile = deriveRuntimeStructureCollisionProfile(buckets);
    const certification = certifyStructureCollisionProfile(buckets, profile);
    maximumParts = Math.max(maximumParts, profile.contact.parts.length);
    assert.ok(profile.shell.length >= 1, `${id}: roof/wall shell bands are registered`);
    for (const band of profile.shell) {
      assert.ok(band.parts.length >= 1, `${id}: occupied shell band has collision geometry`);
      maximumParts = Math.max(maximumParts, band.parts.length);
    }
    assert.ok(certification.minimumScore > STRICT_SCORE,
      `${id}: source-triangle certification scores above ${STRICT_SCORE}/100`);
    if (profile.contact.parts.length > 1) concaveFamilies++;
    minimumScore = Math.min(minimumScore, certification.minimumScore);
    families.push(id);
  }

  for (const [id, meta] of Object.entries(DESTRUCTIBLE_BUILDING_TYPES)) {
    const buckets = { baked: [meta.build(seeded(seed))] };
    const profile = deriveRuntimeStructureCollisionProfile(buckets);
    const certification = certifyStructureCollisionProfile(buckets, profile);
    maximumParts = Math.max(
      maximumParts, profile.contact.parts.length, ...profile.shell.map((band) => band.parts.length),
    );
    assert.ok(certification.minimumScore > STRICT_SCORE,
      `${id}: small-structure source-triangle certification scores above ${STRICT_SCORE}/100`);
    if (profile.contact.parts.length > 1) concaveFamilies++;
    minimumScore = Math.min(minimumScore, certification.minimumScore);
    families.push(id);
  }

  for (const [id, meta] of Object.entries(DESTRUCTIBLE_TYPES)) {
    const buckets = { baked: [meta.build(seeded(seed))] };
    const profile = deriveRuntimeStructureCollisionProfile(buckets);
    const certification = certifyStructureCollisionProfile(buckets, profile);
    maximumParts = Math.max(
      maximumParts, profile.contact.parts.length, ...profile.shell.map((band) => band.parts.length),
    );
    assert.ok(certification.minimumScore > STRICT_SCORE,
      `${id}: small-item source-triangle certification scores above ${STRICT_SCORE}/100`);
    if (profile.contact.parts.length > 1) concaveFamilies++;
    minimumScore = Math.min(minimumScore, certification.minimumScore);
    families.push(id);
  }

  for (const [id, spec] of Object.entries(SOURCED_STRUCTURE_TYPES)) {
    const buckets = { baked: [buildSourcedCollisionGeometry(spec)] };
    const profile = deriveRuntimeStructureCollisionProfile(buckets);
    const certification = certifyStructureCollisionProfile(buckets, profile);
    maximumParts = Math.max(
      maximumParts, profile.contact.parts.length, ...profile.shell.map((band) => band.parts.length),
    );
    assert.ok(certification.minimumScore > STRICT_SCORE,
      `${id}: sourced-structure source-triangle certification scores above ${STRICT_SCORE}/100`);
    assert.ok(profile.contact.parts.length <= 64,
      `${id}: sourced-structure contact stays bounded for runtime narrow-phase work`);
    minimumScore = Math.min(minimumScore, certification.minimumScore);
    families.push(id);
  }
}

assert.equal(new Set(families).size, 111,
  'all 111 heavyweight, site, small-building, blocking-item and sourced families are audited');
assert.ok(concaveFamilies >= 60,
  'open, stepped and recessed structures/items retain compound contact footprints across both variants');
assert.ok(maximumParts <= 64, 'compound shell bands stay bounded for runtime narrow-phase work');

console.log(`structureCollision.selftest: 111 families x 2 variants; minimum ${minimumScore.toFixed(1)}/100; max ${maximumParts} parts`);
