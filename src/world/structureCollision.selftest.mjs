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

// 2026-09-17: 111 → 113 with the fortification destructibles (barbedwire, bunker)
// 2026-09-19: 113 → 119 with the Mars station's six orbital destructibles
// 2026-09-24: four detailed Olympus colony facilities join the existing 119 families.
assert.equal(new Set(families).size, 123,
  'all 123 heavyweight, site, small-building, blocking-item and sourced families are audited');
assert.ok(concaveFamilies >= 60,
  'open, stepped and recessed structures/items retain compound contact footprints across both variants');
assert.ok(maximumParts <= 64, 'compound shell bands stay bounded for runtime narrow-phase work');


// (the hitbox lane, 2026-10-08; the facades lane's report on Polders' farmhouse) A wall body cut round its door and
// windows with open reveals, as the regional kits cut them, closes no section loop at any band plane through the door,
// and over the dense limit its band pieces are its faces' own projections: the walls' vertical faces project to nothing
// and the sills and lintels to zero-height slivers. Every band the walls stand in must still publish the slab — a part
// spanning the band over the footprint — or level shells cross the walls under the eaves.
function openCutHouse() {
  const W = 10, D = 7, T = 0.3, STEP = 0.5;
  const ROWS = [0, 0.5, 1, 1.15, 1.5, 2, 2.5, 3];
  const positions = [];
  const quad = (a, b, c, d) => positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  const outer = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]];
  const inner = [[-W / 2 + T, -D / 2 + T], [W / 2 - T, -D / 2 + T], [W / 2 - T, D / 2 - T], [-W / 2 + T, D / 2 - T]];
  let triangles = 0;
  for (let side = 0; side < 4; side++) {
    const [o0, o1] = [outer[side], outer[(side + 1) % 4]], [i0, i1] = [inner[side], inner[(side + 1) % 4]];
    const columns = Math.round(Math.hypot(o1[0] - o0[0], o1[1] - o0[1]) / STEP);
    const at = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    for (let c = 0; c < columns; c++) {
      const [oa, ob] = [at(o0, o1, c / columns), at(o0, o1, (c + 1) / columns)];
      const [ia, ib] = [at(i0, i1, c / columns), at(i0, i1, (c + 1) / columns)];
      const door = side === 0 && (c === 9 || c === 10);
      const window = !door && c % 4 === 1;
      const open = (y0) => (door && y0 < 2) || (window && y0 >= 1.15 && y0 < 2.5);
      for (let r = 0; r + 1 < ROWS.length; r++) {
        if (open(ROWS[r])) continue;
        const [y0, y1] = [ROWS[r], ROWS[r + 1]];
        quad([oa[0], y0, oa[1]], [ob[0], y0, ob[1]], [ob[0], y1, ob[1]], [oa[0], y1, oa[1]]);
        quad([ia[0], y0, ia[1]], [ia[0], y1, ia[1]], [ib[0], y1, ib[1]], [ib[0], y0, ib[1]]);
      }
      // the wall's foot and the openings' heads and sills: horizontal faces between the two wall faces; the coping
      // sheds its water outward (its inner edge 5 cm up), so the body is not prismatic and its bands are clipped
      const ledges = [0, ...(door ? [2] : []), ...(window ? [1.15, 2.5] : [])];
      for (const y of ledges) quad([oa[0], y, oa[1]], [ia[0], y, ia[1]], [ib[0], y, ib[1]], [ob[0], y, ob[1]]);
      quad([oa[0], 3, oa[1]], [ia[0], 3.05, ia[1]], [ib[0], 3.05, ib[1]], [ob[0], 3, ob[1]]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  triangles = positions.length / 9;
  return { geometry, triangles, footprint: W * D };
}
{
  const { geometry, triangles, footprint } = openCutHouse();
  assert.ok(triangles > 512, `the open-cut house is a dense body (${triangles} triangles)`);
  const profile = deriveRuntimeStructureCollisionProfile({ stone: [geometry] });
  const area = (points) => {
    let sum = 0;
    for (let i = 0; i < points.length; i += 2) {
      const j = (i + 2) % points.length;
      sum += points[i] * points[j + 1] - points[j] * points[i + 1];
    }
    return Math.abs(sum) / 2;
  };
  let walls = 0;
  for (const band of profile.shell) {
    if (band.minY < 0 || band.maxY > 3 + 1e-6) continue;
    walls++;
    const slab = band.parts.filter((part) => part.kind === 'convex' && part.y1 - part.y0 >= 0.5 * (band.maxY - band.minY));
    assert.ok(slab.some((part) => area(part.points) >= 0.95 * footprint),
      `open-cut house band ${band.minY}..${band.maxY}: a part spans the band over the footprint (${band.parts.length} parts, `
      + `${slab.length} spanning)`);
  }
  assert.ok(walls >= 1, 'the open-cut house has wall bands');
}

console.log(`structureCollision.selftest: 111 families x 2 variants; minimum ${minimumScore.toFixed(1)}/100; max ${maximumParts} parts`);
