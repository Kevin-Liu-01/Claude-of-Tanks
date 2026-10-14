// nearTierShadowReach.selftest.mjs — the near tier's shadow profile (vegetation.ts updateNearTierShadowReach,
// 2026-10-13, the perf stream): the reach follows the camera every frame, the tallest near tree is recomputed only when
// the near set or a near trunk's matrix changed (nearTierHeightVersion), and every frame's profile equals the full
// recomputation. Executes the production function; checks every near-set and trunk-matrix writer bumps the version.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';

const source = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
const at = source.indexOf('  function updateNearTierShadowReach(camPos: THREE.Vector3): void {');
assert.ok(at > 0, 'the production function');
const endAt = source.indexOf('\n  }\n', at) + 4;
const fn = stripTypeScriptTypes(source.slice(at, endAt), { mode: 'strip' });
const harness = new Function('state', `
  let { speciesList, speciesHeightM, nearSlots, nearTierShadowProfile } = state;
  let nearTierHeight = 0, nearTierHeightVersion = 0, nearTierHeightAt = -1;
  ${fn}
  return { update: updateNearTierShadowReach, bump: () => { nearTierHeightVersion++; }, at: () => nearTierHeightAt };
`);

let seed = 3301;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const speciesList = ['oak', 'pine', 'birch'];
const speciesHeightM = { oak: 14, pine: 22, birch: 17 };
const nearSlots = Object.fromEntries(speciesList.map((sp) => [sp, [[], []]]));
const profile = { heightM: 0, reachM: 0 };
const h = harness({ speciesList, speciesHeightM, nearSlots, nearTierShadowProfile: profile });
const tree = () => {
  const k = 0.6 + rand() * 0.9;
  const mat = new THREE.Matrix4().compose(new THREE.Vector3((rand() - 0.5) * 600, 0, (rand() - 0.5) * 600),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6), new THREE.Vector3(k, k * (0.8 + rand() * 0.5), k));
  return { x: mat.elements[12], z: mat.elements[14], mat };
};
const all = () => speciesList.flatMap((sp) => nearSlots[sp].flatMap((slots) => slots.map((t) => [sp, t])));
const reference = (cam) => {
  let reach2 = 0, height = 0;
  for (const [sp, t] of all()) {
    const dx = t.x - cam.x, dz = t.z - cam.z;
    reach2 = Math.max(reach2, dx * dx + dz * dz);
    const e = t.mat.elements;
    height = Math.max(height, speciesHeightM[sp] * Math.hypot(e[4], e[5], e[6]));
  }
  return { reachM: Math.sqrt(reach2), heightM: height };
};
for (let i = 0; i < 400; i++) nearSlots[speciesList[i % 3]][i % 2].push(tree());
let recomputes = 0;
for (let f = 0; f < 600; f++) {
  const cam = new THREE.Vector3(Math.cos(f * 0.01) * 200, 3, Math.sin(f * 0.013) * 200);
  // the near set changes now and then (a repartition step), a trunk falls now and then: each writer bumps the version
  if (f % 37 === 0) { nearSlots.pine[f % 2].push(tree()); h.bump(); }
  if (f % 53 === 0 && nearSlots.oak[0].length) { nearSlots.oak[0].pop(); h.bump(); }
  if (f % 71 === 0) {
    const [, t] = all()[Math.floor(rand() * all().length)];
    t.mat.multiply(new THREE.Matrix4().makeScale(1, 1.6, 1)); // a re-scaled trunk (no writer does this; the version still covers it)
    h.bump();
  }
  const before = h.at();
  h.update(cam);
  if (h.at() !== before) recomputes++;
  const want = reference(cam);
  assert.equal(profile.reachM, want.reachM, `frame ${f}: the reach`);
  assert.equal(profile.heightM, want.heightM, `frame ${f}: the tallest near tree`);
}
assert.ok(recomputes < 60, `the height is recomputed on ${recomputes} of 600 frames`);

// every writer of the near set or of a near trunk's matrix bumps the version
const body = (name) => {
  const i = source.indexOf(name);
  assert.ok(i > 0, name);
  return source.slice(i, source.indexOf('\n  }', i));
};
for (const name of ['function removeFromGroup(', 'function addToGroup(']) {
  assert.match(body(name), /if \(key === 'slot'\) nearTierHeightVersion\+\+;/, `${name} bumps for a near slot`);
}
for (const name of ['function clearPartitionSlots(', 'function updateTreeCrush(', 'function resetToppled(', 'const writeCraterTree = ']) {
  assert.match(body(name), /nearTierHeightVersion\+\+;/, `${name} bumps`);
}
assert.match(body('function seedTreePartition('), /if \(tree\.near\) \{\n\s*nearTierHeightVersion\+\+;/, 'a near seed bumps');
// near slots are only ever filled or emptied by those writers
const pushes = [...source.matchAll(/nearSlots\[[^\]]+\]\[[^\]]+\]\.push\(|slots\.push\(/g)].length;
assert.equal(pushes, 3, 'slots are pushed only by addToGroup and seedTreePartition (its near and far branches)');

console.log(`nearTierShadowReach.selftest: 600 frames equal the full recomputation; the height recomputed on ${recomputes}; every writer bumps`);
